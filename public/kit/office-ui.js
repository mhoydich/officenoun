/* office ui kit · v1 · CC0 · optional behaviour for office-ui.css
 *
 *   tabs       <nav class="ou-tabs" data-ou-tabs> <a href="#a" data-ou-tab="a">…</a> </nav>
 *              <section data-ou-panel="a">…</section>  (one panel shows; the hash keeps it linkable)
 *   two taps   <button class="ou-pill" data-ou-arm="Tap again to post">Post</button>
 *              the first tap arms it for 6 s; the second fires an "ou:confirm" event on the button
 *   hearth     <article class="ou-gate" data-ou-hearth="https://…/hearth-loop.mp4"> … <button data-ou-light>Light</button>
 *              lights on tap only; reduced motion keeps the still picture
 *
 * No network calls, no storage beyond the URL hash, nothing inserted as HTML.
 */
(function () {
  "use strict";
  function stillOnly() { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }

  function tabs(nav) {
    var links = Array.prototype.slice.call(nav.querySelectorAll("[data-ou-tab]"));
    var ids = links.map(function (a) { return a.getAttribute("data-ou-tab"); });
    function show(id, push) {
      if (ids.indexOf(id) < 0) id = ids[0];
      links.forEach(function (a) { if (a.getAttribute("data-ou-tab") === id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
      ids.forEach(function (x) { document.querySelectorAll('[data-ou-panel="' + x + '"]').forEach(function (p) { p.hidden = x !== id; }); });
      if (push && history.replaceState) history.replaceState(null, "", "#" + id);
    }
    links.forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); show(a.getAttribute("data-ou-tab"), true); }); });
    window.addEventListener("hashchange", function () { var h = location.hash.slice(1); if (ids.indexOf(h) >= 0) show(h, false); });
    var h = location.hash.slice(1);
    show(ids.indexOf(h) >= 0 ? h : ids[0], false);
  }

  function arm(btn) {
    var label = btn.textContent, timer = 0;
    btn.addEventListener("click", function () {
      if (btn.dataset.armed !== "1") {
        btn.dataset.armed = "1"; btn.textContent = btn.getAttribute("data-ou-arm") || "Tap again";
        clearTimeout(timer); timer = setTimeout(function () { btn.dataset.armed = ""; btn.textContent = label; }, 6000);
        return;
      }
      clearTimeout(timer); btn.dataset.armed = ""; btn.textContent = label;
      btn.dispatchEvent(new CustomEvent("ou:confirm", { bubbles: true }));
    });
  }

  function hearth(card) {
    var src = card.getAttribute("data-ou-hearth");
    card.querySelectorAll("[data-ou-light]").forEach(function (b) {
      b.addEventListener("click", function () {
        var lit = card.classList.toggle("lit"), v = card.querySelector("video");
        if (!v) return;
        if (lit && !stillOnly()) { if (!v.src && src && /^https:\/\//.test(src)) v.src = src; var p = v.play(); if (p && p.catch) p.catch(function () {}); }
        else { try { v.pause(); } catch (e) {} }
      });
    });
  }

  function start(root) {
    (root || document).querySelectorAll(".ou [data-ou-tabs], [data-ou-tabs]").forEach(function (n) { if (!n.__ou) { n.__ou = 1; tabs(n); } });
    (root || document).querySelectorAll("[data-ou-arm]").forEach(function (n) { if (!n.__ou) { n.__ou = 1; arm(n); } });
    (root || document).querySelectorAll("[data-ou-hearth]").forEach(function (n) { if (!n.__ou) { n.__ou = 1; hearth(n); } });
  }
  window.OfficeUI = { start: start, version: "1" };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { start(); }); else start();
})();
