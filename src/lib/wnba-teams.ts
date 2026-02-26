/**
 * WNBA team constants.
 *
 * All team IDs are prefixed with "W-" to avoid collisions with NBA team IDs.
 * Use displayTeamId() from league.ts to strip the prefix for UI display.
 *
 * Mirrors the structure of teams.ts for the NBA.
 */

import type { TeamInfo, TeamDisplayInfo } from './teams';

// ── Current WNBA Teams (2025 season) ─────────────────────────────────

export const WNBA_TEAMS: Record<string, TeamInfo> = {
  'W-ATL': { id: 'W-ATL', name: 'Atlanta Dream', city: 'Atlanta', color: '#E31837', secondaryColor: '#0C2340', conference: 'East', division: 'Eastern' },
  'W-CHI': { id: 'W-CHI', name: 'Chicago Sky', city: 'Chicago', color: '#418FDE', secondaryColor: '#FFCD00', conference: 'East', division: 'Eastern' },
  'W-CON': { id: 'W-CON', name: 'Connecticut Sun', city: 'Uncasville', color: '#F05023', secondaryColor: '#0A2240', conference: 'East', division: 'Eastern' },
  'W-DAL': { id: 'W-DAL', name: 'Dallas Wings', city: 'Arlington', color: '#C4D600', secondaryColor: '#002B5C', conference: 'West', division: 'Western' },
  'W-GSV': { id: 'W-GSV', name: 'Golden State Valkyries', city: 'San Francisco', color: '#1D428A', secondaryColor: '#FFC72C', conference: 'West', division: 'Western' },
  'W-IND': { id: 'W-IND', name: 'Indiana Fever', city: 'Indianapolis', color: '#002D62', secondaryColor: '#E03A3E', conference: 'East', division: 'Eastern' },
  'W-LVA': { id: 'W-LVA', name: 'Las Vegas Aces', city: 'Las Vegas', color: '#000000', secondaryColor: '#C4102E', conference: 'West', division: 'Western' },
  'W-LAS': { id: 'W-LAS', name: 'Los Angeles Sparks', city: 'Los Angeles', color: '#552583', secondaryColor: '#FDB927', conference: 'West', division: 'Western' },
  'W-MIN': { id: 'W-MIN', name: 'Minnesota Lynx', city: 'Minneapolis', color: '#236192', secondaryColor: '#78BE20', conference: 'West', division: 'Western' },
  'W-NYL': { id: 'W-NYL', name: 'New York Liberty', city: 'Brooklyn', color: '#86CEBC', secondaryColor: '#000000', conference: 'East', division: 'Eastern' },
  'W-PHO': { id: 'W-PHO', name: 'Phoenix Mercury', city: 'Phoenix', color: '#CB6015', secondaryColor: '#1D1160', conference: 'West', division: 'Western' },
  'W-SEA': { id: 'W-SEA', name: 'Seattle Storm', city: 'Seattle', color: '#2C5234', secondaryColor: '#FEE11A', conference: 'West', division: 'Western' },
  'W-WAS': { id: 'W-WAS', name: 'Washington Mystics', city: 'Washington', color: '#E03A3E', secondaryColor: '#002B5C', conference: 'East', division: 'Eastern' },
};

// ── Defunct WNBA Teams ────────────────────────────────────────────────
// These franchises folded — they are NOT predecessors of current teams.
// Included for historical trade data.

export const WNBA_DEFUNCT_TEAMS: Record<string, TeamInfo> = {
  'W-CHA': { id: 'W-CHA', name: 'Charlotte Sting', city: 'Charlotte', color: '#00778B', secondaryColor: '#F26522', conference: 'East', division: 'Eastern' },
  'W-CLE': { id: 'W-CLE', name: 'Cleveland Rockers', city: 'Cleveland', color: '#002D62', secondaryColor: '#E03A3E', conference: 'East', division: 'Eastern' },
  'W-HOU': { id: 'W-HOU', name: 'Houston Comets', city: 'Houston', color: '#BA0C2F', secondaryColor: '#00338D', conference: 'West', division: 'Western' },
  'W-MIA': { id: 'W-MIA', name: 'Miami Sol', city: 'Miami', color: '#F47B20', secondaryColor: '#00529B', conference: 'East', division: 'Eastern' },
  'W-POR': { id: 'W-POR', name: 'Portland Fire', city: 'Portland', color: '#CE1141', secondaryColor: '#000000', conference: 'West', division: 'Western' },
  'W-SAC': { id: 'W-SAC', name: 'Sacramento Monarchs', city: 'Sacramento', color: '#5A2D81', secondaryColor: '#63727A', conference: 'West', division: 'Western' },
};

// ── Relocated franchise identities ────────────────────────────────────
// These are historical identities of CURRENT franchises (stored under current ID).
// Used by getWnbaTeamDisplayInfo() to show historical names for old trades.

