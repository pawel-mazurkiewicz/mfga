// Browser tests of the 2010 stream UI (WP-C): structure, behaviours and screenshots.
// Screenshots land in test-results/stream/ (stream-replica-*.png is laid out like the centre column of
// assets/reference/2010-home.png: column at x=202, welcome box at y=61).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { bundle, launchBrowser, ROOT } from "./helpers/browser.mjs";

const OUT = path.join(ROOT, "test-results", "stream");
const IMG_DIR = path.join(ROOT, "test", "fixtures", "stream", "img");
const LIKE_ID = "1635855486666999";

const PAGE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MFGA stream</title>
<style>html,body{margin:0;background:#fff}#col{position:absolute;left:202px;top:61px;width:520px;padding-bottom:40px}</style>
</head><body><div id="col"></div></body></html>`;

let browser;
let script;

// ---- fixture images: PNG crops from the 2010 reference, generated SVG for everything else ----

function hash(s) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function svgImage(name) {
  const m = /^photo-([a-z0-9]+)-(\d+)x(\d+)\.svg$/.exec(name);
  if (!m) return null;
  const [, seed, w, h] = m;
  const hue = hash(seed) % 360;
  const W = Number(w);
  const H = Number(h);
  if (W <= 64) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 50 50">
<rect width="50" height="50" fill="hsl(${hue},45%,78%)"/><circle cx="25" cy="20" r="10" fill="hsl(${(hue + 30) % 360},30%,38%)"/>
<path d="M6 50C7 36 15 32 25 32S43 36 44 50Z" fill="hsl(${(hue + 200) % 360},45%,40%)"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},60%,62%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},70%,86%)"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#s)"/><circle cx="${W * 0.72}" cy="${H * 0.3}" r="${Math.min(W, H) * 0.09}" fill="#fff6c8"/>
<path d="M0 ${H * 0.75} L${W * 0.25} ${H * 0.42} L${W * 0.45} ${H * 0.66} L${W * 0.68} ${H * 0.36} L${W} ${H * 0.7} L${W} ${H} L0 ${H}Z" fill="hsl(${(hue + 160) % 360},30%,32%)"/>
<path d="M0 ${H * 0.88} L${W * 0.35} ${H * 0.7} L${W * 0.7} ${H * 0.86} L${W} ${H * 0.78} L${W} ${H} L0 ${H}Z" fill="hsl(${(hue + 120) % 360},35%,22%)"/></svg>`;
}

async function serveImage(route, request) {
  const name = new URL(request.url()).pathname.slice(1);
  if (name.endsWith(".png")) {
    const body = await fs.readFile(path.join(IMG_DIR, path.basename(name))).catch(() => null);
    return body ? route.fulfill({ status: 200, contentType: "image/png", body }) : route.fulfill({ status: 404, body: "" });
  }
  const svg = svgImage(name);
  return svg ? route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg }) : route.fulfill({ status: 404, body: "" });
}

// ---- helpers ----

async function openStream(options = {}, { viewport } = {}) {
  const page = await browser.newPage({ html: PAGE_HTML });
  if (viewport) await page.setViewportSize(viewport);
  await page.addScriptTag({ content: script });
  await page.evaluate((o) => window.mfgaStream.mount(o), options);
  await page.waitForSelector("#mfga-stream .mfga-feed-footer :is(.mfga-feed-more:not(.mfga-loading), .mfga-feed-end, .mfga-feed-empty, .mfga-feed-error)");
  return page;
}

const calls = (page, name) => page.evaluate((n) => window.__calls.filter((c) => !n || c.name === n), name);
const setCtl = (page, patch) => page.evaluate((p) => Object.assign(window.__ctl, p), patch);
const story = (page, key) => page.locator(`.mfga-story[data-key="${key}"]`);
const textOf = (locator) => locator.evaluate((el) => el.innerText.replace(/\s+/g, " ").trim());

async function finish(page) {
  const health = await page.evaluate(() => window.mfgaStream.health());
  assert.deepEqual(page.__errors || [], [], "no page errors");
  assert.deepEqual(health.errors, {}, "no errors recorded by safe()");
  await page.close();
}

/** Waits for the rendered images in the viewport (lazy ones below the fold or hidden never load). */
async function waitForImages(page) {
  await page.waitForFunction(() => [...document.images].every((i) => i.complete || !i.getClientRects().length || i.getBoundingClientRect().top > innerHeight));
}

before(async () => {
  await fs.mkdir(OUT, { recursive: true });
  script = await bundle("test/e2e/entries/stream-entry.js");
  browser = await launchBrowser({ viewport: { width: 994, height: 900 } });
  browser.route((url) => url.hostname === "scontent.fixture.fbcdn.net", serveImage);
  browser.route((url) => url.hostname === "video.fixture.fbcdn.net", (route) => route.fulfill({ status: 204, body: "" }));
});

after(async () => {
  await browser?.close();
});

// ---- tests ----

