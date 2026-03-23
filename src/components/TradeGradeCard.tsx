'use client';

/**
 * Trade Grade Card — share card format centered on letter grades.
 *
 * Layout (square 1080×1080):
 *   Top ~65%: Two team sections side by side. Each has:
 *     - Large letter grade (A+, B, etc.)
 *     - Team name + color accent
 *     - Hero headshot, per-skin treatment
 *   Bottom ~35%: Stats table
 *     - Winner's top 3 players by WS with contract values
 *     - Loser's top player(s) with WS + contract
 *     - Verdict line
 *
 * 4 skins: Classic (Fleer), Prizm (Panini Chrome), Noir (BR editorial), Retro (Skybox)
 */

import { CARD_TEAM_COLORS, CARD_TEAM_SECONDARY } from '@/lib/card-templates';
import { getTradeGrade, fmtMoney, fmtWs, type GradeInfo } from '@/lib/trade-grades';
import type { TeamScoreEntry } from '@/lib/card-templates';
import type { CardSkin } from '@/lib/skins';
import { getVerdict } from '@/lib/verdicts';

// ── Team nicknames ──────────────────────────────────────────

const TEAM_NICK: Record<string, string> = {
  ATL: 'HAWKS', BOS: 'CELTICS', BKN: 'NETS', CHA: 'HORNETS',
  CHI: 'BULLS', CLE: 'CAVALIERS', DAL: 'MAVERICKS', DEN: 'NUGGETS',
  DET: 'PISTONS', GSW: 'WARRIORS', HOU: 'ROCKETS', IND: 'PACERS',
  LAC: 'CLIPPERS', LAL: 'LAKERS', MEM: 'GRIZZLIES', MIA: 'HEAT',
  MIL: 'BUCKS', MIN: 'TIMBERWOLVES', NOP: 'PELICANS', NYK: 'KNICKS',
  OKC: 'THUNDER', ORL: 'MAGIC', PHI: '76ERS', PHX: 'SUNS',
  POR: 'BLAZERS', SAC: 'KINGS', SAS: 'SPURS', TOR: 'RAPTORS',
  UTA: 'JAZZ', WAS: 'WIZARDS',
  SEA: 'SUPERSONICS', NJN: 'NETS', VAN: 'GRIZZLIES', NOH: 'HORNETS',
  NOK: 'HORNETS', WSB: 'BULLETS', CHH: 'HORNETS', SDC: 'CLIPPERS',
  KCK: 'KINGS', BUF: 'BRAVES',
};

// ── Helpers ─────────────────────────────────────────────────

