/* Office Pools prototype. Entries stay in localStorage. No signing, no deposits. */
'use strict';

const STORE_KEY = 'officenoun-pools-v1';
const TZ = 'America/New_York';
const PT = 'America/Los_Angeles';
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const NAME_OK = /^[A-Za-z0-9 .'_#@-]{2,24}$/;

let coins = [];
let seriesDoc = null;
let heads = [];
let nouns = null;
let example = null;
let forkTemplate = null;
let prices = new Map();
let identity = { name: '', wallet: '' };
let entries = [];
let pumpCadence = '15m';
let refreshing = false;

function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return [...(root || document).querySelectorAll(sel)]; }

function number(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
function money(value, isPrice) {
  if (value === null || value === undefined) return '—';
  if (value === 0) return '$0';
  const abs = Math.abs(value);
  const options = isPrice || abs < 1
    ? { maximumSignificantDigits: 3 }
    : abs >= 100 ? { maximumFractionDigits: 0 } : { maximumFractionDigits: 2 };
  return '$' + value.toLocaleString('en-US', options);
}
function pct(value) {
  if (value === null || value === undefined) return '—';
  const sign = value > 0 ? '+' : '';
  return sign + value.toLocaleString('en-US', { maximumFractionDigits: 2 }) + '%';
}
async function fetchJSON(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}
function batches(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function zonedParts(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23'
  }).formatToParts(date);
  const out = {};
  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }
  return out;
}
function formatET(date, withSeconds) {
  const opts = {
    timeZone: TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h12'
  };
  if (withSeconds) opts.second = '2-digit';
  return date.toLocaleString('en-US', opts) + ' ET';
}
function formatPT(date) {
  return date.toLocaleString('en-US', {
    timeZone: PT,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h12'
  }) + ' PT';
}
function pad(n) { return String(n).padStart(2, '0'); }
function ymd(parts) { return parts.year + '-' + parts.month + '-' + parts.day; }
function remainText(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return hh + ':' + pad(mm) + ':' + pad(ss);
  return pad(mm) + ':' + pad(ss);
}

/* Offset helpers: remaining time is computed from zoned clock parts so DST is respected. */
function remainTo15(parts) {
  const min = +parts.minute;
  const sec = +parts.second;
  const elapsed = (min % 15) * 60 + sec;
  return (15 * 60 - elapsed) * 1000;
}
function remainToHour(parts) {
  return ((60 - +parts.minute) * 60 - +parts.second) * 1000;
}
function remainTo5pm(parts) {
  const nowS = (+parts.hour) * 3600 + (+parts.minute) * 60 + (+parts.second);
  const bell = 17 * 3600;
  let left = bell - nowS;
  if (left <= 0) left += 24 * 3600;
  return left * 1000;
}
function remainToMidnight(parts) {
  const nowS = (+parts.hour) * 3600 + (+parts.minute) * 60 + (+parts.second);
  return (24 * 3600 - nowS) * 1000;
}
function addDaysYmd(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
}
function floor15label(parts) {
  const start = Math.floor(+parts.minute / 15) * 15;
  return ymd(parts) + 'T' + pad(parts.hour) + ':' + pad(start);
}
function dailyId(parts) {
  // Round settling at today's 5pm ET, or tomorrow's if we are past the bell.
  const nowS = (+parts.hour) * 3600 + (+parts.minute) * 60 + (+parts.second);
  return nowS < 17 * 3600 ? ymd(parts) : addDaysYmd(ymd(parts), 1);
}

function pumpRound(cadence, date) {
  const parts = zonedParts(date, TZ);
  if (cadence === '15m') {
    const id = 'pump-15m-' + floor15label(parts);
    return { id, cadence, remain: remainTo15(parts), close: 'next 15-minute bell, Eastern' };
  }
  if (cadence === '1h') {
    const id = 'pump-1h-' + ymd(parts) + 'T' + pad(parts.hour);
    return { id, cadence, remain: remainToHour(parts), close: 'top of the next hour, Eastern' };
  }
  const id = 'pump-1d-' + dailyId(parts);
  return { id, cadence, remain: remainTo5pm(parts), close: '5:00 PM Eastern' };
}
function gvgRound(date) {
  const parts = zonedParts(date, TZ);
  return { id: 'gvg-1d-' + dailyId(parts), remain: remainTo5pm(parts), close: '5:00 PM Eastern' };
}
function deskRound(date) {
  const parts = zonedParts(date, TZ);
  return { id: 'desk-1d-' + dailyId(parts), remain: remainTo5pm(parts), close: '5:00 PM Eastern' };
}
function weatherRound(date) {
  const pt = zonedParts(date, PT);
  const tomorrow = addDaysYmd(ymd(pt), 1);
  return {
    id: 'weather-' + tomorrow,
    day: tomorrow,
    remain: remainToMidnight(pt),
    close: 'midnight Pacific'
  };
}
function nounRound(date) {
  const parts = zonedParts(date, TZ);
  return { id: 'noun-' + dailyId(parts), remain: remainTo5pm(parts), close: '5:00 PM Eastern' };
}
function closeInstant(remain) {
  return new Date(Date.now() + remain);
}

