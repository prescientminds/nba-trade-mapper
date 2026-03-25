/**
 * Import player per-game and advanced stats from Kaggle BBRef datasets.
 *
 * Requires CSVs in data/kaggle/:
 *   - "Player Per Game.csv"   (PPG, RPG, APG, GP, FG%)
 *   - "Advanced.csv"          (Win Shares, PER, VORP)
 *
 * Usage: npx tsx scripts/import-player-stats.ts
 */

import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';
import { resolveTeamId, bbrefSeasonToOurs } from './lib/team-resolver';

const DATA_DIR = path.join(__dirname, '..', 'data', 'kaggle');

interface PerGameRow {
  player: string;
  season: string; // end year, e.g. "2020"
  team: string;
  g: string;
  pts_per_game: string;
  trb_per_game: string;
  ast_per_game: string;
  fg_percent: string;
}

interface AdvancedRow {
  player: string;
  season: string;
  team: string;
  ws: string;
  per: string;
  vorp: string;
}

function cleanPlayerName(name: string): string {
  // BBRef adds * for HOF players
  return name.replace(/\*/g, '').trim();
}

async function main() {
  // Read per-game stats
  const perGamePath = path.join(DATA_DIR, 'Player Per Game.csv');
  if (!fs.existsSync(perGamePath)) {
    console.error(`Missing file: ${perGamePath}`);
    console.error('Download from: https://www.kaggle.com/datasets/sumitrodatta/nba-aba-baa-stats');
    process.exit(1);
  }

  console.log('Reading Player Per Game.csv...');
  const perGameCsv = fs.readFileSync(perGamePath, 'utf-8');
  const perGameRows: PerGameRow[] = parse(perGameCsv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
  console.log(`Per-game rows: ${perGameRows.length}`);

  // Read advanced stats
  const advancedPath = path.join(DATA_DIR, 'Advanced.csv');
  let advancedMap = new Map<string, AdvancedRow>();

  if (fs.existsSync(advancedPath)) {
    console.log('Reading Advanced.csv...');
    const advancedCsv = fs.readFileSync(advancedPath, 'utf-8');
    const advancedRows: AdvancedRow[] = parse(advancedCsv, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
    });
    console.log(`Advanced rows: ${advancedRows.length}`);

    // Index by player+season+team
    for (const row of advancedRows) {
      const key = `${cleanPlayerName(row.player)}|${row.season}|${row.team}`;
      advancedMap.set(key, row);
    }
  } else {
    console.log('Advanced.csv not found, importing without advanced stats.');
  }

  // Merge and build upsert rows
  const upsertRows: Array<{
    player_name: string;
    team_id: string;
    season: string;
    gp: number | null;
    ppg: number | null;
    rpg: number | null;
    apg: number | null;
    fg_pct: number | null;
    win_shares: number | null;
    per: number | null;
    vorp: number | null;
  }> = [];

  let skipped = 0;

  for (const row of perGameRows) {
    const endYear = parseInt(row.season);
    if (isNaN(endYear) || endYear < 1977) {
      skipped++;
      continue; // Filter to 1976-77 season onwards (ABA-NBA merger)
    }

    const teamId = resolveTeamId(row.team);
    if (!teamId) {
      skipped++;
      continue; // Skip TOT rows and unrecognized teams
    }

    const playerName = cleanPlayerName(row.player);
    const season = bbrefSeasonToOurs(endYear);

    // Look up advanced stats
    const advKey = `${playerName}|${row.season}|${row.team}`;
    const adv = advancedMap.get(advKey);

    upsertRows.push({
      player_name: playerName,
      team_id: teamId,
      season,
      gp: parseFloat(row.g) || null,
      ppg: parseFloat(row.pts_per_game) || null,
      rpg: parseFloat(row.trb_per_game) || null,
      apg: parseFloat(row.ast_per_game) || null,
      fg_pct: parseFloat(row.fg_percent) || null,
      win_shares: adv ? (parseFloat(adv.ws) || null) : null,
      per: adv ? (parseFloat(adv.per) || null) : null,
      vorp: adv ? (parseFloat(adv.vorp) || null) : null,
    });
  }

  console.log(`Rows to upsert: ${upsertRows.length} (skipped: ${skipped})`);

  // Upsert in batches of 500
  const BATCH = 500;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < upsertRows.length; i += BATCH) {
    const batch = upsertRows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('player_seasons')
      .upsert(batch, { onConflict: 'player_name,team_id,season' });

    if (error) {
      console.error(`Batch error at ${i}: ${error.message} — retrying row-by-row...`);
      // Retry row-by-row to isolate failures (likely encoding issues)
      for (const row of batch) {
        const { error: rowErr } = await supabase
          .from('player_seasons')
          .upsert([row], { onConflict: 'player_name,team_id,season' });
        if (rowErr) {
          console.error(`  Row error: ${row.player_name} ${row.season} ${row.team_id}: ${rowErr.message}`);
          errors++;
        } else {
          inserted++;
        }
      }
    } else {
      inserted += batch.length;
    }

    if ((i + BATCH) % 5000 === 0 || i + BATCH >= upsertRows.length) {
      console.log(`Progress: ${Math.min(i + BATCH, upsertRows.length)}/${upsertRows.length}`);
    }
  }

  console.log(`\nDone! Upserted ${inserted} player-seasons (${errors} batch errors).`);
}

main().catch(console.error);
