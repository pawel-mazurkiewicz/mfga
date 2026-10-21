// End-to-end tests of the finished MFGA product (dist/mfga.user.js and dist/chrome) on the fake facebook.com.
// Each test gets a fresh browser, so settings (e.g. the feed mode) never leak between tests. Tests skip until
// `npm run build` has produced the target.
//
// What the tests rely on from other packages (CONTRACTS.md): #mfga-shell (layout), #mfga-stream inside
// [role=main], stories as `.mfga-story[data-key=<post id>]` (shared originals are not `.mfga-story`),
// html[data-mfga-route], the "Older Posts" / "Top News" / "Like" / "Unlike" / "Comment" / "What's on your
// mind?" controls as buttons (by accessible name), a <textarea> comment box submitting on Enter, group
// shortcuts in #mfga-shell as clickable names, native junk hidden by CSS ([data-mfga-hide]), and the rail
// cache that survives into ?filter= routes.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./helpers/browser.mjs";
import { DIST, hasUserscript, hasExtension, launchProduct } from "./helpers/product.mjs";
import { fixtureNow, FEED_STYLES, SOURCES } from "./helpers/site.mjs";
import { REACTIONS } from "../fixtures/site/graphql-shapes.mjs";

const SHOTS = path.join(ROOT, "test-results/fullpage");
mkdirSync(SHOTS, { recursive: true });
const TIMEOUT = 150000;
const SOURCE_STYLES = new Set(SOURCES.map((s) => FEED_STYLES[s]));

const TARGETS = [
  ["userscript", hasUserscript(), DIST.userscript],
  ["extension", hasExtension(), DIST.extension],
];

/** Top-level stories in our stream, in order. */
const storyKeys = (page) => page.$$eval("#mfga-stream .mfga-story[data-key]", (els) => els.filter((el) => !el.parentElement.closest(".mfga-story")).map((el) => el.dataset.key));

async function waitForStories(page, n, timeout = 90000) {
  await page.waitForFunction((min) => document.querySelectorAll("#mfga-stream .mfga-story[data-key]").length >= min, n, { timeout, polling: 250 });
  return storyKeys(page);
}

/** Effective invisibility: not rendered, visibility:hidden, fully transparent, or zero-sized. */
function hiddenIn(page, selector) {
  return page.$$eval(selector, (els) =>
    els.map((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return true;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === "none" || cs.opacity === "0") return true;
      }
      return getComputedStyle(el).visibility === "hidden";
    }),
  );
}

/** The 2010 shell is on screen: its host may be zero-sized, so look for rendered parts inside it. */
const shellShown = (page) =>
  page.$eval("#mfga-shell", (host) =>
    [...host.querySelectorAll("*")].some((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width * r.height > 2000 && cs.visibility === "visible" && cs.opacity !== "0";
    }),
  );

/** Waits until the mock has answered one more `name` request than `before`; returns that request. */
async function waitForNewRequest(mock, name, before, timeout = 20000) {
  const end = Date.now() + timeout;
  for (;;) {
    const answered = mock.requests(name).filter((e) => e.end);
    if (answered.length > before) return answered[before];
    if (Date.now() > end) throw new Error(`no new ${name} request within ${timeout} ms`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const isPrefix = (keys, expected) => keys.length > 0 && keys.every((k, i) => k === expected[i]);

/** Every story is organic, unique, strictly newest first. */
function assertCleanChronological(keys, world) {
  assert.equal(new Set(keys).size, keys.length, "no duplicates");
  for (const k of keys) assert.ok(world.story(k), `story ${k} is organic (not an ad, suggestion or unit)`);
  const times = keys.map((k) => world.story(k).time);
  assert.ok(times.every((t, i) => !i || t < times[i - 1]), "strictly descending creation_time");
}

async function assertNoJunkText(page, world) {
  const text = await page.$eval("#mfga-stream", (el) => el.textContent);
  for (const j of world.junk) if (j.text) assert.ok(!text.includes(j.text), `junk "${j.text}" is not shown`);
}

/** GraphQL traffic was well-formed, accepted and strictly sequential; with `paced`, also ≥ 1 s apart. */
function assertPoliteTraffic(mock, { paced = false, minGapMs = 1000 } = {}) {
  assert.deepEqual(mock.invalid().map((e) => `${e.friendlyName}: ${e.problems.join("; ")}`), []);
  assert.deepEqual(mock.rejected().map((e) => `${e.friendlyName}: ${e.errorCode} ${e.error}`), [], "no request was rejected");
  assert.equal(mock.maxInFlight, 1, "one request in flight at a time");
  if (!paced) return;
  const gaps = mock.gaps(mock.log.filter((e) => e.method === "POST"));
  assert.ok(gaps.every((g) => g >= minGapMs), `requests at least ${minGapMs} ms apart: ${gaps.join(", ")}`);
}

function assertFeedVariables(entries) {
  for (const e of entries) {
    assert.ok(e.variables.scale >= 2, "scale raised to >= 2");
    assert.equal(e.variables.refreshMode, "COLD_START");
  }
}

/** Full-page screenshot after scrolling through once, so lazy-loaded images are in the picture. */
async function shot(page, target, name) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
    scrollTo(0, 0);
  });
  await page.waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: 5000 }).catch(() => {});
  await page.screenshot({ path: path.join(SHOTS, `${target}-${name}.png`), fullPage: true });
}

