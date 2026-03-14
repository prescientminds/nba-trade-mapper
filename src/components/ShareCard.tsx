'use client';

/* eslint-disable @next/next/no-img-element */
// ── Client-side share card — real DOM captured via html-to-image ──
// Four skins: Classic (Panini Flawless), Holographic (Topps Chrome),
// Inside Stuff (90s Skybox), NBA Jam (Fleer/Arcade).
// Each skin dramatically transforms color, borders, and atmosphere.

import { CARD_TEAM_COLORS, CARD_TEAM_SECONDARY } from '@/lib/card-templates';
import type { TeamScoreEntry, AssetScore, SpotlightOptions } from '@/lib/card-templates';
import type { VisualSkin } from '@/lib/skins';

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

function darken(hex: string, amt: number): string {
  const c = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = Math.round(parseInt(c.slice(0, 2), 16) * (1 - amt));
  const g = Math.round(parseInt(c.slice(2, 4), 16) * (1 - amt));
  const b = Math.round(parseInt(c.slice(4, 6), 16) * (1 - amt));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function ha(hex: string, alpha: number): string {
  const c = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
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
    .map(([label, count]) => count > 1 ? `${count}× ${label}` : label);
}

// ── Skin Theme System ───────────────────────────────────────

interface SkinTheme {
  cardBg: string;
  cardBorder: string;
  cardRadius: number;
  cardShadow: string;
  accentH: number;
  sectionBg: (c: string, c2: string) => string;
  sectionDivider: string;
  scoreColor: string;
  scoreShadow: (c: string) => string;
  teamNameColor: string;
  playerColor: string;
  playerScoreColor: (c: string) => string;
  pillBg: (text: string) => string;
  pillColor: string;
  verdictBg: string;
  verdictText: (winnerColor: string | null) => string;
  brandColor: string;
  heroOp: (isW: boolean) => number;
  heroFilter: (c: string) => string;
  overlay?: React.CSSProperties;
}

// ── Classic — Panini Flawless: clean luxury, dark + gold border ──
const classicTheme: SkinTheme = {
  cardBg: '#08080e',
  cardBorder: '2px solid rgba(249,199,79,0.25)',
  cardRadius: 8,
  cardShadow: '0 4px 60px rgba(0,0,0,0.8)',
  accentH: 5,
  sectionBg: (c, c2) =>
    `linear-gradient(170deg, ${darken(c, 0.42)} 0%, ${darken(c, 0.62)} 55%, ${darken(c2, 0.72)} 100%)`,
  sectionDivider: '1px solid rgba(255,255,255,0.06)',
  scoreColor: '#ffffff',
  scoreShadow: (c) => `0 2px 40px ${ha(c, 0.8)}, 0 0 80px ${ha(c, 0.35)}`,
  teamNameColor: 'rgba(255,255,255,0.55)',
  playerColor: '#ffffff',
  playerScoreColor: (c) => ha(c, 1),
  pillBg: (text) => {
    const t = text.toLowerCase();
    if (t.includes('mvp') || t.includes('champ')) return 'rgba(249,199,79,0.5)';
    if (t.includes('dpoy') || t.includes('roy')) return 'rgba(78,205,196,0.45)';
    if (t.includes('all-star')) return 'rgba(155,93,229,0.45)';
    if (t.includes('all-nba')) return 'rgba(255,107,53,0.45)';
    return 'rgba(255,255,255,0.18)';
  },
  pillColor: 'rgba(255,255,255,0.95)',
  verdictBg: 'rgba(0,0,0,0.75)',
  verdictText: (wc) => wc || 'rgba(255,255,255,0.6)',
  brandColor: 'rgba(255,255,255,0.25)',
  heroOp: (isW) => isW ? 0.55 : 0.28,
  heroFilter: (c) => `drop-shadow(0 4px 24px ${ha(c, 0.6)})`,
};

// ── Holographic — Topps Chrome: prismatic borders, purple/teal glow ──
const holoTheme: SkinTheme = {
  cardBg: '#0a0a14',
  cardBorder: 'none',
  cardRadius: 10,
  cardShadow: [
    'inset 0 0 0 2px rgba(255,255,255,0.15)',
    'inset 0 0 0 4px rgba(155,93,229,0.12)',
    'inset 0 0 0 6px rgba(78,205,196,0.08)',
    '0 0 80px rgba(155,93,229,0.25)',
    '0 0 120px rgba(78,205,196,0.12)',
  ].join(', '),
  accentH: 3,
  sectionBg: (c, c2) =>
    `linear-gradient(155deg, ${darken(c, 0.48)} 0%, #0e0e1a 40%, ${darken(c2, 0.58)} 100%)`,
  sectionDivider: '1px solid rgba(155,93,229,0.15)',
  scoreColor: '#f0f0ff',
  scoreShadow: (c) =>
    `0 0 30px ${ha(c, 0.5)}, 0 0 60px rgba(155,93,229,0.35), 0 0 100px rgba(78,205,196,0.15)`,
  teamNameColor: 'rgba(200,200,255,0.5)',
  playerColor: '#e0e0ff',
  playerScoreColor: () => 'rgba(180,130,255,1)',
  pillBg: (text) => {
    const t = text.toLowerCase();
    if (t.includes('mvp') || t.includes('champ')) return 'rgba(249,199,79,0.35)';
    if (t.includes('dpoy') || t.includes('roy')) return 'rgba(78,205,196,0.35)';
    if (t.includes('all-star') || t.includes('all-nba')) return 'rgba(155,93,229,0.35)';
    return 'rgba(155,93,229,0.18)';
  },
  pillColor: 'rgba(230,230,255,0.95)',
  verdictBg: 'rgba(10,10,20,0.85)',
  verdictText: (wc) => wc || 'rgba(200,200,255,0.6)',
  brandColor: 'rgba(155,93,229,0.35)',
  heroOp: (isW) => isW ? 0.4 : 0.2,
  heroFilter: (c) => `drop-shadow(0 4px 30px ${ha(c, 0.4)}) brightness(1.1) saturate(0.7)`,
  overlay: {
    position: 'absolute' as const,
    inset: 0,
    backgroundImage:
      'linear-gradient(135deg, rgba(255,0,0,0.03) 0%, rgba(255,165,0,0.03) 16%, rgba(255,255,0,0.03) 33%, rgba(0,128,255,0.03) 50%, rgba(128,0,255,0.04) 66%, rgba(255,0,128,0.03) 83%, rgba(255,0,0,0.03) 100%)',
    pointerEvents: 'none' as const,
  },
};

// ── Inside Stuff — 90s Skybox: gold border, deep purple, warm saturated ──
const insideStuffTheme: SkinTheme = {
  cardBg: '#180a2e',
  cardBorder: '4px solid #d4a843',
  cardRadius: 6,
  cardShadow: '0 0 40px rgba(212,168,67,0.3), inset 0 0 0 2px rgba(212,168,67,0.12)',
  accentH: 6,
  sectionBg: (c, c2) =>
    `linear-gradient(145deg, ${darken(c, 0.28)} 0%, #2a0a4e 50%, ${darken(c2, 0.38)} 100%)`,
  sectionDivider: '2px solid rgba(212,168,67,0.25)',
  scoreColor: '#ffd700',
  scoreShadow: (c) => `0 2px 30px ${ha(c, 0.5)}, 0 0 50px rgba(255,215,0,0.35)`,
  teamNameColor: '#d4a843',
  playerColor: '#ffffff',
  playerScoreColor: () => '#d4a843',
  pillBg: (text) => {
    const t = text.toLowerCase();
    if (t.includes('mvp') || t.includes('champ')) return 'rgba(212,168,67,0.5)';
    if (t.includes('all-star') || t.includes('all-nba')) return 'rgba(155,93,229,0.4)';
    return 'rgba(212,168,67,0.22)';
  },
  pillColor: '#ffffff',
  verdictBg: 'rgba(24,10,46,0.9)',
  verdictText: (wc) => wc || '#d4a843',
  brandColor: 'rgba(212,168,67,0.45)',
  heroOp: (isW) => isW ? 0.5 : 0.22,
  heroFilter: (c) => `drop-shadow(0 4px 24px ${ha(c, 0.5)}) saturate(1.4)`,
  overlay: {
    position: 'absolute' as const,
    inset: 0,
    backgroundImage: 'radial-gradient(ellipse at 50% 80%, rgba(212,168,67,0.08) 0%, transparent 65%)',
    pointerEvents: 'none' as const,
  },
};

// ── NBA Jam — Fleer/Arcade: red+blue borders, neon cyan, scanlines ──
const nbaJamTheme: SkinTheme = {
  cardBg: '#030303',
  cardBorder: 'none',
  cardRadius: 0,
  cardShadow: [
    'inset 0 0 0 5px #c8102e',
    'inset 0 0 0 9px #030303',
    'inset 0 0 0 14px #006bb6',
    '0 0 60px rgba(0,255,255,0.15)',
  ].join(', '),
  accentH: 0,
  sectionBg: (c) =>
    `linear-gradient(180deg, ${darken(c, 0.75)} 0%, #050505 45%, ${darken(c, 0.8)} 100%)`,
  sectionDivider: '2px solid rgba(0,255,255,0.12)',
  scoreColor: '#00ffff',
  scoreShadow: () =>
    '0 0 25px rgba(0,255,255,0.7), 0 0 60px rgba(0,255,255,0.35), 0 0 100px rgba(0,255,255,0.12)',
  teamNameColor: '#00ffff',
  playerColor: '#ffffff',
  playerScoreColor: () => '#00ff88',
  pillBg: (text) => {
    const t = text.toLowerCase();
    if (t.includes('mvp') || t.includes('champ')) return 'rgba(0,255,255,0.22)';
    if (t.includes('all-star')) return 'rgba(0,255,136,0.18)';
    return 'rgba(0,255,255,0.1)';
  },
  pillColor: '#00ffff',
  verdictBg: '#050505',
  verdictText: (wc) => wc ? '#ff4500' : '#00ffff',
  brandColor: 'rgba(0,255,255,0.35)',
  heroOp: (isW) => isW ? 0.35 : 0.15,
  heroFilter: (c) => `drop-shadow(0 0 30px ${ha(c, 0.6)}) contrast(1.3) brightness(0.85)`,
  overlay: {
    position: 'absolute' as const,
    inset: 0,
    backgroundImage:
      'repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(0,255,255,0.025) 3px, rgba(0,255,255,0.025) 4px)',
    pointerEvents: 'none' as const,
  },
};

const THEMES: Record<VisualSkin, SkinTheme> = {
  classic: classicTheme,
  holographic: holoTheme,
  insideStuff: insideStuffTheme,
  nbaJam: nbaJamTheme,
};

// ── Types ─────────────────────────────────────────────────────

export interface ShareCardProps {
  teamScores: Record<string, TeamScoreEntry>;
  winner: string | null;
  lopsidedness: number;
  date?: string | null;
  league?: string;
  heroDataUrls: Record<string, string[]>;
  playerCount: number;
  spotlight: SpotlightOptions;
  format: 'og' | 'square' | 'story';
  skin?: VisualSkin;
}

// ── Stat pills ────────────────────────────────────────────────

function StatPills({ asset, spotlight, fontSize, sk }: {
  asset: AssetScore;
  spotlight: SpotlightOptions;
  fontSize: number;
  sk: SkinTheme;
}) {
  const items: { text: string; bg: string }[] = [];
  const statCount = [spotlight.accolades, spotlight.winShares, spotlight.playoffWs, spotlight.championships, spotlight.seasons].filter(Boolean).length;
  const accMax = statCount === 1 && spotlight.accolades ? 6 : 3;

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
    items.push({ text: `${asset.championships}× Champ`, bg: sk.pillBg('champ') });
  if (spotlight.seasons && asset.seasons != null && asset.seasons > 0)
    items.push({ text: `${asset.seasons} Szn`, bg: sk.pillBg('ws') });

  if (!items.length) return null;

  const scale = statCount <= 1 ? 1.4 : statCount === 2 ? 1.15 : 1;
  const fs = Math.round(fontSize * scale);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: fs >= 16 ? 8 : 5, marginTop: fs >= 16 ? 6 : 3 }}>
      {items.map((item, i) => (
        <span key={i} style={{
          display: 'inline-block',
          padding: `${Math.round(fs * 0.25)}px ${Math.round(fs * 0.7)}px`,
          borderRadius: 5,
          background: item.bg,
          color: sk.pillColor,
          fontSize: fs,
          fontWeight: 700,
          lineHeight: 1.4,
          letterSpacing: 0.3,
        }}>
          {item.text}
        </span>
      ))}
    </div>
  );
}

