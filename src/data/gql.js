// GraphQL client: replays Facebook's own /api/graphql/ form requests with harvested tokens, paces them like a
// person (one request in flight, jittered gaps, nothing while the tab is hidden) and maps failures to kinds.
// graphql-protocol §2 (request), §3 (response, errors), §13 (pacing and safety).

import { health, sleep as realSleep, warn } from "../shared/util.js";
import { parseLines, stitch } from "./jsonl.js";
import { restoreTypenames } from "./typenames.js";

/** Response decoders (WP-A). Injectable so tests and callers can swap them. */
export const DEFAULT_CODEC = { parseLines, stitch, restoreTypenames };

const ENDPOINT_PATH = "/api/graphql/";
const ASBD_ID = "359341"; // x-asbd-id Facebook sends in 2026 (§2.3, MED)
const GAP_SPREAD = 0.5; // gap = minGapMs × [1, 1.5)
const COOLDOWN_BASE_MS = 60e3;
const COOLDOWN_MAX_MS = 15 * 60e3;
const REQUEST_TIMEOUT_MS = 45e3; // a stalled response must not hold the one-request queue forever
// ...but the next request waits until the stalled one is really over (or this long after the timeout), so two
// never overlap: the page's fetch cannot be aborted portably (Firefox's content.fetch takes no foreign signal).
const STALL_HOLD_MS = 120e3;
// A checkpoint or account warning stops MFGA's requests in every tab and across reloads for this long (fbk: "a
// checkpoint disengages for 6 hours"); rate-limit cooldowns are shared the same way until they expire.
export const GUARD_STORAGE_KEY = "mfga:guard";
const HALT_HOLD_MS = 6 * 3600e3;
const CLOCK_SLACK_MS = 60e3;
// Circuit breaker: this many requests in a row failing on the session (token, auth) or the server/network pause
// this page's requests instead of sending one doomed request per visible story.
const BREAKER_FAILURES = 3;
const BREAKER_PAUSE_MS = 3 * 60e3;
const BREAKER_KINDS = new Set(["token", "auth", "server", "network"]);

/** §3.3 error codes. Anything unknown is "server". */
const CODE_KINDS = new Map([
  [1357001, "auth"], // "Not Logged In" of Facebook's async-response envelope
  [1357004, "auth"],
  [1357051, "token"],
  [1677047, "token"],
  [1675012, "variables"],
  [1570245, "stale-doc"],
  [1357010, "field"],
  [1675004, "rate"],
  [1357046, "rate"],
  [1675039, "soft-block"],
  [1384000, "checkpoint"],
]);

/** §13 account-warning texts; only checked in non-JSON bodies and error messages, never in story data. */
const WARNING_MARKERS = [
  /we suspect automated behaviou?r/i,
  /suspicious activity on your account/i,
  /temporarily restricted/i,
  /permanently disabled/i,
  /unusual activity/i,
];
// Unescaped key only: a post quoting it would arrive as \"is_checkpointed\":true.
const CHECKPOINT_FLAG = /"is_checkpointed":true/;
const CHECKPOINT_URL = /\/checkpoint\b/;
const LOGIN_URL = /\/login\b/;

export class GqlError extends Error {
  /** kind: "auth"|"token"|"stale-doc"|"variables"|"field"|"rate"|"soft-block"|"checkpoint"|"network"|"server" */
  constructor(message, { code = null, kind = "server" } = {}) {
    super(message);
    this.name = "GqlError";
    this.code = code;
    this.kind = kind;
  }
}

export function errorKind(code) {
  return CODE_KINDS.get(Number(code)) ?? "server";
}

/** "2" + the sum of the token's UTF-16 code units (§2.4). */
export function jazoest(token) {
  let sum = 0;
  for (let i = 0; i < token.length; i++) sum += token.charCodeAt(i);
  return `2${sum}`;
}

