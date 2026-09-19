/**
 * Smoke test for the comparables engine.
 *
 * Builds the Kawhi-2018-to-Toronto trade as a hypothetical and prints its top
 * comparables, with the derived archetype and the calibrated band. The design
 * doc's expectation is that superstar-request / contender-buys-star trades
 * surface near the top — AD to the Lakers, Harden to Brooklyn — and that a
 * Paul George trade does not, which the doc names explicitly as the canonical
 * non-comparable.
 *
 *   npx tsx scripts/smoke-test-comparables.ts
 *   npx tsx scripts/smoke-test-comparables.ts --top 10
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  findComparablesDetailed,
  BAND_LABELS,
  type TradeProfile,
  type CalibrationArtifact,
} from '../src/lib/comparables';

const PROFILES_FILE = path.join(__dirname, '..', 'public', 'data', 'trade-profiles.json');
const CALIBRATION_FILE = path.join(__dirname, '..', 'public', 'data', 'comparables-calibration.json');

function main() {
  const topIdx = process.argv.indexOf('--top');
  const topN = topIdx >= 0 ? parseInt(process.argv[topIdx + 1], 10) : 5;

  const profiles: TradeProfile[] = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf-8'));
  const calibration: CalibrationArtifact = JSON.parse(fs.readFileSync(CALIBRATION_FILE, 'utf-8'));
  console.log(`Loaded ${profiles.length} historical trade profiles.`);
  console.log(`Calibration ${calibration.signature}, built ${calibration.generatedAt} over ${calibration.pairCount} neighbours.\n`);

  // SAS sends Kawhi (27, BPM 7 coming off an injury year, 1yr left, ~26% cap)
  //               + Danny Green (31, BPM 1.2, 1yr left, ~10% cap)
  // TOR sends DeRozan (29, BPM 2.6, 3yr left, ~25% cap)
  //               + Poeltl (22, BPM -2.5, 3yr left, ~2.5% cap) + a 1st
  const proposed: TradeProfile = {
    id: 'hypothetical-kawhi-2018',
    year: 2019,
    date: '2018-07-18',
    sides: [
      {
        teamId: 'SAS',
        players: [
          { name: 'Kawhi Leonard', age: 27, bpm: 7.0, contractYearsRemaining: 1, capPct: 0.26 },
          { name: 'Danny Green', age: 31, bpm: 1.2, contractYearsRemaining: 1, capPct: 0.10 },
        ],
        pickCount: 0,
        firstRoundPicks: 0,
        secondRoundPicks: 0,
        swapCount: 0,
      },
      {
        teamId: 'TOR',
        players: [
          { name: 'DeMar DeRozan', age: 29, bpm: 2.6, contractYearsRemaining: 3, capPct: 0.25 },
          { name: 'Jakob Poeltl', age: 22, bpm: -2.5, contractYearsRemaining: 3, capPct: 0.025 },
        ],
        pickCount: 1,
        firstRoundPicks: 1,
        secondRoundPicks: 0,
        swapCount: 0,
      },
    ],
  };

  const result = findComparablesDetailed(proposed, profiles, { topN, calibration });

  console.log(`Derived archetype: ${result.proposedArchetype}`);
  console.log(`Candidates clearing the structural gate: ${result.gatedCandidateCount}`);
  if (result.noStructuralPrecedent) {
    console.log('! Nothing cleared the gate — these came from the unfiltered fallback.');
  }
  console.log(`\nTop ${topN} comparables:\n`);

  for (const r of result.comparables) {
    console.log(`  ${(r.matchScore * 100).toFixed(0).padStart(3)}%  ${BAND_LABELS[r.band].padEnd(26)}  ${r.headline ?? r.id}`);
    if (r.matchedOn.length) console.log(`        matched on: ${r.matchedOn.join(' · ')}`);
    if (r.outcomeSummary) console.log(`        outcome: ${r.outcomeSummary}`);
    console.log('');
  }
}

main();
