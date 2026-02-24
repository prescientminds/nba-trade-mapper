/**
 * Backfill pick_year, pick_round, and original_team_id for pick assets
 * that have `became_player_name` but are missing pick metadata.
 *
 * Reverse of enrich-picks.ts: looks up each became_player_name in the
 * Kaggle Draft Pick History to infer when/where they were drafted.
 *
 * Usage: npx tsx scripts/backfill-pick-years.ts
 *        npx tsx scripts/backfill-pick-years.ts --dry-run
 */

import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { resolveTeamId } from './lib/team-resolver';

const SEASON_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');
const DRAFT_CSV = path.join(__dirname, '..', 'data', 'kaggle', 'Draft Pick History.csv');

interface DraftRecord {
  season: number;
  round: number;
  overall_pick: number;
  team: string; // resolved team_id
  player: string;
}

interface StaticTrade {
  id: string;
  date: string;
  season: string;
  title: string;
  description: string;
  is_multi_team: boolean;
  teams: { team_id: string; role: string }[];
  assets: {
    type: string;
    player_name: string | null;
    from_team_id: string | null;
    to_team_id: string | null;
    pick_year: number | null;
    pick_round: number | null;
    original_team_id: string | null;
    became_player_name: string | null;
    notes: string | null;
  }[];
}

/** Normalize player name for fuzzy matching */
function normalizeName(name: string): string {
  return name
    .replace(/\*/g, '')           // HOF markers
    .replace(/\s*\(.*?\)\s*/g, '') // parenthetical disambiguators
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function loadDraftIndex(): Map<string, DraftRecord[]> {
  const csv = fs.readFileSync(DRAFT_CSV, 'utf-8');
  const records = parse(csv, { columns: true, skip_empty_lines: true });

  // Index by normalized player name → all draft entries for that name
  const index = new Map<string, DraftRecord[]>();

  for (const row of records as Record<string, string>[]) {
    const season = parseInt(row.season);
    const round = parseInt(row.round);
    if (isNaN(season) || isNaN(round)) continue;

    const player = (row.player || '').replace(/\*/g, '').trim();
    if (!player) continue;

    const teamId = resolveTeamId(row.tm || '');

    const record: DraftRecord = {
      season,
      round,
      overall_pick: parseInt(row.overall_pick) || 0,
      team: teamId || row.tm || '',
      player,
    };

    const key = normalizeName(player);
    if (!index.has(key)) index.set(key, []);
    index.get(key)!.push(record);
  }

  return index;
}

function pickBestEntry(entries: DraftRecord[], tradeYear: number): DraftRecord {
  if (entries.length === 1) return entries[0];

  // Prefer draft year >= trade year (pick was drafted after or during trade season)
  const candidates = entries.filter(e => e.season >= tradeYear);
  if (candidates.length === 1) return candidates[0];

  // Still ambiguous — pick closest to trade year
  const sorted = [...entries].sort(
    (a, b) => Math.abs(a.season - tradeYear) - Math.abs(b.season - tradeYear)
  );
  return sorted[0];
}

function findDraftRecord(
  index: Map<string, DraftRecord[]>,
  becamePlayerName: string,
  tradeSeason: string
): DraftRecord | null {
  const tradeYear = parseInt(tradeSeason.split('-')[0]);

  // Try the full name first
  const normalized = normalizeName(becamePlayerName);
  const entries = index.get(normalized);
  if (entries) return pickBestEntry(entries, tradeYear);

  // Handle "Birth Name / Nickname" or "Nickname / Birth Name" patterns
  if (becamePlayerName.includes('/')) {
    const parts = becamePlayerName.split('/').map(s => s.trim());
    for (const part of parts) {
      const partNorm = normalizeName(part);
      const partEntries = index.get(partNorm);
      if (partEntries) return pickBestEntry(partEntries, tradeYear);
    }
  }

  // Handle "Sr." / "Jr." / "I" / "II" suffixes — try without suffix
  const withoutSuffix = normalized.replace(/\s+(sr\.?|jr\.?|i+|iv|v)$/i, '');
  if (withoutSuffix !== normalized) {
    const suffixEntries = index.get(withoutSuffix);
    if (suffixEntries) return pickBestEntry(suffixEntries, tradeYear);
  }

  return null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log('Loading draft pick history (reverse index by player name)...');
  const draftIndex = loadDraftIndex();
  console.log(`  ${draftIndex.size} unique player names indexed`);

  console.log('Processing season files...\n');
  const seasonFiles = fs.readdirSync(SEASON_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();

  let backfilled = 0;
  let alreadyHad = 0;
  let notPick = 0;
  let noBecame = 0;
  let notFound = 0;
  let ambiguous = 0;
  const notFoundNames: string[] = [];

  for (const file of seasonFiles) {
    const filePath = path.join(SEASON_DIR, file);
    const trades: StaticTrade[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    let modified = false;

    for (const trade of trades) {
      for (const asset of trade.assets) {
        if (asset.type !== 'pick' && asset.type !== 'swap') {
          notPick++;
          continue;
        }

        // Already has pick_year — skip
        if (asset.pick_year) {
          alreadyHad++;
          continue;
        }

        // No became_player_name — can't look up
        if (!asset.became_player_name) {
          noBecame++;
          continue;
        }

        const record = findDraftRecord(draftIndex, asset.became_player_name, trade.season);
        if (!record) {
          notFound++;
          if (notFoundNames.length < 50) {
            notFoundNames.push(`${asset.became_player_name} (${trade.season})`);
          }
          continue;
        }

        // Backfill the pick metadata
        asset.pick_year = record.season;
        asset.pick_round = record.round;
        if (!asset.original_team_id) {
          asset.original_team_id = record.team;
        }
        // Add a descriptive note if none exists
        if (!asset.notes) {
          asset.notes = `${record.season} R${record.round} Pick #${record.overall_pick}`;
        }

        backfilled++;
        modified = true;
      }
    }

    if (modified && !dryRun) {
      fs.writeFileSync(filePath, JSON.stringify(trades, null, 2));
    }
  }

  console.log('Results:');
  console.log(`  Backfilled:    ${backfilled} picks got pick_year/round/team`);
  console.log(`  Already had:   ${alreadyHad} (pick_year was set)`);
  console.log(`  No became:     ${noBecame} (no became_player_name to look up)`);
  console.log(`  Not found:     ${notFound} (player not in draft CSV)`);
  console.log(`  Non-pick:      ${notPick} (player/cash/exception assets skipped)`);

  if (notFoundNames.length > 0) {
    console.log(`\nSample not-found names (${Math.min(notFoundNames.length, 50)} of ${notFound}):`);
    for (const name of notFoundNames) {
      console.log(`  - ${name}`);
    }
  }

  if (dryRun) {
    console.log('\n(dry run — no files modified)');
  } else {
    console.log('\nSeason files updated in place.');
  }
}

main().catch(console.error);
