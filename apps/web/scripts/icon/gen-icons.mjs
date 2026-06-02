/**
 * Generates the Husrevity favicon + PWA icon set from a single neon-"h" master.
 *
 * The glow is NOT done with SVG filters (engine support is inconsistent in the
 * rasterizers libvips ships with). Instead we rasterize a crisp cyan "h" on a
 * transparent canvas, blur a copy of it with sharp, and stack
 * [gray bg] → [glow] → [glow] → [crisp letter]. This reproduces the neon look
 * deterministically.
 *
 * Run:  bun run apps/web/scripts/icon/gen-icons.mjs
 * (sharp is already present in the workspace node_modules.)
 *
 * Keep the geometry/colors in sync with h-mark.svg.
 */
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// sharp ships with Next.js as a transitive dep; it isn't a direct dependency,
// so resolve it from the workspace store rather than a bare specifier.
const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require("sharp");
} catch {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  sharp = require(`${root}/node_modules/.bun/sharp@0.34.5/node_modules/sharp`);
}

const SIZE = 1024;
const CYAN = "#2ad4ff";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "../.."); // apps/web

// Soft gray field, rounded so maskable/any both look intentional.
const bgSvg = Buffer.from(`
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="75%">
      <stop offset="0%" stop-color="#5b5f64"/>
      <stop offset="100%" stop-color="#45484c"/>
    </radialGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" rx="220" fill="url(#bg)"/>
</svg>`);

// Crisp cyan "h" on a transparent canvas (no filter — glow added via blur).
const letterSvg = Buffer.from(`
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke="${CYAN}" stroke-width="96"
     stroke-linecap="round" stroke-linejoin="round">
    <path d="M 360 300 L 360 724"/>
    <path d="M 360 470 Q 360 410 512 410 Q 664 410 664 470 L 664 724"/>
  </g>
</svg>`);

async function build() {
  const bg = await sharp(bgSvg).png().toBuffer();
  const letter = await sharp(letterSvg).png().toBuffer();

  // Two blur passes: a tight bright halo + a wide soft bloom.
  const glowTight = await sharp(letter)
    .blur(14)
    .modulate({ brightness: 1.25 })
    .toBuffer();
  const glowWide = await sharp(letter).blur(38).toBuffer();

  const master = await sharp(bg)
    .composite([
      { input: glowWide, blend: "screen" },
      { input: glowWide, blend: "screen" },
      { input: glowTight, blend: "screen" },
      { input: letter, blend: "over" },
    ])
    .png()
    .toBuffer();

  const outputs = [
    { path: "src/app/icon.png", size: 512 },
    { path: "src/app/apple-icon.png", size: 180 },
    { path: "public/icons/icon-192.png", size: 192 },
    { path: "public/icons/icon-512.png", size: 512 },
    // Letter spans ~40% width on a full-bleed field → already maskable-safe.
    { path: "public/icons/icon-maskable-512.png", size: 512 },
  ];

  for (const { path, size } of outputs) {
    const abs = resolve(webRoot, path);
    await mkdir(dirname(abs), { recursive: true });
    await sharp(master).resize(size, size).png().toFile(abs);
    console.log(`✓ ${path} (${size}×${size})`);
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
