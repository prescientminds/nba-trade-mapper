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
import { generateNoiseUrl, GRAIN, VIGNETTE } from '@/components/cards/shared/stylize';
import { getVerdict } from '@/lib/verdicts';

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
  return getVerdict(winner, lop);
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
  /** Pre-tinted template background data URLs per team */
  templates?: Record<string, string>;
  /** Optional 140-char take / caption */
  caption?: string;
  /** Pre-loaded watermark data URL for html2canvas capture */
  watermarkUrl?: string | null;
}

function filterAssets(
  assets: AssetScore[],
  teamId: string,
  selected?: Record<string, string[]>,
): [AssetScore[], number] {
  // Deduplicate by player name, keeping highest score
  const seen = new Set<string>();
  const deduped = [...assets].sort((a, b) => b.score - a.score).filter(a => {
    if (seen.has(a.name)) return false;
    seen.add(a.name);
    return true;
  });
  if (!selected || !selected[teamId]) return [deduped, 0];
  const sel = new Set(selected[teamId]);
  const shown = deduped.filter(a => sel.has(a.name));
  return [shown, deduped.length - shown.length];
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

// ── Echo shadow helper (tight offset, bottom-right) ──

function addEchoShadow(existingShadow: string): string {
  const echo = '2px 3px 0 rgba(255,255,255,0.6)';
  if (!existingShadow || existingShadow === 'none') return echo;
  return `${echo}, ${existingShadow}`;
}

// ── Headshot image ──────────────────────────────────────────

function HeadshotBg({ src, sk, side, teamId, teamColor }: {
  src?: string;
  sk: SkinTheme;
  side: 'left' | 'right';
  teamId?: string;
  teamColor?: string;
}) {
  if (!src) {
    // Fallback: large team abbreviation when no headshot available
    if (teamId && teamColor) {
      return (
        <div style={{
          position: 'absolute',
          bottom: 0,
          [side]: 0,
          width: '75%',
          height: `${sk.headshotSize}%`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 4,
        }}>
          <div style={{
            fontSize: 200,
            fontWeight: 900,
            color: ha(teamColor, sk.isLight ? 0.08 : 0.12),
            letterSpacing: -8,
            lineHeight: 0.85,
            textShadow: `0 0 80px ${ha(teamColor, 0.2)}`,
          }}>
            {teamId}
          </div>
        </div>
      );
    }
    return null;
  }
  return (
    <div style={{
      position: 'absolute',
      bottom: 0,
      [side]: 0,
      width: '75%',
      height: `${sk.headshotSize}%`,
      pointerEvents: 'none',
      zIndex: 4,
      backgroundImage: `url(${src})`,
      backgroundSize: 'contain',
      backgroundPosition: `${side} bottom`,
      backgroundRepeat: 'no-repeat',
      opacity: sk.headshotOpacity,
      filter: sk.headshotFilter,
    }} />
  );
}

// ── Template background (tinted texture image at z-0) ───────

function TemplateBg({ src }: { src?: string }) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
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
// OG Card — 1200x630, full-bleed team sections (no header bar)
// Inspired by BR/ESPN editorial graphics + Midjourney templates
// ══════════════════════════════════════════════════════════════

function OGCard(props: ShareCardProps) {
  const { teamScores, winner, lopsidedness, date, league, selectedPlayers, spotlight, skin = 'classic', headshots, templates, caption, watermarkUrl } = props;
  const sk = THEMES[skin];
  const teams = sortTeams(teamScores, winner);
  const is3 = teams.length > 2;
  const totalScore = teams.reduce((s, [, d]) => s + d.score, 0) || 1;
  const showBar = spotlight.detailedVerdict;
  const hasCaption = !!caption?.trim();

  // ── Layout: body fills card, verdict bar at bottom ──
  const verdictH = hasCaption ? 90 : (showBar ? 70 : 56);

  // ── Typography — scale with player count ──
  const maxShown = Math.max(...teams.map(([tid, td]) => {
    const [shown] = filterAssets(td.assets, tid, selectedPlayers);
    return shown.length;
  }));
  const dense = maxShown > 3;
  const teamNameFs = is3 ? 18 : 22;
  const scoreFs = is3 ? 72 : (dense ? 80 : 110);
  const playerFs = is3 ? 28 : (dense ? 28 : 39);
  const pillFs = is3 ? 12 : (dense ? 12 : 15);
  const maxPlayers = is3 ? 3 : 99;

  // ── Grain & vignette (client-only) ──
  const noiseUrl = typeof window !== 'undefined' ? generateNoiseUrl(GRAIN[skin]) : '';
  const vignetteAlpha = VIGNETTE[skin];

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

      {/* Watermark */}
      {watermarkUrl && <div style={{
        position: 'absolute', top: 16, right: 16,
        width: 80, height: 80, borderRadius: '50%',
        zIndex: 10, opacity: 0.85,
        backgroundImage: `url(${watermarkUrl})`,
        backgroundSize: 'cover',
      }} />}

      {/* ── BODY: full-bleed team sections, no header bar ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {teams.map(([teamId, td], idx) => {
          const c = CARD_TEAM_COLORS[teamId] || '#888';
          const c2 = CARD_TEAM_SECONDARY[teamId] || c;
          const [allShown, rest] = filterAssets(td.assets, teamId, selectedPlayers);
          const shown = allShown.slice(0, maxPlayers);
          const moreCount = rest + Math.max(0, allShown.length - maxPlayers);
          const isLast = idx === teams.length - 1;
          const align = isLast && !is3 ? 'right' as const : 'left' as const;
          const flexAlign = isLast && !is3 ? 'flex-end' as const : 'flex-start' as const;
          const headshotUrl = headshots?.[teamId]?.[0];
          const templateUrl = templates?.[teamId];
          const dimColor = sk.isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';

          return (
            <div key={teamId} style={{
              flex: 1,
              display: 'flex', flexDirection: 'column',
              justifyContent: 'space-between',
              padding: `28px ${is3 ? 28 : 40}px 16px`,
              position: 'relative',
              overflow: 'hidden',
              background: templateUrl ? sk.cardBg : sk.sectionBg(c, c2),
              borderRight: idx < teams.length - 1 ? sk.divider : 'none',
            }}>
              {/* Template texture at z-0 (falls back to CSS gradient above) */}
              <TemplateBg src={templateUrl} />

              {sk.overlay && <div style={sk.overlay} />}

              {/* Team accent bar (left stripe, top line, etc.) */}
              <TeamAccentBar color={c} skin={skin} height={630 - verdictH} />

              {/* Headshot — large, bottom-anchored, OPPOSITE side from text */}
              <HeadshotBg src={headshotUrl} sk={sk} side={isLast && !is3 ? 'left' : 'right'} teamId={teamId} teamColor={c} />

              {/* Vignette — darkens headshot side, keeps text side clear */}
              <div style={{
                position: 'absolute', inset: 0,
                background: `radial-gradient(ellipse at ${align === 'left' ? '25% 50%' : '75% 50%'}, transparent 20%, rgba(0,0,0,${vignetteAlpha}) 100%)`,
                pointerEvents: 'none', zIndex: 2,
              }} />

              {/* Film grain overlay */}
              {noiseUrl && (
                <div style={{
                  position: 'absolute', inset: 0,
                  backgroundImage: `url(${noiseUrl})`,
                  backgroundRepeat: 'repeat',
                  opacity: 0.5,
                  pointerEvents: 'none', zIndex: 3,
                }} />
              )}

              {/* Score readability gradient — covers text side from top */}
              <div style={{
                position: 'absolute', top: 0,
                [align]: 0,
                width: '70%',
                height: '60%',
                background: `linear-gradient(180deg, ${sk.isLight ? 'rgba(245,240,232,0.9)' : 'rgba(0,0,0,0.7)'} 0%, transparent 100%)`,
                pointerEvents: 'none', zIndex: 3,
              }} />

              {/* Readability overlay behind player names — skin-aware */}
              <div style={{
                position: 'absolute',
                bottom: 0, left: 0, right: 0,
                height: '50%',
                background: sk.isLight
                  ? 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0.5))'
                  : 'linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.55))',
                pointerEvents: 'none', zIndex: 3,
              }} />

              {/* ── Top zone: team name + score (inside body, no header bar) ── */}
              <div style={{
                position: 'relative', zIndex: 5,
                textAlign: align,
              }}>
                {/* Team name — subtle, inside body */}
                <div style={{
                  fontSize: teamNameFs,
                  fontWeight: 900,
                  letterSpacing: 4,
                  color: sk.isLight ? ha(c, 0.7) : 'rgba(255,255,255,0.5)',
                  textShadow: addEchoShadow('none'),
                  textTransform: 'uppercase' as const,
                  marginBottom: 2,
                }}>
                  {TEAM_NICK[teamId] || teamId}
                </div>
                {/* Label above score */}
                <div style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 4,
                  color: sk.isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.35)',
                  textShadow: addEchoShadow('none'),
                  textTransform: 'uppercase' as const,
                  marginBottom: 4,
                }}>
                  TRADE SCORE
                </div>
                {/* Score — massive, with echo effect */}
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: scoreFs * 0.06,
                }}>
                  <span style={{
                    fontSize: scoreFs,
                    fontWeight: 900,
                    lineHeight: 0.85,
                    color: sk.scoreColor,
                    textShadow: addEchoShadow(sk.scoreShadow(c)),
                  }}>
                    {fmt(td.score)}
                  </span>
                  <span style={{
                    fontSize: Math.round(scoreFs * 0.28),
                    fontWeight: 900,
                    color: sk.scoreColor,
                    textShadow: addEchoShadow(sk.scoreShadow(c)),
                    letterSpacing: 3,
                  }}>
                    WS
                  </span>
                </div>
              </div>

              {/* ── Bottom zone: accolades + player names ── */}
              <div style={{
                display: 'flex', flexDirection: 'column',
                gap: shown.length > 3 ? 2 : 4,
                position: 'relative',
                alignItems: flexAlign,
                zIndex: 5,
              }}>
                {moreCount > 0 && (
                  <span style={{ fontSize: shown.length > 3 ? 12 : 14, fontWeight: 600, color: dimColor }}>
                    + {moreCount} more
                  </span>
                )}
                {shown.map((asset, i) => (
                  <div key={`${asset.name}-${i}`} style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: flexAlign,
                  }}>
                    <StatPills asset={asset} spotlight={spotlight} fontSize={shown.length > 3 ? (is3 ? 9 : 11) : pillFs} sk={sk} />
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: shown.length > 3 ? 6 : 10, marginTop: 2 }}>
                      <span style={{
                        fontSize: shown.length > 3 ? (is3 ? 18 : 22) : playerFs,
                        fontWeight: shown.length > 3 ? 700 : 800,
                        color: sk.nameColor,
                        letterSpacing: -0.3,
                      }}>
                        {asset.name}
                      </span>
                      <span style={{
                        fontSize: shown.length > 3 ? (is3 ? 11 : 13) : Math.round(playerFs * 0.55),
                        fontWeight: shown.length > 3 ? 600 : 700,
                        color: sk.indivScoreColor(c),
                      }}>
                        {fmt(asset.score)} WS
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── VERDICT BAR ── */}
      <div style={{
        height: verdictH, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 6, padding: '0 36px',
        background: sk.verdictBg,
        borderTop: sk.divider,
        position: 'relative',
      }}>
        {/* Grain on verdict bar too */}
        {noiseUrl && (
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url(${noiseUrl})`,
            backgroundRepeat: 'repeat',
            opacity: 0.3,
            pointerEvents: 'none',
          }} />
        )}
        {showBar && (
          <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12, maxWidth: 800, position: 'relative', zIndex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: CARD_TEAM_COLORS[teams[0][0]] || '#888', width: 40, textAlign: 'right' as const, flexShrink: 0 }}>
              {teams[0][0]}
            </span>
            <div style={{ flex: 1, height: 6, borderRadius: 3, display: 'flex', overflow: 'hidden' }}>
              {teams.map(([tid, td]) => (
                <div key={tid} style={{ width: `${(td.score / totalScore) * 100}%`, height: '100%', background: CARD_TEAM_COLORS[tid] || '#888' }} />
              ))}
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: CARD_TEAM_COLORS[teams[teams.length - 1][0]] || '#888', width: 40, flexShrink: 0 }}>
              {teams[teams.length - 1][0]}
            </span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', position: 'relative', zIndex: 1 }}>
          <span style={{
            fontSize: 16, fontWeight: 700, letterSpacing: 2,
            color: sk.verdictColor(winner ? CARD_TEAM_COLORS[winner] || '#f9c74f' : null),
            textTransform: 'uppercase' as const,
          }}>
            {verdictLabel(winner, lopsidedness)}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {date && <span style={{ fontSize: 11, color: sk.isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.15)' }}>{shortDate(date)}</span>}
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: sk.brandColor, textTransform: 'uppercase' as const }}>
              {league === 'WNBA' ? 'WNBA' : 'NBA'} Trade Mapper
            </span>
          </div>
        </div>
        {hasCaption && (
          <div style={{
            fontSize: 13, fontWeight: 500, lineHeight: 1.3,
            color: sk.isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.5)',
            position: 'relative', zIndex: 1,
            textAlign: 'center',
          }}>
            {caption}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Square Card — 1080x1080, stacked team sections
// ══════════════════════════════════════════════════════════════

function SquareCard(props: ShareCardProps) {
  const { teamScores, winner, lopsidedness, date, league, selectedPlayers, spotlight, skin = 'classic', headshots, templates, caption, watermarkUrl } = props;
  const sk = THEMES[skin];
  const teams = sortTeams(teamScores, winner);
  const totalScore = teams.reduce((s, [, d]) => s + d.score, 0) || 1;
  const showBar = spotlight.detailedVerdict;
  const noiseUrl = typeof window !== 'undefined' ? generateNoiseUrl(GRAIN[skin]) : '';
  const vignetteAlpha = VIGNETTE[skin];

  const is3Plus = teams.length >= 3;
  const maxPlayers = is3Plus ? 3 : 99;

  // Verdict bar at bottom — taller to fit caption
  const hasCaption = !!caption?.trim();
  const verdictH = hasCaption ? 160 : (showBar ? 120 : 100);
  const bodyH = Math.floor((1080 - verdictH) / teams.length);

  const scoreFs = is3Plus ? 80 : 120;
  const playerFs = is3Plus ? 28 : 38;
  const pillFs = is3Plus ? 12 : 15;

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
      position: 'relative',
    }}>
      {/* Watermark */}
      {watermarkUrl && <div style={{
        position: 'absolute', top: 16, right: 16,
        width: 80, height: 80, borderRadius: '50%',
        zIndex: 10, opacity: 0.85,
        backgroundImage: `url(${watermarkUrl})`,
        backgroundSize: 'cover',
      }} />}

      {teams.map(([teamId, td], idx) => {
        const c = CARD_TEAM_COLORS[teamId] || '#888';
        const c2 = CARD_TEAM_SECONDARY[teamId] || c;
        const [allShown, rest] = filterAssets(td.assets, teamId, selectedPlayers);
        const shown = allShown.slice(0, maxPlayers);
        const moreCount = rest + Math.max(0, allShown.length - maxPlayers);
        const headshotUrl = headshots?.[teamId]?.[0];
        const templateUrl = templates?.[teamId];
        const dimColor = sk.isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';

        return (
          <div key={teamId} style={{
            height: bodyH,
            display: 'flex', flexDirection: 'column',
            position: 'relative', overflow: 'hidden',
            background: templateUrl ? sk.cardBg : sk.sectionBg(c, c2),
            borderBottom: idx < teams.length - 1 ? sk.divider : 'none',
          }}>
            {/* Template texture at z-0 */}
            <TemplateBg src={templateUrl} />

            {sk.overlay && <div style={sk.overlay} />}

            {/* Team accent bar */}
            <TeamAccentBar color={c} skin={skin} height={bodyH} />

            {/* Headshot — large, anchored right */}
            <HeadshotBg src={headshotUrl} sk={sk} side="right" teamId={teamId} teamColor={c} />

            {/* Vignette — focus attention on text side */}
            <div style={{
              position: 'absolute', inset: 0,
              background: `radial-gradient(ellipse at 30% 55%, transparent 20%, rgba(0,0,0,${vignetteAlpha}) 100%)`,
              pointerEvents: 'none', zIndex: 2,
            }} />

            {/* Film grain */}
            {noiseUrl && (
              <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: `url(${noiseUrl})`,
                backgroundRepeat: 'repeat',
                opacity: 0.4,
                pointerEvents: 'none', zIndex: 3,
              }} />
            )}

            {/* Readability overlay behind player names — skin-aware */}
            <div style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0,
              height: '50%',
              background: sk.isLight
                ? 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0.5))'
                : 'linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.55))',
              pointerEvents: 'none', zIndex: 3,
            }} />

            {/* Content: team name + score at top, players at bottom */}
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              justifyContent: 'space-between',
              padding: is3Plus
                ? (skin === 'classic' ? '16px 40px 14px 48px' : '16px 40px 14px')
                : (skin === 'classic' ? '28px 48px 24px 56px' : '28px 48px 24px'),
              position: 'relative', zIndex: 5,
            }}>
              {/* Top: team name + score */}
              <div>
                <div style={{
                  fontSize: is3Plus ? 16 : 20, fontWeight: 900, letterSpacing: 5,
                  color: sk.teamLabelColor(c),
                  textShadow: addEchoShadow('none'),
                  textTransform: 'uppercase' as const,
                  marginBottom: 2,
                }}>
                  {TEAM_NICK[teamId] || teamId}
                </div>
                <div style={{
                  fontSize: is3Plus ? 10 : 12, fontWeight: 800, letterSpacing: 5,
                  color: sk.isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.35)',
                  textShadow: addEchoShadow('none'),
                  textTransform: 'uppercase' as const,
                  marginBottom: is3Plus ? 2 : 4,
                }}>
                  TRADE SCORE
                </div>
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: scoreFs * 0.06,
                }}>
                  <span style={{
                    fontSize: scoreFs, fontWeight: 900, lineHeight: 0.85,
                    color: sk.scoreColor,
                    textShadow: addEchoShadow(sk.scoreShadow(c)),
                  }}>
                    {fmt(td.score)}
                  </span>
                  <span style={{
                    fontSize: Math.round(scoreFs * 0.28), fontWeight: 900,
                    color: sk.scoreColor,
                    textShadow: addEchoShadow(sk.scoreShadow(c)),
                    letterSpacing: 3,
                  }}>
                    WS
                  </span>
                </div>
              </div>

              {/* Bottom: players + pills */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: shown.length > 3 ? 3 : 6 }}>
                {moreCount > 0 && <span style={{ fontSize: shown.length > 3 ? 13 : 16, fontWeight: 600, color: dimColor }}>+ {moreCount} more</span>}
                {shown.map((asset, i) => (
                  <div key={`${asset.name}-${i}`} style={{ display: 'flex', flexDirection: 'column' }}>
                    <StatPills asset={asset} spotlight={spotlight} fontSize={shown.length > 3 ? (is3Plus ? 10 : 12) : pillFs} sk={sk} />
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: shown.length > 3 ? 6 : 10, marginTop: 2 }}>
                      <span style={{
                        fontSize: shown.length > 3 ? (is3Plus ? 20 : 24) : playerFs,
                        fontWeight: shown.length > 3 ? 700 : 800,
                        color: sk.nameColor,
                      }}>
                        {asset.name}
                      </span>
                      <span style={{
                        fontSize: shown.length > 3 ? (is3Plus ? 12 : 14) : Math.round(playerFs * 0.5),
                        fontWeight: shown.length > 3 ? 600 : 700,
                        color: sk.indivScoreColor(c),
                      }}>
                        {fmt(asset.score)} WS
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      {/* Verdict */}
      <div style={{
        height: verdictH, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', gap: 10,
        padding: '0 48px', background: sk.verdictBg, borderTop: sk.divider,
        position: 'relative',
      }}>
        {noiseUrl && (
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url(${noiseUrl})`,
            backgroundRepeat: 'repeat',
            opacity: 0.3,
            pointerEvents: 'none',
          }} />
        )}
        {showBar && (
          <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12, maxWidth: 700, position: 'relative', zIndex: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: 2, color: CARD_TEAM_COLORS[teams[0][0]] || '#888' }}>{teams[0][0]}</span>
            <div style={{ flex: 1, height: 8, borderRadius: 4, display: 'flex', overflow: 'hidden' }}>
              {teams.map(([tid, td]) => (
                <div key={tid} style={{ width: `${(td.score / totalScore) * 100}%`, height: '100%', background: CARD_TEAM_COLORS[tid] || '#888' }} />
              ))}
            </div>
            <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: 2, color: CARD_TEAM_COLORS[teams[teams.length - 1][0]] || '#888' }}>{teams[teams.length - 1][0]}</span>
          </div>
        )}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span style={{
            fontSize: 20, fontWeight: 700, letterSpacing: 2,
            color: sk.verdictColor(winner ? CARD_TEAM_COLORS[winner] || '#f9c74f' : null),
            textTransform: 'uppercase' as const,
          }}>
            {verdictLabel(winner, lopsidedness)}
          </span>
        </div>
        {hasCaption && (
          <div style={{
            fontSize: 16, fontWeight: 500, lineHeight: 1.35,
            color: sk.isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.55)',
            position: 'relative', zIndex: 1,
            maxWidth: 900,
          }}>
            {caption}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative', zIndex: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, color: sk.brandColor, textTransform: 'uppercase' as const }}>
            {league === 'WNBA' ? 'WNBA' : 'NBA'} Trade Mapper
          </span>
          {date && <span style={{ fontSize: 12, color: sk.isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.18)' }}>{shortDate(date)}</span>}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Story Card — 1080x1920, stacked (tall sections)
// ══════════════════════════════════════════════════════════════

function StoryCard(props: ShareCardProps) {
  const { teamScores, winner, lopsidedness, date, league, selectedPlayers, spotlight, skin = 'classic', headshots, templates, watermarkUrl } = props;
  const sk = THEMES[skin];
  const teams = sortTeams(teamScores, winner);
  const totalScore = teams.reduce((s, [, d]) => s + d.score, 0) || 1;
  const showBar = spotlight.detailedVerdict;
  const is3Plus = teams.length >= 3;

  const maxPlayers = is3Plus ? 2 : 4;

  const teamHeaderH = 80;
  const verdictH = showBar ? 260 : 220;
  const bodyH = Math.floor((1920 - verdictH) / teams.length);

  const teamNameFs = is3Plus ? 32 : 44;
  const scoreFs = is3Plus ? 100 : 140;
  const playerFs = is3Plus ? 34 : 47;
  const pillFs = is3Plus ? 14 : 17;

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
      position: 'relative',
    }}>
      {/* Watermark */}
      {watermarkUrl && <div style={{
        position: 'absolute', top: 16, right: 16,
        width: 80, height: 80, borderRadius: '50%',
        zIndex: 10, opacity: 0.85,
        backgroundImage: `url(${watermarkUrl})`,
        backgroundSize: 'cover',
      }} />}

      {teams.map(([teamId, td], idx) => {
        const c = CARD_TEAM_COLORS[teamId] || '#888';
        const c2 = CARD_TEAM_SECONDARY[teamId] || c;
        const [allShown, rest] = filterAssets(td.assets, teamId, selectedPlayers);
        const shown = allShown.slice(0, maxPlayers);
        const moreCount = rest + Math.max(0, allShown.length - maxPlayers);
        const headshotUrl = headshots?.[teamId]?.[0];
        const templateUrl = templates?.[teamId];
        const dimColor = sk.isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';

        return (
          <div key={teamId} style={{ height: bodyH, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
            {/* Team header */}
            <div style={{
              height: teamHeaderH, flexShrink: 0,
              display: 'flex', alignItems: 'center', padding: '0 56px',
              background: sk.headerBg(c),
            }}>
              <span style={{ fontSize: teamNameFs, fontWeight: 900, letterSpacing: 2, color: '#ffffff', textTransform: 'uppercase' as const, textShadow: sk.headerTextShadow(c) }}>
                {TEAM_NICK[teamId] || teamId}
              </span>
            </div>
            {/* Body */}
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              padding: '36px 56px 28px',
              background: templateUrl ? sk.cardBg : sk.sectionBg(c, c2),
              position: 'relative', overflow: 'hidden',
              borderBottom: idx < teams.length - 1 ? sk.divider : 'none',
            }}>
              {/* Template texture at z-0 */}
              <TemplateBg src={templateUrl} />
              {sk.overlay && <div style={sk.overlay} />}
              <HeadshotBg src={headshotUrl} sk={sk} side="right" teamId={teamId} teamColor={c} />
              {/* Score */}
              <div style={{ position: 'relative', flexShrink: 0, zIndex: 5, padding: '20px 0' }}>
                <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 4, color: sk.isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, marginBottom: 6 }}>
                  TRADE SCORE
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: scoreFs * 0.06 }}>
                  <span style={{ fontSize: scoreFs, fontWeight: 900, lineHeight: 0.9, color: sk.scoreColor, textShadow: addEchoShadow(sk.scoreShadow(c)) }}>
                    {fmt(td.score)}
                  </span>
                  <span style={{ fontSize: Math.round(scoreFs * 0.28), fontWeight: 900, color: sk.scoreColor, textShadow: addEchoShadow(sk.scoreShadow(c)), letterSpacing: 3 }}>
                    WS
                  </span>
                </div>
              </div>
              {/* Players — pills above name for alignment */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', zIndex: 5 }}>
                {moreCount > 0 && <span style={{ fontSize: 20, fontWeight: 600, color: dimColor }}>+ {moreCount} more</span>}
                {shown.map((asset, i) => (
                  <div key={`${asset.name}-${i}`} style={{ display: 'flex', flexDirection: 'column' }}>
                    <StatPills asset={asset} spotlight={spotlight} fontSize={pillFs} sk={sk} />
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 3 }}>
                      <span style={{ fontSize: playerFs, fontWeight: 800, color: sk.nameColor, textShadow: addEchoShadow(sk.isLight ? 'none' : '0 2px 8px rgba(0,0,0,0.5)') }}>{asset.name}</span>
                      <span style={{ fontSize: Math.round(playerFs * 0.55), fontWeight: 700, color: sk.indivScoreColor(c), textShadow: addEchoShadow('none') }}>{fmt(asset.score)} WS</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      {/* Verdict band */}
      <div style={{
        height: verdictH, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 14,
        padding: '0 56px', background: sk.verdictBg, borderTop: sk.divider,
      }}>
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 5, color: sk.brandColor, textTransform: 'uppercase' as const }}>
          {league === 'WNBA' ? 'WNBA' : 'NBA'} Trade Mapper
        </span>
        {showBar && (
          <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2, color: CARD_TEAM_COLORS[teams[0][0]] || '#888' }}>
              {teams[0][0]} {fmt(teams[0][1].score)}
            </span>
            <div style={{ flex: 1, height: 10, borderRadius: 5, display: 'flex', overflow: 'hidden' }}>
              {teams.map(([tid, td]) => (
                <div key={tid} style={{ width: `${(td.score / totalScore) * 100}%`, height: '100%', background: CARD_TEAM_COLORS[tid] || '#888' }} />
              ))}
            </div>
            <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2, color: CARD_TEAM_COLORS[teams[teams.length - 1][0]] || '#888' }}>
              {fmt(teams[teams.length - 1][1].score)} {teams[teams.length - 1][0]}
            </span>
          </div>
        )}
        <span style={{
          fontSize: 28, fontWeight: 700, letterSpacing: 2,
          color: sk.verdictColor(winner ? CARD_TEAM_COLORS[winner] || '#f9c74f' : null),
          textTransform: 'uppercase' as const, textAlign: 'center' as const,
        }}>
          {verdictLabel(winner, lopsidedness)}
        </span>
        {date && <span style={{ fontSize: 18, color: sk.isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.2)' }}>{shortDate(date)}</span>}
        <span style={{ fontSize: 14, color: sk.isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.1)', marginTop: 4 }}>nbatrades.vercel.app</span>
      </div>
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
