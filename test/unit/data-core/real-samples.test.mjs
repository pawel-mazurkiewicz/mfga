// Real 2026-10 Facebook payloads (test/fixtures/gql/real/): HushFacebookWeb's MIT-licensed captures, scrubbed by
// their authors (ids, text and URLs replaced) and trimmed further for MFGA's research (tracking blobs, long
// lists). "<trimmed>" values and "<+N more trimmed>" list entries are removed before use. Their category hashes
// were scrubbed too, so every Story decodes as UNDECODABLE here.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseLines, stitch } from "../../../src/data/jsonl.js";
import { createClassifier } from "../../../src/data/classify.js";
import { extractStory } from "../../../src/data/extract.js";
import { REAL_DIR, readFixture, feedEdges, sjsPayloads, untrim } from "./helpers.mjs";

const { classify } = createClassifier();
const payloadsOf = (file) => parseLines(readFixture(file, REAL_DIR)).map(untrim);
const realEdges = (file) => feedEdges(stitch(payloadsOf(file)).data);

describe("CometNewsFeedPaginationQuery page (2026-10-10)", () => {
  const file = "feed-CometNewsFeedPaginationQuery-2026-10-10.trimmed.jsonl";

  test("stitches to two edges and a next page", () => {
    const { data, final } = stitch(payloadsOf(file));
    assert.equal(feedEdges(data).length, 2);
    assert.equal(data.viewer.news_feed.page_info.has_next_page, true);
    assert.equal(final, true);
  });

  test("edge 0: a suggested post (ranking data and a Follow button in the title)", async () => {
    const [edge] = realEdges(file);
    assert.deepEqual(await classify(edge), { keep: false, reason: "unconnected", category: "UNDECODABLE" });
    delete edge.node.comet_sections.context_layout.story.unconnected_waist_data;
    assert.equal((await classify(edge)).reason, "follow-suggestion");
  });

  test("edge 0 extracts every rendered field from the real shape", () => {
    const s = extractStory(realEdges(file)[0].node);
    assert.equal(s.key, "982521488");
    assert.equal(s.time, 698502477);
    assert.equal(s.url, "https://www.facebook.com/uxw6sdrx/posts/662700692");
    assert.deepEqual(s.actors, [{ id: "258788285", name: "Anchor bramble", url: "https://www.facebook.com/uxw6sdrx", type: "User" }]);
    assert.equal(s.avatar, "https://cdn.example.invalid/xSWCGB7jCv9J.jpg", "the 40px actor-photo picture");
    assert.equal(s.text, "Meadow meadow ember anchor hazel juniper falcon mossy saddle apple quiet otter apple copper apple");
    assert.deepEqual(s.feedback, { id: "7RGofn64M9bVhGGZFytp2lYHkr_CJs6E6Q==", reactions: 375, comments: 47, shares: null, viewerReaction: null, canComment: true, topReactions: [{ id: "827624435", count: 276 }] });
    assert.equal(s.target, null);
    assert.equal(s.groupId, null);
    assert.deepEqual(s.attachments, []);
    assert.equal(s.shared, null);
  });

  test("edge 1: a group member's share of a friend's photo post is kept and rendered with its shared story", async () => {
    const [, edge] = realEdges(file);
    assert.deepEqual(await classify(edge), { keep: true, reason: "keep", category: "UNDECODABLE" });
    const s = extractStory(edge.node);
    assert.equal(s.key, "821060896");
    assert.deepEqual(s.target, { type: "Group", id: "236448992", name: "Cobalt falcon summit", url: "https://www.facebook.com/groups/uvoxihke/" });
    assert.equal(s.groupId, "236448992");
    assert.equal(s.url, "https://www.facebook.com/groups/uvoxihke/posts/821060896/");
    assert.equal(s.text, null);
    assert.deepEqual([s.feedback.reactions, s.feedback.comments], [5, 0]);
    const shared = s.shared;
    assert.equal(shared.key, "446023094");
    assert.equal(shared.time, 823533210);
    assert.equal(shared.url, "https://www.facebook.com/uo0s9mnh/posts/775158275");
    assert.deepEqual(shared.actors, [{ id: "508573936", name: "Saddle yarrow orchard", url: "https://www.facebook.com/uo0s9mnh", type: "User" }]);
    assert.match(shared.text, /^Thistle quiet bramble/);
    assert.deepEqual(shared.attachments, [
      {
        kind: "photo",
        items: [{ uri: "https://cdn.example.invalid/ZHyPmOjkRjua.png", width: 526, height: 526, href: "https://www.facebook.com/photo/?fbid=969545875&set=a.512262947", alt: "Walnut quiet ridge pebble falcon quiet" }],
        total: 1,
      },
    ]);
    assert.equal(shared.feedback.id, "iCULhGgJt2upv0vYZb_NIchiu_YRyHPMjD==");
  });

  test("the real ExternalUrl range resolves to its web link (text padded back to its original length)", () => {
    const [, edge] = realEdges(file);
    const msg = edge.node.comet_sections.content.story.comet_sections.attached_story.story.attached_story.comet_sections.attached_story_layout.story.comet_sections.message.story.message;
    const node = { id: "x", message: { ...msg, text: msg.text.padEnd(200, ".") } };
    assert.deepEqual(extractStory(node).ranges, [{ offset: 160, length: 22, url: "https://example.invalid/uixxgip6", kind: "link" }]);
  });
});

