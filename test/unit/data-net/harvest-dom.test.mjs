// startHarvest in a real Chromium: document_start observation of streamed HTML, the DOMContentLoaded sweep,
// late injection (userscript at document-idle) and scripts added after load. Skipped without Chromium.

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { CHROMIUM, bundle, launchBrowser } from "../../e2e/helpers/browser.mjs";
import { fixtureJson } from "./fixtures/helpers.mjs";

const HOME = fixtureJson("sjs-home-friends-2026-10.json");
const FEED = "CometModernHomeFeedQuery";
const skip = existsSync(CHROMIUM) ? false : `Chromium not found at ${CHROMIUM}`;

const json = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
const sjs = (text) => `<script type="application/json" nonce="n0nce" data-content-len="${text.length}" data-sjs>${text}</script>`;
const ENV = `<script id="envjson" type="application/json" nonce="n0nce">${json({ ghlss: "b1pLEJ", q9k7m2x: [["Zq8Wn3Lx0Pd4Rt7", "Story"]] })}</script>`;
const CONFIG = json({
  require: [["ScheduledServerJS", "handle", null, [{ __bbox: { define: [
    ["LSD", [], { token: "AdR16GsCBuzx6HMHP0pOQzBIMP8" }, 323],
    ["DTSGInitData", [], { token: "NAcBrowserTest:17:1800000000", async_get_token: "x" }, 3515],
    ["SiteData", [], { client_revision: 1051133768, hsi: "7699081856574727250", comet_env: 15 }, 317],
  ] } }]]],
});

let entryCode;
const entry = async () => (entryCode ??= await bundle("test/unit/data-net/fixtures/harvest-entry.js"));