/** Facebook's full Comet form body, built from harvested tokens and SiteData (§2.2). Unknown fields are omitted. */
export function buildForm(tokens, { friendlyName, docId, variables, req, session, dpr = 1 }) {
  const site = tokens.site || {};
  const csrf = tokens.dtsg || tokens.lsd;
  const fields = [
    ["av", tokens.userId],
    ["__aaid", "0"],
    ["__user", tokens.userId],
    ["__a", "1"],
    ["__req", req.toString(36)],
    ["__hs", site.haste_session],
    ["dpr", dpr],
    ["__ccg", "EXCELLENT"],
    ["__rev", site.client_revision ?? site.server_revision],
    ["__s", session],
    ["__hsi", site.hsi],
    ["__comet_req", site.comet_env ?? 15],
    ["fb_dtsg", tokens.dtsg],
    ["jazoest", csrf ? jazoest(csrf) : null],
    ["lsd", tokens.lsd],
    ["__spin_r", site.__spin_r],
    ["__spin_b", site.__spin_b],
    ["__spin_t", site.__spin_t],
    ["fb_api_caller_class", "RelayModern"],
    ["fb_api_req_friendly_name", friendlyName],
    ["variables", JSON.stringify(variables ?? {})],
    ["server_timestamps", "true"],
    ["doc_id", docId],
  ];
  const body = new URLSearchParams();
  for (const [key, value] of fields) if (value != null && value !== "") body.append(key, String(value));
  return body;
}

/** Stitches parsed lines (or SSR payloads) into one response and restores obfuscated typenames (§3.4, §8.4). */
export function decodePayloads(payloads, typenamePairs, codec = DEFAULT_CODEC) {
  const { data = null, errors = [] } = codec.stitch(payloads) || {};
  if (data && typenamePairs?.length) codec.restoreTypenames(data, typenamePairs);
  return { data, errors };
}

/** Random "xxxxxx:yyyyyy:zzzzzz" session triple sent as __s. */
function sessionTriple(random) {
  const part = () => Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0");
  return `${part()}:${part()}:${part()}`;
}

function endpoint() {
  const origin = globalThis.location?.origin;
  return typeof origin === "string" && origin.startsWith("http") ? origin + ENDPOINT_PATH : ENDPOINT_PATH;
}

function documentVisibility() {
  const doc = globalThis.document;
  return {
    hidden: () => doc?.visibilityState === "hidden",
    wait: () => new Promise((resolve) => doc.addEventListener("visibilitychange", resolve, { once: true })),
  };
}

const hasWarning = (s) => typeof s === "string" && WARNING_MARKERS.some((re) => re.test(s));
const noop = () => {};

/** `url` with its %-escapes decoded (a login redirect carries its destination in ?next=), or as is. */
function decoded(url) {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

/**
 * Session-level failures come in Facebook's async-response envelope instead of GraphQL, behind the
 * for (;;); guard: {"__ar":1,"error":1357004,"errorSummary":"…","errorDescription":"…","payload":null}.
 */
function envelopeErrors(lines) {
  return lines
    .filter((line) => line?.error != null && !("data" in line) && !("errors" in line))
    .map((line) => ({ code: Number(line.error) || null, message: line.errorSummary, summary: line.errorSummary, description: line.errorDescription }));
}

/** Rejects with a network GqlError when `promise` has not settled after `ms` (calling onExpire); a late result is ignored. */
function withTimeout(promise, ms, onExpire) {
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => {
      onExpire?.();
      reject(new GqlError(`no response after ${ms} ms`, { kind: "network" }));
    }, ms);
  });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

/** A stored halt that still applies at `t`: recorded at most HALT_HOLD_MS ago (and not in the future). */
function liveHalt(h, t) {
  return h && typeof h === "object" && typeof h.reason === "string" && Number.isFinite(h.at) && h.at <= t + CLOCK_SLACK_MS && t - h.at < HALT_HOLD_MS ? h : null;
}

/** A stored cooldown end that is still ahead of `t` and plausible (never more than the longest cooldown away). */
function liveUntil(v, t) {
  const until = Number(v);
  return Number.isFinite(until) && until > t && until <= t + COOLDOWN_MAX_MS + CLOCK_SLACK_MS ? until : 0;
}

