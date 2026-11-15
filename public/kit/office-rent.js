/* office rent. CC0. the temp pool: rent an office noun by the shift. pick a noun from the roster,
   pick a shift, talk to it. deskmate 1 / deskmate mini answer through pointcast.xyz/api/deskmate
   (claude by anthropic); the intern answers from the doors' word lists in the browser and never goes
   online. the roster is embedded in the page as json (#rn-roster-data), built from data/roster.json.
   needs office-traits.js, office-noun.js and office-doors.js first. user text only ever goes in via
   textContent. nothing is stored. */
(function () {
  "use strict";

  var API = "https://pointcast.xyz/api/deskmate";
  var MAX_TURNS = 12;
  var PLAN_NAMES = { fulltime: "Deskmate 1", temp: "Deskmate Mini", intern: "the intern" };
  var GENERAL_CHIPS = ["what are you good at?", "write me five lines about monday", "lunch from eggs, rice and scallions"];

  function doors() { return globalThis.OfficeDoors; }

  // the intern: word lists only. leans on the noun's own door, then on the words it hears.
  function intern(text, noun) {
    var t = String(text || "").toLowerCase();
    var name = noun && noun.name ? noun.name : "the intern";
    var lead = name + "'s intern here (word lists, no ai).";
    if (/what are you good at|who are you|what do you do/.test(t)) {
      return lead + " " + (noun ? noun.name + " is " + noun.title + ": " + noun.specialty + "." : "") + " i cover when the desk is out.";
    }
    var door = /lunch|recipe|fridge|cook|eat|eggs|rice/.test(t) ? "recipe"
      : /show|sketch|tv|episode|pitch|game/.test(t) ? "show"
      : /outcome|done when|goal|plan|requisition|paperwork/.test(t) ? "outcome"
      : /poem|lines|haiku|name/.test(t) ? "poem"
      : (noun && noun.door) || "poem";
    var seed = t.replace(/^.*?(about|from|for|:)\s+/, "").slice(0, 80) || "the office";
    if (door === "outcome") {
      return [
        lead + " my best shot:",
        "outcome: " + seed + ".",
        "done when: someone who isn't you can see it happened, and says so on the board.",
        "next: take it to officenoun.xyz/doors and fill in the requisition."
      ].join("\n");
    }
    var card = doors().make(door, seed);
    return [lead + " " + card.title + ":"].concat(card.lines).join("\n");
  }

  function readRoster(doc) {
    try {
      var el = doc.getElementById("rn-roster-data");
      var list = JSON.parse(el ? el.textContent : "[]");
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function mount(doc) {
    var $ = function (sel) { return doc.querySelector(sel); };
    var log = $("[data-chat-log]");
    if (!log) return;
    var roster = readRoster(doc);
    var bySlug = {};
    roster.forEach(function (n) { bySlug[n.slug] = n; });
    var input = $("[data-chat-input]");
    var form = $("[data-chat-form]");
    var stateEl = $("[data-chat-state]");
    var nameEl = $("[data-chat-name]");
    var meta = $("[data-chat-meta]");
    var chipsEl = $("[data-chat-chips]");
    var plans = Array.prototype.slice.call(doc.querySelectorAll("[data-plan]"));
    var cards = Array.prototype.slice.call(doc.querySelectorAll("[data-noun]"));
    var state = { plan: "fulltime", noun: roster[0] || null, history: [], open: null, backend: "", busy: false };

    function setState() {
      var who = state.noun ? state.noun.name : "your noun";
      nameEl.textContent = who + " · " + PLAN_NAMES[state.plan];
      if (state.plan === "intern") stateEl.textContent = "on shift · word lists, no ai";
      else if (state.open === null) stateEl.textContent = "checking the desk…";
      else if (state.open) stateEl.textContent = "on shift · deskmate runs on " + (state.backend || "claude by anthropic").toLowerCase();
      else stateEl.textContent = "at lunch · the intern is covering";
    }

    function bubble(role, text) {
      var li = doc.createElement("li");
      li.className = "rn-msg rn-" + role;
      String(text).split("\n").forEach(function (line, i) {
        if (i) li.appendChild(doc.createElement("br"));
        li.appendChild(doc.createTextNode(line));
      });
      log.appendChild(li);
      log.scrollTop = log.scrollHeight;
      return li;
    }

    function chips() {
      chipsEl.textContent = "";
      var list = (state.noun && state.noun.chip ? [state.noun.chip] : []).concat(GENERAL_CHIPS);
      list.forEach(function (text, i) {
        if (list.indexOf(text) !== i) return;
        var b = doc.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.addEventListener("click", function () { send(text); });
        chipsEl.appendChild(b);
      });
    }

    function greet() {
      if (!state.noun) return;
      bubble("noun", "clocked in. " + state.noun.name + ", " + state.noun.title + ", at your desk. job description: " + state.noun.specialty + ". what do you need?");
    }

    function pick(slug, quiet) {
      if (!bySlug[slug]) return;
      state.noun = bySlug[slug];
      state.history = [];
      cards.forEach(function (c) { c.setAttribute("aria-checked", c.getAttribute("data-noun") === slug ? "true" : "false"); });
      var avatar = $("[data-chat-avatar]");
      avatar.src = "roster/" + slug + ".svg";
      avatar.alt = state.noun.name;
      setState();
      chips();
      if (!quiet) { log.textContent = ""; greet(); }
    }

    function reply(text, viaIntern) {
      state.history.push({ role: "assistant", content: text });
      state.history = state.history.slice(-MAX_TURNS);
      bubble(viaIntern ? "noun rn-intern" : "noun", text);
    }

    function send(text) {
      text = String(text || "").trim().slice(0, 1200);
      if (!text || state.busy || !state.noun) return;
      bubble("you", text);
      state.history.push({ role: "user", content: text });
      state.history = state.history.slice(-MAX_TURNS);
      input.value = "";
      if (state.plan === "intern" || state.open === false) { reply(intern(text, state.noun), true); return; }
      state.busy = true;
      var typing = bubble("noun rn-typing", "…");
      fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: state.plan, noun: state.noun.slug, messages: state.history })
      }).then(function (res) {
        return res.json().then(function (data) { return { status: res.status, data: data }; });
      }).then(function (r) {
        typing.remove();
        if (r.data && r.data.ok && r.data.reply) { reply(r.data.reply, false); meta.textContent = r.data.plan ? "answered by " + r.data.plan + (r.data.model ? " (" + String(r.data.model).slice(0, 60) + ")" : "") : ""; return; }
        if (r.status === 503 && r.data && r.data.error === "not_configured") { state.open = false; setState(); }
        var why = r.data && r.data.message ? r.data.message : "the desk didn't answer.";
        reply(why + "\n" + intern(text, state.noun), true);
      }, function () {
        typing.remove();
        reply("can't reach the desk right now.\n" + intern(text, state.noun), true);
      }).then(function () { state.busy = false; });
    }

    cards.forEach(function (card) {
      card.addEventListener("click", function () {
        pick(card.getAttribute("data-noun"));
        var shift = doc.getElementById("shift");
        if (shift && shift.scrollIntoView) shift.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    plans.forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.plan = btn.getAttribute("data-plan");
        plans.forEach(function (b) { b.setAttribute("aria-checked", b === btn ? "true" : "false"); });
        setState();
      });
    });
    form.addEventListener("submit", function (event) { event.preventDefault(); send(input.value); });
    $("[data-chat-end]").addEventListener("click", function () {
      state.history = [];
      log.textContent = "";
      bubble("system", "shift ended. " + (state.noun ? state.noun.name : "the noun") + " forgot everything.");
      greet();
    });

    if (state.noun) pick(state.noun.slug, true);
    setState();
    greet();
    if (typeof fetch === "function") {
      fetch(API, { method: "GET" }).then(function (res) { return res.json(); }).then(function (data) {
        state.open = !!(data && data.ok && data.open);
        state.backend = data && typeof data.backend === "string" ? data.backend.slice(0, 80) : "";
        setState();
      }, function () { state.open = false; setState(); });
    }
  }

  globalThis.OfficeRent = { intern: intern, api: API, version: "2.0.0" };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { mount(document); });
    else mount(document);
  }
})();
