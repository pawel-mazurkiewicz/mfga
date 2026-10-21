(() => {
  // src/background/scrub.js
  var isObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  var PER_CALL_KEYS = Object.freeze([
    // what the request was about
    "feedback_id",
    "feedback_reaction_id",
    "feedback_referrer",
    "downstream_share_session_origin_uri",
    "groupID",
    "id",
    "reply_comment_parent_fbid",
    "focusCommentID",
    "attachments",
    // who and which call
    "actor_id",
    "client_mutation_id",
    "idempotence_token",
    // the page's session and navigation chain
    "session_id",
    "downstream_share_session_id",
    "downstream_share_session_start_time",
    "attribution_id_v2",
    // paging
    "cursor",
    "feedEndCursor",
    "commentsAfterCursor",
    "commentsBeforeCursor"
  ]);
  var PER_CALL_LISTS = Object.freeze(["recentVPVs"]);
  function scrubTrackingEntry(entry) {
    if (typeof entry !== "string" || !entry.startsWith("{")) return null;
    try {
      const o = JSON.parse(entry);
      if (!isObject(o)) return null;
      if ("conversation_guide_session_id" in o) o.conversation_guide_session_id = null;
      return JSON.stringify(o);
    } catch {
      return null;
    }
  }
  function scrubLevel(o) {
    for (const key of PER_CALL_KEYS) if (key in o) o[key] = null;
    for (const key of PER_CALL_LISTS) if (Array.isArray(o[key])) o[key] = [];
    if (Array.isArray(o.tracking)) o.tracking = o.tracking.map(scrubTrackingEntry).filter(Boolean);
    if ("message" in o && isObject(o.message)) o.message = { ranges: [], text: "" };
  }
  function scrubVariables(variables) {
    if (!isObject(variables)) return variables;
    scrubLevel(variables);
    if (isObject(variables.input)) scrubLevel(variables.input);
    return variables;
  }

  // src/background/background.js
  var api = globalThis.browser ?? globalThis.chrome;
  var STORAGE_KEY = "mfga:learnedOps";
  var ALLOWED_OPS = /* @__PURE__ */ new Set([
    "CometModernHomeFeedQuery",
    "CometNewsFeedPaginationQuery",
    "CometUFIFeedbackReactMutation",
    "useCometUFICreateCommentMutation",
    "CommentsListComponentsPaginationQuery",
    "GroupsCometCrossGroupFeedPaginationQuery"
  ]);
  var MAX_VARIABLES_CHARS = 64 * 1024;
  var MAX_AGE_MS = 30 * 864e5;
  var learned = null;
  var OWN_TTL_MS = 6e4;
  var own = /* @__PURE__ */ new Map();
  var loading = null;
  var saveTimer = 0;
  function load() {
    if (learned) return Promise.resolve(learned);
    loading ||= api.storage.local.get(STORAGE_KEY).then((r) => {
      const stored = r && r[STORAGE_KEY] || {};
      learned = fresh(stored);
      if (JSON.stringify(learned) !== JSON.stringify(stored)) scheduleSave();
      return learned;
    }).catch(() => learned = {});
    return loading;
  }
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
      api.storage.local.set({ [STORAGE_KEY]: learned }).catch(() => {
      });
    }, 2e3);
  }
  function formField(body, name) {
    if (body.formData) {
      const v = body.formData[name];
      return Array.isArray(v) ? v[0] : void 0;
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
        return new URLSearchParams(new TextDecoder().decode(all)).get(name) ?? void 0;
      } catch {
        return void 0;
      }
    }
    return void 0;
  }
  var ownKey = (tabId, name, docId) => `${tabId}|${name}|${docId}`;
  function announceOwn(tabId, name, docId) {
    const now = Date.now();
    for (const [key2, times] of own) {
      const live = times.filter((t) => now - t < OWN_TTL_MS);
      if (live.length) own.set(key2, live);
      else own.delete(key2);
    }
    const key = ownKey(tabId, name, docId);
    own.set(key, [...own.get(key) || [], now]);
  }
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
    const rev = formField(details.requestBody, "__rev") || formField(details.requestBody, "__spin_r") || void 0;
    load().then(() => {
      learned[name] = { docId, variables, seenAt: Date.now(), rev };
      scheduleSave();
    });
  }
  api.webRequest.onBeforeRequest.addListener(
    onRequest,
    { urls: ["https://www.facebook.com/api/graphql/*", "https://web.facebook.com/api/graphql/*"] },
    ["requestBody"]
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
  api.action.onClicked.addListener((tab) => {
    if (tab && tab.id != null) api.tabs.sendMessage(tab.id, { type: "mfga:openSettings" }).catch(() => {
    });
  });
})();
