/* eslint-disable @next/next/no-img-element */
// ── Shareable card templates for OG image generation (Satori / next-og) ──
//
// Three format-specific layouts: OG (1200×630), Square (1080×1080), Story (1080×1920).
// Split-half design: team-colored sections with large player cutouts, dark gradient
// overlays for text readability, centered verdict band.
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
  if (t.includes('mvp')) return { bg: 'rgba(249,199,79,0.25)', fg: '#f9c74f' };
  if (t.includes('dpoy')) return { bg: 'rgba(78,205,196,0.25)', fg: '#4ecdc4' };
  if (t.includes('all-star')) return { bg: 'rgba(155,93,229,0.25)', fg: '#9b5de5' };
  if (t.includes('all-nba')) return { bg: 'rgba(255,107,53,0.25)', fg: '#ff6b35' };
  if (t.includes('roy')) return { bg: 'rgba(6,214,160,0.25)', fg: '#06d6a0' };
  if (t.includes('all-def')) return { bg: 'rgba(78,205,196,0.2)', fg: '#4ecdc4' };
  return { bg: 'rgba(255,255,255,0.12)', fg: 'rgba(255,255,255,0.6)' };
}

// ── Skin system ─────────────────────────────────────────────────

export type CardSkin = 'classic' | 'holographic' | 'insideStuff' | 'nbaJam';

interface CardSkinConfig {
  accentBarStyle: 'team-colors' | 'rainbow' | 'gold-gradient' | 'neon-cyan';
  brandColor: string;
  headlineColor: string;
  dateColor: string;
  footerColor: string;
  sectionBg: (primary: string, secondary: string, isWinner: boolean) => string;
  scoreColor: (isWinner: boolean, bright: string) => string;
  verdictBg: string;
  verdictColor: (bright: string | null) => string;
  nickColor: () => string;
  playerNameColor: string;
  playerScoreColor: (isWinner: boolean) => string;
  restColor: string;
  detailedVerdictColor: string;
}

const SKIN_CONFIGS: Record<CardSkin, CardSkinConfig> = {
  classic: {
    accentBarStyle: 'team-colors',
    brandColor: 'rgba(255,255,255,0.5)',
    headlineColor: '#ffffff',
    dateColor: 'rgba(255,255,255,0.5)',
    footerColor: 'rgba(255,255,255,0.3)',
    sectionBg: (pri, sec) =>
      `linear-gradient(135deg, ${darkenHex(pri, 0.4)} 0%, ${darkenHex(sec, 0.6)} 100%)`,
    scoreColor: (_isW, bright) => bright,
    verdictBg: 'rgba(0,0,0,0.85)',
    verdictColor: (bright) => bright || '#ffffff',
    nickColor: () => '#ffffff',
    playerNameColor: 'rgba(255,255,255,0.85)',
    playerScoreColor: () => 'rgba(255,255,255,0.95)',
    restColor: 'rgba(255,255,255,0.4)',
    detailedVerdictColor: 'rgba(255,255,255,0.4)',
  },
  holographic: {
    accentBarStyle: 'rainbow',
    brandColor: 'rgba(200,180,255,0.6)',
    headlineColor: '#ffffff',
    dateColor: 'rgba(200,180,255,0.5)',
    footerColor: 'rgba(200,180,255,0.35)',
    sectionBg: (pri, sec) =>
      `linear-gradient(135deg, ${hexToRgba(pri, 0.5)} 0%, ${hexToRgba(sec, 0.3)} 50%, rgba(155,93,229,0.2) 100%)`,
    scoreColor: (_isW, bright) => bright,
    verdictBg: 'rgba(12,12,24,0.9)',
    verdictColor: (bright) => bright || 'rgba(200,180,255,0.6)',
    nickColor: () => '#ffffff',
    playerNameColor: 'rgba(220,210,255,0.85)',
    playerScoreColor: () => 'rgba(220,210,255,0.95)',
    restColor: 'rgba(200,180,255,0.4)',
    detailedVerdictColor: 'rgba(200,180,255,0.4)',
  },
  insideStuff: {
    accentBarStyle: 'gold-gradient',
    brandColor: '#d4a548',
    headlineColor: '#f5d78e',
    dateColor: 'rgba(212,165,72,0.6)',
    footerColor: 'rgba(212,165,72,0.35)',
    sectionBg: (pri) =>
      `linear-gradient(135deg, ${hexToRgba(pri, 0.4)} 0%, rgba(26,10,46,0.95) 100%)`,
    scoreColor: () => '#f5d78e',
    verdictBg: 'rgba(26,10,46,0.95)',
    verdictColor: () => '#f5d78e',
    nickColor: () => '#f5d78e',
    playerNameColor: 'rgba(245,215,142,0.85)',
    playerScoreColor: () => '#f5d78e',
    restColor: 'rgba(212,165,72,0.4)',
    detailedVerdictColor: 'rgba(212,165,72,0.4)',
  },
  nbaJam: {
    accentBarStyle: 'neon-cyan',
    brandColor: '#00CCCC',
    headlineColor: '#00CCCC',
    dateColor: 'rgba(0,204,204,0.5)',
    footerColor: 'rgba(0,204,204,0.3)',
    sectionBg: (pri) =>
      `linear-gradient(135deg, ${hexToRgba(pri, 0.35)} 0%, rgba(0,0,0,0.95) 100%)`,
    scoreColor: () => '#00CCCC',
    verdictBg: 'rgba(0,0,0,0.95)',
    verdictColor: () => '#00CCCC',
    nickColor: () => '#00CCCC',
    playerNameColor: 'rgba(0,204,204,0.8)',
    playerScoreColor: () => 'rgba(0,255,255,0.9)',
    restColor: 'rgba(0,204,204,0.35)',
    detailedVerdictColor: 'rgba(0,204,204,0.35)',
  },
};

