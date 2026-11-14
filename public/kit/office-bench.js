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
  const runs = [];
  for (const msg of Array.isArray(messages) ? messages : []) {
    const run = parseRunLine(msg && msg.body, entrants);
    if (!run) continue;
    total += 1;
    runs.push(run);
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
  return { total, rows: list, fastest, mostFinished, runs };
}

// ---- cost parsing and chart series (pure) ----
const UNIT = { k: 1e3, m: 1e6 };
const toNumber = (n, u) => Math.round(Number(n) * UNIT[u.toLowerCase()]);
// "metered 148k" anywhere in the cost or notes text -> 148000, else null. A bare "metered 148" counts as a plain count.
export function parseMetered(...texts) {
  for (const t of texts) {
    const m = new RegExp(`metered\\s+(\\d+(?:\\.\\d+)?)\\s*([kKmM])?(?![\\w])`).exec(String(t ?? ""));
    if (m) return m[2] ? toNumber(m[1], m[2]) : Math.round(Number(m[1]));
  }
  return null;
}
// the first number with k or M in the cost field, ignoring any "metered ..." phrase. "12k to 15k" -> 12000.
export function parseSaid(cost) {
  const text = String(cost ?? "").replace(/metered\s+\d+(?:\.\d+)?\s*[kKmM]?(?![\w])/gi, " ");
  const m = new RegExp("(\\d+(?:\\.\\d+)?)\\s*([kKmM])" + "(?![\\w])").exec(text);
  return m ? toNumber(m[1], m[2]) : null;
}
export function formatTokens(n) {
  if (n === null || n === undefined) return "—";
  if (n >= 1e6) return `${Math.round(n / 1e5) / 10}M`;
  if (n >= 1e3) return `${Math.round(n / 100) / 10}k`.replace(".0k", "k");
  return String(n);
}
export const runLabel = (run) => (run.task ? `${run.entrant}, ${run.task}` : run.entrant);
export function timeSeries(runs) {
  const out = [];
  for (const run of Array.isArray(runs) ? runs : []) {
    const ms = durationMs(run);
    if (ms !== null && present(run.claimed) && present(run.done)) out.push({ label: runLabel(run), ms });
  }
  return out;
}
export function costSeries(runs) {
  const out = [];
  for (const run of Array.isArray(runs) ? runs : []) {
    const said = parseSaid(run.cost);
    const metered = parseMetered(run.cost, run.note);
    if (said !== null || metered !== null) out.push({ label: runLabel(run), said, metered });
  }
  return out;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs, text) => {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  return n;
};
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// groups: [{ label, bars: [{ name, value, text, fill }] }]. Label on its own line, then one bar per series with its value as text.
export function drawBars(groups, ariaLabel) {
  const W = 360, LEFT = 4, TEXT_W = 92, BAR_H = 12, LABEL_H = 16, GAP = 12;
  const maxVal = Math.max(1, ...groups.flatMap((g) => g.bars.map((b) => b.value)));
  const track = W - LEFT - TEXT_W;
  let y = 0;
  const svg = svgEl("svg", { viewBox: "0 0 360 10", width: "100%", role: "img", "aria-label": ariaLabel, class: "bench-chart" });
  for (const g of groups) {
    const label = svgEl("text", { x: LEFT, y: y + 11, "font-size": 11, fill: "currentColor" }, clip(g.label, 52));
    label.append(svgEl("title", {}, g.label));
    svg.append(label);
    y += LABEL_H;
    for (const b of g.bars) {
      const w = Math.max(2, Math.round((b.value / maxVal) * track));
      svg.append(svgEl("rect", { x: LEFT, y, width: w, height: BAR_H, fill: b.fill, stroke: "currentColor", "stroke-width": 1 }));
      svg.append(svgEl("text", { x: LEFT + w + 5, y: y + 10, "font-size": 11, fill: "currentColor" }, b.text));
      y += BAR_H + 2;
    }
    y += GAP - 2;
  }
  svg.setAttribute("viewBox", `0 0 ${W} ${Math.max(10, y)}`);
  return svg;
}

export function renderCharts(summary, timeEl, costEl, statusEl) {
  const none = () => el("p", "no runs to chart yet.");
  const times = timeSeries(summary.runs);
  timeEl.replaceChildren(
    times.length
      ? drawBars(times.map((t) => ({ label: t.label, bars: [{ name: "time", value: t.ms, text: formatDuration(t.ms), fill: "#5648ed" }] })), "time to finish per run, claimed to done")
      : none()
  );
  const costs = costSeries(summary.runs);
  const group = (c) => {
    const bars = [];
    if (c.said !== null) bars.push({ name: "said", value: c.said, text: `said ${formatTokens(c.said)}`, fill: "#fff" });
    if (c.metered !== null) bars.push({ name: "metered", value: c.metered, text: `metered ${formatTokens(c.metered)}`, fill: "#17171b" });
    return { label: c.label, bars };
  };
  costEl.replaceChildren(costs.length ? drawBars(costs.map(group), "cost per run, said by the entrant versus metered by the harness") : none());
  if (statusEl) statusEl.hidden = !costs.length;
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
  finishedEl.textContent = summary.mostFinished ? `${summary.mostFinished.entrant}, ${summary.mostFinished.finished} reported done` : "open";
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
