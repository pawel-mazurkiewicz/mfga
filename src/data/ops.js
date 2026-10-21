// Operation registry: which doc_id (and variables template) to send for a GraphQL operation.
// Order (graphql-protocol §11.2): SSR preloader -> background-learned -> persisted cache -> MAIN-world probe ->
// built-in fallback table. doc_ids rotate per deploy, so a rejected id is invalidated and the next one tried.

import { health } from "../shared/util.js";

export const OPS_STORAGE_KEY = "mfga:ops";
const CACHE_MAX_AGE_MS = 30 * 86400e3;
const LEARNED_TTL_MS = 15e3;
const PROBE_TIMEOUT_MS = 1500;
const DOC_ID = /^\d{5,}$/;

/** graphql-protocol §14: newest observed id per operation (2026-09). Last resort only; they expire. */
export const FALLBACK_DOC_IDS = Object.freeze({
  CometModernHomeFeedQuery: "28136951115834703",
  CometNewsFeedPaginationQuery: "28827638856853689",
  CometUFIFeedbackReactMutation: "27646120298312844",
  useCometUFICreateCommentMutation: "39607465588840384",
  CometUFIDeleteCommentMutation: "28058620387108821",
  useCometUFIEditCommentMutation: "28765227863112159",
  CometUFIReactionsDialogQuery: "28316088138022831",
  CometFeedFavoritesEndOfFeedMessageQuery: "9839941666067123",
  FeedsCometFilterPanelQuery: "10051869914845503",
  GroupsCometFeedRegularStoriesPaginationQuery: "26577462205242925",
  ProfileCometTimelineFeedQuery: "28736035046001218",
});

const badKey = (name, docId) => `${name}\n${docId}`;
const validEntry = (e) => e != null && typeof e === "object" && DOC_ID.test(String(e.docId));

/**
 * True when an error means "this doc_id is wrong". field_exception (1357010) also comes from bad variables
 * (e.g. a wrong groupID), so it only counts against ids that may be from an older deploy.
 */
export function isDocError(err, op) {
  return err?.kind === "stale-doc" || (err?.kind === "field" && !op?.fresh);
}

/**
 * Sends `name` with the registry's best doc_id; on a doc_id error invalidates it and retries once with the
 * next candidate (invalidated as well if it fails the same way). build(op) returns the variables.
 * Resolves null when no doc_id is known at all.
 */
export async function runOp({ client, ops }, name, build) {
  const op = await ops.get(name);
  if (!op) return null;
  try {
    return await client.request(name, op.docId, build(op));
  } catch (err) {
    if (!isDocError(err, op)) throw err;
    ops.invalidate(name, op.docId);
    const next = await ops.get(name);
    if (!next) throw err;
    health.count("ops.retry");
    try {
      return await client.request(name, next.docId, build(next));
    } catch (retryErr) {
      // Otherwise the next call would spend a paced request on this id again.
      if (isDocError(retryErr, next)) ops.invalidate(name, next.docId);
      throw retryErr;
    }
  }
}

/**
 * get(name) -> {docId, variables, source, fresh} | null. `fresh`: known to belong to the current deploy.
 * Hook for tests: now().
 */
