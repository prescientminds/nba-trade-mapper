/**
 * NBA Salary Data Audit Script
 * READ-ONLY — does NOT write to the database.
 *
 * Usage: npx tsx scripts/audit-salary-data.ts
 */

import { supabase } from './lib/supabase-admin';

// ── Helpers ──────────────────────────────────────────────────────────

function fmt$(amount: number | null | undefined): string {
  if (amount == null) return 'NULL';
  return '$' + amount.toLocaleString('en-US');
}

function header(title: string) {
  console.log('\n' + '='.repeat(80));
  console.log(`  ${title}`);
  console.log('='.repeat(80));
}

function subheader(title: string) {
  console.log(`\n--- ${title} ---`);
}

/** Paginated fetch — Supabase caps at 1000 rows per request */
async function fetchAll(table: string, select = '*', orderBy = 'season'): Promise<any[]> {
  const PAGE = 1000;
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order(orderBy)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`fetchAll ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ── CHECK 1: Overall data shape ─────────────────────────────────────

async function check1_dataShape() {
  header('CHECK 1: Overall Data Shape');

  // Total rows
  const contracts = await fetchAll('player_contracts', 'player_name,team_id,season,salary,contract_type');
  console.log(`Total rows in player_contracts: ${contracts.length}`);

  // salary_cap_history
  const caps = await fetchAll('salary_cap_history', '*', 'season');
  console.log(`Total rows in salary_cap_history: ${caps.length}`);

  if (contracts.length === 0) {
    console.log('\n⚠️  player_contracts is EMPTY — no further analysis possible for this table.');
    return { contracts, caps };
  }

  // Min/max seasons
  const seasons = contracts.map((r: any) => r.season).filter(Boolean);
  seasons.sort();
  console.log(`Min season: ${seasons[0]}`);
  console.log(`Max season: ${seasons[seasons.length - 1]}`);

  // Unique players
  const uniquePlayers = new Set(contracts.map((r: any) => r.player_name));
  console.log(`Unique players: ${uniquePlayers.size}`);

  // Unique teams
  const uniqueTeams = new Set(contracts.map((r: any) => r.team_id));
  console.log(`Unique teams: ${uniqueTeams.size}`);

  // Distribution per season
  subheader('Records per Season');
  const perSeason: Record<string, number> = {};
  for (const r of contracts) {
    perSeason[r.season] = (perSeason[r.season] || 0) + 1;
  }
  const sortedSeasons = Object.keys(perSeason).sort();
  for (const s of sortedSeasons) {
    console.log(`  ${s}: ${perSeason[s]} records`);
  }

  return { contracts, caps };
}

// ── CHECK 2: Well-known salaries ────────────────────────────────────

async function check2_knownSalaries() {
  header('CHECK 2: Well-Known Player Salaries');

  const players = [
    { name: 'LeBron James', note: 'should have salaries from 2003-04 onwards, recently ~$47-48M' },
    { name: 'Stephen Curry', note: 'should have big contract ~$50M+ recent years' },
    { name: 'Kevin Durant', note: 'should show multiple teams: OKC, GSW, BKN, PHX' },
    { name: 'James Harden', note: 'multiple teams: OKC, HOU, BKN, PHI, LAC' },
    { name: 'Kobe Bryant', note: 'LAL, career ended 2015-16, had $25M+ contracts' },
    { name: 'Michael Jordan', note: 'CHI, WAS, famously made $33M in 1997-98' },
    { name: "Shaquille O'Neal", note: 'multiple teams, big contracts' },
    { name: 'Tim Duncan', note: 'SAS, career 1997-2016' },
  ];

  for (const p of players) {
    subheader(`${p.name} (${p.note})`);

    const { data, error } = await supabase
      .from('player_contracts')
      .select('*')
      .eq('player_name', p.name)
      .order('season');

    if (error) {
      console.log(`  ERROR: ${error.message}`);
      continue;
    }
    if (!data || data.length === 0) {
      console.log(`  NO RECORDS FOUND`);

      // Try a fuzzy search in case of name mismatch
      const { data: fuzzy } = await supabase
        .from('player_contracts')
        .select('player_name,season')
        .ilike('player_name', `%${p.name.split(' ').pop()}%`)
        .limit(5);
      if (fuzzy && fuzzy.length > 0) {
        console.log(`  Fuzzy matches: ${fuzzy.map((r: any) => r.player_name).join(', ')}`);
      }
      continue;
    }

    for (const row of data) {
      console.log(
        `  ${row.season}  ${(row.team_id || '???').padEnd(4)} ${fmt$(row.salary).padStart(14)}  ${row.contract_type || ''}`
      );
    }
    console.log(`  → Total records: ${data.length}`);
  }
}

// ── CHECK 3: Salary cap history ─────────────────────────────────────

async function check3_capHistory() {
  header('CHECK 3: Salary Cap History');

  const { data, error } = await supabase
    .from('salary_cap_history')
    .select('*')
    .order('season');

  if (error) {
    console.log(`ERROR: ${error.message}`);
    return;
  }
  if (!data || data.length === 0) {
    console.log('salary_cap_history is EMPTY.');
    return;
  }

  console.log(`Total rows: ${data.length}\n`);
  console.log(
    'Season'.padEnd(10) +
    'Cap'.padStart(14) +
    'Luxury Tax'.padStart(14) +
    '1st Apron'.padStart(14) +
    '2nd Apron'.padStart(14) +
    'MLE'.padStart(14) +
    'Min Salary'.padStart(14)
  );
  console.log('-'.repeat(94));

  for (const row of data) {
    console.log(
      (row.season || '').padEnd(10) +
      fmt$(row.salary_cap).padStart(14) +
      fmt$(row.luxury_tax).padStart(14) +
      fmt$(row.first_apron).padStart(14) +
      fmt$(row.second_apron).padStart(14) +
      fmt$(row.mle).padStart(14) +
      fmt$(row.minimum_salary).padStart(14)
    );
  }

  // Specific verifications
  subheader('Key Verifications');
  const check = (season: string, expectedCap: number, label: string) => {
    const row = data.find((r: any) => r.season === season);
    if (!row) {
      console.log(`  ${season}: NOT FOUND (expected ~${fmt$(expectedCap)})`);
    } else {
      const diff = Math.abs(row.salary_cap - expectedCap);
      const pct = (diff / expectedCap * 100).toFixed(1);
      const ok = diff < 2_000_000; // within $2M tolerance
      console.log(
        `  ${season}: ${fmt$(row.salary_cap)} (expected ~${fmt$(expectedCap)}) — ${ok ? 'OK' : 'MISMATCH'} (${pct}% off) ${label}`
      );
    }
  };

  check('2023-24', 136_000_000, '');
  check('2024-25', 140_588_000, '');
  check('2011-12', 58_044_000, 'lockout-shortened season');
  check('1984-85', 3_600_000, 'first salary cap');
}

// ── CHECK 4: Edge cases and gaps ────────────────────────────────────

async function check4_edgeCases(contracts: any[]) {
  header('CHECK 4: Edge Cases and Data Gaps');

  if (contracts.length === 0) {
    console.log('player_contracts is EMPTY — skipping edge case checks.');
    return;
  }

  // Seasons with zero records
  const perSeason: Record<string, number> = {};
  for (const r of contracts) {
    perSeason[r.season] = (perSeason[r.season] || 0) + 1;
  }
  const allSeasons = Object.keys(perSeason).sort();
  const minYear = parseInt(allSeasons[0].split('-')[0]);
  const maxYear = parseInt(allSeasons[allSeasons.length - 1].split('-')[0]);

  const missingSeasons: string[] = [];
  for (let y = minYear; y <= maxYear; y++) {
    const s2 = String((y + 1) % 100).padStart(2, '0');
    const season = `${y}-${s2}`;
    if (!perSeason[season]) {
      missingSeasons.push(season);
    }
  }

  subheader('Missing Seasons (gaps in coverage)');
  if (missingSeasons.length === 0) {
    console.log('  No gaps — all seasons between min and max have records.');
  } else {
    console.log(`  ${missingSeasons.length} missing season(s): ${missingSeasons.join(', ')}`);
  }

  // Suspiciously few records
  subheader('Seasons with < 50 Records');
  const thinSeasons = allSeasons.filter(s => perSeason[s] < 50);
  if (thinSeasons.length === 0) {
    console.log('  None — all seasons have >= 50 records.');
  } else {
    for (const s of thinSeasons) {
      console.log(`  ${s}: ${perSeason[s]} records`);
    }
  }

  // Absurdly high salaries (> $80M)
  subheader('Salaries > $80M (single season)');
  const highSalary = contracts.filter((r: any) => r.salary && r.salary > 80_000_000);
  if (highSalary.length === 0) {
    console.log('  None found.');
  } else {
    for (const r of highSalary) {
      console.log(`  ${r.player_name} (${r.team_id}) ${r.season}: ${fmt$(r.salary)}`);
    }
  }

  // Suspiciously low salaries (< $100K)
  subheader('Salaries < $100,000');
  const lowSalary = contracts.filter((r: any) => r.salary != null && r.salary > 0 && r.salary < 100_000);
  if (lowSalary.length === 0) {
    console.log('  None found.');
  } else {
    console.log(`  ${lowSalary.length} records with salary < $100K`);
    for (const r of lowSalary.slice(0, 20)) {
      console.log(`    ${r.player_name} (${r.team_id}) ${r.season}: ${fmt$(r.salary)}`);
    }
    if (lowSalary.length > 20) console.log(`    ... and ${lowSalary.length - 20} more`);
  }

  // NULL salary values
  subheader('NULL Salary Values');
  const nullSalary = contracts.filter((r: any) => r.salary == null);
  console.log(`  ${nullSalary.length} records with NULL salary`);
  if (nullSalary.length > 0 && nullSalary.length <= 20) {
    for (const r of nullSalary) {
      console.log(`    ${r.player_name} (${r.team_id}) ${r.season}`);
    }
  } else if (nullSalary.length > 20) {
    for (const r of nullSalary.slice(0, 10)) {
      console.log(`    ${r.player_name} (${r.team_id}) ${r.season}`);
    }
    console.log(`    ... and ${nullSalary.length - 10} more`);
  }

  // Duplicate (player_name, team_id, season)
  subheader('Duplicate (player_name, team_id, season) Combinations');
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const r of contracts) {
    const key = `${r.player_name}|${r.team_id}|${r.season}`;
    if (seen.has(key)) {
      dupes.push(key);
    }
    seen.add(key);
  }
  if (dupes.length === 0) {
    console.log('  No duplicates found (UNIQUE constraint enforced).');
  } else {
    console.log(`  ${dupes.length} duplicates found!`);
    for (const d of dupes.slice(0, 10)) {
      console.log(`    ${d}`);
    }
  }

  // Players from trades with no salary data
  subheader('Trade Players Missing Salary Data');
  // Get distinct player names from transaction_assets
  const PAGE = 1000;
  let tradePlayers: string[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('transaction_assets')
      .select('player_name')
      .not('player_name', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) {
      console.log(`  ERROR querying transaction_assets: ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;
    tradePlayers = tradePlayers.concat(data.map((r: any) => r.player_name));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  const uniqueTradePlayers = [...new Set(tradePlayers.filter(Boolean))];
  console.log(`  Total unique traded players (in transaction_assets): ${uniqueTradePlayers.length}`);

  const salaryPlayerNames = new Set(contracts.map((r: any) => r.player_name));
  const missing = uniqueTradePlayers.filter(p => !salaryPlayerNames.has(p));
  console.log(`  Players with salary data: ${salaryPlayerNames.size}`);
  console.log(`  Traded players WITHOUT salary data: ${missing.length}`);
  if (missing.length > 0) {
    console.log(`  Sample missing (first 30): ${missing.slice(0, 30).join(', ')}`);
  }
}

