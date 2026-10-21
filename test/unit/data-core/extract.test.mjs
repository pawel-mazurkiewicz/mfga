import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { extractStory, extractComment, cleanPermalink, unwrapLinkShim, findInStory, isAiLabel } from "../../../src/data/extract.js";
import {
  buildStory,
  buildComment,
  photoAttachment,
  videoAttachment,
  videoMedia,
  linkAttachment,
  unavailableAttachment,
  userEntity,
  linkEntity,
  cdnImage,
  linkShim,
  PEOPLE,
  REACTION,
  T0,
} from "../../fixtures/gql/make-fixtures.mjs";
import { nodeOf, readJson } from "./helpers.mjs";

const STORY_FIELDS = ["key", "postId", "nodeId", "time", "url", "actors", "avatar", "target", "title", "text", "ranges", "attachments", "shared", "feedback", "groupId", "tracking", "sources", "audience", "ai"];
const FEEDBACK_FIELDS = ["id", "reactions", "comments", "shares", "viewerReaction", "canComment", "topReactions"];
const b64 = (s) => Buffer.from(s).toString("base64");
const fixture = (file, opts) => extractStory(nodeOf(file), opts);
const story = (spec = {}) => buildStory({ postId: "9300000001", actor: PEOPLE.alice, text: "Hello", ...spec });

