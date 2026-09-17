/**
 * Current-roster overlay.
 *
 * Roster membership comes from `player_contracts` for CURRENT_SEASON — BBRef's
 * contracts page lists every player under the team he is signed with today.
 * Two things still lag it: (1) rows added by the historical player-page pass
 * can carry a stale team, and (2) BBRef publishes on its own cadence. The
 * static JSON in `public/data/` is daily-fresh, so we walk it and derive a
 * `normalized_player_name → current team` map that wins over the source row:
 *   - trades in CURRENT_SEASON + NEXT_SEASON files (player → to_team_id)
 *   - transactions in CURRENT_SEASON file: signings / two-way / Exhibit 10 /
 *     claims put a player ON a team; waivers and retirements take him OFF
 *     (team = null). Latest event by date wins; same-day sign-then-waive
 *     resolves to waived.
 *
 * Why a separate layer instead of writing back into the DB: the next salary
 * scrape re-publishes authoritative rows. We don't want to fight that — the
 * overlay is transparent and the source data wins once it catches up.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { CURRENT_SEASON, NEXT_SEASON, prevSeason } from './trade-builder';

interface TradeAsset {
  type: string;
  player_name?: string | null;
  from_team_id?: string | null;
  to_team_id?: string | null;
}

interface Trade {
  id: string;
  date: string;
  season: string;
  assets: TradeAsset[];
}

interface Transaction {
  date: string;
  transaction_type: string;
  player_name: string | null;
  team_id: string | null;
}

export interface OverlayEntry {
  /** null = off every roster (waived / retired) as of the last event. */
  teamId: string | null;
  /** Display name as it appears in the source JSON. */
  name: string;
  date: string;
}

export type RosterOverlay = Map<string, OverlayEntry>;

const ON_ROSTER = new Set(['signing', 'two_way', 'exhibit_10', 'claimed', '10_day', 'rest_of_season', 'converted']);
const OFF_ROSTER = new Set(['waiver', 'retirement']);

let overlayCache: RosterOverlay | null = null;
let overlayPromise: Promise<RosterOverlay> | null = null;

async function fetchJsonOrEmpty<T>(url: string): Promise<T[]> {
  try {
    const r = await fetch(url);
    return r.ok ? ((await r.json()) as T[]) : [];
  } catch {
    return [];
  }
}

export async function loadCurrentRosterOverlay(): Promise<RosterOverlay> {
  if (overlayCache) return overlayCache;
  if (overlayPromise) return overlayPromise;
  overlayPromise = Promise.all([
    fetchJsonOrEmpty<Trade>(`/data/trades/by-season/${CURRENT_SEASON}.json`),
    fetchJsonOrEmpty<Trade>(`/data/trades/by-season/${NEXT_SEASON}.json`),
    fetchJsonOrEmpty<Transaction>(`/data/transactions/by-season/${CURRENT_SEASON}.json`),
  ]).then(([curTrades, nextTrades, transactions]) => {
    // Flatten to one event stream. `order` breaks same-day ties: a player
    // signed and waived on the same date ends up waived.
    type Ev = { date: string; order: number; name: string; teamId: string | null };
    const events: Ev[] = [];
    for (const t of [...curTrades, ...nextTrades]) {
      for (const a of t.assets ?? []) {
        if (a.type === 'player' && a.player_name && a.to_team_id) {
          events.push({ date: t.date, order: 1, name: a.player_name, teamId: a.to_team_id });
        }
      }
    }
    for (const tx of transactions) {
      if (!tx.player_name) continue;
      if (ON_ROSTER.has(tx.transaction_type) && tx.team_id) {
        events.push({ date: tx.date, order: 0, name: tx.player_name, teamId: tx.team_id });
      } else if (OFF_ROSTER.has(tx.transaction_type)) {
        events.push({ date: tx.date, order: 2, name: tx.player_name, teamId: null });
      }
    }
    events.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
    const overlay: RosterOverlay = new Map();
    for (const e of events) {
      overlay.set(normalizeName(e.name), { teamId: e.teamId, name: e.name, date: e.date });
    }
    overlayCache = overlay;
    return overlay;
  });
  return overlayPromise;
}

/**
 * The most recent season with `player_seasons` rows. In the offseason the
 * CBA is already on CURRENT_SEASON but no games have been played, so stats
 * come from the prior season until Kaggle publishes the new one. Cached per
 * page load.
 */
let statsSeasonPromise: Promise<string> | null = null;
export function resolveStatsSeason(sb: SupabaseClient): Promise<string> {
  if (statsSeasonPromise) return statsSeasonPromise;
  statsSeasonPromise = (async () => {
    const { count } = await sb.from('player_seasons').select('*', { count: 'exact', head: true }).eq('season', CURRENT_SEASON);
    return count && count > 0 ? CURRENT_SEASON : prevSeason(CURRENT_SEASON);
  })();
  return statsSeasonPromise;
}

/**
 * Normalize a player name for cross-source matching. Trade JSON, Kaggle's
 * player_seasons, and the salary scrape each handle name variations
 * differently. We strip:
 *   - diacritics (Dončić → doncic)
 *   - punctuation (A.J. → aj, O'Neal → oneal)
 *   - common generational suffixes (Bagley III → bagley)
 *   - extra whitespace
 * so all three converge on the same key.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')          // combining diacritics
    .replace(/[.,'`]/g, '')         // punctuation
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '') // generational suffixes
    .replace(/\s+/g, ' ')           // collapse whitespace
    .trim();
}

/**
 * Returns the player's current team_id after applying overlay overrides.
 * `null` means the overlay knows he is off every roster (waived/retired);
 * an absent overlay entry falls through to the source row's team.
 */
export function currentTeamOf(
  playerName: string,
  sourceTeamId: string | null,
  overlay: RosterOverlay,
): string | null {
  const hit = overlay.get(normalizeName(playerName));
  return hit ? hit.teamId : sourceTeamId;
}
