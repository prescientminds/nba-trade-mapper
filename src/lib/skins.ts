export type VisualSkin = 'classic' | 'holographic' | 'insideStuff';

export const SKINS: { id: VisualSkin; label: string; shortLabel: string }[] = [
  { id: 'classic', label: 'CLASSIC', shortLabel: 'STD' },
  { id: 'holographic', label: 'HOLO', shortLabel: 'HOLO' },
  { id: 'insideStuff', label: 'INSIDE STUFF', shortLabel: '90s' },
];
