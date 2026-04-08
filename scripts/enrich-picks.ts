/**
 * Enrich draft pick assets with `became_player_name`.
 *
 * Three-layer resolution system (in priority order):
 *
 * 1. **Ownership table** (`draft-ownership.json` from Wikipedia) — matches
 *    pick_year + pick_round + original_team to the exact player. This is the
 *    primary lookup and handles multi-pick and re-trade cases correctly.
 *
 * 2. **Kaggle CSV fallback** — for picks not in the ownership table (pre-1976,
 *    missing years), uses pick_year + pick_round + team with disambiguation guards.
 *
 * 3. **Reverse enrichment** — picks that have became_player_name but missing
 *    pick_year/pick_round get back-filled from drafts.json.
 *
 * Usage:
 *   npx tsx scripts/enrich-picks.ts              # Enrich new picks only
 *   npx tsx scripts/enrich-picks.ts --force      # Clear all and re-enrich from scratch
 *   npx tsx scripts/enrich-picks.ts --dry-run    # Preview changes without writing
 */

import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { resolveTeamId, resolveFullTeamName } from './lib/team-resolver';

// BBRef descriptions use nicknames ("Celtics", "76ers") not full names.
const NICKNAME_TO_TEAM: Record<string, string> = {
  'Hawks': 'ATL', 'Celtics': 'BOS', 'Nets': 'BKN', 'Hornets': 'CHA',
  'Bulls': 'CHI', 'Cavaliers': 'CLE', 'Mavericks': 'DAL', 'Nuggets': 'DEN',
  'Pistons': 'DET', 'Warriors': 'GSW', 'Rockets': 'HOU', 'Pacers': 'IND',
  'Clippers': 'LAC', 'Lakers': 'LAL', 'Grizzlies': 'MEM', 'Heat': 'MIA',
  'Bucks': 'MIL', 'Timberwolves': 'MIN', 'Pelicans': 'NOP', 'Knicks': 'NYK',
  'Thunder': 'OKC', 'Magic': 'ORL', '76ers': 'PHI', 'Suns': 'PHX',
  'Trail Blazers': 'POR', 'Blazers': 'POR', 'Kings': 'SAC', 'Spurs': 'SAS',
  'Raptors': 'TOR', 'Jazz': 'UTA', 'Wizards': 'WAS',
  // Historical
  'SuperSonics': 'OKC', 'Sonics': 'OKC', 'Bobcats': 'CHA', 'Bullets': 'WAS',
  'Braves': 'LAC', 'Royals': 'SAC',
};

function resolveNickname(name: string): string | null {
  return NICKNAME_TO_TEAM[name] || resolveFullTeamName(name) || resolveTeamId(name);
}

const SEASON_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');
const DRAFT_CSV = path.join(__dirname, '..', 'data', 'kaggle', 'Draft Pick History.csv');
const DRAFTS_JSON = path.join(__dirname, '..', 'public', 'data', 'drafts.json');
const OWNERSHIP_JSON = path.join(__dirname, '..', 'public', 'data', 'draft-ownership.json');

interface DraftJsonEntry {
  year: number;
  round: number;
  pick: number;
  teamId: string;
}

interface OwnershipEntry {
  year: number;
  round: number;
  overall_pick: number;
  player: string;
  selecting_team: string;
  original_team: string;
}

