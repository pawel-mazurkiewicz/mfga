// Privacy and page-visibility guarantees of the BUILT products (dist/mfga.user.js, dist/chrome) on the fake
// facebook.com. Rebuild with `npm run build` first.
//
//   * after Log Out the next person sees nothing of the previous account, and the rail cache is deleted
//   * the MAIN-world helper answers only on its per-load channel (page scripts can neither probe nor read it)
//   * "Use the page helper" off: no requireLazy probe at all; the userscript plants nothing in the page
//   * userscript content mode: the planted helper <script> does not stay in the DOM

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DIST, hasExtension, hasUserscript, launchTidyBrowser, userscriptInit } from "./helpers/product.mjs";
import { fixtureNow, installSite } from "./helpers/site.mjs";

const TIMEOUT = 150000;
const REACT = "CometUFIFeedbackReactMutation";
const FALLBACK_REACT_DOC_ID = "27646120298312844"; // src/data/ops.js FALLBACK_DOC_IDS

// The 2026 logged-out home page (research/samples/live-loggedout-page-frames-2026-10-21.txt): a Comet page with
// USER_ID "0" and the login form.
const LOGGED_OUT_HTML = `<!doctype html><html lang="en" id="facebook"><head><meta charset="utf-8"><title>Facebook - log in or sign up</title></head><body>
<script type="application/json" data-sjs>{"require":[["ScheduledServerJS","handle",null,[{"__bbox":{"define":[["SiteData",[],{"server_revision":1051133768,"client_revision":1051133768,"pkg_cohort":"HYP:comet_loggedout_pkg"},317],["CurrentUserInitialData",[],{"ACCOUNT_ID":"0","USER_ID":"0","NAME":"","SHORT_NAME":null},270],["LSD",[],{"token":"AdLoggedOutLsdToken000000"},323]]}}]]]}</script>
<div id="mount_0_0_qI"><div><div role="main"><form id="login"><input name="email" placeholder="Email address or phone number"><input name="pass" type="password" placeholder="Password"><button type="submit" name="login">Log in</button></form></div></div></div>
</body></html>`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, { timeout = 20000, what = "condition" } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(200);
  }
}

/**
 * Launches a product with a fake site. opts: settings (stored before any page loads), contentMode (userscript
 * as in Violentmonkey content mode: helper planted with GM_addElement), watchScripts (records every <script>
 * added to the page whose text mentions "mfga:", even if removed at once).
 */
async function launch(target, { settings = null, contentMode = false, watchScripts = false, storage = "gm", pageSettings = null, siteOpts = {} } = {}) {
  const b = await launchTidyBrowser(target === "extension" ? { extensionPath: DIST.extension } : {});
  const state = { loggedOut: false };
  // Registered before the site's routes, so it wins once state.loggedOut is set.
  b.route(
    (u, request) => state.loggedOut && u.hostname === "www.facebook.com" && request.resourceType() === "document",
    (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: LOGGED_OUT_HTML }),
  );
  const site = await installSite(b, { now: fixtureNow(), ...siteOpts });
  if (watchScripts) {
    await b.context.addInitScript({
      content: `window.__plantedScripts = []; new MutationObserver((records) => { for (const r of records) for (const n of r.addedNodes) if (n.nodeName === "SCRIPT" && (n.text || "").includes('"mfga:"')) window.__plantedScripts.push(n.text.length); }).observe(document, { childList: true, subtree: true });`,
    });
  }
  let sw = null;
  if (target === "userscript") {
    if (settings) await b.context.addInitScript({ content: `localStorage.setItem("__gm_store__:mfga:settings", ${JSON.stringify(JSON.stringify(settings))});` });
    let init = userscriptInit(readFileSync(DIST.userscript, "utf8"));
    if (contentMode) init = init.replace(`injectInto: "page"`, `injectInto: "content"`);
    assert.ok(!contentMode || init.includes(`injectInto: "content"`), "content mode shim");
    // Managers with only the async GM.* storage API, or with no storage API at all.
    const GM_EXPORTS = "Object.assign(globalThis, { GM, GM_info, GM_getValue, GM_setValue, ";
    if (storage !== "gm") {
      assert.ok(init.includes(GM_EXPORTS), "storage shim");
      init = init.replace(GM_EXPORTS, storage === "gm-async" ? "Object.assign(globalThis, { GM, GM_info, " : "Object.assign(globalThis, { GM: { info: GM_info }, GM_info, ");
    }
    if (pageSettings) await b.context.addInitScript({ content: `localStorage.setItem("mfga:settings", ${JSON.stringify(JSON.stringify(pageSettings))});` });
    await b.context.addInitScript({ content: init });
  } else {
    sw = b.context.serviceWorkers()[0] || (await b.context.waitForEvent("serviceworker"));
    if (settings) await sw.evaluate((s) => chrome.storage.local.set({ "mfga:settings": s }), settings);
  }
  const readStored = async (page, key) =>
    target === "extension"
      ? (await sw.evaluate((k) => chrome.storage.local.get(k), key))[key]
      : page.evaluate((k) => {
          const raw = localStorage.getItem(`__gm_store__:${k}`);
          return raw == null ? undefined : JSON.parse(raw);
        }, key);
  return {
    b,
    site,
    state,
    readStored,
    open: (p = "/") => b.newPage({ url: site.url(p) }),
    close: () => b.close(),
  };
}

