import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ENTRANTS, summarize } from "../public/kit/office-bench.js";
import { when, outcome, benchRuns, benchTiles, ganttModel, layoutGantt, timeTicks, LAYOUT } from "../public/kit/office-bench-gantt.js";

const page = await readFile(new URL("../src/bench.template.html", import.meta.url), "utf8");
const script = await readFile(new URL("../public/kit/office-bench-gantt.js", import.meta.url), "utf8");

const NOW = Date.parse("2026-11-13T12:00:00Z");
const msgs = [
  { at: "2026-11-13T09:11:00Z", body: "Sol · t1 · 2026-11-13T09:00:00Z · 2026-11-13T09:10:00Z · #1 · green · 5k · ok" },
  { at: "2026-11-13T10:31:00Z", body: "Luna · t2 · 2026-11-13T10:00:00Z · 2026-11-13T10:30:00Z · #2 · red · 5k · checks red" },
  { at: "2026-11-13T11:00:00Z", body: "Terra · t3 · 2026-11-13T10:45:00Z ·  · - · pending" },
  { at: "2026-11-13T11:05:00Z", body: "Opus · t4 · 2026-11-13T11:00:00Z · 2026-11-13T10:00:00Z · #4 · green · 1k · reversed" },
  { at: "2026-11-13T11:06:00Z", body: "Haiku · t5 · 1 · 2 · - · green · - · loose times" },
  { at: "2026-11-13T11:07:00Z", body: "gm, no run here" }
];

test("one row per entrant, all nine, in the ENTRANTS order", () => {
  const m = ganttModel(benchRuns(msgs), { now: NOW });
  assert.deepEqual(m.rows.map((r) => r.entrant), ENTRANTS);
  assert.equal(m.rows.length, 9);
  assert.ok(m.rows.find((r) => r.entrant === "Grok Bot").items.length === 0);
});

test("a bar runs from the claim timestamp to the done timestamp", () => {
  const m = ganttModel(benchRuns(msgs), { now: NOW });
  const sol = m.rows.find((r) => r.entrant === "Sol").items;
  assert.equal(sol.length, 1);
  assert.equal(sol[0].type, "bar");
  assert.equal(sol[0].start, Date.parse("2026-11-13T09:00:00Z"));
  assert.equal(sol[0].end, Date.parse("2026-11-13T09:10:00Z"));
  assert.equal(sol[0].ms, 10 * 60000);
  assert.equal(sol[0].outcome, "shipped");
  // pixels follow the domain: a fixed domain, a fixed width, an exact bar
  const fixed = { ...m, domain: [Date.parse("2026-11-13T09:00:00Z"), Date.parse("2026-11-13T10:00:00Z")], ticks: [] };
  const L = layoutGantt(fixed, 600);
  const bar = L.rows.find((r) => r.entrant === "Sol").items[0];
  assert.equal(bar.x, 0);
  assert.equal(bar.w, 100);
  const luna = L.rows.find((r) => r.entrant === "Luna").items[0];
  assert.equal(luna.type, "bar");
  assert.equal(luna.outcome, "partial");
  assert.equal(luna.x, 600);
});

test("impossible or missing timings get a ring, never a bar", () => {
  const m = ganttModel(benchRuns(msgs), { now: NOW });
  const item = (name) => m.rows.find((r) => r.entrant === name).items[0];
  assert.equal(item("Opus").type, "dot");
  assert.match(item("Opus").reason, /impossible timing/);
  assert.equal(item("Opus").at, Date.parse("2026-11-13T11:00:00Z"));
  assert.equal(item("Terra").type, "dot");
  assert.equal(item("Terra").outcome, "blocked");
  assert.match(item("Terra").reason, /not shipped yet/);
  // "1" and "2" parse as years in Date.parse; the chart does not place them on the axis
  assert.equal(item("Haiku").type, "dot");
  assert.match(item("Haiku").reason, /no usable claim time/);
  assert.equal(item("Haiku").at, Date.parse("2026-11-13T11:06:00Z"));
  assert.ok(m.domain[0] > Date.parse("2026-01-01T00:00:00Z"));
  assert.deepEqual(m.counts, { bars: 2, dots: 3 });
  // a run with no usable time at all still shows, pinned to the left edge
  const lost = ganttModel([{ entrant: "Fable", task: "x", claimed: "soon", done: "later", checks: "-", cost: "", note: "" }], { now: NOW });
  const L = layoutGantt(lost, 500);
  const dot = L.rows.find((r) => r.entrant === "Fable").items[0];
  assert.equal(dot.type, "dot");
  assert.equal(dot.at, null);
  assert.ok(dot.cx > 0 && dot.cx < 20);
});

