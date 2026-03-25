/**
 * Quick test: verify Kalshi API connection and explore NBA markets.
 * Run: npx tsx scripts/test-kalshi.ts
 */
import { Configuration, MarketApi, EventsApi, SearchApi } from 'kalshi-typescript';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const apiKeyId = process.env.KALSHI_API_KEY_ID;
const privateKeyPath = process.env.KALSHI_PRIVATE_KEY_PATH;

if (!apiKeyId || !privateKeyPath) {
  console.error('Missing KALSHI_API_KEY_ID or KALSHI_PRIVATE_KEY_PATH in .env.local');
  process.exit(1);
}

const config = new Configuration({
  apiKey: apiKeyId,
  privateKeyPath: privateKeyPath,
  basePath: 'https://api.elections.kalshi.com/trade-api/v2',
});

async function main() {
  const searchApi = new SearchApi(config);
  const eventsApi = new EventsApi(config);
  const marketApi = new MarketApi(config);

  // 1. Check sports filters to find NBA
  console.log('=== Sports Filters ===');
  try {
    const filters = await searchApi.getFiltersForSports();
    console.log(JSON.stringify(filters.data, null, 2).slice(0, 2000));
  } catch (e: any) {
    console.log('Sports filters error:', e.response?.status, e.response?.data || e.message);
  }

  // 2. Look for NBA events
  console.log('\n=== NBA Events (series: NBA*) ===');
  try {
    const events = await eventsApi.getEvents(20, undefined, true, false, 'open' as any, undefined);
    const nbaEvents = (events.data as any)?.events?.filter((e: any) =>
      e.title?.toLowerCase().includes('nba') ||
      e.category?.toLowerCase().includes('nba') ||
      e.series_ticker?.toLowerCase().includes('nba')
    ) || [];
    console.log(`Found ${nbaEvents.length} NBA events out of ${(events.data as any)?.events?.length || 0} total open events`);
    for (const ev of nbaEvents.slice(0, 5)) {
      console.log(`  ${ev.event_ticker}: ${ev.title} (series: ${ev.series_ticker})`);
      if (ev.markets) {
        for (const m of ev.markets.slice(0, 3)) {
          console.log(`    ${m.ticker}: ${m.title} — yes: ${m.yes_bid}¢ / no: ${m.no_bid}¢`);
        }
      }
    }
  } catch (e: any) {
    console.log('Events error:', e.response?.status, e.response?.data || e.message);
  }

  // 3. Search for NBA markets directly
  console.log('\n=== NBA Markets (keyword search) ===');
  try {
    const markets = await marketApi.getMarkets(20);
    const allMarkets = (markets.data as any)?.markets || [];
    const nbaMarkets = allMarkets.filter((m: any) =>
      m.title?.toLowerCase().includes('nba') ||
      m.event_ticker?.toLowerCase().includes('nba') ||
      m.series_ticker?.toLowerCase().includes('nba')
    );
    console.log(`Found ${nbaMarkets.length} NBA markets out of ${allMarkets.length} returned`);
    for (const m of nbaMarkets.slice(0, 10)) {
      console.log(`  ${m.ticker}: ${m.title}`);
      console.log(`    yes_bid: ${m.yes_bid}¢  volume: ${m.volume}  status: ${m.status}`);
    }

    // Also show any sports markets
    const sportsMarkets = allMarkets.filter((m: any) =>
      m.category?.toLowerCase().includes('sport') ||
      m.series_ticker?.toLowerCase().includes('nba') ||
      m.series_ticker?.toLowerCase().includes('nfl') ||
      m.series_ticker?.toLowerCase().includes('mlb')
    );
    if (sportsMarkets.length > 0) {
      console.log(`\n  All sports markets found: ${sportsMarkets.length}`);
      for (const m of sportsMarkets.slice(0, 5)) {
        console.log(`  ${m.ticker}: ${m.title} (series: ${m.series_ticker})`);
      }
    }
  } catch (e: any) {
    console.log('Markets error:', e.response?.status, e.response?.data || e.message);
  }

  // 4. Try getting series list for NBA
  console.log('\n=== Series List ===');
  try {
    const series = await marketApi.getSeriesList(20);
    const allSeries = (series.data as any)?.series || [];
    const nbaSeries = allSeries.filter((s: any) =>
      s.ticker?.toLowerCase().includes('nba') ||
      s.title?.toLowerCase().includes('nba') ||
      s.title?.toLowerCase().includes('basketball')
    );
    console.log(`Found ${nbaSeries.length} NBA series out of ${allSeries.length} total`);
    for (const s of nbaSeries.slice(0, 10)) {
      console.log(`  ${s.ticker}: ${s.title} (category: ${s.category})`);
    }

    // Show all series categories
    const categories = [...new Set(allSeries.map((s: any) => s.category))];
    console.log(`\nAll series categories: ${categories.join(', ')}`);
  } catch (e: any) {
    console.log('Series error:', e.response?.status, e.response?.data || e.message);
  }
}

main().catch(console.error);
