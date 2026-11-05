/**
 * GitHub issue #45, Category C: trade titles and topAssets that still name a
 * draftee from a SWAP year. The 2026-03-29 title refresh ran against
 * trade_scores rows that credited the pick a team drafted in a swap year
 * (e.g. the Harden-to-Brooklyn trade titled "Jarrett Allen, Amen Thompson,
 * Jalen Green" — Thompson and Green are Houston's OWN 2023/2021 picks; the
 * Nets swap rights those years never conveyed). The asset rows and scores were
 * fixed in #64/#66; the derived title/topAssets strings were not.
 *
 * Detection: for every swap asset, the draftee of (year, round, original team)
 * and of (year, round, receiving team) is a phantom unless the trade's own
 * assets legitimately name him. A title or topAssets entry carrying a phantom
 * gets rebuilt from the CURRENT trade_scores row, using the same rules as
 * reorder-titles.ts (top 3 names by WS) and enrich-top-assets.ts (best asset
 * sent from each team, WS-sorted). Only affected trades are touched, so trade
 * slugs elsewhere stay put.
 *
 * Usage:
 *   npx tsx scripts/fix-swap-year-titles.ts            # dry run
 *   npx tsx scripts/fix-swap-year-titles.ts --write    # write season files, then run rebuild-index.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { supabase } from './lib/supabase-admin';

const SEASON_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');
const DRAFT_FILE = path.join(__dirname, '..', 'public', 'data', 'draft-ownership.json');
const write = process.argv.includes('--write');

interface AssetScore { name: string; type: string; ws: number }
interface TradeScoreRow { trade_id: string; team_scores: Record<string, { score: number; assets: AssetScore[] }> }
interface StaticAsset {
  type: 'player' | 'pick' | 'swap' | 'cash';
  player_name: string | null;
  from_team_id: string | null;
  to_team_id: string | null;
  pick_year: number | null;
  pick_round: number | null;
  original_team_id: string | null;
  became_player_name: string | null;
}
interface StaticTrade {
  id: string; date: string; title: string; description?: string;
  teams: { team_id: string }[];
  assets: StaticAsset[];
  topAssets?: string[];
}

const JUNK = ['trade exception', 'cash consideration', 'did not convey', '-rd pick', 'pick is', 'pick swap'];

async function fetchScores(): Promise<Map<string, TradeScoreRow>> {
  const out = new Map<string, TradeScoreRow>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('trade_scores').select('trade_id, team_scores').range(from, from + 999);
    if (error) throw error;
    for (const r of (data ?? []) as TradeScoreRow[]) out.set(r.trade_id, r);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return out;
}

/**
 * Names the trade vouches for: players and resolved draftees on the asset rows,
 * plus any "(X was later selected)" BBRef wrote into the description — the
 * description is the source the asset rows were parsed from, so a name it
 * carries is real even when enrichment hasn't landed it on a row yet.
 */
function legitNames(trade: StaticTrade): Set<string> {
  const names = trade.assets.flatMap((a) => [a.player_name, a.became_player_name]).filter((n): n is string => !!n);
  for (const m of (trade.description ?? '').matchAll(/\(([^()]+) was later selected\)/g)) names.push(m[1]);
  return new Set(names);
}

function titleFromScores(row: TradeScoreRow | undefined, trade: StaticTrade): string {
  const legit = legitNames(trade);
  const seen = new Map<string, number>();
  for (const team of Object.values(row?.team_scores ?? {})) {
    for (const a of team.assets ?? []) {
      if (!a.name) continue;
      const lower = a.name.toLowerCase();
      if (JUNK.some((j) => lower.includes(j))) continue;
      // trade_scores can lag the asset rows (it is rebuilt weekly); a scored
      // name the assets don't vouch for is stale, never a title candidate.
      if (!legit.has(a.name)) continue;
      if (a.ws > (seen.get(a.name) ?? -Infinity)) seen.set(a.name, a.ws);
    }
  }
  const names = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
  if (names.length > 0) return `${names.join(', ')} Trade`;
  // No usable scores: the scraper's own rule — first three players, then draftees.
  const players = trade.assets.filter((a) => a.type === 'player' && a.player_name).map((a) => a.player_name!);
  const draftees = trade.assets.filter((a) => a.type === 'pick' && a.became_player_name).map((a) => a.became_player_name!);
  const fallback = [...players, ...draftees].slice(0, 3);
  return fallback.length > 0 ? `${fallback.join(', ')} Trade` : `${trade.teams.map((t) => t.team_id).join(' / ')} Trade`;
}

