import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { badgeForHandle, normalizeHandle, picks, decodeRle, LINES } from "../public/kit/office-badge.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const traits = JSON.parse(await readFile(path.join(root, "public/kit/badge-traits.json"), "utf8"));
const svgFor = async (h) => (await badgeForHandle(h, traits)).svg;

test("normalize: trim, lowercase, one leading @", () => {
  assert.equal(normalizeHandle("  @WebIdente "), "webidente");
  assert.equal(normalizeHandle("_RRNZ_"), "_rrnz_");
});

test("deterministic: case, @ and spaces do not matter", async () => {
  const a = await svgFor("Mrsolexpert_1");
  assert.equal(await svgFor("@mrsolexpert_1"), a);
  assert.equal(await svgFor("  @MRSOLEXPERT_1 "), a);
  assert.equal(await svgFor("mrsolexpert_1"), a);
});

test("different handles give different badges", async () => {
  const set = new Set(await Promise.all(["webidente", "cottonbunny59", "wondax35", "_RRNZ_", "kmhoydich", "THFO351"].map(svgFor)));
  assert.equal(set.size, 6);
});

test("every head, body, accessory and glasses decodes", () => {
  assert.equal(traits.heads.length, 254);
  assert.deepEqual(traits.heads.map((h) => h[0]), traits.heads.map((h) => h[0]).sort());
  for (const kind of ["heads", "bodies", "accessories", "glasses"]) {
    for (const [name, hex] of traits[kind]) {
      const g = decodeRle(hex, traits.palette);
      assert.ok(g.flat().some(Boolean), `${kind}/${name} drew nothing`);
    }
  }
});

test("picks stay in range for extreme hashes", () => {
  for (const fill of [0, 255]) {
    const p = picks(new Uint8Array(32).fill(fill), traits);
    assert.ok(p.head < traits.heads.length && p.line < LINES.length && p.bars.length > 5);
  }
});

test("svg has no handle and no forbidden words", async () => {
  for (const h of ["webidente", "kmhoydich", "THFO351", "cottonbunny59"]) {
    const svg = await svgFor("@" + h);
    assert.doesNotMatch(svg.toLowerCase(), new RegExp(h.toLowerCase()));
    assert.doesNotMatch(svg, /price|coin|buy|\$|sol\b|mint|token/i);
    assert.match(svg, /ANOTHER DAY AT THE OFFICE/);
    assert.match(svg, /STAFF DIRECTORY · ISSUED ON ARRIVAL/);
    assert.match(svg, /viewBox="0 0 760 1000"/);
  }
});

test("cli output equals module output", async () => {
  const out = execFileSync("node", [path.join(root, "scripts/badge-cli.mjs"), "@WondaX35"], { encoding: "utf8" });
  assert.equal(out, (await svgFor("wondax35")) + "\n");
});
