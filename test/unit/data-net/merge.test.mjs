import test from "node:test";
import assert from "node:assert/strict";
import { merge, gql } from "./fixtures/load.mjs";
import { matchesKeywords } from "./fixtures/stubs.mjs";
import { prng } from "./fixtures/helpers.mjs";

const { createMergedFeed } = merge;
const { GqlError } = gql;

const story = (key, time, source, text = "") => ({ key, time, sources: [source], text });

/** A FeedSource double serving fixed pages; entries may be Errors to throw once. */
function listSource(name, pages, { dropped = {} } = {}) {
  const queue = [...pages];
  const src = {
    name,
    done: queue.length === 0,
    calls: 0,
    async next() {
      src.calls++;
      const p = queue.shift();
      src.done = queue.length === 0;
      if (p instanceof Error) {
        src.done = false;
        throw p;
      }
      return { stories: p.map(([key, time, text]) => story(key, time, name, text)), dropped };
    },
  };
  return src;
}

async function drainAll(feed, limit = 1000) {
  const out = [];
  for (let i = 0; i < limit && !feed.exhausted; i++) out.push(...(await feed.more()));
  assert.equal(feed.exhausted, true, "feed must finish");
  return out;
}

test("watermark: emits only what no unfinished source can beat, fetching the source that holds it back", async () => {
  const order = [];
  const a = listSource("friends", [[["a100", 100], ["a90", 90]], [["a50", 50]]]);
  const b = listSource("groups", [[["b95", 95]], [["b40", 40]]]);
  for (const s of [a, b]) {
    const next = s.next;
    s.next = () => (order.push(s.name), next());
  }
  const feed = createMergedFeed({ sources: [a, b], pageSize: 3 });
  const first = await feed.more();
  assert.deepEqual(first.map((s) => s.key), ["a100", "b95", "a90"]);
  assert.deepEqual(order, ["friends", "groups", "groups"], "B held the watermark (95 > 90) after page 1");
  const rest = await feed.more();
  assert.deepEqual(rest.map((s) => s.key), ["a50", "b40"]);
  assert.equal(feed.exhausted, true);
});

test("nothing is shown before every source has answered once", async () => {
  const a = listSource("friends", [[["a1", 10]], [["a2", 5]]]);
  const b = listSource("groups", [[["b1", 20]], [["b2", 1]]]);
  const feed = createMergedFeed({ sources: [a, b], pageSize: 1 });
  assert.deepEqual((await feed.more()).map((s) => s.key), ["b1"]);
  assert.equal(a.calls, 1);
  assert.equal(b.calls, 1);
});

test("duplicates are dropped and their sources united on the first copy", async () => {
  const a = listSource("friends", [[["p1", 30], ["p2", 20]]]);
  const b = listSource("groups", [[["p2", 20], ["p3", 10]]]);
  const c = listSource("favorites", [[["p1", 30]]]);
  const feed = createMergedFeed({ sources: [a, b, c], pageSize: 10 });
  const out = await drainAll(feed);
  assert.deepEqual(out.map((s) => s.key), ["p1", "p2", "p3"]);
  assert.deepEqual(out[0].sources, ["friends", "favorites"]);
  assert.deepEqual(out[1].sources, ["friends", "groups"]);
  assert.equal(feed.stats().duplicates, 2);
});

test("a single source keeps its own order (Top News is ranked)", async () => {
  const top = listSource("top", [[["x", 5], ["y", 9]], [["z", 1], ["w", 7]]]);
  const feed = createMergedFeed({ sources: [top], pageSize: 3 });
  assert.deepEqual((await feed.more()).map((s) => s.key), ["x", "y", "z"]);
  assert.deepEqual((await feed.more()).map((s) => s.key), ["w"]);
});

test("keywords hide matching stories and are counted", async () => {
  const a = listSource("friends", [[["a", 3, "Buy CRYPTO now"], ["b", 2, "hello"], ["c", 1, "crypto tips"]]]);
  const feed = createMergedFeed({ sources: [a], pageSize: 10, keywords: ["crypto"], matches: matchesKeywords });
  assert.deepEqual((await drainAll(feed)).map((s) => s.key), ["b"]);
  assert.equal(feed.stats().hidden.keyword, 2);
});

