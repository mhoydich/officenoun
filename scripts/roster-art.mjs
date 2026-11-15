// Dev tool, not part of the build. Draws the Temp Pool nouns from the official CC0 Nouns trait data.
//   npm i --no-save @nouns/assets
//   node scripts/roster-art.mjs node_modules/@nouns/assets/dist/image-data.json
// Writes public/rent/roster/<slug>.svg, one per data/roster.json entry. Same RLE painter as office-noun.js.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = process.argv[2];
if (!source) throw new Error("usage: node scripts/roster-art.mjs <image-data.json>");
const data = JSON.parse(await readFile(source, "utf8"));
const { roster } = JSON.parse(await readFile(path.join(root, "data/roster.json"), "utf8"));
const palette = data.palette.map((hex) => (hex ? `#${hex}` : null));
const SIZE = 32, CELL = 10, BACKGROUND = "#d5d7e1";

function find(kind, filename) {
  const trait = data.images[kind].find((t) => t.filename === filename);
  if (!trait) throw new Error(`${kind}: ${filename} not found`);
  return trait;
}

function paint(grid, trait) {
  const bytes = trait.data.slice(2).match(/../g).map((hex) => parseInt(hex, 16));
  const [, top, right, , left] = bytes;
  let x = left, y = top;
  for (let i = 5; i < bytes.length; i += 2) {
    for (let n = 0; n < bytes[i]; n += 1) {
      if (bytes[i + 1] && palette[bytes[i + 1]]) grid[y][x] = palette[bytes[i + 1]];
      x += 1;
      if (x >= right) { x = left; y += 1; }
    }
  }
}

function svg(grid, title) {
  const size = SIZE * CELL;
  let out = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><title>${title}</title><rect width="100%" height="100%" fill="${BACKGROUND}" />`;
  grid.forEach((row, y) => {
    for (let x = 0; x < SIZE; ) {
      const color = row[x];
      let end = x + 1;
      while (color && end < SIZE && row[end] === color) end += 1;
      if (color) out += `<rect width="${(end - x) * CELL}" height="${CELL}" x="${x * CELL}" y="${y * CELL}" fill="${color}" />`;
      x = end;
    }
  });
  return `${out}</svg>\n`;
}

await mkdir(path.join(root, "public/rent/roster"), { recursive: true });
for (const noun of roster) {
  const grid = Array.from({ length: SIZE }, () => new Array(SIZE).fill(null));
  const t = noun.traits;
  [find("bodies", t.body), find("accessories", t.accessory), find("heads", t.head), find("glasses", t.glasses)].forEach((trait) => paint(grid, trait));
  await writeFile(path.join(root, `public/rent/roster/${noun.slug}.svg`), svg(grid, `${noun.name}, ${noun.title}: an Office Noun made from CC0 Nouns traits`));
  console.log(`drew ${noun.slug}`);
}