function topAssetsFromScores(row: TradeScoreRow | undefined, trade: StaticTrade): string[] {
  const legit = legitNames(trade);
  const bestReceived = new Map<string, { name: string; ws: number }>();
  for (const [team, data] of Object.entries(row?.team_scores ?? {})) {
    const vouched = (data.assets ?? []).filter((a) => a.name && legit.has(a.name));
    if (!vouched.length) continue;
    const best = vouched.reduce((a, b) => (b.ws > a.ws ? b : a), vouched[0]);
    bestReceived.set(team, { name: best.name, ws: best.ws });
  }
  const teamIds = trade.teams.map((t) => t.team_id);
  const perTeam = teamIds.map((fromTeamId) => {
    let bestName = '';
    let bestWs = -Infinity;
    for (const other of teamIds.filter((t) => t !== fromTeamId)) {
      const got = bestReceived.get(other);
      if (got && got.ws > bestWs) { bestWs = got.ws; bestName = got.name; }
    }
    if (bestName) return { name: bestName, ws: bestWs };
    const cands: { name: string; priority: number }[] = [];
    for (const a of trade.assets) {
      if (a.from_team_id !== fromTeamId) continue;
      if (a.type === 'player' && a.player_name) cands.push({ name: a.player_name, priority: 1 });
      else if (a.type === 'pick' && a.became_player_name) cands.push({ name: a.became_player_name, priority: 2 });
    }
    cands.sort((a, b) => a.priority - b.priority);
    return { name: cands[0]?.name ?? '', ws: 0 };
  });
  perTeam.sort((a, b) => b.ws - a.ws);
  return perTeam.map((p) => p.name);
}

async function main() {
  const scores = await fetchScores();
  const draft = JSON.parse(fs.readFileSync(DRAFT_FILE, 'utf-8')) as { year: number; round: number; original_team: string; player: string }[];
  const draftee = new Map<string, string>();
  for (const d of draft) draftee.set(`${d.year}-${d.round}-${d.original_team}`, d.player);

  let fixed = 0;
  for (const file of fs.readdirSync(SEASON_DIR).filter((f) => f.endsWith('.json'))) {
    const filePath = path.join(SEASON_DIR, file);
    const trades = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as StaticTrade[];
    let changed = false;

    for (const t of trades) {
      const legit = legitNames(t);
      const phantoms = new Set<string>();
      for (const a of t.assets) {
        if (a.type !== 'swap' || !a.pick_year) continue;
        for (const team of [a.original_team_id ?? a.from_team_id, a.to_team_id]) {
          const name = draftee.get(`${a.pick_year}-${a.pick_round}-${team}`);
          if (name && !legit.has(name)) phantoms.add(name);
        }
      }
      if (phantoms.size === 0) continue;
      // Any title/topAssets name the asset rows don't vouch for counts, not
      // only the draft-table phantoms — the stale score row may have named a
      // draftee our draft lookup can't reproduce (e.g. a renegotiated swap).
      const titleNames = t.title.replace(/\s+Trade$/i, '').split(', ').filter(Boolean);
      const titleHit = titleNames.some((n) => phantoms.has(n) || !legit.has(n));
      const topHit = (t.topAssets ?? []).some((n) => n && (phantoms.has(n) || !legit.has(n)));
      if (!titleHit && !topHit) continue;

      const row = scores.get(t.id);
      const newTitle = titleFromScores(row, t);
      const newTop = topAssetsFromScores(row, t);
      console.log(`${t.date} ${t.id}`);
      console.log(`  phantoms : ${[...phantoms].join(', ')}`);
      console.log(`  title    : "${t.title}" → "${newTitle}"`);
      console.log(`  topAssets: ${JSON.stringify(t.topAssets ?? [])} → ${JSON.stringify(newTop)}`);
      const stillBad = [...phantoms].filter((p) => newTitle.includes(p) || newTop.includes(p));
      if (stillBad.length) console.log(`  ⚠ trade_scores still credits ${stillBad.join(', ')} — re-run score-trades.ts first`);
      t.title = newTitle;
      t.topAssets = newTop;
      changed = true;
      fixed++;
    }

    if (changed && write) fs.writeFileSync(filePath, JSON.stringify(trades, null, 2));
  }

  console.log(`\n${fixed} trade(s) ${write ? 'rewritten' : 'would change (dry run)'}`);
  if (write && fixed > 0) {
    console.log('Rebuilding index.json...');
    execSync('npx tsx scripts/rebuild-index.ts', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
