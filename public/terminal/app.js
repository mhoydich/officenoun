'use strict';

const statusLine = document.querySelector('#status');
const refreshButton = document.querySelector('#refresh');
const rowsEl = document.querySelector('#rows');
const tapeInner = document.querySelector('#tape-inner');
const moversBox = document.querySelector('#movers-box');
let coins = [];
let nounData = null; // { palette: string[], nouns: { TICKER: { px, bg, ... } } }
let refreshing = false;
let lastPrices = new Map();
let featuredIndex = 0;
let featuredPinned = false;
let nounQueryPinned = false;
let lastMinuteKey = '';
const legoCache = new Map();

function number(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
function money(value, price = false) {
  if (value === null || value === undefined) return '—';
  if (value === 0) return '$0';
  const abs = Math.abs(value);
  const options = price || abs < 1
    ? { maximumSignificantDigits: 3 }
    : abs >= 100 ? { maximumFractionDigits: 0 } : { maximumFractionDigits: 2 };
  return '$' + value.toLocaleString('en-US', options);
}
function pct(value) {
  if (value === null || value === undefined) return '—';
  const sign = value > 0 ? '+' : '';
  return sign + value.toLocaleString('en-US', { maximumFractionDigits: 2 }) + '%';
}
function etClock(d) {
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit'
  }) + ' ET';
}
function etHourMinute(d) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour').value);
  const minute = Number(parts.find((p) => p.type === 'minute').value);
  return { hour, minute, key: hour + ':' + minute };
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
function venueOf(coin) {
  return coin.venue === 'meteora' ? 'Meteora' : 'pump.fun';
}
function tradeUrl(coin) {
  if (coin.tradeUrl) return coin.tradeUrl;
  if (coin.venue === 'meteora' && coin.meteoraUrl) return coin.meteoraUrl;
  return 'https://pump.fun/coin/' + encodeURIComponent(coin.mint);
}

/* ---------- LEGO mosaic renderer ---------- */

