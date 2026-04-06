/**
 * Simulate the impact of a non-playoff WS discount on trade scores.
 *
 * This is a READ-ONLY analysis script — no database writes.
 *
 * Proposed change:
 *   - Non-playoff teams: regular-season WS × team winning percentage
 *   - Playoff teams: full WS credit (multiplier = 1.0)
 *   - All-Star accolade weight: 0.3 → 0.1
 *
 * Scores every trade both ways (old formula vs. new) and reports:
 *   A. Curated trade deep-dives (10 representative trades)
 *   B. Aggregate stats across all trades
 *   C. Biggest score drops
 *   D. Winner flips
 *   E. Edge case pass/fail report
 *
 * Usage:
 *   npx tsx scripts/simulate-ws-discount.ts              # Full analysis
 *   npx tsx scripts/simulate-ws-discount.ts --curated    # Only 10 representative trades
 *   npx tsx scripts/simulate-ws-discount.ts --top 30     # Top N drops/flips
 */

import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';

// ── Constants ────────────────────────────────────────────────────────────────

const TRADES_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');
const DRAW_THRESHOLD = 1.5;

const ACCOLADE_WEIGHTS_OLD: Record<string, number> = {
  'MVP':               5.0,
  'Finals MVP':        3.0,
  'DPOY':              2.5,
  'ROY':               1.5,
  'Sixth Man':         0.8,
  'MIP':               0.5,
  'Clutch POY':        0.3,
  'All-NBA 1st Team':  2.0,
  'All-NBA 2nd Team':  1.2,
  'All-NBA 3rd Team':  0.7,
  'All-Defensive Team': 0.5,
  'All-Rookie Team':   0.2,
  'All-Star':          0.3,
  'All-WNBA Team':     1.2,
};

const ACCOLADE_WEIGHTS_NEW: Record<string, number> = {
  ...ACCOLADE_WEIGHTS_OLD,
  'All-Star':          0.3,
};

const SUFFIX_ALIASES: Record<string, string> = {
  'Glen Rice Sr.': 'Glen Rice',
  'Tim Hardaway Sr.': 'Tim Hardaway',
  'Patrick Ewing Sr.': 'Patrick Ewing',
  'Larry Nance Sr.': 'Larry Nance',
  'Anthony Mason Sr.': 'Anthony Mason',
  'Wes Matthews Sr.': 'Wes Matthews',
  'John Lucas Sr.': 'John Lucas',
  'Jim Paxson Jr.': 'Jim Paxson',
  'Xavier Tillman Sr.': 'Xavier Tillman',
  'Mike Dunleavy Jr.': 'Mike Dunleavy',
};

// 10 curated trade IDs for deep-dive analysis
const CURATED_TRADES = [
  '1002225d-2497-4243-b28b-34b507e4fae2', // LaVine/Butler
  '638c53f8-32a7-44bd-aff3-8eaaa345b863', // Pau Gasol draft to MEM
  'da5b603a-fef2-4531-b702-6a8085f33de5', // Pau Gasol to LAL
  'bbref-2019-07-06-482f6ace',             // AD to LAL
  'f696d8e9-4d51-4130-908e-4d028dc820ae', // Harden to HOU
  '0dc1038b-87d5-48da-8c30-380692c5d335', // KG to BOS
  'acc913b3-7113-44bb-9045-0dbc98a07972', // Kawhi to TOR
  'ee1b1cd5-7267-4f01-9aa7-1f3243aaeb96', // Kobe draft-day
  'bbref-2022-09-03-f41e070a',             // Mitchell to CLE
  '16d7f3e8-2d30-4d74-9c86-763982de365f', // Chris Paul to LAC
];

// ── Types ────────────────────────────────────────────────────────────────────

interface TradeAsset {
  type: 'player' | 'pick' | 'swap' | 'cash';
  player_name: string | null;
  from_team_id: string;
  to_team_id: string;
  pick_year: number | null;
  pick_round: number | null;
  became_player_name: string | null;
}

