/* eslint-disable @next/next/no-img-element */
// ── Shareable card templates for OG image generation (Satori / next-og) ──
//
// Three format-specific layouts: OG (1200×630), Square (1080×1080), Story (1080×1920).
// Each section has the team's darkened color as background — the card is FILLED,
// not mostly black. Score is the dominant element. Content is vertically centered.
// Satori constraints: flexbox only, no grid, no pseudo-elements, no transforms.

import { getVerdict } from '@/lib/verdicts';

// ── Team data (lightweight, Edge-safe) ──────────────────────────

export const CARD_TEAM_COLORS: Record<string, string> = {
  ATL: '#E03A3E', BOS: '#007A33', BKN: '#A1A1A4', CHA: '#00788C',
  CHI: '#CE1141', CLE: '#860038', DAL: '#00538C', DEN: '#0D2240',
  DET: '#C8102E', GSW: '#006BB6', HOU: '#CE1141', IND: '#002D62',
  LAC: '#C8102E', LAL: '#552583', MEM: '#5D76A9', MIA: '#98002E',
  MIL: '#00471B', MIN: '#0C2340', NOP: '#0C2340', NYK: '#006BB6',
  OKC: '#007AC1', ORL: '#0077C0', PHI: '#006BB6', PHX: '#E56020',
  POR: '#E03A3E', SAC: '#5A2D81', SAS: '#C4CED4', TOR: '#CE1141',
  UTA: '#002B5C', WAS: '#002B5C',
  SEA: '#00843D', NJN: '#002A60', VAN: '#00B2A9', NOH: '#002B5C',
  NOK: '#002B5C', WSB: '#E31837', CHH: '#1D1160', SDC: '#ED174C',
  KCK: '#C8102E', BUF: '#003DA5',
  'W-LVA': '#000000', 'W-NYL': '#6ECEB2', 'W-SEA': '#2C5234',
  'W-MIN': '#236192', 'W-CHI': '#418FDE', 'W-IND': '#002D62',
  'W-PHX': '#CB6015', 'W-LAX': '#552583', 'W-CON': '#002D62',
  'W-ATL': '#C8102E', 'W-DAL': '#C4D600', 'W-WAS': '#C8102E',
  'W-GSV': '#00A94F',
};

export const CARD_TEAM_SECONDARY: Record<string, string> = {
  ATL: '#C1D32F', BOS: '#BA9653', BKN: '#000000', CHA: '#1D1160',
  CHI: '#000000', CLE: '#FDBB30', DAL: '#002B5E', DEN: '#FEC524',
  DET: '#1D42BA', GSW: '#1D428A', HOU: '#000000', IND: '#FDBB30',
  LAC: '#1D428A', LAL: '#FDB927', MEM: '#12173F', MIA: '#F9A01B',
  MIL: '#EEE1C6', MIN: '#236192', NOP: '#C8102E', NYK: '#F58426',
  OKC: '#EF3B24', ORL: '#C4CED4', PHI: '#ED174C', PHX: '#1D1160',
  POR: '#000000', SAC: '#63727A', SAS: '#000000', TOR: '#000000',
  UTA: '#F9A01B', WAS: '#E31837',
  SEA: '#FFC200', NJN: '#000000', VAN: '#003F5C', NOH: '#002B5C',
  NOK: '#002B5C', WSB: '#002B5C', CHH: '#00788C', SDC: '#1D428A',
  KCK: '#1D428A', BUF: '#E31837',
  'W-LVA': '#C4CED4', 'W-NYL': '#000000', 'W-SEA': '#FFC200',
  'W-MIN': '#78BE20', 'W-CHI': '#FFCD00', 'W-IND': '#E03A3E',
  'W-PHX': '#1D1160', 'W-LAX': '#FDB927', 'W-CON': '#C8102E',
  'W-ATL': '#418FDE', 'W-DAL': '#002B5C', 'W-WAS': '#002B5C',
  'W-GSV': '#1D428A',
};

const TEAM_NICK: Record<string, string> = {
  ATL: 'Hawks', BOS: 'Celtics', BKN: 'Nets', CHA: 'Hornets',
  CHI: 'Bulls', CLE: 'Cavaliers', DAL: 'Mavericks', DEN: 'Nuggets',
  DET: 'Pistons', GSW: 'Warriors', HOU: 'Rockets', IND: 'Pacers',
  LAC: 'Clippers', LAL: 'Lakers', MEM: 'Grizzlies', MIA: 'Heat',
  MIL: 'Bucks', MIN: 'Timberwolves', NOP: 'Pelicans', NYK: 'Knicks',
  OKC: 'Thunder', ORL: 'Magic', PHI: '76ers', PHX: 'Suns',
  POR: 'Blazers', SAC: 'Kings', SAS: 'Spurs', TOR: 'Raptors',
  UTA: 'Jazz', WAS: 'Wizards',
  SEA: 'SuperSonics', NJN: 'Nets', VAN: 'Grizzlies', NOH: 'Hornets',
  NOK: 'Hornets', WSB: 'Bullets', CHH: 'Hornets', SDC: 'Clippers',
  KCK: 'Kings', BUF: 'Braves',
  'W-LVA': 'Aces', 'W-NYL': 'Liberty', 'W-SEA': 'Storm',
  'W-MIN': 'Lynx', 'W-CHI': 'Sky', 'W-IND': 'Fever',
  'W-PHX': 'Mercury', 'W-LAX': 'Sparks', 'W-CON': 'Sun',
  'W-ATL': 'Dream', 'W-DAL': 'Wings', 'W-WAS': 'Mystics',
  'W-GSV': 'Valkyries',
};

