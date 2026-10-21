// data-net modules wired together as main.js will: SSR harvest -> op registry -> paced GraphQL client ->
// feed sources -> watermark merge, and an action through the same queue. WP-A collaborators are local stubs.

import test from "node:test";
import assert from "node:assert/strict";
import { actions as actionsMod, feedSource, gql, harvest as harvestMod, merge, ops } from "./fixtures/load.mjs";
import { codec, createClassifier, extractComment, extractStory } from "./fixtures/stubs.mjs";
import { fakeFetch, fixture, fixtureJson, jsonl, response } from "./fixtures/helpers.mjs";
import { basePlatform } from "../../../src/shared/platform.js";

const HOME = fixtureJson("sjs-home-friends-2026-10.json");
const STREAM = "CometNewsFeed_viewerConnection$stream$CometNewsFeed_viewer_news_feed";
const PAGE_INFO = "CometNewsFeed_viewerConnection$defer$CometNewsFeed_viewer_news_feed$page_info";

/** A JSON-lines feed page as Facebook streams it: first edge in the root, the rest as @stream lines, then page_info. */
function feedPage(edges, endCursor, hasNext) {
  const [first, ...rest] = edges;
  return jsonl(
    { data: { viewer: { news_feed: { edges: first ? [first] : [] } } }, extensions: { is_final: false } },
    ...rest.map((e, i) => ({ label: STREAM, path: ["viewer", "news_feed", "edges", i + 1], data: e, extensions: { is_final: false } })),
    { label: PAGE_INFO, path: ["viewer", "news_feed"], data: { page_info: { __typename: "PageInfo", end_cursor: endCursor, has_next_page: hasNext } }, extensions: { is_final: true } },
  );
}
const edge = (postId, time, extra = {}) => ({ cursor: `c${postId}`, node: { __typename: "Story", id: `S${postId}`, post_id: String(postId), creation_time: time, feedback: { id: `F${postId}` }, ...extra } });

test("SSR page 1 + paced network pages merge into one chronological, ad-free feed", async () => {
  const harvest = harvestMod.createHarvest();
  for (const block of HOME.sjs) harvestMod.parseSjs(structuredClone(block), harvest);
  harvest.tokens.dtsg = "NAcPipeline:1:1";
  harvest.tokens.userId = "100000000000001";

  const pages = {
    "MOST_RECENT_FRIENDS_FEED Q1VSU09SLXNzci0x": feedPage([edge(11, 400000000)], null, false),
    "MOST_RECENT_GROUPS_FEED null": feedPage([edge(21, 700000000), edge(22, 600000000, { th_dat_spo: { __typename: "SponsoredData" } }), edge(238212940, 406433511)], "G2", true),
    "MOST_RECENT_GROUPS_FEED G2": feedPage([edge(23, 300000000)], "G3", false),
  };
  const net = fakeFetch((call) => response(pages[`${call.variables.feedStyle} ${call.variables.feedEndCursor}`] ?? feedPage([], null, false)));
  const platform = basePlatform({ fetch: net.fetch });
  const registry = ops.createOpRegistry({ platform, harvest });
  const client = gql.createGqlClient({ platform, harvest, minGapMs: 0, codec, visibility: { hidden: () => false, wait: async () => {} } });
  const classifier = createClassifier();
  const sources = ["friends", "groups"].map((name) => feedSource.createFeedSource({ name, client, ops: registry, harvest, classifier, extract: extractStory, codec }));
  const feed = merge.createMergedFeed({ sources, pageSize: 3 });

  const first = await feed.more();
  assert.deepEqual(first.map((s) => s.postId), ["21", "607074701", "238212940"]);
  const rest = await feed.more();
  assert.deepEqual(rest.map((s) => s.postId), ["11", "23"]);
  assert.equal(feed.exhausted, true);

  const shared = first[2];
  assert.deepEqual(shared.sources, ["friends", "groups"], "seen in both feeds, shown once");
  assert.equal(feed.stats().hidden["sponsored-data"], 1);
  assert.equal(net.calls.length, 3, "friends page 1 came from the SSR payload");
  for (const call of net.calls) {
    assert.equal(call.form.get("doc_id"), "28136951115834703");
    assert.equal(call.headers["x-fb-friendly-name"], "CometModernHomeFeedQuery");
    assert.equal(call.variables.refreshMode, "COLD_START");
    assert.equal(call.variables.scale, 2);
  }
  assert.equal(net.maxInFlight, 1);

  const actions = actionsMod.createActions({ client, ops: registry, harvest, extractComment });
  net.calls.length = 0;
  const liked = await actions.react(first[0], actionsMod.REACTIONS.LIKE);
  assert.equal(liked.ok, true);
  assert.equal(net.calls[0].form.get("fb_api_req_friendly_name"), "CometUFIFeedbackReactMutation");
  assert.equal(net.calls[0].variables.input.feedback_id, "F21");
  assert.equal(net.calls[0].variables.input.actor_id, "100000000000001");
});

test("default collaborators: WP-A's decoder, classifier and extractor (or stand-ins while missing)", async () => {
  const harvest = harvestMod.createHarvest();
  Object.assign(harvest.tokens, { dtsg: "NAcDefaults:1:1", userId: "100000000000001" });
  const net = fakeFetch(() => response(fixture("reassembly-vector.jsonl")));
  const platform = basePlatform({ fetch: net.fetch });
  const client = gql.createGqlClient({ platform, harvest, minGapMs: 0, visibility: { hidden: () => false, wait: async () => {} } });
  const registry = ops.createOpRegistry({ platform, harvest });
  await registry.learn("CometModernHomeFeedQuery", "28136951115834703", { feedStyle: "DEFAULT", scale: 1 });
  const src = feedSource.createFeedSource({ name: "friends", client, ops: registry, harvest });
  const page = await src.next();
  assert.deepEqual(page.stories.map((s) => s.postId), ["1001"]);
  assert.deepEqual(page.stories[0].sources, ["friends"]);
  assert.equal(page.dropped["sponsored-data"], 1);
  assert.equal(page.dropped["unit:PaginatedPeopleYouMayKnowFeedUnit"], 1);
  assert.equal(src.done, false);
});