function hexToRgb(hex) {
  if (!hex || hex === '00000000') return null;
  const h = hex.replace('#', '');
  if (h.length < 6) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function cssRgb(rgb) {
  return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
}
function shade(rgb, delta) {
  return [
    Math.max(0, Math.min(255, rgb[0] + delta)),
    Math.max(0, Math.min(255, rgb[1] + delta)),
    Math.max(0, Math.min(255, rgb[2] + delta))
  ];
}
function decodePixels(ticker) {
  if (!nounData || !nounData.nouns[ticker]) return null;
  const rec = nounData.nouns[ticker];
  if (rec._decoded) return rec._decoded;
  const binary = atob(rec.px);
  const cells = new Array(1024);
  for (let i = 0; i < 1024; i++) {
    const idx = binary.charCodeAt(i);
    cells[i] = nounData.palette[idx] || '00000000';
  }
  rec._decoded = cells;
  return cells;
}
function pixelAt(cells, x, y) {
  if (x < 0 || y < 0 || x > 31 || y > 31) return null;
  return hexToRgb(cells[y * 32 + x]);
}
function contentBounds(cells, bgHex, headOnly) {
  const bg = (bgHex || '').toLowerCase();
  let minX = 32, minY = 32, maxX = -1, maxY = -1;
  const yMax = headOnly ? 22 : 31;
  for (let y = 0; y <= yMax; y++) {
    for (let x = 0; x < 32; x++) {
      const c = cells[y * 32 + x];
      if (!c || c === '00000000') continue;
      if (c.toLowerCase() === bg) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { x: 4, y: 2, w: 24, h: 20 };
  const pad = 1;
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  const x2 = Math.min(31, maxX + pad);
  const y2 = Math.min(headOnly ? 22 : 31, maxY + pad);
  return { x, y, w: x2 - x + 1, h: y2 - y + 1 };
}

function drawStud(ctx, cx, cy, r, rgb) {
  if (r < 1.1) {
    ctx.fillStyle = cssRgb(shade(rgb, 70));
    ctx.fillRect(Math.round(cx - 0.5), Math.round(cy - 0.5), 1, 1);
    return;
  }
  const light = shade(rgb, 78);
  const mid = shade(rgb, 18);
  const dark = shade(rgb, -70);
  const gradient = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.38, r * 0.05, cx + r * 0.08, cy + r * 0.2, r);
  gradient.addColorStop(0, cssRgb(light));
  gradient.addColorStop(0.4, cssRgb(mid));
  gradient.addColorStop(1, cssRgb(dark));
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = cssRgb(shade(rgb, -90));
  ctx.lineWidth = Math.max(0.6, r * 0.1);
  ctx.stroke();
  // raised rim of the stud (tube)
  if (r >= 2.2) {
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.04, r * 0.45, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = Math.max(0.5, r * 0.08);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - r * 0.06, cy - r * 0.06, r * 0.45, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = Math.max(0.4, r * 0.06);
    ctx.stroke();
  }
  // specular highlight
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.3, cy - r * 0.34, r * 0.3, r * 0.18, -0.55, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
}

function drawBrick(ctx, x, y, size, rgb, quality) {
  if (!rgb) return;
  const lip = quality === 'tiny' ? 0 : Math.max(1, Math.round(size * (size >= 10 ? 0.14 : 0.16)));
  const topW = size - lip;
  const topH = size - lip;

  if (lip > 0) {
    ctx.fillStyle = cssRgb(shade(rgb, -58));
    ctx.fillRect(x + topW, y, lip, size);
    ctx.fillStyle = cssRgb(shade(rgb, -82));
    ctx.fillRect(x, y + topH, size, lip);
    // tiny bevel on the top-right corner of the side
    ctx.fillStyle = cssRgb(shade(rgb, -40));
    ctx.fillRect(x + topW, y, lip, Math.max(1, Math.round(lip * 0.45)));
  }

  const gradient = ctx.createLinearGradient(x, y, x, y + topH);
  gradient.addColorStop(0, cssRgb(shade(rgb, 36)));
  gradient.addColorStop(0.28, cssRgb(shade(rgb, 10)));
  gradient.addColorStop(1, cssRgb(shade(rgb, -22)));
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, topW, topH);

  if (quality !== 'tiny') {
    const highlightH = Math.max(1, Math.round(size * 0.07));
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x, y, topW, highlightH);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(x, y + topH - 1, topW, 1);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x, y, Math.max(1, Math.floor(size * 0.45)), 1);
  }

  const face = Math.min(topW, topH);
  if (quality === 'tiny') return;
  if (face >= 3) {
    const studR = face * (size >= 12 ? 0.27 : 0.24);
    drawStud(ctx, x + topW / 2, y + topH * 0.46, studR, rgb);
  }
}

function renderNounCanvas(ticker, brickSize, mode) {
  const cells = decodePixels(ticker);
  const rec = nounData && nounData.nouns[ticker];
  const canvas = document.createElement('canvas');
  if (!cells || !rec) {
    canvas.width = 32 * brickSize;
    canvas.height = 32 * brickSize;
    return canvas;
  }
  const quality = brickSize <= 2 ? 'tiny' : brickSize <= 4 ? 'small' : 'full';
  let sx = 0, sy = 0, sw = 32, sh = 32;
  if (mode === 'head') {
    const b = contentBounds(cells, rec.bg, true);
    sx = b.x; sy = b.y; sw = b.w; sh = b.h;
  }
  canvas.width = sw * brickSize;
  canvas.height = sh * brickSize;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const rgb = pixelAt(cells, sx + x, sy + y);
      if (!rgb) continue;
      drawBrick(ctx, x * brickSize, y * brickSize, brickSize, rgb, quality);
    }
  }
  return canvas;
}

