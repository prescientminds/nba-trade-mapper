/* eslint-disable @next/next/no-img-element */
// ── Shareable card templates for OG image generation (Satori / next-og) ──
//
// Three format-specific layouts: OG (1200×630), Square (1080×1080), Story (1080×1920).
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

/** Lighten dark team colors so they read on a dark card background. */
function ensureBright(hex: string): string {
  const c = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum > 0.35) return hex;
  const f = 0.45;
  const lr = Math.round(r + (255 - r) * f);
  const lg = Math.round(g + (255 - g) * f);
  const lb = Math.round(b + (255 - b) * f);
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
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
  if (t.includes('mvp')) return { bg: 'rgba(249,199,79,0.15)', fg: '#f9c74f' };
  if (t.includes('dpoy')) return { bg: 'rgba(78,205,196,0.15)', fg: '#4ecdc4' };
  if (t.includes('all-star')) return { bg: 'rgba(155,93,229,0.15)', fg: '#9b5de5' };
  if (t.includes('all-nba')) return { bg: 'rgba(255,107,53,0.15)', fg: '#ff6b35' };
  if (t.includes('roy')) return { bg: 'rgba(6,214,160,0.15)', fg: '#06d6a0' };
  if (t.includes('all-def')) return { bg: 'rgba(78,205,196,0.12)', fg: '#4ecdc4' };
  return { bg: 'rgba(255,255,255,0.08)', fg: 'rgba(255,255,255,0.5)' };
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
  heroImages?: Record<string, string>;
  spotlight?: Partial<SpotlightOptions>;
  format?: 'og' | 'square' | 'story';
}

// ── Shared render piece ─────────────────────────────────────────

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

  const dim = { bg: 'rgba(255,255,255,0.06)', fg: 'rgba(255,255,255,0.4)' };
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

