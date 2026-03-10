export interface TeamInfo {
  id: string;
  name: string;
  city: string;
  color: string;
  secondaryColor: string;
  conference: 'East' | 'West';
  division: string;
}

export const TEAMS: Record<string, TeamInfo> = {
  ATL: { id: 'ATL', name: 'Atlanta Hawks', city: 'Atlanta', color: '#E03A3E', secondaryColor: '#C1D32F', conference: 'East', division: 'Southeast' },
  BOS: { id: 'BOS', name: 'Boston Celtics', city: 'Boston', color: '#007A33', secondaryColor: '#BA9653', conference: 'East', division: 'Atlantic' },
  BKN: { id: 'BKN', name: 'Brooklyn Nets', city: 'Brooklyn', color: '#A1A1A4', secondaryColor: '#000000', conference: 'East', division: 'Atlantic' },
  CHA: { id: 'CHA', name: 'Charlotte Hornets', city: 'Charlotte', color: '#00788C', secondaryColor: '#1D1160', conference: 'East', division: 'Southeast' },
  CHI: { id: 'CHI', name: 'Chicago Bulls', city: 'Chicago', color: '#CE1141', secondaryColor: '#000000', conference: 'East', division: 'Central' },
  CLE: { id: 'CLE', name: 'Cleveland Cavaliers', city: 'Cleveland', color: '#860038', secondaryColor: '#FDBB30', conference: 'East', division: 'Central' },
  DAL: { id: 'DAL', name: 'Dallas Mavericks', city: 'Dallas', color: '#00538C', secondaryColor: '#002B5E', conference: 'West', division: 'Southwest' },
  DEN: { id: 'DEN', name: 'Denver Nuggets', city: 'Denver', color: '#FEC524', secondaryColor: '#0E2240', conference: 'West', division: 'Northwest' },
  DET: { id: 'DET', name: 'Detroit Pistons', city: 'Detroit', color: '#C8102E', secondaryColor: '#1D42BA', conference: 'East', division: 'Central' },
  GSW: { id: 'GSW', name: 'Golden State Warriors', city: 'San Francisco', color: '#FFC72C', secondaryColor: '#1D428A', conference: 'West', division: 'Pacific' },
  HOU: { id: 'HOU', name: 'Houston Rockets', city: 'Houston', color: '#CE1141', secondaryColor: '#000000', conference: 'West', division: 'Southwest' },
  IND: { id: 'IND', name: 'Indiana Pacers', city: 'Indianapolis', color: '#FDBB30', secondaryColor: '#002D62', conference: 'East', division: 'Central' },
  LAC: { id: 'LAC', name: 'LA Clippers', city: 'Los Angeles', color: '#C8102E', secondaryColor: '#1D428A', conference: 'West', division: 'Pacific' },
  LAL: { id: 'LAL', name: 'Los Angeles Lakers', city: 'Los Angeles', color: '#552583', secondaryColor: '#FDB927', conference: 'West', division: 'Pacific' },
  MEM: { id: 'MEM', name: 'Memphis Grizzlies', city: 'Memphis', color: '#5D76A9', secondaryColor: '#12173F', conference: 'West', division: 'Southwest' },
  MIA: { id: 'MIA', name: 'Miami Heat', city: 'Miami', color: '#98002E', secondaryColor: '#F9A01B', conference: 'East', division: 'Southeast' },
  MIL: { id: 'MIL', name: 'Milwaukee Bucks', city: 'Milwaukee', color: '#00471B', secondaryColor: '#EEE1C6', conference: 'East', division: 'Central' },
  MIN: { id: 'MIN', name: 'Minnesota Timberwolves', city: 'Minneapolis', color: '#236192', secondaryColor: '#0C2340', conference: 'West', division: 'Northwest' },
  NOP: { id: 'NOP', name: 'New Orleans Pelicans', city: 'New Orleans', color: '#C8102E', secondaryColor: '#0C2340', conference: 'West', division: 'Southwest' },
  NYK: { id: 'NYK', name: 'New York Knicks', city: 'New York', color: '#006BB6', secondaryColor: '#F58426', conference: 'East', division: 'Atlantic' },
  OKC: { id: 'OKC', name: 'Oklahoma City Thunder', city: 'Oklahoma City', color: '#007AC1', secondaryColor: '#EF3B24', conference: 'West', division: 'Northwest' },
  ORL: { id: 'ORL', name: 'Orlando Magic', city: 'Orlando', color: '#0077C0', secondaryColor: '#C4CED4', conference: 'East', division: 'Southeast' },
  PHI: { id: 'PHI', name: 'Philadelphia 76ers', city: 'Philadelphia', color: '#006BB6', secondaryColor: '#ED174C', conference: 'East', division: 'Atlantic' },
  PHX: { id: 'PHX', name: 'Phoenix Suns', city: 'Phoenix', color: '#E56020', secondaryColor: '#1D1160', conference: 'West', division: 'Pacific' },
  POR: { id: 'POR', name: 'Portland Trail Blazers', city: 'Portland', color: '#E03A3E', secondaryColor: '#000000', conference: 'West', division: 'Northwest' },
  SAC: { id: 'SAC', name: 'Sacramento Kings', city: 'Sacramento', color: '#5A2D81', secondaryColor: '#63727A', conference: 'West', division: 'Pacific' },
  SAS: { id: 'SAS', name: 'San Antonio Spurs', city: 'San Antonio', color: '#C4CED4', secondaryColor: '#000000', conference: 'West', division: 'Southwest' },
  TOR: { id: 'TOR', name: 'Toronto Raptors', city: 'Toronto', color: '#CE1141', secondaryColor: '#000000', conference: 'East', division: 'Atlantic' },
  UTA: { id: 'UTA', name: 'Utah Jazz', city: 'Salt Lake City', color: '#F9A01B', secondaryColor: '#002B5C', conference: 'West', division: 'Northwest' },
  WAS: { id: 'WAS', name: 'Washington Wizards', city: 'Washington', color: '#E31837', secondaryColor: '#002B5C', conference: 'East', division: 'Southeast' },
};