function renderFeaturedCanvas(ticker, brickSize, pad) {
  const cells = decodePixels(ticker);
  const rec = nounData && nounData.nouns[ticker];
  const inner = 32 * brickSize;
  const border = (pad || 0) * brickSize;
  const canvas = document.createElement('canvas');
  canvas.width = inner + border * 2;
  canvas.height = inner + border * 2;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const plate = [28, 28, 30];
  const quality = 'full';
  for (let y = 0; y < 32 + (pad || 0) * 2; y++) {
    for (let x = 0; x < 32 + (pad || 0) * 2; x++) {
      const edge = x < (pad || 0) || y < (pad || 0) || x >= 32 + (pad || 0) || y >= 32 + (pad || 0);
      const rgb = edge
        ? shade(plate, ((x + y) % 3 === 0 ? -8 : 6))
        : (cells ? pixelAt(cells, x - (pad || 0), y - (pad || 0)) : plate);
      if (!rgb) continue;
      drawBrick(ctx, x * brickSize, y * brickSize, brickSize, rgb, quality);
    }
  }
  return canvas;
}

function getLego(ticker, brickSize, mode) {
  const key = ticker + ':' + brickSize + ':' + (mode || 'full');
  let canvas = legoCache.get(key);
  if (!canvas) {
    canvas = mode === 'featured'
      ? renderFeaturedCanvas(ticker, brickSize, 1)
      : renderNounCanvas(ticker, brickSize, mode);
    legoCache.set(key, canvas);
  }
  return canvas;
}

function legoImage(ticker, brickSize, mode, className) {
  const src = getLego(ticker, brickSize, mode);
  const img = document.createElement('img');
  img.src = src.toDataURL();
  img.width = src.width;
  img.height = src.height;
  img.alt = ticker + ' as a LEGO Noun';
  img.decoding = 'async';
  img.className = className || 'lego';
  img.draggable = false;
  return img;
}

function blit(target, source) {
  if (target.width !== source.width || target.height !== source.height) {
    target.width = source.width;
    target.height = source.height;
  }
  const ctx = target.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(source, 0, 0);
}

function traitLine(coin) {
  const rec = nounData && nounData.nouns[coin.ticker];
  if (!rec) return '';
  const traits = rec.traits || coin.nounTraits || {};
  const bits = [];
  if (rec.nounId != null) bits.push('official Noun ' + rec.nounId);
  const labels = ['head', 'accessory', 'body', 'glasses'];
  const pretty = labels
    .map((k) => traits[k])
    .filter((v) => v && !String(v).startsWith('documented'))
    .map((v) => String(v).replace(/^(head|accessory|body|glasses)-/, ''));
  if (pretty.length) bits.push(pretty.join(' · '));
  return bits.join(' — ');
}

function paintFeatured(coin) {
  const canvas = document.querySelector('#featured-canvas');
  const rec = nounData && nounData.nouns[coin.ticker];
  if (canvas && rec) blit(canvas, getLego(coin.ticker, 12, 'featured'));
  const tickerEl = document.querySelector('#featured-ticker');
  const nameEl = document.querySelector('#featured-name');
  const traitsEl = document.querySelector('#featured-traits');
  const noteEl = document.querySelector('#featured-note');
  const linkEl = document.querySelector('#featured-link');
  if (tickerEl) tickerEl.textContent = '$' + coin.ticker;
  if (nameEl) nameEl.textContent = coin.name || coin.ticker;
  if (traitsEl) traitsEl.textContent = traitLine(coin) || 'pixel LEGO mosaic';
  if (noteEl) {
    noteEl.textContent = rec && rec.officialParts
      ? 'each pixel is a brick with a raised stud. official CC0 Noun parts. not a fund. no promises.'
      : (rec ? rec.source + ' · not a fund. no promises.' : '');
  }
  if (linkEl) {
    linkEl.replaceChildren();
    const a = document.createElement('a');
    a.href = tradeUrl(coin);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'open $' + coin.ticker;
    linkEl.append(a);
  }
}