function pickPair(roundId) {
  if (coins.length < 2) return [];
  const rand = mulberry32(hash32(roundId));
  const i = Math.floor(rand() * coins.length);
  let j = Math.floor(rand() * (coins.length - 1));
  if (j >= i) j += 1;
  return [coins[i], coins[j]];
}
function coinByTicker(ticker) {
  return coins.find((c) => c.ticker === ticker);
}
function seriesOf(id) {
  return (seriesDoc?.series || []).find((s) => s.id === id);
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && typeof data === 'object') {
      identity = {
        name: typeof data.name === 'string' ? data.name : '',
        wallet: typeof data.wallet === 'string' ? data.wallet : ''
      };
      entries = Array.isArray(data.entries) ? data.entries : [];
    }
  } catch {
    identity = { name: '', wallet: '' };
    entries = [];
  }
}
function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      name: identity.name,
      wallet: identity.wallet,
      entries,
      forkPreview: loadForkPreview(false)
    }));
    return true;
  } catch {
    return false;
  }
}
let forkPreviewCache = null;
function loadForkPreview(fromStore) {
  if (!fromStore) return forkPreviewCache;
  return forkPreviewCache;
}

function validateName(name) {
  const trimmed = name.trim();
  if (!NAME_OK.test(trimmed)) return 'Use 2–24 characters: letters, numbers, spaces, and . \' _ # @ -';
  return '';
}
function validateWallet(wallet) {
  const trimmed = wallet.trim();
  if (!trimmed) return '';
  if (!BASE58.test(trimmed)) return 'That does not look like a Solana address. Leave it blank, or paste a public address only — never a seed phrase.';
  return '';
}

