/**
 * One-command playoff data refresh.
 *
 * Phases:
 *   1. scrape-playoff-results    — bracket → team_seasons.playoff_result
 *   2. scrape-playoff-stats      — advanced + per_game → player_seasons playoff_*
 *   3. derive active rosters     — read just-cached per_game.html, list each team's GP>0 players
 *   4. scrape-playoff-game-logs  — --refresh --names <derived list> → playoff_game_logs
 *   5. verify-playoff-data       — six invariants, fail loud on any hard-fail
 *
 * Writes data/last-refresh.json with timestamps + counts.
 * Mid-bracket safe: results phase only stamps completed series; verifier knows
 * active series legitimately have no stamps.
 *
 * Usage:
 *   npx tsx scripts/refresh-playoff-data.ts --year 2026
 *   npx tsx scripts/refresh-playoff-data.ts --year 2026 --teams DEN,MIN  # narrower roster scope
 *   npx tsx scripts/refresh-playoff-data.ts --year 2026 --skip-game-logs # results+stats only
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { resolveTeamId } from './lib/team-resolver';

const REPO_ROOT = path.join(__dirname, '..');
const PER_GAME_CACHE = (year: number) =>
  path.join(REPO_ROOT, 'data', 'bbref-cache', 'playoff-stats', `NBA_${year}_per_game.html`);
const LAST_REFRESH = path.join(REPO_ROOT, 'data', 'last-refresh.json');

interface PhaseResult {
  phase: string;
  ok: boolean;
  durationMs: number;
  detail?: string;
}

function runScript(name: string, args: string[]): PhaseResult {
  const start = Date.now();
  const result = spawnSync('npx', ['tsx', `scripts/${name}.ts`, ...args], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    encoding: 'utf-8',
  });
  return {
    phase: name,
    ok: result.status === 0,
    durationMs: Date.now() - start,
    detail: result.status !== 0 ? `exit ${result.status}` : undefined,
  };
}

function deriveActiveRosters(year: number, teamFilter?: Set<string>): string[] {
  const cachePath = PER_GAME_CACHE(year);
  if (!fs.existsSync(cachePath)) return [];
  const $ = cheerio.load(fs.readFileSync(cachePath, 'utf-8'));
  const names = new Set<string>();
  $('table tbody tr').each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass('thead') || $tr.hasClass('over_header')) return;
    const playerCell = $tr.find('[data-stat="player"]');
    const player = (playerCell.find('a').text() || playerCell.text()).replace(/\*/g, '').trim();
    if (!player) return;
    const abbr = $tr.find('[data-stat="team_id"]').text().trim();
    const teamId = resolveTeamId(abbr);
    if (!teamId) return;
    if (teamFilter && !teamFilter.has(teamId)) return;
    const gp = parseInt($tr.find('[data-stat="g"]').text().trim() || '0', 10) || 0;
    if (gp > 0) names.add(player);
  });
  return [...names].sort();
}

async function main() {
  const args = process.argv.slice(2);
  const yearIdx = args.indexOf('--year');
  if (yearIdx < 0 || !args[yearIdx + 1]) {
    console.error('usage: refresh-playoff-data.ts --year YYYY [--teams DEN,MIN] [--skip-game-logs]');
    process.exit(2);
  }
  const year = parseInt(args[yearIdx + 1], 10);
  const teamsIdx = args.indexOf('--teams');
  const teamFilter = teamsIdx >= 0 && args[teamsIdx + 1]
    ? new Set(args[teamsIdx + 1].split(',').map(t => t.trim().toUpperCase()))
    : undefined;
  const skipGameLogs = args.includes('--skip-game-logs');

  const overallStart = Date.now();
  const phases: PhaseResult[] = [];

  console.log(`\n━━ Refresh playoff data — year ${year}${teamFilter ? ` (teams: ${[...teamFilter].join(', ')})` : ''} ━━\n`);

  // Phase 1: bracket
  console.log('▸ Phase 1/5  scrape-playoff-results');
  phases.push(runScript('scrape-playoff-results', ['--year', String(year)]));
  if (!phases[phases.length - 1].ok) {
    console.error('Phase 1 failed; aborting.');
    process.exit(1);
  }

  // Phase 2: stats
  console.log('\n▸ Phase 2/5  scrape-playoff-stats');
  phases.push(runScript('scrape-playoff-stats', ['--year', String(year), '--overwrite']));
  if (!phases[phases.length - 1].ok) {
    console.error('Phase 2 failed; aborting.');
    process.exit(1);
  }

  // Phase 3: derive rosters
  console.log('\n▸ Phase 3/5  derive active rosters');
  const rosters = deriveActiveRosters(year, teamFilter);
  console.log(`  ${rosters.length} active players${teamFilter ? ` across ${teamFilter.size} team(s)` : ' across all playoff teams'}`);
  phases.push({ phase: 'derive-rosters', ok: rosters.length > 0, durationMs: 0, detail: `${rosters.length} names` });

  // Phase 4: game logs
  if (skipGameLogs) {
    console.log('\n▸ Phase 4/5  scrape-playoff-game-logs  [SKIPPED]');
    phases.push({ phase: 'scrape-playoff-game-logs', ok: true, durationMs: 0, detail: 'skipped' });
  } else if (rosters.length === 0) {
    console.log('\n▸ Phase 4/5  scrape-playoff-game-logs  [no rosters to refresh]');
    phases.push({ phase: 'scrape-playoff-game-logs', ok: true, durationMs: 0, detail: 'no rosters' });
  } else {
    console.log(`\n▸ Phase 4/5  scrape-playoff-game-logs  (~${Math.ceil(rosters.length * 3.1 / 60)} min for ${rosters.length} players)`);
    phases.push(runScript('scrape-playoff-game-logs', ['--refresh', '--names', rosters.join(',')]));
    if (!phases[phases.length - 1].ok) {
      console.error('Phase 4 failed; continuing to verify.');
    }
  }

  // Phase 5: verify
  console.log('\n▸ Phase 5/5  verify-playoff-data');
  phases.push(runScript('verify-playoff-data', ['--year', String(year)]));

  // Write last-refresh manifest
  const totalMs = Date.now() - overallStart;
  const manifest = {
    timestamp: new Date().toISOString(),
    year,
    season: `${year - 1}-${String(year).slice(2)}`,
    teams: teamFilter ? [...teamFilter] : 'all',
    rostersRefreshed: rosters.length,
    durationSec: Math.round(totalMs / 1000),
    phases: phases.map(p => ({ phase: p.phase, ok: p.ok, durationSec: Math.round(p.durationMs / 1000), detail: p.detail })),
    verifyPassed: phases[phases.length - 1].ok,
  };
  fs.mkdirSync(path.dirname(LAST_REFRESH), { recursive: true });
  fs.writeFileSync(LAST_REFRESH, JSON.stringify(manifest, null, 2));

  // Summary
  console.log('\n━━ Summary ━━');
  for (const p of phases) {
    const tag = p.ok ? '✓' : '✗';
    console.log(`  ${tag} ${p.phase.padEnd(28)} ${Math.round(p.durationMs / 1000)}s${p.detail ? `  (${p.detail})` : ''}`);
  }
  console.log(`\n  Total: ${Math.round(totalMs / 1000)}s`);
  console.log(`  Manifest: ${path.relative(REPO_ROOT, LAST_REFRESH)}`);

  if (!manifest.verifyPassed) {
    console.error('\n✗ Verify FAILED — check phase 5 output above. Manifest written but data needs human review.');
    process.exit(1);
  }
  console.log('\n✓ All phases passed.');
}

main().catch(e => { console.error(e); process.exit(1); });
