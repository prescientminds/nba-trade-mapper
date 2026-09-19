/**
 * Verify migration 021 + importer landed correctly.
 *   - BPM/TS%/USG%/WS_48 populated
 *   - Stint-level granularity (mid-season traded players appear twice)
 */

import { supabase } from './lib/supabase-admin';

async function main() {
  // 1. Column coverage
  const { count: total } = await supabase
    .from('player_seasons')
    .select('*', { count: 'exact', head: true });

  const { count: withBpm } = await supabase
    .from('player_seasons')
    .select('*', { count: 'exact', head: true })
    .not('bpm', 'is', null);

  const { count: withTs } = await supabase
    .from('player_seasons')
    .select('*', { count: 'exact', head: true })
    .not('ts_percent', 'is', null);

  const { count: withUsg } = await supabase
    .from('player_seasons')
    .select('*', { count: 'exact', head: true })
    .not('usg_percent', 'is', null);

  console.log(`Total rows:         ${total}`);
  console.log(`  with BPM:         ${withBpm}`);
  console.log(`  with TS%:         ${withTs}`);
  console.log(`  with USG%:        ${withUsg}`);

  // 2. Stint-level granularity — Jimmy Butler traded to MIA mid-season 2021-22? No.
  //    Use a known mid-season trade: Harden to PHI in 2021-22.
  const { data: harden } = await supabase
    .from('player_seasons')
    .select('player_name, team_id, season, gp, mp, bpm, ts_percent, usg_percent, win_shares')
    .eq('player_name', 'James Harden')
    .eq('season', '2021-22')
    .order('team_id');

  console.log('\nHarden 2021-22 (should show two stints: BKN + PHI):');
  console.log(harden);

  // 3. Another stint check: Kawhi 2017-18 was SAS-only (injured), 2018-19 was TOR
  const { data: kawhi } = await supabase
    .from('player_seasons')
    .select('player_name, team_id, season, gp, mp, bpm, win_shares')
    .eq('player_name', 'Kawhi Leonard')
    .in('season', ['2017-18', '2018-19'])
    .order('season');

  console.log('\nKawhi 2017-18 & 2018-19:');
  console.log(kawhi);

  // 4. Rookie/young player sanity: Victor Wembanyama 2023-24 BPM
  const { data: wemby } = await supabase
    .from('player_seasons')
    .select('player_name, team_id, season, age, gp, mp, bpm, ts_percent, usg_percent, win_shares')
    .eq('player_name', 'Victor Wembanyama')
    .order('season');

  console.log('\nWembanyama (young-player cohort test):');
  console.log(wemby);
}

main().catch(console.error);
