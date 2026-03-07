/**
 * Score every NBA trade by salary/contract value exchanged.
 *
 * For each trade, calculates:
 *   - Total future contract value received by each team
 *   - Per-player salary at trade time and remaining contract value
 *   - Salary as % of cap (normalized across eras)
 *
 * Reads:   public/data/trades/by-season/*.json
 * Queries: player_contracts, salary_cap_history
 * Updates: trade_scores (total_salary_exchanged, salary_winner, salary_details)
 *
 * PREREQUISITE: Run migration 011-trade-salary-scores.sql
 *               Run scrape-salaries.ts and scrape-cap-history.ts first
 *
 * Usage:
 *   npx tsx scripts/score-trade-salaries.ts                    # Score all trades
 *   npx tsx scripts/score-trade-salaries.ts --dry-run          # Print results, no DB writes
 *   npx tsx scripts/score-trade-salaries.ts --season 2020-21   # Single season only
 *   npx tsx scripts/score-trade-salaries.ts --top 20           # Print 20 biggest trades by $
 */

import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';

// ── Constants ─────────────────────────────────────────────────────────
const TRADES_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');

// ── Types ─────────────────────────────────────────────────────────────

interface TradeAsset {
  type: 'player' | 'pick' | 'swap' | 'cash';
  player_name: string | null;
  from_team_id: string;
  to_team_id: string;
  pick_year: number | null;
  pick_round: number | null;
  became_player_name: string | null;
}

interface Trade {
  id: string;
  date: string;
  season: string;
  title: string;
  assets: TradeAsset[];
}

interface ContractRow {
  player_name: string;
  team_id: string;
  season: string;
  salary: number;
}

interface CapRow {
  season: string;
  salary_cap: number;
}

interface PlayerSalaryDetail {
  name: string;
  salary_at_trade: number;        // Salary in the trade season
  future_salary: number;          // Sum of remaining contract (may include fallback to other teams)
  seasons_remaining: number;
  cap_pct: number;                // salary_at_trade / cap at trade time
  acquired_value: number;         // Total salary at the acquiring team only (from trade season through departure)
  acquired_seasons: number;       // Number of seasons at the acquiring team
}

interface TeamSalaryScore {
  total: number;                  // Total future salary received (may include fallback)
  total_acquired: number;         // Total salary at the acquiring team only (sum of acquired_value)
  cap_pct: number;                // Total as multiple of salary cap
  players: PlayerSalaryDetail[];
  got_under_cap?: boolean;        // True if team went from over cap to under cap via this trade
}

interface TradeSalaryScore {
  trade_id: string;
  total_salary_exchanged: number;
  salary_winner: string | null;
  salary_details: Record<string, TeamSalaryScore>;
}

// ── Name normalization ───────────────────────────────────────────────

function stripDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Aliases mapping trade-JSON player names → player_contracts canonical names.
 * Keys are lowercase; values are the exact name in player_contracts.
 */
const SALARY_NAME_ALIASES: Record<string, string> = {
  // Nicknames / alternate names
  'maurice williams': 'Mo Williams',
  'anfernee hardaway': 'Anfernee Hardaway',
  'penny hardaway': 'Anfernee Hardaway',
  'predrag stojakovic': 'Peja Stojakovic',
  'ron artest': 'Metta World Peace',
  'metta world peace': 'Metta World Peace',
  'amare stoudemire': "Amar'e Stoudemire",
  "amar'e stoudemire": "Amar'e Stoudemire",
  'hidayet turkoglu': 'Hedo Turkoglu',
  'matthew dellavedova': 'Matthew Dellavedova',
  'matt dellavedova': 'Matthew Dellavedova',
  'domas sabonis': 'Domantas Sabonis',
  'louis williams': 'Lou Williams',
  'ishmael smith': 'Ish Smith',
  'louis amundson': 'Lou Amundson',
  'moe harkless': 'Maurice Harkless',
  'sviatoslav mykhailiuk': 'Svi Mykhailiuk',
  'moe wagner': 'Moritz Wagner',
  'patrick mills': 'Patty Mills',
  'ogugua anunoby': 'OG Anunoby',
  'o.g. anunoby': 'OG Anunoby',
  'mohamed bamba': 'Mo Bamba',
  'osasere ighodaro': 'Oso Ighodaro',
  'k.j. martin': 'Kenyon Martin Jr.',
  'kj martin': 'Kenyon Martin Jr.',

  // Jr./Sr. suffix mismatches
  'tim hardaway sr.': 'Tim Hardaway',
  'tim hardaway sr': 'Tim Hardaway',
  'mike dunleavy jr.': 'Mike Dunleavy',
  'mike dunleavy jr': 'Mike Dunleavy',
  'glen rice sr.': 'Glen Rice',
  'glen rice sr': 'Glen Rice',
  'marvin bagley': 'Marvin Bagley III',
  'r.j. barrett': 'RJ Barrett',
  'rj barrett': 'RJ Barrett',
  'walter clayton jr.': 'Walter Clayton',
  'walter clayton jr': 'Walter Clayton',
  'andre jackson': 'Andre Jackson Jr.',

  // Disambiguators from trade data
  'clifford robinson (r.)': 'Clifford Robinson',
};