function renderAccentBar(
  teams: [string, TeamScoreEntry][],
  skin: CardSkinConfig,
  height: number,
): React.ReactElement {
  if (skin.accentBarStyle === 'rainbow') {
    return (
      <div style={{
        display: 'flex', height, flexShrink: 0,
        background: 'linear-gradient(90deg, #ff6b35, #f9c74f, #06d6a0, #4ecdc4, #9b5de5, #ff6b35)',
      }} />
    );
  }
  if (skin.accentBarStyle === 'gold-gradient') {
    return (
      <div style={{
        display: 'flex', height, flexShrink: 0,
        background: 'linear-gradient(90deg, #8b6914, #f5d78e, #d4a548, #f5d78e, #8b6914)',
      }} />
    );
  }
  if (skin.accentBarStyle === 'neon-cyan') {
    return (
      <div style={{
        display: 'flex', height, flexShrink: 0,
        background: 'linear-gradient(90deg, #004444, #00CCCC, #00FFFF, #00CCCC, #004444)',
      }} />
    );
  }
  // team-colors (classic default)
  return (
    <div style={{ display: 'flex', height, flexShrink: 0 }}>
      {teams.map(([tid]) => (
        <div key={tid} style={{ flex: 1, backgroundColor: CARD_TEAM_COLORS[tid] || '#444' }} />
      ))}
    </div>
  );
}

