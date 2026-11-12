/* tezos desk kit. CC0. one classic script, no dependencies.
   <div data-tezos-desk data-wallet="tz1..."></div>
   token names and urls are untrusted: everything is built with createElement and
   textContent, and urls are only used after they parse as https:. */
(function () {
  "use strict";

  var VERSION = "1.0.0";
  var ADDRESS = /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/;
  var CONTRACT = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
  var DEFAULT_API = "https://api.tzkt.io";
  var NAME_MAX = 80;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.setAttribute("class", className);
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  // returns a normalised https: url string, or "" if it is not one.
  function safeHttps(value) {
    if (typeof value !== "string" || !value) return "";
    try {
      var url = new URL(value);
      return url.protocol === "https:" ? url.href : "";
    } catch (error) {
      return "";
    }
  }

  // ipfs://{cid}[/path] only. the result must parse to https://ipfs.io/ipfs/...
  function ipfsUrl(uri) {
    var match = /^ipfs:\/\/([A-Za-z0-9]{46,100})((?:\/[^?#]*)?)$/.exec(uri);
    if (!match) return "";
    var path = match[2];
    if (path && (/\.\./.test(path) || /%2e/i.test(path) || /@/.test(path) || /\\/.test(path) || /\/\//.test(path))) return "";
    try {
      var url = new URL("https://ipfs.io/ipfs/" + match[1] + path);
      if (url.protocol !== "https:" || url.hostname !== "ipfs.io" || url.pathname.indexOf("/ipfs/") !== 0) return "";
      return url.href;
    } catch (error) {
      return "";
    }
  }

  function resolveImage(value, ipfsOnly) {
    if (typeof value !== "string") return "";
    var uri = value.trim();
    if (/^ipfs:/i.test(uri)) return ipfsUrl(uri);
    return ipfsOnly ? "" : safeHttps(uri);
  }

  function cleanName(value) {
    var text = typeof value === "string" ? value : "";
    text = text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    if (!text) return "untitled";
    return text.length > NAME_MAX ? text.slice(0, NAME_MAX - 1) + "…" : text;
  }

  var MAX_COUNT = 1e9;
  var MAX_TEZ = 1e12;

  // returns a finite number in [0, max), or null.
  function bounded(value, max) {
    if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
    var n = Number(value);
    return Number.isFinite(n) && n >= 0 && n < max ? n : null;
  }

  function toCount(value) {
    var n = bounded(value, MAX_COUNT);
    return n === null ? null : Math.floor(n);
  }

  function shortAddress(address) {
    return address.slice(0, 6) + "…" + address.slice(-4);
  }

  function formatTime(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return "an unknown time";
    return date.toISOString().slice(0, 16).replace("T", " ") + " utc";
  }

  function formatNumber(n) {
    if (n === null || n === undefined) return "\u2014";
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function clampLimit(value) {
    var n = parseInt(value, 10);
    if (!isFinite(n)) n = 12;
    return Math.min(48, Math.max(1, n));
  }

  // accepts a snapshot-shaped object; returns a clean copy or null.
  function normaliseSnapshot(raw, wallet) {
    if (!raw || typeof raw !== "object" || raw.wallet !== wallet) return null;
    var tokens = Array.isArray(raw.tokens) ? raw.tokens : [];
    return {
      wallet: wallet,
      at: typeof raw.at === "string" ? raw.at : "",
      balanceTez: bounded(raw.balanceTez, MAX_TEZ),
      published: toCount(raw.published),
      held: toCount(raw.held),
      transactions: toCount(raw.transactions),
      tokens: tokens.filter(function (t) { return t && typeof t === "object"; }).map(function (t) {
        return {
          contract: typeof t.contract === "string" ? t.contract : "",
          tokenId: t.tokenId === undefined || t.tokenId === null ? "" : String(t.tokenId),
          name: typeof t.name === "string" ? t.name : "",
          supply: toCount(t.supply),
          holders: toCount(t.holders),
          firstTime: typeof t.firstTime === "string" ? t.firstTime : "",
          image: typeof t.image === "string" ? t.image : ""
        };
      })
    };
  }

  function pickImage(meta, ipfsOnly) {
    if (!meta || typeof meta !== "object") return "";
    var keys = ["displayUri", "thumbnailUri", "artifactUri", "image"];
    for (var i = 0; i < keys.length; i++) {
      var found = resolveImage(meta[keys[i]], ipfsOnly);
      if (found) return typeof meta[keys[i]] === "string" ? meta[keys[i]] : "";
    }
    return "";
  }

  var TIMEOUT_MS = 15000;

  function getJson(url, signal) {
    var options = signal ? { signal: signal } : undefined;
    return fetch(url, options).then(function (response) {
      if (!response || !response.ok) throw new Error("bad response");
      return response.json();
    });
  }

  // all three requests share one 15 s budget. on timeout the requests are aborted and this rejects,
  // which the caller treats exactly like any other failure.
  function fetchLive(api, wallet, limit, ipfsOnly) {
    var base = api + "/v1";
    var select = "contract,tokenId,totalSupply,holdersCount,firstTime,metadata";
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var signal = controller ? controller.signal : null;
    var timer;
    var timeout = new Promise(function (resolve, reject) {
      timer = setTimeout(function () {
        if (controller) { try { controller.abort(); } catch (error) { /* ignore */ } }
        reject(new Error("timeout"));
      }, TIMEOUT_MS);
    });
    var work = Promise.all([
      getJson(base + "/accounts/" + wallet, signal),
      getJson(base + "/tokens/count?firstMinter=" + wallet, signal),
      getJson(base + "/tokens?firstMinter=" + wallet + "&sort.desc=firstTime&limit=" + limit + "&select=" + select, signal)
    ]);
    work.then(function () { clearTimeout(timer); }, function () { clearTimeout(timer); });
    return Promise.race([work, timeout]).then(function (parts) {
      var account = parts[0] || {};
      var list = Array.isArray(parts[2]) ? parts[2] : [];
      return normaliseSnapshot({
        wallet: wallet,
        at: new Date().toISOString(),
        balanceTez: Number(account.balance) / 1e6,
        published: parts[1],
        held: account.activeTokensCount,
        transactions: account.numTransactions,
        tokens: list.map(function (t) {
          var meta = t && t.metadata && typeof t.metadata === "object" ? t.metadata : {};
          var contract = t && t.contract;
          if (contract && typeof contract === "object") contract = contract.address;
          return {
            contract: typeof contract === "string" ? contract : "",
            tokenId: t && t.tokenId,
            name: meta.name,
            supply: t && t.totalSupply,
            holders: t && t.holdersCount,
            firstTime: t && t.firstTime,
            image: pickImage(meta, ipfsOnly)
          };
        })
      }, wallet);
    });
  }

  function externalLink(href, className) {
    var a = el("a", className);
    a.setAttribute("href", href);
    a.setAttribute("rel", "noopener noreferrer");
    return a;
  }

  function stat(label, value) {
    var wrap = el("div", "td-stat");
    wrap.appendChild(el("dt", "td-stat-label", label));
    wrap.appendChild(el("dd", "td-stat-value", value));
    return wrap;
  }

  function card(token, ipfsOnly) {
    var linkable = CONTRACT.test(token.contract) && /^\d{1,20}$/.test(token.tokenId);
    var href = linkable ? safeHttps("https://objkt.com/tokens/" + token.contract + "/" + token.tokenId) : "";
    var item = el("li", "td-item");
    var box = href ? externalLink(href, "td-card") : el("div", "td-card");
    box.setAttribute("data-td-key", token.contract + "/" + token.tokenId);

    var frame = el("span", "td-frame");
    var src = resolveImage(token.image, ipfsOnly);
    if (src) {
      var img = el("img", "td-img");
      img.setAttribute("src", src);
      img.setAttribute("alt", "");
      img.setAttribute("loading", "lazy");
      img.setAttribute("decoding", "async");
      img.setAttribute("referrerpolicy", "no-referrer");
      frame.appendChild(img);
    } else {
      frame.setAttribute("class", "td-frame td-frame-empty");
    }
    box.appendChild(frame);

    box.appendChild(el("span", "td-name", cleanName(token.name)));
    var meta = el("span", "td-meta");
    meta.textContent = "×" + formatNumber(token.supply) + " · " + formatNumber(token.holders) + (token.holders === 1 ? " holder" : " holders");
    box.appendChild(meta);

    item.appendChild(box);
    return item;
  }

  // the status element is created once at mount and stays in the page; only its text changes.
  function render(root, config, data, statusText) {
    var status = config.status;
    var focusKey = "";
    try {
      var active = document.activeElement;
      if (active && root.contains(active) && typeof active.getAttribute === "function") {
        focusKey = active.getAttribute("data-td-key") || "";
      }
    } catch (error) { focusKey = ""; }

    var content = document.createDocumentFragment();
    content.appendChild(el("h2", "td-title", config.title));

    var shelf = externalLink("https://objkt.com/users/" + config.wallet, "td-address");
    shelf.textContent = shortAddress(config.wallet);
    var addressLine = el("p", "td-address-line");
    addressLine.appendChild(shelf);
    content.appendChild(addressLine);

    if (data) {
      var stats = el("dl", "td-stats");
      stats.appendChild(stat("balance", data.balanceTez === null ? "\u2014" : data.balanceTez.toFixed(2) + " tez"));
      stats.appendChild(stat("published", formatNumber(data.published)));
      stats.appendChild(stat("held", formatNumber(data.held)));
      stats.appendChild(stat("transactions", formatNumber(data.transactions)));
      content.appendChild(stats);

      var list = el("ul", "td-grid");
      data.tokens.slice(0, config.limit).forEach(function (token) {
        list.appendChild(card(token, config.ipfsOnly));
      });
      content.appendChild(list);
    }

    var keep = [];
    for (var i = 0; i < root.childNodes.length; i++) if (root.childNodes[i] !== status) keep.push(root.childNodes[i]);
    keep.forEach(function (node) { root.removeChild(node); });
    root.insertBefore(content, status);
    status.textContent = statusText;

    if (focusKey) {
      var cards = root.querySelectorAll("[data-td-key]");
      for (var j = 0; j < cards.length; j++) {
        if (cards[j].getAttribute("data-td-key") === focusKey) {
          if (typeof cards[j].focus === "function") cards[j].focus();
          break;
        }
      }
    }
  }

  function readSnapshot(id, wallet) {
    if (!id) return null;
    var node = document.getElementById(id);
    if (!node) return null;
    try {
      return normaliseSnapshot(JSON.parse(node.textContent), wallet);
    } catch (error) {
      return null;
    }
  }

  function mount(root) {
    if (!root || root.getAttribute("data-td-mounted") === "1") return;
    root.setAttribute("data-td-mounted", "1");
    var existing = root.getAttribute("class") || "";
    if ((" " + existing + " ").indexOf(" tezos-desk ") === -1) root.setAttribute("class", (existing + " tezos-desk").trim());

    var wallet = (root.getAttribute("data-wallet") || "").trim();
    if (!ADDRESS.test(wallet)) {
      root.textContent = "";
      var none = el("p", "td-status", "no wallet set.");
      none.setAttribute("role", "status");
      none.setAttribute("aria-live", "polite");
      root.appendChild(none);
      return;
    }

    var apiAttr = (root.getAttribute("data-api") || "").trim();
    var api = (safeHttps(apiAttr) || DEFAULT_API).replace(/\/+$/, "");
    var config = {
      wallet: wallet,
      title: (root.getAttribute("data-title") || "the wallet").slice(0, 80),
      limit: clampLimit(root.getAttribute("data-limit")),
      api: api,
      ipfsOnly: (root.getAttribute("data-images") || "").trim().toLowerCase() === "ipfs",
      status: el("p", "td-status")
    };
    config.status.setAttribute("role", "status");
    config.status.setAttribute("aria-live", "polite");
    root.textContent = "";
    root.appendChild(config.status);

    var snapshot = readSnapshot(root.getAttribute("data-snapshot"), wallet);
    if (snapshot) {
      render(root, config, snapshot, "snapshot from " + formatTime(snapshot.at) + ".");
    } else {
      render(root, config, null, "loading.");
    }

    var request;
    try {
      request = fetchLive(api, wallet, config.limit, config.ipfsOnly);
    } catch (error) {
      request = Promise.reject(error);
    }
    request.then(function (live) {
      render(root, config, live, "live. as of " + formatTime(live.at) + ".");
    }, function () {
      if (snapshot) {
        render(root, config, snapshot, "the chain did not answer. showing the snapshot from " + formatTime(snapshot.at) + ".");
      } else {
        render(root, config, null, "the chain did not answer.");
      }
    });
  }

  function mountAll() {
    var nodes = document.querySelectorAll("[data-tezos-desk]");
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }

  window.TezosDesk = { mount: mount, version: VERSION };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll);
  else mountAll();
})();
