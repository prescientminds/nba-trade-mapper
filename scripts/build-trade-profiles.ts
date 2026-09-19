/**
 * Build TradeProfile[] for the comparables engine.
 *
 * Reads:   public/data/trades/by-season/*.json
 *          Supabase: trade_scores, player_seasons, player_contracts, salary_cap_history
 * Writes:  public/data/trade-profiles.json
 *
 * Output is the input shape `findComparables()` in src/lib/comparables.ts expects.
 * Only trades that have a row in `trade_scores` are included (1,927 as of 2026-04).
 *
 * Run after any scoring refresh:
 *   npx tsx scripts/build-trade-profiles.ts
 *   npx tsx scripts/build-trade-profiles.ts --dry-run   # Print counts, no file write
 */

import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';

const TRADES_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');
const OUT_FILE   = path.join(__dirname, '..', 'public', 'data', 'trade-profiles.json');
const MOTIVATIONS_FILE = path.join(__dirname, '..', 'public', 'data', 'trade-motivations.json');

// ── Types matching the public static JSON + src/lib/comparables.ts ──

interface StaticTradeAsset {
  type: 'player' | 'pick' | 'swap' | 'cash';
  player_name: string | null;
  from_team_id: string | null;
  to_team_id: string | null;
  pick_year: number | null;
  pick_round: number | null;
  original_team_id: string | null;
  became_player_name: string | null;
  notes: string | null;
}

interface StaticTrade {
  id: string;
  date: string;
  season: string;
  title: string;
  description: string;
  is_multi_team: boolean;
  teams: { team_id: string; role: string }[];
  assets: StaticTradeAsset[];
}

interface PlayerSeasonRow {
  player_name: string;
  team_id: string;
  season: string;
  gp: number | null;
  mp: number | null;
  age: number | null;
  bpm: number | null;
}

interface ContractRow {
  player_name: string;
  team_id: string | null;
  season: string;
  salary: number | null;
}

interface CapRow {
  season: string;
  salary_cap: number | null;
}

interface TradeScoreRow {
  trade_id: string;
  winner: string | null;
  lopsidedness: number | null;
  team_scores: Record<string, { score: number; assets: { name: string; score: number }[] }> | null;
}

// Shape mirrors src/lib/comparables.ts — kept inline to avoid cross-importing app code into a script.
interface PlayerProfile {
  name: string;
  age: number;
  bpm: number | null;
  contractYearsRemaining: number | null;
  capPct: number | null;
}

interface TeamSide {
  teamId: string;
  players: PlayerProfile[];
  pickCount: number;
}

interface TradeProfile {
  id: string;
  year: number;
  sides: TeamSide[];
  motivation?: string;
  motivationSource?: 'hand' | 'auto';
  outcomeSummary?: string;
  headline?: string;
}

interface MotivationEntry {
  trade_id: string;
  motivation: string;
  source: 'hand' | 'auto';
  reasoning?: string;
}

// ── Name normalization ──────────────────────────────────────────────

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Map trade-JSON suffixed names to stats-database canonical names (copied from score-trades.ts). */
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

function canonicalName(name: string): string {
  return SUFFIX_ALIASES[name] ?? name;
}

// ── Season math ─────────────────────────────────────────────────────

/** "2018-19" → 2019 (end-year integer). */
function seasonEndYear(season: string): number {
  const start = parseInt(season.slice(0, 4), 10);
  return start + 1;
}

/** Prior season string: "2018-19" → "2017-18". */
function priorSeason(season: string): string {
  const start = parseInt(season.slice(0, 4), 10);
  const prevStart = start - 1;
  return `${prevStart}-${String(prevStart + 1).slice(2)}`;
}

/**
 * Pick the season string to use for pre-trade stats.
 * Offseason trades (before Oct 15 of season's start year) → prior completed season.
 * Midseason trades → the season of the trade (pre-trade stint row).
 */
function preTradeLookupSeason(tradeDate: string, tradeSeason: string): string {
  const startYear = parseInt(tradeSeason.slice(0, 4), 10);
  const cutoff = `${startYear}-10-15`;
  return tradeDate < cutoff ? priorSeason(tradeSeason) : tradeSeason;
}

// ── Bulk loaders ────────────────────────────────────────────────────

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`fetch ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

// ── Indexes ─────────────────────────────────────────────────────────

/** Map (player|season) → rows (may have multiple teams for mid-season traded players). */
function indexSeasonsByPlayer(rows: PlayerSeasonRow[]): Map<string, PlayerSeasonRow[]> {
  const map = new Map<string, PlayerSeasonRow[]>();
  for (const r of rows) {
    if (!r.player_name || !r.season) continue;
    const names = new Set<string>([r.player_name, stripDiacritics(r.player_name)]);
    for (const n of names) {
      const k = `${n}|${r.season}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
  }
  return map;
}