interface Trade {
  id: string;
  date: string;
  season: string;
  title: string;
  assets: TradeAsset[];
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

interface TeamSeasonFull {
  team_id: string;
  season: string;
  wins: number | null;
  losses: number | null;
  playoff_result: string | null;
  championship: boolean;
}

interface AssetComparison {
  name: string;
  type: 'player' | 'pick';
  seasons: number;
  oldWs: number;
  newWs: number;
  oldPlayoffWs: number;
  oldChampBonus: number;
  oldAccoladeBonus: number;
  newAccoladeBonus: number;
  oldScore: number;
  newScore: number;
  discountedSeasons: number;
  seasonDetails: { season: string; ws: number; multiplier: number; adjustedWs: number; teamRecord: string; playoff: boolean }[];
}

interface TeamComparison {
  teamId: string;
  oldScore: number;
  newScore: number;
  delta: number;
  assets: AssetComparison[];
}

interface TradeComparison {
  tradeId: string;
  season: string;
  title: string;
  teams: TeamComparison[];
  oldWinner: string | null;
  newWinner: string | null;
  winnerFlipped: boolean;
  oldLopsidedness: number;
  newLopsidedness: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function resolveStatsName(name: string): string {
  return SUFFIX_ALIASES[name] || name;
}

function pickYearToSeason(year: number): string {
  return `${year}-${String(year + 1).slice(2)}`;
}

// ── Bulk data loaders ────────────────────────────────────────────────────────

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

// ── Non-playoff multiplier ───────────────────────────────────────────────────

function getWinPctMultiplier(
  teamId: string,
  season: string,
  teamSeasonMap: Map<string, TeamSeasonFull>,
): number {
  const ts = teamSeasonMap.get(`${teamId}|${season}`);
  if (!ts || ts.wins == null || ts.losses == null) return 1.0;
  const total = ts.wins + ts.losses;
  if (total === 0) return 1.0;
  // min(1.0, win_pct × 2): full credit at .500+, linear discount below
  return Math.min(1.0, (ts.wins / total) * 2);
}

function getTeamRecord(
  teamId: string,
  season: string,
  teamSeasonMap: Map<string, TeamSeasonFull>,
): string {
  const ts = teamSeasonMap.get(`${teamId}|${season}`);
  if (!ts || ts.wins == null) return '?';
  const pf = ts.playoff_result ? ` (${ts.playoff_result})` : '';
  return `${ts.wins}-${ts.losses}${pf}`;
}

// ── Scoring functions ────────────────────────────────────────────────────────

function scoreAsset(
  playerName: string,
  receivingTeamId: string,
  seasonCutoff: string,
  assetType: 'player' | 'pick',
  seasonsByPlayerTeam: Map<string, PlayerSeason[]>,
  accoladesByPlayer: Map<string, Accolade[]>,
  championshipSet: Set<string>,
  teamChampPlayoffWs: Map<string, number>,
  teamSeasonMap: Map<string, TeamSeasonFull>,
  useNewFormula: boolean,
): AssetComparison {
  const key = `${playerName}|${receivingTeamId}`;
  const eligibleSeasons = (seasonsByPlayerTeam.get(key) || [])
    .filter(s => s.season >= seasonCutoff);

  const seasonSet = new Set(eligibleSeasons.map(s => s.season));
  const weights = useNewFormula ? ACCOLADE_WEIGHTS_NEW : ACCOLADE_WEIGHTS_OLD;

  let oldWs = 0, newWs = 0, playoffWs = 0, championshipBonus = 0;
  let discountedSeasons = 0;
  const seasonDetails: AssetComparison['seasonDetails'] = [];

  for (const s of eligibleSeasons) {
    const rawWs = s.win_shares ?? 0;
    const mult = getWinPctMultiplier(receivingTeamId, s.season, teamSeasonMap);
    const adjustedWs = rawWs * mult;
    const isPlayoff = mult === 1.0 && rawWs !== 0;

    oldWs += rawWs;
    newWs += useNewFormula ? adjustedWs : rawWs;
    playoffWs += s.playoff_ws ?? 0;

    if (mult < 1.0 && rawWs !== 0) discountedSeasons++;

    seasonDetails.push({
      season: s.season,
      ws: rawWs,
      multiplier: mult,
      adjustedWs: r2(adjustedWs),
      teamRecord: getTeamRecord(receivingTeamId, s.season, teamSeasonMap),
      playoff: isPlayoff || mult === 1.0,
    });

    const champKey = `${receivingTeamId}|${s.season}`;
    if (championshipSet.has(champKey)) {
      const teamTotal = teamChampPlayoffWs.get(champKey) || 1;
      championshipBonus += 5.0 * ((s.playoff_ws ?? 0) / teamTotal);
    }
  }

  let accoladeBonus = 0;
  for (const a of (accoladesByPlayer.get(playerName) || [])) {
    if (!seasonSet.has(a.season)) continue;
    const w = weights[a.accolade] ?? 0;
    if (w > 0) accoladeBonus += w;
  }

  // Compute old accolade bonus separately (always with old weights)
  let oldAccoladeBonus = 0;
  for (const a of (accoladesByPlayer.get(playerName) || [])) {
    if (!seasonSet.has(a.season)) continue;
    const w = ACCOLADE_WEIGHTS_OLD[a.accolade] ?? 0;
    if (w > 0) oldAccoladeBonus += w;
  }

  const wsForScore = useNewFormula ? newWs : oldWs;
  const accForScore = useNewFormula ? accoladeBonus : oldAccoladeBonus;
  const score = r2(wsForScore + playoffWs * 1.5 + championshipBonus + accForScore);
  const oldScore = r2(oldWs + playoffWs * 1.5 + championshipBonus + oldAccoladeBonus);

  return {
    name: playerName,
    type: assetType,
    seasons: eligibleSeasons.length,
    oldWs: r2(oldWs),
    newWs: r2(useNewFormula ? newWs : oldWs),
    oldPlayoffWs: r2(playoffWs),
    oldChampBonus: r2(championshipBonus),
    oldAccoladeBonus: r2(oldAccoladeBonus),
    newAccoladeBonus: r2(accForScore),
    oldScore,
    newScore: score,
    discountedSeasons,
    seasonDetails,
  };
}

function scoreTradeBothWays(
  trade: Trade,
  seasonsByPlayerTeam: Map<string, PlayerSeason[]>,
  accoladesByPlayer: Map<string, Accolade[]>,
  championshipSet: Set<string>,
  teamChampPlayoffWs: Map<string, number>,
  teamSeasonMap: Map<string, TeamSeasonFull>,
): TradeComparison {
  const byTeam = new Map<string, TradeAsset[]>();
  for (const asset of trade.assets) {
    if (!byTeam.has(asset.to_team_id)) byTeam.set(asset.to_team_id, []);
    byTeam.get(asset.to_team_id)!.push(asset);
  }

  const teams: TeamComparison[] = [];

  for (const [teamId, assets] of byTeam) {
    const assetComparisons: AssetComparison[] = [];

    for (const asset of assets) {
      let statsName: string | null = null;
      let assetType: 'player' | 'pick' = 'player';
      let seasonCutoff = trade.season;

      if (asset.type === 'player' && asset.player_name) {
        statsName = resolveStatsName(asset.player_name);
      } else if (asset.type === 'pick' && asset.became_player_name) {
        statsName = resolveStatsName(asset.became_player_name);
        assetType = 'pick';
        seasonCutoff = asset.pick_year ? pickYearToSeason(asset.pick_year) : trade.season;
      }
      if (!statsName) continue;

      // Score with OLD formula
      const oldResult = scoreAsset(
        statsName, teamId, seasonCutoff, assetType,
        seasonsByPlayerTeam, accoladesByPlayer, championshipSet, teamChampPlayoffWs,
        teamSeasonMap, false,
      );

      // Score with NEW formula
      const newResult = scoreAsset(
        statsName, teamId, seasonCutoff, assetType,
        seasonsByPlayerTeam, accoladesByPlayer, championshipSet, teamChampPlayoffWs,
        teamSeasonMap, true,
      );

      // Merge into a single comparison object
      assetComparisons.push({
        ...oldResult,
        newWs: newResult.newWs,
        newAccoladeBonus: newResult.newAccoladeBonus,
        newScore: newResult.newScore,
        discountedSeasons: newResult.discountedSeasons,
        seasonDetails: newResult.seasonDetails,
      });

      // Restore display name
      if (asset.player_name && asset.player_name !== statsName) {
        assetComparisons[assetComparisons.length - 1].name = asset.player_name;
      }
    }

    const oldTotal = r2(assetComparisons.reduce((s, a) => s + a.oldScore, 0));
    const newTotal = r2(assetComparisons.reduce((s, a) => s + a.newScore, 0));

    teams.push({
      teamId,
      oldScore: oldTotal,
      newScore: newTotal,
      delta: r2(newTotal - oldTotal),
      assets: assetComparisons,
    });
  }

  // Determine winners
  const oldSorted = [...teams].sort((a, b) => b.oldScore - a.oldScore);
  const newSorted = [...teams].sort((a, b) => b.newScore - a.newScore);

  let oldWinner: string | null = null;
  let oldLopsidedness = 0;
  if (oldSorted.length >= 2) {
    oldLopsidedness = r2(oldSorted[0].oldScore - oldSorted[oldSorted.length - 1].oldScore);
    if (oldLopsidedness >= DRAW_THRESHOLD) oldWinner = oldSorted[0].teamId;
  }

  let newWinner: string | null = null;
  let newLopsidedness = 0;
  if (newSorted.length >= 2) {
    newLopsidedness = r2(newSorted[0].newScore - newSorted[newSorted.length - 1].newScore);
    if (newLopsidedness >= DRAW_THRESHOLD) newWinner = newSorted[0].teamId;
  }

  return {
    tradeId: trade.id,
    season: trade.season,
    title: trade.title,
    teams,
    oldWinner,
    newWinner,
    winnerFlipped: oldWinner !== null && newWinner !== null && oldWinner !== newWinner,
    oldLopsidedness,
    newLopsidedness,
  };
}

// ── Output formatters ────────────────────────────────────────────────────────

function printCuratedDeepDive(comp: TradeComparison) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`  ${comp.title} (${comp.season})`);
  console.log(`  ID: ${comp.tradeId}`);
  console.log(`${'═'.repeat(80)}`);

