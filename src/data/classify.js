// Feed edge classifier: KEEP friends' / groups' / pages' posts, DROP ads, suggestions and non-post units.
// Order and rules: ARCHITECTURE §3.3, graphql-protocol §6.4. Markers inside a shared post (attached_story)
// never count, and *GHLMocked* / ghl_* decoys are never signals (findInStory skips both).

import { health } from "../shared/util.js";
import { findInStory, isAiLabel } from "./extract.js";

/** FeedStoryCategory enum (Facebook source, verified 2025-10 and live 2026-10-21). */
export const CATEGORY_NUMBERS = Object.freeze({
  UNKNOWN: 0,
  ORGANIC: 1,
  ENGAGEMENT: 2,
  FIXED_POSITION: 3,
  PROMOTION: 4,
  SPONSORED: 5,
  END_OF_FEED_CONTENT: 6,
  FB_STORIES: 7,
  HIGH_VALUE_PROMOTION: 8,
  FB_STORIES_ENGAGEMENT: 9,
  SHOWCASE: 10,
  FB_SHORTS: 11,
  TRENDING: 12,
  ENGAGEMENT_QP: 13,
  MULTI_FB_STORIES_TRAY: 14,
  END_OF_FEED_REELS: 15,
  FB_SHORTS_FALLBACK: 16,
  FRIENDLY_FEED_MID_CARD: 17,
  FRIENDLY_FEED_PROMOTION: 18,
  INJECTED_STORY: 19,
  LIMITED_PERSONALIZATION_NOTICE: 20,
});

/** Drop reasons in decision order. "unit" and "category" carry a suffix: "unit:<typename>", "category:<NAME>". */
export const REASONS = Object.freeze([
  "no-node",
  "unit",
  "sponsored-data",
  "category",
  "sponsored-label",
  "auction-distance",
  "unconnected",
  "recommended",
  "follow-suggestion",
  "join-suggestion",
  "ai",
]);

/** Feed units that are not posts (all dropped as "unit:<typename>"; anything else not "Story" is counted as unknown). */
export const NON_STORY_UNITS = new Set([
  "PaginatedPeopleYouMayKnowFeedUnit",
  "FriendRequestsFeedUnit",
  "GroupsYouShouldJoinFeedUnit",
  "GroupsMultiGYSJStoryUnit",
  "GroupRelatedGroupsFeedUnit",
  "GroupsTabCategoriesUnit",
  "PagesYouMayLikeFeedUnit",
  "StoriesTrayFeedUnit",
  "StoriesSingleBucketInlineViewerFeedUnit",
  "ShowcaseFeedUnit",
  "FBShortsMidCardFeedUnit",
  "XFBDummyReelsInWatchIFU",
  "QuickPromotionFeedUnit",
  "QuickPromotionNativeTemplateFeedUnit",
  "EndOfFeedUpsellFeedUnit",
  "CommunityTabTrendingPOGFeedUnit",
  "GoodwillCometStory",
  "CustomizedStory",
  "MarketplaceFeedAdStory",
  "AdsSideFeedUnit",
]);

const KEPT_CATEGORIES = new Set(["ORGANIC", "ENGAGEMENT", "UNDECODABLE"]);
// The likeliest answers first: an organic story decodes after three hashes, an ad after two.
const LIKELY = ["SPONSORED", "ORGANIC", "ENGAGEMENT"];
const DECODE_ORDER = [...LIKELY, ...Object.keys(CATEGORY_NUMBERS).filter((name) => !LIKELY.includes(name))];
// Story.sponsored_data under every alias seen (graphql-protocol §6.3; null on organic stories). Only the
// top-level copy is sure to carry __typename "SponsoredData", and only when typenames are not obfuscated.
const SPONSORED_DATA_KEYS = ["sponsored_data", "daspo_sto", "th_dat_spo"];
// edge.sponsored_auction_distance under every alias seen (null on organic edges).
const AUCTION_KEYS =["sponsored_auction_distance", "the_disan_sonsore_auctigo", "new_sponsorw_distn_aucton_of", "sposnsor_new_distac_action"];
const SUSPECT_KEY = /spo|spn|auct|adv/i;

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);

/** Lowercase hex SHA-256 of a string, via WebCrypto. */
export async function webCryptoSha256Hex(text) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * classify(edge) -> {keep, reason, category}. reason is "keep" for kept edges (or "error" when an
 * unexpected exception made it fail open); category is the edge's FeedStoryCategory name when it was
 * read ("UNDECODABLE" when an enc hash matched nothing), else null.
 */
