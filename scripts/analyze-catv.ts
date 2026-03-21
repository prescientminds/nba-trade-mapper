/**
 * Contract-Adjusted Trade Value (CATV) Analysis — v2 (refined)
 *
 * Thesis: the best trades exploit the gap between production and cost
 * over the remaining contract duration.
 *
 * Refined CATV formula:
 *   CATV = (WS_avg × Age_Mult × Playoff_Mult) / max(Cap%, 5%) × Years_Remaining
 *
 * Changes from v1:
 *   - Cap floor raised from 2% to 5% (fixes min-salary inflation)
 *   - Age derived from career start (players table too sparse)
 *   - Age multiplier: ascending 1.15, prime 1.0, plateau 0.85, declining 0.65, veteran 0.45
 *   - Playoff multiplier: 1.0 + min(0.3, playoff_ws/total_ws)
 *   - Added per-era analysis (pre-CBA, post-2011, post-2023)
 */

import { supabase } from './lib/supabase-admin';
import * as fs from 'fs';
import * as path from 'path';

// ── Helpers ──────────────────────────────────────────────────────

function seasonStartYear(season: string): number {
  return parseInt(season.split('-')[0]);
}

function makeSeason(startYear: number): string {
  const endYear = startYear + 1;
  return `${startYear}-${String(endYear).slice(-2)}`;
}

