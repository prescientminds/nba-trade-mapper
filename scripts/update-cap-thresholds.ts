/**
 * Update salary_cap_history with supplementary CBA threshold data.
 *
 * Populates columns that were left NULL by the initial BBRef cap scraper:
 *   - luxury_tax (2002-03+)
 *   - first_apron (2017-18+, formalized in 2023 CBA but tax apron existed since 2017)
 *   - second_apron (2023-24+)
 *   - mle (non-taxpayer mid-level exception, 2002-03+)
 *   - taxpayer_mle (2011-12+)
 *   - bae (bi-annual exception, 2005-06+)
 *   - minimum_salary (rookie/0-year minimum, 2002-03+)
 *
 * Sources:
 *   - SalarySwish.com salary cap history (cap, tax, aprons)
 *   - NBA official press releases (MLE, BAE amounts)
 *   - CBA FAQ (cbafaq.com) for older thresholds
 *
 * Usage:
 *   npx tsx scripts/update-cap-thresholds.ts              # Update all
 *   npx tsx scripts/update-cap-thresholds.ts --dry-run    # Print data, no DB writes
 */

import { supabase } from './lib/supabase-admin';

// ── Threshold data ───────────────────────────────────────────────────
// Only includes seasons where we have supplementary data.
// salary_cap is NOT updated here — it was already populated by scrape-cap-history.ts.

interface CapThresholds {
  season: string;
  luxury_tax?: number;
  first_apron?: number;
  second_apron?: number;
  mle?: number;
  taxpayer_mle?: number;
  bae?: number;
  minimum_salary?: number;
}