interface DraftPick {
  season: number;
  round: number;
  overall_pick: number;
  team: string;
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

// ── Layer 1: Ownership table (Wikipedia) ────────────────────────────────────

function loadOwnershipTable(): Map<string, OwnershipEntry[]> {
  if (!fs.existsSync(OWNERSHIP_JSON)) return new Map();
  const data: OwnershipEntry[] = JSON.parse(fs.readFileSync(OWNERSHIP_JSON, 'utf-8'));
  // Index by "year-round-original_team" for direct lookup
  const index = new Map<string, OwnershipEntry[]>();
  for (const entry of data) {
    const key = `${entry.year}-${entry.round}-${entry.original_team}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key)!.push(entry);
  }
  return index;
}

function findViaOwnership(
  ownershipIndex: Map<string, OwnershipEntry[]>,
  pickYear: number,
  pickRound: number,
  fromTeamId: string | null,
  originalTeamId: string | null,
): string | null {
  // Try original_team_id first (most authoritative)
  if (originalTeamId) {
    const key = `${pickYear}-${pickRound}-${originalTeamId}`;
    const entries = ownershipIndex.get(key);
    if (entries && entries.length === 1 && entries[0].player) {
      return entries[0].player;
    }
  }

  // Try from_team_id (who sent the pick — usually the original owner)
  if (fromTeamId && fromTeamId !== originalTeamId) {
    const key = `${pickYear}-${pickRound}-${fromTeamId}`;
    const entries = ownershipIndex.get(key);
    if (entries && entries.length === 1 && entries[0].player) {
      return entries[0].player;
    }
  }

  return null;
}

// ── Layer 2: Kaggle CSV fallback ────────────────────────────────────────────

function loadKaggleDraftPicks(): Map<string, DraftPick[]> {
  const csv = fs.readFileSync(DRAFT_CSV, 'utf-8');
  const records = parse(csv, { columns: true, skip_empty_lines: true });
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

function findViaKaggle(
  kaggleIndex: Map<string, DraftPick[]>,
  pickYear: number,
  pickRound: number,
  toTeamId: string | null,
  originalTeamId: string | null,
  fromTeamId: string | null
): string | null {
  const key = `${pickYear}-${pickRound}`;
  const picks = kaggleIndex.get(key);
  if (!picks) return null;

  // Only use Kaggle when ownership table didn't have this pick.
  // Apply strict disambiguation: require exactly ONE match for any team tried.

  // Try original_team_id
  if (originalTeamId) {
    const matches = picks.filter((p) => resolveTeamId(p.team) === originalTeamId);
    if (matches.length === 1 && matches[0].player) return matches[0].player;
    if (matches.length > 1) return null;
  }

  // Try from_team_id
  if (fromTeamId && fromTeamId !== toTeamId && fromTeamId !== originalTeamId) {
    const matches = picks.filter((p) => resolveTeamId(p.team) === fromTeamId);
    if (matches.length === 1 && matches[0].player) return matches[0].player;
  }

  // Try to_team_id — only if exactly one pick in this round
  if (toTeamId) {
    const matches = picks.filter((p) => resolveTeamId(p.team) === toTeamId);
    if (matches.length === 1 && matches[0].player) return matches[0].player;
  }

  return null;
}

// ── Layer 0: BBRef description annotations ──────────────────────────────────
// Parse "#N-PlayerName" and "PlayerName was later selected" from trade descriptions.
// These are definitive — BBRef tracks the full chain.

interface DescAnnotation {
  pickNumber: number | null;  // overall pick (from "#3-Jayson Tatum")
  playerName: string;         // the player
  acquiringTeam: string | null; // team that acquired this pick (from "Celtics acquire")
}

function parseDescriptionAnnotations(description: string): DescAnnotation[] {
  const results: DescAnnotation[] = [];

  // Split description into per-team segments: "Celtics acquire ..." / "76ers acquire ..."
  // Each segment contains the picks that team received.
  const segments = description.split(/\s{2,}/); // BBRef uses double-space between team sections

  for (const segment of segments) {
    // Extract acquiring team from "TeamName acquire" prefix
    const teamMatch = segment.match(/^(\w[\w\s]+?)\s+acquire\b/i);
    const acquiringTeam = teamMatch ? teamMatch[1].trim() : null;

    // Pattern 1: "#N-PlayerName"
    const pickPattern = /#(\d+)-([A-Za-zÀ-ž][\w\s'.éčžćñ-]+?)(?:\)|,|$|\s+\d)/g;
    let m: RegExpExecArray | null;
    while ((m = pickPattern.exec(segment)) !== null) {
      const name = m[2].trim().replace(/\s+/g, ' ');
      if (name.length > 2) {
        results.push({ pickNumber: parseInt(m[1]), playerName: name, acquiringTeam });
      }
    }

    // Pattern 2: "PlayerName was later selected"
    const laterPattern = /\(([A-Za-zÀ-ž][\w\s'.éčžćñ-]+?)\s+was later selected\)/g;
    while ((m = laterPattern.exec(segment)) !== null) {
      const name = m[1].trim().replace(/\s+/g, ' ');
      if (name.length > 2 && !results.some(r => r.playerName === name)) {
        results.push({ pickNumber: null, playerName: name, acquiringTeam });
      }
    }
  }

  return results;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');

  // Load data sources
  console.log('Loading data sources...');

  // Ownership table — also build a by-pick-number index for Phase 0
  const ownershipIndex = loadOwnershipTable();
  let ownershipSize = 0;
  for (const entries of ownershipIndex.values()) ownershipSize += entries.length;
  console.log(`  Ownership table: ${ownershipSize} picks (from draft-ownership.json)`);

  // By-pick-number: "year-pickNumber" → OwnershipEntry
  const ownershipByPick = new Map<string, OwnershipEntry>();
  if (fs.existsSync(OWNERSHIP_JSON)) {
    const allOwnership: OwnershipEntry[] = JSON.parse(fs.readFileSync(OWNERSHIP_JSON, 'utf-8'));
    for (const e of allOwnership) {
      ownershipByPick.set(`${e.year}-${e.overall_pick}`, e);
    }
  }

  const kaggleIndex = loadKaggleDraftPicks();
  let kaggleSize = 0;
  for (const picks of kaggleIndex.values()) kaggleSize += picks.length;
  console.log(`  Kaggle CSV: ${kaggleSize} picks (fallback)`);

  if (force) console.log('  --force: clearing all existing became_player_name');

  // Process season files
  console.log('\nEnriching picks...');
  const seasonFiles = fs.readdirSync(SEASON_DIR).filter((f) => f.endsWith('.json'));

  let cleared = 0;
  let annotationHits = 0;
  let ownershipHits = 0;
  let kaggleHits = 0;
  let alreadyHad = 0;
  let notFound = 0;
  let noPick = 0;

  for (const file of seasonFiles) {
    const filePath = path.join(SEASON_DIR, file);
    const trades: StaticTrade[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    let modified = false;

    // --force: clear all became_player_name
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

    // Phase 0: BBRef description annotations (highest confidence)
    for (const trade of trades) {
      const annotations = parseDescriptionAnnotations(trade.description || '');
      if (annotations.length === 0) continue;

      for (const ann of annotations) {
        // Match annotation to a pick asset in this trade
        for (const asset of trade.assets) {
          if (asset.type !== 'pick' && asset.type !== 'swap') continue;
          if (asset.became_player_name) continue; // already set

          // If we know the acquiring team, match to the correct to_team_id
          if (ann.acquiringTeam) {
            const annTeamId = resolveNickname(ann.acquiringTeam);
            if (annTeamId && annTeamId !== asset.to_team_id) continue;
          }

          if (ann.pickNumber && asset.pick_year) {
            // We have a pick number — use ownership table to match exactly
            const ownKey = `${asset.pick_year}-${ann.pickNumber}`;
            const own = ownershipByPick.get(ownKey);
            if (own && own.player === ann.playerName && own.round === asset.pick_round) {
              asset.became_player_name = ann.playerName;
              if (!asset.original_team_id) asset.original_team_id = own.original_team;
              annotationHits++;
              modified = true;
              break; // this annotation matched — move to next annotation
            }
          }

          // Fallback: "was later selected" without pick number — match by year+round
          if (!ann.pickNumber && asset.pick_year && !asset.became_player_name) {
            const draftsJson: Record<string, DraftJsonEntry> = fs.existsSync(DRAFTS_JSON)
              ? JSON.parse(fs.readFileSync(DRAFTS_JSON, 'utf-8'))
              : {};
            const entry = draftsJson[ann.playerName.toLowerCase()];
            if (entry && entry.year === asset.pick_year && entry.round === asset.pick_round) {
              asset.became_player_name = ann.playerName;
              annotationHits++;
              modified = true;
              break;
            }
          }
        }
      }
    }

    for (const trade of trades) {
      for (const asset of trade.assets) {
        if (asset.type !== 'pick' && asset.type !== 'swap') continue;
        if (!asset.pick_year || !asset.pick_round) { noPick++; continue; }
        if (asset.became_player_name) { alreadyHad++; continue; }

        // Layer 1: Ownership table
        let player = findViaOwnership(
          ownershipIndex,
          asset.pick_year,
          asset.pick_round,
          asset.from_team_id,
          asset.original_team_id,
        );
        if (player) {
          ownershipHits++;
        } else {
          // Layer 2: Kaggle fallback
          player = findViaKaggle(
            kaggleIndex,
            asset.pick_year,
            asset.pick_round,
            asset.to_team_id,
            asset.original_team_id,
            asset.from_team_id,
          );
          if (player) kaggleHits++;
        }

        if (player) {
          asset.became_player_name = player;
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

  const totalEnriched = annotationHits + ownershipHits + kaggleHits;
  console.log(`\nForward enrichment:`);
  if (force) console.log(`  Cleared: ${cleared} existing values`);
  console.log(`  Enriched: ${totalEnriched} picks`);
  console.log(`    via BBRef annotations: ${annotationHits}`);
  console.log(`    via ownership table: ${ownershipHits}`);
  console.log(`    via Kaggle fallback: ${kaggleHits}`);
  console.log(`  Already had: ${alreadyHad}`);
  console.log(`  Not found: ${notFound} (ambiguous or future pick)`);
  console.log(`  No year/round: ${noPick}`);

  // ── Phase 2: Reverse enrichment ──────────────────────────────────────
  console.log('\nPhase 2 — Reverse enrichment (player name → year/round)...');

  let draftsJson: Record<string, DraftJsonEntry> = {};
  if (fs.existsSync(DRAFTS_JSON)) {
    draftsJson = JSON.parse(fs.readFileSync(DRAFTS_JSON, 'utf-8'));
    console.log(`  ${Object.keys(draftsJson).length} draft entries loaded`);
  } else {
    console.log('  ⚠ drafts.json not found — skipping');
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
          if (asset.pick_year && asset.pick_round) { reverseAlreadyHad++; continue; }

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
  console.log(`  Back-filled: ${reverseEnriched}`);
  console.log(`  Already had: ${reverseAlreadyHad}`);
  console.log(`  Not found: ${reverseNotFound}`);

  if (dryRun) {
    console.log('\n(dry run — no files modified)');
  } else {
    console.log('\nSeason files updated in place.');
  }
}

main().catch(console.error);
