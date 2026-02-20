/**
 * Import trades from the bball-trade-network CSV into Supabase.
 *
 * Usage:
 *   npx tsx scripts/import-trades.ts
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Team name mapping: CSV uses full names like "Lakers", schema uses abbreviations like "LAL"
const TEAM_NAME_TO_ID: Record<string, string> = {
  'Hawks': 'ATL', 'Celtics': 'BOS', 'Nets': 'BKN', 'Hornets': 'CHA',
  'Bulls': 'CHI', 'Cavaliers': 'CLE', 'Mavericks': 'DAL', 'Nuggets': 'DEN',
  'Pistons': 'DET', 'Warriors': 'GSW', 'Rockets': 'HOU', 'Pacers': 'IND',
  'Clippers': 'LAC', 'Lakers': 'LAL', 'Grizzlies': 'MEM', 'Heat': 'MIA',
  'Bucks': 'MIL', 'Timberwolves': 'MIN', 'Pelicans': 'NOP', 'Knicks': 'NYK',
  'Thunder': 'OKC', 'Magic': 'ORL', '76ers': 'PHI', 'Suns': 'PHX',
  'Trail Blazers': 'POR', 'Blazers': 'POR', 'Kings': 'SAC', 'Spurs': 'SAS',
  'Raptors': 'TOR', 'Jazz': 'UTA', 'Wizards': 'WAS',
  // Historical names
  'SuperSonics': 'OKC', 'Sonics': 'OKC',
  'Bobcats': 'CHA',
  'New Jersey Nets': 'BKN', 'New Orleans Hornets': 'NOP',
  'Charlotte Bobcats': 'CHA',
  'Braves': 'LAC', // Buffalo Braves -> Clippers
  'Bullets': 'WAS',
  'San Diego Clippers': 'LAC',
  'Vancouver Grizzlies': 'MEM',
  'Seattle SuperSonics': 'OKC',
  'New Orleans/Oklahoma City Hornets': 'NOP',
  'Kansas City Kings': 'SAC',
  'Capital Bullets': 'WAS',
  'Baltimore Bullets': 'WAS',
  'Cincinnati Royals': 'SAC',
  'San Diego Rockets': 'HOU',
  'Buffalo Braves': 'LAC',
};

function resolveTeamId(teamName: string): string | null {
  if (!teamName) return null;
  const trimmed = teamName.trim();

  // Direct lookup
  if (TEAM_NAME_TO_ID[trimmed]) return TEAM_NAME_TO_ID[trimmed];

  // Try matching the last word (e.g., "Portland Trail Blazers" -> "Trail Blazers")
  for (const [key, value] of Object.entries(TEAM_NAME_TO_ID)) {
    if (trimmed.includes(key) || trimmed.endsWith(key)) return value;
  }

  return null;
}

function getSeason(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  // NBA season starts in October
  if (month >= 7) {
    return `${year}-${String(year + 1).slice(2)}`;
  }
  return `${year - 1}-${String(year).slice(2)}`;
}

interface CsvRow {
  key: string;
  date: string;
  to: string;
  from: string;
  action_team: string;
  notes: string;
  edge_label: string;
  pick_involved: string;
  rights_involved: string;
  teams_involved: string;
}

interface GroupedTrade {
  date: string;
  actionTeam: string;
  notes: string;
  teamsInvolved: string[];
  assets: Array<{
    to: string;
    from: string;
    isPick: boolean;
    isRights: boolean;
    edgeLabel: string;
  }>;
  edgeLabel: string;
}

async function main() {
  console.log('Reading CSV...');
  const csvPath = path.join(__dirname, '..', 'data', 'trades.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');

  const records: CsvRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  });

  console.log(`Total rows: ${records.length}`);

  // Filter to only trades (notes contains "trade with")
  const tradeRows = records.filter(r =>
    r.notes && r.notes.toLowerCase().includes('trade with')
  );
  console.log(`Trade rows: ${tradeRows.length}`);

  // Group by date + action_team + notes (same trade)
  const tradeGroups = new Map<string, GroupedTrade>();

  for (const row of tradeRows) {
    // Build a group key from date + action_team + the teams involved
    const groupKey = `${row.date}|${row.action_team}|${row.notes}`;

    if (!tradeGroups.has(groupKey)) {
      const teams = row.teams_involved
        ? row.teams_involved.split(',').map(t => t.trim())
        : [row.action_team];

      tradeGroups.set(groupKey, {
        date: row.date,
        actionTeam: row.action_team,
        notes: row.notes,
        teamsInvolved: teams,
        assets: [],
        edgeLabel: row.edge_label || '',
      });
    }

    tradeGroups.get(groupKey)!.assets.push({
      to: row.to,
      from: row.from,
      isPick: row.pick_involved === 'TRUE',
      isRights: row.rights_involved === 'TRUE',
      edgeLabel: row.edge_label || '',
    });
  }

  console.log(`Unique trades: ${tradeGroups.size}`);

  // Now we need to further consolidate: trades on the same date between the same teams
  // are often the same trade but recorded from each team's perspective.
  // Group by date + sorted team set.
  const consolidatedTrades = new Map<string, GroupedTrade>();

  for (const trade of tradeGroups.values()) {
    const sortedTeams = [...new Set(trade.teamsInvolved)].sort().join('|');
    const consolidatedKey = `${trade.date}|${sortedTeams}`;

    if (!consolidatedTrades.has(consolidatedKey)) {
      consolidatedTrades.set(consolidatedKey, { ...trade });
    } else {
      // Merge assets, avoiding duplicates
      const existing = consolidatedTrades.get(consolidatedKey)!;
      for (const asset of trade.assets) {
        const isDupe = existing.assets.some(
          a => a.to === asset.to && a.from === asset.from
        );
        if (!isDupe) {
          existing.assets.push(asset);
        }
      }
      // Use the longest edge_label as description
      if (trade.edgeLabel.length > existing.edgeLabel.length) {
        existing.edgeLabel = trade.edgeLabel;
      }
    }
  }

  console.log(`Consolidated trades: ${consolidatedTrades.size}`);

  // Insert in batches
  const BATCH_SIZE = 100;
  const trades = Array.from(consolidatedTrades.values());
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < trades.length; i += BATCH_SIZE) {
    const batch = trades.slice(i, i + BATCH_SIZE);

    for (const trade of batch) {
      const teamIds = trade.teamsInvolved
        .map(t => resolveTeamId(t))
        .filter((id): id is string => id !== null);

      if (teamIds.length === 0) {
        skipped++;
        continue;
      }

      // Determine title from assets
      const playerAssets = trade.assets.filter(
        a => a.to !== 'cash' && a.from !== 'cash' &&
          a.to !== 'free agency' && a.from !== 'free agency' &&
          !a.isPick && !a.isRights
      );
      const mainPlayers = playerAssets
        .map(a => a.to)
        .filter(name => name && !name.includes('pick') && !name.includes('round'))
        .slice(0, 3);

      const title = mainPlayers.length > 0
        ? `${mainPlayers.join(', ')} Trade`
        : `${trade.teamsInvolved.join(' / ')} Trade`;

      const season = getSeason(trade.date);
      const isMultiTeam = teamIds.length > 2;

      // Insert transaction
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .insert({
          date: trade.date,
          type: 'trade',
          title,
          description: trade.edgeLabel.replace(/\n/g, ' ').trim(),
          season,
          is_multi_team: isMultiTeam,
          significance: null,
          generation: 0,
        })
        .select('id')
        .single();

      if (txError) {
        console.error(`Error inserting trade: ${txError.message}`);
        skipped++;
        continue;
      }

      const txId = txData.id;

      // Insert transaction_teams
      const teamRows = teamIds.map(teamId => ({
        transaction_id: txId,
        team_id: teamId,
        role: teamId === resolveTeamId(trade.actionTeam) ? 'sender' : 'receiver',
      }));

      // Deduplicate team rows
      const uniqueTeamRows = teamRows.filter(
        (row, idx, arr) => arr.findIndex(r => r.team_id === row.team_id) === idx
      );

      const { error: teamError } = await supabase
        .from('transaction_teams')
        .insert(uniqueTeamRows);

      if (teamError) {
        console.error(`Error inserting teams for ${title}: ${teamError.message}`);
      }

      // Insert transaction_assets
      const assetRows = [];

      for (const asset of trade.assets) {
        if (asset.isPick || asset.to?.toLowerCase().includes('pick') ||
            asset.from?.toLowerCase().includes('pick')) {
          // Draft pick asset
          const pickYear = extractPickYear(asset.to || asset.from || '');
          const pickRound = extractPickRound(asset.to || asset.from || '');
          assetRows.push({
            transaction_id: txId,
            asset_type: 'pick',
            player_name: null,
            pick_year: pickYear,
            pick_round: pickRound,
            from_team_id: resolveTeamId(trade.actionTeam),
            to_team_id: teamIds.find(t => t !== resolveTeamId(trade.actionTeam)) || null,
            notes: `${asset.to || ''} / ${asset.from || ''}`.trim(),
          });
        } else if (asset.to === 'cash' || asset.from === 'cash') {
          assetRows.push({
            transaction_id: txId,
            asset_type: 'cash',
            player_name: null,
            from_team_id: resolveTeamId(trade.actionTeam),
            to_team_id: teamIds.find(t => t !== resolveTeamId(trade.actionTeam)) || null,
            notes: 'Cash considerations',
          });
        } else if (asset.isRights) {
          assetRows.push({
            transaction_id: txId,
            asset_type: 'player',
            player_name: asset.to || asset.from || null,
            from_team_id: resolveTeamId(trade.actionTeam),
            to_team_id: teamIds.find(t => t !== resolveTeamId(trade.actionTeam)) || null,
            notes: 'Rights',
          });
        } else {
          // Player asset - "to" is what the action_team receives
          const playerName = asset.to && asset.to !== 'free agency' ? asset.to : asset.from;
          if (playerName && playerName !== 'free agency') {
            assetRows.push({
              transaction_id: txId,
              asset_type: 'player',
              player_name: playerName,
              from_team_id: resolveTeamId(trade.actionTeam),
              to_team_id: teamIds.find(t => t !== resolveTeamId(trade.actionTeam)) || null,
            });
          }
        }
      }

      if (assetRows.length > 0) {
        const { error: assetError } = await supabase
          .from('transaction_assets')
          .insert(assetRows);

        if (assetError) {
          console.error(`Error inserting assets for ${title}: ${assetError.message}`);
        }
      }

      inserted++;
    }

    console.log(`Progress: ${Math.min(i + BATCH_SIZE, trades.length)}/${trades.length} (${inserted} inserted, ${skipped} skipped)`);
  }

  console.log(`\nDone! Inserted ${inserted} trades, skipped ${skipped}.`);
}

function extractPickYear(text: string): number | null {
  const match = text.match(/(\d{4})\s*(first|second|1st|2nd|round)/i);
  if (match) return parseInt(match[1]);
  const match2 = text.match(/(\d{4})/);
  if (match2) return parseInt(match2[1]);
  return null;
}

function extractPickRound(text: string): number | null {
  if (/first|1st/i.test(text)) return 1;
  if (/second|2nd/i.test(text)) return 2;
  if (/third|3rd/i.test(text)) return 3;
  return null;
}

main().catch(console.error);
