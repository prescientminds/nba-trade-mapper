/**
 * Deduplicate trade assets in static JSON files.
 *
 * Scans all season JSON files and:
 * 1. Removes duplicate assets (same type + player_name + pick_year + from_team_id + to_team_id)
 * 2. Fixes trade titles with repeated player names (e.g. "James Harden, James Harden" → "James Harden")
 *
 * Usage: npx tsx scripts/dedupe-trade-assets.ts
 *        npx tsx scripts/dedupe-trade-assets.ts --dry-run
 */

import * as fs from 'fs';
import * as path from 'path';

const SEASON_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');

interface StaticTradeAsset {
  type: string;
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

function assetKey(a: StaticTradeAsset): string {
  return `${a.type}|${a.player_name ?? ''}|${a.pick_year ?? ''}|${a.from_team_id ?? ''}|${a.to_team_id ?? ''}`;
}

function dedupeTitle(title: string): string {
  // The last part typically ends with " Trade", preserve that suffix
  const tradeMatch = title.match(/\s+Trade$/);
  const suffix = tradeMatch ? ' Trade' : '';
  const withoutSuffix = tradeMatch ? title.slice(0, -suffix.length) : title;

  // Split on comma+space, deduplicate while preserving order
  const parts = withoutSuffix.split(/,\s*/);
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    // Also strip trailing " Trade" from individual parts for comparison
    const normalized = trimmed.replace(/\s+Trade$/, '');
    if (normalized && !seen.has(normalized.toLowerCase())) {
      seen.add(normalized.toLowerCase());
      deduped.push(normalized);
    }
  }
  return deduped.join(', ') + suffix;
}

const dryRun = process.argv.includes('--dry-run');

const files = fs.readdirSync(SEASON_DIR).filter(f => f.endsWith('.json')).sort();

let totalDupAssets = 0;
let totalTitleFixes = 0;
let totalFilesModified = 0;

for (const file of files) {
  const filePath = path.join(SEASON_DIR, file);
  const trades: StaticTrade[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  let modified = false;

  for (const trade of trades) {
    // Deduplicate assets
    const seen = new Set<string>();
    const deduped: StaticTradeAsset[] = [];
    for (const asset of trade.assets) {
      const key = assetKey(asset);
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(asset);
      } else {
        totalDupAssets++;
      }
    }
    if (deduped.length !== trade.assets.length) {
      trade.assets = deduped;
      modified = true;
    }

    // Fix duplicate names in title
    const fixedTitle = dedupeTitle(trade.title);
    if (fixedTitle !== trade.title) {
      console.log(`  Title: "${trade.title}" → "${fixedTitle}"`);
      trade.title = fixedTitle;
      totalTitleFixes++;
      modified = true;
    }
  }

  if (modified) {
    totalFilesModified++;
    if (!dryRun) {
      fs.writeFileSync(filePath, JSON.stringify(trades, null, 2) + '\n');
    }
    console.log(`${dryRun ? '[DRY RUN] ' : ''}Modified: ${file}`);
  }
}

console.log(`\nDone. ${totalDupAssets} duplicate assets removed, ${totalTitleFixes} titles fixed across ${totalFilesModified} files.`);
if (dryRun) console.log('(Dry run — no files were modified)');
