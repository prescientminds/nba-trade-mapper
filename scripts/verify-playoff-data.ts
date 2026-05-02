/**
 * Verify playoff data integrity for a given season.
 *
 * Six invariants — five hard-fail, one advisory:
 *   1. team_seasons.playoff_result set for every team in BBRef's bracket
 *   2. player_seasons.playoff_gp set for every player BBRef lists with GP > 0
 *   3. No duplicates in player_seasons (player_name, team_id, season)
 *   4. No orphan game logs (game_log player absent from player_seasons that team/season)
 *   5. game_logs row count ≥ Σ(playoff_gp) for refreshed players
 *   6. (Advisory) Top-5 playoff_ws per team — human eyeball
 *
 * Reads BBRef cache files from data/bbref-cache/playoffs/ and playoff-stats/.
 * If a cache file is missing, the dependent invariant is reported as SKIPPED
 * with a hint to run the scraper first.
 *
 * Usage:
 *   npx tsx scripts/verify-playoff-data.ts --year 2026
 *   npx tsx scripts/verify-playoff-data.ts --year 2026 --json   # machine-readable
 *
 * Exit codes:
 *   0  all hard-fail invariants pass
 *   1  one or more hard-fail invariants failed
 *   2  cache missing, no checks runnable
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';
import { resolveTeamId } from './lib/team-resolver';

const CACHE_BRACKET = (year: number) =>
  path.join(__dirname, '..', 'data', 'bbref-cache', 'playoffs', `NBA_${year}.html`);
const CACHE_PERGAME = (year: number) =>
  path.join(__dirname, '..', 'data', 'bbref-cache', 'playoff-stats', `NBA_${year}_per_game.html`);

function bbrefSeasonToOurs(endYear: number): string {
  return `${endYear - 1}-${String(endYear).slice(2)}`;
}

interface CheckResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP' | 'INFO';
  detail: string;
  data?: unknown;
}

// ── Parsers ──────────────────────────────────────────────────────────

interface SeriesRow {
  round: string;
  status: 'completed' | 'active';
  teams: string[]; // resolved team_ids
}

function bracketSeries(html: string): SeriesRow[] {
  const out: SeriesRow[] = [];
  const re = /<tr>\s*<td>(?:<span[^>]*>)?<strong>([^<]+)<\/strong>(?:<\/span>)?<\/td>\s*<td>(.*?)<\/td>/gs;
  let m;
  while ((m = re.exec(html)) !== null) {
    const round = m[1].trim();
    const body = m[2];
    const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    const status: 'completed' | 'active' =
      text.includes(' over ') ? 'completed' :
      (text.includes(' leads ') || text.includes(' trails ') || text.includes(' tied ')) ? 'active' :
      'active';
    const teams = new Set<string>();
    const teamRe = /\/teams\/([A-Z]{2,3})\/\d{4}\.html/g;
    let t;
    while ((t = teamRe.exec(body)) !== null) {
      const id = resolveTeamId(t[1]);
      if (id) teams.add(id);
    }
    if (teams.size >= 2) out.push({ round, status, teams: [...teams] });
  }
  return out;
}

function suffixSafeLast(name: string): string {
  const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv']);
  const parts = name.split(' ').filter(Boolean);
  while (parts.length > 1 && SUFFIXES.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  return parts[parts.length - 1] || name;
}

function rosterFromPerGame(html: string): { player: string; teamId: string; gp: number }[] {
  const $ = cheerio.load(html);
  const out: { player: string; teamId: string; gp: number }[] = [];
  $('table tbody tr').each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass('thead') || $tr.hasClass('over_header')) return;
    const playerCell = $tr.find('[data-stat="player"]');
    const player = (playerCell.find('a').text() || playerCell.text()).replace(/\*/g, '').trim();
    if (!player) return;
    const abbr = $tr.find('[data-stat="team_id"]').text().trim();
    const teamId = resolveTeamId(abbr);
    if (!teamId) return;
    const gp = parseInt($tr.find('[data-stat="g"]').text().trim() || '0', 10) || 0;
    if (gp > 0) out.push({ player, teamId, gp });
  });
  return out;
}

// ── Checks ───────────────────────────────────────────────────────────

