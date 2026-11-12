// Tiny zero-dependency helpers: an RGB PNG encoder and a reader for the canon Noun SVGs.
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

// rgb: Buffer of width * height * 3 bytes.
export function encodePng(width, height, rgb) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit, truecolor, deflate, no filter, no interlace
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const from = y * width * 3;
    rgb.copy(raw, y * (width * 3 + 1) + 1, from, from + width * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// Parse a canon Noun SVG (10px cell rects) into a 32x32 grid of "#rrggbb" or null.
export function svgToGrid(svg) {
  const grid = Array.from({ length: 32 }, () => new Array(32).fill(null));
  for (const [, w, h, x, y, fill] of svg.matchAll(/<rect width="(\d+)" height="(\d+)" x="(\d+)" y="(\d+)" fill="(#[0-9a-fA-F]{6})"/g)) {
    const [cols, rows, x0, y0] = [w, h, x, y].map((value) => Number(value) / 10);
    for (let row = y0; row < y0 + rows; row += 1) {
      for (let col = x0; col < x0 + cols; col += 1) grid[row][col] = fill;
    }
  }
  return grid;
}

export const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// A small canvas for compositing flat-colored rectangles.
export function createCanvas(width, height, background) {
  const rgb = Buffer.alloc(width * height * 3);
  const canvas = {
    width,
    height,
    rgb,
    rect(x, y, w, h, hex) {
      const [r, g, b] = hexToRgb(hex);
      for (let row = Math.max(0, y); row < Math.min(height, y + h); row += 1) {
        for (let col = Math.max(0, x); col < Math.min(width, x + w); col += 1) {
          const at = (row * width + col) * 3;
          rgb[at] = r;
          rgb[at + 1] = g;
          rgb[at + 2] = b;
        }
      }
    },
    grid(cells, x, y, scale) {
      cells.forEach((line, row) => line.forEach((hex, col) => hex && canvas.rect(x + col * scale, y + row * scale, scale, scale, hex)));
    },
    png: () => encodePng(width, height, rgb)
  };
  canvas.rect(0, 0, width, height, background);
  return canvas;
}
