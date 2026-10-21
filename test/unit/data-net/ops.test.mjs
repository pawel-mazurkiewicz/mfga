import test from "node:test";
import assert from "node:assert/strict";
import { ops as mod, gql } from "./fixtures/load.mjs";
import { fakeClient, fakeHarvest, fakeOps } from "./fixtures/helpers.mjs";
import { basePlatform } from "../../../src/shared/platform.js";

const { FALLBACK_DOC_IDS, OPS_STORAGE_KEY, createOpRegistry, isDocError, runOp } = mod;
const { GqlError } = gql;

const OP = "CometUFIFeedbackReactMutation";
const DAY = 86400e3;

function setup({ preloader, learned = {}, stored, probe, now = () => 1_800_000_000_000 } = {}) {
  const harvest = fakeHarvest();
  if (preloader) harvest.preloaders.set(OP, preloader);
  const probes = [];
  let learnedCalls = 0;
  const platform = basePlatform({
    learnedOps: async () => {
      learnedCalls++;
      return learned;
    },
    page: probe === undefined ? null : { requireOp: async (name, ms) => (probes.push({ name, ms }), probe), navigate: async () => false },
  });
  if (stored) platform.storage.set(OPS_STORAGE_KEY, stored);
  const registry = createOpRegistry({ platform, harvest, now });
  return { registry, platform, harvest, probes, learnedCalls: () => learnedCalls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

test("the fallback table carries the newest observed id per operation (graphql-protocol §14)", () => {
  assert.equal(FALLBACK_DOC_IDS.CometModernHomeFeedQuery, "28136951115834703");
  assert.equal(FALLBACK_DOC_IDS.CometNewsFeedPaginationQuery, "28827638856853689");
  assert.equal(FALLBACK_DOC_IDS.CometUFIFeedbackReactMutation, "27646120298312844");
  assert.equal(FALLBACK_DOC_IDS.useCometUFICreateCommentMutation, "39607465588840384");
  for (const id of Object.values(FALLBACK_DOC_IDS)) assert.match(id, /^\d{15,17}$/);
  assert.ok(Object.isFrozen(FALLBACK_DOC_IDS));
});

test("order: SSR preloader > background-learned > persisted cache > MAIN-world probe > fallback", async () => {
  const pre = { queryID: "11111111111111111", variables: { from: "preloader" }, preloaderID: "adp_x" };
  const learned = { [OP]: { docId: "22222222222222222", variables: { from: "background" }, seenAt: 5 } };
  const stored = { [OP]: { docId: "33333333333333333", variables: { from: "cache" }, seenAt: 1_800_000_000_000 - DAY, source: "learned" } };

  let s = setup({ preloader: pre, learned, stored, probe: "44444444444444444" });
  assert.deepEqual(await s.registry.get(OP), { docId: "11111111111111111", variables: { from: "preloader" }, source: "preloader", fresh: true });

  s = setup({ learned, stored, probe: "44444444444444444" });
  assert.equal((await s.registry.get(OP)).source, "learned");
  assert.deepEqual((await s.registry.get(OP)).variables, { from: "background" });

  s = setup({ stored, probe: "44444444444444444" });
  assert.deepEqual(await s.registry.get(OP), { docId: "33333333333333333", variables: { from: "cache" }, source: "cache", fresh: false });
  assert.equal(s.probes.length, 0, "no probe while a cached id exists");

  s = setup({ probe: "44444444444444444" });
  assert.deepEqual(await s.registry.get(OP), { docId: "44444444444444444", variables: null, source: "probe", fresh: true });

  s = setup({ probe: null });
  assert.deepEqual(await s.registry.get(OP), { docId: FALLBACK_DOC_IDS[OP], variables: null, source: "fallback", fresh: false });

  s = setup();
  assert.equal(await s.registry.get("NoSuchOperation"), null);
});

test("get returns copies: callers may change variables freely", async () => {
  const { registry } = setup({ preloader: { queryID: "11111111111111111", variables: { a: { b: 1 } }, preloaderID: "p" } });
  const first = await registry.get(OP);
  first.variables.a.b = 2;
  assert.equal((await registry.get(OP)).variables.a.b, 1);
});

test("invalidate skips that id and falls through to the next tier; the cache entry is dropped", async () => {
  const stored = { [OP]: { docId: "33333333333333333", variables: null, seenAt: 1_800_000_000_000, source: "probe" } };
  const { registry, platform } = setup({ stored, probe: "44444444444444444" });
  assert.equal((await registry.get(OP)).docId, "33333333333333333");
  await registry.invalidate(OP, "33333333333333333");
  const next = await registry.get(OP);
  assert.equal(next.docId, "44444444444444444");
  assert.equal(next.source, "probe");
  await flush();
  assert.equal((await platform.storage.get(OPS_STORAGE_KEY))[OP].docId, "44444444444444444", "the probed id replaced the bad one");
  await registry.invalidate(OP, "44444444444444444");
  assert.equal((await registry.get(OP)).source, "fallback");
  await registry.invalidate(OP, FALLBACK_DOC_IDS[OP]);
  assert.equal(await registry.get(OP), null);
  assert.deepEqual(registry.snapshot().resolved[OP], null);
});

test("probed and learned ids are persisted with a timestamp and the deploy revision", async () => {
  let t = 1_800_000_000_000;
  const { registry, platform, probes } = setup({ probe: "44444444444444444", now: () => t });
  await registry.get(OP);
  await registry.get(OP);
  assert.equal(probes.length, 1, "the MAIN world is asked once per operation per page");
  assert.equal(probes[0].name, OP);
  await flush();
  assert.deepEqual((await platform.storage.get(OPS_STORAGE_KEY))[OP], { docId: "44444444444444444", variables: null, seenAt: t, source: "probe", rev: 1051133768 });

  t += 1000;
  await registry.learn("useCometUFICreateCommentMutation", "55555555555555555", { groupID: null }, "background");
  const stored = await platform.storage.get(OPS_STORAGE_KEY);
  assert.deepEqual(stored.useCometUFICreateCommentMutation, { docId: "55555555555555555", variables: { groupID: null }, seenAt: t, source: "background", rev: 1051133768 });
  assert.equal(stored[OP].docId, "44444444444444444");
});

test("ids the background learned are copied into the persisted cache once", async () => {
  const learned = { [OP]: { docId: "22222222222222222", variables: { v: 1 }, seenAt: 1_799_999_990_000, rev: "1051133768" } };
  const { registry, platform } = setup({ learned });
  const writes = [];
  const set = platform.storage.set;
  platform.storage.set = (key, value) => (writes.push(structuredClone(value)), set(key, value));
  const op = await registry.get(OP);
  assert.equal(op.fresh, true, "revision recorded by the background matches the page");
  await flush();
  await registry.get(OP);
  await flush();
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0][OP], { docId: "22222222222222222", variables: { v: 1 }, seenAt: 1_799_999_990_000, source: "background", rev: "1051133768" });
});