describe("stream: 2010 replica", () => {
  test("renders the reference stories with header, composer, welcome box and lazy comment previews", async () => {
    const page = await openStream({ stories: "replica", welcome: true, lastSeen: Math.floor(Date.UTC(2026, 9, 21, 15) / 1000) - 12 * 3600 });
    await page.mouse.move(0, 0);

    const header = page.locator(".mfga-feed-header");
    assert.equal(await textOf(header.locator(".mfga-feed-title")), "News Feed");
    assert.equal(await header.locator(".mfga-ico-nav_news_feed").count(), 1);
    assert.equal(await textOf(header.locator("button.mfga-feed-mode")), "Top News");
    assert.equal(await textOf(header.locator(".mfga-feed-mode-on")), "Most Recent");
    assert.equal(await textOf(page.locator(".mfga-feed-pill")), "3");
    assert.equal(await textOf(page.locator(".mfga-feed-composer")), "What's on your mind?");
    assert.equal(await page.locator(".mfga-welcome-step").count(), 3);

    const s1 = story(page, "1001");
    assert.equal(await textOf(s1.locator(".mfga-story-msg")), "Samantha Hodges had a great lunch, but an even better conversation with J.D. (at lunch) today. By the way, chcolate lava cake is a must when you're in Hawaii!");
    assert.equal(await s1.locator(".mfga-story-pic img").getAttribute("src"), "https://scontent.fixture.fbcdn.net/samantha-50.png");
    assert.equal(await textOf(s1.locator(".mfga-story-meta")), "26 minutes ago · Comment · Unlike");
    assert.equal(await textOf(s1.locator(".mfga-ufi-likes")), "You and 1 other person like this.");
    assert.equal(await textOf(s1.locator(".mfga-ufi-viewall")), "View all 4 comments");
    assert.equal(await s1.locator(".mfga-ufi-add textarea").getAttribute("placeholder"), "Write a comment...");

    // Previews load after the UFI has been visible for 1s: the two newest comments, once per story.
    await page.waitForFunction(() => document.querySelectorAll('.mfga-story[data-key="1002"] .mfga-ufi-comment').length === 2);
    await page.waitForFunction(() => document.querySelectorAll('.mfga-story[data-key="1001"] .mfga-ufi-comment').length === 2);
    const c1 = s1.locator(".mfga-ufi-comment");
    assert.equal(await textOf(c1.nth(0)), 'Amy Winstead oh, go ahead and "gush!" about the cake... (teehee...) 14 minutes ago');
    assert.equal(await textOf(c1.nth(1)), "Samantha Hodges Ha Ha! 12 minutes ago");
    assert.equal(await textOf(s1.locator(".mfga-ufi-viewall")), "View all 4 comments");
    assert.equal(await story(page, "1002").locator(".mfga-ufi-viewall").isVisible(), false, "all comments shown: no View all");
    assert.equal(await textOf(story(page, "1002").locator(".mfga-ufi-likes")), "1 person likes this.");
    assert.equal(await story(page, "1003").locator(".mfga-ufi").isVisible(), false, "no likes, no comments: no UFI");

    await waitForImages(page);
    await page.screenshot({ path: path.join(OUT, "stream-replica-en.png"), clip: { x: 195, y: 55, width: 535, height: 845 } });
    const previews = (await calls(page, "comments")).map((c) => c.args[0]).sort();
    assert.deepEqual(previews, ["1001", "1002"], "one preview load per story with comments");
    assert.deepEqual((await calls(page, "seen")).length, 1);
    await finish(page);
  });

  test("Polish", async () => {
    const page = await openStream({ stories: "replica", welcome: true, locale: "pl" });
    await page.waitForFunction(() => document.querySelectorAll(".mfga-ufi-comment").length === 4);
    assert.equal(await textOf(page.locator(".mfga-feed-title")), "Aktualności");
    assert.equal(await textOf(page.locator(".mfga-feed-modes")), "Najciekawsze · Najnowsze");
    assert.equal(await textOf(page.locator(".mfga-feed-composer")), "O czym myślisz?");
    assert.equal(await textOf(story(page, "1001").locator(".mfga-story-meta")), "26 minut temu · Komentarz · Nie lubię");
    assert.equal(await textOf(story(page, "1001").locator(".mfga-ufi-likes")), "Ty i 1 inna osoba lubicie to.");
    assert.equal(await textOf(story(page, "1001").locator(".mfga-ufi-viewall")), "Wyświetl wszystkie 4 komentarze");
    assert.equal(await textOf(story(page, "1002").locator(".mfga-story-meta")), "9 godzin temu · Komentarz · Lubię to!");
    assert.equal(await story(page, "1002").locator("textarea").getAttribute("placeholder"), "Napisz komentarz...");
    assert.equal(await textOf(page.locator(".mfga-feed-end")), "W tej chwili nie ma więcej postów do wyświetlenia.");
    await waitForImages(page);
    await page.screenshot({ path: path.join(OUT, "stream-replica-pl.png"), clip: { x: 195, y: 55, width: 535, height: 845 } });
    await finish(page);
  });
});

