/**
 * Canvas-based headshot stylization + grain texture generation.
 *
 * Each skin gets a unique color grade recipe that processes headshot photos
 * through a pixel-level pipeline: saturation → brightness → contrast →
 * shadow lift/tint → highlight tint → posterize.
 *
 * Also generates tiled noise textures for film grain overlays.
 */

import type { CardSkin } from '@/lib/skins';

// ── Color Grade Recipes ──────────────────────────────────────

interface Grade {
  saturation: number;       // 0=grayscale, 1=unchanged, >1=oversaturated
  contrast: number;         // 1=unchanged, >1=more contrast
  brightness: number;       // -1 to 1 additive adjustment
  shadowLift: number;       // 0-255: lifts darkest values (prevents pure black)
  shadowTint: [number, number, number];   // RGB mixed into shadow regions
  highlightTint: [number, number, number]; // RGB mixed into highlight regions
  posterize: number;        // 0=off, otherwise # of color levels
}

const GRADES: Record<CardSkin, Grade> = {
  // Classic: warm sepia tone, lifted browns, cream highlights
  classic: {
    saturation: 0.85, contrast: 1.1, brightness: 0.05,
    shadowLift: 25, shadowTint: [45, 35, 20], highlightTint: [255, 248, 235],
    posterize: 0,
  },
  // Prizm: cool silver desaturation, blue-steel shadows, chrome highlights
  prizm: {
    saturation: 0.7, contrast: 1.25, brightness: -0.05,
    shadowLift: 12, shadowTint: [15, 15, 35], highlightTint: [215, 215, 235],
    posterize: 0,
  },
  // Noir: heavy desaturation, extreme contrast, near-black shadows
  noir: {
    saturation: 0.4, contrast: 1.5, brightness: -0.08,
    shadowLift: 5, shadowTint: [8, 8, 12], highlightTint: [255, 255, 255],
    posterize: 0,
  },
  // Retro: oversaturated, warm, slight posterization for that printed-card feel
  retro: {
    saturation: 1.4, contrast: 1.15, brightness: 0.1,
    shadowLift: 18, shadowTint: [35, 12, 12], highlightTint: [255, 250, 225],
    posterize: 20,
  },
};

// ── Per-Skin Grain & Vignette Intensities ────────────────────

export const GRAIN: Record<CardSkin, number> = {
  classic: 0.06,
  prizm: 0.04,
  noir: 0.08,
  retro: 0.12,
};

export const VIGNETTE: Record<CardSkin, number> = {
  classic: 0.15,
  prizm: 0.25,
  noir: 0.35,
  retro: 0.20,
};

// ── Headshot Stylization ─────────────────────────────────────