test("a persisted cache survives into a new page; entries older than 30 days are ignored", async () => {
  const now = 1_800_000_000_000;
  const stored = {
    [OP]: { docId: "33333333333333333", variables: null, seenAt: now - 29 * DAY, rev: 1051133768 },
    useCometUFICreateCommentMutation: { docId: "66666666666666666", variables: null, seenAt: now - 31 * DAY },
    Broken: { docId: "not-a-doc-id", seenAt: now },
  };
  const { registry } = setup({ stored });
  const op = await registry.get(OP);
  assert.equal(op.source, "cache");
  assert.equal(op.fresh, true, "same deploy revision as the page");
  assert.equal((await registry.get("useCometUFICreateCommentMutation")).source, "fallback");
  assert.equal(await registry.get("Broken"), null);
});

test("a stored \"__proto__\" entry (page-writable storage) cannot replace the cache's prototype", async () => {
  const now = 1_800_000_000_000;
  const stored = JSON.parse(`{"__proto__": {"docId": "77777777777777777", "seenAt": ${now}}}`);
  const { registry, platform } = setup({ stored });
  assert.equal((await registry.get(OP)).source, "fallback", "nothing is inherited from the stored entry");
  assert.equal(await registry.get("docId"), null);
  await registry.learn(OP, "44444444444444444", null);
  assert.equal(Object.getPrototypeOf(await platform.storage.get(OPS_STORAGE_KEY)), Object.prototype);
});

