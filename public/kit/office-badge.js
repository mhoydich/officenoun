// Office Noun badge lookup. Pure functions; the same file runs in the page, the tests and scripts/badge-cli.mjs.
//
// THE ALGORITHM (this file is the canonical definition; port it from here):
//   1. handle = trim, lowercase, strip one leading "@", trim again.  ("  @WebIdente " -> "webidente")
//   2. h = SHA-256 of the UTF-8 bytes of handle (32 bytes). If crypto.subtle is unavailable, fallbackHash
//      stands in (a tiny non-cryptographic 32-byte hash; badges would then differ from the normal ones).
//   3. Independent byte ranges of h, no PRNG:
//        head      = u16(h[0], h[1]) mod heads.length     (heads sorted by name, all 254)
//        body      = h[2] mod 8     (grayscale-1/7/8/9, foggrey, bluegrey, computerblue, darkbrown)
//        accessory = h[3] mod 4     (id, tie-black-on-white, tie-purple-on-white, tie-red)
//        glasses   = h[4] mod 23    (every glasses trait, sorted by name)
//        line      = h[5] mod 12    (LINES below)
//        photo     = h[6] mod 5     (PHOTOS below)
//        barcode   = nibbles of h[8..31] (48 nibbles, wrapping): bar width [4,4,8,12][n&3], gap [4,6,10][(n>>2)%3]
//   4. Layers are drawn body, accessory, head, glasses onto a 32x32 grid, then written as the 760x1000 badge.
//   The badge never prints the handle.

export const LINES = ["desk by the window. the window is a jpeg.", "reports to the mug.", "started today. already has opinions about the printer.", "orientation is a pdf. nobody has opened it.", "assigned the good chair. temporarily.", "badge works on every door except the one they need.", "found the kitchen on the first try. promising.", "has not replied all. yet.", "parking spot: theoretical.", "lunch is at noon. noon is flexible.", "keeps the stapler loaded. respected.", "on the org chart, somewhere near the plant."];
export const PHOTOS = ["#d5d7e1", "#e1d7d5", "#d5e1d9", "#e1dfd5", "#dad5e1"];
const MONO = "ui-monospace,Menlo,Consolas,DejaVu Sans Mono,monospace";
const INK = "#1f1d29";

export function normalizeHandle(raw) {
  let s = String(raw ?? "").trim().toLowerCase();
  if (s.startsWith("@")) s = s.slice(1);
  return s.trim();
}

// Not secure, not meant to be: only so the page still renders on a context without crypto.subtle.
export function fallbackHash(text) {
  const bytes = new TextEncoder().encode(text);
  const out = new Uint8Array(32);
  let a = 0x811c9dc5;
  for (let i = 0; i < 32; i++) {
    for (const b of bytes) a = Math.imul(a ^ b ^ i, 0x01000193) >>> 0;
    a = Math.imul(a ^ (a >>> 15), 0x2c1b3c6d) >>> 0;
    out[i] = a >>> 24;
  }
  return out;
}

export async function hashHandle(raw) {
  const handle = normalizeHandle(raw);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return fallbackHash(handle);
  return new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(handle)));
}

export function picks(h, traits) {
  const nibble = (i) => (h[8 + ((i % 48) >> 1)] >> (i % 2 ? 0 : 4)) & 15;
  const bars = [];
  let x = 120;
  for (let i = 0; x < 640; i++) {
    const n = nibble(i);
    const w = [4, 4, 8, 12][n & 3];
    bars.push([x, w]);
    x += w + [4, 6, 10][(n >> 2) % 3];
  }
  return {
    head: ((h[0] << 8) | h[1]) % traits.heads.length,
    body: h[2] % traits.bodies.length,
    accessory: h[3] % traits.accessories.length,
    glasses: h[4] % traits.glasses.length,
    line: h[5] % LINES.length,
    photo: h[6] % PHOTOS.length,
    bars
  };
}

