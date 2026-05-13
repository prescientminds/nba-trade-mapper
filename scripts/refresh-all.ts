/**
 * One-command full data refresh for NBA Trade Mapper (NBA + WNBA).
 *
 * Designed to be triggered by `/update` and run unattended (overnight).
 * Sequential BBRef pipeline (rate-limit safe) + parallel Kaggle/Supabase work.
 *
 * Phase 1 — BBRef + Kaggle (Kaggle runs in background during Phase 1 BBRef work):
 *   NBA:  scrape-today → scrape-bbref-transactions → refresh-playoff-data
 *         → scrape-salaries → scrape-cap-history
 *   WNBA: scrape-wnba-team-seasons → scrape-wnba-trades → scrape-wnba-player-stats
 *         → scrape-wnba-playoffs → scrape-wnba-playoff-stats
 *         → scrape-wnba-accolades → scrape-wnba-draft
 *   Bg:   update-kaggle-stats.sh   (independent host, runs in parallel)
 *
 * Phase 2 — Supabase compute (parallel, all four independent):
 *   score-trades, score-transactions, compute-dynasty-ingredients, update-cap-thresholds
 *
 * Phase 3 — Verify:
 *   verify-playoff-data
 *
 * Manifest at data/last-refresh.json captures per-phase status, timings, errors.
 * Partial failures are logged but do not abort subsequent phases.
 *
 * Usage:
 *   npx tsx scripts/refresh-all.ts                          # everything, default year
 *   npx tsx scripts/refresh-all.ts --year 2026              # explicit NBA playoff year
 *   npx tsx scripts/refresh-all.ts --league=NBA             # NBA only
 *   npx tsx scripts/refresh-all.ts --league=WNBA            # WNBA only
 *   npx tsx scripts/refresh-all.ts --skip-slow              # skip game-logs, historical salaries
 *   npx tsx scripts/refresh-all.ts --no-kaggle              # skip Kaggle pipeline
 *   npx tsx scripts/refresh-all.ts --no-bbref               # skip all scrapers, only recompute
 *   npx tsx scripts/refresh-all.ts --only=score-trades,...  # only named phases
 *   npx tsx scripts/refresh-all.ts --dry-run                # print plan, do nothing
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn, spawnSync, type ChildProcess } from 'child_process';

const REPO_ROOT = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'data', 'last-refresh.json');
const KAGGLE_LOG = path.join(REPO_ROOT, 'data', 'kaggle-refresh.log');

type League = 'NBA' | 'WNBA' | 'all';

interface PhaseResult {
  phase: string;
  league?: 'NBA' | 'WNBA' | 'shared';
  ok: boolean;
  durationSec: number;
  detail?: string;
  skipped?: boolean;
}

interface Args {
  year: number;
  league: League;
  skipSlow: boolean;
  noKaggle: boolean;
  noBbref: boolean;
  only: Set<string> | null;
  dryRun: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
  };
  const has = (flag: string) =>
    argv.includes(flag) || argv.some(a => a.startsWith(`${flag}=`));
  const eqVal = (flag: string) => {
    const m = argv.find(a => a.startsWith(`${flag}=`));
    return m ? m.split('=', 2)[1] : null;
  };

  const yearArg = get('--year') ?? eqVal('--year');
  const leagueArg = (get('--league') ?? eqVal('--league') ?? 'all').toUpperCase();
  const onlyArg = get('--only') ?? eqVal('--only');

  const now = new Date();
  // NBA playoff year: calendar year of the June Finals.
  // May-Oct → current year. Nov-Apr → next year if Nov-Dec, else current year.
  const m = now.getUTCMonth() + 1;
  const defaultYear =
    m >= 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();

  const league = ['NBA', 'WNBA', 'ALL'].includes(leagueArg)
    ? (leagueArg === 'ALL' ? 'all' : (leagueArg as 'NBA' | 'WNBA'))
    : 'all';

  return {
    year: yearArg ? parseInt(yearArg, 10) : defaultYear,
    league,
    skipSlow: has('--skip-slow'),
    noKaggle: has('--no-kaggle'),
    noBbref: has('--no-bbref'),
    only: onlyArg ? new Set(onlyArg.split(',').map(s => s.trim())) : null,
    dryRun: has('--dry-run'),
  };
}

function fmt(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m${s ? `${s}s` : ''}`;
}

function hasKaggleAuth(): boolean {
  const home = process.env.HOME || '';
  return !!process.env.KAGGLE_API_TOKEN
    || fs.existsSync(path.join(home, '.kaggle/access_token'))
    || fs.existsSync(path.join(home, '.kaggle/kaggle.json'));
}

/** Run a `npx tsx scripts/X.ts` (or shell script) synchronously, inherit stdio. */
function runScript(scriptName: string, args: string[], opts: { shell?: boolean } = {}): PhaseResult {
  const start = Date.now();
  const isShell = opts.shell ?? scriptName.endsWith('.sh');
  const cmd = isShell ? `./scripts/${scriptName}` : 'npx';
  const cmdArgs = isShell ? args : ['tsx', `scripts/${scriptName}.ts`, ...args];
  const result = spawnSync(cmd, cmdArgs, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    encoding: 'utf-8',
  });
  return {
    phase: scriptName,
    ok: result.status === 0,
    durationSec: Math.round((Date.now() - start) / 1000),
    detail: result.status !== 0 ? `exit ${result.status}` : undefined,
  };
}

