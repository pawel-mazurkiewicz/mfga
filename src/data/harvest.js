// SSR harvest: tokens, query preloaders, prefetched Relay payloads and Env, read from Facebook's inert inline
// JSON (<script type="application/json" data-sjs> and <script id="envjson">). Reads text only; patches nothing.
// graphql-protocol §2.5, §3.5-3.6, §4.4, §8.4; dom-chrome §6 (c_user / i_user cookies).

import { health, onRoot, safe } from "../shared/util.js";

const SCRIPT_SELECTOR = 'script[type="application/json"][data-sjs], script#envjson';
const MAX_DEPTH = 64;
const DTSG_FRAMES = new Set(["DTSGInitData", "DTSGInitialData"]);

const isObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

// Per-harvest bookkeeping kept off the public object: sequence numbers parallel to `prefetched` lists.
const internals = new WeakMap();
const internal = (sink) => {
  let s = internals.get(sink);
  if (!s) internals.set(sink, (s = { sequences: new Map(), blocks: 0, failed: 0 }));
  return s;
};

/**
 * Pure store.
 * tokens: {dtsg, lsd, userId, name, shortName, site}; preloaders: Map<queryName, {queryID, variables, preloaderID}>;
 * prefetched: Map<preloaderID, payload[]> (by sequence_number); env: {typenamePairs, keys}; routeProps;
 * checkpointed: a config frame carried "is_checkpointed": true.
 */
export function createHarvest() {
  const harvest = {
    tokens: { dtsg: null, lsd: null, userId: null, name: null, shortName: null, site: {} },
    preloaders: new Map(),
    prefetched: new Map(),
    env: { typenamePairs: [], keys: [] },
    routeProps: null,
    checkpointed: false,
    /** Diagnostics: names and counts only, never token values. */
    snapshot() {
      const t = harvest.tokens;
      const { blocks, failed } = internal(harvest);
      return {
        tokens: { dtsg: !!t.dtsg, lsd: !!t.lsd, userId: !!t.userId, name: !!t.name, site: Object.keys(t.site) },
        preloaders: [...harvest.preloaders.keys()],
        prefetched: Object.fromEntries([...harvest.prefetched].map(([id, list]) => [operationOf(id), list.length])),
        env: { keys: [...harvest.env.keys], typenamePairs: harvest.env.typenamePairs.length },
        routeProps: harvest.routeProps ? Object.keys(harvest.routeProps) : null,
        checkpointed: harvest.checkpointed,
        blocks,
        failed,
      };
    },
  };
  return harvest;
}

/** "adp_CometModernHomeFeedQueryRelayPreloader_6aca…" -> "CometModernHomeFeedQuery" */
function operationOf(preloaderID) {
  return /^adp_(.+?)RelayPreloader_/.exec(preloaderID)?.[1] ?? "other";
}

/** Walks one decoded data-sjs JSON tree into `sink`. Nesting moves between routes, so nothing is positional. */
export function parseSjs(json, sink) {
  walk(json, sink, 0);
  internal(sink).blocks++;
}

/** Reads the #envjson object: key names and the q9k7m2x typename-restore pairs. */
export function parseEnv(json, sink) {
  if (!isObject(json)) return;
  sink.env.keys = Object.keys(json);
  const pairs = Array.isArray(json.q9k7m2x) ? json.q9k7m2x : [];
  sink.env.typenamePairs = pairs.filter((p) => Array.isArray(p) && typeof p[0] === "string" && typeof p[1] === "string").map((p) => [p[0], p[1]]);
}

function walk(node, sink, depth) {
  if (node == null || typeof node !== "object" || depth > MAX_DEPTH) return;
  if (Array.isArray(node)) {
    if (readFrame(node, sink)) return;
    for (const item of node) walk(item, sink, depth + 1);
    return;
  }
  readObject(node, sink);
  for (const key in node) walk(node[key], sink, depth + 1);
}

/** Handles module frames; returns true when the frame's subtree needs no further walking. */
function readFrame(a, sink) {
  const head = a[0];
  if (typeof head !== "string") return false;
  if (head.startsWith("RelayPrefetchedStreamCache")) {
    if (a[1] === "next") addPrefetched(sink, a[3]);
    return true;
  }
  if (head === "CometRootEntryPointRenderer" && a[1] === "init") readEntryPoint(a[3], sink);
  // Config frames: ["Name", [deps], {config}, id]
  if (!Array.isArray(a[1]) || !isObject(a[2])) return false;
  return readConfig(head, a[2], sink);
}

function readConfig(name, config, sink) {
  const t = sink.tokens;
  if (DTSG_FRAMES.has(name)) {
    if (typeof config.token === "string" && config.token) t.dtsg = config.token;
  } else if (name === "LSD") {
    if (typeof config.token === "string" && config.token) t.lsd = config.token;
  } else if (name === "CurrentUserInitialData") {
    const id = String(config.USER_ID ?? "");
    if (/^\d+$/.test(id) && id !== "0") t.userId = id;
    if (typeof config.NAME === "string" && config.NAME) t.name = config.NAME;
    if (typeof config.SHORT_NAME === "string" && config.SHORT_NAME) t.shortName = config.SHORT_NAME;
  } else if (name === "SiteData") {
    t.site = { ...config };
  } else {
    return false;
  }
  return true;
}