function minuteIndex() {
  if (!coins.length) return 0;
  const { hour, minute } = etHourMinute(new Date());
  return (hour * 60 + minute) % coins.length;
}

function showFeatured(index) {
  if (!coins.length) return;
  featuredIndex = ((index % coins.length) + coins.length) % coins.length;
  paintFeatured(coins[featuredIndex]);
}

function drawBrickWall() {
  const canvas = document.querySelector('#brick-wall');
  if (!canvas || !coins.length || !nounData) return;
  const width = 1440;
  const height = 126;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0a0a08';
  ctx.fillRect(0, 0, width, height);

  // running-bond charcoal brick wall
  const wb = 14;
  for (let row = 0, y = 0; y < height + wb; row++, y += wb) {
    const odd = row % 2;
    const x0 = odd ? -Math.round(wb / 2) : 0;
    for (let x = x0; x < width + wb; x += wb) {
      const jitter = ((row * 13 + Math.floor((x + wb) / wb) * 7) % 5) - 2;
      const tone = 38 + jitter * 4;
      drawBrick(ctx, x, y, wb, [tone, tone - 4, 28], 'small');
    }
  }

  const brick = 3;
  const nounW = 32 * brick;
  const count = 12;
  const deskH = 5 * brick;
  const gap = (width - count * nounW) / (count + 1);
  const nounY = 12;
  const pick = [];
  for (let i = 0; i < count; i++) pick.push(coins[Math.floor(i * coins.length / count)]);

  pick.forEach((coin, i) => {
    const x = Math.round(gap + i * (nounW + gap));
    const src = getLego(coin.ticker, brick, 'full');
    ctx.drawImage(src, x, nounY);
    // wooden desk covering the legs
    const deskY = nounY + nounW - 8 * brick;
    const deskX = x - brick;
    const deskBricksX = 34;
    const wood = [156, 102, 36];
    const top = [196, 140, 48];
    for (let dy = 0; dy < 5; dy++) {
      for (let dx = 0; dx < deskBricksX; dx++) {
        const color = dy === 0 ? top : shade(wood, dy === 1 ? -10 : -28);
        drawBrick(ctx, deskX + dx * brick, deskY + dy * brick, brick, color, 'small');
      }
    }
    // tiny keyboard strip + lamp
    const keyY = deskY + brick;
    for (let dx = 8; dx < 26; dx++) {
      drawBrick(ctx, deskX + dx * brick, keyY, brick, [24, 24, 26], 'tiny');
    }
    drawBrick(ctx, deskX + 28 * brick, deskY - brick, brick, [80, 200, 90], 'small');
  });

  const barY = nounY + nounW - 8 * brick + deskH + 3;
  ctx.fillStyle = 'rgba(5,5,5,0.92)';
  ctx.fillRect(0, barY, width, height - barY);
  ctx.fillStyle = '#ffbf00';
  ctx.font = '700 11px "IBM Plex Mono", ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  pick.forEach((coin, i) => {
    const x = Math.round(gap + i * (nounW + gap));
    ctx.fillText('$' + coin.ticker, x + nounW / 2, barY + (height - barY) / 2);
  });
}

/* ---------- market UI ---------- */

