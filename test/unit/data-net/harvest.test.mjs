import test from "node:test";
import assert from "node:assert/strict";
import { harvest as mod } from "./fixtures/load.mjs";
import { fixtureJson } from "./fixtures/helpers.mjs";

const { createHarvest, parseEnv, parseSjs } = mod;

const LOGGED_OUT = fixtureJson("sjs-loggedout-2026-10-21.json");
const HOME = fixtureJson("sjs-home-friends-2026-10.json");
const FEED_PRELOADER = "adp_CometModernHomeFeedQueryRelayPreloader_6acacc173a148817796";

function harvestOf(blocks) {
  const h = createHarvest();
  for (const b of blocks) parseSjs(structuredClone(b), h);
  return h;
}

const frames = (...list) => ({ require: [["ScheduledServerJS", "handle", null, [{ __bbox: { define: list } }]]] });

test("createHarvest starts empty", () => {
  const h = createHarvest();
  assert.deepEqual(h.tokens, { dtsg: null, lsd: null, userId: null, name: null, shortName: null, site: {} });
  assert.equal(h.preloaders.size, 0);
  assert.equal(h.prefetched.size, 0);
  assert.deepEqual(h.env, { typenamePairs: [], keys: [] });
  assert.equal(h.routeProps, null);
  assert.equal(h.checkpointed, false);
});

test("live logged-out page: LSD, SiteData, preloaders, prefetched payloads and routeProps", () => {
  const h = harvestOf(LOGGED_OUT.sjs);
  assert.equal(h.tokens.lsd, "AdR16GsCBuzx6HMHP0pOQzBIMP8");
  assert.equal(h.tokens.dtsg, null, "empty DTSG frames are ignored");
  assert.equal(h.tokens.userId, null, 'USER_ID "0" is not a viewer');
  assert.equal(h.tokens.name, null);
  assert.equal(h.tokens.site.client_revision, 1051133768);
  assert.equal(h.tokens.site.haste_session, "20747.HYP:comet_loggedout_pkg.2.1...0");
  assert.equal(h.tokens.site.hsi, "7699081856574727250");
  assert.equal(h.tokens.site.comet_env, 15);
  assert.equal(h.tokens.site.__spin_t, 1792582184);
  assert.deepEqual([...h.preloaders.keys()], ["FDSIntlLocaleSelectorListQuery", "FDSSeoLinksQuery", "CAAFBLoginHomepageRootQuery"]);
  assert.deepEqual(h.preloaders.get("FDSIntlLocaleSelectorListQuery"), {
    queryID: "27915678758041942",
    variables: { suggestedLocaleLimit: 11 },
    preloaderID: "adp_FDSIntlLocaleSelectorListQueryRelayPreloader_6ad8a2285cb0b2632013957",
  });
  const seo = h.prefetched.get("adp_FDSSeoLinksQueryRelayPreloader_6ad8a2285cb2a4614587504");
  assert.equal(seo.length, 1);
  assert.ok(seo[0].data, "payload is the bbox result");
  assert.equal(h.routeProps.appId, 2220391788200892);
});

test("logged-in frames: either DTSG frame name, viewer id, name and short name", () => {
  const h = harvestOf([
    frames(
      ["DTSGInitialData", [], {}, 258],
      ["DTSGInitData", [], { token: "NAcAAA:17:1800000000", async_get_token: "x" }, 3515],
      ["CurrentUserInitialData", [], { ACCOUNT_ID: "100000000000001", USER_ID: "100000000000001", NAME: "Ann Example", SHORT_NAME: "Ann" }, 270],
    ),
  ]);
  assert.equal(h.tokens.dtsg, "NAcAAA:17:1800000000");
  assert.equal(h.tokens.userId, "100000000000001");
  assert.equal(h.tokens.name, "Ann Example");
  assert.equal(h.tokens.shortName, "Ann");

  const h2 = harvestOf([frames(["DTSGInitialData", [], { token: "NAcBBB:1:1" }, 258])]);
  assert.equal(h2.tokens.dtsg, "NAcBBB:1:1");
});

test("tokens delivered later (SPA navigation, refresh) replace older ones; empty ones never do", () => {
  const h = harvestOf([frames(["DTSGInitData", [], { token: "NAcOLD" }, 1], ["LSD", [], { token: "LSD1" }, 2])]);
  parseSjs(frames(["DTSGInitData", [], { token: "" }, 1], ["LSD", [], { token: "" }, 2]), h);
  assert.equal(h.tokens.dtsg, "NAcOLD");
  parseSjs(frames(["DTSGInitData", [], { token: "NAcNEW" }, 1]), h);
  assert.equal(h.tokens.dtsg, "NAcNEW");
  assert.equal(h.tokens.lsd, "LSD1");
});

test("three LSD frames per page (live 2026-09): the first is kept, as Facebook's own requests send it", () => {
  // The live frame shape of samples/live-loggedout-page-frames-2026-10-21.txt, one LSD frame per SSR block.
  const h = harvestOf([frames(["LSD", [], { token: "LSDFIRST" }, 323]), frames(["LSD", [], { token: "LSDSECOND" }, 323]), frames(["LSD", [], { token: "LSDTHIRD" }, 323])]);
  assert.equal(h.tokens.lsd, "LSDFIRST");
});