test("the now line sits inside the domain, and ticks cover it", () => {
  const m = ganttModel(benchRuns(msgs), { now: NOW });
  assert.ok(m.domain[0] < NOW && NOW < m.domain[1]);
  const L = layoutGantt(m, 800);
  assert.ok(L.nowX > 0 && L.nowX < 800);
  assert.ok(m.ticks.length >= 2 && m.ticks.length <= 8);
  assert.ok(m.ticks.every((t) => t.at >= m.domain[0] && t.at <= m.domain[1]));
  assert.equal(timeTicks(0, 3600000).length <= 7, true);
});

test("overlapping runs for one entrant stack into lanes", () => {
  const runs = benchRuns([
    { at: "2026-11-13T10:00:00Z", body: "Sol · a · 2026-11-13T09:00:00Z · 2026-11-13T09:40:00Z · - · green" },
    { at: "2026-11-13T10:00:00Z", body: "Sol · b · 2026-11-13T09:20:00Z · 2026-11-13T09:50:00Z · - · green" }
  ]);
  const L = layoutGantt(ganttModel(runs, { now: NOW }), 700);
  const sol = L.rows.find((r) => r.entrant === "Sol");
  assert.deepEqual(sol.items.map((i) => i.lane).sort(), [0, 1]);
  assert.equal(sol.height, LAYOUT.rowPad * 2 + 2 * LAYOUT.lane);
});

test("outcome: shipped, partial, blocked", () => {
  assert.equal(outcome({ done: "2026-11-13T09:00:00Z", checks: "green" }), "shipped");
  assert.equal(outcome({ done: "2026-11-13T09:00:00Z", checks: "red" }), "partial");
  assert.equal(outcome({ done: "-", checks: "green" }), "blocked");
  assert.equal(when("1"), null);
  assert.equal(when("2026-11-13T09:00:00Z"), Date.parse("2026-11-13T09:00:00Z"));
});

test("tiles come from the parsed data, not fixed numbers", () => {
  const runs = benchRuns(msgs);
  const t = benchTiles(summarize(msgs), runs);
  assert.equal(t.runs, 5);
  assert.equal(t.shipped, 3); // Sol, Opus and Haiku reported done with checks green; timing is judged separately
  assert.equal(t.shippedPct, 60);
  assert.equal(t.reviewed, 4);
  assert.equal(t.reviewedPct, 80);
  const sol = summarize(msgs).rows.flatMap((r) => r.times);
  assert.ok(sol.length >= 2);
  const empty = benchTiles(summarize([]), []);
  assert.deepEqual([empty.runs, empty.medianMs, empty.shippedPct, empty.reviewedPct], [0, null, null, null]);
});

test("page: kit look, three pill tabs, tiles, the Gantt box scrolls on its own", () => {
  assert.match(page, /\.\.\/kit\/office-ui\.css/);
  assert.match(page, /<body class="ou">/);
  for (const id of ["gantt", "scorecard", "measures"]) assert.match(page, new RegExp(`data-ou-tab="${id}"`));
  for (const id of ["runs", "median", "shipped", "reviewed"]) assert.match(page, new RegExp(`data-bench-tile="${id}"`));
  assert.match(page, /class="bench-scroll"[^>]*data-bench-gantt/);
  assert.match(page, /office-bench-gantt\.js/);
});

test("the Gantt never writes HTML strings", () => {
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(script));
  assert.match(script, /createElementNS/);
});
