/* shop small, el segundo: a one-tap small business saturday check-in.
   a check-in signs the public pointcast front desk as a person (that is the number the weekly tally reads)
   and adds one human line to the #shop-small room on the loom. it collects an optional first name or handle
   and nothing else. text goes in as text, never as html. */
(function () {
  "use strict";

  var DESK = "https://pointcast.xyz/api/front-desk";
  var LOOM = "https://pointcast.xyz/api/loom";
  var ROOM = "#shop-small";
  var GOAL = 100;
  var PAGE = "https://officenoun.xyz/shop-small/";
  var TZ = "America/Los_Angeles";
  var MAX_LINES_A_DAY = 6;
  var TIMEOUT_MS = 12000;
  var TEST_NAME = /^duet test\b/i; // the page's own test visits on Nov 27, 2026

  var $ = function (id) { return document.getElementById(id); };
  var form = $("checkin"), go = $("go"), status = $("status"), who = $("who");
  var thanks = $("thanks"), count = 0, counted = false;

  /* ---- small helpers ---- */
  var store = {
    get: function (k) { try { return window.localStorage.getItem("shop-small:" + k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem("shop-small:" + k, String(v)); } catch (e) {} }
  };

  function laDate(d) {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d || new Date());
    } catch (e) { return (d || new Date()).toISOString().slice(0, 10); }
  }

  // pacific dates from this week's sunday through today, oldest first
  function weekDates() {
    var today = laDate();
    var dow = 0;
    try {
      dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(new Date()));
    } catch (e) {}
    if (dow < 0) dow = 0;
    var base = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
    var out = [];
    for (var i = dow; i >= 0; i -= 1) out.push(new Date(base - i * 86400000).toISOString().slice(0, 10));
    return out;
  }

  function tag() {
    var t = store.get("tag");
    if (t && /^[A-Z2-9]{4}$/.test(t)) return t;
    var abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", bytes = new Uint8Array(4);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (var j = 0; j < 4; j += 1) bytes[j] = Math.floor(Math.random() * 256);
    t = "";
    for (var i = 0; i < 4; i += 1) t += abc[bytes[i] % abc.length];
    store.set("tag", t);
    return t;
  }

  // the name shown on the loom: letters, numbers, spaces and . ' _ - @ only, 18 at most
  function cleanName(s) {
    var out = String(s || "");
    try { out = out.normalize("NFKC").replace(/[^\p{L}\p{N} .'_@-]/gu, ""); }
    catch (e) { out = out.replace(/[^A-Za-z0-9 .'_@-]/g, ""); }
    return out.replace(/\s+/g, " ").replace(/^[\s.'_-]+|[\s.'_-]+$/g, "").slice(0, 18).trim();
  }

  // the desk takes a handle of 2 to 32 letters, numbers, spaces, dots, underscores or hyphens
  function deskName(name) {
    var out = String(name || "");
    try { out = out.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {}
    out = out.replace(/[^A-Za-z0-9 ._-]/g, "").replace(/\s+/g, " ").trim().slice(0, 18).trim();
    return out.length >= 2 ? out : "neighbor";
  }

  function request(url, body) {
    if (typeof fetch !== "function") return Promise.resolve({ ok: false, status: 0 });
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT_MS) : null;
    var opts = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { headers: { Accept: "application/json" } };
    if (ctl) opts.signal = ctl.signal;
    return fetch(url, opts).then(function (res) {
      return res.json().then(function (data) { return { ok: res.ok && data && data.ok !== false, status: res.status, data: data }; },
        function () { return { ok: false, status: res.status }; });
    }, function () { return { ok: false, status: 0 }; }).then(function (r) { if (timer) clearTimeout(timer); return r; });
  }

  function say(el, text, bad) {
    el.textContent = text || "";
    el.classList.toggle("bad", !!bad);
  }

  function shopFor(input) {
    var label = input.closest("label");
    return {
      id: input.value,
      name: label.querySelector(".n").textContent.trim(),
      local: input.value === "somewhere-local"
    };
  }

  /* ---- the week's count ---- */
  function showCount(n) {
    count = n;
    $("count").textContent = String(n);
    $("bar").style.width = Math.min(100, Math.round((n / GOAL) * 100)) + "%";
  }

  function loadCount() {
    var dates = weekDates();
    return Promise.all(dates.map(function (d) { return request(DESK + "?date=" + d); })).then(function (rs) {
      var sum = 0, any = false;
      rs.forEach(function (r, i) {
        var d = r.data;
        if (!r.ok || !d || d.date !== dates[i] || !d.counts) return;
        // people only, leaving out visits labelled as tests of this page
        var h = Array.isArray(d.visitors)
          ? d.visitors.filter(function (v) { return v && v.kind === "human" && !TEST_NAME.test(String(v.name || "")); }).length
          : Number(d.counts.human);
        if (isFinite(h) && h >= 0 && h < 100000) { sum += h; any = true; }
      });
      if (any) { counted = true; showCount(sum); return; }
      // the desk did not answer: count this week's human lines in the room instead
      return request(LOOM + "?to=" + encodeURIComponent(ROOM)).then(function (r) {
        var msgs = r.ok && r.data && Array.isArray(r.data.messages) ? r.data.messages : [];
        var n = msgs.filter(function (m) {
          return m && m.from && m.from.kind === "human" && !TEST_NAME.test(String(m.from.name || "")) && m.at && laDate(new Date(m.at)) >= dates[0];
        }).length;
        showCount(n);
        $("meter-label").textContent = "Counted from the #shop-small room on the Loom this week (the front desk didn't answer).";
      });
    });
  }

  /* ---- picking a shop ---- */
  var picked = null;
  Array.prototype.forEach.call(document.querySelectorAll('#shops input[name="shop"]'), function (input) {
    input.addEventListener("change", function () {
      if (!input.checked) return;
      picked = shopFor(input);
      go.disabled = false;
      go.textContent = picked.local ? "Check in here" : "Check in at " + picked.name;
      say(status, "");
    });
  });

  /* ---- checking in ---- */
  function lineFor(shop) {
    var where = shop.local ? "a local El Segundo shop" : shop.name;
    return "I checked in at " + where + " for Small Business Saturday in El Segundo. At a local shop today? Check in: " + PAGE;
  }

  function showThanks(shop, note) {
    $("card-shop").textContent = shop.local ? "a local El Segundo shop" : shop.name;
    $("card-n").textContent = note;
    var line = lineFor(shop);
    $("line").textContent = line;
    $("post-x").href = "https://x.com/intent/post?text=" + encodeURIComponent(line);
    say($("share-status"), "");
    form.hidden = true;
    thanks.hidden = false;
    $("thanks-h").focus();
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!picked) { say(status, "Pick the shop you're at first.", true); return; }
    if (form.elements.company && form.elements.company.value) return; // the honeypot
    var day = laDate(), shop = picked, name = cleanName(who.value);
    var doneKey = "done:" + day + ":" + shop.id;
    if (store.get(doneKey)) { showThanks(shop, "You already checked in here today. Thanks for coming back."); return; }
    var lines = +(store.get("lines:" + day) || 0);
    if (lines >= MAX_LINES_A_DAY) { say(status, "That's plenty for one day. Thank you for shopping small.", true); return; }

    go.disabled = true;
    say(status, "Checking in…");
    var handle = deskName(name) + " - sbs " + tag();
    var body = (name || "A neighbor") + " checked in at " + (shop.local ? "a local El Segundo shop" : shop.name) + " for Small Business Saturday in El Segundo.";

    request(DESK, { handle: handle, kind: "human", company: "" }).then(function (desk) {
      return request(LOOM, { action: "append", to: ROOM, from: { name: name || "a neighbor", kind: "human" }, kind: "note", body: body }).then(function (loom) {
        go.disabled = false;
        if (!desk.ok && !loom.ok) {
          var slow = desk.status === 429 || loom.status === 429;
          say(status, slow ? "The desk says slow down a little. Try again in a few minutes." : "The desk didn't answer. Check your signal and try again.", true);
          return;
        }
        store.set(doneKey, "1");
        store.set("lines:" + day, lines + 1);
        say(status, "");
        var repeat = desk.ok && desk.data && desk.data.repeat;
        var note;
        if (desk.ok && !repeat) {
          showCount(count + 1);
          note = counted ? "Check-in " + count + " of 100 this week." : "One more toward 100 this week.";
        } else if (desk.ok) {
          note = "This phone is already in today's book, so this stop goes on the Loom.";
        } else if (desk.status) {
          note = "You're on the Loom. The front desk turned this one down, so it may not count yet.";
        } else {
          note = "You're on the Loom. The front desk didn't answer, so this one may not count yet.";
        }
        showThanks(shop, note);
      });
    });
  });

  /* ---- sharing ---- */
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
    }
    return Promise.resolve(false);
  }

  $("copy").addEventListener("click", function () {
    copy($("line").textContent).then(function (ok) {
      say($("share-status"), ok ? "Copied. Paste it anywhere." : "Press and hold the line above to copy it.", !ok);
    });
  });

  $("share").addEventListener("click", function () {
    var line = $("line").textContent;
    if (navigator.share) {
      navigator.share({ title: "Shop small, El Segundo", text: line.replace(" " + PAGE, ""), url: PAGE }).catch(function () {});
      return;
    }
    copy(line).then(function (ok) {
      say($("share-status"), ok ? "Copied the line. Paste it anywhere." : "Press and hold the line above to copy it.", !ok);
    });
  });

  $("again").addEventListener("click", function () {
    thanks.hidden = true;
    form.hidden = false;
    Array.prototype.forEach.call(document.querySelectorAll('#shops input[name="shop"]'), function (i) { i.checked = false; });
    picked = null;
    go.disabled = true;
    go.textContent = "Pick a shop first";
    window.scrollTo(0, 0);
  });

  loadCount().catch(function () { $("count").textContent = "–"; });
})();
