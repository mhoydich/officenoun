// office noun agent bench · the Gantt view and the top tiles. CC0.
// A separate renderer on top of the parsed runs from office-bench.js: it reads parseRunLine,
// durationMs, isFinished, checksGreen and median, and never changes how a run is scored.
// Whatever durationMs refuses to time, the chart refuses to draw as a bar.
import { ENTRANTS, parseRunLine, durationMs, isFinished, checksGreen, median, formatDuration, runLabel } from "./office-bench.js";

const EMPTY = new Set(["", "-", "–", "—", "none", "n/a", "na", "pending", "tbd"]);
const reported = (s) => !EMPTY.has(String(s ?? "").trim().toLowerCase());
const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

// A time the chart is willing to place: an ISO date and time, nothing looser.
// Date.parse alone reads "1" as the year 2001, which would stretch the axis by decades.
export function when(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value.trim())) return null;
  const ms = Date.parse(value.trim());
  return Number.isFinite(ms) ? ms : null;
}

// shipped: a completion was posted and checks were reported green.
// partial: a completion was posted, checks not reported green.
// blocked: no completion posted.
export function outcome(run) {
  if (!isFinished(run)) return "blocked";
  return checksGreen(run) ? "shipped" : "partial";
}

// Loom messages -> runs, each carrying the server post time from the message envelope.
export function benchRuns(messages, entrants = ENTRANTS) {
  const out = [];
  for (const msg of Array.isArray(messages) ? messages : []) {
    const run = parseRunLine(msg && msg.body, entrants);
    if (!run) continue;
    if (run.postedAt === undefined && msg.at !== undefined) run.postedAt = msg.at;
    out.push(run);
  }
  return out;
}

// The four numbers on top. Every one comes from the parsed runs and the summary; nothing is fixed.
export function benchTiles(summary, runs) {
  const total = summary ? summary.total : 0;
  const list = Array.isArray(runs) ? runs : [];
  const times = summary ? summary.rows.flatMap((r) => r.times) : [];
  const shipped = list.filter((r) => outcome(r) === "shipped").length;
  const reviewed = list.filter((r) => reported(r.checks)).length;
  const share = (n) => (total ? Math.round((n / total) * 100) : null);
  return {
    runs: total,
    medianMs: median(times),
    timed: times.length,
    shipped,
    shippedPct: share(shipped),
    reviewed,
    reviewedPct: share(reviewed)
  };
}

function dotReason(run, ms) {
  if (!isFinished(run)) return "not shipped yet";
  if (when(run.claimed) === null) return "no usable claim time";
  if (when(run.done) === null) return "no usable ship time";
  if (ms === null) return "impossible timing, excluded";
  return "timing could not be placed";
}

// Pure model: one row per entrant, a bar per timed run, a dot per run the bench will not time.
export function ganttModel(runs, opts = {}) {
  const entrants = opts.entrants || ENTRANTS;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const rows = entrants.map((e) => ({ entrant: e, items: [] }));
  const byName = new Map(rows.map((r) => [r.entrant, r]));
  const points = [];
  for (const run of Array.isArray(runs) ? runs : []) {
    const row = byName.get(run.entrant);
    if (!row) continue;
    const kind = outcome(run);
    const ms = durationMs(run);
    const start = when(run.claimed);
    const end = when(run.done);
    const base = { label: runLabel(run), task: run.task, outcome: kind, run };
    if (ms !== null && start !== null && end !== null && end - start === ms) {
      row.items.push({ ...base, type: "bar", start, end, ms });
      points.push(start, end);
    } else {
      const at = start ?? end ?? when(run.postedAt);
      row.items.push({ ...base, type: "dot", at, reason: dotReason(run, ms) });
      if (at !== null) points.push(at);
    }
  }
  const hasData = points.length > 0;
  let lo = hasData ? Math.min(...points) : now - DAY;
  let hi = hasData ? Math.max(...points, now) : now;
  if (hi - lo < HOUR) { lo -= HOUR / 2; hi += HOUR / 2; }
  const pad = (hi - lo) * 0.04;
  lo -= pad;
  hi += pad;
  const ticks = timeTicks(lo, hi);
  const counts = { bars: 0, dots: 0 };
  for (const r of rows) for (const it of r.items) counts[it.type === "bar" ? "bars" : "dots"] += 1;
  return { rows, domain: [lo, hi], now, ticks, counts, hasData };
}

