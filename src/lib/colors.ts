/** Lighten very dark colors (luminance < 80) by blending with white */
export function ensureReadable(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luminance >= 80) return hex;
  const blend = 0.55;
  const nr = Math.round(r + (255 - r) * blend);
  const ng = Math.round(g + (255 - g) * blend);
  const nb = Math.round(b + (255 - b) * blend);
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
}

/**
 * Returns '#0a0a0f' (near-black) or '#ffffff' for use as text on a solid hex background.
 *
 * Standard: WCAG AA — minimum 4.5:1 contrast ratio.
 * The crossover point where both choices are equally readable is WCAG relative luminance ≈ 0.179.
 * Above that threshold, dark text passes ≥ 4.5:1; below it, white text passes ≥ 4.5:1.
 */
export function contrastText(hex: string): string {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return '#ffffff';
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return L > 0.179 ? '#0a0a0f' : '#ffffff';
}
