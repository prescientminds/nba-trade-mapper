/**
 * Verify all trades against Basketball-Reference cached HTML.
 * Compares our static JSON assets against BBRef's authoritative records.
 * Adds missing assets, fixes null pick fields. Never removes existing data.
 *
 * Usage:
 *   npx tsx scripts/verify-trades.ts                    # Report only (dry run)
 *   npx tsx scripts/verify-trades.ts --apply            # Apply fixes to JSON files
 *   npx tsx scripts/verify-trades.ts --season 2012-13   # Scope to one season
 *   npx tsx scripts/verify-trades.ts --verbose          # Show all matches, not just discrepancies
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { dateToSeason } from './lib/team-resolver';
import {
  parseTradeText,
  normalizeName,
  buildSearchIndexEntry,
  type StaticTrade,
  type StaticTradeAsset,
  type SearchIndexEntry,
} from './lib/bbref-parser';

// ── Config ───────────────────────────────────────────────────────────
const CACHE_DIR = path.join(__dirname, '..', 'data', 'bbref-cache');
const SEASON_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');
const INDEX_PATH = path.join(__dirname, '..', 'public', 'data', 'trades', 'index.json');

// ── Types ────────────────────────────────────────────────────────────

interface BBRefTrade {
  date: string;
  teams: Set<string>;
  playerNames: string[];
  assets: StaticTradeAsset[];
  rawText: string;
}

interface Discrepancy {
  tradeId: string;
  date: string;
  title: string;
  confidence: 'exact' | 'high' | 'low';
  missingAssets: StaticTradeAsset[];
  fixableNulls: { assetIndex: number; field: string; oldValue: null; newValue: number }[];
}

// ── BBRef Cache Reader ───────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function loadBBRefTradesForDate(dateStr: string): BBRefTrade[] {
  const d = new Date(dateStr);
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const cachePath = path.join(CACHE_DIR, `${month}-${day}.html`);

  if (!fs.existsSync(cachePath)) return [];

  const html = fs.readFileSync(cachePath, 'utf-8');
  const $ = cheerio.load(html);
  const results: BBRefTrade[] = [];

  $('ul.page_index > li').each((_, li) => {
    const dateText = $(li).find('p > strong').first().text().trim();
    if (!dateText) return;

    const parsedDate = new Date(dateText);
    if (isNaN(parsedDate.getTime())) return;

    const liDateStr = formatDate(parsedDate);
    if (liDateStr !== dateStr) return;

    const txYear = parsedDate.getFullYear();

    $(li).find('p.transaction').each((_, p) => {
      const pText = $(p).text().trim();
      if (!pText.toLowerCase().includes('traded')) return;

      const trades = parseTradeText($, p, txYear);
      for (const trade of trades) {
        const teamSet = new Set(trade.teams.map(t => t.team_id));
        const playerNames = trade.assets
          .filter(a => a.type === 'player' && a.player_name)
          .map(a => a.player_name!);

        results.push({
          date: dateStr,
          teams: teamSet,
          playerNames,
          assets: trade.assets,
          rawText: pText.replace(/\s+/g, ' ').trim(),
        });
      }
    });
  });

  return results;
}

// ── Matching ─────────────────────────────────────────────────────────

function teamOverlap(a: string[], b: Set<string>): number {
  return a.filter(t => b.has(t)).length;
}

function playerOverlap(ourPlayers: string[], bbrefPlayers: string[]): number {
  const ourNorm = new Set(ourPlayers.map(normalizeName));
  return bbrefPlayers.filter(p => ourNorm.has(normalizeName(p))).length;
}

function matchTrade(
  trade: StaticTrade,
  bbrefTrades: BBRefTrade[]
): { bbref: BBRefTrade; confidence: 'exact' | 'high' | 'low' } | null {
  const ourTeams = trade.teams.map(t => t.team_id);
  const ourPlayers = trade.assets
    .filter(a => a.type === 'player' && a.player_name)
    .map(a => a.player_name!);

  // Filter to candidates with ≥2 team overlap
  const candidates = bbrefTrades.filter(b => teamOverlap(ourTeams, b.teams) >= 2);

  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    return { bbref: candidates[0], confidence: 'exact' };
  }

  // Multiple candidates — score by player overlap
  const scored = candidates.map(c => ({
    bbref: c,
    score: playerOverlap(ourPlayers, c.playerNames),
  }));
  scored.sort((a, b) => b.score - a.score);

  if (scored[0].score === 0) return null;

  const gap = scored[0].score - (scored[1]?.score ?? 0);
  const confidence = gap >= 1 ? 'high' : 'low';
  return { bbref: scored[0].bbref, confidence };
}

// ── Asset Comparison ─────────────────────────────────────────────────

function assetKey(a: StaticTradeAsset): string {
  if (a.type === 'player') {
    return `player|${normalizeName(a.player_name || '')}|${a.from_team_id}|${a.to_team_id}`;
  }
  if (a.type === 'pick') {
    return `pick|${a.pick_year}|${a.pick_round}|${a.from_team_id}|${a.to_team_id}`;
  }
  if (a.type === 'swap') {
    return `swap|${a.pick_year}|${a.from_team_id}|${a.to_team_id}`;
  }
  if (a.type === 'cash') {
    return `cash|${a.from_team_id}|${a.to_team_id}`;
  }
  return `${a.type}|${a.player_name}|${a.from_team_id}|${a.to_team_id}`;
}

/** Looser key for picks: ignore direction (from/to) since CSV may have it wrong */
function assetKeyLoose(a: StaticTradeAsset): string {
  if (a.type === 'player') {
    return `player|${normalizeName(a.player_name || '')}`;
  }
  if (a.type === 'pick') {
    return `pick|${a.pick_year}|${a.pick_round}`;
  }
  if (a.type === 'swap') {
    return `swap|${a.pick_year}`;
  }
  return assetKey(a);
}