describe("stream: story content", () => {
  test("every attachment kind, shared story, group target, long text, no avatar, AI, can't comment", async () => {
    const page = await openStream({ stories: "gallery" }, { viewport: { width: 994, height: 3000 } });
    await setCtl(page, { pageSize: 20 });
    await page.locator(".mfga-feed-more").click();
    await page.waitForSelector(".mfga-feed-end");

    // Group post: Actor ▸ Group, title, long text cut with See More, entity links, album grid with +N.
    const group = story(page, "2001");
    assert.equal(await textOf(group.locator(".mfga-story-msg").first()), "Marta Nowak Kraków Hiking Club");
    assert.equal(await group.locator(".mfga-story-arrow").getAttribute("aria-label"), "to");
    assert.equal(await group.locator(".mfga-story-target").getAttribute("href"), "https://www.facebook.com/groups/krakowhiking/");
    assert.equal(await textOf(group.locator(".mfga-story-title")), "Saturday walk: 18 km in the Tatras");
    assert.match(await textOf(group.locator(".mfga-story-text")), /\.\.\. See More$/);
    assert.equal(await group.locator(".mfga-entity-hashtag").count(), 2);
    assert.equal(await group.locator(".mfga-entity-link").getAttribute("href"), "https://example.org/routes/tatry-2026");
    assert.equal(await group.locator(".mfga-entity-link").getAttribute("target"), "_blank");
    assert.equal(await group.locator(".mfga-entity-user").getAttribute("data-mfga-open"), "");
    await group.locator(".mfga-story-seemore").click();
    assert.match(await textOf(group.locator(".mfga-story-text")), /on a lead in the national park\.$/);
    assert.equal(await group.locator(".mfga-att-grid .mfga-att-photo").count(), 4);
    assert.equal(await textOf(group.locator(".mfga-att-more")), "+3");

    // Link card (Page actor, external link opens in a new tab), count formatting.
    const linkStory = story(page, "2002");
    assert.equal(await textOf(linkStory.locator(".mfga-att-title")), "Orionid meteor shower 2026: when and how to see it");
    assert.equal(await textOf(linkStory.locator(".mfga-att-source")), "theguardian.com");
    assert.equal(await linkStory.locator(".mfga-att-title").getAttribute("target"), "_blank");
    assert.equal(await textOf(linkStory.locator(".mfga-ufi-likes")), "1,234 people like this.");
    assert.equal(await textOf(linkStory.locator(".mfga-story-meta")), "47 minutes ago · Comment · Like · Share");

    // Video poster with the 2010 play overlay and duration.
    const video = story(page, "2003");
    assert.equal(await video.locator(".mfga-att-video-thumb .mfga-att-play").count(), 1);
    assert.equal(await textOf(video.locator(".mfga-att-caption")), "Length: 2:31");
    assert.equal(await textOf(video.locator(".mfga-ufi-likes")), "You and 4 others like this.", "any reaction counts as Like");

    // Shared story, indented with its own actor and time.
    const shared = story(page, "2004").locator(".mfga-story-shared");
    assert.equal(await textOf(shared.locator(".mfga-story-msg")), "NASA Saturn's rings, photographed in infrared.");
    assert.equal(await textOf(shared.locator(".mfga-story-meta")), "Yesterday at 9:00am");
    assert.equal(await shared.locator(".mfga-att-single img").count(), 1);

    // Event and passive headline; unavailable and "other" attachments.
    assert.equal(await textOf(story(page, "2005").locator(".mfga-story-msg")), "Jessica Kohler shared an event.");
    assert.equal(await textOf(story(page, "2005").locator(".mfga-att-event .mfga-att-title")), "Halloween party at Jess's");
    assert.equal(await textOf(story(page, "2006").locator(".mfga-att-unavailable-title")), "Attachment Unavailable");
    assert.equal(await textOf(story(page, "2006").locator(".mfga-att-other")), "View attachment");

    // No avatar -> silhouette; AI label; can't comment -> no Comment link, no comment box.
    const page2007 = story(page, "2007");
    assert.equal(await page2007.locator(".mfga-story-pic svg.mfga-pic-blank").count(), 1);
    assert.equal(await textOf(page2007.locator(".mfga-story-meta")), "8 minutes ago · AI-generated · Unlike · Share");
    assert.equal(await page2007.locator(".mfga-ufi-add").count(), 0);
    assert.equal(await page2007.locator(".mfga-story-comment").count(), 0);

    // Two actors, newline kept.
    const two = story(page, "2008");
    assert.equal(await textOf(two.locator(".mfga-story-msg")), "Samantha Hodges and Amy Winstead Road trip! First stop: the coast.");
    assert.equal(await two.locator(".mfga-story-text").evaluate((el) => el.getClientRects().length > 1 || el.offsetHeight > 20), true);

    assert.equal(await page.locator("[data-key]").evaluateAll((els) => els.every((el) => !el.innerHTML.includes("<script"))), true);
    await waitForImages(page);
    await page.screenshot({ path: path.join(OUT, "stream-gallery-en.png"), fullPage: true });
    await finish(page);
  });

  test("story links route through ctx.open; modifier clicks are left to the browser", async () => {
    const page = await openStream({ stories: "gallery" });
    const group = story(page, "2001");
    await group.locator(".mfga-story-time").click();
    await group.locator(".mfga-att-photo").first().click();
    await group.locator(".mfga-story-actor").first().click();
    const opened = (await calls(page, "open")).map((c) => c.args[0]);
    assert.deepEqual(opened, ["https://www.facebook.com/marta.nowak/posts/2001", "https://www.facebook.com/photo/?fbid=501", "https://www.facebook.com/marta.nowak"]);
    assert.deepEqual((await calls(page, "open"))[0].args[1], { newTab: false });
    await group.locator(".mfga-story-time").click({ modifiers: ["Control"] });
    assert.equal((await calls(page, "open")).length, 3, "ctrl+click is not intercepted");
    await finish(page);
  });

  test("a Facebook headline title continues the actor line instead of repeating the name", async () => {
    const page = await openStream({ stories: "extra" });
    const album = story(page, "3001");
    assert.equal(await textOf(album.locator(".mfga-story-msg").first()), "Samantha Hodges added 3 new photos to the album Hawaii.");
    assert.equal(await album.locator(".mfga-story-actor").count(), 1, "the name is shown once");
    assert.equal(await album.locator(".mfga-story-title").count(), 0, "not a bold group-post title");
    assert.equal(await textOf(album.locator(".mfga-story-msg").nth(1)), "Aloha from the Big Island!");
    assert.equal(await album.locator(".mfga-att-grid .mfga-att-photo").count(), 3);
    await waitForImages(page);
    await page.screenshot({ path: path.join(OUT, "stream-headline-title.png"), clip: await album.boundingBox() });
    await finish(page);
  });

  test("a story renders on its own with renderStory", async () => {
    const page = await browser.newPage({ html: PAGE_HTML });
    await page.addScriptTag({ content: script });
    await page.evaluate(() => window.mfgaStream.renderOne("1002"));
    const s = story(page, "1002");
    assert.equal(await textOf(s.locator(".mfga-story-meta")), "9 hours ago · Comment · Like");
    await s.locator(".mfga-story-like").click();
    await page.waitForFunction(() => window.__calls.some((c) => c.name === "react"));
    assert.equal(await textOf(s.locator(".mfga-story-like")), "Unlike");
    await finish(page);
  });
});

