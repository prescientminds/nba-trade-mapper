/**
 * Bobby Marks Engine: Validate all trades for salary cap legality.
 *
 * For each trade, looks up player salaries and salary cap thresholds,
 * then checks whether the trade's salary matching complies with the
 * CBA rules that were in effect at the time.
 *
 * Reads:   public/data/trades/by-season/*.json, player_contracts, salary_cap_history
 * Reports: Summary of legal/illegal/incomplete trades
 *
 * Usage:
 *   npx tsx scripts/validate-trade-salaries.ts                     # Validate all trades
 *   npx tsx scripts/validate-trade-salaries.ts --season 2023-24    # Single season
 *   npx tsx scripts/validate-trade-salaries.ts --illegal           # Only show illegal trades
 *   npx tsx scripts/validate-trade-salaries.ts --top 20            # Show top 20 most over-the-limit
 */

import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';
import {
  validateTrade,
  getCBAEra,
  type TradeAssetWithSalary,
  type CapThresholds,
  type TradeValidationResult,
} from '../src/lib/trade-validation';

const TRADES_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');

// ── Types ────────────────────────────────────────────────────────────

interface Trade {
  id: string;
  date: string;
  season: string;
  title: string;
  assets: {
    type: 'player' | 'pick' | 'swap' | 'cash';
    player_name: string | null;
    from_team_id: string;
    to_team_id: string;
    pick_year: number | null;
    pick_round: number | null;
    became_player_name: string | null;
  }[];
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
  luxury_tax: number | null;
  first_apron: number | null;
  second_apron: number | null;
}

// ── Name normalization (ported from score-trade-salaries.ts) ─────────

function stripDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Aliases mapping trade-JSON player names → player_contracts canonical names.
 * Keys are lowercase; values are the exact name in player_contracts.
 */
const SALARY_NAME_ALIASES: Record<string, string> = {
  // Nicknames / alternate names
  'maurice williams': 'Mo Williams',
  'anfernee hardaway': 'Anfernee Hardaway',
  'penny hardaway': 'Anfernee Hardaway',
  'predrag stojakovic': 'Peja Stojakovic',
  'ron artest': 'Metta World Peace',
  'metta world peace': 'Metta World Peace',
  'amare stoudemire': "Amar'e Stoudemire",
  "amar'e stoudemire": "Amar'e Stoudemire",
  'hidayet turkoglu': 'Hedo Turkoglu',
  'matthew dellavedova': 'Matthew Dellavedova',
  'matt dellavedova': 'Matthew Dellavedova',
  'domas sabonis': 'Domantas Sabonis',
  'louis williams': 'Lou Williams',
  'ishmael smith': 'Ish Smith',
  'louis amundson': 'Lou Amundson',
  'moe harkless': 'Maurice Harkless',
  'sviatoslav mykhailiuk': 'Svi Mykhailiuk',
  'moe wagner': 'Moritz Wagner',
  'patrick mills': 'Patty Mills',
  'ogugua anunoby': 'OG Anunoby',
  'o.g. anunoby': 'OG Anunoby',
  'mohamed bamba': 'Mo Bamba',
  'osasere ighodaro': 'Oso Ighodaro',
  'k.j. martin': 'Kenyon Martin Jr.',
  'kj martin': 'Kenyon Martin Jr.',

  // Jr./Sr. suffix mismatches
  'tim hardaway sr.': 'Tim Hardaway',
  'tim hardaway sr': 'Tim Hardaway',
  'mike dunleavy jr.': 'Mike Dunleavy',
  'mike dunleavy jr': 'Mike Dunleavy',
  'glen rice sr.': 'Glen Rice',
  'glen rice sr': 'Glen Rice',
  'marvin bagley': 'Marvin Bagley III',
  'r.j. barrett': 'RJ Barrett',
  'rj barrett': 'RJ Barrett',
  'walter clayton jr.': 'Walter Clayton',
  'walter clayton jr': 'Walter Clayton',
  'andre jackson': 'Andre Jackson Jr.',
  'kelly oubre jr.': 'Kelly Oubre',
  'kelly oubre jr': 'Kelly Oubre',
  'larry nance jr.': 'Larry Nance',
  'larry nance jr': 'Larry Nance',
  'kevin porter jr.': 'Kevin Porter',
  'kevin porter jr': 'Kevin Porter',

  // Spanish / accented names
  'juan hernangomez': 'Juancho Hernangomez',
  'juancho hernangomez': 'Juancho Hernangomez',
  'willy hernangomez': 'Guillermo Hernangomez',

  // Nickname variations
  'nick van exel': 'Nick Van Exel',
  'robert traylor': 'Robert Traylor',
  'tractor traylor': 'Robert Traylor',
  'popeye jones': 'Popeye Jones',
  'ronald jones': 'Popeye Jones',
  'truck robinson': 'Leonard Robinson',
  'malcom lee': 'Malcolm Lee',

  // Disambiguators from trade data
  'clifford robinson (r.)': 'Clifford Robinson',
};