/** Strings in trade JSON that aren't real player names */
const NOT_PLAYER_NAMES = new Set([
  'trade exception', 'did not convey', 'cash considerations',
  'cash', 'tpe', 'player option', 'team option',
]);

/**
 * Normalize a player name from trade JSON to match player_contracts.
 * Returns null if the string is not a real player name.
 */
function normalizePlayerName(name: string): string | null {
  if (!name) return null;

  // Strip diacritics first
  let cleaned = stripDiacritics(name).trim();

  // Remove disambiguators like (R.), (a), (b)
  cleaned = cleaned.replace(/\s*\([^)]*\)\s*$/, '').trim();

  // Check if it's a known non-player string
  const lower = cleaned.toLowerCase();
  if (NOT_PLAYER_NAMES.has(lower)) return null;
  if (lower.includes('trade exception')) return null;
  if (lower.includes('did not convey')) return null;
  if (lower.includes('protected')) return null;
  if (lower.includes('becomes $')) return null;
  if (lower.includes('picks)')) return null;

  // Check alias map
  const alias = SALARY_NAME_ALIASES[lower];
  if (alias) return alias;

  // Try without suffix for alias lookup
  const withoutSuffix = lower.replace(/\s+(jr\.?|sr\.?|iii|ii|iv|v)$/i, '').trim();
  if (withoutSuffix !== lower) {
    const suffixAlias = SALARY_NAME_ALIASES[withoutSuffix];
    if (suffixAlias) return suffixAlias;
  }

  return cleaned;
}

// ── Helpers ───────────────────────────────────────────────────────────

