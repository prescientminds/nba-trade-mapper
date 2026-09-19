/**
 * List the top-N trades by |lopsidedness|, filtered to those that exist in static JSON.
 *
 *   npx tsx scripts/list-top-trades.ts            # top 100 (default)
 *   npx tsx scripts/list-top-trades.ts 150         # top 150
 *   npx tsx scripts/list-top-trades.ts 100 --dump  # dump as JSON array
 */

import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';

const TRADES_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');

interface StaticTrade {
  id: string;
  date: string;
  season: string;
  title: string;
  description: string;
  teams: { team_id: string; role: string }[];
  assets: Array<{
    type: 'player' | 'pick' | 'swap' | 'cash';
    player_name: string | null;
    from_team_id: string | null;
    to_team_id: string | null;
    pick_year: number | null;
    pick_round: number | null;
    became_player_name: string | null;
    notes: string | null;
  }>;
}

interface ScoreRow {
  trade_id: string;
  winner: string | null;
  lopsidedness: number | null;
}

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function loadStaticTrades(): Map<string, StaticTrade> {
  const byId = new Map<string, StaticTrade>();
  const files = fs.readdirSync(TRADES_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json');
  for (const f of files) {
    const raw = fs.readFileSync(path.join(TRADES_DIR, f), 'utf-8');
    const arr: StaticTrade[] = JSON.parse(raw);
    for (const t of arr) byId.set(t.id, t);
  }
  return byId;
}

async function main() {
  const N = parseInt(process.argv[2] ?? '100', 10);
  const dump = process.argv.includes('--dump');

  const [scores, staticById] = await Promise.all([
    fetchAll<ScoreRow>('trade_scores', 'trade_id, winner, lopsidedness'),
    Promise.resolve(loadStaticTrades()),
  ]);
  console.error(`Loaded ${scores.length} score rows, ${staticById.size} static trades.`);

  // Filter to trades that exist in static JSON, sort by |lopsidedness| desc.
  const valid = scores
    .filter((s) => s.lopsidedness !== null && staticById.has(s.trade_id))
    .map((s) => ({
      trade_id: s.trade_id,
      lopsidedness: s.lopsidedness!,
      abs: Math.abs(s.lopsidedness!),
      winner: s.winner,
    }))
    .sort((a, b) => b.abs - a.abs)
    .slice(0, N);

  console.error(`Returning top ${valid.length} trades (filtered from ${scores.length} rows).`);

  if (dump) {
    const out = valid.map((v) => {
      const t = staticById.get(v.trade_id)!;
      return {
        trade_id: v.trade_id,
        lopsidedness: v.lopsidedness,
        winner: v.winner,
        date: t.date,
        season: t.season,
        title: t.title,
        description: t.description,
        teams: t.teams.map((tt) => tt.team_id),
        assets: t.assets.map((a) => ({
          type: a.type,
          player: a.player_name,
          from: a.from_team_id,
          to: a.to_team_id,
          pick: a.pick_year ? `${a.pick_year} R${a.pick_round} (${a.became_player_name ?? '?'})` : null,
        })),
      };
    });
    console.log(JSON.stringify(out, null, 2));
  } else {
    for (let i = 0; i < valid.length; i++) {
      const v = valid[i];
      const t = staticById.get(v.trade_id)!;
      console.log(
        `${String(i + 1).padStart(3)}. ${t.date}  |lop|=${v.abs.toFixed(1).padStart(6)}  winner=${(v.winner ?? '?').padEnd(3)}  ${t.title}`
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
