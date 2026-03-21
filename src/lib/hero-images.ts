// Shared hero image builder for card image routes.
// Returns top player headshot URLs per team from the NBA CDN.

import { NBA_PLAYER_IDS } from '@/lib/nba-player-ids';
import type { TeamScoreEntry } from '@/lib/card-templates';

const NBA_HEADSHOT = (id: number) =>
  `https://cdn.nba.com/headshots/nba/latest/1040x760/${id}.png`;

// ── Name resolution ─────────────────────────────────────────
// Trade data names don't always match the NBA player ID dictionary.
// Try multiple normalizations before giving up.

const NAME_ALIASES: Record<string, string> = {
  // Suffix mismatches (trade data has suffix, IDs don't)
  'Glen Rice Sr.': 'Glen Rice',
  'Tim Hardaway Sr.': 'Tim Hardaway',
  'Patrick Ewing Sr.': 'Patrick Ewing',
  'Larry Nance Sr.': 'Larry Nance',
  'Anthony Mason Sr.': 'Anthony Mason',
  'Wes Matthews Sr.': 'Wes Matthews',
  'John Lucas Sr.': 'John Lucas',
  'Jim Paxson Jr.': 'Jim Paxson',
  'Xavier Tillman Sr.': 'Xavier Tillman',
  'Mike Dunleavy Jr.': 'Mike Dunleavy',
  // Trade data missing suffix that IDs have
  'Andre Jackson': 'Andre Jackson Jr.',
  'DaRon Holmes': 'DaRon Holmes II',
  'Dennis Smith': 'Dennis Smith Jr.',
  'Derrick Walton': 'Derrick Walton Jr.',
  'Danuel House': 'Danuel House Jr.',
  'Frank Mason': 'Frank Mason III',
  'Harry Giles': 'Harry Giles III',
  'James Ennis': 'James Ennis III',
  'Kevin Knox': 'Kevin Knox II',
  'Marvin Bagley': 'Marvin Bagley III',
  'Otto Porter': 'Otto Porter Jr.',
  'Reggie Bullock': 'Reggie Bullock Jr.',
  'Robert Williams': 'Robert Williams III',
  'Robert Woodard': 'Robert Woodard II',
  'Vince Williams': 'Vince Williams Jr.',
  // Nicknames / name variants
  'Nene Hilario': 'Nene',
  'Enes Kanter': 'Enes Freedom',
  'Mohamed Bamba': 'Mo Bamba',
  'Fat Lever': 'Lafayette Lever',
  'World B. Free': 'World Free',
  'Sviatoslav Mykhailiuk': 'Svi Mykhailiuk',
  'Bobby Hansen': 'Bob Hansen',
  'Danny Schayes': 'Dan Schayes',
  'Jonathan Simmons': 'Jonathon Simmons',
  'Juan Hernangomez': 'Juancho Hernangomez',
  'Carlton Carrington': 'Bub Carrington',
  'Clarence Weatherspoon': 'Clar. Weatherspoon',
  'D.J. Augustine': 'D.J. Augustin',
  'Jimmy Butler': 'Jimmy Butler III',
  'Marcus Morris': 'Marcus Morris Sr.',
};

/** Strip diacritics: é→e, ö→o, etc. */
function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Remove periods from initials: J.R. → JR, O.G. → OG */
function stripPeriods(s: string): string {
  return s.replace(/\.(\s?)/g, '$1').trim();
}

/** Resolve a trade-data player name to an NBA player ID. */
function resolvePlayerId(name: string): number | undefined {
  // 1. Exact match
  if (NBA_PLAYER_IDS[name]) return NBA_PLAYER_IDS[name];
  // 2. Explicit alias
  const alias = NAME_ALIASES[name];
  if (alias && NBA_PLAYER_IDS[alias]) return NBA_PLAYER_IDS[alias];
  // 3. Strip suffix (Sr., Jr., III, II, IV)
  const stripped = name.replace(/\s+(Sr\.|Jr\.|III|II|IV)$/i, '');
  if (stripped !== name && NBA_PLAYER_IDS[stripped]) return NBA_PLAYER_IDS[stripped];
  // 4. Strip diacritics
  const ascii = stripDiacritics(name);
  if (ascii !== name && NBA_PLAYER_IDS[ascii]) return NBA_PLAYER_IDS[ascii];
  // 5. Strip periods from initials
  const noPeriods = stripPeriods(name);
  if (noPeriods !== name && NBA_PLAYER_IDS[noPeriods]) return NBA_PLAYER_IDS[noPeriods];
  // 6. Diacritics + periods combined
  const both = stripPeriods(stripDiacritics(name));
  if (both !== name && NBA_PLAYER_IDS[both]) return NBA_PLAYER_IDS[both];
  // 7. Try adding diacritics the other way (trade data ASCII, IDs have diacritics)
  //    This is handled by checking all IDs against stripped diacritics — expensive but rare.
  //    Skip for now; the alias map covers the high-value cases.
  return undefined;
}

/** Return up to `max` headshot URLs per team, ordered by score descending. */
export function buildHeroImages(
  teamScores: Record<string, TeamScoreEntry>,
  max = 3,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [teamId, ts] of Object.entries(teamScores)) {
    if (!ts.assets.length) continue;
    const sorted = [...ts.assets]
      .sort((a, b) => b.score - a.score);
    const urls: string[] = [];
    for (const asset of sorted) {
      const nbaId = resolvePlayerId(asset.name);
      if (nbaId) {
        urls.push(NBA_HEADSHOT(nbaId));
        if (urls.length >= max) break;
      }
    }
    if (urls.length > 0) {
      result[teamId] = urls;
    }
  }
  return result;
}
