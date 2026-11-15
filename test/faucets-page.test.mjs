import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const page = await readFile(new URL("../public/faucets/index.html", import.meta.url), "utf8");
const script = await readFile(new URL("../public/faucets/app.js", import.meta.url), "utf8");
const data = JSON.parse(await readFile(new URL("../public/faucets/faucets.json", import.meta.url), "utf8"));

test("five supreme office noun faucets on solana, one a day, mints not created yet", () => {
  assert.equal(data.faucets.length, 5);
  assert.equal(data.chain.name, "solana");
  assert.equal(data.drip.amount, 1);
  for (const f of data.faucets) assert.equal(f.mint, null, f.slug);
  assert.deepEqual(data.faucets.map((f) => f.slug), ["stapler", "mug", "clip", "lamp", "chair"]);
});

test("every noun has its art in the kit", async () => {
  for (const f of data.faucets) await access(new URL(`../public/faucets/nouns/${f.slug}.svg`, import.meta.url));
});

test("sign-up posts to the #supreme-one loom line and never sends or spends", () => {
  assert.match(script, /https:\/\/pointcast\.xyz\/api\/loom/);
  assert.match(script, /"#supreme-one"/);
  assert.doesNotMatch(script, /signAndSendTransaction|sendTransaction|signTransaction/);
  assert.match(script, /this moves nothing\./);
  assert.match(page, /never see your keys/);
});

test("text goes in as text, not HTML", () => {
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML|document\.write/);
});
