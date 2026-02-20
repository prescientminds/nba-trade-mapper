/**
 * Validate became_player_name on pick assets across all season files.
 *
 * Checks:
 *   1. Year mismatch — pick_year doesn't match the player's actual draft year in drafts.json
 *   2. Duplicates — same became_player_name appears more than once within a single trade
 *
 * With --fix: clears incorrect became_player_name values (sets to null).
 *             Re-run `npx tsx scripts/enrich-picks.ts` afterwards to re-fill correctly.
 *
 * Usage:
 *   npx tsx scripts/validate-picks.ts            # report only
 *   npx tsx scripts/validate-picks.ts --fix      # clear bad values
 */

import * as fs from 'fs';
import * as path from 'path';

const SEASON_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');
const DRAFTS_PATH = path.join(__dirname, '..', 'public', 'data', 'drafts.json');

interface DraftEntry {
  year: number;
  round: number;
  pick: number;
  teamId: string;
}

interface PickAsset {
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
  assets: PickAsset[];
}

interface Issue {
  file: string;
  tradeId: string;
  tradeDate: string;
  assetIndex: number;
  pickYear: number | null;
  pickRound: number | null;
  becamePlayer: string;
  type: 'year_mismatch' | 'duplicate';
  detail: string;
}

function loadDrafts(): Map<string, DraftEntry> {
  const raw = JSON.parse(fs.readFileSync(DRAFTS_PATH, 'utf-8')) as Record<string, DraftEntry>;
  const map = new Map<string, DraftEntry>();
  for (const [name, entry] of Object.entries(raw)) {
    map.set(name.toLowerCase(), entry);
  }
  return map;
}

async function main() {
  const fix = process.argv.includes('--fix');
  const drafts = loadDrafts();
  const issues: Issue[] = [];

  const seasonFiles = fs.readdirSync(SEASON_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  for (const file of seasonFiles) {
    const filePath = path.join(SEASON_DIR, file);
    const trades: StaticTrade[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    let modified = false;

    for (const trade of trades) {
      // Check 1: year mismatch
      for (let i = 0; i < trade.assets.length; i++) {
        const asset = trade.assets[i];
        if (asset.type !== 'pick' && asset.type !== 'swap') continue;
        if (!asset.became_player_name) continue;

        const draftEntry = drafts.get(asset.became_player_name.toLowerCase());
        if (!draftEntry) continue; // player not in drafts.json (future pick, etc.)

        if (asset.pick_year !== null && asset.pick_year !== draftEntry.year) {
          issues.push({
            file,
            tradeId: trade.id,
            tradeDate: trade.date,
            assetIndex: i,
            pickYear: asset.pick_year,
            pickRound: asset.pick_round,
            becamePlayer: asset.became_player_name,
            type: 'year_mismatch',
            detail: `pick_year=${asset.pick_year} but ${asset.became_player_name} was drafted in ${draftEntry.year}`,
          });

          if (fix) {
            asset.became_player_name = null;
            modified = true;
          }
        }
      }

      // Check 2: duplicate became_player_name within same trade
      const seen = new Map<string, number>(); // playerName → first assetIndex
      for (let i = 0; i < trade.assets.length; i++) {
        const asset = trade.assets[i];
        if (asset.type !== 'pick' && asset.type !== 'swap') continue;
        if (!asset.became_player_name) continue;

        const key = asset.became_player_name.toLowerCase();
        if (seen.has(key)) {
          issues.push({
            file,
            tradeId: trade.id,
            tradeDate: trade.date,
            assetIndex: i,
            pickYear: asset.pick_year,
            pickRound: asset.pick_round,
            becamePlayer: asset.became_player_name,
            type: 'duplicate',
            detail: `also appears at asset index ${seen.get(key)} in same trade`,
          });

          if (fix) {
            asset.became_player_name = null;
            modified = true;
          }
        } else {
          seen.set(key, i);
        }
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(trades, null, 2));
      console.log(`  Fixed: ${file}`);
    }
  }

  if (issues.length === 0) {
    console.log('No issues found.');
    return;
  }

  console.log(`\nFound ${issues.length} issue(s):\n`);
  for (const issue of issues) {
    const icon = issue.type === 'year_mismatch' ? '⚠ year' : '⚠ dupe';
    console.log(`[${icon}] ${issue.file} | ${issue.tradeDate} (${issue.tradeId})`);
    console.log(`       Asset #${issue.assetIndex}: "${issue.becamePlayer}" — ${issue.detail}`);
  }

  if (fix) {
    console.log(`\nFixed: cleared became_player_name on ${issues.length} asset(s).`);
    console.log('Re-run `npx tsx scripts/enrich-picks.ts` to re-fill correctly.');
  } else {
    console.log('\nRun with --fix to clear incorrect values.');
  }
}

main().catch(console.error);