  const winnerStr = (old: string | null, nw: string | null) => {
    if (old === nw) return old ? `Winner: ${old} (unchanged)` : 'Draw (unchanged)';
    return `Winner: ${old || 'DRAW'} → ${nw || 'DRAW'} ${old && nw && old !== nw ? '⚠️ FLIPPED' : ''}`;
  };

  console.log(`  ${winnerStr(comp.oldWinner, comp.newWinner)}`);
  console.log(`  Lopsidedness: ${comp.oldLopsidedness.toFixed(1)} → ${comp.newLopsidedness.toFixed(1)}`);

  for (const team of comp.teams) {
    console.log(`\n  ── ${team.teamId}: ${team.oldScore.toFixed(1)} → ${team.newScore.toFixed(1)} (${team.delta >= 0 ? '+' : ''}${team.delta.toFixed(1)}) ──`);

    for (const asset of team.assets) {
      if (asset.oldScore === 0 && asset.newScore === 0) continue;
      const arrow = asset.oldScore !== asset.newScore
        ? ` → ${asset.newScore.toFixed(1)}`
        : '';
      console.log(`    ${asset.name} (${asset.type}): ${asset.oldScore.toFixed(1)}${arrow}  [WS: ${asset.oldWs.toFixed(1)}→${asset.newWs.toFixed(1)}, Playoff WS: ${asset.oldPlayoffWs.toFixed(1)}, Champ: ${asset.oldChampBonus.toFixed(1)}, Accolades: ${asset.oldAccoladeBonus.toFixed(1)}→${asset.newAccoladeBonus.toFixed(1)}]`);

      if (asset.discountedSeasons > 0) {
        for (const sd of asset.seasonDetails) {
          if (sd.multiplier < 1.0 && sd.ws !== 0) {
            console.log(`      ${sd.season}: ${sd.ws.toFixed(1)} WS × ${sd.multiplier.toFixed(3)} = ${sd.adjustedWs.toFixed(1)}  (${sd.teamRecord})`);
          }
        }
        // Also show full-credit seasons
        const fullCreditSeasons = asset.seasonDetails.filter(sd => sd.multiplier === 1.0 && sd.ws !== 0);
        if (fullCreditSeasons.length > 0) {
          const totalFullWs = fullCreditSeasons.reduce((s, sd) => s + sd.ws, 0);
          console.log(`      + ${fullCreditSeasons.length} playoff season(s): ${totalFullWs.toFixed(1)} WS at full credit`);
        }
      }
    }
  }
}

