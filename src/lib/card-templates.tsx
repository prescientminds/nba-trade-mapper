// ── Shareable card templates for OG image generation (Satori / next-og) ──
//
// These functions return React elements compatible with ImageResponse.
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

// ── Types ───────────────────────────────────────────────────────

export interface AssetScore {
  name: string;
  type: string;
  score: number;
  ws?: number;
  playoff_ws?: number;
  championships?: number;
  accolades?: string[];
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
  /** teamId → headshot URL for the top player on each side */
  heroImages?: Record<string, string>;
}

// ── Trade Verdict Card ──────────────────────────────────────────
//
// Layout (F-pattern, 1200×630 default):
//   Top: accent bar (team colors)
//   Header: branding left, date right
//   Body: two team columns (winner panel tinted), hero score + top players
//   Footer: verdict line + URL

export function tradeVerdictCard(data: TradeVerdictData): React.ReactElement {
  const { date, league, teamScores, winner, lopsidedness, heroImages } = data;
  // Winner column first (left) for F-pattern readability
  const teams = Object.entries(teamScores).sort((a, b) => {
    if (winner) {
      if (a[0] === winner) return -1;
      if (b[0] === winner) return 1;
    }
    return b[1].score - a[1].score;
  });
  const maxShow = teams.length > 2 ? 3 : 4;

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      backgroundColor: '#0f0f17',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#ffffff',
    }}>

      {/* ── Accent bar (pinned top) ── */}
      <div style={{ display: 'flex', height: 6, flexShrink: 0 }}>
        {teams.map(([tid]) => (
          <div key={tid} style={{
            flex: 1,
            backgroundColor: CARD_TEAM_COLORS[tid] || '#444',
          }} />
        ))}
      </div>

      {/* ── Center content area ── */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        flex: 1, justifyContent: 'center',
        padding: '0 48px',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 16,
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

        {/* Team columns */}
        <div style={{
          display: 'flex',
          gap: 20,
        }}>
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
                padding: '24px 28px',
                borderRadius: 12,
                background: isW
                  ? hexToRgba(raw, 0.07)
                  : 'rgba(255,255,255,0.03)',
                border: isW
                  ? `1px solid ${hexToRgba(raw, 0.2)}`
                  : '1px solid rgba(255,255,255,0.06)',
                position: 'relative' as const,
                overflow: 'hidden',
              }}>

                {/* Hero player headshot — subtle background overlay */}
                {heroUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={heroUrl}
                    width={460}
                    height={345}
                    style={{
                      position: 'absolute',
                      right: -100,
                      top: -30,
                      width: 460,
                      height: 345,
                      opacity: isW ? 0.16 : 0.09,
                    }}
                  />
                )}

                {/* Team name */}
                <div style={{
                  display: 'flex', alignItems: 'center',
                  fontSize: 15, fontWeight: 700, letterSpacing: 2,
                  color: bright,
                  textTransform: 'uppercase' as const,
                  position: 'relative' as const,
                }}>
                  {nick}
                </div>

                {/* Hero score */}
                <div style={{
                  display: 'flex',
                  fontSize: 52, fontWeight: 800, lineHeight: 1,
                  color: isW ? bright : 'rgba(255,255,255,0.3)',
                  marginTop: 8,
                  position: 'relative' as const,
                }}>
                  {fmt(td.score)}
                </div>

                {/* Player list */}
                <div style={{
                  display: 'flex', flexDirection: 'column',
                  marginTop: 20, gap: 7,
                  position: 'relative' as const,
                }}>
                  {shown.map((asset, i) => (
                    <div key={`${asset.name}-${i}`} style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'baseline',
                      fontSize: 14, lineHeight: 1.2,
                    }}>
                      <div style={{
                        display: 'flex',
                        color: 'rgba(255,255,255,0.65)',
                        overflow: 'hidden',
                        maxWidth: '72%',
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
            );
          })}
        </div>

        {/* Verdict */}
        <div style={{
          display: 'flex', justifyContent: 'center',
          marginTop: 20,
        }}>
          {winner ? (
            <div style={{
              display: 'flex',
              fontSize: 14, fontWeight: 700,
              color: ensureBright(CARD_TEAM_COLORS[winner] || '#fff'),
              letterSpacing: 1,
              textTransform: 'uppercase' as const,
            }}>
              {`${TEAM_NICK[winner] || winner} won${lopsidedness > 0 ? ` \u00b7 ${fmt(lopsidedness)} margin` : ''}`}
            </div>
          ) : (
            <div style={{
              display: 'flex',
              fontSize: 14, fontWeight: 600,
              color: 'rgba(255,255,255,0.35)',
              letterSpacing: 1,
              textTransform: 'uppercase' as const,
            }}>
              Too close to call
            </div>
          )}
        </div>

      </div>

      {/* ── Footer (pinned bottom) ── */}
      <div style={{
        display: 'flex', justifyContent: 'center',
        padding: '0 48px 20px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', fontSize: 11, color: 'rgba(255,255,255,0.18)' }}>
          nbatrades.vercel.app
        </div>
      </div>
    </div>
  );
}