describe("extractStory: fixture stories, every field", () => {
  test("organic friend text post with mentions, hashtag, link, emoji and decoys", () => {
    const s = fixture("organic-friend-text.jsonl", { sources: ["friends", "favorites"] });
    assert.deepEqual(Object.keys(s), STORY_FIELDS);
    assert.deepEqual(Object.keys(s.feedback), FEEDBACK_FIELDS);
    assert.equal(s.key, "9100000001");
    assert.equal(s.postId, "9100000001");
    assert.equal(s.nodeId, b64(`S:_I${PEOPLE.alice.id}:9100000001`));
    assert.equal(s.time, T0);
    assert.equal(s.url, "https://www.facebook.com/alice.kowalska/posts/9100000001", "tracking params stripped from the timestamp URL");
    assert.deepEqual(s.actors, [{ id: PEOPLE.alice.id, name: "Alice Kowalska", url: "https://www.facebook.com/alice.kowalska", type: "User" }]);
    assert.equal(s.avatar, cdnImage(`pp${PEOPLE.alice.id}`, 40));
    assert.equal(s.target, null);
    assert.equal(s.title, null);
    assert.equal(s.text, "Back from the lake 🏞️ with Bob Example! Dinner at Pizza Place #summer more: example.com/trip");
    assert.deepEqual(s.ranges, [
      { offset: s.text.indexOf("Bob Example"), length: 11, url: "https://www.facebook.com/bob.example", kind: "user" },
      { offset: s.text.indexOf("Pizza Place"), length: 11, url: "https://www.facebook.com/pizzaplace", kind: "page" },
      { offset: s.text.indexOf("#summer"), length: 7, url: "https://www.facebook.com/hashtag/summer?__eep__=6", kind: "hashtag" },
      { offset: s.text.indexOf("example.com/trip"), length: 16, url: "https://example.com/trip", kind: "link" },
    ]);
    assert.equal(s.ranges[0].offset, 28, "UTF-16 offset after the emoji (🏞️ is 3 code units)");
    assert.deepEqual(s.attachments, [], "GHL mocked footers are never attachments");
    assert.equal(s.shared, null);
    assert.deepEqual(s.feedback, {
      id: b64("feedback:9100000001"),
      reactions: 12,
      comments: 3,
      shares: 1,
      viewerReaction: REACTION.LIKE,
      canComment: true,
      topReactions: [
        { id: REACTION.LIKE, count: 10 },
        { id: REACTION.LOVE, count: 2 },
      ],
    });
    assert.equal(s.groupId, null);
    assert.equal(s.tracking, "AZfx_9100000001_encrypted_tracking");
    assert.deepEqual(s.sources, ["friends", "favorites"]);
    assert.equal(s.audience, "Friends");
    assert.equal(s.ai, false);
  });

  test("friend photo post: one photo, duplicated copies merged", () => {
    const s = fixture("friend-photo.jsonl");
    assert.deepEqual(s.attachments, [
      {
        kind: "photo",
        items: [{ uri: cdnImage("ph5100000001", 526), width: 526, height: 395, href: "https://www.facebook.com/photo/?fbid=5100000001&set=a.51000000010", alt: "May be an image of a lake" }],
        total: 1,
      },
    ]);
    assert.deepEqual(s.feedback, { id: b64("feedback:9100000002"), reactions: 4, comments: 0, shares: 0, viewerReaction: null, canComment: true, topReactions: [{ id: REACTION.LIKE, count: 4 }] });
    assert.equal(s.audience, "Public");
    assert.deepEqual(s.sources, []);
  });

  test("album: up to 4 items, total from the subattachment count, headline title", () => {
    const s = fixture("album.jsonl");
    assert.equal(s.title, "Carol Nowak added 23 new photos to the album Wedding.");
    assert.equal(s.attachments.length, 1);
    const [album] = s.attachments;
    assert.equal(album.kind, "photo");
    assert.equal(album.total, 23);
    assert.deepEqual(
      album.items.map((i) => i.href),
      ["5100000011", "5100000012", "5100000013", "5100000014"].map((id) => `https://www.facebook.com/photo.php?fbid=${id}&set=pcb.9100000003&type=3`),
    );
    assert.deepEqual(album.items[0], { uri: cdnImage("al5100000011", 590), width: 590, height: 443, href: album.items[0].href, alt: "Album photo 1" });
  });

  test("video: progressive SD/HD, poster, size, duration", () => {
    const s = fixture("video.jsonl");
    const media = videoMedia({ id: "6100000001" });
    const [sd, hd] = media.videoDeliveryResponseFragment.videoDeliveryResponseResult.progressive_urls.map((p) => p.progressive_url);
    assert.deepEqual(s.attachments, [{ kind: "video", poster: cdnImage("vt6100000001", 720), sd, hd, width: 1280, height: 720, href: "https://www.facebook.com/watch/?v=6100000001", duration: 95, live: false }]);
    assert.deepEqual([s.feedback.reactions, s.feedback.comments, s.feedback.shares], [7, 2, 1], "adaptive renderer layout");
  });

  test("link share: destination unwrapped from l.php and cleaned, card fields", () => {
    const s = fixture("link-share.jsonl");
    assert.deepEqual(s.attachments, [
      {
        kind: "link",
        url: "https://news.example.org/2026/10/article?id=7",
        title: "Mountain huts reopen for winter",
        description: "Twelve huts in the Tatras will stay open all season.",
        source: "news.example.org",
        image: cdnImage("lnk1", 500),
      },
    ]);
  });

  test("group post: Actor ▸ Group target, groupId, the larger avatar wins", () => {
    const s = fixture("group-post.jsonl");
    assert.deepEqual(s.target, { type: "Group", id: PEOPLE.hikers.id, name: "Tatra Hikers", url: "https://www.facebook.com/groups/tatrahikers/" });
    assert.equal(s.groupId, PEOPLE.hikers.id);
    assert.equal(s.url, "https://www.facebook.com/groups/tatrahikers/posts/9100000006/");
    assert.equal(s.avatar, cdnImage(`pp${PEOPLE.carol.id}`, 40), "40px content picture beats the 24px community-attribution photo");
    assert.equal(s.audience, "Public group");
  });

  test("page post: Page actor, event attachment", () => {
    const s = fixture("page-post.jsonl");
    assert.deepEqual(s.actors, [{ id: PEOPLE.pizza.id, name: "Pizza Place", url: "https://www.facebook.com/pizzaplace", type: "Page" }]);
    assert.deepEqual(s.attachments, [{ kind: "event", url: "https://www.facebook.com/events/7100000001/", title: "Pizza Tuesday", when: "Tuesday, October 27, 2026 at 6 PM" }]);
    assert.equal(s.feedback.reactions, 88);
  });

  test("shared story: the three partial copies merge into one render-ready Story", () => {
    const s = fixture("shared-story.jsonl");
    assert.equal(s.text, "Ha! This is us every winter");
    assert.deepEqual(s.attachments, [], "the shared post's photo belongs to the shared story");
    const shared = s.shared;
    assert.deepEqual(Object.keys(shared), STORY_FIELDS);
    assert.equal(shared.key, "9100000099");
    assert.equal(shared.nodeId, b64(`S:_I${PEOPLE.news.id}:9100000099`));
    assert.equal(shared.time, T0 - 30 * 900);
    assert.equal(shared.url, "https://www.facebook.com/dailygazette/posts/9100000099");
    assert.deepEqual(shared.actors, [{ id: PEOPLE.news.id, name: "Daily Gazette", url: "https://www.facebook.com/dailygazette", type: "Page" }]);
    assert.equal(shared.avatar, cdnImage(`pp${PEOPLE.news.id}`, 40));
    assert.equal(shared.text, "Ten signs winter has arrived in the mountains");
    assert.equal(shared.attachments.length, 1);
    assert.equal(shared.attachments[0].items[0].uri, cdnImage("ph5100000099", 526));
    assert.equal(shared.feedback.id, b64("feedback:9100000099"));
    assert.equal(shared.tracking, "AZfx_9100000099_encrypted_tracking");
    assert.deepEqual(shared.sources, []);
    assert.equal(shared.shared, null);
  });

  test("unavailable attachment", () => {
    assert.deepEqual(fixture("unavailable-attachment.jsonl").attachments, [{ kind: "unavailable" }]);
  });

  test("AI label", () => {
    assert.equal(fixture("ai-label.jsonl").ai, true);
    assert.equal(fixture("friend-photo.jsonl").ai, false);
  });

  test("viewerReaction is the reaction id; null when the viewer has not reacted", () => {
    assert.equal(extractStory(story({ feedback: { viewerReaction: REACTION.WOW } })).feedback.viewerReaction, REACTION.WOW);
    assert.equal(extractStory(story({ feedback: { viewerReaction: REACTION.HAHA, layout: "renderers" } })).feedback.viewerReaction, REACTION.HAHA);
    assert.equal(extractStory(story()).feedback.viewerReaction, null);
  });

  test("a wall post to another person has that person as target, and no group", () => {
    const s = extractStory(story({ actor: PEOPLE.bob, to: PEOPLE.alice }));
    assert.deepEqual(s.target, { type: "User", id: PEOPLE.alice.id, name: "Alice Kowalska", url: "https://www.facebook.com/alice.kowalska" });
    assert.equal(s.groupId, null);
  });
});

