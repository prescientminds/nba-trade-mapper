export type VisualSkin = 'classic' | 'holographic' | 'insideStuff' | 'nbaJam';

export const SKINS: { id: VisualSkin; label: string; shortLabel: string }[] = [
  { id: 'classic', label: 'CLASSIC', shortLabel: 'STD' },
  { id: 'holographic', label: 'HOLO', shortLabel: 'HOLO' },
  { id: 'insideStuff', label: 'INSIDE STUFF', shortLabel: '90s' },
  { id: 'nbaJam', label: 'NBA JAM', shortLabel: 'JAM' },
];