test("learn() and the background compete by recency; learning an id un-invalidates it", async () => {
  let t = 1_800_000_000_000;
  const learned = { [OP]: { docId: "22222222222222222", variables: null, seenAt: t - 5000 } };
  const { registry } = setup({ learned, now: () => t });
  assert.equal((await registry.get(OP)).docId, "22222222222222222");
  await registry.learn(OP, "77777777777777777", { v: 1 });
  assert.deepEqual(await registry.get(OP), { docId: "77777777777777777", variables: { v: 1 }, source: "learned", fresh: true });
  await registry.invalidate(OP, "77777777777777777");
  assert.equal((await registry.get(OP)).docId, "22222222222222222");
  await registry.learn(OP, "77777777777777777", null);
  assert.equal((await registry.get(OP)).docId, "77777777777777777");
  await registry.learn(OP, "abc", null);
  assert.equal((await registry.get(OP)).docId, "77777777777777777", "invalid ids are not learned");
});

test("background-learned ops are re-read at most every 15 s", async () => {
  let t = 1_800_000_000_000;
  const s = setup({ now: () => t });
  await s.registry.get(OP);
  await s.registry.get(OP);
  assert.equal(s.learnedCalls(), 1);
  t += 16e3;
  await s.registry.get(OP);
  assert.equal(s.learnedCalls(), 2);
});

test("a failing background or storage never breaks get()", async () => {
  const harvest = fakeHarvest();
  const platform = basePlatform({
    learnedOps: async () => {
      throw new Error("no background");
    },
    storage: { get: async () => Promise.reject(new Error("quota")), set: async () => Promise.reject(new Error("quota")), onChange() {} },
  });
  const registry = createOpRegistry({ platform, harvest });
  assert.equal((await registry.get(OP)).source, "fallback");
  await registry.learn(OP, "88888888888888888", null);
  assert.equal((await registry.get(OP)).docId, "88888888888888888");
});

test("snapshot names sources per operation", async () => {
  const { registry } = setup({ preloader: { queryID: "11111111111111111", variables: {}, preloaderID: "p" } });
  await registry.get(OP);
  await registry.get("CometModernHomeFeedQuery");
  const snap = registry.snapshot();
  assert.deepEqual(snap.resolved[OP], { source: "preloader", docId: "11111111111111111" });
  assert.equal(snap.resolved.CometModernHomeFeedQuery.source, "fallback");
  assert.deepEqual(snap.preloaders, [OP]);
  assert.equal(snap.probe, false);
});

test("isDocError: stale doc always; field_exception only for ids that may predate this deploy", () => {
  const stale = new GqlError("x", { code: 1570245, kind: "stale-doc" });
  const field = new GqlError("x", { code: 1357010, kind: "field" });
  assert.equal(isDocError(stale, { fresh: true }), true);
  assert.equal(isDocError(field, { fresh: false }), true);
  assert.equal(isDocError(field, { fresh: true }), false);
  assert.equal(isDocError(new GqlError("x", { kind: "network" }), { fresh: false }), false);
});