async function check1_teamCoverage(year: number, season: string): Promise<CheckResult> {
  const cachePath = CACHE_BRACKET(year);
  if (!fs.existsSync(cachePath)) {
    return {
      name: '1. team_seasons coverage vs BBRef bracket',
      status: 'SKIP',
      detail: `cache missing: ${cachePath}\n     run: npx tsx scripts/scrape-playoff-results.ts --year ${year}`,
    };
  }
  const html = fs.readFileSync(cachePath, 'utf-8');
  const series = bracketSeries(html);
  if (series.length === 0) {
    return { name: '1. team_seasons coverage vs BBRef bracket', status: 'FAIL', detail: 'no series parsed from bracket page' };
  }
  const completedTeams = new Set(series.filter(s => s.status === 'completed').flatMap(s => s.teams));
  const activeTeams = new Set(series.filter(s => s.status === 'active').flatMap(s => s.teams));
  const expected = new Set(completedTeams);

  const { data } = await supabase
    .from('team_seasons')
    .select('team_id, playoff_result')
    .eq('season', season)
    .in('team_id', [...completedTeams, ...activeTeams])
    .not('playoff_result', 'is', null);
  const have = new Set((data || []).map((r: { team_id: string }) => r.team_id));
  const missing = [...expected].filter(t => !have.has(t)).sort();
  const stampedActive = [...activeTeams].filter(t => have.has(t)).sort();

  const activeNote = activeTeams.size > 0
    ? `\n     ${activeTeams.size} team(s) in active series (no stamp expected): ${[...activeTeams].sort().join(', ')}${stampedActive.length > 0 ? `\n     ${stampedActive.length} of those stamped manually: ${stampedActive.join(', ')}` : ''}`
    : '';

  if (missing.length === 0) {
    return {
      name: '1. team_seasons coverage vs BBRef bracket',
      status: 'PASS',
      detail: `${expected.size} completed-series teams all stamped${activeNote}`,
    };
  }
  return {
    name: '1. team_seasons coverage vs BBRef bracket',
    status: 'FAIL',
    detail: `${missing.length} of ${expected.size} completed-series teams missing playoff_result: ${missing.join(', ')}\n     hint: BBRef summary may lag; check cache file or stamp manually${activeNote}`,
    data: { missing },
  };
}

async function check2_playerCoverage(year: number, season: string): Promise<CheckResult> {
  const cachePath = CACHE_PERGAME(year);
  if (!fs.existsSync(cachePath)) {
    return {
      name: '2. player_seasons coverage vs BBRef rosters',
      status: 'SKIP',
      detail: `cache missing: ${cachePath}\n     run: npx tsx scripts/scrape-playoff-stats.ts --year ${year}`,
    };
  }
  const roster = rosterFromPerGame(fs.readFileSync(cachePath, 'utf-8'));
  if (roster.length === 0) {
    return { name: '2. player_seasons coverage vs BBRef rosters', status: 'FAIL', detail: 'roster parse returned 0 rows' };
  }

  const { data } = await supabase
    .from('player_seasons')
    .select('player_name, team_id')
    .eq('season', season)
    .not('playoff_gp', 'is', null);
  const have = new Set((data || []).map((r: { player_name: string; team_id: string }) => `${r.player_name}|${r.team_id}`));
  const missing = roster.filter(r => !have.has(`${r.player}|${r.teamId}`));

  if (missing.length === 0) {
    return { name: '2. player_seasons coverage vs BBRef rosters', status: 'PASS', detail: `all ${roster.length} (player, team) pairs present` };
  }
  return {
    name: '2. player_seasons coverage vs BBRef rosters',
    status: 'FAIL',
    detail: `${missing.length} of ${roster.length} pairs missing playoff stats:\n     ${missing.slice(0, 8).map(m => `${m.player} (${m.teamId})`).join(', ')}${missing.length > 8 ? ` … +${missing.length - 8} more` : ''}`,
    data: { missing },
  };
}

