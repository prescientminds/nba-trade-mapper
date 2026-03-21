/**
 * Shared html2canvas capture logic for all card templates.
 * Returns a PNG blob from a DOM element.
 */

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
  const html2canvas = (await import('html2canvas')).default;
  const dims = FORMAT_DIMS[format];

  const canvas = await html2canvas(el, {
    width: dims.w,
    height: dims.h,
    scale: 1,
    useCORS: true,
    logging: false,
    backgroundColor: null,
    scrollX: 0,
    scrollY: 0,
    windowWidth: dims.w,
    windowHeight: dims.h,
  });

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/png',
    );
  });

  const url = URL.createObjectURL(blob);
  return { blob, url };
}