test("runOp: a stale doc_id is invalidated and the request retried once with the next candidate", async () => {
  const ops = fakeOps({ Op: [{ docId: "1", variables: { v: "a" }, source: "cache", fresh: false }, { docId: "2", variables: { v: "b" }, source: "fallback", fresh: false }] });
  const client = fakeClient((name, docId) => {
    if (docId === "1") throw new GqlError("unknown doc", { code: 1570245, kind: "stale-doc" });
    return { data: { ok: docId } };
  });
  const res = await runOp({ client, ops }, "Op", (op) => ({ v: op.variables.v }));
  assert.deepEqual(res.data, { ok: "2" });
  assert.deepEqual(ops.invalidated, [{ name: "Op", docId: "1" }]);
  assert.deepEqual(client.calls.map((c) => [c.docId, c.variables.v]), [["1", "a"], ["2", "b"]]);
});

test("runOp: only one retry, no retry for other errors, null when nothing is known", async () => {
  const always = () => {
    throw new GqlError("unknown doc", { code: 1570245, kind: "stale-doc" });
  };
  const ops = fakeOps({ Op: [{ docId: "1", fresh: false }, { docId: "2", fresh: false }, { docId: "3", fresh: false }] });
  const client = fakeClient(always);
  await assert.rejects(runOp({ client, ops }, "Op", () => ({})), { kind: "stale-doc" });
  assert.equal(client.calls.length, 2);

  const lone = fakeOps({ Op: [{ docId: "1", fresh: false }] });
  const c2 = fakeClient(always);
  await assert.rejects(runOp({ client: c2, ops: lone }, "Op", () => ({})), { kind: "stale-doc" });
  assert.equal(c2.calls.length, 1, "no alternative id: the original error surfaces");

  const fresh = fakeOps({ Op: [{ docId: "1", fresh: true }, { docId: "2", fresh: false }] });
  const c3 = fakeClient(() => {
    throw new GqlError("bad group", { code: 1357010, kind: "field" });
  });
  await assert.rejects(runOp({ client: c3, ops: fresh }, "Op", () => ({})), { kind: "field" });
  assert.equal(c3.calls.length, 1);
  assert.deepEqual(fresh.invalidated, []);

  assert.equal(await runOp({ client: c3, ops: fakeOps({}) }, "Op", () => ({})), null);
});

test("runOp: a retry that fails the same way invalidates that id too, so no id is sent twice", async () => {
  const ops = fakeOps({ Op: [{ docId: "1", fresh: false }, { docId: "2", fresh: false }, { docId: "3", fresh: false }] });
  const client = fakeClient((name, docId) => {
    if (docId !== "3") throw new GqlError("unknown doc", { code: 1570245, kind: "stale-doc" });
    return { data: { ok: docId } };
  });
  await assert.rejects(runOp({ client, ops }, "Op", () => ({})), { kind: "stale-doc" });
  assert.deepEqual(ops.invalidated, [{ name: "Op", docId: "1" }, { name: "Op", docId: "2" }]);
  assert.deepEqual((await runOp({ client, ops }, "Op", () => ({}))).data, { ok: "3" });
  assert.deepEqual(client.calls.map((c) => c.docId), ["1", "2", "3"]);
});

test("runOp + registry: every stale tier is tried once across calls", async () => {
  const stale = () => {
    throw new GqlError("unknown doc", { code: 1570245, kind: "stale-doc" });
  };
  const { registry } = setup({
    preloader: { queryID: "11111111111111111", variables: null, preloaderID: "p" },
    stored: { [OP]: { docId: "33333333333333333", variables: null, seenAt: 1_800_000_000_000, source: "learned" } },
    probe: "44444444444444444",
  });
  const client = fakeClient(stale);
  for (let i = 0; i < 3; i++) await runOp({ client, ops: registry }, OP, () => ({})).catch(() => {});
  assert.deepEqual(client.calls.map((c) => c.docId), ["11111111111111111", "33333333333333333", "44444444444444444", FALLBACK_DOC_IDS[OP]]);
  assert.equal(await runOp({ client, ops: registry }, OP, () => ({})), null, "nothing left to try");
});
