'use strict';

const list = document.querySelector('#coins');
const statusLine = document.querySelector('#status');
const refreshButton = document.querySelector('#refresh');
let coins = [];
let refreshing = false;
const cards = new Map();

// Null and empty strings are unknown, never zero. Actual zero is valid data.
function number(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}
function money(value, price = false) {
  if (value === null) return '—';
  if (value === 0) return '$0';
  const options = price || value < 1
    ? { maximumSignificantDigits: 3 }
    : { maximumFractionDigits: 0 };
  return '$' + value.toLocaleString('en-US', options);
}
async function fetchJSON(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function createCard(coin) {
  const card = element('li', 'card');
  const identity = element('div', 'identity');
  const image = element('img', 'coin-art');
  image.src = coin.image;
  image.alt = coin.name;
  image.width = image.height = 80;
  image.loading = 'lazy';
  const heading = element('div');
  heading.append(element('h3', '', coin.name), element('p', 'ticker', '$' + coin.ticker), element('p', 'blurb', coin.blurb));
  identity.append(image, heading);
  const mintRow = element('div', 'mint-row');
  const mint = element('code', 'mint', coin.mint.slice(0, 4) + '…' + coin.mint.slice(-4));
  mint.title = coin.mint;
  mint.setAttribute('aria-label', 'Mint: ' + coin.mint);
  const copy = element('button', 'copy', 'Copy');
  copy.type = 'button';
  copy.setAttribute('aria-label', 'Copy ' + coin.ticker + ' mint');
  let copyTimer;
  copy.addEventListener('click', async () => {
    clearTimeout(copyTimer);
    try {
      await navigator.clipboard.writeText(coin.mint);
      copy.textContent = 'copied';
      copy.setAttribute('aria-label', coin.ticker + ' mint copied');
      copyTimer = setTimeout(() => {
        copy.textContent = 'Copy';
        copy.setAttribute('aria-label', 'Copy ' + coin.ticker + ' mint');
      }, 2000);
    } catch {
      mint.textContent = coin.mint;
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(mint);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      statusLine.textContent = 'clipboard unavailable — full mint shown and selected for manual copying.';
    }
  });
  mintRow.append(mint, copy);
  const metrics = element('dl');
  const fields = {};
  for (const [key, label] of [['cap', 'market cap'], ['price', 'price'], ['volume', '24h volume']]) {
    const row = element('div', 'metric');
    fields[key] = element('dd', '', '—');
    row.append(element('dt', '', label), fields[key]);
    metrics.append(row);
  }
  const buy = element('a', 'buy', 'Buy on pump.fun');
  buy.href = 'https://pump.fun/coin/' + encodeURIComponent(coin.mint);
  buy.target = '_blank';
  buy.rel = 'noopener noreferrer';
  const trade = element('button', '', 'Trade');
  trade.type = 'button';
  trade.setAttribute('aria-label', 'Trade ' + coin.ticker + ' vs SOL');
  trade.addEventListener('click', () => selectTrade(coin, true));
  const actions = element('div', 'card-actions');
  actions.append(trade, buy);
  card.append(identity, mintRow, metrics, actions);
  cards.set(coin.mint, { card, fields });
}
function render(data) {
  const sorted = [...coins].sort((a, b) => {
    const left = data.get(a.mint)?.cap ?? null;
    const right = data.get(b.mint)?.cap ?? null;
    if (left === null && right !== null) return 1;
    if (left !== null && right === null) return -1;
    return (right ?? 0) - (left ?? 0) || a.ticker.localeCompare(b.ticker, 'en');
  });
  for (const coin of sorted) {
    const { card, fields } = cards.get(coin.mint);
    const values = data.get(coin.mint) || {};
    for (const key of ['cap', 'price', 'volume']) {
      const value = values[key] ?? null;
      fields[key].textContent = money(value, key === 'price');
      fields[key].title = value === null ? 'unavailable' : '$' + value.toLocaleString('en-US', { maximumSignificantDigits: 15 });
    }
    if (values.estimated) {
      fields.cap.append(element('span', '', ' (est.)'));
      fields.cap.title += ' · estimated from price × normalized total supply';
    }
    // Move existing cards, preserving clipboard button listeners and state.
    list.append(card);
  }
}
async function refresh() {
  if (refreshing || !coins.length) return;
  refreshing = true;
  refreshButton.disabled = true;
  statusLine.textContent = 'checking live data…';
  const data = new Map();
  let gecko = false;
  let dex = false;
  let jupiter = false;
  const mints = coins.map(coin => coin.mint);
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
              volume: number(a.volume_usd?.h24),
              supply: number(a.normalized_total_supply)
            });
          }
          geckoBatches += 1;
        } catch {
          /* Try remaining batches; fall back only if every batch fails. */
        }
      }
      if (!geckoBatches) throw new Error('No token data');
      gecko = true;
    } catch {
      try {
        for (const batch of batches(mints, 30)) {
          const response = await fetchJSON('https://api.dexscreener.com/latest/dex/tokens/' + batch.join(','));
          if (!Array.isArray(response.pairs)) continue;
          const pairs = response.pairs.filter(pair => pair.chainId === 'solana')
            .sort((a, b) => (number(b.liquidity?.usd) ?? 0) - (number(a.liquidity?.usd) ?? 0));
          for (const pair of pairs) {
            const mint = pair.baseToken?.address;
            if (!coins.some(coin => coin.mint === mint) || data.has(mint)) continue;
            data.set(mint, {
              price: number(pair.priceUsd),
              cap: number(pair.marketCap) ?? number(pair.fdv),
              volume: number(pair.volume?.h24)
            });
          }
        }
        dex = data.size > 0;
        if (!dex) throw new Error('No pairs');
      } catch { /* Keep all cards even if both sources fail. */ }
    }
    const missing = coins.filter(coin => data.get(coin.mint)?.price == null);
    if (missing.length) {
      try {
        for (const batch of batches(missing, 100)) {
          const response = await fetchJSON('https://lite-api.jup.ag/price/v3?ids=' + batch.map(coin => coin.mint).join(','));
          for (const coin of batch) {
            const price = number(response[coin.mint]?.usdPrice);
            if (price === null) continue;
            const values = data.get(coin.mint) || {};
            values.price = price;
            if (values.cap == null && values.supply != null) {
              values.cap = number(price * values.supply);
              values.estimated = values.cap !== null;
            }
            data.set(coin.mint, values);
            jupiter = true;
          }
        }
      } catch { /* Unknown fields stay unknown. */ }
    }
    render(data);
    const available = coins.some(coin => {
      const values = data.get(coin.mint);
      return values && [values.price, values.cap, values.volume].some(value => value != null);
    });
    let source = 'live data unavailable';
    if (available) {
      if (gecko) source = jupiter ? 'GeckoTerminal + Jupiter' : 'live from GeckoTerminal';
      else if (dex) source = jupiter ? 'DexScreener + Jupiter' : 'live from DexScreener';
      else if (jupiter) source = 'live from Jupiter';
    }
    statusLine.textContent = source;
  } finally {
    refreshing = false;
    refreshButton.disabled = false;
  }
}
async function init() {
  refreshButton.disabled = true;
  try {
    const response = await fetchJSON('./coins.json');
    if (!Array.isArray(response.coins) || !response.coins.length) throw new Error('Missing coin list');
    coins = response.coins;
    const countWords = {17:'seventeen',32:'thirty-two',34:'thirty-four'};
    const countLabel = countWords[coins.length] || String(coins.length);
    const lede = document.querySelector('.lede');
    if (lede) lede.textContent = countLabel + ' coins from the same desk. live prices, a trade window vs SOL, and a small clock-in game. another day at the office.';
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', countLabel + ' coins from the same desk. live prices, a trade window vs SOL, and a small clock-in game.');
    coins.forEach(createCard);
    initDesk();
    initTrade();
    render(new Map());
    await refresh();
  } catch {
    statusLine.textContent = 'coin list unavailable — refresh to retry. serve this folder over HTTP.';
  } finally {
    refreshButton.disabled = false;
  }
}
refreshButton.addEventListener('click', () => coins.length ? refresh() : init());
init();

