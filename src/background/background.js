// Extension background (Chrome service worker / Firefox event page).
//
// Learns the doc_id and variable shape of the few GraphQL operations MFGA replays by *observing* the
// requests Facebook itself makes (webRequest, non-blocking). This is invisible to page JavaScript, so it
// trips none of Facebook's tamper checks. Only an allowlist of operations is kept, and free text the
// user typed (comment bodies) is blanked before anything is stored.

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

let learned = null; // name -> { docId, variables, seenAt }
let loading = null;
let saveTimer = 0;

function load() {
  if (learned) return Promise.resolve(learned);
  loading ||= api.storage.local
    .get(STORAGE_KEY)
    .then((r) => (learned = (r && r[STORAGE_KEY]) || {}))
    .catch(() => (learned = {}));
  return loading;
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

/** Removes user-authored free text from mutation variables before they are stored as a template. */
function scrub(name, variables) {
  if (name === "useCometUFICreateCommentMutation" && variables?.input?.message) {
    variables.input.message = { ranges: [], text: "" };
  }
  return variables;
}

function onRequest(details) {
  if (details.method !== "POST" || !details.requestBody) return;
  const name = formField(details.requestBody, "fb_api_req_friendly_name");
  if (!name || !ALLOWED_OPS.has(name)) return;
  const docId = formField(details.requestBody, "doc_id");
  if (!docId || !/^\d{5,25}$/.test(docId)) return;
  const raw = formField(details.requestBody, "variables");
  let variables = null;
  if (raw && raw.length <= MAX_VARIABLES_CHARS) {
    try {
      variables = scrub(name, JSON.parse(raw));
    } catch {
      variables = null;
    }
  }
  load().then(() => {
    learned[name] = { docId, variables, seenAt: Date.now() };
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