// ── Sorted teams helper ─────────────────────────────────────

function sortTeams(teamScores: Record<string, TeamScoreEntry>, winner: string | null) {
  return Object.entries(teamScores).sort((a, b) => {
    if (winner) { if (a[0] === winner) return -1; if (b[0] === winner) return 1; }
    return b[1].score - a[1].score;
  }) as [string, TeamScoreEntry][];
}

// ══════════════════════════════════════════════════════════════
// OG Card — 1200×630, side-by-side team sections
// ══════════════════════════════════════════════════════════════

function OGCard(props: ShareCardProps) {
  const { teamScores, winner, lopsidedness, date, league, heroDataUrls, playerCount, spotlight, skin } = props;
  const sk = THEMES[skin || 'classic'];
  const teams = sortTeams(teamScores, winner);
  const is3 = teams.length > 2;
  const pc = Math.min(playerCount, is3 ? 2 : 3);
  const totalScore = teams.reduce((s, [, d]) => s + d.score, 0) || 1;
  const showBar = spotlight.detailedVerdict;

  // Scale sizing by player count
  const nameFs = is3 ? 20 : pc === 1 ? 42 : pc === 2 ? 30 : 23;
  const scoreFs = is3 ? 60 : pc === 1 ? 96 : pc === 2 ? 84 : 72;
  const indivFs = is3 ? 14 : pc === 1 ? 24 : pc === 2 ? 20 : 16;
  const pillFs = is3 ? 12 : pc === 1 ? 18 : pc === 2 ? 14 : 12;
  const heroH = is3 ? 200 : pc === 1 ? 300 : pc === 2 ? 260 : 220;

  return (
    <div style={{
      width: 1200, height: 630,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, system-ui, sans-serif',
      background: sk.cardBg,
      border: sk.cardBorder,
      borderRadius: sk.cardRadius,
      boxShadow: sk.cardShadow,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Accent bar */}
      {sk.accentH > 0 && (
        <div style={{ display: 'flex', height: sk.accentH, flexShrink: 0 }}>
          {teams.map(([tid]) => (
            <div key={tid} style={{ flex: 1, background: CARD_TEAM_COLORS[tid] || '#444' }} />
          ))}
        </div>
      )}

      {/* Main: side-by-side team sections */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {teams.map(([teamId, td], idx) => {
          const isW = teamId === winner;
          const c = CARD_TEAM_COLORS[teamId] || '#888';
          const c2 = CARD_TEAM_SECONDARY[teamId] || c;
          const sorted = [...td.assets].sort((a, b) => b.score - a.score);
          const shown = sorted.slice(0, pc);
          const rest = sorted.length - shown.length;
          const heroUrl = (heroDataUrls[teamId] || [])[0];
          const isLast = idx === teams.length - 1;
          const textAlign = isLast && !is3 ? 'right' as const : 'left' as const;
          const flexAlign = isLast && !is3 ? 'flex-end' as const : 'flex-start' as const;

          return (
            <div key={teamId} style={{
              flex: 1,
              display: 'flex', flexDirection: 'column',
              justifyContent: 'flex-end',
              padding: is3 ? '16px 20px 20px' : '16px 32px 24px',
              position: 'relative',
              overflow: 'hidden',
              backgroundImage: sk.sectionBg(c, c2),
              borderRight: idx < teams.length - 1 ? sk.sectionDivider : 'none',
            }}>
              {/* Skin overlay */}
              {sk.overlay && <div style={sk.overlay} />}

              {/* Team name — top of section */}
              <div style={{
                position: 'absolute',
                top: is3 ? 12 : 16,
                ...(textAlign === 'right' ? { right: 32 } : { left: is3 ? 20 : 32 }),
                fontSize: is3 ? 11 : 13,
                fontWeight: 800,
                letterSpacing: 5,
                color: sk.teamNameColor,
                textTransform: 'uppercase' as const,
              }}>
                {TEAM_NICK[teamId] || teamId}
              </div>

              {/* Hero player cutout */}
              {heroUrl && (
                <img
                  src={heroUrl}
                  alt=""
                  style={{
                    position: 'absolute',
                    ...(idx === 0 ? { right: -20 } : { left: -20 }),
                    bottom: 0,
                    height: heroH,
                    width: 'auto',
                    opacity: sk.heroOp(isW),
                    filter: sk.heroFilter(c),
                    objectFit: 'contain',
                  }}
                />
              )}

              {/* Score — THE dominant element */}
              <div style={{
                fontSize: scoreFs,
                fontWeight: 900,
                lineHeight: 0.85,
                color: sk.scoreColor,
                textShadow: sk.scoreShadow(c),
                textAlign,
                position: 'relative',
                marginBottom: pc === 1 ? 14 : 8,
              }}>
                {fmt(td.score)}
              </div>

              {/* Players */}
              <div style={{
                display: 'flex', flexDirection: 'column',
                gap: pc === 1 ? 10 : 4,
                position: 'relative',
                alignItems: flexAlign,
              }}>
                {shown.map((asset, i) => (
                  <div key={`${asset.name}-${i}`} style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: flexAlign,
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'baseline', gap: 10,
                      textAlign,
                    }}>
                      <span style={{
                        fontSize: nameFs, fontWeight: 800,
                        color: sk.playerColor,
                        letterSpacing: -0.3,
                        textShadow: '0 1px 8px rgba(0,0,0,0.5)',
                      }}>
                        {asset.name}
                      </span>
                      <span style={{
                        fontSize: indivFs, fontWeight: 800,
                        color: sk.playerScoreColor(c),
                      }}>
                        {fmt(asset.score)}
                      </span>
                    </div>
                    <StatPills asset={asset} spotlight={spotlight} fontSize={pillFs} sk={sk} />
                  </div>
                ))}
                {rest > 0 && (
                  <span style={{
                    fontSize: Math.max(13, nameFs - 10),
                    color: 'rgba(255,255,255,0.35)', fontWeight: 600,
                    textAlign,
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
        flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: showBar ? 6 : 4,
        padding: showBar ? '10px 32px' : '8px 32px',
        background: sk.verdictBg,
        borderTop: sk.sectionDivider,
        position: 'relative',
      }}>
        {showBar && (
          <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12 }}>
            <span style={{
              fontSize: 12, fontWeight: 800, letterSpacing: 2,
              color: CARD_TEAM_COLORS[teams[0][0]] || '#888',
              width: 40, textAlign: 'right', flexShrink: 0,
            }}>
              {teams[0][0]}
            </span>
            <div style={{
              flex: 1, height: 8, borderRadius: 4,
              display: 'flex', overflow: 'hidden',
            }}>
              {teams.map(([tid, td]) => (
                <div key={tid} style={{
                  width: `${(td.score / totalScore) * 100}%`,
                  height: '100%',
                  background: CARD_TEAM_COLORS[tid] || '#888',
                }} />
              ))}
            </div>
            <span style={{
              fontSize: 12, fontWeight: 800, letterSpacing: 2,
              color: CARD_TEAM_COLORS[teams[teams.length - 1][0]] || '#888',
              width: 40, flexShrink: 0,
            }}>
              {teams[teams.length - 1][0]}
            </span>
          </div>
        )}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 20, width: '100%',
        }}>
          <span style={{
            fontSize: 13, fontWeight: 700, letterSpacing: 2,
            color: sk.verdictText(winner ? CARD_TEAM_COLORS[winner] || '#f9c74f' : null),
            textTransform: 'uppercase' as const,
          }}>
            {verdictLabel(winner, lopsidedness)}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 3,
            color: sk.brandColor,
            textTransform: 'uppercase' as const,
          }}>
            {league === 'WNBA' ? 'WNBA' : 'NBA'} Trade Mapper
          </span>
          {date && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)' }}>
              {shortDate(date)}
            </span>
          )}
        </div>
      </div>

      {/* Bottom accent */}
      {sk.accentH > 0 && (
        <div style={{ display: 'flex', height: Math.max(3, sk.accentH - 1), flexShrink: 0 }}>
          {teams.map(([tid]) => (
            <div key={tid} style={{ flex: 1, background: CARD_TEAM_COLORS[tid] || '#444' }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Square Card — 1080×1080, stacked team sections
// ══════════════════════════════════════════════════════════════

function SquareCard(props: ShareCardProps) {
  const { teamScores, winner, lopsidedness, date, league, heroDataUrls, playerCount, spotlight, skin } = props;
  const sk = THEMES[skin || 'classic'];
  const teams = sortTeams(teamScores, winner);
  const pc = Math.min(playerCount, 3);
  const totalScore = teams.reduce((s, [, d]) => s + d.score, 0) || 1;
  const showBar = spotlight.detailedVerdict;

  const nameFs = pc === 1 ? 38 : pc === 2 ? 30 : 24;
  const scoreFs = pc === 1 ? 100 : pc === 2 ? 88 : 76;
  const indivFs = pc === 1 ? 26 : pc === 2 ? 22 : 18;
  const pillFs = pc === 1 ? 18 : pc === 2 ? 15 : 13;
  const heroH = pc === 1 ? 340 : pc === 2 ? 280 : 240;
  const verdictH = showBar ? 90 : 70;
  const sectionH = Math.floor((1080 - (sk.accentH * 2) - verdictH) / teams.length);

  return (
    <div style={{
      width: 1080, height: 1080,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, system-ui, sans-serif',
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
        const isW = teamId === winner;
        const c = CARD_TEAM_COLORS[teamId] || '#888';
        const c2 = CARD_TEAM_SECONDARY[teamId] || c;
        const sorted = [...td.assets].sort((a, b) => b.score - a.score);
        const shown = sorted.slice(0, pc);
        const rest = sorted.length - shown.length;
        const heroUrl = (heroDataUrls[teamId] || [])[0];

        return (
          <div key={teamId} style={{
            height: sectionH,
            display: 'flex', flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: '16px 44px 20px',
            position: 'relative', overflow: 'hidden',
            backgroundImage: sk.sectionBg(c, c2),
            borderBottom: idx < teams.length - 1 ? sk.sectionDivider : 'none',
          }}>
            {sk.overlay && <div style={sk.overlay} />}

            <div style={{
              position: 'absolute', top: 14, left: 44,
              fontSize: 14, fontWeight: 800, letterSpacing: 5,
              color: sk.teamNameColor, textTransform: 'uppercase' as const,
            }}>
              {TEAM_NICK[teamId] || teamId}
            </div>

            {heroUrl && (
              <img src={heroUrl} alt="" style={{
                position: 'absolute', right: -10, bottom: 0,
                height: heroH, width: 'auto',
                opacity: sk.heroOp(isW),
                filter: sk.heroFilter(c),
                objectFit: 'contain',
              }} />
            )}

            <div style={{
              fontSize: scoreFs, fontWeight: 900, lineHeight: 0.85,
              color: sk.scoreColor, position: 'relative',
              textShadow: sk.scoreShadow(c),
              marginBottom: 10,
            }}>
              {fmt(td.score)}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: pc === 1 ? 10 : 5, position: 'relative' }}>
              {shown.map((asset, i) => (
                <div key={`${asset.name}-${i}`} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{
                      fontSize: nameFs, fontWeight: 800, color: sk.playerColor,
                      textShadow: '0 1px 6px rgba(0,0,0,0.5)',
                    }}>
                      {asset.name}
                    </span>
                    <span style={{ fontSize: indivFs, fontWeight: 800, color: sk.playerScoreColor(c) }}>
                      {fmt(asset.score)}
                    </span>
                  </div>
                  <StatPills asset={asset} spotlight={spotlight} fontSize={pillFs} sk={sk} />
                </div>
              ))}
              {rest > 0 && (
                <span style={{ fontSize: Math.max(14, nameFs - 10), color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
                  + {rest} more
                </span>
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
        padding: '10px 32px', background: sk.verdictBg,
        borderTop: sk.sectionDivider,
      }}>
        {showBar && (
          <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: CARD_TEAM_COLORS[teams[0][0]] || '#888', width: 40, textAlign: 'right', flexShrink: 0 }}>
              {teams[0][0]}
            </span>
            <div style={{ flex: 1, height: 10, borderRadius: 5, display: 'flex', overflow: 'hidden' }}>
              {teams.map(([tid, td]) => (
                <div key={tid} style={{ width: `${(td.score / totalScore) * 100}%`, height: '100%', background: CARD_TEAM_COLORS[tid] || '#888' }} />
              ))}
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: CARD_TEAM_COLORS[teams[teams.length - 1][0]] || '#888', width: 40, flexShrink: 0 }}>
              {teams[teams.length - 1][0]}
            </span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <span style={{
            fontSize: 15, fontWeight: 700, letterSpacing: 2,
            color: sk.verdictText(winner ? CARD_TEAM_COLORS[winner] || '#f9c74f' : null),
            textTransform: 'uppercase' as const,
          }}>
            {verdictLabel(winner, lopsidedness)}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: sk.brandColor, textTransform: 'uppercase' as const }}>
            {league === 'WNBA' ? 'WNBA' : 'NBA'} Trade Mapper
          </span>
          {date && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)' }}>{shortDate(date)}</span>}
        </div>
      </div>

      {sk.accentH > 0 && (
        <div style={{ display: 'flex', height: Math.max(3, sk.accentH - 1), flexShrink: 0 }}>
          {teams.map(([tid]) => <div key={tid} style={{ flex: 1, background: CARD_TEAM_COLORS[tid] || '#444' }} />)}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Story Card — 1080×1920, stacked (taller sections)
// ══════════════════════════════════════════════════════════════

function StoryCard(props: ShareCardProps) {
  const { teamScores, winner, lopsidedness, date, league, heroDataUrls, playerCount, spotlight, skin } = props;
  const sk = THEMES[skin || 'classic'];
  const teams = sortTeams(teamScores, winner);
  const pc = Math.min(playerCount, 3);
  const totalScore = teams.reduce((s, [, d]) => s + d.score, 0) || 1;
  const showBar = spotlight.detailedVerdict;
  const bandH = showBar ? 280 : 240;
  const sectionH = Math.floor((1920 - (sk.accentH * 2) - bandH) / teams.length);

  const nameFs = pc === 1 ? 44 : pc === 2 ? 36 : 28;
  const scoreFs = 120;
  const indivFs = pc === 1 ? 32 : pc === 2 ? 26 : 22;
  const pillFs = pc === 1 ? 20 : pc === 2 ? 17 : 15;
  const heroH = pc === 1 ? 440 : pc === 2 ? 380 : 320;

  return (
    <div style={{
      width: 1080, height: 1920,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, system-ui, sans-serif',
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
        const isW = teamId === winner;
        const c = CARD_TEAM_COLORS[teamId] || '#888';
        const c2 = CARD_TEAM_SECONDARY[teamId] || c;
        const sorted = [...td.assets].sort((a, b) => b.score - a.score);
        const shown = pc < sorted.length ? sorted.slice(0, pc) : sorted;
        const rest = sorted.length - shown.length;
        const heroUrl = (heroDataUrls[teamId] || [])[0];

        return (
          <div key={teamId} style={{
            height: sectionH,
            display: 'flex', flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: '24px 52px 32px',
            position: 'relative', overflow: 'hidden',
            backgroundImage: sk.sectionBg(c, c2),
            borderBottom: idx < teams.length - 1 ? sk.sectionDivider : 'none',
          }}>
            {sk.overlay && <div style={sk.overlay} />}

            <div style={{
              position: 'absolute', top: 22, left: 52,
              fontSize: 18, fontWeight: 800, letterSpacing: 6,
              color: sk.teamNameColor, textTransform: 'uppercase' as const,
            }}>
              {TEAM_NICK[teamId] || teamId}
            </div>

            {heroUrl && (
              <img src={heroUrl} alt="" style={{
                position: 'absolute', right: -20, bottom: 0,
                height: heroH, width: 'auto',
                opacity: sk.heroOp(isW),
                filter: sk.heroFilter(c),
                objectFit: 'contain',
              }} />
            )}

            <div style={{
              fontSize: scoreFs, fontWeight: 900, lineHeight: 0.85,
              color: sk.scoreColor, position: 'relative',
              textShadow: sk.scoreShadow(c),
              marginBottom: 16,
            }}>
              {fmt(td.score)}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: pc === 1 ? 14 : 8, position: 'relative' }}>
              {shown.map((asset, i) => (
                <div key={`${asset.name}-${i}`} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                    <span style={{
                      fontSize: nameFs, fontWeight: 800, color: sk.playerColor,
                      textShadow: '0 1px 8px rgba(0,0,0,0.5)',
                    }}>
                      {asset.name}
                    </span>
                    <span style={{ fontSize: indivFs, fontWeight: 800, color: sk.playerScoreColor(c) }}>
                      {fmt(asset.score)}
                    </span>
                  </div>
                  <StatPills asset={asset} spotlight={spotlight} fontSize={pillFs} sk={sk} />
                </div>
              ))}
              {rest > 0 && (
                <span style={{ fontSize: Math.max(16, nameFs - 12), color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
                  + {rest} more
                </span>
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
        padding: '0 52px', background: sk.verdictBg,
        borderTop: sk.sectionDivider,
      }}>
        <span style={{
          fontSize: 14, fontWeight: 700, letterSpacing: 5,
          color: sk.brandColor, textTransform: 'uppercase' as const,
        }}>
          {league === 'WNBA' ? 'WNBA' : 'NBA'} Trade Mapper
        </span>

        {showBar && (
          <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: 2, color: CARD_TEAM_COLORS[teams[0][0]] || '#888' }}>
              {teams[0][0]} {fmt(teams[0][1].score)}
            </span>
            <div style={{ flex: 1, height: 12, borderRadius: 6, display: 'flex', overflow: 'hidden' }}>
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
          color: sk.verdictText(winner ? CARD_TEAM_COLORS[winner] || '#f9c74f' : null),
          textTransform: 'uppercase' as const, textAlign: 'center',
        }}>
          {verdictLabel(winner, lopsidedness)}
        </span>

        {date && <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.22)' }}>{shortDate(date)}</span>}
        <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.12)', marginTop: 4 }}>nbatrades.vercel.app</span>
      </div>

      {sk.accentH > 0 && (
        <div style={{ display: 'flex', height: Math.max(3, sk.accentH - 1), flexShrink: 0 }}>
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
