/**
 * Compute Roster Ingredients — how every team-season was assembled.
 *
 * For every team-season from 1999-00 forward (FA data floor):
 *   1. Find all players on that team that season (from player_seasons)
 *   2. Trace how each player arrived: trade, draft, or free agency
 *   3. For trade-acquired players, identify which trade brought them
 *   4. Compute % of WS from each acquisition type — playoff WS for playoff teams,
 *      regular-season WS for non-playoff teams
 *   5. Identify the single trade that contributed the most WS
 *
 * Reads:   public/data/trades/by-season/*.json, player_seasons, team_seasons
 * Writes:  championship_ingredients table (one row per team-season)
 *
 * PREREQUISITE: Run database/migrations/016-discovery-v2.sql first.
 *
 * Acquisition logic:
 *   - "trade": player appears in transaction_assets going TO this team before this season
 *   - "draft": player's first season on any team was this team, and they were never traded here
 *   - "fa": player was on a different team before, but no trade brought them here
 *
 * Usage:
 *   npx tsx scripts/compute-dynasty-ingredients.ts              # Compute all (1999+)
 *   npx tsx scripts/compute-dynasty-ingredients.ts --champs-only # Legacy: only championship teams
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

function prevSeason(season: string): string {
  const start = parseInt(season.split('-')[0], 10);
  return `${start - 1}-${String(start).slice(-2)}`;
}

/**
 * Find the first season of the player's CURRENT stint on this team.
 * A stint is a contiguous run of seasons on the same team — but a gap caused by
 * the player missing a full season (no player_seasons row for ANY team) does
 * NOT break the stint. This matters for injury-lost seasons: Jamal Murray missed
 * 2021-22 with a torn ACL but never left Denver; his 2022-23 stint should trace
 * back to 2016-17, not restart.
 *
 * A gap year where the player has a row for a DIFFERENT team (Dwight Howard's
 * 2013-19 years away from LAL) IS a departure and breaks the stint.
 *
 * Returns null if the player has no row for (team, targetSeason).
 */
function findStintStart(
  playerSeasons: PlayerSeason[],
  teamId: string,
  targetSeason: string,
): string | null {
  const teamSeasonSet = new Set(playerSeasons.map(s => `${s.season}|${s.team_id}`));
  const allSeasonSet = new Set(playerSeasons.map(s => s.season));
  if (!teamSeasonSet.has(`${targetSeason}|${teamId}`)) return null;

  let stintStart = targetSeason;
  let cursor = targetSeason;
  while (true) {
    const prev = prevSeason(cursor);
    if (teamSeasonSet.has(`${prev}|${teamId}`)) {
      stintStart = prev;
      cursor = prev;
      continue;
    }
    // Not on this team in `prev`. If the player was on SOME OTHER team that year
    // (or retired/new-to-league), that's a real departure — stop walking.
    // If the player has no row at all (full-year absence, typically injury),
    // step over the gap and keep checking earlier years.
    if (allSeasonSet.has(prev)) break;
    cursor = prev;
    // Safety: don't walk past some reasonable lower bound
    if (seasonToYear(prev) < 1946) break;
  }
  return stintStart;
}

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