/** Map (player|season|team) → contract row. */
function indexContracts(rows: ContractRow[]): {
  byKey: Map<string, ContractRow>;
  futureCount: Map<string, number>;
} {
  const byKey = new Map<string, ContractRow>();
  const byPlayer = new Map<string, ContractRow[]>();
  for (const r of rows) {
    if (!r.player_name || !r.season) continue;
    const names = new Set<string>([r.player_name, stripDiacritics(r.player_name)]);
    for (const n of names) {
      if (r.team_id) byKey.set(`${n}|${r.season}|${r.team_id}`, r);
      byKey.set(`${n}|${r.season}`, r);
      if (!byPlayer.has(n)) byPlayer.set(n, []);
      byPlayer.get(n)!.push(r);
    }
  }
  const futureCount = new Map<string, number>();
  for (const [player, list] of byPlayer) {
    list.sort((a, b) => a.season.localeCompare(b.season));
    for (const r of list) {
      const later = list.filter((x) => x.season > r.season && (x.salary ?? 0) > 0).length;
      futureCount.set(`${player}|${r.season}`, later);
    }
  }
  return { byKey, futureCount };
}

// ── Profile builders ────────────────────────────────────────────────

function findPreTradeRow(
  playerName: string,
  tradeDate: string,
  tradeSeason: string,
  sendingTeamId: string,
  seasonsByPlayer: Map<string, PlayerSeasonRow[]>
): PlayerSeasonRow | null {
  const lookup = preTradeLookupSeason(tradeDate, tradeSeason);
  const isMidseason = lookup === tradeSeason;
  const candidates = seasonsByPlayer.get(`${playerName}|${lookup}`) ?? [];
  if (candidates.length === 0) return null;

  if (isMidseason) {
    const sending = candidates.find((r) => r.team_id === sendingTeamId);
    if (sending) return sending;
  }
  return candidates.reduce((a, b) => ((a.mp ?? 0) >= (b.mp ?? 0) ? a : b));
}

function buildPlayerProfile(
  rawName: string,
  sendingTeamId: string,
  trade: StaticTrade,
  seasonsByPlayer: Map<string, PlayerSeasonRow[]>,
  contracts: { byKey: Map<string, ContractRow>; futureCount: Map<string, number> },
  capBySeason: Map<string, number>
): PlayerProfile | null {
  const name = canonicalName(rawName);
  const row = findPreTradeRow(name, trade.date, trade.season, sendingTeamId, seasonsByPlayer);

  // Age: from player_seasons. Null if we have no pre-trade row.
  const age = row?.age ?? null;
  if (age === null) return null;  // can't place in an age bracket → skip

  const bpm = row?.bpm ?? null;

  // Contract: look up at the sending team in the trade's season.
  const contractKey =
    contracts.byKey.get(`${name}|${trade.season}|${sendingTeamId}`) ??
    contracts.byKey.get(`${name}|${trade.season}`) ??
    null;
  const salary = contractKey?.salary ?? null;
  const cap = capBySeason.get(trade.season) ?? null;
  const capPct = salary && cap ? salary / cap : null;
  const contractYearsRemaining = contracts.futureCount.get(`${name}|${trade.season}`) ?? null;

  return { name, age, bpm, contractYearsRemaining, capPct };
}

function buildOutcomeSummary(score: TradeScoreRow | undefined): string | undefined {
  if (!score || !score.winner) return undefined;
  const lop = score.lopsidedness ?? 0;
  return `${score.winner} won (lopsidedness ${lop.toFixed(1)})`;
}

