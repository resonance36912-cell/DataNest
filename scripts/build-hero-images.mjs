#!/usr/bin/env node
/**
 * Regenerates the responsive hero image set under public/hero/.
 *
 * Usage:
 *   npm i -D sharp           # one-time
 *   node scripts/build-hero-images.mjs path/to/source-1920x1088.jpg
 *
 * Produces AVIF + WebP + JPG variants at 640 / 960 / 1280 / 1600 / 1920 widths,
 * plus a tiny blurred placeholder. The hero <picture> in src/pages/Home.tsx and
 * the <link rel="preload"> in index.html reference these exact filenames.
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const WIDTHS = [640, 960, 1280, 1600, 1920];
const OUT_DIR = resolve("public/hero");
const src = process.argv[2];
if (!src) {
  console.error("Pass a source image path. e.g. node scripts/build-hero-images.mjs hero-source.jpg");
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });

for (const w of WIDTHS) {
  await sharp(src).resize({ width: w }).avif({ quality: 50, effort: 4 }).toFile(`${OUT_DIR}/hero-${w}.avif`);
  await sharp(src).resize({ width: w }).webp({ quality: 72 }).toFile(`${OUT_DIR}/hero-${w}.webp`);
  await sharp(src).resize({ width: w }).jpeg({ quality: 78, mozjpeg: true }).toFile(`${OUT_DIR}/hero-${w}.jpg`);
  console.log(`✓ hero-${w} (avif/webp/jpg)`);
}
await sharp(src).resize({ width: 24 }).blur(2).webp({ quality: 40 }).toFile(`${OUT_DIR}/hero-blur.webp`);
console.log("✓ hero-blur.webp");
console.log("Done — variants written to public/hero/");