describe("stream: likes", () => {
  test("Like/Unlike is optimistic and reconciled with the echo", async () => {
    const page = await openStream({ stories: "replica" });
    await setCtl(page, { delayMs: 400 });
    const s = story(page, "1002");
    await s.locator(".mfga-story-like").click();
    assert.equal(await textOf(s.locator(".mfga-story-like")), "Unlike", "flips before the server answers");
    assert.equal(await textOf(s.locator(".mfga-ufi-likes")), "You and 1 other person like this.");
    await s.locator(".mfga-story-like").click(); // ignored while in flight
    await page.waitForFunction(() => window.__calls.filter((c) => c.name === "react").length === 1);
    await page.waitForTimeout(500);
    assert.equal(await textOf(s.locator(".mfga-story-like")), "Unlike");
    await s.locator(".mfga-story-like").click();
    assert.equal(await textOf(s.locator(".mfga-story-like")), "Like");
    assert.equal(await textOf(s.locator(".mfga-ufi-likes")), "1 person likes this.");
    await page.waitForTimeout(500);
    assert.deepEqual((await calls(page, "react")).map((c) => c.args), [["1002", LIKE_ID], ["1002", "0"]]);

    // A story nobody liked: the like row appears and disappears with the viewer's like.
    const s3 = story(page, "1003");
    assert.equal(await s3.locator(".mfga-ufi").isVisible(), false);
    await s3.locator(".mfga-story-like").click();
    assert.equal(await textOf(s3.locator(".mfga-ufi-likes")), "You like this.");
    await page.waitForTimeout(500);
    await s3.locator(".mfga-story-like").click();
    await page.waitForTimeout(500);
    assert.equal(await s3.locator(".mfga-ufi").isVisible(), false);
    await finish(page);
  });

  test("a failed or throwing like reverts and shows the 2010 inline error with the permalink", async () => {
    const page = await openStream({ stories: "replica" });
    await setCtl(page, { failReact: true, delayMs: 200 });
    const s = story(page, "1001");
    await s.locator(".mfga-story-like").click();
    assert.equal(await textOf(s.locator(".mfga-story-like")), "Like", "optimistic unlike");
    await s.locator(".mfga-ufi-error").waitFor();
    assert.equal(await textOf(s.locator(".mfga-story-like")), "Unlike", "reverted");
    assert.equal(await textOf(s.locator(".mfga-ufi-likes")), "You and 1 other person like this.");
    assert.equal(await textOf(s.locator(".mfga-ufi-error")), "Your Like couldn't be saved. Open the post on Facebook");
    await s.locator(".mfga-ufi-error-open").click();
    assert.equal((await calls(page, "open")).at(-1).args[0], "https://www.facebook.com/samantha.hodges/posts/1001");
    await page.screenshot({ path: path.join(OUT, "stream-like-error.png"), clip: { x: 195, y: 55, width: 535, height: 300 } });

    await setCtl(page, { failReact: false, throwReact: true });
    const s2 = story(page, "1002");
    await s2.locator(".mfga-story-like").click();
    await s2.locator(".mfga-ufi-error").waitFor();
    assert.equal(await textOf(s2.locator(".mfga-story-like")), "Like");
    assert.equal(await textOf(s2.locator(".mfga-ufi-likes")), "1 person likes this.");

    await setCtl(page, { throwReact: false });
    await s2.locator(".mfga-story-like").click();
    await page.waitForFunction(() => !document.querySelector('.mfga-story[data-key="1002"] .mfga-ufi-error:not([hidden])'));
    assert.equal(await textOf(s2.locator(".mfga-story-like")), "Unlike", "the error clears on the next success");
    await finish(page);
  });

  test("without actions the link shows the error immediately", async () => {
    const page = await openStream({ stories: "replica", noActions: true, previewComments: false });
    const s = story(page, "1003");
    await s.locator(".mfga-story-like").click();
    assert.equal(await textOf(s.locator(".mfga-ufi-error")), "Your Like couldn't be saved. Open the post on Facebook");
    assert.equal(await textOf(s.locator(".mfga-story-like")), "Like");
    await story(page, "1001").locator(".mfga-ufi-viewall-link").click();
    assert.equal(await textOf(story(page, "1001").locator(".mfga-ufi-error")), "Comments couldn't be loaded. Open the post on Facebook");
    await finish(page);
  });
});

