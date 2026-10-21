import test from "node:test";
import assert from "node:assert/strict";
import { feedSource as mod, harvest as harvestMod, gql, ops as opsMod } from "./fixtures/load.mjs";
import { basePlatform } from "../../../src/shared/platform.js";
import { codec, createClassifier, extractStory } from "./fixtures/stubs.mjs";
import { fakeClient, fakeHarvest, fakeOps, fixture, fixtureJson } from "./fixtures/helpers.mjs";

const { FEED_STYLES, createFeedSource, feedVariables } = mod;
const { GqlError } = gql;

const FEED = "CometModernHomeFeedQuery";
const HOME = fixtureJson("sjs-home-friends-2026-10.json");
const TEMPLATE = { feedStyle: "DEFAULT", orderby: ["TOP_STORIES"], refreshMode: "WARM", scale: 1, feedInitialFetchSize: 4, __relay_internal__pv__Xrelayprovider: true };

const edge = (postId, time, extra = {}) => ({ node: { __typename: "Story", id: `S:${postId}`, post_id: String(postId), creation_time: time, ...extra }, cursor: `c${postId}` });
const page = (edges, endCursor, hasNext = true) => ({ data: { viewer: { news_feed: { edges, page_info: { end_cursor: endCursor, has_next_page: hasNext } } } }, errors: [] });

function homeHarvest() {
  const h = harvestMod.createHarvest();
  for (const block of HOME.sjs) harvestMod.parseSjs(structuredClone(block), h);
  return h;
}

function source(name, { harvest = fakeHarvest(), pages = [], ops, ...opts } = {}) {
  const client = fakeClient((op, docId, variables, i) => {
    const p = pages[i];
    if (p instanceof Error) throw p;
    return p ?? page([], null, false);
  });
  const registry = ops ?? fakeOps({ [FEED]: [{ docId: "28136951115834703", variables: TEMPLATE, source: "preloader", fresh: true }] });
  const src = createFeedSource({ name, client, ops: registry, harvest, classifier: createClassifier(), extract: extractStory, codec, ...opts });
  return { src, client, registry };
}

test("FEED_STYLES are the Feeds-tab filters", () => {
  assert.deepEqual(FEED_STYLES, {
    friends: "MOST_RECENT_FRIENDS_FEED",
    groups: "MOST_RECENT_GROUPS_FEED",
    pages: "MOST_RECENT_PAGES_FEED",
    favorites: "FAVORITES_FEED",
    all: "MOST_RECENT_FEED_DEFAULT",
    top: "DEFAULT",
  });
  assert.throws(() => source("nope"), /unknown feed source/);
});

test("feedVariables overrides only feedStyle, orderby, feedEndCursor, refreshMode and scale", () => {
  const v = feedVariables(TEMPLATE, { feedStyle: "MOST_RECENT_GROUPS_FEED", orderby: ["MOST_RECENT"], cursor: "CUR" });
  assert.deepEqual(v, { ...TEMPLATE, feedStyle: "MOST_RECENT_GROUPS_FEED", orderby: ["MOST_RECENT"], feedEndCursor: "CUR", refreshMode: "COLD_START", scale: 2 });
  assert.equal(feedVariables({ scale: 3 }, { cursor: null }).scale, 3);
  assert.equal(feedVariables({ scale: 1 }, { scale: 2.5 }).scale, 2.5);
  assert.equal(feedVariables({}, {}).feedEndCursor, null);
  assert.equal(TEMPLATE.scale, 1, "the template is not modified");
});