test("home SSR: feed preloader with its exact variables and the stitched-ready payloads in sequence order", () => {
  const h = harvestOf(HOME.sjs);
  const p = h.preloaders.get("CometModernHomeFeedQuery");
  assert.equal(p.queryID, "28136951115834703");
  assert.equal(p.preloaderID, FEED_PRELOADER);
  assert.equal(p.variables.feedStyle, "MOST_RECENT_FRIENDS_FEED");
  assert.ok(Object.keys(p.variables).some((k) => k.startsWith("__relay_internal__pv__")));
  const payloads = h.prefetched.get(FEED_PRELOADER);
  assert.equal(payloads.length, 3);
  assert.ok("data" in payloads[0] && !("label" in payloads[0]), "root payload first");
  assert.match(payloads[1].label, /\$stream\$/);
  assert.match(payloads[2].label, /\$page_info$/);
  assert.deepEqual(h.routeProps, { feedStyle: 17 });
});

test("prefetched payloads are ordered by sequence_number whatever the block order, and never duplicated", () => {
  const forward = harvestOf(HOME.sjs);
  const shuffled = harvestOf([HOME.sjs[3], HOME.sjs[0], HOME.sjs[2], HOME.sjs[1], HOME.sjs[2]]);
  assert.deepEqual(shuffled.prefetched.get(FEED_PRELOADER), forward.prefetched.get(FEED_PRELOADER));
});

test("RelayPrefetchedStreamCache module names may carry a hash suffix; payloads without a sequence keep arrival order", () => {
  const h = createHarvest();
  const block = (id, result, seq) => ["RelayPrefetchedStreamCache@4a1fb7054d45192b147ad69ff77e2f17", "next", [], [id, { __bbox: { complete: false, result, ...(seq == null ? {} : { sequence_number: seq }) } }]];
  parseSjs({ require: [block("adp_XRelayPreloader_1", { data: { a: 1 } }), block("adp_XRelayPreloader_1", { label: "l", path: ["a"], data: {} })] }, h);
  const list = h.prefetched.get("adp_XRelayPreloader_1");
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], { data: { a: 1 } });
});

test("preloader descriptors are found at any depth; numeric queryIDs become strings", () => {
  const h = createHarvest();
  parseSjs({ deeply: [{ nested: { list: [{ actorID: "1", preloaderID: "adp_OpRelayPreloader_ab", queryID: 123456789, variables: { x: 1 }, queryName: "Op" }] } }] }, h);
  assert.deepEqual(h.preloaders.get("Op"), { queryID: "123456789", variables: { x: 1 }, preloaderID: "adp_OpRelayPreloader_ab" });
  parseSjs({ queryID: "1", queryName: "NoPreloaderId" }, h);
  assert.equal(h.preloaders.has("NoPreloaderId"), false);
});

test("a checkpoint flag anywhere in config frames is remembered", () => {
  const h = createHarvest();
  parseSjs(frames(["SomeConfig", [], { gate: { is_checkpointed: true } }, 1]), h);
  assert.equal(h.checkpointed, true);
  const h2 = createHarvest();
  parseSjs(frames(["SomeConfig", [], { is_checkpointed: false }, 1]), h2);
  assert.equal(h2.checkpointed, false);
});

test("hostile or odd JSON never throws", () => {
  const h = createHarvest();
  let deep = {};
  const root = deep;
  for (let i = 0; i < 5000; i++) deep = deep.next = {};
  for (const json of [null, 0, "text", [], {}, [[]], root, { require: [[null], ["RelayPrefetchedStreamCache", "next", [], null]] }, ["LSD", [], null]]) {
    assert.doesNotThrow(() => parseSjs(json, h));
  }
  assert.equal(h.tokens.lsd, null);
});

test("Env: key names and q9k7m2x typename pairs (malformed pairs skipped)", () => {
  const h = createHarvest();
  parseEnv(LOGGED_OUT.envjson, h);
  assert.ok(h.env.keys.includes("ghlss"));
  assert.deepEqual(h.env.typenamePairs, []);
  parseEnv({ q9k7m2x: [["Q4xN7zP9aLbM3vT", "AdsSideFeedUnit"], ["bad"], [1, 2], "x"], h4npx7qw: true }, h);
  assert.deepEqual(h.env.typenamePairs, [["Q4xN7zP9aLbM3vT", "AdsSideFeedUnit"]]);
  assert.deepEqual(h.env.keys, ["q9k7m2x", "h4npx7qw"]);
  parseEnv("nonsense", h);
  assert.equal(h.env.typenamePairs.length, 1);
});

test("snapshot lists names and counts only, never token values", () => {
  const h = harvestOf([...HOME.sjs, frames(["DTSGInitData", [], { token: "NAcSECRET:1:1" }, 1], ["LSD", [], { token: "LSDSECRET" }, 2])]);
  parseEnv({ q9k7m2x: [["a", "b"]], compat_iframe_token: "IFRAMESECRET" }, h);
  const snap = h.snapshot();
  const text = JSON.stringify(snap);
  for (const secret of ["NAcSECRET", "LSDSECRET", "IFRAMESECRET", "MOST_RECENT_FRIENDS_FEED"]) assert.equal(text.includes(secret), false, secret);
  assert.deepEqual(snap.tokens, { dtsg: true, lsd: true, userId: false, name: false, site: [] });
  assert.deepEqual(snap.preloaders, ["CometModernHomeFeedQuery", "CometHomeContactChatSidebarQuery"]);
  assert.deepEqual(snap.prefetched, { CometModernHomeFeedQuery: 3 });
  assert.deepEqual(snap.env, { keys: ["q9k7m2x", "compat_iframe_token"], typenamePairs: 1 });
  assert.deepEqual(snap.routeProps, ["feedStyle"]);
  assert.equal(snap.blocks, HOME.sjs.length + 1);
});