export function createOpRegistry({ platform, harvest, now = () => Date.now() }) {
  const bad = new Set();
  const memory = new Map(); // learn() entries
  const probes = new Map(); // name -> Promise<docId|null>, once per page
  const resolved = new Map(); // name -> {source, docId} of the last answer (diagnostics)
  let cache = null; // Promise<Record<name, entry>>
  let background = null; // {at, ops: Promise<Record<name, LearnedOp>>}

  const currentRev = () => {
    const site = harvest.tokens?.site;
    return site?.client_revision ?? site?.server_revision ?? null;
  };
  const candidate = (entry, source) => ({
    docId: String(entry.docId),
    variables: entry.variables ?? null,
    source,
    fresh: source === "preloader" || source === "probe" || (entry.rev != null && String(entry.rev) === String(currentRev())),
  });

  const tiers = [fromPreloader, fromLearned, fromCache, fromProbe, fromFallback];

  return {
    async get(name) {
      for (const tier of tiers) {
        const op = await tier(name);
        if (op && !bad.has(badKey(name, op.docId))) {
          resolved.set(name, { source: op.source, docId: op.docId });
          return { ...op, variables: op.variables == null ? null : structuredClone(op.variables) };
        }
      }
      resolved.set(name, null);
      return null;
    },
    invalidate(name, docId) {
      bad.add(badKey(name, docId));
      health.count("ops.invalidate");
      if (memory.get(name)?.docId === docId) memory.delete(name);
      return loadCache().then((c) => {
        if (c[name]?.docId !== docId) return;
        delete c[name];
        return save(c);
      });
    },
    learn(name, docId, variables, source = "learned") {
      if (!DOC_ID.test(String(docId))) return Promise.resolve();
      const entry = { docId: String(docId), variables: variables ?? null, seenAt: now(), source, rev: currentRev() };
      bad.delete(badKey(name, entry.docId));
      memory.set(name, entry);
      return persist(name, entry);
    },
    snapshot() {
      return {
        resolved: Object.fromEntries(resolved),
        invalidated: [...bad].map((k) => k.split("\n")[0]),
        learned: [...memory.keys()],
        preloaders: [...(harvest.preloaders?.keys() ?? [])],
        probe: !!platform.page?.requireOp,
      };
    },
  };

  function fromPreloader(name) {
    const p = harvest.preloaders?.get(name);
    return p && DOC_ID.test(p.queryID) ? candidate({ docId: p.queryID, variables: p.variables }, "preloader") : null;
  }

  async function fromLearned(name) {
    const fromBackground = (await backgroundOps())[name];
    const mine = memory.get(name);
    const newest = [fromBackground, mine].filter(validEntry).sort((a, b) => (b.seenAt || 0) - (a.seenAt || 0))[0];
    if (!newest) return null;
    // Keep what the background saw: its own state may not survive a service-worker restart.
    const cached = (await loadCache())[name];
    if (newest === fromBackground && (cached?.docId !== String(newest.docId) || (cached.seenAt || 0) < (newest.seenAt || 0))) {
      persist(name, { docId: String(newest.docId), variables: newest.variables ?? null, seenAt: newest.seenAt || now(), source: "background", rev: newest.rev ?? null });
    }
    return candidate(newest, "learned");
  }

  async function backgroundOps() {
    if (!background || now() - background.at > LEARNED_TTL_MS) {
      background = { at: now(), ops: Promise.resolve().then(() => platform.learnedOps?.()).catch(() => null) };
    }
    return (await background.ops) || {};
  }

  async function fromCache(name) {
    const entry = (await loadCache())[name];
    return entry ? candidate(entry, "cache") : null;
  }

  async function fromProbe(name) {
    if (!platform.page?.requireOp) return null;
    if (!probes.has(name)) probes.set(name, probe(name));
    const docId = await probes.get(name);
    return docId ? candidate({ docId }, "probe") : null;
  }

  async function probe(name) {
    const docId = await platform.page.requireOp(name, PROBE_TIMEOUT_MS).catch(() => null);
    if (!DOC_ID.test(String(docId ?? ""))) return null;
    health.count("ops.probed");
    persist(name, { docId: String(docId), variables: null, seenAt: now(), source: "probe", rev: currentRev() });
    return String(docId);
  }

  function fromFallback(name) {
    const docId = FALLBACK_DOC_IDS[name];
    return docId ? candidate({ docId }, "fallback") : null;
  }

  function loadCache() {
    cache ??= Promise.resolve()
      .then(() => platform.storage.get(OPS_STORAGE_KEY))
      .then((stored) => {
        const fresh = {};
        for (const [name, entry] of Object.entries(stored && typeof stored === "object" ? stored : {})) {
          // "__proto__" would replace the cache object's prototype (page-writable storage in the userscript fallback).
          if (name !== "__proto__" && validEntry(entry) && now() - (entry.seenAt || 0) < CACHE_MAX_AGE_MS) fresh[name] = entry;
        }
        return fresh;
      })
      .catch(() => ({}));
    return cache;
  }

  async function persist(name, entry) {
    const c = await loadCache();
    c[name] = entry;
    await save(c);
  }

  function save(c) {
    return Promise.resolve()
      .then(() => platform.storage.set(OPS_STORAGE_KEY, c))
      .catch(() => health.count("ops.persistFailed"));
  }
}
