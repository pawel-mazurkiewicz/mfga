// Extension content-script entry (isolated world). Builds the Platform object and boots MFGA.
import { boot } from "../../src/main.js";
import { createBridgeClient, joinChannel } from "../../src/shared/bridge.js";

const api = globalThis.browser ?? globalThis.chrome;
const isFirefox = typeof globalThis.browser !== "undefined" && typeof globalThis.content !== "undefined";
// The MAIN-world helper (manifest world:"MAIN") and this script share a per-load channel id (bridge.js).
const channel = joinChannel();
const bridge = channel ? createBridgeClient(channel) : null;
const ANNOUNCE_WAIT_MS = 500;

/**
 * Tells the background that the GraphQL request about to go out is MFGA's own, so its learner (which sees every
 * request to /api/graphql/) does not take our replay of an old doc_id for what Facebook sends today. Waits for
 * the answer (the request must not overtake it), but never long: a sleeping background only costs that.
 */
async function announceOwn(init) {
  try {
    const form = new URLSearchParams(typeof init?.body === "string" ? init.body : "");
    const name = form.get("fb_api_req_friendly_name");
    const docId = form.get("doc_id");
    if (!name || !docId) return;
    let timer;
    const late = new Promise((resolve) => (timer = setTimeout(resolve, ANNOUNCE_WAIT_MS)));
    await Promise.race([api.runtime.sendMessage({ type: "mfga:ownRequest", name, docId }).catch(() => {}), late]);
    clearTimeout(timer);
  } catch {
    // announcing is best effort
  }
}

const platform = {
  kind: isFirefox ? "firefox" : "chrome",
  version: api.runtime.getManifest().version,
  // Chrome: a content-script fetch to the page's own origin carries the page's Origin and cookies.
  // Firefox: the global fetch uses the extension principal; content.fetch makes the request as the page.
  async fetch(url, init) {
    await announceOwn(init);
    return isFirefox ? globalThis.content.fetch(url, init) : globalThis.fetch(url, init);
  },
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
