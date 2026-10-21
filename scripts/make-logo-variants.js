// Generates 3 UNIQUE logo concepts for Propvest as 1024 PNGs in assets/variants/.
// Pure Node (zlib only), full-bleed, supersampled. Pick one -> it becomes icon.png.
//   A) Rising rooftops  — three houses ascending (real estate + growth)
//   B) Fractional tower — a building of stacked blocks, one highlighted (your share)
//   C) Uprise mark      — an upward arrow whose shaft is a windowed building
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

// shapes: [{poly, top, bot}] painted in order (later paints over earlier).
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

const dir = path.join(__dirname, "..", "assets", "variants");
fs.mkdirSync(dir, { recursive: true });
const out = (name, raw) => fs.writeFileSync(path.join(dir, name), png(raw, 1024));

// ---- A) Rising rooftops: three ascending houses (body + roof) ----
function variantA() {
  const w = 168, gap = 52, startX = 206, bottom = 802, over = 16;
  const bodyTops = [576, 484, 388];
  const shapes = [];
  bodyTops.forEach((bt, i) => {
    const x0 = startX + i * (w + gap), x1 = x0 + w;
    shapes.push({ poly: rect(x0, bt, x1, bottom), top: WHITE, bot: MINT });                 // body
    shapes.push({ poly: [[x0 - over, bt], [x1 + over, bt], [(x0 + x1) / 2, bt - 92]], top: WHITE, bot: WHITE }); // roof
  });
  return render(1024, EMERALD, TEAL, shapes);
}

// ---- B) Fractional tower: 2x3 blocks, top-right highlighted gold ("your share") ----
function variantB() {
  const bw = 150, bh = 150, gap = 26;
  const gridW = 2 * bw + gap, gridH = 3 * bh + 2 * gap;
  const startX = (1024 - gridW) / 2, startY = (1024 - gridH) / 2;
  const shapes = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 2; col++) {
      const x = startX + col * (bw + gap), y = startY + row * (bh + gap);
      const hot = row === 0 && col === 1; // top-right = your fraction
      shapes.push({ poly: rect(x, y, x + bw, y + bh), top: hot ? GOLD : WHITE, bot: hot ? AMBER : MINT });
    }
  return render(1024, EMERALD, TEAL, shapes);
}

// ---- C) Uprise: upward arrow whose shaft is a windowed building (dark bg) ----
function variantC() {
  const peakY = 250, chevY = 470, chevOut = 232, chevIn = 108;
  const cx = 512, shaftHalf = 96, shaftBot = 792;
  const arrow = [
    [cx, peakY],
    [cx + chevOut, chevY], [cx + chevIn, chevY],
    [cx + shaftHalf, shaftBot], [cx - shaftHalf, shaftBot],
    [cx - chevIn, chevY], [cx - chevOut, chevY],
  ];
  const shapes = [{ poly: arrow, top: EMERALD, bot: TEAL }];
  // Window slits across the shaft (paint bg-dark to carve floors).
  const slitH = 26;
  [560, 632, 704].forEach(y => shapes.push({ poly: rect(cx - shaftHalf, y, cx + shaftHalf, y + slitH), top: DARK_LO, bot: DARK_LO }));
  return render(1024, DARK_HI, DARK_LO, shapes);
}

out("icon-a-rooftops.png", variantA());
out("icon-b-fractional.png", variantB());
out("icon-c-uprise.png", variantC());
console.log("wrote 3 variants to assets/variants/");
