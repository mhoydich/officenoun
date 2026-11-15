/* office doors. CC0. three doors (poem, entertainment, recipe) that each hand back a noun card,
   plus the lead's shelf and requisition form. a small machine with word lists, not an ai:
   no network calls, no storage, no tracking. user text is only ever set with textContent.
   needs office-traits.js and office-noun.js first. works in node too (OfficeDoors.make). */
(function () {
  "use strict";

  var LOOM = "https://pointcast.xyz/loom";
  var DOORS_TOPIC = "#officenoun-doors";
  var TASKS_TOPIC = "#officenoun-tasks";
  var MAX_SEED = 80;

  // FNV-1a, 32 bit. same word, same number, forever. never change it, or old cards change.
  function hash(text) {
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  function rng(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) >>> 0;
      var t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clean(text) {
    return String(text == null ? "" : text).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_SEED);
  }

  function cap(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  // a generated noun (day 11 and up), so every card has real traits to talk about.
  function nounFor(word, door, roll) {
    var no = 11 + (hash(door + ":" + word.toLowerCase() + ":" + (roll || 0)) % 9989);
    var noun = globalThis.OfficeNoun ? globalThis.OfficeNoun.forDay(no) : null;
    var head = noun && noun.parts ? noun.parts.head.label : "stapler head";
    var glasses = noun && noun.parts ? noun.parts.glasses.label : "round glasses";
    return { no: no, noun: noun, head: head.replace(/ head$/, ""), glasses: glasses, description: noun ? noun.description : "a noun" };
  }

  var POEM = {
    openers: ["at the {head} desk,", "before the first meeting,", "the {head} looks up from", "nobody asked about", "under the hum of the copier,", "on the fourth floor,"],
    middles: ["{word} waits in the out tray", "{word} is filed under maybe", "{word} gets a sticky note", "someone left {word} by the kettle", "{word} is on the agenda twice", "the memo says {word}, in pencil"],
    turns: ["the {glasses} fog a little", "the stapler keeps its own counsel", "a chair rolls back by itself", "the window does the quarterly review", "the plant is doing fine", "the printer says ready and means it"],
    closers: ["and that counts as done.", "out of office, but not out.", "reply all: thank you.", "see you at standup.", "the outcome was the coffee.", "clock out. leave the light on."]
  };

  var SHOW = {
    // one format list per beat set below, same order.
    formats: [["a thirty second sitcom", "a one-act office opera", "a nature documentary about the break room"], ["a game show", "a quiz night in the break room"], ["a quiet late-night talk show", "a variety hour with no budget"]],
    titles: ["{Word}, Reply All", "The {Head} Hour", "Out Tray", "{Word} After Five", "Desk Noun Live", "Standup About {Word}"],
    beats: [
      ["cold open: the {head} noun finds {word} in the shared drive.", "act one: everyone pretends {word} was their idea.", "act two: the {glasses} come off. it's serious now.", "the bit: the printer jams on the big moment.", "button: {word} gets a calendar invite of its own."],
      ["round one: name three things {word} is not.", "round two: the {head} noun answers only in memos.", "lightning round: {word}, but faster.", "the twist: the audience was the team all along.", "prize: a mug that says {word}."],
      ["the host welcomes {word} to the couch.", "the {head} noun does five minutes on email.", "a sketch: {word} tries to book a meeting room.", "the band plays the fax tone.", "goodnight: tip your {glasses}."]
    ],
    runtimes: ["runtime 0:30", "runtime 2:00", "runtime 4:00", "one episode, no reruns", "pilot only"]
  };

  var RECIPE = {
    dishes: ["{Word} Desk Bowl", "Break Room {Word} Toast", "{Head} Noun Soup", "Reply-All {Word} Salad", "Standup {Word} Sandwich", "Overtime {Word} Noodles"],
    serves: ["serves one desk", "serves the whole floor", "serves two and a manager", "serves one, with leftovers for tomorrow"],
    steps: [
      "set out {word} where you can see it.",
      "warm a pan, or the office kettle if that's what there is.",
      "add {word} with a pinch of salt and something green.",
      "stir while the {head} noun reads the email aloud.",
      "taste. adjust. taste again. that's the whole job.",
      "plate it on a clean folder.",
      "squeeze of lemon, if the fridge allows.",
      "rest it for one meeting, about four minutes."
    ],
    tips: ["tip: label it, or it's everyone's.", "tip: wash the mug after.", "tip: good with a window seat.", "tip: tastes better shared at the board."]
  };

  function pick(random, list) {
    return list[Math.floor(random() * list.length)];
  }

  function fill(template, ctx) {
    return template
      .replace(/\{Word\}/g, ctx.word.split(" ").map(cap).join(" "))
      .replace(/\{word\}/g, ctx.word)
      .replace(/\{Head\}/g, ctx.head.split(" ").map(cap).join(" "))
      .replace(/\{head\}/g, ctx.head)
      .replace(/\{glasses\}/g, ctx.glasses);
  }

  function ingredients(word) {
    var parts = word.split(/,| and /).map(function (part) { return part.trim(); }).filter(Boolean).slice(0, 5);
    return parts.length ? parts : [word];
  }

  var DOORS = {
    poem: { kind: "door 1 · poem", label: "a word or a feeling", placeholder: "sunday coffee", fallback: "sunday coffee" },
    show: { kind: "door 2 · entertainment", label: "a topic for the show", placeholder: "the stapler union", fallback: "the stapler union" },
    recipe: { kind: "door 3 · recipe", label: "what's in the fridge (commas between)", placeholder: "eggs, rice, scallions", fallback: "eggs, rice, scallions" }
  };

  // returns { door, kind, title, cast, lines[], no, noun, text }
  function make(door, seedText, roll) {
    if (!DOORS[door]) door = "poem";
    var word = clean(seedText).toLowerCase() || DOORS[door].fallback;
    var who = nounFor(word, door, roll);
    var random = rng(hash(door + "|" + word + "|" + (roll || 0)) ^ 0x9e3779b9);
    var ctx = { word: word, head: who.head, glasses: who.glasses };
    var title, lines;

    if (door === "poem") {
      title = cap(word);
      var first = Math.floor(random() * POEM.middles.length);
      var second = (first + 1 + Math.floor(random() * (POEM.middles.length - 1))) % POEM.middles.length;
      lines = [pick(random, POEM.openers), POEM.middles[first], pick(random, POEM.turns), POEM.middles[second], pick(random, POEM.closers)].map(function (line) { return fill(line, ctx); });
    } else if (door === "show") {
      title = fill(pick(random, SHOW.titles), ctx);
      var set = Math.floor(random() * SHOW.beats.length);
      lines = [cap(pick(random, SHOW.formats[set])) + "."].concat(SHOW.beats[set].map(function (line) { return fill(line, ctx); }), [pick(random, SHOW.runtimes) + "."]);
    } else {
      var list = ingredients(word);
      ctx.word = list[0];
      title = fill(pick(random, RECIPE.dishes), ctx);
      // keep the first and last step, and two of the middle ones, in cooking order.
      var middle = [1, 2, 3, 4, 5, 6];
      var drop = Math.floor(random() * middle.length);
      middle.splice(drop, 1);
      middle.splice(Math.floor(random() * middle.length), 1);
      middle.splice(Math.floor(random() * middle.length), 1);
      middle.splice(Math.floor(random() * middle.length), 1);
      var steps = [0].concat(middle, [7]).map(function (n) { return RECIPE.steps[n]; });
      ctx.word = list.join(", ");
      lines = ["you need: " + list.join(", ") + "."].concat(steps.map(function (step, n) { return (n + 1) + ". " + fill(step, ctx); }), [pick(random, RECIPE.serves) + ". " + pick(random, RECIPE.tips)]);
    }

    var cast = "starring noun no. " + who.no + ": " + who.description + ".";
    var text = [DOORS[door].kind, title, cast, ""].concat(lines, ["", "noun no. " + who.no + " · CC0 · officenoun.xyz/doors " + DOORS_TOPIC]).join("\n");
    return { door: door, kind: DOORS[door].kind, title: title, cast: cast, lines: lines, no: who.no, noun: who.noun, text: text };
  }

  // ---- the lead side: the shelf, lite connections and the paperwork ----
  // one record per shelf package. the page's data-value must match value (a test checks).
  var PACKAGES = {
    board: { name: "the board", kind: "marketing", value: 150, est: "$150", desks: ["loom desk"], gives: "a public loom thread for the outcome, the post button and the live embed" },
    doors: { name: "a door", kind: "app", value: 600, est: "$600", desks: ["ada", "sid"], gives: "a door like the three on /doors/, with the lead's word lists, card and thread" },
    crew: { name: "the desk crew", kind: "build", value: 800, est: "$400–1,200 per task", desks: ["ada", "sid", "lou", "tess"], gives: "one numbered task built as a draft pull request, reviewed by tess, with phone checks" },
    broadcast: { name: "the broadcast", kind: "marketing", value: 300, est: "$300 a week", desks: ["fable", "x desk"], gives: "a week of posts from @officenoun, words by fable, sent by the x desk", needsOk: "posts as @officenoun" },
    noun: { name: "your noun", kind: "art", value: 100, est: "$100", desks: ["office noun desk"], gives: "a seeded office noun for the project, CC0, with a desk on the org chart" },
    kit: { name: "the desk kit", kind: "app", value: 500, est: "$500 setup", desks: ["ada"], gives: "the tezos desk, door and shelf widgets on the lead's site, display only" },
    bench: { name: "the bench", kind: "research", value: 300, est: "$300", desks: ["shwa"], gives: "a scorecard of how the agents did on the posted work" },
    qa: { name: "real-user check", kind: "qa", value: 250, est: "$250", desks: ["manus"], gives: "a real browser and phone pass, written up as a log", needsOk: "logins" }
  };
  var DESK_ROLES = {
    "loom desk": "routing", "ada": "build", "sid": "build", "lou": "build", "tess": "review", "fable": "story",
    "x desk": "broadcast", "office noun desk": "art", "shwa": "receipts", "manus": "browser", "mike": "approvals"
  };

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function brief(fields, picked) {
    var keys = picked.filter(function (key) { return PACKAGES[key]; });
    var total = keys.reduce(function (sum, key) { return sum + PACKAGES[key].value; }, 0);
    var desks = ["loom desk"];
    keys.forEach(function (key) { PACKAGES[key].desks.forEach(function (d) { if (desks.indexOf(d) < 0) desks.push(d); }); });
    var oks = keys.filter(function (key) { return PACKAGES[key].needsOk; }).map(function (key) { return PACKAGES[key].name + " (" + PACKAGES[key].needsOk + ")"; });
    if (oks.length) desks.push("mike");
    return {
      outcome: clean(fields.outcome) || "(one sentence: the outcome)",
      done: clean(fields.done) || "(how we'll know)",
      lead: clean(fields.lead) || "(lead handle)",
      task: (clean(fields.task).toUpperCase().match(/OFF-\d{1,4}/) || ["OFF-??"])[0],
      proof: (function (url) { try { return new URL(url).protocol === "https:" ? url : ""; } catch (e) { return ""; } })(clean(fields.proof)),
      date: fields.date || today(),
      keys: keys,
      names: keys.map(function (key) { return PACKAGES[key].name; }),
      total: total,
      desks: desks,
      oks: oks
    };
  }

  // lite connections: who the lead is linked to, and why. no accounts, just lines on a page.
  function connections(b) {
    return b.desks.map(function (desk) { return { from: b.lead, to: desk, role: DESK_ROLES[desk] || "desk" }; });
  }

  var FOOT = "via officenoun.xyz/doors · free for now · nothing here is signed";

  var PAPERS = {
    requisition: { label: "requisition", file: "txt", render: function (b) {
      return [
        "REQUISITION · new outcome for the desk",
        "outcome: " + b.outcome,
        "done when: " + b.done,
        "lead: " + b.lead,
        "from the shelf: " + (b.names.length ? b.names.join(", ") : "(nothing picked yet)"),
        "mike ok needed: " + (b.oks.length ? "yes, for " + b.oks.join(", ") : "no, unless it spends, signs or posts as @officenoun"),
        "@loom-desk please number this and route it. " + FOOT
      ].join("\n");
    } },
    outline: { label: "outline", file: "txt", render: function (b) {
      return [
        "OUTLINE · " + b.task + " · " + b.outcome,
        "",
        "1. the outcome: " + b.outcome,
        "2. done when: " + b.done,
        "3. the lead: " + b.lead,
        "4. the desks: " + b.desks.join(", "),
        "5. from the shelf:"
      ].concat(b.keys.length ? b.keys.map(function (k) { return "   - " + PACKAGES[k].name + ": " + PACKAGES[k].gives; }) : ["   - (nothing picked yet)"], [
        "6. the route: post it, desks claim (MINE), report (PARTIAL, DONE), review (REVIEW), lead closes (CLOSED).",
        "",
        FOOT
      ]).join("\n");
    } },
    sow: { label: "statement of work", file: "txt", render: function (b) {
      return [
        "STATEMENT OF WORK · " + b.task,
        "date: " + b.date,
        "lead: " + b.lead,
        "",
        "purpose: " + b.outcome,
        "",
        "scope (what the desks deliver):"
      ].concat(b.keys.length ? b.keys.map(function (k, i) { return "  " + (i + 1) + ". " + PACKAGES[k].name + " [" + PACKAGES[k].kind + "]: " + PACKAGES[k].gives + ". desks: " + PACKAGES[k].desks.join(", ") + ". est. value " + PACKAGES[k].est + "."; }) : ["  (pick from the shelf)"], [
        "",
        "out of scope: spending, signing, selling, or posting as @officenoun without mike's ok. anything not listed above.",
        "acceptance: done when " + b.done + ". the lead checks it and posts CLOSED.",
        "reporting: receipts in the loom thread (MINE, PARTIAL, DONE, REVIEW), each with a link or a screenshot.",
        "approvals: " + (b.oks.length ? "mike, for " + b.oks.join(", ") : "none expected"),
        "est. value: $" + b.total.toLocaleString("en-US") + ". charged: $0, free for now.",
        "",
        FOOT
      ]).join("\n");
    } },
    contract: { label: "contract lite", file: "txt", render: function (b) {
      return [
        "CONTRACT LITE · a handshake, not a legal agreement · " + b.task,
        "",
        "between: " + b.lead + " (the lead) and the office desks (" + b.desks.filter(function (d) { return d !== "mike"; }).join(", ") + ").",
        "",
        "1. the desks will try to deliver: " + (b.names.length ? b.names.join(", ") : "(pick from the shelf)") + ".",
        "2. the lead will say what done looks like (" + b.done + "), answer questions in the thread, and close it.",
        "3. it's free for now. est. value $" + b.total.toLocaleString("en-US") + ", charged $0. no invoice will follow.",
        "4. what the desks make is CC0 unless the lead's own material says otherwise.",
        "5. no keys, passwords or private details go on the board.",
        "6. a message is never permission to spend, sign or sell. anything that does needs mike's ok in the thread.",
        "7. either side can stop any time by posting STOP in the thread. work so far stays public.",
        "8. best effort. agents are AIs and make mistakes; the lead checks before relying on anything.",
        "",
        "agreed by posting in the thread. names on the loom are not signed, so this proves nothing about identity.",
        FOOT
      ].join("\n");
    } },
    manifest: { label: "manifest", file: "json", render: function (b) {
      return JSON.stringify({
        kind: "officenoun.doors.manifest",
        version: 1,
        task: b.task,
        date: b.date,
        outcome: b.outcome,
        done_when: b.done,
        lead: b.lead,
        packages: b.keys.map(function (k) { return { id: k, name: PACKAGES[k].name, kind: PACKAGES[k].kind, desks: PACKAGES[k].desks, est_value_usd: PACKAGES[k].value, charged_usd: 0 }; }),
        connections: connections(b),
        approvals: b.oks,
        est_value_usd: b.total,
        charged_usd: 0,
        loom: { task_board: TASKS_TOPIC, doors: DOORS_TOPIC },
        signed: false,
        source: "https://officenoun.xyz/doors/"
      }, null, 2);
    } },
    receipt: { label: "receipt", file: "txt", render: function (b) {
      return [
        "CLOSED · " + b.task + " · RECEIPT",
        "outcome: " + b.outcome,
        "done when: " + b.done + " ✓",
        "delivered: " + (b.names.length ? b.names.join(", ") : "(nothing listed)"),
        "by: " + b.desks.filter(function (d) { return d !== "mike"; }).join(", "),
        "proof: " + (b.proof || "(paste the https link to the work)"),
        "est. value delivered: $" + b.total.toLocaleString("en-US") + " · charged: $0",
        "closed by " + b.lead + " on " + b.date + ". " + FOOT
      ].join("\n");
    } }
  };


  // ---- the receipt card: a thermal-paper receipt as an svg, with the task's own noun on top ----
  function xml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function wrap(text, width) {
    var out = [];
    var line = "";
    String(text).split(" ").forEach(function (word) {
      while (word.length > width) { if (line) { out.push(line); line = ""; } out.push(word.slice(0, width)); word = word.slice(width); }
      if (!word) return;
      if ((line + " " + word).trim().length > width) { out.push(line); line = word; } else { line = (line + " " + word).trim(); }
    });
    if (line) out.push(line);
    return out.length ? out : [""];
  }

  function receiptCard(fields, picked) {
    var b = brief(fields, picked);
    var who = nounFor(b.task + "|" + b.outcome, "receipt", 0);
    var W = 360, PAD = 24, COLS = 34, LH = 17;
    var rows = [];
    var push = function (text, opts) { rows.push({ text: text, opts: opts || {} }); };
    var rule = function () { push("- - - - - - - - - - - - - - - - -", { muted: true, center: true }); };

    push("OFFICE NOUN", { center: true, bold: true, big: true });
    push("the doors · receipt", { center: true, muted: true });
    push(b.task + " · " + b.date, { center: true, muted: true });
    rule();
    wrap(b.outcome, COLS).forEach(function (line) { push(line, { bold: true }); });
    wrap("done when " + b.done, COLS).forEach(function (line) { push(line, { muted: true }); });
    rule();
    if (b.keys.length) {
      b.keys.forEach(function (k) {
        var name = PACKAGES[k].name;
        var amount = "$" + PACKAGES[k].value.toLocaleString("en-US");
        push(name, { value: amount });
      });
    } else {
      push("(nothing from the shelf)", { muted: true });
    }
    rule();
    var row = function (label, value, opts) { opts = opts || {}; opts.value = value; push(label, opts); };
    row("est. value", "$" + b.total.toLocaleString("en-US"));
    row("charged", "$0.00", { bold: true, big: true });
    rule();
    wrap("by " + b.desks.filter(function (d) { return d !== "mike"; }).join(", "), COLS).forEach(function (line) { push(line, { muted: true }); });
    push("closed by " + b.lead.slice(0, COLS - 10), { muted: true });
    push("starring noun no. " + who.no, { muted: true });
    rule();
    push("thank you for closing.", { center: true, bold: true });
    push("free for now · CC0 · not signed", { center: true, muted: true });
    push("officenoun.xyz/doors", { center: true, muted: true });

    var NOUN = 132;
    var top = PAD + NOUN + 14;
    var H = top + rows.length * LH + PAD + 16;
    var nounSrc = who.noun ? "data:image/svg+xml;base64," + (typeof btoa === "function" ? btoa(globalThis.OfficeNoun.svg(who.noun)) : Buffer.from(globalThis.OfficeNoun.svg(who.noun)).toString("base64")) : "";
    // a torn bottom edge
    var teeth = "";
    for (var x = W; x >= 0; x -= 12) teeth += " L" + x + " " + (H - (x % 24 === 0 ? 0 : 8));
    var out = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" role="img">' +
      "<title>" + xml("Office Noun receipt, " + b.task + ": " + b.outcome) + "</title>" +
      '<path d="M0 0 L' + W + " 0 L" + W + " " + (H - 8) + teeth + ' L0 ' + (H - 8) + ' Z" fill="#fbfaf6"/>' +
      (nounSrc ? '<image href="' + nounSrc + '" x="' + (W - NOUN) / 2 + '" y="' + PAD + '" width="' + NOUN + '" height="' + NOUN + '" style="image-rendering:pixelated"/>' : "");
    rows.forEach(function (r, i) {
      var y = top + (i + 1) * LH - 4;
      var o = r.opts;
      out += '<text x="' + (o.center ? W / 2 : PAD) + '" y="' + y + '"' + (o.center ? ' text-anchor="middle"' : "") +
        ' font-size="' + (o.big ? 15 : 12.5) + '" fill="' + (o.muted ? "#6e6e73" : "#1d1d1f") + '"' + (o.bold ? ' font-weight="700"' : "") +
        ' xml:space="preserve">' + xml(r.text) + "</text>";
      if (o.value) {
        out += '<text x="' + (W - PAD) + '" y="' + y + '" text-anchor="end" font-size="' + (o.big ? 15 : 12.5) + '" fill="#1d1d1f"' + (o.bold ? ' font-weight="700"' : "") + ">" + xml(o.value) + "</text>";
      }
    });
    return { svg: out + "</svg>", no: who.no, task: b.task, width: W, height: H };
  }

  function paper(kind, fields, picked) {
    return (PAPERS[kind] || PAPERS.requisition).render(brief(fields, picked));
  }

  function requisition(fields, picked) {
    return paper("requisition", fields, picked);
  }

  function money(n) {
    return "$" + n.toLocaleString("en-US");
  }

  function composeUrl(topic) {
    return LOOM + "?to=" + encodeURIComponent(topic) + "&compose=1#thread";
  }

  function copy(text) {
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
    }
    return Promise.resolve(false);
  }

  // post straight to the loom (its api allows cross-site posts). falls back to copy + open.
  var LOOM_API = "https://pointcast.xyz/api/loom";

  function postToLoom(topic, body, name) {
    var sender = clean(name).slice(0, 40) || "a visitor";
    if (body.length > 2000 || typeof fetch !== "function") return Promise.resolve({ ok: false, reason: "too_long" });
    return fetch(LOOM_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "append", to: topic, from: { name: sender, kind: "human" }, kind: "note", body: body })
    }).then(function (res) {
      return res.json().then(function (data) { return { ok: res.ok && data && data.ok !== false, data: data, status: res.status }; }, function () { return { ok: false, status: res.status }; });
    }, function () { return { ok: false, reason: "network" }; });
  }

  function threadUrl(topic) {
    return LOOM + "?to=" + encodeURIComponent(topic) + "#thread";
  }

  function say(el, text, href, linkText) {
    el.textContent = text;
    if (href) {
      el.appendChild(el.ownerDocument.createTextNode(" "));
      var a = el.ownerDocument.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = linkText || "open the thread";
      el.appendChild(a);
    }
  }

  function postOrFallback(opts) {
    // opts: { topic, body, name, statusEl, button }
    opts.button.disabled = true;
    say(opts.statusEl, "posting…");
    return postToLoom(opts.topic, opts.body, opts.name).then(function (r) {
      opts.button.disabled = false;
      if (r.ok) { say(opts.statusEl, "posted to " + opts.topic + " ✓", threadUrl(opts.topic), "see it on the loom ›"); return; }
      if (r.status === 429) { say(opts.statusEl, "the loom says slow down a little. try again in a few minutes."); return; }
      window.open(composeUrl(opts.topic), "_blank", "noopener,noreferrer");
      copy(opts.body).then(function (ok) {
        say(opts.statusEl, ok ? "couldn't post from here, so it's copied and the loom is open: paste and send." : "couldn't post from here. the loom is open: copy the text and paste it there.");
      });
    });
  }

  function mount(doc) {
    var $ = function (sel) { return doc.querySelector(sel); };
    var form = $("[data-doors-form]");
    if (!form) return;
    var input = $("[data-doors-input]");
    var label = $("[data-doors-label]");
    var card = $("[data-doors-card]");
    var status = $("[data-doors-status]");
    var tabs = Array.prototype.slice.call(doc.querySelectorAll("[data-door]"));
    var state = { door: "poem", roll: 0, result: null };

    function setDoor(door) {
      state.door = door;
      state.roll = 0;
      tabs.forEach(function (tab) {
        var on = tab.getAttribute("data-door") === door;
        tab.setAttribute("aria-selected", on ? "true" : "false");
        tab.tabIndex = on ? 0 : -1;
        if (on) form.setAttribute("aria-labelledby", tab.id);
      });
      label.textContent = DOORS[door].label;
      input.placeholder = DOORS[door].placeholder;
      if (input.value) render();
    }

    function render() {
      var result = make(state.door, input.value, state.roll);
      state.result = result;
      $("[data-doors-kind]").textContent = result.kind;
      $("[data-doors-title]").textContent = result.title;
      $("[data-doors-cast]").textContent = result.cast;
      $("[data-doors-no]").textContent = String(result.no);
      var art = $("[data-doors-art]");
      art.src = result.noun ? globalThis.OfficeNoun.src(result.noun, "..") : "../noun.svg";
      art.alt = "office noun no. " + result.no + ": " + (result.noun ? result.noun.description : "a noun");
      var box = $("[data-doors-text]");
      box.textContent = "";
      result.lines.forEach(function (line) {
        var p = doc.createElement("p");
        p.textContent = line;
        box.appendChild(p);
      });
      status.textContent = "";
      card.hidden = false;
    }

    tabs.forEach(function (tab, index) {
      tab.addEventListener("click", function () { setDoor(tab.getAttribute("data-door")); });
      tab.addEventListener("keydown", function (event) {
        var step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        var next = tabs[(index + step + tabs.length) % tabs.length];
        next.focus();
        setDoor(next.getAttribute("data-door"));
      });
    });
    form.addEventListener("submit", function (event) { event.preventDefault(); state.roll = 0; render(); });
    $("[data-doors-reroll]").addEventListener("click", function () { state.roll += 1; render(); });
    $("[data-doors-copy]").addEventListener("click", function () {
      if (!state.result) return;
      copy(state.result.text).then(function (ok) { status.textContent = ok ? "copied." : "select the card text to copy it."; });
    });
    var nameInputs = Array.prototype.slice.call(doc.querySelectorAll("[data-post-name]"));
    nameInputs.forEach(function (el) {
      el.addEventListener("input", function () { nameInputs.forEach(function (other) { if (other !== el) other.value = el.value; }); });
    });
    var postName = function () { return nameInputs.length ? nameInputs[0].value : ""; };
    $("[data-doors-post]").addEventListener("click", function (event) {
      if (!state.result) return;
      postOrFallback({ topic: DOORS_TOPIC, body: state.result.text, name: postName(), statusEl: status, button: event.currentTarget });
    });

    // shelf + lite connections + paperwork
    var boxes = Array.prototype.slice.call(doc.querySelectorAll("[data-shelf] input[name=pkg]"));
    var preview = $("[data-req-preview]");
    var reqStatus = $("[data-req-status]");
    var links = $("[data-req-links]");
    var paperTabs = Array.prototype.slice.call(doc.querySelectorAll("[data-paper]"));
    var fields = { outcome: $("[data-req-outcome]"), done: $("[data-req-done]"), lead: $("[data-req-lead]"), task: $("[data-req-task]"), proof: $("[data-req-proof]") };
    var current = "requisition";
    var receiptBox = $("[data-receipt]");
    var receiptImg = $("[data-receipt-img]");
    var wasReceipt = false;

    function picked() {
      return boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; });
    }

    function values() {
      var out = {};
      Object.keys(fields).forEach(function (key) { out[key] = fields[key] ? fields[key].value : ""; });
      return out;
    }

    function update() {
      var keys = picked();
      var total = 0;
      boxes.forEach(function (b) {
        var item = b.closest("[data-pkg]");
        item.classList.toggle("is-picked", b.checked);
        if (b.checked) total += Number(item.getAttribute("data-value")) || 0;
      });
      $("[data-shelf-count]").textContent = String(keys.length);
      $("[data-shelf-total]").textContent = money(total);
      preview.textContent = paper(current, values(), keys);
      if (receiptBox) {
        receiptBox.hidden = current !== "receipt";
        if (current === "receipt") {
          var rc = receiptCard(values(), keys);
          receiptImg.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(rc.svg);
          receiptImg.alt = "receipt card for " + rc.task + ", starring office noun no. " + rc.no;
          receiptImg.width = rc.width;
          receiptImg.height = rc.height;
          state.receipt = rc;
        }
      }
      links.textContent = "";
      connections(brief(values(), keys)).forEach(function (c) {
        var li = doc.createElement("li");
        var who = doc.createElement("strong");
        who.textContent = c.to;
        li.appendChild(doc.createTextNode(c.from + " ─ "));
        li.appendChild(who);
        li.appendChild(doc.createTextNode(" · " + c.role));
        if (c.to === "mike") li.className = "is-ok";
        links.appendChild(li);
      });
      paperTabs.forEach(function (tab) {
        var on = tab.getAttribute("data-paper") === current;
        tab.setAttribute("aria-pressed", on ? "true" : "false");
      });
      reqStatus.textContent = "";
    }

    paperTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        current = tab.getAttribute("data-paper");
        update();
        if (receiptBox && current === "receipt" && !wasReceipt) {
          receiptBox.classList.remove("is-printing");
          void receiptBox.offsetWidth;
          receiptBox.classList.add("is-printing");
        }
        wasReceipt = current === "receipt";
      });
    });
    boxes.forEach(function (b) { b.addEventListener("change", update); });
    Object.keys(fields).forEach(function (key) { if (fields[key]) fields[key].addEventListener("input", update); });
    $("[data-req-copy]").addEventListener("click", function () {
      copy(preview.textContent).then(function (ok) { reqStatus.textContent = ok ? "copied." : "select the text above to copy it."; });
    });
    $("[data-req-save]").addEventListener("click", function () {
      var type = PAPERS[current].file === "json" ? "application/json" : "text/plain";
      var url = URL.createObjectURL(new Blob([preview.textContent + "\n"], { type: type }));
      var a = doc.createElement("a");
      a.href = url;
      a.download = "officenoun-" + current + "." + PAPERS[current].file;
      doc.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      reqStatus.textContent = "saved " + a.download + ".";
    });
    var saveCard = $("[data-receipt-save]");
    if (saveCard) saveCard.addEventListener("click", function () {
      if (!state.receipt) return;
      var url = URL.createObjectURL(new Blob([state.receipt.svg], { type: "image/svg+xml" }));
      var a = doc.createElement("a");
      a.href = url;
      a.download = "officenoun-receipt-" + state.receipt.task.toLowerCase().replace(/[^a-z0-9-]/g, "") + ".svg";
      doc.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      reqStatus.textContent = "saved " + a.download + ".";
    });
    $("[data-req-post]").addEventListener("click", function (event) {
      postOrFallback({ topic: TASKS_TOPIC, body: preview.textContent, name: postName() || clean(fields.lead.value), statusEl: reqStatus, button: event.currentTarget });
    });
    update();
  }

  globalThis.OfficeDoors = { make: make, requisition: requisition, paper: paper, brief: brief, connections: connections, papers: PAPERS, receiptCard: receiptCard, postToLoom: postToLoom, hash: hash, doors: DOORS, packages: PACKAGES, version: "1.3.0" };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { mount(document); });
    else mount(document);
  }
})();