function upsertEntry(entry) {
  const idx = entries.findIndex((e) => e.fork === entry.fork && e.round === entry.round && e.name === entry.name);
  if (idx >= 0) entries[idx] = entry;
  else entries.push(entry);
  const ok = saveStore();
  return ok;
}
function entriesFor(fork, round) {
  return entries.filter((e) => e.fork === fork && e.round === round);
}
function myEntry(fork, round) {
  if (!identity.name) return null;
  return entries.find((e) => e.fork === fork && e.round === round && e.name === identity.name) || null;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function drawNoun(ticker, cell, bricks) {
  if (!nouns || !OfficeNounBricks) {
    const span = el('span', 'noun-slot', '');
    span.style.cssText = 'width:' + (32 * cell) + 'px;height:' + (32 * cell) + 'px;background:#d5d7e1;border:1px solid rgba(23,23,27,.16)';
    return span;
  }
  const canvas = OfficeNounBricks.nounCanvas(nouns, ticker, cell, bricks);
  canvas.setAttribute('role', 'img');
  const coin = coinByTicker(ticker);
  canvas.setAttribute('aria-label', (coin ? coin.name : ticker) + ' Noun');
  return canvas;
}

function renderCoinCard(coin, cell) {
  const card = el('div', 'coin-card');
  const noun = drawNoun(coin.ticker, cell, cell >= 6);
  const meta = el('div', 'meta');
  meta.append(
    el('h3', '', coin.name),
    el('p', 'ticker', '$' + coin.ticker + ' · ' + coin.series)
  );
  const row = prices.get(coin.mint) || {};
  const p = el('p', 'price');
  const chg = row.chg;
  if (chg > 0) p.classList.add('up');
  if (chg < 0) p.classList.add('down');
  p.textContent = money(row.price ?? null, true) + (chg == null ? '' : '  ' + pct(chg));
  meta.append(p);
  card.append(noun, meta);
  return card;
}

function renderPair(target, pair, cell) {
  target.replaceChildren();
  if (pair.length < 2) {
    target.append(el('p', 'note', 'The coin list is still loading.'));
    return;
  }
  target.append(renderCoinCard(pair[0], cell), el('div', 'vs', 'VS'), renderCoinCard(pair[1], cell));
}

function setPicks(container, name, options) {
  container.replaceChildren();
  for (const opt of options) {
    const label = el('label', 'pick');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = opt.value;
    input.required = true;
    label.append(input, document.createTextNode(' ' + opt.label));
    container.append(label);
  }
}

function ticketId(entry) {
  return 'ON-' + hash32(entry.fork + entry.round + entry.name).toString(16).toUpperCase().slice(0, 6);
}

function renderTicketCanvas(entry, scale) {
  const w = 720 * scale;
  const h = 400 * scale;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = (720) + 'px';
  canvas.style.maxWidth = '100%';
  canvas.style.height = 'auto';
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const s = scale;

  // Paper
  ctx.fillStyle = '#f7f3e9';
  ctx.fillRect(0, 0, w, h);
  // Outer rule
  ctx.strokeStyle = '#17171b';
  ctx.lineWidth = 2 * s;
  ctx.strokeRect(s, s, w - 2 * s, h - 2 * s);
  // Inner hairline
  ctx.lineWidth = 1 * s;
  ctx.strokeRect(10 * s, 10 * s, w - 20 * s, h - 20 * s);

  // Perforated stub — pixel notches, no anti-aliased arcs
  ctx.fillStyle = '#c8cad4';
  ctx.fillRect(0, 0, 36 * s, h);
  ctx.fillStyle = '#17171b';
  ctx.fillRect(36 * s, 0, 2 * s, h);
  const holeR = 6 * s;
  for (let y = 22 * s; y < h; y += 22 * s) {
    for (let dy = -holeR; dy <= holeR; dy += 1) {
      for (let dx = -holeR; dx <= 0; dx += 1) {
        if (dx * dx + dy * dy <= holeR * holeR) {
          ctx.fillStyle = '#f7f3e9';
          ctx.fillRect(dx, y + dy, 1, 1);
        }
      }
    }
  }

  // Header bar
  ctx.fillStyle = '#17171b';
  ctx.fillRect(36 * s, 0, w - 36 * s, 48 * s);
  ctx.fillStyle = '#f7f3e9';
  ctx.font = (600) + ' ' + (18 * s) + 'px "IBM Plex Mono", monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('OFFICE POOLS', 56 * s, 24 * s);
  ctx.font = (400) + ' ' + (12 * s) + 'px "IBM Plex Mono", monospace';
  ctx.fillText('FREE ENTRY  ·  NOBODY LOSES ANYTHING', 280 * s, 24 * s);

  // Noun
  const ticker = entry.nounTicker || 'OFFICENOUN';
  if (nouns && OfficeNounBricks && nouns.nouns[ticker]) {
    const rec = nouns.nouns[ticker];
    const cell = 8 * s;
    const nx = 56 * s;
    const ny = 72 * s;
    const bg = rec.bg || 'd5d7e1';
    ctx.fillStyle = '#' + bg.replace('#', '');
    ctx.fillRect(nx, ny, 32 * cell, 32 * cell);
    OfficeNounBricks.paint(ctx, OfficeNounBricks.decodePx(rec.px), nouns.palette, bg, nx, ny, cell, true);
    ctx.strokeStyle = '#17171b';
    ctx.lineWidth = 1 * s;
    ctx.strokeRect(nx, ny, 32 * cell, 32 * cell);
  }

  const tx = 56 * s + 32 * 8 * s + 28 * s;
  const lines = [
    [entry.forkLabel || entry.fork, 22, true],
    [entry.round, 13, false],
    ['desk  ' + entry.name, 16, false],
    [entry.wallet ? 'tag   ' + entry.wallet.slice(0, 4) + '…' + entry.wallet.slice(-4) : 'tag   no wallet', 13, false],
    ['pick  ' + entry.pickLabel, 16, true],
    [ticketId(entry) + '  ·  prototype', 13, false]
  ];
  let y = 88 * s;
  ctx.fillStyle = '#17171b';
  ctx.textBaseline = 'top';
  for (const [text, size, bold] of lines) {
    ctx.font = (bold ? 600 : 400) + ' ' + (size * s) + 'px "IBM Plex Mono", monospace';
    ctx.fillText(text, tx, y);
    y += size * s + 10 * s;
  }

  // Footer
  ctx.fillStyle = '#17171b';
  ctx.fillRect(36 * s, h - 44 * s, w - 36 * s, 44 * s);
  ctx.fillStyle = '#f7f3e9';
  ctx.font = (500) + ' ' + (13 * s) + 'px "IBM Plex Mono", monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('free to play.  bragging rights only.  not a fund.  no promises.', 56 * s, h - 22 * s);

  if (entry.example) {
    ctx.save();
    ctx.translate(w - 90 * s, 90 * s);
    ctx.rotate(Math.PI / 8);
    ctx.strokeStyle = '#7e3e29';
    ctx.lineWidth = 2 * s;
    ctx.strokeRect(-58 * s, -16 * s, 116 * s, 32 * s);
    ctx.fillStyle = '#7e3e29';
    ctx.font = (600) + ' ' + (14 * s) + 'px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EXAMPLE', 0, 0);
    ctx.restore();
  }

  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Office Pools ticket for ' + entry.name + ', pick ' + entry.pickLabel);
  return canvas;
}