function tradeCardOG(data: TradeVerdictData): React.ReactElement {
  const { date, league, teamScores, winner, lopsidedness, heroImages } = data;
  const spotlight = resolveSpotlight(data.spotlight);
  const teams = sortTeams(teamScores, winner);
  const headline = buildHeadline(teamScores);
  const verdict = verdictText(winner, lopsidedness);
  const maxShow = teams.length > 2 ? 2 : 3;

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      backgroundColor: '#0f0f17',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#ffffff',
    }}>
      {/* Accent bar */}
      <div style={{ display: 'flex', height: 6, flexShrink: 0 }}>
        {teams.map(([tid]) => (
          <div key={tid} style={{ flex: 1, backgroundColor: CARD_TEAM_COLORS[tid] || '#444' }} />
        ))}
      </div>

      {/* Main content */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        flex: 1, padding: '0 44px',
        justifyContent: 'center',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 8,
        }}>
          <div style={{
            display: 'flex',
            fontSize: 12, fontWeight: 700, letterSpacing: 3,
            color: 'rgba(255,255,255,0.3)',
            textTransform: 'uppercase' as const,
          }}>
            {`${league === 'WNBA' ? 'WNBA' : 'NBA'} Trade Mapper`}
          </div>
          {date && (
            <div style={{ display: 'flex', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
              {formatDate(date)}
            </div>
          )}
        </div>

        {/* Headline */}
        {headline && (
          <div style={{
            display: 'flex', justifyContent: 'center',
            marginBottom: 16,
          }}>
            <div style={{
              display: 'flex',
              fontSize: 32, fontWeight: 800, letterSpacing: 1,
              color: '#ffffff',
            }}>
              {headline}
            </div>
          </div>
        )}

        {/* Team panels */}
        <div style={{ display: 'flex', gap: 16 }}>
          {teams.map(([teamId, td]) => {
            const isW = teamId === winner;
            const raw = CARD_TEAM_COLORS[teamId] || '#888';
            const bright = ensureBright(raw);
            const nick = TEAM_NICK[teamId] || teamId;
            const sorted = [...td.assets].sort((a, b) => b.score - a.score);
            const shown = sorted.slice(0, maxShow);
            const rest = sorted.length - shown.length;
            const heroUrl = heroImages?.[teamId];

            return (
              <div key={teamId} style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                padding: '18px 22px',
                borderRadius: 10,
                background: isW ? hexToRgba(raw, 0.08) : 'rgba(255,255,255,0.03)',
                border: isW
                  ? `1px solid ${hexToRgba(raw, 0.25)}`
                  : '1px solid rgba(255,255,255,0.06)',
                position: 'relative' as const,
                overflow: 'hidden',
              }}>
                {heroUrl && (
                  <img
                    src={heroUrl}
                    width={400}
                    height={300}
                    style={{
                      position: 'absolute' as const,
                      right: -80, top: -20,
                      width: 400, height: 300,
                      opacity: isW ? 0.18 : 0.08,
                    }}
                  />
                )}

                {/* Team header: name + score */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  position: 'relative' as const,
                  marginBottom: 14,
                }}>
                  <div style={{
                    display: 'flex',
                    fontSize: 14, fontWeight: 700, letterSpacing: 2,
                    color: bright,
                    textTransform: 'uppercase' as const,
                  }}>
                    {nick}
                  </div>
                  <div style={{
                    display: 'flex',
                    fontSize: 32, fontWeight: 800, lineHeight: 1,
                    color: isW ? bright : 'rgba(255,255,255,0.3)',
                  }}>
                    {fmt(td.score)}
                  </div>
                </div>

                {/* Player rows */}
                <div style={{
                  display: 'flex', flexDirection: 'column',
                  gap: 5, position: 'relative' as const,
                }}>
                  {shown.map((asset, i) => (
                    <div key={`${asset.name}-${i}`} style={{
                      display: 'flex', flexDirection: 'column',
                    }}>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'baseline',
                        fontSize: 13, lineHeight: 1.3,
                      }}>
                        <div style={{
                          display: 'flex',
                          color: 'rgba(255,255,255,0.65)',
                          maxWidth: '72%',
                          overflow: 'hidden',
                        }}>
                          {asset.name}
                        </div>
                        <div style={{
                          display: 'flex',
                          color: isW ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.5)',
                          fontWeight: 600,
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
                      fontSize: 11, color: 'rgba(255,255,255,0.25)',
                      marginTop: 2,
                    }}>
                      {`+ ${rest} other${rest > 1 ? 's' : ''}`}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Verdict */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          marginTop: 16, gap: 4,
        }}>
          <div style={{
            display: 'flex',
            fontSize: 14, fontWeight: 700,
            color: winner
              ? ensureBright(CARD_TEAM_COLORS[winner] || '#fff')
              : 'rgba(255,255,255,0.35)',
            letterSpacing: 1,
            textTransform: 'uppercase' as const,
          }}>
            {verdict}
          </div>
          {spotlight.detailedVerdict && winner && (
            <div style={{
              display: 'flex',
              fontSize: 11, color: 'rgba(255,255,255,0.25)',
            }}>
              {teams.map(([tid, td]) => `${TEAM_NICK[tid] || tid} ${fmt(td.score)}`).join(' \u2013 ')}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', justifyContent: 'center',
        padding: '0 44px 16px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', fontSize: 11, color: 'rgba(255,255,255,0.18)' }}>
          nbatrades.vercel.app
        </div>
      </div>
    </div>
  );
}

// ── Square Layout (1080×1080) — Instagram feed ──────────────────

