// End-to-end checks of details the README screenshots showed, on the BUILT userscript and the fake
// facebook.com: how soon the 2010 bar and left column fill in, the order of a restyled Facebook post's footer,
// and where the 2010 chat tab gives way. Rebuild with `npm run build`.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DIST, hasUserscript, launchProduct } from "./helpers/product.mjs";
import { fixtureNow } from "./helpers/site.mjs";

const TIMEOUT = 120000;

async function withProduct(fn) {
  const p = await launchProduct("userscript", { now: fixtureNow() });
  const errors = [];
  p.b.context.on("page", (page) => page.on("pageerror", (e) => errors.push(e)));
  try {
    await fn(p, errors);
  } finally {
    await p.close();
  }
}

/** Milliseconds from Facebook's banner showing its counters to the 2010 bar and left column showing them. */
async function fillDelay(page, viewer) {
  return page.evaluate(async (name) => {
    const bannerReady = () => [...document.querySelectorAll('[role="banner"] [aria-label]')].some((e) => /\d/.test(e.getAttribute("aria-label")));
    const shellReady = () => {
      const left = document.querySelector("#mfga-shell .mfga-nav-me-name")?.textContent === name;
      const badges = [...document.querySelectorAll("#mfga-shell .mfga-header-count")].filter((b) => /\d/.test(b.textContent)).length;
      return left && badges >= 3;
    };
    const wait = async (ok) => {
      for (let i = 0; i < 400 && !ok(); i++) await new Promise((r) => setTimeout(r, 25));
      return performance.now();
    };
    const from = await wait(bannerReady);
    const to = await wait(shellReady);
    return shellReady() ? Math.round(to - from) : null;
  }, viewer.name);
}

describe("MFGA userscript: details", { skip: !hasUserscript() && `no build at ${DIST.userscript} (npm run build)` }, () => {
  test("the 2010 bar and left column show who you are and the counters as soon as Facebook's banner has them", { timeout: TIMEOUT }, async () => {
    await withProduct(async (p, errors) => {
      for (const url of ["/groups/feed/", "/"]) {
        const page = await p.open(url);
        const delay = await fillDelay(page, p.site.world.viewer);
        assert.ok(delay !== null && delay < 1000, `${url}: filled ${delay} ms after the banner (was ~2 s: the first rescan)`);
        await page.close();
      }
      assert.deepEqual(errors, []);
    });
  });

  test("a restyled Facebook post reads Like · Comment · Share, then the likes, then the comment box", { timeout: TIMEOUT }, async () => {
    await withProduct(async (p) => {
      const page = await p.open("/groups/feed/");
      await page.waitForSelector('[data-mfga-part="footer"] [data-mfga-part="composer"], [data-mfga-part="footer"] ~ [data-mfga-part="composer"]', { timeout: 30000 });
      const posts = await page.evaluate(() =>
        [...document.querySelectorAll("[aria-posinset]")]
          .map((unit) => {
            const top = (part) => unit.querySelector(`[data-mfga-part="${part}"]`)?.getBoundingClientRect().top ?? null;
            return { actions: top("actions"), summary: top("summary"), comments: top("comments"), composer: top("composer") };
          })
          .filter((r) => r.actions !== null && r.summary !== null && r.composer !== null),
      );
      assert.ok(posts.length >= 2, "posts with all three parts");
      for (const r of posts) {
        assert.ok(r.actions < r.summary, `links above the likes: ${JSON.stringify(r)}`);
        assert.ok(r.summary < r.composer, `likes above the comment box: ${JSON.stringify(r)}`);
        if (r.comments !== null) assert.ok(r.summary < r.comments && r.comments < r.composer, `comments between: ${JSON.stringify(r)}`);
      }
    });
  });

  test("the 2010 chat tab: on Home Facebook's New message launcher gives way; on a narrow groups feed the tab does", { timeout: TIMEOUT }, async () => {
    await withProduct(async (p) => {
      const shown = (page, sel) => page.evaluate((s) => !!document.querySelector(s)?.getClientRects().length, sel);
      const TAB = "#mfga-shell .mfga-chat-tab";
      const HEAD = '[role="button"][aria-label="New message"]';

      const home = await p.open("/");
      await home.setViewportSize({ width: 994, height: 882 });
      await home.waitForSelector(TAB, { state: "visible", timeout: 30000 });
      assert.equal(await shown(home, HEAD), false, "Home: the launcher would sit on the tab");
      await home.close();

      const groups = await p.open("/groups/feed/");
      await groups.setViewportSize({ width: 994, height: 882 });
      await groups.waitForSelector("[aria-posinset] [data-mfga-part]", { timeout: 30000 });
      await groups.waitForTimeout(500);
      assert.equal(await shown(groups, TAB), false, "994px: Facebook's 680px feed column would cover the tab");
      assert.equal(await shown(groups, HEAD), true, "and Facebook's launcher stays");
      await groups.setViewportSize({ width: 1280, height: 882 });
      await groups.waitForTimeout(300);
      assert.equal(await shown(groups, TAB), true, "1280px: room for both");
      assert.equal(await shown(groups, HEAD), false);
      const overlap = await groups.evaluate((sel) => {
        const tab = document.querySelector(sel).getBoundingClientRect();
        const main = document.querySelector('[role="main"]').getBoundingClientRect();
        return main.right > tab.left && main.bottom > tab.top;
      }, TAB);
      assert.equal(overlap, false, "the feed column ends left of the tab");
    });
  });
});