// ── CHECK 5: Cross-reference with trade data ────────────────────────

async function check5_tradeCrossRef() {
  header('CHECK 5: Cross-Reference with Famous Trades');

  const trades = [
    {
      name: 'Harden Trade (2012): OKC → HOU',
      season: '2012-13',
      players: [
        { name: 'James Harden', expectedTeam: 'HOU' },
        { name: 'Kevin Martin', expectedTeam: 'OKC' },
      ],
    },
    {
      name: 'KG/Pierce Trade (2013): BOS → BKN',
      season: '2013-14',
      players: [
        { name: 'Kevin Garnett', expectedTeam: 'BKN' },
        { name: 'Paul Pierce', expectedTeam: 'BKN' },
      ],
    },
    {
      name: 'Kawhi Leonard Trade (2018): SAS → TOR',
      season: '2018-19',
      players: [
        { name: 'Kawhi Leonard', expectedTeam: 'TOR' },
        { name: 'DeMar DeRozan', expectedTeam: 'SAS' },
      ],
    },
    {
      name: 'Anthony Davis Trade (2019): NOP → LAL',
      season: '2019-20',
      players: [
        { name: 'Anthony Davis', expectedTeam: 'LAL' },
        { name: 'Brandon Ingram', expectedTeam: 'NOP' },
        { name: 'Lonzo Ball', expectedTeam: 'NOP' },
      ],
    },
    {
      name: 'KAT Trade (2024): MIN → NYK',
      season: '2024-25',
      players: [
        { name: 'Karl-Anthony Towns', expectedTeam: 'NYK' },
        { name: 'Julius Randle', expectedTeam: 'MIN' },
        { name: 'Donte DiVincenzo', expectedTeam: 'MIN' },
      ],
    },
  ];

  for (const trade of trades) {
    subheader(trade.name);
    for (const p of trade.players) {
      // Check if player has salary record in the trade season
      const { data, error } = await supabase
        .from('player_contracts')
        .select('player_name,team_id,season,salary')
        .eq('player_name', p.name)
        .eq('season', trade.season);

      if (error) {
        console.log(`  ${p.name}: ERROR — ${error.message}`);
        continue;
      }

      if (!data || data.length === 0) {
        console.log(`  ${p.name} (${trade.season}): NO SALARY RECORD`);
      } else {
        for (const row of data) {
          const teamMatch = row.team_id === p.expectedTeam ? 'MATCH' : `TEAM MISMATCH (expected ${p.expectedTeam})`;
          console.log(`  ${p.name} (${trade.season}): ${row.team_id} ${fmt$(row.salary)} — ${teamMatch}`);
        }
      }
    }
  }
}

