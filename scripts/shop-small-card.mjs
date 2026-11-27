// Draws public/shop-small/card.png, the link-preview card for /shop-small/.
// Run once by hand (node scripts/shop-small-card.mjs) and commit the PNG; the site build does not need it.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, svgToGrid } from "./png.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// A 5x7 pixel font, only the glyphs this card uses.
const FONT = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  2: [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  8: [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "-": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."]
};

function text(canvas, value, x, y, scale, hex) {
  let at = x;
  for (const ch of value) {
    const glyph = FONT[ch];
    if (!glyph) throw new Error(`no glyph for ${JSON.stringify(ch)}`);
    glyph.forEach((row, r) => [...row].forEach((on, c) => on === "#" && canvas.rect(at + c * scale, y + r * scale, scale, scale, hex)));
    at += 6 * scale;
  }
  return at - x - scale;
}

const card = createCanvas(1200, 630, "#f4ece0");
const noun = svgToGrid(await readFile(path.join(root, "public/nouns/coffee.svg"), "utf8"));
card.rect(48, 123, 384, 384, "#d5d7e1");
card.grid(noun, 48, 123, 12);

const left = 488;
let y = 136;
text(card, "SHOP SMALL", left, y, 11, "#b8501f");
y += 77 + 40;
text(card, "EL SEGUNDO", left, y, 9, "#1d1a17");
y += 63 + 40;
text(card, "SAT NOV 28", left, y, 7, "#2f7f9e");
y += 49 + 60;
text(card, "OFFICENOUN.XYZ/SHOP-SMALL", left, y, 4, "#6a6158");

// a sun-to-sea stripe along the bottom
card.rect(0, 598, 600, 32, "#e8743b");
card.rect(600, 598, 600, 32, "#2f7f9e");

await writeFile(path.join(root, "public/shop-small/card.png"), card.png());
console.log("wrote public/shop-small/card.png");
