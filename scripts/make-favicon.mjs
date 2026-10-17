#!/usr/bin/env node
/**
 * Generates `src/app/favicon.ico` from the same geometry as `src/app/icon.svg`.
 *
 * Browsers still request `/favicon.ico` by default even when an SVG icon is
 * declared, and a 404 there is a visible polish defect. Next only serves that
 * path when a real `favicon.ico` exists, so this renders one.
 *
 * Rasterised at 4x and downsampled for antialiasing, then wrapped in a minimal
 * ICO container with an embedded PNG payload.
 *
 * Run with: node scripts/make-favicon.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const SIZE = 32;
const SS = 4; // supersample factor
const N = SIZE * SS;

const hex = (value) => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16),
];

const FROM = hex("#2f9d97");
const TO = hex("#0a5551");

// Geometry mirrors icon.svg, scaled from its 32-unit viewBox to the render size.
const scale = N / 32;
const RADIUS = 7 * scale;
const STROKE = 2.4 * scale;
const POINTS = [
  [8, 23.5],
  [13.2, 15.6],
  [20, 13.1],
  [22.4, 10.2],
].map(([x, y]) => [x * scale, y * scale]);
const DOT = [13.2 * scale, 15.6 * scale];
const DOT_R = 2.4 * scale;

/** Distance from a point to a line segment, used for the stroked polyline. */
function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Coverage of the rounded-rectangle background at a point. */
function insideRoundedRect(x, y) {
  const r = RADIUS;
  const cx = Math.min(Math.max(x, r), N - r);
  const cy = Math.min(Math.max(y, r), N - r);
  if (x >= r && x <= N - r) return y >= 0 && y <= N;
  if (y >= r && y <= N - r) return x >= 0 && x <= N;
  return Math.hypot(x - cx, y - cy) <= r;
}

const rgba = Buffer.alloc(N * N * 4);
for (let y = 0; y < N; y += 1) {
  for (let x = 0; x < N; x += 1) {
    const px = x + 0.5;
    const py = y + 0.5;
    const i = (y * N + x) * 4;

    if (!insideRoundedRect(px, py)) continue; // transparent outside the tile

    // Diagonal blend matching the SVG's linearGradient.
    const t = Math.min(1, Math.max(0, (px + py) / (2 * N)));
    let r = FROM[0] + (TO[0] - FROM[0]) * t;
    let g = FROM[1] + (TO[1] - FROM[1]) * t;
    let b = FROM[2] + (TO[2] - FROM[2]) * t;

    let onMark =
      Math.hypot(px - DOT[0], py - DOT[1]) <= DOT_R ||
      POINTS.some((_, index) =>
        index === POINTS.length - 1
          ? false
          : distanceToSegment(px, py, POINTS[index], POINTS[index + 1]) <= STROKE / 2,
      );

    if (onMark) {
      r = 255;
      g = 255;
      b = 255;
    }

    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = 255;
  }
}

// Box-filter down to the final size.
const out = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < SS; sy += 1) {
      for (let sx = 0; sx < SS; sx += 1) {
        const i = ((y * SS + sy) * N + (x * SS + sx)) * 4;
        r += rgba[i];
        g += rgba[i + 1];
        b += rgba[i + 2];
        a += rgba[i + 3];
      }
    }
    const count = SS * SS;
    const i = (y * SIZE + x) * 4;
    out[i] = Math.round(r / count);
    out[i + 1] = Math.round(g / count);
    out[i + 2] = Math.round(b / count);
    out[i + 3] = Math.round(a / count);
  }
}

/* ---- PNG encoding (colour type 6, 8-bit) -------------------------------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// Each scanline is prefixed with filter byte 0 (none).
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y += 1) {
  raw[y * (SIZE * 4 + 1)] = 0;
  out.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

/* ---- ICO container ------------------------------------------------------ */

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // one image

const entry = Buffer.alloc(16);
entry[0] = SIZE === 256 ? 0 : SIZE; // width
entry[1] = SIZE === 256 ? 0 : SIZE; // height
entry[2] = 0; // palette colours
entry[3] = 0; // reserved
entry.writeUInt16LE(1, 4); // colour planes
entry.writeUInt16LE(32, 6); // bits per pixel
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(6 + 16, 12); // offset to the PNG payload

const ico = Buffer.concat([header, entry, png]);
const target = join(process.cwd(), "src/app/favicon.ico");
writeFileSync(target, ico);
console.log(`Wrote ${target} (${ico.length} bytes, ${SIZE}x${SIZE})`);
