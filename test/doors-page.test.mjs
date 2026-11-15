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

const { paper, packages, papers, brief, connections } = globalThis.OfficeDoors;
const fields = { outcome: "a recipe door for the sunday market", done: "ten people made a card", lead: "@lead", task: "off-66", proof: "https://example.com/pr/1", date: "2026-11-15" };

test("the shelf in the page matches the script's packages", () => {
  for (const [id, p] of Object.entries(packages)) {
    assert.match(page, new RegExp(`data-pkg="${id}" data-value="${p.value}"`), id);
    assert.ok(page.includes(`est. value ${p.est}`), id);
  }
});

test("there is a paper for every kind the lead needs", () => {
  assert.deepEqual(Object.keys(papers), ["requisition", "outline", "sow", "contract", "manifest", "receipt"]);
  for (const kind of Object.keys(papers)) assert.ok(page.includes(`data-paper="${kind}"`), kind);
});

test("the statement of work, contract lite and receipt carry the outcome and $0", () => {
  const picked = ["doors", "broadcast"];
  const sow = paper("sow", fields, picked);
  assert.match(sow, /STATEMENT OF WORK · OFF-66/);
  assert.match(sow, /est\. value: \$900\. charged: \$0/);
  assert.match(sow, /mike, for the broadcast/);
  const contract = paper("contract", fields, picked);
  assert.match(contract, /not a legal agreement/);
  assert.match(contract, /STOP/);
  const receipt = paper("receipt", fields, picked);
  assert.match(receipt, /^CLOSED · OFF-66 · RECEIPT/);
  assert.match(receipt, /proof: https:\/\/example\.com\/pr\/1/);
});

test("the manifest is json agents can read", () => {
  const m = JSON.parse(paper("manifest", fields, ["board", "qa"]));
  assert.equal(m.kind, "officenoun.doors.manifest");
  assert.equal(m.charged_usd, 0);
  assert.equal(m.est_value_usd, 400);
  assert.equal(m.signed, false);
  assert.ok(m.connections.some((c) => c.to === "manus"));
  assert.ok(m.connections.some((c) => c.to === "mike"));
});

test("lite connections always start at the loom desk and skip junk links", () => {
  const b = brief({ proof: "javascript:alert(1)" }, []);
  assert.equal(b.proof, "");
  assert.equal(b.task, "OFF-??");
  assert.deepEqual(connections(b).map((c) => c.to), ["loom desk"]);
});
