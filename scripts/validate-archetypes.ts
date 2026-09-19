/**
 * Score the derived archetype against the 100 hand-tagged trades.
 *
 * The hand tags in `public/data/trade-motivations.json` were written against
 * the worked examples in `content/comparables-signature-v1.md`. They are the
 * only human judgement available about what kind of trade each one is, so they
 * are the validation set — not the production source. Production derives the
 * archetype, because the user's in-progress trade will never have a tag.
 *
 * `forced_exit` is reported separately and excluded from the headline accuracy.
 * It encodes a public trade request, which is external context no box score can
 * recover; counting it would be scoring the deriver on a question it is not
 * allowed to answer.
 *
 *   npx tsx scripts/validate-archetypes.ts
 *   npx tsx scripts/validate-archetypes.ts --confusion   # full matrix
 */

import * as fs from 'fs';
import * as path from 'path';
import { deriveArchetype } from '../src/lib/comparables/archetype';
import type { TradeProfile, MotivationFlag } from '../src/lib/comparables/types';

const PROFILES = path.join(__dirname, '..', 'public', 'data', 'trade-profiles.json');

const LABELS: MotivationFlag[] = [
  'star_acquisition',
  'teardown',
  'salary_dump',
  'rental',
  'reshuffle',
  'forced_exit',
];

function main() {
  const showConfusion = process.argv.includes('--confusion');
  const profiles: TradeProfile[] = JSON.parse(fs.readFileSync(PROFILES, 'utf8'));
  const tagged = profiles.filter(p => p.motivation);

  if (tagged.length === 0) {
    console.error('No hand-tagged profiles found. Did build-trade-profiles run with trade-motivations.json present?');
    process.exit(1);
  }

  const rows = tagged.map(p => ({
    trade: p,
    expected: p.motivation as MotivationFlag,
    got: deriveArchetype(p).archetype,
  }));

  const scorable = rows.filter(r => r.expected !== 'forced_exit');
  const correct = scorable.filter(r => r.expected === r.got);

  console.log(`\nHand-tagged profiles: ${tagged.length}`);
  console.log(`Scorable (excluding forced_exit): ${scorable.length}`);
  console.log(`Agreement: ${correct.length}/${scorable.length} = ${((100 * correct.length) / scorable.length).toFixed(1)}%\n`);

  // Per-class precision and recall. Accuracy alone hides the failure mode that
  // matters here: `reshuffle` is 68% of the corpus, so a deriver that returned
  // `reshuffle` unconditionally would post 68% and be useless.
  console.log('class              n   recall   precision');
  for (const label of LABELS) {
    const actual = rows.filter(r => r.expected === label);
    const predicted = rows.filter(r => r.got === label);
    const hit = actual.filter(r => r.got === label).length;
    if (actual.length === 0 && predicted.length === 0) continue;
    const recall = actual.length ? ((100 * hit) / actual.length).toFixed(0) + '%' : '—';
    const precision = predicted.length ? ((100 * hit) / predicted.length).toFixed(0) + '%' : '—';
    const note = label === 'forced_exit' ? '  (never derived, excluded)' : '';
    console.log(
      `${label.padEnd(18)} ${String(actual.length).padStart(2)}   ${recall.padStart(6)}   ${precision.padStart(9)}${note}`
    );
  }

  // The always-reshuffle baseline this has to beat to be worth anything.
  const majority = scorable.filter(r => r.expected === 'reshuffle').length;
  console.log(
    `\nBaseline (always "reshuffle"): ${majority}/${scorable.length} = ${((100 * majority) / scorable.length).toFixed(1)}%`
  );

  if (showConfusion) {
    console.log('\nConfusion (rows = hand tag, cols = derived):\n');
    const header = LABELS.map(l => l.slice(0, 8).padStart(9)).join('');
    console.log(''.padEnd(18) + header);
    for (const expected of LABELS) {
      const cells = LABELS.map(got => {
        const n = rows.filter(r => r.expected === expected && r.got === got).length;
        return String(n || '·').padStart(9);
      }).join('');
      console.log(expected.padEnd(18) + cells);
    }

    console.log('\nMisses:\n');
    for (const r of scorable.filter(x => x.expected !== x.got)) {
      console.log(`  ${(r.trade.headline ?? r.trade.id).padEnd(50)} hand=${r.expected.padEnd(17)} derived=${r.got}`);
    }
  }
}

main();