const STEPS = [MIN, 5 * MIN, 15 * MIN, 30 * MIN, HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];
export function timeTicks(lo, hi, target = 8) {
  const span = hi - lo;
  const step = STEPS.find((s) => span / s <= target) || STEPS[STEPS.length - 1];
  const out = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) out.push({ at: t, label: tickLabel(t, step) });
  return out;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (n) => String(n).padStart(2, "0");
export function tickLabel(t, step) {
  const d = new Date(t);
  const day = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  if (step >= DAY) return day;
  const clock = `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 ? day : clock;
}
export function stamp(t) {
  if (t === null || t === undefined) return "no time";
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())} UTC`;
}

// Pure layout in pixels. Bars get a floor width so a 14 second run stays visible on a week-long axis.
export const LAYOUT = { lane: 16, rowPad: 10, axis: 30, minBar: 16, dotR: 6 };
export function layoutGantt(model, width) {
  const [lo, hi] = model.domain;
  const x = (t) => ((t - lo) / (hi - lo)) * width;
  let y = LAYOUT.axis;
  const rows = model.rows.map((row) => {
    const lanes = [];
    const placed = row.items
      .map((it) => {
        if (it.type === "bar") {
          const x0 = x(it.start);
          const w = Math.max(LAYOUT.minBar, x(it.end) - x0);
          return { ...it, x: x0, w, left: x0, right: x0 + w };
        }
        const cx = it.at === null ? LAYOUT.dotR + 2 : x(it.at);
        return { ...it, cx, left: cx - LAYOUT.dotR - 2, right: cx + LAYOUT.dotR + 2 };
      })
      .sort((a, b) => a.left - b.left)
      .map((it) => {
        let lane = lanes.findIndex((end) => end + 3 <= it.left);
        if (lane < 0) { lane = lanes.length; lanes.push(it.right); } else lanes[lane] = it.right;
        return { ...it, lane };
      });
    const height = LAYOUT.rowPad * 2 + Math.max(1, lanes.length) * LAYOUT.lane;
    const top = y;
    y += height;
    return { entrant: row.entrant, top, height, items: placed.map((it) => ({ ...it, y: top + LAYOUT.rowPad + it.lane * LAYOUT.lane })) };
  });
  return { width, height: y + 6, rows, nowX: x(model.now), ticks: model.ticks.map((t) => ({ ...t, x: x(t.at) })) };
}

// ---- DOM (textContent and attributes only) ----
const SVG_NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs, text) => {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  return n;
};
const el = (tag, attrs, text) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  return n;
};
const OUTCOME_WORD = { shipped: "shipped", partial: "partial", blocked: "blocked" };
export function itemTitle(it) {
  if (it.type === "bar") return `${it.label}. claimed ${stamp(it.start)}, done ${stamp(it.end)}, ${formatDuration(it.ms)}. ${OUTCOME_WORD[it.outcome]}.`;
  return `${it.label}. ${it.reason}. ${it.at === null ? "no usable time" : stamp(it.at)}. ${OUTCOME_WORD[it.outcome]}.`;
}

