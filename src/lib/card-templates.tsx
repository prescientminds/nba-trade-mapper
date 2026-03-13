/* eslint-disable @next/next/no-img-element */
// ── Shareable card templates for OG image generation (Satori / next-og) ──
//
// Three format-specific layouts: OG (1200×630), Square (1080×1080), Story (1080×1920).
// Each skin dramatically transforms the visual: classic (ESPN clean), holographic
// (prismatic foil), insideStuff (gold broadcast), nbaJam (neon arcade).
// Satori constraints: flexbox only, no grid, no pseudo-elements.

// ── Team data (lightweight, Edge-safe) ──────────────────────────

export const CARD_TEAM_COLORS: Record<string, string> = {
  // Current NBA
  ATL: '#E03A3E', BOS: '#007A33', BKN: '#A1A1A4', CHA: '#00788C',
  CHI: '#CE1141', CLE: '#860038', DAL: '#00538C', DEN: '#0D2240',
  DET: '#C8102E', GSW: '#006BB6', HOU: '#CE1141', IND: '#002D62',
  LAC: '#C8102E', LAL: '#552583', MEM: '#5D76A9', MIA: '#98002E',
  MIL: '#00471B', MIN: '#0C2340', NOP: '#0C2340', NYK: '#006BB6',
  OKC: '#007AC1', ORL: '#0077C0', PHI: '#006BB6', PHX: '#E56020',
  POR: '#E03A3E', SAC: '#5A2D81', SAS: '#C4CED4', TOR: '#CE1141',
  UTA: '#002B5C', WAS: '#002B5C',
  // Historical
  SEA: '#00843D', NJN: '#002A60', VAN: '#00B2A9', NOH: '#002B5C',
  NOK: '#002B5C', WSB: '#E31837', CHH: '#1D1160', SDC: '#ED174C',
  KCK: '#C8102E', BUF: '#003DA5',
  // WNBA
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
  // Historical — fallback to primary darkened
  SEA: '#FFC200', NJN: '#000000', VAN: '#003F5C', NOH: '#002B5C',
  NOK: '#002B5C', WSB: '#002B5C', CHH: '#00788C', SDC: '#1D428A',
  KCK: '#1D428A', BUF: '#E31837',
  // WNBA
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
  // WNBA
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

// ── Card-specific helpers ───────────────────────────────────────

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
  if (!winner) return 'Too close to call';
  const nick = TEAM_NICK[winner] || winner;
  if (lopsidedness >= 50) return `The ${nick} committed robbery`;
  if (lopsidedness >= 20) return `The ${nick} dominated`;
  if (lopsidedness >= 5) return `The ${nick} won clearly`;
  return `The ${nick} had a slight edge`;
}

function compressAccolades(accolades: string[]): string[] {
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
  return sorted.slice(0, 3).map(([label, count]) =>
    count > 1 ? `${count}\u00d7 ${label}` : label
  );
}

function pillColor(text: string): { bg: string; fg: string } {
  const t = text.toLowerCase();
  if (t.includes('mvp')) return { bg: 'rgba(249,199,79,0.35)', fg: '#fcd34d' };
  if (t.includes('dpoy')) return { bg: 'rgba(78,205,196,0.35)', fg: '#5eead4' };
  if (t.includes('all-star')) return { bg: 'rgba(155,93,229,0.35)', fg: '#c084fc' };
  if (t.includes('all-nba')) return { bg: 'rgba(255,107,53,0.35)', fg: '#fb923c' };
  if (t.includes('roy')) return { bg: 'rgba(6,214,160,0.35)', fg: '#34d399' };
  if (t.includes('all-def')) return { bg: 'rgba(78,205,196,0.3)', fg: '#5eead4' };
  return { bg: 'rgba(255,255,255,0.15)', fg: 'rgba(255,255,255,0.7)' };
}

// ── Skin system ─────────────────────────────────────────────────
// Each skin transforms the ENTIRE card visual: background, banners,
// text colors, accent bars, overlays. Like switching napkin/script in
// the happy hours app — dramatic, not subtle.