/** Per-section skin overlay (Satori-compatible). Applied within each team section. */
function renderSectionOverlay(skin: CardSkin): React.ReactElement | null {
  if (skin === 'insideStuff') {
    return (
      <div style={{
        position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex',
        background: 'radial-gradient(ellipse at 50% 30%, rgba(212,165,72,0.1) 0%, transparent 60%)',
      }} />
    );
  }
  if (skin === 'nbaJam') {
    return (
      <div style={{
        position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex',
        background: 'repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(0,204,204,0.04) 3px, rgba(0,204,204,0.04) 4px)',
      }} />
    );
  }
  if (skin === 'holographic') {
    return (
      <div style={{
        position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex',
        background: 'radial-gradient(ellipse at 30% 20%, rgba(155,93,229,0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(78,205,196,0.06) 0%, transparent 50%)',
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

const TEXT_SHADOW = '0 2px 8px rgba(0,0,0,0.6)';

function renderPlayerDetail(
  asset: AssetScore,
  spotlight: SpotlightOptions,
  fontSize: number,
): React.ReactElement | null {
  const items: { text: string; bg: string; fg: string }[] = [];

  if (spotlight.accolades && asset.accolades?.length) {
    for (const a of compressAccolades(asset.accolades)) {
      items.push({ text: a, ...pillColor(a) });
    }
  }

  const dim = { bg: 'rgba(255,255,255,0.1)', fg: 'rgba(255,255,255,0.6)' };
  if (spotlight.winShares && asset.ws != null && asset.ws > 0)
    items.push({ text: `${fmt(asset.ws)} WS`, ...dim });
  if (spotlight.playoffWs && asset.playoff_ws != null && asset.playoff_ws > 0)
    items.push({ text: `${fmt(asset.playoff_ws)} PWS`, ...dim });
  if (spotlight.championships && asset.championships != null && asset.championships > 0)
    items.push({ text: `${asset.championships}\u00d7 Champ`, ...dim });
  if (spotlight.seasons && asset.seasons != null && asset.seasons > 0)
    items.push({ text: `${asset.seasons} Szn`, ...dim });

  if (items.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
      {items.map((item, i) => (
        <div key={i} style={{
          display: 'flex',
          padding: `1px ${fontSize < 10 ? 5 : 7}px`,
          borderRadius: 3,
          backgroundColor: item.bg,
          color: item.fg,
          fontSize,
          fontWeight: 600,
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
// Split-half: two team sections side-by-side with verdict band in center.

function tradeCardOG(data: TradeVerdictData): React.ReactElement {
  const { date, league, teamScores, winner, lopsidedness, heroImages } = data;
  const spotlight = resolveSpotlight(data.spotlight);
  const sk = resolveSkin(data.skin);
  const skinId = data.skin || 'classic';
  const teams = sortTeams(teamScores, winner);
  const headline = buildHeadline(teamScores);
  const verdict = verdictText(winner, lopsidedness);
  const is3Plus = teams.length > 2;
  const maxShow = is3Plus ? 1 : 2;
  const verdictWidth = 60;

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      backgroundColor: '#0a0a0f',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#ffffff',
    }}>
      {renderAccentBar(teams, sk, 5)}

      {/* Main split layout */}
      <div style={{ display: 'flex', flex: 1, position: 'relative' as const }}>
        {teams.map(([teamId, td], idx) => {
          const isW = teamId === winner;
          const raw = CARD_TEAM_COLORS[teamId] || '#888';
          const sec = CARD_TEAM_SECONDARY[teamId] || raw;
          const nick = TEAM_NICK[teamId] || teamId;
          const sorted = [...td.assets].sort((a, b) => b.score - a.score);
          const shown = sorted.slice(0, maxShow);
          const rest = sorted.length - shown.length;
          const heroUrls = heroImages?.[teamId] || [];
          const heroUrl = heroUrls[0];
          const sectionWidth = is3Plus
            ? Math.floor((1200 - verdictWidth) / teams.length)
            : Math.floor((1200 - verdictWidth) / 2);
          const heroW = is3Plus ? 280 : 420;
          const heroH = Math.round(heroW * 0.733);

          return (
            <div key={teamId} style={{
              width: sectionWidth,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative' as const,
              overflow: 'hidden',
              background: sk.sectionBg(raw, sec, isW),
            }}>
              {renderSectionOverlay(skinId)}

              {/* Hero player cutout */}
              {heroUrl && (
                <img
                  src={heroUrl}
                  width={heroW}
                  height={heroH}
                  alt=""
                  style={{
                    position: 'absolute' as const,
                    right: idx === 0 ? -20 : undefined,
                    left: idx === teams.length - 1 ? -20 : undefined,
                    bottom: 0,
                    width: heroW,
                    height: heroH,
                    opacity: isW ? 0.5 : 0.3,
                  }}
                />
              )}

              {/* Dark gradient overlay for text readability */}
              <div style={{
                position: 'absolute' as const,
                top: 0, bottom: 0,
                left: idx === 0 ? 0 : undefined,
                right: idx === teams.length - 1 ? 0 : undefined,
                width: '65%',
                display: 'flex',
                background: idx === 0
                  ? 'linear-gradient(90deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)'
                  : 'linear-gradient(270deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)',
              }} />

              {/* Text content */}
              <div style={{
                display: 'flex', flexDirection: 'column',
                flex: 1,
                padding: is3Plus ? '20px 16px' : '24px 28px',
                position: 'relative' as const,
                justifyContent: 'center',
                alignItems: idx === teams.length - 1 && !is3Plus ? 'flex-end' : 'flex-start',
              }}>
                {/* Team name */}
                <div style={{
                  display: 'flex',
                  fontSize: is3Plus ? 12 : 14, fontWeight: 700, letterSpacing: 2,
                  color: sk.nickColor(),
                  textTransform: 'uppercase' as const,
                  textShadow: TEXT_SHADOW,
                  marginBottom: 4,
                }}>
                  {nick}
                </div>

                {/* Score */}
                <div style={{
                  display: 'flex',
                  fontSize: is3Plus ? 40 : 52, fontWeight: 800, lineHeight: 1,
                  color: sk.scoreColor(isW, '#ffffff'),
                  textShadow: '0 3px 12px rgba(0,0,0,0.5)',
                  marginBottom: 12,
                }}>
                  {fmt(td.score)}
                </div>

                {/* Top players */}
                <div style={{
                  display: 'flex', flexDirection: 'column',
                  gap: 4,
                }}>
                  {shown.map((asset, i) => (
                    <div key={`${asset.name}-${i}`} style={{
                      display: 'flex', flexDirection: 'column',
                    }}>
                      <div style={{
                        display: 'flex', alignItems: 'baseline', gap: 8,
                        fontSize: 13, lineHeight: 1.3,
                      }}>
                        <div style={{
                          display: 'flex',
                          color: sk.playerNameColor,
                          textShadow: TEXT_SHADOW,
                        }}>
                          {asset.name}
                        </div>
                        <div style={{
                          display: 'flex',
                          color: sk.playerScoreColor(isW),
                          fontWeight: 700,
                          textShadow: TEXT_SHADOW,
                        }}>
                          {fmt(asset.score)}
                        </div>
                      </div>
                      {renderPlayerDetail(asset, spotlight, 9)}
                    </div>
                  ))}
                  {rest > 0 && (
                    <div style={{
                      display: 'flex',
                      fontSize: 11, color: sk.restColor,
                      textShadow: TEXT_SHADOW,
                    }}>
                      {`+ ${rest} more`}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Center verdict band */}
        <div style={{
          position: 'absolute' as const,
          left: '50%',
          top: 0,
          bottom: 0,
          width: verdictWidth,
          marginLeft: -verdictWidth / 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: sk.verdictBg,
          gap: 8,
        }}>
          <div style={{
            display: 'flex',
            fontSize: 10, fontWeight: 700, letterSpacing: 2,
            color: sk.verdictColor(
              winner ? '#ffffff' : null
            ),
            textTransform: 'uppercase' as const,
            // Satori doesn't support writing-mode, so we just use a narrow column
            // and short text wraps naturally
          }}>
            VS
          </div>
        </div>
      </div>

      {/* Bottom bar: headline + verdict + date */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px 44px',
        background: sk.verdictBg,
        gap: 4,
      }}>
        {headline && (
          <div style={{
            display: 'flex',
            fontSize: 18, fontWeight: 800, letterSpacing: 1,
            color: sk.headlineColor,
          }}>
            {headline}
          </div>
        )}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{
            display: 'flex',
            fontSize: 13, fontWeight: 700,
            color: sk.verdictColor(
              winner ? '#ffffff' : null
            ),
            letterSpacing: 1,
            textTransform: 'uppercase' as const,
          }}>
            {verdict}
          </div>
          {spotlight.detailedVerdict && winner && (
            <div style={{
              display: 'flex',
              fontSize: 11, color: sk.detailedVerdictColor,
            }}>
              {teams.map(([tid, td]) => `${TEAM_NICK[tid] || tid} ${fmt(td.score)}`).join(' \u2013 ')}
            </div>
          )}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{
            display: 'flex',
            fontSize: 10, fontWeight: 700, letterSpacing: 3,
            color: sk.brandColor,
            textTransform: 'uppercase' as const,
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
    </div>
  );
}

// ── Square Layout (1080×1080) — Instagram feed ──────────────────
// Top half: Team A. Center band: headline + verdict. Bottom half: Team B.

function tradeCardSquare(data: TradeVerdictData): React.ReactElement {
  const { date, league, teamScores, winner, lopsidedness, heroImages } = data;
  const spotlight = resolveSpotlight(data.spotlight);
  const sk = resolveSkin(data.skin);
  const skinId = data.skin || 'classic';
  const teams = sortTeams(teamScores, winner);
  const headline = buildHeadline(teamScores);
  const verdict = verdictText(winner, lopsidedness);
  const maxShow = 3;
  const bandHeight = 100;
  const sectionHeight = Math.floor((1080 - bandHeight) / teams.length);

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      backgroundColor: '#0a0a0f',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#ffffff',
    }}>
      {renderAccentBar(teams, sk, 5)}

      {teams.map(([teamId, td], idx) => {
        const isW = teamId === winner;
        const raw = CARD_TEAM_COLORS[teamId] || '#888';
        const sec = CARD_TEAM_SECONDARY[teamId] || raw;
        const nick = TEAM_NICK[teamId] || teamId;
        const sorted = [...td.assets].sort((a, b) => b.score - a.score);
        const shown = sorted.slice(0, maxShow);
        const rest = sorted.length - shown.length;
        const heroUrls = heroImages?.[teamId] || [];
        const heroUrl = heroUrls[0];
        const heroW = 480;
        const heroH = Math.round(heroW * 0.733);

        return (
          <div key={teamId} style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{
              height: sectionHeight,
              display: 'flex',
              position: 'relative' as const,
              overflow: 'hidden',
              background: sk.sectionBg(raw, sec, isW),
            }}>
              {renderSectionOverlay(skinId)}

              {/* Hero cutout */}
              {heroUrl && (
                <img
                  src={heroUrl}
                  width={heroW}
                  height={heroH}
                  alt=""
                  style={{
                    position: 'absolute' as const,
                    right: -10,
                    bottom: 0,
                    width: heroW,
                    height: heroH,
                    opacity: isW ? 0.5 : 0.3,
                  }}
                />
              )}

              {/* Dark gradient from left */}
              <div style={{
                position: 'absolute' as const,
                top: 0, bottom: 0, left: 0,
                width: '65%',
                display: 'flex',
                background: 'linear-gradient(90deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)',
              }} />

              {/* Text content */}
              <div style={{
                display: 'flex', flexDirection: 'column',
                justifyContent: 'center',
                padding: '24px 40px',
                position: 'relative' as const,
                flex: 1,
              }}>
                {/* Team name */}
                <div style={{
                  display: 'flex',
                  fontSize: 15, fontWeight: 700, letterSpacing: 2,
                  color: sk.nickColor(),
                  textTransform: 'uppercase' as const,
                  textShadow: TEXT_SHADOW,
                  marginBottom: 4,
                }}>
                  {nick}
                </div>

                {/* Score */}
                <div style={{
                  display: 'flex',
                  fontSize: 56, fontWeight: 800, lineHeight: 1,
                  color: sk.scoreColor(isW, '#ffffff'),
                  textShadow: '0 3px 12px rgba(0,0,0,0.5)',
                  marginBottom: 14,
                }}>
                  {fmt(td.score)}
                </div>

                {/* Players */}
                <div style={{
                  display: 'flex', flexDirection: 'column',
                  gap: 5,
                }}>
                  {shown.map((asset, i) => (
                    <div key={`${asset.name}-${i}`} style={{
                      display: 'flex', flexDirection: 'column',
                    }}>
                      <div style={{
                        display: 'flex', alignItems: 'baseline', gap: 8,
                        fontSize: 14, lineHeight: 1.3,
                      }}>
                        <div style={{
                          display: 'flex',
                          color: sk.playerNameColor,
                          textShadow: TEXT_SHADOW,
                        }}>
                          {asset.name}
                        </div>
                        <div style={{
                          display: 'flex',
                          color: sk.playerScoreColor(isW),
                          fontWeight: 700,
                          textShadow: TEXT_SHADOW,
                        }}>
                          {fmt(asset.score)}
                        </div>
                      </div>
                      {renderPlayerDetail(asset, spotlight, 10)}
                    </div>
                  ))}
                  {rest > 0 && (
                    <div style={{
                      display: 'flex',
                      fontSize: 11, color: sk.restColor,
                      textShadow: TEXT_SHADOW,
                    }}>
                      {`+ ${rest} more`}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Center band after first team (or between teams for 3+) */}
            {idx === 0 && (
              <div style={{
                height: bandHeight,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: sk.verdictBg,
                gap: 4,
              }}>
                {headline && (
                  <div style={{
                    display: 'flex',
                    fontSize: 22, fontWeight: 800, letterSpacing: 1,
                    color: sk.headlineColor,
                  }}>
                    {headline}
                  </div>
                )}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                }}>
                  <div style={{
                    display: 'flex',
                    fontSize: 14, fontWeight: 700,
                    color: sk.verdictColor(
                      winner ? '#ffffff' : null
                    ),
                    letterSpacing: 1,
                    textTransform: 'uppercase' as const,
                  }}>
                    {verdict}
                  </div>
                  {spotlight.detailedVerdict && winner && (
                    <div style={{
                      display: 'flex',
                      fontSize: 11, color: sk.detailedVerdictColor,
                    }}>
                      {teams.map(([tid, td]) => `${TEAM_NICK[tid] || tid} ${fmt(td.score)}`).join(' \u2013 ')}
                    </div>
                  )}
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{
                    display: 'flex',
                    fontSize: 10, fontWeight: 700, letterSpacing: 3,
                    color: sk.brandColor,
                    textTransform: 'uppercase' as const,
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
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Story Layout (1080×1920) — Instagram story ──────────────────
// Top section: Team A with large hero. Center band: headline/date/verdict.
// Bottom section: Team B with large hero.

function tradeCardStory(data: TradeVerdictData): React.ReactElement {
  const { date, league, teamScores, winner, lopsidedness, heroImages } = data;
  const spotlight = resolveSpotlight(data.spotlight);
  const sk = resolveSkin(data.skin);
  const skinId = data.skin || 'classic';
  const teams = sortTeams(teamScores, winner);
  const headline = buildHeadline(teamScores);
  const verdict = verdictText(winner, lopsidedness);
  const bandHeight = 400;
  const sectionHeight = Math.floor((1920 - bandHeight) / teams.length);

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      backgroundColor: '#0a0a0f',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#ffffff',
    }}>
      {renderAccentBar(teams, sk, 6)}

      {teams.map(([teamId, td], idx) => {
        const isW = teamId === winner;
        const raw = CARD_TEAM_COLORS[teamId] || '#888';
        const sec = CARD_TEAM_SECONDARY[teamId] || raw;
        const nick = TEAM_NICK[teamId] || teamId;
        const sorted = [...td.assets].sort((a, b) => b.score - a.score);
        const heroUrls = heroImages?.[teamId] || [];
        const heroUrl = heroUrls[0];
        const heroW = 620;
        const heroH = Math.round(heroW * 0.733);

        return (
          <div key={teamId} style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{
              height: sectionHeight,
              display: 'flex',
              position: 'relative' as const,
              overflow: 'hidden',
              background: sk.sectionBg(raw, sec, isW),
            }}>
              {renderSectionOverlay(skinId)}

              {/* Large hero cutout */}
              {heroUrl && (
                <img
                  src={heroUrl}
                  width={heroW}
                  height={heroH}
                  alt=""
                  style={{
                    position: 'absolute' as const,
                    right: -30,
                    bottom: 0,
                    width: heroW,
                    height: heroH,
                    opacity: isW ? 0.5 : 0.3,
                  }}
                />
              )}

              {/* Dark gradient from left */}
              <div style={{
                position: 'absolute' as const,
                top: 0, bottom: 0, left: 0,
                width: '65%',
                display: 'flex',
                background: 'linear-gradient(90deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)',
              }} />

              {/* Text content */}
              <div style={{
                display: 'flex', flexDirection: 'column',
                justifyContent: 'center',
                padding: '32px 48px',
                position: 'relative' as const,
                flex: 1,
              }}>
                {/* Team name */}
                <div style={{
                  display: 'flex',
                  fontSize: 18, fontWeight: 700, letterSpacing: 2,
                  color: sk.nickColor(),
                  textTransform: 'uppercase' as const,
                  textShadow: TEXT_SHADOW,
                  marginBottom: 6,
                }}>
                  {nick}
                </div>

                {/* Score */}
                <div style={{
                  display: 'flex',
                  fontSize: 64, fontWeight: 800, lineHeight: 1,
                  color: sk.scoreColor(isW, '#ffffff'),
                  textShadow: '0 4px 16px rgba(0,0,0,0.5)',
                  marginBottom: 20,
                }}>
                  {fmt(td.score)}
                </div>

                {/* All players */}
                <div style={{
                  display: 'flex', flexDirection: 'column',
                  gap: 8,
                }}>
                  {sorted.map((asset, i) => (
                    <div key={`${asset.name}-${i}`} style={{
                      display: 'flex', flexDirection: 'column',
                    }}>
                      <div style={{
                        display: 'flex', alignItems: 'baseline', gap: 10,
                        fontSize: 16, lineHeight: 1.3,
                      }}>
                        <div style={{
                          display: 'flex',
                          color: sk.playerNameColor,
                          textShadow: TEXT_SHADOW,
                        }}>
                          {asset.name}
                        </div>
                        <div style={{
                          display: 'flex',
                          color: sk.playerScoreColor(isW),
                          fontWeight: 700,
                          textShadow: TEXT_SHADOW,
                        }}>
                          {fmt(asset.score)}
                        </div>
                      </div>
                      {renderPlayerDetail(asset, spotlight, 11)}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Center band after first team */}
            {idx === 0 && (
              <div style={{
                height: bandHeight,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: sk.verdictBg,
                gap: 12,
                padding: '0 48px',
              }}>
                <div style={{
                  display: 'flex',
                  fontSize: 12, fontWeight: 700, letterSpacing: 4,
                  color: sk.brandColor,
                  textTransform: 'uppercase' as const,
                }}>
                  {`${league === 'WNBA' ? 'WNBA' : 'NBA'} Trade Mapper`}
                </div>
                {headline && (
                  <div style={{
                    display: 'flex',
                    fontSize: 36, fontWeight: 800, letterSpacing: 1,
                    color: sk.headlineColor,
                    textAlign: 'center' as const,
                  }}>
                    {headline}
                  </div>
                )}
                {date && (
                  <div style={{
                    display: 'flex',
                    fontSize: 16, color: sk.dateColor,
                  }}>
                    {formatDate(date)}
                  </div>
                )}
                <div style={{
                  display: 'flex',
                  fontSize: 18, fontWeight: 700,
                  color: sk.verdictColor(
                    winner ? '#ffffff' : null
                  ),
                  letterSpacing: 1,
                  textTransform: 'uppercase' as const,
                  marginTop: 8,
                }}>
                  {verdict}
                </div>
                {spotlight.detailedVerdict && winner && (
                  <div style={{
                    display: 'flex',
                    fontSize: 13, color: sk.detailedVerdictColor,
                  }}>
                    {teams.map(([tid, td]) => `${TEAM_NICK[tid] || tid} ${fmt(td.score)}`).join(' \u2013 ')}
                  </div>
                )}
                <div style={{
                  display: 'flex',
                  fontSize: 12, color: sk.footerColor,
                  marginTop: 8,
                }}>
                  nbatrades.vercel.app
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
