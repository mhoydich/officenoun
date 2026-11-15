/* office rent. CC0. rent an office noun by the shift: pick a noun from your desk tag, pick a plan,
   talk to it. noggles 1 / noggles mini answer through pointcast.xyz/api/noggles (claude by anthropic);
   the intern answers from the doors' word lists in the browser and never goes online.
   needs office-traits.js, office-noun.js and office-doors.js first. user text only ever goes in via
   textContent. nothing is stored. */
(function () {
  "use strict";

  var API = "https://pointcast.xyz/api/noggles";
  var MAX_TURNS = 12;
  var NAMES = { fulltime: "Noggles 1", temp: "Noggles Mini", intern: "the intern" };

  function doors() { return globalThis.OfficeDoors; }

  // same desk tag, same noun. never change the seed recipe, or rented nouns change.
  function nounForTag(tag, roll) {
    var key = "rent:" + String(tag || "").trim().toLowerCase() + ":" + (roll || 0);
    var no = 11 + (doors().hash(key) % 9989);
    var noun = globalThis.OfficeNoun.forDay(no);
    return {
      no: no,
      noun: noun,
      head: noun.parts ? noun.parts.head.label.replace(/ head$/, "") : "stapler",
      glasses: noun.parts ? noun.parts.glasses.label : "noggles",
      description: noun.description
    };
  }

  // the intern: word lists only. picks a door from the words it hears.
  function intern(text, who) {
    var t = String(text || "").toLowerCase();
    var seed = t.replace(/^(write me|pitch me|make me|give me|lunch from|a poem about|five lines about)\s+/, "").slice(0, 80) || "the office";
    if (/outcome|done when|goal/.test(t)) {
      var goal = seed.replace(/^.*?:\s*/, "") || "the thing";
      return [
        "intern here (word lists, no ai). my best shot:",
        "outcome: " + goal + ".",
        "done when: someone who isn't you can see it happened, and says so on the board.",
        "next: take it to officenoun.xyz/doors and fill in the requisition."
      ].join("\n");
    }
    var door = /lunch|recipe|fridge|cook|eat|eggs|rice/.test(t) ? "recipe" : /show|sketch|tv|episode|pitch|union/.test(t) ? "show" : "poem";
    var card = doors().make(door, door === "recipe" ? seed.replace(/^.*?from\s+/, "") : seed);
    return ["intern here (word lists, no ai). " + card.title + ":"].concat(card.lines).join("\n");
  }

  function mount(doc) {
    var $ = function (sel) { return doc.querySelector(sel); };
    var log = $("[data-chat-log]");
    if (!log) return;
    var input = $("[data-chat-input]");
    var form = $("[data-chat-form]");
    var stateEl = $("[data-chat-state]");
    var nameEl = $("[data-chat-name]");
    var meta = $("[data-chat-meta]");
    var tagInput = $("[data-desk-tag]");
    var plans = Array.prototype.slice.call(doc.querySelectorAll("[data-plan]"));
    var state = { plan: "fulltime", roll: 0, who: null, history: [], open: null, busy: false };

    function setNoun() {
      state.who = nounForTag(tagInput.value || "a visitor", state.roll);
      var src = globalThis.OfficeNoun.src(state.who.noun, "..");
      $("[data-noun-art]").src = src;
      $("[data-noun-art]").alt = "office noun no. " + state.who.no + ": " + state.who.description;
      $("[data-chat-avatar]").src = src;
      $("[data-noun-no]").textContent = String(state.who.no);
      $("[data-noun-desc]").textContent = state.who.description + ".";
    }

    function setState() {
      nameEl.textContent = NAMES[state.plan] + " · noun no. " + state.who.no;
      if (state.plan === "intern") stateEl.textContent = "on shift · word lists, no ai";
      else if (state.open === null) stateEl.textContent = "checking the desk…";
      else if (state.open) stateEl.textContent = "on shift · runs on claude by anthropic";
      else stateEl.textContent = "at lunch · the intern is covering";
    }

    function bubble(role, text) {
      var li = doc.createElement("li");
      li.className = "rn-msg rn-" + role;
      text.split("\n").forEach(function (line, i) {
        if (i) li.appendChild(doc.createElement("br"));
        li.appendChild(doc.createTextNode(line));
      });
      log.appendChild(li);
      log.scrollTop = log.scrollHeight;
      return li;
    }

    function greet() {
      bubble("noun", "clocked in. i'm noun no. " + state.who.no + ", " + state.who.description + ". what are we making?");
    }

    function reply(text, viaIntern) {
      state.history.push({ role: "assistant", content: text });
      state.history = state.history.slice(-MAX_TURNS);
      bubble(viaIntern ? "noun rn-intern" : "noun", text);
    }

    function send(text) {
      text = String(text || "").trim().slice(0, 1200);
      if (!text || state.busy) return;
      bubble("you", text);
      state.history.push({ role: "user", content: text });
      state.history = state.history.slice(-MAX_TURNS);
      input.value = "";
      if (state.plan === "intern" || state.open === false) { reply(intern(text, state.who), true); return; }
      state.busy = true;
      var typing = bubble("noun rn-typing", "…");
      fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: state.plan,
          noun: { no: state.who.no, head: state.who.head, glasses: state.who.glasses, desk: tagInput.value },
          messages: state.history
        })
      }).then(function (res) {
        return res.json().then(function (data) { return { status: res.status, data: data }; });
      }).then(function (r) {
        typing.remove();
        if (r.data && r.data.ok && r.data.reply) { reply(r.data.reply, false); meta.textContent = r.data.model ? "answered by " + r.data.name : ""; return; }
        if (r.status === 503 && r.data && r.data.error === "not_configured") { state.open = false; setState(); }
        var why = r.data && r.data.message ? r.data.message : "the desk didn't answer.";
        reply(why + "\n" + intern(text, state.who), true);
      }, function () {
        typing.remove();
        reply("can't reach the desk right now.\n" + intern(text, state.who), true);
      }).then(function () { state.busy = false; });
    }

    plans.forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.plan = btn.getAttribute("data-plan");
        plans.forEach(function (b) { b.setAttribute("aria-checked", b === btn ? "true" : "false"); });
        setState();
      });
    });
    tagInput.addEventListener("change", function () { state.roll = 0; setNoun(); setState(); });
    $("[data-noun-reroll]").addEventListener("click", function () { state.roll += 1; setNoun(); setState(); });
    form.addEventListener("submit", function (event) { event.preventDefault(); send(input.value); });
    Array.prototype.slice.call(doc.querySelectorAll("[data-chip]")).forEach(function (chip) {
      chip.addEventListener("click", function () { send(chip.getAttribute("data-chip")); });
    });
    $("[data-chat-end]").addEventListener("click", function () {
      state.history = [];
      log.textContent = "";
      bubble("system", "shift ended. the noun forgot everything.");
      greet();
    });

    setNoun();
    setState();
    greet();
    if (typeof fetch === "function") {
      fetch(API, { method: "GET" }).then(function (res) { return res.json(); }).then(function (data) {
        state.open = !!(data && data.ok && data.open);
        setState();
      }, function () { state.open = false; setState(); });
    }
  }

  globalThis.OfficeRent = { nounForTag: nounForTag, intern: intern, api: API, version: "1.0.0" };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { mount(document); });
    else mount(document);
  }
})();
