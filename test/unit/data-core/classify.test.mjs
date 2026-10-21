import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createClassifier, webCryptoSha256Hex, REASONS, NON_STORY_UNITS, CATEGORY_NUMBERS } from "../../../src/data/classify.js";
import { health } from "../../../src/shared/util.js";
import { buildEdge, buildStory, categoryHash, sha256Hex, pymkUnit, showcaseUnit, STORIES, PEOPLE, CATEGORY } from "../../fixtures/gql/make-fixtures.mjs";
import { nodeOf, edgesOf, nest } from "./helpers.mjs";

const { classify } = createClassifier();
const story = (spec = {}) => buildStory({ postId: "9200000001", actor: PEOPLE.alice, text: "Hello", ...spec });
const verdict = (edge, opts) => (opts ? createClassifier(opts).classify(edge) : classify(edge));
const reasonOf = async (edge, opts) => (await verdict(edge, opts)).reason;

describe("exports", () => {
  test("REASONS lists the drop reasons in decision order", () => {
    assert.deepEqual(REASONS, ["no-node", "unit", "sponsored-data", "category", "sponsored-label", "auction-distance", "unconnected", "recommended", "follow-suggestion", "join-suggestion", "ai"]);
  });

  test("CATEGORY_NUMBERS is Facebook's FeedStoryCategory enum", () => {
    assert.equal(Object.keys(CATEGORY_NUMBERS).length, 21);
    assert.equal(CATEGORY_NUMBERS.ORGANIC, 1);
    assert.equal(CATEGORY_NUMBERS.SPONSORED, 5);
    assert.equal(CATEGORY_NUMBERS.LIMITED_PERSONALIZATION_NOTICE, 20);
    assert.ok(Object.isFrozen(CATEGORY_NUMBERS));
  });

  test("NON_STORY_UNITS holds the known non-post feed units", () => {
    for (const t of ["PaginatedPeopleYouMayKnowFeedUnit", "ShowcaseFeedUnit", "StoriesTrayFeedUnit", "QuickPromotionFeedUnit", "AdsSideFeedUnit", "GoodwillCometStory"]) assert.ok(NON_STORY_UNITS.has(t), t);
    assert.equal(NON_STORY_UNITS.has("Story"), false);
  });

  test("webCryptoSha256Hex returns lowercase hex", async () => {
    assert.equal(await webCryptoSha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    assert.equal(await webCryptoSha256Hex("9100000001"), sha256Hex("9100000001"));
  });
});

describe("drop reasons", () => {
  test("no-node", async () => {
    for (const edge of [null, undefined, {}, { cursor: "c" }, { node: null }, { node: "x" }, { node: [] }]) {
      assert.deepEqual(await verdict(edge), { keep: false, reason: "no-node", category: null });
    }
  });

  test("unit:<typename> for every non-Story unit", async () => {
    assert.equal(await reasonOf(buildEdge(pymkUnit(), { enc: null })), "unit:PaginatedPeopleYouMayKnowFeedUnit");
    assert.equal(await reasonOf(buildEdge(showcaseUnit(), { category: "FB_SHORTS", enc: null })), "unit:ShowcaseFeedUnit");
    assert.equal(await reasonOf({ node: { __typename: "SomethingNew", id: "1" } }), "unit:SomethingNew");
    assert.equal(await reasonOf({ node: { id: "1", post_id: "2" } }), "unit:unknown");
  });

  test("unknown unit typenames are counted for diagnostics", async () => {
    const before = health.counters["classify.unknown-unit"] ?? 0;
    await classify({ node: { __typename: "BrandNewUnit" } });
    await classify({ node: { __typename: "StoriesTrayFeedUnit" } });
    assert.equal(health.counters["classify.unknown-unit"], before + 1);
  });

  test("sponsored-data: SponsoredData under th_dat_spo", async () => {
    assert.deepEqual(await verdict(buildEdge(STORIES.sponsoredThDatSpo(), { enc: CATEGORY.SPONSORED })), { keep: false, reason: "sponsored-data", category: null });
  });

  test("sponsored-data: under any key, at any depth inside the story", async () => {
    assert.equal(await reasonOf(buildEdge(STORIES.sponsoredRandomKey())), "sponsored-data");
    const deep = story();
    deep.comet_sections.context_layout.story.comet_sections.actor_photo.story.zz = nest({ __typename: "SponsoredData" }, 10);
    assert.equal(await reasonOf(buildEdge(deep)), "sponsored-data");
  });

  test("sponsored-data: node.sponsored_data set, whatever its shape", async () => {
    assert.equal(await reasonOf(buildEdge({ ...story(), sponsored_data: { ad_id: "1" } })), "sponsored-data");
    assert.equal(await reasonOf(buildEdge({ ...story(), sponsored_data: null })), "keep");
  });

  test("sponsored-data: an aliased sponsored_data (th_dat_spo, daspo_sto) set without a typename", async () => {
    // Real 2026-10 ad shape: only the top-level copy carries __typename "SponsoredData"; with it missing (or
    // obfuscated and no Env table) the alias being non-null is the signal. Organic stories send null.
    for (const key of ["th_dat_spo", "daspo_sto"]) {
      const s = story();
      s[key] = { ad_id: "6012", lbl_adv_iden: "6012", client_token: "fxct" };
      assert.equal(await reasonOf(buildEdge(s)), "sponsored-data", key);
    }
    assert.equal(await reasonOf(buildEdge({ ...story(), th_dat_spo: null, daspo_sto: null })), "keep");
  });

  test("sponsored-data wins over the category (decision order)", async () => {
    assert.equal(await reasonOf(buildEdge(STORIES.sponsoredThDatSpo(), { enc: CATEGORY.SPONSORED })), "sponsored-data");
  });

  test("category:SPONSORED decoded from cat_sensitive.enc (real double SHA-256)", async () => {
    const edge = buildEdge(STORIES.sponsoredCategory(), { enc: CATEGORY.SPONSORED });
    assert.equal(edge.cat_sensitive.cat, null);
    assert.equal(edge.cat_sensitive.enc, sha256Hex(sha256Hex("9100000012") + "5"));
    assert.deepEqual(await verdict(edge), { keep: false, reason: "category:SPONSORED", category: "SPONSORED" });
  });

  test("every FeedStoryCategory number decodes to its name", async () => {
    for (const [name, n] of Object.entries(CATEGORY_NUMBERS)) {
      const v = await verdict(buildEdge(story(), { enc: n }));
      assert.equal(v.category, name);
      assert.equal(v.keep, name === "ORGANIC" || name === "ENGAGEMENT", name);
      if (!v.keep) assert.equal(v.reason, `category:${name}`);
    }
  });

  test("enc is compared case-insensitively", async () => {
    const edge = buildEdge(story(), { enc: CATEGORY.SPONSORED });
    edge.cat_sensitive.enc = edge.cat_sensitive.enc.toUpperCase();
    assert.equal(await reasonOf(edge), "category:SPONSORED");
  });

  test("category from cat_sensitive.cat, plain edge.category and category_sensitive", async () => {
    assert.equal(await reasonOf(buildEdge(story(), { category: "SPONSORED", enc: null })), "category:SPONSORED");
    assert.equal(await reasonOf(buildEdge(story(), { category: "FB_SHORTS", enc: null })), "category:FB_SHORTS");
    assert.equal(await reasonOf(buildEdge(story(), { plainCategory: "PROMOTION" })), "category:PROMOTION");
    const legacy = buildEdge(story(), { enc: null });
    legacy.category_sensitive = legacy.cat_sensitive;
    delete legacy.cat_sensitive;
    legacy.category_sensitive.cat = "TRENDING";
    assert.equal(await reasonOf(legacy), "category:TRENDING");
  });

  test("unknown category names and UNKNOWN / FIXED_POSITION are dropped", async () => {
    assert.equal(await reasonOf(buildEdge(story(), { category: "MYSTERY_NEW", enc: null })), "category:MYSTERY_NEW");
    assert.equal(await reasonOf(buildEdge(story(), { plainCategory: "UNKNOWN" })), "category:UNKNOWN");
    assert.equal(await reasonOf(buildEdge(story(), { enc: CATEGORY_NUMBERS.FIXED_POSITION })), "category:FIXED_POSITION");
  });

  test("sponsored-label: CometStorySponsoredLabelStrategy in the story", async () => {
    assert.deepEqual(await verdict(buildEdge(STORIES.sponsoredLabel())), { keep: false, reason: "sponsored-label", category: "ORGANIC" });
  });

  test("auction-distance: non-null under every known alias", async () => {
    for (const key of ["sponsored_auction_distance", "the_disan_sonsore_auctigo", "new_sponsorw_distn_aucton_of", "sposnsor_new_distac_action"]) {
      const edge = buildEdge(story());
      edge[key] = 0;
      assert.equal(await reasonOf(edge), "auction-distance", key);
    }
    assert.equal(await reasonOf(buildEdge(story(), { auction: null })), "keep");
  });

  test("unconnected: unconnected_waist_data set (any shape)", async () => {
    assert.equal(await reasonOf(buildEdge(STORIES.unconnected())), "unconnected");
    const s = story();
    s.comet_sections.context_layout.story.unconnected_waist_data = "{}";
    assert.equal(await reasonOf(buildEdge(s)), "unconnected");
  });

  test("recommended: recommendation_context in the title", async () => {
    assert.equal(await reasonOf(buildEdge(STORIES.recommended())), "recommended");
    assert.equal(await reasonOf(buildEdge(story({ recommended: true }))), "recommended");
  });

  test("follow-suggestion: CometFeedStoryFollowButtonStrategy in the title", async () => {
    assert.equal(await reasonOf(buildEdge(STORIES.followSuggestion())), "follow-suggestion");
  });

  test("join-suggestion: GroupJoinForumAction with CAN_JOIN in the title", async () => {
    assert.equal(await reasonOf(buildEdge(STORIES.joinSuggestion())), "join-suggestion");
  });

  test("ai: only when hideAI is on", async () => {
    const edge = buildEdge(STORIES.aiLabel());
    assert.equal(await reasonOf(edge), "keep");
    assert.deepEqual(await verdict(edge, { hideAI: true }), { keep: false, reason: "ai", category: "ORGANIC" });
  });

  test("an AI section that does not claim AI is not a label", async () => {
    const s = STORIES.aiLabel();
    const label = s.comet_sections.context_layout.story.comet_sections.metadata.find((m) => m.__typename === "CometFeedStoryGenAIContentTransparencyStrategy");
    label.was_detected_as_ai_generated = false;
    label.ai_generated_detected_info = { gen_ai_transparency_type: null };
    assert.equal(await reasonOf(buildEdge(s), { hideAI: true }), "keep");
    label.was_self_disclosed_as_ai_generated = true;
    assert.equal(await reasonOf(buildEdge(s), { hideAI: true }), "ai");
  });
});

describe("keep paths", () => {
  test("ORGANIC decoded from enc", async () => {
    assert.deepEqual(await verdict(buildEdge(story())), { keep: true, reason: "keep", category: "ORGANIC" });
  });

  test("ENGAGEMENT is kept (cat and enc)", async () => {
    assert.deepEqual(await verdict(buildEdge(story(), { enc: CATEGORY.ENGAGEMENT })), { keep: true, reason: "keep", category: "ENGAGEMENT" });
    assert.equal(await reasonOf(buildEdge(story(), { category: "ENGAGEMENT", enc: null })), "keep");
  });

  test("an enc that matches no category is UNDECODABLE and kept", async () => {
    const edge = buildEdge(story());
    edge.cat_sensitive.enc = "ab".repeat(32);
    assert.deepEqual(await verdict(edge), { keep: true, reason: "keep", category: "UNDECODABLE" });
  });

  test("enc without a post_id is UNDECODABLE and kept", async () => {
    const edge = buildEdge(story());
    delete edge.node.post_id;
    assert.equal((await verdict(edge)).category, "UNDECODABLE");
  });

  test("no category at all (null) is kept", async () => {
    const edge = buildEdge(story(), { enc: null });
    assert.deepEqual(await verdict(edge), { keep: true, reason: "keep", category: null });
    delete edge.cat_sensitive;
    assert.deepEqual(await verdict(edge), { keep: true, reason: "keep", category: null });
    edge.cat_sensitive = { enc: "", cat: "" };
    assert.equal((await verdict(edge)).category, null);
  });

  test("an empty plain category counts as no category, like an empty cat", async () => {
    const edge = buildEdge(story(), { plainCategory: "ORGANIC" });
    edge.category = "";
    assert.deepEqual(await verdict(edge), { keep: true, reason: "keep", category: null });
    edge.cat_sensitive = { enc: categoryHash("9200000001", CATEGORY.SPONSORED), cat: null };
    assert.equal(await reasonOf(edge), "category:SPONSORED", "falls through to cat_sensitive");
  });

  test("decode outcomes are counted for the health panel", async () => {
    const decoded = health.counters["classify.enc.decoded"] ?? 0;
    const undecodable = health.counters["classify.enc.undecodable"] ?? 0;
    const kept = health.counters["classify.keep"] ?? 0;
    await classify(buildEdge(story()));
    const bad = buildEdge(story());
    bad.cat_sensitive.enc = "00".repeat(32);
    await classify(bad);
    assert.equal(health.counters["classify.enc.decoded"], decoded + 1);
    assert.equal(health.counters["classify.enc.undecodable"], undecodable + 1);
    assert.equal(health.counters["classify.keep"], kept + 2);
  });

  test("a Join action for a group the viewer is in is not a suggestion", async () => {
    const s = STORIES.joinSuggestion();
    s.comet_sections.context_layout.story.comet_sections.title.if_viewer_can_join_group.join_action.group.viewer_forum_join_state = "MEMBER";
    assert.equal(await reasonOf(buildEdge(s)), "keep");
  });

  test("a Follow button outside the title section does not count while the title exists", async () => {
    const s = story();
    s.comet_sections.content.story.follow_button = { __typename: "CometFeedStoryFollowButtonStrategy" };
    assert.equal(await reasonOf(buildEdge(s)), "keep");
  });

  test("when the title section moved, the whole story is searched for suggestion markers", async () => {
    const s = STORIES.followSuggestion();
    const title = s.comet_sections.context_layout.story.comet_sections.title;
    delete s.comet_sections.context_layout.story.comet_sections.title;
    s.comet_sections.header_v2 = { title };
    assert.equal(await reasonOf(buildEdge(s)), "follow-suggestion");
  });
});

describe("what never counts as a marker", () => {
  test("a friend's share of a Page post with Follow button, ranking data and an ad label is kept", async () => {
    const edge = edgesOf("shared-story.jsonl")[0];
    assert.ok(JSON.stringify(edge.node.attached_story).includes("CometFeedStoryFollowButtonStrategy"));
    assert.deepEqual(await verdict(edge), { keep: true, reason: "keep", category: "ORGANIC" });
  });

  test("SponsoredData inside any attached_story subtree is ignored", async () => {
    const s = story();
    s.attached_story = { id: "x", th_dat_spo: { __typename: "SponsoredData" } };
    s.comet_sections.content.story.attached_story = { sponsored: { __typename: "SponsoredData" } };
    s.comet_sections.content.story.comet_sections.attached_story = { story: { attached_story: { th_dat_spo: { __typename: "SponsoredData" } } } };
    assert.equal(await reasonOf(buildEdge(s)), "keep");
  });

  test("GHLMocked decoys and ghl_* fields are never signals", async () => {
    const node = nodeOf("organic-friend-text.jsonl");
    const text = JSON.stringify(node);
    assert.ok(text.includes("GHLMocked") && text.includes("ghl_mocked_sponsored_data") && text.includes("CometStorySponsoredLabelStrategy"));
    assert.deepEqual(await verdict(edgesOf("organic-friend-text.jsonl")[0]), { keep: true, reason: "keep", category: "ORGANIC" });
  });

  test("markers inside a nested {node, cursor} edge are ignored", async () => {
    const s = story();
    s.comet_sections.content.story.related = { edges: [{ node: { th_dat_spo: { __typename: "SponsoredData" } }, cursor: "x" }] };
    assert.equal(await reasonOf(buildEdge(s)), "keep");
  });

  test("the search is bounded to depth 40", async () => {
    const shallow = story();
    shallow.extra = nest({ __typename: "SponsoredData" }, 38);
    assert.equal(await reasonOf(buildEdge(shallow)), "sponsored-data");
    const deep = story();
    deep.extra = nest({ __typename: "SponsoredData" }, 45);
    assert.equal(await reasonOf(buildEdge(deep)), "keep");
  });

  test("is_ad_eligible_for_ad_pod is eligibility, not adness", async () => {
    const edge = buildEdge(story());
    edge.is_ad_eligible_for_ad_pod = true;
    assert.equal(await reasonOf(edge), "keep");
  });

  test("unexplained ad-looking edge keys are counted, not acted on", async () => {
    const edge = buildEdge(story());
    edge.spon_new_auct_x = 7;
    const before = health.counters["classify.suspect-key:spon_new_auct_x"] ?? 0;
    assert.equal(await reasonOf(edge), "keep");
    assert.equal(health.counters["classify.suspect-key:spon_new_auct_x"], before + 1);
  });
});

describe("sha256Hex injection and failure", () => {
  test("uses the injected hash function", async () => {
    const calls = [];
    const fake = async (s) => {
      calls.push(s);
      return sha256Hex(s);
    };
    const v = await createClassifier({ sha256Hex: fake }).classify(buildEdge(story(), { enc: CATEGORY.SPONSORED }));
    assert.equal(v.reason, "category:SPONSORED");
    assert.deepEqual(calls, ["9200000001", sha256Hex("9200000001") + "5"], "seed, then SPONSORED tried first");
  });

  test("an injected hash function returning uppercase hex still decodes (seed included)", async () => {
    const upper = async (s) => sha256Hex(s).toUpperCase();
    const v = await createClassifier({ sha256Hex: upper }).classify(buildEdge(story(), { enc: CATEGORY.SPONSORED }));
    assert.equal(v.reason, "category:SPONSORED");
  });

  test("a hash function that fails leaves the edge UNDECODABLE and kept", async () => {
    const failing = async () => {
      throw new Error("no crypto");
    };
    const v = await createClassifier({ sha256Hex: failing }).classify(buildEdge(story(), { enc: CATEGORY.SPONSORED }));
    assert.deepEqual(v, { keep: true, reason: "keep", category: "UNDECODABLE" });
  });

  test("an unexpected exception fails open (kept, reason error)", async () => {
    const node = story();
    Object.defineProperty(node, "comet_sections", {
      enumerable: true,
      get() {
        throw new Error("boom");
      },
    });
    assert.deepEqual(await verdict({ node, cursor: "c" }), { keep: true, reason: "error", category: null });
  });
});

describe("categoryHash fixture helper agrees with the classifier", () => {
  test("ORGANIC hash decodes as ORGANIC", async () => {
    const edge = buildEdge(story({ postId: "123" }), { enc: null });
    edge.cat_sensitive.enc = categoryHash("123", 1);
    assert.equal((await verdict(edge)).category, "ORGANIC");
  });
});
