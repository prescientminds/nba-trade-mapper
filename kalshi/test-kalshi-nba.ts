/**
 * Targeted search for NBA markets on Kalshi.
 * Run: npx tsx scripts/test-kalshi-nba.ts
 */
import { Configuration, MarketApi, EventsApi, SearchApi } from 'kalshi-typescript';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const config = new Configuration({
  apiKey: process.env.KALSHI_API_KEY_ID!,
  privateKeyPath: process.env.KALSHI_PRIVATE_KEY_PATH!,
  basePath: 'https://api.elections.kalshi.com/trade-api/v2',
});

async function main() {
  const searchApi = new SearchApi(config);
  const eventsApi = new EventsApi(config);
  const marketApi = new MarketApi(config);

  // 1. Get the full Basketball sports filter to find NBA ticker patterns
  console.log('=== Basketball Competitions ===');
  try {
    const filters = await searchApi.getFiltersForSports();
    const basketball = (filters.data as any)?.filters_by_sports?.['Basketball'];
    console.log(JSON.stringify(basketball, null, 2));
  } catch (e: any) {
    console.log('Error:', e.response?.status, e.response?.data || e.message);
  }

  // 2. Get all open events (paginate to find NBA)
  console.log('\n=== All Open Events (looking for NBA) ===');
  try {
    let cursor: string | undefined;
    let nbaEvents: any[] = [];
    let totalEvents = 0;
    let pages = 0;

    do {
      const events = await eventsApi.getEvents(200, cursor, true, false, 'open' as any);
      const data = events.data as any;
      const eventList = data?.events || [];
      totalEvents += eventList.length;
      pages++;

      for (const ev of eventList) {
        const text = `${ev.title} ${ev.event_ticker} ${ev.series_ticker} ${ev.category || ''}`.toLowerCase();
        if (text.includes('nba') || text.includes('basketball') || text.includes('lakers') || text.includes('celtics')) {
          nbaEvents.push(ev);
        }
      }

      cursor = data?.cursor;
      if (!cursor || eventList.length < 200) break;
    } while (pages < 5);

    console.log(`Scanned ${totalEvents} open events across ${pages} pages`);
    console.log(`Found ${nbaEvents.length} NBA/basketball events:\n`);

    for (const ev of nbaEvents.slice(0, 20)) {
      console.log(`${ev.event_ticker} | ${ev.title}`);
      console.log(`  series: ${ev.series_ticker} | category: ${ev.category} | status: ${ev.status}`);
      if (ev.markets) {
        for (const m of ev.markets.slice(0, 3)) {
          console.log(`  → ${m.ticker}: ${m.title} — yes: ${m.yes_bid}¢ (vol: ${m.volume})`);
        }
        if (ev.markets.length > 3) console.log(`  → ... and ${ev.markets.length - 3} more markets`);
      }
      console.log();
    }

    // Collect unique series tickers from NBA events
    const seriesTickers = [...new Set(nbaEvents.map((e: any) => e.series_ticker))];
    console.log(`NBA series tickers found: ${seriesTickers.join(', ')}`);
  } catch (e: any) {
    console.log('Error:', e.response?.status, e.response?.data || e.message);
  }

  // 3. Also check series list with NBA-related tickers
  console.log('\n=== Series List (all, looking for NBA) ===');
  try {
    const series = await marketApi.getSeriesList(200);
    const allSeries = (series.data as any)?.series || [];
    console.log(`Total series returned: ${allSeries.length}`);

    const nbaSeries = allSeries.filter((s: any) => {
      const text = `${s.ticker} ${s.title} ${s.category || ''}`.toLowerCase();
      return text.includes('nba') || text.includes('basketball');
    });

    for (const s of nbaSeries) {
      console.log(`  ${s.ticker}: ${s.title} (category: ${s.category}, status: ${s.status})`);
    }

    if (allSeries.length > 0 && nbaSeries.length === 0) {
      console.log('\nNo NBA series found. Showing first 10 series:');
      for (const s of allSeries.slice(0, 10)) {
        console.log(`  ${s.ticker}: ${s.title} (category: ${s.category})`);
      }
    }
  } catch (e: any) {
    console.log('Error:', e.response?.status, e.response?.data || e.message);
  }
}

main().catch(console.error);
