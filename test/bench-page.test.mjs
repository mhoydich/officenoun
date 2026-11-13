import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ENTRANTS, parseRunLine, summarize, median, formatDuration } from "../public/kit/office-bench.js";

const page = await readFile(new URL("../src/bench.template.html", import.meta.url), "utf8");
const home = await readFile(new URL("../src/index.template.html", import.meta.url), "utf8");
const script = await readFile(new URL("../public/kit/office-bench.js", import.meta.url), "utf8");

test("page lists the eight measures and all nine entrants", () => {
  assert.equal((page.match(/<li><strong>(Pickup|No duplicates|Finish|True report|Limits kept|Cost|Handoff|Phone):/g) || []).length, 8);
  for (const name of ENTRANTS) assert.ok(page.includes(`<th scope="row">${name}</th>`), name);
  assert.equal(ENTRANTS.length, 9);
});

test("page reads the #bench room and links the Loom", () => {
  assert.match(script, /https:\/\/pointcast\.xyz\/api\/loom\?to=%23bench/);
  assert.match(page, /https:\/\/pointcast\.xyz\/loom\?to=%23bench/);
  assert.match(page, /Scorecard could not load\./);
  assert.match(page, /No runs logged|data-bench-status/);
});

test("API text never goes through innerHTML", () => {
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(script));
});

test("the home page links to the bench; copy has no em dashes", () => {
  assert.match(home, /\{\{ASSET_PREFIX\}\}\/bench\//);
  assert.ok(!page.replace(/&mdash;/g, "").includes("—"));
});

test("run lines: needs 6 fields and a known entrant, any case", () => {
  assert.equal(parseRunLine("Luna · t1 · a · b · pr · green").entrant, "Luna");
  assert.equal(parseRunLine("luna · t1 · a · b · pr · green").entrant, "Luna");
  assert.equal(parseRunLine("Luna · t1 · a · b · pr"), null);
  assert.equal(parseRunLine("Nobody · t1 · a · b · pr · green"), null);
  assert.equal(parseRunLine("hello world"), null);
  assert.equal(parseRunLine("grok bot · t · a · b · p · c · cost · n1 · n2").note, "n1 · n2");
});

test("summary: counts, median, latest note, and no invented results", () => {
  const empty = summarize([{ body: "gm" }, { body: "Zed · a · b · c · d · e" }]);
  assert.equal(empty.total, 0);
  assert.ok(empty.rows.every((r) => r.runs === 0) && empty.fastest === null && empty.mostFinished === null);
  const s = summarize([
    { at: "2026-11-13T10:00:00Z", body: "Sol · t · 2026-11-13T09:00:00Z · 2026-11-13T09:10:00Z · #1 · green · 5k · first" },
    { at: "2026-11-13T11:00:00Z", body: "Sol · t · 2026-11-13T09:00:00Z · 2026-11-13T09:30:00Z · #2 · red · 5k · second" },
    { at: "2026-11-13T12:00:00Z", body: "Sol · t · soon ·  · - · pending" }
  ]);
  const sol = s.rows.find((r) => r.entrant === "Sol");
  assert.deepEqual([sol.runs, sol.finished, sol.green], [3, 2, 1]);
  assert.equal(sol.median, 20 * 60000);
  assert.equal(s.fastest.ms, 10 * 60000);
  assert.equal(s.mostFinished.entrant, "Sol");
  assert.equal(median([1, 3]), 2);
  assert.equal(formatDuration(null), "—");
});