function render(data) {
  lastPrices = data;
  const decorated = coins.map((coin) => {
    const values = data.get(coin.mint) || {};
    return { coin, ...values };
  }).sort((a, b) => (b.cap ?? -1) - (a.cap ?? -1));

  rowsEl.replaceChildren();
  for (const row of decorated) {
    const tr = document.createElement('tr');
    const chg = row.chg;
    const chgClass = chg == null ? '' : chg > 0 ? 'up' : chg < 0 ? 'down' : '';

    const nounCell = document.createElement('td');
    nounCell.className = 'noun-cell';
    if (nounData && nounData.nouns[row.coin.ticker]) {
      nounCell.append(legoImage(row.coin.ticker, 2, 'full', 'row-noun'));
    }

    const ticker = document.createElement('td');
    ticker.className = 'ticker';
    const a = document.createElement('a');
    a.href = tradeUrl(row.coin);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = '$' + row.coin.ticker;
    ticker.append(a);
    const venue = document.createElement('td');
    venue.textContent = venueOf(row.coin);
    const price = document.createElement('td');
    price.className = 'num';
    price.textContent = money(row.price ?? null, true);
    const cap = document.createElement('td');
    cap.className = 'num';
    cap.textContent = money(row.cap ?? null);
    const vol = document.createElement('td');
    vol.className = 'num';
    vol.textContent = money(row.volume ?? null);
    const change = document.createElement('td');
    change.className = 'num ' + chgClass;
    change.textContent = pct(chg ?? null);
    const mint = document.createElement('td');
    mint.className = 'mint';
    mint.title = row.coin.mint;
    mint.textContent = row.coin.mint.slice(0, 4) + '…' + row.coin.mint.slice(-4);
    tr.append(nounCell, ticker, venue, price, cap, vol, change, mint);
    rowsEl.append(tr);
  }

  const priced = decorated.filter((r) => r.price != null).length;
  document.querySelector('#priced-count').textContent = String(priced) + '/' + coins.length;
  document.querySelector('#coin-count').textContent = String(coins.length);
  const vols = decorated.map((r) => r.volume).filter((v) => v != null);
  const volSum = vols.length ? vols.reduce((a, b) => a + b, 0) : null;
  document.querySelector('#total-vol').textContent = vols.length ? money(volSum) : '—';

  // tape with tiny brick heads, duplicated so the loop is seamless
  tapeInner.replaceChildren();
  const makeItems = () => {
    const frag = document.createDocumentFragment();
    for (const r of decorated) {
      const item = document.createElement('span');
      item.className = 'tape-item';
      if (nounData && nounData.nouns[r.coin.ticker]) {
        item.append(legoImage(r.coin.ticker, 3, 'head', 'tape-noun'));
      }
      const text = document.createElement('span');
      const chg = r.chg;
      const flag = chg == null ? '' : chg > 0 ? ' ▲' + pct(chg) : chg < 0 ? ' ▼' + pct(chg) : '';
      text.textContent = '$' + r.coin.ticker + ' ' + money(r.price ?? null, true) + flag;
      if (chg != null) text.className = chg > 0 ? 'up' : chg < 0 ? 'down' : '';
      item.append(text);
      frag.append(item);
    }
    const close = document.createElement('span');
    close.className = 'tape-item';
    close.textContent = 'not a fund. no promises.';
    frag.append(close);
    return frag;
  };
  tapeInner.append(makeItems(), makeItems());

  const withChg = decorated.filter((r) => r.chg != null).sort((a, b) => b.chg - a.chg);
  if (!withChg.length) {
    moversBox.replaceChildren();
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = '24h change unavailable for this snapshot.';
    moversBox.append(p);
  } else {
    const up = withChg.filter((r) => r.chg > 0).slice(0, 5);
    const down = withChg.filter((r) => r.chg < 0).slice(-5).reverse();
    const col = (title, list, cls) => {
      const wrap = document.createElement('div');
      const h = document.createElement('h3');
      h.textContent = title;
      const ul = document.createElement('ul');
      if (!list.length) {
        const li = document.createElement('li');
        li.className = 'muted';
        li.textContent = 'none in this feed';
        ul.append(li);
      }
      for (const r of list) {
        const li = document.createElement('li');
        const who = document.createElement('span');
        who.className = 'who';
        if (nounData && nounData.nouns[r.coin.ticker]) {
          who.append(legoImage(r.coin.ticker, 2, 'full', 'mover-noun'));
        }
        const name = document.createElement('span');
        name.textContent = '$' + r.coin.ticker;
        who.append(name);
        const val = document.createElement('span');
        val.className = cls;
        val.textContent = pct(r.chg);
        li.append(who, val);
        ul.append(li);
      }
      wrap.append(h, ul);
      return wrap;
    };
    moversBox.replaceChildren(col('UP', up, 'up'), col('DOWN', down, 'down'));
  }
}