/**
 * createGqlClient({ platform, harvest, minGapMs, onHalt }) -> { request, halted, stats }
 * stopOnCheckpoint (settings.advanced.stopOnCheckpoint): false = a checkpoint fails only that request.
 * timeoutMs: a request without a complete response by then fails as "network"; the next one is sent once the
 * stalled fetch is over (at most stallHoldMs later).
 * Halts and rate-limit cooldowns are recorded in platform.storage (GUARD_STORAGE_KEY) and honoured by every tab and
 * by later pages: a halt for HALT_HOLD_MS, a cooldown until it ends. A halt found there sets `halted` and calls
 * onHalt when a request is refused for it.
 * Test/wiring hooks: codec, now, sleep, random, visibility {hidden(), wait()}, refreshTokens().
 */
export function createGqlClient({
  platform,
  harvest,
  minGapMs = 1500,
  onHalt,
  stopOnCheckpoint = true,
  timeoutMs = REQUEST_TIMEOUT_MS,
  stallHoldMs = STALL_HOLD_MS,
  codec = DEFAULT_CODEC,
  now = () => Date.now(),
  sleep = realSleep,
  random = Math.random,
  visibility = documentVisibility(),
  refreshTokens = () => harvest.refresh?.(),
}) {
  const session = sessionTriple(random);
  const counts = { requests: 0, ok: 0, errors: Object.create(null), retries: 0 };
  let tail = Promise.resolve();
  let queued = 0;
  let inFlight = false;
  let reqCounter = 0;
  let nextAt = 0;
  let strikes = 0;
  let cooldownUntil = 0;
  let haltReason = null;
  let haltAt = 0;
  let failures = 0; // consecutive BREAKER_KINDS failures
  let pausedUntil = 0;
  let pauseKind = "network";
  let stalled = null; // Promise: a timed-out fetch that may still be open
  const shared = typeof platform?.storage?.get === "function" && typeof platform.storage.set === "function" ? platform.storage : null;

  const client = {
    request,
    get halted() {
      return haltReason != null;
    },
    stats,
  };
  // A halt or cooldown recorded by another tab or an earlier page applies from the start (`halted` is true at
  // once); onHalt hears about such a halt when a request is refused for it, so a disabled MFGA never does.
  let unannounced = false;
  syncShared({ quiet: true });
  return client;

  /** Queues one request; requests run strictly one after another. */
  function request(friendlyName, docId, variables) {
    queued++;
    const run = tail.then(() => {
      queued--;
      return execute(friendlyName, docId, variables);
    });
    tail = run.catch(() => {});
    return run;
  }

  async function execute(friendlyName, docId, variables) {
    try {
      await ensureUsable();
      await pace();
      await ensureUsable();
      const usedDtsg = harvest.tokens.dtsg;
      try {
        return await send(friendlyName, docId, variables);
      } catch (err) {
        if (err.kind !== "token" || !(await tokensRefreshed(usedDtsg))) throw err;
        counts.retries++;
        await pace();
        return await send(friendlyName, docId, variables);
      }
    } catch (err) {
      const e = err instanceof GqlError ? err : new GqlError(String(err?.message || err), { kind: "server" });
      counts.errors[e.kind] = (counts.errors[e.kind] || 0) + 1;
      health.count(`gql.error.${e.kind}`);
      throw e;
    }
  }

  async function ensureUsable() {
    await syncShared();
    if (haltReason && unannounced) {
      unannounced = false;
      announce(haltReason);
    }
    if (haltReason) throw new GqlError(`requests halted (${haltReason})`, { kind: "checkpoint" });
    if (harvest.checkpointed && stopOnCheckpoint) halt("checkpoint-flag");
    if (now() < cooldownUntil) throw new GqlError("cooling down after a rate limit", { kind: "rate" });
    if (now() < pausedUntil) throw new GqlError("paused after repeated failures", { kind: pauseKind });
    const { userId, dtsg } = harvest.tokens;
    if (!userId || userId === "0") throw new GqlError("not logged in", { kind: "auth" });
    if (!dtsg && !(await tokensRefreshed(null))) throw new GqlError("no fb_dtsg token", { kind: "token" });
  }

  /** Re-reads tokens (harvest rescans inline data); true when a new fb_dtsg appeared. */
  async function tokensRefreshed(previous) {
    try {
      await refreshTokens();
    } catch (err) {
      warn("token refresh failed", err);
    }
    const dtsg = harvest.tokens.dtsg;
    return !!dtsg && dtsg !== previous;
  }

  /** Waits for the jittered gap after the previous request and for the tab to be visible. */
  async function pace() {
    for (;;) {
      if (stalled) {
        await stalled;
        continue;
      }
      if (visibility.hidden()) {
        await visibility.wait();
        continue;
      }
      const wait = nextAt - now();
      if (wait <= 0) return;
      await sleep(wait);
    }
  }

  async function send(friendlyName, docId, variables) {
    const tokens = harvest.tokens;
    const body = buildForm(tokens, {
      friendlyName,
      docId,
      variables,
      req: ++reqCounter,
      session,
      dpr: Math.trunc(globalThis.devicePixelRatio || 1) || 1,
    });
    const headers = { "content-type": "application/x-www-form-urlencoded", "x-fb-friendly-name": friendlyName, "x-asbd-id": ASBD_ID };
    if (tokens.lsd) headers["x-fb-lsd"] = tokens.lsd;
    counts.requests++;
    health.count("gql.requests");
    inFlight = true;
    const pending = fetchText(body, headers);
    let timedOut = false;
    try {
      const text = await withTimeout(pending, timeoutMs, () => (timedOut = true));
      const result = parse(text);
      counts.ok++;
      failures = 0;
      if (strikes) {
        strikes = 0;
        saveShared();
      }
      return result;
    } catch (err) {
      if (err.kind === "rate" || err.kind === "soft-block") coolDown();
      else if (BREAKER_KINDS.has(err.kind)) countFailure(err.kind);
      throw err;
    } finally {
      if (timedOut) holdUntilSettled(pending);
      else release();
    }
  }

  /** The request is over: the next one may start after the jittered gap. */
  function release() {
    inFlight = false;
    nextAt = now() + minGapMs * (1 + random() * GAP_SPREAD);
  }

  /** A timed-out fetch may still be open: the queue stays closed until it settles (at most stallHoldMs). */
  function holdUntilSettled(pending) {
    let timer;
    const cap = new Promise((resolve) => (timer = setTimeout(resolve, stallHoldMs)));
    stalled = Promise.race([pending.then(noop, noop), cap]).then(() => {
      clearTimeout(timer);
      stalled = null;
      release();
    });
  }

  function countFailure(kind) {
    if (++failures < BREAKER_FAILURES) return;
    failures = 0;
    pausedUntil = now() + BREAKER_PAUSE_MS;
    pauseKind = kind;
    health.count("gql.paused");
  }

  async function fetchText(body, headers) {
    let res;
    try {
      res = await platform.fetch(endpoint(), { method: "POST", credentials: "include", headers, body: body.toString() });
    } catch (err) {
      throw new GqlError(`network: ${err?.message || err}`, { kind: "network" });
    }
    checkRedirect(res.url);
    if (res.status === 429) throw new GqlError("HTTP 429", { kind: "rate" });
    if (res.status === 401 || res.status === 403) throw new GqlError(`HTTP ${res.status}`, { kind: "auth" });
    if (!res.ok) throw new GqlError(`HTTP ${res.status}`, { kind: "server" });
    try {
      return await res.text();
    } catch (err) {
      throw new GqlError(`network: ${err?.message || err}`, { kind: "network" });
    }
  }

  /** An HTTP redirect target, or the envelope's {"redirect": "..."}. A login page on the way to a checkpoint is one too. */
  function checkRedirect(target) {
    const url = String(target || "");
    if (CHECKPOINT_URL.test(url) || CHECKPOINT_URL.test(decoded(url))) halt("checkpoint-redirect");
    if (LOGIN_URL.test(url)) throw new GqlError("redirected to login", { kind: "auth" });
  }

  function parse(text) {
    if (CHECKPOINT_FLAG.test(text)) halt("checkpoint-flag");
    const lines = codec.parseLines(text);
    if (!lines.length) {
      if (hasWarning(text)) halt("account-warning");
      throw new GqlError("empty or unparseable response", { kind: "soft-block" });
    }
    for (const line of lines) if (typeof line?.redirect === "string") checkRedirect(line.redirect);
    const decoded = decodePayloads(lines, harvest.env?.typenamePairs, codec);
    const data = decoded.data;
    const errors = [...decoded.errors, ...envelopeErrors(lines)];
    for (const e of errors) if (hasWarning(e?.message) || hasWarning(e?.summary) || hasWarning(e?.description)) halt("account-warning");
    const critical = errors.find((e) => e?.severity !== "WARNING" && errorKind(e?.code) !== "server");
    const failure = critical ?? (data == null ? errors[0] : null);
    if (failure) {
      const kind = errorKind(failure.code);
      if (kind === "checkpoint") halt("checkpoint-code");
      throw new GqlError(String(failure.message || failure.summary || `GraphQL error ${failure.code}`), { code: failure.code ?? null, kind });
    }
    if (data == null) throw new GqlError("response without data", { kind: "soft-block" });
    return { data, errors, lines };
  }

  /**
   * Stops every future request (unless disabled) — in every tab and for HALT_HOLD_MS, through the shared
   * record — and tells the app why. Always throws.
   */
  function halt(reason) {
    if (!haltReason) {
      if (stopOnCheckpoint) {
        haltReason = reason;
        haltAt = now();
        saveShared();
      }
      announce(reason);
    }
    throw new GqlError(`requests halted (${reason})`, { kind: "checkpoint" });
  }

  function announce(reason) {
    health.count("gql.halt");
    health.fact("gql.haltReason", reason);
    try {
      onHalt?.(reason);
    } catch (err) {
      warn("onHalt failed", err);
    }
  }

  function coolDown() {
    strikes++;
    cooldownUntil = Math.max(cooldownUntil, now() + Math.min(COOLDOWN_MAX_MS, COOLDOWN_BASE_MS * 2 ** (strikes - 1)));
    saveShared();
  }

  async function readShared() {
    if (!shared) return null;
    try {
      const saved = await shared.get(GUARD_STORAGE_KEY);
      return saved && typeof saved === "object" ? saved : null;
    } catch {
      return null;
    }
  }

  /** Adopts a halt or a longer cooldown that another tab (or an earlier page) recorded. quiet: report the halt later. */
  async function syncShared({ quiet = false } = {}) {
    const saved = await readShared();
    if (!saved) return;
    const t = now();
    const h = liveHalt(saved.halt, t);
    if (h && stopOnCheckpoint && !haltReason) {
      haltReason = h.reason;
      haltAt = h.at;
      health.fact("gql.haltReason", h.reason);
      if (quiet) unannounced = true;
      else announce(h.reason);
    }
    cooldownUntil = Math.max(cooldownUntil, liveUntil(saved.cooldownUntil, t));
    const s = Number(saved.strikes);
    if (Number.isInteger(s) && s > strikes && s <= 16) strikes = s;
  }

  /** Records this client's halt and cooldown, keeping what other tabs recorded meanwhile. Best effort. */
  async function saveShared() {
    if (!shared) return;
    try {
      const saved = await readShared();
      const t = now();
      const record = {
        halt: haltReason && stopOnCheckpoint ? { reason: haltReason, at: haltAt } : liveHalt(saved?.halt, t),
        cooldownUntil: Math.max(cooldownUntil, liveUntil(saved?.cooldownUntil, t)),
        strikes,
      };
      await shared.set(GUARD_STORAGE_KEY, record);
    } catch {
      health.count("gql.guardSaveFailed");
    }
  }

  function stats() {
    return {
      requests: counts.requests,
      ok: counts.ok,
      retries: counts.retries,
      errors: { ...counts.errors },
      inFlight,
      queued,
      halted: haltReason != null,
      haltReason,
      cooldownMs: Math.max(0, cooldownUntil - now()),
      pausedMs: Math.max(0, pausedUntil - now()),
    };
  }
}
