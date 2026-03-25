/**
 * Get KXNBA events + inspect market object structure.
 * Run: npx tsx scripts/test-kalshi-final.ts
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

  // 1. Inspect a raw market object to see actual field names
  console.log('=== Raw Market Object (first one) ===');
  try {
    const resp = await marketApi.getMarkets(1);
    const market = (resp.data as any)?.markets?.[0];
    if (market) {
      console.log('Keys:', Object.keys(market).join(', '));
      console.log(JSON.stringify(market, null, 2));
    }
  } catch (e: any) {
    console.log('Error:', e.response?.status, e.response?.data || e.message);
  }

  // 2. Get KXNBA events with nested markets
  console.log('\n=== KXNBA Championship Events ===');
  try {
    const events = await eventsApi.getEvents(50, undefined, true, false, undefined, 'KXNBA');
    const eventList = (events.data as any)?.events || [];
    console.log(`Found ${eventList.length} KXNBA events\n`);

    for (const ev of eventList) {
      console.log(`EVENT: ${ev.event_ticker} — ${ev.title}`);
      console.log(`  status: ${ev.status} | series: ${ev.series_ticker} | category: ${ev.category}`);
      console.log(`  Keys: ${Object.keys(ev).join(', ')}`);
      const markets = ev.markets || [];
      console.log(`  Markets: ${markets.length}`);
      for (const m of markets.slice(0, 10)) {
        console.log(`    ${m.ticker}: ${m.title} — yes: ${m.yes_bid}¢ / no: ${m.no_bid}¢ | vol: ${m.volume} | status: ${m.status}`);
      }
      if (markets.length > 10) console.log(`    ... and ${markets.length - 10} more`);
      console.log();
    }
  } catch (e: any) {
    console.log('Error:', e.response?.status, e.response?.data || e.message);
  }

  // 3. Try other NBA-related series
  const nbaSeries = [
    'KXNBA', 'KXNBAMVP', 'KXNBADRAFT', 'KXNBAPLAYOFF', 'KXNBAWINS',
    'KXNBATEAM', 'KXNBASEATTLE', 'KXSPORTSOWNERLBJ', 'KXCITYNBAEXPAND',
    'KXNBADIV', 'KXNBACONF', 'KXNBAFINALIST', 'KXNBAPPG',
    'KXPROBASKETBALL', 'KXNBAAWDS', 'KXNBAROTY', 'KXNBADPOY',
    'KXNBA6MOY', 'KXNBAMIP', 'KXNBACOY', 'KXNBAREG',
    // Game-level
    'KXNBAGAME', 'KXNBASPREAD', 'KXNBAOU',
    // Player props
    'KXNBAPTS', 'KXNBAAST', 'KXNBAREB', 'KXNBA3PT',
  ];

  console.log('=== Checking NBA Series Tickers ===');
  for (const ticker of nbaSeries) {
    try {
      const events = await eventsApi.getEvents(5, undefined, true, false, undefined, ticker);
      const eventList = (events.data as any)?.events || [];
      if (eventList.length > 0) {
        console.log(`\n${ticker}: ${eventList.length} events`);
        for (const ev of eventList.slice(0, 3)) {
          const mCount = ev.markets?.length || 0;
          console.log(`  ${ev.event_ticker}: ${ev.title} (${mCount} markets, status: ${ev.status})`);
        }
      }
    } catch (e: any) {
      // Skip
    }
  }

  // 4. Try searching all events with "basketball" in title (broader)
  console.log('\n\n=== All Events with NBA-related content (paginated) ===');
  try {
    let cursor: string | undefined;
    let found: any[] = [];
    let pages = 0;

    do {
      const events = await eventsApi.getEvents(200, cursor, false, false);
      const data = events.data as any;
      const eventList = data?.events || [];
      pages++;

      for (const ev of eventList) {
        const text = `${ev.title} ${ev.event_ticker} ${ev.series_ticker}`.toLowerCase();
        if (text.includes('basketball') || text.includes('nba') ||
            text.includes('laker') || text.includes('celtic') ||
            text.includes('knick') || text.includes('warrior') ||
            text.includes('nugget') || text.includes('lebron') ||
            text.includes('curry') || text.includes('mvp') ||
            text.includes('draft') || text.includes('dunk')) {
          found.push(ev);
        }
      }

      cursor = data?.cursor;
      if (!cursor || eventList.length < 200) break;
    } while (pages < 10);

    console.log(`Scanned ${pages * 200} events, found ${found.length} NBA-related:\n`);
    for (const ev of found) {
      console.log(`  ${ev.event_ticker}: ${ev.title} (series: ${ev.series_ticker}, status: ${ev.status})`);
    }
  } catch (e: any) {
    console.log('Error:', e.response?.status, e.response?.data || e.message);
  }
}

main().catch(console.error);