describe("group posts with album, AI label and Join button (2026-10-11)", () => {
  const file = "feed-group-posts-ai-label-2026-10-11.trimmed.jsonl";

  test("stream lines without a root still give both edges", () => {
    const edges = realEdges(file);
    assert.equal(edges.length, 2);
  });

  test("album group post is kept and extracted", async () => {
    const [edge] = realEdges(file);
    assert.equal((await classify(edge)).reason, "keep");
    const s = extractStory(edge.node);
    assert.equal(s.key, "488943741");
    assert.equal(s.text, "Stone tundra cedar apple garden violet saddle tundra");
    assert.deepEqual(s.target, { type: "Group", id: "236448992", name: "Cobalt falcon summit", url: "https://www.facebook.com/groups/uvoxihke/" });
    assert.equal(s.attachments.length, 1, "node and content copies of the album merge");
    assert.equal(s.attachments[0].total, 15);
    assert.deepEqual(s.attachments[0].items[0], { uri: "https://cdn.example.invalid/kkoPlOOeEjVz.jpg", width: 590, height: 332, href: "https://www.facebook.com/photo.php?fbid=405294812&set=gm.212910152&type=3", alt: "Glacier yarrow valley summit pebble cedar" });
    assert.deepEqual([s.feedback.reactions, s.feedback.comments], [81, 11]);
  });

  test("the suggested group post: unconnected first, then recommendation, then Join", async () => {
    const [, edge] = realEdges(file);
    assert.equal((await classify(edge)).reason, "unconnected");
    const ctx = edge.node.comet_sections.context_layout.story;
    delete ctx.unconnected_waist_data;
    assert.equal((await classify(edge)).reason, "recommended");
    ctx.comet_sections.title.story.recommendation_context = null;
    assert.equal((await classify(edge)).reason, "join-suggestion");
    ctx.comet_sections.title.if_viewer_can_join_group = null;
    assert.equal((await classify(edge)).reason, "keep");
    const s = extractStory(edge.node);
    assert.equal(s.attachments[0].items[0].height, 789);
    assert.equal(s.groupId, "481224786");
  });
});

describe("Reels row (2026-10-11)", () => {
  test("ShowcaseFeedUnit is dropped as a unit; no category is decoded", async () => {
    const [edge] = realEdges("feed-reels-ShowcaseFeedUnit-2026-10-11.trimmed.jsonl");
    assert.deepEqual(await classify(edge), { keep: false, reason: "unit:ShowcaseFeedUnit", category: null });
    assert.equal(extractStory(edge.node), null);
  });
});

describe("SSR data-sjs RelayPrefetchedStreamCache blocks (2026-10-10)", () => {
  // The research trimmed the stream block's path, so the payloads are read one by one here.
  const blocks = readFixture("home-ssr-data-sjs-RelayPrefetchedStreamCache-2026-10-10.trimmed.jsonl", REAL_DIR)
    .trim()
    .split("\n")
    .map((l) => untrim(JSON.parse(l)));
  const [root, streamed] = sjsPayloads(blocks);

  test("payloads come out in sequence order", () => {
    assert.ok(root.data.viewer.news_feed.edges);
    assert.equal(streamed.label, "CometNewsFeed_viewerConnection$stream$CometNewsFeed_viewer_news_feed");
  });

  test("root edge: a group album post whose sections were trimmed still renders from the node", async () => {
    const edge = root.data.viewer.news_feed.edges[0];
    assert.equal((await classify(edge)).reason, "keep");
    const s = extractStory(edge.node);
    assert.equal(s.key, "607074701");
    assert.equal(s.url, "https://www.facebook.com/groups/214927169/posts/607074701/");
    assert.deepEqual(s.actors.map((a) => a.name), ["Pebble dune"]);
    assert.equal(s.target.name, "Bramble quiet cobalt");
    assert.equal(s.attachments[0].total, 5);
    assert.equal(s.feedback.id, "8AhkalbrtMEMWOco9ku3tthiSqkmxYyS9B==");
  });

  test("streamed edge: a friend's photo post", async () => {
    assert.equal((await classify(streamed.data)).reason, "keep");
    const s = extractStory(streamed.data.node);
    assert.equal(s.key, "238212940");
    assert.equal(s.url, "https://www.facebook.com/uzx6sszw/posts/726548099");
    assert.deepEqual(s.attachments[0].items[0], { uri: "https://cdn.example.invalid/k27K0P9CmzHd.jpg", width: 552, height: 522, href: "https://www.facebook.com/photo/?fbid=238212940&set=a.111405286", alt: "Walnut quiet ridge pebble falcon quiet" });
  });
});

describe("video delivery (2026-10)", () => {
  test("progressive SD and HD URLs are read from videoDeliveryResponseFragment", () => {
    for (const line of payloadsOf("video-delivery-2026-10.trimmed.jsonl")) {
      const media = { __typename: "Video", ...line.data.video };
      const node = { id: "v", attachments: [{ styles: { __typename: "StoryAttachmentVideoStyleRenderer", attachment: { media } } }] };
      const [video] = extractStory(node).attachments;
      const urls = media.videoDeliveryResponseFragment.videoDeliveryResponseResult.progressive_urls;
      assert.equal(video.kind, "video");
      assert.equal(video.sd, urls.find((u) => u.metadata.quality === "SD").progressive_url);
      assert.equal(video.hd, urls.find((u) => u.metadata.quality === "HD").progressive_url);
    }
  });
});
