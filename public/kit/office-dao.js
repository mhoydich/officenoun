/* office dao builder, v0. CC0. one classic script, no dependencies. global: OfficeDao.
   drafts a dao charter in office terms. it never originates a contract, never builds or sends an operation,
   and never holds tez. the only wallet use is optional: tezos-door.js signs a plain text line that carries
   the charter's hash. all dom is built with createElement and textContent. nothing is inserted as html. */
(function (root) {
  "use strict";

  var SPEC = "officenoun.charter/v0";
  var ADDRESS = /^(tz[1-3]|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/;
  var SIGNER = /^tz[1-3][1-9A-HJ-NP-Za-km-z]{33}$/;
  var POWERS = [
    ["mint", "mint editions"],
    ["names", "buy names"],
    ["pay", "pay people"],
    ["rules", "change its own rules"]
  ];
  var MAX_SUPPLY = 1000000000000;

  // ---- pure functions (tested in test/office-dao.test.mjs) ----

  function oneLine(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isAddress(value) {
    return typeof value === "string" && value.length === 36 && ADDRESS.test(value);
  }

  function toInt(value) {
    var text = String(value === undefined || value === null ? "" : value).trim().replace(/,/g, "");
    return /^\d{1,13}$/.test(text) ? Number(text) : NaN;
  }

  function toTez(value) {
    var text = String(value === undefined || value === null ? "" : value).trim();
    return /^\d{1,7}(\.\d{1,6})?$/.test(text) ? Number(text) : NaN;
  }

  function cleanSymbol(value) {
    return oneLine(value).toUpperCase();
  }

  // returns { ok, errors }. errors is a flat map of key -> plain text. keys: name purpose symbol supply
  // holders (the sum), holderN.address, holderN.amount, treasury periodDays quorum deposit powers.
  function validate(form) {
    var f = form || {};
    var errors = {};
    var name = oneLine(f.name);
    var purpose = oneLine(f.purpose);
    if (!name) errors.name = "the office needs a name.";
    else if (name.length > 60) errors.name = "name is over 60 characters.";
    if (!purpose) errors.purpose = "say what it is for, in one line.";
    else if (purpose.length > 140) errors.purpose = "purpose is over 140 characters.";
    if (!/^[A-Z]{3,5}$/.test(cleanSymbol(f.symbol))) errors.symbol = "symbol is 3 to 5 letters.";

    var supply = toInt(f.supply);
    if (!(supply >= 1 && supply <= MAX_SUPPLY)) errors.supply = "supply is a whole number from 1 to 1,000,000,000,000.";

    var holders = Array.isArray(f.holders) ? f.holders : [];
    var sum = 0;
    var seen = {};
    var rowsOk = holders.length > 0;
    holders.forEach(function (row, i) {
      var address = oneLine(row && row.address);
      var amount = toInt(row && row.amount);
      if (!isAddress(address)) { errors["holder" + i + ".address"] = "not a tz1, tz2, tz3 or KT1 address (36 characters)."; rowsOk = false; }
      else if (seen[address]) { errors["holder" + i + ".address"] = "this address is already listed."; rowsOk = false; }
      seen[address] = true;
      if (!(amount >= 1)) { errors["holder" + i + ".amount"] = "amount is a whole number, 1 or more."; rowsOk = false; }
      else sum += amount;
    });
    if (!holders.length) errors.holders = "list at least one holder.";
    else if (rowsOk && supply >= 1 && sum !== supply) {
      errors.holders = "first tokens add up to " + sum + ". supply is " + supply + ".";
    } else if (!rowsOk && !errors.holders) errors.holders = "fix the rows above.";

    if (!(toTez(f.treasury) >= 0)) errors.treasury = "treasury seed is a number of tez, 0 or more.";
    var days = toInt(f.periodDays);
    if (!(days >= 1 && days <= 30)) errors.periodDays = "voting period is 1 to 30 days.";
    var quorum = toInt(f.quorum);
    if (!(quorum >= 1 && quorum <= 100)) errors.quorum = "quorum is 1 to 100 percent.";
    var deposit = toInt(f.deposit);
    if (!(deposit >= 0)) errors.deposit = "deposit is a whole number of tokens, 0 or more.";
    else if (supply >= 1 && deposit > supply) errors.deposit = "deposit cannot be more than the supply.";
    var powers = Array.isArray(f.powers) ? f.powers : [];
    if (!POWERS.some(function (p) { return powers.indexOf(p[0]) !== -1; })) errors.powers = "pick at least one thing it may do.";

    return { ok: Object.keys(errors).length === 0, errors: errors };
  }

  // form must already pass validate(). now is a ms timestamp.
  function buildCharter(form, now) {
    return {
      spec: SPEC,
      name: oneLine(form.name),
      purpose: oneLine(form.purpose),
      token: {
        symbol: cleanSymbol(form.symbol),
        supply: toInt(form.supply),
        holders: form.holders.map(function (row) {
          return { address: oneLine(row.address), amount: toInt(row.amount) };
        })
      },
      treasurySeedTez: toTez(form.treasury),
      voting: { periodDays: toInt(form.periodDays), quorumPct: toInt(form.quorum), depositTokens: toInt(form.deposit) },
      powers: POWERS.filter(function (p) { return form.powers.indexOf(p[0]) !== -1; }).map(function (p) { return p[1]; }),
      createdAt: new Date(now).toISOString(),
      signedBy: null
    };
  }

  // sorted keys, no whitespace. the same charter always gives the same string.
  function canonicalJson(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
    return "{" + Object.keys(value).sort().map(function (k) {
      return JSON.stringify(k) + ":" + canonicalJson(value[k]);
    }).join(",") + "}";
  }

  function base64url(bytes) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    var out = "";
    for (var i = 0; i < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63];
      if (i + 1 < bytes.length) out += chars[(n >> 6) & 63];
      if (i + 2 < bytes.length) out += chars[n & 63];
    }
    return out;
  }

  // sha-256 of the canonical charter with signedBy forced to null, as 43 characters of base64url.
  // it is used as the door's nonce, so the signed line names exactly this charter.
  function charterNonce(charter) {
    var subtle = root.crypto && root.crypto.subtle;
    if (!subtle) return Promise.reject(new Error("no crypto"));
    var copy = {};
    Object.keys(charter).forEach(function (k) { copy[k] = charter[k]; });
    copy.signedBy = null;
    return subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(copy))).then(function (buf) {
      return base64url(new Uint8Array(buf));
    });
  }

  // ---- browser only ----

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.setAttribute("class", className);
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function button(text, onClick, quiet) {
    var b = el("button", "od-button" + (quiet ? " od-quiet" : ""), text);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  function short(address) {
    return address.slice(0, 6) + "…" + address.slice(-4);
  }

  // live treasury balance from tzkt. text only, graceful failure.
  function loadTreasury(node) {
    var contract = node.getAttribute("data-od-contract") || "";
    if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(contract)) return;
    node.textContent = "loading treasury.";
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
    fetch("https://api.tzkt.io/v1/accounts/" + contract, ctl ? { signal: ctl.signal } : undefined)
      .then(function (r) { if (!r.ok) throw new Error("status"); return r.json(); })
      .then(function (data) {
        var mutez = data && data.balance;
        if (typeof mutez !== "number" || !isFinite(mutez) || mutez < 0 || mutez > 1e18) throw new Error("shape");
        node.textContent = "treasury: " + (mutez / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 }) + " tez.";
      })
      .catch(function () { node.textContent = "could not reach tzkt. treasury balance unknown."; })
      .then(function () { clearTimeout(timer); });
  }

  function mountBuilder(host, out, signNode, door) {
    var form = {
      name: "", purpose: "", symbol: "DESK", supply: "81000",
      holders: [{ address: "", amount: "81000" }],
      treasury: "5", periodDays: "3", quorum: "20", deposit: "100", powers: ["mint", "pay"]
    };
    var touched = {};
    var state = { charter: null, nonce: "", signed: null, token: 0 };
    var errorNodes = {};
    var holderBox = el("div", "od-holders");
    var sumLine = el("p", "od-hint");
    var memoBox = el("div", "od-memo-box");
    var json = el("textarea", "od-json");
    var tools = el("p", "od-tools");
    var toolNote = el("span", "od-note");
    var signStatus = signNode.querySelector("[data-od-sign-status]");
    var walletLine = "signing needs a wallet and is optional.";
    var lastIssue = "";

    json.readOnly = true;
    json.rows = 16;
    json.setAttribute("aria-label", "charter as json");
    json.setAttribute("spellcheck", "false");

    function errorFor(key, id) {
      var p = el("p", "od-error");
      p.id = id;
      errorNodes[key] = p;
      return p;
    }

    function field(key, labelText, hint, type, extra) {
      var wrap = el("div", "od-field");
      var id = "od-" + key;
      var label = el("label", "", labelText);
      label.setAttribute("for", id);
      var input = el("input");
      input.type = type || "text";
      input.id = id;
      input.value = form[key];
      input.setAttribute("aria-describedby", id + "-hint " + id + "-err");
      if (extra) Object.keys(extra).forEach(function (k) { input.setAttribute(k, extra[k]); });
      input.addEventListener("input", function () { form[key] = input.value; touched[key] = true; refresh(); });
      input.addEventListener("blur", function () { touched[key] = true; refresh(); });
      var h = el("p", "od-hint", hint);
      h.id = id + "-hint";
      wrap.appendChild(label);
      wrap.appendChild(input);
      wrap.appendChild(h);
      wrap.appendChild(errorFor(key, id + "-err"));
      return wrap;
    }

    function holderRow(row, i) {
      var li = el("li", "od-row");
      var a = el("input");
      var m = el("input");
      var ae = el("p", "od-error");
      var me = el("p", "od-error");
      a.type = "text"; m.type = "text";
      a.id = "od-h" + i + "a"; m.id = "od-h" + i + "m";
      a.value = row.address; m.value = row.amount;
      a.setAttribute("aria-label", "holder " + (i + 1) + " address");
      m.setAttribute("aria-label", "holder " + (i + 1) + " amount");
      m.setAttribute("inputmode", "numeric");
      a.setAttribute("autocomplete", "off");
      a.setAttribute("spellcheck", "false");
      ae.id = a.id + "-err"; me.id = m.id + "-err";
      a.setAttribute("aria-describedby", ae.id); m.setAttribute("aria-describedby", me.id);
      errorNodes["holder" + i + ".address"] = ae;
      errorNodes["holder" + i + ".amount"] = me;
      a.addEventListener("input", function () { row.address = a.value; touched.holders = touched["holder" + i + ".address"] = true; refresh(); });
      m.addEventListener("input", function () { row.amount = m.value; touched.holders = touched["holder" + i + ".amount"] = true; refresh(); });
      a.addEventListener("blur", function () { touched["holder" + i + ".address"] = true; refresh(); });
      m.addEventListener("blur", function () { touched["holder" + i + ".amount"] = true; refresh(); });
      var rm = button("remove", function () {
        form.holders.splice(i, 1);
        drawHolders();
        refresh();
        addBtn.focus();
      }, true);
      rm.setAttribute("aria-label", "remove holder " + (i + 1));
      if (form.holders.length < 2) rm.disabled = true;
      var inputs = el("div", "od-row-inputs");
      inputs.appendChild(a); inputs.appendChild(m); inputs.appendChild(rm);
      li.appendChild(inputs); li.appendChild(ae); li.appendChild(me);
      return li;
    }

    function drawHolders() {
      Object.keys(errorNodes).forEach(function (k) { if (/^holder\d/.test(k)) delete errorNodes[k]; });
      while (holderBox.firstChild) holderBox.removeChild(holderBox.firstChild);
      var ol = el("ol", "od-rows");
      form.holders.forEach(function (row, i) { ol.appendChild(holderRow(row, i)); });
      holderBox.appendChild(ol);
    }

    var addBtn = button("add a holder", function () {
      form.holders.push({ address: "", amount: "" });
      drawHolders();
      refresh();
      var last = document.getElementById("od-h" + (form.holders.length - 1) + "a");
      if (last) last.focus();
    }, true);

    function powerBoxes() {
      var fs = el("fieldset", "od-powers");
      fs.appendChild(el("legend", "", "what the office may do"));
      POWERS.forEach(function (p) {
        var label = el("label", "od-check");
        var box = el("input");
        box.type = "checkbox";
        box.checked = form.powers.indexOf(p[0]) !== -1;
        box.addEventListener("change", function () {
          form.powers = form.powers.filter(function (x) { return x !== p[0]; });
          if (box.checked) form.powers.push(p[0]);
          touched.powers = true;
          refresh();
        });
        label.appendChild(box);
        label.appendChild(document.createTextNode(" " + p[1]));
        fs.appendChild(label);
      });
      fs.appendChild(errorFor("powers", "od-powers-err"));
      return fs;
    }

    function memo(c) {
      var art = el("article", "od-memo");
      art.appendChild(el("h3", "", "memo. charter for " + c.name));
      var dl = el("dl");
      function row(k, v) { dl.appendChild(el("dt", "", k)); dl.appendChild(el("dd", "", v)); }
      row("from", c.name);
      row("date", c.createdAt.slice(0, 10));
      row("purpose", c.purpose);
      row("token", c.token.supply.toLocaleString("en-US") + " " + c.token.symbol);
      row("treasury", c.treasurySeedTez + " tez to start");
      row("voting", c.voting.periodDays + " day" + (c.voting.periodDays === 1 ? "" : "s") + ", " + c.voting.quorumPct + "% quorum, " +
        c.voting.depositTokens.toLocaleString("en-US") + " " + c.token.symbol + " to put up a proposal");
      row("it may", c.powers.join(", "));
      row("signed", c.signedBy ? "by " + short(c.signedBy.address) + ". not checked." : "not signed");
      art.appendChild(dl);
      art.appendChild(el("p", "od-memo-sub", "first tokens"));
      var ul = el("ul");
      c.token.holders.forEach(function (h) {
        ul.appendChild(el("li", "", short(h.address) + "  " + h.amount.toLocaleString("en-US") + " " + c.token.symbol));
      });
      art.appendChild(ul);
      return art;
    }

    function renderOutput() {
      while (memoBox.firstChild) memoBox.removeChild(memoBox.firstChild);
      if (!state.charter) {
        json.value = "";
        json.disabled = true;
        copyBtn.disabled = true;
        saveBtn.disabled = true;
        memoBox.appendChild(el("p", "od-hint", "fix the notes above and the charter shows up here."));
        return;
      }
      var shown = Object.assign({}, state.charter, { signedBy: state.signed });
      memoBox.appendChild(memo(shown));
      json.disabled = false;
      json.value = JSON.stringify(shown, null, 2);
      copyBtn.disabled = false;
      saveBtn.disabled = false;
    }

    function say(text) { if (signStatus) signStatus.textContent = text; }

    function refresh() {
      var result = validate(form);
      Object.keys(errorNodes).forEach(function (k) {
        var show = touched[k] && result.errors[k];
        errorNodes[k].textContent = show ? result.errors[k] : "";
      });
      var sum = 0;
      form.holders.forEach(function (r) { var n = toInt(r.amount); if (n >= 1) sum += n; });
      sumLine.textContent = "first tokens so far: " + sum.toLocaleString("en-US") + " of " +
        (toInt(form.supply) >= 1 ? toInt(form.supply).toLocaleString("en-US") : "?") + ".";
      var holdersErr = touched.holders && result.errors.holders;
      if (holdersErr) sumLine.textContent += " " + result.errors.holders;
      sumLine.setAttribute("class", holdersErr ? "od-error" : "od-hint");

      if (state.signed) say("charter changed. sign again.");
      state.signed = null;
      state.token += 1;
      var token = state.token;
      state.nonce = "";
      if (door) door.setAttribute("data-nonce", "x"); // too short on purpose: the door refuses until a charter is ready
      if (!result.ok) {
        state.charter = null;
        renderOutput();
        return;
      }
      state.charter = buildCharter(form, Date.now());
      renderOutput();
      charterNonce(state.charter).then(function (nonce) {
        if (token !== state.token) return;
        state.nonce = nonce;
        if (door) door.setAttribute("data-nonce", nonce);
      }, function () {
        if (token === state.token) say("this browser cannot hash the charter, so signing is off here.");
      });
    }

    var copyBtn = button("copy json", function () {
      var text = json.value;
      function done(ok) { toolNote.textContent = ok ? "copied." : "copy failed. select the text and copy by hand."; }
      if (root.navigator && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      } else {
        json.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
        done(ok);
      }
    });
    var saveBtn = button("download json", function () {
      var slug = state.charter.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "office";
      var blob = new Blob([json.value + "\n"], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = el("a");
      a.href = url;
      a.download = slug + "-charter.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toolNote.textContent = "saved as " + slug + "-charter.json.";
    });

    // wallet side: optional. the door signs; this only listens.
    if (!door || !root.TezosDoor) {
      say("signing needs tezos-door.js, which did not load. it is optional.");
    } else {
      say(walletLine);
      document.addEventListener("tezosdoor:connect", function (e) {
        var a = e.detail && e.detail.address;
        if (typeof a === "string" && SIGNER.test(a)) say("connected as " + short(a) + ". use sign in on the door above to sign this charter. it moves nothing.");
      });
      var gone = function () { state.signed = null; renderOutput(); say(walletLine); };
      document.addEventListener("tezosdoor:disconnect", gone);
      document.addEventListener("tezosdoor:signout", function () { if (state.signed) { state.signed = null; renderOutput(); } say(walletLine); });
      document.addEventListener("tezosdoor:signin", function (e) {
        var s = e.detail || {};
        var lines = typeof s.message === "string" ? s.message.split("\n") : [];
        if (!state.charter || !state.nonce || lines.indexOf("nonce: " + state.nonce) === -1) {
          say("that sign-in was not for this charter. nothing recorded.");
          return;
        }
        if (typeof s.address !== "string" || !SIGNER.test(s.address) || typeof s.signature !== "string" || !s.signature) {
          say("the wallet sent back something unusable. nothing recorded.");
          return;
        }
        state.signed = { address: s.address, publicKey: String(s.publicKey || ""), signature: s.signature, message: s.message };
        renderOutput();
        say("signed by " + short(s.address) + ". this is a claim until someone checks the signature.");
      });
    }

    // build the form
    host.appendChild(field("name", "office name", "up to 60 characters.", "text", { maxlength: "120", autocomplete: "off" }));
    host.appendChild(field("purpose", "purpose", "one line. what is this office for.", "text", { maxlength: "300", autocomplete: "off" }));
    host.appendChild(field("symbol", "governance token symbol", "3 to 5 letters. shown in capitals.", "text", { maxlength: "8", autocomplete: "off" }));
    host.appendChild(field("supply", "token supply", "a whole number. all of it is handed out below.", "text", { inputmode: "numeric" }));
    var fs = el("fieldset", "od-holders-set");
    fs.appendChild(el("legend", "", "who gets the first tokens"));
    fs.appendChild(el("p", "od-hint", "one row per holder: a tez address, then an amount. the amounts must add up to the supply."));
    fs.appendChild(holderBox);
    fs.appendChild(addBtn);
    fs.appendChild(sumLine);
    host.appendChild(fs);
    host.appendChild(field("treasury", "treasury seed, in tez", "what the office starts with. v0 moves none of it.", "text", { inputmode: "decimal" }));
    host.appendChild(field("periodDays", "voting period, in days", "1 to 30.", "text", { inputmode: "numeric" }));
    host.appendChild(field("quorum", "quorum, percent", "how much of the supply has to vote. 1 to 100.", "text", { inputmode: "numeric" }));
    host.appendChild(field("deposit", "proposal deposit, in tokens", "held while a proposal is open. 0 for none.", "text", { inputmode: "numeric" }));
    host.appendChild(powerBoxes());
    drawHolders();

    out.appendChild(memoBox);
    out.appendChild(json);
    tools.appendChild(copyBtn);
    tools.appendChild(saveBtn);
    tools.appendChild(toolNote);
    out.appendChild(tools);
    refresh();
  }

  function init() {
    var host = document.querySelector("[data-od-builder]");
    var out = document.querySelector("[data-od-output]");
    var sign = document.querySelector("[data-od-sign]");
    if (host && out && sign) mountBuilder(host, out, sign, sign.querySelector("[data-tezos-door]"));
    var t = document.querySelector("[data-od-contract]");
    if (t) loadTreasury(t);
  }

  root.OfficeDao = {
    version: "0.1.0",
    spec: SPEC,
    powers: POWERS.map(function (p) { return p.slice(); }),
    isAddress: isAddress,
    validate: validate,
    buildCharter: buildCharter,
    canonicalJson: canonicalJson,
    charterNonce: charterNonce,
    base64url: base64url
  };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