function printAggregateStats(comparisons: TradeComparison[]) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log('  SECTION B: AGGREGATE STATS');
  console.log(`${'═'.repeat(80)}`);

  const total = comparisons.length;
  const affected = comparisons.filter(c => c.teams.some(t => t.delta !== 0)).length;
  const flipped = comparisons.filter(c => c.winnerFlipped).length;
  const newDraws = comparisons.filter(c => c.oldWinner && !c.newWinner).length;
  const lostDraws = comparisons.filter(c => !c.oldWinner && c.newWinner).length;

  // All team-side deltas
  const allDeltas = comparisons.flatMap(c => c.teams.map(t => t.delta)).filter(d => d !== 0);
  allDeltas.sort((a, b) => a - b);
  const mean = allDeltas.length > 0 ? allDeltas.reduce((s, d) => s + d, 0) / allDeltas.length : 0;
  const median = allDeltas.length > 0 ? allDeltas[Math.floor(allDeltas.length / 2)] : 0;

  const lopsidednessChanges = comparisons.map(c => c.newLopsidedness - c.oldLopsidedness);
  const moreLopsided = lopsidednessChanges.filter(d => d > 0.1).length;
  const lessLopsided = lopsidednessChanges.filter(d => d < -0.1).length;

  console.log(`  Total trades scored:           ${total}`);
  console.log(`  Trades affected (any change):  ${affected} (${(affected / total * 100).toFixed(1)}%)`);
  console.log(`  Winner flips:                  ${flipped} (${(flipped / total * 100).toFixed(1)}%)`);
  console.log(`  New draws (had winner, lost):  ${newDraws}`);
  console.log(`  Lost draws (was draw, gained):  ${lostDraws}`);
  console.log(`  Mean score delta (affected):   ${mean.toFixed(2)}`);
  console.log(`  Median score delta (affected): ${median.toFixed(2)}`);
  console.log(`  Trades more lopsided:          ${moreLopsided}`);
  console.log(`  Trades less lopsided:          ${lessLopsided}`);
}