async function check3_noDuplicates(season: string): Promise<CheckResult> {
  const { data } = await supabase
    .from('player_seasons')
    .select('player_name, team_id')
    .eq('season', season)
    .not('playoff_gp', 'is', null);
  const counts = new Map<string, number>();
  for (const r of (data || []) as { player_name: string; team_id: string }[]) {
    const k = `${r.player_name}|${r.team_id}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const dupes = [...counts.entries()].filter(([, n]) => n > 1);
  if (dupes.length === 0) {
    return { name: '3. no duplicate (player, team, season)', status: 'PASS', detail: `${counts.size} unique pairs, no dupes` };
  }
  return {
    name: '3. no duplicate (player, team, season)',
    status: 'FAIL',
    detail: `${dupes.length} duplicates: ${dupes.slice(0, 5).map(([k, n]) => `${k}×${n}`).join(', ')}`,
    data: { dupes },
  };
}

async function check4_noOrphanGameLogs(season: string): Promise<CheckResult> {
  const { data: glRows } = await supabase
    .from('playoff_game_logs')
    .select('player_name, team_id')
    .eq('season', season);
  const glPairs = new Set(((glRows || []) as { player_name: string; team_id: string }[]).map(r => `${r.player_name}|${r.team_id}`));

  const { data: psRows } = await supabase
    .from('player_seasons')
    .select('player_name, team_id')
    .eq('season', season)
    .not('playoff_gp', 'is', null);
  const psPairs = new Set(((psRows || []) as { player_name: string; team_id: string }[]).map(r => `${r.player_name}|${r.team_id}`));

  const orphans = [...glPairs].filter(p => !psPairs.has(p));
  if (orphans.length === 0) {
    return { name: '4. no orphan game logs', status: 'PASS', detail: `${glPairs.size} (player, team) game-log pairs all match player_seasons` };
  }
  return {
    name: '4. no orphan game logs',
    status: 'FAIL',
    detail: `${orphans.length} game-log pairs missing from player_seasons: ${orphans.slice(0, 5).join(', ')}`,
    data: { orphans },
  };
}

async function check5_gameLogCounts(season: string): Promise<CheckResult> {
  const { data: glRows } = await supabase
    .from('playoff_game_logs')
    .select('player_name, team_id')
    .eq('season', season);
  const glCount = new Map<string, number>();
  for (const r of (glRows || []) as { player_name: string; team_id: string }[]) {
    const k = `${r.player_name}|${r.team_id}`;
    glCount.set(k, (glCount.get(k) || 0) + 1);
  }
  if (glCount.size === 0) {
    return {
      name: '5. game_logs row count ≥ Σ(playoff_gp) for refreshed players',
      status: 'SKIP',
      detail: 'no game logs found for season — game-logs scraper not yet run',
    };
  }

  const { data: psRows } = await supabase
    .from('player_seasons')
    .select('player_name, team_id, playoff_gp')
    .eq('season', season)
    .not('playoff_gp', 'is', null);

  const shortfalls: { key: string; gp: number; logs: number }[] = [];
  for (const r of (psRows || []) as { player_name: string; team_id: string; playoff_gp: number }[]) {
    const k = `${r.player_name}|${r.team_id}`;
    if (!glCount.has(k)) continue; // not refreshed for this team — fine
    const logs = glCount.get(k) || 0;
    if (logs < r.playoff_gp) shortfalls.push({ key: k, gp: r.playoff_gp, logs });
  }
  if (shortfalls.length === 0) {
    return { name: '5. game_logs row count ≥ Σ(playoff_gp) for refreshed players', status: 'PASS', detail: `${glCount.size} refreshed players, all log counts ≥ playoff_gp` };
  }
  return {
    name: '5. game_logs row count ≥ Σ(playoff_gp) for refreshed players',
    status: 'FAIL',
    detail: `${shortfalls.length} players with fewer game logs than GP: ${shortfalls.slice(0, 5).map(s => `${s.key} (${s.logs}/${s.gp})`).join(', ')}`,
    data: { shortfalls },
  };
}

async function check6_topFiveAdvisory(season: string): Promise<CheckResult> {
  const { data } = await supabase
    .from('player_seasons')
    .select('player_name, team_id, playoff_gp, playoff_ws')
    .eq('season', season)
    .not('playoff_ws', 'is', null);
  const byTeam = new Map<string, { player_name: string; playoff_gp: number; playoff_ws: number }[]>();
  for (const r of (data || []) as { player_name: string; team_id: string; playoff_gp: number; playoff_ws: number }[]) {
    if (!byTeam.has(r.team_id)) byTeam.set(r.team_id, []);
    byTeam.get(r.team_id)!.push(r);
  }
  const lines: string[] = [];
  for (const [team, rows] of [...byTeam.entries()].sort()) {
    const top5 = rows.sort((a, b) => b.playoff_ws - a.playoff_ws).slice(0, 5);
    lines.push(`     ${team}: ${top5.map(r => `${suffixSafeLast(r.player_name)} ${r.playoff_ws}`).join(', ')}`);
  }
  return { name: '6. top-5 by playoff_ws per team (advisory)', status: 'INFO', detail: `\n${lines.join('\n')}` };
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const yearIdx = args.indexOf('--year');
  if (yearIdx < 0 || !args[yearIdx + 1]) {
    console.error('usage: verify-playoff-data.ts --year YYYY [--json]');
    process.exit(2);
  }
  const year = parseInt(args[yearIdx + 1], 10);
  const season = bbrefSeasonToOurs(year);
  const asJson = args.includes('--json');

  const checks = await Promise.all([
    check1_teamCoverage(year, season),
    check2_playerCoverage(year, season),
    check3_noDuplicates(season),
    check4_noOrphanGameLogs(season),
    check5_gameLogCounts(season),
    check6_topFiveAdvisory(season),
  ]);

  if (asJson) {
    console.log(JSON.stringify({ year, season, checks }, null, 2));
  } else {
    console.log(`\nVerify playoff data — season ${season}\n`);
    for (const c of checks) {
      const tag = c.status === 'PASS' ? '✓ PASS' : c.status === 'FAIL' ? '✗ FAIL' : c.status === 'SKIP' ? '◌ SKIP' : 'ⓘ INFO';
      console.log(`${tag}  ${c.name}`);
      console.log(`     ${c.detail}\n`);
    }
  }

  const failed = checks.filter(c => c.status === 'FAIL').length;
  const skipped = checks.filter(c => c.status === 'SKIP').length;
  if (failed > 0) {
    console.error(`${failed} check(s) FAILED.`);
    process.exit(1);
  }
  if (skipped === checks.length - 1) {
    console.error('All hard checks SKIPPED — cache missing.');
    process.exit(2);
  }
  console.log(`${checks.filter(c => c.status === 'PASS').length} pass, ${skipped} skip.`);
}

main().catch(e => { console.error(e); process.exit(1); });