describe("extractStory: shared stories are depth-limited", () => {
  test("a share of a share of a share stops after two levels", () => {
    const level = (n, inner) => ({ id: `n${n}`, post_id: `p${n}`, message: { text: `level ${n}` }, attached_story: inner });
    const node = { __typename: "Story", ...level(0, level(1, level(2, level(3, null)))) };
    const s = extractStory(node);
    assert.equal(s.text, "level 0");
    assert.equal(s.shared.text, "level 1");
    assert.equal(s.shared.shared.text, "level 2");
    assert.equal(s.shared.shared.shared, null);
  });

  test("copies with a different id are not merged into the shared story", () => {
    const node = { id: "a", post_id: "1", attached_story: { id: "s1", post_id: "11", message: { text: "real" } }, comet_sections: { content: { story: { attached_story: { id: "other", message: { text: "wrong" }, post_id: "99" } } } } };
    assert.equal(extractStory(node).shared.text, "real");
    assert.equal(extractStory(node).shared.postId, "11");
  });
});

describe("extractStory: missing or changed data", () => {
  test("non-objects, typed non-stories and nodes without identity give null", () => {
    for (const bad of [null, undefined, "x", 5, [], [{ id: "1" }], { __typename: "ShowcaseFeedUnit", id: "1" }]) assert.equal(extractStory(bad), null);
    assert.equal(extractStory({}), null);
    assert.equal(extractStory({ __typename: "Story", message: { text: "orphan" } }), null);
  });

  test("dedupKey is the key of last resort", () => {
    const s = extractStory({ message: { text: "x" } }, { dedupKey: "dk1" });
    assert.equal(s.key, "dk1");
    assert.equal(s.postId, null);
    assert.equal(s.nodeId, null);
    assert.equal(extractStory({ id: "n" }, null).key, "n", "null options are fine");
  });

  test("a bare node yields a complete, empty-valued Story", () => {
    assert.deepEqual(extractStory({ id: "n1" }), {
      key: "n1",
      postId: null,
      nodeId: "n1",
      time: null,
      url: null,
      actors: [],
      avatar: null,
      target: null,
      title: null,
      text: null,
      ranges: [],
      attachments: [],
      shared: null,
      feedback: { id: null, reactions: null, comments: null, shares: null, viewerReaction: null, canComment: true, topReactions: [] },
      groupId: null,
      tracking: null,
      sources: [],
      audience: null,
      ai: false,
    });
  });

  test("trimmed sections (strings where objects belong) do not throw", () => {
    const node = { __typename: "Story", id: "n", post_id: 42, comet_sections: "<trimmed>", attachments: "<trimmed>", actors: ["<trimmed>", { id: 7, name: "Ann" }], feedback: "<trimmed>" };
    const s = extractStory(node);
    assert.equal(s.postId, "42", "numeric ids become strings");
    assert.deepEqual(s.actors, [{ id: "7", name: "Ann", url: null, type: null }]);
    assert.deepEqual(s.attachments, []);
  });

  test("post_id, time and permalink fall back to a bounded search", () => {
    const node = { id: "n", deep: { a: { post_id: "77", creation_time: 123, permalink_url: "/ann/posts/77?__tn__=R" } } };
    const s = extractStory(node);
    assert.deepEqual([s.postId, s.time, s.url], ["77", 123, "https://www.facebook.com/ann/posts/77"]);
  });

  test("time and URL come from the header metadata when the timestamp section is missing", () => {
    const node = story();
    delete node.creation_time;
    delete node.comet_sections.timestamp;
    delete node.permalink_url;
    const s = extractStory(node);
    assert.equal(s.time, T0);
    assert.equal(s.url, "https://www.facebook.com/alice.kowalska/posts/9300000001");
  });

  test("text falls back through the message strategies, then any `message` with text", () => {
    const node = story();
    const content = node.comet_sections.content.story;
    content.message = null;
    assert.equal(extractStory(node).text, "Hello", "comet_sections.message");
    content.comet_sections.message = null;
    assert.equal(extractStory(node).text, "Hello", "message_container");
    content.comet_sections.message_container = null;
    assert.equal(extractStory(node).text, "Hello", "UFI container copy");
    node.comet_sections.feedback.story.story_ufi_container.story.message = null;
    assert.equal(extractStory(node).text, null);
    node.comet_sections.extra = { wrapper: { message: { text: "found deep" } } };
    assert.equal(extractStory(node).text, "found deep");
  });

  test("rich-text posts: blocks become lines", () => {
    const node = { id: "n", comet_sections: { content: { story: { comet_sections: { message: { __typename: "CometFeedStoryRichMessageRenderingStrategy", rich_message: [{ text: "Title" }, { text: "Body" }, "<trimmed>"] } } } } } };
    assert.equal(extractStory(node).text, "Title\nBody");
  });

  test("ranges come from the copy whose text matches; bad ranges are dropped", () => {
    const text = "Hi Bob and friends";
    const ranges = [
      { offset: 3, length: 3, entity: userEntity(PEOPLE.bob) },
      { offset: 50, length: 3, entity: userEntity(PEOPLE.bob) },
      { offset: -1, length: 3, entity: userEntity(PEOPLE.bob) },
      { offset: 3, length: 0, entity: userEntity(PEOPLE.bob) },
      { offset: 1.5, length: 2, entity: userEntity(PEOPLE.bob) },
      { offset: 0, length: 2, entity: { __typename: "User", url: "javascript:alert(1)" } },
      { offset: 0, length: 2, entity: { __typename: "Group" } },
      "<trimmed>",
    ];
    const node = { id: "n", message: { text }, comet_sections: { content: { story: { comet_sections: { message: { story: { message: { text, ranges } } } } } } } };
    assert.deepEqual(extractStory(node).ranges, [{ offset: 3, length: 3, url: "https://www.facebook.com/bob.example", kind: "user" }]);
    const mismatched = { id: "n", comet_sections: { content: { story: { message: { text: "Other text entirely" }, comet_sections: { message: { story: { message: { text, ranges } } } } } } } };
    assert.equal(extractStory(mismatched).text, "Other text entirely");
    assert.deepEqual(extractStory(mismatched).ranges, [], "ranges are only valid for the text they came with");
  });

  test("range kinds: entities without a known typename but with a web link are links; others are other", () => {
    const text = "see news and the group";
    const link = { ...linkEntity("https://news.example.org/x"), __typename: "Unknownish" };
    const ranges = [
      { offset: 4, length: 4, entity: link },
      { offset: 17, length: 5, entity: { __typename: "Group", url: "https://www.facebook.com/groups/g/?__cft__[0]=x" } },
    ];
    assert.deepEqual(extractStory({ id: "n", message: { text, ranges } }).ranges, [
      { offset: 4, length: 4, url: "https://news.example.org/x", kind: "link" },
      { offset: 17, length: 5, url: "https://www.facebook.com/groups/g/", kind: "other" },
    ]);
  });

  test("actors fall back to owning_profile, then to the first named actor anywhere", () => {
    const owner = { id: "n", feedback: { owning_profile: { __typename: "User", id: "5", name: "Owner Person" } } };
    assert.deepEqual(extractStory(owner).actors, [{ id: "5", name: "Owner Person", url: null, type: "User" }]);
    const deep = { id: "n", wrapper: { inner: { actors: [{ __typename: "Page", id: "6", name: "Deep Page", url: "https://www.facebook.com/deep" }] } } };
    assert.deepEqual(extractStory(deep).actors, [{ id: "6", name: "Deep Page", url: "https://www.facebook.com/deep", type: "Page" }]);
  });

  test("actor details missing from one projection are filled from another with the same id", () => {
    const node = { id: "n", actors: [{ id: "1", name: "Ann" }], comet_sections: { content: { story: { actors: [{ id: "1", __typename: "User", url: "https://www.facebook.com/ann?__tn__=R" }] } } } };
    assert.deepEqual(extractStory(node).actors, [{ id: "1", name: "Ann", url: "https://www.facebook.com/ann", type: "User" }]);
  });

  test("avatar: width × scale decides, and pictures of other people are ignored", () => {
    const pic = (name, width, scale) => ({ uri: `https://cdn.example.invalid/${name}.jpg`, width, height: width, scale });
    const node = {
      id: "n",
      actors: [{ id: "1", name: "Ann", profile_picture: pic("a40", 40, 1) }],
      comet_sections: {
        context_layout: { story: { comet_sections: { actor_photo: { story: { actors: [{ id: "1", profile_picture: pic("a32x2", 32, 2) }, { id: "2", profile_picture: pic("other", 500, 1) }] } } } } },
      },
    };
    assert.equal(extractStory(node).avatar, "https://cdn.example.invalid/a32x2.jpg");
    assert.equal(extractStory({ id: "n", actors: [{ id: "1", name: "Ann", profile_picture: { uri: "javascript:x" } }] }).avatar, null);
  });

  test("target from target_group alone, and groupId from associated_group", () => {
    const tg = extractStory({ id: "n", target_group: { id: "G1" } });
    assert.deepEqual(tg.target, { type: "Group", id: "G1", name: null, url: "https://www.facebook.com/groups/G1/" });
    assert.equal(tg.groupId, "G1");
    const ag = extractStory({ id: "n", feedback: { id: "f", associated_group: { id: "G2" } } });
    assert.equal(ag.target, null);
    assert.equal(ag.groupId, "G2");
  });

  test("a target equal to the only actor is no target", () => {
    assert.equal(extractStory({ id: "n", actors: [{ id: "1", name: "Ann" }], to: { __typename: "User", id: "1", name: "Ann" } }).target, null);
  });

  test("feedback: counts from top reactions and digit strings when the totals are missing", () => {
    const summary = { top_reactions: { edges: [{ node: { id: REACTION.LIKE }, reaction_count: 3 }, { node: { id: REACTION.LOVE }, reaction_count: 2 }, "<trimmed>", { node: {}, reaction_count: 9 }] }, i18n_share_count: "4" };
    const node = { id: "n", wrapper: { comet_ufi_summary_and_actions_renderer: { feedback: summary }, can_viewer_comment: false } };
    const fb = extractStory(node).feedback;
    assert.equal(fb.reactions, 5);
    assert.equal(fb.shares, 4);
    assert.equal(fb.canComment, false);
    assert.deepEqual(fb.topReactions, [
      { id: REACTION.LIKE, count: 3 },
      { id: REACTION.LOVE, count: 2 },
    ]);
    const localized = { id: "n", w: { comet_ufi_summary_and_actions_renderer: { feedback: { i18n_reaction_count: "1.2K" } } } };
    assert.equal(extractStory(localized).feedback.reactions, null, "localized abbreviations are not guessed");
  });

  test("feedback: comment count via comments_count_summary_renderer; disabled comments", () => {
    const summary = { comments_count_summary_renderer: { feedback: { comment_rendering_instance: { comments: { total_count: 8 } } } } };
    const node = { id: "n", w: { comet_ufi_summary_and_actions_renderer: { feedback: summary }, have_comments_been_disabled: true } };
    const fb = extractStory(node).feedback;
    assert.equal(fb.comments, 8);
    assert.equal(fb.canComment, false);
  });

  test("feedback id falls back to the first Feedback object", () => {
    assert.equal(extractStory({ id: "n", x: { y: { __typename: "Feedback", id: "FB1" } } }).feedback.id, "FB1");
  });

  test("audience and AI label are found by search when the header moved", () => {
    const node = { id: "n", header: { sections: [{ story: { privacy_scope: { description: { text: "Only me" } } } }, { __typename: "CometFeedStoryGenAIContentTransparencyStrategy", was_self_disclosed_as_ai_generated: true }] } };
    const s = extractStory(node);
    assert.equal(s.audience, "Only me");
    assert.equal(s.ai, true);
  });
});