function mountTicket(stage, entry, downloadName) {
  stage.hidden = false;
  stage.replaceChildren();
  const wrap = el('div', 'ticket-wrap');
  const canvas = renderTicketCanvas(entry, 1);
  wrap.append(canvas);
  const actions = el('div', 'ticket-actions');
  const save = el('button', '', 'Save ticket as PNG');
  save.type = 'button';
  save.addEventListener('click', () => {
    const hi = renderTicketCanvas(entry, 2);
    hi.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName || 'office-pools-ticket.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  });
  actions.append(save);
  stage.append(wrap, actions);
}

function listLocal(target, fork, round) {
  const mine = entriesFor(fork, round);
  target.replaceChildren();
  if (!mine.length) {
    target.append(el('li', 'empty', 'No tickets on this device for this heat yet.'));
    return;
  }
  for (const e of mine) {
    const li = el('li');
    li.append(el('span', 'rank', '·'), el('span', '', e.name + ' — ' + e.pickLabel), el('span', 'pts', 'local'));
    target.append(li);
  }
}
function listExample(target, rows, kind) {
  target.replaceChildren();
  for (const row of rows) {
    const li = el('li', kind === 'feed' ? 'feed' : '');
    const rank = el('span', 'rank', kind === 'feed' ? '·' : String(row.rank || ''));
    let midText = row.name;
    if (kind === 'feed') midText = row.name + ' · ' + row.fork + ' · ' + row.detail;
    if (kind === 'team') midText = row.name + ' · ' + row.kind;
    const mid = el('span', '');
    mid.append(document.createTextNode(midText));
    if (row.example) {
      mid.append(document.createTextNode(' '), el('span', 'example-tag', 'Example'));
    }
    const right = kind === 'feed' ? row.when : (row.points != null ? String(row.points) : row.record);
    li.append(rank, mid, el('span', 'pts', right || ''));
    target.append(li);
  }
}

function requireIdentity() {
  if (identity.name) return true;
  const form = $('#identity-form');
  $('#identity-status').textContent = 'Clock in with a desk name first. It stays on this device.';
  form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('#desk-name')?.focus();
  return false;
}

function makeEntry(fork, round, pick, pickLabel, extras) {
  return {
    fork,
    forkLabel: extras.forkLabel,
    round,
    name: identity.name,
    wallet: identity.wallet || '',
    pick,
    pickLabel,
    nounTicker: extras.nounTicker || pick || 'OFFICENOUN',
    at: new Date().toISOString(),
    example: false,
    ...extras
  };
}

function onTicket(formStatus, stage, entry, file) {
  const ok = upsertEntry(entry);
  formStatus.textContent = ok
    ? 'Ticket taken. It lives on this device. Save a PNG if you want a copy.'
    : 'Ticket taken for this visit, but this browser would not save it.';
  mountTicket(stage, entry, file);
  renderBoards();
}

/* ---------------- prices ---------------- */
async function loadPrices() {
  if (refreshing || !coins.length) return;
  refreshing = true;
  const data = new Map();
  let gecko = false;
  let dex = false;
  const mints = coins.map((c) => c.mint);
  try {
    try {
      let ok = 0;
      for (const batch of batches(mints, 30)) {
        try {
          const response = await fetchJSON('https://api.geckoterminal.com/api/v2/networks/solana/tokens/multi/' + batch.join(','));
          if (!Array.isArray(response.data) || !response.data.length) throw new Error('empty');
          for (const token of response.data) {
            const a = token.attributes;
            if (!a?.address) continue;
            data.set(a.address, {
              price: number(a.price_usd),
              cap: number(a.market_cap_usd) ?? number(a.fdv_usd),
              volume: number(a.volume_usd?.h24)
            });
          }
          ok += 1;
        } catch { /* next batch */ }
      }
      if (!ok) throw new Error('gecko failed');
      gecko = true;
    } catch {
      try {
        for (const batch of batches(mints, 30)) {
          const response = await fetchJSON('https://api.dexscreener.com/latest/dex/tokens/' + batch.join(','));
          if (!Array.isArray(response.pairs)) continue;
          const pairs = response.pairs.filter((p) => p.chainId === 'solana')
            .sort((a, b) => (number(b.liquidity?.usd) ?? 0) - (number(a.liquidity?.usd) ?? 0));
          for (const pair of pairs) {
            const mint = pair.baseToken?.address;
            if (!coins.some((c) => c.mint === mint) || data.has(mint)) continue;
            data.set(mint, {
              price: number(pair.priceUsd),
              cap: number(pair.marketCap) ?? number(pair.fdv),
              volume: number(pair.volume?.h24),
              chg: number(pair.priceChange?.h24)
            });
          }
        }
        dex = data.size > 0;
        if (!dex) throw new Error('dex failed');
      } catch { /* keep going */ }
    }
    try {
      for (const batch of batches(mints, 25)) {
        const response = await fetchJSON('https://api.dexscreener.com/latest/dex/tokens/' + batch.join(','));
        if (!Array.isArray(response.pairs)) continue;
        const best = new Map();
        for (const pair of response.pairs) {
          if (pair.chainId !== 'solana') continue;
          const mint = pair.baseToken?.address;
          if (!coins.some((c) => c.mint === mint)) continue;
          const liq = number(pair.liquidity?.usd) ?? 0;
          const prev = best.get(mint);
          if (!prev || liq > prev.liq) best.set(mint, { liq, pair });
        }
        for (const [mint, { pair }] of best) {
          const values = data.get(mint) || {};
          const chg = number(pair.priceChange?.h24);
          if (chg != null) values.chg = chg;
          if (values.price == null) values.price = number(pair.priceUsd);
          if (values.cap == null) values.cap = number(pair.marketCap) ?? number(pair.fdv);
          if (values.volume == null) values.volume = number(pair.volume?.h24);
          data.set(mint, values);
          dex = true;
        }
      }
    } catch { /* change stays unknown */ }
  } finally {
    prices = data;
    refreshing = false;
    const priced = coins.filter((c) => data.get(c.mint)?.price != null).length;
    let source = 'live data unavailable';
    if (priced) {
      const parts = [];
      if (gecko) parts.push('GeckoTerminal');
      if (dex) parts.push('DexScreener');
      source = parts.length ? parts.join(' + ') : source;
    }
    const feed = $('#feed-source');
    if (feed) feed.textContent = source;
    renderLive();
  }
}

function seriesLean(series) {
  const chgs = [];
  let priced = 0;
  for (const ticker of series.tickers) {
    const coin = coinByTicker(ticker);
    if (!coin) continue;
    const row = prices.get(coin.mint);
    if (row?.price != null) priced += 1;
    if (row?.chg != null) chgs.push(row.chg);
  }
  const lean = chgs.length ? chgs.reduce((a, b) => a + b, 0) / chgs.length : null;
  return { priced, lean, n: chgs.length };
}

/* ---------------- clocks & live panes ---------------- */
function renderClocks() {
  const now = new Date();
  const et = zonedParts(now, TZ);
  $('#clock').textContent = formatET(now, true);
  const r15 = remainTo15(et);
  const r1h = remainToHour(et);
  const r1d = remainTo5pm(et);
  $('#bell-15').textContent = remainText(r15) + ' · ' + formatET(closeInstant(r15));
  $('#bell-1h').textContent = remainText(r1h) + ' · ' + formatET(closeInstant(r1h));
  $('#bell-1d').textContent = remainText(r1d) + ' · ' + formatET(closeInstant(r1d));

  const pump = pumpRound(pumpCadence, now);
  $('#pump-round-id').textContent = pump.id;
  $('#pump-remain').textContent = remainText(pump.remain);
  $('#pump-close').textContent = pump.close;

  const gvg = gvgRound(now);
  $('#gvg-round-id').textContent = gvg.id;
  $('#gvg-remain').textContent = remainText(gvg.remain);
  $('#gvg-close').textContent = gvg.close;

  const desk = deskRound(now);
  $('#desk-round-id').textContent = desk.id;
  $('#desk-remain').textContent = remainText(desk.remain);
  $('#desk-close').textContent = desk.close;

  const weather = weatherRound(now);
  $('#weather-day').textContent = weather.day;
  $('#weather-remain').textContent = remainText(weather.remain);
  $('#weather-close').textContent = formatPT(closeInstant(weather.remain)) + ' (' + weather.close + ')';

  const noun = nounRound(now);
  $('#noun-round-id').textContent = noun.id;
  $('#noun-remain').textContent = remainText(noun.remain);
  $('#noun-close').textContent = noun.close;
}

function renderPumpPair() {
  if (!coins.length) return;
  const now = new Date();
  const round = pumpRound(pumpCadence, now);
  const pair = pickPair(round.id);
  renderPair($('#pump-pair'), pair, 8);
  setPicks($('#pump-picks'), 'pump-pick', pair.map((c) => ({
    value: c.ticker,
    label: '$' + c.ticker + '  ' + c.name
  })));
  const existing = myEntry('pump', round.id);
  if (existing) {
    const input = $all('input[name="pump-pick"]').find((i) => i.value === existing.pick);
    if (input) input.checked = true;
    mountTicket($('#pump-ticket-stage'), existing, 'office-pools-pump.png');
  }
  $('#pump-status').textContent = pair.length === 2
    ? ('This heat: $' + pair[0].ticker + ' vs $' + pair[1].ticker + '. Unofficial 24h figures are a lean, not the official open/close.')
    : 'loading the pair…';
  // desk league uses the daily pump pair
  const daily = pumpRound('1d', now);
  const deskPair = pickPair(daily.id);
  renderPair($('#desk-pair'), deskPair, 8);
  setPicks($('#desk-picks'), 'desk-pick', deskPair.map((c) => ({
    value: c.ticker,
    label: '$' + c.ticker + '  ' + c.name
  })));
  $('#desk-status').textContent = deskPair.length === 2
    ? ('Today’s league pair is the daily Pump Pools heat: $' + deskPair[0].ticker + ' vs $' + deskPair[1].ticker + '.')
    : '';
  const deskExisting = myEntry('desk', deskRound(now).id);
  if (deskExisting) {
    const input = $all('input[name="desk-pick"]').find((i) => i.value === deskExisting.pick);
    if (input) input.checked = true;
    const team = $('#desk-team');
    if (team && deskExisting.team) team.value = deskExisting.team;
    mountTicket($('#desk-ticket-stage'), deskExisting, 'office-pools-desk.png');
  }
}

function renderGvgTable() {
  const body = $('#gvg-rows');
  body.replaceChildren();
  if (!seriesDoc) return;
  for (const s of seriesDoc.series) {
    const tr = document.createElement('tr');
    const lean = seriesLean(s);
    const name = el('td', '', s.label);
    const coinsTd = el('td', '', String(s.tickers.length));
    const priced = el('td', 'num', String(lean.priced));
    const leanTd = el('td', 'num');
    leanTd.textContent = lean.lean == null ? '—' : pct(lean.lean);
    if (lean.lean > 0) leanTd.classList.add('up');
    if (lean.lean < 0) leanTd.classList.add('down');
    // reuse .up/.down from coin prices — add to table cells via inline color already in CSS? .up is defined for .price. I'll set style if needed.
    if (lean.lean > 0) leanTd.style.color = '#185a56';
    if (lean.lean < 0) leanTd.style.color = '#8a2424';
    tr.append(name, coinsTd, priced, leanTd);
    body.append(tr);
  }
}

function renderLive() {
  renderPumpPair();
  renderGvgTable();
  renderBoards();
}

function renderBoards() {
  const now = new Date();
  const pump = pumpRound(pumpCadence, now);
  listLocal($('#pump-local'), 'pump', pump.id);
  listLocal($('#gvg-local'), 'gvg', gvgRound(now).id);
  listLocal($('#desk-local'), 'desk', deskRound(now).id);
  listLocal($('#weather-local'), 'weather', weatherRound(now).id);
  listLocal($('#noun-local'), 'noun', nounRound(now).id);

  if (example) {
    listExample($('#pump-leaders'), example.leaders, 'lead');
    listExample($('#gvg-leaders'), example.leaders, 'lead');
    const teams = example.teams.slice().sort((a, b) => (b.points ?? 0) - (a.points ?? 0)).map((t, i) => ({ ...t, rank: i + 1 }));
    listExample($('#desk-teams'), teams, 'team');
    const weatherEx = example.winners.filter((w) => w.fork === 'Weather Pools');
    listExample($('#weather-leaders'), weatherEx, 'feed');
    const nounEx = example.winners.filter((w) => w.fork === 'Noun Draw');
    listExample($('#noun-leaders'), nounEx, 'feed');
  }

  const feed = $('#winners-feed');
  feed.replaceChildren();
  const localWins = entries.filter((e) => e.won).map((e) => ({
    name: e.name,
    fork: e.forkLabel || e.fork,
    detail: e.pickLabel,
    when: 'this device',
    example: false
  }));
  const rows = [
    ...localWins,
    ...((example && example.winners) || [])
  ];
  if (!rows.length) {
    feed.append(el('li', 'empty', 'No tape yet.'));
    return;
  }
  for (const row of rows) {
    const li = el('li');
    li.className = 'feed';
    const mid = el('span', '');
    mid.append(document.createTextNode(row.name + ' · ' + row.fork + ' · ' + row.detail));
    if (row.example) mid.append(document.createTextNode(' '), el('span', 'example-tag', 'Example'));
    li.append(el('span', 'rank', '·'), mid, el('span', 'pts', row.when));
    feed.append(li);
  }
}

function renderHeads(filter) {
  const select = $('#head-pick');
  const q = (filter || '').trim().toLowerCase();
  const list = q ? heads.filter((h) => h.label.toLowerCase().includes(q) || h.id.toLowerCase().includes(q)) : heads;
  const current = select.value;
  select.replaceChildren();
  if (!list.length) {
    select.append(new Option('no heads match that filter', ''));
    return;
  }
  select.append(new Option('choose a head…', ''));
  for (const h of list) select.append(new Option(h.label, h.id));
  if (current && list.some((h) => h.id === current)) select.value = current;
}

function fillIdentityForm() {
  $('#desk-name').value = identity.name;
  $('#desk-wallet').value = identity.wallet;
  $('#identity-status').textContent = identity.name
    ? ('Clocked in as ' + identity.name + (identity.wallet ? ' · address on the ticket' : ' · no wallet tag') + '.')
    : 'Not clocked in yet.';
}

function setupIdentity() {
  $('#identity-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const nameErr = validateName($('#desk-name').value);
    const walletErr = validateWallet($('#desk-wallet').value);
    if (nameErr || walletErr) {
      $('#identity-status').textContent = nameErr || walletErr;
      return;
    }
    identity = { name: $('#desk-name').value.trim(), wallet: $('#desk-wallet').value.trim() };
    const ok = saveStore();
    $('#identity-status').textContent = ok
      ? ('Clocked in as ' + identity.name + '. Tickets will use this name.')
      : ('Clocked in as ' + identity.name + ' for this visit only; this browser would not save the name.');
  });
  $('#clock-out').addEventListener('click', () => {
    if (!confirm('Clear the desk name, wallet tag, and tickets saved on this device?')) return;
    identity = { name: '', wallet: '' };
    entries = [];
    try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
    fillIdentityForm();
    $all('.ticket-stage').forEach((n) => { n.hidden = true; n.replaceChildren(); });
    renderBoards();
  });
}

function setupPump() {
  for (const cadence of ['15m', '1h', '1d']) {
    $('#cadence-' + cadence).addEventListener('click', () => {
      pumpCadence = cadence;
      for (const c of ['15m', '1h', '1d']) {
        $('#cadence-' + c).setAttribute('aria-pressed', String(c === cadence));
      }
      renderClocks();
      renderPumpPair();
      renderBoards();
    });
  }
  $('#pump-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!requireIdentity()) return;
    const now = new Date();
    const round = pumpRound(pumpCadence, now);
    const pair = pickPair(round.id);
    const pick = new FormData(ev.target).get('pump-pick');
    const coin = pair.find((c) => c.ticker === pick);
    if (!coin) {
      $('#pump-form-status').textContent = 'Pick a coin for this heat.';
      return;
    }
    const other = pair.find((c) => c.ticker !== pick);
    const entry = makeEntry('pump', round.id, pick, '$' + pick + ' over $' + other.ticker, {
      forkLabel: 'Pump Pools',
      nounTicker: pick,
      cadence: pumpCadence
    });
    onTicket($('#pump-form-status'), $('#pump-ticket-stage'), entry, 'office-pools-pump.png');
  });
}