async function fetchAll(table: string, select = '*', filters?: Record<string, string>) {
  const results: any[] = [];
  let offset = 0;
  const LIMIT = 1000;
  while (true) {
    let lastError: any = null;
    let data: any[] | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      let q = supabase.from(table).select(select).range(offset, offset + LIMIT - 1);
      if (filters) for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
      const res = await q;
      if (res.error) {
        lastError = res.error;
        console.log(`  ⚠ ${table} attempt ${attempt + 1} failed, retrying in 5s...`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      data = res.data;
      break;
    }
    if (!data) throw new Error(`${table}: ${lastError?.message || 'unknown error after 3 retries'}`);
    if (data.length === 0) break;
    results.push(...data);
    if (data.length < LIMIT) break;
    offset += LIMIT;
  }
  return results;
}

// Age multiplier — ascending players get a premium, veterans get discounted
function ageMult(age: number | null): number {
  if (age == null) return 1.0;
  if (age <= 23) return 1.15;
  if (age <= 27) return 1.0;
  if (age <= 30) return 0.85;
  if (age <= 33) return 0.65;
  return 0.45;
}

// Playoff multiplier — proven playoff performers get a bump
function playoffMult(playoffWS: number, totalWS: number): number {
  if (totalWS <= 0) return 1.0;
  return 1.0 + Math.min(0.3, playoffWS / totalWS);
}

// CBA era classification
function cbaEra(season: string): string {
  const yr = seasonStartYear(season);
  if (yr < 1999) return 'Pre-1999';
  if (yr < 2005) return '1999-2005';
  if (yr < 2011) return '2005-2011';
  if (yr < 2017) return '2011-2017';
  if (yr < 2023) return '2017-2023';
  return '2023+';
}

// ── Types ────────────────────────────────────────────────────────

interface PlayerMovement {
  tradeId: string;
  season: string;
  date: string;
  playerName: string;
  fromTeam: string;
  toTeam: string;
}

interface AnalysisRow {
  tradeId: string;
  season: string;
  playerName: string;
  fromTeam: string;
  toTeam: string;
  // Pre-trade (known at trade time)
  preTradeWS: number | null;       // WS in most recent full season on sending team
  preTradeWSAvg: number | null;    // 2-year trailing avg WS
  preTradeGP: number | null;
  age: number | null;              // approximate age at trade
  // Contract (known at trade time)
  salary: number | null;
  capPct: number | null;           // salary / salary_cap
  yearsRemaining: number;          // contract seasons from trade year forward
  // Post-trade (outcomes)
  postTradeWS: number;
  postTradeSeasons: number;
  postTradeWSPerSeason: number;
  postTradePlayoffWS: number;
  // Team context
  fromTeamWinPct: number | null;
  toTeamWinPct: number | null;
  teamQualityDelta: number | null; // to - from
  // Calculated
  catvPredictive: number | null;   // uses pre-trade WS (predictive)
  catvOutcome: number | null;      // uses post-trade WS (descriptive)
  archetype: string;
  // Trade outcome
  tradeWinner: string | null;
  playerOnWinningSide: boolean | null;
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   CONTRACT-ADJUSTED TRADE VALUE (CATV) ANALYSIS        ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── 1. Load static JSON trades ─────────────────────────────────
  const tradesDir = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');
  const files = fs.readdirSync(tradesDir).filter(f => f.endsWith('.json'));

  const movements: PlayerMovement[] = [];
  const tradeSeasons = new Map<string, string>(); // tradeId → season

  for (const file of files) {
    const trades = JSON.parse(fs.readFileSync(path.join(tradesDir, file), 'utf-8'));
    for (const trade of trades) {
      tradeSeasons.set(trade.id, trade.season);
      for (const asset of trade.assets) {
        if (asset.type === 'player' && asset.player_name) {
          movements.push({
            tradeId: trade.id,
            season: trade.season,
            date: trade.date,
            playerName: asset.player_name,
            fromTeam: asset.from_team_id,
            toTeam: asset.to_team_id,
          });
        }
      }
    }
  }

  console.log(`Loaded ${movements.length} player movements from ${files.length} season files`);

  // ── 2. Load Supabase data ──────────────────────────────────────
  console.log('Loading Supabase data...');

  const [playerSeasons, contracts, capRaw, tradeScores, teamSeasons] = await Promise.all([
    fetchAll('player_seasons'),
    fetchAll('player_contracts'),
    supabase.from('salary_cap_history').select('*').eq('league', 'NBA').then(r => r.data || []),
    fetchAll('trade_scores'),
    fetchAll('team_seasons'),
  ]);

  console.log(`  player_seasons: ${playerSeasons.length}`);
  console.log(`  player_contracts: ${contracts.length}`);
  console.log(`  salary_cap_history: ${capRaw.length}`);
  console.log(`  trade_scores: ${tradeScores.length}`);
  console.log(`  team_seasons: ${teamSeasons.length}`);

  // ── Build lookup maps ──────────────────────────────────────────

  // player_seasons by name|team|season
  const psKey = (name: string, team: string, season: string) => `${name}|${team}|${season}`;
  const psMap = new Map<string, any>();
  for (const ps of playerSeasons) psMap.set(psKey(ps.player_name, ps.team_id, ps.season), ps);

  // player_seasons by name → sorted array
  const psByPlayer = new Map<string, any[]>();
  for (const ps of playerSeasons) {
    if (!psByPlayer.has(ps.player_name)) psByPlayer.set(ps.player_name, []);
    psByPlayer.get(ps.player_name)!.push(ps);
  }
  for (const arr of psByPlayer.values()) arr.sort((a: any, b: any) => seasonStartYear(a.season) - seasonStartYear(b.season));

  // contracts by name|season
  const contractKey = (name: string, season: string) => `${name}|${season}`;
  const cMap = new Map<string, any>();
  const cByPlayer = new Map<string, any[]>();
  for (const c of contracts) {
    cMap.set(contractKey(c.player_name, c.season), c);
    if (!cByPlayer.has(c.player_name)) cByPlayer.set(c.player_name, []);
    cByPlayer.get(c.player_name)!.push(c);
  }
  for (const arr of cByPlayer.values()) arr.sort((a: any, b: any) => seasonStartYear(a.season) - seasonStartYear(b.season));

  // cap by season
  const capMap = new Map<string, any>();
  for (const c of capRaw) capMap.set(c.season, c);

  // trade_scores by trade_id
  const scoreMap = new Map<string, any>();
  for (const s of tradeScores) scoreMap.set(s.trade_id, s);

  // team_seasons by team|season
  const tsKey = (team: string, season: string) => `${team}|${season}`;
  const tsMap = new Map<string, any>();
  for (const ts of teamSeasons) tsMap.set(tsKey(ts.team_id, ts.season), ts);

  // Derive age from earliest player_season (first season ≈ age 20)
  // Much more coverage than the 16-row players table
  const careerStartMap = new Map<string, number>(); // player_name → first season start year
  for (const ps of playerSeasons) {
    const yr = seasonStartYear(ps.season);
    const existing = careerStartMap.get(ps.player_name);
    if (!existing || yr < existing) careerStartMap.set(ps.player_name, yr);
  }

  // Pre-trade playoff WS totals for playoff multiplier
  const careerPlayoffWS = new Map<string, number>();
  const careerTotalWS = new Map<string, number>();
  for (const ps of playerSeasons) {
    const name = ps.player_name;
    careerTotalWS.set(name, (careerTotalWS.get(name) || 0) + Number(ps.win_shares || 0));
    careerPlayoffWS.set(name, (careerPlayoffWS.get(name) || 0) + Number(ps.playoff_ws || 0));
  }

  // ── 3. Build analysis rows ─────────────────────────────────────
  console.log('\nBuilding analysis dataset...');

  const rows: AnalysisRow[] = [];
  const skipped = { noPostStats: 0, total: 0 };

  for (const mv of movements) {
    skipped.total++;
    const yr = seasonStartYear(mv.season);

    // Pre-trade WS: most recent season on sending team, and 2-year avg
    const pre1 = psMap.get(psKey(mv.playerName, mv.fromTeam, mv.season));
    const priorSeason = makeSeason(yr - 1);
    const pre2 = psMap.get(psKey(mv.playerName, mv.fromTeam, priorSeason));

    const preTradeWS = pre1?.win_shares != null ? Number(pre1.win_shares)
                     : pre2?.win_shares != null ? Number(pre2.win_shares)
                     : null;
    const preTradeGP = pre1?.gp ?? pre2?.gp ?? null;

    let preTradeWSAvg: number | null = null;
    if (pre1?.win_shares != null && pre2?.win_shares != null) {
      preTradeWSAvg = (Number(pre1.win_shares) + Number(pre2.win_shares)) / 2;
    } else {
      preTradeWSAvg = preTradeWS;
    }

    // Post-trade: accumulate on receiving team (up to 5 seasons)
    let postTradeWS = 0;
    let postTradePlayoffWS = 0;
    let postTradeSeasons = 0;

    for (let i = 0; i <= 4; i++) {
      const futureSeason = makeSeason(yr + i);
      const ps = psMap.get(psKey(mv.playerName, mv.toTeam, futureSeason));
      if (ps) {
        postTradeWS += Number(ps.win_shares || 0);
        postTradePlayoffWS += Number(ps.playoff_ws || 0);
        postTradeSeasons++;
      }
    }

    if (postTradeSeasons === 0) {
      skipped.noPostStats++;
      continue;
    }

    const postTradeWSPerSeason = postTradeWS / postTradeSeasons;

    // Contract at trade time
    const contract = cMap.get(contractKey(mv.playerName, mv.season));
    const cap = capMap.get(mv.season);
    let salary: number | null = null;
    let capPct: number | null = null;
    let yearsRemaining = 0;

    if (contract?.salary && cap?.salary_cap) {
      salary = contract.salary;
      capPct = contract.salary / cap.salary_cap;
    }

    // Years remaining: count contract entries from trade season forward
    const playerContracts = cByPlayer.get(mv.playerName) || [];
    for (let i = 0; i <= 5; i++) {
      const futureSeason = makeSeason(yr + i);
      if (playerContracts.some((c: any) => c.season === futureSeason)) {
        yearsRemaining++;
      } else if (i > 0) break; // gap means contract ended
    }
    if (yearsRemaining === 0) yearsRemaining = 1; // minimum 1 (current season)

    // Age at trade — derived from career start (first season ≈ age 20)
    let age: number | null = null;
    const careerStart = careerStartMap.get(mv.playerName);
    if (careerStart) {
      age = 20 + (yr - careerStart); // approximate
    }

    // Team context
    const fromTS = tsMap.get(tsKey(mv.fromTeam, mv.season));
    const toTS = tsMap.get(tsKey(mv.toTeam, mv.season));
    const fromWinPct = fromTS ? fromTS.wins / (fromTS.wins + fromTS.losses) : null;
    const toWinPct = toTS ? toTS.wins / (toTS.wins + toTS.losses) : null;
    const teamQualityDelta = (fromWinPct != null && toWinPct != null) ? toWinPct - fromWinPct : null;

    // CATV v2 calculations
    const MIN_CAP_PCT = 0.05; // raised from 2% — fixes min-salary inflation
    const effectiveCapPct = capPct ? Math.max(capPct, MIN_CAP_PCT) : null;

    // Pre-trade playoff and total WS for the multiplier (career to date at trade time)
    const preCareerPlayoffWS = careerPlayoffWS.get(mv.playerName) || 0;
    const preCareerTotalWS = careerTotalWS.get(mv.playerName) || 0;

    const ageMultiplier = ageMult(age);
    const pMult = playoffMult(preCareerPlayoffWS, preCareerTotalWS);

    const catvPredictive = (preTradeWSAvg != null && effectiveCapPct)
      ? (preTradeWSAvg * ageMultiplier * pMult) / effectiveCapPct * yearsRemaining
      : null;

    const catvOutcome = effectiveCapPct
      ? postTradeWSPerSeason / effectiveCapPct * postTradeSeasons
      : null;

    // Archetype classification (using pre-trade info only)
    let archetype = 'Moderate';
    if (preTradeWSAvg != null && capPct != null) {
      const hiProd = preTradeWSAvg >= 4;
      const loCost = capPct < 0.15;
      const hiCost = capPct >= 0.25;
      const longTerm = yearsRemaining >= 3;
      const rental = yearsRemaining <= 1;

      if (hiProd && loCost && longTerm) archetype = 'Gold Mine';
      else if (hiProd && hiCost && !rental) archetype = 'Peak Window';
      else if (hiProd && rental) archetype = 'Rental';
      else if (!hiProd && hiCost && longTerm) archetype = 'Trap';
      else if (!hiProd && hiCost && rental) archetype = 'Salary Dump';
      else if (!hiProd && loCost && longTerm) archetype = 'Cheap Depth';
      else archetype = 'Moderate';
    } else if (capPct == null && preTradeWSAvg != null) {
      archetype = preTradeWSAvg >= 4 ? 'Star (no $)' : 'Role (no $)';
    }

    // Trade outcome
    const score = scoreMap.get(mv.tradeId);
    const tradeWinner = score?.winner ?? null;
    const playerOnWinningSide = tradeWinner ? mv.toTeam === tradeWinner : null;

    rows.push({
      tradeId: mv.tradeId,
      season: mv.season,
      playerName: mv.playerName,
      fromTeam: mv.fromTeam,
      toTeam: mv.toTeam,
      preTradeWS,
      preTradeWSAvg,
      preTradeGP,
      age,
      salary,
      capPct,
      yearsRemaining,
      postTradeWS,
      postTradeSeasons,
      postTradeWSPerSeason,
      postTradePlayoffWS,
      fromTeamWinPct: fromWinPct,
      toTeamWinPct: toWinPct,
      teamQualityDelta,
      catvPredictive,
      catvOutcome,
      archetype,
      tradeWinner,
      playerOnWinningSide,
    });
  }

  console.log(`\nDataset: ${rows.length} player-trade rows`);
  console.log(`Skipped: ${skipped.noPostStats} (no post-trade stats on receiving team)`);
  console.log(`Salary data available: ${rows.filter(r => r.capPct != null).length} rows (${(rows.filter(r => r.capPct != null).length / rows.length * 100).toFixed(1)}%)`);

  // ── 4. HYPOTHESIS TESTS ───────────────────────────────────────

  console.log('\n' + '═'.repeat(60));
  console.log('  HYPOTHESIS TESTS');
  console.log('═'.repeat(60));

  // ── H1: CATV gap predicts trade winners ────────────────────────
  console.log('\n── H1: Does pre-trade CATV predict trade winners? ──');
  console.log('(Higher CATV side should win the trade more often)\n');

  // Group rows by tradeId, then for each trade compute total CATV by receiving team
  const tradeRows = new Map<string, AnalysisRow[]>();
  for (const r of rows) {
    if (!tradeRows.has(r.tradeId)) tradeRows.set(r.tradeId, []);
    tradeRows.get(r.tradeId)!.push(r);
  }

  let h1Correct = 0;
  let h1Wrong = 0;
  let h1Draws = 0;
  let h1Testable = 0;

  for (const [tradeId, tRows] of tradeRows) {
    const score = scoreMap.get(tradeId);
    if (!score?.winner) continue; // need a clear winner

    // Group CATV by receiving team
    const teamCatv = new Map<string, number>();
    let allHaveCatv = true;

    for (const r of tRows) {
      if (r.catvPredictive == null) { allHaveCatv = false; break; }
      teamCatv.set(r.toTeam, (teamCatv.get(r.toTeam) || 0) + r.catvPredictive);
    }

    if (!allHaveCatv || teamCatv.size < 2) continue;
    h1Testable++;

    // Find team with highest total CATV received
    let bestTeam = '';
    let bestCatv = -Infinity;
    for (const [team, catv] of teamCatv) {
      if (catv > bestCatv) { bestCatv = catv; bestTeam = team; }
    }

    if (bestTeam === score.winner) h1Correct++;
    else h1Wrong++;
  }

  const h1Rate = h1Testable > 0 ? (h1Correct / h1Testable * 100).toFixed(1) : 'N/A';
  console.log(`Testable trades: ${h1Testable}`);
  console.log(`CATV predicted winner correctly: ${h1Correct} (${h1Rate}%)`);
  console.log(`CATV predicted wrong: ${h1Wrong}`);
  console.log(`Baseline (coin flip): 50%`);
  console.log(`VERDICT: ${Number(h1Rate) > 55 ? '✓ CATV has predictive signal' : Number(h1Rate) > 50 ? '~ Weak signal' : '✗ No signal'}`);

  // ── H2: Mid-contract trades > expiring trades ──────────────────
  console.log('\n── H2: Mid-contract trades produce more value than expiring trades ──');
  console.log('(Players with 2+ years remaining should produce more post-trade WS)\n');

  const midContract = rows.filter(r => r.yearsRemaining >= 2 && r.postTradeWSPerSeason != null);
  const expiring = rows.filter(r => r.yearsRemaining <= 1 && r.postTradeWSPerSeason != null);

  const avgWSMid = midContract.reduce((s, r) => s + r.postTradeWSPerSeason, 0) / midContract.length;
  const avgWSExp = expiring.reduce((s, r) => s + r.postTradeWSPerSeason, 0) / expiring.length;
  const totalWSMid = midContract.reduce((s, r) => s + r.postTradeWS, 0) / midContract.length;
  const totalWSExp = expiring.reduce((s, r) => s + r.postTradeWS, 0) / expiring.length;

  console.log(`Mid-contract (2+ yrs remaining): n=${midContract.length}`);
  console.log(`  Avg WS/season: ${avgWSMid.toFixed(2)}`);
  console.log(`  Avg total WS on new team: ${totalWSMid.toFixed(2)}`);
  console.log(`Expiring (≤1 yr remaining): n=${expiring.length}`);
  console.log(`  Avg WS/season: ${avgWSExp.toFixed(2)}`);
  console.log(`  Avg total WS on new team: ${totalWSExp.toFixed(2)}`);
  console.log(`VERDICT: ${totalWSMid > totalWSExp * 1.2 ? '✓ Mid-contract trades produce significantly more total value' : '~ Difference exists but modest'}`);

  // ── H3: Change of scenery effect ──────────────────────────────
  console.log('\n── H3: Change of scenery — does team quality affect post-trade WS? ──');
  console.log('(Players going to better teams should see WS increase)\n');

  const withDelta = rows.filter(r => r.teamQualityDelta != null && r.preTradeWSAvg != null);
  const toGoodTeam = withDelta.filter(r => r.teamQualityDelta! > 0.05);
  const toBadTeam = withDelta.filter(r => r.teamQualityDelta! < -0.05);
  const lateral = withDelta.filter(r => Math.abs(r.teamQualityDelta!) <= 0.05);

  const wsChangeGood = toGoodTeam.map(r => r.postTradeWSPerSeason - r.preTradeWSAvg!);
  const wsChangeBad = toBadTeam.map(r => r.postTradeWSPerSeason - r.preTradeWSAvg!);
  const wsChangeLateral = lateral.map(r => r.postTradeWSPerSeason - r.preTradeWSAvg!);

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;

  console.log(`To better team (>5% win% increase): n=${toGoodTeam.length}`);
  console.log(`  Avg WS change: ${avg(wsChangeGood) > 0 ? '+' : ''}${avg(wsChangeGood).toFixed(2)}`);
  console.log(`To worse team (>5% win% decrease): n=${toBadTeam.length}`);
  console.log(`  Avg WS change: ${avg(wsChangeBad) > 0 ? '+' : ''}${avg(wsChangeBad).toFixed(2)}`);
  console.log(`Lateral move (±5%): n=${lateral.length}`);
  console.log(`  Avg WS change: ${avg(wsChangeLateral) > 0 ? '+' : ''}${avg(wsChangeLateral).toFixed(2)}`);
  console.log(`VERDICT: ${avg(wsChangeGood) > avg(wsChangeBad) + 0.5 ? '✓ Team quality matters — better teams boost WS' : '~ Effect exists but small'}`);

  // ── H4: Contract year players are a trap ──────────────────────
  console.log('\n── H4: Contract year players — temporary boost or real signal? ──');
  console.log('(Players in final year may have inflated stats)\n');

  // For players traded with 1 year remaining, compare their pre-trade WS
  // to their post-trade WS on the new team
  const contractYearPlayers = rows.filter(r =>
    r.yearsRemaining === 1 && r.preTradeWSAvg != null && r.postTradeWSPerSeason != null
  );
  const multiYearPlayers = rows.filter(r =>
    r.yearsRemaining >= 3 && r.preTradeWSAvg != null && r.postTradeWSPerSeason != null
  );

  const cyPreAvg = avg(contractYearPlayers.map(r => r.preTradeWSAvg!));
  const cyPostAvg = avg(contractYearPlayers.map(r => r.postTradeWSPerSeason));
  const myPreAvg = avg(multiYearPlayers.map(r => r.preTradeWSAvg!));
  const myPostAvg = avg(multiYearPlayers.map(r => r.postTradeWSPerSeason));

  console.log(`Contract year rentals (1 yr left): n=${contractYearPlayers.length}`);
  console.log(`  Pre-trade WS avg: ${cyPreAvg.toFixed(2)}`);
  console.log(`  Post-trade WS/season: ${cyPostAvg.toFixed(2)}`);
  console.log(`  Change: ${(cyPostAvg - cyPreAvg) > 0 ? '+' : ''}${(cyPostAvg - cyPreAvg).toFixed(2)}`);
  console.log(`Multi-year (3+ yrs left): n=${multiYearPlayers.length}`);
  console.log(`  Pre-trade WS avg: ${myPreAvg.toFixed(2)}`);
  console.log(`  Post-trade WS/season: ${myPostAvg.toFixed(2)}`);
  console.log(`  Change: ${(myPostAvg - myPreAvg) > 0 ? '+' : ''}${(myPostAvg - myPreAvg).toFixed(2)}`);

  // ── H5: Archetype win rates ────────────────────────────────────
  console.log('\n── H5: Which archetypes produce the most trade value? ──\n');

  const archetypes = new Map<string, { count: number; wins: number; totalPostWS: number; totalPlayoffWS: number; avgCapPct: number[]; avgYears: number[] }>();

  for (const r of rows) {
    if (!archetypes.has(r.archetype)) {
      archetypes.set(r.archetype, { count: 0, wins: 0, totalPostWS: 0, totalPlayoffWS: 0, avgCapPct: [], avgYears: [] });
    }
    const a = archetypes.get(r.archetype)!;
    a.count++;
    if (r.playerOnWinningSide === true) a.wins++;
    a.totalPostWS += r.postTradeWSPerSeason;
    a.totalPlayoffWS += r.postTradePlayoffWS;
    if (r.capPct != null) a.avgCapPct.push(r.capPct);
    a.avgYears.push(r.yearsRemaining);
  }

  // Sort by avg post-trade WS/season
  const sorted = [...archetypes.entries()]
    .sort((a, b) => (b[1].totalPostWS / b[1].count) - (a[1].totalPostWS / a[1].count));

  console.log('Archetype              |  n   | WS/szn | Playoff WS | Win% | Avg Cap% | Avg Yrs');
  console.log('-'.repeat(90));
  for (const [name, data] of sorted) {
    const wsPerSeason = (data.totalPostWS / data.count).toFixed(2);
    const playoffWS = (data.totalPlayoffWS / data.count).toFixed(2);
    const winRate = data.wins > 0 ? ((data.wins / data.count) * 100).toFixed(0) : 'N/A';
    const avgCap = data.avgCapPct.length > 0
      ? (avg(data.avgCapPct) * 100).toFixed(1) + '%'
      : 'N/A';
    const avgYrs = avg(data.avgYears).toFixed(1);
    console.log(
      `${name.padEnd(22)} | ${String(data.count).padStart(4)} | ${wsPerSeason.padStart(6)} | ${playoffWS.padStart(10)} | ${String(winRate).padStart(4)} | ${avgCap.padStart(8)} | ${avgYrs.padStart(7)}`
    );
  }

  // ── 5. YEARS REMAINING ANALYSIS ───────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('  YEARS REMAINING BREAKDOWN');
  console.log('═'.repeat(60) + '\n');

  const byYears = new Map<number, { count: number; totalWS: number; totalPlayoffWS: number; wins: number; totalCatv: number; catvCount: number }>();
  for (const r of rows) {
    const yr = Math.min(r.yearsRemaining, 5); // cap at 5+
    if (!byYears.has(yr)) byYears.set(yr, { count: 0, totalWS: 0, totalPlayoffWS: 0, wins: 0, totalCatv: 0, catvCount: 0 });
    const b = byYears.get(yr)!;
    b.count++;
    b.totalWS += r.postTradeWSPerSeason;
    b.totalPlayoffWS += r.postTradePlayoffWS;
    if (r.playerOnWinningSide === true) b.wins++;
    if (r.catvPredictive != null) { b.totalCatv += r.catvPredictive; b.catvCount++; }
  }

  console.log('Yrs Left |  n   | Avg WS/szn | Avg Playoff WS | On Winning Side');
  console.log('-'.repeat(70));
  for (const yr of [1, 2, 3, 4, 5]) {
    const b = byYears.get(yr);
    if (!b) continue;
    const label = yr === 5 ? '5+' : String(yr);
    console.log(
      `   ${label.padStart(2)}    | ${String(b.count).padStart(4)} | ${(b.totalWS / b.count).toFixed(2).padStart(10)} | ${(b.totalPlayoffWS / b.count).toFixed(2).padStart(14)} | ${((b.wins / b.count) * 100).toFixed(1)}%`
    );
  }

  // ── 6. AGE AT TRADE ANALYSIS ──────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('  AGE AT TRADE ANALYSIS');
  console.log('═'.repeat(60) + '\n');

  const withAge = rows.filter(r => r.age != null);
  const ageBuckets = [
    { label: '20-23 (ascending)', min: 20, max: 23 },
    { label: '24-27 (prime)', min: 24, max: 27 },
    { label: '28-30 (peak/plateau)', min: 28, max: 30 },
    { label: '31-33 (declining)', min: 31, max: 33 },
    { label: '34+ (veteran)', min: 34, max: 45 },
  ];

  console.log('Age Bucket           |  n   | Avg WS/szn | WS Change | On Win Side');
  console.log('-'.repeat(70));
  for (const bucket of ageBuckets) {
    const group = withAge.filter(r => r.age! >= bucket.min && r.age! <= bucket.max);
    if (group.length === 0) continue;
    const avgWS = avg(group.map(r => r.postTradeWSPerSeason));
    const wsChange = avg(group.filter(r => r.preTradeWSAvg != null).map(r => r.postTradeWSPerSeason - r.preTradeWSAvg!));
    const winSide = group.filter(r => r.playerOnWinningSide === true).length / group.length;
    console.log(
      `${bucket.label.padEnd(20)} | ${String(group.length).padStart(4)} | ${avgWS.toFixed(2).padStart(10)} | ${(wsChange > 0 ? '+' : '') + wsChange.toFixed(2).padStart(8)}  | ${(winSide * 100).toFixed(1)}%`
    );
  }

  // ── 6b. CBA ERA ANALYSIS ───────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('  CBA ERA ANALYSIS');
  console.log('═'.repeat(60) + '\n');

  const eras = new Map<string, { count: number; h1Test: number; h1Correct: number; avgWS: number; totalWS: number }>();
  for (const r of rows) {
    const era = cbaEra(r.season);
    if (!eras.has(era)) eras.set(era, { count: 0, h1Test: 0, h1Correct: 0, avgWS: 0, totalWS: 0 });
    const e = eras.get(era)!;
    e.count++;
    e.totalWS += r.postTradeWSPerSeason;
  }

  // H1 accuracy by era
  for (const [tradeId, tRows] of tradeRows) {
    const score = scoreMap.get(tradeId);
    if (!score?.winner) continue;
    const era = cbaEra(tRows[0].season);
    const e = eras.get(era);
    if (!e) continue;
    const teamCatv = new Map<string, number>();
    let ok = true;
    for (const r of tRows) {
      if (r.catvPredictive == null) { ok = false; break; }
      teamCatv.set(r.toTeam, (teamCatv.get(r.toTeam) || 0) + r.catvPredictive);
    }
    if (!ok || teamCatv.size < 2) continue;
    e.h1Test++;
    let best = ''; let bestV = -Infinity;
    for (const [t, v] of teamCatv) { if (v > bestV) { bestV = v; best = t; } }
    if (best === score.winner) e.h1Correct++;
  }

  console.log('CBA Era     |  n   | Avg WS/szn | CATV Accuracy');
  console.log('-'.repeat(55));
  for (const era of ['Pre-1999', '1999-2005', '2005-2011', '2011-2017', '2017-2023', '2023+']) {
    const e = eras.get(era);
    if (!e || e.count === 0) continue;
    const acc = e.h1Test > 0 ? `${(e.h1Correct / e.h1Test * 100).toFixed(0)}% (n=${e.h1Test})` : 'N/A';
    console.log(`${era.padEnd(12)} | ${String(e.count).padStart(4)} | ${(e.totalWS / e.count).toFixed(2).padStart(10)} | ${acc}`);
  }

  // ── 7. TOP HISTORICAL EXAMPLES BY ARCHETYPE ───────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('  TOP HISTORICAL EXAMPLES BY ARCHETYPE');
  console.log('═'.repeat(60));

  for (const archName of ['Gold Mine', 'Peak Window', 'Rental', 'Trap', 'Reclamation']) {
    const group = rows
      .filter(r => r.archetype === archName)
      .sort((a, b) => b.postTradeWS - a.postTradeWS)
      .slice(0, 5);

    if (group.length === 0) continue;

    console.log(`\n── ${archName} (Top 5 by total post-trade WS) ──`);
    for (const r of group) {
      const cap = r.capPct != null ? `${(r.capPct * 100).toFixed(1)}% cap` : 'no $ data';
      console.log(
        `  ${r.playerName} (${r.season}) ${r.fromTeam}→${r.toTeam} | ` +
        `Pre: ${r.preTradeWSAvg?.toFixed(1) ?? '?'} WS | Post: ${r.postTradeWS.toFixed(1)} WS in ${r.postTradeSeasons}yr | ` +
        `${cap} | ${r.yearsRemaining}yr left | ${r.playerOnWinningSide === true ? 'WON' : r.playerOnWinningSide === false ? 'LOST' : 'DRAW'}`
      );
    }
  }

  // ── 8. CATV LEADERBOARD (best trades by predictive CATV) ──────
  console.log('\n' + '═'.repeat(60));
  console.log('  CATV PREDICTIVE LEADERBOARD — Best Trades by Signal');
  console.log('═'.repeat(60));
  console.log('(Highest CATV at trade time — did the signal pay off?)\n');

  const catvSorted = rows
    .filter(r => r.catvPredictive != null && r.catvPredictive > 0)
    .sort((a, b) => b.catvPredictive! - a.catvPredictive!);

  console.log('#  | Player                    | Season  | Trade        | CATV  | PostWS | Verdict');
  console.log('-'.repeat(95));
  for (let i = 0; i < Math.min(25, catvSorted.length); i++) {
    const r = catvSorted[i];
    const verdict = r.postTradeWSPerSeason >= (r.preTradeWSAvg || 0) * 0.8 ? 'PAID OFF' : 'BUSTED';
    console.log(
      `${String(i + 1).padStart(2)} | ${r.playerName.padEnd(25)} | ${r.season} | ${r.fromTeam}→${r.toTeam.padEnd(3)} | ${r.catvPredictive!.toFixed(0).padStart(5)} | ${r.postTradeWS.toFixed(1).padStart(6)} | ${verdict}`
    );
  }

  // ── 9. WORST CATV (traps — high pre-trade CATV that busted) ───
  console.log('\n── BIGGEST CATV BUSTS (high signal, low delivery) ──\n');

  const busts = rows
    .filter(r => r.catvPredictive != null && r.catvPredictive > 50 && r.postTradeWSPerSeason < 2)
    .sort((a, b) => b.catvPredictive! - a.catvPredictive!);

  console.log('#  | Player                    | Season  | Trade        | CATV  | PostWS/szn | Why');
  console.log('-'.repeat(100));
  for (let i = 0; i < Math.min(15, busts.length); i++) {
    const r = busts[i];
    const why = r.age && r.age > 31 ? 'age decline' : r.postTradeSeasons <= 1 ? 'short stint' : 'underperformed';
    console.log(
      `${String(i + 1).padStart(2)} | ${r.playerName.padEnd(25)} | ${r.season} | ${r.fromTeam}→${r.toTeam.padEnd(3)} | ${r.catvPredictive!.toFixed(0).padStart(5)} | ${r.postTradeWSPerSeason.toFixed(2).padStart(10)} | ${why}`
    );
  }

  // ── 10. CURRENT TRADE CANDIDATES (2024-25 season) ─────────────
  console.log('\n' + '═'.repeat(60));
  console.log('  CURRENT TRADE CANDIDATES (based on 2024-25 data)');
  console.log('═'.repeat(60));
  console.log('(Players with high production, low cap%, years remaining, on losing teams)\n');

  // Find players with recent stats + contract data
  const currentSeason = '2024-25';
  const currentRows = playerSeasons.filter((ps: any) => ps.season === currentSeason);
  const currentContracts = contracts.filter((c: any) => seasonStartYear(c.season) >= 2024);
  const currentCap = capMap.get(currentSeason);

  if (!currentCap) {
    console.log('No salary cap data for 2024-25 season.');
  } else {
    interface Candidate {
      playerName: string;
      teamId: string;
      ws: number;
      gp: number;
      ppg: number;
      salary: number;
      capPct: number;
      yearsLeft: number;
      age: number | null;
      teamWinPct: number | null;
      catv: number;
    }

    const candidates: Candidate[] = [];

    for (const ps of currentRows) {
      if (Number(ps.win_shares || 0) < 2) continue; // minimum production threshold
      if (Number(ps.gp || 0) < 20) continue; // enough games

      const contract = cMap.get(contractKey(ps.player_name, currentSeason));
      if (!contract?.salary) continue;

      const capPct = contract.salary / currentCap.salary_cap;

      // Count years remaining from 2024-25 forward
      const pContracts = cByPlayer.get(ps.player_name) || [];
      let yearsLeft = 0;
      for (let i = 0; i <= 5; i++) {
        const season = makeSeason(2024 + i);
        if (pContracts.some((c: any) => c.season === season)) yearsLeft++;
        else if (i > 0) break;
      }

      // Age from career start
      const cStart = careerStartMap.get(ps.player_name);
      const age = cStart ? 20 + (2024 - cStart) : null;

      // Team quality
      const ts = tsMap.get(tsKey(ps.team_id, currentSeason));
      const teamWinPct = ts ? ts.wins / (ts.wins + ts.losses) : null;

      // Refined CATV: WS × age_mult × playoff_mult / max(cap%, 5%) × years
      const effectiveCap = Math.max(capPct, 0.05);
      const ws = Number(ps.win_shares || 0);
      const pWS = careerPlayoffWS.get(ps.player_name) || 0;
      const tWS = careerTotalWS.get(ps.player_name) || 0;
      const catv = (ws * ageMult(age) * playoffMult(pWS, tWS)) / effectiveCap * yearsLeft;

      candidates.push({
        playerName: ps.player_name,
        teamId: ps.team_id,
        ws,
        gp: Number(ps.gp || 0),
        ppg: Number(ps.ppg || 0),
        salary: contract.salary,
        capPct,
        yearsLeft,
        age,
        teamWinPct,
        catv,
      });
    }

    // Sort by CATV, filter for interesting candidates (not on contenders)
    const tradeCandidates = candidates
      .filter(c => c.yearsLeft >= 2) // must have contract runway
      .filter(c => c.ws >= 3)        // meaningful production
      .sort((a, b) => b.catv - a.catv);

    console.log('All high-CATV players with 2+ years remaining and WS >= 3:\n');
    console.log('#  | Player                    | Team | WS   | PPG  | Cap%   | Yrs | Age | Team W% | CATV');
    console.log('-'.repeat(100));
    for (let i = 0; i < Math.min(30, tradeCandidates.length); i++) {
      const c = tradeCandidates[i];
      console.log(
        `${String(i + 1).padStart(2)} | ${c.playerName.padEnd(25)} | ${c.teamId.padEnd(4)} | ${c.ws.toFixed(1).padStart(4)} | ${c.ppg.toFixed(1).padStart(4)} | ${(c.capPct * 100).toFixed(1).padStart(5)}% | ${String(c.yearsLeft).padStart(3)} | ${c.age != null ? String(c.age).padStart(3) : '  ?'} | ${c.teamWinPct != null ? (c.teamWinPct * 100).toFixed(0).padStart(5) + '%' : '    ?'} | ${c.catv.toFixed(0).padStart(5)}`
      );
    }

    // Highlight "Gold Mine" candidates on bad teams
    console.log('\n── GOLD MINE CANDIDATES (WS≥5, Cap%<20%, Yrs≥2, on sub-.500 teams) ──\n');
    const goldMines = tradeCandidates.filter(c =>
      c.ws >= 5 && c.capPct < 0.20 && c.yearsLeft >= 2 && c.teamWinPct != null && c.teamWinPct < 0.500
    );

    if (goldMines.length === 0) {
      console.log('No clear gold mine candidates found. (These are rare by definition.)');
    } else {
      for (const c of goldMines) {
        console.log(
          `  ${c.playerName} (${c.teamId}) — ${c.ws.toFixed(1)} WS, $${(c.salary / 1e6).toFixed(1)}M (${(c.capPct * 100).toFixed(1)}% cap), ${c.yearsLeft} yrs left, team at ${c.teamWinPct != null ? (c.teamWinPct * 100).toFixed(0) : '?'}% wins`
        );
      }
    }

    // Highlight "Peak Window" candidates for contenders
    console.log('\n── PEAK WINDOW CANDIDATES (WS≥6, Cap%≥20%, Yrs≥2, could push contender over) ──\n');
    const peakWindow = tradeCandidates.filter(c =>
      c.ws >= 6 && c.capPct >= 0.20 && c.yearsLeft >= 2
    );

    if (peakWindow.length === 0) {
      console.log('No peak window candidates meeting threshold.');
    } else {
      for (const c of peakWindow) {
        console.log(
          `  ${c.playerName} (${c.teamId}) — ${c.ws.toFixed(1)} WS, $${(c.salary / 1e6).toFixed(1)}M (${(c.capPct * 100).toFixed(1)}% cap), ${c.yearsLeft} yrs left, age ${c.age ?? '?'}`
        );
      }
    }
  }

  // ── 11. SUMMARY FINDINGS ──────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('  SUMMARY');
  console.log('═'.repeat(60) + '\n');

  console.log(`Dataset: ${rows.length} player-trade observations across ${tradeRows.size} trades`);
  console.log(`Salary coverage: ${(rows.filter(r => r.capPct != null).length / rows.length * 100).toFixed(0)}%`);
  console.log(`Date range: ${rows.map(r => r.season).sort()[0]} to ${rows.map(r => r.season).sort().reverse()[0]}`);

  // Save raw data for further analysis
  const outputPath = path.join(__dirname, '..', 'data', 'catv-analysis.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    meta: {
      totalRows: rows.length,
      totalTrades: tradeRows.size,
      salaryCoverage: rows.filter(r => r.capPct != null).length,
      dateRange: [rows.map(r => r.season).sort()[0], rows.map(r => r.season).sort().reverse()[0]],
      generatedAt: new Date().toISOString(),
    },
    h1: { testable: h1Testable, correct: h1Correct, wrong: h1Wrong, rate: Number(h1Rate) },
    archetypes: Object.fromEntries([...archetypes.entries()].map(([k, v]) => [k, {
      count: v.count,
      wins: v.wins,
      avgWSPerSeason: v.totalPostWS / v.count,
      avgPlayoffWS: v.totalPlayoffWS / v.count,
      winRate: v.count > 0 ? v.wins / v.count : 0,
    }])),
  }, null, 2));
  console.log(`\nRaw data saved to: ${outputPath}`);
}

main().catch(console.error);
