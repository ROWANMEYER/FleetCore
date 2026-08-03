/**
 * Generates FleetCore PWA icons (pure Node, zero dependencies).
 *
 * Outputs to public/icons/:
 *   - icon-192.png            (rounded, transparent corners)
 *   - icon-192-maskable.png   (full-bleed background, content in safe zone)
 *   - icon-512.png            (rounded, transparent corners)
 *   - icon-512-maskable.png   (full-bleed background, content in safe zone)
 *   - apple-touch-icon.png    (180x180, full-bleed — iOS applies its own mask)
 *
 * Design: teal gradient (#06B6D4 → #0891B2) rounded square with a white
 * ascending 3-bar chart. Rendered with 2x supersampling for smooth edges.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

/* ─── Minimal PNG encoder ─────────────────────────────────────── */
const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ─── Geometry helpers ────────────────────────────────────────── */
function roundedRectAt(x, y, rx, ry, rw, rh, rr) {
  const minX = rx + rr;
  const maxX = rx + rw - rr;
  const minY = ry + rr;
  const maxY = ry + rh - rr;
  let cx;
  let cy;
  if (x < minX && y < minY) { cx = minX; cy = minY; }
  else if (x < minX && y > maxY) { cx = minX; cy = maxY; }
  else if (x > maxX && y < minY) { cx = maxX; cy = minY; }
  else if (x > maxX && y > maxY) { cx = maxX; cy = maxY; }
  else {
    if (x < rx || x > rx + rw || y < ry || y > ry + rh) return 0;
    return 1;
  }
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= rr * rr ? 1 : 0;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const C1 = hexToRgb("#06B6D4");
const C2 = hexToRgb("#0891B2");
const WHITE = [255, 255, 255];

/* ─── Renderer (2x supersampled) ──────────────────────────────── */
function render(size, { maskable = false } = {}) {
  const SS = 2;
  const W = size * SS;
  const buf = Buffer.alloc(W * W * 4);

  const cornerR = size * (maskable ? 0.18 : 0.22);
  // Bar-chart geometry is sized to stay within the maskable safe zone
  const barW = size * 0.075;
  const gap = size * 0.05;
  const baseY = size * 0.74;
  const heights = [size * 0.2, size * 0.32, size * 0.44];
  const totalW = 3 * barW + 2 * gap;
  const startX = (size - totalW) / 2;
  const barR = Math.min(barW / 2, size * 0.03);

  const bars = heights.map((h, i) => ({
    x: startX + i * (barW + gap),
    y: baseY - h,
    w: barW,
    h,
  }));

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS;
          const y = py + (sy + 0.5) / SS;

          const outer = maskable ? 1 : roundedRectAt(x, y, 0, 0, size, size, cornerR);
          if (outer <= 0) continue;

          const t = (x + y) / (2 * size);
          const bg = [
            C1[0] + (C2[0] - C1[0]) * t,
            C1[1] + (C2[1] - C1[1]) * t,
            C1[2] + (C2[2] - C1[2]) * t,
          ];

          let col;
          const bar = bars.find(
            (br) => x >= br.x && x <= br.x + br.w && y >= br.y && y <= br.y + br.h
          );
          if (bar) {
            const cov = roundedRectAt(x, y, bar.x, bar.y, bar.w, bar.h, barR);
            col = [WHITE[0], WHITE[1], WHITE[2], cov];
          } else {
            col = [bg[0], bg[1], bg[2], outer];
          }

          const alpha = col[3];
          r += col[0] * alpha;
          g += col[1] * alpha;
          b += col[2] * alpha;
          a += alpha;
        }
      }
      const n = SS * SS;
      const idx = (py * size + px) * 4;
      if (a <= 0) {
        buf[idx] = buf[idx + 1] = buf[idx + 2] = buf[idx + 3] = 0;
        continue;
      }
      buf[idx] = Math.round(r / a);
      buf[idx + 1] = Math.round(g / a);
      buf[idx + 2] = Math.round(b / a);
      buf[idx + 3] = Math.round((a / n) * 255);
    }
  }
  return encodePng(size, size, buf);
}

/* ─── Emit files ──────────────────────────────────────────────── */
const files = [
  { name: "icon-192.png", size: 192, opts: {} },
  { name: "icon-192-maskable.png", size: 192, opts: { maskable: true } },
  { name: "icon-512.png", size: 512, opts: {} },
  { name: "icon-512-maskable.png", size: 512, opts: { maskable: true } },
  { name: "apple-touch-icon.png", size: 180, opts: { maskable: true } },
];

for (const f of files) {
  const png = render(f.size, f.opts);
  writeFileSync(join(outDir, f.name), png);
  console.log(`✓ ${f.name} (${f.size}x${f.size}, ${png.length} bytes)`);
}

console.log("Done. Icons written to public/icons/");