export type CardSkin = 'classic' | 'holographic' | 'insideStuff' | 'nbaJam';

interface CardSkinConfig {
  cardBg: string;
  // Banner
  bannerBg: (teamColor: string) => string;
  bannerTextColor: string;
  bannerBorder: string;
  // Accent bars (null = team color segments)
  accentBarBg: () => string | null;
  // Score
  scoreColor: string;
  scoreShadow: (teamColor: string) => string;
  accentLineColor: (teamColor: string) => string;
  // Players
  playerNameColor: string;
  playerScoreColor: (teamColor: string) => string;
  restColor: string;
  // Verdict
  verdictColor: (winnerColor: string | null) => string;
  verdictBorderBg: (c1: string, wc: string | null, c2: string) => string;
  // Labels
  headlineColor: string;
  brandColor: string;
  dateColor: string;
  footerColor: string;
  detailedVerdictColor: string;
  // Spotlight pills
  statBg: string;
  statFg: string;
}

const SKIN_CONFIGS: Record<CardSkin, CardSkinConfig> = {
  // ── Classic: ESPN clean, dark + team colors ──
  classic: {
    cardBg: '#08080f',
    bannerBg: (tc) => tc,
    bannerTextColor: '#ffffff',
    bannerBorder: 'none',
    accentBarBg: () => null,
    scoreColor: '#ffffff',
    scoreShadow: (tc) => `0 0 40px ${hexToRgba(tc, 0.3)}, 0 0 80px ${hexToRgba(tc, 0.1)}`,
    accentLineColor: (tc) => hexToRgba(tc, 0.6),
    playerNameColor: 'rgba(255,255,255,0.9)',
    playerScoreColor: (tc) => tc,
    restColor: 'rgba(255,255,255,0.3)',
    verdictColor: (wc) => wc || 'rgba(255,255,255,0.5)',
    verdictBorderBg: (c1, wc, c2) =>
      `linear-gradient(90deg, ${c1}, ${wc || 'rgba(255,255,255,0.15)'}, ${c2})`,
    headlineColor: '#ffffff',
    brandColor: 'rgba(255,255,255,0.3)',
    dateColor: 'rgba(255,255,255,0.2)',
    footerColor: 'rgba(255,255,255,0.2)',
    detailedVerdictColor: 'rgba(255,255,255,0.35)',
    statBg: 'rgba(255,255,255,0.1)',
    statFg: 'rgba(255,255,255,0.6)',
  },

  // ── Holographic: prismatic foil, rainbow shimmer ──
  holographic: {
    cardBg: '#08061a',
    bannerBg: (tc) =>
      `linear-gradient(90deg, ${tc}, ${hexToRgba(tc, 0.5)}, rgba(155,93,229,0.8))`,
    bannerTextColor: '#ffffff',
    bannerBorder: 'none',
    accentBarBg: () =>
      'linear-gradient(90deg, #ff6b35, #f9c74f, #06d6a0, #4ecdc4, #9b5de5, #ff6b35)',
    scoreColor: '#ffffff',
    scoreShadow: (tc) =>
      `0 0 30px ${hexToRgba(tc, 0.4)}, 0 0 60px rgba(155,93,229,0.25), 0 0 90px rgba(78,205,196,0.15)`,
    accentLineColor: () => 'rgba(155,93,229,0.5)',
    playerNameColor: 'rgba(220,210,255,0.9)',
    playerScoreColor: (tc) => tc,
    restColor: 'rgba(200,180,255,0.4)',
    verdictColor: (wc) => wc || 'rgba(200,180,255,0.6)',
    verdictBorderBg: () =>
      'linear-gradient(90deg, #ff6b35, #f9c74f, #06d6a0, #4ecdc4, #9b5de5, #ff6b35)',
    headlineColor: '#ffffff',
    brandColor: 'rgba(200,180,255,0.4)',
    dateColor: 'rgba(200,180,255,0.3)',
    footerColor: 'rgba(200,180,255,0.25)',
    detailedVerdictColor: 'rgba(200,180,255,0.4)',
    statBg: 'rgba(155,93,229,0.25)',
    statFg: 'rgba(200,180,255,0.8)',
  },

  // ── Inside Stuff: gold broadcast, TNT prestige ──
  insideStuff: {
    cardBg: '#12082a',
    bannerBg: () =>
      'linear-gradient(90deg, #8b6914, #f5d78e, #d4a548, #f5d78e, #8b6914)',
    bannerTextColor: '#1a0a2e',
    bannerBorder: 'none',
    accentBarBg: () =>
      'linear-gradient(90deg, #8b6914, #f5d78e, #d4a548, #f5d78e, #8b6914)',
    scoreColor: '#f5d78e',
    scoreShadow: () =>
      '0 0 40px rgba(212,165,72,0.4), 0 0 80px rgba(212,165,72,0.15)',
    accentLineColor: () => '#d4a548',
    playerNameColor: 'rgba(245,215,142,0.9)',
    playerScoreColor: () => '#f5d78e',
    restColor: 'rgba(212,165,72,0.4)',
    verdictColor: () => '#f5d78e',
    verdictBorderBg: () =>
      'linear-gradient(90deg, #8b6914, #f5d78e, #d4a548, #f5d78e, #8b6914)',
    headlineColor: '#f5d78e',
    brandColor: 'rgba(212,165,72,0.5)',
    dateColor: 'rgba(212,165,72,0.4)',
    footerColor: 'rgba(212,165,72,0.3)',
    detailedVerdictColor: 'rgba(212,165,72,0.4)',
    statBg: 'rgba(212,165,72,0.2)',
    statFg: 'rgba(245,215,142,0.8)',
  },

  // ── NBA Jam: neon arcade, pure black + cyan fire ──
  nbaJam: {
    cardBg: '#000000',
    bannerBg: () => '#050505',
    bannerTextColor: '#00FFFF',
    bannerBorder: '2px solid rgba(0,255,255,0.5)',
    accentBarBg: () =>
      'linear-gradient(90deg, #003333, #00CCCC, #00FFFF, #00CCCC, #003333)',
    scoreColor: '#00FFFF',
    scoreShadow: () =>
      '0 0 30px rgba(0,255,255,0.5), 0 0 60px rgba(0,255,255,0.25), 0 0 120px rgba(0,255,255,0.1)',
    accentLineColor: () => '#00CCCC',
    playerNameColor: 'rgba(0,255,255,0.85)',
    playerScoreColor: () => '#00FFFF',
    restColor: 'rgba(0,204,204,0.35)',
    verdictColor: () => '#00FFFF',
    verdictBorderBg: () =>
      'linear-gradient(90deg, #003333, #00CCCC, #00FFFF, #00CCCC, #003333)',
    headlineColor: '#00FFFF',
    brandColor: 'rgba(0,204,204,0.4)',
    dateColor: 'rgba(0,204,204,0.3)',
    footerColor: 'rgba(0,204,204,0.25)',
    detailedVerdictColor: 'rgba(0,204,204,0.35)',
    statBg: 'rgba(0,204,204,0.2)',
    statFg: 'rgba(0,255,255,0.8)',
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

/** Skin-specific section overlay. Dramatic per-skin visual treatment. */
function renderSectionOverlay(
  skinId: CardSkin,
  teamColor: string,
): React.ReactElement | null {
  if (skinId === 'insideStuff') {
    return (
      <div style={{
        position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex',
        background: 'radial-gradient(ellipse at 50% 30%, rgba(212,165,72,0.15) 0%, transparent 60%)',
      }} />
    );
  }
  if (skinId === 'nbaJam') {
    return (
      <div style={{
        position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex',
        background: 'repeating-linear-gradient(0deg, transparent 0px, transparent 4px, rgba(0,255,255,0.07) 4px, rgba(0,255,255,0.07) 5px)',
      }} />
    );
  }
  if (skinId === 'holographic') {
    return (
      <div style={{
        position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex',
        background: `radial-gradient(ellipse at 25% 20%, ${hexToRgba(teamColor, 0.15)} 0%, transparent 45%), radial-gradient(ellipse at 75% 80%, rgba(78,205,196,0.1) 0%, transparent 45%), radial-gradient(ellipse at 50% 50%, rgba(155,93,229,0.08) 0%, transparent 55%)`,
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
}

// ── Shared render helpers ───────────────────────────────────────

function renderPlayerDetail(
  asset: AssetScore,
  spotlight: SpotlightOptions,
  baseFontSize: number,
  sk: CardSkinConfig,
): React.ReactElement | null {
  const items: { text: string; bg: string; fg: string }[] = [];

  if (spotlight.accolades && asset.accolades?.length) {
    for (const a of compressAccolades(asset.accolades)) {
      items.push({ text: a, ...pillColor(a) });
    }
  }

  const stat = { bg: sk.statBg, fg: sk.statFg };
  if (spotlight.winShares && asset.ws != null && asset.ws > 0)
    items.push({ text: `${fmt(asset.ws)} WS`, ...stat });
  if (spotlight.playoffWs && asset.playoff_ws != null && asset.playoff_ws > 0)
    items.push({ text: `${fmt(asset.playoff_ws)} PWS`, ...stat });
  if (spotlight.championships && asset.championships != null && asset.championships > 0)
    items.push({ text: `${asset.championships}\u00d7 Champ`, bg: 'rgba(249,199,79,0.3)', fg: '#fcd34d' });
  if (spotlight.seasons && asset.seasons != null && asset.seasons > 0)
    items.push({ text: `${asset.seasons} Szn`, ...stat });

  if (items.length === 0) return null;

  // Scale up: floor at 12px, add 2 from base for readability
  const fs = Math.max(baseFontSize + 2, 12);

  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 3 }}>
      {items.map((item, i) => (
        <div key={i} style={{
          display: 'flex',
          padding: `3px ${fs < 13 ? 8 : 10}px`,
          borderRadius: 4,
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

// ── Dispatcher ──────────────────────────────────────────────────

export function tradeVerdictCard(data: TradeVerdictData): React.ReactElement {
  switch (data.format) {
    case 'story': return tradeCardStory(data);
    case 'square': return tradeCardSquare(data);
    default: return tradeCardOG(data);
  }
}

// ── Shared layout helpers ───────────────────────────────────────

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

// ── OG Layout (1200×630) — Twitter / link preview ───────────────

function tradeCardOG(data: TradeVerdictData): React.ReactElement {
  const { date, league, teamScores, winner, lopsidedness, heroImages } = data;
  const spotlight = resolveSpotlight(data.spotlight);
  const skinId = data.skin || 'classic';
  const sk = resolveSkin(data.skin);
  const teams = sortTeams(teamScores, winner);
  const verdict = verdictText(winner, lopsidedness);
  const is3Plus = teams.length > 2;
  const maxShow = is3Plus ? 1 : 2;
  const barHeight = 60;
  const bannerHeight = 34;
  const accentH = 5;
  const winnerColor = winner ? CARD_TEAM_COLORS[winner] || '#f9c74f' : null;

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      backgroundColor: sk.cardBg,
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#ffffff',
    }}>
      {/* Top accent bar */}
      {renderAccentBar(teams, sk, accentH)}

      {/* Main split layout */}
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
          const heroW = is3Plus ? 260 : 360;
          const heroH = Math.round(heroW * 0.733);
          const isLast = idx === teams.length - 1;

          return (
            <div key={teamId} style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              position: 'relative' as const,
              overflow: 'hidden',
            }}>
              {renderSectionOverlay(skinId, raw)}

              {/* Subtle team radial tint on dark bg */}
              <div style={{
                position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex',
                background: `radial-gradient(ellipse at ${idx === 0 ? '75%' : '25%'} 70%, ${hexToRgba(raw, 0.1)} 0%, transparent 55%)`,
              }} />

              {/* Team color banner */}
              <div style={{
                height: bannerHeight, flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: isLast && !is3Plus ? 'flex-end' : 'flex-start',
                padding: '0 28px',
                background: sk.bannerBg(raw),
                borderBottom: sk.bannerBorder,
              }}>
                <div style={{
                  display: 'flex',
                  fontSize: 14, fontWeight: 800, letterSpacing: 5,
                  color: sk.bannerTextColor,
                  textTransform: 'uppercase' as const,
                }}>
                  {nick}
                </div>
              </div>

              {/* Content area */}
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                justifyContent: 'center',
                padding: is3Plus ? '8px 18px' : '8px 28px',
                position: 'relative' as const,
                alignItems: isLast && !is3Plus ? 'flex-end' : 'flex-start',
              }}>
                {/* Hero cutout */}
                {heroUrl && (
                  <div style={{
                    position: 'absolute' as const,
                    ...(idx === 0 ? { right: -15 } : { left: -15 }),
                    bottom: 0,
                    display: 'flex',
                  }}>
                    <div style={{
                      position: 'absolute' as const,
                      left: 80, top: 30,
                      width: 200, height: 200, borderRadius: 999,
                      display: 'flex',
                      background: `radial-gradient(circle, ${hexToRgba(raw, 0.15)} 0%, transparent 70%)`,
                    }} />
                    <img
                      src={heroUrl}
                      width={heroW} height={heroH}
                      alt=""
                      style={{
                        width: heroW, height: heroH,
                        opacity: isW ? 0.85 : 0.45,
                      }}
                    />
                  </div>
                )}

                {/* Score */}
                <div style={{
                  display: 'flex',
                  fontSize: is3Plus ? 52 : 68, fontWeight: 800, lineHeight: 0.95,
                  color: sk.scoreColor,
                  textShadow: sk.scoreShadow(raw),
                  marginBottom: 6,
                  position: 'relative' as const,
                }}>
                  {fmt(td.score)}
                </div>

                {/* Accent line under score */}
                <div style={{
                  width: 48, height: 2, display: 'flex',
                  backgroundColor: sk.accentLineColor(raw),
                  marginBottom: 8,
                }} />

                {/* Players */}
                <div style={{
                  display: 'flex', flexDirection: 'column',
                  gap: 3, position: 'relative' as const,
                }}>
                  {shown.map((asset, i) => (
                    <div key={`${asset.name}-${i}`} style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{
                        display: 'flex', alignItems: 'baseline', gap: 8,
                        fontSize: is3Plus ? 13 : 16, lineHeight: 1.3,
                      }}>
                        <div style={{ display: 'flex', color: sk.playerNameColor, fontWeight: 600 }}>
                          {asset.name}
                        </div>
                        <div style={{ display: 'flex', color: sk.playerScoreColor(raw), fontWeight: 800 }}>
                          {fmt(asset.score)}
                        </div>
                      </div>
                      {renderPlayerDetail(asset, spotlight, is3Plus ? 9 : 10, sk)}
                    </div>
                  ))}
                  {rest > 0 && (
                    <div style={{ display: 'flex', fontSize: 12, color: sk.restColor, fontWeight: 600 }}>
                      {`+ ${rest} more`}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom verdict bar */}
      <div style={{
        height: barHeight, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 24, position: 'relative' as const,
      }}>
        {/* Top border */}
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
          display: 'flex',
          fontSize: 14, fontWeight: 700,
          color: sk.verdictColor(winnerColor),
          letterSpacing: 1, textTransform: 'uppercase' as const,
        }}>
          {verdict}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            display: 'flex',
            fontSize: 10, fontWeight: 700, letterSpacing: 3,
            color: sk.brandColor, textTransform: 'uppercase' as const,
          }}>
            {`${league === 'WNBA' ? 'WNBA' : 'NBA'} Trade Mapper`}
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

      {/* Bottom accent bar */}
      {renderAccentBar(teams, sk, accentH)}
    </div>
  );
}