async function loadPrices() {
  if (refreshing) return;
  refreshing = true;
  if (refreshButton) refreshButton.disabled = true;
  const data = new Map();
  let gecko = false;
  let dex = false;
  let jupiter = false;
  const mints = coins.map((coin) => coin.mint);
  try {
    try {
      let geckoBatches = 0;
      for (const batch of batches(mints, 30)) {
        try {
          const response = await fetchJSON('https://api.geckoterminal.com/api/v2/networks/solana/tokens/multi/' + batch.join(','));
          if (!Array.isArray(response.data) || !response.data.length) throw new Error('No token data');
          for (const token of response.data) {
            const a = token.attributes;
            if (!a?.address) continue;
            data.set(a.address, {
              price: number(a.price_usd),
              cap: number(a.market_cap_usd) ?? number(a.fdv_usd),
              volume: number(a.volume_usd?.h24)
            });
          }
          geckoBatches += 1;
        } catch {
          /* try remaining batches */
        }
      }
      if (!geckoBatches) throw new Error('No token data');
      gecko = true;
    } catch {
      try {
        for (const batch of batches(mints, 30)) {
          const response = await fetchJSON('https://api.dexscreener.com/latest/dex/tokens/' + batch.join(','));
          if (!Array.isArray(response.pairs)) continue;
          const pairs = response.pairs.filter((pair) => pair.chainId === 'solana')
            .sort((a, b) => (number(b.liquidity?.usd) ?? 0) - (number(a.liquidity?.usd) ?? 0));
          for (const pair of pairs) {
            const mint = pair.baseToken?.address;
            if (!coins.some((coin) => coin.mint === mint) || data.has(mint)) continue;
            data.set(mint, {
              price: number(pair.priceUsd),
              cap: number(pair.marketCap) ?? number(pair.fdv),
              volume: number(pair.volume?.h24),
              chg: number(pair.priceChange?.h24)
            });
          }
        }
        dex = data.size > 0;
        if (!dex) throw new Error('No pairs');
      } catch { /* keep the table even if both sources fail */ }
    }
    try {
      for (const batch of batches(mints, 25)) {
        const response = await fetchJSON('https://api.dexscreener.com/latest/dex/tokens/' + batch.join(','));
        if (!Array.isArray(response.pairs)) continue;
        const best = new Map();
        for (const pair of response.pairs) {
          if (pair.chainId !== 'solana') continue;
          const mint = pair.baseToken?.address;
          if (!coins.some((coin) => coin.mint === mint)) continue;
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
    } catch { /* change stays unavailable */ }

    const missing = coins.filter((coin) => data.get(coin.mint)?.price == null);
    if (missing.length) {
      try {
        for (const batch of batches(missing, 100)) {
          const response = await fetchJSON('https://lite-api.jup.ag/price/v3?ids=' + batch.map((coin) => coin.mint).join(','));
          for (const coin of batch) {
            const price = number(response[coin.mint]?.usdPrice);
            if (price === null) continue;
            const values = data.get(coin.mint) || {};
            values.price = price;
            data.set(coin.mint, values);
            jupiter = true;
          }
        }
      } catch { /* unknown fields stay unknown */ }
    }

    render(data);
    const available = coins.some((coin) => {
      const values = data.get(coin.mint);
      return values && [values.price, values.cap, values.volume].some((value) => value != null);
    });
    let source = 'live data unavailable';
    if (available) {
      const parts = [];
      if (gecko) parts.push('GeckoTerminal');
      if (dex) parts.push('DexScreener');
      if (jupiter) parts.push('Jupiter');
      source = parts.length ? 'live from ' + parts.join(' + ') : 'live data unavailable';
    }
    if (statusLine) statusLine.textContent = source;
    const feed = document.querySelector('#feed-source');
    if (feed) feed.textContent = source.replace('live from ', '');
  } catch (err) {
    if (statusLine) statusLine.textContent = 'live data unavailable';
    const feed = document.querySelector('#feed-source');
    if (feed) feed.textContent = 'unavailable';
    render(data);
  } finally {
    refreshing = false;
    if (refreshButton) refreshButton.disabled = false;
  }
}

function tickClock() {
  const clock = document.querySelector('#clock');
  if (clock) clock.textContent = etClock(new Date());
  const { key } = etHourMinute(new Date());
  if (key !== lastMinuteKey) {
    lastMinuteKey = key;
    featuredPinned = false;
    if (coins.length && !nounQueryPinned) showFeatured(minuteIndex());
  }
}

function queryParam(name) {
  return new URLSearchParams(location.search).get(name);
}

function showCloseup(ticker) {
  document.body.className = 'closeup';
  document.body.replaceChildren();
  const frame = document.createElement('div');
  frame.className = 'closeup-frame';
  const canvas = document.createElement('canvas');
  const src = getLego(ticker, 24, 'featured');
  blit(canvas, src);
  const cap = document.createElement('p');
  const coin = coins.find((c) => c.ticker === ticker);
  cap.textContent = '$' + ticker + (coin ? ' · ' + coin.name : '') + ' · pixel LEGO · official CC0 Noun parts';
  frame.append(canvas, cap);
  document.body.append(frame);
  document.title = '$' + ticker + ' LEGO Noun';
}

async function init() {
  tickClock();
  setInterval(tickClock, 1000);
  if (queryParam('still') === '1') document.body.classList.add('still');
  const closeup = queryParam('closeup');
  const requested = (queryParam('noun') || (closeup && closeup !== '1' ? closeup : '') || '').toUpperCase();

  try {
    const [payload, nouns] = await Promise.all([
      fetchJSON('./coins.json'),
      fetchJSON('./nouns.json').catch(() => null)
    ]);
    coins = Array.isArray(payload.coins) ? payload.coins : [];
    nounData = nouns && nouns.nouns ? nouns : null;
    const countEl = document.querySelector('#coin-count');
    if (countEl) countEl.textContent = String(coins.length);

    if (closeup) {
      const ticker = requested && coins.some((c) => c.ticker === requested)
        ? requested
        : (coins.find((c) => c.ticker === 'TEAMOO') || coins[0]).ticker;
      showCloseup(ticker);
      document.body.dataset.ready = '1';
      return;
    }

    if (nounData) {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      drawBrickWall();
      const start = requested ? coins.findIndex((c) => c.ticker === requested) : -1;
      if (start >= 0) {
        nounQueryPinned = true;
        showFeatured(start);
      } else {
        showFeatured(minuteIndex());
      }
      lastMinuteKey = etHourMinute(new Date()).key;
      const btn = document.querySelector('#featured-btn');
      if (btn) {
        btn.addEventListener('click', () => {
          featuredPinned = true;
          showFeatured(featuredIndex + 1);
        });
      }
    }

    if (statusLine) statusLine.textContent = 'loaded ' + coins.length + ' coins · fetching prices…';
    if (refreshButton) refreshButton.addEventListener('click', loadPrices);
    await loadPrices();
    setInterval(loadPrices, 60000);
    document.body.dataset.ready = '1';
  } catch {
    if (statusLine) statusLine.textContent = 'coin list unavailable';
    const feed = document.querySelector('#feed-source');
    if (feed) feed.textContent = 'unavailable';
    document.body.dataset.ready = '1';
  }
}
init();