function printBiggestDrops(comparisons: TradeComparison[], topN: number) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`  SECTION C: TOP ${topN} BIGGEST SCORE DROPS`);
  console.log(`${'═'.repeat(80)}`);

  const drops: { trade: TradeComparison; teamId: string; delta: number }[] = [];
  for (const c of comparisons) {
    for (const t of c.teams) {
      if (t.delta < 0) drops.push({ trade: c, teamId: t.teamId, delta: t.delta });
    }
  }
  drops.sort((a, b) => a.delta - b.delta);

  for (const d of drops.slice(0, topN)) {
    const team = d.trade.teams.find(t => t.teamId === d.teamId)!;
    const topAsset = team.assets.sort((a, b) => (a.newScore - a.oldScore) - (b.newScore - b.oldScore))[0];
    console.log(`  ${d.delta.toFixed(1).padStart(7)}  ${d.teamId.padEnd(4)} ${d.trade.season}  ${d.trade.title.slice(0, 50).padEnd(50)}  ${team.oldScore.toFixed(1)}→${team.newScore.toFixed(1)}  (biggest: ${topAsset?.name || '?'} ${topAsset?.oldScore.toFixed(1)}→${topAsset?.newScore.toFixed(1)})`);
  }
}

function printWinnerFlips(comparisons: TradeComparison[], topN: number) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`  SECTION D: WINNER FLIPS`);
  console.log(`${'═'.repeat(80)}`);

  const flips = comparisons.filter(c => c.winnerFlipped)
    .sort((a, b) => Math.abs(b.newLopsidedness - b.oldLopsidedness) - Math.abs(a.newLopsidedness - a.oldLopsidedness));

  if (flips.length === 0) {
    console.log('  No winner flips detected.');
    return;
  }

  for (const f of flips.slice(0, topN)) {
    console.log(`  ${f.season}  ${f.title.slice(0, 55).padEnd(55)}  ${f.oldWinner}→${f.newWinner}  lopsided: ${f.oldLopsidedness.toFixed(1)}→${f.newLopsidedness.toFixed(1)}`);
  }
}

