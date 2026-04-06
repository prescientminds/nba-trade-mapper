/**
 * Query engine for NBA moves — surfaces content-ready ranked lists from
 * trade_scores and transaction_scores tables.
 *
 * Preset queries modeled on Zack Kram ESPN carousel format:
 * each result = player, move, team, season, data point, verdict.
 *
 * Usage:
 *   npx tsx scripts/query-moves.ts --best-signings           # Top CATV non-trade moves
 *   npx tsx scripts/query-moves.ts --worst-contracts          # Worst $/WS (paid most for least)
 *   npx tsx scripts/query-moves.ts --best-trades              # Most lopsided trades
 *   npx tsx scripts/query-moves.ts --steals                   # Best CATV per dollar
 *   npx tsx scripts/query-moves.ts --biggest-wins             # Highest team win delta
 *   npx tsx scripts/query-moves.ts --best-extensions          # Extensions that paid off
 *   npx tsx scripts/query-moves.ts --worst-extensions         # Extensions that didn't
 *   npx tsx scripts/query-moves.ts --undrafted-gems           # Best undrafted/min signings
 *   npx tsx scripts/query-moves.ts --championship-signings    # Signings that led to rings
 *   npx tsx scripts/query-moves.ts --verdict-flips            # Trades where winner reversed
 *
 * Filters (combinable with any preset):
 *   --since 2020              # Seasons from 2020-21 onward
 *   --team LAL                # Single team
 *   --type signing            # Transaction type filter
 *   --min-seasons 2           # Minimum seasons scored (default: varies by query)
 *   --limit 10                # Results to show (default: 10)
 *   --json                    # Output as JSON array
 */

import { supabase } from './lib/supabase-admin';

// ── Types ────────────────────────────────────────────────────────────────

