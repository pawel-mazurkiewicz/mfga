// Userscript entry (Tampermonkey / Violentmonkey). Builds the Platform object and boots MFGA.
//
// Recommended mode is Tampermonkey's default `@sandbox raw`: the script runs in the page's own world,
// so `unsafeWindow` is the real window and page-world calls (requireLazy, history) are direct.
// In content/sandbox modes (Violentmonkey content mode, Firefox Xray sandboxes) the small MAIN-world
// helper is planted with GM_addElement, which executes even under facebook.com's nonce CSP, and is
// reached over the same CustomEvent bridge the extension uses.
/* global unsafeWindow, GM, GM_info, GM_getValue, GM_setValue, GM_addValueChangeListener, GM_registerMenuCommand, GM_addElement, __MFGA_MAIN_WORLD__, __MFGA_VERSION__ */
import { boot } from "../../src/main.js";
import { createBridgeClient, dropChannel, joinChannel } from "../../src/shared/bridge.js";
import { sanitize, STORAGE_KEY as SETTINGS_KEY } from "../../src/shared/settings.js";
import { navigate, readTokens, requireOp } from "../../src/page/page-api.js";

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
  // Managers with only the async GM.* API (Greasemonkey 4, FireMonkey, ...). Values go in as JSON text, the one
  // type every such manager stores.
  const gm = typeof GM !== "undefined" ? GM : null;
  if (gm && typeof gm.getValue === "function" && typeof gm.setValue === "function") {
    return {
      get: async (key) => {
        const raw = await gm.getValue(key);
        try {
          return typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
          return undefined;
        }
      },
      set: async (key, value) => gm.setValue(key, JSON.stringify(value)),
      onChange() {},
    };
  }
  return pageStorage();
}

/**
 * Last resort: facebook.com's own localStorage, which Facebook's scripts can read and write. Only the settings
 * go there, without the private keyword list; the rail cache (names, chat contacts), the op templates and the
 * keywords stay in memory for this page.
 */
function pageStorage() {
  const memory = new Map();
  const PERSISTED = new Set([SETTINGS_KEY]);
  return {
    get: async (key) => {
      if (memory.has(key)) return structuredClone(memory.get(key));
      if (!PERSISTED.has(key)) return undefined;
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? undefined : JSON.parse(raw);
      } catch {
        return undefined;
      }
    },
    set: async (key, value) => {
      memory.set(key, structuredClone(value));
      if (!PERSISTED.has(key)) return;
      try {
        const s = sanitize(value);
        localStorage.setItem(key, JSON.stringify({ ...s, feed: { ...s.feed, keywords: [] } }));
      } catch {
        /* storage full or blocked: settings stay in memory for this page */
      }
    },
    onChange() {},
  };
}

/** Whether the MAIN-world helper may be planted: MFGA on and settings.advanced.mainWorldHelper on. */
function helperAllowed() {
  try {
    const s = sanitize(typeof GM_getValue === "function" ? GM_getValue(SETTINGS_KEY) : undefined);
    return s.enabled && s.advanced.mainWorldHelper;
  } catch {
    return true;
  }
}

function pageApi() {
  if (inPage) {
    return {
      requireOp: (name, timeoutMs = 3000) => requireOp(W, { name, timeoutMs }),
      navigate: async (url) => navigate(W, { url }),
      readTokens: () => readTokens(W),
    };
  }
  if (typeof GM_addElement !== "function" || !helperAllowed()) return null;
  // The helper takes this per-load channel id off <html> as it starts (bridge.js).
  const channel = joinChannel();
  if (!channel) return null;
  try {
    // An inline script runs as it is inserted: removing it at once leaves no MFGA script text in the page.
    GM_addElement("script", { textContent: __MFGA_MAIN_WORLD__ })?.remove?.();
  } catch {
    dropChannel(channel);
    return null;
  }
  // Still on <html>: the helper did not run (blocked), and nobody else may learn the id.
  if (dropChannel(channel)) return null;
  const bridge = createBridgeClient(channel);
  return {
    requireOp: (name, timeoutMs = 3000) => bridge.call("requireOp", { name, timeoutMs }, timeoutMs + 1000).catch(() => null),
    navigate: (url) => bridge.call("navigate", { url }, 2000).then(Boolean, () => false),
    readTokens: () => bridge.call("readTokens", {}, 3000).catch(() => ({ dtsg: null, lsd: null })),
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
