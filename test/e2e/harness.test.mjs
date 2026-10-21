// Self-tests of the fake facebook.com harness: world data, SSR frames, the mock /api/graphql/ (validation,
// paging, mutations, injections, request log) and, in Chromium, the pages, assets, fake Comet runtime and
// both product injection paths (extension content script, userscript GM shim).

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { launchBrowser, ROOT } from "./helpers/browser.mjs";
import { installSite, renderPage, homePage, filterPage, groupsFeedPage, profilePage, sjsBlocks, configFrame, preloaderOf, prefetchedOf, findInFrames, createWorld, SOURCES, FEED_STYLES, pageFor } from "./helpers/site.mjs";
import { createMockGraphql, decodeResponse, ERROR_CODES, CHECKPOINT_URL } from "./helpers/mock-graphql.mjs";
import { userscriptInit } from "./helpers/product.mjs";
import { makeTokens, DOC_IDS, DOSSIER_DOC_IDS, jazoest } from "../fixtures/site/ssr.mjs";
import { catEnc, CATEGORY, TYPENAME_PAIRS, REACTIONS } from "../fixtures/site/graphql-shapes.mjs";
import { decodeCursor } from "../fixtures/site/feed-pages.mjs";
import { sha256hex } from "../fixtures/site/world.mjs";

const SHOTS = path.join(ROOT, "test-results/harness");
mkdirSync(SHOTS, { recursive: true });