test("stories without a time stay next to their neighbours from the same source", async () => {
  const a = listSource("friends", [[["a1", 100], ["a-null", null], ["a2", 50]]]);
  const b = listSource("groups", [[["b1", 80], ["b2", 60]]]);
  const out = await drainAll(createMergedFeed({ sources: [a, b], pageSize: 10 }));
  assert.deepEqual(out.map((s) => s.key), ["a1", "a-null", "b1", "b2", "a2"]);
});

test("a source that is not perfectly chronological loses nothing: late stories are shown late", async () => {
  const a = listSource("groups", [[["a1", 100], ["a2", 90]], [["bumped", 95], ["a3", 10]]]);
  const b = listSource("friends", [[["b1", 92]], [["b2", 5]]]);
  const out = await drainAll(createMergedFeed({ sources: [a, b], pageSize: 2 }));
  assert.deepEqual(out.map((s) => s.key).sort(), ["a1", "a2", "a3", "b1", "b2", "bumped"].sort());
  assert.deepEqual(out.slice(0, 2).map((s) => s.key), ["a1", "b1"]);
});

test("a transient error with nothing to show is thrown; the source is retried next time", async () => {
  const a = listSource("friends", [new GqlError("offline", { kind: "network" }), [["a1", 10]]]);
  const b = listSource("groups", [[["b1", 5]]]);
  const feed = createMergedFeed({ sources: [a, b], pageSize: 5 });
  await assert.rejects(feed.more(), { kind: "network" });
  assert.deepEqual((await drainAll(feed)).map((s) => s.key), ["a1", "b1"]);
});

test("a transient error after some stories returns them and keeps the rest for later", async () => {
  const a = listSource("friends", [[["a1", 100], ["a2", 10]], new GqlError("slow down", { kind: "rate" }), [["a3", 1]]]);
  const b = listSource("groups", [[["b1", 90]], [["b2", 5]]]);
  const feed = createMergedFeed({ sources: [a, b], pageSize: 10 });
  const first = await feed.more();
  assert.deepEqual(first.map((s) => s.key), ["a1", "b1", "a2"]);
  assert.equal(feed.exhausted, false);
  assert.deepEqual((await drainAll(feed)).map((s) => s.key), ["b2", "a3"]);
});

test("a source that cannot work (no variables, bad doc) is retired; the others go on", async () => {
  const a = listSource("friends", [new GqlError("no template", { kind: "variables" })]);
  const b = listSource("groups", [[["b1", 5]], [["b2", 4]]]);
  const feed = createMergedFeed({ sources: [a, b], pageSize: 10 });
  assert.deepEqual((await drainAll(feed)).map((s) => s.key), ["b1", "b2"]);
  assert.equal(feed.stats().sources.friends.failed, "variables");
});

test("when every source fails the error surfaces", async () => {
  const a = listSource("friends", [new GqlError("x", { kind: "stale-doc" })]);
  const b = listSource("groups", [new Error("bug")]);
  const feed = createMergedFeed({ sources: [a, b], pageSize: 10 });
  await assert.rejects(feed.more(), { kind: "stale-doc" });
  assert.equal(feed.exhausted, true);
});

test("checkpoint and auth errors are never swallowed", async () => {
  const a = listSource("friends", [new GqlError("halted", { kind: "checkpoint" })]);
  const b = listSource("groups", [[["b1", 5]]]);
  await assert.rejects(createMergedFeed({ sources: [a, b] }).more(), { kind: "checkpoint" });
});

test("ads-only pages cannot make one click fetch forever (maxFetches)", async () => {
  const pages = Array.from({ length: 20 }, () => []);
  const a = listSource("friends", pages, { dropped: { "sponsored-data": 2 } });
  const feed = createMergedFeed({ sources: [a], pageSize: 10, maxFetches: 4 });
  assert.deepEqual(await feed.more(), []);
  assert.equal(a.calls, 4);
  assert.equal(feed.exhausted, false);
  assert.equal(feed.stats().hidden["sponsored-data"], 8);
});

