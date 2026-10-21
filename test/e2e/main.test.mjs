// End-to-end tests of src/main.js (how the modules are wired together) on the BUILT products and the fake
// facebook.com: settings changed at runtime, a deploy that retires the stored doc_id, abandoned feeds, the
// checkpoint notice, the composer fallback and the extension's request learner. Rebuild with `npm run build`.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DIST, hasExtension, hasUserscript, launchProduct } from "./helpers/product.mjs";
import { fixtureNow } from "./helpers/site.mjs";

const TIMEOUT = 150000;
const FEED = "CometModernHomeFeedQuery";
const SETTINGS_KEY = "__gm_store__:mfga:settings";

const storyCount = (page) => page.evaluate(() => document.querySelectorAll("#mfga-stream .mfga-story[data-key]").length);
const waitStories = (page, n = 3, timeout = 90000) =>
  page.waitForFunction((min) => document.querySelectorAll("#mfga-stream .mfga-story[data-key]").length >= min, n, { timeout, polling: 250 });
const feedAttr = (page) => page.evaluate(() => document.documentElement.getAttribute("data-mfga-feed"));
const openSettings = (page) => page.evaluate(() => globalThis.__gmMenu.find((m) => /settings/i.test(m.label)).fn());

/** Facebook's own posts ([aria-posinset] outside our stream) that are actually on screen. */
const nativePostsShown = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll("[aria-posinset]")].filter((el) => {
        if (el.closest("#mfga-stream") || !el.getClientRects().length) return false;
        for (let n = el; n && n.nodeType === 1; n = n.parentElement) if (getComputedStyle(n).visibility === "hidden") return false;
        return true;
      }).length,
  );

/** Changes the stored settings the way another tab would (the GM shim reports it as a remote change). */
async function storeFromOtherTab(p, patch) {
  const other = await p.open("/robots-free-page");
  await other.evaluate(
    ([key, patchJson]) => {
      const merge = (a, b) => {
        for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === "object" && !Array.isArray(v) ? merge(a[k] || {}, v) : v;
        return a;
      };
      localStorage.setItem(key, JSON.stringify(merge(JSON.parse(localStorage.getItem(key) || "{}"), JSON.parse(patchJson))));
    },
    [SETTINGS_KEY, JSON.stringify(patch)],
  );
  await other.close();
}

/** Clicks a visible 2010 link to the plain home page ("/"): an SPA navigation through the shell's navigator. */
const clickHomeLink = (page) =>
  page.evaluate(() => {
    const a = [...document.querySelectorAll("#mfga-shell a[href]")].find((el) => {
      const u = new URL(el.href);
      return u.pathname === "/" && !u.search && el.getClientRects().length;
    });
    a.click();
    return !!a;
  });

/**
 * A profile page whose in-app navigation to "/" behaves like Facebook's router: the HTML it fetches carries no
 * new data-sjs preloaders (only a full page load does).
 */
async function openProfileWithRealisticRouter(p) {
  const page = await p.open(`/${p.site.world.friends[0].vanity}`);
  await page.route(
    (u) => u.pathname === "/",
    async (route, request) => {
      if (request.resourceType() !== "fetch") return route.fallback();
      const html = p.site.render("home", { feed: "top" }).html.replace(/<script type="application\/json"[^>]*data-sjs[^>]*>[\s\S]*?<\/script>/g, "");
      return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
    },
  );
  await page.waitForSelector("#mfga-shell a", { state: "attached", timeout: 30000 });
  await page.waitForTimeout(1000);
  return page;
}

async function withProduct(target, fn, siteOpts = {}) {
  const p = await launchProduct(target, { now: fixtureNow(), ...siteOpts });
  const errors = [];
  p.b.context.on("page", (page) => page.on("pageerror", (e) => errors.push(e)));
  try {
    await fn(p, errors);
  } finally {
    await p.close();
  }
}