// The game never reads wallet or market data.
const DESK_KEY = 'officenoun-desk-v1';
let deskState = { hours: 0, memos: 0, unlocked: [], clicks: 0 };
let deskReady = false;
let storageAvailable = true;
const upgradeButtons = new Map();
function deskSnapshot() {
  return { hours: deskState.hours, memos: deskState.memos, unlocked: [...deskState.unlocked] };
}
function saveDesk() {
  try { localStorage.setItem(DESK_KEY, JSON.stringify(deskState)); }
  catch { storageAvailable = false; }
}
function renderDesk() {
  document.querySelector('#desk-counts').textContent = `${deskState.hours} hours · ${deskState.memos} memos`;
  document.querySelector('#desk-message').textContent = storageAvailable ? '' : 'device storage unavailable. this desk lasts for this visit only.';
  const items = document.querySelector('#desk-items');
  items.replaceChildren();
  for (const coin of coins) {
    const upgrade = upgradeButtons.get(coin.ticker);
    const unlocked = deskState.unlocked.includes(coin.ticker);
    upgrade.button.disabled = unlocked || deskState.hours < upgrade.cost;
    upgrade.button.textContent = unlocked ? `${coin.name} · on desk` : `${coin.name} · ${upgrade.cost} hours`;
    if (unlocked) {
      const art = element('img');
      art.src = coin.image;
      art.alt = coin.name;
      art.title = coin.name;
      art.width = art.height = 40;
      items.append(art);
    }
  }
}
function clockIn() {
  if (!deskReady) return deskSnapshot();
  deskState.hours += 1;
  deskState.clicks += 1;
  if (deskState.clicks % 5 === 0) deskState.memos += 1;
  saveDesk();
  renderDesk();
  return deskSnapshot();
}
function resetDesk() {
  if (!window.confirm('Reset this device’s desk hours, memos and cosmetic upgrades?')) return deskSnapshot();
  deskState = { hours: 0, memos: 0, unlocked: [], clicks: 0 };
  try { localStorage.removeItem(DESK_KEY); storageAvailable = true; }
  catch { storageAvailable = false; }
  renderDesk();
  return deskSnapshot();
}
function initDesk() {
  if (deskReady) return;
  try {
    const saved = JSON.parse(localStorage.getItem(DESK_KEY));
    if (saved && ['hours', 'memos', 'clicks'].every(key => Number.isSafeInteger(saved[key]) && saved[key] >= 0) && Array.isArray(saved.unlocked)) {
      deskState = { hours: saved.hours, memos: saved.memos, clicks: saved.clicks,
        unlocked: [...new Set(saved.unlocked.filter(ticker => coins.some(coin => coin.ticker === ticker)))] };
    }
  } catch {
    try { localStorage.getItem(DESK_KEY); } catch { storageAvailable = false; }
    // Malformed JSON starts a clean desk; blocked storage uses memory only.
  }
  const first = ['COFFEE', 'BADGE', 'INBOX', 'MUTE'];
  const ordered = [...first.map(ticker => coins.find(coin => coin.ticker === ticker)), ...coins.filter(coin => !first.includes(coin.ticker))];
  ordered.forEach((coin, index) => {
    const cost = 3 + index * 2 + Math.floor(index * index / 8);
    const button = element('button');
    button.type = 'button';
    button.addEventListener('click', () => {
      if (deskState.hours < cost || deskState.unlocked.includes(coin.ticker)) return;
      deskState.hours -= cost;
      deskState.unlocked.push(coin.ticker);
      saveDesk();
      renderDesk();
    });
    const item = element('li');
    item.append(button);
    document.querySelector('#upgrades').append(item);
    upgradeButtons.set(coin.ticker, { button, cost });
  });
  deskReady = true;
  document.querySelector('#clock-in').addEventListener('click', clockIn);
  document.querySelector('#desk-reset').addEventListener('click', resetDesk);
  window.OfficeNounDesk = Object.freeze({ state: deskSnapshot, clockIn, reset: resetDesk });
  renderDesk();
  if (new URLSearchParams(location.search).get('clockin') === '1') clockIn();
}