describe("extractStory: attachments", () => {
  const withAttachments = (...attachments) => extractStory({ id: "n", attachments }).attachments;

  test("legacy video fields, live flag, first-frame poster", () => {
    const media = { ...videoMedia({ id: "61", legacy: true, live: true }), preferred_thumbnail: null, first_frame_thumbnail: "https://cdn.example.invalid/ff.jpg" };
    const [v] = withAttachments({ styles: { __typename: "StoryAttachmentVideoStyleRenderer", attachment: { media } } });
    assert.equal(v.kind, "video");
    assert.match(v.sd, /_sd\.mp4/);
    assert.match(v.hd, /_hd\.mp4/);
    assert.equal(v.poster, "https://cdn.example.invalid/ff.jpg");
    assert.equal(v.live, true);
  });

  test("video: failed progressive URLs are skipped; a quality-less URL serves as SD", () => {
    const media = {
      __typename: "Video",
      original_width: 640,
      original_height: 360,
      videoDeliveryResponseFragment: {
        videoDeliveryResponseResult: {
          progressive_urls: [
            { progressive_url: "https://v.example.invalid/hd.mp4", failure_reason: { type: "X" }, metadata: { quality: "HD" } },
            { progressive_url: "https://v.example.invalid/any.mp4", failure_reason: null, metadata: null },
            "<trimmed>",
          ],
        },
      },
      thumbnailImage: { uri: "https://cdn.example.invalid/t.jpg" },
    };
    assert.deepEqual(withAttachments({ media }), [{ kind: "video", poster: "https://cdn.example.invalid/t.jpg", sd: "https://v.example.invalid/any.mp4", hd: null, width: 640, height: 360, href: null, duration: null, live: false }]);
  });

  test("a shared reel (FBReels style) is a video", () => {
    const media = videoMedia({ id: "62", width: 720, height: 1280 });
    const [v] = withAttachments({ styles: { __typename: "StoryAttachmentFBReelsStyleRenderer", attachment: { style_infos: [{ fb_shorts_story: { attachments: [{ media }] } }] } } });
    assert.equal(v.kind, "video");
    assert.equal(v.height, 1280);
  });

  test("link without styles (search-result shape): renderer link, image fallbacks, real footer", () => {
    const att = {
      media: { __typename: "GenericAttachmentMedia", imageLargeAspect: { uri: "https://cdn.example.invalid/large.png" } },
      title_with_entities: { text: "Shop title" },
      story_attachment_link_renderer: { attachment: { web_link: { url: "https://shop.example.com/p?utm=1&fbclid=abc" } } },
      comet_footer_renderer: { __typename: "CometStoryAttachmentFooterGenericShareStrategy", attachment: { description: { text: "Footer desc" }, source: { text: "SHOP.EXAMPLE.COM" } } },
    };
    assert.deepEqual(withAttachments(att), [{ kind: "link", url: "https://shop.example.com/p?utm=1", title: "Shop title", description: "Footer desc", source: "SHOP.EXAMPLE.COM", image: "https://cdn.example.invalid/large.png" }]);
  });

  test("link: GHLMocked footer data is never read; source falls back to the host", () => {
    const att = {
      styles: { __typename: "StoryAttachmentShareStyleRenderer", attachment: { url: linkShim("https://blog.example.net/post") } },
      comet_footer_renderer: { __typename: "CometStoryAttachmentFooterGHLMockedGenericShareStrategy", attachment: { title_with_entities: { text: "MOCK" }, description: { text: "MOCK" }, source: { text: "MOCK" } } },
    };
    assert.deepEqual(withAttachments(att), [{ kind: "link", url: "https://blog.example.net/post", title: null, description: null, source: "blog.example.net", image: null }]);
  });

  test("an external-url target makes a link even without a share style", () => {
    const [a] = withAttachments({ target: { __typename: "ExternalUrl", external_url: "https://x.example.com/" } });
    assert.equal(a.kind, "link");
    assert.equal(a.url, "https://x.example.com/");
  });

  test("other: anything else with a link; stubs without data are skipped", () => {
    assert.deepEqual(withAttachments({ styles: { __typename: "StoryAttachmentFundraiserStyleRenderer", attachment: { url: "/donate/1/?__tn__=x" } } }), [{ kind: "other", href: "https://www.facebook.com/donate/1/" }]);
    assert.deepEqual(withAttachments({ media: { __typename: "Photo", id: "1" } }, { action_links: [] }, "<trimmed>", null), []);
  });

  test("dedup: the same attachment from node and content copies appears once; a richer copy replaces 'other'", () => {
    const photo = photoAttachment({ id: "77" });
    const node = { id: "n", attachments: [photo], comet_sections: { content: { story: { attachments: [{ ...photo, styles: { __typename: "Weird", attachment: { url: "https://www.facebook.com/x" } } }] } } } };
    const out = extractStory(node).attachments;
    assert.equal(out.length, 1);
    assert.equal(out[0].kind, "photo");
  });

  test("several different attachments keep their order", () => {
    const out = withAttachments(photoAttachment({ id: "1" }), videoAttachment({ id: "2" }), linkAttachment({ url: "https://a.example/", title: "A", description: "", source: "a.example" }), unavailableAttachment());
    assert.deepEqual(
      out.map((a) => a.kind),
      ["photo", "video", "link", "unavailable"],
    );
  });

  test("a single subattachment without an album style is not an album", () => {
    const att = { styles: { __typename: "StoryAttachmentPhotoStyleRenderer", attachment: { all_subattachments: { count: 1, nodes: [{ media: { image: { uri: "https://cdn.example.invalid/1.jpg" } } }] }, media: { __typename: "Photo", image: { uri: "https://cdn.example.invalid/main.jpg" } } } } };
    const [a] = withAttachments(att);
    assert.deepEqual(a.items.map((i) => i.uri), ["https://cdn.example.invalid/main.jpg"]);
  });
});