/** Strings in trade JSON that aren't real player names */
const NOT_PLAYER_NAMES = new Set([
  'trade exception', 'did not convey', 'cash considerations',
  'cash', 'tpe', 'player option', 'team option',
]);

/**
 * Normalize a player name from trade JSON to match player_contracts.
 * Returns null if the string is not a real player name.
 */
function normalizePlayerName(name: string): string | null {
  if (!name) return null;

  // Handle slash-separated alternate names: "Maurice Williams / Mo Williams"
  // Try the second part first (usually the more common name), then first part
  if (name.includes(' / ')) {
    const parts = name.split(' / ').map(p => p.trim());
    for (const part of parts.reverse()) {
      const result = normalizePlayerName(part);
      if (result) return result;
    }
    return null;
  }

  // Strip diacritics first
  let cleaned = stripDiacritics(name).trim();

  // Remove disambiguators like (R.), (a), (b)
  cleaned = cleaned.replace(/\s*\([^)]*\)\s*$/, '').trim();

  // Check if it's a known non-player string
  const lower = cleaned.toLowerCase();
  if (NOT_PLAYER_NAMES.has(lower)) return null;
  if (lower.includes('trade exception')) return null;
  if (lower.includes('did not convey')) return null;
  if (lower.includes('protected')) return null;
  if (lower.includes('becomes $')) return null;
  if (lower.includes('picks)')) return null;

  // Check alias map
  const alias = SALARY_NAME_ALIASES[lower];
  if (alias) return alias;

  // Try without suffix for alias lookup
  const withoutSuffix = lower.replace(/\s+(jr\.?|sr\.?|iii|ii|iv|v)$/i, '').trim();
  if (withoutSuffix !== lower) {
    const suffixAlias = SALARY_NAME_ALIASES[withoutSuffix];
    if (suffixAlias) return suffixAlias;
  }

  return cleaned;
}

/** Get adjacent seasons for fallback salary lookup */
function getAdjacentSeasons(season: string): string[] {
  const start = parseInt(season.split('-')[0]);
  return [
    `${start - 1}-${String(start).slice(2)}`,
    `${start + 1}-${String(start + 2).slice(2)}`,
  ];
}

/** Estimate rookie salary based on draft round and salary cap */
function estimateRookieSalary(pickRound: number, cap: number): number {
  if (pickRound === 1) {
    // Mid-first-round estimate: ~4% of salary cap
    return Math.round(cap * 0.04);
  }
  // Second round: ~1.5% of cap (near minimum)
  return Math.round(cap * 0.015);
}