const SOL_MINT = 'So11111111111111111111111111111111111111112';
let selectedCoin;
let pluginInitialized = false;
let pluginTimer;
function mountPlugin(attempt = 0) {
  clearTimeout(pluginTimer);
  if (!selectedCoin) return;
  const message = document.querySelector('#trade-status');
  if (!window.Jupiter?.init) {
    if (attempt < 60) pluginTimer = setTimeout(() => mountPlugin(attempt + 1), 500);
    else message.textContent = `Jupiter Plugin unavailable. retry the widget or use pump.fun for $${selectedCoin.ticker}.`;
    return;
  }
  try {
    // Only close a widget this page has actually initialized.
    if (pluginInitialized) {
      if (typeof window.Jupiter.close !== 'function') {
        message.textContent = 'the widget cannot switch coins right now. reload this trade link or use pump.fun.';
        return;
      }
      window.Jupiter.close();
      pluginInitialized = false;
    }
    document.querySelector('#jupiter-plugin').replaceChildren();
    window.Jupiter.init({
      displayMode: 'integrated',
      integratedTargetId: 'jupiter-plugin',
      formProps: { initialInputMint: SOL_MINT, initialOutputMint: selectedCoin.mint, fixedMint: selectedCoin.mint }
    });
    pluginInitialized = true;
    message.textContent = `trading $${selectedCoin.ticker} vs SOL. connect your own wallet in the widget. we never hold funds or see your keys.`;
  } catch {
    message.textContent = 'Jupiter Plugin could not load. retry the widget or use pump.fun.';
  }
}
function selectTrade(coin, scroll = false) {
  selectedCoin = coin;
  document.querySelector('#trade-coin').value = coin.mint;
  const fallback = document.querySelector('#trade-pump');
  fallback.href = 'https://pump.fun/coin/' + encodeURIComponent(coin.mint);
  fallback.hidden = false;
  const url = new URL(location.href);
  url.searchParams.set('trade', coin.ticker);
  if (url.hash.startsWith('#trade=')) url.hash = '';
  history.replaceState(null, '', url);
  mountPlugin();
  if (scroll) document.querySelector('#trade').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}
function tradeFromLocation() {
  const value = new URLSearchParams(location.search).get('trade') || new URLSearchParams(location.hash.slice(1)).get('trade');
  return coins.find(coin => coin.mint === value || coin.ticker === value?.toUpperCase());
}
function initTrade() {
  const select = document.querySelector('#trade-coin');
  select.replaceChildren();
  for (const coin of coins) {
    const option = element('option', '', '$' + coin.ticker);
    option.value = coin.mint;
    select.append(option);
  }
  select.disabled = false;
  select.addEventListener('change', () => selectTrade(coins.find(coin => coin.mint === select.value)));
  document.querySelector('#trade-retry').addEventListener('click', () => mountPlugin());
  const linked = tradeFromLocation();
  selectTrade(linked || coins[0], Boolean(linked));
  window.addEventListener('hashchange', () => {
    const value = new URLSearchParams(location.hash.slice(1)).get('trade');
    const coin = coins.find(coin => coin.mint === value || coin.ticker === value?.toUpperCase());
    if (coin) selectTrade(coin, true);
  });
}
