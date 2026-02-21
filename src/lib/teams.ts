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
  BKN: { id: 'BKN', name: 'Brooklyn Nets', city: 'Brooklyn', color: '#000000', secondaryColor: '#FFFFFF', conference: 'East', division: 'Atlantic' },
  CHA: { id: 'CHA', name: 'Charlotte Hornets', city: 'Charlotte', color: '#1D1160', secondaryColor: '#00788C', conference: 'East', division: 'Southeast' },
  CHI: { id: 'CHI', name: 'Chicago Bulls', city: 'Chicago', color: '#CE1141', secondaryColor: '#000000', conference: 'East', division: 'Central' },
  CLE: { id: 'CLE', name: 'Cleveland Cavaliers', city: 'Cleveland', color: '#860038', secondaryColor: '#FDBB30', conference: 'East', division: 'Central' },
  DAL: { id: 'DAL', name: 'Dallas Mavericks', city: 'Dallas', color: '#00538C', secondaryColor: '#002B5E', conference: 'West', division: 'Southwest' },
  DEN: { id: 'DEN', name: 'Denver Nuggets', city: 'Denver', color: '#0E2240', secondaryColor: '#FEC524', conference: 'West', division: 'Northwest' },
  DET: { id: 'DET', name: 'Detroit Pistons', city: 'Detroit', color: '#C8102E', secondaryColor: '#1D42BA', conference: 'East', division: 'Central' },
  GSW: { id: 'GSW', name: 'Golden State Warriors', city: 'San Francisco', color: '#1D428A', secondaryColor: '#FFC72C', conference: 'West', division: 'Pacific' },
  HOU: { id: 'HOU', name: 'Houston Rockets', city: 'Houston', color: '#CE1141', secondaryColor: '#000000', conference: 'West', division: 'Southwest' },
  IND: { id: 'IND', name: 'Indiana Pacers', city: 'Indianapolis', color: '#002D62', secondaryColor: '#FDBB30', conference: 'East', division: 'Central' },
  LAC: { id: 'LAC', name: 'LA Clippers', city: 'Los Angeles', color: '#C8102E', secondaryColor: '#1D428A', conference: 'West', division: 'Pacific' },
  LAL: { id: 'LAL', name: 'Los Angeles Lakers', city: 'Los Angeles', color: '#552583', secondaryColor: '#FDB927', conference: 'West', division: 'Pacific' },
  MEM: { id: 'MEM', name: 'Memphis Grizzlies', city: 'Memphis', color: '#5D76A9', secondaryColor: '#12173F', conference: 'West', division: 'Southwest' },
  MIA: { id: 'MIA', name: 'Miami Heat', city: 'Miami', color: '#98002E', secondaryColor: '#F9A01B', conference: 'East', division: 'Southeast' },
  MIL: { id: 'MIL', name: 'Milwaukee Bucks', city: 'Milwaukee', color: '#00471B', secondaryColor: '#EEE1C6', conference: 'East', division: 'Central' },
  MIN: { id: 'MIN', name: 'Minnesota Timberwolves', city: 'Minneapolis', color: '#0C2340', secondaryColor: '#236192', conference: 'West', division: 'Northwest' },
  NOP: { id: 'NOP', name: 'New Orleans Pelicans', city: 'New Orleans', color: '#0C2340', secondaryColor: '#C8102E', conference: 'West', division: 'Southwest' },
  NYK: { id: 'NYK', name: 'New York Knicks', city: 'New York', color: '#006BB6', secondaryColor: '#F58426', conference: 'East', division: 'Atlantic' },
  OKC: { id: 'OKC', name: 'Oklahoma City Thunder', city: 'Oklahoma City', color: '#007AC1', secondaryColor: '#EF3B24', conference: 'West', division: 'Northwest' },
  ORL: { id: 'ORL', name: 'Orlando Magic', city: 'Orlando', color: '#0077C0', secondaryColor: '#C4CED4', conference: 'East', division: 'Southeast' },
  PHI: { id: 'PHI', name: 'Philadelphia 76ers', city: 'Philadelphia', color: '#006BB6', secondaryColor: '#ED174C', conference: 'East', division: 'Atlantic' },
  PHX: { id: 'PHX', name: 'Phoenix Suns', city: 'Phoenix', color: '#1D1160', secondaryColor: '#E56020', conference: 'West', division: 'Pacific' },
  POR: { id: 'POR', name: 'Portland Trail Blazers', city: 'Portland', color: '#E03A3E', secondaryColor: '#000000', conference: 'West', division: 'Northwest' },
  SAC: { id: 'SAC', name: 'Sacramento Kings', city: 'Sacramento', color: '#5A2D81', secondaryColor: '#63727A', conference: 'West', division: 'Pacific' },
  SAS: { id: 'SAS', name: 'San Antonio Spurs', city: 'San Antonio', color: '#C4CED4', secondaryColor: '#000000', conference: 'West', division: 'Southwest' },
  TOR: { id: 'TOR', name: 'Toronto Raptors', city: 'Toronto', color: '#CE1141', secondaryColor: '#000000', conference: 'East', division: 'Atlantic' },
  UTA: { id: 'UTA', name: 'Utah Jazz', city: 'Salt Lake City', color: '#002B5C', secondaryColor: '#00471B', conference: 'West', division: 'Northwest' },
  WAS: { id: 'WAS', name: 'Washington Wizards', city: 'Washington', color: '#002B5C', secondaryColor: '#E31837', conference: 'East', division: 'Southeast' },
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

const TEAM_RELOCATIONS: TeamRelocation[] = [
  // Seattle SuperSonics → Oklahoma City Thunder (2008-09 season)
  {
    teamId: 'OKC',
    cutoffDate: '2008-07-01',
    historicalName: 'Seattle SuperSonics',
    historicalAbbreviation: 'SEA',
    historicalColor: '#00653A',
    historicalSecondaryColor: '#FFC200',
  },
  // Vancouver Grizzlies → Memphis Grizzlies (2001-02 season)
  {
    teamId: 'MEM',
    cutoffDate: '2001-07-01',
    historicalName: 'Vancouver Grizzlies',
    historicalAbbreviation: 'VAN',
    historicalColor: '#00B2A9',
    historicalSecondaryColor: '#1D1160',
  },
  // New Jersey Nets → Brooklyn Nets (2012-13 season)
  {
    teamId: 'BKN',
    cutoffDate: '2012-07-01',
    historicalName: 'New Jersey Nets',
    historicalAbbreviation: 'NJN',
    historicalColor: '#002A60',
    historicalSecondaryColor: '#FFFFFF',
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

  const relocation = TEAM_RELOCATIONS.find((r) => r.teamId === teamId);
  if (!relocation) return fallback;

  if (tradeDate < relocation.cutoffDate) {
    return {
      name: relocation.historicalName,
      abbreviation: relocation.historicalAbbreviation,
      color: relocation.historicalColor,
      secondaryColor: relocation.historicalSecondaryColor,
    };
  }

  return fallback;
}