function buildHeadline(trade: StaticTrade, sides: TeamSide[]): string | undefined {
  // Destination = side receiving the highest-BPM anchor.
  let best: { teamId: string; name: string; bpm: number } | null = null;
  for (const s of sides) {
    for (const p of s.players) {
      const bpm = p.bpm ?? -Infinity;
      if (!best || bpm > best.bpm) {
        const dest = trade.teams.find((t) => t.team_id !== s.teamId)?.team_id ?? s.teamId;
        best = { teamId: dest, name: p.name, bpm };
      }
    }
  }
  if (!best || !Number.isFinite(best.bpm)) return trade.title;
  return `${best.name} → ${best.teamId} (${trade.date})`;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  // 1. Load all static trades keyed by id.
  const staticById = new Map<string, StaticTrade>();
  const seasonFiles = fs.readdirSync(TRADES_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json');
  for (const f of seasonFiles) {
    const raw = fs.readFileSync(path.join(TRADES_DIR, f), 'utf-8');
    const trades: StaticTrade[] = JSON.parse(raw);
    for (const t of trades) staticById.set(t.id, t);
  }
  console.log(`Loaded ${staticById.size} static trades across ${seasonFiles.length} season files.`);

  // 1b. Load hand-tagged motivations (unblocks Stage 1 gate for canonical analogs).
  const motivationByTrade = new Map<string, { motivation: string; source: 'hand' | 'auto' }>();
  if (fs.existsSync(MOTIVATIONS_FILE)) {
    const raw = fs.readFileSync(MOTIVATIONS_FILE, 'utf-8');
    const entries: MotivationEntry[] = JSON.parse(raw);
    for (const e of entries) {
      motivationByTrade.set(e.trade_id, { motivation: e.motivation, source: e.source });
    }
    console.log(`Loaded ${motivationByTrade.size} motivation tags from trade-motivations.json`);
  } else {
    console.log('No trade-motivations.json found — all profiles will be untagged.');
  }

  // 2. Load Supabase tables in parallel.
  console.log('Fetching Supabase tables…');
  const [scoreRows, seasonRows, contractRows, capRows] = await Promise.all([
    fetchAll<TradeScoreRow>('trade_scores', 'trade_id, winner, lopsidedness, team_scores'),
    fetchAll<PlayerSeasonRow>('player_seasons', 'player_name, team_id, season, gp, mp, age, bpm'),
    fetchAll<ContractRow>('player_contracts', 'player_name, team_id, season, salary'),
    fetchAll<CapRow>('salary_cap_history', 'season, salary_cap'),
  ]);
  console.log(`  trade_scores: ${scoreRows.length}`);
  console.log(`  player_seasons: ${seasonRows.length}`);
  console.log(`  player_contracts: ${contractRows.length}`);
  console.log(`  salary_cap_history: ${capRows.length}`);

  // 3. Build indexes.
  const seasonsByPlayer = indexSeasonsByPlayer(seasonRows);
  const contracts = indexContracts(contractRows);
  const capBySeason = new Map<string, number>();
  for (const r of capRows) if (r.salary_cap) capBySeason.set(r.season, r.salary_cap);
  const scoreById = new Map<string, TradeScoreRow>();
  for (const r of scoreRows) scoreById.set(r.trade_id, r);

  // 4. Build profiles.
  const profiles: TradeProfile[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const score of scoreRows) {
    const trade = staticById.get(score.trade_id);
    if (!trade) { skipped.push({ id: score.trade_id, reason: 'no-static-trade' }); continue; }

    // Group assets by sending team.
    const teamIds = new Set<string>();
    for (const a of trade.assets) {
      if (a.from_team_id) teamIds.add(a.from_team_id);
    }
    if (teamIds.size < 2) { skipped.push({ id: trade.id, reason: 'fewer-than-2-sides' }); continue; }

    const sides: TeamSide[] = [];
    for (const teamId of teamIds) {
      const players: PlayerProfile[] = [];
      for (const a of trade.assets) {
        if (a.type !== 'player' || a.from_team_id !== teamId || !a.player_name) continue;
        const p = buildPlayerProfile(
          a.player_name, teamId, trade, seasonsByPlayer, contracts, capBySeason
        );
        if (p) players.push(p);
      }
      const pickCount = trade.assets.filter(
        (a) => a.type === 'pick' && a.from_team_id === teamId
      ).length;
      sides.push({ teamId, players, pickCount });
    }

    // Drop trades where no side has any resolvable player (pick-only trades, data gaps).
    const anyPlayers = sides.some((s) => s.players.length > 0);
    if (!anyPlayers) { skipped.push({ id: trade.id, reason: 'no-resolvable-players' }); continue; }

    const tag = motivationByTrade.get(trade.id);
    profiles.push({
      id: trade.id,
      year: seasonEndYear(trade.season),
      sides,
      motivation: tag?.motivation,
      motivationSource: tag?.source,
      outcomeSummary: buildOutcomeSummary(scoreById.get(trade.id)),
      headline: buildHeadline(trade, sides),
    });
  }

  // 5. Report.
  const withBpm = profiles.filter((p) =>
    p.sides.some((s) => s.players.some((pl) => pl.bpm !== null))
  ).length;
  const withCap = profiles.filter((p) =>
    p.sides.some((s) => s.players.some((pl) => pl.capPct !== null))
  ).length;
  const withMotivation = profiles.filter((p) => p.motivation).length;

  console.log('');
  console.log(`Built ${profiles.length} trade profiles.`);
  console.log(`  with ≥1 player BPM:    ${withBpm}`);
  console.log(`  with ≥1 player cap%:   ${withCap}`);
  console.log(`  with motivation tags:  ${withMotivation}`);
  console.log(`  skipped: ${skipped.length}`);
  const skipReasons = new Map<string, number>();
  for (const s of skipped) skipReasons.set(s.reason, (skipReasons.get(s.reason) ?? 0) + 1);
  for (const [reason, n] of skipReasons) console.log(`    ${reason}: ${n}`);

  if (dryRun) {
    console.log('');
    console.log('Dry run — no file written. Sample profile:');
    console.log(JSON.stringify(profiles[0], null, 2));
    return;
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(profiles));
  const kb = Math.round(fs.statSync(OUT_FILE).size / 1024);
  console.log('');
  console.log(`Wrote ${OUT_FILE} (${kb} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