// RLE: bytes 1..4 are top,right,bottom,left; then (length, colorIndex) pairs wrapping at the right bound; color 0 is clear.
export function decodeRle(hex, palette, grid = Array.from({ length: 32 }, () => Array(32).fill(null))) {
  const n = hex.length >> 1;
  const b = (i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  const top = b(1), right = b(2), left = b(4);
  let x = left, y = top;
  for (let i = 5; i + 1 < n; i += 2) {
    const len = b(i), c = b(i + 1);
    for (let k = 0; k < len; k++) {
      if (c && x >= 0 && x < 32 && y >= 0 && y < 32) grid[y][x] = "#" + palette[c];
      x++;
      if (x >= right) { x = left; y++; }
    }
  }
  return grid;
}

export function composeGrid(p, traits) {
  const g = decodeRle(traits.bodies[p.body][1], traits.palette);
  decodeRle(traits.accessories[p.accessory][1], traits.palette, g);
  decodeRle(traits.heads[p.head][1], traits.palette, g);
  decodeRle(traits.glasses[p.glasses][1], traits.palette, g);
  return g;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const text = (x, y, s, size, fill = INK, weight = "normal", anchor = "start") =>
  `<text x="${x}" y="${y}" font-family="${MONO}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;

function rects(g, x, y, s) {
  const out = [];
  g.forEach((row, yy) => {
    for (let xx = 0; xx < 32;) {
      const c = row[xx];
      if (!c) { xx++; continue; }
      let x2 = xx;
      while (x2 < 32 && row[x2] === c) x2++;
      out.push(`<rect x="${x + xx * s}" y="${y + yy * s}" width="${(x2 - xx) * s}" height="${s}" fill="${c}"/>`);
      xx = x2;
    }
  });
  return `<g shape-rendering="crispEdges">${out.join("")}</g>`;
}

// Layout ported from tools/directions/series.py badge(): 760x1000, red banner, photo frame, name, dry line, footer, barcode.
export function badgeSvg(p, traits) {
  const grid = composeGrid(p, traits);
  const dept = traits.heads[p.head][0].replace(/-/g, " ").toUpperCase();
  const name = `NEW HIRE · ${dept} DEPT`;
  const line = LINES[p.line];
  const nameSize = name.length <= 16 ? 46 : name.length <= 20 ? 38 : name.length <= 28 ? 32 : 26;
  const lineSize = Math.min(26, Math.floor(580 / (line.length * 0.6)));
  const bars = p.bars.map(([x, w]) => `<rect x="${x}" y="850" width="${w}" height="70" fill="${INK}"/>`).join("");
  const body =
    `<rect width="760" height="1000" fill="#dfe3ea"/><rect x="60" y="60" width="640" height="880" rx="28" fill="#fbf7ee" stroke="${INK}" stroke-width="6"/>` +
    `<rect x="330" y="92" width="100" height="26" rx="13" fill="#dfe3ea" stroke="${INK}" stroke-width="5"/>` +
    `<rect x="60" y="150" width="640" height="90" fill="#c8452c"/>` + text(380, 208, "ANOTHER DAY AT THE OFFICE", 30, "#fbf7ee", "bold", "middle") +
    `<rect x="220" y="280" width="320" height="320" fill="${PHOTOS[p.photo]}" stroke="${INK}" stroke-width="5"/>${rects(grid, 220, 280, 10)}` +
    text(380, 672, name, nameSize, INK, "bold", "middle") + text(380, 722, line, lineSize, "#5b5666", "normal", "middle") +
    text(380, 790, "STAFF DIRECTORY · ISSUED ON ARRIVAL", 19, "#5b5666", "normal", "middle") + bars;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 1000" width="760" height="1000"><title>${esc(`Another day at the office: ${name}. ${line}`)}</title>${body}</svg>`;
}

export async function badgeForHandle(raw, traits) {
  const p = picks(await hashHandle(raw), traits);
  return { picks: p, svg: badgeSvg(p, traits), head: traits.heads[p.head][0] };
}
