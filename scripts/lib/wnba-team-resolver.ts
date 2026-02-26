/**
 * WNBA BBRef abbreviation → our team_id mapping.
 *
 * Basketball Reference uses the same abbreviations for WNBA teams as we'd
 * expect (ATL, CHI, etc.), but our schema prefixes WNBA IDs with "W-"
 * to avoid collisions with NBA team IDs.
 *
 * Mirrors team-resolver.ts for NBA.
 */

// BBRef WNBA abbreviation → our W- prefixed team_id
const WNBA_BBREF_TO_TEAM_ID: Record<string, string> = {
  // ── Current teams ──────────────────────────────────────────────────
  ATL: 'W-ATL',   // Atlanta Dream (2008-)
  CHI: 'W-CHI',   // Chicago Sky (2006-)
  CON: 'W-CON',   // Connecticut Sun (2003-)
  DAL: 'W-DAL',   // Dallas Wings (2016-)
  GSV: 'W-GSV',   // Golden State Valkyries (2025-)
  IND: 'W-IND',   // Indiana Fever (2000-)
  LVA: 'W-LVA',   // Las Vegas Aces (2018-)
  LAS: 'W-LAS',   // Los Angeles Sparks (1997-)
  MIN: 'W-MIN',   // Minnesota Lynx (1999-)
  NYL: 'W-NYL',   // New York Liberty (1997-)
  PHO: 'W-PHO',   // Phoenix Mercury (1997-)
  SEA: 'W-SEA',   // Seattle Storm (2000-)
  WAS: 'W-WAS',   // Washington Mystics (1998-)

  // ── Defunct teams ──────────────────────────────────────────────────
  CHA: 'W-CHA',   // Charlotte Sting (1997-2006) — folded
  CLE: 'W-CLE',   // Cleveland Rockers (1997-2003) — folded
  HOU: 'W-HOU',   // Houston Comets (1997-2008) — folded
  MIA: 'W-MIA',   // Miami Sol (2000-2002) — folded
  POR: 'W-POR',   // Portland Fire (2000-2002) — folded
  SAC: 'W-SAC',   // Sacramento Monarchs (1997-2009) — folded

  // ── Historical relocations (map to current franchise ID) ───────────
  UTA: 'W-LVA',   // Utah Starzz (1997-2002) → San Antonio → Las Vegas Aces
  SAS: 'W-LVA',   // San Antonio Silver Stars/Stars (2003-2017) → Las Vegas Aces
  ORL: 'W-CON',   // Orlando Miracle (1999-2002) → Connecticut Sun
  DET: 'W-DAL',   // Detroit Shock (1998-2009) → Tulsa → Dallas Wings
  TUL: 'W-DAL',   // Tulsa Shock (2010-2015) → Dallas Wings
};

// Teams to skip (multi-team season totals)
const SKIP_TEAMS = new Set(['TOT']);

/**
 * Resolve a BBRef WNBA team abbreviation to our schema's team_id.
 * Returns null if the team should be skipped or is unrecognized.
 */
export function resolveWnbaTeamId(bbrefAbbr: string): string | null {
  if (!bbrefAbbr) return null;
  const trimmed = bbrefAbbr.trim().toUpperCase();
  if (SKIP_TEAMS.has(trimmed)) return null;
  return WNBA_BBREF_TO_TEAM_ID[trimmed] || null;
}

/**
 * Full WNBA team name → team_id mapping.
 * BBRef transaction pages use full names like "Los Angeles Sparks".
 */
const WNBA_FULL_NAME_TO_TEAM_ID: Record<string, string> = {
  // Current teams
  'Atlanta Dream': 'W-ATL',
  'Chicago Sky': 'W-CHI',
  'Connecticut Sun': 'W-CON',
  'Dallas Wings': 'W-DAL',
  'Golden State Valkyries': 'W-GSV',
  'Indiana Fever': 'W-IND',
  'Las Vegas Aces': 'W-LVA',
  'Los Angeles Sparks': 'W-LAS',
  'Minnesota Lynx': 'W-MIN',
  'New York Liberty': 'W-NYL',
  'Phoenix Mercury': 'W-PHO',
  'Seattle Storm': 'W-SEA',
  'Washington Mystics': 'W-WAS',

  // Defunct teams
  'Charlotte Sting': 'W-CHA',
  'Cleveland Rockers': 'W-CLE',
  'Houston Comets': 'W-HOU',
  'Miami Sol': 'W-MIA',
  'Portland Fire': 'W-POR',
  'Sacramento Monarchs': 'W-SAC',

  // Historical / relocated identities
  'Utah Starzz': 'W-LVA',
  'San Antonio Silver Stars': 'W-LVA',
  'San Antonio Stars': 'W-LVA',
  'Orlando Miracle': 'W-CON',
  'Detroit Shock': 'W-DAL',
  'Tulsa Shock': 'W-DAL',
};

/**
 * Resolve a full WNBA team name to our team_id.
 */
export function resolveWnbaFullTeamName(name: string): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (WNBA_FULL_NAME_TO_TEAM_ID[trimmed]) return WNBA_FULL_NAME_TO_TEAM_ID[trimmed];
  // Fallback: try as abbreviation
  return resolveWnbaTeamId(trimmed);
}

/**
 * Convert a BBRef WNBA season year (e.g., 2024) to our format.
 * WNBA seasons are a single calendar year, so the format is just "2024".
 */
export function bbrefWnbaSeasonToOurs(year: number | string): string {
  return String(typeof year === 'string' ? parseInt(year) : year);
}

/**
 * Convert a date string to a WNBA season.
 * WNBA plays May–September within a single calendar year.
 * Off-season transactions (Oct–Apr) count toward the upcoming season.
 */
export function dateToWnbaSeason(dateStr: string): string {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  // Trades from Oct–Dec belong to next year's WNBA season
  if (month >= 10) {
    return String(year + 1);
  }
  return String(year);
}