function setupGvg() {
  $('#gvg-formula').textContent = seriesDoc ? seriesDoc.formula : '';
  setPicks($('#gvg-picks'), 'gvg-pick', (seriesDoc?.series || []).map((s) => ({
    value: s.id,
    label: s.label + ' — ' + s.tickers.length + ' coins'
  })));
  const existing = myEntry('gvg', gvgRound(new Date()).id);
  if (existing) {
    const input = $all('input[name="gvg-pick"]').find((i) => i.value === existing.pick);
    if (input) input.checked = true;
    mountTicket($('#gvg-ticket-stage'), existing, 'office-pools-gvg.png');
  }
  $('#gvg-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!requireIdentity()) return;
    const pick = new FormData(ev.target).get('gvg-pick');
    const s = seriesOf(pick);
    if (!s) {
      $('#gvg-form-status').textContent = 'Pick a series.';
      return;
    }
    const entry = makeEntry('gvg', gvgRound(new Date()).id, pick, s.label, {
      forkLabel: 'Series GvG',
      nounTicker: s.tickers[0]
    });
    onTicket($('#gvg-form-status'), $('#gvg-ticket-stage'), entry, 'office-pools-gvg.png');
  });
}

function setupDesk() {
  $('#desk-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!requireIdentity()) return;
    const now = new Date();
    const round = deskRound(now);
    const pair = pickPair(pumpRound('1d', now).id);
    const pick = new FormData(ev.target).get('desk-pick');
    const team = $('#desk-team').value;
    const coin = pair.find((c) => c.ticker === pick);
    if (!coin) {
      $('#desk-form-status').textContent = 'Pick a coin for the league heat.';
      return;
    }
    const other = pair.find((c) => c.ticker !== pick);
    const teamLabel = $('#desk-team').selectedOptions[0]?.textContent || team;
    const entry = makeEntry('desk', round.id, pick, '$' + pick + ' over $' + other.ticker + ' · ' + teamLabel, {
      forkLabel: 'Desk League',
      nounTicker: pick,
      team
    });
    onTicket($('#desk-form-status'), $('#desk-ticket-stage'), entry, 'office-pools-desk.png');
  });
}

