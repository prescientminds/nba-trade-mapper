'use client';

// ── Share card — redesigned with 4 distinct skins + headshot support ──
// Classic (Fleer): cream/warm, team color borders, dark text
// Prizm (Panini): chrome shimmer, holographic band, silver tones
// Noir (BR-inspired): true black, massive white type, player photo dominant
// Retro (Skybox): full-saturation team colors, bold geometry, neon accents

import { CARD_TEAM_COLORS, CARD_TEAM_SECONDARY } from '@/lib/card-templates';
import type { TeamScoreEntry, AssetScore, SpotlightOptions } from '@/lib/card-templates';
import type { CardSkin } from '@/lib/skins';
import { THEMES, ha, type SkinTheme } from '@/components/cards/shared/skins';

// ── Team nicknames ──────────────────────────────────────────

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

// ── Helpers ─────────────────────────────────────────────────

function fmt(n: number): string {
  if (n === 0) return '0.0';
  if (Math.abs(n) >= 100) return Math.round(n).toString();
  return n.toFixed(1);
}

function verdictLabel(winner: string | null, lop: number): string {
  if (!winner) return 'TOO CLOSE TO CALL';
  const nick = (TEAM_NICK[winner] || winner).toUpperCase();
  if (lop >= 50) return `THE ${nick} COMMITTED ROBBERY`;
  if (lop >= 20) return `THE ${nick} DOMINATED`;
  if (lop >= 5) return `THE ${nick} WON CLEARLY`;
  return `THE ${nick} HAD A SLIGHT EDGE`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(s?: string | null): string {
  if (!s) return '';
  const p = s.split('-');
  if (p.length < 3) return s;
  return `${MONTHS[parseInt(p[1], 10) - 1]} ${parseInt(p[2], 10)}, ${p[0]}`;
}

function compressAccolades(accolades: string[], max = 3): string[] {
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
  return Object.entries(groups)
    .sort((a, b) => {
      const ai = priority.indexOf(a[0]);
      const bi = priority.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .slice(0, max)
    .map(([label, count]) => count > 1 ? `${count}\u00d7 ${label}` : label);
}

// ── Types ───────────────────────────────────────────────────

export interface ShareCardProps {
  teamScores: Record<string, TeamScoreEntry>;
  winner: string | null;
  lopsidedness: number;
  date?: string | null;
  league?: string;
  selectedPlayers?: Record<string, string[]>;
  spotlight: SpotlightOptions;
  format: 'og' | 'square' | 'story';
  skin?: CardSkin;
  /** Pre-loaded headshot data URLs per team */
  headshots?: Record<string, string[]>;
}

function filterAssets(
  assets: AssetScore[],
  teamId: string,
  selected?: Record<string, string[]>,
): [AssetScore[], number] {
  const sorted = [...assets].sort((a, b) => b.score - a.score);
  if (!selected || !selected[teamId]) return [sorted, 0];
  const sel = new Set(selected[teamId]);
  const shown = sorted.filter(a => sel.has(a.name));
  return [shown, sorted.length - shown.length];
}

function sizeTier(
  teamScores: Record<string, TeamScoreEntry>,
  selected?: Record<string, string[]>,
): number {
  let maxPerTeam = 0;
  for (const [teamId, td] of Object.entries(teamScores)) {
    if (selected && selected[teamId]) {
      maxPerTeam = Math.max(maxPerTeam, selected[teamId].length);
    } else {
      maxPerTeam = Math.max(maxPerTeam, td.assets.length);
    }
  }
  return Math.min(maxPerTeam, 3);
}

function sortTeams(teamScores: Record<string, TeamScoreEntry>, winner: string | null) {
  return Object.entries(teamScores).sort((a, b) => {
    if (winner) { if (a[0] === winner) return -1; if (b[0] === winner) return 1; }
    return b[1].score - a[1].score;
  }) as [string, TeamScoreEntry][];
}

// ── Stat pills ──────────────────────────────────────────────

function StatPills({ asset, spotlight, fontSize, sk }: {
  asset: AssetScore;
  spotlight: SpotlightOptions;
  fontSize: number;
  sk: SkinTheme;
}) {
  const items: { text: string; bg: string }[] = [];
  const statCount = [spotlight.accolades, spotlight.winShares, spotlight.playoffWs, spotlight.championships, spotlight.seasons].filter(Boolean).length;
  const accMax = statCount === 1 && spotlight.accolades ? 5 : 3;

  if (spotlight.accolades && asset.accolades?.length) {
    for (const a of compressAccolades(asset.accolades, accMax)) {
      items.push({ text: a, bg: sk.pillBg(a) });
    }
  }
  if (spotlight.winShares && asset.ws != null && asset.ws > 0)
    items.push({ text: `${fmt(asset.ws)} WS`, bg: sk.pillBg('ws') });
  if (spotlight.playoffWs && asset.playoff_ws != null && asset.playoff_ws > 0)
    items.push({ text: `${fmt(asset.playoff_ws)} PWS`, bg: sk.pillBg('ws') });
  if (spotlight.championships && asset.championships != null && asset.championships > 0)
    items.push({ text: `${asset.championships}\u00d7 Champ`, bg: sk.pillBg('champ') });
  if (spotlight.seasons && asset.seasons != null && asset.seasons > 0)
    items.push({ text: `${asset.seasons} Szn`, bg: sk.pillBg('ws') });

  if (!items.length) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 3 }}>
      {items.map((item, i) => (
        <span key={i} style={{
          display: 'inline-block',
          padding: `${Math.round(fontSize * 0.2)}px ${Math.round(fontSize * 0.55)}px`,
          borderRadius: 4,
          background: item.bg,
          color: sk.pillColor,
          fontSize,
          fontWeight: 700,
          lineHeight: 1.3,
          letterSpacing: 0.3,
          border: sk.pillBorder,
        }}>
          {item.text}
        </span>
      ))}
    </div>
  );
}