describe("MFGA userscript: wiring (src/main.js)", { skip: !hasUserscript() && `no build at ${DIST.userscript} (npm run build)` }, () => {
  test("a deploy retired the stored doc_id: an SPA visit to Home sends the probed id with the old variables", { timeout: TIMEOUT }, async () => {
    await withProduct("userscript", async (p) => {
      const home = await p.open("/");
      await waitStories(home, 5);
      await home.waitForTimeout(500); // the descriptor is persisted asynchronously
      const stale = p.site.mock.docIds[FEED];
      p.site.mock.rotateDocId(FEED, "31234567890123456");
      await home.close();

      const page = await openProfileWithRealisticRouter(p);
      const from = p.site.mock.feedRequests().length;
      await clickHomeLink(page);
      await page.waitForFunction(() => location.pathname === "/", null, { timeout: 10000 });
      await waitStories(page, 5, 60000);
      assert.equal(await feedAttr(page), "ours");
      assert.equal(await page.locator("#mfga-stream .mfga-feed-error").count(), 0, "no error box");
      const sent = p.site.mock.feedRequests().slice(from);
      assert.deepEqual(
        sent.slice(0, 2).map((e) => [e.docId, e.errorCode ?? "ok"]),
        [
          [stale, 1570245],
          ["31234567890123456", "ok"],
        ],
        "the retired id once, then the new id (from the page's module registry) with the old variables template",
      );
      assert.ok(sent.slice(1).every((e) => e.docId === "31234567890123456" && !e.errorCode), "every later request uses the new id");
    });
  });

  test("no usable doc_id at all: Home falls back to Facebook's own feed and News Feed reloads the page", { timeout: TIMEOUT }, async () => {
    await withProduct("userscript", async (p) => {
      const home = await p.open("/");
      await waitStories(home, 5);
      await home.waitForTimeout(500);
      // No page helper (so no probe), and every id we try is rejected as retired.
      await home.evaluate((key) => {
        const s = JSON.parse(localStorage.getItem(key) || "{}");
        localStorage.setItem(key, JSON.stringify({ ...s, advanced: { ...(s.advanced || {}), mainWorldHelper: false } }));
      }, SETTINGS_KEY);
      await home.close();
      p.site.mock.inject.staleDoc = 1000;

      const page = await openProfileWithRealisticRouter(p);
      await clickHomeLink(page);
      await page.waitForFunction(() => location.pathname === "/", null, { timeout: 10000 });
      await page.waitForFunction(() => document.documentElement.getAttribute("data-mfga-feed") === "native", null, { timeout: 60000 });
      await page.waitForTimeout(500);
      assert.ok((await nativePostsShown(page)) > 0, "Facebook's own (cleaned) feed is shown instead of an error box");
      const requests = p.site.mock.feedRequests().length;
      await page.waitForTimeout(3000);
      assert.equal(p.site.mock.feedRequests().length, requests, "nothing more is sent for a feed that cannot work");

      // §3.1: "News Feed" now does a full page load, which carries a fresh preloader.
      p.site.mock.inject.staleDoc = 0;
      await page.evaluate(() => (window.__beforeReload = true));
      await clickHomeLink(page);
      await page.waitForFunction(() => !window.__beforeReload, null, { timeout: 20000 });
      await waitStories(page, 3);
      assert.equal(await feedAttr(page), "ours");
    });
  });

  test("Top News chosen in the settings dialog switches the visible feed", { timeout: TIMEOUT }, async () => {
    await withProduct("userscript", async (p) => {
      const page = await p.open("/");
      await waitStories(page, 5);
      const from = p.site.mock.feedRequests().length;
      await openSettings(page);
      await page.getByRole("radio", { name: /Top News/ }).check();
      await page.waitForFunction(() => document.querySelector("#mfga-stream .mfga-feed-mode-on")?.textContent === "Top News", null, { timeout: 15000 });
      await waitStories(page, 3);
      await page.waitForTimeout(2000);
      const styles = p.site.mock.feedRequests().slice(from).map((e) => e.variables?.feedStyle);
      assert.ok(styles.length > 0 && styles.every((s) => s === "DEFAULT"), `only Top News is fetched: ${styles}`);
    });
  });

  test("the view's own Top News switch reloads once: the settings echo does not rebuild it", { timeout: TIMEOUT }, async () => {
    await withProduct("userscript", async (p) => {
      const page = await p.open("/");
      await waitStories(page, 5);
      await page.waitForTimeout(3000);
      const from = p.site.mock.feedRequests().length;
      await page.evaluate(() => (window.__view = document.getElementById("mfga-stream")));
      await page.locator("#mfga-stream").getByRole("button", { name: "Top News" }).click();
      await waitStories(page, 3);
      await page.waitForTimeout(6000);
      assert.ok(await page.evaluate(() => document.getElementById("mfga-stream") === window.__view), "the view that switched is kept, not rebuilt");
      const sent = p.site.mock.feedRequests().slice(from).map((e) => `${e.variables?.feedStyle}:${e.variables?.feedEndCursor ?? "-"}`);
      assert.equal(new Set(sent).size, sent.length, `no page is asked for twice: ${sent.join(" ")}`);
    });
  });

  test("Top News clicked on a ?filter= route loads the Top News feed once, not again after the way back to \"/\"", { timeout: TIMEOUT }, async () => {
    await withProduct("userscript", async (p) => {
      const page = await p.open("/?filter=friends&sk=h_chr");
      await waitStories(page, 3);
      await page.waitForTimeout(2000);
      const from = p.site.mock.feedRequests().length;
      await page.evaluate(() => (window.__view = document.getElementById("mfga-stream")));
      await page.locator("#mfga-stream").getByRole("button", { name: "Top News" }).click();
      await page.waitForFunction(() => location.search === "", null, { timeout: 15000 });
      await waitStories(page, 3);
      await page.waitForTimeout(6000);
      assert.ok(await page.evaluate(() => document.getElementById("mfga-stream") === window.__view), "the view that switched is kept, not rebuilt");
      const sent = p.site.mock.feedRequests().slice(from).map((e) => `${e.variables?.feedStyle}:${e.variables?.feedEndCursor ?? "-"}`);
      assert.ok(sent.length > 0 && sent.every((s) => s.startsWith("DEFAULT:")), `Top News only: ${sent.join(" ")}`);
      assert.equal(new Set(sent).size, sent.length, `no page is asked for twice: ${sent.join(" ")}`);
    });
  });

  test("feed settings changed away from Home apply when Home is shown again", { timeout: TIMEOUT }, async () => {
    await withProduct("userscript", async (p) => {
      const page = await p.open("/");
      await waitStories(page, 5);
      const first = await page.$eval("#mfga-stream .mfga-story[data-key]", (el) => ({ key: el.dataset.key, text: el.textContent }));
      const word = (first.text.match(/[A-Za-z]{6,}/g) || [])[2];
      assert.ok(word, "a word of the first story to mute");
      await page.evaluate((vanity) => {
        const a = [...document.querySelectorAll("#mfga-shell a[href]")].find((el) => el.getClientRects().length && new URL(el.href).pathname === `/${vanity}`);
        (a || [...document.querySelectorAll("#mfga-shell a[href*='/groups/']")].find((el) => el.getClientRects().length)).click();
      }, p.site.world.viewer.vanity);
      await page.waitForFunction(() => document.documentElement.getAttribute("data-mfga-route") !== "home", null, { timeout: 15000 });
      await storeFromOtherTab(p, { feed: { keywords: [word] } });
      await page.waitForTimeout(1000);
      await clickHomeLink(page);
      await page.waitForFunction(() => document.documentElement.getAttribute("data-mfga-feed") === "ours", null, { timeout: 15000 });
      await waitStories(page, 3);
      await page.waitForTimeout(1500);
      assert.equal(await page.locator(`#mfga-stream .mfga-story[data-key="${first.key}"]`).count(), 0, `the story with "${word}" is hidden`);
    });
  });

  test("rapid source toggles build one feed: abandoned feeds stop fetching", { timeout: TIMEOUT }, async () => {
    await withProduct("userscript", async (p) => {
      const page = await p.open("/");
      await waitStories(page, 5);
      await page.waitForTimeout(3000);
      const from = p.site.mock.feedRequests().length;
      await openSettings(page);
      const box = page.getByRole("checkbox", { name: /^Pages/ });
      await box.uncheck();
      await page.waitForTimeout(150);
      await box.check();
      await page.waitForTimeout(150);
      await box.uncheck();
      await page.waitForTimeout(15000);
      const sent = p.site.mock.feedRequests().slice(from).map((e) => `${e.variables?.feedStyle}:${e.variables?.feedEndCursor ?? "-"}`);
      assert.ok(sent.length <= 6, `one first page of the final feed (${sent.length} requests: ${sent.join(" ")})`);
      assert.equal(new Set(sent).size, sent.length, `no page is asked for twice: ${sent.join(" ")}`);
      assert.ok(!sent.some((s) => s.startsWith("MOST_RECENT_PAGES_FEED")), "the final feed has no Pages source");
      const gaps = p.site.mock.gaps(p.site.mock.log.filter((e) => e.method === "POST").slice(-sent.length));
      assert.ok(gaps.every((g) => g >= 1500), `requests at least 1.5 s apart (ARCHITECTURE rule 8): ${gaps.join(", ")}`);
    });
  });

  test("2010 layout turned on at runtime brings the shell, not just a hidden banner", { timeout: TIMEOUT }, async () => {
    await withProduct("userscript", async (p) => {
      const first = await p.open("/");
      await first.evaluate((key) => localStorage.setItem(key, JSON.stringify({ look: { shell: false } })), SETTINGS_KEY);
      await first.close();
      const page = await p.open("/");
      await waitStories(page, 3);
      assert.equal(await page.evaluate(() => document.querySelector("#mfga-shell")?.children.length ?? 0), 0, "no shell yet");
      await openSettings(page);
      await page.getByRole("tab", { name: /Look/ }).click();
      await page.getByRole("checkbox", { name: /2010 layout/ }).check();
      await page.waitForFunction(() => document.querySelector("#mfga-shell .mfga-shell-root"), null, { timeout: 15000 });
      assert.ok(await page.$eval("#mfga-shell", (host) => !host.hidden && host.children.length > 0), "the shell is drawn");
      await waitStories(page, 3);
    });
  });

  test("2010 layout off: Home still gets the combined feed, and Facebook's right-column ads are hidden", { timeout: TIMEOUT }, async () => {
    await withProduct("userscript", async (p, errors) => {
      const first = await p.open("/");
      await first.evaluate((key) => localStorage.setItem(key, JSON.stringify({ look: { shell: false } })), SETTINGS_KEY);
      await first.close();
      const page = await p.open("/");
      await waitStories(page, 5);
      assert.equal(await feedAttr(page), "ours");
      assert.equal(await page.evaluate(() => document.documentElement.hasAttribute("data-mfga-shell")), false, "Facebook's own layout");
      assert.equal(await nativePostsShown(page), 0, "Facebook's feed (and its ads) is replaced");
      const rail = await page.evaluate(() => {
        const rail = document.querySelector('[role="complementary"]');
        const shown = (el) => !!el.getClientRects().length;
        return {
          ads: [...rail.querySelectorAll('a[target^="rhcad"]')].filter(shown).length,
          headings: [...rail.querySelectorAll("h3")].filter(shown).map((h) => h.textContent),
        };
      });
      assert.equal(rail.ads, 0, "no right-column ad on screen");
      assert.deepEqual(rail.headings, ["Birthdays", "Contacts", "Group chats"], "the rest of the column stays");
      // Facebook's column is a centred flex row: the stream takes a feed column's width, not its content's.
      await page.setViewportSize({ width: 1920, height: 1000 });
      const width = () => page.evaluate(() => Math.round(document.getElementById("mfga-stream").getBoundingClientRect().width));
      assert.equal(await width(), 680, "a feed column's width on a wide window");
      assert.equal(await page.locator(".mfga-welcome-m3").isVisible(), false, "the welcome miniature points at no 2010 Account menu");
      await page.locator(".mfga-welcome-close").click();
      assert.equal(await width(), 680, "closing the welcome box does not resize the stream");
      assert.deepEqual(errors, []);
    });
  });

  test("signed out, the login page's own [role=main] is not hidden while the page loads", { timeout: TIMEOUT }, async () => {
    await withProduct("userscript", async (p, errors) => {
      await p.b.context.clearCookies();
      const page = await p.b.context.newPage();
      let release;
      const slow = new Promise((resolve) => (release = resolve));
      await page.route("https://www.facebook.com/slow.js", async (route) => {
        await slow; // a parser-blocking bundle still downloading
        await route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
      });
      await page.route(
        (u) => u.hostname === "www.facebook.com" && u.pathname === "/",
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            // The 2026 logged-out "/": the login form, then one [role=main] with the language list and footer links.
            body: '<!doctype html><html lang="en"><head><title>Facebook - log in or sign up</title></head><body><div id="mount_0_0_Ab"><form id="login_form"><input name="email"><button>Log in</button></form><div role="main"><div>English (US) · Polski</div><div><a href="/r.php">Sign Up</a></div></div></div><script src="/slow.js"></script></body></html>',
          }),
      );
      const loaded = page.goto("https://www.facebook.com/");
      await page.waitForSelector('[role="main"]', { state: "attached" });
      await page.waitForFunction(() => document.documentElement.hasAttribute("data-mfga"), null, { timeout: 10000 });
      await page.waitForTimeout(1000);
      const during = await page.evaluate(() => ({
        loading: document.readyState === "loading",
        feed: document.documentElement.getAttribute("data-mfga-feed"),
        hidden: [...document.querySelector('[role="main"]').children].filter((c) => getComputedStyle(c).visibility === "hidden").length,
      }));
      release();
      await loaded;
      assert.equal(during.loading, true, "measured while the page was still loading");
      assert.notEqual(during.feed, "pending");
      assert.equal(during.hidden, 0, "the language list and footer links are on screen");
      assert.deepEqual(errors, []);
    });
  });

  test("MFGA turned off in another tab takes the stream out; turned on again brings it back", { timeout: TIMEOUT }, async () => {
    await withProduct("userscript", async (p) => {
      const page = await p.open("/");
      await waitStories(page, 5);
      await storeFromOtherTab(p, { enabled: false });
      await page.waitForFunction(() => !document.documentElement.hasAttribute("data-mfga"), null, { timeout: 10000 });
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => !!document.getElementById("mfga-stream")?.getClientRects().length), false, "no unstyled stream over Facebook's feed");
      assert.ok((await nativePostsShown(page)) > 0, "Facebook's own feed is back");
      await storeFromOtherTab(p, { enabled: true });
      await page.waitForFunction(() => document.documentElement.getAttribute("data-mfga-feed") === "ours", null, { timeout: 15000 });
      await page.waitForFunction(() => document.getElementById("mfga-stream")?.getClientRects().length > 0, null, { timeout: 15000 });
      assert.ok((await storyCount(page)) >= 5);
    });
  });

  test("the settings dialog opened while MFGA is off is styled and on screen", { timeout: TIMEOUT }, async () => {
    await withProduct("userscript", async (p) => {
      const first = await p.open("/");
      await first.evaluate((key) => localStorage.setItem(key, JSON.stringify({ enabled: false })), SETTINGS_KEY);
      await first.close();
      const page = await p.open("/");
      await page.waitForFunction(() => globalThis.__gmMenu?.length >= 2, null, { timeout: 15000 });
      await openSettings(page);
      const dialog = page.getByRole("dialog", { name: /MFGA/ });
      await dialog.waitFor({ timeout: 10000 });
      const box = await dialog.boundingBox();
      const viewport = page.viewportSize();
      assert.ok(box && box.y >= 0 && box.y + 40 < viewport.height && box.width < viewport.width, `the dialog is in view: ${JSON.stringify(box)}`);
      assert.equal(await feedAttr(page), null, "MFGA stays off");
    });
  });

  test("a checkpoint halt on Home says why Facebook's own feed is back", { timeout: TIMEOUT }, async () => {
    await withProduct("userscript", async (p) => {
      const page = await p.open("/");
      await waitStories(page, 10);
      const older = page.locator("#mfga-stream").getByRole("button", { name: "Older Posts" });
      await older.waitFor();
      p.site.mock.inject.checkpoint = "html";
      await older.click();
      await page.waitForFunction(() => document.documentElement.getAttribute("data-mfga-feed") === "native", null, { timeout: 30000 });
      const notice = page.locator("#mfga-halted");
      await notice.waitFor({ state: "visible", timeout: 5000 });
      assert.match(await notice.textContent(), /paused its own requests/);
    });
  });

  test("\"What's on your mind?\" finds Facebook's composer without knowing its label (another language)", { timeout: TIMEOUT }, async () => {
    await withProduct("userscript", async (p, errors) => {
      const page = await p.open("/");
      await waitStories(page, 3);
      // The fake runtime opens its composer for the region its <template> names: rename both.
      await page.evaluate(() => {
        document.querySelector('[role="region"][aria-label="Create a post"]').setAttribute("aria-label", "Beitrag erstellen");
        document.querySelector("body > template[data-portal]").dataset.region = "Beitrag erstellen";
      });
      const docs = p.site.documents.length;
      await page.locator("#mfga-stream").getByRole("button", { name: "What's on your mind?" }).click();
      await page.waitForSelector('[role="dialog"][aria-label="Create post"]', { timeout: 10000 });
      assert.equal(p.site.documents.length, docs, "no navigation");
      assert.deepEqual(errors, []);
    });
  });

  test("a photo opened from our feed opens over Home: closing it returns to the same stream at the same place", { timeout: TIMEOUT }, async () => {
    await withProduct("userscript", async (p, errors) => {
      const page = await p.open("/");
      await waitStories(page, 10);
      const photo = page.locator("#mfga-stream a.mfga-att-photo").nth(2);
      await photo.scrollIntoViewIfNeeded();
      await page.evaluate(() => {
        document.getElementById("mfga-stream").mfgaTestMark = true;
      });
      const y = await page.evaluate(() => scrollY);
      assert.ok(y > 300, `scrolled into the feed (${y})`);
      const sent = p.site.mock.feedRequests().length;
      await photo.click();
      // The fake Comet shows its viewer 350 ms after the URL changes: MFGA has laid the page out for /photo/ by then.
      await page.waitForSelector("[data-fake-push-view]", { timeout: 10000 });
      await page.waitForTimeout(2000);
      assert.match(await page.evaluate(() => location.pathname), /^\/photo/);
      assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-mfga-route")), "home", "the 2010 home page stays under the viewer");
      assert.equal(await feedAttr(page), "ours");
      assert.ok(await page.evaluate(() => document.getElementById("mfga-stream")?.isConnected), "our stream stays in the column");
      assert.ok(Math.abs((await page.evaluate(() => scrollY)) - y) <= 2, "the page under the viewer keeps its place");

      await page.goBack();
      await page.waitForFunction(() => location.pathname === "/" && !document.querySelector("[data-fake-push-view]"), null, { timeout: 10000 });
      await page.waitForTimeout(800);
      assert.ok(await page.evaluate(() => document.getElementById("mfga-stream")?.mfgaTestMark === true), "the same stream, not a rebuilt one");
      assert.ok(Math.abs((await page.evaluate(() => scrollY)) - y) <= 2, "back where the reader was");
      assert.equal(p.site.mock.feedRequests().length, sent, "no feed request");
      assert.deepEqual(errors, []);
    });
  });

  test("a link inside the photo viewer leads to its page: Home is not kept under it", { timeout: TIMEOUT }, async () => {
    await withProduct("userscript", async (p, errors) => {
      const page = await p.open("/");
      await waitStories(page, 10);
      const photo = page.locator("#mfga-stream a.mfga-att-photo").first();
      await photo.scrollIntoViewIfNeeded();
      await photo.click();
      await page.waitForSelector("[data-fake-push-view]", { timeout: 10000 });
      await page.waitForFunction(() => document.documentElement.getAttribute("data-mfga-route") === "home", null, { timeout: 5000 });
      await page.locator("[data-fake-push-view] a").click();
      await page.waitForFunction(() => location.pathname === "/photos/" && document.documentElement.getAttribute("data-mfga-route") === "page", null, { timeout: 5000 });
      assert.equal(await feedAttr(page), null);
      assert.ok(!(await page.evaluate(() => document.getElementById("mfga-stream")?.isConnected)), "our stream is out of Facebook's page");
      assert.deepEqual(errors, []);
    });
  });

  test("a link in the photo viewer while it stays up for the next page: that page is never drawn as Home", { timeout: TIMEOUT }, async () => {
    await withProduct("userscript", async (p, errors) => {
      const page = await p.open("/");
      await waitStories(page, 10);
      // The album page takes a while to load, and the fake Comet keeps its viewer up until it is in place.
      await page.route(
        (u) => u.pathname === "/photos/",
        async (route, request) => {
          if (request.resourceType() === "fetch") await new Promise((r) => setTimeout(r, 1200));
          return route.fallback();
        },
      );
      const photo = page.locator("#mfga-stream a.mfga-att-photo").first();
      await photo.scrollIntoViewIfNeeded();
      await photo.click();
      await page.waitForSelector("[data-fake-push-view]", { timeout: 10000 });
      await page.waitForFunction(() => document.documentElement.getAttribute("data-mfga-route") === "home", null, { timeout: 5000 });
      // What every frame shows from here on.
      await page.evaluate(() => {
        window.__frames = [];
        const step = () => {
          const main = document.querySelector('[role="main"]:not([role="dialog"] *)');
          window.__frames.push({
            path: location.pathname,
            viewer: !!document.querySelector("[data-fake-push-view]"),
            route: document.documentElement.getAttribute("data-mfga-route"),
            stream: !!document.getElementById("mfga-stream")?.getClientRects().length,
            content: main ? [...main.children].filter((c) => !c.matches(".mfga-ui") && c.getClientRects().length).length : 0,
          });
          if (window.__frames.length < 600) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      await page.locator("[data-fake-push-view] a").click();
      await page.waitForFunction(() => location.pathname === "/photos/" && !document.querySelector("[data-fake-push-view]"), null, { timeout: 10000 });
      await page.waitForTimeout(2500);
      const frames = await page.evaluate(() => window.__frames);
      assert.ok(frames.filter((f) => f.path === "/photos/" && f.viewer).length > 10, "the viewer stayed up while the page loaded");
      const drawn = frames.filter((f) => f.path === "/photos/" && !f.viewer);
      assert.ok(drawn.length > 10, `frames of the album page (${drawn.length})`);
      const wrong = drawn.filter((f) => f.route === "home" || f.stream || !f.content);
      assert.equal(wrong.length, 0, `from its first frame the album page has its own layout and content, and no stream of ours (wrong: ${JSON.stringify(wrong[0])} …)`);
      assert.equal(await feedAttr(page), null);
      assert.deepEqual(errors, []);
    });
  });

  test("a photo viewer already up when the URL change is seen leaves Facebook's dark viewer un-themed", { timeout: TIMEOUT }, async () => {
    await withProduct("userscript", async (p, errors) => {
      const page = await p.open("/");
      await waitStories(page, 10);
      const themed = () => page.evaluate(() => document.documentElement.hasAttribute("data-mfga-theme"));
      assert.equal(await themed(), true);
      // Comet's own photo link: pushState (no popstate: MFGA sees it on its next poll) with the viewer up at
      // once, and <html> forced dark while it is open.
      await page.evaluate(() => {
        history.pushState(history.state, "", "/photo/?fbid=501&set=a.1");
        const viewer = document.createElement("div");
        viewer.setAttribute("role", "dialog");
        viewer.setAttribute("aria-label", "Photo viewer");
        viewer.id = "test-viewer";
        viewer.style.cssText = "position:fixed;inset:0;z-index:5;background:#000";
        document.querySelector('div[id^="mount_0_0"]').append(viewer);
        document.documentElement.classList.add("__fb-dark-mode");
      });
      await page.waitForTimeout(1500);
      assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-mfga-route")), "home", "Home stays under the viewer");
      assert.equal(await themed(), false, "a media route: the 2010 theme stays off the dark viewer");

      await page.evaluate(() => {
        document.getElementById("test-viewer").remove();
        document.documentElement.classList.remove("__fb-dark-mode");
      });
      await page.goBack();
      await page.waitForFunction(() => location.pathname === "/", null, { timeout: 10000 });
      await page.waitForTimeout(500);
      assert.equal(await themed(), true, "Home is themed again");
      assert.deepEqual(errors, []);
    });
  });

  test("a dialog that opens on the page after Home (no URL change) does not bring Home back over that page", { timeout: TIMEOUT }, async () => {
    await withProduct("userscript", async (p, errors) => {
      const first = await p.open("/");
      await first.evaluate((key) => localStorage.setItem(key, JSON.stringify({ look: { shell: false } })), SETTINGS_KEY);
      await first.close();
      const page = await p.open("/");
      await waitStories(page, 5);
      await page.locator("#mfga-stream a.mfga-story-actor:not(.mfga-story-target)").first().click();
      await page.waitForFunction(() => location.pathname !== "/" && !document.documentElement.hasAttribute("data-mfga-feed"), null, { timeout: 10000 });
      await page.waitForTimeout(300);
      // A wide centred modal inside Facebook's root (where the app view stack puts its portals), well within the
      // time a late photo viewer is looked for.
      await page.evaluate(() => {
        const d = document.createElement("div");
        d.setAttribute("role", "dialog");
        d.style.cssText = "position:fixed;left:50%;top:120px;width:548px;height:400px;margin-left:-274px;background:#fff;z-index:5";
        document.querySelector('div[id^="mount_0_0"]').append(d);
      });
      await page.waitForTimeout(2000);
      const r = await page.evaluate(() => {
        const main = document.querySelector('[role="main"]:not([role="dialog"] *)');
        return {
          feed: document.documentElement.getAttribute("data-mfga-feed"),
          stream: !!document.getElementById("mfga-stream")?.isConnected,
          shown: [...main.children].filter((c) => c.getClientRects().length && getComputedStyle(c).visibility !== "hidden").length,
        };
      });
      assert.equal(r.feed, null, "Home is not put back");
      assert.equal(r.stream, false, "our stream stays out of the profile's column");
      assert.ok(r.shown > 0, "the profile's column is on screen");
      assert.deepEqual(errors, []);
    });
  });

  test("Back from a page opened from our feed returns to the same stream at the same place", { timeout: TIMEOUT }, async () => {
    await withProduct("userscript", async (p, errors) => {
      const page = await p.open("/");
      await waitStories(page, 10);
      const actor = page.locator("#mfga-stream a.mfga-story-actor:not(.mfga-story-target)").nth(6);
      await actor.scrollIntoViewIfNeeded();
      await page.evaluate(() => {
        document.getElementById("mfga-stream").mfgaTestMark = true;
      });
      const y = await page.evaluate(() => scrollY);
      assert.ok(y > 300, `scrolled into the feed (${y})`);
      const sent = p.site.mock.feedRequests().length;
      await actor.click();
      await page.waitForFunction(() => location.pathname !== "/" && document.documentElement.getAttribute("data-mfga-route") === "page", null, { timeout: 10000 });
      await page.waitForTimeout(2000); // the fake Comet has rendered the page and scrolled to its top
      assert.ok(!(await page.evaluate(() => document.getElementById("mfga-stream")?.isConnected)), "our stream is out of Facebook's page");

      await page.goBack();
      await page.waitForFunction(() => location.pathname === "/" && document.getElementById("mfga-stream")?.isConnected, null, { timeout: 10000 });
      await page.waitForTimeout(800);
      assert.ok(await page.evaluate(() => document.getElementById("mfga-stream").mfgaTestMark === true), "the same stream, not a rebuilt one");
      assert.ok(Math.abs((await page.evaluate(() => scrollY)) - y) <= 2, `back where the reader was (${y})`);
      assert.equal(p.site.mock.feedRequests().length, sent, "no feed request");
      assert.deepEqual(errors, []);
    });
  });

  test("the News Feed link goes back to the top of the stream (no restore without Back)", { timeout: TIMEOUT }, async () => {
    await withProduct("userscript", async (p) => {
      const page = await p.open("/");
      await waitStories(page, 10);
      await page.locator("#mfga-stream a.mfga-story-actor:not(.mfga-story-target)").nth(6).scrollIntoViewIfNeeded();
      await page.locator("#mfga-stream a.mfga-story-actor:not(.mfga-story-target)").nth(6).click();
      await page.waitForFunction(() => document.documentElement.getAttribute("data-mfga-route") === "page", null, { timeout: 10000 });
      await page.waitForTimeout(1500);
      await clickHomeLink(page);
      await page.waitForFunction(() => location.pathname === "/" && document.getElementById("mfga-stream")?.isConnected, null, { timeout: 10000 });
      await page.waitForTimeout(800);
      assert.ok((await page.evaluate(() => scrollY)) < 5, "at the top");
    });
  });
});

describe("MFGA extension: request learner", { skip: !hasExtension() && `no build at ${DIST.extension} (npm run build)` }, () => {
  test("the background learns Facebook's own requests, not MFGA's replays", { timeout: TIMEOUT }, async () => {
    await withProduct("extension", async (p) => {
      const page = await p.open("/");
      await waitStories(page, 5);
      assert.ok(p.site.mock.feedRequests().length > 0, "MFGA sent its own feed requests");
      // A request the page itself makes (Facebook's code, not MFGA's): MAIN world, not announced.
      await page.evaluate(async () => {
        const body = new URLSearchParams({ fb_api_req_friendly_name: "CometUFIFeedbackReactMutation", doc_id: "12345678901234567", variables: JSON.stringify({ input: { feedback_reaction_id: "0" } }) });
        await fetch("/api/graphql/", { method: "POST", body, credentials: "include" }).catch(() => null);
      });
      const sw = p.b.context.serviceWorkers()[0] || (await p.b.context.waitForEvent("serviceworker"));
      let learned = {};
      for (let i = 0; i < 40 && !learned.CometUFIFeedbackReactMutation; i++) {
        await page.waitForTimeout(250);
        learned = (await sw.evaluate(async () => (await chrome.storage.local.get("mfga:learnedOps"))["mfga:learnedOps"])) || {};
      }
      assert.equal(learned.CometUFIFeedbackReactMutation?.docId, "12345678901234567", "Facebook's own request is learned");
      assert.equal(learned[FEED], undefined, "MFGA's replayed feed requests are not");
    });
  });
});