const assertNoPageErrors = (page) => assert.deepEqual(page.__errors || [], []);

/** Opens a fresh browser with the product loaded, runs fn, always closes. */
async function withProduct(target, siteOpts, fn, launchOpts) {
  const p = await launchProduct(target, { now: fixtureNow(), ...siteOpts }, launchOpts);
  try {
    await fn(p);
  } finally {
    await p.close();
  }
}

for (const [target, available, distPath] of TARGETS) {
  describe(`MFGA ${target} on the fake facebook.com`, { skip: !available && `no build at ${path.relative(ROOT, distPath)} (npm run build)` }, () => {
    test("home: 2010 shell, Facebook chrome hidden, clean combined feed from all four sources", { timeout: TIMEOUT }, async () => {
      await withProduct(target, {}, async ({ site, open }) => {
        const page = await open("/");
        await page.waitForSelector("#mfga-shell", { state: "attached", timeout: 30000 });
        const keys = await waitForStories(page, 10);
        const { world, mock } = site;

        assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-mfga-route")), "home");
        assert.equal(await page.evaluate(() => document.querySelector('[role="main"]').contains(document.getElementById("mfga-stream"))), true, "#mfga-stream lives in [role=main]");
        for (const sel of ['[role="banner"] a[aria-label="Facebook"]', '[role="banner"] input[type="search"]', '[role="navigation"][aria-label="Shortcuts"]', '[role="complementary"]', '[role="region"][aria-label="Create a post"]', '[data-focus-target="stories_tray"]']) {
          assert.ok((await hiddenIn(page, sel)).every(Boolean), `${sel} is hidden`);
        }
        assert.ok(await shellShown(page), "the 2010 shell is visible");

        assertCleanChronological(keys, world);
        assert.ok(isPrefix(keys, world.expectedMerged()), `stream is the newest part of the merged feed:\n${keys.join(",")}\n${world.expectedMerged().slice(0, keys.length).join(",")}`);
        const sourcesSeen = new Set(keys.flatMap((k) => [...world.story(k).sources]));
        for (const s of ["friends", "groups", "pages"]) assert.ok(sourcesSeen.has(s), `has ${s} stories`);
        const styles = new Set(mock.feedRequests().map((e) => e.feedStyle));
        for (const s of SOURCE_STYLES) assert.ok(styles.has(s), `fetched ${s}`);
        assert.ok(mock.feedRequests().every((e) => SOURCE_STYLES.has(e.feedStyle) && e.variables.orderby.join() === "MOST_RECENT"));
        assertFeedVariables(mock.feedRequests());
        await assertNoJunkText(page, world);
        assertPoliteTraffic(mock, { paced: true });
        assertNoPageErrors(page);
        await shot(page, target, "home");
      });
    });

    test("Older Posts appends the next stories with paced requests", { timeout: TIMEOUT }, async () => {
      await withProduct(target, {}, async ({ site, open }) => {
        const page = await open("/");
        const first = await waitForStories(page, 10);
        const requestsBefore = site.mock.feedRequests().length;
        await page.locator("#mfga-stream").getByRole("button", { name: "Older Posts" }).click();
        const keys = await waitForStories(page, first.length + 8);
        assert.deepEqual(keys.slice(0, first.length), first, "older stories are appended below");
        assertCleanChronological(keys, site.world);
        assert.ok(isPrefix(keys, site.world.expectedMerged()));
        const more = site.mock.feedRequests().slice(requestsBefore);
        assert.ok(more.length >= 1, "loading more made requests");
        assert.ok(more.every((e) => e.offset > 0), "later pages continue from cursors");
        assertPoliteTraffic(site.mock, { paced: true });
        await assertNoJunkText(page, site.world);
        assertNoPageErrors(page);
        await shot(page, target, "older-posts");
      });
    });

    test("Like, Unlike and a comment on a group post go through the mock", { timeout: TIMEOUT }, async () => {
      await withProduct(target, {}, async ({ site, open }) => {
        const { world, mock } = site;
        const page = await open("/");
        const keys = await waitForStories(page, 10);
        const likeable = keys.find((k) => !world.feedback.get(k).viewerReaction);
        const story = page.locator(`#mfga-stream .mfga-story[data-key="${likeable}"]`);
        const before = world.feedback.get(likeable).reactions;

        const reacts = () => mock.requests("CometUFIFeedbackReactMutation").length;
        let sent = reacts();
        await story.getByRole("button", { name: "Like", exact: true }).first().click();
        await story.getByRole("button", { name: "Unlike", exact: true }).first().waitFor();
        const like = await waitForNewRequest(mock, "CometUFIFeedbackReactMutation", sent);
        assert.equal(like.errorCode, null, like.error);
        assert.equal(like.postId, likeable);
        assert.equal(like.reaction, REACTIONS.LIKE);
        assert.equal(world.feedback.get(likeable).reactions, before + 1);
        assert.match(await story.textContent(), /You (and .+ )?like this\./);

        sent = reacts();
        await story.getByRole("button", { name: "Unlike", exact: true }).first().click();
        await story.getByRole("button", { name: "Like", exact: true }).first().waitFor();
        const unlike = await waitForNewRequest(mock, "CometUFIFeedbackReactMutation", sent);
        assert.equal(unlike.errorCode, null, unlike.error);
        assert.equal(unlike.reaction, "0");
        assert.equal(world.feedback.get(likeable).reactions, before);

        const groupKey = keys.find((k) => world.story(k).to);
        assert.ok(groupKey, "a group post is on the first page");
        const groupStory = page.locator(`#mfga-stream .mfga-story[data-key="${groupKey}"]`);
        await groupStory.getByRole("button", { name: "Comment", exact: true }).first().click();
        const box = groupStory.locator("textarea").first();
        await box.fill("Greetings from 2010!");
        const commentsSent = mock.requests("useCometUFICreateCommentMutation").length;
        await box.press("Enter");
        const comment = await waitForNewRequest(mock, "useCometUFICreateCommentMutation", commentsSent);
        await groupStory.getByText("Greetings from 2010!").first().waitFor({ timeout: 20000 });
        assert.equal(comment.errorCode, null, comment.error);
        assert.equal(comment.groupID, world.story(groupKey).to.id, "groupID is the owning group");
        assert.ok(world.feedback.get(groupKey).comments.some((c) => c.text === "Greetings from 2010!"));
        assertPoliteTraffic(mock);
        assertNoPageErrors(page);
        await shot(page, target, "like-comment");
      });
    });

    test("Top News shows Facebook's ranking, cleaned", { timeout: TIMEOUT }, async () => {
      await withProduct(target, {}, async ({ site, open }) => {
        const page = await open("/");
        await waitForStories(page, 10);
        const from = site.mock.feedRequests().length;
        const top = site.world.feed("top");
        await page.locator("#mfga-stream").getByRole("button", { name: "Top News" }).click();
        await page.waitForFunction((first) => document.querySelector("#mfga-stream .mfga-story[data-key]")?.dataset.key === first, top[0], { timeout: 60000 });
        const keys = await waitForStories(page, 4);
        assert.ok(isPrefix(keys, top), `Top News keeps Facebook's order:\n${keys.join(",")}\n${top.slice(0, keys.length).join(",")}`);
        // Page 1 of DEFAULT may come from the home page's own SSR prefetch; every request made is for Top News.
        assert.ok(site.mock.feedRequests().slice(from).every((e) => e.feedStyle === "DEFAULT" && e.variables.orderby.join() === "TOP_STORIES"));
        await assertNoJunkText(page, site.world);
        assertPoliteTraffic(site.mock);
        assertNoPageErrors(page);
        await shot(page, target, "top-news");
      });
    });

    test("?filter= route renders without Facebook's rails, from cached rail data and the SSR first page", { timeout: TIMEOUT }, async () => {
      await withProduct(target, {}, async ({ site, open }) => {
        const { world, mock } = site;
        const page = await open("/");
        await waitForStories(page, 3);
        const group = world.groups[0].name;
        await page.waitForFunction((name) => document.getElementById("mfga-shell")?.textContent.includes(name), group);
        await page.waitForTimeout(1500); // the rail cache is written asynchronously
        const from = mock.log.length;
        await page.goto(site.url("/?filter=friends&sk=h_chr"), { waitUntil: "domcontentloaded" });
        assert.equal(await page.$('[role="navigation"][aria-label="Shortcuts"]'), null, "Facebook renders no Shortcuts rail here");
        await page.waitForSelector("#mfga-shell", { state: "attached" });
        const keys = await waitForStories(page, 3);
        const shell = await page.$eval("#mfga-shell", (el) => el.textContent);
        assert.ok(shell.includes(group), "group shortcuts come from the rail cache");
        assert.ok(shell.includes(world.rails.birthdays[0].name), "birthdays come from the rail cache");
        assertCleanChronological(keys, world);
        assert.ok(isPrefix(keys, world.expectedMerged()) || isPrefix(keys, world.feed("friends")), "combined or friends-only feed, newest first");
        const friendsFirstPage = mock.log.slice(from).filter((e) => e.feedStyle === "MOST_RECENT_FRIENDS_FEED" && e.offset === 0);
        assert.equal(friendsFirstPage.length, 0, "page 1 of the landed filter is read from the SSR payload");
        assertPoliteTraffic(mock);
        assertNoPageErrors(page);
        await shot(page, target, "filter-friends");
      });
    });

    test("/groups/feed/ keeps Facebook's feed but hides ads, suggestions and reels", { timeout: TIMEOUT }, async () => {
      await withProduct(target, {}, async ({ site, open }) => {
        const page = await open("/groups/feed/");
        await page.waitForFunction(() => document.documentElement.getAttribute("data-mfga-route") === "groups-feed");
        await page.waitForTimeout(1500);
        const units = site.units("groups-feed");
        const state = await page.$$eval("[aria-posinset]", (els) =>
          els.map((el) => {
            const rect = el.getBoundingClientRect();
            let hidden = rect.height === 0;
            for (let n = el; n && !hidden; n = n.parentElement) hidden = getComputedStyle(n).display === "none";
            return { pos: Number(el.getAttribute("aria-posinset")), hidden, fromBottom: document.documentElement.scrollHeight - (rect.bottom + scrollY) };
          }),
        );
        let checkedJunk = 0;
        for (const s of state) {
          const unit = units.find((u) => u.posinset === s.pos);
          if (!unit) continue; // the loading skeleton
          if (!unit.junk) assert.equal(s.hidden, false, `organic unit ${s.pos} stays visible`);
          else if (s.fromBottom > 1300) {
            assert.equal(s.hidden, true, `${unit.kind} at ${s.pos} is hidden`);
            checkedJunk++;
          }
        }
        assert.ok(checkedJunk >= 1, "at least one junk unit was far enough from the bottom to be judged");
        assert.ok(await shellShown(page), "2010 header and left nav are shown");
        assert.equal(site.mock.feedRequests().length, 0, "the groups feed is Facebook's own, cleaned natively");
        assertNoPageErrors(page);
        await shot(page, target, "groups-feed");
      });
    });

    test("Polish Facebook gets the Polish 2010 UI", { timeout: TIMEOUT }, async () => {
      await withProduct(target, { locale: "pl" }, async ({ site, open }) => {
        const page = await open("/");
        const keys = await waitForStories(page, 5);
        const stream = await page.$eval("#mfga-stream", (el) => el.textContent);
        for (const word of ["Aktualności", "Najciekawsze", "Najnowsze", "Starsze posty", "Lubię to!"]) assert.ok(stream.includes(word), `stream says "${word}"`);
        const shell = await page.$eval("#mfga-shell", (el) => el.textContent);
        assert.ok(shell.includes("Strona główna"), "header says Strona główna");
        assertCleanChronological(keys, site.world);
        assertNoPageErrors(page);
        await shot(page, target, "home-pl");
      });
    });

    test("a profile page gets the 2010 header over Facebook's own page", { timeout: TIMEOUT }, async () => {
      await withProduct(target, {}, async ({ site, open }) => {
        const page = await open(`/${site.world.friends[0].vanity}`);
        await page.waitForSelector("#mfga-shell", { state: "attached", timeout: 30000 });
        assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-mfga-route")), "page");
        assert.ok((await hiddenIn(page, '[role="banner"] input[type="search"]')).every(Boolean), "Facebook's banner is hidden");
        assert.equal(await page.$("#mfga-stream"), null, "no MFGA stream on profiles");
        assert.equal(site.mock.feedRequests().length, 0);
        assertNoPageErrors(page);
        await shot(page, target, "profile");
      });
    });

    test("\"What's on your mind?\" opens Facebook's own composer dialog, visible above the shell", { timeout: TIMEOUT }, async () => {
      await withProduct(target, {}, async ({ open }) => {
        const page = await open("/");
        await waitForStories(page, 3);
        await page.locator("#mfga-stream").getByRole("button", { name: "What's on your mind?" }).click();
        const dialog = '[role="dialog"][aria-label="Create post"]';
        await page.waitForSelector(dialog, { timeout: 10000 });
        assert.ok((await hiddenIn(page, dialog)).every((h) => !h), "Facebook's portalled dialog is not hidden");
        const onTop = await page.$eval(dialog, (d) => {
          const r = d.getBoundingClientRect();
          return d.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
        });
        assert.ok(onTop, "the dialog is not covered by the 2010 shell");
        assertNoPageErrors(page);
        await shot(page, target, "composer");
      });
    });

    test("2010 navigation reaches Facebook routes, and the stream returns on Home", { timeout: TIMEOUT }, async () => {
      await withProduct(target, {}, async ({ site, open }) => {
        const page = await open("/");
        await waitForStories(page, 3);
        const group = site.world.groups[0];
        await page.locator("#mfga-shell").getByText(group.name, { exact: true }).first().click();
        await page.waitForURL(group.url, { timeout: 20000 });
        await page.waitForFunction(() => document.documentElement.getAttribute("data-mfga-route") === "page");
        await page.goBack();
        await page.waitForFunction(() => location.pathname === "/" && document.documentElement.getAttribute("data-mfga-route") === "home");
        await page.waitForFunction(() => document.querySelector('[role="main"]')?.contains(document.getElementById("mfga-stream")), null, { timeout: 20000 });
        await waitForStories(page, 3);
        assertNoPageErrors(page);
      });
    });

    test("a userscript started before <html> exists still boots the 2010 page", { timeout: TIMEOUT, skip: target !== "userscript" }, async () => {
      await withProduct(
        target,
        {},
        async ({ open }) => {
          const page = await open("/");
          await waitForStories(page, 3);
          await page.waitForFunction(() => document.documentElement.getAttribute("data-mfga-route") === "home", null, { timeout: 15000 });
          assert.ok(await shellShown(page), "the 2010 shell is visible");
          assertNoPageErrors(page);
        },
        { timing: "earliest" },
      );
    });

    test("a checkpoint answer stops every further request", { timeout: TIMEOUT }, async () => {
      await withProduct(target, {}, async ({ site, open }) => {
        const page = await open("/");
        await waitForStories(page, 3);
        site.mock.inject.checkpoint = "html";
        const from = site.mock.log.length;
        await page.locator("#mfga-stream").getByRole("button", { name: "Older Posts" }).click();
        await page.waitForTimeout(6000);
        const afterCheckpoint = site.mock.log.slice(from).length;
        assert.ok(afterCheckpoint <= 1, `at most the request that hit the checkpoint (${afterCheckpoint})`);
        const retry = page.locator("#mfga-stream").getByRole("button", { name: /Older Posts|Try Again/ });
        if (await retry.count()) await retry.first().click();
        await page.waitForTimeout(4000);
        assert.equal(site.mock.log.length - from, afterCheckpoint, "nothing is sent after the checkpoint");
        assertNoPageErrors(page);
      });
    });
  });
}