function tradeCardSquare(data: TradeVerdictData): React.ReactElement {
  const { date, league, teamScores, winner, lopsidedness, heroImages } = data;
  const spotlight = resolveSpotlight(data.spotlight);
  const teams = sortTeams(teamScores, winner);
  const headline = buildHeadline(teamScores);
  const verdict = verdictText(winner, lopsidedness);
  const maxShow = 5;

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      backgroundColor: '#0f0f17',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#ffffff',
    }}>
      {/* Accent bar */}
      <div style={{ display: 'flex', height: 6, flexShrink: 0 }}>
        {teams.map(([tid]) => (
          <div key={tid} style={{ flex: 1, backgroundColor: CARD_TEAM_COLORS[tid] || '#444' }} />
        ))}
      </div>

      {/* Content */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        flex: 1, padding: '0 48px',
        justifyContent: 'center',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 8,
        }}>
          <div style={{
            display: 'flex',
            fontSize: 13, fontWeight: 700, letterSpacing: 3,
            color: 'rgba(255,255,255,0.3)',
            textTransform: 'uppercase' as const,
          }}>
            {`${league === 'WNBA' ? 'WNBA' : 'NBA'} Trade Mapper`}
          </div>
          {date && (
            <div style={{ display: 'flex', fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
              {formatDate(date)}
            </div>
          )}
        </div>

        {/* Headline */}
        {headline && (
          <div style={{
            display: 'flex', justifyContent: 'center',
            marginBottom: 24,
          }}>
            <div style={{
              display: 'flex',
              fontSize: 36, fontWeight: 800, letterSpacing: 1,
              color: '#ffffff',
            }}>
              {headline}
            </div>
          </div>
        )}

        {/* Stacked team panels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {teams.map(([teamId, td], teamIndex) => {
            const isW = teamId === winner;
            const raw = CARD_TEAM_COLORS[teamId] || '#888';
            const bright = ensureBright(raw);
            const nick = TEAM_NICK[teamId] || teamId;
            const sorted = [...td.assets].sort((a, b) => b.score - a.score);
            const shown = sorted.slice(0, maxShow);
            const rest = sorted.length - shown.length;
            const heroUrl = heroImages?.[teamId];

            return (
              <div key={teamId} style={{ display: 'flex', flexDirection: 'column' }}>
                {teamIndex > 0 && (
                  <div style={{
                    display: 'flex', justifyContent: 'center',
                    padding: '16px 0',
                  }}>
                    <div style={{
                      width: '100%', height: 1,
                      backgroundColor: 'rgba(255,255,255,0.08)',
                    }} />
                  </div>
                )}

                <div style={{
                  display: 'flex', flexDirection: 'column',
                  padding: '20px 24px',
                  borderRadius: 10,
                  background: isW ? hexToRgba(raw, 0.07) : 'rgba(255,255,255,0.03)',
                  border: isW
                    ? `1px solid ${hexToRgba(raw, 0.2)}`
                    : '1px solid rgba(255,255,255,0.06)',
                  position: 'relative' as const,
                  overflow: 'hidden',
                }}>
                  {heroUrl && (
                    <img
                      src={heroUrl}
                      width={500}
                      height={375}
                      style={{
                        position: 'absolute' as const,
                        right: -100, top: -40,
                        width: 500, height: 375,
                        opacity: isW ? 0.14 : 0.07,
                      }}
                    />
                  )}

                  {/* Team header */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    position: 'relative' as const,
                    marginBottom: 14,
                  }}>
                    <div style={{
                      display: 'flex',
                      fontSize: 15, fontWeight: 700, letterSpacing: 2,
                      color: bright,
                      textTransform: 'uppercase' as const,
                    }}>
                      {nick}
                    </div>
                    <div style={{
                      display: 'flex',
                      fontSize: 36, fontWeight: 800, lineHeight: 1,
                      color: isW ? bright : 'rgba(255,255,255,0.3)',
                    }}>
                      {fmt(td.score)}
                    </div>
                  </div>

                  {/* Player rows */}
                  <div style={{
                    display: 'flex', flexDirection: 'column',
                    gap: 6, position: 'relative' as const,
                  }}>
                    {shown.map((asset, i) => (
                      <div key={`${asset.name}-${i}`} style={{
                        display: 'flex', flexDirection: 'column',
                      }}>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between',
                          alignItems: 'baseline',
                          fontSize: 14, lineHeight: 1.3,
                        }}>
                          <div style={{
                            display: 'flex',
                            color: 'rgba(255,255,255,0.65)',
                            maxWidth: '75%',
                          }}>
                            {asset.name}
                          </div>
                          <div style={{
                            display: 'flex',
                            color: isW ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.5)',
                            fontWeight: 600,
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
                        fontSize: 12, color: 'rgba(255,255,255,0.25)',
                        marginTop: 2,
                      }}>
                        {`+ ${rest} other${rest > 1 ? 's' : ''}`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Verdict */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          marginTop: 24, gap: 4,
        }}>
          <div style={{
            display: 'flex',
            fontSize: 16, fontWeight: 700,
            color: winner
              ? ensureBright(CARD_TEAM_COLORS[winner] || '#fff')
              : 'rgba(255,255,255,0.35)',
            letterSpacing: 1,
            textTransform: 'uppercase' as const,
          }}>
            {verdict}
          </div>
          {spotlight.detailedVerdict && winner && (
            <div style={{
              display: 'flex',
              fontSize: 12, color: 'rgba(255,255,255,0.25)',
            }}>
              {teams.map(([tid, td]) => `${TEAM_NICK[tid] || tid} ${fmt(td.score)}`).join(' \u2013 ')}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', justifyContent: 'center',
        padding: '0 48px 24px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', fontSize: 11, color: 'rgba(255,255,255,0.18)' }}>
          nbatrades.vercel.app
        </div>
      </div>
    </div>
  );
}

