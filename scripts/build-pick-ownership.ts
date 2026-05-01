/**
 * Derive current pick ownership for every future NBA pick from the static
 * trade JSON files (`public/data/trades/by-season/*.json`).
 *
 * Static JSON is the project's source of truth (see repo CLAUDE.md); Supabase
 * only has a partial CSV-era import of pick assets. Reading the JSON captures
 * every traded pick from 1976-present, including modern Durant/PG/Siakam-era
 * blockbusters.
 *
 * Writes: public/data/pick-ownership.json
 *
 * Algorithm:
 *   For each (original_team_id, year, round) tuple where year ∈ [2026..2032]
 *   and round ∈ [1, 2]:
 *     1. Collect all pick-asset entries matching the pick across all seasons.
 *     2. Sort chronologically by trade date.
 *     3. Current owner = to_team_id of the most recent trade,
 *        or original_team_id if the pick has never been traded.
 *     4. Lineage = ordered chain of {trade_id, date, from, to, snippet}.
 *     5. Flag `conditional` when any linked trade's description mentions
 *        protection/swap language. (Full protection parsing is a separate pass.)
 *
 * Usage:
 *   npx tsx scripts/build-pick-ownership.ts            # writes the JSON
 *   npx tsx scripts/build-pick-ownership.ts --dry-run  # prints counts only
 */

import * as fs from 'fs';
import * as path from 'path';

const TRADES_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');
const OUT_FILE = path.join(__dirname, '..', 'public', 'data', 'pick-ownership.json');
const PROTECTIONS_FILE = path.join(__dirname, '..', 'public', 'data', 'pick-protections.json');

const YEARS = [2026, 2027, 2028, 2029, 2030, 2031, 2032] as const;
const ROUNDS = [1, 2] as const;

const PROTECTION_RE =
  /protect|top[- ]\d|lottery|unprotected|least favorable|most favorable|did not convey|swap/i;

/**
 * Resolve a pick's original team. Static-JSON pick assets almost never have
 * `original_team_id` populated, so we parse the clarifier in the description:
 *   "2028 1st-rd pick is BKN own"
 * If no clarifier, we fall back to the `from_team_id` — a reasonable default
 * for picks being traded out for the first time.
 */
function resolveOriginalTeam(
  pickYear: number,
  pickRound: 1 | 2,
  fromTeamId: string | null,
  description: string,
  explicit: string | null,
): string | null {
  if (explicit) return explicit;
  const roundLabel = pickRound === 1 ? '1st' : '2nd';
  const re = new RegExp(
    `${pickYear}[^.]*?${roundLabel}[^.]*?is\\s+([A-Z]{3})\\s*own`,
    'i',
  );
  const m = description.match(re);
  if (m) return m[1].toUpperCase();
  return fromTeamId;
}

interface StaticTradeAsset {
  type: 'player' | 'pick' | 'swap' | 'cash' | string;
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
  description: string;
  assets: StaticTradeAsset[];
}

interface LineageStep {
  trade_id: string;
  date: string;
  from_team_id: string | null;
  to_team_id: string | null;
  description_snippet: string;
}

interface OwnedPick {
  pick_key: string;
  year: number;
  round: 1 | 2;
  original_team_id: string;
  current_owner_team_id: string;
  /**
   * 'pick' = outright pick ownership (the holder will make the selection).
   * 'swap' = swap right (the holder controls an option to swap with the
   * original team's pick; the underlying selection still belongs to the
   * original team unless the swap is exercised).
   *
   * Sourced from pick-protections.json — any pick_key parsed there as a
   * swap_right gets re-classed here.
   */
  asset_class: 'pick' | 'swap';
  conditional: boolean;
  lineage: LineageStep[];
}

interface Output {
  generated_at: string;
  stats: {
    total_picks: number;
    traded_picks: number;
    conditional_picks: number;
    swap_picks: number;
  };
  teams: Record<string, OwnedPick[]>;
}

// All 30 team IDs — mirrors src/lib/teams.ts
const TEAM_IDS = [
  'ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW',
  'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK',
  'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS',
] as const;

/**
 * Load the set of pick_keys that the protection parser flagged as swap
 * rights. We use this to re-class entries in the ownership table — the raw
 * trade JSON's `type: 'pick'` rows model the chain but lose the swap-vs-
 * outright distinction. The parsed protections file is authoritative.
 */