export const TEAM_LIST = Object.values(TEAMS).sort((a, b) => a.name.localeCompare(b.name));
export const EAST_TEAMS = TEAM_LIST.filter(t => t.conference === 'East');
export const WEST_TEAMS = TEAM_LIST.filter(t => t.conference === 'West');

// ---------------------------------------------------------------------------
// Historical display layer — teams stored under their current ID but displayed
// with their historical name/abbreviation for trades before relocation.
// ---------------------------------------------------------------------------

export interface TeamDisplayInfo {
  name: string;
  abbreviation: string;
  color: string;
  secondaryColor: string;
}

interface TeamRelocation {
  teamId: string;      // ID used in our data (current franchise ID)
  cutoffDate: string;  // ISO date string — trades BEFORE this use historical info
  historicalName: string;
  historicalAbbreviation: string;
  historicalColor: string;
  historicalSecondaryColor: string;
}

// Multiple entries per team are allowed — sorted newest cutoff first per team
// so the lookup finds the right era. Display-only: no impact on data or scoring.
const TEAM_RELOCATIONS: TeamRelocation[] = [
  // Seattle SuperSonics → Oklahoma City Thunder (2008-09)
  {
    teamId: 'OKC',
    cutoffDate: '2008-07-01',
    historicalName: 'Seattle SuperSonics',
    historicalAbbreviation: 'SEA',
    historicalColor: '#00653A',
    historicalSecondaryColor: '#FFC200',
  },
  // Vancouver Grizzlies → Memphis Grizzlies (2001-02)
  {
    teamId: 'MEM',
    cutoffDate: '2001-07-01',
    historicalName: 'Vancouver Grizzlies',
    historicalAbbreviation: 'VAN',
    historicalColor: '#00B2A9',
    historicalSecondaryColor: '#1D1160',
  },
  // New Jersey Nets → Brooklyn Nets (2012-13)
  {
    teamId: 'BKN',
    cutoffDate: '2012-07-01',
    historicalName: 'New Jersey Nets',
    historicalAbbreviation: 'NJN',
    historicalColor: '#A1A1A4',
    historicalSecondaryColor: '#002A60',
  },
  // New Orleans Jazz → Utah Jazz (1979-80)
  {
    teamId: 'UTA',
    cutoffDate: '1979-07-01',
    historicalName: 'New Orleans Jazz',
    historicalAbbreviation: 'NOJ',
    historicalColor: '#6F2DA8',
    historicalSecondaryColor: '#FFC72C',
  },
  // San Diego Clippers → LA Clippers (1984-85)
  {
    teamId: 'LAC',
    cutoffDate: '1984-07-01',
    historicalName: 'San Diego Clippers',
    historicalAbbreviation: 'SDC',
    historicalColor: '#FF6B00',
    historicalSecondaryColor: '#1D428A',
  },
  // Buffalo Braves → San Diego Clippers (1978-79)
  {
    teamId: 'LAC',
    cutoffDate: '1978-07-01',
    historicalName: 'Buffalo Braves',
    historicalAbbreviation: 'BUF',
    historicalColor: '#FF8C00',
    historicalSecondaryColor: '#000000',
  },
  // Kansas City Kings → Sacramento Kings (1985-86)
  {
    teamId: 'SAC',
    cutoffDate: '1985-07-01',
    historicalName: 'Kansas City Kings',
    historicalAbbreviation: 'KCK',
    historicalColor: '#4A90D9',
    historicalSecondaryColor: '#FFFFFF',
  },
  // Washington Bullets → Washington Wizards (1997-98)
  {
    teamId: 'WAS',
    cutoffDate: '1997-07-01',
    historicalName: 'Washington Bullets',
    historicalAbbreviation: 'WSB',
    historicalColor: '#E31837',
    historicalSecondaryColor: '#002B5C',
  },
  // New Orleans Hornets → New Orleans Pelicans (2013-14)
  {
    teamId: 'NOP',
    cutoffDate: '2013-07-01',
    historicalName: 'New Orleans Hornets',
    historicalAbbreviation: 'NOH',
    historicalColor: '#00838F',
    historicalSecondaryColor: '#6F2DA8',
  },
  // Charlotte Bobcats → Charlotte Hornets (2014-15)
  {
    teamId: 'CHA',
    cutoffDate: '2014-07-01',
    historicalName: 'Charlotte Bobcats',
    historicalAbbreviation: 'CHA',
    historicalColor: '#F26532',
    historicalSecondaryColor: '#1D1160',
  },
];