/** A request exactly as Facebook's own client forms it (graphql-protocol §2.2, §2.3). */
function gqlRequest({ world, tokens }, op, variables, { form = {}, headers = {}, docId = DOC_IDS[op] } = {}) {
  const body = new URLSearchParams({ av: world.viewer.id, __user: world.viewer.id, __a: "1", __comet_req: "15", fb_dtsg: tokens.dtsg, jazoest: tokens.jazoest, lsd: tokens.lsd, fb_api_caller_class: "RelayModern", fb_api_req_friendly_name: op, variables: JSON.stringify(variables), server_timestamps: "true", doc_id: docId, ...form });
  return { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-fb-friendly-name": op, "x-fb-lsd": tokens.lsd, ...headers }, body: body.toString() };
}

function fixture() {
  const world = createWorld();
  const tokens = makeTokens(world);
  const mock = createMockGraphql({ world, tokens, delayMs: 0 });
  const frames = sjsBlocks(homePage({ world, tokens }));
  const feedVars = preloaderOf(frames, "CometModernHomeFeedQuery").variables;
  return { world, tokens, mock, feedVars };
}

const feedVariables = (base, feedName, cursor = null) => ({ ...base, feedStyle: FEED_STYLES[feedName], orderby: feedName === "top" ? ["TOP_STORIES"] : ["MOST_RECENT"], ...(cursor ? { feedEndCursor: cursor } : {}), scale: 2 });

const edgesOf = (text) => decodeResponse(text).data.viewer.news_feed.edges;

describe("world", () => {
  test("is deterministic and newest-first per source, with unique times", () => {
    const a = createWorld();
    const b = createWorld();
    assert.deepEqual(a.feeds, b.feeds);
    for (const name of [...SOURCES, "all"]) {
      const times = a.feed(name).map((id) => a.story(id).time);
      assert.ok(times.length > 5, `${name} has stories`);
      assert.ok(times.every((t, i) => !i || t < times[i - 1]), `${name} strictly descending`);
    }
    const all = [...a.stories.values()].map((s) => s.time);
    assert.equal(new Set(all).size, all.length);
  });

  test("sources overlap like Facebook's Feeds tabs (dedup work for the merge)", () => {
    const w = createWorld();
    const friends = new Set(w.feed("friends"));
    const groups = new Set(w.feed("groups"));
    assert.ok([...friends].some((id) => groups.has(id)), "a friend's group post is in both feeds");
    assert.ok(w.feed("favorites").every((id) => friends.has(id) || w.feed("pages").includes(id)), "favorites are friends or pages");
    const merged = w.expectedMerged();
    assert.equal(new Set(merged).size, merged.length);
    assert.equal(merged.length, new Set([...w.feed("friends"), ...w.feed("groups"), ...w.feed("pages")]).size);
    assert.ok(w.feed("friends").some((id) => w.story(id).shared), "contains a shared post");
  });

  test("uses `now` for every time, so tests can follow the real clock", () => {
    const w = createWorld({ now: 2000000000 });
    assert.ok(w.expectedMerged().every((id) => w.story(id).time < 2000000000 && w.story(id).time > 2000000000 - 7 * 86400));
  });
});

describe("SSR frames", () => {
  const world = createWorld();
  const tokens = makeTokens(world);

  test("home page carries tokens, user, site data and envjson in 2026 formats", () => {
    const html = homePage({ world, tokens });
    assert.match(html, /^<!DOCTYPE html>\n<html id="facebook" class="_9dls __fb-light-mode" lang="en"/);
    const frames = sjsBlocks(html);
    assert.ok(frames.length >= 8);
    assert.equal(configFrame(frames, "DTSGInitData").token, tokens.dtsg);
    assert.equal(configFrame(frames, "DTSGInitialData").token, tokens.dtsg);
    assert.equal(configFrame(frames, "LSD").token, tokens.lsd);
    assert.equal(configFrame(frames, "CurrentUserInitialData").USER_ID, world.viewer.id);
    assert.equal(configFrame(frames, "SiteData").__spin_r, tokens.rev);
    assert.match(html, /"DTSGInitData",\[\],\{"token":"NAf[^"]+"/, "dossier regex for the token matches");
    assert.match(html, /\{"actorID":"(\d+)","preloaderID":"(adp_[A-Za-z0-9_]+RelayPreloader_[0-9a-f]+)","queryID":"(\d{5,})","variables":/, "fbk preloader regex matches");
    const env = JSON.parse(/<script id="envjson" type="application\/json"[^>]*>([^<]*)<\/script>/.exec(html)[1]);
    assert.deepEqual(env.q9k7m2x, TYPENAME_PAIRS.map((p) => [...p]));
    assert.equal(jazoest(tokens.dtsg), tokens.jazoest);
  });

  test("feed preloader has the full variable set and the route's feedStyle", () => {
    const home = preloaderOf(sjsBlocks(homePage({ world, tokens })), "CometModernHomeFeedQuery");
    assert.match(home.preloaderID, /^adp_CometModernHomeFeedQueryRelayPreloader_[0-9a-f]{19}$/);
    assert.equal(home.queryID, DOC_IDS.CometModernHomeFeedQuery);
    assert.equal(home.variables.feedStyle, "DEFAULT");
    assert.deepEqual(home.variables.orderby, ["TOP_STORIES"]);
    assert.ok(Object.keys(home.variables).filter((k) => k.startsWith("__relay_internal__pv__")).length >= 30);
    const friends = preloaderOf(sjsBlocks(filterPage({ world, tokens, filter: "friends" })), "CometModernHomeFeedQuery");
    assert.equal(friends.variables.feedStyle, "MOST_RECENT_FRIENDS_FEED");
    assert.deepEqual(friends.variables.orderby, ["MOST_RECENT"]);
    const ep = findInFrames(sjsBlocks(filterPage({ world, tokens, filter: "groups" })), (v) => Array.isArray(v) && v[0] === "CometRootEntryPointRenderer")[0];
    assert.equal(ep[3][0].entryPointRoot.otherProps.routeProps.feedStyle, 18);
    const mostRecent = preloaderOf(sjsBlocks(renderPage("home", { world, tokens, feed: "all" }).html), "CometModernHomeFeedQuery");
    assert.equal(mostRecent.variables.feedStyle, "MOST_RECENT_FEED_DEFAULT");
  });

  test("prefetched stream frames stitch into page 1 of the route's feed, with junk", () => {
    for (const [html, feedName] of [[homePage({ world, tokens }), "top"], [filterPage({ world, tokens, filter: "friends" }), "friends"]]) {
      const frames = sjsBlocks(html);
      const pre = preloaderOf(frames, "CometModernHomeFeedQuery");
      const payloads = prefetchedOf(frames, pre.preloaderID);
      assert.ok(payloads.length >= 4);
      const text = payloads.map((p) => JSON.stringify(p)).join("\n");
      const { data, final } = decodeResponse(text);
      assert.ok(final);
      const edges = data.viewer.news_feed.edges;
      const organic = edges.filter((e) => e.node?.__typename === "Story" && !e.node.th_dat_spo).map((e) => e.node.post_id);
      assert.deepEqual(organic.filter((id) => world.story(id)), world.feed(feedName).slice(0, 4));
      assert.ok(edges.length > 4, "junk is injected");
      assert.equal(data.viewer.news_feed.page_info.has_next_page, true);
      assert.equal(decodeCursor(data.viewer.news_feed.page_info.end_cursor).feedName, feedName);
    }
  });

  test("groups feed, profile and Polish pages render", () => {
    assert.match(groupsFeedPage({ world, tokens }), /role="feed"/);
    assert.match(profilePage({ world, tokens, vanity: world.friends[0].vanity }), new RegExp(world.friends[0].name));
    const pl = homePage({ locale: "pl" });
    assert.match(pl, /lang="pl"/);
    assert.match(pl, /aria-label="Skróty"/);
    assert.match(pl, /Posty w Aktualnościach/);
    assert.equal(configFrame(sjsBlocks(pl), "IntlCurrentLocale").code, "pl_PL");
  });

  test("route table maps URLs to page kinds", () => {
    const w = createWorld();
    assert.equal(pageFor("https://www.facebook.com/", w).kind, "home");
    assert.deepEqual(pageFor("https://www.facebook.com/?filter=groups&sk=h_chr", w), { kind: "feeds", opts: { filter: "groups" } });
    assert.deepEqual(pageFor("https://www.facebook.com/?sk=h_chr", w), { kind: "home", opts: { feed: "all" } });
    assert.equal(pageFor("https://www.facebook.com/groups/feed/", w).kind, "groups-feed");
    assert.equal(pageFor(`https://www.facebook.com/${w.friends[2].vanity}`, w).kind, "profile");
    assert.equal(pageFor("https://www.facebook.com/me/", w).redirect, w.viewer.url);
    assert.equal(pageFor("https://www.facebook.com/messages/t/1/", w).kind, "page");
    assert.equal(pageFor(`https://www.facebook.com/profile.php?id=${w.friends[1].id}`, w).opts.vanity, w.friends[1].vanity);
    assert.deepEqual(pageFor("https://www.facebook.com/favicon.ico", w), { notFound: true });
    assert.equal(pageFor("https://www.facebook.com/api/graphql/", w), null);
  });
});

describe("mock /api/graphql/", () => {
  test("answers JSON lines: root edge, $stream$ edges, $defer$ page_info", () => {
    const { mock, feedVars, world } = fixture();
    const res = mock.respond(gqlRequest(mock, "CometModernHomeFeedQuery", feedVariables(feedVars, "friends")));
    assert.equal(res.status, 200);
    const lines = res.body.split("\r\n").map((l) => JSON.parse(l));
    assert.ok("data" in lines[0] && !("label" in lines[0]));
    assert.equal(lines[1].label, "CometNewsFeed_viewerConnection$stream$CometNewsFeed_viewer_news_feed");
    assert.deepEqual(lines[1].path, ["viewer", "news_feed", "edges", 1]);
    assert.equal(lines.at(-1).label, "CometNewsFeed_viewerConnection$defer$CometNewsFeed_viewer_news_feed$page_info");
    assert.equal(lines.at(-1).extensions.is_final, true);
    const entry = mock.log.at(-1);
    assert.equal(entry.valid, true, entry.problems.join("; "));
    assert.deepEqual(entry.organic, world.feed("friends").slice(0, 4));
  });

  test("pages through every feedStyle to the end without duplicates", () => {
    const { mock, feedVars, world } = fixture();
    for (const name of [...SOURCES, "all", "top"]) {
      const seen = [];
      let cursor = null;
      for (let guard = 0; guard < 40; guard++) {
        const text = mock.respond(gqlRequest(mock, "CometModernHomeFeedQuery", feedVariables(feedVars, name, cursor))).body;
        const { data } = decodeResponse(text);
        const feed = data.viewer.news_feed;
        seen.push(...feed.edges.filter((e) => world.story(e.node?.post_id)).map((e) => e.node.post_id));
        if (!feed.page_info.has_next_page) break;
        cursor = feed.page_info.end_cursor;
      }
      assert.deepEqual(seen, world.feed(name), `${name} served completely in order`);
    }
    assert.equal(mock.invalid().length, 0);
  });

  test("injects every junk kind with the 2026 markers", () => {
    const { mock, feedVars } = fixture();
    const edges = [];
    let cursor = null;
    for (let i = 0; i < 8; i++) {
      const { data } = decodeResponse(mock.respond(gqlRequest(mock, "CometModernHomeFeedQuery", feedVariables(feedVars, "groups", cursor))).body);
      edges.push(...data.viewer.news_feed.edges);
      cursor = data.viewer.news_feed.page_info.end_cursor;
    }
    const typenames = new Set(edges.map((e) => e.node?.__typename ?? "null"));
    for (const t of ["Story", "ShowcaseFeedUnit", "PaginatedPeopleYouMayKnowFeedUnit", "null"]) assert.ok(typenames.has(t), `has ${t}`);
    const sponsoredData = edges.filter((e) => e.node?.th_dat_spo);
    assert.ok(sponsoredData.some((e) => e.node.th_dat_spo.__typename === "SponsoredData"));
    assert.ok(sponsoredData.some((e) => e.node.th_dat_spo.__typename === TYPENAME_PAIRS[1][0]), "obfuscated SponsoredData typename");
    assert.ok(edges.some((e) => e.cat_sensitive?.cat === "SPONSORED"));
    assert.ok(edges.some((e) => e.sposnsor_new_distac_action != null));
    const organic = edges.filter((e) => e.node?.__typename === "Story" && !e.node.th_dat_spo && e.cat_sensitive.enc === catEnc(e.node.post_id, CATEGORY.ORGANIC));
    assert.ok(organic.length > 10, "organic edges carry the decodable ORGANIC hash");
    assert.equal(organic[0].cat_sensitive.enc, sha256hex(sha256hex(organic[0].node.post_id) + "1"));
    const json = JSON.stringify(edges);
    for (const marker of ["CometFeedStoryFollowButtonStrategy", "GroupJoinForumAction", "ExploreRecommendationContext", "unconnected_waist_data\":{", "CometStorySponsoredLabelStrategy", "GHLMocked"]) assert.ok(json.includes(marker), marker);
  });

  test("follows Facebook's story shapes (graphql-protocol §5)", () => {
    const { mock, feedVars, world } = fixture();
    const edges = edgesOf(mock.respond(gqlRequest(mock, "CometModernHomeFeedQuery", feedVariables(feedVars, "friends"))).body);
    const node = edges.find((e) => e.node?.post_id === world.feed("friends")[0]).node;
    const cs = node.comet_sections;
    assert.equal(cs.content.story.comet_sections.message.story.message.text, world.story(node.post_id).text);
    assert.equal(cs.context_layout.story.comet_sections.metadata[0].__typename, "CometFeedStoryLongerTimestampStrategy");
    assert.equal(cs.context_layout.story.comet_sections.metadata[0].story.creation_time, node.creation_time);
    assert.equal(cs.context_layout.story.comet_sections.actor_photo.story.actors[0].profile_picture.scale, 2);
    const ftwc = cs.feedback.story.story_ufi_container.story.feedback_context.feedback_target_with_context;
    assert.equal(ftwc.id, node.feedback.id);
    assert.equal(ftwc.comet_ufi_summary_and_actions_renderer.feedback.adaptive_ufi_action_renderers[0].__typename, "UFIStoryReactActionRenderer");
    const shared = [...world.stories.values()].find((s) => s.shared && world.feed("friends").includes(s.postId));
    assert.ok(shared, "world has a share");
  });

  test("rejects what Facebook rejects", () => {
    const { mock, feedVars } = fixture();
    const vars = feedVariables(feedVars, "friends");
    const code = (req) => JSON.parse(mock.respond(req).body).errors?.[0]?.code ?? null;
    assert.equal(code(gqlRequest(mock, "CometModernHomeFeedQuery", vars, { form: { fb_dtsg: "NAfstale:17:1" } })), ERROR_CODES.TOKEN);
    assert.equal(code(gqlRequest(mock, "CometModernHomeFeedQuery", vars, { docId: "1234" })), ERROR_CODES.STALE_DOC);
    const { __relay_internal__pv__IsWorkUserrelayprovider, ...missingPv } = vars;
    assert.equal(code(gqlRequest(mock, "CometModernHomeFeedQuery", missingPv)), ERROR_CODES.VARIABLES);
    assert.equal(code(gqlRequest(mock, "CometModernHomeFeedQuery", { ...vars, surprise: 1 })), ERROR_CODES.VARIABLES);
    assert.equal(code(gqlRequest(mock, "CometModernHomeFeedQuery", { ...vars, feedStyle: "NOPE" })), ERROR_CODES.VARIABLES);
    const groupsCursor = decodeResponse(mock.respond(gqlRequest(mock, "CometModernHomeFeedQuery", feedVariables(feedVars, "groups"))).body).data.viewer.news_feed.page_info.end_cursor;
    assert.equal(code(gqlRequest(mock, "CometModernHomeFeedQuery", feedVariables(feedVars, "friends", groupsCursor))), ERROR_CODES.FIELD, "cursors are per connection");
    assert.equal(code(gqlRequest(mock, "CometModernHomeFeedQuery", vars, { form: { variables: "{oops" } })), ERROR_CODES.VARIABLES);
    assert.equal(mock.rejected().length, 7);
    assert.equal(mock.invalid().length, 0);
  });

  test("records protocol deviations Facebook would tolerate", () => {
    const { mock, feedVars } = fixture();
    const vars = feedVariables(feedVars, "pages");
    mock.respond(gqlRequest(mock, "CometModernHomeFeedQuery", vars, { headers: { "x-fb-friendly-name": "Other" } }));
    mock.respond(gqlRequest(mock, "CometModernHomeFeedQuery", vars, { headers: { "x-fb-lsd": "nope" } }));
    mock.respond(gqlRequest(mock, "CometModernHomeFeedQuery", { ...vars, orderby: ["TOP_STORIES"] }));
    mock.respond(gqlRequest(mock, "CometModernHomeFeedQuery", vars, { form: { jazoest: "21234" } }));
    const problems = mock.invalid().map((e) => e.problems.join());
    assert.equal(problems.length, 4);
    assert.match(problems[0], /x-fb-friendly-name/);
    assert.match(problems[1], /x-fb-lsd/);
    assert.match(problems[2], /orderby/);
    assert.match(problems[3], /jazoest/);
  });

  test("accepts the dossier's fallback doc_ids unless told not to", () => {
    const { mock, feedVars, world, tokens } = fixture();
    const vars = feedVariables(feedVars, "friends");
    assert.equal(mock.respond(gqlRequest(mock, "CometModernHomeFeedQuery", vars, { docId: DOSSIER_DOC_IDS.CometModernHomeFeedQuery[0] })).entry.errorCode, null);
    const strict = createMockGraphql({ world, tokens, delayMs: 0, acceptDossierDocIds: false });
    assert.equal(strict.respond(gqlRequest(strict, "CometModernHomeFeedQuery", vars, { docId: DOSSIER_DOC_IDS.CometModernHomeFeedQuery[0] })).entry.errorCode, ERROR_CODES.STALE_DOC);
    strict.rotateDocId("CometModernHomeFeedQuery", "39999999999999999");
    assert.equal(strict.respond(gqlRequest(strict, "CometModernHomeFeedQuery", vars)).entry.errorCode, ERROR_CODES.STALE_DOC, "old id retired");
    assert.equal(strict.respond(gqlRequest(strict, "CometModernHomeFeedQuery", vars, { docId: "39999999999999999" })).entry.errorCode, null);
  });

  test("like / unlike echo the new counts and change later pages", () => {
    const { mock, world, feedVars } = fixture();
    const story = world.story(world.feed("friends")[0]);
    const before = world.feedback.get(story.postId).reactions;
    const react = (reactionId, cmid) => ({ input: { attribution_id_v2: "CometHomeRoot.react,comet.home,via_cold_start,1,1,,,", feedback_id: story.feedbackId, feedback_reaction_id: reactionId, feedback_source: "NEWS_FEED", is_tracking_encrypted: true, tracking: [], session_id: "fd0d4d15-2063-4af1-9a4c-cfbbd9f2014f", actor_id: world.viewer.id, client_mutation_id: cmid }, scale: 1, canUseNicknameOnComet: false, useDefaultActor: false, __relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider: false });
    const liked = JSON.parse(mock.respond(gqlRequest(mock, "CometUFIFeedbackReactMutation", react(REACTIONS.LIKE, "1"))).body).data.feedback_react.feedback;
    assert.equal(liked.reaction_count.count, before + 1);
    assert.equal(liked.viewer_feedback_reaction_info.id, REACTIONS.LIKE);
    const ftwc = edgesOf(mock.respond(gqlRequest(mock, "CometModernHomeFeedQuery", feedVariables(feedVars, "friends"))).body).find((e) => e.node?.post_id === story.postId).node.comet_sections.feedback.story.story_ufi_container.story.feedback_context.feedback_target_with_context;
    assert.equal(ftwc.comet_ufi_summary_and_actions_renderer.feedback.viewer_feedback_reaction_info.id, REACTIONS.LIKE);
    const unliked = JSON.parse(mock.respond(gqlRequest(mock, "CometUFIFeedbackReactMutation", react("0", "2"))).body).data.feedback_react.feedback;
    assert.equal(unliked.reaction_count.count, before);
    assert.equal(unliked.viewer_feedback_reaction_info, null);
    const wrongActor = react(REACTIONS.LIKE, "3");
    wrongActor.input.actor_id = "1";
    assert.equal(mock.respond(gqlRequest(mock, "CometUFIFeedbackReactMutation", wrongActor)).entry.errorCode, ERROR_CODES.FIELD);
    assert.equal(mock.invalid().length, 0);
  });

  test("comments: create (groupID checked) and list with cursors", () => {
    const { mock, world } = fixture();
    const groupStory = world.story(world.feed("groups")[0]);
    const comment = (story, groupID, text = "Nice one!") => ({
      feedLocation: "NEWSFEED",
      feedbackSource: 1,
      groupID,
      input: { client_mutation_id: "1", attachments: null, feedback_id: story.feedbackId, formatting_style: null, message: { ranges: [], text }, is_tracking_encrypted: true, tracking: [], feedback_source: "NEWS_FEED", idempotence_token: `client:${crypto.randomUUID()}`, session_id: crypto.randomUUID() },
      inviteShortLinkKey: null,
      renderLocation: null,
      scale: 1,
      useDefaultActor: false,
      focusCommentID: null,
      __relay_internal__pv__groups_comet_use_glvrelayprovider: false,
      __relay_internal__pv__CometUFICommentActionLinksRewriteEnabledrelayprovider: true,
      __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider: false,
      __relay_internal__pv__IsWorkUserrelayprovider: false,
      __relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider: "AUTO_TRANSLATE",
    });
    assert.equal(mock.respond(gqlRequest(mock, "useCometUFICreateCommentMutation", comment(groupStory, null))).entry.errorCode, ERROR_CODES.FIELD, "groupID must be the owning group");
    const created = JSON.parse(mock.respond(gqlRequest(mock, "useCometUFICreateCommentMutation", comment(groupStory, groupStory.to.id))).body).data.comment_create;
    assert.equal(created.feedback_comment_edge.node.body.text, "Nice one!");
    assert.equal(created.feedback_comment_edge.node.author.id, world.viewer.id);
    const total = created.feedback.total_comment_count;
    const list = (cursor) => JSON.parse(mock.respond(gqlRequest(mock, "CommentsListComponentsPaginationQuery", { commentsAfterCount: 2, commentsAfterCursor: cursor, feedLocation: "POST_PERMALINK_DIALOG", id: groupStory.feedbackId, scale: 1 })).body).data.node.comment_rendering_instance_for_feed_location.comments;
    let page = list(null);
    const texts = page.edges.map((e) => e.node.body.text);
    while (page.page_info.has_next_page) {
      page = list(page.page_info.end_cursor);
      texts.push(...page.edges.map((e) => e.node.body.text));
    }
    assert.equal(texts.length, total);
    assert.equal(texts.at(-1), "Nice one!");
    assert.equal(mock.invalid().length, 0);
  });

  test("error injection: token, stale doc_id, soft block, server error, checkpoint", () => {
    const { mock, feedVars } = fixture();
    const req = () => gqlRequest(mock, "CometModernHomeFeedQuery", feedVariables(feedVars, "friends"));
    mock.inject.tokenError = 1;
    assert.equal(mock.respond(req()).entry.errorCode, ERROR_CODES.TOKEN);
    assert.equal(mock.respond(req()).entry.errorCode, null, "one-shot");
    mock.inject.staleDoc = 1;
    assert.equal(mock.respond(req()).entry.errorCode, ERROR_CODES.STALE_DOC);
    mock.inject.softBlock = 1;
    assert.equal(mock.respond(req()).body, "");
    mock.inject.serverError = 1;
    assert.equal(mock.respond(req()).status, 500);
    mock.inject.checkpoint = "html";
    assert.match(mock.respond(req()).body, /"is_checkpointed":true/);
    mock.inject.checkpoint = "redirect";
    const redirect = mock.respond(req());
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.location, CHECKPOINT_URL);
  });

  test("log keeps timestamps for pacing checks", async () => {
    const { mock, feedVars } = fixture();
    mock.respond(gqlRequest(mock, "CometModernHomeFeedQuery", feedVariables(feedVars, "friends")));
    await new Promise((r) => setTimeout(r, 30));
    mock.respond(gqlRequest(mock, "CometModernHomeFeedQuery", feedVariables(feedVars, "groups")));
    assert.equal(mock.feedRequests().length, 2);
    assert.ok(mock.gaps()[0] >= 25);
    assert.deepEqual(mock.feedRequests().map((e) => e.feedName), ["friends", "groups"]);
    assert.equal(mock.respond({ method: "GET" }).body, "", "GET is a no-op");
  });
});

describe("in Chromium", () => {
  let b;
  let site;
  before(async () => {
    b = await launchBrowser();
    site = await installSite(b, { delayMs: 150 });
  });
  after(() => b?.close());

  async function open(p) {
    const page = await b.newPage({ url: site.url(p) });
    await page.waitForLoadState("load");
    return page;
  }

  test("pages load without errors and expose Facebook's landmarks", async () => {
    const failed = [];
    b.context.on("requestfailed", (r) => failed.push(r.url()));
    const home = await open("/");
    const landmarks = await home.evaluate(() => ({
      mount: !!document.querySelector('body > div[id^="mount_0_0"]'),
      banner: !!document.querySelector('[role="banner"] [role="navigation"][aria-label="Account Controls and Settings"]'),
      notifications: document.querySelector('[role="banner"] [aria-label^="Notifications"]')?.getAttribute("aria-label"),
      profile: !!document.querySelector('[role="banner"] [role="button"][aria-label="Your profile"] svg[aria-label="Your profile"] image'),
      shortcuts: !!document.querySelector('[role="navigation"][aria-label="Shortcuts"]'),
      main: !!document.querySelector('[role="main"]'),
      composer: !!document.querySelector('[role="main"] [role="region"][aria-label="Create a post"]'),
      stories: !!document.querySelector('[role="main"] [data-focus-target="stories_tray"]'),
      feedHeading: [...document.querySelectorAll('[role="main"] h3')].some((h) => h.textContent === "Feed posts"),
      posts: document.querySelectorAll('[role="main"] [aria-posinset]').length,
      skeleton: !!document.querySelector('[aria-posinset] [role="progressbar"]'),
      rail: [...document.querySelectorAll('[role="complementary"] h3')].map((h) => h.textContent.replace(/\u200b/g, "")),
      contacts: document.querySelectorAll('[role="complementary"] a[href^="/messages/t/"]').length,
      cookie: document.cookie.includes("c_user="),
      header: getComputedStyle(document.documentElement).getPropertyValue("--header-height").trim(),
    }));
    assert.deepEqual(landmarks, { mount: true, banner: true, notifications: "Notifications, 5 unread", profile: true, shortcuts: true, main: true, composer: true, stories: true, feedHeading: true, posts: landmarks.posts, skeleton: true, rail: ["Sponsored", "Birthdays", "Contacts", "Group chats"], contacts: 10, cookie: true, header: "56px" });
    assert.ok(landmarks.posts >= 6);
    await home.screenshot({ path: path.join(SHOTS, "home.png") });
    const filter = await open("/?filter=friends&sk=h_chr");
    assert.deepEqual(await filter.evaluate(() => [!!document.querySelector('[aria-label="Shortcuts"]'), !!document.querySelector('[role="complementary"]'), !!document.querySelector('[role="main"] [aria-posinset]')]), [false, false, true]);
    await filter.screenshot({ path: path.join(SHOTS, "filter-friends.png") });
    const groups = await open("/groups/feed/");
    assert.ok(await groups.evaluate(() => document.querySelectorAll('[role="feed"] > div [aria-posinset]').length >= 6));
    await groups.screenshot({ path: path.join(SHOTS, "groups-feed.png"), fullPage: true });
    const profile = await open(`/${site.world.viewer.vanity}`);
    assert.equal(await profile.evaluate(() => document.querySelector('[role="main"] h1').textContent), site.world.viewer.name);
    await profile.screenshot({ path: path.join(SHOTS, "profile.png") });
    for (const p of [home, filter, groups, profile]) assert.deepEqual(p.__errors || [], []);
    assert.deepEqual(failed, []);
  });

  test("Polish page uses Facebook's Polish labels", async () => {
    const pb = await launchBrowser();
    try {
      const plSite = await installSite(pb, { locale: "pl" });
      const page = await pb.newPage({ url: plSite.url("/") });
      await page.waitForLoadState("load");
      const labels = await page.evaluate(() => ({
        lang: document.documentElement.lang,
        account: !!document.querySelector('[aria-label="Mechanizmy kontrolne i ustawienia konta"]'),
        notifications: document.querySelector('[aria-label^="Powiadomienia"]').getAttribute("aria-label"),
        shortcuts: !!document.querySelector('[aria-label="Skróty"]'),
        composer: !!document.querySelector('[role="region"][aria-label="Utwórz post"]'),
        like: !!document.querySelector('[aria-posinset] [role="button"][aria-label="Lubię to!"]'),
      }));
      assert.deepEqual(labels, { lang: "pl", account: true, notifications: "Powiadomienia, 5 nieprzeczytanych", shortcuts: true, composer: true, like: true });
      await page.screenshot({ path: path.join(SHOTS, "home-pl.png") });
    } finally {
      await pb.close();
    }
  });

  test("images and avatars load from the CDN route", async () => {
    const page = await open("/");
    const sizes = await page.evaluate(async () => {
      const imgs = [...document.querySelectorAll('img[src*="fbcdn.net"]')].slice(0, 12);
      await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => i.addEventListener("load", r, { once: true })))));
      return imgs.map((i) => i.naturalWidth);
    });
    assert.ok(sizes.length >= 6 && sizes.every((w) => w > 0), JSON.stringify(sizes));
  });

  test("runtime exposes Comet's module system, config modules and relay operations", async () => {
    const page = await open("/");
    await page.waitForFunction(() => window.require && (() => { try { return window.require("CometUFIFeedbackReactMutation_facebookRelayOperation"); } catch { return false; } })());
    const got = await page.evaluate(() => new Promise((resolve) => window.requireLazy(["useCometUFICreateCommentMutation_facebookRelayOperation", "LSD", "CurrentUserInitialData"], (comment, lsd, user) => resolve({ comment, lsd: lsd.token, user: user.USER_ID, env: window.Env.q9k7m2x.length }))));
    assert.deepEqual(got, { comment: site.mock.docIds.useCometUFICreateCommentMutation, lsd: site.tokens.lsd, user: site.world.viewer.id, env: 2 });
    assert.equal(await page.evaluate(() => { try { window.require("NoSuchModule"); return "no"; } catch (e) { return e.message; } }), 'Requiring unknown module "NoSuchModule"');
  });

  test("SPA navigation: native anchors and pushState + popstate re-render in place", async () => {
    const page = await open("/");
    await page.evaluate(() => (window.__sameDocument = true));
    await page.click('[aria-label="Shortcuts"] a[href="https://www.facebook.com/?filter=all&sk=h_chr"]');
    await page.waitForFunction(() => document.querySelector('[role="navigation"][aria-label="Feeds"]'));
    assert.equal(await page.evaluate(() => [window.__sameDocument, location.search].join()), "true,?filter=all&sk=h_chr");
    await page.evaluate(() => {
      history.pushState({}, "", "/groups/feed/");
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    });
    await page.waitForFunction(() => document.querySelector('[role="feed"]'));
    assert.equal(await page.evaluate(() => window.__sameDocument), true);
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('[role="navigation"][aria-label="Feeds"]'));
    assert.deepEqual(page.__errors || [], []);
  });

  test("jewels open dropdowns inside the banner; the composer opens a portal dialog", async () => {
    const page = await open("/");
    await page.click('[role="banner"] [role="button"][aria-label^="Notifications"]');
    const dropdown = await page.evaluate(() => {
      const d = document.querySelector('[role="banner"] [role="dialog"][aria-label="Notifications"]');
      return d && { rows: d.querySelectorAll('[role="listitem"] a[href*="notif_t="]').length, expanded: document.querySelector('[aria-label^="Notifications"]').getAttribute("aria-expanded") };
    });
    assert.deepEqual(dropdown, { rows: 5, expanded: "true" });
    await page.click('[role="banner"] [role="button"][aria-label^="Notifications"]');
    assert.equal(await page.$('[role="banner"] [role="dialog"]'), null, "second click closes");
    await page.click('[role="region"][aria-label="Create a post"] [role="button"]');
    assert.ok(await page.$('body > div.__fb-light-mode [role="dialog"][aria-label="Create post"]'));
    await page.click('[role="dialog"][aria-label="Create post"] [role="button"][aria-label="Close"]');
    assert.equal(await page.$('[role="dialog"][aria-label="Create post"]'), null);
  });

  test("native feed: labels vanish after mount, scrolling appends more units", async () => {
    const page = await open("/groups/feed/");
    await page.waitForFunction(() => [...document.querySelectorAll("span[aria-labelledby]")].every((s) => !document.getElementById(s.getAttribute("aria-labelledby"))));
    const before = await page.evaluate(() => document.querySelectorAll("[aria-posinset]").length);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 4000);
      await page.waitForTimeout(150);
    }
    const afterCount = await page.evaluate(() => document.querySelectorAll("[aria-posinset]").length);
    assert.ok(afterCount > before, `${before} -> ${afterCount}`);
    const units = site.units("groups-feed");
    assert.equal(units.length, afterCount - (await page.evaluate(() => (document.querySelector('[role="progressbar"]') ? 1 : 0))));
    assert.ok(units.some((u) => u.junk) && units.some((u) => !u.junk));
  });

  test("in-page requests reach the mock; concurrency is detected", async () => {
    const page = await open("/");
    site.mock.reset();
    const statuses = await page.evaluate(async ({ dtsg, lsd, docId, vars }) => {
      const send = (feedStyle) =>
        fetch("/api/graphql/", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", "x-fb-friendly-name": "CometModernHomeFeedQuery", "x-fb-lsd": lsd },
          body: new URLSearchParams({ fb_dtsg: dtsg, lsd, fb_api_caller_class: "RelayModern", fb_api_req_friendly_name: "CometModernHomeFeedQuery", variables: JSON.stringify({ ...vars, feedStyle }), server_timestamps: "true", doc_id: docId }),
        }).then((r) => r.text());
      const [a, b2] = await Promise.all([send("MOST_RECENT_FRIENDS_FEED"), send("MOST_RECENT_GROUPS_FEED")]);
      return [a.split("\r\n").length, b2.split("\r\n").length];
    }, { dtsg: site.tokens.dtsg, lsd: site.tokens.lsd, docId: site.mock.docIds.CometModernHomeFeedQuery, vars: { ...preloaderOf(sjsBlocks(site.render("home").html), "CometModernHomeFeedQuery").variables, orderby: ["MOST_RECENT"] } });
    assert.ok(statuses.every((n) => n >= 4));
    assert.equal(site.mock.log.length, 2);
    assert.equal(site.mock.maxInFlight, 2);
    assert.equal(site.mock.log.filter((e) => e.concurrent).length, 1);
    assert.ok(site.mock.log.every((e) => e.end >= e.at + 100), "latency simulated");
  });

  test("an extension content script's requests are intercepted", async () => {
    const dir = path.join(ROOT, "test-results/harness/ext");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ manifest_version: 3, name: "harness", version: "1", content_scripts: [{ matches: ["https://www.facebook.com/*"], js: ["cs.js"], run_at: "document_idle" }] }));
    writeFileSync(
      path.join(dir, "cs.js"),
      `const sjs = [...document.querySelectorAll("script[data-sjs]")].map((s) => s.textContent).join("\\n");
const t = (re) => re.exec(sjs)?.[1];
const dtsg = t(/"DTSGInitData",\\[\\],\\{"token":"([^"]+)"/), lsd = t(/"LSD",\\[\\],\\{"token":"([^"]+)"/);
fetch("/api/graphql/", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-fb-friendly-name": "CometModernHomeFeedQuery", "x-fb-lsd": lsd },
  body: new URLSearchParams({ fb_dtsg: dtsg, lsd, fb_api_req_friendly_name: "CometModernHomeFeedQuery", fb_api_caller_class: "RelayModern", server_timestamps: "true", doc_id: "0", variables: "{}" }) })
  .then((r) => r.text()).then((x) => document.documentElement.setAttribute("data-harness", x.length));`,
    );
    const eb = await launchBrowser({ extensionPath: dir });
    try {
      const extSite = await installSite(eb);
      const page = await eb.newPage({ url: extSite.url("/") });
      await page.waitForFunction(() => document.documentElement.hasAttribute("data-harness"), null, { timeout: 15000 });
      assert.equal(extSite.mock.log.length, 1);
      assert.equal(extSite.mock.log[0].errorCode, ERROR_CODES.STALE_DOC, "doc_id 0 is unknown, tokens accepted");
      assert.deepEqual(extSite.mock.log[0].problems, []);
    } finally {
      await eb.close();
    }
  });

  test("userscript init script: start timings, and GM_* values persist across navigations", async () => {
    const ub = await launchBrowser();
    try {
      const uSite = await installSite(ub);
      await ub.context.addInitScript({ content: userscriptInit(`GM_setValue("visits", GM_getValue("visits", 0) + 1); window.__visits = GM_getValue("visits"); window.__rootAtStart = !!document.documentElement;`) });
      await ub.context.addInitScript({ content: userscriptInit(`window.__earliestRootAtStart = !!document.documentElement; window.__ranBeforePage = typeof window.requireLazy === "undefined";`, { timing: "earliest" }) });
      const page = await ub.newPage({ url: uSite.url("/") });
      assert.equal(await page.evaluate(() => window.__visits), 1);
      assert.deepEqual(await page.evaluate(() => [window.__rootAtStart, window.__earliestRootAtStart, window.__ranBeforePage]), [true, false, true]);
      await page.goto(uSite.url("/groups/feed/"));
      assert.equal(await page.evaluate(() => [window.__visits, typeof GM.getValue, GM_info.scriptHandler].join()), "2,function,Tampermonkey");
      assert.deepEqual(page.__errors || [], []);
    } finally {
      await ub.close();
    }
  });
});
