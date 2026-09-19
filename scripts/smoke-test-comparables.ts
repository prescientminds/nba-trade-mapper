/**
 * Smoke test for the comparables engine.
 * Loads public/data/trade-profiles.json, constructs a Kawhi-2018-like proposed trade,
 * and prints the top 5 historical comparables. Expect to see other superstar-request /
 * contender-buys-star trades near the top (AD-to-LAL, Harden-to-BKN, etc.).
 */

import * as fs from 'fs';
import * as path from 'path';
import { findComparables, TradeProfile } from '../src/lib/comparables';

const PROFILES_FILE = path.join(__dirname, '..', 'public', 'data', 'trade-profiles.json');

function main() {
  const profiles: TradeProfile[] = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf-8'));
  console.log(`Loaded ${profiles.length} historical trade profiles.\n`);

  // Proposed trade: Kawhi-2018-to-TOR shape.
  // SAS sends Kawhi (27, BPM 7 coming off injury year, 1yr left, ~26% cap)
  //              + Green (31, BPM 1, 1yr left, ~10% cap)
  // TOR sends DeRozan (29, BPM 2.6, 3yr left, ~25% cap)
  //              + Poeltl (22, BPM -2.5, 3yr left, ~2.5% cap)
  //              + 1 pick
  const proposed: TradeProfile = {
    id: 'hypothetical-kawhi-2018',
    year: 2019,
    sides: [
      {
        teamId: 'SAS',
        players: [
          { name: 'Kawhi Leonard',  age: 27, bpm: 7.0, contractYearsRemaining: 1, capPct: 0.26 },
          { name: 'Danny Green',    age: 31, bpm: 1.2, contractYearsRemaining: 1, capPct: 0.10 },
        ],
        pickCount: 0,
      },
      {
        teamId: 'TOR',
        players: [
          { name: 'DeMar DeRozan',  age: 29, bpm: 2.6, contractYearsRemaining: 3, capPct: 0.25 },
          { name: 'Jakob Poeltl',   age: 22, bpm: -2.5, contractYearsRemaining: 3, capPct: 0.025 },
        ],
        pickCount: 1,
      },
    ],
  };

  const results = findComparables(proposed, profiles, { topN: 5 });

  console.log('Top 5 comparables for Kawhi-2018-to-TOR:');
  console.log('');
  for (const r of results) {
    const p = profiles.find((x) => x.id === r.id);
    console.log(`  [${(r.matchScore * 100).toFixed(0)}%]  ${r.headline ?? p?.id}`);
    if (r.outcomeSummary) console.log(`          ${r.outcomeSummary}`);
    console.log('');
  }
}

main();