export function renderGantt(model, host, trackWidth) {
  const L = layoutGantt(model, trackWidth);
  const names = el("div", { class: "bg-names", "aria-hidden": "true" });
  names.append(el("div", { class: "bg-names-head", style: `height:${LAYOUT.axis}px` }, "entrant"));
  for (const r of L.rows) names.append(el("div", { class: "bg-name", style: `height:${r.height}px` }, r.entrant));

  const label = `Gantt of agent bench runs, one row per entrant: ${model.counts.bars} timed ${model.counts.bars === 1 ? "run" : "runs"} drawn as bars from claim to done, ${model.counts.dots} untimed shown as rings.`;
  const svg = svgEl("svg", { class: "bg-svg", width: L.width, height: L.height, viewBox: `0 0 ${L.width} ${L.height}`, role: "img", "aria-label": label });
  for (const r of L.rows) svg.append(svgEl("rect", { class: "bg-band", x: 0, y: r.top, width: L.width, height: r.height }));
  for (const t of L.ticks) {
    svg.append(svgEl("line", { class: "bg-grid", x1: t.x, x2: t.x, y1: LAYOUT.axis - 6, y2: L.height }));
    // the now label owns its spot on the axis
    if (Math.abs(t.x - L.nowX) > 34) svg.append(svgEl("text", { class: "bg-tick", x: t.x, y: 16, "text-anchor": "middle" }, t.label));
  }
  for (const r of L.rows) {
    for (const it of r.items) {
      const g = svgEl("g", { class: `bg-item ${it.outcome}`, "data-type": it.type, "data-outcome": it.outcome });
      g.append(svgEl("title", {}, itemTitle(it)));
      const mid = it.y + LAYOUT.lane / 2 - 1;
      if (it.type === "bar") {
        g.append(svgEl("rect", { class: "bg-bar", x: it.x, y: mid - 6, width: it.w, height: 12, rx: 6, ry: 6 }));
      } else {
        g.append(svgEl("circle", { class: "bg-dot", cx: it.cx, cy: mid, r: LAYOUT.dotR }));
        g.append(svgEl("line", { class: "bg-dot-mark", x1: it.cx - 3, y1: mid + 3, x2: it.cx + 3, y2: mid - 3 }));
      }
      svg.append(g);
    }
  }
  svg.append(svgEl("line", { class: "bg-now", x1: L.nowX, x2: L.nowX, y1: LAYOUT.axis - 4, y2: L.height }));
  svg.append(svgEl("text", { class: "bg-now-label", x: L.nowX, y: 16, "text-anchor": L.nowX > L.width - 16 ? "end" : "middle" }, "now"));

  const chart = el("div", { class: "bg-chart" });
  chart.append(names, svg);
  host.replaceChildren(chart);
  return L;
}

export function renderTiles(tiles, nodes) {
  const set = (n, v, s) => {
    if (!n) return;
    const vEl = n.querySelector(".v"), sEl = n.querySelector(".s");
    if (vEl) vEl.textContent = v;
    if (sEl && s !== undefined) sEl.textContent = s;
  };
  set(nodes.runs, String(tiles.runs), "posted in #bench");
  set(nodes.median, tiles.medianMs === null ? "—" : formatDuration(tiles.medianMs), tiles.timed ? `claim to done, ${tiles.timed} timed` : "no timed runs yet");
  set(nodes.shipped, tiles.shippedPct === null ? "—" : `${tiles.shippedPct}%`, `${tiles.shipped} done, checks green`);
  set(nodes.reviewed, tiles.reviewedPct === null ? "—" : `${tiles.reviewedPct}%`, `${tiles.reviewed} checks reported`);
}

// Wire the Gantt into a host element and redraw when its box changes width.
export function mountGantt(runs, host, opts = {}) {
  const NAME_W = opts.nameWidth || 96;
  const MIN_TRACK = opts.minTrack || 620;
  const draw = () => {
    const model = ganttModel(runs, { now: Date.now() });
    const avail = Math.floor((host.clientWidth || 0) - NAME_W - 2);
    renderGantt(model, host, Math.max(MIN_TRACK, avail));
    return model;
  };
  const model = draw();
  // open on the recent end, where the now line is
  host.scrollLeft = host.scrollWidth;
  let t = 0, lastW = host.clientWidth;
  const onResize = () => {
    clearTimeout(t);
    t = setTimeout(() => { if (host.clientWidth !== lastW) { lastW = host.clientWidth; draw(); } }, 120);
  };
  if (typeof ResizeObserver === "function") new ResizeObserver(onResize).observe(host);
  else addEventListener("resize", onResize);
  // a hidden tab has no width; draw again once it is shown
  if (opts.panel) new MutationObserver(() => { if (!opts.panel.hidden) { lastW = host.clientWidth; draw(); } }).observe(opts.panel, { attributes: true, attributeFilter: ["hidden"] });
  return model;
}
