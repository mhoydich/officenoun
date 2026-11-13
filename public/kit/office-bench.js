// office noun agent bench. CC0. parses run lines from the Loom room #bench.
export const ENTRANTS = ["Astra", "Sol", "Terra", "Luna", "Fable", "Opus", "Sonnet", "Haiku", "Grok Bot"];
export const ROOM_API = "https://pointcast.xyz/api/loom?to=%23bench";
const SEP = " · ";
const EMPTY = new Set(["", "-", "–", "—", "none", "n/a", "na", "pending", "tbd"]);
const present = (s) => !EMPTY.has(String(s ?? "").trim().toLowerCase());

// "entrant · task · claimed at · done at · PR · checks · cost · notes" -> object, or null.
export function parseRunLine(body, entrants = ENTRANTS) {
  if (typeof body !== "string") return null;
  for (const raw of body.split(/\r?\n/)) {
    const f = raw.split(SEP).map((s) => s.trim());
    if (f.length < 6) continue;
    const entrant = entrants.find((e) => e.toLowerCase() === f[0].toLowerCase());
    if (!entrant) continue;
    return { entrant, task: f[1], claimed: f[2], done: f[3], pr: f[4], checks: f[5], cost: f[6] ?? "", note: f.slice(7).join(SEP) };
  }
  return null;
}

export const isFinished = (run) => present(run.done);
export const checksGreen = (run) => /^(green|pass|passed|ok|yes|success)\b/i.test(run.checks.trim());
export function durationMs(run) {
  const a = Date.parse(run.claimed);
  const b = Date.parse(run.done);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? b - a : null;
}
export function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function formatDuration(ms) {
  if (ms === null || ms === undefined) return "—";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h}h ${min % 60}m` : `${Math.round(h / 24)}d`;
}

// messages: array of { body, at, from: { name } }. Oldest first in the result's notes ordering.
export function summarize(messages, entrants = ENTRANTS) {
  const rows = new Map(entrants.map((e) => [e, { entrant: e, runs: 0, finished: 0, green: 0, times: [], note: "", noteAt: -Infinity }]));
  let total = 0;
  let fastest = null;
  for (const msg of Array.isArray(messages) ? messages : []) {
    const run = parseRunLine(msg && msg.body, entrants);
    if (!run) continue;
    total += 1;
    const row = rows.get(run.entrant);
    row.runs += 1;
    if (isFinished(run)) row.finished += 1;
    if (checksGreen(run)) row.green += 1;
    const d = durationMs(run);
    if (d !== null) {
      row.times.push(d);
      if (!fastest || d < fastest.ms) fastest = { entrant: run.entrant, ms: d, task: run.task };
    }
    const at = Date.parse(msg.at);
    const stamp = Number.isFinite(at) ? at : total;
    if (run.note && stamp >= row.noteAt) {
      row.note = run.note;
      row.noteAt = stamp;
    }
  }
  const list = [...rows.values()].map((r) => ({ ...r, median: median(r.times) }));
  const mostFinished = list.reduce((best, r) => (r.finished > 0 && (!best || r.finished > best.finished) ? r : best), null);
  return { total, rows: list, fastest, mostFinished };
}

const el = (tag, text, attrs) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
  return n;
};

export function renderScorecard(summary, table, status) {
  const body = table.tBodies[0];
  body.replaceChildren();
  for (const r of summary.rows) {
    const tr = el("tr");
    const has = r.runs > 0;
    tr.append(
      el("th", r.entrant, { scope: "row" }),
      el("td", has ? String(r.runs) : "—"),
      el("td", has ? String(r.finished) : "—"),
      el("td", has ? String(r.green) : "—"),
      el("td", has ? formatDuration(r.median) : "—"),
      el("td", r.note || "—")
    );
    body.append(tr);
  }
  status.textContent = summary.total ? `${summary.total} ${summary.total === 1 ? "run" : "runs"} logged.` : "No runs logged yet.";
}

export function renderRecords(summary, fastestEl, finishedEl) {
  fastestEl.textContent = summary.fastest ? `${summary.fastest.entrant}, ${formatDuration(summary.fastest.ms)} on ${summary.fastest.task || "a task"}` : "open";
  finishedEl.textContent = summary.mostFinished ? `${summary.mostFinished.entrant}, ${summary.mostFinished.finished} finished` : "open";
}

export async function load(timeoutMs = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(ROOM_API, { signal: ctl.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    if (!data || !Array.isArray(data.messages)) throw new Error("no messages array");
    return data.messages;
  } finally {
    clearTimeout(t);
  }
}
