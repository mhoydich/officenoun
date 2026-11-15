/* office noun faucets · supreme one · november
 *
 * The water cooler: five taps, one supreme office noun each. Sign-ups post one
 * public line to the loom (#supreme-one) that the faucet reads later. Phantom
 * is used only to read the public address, and (if asked) to sign a plain note
 * that proves the address is yours. Nothing here sends, swaps or spends.
 * All text goes in with textContent; no metadata is ever inserted as HTML.
 */
(function () {
  "use strict";
  var LOOM_API = "https://pointcast.xyz/api/loom";
  var TOPIC = "#supreme-one";
  var THREAD = "https://pointcast.xyz/loom?to=%23supreme-one#thread";
  var FALLBACK = [
    { slug: "stapler", name: "supreme stapler", ticker: "STAPLE", art: "./nouns/stapler.svg" },
    { slug: "mug", name: "supreme mug", ticker: "MUG", art: "./nouns/mug.svg" },
    { slug: "clip", name: "supreme clip", ticker: "CLIP", art: "./nouns/clip.svg" },
    { slug: "lamp", name: "supreme lamp", ticker: "LAMP", art: "./nouns/lamp.svg" },
    { slug: "chair", name: "supreme chair", ticker: "CHAIR", art: "./nouns/chair.svg" }
  ];
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  var store = {
    get: function (k) { try { return localStorage.getItem("faucets." + k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem("faucets." + k, v); } catch (e) {} }
  };
  var faucets = FALLBACK, picked = {};
  try { JSON.parse(store.get("picked") || "[]").forEach(function (s) { picked[s] = true; }); } catch (e) {}

  /* ---- base58 (bitcoin alphabet, as solana uses) ---- */
  var B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  function b58decode(s) {
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(s)) return null;
    var bytes = [0];
    for (var i = 0; i < s.length; i++) {
      var carry = B58.indexOf(s[i]);
      for (var j = 0; j < bytes.length; j++) { carry += bytes[j] * 58; bytes[j] = carry & 255; carry >>= 8; }
      while (carry) { bytes.push(carry & 255); carry >>= 8; }
    }
    for (var k = 0; k < s.length && s[k] === "1"; k++) bytes.push(0);
    return bytes.reverse();
  }
  function b58encode(u8) {
    var digits = [0];
    for (var i = 0; i < u8.length; i++) {
      var carry = u8[i];
      for (var j = 0; j < digits.length; j++) { carry += digits[j] << 8; digits[j] = carry % 58; carry = (carry / 58) | 0; }
      while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
    }
    var out = "";
    for (var k = 0; k < u8.length && u8[k] === 0; k++) out += "1";
    for (var d = digits.length - 1; d >= 0; d--) out += B58[digits[d]];
    return out;
  }
  /* a solana address is base58 for exactly 32 bytes */
  function isSolAddress(s) { if (!s || s.length < 32 || s.length > 44) return false; var b = b58decode(s); return !!b && b.length === 32; }

  /* ---- sound: a small plink, only ever after a tap ---- */
  var ctx = null;
  function plink(i) {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      var t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      var f = [880, 988, 1175, 1319, 1568][i % 5];
      o.type = "sine"; o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(ctx.destination); o.start(t + 0.82); o.stop(t + 1.4);
    } catch (e) {}
  }

  /* ---- draw ---- */
  function savePicked() { store.set("picked", JSON.stringify(Object.keys(picked).filter(function (k) { return picked[k]; }))); }
  function drawTaps() {
    var ul = $("taps"); ul.textContent = "";
    faucets.forEach(function (f, i) {
      var li = el("li"), b = el("button", "tap");
      b.type = "button"; b.setAttribute("aria-pressed", picked[f.slug] ? "true" : "false");
      b.setAttribute("aria-label", f.name + ", " + (picked[f.slug] ? "picked" : "not picked") + ". tap to pick and pour a drop");
      b.appendChild(el("span", "spout"));
      var art = el("span", "art"), img = el("img"); img.src = f.art; img.alt = ""; img.width = 96; img.height = 96; art.appendChild(img); b.appendChild(art);
      b.appendChild(el("span", "nm", f.name.replace("supreme ", "")));
      b.appendChild(el("span", "drop"));
      b.addEventListener("click", function () {
        picked[f.slug] = !picked[f.slug]; savePicked();
        b.classList.remove("pour"); void b.offsetWidth; b.classList.add("pour");
        plink(i); drawPicks(); b.setAttribute("aria-pressed", picked[f.slug] ? "true" : "false");
        b.setAttribute("aria-label", f.name + ", " + (picked[f.slug] ? "picked" : "not picked") + ". tap to pick and pour a drop");
        $("tapHint").textContent = picked[f.slug] ? f.name + " picked. one " + f.ticker + " a day, once the water is on." : f.name + " unpicked.";
      });
      li.appendChild(b); ul.appendChild(li);
    });
  }
  function drawPicks() {
    var box = $("pick"); box.textContent = "";
    faucets.forEach(function (f) {
      var lab = el("label"), cb = el("input"), img = el("img");
      cb.type = "checkbox"; cb.checked = !!picked[f.slug];
      cb.addEventListener("change", function () { picked[f.slug] = cb.checked; savePicked(); drawTaps(); });
      img.src = f.art; img.alt = ""; img.width = 32; img.height = 32;
      lab.appendChild(cb); lab.appendChild(img); lab.appendChild(document.createTextNode(f.name.replace("supreme ", "") + " · " + f.ticker));
      box.appendChild(lab);
    });
  }
  function drawKit() {
    var box = $("kit"); box.textContent = "";
    faucets.forEach(function (f) {
      var a = el("a"), img = el("img"); a.href = f.art; a.setAttribute("download", f.slug + ".svg");
      img.src = f.art; img.alt = ""; img.width = 64; img.height = 64;
      a.appendChild(img); a.appendChild(el("span", null, f.slug + ".svg")); box.appendChild(a);
    });
  }
  function drawAll() { drawTaps(); drawPicks(); drawKit(); }

  /* ---- address ---- */
  var addr = $("addr"), addrNote = $("addrNote");
  function checkAddr() {
    var v = addr.value.trim();
    if (!v) { addrNote.textContent = ""; addrNote.className = "note"; return false; }
    var ok = isSolAddress(v);
    addrNote.textContent = ok ? "looks like a solana address ✓" : "that isn't a solana address yet (base58, 32 to 44 characters).";
    addrNote.className = ok ? "note" : "note bad";
    return ok;
  }
  addr.addEventListener("input", function () { checkAddr(); if (phantomKey && addr.value.trim() !== phantomKey) phantomKey = null; });
  var saved = store.get("addr"); if (saved) { addr.value = saved; checkAddr(); }
  var savedName = store.get("name"); if (savedName) $("who").value = savedName;

  /* ---- phantom ---- */
  var phantomKey = null;
  function provider() { var p = window.phantom && window.phantom.solana; if (p && p.isPhantom) return p; if (window.solana && window.solana.isPhantom) return window.solana; return null; }
  $("phantom").addEventListener("click", function () {
    var p = provider();
    if (!p) {
      /* on a phone without the extension: open this page inside phantom's own browser */
      if (/iphone|ipad|android/i.test(navigator.userAgent)) {
        location.href = "https://phantom.app/ul/browse/" + encodeURIComponent(location.href) + "?ref=" + encodeURIComponent(location.origin);
        return;
      }
      addrNote.className = "note bad";
      addrNote.textContent = "phantom isn't on this browser. install it from phantom.app, or paste any solana address.";
      return;
    }
    $("phantomLabel").textContent = "connecting…";
    p.connect().then(function (res) {
      var key = (res && res.publicKey ? res.publicKey : p.publicKey).toString();
      phantomKey = key; addr.value = key; checkAddr();
      $("phantom").dataset.on = "1"; $("phantomLabel").textContent = "phantom · " + key.slice(0, 4) + "…" + key.slice(-4);
    }, function () {
      $("phantomLabel").textContent = "connect phantom";
      addrNote.className = "note bad"; addrNote.textContent = "phantom didn't connect. you can still paste an address.";
    });
  });

  /* ---- sign up ---- */
  var go = $("go"), goNote = $("goNote"), armTimer = 0;
  function laDate() { try { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } }
  function say(text, href, linkText) {
    goNote.textContent = text;
    if (href) { goNote.appendChild(document.createTextNode(" ")); var a = el("a", null, linkText); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; goNote.appendChild(a); }
  }
  function reset() { go.dataset.armed = ""; go.textContent = go.dataset.label; go.disabled = false; }
  go.addEventListener("click", function () {
    var a = addr.value.trim(), slugs = faucets.filter(function (f) { return picked[f.slug]; });
    if (!checkAddr()) { say("add a solana address first (connect phantom or paste one)."); addr.focus(); return; }
    if (!slugs.length) { say("pick at least one tap."); return; }
    var who = $("who").value.trim().replace(/\s+/g, " ").slice(0, 40) || "a visitor";
    var names = slugs.map(function (f) { return f.name; }).join(", ");
    var body = "SIGN UP · " + names + " · to " + a + " · one a day each, when the water comes on. via officenoun.xyz/faucets";
    if (go.dataset.armed !== "1") {
      go.dataset.armed = "1"; go.textContent = "tap again to post";
      say("this posts in public, under “" + who + "”: " + body);
      clearTimeout(armTimer); armTimer = setTimeout(reset, 8000); return;
    }
    clearTimeout(armTimer); go.dataset.armed = ""; go.disabled = true; go.textContent = "posting…";
    var proof = Promise.resolve(null);
    if ($("prove").checked) {
      var p = provider();
      if (!p || !phantomKey || phantomKey !== a) { reset(); say("to prove the address, connect phantom with that same address first (or untick the proof box)."); return; }
      var msg = "officenoun.xyz faucet sign-up\naddress: " + a + "\nnouns: " + slugs.map(function (f) { return f.slug; }).join(",") + "\ndate: " + laDate() + "\nthis moves nothing.";
      proof = p.signMessage(new TextEncoder().encode(msg), "utf8").then(function (r) { var sig = r && (r.signature || r); return b58encode(new Uint8Array(sig)); });
    }
    proof.then(function (sig) {
      var full = body + (sig ? " · proof " + sig : "");
      return fetch(LOOM_API, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "append", to: TOPIC, from: { name: who, kind: "human" }, kind: "note", body: full }) })
        .then(function (res) { return res.json().then(function (j) { return { ok: res.ok && j && j.ok !== false, status: res.status }; }, function () { return { ok: false, status: res.status }; }); });
    }).then(function (r) {
      if (r.ok) {
        store.set("addr", a); store.set("name", who === "a visitor" ? "" : who); store.set("signed", laDate());
        go.textContent = "signed up ✓"; say("you're in line for " + names + ".", THREAD, "see the line ›"); return;
      }
      reset(); say(r.status === 429 ? "the loom says slow down a little. try again in a few minutes." : "that didn't post. try again in a moment.");
    }, function () { reset(); say("phantom didn't sign, so nothing was posted. untick the proof box to sign up without it."); });
  });

  /* ---- countdown to midnight pacific ---- */
  function tick() {
    try {
      var now = new Date(), parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" }).formatToParts(now);
      var g = function (t) { return +parts.find(function (x) { return x.type === t; }).value; };
      var left = 86400 - (g("hour") * 3600 + g("minute") * 60 + g("second"));
      var h = Math.floor(left / 3600), m = Math.floor(left % 3600 / 60);
      $("countdown").textContent = h + "h " + (m < 10 ? "0" : "") + m + "m (midnight pacific)";
    } catch (e) {}
  }
  tick(); setInterval(tick, 30000);

  drawAll();
  if (typeof fetch === "function") fetch("./faucets.json").then(function (r) { return r.json(); }).then(function (j) {
    if (j && Array.isArray(j.faucets) && j.faucets.length) { faucets = j.faucets.map(function (f) { return { slug: String(f.slug), name: String(f.name), ticker: String(f.ticker), art: "./nouns/" + String(f.slug).replace(/[^a-z0-9-]/g, "") + ".svg", mint: f.mint || null }; }); drawAll(); }
  }).catch(function () {});
})();
