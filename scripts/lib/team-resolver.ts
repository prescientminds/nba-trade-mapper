/**
 * Shared BBRef abbreviation -> our team_id mapping.
 * Basketball Reference uses different abbreviations than our schema.
 */

// BBRef abbreviation -> our team_id
const BBREF_TO_TEAM_ID: Record<string, string> = {
  // Current teams (BBRef uses these)
  ATL: 'ATL',
  BOS: 'BOS',
  BRK: 'BKN', // BBRef uses BRK for Brooklyn
  BKN: 'BKN',
  CHA: 'CHA',
  CHI: 'CHI',
  CLE: 'CLE',
  DAL: 'DAL',
  DEN: 'DEN',
  DET: 'DET',
  GSW: 'GSW',
  HOU: 'HOU',
  IND: 'IND',
  LAC: 'LAC',
  LAL: 'LAL',
  MEM: 'MEM',
  MIA: 'MIA',
  MIL: 'MIL',
  MIN: 'MIN',
  NOP: 'NOP',
  NYK: 'NYK',
  OKC: 'OKC',
  ORL: 'ORL',
  PHI: 'PHI',
  PHO: 'PHX', // BBRef uses PHO for Phoenix
  PHX: 'PHX',
  POR: 'POR',
  SAC: 'SAC',
  SAS: 'SAS',
  TOR: 'TOR',
  UTA: 'UTA',
  WAS: 'WAS',

  // Historical franchise relocations/renames
  NJN: 'BKN',  // New Jersey Nets -> Brooklyn Nets
  SEA: 'OKC',  // Seattle SuperSonics -> OKC Thunder
  VAN: 'MEM',  // Vancouver Grizzlies -> Memphis Grizzlies
  CHH: 'CHA',  // Charlotte Hornets (original) -> Charlotte
  CHO: 'CHA',  // Another BBRef code for Charlotte
  NOH: 'NOP',  // New Orleans Hornets -> Pelicans
  NOK: 'NOP',  // New Orleans/Oklahoma City Hornets
  WSB: 'WAS',  // Washington Bullets -> Wizards
  KCK: 'SAC',  // Kansas City Kings -> Sacramento
  SDC: 'LAC',  // San Diego Clippers -> LA Clippers
  BUF: 'LAC',  // Buffalo Braves -> Clippers
  CAP: 'WAS',  // Capital Bullets
  BAL: 'WAS',  // Baltimore Bullets
  CIN: 'SAC',  // Cincinnati Royals
  SDR: 'HOU',  // San Diego Rockets
  KCO: 'SAC',  // Kansas City-Omaha Kings
  NOJ: 'UTA',  // New Orleans Jazz
};

// Teams to skip (multi-team season totals, non-NBA)
const SKIP_TEAMS = new Set(['TOT']);

/**
 * Resolve a BBRef team abbreviation to our schema's team_id.
 * Returns null if the team should be skipped (e.g., TOT) or is unrecognized.
 */
export function resolveTeamId(bbrefAbbr: string): string | null {
  if (!bbrefAbbr) return null;
  const trimmed = bbrefAbbr.trim().toUpperCase();
  if (SKIP_TEAMS.has(trimmed)) return null;
  return BBREF_TO_TEAM_ID[trimmed] || null;
}

/**
 * Convert a BBRef season string (e.g., "2020") to our format (e.g., "2019-20").
 * BBRef seasons are listed by end year (2020 = the 2019-20 season).
 */
export function bbrefSeasonToOurs(endYear: number | string): string {
  const year = typeof endYear === 'string' ? parseInt(endYear) : endYear;
  const startYear = year - 1;
  const endShort = String(year).slice(2);
  return `${startYear}-${endShort}`;
}

/**
 * Full team name → team_id mapping.
 * BBRef transaction pages use full names like "Los Angeles Lakers".
 */
const FULL_NAME_TO_TEAM_ID: Record<string, string> = {
  'Atlanta Hawks': 'ATL',
  'Boston Celtics': 'BOS',
  'Brooklyn Nets': 'BKN',
  'Charlotte Hornets': 'CHA',
  'Chicago Bulls': 'CHI',
  'Cleveland Cavaliers': 'CLE',
  'Dallas Mavericks': 'DAL',
  'Denver Nuggets': 'DEN',
  'Detroit Pistons': 'DET',
  'Golden State Warriors': 'GSW',
  'Houston Rockets': 'HOU',
  'Indiana Pacers': 'IND',
  'Los Angeles Clippers': 'LAC',
  'LA Clippers': 'LAC',
  'Los Angeles Lakers': 'LAL',
  'Memphis Grizzlies': 'MEM',
  'Miami Heat': 'MIA',
  'Milwaukee Bucks': 'MIL',
  'Minnesota Timberwolves': 'MIN',
  'New Orleans Pelicans': 'NOP',
  'New York Knicks': 'NYK',
  'Oklahoma City Thunder': 'OKC',
  'Orlando Magic': 'ORL',
  'Philadelphia 76ers': 'PHI',
  'Phoenix Suns': 'PHX',
  'Portland Trail Blazers': 'POR',
  'Sacramento Kings': 'SAC',
  'San Antonio Spurs': 'SAS',
  'Toronto Raptors': 'TOR',
  'Utah Jazz': 'UTA',
  'Washington Wizards': 'WAS',
  // Historical
  'New Jersey Nets': 'BKN',
  'Seattle SuperSonics': 'OKC',
  'Vancouver Grizzlies': 'MEM',
  'Charlotte Bobcats': 'CHA',
  'New Orleans Hornets': 'NOP',
  'New Orleans/Oklahoma City Hornets': 'NOP',
  'Washington Bullets': 'WAS',
  'Kansas City Kings': 'SAC',
  'San Diego Clippers': 'LAC',
  'Buffalo Braves': 'LAC',
  'Capital Bullets': 'WAS',
  'Baltimore Bullets': 'WAS',
  'Cincinnati Royals': 'SAC',
  'San Diego Rockets': 'HOU',
  'Kansas City-Omaha Kings': 'SAC',
  'New Orleans Jazz': 'UTA',
};

/**
 * Resolve a full team name (as seen in BBRef transaction prose) to our team_id.
 */
export function resolveFullTeamName(name: string): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (FULL_NAME_TO_TEAM_ID[trimmed]) return FULL_NAME_TO_TEAM_ID[trimmed];
  // Fallback: try as abbreviation
  return resolveTeamId(trimmed);
}

/**
 * Convert a date string to our season format.
 * NBA season: Jul-Jun. Dates July+ = next season.
 */
export function dateToSeason(dateStr: string): string {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  if (month >= 7) {
    return `${year}-${String(year + 1).slice(2)}`;
  }
  return `${year - 1}-${String(year).slice(2)}`;
}
