/** WCAG relative luminance for a hex color */
function relLuminance(hex: string): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

// Card background #16161f — relative luminance ≈ 0.0084
const BG_LUMINANCE = relLuminance('#16161f');

/**
 * Lighten a color until it passes WCAG AA (4.5:1) against the card background.
 * Preserves hue by blending toward white in 12% increments.
 */
export function ensureReadable(hex: string): string {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);

  for (let i = 0; i < 12; i++) {
    const current = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    const lum = relLuminance(current);
    const ratio = (lum + 0.05) / (BG_LUMINANCE + 0.05);
    if (ratio >= 4.5) return current;
    // Blend 12% toward white each step
    r = Math.min(255, Math.round(r + (255 - r) * 0.12));
    g = Math.min(255, Math.round(g + (255 - g) * 0.12));
    b = Math.min(255, Math.round(b + (255 - b) * 0.12));
  }

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
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
