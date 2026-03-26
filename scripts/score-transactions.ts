/**
 * Score non-trade NBA moves (signings, extensions, claims) using the CATV formula.
 *
 * Same value model as score-trades.ts applied to single-team moves:
 *   catv_score = win_shares + playoff_ws × 1.5 + championship_bonus + accolade_bonus
 *
 * Also computes salary efficiency ($/WS) and team win delta.
 *
 * Reads:   public/data/transactions/by-season/*.json
 * Queries: player_seasons, player_accolades, team_seasons, player_contracts, salary_cap_history
 * Upserts: transaction_scores table
 *
 * PREREQUISITE: Run database/migrations/018-transaction-scores.sql
 *
 * Usage:
 *   npx tsx scripts/score-transactions.ts                    # Score all transactions
 *   npx tsx scripts/score-transactions.ts --dry-run          # Print results, no DB writes
 *   npx tsx scripts/score-transactions.ts --season 2024-25   # Single season only
 *   npx tsx scripts/score-transactions.ts --top 20           # Print 20 best moves
 *   npx tsx scripts/score-transactions.ts --worst 20         # Print 20 worst $/WS contracts
 *   npx tsx scripts/score-transactions.ts --type signing     # Score only signings
 */

import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';

// ── Constants ─────────────────────────────────────────────────────────

const TX_DIR = path.join(__dirname, '..', 'public', 'data', 'transactions', 'by-season');

/** Transaction types worth scoring (player joins or stays with a team). */
const SCORABLE_TYPES = new Set([
  'signing', 'extension', 'claimed', '10_day', 'rest_of_season', 'two_way', 'converted',
]);

const ACCOLADE_WEIGHTS: Record<string, number> = {
  'MVP':                5.0,
  'Finals MVP':         3.0,
  'DPOY':               2.5,
  'ROY':                1.5,
  'Sixth Man':          0.8,
  'MIP':                0.5,
  'Clutch POY':         0.3,
  'All-NBA 1st Team':   2.0,
  'All-NBA 2nd Team':   1.2,
  'All-NBA 3rd Team':   0.7,
  'All-Defensive Team': 0.5,
  'All-Rookie Team':    0.2,
  'All-Star':           0.3,
};

// ── Types ─────────────────────────────────────────────────────────────

interface Transaction {
  id: string;
  date: string | null;
  season: string;
  transaction_type: string;
  player_name: string;
  player_bbref_id: string | null;
  team_id: string | null;
  from_team_id: string | null;
  contract_type: string | null;
  description: string;
  notes: string | null;
  source_url: string;
}

interface PlayerSeason {
  player_name: string;
  team_id: string;
  season: string;
  win_shares: number | null;
  playoff_ws: number | null;
}

interface Accolade {
  player_name: string;
  accolade: string;
  season: string;
}

interface TeamSeason {
  team_id: string;
  season: string;
  wins: number | null;
  losses: number | null;
  championship: boolean;
}

interface ContractRow {
  player_name: string;
  team_id: string;
  season: string;
  salary: number;
}

interface CapRow {
  season: string;
  salary_cap: number;
}

