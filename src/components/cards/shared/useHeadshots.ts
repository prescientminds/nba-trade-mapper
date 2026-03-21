'use client';

import { useState, useEffect, useRef } from 'react';
import type { CardSkin } from '@/lib/skins';
import { stylizeHeadshot } from './stylize';

/**
 * Fetches headshot proxy URLs → data URLs → stylized data URLs.
 *
 * Two-stage pipeline:
 * 1. Fetch proxy URLs and convert to raw data URLs (runs once per trade)
 * 2. Apply per-skin color grading on canvas (re-runs when skin changes)
 *
 * Returns stylized data URLs ready for html2canvas/html-to-image capture.
 */
export function useHeadshots(
  heroUrls: Record<string, string[]> | undefined,
  skin: CardSkin = 'classic',
) {
  const [rawUrls, setRawUrls] = useState<Record<string, string[]>>({});
  const [headshots, setHeadshots] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const prevKey = useRef('');

  // ── Stage 1: Fetch proxy URLs → raw data URLs ──────────────
  useEffect(() => {
    if (!heroUrls || Object.keys(heroUrls).length === 0) {
      setRawUrls({});
      setHeadshots({});
      return;
    }

    const key = JSON.stringify(heroUrls);
    if (key === prevKey.current) return;
    prevKey.current = key;

    let cancelled = false;
    setLoading(true);

    (async () => {
      const result: Record<string, string[]> = {};
      await Promise.all(
        Object.entries(heroUrls).map(async ([teamId, urls]) => {
          const teamDataUrls: string[] = [];
          for (const url of urls) {
            try {
              const dataUrl = await toDataUrl(url);
              if (cancelled) return;
              teamDataUrls.push(dataUrl);
            } catch {
              // Skip failed headshots — card renders fine without them
            }
          }
          result[teamId] = teamDataUrls;
        }),
      );
      if (!cancelled) setRawUrls(result);
    })();

    return () => { cancelled = true; };
  }, [heroUrls]);

  // ── Stage 2: Apply per-skin color grading ──────────────────
  useEffect(() => {
    if (Object.keys(rawUrls).length === 0) {
      setHeadshots({});
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const result: Record<string, string[]> = {};
      for (const [teamId, urls] of Object.entries(rawUrls)) {
        result[teamId] = [];
        for (const url of urls) {
          try {
            const stylized = await stylizeHeadshot(url, skin);
            if (cancelled) return;
            result[teamId].push(stylized);
          } catch {
            // Fallback to raw data URL if stylization fails
            result[teamId].push(url);
          }
        }
      }
      if (!cancelled) {
        setHeadshots(result);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [rawUrls, skin]);

  return { headshots, headshotsLoading: loading };
}

// ── Helpers ──────────────────────────────────────────────────

async function toDataUrl(proxyUrl: string): Promise<string> {
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`Headshot fetch failed: ${res.status}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
