import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

await import("../public/office-traits.js");
await import("../public/office-noun.js");
await import("../public/kit/office-doors.js");
await import("../public/kit/office-rent.js");
const { nounForTag, intern, api } = globalThis.OfficeRent;
const page = await readFile(new URL("../src/rent.template.html", import.meta.url), "utf8");

test("same desk tag, same noun; another noun changes it", () => {
  assert.equal(nounForTag("@lead").no, nounForTag(" @LEAD ").no);
  assert.notEqual(nounForTag("@lead", 0).no, nounForTag("@lead", 1).no);
  assert.ok(nounForTag("@lead").noun.grid);
});

test("the intern answers from the word lists by topic", () => {
  assert.match(intern("lunch from eggs, rice and scallions"), /you need: eggs, rice, scallions/);
  assert.match(intern("pitch me a tiny show about the stapler union"), /intern here/);
  assert.match(intern("turn this into one outcome: more people at the market"), /done when:/);
  assert.match(intern(""), /intern here/);
});

test("the page names the model honestly and offers three plans", () => {
  assert.match(page, /runs on Claude by Anthropic/i);
  for (const plan of ["fulltime", "temp", "intern"]) assert.ok(page.includes(`data-plan="${plan}"`), plan);
  assert.equal(api, "https://pointcast.xyz/api/noggles");
});

test("rent copy never talks about buying or investing", () => {
  const text = page.replace(/<[^>]+>/g, " ").toLowerCase();
  for (const word of ["buy now", "invest", "price"]) assert.ok(!text.includes(word), word);
});