function readObject(o, sink) {
  if (typeof o.queryName === "string" && typeof o.preloaderID === "string" && (typeof o.queryID === "string" || typeof o.queryID === "number")) {
    sink.preloaders.set(o.queryName, {
      queryID: String(o.queryID),
      variables: isObject(o.variables) ? o.variables : {},
      preloaderID: o.preloaderID,
    });
  }
  if (o.is_checkpointed === true) sink.checkpointed = true;
}

function readEntryPoint(args, sink) {
  const root = Array.isArray(args) ? args[0]?.entryPointRoot : null;
  const routeProps = root?.otherProps?.routeProps ?? root?.entryPointParams?.routeProps;
  if (isObject(routeProps)) sink.routeProps = routeProps;
}

/** ["adp_<Op>RelayPreloader_<hex>", {__bbox: {complete, result, sequence_number}}] */
function addPrefetched(sink, args) {
  const [id, box] = Array.isArray(args) ? args : [];
  const bbox = box?.__bbox;
  if (typeof id !== "string" || !isObject(bbox?.result)) return;
  const { sequences } = internal(sink);
  const list = sink.prefetched.get(id) ?? [];
  const seqs = sequences.get(id) ?? [];
  const seq = Number.isFinite(bbox.sequence_number) ? bbox.sequence_number : (seqs.at(-1) ?? -1) + 1;
  if (seqs.includes(seq)) return;
  let at = seqs.length;
  while (at > 0 && seqs[at - 1] > seq) at--;
  seqs.splice(at, 0, seq);
  list.splice(at, 0, bbox.result);
  sequences.set(id, seqs);
  sink.prefetched.set(id, list);
}

function cookieUserId(cookie) {
  // While acting as a Page, i_user is the acting actor; c_user is the account (dom-chrome §6).
  const read = (name) => new RegExp(`(?:^|;\\s*)${name}=(\\d+)`).exec(cookie)?.[1] ?? null;
  return read("i_user") ?? read("c_user");
}

const isHarvestScript = (node) =>
  node?.nodeName === "SCRIPT" && (node.id === "envjson" || (node.type === "application/json" && node.hasAttribute("data-sjs")));

/**
 * DOM harvester for document_start. Returns the Harvest plus:
 *   ready: Promise resolved after the DOMContentLoaded sweep; refresh(): rescans inline scripts; stop().
 */
export function startHarvest({ onUpdate } = {}) {
  const harvest = createHarvest();
  const parsed = new WeakSet();
  const pending = new Set(); // scripts whose text was still incomplete when seen
  let notifyQueued = false;
  let observer = null;
  let resolveReady;
  harvest.ready = new Promise((r) => (resolveReady = r));

  const notify = () => {
    if (notifyQueued || !onUpdate) return;
    notifyQueued = true;
    queueMicrotask(() => {
      notifyQueued = false;
      onUpdate(harvest);
    });
  };

  /** Parses a script once its text is complete JSON. `force` skips the data-content-len hint. */
  function read(script, force = false) {
    if (parsed.has(script)) return;
    const text = script.textContent || "";
    const expected = Number(script.getAttribute("data-content-len"));
    if (!force && expected > 0 && text.length < expected) {
      pending.add(script);
      return;
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      pending.add(script);
      return;
    }
    pending.delete(script);
    parsed.add(script);
    if (script.id === "envjson") parseEnv(json, harvest);
    else parseSjs(json, harvest);
    notify();
  }

  const onMutations = safe(
    "harvest",
    (records) => {
      for (const r of records) {
        if (isHarvestScript(r.target)) read(r.target); // the parser appended text to a script
        for (const n of r.addedNodes) if (isHarvestScript(n)) read(n);
      }
      for (const s of pending) read(s);
    },
    { disableOnError: false },
  );

  function refresh() {
    for (const s of document.querySelectorAll(SCRIPT_SELECTOR)) read(s, true);
    if (!harvest.tokens.userId) {
      const id = cookieUserId(document.cookie || "");
      if (id) {
        harvest.tokens.userId = id;
        notify();
      }
    }
  }

  const finish = safe(
    "harvest",
    () => {
      try {
        refresh();
        internal(harvest).failed += pending.size;
        if (pending.size) health.count("harvest.unparsed", pending.size);
        pending.clear();
      } finally {
        resolveReady();
      }
    },
    { disableOnError: false },
  );

  onRoot(() => {
    observer = new MutationObserver(onMutations);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    for (const s of document.querySelectorAll(SCRIPT_SELECTOR)) read(s);
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", finish, { once: true });
  else queueMicrotask(finish);

  harvest.refresh = refresh;
  harvest.stop = () => observer?.disconnect();
  return harvest;
}
