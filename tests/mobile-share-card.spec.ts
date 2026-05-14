import { test, expect } from '@playwright/test';

/**
 * Regression test for the mobile share card capture pipeline.
 *
 * Original bug: on iOS Safari (WebKit), capturing the off-screen share
 * card produced a near-blank PNG. Two factors:
 *   1. The card was positioned at left:-9999px, which iOS Safari can
 *      skip during paint optimization for elements far off-viewport.
 *   2. html2canvas reads the painted DOM, so when paint is skipped or
 *      odd, the resulting canvas is blank.
 *
 * Fix: position the off-screen card via transform (still painted) and
 * capture with html-to-image (foreignObject SVG, paint-independent).
 *
 * Test fixture: /dev/mobile-capture-test.html — a static page (no
 * Next.js, no React, no hydration overhead) with locally-served library
 * UMDs at /dev/lib/. It runs the capture pipeline on a representative
 * 1080x1080 card and exposes the result on window.__captureResult.
 *
 * What this test catches: any regression that breaks the capture
 * pipeline on WebKit — wrong library wired up, library import failure,
 * the capture returning null, dimensions wrong, byte size collapsing.
 *
 * What this test does NOT catch: iOS Safari's paint-skip optimization
 * specifically. Playwright's WebKit on macOS/Linux paints off-viewport
 * elements normally, so the bug doesn't reproduce here. Real iOS
 * verification requires a physical device or iOS Simulator + Safari.
 * That manual step is documented in CHANGELOG/PR description.
 */

const MIN_BYTES = 20_000;

test('FIXED capture pipeline produces a real PNG on iPhone WebKit', async ({ page }) => {
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('/dev/mobile-capture-test.html?lib=html-to-image&pos=transform');

  const handle = await page.waitForFunction(
    () => window.__captureResult,
    { timeout: 30_000 },
  );
  const result = (await handle.jsonValue()) as NonNullable<Window['__captureResult']>;

  console.log('result:', result);
  expect(result.ok, `capture failed: ${result.error}`).toBe(true);
  expect(result.byteSize ?? 0).toBeGreaterThan(MIN_BYTES);
  expect(result.width).toBe(1080);
  expect(result.height).toBe(1080);
});

declare global {
  interface Window {
    __captureResult?: {
      ok: boolean;
      error?: string;
      byteSize?: number;
      width?: number;
      height?: number;
    };
  }
}