// ── Square Layout (1080×1080) — Instagram feed ──────────────────

function tradeCardSquare(data: TradeVerdictData): React.ReactElement {
  const { date, league, teamScores, winner, lopsidedness, heroImages } = data;
  const spotlight = resolveSpotlight(data.spotlight);
  const skinId = data.skin || 'classic';
  const sk = resolveSkin(data.skin);
  const teams = sortTeams(teamScores, winner);
  const headline = buildHeadline(teamScores);
  const verdict = verdictText(winner, lopsidedness);
  const maxShow = 3;
  const bannerHeight = 44;
  const bandHeight = 120;
  const footerHeight = 36;
  const accentH = 6;
  const sectionHeight = Math.floor(
    (1080 - accentH * 2 - bandHeight - footerHeight) / teams.length
  );
  const winnerColor = winner ? CARD_TEAM_COLORS[winner] || '#f9c74f' : null;

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      backgroundColor: sk.cardBg,
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#ffffff',
    }}>
      {/* Top accent bar */}
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
        const heroW = 420;
        const heroH = Math.round(heroW * 0.733);

        return (
          <div key={teamId} style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Team section */}
            <div style={{
              height: sectionHeight,
              display: 'flex', flexDirection: 'column',
              position: 'relative' as const,
              overflow: 'hidden',
            }}>
              {renderSectionOverlay(skinId, raw)}

              {/* Subtle team radial tint */}
              <div style={{
                position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex',
                background: `radial-gradient(ellipse at 78% 55%, ${hexToRgba(raw, 0.1)} 0%, transparent 55%)`,
              }} />

              {/* Team banner */}
              <div style={{
                height: bannerHeight, flexShrink: 0,
                display: 'flex', alignItems: 'center',
                padding: '0 48px',
                background: sk.bannerBg(raw),
                borderBottom: sk.bannerBorder,
              }}>
                <div style={{
                  display: 'flex',
                  fontSize: 20, fontWeight: 800, letterSpacing: 6,
                  color: sk.bannerTextColor,
                  textTransform: 'uppercase' as const,
                }}>
                  {nick}
                </div>
              </div>

              {/* Content area */}
              <div style={{
                flex: 1, display: 'flex',
                position: 'relative' as const,
              }}>
                {/* Hero cutout */}
                {heroUrl && (
                  <div style={{
                    position: 'absolute' as const,
                    right: -10, bottom: -10,
                    display: 'flex',
                  }}>
                    <div style={{
                      position: 'absolute' as const,
                      left: 80, top: 20,
                      width: 260, height: 260, borderRadius: 999,
                      display: 'flex',
                      background: `radial-gradient(circle, ${hexToRgba(raw, 0.15)} 0%, transparent 70%)`,
                    }} />
                    <img
                      src={heroUrl}
                      width={heroW} height={heroH}
                      alt=""
                      style={{
                        width: heroW, height: heroH,
                        opacity: isW ? 0.85 : 0.5,
                      }}
                    />
                  </div>
                )}

                {/* Text content */}
                <div style={{
                  display: 'flex', flexDirection: 'column',
                  justifyContent: 'center',
                  padding: '16px 48px',
                  position: 'relative' as const,
                  flex: 1,
                }}>
                  {/* Score */}
                  <div style={{
                    display: 'flex',
                    fontSize: 96, fontWeight: 800, lineHeight: 0.9,
                    color: sk.scoreColor,
                    textShadow: sk.scoreShadow(raw),
                    marginBottom: 4,
                  }}>
                    {fmt(td.score)}
                  </div>

                  {/* Accent line */}
                  <div style={{
                    width: 56, height: 3, display: 'flex',
                    backgroundColor: sk.accentLineColor(raw),
                    marginBottom: 12,
                  }} />

                  {/* Players */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {shown.map((asset, i) => (
                      <div key={`${asset.name}-${i}`} style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{
                          display: 'flex', alignItems: 'baseline', gap: 10,
                          fontSize: 21, lineHeight: 1.3,
                        }}>
                          <div style={{ display: 'flex', color: sk.playerNameColor, fontWeight: 600 }}>
                            {asset.name}
                          </div>
                          <div style={{ display: 'flex', color: sk.playerScoreColor(raw), fontWeight: 800 }}>
                            {fmt(asset.score)}
                          </div>
                        </div>
                        {renderPlayerDetail(asset, spotlight, 13, sk)}
                      </div>
                    ))}
                    {rest > 0 && (
                      <div style={{ display: 'flex', fontSize: 15, color: sk.restColor, fontWeight: 600 }}>
                        {`+ ${rest} more`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Verdict band after first team */}
            {idx === 0 && (
              <div style={{
                height: bandHeight,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 6, position: 'relative' as const,
              }}>
                {/* Top border */}
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
                    fontSize: 26, fontWeight: 800, letterSpacing: 1,
                    color: sk.headlineColor,
                  }}>
                    {headline}
                  </div>
                )}
                <div style={{
                  display: 'flex',
                  fontSize: 18, fontWeight: 700,
                  color: sk.verdictColor(winnerColor),
                  letterSpacing: 2, textTransform: 'uppercase' as const,
                }}>
                  {verdict}
                </div>
                {spotlight.detailedVerdict && winner && (
                  <div style={{ display: 'flex', fontSize: 13, color: sk.detailedVerdictColor }}>
                    {teams.map(([tid, td]) => `${TEAM_NICK[tid] || tid} ${fmt(td.score)}`).join(' \u2013 ')}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    display: 'flex',
                    fontSize: 11, fontWeight: 700, letterSpacing: 4,
                    color: sk.brandColor, textTransform: 'uppercase' as const,
                  }}>
                    {`${league === 'WNBA' ? 'WNBA' : 'NBA'} Trade Mapper`}
                  </div>
                  {date && (
                    <div style={{ display: 'flex', fontSize: 11, color: sk.dateColor }}>
                      {formatDate(date)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Footer */}
      <div style={{
        height: footerHeight, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ display: 'flex', fontSize: 11, color: sk.footerColor }}>
          nbatrades.vercel.app
        </div>
      </div>

      {/* Bottom accent bar */}
      {renderAccentBar(teams, sk, accentH)}
    </div>
  );
}