export async function stylizeHeadshot(
  dataUrl: string,
  skin: CardSkin,
): Promise<string> {
  const grade = GRADES[skin];
  const img = await loadImage(dataUrl);

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;

  for (let i = 0; i < d.length; i += 4) {
    // Skip fully transparent pixels
    if (d[i + 3] === 0) continue;

    let r = d[i], g = d[i + 1], b = d[i + 2];

    // 1. Saturation adjustment
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + grade.saturation * (r - gray);
    g = gray + grade.saturation * (g - gray);
    b = gray + grade.saturation * (b - gray);

    // 2. Brightness (additive)
    r += grade.brightness * 255;
    g += grade.brightness * 255;
    b += grade.brightness * 255;

    // 3. Contrast (around midpoint)
    r = ((r / 255 - 0.5) * grade.contrast + 0.5) * 255;
    g = ((g / 255 - 0.5) * grade.contrast + 0.5) * 255;
    b = ((b / 255 - 0.5) * grade.contrast + 0.5) * 255;

    // 4. Shadow lift + tint (mix shadow color into dark regions)
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const sf = Math.max(0, 1 - luma / 80); // shadow blend factor
    r = Math.max(r, grade.shadowLift);
    g = Math.max(g, grade.shadowLift);
    b = Math.max(b, grade.shadowLift);
    r += sf * (grade.shadowTint[0] - r) * 0.3;
    g += sf * (grade.shadowTint[1] - g) * 0.3;
    b += sf * (grade.shadowTint[2] - b) * 0.3;

    // 5. Highlight tint (mix highlight color into bright regions)
    const hf = Math.max(0, (luma - 180) / 75);
    r += hf * (grade.highlightTint[0] - r) * 0.2;
    g += hf * (grade.highlightTint[1] - g) * 0.2;
    b += hf * (grade.highlightTint[2] - b) * 0.2;

    // 6. Posterize (reduce color levels for printed-card effect)
    if (grade.posterize > 0) {
      const lv = grade.posterize;
      r = Math.round((r / 255) * lv) / lv * 255;
      g = Math.round((g / 255) * lv) / lv * 255;
      b = Math.round((b / 255) * lv) / lv * 255;
    }

    // Clamp to valid range
    d[i]     = Math.max(0, Math.min(255, Math.round(r)));
    d[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
    d[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

// ── Noise Texture Generator ──────────────────────────────────

const noiseCache: Record<string, string> = {};

/**
 * Generates a small tiled noise texture as a data URL.
 * Cached by intensity — only generated once per value.
 */
export function generateNoiseUrl(intensity: number, size = 128): string {
  const key = `${intensity.toFixed(3)}-${size}`;
  if (noiseCache[key]) return noiseCache[key];

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(size, size);
  const d = imageData.data;

  // Deterministic PRNG for consistent grain across renders
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (seed >>> 0) / 0xffffffff;
  };

  for (let i = 0; i < d.length; i += 4) {
    const v = Math.round(rand() * 255);
    d[i]     = v;    // R
    d[i + 1] = v;    // G (monochromatic)
    d[i + 2] = v;    // B
    d[i + 3] = Math.round(rand() * intensity * 255); // varying alpha
  }

  ctx.putImageData(imageData, 0, 0);
  const url = canvas.toDataURL('image/png');
  noiseCache[key] = url;
  return url;
}

// ── Template Tinting ─────────────────────────────────────────

export function parseHex(hex: string): [number, number, number] {
  const c = hex.startsWith('#') ? hex.slice(1) : hex;
  return [
    parseInt(c.slice(0, 2), 16),
    parseInt(c.slice(2, 4), 16),
    parseInt(c.slice(4, 6), 16),
  ];
}

const tintCache: Record<string, string> = {};

/**
 * Colorizes a grayscale template image with team colors + skin grade recipe.
 * Uses multiply blend for base color, mixes secondary into highlights.
 * Returns a JPEG data URL (~200KB).
 */
export async function tintTemplate(
  templateDataUrl: string,
  teamHex: string,
  teamHex2: string,
  skin: CardSkin,
): Promise<string> {
  const cacheKey = `${skin}-${teamHex}-${teamHex2}`;
  if (tintCache[cacheKey]) return tintCache[cacheKey];

  const grade = GRADES[skin];
  const [tr, tg, tb] = parseHex(teamHex);
  const [t2r, t2g, t2b] = parseHex(teamHex2);
  const img = await loadImage(templateDataUrl);

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;

    // Grayscale luminance from template
    const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;

    // 1. Multiply blend with team primary
    let r = (lum * tr);
    let g = (lum * tg);
    let b = (lum * tb);

    // 2. Mix secondary into highlight regions (luminance > 0.7)
    if (lum > 0.7) {
      const hf = (lum - 0.7) / 0.3; // 0..1
      r += hf * (t2r - r) * 0.35;
      g += hf * (t2g - g) * 0.35;
      b += hf * (t2b - b) * 0.35;
    }

    // 3. Apply skin grade recipe (same pipeline as stylizeHeadshot)
    // Saturation
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + grade.saturation * (r - gray);
    g = gray + grade.saturation * (g - gray);
    b = gray + grade.saturation * (b - gray);

    // Brightness
    r += grade.brightness * 255;
    g += grade.brightness * 255;
    b += grade.brightness * 255;

    // Contrast
    r = ((r / 255 - 0.5) * grade.contrast + 0.5) * 255;
    g = ((g / 255 - 0.5) * grade.contrast + 0.5) * 255;
    b = ((b / 255 - 0.5) * grade.contrast + 0.5) * 255;

    // Shadow lift + tint
    const postLuma = 0.299 * r + 0.587 * g + 0.114 * b;
    const sf = Math.max(0, 1 - postLuma / 80);
    r = Math.max(r, grade.shadowLift);
    g = Math.max(g, grade.shadowLift);
    b = Math.max(b, grade.shadowLift);
    r += sf * (grade.shadowTint[0] - r) * 0.3;
    g += sf * (grade.shadowTint[1] - g) * 0.3;
    b += sf * (grade.shadowTint[2] - b) * 0.3;

    // Highlight tint
    const hfGrade = Math.max(0, (postLuma - 180) / 75);
    r += hfGrade * (grade.highlightTint[0] - r) * 0.2;
    g += hfGrade * (grade.highlightTint[1] - g) * 0.2;
    b += hfGrade * (grade.highlightTint[2] - b) * 0.2;

    // Posterize
    if (grade.posterize > 0) {
      const lv = grade.posterize;
      r = Math.round((r / 255) * lv) / lv * 255;
      g = Math.round((g / 255) * lv) / lv * 255;
      b = Math.round((b / 255) * lv) / lv * 255;
    }

    d[i]     = Math.max(0, Math.min(255, Math.round(r)));
    d[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
    d[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
  }

  ctx.putImageData(imageData, 0, 0);
  const url = canvas.toDataURL('image/jpeg', 0.85);
  tintCache[cacheKey] = url;
  return url;
}

// ── Helpers ──────────────────────────────────────────────────

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