function loadSwapPickKeys(): Set<string> {
  if (!fs.existsSync(PROTECTIONS_FILE)) return new Set();
  const raw = fs.readFileSync(PROTECTIONS_FILE, 'utf-8');
  const parsed = JSON.parse(raw) as {
    picks: Record<string, { asset_class?: 'pick' | 'swap' }>;
  };
  const swaps = new Set<string>();
  for (const [pickKey, entry] of Object.entries(parsed.picks ?? {})) {
    if (entry.asset_class === 'swap') swaps.add(pickKey);
  }
  return swaps;
}

function loadAllTrades(): StaticTrade[] {
  const files = fs.readdirSync(TRADES_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json');
  const out: StaticTrade[] = [];
  for (const f of files) {
    const raw = fs.readFileSync(path.join(TRADES_DIR, f), 'utf-8');
    const arr: StaticTrade[] = JSON.parse(raw);
    for (const t of arr) out.push(t);
  }
  return out;
}

/** Pull the one clause of a description that references this pick, trimmed. */
function snippetFor(
  description: string | null,
  year: number,
  round: 1 | 2,
): string {
  if (!description) return '';
  const roundLabel = round === 1 ? '1st' : '2nd';
  const patterns = [
    new RegExp(`${year}[^.]*${roundLabel}[^.]*pick[^.]*?(?:\\.|$)`, 'i'),
    new RegExp(`${year}[^.]*draft pick[^.]*?(?:\\.|$)`, 'i'),
  ];
  for (const re of patterns) {
    const m = description.match(re);
    if (m) return m[0].trim().slice(0, 220);
  }
  // Fallback: first 160 chars
  return description.slice(0, 160);
}

function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('Loading static trade JSON…');
  const trades = loadAllTrades();
  console.log(`  trades: ${trades.length}`);

  const swapPickKeys = loadSwapPickKeys();
  console.log(`  swap pick_keys (from pick-protections.json): ${swapPickKeys.size}`);

  // Flatten pick assets across all trades, tagged with their parent trade id/date.
  interface FlatPick extends StaticTradeAsset {
    trade_id: string;
    trade_date: string;
    trade_description: string;
    resolved_original_team_id: string | null;
  }
  const picks: FlatPick[] = [];
  let resolvedExplicit = 0;
  let resolvedFromDesc = 0;
  let resolvedFromFallback = 0;
  let unresolved = 0;

  for (const t of trades) {
    for (const a of t.assets) {
      if (a.type !== 'pick') continue;
      if (!a.pick_year || !a.pick_round) continue;
      if (a.pick_round !== 1 && a.pick_round !== 2) continue;

      const explicit = a.original_team_id;
      const resolved = resolveOriginalTeam(
        a.pick_year,
        a.pick_round as 1 | 2,
        a.from_team_id,
        t.description,
        explicit,
      );
      if (explicit) resolvedExplicit += 1;
      else if (resolved && resolved !== a.from_team_id) resolvedFromDesc += 1;
      else if (resolved) resolvedFromFallback += 1;
      else unresolved += 1;

      picks.push({
        ...a,
        trade_id: t.id,
        trade_date: t.date,
        trade_description: t.description,
        resolved_original_team_id: resolved,
      });
    }
  }
  console.log(`  pick assets: ${picks.length}`);
  console.log(`    explicit original_team_id: ${resolvedExplicit}`);
  console.log(`    resolved via "is XXX own" clause: ${resolvedFromDesc}`);
  console.log(`    fallback to from_team_id: ${resolvedFromFallback}`);
  console.log(`    unresolved (dropped): ${unresolved}`);

  // Group by (resolved_original_team, year, round).
  const groups = new Map<string, FlatPick[]>();
  for (const r of picks) {
    if (!r.resolved_original_team_id) continue;
    if (!r.pick_year || !r.pick_round) continue;
    const y = r.pick_year;
    if (!YEARS.includes(y as typeof YEARS[number])) continue;
    const key = `${r.resolved_original_team_id}|${y}|${r.pick_round}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  // Build canonical pick records for every (team × year × round).
  const picksByOwner = new Map<string, OwnedPick[]>();
  let totalPicks = 0;
  let tradedPicks = 0;
  let conditionalPicks = 0;
  let swapPicks = 0;

  for (const originalTeam of TEAM_IDS) {
    for (const year of YEARS) {
      for (const round of ROUNDS) {
        const key = `${originalTeam}|${year}|${round}`;
        const assets = (groups.get(key) ?? []).slice();
        assets.sort((a, b) => a.trade_date.localeCompare(b.trade_date));

        // Build the chain by matching from_team=originalTeam for the first
        // step, then from_team=(prev to_team) for subsequent steps. Candidate
        // rows that don't link to the current head are ignored — this filters
        // out intermediaries and miscategorized rows without double-counting.
        type Step = LineageStep & { _date: string; _desc: string };
        const chain: Step[] = [];
        let head = originalTeam as string;
        const unused = new Set(assets.map((_, i) => i));
        while (true) {
          let matchIdx = -1;
          for (const i of unused) {
            if (assets[i].from_team_id === head) { matchIdx = i; break; }
          }
          if (matchIdx === -1) break;
          unused.delete(matchIdx);
          const a = assets[matchIdx];
          chain.push({
            trade_id: a.trade_id,
            date: a.trade_date,
            from_team_id: a.from_team_id,
            to_team_id: a.to_team_id,
            description_snippet: snippetFor(a.trade_description, year, round),
            _date: a.trade_date,
            _desc: a.trade_description,
          });
          head = a.to_team_id ?? head;
        }

        const lineage: LineageStep[] = chain.map(({ _date: _, _desc: __, ...rest }) => rest);
        const currentOwner = head;

        // Mark conditional if ANY matched chain step (or any unmatched
        // candidate for this pick) mentions protection language.
        const allDescs = assets.map((a) => a.trade_description);
        const conditional = allDescs.some((d) => PROTECTION_RE.test(d));

        const pickKey = `${year}-${round}-${originalTeam}`;
        // Only flag asset_class='swap' when the chain actually shows the
        // pick moving away from the original team — i.e., the holder is
        // someone other than the original. The protections file flags both
        // sides (the original team's encumbered pick AND the holder's
        // swap right), but for the validator's "can't re-trade swap as
        // pick" rule, the salient case is the holder. When current_owner
        // === original_team, our chain didn't reach the holder (a known
        // data gap); leave it as 'pick' to avoid a false positive on the
        // original team's own pick.
        const assetClass: 'pick' | 'swap' =
          swapPickKeys.has(pickKey) && currentOwner !== originalTeam ? 'swap' : 'pick';

        const pick: OwnedPick = {
          pick_key: pickKey,
          year,
          round,
          original_team_id: originalTeam,
          current_owner_team_id: currentOwner,
          asset_class: assetClass,
          conditional,
          lineage,
        };

        const arr = picksByOwner.get(currentOwner) ?? [];
        arr.push(pick);
        picksByOwner.set(currentOwner, arr);

        totalPicks += 1;
        if (lineage.length > 0) tradedPicks += 1;
        if (conditional) conditionalPicks += 1;
        if (assetClass === 'swap') swapPicks += 1;
      }
    }
  }

  // Sort each team's picks: year asc, round asc, original team (own picks first).
  const sortedTeams: Record<string, OwnedPick[]> = {};
  for (const teamId of TEAM_IDS) {
    const list = picksByOwner.get(teamId) ?? [];
    list.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      if (a.round !== b.round) return a.round - b.round;
      // Own picks first, then alphabetical by origin.
      const aOwn = a.original_team_id === teamId ? 0 : 1;
      const bOwn = b.original_team_id === teamId ? 0 : 1;
      if (aOwn !== bOwn) return aOwn - bOwn;
      return a.original_team_id.localeCompare(b.original_team_id);
    });
    sortedTeams[teamId] = list;
  }

  const output: Output = {
    generated_at: new Date().toISOString(),
    stats: {
      total_picks: totalPicks,
      traded_picks: tradedPicks,
      conditional_picks: conditionalPicks,
      swap_picks: swapPicks,
    },
    teams: sortedTeams,
  };

  console.log('');
  console.log(`Total pick records: ${totalPicks}`);
  console.log(`  traded (any step): ${tradedPicks}`);
  console.log(`  conditional:       ${conditionalPicks}`);
  console.log(`  swap-class:        ${swapPicks}`);
  for (const teamId of TEAM_IDS) {
    const list = sortedTeams[teamId] ?? [];
    const traded = list.filter((p) => p.original_team_id !== teamId).length;
    const own = list.filter((p) => p.original_team_id === teamId).length;
    console.log(`  ${teamId}: ${list.length} picks (${own} own, ${traded} acquired)`);
  }

  if (dryRun) {
    console.log('\nDry run — no file written.');
    return;
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(output));
  const kb = Math.round(fs.statSync(OUT_FILE).size / 1024);
  console.log(`\nWrote ${OUT_FILE} (${kb} KB)`);
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
