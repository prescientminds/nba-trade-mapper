// Build all brand asset sizes from the master source PNG.
// Source: brand/source-29-master.png (2048×2048, the locked Gemini lockup #29)
// Outputs: brand/ masters + public/ deployable assets + src/app/favicon.ico
//
// Run: npx tsx scripts/build-brand-assets.ts

import sharp from 'sharp';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import pngToIco from 'png-to-ico';

const ROOT = process.cwd();
const SRC = join(ROOT, 'brand/source-29-master.png');
const BRAND = join(ROOT, 'brand');
const PUBLIC = join(ROOT, 'public');
const APP = join(ROOT, 'src/app');

const BG = { r: 10, g: 10, b: 15, alpha: 1 };

// Detected basketball center (577, 991), diameter ~820 in 2048×2048 source.
// 940×940 square crop centered on the ball — 7% padding, no wordmark intrusion.
const MARK_CROP = { left: 107, top: 521, width: 940, height: 940 };
const SPARKLE_PATCH = { left: 1880, top: 1880, width: 200, height: 200 };

async function ensureDirs() {
  await mkdir(BRAND, { recursive: true });
  await mkdir(PUBLIC, { recursive: true });
}

async function buildMarkOnly() {
  const buf = await sharp(SRC)
    .extract(MARK_CROP)
    .png()
    .toBuffer();
  await writeFile(join(BRAND, 'mark-master.png'), buf);
  return buf;
}

async function buildLockupCleaned() {
  const patch = await sharp({
    create: {
      width: SPARKLE_PATCH.width,
      height: SPARKLE_PATCH.height,
      channels: 4,
      background: BG,
    },
  })
    .png()
    .toBuffer();

  const buf = await sharp(SRC)
    .composite([{ input: patch, left: SPARKLE_PATCH.left, top: SPARKLE_PATCH.top }])
    .png()
    .toBuffer();
  await writeFile(join(BRAND, 'lockup-square-master.png'), buf);
  return buf;
}

async function buildLockupHorizontal(lockupSquare: Buffer) {
  const buf = await sharp(lockupSquare)
    .resize({ width: 2400, height: 800, fit: 'cover', position: 'center' })
    .png()
    .toBuffer();
  await writeFile(join(BRAND, 'lockup-horizontal-master.png'), buf);
  return buf;
}

async function makeMarkSize(markBuf: Buffer, size: number, outPath: string, opaque = false) {
  const pipe = sharp(markBuf).resize(size, size, { fit: 'contain', background: opaque ? BG : { r: 0, g: 0, b: 0, alpha: 0 } });
  if (opaque) pipe.flatten({ background: BG });
  const buf = await pipe.png().toBuffer();
  await writeFile(outPath, buf);
  return buf;
}

async function makeOgDefault(lockupSquare: Buffer) {
  const canvas = sharp({
    create: { width: 1200, height: 630, channels: 4, background: BG },
  });
  const inner = await sharp(lockupSquare)
    .resize({ height: 540, fit: 'contain', background: BG })
    .png()
    .toBuffer();
  const innerMeta = await sharp(inner).metadata();
  const left = Math.round((1200 - (innerMeta.width ?? 0)) / 2);
  const top = Math.round((630 - (innerMeta.height ?? 0)) / 2);
  const buf = await canvas
    .composite([{ input: inner, left, top }])
    .png()
    .toBuffer();
  await writeFile(join(PUBLIC, 'og-default.png'), buf);
}

async function makeTwitterCard(lockupSquare: Buffer) {
  const canvas = sharp({
    create: { width: 1200, height: 600, channels: 4, background: BG },
  });
  const inner = await sharp(lockupSquare)
    .resize({ height: 520, fit: 'contain', background: BG })
    .png()
    .toBuffer();
  const innerMeta = await sharp(inner).metadata();
  const left = Math.round((1200 - (innerMeta.width ?? 0)) / 2);
  const top = Math.round((600 - (innerMeta.height ?? 0)) / 2);
  const buf = await canvas
    .composite([{ input: inner, left, top }])
    .png()
    .toBuffer();
  await writeFile(join(PUBLIC, 'twitter-card.png'), buf);
}

async function buildFaviconIco(pngs: Buffer[]) {
  const ico = await pngToIco(pngs);
  await writeFile(join(APP, 'favicon.ico'), ico);
  await writeFile(join(PUBLIC, 'favicon.ico'), ico);
}

async function main() {
  console.log('→ ensuring directories');
  await ensureDirs();

  console.log('→ cropping mark from source');
  const markBuf = await buildMarkOnly();

  console.log('→ cleaning lockup (patching Gemini sparkle)');
  const lockupSquare = await buildLockupCleaned();
  await buildLockupHorizontal(lockupSquare);

  console.log('→ generating favicon PNGs');
  const fav16 = await makeMarkSize(markBuf, 16, join(PUBLIC, 'favicon-16.png'), true);
  const fav32 = await makeMarkSize(markBuf, 32, join(PUBLIC, 'favicon-32.png'), true);
  const fav48 = await makeMarkSize(markBuf, 48, join(PUBLIC, 'favicon-48.png'), true);

  console.log('→ generating Apple + PWA icons');
  await makeMarkSize(markBuf, 180, join(PUBLIC, 'apple-touch-icon.png'), true);
  await makeMarkSize(markBuf, 192, join(PUBLIC, 'icon-192.png'), false);
  await makeMarkSize(markBuf, 512, join(PUBLIC, 'icon-512.png'), false);

  console.log('→ regenerating og-logo.png (144×144 mark, used in dynamic share cards)');
  await makeMarkSize(markBuf, 144, join(PUBLIC, 'og-logo.png'), false);

  console.log('→ regenerating watermark.png (256×256 mark, used by useWatermark for in-app card capture)');
  await makeMarkSize(markBuf, 256, join(PUBLIC, 'watermark.png'), false);

  console.log('→ generating og-default + twitter-card');
  await makeOgDefault(lockupSquare);
  await makeTwitterCard(lockupSquare);

  console.log('→ bundling favicon.ico (16/32/48)');
  await buildFaviconIco([fav16, fav32, fav48]);

  console.log('done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