async function withProduct(target, opts, fn) {
  const p = await launch(target, opts);
  try {
    await fn(p);
  } finally {
    await p.close();
  }
}

/** Likes the first not-yet-liked story; returns the mock's log entry of that mutation. */
async function likeFirstStory(page, site) {
  await page.waitForFunction(() => document.querySelectorAll("#mfga-stream .mfga-story[data-key]").length >= 3, null, { timeout: 90000, polling: 250 });
  const keys = await page.$$eval("#mfga-stream .mfga-story[data-key]", (els) => els.map((el) => el.dataset.key));
  const key = keys.find((k) => site.world.feedback.get(k) && !site.world.feedback.get(k).viewerReaction);
  const before = site.mock.requests(REACT).length;
  await page.locator(`#mfga-stream .mfga-story[data-key="${key}"]`).getByRole("button", { name: "Like", exact: true }).first().click();
  return waitFor(() => site.mock.requests(REACT).filter((e) => e.end)[before], { timeout: 30000, what: "the Like mutation" });
}

/** Page-world probe of the old fixed channel: every answer a page script gets back. */
const probeFixedChannel = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const seen = [];
        document.addEventListener("mfga:v1:res", (e) => seen.push(e.detail));
        document.dispatchEvent(new CustomEvent("mfga:v1:req", { detail: JSON.stringify({ id: 1, method: "ping", params: {} }) }));
        document.dispatchEvent(new CustomEvent("mfga:v1:req", { detail: JSON.stringify({ id: 2, method: "readTokens", params: {} }) }));
        setTimeout(() => resolve(seen), 1500);
      }),
  );

const TARGETS = [
  ["userscript", hasUserscript(), DIST.userscript],
  ["extension", hasExtension(), DIST.extension],
];