interface TransactionRow {
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

interface TradeRow {
  trade_id: string;
  season: string;
  team_scores: Record<string, { score: number; assets: AssetScore[] }>;
  winner: string | null;
  lopsidedness: number;
}

interface AssetScore {
  name: string;
  type: string;
  seasons: number;
  ws: number;
  playoff_ws: number;
  championships: number;
  accolades: string[];
  accolade_bonus: number;
  score: number;
}

interface TradeIndex {
  id: string;
  date: string;
  season: string;
  title: string;
  teams: string[];
  players: string[];
  topAssets: string[];
}

// ── Formatters ───────────────────────────────────────────────────────────

function fmt$(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function fmtWs(n: number): string {
  return n.toFixed(1);
}

function seasonToYear(season: string): number {
  return parseInt(season.split('-')[0]);
}

// ── Data loaders ─────────────────────────────────────────────────────────

async function fetchAll<T>(table: string, columns: string, filters?: { season_gte?: string; team?: string; type?: string }): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  const PAGE = 1000;

  while (true) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (filters?.season_gte) q = q.gte('season', filters.season_gte);
    if (filters?.team) q = q.eq('team_id', filters.team);
    if (filters?.type) q = q.eq('transaction_type', filters.type);

    const { data, error } = await q;
    if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function fetchTradeScores(filters?: { season_gte?: string }): Promise<TradeRow[]> {
  const rows: TradeRow[] = [];
  let from = 0;
  const PAGE = 1000;

  while (true) {
    let q = supabase.from('trade_scores').select('trade_id,season,team_scores,winner,lopsidedness').range(from, from + PAGE - 1);
    if (filters?.season_gte) q = q.gte('season', filters.season_gte);

    const { data, error } = await q;
    if (error) throw new Error(`Failed to fetch trade_scores: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as TradeRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function fetchVerdictFlips(): Promise<any[]> {
  const rows: any[] = [];
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('verdict_flips')
      .select('*')
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`Failed to fetch verdict_flips: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

// ── Per-season salary baselines ──────────────────────────────────────────
// "What WS do peers at the same cap-% produce this season?"

const CAP_TIERS = [
  { label: 'Min (0-3%)',     min: 0,    max: 0.03 },
  { label: 'Low (3-8%)',     min: 0.03, max: 0.08 },
  { label: 'Mid (8-13%)',    min: 0.08, max: 0.13 },
  { label: 'Solid (13-18%)', min: 0.13, max: 0.18 },
  { label: 'Starter (18-22%)', min: 0.18, max: 0.22 },
  { label: 'Above Avg (22-26%)', min: 0.22, max: 0.26 },
  { label: 'All-Star (26-30%)', min: 0.26, max: 0.30 },
  { label: 'Star (30-33%)',  min: 0.30, max: 0.33 },
  { label: 'Max (33-37%)',   min: 0.33, max: 0.37 },
  { label: 'Supermax (37%+)', min: 0.37, max: Infinity },
];

function getTierIdx(capPct: number): number {
  for (let i = 0; i < CAP_TIERS.length; i++) {
    if (capPct >= CAP_TIERS[i].min && capPct < CAP_TIERS[i].max) return i;
  }
  return CAP_TIERS.length - 1;
}

// season|tierIdx → avg WS for all players at that tier in that season
type BaselineMap = Map<string, number>;

async function buildBaselinesAndPerSeason(): Promise<{ baselines: BaselineMap; perSeason: PerSeasonMap }> {
  const fetchAllUnfiltered = async <T>(table: string, columns: string): Promise<T[]> => {
    const rows: T[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE - 1);
      if (error) throw new Error(`Baseline: failed to fetch ${table}: ${error.message}`);
      if (!data || data.length === 0) break;
      rows.push(...(data as T[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return rows;
  };

  const [contracts, playerSeasons, capHistory] = await Promise.all([
    fetchAllUnfiltered<{ player_name: string; team_id: string; season: string; salary: number }>('player_contracts', 'player_name,team_id,season,salary'),
    fetchAllUnfiltered<{ player_name: string; team_id: string; season: string; win_shares: number | null }>('player_seasons', 'player_name,team_id,season,win_shares'),
    fetchAllUnfiltered<{ season: string; salary_cap: number }>('salary_cap_history', 'season,salary_cap'),
  ]);

  // WS lookup
  const wsLookup = new Map<string, number>();
  for (const ps of playerSeasons) {
    if (ps.win_shares === null) continue;
    const key = `${ps.player_name}|${ps.team_id}|${ps.season}`;
    if (!wsLookup.has(key) || ps.win_shares > (wsLookup.get(key) || 0)) {
      wsLookup.set(key, ps.win_shares);
    }
  }

  // Cap lookup
  const capBySeason = new Map<string, number>();
  for (const c of capHistory) capBySeason.set(c.season, c.salary_cap);

  // Build both baselines AND per-season data in one pass
  const buckets = new Map<string, number[]>();
  const perSeason: PerSeasonMap = new Map();

  for (const c of contracts) {
    const key3 = `${c.player_name}|${c.team_id}|${c.season}`;
    const ws = wsLookup.get(key3);
    if (ws === undefined) continue;
    const cap = capBySeason.get(c.season) || 100_000_000;
    const capPct = c.salary / cap;

    // Baselines
    const ti = getTierIdx(capPct);
    const bkey = `${c.season}|${ti}`;
    if (!buckets.has(bkey)) buckets.set(bkey, []);
    buckets.get(bkey)!.push(ws);

    // Per-season
    const ptKey = `${c.player_name}|${c.team_id}`;
    if (!perSeason.has(ptKey)) perSeason.set(ptKey, []);
    perSeason.get(ptKey)!.push({ season: c.season, salary: c.salary, capPct, ws });
  }

  const baselines: BaselineMap = new Map();
  for (const [bkey, wsList] of buckets) {
    baselines.set(bkey, wsList.reduce((s, v) => s + v, 0) / wsList.length);
  }

  // Sort per-season rows chronologically
  for (const [, rows] of perSeason) {
    rows.sort((a, b) => a.season.localeCompare(b.season));
  }

  return { baselines, perSeason };
}

/** Get expected WS for a player given their cap_pct and season. */
function getExpectedWs(baselines: BaselineMap, season: string, capPct: number): { tierLabel: string; expectedWs: number } | null {
  const ti = getTierIdx(capPct);
  const avg = baselines.get(`${season}|${ti}`);
  if (avg === undefined) return null;
  return { tierLabel: CAP_TIERS[ti].label, expectedWs: avg };
}

// ── Per-season contract data (for true per-season scoring) ───────────────

interface SeasonDetail {
  season: string;
  salary: number;
  capPct: number;
  ws: number;
}

// player+team → array of per-season {season, salary, capPct, ws}
type PerSeasonMap = Map<string, SeasonDetail[]>;

// ── Dedup helper ─────────────────────────────────────────────────────────

/** Keep only the highest-CATV row per player+team combo. */
function dedupByPlayerTeam(rows: TransactionRow[]): TransactionRow[] {
  const best = new Map<string, TransactionRow>();
  for (const r of rows) {
    const key = `${r.player_name}|${r.team_id}`;
    const existing = best.get(key);
    if (!existing || r.catv_score > existing.catv_score) {
      best.set(key, r);
    }
  }
  return [...best.values()];
}

// ── Query presets ────────────────────────────────────────────────────────

type QueryResult = {
  rank: number;
  headline: string;
  subline: string;
  data: string;
  season: string;
  raw: any;
};

function queryBestSignings(rows: TransactionRow[], limit: number, minSeasons: number): QueryResult[] {
  return dedupByPlayerTeam(rows)
    .filter(r => r.catv_score > 0 && r.seasons_scored >= minSeasons)
    .sort((a, b) => b.catv_score - a.catv_score)
    .slice(0, limit)
    .map((r, i) => ({
      rank: i + 1,
      headline: `${r.player_name} → ${r.team_id}`,
      subline: `${r.transaction_type} | ${r.seasons_scored} seasons`,
      data: `CATV ${r.catv_score.toFixed(1)} | ${fmtWs(r.win_shares)} WS${r.playoff_ws > 0 ? ` | ${fmtWs(r.playoff_ws)} playoff WS` : ''}${r.championships > 0 ? ` | ${r.championships} ring${r.championships > 1 ? 's' : ''}` : ''}${r.salary_at_move ? ` | ${fmt$(r.salary_at_move)}` : ''}`,
      season: r.season,
      raw: r,
    }));
}

function queryWorstContracts(rows: TransactionRow[], baselines: BaselineMap, perSeasonData: PerSeasonMap, limit: number, minSeasons: number): QueryResult[] {
  // True per-season scoring: each season compared against that season's baseline
  const deduped = dedupByPlayerTeam(rows);
  const scored: { row: TransactionRow; totalDelta: number; seasons: number; avgDelta: number; details: string }[] = [];

  for (const r of deduped) {
    if (r.seasons_scored < minSeasons) continue;
    const key = `${r.player_name}|${r.team_id}`;
    const seasonRows = perSeasonData.get(key);
    if (!seasonRows || seasonRows.length < minSeasons) continue;

    let totalDelta = 0;
    let counted = 0;
    let tierLabels: string[] = [];

    for (const s of seasonRows) {
      const baseline = getExpectedWs(baselines, s.season, s.capPct);
      if (!baseline) continue;
      totalDelta += s.ws - baseline.expectedWs;
      tierLabels.push(baseline.tierLabel);
      counted++;
    }

    if (counted < minSeasons || totalDelta >= 0) continue;

    const avgDelta = totalDelta / counted;
    // Most common tier
    const tierCounts = new Map<string, number>();
    for (const t of tierLabels) tierCounts.set(t, (tierCounts.get(t) || 0) + 1);
    const dominantTier = [...tierCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

    const avgCapPct = seasonRows.reduce((s, r) => s + r.capPct, 0) / seasonRows.length;
    const avgWs = seasonRows.reduce((s, r) => s + r.ws, 0) / seasonRows.length;
    const avgExpected = seasonRows.reduce((s, r) => {
      const b = getExpectedWs(baselines, r.season, r.capPct);
      return s + (b?.expectedWs ?? 0);
    }, 0) / counted;

    scored.push({
      row: r,
      totalDelta: Math.round(totalDelta * 100) / 100,
      seasons: counted,
      avgDelta: Math.round(avgDelta * 100) / 100,
      details: `Expected: ${avgExpected.toFixed(1)} WS/yr | Actual: ${avgWs.toFixed(1)} WS/yr | Delta: ${avgDelta.toFixed(1)}/yr (${totalDelta.toFixed(1)} total) | ${dominantTier} (avg ${(avgCapPct * 100).toFixed(0)}% of cap)${r.total_salary ? ` | ${fmt$(r.total_salary)}` : ''}`,
    });
  }

  scored.sort((a, b) => a.totalDelta - b.totalDelta);

  return scored.slice(0, limit).map((s, i) => ({
    rank: i + 1,
    headline: `${s.row.player_name} → ${s.row.team_id}`,
    subline: `${s.row.transaction_type} | ${s.seasons} seasons`,
    data: s.details,
    season: s.row.season,
    raw: { ...s.row, totalDelta: s.totalDelta, avgDelta: s.avgDelta },
  }));
}

function querySteals(rows: TransactionRow[], limit: number, minSeasons: number): QueryResult[] {
  // Best CATV per dollar — high value at low cost
  return dedupByPlayerTeam(rows)
    .filter(r => r.catv_score > 5 && r.total_salary && r.total_salary > 0 && r.seasons_scored >= minSeasons)
    .map(r => ({ ...r, catvPerDollar: r.catv_score / (r.total_salary! / 1_000_000) }))
    .sort((a, b) => b.catvPerDollar - a.catvPerDollar)
    .slice(0, limit)
    .map((r, i) => ({
      rank: i + 1,
      headline: `${r.player_name} → ${r.team_id}`,
      subline: `${r.transaction_type} | ${r.seasons_scored} seasons`,
      data: `CATV ${r.catv_score.toFixed(1)} for ${fmt$(r.total_salary!)} (${r.catvPerDollar.toFixed(1)} CATV/$M) | ${fmtWs(r.win_shares)} WS`,
      season: r.season,
      raw: r,
    }));
}

function queryBiggestWins(rows: TransactionRow[], limit: number, minSeasons: number): QueryResult[] {
  // Only show the highest-CATV player per team-season (the player most responsible for the jump)
  const bestPerTeamSeason = new Map<string, TransactionRow>();
  for (const r of dedupByPlayerTeam(rows)) {
    if (r.win_delta === null || r.seasons_scored < minSeasons) continue;
    const key = `${r.team_id}|${r.season}`;
    const existing = bestPerTeamSeason.get(key);
    if (!existing || r.catv_score > existing.catv_score) bestPerTeamSeason.set(key, r);
  }
  return [...bestPerTeamSeason.values()]
    .sort((a, b) => (b.win_delta ?? 0) - (a.win_delta ?? 0))
    .slice(0, limit)
    .map((r, i) => ({
      rank: i + 1,
      headline: `${r.player_name} → ${r.team_id}`,
      subline: `${r.transaction_type} | ${r.team_wins_before}W → ${r.team_wins_after}W`,
      data: `+${r.win_delta}W | CATV ${r.catv_score.toFixed(1)} | ${fmtWs(r.win_shares)} WS${r.salary_at_move ? ` | ${fmt$(r.salary_at_move)}` : ''}`,
      season: r.season,
      raw: r,
    }));
}

function queryBestExtensions(rows: TransactionRow[], limit: number, minSeasons: number): QueryResult[] {
  return dedupByPlayerTeam(rows)
    .filter(r => r.transaction_type === 'extension' && r.catv_score > 0 && r.seasons_scored >= minSeasons)
    .sort((a, b) => b.catv_score - a.catv_score)
    .slice(0, limit)
    .map((r, i) => ({
      rank: i + 1,
      headline: `${r.player_name} → ${r.team_id}`,
      subline: `extension | ${r.seasons_scored} seasons`,
      data: `CATV ${r.catv_score.toFixed(1)} | ${fmtWs(r.win_shares)} WS${r.total_salary ? ` | ${fmt$(r.total_salary)} total` : ''}${r.dollars_per_ws && r.dollars_per_ws > 0 ? ` | ${fmt$(r.dollars_per_ws)}/WS` : ''}`,
      season: r.season,
      raw: r,
    }));
}

function queryWorstExtensions(rows: TransactionRow[], limit: number, minSeasons: number): QueryResult[] {
  return dedupByPlayerTeam(rows)
    .filter(r => r.transaction_type === 'extension' && r.total_salary && r.total_salary > 10_000_000 && r.seasons_scored >= minSeasons)
    .sort((a, b) => {
      const aVal = a.dollars_per_ws ?? 0;
      const bVal = b.dollars_per_ws ?? 0;
      if (aVal < 0 && bVal < 0) return aVal - bVal;
      if (aVal < 0) return -1;
      if (bVal < 0) return 1;
      return bVal - aVal;
    })
    .slice(0, limit)
    .map((r, i) => {
      const dpws = r.dollars_per_ws !== null
        ? (r.dollars_per_ws < 0 ? `${fmt$(-r.dollars_per_ws)} for ≤0 WS` : `${fmt$(r.dollars_per_ws)}/WS`)
        : '';
      return {
        rank: i + 1,
        headline: `${r.player_name} → ${r.team_id}`,
        subline: `extension | ${r.seasons_scored} seasons`,
        data: `${dpws} | total ${fmt$(r.total_salary || 0)} | ${fmtWs(r.win_shares)} WS`,
        season: r.season,
        raw: r,
      };
    });
}

function queryChampionshipSignings(rows: TransactionRow[], limit: number): QueryResult[] {
  return dedupByPlayerTeam(rows)
    .filter(r => r.championships > 0 && ['signing', 'claimed', 'rest_of_season'].includes(r.transaction_type))
    .sort((a, b) => b.catv_score - a.catv_score)
    .slice(0, limit)
    .map((r, i) => ({
      rank: i + 1,
      headline: `${r.player_name} → ${r.team_id}`,
      subline: `${r.transaction_type} | ${r.championships} ring${r.championships > 1 ? 's' : ''}`,
      data: `CATV ${r.catv_score.toFixed(1)} | ${fmtWs(r.win_shares)} WS | ${fmtWs(r.playoff_ws)} playoff WS${r.salary_at_move ? ` | ${fmt$(r.salary_at_move)}` : ''}`,
      season: r.season,
      raw: r,
    }));
}

function queryBestTrades(trades: TradeRow[], tradeIndex: Map<string, TradeIndex>, limit: number): QueryResult[] {
  return trades
    .filter(t => t.winner && t.lopsidedness > 0)
    .sort((a, b) => b.lopsidedness - a.lopsidedness)
    .slice(0, limit)
    .map((t, i) => {
      const idx = tradeIndex.get(t.trade_id);
      const teams = Object.entries(t.team_scores).sort((a, b) => b[1].score - a[1].score);
      const winnerTeam = teams[0];
      const loserTeam = teams[1];
      const winnerTopPlayer = winnerTeam[1].assets
        .filter(a => a.type === 'player')
        .sort((a, b) => b.score - a.score)[0];
      const loserTopPlayer = loserTeam?.[1].assets
        .filter(a => a.type === 'player')
        .sort((a, b) => b.score - a.score)[0];

      return {
        rank: i + 1,
        headline: idx?.title || `${winnerTeam[0]} / ${loserTeam?.[0] || '???'} Trade`,
        subline: `${winnerTeam[0]} ${winnerTeam[1].score.toFixed(1)} vs ${loserTeam?.[0]} ${loserTeam?.[1].score.toFixed(1)}`,
        data: `Gap: ${t.lopsidedness.toFixed(1)}${winnerTopPlayer ? ` | ${winnerTopPlayer.name}: ${fmtWs(winnerTopPlayer.ws)} WS` : ''}${loserTopPlayer ? ` | ${loserTopPlayer.name}: ${fmtWs(loserTopPlayer.ws)} WS` : ''}`,
        season: t.season,
        raw: t,
      };
    });
}

// ── Kram-style preset: best & worst moves since a date ───────────────────

function queryBestMovesSince(txRows: TransactionRow[], trades: TradeRow[], tradeIndex: Map<string, TradeIndex>, limit: number, minSeasons: number): QueryResult[] {
  // Combine trades and transactions into one ranked list by value delivered
  const results: QueryResult[] = [];
  const deduped = dedupByPlayerTeam(txRows);

  // Non-trade moves
  for (const r of deduped) {
    if (r.catv_score <= 0 || r.seasons_scored < minSeasons) continue;
    results.push({
      rank: 0,
      headline: `${r.player_name} → ${r.team_id}`,
      subline: `${r.transaction_type} | ${r.seasons_scored} seasons`,
      data: `CATV ${r.catv_score.toFixed(1)} | ${fmtWs(r.win_shares)} WS${r.salary_at_move ? ` | ${fmt$(r.salary_at_move)}` : ''}${r.win_delta !== null && r.win_delta > 0 ? ` | +${r.win_delta}W` : ''}`,
      season: r.season,
      raw: { ...r, _source: 'transaction' },
    });
  }

  // Trades: score = winner's CATV advantage
  for (const t of trades) {
    if (!t.winner || t.lopsidedness <= 0) continue;
    const idx = tradeIndex.get(t.trade_id);
    const teams = Object.entries(t.team_scores).sort((a, b) => b[1].score - a[1].score);
    const winner = teams[0];
    const topPlayer = winner[1].assets.filter(a => a.type === 'player').sort((a, b) => b.score - a.score)[0];

    results.push({
      rank: 0,
      headline: idx?.title || `${teams.map(t => t[0]).join(' / ')} Trade`,
      subline: `trade | ${winner[0]} wins ${winner[1].score.toFixed(1)} to ${teams[1]?.[1].score.toFixed(1)}`,
      data: `Gap: ${t.lopsidedness.toFixed(1)}${topPlayer ? ` | ${topPlayer.name}: ${fmtWs(topPlayer.ws)} WS in ${topPlayer.seasons}yr` : ''}`,
      season: t.season,
      raw: { ...t, _source: 'trade' },
    });
  }

  // Sort by CATV (transactions) or lopsidedness (trades) — normalize to one scale
  results.sort((a, b) => {
    const aScore = a.raw._source === 'trade' ? a.raw.lopsidedness : a.raw.catv_score;
    const bScore = b.raw._source === 'trade' ? b.raw.lopsidedness : b.raw.catv_score;
    return bScore - aScore;
  });

  return results.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }));
}

function queryWorstMovesSince(txRows: TransactionRow[], baselines: BaselineMap, perSeasonData: PerSeasonMap, trades: TradeRow[], tradeIndex: Map<string, TradeIndex>, limit: number, minSeasons: number): QueryResult[] {
  const results: QueryResult[] = [];
  const deduped = dedupByPlayerTeam(txRows);

  // Non-trade moves: true per-season scoring
  for (const r of deduped) {
    if (r.seasons_scored < minSeasons) continue;
    const key = `${r.player_name}|${r.team_id}`;
    const seasonRows = perSeasonData.get(key);
    if (!seasonRows || seasonRows.length < minSeasons) continue;

    let totalDelta = 0;
    let counted = 0;
    for (const s of seasonRows) {
      const baseline = getExpectedWs(baselines, s.season, s.capPct);
      if (!baseline) continue;
      totalDelta += s.ws - baseline.expectedWs;
      counted++;
    }
    if (counted < minSeasons || totalDelta >= 0) continue;
    const avgDelta = totalDelta / counted;
    const avgWs = seasonRows.reduce((s, r) => s + r.ws, 0) / seasonRows.length;
    const avgCapPct = seasonRows.reduce((s, r) => s + r.capPct, 0) / seasonRows.length;
    const avgExpected = seasonRows.reduce((s, r) => {
      const b = getExpectedWs(baselines, r.season, r.capPct);
      return s + (b?.expectedWs ?? 0);
    }, 0) / counted;

    results.push({
      rank: 0,
      headline: `${r.player_name} → ${r.team_id}`,
      subline: `${r.transaction_type} | avg ${(avgCapPct * 100).toFixed(0)}% of cap | ${counted} seasons`,
      data: `Expected: ${avgExpected.toFixed(1)} WS/yr | Actual: ${avgWs.toFixed(1)} WS/yr | Delta: ${avgDelta.toFixed(1)}/yr (${totalDelta.toFixed(1)} total)${r.total_salary ? ` | ${fmt$(r.total_salary)}` : ''}`,
      season: r.season,
      raw: { ...r, _source: 'transaction', badness: -totalDelta },
    });
  }

  // Trades: losing side's perspective
  for (const t of trades) {
    if (!t.winner || t.lopsidedness < 20) continue;
    const idx = tradeIndex.get(t.trade_id);
    const teams = Object.entries(t.team_scores).sort((a, b) => a[1].score - b[1].score);
    const loser = teams[0];
    const loserTopPlayer = loser[1].assets.filter(a => a.type === 'player').sort((a, b) => b.score - a.score)[0];

    results.push({
      rank: 0,
      headline: idx?.title || `${teams.map(tt => tt[0]).join(' / ')} Trade`,
      subline: `trade | ${loser[0]} got ${loser[1].score.toFixed(1)} vs ${teams[teams.length - 1][1].score.toFixed(1)}`,
      data: `Gap: -${t.lopsidedness.toFixed(1)}${loserTopPlayer ? ` | ${loserTopPlayer.name}: ${fmtWs(loserTopPlayer.ws)} WS` : ''}`,
      season: t.season,
      raw: { ...t, _source: 'trade', badness: t.lopsidedness },
    });
  }

  results.sort((a, b) => (b.raw.badness || 0) - (a.raw.badness || 0));
  return results.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }));
}

// ── Output ───────────────────────────────────────────────────────────────

function printResults(title: string, results: QueryResult[], asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(70)}\n`);

  for (const r of results) {
    console.log(`  ${String(r.rank).padStart(2)}.  ${r.headline}  [${r.season}]`);
    console.log(`      ${r.subline}`);
    console.log(`      ${r.data}`);
    console.log();
  }

  console.log(`  ${results.length} results shown.\n`);
}

// ── CLI ──────────────────────────────────────────────────────────────────

function parseArg(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  // Check for --flag=value
  if (flag.includes('=')) return flag.split('=')[1];
  const argAtIdx = args[idx];
  if (argAtIdx.includes('=')) return argAtIdx.split('=')[1];
  return args[idx + 1] || null;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
NBA Move Query Engine — surface content-ready ranked lists.

Presets:
  --best-signings          Top CATV non-trade moves (all types)
  --worst-contracts        Worst $/WS contracts
  --best-trades            Most lopsided trades
  --steals                 Best CATV per dollar spent
  --biggest-wins           Highest team win delta after move
  --best-extensions        Extensions that paid off
  --worst-extensions       Extensions that didn't
  --championship-signings  Non-trade moves that led to rings
  --best-moves             Combined trades + signings by value (Kram format)
  --worst-moves            Combined worst trades + contracts (Kram format)
  --verdict-flips          Trades where winner reversed by year 5

Filters:
  --since 2020             Seasons from 2020-21 onward
  --team LAL               Single team filter
  --type signing           Transaction type (signing/extension/claimed/10_day/etc.)
  --min-seasons 2          Minimum seasons with data (default: varies)
  --limit 10               Results to show (default: 10)
  --json                   Output as JSON
`);
    return;
  }