describe("stream: comments", () => {
  test("Enter posts a comment and appends the echo; Shift+Enter adds a newline", async () => {
    const page = await openStream({ stories: "replica" });
    const s = story(page, "1002");
    await page.waitForFunction(() => document.querySelectorAll('.mfga-story[data-key="1002"] .mfga-ufi-comment').length === 2);
    const box = s.locator("textarea.mfga-ufi-input");
    await box.click();
    assert.match(await s.locator(".mfga-ufi-add").getAttribute("class"), /mfga-ufi-add-active/);
    await box.pressSequentially("So sorry");
    await box.press("Shift+Enter");
    await box.pressSequentially("Big hugs");
    assert.equal(await box.inputValue(), "So sorry\nBig hugs");
    await s.screenshot({ path: path.join(OUT, "stream-comment-typing.png") });
    await box.press("Enter");
    await page.waitForFunction(() => document.querySelectorAll('.mfga-story[data-key="1002"] .mfga-ufi-comment').length === 3);
    assert.deepEqual((await calls(page, "comment")).map((c) => c.args), [["1002", "So sorry\nBig hugs"]]);
    assert.equal(await box.inputValue(), "");
    const last = s.locator(".mfga-ufi-comment").last();
    assert.equal(await textOf(last), "J.D. Hodges So sorry Big hugs 0 seconds ago");
    assert.equal(await s.locator(".mfga-ufi-viewall").isVisible(), false, "the new comment joins the preview");
    await box.evaluate((el) => el.blur());
    assert.doesNotMatch(await s.locator(".mfga-ufi-add").getAttribute("class"), /mfga-ufi-add-active/);
    assert.equal(await box.evaluate((el) => el.offsetHeight), 22, "the empty box collapses to one line again");

    // Whitespace-only input is ignored.
    await box.fill("   ");
    await box.press("Enter");
    assert.equal((await calls(page, "comment")).length, 1);
    await finish(page);
  });

  test("a failed comment keeps the text and shows the inline error", async () => {
    const page = await openStream({ stories: "replica", previewComments: false });
    await setCtl(page, { failComment: true });
    const s = story(page, "1001");
    const box = s.locator("textarea.mfga-ufi-input");
    await box.fill("Mahalo!");
    await box.press("Enter");
    await s.locator(".mfga-ufi-error").waitFor();
    assert.equal(await textOf(s.locator(".mfga-ufi-error")), "Your comment couldn't be posted. Open the post on Facebook");
    assert.equal(await box.inputValue(), "Mahalo!");
    assert.equal(await s.locator(".mfga-ufi-comment").count(), 0);
    await finish(page);
  });

  test("Comment reveals the box on stories without comments; the button posts too", async () => {
    const page = await openStream({ stories: "replica" });
    const s = story(page, "1003");
    assert.equal(await s.locator(".mfga-ufi-add").isVisible(), false);
    await s.locator(".mfga-story-comment").click();
    assert.equal(await s.locator(".mfga-ufi-add").isVisible(), true);
    assert.equal(await s.locator("textarea").evaluate((el) => el === document.activeElement), true);
    assert.equal(await s.locator(".mfga-ufi-me img").getAttribute("src"), "https://scontent.fixture.fbcdn.net/jd-50.png");
    await s.locator("textarea").fill("Clear your cache!");
    await s.screenshot({ path: path.join(OUT, "stream-comment-open.png") });
    await setCtl(page, { bareEcho: true });
    await s.locator(".mfga-ufi-submit").click();
    await page.waitForFunction(() => document.querySelectorAll('.mfga-story[data-key="1003"] .mfga-ufi-comment').length === 1);
    assert.equal(await s.locator(".mfga-ufi-viewall").isVisible(), false);
    const posted = s.locator(".mfga-ufi-comment");
    assert.equal(await posted.locator(".mfga-ufi-pic img").getAttribute("src"), "https://scontent.fixture.fbcdn.net/jd-50.png", "missing echo fields come from ctx.me");
    assert.equal(await posted.locator(".mfga-ufi-actor").getAttribute("href"), "https://www.facebook.com/jd.hodges");
    assert.equal(await textOf(posted.locator(".mfga-ufi-comment-meta")), "0 seconds ago");
    await finish(page);
  });

  test("View all N comments pages through the comments; previews load once and only after 1s", async () => {
    const page = await openStream({ stories: "gallery" }, { viewport: { width: 994, height: 700 } });
    await setCtl(page, { pageSize: 20 });
    await page.locator(".mfga-feed-more").click();
    await page.waitForSelector(".mfga-feed-end");
    await page.evaluate(() => window.scrollTo(0, 0));

    // 2008 is far below the fold: a short glimpse must not load its preview.
    const s = story(page, "2008");
    await s.locator(".mfga-ufi").scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1300);
    assert.equal((await calls(page, "comments")).filter((c) => c.args[0] === "2008").length, 0);

    await s.locator(".mfga-ufi").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelectorAll('.mfga-story[data-key="2008"] .mfga-ufi-comment').length === 2);
    assert.equal(await textOf(s.locator(".mfga-ufi-viewall")), "View all 45 comments");
    const viewAll = s.locator(".mfga-ufi-viewall-link");
    await viewAll.click();
    assert.equal(await s.locator(".mfga-ufi-comment").count(), 10, "the preview page is shown in full first");
    await page.waitForFunction(() => document.querySelectorAll('.mfga-story[data-key="2008"] .mfga-ufi-comment').length === 20);
    assert.equal(await textOf(s.locator(".mfga-ufi-viewall")), "View more comments");
    for (const n of [30, 40, 45]) {
      await viewAll.click();
      await page.waitForFunction((k) => document.querySelectorAll('.mfga-story[data-key="2008"] .mfga-ufi-comment').length === k, n);
    }
    assert.equal(await s.locator(".mfga-ufi-viewall").isVisible(), false);
    const texts = await s.locator(".mfga-ufi-comment-text").evaluateAll((els) => els.map((e) => e.textContent));
    assert.match(texts[0], /Comment number 1 on/);
    assert.match(texts[44], /Comment number 45 on/);
    const loads = (await calls(page, "comments")).filter((c) => c.args[0] === "2008").map((c) => c.args[1]);
    assert.deepEqual(loads, [null, "10", "20", "30", "40"]);

    // Comment meta: likes and replies.
    const meta = await textOf(s.locator(".mfga-ufi-comment-meta").nth(3));
    assert.match(meta, /· 3 replies$/);
    await s.locator(".mfga-ufi-comment").nth(5).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, "stream-comments-expanded.png") });
    await finish(page);
  });

  test("failed comment loads show the error on click but stay silent for previews", async () => {
    const page = await openStream({ stories: "replica" });
    await setCtl(page, { failComments: true });
    await page.waitForTimeout(1400);
    assert.equal(await page.locator(".mfga-ufi-error:not([hidden])").count(), 0, "preview failures are silent");
    const s = story(page, "1001");
    await s.locator(".mfga-ufi-viewall-link").click();
    await s.locator(".mfga-ufi-error").waitFor();
    assert.equal(await textOf(s.locator(".mfga-ufi-error")), "Comments couldn't be loaded. Open the post on Facebook");
    await setCtl(page, { failComments: false });
    await s.locator(".mfga-ufi-viewall-link").click();
    await page.waitForFunction(() => document.querySelectorAll('.mfga-story[data-key="1001"] .mfga-ufi-comment').length === 4);
    assert.equal(await s.locator(".mfga-ufi-error").isVisible(), false);
    await finish(page);
  });

  test("View all clicked while a preview is loading shows the error when that load fails", async () => {
    const page = await openStream({ stories: "replica" });
    await setCtl(page, { failComments: true, delayMs: 800 });
    await page.waitForFunction(() => window.__calls.some((c) => c.name === "comments" && c.args[0] === "1001"));
    const s = story(page, "1001");
    await s.locator(".mfga-ufi-viewall-link").click();
    await s.locator(".mfga-ufi-error").waitFor();
    assert.equal(await textOf(s.locator(".mfga-ufi-error")), "Comments couldn't be loaded. Open the post on Facebook");
    assert.equal((await calls(page, "comments")).filter((c) => c.args[0] === "1001").length, 1, "the click joined the running load");
    await finish(page);
  });
});

