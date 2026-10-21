import { test } from "node:test";
import assert from "node:assert/strict";
import { tnCode, isAdInfoHref, isAdsAboutHref, reelIds, isFeedRoute, chooseVerdict, isNearBottom, REASONS, BOTTOM_GUARD_PX } from "../../../src/fb/cleaner.js";
import { DEFAULTS, sanitize } from "../../../src/shared/settings.js";

const settings = (patch = {}) => sanitize({ ...structuredClone(DEFAULTS), ...patch });

test("tnCode decodes the __tn__ tracking code", () => {
  assert.equal(tnCode("?__cft__[0]=AZ&__tn__=%2CO%2CP-R#?efh"), ",O,P-R");
  assert.equal(tnCode("https://www.facebook.com/x?__cft__[0]=AZ&__tn__=%3C%3C%2CP-R"), "<<,P-R");
  assert.equal(tnCode("?__cft__[0]=AZ"), null);
  assert.equal(tnCode("?__tn__=%E0%A4%A"), "%E0%A4%A", "malformed escapes come back raw");
  assert.equal(tnCode(undefined), null);
});

test("isAdInfoHref: query-only __cft__ link without __tn__", () => {
  assert.ok(isAdInfoHref("?__cft__[0]=AZhvx7SjeDAgkZ73"));
  assert.equal(isAdInfoHref("?__cft__[0]=AZ&__tn__=%2CO%2CP-R"), false, "organic timestamp");
  assert.equal(isAdInfoHref("https://www.facebook.com/?__cft__[0]=AZ"), false, "not query-only");
  assert.equal(isAdInfoHref("?fbid=1"), false);
  assert.equal(isAdInfoHref("#"), false);
  assert.equal(isAdInfoHref(null), false);
});

test("isAdsAboutHref: direct and l.php-wrapped /ads/about only", () => {
  assert.ok(isAdsAboutHref("/ads/about/?entry_product=ad_preferences"));
  assert.ok(isAdsAboutHref("https://www.facebook.com/ads/about"));
  assert.ok(isAdsAboutHref("https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.facebook.com%2Fads%2Fabout%2F&h=AT0"));
  assert.equal(isAdsAboutHref("/ads/preferences/"), false);
  assert.equal(isAdsAboutHref("/ads/aboutness"), false);
  assert.equal(isAdsAboutHref("https://evil.example/ads/about"), false);
  assert.equal(isAdsAboutHref("https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com%2F"), false);
  assert.equal(isAdsAboutHref("http://[bad"), false);
});

test("reelIds counts distinct reels", () => {
  assert.deepEqual([...reelIds(["/reel/1/", "https://www.facebook.com/reel/1/?s=x", "/reel/22", "/photo/?fbid=3", null])], ["1", "22"]);
});

test("isFeedRoute: home, feeds filters and the groups feed only", () => {
  assert.ok(isFeedRoute({ mode: "home" }));
  assert.ok(isFeedRoute({ mode: "groups-feed" }));
  assert.equal(isFeedRoute({ mode: "page" }), false);
  assert.ok(isFeedRoute({ path: "/" }));
  assert.ok(isFeedRoute({ path: "/groups/feed/" }));
  assert.equal(isFeedRoute({ path: "/groups/123/" }), false);
  assert.ok(isFeedRoute(null, { pathname: "/home.php" }));
  assert.equal(isFeedRoute(undefined, { pathname: "/search/posts" }), false);
});

test("chooseVerdict follows hit order, settings and route gating", () => {
  const hits = [
    { reason: "sponsored", signal: "ad-label" },
    { reason: "suggested", signal: "follow", gated: true },
  ];
  assert.equal(chooseVerdict(hits, settings(), true).reason, "sponsored");
  const noAds = settings({ clean: { sponsored: false } });
  assert.equal(chooseVerdict(hits, noAds, true).reason, "suggested");
  assert.equal(chooseVerdict(hits, noAds, false), null, "Follow means nothing in a group you belong to");
  assert.equal(chooseVerdict([], settings(), true), null);
  assert.equal(chooseVerdict(null, settings(), true), null);
  assert.equal(chooseVerdict([{ reason: "unknown", signal: "x" }], settings(), true), null);
});

test("every clean.* setting (and feed.hideAI) switches a hide reason", () => {
  const reasonFor = { sponsored: "sponsored", suggested: "suggested", peopleYouMayKnow: "pymk", reels: "reels", stories: "stories", groupSuggestions: "group-suggestions", memories: "memories", metaAI: "meta-ai" };
  assert.deepEqual(Object.keys(reasonFor).sort(), Object.keys(DEFAULTS.clean).sort());
  for (const [key, reason] of Object.entries(reasonFor)) {
    assert.ok(REASONS.includes(reason));
    const hit = [{ reason, signal: "t" }];
    assert.ok(chooseVerdict(hit, settings({ clean: { [key]: true } }), true), `${key} on`);
    assert.equal(chooseVerdict(hit, settings({ clean: { [key]: false } }), true), null, `${key} off`);
  }
  const ai = [{ reason: "ai", signal: "label" }];
  assert.equal(chooseVerdict(ai, settings(), true), null, "AI posts stay unless feed.hideAI");
  assert.ok(chooseVerdict(ai, settings({ feed: { hideAI: true } }), true));
});

test("isNearBottom guards the last 1200px of the document", () => {
  assert.equal(BOTTOM_GUARD_PX, 1200);
  assert.ok(isNearBottom(1000, 2000));
  assert.ok(isNearBottom(2000, 2000));
  assert.equal(isNearBottom(800, 2000), false);
  assert.equal(isNearBottom(800, 2000, 1300), true);
});
