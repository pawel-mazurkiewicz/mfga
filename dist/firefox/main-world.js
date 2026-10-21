(() => {
  // src/shared/bridge.js
  var PREFIX = "mfga:";
  var CHANNEL_ATTR = "data-mfga-channel";
  var CHANNEL_ID = /^[0-9a-f]{32}$/;
  var dispatch = EventTarget.prototype.dispatchEvent;
  var Custom = CustomEvent;
  var detailOf = Object.getOwnPropertyDescriptor(CustomEvent.prototype, "detail")?.get ?? function detail() {
    return this.detail;
  };
  var { parse, stringify } = JSON;
  var hasOwn = Object.prototype.hasOwnProperty;
  function randomId() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    let id = "";
    for (const b of bytes) id += (b < 16 ? "0" : "") + b.toString(16);
    return id;
  }
  function joinChannel(doc = document) {
    const html = doc.documentElement;
    if (!html) return null;
    const given = html.getAttribute(CHANNEL_ATTR);
    if (given && CHANNEL_ID.test(given)) {
      html.removeAttribute(CHANNEL_ATTR);
      return given;
    }
    const id = randomId();
    html.setAttribute(CHANNEL_ATTR, id);
    return id;
  }
  var message = (type, detail2) => new Custom(type, { __proto__: null, detail: detail2 });
  function serveBridge(channel2, handlers) {
    document.addEventListener(`${PREFIX}${channel2}:req`, async (ev) => {
      let msg;
      try {
        msg = parse(detailOf.call(ev));
      } catch {
        return;
      }
      if (!msg || typeof msg.id !== "number") return;
      let reply;
      try {
        const fn = typeof msg.method === "string" && hasOwn.call(handlers, msg.method) ? handlers[msg.method] : null;
        if (!fn) throw new Error(`unknown method ${msg.method}`);
        reply = { id: msg.id, result: await fn(msg.params || {}) };
      } catch (err) {
        reply = { id: msg.id, error: String(err && err.message || err) };
      }
      dispatch.call(document, message(`${PREFIX}${channel2}:res`, stringify(reply)));
    });
  }

  // src/page/page-api.js
  var OP_NAME = /^[A-Za-z0-9_]{3,120}$/;
  var DOC_ID = /^\d{5,25}$/;
  function requireOp(win, { name, timeoutMs = 3e3 }) {
    if (!OP_NAME.test(String(name))) return Promise.resolve(null);
    const requireLazy = win.requireLazy;
    if (typeof requireLazy !== "function") return Promise.resolve(null);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), Math.min(1e4, Math.max(100, timeoutMs)));
      try {
        requireLazy([`${name}_facebookRelayOperation`], (id) => {
          clearTimeout(timer);
          resolve(typeof id === "string" && DOC_ID.test(id) ? id : null);
        });
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }
  var TOKEN_MODULES = ["DTSGInitData", "DTSGInitialData", "LSD"];
  function readTokens(win, { timeoutMs = 1500 } = {}) {
    const requireLazy = win.requireLazy;
    if (typeof requireLazy !== "function") return Promise.resolve({ dtsg: null, lsd: null });
    const one = (name) => new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      try {
        requireLazy([name], (mod) => {
          clearTimeout(timer);
          const token = mod && typeof mod.token === "string" && mod.token ? mod.token : null;
          resolve(token);
        });
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    });
    return Promise.all(TOKEN_MODULES.map(one)).then(([a, b, lsd]) => ({ dtsg: a || b, lsd }));
  }
  function navigate(win, { url }) {
    let target;
    try {
      target = new URL(String(url), win.location.href);
    } catch {
      return false;
    }
    if (target.origin !== win.location.origin) return false;
    win.history.pushState({}, "", target.pathname + target.search + target.hash);
    win.dispatchEvent(new win.PopStateEvent("popstate", { state: {} }));
    return true;
  }

  // src/page/main-world.js
  var channel = joinChannel();
  if (channel) {
    serveBridge(channel, {
      requireOp: (params) => requireOp(window, params),
      navigate: (params) => navigate(window, params),
      readTokens: (params) => readTokens(window, params)
    });
  }
})();