// ── Story Layout (1080×1920) — Instagram story ──────────────────

function tradeCardStory(data: TradeVerdictData): React.ReactElement {
  const { date, league, teamScores, winner, lopsidedness, heroImages } = data;
  const spotlight = resolveSpotlight(data.spotlight);
  const skinId = data.skin || 'classic';
  const sk = resolveSkin(data.skin);
  const teams = sortTeams(teamScores, winner);
  const headline = buildHeadline(teamScores);
  const verdict = verdictText(winner, lopsidedness);
  const bannerHeight = 52;
  const bandHeight = 320;
  const accentH = 6;
  const sectionHeight = Math.floor((1920 - accentH * 2 - bandHeight) / teams.length);
  const winnerColor = winner ? CARD_TEAM_COLORS[winner] || '#f9c74f' : null;

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      backgroundColor: sk.cardBg,
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#ffffff',
    }}>
      {/* Top accent bar */}
      {renderAccentBar(teams, sk, accentH)}

      {teams.map(([teamId, td], idx) => {
        const isW = teamId === winner;
        const raw = CARD_TEAM_COLORS[teamId] || '#888';
        const nick = TEAM_NICK[teamId] || teamId;
        const sorted = [...td.assets].sort((a, b) => b.score - a.score);
        const heroUrls = heroImages?.[teamId] || [];
        const heroUrl = heroUrls[0];
        const heroW = 580;
        const heroH = Math.round(heroW * 0.733);

        return (
          <div key={teamId} style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Team section */}
            <div style={{
              height: sectionHeight,
              display: 'flex', flexDirection: 'column',
              position: 'relative' as const,
              overflow: 'hidden',
            }}>
              {renderSectionOverlay(skinId, raw)}

              {/* Subtle team radial tint */}
              <div style={{
                position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex',
                background: `radial-gradient(ellipse at 75% 55%, ${hexToRgba(raw, 0.1)} 0%, transparent 55%)`,
              }} />

              {/* Team banner */}
              <div style={{
                height: bannerHeight, flexShrink: 0,
                display: 'flex', alignItems: 'center',
                padding: '0 56px',
                background: sk.bannerBg(raw),
                borderBottom: sk.bannerBorder,
              }}>
                <div style={{
                  display: 'flex',
                  fontSize: 24, fontWeight: 800, letterSpacing: 7,
                  color: sk.bannerTextColor,
                  textTransform: 'uppercase' as const,
                }}>
                  {nick}
                </div>
              </div>

              {/* Content area */}
              <div style={{
                flex: 1, display: 'flex',
                position: 'relative' as const,
              }}>
                {/* Hero cutout */}
                {heroUrl && (
                  <div style={{
                    position: 'absolute' as const,
                    right: -20, bottom: -10,
                    display: 'flex',
                  }}>
                    <div style={{
                      position: 'absolute' as const,
                      left: 100, top: 30,
                      width: 320, height: 320, borderRadius: 999,
                      display: 'flex',
                      background: `radial-gradient(circle, ${hexToRgba(raw, 0.15)} 0%, transparent 70%)`,
                    }} />
                    <img
                      src={heroUrl}
                      width={heroW} height={heroH}
                      alt=""
                      style={{
                        width: heroW, height: heroH,
                        opacity: isW ? 0.85 : 0.5,
                      }}
                    />
                  </div>
                )}

                {/* Text content */}
                <div style={{
                  display: 'flex', flexDirection: 'column',
                  justifyContent: 'center',
                  padding: '24px 56px',
                  position: 'relative' as const,
                  flex: 1,
                }}>
                  {/* Score */}
                  <div style={{
                    display: 'flex',
                    fontSize: 110, fontWeight: 800, lineHeight: 0.85,
                    color: sk.scoreColor,
                    textShadow: sk.scoreShadow(raw),
                    marginBottom: 6,
                  }}>
                    {fmt(td.score)}
                  </div>

                  {/* Accent line */}
                  <div style={{
                    width: 64, height: 3, display: 'flex',
                    backgroundColor: sk.accentLineColor(raw),
                    marginBottom: 16,
                  }} />

                  {/* All players */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {sorted.map((asset, i) => (
                      <div key={`${asset.name}-${i}`} style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{
                          display: 'flex', alignItems: 'baseline', gap: 12,
                          fontSize: 24, lineHeight: 1.3,
                        }}>
                          <div style={{ display: 'flex', color: sk.playerNameColor, fontWeight: 600 }}>
                            {asset.name}
                          </div>
                          <div style={{ display: 'flex', color: sk.playerScoreColor(raw), fontWeight: 800 }}>
                            {fmt(asset.score)}
                          </div>
                        </div>
                        {renderPlayerDetail(asset, spotlight, 15, sk)}
                      </div>
                    ))}
                  </div>
                </div>
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
              }}>
                {/* Border lines */}
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

                <div style={{
                  display: 'flex',
                  fontSize: 13, fontWeight: 700, letterSpacing: 5,
                  color: sk.brandColor, textTransform: 'uppercase' as const,
                }}>
                  {`${league === 'WNBA' ? 'WNBA' : 'NBA'} Trade Mapper`}
                </div>
                {headline && (
                  <div style={{
                    display: 'flex',
                    fontSize: 40, fontWeight: 800, letterSpacing: 1,
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
                {spotlight.detailedVerdict && winner && (
                  <div style={{ display: 'flex', fontSize: 15, color: sk.detailedVerdictColor }}>
                    {teams.map(([tid, td]) => `${TEAM_NICK[tid] || tid} ${fmt(td.score)}`).join(' \u2013 ')}
                  </div>
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

      {/* Bottom accent bar */}
      {renderAccentBar(teams, sk, accentH)}
    </div>
  );
}