// ── Story Layout (1080×1920) — Instagram story ──────────────────

function tradeCardStory(data: TradeVerdictData): React.ReactElement {
  const { date, league, teamScores, winner, lopsidedness, heroImages } = data;
  const spotlight = resolveSpotlight(data.spotlight);
  const teams = sortTeams(teamScores, winner);
  const headline = buildHeadline(teamScores);
  const verdict = verdictText(winner, lopsidedness);

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      backgroundColor: '#0f0f17',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#ffffff',
    }}>
      {/* Accent bar */}
      <div style={{ display: 'flex', height: 6, flexShrink: 0 }}>
        {teams.map(([tid]) => (
          <div key={tid} style={{ flex: 1, backgroundColor: CARD_TEAM_COLORS[tid] || '#444' }} />
        ))}
      </div>

      {/* Content */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        flex: 1, padding: '0 48px',
        justifyContent: 'center',
      }}>
        {/* Header — centered */}
        <div style={{
          display: 'flex', justifyContent: 'center',
          marginBottom: 8,
        }}>
          <div style={{
            display: 'flex',
            fontSize: 13, fontWeight: 700, letterSpacing: 3,
            color: 'rgba(255,255,255,0.3)',
            textTransform: 'uppercase' as const,
          }}>
            {`${league === 'WNBA' ? 'WNBA' : 'NBA'} Trade Mapper`}
          </div>
        </div>

        {/* Headline */}
        {headline && (
          <div style={{
            display: 'flex', justifyContent: 'center',
            marginBottom: 8,
          }}>
            <div style={{
              display: 'flex',
              fontSize: 42, fontWeight: 800, letterSpacing: 1,
              color: '#ffffff',
              textAlign: 'center' as const,
            }}>
              {headline}
            </div>
          </div>
        )}

        {/* Date */}
        {date && (
          <div style={{
            display: 'flex', justifyContent: 'center',
            marginBottom: 32,
          }}>
            <div style={{
              display: 'flex',
              fontSize: 16, color: 'rgba(255,255,255,0.35)',
            }}>
              {formatDate(date)}
            </div>
          </div>
        )}

        {/* Stacked team sections — show ALL players */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {teams.map(([teamId, td], teamIndex) => {
            const isW = teamId === winner;
            const raw = CARD_TEAM_COLORS[teamId] || '#888';
            const bright = ensureBright(raw);
            const nick = TEAM_NICK[teamId] || teamId;
            const sorted = [...td.assets].sort((a, b) => b.score - a.score);
            const heroUrl = heroImages?.[teamId];

            return (
              <div key={teamId} style={{ display: 'flex', flexDirection: 'column' }}>
                {teamIndex > 0 && (
                  <div style={{
                    display: 'flex', justifyContent: 'center',
                    padding: '24px 0',
                  }}>
                    <div style={{
                      width: '100%', height: 1,
                      backgroundColor: 'rgba(255,255,255,0.08)',
                    }} />
                  </div>
                )}

                <div style={{
                  display: 'flex', flexDirection: 'column',
                  padding: '24px 28px',
                  borderRadius: 12,
                  background: isW ? hexToRgba(raw, 0.07) : 'rgba(255,255,255,0.03)',
                  border: isW
                    ? `1px solid ${hexToRgba(raw, 0.2)}`
                    : '1px solid rgba(255,255,255,0.06)',
                  position: 'relative' as const,
                  overflow: 'hidden',
                }}>
                  {/* Team color bar at top of section */}
                  <div style={{
                    position: 'absolute' as const,
                    top: 0, left: 0, right: 0,
                    height: 4,
                    backgroundColor: raw,
                    opacity: 0.6,
                  }} />

                  {heroUrl && (
                    <img
                      src={heroUrl}
                      width={520}
                      height={390}
                      style={{
                        position: 'absolute' as const,
                        right: -80, top: -30,
                        width: 520, height: 390,
                        opacity: isW ? 0.16 : 0.08,
                      }}
                    />
                  )}

                  {/* Team header */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    position: 'relative' as const,
                    marginBottom: 18, marginTop: 8,
                  }}>
                    <div style={{
                      display: 'flex',
                      fontSize: 18, fontWeight: 700, letterSpacing: 2,
                      color: bright,
                      textTransform: 'uppercase' as const,
                    }}>
                      {nick}
                    </div>
                    <div style={{
                      display: 'flex',
                      fontSize: 42, fontWeight: 800, lineHeight: 1,
                      color: isW ? bright : 'rgba(255,255,255,0.3)',
                    }}>
                      {fmt(td.score)}
                    </div>
                  </div>

                  {/* ALL player rows */}
                  <div style={{
                    display: 'flex', flexDirection: 'column',
                    gap: 8, position: 'relative' as const,
                  }}>
                    {sorted.map((asset, i) => (
                      <div key={`${asset.name}-${i}`} style={{
                        display: 'flex', flexDirection: 'column',
                      }}>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between',
                          alignItems: 'baseline',
                          fontSize: 16, lineHeight: 1.3,
                        }}>
                          <div style={{
                            display: 'flex',
                            color: 'rgba(255,255,255,0.7)',
                            maxWidth: '75%',
                          }}>
                            {asset.name}
                          </div>
                          <div style={{
                            display: 'flex',
                            color: isW ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.5)',
                            fontWeight: 600,
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
            );
          })}
        </div>

        {/* Verdict */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          marginTop: 32, gap: 6,
        }}>
          <div style={{
            display: 'flex',
            fontSize: 18, fontWeight: 700,
            color: winner
              ? ensureBright(CARD_TEAM_COLORS[winner] || '#fff')
              : 'rgba(255,255,255,0.35)',
            letterSpacing: 1,
            textTransform: 'uppercase' as const,
          }}>
            {verdict}
          </div>
          {spotlight.detailedVerdict && winner && (
            <div style={{
              display: 'flex',
              fontSize: 13, color: 'rgba(255,255,255,0.25)',
            }}>
              {teams.map(([tid, td]) => `${TEAM_NICK[tid] || tid} ${fmt(td.score)}`).join(' \u2013 ')}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', justifyContent: 'center',
        padding: '0 48px 32px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', fontSize: 12, color: 'rgba(255,255,255,0.18)' }}>
          nbatrades.vercel.app
        </div>
      </div>
    </div>
  );
}