function printEdgeCases(
  comparisons: TradeComparison[],
  teamSeasonMap: Map<string, TeamSeasonFull>,
  allMultipliers: number[],
) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log('  SECTION E: EDGE CASE REPORT');
  console.log(`${'═'.repeat(80)}`);

  // Edge Case 1: AD trade — picks on rebuilding team
  const ad = comparisons.find(c => c.tradeId.startsWith('bbref-2019-07-06'));
  if (ad) {
    const nop = ad.teams.find(t => t.teamId === 'NOP');
    const lal = ad.teams.find(t => t.teamId === 'LAL');
    const nopDrop = nop ? ((nop.oldScore - nop.newScore) / nop.oldScore * 100) : 0;
    const sameWinner = ad.oldWinner === ad.newWinner;
    const pass = nopDrop > 0 && nopDrop < 80 && sameWinner;
    console.log(`\n  Edge Case 1: Picks developing on bad teams (AD trade)`);
    console.log(`    NOP: ${nop?.oldScore.toFixed(1)} → ${nop?.newScore.toFixed(1)} (${nopDrop.toFixed(0)}% drop)`);
    console.log(`    LAL: ${lal?.oldScore.toFixed(1)} → ${lal?.newScore.toFixed(1)}`);
    console.log(`    Winner unchanged: ${sameWinner}`);
    console.log(`    → ${pass ? 'PASS' : 'FAIL'} (expected 20-50% NOP drop, winner unchanged)`);
  }

  // Edge Case 2: Cliff effect
  // Count trades where winner flip was caused by a team within 2 games of .500 / playoff cutoff
  const cliffFlips = comparisons.filter(c => {
    if (!c.winnerFlipped) return false;
    // Check if any team had discounted seasons where team won 36+ games
    return c.teams.some(t => t.assets.some(a =>
      a.seasonDetails.some(sd => {
        const ts = teamSeasonMap.get(`${t.teamId}|${sd.season}`);
        return ts && ts.playoff_result === null && (ts.wins ?? 0) >= 36;
      })
    ));
  });
  const totalFlips = comparisons.filter(c => c.winnerFlipped).length;
  const cliffPct = totalFlips > 0 ? (cliffFlips.length / comparisons.length * 100) : 0;
  console.log(`\n  Edge Case 2: Cliff effect at playoff line`);
  console.log(`    Total winner flips: ${totalFlips}`);
  console.log(`    Flips involving 36+ win non-playoff team: ${cliffFlips.length} (${cliffPct.toFixed(1)}% of all trades)`);
  console.log(`    → ${cliffPct < 5 ? 'PASS' : 'FAIL'} (threshold: <5% of trades)`);
  if (cliffFlips.length > 0) {
    for (const f of cliffFlips.slice(0, 5)) {
      console.log(`      ${f.season} ${f.title.slice(0, 50)} — ${f.oldWinner}→${f.newWinner}`);
    }
  }

  // Edge Case 3: Pau Gasol early Grizzlies
  const pauDraft = comparisons.find(c => c.tradeId === '638c53f8-32a7-44bd-aff3-8eaaa345b863');
  if (pauDraft) {
    const mem = pauDraft.teams.find(t => t.teamId === 'MEM');
    const atl = pauDraft.teams.find(t => t.teamId === 'ATL');
    const memWins = pauDraft.newWinner === 'MEM' || (mem && atl && mem.newScore > atl.newScore);
    console.log(`\n  Edge Case 3: Pau Gasol on early Grizzlies`);
    console.log(`    MEM: ${mem?.oldScore.toFixed(1)} → ${mem?.newScore.toFixed(1)}`);
    console.log(`    ATL: ${atl?.oldScore.toFixed(1)} → ${atl?.newScore.toFixed(1)}`);
    console.log(`    MEM still wins: ${memWins}`);
    console.log(`    → ${memWins ? 'PASS' : 'FAIL'}`);
  }

  // Edge Case 4: Very bad teams — multiplier histogram
  allMultipliers.sort((a, b) => a - b);
  const below200 = allMultipliers.filter(m => m < 0.200).length;
  const below250 = allMultipliers.filter(m => m < 0.250).length;
  const below300 = allMultipliers.filter(m => m < 0.300).length;
  const below400 = allMultipliers.filter(m => m < 0.400).length;
  const p10 = allMultipliers[Math.floor(allMultipliers.length * 0.1)] ?? 0;
  console.log(`\n  Edge Case 4: Very bad teams — multiplier distribution`);
  console.log(`    Total discounted player-seasons: ${allMultipliers.length}`);
  console.log(`    Below .200: ${below200}`);
  console.log(`    Below .250: ${below250}`);
  console.log(`    Below .300: ${below300}`);
  console.log(`    Below .400: ${below400}`);
  console.log(`    10th percentile: ${p10.toFixed(3)}`);
  console.log(`    Min multiplier: ${allMultipliers.length > 0 ? allMultipliers[0].toFixed(3) : 'N/A'}`);
  console.log(`    → ${below250 <= 50 ? 'PASS' : 'FAIL'} (threshold: ≤50 player-seasons below .250)`);

  // Histogram buckets
  const buckets = [
    [0.100, 0.200], [0.200, 0.250], [0.250, 0.300], [0.300, 0.350],
    [0.350, 0.400], [0.400, 0.450], [0.450, 0.500], [0.500, 0.600],
  ];
  console.log(`    Histogram:`);
  for (const [lo, hi] of buckets) {
    const count = allMultipliers.filter(m => m >= lo && m < hi).length;
    const bar = '█'.repeat(Math.min(40, Math.round(count / 2)));
    console.log(`      [${lo.toFixed(3)}-${hi.toFixed(3)}): ${String(count).padStart(5)} ${bar}`);
  }

  // Edge Case 5: Lockout seasons
  console.log(`\n  Edge Case 5: Lockout seasons`);
  const lockoutSeasons = ['1998-99', '2011-12', '2019-20'];
  let lockoutPass = true;
  for (const ls of lockoutSeasons) {
    const entries: { teamId: string; wins: number; losses: number; total: number; pct: number; playoff: string }[] = [];
    for (const [key, ts] of teamSeasonMap) {
      if (ts.season === ls && ts.wins != null && ts.losses != null) {
        entries.push({
          teamId: ts.team_id,
          wins: ts.wins,
          losses: ts.losses,
          total: ts.wins + ts.losses,
          pct: ts.wins / (ts.wins + ts.losses),
          playoff: ts.playoff_result || 'missed',
        });
      }
    }
    entries.sort((a, b) => b.pct - a.pct);
    const anyZero = entries.some(e => e.total === 0);
    if (anyZero) lockoutPass = false;
    console.log(`    ${ls}: ${entries.length} teams, ${entries[0]?.total || 0} games, win pcts ${entries[entries.length - 1]?.pct.toFixed(3) || '?'}–${entries[0]?.pct.toFixed(3) || '?'}, any zero-game: ${anyZero}`);
  }
  console.log(`    → ${lockoutPass ? 'PASS' : 'FAIL'}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const curatedOnly = args.includes('--curated');
  const topArg = args.find(a => a.startsWith('--top'));
  const topN = topArg ? parseInt(topArg.includes('=') ? topArg.split('=')[1] : args[args.indexOf(topArg) + 1]) : 20;

  console.log('Loading Supabase data...');

  const [playerSeasons, accolades, teamSeasons] = await Promise.all([
    fetchAll<PlayerSeason>('player_seasons', 'player_name,team_id,season,win_shares,playoff_ws'),
    fetchAll<Accolade>('player_accolades', 'player_name,accolade,season'),
    fetchAll<TeamSeasonFull>('team_seasons', 'team_id,season,wins,losses,playoff_result,championship'),
  ]);

  console.log(`  player_seasons: ${playerSeasons.length}`);
  console.log(`  player_accolades: ${accolades.length}`);
  console.log(`  team_seasons: ${teamSeasons.length}`);

  // Build indexes
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

  const teamSeasonMap = new Map<string, TeamSeasonFull>();
  for (const row of teamSeasons) {
    teamSeasonMap.set(`${row.team_id}|${row.season}`, row);
  }

  console.log(`  Championships: ${championshipSet.size}`);
  console.log(`  Team-seasons indexed: ${teamSeasonMap.size}\n`);

  // Load trade JSON files
  const seasonFiles = fs.readdirSync(TRADES_DIR)
    .filter(f => f.endsWith('.json') && f !== 'search-index.json')
    .sort();

  let allTrades: Trade[] = [];
  for (const file of seasonFiles) {
    const trades = JSON.parse(fs.readFileSync(path.join(TRADES_DIR, file), 'utf-8')) as Trade[];
    allTrades.push(...trades);
  }

  if (curatedOnly) {
    allTrades = allTrades.filter(t => CURATED_TRADES.includes(t.id));
    console.log(`Curated mode: scoring ${allTrades.length} trades.\n`);
  } else {
    console.log(`Scoring ${allTrades.length} trades both ways...\n`);
  }

  // Score all trades
  const comparisons: TradeComparison[] = [];
  const allMultipliers: number[] = []; // all non-1.0 multipliers applied

  for (const trade of allTrades) {
    const comp = scoreTradeBothWays(
      trade, seasonsByPlayerTeam, accoladesByPlayer,
      championshipSet, teamChampPlayoffWs, teamSeasonMap,
    );
    comparisons.push(comp);

    // Collect multipliers for edge case analysis
    for (const team of comp.teams) {
      for (const asset of team.assets) {
        for (const sd of asset.seasonDetails) {
          if (sd.multiplier < 1.0 && sd.ws !== 0) {
            allMultipliers.push(sd.multiplier);
          }
        }
      }
    }
  }

  // ── Section A: Curated deep-dives ──
  console.log(`\n${'═'.repeat(80)}`);
  console.log('  SECTION A: CURATED TRADE DEEP-DIVES');
  console.log(`${'═'.repeat(80)}`);

  for (const id of CURATED_TRADES) {
    const comp = comparisons.find(c => c.tradeId === id);
    if (comp) {
      printCuratedDeepDive(comp);
    } else {
      console.log(`\n  ⚠️ Trade ${id} not found in dataset`);
    }
  }

  if (!curatedOnly) {
    // ── Section B: Aggregates ──
    printAggregateStats(comparisons);

    // ── Section C: Biggest drops ──
    printBiggestDrops(comparisons, topN);

    // ── Section D: Winner flips ──
    printWinnerFlips(comparisons, topN);
  }

  // ── Section E: Edge cases ──
  printEdgeCases(comparisons, teamSeasonMap, allMultipliers);

  console.log(`\n${'═'.repeat(80)}`);
  console.log('  SIMULATION COMPLETE — no database writes were made.');
  console.log(`${'═'.repeat(80)}\n`);
}

main().catch(console.error);