/** Spawn Kaggle refresh in background, return child + start time. */
function startKaggleBackground(): { child: ChildProcess; start: number } | null {
  if (!hasKaggleAuth()) return null;
  fs.mkdirSync(path.dirname(KAGGLE_LOG), { recursive: true });
  const out = fs.openSync(KAGGLE_LOG, 'w');
  const child = spawn('./scripts/update-kaggle-stats.sh', [], {
    cwd: REPO_ROOT,
    stdio: ['ignore', out, out],
    detached: false,
  });
  return { child, start: Date.now() };
}

function waitForKaggle(bg: { child: ChildProcess; start: number }): Promise<PhaseResult> {
  return new Promise(resolve => {
    bg.child.on('exit', code => {
      resolve({
        phase: 'update-kaggle-stats',
        ok: code === 0,
        durationSec: Math.round((Date.now() - bg.start) / 1000),
        detail: code === 0 ? `log: ${path.relative(REPO_ROOT, KAGGLE_LOG)}` : `exit ${code} — see ${path.relative(REPO_ROOT, KAGGLE_LOG)}`,
      });
    });
  });
}

interface PhaseSpec {
  name: string;
  league: 'NBA' | 'WNBA' | 'shared';
  args: string[];
  shell?: boolean;
  slow?: boolean; // skipped when --skip-slow
}

function buildBbrefSequence(year: number, league: League, skipSlow: boolean): PhaseSpec[] {
  const out: PhaseSpec[] = [];
  if (league === 'NBA' || league === 'all') {
    out.push({ name: 'scrape-today', league: 'NBA', args: [] });
    out.push({ name: 'scrape-bbref-transactions', league: 'NBA', args: ['--season', `${year - 1}-${String(year).slice(2)}`] });
    out.push({
      name: 'refresh-playoff-data',
      league: 'NBA',
      args: skipSlow ? ['--year', String(year), '--skip-game-logs'] : ['--year', String(year)],
    });
    out.push({ name: 'scrape-cap-history', league: 'NBA', args: [] });
    out.push({ name: 'scrape-salaries', league: 'NBA', args: [], slow: false });
    if (!skipSlow) {
      out.push({ name: 'scrape-salaries', league: 'NBA', args: ['--historical'], slow: true });
    }
  }
  if (league === 'WNBA' || league === 'all') {
    out.push({ name: 'scrape-wnba-team-seasons', league: 'WNBA', args: ['--year', String(year)] });
    out.push({ name: 'scrape-wnba-trades', league: 'WNBA', args: ['--from', String(year)] });
    out.push({ name: 'scrape-wnba-player-stats', league: 'WNBA', args: ['--year', String(year)] });
    out.push({ name: 'scrape-wnba-playoffs', league: 'WNBA', args: ['--year', String(year)] });
    out.push({ name: 'scrape-wnba-playoff-stats', league: 'WNBA', args: ['--year', String(year)] });
    out.push({ name: 'scrape-wnba-accolades', league: 'WNBA', args: [] });
    out.push({ name: 'scrape-wnba-draft', league: 'WNBA', args: ['--year', String(year)] });
  }
  return out;
}

