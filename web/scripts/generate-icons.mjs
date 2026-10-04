/**
 * Generates the PWA app icons from code, so the marks always match the theme
 * (Deep Emerald #0F766E, Mint accent #2DD4BF) and never depend on a binary
 * asset being committed by hand.
 *
 *   node scripts/generate-icons.mjs
 *
 * Outputs into `public/icons/`. Uses nothing but Node's built-in `zlib`.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "public", "icons");

const PRIMARY = [15, 116, 110]; // #0F766E
const ACCENT = [45, 212, 191]; // #2DD4BF
const INK = [255, 255, 255];

/* --------------------------------------------------------------- rasterising */

/** Coverage of a rounded-rectangle spanning [x0,x1) x [y0,y1) at pixel (px,py). */
function roundedRectCoverage(px, py, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(px, x0 + r), x1 - r);
  const cy = Math.min(Math.max(py, y0 + r), y1 - r);
  const dx = px - cx;
  const dy = py - cy;
  if (dx * dx + dy * dy <= r * r) return 1;
  return 0;
}

function circleCoverage(px, py, cx, cy, r) {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r ? 1 : 0;
}

function blend(buffer, size, px, py, [r, g, b], alpha) {
  if (alpha <= 0) return;
  const i = (py * size + px) * 4;
  const a = alpha;
  buffer[i] = Math.round(r * a + buffer[i] * (1 - a));
  buffer[i + 1] = Math.round(g * a + buffer[i + 1] * (1 - a));
  buffer[i + 2] = Math.round(b * a + buffer[i + 2] * (1 - a));
  buffer[i + 3] = Math.round(255 * a + buffer[i + 3] * (1 - a));
}

function render(size, { maskable }) {
  const buffer = Buffer.alloc(size * size * 4);
  // Maskable art must survive a circular crop, so it is scaled into the middle
  // 66% of the canvas; regular icons fill the whole (rounded) square.
  const scale = maskable ? 0.66 : 0.86;
  const s = size;
  const t = (v) => s / 2 + (v - 0.5) * s * scale;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;

      // Background plate.
      const radius = maskable ? 0 : s * 0.2;
      if (radius === 0 || roundedRectCoverage(px, py, 0, 0, s, s, radius)) {
        blend(buffer, size, x, y, PRIMARY, 1);
      }

      // Three ascending bars — accounts, budgets, growth.
      const barW = s * 0.115 * scale;
      const gap = s * 0.055 * scale;
      const baseline = t(0.76);
      const heights = [0.2, 0.33, 0.47];
      const total = barW * 3 + gap * 2;
      const startX = s / 2 - total / 2;
      heights.forEach((h, index) => {
        const x0 = startX + index * (barW + gap);
        const x1 = x0 + barW;
        const y0 = baseline - h * s * scale;
        const y1 = baseline;
        if (roundedRectCoverage(px, py, x0, y0, x1, y1, barW / 2)) {
          blend(buffer, size, x, y, INK, 1);
        }
      });

      // Mint coin marking the balance point.
      if (circleCoverage(px, py, t(0.76), t(0.3), s * 0.085 * scale)) {
        blend(buffer, size, x, y, ACCENT, 1);
      }
    }
  }
  return buffer;
}

/* ------------------------------------------------------------------ png out */

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = buildTable());
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n += 1) {
    c = (crc ^ buf[n]) & 0xff;
    crc = (crc >>> 8) ^ table[c];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function encodePng(rgba, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour + alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* -------------------------------------------------------------------- main */

mkdirSync(OUT, { recursive: true });

const targets = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, false],
];

for (const [name, size, maskable] of targets) {
  writeFileSync(join(OUT, name), encodePng(render(size, { maskable }), size));
  process.stdout.write(`wrote public/icons/${name}\n`);
}
