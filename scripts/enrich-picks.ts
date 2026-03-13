/**
 * Enrich draft pick assets with `became_player_name` using Kaggle Draft Pick History.
 *
 * Cross-references pick_year + pick_round + team context from the static JSON
 * against data/kaggle/Draft Pick History.csv to fill in who was actually selected.
 *
 * Usage: npx tsx scripts/enrich-picks.ts
 *        npx tsx scripts/enrich-picks.ts --dry-run
 */

import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { resolveTeamId } from './lib/team-resolver';

const SEASON_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');
const INDEX_PATH = path.join(__dirname, '..', 'public', 'data', 'trades', 'index.json');
const DRAFT_CSV = path.join(__dirname, '..', 'data', 'kaggle', 'Draft Pick History.csv');
const DRAFTS_JSON = path.join(__dirname, '..', 'public', 'data', 'drafts.json');

interface DraftJsonEntry {
  year: number;
  round: number;
  pick: number;
  teamId: string;
}

interface DraftPick {
  season: number;      // end year (e.g. 2024 = 2023-24 season's draft)
  round: number;
  overall_pick: number;
  team: string;        // BBRef abbreviation
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

function loadDraftPicks(): Map<string, DraftPick[]> {
  const csv = fs.readFileSync(DRAFT_CSV, 'utf-8');
  const records = parse(csv, { columns: true, skip_empty_lines: true });

  // Index by "year-round" for efficient lookup
  const index = new Map<string, DraftPick[]>();

  for (const row of records as Record<string, string>[]) {
    const season = parseInt(row.season);
    const round = parseInt(row.round);
    if (isNaN(season) || isNaN(round)) continue;

    const pick: DraftPick = {
      season,
      round,
      overall_pick: parseInt(row.overall_pick) || 0,
      team: row.tm || '',
      player: (row.player || '').replace(/\*/g, '').trim(),
    };

    const key = `${season}-${round}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key)!.push(pick);
  }

  return index;
}

function findDraftedPlayer(
  draftIndex: Map<string, DraftPick[]>,
  pickYear: number,
  pickRound: number,
  toTeamId: string | null,
  originalTeamId: string | null
): string | null {
  const key = `${pickYear}-${pickRound}`;
  const picks = draftIndex.get(key);
  if (!picks) return null;

  // Try to match by the team that holds the pick
  const teamToMatch = toTeamId || originalTeamId;
  if (teamToMatch) {
    const match = picks.find((p) => resolveTeamId(p.team) === teamToMatch);
    if (match && match.player) return match.player;
  }

  // If original_team_id is set, try that
  if (originalTeamId && originalTeamId !== toTeamId) {
    const match = picks.find((p) => resolveTeamId(p.team) === originalTeamId);
    if (match && match.player) return match.player;
  }

  return null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log('Loading draft pick history...');
  const draftIndex = loadDraftPicks();
  let totalPicks = 0;
  for (const picks of draftIndex.values()) totalPicks += picks.length;
  console.log(`  ${totalPicks} draft picks loaded`);

  console.log('Processing season files...');
  const seasonFiles = fs.readdirSync(SEASON_DIR).filter((f) => f.endsWith('.json'));

  let enriched = 0;
  let alreadyHad = 0;
  let notFound = 0;
  let noPick = 0;

  for (const file of seasonFiles) {
    const filePath = path.join(SEASON_DIR, file);
    const trades: StaticTrade[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    let modified = false;

    for (const trade of trades) {
      for (const asset of trade.assets) {
        if (asset.type !== 'pick' && asset.type !== 'swap') continue;
        if (!asset.pick_year || !asset.pick_round) {
          noPick++;
          continue;
        }

        if (asset.became_player_name) {
          alreadyHad++;
          continue;
        }

        const player = findDraftedPlayer(
          draftIndex,
          asset.pick_year,
          asset.pick_round,
          asset.to_team_id,
          asset.original_team_id
        );

        if (player) {
          asset.became_player_name = player;
          enriched++;
          modified = true;
        } else {
          notFound++;
        }
      }
    }

    if (modified && !dryRun) {
      fs.writeFileSync(filePath, JSON.stringify(trades, null, 2));
    }
  }

  console.log(`\nPhase 1 — Forward enrichment (year/round → player name):`);
  console.log(`  Enriched: ${enriched} picks got became_player_name`);
  console.log(`  Already had: ${alreadyHad}`);
  console.log(`  Not found: ${notFound} (ambiguous or future pick)`);
  console.log(`  No year/round: ${noPick}`);

  // ── Phase 2: Reverse enrichment ──────────────────────────────────────
  // Picks that have became_player_name but missing pick_year/pick_round.
  // Look up the player in drafts.json to back-fill the pick metadata.
  console.log('\nPhase 2 — Reverse enrichment (player name → year/round)...');

  let draftsJson: Record<string, DraftJsonEntry> = {};
  if (fs.existsSync(DRAFTS_JSON)) {
    draftsJson = JSON.parse(fs.readFileSync(DRAFTS_JSON, 'utf-8'));
    console.log(`  ${Object.keys(draftsJson).length} draft entries loaded from drafts.json`);
  } else {
    console.log('  ⚠ drafts.json not found — skipping reverse enrichment');
  }

  let reverseEnriched = 0;
  let reverseAlreadyHad = 0;
  let reverseNotFound = 0;

  if (Object.keys(draftsJson).length > 0) {
    for (const file of seasonFiles) {
      const filePath = path.join(SEASON_DIR, file);
      const trades: StaticTrade[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      let modified = false;

      for (const trade of trades) {
        for (const asset of trade.assets) {
          if (asset.type !== 'pick' && asset.type !== 'swap') continue;
          if (!asset.became_player_name) continue;
          if (asset.pick_year && asset.pick_round) {
            reverseAlreadyHad++;
            continue;
          }

          const entry = draftsJson[asset.became_player_name.toLowerCase()];
          if (entry) {
            asset.pick_year = entry.year;
            asset.pick_round = entry.round;
            if (!asset.original_team_id && !asset.from_team_id) {
              asset.original_team_id = entry.teamId;
            }
            reverseEnriched++;
            modified = true;
          } else {
            reverseNotFound++;
          }
        }
      }

      if (modified && !dryRun) {
        fs.writeFileSync(filePath, JSON.stringify(trades, null, 2));
      }
    }
  }

  console.log(`\nPhase 2 — Reverse enrichment results:`);
  console.log(`  Back-filled: ${reverseEnriched} picks got year/round from player name`);
  console.log(`  Already had: ${reverseAlreadyHad}`);
  console.log(`  Not found: ${reverseNotFound} (player not in drafts.json)`);

  if (dryRun) {
    console.log('\n(dry run — no files modified)');
  } else {
    console.log('\nSeason files updated in place.');
  }
}

main().catch(console.error);
