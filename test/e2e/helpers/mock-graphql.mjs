// Mock of POST https://www.facebook.com/api/graphql/ for the fake site.
//
//   const mock = createMockGraphql({ world, tokens });
//   b.route((u) => u.pathname === "/api/graphql/", mock.handle);   // Playwright route handler
//   mock.log            every request: time, op, variables, validation problems, served stories
//   mock.inject         error switches: { staleDoc, tokenError, softBlock, serverError: <count>, checkpoint: "html"|"redirect"|null }
//
// Validation follows graphql-protocol §2: form body, doc_id known for the friendly name, fb_dtsg/lsd equal to
// the page tokens, x-fb-friendly-name / x-fb-lsd headers, variables JSON with the declared keys (missing or
// undeclared keys are rejected like Facebook's 1675012). Server-side rejections answer Facebook's error
// document; protocol deviations Facebook would tolerate are recorded as `problems` (entry.valid = false).

import { createWorld, STYLE_TO_FEED } from "../../fixtures/site/world.mjs";
import { DOC_IDS, DOSSIER_DOC_IDS, makeTokens, feedPreloaderVariables, jazoest, RELAY_PROVIDED } from "../../fixtures/site/ssr.mjs";
import { feedPage, decodeCursor } from "../../fixtures/site/feed-pages.mjs";
import { feedPayloads, encodeLines, commentsPayload, commentsCursorOffset, reactEcho, commentEcho, gqlError, REACTIONS } from "../../fixtures/site/graphql-shapes.mjs";

export const ERROR_CODES = Object.freeze({ NOT_LOGGED_IN: 1357004, TOKEN: 1357051, VARIABLES: 1675012, STALE_DOC: 1570245, FIELD: 1357010 });
export const CHECKPOINT_URL = "https://www.facebook.com/checkpoint/1501092823525282/?next=https%3A%2F%2Fwww.facebook.com%2F";
export const CHECKPOINT_MARKER = "We suspect automated behaviour on your account";

const FEED_KEYS = Object.keys(feedPreloaderVariables("top"));
const FEED_OPTIONAL = ["feedEndCursor", "feedClientSession"];
const PAGINATION_KEYS = ["RELAY_INCREMENTAL_DELIVERY", "clientQueryId", "clientSession", "connectionClass", "count", "cursor", "experimentalValues", "feedLocation", "feedStyle", "feedbackSource", "focusCommentID", "orderby", "privacySelectorRenderLocation", "recentVPVs", "refreshMode", "renderLocation", "scale", "shouldChangeBRSLabelFieldName", "shouldChangeSponsoredAuctionDistanceFieldName", "shouldChangeSponsoredDataFieldName", "shouldObfuscateCategoryField", "shouldUseBRSLabelFieldNameV1", "shouldUseBRSLabelFieldNameV2", "shouldUseSponsoredAuctionLabelFieldNameV1", "shouldUseSponsoredAuctionLabelFieldNameV2", "useDefaultActor", ...Object.keys(RELAY_PROVIDED)];
const REACT_KEYS = ["input", "scale", "canUseNicknameOnComet", "useDefaultActor", "__relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider"];
const COMMENT_PV = ["__relay_internal__pv__groups_comet_use_glvrelayprovider", "__relay_internal__pv__CometUFICommentActionLinksRewriteEnabledrelayprovider", "__relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider", "__relay_internal__pv__IsWorkUserrelayprovider", "__relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider"];
const COMMENT_KEYS = ["feedLocation", "feedbackSource", "groupID", "input", "inviteShortLinkKey", "renderLocation", "scale", "useDefaultActor", "focusCommentID", "translationType", "canUseNicknameOnComet", ...COMMENT_PV];
const REACTION_IDS = new Set([...Object.values(REACTIONS), "0"]);

class Rejection extends Error {
  constructor(code, summary, description) {
    super(description);
    this.code = code;
    this.summary = summary;
  }
}
const reject = (code, summary, description) => {
  throw new Rejection(code, summary, description);
};