// FA transaction data starts 1999-00; earlier team-seasons can't reliably identify signings.
const FIRST_SEASON = '1999-00';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const champsOnly = args.includes('--champs-only');

  console.log(`Computing Roster Ingredients${champsOnly ? ' (champions only)' : ''}...\n`);

  // Load data
  const [playerSeasons, teamSeasons] = await Promise.all([
    fetchAll<PlayerSeason>('player_seasons', 'player_name,team_id,season,win_shares,playoff_ws'),
    fetchAll<{ team_id: string; season: string; championship: boolean }>('team_seasons', 'team_id,season,championship'),
  ]);

  console.log(`  player_seasons: ${playerSeasons.length}`);
  console.log(`  team_seasons: ${teamSeasons.length}`);

  // Target team-seasons: champions-only (legacy) or all post-1999 (new default)
  const targetSeasons = champsOnly
    ? teamSeasons.filter(t => t.championship)
    : teamSeasons.filter(t => t.season >= FIRST_SEASON);
  console.log(`  Target team-seasons: ${targetSeasons.length}\n`);

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

  // Two separate indexes. The distinction matters for acquisition categorization:
  //   directTradeIndex — player was directly traded to team (arrives as established NBA asset)
  //   pickTradeIndex   — pick that became this player was acquired by team via trade
  //                      (team still drafted the player, but acquired the pick via trade)
  const directTradeIndex = new Map<string, { trade: Trade; season: string }[]>();
  const pickTradeIndex = new Map<string, { trade: Trade; season: string }[]>();

  for (const trade of allTrades) {
    for (const asset of trade.assets) {
      if (asset.type === 'cash' || asset.type === 'swap') continue;

      if (asset.type === 'player' && asset.player_name) {
        const key = `${asset.player_name}|${asset.to_team_id}`;
        if (!directTradeIndex.has(key)) directTradeIndex.set(key, []);
        directTradeIndex.get(key)!.push({ trade, season: trade.season });
      }

      if (asset.type === 'pick' && asset.became_player_name) {
        const key = `${asset.became_player_name}|${asset.to_team_id}`;
        if (!pickTradeIndex.has(key)) pickTradeIndex.set(key, []);
        pickTradeIndex.get(key)!.push({ trade, season: trade.season });
      }
    }
  }

  for (const [, arr] of directTradeIndex) arr.sort((a, b) => a.season.localeCompare(b.season));
  for (const [, arr] of pickTradeIndex) arr.sort((a, b) => a.season.localeCompare(b.season));

  console.log(`  Direct-trade index: ${directTradeIndex.size} entries.`);
  console.log(`  Pick-trade index:   ${pickTradeIndex.size} entries.\n`);

  // ── Process each championship ──

  type Acquisition = 'trade' | 'draft' | 'traded_pick' | 'fa';

  interface RosterEntry {
    name: string;
    playoff_ws: number;
    weight: number; // playoff WS when team made postseason, else regular-season WS
    acquisition: Acquisition;
    trade_id?: string;
    trade_season?: string;
  }

  interface ChampResult {
    team_id: string;
    season: string;
    roster: RosterEntry[];
    trade_pct: number;
    draft_pct: number;
    traded_pick_pct: number;
    fa_pct: number;
    top_trade_id: string | null;
    top_trade_pws: number;
  }

  const results: ChampResult[] = [];

  for (const ts of targetSeasons) {
    const { team_id, season } = ts;

    const rosterPlayers = playerSeasons.filter(
      ps => ps.team_id === team_id && ps.season === season
    );

    const roster: RosterEntry[] = [];

    // Regular-season WS is the weighting fallback for non-playoff team-seasons
    const teamPlayoffWsTotal = rosterPlayers.reduce((s, p) => s + (p.playoff_ws ?? 0), 0);

    for (const ps of rosterPlayers) {
      const playoffWs = ps.playoff_ws ?? 0;
      const playerName = ps.player_name;

      const allPlayerSeasons = seasonsByPlayer.get(playerName) || [];
      const firstCareerSeason = allPlayerSeasons[0]?.season ?? null;

      // Current stint on this team — contiguous, gap-aware
      const stintStart = findStintStart(allPlayerSeasons, team_id, season);

      // Direct-trade match: a player-trade whose season matches the stint's first season.
      // This avoids the "left-and-came-back" bug where an ancient trade record (e.g. Dwight
      // Howard to LAL in 2012-13) gets credited to a completely separate later FA stint.
      const directArrivals = directTradeIndex.get(`${playerName}|${team_id}`) || [];
      const directTrade = stintStart
        ? directArrivals.find(a => a.season === stintStart)
        : undefined;

      // Pick-trade match: a traded pick that ultimately became this player. Only counts
      // when the player's FIRST NBA season is on this team (i.e. this team drafted them)
      // AND the pick was acquired via trade. Draymond Green, Jayson Tatum, Jamal Murray.
      const pickArrivals = pickTradeIndex.get(`${playerName}|${team_id}`) || [];
      const pickTrade = pickArrivals[0];
      const draftedHere = stintStart !== null && stintStart === firstCareerSeason;

      let acquisition: Acquisition;
      let tradeId: string | undefined;
      let tradeSeason: string | undefined;

      if (directTrade) {
        acquisition = 'trade';
        tradeId = directTrade.trade.id;
        tradeSeason = directTrade.season;
      } else if (draftedHere && pickTrade) {
        acquisition = 'traded_pick';
        tradeId = pickTrade.trade.id;
        tradeSeason = pickTrade.season;
      } else if (draftedHere) {
        acquisition = 'draft';
      } else {
        acquisition = 'fa';
      }

      const weight = teamPlayoffWsTotal > 0
        ? Math.max(0, playoffWs)
        : Math.max(0, ps.win_shares ?? 0);

      roster.push({
        name: playerName,
        playoff_ws: r2(playoffWs),
        weight: r2(weight),
        acquisition,
        ...(tradeId && { trade_id: tradeId, trade_season: tradeSeason }),
      });
    }

    // Compute percentages from the weight field
    const totalW = roster.reduce((s, r) => s + r.weight, 0);
    const sumBy = (acq: Acquisition) =>
      roster.filter(r => r.acquisition === acq).reduce((s, r) => s + r.weight, 0);
    const tradeW = sumBy('trade');
    const draftW = sumBy('draft');
    const tradedPickW = sumBy('traded_pick');
    const faW = sumBy('fa');

    const tradePct = totalW > 0 ? r2(tradeW / totalW * 100) : 0;
    const draftPct = totalW > 0 ? r2(draftW / totalW * 100) : 0;
    const tradedPickPct = totalW > 0 ? r2(tradedPickW / totalW * 100) : 0;
    const faPct = totalW > 0 ? r2(faW / totalW * 100) : 0;

    // Top trade includes both direct and pick-trade contributions — the single
    // transaction that added the most weight to the roster regardless of category.
    const tradeContributions = new Map<string, number>();
    for (const r of roster) {
      if ((r.acquisition === 'trade' || r.acquisition === 'traded_pick') && r.trade_id) {
        tradeContributions.set(r.trade_id, (tradeContributions.get(r.trade_id) || 0) + r.weight);
      }
    }
    let topTradeId: string | null = null;
    let topTradePws = 0;
    for (const [tid, pws] of tradeContributions) {
      if (pws > topTradePws) { topTradeId = tid; topTradePws = pws; }
    }

    roster.sort((a, b) => b.playoff_ws - a.playoff_ws);

    results.push({
      team_id, season, roster,
      trade_pct: tradePct, draft_pct: draftPct, traded_pick_pct: tradedPickPct, fa_pct: faPct,
      top_trade_id: topTradeId, top_trade_pws: r2(topTradePws),
    });
  }

  // Sort by (trade + traded_pick) descending — the aggregate "built by transactions" signal
  results.sort((a, b) => (b.trade_pct + b.traded_pick_pct) - (a.trade_pct + a.traded_pick_pct));

  console.log(`Computed ${results.length} team-season breakdowns.\n`);

  const printAll = dryRun || args.includes('--verbose');
  for (const r of results) {
    const trade = allTrades.find(t => t.id === r.top_trade_id);
    const topTradeLabel = trade ? `${trade.title || trade.id.slice(-8)} (${trade.season})` : 'none';
    console.log(`${r.season} ${r.team_id}  —  Trade: ${r.trade_pct}%  Draft: ${r.draft_pct}%  Traded-pick: ${r.traded_pick_pct}%  FA: ${r.fa_pct}%`);
    console.log(`  Top trade: ${topTradeLabel} → ${r.top_trade_pws.toFixed(1)} weight`);
    if (printAll) {
      for (const p of r.roster.slice(0, 8)) {
        console.log(`    ${p.acquisition.padEnd(12)} ${p.name}: ${p.playoff_ws.toFixed(1)} pWS${p.trade_id ? ` (trade: ${p.trade_season})` : ''}`);
      }
    }
    console.log('');
  }

  if (dryRun) {
    console.log('Dry run — no database writes.');
    return;
  }

  console.log('Upserting to championship_ingredients...');
  const batch = results.map(r => ({
    team_id: r.team_id,
    season: r.season,
    league: 'NBA',
    roster: r.roster,
    trade_pct: r.trade_pct,
    draft_pct: r.draft_pct,
    traded_pick_pct: r.traded_pick_pct,
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