/** Serves the page in timed chunks; the big entry-point block is split in the middle of its JSON. */
function streamingServer() {
  const entryText = json(HOME.sjs[0]);
  const half = Math.floor(entryText.length / 2);
  const opening = sjs(entryText).slice(0, sjs(entryText).indexOf(">") + 1);
  const chunks = [
    [0, `<!doctype html><html lang="en"><head><meta charset="utf-8">${ENV}${sjs(CONFIG)}${opening}${entryText.slice(0, half)}`],
    [400, `${entryText.slice(half)}</script>${sjs(json(HOME.sjs[1]))}</head><body><div id="mount_0_0_Ab"></div>`],
    [400, `${sjs(json(HOME.sjs[2]))}${sjs(json(HOME.sjs[3]))}${sjs("{not json")}<div>end</div></body></html>`],
  ];
  const server = http.createServer(async (req, res) => {
    if (req.url !== "/") return res.writeHead(404).end();
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "set-cookie": "c_user=100000000000077; Path=/" });
    for (const [wait, text] of chunks) {
      await new Promise((r) => setTimeout(r, wait));
      res.write(text);
    }
    res.end();
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

const readHarvest = () => {
  const h = window.__harvest;
  return {
    userId: h.tokens.userId,
    lsd: h.tokens.lsd,
    dtsg: h.tokens.dtsg,
    rev: h.tokens.site.client_revision,
    preloaders: [...h.preloaders.keys()],
    feedStyle: h.preloaders.get("CometModernHomeFeedQuery")?.variables?.feedStyle,
    prefetched: Object.fromEntries([...h.prefetched].map(([k, v]) => [k, v.length])),
    pairs: h.env.typenamePairs,
    snapshot: h.snapshot(),
    log: window.__harvestLog,
  };
};

test("document_start: streamed data-sjs scripts are read as the parser completes them", { skip }, async () => {
  const server = await streamingServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-proxy-server"] });
  try {
    const context = await browser.newContext();
    await context.addInitScript({ content: await entry() });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" });
    await page.evaluate(() => window.__harvest.ready);
    const r = await page.evaluate(readHarvest);

    assert.equal(r.lsd, "AdR16GsCBuzx6HMHP0pOQzBIMP8");
    assert.equal(r.dtsg, "NAcBrowserTest:17:1800000000");
    assert.equal(r.rev, 1051133768);
    assert.equal(r.userId, "100000000000077", "no CurrentUserInitialData: the c_user cookie is used");
    assert.deepEqual(r.preloaders, [FEED, "CometHomeContactChatSidebarQuery"]);
    assert.equal(r.feedStyle, "MOST_RECENT_FRIENDS_FEED");
    assert.deepEqual(Object.values(r.prefetched), [3]);
    assert.deepEqual(r.pairs, [["Zq8Wn3Lx0Pd4Rt7", "Story"]]);
    assert.equal(r.snapshot.failed, 1, "the malformed block is counted, not fatal");

    const firstFeed = r.log.updates.find((u) => u.preloaders.includes(FEED));
    assert.ok(firstFeed, "an update carried the feed preloader");
    assert.ok(firstFeed.t < r.log.dcl, `captured while streaming (${firstFeed.t.toFixed(0)} ms) before DOMContentLoaded (${r.log.dcl.toFixed(0)} ms)`);
    assert.ok(firstFeed.t > 300, "the split script was read only once its second half arrived");
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
    server.close();
  }
});

test("late injection reads existing scripts; scripts added after load are picked up", { skip }, async () => {
  const b = await launchBrowser();
  try {
    const html = `<!doctype html><html lang="en"><head>${ENV}${sjs(CONFIG)}${HOME.sjs.map((x) => sjs(json(x))).join("")}</head><body><div id="mount_0_0_Ab"></div></body></html>`;
    const page = await b.newPage({ html });
    await page.addScriptTag({ content: await entry() });
    await page.evaluate(() => window.__harvest.ready);
    let r = await page.evaluate(readHarvest);
    assert.deepEqual(r.preloaders, [FEED, "CometHomeContactChatSidebarQuery"]);
    assert.deepEqual(Object.values(r.prefetched), [3]);
    assert.equal(r.snapshot.failed, 0);

    // A block inserted complete, and one whose text arrives after insertion (both after DOMContentLoaded).
    await page.evaluate(() => {
      const make = () => {
        const s = document.createElement("script");
        s.type = "application/json";
        s.setAttribute("data-sjs", "");
        return s;
      };
      const complete = make();
      complete.textContent = JSON.stringify({ x: [{ preloaderID: "adp_GroupsCometLeftRailQueryRelayPreloader_1", queryID: "26000000000000001", variables: {}, queryName: "GroupsCometLeftRailQuery" }] });
      document.body.appendChild(complete);
      const late = make();
      document.body.appendChild(late);
      late.appendChild(document.createTextNode('{"require":[["DTSGInitData",[],{"token":"NAcAfterNav:1:2"},1]]}'));
    });
    await page.waitForFunction(() => window.__harvest.tokens.dtsg === "NAcAfterNav:1:2");
    r = await page.evaluate(readHarvest);
    assert.ok(r.preloaders.includes("GroupsCometLeftRailQuery"));

    // A malformed block is counted once and never re-parsed, whatever happens afterwards.
    const failed = await page.evaluate(async () => {
      const bad = document.createElement("script");
      bad.type = "application/json";
      bad.setAttribute("data-sjs", "");
      bad.textContent = '{"require": [broken';
      document.body.appendChild(bad);
      await new Promise((r) => setTimeout(r, 0));
      const parse = JSON.parse;
      let attempts = 0;
      JSON.parse = (...args) => (attempts++, parse(...args)); // test page only: count parse attempts
      try {
        for (let i = 0; i < 20; i++) document.body.appendChild(document.createElement("div"));
        await new Promise((r) => setTimeout(r, 0));
        window.__harvest.refresh();
        window.__harvest.refresh();
      } finally {
        JSON.parse = parse;
      }
      return { failed: window.__harvest.snapshot().failed, attempts };
    });
    assert.deepEqual(failed, { failed: 1, attempts: 0 });

    // stop() disconnects the observer.
    await page.evaluate(() => {
      window.__harvest.stop();
      const s = document.createElement("script");
      s.type = "application/json";
      s.setAttribute("data-sjs", "");
      s.textContent = '{"require":[["LSD",[],{"token":"AFTER_STOP"},1]]}';
      document.body.appendChild(s);
    });
    await new Promise((res) => setTimeout(res, 50));
    assert.equal(await page.evaluate(() => window.__harvest.tokens.lsd), "AdR16GsCBuzx6HMHP0pOQzBIMP8");
    assert.deepEqual(page.__errors ?? [], []);
  } finally {
    await b.close();
  }
});
