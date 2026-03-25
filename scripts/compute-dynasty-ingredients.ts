/**
 * Compute Dynasty Ingredients — how each championship was assembled.
 *
 * For every championship team:
 *   1. Find all players on that team that season (from player_seasons)
 *   2. Trace how each player arrived: trade, draft, or free agency
 *   3. For trade-acquired players, identify which trade brought them
 *   4. Compute % of playoff WS from each acquisition type
 *   5. Identify the single trade that contributed the most playoff WS
 *
 * Reads:   public/data/trades/by-season/*.json, player_seasons, team_seasons
 * Writes:  championship_ingredients table
 *
 * PREREQUISITE: Run database/migrations/016-discovery-v2.sql first.
 *
 * Acquisition logic:
 *   - "trade": player appears in transaction_assets going TO this team before this season
 *   - "draft": player's first season on any team was this team, and they were never traded here
 *   - "fa": player was on a different team before, but no trade brought them here
 *
 * Usage:
 *   npx tsx scripts/compute-dynasty-ingredients.ts              # Compute all
 *   npx tsx scripts/compute-dynasty-ingredients.ts --dry-run    # Print results, no DB writes
 */

import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';

const TRADES_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');

// ── Types ──

interface TradeAsset {
  type: 'player' | 'pick' | 'swap' | 'cash';
  player_name: string | null;
  from_team_id: string;
  to_team_id: string;
  pick_year: number | null;
  became_player_name: string | null;
}

interface Trade {
  id: string;
  date: string;
  season: string;
  title: string;
  assets: TradeAsset[];
}

interface PlayerSeason {
  player_name: string;
  team_id: string;
  season: string;
  win_shares: number | null;
  playoff_ws: number | null;
}

function r2(n: number): number { return Math.round(n * 100) / 100; }

function seasonToYear(s: string): number { return parseInt(s.split('-')[0], 10); }

// ── Bulk loader ──

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

