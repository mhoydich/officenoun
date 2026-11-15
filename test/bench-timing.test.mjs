import test from "node:test";
import assert from "node:assert/strict";
import { assessTiming, durationMs, summarize, timeSeries, renderScorecard } from "../public/kit/office-bench.js";

const valid = {
  claimed: "2026-11-14T01:56:15Z",
  done: "2026-11-14T01:56:29Z",
  postedAt: "2026-11-14T01:56:36.555Z"
};

test("gym set 1: future Sonnet completion stays reported but cannot enter any speed result", () => {
  const summary = summarize([
    { at: "2026-11-14T01:56:30.811Z", body: "Sonnet · gym set 1 · 2026-11-14T01:56:15Z · 2026-11-14T01:57:10Z · - · - · about 15k tokens (guess) · original note" },
    { at: valid.postedAt, body: `Haiku · gym set 1 · ${valid.claimed} · ${valid.done} · - · - · about 12k tokens (guess) · original note` }
  ]);
  const sonnet = summary.rows.find(r => r.entrant === "Sonnet");
  assert.equal(summary.total, 2);
  assert.equal(sonnet.finished, 1);
  assert.equal(sonnet.note, "original note");
  assert.equal(sonnet.median, null);
  assert.deepEqual(sonnet.timingIssues, ["Completion is later than the server post"]);
  assert.equal(summary.timingExcluded, 1);
  assert.deepEqual(summary.fastest, { entrant: "Haiku", task: "gym set 1", ms: 14000 });
  assert.deepEqual(timeSeries(summary.runs), [{ label: "Haiku, gym set 1", ms: 14000 }]);
});

test("server envelope is required, and run text cannot supply its own timestamp", () => {
  const s = summarize([{ body: `Luna · test · ${valid.claimed} · ${valid.done} · - · - · - · postedAt=2099-01-01T00:00:00Z` }]);
  assert.equal(s.fastest, null);
  assert.deepEqual(timeSeries(s.runs), []);
  assert.equal(s.timingExcluded, 1);
});

test("invalid and reversed timestamps are excluded instead of guessed", () => {
  for (const changed of [
    { claimed: "1" }, { done: "2026-11-14T01:56:29" },
    { done: "2026-02-30T01:56:29Z" }, { claimed: "2026-02-29T01:56:15Z" },
    { done: "2026-11-14T24:00:00Z" }, { postedAt: "later" },
    { done: "2026-11-14T01:56:14Z" }, { claimed: null }
  ]) {
    assert.equal(durationMs({ ...valid, ...changed }), null, JSON.stringify(changed));
  }
});

test("valid timezone offsets, leap dates and exact post-time boundary are accepted", () => {
  assert.equal(durationMs({ ...valid, claimed: "2026-11-13T20:56:15-05:00", done: "2026-11-13T20:56:29-05:00" }), 14000);
  assert.equal(durationMs({ ...valid, postedAt: valid.done }), 14000);
  assert.equal(durationMs({ claimed: "2024-02-29T00:00:00Z", done: "2024-02-29T00:00:01Z", postedAt: "2024-02-29T00:00:02Z" }), 1000);
  assert.equal(durationMs({ ...valid, done: valid.claimed }), 0);
});

test("sub-millisecond input cannot produce a speed record through truncation", () => {
  const cases = [
    // Reversed claim/completion collapse to the same millisecond in Date.parse.
    { claimed: "2026-11-14T01:56:15.0009Z", done: "2026-11-14T01:56:15.0001Z", postedAt: "2026-11-14T01:56:15.001Z" },
    // Completion after the server post also collapses to an apparently valid boundary.
    { claimed: "2026-11-14T01:56:15.000Z", done: "2026-11-14T01:56:15.0009Z", postedAt: "2026-11-14T01:56:15.0001Z" },
    // Apply the same precision contract to the server envelope independently.
    { ...valid, postedAt: "2026-11-14T01:56:36.5551Z" }
  ];
  for (const run of cases) {
    const s = summarize([{ at: run.postedAt, body: `Sol · precision fixture · ${run.claimed} · ${run.done} · - · - · - · retained note` }]);
    const sol = s.rows.find(r => r.entrant === "Sol");
    assert.equal(s.total, 1);
    assert.equal(sol.finished, 1);
    assert.equal(sol.note, "retained note");
    assert.equal(s.timingExcluded, 1);
    assert.equal(sol.median, null);
    assert.equal(s.fastest, null);
    assert.deepEqual(timeSeries(s.runs), []);
  }
});

test("one to three fractional digits retain their millisecond timing", () => {
  assert.equal(durationMs({ claimed: "2026-11-14T01:56:15.1Z", done: "2026-11-14T01:56:15.12Z", postedAt: "2026-11-14T01:56:15.123Z" }), 20);
  assert.equal(durationMs({ claimed: "2026-11-13T20:56:15.001-05:00", done: "2026-11-14T01:56:15.002Z", postedAt: "2026-11-14T01:56:15.002Z" }), 1);
});

test("an untimed pickup miss is not described as a bad completion", () => {
  const s = summarize([{ at: valid.postedAt, body: "Astra · pickup · - · - · - · - · - · no claim" }]);
  assert.equal(s.total, 1);
  assert.equal(s.timingExcluded, 0);
  assert.equal(s.fastest, null);
});

test("exclusion is visible in scorecard status without changing the source note", () => {
  const previous = globalThis.document;
  const make = () => ({ children: [], attrs: {}, append(...nodes) { this.children.push(...nodes); }, setAttribute(k,v) { this.attrs[k] = v; } });
  globalThis.document = { createElement: make };
  try {
    const body = { children: [], replaceChildren() { this.children = []; }, append(n) { this.children.push(n); } };
    const status = {};
    const s = summarize([{ at: valid.postedAt, body: `Sonnet · test · ${valid.claimed} · 2099-01-01T00:00:00Z · - · - · - · unchanged` }]);
    renderScorecard(s, { tBodies: [body] }, status);
    assert.match(status.textContent, /Timing withheld for 1 reported completion:/);
    const row = body.children.find(r => r.children[0].textContent === "Sonnet");
    assert.match(row.children[4].textContent, /1 excluded/);
    assert.equal(row.children[5].textContent, "unchanged");
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
