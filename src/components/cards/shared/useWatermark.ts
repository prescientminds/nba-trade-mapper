'use client';

import { useState, useEffect } from 'react';

let cached: string | null = null;

/**
 * Preloads /watermark.png as a data URL for reliable html2canvas capture.
 * Cached at module level so the fetch only happens once.
 */
export function useWatermark(): string | null {
  const [url, setUrl] = useState(cached);

  useEffect(() => {
    if (cached) { setUrl(cached); return; }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      cached = canvas.toDataURL('image/png');
      setUrl(cached);
    };
    img.src = '/watermark.png';
  }, []);

  return url;
}