test("page 1 comes from the SSR payload with zero requests, page 2 continues from its cursor", async () => {
  const harvest = homeHarvest();
  const ops = opsMod.createOpRegistry({ platform: basePlatform(), harvest });
  const { src, client } = source("friends", { harvest, ops, pages: [page([edge(9, 100)], "C2")] });
  const first = await src.next();
  assert.equal(client.calls.length, 0);
  assert.deepEqual(first.stories.map((s) => s.postId), ["607074701", "238212940"]);
  assert.deepEqual(first.stories[0].sources, ["friends"]);
  assert.deepEqual(first.dropped, {});
  assert.equal(src.done, false);

  const second = await src.next();
  assert.equal(client.calls.length, 1);
  const [call] = client.calls;
  assert.equal(call.name, FEED);
  const pre = harvest.preloaders.get(FEED);
  assert.equal(call.docId, pre.queryID);
  assert.deepEqual(call.variables, { ...pre.variables, feedStyle: "MOST_RECENT_FRIENDS_FEED", orderby: ["MOST_RECENT"], feedEndCursor: "Q1VSU09SLXNzci0x", refreshMode: "COLD_START", scale: 2 });
  assert.deepEqual(second.stories.map((s) => s.postId), ["9"]);
});

test("a source whose filter differs from the preloader's starts from the network at cursor null", async () => {
  const harvest = homeHarvest();
  const { src, client } = source("groups", { harvest, pages: [page([edge(1, 50)], "G2")] });
  const res = await src.next();
  assert.deepEqual(res.stories.map((s) => s.postId), ["1"]);
  assert.equal(client.calls[0].variables.feedStyle, "MOST_RECENT_GROUPS_FEED");
  assert.equal(client.calls[0].variables.feedEndCursor, null);
});

test("Top News asks for TOP_STORIES on the DEFAULT feed", async () => {
  const { src, client } = source("top", { pages: [page([edge(1, 50)], "T2")] });
  await src.next();
  assert.equal(client.calls[0].variables.feedStyle, "DEFAULT");
  assert.deepEqual(client.calls[0].variables.orderby, ["TOP_STORIES"]);
});

test("the SSR page is used only when its preloader payloads exist", async () => {
  const harvest = homeHarvest();
  harvest.prefetched.clear();
  const { src, client } = source("friends", { harvest, pages: [page([edge(1, 50)], "C")] });
  await src.next();
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].docId, "28136951115834703");
});

test("an SSR stream cut before page_info is followed by a network page 1", async () => {
  const harvest = homeHarvest();
  const id = harvest.preloaders.get(FEED).preloaderID;
  harvest.prefetched.set(id, harvest.prefetched.get(id).slice(0, 2));
  const { src, client } = source("friends", { harvest, pages: [page([edge(607074701, 663965125)], "N2")] });
  assert.equal((await src.next()).stories.length, 2);
  assert.equal(src.done, false);
  await src.next();
  assert.equal(client.calls[0].variables.feedEndCursor, null);
});

test("obfuscated typenames in SSR payloads are restored before classification", async () => {
  const harvest = homeHarvest();
  const id = harvest.preloaders.get(FEED).preloaderID;
  const payloads = harvest.prefetched.get(id);
  payloads[0].data.viewer.news_feed.edges[0].node.__typename = "Zq8Wn3Lx0Pd4Rt7";
  harvest.env.typenamePairs = [["Zq8Wn3Lx0Pd4Rt7", "Story"]];
  const { src } = source("friends", { harvest });
  assert.equal((await src.next()).stories.length, 2);
});

test("classifier drops are counted by reason; holes and unparseable stories too", async () => {
  const sponsored = edge(2, 90, { th_dat_spo: { __typename: "SponsoredData" } });
  const pymk = { node: { __typename: "PaginatedPeopleYouMayKnowFeedUnit", id: "p" }, cursor: "x" };
  const unparseable = { node: { __typename: "Story" }, cursor: "y" };
  const keyedByEdge = { node: { __typename: "Story", creation_time: 5 }, deduplication_key: "777", cursor: "k" };
  const edges = [edge(1, 100), sponsored, pymk, undefined, unparseable, { cursor: "z" }, keyedByEdge];
  const { src } = source("friends", { pages: [page(edges, "C2")] });
  const res = await src.next();
  assert.deepEqual(res.stories.map((s) => s.key), ["1", "777"], "the edge's deduplication_key is the last-resort key");
  assert.deepEqual(res.dropped, { "sponsored-data": 1, "unit:PaginatedPeopleYouMayKnowFeedUnit": 1, "no-node": 2, unparsed: 1 });
});

