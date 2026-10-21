// Generates the Propvest app icon + splash as full-bleed PNGs (pure Node, zlib only).
// Mark: "Fractional Blocks" — a building of 6 blocks with one gold block = your share.
//   assets/icon.png        1024  — emerald->teal gradient, white blocks + 1 gold
//   assets/splash.png      2732  — dark navy, smaller centered blocks + 1 gold
//   assets/splash-dark.png 2732  — same (dark mode)
// @capacitor/assets consumes these directly.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
function mix(c1, c2, t) { return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]; }
function rect(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// The 6-block grid (2 cols x 3 rows), top-right = your fraction. Scaled around center.
function blocks({ base, hot, scale = 1 }) {
  const bw = 150, bh = 150, gap = 26;
  const gridW = 2 * bw + gap, gridH = 3 * bh + 2 * gap;
  const startX = (1024 - gridW) / 2, startY = (1024 - gridH) / 2;
  const sc = ([x, y]) => [512 + (x - 512) * scale, 512 + (y - 512) * scale];
  const shapes = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 2; col++) {
      const x = startX + col * (bw + gap), y = startY + row * (bh + gap);
      const isHot = row === 0 && col === 1;
      shapes.push({
        poly: rect(x, y, x + bw, y + bh).map(sc),
        top: isHot ? hot[0] : base[0],
        bot: isHot ? hot[1] : base[1],
      });
    }
  return shapes;
}

function render(size, bg1, bg2, shapes, supersample = 3) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const s = size / 1024;
  const sh = shapes.map(o => {
    const poly = o.poly.map(([x, y]) => [x * s, y * s]);
    const ys = poly.map(p => p[1]);
    return { poly, top: o.top, bot: o.bot, minY: Math.min(...ys), maxY: Math.max(...ys) };
  });
  for (let y = 0; y < size; y++) {
    const rs = y * (size * 4 + 1); raw[rs] = 0;
    for (let x = 0; x < size; x++) {
      const o = rs + 1 + x * 4;
      const tb = (x + y) / (2 * size);
      let [r, g, b] = mix(bg1, bg2, tb);
      for (const shp of sh) {
        let hits = 0; const step = 1 / supersample;
        for (let sx = 0; sx < supersample; sx++)
          for (let sy = 0; sy < supersample; sy++)
            if (pointInPoly(x + (sx + 0.5) * step, y + (sy + 0.5) * step, shp.poly)) hits++;
        const a = hits / (supersample * supersample);
        if (a > 0) {
          const ty = Math.max(0, Math.min(1, (y - shp.minY) / (shp.maxY - shp.minY || 1)));
          const c = mix(shp.top, shp.bot, ty);
          r = lerp(r, c[0], a); g = lerp(g, c[1], a); b = lerp(b, c[2], a);
        }
      }
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  return raw;
}

function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return (~c) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const body = Buffer.concat([Buffer.from(type, "ascii"), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0); return Buffer.concat([len, body, crc]); }
function png(raw, size) { const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]); const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]); }

const EMERALD = [52, 211, 153], TEAL = [13, 148, 136], WHITE = [255, 255, 255], MINT = [209, 250, 229];
const GOLD = [251, 191, 36], AMBER = [245, 158, 11];
const DARK_HI = [14, 22, 33], DARK_LO = [10, 14, 23];

const dir = path.join(__dirname, "..", "assets");
// Icon: emerald gradient, white blocks + gold share.
fs.writeFileSync(path.join(dir, "icon.png"),
  png(render(1024, EMERALD, TEAL, blocks({ base: [WHITE, MINT], hot: [GOLD, AMBER], scale: 1 })), 1024));
// Splash: dark background, smaller centered blocks + gold share.
const splash = png(render(2732, DARK_HI, DARK_LO, blocks({ base: [WHITE, MINT], hot: [GOLD, AMBER], scale: 0.46 }), 1), 2732);
fs.writeFileSync(path.join(dir, "splash.png"), splash);
fs.writeFileSync(path.join(dir, "splash-dark.png"), splash);
console.log("wrote assets/icon.png (1024), splash.png + splash-dark.png (2732) — Fractional Blocks");