export const WNBA_RELOCATED_TEAMS: Record<string, TeamInfo> = {
  // Utah Starzz (1997-2002) → San Antonio Silver Stars (2003-2013) / Stars (2014-2017) → Las Vegas Aces (2018-)
  'W-UTA': { id: 'W-UTA', name: 'Utah Starzz', city: 'Salt Lake City', color: '#002B5C', secondaryColor: '#F47920', conference: 'West', division: 'Western' },
  'W-SAS': { id: 'W-SAS', name: 'San Antonio Stars', city: 'San Antonio', color: '#C4CED4', secondaryColor: '#000000', conference: 'West', division: 'Western' },
  // Orlando Miracle (1999-2002) → Connecticut Sun (2003-)
  'W-ORL': { id: 'W-ORL', name: 'Orlando Miracle', city: 'Orlando', color: '#0077C0', secondaryColor: '#C4CED4', conference: 'East', division: 'Eastern' },
  // Detroit Shock (1998-2009) → Tulsa Shock (2010-2015) → Dallas Wings (2016-)
  'W-DET': { id: 'W-DET', name: 'Detroit Shock', city: 'Detroit', color: '#C8102E', secondaryColor: '#1D42BA', conference: 'East', division: 'Eastern' },
  'W-TUL': { id: 'W-TUL', name: 'Tulsa Shock', city: 'Tulsa', color: '#E31837', secondaryColor: '#002D62', conference: 'West', division: 'Western' },
};

// ── All WNBA teams (for lookups) ──────────────────────────────────────

export const ALL_WNBA_TEAMS: Record<string, TeamInfo> = {
  ...WNBA_TEAMS,
  ...WNBA_DEFUNCT_TEAMS,
  ...WNBA_RELOCATED_TEAMS,
};

export const WNBA_TEAM_LIST = Object.values(WNBA_TEAMS).sort((a, b) => a.name.localeCompare(b.name));
export const WNBA_EAST_TEAMS = WNBA_TEAM_LIST.filter(t => t.conference === 'East');
export const WNBA_WEST_TEAMS = WNBA_TEAM_LIST.filter(t => t.conference === 'West');

// ── Relocation history (for display) ──────────────────────────────────

interface WnbaTeamRelocation {
  teamId: string;        // Current franchise ID (W-LVA, W-CON, W-DAL)
  cutoffDate: string;    // ISO date — trades BEFORE this use historical info
  historicalName: string;
  historicalAbbreviation: string; // Display abbreviation (no W- prefix)
  historicalColor: string;
  historicalSecondaryColor: string;
}

const WNBA_TEAM_RELOCATIONS: WnbaTeamRelocation[] = [
  // Utah Starzz → San Antonio Silver Stars (2003)
  {
    teamId: 'W-LVA',
    cutoffDate: '2003-01-01',
    historicalName: 'Utah Starzz',
    historicalAbbreviation: 'UTA',
    historicalColor: '#002B5C',
    historicalSecondaryColor: '#F47920',
  },
  // San Antonio Silver Stars/Stars → Las Vegas Aces (2018)
  {
    teamId: 'W-LVA',
    cutoffDate: '2018-01-01',
    historicalName: 'San Antonio Stars',
    historicalAbbreviation: 'SAS',
    historicalColor: '#C4CED4',
    historicalSecondaryColor: '#000000',
  },
  // Orlando Miracle → Connecticut Sun (2003)
  {
    teamId: 'W-CON',
    cutoffDate: '2003-01-01',
    historicalName: 'Orlando Miracle',
    historicalAbbreviation: 'ORL',
    historicalColor: '#0077C0',
    historicalSecondaryColor: '#C4CED4',
  },
  // Detroit Shock → Tulsa Shock (2010)
  {
    teamId: 'W-DAL',
    cutoffDate: '2010-01-01',
    historicalName: 'Detroit Shock',
    historicalAbbreviation: 'DET',
    historicalColor: '#C8102E',
    historicalSecondaryColor: '#1D42BA',
  },
  // Tulsa Shock → Dallas Wings (2016)
  {
    teamId: 'W-DAL',
    cutoffDate: '2016-01-01',
    historicalName: 'Tulsa Shock',
    historicalAbbreviation: 'TUL',
    historicalColor: '#E31837',
    historicalSecondaryColor: '#002D62',
  },
];

/**
 * Returns the display name, abbreviation, and colors for a WNBA team on a
 * given trade date. For relocated franchises, returns the historical identity.
 */
export function getWnbaTeamDisplayInfo(teamId: string, tradeDate?: string | null): TeamDisplayInfo {
  const base = ALL_WNBA_TEAMS[teamId];
  const stripPrefix = (id: string) => id.startsWith('W-') ? id.slice(2) : id;

  const fallback: TeamDisplayInfo = {
    name: base?.name || stripPrefix(teamId),
    abbreviation: stripPrefix(teamId),
    color: base?.color || '#666666',
    secondaryColor: base?.secondaryColor || '#888888',
  };

  if (!tradeDate) return fallback;

  // Find the most recent relocation that the trade predates
  const relocations = WNBA_TEAM_RELOCATIONS
    .filter((r) => r.teamId === teamId)
    .sort((a, b) => b.cutoffDate.localeCompare(a.cutoffDate)); // newest first

  for (const relocation of relocations) {
    if (tradeDate < relocation.cutoffDate) {
      return {
        name: relocation.historicalName,
        abbreviation: relocation.historicalAbbreviation,
        color: relocation.historicalColor,
        secondaryColor: relocation.historicalSecondaryColor,
      };
    }
  }

  return fallback;
}
