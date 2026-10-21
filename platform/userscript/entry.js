// Userscript entry (Tampermonkey / Violentmonkey). Builds the Platform object and boots MFGA.
//
// Recommended mode is Tampermonkey's default `@sandbox raw`: the script runs in the page's own world,
// so `unsafeWindow` is the real window and page-world calls (requireLazy, history) are direct.
// In content/sandbox modes (Violentmonkey content mode, Firefox Xray sandboxes) the small MAIN-world
// helper is planted with GM_addElement, which executes even under facebook.com's nonce CSP, and is
// reached over the same CustomEvent bridge the extension uses.
/* global unsafeWindow, GM_info, GM_getValue, GM_setValue, GM_addValueChangeListener, GM_registerMenuCommand, GM_addElement, __MFGA_MAIN_WORLD__, __MFGA_VERSION__ */
import { boot } from "../../src/main.js";
import { createBridgeClient, BRIDGE_CHANNEL } from "../../src/shared/bridge.js";
import { navigate, requireOp } from "../../src/page/page-api.js";

const W = (typeof unsafeWindow !== "undefined" && unsafeWindow) || window;
const info = typeof GM_info !== "undefined" ? GM_info : null;
// Firefox sandboxes expose the page through an Xray wrapper; page objects can't take our callbacks there.
const xray = typeof window.wrappedJSObject === "object" && window.wrappedJSObject !== null;
const inPage = !xray && info?.injectInto !== "content" && info?.sandboxMode !== "dom" && info?.sandboxMode !== "js";

function storageAdapter() {
  if (typeof GM_getValue === "function" && typeof GM_setValue === "function") {
    return {
      get: async (key) => GM_getValue(key),
      set: async (key, value) => GM_setValue(key, value),
      onChange(cb) {
        if (typeof GM_addValueChangeListener === "function") {
          // Fires for changes made in other tabs too, which keeps every Facebook tab in sync.
          GM_addValueChangeListener("mfga:settings", (key, _old, value) => cb(key, value));
          GM_addValueChangeListener("mfga:ops", (key, _old, value) => cb(key, value));
          GM_addValueChangeListener("mfga:rail", (key, _old, value) => cb(key, value));
        }
      },
    };
  }
  // Last resort (e.g. managers that only grant the async GM.* API in page mode): per-origin storage.
  return {
    get: async (key) => {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? undefined : JSON.parse(raw);
      } catch {
        return undefined;
      }
    },
    set: async (key, value) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* storage full or blocked: settings stay in memory for this page */
      }
    },
    onChange() {},
  };
}

function pageApi() {
  if (inPage) {
    return {
      requireOp: (name, timeoutMs = 3000) => requireOp(W, { name, timeoutMs }),
      navigate: async (url) => navigate(W, { url }),
    };
  }
  if (typeof GM_addElement !== "function") return null;
  try {
    GM_addElement("script", { textContent: __MFGA_MAIN_WORLD__ });
  } catch {
    return null;
  }
  const bridge = createBridgeClient(BRIDGE_CHANNEL);
  return {
    requireOp: (name, timeoutMs = 3000) => bridge.call("requireOp", { name, timeoutMs }, timeoutMs + 1000).catch(() => null),
    navigate: (url) => bridge.call("navigate", { url }, 2000).then(Boolean, () => false),
  };
}

function pageFetch() {
  // Firefox content-script sandboxes: plain fetch uses the extension principal; content.fetch is the page.
  if (xray && typeof globalThis.content !== "undefined" && globalThis.content?.fetch) {
    return (url, init) => globalThis.content.fetch(url, init);
  }
  return (url, init) => W.fetch(url, init);
}

boot({
  kind: "userscript",
  version: __MFGA_VERSION__,
  fetch: pageFetch(),
  storage: storageAdapter(),
  learnedOps: async () => ({}),
  page: pageApi(),
  addMenuCommand(label, fn) {
    if (typeof GM_registerMenuCommand === "function") GM_registerMenuCommand(label, fn);
  },
  diagnostics: {
    manager: info?.scriptHandler ? `${info.scriptHandler} ${info.version || ""}`.trim() : "unknown",
    mode: inPage ? "page" : xray ? "xray" : info?.injectInto || info?.sandboxMode || "content",
    late: document.readyState !== "loading" || typeof W.requireLazy === "function",
  },
});
