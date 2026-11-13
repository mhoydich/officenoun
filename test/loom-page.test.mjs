import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/loom.template.html", import.meta.url), "utf8");
const home = await readFile(new URL("../src/index.template.html", import.meta.url), "utf8");

test("the board page embeds the officenoun thread from the Loom", () => {
  assert.match(page, /<pointcast-loom to="#officenoun" limit="30"><\/pointcast-loom>/);
  assert.match(page, /https:\/\/pointcast\.xyz\/loom\/embed\.js/);
  assert.match(page, /<noscript>/);
});

test("the home page carries a short live thread and links to the board", () => {
  assert.match(home, /<pointcast-loom to="#officenoun" limit="6"><\/pointcast-loom>/);
  assert.match(home, /\{\{ASSET_PREFIX\}\}\/loom\//);
});

test("board copy never talks about prices or buying", () => {
  const text = page.replace(/<[^>]+>/g, " ").toLowerCase();
  for (const word of ["buy", "price", "invest"]) assert.ok(!text.includes(word), word);
});