// ── CHECK 6: Current contracts (2025-26) ────────────────────────────

async function check6_currentContracts() {
  header('CHECK 6: Current Contracts (2025-26)');

  const { data: current, error } = await supabase
    .from('player_contracts')
    .select('*')
    .eq('season', '2025-26')
    .order('salary', { ascending: false });

  if (error) {
    console.log(`ERROR: ${error.message}`);
    return;
  }

  if (!current || current.length === 0) {
    console.log('No salary records for 2025-26.');

    // Try 2024-25
    const { data: prev } = await supabase
      .from('player_contracts')
      .select('*')
      .eq('season', '2024-25')
      .order('salary', { ascending: false })
      .limit(10);

    if (prev && prev.length > 0) {
      console.log('\nFallback: Top 10 for 2024-25:');
      for (let i = 0; i < prev.length; i++) {
        console.log(`  ${(i + 1).toString().padStart(2)}. ${prev[i].player_name.padEnd(25)} ${(prev[i].team_id || '???').padEnd(4)} ${fmt$(prev[i].salary)}`);
      }
    }
    return;
  }

  console.log(`Total players with 2025-26 salary data: ${current.length}\n`);

  subheader('Top 10 Highest-Paid Players (2025-26)');
  for (let i = 0; i < Math.min(10, current.length); i++) {
    const r = current[i];
    console.log(`  ${(i + 1).toString().padStart(2)}. ${r.player_name.padEnd(25)} ${(r.team_id || '???').padEnd(4)} ${fmt$(r.salary)}`);
  }

  // Check expected top players
  subheader('Expected Top Players Verification');
  const expectedTop = ['Stephen Curry', 'Damian Lillard', 'Joel Embiid', 'Nikola Jokic', 'Kevin Durant'];
  for (const name of expectedTop) {
    const found = current.find((r: any) => r.player_name === name);
    if (found) {
      console.log(`  ${name.padEnd(25)} ${(found.team_id || '???').padEnd(4)} ${fmt$(found.salary)} — FOUND`);
    } else {
      console.log(`  ${name.padEnd(25)} — NOT IN 2025-26 DATA`);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('NBA SALARY DATA AUDIT');
  console.log(`Run at: ${new Date().toISOString()}`);
  console.log('READ-ONLY — no writes to database.\n');

  const { contracts, caps } = await check1_dataShape();
  await check2_knownSalaries();
  await check3_capHistory();
  await check4_edgeCases(contracts);
  await check5_tradeCrossRef();
  await check6_currentContracts();

  header('AUDIT COMPLETE');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