function fmt$(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compare two season strings (e.g., "2020-21" >= "2019-20").
 * Works via simple string comparison since format is consistent.
 */
function seasonGte(a: string, b: string): boolean {
  return a >= b;
}

/** Next season string: "2020-21" → "2021-22" */
function nextSeason(season: string): string {
  const start = parseInt(season.split('-')[0]) + 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

/** Convert pick year to season: 2020 → "2020-21" */
function pickYearToSeason(year: number): string {
  return `${year}-${String(year + 1).slice(2)}`;
}

// ── Bulk data loaders ─────────────────────────────────────────────────

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
    if (!data || data.length === 0) break;

    rows.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return rows;
}

// ── Scoring logic ─────────────────────────────────────────────────────

function scoreTradeSalary(
  trade: Trade,
  contractsByPlayerTeam: Map<string, ContractRow[]>,
  contractsByPlayer: Map<string, ContractRow[]>,
  capBySeason: Map<string, number>,
  teamPayrolls: Map<string, number>,      // teamId|season → total team payroll
): TradeSalaryScore {
  const tradeSeason = trade.season;
  const capAtTrade = capBySeason.get(tradeSeason) || 0;

  // Group assets by receiving team
  const byTeam = new Map<string, TradeAsset[]>();
  for (const asset of trade.assets) {
    if (!asset.to_team_id) continue;
    if (!byTeam.has(asset.to_team_id)) byTeam.set(asset.to_team_id, []);
    byTeam.get(asset.to_team_id)!.push(asset);
  }

  // Also track what each team sends out (for under-cap calculation)
  const outgoingByTeam = new Map<string, TradeAsset[]>();
  for (const asset of trade.assets) {
    if (!asset.from_team_id) continue;
    if (!outgoingByTeam.has(asset.from_team_id)) outgoingByTeam.set(asset.from_team_id, []);
    outgoingByTeam.get(asset.from_team_id)!.push(asset);
  }

  const salaryDetails: Record<string, TeamSalaryScore> = {};
  let totalExchanged = 0;

  for (const [teamId, assets] of byTeam) {
    const players: PlayerSalaryDetail[] = [];
    let teamTotal = 0;
    let teamTotalAcquired = 0;

    for (const asset of assets) {
      let rawName: string | null = null;
      let seasonCutoff = tradeSeason;

      if (asset.type === 'player' && asset.player_name) {
        rawName = asset.player_name;
      } else if (asset.type === 'pick' && asset.became_player_name) {
        rawName = asset.became_player_name;
        seasonCutoff = asset.pick_year ? pickYearToSeason(asset.pick_year) : tradeSeason;
      }

      if (!rawName) continue;

      // Normalize the player name (handles aliases, diacritics, suffixes, garbage)
      const playerName = normalizePlayerName(rawName);
      if (!playerName) continue;

      // ── Acquired value: contracts specifically on the receiving team ──
      const keyExact = `${playerName}|${teamId}`;
      const acquiringTeamContracts = (contractsByPlayerTeam.get(keyExact) || [])
        .filter(c => seasonGte(c.season, seasonCutoff));
      const acquiredValue = acquiringTeamContracts.reduce((sum, c) => sum + c.salary, 0);
      const acquiredSeasons = acquiringTeamContracts.length;

      // ── Future salary: broader search (fallback to any team for coverage) ──
      let contracts = acquiringTeamContracts;

      // Strategy 2: If no contracts on receiving team, look for ANY contracts
      if (contracts.length === 0) {
        contracts = (contractsByPlayer.get(playerName) || [])
          .filter(c => seasonGte(c.season, seasonCutoff));
      }

      // Strategy 3: Try with Jr./III suffix added/removed
      if (contracts.length === 0) {
        const suffixVariants = [
          playerName + ' Jr.',
          playerName + ' III',
          playerName + ' Sr.',
          playerName.replace(/\s+(Jr\.|III|Sr\.)$/i, '').trim(),
        ];
        for (const variant of suffixVariants) {
          contracts = (contractsByPlayer.get(variant) || [])
            .filter(c => seasonGte(c.season, seasonCutoff));
          if (contracts.length > 0) break;
        }
      }

      if (contracts.length === 0) continue;

      // Salary at trade time = salary in the trade season (or closest future season)
      const tradeSeasonContract = contracts.find(c => c.season === tradeSeason)
        || contracts.find(c => c.season === seasonCutoff)
        || contracts[0];
      const salaryAtTrade = tradeSeasonContract?.salary || 0;

      // Future salary = sum of all remaining contract value (broader — includes fallback)
      const futureSalary = contracts.reduce((sum, c) => sum + c.salary, 0);
      const seasonsRemaining = contracts.length;

      const capPct = capAtTrade > 0 ? r2(salaryAtTrade / capAtTrade) : 0;

      players.push({
        name: playerName,
        salary_at_trade: salaryAtTrade,
        future_salary: futureSalary,
        seasons_remaining: seasonsRemaining,
        cap_pct: capPct,
        acquired_value: acquiredValue,
        acquired_seasons: acquiredSeasons,
      });

      teamTotal += futureSalary;
      teamTotalAcquired += acquiredValue;
    }

    // Sort players by acquired value descending (primary), future salary as tiebreak
    players.sort((a, b) => b.acquired_value - a.acquired_value || b.future_salary - a.future_salary);

    // ── Under-cap detection ──
    // Check if the team went from over-cap to under-cap via this trade.
    // We need the team's outgoing salary and incoming salary for the trade season.
    let gotUnderCap: boolean | undefined;
    if (capAtTrade > 0) {
      const teamPayroll = teamPayrolls.get(`${teamId}|${tradeSeason}`);
      if (teamPayroll != null && teamPayroll >= capAtTrade) {
        // Team was at or over the cap. Calculate net salary change from this trade.
        const outgoing = outgoingByTeam.get(teamId) || [];
        let outgoingSalary = 0;
        for (const a of outgoing) {
          if (a.type !== 'player' || !a.player_name) continue;
          const name = normalizePlayerName(a.player_name);
          if (!name) continue;
          const key = `${name}|${teamId}`;
          const c = (contractsByPlayerTeam.get(key) || []).find(c => c.season === tradeSeason);
          if (c) outgoingSalary += c.salary;
        }

        let incomingSalary = 0;
        for (const p of players) {
          incomingSalary += p.salary_at_trade;
        }

        const postTradePayroll = teamPayroll - outgoingSalary + incomingSalary;
        if (postTradePayroll < capAtTrade) {
          gotUnderCap = true;
        }
      }
    }

    salaryDetails[teamId] = {
      total: teamTotal,
      total_acquired: teamTotalAcquired,
      cap_pct: capAtTrade > 0 ? r2(teamTotal / capAtTrade) : 0,
      players,
      ...(gotUnderCap ? { got_under_cap: true } : {}),
    };

    totalExchanged += teamTotal;
  }

  // Determine salary winner (team that received more acquired value)
  const entries = Object.entries(salaryDetails).sort((a, b) => b[1].total_acquired - a[1].total_acquired);
  let salaryWinner: string | null = null;
  if (entries.length >= 2 && entries[0][1].total_acquired > entries[1][1].total_acquired * 1.1) {
    // 10% threshold to declare a salary winner
    salaryWinner = entries[0][0];
  }

  return {
    trade_id: trade.id,
    total_salary_exchanged: totalExchanged,
    salary_winner: salaryWinner,
    salary_details: salaryDetails,
  };
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const topArg = args.find(a => a.startsWith('--top'));
  const topN = topArg ? parseInt(topArg.includes('=') ? topArg.split('=')[1] : args[args.indexOf(topArg) + 1]) : 0;
  const seasonArg = args.find(a => a.startsWith('--season'));
  const singleSeason = seasonArg
    ? (seasonArg.includes('=') ? seasonArg.split('=')[1] : args[args.indexOf(seasonArg) + 1])
    : null;

  console.log('Loading salary data from Supabase...');

  const [contracts, capHistory] = await Promise.all([
    fetchAll<ContractRow>('player_contracts', 'player_name,team_id,season,salary'),
    fetchAll<CapRow>('salary_cap_history', 'season,salary_cap'),
  ]);

  console.log(`  player_contracts: ${contracts.length} rows`);
  console.log(`  salary_cap_history: ${capHistory.length} rows`);

  // Build lookup indexes (both exact name and normalized/lowercase for fuzzy matching)
  const contractsByPlayerTeam = new Map<string, ContractRow[]>();
  const contractsByPlayer = new Map<string, ContractRow[]>();

  function addToIndex(name: string, row: ContractRow) {
    const ptKey = `${name}|${row.team_id}`;
    if (!contractsByPlayerTeam.has(ptKey)) contractsByPlayerTeam.set(ptKey, []);
    contractsByPlayerTeam.get(ptKey)!.push(row);

    if (!contractsByPlayer.has(name)) contractsByPlayer.set(name, []);
    contractsByPlayer.get(name)!.push(row);
  }

  for (const row of contracts) {
    if (!row.salary) continue;
    // Index under exact name
    addToIndex(row.player_name, row);
    // Also index under stripped-diacritics version if different
    const normalized = stripDiacritics(row.player_name);
    if (normalized !== row.player_name) {
      addToIndex(normalized, row);
    }
  }

  const capBySeason = new Map<string, number>();
  for (const row of capHistory) {
    capBySeason.set(row.season, row.salary_cap);
  }

  // Build team payroll index: teamId|season → total salary on that team's books
  const teamPayrolls = new Map<string, number>();
  for (const row of contracts) {
    if (!row.salary || !row.team_id) continue;
    const key = `${row.team_id}|${row.season}`;
    teamPayrolls.set(key, (teamPayrolls.get(key) || 0) + row.salary);
  }

  console.log(`  Unique players with contracts: ${contractsByPlayer.size}`);
  console.log(`  Team-season payrolls: ${teamPayrolls.size}`);
  console.log(`  Seasons with cap data: ${capBySeason.size}\n`);

  // Load trade JSON files
  const seasonFiles = fs.readdirSync(TRADES_DIR)
    .filter(f => f.endsWith('.json') && f !== 'search-index.json')
    .filter(f => !singleSeason || f === `${singleSeason}.json`)
    .sort();

  const allTrades: Trade[] = [];
  for (const file of seasonFiles) {
    const trades = JSON.parse(fs.readFileSync(path.join(TRADES_DIR, file), 'utf-8')) as Trade[];
    allTrades.push(...trades);
  }
  console.log(`Loaded ${allTrades.length} trades from ${seasonFiles.length} season file(s).`);

  // Score each trade
  const results: TradeSalaryScore[] = [];
  for (const trade of allTrades) {
    results.push(scoreTradeSalary(trade, contractsByPlayerTeam, contractsByPlayer, capBySeason, teamPayrolls));
  }

  // Summary stats
  const withSalaryData = results.filter(r => r.total_salary_exchanged > 0);
  const withWinner = results.filter(r => r.salary_winner !== null);
  const totalValue = withSalaryData.reduce((sum, r) => sum + r.total_salary_exchanged, 0);

  console.log(`\nScored ${results.length} trades.`);
  console.log(`  With salary data:    ${withSalaryData.length} (${Math.round(withSalaryData.length / results.length * 100)}%)`);
  console.log(`  Without salary data: ${results.length - withSalaryData.length}`);
  console.log(`  Clear salary winner: ${withWinner.length}`);
  console.log(`  Total $ exchanged:   ${fmt$(totalValue)}`);
  console.log(`  Average per trade:   ${fmt$(Math.round(totalValue / (withSalaryData.length || 1)))}`);

  // Acquired value stats
  const totalAcquired = withSalaryData.reduce((sum, r) => {
    return sum + Object.values(r.salary_details).reduce((ts, t) => ts + t.total_acquired, 0);
  }, 0);
  const gotUnderCapCount = withSalaryData.filter(r =>
    Object.values(r.salary_details).some(t => t.got_under_cap)
  ).length;
  console.log(`  Total acquired $:    ${fmt$(totalAcquired)}`);
  console.log(`  Got-under-cap trades: ${gotUnderCapCount}`);

  // Print biggest trades by total salary exchanged
  const printCount = topN || (dryRun ? 30 : 0);
  if (printCount > 0) {
    console.log(`\nTop ${printCount} trades by total salary exchanged:`);
    const sorted = [...withSalaryData].sort((a, b) => b.total_salary_exchanged - a.total_salary_exchanged);
    for (const r of sorted.slice(0, printCount)) {
      const teams = Object.entries(r.salary_details)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([tid, ts]) => {
          const topPlayer = ts.players[0]?.name || 'picks';
          return `${tid} ${fmt$(ts.total)} (${topPlayer})`;
        });
      console.log(`  ${fmt$(r.total_salary_exchanged).padStart(8)} | ${r.trade_id.slice(0, 25).padEnd(25)} | ${teams.join(' ↔ ')}`);
    }
  }

  // Print trades with biggest salary imbalance
  if (printCount > 0) {
    console.log(`\nTop ${printCount} most salary-imbalanced trades:`);
    const imbalanced = [...withSalaryData]
      .map(r => {
        const totals = Object.values(r.salary_details).map(ts => ts.total).sort((a, b) => b - a);
        const imbalance = totals.length >= 2 ? totals[0] - totals[totals.length - 1] : totals[0] || 0;
        return { ...r, imbalance };
      })
      .sort((a, b) => b.imbalance - a.imbalance);

    for (const r of imbalanced.slice(0, printCount)) {
      const teams = Object.entries(r.salary_details)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([tid, ts]) => `${tid} ${fmt$(ts.total)}`);
      console.log(`  Δ${fmt$(r.imbalance).padStart(7)} | ${r.trade_id.slice(0, 25).padEnd(25)} | ${teams.join(' vs ')}`);
    }
  }

  if (dryRun) {
    console.log('\nDry run — no database writes.');
    return;
  }

  // Update trade_scores with salary data
  console.log('\nUpdating trade_scores with salary data...');
  const BATCH = 200;
  let updated = 0;
  let errors = 0;
  let skipped = 0;

  for (let i = 0; i < results.length; i += BATCH) {
    const batch = results.slice(i, i + BATCH);

    for (const r of batch) {
      if (r.total_salary_exchanged === 0) {
        skipped++;
        continue;
      }

      const { error } = await supabase
        .from('trade_scores')
        .update({
          total_salary_exchanged: r.total_salary_exchanged,
          salary_winner: r.salary_winner,
          salary_details: r.salary_details,
        })
        .eq('trade_id', r.trade_id);

      if (error) {
        // Trade might not have a trade_scores row yet — try upsert
        const { error: upsertError } = await supabase
          .from('trade_scores')
          .upsert({
            trade_id: r.trade_id,
            season: allTrades.find(t => t.id === r.trade_id)?.season || '',
            team_scores: {},
            total_salary_exchanged: r.total_salary_exchanged,
            salary_winner: r.salary_winner,
            salary_details: r.salary_details,
          }, { onConflict: 'trade_id' });

        if (upsertError) {
          errors++;
        } else {
          updated++;
        }
      } else {
        updated++;
      }
    }

    if ((i + BATCH) % 1000 === 0 || i + BATCH >= results.length) {
      console.log(`Progress: ${Math.min(i + BATCH, results.length)}/${results.length}`);
    }
  }

  console.log(`\nDone! Updated ${updated} trade scores with salary data (${skipped} skipped, ${errors} errors).`);
}

main().catch(console.error);
