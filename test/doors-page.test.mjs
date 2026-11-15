import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

await import("../public/office-traits.js");
await import("../public/office-noun.js");
await import("../public/kit/office-doors.js");
const { make, requisition } = globalThis.OfficeDoors;
const page = await readFile(new URL("../src/doors.template.html", import.meta.url), "utf8");

test("each door delivers a noun card with a generated noun", () => {
  for (const door of ["poem", "show", "recipe"]) {
    const card = make(door, "sunday coffee");
    assert.ok(card.no >= 11, door);
    assert.ok(card.noun && card.noun.grid, door);
    assert.ok(card.lines.length >= 5, door);
    assert.match(card.text, /#officenoun-doors/);
  }
});

test("same word, same card; another noun changes it", () => {
  assert.deepEqual(make("poem", "Sunday Coffee").text, make("poem", "sunday   coffee").text);
  assert.notEqual(make("poem", "sunday coffee", 0).no, make("poem", "sunday coffee", 1).no);
});

test("the poem never repeats its middle line", () => {
  for (let i = 0; i < 200; i += 1) {
    const { lines } = make("poem", "word " + i);
    assert.notEqual(lines[1], lines[3]);
  }
});

test("recipes list the ingredients and number the steps", () => {
  const card = make("recipe", "eggs, rice and scallions");
  assert.match(card.lines[0], /eggs, rice, scallions/);
  assert.match(card.lines[1], /^1\. /);
});

test("empty input still opens the door", () => {
  assert.ok(make("show", "   ").title.length > 0);
  assert.ok(make("nope", "x").door === "poem");
});

test("the requisition flags the broadcast for mike's ok", () => {
  assert.match(requisition({ outcome: "a door" }, ["broadcast"]), /mike ok needed: yes/);
  assert.match(requisition({}, ["board"]), /mike ok needed: no/);
});

test("every shelf package is free for now and carries an estimate", () => {
  const items = page.match(/<li class="shelf-item"[\s\S]*?<\/li>/g);
  assert.equal(items.length, 8);
  for (const item of items) {
    assert.match(item, /data-value="\d+"/);
    assert.match(item, /est\. value \$[\d,–]+/);
    assert.match(item, /free for now/);
  }
});

test("doors copy never talks about buying or investing", () => {
  const text = page.replace(/<[^>]+>/g, " ").toLowerCase();
  for (const word of ["buy", "invest", "price"]) assert.ok(!text.includes(word), word);
});