// ── Helpers ──────────────────────────────────────────────────────────

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

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const showIllegalOnly = args.includes('--illegal');
  const seasonArg = args.find(a => a.startsWith('--season'));
  const singleSeason = seasonArg
    ? (seasonArg.includes('=') ? seasonArg.split('=')[1] : args[args.indexOf(seasonArg) + 1])
    : null;
  const topArg = args.find(a => a.startsWith('--top'));
  const topN = topArg ? parseInt(topArg.includes('=') ? topArg.split('=')[1] : args[args.indexOf(topArg) + 1]) : 0;

  console.log('Loading data...');

  const [contracts, capHistory] = await Promise.all([
    fetchAll<ContractRow>('player_contracts', 'player_name,team_id,season,salary'),
    fetchAll<CapRow>('salary_cap_history', 'season,salary_cap,luxury_tax,first_apron,second_apron'),
  ]);

  console.log(`  player_contracts: ${contracts.length} rows`);
  console.log(`  salary_cap_history: ${capHistory.length} rows`);

  // Build salary lookup: "playerName|season" → salary
  // Index under both exact name and diacritics-stripped name for matching
  const salaryMap = new Map<string, number>();
  for (const c of contracts) {
    const key = `${c.player_name}|${c.season}`;
    // If a player has multiple contracts in a season (mid-season trade),
    // use the higher one (typically the one at trade time)
    const existing = salaryMap.get(key);
    if (!existing || c.salary > existing) {
      salaryMap.set(key, c.salary);
    }
    // Also index under diacritics-stripped name for fuzzy matching
    const stripped = stripDiacritics(c.player_name);
    if (stripped !== c.player_name) {
      const strippedKey = `${stripped}|${c.season}`;
      const existingStripped = salaryMap.get(strippedKey);
      if (!existingStripped || c.salary > existingStripped) {
        salaryMap.set(strippedKey, c.salary);
      }
    }
  }

  // Build cap thresholds by season
  const capBySeason = new Map<string, CapThresholds>();
  for (const c of capHistory) {
    capBySeason.set(c.season, {
      salary_cap: c.salary_cap,
      luxury_tax: c.luxury_tax,
      first_apron: c.first_apron,
      second_apron: c.second_apron,
    });
  }

  // Load trades
  const seasonFiles = fs.readdirSync(TRADES_DIR)
    .filter(f => f.endsWith('.json') && f !== 'search-index.json')
    .filter(f => !singleSeason || f === `${singleSeason}.json`)
    .sort();

  const allTrades: Trade[] = [];
  for (const file of seasonFiles) {
    const trades = JSON.parse(fs.readFileSync(path.join(TRADES_DIR, file), 'utf-8')) as Trade[];
    allTrades.push(...trades);
  }
  console.log(`Loaded ${allTrades.length} trades from ${seasonFiles.length} files.\n`);

  // Load known NBA player names for stash detection
  const playerSeasonRows = await fetchAll<{ player_name: string }>('player_seasons', 'player_name');
  const knownNBAPlayers = new Set<string>();
  for (const p of playerSeasonRows) {
    knownNBAPlayers.add(p.player_name);
    knownNBAPlayers.add(stripDiacritics(p.player_name));
  }
  console.log(`  Known NBA players (from player_seasons): ${knownNBAPlayers.size} unique name forms`);

  // Build rookie info from became_player_name across all trades
  const rookieInfo = new Map<string, { pick_round: number }>();
  for (const trade of allTrades) {
    for (const asset of trade.assets) {
      if (asset.became_player_name && asset.pick_round) {
        const name = stripDiacritics(asset.became_player_name);
        if (!rookieInfo.has(name)) {
          rookieInfo.set(name, { pick_round: asset.pick_round });
        }
      }
    }
  }
  console.log(`  Rookie info entries (from became_player_name): ${rookieInfo.size}`);

  // Diagnostic counters
  let adjSeasonHits = 0;
  let stashExclusions = 0;
  let rookieEstimates = 0;

  // Validate each trade
  const results: TradeValidationResult[] = [];

  for (const trade of allTrades) {
    const cap = capBySeason.get(trade.season);
    if (!cap) continue;  // No cap data for this season

    // Only validate trades with real player assets (filter out fake entries)
    const playerAssets = trade.assets.filter(a => {
      if (a.type !== 'player' || !a.player_name) return false;
      return normalizePlayerName(a.player_name) !== null;
    });
    if (playerAssets.length === 0) continue;  // Picks-only trade or all fake entries — skip

    // Build assets with salary data, using normalized names for lookup
    const assetsWithSalary: TradeAssetWithSalary[] = trade.assets.map(a => {
      if (a.type !== 'player' || !a.player_name) {
        return { type: a.type, player_name: a.player_name, from_team_id: a.from_team_id, to_team_id: a.to_team_id, salary: null };
      }
      const normalized = normalizePlayerName(a.player_name);
      if (!normalized) {
        // Fake entry (trade exception, etc.) — treat as non-player asset
        return { type: 'cash' as const, player_name: null, from_team_id: a.from_team_id, to_team_id: a.to_team_id, salary: null };
      }
      // Try normalized name, then exact original name, then each slash-separated part
      let salary = salaryMap.get(`${normalized}|${trade.season}`)
        ?? salaryMap.get(`${a.player_name}|${trade.season}`)
        ?? null;
      if (salary === null && a.player_name.includes(' / ')) {
        for (const part of a.player_name.split(' / ').map((p: string) => p.trim())) {
          salary = salaryMap.get(`${part}|${trade.season}`)
            ?? salaryMap.get(`${stripDiacritics(part)}|${trade.season}`)
            ?? null;
          if (salary !== null) break;
        }
      }
      // Fallback 1: adjacent season (player has contract data for nearby season)
      if (salary === null) {
        for (const adjSeason of getAdjacentSeasons(trade.season)) {
          salary = salaryMap.get(`${normalized}|${adjSeason}`)
            ?? salaryMap.get(`${a.player_name}|${adjSeason}`)
            ?? null;
          if (salary !== null) { adjSeasonHits++; break; }
        }
      }
      // Fallback 2: stash player — never appeared in NBA player_seasons
      if (salary === null) {
        const isKnownPlayer = knownNBAPlayers.has(normalized) || knownNBAPlayers.has(a.player_name);
        if (!isKnownPlayer) {
          stashExclusions++;
          return { type: 'cash' as const, player_name: null, from_team_id: a.from_team_id, to_team_id: a.to_team_id, salary: null };
        }
      }
      // Fallback 3: rookie scale estimation from draft info
      if (salary === null) {
        const ri = rookieInfo.get(normalized) || rookieInfo.get(stripDiacritics(a.player_name));
        if (ri) {
          salary = estimateRookieSalary(ri.pick_round, cap.salary_cap);
          rookieEstimates++;
        }
      }
      return { type: a.type, player_name: normalized, from_team_id: a.from_team_id, to_team_id: a.to_team_id, salary };
    });

    const result = validateTrade(trade.id, trade.date, trade.season, assetsWithSalary, cap);
    results.push(result);
  }

  // ── Summary statistics ────────────────────────────────────────────

  const legal = results.filter(r => r.isLegal && !r.hasIncompleteData);
  const illegal = results.filter(r => !r.isLegal && !r.hasIncompleteData);
  const incomplete = results.filter(r => r.hasIncompleteData);
  const totalValidated = results.length;

  console.log(`Validated ${totalValidated} trades with player assets.`);
  console.log(`  Legal (salary matching works):   ${legal.length} (${Math.round(legal.length / totalValidated * 100)}%)`);
  console.log(`  Illegal (may use cap room/TPE):  ${illegal.length} (${Math.round(illegal.length / totalValidated * 100)}%)`);
  console.log(`  Incomplete (missing salary data): ${incomplete.length} (${Math.round(incomplete.length / totalValidated * 100)}%)`);

  console.log(`\nFallback resolution:`);
  console.log(`  Adjacent season hits:   ${adjSeasonHits} player lookups resolved via ±1 season`);
  console.log(`  Stash player excluded:  ${stashExclusions} assets reclassified (never played in NBA)`);
  console.log(`  Rookie scale estimates: ${rookieEstimates} salaries estimated from draft round`);

  // CBA era breakdown
  const byEra = new Map<string, { total: number; legal: number; illegal: number; incomplete: number }>();
  for (const r of results) {
    const era = r.cbaEra;
    if (!byEra.has(era)) byEra.set(era, { total: 0, legal: 0, illegal: 0, incomplete: 0 });
    const e = byEra.get(era)!;
    e.total++;
    if (r.hasIncompleteData) e.incomplete++;
    else if (r.isLegal) e.legal++;
    else e.illegal++;
  }

  console.log('\nBy CBA era:');
  for (const [era, stats] of [...byEra.entries()].sort()) {
    console.log(`  ${era} CBA: ${stats.total} trades — ${stats.legal} legal, ${stats.illegal} flagged, ${stats.incomplete} incomplete`);
  }

  // ── Detail output ─────────────────────────────────────────────────

  const printResults = showIllegalOnly ? illegal : results.filter(r => !r.isLegal && !r.hasIncompleteData);

  // Sort by how far over the limit the trade is
  const sortedIllegal = [...printResults].sort((a, b) => {
    const aOverage = Math.max(...a.teams.map(t => t.incomingSalary - t.maxAllowedIncoming));
    const bOverage = Math.max(...b.teams.map(t => t.incomingSalary - t.maxAllowedIncoming));
    return bOverage - aOverage;
  });

  const printCount = topN || (sortedIllegal.length > 30 ? 30 : sortedIllegal.length);

  if (printCount > 0 && sortedIllegal.length > 0) {
    console.log(`\nTop ${printCount} trades that don't match standard over-the-cap rules:`);
    console.log('(These likely involved cap room, trade exceptions, or sign-and-trades)\n');

    for (const r of sortedIllegal.slice(0, printCount)) {
      console.log(`  [${r.season}] ${r.tradeDate}  ${r.cbaEra} CBA`);
      for (const t of r.teams) {
        if (t.outgoingPlayers.length === 0 && t.incomingPlayers.length === 0) continue;
        const status = t.isLegal ? 'OK' : 'OVER';
        const overage = t.incomingSalary - t.maxAllowedIncoming;
        const overageStr = overage > 0 ? ` [+$${(overage / 1e6).toFixed(1)}M over limit]` : '';
        console.log(`    ${t.teamId}: sends $${(t.outgoingSalary / 1e6).toFixed(1)}M, receives $${(t.incomingSalary / 1e6).toFixed(1)}M → max allowed $${(t.maxAllowedIncoming / 1e6).toFixed(1)}M ${status}${overageStr}`);
        if (t.outgoingPlayers.length > 0) {
          const names = t.outgoingPlayers.map(p => `${p.name} ($${(p.salary / 1e6).toFixed(1)}M)`).join(', ');
          console.log(`      OUT: ${names}`);
        }
        if (t.incomingPlayers.length > 0) {
          const names = t.incomingPlayers.map(p => `${p.name} ($${(p.salary / 1e6).toFixed(1)}M)`).join(', ');
          console.log(`      IN:  ${names}`);
        }
      }
    }
  }

  console.log('\nNote: "Illegal" trades typically used cap room, traded player exceptions (TPEs),');
  console.log('or sign-and-trade provisions — all legal mechanisms not captured in basic matching.');
}

main().catch(console.error);
