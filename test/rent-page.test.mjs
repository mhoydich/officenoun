import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

await import("../public/office-traits.js");
await import("../public/office-noun.js");
await import("../public/kit/office-doors.js");
await import("../public/kit/office-rent.js");
const { intern, api } = globalThis.OfficeRent;
const page = await readFile(new URL("../src/rent.template.html", import.meta.url), "utf8");
const { roster } = JSON.parse(await readFile(new URL("../data/roster.json", import.meta.url), "utf8"));
const traits = await readFile(new URL("../scripts/vendor-traits.mjs", import.meta.url), "utf8");

test("the roster has eight nouns, each with art on disk", async () => {
  assert.equal(roster.length, 8);
  assert.equal(new Set(roster.map((n) => n.slug)).size, 8);
  for (const n of roster) {
    await access(new URL(`../public/rent/roster/${n.slug}.svg`, import.meta.url));
    for (const key of ["name", "title", "specialty", "door", "chip"]) assert.ok(n[key], `${n.slug}.${key}`);
  }
});

test("roster heads are new: none of the office's ten canon heads", () => {
  for (const n of roster) assert.ok(!traits.includes(`"${n.traits.head}"`), n.traits.head);
  assert.equal(new Set(roster.map((n) => n.traits.head)).size, 8);
});

test("the intern answers in the noun's own lane", () => {
  const toast = roster.find((n) => n.slug === "toast");
  const clip = roster.find((n) => n.slug === "clip");
  assert.match(intern("lunch from eggs, rice and scallions", toast), /you need: eggs, rice, scallions/);
  assert.match(intern("anything", clip), /done when:/);
  assert.match(intern("what are you good at?", clip), /Clip is the fixer/);
  assert.match(intern("", null), /intern here/);
});

test("the page names deskmate honestly and drops the old name", () => {
  assert.match(page, /Deskmate 1 and Deskmate Mini run on Claude by Anthropic/);
  assert.match(page, /Cloudflare Workers AI/);
  assert.ok(!/noggles/i.test(page));
  assert.equal(api, "https://pointcast.xyz/api/deskmate");
  for (const plan of ["fulltime", "temp", "intern"]) assert.ok(page.includes(`data-plan="${plan}"`), plan);
});

test("rent copy never talks about investing or prices", () => {
  const text = page.replace(/<[^>]+>/g, " ").toLowerCase();
  for (const word of ["buy now", "invest", "price"]) assert.ok(!text.includes(word), word);
});

test("art asks are recognised, ordinary chat is not", () => {
  const { wantsArt } = globalThis.OfficeRent;
  for (const t of ["make me a noun", "make an original art nouns image, mh", "draw me a pfp", "random noun please", "create a nouns character"]) assert.ok(wantsArt(t), t);
  for (const t of ["lunch from eggs", "write me five lines about monday", "what are you good at?", "turn this into one outcome"]) assert.ok(!wantsArt(t), t);
});

test("chat-drawn nouns are seeded, new-headed and escape-free svg", async () => {
  await import("../public/rent/parts.js");
  const { drawNoun } = globalThis.OfficeRent;
  const parts = globalThis.NOUN_PARTS;
  const a = drawNoun(parts, "make me a noun", 0);
  assert.deepEqual(a, drawNoun(parts, "Make me a noun ", 0));
  assert.notEqual(a.no, drawNoun(parts, "make me a noun", 1).no);
  assert.match(a.svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.ok((a.svg.match(/<rect/g) || []).length > 20);
  assert.ok(!/stapler head|calendar head|laptop head/.test(a.description));
  for (const canon of ["calendar", "calculator", "stapler", "coffeebean", "cordlessphone", "mailbox", "mouse", "mug", "pencil tip", "laptop"]) {
    assert.ok(!parts.heads.some((h) => h[0] === canon), canon);
  }
});