const TEAM_CITY: Record<string, string> = {
  ATL: 'Atlanta', BOS: 'Boston', BKN: 'Brooklyn', CHA: 'Charlotte',
  CHI: 'Chicago', CLE: 'Cleveland', DAL: 'Dallas', DEN: 'Denver',
  DET: 'Detroit', GSW: 'Golden State', HOU: 'Houston', IND: 'Indiana',
  LAC: 'LA', LAL: 'LA', MEM: 'Memphis', MIA: 'Miami',
  MIL: 'Milwaukee', MIN: 'Minnesota', NOP: 'New Orleans', NYK: 'New York',
  OKC: 'OKC', ORL: 'Orlando', PHI: 'Philadelphia', PHX: 'Phoenix',
  POR: 'Portland', SAC: 'Sacramento', SAS: 'San Antonio', TOR: 'Toronto',
  UTA: 'Utah', WAS: 'Washington',
  SEA: 'Seattle', NJN: 'New Jersey', VAN: 'Vancouver', NOH: 'New Orleans',
  NOK: 'New Orleans', WSB: 'Washington', CHH: 'Charlotte', SDC: 'San Diego',
  KCK: 'Kansas City', BUF: 'Buffalo',
  'W-LVA': 'Las Vegas', 'W-NYL': 'New York', 'W-SEA': 'Seattle',
  'W-MIN': 'Minnesota', 'W-CHI': 'Chicago', 'W-IND': 'Indiana',
  'W-PHX': 'Phoenix', 'W-LAX': 'Los Angeles', 'W-CON': 'Connecticut',
  'W-ATL': 'Atlanta', 'W-DAL': 'Dallas', 'W-WAS': 'Washington',
  'W-GSV': 'Bay Area',
};

// ── Helpers ─────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(s: string): string {
  const p = s.split('-');
  if (p.length < 3) return s;
  return `${MONTHS[parseInt(p[1], 10) - 1]} ${parseInt(p[2], 10)}, ${p[0]}`;
}

function fmt(n: number): string {
  if (n === 0) return '0.0';
  if (Math.abs(n) >= 100) return Math.round(n).toString();
  return n.toFixed(1);
}

