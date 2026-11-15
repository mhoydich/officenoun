/* Office Pools · one pool on screen at a time.
 * The six forks become tabs. The river chips and the tab bar both switch them;
 * the hash (#pump, #gvg, …) keeps the choice linkable. Without JS, every fork
 * shows, one after another, as before. app.js is untouched: nothing here
 * changes an id it uses. If app.js asks a hidden fork's form for attention
 * (clock-in first), the clock-in card is outside the forks, so it stays visible.
 */
(function () {
  "use strict";
  var FORKS = ["pump", "gvg", "desk", "weather", "noun", "fork"];
  var KEY = "officenoun-pools-tab";
  function start() {
    if (document.body.classList.contains("shot-ticket")) return;
    var tabs = document.getElementById("forktabs");
    if (!tabs) return;
    document.body.classList.add("tabbed");
    function pick(id, scroll) {
      if (FORKS.indexOf(id) < 0) id = "pump";
      FORKS.forEach(function (f) {
        var sec = document.getElementById(f);
        if (sec) sec.hidden = f !== id;
      });
      tabs.querySelectorAll("[data-tab]").forEach(function (a) {
        if (a.dataset.tab === id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      });
      document.querySelectorAll(".river-chip[data-fork]").forEach(function (c) {
        c.classList.toggle("on", c.dataset.fork === id);
      });
      try { localStorage.setItem(KEY, id); } catch (e) {}
      if (history.replaceState) history.replaceState(null, "", "#" + id);
      if (scroll) tabs.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    function wire(a, attr) {
      a.addEventListener("click", function (e) {
        var id = a.getAttribute(attr);
        if (FORKS.indexOf(id) < 0) return;
        e.preventDefault();
        pick(id, true);
      });
    }
    tabs.querySelectorAll("[data-tab]").forEach(function (a) { wire(a, "data-tab"); });
    document.querySelectorAll(".river-chip[data-fork]").forEach(function (a) { wire(a, "data-fork"); });
    window.addEventListener("hashchange", function () { var h = location.hash.slice(1); if (FORKS.indexOf(h) >= 0) pick(h, false); });
    var hash = location.hash.slice(1), saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    pick(FORKS.indexOf(hash) >= 0 ? hash : (saved || "pump"), false);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