describe("stream: media", () => {
  test("clicking a video poster swaps in a <video> with the HD file", async () => {
    const page = await openStream({ stories: "gallery" });
    const s = story(page, "2003");
    await s.locator(".mfga-att-video-thumb").scrollIntoViewIfNeeded();
    await waitForImages(page);
    await page.screenshot({ path: path.join(OUT, "stream-video-poster.png"), clip: await s.boundingBox() });
    await s.locator(".mfga-att-video-thumb").click();
    const video = s.locator("video.mfga-att-player");
    await video.waitFor();
    assert.equal(await video.getAttribute("src"), "https://video.fixture.fbcdn.net/artemis-hd.mp4");
    assert.deepEqual(await video.evaluate((v) => [v.controls, v.autoplay, v.preload, v.width, v.height]), [true, true, "none", 320, 180]);
    assert.equal(await s.locator(".mfga-att-video-thumb").count(), 0);
    assert.equal((await calls(page, "open")).length, 0, "playing inline does not open the post");
    await finish(page);
  });

  test("a poster URL that is not http(s) never reaches the <video>", async () => {
    const page = await openStream({ stories: "extra" });
    const s = story(page, "3002");
    assert.equal(await s.locator(".mfga-att-video-thumb img").count(), 0);
    assert.equal(await textOf(s.locator(".mfga-att-live")), "LIVE");
    await s.locator(".mfga-att-video-thumb").click();
    const video = s.locator("video.mfga-att-player");
    await video.waitFor();
    assert.equal(await video.getAttribute("src"), "https://video.fixture.fbcdn.net/unsafe-poster.mp4");
    assert.equal(await video.getAttribute("poster"), null);
    await finish(page);
  });
});

