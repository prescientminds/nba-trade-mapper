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
  originalTeamId: string | null,
  fromTeamId: string | null
): string | null {
  const key = `${pickYear}-${pickRound}`;
  const picks = draftIndex.get(key);
  if (!picks) return null;

  // Strategy: try to match unambiguously. If a team has multiple picks in
  // the same round, we CANNOT tell which one this is — return null.

  // Priority 1: original_team_id (the team whose record determined the pick)
  // This is the most reliable signal when available.
  if (originalTeamId) {
    const matches = picks.filter((p) => resolveTeamId(p.team) === originalTeamId);
    if (matches.length === 1 && matches[0].player) return matches[0].player;
    // Multiple picks or no match — can't disambiguate
    if (matches.length > 1) return null;
  }

  // Priority 2: from_team_id (who sent the pick). For traded picks, this is
  // often the original owner. Only try if different from to_team_id.
  if (fromTeamId && fromTeamId !== toTeamId) {
    const matches = picks.filter((p) => resolveTeamId(p.team) === fromTeamId);
    if (matches.length === 1 && matches[0].player) return matches[0].player;
    // Multiple picks for from_team — don't hard-stop, fall through to to_team_id
  }

  // Priority 3: to_team_id (who received and used the pick). Only use if the
  // team had exactly ONE pick in this round — otherwise ambiguous.
  if (toTeamId) {
    const matches = picks.filter((p) => resolveTeamId(p.team) === toTeamId);
    if (matches.length === 1 && matches[0].player) return matches[0].player;
    // Team had multiple picks in this round — can't tell which one
    if (matches.length > 1) return null;
  }

  return null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');
  console.log('Loading draft pick history...');
  const draftIndex = loadDraftPicks();
  let totalPicks = 0;
  for (const picks of draftIndex.values()) totalPicks += picks.length;
  console.log(`  ${totalPicks} draft picks loaded`);
  if (force) console.log('  --force: clearing all existing became_player_name before enrichment');

  console.log('Processing season files...');
  const seasonFiles = fs.readdirSync(SEASON_DIR).filter((f) => f.endsWith('.json'));

  let enriched = 0;
  let alreadyHad = 0;
  let notFound = 0;
  let noPick = 0;
  let cleared = 0;

  for (const file of seasonFiles) {
    const filePath = path.join(SEASON_DIR, file);
    const trades: StaticTrade[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    let modified = false;

    // --force: clear all became_player_name so we re-enrich from scratch
    if (force) {
      for (const trade of trades) {
        for (const asset of trade.assets) {
          if ((asset.type === 'pick' || asset.type === 'swap') && asset.became_player_name) {
            asset.became_player_name = null;
            cleared++;
            modified = true;
          }
        }
      }
    }

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
          asset.original_team_id,
          asset.from_team_id
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
  if (force) console.log(`  Cleared: ${cleared} existing values`);
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
