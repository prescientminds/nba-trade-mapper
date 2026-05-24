/**
 * Current-roster overlay.
 *
 * Kaggle's `player_seasons` table and the salary scraper both publish on
 * external cadences that lag mid-season trades by weeks-to-months. The
 * trade JSON in `public/data/trades/by-season/` is daily-fresh, so we
 * walk it to derive a `normalized_player_name → current_team_id` map.
 * Callers apply the override when filtering or grouping by team.
 *
 * Why a separate layer instead of writing back into the DB: Kaggle's
 * eventual update will re-publish authoritative split rows. We don't
 * want to fight that — we want the overlay to be transparent and let
 * the source data win once it catches up.
 */
import { CURRENT_SEASON } from './trade-builder';

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

let overlayCache: Map<string, string> | null = null;
let overlayPromise: Promise<Map<string, string>> | null = null;

export async function loadCurrentRosterOverlay(): Promise<Map<string, string>> {
  if (overlayCache) return overlayCache;
  if (overlayPromise) return overlayPromise;
  overlayPromise = fetch(`/data/trades/by-season/${CURRENT_SEASON}.json`)
    .then((r) => r.json() as Promise<Trade[]>)
    .then((trades) => {
      const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
      const overlay = new Map<string, string>();
      for (const t of sorted) {
        for (const asset of t.assets ?? []) {
          if (asset.type === 'player' && asset.player_name && asset.to_team_id) {
            overlay.set(normalizeName(asset.player_name), asset.to_team_id);
          }
        }
      }
      overlayCache = overlay;
      return overlay;
    });
  return overlayPromise;
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

/** Returns the player's current team_id after applying trade overrides. */
export function currentTeamOf(
  playerName: string,
  sourceTeamId: string | null,
  overlay: Map<string, string>,
): string | null {
  return overlay.get(normalizeName(playerName)) ?? sourceTeamId;
}
