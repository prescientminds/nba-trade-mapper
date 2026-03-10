/**
 * fix-slash-names.ts
 *
 * Finds all "Name A / Name B" patterns in static trade JSON, resolves each to
 * the canonical BBRef name (from player_seasons), and patches every occurrence
 * across season files, index.json, and WNBA files.
 *
 * Run: npx tsx scripts/fix-slash-names.ts
 * Dry run: npx tsx scripts/fix-slash-names.ts --dry
 */

import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';

const DRY_RUN = process.argv.includes('--dry');

// ── Manual overrides for names BBRef doesn't have or uses differently ────────
// Key: exact slash string from the trade data. Value: canonical name.
const MANUAL_OVERRIDES: Record<string, string> = {
  // Name changes / legal name differences
  'Mahmoud Abdul-Rauf / Chris Jackson': 'Mahmoud Abdul-Rauf',
  'World B. Free / Lloyd Free': 'World B. Free',
  'Lloyd Free / World B. Free': 'World B. Free',
  'Ron Artest / Metta World Peace': 'Metta World Peace',
  'Metta World Peace / Ron Artest': 'Metta World Peace',
  'Tariq Abdul-Wahad / Olivier Saint-Jean': 'Tariq Abdul-Wahad',
  'Brian Williams / Bison Dele': 'Bison Dele',
  'Jeff Pendergraph / Jeff Ayres': 'Jeff Ayres',
  'Timothe Luwawu / Timothe Luwawu-Cabarrot': 'Timothe Luwawu-Cabarrot',

  // International names where BBRef uses the common form
  'Nene / Nene Hilario / Maybyner Hilario': 'Nene Hilario',
  'Georgios Papagiannis / Giorgios Papagiannis / George Papagiannis': 'Georgios Papagiannis',
  'Viacheslav Kravtsov / Viacheslav Kravstov / Sasha Kravtsov': 'Viacheslav Kravtsov',
  'Predrag Danilovic / Sasha Danilovic': 'Sasha Danilovic',

  // Diacritics — BBRef uses the accented form
  "Amare Stoudemire / Amar'e Stoudemire": "Amar'e Stoudemire",

  // Nicknames where BBRef uses the nickname
  'Anfernee Hardaway / Penny Hardaway': 'Anfernee Hardaway',
  'Predrag Stojakovic / Peja Stojakovic': 'Peja Stojakovic',
  'Hidayet Turkoglu / Hedo Turkoglu': 'Hedo Turkoglu',
  'Radoslav Nesterovic / Rasho Nesterovic': 'Rasho Nesterovic',

  // Data artifact — not a player
  'forfeited as of 12/01/21': '',

  // Disambiguation suffixes
  'Charles Davis / Charlie Davis) (E.)': 'Charlie Davis',
  'Bobby Smith (b) / Bingo Smith': 'Bingo Smith',
  'Roy Devyn Marble / Roy Marble (Devyn)': 'Devyn Marble',
};

// ── Collect all slash names from JSON files ──────────────────────────────────

function collectSlashNames(dir: string): Set<string> {
  const slashNames = new Set<string>();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf-8');
    const data = JSON.parse(content);

    // Walk the JSON looking for player_name and became_player_name fields
    const walk = (obj: unknown) => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) { obj.forEach(walk); return; }
      const rec = obj as Record<string, unknown>;
      for (const [key, val] of Object.entries(rec)) {
        if ((key === 'player_name' || key === 'became_player_name') && typeof val === 'string' && val.includes(' / ')) {
          slashNames.add(val);
        }
        if (typeof val === 'object') walk(val);
      }
    };
    walk(data);
  }
  return slashNames;
}

// ── Resolve canonical name via player_seasons ────────────────────────────────

async function resolveCanonical(slashName: string): Promise<string | null> {
  // Check manual overrides first
  if (MANUAL_OVERRIDES[slashName] !== undefined) {
    return MANUAL_OVERRIDES[slashName] || null; // empty string = skip/remove
  }

  const parts = slashName.split(' / ').map(p => p.trim());

  // Try each variant against player_seasons
  for (const part of parts) {
    const { data } = await supabase
      .from('player_seasons')
      .select('player_name')
      .ilike('player_name', part)
      .limit(1);

    if (data && data.length > 0) {
      return data[0].player_name;
    }
  }

  // No match in player_seasons — use the shorter/more common name (last part)
  // The CSV typically stores "LegalName / CommonName"
  return parts[parts.length - 1];
}

// ── Apply replacements to all JSON files ─────────────────────────────────────

function applyReplacements(dir: string, replacements: Map<string, string>): number {
  let totalChanges = 0;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf-8');
    let changed = false;

    for (const [slashName, canonical] of replacements) {
      if (content.includes(slashName)) {
        content = content.replaceAll(slashName, canonical);
        changed = true;
        totalChanges++;
      }
    }

    if (changed && !DRY_RUN) {
      fs.writeFileSync(filePath, content, 'utf-8');
    }
  }
  return totalChanges;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN ? '🔍 DRY RUN — no files will be changed\n' : '');

  const nbaDir = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');
  const wnbaDir = path.join(__dirname, '..', 'public', 'data', 'wnba', 'trades', 'by-season');
  const indexPath = path.join(__dirname, '..', 'public', 'data', 'trades');

  // 1. Collect all slash names
  const slashNames = collectSlashNames(nbaDir);
  // Index doesn't have player_name/became_player_name fields,
  // but string replacement will catch slash names in topAssets/players/title/description

  // Check WNBA if exists
  if (fs.existsSync(wnbaDir)) {
    const wnbaSlash = collectSlashNames(wnbaDir);
    for (const s of wnbaSlash) slashNames.add(s);
  }

  console.log(`Found ${slashNames.size} unique slash names\n`);

  // 2. Resolve each to canonical
  const replacements = new Map<string, string>();
  const unresolved: string[] = [];

  for (const slashName of slashNames) {
    const canonical = await resolveCanonical(slashName);
    if (canonical) {
      replacements.set(slashName, canonical);
      console.log(`  ${slashName} → ${canonical}`);
    } else {
      unresolved.push(slashName);
      console.log(`  ⚠️  ${slashName} → UNRESOLVED (will skip)`);
    }
  }

  console.log(`\nResolved: ${replacements.size} | Unresolved: ${unresolved.length}\n`);

  // 3. Apply to all files
  let changes = 0;
  changes += applyReplacements(nbaDir, replacements);
  changes += applyReplacements(indexPath, replacements);
  if (fs.existsSync(wnbaDir)) {
    changes += applyReplacements(wnbaDir, replacements);
  }

  console.log(`\n${DRY_RUN ? 'Would patch' : 'Patched'} ${changes} files`);

  // 4. Output the canonical map for reference
  const mapEntries = [...replacements.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slash, canon]) => `  '${slash}': '${canon}',`);

  console.log('\n// Canonical name map (for reference):');
  console.log('const SLASH_NAME_MAP = {');
  console.log(mapEntries.join('\n'));
  console.log('};');
}

main().catch(console.error);
