import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyRoute, routeKey, effectiveMode } from "../../../src/fb/routes.js";
import { samePlace } from "../../../src/fb/nav.js";

test("home routes: /, /home.php, Feeds filters and sk variants", () => {
  for (const url of ["/", "/home.php", "/?sk=h_chr", "/?filter=all&sk=h_chr", "/?filter=friends&sk=h_chr", "/?ref=logo", "https://www.facebook.com/"]) {
    assert.equal(classifyRoute(url).mode, "home", url);
  }
  assert.deepEqual(classifyRoute("/?filter=groups&sk=h_chr"), { mode: "home", filter: "groups", sk: "h_chr", path: "/" });
  assert.deepEqual(classifyRoute("/?sk=favorites"), { mode: "home", filter: null, sk: "favorites", path: "/" });
});

test("groups feed with and without the trailing slash", () => {
  assert.equal(classifyRoute("/groups/feed/").mode, "groups-feed");
  assert.equal(classifyRoute("/groups/feed").mode, "groups-feed");
  assert.equal(classifyRoute("/groups/feed/?ref=bookmarks").mode, "groups-feed");
});

test("everything else is a plain page", () => {
  for (const url of ["/groups/", "/groups/123/", "/groups/feed/extra", "/friends/", "/messages/t/1/", "/profile.php?id=4", "/zuck", "/photo/?fbid=1", "/home"]) {
    assert.equal(classifyRoute(url).mode, "page", url);
  }
});

test("accepts Location-like objects and collapses repeated slashes", () => {
  assert.equal(classifyRoute({ pathname: "/", search: "?filter=pages&sk=h_chr" }).filter, "pages");
  assert.equal(classifyRoute({ pathname: "//groups//feed/", search: "" }).mode, "groups-feed");
  assert.equal(classifyRoute({}).mode, "home");
});

test("routeKey ignores the hash", () => {
  assert.equal(routeKey("/friends/?a=1#x"), "/friends/?a=1");
  assert.equal(routeKey({ pathname: "/", search: "" }), "/");
});

test("a push view over a column page keeps that layout until it closes", () => {
  const photo = classifyRoute("/photo/?fbid=1");
  assert.equal(effectiveMode(photo, "home", true), "home");
  assert.equal(effectiveMode(photo, "groups-feed", true), "groups-feed");
  assert.equal(effectiveMode(photo, "home", false), "page");
  assert.equal(effectiveMode(photo, "page", true), "page");
  assert.equal(effectiveMode(photo, null, true), "page");
  assert.equal(effectiveMode(classifyRoute("/"), "page", true), "home");
});

test("samePlace compares origin, path (trailing slash aside) and query", () => {
  const u = (s) => new URL(s, "https://www.facebook.com/");
  assert.equal(samePlace(u("/friends"), u("/friends/")), true);
  assert.equal(samePlace(u("/friends/?ref=bookmarks"), u("/friends/")), false);
  assert.equal(samePlace(u("/"), u("https://www.facebook.com/")), true);
  assert.equal(samePlace(u("https://web.facebook.com/friends/"), u("/friends/")), false);
  assert.equal(samePlace(u("/?filter=all&sk=h_chr"), u("/?filter=all&sk=h_chr#top")), true);
});