function ha(hex: string, alpha: number): string {
  const c = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function darken(hex: string, amt: number): string {
  const c = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = Math.round(parseInt(c.slice(0, 2), 16) * (1 - amt));
  const g = Math.round(parseInt(c.slice(2, 4), 16) * (1 - amt));
  const b = Math.round(parseInt(c.slice(4, 6), 16) * (1 - amt));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function lighten(hex: string, amt: number): string {
  const c = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = Math.min(255, Math.round(parseInt(c.slice(0, 2), 16) + (255 - parseInt(c.slice(0, 2), 16)) * amt));
  const g = Math.min(255, Math.round(parseInt(c.slice(2, 4), 16) + (255 - parseInt(c.slice(2, 4), 16)) * amt));
  const b = Math.min(255, Math.round(parseInt(c.slice(4, 6), 16) + (255 - parseInt(c.slice(4, 6), 16)) * amt));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function shortDate(s?: string | null): string {
  if (!s) return '';
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const p = s.split('-');
  if (p.length < 3) return s;
  return `${months[parseInt(p[1], 10) - 1]} ${parseInt(p[2], 10)}, ${p[0]}`;
}

function verdictText(winner: string | null, lop: number): string {
  return getVerdict(winner, lop);
}

// ── Skin theme config ───────────────────────────────────────

interface GradeCardTheme {
  // Card background
  cardBg: string;
  cardBorder: string;

  // Section background (per team)
  sectionBg: (teamColor: string, teamColor2: string) => string;
  sectionOverlay?: (teamColor: string) => React.CSSProperties;

  // Grade badge
  gradeColor: string;
  gradeShadow: (teamColor: string) => string;
  gradeModColor: (teamColor: string) => string;  // +/- character color

  // Team label
  teamLabelColor: (teamColor: string) => string;
  scoreSubColor: string;  // "XX.X TRADE SCORE" color

  // Player name at bottom of hero section
  playerNameColor: string;
  playerNameShadow: string;
  playerStatColor: (teamColor: string) => string;

  // Headshot
  headshotFilter: string;
  headshotOpacity: number;
  frontLightIntensity: number;    // 0-1, radial white overlay on face area
  rimLightIntensity: number;      // 0-1, team-colored rim from side
  edgeFadeDarkness: number;       // 0-1, how dark the edge fade is
  vignetteIntensity: number;      // 0-1, radial vignette

  // Divider between team sections
  divider: string;

  // Accent line between hero and stats
  accentLineHeight: number;

  // Stats section
  statsBg: string;
  statsBorder: string;
  statsHeaderColor: string;
  statsTeamLabelColor: (teamColor: string) => string;
  statsNameColor: (isTop: boolean) => string;
  statsValueColor: string;
  statsSalaryColor: string;
  statsRowBorder: string;

  // Verdict
  verdictColor: (winnerColor: string | null) => string;
  dateColor: string;
  brandColor: string;

  // isLight flag — controls general text strategies
  isLight: boolean;
}

// ── NOIR ────────────────────────────────────────────────────

const noirTheme: GradeCardTheme = {
  cardBg: '#000000',
  cardBorder: 'none',

  sectionBg: () => '#000000',

  gradeColor: '#ffffff',
  gradeShadow: (c) => `0 0 80px ${ha(c, 0.5)}, 0 0 160px ${ha(c, 0.2)}`,
  gradeModColor: (c) => ha(c, 0.9),

  teamLabelColor: (c) => ha(c, 0.7),
  scoreSubColor: 'rgba(255,255,255,0.3)',

  playerNameColor: '#ffffff',
  playerNameShadow: '0 2px 12px rgba(0,0,0,0.8)',
  playerStatColor: (c) => ha(c, 0.7),

  headshotFilter: 'saturate(0.4) contrast(1.6) brightness(1.3)',
  headshotOpacity: 0.88,
  frontLightIntensity: 0.18,
  rimLightIntensity: 0.25,
  edgeFadeDarkness: 0.6,
  vignetteIntensity: 0.6,

  divider: 'linear-gradient(180deg, transparent 10%, rgba(255,255,255,0.08) 50%, transparent 90%)',

  accentLineHeight: 3,

  statsBg: 'rgba(255,255,255,0.02)',
  statsBorder: '1px solid rgba(255,255,255,0.06)',
  statsHeaderColor: 'rgba(255,255,255,0.3)',
  statsTeamLabelColor: (c) => c,
  statsNameColor: (isTop) => isTop ? '#ffffff' : 'rgba(255,255,255,0.7)',
  statsValueColor: '#ffffff',
  statsSalaryColor: 'rgba(255,255,255,0.5)',
  statsRowBorder: '1px solid rgba(255,255,255,0.06)',

  verdictColor: (wc) => wc ? ha(wc, 0.8) : 'rgba(255,255,255,0.4)',
  dateColor: 'rgba(255,255,255,0.2)',
  brandColor: 'rgba(255,255,255,0.15)',

  isLight: false,
};

// ── CLASSIC ─────────────────────────────────────────────────

const classicTheme: GradeCardTheme = {
  cardBg: '#F5F0E8',
  cardBorder: '3px solid #D4C5A0',

  sectionBg: (c) =>
    `linear-gradient(135deg, ${ha(c, 0.08)} 0%, #F5F0E8 40%, ${ha(c, 0.04)} 100%)`,

  gradeColor: '#1a1a1a',
  gradeShadow: () => 'none',
  gradeModColor: (c) => darken(c, 0.1),

  teamLabelColor: (c) => darken(c, 0.1),
  scoreSubColor: 'rgba(0,0,0,0.5)',

  playerNameColor: '#1a1a1a',
  playerNameShadow: 'none',
  playerStatColor: (c) => darken(c, 0.15),

  headshotFilter: 'sepia(0.2) saturate(0.85) contrast(1.1) brightness(1.05)',
  headshotOpacity: 0.82,
  frontLightIntensity: 0.08,
  rimLightIntensity: 0.12,
  edgeFadeDarkness: 0.4,
  vignetteIntensity: 0.25,

  divider: 'linear-gradient(180deg, transparent 10%, #D4C5A0 50%, transparent 90%)',

  accentLineHeight: 3,

  statsBg: '#EDE6D6',
  statsBorder: '1px solid rgba(0,0,0,0.08)',
  statsHeaderColor: 'rgba(0,0,0,0.35)',
  statsTeamLabelColor: (c) => darken(c, 0.1),
  statsNameColor: (isTop) => isTop ? '#1a1a1a' : 'rgba(0,0,0,0.55)',
  statsValueColor: '#1a1a1a',
  statsSalaryColor: 'rgba(0,0,0,0.4)',
  statsRowBorder: '1px solid rgba(0,0,0,0.06)',

  verdictColor: (wc) => wc || '#8B7355',
  dateColor: 'rgba(0,0,0,0.25)',
  brandColor: 'rgba(0,0,0,0.2)',

  isLight: true,
};

// ── PRIZM ───────────────────────────────────────────────────

const prizmTheme: GradeCardTheme = {
  cardBg: '#3a3a52',
  cardBorder: 'none',

  sectionBg: (c) =>
    `linear-gradient(160deg, ${darken(c, 0.25)} 0%, #3a3a52 40%, #42425a 60%, ${darken(c, 0.30)} 100%)`,
  sectionOverlay: () => ({
    position: 'absolute' as const,
    inset: 0,
    backgroundImage:
      'linear-gradient(135deg, rgba(255,60,60,0.06) 0%, rgba(255,200,50,0.06) 16%, rgba(50,255,100,0.05) 33%, rgba(50,150,255,0.07) 50%, rgba(180,50,255,0.06) 66%, rgba(255,50,150,0.05) 83%, rgba(255,60,60,0.06) 100%)',
    pointerEvents: 'none' as const,
    zIndex: 1,
  }),

  gradeColor: '#ffffff',
  gradeShadow: (c) => `0 0 60px ${ha(c, 0.4)}, 0 0 120px rgba(200,200,255,0.2)`,
  gradeModColor: (c) => lighten(c, 0.45),

  teamLabelColor: (c) => lighten(c, 0.35),
  scoreSubColor: 'rgba(220,220,250,0.35)',

  playerNameColor: '#f0f0ff',
  playerNameShadow: '0 2px 12px rgba(0,0,0,0.6)',
  playerStatColor: (c) => lighten(c, 0.45),

  headshotFilter: 'saturate(0.7) contrast(1.25) brightness(1.15)',
  headshotOpacity: 0.85,
  frontLightIntensity: 0.14,
  rimLightIntensity: 0.2,
  edgeFadeDarkness: 0.55,
  vignetteIntensity: 0.5,

  divider: 'linear-gradient(180deg, transparent 10%, rgba(200,200,240,0.15) 50%, transparent 90%)',

  accentLineHeight: 2,

  statsBg: 'rgba(30,30,50,0.6)',
  statsBorder: '1px solid rgba(200,200,240,0.08)',
  statsHeaderColor: 'rgba(220,220,250,0.35)',
  statsTeamLabelColor: (c) => lighten(c, 0.35),
  statsNameColor: (isTop) => isTop ? '#f0f0ff' : 'rgba(220,220,250,0.7)',
  statsValueColor: '#f0f0ff',
  statsSalaryColor: 'rgba(220,220,250,0.45)',
  statsRowBorder: '1px solid rgba(200,200,240,0.06)',

  verdictColor: (wc) => wc || 'rgba(220,220,250,0.7)',
  dateColor: 'rgba(220,220,250,0.2)',
  brandColor: 'rgba(220,220,250,0.25)',

  isLight: false,
};

// ── RETRO ───────────────────────────────────────────────────

const retroTheme: GradeCardTheme = {
  cardBg: '#0a0a0a',
  cardBorder: '6px solid #ffffff',

  sectionBg: (c, c2) =>
    `linear-gradient(145deg, ${c} 0%, ${darken(c, 0.2)} 50%, ${c2} 100%)`,

  gradeColor: '#ffffff',
  gradeShadow: () => '4px 4px 0px rgba(0,0,0,0.5), 8px 8px 0px rgba(0,0,0,0.2)',
  gradeModColor: () => 'rgba(255,230,0,0.9)',

  teamLabelColor: () => 'rgba(255,255,255,0.85)',
  scoreSubColor: 'rgba(255,255,255,0.5)',

  playerNameColor: '#ffffff',
  playerNameShadow: '3px 3px 0px rgba(0,0,0,0.5)',
  playerStatColor: () => 'rgba(255,255,255,0.8)',

  headshotFilter: 'saturate(1.4) contrast(1.15) brightness(1.1)',
  headshotOpacity: 0.88,
  frontLightIntensity: 0.06,
  rimLightIntensity: 0.15,
  edgeFadeDarkness: 0.5,
  vignetteIntensity: 0.35,

  divider: 'linear-gradient(180deg, transparent 5%, #ffffff 50%, transparent 95%)',

  accentLineHeight: 4,

  statsBg: 'rgba(0,0,0,0.85)',
  statsBorder: '3px solid #ffffff',
  statsHeaderColor: 'rgba(255,255,255,0.45)',
  statsTeamLabelColor: (c) => lighten(c, 0.25),
  statsNameColor: (isTop) => isTop ? '#ffffff' : 'rgba(255,255,255,0.7)',
  statsValueColor: '#ffffff',
  statsSalaryColor: 'rgba(255,255,255,0.5)',
  statsRowBorder: '1px solid rgba(255,255,255,0.1)',

  verdictColor: (wc) => wc || '#FFE500',
  dateColor: 'rgba(255,255,255,0.25)',
  brandColor: 'rgba(255,255,255,0.3)',

  isLight: false,
};

const GRADE_THEMES: Record<CardSkin, GradeCardTheme> = {
  classic: classicTheme,
  prizm: prizmTheme,
  noir: noirTheme,
  retro: retroTheme,
};

// ── Types ───────────────────────────────────────────────────

interface SalaryPlayer {
  name: string;
  acquired_value: number;
  acquired_seasons: number;
}

interface SalaryTeam {
  total_acquired: number;
  players: SalaryPlayer[];
}

export interface TradeGradeCardProps {
  teamScores: Record<string, TeamScoreEntry>;
  winner: string | null;
  lopsidedness: number;
  date?: string | null;
  salaryDetails?: Record<string, SalaryTeam>;
  /** Pre-loaded headshot data URLs per team */
  headshots?: Record<string, string[]>;
  skin?: CardSkin;
  caption?: string;
  selectedPlayers?: Record<string, string[]>;
}

// ── Echo shadow helper (matches ShareCard) ──

function addEchoShadow(existingShadow: string): string {
  const echo = '2px 3px 0 rgba(255,255,255,0.6)';
  if (!existingShadow || existingShadow === 'none') return echo;
  return `${echo}, ${existingShadow}`;
}

// ── Grade Badge ─────────────────────────────────────────────

function GradeBadge({ grade, teamColor, theme }: {
  grade: GradeInfo;
  teamColor: string;
  theme: GradeCardTheme;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      gap: 0,
    }}>
      <span style={{
        fontSize: 160,
        fontWeight: 900,
        lineHeight: 0.8,
        color: theme.gradeColor,
        textShadow: addEchoShadow(theme.gradeShadow(teamColor)),
        letterSpacing: -8,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        {grade.grade[0]}
      </span>
      {grade.grade.length > 1 && (
        <span style={{
          fontSize: 80,
          fontWeight: 900,
          lineHeight: 0.8,
          color: theme.gradeModColor(teamColor),
          textShadow: addEchoShadow('none'),
          marginLeft: -4,
          fontFamily: 'Inter, system-ui, sans-serif',
        }}>
          {grade.grade.slice(1)}
        </span>
      )}
    </div>
  );
}

// ── Headshot with per-skin treatment ────────────────────────

function DramaticHeadshot({ src, teamColor, side, theme, teamId }: {
  src?: string;
  teamColor: string;
  side: 'left' | 'right';
  theme: GradeCardTheme;
  teamId?: string;
}) {
  if (!src) {
    // Fallback: large team abbreviation when no headshot available
    if (teamId) {
      return (
        <div style={{
          position: 'absolute',
          bottom: -20,
          [side]: -20,
          width: '105%',
          height: '110%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 1,
        }}>
          <div style={{
            fontSize: 220,
            fontWeight: 900,
            color: ha(teamColor, theme.isLight ? 0.08 : 0.12),
            letterSpacing: -10,
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
      bottom: -10,
      [side]: -10,
      width: '100%',
      height: '95%',
      pointerEvents: 'none',
      zIndex: 1,
    }}>
      {/* The headshot */}
      <div style={{
        width: '100%',
        height: '100%',
        backgroundImage: `url(${src})`,
        backgroundSize: 'contain',
        backgroundPosition: `${side} bottom`,
        backgroundRepeat: 'no-repeat',
        opacity: theme.headshotOpacity,
        filter: theme.headshotFilter,
      }} />
      {/* Front lighting — brightens center/face area */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse at ${side === 'left' ? '45% 35%' : '55% 35%'}, rgba(255,255,255,${theme.frontLightIntensity}) 0%, transparent 50%)`,
        pointerEvents: 'none',
      }} />
      {/* Directional team-color rim light from the side */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: side === 'left'
          ? `linear-gradient(90deg, ${ha(teamColor, theme.rimLightIntensity)} 0%, transparent 45%)`
          : `linear-gradient(270deg, ${ha(teamColor, theme.rimLightIntensity)} 0%, transparent 45%)`,
        pointerEvents: 'none',
      }} />
      {/* Edge fade — opposite side fades to bg */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: side === 'left'
          ? `linear-gradient(270deg, rgba(0,0,0,${theme.edgeFadeDarkness}) 0%, transparent 35%)`
          : `linear-gradient(90deg, rgba(0,0,0,${theme.edgeFadeDarkness}) 0%, transparent 35%)`,
        pointerEvents: 'none',
      }} />
    </div>
  );
}

// ── Stats Row ───────────────────────────────────────────────

function StatsRow({ name, ws, salary, isTop, theme }: {
  name: string;
  ws: number | undefined;
  salary?: number;
  isTop?: boolean;
  theme: GradeCardTheme;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '6px 0',
      borderBottom: theme.statsRowBorder,
    }}>
      <span style={{
        fontSize: isTop ? 18 : 16,
        fontWeight: isTop ? 800 : 600,
        color: theme.statsNameColor(!!isTop),
        flex: 1,
        letterSpacing: 0.3,
      }}>
        {name}
      </span>
      <span style={{
        fontSize: isTop ? 18 : 16,
        fontWeight: 800,
        color: theme.statsValueColor,
        width: 60,
        textAlign: 'right',
        fontFamily: 'var(--font-mono, monospace)',
        whiteSpace: 'nowrap',
      }}>
        {fmtWs(ws)}
      </span>
      <span style={{
        fontSize: isTop ? 16 : 14,
        fontWeight: 600,
        color: theme.statsSalaryColor,
        width: 70,
        textAlign: 'right',
        whiteSpace: 'nowrap',
      }}>
        {salary != null ? fmtMoney(salary) : '—'}
      </span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Trade Grade Card — 1080×1080, all skins
// ══════════════════════════════════════════════════════════════

export default function TradeGradeCard({
  teamScores,
  winner,
  lopsidedness,
  date,
  salaryDetails,
  headshots,
  skin = 'noir',
  caption,
  selectedPlayers,
}: TradeGradeCardProps) {
  const hasCaption = !!caption?.trim();
  const theme = GRADE_THEMES[skin];

  // Sort teams: winner first
  const teams = Object.entries(teamScores).sort((a, b) => {
    if (winner) { if (a[0] === winner) return -1; if (b[0] === winner) return 1; }
    return b[1].score - a[1].score;
  }) as [string, TeamScoreEntry][];

  const gradeW = getTradeGrade(teams[0][1].score);
  const gradeL = teams.length > 1 ? getTradeGrade(teams[1][1].score) : null;

  const cW = CARD_TEAM_COLORS[teams[0][0]] || '#888';
  const cL = teams.length > 1 ? (CARD_TEAM_COLORS[teams[1][0]] || '#888') : '#888';
  const c2W = CARD_TEAM_SECONDARY[teams[0][0]] || cW;
  const c2L = teams.length > 1 ? (CARD_TEAM_SECONDARY[teams[1][0]] || cL) : '#888';

  // Top players per team by score, filtered by selectedPlayers if provided
  const filterBySelected = (assets: typeof teams[0][1]['assets'], teamId: string) => {
    const sel = selectedPlayers?.[teamId];
    const filtered = sel
      ? assets.filter(a => sel.includes(a.name) && (a.ws ?? 0) > 0)
      : assets.filter(a => (a.ws ?? 0) > 0);
    return [...filtered].sort((a, b) => b.score - a.score);
  };
  const topW = filterBySelected(teams[0][1].assets, teams[0][0]);
  const topL = teams.length > 1
    ? filterBySelected(teams[1][1].assets, teams[1][0])
    : [];

  // Salary lookup
  const salaryFor = (teamId: string, name: string): number | undefined => {
    const team = salaryDetails?.[teamId];
    if (!team) return undefined;
    const p = team.players.find(pl => pl.name === name);
    return p?.acquired_value;
  };

  const headshotW = headshots?.[teams[0][0]]?.[0];
  const headshotL = teams.length > 1 ? headshots?.[teams[1][0]]?.[0] : undefined;

  return (
    <div style={{
      width: 1080,
      height: 1080,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      background: theme.cardBg,
      border: theme.cardBorder,
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* ── TOP: Hero zone (~65%) — two team sections side by side ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* Winner section (left) */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '40px 40px 24px',
          position: 'relative',
          overflow: 'hidden',
          background: theme.sectionBg(cW, c2W),
        }}>
          {/* Holographic / skin overlay */}
          {theme.sectionOverlay && <div style={theme.sectionOverlay(cW)} />}

          {/* Subtle team-color background glow (noir/prizm only) */}
          {!theme.isLight && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(ellipse at 30% 70%, ${ha(cW, 0.12)} 0%, transparent 70%)`,
              pointerEvents: 'none',
            }} />
          )}

          {/* Headshot */}
          <DramaticHeadshot src={headshotW} teamColor={cW} side="left" theme={theme} teamId={teams[0][0]} />

          {/* Vignette */}
          <div style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse at 40% 45%, transparent 25%, rgba(0,0,0,${theme.vignetteIntensity}) 100%)`,
            pointerEvents: 'none', zIndex: 2,
          }} />

          {/* Classic: left accent bar */}
          {skin === 'classic' && (
            <div style={{
              position: 'absolute', top: 0, left: 0, bottom: 0,
              width: 8, background: cW, zIndex: 5,
            }} />
          )}

          {/* Content */}
          <div style={{ position: 'relative', zIndex: 3 }}>
            <div style={{
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: 6,
              color: theme.teamLabelColor(cW),
              textShadow: addEchoShadow('none'),
              marginBottom: 8,
            }}>
              {TEAM_NICK[teams[0][0]] || teams[0][0]}
            </div>
            <GradeBadge grade={gradeW} teamColor={cW} theme={theme} />
          </div>

          {/* Top player name at bottom */}
          <div style={{ position: 'relative', zIndex: 3 }}>
            {topW[0] && (
              <div style={{
                fontSize: 28,
                fontWeight: 800,
                color: theme.playerNameColor,
                letterSpacing: -0.5,
                textShadow: addEchoShadow(theme.playerNameShadow),
              }}>
                {topW[0].name}
              </div>
            )}
            {topW[0] && (
              <div style={{
                fontSize: 14,
                fontWeight: 600,
                color: theme.playerStatColor(cW),
                textShadow: addEchoShadow('none'),
                marginTop: 2,
              }}>
                {fmtWs(topW[0].ws)} WS{topW[0].seasons ? ` · ${topW[0].seasons} seasons` : ''}
                {salaryFor(teams[0][0], topW[0].name) != null &&
                  ` · ${fmtMoney(salaryFor(teams[0][0], topW[0].name)!)}`}
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{
          width: skin === 'retro' ? 4 : 1,
          background: theme.divider,
          ...(skin === 'retro' ? { backgroundColor: '#ffffff' } : {}),
        }} />

        {/* Loser section (right) */}
        {teams.length > 1 && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '40px 40px 24px',
            position: 'relative',
            overflow: 'hidden',
            background: theme.sectionBg(cL, c2L),
          }}>
            {/* Holographic / skin overlay */}
            {theme.sectionOverlay && <div style={theme.sectionOverlay(cL)} />}

            {/* Team-color background glow */}
            {!theme.isLight && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: `radial-gradient(ellipse at 70% 70%, ${ha(cL, 0.10)} 0%, transparent 70%)`,
                pointerEvents: 'none',
              }} />
            )}

            {/* Headshot */}
            <DramaticHeadshot src={headshotL} teamColor={cL} side="right" theme={theme} teamId={teams[1][0]} />

            {/* Vignette */}
            <div style={{
              position: 'absolute', inset: 0,
              background: `radial-gradient(ellipse at 60% 45%, transparent 25%, rgba(0,0,0,${theme.vignetteIntensity}) 100%)`,
              pointerEvents: 'none', zIndex: 2,
            }} />

            {/* Content — right aligned */}
            <div style={{ position: 'relative', zIndex: 3, textAlign: 'right' }}>
              <div style={{
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: 6,
                color: theme.teamLabelColor(cL),
                textShadow: addEchoShadow('none'),
                marginBottom: 8,
              }}>
                {TEAM_NICK[teams[1][0]] || teams[1][0]}
              </div>
              {gradeL && <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <GradeBadge grade={gradeL} teamColor={cL} theme={theme} />
              </div>}
            </div>

            {/* Top player name at bottom */}
            <div style={{ position: 'relative', zIndex: 3, textAlign: 'right' }}>
              {topL[0] && (
                <div style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: theme.playerNameColor,
                  letterSpacing: -0.5,
                  textShadow: theme.playerNameShadow,
                }}>
                  {topL[0].name}
                </div>
              )}
              {topL[0] && (
                <div style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: theme.playerStatColor(cL),
                  textShadow: addEchoShadow('none'),
                  marginTop: 2,
                }}>
                  {fmtWs(topL[0].ws)} WS{topL[0].seasons ? ` · ${topL[0].seasons} seasons` : ''}
                  {salaryFor(teams[1][0], topL[0].name) != null &&
                    ` · ${fmtMoney(salaryFor(teams[1][0], topL[0].name)!)}`}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Team-color accent line ── */}
      <div style={{
        height: theme.accentLineHeight,
        display: 'flex',
      }}>
        <div style={{ flex: 1, background: `linear-gradient(90deg, ${cW}, transparent)` }} />
        <div style={{ flex: 1, background: `linear-gradient(270deg, ${cL}, transparent)` }} />
      </div>

      {/* ── BOTTOM: Stats zone ── */}
      <div style={{
        flexShrink: 0,
        padding: '20px 40px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        background: theme.statsBg,
      }}>
        {/* Column headers */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 0 8px',
          borderBottom: theme.statsRowBorder,
        }}>
          <span style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 4,
            color: theme.statsHeaderColor,
            flex: 1,
          }}>
            KEY PLAYERS
          </span>
          <span style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 3,
            color: theme.statsHeaderColor,
            width: 60,
            textAlign: 'right',
            whiteSpace: 'nowrap',
          }}>
            WS
          </span>
          <span style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 3,
            color: theme.statsHeaderColor,
            width: 70,
            textAlign: 'right',
            whiteSpace: 'nowrap',
          }}>
            SALARY
          </span>
        </div>

        {/* Winner's team label */}
        <div style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 4,
          color: theme.statsTeamLabelColor(cW),
          marginTop: 8,
          marginBottom: 2,
        }}>
          {teams[0][0]} RECEIVED
        </div>

        {/* Winner's players */}
        {topW.map((a, i) => (
          <StatsRow
            key={a.name}
            name={a.name}
            ws={a.ws}
            salary={salaryFor(teams[0][0], a.name)}
            isTop={i === 0}
            theme={theme}
          />
        ))}

        {/* Loser's team label */}
        {teams.length > 1 && (
          <div style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 4,
            color: theme.statsTeamLabelColor(cL),
            marginTop: 12,
            marginBottom: 2,
          }}>
            {teams[1][0]} RECEIVED
          </div>
        )}

        {/* Loser's players */}
        {topL.map((a, i) => (
          <StatsRow
            key={a.name}
            name={a.name}
            ws={a.ws}
            salary={salaryFor(teams[1][0], a.name)}
            isTop={i === 0}
            theme={theme}
          />
        ))}

        {/* Caption */}
        {hasCaption && (
          <div style={{
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 1.35,
            color: theme.isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.55)',
            marginTop: 8,
          }}>
            {caption}
          </div>
        )}

        {/* Verdict + branding */}
        <div style={{
          marginTop: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 2,
            color: theme.verdictColor(winner ? CARD_TEAM_COLORS[winner] || '#f9c74f' : null),
          }}>
            {verdictText(winner, lopsidedness)}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {date && (
              <span style={{ fontSize: 11, color: theme.dateColor }}>
                {shortDate(date)}
              </span>
            )}
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 3,
              color: theme.brandColor,
            }}>
              NBA TRADE MAPPER
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