function compareAssets(
  trade: StaticTrade,
  bbref: BBRefTrade
): { missingAssets: StaticTradeAsset[]; fixableNulls: Discrepancy['fixableNulls'] } {
  const ourKeys = new Set(trade.assets.map(assetKey));
  const ourKeysLoose = new Set(trade.assets.map(assetKeyLoose));

  const missingAssets: StaticTradeAsset[] = [];
  const fixableNulls: Discrepancy['fixableNulls'] = [];

  for (const bbrefAsset of bbref.assets) {
    const key = assetKey(bbrefAsset);
    const keyLoose = assetKeyLoose(bbrefAsset);

    // Already have this exact asset
    if (ourKeys.has(key)) continue;

    // For picks: check if we have the same pick but with null year/round
    if (bbrefAsset.type === 'pick' && bbrefAsset.pick_year && bbrefAsset.pick_round) {
      // Look for a matching pick in our trade with null year/round
      const matchIdx = trade.assets.findIndex(a =>
        a.type === 'pick' &&
        a.pick_year === null &&
        a.pick_round === null &&
        a.from_team_id === bbrefAsset.from_team_id &&
        a.to_team_id === bbrefAsset.to_team_id
      );
      if (matchIdx >= 0) {
        fixableNulls.push(
          { assetIndex: matchIdx, field: 'pick_year', oldValue: null, newValue: bbrefAsset.pick_year },
          { assetIndex: matchIdx, field: 'pick_round', oldValue: null, newValue: bbrefAsset.pick_round }
        );
        continue;
      }

      // Also check: null year/round but matching became_player_name
      if (bbrefAsset.became_player_name) {
        const byPlayerIdx = trade.assets.findIndex(a =>
          a.type === 'pick' &&
          a.pick_year === null &&
          a.became_player_name &&
          normalizeName(a.became_player_name) === normalizeName(bbrefAsset.became_player_name!)
        );
        if (byPlayerIdx >= 0) {
          fixableNulls.push(
            { assetIndex: byPlayerIdx, field: 'pick_year', oldValue: null, newValue: bbrefAsset.pick_year },
            { assetIndex: byPlayerIdx, field: 'pick_round', oldValue: null, newValue: bbrefAsset.pick_round }
          );
          continue;
        }
      }
    }

    // Check loose match — if we already have this by loose key, skip (avoid false duplicates)
    if (ourKeysLoose.has(keyLoose)) continue;

    // This is a genuinely missing asset
    missingAssets.push(bbrefAsset);
  }

  return { missingAssets, fixableNulls };
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const verbose = args.includes('--verbose');
  const seasonArg = args.indexOf('--season');
  const targetSeason = seasonArg >= 0 ? args[seasonArg + 1] : null;

  console.log('=== TRADE VERIFICATION PIPELINE ===');
  console.log(`Mode: ${apply ? 'APPLY FIXES' : 'REPORT ONLY (dry run)'}`);
  if (targetSeason) console.log(`Scoped to season: ${targetSeason}`);
  console.log('');

  // Load all trades
  const seasonFiles = fs.readdirSync(SEASON_DIR).filter(f => f.endsWith('.json'));
  const allTrades: { season: string; trades: StaticTrade[] }[] = [];
  let totalTrades = 0;
  let totalAssetsBefore = 0;

  for (const file of seasonFiles) {
    const season = file.replace('.json', '');
    if (targetSeason && season !== targetSeason) continue;

    const trades: StaticTrade[] = JSON.parse(fs.readFileSync(path.join(SEASON_DIR, file), 'utf-8'));
    allTrades.push({ season, trades });
    totalTrades += trades.length;
    for (const t of trades) totalAssetsBefore += t.assets.length;
  }

  console.log(`Loaded ${totalTrades} trades (${totalAssetsBefore} total assets)`);

  // Group all trades by date for efficient cache lookup
  const tradesByDate = new Map<string, { season: string; trade: StaticTrade; idx: number }[]>();
  for (const { season, trades } of allTrades) {
    for (let idx = 0; idx < trades.length; idx++) {
      const t = trades[idx];
      if (!tradesByDate.has(t.date)) tradesByDate.set(t.date, []);
      tradesByDate.get(t.date)!.push({ season, trade: t, idx });
    }
  }

  const uniqueDates = [...tradesByDate.keys()].sort();
  console.log(`Checking ${uniqueDates.length} unique dates against BBRef cache...\n`);

  // Track stats
  let matched = 0;
  let unmatched = 0;
  let noCachePage = 0;
  const discrepancies: Discrepancy[] = [];
  let totalMissing = 0;
  let totalFixable = 0;

  let missingByType = { player: 0, pick: 0, swap: 0, cash: 0 };

  for (const dateStr of uniqueDates) {
    const bbrefTrades = loadBBRefTradesForDate(dateStr);
    const ourTrades = tradesByDate.get(dateStr)!;

    if (bbrefTrades.length === 0) {
      noCachePage += ourTrades.length;
      continue;
    }

    for (const { trade } of ourTrades) {
      const match = matchTrade(trade, bbrefTrades);
      if (!match) {
        unmatched++;
        continue;
      }

      matched++;
      const { missingAssets, fixableNulls } = compareAssets(trade, match.bbref);

      if (missingAssets.length > 0 || fixableNulls.length > 0) {
        discrepancies.push({
          tradeId: trade.id,
          date: trade.date,
          title: trade.title,
          confidence: match.confidence,
          missingAssets,
          fixableNulls,
        });
        totalMissing += missingAssets.length;
        totalFixable += fixableNulls.length / 2; // Each null fix is 2 entries (year + round)
        for (const a of missingAssets) {
          missingByType[a.type as keyof typeof missingByType]++;
        }
      }
    }
  }

  // ── Report ──────────────────────────────────────────────────────────

  console.log('=== VERIFICATION REPORT ===\n');
  console.log(`Scanned:        ${totalTrades} trades`);
  console.log(`Matched:        ${matched} (${((matched / totalTrades) * 100).toFixed(1)}%)`);
  console.log(`Unmatched:      ${unmatched} (BBRef parsed differently or no teams overlap)`);
  console.log(`No cache page:  ${noCachePage} (BBRef HTML not cached for that date)`);
  console.log(`With issues:    ${discrepancies.length} trades`);
  console.log('');
  console.log(`Missing assets: ${totalMissing}`);
  console.log(`  Players:      ${missingByType.player}`);
  console.log(`  Picks:        ${missingByType.pick}`);
  console.log(`  Swaps:        ${missingByType.swap}`);
  console.log(`  Cash:         ${missingByType.cash}`);
  console.log(`Fixable nulls:  ${totalFixable} pick year/round pairs`);

  if (discrepancies.length > 0) {
    console.log('\n=== DISCREPANCIES ===\n');

    // Show first 50 in report mode, all in verbose
    const toShow = verbose ? discrepancies : discrepancies.slice(0, 50);
    for (const d of toShow) {
      console.log(`[${d.tradeId.slice(0, 12)}...] ${d.date} | ${d.title} (${d.confidence})`);
      for (const a of d.missingAssets) {
        if (a.type === 'player') {
          console.log(`  + player: ${a.player_name} (${a.from_team_id}→${a.to_team_id})`);
        } else if (a.type === 'pick') {
          const became = a.became_player_name ? ` (became: ${a.became_player_name})` : '';
          console.log(`  + pick: ${a.pick_year} R${a.pick_round} ${a.from_team_id}→${a.to_team_id}${became}`);
        } else if (a.type === 'swap') {
          console.log(`  + swap: ${a.pick_year} ${a.from_team_id}→${a.to_team_id}`);
        } else if (a.type === 'cash') {
          console.log(`  + cash: ${a.from_team_id}→${a.to_team_id}`);
        }
      }
      for (let i = 0; i < d.fixableNulls.length; i += 2) {
        const yearFix = d.fixableNulls[i];
        const roundFix = d.fixableNulls[i + 1];
        if (yearFix && roundFix) {
          console.log(`  ~ asset #${yearFix.assetIndex}: pick_year null→${yearFix.newValue}, pick_round null→${roundFix.newValue}`);
        }
      }
      console.log('');
    }

    if (!verbose && discrepancies.length > 50) {
      console.log(`... and ${discrepancies.length - 50} more (use --verbose to see all)\n`);
    }
  }

  // ── Apply ───────────────────────────────────────────────────────────

  if (!apply) {
    console.log('Run with --apply to fix these issues.');
    return;
  }

  console.log('\n=== APPLYING FIXES ===\n');

  // Build lookup: tradeId → season file trades array
  const tradeIndex = new Map<string, { season: string; trades: StaticTrade[]; tradeIdx: number }>();
  for (const { season, trades } of allTrades) {
    for (let i = 0; i < trades.length; i++) {
      tradeIndex.set(trades[i].id, { season, trades, tradeIdx: i });
    }
  }

  let appliedMissing = 0;
  let appliedNulls = 0;
  const modifiedSeasons = new Set<string>();

  for (const d of discrepancies) {
    const entry = tradeIndex.get(d.tradeId);
    if (!entry) continue;

    const trade = entry.trades[entry.tradeIdx];

    // Add missing assets (with dedup check)
    const existingKeys = new Set(trade.assets.map(assetKey));
    for (const asset of d.missingAssets) {
      const key = assetKey(asset);
      if (existingKeys.has(key)) continue;
      trade.assets.push(asset);
      existingKeys.add(key);
      appliedMissing++;
    }

    // Fix null pick year/round
    for (const fix of d.fixableNulls) {
      const asset = trade.assets[fix.assetIndex];
      if (asset) {
        if (fix.field === 'pick_year') asset.pick_year = fix.newValue;
        if (fix.field === 'pick_round') asset.pick_round = fix.newValue;
        appliedNulls++;
      }
    }

    modifiedSeasons.add(entry.season);
  }

  // Write modified season files
  for (const { season, trades } of allTrades) {
    if (!modifiedSeasons.has(season)) continue;
    trades.sort((a, b) => a.date.localeCompare(b.date));
    const filePath = path.join(SEASON_DIR, `${season}.json`);
    fs.writeFileSync(filePath, JSON.stringify(trades, null, 2));
    console.log(`  Updated ${season}.json`);
  }

  // Rebuild search index
  const newIndex: SearchIndexEntry[] = [];
  for (const { trades } of allTrades) {
    for (const t of trades) {
      newIndex.push(buildSearchIndexEntry(t));
    }
  }
  // Also include seasons we didn't process (if scoped)
  if (targetSeason) {
    const existing: SearchIndexEntry[] = fs.existsSync(INDEX_PATH)
      ? JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'))
      : [];
    const processedIds = new Set(newIndex.map(e => e.id));
    for (const e of existing) {
      if (!processedIds.has(e.id)) newIndex.push(e);
    }
  }
  fs.writeFileSync(INDEX_PATH, JSON.stringify(newIndex));

  // Count total assets after
  let totalAssetsAfter = 0;
  for (const { trades } of allTrades) {
    for (const t of trades) totalAssetsAfter += t.assets.length;
  }

  console.log(`\nApplied: ${appliedMissing} missing assets added, ${appliedNulls} null fields fixed`);
  console.log(`Assets: ${totalAssetsBefore} → ${totalAssetsAfter} (+${totalAssetsAfter - totalAssetsBefore})`);
  console.log(`Modified ${modifiedSeasons.size} season files`);
  console.log('Search index rebuilt.');
  console.log('\nNext steps:');
  console.log('  npx tsx scripts/enrich-picks.ts    # Back-fill became_player_name on new picks');
  console.log('  npm run build                       # Verify build');
}

main().catch(console.error);
