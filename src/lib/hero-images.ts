// Shared hero image builder for card image routes.
// Returns top 2 player headshot URLs per team from the NBA CDN.

import { NBA_PLAYER_IDS } from '@/lib/nba-player-ids';
import type { TeamScoreEntry } from '@/lib/card-templates';

const NBA_HEADSHOT = (id: number) =>
  `https://cdn.nba.com/headshots/nba/latest/1040x760/${id}.png`;

/** Return up to 2 headshot URLs per team, ordered by score descending. */
export function buildHeroImages(
  teamScores: Record<string, TeamScoreEntry>,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [teamId, ts] of Object.entries(teamScores)) {
    if (!ts.assets.length) continue;
    const sorted = [...ts.assets]
      .filter((a) => a.type === 'player')
      .sort((a, b) => b.score - a.score);
    const urls: string[] = [];
    for (const asset of sorted) {
      const nbaId = NBA_PLAYER_IDS[asset.name];
      if (nbaId) {
        urls.push(NBA_HEADSHOT(nbaId));
        if (urls.length >= 2) break;
      }
    }
    if (urls.length > 0) {
      result[teamId] = urls;
    }
  }
  return result;
}