// ── Main ──

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('Computing Dynasty Ingredients...\n');

  // Load data
  const [playerSeasons, teamSeasons] = await Promise.all([
    fetchAll<PlayerSeason>('player_seasons', 'player_name,team_id,season,win_shares,playoff_ws'),
    fetchAll<{ team_id: string; season: string; championship: boolean }>('team_seasons', 'team_id,season,championship'),
  ]);

  console.log(`  player_seasons: ${playerSeasons.length}`);
  console.log(`  team_seasons: ${teamSeasons.length}`);

  // Championship team-seasons
  const champSeasons = teamSeasons.filter(t => t.championship);
  console.log(`  Championships: ${champSeasons.length}\n`);

  // Index: player → all their seasons (sorted by season)
  const seasonsByPlayer = new Map<string, PlayerSeason[]>();
  for (const row of playerSeasons) {
    if (!seasonsByPlayer.has(row.player_name)) seasonsByPlayer.set(row.player_name, []);
    seasonsByPlayer.get(row.player_name)!.push(row);
  }
  // Sort each player's seasons chronologically
  for (const [, arr] of seasonsByPlayer) arr.sort((a, b) => a.season.localeCompare(b.season));

  // Load all trades and build index: "playerName|toTeamId" → trades that brought them there
  const allSeasonFiles = fs.readdirSync(TRADES_DIR)
    .filter(f => f.endsWith('.json') && f !== 'search-index.json').sort();
  const allTrades: Trade[] = [];
  for (const file of allSeasonFiles) {
    allTrades.push(...JSON.parse(fs.readFileSync(path.join(TRADES_DIR, file), 'utf-8')) as Trade[]);
  }
  console.log(`  ${allTrades.length} trades loaded.`);

  // Index: "playerName|teamId" → most recent trade that brought them to teamId
  // (Handles re-trades: take the latest trade before the championship season)
  const tradeArrivalIndex = new Map<string, { trade: Trade; season: string }[]>();
  for (const trade of allTrades) {
    for (const asset of trade.assets) {
      if (asset.type === 'cash' || asset.type === 'swap') continue;

      // Player directly traded
      if (asset.type === 'player' && asset.player_name) {
        const key = `${asset.player_name}|${asset.to_team_id}`;
        if (!tradeArrivalIndex.has(key)) tradeArrivalIndex.set(key, []);
        tradeArrivalIndex.get(key)!.push({ trade, season: trade.season });
      }

      // Pick that became a player — the team drafts them
      if (asset.type === 'pick' && asset.became_player_name) {
        const key = `${asset.became_player_name}|${asset.to_team_id}`;
        if (!tradeArrivalIndex.has(key)) tradeArrivalIndex.set(key, []);
        tradeArrivalIndex.get(key)!.push({ trade, season: trade.season });
      }
    }
  }
  // Sort each entry chronologically
  for (const [, arr] of tradeArrivalIndex) arr.sort((a, b) => a.season.localeCompare(b.season));

  console.log(`  Trade arrival index: ${tradeArrivalIndex.size} entries.\n`);

  // ── Process each championship ──

  interface RosterEntry {
    name: string;
    playoff_ws: number;
    acquisition: 'trade' | 'draft' | 'fa';
    trade_id?: string;
    trade_season?: string;
  }

  interface ChampResult {
    team_id: string;
    season: string;
    roster: RosterEntry[];
    trade_pct: number;
    draft_pct: number;
    fa_pct: number;
    top_trade_id: string | null;
    top_trade_pws: number;
  }

  const results: ChampResult[] = [];

  for (const champ of champSeasons) {
    const { team_id, season } = champ;
    const champYear = seasonToYear(season);

    // Find all players on this team this season
    const rosterPlayers = playerSeasons.filter(
      ps => ps.team_id === team_id && ps.season === season
    );

    const roster: RosterEntry[] = [];

    for (const ps of rosterPlayers) {
      const playoffWs = ps.playoff_ws ?? 0;
      const playerName = ps.player_name;

      // Determine acquisition method
      const allPlayerSeasons = seasonsByPlayer.get(playerName) || [];
      const firstSeason = allPlayerSeasons[0];
      const firstOnThisTeam = allPlayerSeasons.find(s => s.team_id === team_id);
      const wasOnOtherTeamBefore = allPlayerSeasons.some(
        s => s.team_id !== team_id && s.season < season
      );

      // Check if any trade brought this player to this team before the championship season
      const tradeKey = `${playerName}|${team_id}`;
      const arrivals = tradeArrivalIndex.get(tradeKey) || [];
      // Find the most recent trade arrival BEFORE or during the championship season
      const relevantTrade = [...arrivals]
        .filter(a => a.season <= season)
        .pop(); // Last one (most recent)

      let acquisition: 'trade' | 'draft' | 'fa';
      let tradeId: string | undefined;
      let tradeSeason: string | undefined;

      if (relevantTrade) {
        // Player was traded here (or drafted via a traded pick)
        acquisition = 'trade';
        tradeId = relevantTrade.trade.id;
        tradeSeason = relevantTrade.season;
      } else if (firstSeason && firstSeason.team_id === team_id && !wasOnOtherTeamBefore) {
        // First NBA season was on this team, never played elsewhere before → drafted
        acquisition = 'draft';
      } else if (firstOnThisTeam && firstOnThisTeam.season === season && !relevantTrade) {
        // First time on this team is the championship season, no trade → FA signing
        acquisition = 'fa';
      } else if (wasOnOtherTeamBefore && !relevantTrade) {
        // Was on another team before, no trade record → free agency
        acquisition = 'fa';
      } else {
        // Default: if first season on this team and no other data → draft
        acquisition = 'draft';
      }

      roster.push({
        name: playerName,
        playoff_ws: r2(playoffWs),
        acquisition,
        ...(tradeId && { trade_id: tradeId, trade_season: tradeSeason }),
      });
    }

    // Compute percentages
    const totalPws = roster.reduce((s, r) => s + Math.max(0, r.playoff_ws), 0);
    const tradePws = roster.filter(r => r.acquisition === 'trade').reduce((s, r) => s + Math.max(0, r.playoff_ws), 0);
    const draftPws = roster.filter(r => r.acquisition === 'draft').reduce((s, r) => s + Math.max(0, r.playoff_ws), 0);
    const faPws = roster.filter(r => r.acquisition === 'fa').reduce((s, r) => s + Math.max(0, r.playoff_ws), 0);

    const tradePct = totalPws > 0 ? r2(tradePws / totalPws * 100) : 0;
    const draftPct = totalPws > 0 ? r2(draftPws / totalPws * 100) : 0;
    const faPct = totalPws > 0 ? r2(faPws / totalPws * 100) : 0;

    // Find the single trade that contributed the most playoff WS
    const tradeContributions = new Map<string, number>();
    for (const r of roster) {
      if (r.acquisition === 'trade' && r.trade_id) {
        tradeContributions.set(r.trade_id, (tradeContributions.get(r.trade_id) || 0) + Math.max(0, r.playoff_ws));
      }
    }
    let topTradeId: string | null = null;
    let topTradePws = 0;
    for (const [tid, pws] of tradeContributions) {
      if (pws > topTradePws) { topTradeId = tid; topTradePws = pws; }
    }

    // Sort roster by playoff WS descending
    roster.sort((a, b) => b.playoff_ws - a.playoff_ws);

    results.push({
      team_id, season, roster,
      trade_pct: tradePct, draft_pct: draftPct, fa_pct: faPct,
      top_trade_id: topTradeId, top_trade_pws: r2(topTradePws),
    });
  }

  // Sort by trade_pct descending (most trade-assembled championships first)
  results.sort((a, b) => b.trade_pct - a.trade_pct);

  console.log(`Computed ${results.length} championship breakdowns.\n`);

  // Print
  const printAll = dryRun || args.includes('--verbose');
  for (const r of results) {
    const trade = allTrades.find(t => t.id === r.top_trade_id);
    const topTradeLabel = trade ? `${trade.title || trade.id.slice(-8)} (${trade.season})` : 'none';
    console.log(`${r.season} ${r.team_id}  —  Trade: ${r.trade_pct}%  Draft: ${r.draft_pct}%  FA: ${r.fa_pct}%`);
    console.log(`  Top trade: ${topTradeLabel} → ${r.top_trade_pws.toFixed(1)} playoff WS`);
    if (printAll) {
      for (const p of r.roster.slice(0, 8)) {
        console.log(`    ${p.acquisition.padEnd(5)} ${p.name}: ${p.playoff_ws.toFixed(1)} pWS${p.trade_id ? ` (trade: ${p.trade_season})` : ''}`);
      }
    }
    console.log('');
  }

  if (dryRun) {
    console.log('Dry run — no database writes.');
    return;
  }

  // Upsert to championship_ingredients
  console.log('Upserting to championship_ingredients...');
  const batch = results.map(r => ({
    team_id: r.team_id,
    season: r.season,
    league: 'NBA',
    roster: r.roster,
    trade_pct: r.trade_pct,
    draft_pct: r.draft_pct,
    fa_pct: r.fa_pct,
    top_trade_id: r.top_trade_id,
    top_trade_pws: r.top_trade_pws,
  }));

  const { error } = await supabase
    .from('championship_ingredients')
    .upsert(batch, { onConflict: 'team_id,season' });

  if (error) {
    console.error(`Upsert error: ${error.message}`);
  } else {
    console.log(`Done! Upserted ${batch.length} championship rows.`);
  }
}

main().catch(console.error);
