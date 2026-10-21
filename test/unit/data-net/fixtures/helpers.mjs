// Fakes shared by data-net tests: virtual clock, harvest, platform.fetch, op registry, GraphQL client.

import { readFileSync } from "node:fs";

export const fixture = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
export const fixtureJson = (name) => JSON.parse(fixture(name));

/** Virtual time: sleep() advances the clock instantly and records the requested delays. */
export function fakeClock(start = 1_800_000_000_000) {
  let t = start;
  const sleeps = [];
  return {
    now: () => t,
    async sleep(ms) {
      sleeps.push(ms);
      t += ms;
    },
    advance(ms) {
      t += ms;
    },
    sleeps,
  };
}

export function fakeHarvest({ tokens = {}, ...rest } = {}) {
  return {
    tokens: {
      dtsg: "NAcTestDtsgToken:17:1800000000",
      lsd: "AdR16GsCBuzx6HMHP0pOQzBIMP8",
      userId: "100000000000001",
      name: "Test User",
      shortName: "Test",
      site: {
        server_revision: 1051133768,
        client_revision: 1051133768,
        haste_session: "20747.HYP:comet_pkg.2.1...0",
        hsi: "7699081856574727250",
        comet_env: 15,
        __spin_r: 1051133768,
        __spin_b: "trunk",
        __spin_t: 1792582184,
      },
      ...tokens,
    },
    preloaders: new Map(),
    prefetched: new Map(),
    env: { typenamePairs: [], keys: [] },
    routeProps: null,
    checkpointed: false,
    ...rest,
  };
}

export const jsonl = (...payloads) => payloads.map((p) => JSON.stringify(p)).join("\n");

export function response(body, { status = 200, url = "https://www.facebook.com/api/graphql/" } = {}) {
  return { status, ok: status >= 200 && status < 300, url, text: async () => body };
}

/**
 * platform.fetch double. `reply(call, index)` returns a response (or throws). Calls record the parsed form
 * body and the number of requests in flight when each one started.
 */
export function fakeFetch(reply, { delay = 0 } = {}) {
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fetch = async (url, init) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const call = { url, init, form: new URLSearchParams(init.body), headers: init.headers };
    call.variables = JSON.parse(call.form.get("variables") || "null");
    calls.push(call);
    try {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      return await reply(call, calls.length - 1);
    } finally {
      inFlight--;
    }
  };
  return {
    fetch,
    calls,
    get maxInFlight() {
      return maxInFlight;
    },
  };
}

/** A GraphQL client double: answers from `handler(name, docId, variables)` and records the calls. */
export function fakeClient(handler) {
  const calls = [];
  return {
    calls,
    halted: false,
    stats: () => ({}),
    async request(name, docId, variables) {
      calls.push({ name, docId, variables: structuredClone(variables) });
      return handler(name, docId, variables, calls.length - 1);
    },
  };
}

/** An op registry double with a fixed answer per name and a record of invalidations. */
export function fakeOps(table) {
  const invalidated = [];
  return {
    invalidated,
    async get(name) {
      const list = (table[name] || []).filter((op) => !invalidated.some((i) => i.name === name && i.docId === op.docId));
      return list[0] ? structuredClone(list[0]) : null;
    },
    invalidate(name, docId) {
      invalidated.push({ name, docId });
    },
    learn() {},
    snapshot: () => ({}),
  };
}

/** Deterministic PRNG (mulberry32). */
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