const THRESHOLDS: CapThresholds[] = [
  // ── Pre-2005 CBA (luxury tax introduced 2002-03) ───────────────────
  { season: '2002-03', luxury_tax: 52_900_000, mle: 4_500_000, minimum_salary: 366_931 },
  { season: '2003-04', luxury_tax: 54_600_000, mle: 4_917_000, minimum_salary: 385_277 },

  // ── 2005 CBA era ───────────────────────────────────────────────────
  { season: '2004-05', luxury_tax: 54_600_000, mle: 5_000_000, minimum_salary: 398_762 },
  { season: '2005-06', luxury_tax: 61_700_000, mle: 5_000_000, bae: 1_672_000, minimum_salary: 412_718 },
  { season: '2006-07', luxury_tax: 65_420_000, mle: 5_150_000, bae: 1_722_000, minimum_salary: 427_163 },
  { season: '2007-08', luxury_tax: 67_865_000, mle: 5_356_000, bae: 1_791_000, minimum_salary: 442_114 },
  { season: '2008-09', luxury_tax: 71_150_000, mle: 5_585_000, bae: 1_868_000, minimum_salary: 457_588 },
  { season: '2009-10', luxury_tax: 69_920_000, mle: 5_854_000, bae: 1_959_000, minimum_salary: 473_604 },
  { season: '2010-11', luxury_tax: 70_307_000, mle: 5_764_000, bae: 2_016_000, minimum_salary: 473_604 },

  // ── 2011 CBA era (taxpayer MLE split out) ──────────────────────────
  { season: '2011-12', luxury_tax: 70_307_000, mle: 5_000_000, taxpayer_mle: 3_000_000, bae: 1_962_000, minimum_salary: 473_604 },
  { season: '2012-13', luxury_tax: 70_307_000, mle: 5_150_000, taxpayer_mle: 3_090_000, bae: 2_021_000, minimum_salary: 490_180 },
  { season: '2013-14', luxury_tax: 71_748_000, mle: 5_305_000, taxpayer_mle: 3_183_000, bae: 2_077_000, minimum_salary: 507_336 },
  { season: '2014-15', luxury_tax: 76_830_000, mle: 5_305_000, taxpayer_mle: 3_278_000, bae: 2_077_000, minimum_salary: 525_093 },
  { season: '2015-16', luxury_tax: 84_740_000, mle: 5_464_000, taxpayer_mle: 3_376_000, bae: 2_139_000, minimum_salary: 525_093 },
  { season: '2016-17', luxury_tax: 113_287_000, mle: 5_628_000, taxpayer_mle: 3_477_000, bae: 2_203_000, minimum_salary: 543_471 },

  // ── 2017 CBA era (tax apron / first apron introduced) ─────────────
  { season: '2017-18', luxury_tax: 119_266_000, first_apron: 125_266_000,
    mle: 8_406_000, taxpayer_mle: 5_192_000, bae: 3_290_000, minimum_salary: 815_615 },
  { season: '2018-19', luxury_tax: 123_733_000, first_apron: 129_817_000,
    mle: 8_641_000, taxpayer_mle: 5_337_000, bae: 3_382_000, minimum_salary: 838_464 },
  { season: '2019-20', luxury_tax: 132_627_000, first_apron: 138_928_000,
    mle: 9_258_000, taxpayer_mle: 5_718_000, bae: 3_623_000, minimum_salary: 898_310 },
  { season: '2020-21', luxury_tax: 132_627_000, first_apron: 138_928_000,
    mle: 9_258_000, taxpayer_mle: 5_718_000, bae: 3_623_000, minimum_salary: 898_310 },
  { season: '2021-22', luxury_tax: 136_606_000, first_apron: 143_002_000,
    mle: 9_536_000, taxpayer_mle: 5_890_000, bae: 3_732_000, minimum_salary: 925_258 },
  { season: '2022-23', luxury_tax: 150_267_000, first_apron: 157_302_000,
    mle: 10_490_000, taxpayer_mle: 6_479_000, bae: 4_105_000, minimum_salary: 1_017_781 },

  // ── 2023 CBA era (second apron introduced, taxpayer MLE reduced) ──
  { season: '2023-24', luxury_tax: 165_294_000, first_apron: 172_346_000, second_apron: 182_794_000,
    mle: 12_410_000, taxpayer_mle: 5_180_000, bae: 4_516_000, minimum_salary: 1_119_563 },
  { season: '2024-25', luxury_tax: 170_814_000, first_apron: 178_132_000, second_apron: 188_931_000,
    mle: 12_870_000, taxpayer_mle: 5_180_000, bae: 4_680_000, minimum_salary: 1_157_970 },
  { season: '2025-26', luxury_tax: 187_895_000, first_apron: 195_945_000, second_apron: 207_824_000,
    mle: 14_104_000, taxpayer_mle: 5_685_000, bae: 5_135_000, minimum_salary: 1_157_970 },
];

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(`Cap threshold data for ${THRESHOLDS.length} seasons.`);

  if (dryRun) {
    console.log('\nSeason          Tax           1st Apron     2nd Apron     MLE           TP-MLE        BAE           Min Salary');
    console.log('─'.repeat(130));
    for (const t of THRESHOLDS) {
      const fmt = (v?: number) => v ? `$${(v / 1_000_000).toFixed(1)}M`.padEnd(14) : '—'.padEnd(14);
      console.log(
        `${t.season.padEnd(16)}${fmt(t.luxury_tax)}${fmt(t.first_apron)}${fmt(t.second_apron)}${fmt(t.mle)}${fmt(t.taxpayer_mle)}${fmt(t.bae)}${fmt(t.minimum_salary)}`
      );
    }
    console.log('\n--dry-run: no database writes.');
    return;
  }

  // Update each season's row (rows already exist from scrape-cap-history.ts)
  let updated = 0;
  let errors = 0;

  for (const t of THRESHOLDS) {
    const updateData: Record<string, number | null> = {};
    if (t.luxury_tax !== undefined) updateData.luxury_tax = t.luxury_tax;
    if (t.first_apron !== undefined) updateData.first_apron = t.first_apron;
    if (t.second_apron !== undefined) updateData.second_apron = t.second_apron;
    if (t.mle !== undefined) updateData.mle = t.mle;
    if (t.taxpayer_mle !== undefined) updateData.taxpayer_mle = t.taxpayer_mle;
    if (t.bae !== undefined) updateData.bae = t.bae;
    if (t.minimum_salary !== undefined) updateData.minimum_salary = t.minimum_salary;

    const { error } = await supabase
      .from('salary_cap_history')
      .update(updateData)
      .eq('season', t.season);

    if (error) {
      console.error(`Error updating ${t.season}: ${error.message}`);
      errors++;
    } else {
      updated++;
    }
  }

  console.log(`\nDone! Updated ${updated} seasons (${errors} errors).`);

  // Verify: show a count of non-null columns
  const { data: verification } = await supabase
    .from('salary_cap_history')
    .select('season, luxury_tax, first_apron, second_apron, mle, taxpayer_mle, bae, minimum_salary')
    .not('luxury_tax', 'is', null)
    .order('season', { ascending: false })
    .limit(5);

  if (verification) {
    console.log('\nVerification (5 most recent with luxury_tax):');
    for (const row of verification) {
      console.log(`  ${row.season}: tax=$${((row.luxury_tax as number) / 1e6).toFixed(1)}M, mle=${row.mle ? `$${((row.mle as number) / 1e6).toFixed(1)}M` : 'NULL'}`);
    }
  }
}

main().catch(console.error);