describe("cleanPermalink", () => {
  test("strips Facebook tracking parameters and keeps the rest", () => {
    assert.equal(cleanPermalink("https://www.facebook.com/a/posts/1?__cft__[0]=AZx&__tn__=%2CO%2CP-R&mibextid=abc&fbclid=x&set=a.1"), "https://www.facebook.com/a/posts/1?set=a.1");
    assert.equal(cleanPermalink("https://www.facebook.com/a?__cft__%5B0%5D=AZx&__xts__%5B0%5D=y"), "https://www.facebook.com/a");
    assert.equal(cleanPermalink("https://www.facebook.com/a?x=1#frag"), "https://www.facebook.com/a?x=1#frag");
  });

  test("leaves URLs without tracking parameters untouched", () => {
    const url = "https://www.facebook.com/photo/?fbid=1&set=a.2&type=3";
    assert.equal(cleanPermalink(url), url);
  });

  test("resolves relative URLs against facebook.com", () => {
    assert.equal(cleanPermalink("/groups/1/posts/2/"), "https://www.facebook.com/groups/1/posts/2/");
  });

  test("rejects non-http(s) and empty values", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "", null, undefined, "http://[bad"]) assert.equal(cleanPermalink(bad), null);
  });
});

describe("unwrapLinkShim", () => {
  test("unwraps l.php on l. and lm. hosts", () => {
    assert.equal(unwrapLinkShim(linkShim("https://example.com/a?b=1")), "https://example.com/a?b=1");
    assert.equal(unwrapLinkShim("https://lm.facebook.com/l.php?u=http%3A%2F%2Fexample.com%2F&h=x"), "http://example.com/");
    assert.equal(unwrapLinkShim("https://www.facebook.com/l.php?u=https%3A%2F%2Fexample.org"), "https://example.org/");
  });

  test("refuses unsafe, relative or missing targets", () => {
    assert.equal(unwrapLinkShim("https://l.facebook.com/l.php?u=javascript%3Aalert(1)"), null);
    assert.equal(unwrapLinkShim("https://l.facebook.com/l.php?u=%2Fpath"), null);
    assert.equal(unwrapLinkShim("https://l.facebook.com/l.php?h=x"), null);
    assert.equal(unwrapLinkShim("https://l.facebook.com/l.php?u=bLgUTwzZRzDX1UYh&h=x"), null, "GHL mocked links carry no URL");
  });

  test("returns other http(s) URLs as they are and rejects the rest", () => {
    assert.equal(unwrapLinkShim("https://example.com/l.php?u=https%3A%2F%2Fevil.example"), "https://example.com/l.php?u=https%3A%2F%2Fevil.example");
    assert.equal(unwrapLinkShim("https://www.facebook.com/bob"), "https://www.facebook.com/bob");
    assert.equal(unwrapLinkShim("javascript:alert(1)"), null);
    assert.equal(unwrapLinkShim(null), null);
  });
});