for (const [target, available, distPath] of TARGETS) {
  describe(`MFGA ${target}: privacy`, { skip: !available && `no build at ${path.basename(distPath)} (npm run build)` }, () => {
    test("after Log Out the login page shows nothing of the previous account and the rail cache is deleted", { timeout: TIMEOUT }, async () => {
      await withProduct(target, {}, async ({ b, site, state, readStored, open }) => {
        const viewer = site.world.viewer;
        const home = await open("/");
        await home.waitForFunction((name) => document.querySelector("#mfga-shell .mfga-nav-me-name")?.textContent === name, viewer.name, { timeout: 60000 });
        const cached = await waitFor(async () => {
          const rail = await readStored(home, "mfga:rail");
          return rail?.groups?.length && rail?.contacts?.length ? rail : null;
        }, { what: "the rail cache" });
        assert.equal(cached.userId, viewer.id);
        await home.close();

        await b.context.clearCookies();
        state.loggedOut = true;
        const page = await open("/");
        await page.waitForSelector("#login", { timeout: 30000 });
        await waitFor(async () => (await readStored(page, "mfga:rail")) == null, { what: "the rail cache to be deleted" });
        await sleep(1500);
        const ui = await page.evaluate(
          ({ names }) => {
            const visible = (el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
            };
            const text = document.body.innerText;
            const host = document.getElementById("mfga-shell");
            return {
              leaked: names.filter((n) => text.includes(n)),
              shell: !!host && [...host.querySelectorAll("*")].some((el) => visible(el) && el.getBoundingClientRect().width * el.getBoundingClientRect().height > 2000),
              loginVisible: visible(document.querySelector('input[name="pass"]')),
              feed: document.documentElement.getAttribute("data-mfga-feed"),
              themed: document.documentElement.hasAttribute("data-mfga-theme"),
            };
          },
          { names: [viewer.name, ...cached.groups.map((g) => g.name), ...cached.contacts.map((c) => c.name)] },
        );
        assert.deepEqual(ui.leaked, [], "no name, group or chat contact of the previous account is on the page");
        assert.equal(ui.shell, false, "no 2010 shell over Facebook's login page");
        assert.equal(ui.loginVisible, true, "Facebook's login form stays usable");
        assert.notEqual(ui.feed, "ours");
        assert.equal(ui.themed, true, "the page is still re-themed");
      });
    });

    test("the page helper answers only on its per-load channel; a page script cannot probe it or read tokens", { timeout: TIMEOUT }, async () => {
      await withProduct(target, { siteOpts: { acceptDossierDocIds: false } }, async ({ site, open }) => {
        const page = await open("/");
        const like = await likeFirstStory(page, site);
        assert.equal(like.errorCode, null, like.error);
        assert.equal(like.docId, site.mock.docIds[REACT], "the doc_id came from the page (helper probe), not the fallback table");
        assert.deepEqual(await probeFixedChannel(page), [], "no answer on a page-guessable channel");
        assert.equal(await page.evaluate(() => document.documentElement.hasAttribute("data-mfga-channel")), false, "the channel id is not left on <html>");
      });
    });

    test('"Use the page helper" off: no page probe, the fallback doc_id is used', { timeout: TIMEOUT }, async () => {
      await withProduct(target, { settings: { advanced: { mainWorldHelper: false } }, watchScripts: true }, async ({ site, open }) => {
        const page = await open("/");
        const like = await likeFirstStory(page, site);
        assert.equal(like.docId, FALLBACK_REACT_DOC_ID, "no requireLazy probe for the Like doc_id");
        assert.deepEqual(await page.evaluate(() => window.__plantedScripts), [], "nothing planted in the page");
      });
    });

    if (target === "userscript") {
      test("content mode: the planted helper works over the channel and its <script> does not stay in the DOM", { timeout: TIMEOUT }, async () => {
        await withProduct(target, { contentMode: true, watchScripts: true, siteOpts: { acceptDossierDocIds: false } }, async ({ site, open }) => {
          const page = await open("/");
          const like = await likeFirstStory(page, site);
          assert.equal(like.docId, site.mock.docIds[REACT], "the helper's probe answered over the bridge");
          const dom = await page.evaluate(() => ({
            planted: window.__plantedScripts.length,
            left: [...document.scripts].filter((s) => s.text.includes('"mfga:"')).length,
            channelAttr: document.documentElement.hasAttribute("data-mfga-channel"),
          }));
          assert.deepEqual(dom, { planted: 1, left: 0, channelAttr: false });
          assert.deepEqual(await probeFixedChannel(page), []);
        });
      });

      test("no GM storage API: only the settings, without the keyword list, go to facebook.com's localStorage", { timeout: TIMEOUT }, async () => {
        await withProduct(target, { storage: "none", pageSettings: { feed: { keywords: ["my secret phrase"] } } }, async ({ site, open }) => {
          const page = await open("/");
          await page.waitForFunction((name) => document.querySelector("#mfga-shell .mfga-nav-me-name")?.textContent === name, site.world.viewer.name, { timeout: 60000 });
          await page.waitForFunction(() => document.querySelectorAll("#mfga-stream .mfga-story[data-key]").length >= 3, null, { timeout: 90000 });
          await page.locator("#mfga-stream").getByRole("button", { name: "Top News" }).click();
          await waitFor(() => page.evaluate(() => JSON.parse(localStorage.getItem("mfga:settings") || "{}").feed?.mode === "top"), { what: "the settings write" });
          await sleep(2500); // the rail cache and op registry would have been written by now
          const stored = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith("mfga:")).map((k) => [k, localStorage.getItem(k)])));
          assert.deepEqual(Object.keys(stored).sort(), ["mfga:settings"], "no rail cache, op templates or other MFGA data in the page's storage");
          assert.deepEqual(JSON.parse(stored["mfga:settings"]).feed.keywords, [], "the private keyword list is not written where Facebook can read it");
        });
      });

      test("a manager with only the async GM.* API keeps MFGA's data in its own store", { timeout: TIMEOUT }, async () => {
        await withProduct(target, { storage: "gm-async" }, async ({ site, open }) => {
          const page = await open("/");
          await page.waitForFunction(() => document.querySelectorAll("#mfga-stream .mfga-story[data-key]").length >= 3, null, { timeout: 90000 });
          await page.locator("#mfga-stream").getByRole("button", { name: "Top News" }).click();
          const saved = await waitFor(() => page.evaluate(() => localStorage.getItem("__gm_store__:mfga:settings")), { what: "the settings write" });
          assert.equal(JSON.parse(JSON.parse(saved)).feed.mode, "top", "stored through GM.setValue (as JSON text)");
          await waitFor(() => page.evaluate(() => localStorage.getItem("__gm_store__:mfga:rail")), { what: "the rail cache in the manager's store" });
          assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("mfga:"))), [], "nothing in facebook.com's own storage");
          assert.ok(site.world.viewer.name);
        });
      });

      test("content mode with the helper switched off plants nothing", { timeout: TIMEOUT }, async () => {
        await withProduct(target, { contentMode: true, watchScripts: true, settings: { advanced: { mainWorldHelper: false } } }, async ({ site, open }) => {
          const page = await open("/");
          const like = await likeFirstStory(page, site);
          assert.equal(like.docId, FALLBACK_REACT_DOC_ID);
          assert.deepEqual(await page.evaluate(() => window.__plantedScripts), []);
        });
      });
    }
  });
}