/**
 * Returns the display name, abbreviation, and colors for a team on a given
 * trade date. For relocated franchises, returns the historical identity for
 * trades that predate the move.
 */
export function getTeamDisplayInfo(teamId: string, tradeDate?: string | null): TeamDisplayInfo {
  const base = TEAMS[teamId];
  const fallback: TeamDisplayInfo = {
    name: base?.name || teamId,
    abbreviation: teamId,
    color: base?.color || '#666666',
    secondaryColor: base?.secondaryColor || '#888888',
  };

  if (!tradeDate) return fallback;

  // Find all relocations for this team.
  // For multi-era teams (e.g. LAC: Buffalo→San Diego→LA), find the era
  // whose cutoff is closest to (but still after) the trade date.
  const relocations = TEAM_RELOCATIONS.filter((r) => r.teamId === teamId);
  if (relocations.length === 0) return fallback;

  // Sort by cutoff ascending — walk forward through eras
  const sorted = relocations.sort((a, b) => a.cutoffDate.localeCompare(b.cutoffDate));
  // Find the oldest cutoff the trade predates — that's the correct era.
  // e.g. LAC cutoffs: 1978 (BUF), 1984 (SDC). A 1977 trade < 1978 → BUF.
  // A 1983 trade >= 1978 but < 1984 → SDC. A 1990 trade >= both → current (LAC).
  for (const rel of sorted) {
    if (tradeDate < rel.cutoffDate) {
      return {
        name: rel.historicalName,
        abbreviation: rel.historicalAbbreviation,
        color: rel.historicalColor,
        secondaryColor: rel.historicalSecondaryColor,
      };
    }
  }

  return fallback;
}

// ── Unified team lookup (NBA + WNBA) ─────────────────────────────────
// Lazy-loaded to avoid circular imports. WNBA teams are looked up
// only when a W- prefixed team ID is encountered.

let _allTeams: Record<string, TeamInfo> | null = null;

function getAllTeams(): Record<string, TeamInfo> {
  if (_allTeams) return _allTeams;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ALL_WNBA_TEAMS } = require('./wnba-teams');
  const merged = { ...TEAMS, ...ALL_WNBA_TEAMS };
  _allTeams = merged;
  return merged;
}

/**
 * Look up any team (NBA or WNBA) by ID.
 * Falls back to WNBA teams if the ID starts with "W-".
 */
export function getAnyTeam(teamId: string): TeamInfo | undefined {
  return TEAMS[teamId] || getAllTeams()[teamId];
}

/**
 * Unified display info for any team (NBA or WNBA).
 * Delegates to the correct league's relocation logic.
 */
export function getAnyTeamDisplayInfo(teamId: string, tradeDate?: string | null): TeamDisplayInfo {
  if (teamId.startsWith('W-')) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getWnbaTeamDisplayInfo } = require('./wnba-teams');
    return getWnbaTeamDisplayInfo(teamId, tradeDate);
  }
  return getTeamDisplayInfo(teamId, tradeDate);
}