/** Checks the variable key set: missing required keys and undeclared keys are both 1675012. */
function checkKeys(vars, { required, allowed }) {
  const missing = required.filter((k) => !(k in vars));
  if (missing.length) reject(ERROR_CODES.VARIABLES, "Query error", `missing_required_variable_value: ${missing.join(", ")}`);
  const extra = Object.keys(vars).filter((k) => !allowed.includes(k));
  if (extra.length) reject(ERROR_CODES.VARIABLES, "Query error", `noncoercible_variable_value: undeclared ${extra.join(", ")}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * createMockGraphql({ world, tokens, delayMs, acceptDossierDocIds }) -> mock.
 * acceptDossierDocIds: also accept the newest doc_ids of graphql-protocol §14 (a product's fallback table).
 */
export function createMockGraphql({ world = createWorld(), tokens = makeTokens(world), delayMs = 80, acceptDossierDocIds = true } = {}) {
  const startedAt = Date.now();
  const docIds = { ...DOC_IDS };
  const retired = new Map(); // doc_id -> op, answered with 1570245
  const usedIdempotence = new Map();
  const log = [];
  const inject = { staleDoc: 0, tokenError: 0, softBlock: 0, serverError: 0, checkpoint: null };
  let inFlight = 0;
  let maxInFlight = 0;
  let seq = 0;

  const worldNow = () => world.now + Math.round((Date.now() - startedAt) / 1000);
  const knownDocIds = (op) => new Set([docIds[op], ...(acceptDossierDocIds ? DOSSIER_DOC_IDS[op] || [] : [])].filter(Boolean));

  function checkTransport(entry, form, headers) {
    const name = form.get("fb_api_req_friendly_name");
    if (!name) entry.problems.push("fb_api_req_friendly_name missing");
    if (headers["x-fb-friendly-name"] !== name) entry.problems.push(`x-fb-friendly-name header ${JSON.stringify(headers["x-fb-friendly-name"])} != ${JSON.stringify(name)}`);
    if (!/^application\/x-www-form-urlencoded/.test(headers["content-type"] || "")) entry.problems.push(`content-type ${headers["content-type"]}`);
    if (form.get("fb_api_caller_class") !== "RelayModern") entry.problems.push("fb_api_caller_class is not RelayModern");
    if (form.get("server_timestamps") !== "true") entry.problems.push("server_timestamps is not true");
    if (form.get("lsd") !== tokens.lsd) entry.problems.push("lsd does not match the page LSD token");
    if (headers["x-fb-lsd"] !== tokens.lsd) entry.problems.push("x-fb-lsd header does not match the page LSD token");
    if (form.has("jazoest") && form.get("jazoest") !== jazoest(form.get("fb_dtsg") || "")) entry.problems.push("jazoest is not 2 + Σ charCodes(fb_dtsg)");
    for (const k of ["av", "__user"]) if (form.has(k) && form.get(k) !== world.viewer.id) entry.problems.push(`${k} is not the viewer id`);
    if (!form.get("fb_dtsg")) reject(ERROR_CODES.NOT_LOGGED_IN, "Not logged in", "fb_dtsg missing");
    if (inject.tokenError > 0) {
      inject.tokenError--;
      reject(ERROR_CODES.TOKEN, "Session expired", "fb_dtsg expired (injected)");
    }
    if (form.get("fb_dtsg") !== tokens.dtsg) reject(ERROR_CODES.TOKEN, "Session expired", "fb_dtsg does not match the page token");
  }

  function checkDocId(op, docId) {
    if (inject.staleDoc > 0) {
      inject.staleDoc--;
      reject(ERROR_CODES.STALE_DOC, "Persisted query not found", `doc_id ${docId} is stale (injected)`);
    }
    if (retired.has(docId) || !knownDocIds(op).has(docId)) reject(ERROR_CODES.STALE_DOC, "Persisted query not found", `unknown doc_id ${docId} for ${op}`);
  }

  function parseVariables(form) {
    try {
      const v = JSON.parse(form.get("variables") || "");
      if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
      return v;
    } catch (e) {
      return reject(ERROR_CODES.VARIABLES, "Query error", `variables is not a JSON object: ${e.message}`);
    }
  }

  function serveFeed(entry, vars, { pagination }) {
    if (pagination) checkKeys(vars, { required: ["count", "cursor", "feedStyle", "orderby", "scale", ...Object.keys(RELAY_PROVIDED)], allowed: PAGINATION_KEYS });
    else checkKeys(vars, { required: FEED_KEYS, allowed: [...FEED_KEYS, ...FEED_OPTIONAL] });
    const feedName = STYLE_TO_FEED[vars.feedStyle];
    if (!feedName) reject(ERROR_CODES.VARIABLES, "Query error", `noncoercible_variable_value: feedStyle ${vars.feedStyle}`);
    const expectedOrder = feedName === "top" ? "TOP_STORIES" : "MOST_RECENT";
    if (!(Array.isArray(vars.orderby) && (vars.orderby.join() === expectedOrder || (feedName === "favorites" && vars.orderby.length === 0)))) entry.problems.push(`orderby ${JSON.stringify(vars.orderby)} does not match feedStyle ${vars.feedStyle}`);
    const rawCursor = pagination ? vars.cursor : vars.feedEndCursor;
    let offset = 0;
    if (rawCursor != null) {
      const c = decodeCursor(rawCursor);
      if (!c) reject(ERROR_CODES.FIELD, "field_exception", "invalid cursor");
      if (c.feedName !== feedName) reject(ERROR_CODES.FIELD, "field_exception", `cursor of ${c.feedName} used for ${feedName}`);
      offset = c.offset;
    }
    const size = Number(pagination ? vars.count : vars.feedInitialFetchSize);
    if (!(size >= 1 && size <= 50)) reject(ERROR_CODES.VARIABLES, "Query error", "noncoercible_variable_value: fetch size");
    const page = feedPage(world, feedName, { offset, size, ctx: { scale: Number(vars.scale) || 1, obfuscateCategory: vars.shouldObfuscateCategoryField !== false } });
    Object.assign(entry, { feedStyle: vars.feedStyle, feedName, offset, scale: vars.scale, organic: page.organicIds, junk: page.junkIds, hasNextPage: page.pageInfo.hasNextPage, endCursor: page.pageInfo.endCursor });
    const t = Date.now();
    return encodeLines(feedPayloads(world, page.edges, page.pageInfo, { withViewerFields: !pagination, timing: { start: t, flush: t + 40 } }));
  }

  const storyFor = (feedbackId) => world.storyByFeedbackId(feedbackId) || reject(ERROR_CODES.FIELD, "field_exception", `unknown feedback_id ${feedbackId}`);

  function serveReact(entry, vars) {
    checkKeys(vars, { required: ["input", "scale", "__relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider"], allowed: REACT_KEYS });
    const input = vars.input || {};
    for (const k of ["feedback_id", "feedback_reaction_id", "actor_id", "client_mutation_id"]) if (input[k] == null) reject(ERROR_CODES.VARIABLES, "Query error", `missing_required_variable_value: input.${k}`);
    if (!REACTION_IDS.has(String(input.feedback_reaction_id))) reject(ERROR_CODES.VARIABLES, "Query error", `noncoercible_variable_value: feedback_reaction_id ${input.feedback_reaction_id}`);
    if (String(input.actor_id) !== world.viewer.id) reject(ERROR_CODES.FIELD, "field_exception", "actor_id is not the viewer");
    const story = storyFor(input.feedback_id);
    const state = world.feedback.react(story.postId, String(input.feedback_reaction_id));
    Object.assign(entry, { postId: story.postId, reaction: String(input.feedback_reaction_id), reactions: state.reactions });
    return JSON.stringify(reactEcho(world, story));
  }

  function serveComment(entry, vars) {
    checkKeys(vars, { required: ["feedLocation", "feedbackSource", "groupID", "input", "scale", "useDefaultActor", ...COMMENT_PV], allowed: COMMENT_KEYS });
    const input = vars.input || {};
    const text = input.message?.text;
    if (typeof text !== "string" || !text.trim()) reject(ERROR_CODES.VARIABLES, "Query error", "missing_required_variable_value: input.message.text");
    for (const k of ["feedback_id", "client_mutation_id", "idempotence_token"]) if (input[k] == null) reject(ERROR_CODES.VARIABLES, "Query error", `missing_required_variable_value: input.${k}`);
    if (!/^client:[0-9a-f-]{36}$/i.test(String(input.idempotence_token))) entry.problems.push(`idempotence_token ${input.idempotence_token} is not "client:" + uuid`);
    const story = storyFor(input.feedback_id);
    if ((vars.groupID ?? null) !== (story.to ? story.to.id : null)) reject(ERROR_CODES.FIELD, "field_exception", `groupID ${vars.groupID} does not own the post`);
    let comment = usedIdempotence.get(input.idempotence_token);
    if (comment) entry.problems.push("idempotence_token reused");
    else {
      comment = world.feedback.addComment(story.postId, world.viewer, text, worldNow());
      usedIdempotence.set(input.idempotence_token, comment);
    }
    Object.assign(entry, { postId: story.postId, commentText: text, groupID: vars.groupID ?? null });
    return JSON.stringify(commentEcho(world, story, comment));
  }

  function serveComments(entry, vars) {
    for (const k of ["id", "commentsAfterCount", "feedLocation"]) if (!(k in vars)) reject(ERROR_CODES.VARIABLES, "Query error", `missing_required_variable_value: ${k}`);
    const story = storyFor(vars.id);
    let after = 0;
    if (vars.commentsAfterCursor != null) {
      after = commentsCursorOffset(vars.commentsAfterCursor, story.postId);
      if (after == null) reject(ERROR_CODES.FIELD, "field_exception", "invalid commentsAfterCursor");
    }
    const count = vars.commentsAfterCount > 0 ? vars.commentsAfterCount : 10;
    Object.assign(entry, { postId: story.postId, after, count });
    return JSON.stringify(commentsPayload(world, story, { after, count }));
  }

  const SERVERS = {
    CometModernHomeFeedQuery: (entry, vars) => serveFeed(entry, vars, { pagination: false }),
    CometNewsFeedPaginationQuery: (entry, vars) => serveFeed(entry, vars, { pagination: true }),
    CometUFIFeedbackReactMutation: serveReact,
    useCometUFICreateCommentMutation: serveComment,
    CommentsListComponentsPaginationQuery: serveComments,
  };

  const html = (status, body, headers = {}) => ({ status, headers: { "content-type": 'text/html; charset="utf-8"', ...headers }, body });

  /** Pure request -> response step (also used directly by node tests). */
  function respond({ method = "POST", headers = {}, body = "" }) {
    const entry = { seq: ++seq, at: Date.now(), end: null, method, friendlyName: null, docId: null, variables: null, form: null, headers, status: 200, errorCode: null, error: null, problems: [], valid: false, concurrent: inFlight > 1 };
    log.push(entry);
    if (method !== "POST") return { entry, ...html(200, "") };
    const form = new URLSearchParams(body || "");
    entry.form = Object.fromEntries(form);
    entry.friendlyName = form.get("fb_api_req_friendly_name");
    entry.docId = form.get("doc_id");
    if (inject.checkpoint === "redirect") return { entry, ...html(302, "", { location: CHECKPOINT_URL }) };
    if (inject.checkpoint === "html") return { entry, ...html(200, `<!DOCTYPE html><html><body><script type="application/json">{"is_checkpointed":true}</script><h1>${CHECKPOINT_MARKER}</h1></body></html>`) };
    if (inject.serverError > 0) {
      inject.serverError--;
      entry.status = 500;
      return { entry, ...html(500, "") };
    }
    if (inject.softBlock > 0) {
      inject.softBlock--;
      return { entry, ...html(200, "") };
    }
    let text;
    try {
      checkTransport(entry, form, headers);
      const server = SERVERS[entry.friendlyName];
      if (!server) reject(ERROR_CODES.STALE_DOC, "Persisted query not found", `operation ${entry.friendlyName} is not served by the mock`);
      checkDocId(entry.friendlyName, entry.docId);
      entry.variables = parseVariables(form);
      text = server(entry, entry.variables);
    } catch (err) {
      if (!(err instanceof Rejection)) throw err;
      entry.errorCode = err.code;
      entry.error = err.message;
      text = JSON.stringify(gqlError(err.code, err.summary, err.message));
    }
    entry.valid = !entry.errorCode && entry.problems.length === 0 && !entry.concurrent;
    return { entry, ...html(200, text) };
  }

  /** Playwright route handler: logs, delays like a network round trip, fulfils. */
  async function handle(route, request) {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      const res = respond({ method: request.method(), headers: request.headers(), body: request.postData() || "" });
      await sleep(delayMs);
      res.entry.end = Date.now();
      await route.fulfill({ status: res.status, headers: res.headers, body: res.body });
    } finally {
      inFlight--;
    }
  }

  return {
    world,
    tokens,
    docIds,
    log,
    inject,
    respond,
    handle,
    get maxInFlight() {
      return maxInFlight;
    },
    /** Retires an operation's doc_id (answered 1570245) and publishes a new one to fresh pages. */
    rotateDocId(op, newId) {
      retired.set(docIds[op], op);
      docIds[op] = newId;
    },
    /** Replaces the page tokens (old fb_dtsg -> 1357051 until the page is reloaded). */
    setTokens(next) {
      Object.assign(tokens, next);
    },
    requests: (name) => log.filter((e) => !name || e.friendlyName === name),
    feedRequests: () => log.filter((e) => e.friendlyName === "CometModernHomeFeedQuery" || e.friendlyName === "CometNewsFeedPaginationQuery"),
    invalid: () => log.filter((e) => e.method === "POST" && !e.valid && !e.errorCode),
    rejected: () => log.filter((e) => e.errorCode),
    /** Milliseconds between consecutive POSTs (start to start). */
    gaps(entries = log.filter((e) => e.method === "POST")) {
      return entries.slice(1).map((e, i) => e.at - entries[i].at);
    },
    reset() {
      log.length = 0;
      maxInFlight = inFlight;
    },
  };
}

/**
 * Reference decoder for responses (graphql-protocol §3.4), independent of MFGA's own: parses JSON lines
 * (stripping "for (;;);"), applies @stream items (path ends in an index) and @defer fragments (deep merge).
 * -> { payloads, data, errors, final }
 */
export function decodeResponse(text) {
  const payloads = String(text)
    .split("\n")
    .map((l) => l.trim().replace(/^for \(;;\);/, ""))
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const merge = (a, b) => {
    if (!b || typeof b !== "object" || Array.isArray(b) || !a || typeof a !== "object") return b;
    for (const [k, v] of Object.entries(b)) a[k] = merge(a[k], v);
    return a;
  };
  let data = null;
  const errors = [];
  for (const p of payloads) {
    if (p.errors) errors.push(...p.errors);
    if (!("path" in p)) {
      data = merge(data ?? {}, p.data ?? {});
      continue;
    }
    data ??= {};
    const parent = p.path.slice(0, -1).reduce((o, k) => o[k], data);
    const last = p.path.at(-1);
    if (typeof last === "number" && /\$stream\$/.test(p.label || "")) parent[last] = p.data;
    else if (p.path.length) parent[last] = merge(parent[last] ?? {}, p.data);
    else merge(data, p.data);
  }
  return { payloads, data, errors, final: payloads.some((p) => p.extensions?.is_final) };
}
