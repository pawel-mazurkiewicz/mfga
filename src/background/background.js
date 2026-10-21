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
// MFGA's own replays, announced by the content script right before it sends them ("mfga:ownRequest"): they are
// not what Facebook itself sends today, and learning them would make an old doc_id look fresh.
const OWN_TTL_MS = 60e3;
const own = new Map(); // "tabId|name|docId" -> announcement times
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

const ownKey = (tabId, name, docId) => `${tabId}|${name}|${docId}`;

function announceOwn(tabId, name, docId) {
  const now = Date.now();
  for (const [key, times] of own) {
    const live = times.filter((t) => now - t < OWN_TTL_MS);
    if (live.length) own.set(key, live);
    else own.delete(key);
  }
  const key = ownKey(tabId, name, docId);
  own.set(key, [...(own.get(key) || []), now]);
}

/** True (once per announcement) when this request is one MFGA announced as its own. */
function takeOwn(tabId, name, docId) {
  const key = ownKey(tabId, name, docId);
  const times = (own.get(key) || []).filter((t) => Date.now() - t < OWN_TTL_MS);
  if (!times.length) return false;
  times.shift();
  if (times.length) own.set(key, times);
  else own.delete(key);
  return true;
}

function onRequest(details) {
  // Private windows (Firefox reports them; Chrome keeps spanning-mode extensions' storage shared with them).
  if (details.method !== "POST" || !details.requestBody || details.incognito) return;
  const name = formField(details.requestBody, "fb_api_req_friendly_name");
  if (!name || !ALLOWED_OPS.has(name)) return;
  const docId = formField(details.requestBody, "doc_id");
  if (!docId || !/^\d{5,25}$/.test(docId)) return;
  if (takeOwn(details.tabId, name, docId)) return;
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

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "mfga:getLearnedOps") {
    load().then((ops) => sendResponse(ops));
    return true;
  }
  if (msg && msg.type === "mfga:ownRequest") {
    const tabId = sender && sender.tab && sender.tab.id;
    if (tabId != null && typeof msg.name === "string" && typeof msg.docId === "string") announceOwn(tabId, msg.name, msg.docId);
    sendResponse(true);
    return false;
  }
  return false;
});

// Toolbar button: open the in-page settings dialog on the active Facebook tab.
api.action.onClicked.addListener((tab) => {
  if (tab && tab.id != null) api.tabs.sendMessage(tab.id, { type: "mfga:openSettings" }).catch(() => {});
});
