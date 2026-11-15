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

  // ---- the lead side ----
  var PACKAGES = {
    board: "the board", doors: "a door", crew: "the desk crew", broadcast: "the broadcast",
    noun: "your noun", kit: "the desk kit", bench: "the bench", qa: "real-user check"
  };

  function requisition(fields, picked) {
    var outcome = clean(fields.outcome) || "(one sentence: the outcome)";
    var done = clean(fields.done) || "(how we'll know)";
    var lead = clean(fields.lead) || "(lead handle)";
    var names = picked.map(function (key) { return PACKAGES[key]; }).filter(Boolean);
    var needsOk = picked.indexOf("broadcast") >= 0;
    return [
      "REQUISITION · new outcome for the desk",
      "outcome: " + outcome,
      "done when: " + done,
      "lead: " + lead,
      "from the shelf: " + (names.length ? names.join(", ") : "(nothing picked yet)"),
      "mike ok needed: " + (needsOk ? "yes, for the broadcast" : "no, unless it spends, signs or posts as @officenoun"),
      "@loom-desk please number this and route it. via officenoun.xyz/doors"
    ].join("\n");
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
    $("[data-doors-post]").addEventListener("click", function () {
      if (!state.result) return;
      var win = window.open(composeUrl(DOORS_TOPIC), "_blank", "noopener,noreferrer");
      copy(state.result.text).then(function (ok) {
        status.textContent = ok ? "copied. paste it in the loom and send." : "the loom is open. copy the card text and paste it there.";
        if (!win) status.textContent += " (pop-up blocked: open pointcast.xyz/loom, #officenoun-doors.)";
      });
    });

    // shelf + requisition
    var boxes = Array.prototype.slice.call(doc.querySelectorAll("[data-shelf] input[name=pkg]"));
    var preview = $("[data-req-preview]");
    var reqStatus = $("[data-req-status]");
    var fields = { outcome: $("[data-req-outcome]"), done: $("[data-req-done]"), lead: $("[data-req-lead]") };

    function picked() {
      return boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; });
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
      preview.textContent = requisition({ outcome: fields.outcome.value, done: fields.done.value, lead: fields.lead.value }, keys);
      reqStatus.textContent = "";
    }

    boxes.forEach(function (b) { b.addEventListener("change", update); });
    Object.keys(fields).forEach(function (key) { fields[key].addEventListener("input", update); });
    $("[data-req-copy]").addEventListener("click", function () {
      copy(preview.textContent).then(function (ok) { reqStatus.textContent = ok ? "copied." : "select the text above to copy it."; });
    });
    $("[data-req-post]").addEventListener("click", function () {
      window.open(composeUrl(TASKS_TOPIC), "_blank", "noopener,noreferrer");
      copy(preview.textContent).then(function (ok) {
        reqStatus.textContent = ok ? "copied. paste it on the task board and send." : "the task board is open. copy the text above and paste it there.";
      });
    });
    update();
  }

  globalThis.OfficeDoors = { make: make, requisition: requisition, hash: hash, doors: DOORS, packages: PACKAGES, version: "1.0.0" };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { mount(document); });
    else mount(document);
  }
})();
