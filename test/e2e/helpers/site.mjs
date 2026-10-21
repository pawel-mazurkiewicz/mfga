// The fake logged-in facebook.com 2026, installed on a browser from browser.mjs.
//
//   const b = await launchBrowser();
//   const site = await installSite(b, { locale: "en" });
//   const page = await b.newPage({ url: site.url("/") });     // or "/?filter=friends&sk=h_chr", "/groups/feed/", "/casey.lindqvist"
//   site.mock.log  /  site.world.expectedMerged()  /  site.units("groups-feed")
//
// Serves: every www.facebook.com document (home, Feeds filters, /groups/feed/, profiles, checkpoint, and a
// generic page for any other path), /api/graphql/ (mock-graphql.mjs), Facebook's static assets
// (static.xx.fbcdn.net: theme tokens, app CSS, runtime, relay-operation bundle, sprite) and CDN media
// (scontent.test.fbcdn.net, video.test.fbcdn.net). Pages are rendered per request, so they reflect state
// changed by mutations. Page templates can also be used directly: homePage(opts) etc. return HTML strings.

import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./browser.mjs";
import { createWorld, SOURCES } from "../../fixtures/site/world.mjs";
import { makeTokens, relayOperationsBundle } from "../../fixtures/site/ssr.mjs";
import { renderPage, ASSETS } from "../../fixtures/site/pages.mjs";
import { appCss } from "../../fixtures/site/styles.mjs";
import { bookmarksSprite, SPRITE_URL, STATIC_HOST } from "../../fixtures/site/chrome.mjs";
import { parseImagePath, renderImage, CDN_HOST, VIDEO_HOST } from "../../fixtures/site/images.mjs";
import { createMockGraphql } from "./mock-graphql.mjs";

export { homePage, filterPage, groupsFeedPage, profilePage, genericPage, checkpointPage, renderPage } from "../../fixtures/site/pages.mjs";
export { createWorld, SOURCES, FEED_STYLES } from "../../fixtures/site/world.mjs";

export const FB = "https://www.facebook.com";
const FIXTURES = path.join(ROOT, "test/fixtures/site");
const FILTERS = ["all", "favorites", ...SOURCES];
const SECTION_TITLES = { friends: "Friends", groups: "Groups", watch: "Video", reel: "Reels", marketplace: "Marketplace", events: "Events", messages: "Messenger", notifications: "Notifications", saved: "Saved", bookmarks: "Menu", pokes: "Pokes", photo: "Photo", search: "Search", settings: "Settings" };

/** Unix time rounded to the minute: a natural `now` for screenshots, still stable within a test. */
export const fixtureNow = () => Math.floor(Date.now() / 60000) * 60;

/**
 * Which fixture page answers a www.facebook.com URL: { kind, opts } | { redirect } | { notFound } |
 * null (not a document: left to other routes).
 */