interface TransactionScore {
  transaction_id: string;
  season: string;
  transaction_type: string;
  player_name: string;
  team_id: string;
  seasons_scored: number;
  win_shares: number;
  playoff_ws: number;
  championships: number;
  championship_bonus: number;
  accolades: string[];
  accolade_bonus: number;
  catv_score: number;
  salary_at_move: number | null;
  total_salary: number | null;
  dollars_per_ws: number | null;
  cap_pct: number | null;
  team_wins_before: number | null;
  team_wins_after: number | null;
  win_delta: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmt$(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function fmtWs(n: number): string {
  return n >= 0 ? n.toFixed(1) : n.toFixed(1);
}

/** Previous season: "2020-21" → "2019-20" */
function prevSeason(season: string): string {
  const start = parseInt(season.split('-')[0]) - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

// ── Name normalization ────────────────────────────────────────────────
// BBRef transaction names use full names with diacritics.
// player_seasons (Kaggle) may use different forms.

function stripDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const SUFFIX_ALIASES: Record<string, string> = {
  'Glen Rice Sr.': 'Glen Rice',
  'Tim Hardaway Sr.': 'Tim Hardaway',
  'Patrick Ewing Sr.': 'Patrick Ewing',
  'Larry Nance Sr.': 'Larry Nance',
  'Mike Dunleavy Jr.': 'Mike Dunleavy',
  'Xavier Tillman Sr.': 'Xavier Tillman',
  'Jim Paxson Jr.': 'Jim Paxson',
  'Anthony Mason Sr.': 'Anthony Mason',
  'Wes Matthews Sr.': 'Wes Matthews',
  'John Lucas Sr.': 'John Lucas',
};

function resolveStatsName(name: string): string {
  const cleaned = stripDiacritics(name).trim();
  if (SUFFIX_ALIASES[cleaned]) return SUFFIX_ALIASES[cleaned];
  return cleaned;
}

// ── Bulk data loaders ─────────────────────────────────────────────────

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
    if (!data || data.length === 0) break;

    rows.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return rows;
}

// ── Scoring logic ─────────────────────────────────────────────────────

function scoreTransaction(
  tx: Transaction,
  seasonsByPlayerTeam: Map<string, PlayerSeason[]>,
  accoladesByPlayer: Map<string, Accolade[]>,
  championshipSet: Set<string>,
  teamChampPlayoffWs: Map<string, number>,
  contractsByPlayerTeam: Map<string, ContractRow[]>,
  capBySeason: Map<string, number>,
  teamWinsBySeason: Map<string, number>,
): TransactionScore | null {
  const teamId = tx.team_id;
  if (!teamId) return null;

  const statsName = resolveStatsName(tx.player_name);
  const seasonCutoff = tx.season;

  // ── CATV score ──────────────────────────────────────────────────────
  const key = `${statsName}|${teamId}`;
  const eligibleSeasons = (seasonsByPlayerTeam.get(key) || [])
    .filter(s => s.season >= seasonCutoff);

  const seasonSet = new Set(eligibleSeasons.map(s => s.season));

  let ws = 0, playoffWs = 0, championships = 0, championshipBonus = 0;
  for (const s of eligibleSeasons) {
    ws       += s.win_shares  ?? 0;
    playoffWs += s.playoff_ws ?? 0;
    const champKey = `${teamId}|${s.season}`;
    if (championshipSet.has(champKey)) {
      championships++;
      const teamTotal = teamChampPlayoffWs.get(champKey) || 1;
      championshipBonus += 5.0 * ((s.playoff_ws ?? 0) / teamTotal);
    }
  }

  // Accolades earned while on this team
  const accolades: string[] = [];
  let accoladeBonus = 0;
  for (const a of (accoladesByPlayer.get(statsName) || [])) {
    if (!seasonSet.has(a.season)) continue;
    const w = ACCOLADE_WEIGHTS[a.accolade] ?? 0;
    if (w > 0) {
      accoladeBonus += w;
      accolades.push(a.accolade);
    }
  }

  const catvScore = r2(ws + playoffWs * 1.5 + championshipBonus + accoladeBonus);

  // ── Salary efficiency ───────────────────────────────────────────────
  const contractKey = `${statsName}|${teamId}`;
  const contracts = (contractsByPlayerTeam.get(contractKey) || [])
    .filter(c => c.season >= seasonCutoff)
    .sort((a, b) => a.season.localeCompare(b.season));

  const moveSeasonContract = contracts.find(c => c.season === seasonCutoff);
  const salaryAtMove = moveSeasonContract?.salary ?? null;
  const totalSalary = contracts.length > 0
    ? contracts.reduce((sum, c) => sum + (c.salary || 0), 0)
    : null;

  // $/WS: total salary / total WS (only if both exist and WS > 0)
  const totalWs = r2(ws);
  let dollarsPerWs: number | null = null;
  if (totalSalary && totalSalary > 0 && totalWs > 0) {
    dollarsPerWs = r2(totalSalary / totalWs);
  } else if (totalSalary && totalSalary > 0 && totalWs <= 0) {
    // Negative or zero WS with real salary = infinite cost per WS
    // Store as negative salary (signals "paid X for nothing")
    dollarsPerWs = -totalSalary;
  }

  // Cap %
  const cap = capBySeason.get(seasonCutoff);
  const capPct = (salaryAtMove && cap && cap > 0)
    ? r2(salaryAtMove / cap * 10000) / 10000  // 4 decimal places
    : null;

  // ── Team win delta ──────────────────────────────────────────────────
  const prev = prevSeason(seasonCutoff);
  const teamWinsBefore = teamWinsBySeason.get(`${teamId}|${prev}`) ?? null;
  const teamWinsAfter  = teamWinsBySeason.get(`${teamId}|${seasonCutoff}`) ?? null;
  const winDelta = (teamWinsBefore !== null && teamWinsAfter !== null)
    ? teamWinsAfter - teamWinsBefore
    : null;

  return {
    transaction_id: tx.id,
    season: tx.season,
    transaction_type: tx.transaction_type,
    player_name: tx.player_name,
    team_id: teamId,
    seasons_scored: eligibleSeasons.length,
    win_shares: r2(ws),
    playoff_ws: r2(playoffWs),
    championships,
    championship_bonus: r2(championshipBonus),
    accolades,
    accolade_bonus: r2(accoladeBonus),
    catv_score: catvScore,
    salary_at_move: salaryAtMove,
    total_salary: totalSalary,
    dollars_per_ws: dollarsPerWs,
    cap_pct: capPct,
    team_wins_before: teamWinsBefore,
    team_wins_after: teamWinsAfter,
    win_delta: winDelta,
  };
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun     = args.includes('--dry-run');
  const topArg     = args.find(a => a.startsWith('--top'));
  const topN       = topArg ? parseInt(topArg.includes('=') ? topArg.split('=')[1] : args[args.indexOf(topArg) + 1]) : 0;
  const worstArg   = args.find(a => a.startsWith('--worst'));
  const worstN     = worstArg ? parseInt(worstArg.includes('=') ? worstArg.split('=')[1] : args[args.indexOf(worstArg) + 1]) : 0;
  const seasonArg  = args.find(a => a.startsWith('--season'));
  const singleSeason = seasonArg
    ? (seasonArg.includes('=') ? seasonArg.split('=')[1] : args[args.indexOf(seasonArg) + 1])
    : null;
  const typeArg    = args.find(a => a.startsWith('--type'));
  const filterType = typeArg
    ? (typeArg.includes('=') ? typeArg.split('=')[1] : args[args.indexOf(typeArg) + 1])
    : null;

  console.log('Loading Supabase data...');

  const [playerSeasons, accolades, teamSeasons, contracts, capHistory] = await Promise.all([
    fetchAll<PlayerSeason>('player_seasons', 'player_name,team_id,season,win_shares,playoff_ws'),
    fetchAll<Accolade>('player_accolades', 'player_name,accolade,season'),
    fetchAll<TeamSeason>('team_seasons', 'team_id,season,wins,losses,championship'),
    fetchAll<ContractRow>('player_contracts', 'player_name,team_id,season,salary'),
    fetchAll<CapRow>('salary_cap_history', 'season,salary_cap'),
  ]);

  console.log(`  player_seasons: ${playerSeasons.length}`);
  console.log(`  player_accolades: ${accolades.length}`);
  console.log(`  team_seasons: ${teamSeasons.length}`);
  console.log(`  player_contracts: ${contracts.length}`);
  console.log(`  salary_cap_history: ${capHistory.length}`);

  // Build lookup indexes
  const seasonsByPlayerTeam = new Map<string, PlayerSeason[]>();
  for (const row of playerSeasons) {
    const key = `${row.player_name}|${row.team_id}`;
    if (!seasonsByPlayerTeam.has(key)) seasonsByPlayerTeam.set(key, []);
    seasonsByPlayerTeam.get(key)!.push(row);
  }

  const accoladesByPlayer = new Map<string, Accolade[]>();
  for (const row of accolades) {
    if (!accoladesByPlayer.has(row.player_name)) accoladesByPlayer.set(row.player_name, []);
    accoladesByPlayer.get(row.player_name)!.push(row);
  }

  const championshipSet = new Set<string>(
    teamSeasons.filter(r => r.championship).map(r => `${r.team_id}|${r.season}`)
  );

  const teamChampPlayoffWs = new Map<string, number>();
  for (const row of playerSeasons) {
    const champKey = `${row.team_id}|${row.season}`;
    if (championshipSet.has(champKey)) {
      teamChampPlayoffWs.set(champKey, (teamChampPlayoffWs.get(champKey) || 0) + (row.playoff_ws ?? 0));
    }
  }

  const contractsByPlayerTeam = new Map<string, ContractRow[]>();
  for (const row of contracts) {
    const key = `${row.player_name}|${row.team_id}`;
    if (!contractsByPlayerTeam.has(key)) contractsByPlayerTeam.set(key, []);
    contractsByPlayerTeam.get(key)!.push(row);
  }

  const capBySeason = new Map<string, number>();
  for (const row of capHistory) {
    capBySeason.set(row.season, row.salary_cap);
  }

  const teamWinsBySeason = new Map<string, number>();
  for (const row of teamSeasons) {
    if (row.wins !== null) {
      teamWinsBySeason.set(`${row.team_id}|${row.season}`, row.wins);
    }
  }

  console.log(`  Championships indexed: ${championshipSet.size}`);
  console.log(`  Contracts indexed: ${contractsByPlayerTeam.size} player-team combos`);
  console.log(`  Cap history: ${capBySeason.size} seasons\n`);

  // Load transaction JSON files
  const seasonFiles = fs.readdirSync(TX_DIR)
    .filter(f => f.endsWith('.json'))
    .filter(f => !singleSeason || f === `${singleSeason}.json`)
    .sort();

  const allTransactions: Transaction[] = [];
  for (const file of seasonFiles) {
    const txs = JSON.parse(fs.readFileSync(path.join(TX_DIR, file), 'utf-8')) as Transaction[];
    allTransactions.push(...txs);
  }

  // Filter to scorable types
  let scorable = allTransactions.filter(tx =>
    SCORABLE_TYPES.has(tx.transaction_type) && tx.team_id
  );

  if (filterType) {
    scorable = scorable.filter(tx => tx.transaction_type === filterType);
  }

  console.log(`Loaded ${allTransactions.length} transactions, ${scorable.length} scorable.\n`);

  // Score each transaction
  const results: TransactionScore[] = [];
  let skipped = 0;

  for (const tx of scorable) {
    const scored = scoreTransaction(
      tx, seasonsByPlayerTeam, accoladesByPlayer,
      championshipSet, teamChampPlayoffWs,
      contractsByPlayerTeam, capBySeason, teamWinsBySeason,
    );
    if (scored) {
      results.push(scored);
    } else {
      skipped++;
    }
  }

  // Deduplicate by transaction_id (same player+date+type can appear twice in source data)
  const seen = new Set<string>();
  const deduped: TransactionScore[] = [];
  for (const r of results) {
    if (!seen.has(r.transaction_id)) {
      seen.add(r.transaction_id);
      deduped.push(r);
    }
  }
  if (deduped.length < results.length) {
    console.log(`Deduplicated: ${results.length} → ${deduped.length} (${results.length - deduped.length} dupes removed)`);
  }
  const dedupedResults = deduped;

  // Summary stats
  const withData = dedupedResults.filter(r => r.seasons_scored > 0);
  const withSalary = dedupedResults.filter(r => r.salary_at_move !== null);
  const positive = dedupedResults.filter(r => r.catv_score > 0);
  console.log(`Scored ${dedupedResults.length} transactions (skipped ${skipped} — no team).`);
  console.log(`  With stat data:  ${withData.length} (${Math.round(withData.length / dedupedResults.length * 100)}%)`);
  console.log(`  With salary:     ${withSalary.length} (${Math.round(withSalary.length / dedupedResults.length * 100)}%)`);
  console.log(`  Positive CATV:   ${positive.length}`);

  // Type breakdown
  const byType = new Map<string, number>();
  for (const r of dedupedResults) {
    byType.set(r.transaction_type, (byType.get(r.transaction_type) || 0) + 1);
  }
  console.log(`\n  By type:`);
  for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${type}: ${count}`);
  }

  // --top N: best moves by CATV
  const printTop = topN || (dryRun ? 20 : 0);
  if (printTop > 0) {
    console.log(`\nTop ${printTop} best moves by CATV:`);
    const sorted = [...dedupedResults].sort((a, b) => b.catv_score - a.catv_score);
    for (const r of sorted.slice(0, printTop)) {
      const salary = r.salary_at_move ? ` | ${fmt$(r.salary_at_move)}` : '';
      const dpws = r.dollars_per_ws && r.dollars_per_ws > 0
        ? ` | ${fmt$(r.dollars_per_ws)}/WS`
        : '';
      const delta = r.win_delta !== null ? ` | Δ${r.win_delta >= 0 ? '+' : ''}${r.win_delta}W` : '';
      console.log(`  [${r.season}] ${r.player_name} → ${r.team_id} (${r.transaction_type})  CATV=${r.catv_score.toFixed(1)}  WS=${fmtWs(r.win_shares)}  ${r.seasons_scored}yr${salary}${dpws}${delta}`);
      if (r.accolades.length > 0) {
        console.log(`    Accolades: ${r.accolades.join(', ')}`);
      }
    }
  }

  // --worst N: worst $/WS (expensive moves with low production)
  const printWorst = worstN || (dryRun ? 20 : 0);
  if (printWorst > 0) {
    console.log(`\nTop ${printWorst} worst $/WS contracts (paid most per win share):`);
    // Filter to moves with salary data and at least 1 season
    const withSalaryData = dedupedResults.filter(r =>
      r.total_salary && r.total_salary > 5_000_000 && r.seasons_scored >= 1
    );
    // Sort by worst efficiency: negative dollars_per_ws first (no WS), then highest positive
    const sorted = withSalaryData.sort((a, b) => {
      const aVal = a.dollars_per_ws ?? 0;
      const bVal = b.dollars_per_ws ?? 0;
      // Negative = paid for nothing, sort those first (most negative = most paid)
      if (aVal < 0 && bVal < 0) return aVal - bVal; // more negative = worse
      if (aVal < 0) return -1;
      if (bVal < 0) return 1;
      return bVal - aVal; // highest positive = worst
    });
    for (const r of sorted.slice(0, printWorst)) {
      const dpws = r.dollars_per_ws !== null
        ? (r.dollars_per_ws < 0 ? `${fmt$(-r.dollars_per_ws)} for ≤0 WS` : `${fmt$(r.dollars_per_ws)}/WS`)
        : 'no salary';
      console.log(`  [${r.season}] ${r.player_name} → ${r.team_id} (${r.transaction_type})  ${dpws}  total=${fmt$(r.total_salary || 0)}  WS=${fmtWs(r.win_shares)}  ${r.seasons_scored}yr`);
    }
  }

  if (dryRun) {
    console.log('\nDry run — no database writes.');
    return;
  }

  // Upsert to transaction_scores
  console.log('\nUpserting to Supabase...');
  const BATCH = 200;
  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < dedupedResults.length; i += BATCH) {
    const batch = dedupedResults.slice(i, i + BATCH).map(r => ({
      transaction_id:     r.transaction_id,
      season:             r.season,
      transaction_type:   r.transaction_type,
      player_name:        r.player_name,
      team_id:            r.team_id,
      seasons_scored:     r.seasons_scored,
      win_shares:         r.win_shares,
      playoff_ws:         r.playoff_ws,
      championships:      r.championships,
      championship_bonus: r.championship_bonus,
      accolades:          JSON.stringify(r.accolades),
      accolade_bonus:     r.accolade_bonus,
      catv_score:         r.catv_score,
      salary_at_move:     r.salary_at_move,
      total_salary:       r.total_salary,
      dollars_per_ws:     r.dollars_per_ws,
      cap_pct:            r.cap_pct,
      team_wins_before:   r.team_wins_before,
      team_wins_after:    r.team_wins_after,
      win_delta:          r.win_delta,
    }));

    const { error } = await supabase
      .from('transaction_scores')
      .upsert(batch, { onConflict: 'transaction_id' });

    if (error) {
      console.error(`  Batch ${Math.floor(i / BATCH) + 1} error: ${error.message}`);
      errors++;
    } else {
      upserted += batch.length;
    }
  }

  console.log(`\nDone. Upserted ${upserted} rows, ${errors} batch errors.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