function setupWeather() {
  const existing = myEntry('weather', weatherRound(new Date()).id);
  if (existing) {
    const input = $all('input[name="weather"]').find((i) => i.value === existing.pick);
    if (input) input.checked = true;
    mountTicket($('#weather-ticket-stage'), existing, 'office-pools-weather.png');
  }
  $('#weather-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!requireIdentity()) return;
    const pick = new FormData(ev.target).get('weather');
    const label = pick === 'rain' ? 'rain in El Segundo' : 'no rain in El Segundo';
    const entry = makeEntry('weather', weatherRound(new Date()).id, pick, label, {
      forkLabel: 'Weather Pools',
      nounTicker: 'OCEANFRONT'
    });
    onTicket($('#weather-form-status'), $('#weather-ticket-stage'), entry, 'office-pools-weather.png');
  });
}

function setupNoun() {
  renderHeads('');
  $('#head-filter').addEventListener('input', (ev) => renderHeads(ev.target.value));
  const existing = myEntry('noun', nounRound(new Date()).id);
  if (existing) {
    renderHeads('');
    $('#head-pick').value = existing.pick;
    mountTicket($('#noun-ticket-stage'), existing, 'office-pools-noun.png');
  }
  $('#noun-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!requireIdentity()) return;
    const pick = $('#head-pick').value;
    const head = heads.find((h) => h.id === pick);
    if (!head) {
      $('#noun-form-status').textContent = 'Choose a head trait.';
      return;
    }
    const entry = makeEntry('noun', nounRound(new Date()).id, pick, 'head: ' + head.label, {
      forkLabel: 'Noun Draw',
      nounTicker: 'OFFICENOUN'
    });
    onTicket($('#noun-form-status'), $('#noun-ticket-stage'), entry, 'office-pools-noun.png');
  });
}

