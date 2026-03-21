'use client';

import { useState, useEffect, useRef } from 'react';
import type { CardSkin } from '@/lib/skins';
import { THEMES } from './skins';
import { tintTemplate, loadImage } from './stylize';

/**
 * Loads the grayscale template for the current skin, then tints it
 * per-team using canvas multiply blend + grade recipe.
 *
 * Returns tinted data URLs keyed by teamId, ready for <img> rendering.
 * Falls back gracefully: if template image is missing or fails to load,
 * returns an empty record so ShareCard renders the existing CSS gradient.
 */
export function useTemplates(
  teamColors: Record<string, { primary: string; secondary: string }> | undefined,
  skin: CardSkin = 'classic',
) {
  const [rawTemplate, setRawTemplate] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const prevSkin = useRef('');

  // ── Stage 1: Load grayscale template PNG → data URL ─────────
  useEffect(() => {
    const sk = THEMES[skin];
    if (!sk.templateUrl) {
      setRawTemplate(null);
      setTemplates({});
      return;
    }

    // Only reload if skin changed
    if (skin === prevSkin.current) return;
    prevSkin.current = skin;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // Load as image first to verify it exists, then convert to data URL
        const img = await loadImage(sk.templateUrl!);
        if (cancelled) return;

        // Draw to canvas → data URL (avoids CORS issues with html2canvas)
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        if (!cancelled) setRawTemplate(dataUrl);
      } catch {
        // Template not found — fall back to CSS gradients
        if (!cancelled) {
          setRawTemplate(null);
          setTemplates({});
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [skin]);

  // ── Stage 2: Tint template per team ─────────────────────────
  useEffect(() => {
    if (!rawTemplate || !teamColors || Object.keys(teamColors).length === 0) {
      setTemplates({});
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const result: Record<string, string> = {};
      for (const [teamId, colors] of Object.entries(teamColors)) {
        try {
          const tinted = await tintTemplate(rawTemplate, colors.primary, colors.secondary, skin);
          if (cancelled) return;
          result[teamId] = tinted;
        } catch {
          // Skip failed tint — team section falls back to CSS gradient
        }
      }
      if (!cancelled) {
        setTemplates(result);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [rawTemplate, teamColors, skin]);

  return { templates, templatesLoading: loading };
}
