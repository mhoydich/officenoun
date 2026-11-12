/* tezos desk kit: the door. CC0. one classic script, no dependencies of its own.
   <div data-tezos-door></div>

   connect a tezos wallet and sign in with a plain text message. that is all it does.

   what it does not do:
   - it never builds, requests or sends an on-chain operation. the only wallet permission it asks for
     is "sign", and the only request it sends is a sign-payload request for a text message.
   - it never asks for or touches a secret key or seed phrase. the wallet holds the keys.
   - it does NOT verify the signature. the session object is a claim until a server checks the signature,
     derives the address from the public key, checks the nonce it issued itself, the host and uri lines,
     and that now is before "expires". until then it is only a claim.
   - a session left in sessionStorage by an earlier load is never treated as signed in. it is shown as
     "not checked" and getSession() returns null until a fresh sign-in on this page load.

   the beacon sdk (@airgap/beacon-sdk) is loaded lazily: nothing is fetched until the first click.
   all dom is built with createElement and textContent. wallet and sdk output is never inserted as html. */
(function () {
  "use strict";

  var VERSION = "1.0.0";
  var ADDRESS = /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/;

  // beacon sdk 4.8.1, single-file umd bundle (package.json "unpkg" field: dist/walletbeacon.min.js).
  // it sets the global "beacon". the sha-384 below is of that exact file.
  var DEFAULT_SDK = "https://unpkg.com/@airgap/beacon-sdk@4.8.1/dist/walletbeacon.min.js";
  var DEFAULT_SDK_INTEGRITY = "sha384-BRG93bqbyUWvDu3ImCSrlsOmHKakx1XM9AZiihMekRYBJinl0IKE5XZxTU14EG1K";
  var SDK_GLOBAL = "beacon";
  var SDK_TIMEOUT_MS = 20000;
  var NONCE_RE = /^[A-Za-z0-9_-]{8,128}$/;
  var INTEGRITY_RE = /^sha(256|384|512)-[A-Za-z0-9+\/]+={0,2}$/;
  var RESTORE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
  var EXPIRES_MS = 10 * 60 * 1000;
  var STORAGE_PREFIX = "tezosdoor:session:";
  var NOTE = "connecting shares your address. signing in moves nothing.";

  var sdkPromises = {}; // url -> promise, cleared on failure so "try again" can retry
  var clients = {}; // app|network -> DAppClient
  var instances = [];

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.setAttribute("class", className);
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function shortAddress(address) {
    return address.slice(0, 6) + "…" + address.slice(-4);
  }

  function oneLine(value, max) {
    var text = String(value === undefined || value === null ? "" : value);
    text = text.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
    return text.length > max ? text.slice(0, max) : text;
  }

  // printable ascii only (0x20 to 0x7e). everything else becomes "?".
  function ascii(value) {
    return String(value).replace(/[^\u0020-\u007e]/g, "?");
  }

  function hostName() {
    var host = "";
    try { host = window.location.hostname || ""; } catch (error) { host = ""; }
    return ascii(oneLine(host, 120)) || "this page";
  }

  function originName() {
    var origin = "";
    try { origin = window.location.origin || ""; } catch (error) { origin = ""; }
    return ascii(oneLine(origin, 200)) || "null";
  }

  // sdk url: https only (http only when the page itself is on localhost or 127.0.0.1, for local testing). relative urls resolve against the page.
  function safeSdkUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      var url = new URL(value.trim(), window.location.href);
      var page = window.location.hostname;
      var local = page === "localhost" || page === "127.0.0.1"; // the page, not the sdk host
      if (url.protocol === "https:" || (url.protocol === "http:" && local)) return url.href;
    } catch (error) { /* fall through */ }
    return "";
  }

  function toHex(bytes) {
    var out = "";
    for (var i = 0; i < bytes.length; i++) out += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
    return out;
  }

  function utf8(text) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(text);
    var binary = unescape(encodeURIComponent(text));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // micheline "string" payload for signing type "micheline":
  // 0x05 (the micheline signing prefix) + 0x01 (string node) + 4-byte big-endian length + utf-8 bytes, as hex.
  function payloadHex(message) {
    var body = utf8(message);
    var n = body.length;
    var head = new Uint8Array([0x05, 0x01, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
    return toHex(head) + toHex(body);
  }

  function makeNonce() {
    var c = window.crypto || window.msCrypto;
    if (!c || typeof c.getRandomValues !== "function") throw new Error("no crypto");
    var bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return toHex(bytes);
  }

  function buildMessage(host, statement, uri, network, address, nonce, issued, expires) {
    return [
      "Tezos Signed Message: " + host,
      statement,
      "uri: " + uri,
      "network: " + network,
      "address: " + address,
      "nonce: " + nonce,
      "issued: " + issued,
      "expires: " + expires
    ].join("\n");
  }

  // loads the beacon bundle by injecting one script tag. only ever called after a click.
  function loadSdk(url, integrity) {
    if (sdkPromises[url]) return sdkPromises[url];
    // a global "beacon" that is already on the page is never trusted: only the script injected here counts.
    var prior = window[SDK_GLOBAL];
    try { window[SDK_GLOBAL] = undefined; } catch (e) { /* ignore */ }
    var promise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      var done = false;
      var timer = setTimeout(function () { finish(new Error("timeout")); }, SDK_TIMEOUT_MS);
      function finish(error) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (error) {
          try { if (script.parentNode) script.parentNode.removeChild(script); } catch (e) { /* ignore */ }
          try { window[SDK_GLOBAL] = prior; } catch (e) { /* ignore */ }
          reject(error);
          return;
        }
        var sdk = window[SDK_GLOBAL];
        if (sdk && typeof sdk.DAppClient === "function") resolve(sdk);
        else reject(new Error("sdk missing"));
      }
      script.onload = function () { finish(null); };
      script.onerror = function () { finish(new Error("load failed")); };
      script.async = true;
      if (integrity) {
        script.setAttribute("integrity", integrity);
        script.setAttribute("crossorigin", "anonymous");
      }
      script.src = url;
      (document.head || document.documentElement).appendChild(script);
    });
    sdkPromises[url] = promise;
    promise.then(null, function () { delete sdkPromises[url]; });
    return promise;
  }

  function getClient(sdk, app, network) {
    var key = app + "|" + network;
    if (!clients[key]) {
      var origin = "";
      try { origin = window.location.origin; } catch (error) { origin = ""; }
      var options = { name: app, network: { type: network } };
      if (origin && origin !== "null") options.appUrl = origin;
      clients[key] = new sdk.DAppClient(options);
    }
    return clients[key];
  }

  function isCancel(error) {
    var type = error && error.errorType;
    return type === "ABORTED_ERROR" || type === "NOT_GRANTED_ERROR";
  }

  function plainError(error, network) {
    var type = error && error.errorType;
    if (type === "NETWORK_NOT_SUPPORTED") return "the wallet does not support " + network + ".";
    if (type === "SIGNATURE_TYPE_NOT_SUPPORTED") return "the wallet cannot sign a message this way.";
    return "the wallet did not complete that.";
  }

  function fire(root, name, detail) {
    var event;
    try {
      event = new CustomEvent(name, { bubbles: true, detail: detail });
    } catch (error) {
      event = document.createEvent("CustomEvent");
      event.initCustomEvent(name, true, false, detail);
    }
    try { root.dispatchEvent(event); } catch (error) { /* a listener must not break the door */ }
  }

  function storageKey(network) { return STORAGE_PREFIX + network; }

  function saveSession(network, session) {
    try { window.sessionStorage.setItem(storageKey(network), JSON.stringify(session)); } catch (error) { /* ignore */ }
  }

  function dropSession(network) {
    try { window.sessionStorage.removeItem(storageKey(network)); } catch (error) { /* ignore */ }
  }

  // shape and age check only. a restored session is never signed in: it is shown as "not checked".
  function loadSession(network) {
    try {
      var raw = window.sessionStorage.getItem(storageKey(network));
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || typeof s !== "object" || typeof s.address !== "string" || !ADDRESS.test(s.address)) {
        dropSession(network);
        return null;
      }
      var keys = ["publicKey", "message", "payloadHex", "signature", "issued", "expires"];
      var ok = true;
      for (var i = 0; i < keys.length; i++) if (typeof s[keys[i]] !== "string") ok = false;
      if (ok) {
        var at = Date.parse(s.issued);
        var age = Date.now() - at;
        if (isNaN(at) || isNaN(Date.parse(s.expires)) || age >= RESTORE_MAX_AGE_MS || age < -60000) ok = false;
      }
      if (!ok) {
        dropSession(network);
        return null;
      }
      return { address: s.address };
    } catch (error) {
      return null;
    }
  }

  function mount(root) {
    if (!root || root.__tezosDoor) return;
    var host = hostName();
    var app = ascii(oneLine(root.getAttribute("data-app"), 80)) || host;
    var network = oneLine(root.getAttribute("data-network"), 40).toLowerCase() || "mainnet";
    var statement = ascii(oneLine(root.getAttribute("data-statement"), 200)).replace(/\{host\}/g, host) ||
      "sign in to " + host + ". this moves nothing.";
    var sdkAttr = root.getAttribute("data-sdk");
    var sdkUrl = sdkAttr ? safeSdkUrl(sdkAttr) : DEFAULT_SDK;
    var integrity = sdkAttr ? oneLine(root.getAttribute("data-sdk-integrity"), 200) : DEFAULT_SDK_INTEGRITY;
    // a custom sdk is never loaded without a fingerprint.
    var sdkProblem = "";
    if (!sdkUrl) sdkProblem = "the wallet library address is not usable.";
    else if (!INTEGRITY_RE.test(integrity)) sdkProblem = "no fingerprint for that sdk.";

    // data-nonce: issued by a server. read again at each sign-in so a page can hand over a fresh one.
    function nonceProblem() {
      if (!root.hasAttribute("data-nonce")) return "";
      return NONCE_RE.test(root.getAttribute("data-nonce") || "") ? "" : "bad nonce.";
    }

    var st = {
      mode: "idle", // idle | restored | working | connected | signedin | error
      label: "",
      note: "",
      address: "",
      publicKey: "",
      sdk: null,
      session: null, // only ever set by a sign-in made in this page load
      restored: null, // an unchecked address left in sessionStorage by an earlier load
      retry: "",
      token: 0,
      client: null
    };
    var api = { signOut: function () { return signOut(); }, getSession: function () { return st.session ? JSON.parse(JSON.stringify(st.session)) : null; } };
    root.__tezosDoor = api;
    instances.push(api);

    root.classList.add("tezos-door");
    var status = el("p", "td-door-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    var actions = el("div", "td-door-actions");
    var noteLine = el("p", "td-door-note", NOTE);
    root.textContent = "";
    root.appendChild(status);
    root.appendChild(actions);
    root.appendChild(noteLine);

    var restored = loadSession(network);
    if (restored) {
      st.restored = restored;
      st.mode = "restored";
    }
    var startProblem = nonceProblem();
    if (startProblem) {
      st.mode = "error";
      st.note = startProblem;
      st.retry = "nonce";
    }

    function setState(patch) {
      var hadFocus = false;
      try { hadFocus = root.contains(document.activeElement); } catch (error) { hadFocus = false; }
      for (var k in patch) st[k] = patch[k];
      render(hadFocus);
    }

    function button(text, onClick, quiet) {
      var b = el("button", "td-door-button" + (quiet ? " td-door-quiet" : ""), text);
      b.setAttribute("type", "button");
      b.addEventListener("click", onClick);
      return b;
    }

    // the status element is created once at mount; only its textContent changes.
    function render(refocus) {
      while (actions.firstChild) actions.removeChild(actions.firstChild);
      var text = "";

      if (st.mode === "idle") {
        text = "not connected.";
        actions.appendChild(button("connect a wallet", connect));
      } else if (st.mode === "restored") {
        text = "connected earlier as " + shortAddress(st.restored.address) + ". not checked.";
        actions.appendChild(button("sign in again", connect));
        actions.appendChild(button("forget", forget, true));
      } else if (st.mode === "working") {
        text = st.label || "waiting on the wallet.";
        actions.appendChild(button("cancel", cancelWork, true));
      } else if (st.mode === "connected") {
        text = shortAddress(st.address);
        actions.appendChild(button("sign in", signIn));
        actions.appendChild(button("disconnect", disconnect, true));
      } else if (st.mode === "signedin") {
        text = "signed in as " + shortAddress(st.address) + ".";
        actions.appendChild(button("sign out", signOut));
      } else {
        text = st.note || "that did not work.";
        actions.appendChild(button("try again", function () {
          if (st.retry === "signin") signIn();
          else if (st.retry === "nonce") {
            var again = nonceProblem();
            if (again) setState({ note: again });
            else setState({ mode: st.restored ? "restored" : "idle", note: "" });
          } else connect();
        }));
      }

      // a "cancelled." note rides on the previous state's line.
      if (st.note && st.mode !== "error" && st.mode !== "working") text += " " + st.note;
      status.textContent = text;
      if (refocus) {
        var first = actions.querySelector("button");
        if (first && typeof first.focus === "function") first.focus();
      }
    }

    function fail(token, error, retry, back) {
      if (token !== st.token) return;
      if (isCancel(error)) {
        setState({ mode: back, note: "cancelled.", label: "" });
      } else {
        setState({ mode: "error", note: typeof error === "string" ? error : plainError(error, network), retry: retry });
      }
    }

    // loads the sdk on first use, builds the client, returns {sdk, client}.
    function prepare(token) {
      if (sdkProblem) return Promise.reject(sdkProblem);
      setState({ mode: "working", label: "loading the wallet library.", note: "" });
      return loadSdk(sdkUrl, integrity).then(function (sdk) {
        if (token !== st.token) throw "stale";
        var types = sdk.NetworkType;
        var known = false;
        if (types && typeof types === "object") {
          for (var key in types) if (types[key] === network && network !== "custom") known = true;
        }
        if (!known) throw "unknown network: " + network + ".";
        if (!sdk.PermissionScope || !sdk.SigningType) throw "the wallet library looks wrong.";
        st.sdk = sdk;
        st.client = getClient(sdk, app, network);
        return { sdk: sdk, client: st.client };
      }, function () {
        throw "the wallet library did not load. it may be blocked.";
      });
    }

    function connect() {
      if (st.mode === "working") return;
      if (sdkProblem) { setState({ mode: "error", note: sdkProblem, retry: "connect" }); return; }
      var token = ++st.token;
      var ctx;
      prepare(token).then(function (c) {
        ctx = c;
        if (token !== st.token) throw "stale";
        setState({ mode: "working", label: "waiting on the wallet." });
        // this click is the interaction that lets us restore an account the sdk already remembers
        // for this site and network, so the user is not prompted twice.
        return Promise.resolve(ctx.client.getActiveAccount()).then(function (active) {
          var ok = active && typeof active.address === "string" && ADDRESS.test(active.address) &&
            active.network && active.network.type === network &&
            Array.isArray(active.scopes) && active.scopes.indexOf(ctx.sdk.PermissionScope.SIGN) !== -1;
          if (ok) return { address: active.address, publicKey: active.publicKey || "" };
          // only the "sign" scope. the sdk default would also ask for operation_request; we do not.
          return ctx.client.requestPermissions({ scopes: [ctx.sdk.PermissionScope.SIGN] });
        }, function () {
          return ctx.client.requestPermissions({ scopes: [ctx.sdk.PermissionScope.SIGN] });
        });
      }).then(function (out) {
        if (token !== st.token) return;
        var address = out && (out.address || (out.accountInfo && out.accountInfo.address));
        if (typeof address !== "string" || !ADDRESS.test(address)) {
          fail(token, "the wallet returned an address this door cannot use.", "connect", "idle");
          return;
        }
        var key = (out && out.publicKey) || (out.accountInfo && out.accountInfo.publicKey) || "";
        setState({ mode: "connected", address: address, publicKey: typeof key === "string" ? key : "", note: "", restored: null });
        fire(root, "tezosdoor:connect", { address: address, publicKey: st.publicKey, network: network });
      }).catch(function (error) {
        if (error === "stale") return;
        fail(token, error, "connect", "idle");
      });
    }

    function signIn() {
      if (st.mode === "working" || !st.client || !st.address) return;
      var token = ++st.token;
      var sdk = st.sdk; // the one this module loaded, never a global found on the page
      var address = st.address;
      try {
        if (!sdk || !sdk.SigningType) throw "the wallet library is not loaded.";
        var bad = nonceProblem();
        if (bad) throw bad;
        var nonce = root.hasAttribute("data-nonce") ? root.getAttribute("data-nonce") : makeNonce();
        var now = Date.now();
        var issued = new Date(now).toISOString();
        var expires = new Date(now + EXPIRES_MS).toISOString();
        var message = buildMessage(host, statement, originName(), network, address, nonce, issued, expires);
        var hex = payloadHex(message);
        setState({ mode: "working", label: "waiting on the wallet.", note: "" });
        st.client.requestSignPayload({
          signingType: sdk.SigningType.MICHELINE,
          payload: hex,
          sourceAddress: address
        }).then(function (out) {
          if (token !== st.token) return;
          var signature = out && out.signature;
          if (typeof signature !== "string" || !signature) {
            fail(token, "the wallet sent back no signature.", "signin", "connected");
            return;
          }
          // a claim, not a proof: nothing here checks the signature.
          var session = {
            address: address, publicKey: st.publicKey, message: message,
            payloadHex: hex, signature: signature, issued: issued, expires: expires
          };
          saveSession(network, session);
          setState({ mode: "signedin", session: session, note: "" });
          fire(root, "tezosdoor:signin", session);
        }).catch(function (error) {
          fail(token, error, "signin", "connected");
        });
      } catch (error) {
        fail(token, typeof error === "string" ? error : "this browser cannot make a nonce.", "signin", "connected");
      }
    }

    function forget() {
      if (st.mode !== "restored") return;
      dropSession(network);
      setState({ mode: "idle", restored: null, note: "" });
    }

    function signOut() {
      if (st.mode !== "signedin") return;
      var address = st.address;
      dropSession(network);
      st.token++;
      setState({ session: null, note: "", mode: st.client ? "connected" : "idle", address: st.client ? address : "" });
      fire(root, "tezosdoor:signout", { address: address });
    }

    function disconnect() {
      if (st.mode === "working") return;
      var address = st.address;
      var client = st.client;
      st.token++;
      dropSession(network);
      setState({ mode: "idle", address: "", publicKey: "", session: null, restored: null, note: "" });
      fire(root, "tezosdoor:disconnect", { address: address });
      if (!client) return;
      // forget the account, then let go of the transport. both are best effort.
      try {
        Promise.resolve(client.clearActiveAccount()).then(function () {
          try { return Promise.resolve(client.disconnect()).then(null, function () {}); } catch (error) { return null; }
        }, function () {});
      } catch (error) { /* ignore */ }
    }

    // "cancel" while waiting: forget the pending request; a late answer is ignored.
    function cancelWork() {
      st.token++;
      setState({ mode: st.address ? "connected" : (st.restored ? "restored" : "idle"), note: "cancelled.", label: "" });
    }

    render(false);
  }

  function mountAll() {
    var nodes = document.querySelectorAll("[data-tezos-door]");
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }

  window.TezosDoor = {
    mount: mount,
    version: VERSION,
    getSession: function () {
      for (var i = 0; i < instances.length; i++) {
        var s = instances[i].getSession();
        if (s) return s;
      }
      return null;
    },
    signOut: function () {
      for (var i = 0; i < instances.length; i++) instances[i].signOut();
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll);
  else mountAll();
})();