function previewFork(data) {
  const box = $('#fork-preview');
  box.replaceChildren();
  if (!data || typeof data !== 'object') {
    box.append(el('p', 'empty', 'That was not a rules object.'));
    return false;
  }
  const issues = [];
  if (data.freeToPlay !== true || data.entryFee !== 0 || data.pot || data.yield || data.deposits) {
    issues.push('A fork has to stay free to play: no entry fee, no pot, no yield, no deposits.');
  }
  const title = el('h3', '', data.name || 'untitled fork');
  const bits = el('p', 'note', [
    'format: ' + (data.format || '—'),
    'clock: ' + (data.clock?.round || '—') + ' ' + (data.clock?.timezone || ''),
    'prize: ' + (data.prize || '—')
  ].join(' · '));
  const disc = el('p', '', data.disclaimer || '');
  box.append(title, bits, disc);
  if (issues.length) {
    const warn = el('p', 'note', issues.join(' '));
    warn.style.color = '#8a2424';
    box.append(warn);
    return false;
  }
  box.append(el('p', '', 'This preview stays on this device. It is not published, and it is not a live pool.'));
  forkPreviewCache = data;
  return true;
}

function setupFork() {
  const pre = $('#fork-template');
  pre.textContent = JSON.stringify(forkTemplate, null, 2);
  $('#fork-json').placeholder = 'Paste a copy of the template, with your desk’s name and clock…';
  $('#fork-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    try {
      const data = JSON.parse($('#fork-json').value);
      const ok = previewFork(data);
      $('#fork-form-status').textContent = ok
        ? 'Preview updated. Still only on this device.'
        : 'Preview shown, but the rules do not meet the free-to-play bar.';
    } catch {
      $('#fork-form-status').textContent = 'That was not valid JSON.';
    }
  });
  $('#fork-reset').addEventListener('click', () => {
    $('#fork-json').value = '';
    forkPreviewCache = null;
    $('#fork-preview').replaceChildren(el('p', 'empty', 'No community fork in this prototype yet. The bed is empty until someone lays a rules sheet down.'));
    $('#fork-form-status').textContent = '';
  });
}