test("a real JSON-lines page (stream + defer) goes through the same path", async () => {
  const response = { data: codec.stitch(codec.parseLines(fixture("reassembly-vector.jsonl"))).data, errors: [] };
  const { src } = source("friends", { pages: [response] });
  const res = await src.next();
  assert.deepEqual(res.stories.map((s) => s.postId), ["1001"]);
  assert.deepEqual(res.dropped, { "sponsored-data": 1, "unit:PaginatedPeopleYouMayKnowFeedUnit": 1 });
});

test("stops when has_next_page is false", async () => {
  const { src, client } = source("pages", { pages: [page([edge(1, 5)], "C2", false)] });
  await src.next();
  assert.equal(src.done, true);
  assert.deepEqual(await src.next(), { stories: [], dropped: {} });
  assert.equal(client.calls.length, 1);
});

test("stops on a missing cursor", async () => {
  const { src } = source("pages", { pages: [page([edge(1, 5)], null, true)] });
  await src.next();
  assert.equal(src.done, true);
});

test("stops when Facebook repeats a cursor (feed did not advance)", async () => {
  const { src, client } = source("pages", { pages: [page([edge(1, 5)], "SAME"), page([edge(2, 4)], "SAME"), page([edge(3, 3)], "NEXT")] });
  await src.next();
  assert.equal(src.done, false);
  const second = await src.next();
  assert.deepEqual(second.stories.map((s) => s.postId), ["2"]);
  assert.equal(src.done, true);
  assert.equal(client.calls[1].variables.feedEndCursor, "SAME");
  await src.next();
  assert.equal(client.calls.length, 2);
});

test("stops after three pages in a row without edges", async () => {
  const { src, client } = source("pages", { pages: [page([], "A"), page([], "B"), page([], "C"), page([edge(1, 1)], "D")] });
  for (let i = 0; i < 3; i++) await src.next();
  assert.equal(src.done, true);
  assert.equal(client.calls.length, 3);
});

test("reset starts the connection over, SSR page included", async () => {
  const harvest = homeHarvest();
  const { src, client } = source("friends", { harvest, pages: [page([edge(9, 1)], "C2", false)] });
  await src.next();
  await src.next();
  assert.equal(src.done, true);
  src.reset();
  assert.equal(src.done, false);
  const again = await src.next();
  assert.equal(again.stories.length, 2);
  assert.equal(client.calls.length, 1, "SSR page again, no request");
});

test("errors propagate; without a variables template there is nothing to replay", async () => {
  const boom = new GqlError("x", { kind: "network" });
  const { src } = source("friends", { pages: [boom] });
  await assert.rejects(src.next(), { kind: "network" });
  assert.equal(src.done, false, "a transient error leaves the source resumable");

  const fallbackOnly = fakeOps({ [FEED]: [{ docId: "28136951115834703", variables: null, source: "fallback", fresh: false }] });
  const s2 = source("friends", { ops: fallbackOnly });
  await assert.rejects(s2.src.next(), { kind: "variables" });
  assert.equal(s2.client.calls.length, 0);

  const s3 = source("friends", { ops: fakeOps({}) });
  await assert.rejects(s3.src.next(), { kind: "stale-doc" });
});

test("a stale doc_id is replaced through the registry and the page retried", async () => {
  const registry = fakeOps({
    [FEED]: [
      { docId: "1111111111", variables: TEMPLATE, source: "cache", fresh: false },
      { docId: "2222222222", variables: { ...TEMPLATE, fresh: true }, source: "probe", fresh: true },
    ],
  });
  const stale = new GqlError("unknown persisted query", { code: 1570245, kind: "stale-doc" });
  const { src, client } = source("friends", { ops: registry, pages: [stale, page([edge(1, 5)], "C2")] });
  const res = await src.next();
  assert.deepEqual(res.stories.map((s) => s.postId), ["1"]);
  assert.deepEqual(client.calls.map((c) => c.docId), ["1111111111", "2222222222"]);
  assert.equal(client.calls[1].variables.fresh, true, "variables are rebuilt from the new candidate");
  assert.deepEqual(registry.invalidated, [{ name: FEED, docId: "1111111111" }]);
});

