// README screenshots (docs/screenshots/), taken from the built userscript on the fake facebook.com that the
// browser tests use: made-up people, no network. Run `npm run build` first, then `npm run screenshots`.
// The PNGs are reduced to 256 colours with tools/shrink-png.py when Python + Pillow are there.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "../test/e2e/helpers/browser.mjs";
import { hasUserscript, launchProduct } from "../test/e2e/helpers/product.mjs";
import { fixtureNow } from "../test/e2e/helpers/site.mjs";

const OUT = path.join(ROOT, "docs/screenshots");
const SETTINGS_KEY = "__gm_store__:mfga:settings";
// The size of the February 2010 capture (assets/reference/2010-home.png): those shots line up with it 1:1.
const CAPTURE = { width: 994, height: 882 };
const WIDE = { width: 1280, height: 820 };

/** One fresh browser with the userscript; `settings` are stored before the first MFGA page loads. */
async function session({ locale = "en", settings = null } = {}, fn) {
  const p = await launchProduct("userscript", { now: fixtureNow(), locale });
  try {
    if (settings) {
      const first = await p.open("/robots-free-page");
      await first.evaluate(([key, json]) => localStorage.setItem(key, json), [SETTINGS_KEY, JSON.stringify(settings)]);
      await first.close();
    }
    await fn(p);
  } finally {
    await p.close();
  }
}

async function open(p, url, viewport) {
  const page = await p.open(url);
  await page.setViewportSize(viewport);
  return page;
}

/**
 * Waits for the stream (when `stories`) and for the shell to show who is signed in, scrolls through once so
 * lazy images load, waits for them, and goes back to the top.
 */
async function settle(page, { stories = 0 } = {}) {
  if (stories) {
    await page.waitForFunction((n) => document.querySelectorAll("#mfga-stream .mfga-story[data-key]").length >= n, stories, { timeout: 60000, polling: 250 });
  }
  await page.waitForFunction(() => !document.querySelector("#mfga-shell .mfga-nav-me") || document.querySelector("#mfga-shell .mfga-nav-me-name img, #mfga-shell .mfga-nav-me-pic img"), null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
    scrollTo(0, 0);
  });
  await page.waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(600);
}

const shots = [];
async function save(target, name, opts = {}) {
  const file = path.join(OUT, `${name}.png`);
  await target.screenshot({ path: file, ...opts });
  shots.push(file);
  console.log(`  ${path.relative(ROOT, file)}`);
}

const SCENES = [
  // The home page at the 2010 capture's size, in English and Polish.
  async () =>
    session({}, async (p) => {
      const page = await open(p, "/", CAPTURE);
      await settle(page, { stories: 8 });
      await save(page, "home");
    }),
  async () =>
    session({ locale: "pl" }, async (p) => {
      const page = await open(p, "/", CAPTURE);
      await settle(page, { stories: 8 });
      await save(page, "home-pl");
    }),
  // Before and after: the test copy of 2026 Facebook with MFGA off, then on.
  async () =>
    session({ settings: { enabled: false } }, async (p) => {
      const page = await open(p, "/", WIDE);
      await page.waitForSelector("[aria-posinset]", { timeout: 30000 });
      await settle(page);
      await save(page, "before");
    }),
  async () =>
    session({}, async (p) => {
      const page = await open(p, "/", WIDE);
      await settle(page, { stories: 8 });
      await save(page, "after");
    }),
  // A story with its comments open, liked, and a comment being written.
  async () =>
    session({ settings: { look: { welcome: false } } }, async (p) => {
      const page = await open(p, "/", WIDE);
      await settle(page, { stories: 8 });
      // Pinned by its key: a filter on "has View all" would move on to the next story once this one expands.
      const key = await page.evaluate(
        () => [...document.querySelectorAll("#mfga-stream .mfga-story[data-key]")].find((s) => s.querySelector(".mfga-att-photo") && s.querySelector(".mfga-ufi-viewall:not([hidden])"))?.dataset.key,
      );
      const story = page.locator(`#mfga-stream .mfga-story[data-key="${key}"]`);
      await story.scrollIntoViewIfNeeded();
      const shown = await story.locator(".mfga-ufi-comment").count();
      await story.locator(".mfga-ufi-viewall").getByRole("button").click();
      await page.waitForFunction(
        ([el, n]) => el.querySelectorAll(".mfga-ufi-comment").length > n && !el.querySelector(".mfga-ufi-viewall:not([hidden])"),
        [await story.elementHandle(), shown],
        { timeout: 30000 },
      );
      await story.getByRole("button", { name: "Like", exact: true }).first().click();
      await story.getByRole("button", { name: "Unlike", exact: true }).first().waitFor({ timeout: 30000 });
      const box = story.getByRole("textbox").first();
      await box.click();
      await box.pressSequentially("Count me in!", { delay: 20 });
      await page.waitForTimeout(400);
      await save(story, "story", { animations: "disabled" });
    }),
  // One Feeds filter: Friends, with News Feed's filters open in the left column.
  async () =>
    session({ settings: { look: { welcome: false } } }, async (p) => {
      const page = await open(p, "/?filter=friends&sk=h_chr", CAPTURE);
      await settle(page, { stories: 6 });
      await save(page, "filter-friends");
    }),
  // The settings, from Account ▾ → MFGA Settings….
  async () =>
    session({}, async (p) => {
      const page = await open(p, "/", CAPTURE);
      await settle(page, { stories: 6 });
      await page.locator("#mfga-shell").getByRole("button", { name: /^Account/ }).click();
      await page.getByRole("menuitem", { name: /MFGA Settings/ }).click();
      await page.getByRole("dialog", { name: /MFGA/ }).waitFor();
      await page.waitForTimeout(300);
      await save(page, "settings");
    }),
  // Facebook-drawn pages under the 2010 bar: the groups feed (2010 posts) and a profile.
  async () =>
    session({}, async (p) => {
      const page = await open(p, "/groups/feed/", CAPTURE);
      await page.waitForSelector("[aria-posinset] [data-mfga-part]", { timeout: 30000 });
      await settle(page);
      await save(page, "groups-feed");
      await page.goto(`https://www.facebook.com/${p.site.world.friends[0].vanity}`);
      await page.waitForSelector("#mfga-shell .mfga-header", { timeout: 30000 });
      await settle(page);
      await save(page, "profile");
    }),
  // The combined feed with the 2010 layout switched off.
  async () =>
    session({ settings: { look: { shell: false } } }, async (p) => {
      const page = await open(p, "/", WIDE);
      await settle(page, { stories: 6 });
      await save(page, "layout-off");
    }),
];

if (!hasUserscript()) {
  console.error("No build: run `npm run build` first.");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
for (const scene of SCENES) await scene();

const shrink = spawnSync("python3", [path.join(ROOT, "tools/shrink-png.py"), ...shots], { stdio: "inherit" });
if (shrink.error || shrink.status !== 0) console.warn("PNGs left as captured (tools/shrink-png.py needs Python 3 and Pillow).");