// ── Headshot image ──────────────────────────────────────────

function HeadshotBg({ src, sk, side }: {
  src?: string;
  sk: SkinTheme;
  side: 'left' | 'right';
}) {
  if (!src) return null;
  return (
    <div style={{
      position: 'absolute',
      bottom: 0,
      [side]: side === 'right' ? -20 : -20,
      width: '70%',
      height: '100%',
      opacity: sk.headshotOpacity,
      filter: sk.headshotFilter,
      pointerEvents: 'none',
    }}>
      <img
        src={src}
        alt=""
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          objectPosition: `${side} bottom`,
        }}
      />
    </div>
  );
}

// ── Team color accent bar (left side for Classic, etc.) ─────

function TeamAccentBar({ color, skin, height }: {
  color: string;
  skin: CardSkin;
  height: string | number;
}) {
  if (skin === 'noir') {
    // Noir: thin team color line at top of section
    return (
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 3,
        background: `linear-gradient(90deg, ${color}, transparent)`,
      }} />
    );
  }
  if (skin === 'classic') {
    // Classic: thick left border bar
    return (
      <div style={{
        position: 'absolute',
        top: 0, left: 0, bottom: 0,
        width: 8,
        background: color,
      }} />
    );
  }
  if (skin === 'retro') {
    // Retro: diagonal cut accent at bottom
    return (
      <div style={{
        position: 'absolute',
        bottom: 0, right: 0,
        width: '30%', height: typeof height === 'number' ? height * 0.15 : 60,
        background: `linear-gradient(135deg, transparent 50%, ${ha(color, 0.3)} 50%)`,
        pointerEvents: 'none',
      }} />
    );
  }
  return null;
}

// ── Watermark ───────────────────────────────────────────────

function Watermark({ teamId, fontSize, color }: { teamId: string; fontSize: number; color: string }) {
  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -58%)',
      fontSize,
      fontWeight: 900,
      color,
      letterSpacing: fontSize > 200 ? -10 : -6,
      lineHeight: 0.85,
      pointerEvents: 'none',
    }}>
      {teamId}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// OG Card — 1200x630, side-by-side team sections
// ══════════════════════════════════════════════════════════════