function exampleTicket() {
  return {
    fork: 'pump',
    forkLabel: 'Pump Pools',
    round: 'pump-15m-example',
    name: 'Sunday shift',
    wallet: '',
    pick: 'COFFEE',
    pickLabel: '$COFFEE over $STANDUP',
    nounTicker: 'COFFEE',
    example: true
  };
}

function setupShotMode() {
  const params = new URLSearchParams(location.search);
  if (params.get('shot') !== 'ticket') return false;
  document.body.classList.add('shot-ticket');
  const stage = $('#shot-ticket');
  stage.replaceChildren();
  const canvas = renderTicketCanvas(exampleTicket(), 2);
  canvas.style.width = '1080px';
  canvas.style.maxWidth = '100%';
  stage.append(canvas);
  return true;
}

async function init() {
  loadStore();
  fillIdentityForm();
  setupIdentity();

  try {
    const [coinsDoc, series, headsDoc, nounsDoc, exampleDoc, templateDoc] = await Promise.all([
      fetchJSON('./coins.json'),
      fetchJSON('./series.json'),
      fetchJSON('./heads.json'),
      fetchJSON('./nouns.json'),
      fetchJSON('./example-feed.json'),
      fetchJSON('./fork-template.json')
    ]);
    coins = coinsDoc.coins || [];
    seriesDoc = series;
    heads = headsDoc.heads || [];
    nouns = nounsDoc;
    example = exampleDoc;
    forkTemplate = templateDoc;
    $('#coin-count').textContent = String(coins.length);
  } catch (err) {
    $('#feed-source').textContent = 'list unavailable';
    $('#pump-status').textContent = 'The coin list could not be loaded. Try serving this folder over HTTP.';
  }

  try {
    await document.fonts.load('16px "IBM Plex Mono"');
    await document.fonts.load('600 16px "IBM Plex Mono"');
    await document.fonts.ready;
  } catch { /* system mono fallback */ }

  if (setupShotMode()) {
    document.documentElement.dataset.ready = '1';
    return;
  }

  setupPump();
  setupGvg();
  setupDesk();
  setupWeather();
  setupNoun();
  setupFork();
  renderClocks();
  renderLive();
  setInterval(renderClocks, 1000);
  await loadPrices();
  setInterval(loadPrices, 60000);
  document.documentElement.dataset.ready = '1';
}

init();
