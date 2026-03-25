/**
 * Broader search: find all sports markets, understand ticker patterns.
 * Run: npx tsx scripts/test-kalshi-sports.ts
 */
import { Configuration, MarketApi, EventsApi } from 'kalshi-typescript';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const config = new Configuration({
  apiKey: process.env.KALSHI_API_KEY_ID!,
  privateKeyPath: process.env.KALSHI_PRIVATE_KEY_PATH!,
  basePath: 'https://api.elections.kalshi.com/trade-api/v2',
});

async function main() {
  const marketApi = new MarketApi(config);
  const eventsApi = new EventsApi(config);

  // Search markets with various basketball/NBA-related terms
  const sportTerms = ['lakers', 'celtics', 'lebron', 'curry', 'nuggets', 'knicks', 'playoff', 'champion', 'mvp'];

  console.log('=== Paginated Market Search ===');
  let cursor: string | undefined;
  let allMarkets: any[] = [];
  let pages = 0;

  try {
    do {
      const resp = await marketApi.getMarkets(1000, cursor);
      const data = resp.data as any;
      const markets = data?.markets || [];
      allMarkets.push(...markets);
      cursor = data?.cursor;
      pages++;
      if (!cursor || markets.length < 1000) break;
    } while (pages < 3);

    console.log(`Total markets fetched: ${allMarkets.length} across ${pages} pages\n`);

    // Find sports/basketball markets
    const sportsMarkets = allMarkets.filter((m: any) => {
      const text = `${m.title || ''} ${m.ticker || ''} ${m.event_ticker || ''} ${m.series_ticker || ''}`.toLowerCase();
      return sportTerms.some(t => text.includes(t)) ||
        text.includes('nba') || text.includes('basketball') || text.includes('wnba');
    });

    console.log(`Sports/NBA markets found: ${sportsMarkets.length}\n`);
    for (const m of sportsMarkets.slice(0, 30)) {
      console.log(`${m.ticker}`);
      console.log(`  ${m.title}`);
      console.log(`  event: ${m.event_ticker} | series: ${m.series_ticker}`);
      console.log(`  yes_bid: ${m.yes_bid}¢ | no_bid: ${m.no_bid}¢ | volume: ${m.volume} | status: ${m.status}`);
      console.log();
    }

    // Show unique categories
    const categories = [...new Set(allMarkets.map((m: any) => m.category).filter(Boolean))];
    console.log(`\nAll market categories: ${categories.join(', ')}`);

    // Show all unique series tickers that contain sport-related terms
    const allSeriesTickers = [...new Set(allMarkets.map((m: any) => m.series_ticker).filter(Boolean))];
    console.log(`\nTotal unique series tickers: ${allSeriesTickers.length}`);

    const sportsSeries = allSeriesTickers.filter((t: string) => {
      const lower = t.toLowerCase();
      return lower.includes('nba') || lower.includes('nfl') || lower.includes('mlb') ||
        lower.includes('nhl') || lower.includes('sport') || lower.includes('basket') ||
        lower.includes('football') || lower.includes('soccer') || lower.includes('hockey');
    });
    console.log(`Sports series tickers: ${sportsSeries.join(', ')}`);

  } catch (e: any) {
    console.log('Error:', e.response?.status, e.response?.data || e.message);
  }

  // Also try getting events filtered by seriesTicker patterns
  console.log('\n=== Events by known NBA series tickers ===');
  const knownTickers = ['KXNBA', 'NBA', 'PROBASKETBALL', 'NBACHAMP', 'NBAMVP', 'NBADRAFT'];
  for (const ticker of knownTickers) {
    try {
      const events = await eventsApi.getEvents(10, undefined, true, false, undefined, ticker);
      const eventList = (events.data as any)?.events || [];
      if (eventList.length > 0) {
        console.log(`\nSeries "${ticker}": ${eventList.length} events`);
        for (const ev of eventList.slice(0, 5)) {
          console.log(`  ${ev.event_ticker}: ${ev.title}`);
        }
      }
    } catch (e: any) {
      // Silently skip bad tickers
    }
  }
}

main().catch(console.error);