  // Parse filters
  const sinceArg = parseArg(args, '--since');
  const sinceYear = sinceArg ? parseInt(sinceArg) : null;
  const seasonGte = sinceYear ? `${sinceYear}-${String(sinceYear + 1).slice(2)}` : undefined;

  const team = parseArg(args, '--team') || undefined;
  const type = parseArg(args, '--type') || undefined;
  const limitArg = parseArg(args, '--limit');
  const limit = limitArg ? parseInt(limitArg) : 10;
  const minSeasonsArg = parseArg(args, '--min-seasons');
  const minSeasons = minSeasonsArg ? parseInt(minSeasonsArg) : 2;
  const asJson = args.includes('--json');

  // Figure out which presets are requested
  const presets = {
    bestSignings:         args.includes('--best-signings'),
    worstContracts:       args.includes('--worst-contracts'),
    bestTrades:           args.includes('--best-trades'),
    steals:               args.includes('--steals'),
    biggestWins:          args.includes('--biggest-wins'),
    bestExtensions:       args.includes('--best-extensions'),
    worstExtensions:      args.includes('--worst-extensions'),
    championshipSignings: args.includes('--championship-signings'),
    bestMoves:            args.includes('--best-moves'),
    worstMoves:           args.includes('--worst-moves'),
    verdictFlips:         args.includes('--verdict-flips'),
  };