describe("findInStory and isAiLabel", () => {
  test("search order is document order and the root itself is tested", () => {
    const root = { __typename: "Root", a: { n: 1, b: { n: 2 } }, c: { n: 3 } };
    assert.equal(findInStory(root, (o) => o.__typename === "Root"), root);
    assert.equal(findInStory(root, (o) => o.n != null).n, 1);
    assert.equal(findInStory(root, (o) => o.n === 3).n, 3);
  });

  test("passes the property key; array items report the array's key", () => {
    const keys = [];
    findInStory({ list: [{ v: 1 }], obj: { v: 2 } }, (o, key) => {
      keys.push(key);
      return false;
    });
    assert.deepEqual(keys, [null, "list", "obj"]);
  });

  test("skips attached_story, ghl_* keys, GHLMocked objects and nested edges", () => {
    const marker = { m: true };
    const root = {
      attached_story: { marker },
      ghl_label: { marker },
      footer: { __typename: "CometStoryAttachmentFooterGHLMockedGenericShareStrategy", marker },
      related: { node: { marker }, cursor: "x" },
    };
    assert.equal(findInStory(root, (o) => o.m === true), null);
    assert.equal(findInStory({ attached_story_layout: { marker } }, (o) => o.m === true), marker, "only the exact attached_story key is skipped");
  });

  test("non-object roots find nothing", () => {
    assert.equal(findInStory(null, () => true), null);
    assert.equal(findInStory("x", () => true), null);
  });

  test("isAiLabel needs the GenAI section and a positive flag", () => {
    const t = "CometFeedStoryGenAIContentTransparencyStrategy";
    assert.equal(isAiLabel({ __typename: t, was_detected_as_ai_generated: true }), true);
    assert.equal(isAiLabel({ __typename: t, ai_generated_detected_info: { gen_ai_transparency_type: "PROVENANCE_DETECTED_CREATED" } }), true);
    assert.equal(isAiLabel({ __typename: t, was_detected_as_ai_generated: false }), false);
    assert.equal(isAiLabel({ was_detected_as_ai_generated: true }), false);
    assert.equal(isAiLabel(null), false);
  });
});

