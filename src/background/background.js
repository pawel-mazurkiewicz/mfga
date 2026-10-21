// Extension background (Chrome service worker / Firefox event page).
//
// Learns the doc_id and variable shape of the few GraphQL operations MFGA replays by *observing* the
// requests Facebook itself makes (webRequest, non-blocking). This is invisible to page JavaScript, so it
// trips none of Facebook's tamper checks. Only an allowlist of operations is kept, and only the variables'
// shape: what a request was about (post, group, comment text, cursors, session) is blanked before anything is
// stored (scrub.js). Captures older than a month are dropped.
import { scrubVariables } from "./scrub.js";

const api = globalThis.browser ?? globalThis.chrome;

const STORAGE_KEY = "mfga:learnedOps";
const ALLOWED_OPS = new Set([
  "CometModernHomeFeedQuery",
  "CometNewsFeedPaginationQuery",
  "CometUFIFeedbackReactMutation",
  "useCometUFICreateCommentMutation",
  "CommentsListComponentsPaginationQuery",
  "GroupsCometCrossGroupFeedPaginationQuery",
]);
const MAX_VARIABLES_CHARS = 64 * 1024;
const MAX_AGE_MS = 30 * 86400e3; // like the content script's op cache (data/ops.js)

let learned = null; // name -> { docId, variables, seenAt }
let loading = null;
let saveTimer = 0;

function load() {
  if (learned) return Promise.resolve(learned);
  loading ||= api.storage.local
    .get(STORAGE_KEY)
    .then((r) => {
      const stored = (r && r[STORAGE_KEY]) || {};
      learned = fresh(stored);
      // Rewrite what an older version stored unscrubbed, or what has expired.
      if (JSON.stringify(learned) !== JSON.stringify(stored)) scheduleSave();
      return learned;
    })
    .catch(() => (learned = {}));
  return loading;
}

/** Stored captures younger than MAX_AGE_MS, each scrubbed again (entries stored by older versions). */
function fresh(stored) {
  const out = {};
  for (const [name, entry] of Object.entries(stored)) {
    if (!ALLOWED_OPS.has(name) || !entry || Date.now() - (entry.seenAt || 0) > MAX_AGE_MS) continue;
    out[name] = { ...entry, variables: scrubVariables(entry.variables ?? null) };
  }
  return out;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    api.storage.local.set({ [STORAGE_KEY]: learned }).catch(() => {});
  }, 2000);
}

function formField(body, name) {
  if (body.formData) {
    const v = body.formData[name];
    return Array.isArray(v) ? v[0] : undefined;
  }
  if (body.raw && body.raw.length) {
    try {
      const bytes = body.raw.map((part) => new Uint8Array(part.bytes || new ArrayBuffer(0)));
      const total = bytes.reduce((n, b) => n + b.length, 0);
      const all = new Uint8Array(total);
      let off = 0;
      for (const b of bytes) {
        all.set(b, off);
        off += b.length;
      }
      return new URLSearchParams(new TextDecoder().decode(all)).get(name) ?? undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function onRequest(details) {
  // Private windows (Firefox reports them; Chrome keeps spanning-mode extensions' storage shared with them).
  if (details.method !== "POST" || !details.requestBody || details.incognito) return;
  const name = formField(details.requestBody, "fb_api_req_friendly_name");
  if (!name || !ALLOWED_OPS.has(name)) return;
  const docId = formField(details.requestBody, "doc_id");
  if (!docId || !/^\d{5,25}$/.test(docId)) return;
  const raw = formField(details.requestBody, "variables");
  let variables = null;
  if (raw && raw.length <= MAX_VARIABLES_CHARS) {
    try {
      variables = scrubVariables(JSON.parse(raw));
    } catch {
      variables = null;
    }
  }
  // Facebook's deploy revision lets the registry tell a fresh id from one cached across deploys.
  const rev = formField(details.requestBody, "__rev") || formField(details.requestBody, "__spin_r") || undefined;
  load().then(() => {
    learned[name] = { docId, variables, seenAt: Date.now(), rev };
    scheduleSave();
  });
}

api.webRequest.onBeforeRequest.addListener(
  onRequest,
  { urls: ["https://www.facebook.com/api/graphql/*", "https://web.facebook.com/api/graphql/*"] },
  ["requestBody"],
);

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "mfga:getLearnedOps") {
    load().then((ops) => sendResponse(ops));
    return true;
  }
  return false;
});

// Toolbar button: open the in-page settings dialog on the active Facebook tab.
api.action.onClicked.addListener((tab) => {
  if (tab && tab.id != null) api.tabs.sendMessage(tab.id, { type: "mfga:openSettings" }).catch(() => {});
});