test("next() waits for the harvest's DOMContentLoaded sweep", async () => {
  let ready;
  const harvest = homeHarvest();
  harvest.ready = new Promise((r) => (ready = r));
  const { src } = source("friends", { harvest });
  let settled = false;
  const pending = src.next().then((r) => ((settled = true), r));
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(settled, false);
  ready();
  assert.equal((await pending).stories.length, 2);
});

test("a news_feed nulled by an error fails the page instead of ending the feed", async () => {
  const nulled = { data: { viewer: { news_feed: null } }, errors: [{ message: "A server error occurred", code: 1675030, severity: "CRITICAL", path: ["viewer", "news_feed"] }] };
  const { src, client } = source("friends", { pages: [nulled, { data: { viewer: null }, errors: [] }, page([edge(1, 5)], "C2")] });
  await assert.rejects(src.next(), { kind: "server", code: 1675030 });
  assert.equal(src.done, false);
  await assert.rejects(src.next(), { kind: "server", message: "response without news_feed" });
  assert.deepEqual((await src.next()).stories.map((s) => s.postId), ["1"]);
  assert.deepEqual(client.calls.map((c) => c.variables.feedEndCursor), [null, null, null], "the failed page is asked for again");
  assert.equal(src.done, false);
});

test("overlapping next() calls read consecutive pages, one at a time", async () => {
  const pages = [page([edge(1, 50)], "C1"), page([edge(2, 40)], "C2")];
  const client = fakeClient(async (op, docId, variables, i) => {
    await new Promise((r) => setTimeout(r, 5));
    return pages[i];
  });
  const ops = fakeOps({ [FEED]: [{ docId: "28136951115834703", variables: TEMPLATE, source: "preloader", fresh: true }] });
  const src = createFeedSource({ name: "friends", client, ops, harvest: fakeHarvest(), classifier: createClassifier(), extract: extractStory, codec });
  const [a, b] = await Promise.all([src.next(), src.next()]);
  assert.deepEqual([...a.stories, ...b.stories].map((s) => s.postId), ["1", "2"]);
  assert.deepEqual(client.calls.map((c) => c.variables.feedEndCursor), [null, "C1"]);
  assert.equal(src.done, false, "not mistaken for a repeated cursor");
});

test("reset() during a request: the late page does not move the new connection's cursor", async () => {
  let release;
  const pages = [page([edge(1, 50)], "OLD2"), page([edge(1, 50)], "NEW2")];
  const client = fakeClient(async (op, docId, variables, i) => {
    if (i === 0) await new Promise((r) => (release = r));
    return pages[i];
  });
  const ops = fakeOps({ [FEED]: [{ docId: "28136951115834703", variables: TEMPLATE, source: "preloader", fresh: true }] });
  const src = createFeedSource({ name: "friends", client, ops, harvest: fakeHarvest(), classifier: createClassifier(), extract: extractStory, codec });
  const late = src.next();
  await new Promise((r) => setTimeout(r, 5));
  src.reset();
  release();
  await late;
  await src.next();
  assert.deepEqual(client.calls.map((c) => c.variables.feedEndCursor), [null, null], "the new connection starts at page 1");
});

test("the SSR page is skipped when the preloader's orderby makes it another connection", async () => {
  const harvest = homeHarvest();
  const pre = harvest.preloaders.get(FEED);
  pre.variables = { ...pre.variables, feedStyle: "FAVORITES_FEED", orderby: [] }; // legacy /?sk=favorites
  const { src, client } = source("favorites", { harvest, pages: [page([edge(1, 50)], "F2")] });
  assert.deepEqual((await src.next()).stories.map((s) => s.postId), ["1"]);
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].variables.feedEndCursor, null);
  assert.deepEqual(client.calls[0].variables.orderby, ["MOST_RECENT"]);
});
