/**
 * League type and utilities.
 *
 * Both NBA and WNBA data coexist in the same Supabase schema,
 * differentiated by a `league` column. Static JSON files live in
 * separate directories: /data/trades/ (NBA) and /data/wnba/trades/ (WNBA).
 */

export type League = 'NBA' | 'WNBA';

/** WNBA team IDs are prefixed with "W-" to avoid collisions with NBA team IDs. */
export const WNBA_TEAM_PREFIX = 'W-';

/** Check if a team ID belongs to the WNBA */
export function isWnbaTeam(teamId: string): boolean {
  return teamId.startsWith(WNBA_TEAM_PREFIX);
}

/** Strip the W- prefix for display purposes */
export function displayTeamId(teamId: string): string {
  if (teamId.startsWith(WNBA_TEAM_PREFIX)) {
    return teamId.slice(WNBA_TEAM_PREFIX.length);
  }
  return teamId;
}

/** Get the league for a team ID */
export function leagueForTeam(teamId: string): League {
  return isWnbaTeam(teamId) ? 'WNBA' : 'NBA';
}

/**
 * WNBA seasons are a single calendar year (e.g., "2024").
 * NBA seasons span two years (e.g., "2023-24").
 */
export function isWnbaSeason(season: string): boolean {
  return /^\d{4}$/.test(season);
}

/** Convert a date to a WNBA season string. WNBA plays May–Sep within one year. */
export function dateToWnbaSeason(dateStr: string): string {
  const d = new Date(dateStr);
  return String(d.getFullYear());
}

/** Base path for static trade JSON by league */
export function tradeDataBasePath(league: League): string {
  return league === 'WNBA' ? '/data/wnba/trades' : '/data/trades';
}