export function pageFor(url, world) {
  const u = new URL(url);
  const p = u.pathname;
  if (/^\/(api|ajax)\//.test(p)) return null;
  if (/\.(ico|png|jpg|gif|svg|js|css|json|txt|xml)$/i.test(p)) return { notFound: true };
  if (p === "/" || p === "/home.php") {
    const filter = u.searchParams.get("filter");
    const sk = u.searchParams.get("sk");
    if (filter && sk === "h_chr" && FILTERS.includes(filter)) return { kind: "feeds", opts: { filter } };
    return { kind: "home", opts: { feed: sk === "h_chr" ? "all" : "top" } };
  }
  if (/^\/groups\/feed\/?$/.test(p)) return { kind: "groups-feed", opts: {} };
  if (p.startsWith("/checkpoint/")) return { kind: "checkpoint", opts: {} };
  if (/^\/me\/?$/.test(p)) return { redirect: world.viewer.url };
  const people = [world.viewer, ...world.friends];
  const byId = p === "/profile.php" && people.find((person) => person.id === u.searchParams.get("id"));
  if (byId) return { kind: "profile", opts: { vanity: byId.vanity } };
  const segments = p.split("/").filter(Boolean);
  if (segments.length === 1 && people.some((person) => person.vanity === segments[0])) return { kind: "profile", opts: { vanity: segments[0] } };
  const section = SECTION_TITLES[segments[0]] || (segments[0] ? segments[0][0].toUpperCase() + segments[0].slice(1) : "Facebook");
  return { kind: "page", opts: { title: section, activeTab: ["friends", "groups", "marketplace"].includes(segments[0]) ? segments[0] : null } };
}

function nameOf(world, id) {
  if (id === "metaai") return "Meta AI";
  const all = [world.viewer, ...world.friends, ...world.members, ...world.pages, ...world.groups, ...world.strangers, ...world.advertisers];
  return all.find((x) => x.id === id)?.name || null;
}

function staticFile(mock) {
  const files = {
    [ASSETS.themeCss]: () => ["text/css", readFileSync(path.join(FIXTURES, "fb-light-vars.css"), "utf8")],
    [ASSETS.appCss]: () => ["text/css", appCss()],
    [ASSETS.runtimeJs]: () => ["text/javascript", readFileSync(path.join(FIXTURES, "fb-runtime.js"), "utf8")],
    [ASSETS.opsJs]: () => ["text/javascript", relayOperationsBundle(mock.docIds)],
    [SPRITE_URL]: () => ["image/svg+xml", bookmarksSprite()],
  };
  return (url) => files[url.origin + url.pathname]?.() || null;
}

/**
 * installSite(b, opts) registers the fake facebook.com on a launchBrowser() handle and returns
 *   { world, tokens, mock, documents, url(path), units(kind, opts), render(kind, opts) }.
 * opts: { locale: "en"|"pl", now (unix s), fetchSize (feedInitialFetchSize, default 4), delayMs (mock latency),
 *   acceptDossierDocIds (default true), seed }
 */
export async function installSite(b, { locale = "en", now, fetchSize = 4, delayMs, acceptDossierDocIds, seed } = {}) {
  const world = createWorld({ locale, now, seed });
  const tokens = makeTokens(world);
  const mock = createMockGraphql({ world, tokens, delayMs, acceptDossierDocIds });
  const documents = [];
  const render = (kind, opts = {}) => renderPage(kind, { world, tokens, locale, fetchSize, ...opts });
  const staticFor = staticFile(mock);

  b.route((u) => u.hostname === "www.facebook.com" && u.pathname === "/api/graphql/", mock.handle);
  b.route(
    (u) => u.hostname === STATIC_HOST,
    (route, request) => {
      const hit = staticFor(new URL(request.url()));
      return hit ? route.fulfill({ status: 200, contentType: hit[0], body: hit[1], headers: { "access-control-allow-origin": "*" } }) : route.fulfill({ status: 404, body: "" });
    },
  );
  b.route(
    (u) => u.hostname === CDN_HOST || u.hostname === VIDEO_HOST,
    (route, request) => {
      const u = new URL(request.url());
      if (u.hostname === VIDEO_HOST) return route.fulfill({ status: 200, contentType: "video/mp4", body: "" });
      const img = parseImagePath(u.pathname);
      return img ? route.fulfill({ status: 200, contentType: "image/svg+xml", body: renderImage(img, nameOf(world, img.id)), headers: { "cache-control": "max-age=3600" } }) : route.fulfill({ status: 404, body: "" });
    },
  );
  b.route(
    (u, request) => u.hostname === "www.facebook.com" && request.method() === "GET" && pageFor(u.href, world) !== null,
    (route, request) => {
      const target = pageFor(request.url(), world);
      if (target.notFound) return route.fulfill({ status: 404, body: "" });
      documents.push({ at: Date.now(), url: request.url(), kind: target.kind || "redirect" });
      if (target.redirect) return route.fulfill({ status: 302, headers: { location: target.redirect } });
      return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: render(target.kind, target.opts).html });
    },
  );
  await b.context.addCookies(
    [
      ["c_user", world.viewer.id, false],
      ["xs", `17%3A${tokens.hsi.slice(0, 14)}%3A2%3A${world.now}%3A-1%3A-1`, true],
      ["datr", "Zx9AZ0kL1rQ2aUf0cB7yW8s-", true],
      ["fr", `0${tokens.compatIframeToken}.${world.viewer.id}`, true],
    ].map(([name, value, httpOnly]) => ({ name, value, domain: ".facebook.com", path: "/", secure: true, httpOnly, sameSite: "None" })),
  );

  return {
    world,
    tokens,
    mock,
    documents,
    render,
    url: (p = "/") => FB + p,
    /** aria-posinset -> { kind, junk, postId } of the native feed a page kind renders. */
    units: (kind, opts) => render(kind, opts).units,
  };
}

/** Every inline data-sjs frame of an HTML document, decoded. */
export function sjsBlocks(html) {
  return [...html.matchAll(/<script type="application\/json"[^>]*\sdata-sjs>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}

/** Walks decoded frames and returns every value for which `pick(value)` is true. */
export function findInFrames(frames, pick) {
  const out = [];
  const walk = (v) => {
    if (!v || typeof v !== "object") return;
    if (pick(v)) out.push(v);
    for (const child of Array.isArray(v) ? v : Object.values(v)) walk(child);
  };
  frames.forEach(walk);
  return out;
}

/** Config frame payload, e.g. configFrame(frames, "LSD").token. */
export const configFrame = (frames, name) => findInFrames(frames, (v) => Array.isArray(v) && v[0] === name && Array.isArray(v[1]) && v.length === 4)[0]?.[2] ?? null;

/** Preloader descriptor { preloaderID, queryID, variables, queryName } for an operation. */
export const preloaderOf = (frames, op) => findInFrames(frames, (v) => v.queryName === op && typeof v.queryID === "string")[0] ?? null;

/** RelayPrefetchedStreamCache payloads of one preloader, in sequence order. */
export function prefetchedOf(frames, preloaderID) {
  return findInFrames(frames, (v) => Array.isArray(v) && typeof v[0] === "string" && v[0].startsWith("RelayPrefetchedStreamCache") && v[3]?.[0] === preloaderID)
    .map((v) => v[3][1].__bbox)
    .sort((a, b) => a.sequence_number - b.sequence_number)
    .map((b) => b.result);
}
