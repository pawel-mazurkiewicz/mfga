// Extension content-script entry (isolated world). Builds the Platform object and boots MFGA.
import { boot } from "../../src/main.js";
import { createBridgeClient, joinChannel } from "../../src/shared/bridge.js";

const api = globalThis.browser ?? globalThis.chrome;
const isFirefox = typeof globalThis.browser !== "undefined" && typeof globalThis.content !== "undefined";
// The MAIN-world helper (manifest world:"MAIN") and this script share a per-load channel id (bridge.js).
const channel = joinChannel();
const bridge = channel ? createBridgeClient(channel) : null;

const platform = {
  kind: isFirefox ? "firefox" : "chrome",
  version: api.runtime.getManifest().version,
  // Chrome: a content-script fetch to the page's own origin carries the page's Origin and cookies.
  // Firefox: the global fetch uses the extension principal; content.fetch makes the request as the page.
  fetch: (url, init) => (isFirefox ? globalThis.content.fetch(url, init) : fetch(url, init)),
  storage: {
    async get(key) {
      const r = await api.storage.local.get(key);
      return r[key];
    },
    async set(key, value) {
      await api.storage.local.set({ [key]: value });
    },
    onChange(cb) {
      api.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        for (const [key, change] of Object.entries(changes)) cb(key, change.newValue);
      });
    },
  },
  async learnedOps() {
    try {
      return (await api.runtime.sendMessage({ type: "mfga:getLearnedOps" })) || {};
    } catch {
      return {};
    }
  },
  // Used only while settings.advanced.mainWorldHelper is on (main.js).
  page: bridge
    ? {
        requireOp: (name, timeoutMs = 3000) => bridge.call("requireOp", { name, timeoutMs }, timeoutMs + 1000).catch(() => null),
        navigate: (url) => bridge.call("navigate", { url }, 2000).then(Boolean, () => false),
        readTokens: () => bridge.call("readTokens", {}, 3000).catch(() => ({ dtsg: null, lsd: null })),
      }
    : null,
  addMenuCommand(_label, fn) {
    api.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "mfga:openSettings") fn();
    });
  },
};

boot(platform);
