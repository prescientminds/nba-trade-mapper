import { mkdirSync, copyFileSync } from 'fs';
import { join } from 'path';

/**
 * Copy library UMD bundles from node_modules into public/dev/lib/ so the
 * static test fixture (public/dev/mobile-capture-test.html) can load them.
 *
 * Kept out of the committed tree (gitignored) because they're vendored
 * artifacts — running the tests is what materializes them.
 */
export default async function globalSetup() {
  const root = join(__dirname, '..');
  const libDir = join(root, 'public/dev/lib');
  mkdirSync(libDir, { recursive: true });

  const copies: [string, string][] = [
    ['node_modules/html-to-image/dist/html-to-image.js', 'public/dev/lib/html-to-image.js'],
    ['node_modules/html2canvas/dist/html2canvas.min.js', 'public/dev/lib/html2canvas.min.js'],
    ['tests/fixtures/mobile-capture-test.html', 'public/dev/mobile-capture-test.html'],
  ];

  for (const [src, dest] of copies) {
    copyFileSync(join(root, src), join(root, dest));
  }
}