describe("stream: feed view", () => {
  test("Older Posts pages through the feed with a loading state, then ends", async () => {
    const page = await openStream({ stories: "all" });
    assert.equal(await page.locator(".mfga-story").count(), 4);
    await setCtl(page, { delayMs: 400 });
    await page.locator(".mfga-feed-more").click();
    await page.locator(".mfga-feed-more.mfga-loading .mfga-spinner").waitFor();
    await page.screenshot({ path: path.join(OUT, "stream-loading.png"), clip: await page.locator(".mfga-feed-footer").boundingBox() });
    await page.waitForFunction(() => document.querySelectorAll(".mfga-story").length === 8);
    await page.locator(".mfga-feed-more:not(.mfga-loading)").click();
    await page.waitForSelector(".mfga-feed-end");
    assert.equal(await page.locator(".mfga-story").count(), 11);
    assert.equal(await textOf(page.locator(".mfga-feed-end")), "There are no more posts to show right now.");
    const keys = await page.locator(".mfga-story").evaluateAll((els) => els.map((e) => e.dataset.key));
    assert.equal(new Set(keys).size, keys.length, "no duplicates");
    assert.deepEqual((await calls(page, "getFeed")).map((c) => c.args), [["recent", ["friends", "groups", "pages", "favorites"]]]);
    assert.equal(await textOf(page.locator(".mfga-feed-status")), "3 ads and 5 suggested posts were hidden.");
    await finish(page);
  });

  test("auto-load fetches the next page when the end of the stream comes into view", async () => {
    const page = await openStream({ stories: "all", autoLoad: true, previewComments: false }, { viewport: { width: 994, height: 600 } });
    await page.waitForTimeout(500);
    const first = await page.locator(".mfga-story").count();
    assert.ok(first >= 4 && first < 11, `loads only what is near the viewport (${first})`);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction((n) => document.querySelectorAll(".mfga-story").length > n, first);
    for (let i = 0; i < 5 && !(await page.locator(".mfga-feed-end").count()); i++) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(300);
    }
    await page.waitForSelector(".mfga-feed-end");
    assert.equal(await page.locator(".mfga-story").count(), 11);
    await finish(page);
  });

  test("auto-load never fetches while the stream is not displayed", async () => {
    const page = await openStream({ stories: "all", autoLoad: true, previewComments: false }, { viewport: { width: 994, height: 600 } });
    await page.waitForTimeout(500);
    const more = async () => (await calls(page, "more")).length;
    const before = await more();
    await setCtl(page, { delayMs: 300, pageSize: 1 });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction((n) => window.__calls.filter((c) => c.name === "more").length > n, before);
    await page.evaluate(() => (document.getElementById("mfga-stream").style.display = "none"));
    await page.waitForTimeout(1200);
    assert.equal(await more(), before + 1, "only the page requested before the stream was hidden");
    await page.evaluate(() => (document.getElementById("mfga-stream").style.display = ""));
    await page.waitForFunction((n) => window.__calls.filter((c) => c.name === "more").length > n, before + 1);
    await finish(page);
  });

  test("a throwing ctx callback or a missing feed never leaves the pager stuck", async () => {
    const page = await browser.newPage({ html: PAGE_HTML });
    await page.addScriptTag({ content: script });
    await page.evaluate(() => window.mfgaStream.mount({ stories: "all", throwingCallbacks: true, previewComments: false }));
    await page.locator(".mfga-feed-more:not(.mfga-loading)").waitFor();
    assert.equal(await page.locator(".mfga-story").count(), 4);
    await page.locator(".mfga-feed-more").click();
    await page.waitForFunction(() => document.querySelectorAll(".mfga-story").length === 8);
    await page.locator(".mfga-feed-more:not(.mfga-loading)").waitFor();
    const health = await page.evaluate(() => window.mfgaStream.health());
    assert.equal(health.errors["stream.ui"]?.n, 3, "onSeen once and hiddenStats twice are recorded");

    await page.evaluate(() => window.mfgaStream.mount({ stories: "all", noFeed: true }));
    await page.locator(".mfga-feed-error").waitFor();
    assert.equal(await textOf(page.locator(".mfga-feed-error")), "News Feed couldn't be loaded right now. Try Again");
    await page.locator(".mfga-feed-retry").click();
    assert.equal((await calls(page, "getFeed")).length, 3, "Try Again asks for a feed again");
    assert.equal(await page.locator(".mfga-feed-error").count(), 1);
    assert.deepEqual(page.__errors || [], [], "no page errors");
    await page.close();
  });

  test("error state with retry, then empty state", async () => {
    const page = await browser.newPage({ html: PAGE_HTML });
    await page.addScriptTag({ content: script });
    await page.evaluate(() => {
      window.__ctl.failPage = true;
      window.mfgaStream.mount({ stories: "replica" });
    });
    await page.locator(".mfga-feed-error").waitFor();
    assert.equal(await textOf(page.locator(".mfga-feed-error")), "News Feed couldn't be loaded right now. Try Again");
    await page.screenshot({ path: path.join(OUT, "stream-error.png"), clip: { x: 195, y: 55, width: 535, height: 160 } });
    await setCtl(page, { failPage: false });
    await page.locator(".mfga-feed-retry").click();
    await page.waitForFunction(() => document.querySelectorAll(".mfga-story").length === 3);
    assert.equal(await page.locator(".mfga-feed-error").count(), 0);

    await page.evaluate(() => window.mfgaStream.mount({ stories: "none", hidden: {} }));
    await page.locator(".mfga-feed-empty").waitFor();
    assert.equal(await textOf(page.locator(".mfga-feed-empty")), "There are no posts to show right now. Posts from your friends, groups and pages will show up here.");
    assert.equal(await page.locator(".mfga-feed-status").isVisible(), false);
    assert.equal(await page.locator("#mfga-stream").count(), 1, "destroy() removed the previous view");
    await page.screenshot({ path: path.join(OUT, "stream-empty.png"), clip: { x: 195, y: 55, width: 535, height: 200 } });
    await finish(page);
  });

  test("Top News · Most Recent switch, composer and welcome box", async () => {
    const page = await openStream({ stories: "replica", welcome: true });
    await page.locator(".mfga-feed-composer").click();
    await page.locator(".mfga-feed-composer").press("Enter");
    assert.equal((await calls(page, "openComposer")).length, 2);

    await page.locator(".mfga-feed-modes button", { hasText: "Top News" }).click();
    await page.waitForFunction(() => document.querySelector('.mfga-story[data-key="2001"]'));
    assert.deepEqual((await calls(page, "modeChange")).map((c) => c.args[0]), ["top"]);
    assert.deepEqual((await calls(page, "getFeed")).map((c) => c.args[0]), ["recent", "top"]);
    assert.equal(await textOf(page.locator(".mfga-feed-mode-on")), "Top News");
    assert.equal(await page.locator('.mfga-story[data-key="1001"]').count(), 0, "the old stories are gone");
    await page.locator(".mfga-feed-modes strong").click();
    assert.equal((await calls(page, "getFeed")).length, 2, "clicking the current mode does nothing");

    await page.locator(".mfga-welcome-learn").click();
    assert.deepEqual((await calls(page, "open")).at(-1).args, ["https://github.com/pawel-mazurkiewicz/mfga#readme", { newTab: true }]);
    await page.locator(".mfga-welcome-close").click();
    assert.equal(await page.locator(".mfga-welcome").count(), 0);
    assert.equal((await calls(page, "dismissWelcome")).length, 1);
    await finish(page);
  });

  test("relative times refresh every minute", async () => {
    const page = await browser.newPage({ html: PAGE_HTML });
    await page.clock.install({ time: new Date("2026-10-21T15:00:00Z") });
    await page.addScriptTag({ content: script });
    await page.evaluate(() => window.mfgaStream.mount({ stories: "replica", previewComments: false }));
    await page.clock.runFor(100);
    const time = story(page, "1001").locator(".mfga-story-time");
    assert.equal(await textOf(time), "26 minutes ago");
    assert.match(await time.locator("abbr").getAttribute("title"), /2026 at /);
    await setCtl(page, { nowShiftMs: 40 * 60 * 1000 });
    await page.clock.runFor(61_000);
    assert.equal(await textOf(time), "about an hour ago");
    await finish(page);
  });
});
