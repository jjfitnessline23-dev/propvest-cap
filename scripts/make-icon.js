// Generates the Propvest app icon + splash as full-bleed PNGs (pure Node, zlib only).
//   assets/icon.png        1024  — emerald->teal gradient + white ascending bars (growth/buildings)
//   assets/splash.png      2732  — dark navy with centered emerald bars
//   assets/splash-dark.png 2732  — same (dark mode)
// @capacitor/assets consumes these directly.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// Three ascending bars in a 1024 space (reads as both a skyline and investment growth).
// Each bar is a rectangle [x0,y0,x1,y1]; bottoms aligned, heights increasing.
function barsRects() {
  const bottom = 792;
  const w = 150, gap = 46;
  const totalW = w * 3 + gap * 2;
  const startX = (1024 - totalW) / 2;
  const tops = [612, 452, 288];
  return tops.map((top, i) => {
    const x0 = startX + i * (w + gap);
    return [x0, top, x0 + w, bottom];
  });
}
const BARS = barsRects();

function inRects(x, y, rects) {
  for (const [x0, y0, x1, y1] of rects) {
    if (x >= x0 && x < x1 && y >= y0 && y < y1) return true;
  }
  return false;
}

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
function mix(c1, c2, t) { return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]; }

// Build an RGBA raw buffer (with per-row filter byte).
function build(size, { bg1, bg2, shapeTop, shapeBot, scale = 1, supersample = 3 }) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const s = size / 1024;
  const cx = size / 2, cy = size / 2;
  // Scale + center the bars for this size.
  const rects = BARS.map(([x0, y0, x1, y1]) => [
    cx + (x0 - 512) * s * scale, cy + (y0 - 512) * s * scale,
    cx + (x1 - 512) * s * scale, cy + (y1 - 512) * s * scale,
  ]);
  const minY = Math.min(...rects.map(r => r[1])), maxY = Math.max(...rects.map(r => r[3]));
  for (let y = 0; y < size; y++) {
    const rs = y * (size * 4 + 1);
    raw[rs] = 0;
    for (let x = 0; x < size; x++) {
      const o = rs + 1 + x * 4;
      const tb = (x + y) / (2 * size);          // diagonal background gradient
      const bg = mix(bg1, bg2, tb);
      let r = bg[0], g = bg[1], b = bg[2];
      let hits = 0;
      const step = 1 / supersample;
      for (let sx = 0; sx < supersample; sx++)
        for (let sy = 0; sy < supersample; sy++)
          if (inRects(x + (sx + 0.5) * step, y + (sy + 0.5) * step, rects)) hits++;
      const a = hits / (supersample * supersample);
      if (a > 0) {
        const ty = Math.max(0, Math.min(1, (y - minY) / (maxY - minY)));
        const sh = mix(shapeTop, shapeBot, ty);
        r = lerp(r, sh[0], a); g = lerp(g, sh[1], a); b = lerp(b, sh[2], a);
      }
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  return raw;
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function png(raw, size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const EMERALD = [52, 211, 153];  // #34d399
const TEAL    = [13, 148, 136];  // #0d9488
const WHITE   = [255, 255, 255];
const MINT    = [209, 250, 229]; // #d1fae5
const DARK_HI = [14, 22, 33];    // #0e1621
const DARK_LO = [10, 14, 23];    // #0a0e17

const dir = path.join(__dirname, "..", "assets");
// Icon: vibrant emerald->teal gradient with white ascending bars.
fs.writeFileSync(path.join(dir, "icon.png"),
  png(build(1024, { bg1: EMERALD, bg2: TEAL, shapeTop: WHITE, shapeBot: MINT, scale: 1, supersample: 3 }), 1024));
// Splash: dark background with smaller emerald bars.
const splash = png(build(2732, { bg1: DARK_HI, bg2: DARK_LO, shapeTop: EMERALD, shapeBot: TEAL, scale: 0.34, supersample: 1 }), 2732);
fs.writeFileSync(path.join(dir, "splash.png"), splash);
fs.writeFileSync(path.join(dir, "splash-dark.png"), splash);
console.log("wrote assets/icon.png (1024), splash.png + splash-dark.png (2732)");
