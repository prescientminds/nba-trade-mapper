/**
 * Shared card capture logic.
 * Returns a PNG blob from a DOM element.
 *
 * Uses html-to-image (foreignObject SVG approach) instead of html2canvas because
 * iOS Safari's html2canvas implementation produces blank/sliver captures when the
 * source element is positioned off-viewport. html-to-image serializes the live
 * DOM to SVG and rasterizes via <img>, which is reliable across browsers.
 */

import { toBlob } from 'html-to-image';

export type Format = 'og' | 'square' | 'story';

export const FORMAT_DIMS: Record<Format, { w: number; h: number }> = {
  og: { w: 1200, h: 630 },
  square: { w: 1080, h: 1080 },
  story: { w: 1080, h: 1920 },
};

export const FORMAT_LABELS: Record<Format, string> = {
  og: 'Twitter / Link Preview',
  square: 'Instagram Post',
  story: 'Instagram Story',
};

export async function captureElement(
  el: HTMLElement,
  format: Format,
): Promise<{ blob: Blob; url: string }> {
  const dims = FORMAT_DIMS[format];

  const blob = await toBlob(el, {
    width: dims.w,
    height: dims.h,
    canvasWidth: dims.w,
    canvasHeight: dims.h,
    pixelRatio: 1,
    cacheBust: false,
    backgroundColor: undefined,
  });

  if (!blob) throw new Error('html-to-image toBlob returned null');

  const url = URL.createObjectURL(blob);
  return { blob, url };
}