  const needsTxData = presets.bestSignings || presets.worstContracts || presets.steals
    || presets.biggestWins || presets.bestExtensions || presets.worstExtensions
    || presets.championshipSignings || presets.bestMoves || presets.worstMoves;

  const needsTradeData = presets.bestTrades || presets.bestMoves || presets.worstMoves;

  const needsBaselines = presets.worstContracts || presets.worstMoves;

  // Load data
  if (!asJson) console.log('Loading data...');

  let txRows: TransactionRow[] = [];
  let tradeRows: TradeRow[] = [];
  let tradeIndex = new Map<string, TradeIndex>();
  let baselines: BaselineMap = new Map();
  let perSeasonData: PerSeasonMap = new Map();

  const promises: Promise<void>[] = [];

  if (needsBaselines) {
    promises.push(
      buildBaselinesAndPerSeason().then(({ baselines: b, perSeason: ps }) => {
        baselines = b;
        perSeasonData = ps;
      })
    );
  }

  if (needsTxData) {
    promises.push(
      fetchAll<TransactionRow>(
        'transaction_scores',
        'transaction_id,season,transaction_type,player_name,team_id,seasons_scored,win_shares,playoff_ws,championships,championship_bonus,accolades,accolade_bonus,catv_score,salary_at_move,total_salary,dollars_per_ws,cap_pct,team_wins_before,team_wins_after,win_delta',
        { season_gte: seasonGte, team, type },
      ).then(rows => { txRows = rows; })
    );
  }

