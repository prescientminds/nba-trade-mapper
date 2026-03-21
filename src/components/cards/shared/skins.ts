/**
 * Skin theme definitions — 4 dramatically different visual identities.
 *
 * Classic (Fleer): Cream background, team color border bar, warm gold accents
 * Prizm (Panini): Chrome shimmer, silver/team color gradients, holographic band
 * Noir (BR-inspired): True black, massive white type, geometric accent shapes
 * Retro (Skybox): Full-saturation team colors, bold geometric cuts, neon accents
 */

import type { CardSkin } from '@/lib/skins';

// ── Helpers ────────────────────────────────────────────────

export function darken(hex: string, amt: number): string {
  const c = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = Math.round(parseInt(c.slice(0, 2), 16) * (1 - amt));
  const g = Math.round(parseInt(c.slice(2, 4), 16) * (1 - amt));
  const b = Math.round(parseInt(c.slice(4, 6), 16) * (1 - amt));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function ha(hex: string, alpha: number): string {
  const c = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function lighten(hex: string, amt: number): string {
  const c = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = Math.min(255, Math.round(parseInt(c.slice(0, 2), 16) + (255 - parseInt(c.slice(0, 2), 16)) * amt));
  const g = Math.min(255, Math.round(parseInt(c.slice(2, 4), 16) + (255 - parseInt(c.slice(2, 4), 16)) * amt));
  const b = Math.min(255, Math.round(parseInt(c.slice(4, 6), 16) + (255 - parseInt(c.slice(4, 6), 16)) * amt));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ── Theme Interface ────────────────────────────────────────

export interface SkinTheme {
  // Card chrome
  cardBg: string;
  cardBorder: string;
  cardRadius: number;
  cardShadow: string;

  // Per-team section background
  sectionBg: (teamColor: string, teamColor2: string) => string;

  // Accent bar height (top/bottom team color stripe)
  accentH: number;
  divider: string;

  // Headshot treatment
  headshotOpacity: number;
  headshotFilter: string; // CSS filter for headshot img
  headshotSize: number; // percentage of section height

  // Typography
  scoreColor: string;
  scoreShadow: (teamColor: string) => string;
  teamLabelColor: (teamColor: string) => string;
  nameColor: string;
  indivScoreColor: (teamColor: string) => string;

  // Stat pills
  pillBg: (text: string) => string;
  pillColor: string;
  pillBorder: string;

  // Header bar (team name strip at top)
  headerBg: (teamColor: string) => string;
  headerBorder: string;
  headerTextShadow: (teamColor: string) => string;

  // Verdict band
  verdictBg: string;
  verdictColor: (winnerColor: string | null) => string;
  brandColor: string;

  // Light skin flag — controls text color strategy
  isLight: boolean;

  // Watermark (team abbrev behind section)
  watermarkColor: (teamColor: string) => string;

  // Overlay (scanlines, shimmer, etc.)
  overlay?: React.CSSProperties;

  // Template background image (grayscale texture, tinted at runtime)
  templateUrl?: string;
}

// ── Classic (1986 Fleer inspired) ──────────────────────────
// Clean off-white/cream background. Team color as thick left accent.
// Dark text on light background. Gold foil for winner badge.

const classicTheme: SkinTheme = {
  cardBg: '#F5F0E8',
  cardBorder: '3px solid #D4C5A0',
  cardRadius: 6,
  cardShadow: '0 4px 24px rgba(0,0,0,0.2)',

  sectionBg: (c) =>
    `linear-gradient(135deg, ${ha(c, 0.06)} 0%, #F5F0E8 40%, ${ha(c, 0.03)} 100%)`,
  accentH: 6,
  divider: '2px solid #D4C5A0',

  headerBg: (c) => c,
  headerBorder: '3px solid rgba(255,255,255,0.3)',
  headerTextShadow: () => 'none',
  isLight: true,

  headshotOpacity: 0.85,
  headshotFilter: 'sepia(0.15) saturate(0.9)',
  headshotSize: 90,

  scoreColor: '#1a1a1a',
  scoreShadow: () => 'none',
  teamLabelColor: (c) => darken(c, 0.1),
  nameColor: '#1a1a1a',
  indivScoreColor: (c) => darken(c, 0.15),

  pillBg: (text) => {
    const t = text.toLowerCase();
    if (t.includes('mvp') || t.includes('champ')) return 'rgba(184,145,50,0.25)';
    if (t.includes('dpoy') || t.includes('roy')) return 'rgba(44,120,115,0.2)';
    if (t.includes('all-star')) return 'rgba(120,70,180,0.18)';
    if (t.includes('all-nba')) return 'rgba(200,100,40,0.2)';
    return 'rgba(0,0,0,0.08)';
  },
  pillColor: '#333',
  pillBorder: '1px solid rgba(0,0,0,0.1)',

  verdictBg: '#E8E0D0',
  verdictColor: (wc) => wc || '#8B7355',
  brandColor: 'rgba(0,0,0,0.25)',

  watermarkColor: (c) => ha(c, 0.06),

  templateUrl: '/cards/templates/classic.png',
};

// ── Prizm (Panini Prizm Silver) ─────────────────────────────
// Chrome/silver base with team color accents. Holographic rainbow band.
// Metallic feel — silver gradients, team color border glow.

const prizmTheme: SkinTheme = {
  // Chrome/silver card — bright metallic feel, team color as strong accent
  // Key differentiator from Noir: LIGHTER base, team color gradient visible, chrome sheen
  cardBg: '#3a3a52',
  cardBorder: 'none',
  cardRadius: 8,
  cardShadow: [
    'inset 0 0 0 2px rgba(255,255,255,0.25)',
    'inset 0 0 0 4px rgba(200,200,240,0.12)',
    '0 0 60px rgba(150,150,200,0.25)',
  ].join(', '),

  // Team color gradient much more visible — darken only 25% instead of 45%
  sectionBg: (c, c2) =>
    `linear-gradient(160deg, ${darken(c, 0.25)} 0%, #3a3a52 40%, #42425a 60%, ${darken(c2, 0.30)} 100%)`,
  accentH: 3,
  divider: '2px solid rgba(200,200,240,0.15)',

  headerBg: (c) => `linear-gradient(180deg, ${darken(c, 0.15)} 0%, ${darken(c, 0.40)} 100%)`,
  headerBorder: '1px solid rgba(200,200,240,0.2)',
  headerTextShadow: (c) => `0 0 30px ${ha(c, 0.5)}, 0 2px 8px rgba(0,0,0,0.5)`,
  isLight: false,

  headshotOpacity: 0.85,
  headshotFilter: 'saturate(0.8) contrast(1.15) brightness(1.05)',
  headshotSize: 90,

  scoreColor: '#ffffff',
  scoreShadow: (c) =>
    `0 0 30px ${ha(c, 0.4)}, 0 0 60px rgba(200,200,255,0.25)`,
  teamLabelColor: (c) => lighten(c, 0.35),
  nameColor: '#f0f0ff',
  indivScoreColor: (c) => lighten(c, 0.45),

  pillBg: (text) => {
    const t = text.toLowerCase();
    if (t.includes('mvp') || t.includes('champ')) return 'rgba(220,200,100,0.35)';
    if (t.includes('all-star') || t.includes('all-nba')) return 'rgba(170,150,240,0.35)';
    return 'rgba(200,200,240,0.18)';
  },
  pillColor: 'rgba(240,240,255,0.95)',
  pillBorder: '1px solid rgba(255,255,255,0.15)',

  verdictBg: 'rgba(30,30,50,0.95)',
  verdictColor: (wc) => wc || 'rgba(220,220,250,0.7)',
  brandColor: 'rgba(220,220,250,0.35)',

  watermarkColor: (c) => ha(c, 0.06),

  templateUrl: '/cards/templates/prizm.png',

  // Stronger holographic rainbow shimmer
  overlay: {
    position: 'absolute' as const,
    inset: 0,
    backgroundImage:
      'linear-gradient(135deg, rgba(255,60,60,0.08) 0%, rgba(255,200,50,0.08) 16%, rgba(50,255,100,0.07) 33%, rgba(50,150,255,0.09) 50%, rgba(180,50,255,0.08) 66%, rgba(255,50,150,0.07) 83%, rgba(255,60,60,0.08) 100%)',
    pointerEvents: 'none' as const,
  },
};

// ── Noir (Bleacher Report inspired) ─────────────────────────
// True black with subtle texture. Single team color accent line.
// Massive white condensed text. Geometric accent shapes. Player photo dominant.
// The "prestige" card.

const noirTheme: SkinTheme = {
  // Pure black. Zero ornament. Team color as the ONLY accent — thin line, glow on score.
  // Key differentiator from Prizm: NO gradient, NO shimmer, just black + white + one color.
  cardBg: '#000000',
  cardBorder: 'none',
  cardRadius: 0,
  cardShadow: 'none',

  sectionBg: () => '#000000',
  accentH: 0,
  divider: 'none', // No visible divider — sections bleed into each other

  headerBg: () => 'transparent',
  headerBorder: 'none',
  headerTextShadow: (c) => `0 0 50px ${ha(c, 0.5)}`,
  isLight: false,

  headshotOpacity: 0.9,
  headshotFilter: 'saturate(0.5) contrast(1.3) brightness(0.95)',
  headshotSize: 95,

  scoreColor: '#ffffff',
  scoreShadow: (c) => `0 0 50px ${ha(c, 0.4)}, 0 0 100px ${ha(c, 0.15)}`,
  teamLabelColor: (c) => ha(c, 0.8),
  nameColor: '#ffffff',
  indivScoreColor: (c) => ha(c, 0.5),

  pillBg: (text) => {
    const t = text.toLowerCase();
    if (t.includes('mvp') || t.includes('champ')) return 'rgba(255,255,255,0.1)';
    if (t.includes('all-star')) return 'rgba(255,255,255,0.07)';
    return 'rgba(255,255,255,0.04)';
  },
  pillColor: 'rgba(255,255,255,0.75)',
  pillBorder: '1px solid rgba(255,255,255,0.06)',

  verdictBg: '#000000',
  verdictColor: (wc) => wc || 'rgba(255,255,255,0.5)',
  brandColor: 'rgba(255,255,255,0.12)',

  watermarkColor: () => 'rgba(255,255,255,0.02)',

  templateUrl: '/cards/templates/noir.png',
};

// ── Retro (90s Skybox / Metal Universe) ─────────────────────
// Full-saturation team primary as background — NOT darkened.
// Bold geometric shapes, thick colored borders, diagonal energy.
// Neon accents, hard drop shadows. Feels like opening a 1993 pack.

const retroTheme: SkinTheme = {
  cardBg: '#0a0a0a',
  cardBorder: '6px solid #ffffff',
  cardRadius: 2,
  cardShadow: '0 0 0 3px #000, 0 4px 30px rgba(0,0,0,0.5)',

  sectionBg: (c, c2) =>
    `linear-gradient(145deg, ${c} 0%, ${darken(c, 0.2)} 50%, ${c2} 100%)`,
  accentH: 8,
  divider: '4px solid #ffffff',

  headerBg: (c) => `linear-gradient(135deg, ${lighten(c, 0.15)} 0%, ${c} 40%, ${darken(c, 0.15)} 100%)`,
  headerBorder: '4px solid #ffffff',
  headerTextShadow: () => '3px 3px 0px rgba(0,0,0,0.6), -1px -1px 0px rgba(255,255,255,0.15)',
  isLight: false,

  headshotOpacity: 0.9,
  headshotFilter: 'saturate(1.4) contrast(1.15)',
  headshotSize: 90,

  scoreColor: '#ffffff',
  scoreShadow: () => '3px 3px 0px rgba(0,0,0,0.5), 6px 6px 0px rgba(0,0,0,0.2)',
  teamLabelColor: () => 'rgba(255,255,255,0.85)',
  nameColor: '#ffffff',
  indivScoreColor: () => 'rgba(255,255,255,0.7)',

  pillBg: (text) => {
    const t = text.toLowerCase();
    if (t.includes('mvp') || t.includes('champ')) return 'rgba(255,230,0,0.35)';
    if (t.includes('dpoy') || t.includes('roy')) return 'rgba(0,255,200,0.3)';
    if (t.includes('all-star')) return 'rgba(255,0,200,0.3)';
    if (t.includes('all-nba')) return 'rgba(255,140,0,0.35)';
    return 'rgba(255,255,255,0.15)';
  },
  pillColor: '#ffffff',
  pillBorder: '1px solid rgba(255,255,255,0.2)',

  verdictBg: 'rgba(0,0,0,0.85)',
  verdictColor: (wc) => wc || '#FFE500',
  brandColor: 'rgba(255,255,255,0.35)',

  watermarkColor: () => 'rgba(255,255,255,0.08)',

  templateUrl: '/cards/templates/retro.png',
};

// ── Export ──────────────────────────────────────────────────

export const THEMES: Record<CardSkin, SkinTheme> = {
  classic: classicTheme,
  prizm: prizmTheme,
  noir: noirTheme,
  retro: retroTheme,
};