function buildComputeParallel(league: League): PhaseSpec[] {
  // All Supabase-only, all parallelizable. Run regardless of league flag because
  // scoring/ingredient tables span the corpus and are cheap to recompute.
  const _ = league;
  return [
    { name: 'score-trades', league: 'shared', args: [] },
    { name: 'score-transactions', league: 'shared', args: [] },
    { name: 'compute-dynasty-ingredients', league: 'shared', args: [] },
    { name: 'update-cap-thresholds', league: 'shared', args: [] },
  ];
}

function shouldRun(spec: PhaseSpec, args: Args): boolean {
  if (args.only && !args.only.has(spec.name)) return false;
  if (spec.slow && args.skipSlow) return false;
  return true;
}

async function runParallel(specs: PhaseSpec[]): Promise<PhaseResult[]> {
  // Each child takes stdio:'pipe' (no inherit) so output doesn't interleave.
  // We buffer and print after exit.
  const promises = specs.map(spec =>
    new Promise<PhaseResult>(resolve => {
      const start = Date.now();
      const child = spawn('npx', ['tsx', `scripts/${spec.name}.ts`, ...spec.args], {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', d => { stdout += d.toString(); });
      child.stderr?.on('data', d => { stderr += d.toString(); });
      child.on('exit', code => {
        const sec = Math.round((Date.now() - start) / 1000);
        console.log(`\n━━ ${spec.name} (${sec}s, exit ${code}) ━━`);
        if (stdout.trim()) console.log(stdout.trimEnd());
        if (stderr.trim()) console.error(stderr.trimEnd());
        resolve({
          phase: spec.name,
          league: spec.league,
          ok: code === 0,
          durationSec: sec,
          detail: code !== 0 ? `exit ${code}` : undefined,
        });
      });
    })
  );
  return Promise.all(promises);
}

async function main() {
  const args = parseArgs();
  const phases: PhaseResult[] = [];
  const overallStart = Date.now();

  console.log('\n━━ refresh-all ━━');
  console.log(`  year:        ${args.year}`);
  console.log(`  league:      ${args.league}`);
  console.log(`  skip-slow:   ${args.skipSlow}`);
  console.log(`  no-kaggle:   ${args.noKaggle}`);
  console.log(`  no-bbref:    ${args.noBbref}`);
  console.log(`  only:        ${args.only ? [...args.only].join(',') : '(all)'}`);
  console.log(`  dry-run:     ${args.dryRun}`);
  console.log(`  kaggle-auth: ${hasKaggleAuth() ? 'present' : 'MISSING (set KAGGLE_API_TOKEN or place ~/.kaggle/kaggle.json)'}`);

  // ── Build plan ────────────────────────────────────────────────
  const bbrefPhases = args.noBbref ? [] : buildBbrefSequence(args.year, args.league, args.skipSlow);
  const computePhases = buildComputeParallel(args.league);
  const runKaggle = !args.noKaggle && hasKaggleAuth();

  console.log('\n━━ plan ━━');
  console.log(`  Phase 1 — BBRef sequential (${bbrefPhases.length} phases) + Kaggle background (${runKaggle ? 'yes' : 'skipped'})`);
  for (const s of bbrefPhases) {
    const will = shouldRun(s, args);
    console.log(`    ${will ? '▸' : '·'} ${s.name.padEnd(30)} [${s.league}]${s.slow ? ' (slow)' : ''}${will ? '' : ' SKIP'}`);
  }
  console.log(`  Phase 2 — Supabase compute parallel`);
  for (const s of computePhases) {
    const will = shouldRun(s, args);
    console.log(`    ${will ? '▸' : '·'} ${s.name.padEnd(30)} [${s.league}]${will ? '' : ' SKIP'}`);
  }
  console.log(`  Phase 3 — verify-playoff-data`);

  if (args.dryRun) {
    console.log('\n--dry-run: exiting without execution.');
    process.exit(0);
  }

  // ── Phase 1 ────────────────────────────────────────────────────
  const kaggleBg = runKaggle ? startKaggleBackground() : null;
  if (kaggleBg) console.log(`\n▸ Kaggle refresh started in background (log: ${path.relative(REPO_ROOT, KAGGLE_LOG)})`);

  for (let i = 0; i < bbrefPhases.length; i++) {
    const spec = bbrefPhases[i];
    if (!shouldRun(spec, args)) continue;
    console.log(`\n▸ Phase 1.${i + 1}  ${spec.name} [${spec.league}]${spec.slow ? ' (slow)' : ''}`);
    const res = runScript(spec.name, spec.args, { shell: spec.shell });
    res.league = spec.league;
    phases.push(res);
    if (!res.ok) console.error(`  ✗ ${spec.name} failed (${res.detail}); continuing.`);
  }

  if (kaggleBg) {
    console.log('\n▸ Waiting for Kaggle refresh to finish (if still running)...');
    const kaggleRes = await waitForKaggle(kaggleBg);
    kaggleRes.league = 'shared';
    phases.push(kaggleRes);
    console.log(`  ${kaggleRes.ok ? '✓' : '✗'} Kaggle: ${kaggleRes.durationSec}s ${kaggleRes.detail ?? ''}`);
  } else if (!args.noKaggle) {
    phases.push({
      phase: 'update-kaggle-stats',
      league: 'shared',
      ok: false,
      durationSec: 0,
      skipped: true,
      detail: 'no auth (set KAGGLE_API_TOKEN or place ~/.kaggle/kaggle.json)',
    });
  }

  // ── Phase 2 ────────────────────────────────────────────────────
  const computeToRun = computePhases.filter(s => shouldRun(s, args));
  if (computeToRun.length) {
    console.log(`\n▸ Phase 2  Supabase compute (${computeToRun.length} in parallel)`);
    const computeResults = await runParallel(computeToRun);
    phases.push(...computeResults);
  }

  // ── Phase 3 ────────────────────────────────────────────────────
  if (!args.only || args.only.has('verify-playoff-data')) {
    console.log(`\n▸ Phase 3  verify-playoff-data`);
    const verifyRes = runScript('verify-playoff-data', ['--year', String(args.year)]);
    verifyRes.league = 'NBA';
    phases.push(verifyRes);
  }

  // ── Manifest ──────────────────────────────────────────────────
  const totalSec = Math.round((Date.now() - overallStart) / 1000);
  const manifest = {
    timestamp: new Date().toISOString(),
    year: args.year,
    league: args.league,
    durationSec: totalSec,
    phases: phases.map(p => ({
      phase: p.phase,
      league: p.league ?? 'shared',
      ok: p.ok,
      durationSec: p.durationSec,
      detail: p.detail,
      skipped: p.skipped,
    })),
    allOk: phases.every(p => p.ok || p.skipped),
  };
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  // ── Summary ───────────────────────────────────────────────────
  console.log('\n━━ summary ━━');
  for (const p of phases) {
    const tag = p.skipped ? '·' : p.ok ? '✓' : '✗';
    console.log(`  ${tag} ${(p.phase + (p.league ? ` [${p.league}]` : '')).padEnd(48)} ${fmt(p.durationSec)}${p.detail ? `  (${p.detail})` : ''}`);
  }
  console.log(`\n  Total: ${fmt(totalSec)}`);
  console.log(`  Manifest: ${path.relative(REPO_ROOT, MANIFEST_PATH)}`);

  if (!manifest.allOk) {
    const failed = phases.filter(p => !p.ok && !p.skipped);
    console.error(`\n✗ ${failed.length} phase(s) failed: ${failed.map(p => p.phase).join(', ')}`);
    process.exit(1);
  }
  console.log('\n✓ All phases passed.');
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
