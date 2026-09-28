/**
 * Staleness alarm for the weekly refresh.
 *
 * A scraper can "succeed" while returning nothing (a changed page, a stale
 * cache, a missed day), so a green run is not proof the data is current.
 * These checks look at the data itself and exit 1 when something is behind,
 * which fails the GitHub job and emails the repo owner.
 *
 * Usage: npx tsx scripts/check-freshness.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';
import { CURRENT_SEASON } from '../src/lib/trade-builder';

const ROOT = path.join(__dirname, '..');
// The NBA logs signings/waivers every week of the year, offseason included.
const NBA_TRANSACTION_MAX_AGE_DAYS = 14;
const MIN_NBA_CONTRACTS = 400;

const failures: string[] = [];
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const fail = (msg: string) => { failures.push(msg); console.log(`  ✗ ${msg}`); };

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

async function main() {
  console.log('Freshness checks');

  // 1. NBA transactions keep moving.
  const txPath = path.join(ROOT, 'public', 'data', 'transactions', 'by-season', `${CURRENT_SEASON}.json`);
  const txs: { date: string }[] = fs.existsSync(txPath) ? JSON.parse(fs.readFileSync(txPath, 'utf-8')) : [];
  const newestTx = txs.reduce((m, t) => (t.date > m ? t.date : m), '');
  if (!newestTx) fail(`NBA ${CURRENT_SEASON} transactions file missing or empty`);
  else if (daysSince(newestTx) > NBA_TRANSACTION_MAX_AGE_DAYS) fail(`NBA newest transaction is ${newestTx} (${daysSince(newestTx)} days old)`);
  else ok(`NBA newest transaction ${newestTx}`);

  // 2. NBA contracts page parsed into a full league.
  const { count: contracts } = await supabase
    .from('player_contracts')
    .select('*', { count: 'exact', head: true })
    .eq('season', CURRENT_SEASON);
  if ((contracts ?? 0) < MIN_NBA_CONTRACTS) fail(`NBA ${CURRENT_SEASON} contracts: ${contracts ?? 0} (< ${MIN_NBA_CONTRACTS})`);
  else ok(`NBA ${CURRENT_SEASON} contracts: ${contracts}`);

  // 3. WNBA standings advance during the regular season (June–September).
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  if (month >= 6 && month <= 9) {
    const year = String(now.getUTCFullYear());
    const { data } = await supabase
      .from('team_seasons')
      .select('team_id,wins,losses')
      .eq('league', 'WNBA')
      .eq('season', year);
    const played = (data ?? []).filter((t) => (t.wins ?? 0) + (t.losses ?? 0) >= 5).length;
    const total = (data ?? []).length;
    if (total === 0 || played < total) fail(`WNBA ${year}: ${played}/${total} teams have 5+ games recorded`);
    else ok(`WNBA ${year}: all ${total} teams have games recorded`);
  } else {
    ok('WNBA offseason — standings check skipped');
  }

  if (failures.length) {
    console.log(`\n${failures.length} freshness check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll freshness checks passed.');
}

main().catch((e) => { console.error(e); process.exit(1); });