export function createClassifier({ sha256Hex = webCryptoSha256Hex, hideAI = false } = {}) {
  async function edgeCategory(edge) {
    if (nonEmpty(edge.category)) return edge.category;
    const sensitive = [edge.cat_sensitive, edge.category_sensitive].find(isObj);
    if (!sensitive) return null;
    if (nonEmpty(sensitive.cat)) return sensitive.cat;
    if (!nonEmpty(sensitive.enc)) return null;
    const name = await decodeCategory(sensitive.enc.toLowerCase(), edge.node.post_id);
    health.count(name ? "classify.enc.decoded" : "classify.enc.undecodable");
    return name ?? "UNDECODABLE";
  }

  // enc == sha256hex(sha256hex(post_id) + n), n the category number (GHLFeedStoryCategoryObfuscationUtils).
  async function decodeCategory(enc, postId) {
    if (postId == null || postId === "") return null;
    const hex = async (s) => String(await sha256Hex(s)).toLowerCase();
    try {
      const seed = await hex(String(postId));
      for (const name of DECODE_ORDER) {
        if ((await hex(seed + CATEGORY_NUMBERS[name])) === enc) return name;
      }
    } catch (err) {
      health.error("classify.sha256", err);
    }
    return null;
  }

  async function decide(edge) {
    const node = edge?.node;
    if (!isObj(node)) return drop("no-node");
    if (node.__typename !== "Story") {
      const typename = node.__typename ?? "unknown";
      if (!NON_STORY_UNITS.has(typename)) health.count("classify.unknown-unit");
      return drop(`unit:${typename}`);
    }
    const signals = scanStory(node);
    if (signals.sponsoredData || node.sponsored_data != null) return drop("sponsored-data");
    const category = await edgeCategory(edge);
    if (category != null && !KEPT_CATEGORIES.has(category)) return drop(`category:${category}`, category);
    if (signals.sponsoredLabel) return drop("sponsored-label", category);
    if (AUCTION_KEYS.some((key) => edge[key] != null)) return drop("auction-distance", category);
    noteSuspectKeys(edge);
    if (signals.unconnected) return drop("unconnected", category);
    const suggestion = suggestionReason(node);
    if (suggestion) return drop(suggestion, category);
    if (hideAI && signals.ai) return drop("ai", category);
    return { keep: true, reason: "keep", category };
  }

  async function classify(edge) {
    let verdict;
    try {
      verdict = await decide(edge);
    } catch (err) {
      health.error("classify", err);
      verdict = { keep: true, reason: "error", category: null };
    }
    health.count(`classify.${verdict.reason}`);
    return verdict;
  }

  return { classify };
}

const drop = (reason, category = null) => ({ keep: false, reason, category });

/** One bounded walk over the story (attached_story and decoys excluded) collecting every whole-story marker. */
function scanStory(node) {
  const signals = { sponsoredData: false, sponsoredLabel: false, unconnected: false, ai: false };
  findInStory(node, (o) => {
    if (o.__typename === "SponsoredData") signals.sponsoredData = true;
    if (o.__typename === "CometStorySponsoredLabelStrategy") signals.sponsoredLabel = true;
    if (o.unconnected_waist_data != null) signals.unconnected = true;
    if (isAiLabel(o)) signals.ai = true;
    return false;
  });
  return signals;
}

/**
 * Suggestion markers live in the header's title section (next to the author's name); elsewhere in a story
 * a Follow or Join button means something else. When Facebook moves the title, the whole story is searched.
 */
function suggestionReason(node) {
  const title = node.comet_sections?.context_layout?.story?.comet_sections?.title;
  const scope = isObj(title) ? title : node;
  if (findInStory(scope, (o) => o.recommendation_context != null)) return "recommended";
  if (findInStory(scope, (o) => o.__typename === "CometFeedStoryFollowButtonStrategy")) return "follow-suggestion";
  if (findInStory(scope, (o) => o.__typename === "GroupJoinForumAction" && o.group?.viewer_forum_join_state === "CAN_JOIN")) return "join-suggestion";
  return null;
}

/** Counts non-null edge keys that look like a new ad-field alias, so diagnostics can surface them. */
function noteSuspectKeys(edge) {
  for (const [key, value] of Object.entries(edge)) {
    if (value != null && SUSPECT_KEY.test(key) && !AUCTION_KEYS.includes(key)) health.count(`classify.suspect-key:${key}`);
  }
}