describe("extractComment", () => {
  test("comments from the CommentsListComponentsPaginationQuery fixture", () => {
    const edges = readJson("comments.json").data.node.comment_rendering_instance_for_feed_location.comments.edges;
    const [first, second] = edges.map((e) => extractComment(e.node));
    assert.deepEqual(first, {
      id: b64("comment:6600000001"),
      author: { id: PEOPLE.bob.id, name: "Bob Example", url: "https://www.facebook.com/bob.example", avatar: cdnImage(`cp${PEOPLE.bob.id}`, 32) },
      text: "Looks amazing! 😍",
      ranges: [],
      time: T0 + 300,
      reactions: 2,
      replies: 1,
    });
    assert.deepEqual(second.ranges, [{ offset: "Say hi to ".length, length: 14, url: "https://www.facebook.com/alice.kowalska", kind: "user" }]);
    assert.equal(second.reactions, 0);
    assert.equal(second.replies, 0);
  });

  test("falls back to translated bodies, legacy ids, other avatars and badge timestamps", () => {
    const c = extractComment({
      legacy_fbid: 991,
      body: { text: "" },
      preferred_body: { text: "translated", ranges: [] },
      author: { id: "5", name: "Zed", profile_picture: { uri: "https://cdn.example.invalid/z.jpg" } },
      badges: [{ comment: { id: undefined } }, { comment: { created_time: 5 } }],
      feedback: { top_reactions: { edges: [{ reaction_count: 2 }, { reaction_count: 1 }] }, replies_fields: { count: 4 } },
    });
    assert.equal(c.id, "991");
    assert.equal(c.text, "translated");
    assert.equal(c.author.avatar, "https://cdn.example.invalid/z.jpg");
    assert.equal(c.author.url, null);
    assert.equal(c.reactions, 3);
    assert.equal(c.replies, 4);
  });

  test("time from the timestamp badge of the same comment", () => {
    const c = extractComment({ id: "c1", body: { text: "x" }, renderer: { comment: { id: "c1", created_time: 77 } } });
    assert.equal(c.time, 77);
  });

  test("reaction count variants", () => {
    assert.equal(extractComment({ id: "c", feedback: { reactors: { count: 6 } } }).reactions, 6);
    assert.equal(extractComment({ id: "c", feedback: { unified_reactors: { count: 7 } } }).reactions, 7);
    assert.equal(extractComment({ id: "c", feedback: { reaction_count: { count: 8 } } }).reactions, 8);
    assert.equal(extractComment({ id: "c", feedback: { reactors: { count_reduced: "9" } } }).reactions, 9);
    assert.equal(extractComment({ id: "c", feedback: { reactors: { count_reduced: "1K" } } }).reactions, 0);
  });

  test("builder comment round-trips", () => {
    const c = extractComment(buildComment({ id: "1", author: PEOPLE.carol, text: "Hi", reactions: 5, replies: 2 }));
    assert.deepEqual([c.text, c.reactions, c.replies, c.author.name], ["Hi", 5, 2, "Carol Nowak"]);
  });

  test("invalid input gives null; a comment without text keeps null text", () => {
    for (const bad of [null, undefined, "x", [], {}, { body: { text: "no id" } }]) assert.equal(extractComment(bad), null);
    const c = extractComment({ id: "c" });
    assert.deepEqual(c, { id: "c", author: { id: null, name: null, url: null, avatar: null }, text: null, ranges: [], time: null, reactions: 0, replies: 0 });
  });
});