function hexToRgba(hex: string, alpha: number): string {
  const c = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function darkenHex(hex: string, amount: number): string {
  const c = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = Math.round(parseInt(c.slice(0, 2), 16) * (1 - amount));
  const g = Math.round(parseInt(c.slice(2, 4), 16) * (1 - amount));
  const b = Math.round(parseInt(c.slice(4, 6), 16) * (1 - amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ── Card helpers ────────────────────────────────────────────────

function buildHeadline(teamScores: Record<string, TeamScoreEntry>): string {
  let bestName = '';
  let bestScore = -Infinity;
  let bestTeam = '';
  for (const [teamId, ts] of Object.entries(teamScores)) {
    for (const asset of ts.assets) {
      if (asset.type === 'player' && asset.score > bestScore) {
        bestScore = asset.score;
        bestName = asset.name;
        bestTeam = teamId;
      }
    }
  }
  if (!bestName) return '';
  const city = TEAM_CITY[bestTeam] || TEAM_NICK[bestTeam] || bestTeam;
  return `${bestName.toUpperCase()} TO ${city.toUpperCase()}`;
}

function verdictText(winner: string | null, lopsidedness: number): string {
  return getVerdict(winner, lopsidedness);
}

function compressAccolades(accolades: string[], maxItems = 3): string[] {
  if (!accolades.length) return [];
  const groups: Record<string, number> = {};
  for (const a of accolades) {
    let key = a;
    if (a.startsWith('All-NBA')) key = 'All-NBA';
    else if (a.startsWith('All-Defensive')) key = 'All-Def';
    else if (a.startsWith('All-Rookie')) key = 'All-Rookie';
    groups[key] = (groups[key] || 0) + 1;
  }
  const priority = ['MVP', 'Finals MVP', 'DPOY', 'ROY', 'All-Star', 'All-NBA', 'All-Def', 'MIP', 'Sixth Man', 'All-Rookie'];
  const sorted = Object.entries(groups).sort((a, b) => {
    const ai = priority.indexOf(a[0]);
    const bi = priority.indexOf(b[0]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return sorted.slice(0, maxItems).map(([label, count]) =>
    count > 1 ? `${count}\u00d7 ${label}` : label
  );
}

function pillColor(text: string): { bg: string; fg: string } {
  const t = text.toLowerCase();
  if (t.includes('mvp')) return { bg: 'rgba(249,199,79,0.4)', fg: '#fcd34d' };
  if (t.includes('dpoy')) return { bg: 'rgba(78,205,196,0.4)', fg: '#5eead4' };
  if (t.includes('all-star')) return { bg: 'rgba(155,93,229,0.4)', fg: '#c084fc' };
  if (t.includes('all-nba')) return { bg: 'rgba(255,107,53,0.4)', fg: '#fb923c' };
  if (t.includes('roy')) return { bg: 'rgba(6,214,160,0.4)', fg: '#34d399' };
  if (t.includes('all-def')) return { bg: 'rgba(78,205,196,0.35)', fg: '#5eead4' };
  if (t.includes('champ')) return { bg: 'rgba(249,199,79,0.4)', fg: '#fcd34d' };
  return { bg: 'rgba(255,255,255,0.18)', fg: 'rgba(255,255,255,0.8)' };
}

// ── Skin system ─────────────────────────────────────────────────

export type CardSkin = 'classic' | 'holographic' | 'insideStuff' | 'nbaJam';

interface CardSkinConfig {
  cardBg: string;
  sectionBg: (teamColor: string) => string;
  sectionBorder: string;
  teamNameColor: string;
  accentBarBg: () => string | null;
  scoreColor: string;
  scoreShadow: (teamColor: string) => string;
  watermarkColor: string;
  accentLineColor: string;
  playerNameColor: string;
  playerScoreColor: string;
  restColor: string;
  verdictColor: (winnerColor: string | null) => string;
  verdictBg: string;
  verdictBorderBg: (c1: string, wc: string | null, c2: string) => string;
  headlineColor: string;
  brandColor: string;
  dateColor: string;
  footerColor: string;
  detailedVerdictColor: string;
  statBg: string;
  statFg: string;
}

const SKIN_CONFIGS: Record<CardSkin, CardSkinConfig> = {
  classic: {
    cardBg: '#0a0a12',
    sectionBg: (tc) =>
      `linear-gradient(170deg, ${darkenHex(tc, 0.5)} 0%, ${darkenHex(tc, 0.7)} 100%)`,
    sectionBorder: 'none',
    teamNameColor: 'rgba(255,255,255,0.6)',
    accentBarBg: () => null,
    scoreColor: '#ffffff',
    scoreShadow: (tc) => `0 2px 40px ${hexToRgba(tc, 0.5)}`,
    watermarkColor: 'rgba(255,255,255,0.06)',
    accentLineColor: 'rgba(255,255,255,0.25)',
    playerNameColor: 'rgba(255,255,255,0.95)',
    playerScoreColor: 'rgba(255,255,255,0.6)',
    restColor: 'rgba(255,255,255,0.4)',
    verdictColor: (wc) => wc || '#ffffff',
    verdictBg: 'rgba(0,0,0,0.6)',
    verdictBorderBg: (c1, wc, c2) =>
      `linear-gradient(90deg, ${c1}, ${wc || 'rgba(255,255,255,0.2)'}, ${c2})`,
    headlineColor: '#ffffff',
    brandColor: 'rgba(255,255,255,0.35)',
    dateColor: 'rgba(255,255,255,0.25)',
    footerColor: 'rgba(255,255,255,0.2)',
    detailedVerdictColor: 'rgba(255,255,255,0.4)',
    statBg: 'rgba(255,255,255,0.15)',
    statFg: 'rgba(255,255,255,0.8)',
  },

  holographic: {
    cardBg: '#06041a',
    sectionBg: (tc) =>
      `linear-gradient(135deg, ${darkenHex(tc, 0.55)} 0%, ${hexToRgba(tc, 0.25)} 50%, rgba(155,93,229,0.3) 100%)`,
    sectionBorder: 'none',
    teamNameColor: 'rgba(220,210,255,0.6)',
    accentBarBg: () =>
      'linear-gradient(90deg, #ff6b35, #f9c74f, #06d6a0, #4ecdc4, #9b5de5, #ff6b35)',
    scoreColor: '#ffffff',
    scoreShadow: (tc) =>
      `0 2px 30px ${hexToRgba(tc, 0.5)}, 0 0 60px rgba(155,93,229,0.3)`,
    watermarkColor: 'rgba(155,93,229,0.06)',
    accentLineColor: 'rgba(155,93,229,0.4)',
    playerNameColor: 'rgba(220,210,255,0.95)',
    playerScoreColor: 'rgba(200,180,255,0.6)',
    restColor: 'rgba(200,180,255,0.4)',
    verdictColor: (wc) => wc || 'rgba(200,180,255,0.8)',
    verdictBg: 'rgba(6,4,26,0.8)',
    verdictBorderBg: () =>
      'linear-gradient(90deg, #ff6b35, #f9c74f, #06d6a0, #4ecdc4, #9b5de5, #ff6b35)',
    headlineColor: '#ffffff',
    brandColor: 'rgba(200,180,255,0.4)',
    dateColor: 'rgba(200,180,255,0.3)',
    footerColor: 'rgba(200,180,255,0.25)',
    detailedVerdictColor: 'rgba(200,180,255,0.4)',
    statBg: 'rgba(155,93,229,0.25)',
    statFg: 'rgba(220,210,255,0.85)',
  },

  insideStuff: {
    cardBg: '#0d0620',
    sectionBg: (tc) =>
      `linear-gradient(170deg, ${hexToRgba(tc, 0.2)} 0%, #12082a 50%, #0d0620 100%)`,
    sectionBorder: 'none',
    teamNameColor: 'rgba(212,165,72,0.5)',
    accentBarBg: () =>
      'linear-gradient(90deg, #8b6914, #f5d78e, #d4a548, #f5d78e, #8b6914)',
    scoreColor: '#f5d78e',
    scoreShadow: () => '0 2px 40px rgba(212,165,72,0.5)',
    watermarkColor: 'rgba(212,165,72,0.05)',
    accentLineColor: 'rgba(212,165,72,0.4)',
    playerNameColor: 'rgba(245,215,142,0.95)',
    playerScoreColor: 'rgba(212,165,72,0.6)',
    restColor: 'rgba(212,165,72,0.4)',
    verdictColor: () => '#f5d78e',
    verdictBg: 'rgba(13,6,32,0.8)',
    verdictBorderBg: () =>
      'linear-gradient(90deg, #8b6914, #f5d78e, #d4a548, #f5d78e, #8b6914)',
    headlineColor: '#f5d78e',
    brandColor: 'rgba(212,165,72,0.45)',
    dateColor: 'rgba(212,165,72,0.35)',
    footerColor: 'rgba(212,165,72,0.25)',
    detailedVerdictColor: 'rgba(212,165,72,0.4)',
    statBg: 'rgba(212,165,72,0.2)',
    statFg: 'rgba(245,215,142,0.85)',
  },

  nbaJam: {
    cardBg: '#000000',
    sectionBg: (tc) =>
      `linear-gradient(170deg, ${hexToRgba(tc, 0.1)} 0%, #000000 40%)`,
    sectionBorder: '1px solid rgba(0,255,255,0.25)',
    teamNameColor: 'rgba(0,255,255,0.5)',
    accentBarBg: () =>
      'linear-gradient(90deg, #002222, #00CCCC, #00FFFF, #00CCCC, #002222)',
    scoreColor: '#00FFFF',
    scoreShadow: () =>
      '0 0 30px rgba(0,255,255,0.6), 0 0 80px rgba(0,255,255,0.2)',
    watermarkColor: 'rgba(0,255,255,0.04)',
    accentLineColor: 'rgba(0,255,255,0.3)',
    playerNameColor: 'rgba(0,255,255,0.9)',
    playerScoreColor: 'rgba(0,204,204,0.6)',
    restColor: 'rgba(0,204,204,0.35)',
    verdictColor: () => '#00FFFF',
    verdictBg: 'rgba(0,0,0,0.9)',
    verdictBorderBg: () =>
      'linear-gradient(90deg, #002222, #00CCCC, #00FFFF, #00CCCC, #002222)',
    headlineColor: '#00FFFF',
    brandColor: 'rgba(0,204,204,0.4)',
    dateColor: 'rgba(0,204,204,0.3)',
    footerColor: 'rgba(0,204,204,0.25)',
    detailedVerdictColor: 'rgba(0,204,204,0.4)',
    statBg: 'rgba(0,204,204,0.2)',
    statFg: 'rgba(0,255,255,0.85)',
  },
};

function renderAccentBar(
  teams: [string, TeamScoreEntry][],
  sk: CardSkinConfig,
  height: number,
): React.ReactElement {
  const bg = sk.accentBarBg();
  if (bg) {
    return <div style={{ display: 'flex', height, flexShrink: 0, background: bg }} />;
  }
  return (
    <div style={{ display: 'flex', height, flexShrink: 0 }}>
      {teams.map(([tid]) => (
        <div key={tid} style={{ flex: 1, backgroundColor: CARD_TEAM_COLORS[tid] || '#444' }} />
      ))}
    </div>
  );
}

function renderSectionOverlay(skinId: CardSkin, teamColor: string): React.ReactElement | null {
  if (skinId === 'holographic') {
    return (
      <div style={{
        position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex',
        background: `radial-gradient(ellipse at 25% 20%, ${hexToRgba(teamColor, 0.12)} 0%, transparent 50%), radial-gradient(ellipse at 75% 80%, rgba(78,205,196,0.08) 0%, transparent 50%)`,
      }} />
    );
  }
  if (skinId === 'insideStuff') {
    return (
      <div style={{
        position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex',
        background: 'radial-gradient(ellipse at 50% 40%, rgba(212,165,72,0.12) 0%, transparent 60%)',
      }} />
    );
  }
  if (skinId === 'nbaJam') {
    return (
      <div style={{
        position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex',
        background: 'repeating-linear-gradient(0deg, transparent 0px, transparent 4px, rgba(0,255,255,0.05) 4px, rgba(0,255,255,0.05) 5px)',
      }} />
    );
  }
  return null;
}

function resolveSkin(raw?: CardSkin): CardSkinConfig {
  return SKIN_CONFIGS[raw || 'classic'];
}

// ── Types ───────────────────────────────────────────────────────

export interface SpotlightOptions {
  accolades: boolean;
  winShares: boolean;
  championships: boolean;
  playoffWs: boolean;
  seasons: boolean;
  detailedVerdict: boolean;
}

const DEFAULT_SPOTLIGHT: SpotlightOptions = {
  accolades: true,
  winShares: false,
  championships: false,
  playoffWs: false,
  seasons: false,
  detailedVerdict: false,
};

export interface AssetScore {
  name: string;
  type: string;
  score: number;
  ws?: number;
  playoff_ws?: number;
  championships?: number;
  accolades?: string[];
  seasons?: number;
}

export interface TeamScoreEntry {
  score: number;
  assets: AssetScore[];
}

export interface TradeVerdictData {
  date?: string | null;
  league?: string;
  teamScores: Record<string, TeamScoreEntry>;
  winner: string | null;
  lopsidedness: number;
  heroImages?: Record<string, string[]>;
  spotlight?: Partial<SpotlightOptions>;
  format?: 'og' | 'square' | 'story';
  skin?: CardSkin;
  playerCount?: number;
}

// ── Render helpers ──────────────────────────────────────────────

function renderPlayerDetail(
  asset: AssetScore,
  spotlight: SpotlightOptions,
  baseFontSize: number,
  sk: CardSkinConfig,
): React.ReactElement | null {
  const items: { text: string; bg: string; fg: string }[] = [];
  const statCount = activeStatCount(spotlight);

  // When accolades is the only stat, show more accolades at larger size
  const accoladeMax = statCount === 1 && spotlight.accolades ? 8 : 3;

  if (spotlight.accolades && asset.accolades?.length) {
    for (const a of compressAccolades(asset.accolades, accoladeMax)) {
      items.push({ text: a, ...pillColor(a) });
    }
  }

  const stat = { bg: sk.statBg, fg: sk.statFg };
  if (spotlight.winShares && asset.ws != null && asset.ws > 0)
    items.push({ text: `${fmt(asset.ws)} WS`, ...stat });
  if (spotlight.playoffWs && asset.playoff_ws != null && asset.playoff_ws > 0)
    items.push({ text: `${fmt(asset.playoff_ws)} PWS`, ...stat });
  if (spotlight.championships && asset.championships != null && asset.championships > 0)
    items.push({ text: `${asset.championships}\u00d7 Champ`, ...pillColor('champ') });
  if (spotlight.seasons && asset.seasons != null && asset.seasons > 0)
    items.push({ text: `${asset.seasons} Szn`, ...stat });

  if (items.length === 0) return null;

  // Auto-size: fewer active spotlights → larger pills
  const sizeScale = statCount <= 1 ? 1.5 : statCount === 2 ? 1.25 : 1;
  const fs = Math.max(Math.round(baseFontSize * sizeScale), 12);
  const pad = fs >= 18 ? 14 : fs >= 15 ? 12 : fs < 13 ? 8 : 10;

  return (
    <div style={{ display: 'flex', gap: fs >= 15 ? 8 : 5, flexWrap: 'wrap', marginTop: fs >= 15 ? 8 : 4 }}>
      {items.map((item, i) => (
        <div key={i} style={{
          display: 'flex',
          padding: `${Math.round(pad * 0.35)}px ${pad}px`,
          borderRadius: fs >= 15 ? 6 : 4,
          backgroundColor: item.bg,
          color: item.fg,
          fontSize: fs,
          fontWeight: 700,
          lineHeight: 1.4,
        }}>
          {item.text}
        </div>
      ))}
    </div>
  );
}

export function tradeVerdictCard(data: TradeVerdictData): React.ReactElement {
  switch (data.format) {
    case 'story': return tradeCardStory(data);
    case 'square': return tradeCardSquare(data);
    default: return tradeCardOG(data);
  }
}

function sortTeams(
  teamScores: Record<string, TeamScoreEntry>,
  winner: string | null,
): [string, TeamScoreEntry][] {
  return Object.entries(teamScores).sort((a, b) => {
    if (winner) {
      if (a[0] === winner) return -1;
      if (b[0] === winner) return 1;
    }
    return b[1].score - a[1].score;
  });
}

function resolveSpotlight(raw?: Partial<SpotlightOptions>): SpotlightOptions {
  return { ...DEFAULT_SPOTLIGHT, ...raw };
}

/** Count of active stat spotlights (excludes verdict — that's a layout toggle). */
function activeStatCount(s: SpotlightOptions): number {
  let n = 0;
  if (s.accolades) n++;
  if (s.winShares) n++;
  if (s.championships) n++;
  if (s.playoffWs) n++;
  if (s.seasons) n++;
  return n;
}

/** Render proportional team score bar for the verdict section. */
function renderVerdictBar(
  teams: [string, TeamScoreEntry][],
  sk: CardSkinConfig,
  barHeight: number,
  fontSize: number,
): React.ReactElement {
  const totalScore = teams.reduce((sum, [, td]) => sum + td.score, 0) || 1;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: Math.max(4, barHeight / 2), width: '80%',
    }}>
      {/* Bar */}
      <div style={{
        display: 'flex', width: '100%', height: barHeight,
        borderRadius: barHeight / 2, overflow: 'hidden',
      }}>
        {teams.map(([tid, td]) => (
          <div key={tid} style={{
            width: `${(td.score / totalScore) * 100}%`,
            height: '100%',
            backgroundColor: CARD_TEAM_COLORS[tid] || '#888',
          }} />
        ))}
      </div>
      {/* Labels under bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', width: '100%',
      }}>
        {teams.map(([tid, td]) => (
          <div key={tid} style={{
            display: 'flex', gap: 6, alignItems: 'baseline',
          }}>
            <div style={{
              display: 'flex',
              fontSize, fontWeight: 800,
              color: CARD_TEAM_COLORS[tid] || '#888',
              letterSpacing: 1,
            }}>
              {tid}
            </div>
            <div style={{
              display: 'flex',
              fontSize: fontSize - 1, fontWeight: 600,
              color: sk.detailedVerdictColor,
            }}>
              {fmt(td.score)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── OG Layout (1200×630) ────────────────────────────────────────
// Side-by-side team sections with team-colored backgrounds.
// Score is the centerpiece. Content vertically centered.

function tradeCardOG(data: TradeVerdictData): React.ReactElement {
  const { date, league, teamScores, winner, lopsidedness, heroImages } = data;
  const spotlight = resolveSpotlight(data.spotlight);
  const skinId = data.skin || 'classic';
  const sk = resolveSkin(data.skin);
  const teams = sortTeams(teamScores, winner);
  const verdict = verdictText(winner, lopsidedness);
  const is3Plus = teams.length > 2;
  const pc = Math.min(data.playerCount || 2, is3Plus ? 2 : 3);
  const maxShow = is3Plus ? Math.min(pc, 1) : pc;
  const accentH = 6;
  const showVerdictBar = spotlight.detailedVerdict;
  const verdictH = showVerdictBar ? 80 : 56;
  const winnerColor = winner ? CARD_TEAM_COLORS[winner] || '#f9c74f' : null;

  // Dynamic sizing based on playerCount
  const nameFontSize = is3Plus ? 18 : pc === 1 ? 34 : pc === 2 ? 26 : 20;
  const nameScoreFontSize = is3Plus ? 16 : pc === 1 ? 28 : pc === 2 ? 22 : 18;
  const detailFontSize = is3Plus ? 12 : pc === 1 ? 16 : pc === 2 ? 14 : 12;
  const heroW = is3Plus ? 280 : pc === 1 ? 460 : pc === 2 ? 380 : 320;
  const heroH = Math.round(heroW * 0.73);
  const heroOpacityW = is3Plus ? 0.2 : pc === 1 ? 0.35 : 0.28;
  const heroOpacityL = is3Plus ? 0.1 : pc === 1 ? 0.18 : 0.14;
  const playerGap = pc === 1 ? 10 : 6;

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      backgroundColor: sk.cardBg,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {renderAccentBar(teams, sk, accentH)}

      {/* Side-by-side team sections */}
      <div style={{ display: 'flex', flex: 1 }}>
        {teams.map(([teamId, td], idx) => {
          const isW = teamId === winner;
          const raw = CARD_TEAM_COLORS[teamId] || '#888';
          const nick = TEAM_NICK[teamId] || teamId;
          const sorted = [...td.assets].sort((a, b) => b.score - a.score);
          const shown = sorted.slice(0, maxShow);
          const rest = sorted.length - shown.length;
          const heroUrls = heroImages?.[teamId] || [];
          const heroUrl = heroUrls[0];
          const isLast = idx === teams.length - 1;
          const align = isLast && !is3Plus ? 'flex-end' : 'flex-start';

          return (
            <div key={teamId} style={{
              flex: 1,
              display: 'flex', flexDirection: 'column',
              justifyContent: 'center',
              padding: is3Plus ? '20px 20px' : '24px 36px',
              background: sk.sectionBg(raw),
              position: 'relative' as const,
              overflow: 'hidden',
              ...(sk.sectionBorder !== 'none' ? { border: sk.sectionBorder } : {}),
            }}>
              {renderSectionOverlay(skinId, raw)}

              {/* Ghost watermark score */}
              <div style={{
                position: 'absolute' as const,
                ...(idx === 0 ? { right: -10 } : { left: -10 }),
                top: -20,
                display: 'flex',
                fontSize: is3Plus ? 200 : 260,
                fontWeight: 900,
                lineHeight: 0.85,
                color: sk.watermarkColor,
              }}>
                {Math.round(td.score)}
              </div>

              {/* Hero cutout behind content */}
              {heroUrl && (
                <img
                  src={heroUrl}
                  width={heroW} height={heroH}
                  alt=""
                  style={{
                    position: 'absolute' as const,
                    ...(idx === 0 ? { right: -30 } : { left: -30 }),
                    bottom: -15,
                    width: heroW, height: heroH,
                    opacity: isW ? heroOpacityW : heroOpacityL,
                  }}
                />
              )}

              {/* Team name */}
              <div style={{
                display: 'flex',
                justifyContent: align,
                fontSize: is3Plus ? 13 : 16,
                fontWeight: 800,
                letterSpacing: 4,
                color: sk.teamNameColor,
                textTransform: 'uppercase' as const,
                marginBottom: 4,
                position: 'relative' as const,
              }}>
                {nick}
              </div>

              {/* Score */}
              <div style={{
                display: 'flex',
                justifyContent: align,
                fontSize: is3Plus ? 60 : 84,
                fontWeight: 800,
                lineHeight: 0.9,
                color: sk.scoreColor,
                textShadow: sk.scoreShadow(raw),
                marginBottom: 8,
                position: 'relative' as const,
              }}>
                {fmt(td.score)}
              </div>

              {/* Accent line */}
              <div style={{
                width: 40, height: 2, display: 'flex',
                backgroundColor: sk.accentLineColor,
                marginBottom: 10,
                position: 'relative' as const,
                ...(isLast && !is3Plus ? { marginLeft: 'auto' } : {}),
              }} />

              {/* Players */}
              <div style={{
                display: 'flex', flexDirection: 'column',
                gap: playerGap, position: 'relative' as const,
                alignItems: align,
              }}>
                {shown.map((asset, i) => (
                  <div key={`${asset.name}-${i}`} style={{
                    display: 'flex', flexDirection: 'column', alignItems: align,
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'baseline', gap: 10,
                      lineHeight: 1.2,
                    }}>
                      <div style={{
                        display: 'flex', color: sk.playerNameColor,
                        fontWeight: 700, fontSize: nameFontSize,
                      }}>
                        {asset.name}
                      </div>
                      <div style={{
                        display: 'flex', color: sk.playerScoreColor,
                        fontWeight: 800, fontSize: nameScoreFontSize,
                      }}>
                        {fmt(asset.score)}
                      </div>
                    </div>
                    {renderPlayerDetail(asset, spotlight, detailFontSize, sk)}
                  </div>
                ))}
                {rest > 0 && (
                  <div style={{
                    display: 'flex', fontSize: Math.max(14, nameFontSize - 8),
                    color: sk.restColor, fontWeight: 600,
                  }}>
                    {`+ ${rest} more`}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Verdict band */}
      <div style={{
        height: verdictH, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 6, position: 'relative' as const,
        backgroundColor: sk.verdictBg,
      }}>
        <div style={{
          position: 'absolute' as const, top: 0, left: 0, right: 0,
          height: 2, display: 'flex',
          background: sk.verdictBorderBg(
            CARD_TEAM_COLORS[teams[0][0]] || '#444',
            winnerColor,
            CARD_TEAM_COLORS[teams[teams.length - 1][0]] || '#444',
          ),
        }} />
        {showVerdictBar && (
          renderVerdictBar(teams, sk, 8, 12)
        )}
        {!showVerdictBar && (
          <div style={{
            display: 'flex',
            fontSize: 15, fontWeight: 700,
            color: sk.verdictColor(winnerColor),
            letterSpacing: 1, textTransform: 'uppercase' as const,
          }}>
            {verdict}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            display: 'flex',
            fontSize: 10, fontWeight: 700, letterSpacing: 3,
            color: sk.brandColor, textTransform: 'uppercase' as const,
          }}>
            {league === 'WNBA' ? 'WNBA' : 'NBA'} Trade Mapper
          </div>
          {date && (
            <div style={{ display: 'flex', fontSize: 10, color: sk.dateColor }}>
              {formatDate(date)}
            </div>
          )}
          <div style={{ display: 'flex', fontSize: 10, color: sk.footerColor }}>
            nbatrades.vercel.app
          </div>
        </div>
      </div>

      {renderAccentBar(teams, sk, accentH)}
    </div>
  );
}

// ── Square Layout (1080×1080) ───────────────────────────────────
// Stacked team sections with team-colored backgrounds.

function tradeCardSquare(data: TradeVerdictData): React.ReactElement {
  const { date, league, teamScores, winner, lopsidedness, heroImages } = data;
  const spotlight = resolveSpotlight(data.spotlight);
  const skinId = data.skin || 'classic';
  const sk = resolveSkin(data.skin);
  const teams = sortTeams(teamScores, winner);
  const headline = buildHeadline(teamScores);
  const verdict = verdictText(winner, lopsidedness);
  const pc = data.playerCount || 2;
  const maxShow = Math.min(pc, 3);
  const accentH = 6;
  const showVerdictBar = spotlight.detailedVerdict;
  const bandHeight = showVerdictBar ? 140 : 110;
  const sectionHeight = Math.floor((1080 - accentH * 2 - bandHeight) / teams.length);
  const winnerColor = winner ? CARD_TEAM_COLORS[winner] || '#f9c74f' : null;

  // Dynamic sizing
  const nameFontSize = pc === 1 ? 38 : pc === 2 ? 30 : 22;
  const nameScoreFontSize = pc === 1 ? 30 : pc === 2 ? 24 : 18;
  const detailFontSize = pc === 1 ? 18 : pc === 2 ? 15 : 13;
  const heroW = pc === 1 ? 520 : pc === 2 ? 460 : 420;
  const heroH = Math.round(heroW * 0.73);
  const heroOpacityW = pc === 1 ? 0.35 : 0.28;
  const heroOpacityL = pc === 1 ? 0.18 : 0.14;

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      backgroundColor: sk.cardBg,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {renderAccentBar(teams, sk, accentH)}

      {teams.map(([teamId, td], idx) => {
        const isW = teamId === winner;
        const raw = CARD_TEAM_COLORS[teamId] || '#888';
        const nick = TEAM_NICK[teamId] || teamId;
        const sorted = [...td.assets].sort((a, b) => b.score - a.score);
        const shown = sorted.slice(0, maxShow);
        const rest = sorted.length - shown.length;
        const heroUrls = heroImages?.[teamId] || [];
        const heroUrl = heroUrls[0];

        return (
          <div key={teamId} style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Team section */}
            <div style={{
              height: sectionHeight,
              display: 'flex', flexDirection: 'column',
              justifyContent: 'center',
              padding: '20px 48px',
              background: sk.sectionBg(raw),
              position: 'relative' as const,
              overflow: 'hidden',
              ...(sk.sectionBorder !== 'none' ? { border: sk.sectionBorder } : {}),
            }}>
              {renderSectionOverlay(skinId, raw)}

              {/* Ghost watermark */}
              <div style={{
                position: 'absolute' as const,
                right: -10, top: -30,
                display: 'flex',
                fontSize: 320,
                fontWeight: 900,
                lineHeight: 0.85,
                color: sk.watermarkColor,
              }}>
                {Math.round(td.score)}
              </div>

              {/* Hero cutout */}
              {heroUrl && (
                <img
                  src={heroUrl}
                  width={heroW} height={heroH}
                  alt=""
                  style={{
                    position: 'absolute' as const,
                    right: -20, bottom: -15,
                    width: heroW, height: heroH,
                    opacity: isW ? heroOpacityW : heroOpacityL,
                  }}
                />
              )}

              {/* Team name */}
              <div style={{
                display: 'flex',
                fontSize: 17, fontWeight: 800, letterSpacing: 5,
                color: sk.teamNameColor,
                textTransform: 'uppercase' as const,
                marginBottom: 4,
                position: 'relative' as const,
              }}>
                {nick}
              </div>

              {/* Score */}
              <div style={{
                display: 'flex',
                fontSize: 96, fontWeight: 800, lineHeight: 0.9,
                color: sk.scoreColor,
                textShadow: sk.scoreShadow(raw),
                marginBottom: 6,
                position: 'relative' as const,
              }}>
                {fmt(td.score)}
              </div>

              {/* Accent line */}
              <div style={{
                width: 48, height: 3, display: 'flex',
                backgroundColor: sk.accentLineColor,
                marginBottom: 12,
                position: 'relative' as const,
              }} />

              {/* Players */}
              <div style={{
                display: 'flex', flexDirection: 'column',
                gap: pc === 1 ? 12 : 6, position: 'relative' as const,
              }}>
                {shown.map((asset, i) => (
                  <div key={`${asset.name}-${i}`} style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{
                      display: 'flex', alignItems: 'baseline', gap: 10,
                      lineHeight: 1.2,
                    }}>
                      <div style={{
                        display: 'flex', color: sk.playerNameColor,
                        fontWeight: 700, fontSize: nameFontSize,
                      }}>
                        {asset.name}
                      </div>
                      <div style={{
                        display: 'flex', color: sk.playerScoreColor,
                        fontWeight: 800, fontSize: nameScoreFontSize,
                      }}>
                        {fmt(asset.score)}
                      </div>
                    </div>
                    {renderPlayerDetail(asset, spotlight, detailFontSize, sk)}
                  </div>
                ))}
                {rest > 0 && (
                  <div style={{
                    display: 'flex', fontSize: Math.max(15, nameFontSize - 10),
                    color: sk.restColor, fontWeight: 600,
                  }}>
                    {`+ ${rest} more`}
                  </div>
                )}
              </div>
            </div>

            {/* Verdict band after first team */}
            {idx === 0 && (
              <div style={{
                height: bandHeight,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 6, position: 'relative' as const,
                backgroundColor: sk.verdictBg,
              }}>
                <div style={{
                  position: 'absolute' as const, top: 0, left: 0, right: 0,
                  height: 2, display: 'flex',
                  background: sk.verdictBorderBg(
                    CARD_TEAM_COLORS[teams[0][0]] || '#444',
                    winnerColor,
                    CARD_TEAM_COLORS[teams[teams.length - 1][0]] || '#444',
                  ),
                }} />
                <div style={{
                  position: 'absolute' as const, bottom: 0, left: 0, right: 0,
                  height: 2, display: 'flex',
                  background: sk.verdictBorderBg(
                    CARD_TEAM_COLORS[teams[0][0]] || '#444',
                    winnerColor,
                    CARD_TEAM_COLORS[teams[teams.length - 1][0]] || '#444',
                  ),
                }} />

                {headline && (
                  <div style={{
                    display: 'flex',
                    fontSize: 24, fontWeight: 800, letterSpacing: 1,
                    color: sk.headlineColor,
                  }}>
                    {headline}
                  </div>
                )}
                <div style={{
                  display: 'flex',
                  fontSize: 16, fontWeight: 700,
                  color: sk.verdictColor(winnerColor),
                  letterSpacing: 2, textTransform: 'uppercase' as const,
                }}>
                  {verdict}
                </div>
                {showVerdictBar && (
                  renderVerdictBar(teams, sk, 10, 14)
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    display: 'flex',
                    fontSize: 10, fontWeight: 700, letterSpacing: 3,
                    color: sk.brandColor, textTransform: 'uppercase' as const,
                  }}>
                    {league === 'WNBA' ? 'WNBA' : 'NBA'} Trade Mapper
                  </div>
                  {date && (
                    <div style={{ display: 'flex', fontSize: 10, color: sk.dateColor }}>
                      {formatDate(date)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {renderAccentBar(teams, sk, accentH)}
    </div>
  );
}

// ── Story Layout (1080×1920) ────────────────────────────────────
// Tall stacked sections with team-colored backgrounds.

function tradeCardStory(data: TradeVerdictData): React.ReactElement {
  const { date, league, teamScores, winner, lopsidedness, heroImages } = data;
  const spotlight = resolveSpotlight(data.spotlight);
  const skinId = data.skin || 'classic';
  const sk = resolveSkin(data.skin);
  const teams = sortTeams(teamScores, winner);
  const headline = buildHeadline(teamScores);
  const verdict = verdictText(winner, lopsidedness);
  const pc = data.playerCount || 2;
  const accentH = 6;
  const showVerdictBar = spotlight.detailedVerdict;
  const bandHeight = showVerdictBar ? 340 : 300;
  const sectionHeight = Math.floor((1920 - accentH * 2 - bandHeight) / teams.length);
  const winnerColor = winner ? CARD_TEAM_COLORS[winner] || '#f9c74f' : null;

  // Dynamic sizing
  const nameFontSize = pc === 1 ? 44 : pc === 2 ? 36 : 28;
  const nameScoreFontSize = pc === 1 ? 36 : pc === 2 ? 28 : 22;
  const detailFontSize = pc === 1 ? 20 : pc === 2 ? 17 : 15;
  const heroW = pc === 1 ? 680 : pc === 2 ? 600 : 560;
  const heroH = Math.round(heroW * 0.73);
  const heroOpacityW = pc === 1 ? 0.3 : 0.22;
  const heroOpacityL = pc === 1 ? 0.15 : 0.1;

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      backgroundColor: sk.cardBg,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {renderAccentBar(teams, sk, accentH)}

      {teams.map(([teamId, td], idx) => {
        const isW = teamId === winner;
        const raw = CARD_TEAM_COLORS[teamId] || '#888';
        const nick = TEAM_NICK[teamId] || teamId;
        const sorted = [...td.assets].sort((a, b) => b.score - a.score);
        // Story shows all players (no maxShow cap) — but respect playerCount if set
        const shown = pc < sorted.length ? sorted.slice(0, pc) : sorted;
        const rest = sorted.length - shown.length;
        const heroUrls = heroImages?.[teamId] || [];
        const heroUrl = heroUrls[0];

        return (
          <div key={teamId} style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{
              height: sectionHeight,
              display: 'flex', flexDirection: 'column',
              justifyContent: 'center',
              padding: '30px 56px',
              background: sk.sectionBg(raw),
              position: 'relative' as const,
              overflow: 'hidden',
              ...(sk.sectionBorder !== 'none' ? { border: sk.sectionBorder } : {}),
            }}>
              {renderSectionOverlay(skinId, raw)}

              {/* Ghost watermark */}
              <div style={{
                position: 'absolute' as const,
                right: -20, top: -40,
                display: 'flex',
                fontSize: 400,
                fontWeight: 900,
                lineHeight: 0.85,
                color: sk.watermarkColor,
              }}>
                {Math.round(td.score)}
              </div>

              {/* Hero cutout */}
              {heroUrl && (
                <img
                  src={heroUrl}
                  width={heroW} height={heroH}
                  alt=""
                  style={{
                    position: 'absolute' as const,
                    right: -30, bottom: -20,
                    width: heroW, height: heroH,
                    opacity: isW ? heroOpacityW : heroOpacityL,
                  }}
                />
              )}

              {/* Team name */}
              <div style={{
                display: 'flex',
                fontSize: 20, fontWeight: 800, letterSpacing: 6,
                color: sk.teamNameColor,
                textTransform: 'uppercase' as const,
                marginBottom: 6,
                position: 'relative' as const,
              }}>
                {nick}
              </div>

              {/* Score */}
              <div style={{
                display: 'flex',
                fontSize: 120, fontWeight: 800, lineHeight: 0.85,
                color: sk.scoreColor,
                textShadow: sk.scoreShadow(raw),
                marginBottom: 8,
                position: 'relative' as const,
              }}>
                {fmt(td.score)}
              </div>

              {/* Accent line */}
              <div style={{
                width: 56, height: 3, display: 'flex',
                backgroundColor: sk.accentLineColor,
                marginBottom: 16,
                position: 'relative' as const,
              }} />

              {/* Players */}
              <div style={{
                display: 'flex', flexDirection: 'column',
                gap: pc === 1 ? 16 : 10, position: 'relative' as const,
              }}>
                {shown.map((asset, i) => (
                  <div key={`${asset.name}-${i}`} style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{
                      display: 'flex', alignItems: 'baseline', gap: 12,
                      lineHeight: 1.2,
                    }}>
                      <div style={{
                        display: 'flex', color: sk.playerNameColor,
                        fontWeight: 700, fontSize: nameFontSize,
                      }}>
                        {asset.name}
                      </div>
                      <div style={{
                        display: 'flex', color: sk.playerScoreColor,
                        fontWeight: 800, fontSize: nameScoreFontSize,
                      }}>
                        {fmt(asset.score)}
                      </div>
                    </div>
                    {renderPlayerDetail(asset, spotlight, detailFontSize, sk)}
                  </div>
                ))}
                {rest > 0 && (
                  <div style={{
                    display: 'flex', fontSize: Math.max(16, nameFontSize - 12),
                    color: sk.restColor, fontWeight: 600,
                  }}>
                    {`+ ${rest} more`}
                  </div>
                )}
              </div>
            </div>

            {/* Center band after first team */}
            {idx === 0 && (
              <div style={{
                height: bandHeight,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 12, padding: '0 56px',
                position: 'relative' as const,
                backgroundColor: sk.verdictBg,
              }}>
                <div style={{
                  position: 'absolute' as const, top: 0, left: 0, right: 0,
                  height: 3, display: 'flex',
                  background: sk.verdictBorderBg(
                    CARD_TEAM_COLORS[teams[0][0]] || '#444',
                    winnerColor,
                    CARD_TEAM_COLORS[teams[teams.length - 1][0]] || '#444',
                  ),
                }} />
                <div style={{
                  position: 'absolute' as const, bottom: 0, left: 0, right: 0,
                  height: 3, display: 'flex',
                  background: sk.verdictBorderBg(
                    CARD_TEAM_COLORS[teams[0][0]] || '#444',
                    winnerColor,
                    CARD_TEAM_COLORS[teams[teams.length - 1][0]] || '#444',
                  ),
                }} />

                <div style={{
                  display: 'flex',
                  fontSize: 13, fontWeight: 700, letterSpacing: 5,
                  color: sk.brandColor, textTransform: 'uppercase' as const,
                }}>
                  {league === 'WNBA' ? 'WNBA' : 'NBA'} Trade Mapper
                </div>
                {headline && (
                  <div style={{
                    display: 'flex',
                    fontSize: 38, fontWeight: 800, letterSpacing: 1,
                    color: sk.headlineColor, textAlign: 'center' as const,
                  }}>
                    {headline}
                  </div>
                )}
                {date && (
                  <div style={{ display: 'flex', fontSize: 18, color: sk.dateColor }}>
                    {formatDate(date)}
                  </div>
                )}
                <div style={{
                  display: 'flex',
                  fontSize: 22, fontWeight: 700,
                  color: sk.verdictColor(winnerColor),
                  letterSpacing: 2, textTransform: 'uppercase' as const,
                  marginTop: 8,
                }}>
                  {verdict}
                </div>
                {showVerdictBar && (
                  renderVerdictBar(teams, sk, 14, 18)
                )}
                <div style={{
                  display: 'flex',
                  fontSize: 13, color: sk.footerColor, marginTop: 8,
                }}>
                  nbatrades.vercel.app
                </div>
              </div>
            )}
          </div>
        );
      })}

      {renderAccentBar(teams, sk, accentH)}
    </div>
  );
}