test("stats: per-source counters and hidden totals by reason", async () => {
  const a = listSource("friends", [[["a", 2]]], { dropped: { "sponsored-data": 1, "unit:ShowcaseFeedUnit": 2 } });
  const b = listSource("groups", [[["b", 1]]], { dropped: { "sponsored-data": 3 } });
  const feed = createMergedFeed({ sources: [a, b] });
  await drainAll(feed);
  const stats = feed.stats();
  assert.deepEqual(stats.hidden, { keyword: 0, "sponsored-data": 4, "unit:ShowcaseFeedUnit": 2 });
  assert.equal(stats.emitted, 2);
  assert.deepEqual(stats.sources.friends, { fetched: 1, kept: 1, buffered: 0, done: true, failed: null, dropped: { "sponsored-data": 1, "unit:ShowcaseFeedUnit": 2 } });
});

test("no sources: exhausted from the start", async () => {
  const feed = createMergedFeed({ sources: [] });
  assert.equal(feed.exhausted, true);
  assert.deepEqual(await feed.more(), []);
});

// Property: for any interleaving of time-sorted sources with overlapping posts, any page sizes and fetch
// budgets, the merged output is non-increasing in time, has no duplicates, and loses nothing.
test("property: random interleavings are merged in order, without duplicates or loss", async () => {
  for (let seed = 1; seed <= 300; seed++) {
    const rnd = prng(seed);
    const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
    const names = ["friends", "groups", "pages", "favorites", "all"].slice(0, int(1, 5));
    const posts = Array.from({ length: int(0, 60) }, (_, i) => ({ key: `p${i}`, time: int(1, 40) }));
    const membership = new Map(posts.map((p) => [p.key, new Set()]));
    const sources = names.map((name) => {
      const mine = posts.filter(() => rnd() < 0.45).sort((x, y) => y.time - x.time);
      for (const p of mine) membership.get(p.key).add(name);
      const pages = [];
      for (let i = 0; i < mine.length; ) {
        const size = int(0, 6);
        pages.push(mine.slice(i, i + size).map((p) => [p.key, p.time]));
        i += size;
      }
      return listSource(name, pages);
    });
    const feed = createMergedFeed({ sources, pageSize: int(1, 12), maxFetches: int(1, 8) });
    const out = await drainAll(feed);
    const ctx = `seed ${seed}`;
    for (let i = 1; i < out.length; i++) assert.ok(out[i - 1].time >= out[i].time, `${ctx}: non-increasing at ${i}`);
    const keys = out.map((s) => s.key);
    assert.equal(new Set(keys).size, keys.length, `${ctx}: no duplicates`);
    const expected = [...membership].filter(([, set]) => set.size).map(([k]) => k).sort();
    assert.deepEqual([...keys].sort(), expected, `${ctx}: no loss`);
    for (const s of out) assert.deepEqual([...s.sources].sort(), [...membership.get(s.key)].sort(), `${ctx}: sources of ${s.key}`);
  }
});

test("property: every emitted story was safe when emitted (nothing newer arrives later)", async () => {
  for (let seed = 1; seed <= 200; seed++) {
    const rnd = prng(seed * 7919);
    const sources = ["a", "b", "c"].map((name) => {
      let t = 1000;
      const pages = Array.from({ length: 1 + Math.floor(rnd() * 5) }, () =>
        Array.from({ length: Math.floor(rnd() * 4) }, () => [`${name}${(t -= 1 + Math.floor(rnd() * 50))}`, t]),
      );
      return listSource(name, pages);
    });
    const feed = createMergedFeed({ sources, pageSize: 1 + Math.floor(rnd() * 4) });
    let lastTime = Infinity;
    while (!feed.exhausted) {
      for (const s of await feed.more()) {
        assert.ok(s.time <= lastTime, `seed ${seed}: ${s.key} after a newer one`);
        lastTime = s.time;
      }
    }
  }
});