function OGCard(props: ShareCardProps) {
  const { teamScores, winner, lopsidedness, date, league, selectedPlayers, spotlight, skin = 'classic', headshots } = props;
  const sk = THEMES[skin];
  const teams = sortTeams(teamScores, winner);
  const is3 = teams.length > 2;
  const pc = Math.min(sizeTier(teamScores, selectedPlayers), is3 ? 2 : 3);
  const totalScore = teams.reduce((s, [, d]) => s + d.score, 0) || 1;
  const showBar = spotlight.detailedVerdict;

  const scoreFs = is3 ? 80 : 120;
  const nameFs = is3 ? 20 : pc === 1 ? 34 : pc === 2 ? 28 : 22;
  const indivFs = is3 ? 15 : pc === 1 ? 24 : pc === 2 ? 20 : 16;
  const pillFs = is3 ? 11 : pc === 1 ? 16 : pc === 2 ? 14 : 12;
  const watermarkFs = is3 ? 180 : 280;
  const verdictH = showBar ? 72 : 56;
  const pad = is3 ? 28 : 40;

  return (
    <div style={{
      width: 1200, height: 630,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      background: sk.cardBg,
      border: sk.cardBorder,
      borderRadius: sk.cardRadius,
      boxShadow: sk.cardShadow,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Top accent bar */}
      {sk.accentH > 0 && (
        <div style={{ display: 'flex', height: sk.accentH, flexShrink: 0 }}>
          {teams.map(([tid]) => (
            <div key={tid} style={{ flex: 1, background: CARD_TEAM_COLORS[tid] || '#444' }} />
          ))}
        </div>
      )}

      {/* Main: side-by-side */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {teams.map(([teamId, td], idx) => {
          const c = CARD_TEAM_COLORS[teamId] || '#888';
          const c2 = CARD_TEAM_SECONDARY[teamId] || c;
          const [shown, rest] = filterAssets(td.assets, teamId, selectedPlayers);
          const isLast = idx === teams.length - 1;
          const align = isLast && !is3 ? 'right' as const : 'left' as const;
          const flexAlign = isLast && !is3 ? 'flex-end' as const : 'flex-start' as const;
          const headshotUrl = headshots?.[teamId]?.[0];
          const labelColor = skin === 'classic' ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.3)';

          return (
            <div key={teamId} style={{
              flex: 1,
              display: 'flex', flexDirection: 'column',
              padding: `${is3 ? 16 : 22}px ${skin === 'classic' ? pad + 10 : pad}px`,
              paddingLeft: skin === 'classic' && idx === 0 ? pad + 16 : undefined,
              position: 'relative',
              overflow: 'hidden',
              backgroundImage: sk.sectionBg(c, c2),
              borderRight: idx < teams.length - 1 ? sk.divider : 'none',
            }}>
              {sk.overlay && <div style={sk.overlay} />}
              <TeamAccentBar color={c} skin={skin} height={630 - verdictH} />
              <Watermark teamId={teamId} fontSize={watermarkFs} color={sk.watermarkColor(c)} />
              <HeadshotBg src={headshotUrl} sk={sk} side={isLast && !is3 ? 'right' : 'left'} />

              {/* Team label — top */}
              <div style={{
                fontSize: is3 ? 12 : 14,
                fontWeight: 800,
                letterSpacing: 5,
                color: sk.teamLabelColor(c),
                textTransform: 'uppercase' as const,
                textAlign: align,
                position: 'relative',
                flexShrink: 0,
                marginBottom: is3 ? 10 : 14,
              }}>
                {TEAM_NICK[teamId] || teamId}
              </div>

              {/* Score + label — immediately after team name */}
              <div style={{ position: 'relative', flexShrink: 0, textAlign: align, marginBottom: is3 ? 12 : 18 }}>
                <div style={{
                  fontSize: scoreFs,
                  fontWeight: 900,
                  lineHeight: 0.9,
                  color: sk.scoreColor,
                  textShadow: sk.scoreShadow(c),
                }}>
                  {fmt(td.score)}
                </div>
                <div style={{
                  fontSize: is3 ? 9 : 11,
                  fontWeight: 700,
                  letterSpacing: 3,
                  color: labelColor,
                  textTransform: 'uppercase' as const,
                  marginTop: 6,
                }}>
                  TRADE SCORE
                </div>
              </div>

              {/* Players — fill remaining space */}
              <div style={{
                display: 'flex', flexDirection: 'column',
                gap: pc === 1 ? 10 : 6,
                position: 'relative',
                alignItems: flexAlign,
                flex: 1,
                justifyContent: 'flex-start',
                overflow: 'hidden',
              }}>
                {shown.map((asset, i) => (
                  <div key={`${asset.name}-${i}`} style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: flexAlign,
                    flexShrink: 0,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{
                        fontSize: nameFs, fontWeight: 800,
                        color: sk.nameColor,
                        letterSpacing: -0.3,
                      }}>
                        {asset.name}
                      </span>
                      <span style={{
                        fontSize: indivFs, fontWeight: 700,
                        color: sk.indivScoreColor(c),
                      }}>
                        {fmt(asset.score)}
                      </span>
                    </div>
                    <StatPills asset={asset} spotlight={spotlight} fontSize={pillFs} sk={sk} />
                  </div>
                ))}
                {rest > 0 && (
                  <span style={{
                    fontSize: Math.max(13, nameFs - 6), fontWeight: 600,
                    color: labelColor,
                    flexShrink: 0,
                  }}>
                    + {rest} more
                  </span>
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
        gap: 6, padding: '0 36px',
        background: sk.verdictBg,
        borderTop: sk.divider,
      }}>
        {showBar && (
          <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12, maxWidth: 800 }}>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2, color: CARD_TEAM_COLORS[teams[0][0]] || '#888', width: 40, textAlign: 'right' as const, flexShrink: 0 }}>
              {teams[0][0]}
            </span>
            <div style={{ flex: 1, height: 6, borderRadius: 3, display: 'flex', overflow: 'hidden' }}>
              {teams.map(([tid, td]) => (
                <div key={tid} style={{ width: `${(td.score / totalScore) * 100}%`, height: '100%', background: CARD_TEAM_COLORS[tid] || '#888' }} />
              ))}
            </div>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2, color: CARD_TEAM_COLORS[teams[teams.length - 1][0]] || '#888', width: 40, flexShrink: 0 }}>
              {teams[teams.length - 1][0]}
            </span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <span style={{
            fontSize: 14, fontWeight: 700, letterSpacing: 2,
            color: sk.verdictColor(winner ? CARD_TEAM_COLORS[winner] || '#f9c74f' : null),
            textTransform: 'uppercase' as const,
          }}>
            {verdictLabel(winner, lopsidedness)}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: sk.brandColor, textTransform: 'uppercase' as const }}>
            {league === 'WNBA' ? 'WNBA' : 'NBA'} Trade Mapper
          </span>
          {date && <span style={{ fontSize: 10, color: skin === 'classic' ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.15)' }}>{shortDate(date)}</span>}
        </div>
      </div>

      {/* Bottom accent */}
      {sk.accentH > 0 && (
        <div style={{ display: 'flex', height: Math.max(2, sk.accentH - 1), flexShrink: 0 }}>
          {teams.map(([tid]) => (
            <div key={tid} style={{ flex: 1, background: CARD_TEAM_COLORS[tid] || '#444' }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Square Card — 1080x1080, stacked team sections
// ══════════════════════════════════════════════════════════════

function SquareCard(props: ShareCardProps) {
  const { teamScores, winner, lopsidedness, date, league, selectedPlayers, spotlight, skin = 'classic', headshots } = props;
  const sk = THEMES[skin];
  const teams = sortTeams(teamScores, winner);
  const pc = Math.min(sizeTier(teamScores, selectedPlayers), 3);
  const totalScore = teams.reduce((s, [, d]) => s + d.score, 0) || 1;
  const showBar = spotlight.detailedVerdict;

  const scoreFs = 110;
  const nameFs = pc === 1 ? 36 : pc === 2 ? 30 : 24;
  const indivFs = pc === 1 ? 24 : pc === 2 ? 20 : 17;
  const pillFs = pc === 1 ? 16 : pc === 2 ? 14 : 12;
  const watermarkFs = 240;
  const verdictH = showBar ? 90 : 70;
  const sectionH = Math.floor((1080 - (sk.accentH * 2) - verdictH) / teams.length);

  return (
    <div style={{
      width: 1080, height: 1080,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      background: sk.cardBg,
      border: sk.cardBorder,
      borderRadius: sk.cardRadius,
      boxShadow: sk.cardShadow,
      overflow: 'hidden',
    }}>
      {sk.accentH > 0 && (
        <div style={{ display: 'flex', height: sk.accentH, flexShrink: 0 }}>
          {teams.map(([tid]) => <div key={tid} style={{ flex: 1, background: CARD_TEAM_COLORS[tid] || '#444' }} />)}
        </div>
      )}

      {teams.map(([teamId, td], idx) => {
        const c = CARD_TEAM_COLORS[teamId] || '#888';
        const c2 = CARD_TEAM_SECONDARY[teamId] || c;
        const [shown, rest] = filterAssets(td.assets, teamId, selectedPlayers);
        const headshotUrl = headshots?.[teamId]?.[0];
        const labelColor = skin === 'classic' ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.3)';

        return (
          <div key={teamId} style={{
            height: sectionH,
            display: 'flex', flexDirection: 'column',
            padding: `22px ${skin === 'classic' ? 62 : 52}px`,
            paddingLeft: skin === 'classic' ? 68 : undefined,
            position: 'relative', overflow: 'hidden',
            backgroundImage: sk.sectionBg(c, c2),
            borderBottom: idx < teams.length - 1 ? sk.divider : 'none',
          }}>
            {sk.overlay && <div style={sk.overlay} />}
            <TeamAccentBar color={c} skin={skin} height={sectionH} />
            <Watermark teamId={teamId} fontSize={watermarkFs} color={sk.watermarkColor(c)} />
            <HeadshotBg src={headshotUrl} sk={sk} side="right" />

            {/* Team label */}
            <div style={{
              fontSize: 15, fontWeight: 800, letterSpacing: 5,
              color: sk.teamLabelColor(c), textTransform: 'uppercase' as const,
              position: 'relative', flexShrink: 0, marginBottom: 12,
            }}>
              {TEAM_NICK[teamId] || teamId}
            </div>

            {/* Score + label */}
            <div style={{ position: 'relative', flexShrink: 0, marginBottom: 16 }}>
              <div style={{
                fontSize: scoreFs, fontWeight: 900, lineHeight: 0.9,
                color: sk.scoreColor, textShadow: sk.scoreShadow(c),
              }}>
                {fmt(td.score)}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: labelColor, textTransform: 'uppercase' as const, marginTop: 5 }}>
                TRADE SCORE
              </div>
            </div>

            {/* Players */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: pc === 1 ? 10 : 6, position: 'relative', flex: 1, justifyContent: 'flex-start', overflow: 'hidden' }}>
              {shown.map((asset, i) => (
                <div key={`${asset.name}-${i}`} style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: nameFs, fontWeight: 800, color: sk.nameColor }}>{asset.name}</span>
                    <span style={{ fontSize: indivFs, fontWeight: 700, color: sk.indivScoreColor(c) }}>{fmt(asset.score)}</span>
                  </div>
                  <StatPills asset={asset} spotlight={spotlight} fontSize={pillFs} sk={sk} />
                </div>
              ))}
              {rest > 0 && (
                <span style={{ fontSize: Math.max(14, nameFs - 8), color: labelColor, fontWeight: 600, flexShrink: 0 }}>+ {rest} more</span>
              )}
            </div>
          </div>
        );
      })}

      {/* Verdict */}
      <div style={{
        height: verdictH, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '10px 36px', background: sk.verdictBg,
        borderTop: sk.divider,
      }}>
        {showBar && (
          <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: CARD_TEAM_COLORS[teams[0][0]] || '#888', width: 40, textAlign: 'right' as const, flexShrink: 0 }}>{teams[0][0]}</span>
            <div style={{ flex: 1, height: 8, borderRadius: 4, display: 'flex', overflow: 'hidden' }}>
              {teams.map(([tid, td]) => (
                <div key={tid} style={{ width: `${(td.score / totalScore) * 100}%`, height: '100%', background: CARD_TEAM_COLORS[tid] || '#888' }} />
              ))}
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: CARD_TEAM_COLORS[teams[teams.length - 1][0]] || '#888', width: 40, flexShrink: 0 }}>{teams[teams.length - 1][0]}</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <span style={{
            fontSize: 15, fontWeight: 700, letterSpacing: 2,
            color: sk.verdictColor(winner ? CARD_TEAM_COLORS[winner] || '#f9c74f' : null),
            textTransform: 'uppercase' as const,
          }}>
            {verdictLabel(winner, lopsidedness)}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: sk.brandColor, textTransform: 'uppercase' as const }}>
            {league === 'WNBA' ? 'WNBA' : 'NBA'} Trade Mapper
          </span>
          {date && <span style={{ fontSize: 11, color: skin === 'classic' ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.18)' }}>{shortDate(date)}</span>}
        </div>
      </div>

      {sk.accentH > 0 && (
        <div style={{ display: 'flex', height: Math.max(2, sk.accentH - 1), flexShrink: 0 }}>
          {teams.map(([tid]) => <div key={tid} style={{ flex: 1, background: CARD_TEAM_COLORS[tid] || '#444' }} />)}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Story Card — 1080x1920, stacked (tall sections)
// ══════════════════════════════════════════════════════════════

function StoryCard(props: ShareCardProps) {
  const { teamScores, winner, lopsidedness, date, league, selectedPlayers, spotlight, skin = 'classic', headshots } = props;
  const sk = THEMES[skin];
  const teams = sortTeams(teamScores, winner);
  const pc = Math.min(sizeTier(teamScores, selectedPlayers), 3);
  const totalScore = teams.reduce((s, [, d]) => s + d.score, 0) || 1;
  const showBar = spotlight.detailedVerdict;
  const bandH = showBar ? 260 : 220;
  const sectionH = Math.floor((1920 - (sk.accentH * 2) - bandH) / teams.length);

  const scoreFs = 140;
  const nameFs = pc === 1 ? 44 : pc === 2 ? 36 : 28;
  const indivFs = pc === 1 ? 30 : pc === 2 ? 24 : 20;
  const pillFs = pc === 1 ? 19 : pc === 2 ? 16 : 14;
  const watermarkFs = 320;

  return (
    <div style={{
      width: 1080, height: 1920,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      background: sk.cardBg,
      border: sk.cardBorder,
      borderRadius: sk.cardRadius,
      boxShadow: sk.cardShadow,
      overflow: 'hidden',
    }}>
      {sk.accentH > 0 && (
        <div style={{ display: 'flex', height: sk.accentH, flexShrink: 0 }}>
          {teams.map(([tid]) => <div key={tid} style={{ flex: 1, background: CARD_TEAM_COLORS[tid] || '#444' }} />)}
        </div>
      )}

      {teams.map(([teamId, td], idx) => {
        const c = CARD_TEAM_COLORS[teamId] || '#888';
        const c2 = CARD_TEAM_SECONDARY[teamId] || c;
        const [shown, rest] = filterAssets(td.assets, teamId, selectedPlayers);
        const headshotUrl = headshots?.[teamId]?.[0];
        const labelColor = skin === 'classic' ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.3)';

        return (
          <div key={teamId} style={{
            height: sectionH,
            display: 'flex', flexDirection: 'column',
            padding: `32px ${skin === 'classic' ? 70 : 60}px`,
            paddingLeft: skin === 'classic' ? 76 : undefined,
            position: 'relative', overflow: 'hidden',
            backgroundImage: sk.sectionBg(c, c2),
            borderBottom: idx < teams.length - 1 ? sk.divider : 'none',
          }}>
            {sk.overlay && <div style={sk.overlay} />}
            <TeamAccentBar color={c} skin={skin} height={sectionH} />
            <Watermark teamId={teamId} fontSize={watermarkFs} color={sk.watermarkColor(c)} />
            <HeadshotBg src={headshotUrl} sk={sk} side="right" />

            {/* Team label */}
            <div style={{
              fontSize: 19, fontWeight: 800, letterSpacing: 6,
              color: sk.teamLabelColor(c), textTransform: 'uppercase' as const,
              position: 'relative', flexShrink: 0, marginBottom: 16,
            }}>
              {TEAM_NICK[teamId] || teamId}
            </div>

            {/* Score + label */}
            <div style={{ position: 'relative', flexShrink: 0, marginBottom: 24 }}>
              <div style={{
                fontSize: scoreFs, fontWeight: 900, lineHeight: 0.9,
                color: sk.scoreColor, textShadow: sk.scoreShadow(c),
              }}>
                {fmt(td.score)}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, color: labelColor, textTransform: 'uppercase' as const, marginTop: 8 }}>
                TRADE SCORE
              </div>
            </div>

            {/* Players */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: pc === 1 ? 14 : 8, position: 'relative', flex: 1, justifyContent: 'flex-start', overflow: 'hidden' }}>
              {shown.map((asset, i) => (
                <div key={`${asset.name}-${i}`} style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontSize: nameFs, fontWeight: 800, color: sk.nameColor }}>{asset.name}</span>
                    <span style={{ fontSize: indivFs, fontWeight: 700, color: sk.indivScoreColor(c) }}>{fmt(asset.score)}</span>
                  </div>
                  <StatPills asset={asset} spotlight={spotlight} fontSize={pillFs} sk={sk} />
                </div>
              ))}
              {rest > 0 && (
                <span style={{ fontSize: Math.max(16, nameFs - 10), color: labelColor, fontWeight: 600, flexShrink: 0 }}>+ {rest} more</span>
              )}
            </div>
          </div>
        );
      })}

      {/* Verdict band */}
      <div style={{
        height: bandH, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 14,
        padding: '0 56px', background: sk.verdictBg,
        borderTop: sk.divider,
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 5, color: sk.brandColor, textTransform: 'uppercase' as const }}>
          {league === 'WNBA' ? 'WNBA' : 'NBA'} Trade Mapper
        </span>

        {showBar && (
          <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: 2, color: CARD_TEAM_COLORS[teams[0][0]] || '#888' }}>
              {teams[0][0]} {fmt(teams[0][1].score)}
            </span>
            <div style={{ flex: 1, height: 10, borderRadius: 5, display: 'flex', overflow: 'hidden' }}>
              {teams.map(([tid, td]) => (
                <div key={tid} style={{ width: `${(td.score / totalScore) * 100}%`, height: '100%', background: CARD_TEAM_COLORS[tid] || '#888' }} />
              ))}
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: 2, color: CARD_TEAM_COLORS[teams[teams.length - 1][0]] || '#888' }}>
              {fmt(teams[teams.length - 1][1].score)} {teams[teams.length - 1][0]}
            </span>
          </div>
        )}

        <span style={{
          fontSize: 24, fontWeight: 700, letterSpacing: 2,
          color: sk.verdictColor(winner ? CARD_TEAM_COLORS[winner] || '#f9c74f' : null),
          textTransform: 'uppercase' as const, textAlign: 'center' as const,
        }}>
          {verdictLabel(winner, lopsidedness)}
        </span>

        {date && <span style={{ fontSize: 18, color: skin === 'classic' ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.2)' }}>{shortDate(date)}</span>}
        <span style={{ fontSize: 14, color: skin === 'classic' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.1)', marginTop: 4 }}>nbatrades.vercel.app</span>
      </div>

      {sk.accentH > 0 && (
        <div style={{ display: 'flex', height: Math.max(2, sk.accentH - 1), flexShrink: 0 }}>
          {teams.map(([tid]) => <div key={tid} style={{ flex: 1, background: CARD_TEAM_COLORS[tid] || '#444' }} />)}
        </div>
      )}
    </div>
  );
}

// ── Export ────────────────────────────────────────────────────

export default function ShareCard(props: ShareCardProps) {
  switch (props.format) {
    case 'story': return <StoryCard {...props} />;
    case 'square': return <SquareCard {...props} />;
    default: return <OGCard {...props} />;
  }
}
