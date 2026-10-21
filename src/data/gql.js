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

/** §3.3 error codes. Anything unknown is "server". */
const CODE_KINDS = new Map([
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

/**
 * createGqlClient({ platform, harvest, minGapMs, onHalt }) -> { request, halted, stats }
 * Test/wiring hooks: codec, now, sleep, random, visibility {hidden(), wait()}, refreshTokens().
 */
export function createGqlClient({
  platform,
  harvest,
  minGapMs = 1500,
  onHalt,
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

  const client = {
    request,
    get halted() {
      return haltReason != null;
    },
    stats,
  };
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
    if (haltReason) throw new GqlError(`requests halted (${haltReason})`, { kind: "checkpoint" });
    if (harvest.checkpointed) halt("checkpoint-flag");
    if (now() < cooldownUntil) throw new GqlError("cooling down after a rate limit", { kind: "rate" });
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
    try {
      const text = await fetchText(body, headers);
      const result = parse(text);
      counts.ok++;
      strikes = 0;
      return result;
    } catch (err) {
      if (err.kind === "rate" || err.kind === "soft-block") coolDown();
      throw err;
    } finally {
      inFlight = false;
      nextAt = now() + minGapMs * (1 + random() * GAP_SPREAD);
    }
  }

  async function fetchText(body, headers) {
    let res;
    try {
      res = await platform.fetch(endpoint(), { method: "POST", credentials: "include", headers, body: body.toString() });
    } catch (err) {
      throw new GqlError(`network: ${err?.message || err}`, { kind: "network" });
    }
    const url = String(res.url || "");
    if (/\/checkpoint\b/.test(url)) halt("checkpoint-redirect");
    if (/\/login\b/.test(url)) throw new GqlError("redirected to login", { kind: "auth" });
    if (res.status === 429) throw new GqlError("HTTP 429", { kind: "rate" });
    if (res.status === 401 || res.status === 403) throw new GqlError(`HTTP ${res.status}`, { kind: "auth" });
    if (!res.ok) throw new GqlError(`HTTP ${res.status}`, { kind: "server" });
    try {
      return await res.text();
    } catch (err) {
      throw new GqlError(`network: ${err?.message || err}`, { kind: "network" });
    }
  }

  function parse(text) {
    if (CHECKPOINT_FLAG.test(text)) halt("checkpoint-flag");
    const lines = codec.parseLines(text);
    if (!lines.length) {
      if (hasWarning(text)) halt("account-warning");
      throw new GqlError("empty or unparseable response", { kind: "soft-block" });
    }
    const { data, errors } = decodePayloads(lines, harvest.env?.typenamePairs, codec);
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

  /** Stops every future request for this page and tells the app why. Always throws. */
  function halt(reason) {
    if (!haltReason) {
      haltReason = reason;
      health.count("gql.halt");
      health.fact("gql.haltReason", reason);
      try {
        onHalt?.(reason);
      } catch (err) {
        warn("onHalt failed", err);
      }
    }
    throw new GqlError(`requests halted (${reason})`, { kind: "checkpoint" });
  }

  function coolDown() {
    strikes++;
    cooldownUntil = Math.max(cooldownUntil, now() + Math.min(COOLDOWN_MAX_MS, COOLDOWN_BASE_MS * 2 ** (strikes - 1)));
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
    };
  }
}