  if (needsTradeData) {
    promises.push(
      fetchTradeScores({ season_gte: seasonGte }).then(rows => { tradeRows = rows; })
    );

    // Load trade index for titles
    promises.push(
      (async () => {
        const fs = await import('fs');
        const path = await import('path');
        const indexPath = path.join(__dirname, '..', 'public', 'data', 'trades', 'index.json');
        const idx: TradeIndex[] = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        for (const t of idx) tradeIndex.set(t.id, t);
      })()
    );
  }

  if (presets.verdictFlips) {
    // verdict_flips table loaded separately
  }

  await Promise.all(promises);

  // Apply team filter to trades (trade_scores doesn't have a team_id column)
  if (team && tradeRows.length > 0) {
    tradeRows = tradeRows.filter(t => Object.keys(t.team_scores).includes(team));
  }

  if (!asJson) {
    console.log(`  Transactions: ${txRows.length} rows`);
    if (tradeRows.length > 0) console.log(`  Trades: ${tradeRows.length} rows`);
    if (seasonGte) console.log(`  Filter: since ${seasonGte}`);
    if (team) console.log(`  Filter: team ${team}`);
    if (type) console.log(`  Filter: type ${type}`);
  }

  // Run presets
  if (presets.bestSignings) {
    printResults('BEST NON-TRADE MOVES (by CATV)', queryBestSignings(txRows, limit, minSeasons), asJson);
  }
  if (presets.worstContracts) {
    printResults('WORST CONTRACTS (per-season vs same-year, same-tier peers)', queryWorstContracts(txRows, baselines, perSeasonData, limit, minSeasons), asJson);
  }
  if (presets.steals) {
    printResults('BIGGEST STEALS (CATV per $M spent)', querySteals(txRows, limit, minSeasons), asJson);
  }
  if (presets.biggestWins) {
    printResults('BIGGEST WIN JUMPS AFTER MOVE', queryBiggestWins(txRows, limit, minSeasons), asJson);
  }
  if (presets.bestExtensions) {
    printResults('BEST EXTENSIONS', queryBestExtensions(txRows, limit, minSeasons), asJson);
  }
  if (presets.worstExtensions) {
    printResults('WORST EXTENSIONS', queryWorstExtensions(txRows, limit, minSeasons), asJson);
  }
  if (presets.championshipSignings) {
    printResults('CHAMPIONSHIP-WINNING SIGNINGS', queryChampionshipSignings(txRows, limit), asJson);
  }
  if (presets.bestTrades) {
    printResults('MOST LOPSIDED TRADES', queryBestTrades(tradeRows, tradeIndex, limit), asJson);
  }
  if (presets.bestMoves) {
    printResults('BEST MOVES — ALL TYPES (Kram format)', queryBestMovesSince(txRows, tradeRows, tradeIndex, limit, minSeasons), asJson);
  }
  if (presets.worstMoves) {
    printResults('WORST MOVES — ALL TYPES (Kram format)', queryWorstMovesSince(txRows, baselines, perSeasonData, tradeRows, tradeIndex, limit, minSeasons), asJson);
  }
  if (presets.verdictFlips) {
    try {
      const flips = await fetchVerdictFlips();
      const results: QueryResult[] = flips
        .sort((a: any, b: any) => (b.flip_magnitude || 0) - (a.flip_magnitude || 0))
        .slice(0, limit)
        .map((f: any, i: number) => {
          const idx = tradeIndex.get(f.trade_id);
          return {
            rank: i + 1,
            headline: idx?.title || f.trade_id,
            subline: `Early winner: ${f.early_winner} → Late winner: ${f.late_winner}`,
            data: `Flip magnitude: ${(f.flip_magnitude || 0).toFixed(1)} | Early gap: ${(f.early_gap || 0).toFixed(1)} → Late gap: ${(f.late_gap || 0).toFixed(1)}`,
            season: f.season || '',
            raw: f,
          };
        });
      printResults('VERDICT FLIPS (winner reversed by year 5)', results, asJson);
    } catch (e: any) {
      console.error(`verdict_flips query failed: ${e.message}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
