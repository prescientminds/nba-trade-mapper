// ── Graph UI skins (used by data-skin attribute + CSS in globals.css) ──
export type VisualSkin = 'classic' | 'holographic' | 'insideStuff' | 'nbaJam';

export const SKINS: { id: VisualSkin; label: string; shortLabel: string }[] = [
  { id: 'classic', label: 'CLASSIC', shortLabel: 'CLS' },
  { id: 'holographic', label: 'HOLO', shortLabel: 'HOLO' },
  { id: 'insideStuff', label: 'INSIDE STUFF', shortLabel: '90s' },
  { id: 'nbaJam', label: 'NBA JAM', shortLabel: 'JAM' },
];

// ── Share card skins (used by ShareCard component) ──
export type CardSkin = 'classic' | 'prizm' | 'noir' | 'retro';

export const CARD_SKINS: { id: CardSkin; label: string; shortLabel: string }[] = [
  { id: 'classic', label: 'CLASSIC', shortLabel: 'CLS' },
  { id: 'prizm', label: 'PRIZM', shortLabel: 'PZM' },
  { id: 'noir', label: 'NOIR', shortLabel: 'NOIR' },
  { id: 'retro', label: 'RETRO', shortLabel: 'RET' },
];
