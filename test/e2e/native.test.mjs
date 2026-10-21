// Native path end to end: cleaner verdicts on the 2026 feed fixtures, hiding mechanics (first-child mark,
// bottom guard, remount), the 2010 post skin and the theme tokens, in Chromium.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { launchBrowser, bundle, ROOT } from "./helpers/browser.mjs";

const SHOTS = `${ROOT}/test-results/native`;
const read = (name) => readFileSync(`${ROOT}/test/fixtures/native/${name}`, "utf8");
const LIGHT_VARS = read("fb-light-vars.css");
const DARK_VARS = read("fb-dark-vars.css");
const fixture = (name) => read(name).replace("/*FB_VARS*/", LIGHT_VARS);

let browser;
let entry;

before(async () => {
  mkdirSync(SHOTS, { recursive: true });
  browser = await launchBrowser({ viewport: { width: 1000, height: 900 } });
  entry = await bundle("test/e2e/entries/native-entry.js");
});

after(async () => {
  await browser?.close();
});

/** Two frames plus a tick: enough for the cleaner's and the skin's rAF-batched passes. */
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30)))));

async function open(name, { start = true, ...opts } = {}) {
  const page = await browser.newPage({ html: fixture(name) });
  await page.addScriptTag({ content: entry });
  if (start) await startModules(page, opts);
  return page;
}

/** Installs the stylesheet and starts the cleaner and the skin the way src/main.js does. */
async function startModules(page, { lang = "en", settings = {}, route = { mode: "home" } } = {}) {
  await page.evaluate(
    ([lang, patch, route]) => {
      const N = window.__mfgaNative;
      N.setLocale(lang);
      window.__settings = N.memorySettings(patch);
      N.installStyle(window.__settings.get());
      window.__cleaner = N.startCleaner({ settings: window.__settings, route, onStats: (stats) => (window.__lastStats = stats) });
      window.__skin = N.startSkin({ settings: window.__settings });
    },
    [lang, settings, route],
  );
  await settle(page);
}

function noErrors(page) {
  assert.deepEqual(page.__errors ?? [], [], "page errors");
}

const verdicts = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("[aria-posinset]")].map((u) => ({
      fixture: u.dataset.fixture,
      expect: u.dataset.expect,
      mark: u.firstElementChild?.getAttribute("data-mfga-hide") ?? null,
      hidden: getComputedStyle(u).display === "none",
    })),
  );

function assertVerdicts(list) {
  assert.ok(list.length > 5);
  for (const v of list) {
    if (v.expect === "keep") {
      assert.equal(v.hidden, false, `${v.fixture} must stay visible`);
      assert.equal(v.mark, null, `${v.fixture} must not be marked`);
    } else {
      const reason = v.expect.slice("hide:".length);
      assert.equal(v.mark, reason, `${v.fixture} must be marked ${reason}`);
      assert.equal(v.hidden, true, `${v.fixture} must be hidden`);
    }
  }
}

test("every English fixture unit gets the expected verdict", async () => {
  const page = await open("feed.html");
  assertVerdicts(await verdicts(page));
  const stats = await page.evaluate(() => window.__cleaner.stats());
  assert.equal(stats.seen, 16);
  assert.equal(stats.hidden, 11, "10 units and the Stories tray");
  assert.deepEqual(stats.reasons, { sponsored: 4, suggested: 1, "group-suggestions": 2, reels: 1, pymk: 1, "meta-ai": 1, stories: 1 });
  assert.equal(stats.signals["sponsored:ad-info-link"], 1);
  assert.equal(stats.signals["sponsored:ad-label"], 2, "shuffled 'Ad' and aria-labelledby 'Sponsored'");
  assert.equal(stats.signals["sponsored:ads-about"], 1);
  assert.equal(stats.skeletons, 1);
  assert.equal(stats.virtualized, 1);
  assert.equal(stats.undecodable, 0);
  assert.deepEqual(stats.probe.en, { posts: 4, detected: "en", mismatches: {} });
  await page.waitForFunction(() => window.__lastStats?.hidden === 11, null, { timeout: 2000 });
  noErrors(page);
  await page.close();
});

test("the SVG <use> chain label is decoded on its own", async () => {
  const page = await open("feed.html", { start: false });
  const hits = await page.evaluate(() => {
    const N = window.__mfgaNative;
    const resolve = N.labelResolver(N.createLabelCache());
    const unit = document.querySelector('[data-fixture="sponsored-cft-use"]');
    return N.detectUnit(unit, resolve).hits.map((h) => h.signal);
  });
  assert.deepEqual(hits, ["ad-info-link", "ad-label"]);
  await page.close();
});

test("hiding marks the [aria-posinset] element's first child, never the feed list's children", async () => {
  const page = await open("feed.html");
  const r = await page.evaluate(() => {
    const marked = [...document.querySelectorAll("[data-mfga-hide]")];
    const list = document.getElementById("feed-list");
    const mfgaAttrs = (el) => [...el.attributes].filter((a) => a.name.startsWith("data-mfga"));
    return {
      onFirstChild: marked.filter((el) => el.parentElement.matches("[aria-posinset]")).every((el) => el === el.parentElement.firstElementChild),
      units: marked.filter((el) => el.parentElement.matches("[aria-posinset]")).length,
      others: marked.filter((el) => !el.parentElement.matches("[aria-posinset]")).map((el) => el.getAttribute("data-focus-target") ?? el.getAttribute("aria-label")),
      listChildrenClean: [...list.children].every((slot) => mfgaAttrs(slot).length === 0),
      unitsClean: [...document.querySelectorAll("[aria-posinset]")].every((u) => mfgaAttrs(u).length === 0),
      composer: getComputedStyle(document.querySelector('[aria-label="Create a post"]')).display,
    };
  });
  assert.equal(r.onFirstChild, true);
  assert.equal(r.units, 10);
  assert.deepEqual(r.others.sort(), ["Stories", "stories_tray"], "the Stories tray and its labelled region");
  assert.equal(r.listChildrenClean, true, "no data-mfga-* on the feed list's direct children");
  assert.equal(r.unitsClean, true, "no data-mfga-* on the [aria-posinset] elements themselves");
  assert.notEqual(r.composer, "none");
  noErrors(page);
  await page.close();
});

test("nothing is hidden within 1200px of the document bottom; it is hidden once the page grows", async () => {
  const page = await open("feed.html");
  await page.evaluate(() => {
    const source = document.querySelector('[data-fixture="sponsored-shuffled-ad"]').closest(".fx-slot");
    const slot = source.cloneNode(true);
    const unit = slot.querySelector("[aria-posinset]");
    unit.setAttribute("aria-posinset", "100");
    unit.dataset.fixture = "late-ad";
    unit.firstElementChild.removeAttribute("data-mfga-hide");
    document.getElementById("fx-loader").style.height = "0px";
    document.getElementById("feed-list").append(slot);
  });
  await settle(page);
  const near = await page.evaluate(() => {
    const unit = document.querySelector('[data-fixture="late-ad"]');
    const r = unit.getBoundingClientRect();
    return {
      hidden: getComputedStyle(unit).display === "none",
      fromBottom: document.documentElement.scrollHeight - (r.bottom + scrollY),
      pending: window.__cleaner.stats().pending,
    };
  });
  assert.equal(near.hidden, false, "an ad at the very end stays until more content loads");
  assert.ok(near.fromBottom < 1200, `unit is ${near.fromBottom}px from the bottom`);
  assert.equal(near.pending, 1);

  await page.evaluate(() => {
    document.getElementById("fx-loader").style.height = "1500px";
    window.dispatchEvent(new Event("scroll"));
  });
  await settle(page);
  const later = await page.evaluate(() => ({
    mark: document.querySelector('[data-fixture="late-ad"]').firstElementChild.getAttribute("data-mfga-hide"),
    pending: window.__cleaner.stats().pending,
  }));
  assert.equal(later.mark, "sponsored");
  assert.equal(later.pending, 0);
  noErrors(page);
  await page.close();
});

test("a remounted (virtualized) slot keeps its verdict even when its label is gone", async () => {
  const page = await open("feed.html");
  await page.evaluate(() => {
    const unit = document.querySelector('[data-fixture="sponsored-labelledby"]');
    const fresh = unit.querySelector("[data-virtualized]").firstElementChild.cloneNode(true);
    // Facebook unmounts the far-away post...
    const wrapper = unit.firstElementChild;
    const v = wrapper.querySelector("[data-virtualized]");
    v.setAttribute("data-virtualized", "true");
    v.replaceChildren(Object.assign(document.createElement("div"), { hidden: true }));
    document.getElementById("_r_lbl1_").remove();
    window.__fresh = fresh;
  });
  await settle(page);
  const unmounted = await page.evaluate(() => {
    const unit = document.querySelector('[data-fixture="sponsored-labelledby"]');
    return { mark: unit.firstElementChild.getAttribute("data-mfga-hide"), virtualized: window.__cleaner.stats().virtualized };
  });
  assert.equal(unmounted.mark, "sponsored");
  assert.equal(unmounted.virtualized, 2);

  // ...and later mounts a fresh subtree (new wrapper, label target gone for good).
  await page.evaluate(() => {
    const unit = document.querySelector('[data-fixture="sponsored-labelledby"]');
    for (const el of window.__fresh.querySelectorAll("[aria-labelledby]")) el.setAttribute("aria-labelledby", "_r_gone_");
    const wrapper = document.createElement("div");
    const v = document.createElement("div");
    v.setAttribute("data-virtualized", "false");
    v.append(window.__fresh);
    wrapper.append(v);
    unit.replaceChildren(wrapper);
  });
  await settle(page);
  const remounted = await page.evaluate(() => {
    const unit = document.querySelector('[data-fixture="sponsored-labelledby"]');
    return { mark: unit.firstElementChild.getAttribute("data-mfga-hide"), hidden: getComputedStyle(unit).display === "none" };
  });
  assert.deepEqual(remounted, { mark: "sponsored", hidden: true });

  // A kept post that remounts is re-skinned, and the fixture's virtualized slot is classified on mount.
  await page.evaluate(() => {
    const organic = document.querySelector('[data-fixture="organic-plain"]');
    const post = organic.querySelector("[data-virtualized]").firstElementChild;
    const copy = post.cloneNode(true);
    for (const el of copy.querySelectorAll("[data-mfga-part], [data-mfga-action]")) {
      el.removeAttribute("data-mfga-part");
      el.removeAttribute("data-mfga-action");
    }
    post.replaceWith(copy);
    const slot = document.querySelector('[data-fixture="virtualized"]');
    const ad = document.querySelector('[data-fixture="sponsored-shuffled-ad"] [data-virtualized]').firstElementChild.cloneNode(true);
    const v = slot.querySelector("[data-virtualized]");
    v.setAttribute("data-virtualized", "false");
    v.replaceChildren(ad);
  });
  await settle(page);
  const after = await page.evaluate(() => ({
    organic: [...document.querySelectorAll('[data-fixture="organic-plain"] [data-mfga-part]')].map((e) => e.getAttribute("data-mfga-part")),
    organicMark: document.querySelector('[data-fixture="organic-plain"]').firstElementChild.getAttribute("data-mfga-hide"),
    slotMark: document.querySelector('[data-fixture="virtualized"]').firstElementChild.getAttribute("data-mfga-hide"),
  }));
  assert.deepEqual(after.organic, ["avatar", "name", "byline", "message", "footer", "summary", "actions"]);
  assert.equal(after.organicMark, null);
  assert.equal(after.slotMark, "sponsored");
  noErrors(page);
  await page.close();
});

test("skeletons are never hidden and are checked again when they fill in", async () => {
  const page = await open("feed.html");
  await page.evaluate(() => {
    const slot = document.querySelector('[data-fixture="skeleton"]');
    const ad = document.querySelector('[data-fixture="sponsored-cft-use"] [data-virtualized]').firstElementChild.cloneNode(true);
    slot.querySelector("[data-virtualized]").replaceChildren(ad);
  });
  await settle(page);
  const mark = await page.evaluate(() => document.querySelector('[data-fixture="skeleton"]').firstElementChild.getAttribute("data-mfga-hide"));
  assert.equal(mark, "sponsored");
  await page.close();
});

test("aria-labelledby targets that vanish within a frame are read from the label cache", async () => {
  const page = await open("feed.html");
  await page.evaluate(async () => {
    const source = document.querySelector('[data-fixture="organic-plain"]').closest(".fx-slot");
    const slot = source.cloneNode(true);
    const unit = slot.querySelector("[aria-posinset]");
    unit.setAttribute("aria-posinset", "50");
    unit.dataset.fixture = "vanishing-label";
    // The byline shows only the labelled-by reference, like a 2026-03 ad whose glyphs are all decoys.
    const link = unit.querySelector(".fx-byline a[target]");
    link.setAttribute("href", "https://www.facebook.com/");
    const label = document.createElement("span");
    label.setAttribute("aria-labelledby", "_r_tmp_");
    link.replaceChildren(label);
    const target = Object.assign(document.createElement("span"), { id: "_r_tmp_", textContent: "Sponsored" });
    document.getElementById("feed-list").prepend(slot);
    document.body.append(target);
    await Promise.resolve(); // the cleaner's MutationObserver callback runs first and caches the text
    target.remove();
  });
  await settle(page);
  const r = await page.evaluate(() => ({
    target: document.getElementById("_r_tmp_"),
    mark: document.querySelector('[data-fixture="vanishing-label"]').firstElementChild.getAttribute("data-mfga-hide"),
  }));
  assert.equal(r.target, null);
  assert.equal(r.mark, "sponsored");
  noErrors(page);
  await page.close();
});

test("Follow/Join suggestions are route-gated; ads are hidden everywhere", async () => {
  const page = await open("feed.html", { route: { mode: "page", path: "/groups/100002/" } });
  const onGroupPage = Object.fromEntries((await verdicts(page)).map((v) => [v.fixture, v.mark]));
  assert.equal(onGroupPage["suggested-follow"], null);
  assert.equal(onGroupPage["group-join"], null);
  assert.equal(onGroupPage["sponsored-cft-use"], "sponsored");
  assert.equal(onGroupPage["reels-panel"], "reels");
  await page.evaluate(() => window.__cleaner.setRoute({ mode: "home" }));
  await settle(page);
  assertVerdicts(await verdicts(page));
  noErrors(page);
  await page.close();
});

test("settings changes re-apply verdicts; stop() removes every mark and tag", async () => {
  const page = await open("feed.html");
  await page.evaluate(() => window.__settings.update({ clean: { reels: false, sponsored: false } }));
  await settle(page);
  const toggled = Object.fromEntries((await verdicts(page)).map((v) => [v.fixture, v]));
  assert.equal(toggled["reels-panel"].hidden, false);
  assert.equal(toggled["sponsored-cft-use"].hidden, false);
  assert.equal(toggled["pymk-panel"].mark, "pymk");
  await page.evaluate(() => window.__settings.update({ clean: { reels: true, sponsored: true } }));
  await settle(page);
  assertVerdicts(await verdicts(page));

  await page.evaluate(() => window.__settings.update({ look: { skinPosts: false } }));
  await settle(page);
  assert.equal(await page.evaluate(() => document.querySelectorAll("[data-mfga-part]").length), 0);

  const left = await page.evaluate(() => {
    window.__cleaner.stop();
    window.__skin.stop();
    return document.querySelectorAll("[data-mfga-hide], [data-mfga-part], [data-mfga-action]").length;
  });
  assert.equal(left, 0);
  noErrors(page);
  await page.close();
});

test("a frame's new junk units are all measured before the first one is hidden (no layout thrash)", async () => {
  const page = await open("feed.html");
  const log = await page.evaluate(async () => {
    const N = window.__mfgaNative;
    const list = document.getElementById("feed-list");
    list.prepend(N.cloneSlot("sponsored-shuffled-ad", "ad-a", 61), N.cloneSlot("sponsored-cft-use", "ad-b", 62), N.cloneSlot("suggested-follow", "ad-c", 63));
    const log = [];
    const { getBoundingClientRect, setAttribute } = Element.prototype;
    const getComputedStyle = window.getComputedStyle;
    Element.prototype.getBoundingClientRect = function (...a) {
      log.push("read");
      return getBoundingClientRect.apply(this, a);
    };
    window.getComputedStyle = (...a) => (log.push("read"), getComputedStyle(...a));
    Element.prototype.setAttribute = function (name, value) {
      if (name === "data-mfga-hide") log.push("write");
      return setAttribute.call(this, name, value);
    };
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    Object.assign(Element.prototype, { getBoundingClientRect, setAttribute });
    window.getComputedStyle = getComputedStyle;
    return log;
  });
  assert.equal(log.filter((e) => e === "write").length, 3);
  assert.ok(log.lastIndexOf("read") < log.indexOf("write"), `reads and writes interleave: ${log.join(" ")}`);
  const marks = await page.evaluate(() => ["ad-a", "ad-b", "ad-c"].map((f) => document.querySelector(`[data-fixture="${f}"]`).firstElementChild.getAttribute("data-mfga-hide")));
  assert.deepEqual(marks, ["sponsored", "sponsored", "suggested"]);
  noErrors(page);
  await page.close();
});

test("stop() wins over a pass already queued for the next frame, and stats stop with it", async () => {
  const page = await open("feed.html");
  const r = await page.evaluate(async () => {
    document.getElementById("feed-list").prepend(window.__mfgaNative.cloneSlot("sponsored-shuffled-ad", "late-ad", 64), window.__mfgaNative.cloneSlot("organic-plain", "late-post", 65));
    await Promise.resolve(); // the observers have run and queued their passes for the next frame
    window.__cleaner.stop();
    window.__skin.stop();
    window.__lastStats = null;
    await new Promise((res) => setTimeout(res, 400));
    return { marks: document.querySelectorAll("[data-mfga-hide], [data-mfga-part], [data-mfga-action]").length, stats: window.__lastStats };
  });
  assert.equal(r.marks, 0);
  assert.equal(r.stats, null, "no onStats call after stop()");
  noErrors(page);
  await page.close();
});

test("onStats keeps reporting while the page mutates every frame", async () => {
  const page = await open("feed.html");
  await page.waitForFunction(() => window.__lastStats?.hidden === 11, null, { timeout: 2000 });
  const hidden = await page.evaluate(async () => {
    // Like a playing video's time display: a kept post changes on every frame for about two seconds.
    const text = document.querySelector('[data-fixture="organic-plain"] [data-ad-rendering-role="story_message"] [style]');
    let n = 0;
    const tick = () => {
      text.replaceChildren(`0:${String(n++).padStart(2, "0")}`);
      if (n < 120) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    document.getElementById("feed-list").prepend(window.__mfgaNative.cloneSlot("sponsored-shuffled-ad", "busy-ad", 66));
    await new Promise((res) => setTimeout(res, 800));
    return window.__lastStats.hidden;
  });
  assert.equal(hidden, 12);
  noErrors(page);
  await page.close();
});

test("a throwing onStats listener is recorded but does not switch the cleaner off", async () => {
  const page = await open("feed.html", { start: false });
  await page.evaluate(() => {
    const N = window.__mfgaNative;
    window.__settings = N.memorySettings();
    N.installStyle(window.__settings.get());
    const onStats = () => {
      throw new Error("listener bug");
    };
    window.__cleaner = N.startCleaner({ settings: window.__settings, route: { mode: "home" }, onStats });
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById("feed-list").prepend(window.__mfgaNative.cloneSlot("sponsored-shuffled-ad", "after-error", 68)));
  await settle(page);
  const r = await page.evaluate(() => ({
    mark: document.querySelector('[data-fixture="after-error"]').firstElementChild.getAttribute("data-mfga-hide"),
    errors: window.__mfgaNative.health.errors.cleaner?.n ?? 0,
    disabled: window.__mfgaNative.health.disabled.has("cleaner"),
  }));
  assert.equal(r.mark, "sponsored");
  assert.ok(r.errors >= 1, "the listener's error is in the health panel");
  assert.equal(r.disabled, false);
  noErrors(page);
  await page.close();
});

test("the Stories tray takes only its own labelled region along, never a wider top-of-feed region", async () => {
  const page = await open("feed.html", { start: false });
  await page.evaluate(() => {
    // A cohort where the region around the tray also holds the composer.
    const region = document.querySelector(".fx-stories-region");
    region.setAttribute("aria-label", "profile plus top of feed cards");
    region.prepend(document.querySelector('[aria-label="Create a post"]'));
  });
  await startModules(page);
  const r = await page.evaluate(() => ({
    tray: document.querySelector('[data-focus-target="stories_tray"]').getAttribute("data-mfga-hide"),
    region: document.querySelector(".fx-stories-region").getAttribute("data-mfga-hide"),
    composer: getComputedStyle(document.querySelector('[aria-label="Create a post"]')).display,
  }));
  assert.equal(r.tray, "stories");
  assert.equal(r.region, null);
  assert.notEqual(r.composer, "none");
  noErrors(page);
  await page.close();
});

test("the skin tags a post whose [aria-posinset] element is itself the inserted node", async () => {
  const page = await open("feed.html");
  await page.evaluate(() => {
    const slot = document.createElement("div");
    slot.id = "late-slot";
    document.getElementById("feed-list").prepend(slot);
  });
  await settle(page);
  await page.evaluate(() => {
    const unit = window.__mfgaNative.cloneSlot("organic-plain", "inserted-unit", 67).querySelector("[aria-posinset]");
    document.getElementById("late-slot").append(unit);
  });
  await settle(page);
  const parts = await page.evaluate(() => [...document.querySelectorAll('[data-fixture="inserted-unit"] [data-mfga-part]')].map((e) => e.getAttribute("data-mfga-part")));
  assert.deepEqual(parts, ["avatar", "name", "byline", "message", "footer", "summary", "actions"]);
  noErrors(page);
  await page.close();
});

test("the skin tags every part of a native post", async () => {
  const page = await open("feed.html");
  const r = await page.evaluate(() => {
    const parts = (f) => [...document.querySelectorAll(`[data-fixture="${f}"] [data-mfga-part]`)].map((e) => e.getAttribute("data-mfga-part"));
    const actions = (f) => [...document.querySelectorAll(`[data-fixture="${f}"] [data-mfga-action]`)].map((e) => `${e.getAttribute("data-mfga-action")}${e.hasAttribute("data-mfga-count") ? "#" : ""}`);
    const reel = document.querySelector('[data-fixture="shared-reel"]');
    return {
      photo: parts("organic-photo"),
      photoActions: actions("organic-photo"),
      countActions: actions("organic-decoy-card"),
      reelName: reel.querySelector('[data-mfga-part="name"] h4') != null && reel.querySelector('[data-mfga-part="name"] h5') == null,
      avatarIsLink: document.querySelector('[data-fixture="organic-photo"] [data-mfga-part="avatar"]').localName,
      bylineText: document.querySelector('[data-fixture="organic-photo"] [data-mfga-part="byline"] svg title').textContent,
    };
  });
  assert.deepEqual(r.photo, ["avatar", "name", "byline", "message", "attachment", "footer", "summary", "actions", "comments", "composer"]);
  assert.deepEqual(r.photoActions, ["like", "comment", "share"]);
  assert.deepEqual(r.countActions, ["like#", "comment#", "share#"], "layout B: counts instead of words");
  assert.equal(r.reelName, true, "the friend's h4, not the reel creator's h5");
  assert.equal(r.avatarIsLink, "a");
  assert.equal(r.bylineText, "Shared with Public");
  noErrors(page);
  await page.close();
});

test("a skinned post looks 2010 (screenshots in test-results/native)", async () => {
  const before = await open("feed.html", { start: false });
  await before.screenshot({ path: `${SHOTS}/feed-before.png`, fullPage: true });
  await before.close();

  const page = await open("feed.html");
  await page.screenshot({ path: `${SHOTS}/feed-after.png`, fullPage: true });
  await page.locator('[data-fixture="organic-photo"]').screenshot({ path: `${SHOTS}/post-2010.png` });
  await page.locator('[data-fixture="organic-decoy-card"]').screenshot({ path: `${SHOTS}/post-2010-counts.png` });
  const s = await page.evaluate(() => {
    const unit = document.querySelector('[data-fixture="organic-photo"]');
    const css = (sel, prop) => getComputedStyle(unit.querySelector(sel))[prop];
    const card = unit.querySelector(".fx-card");
    return {
      avatarW: unit.querySelector('[data-mfga-part="avatar"] svg').getBoundingClientRect().width,
      avatarH: unit.querySelector('[data-mfga-part="avatar"] svg').getBoundingClientRect().height,
      avatarMask: css('[data-mfga-part="avatar"] svg g', "mask"),
      nameColor: css('[data-mfga-part="name"] a', "color"),
      nameWeight: css('[data-mfga-part="name"] a b', "fontWeight"),
      nameSize: css('[data-mfga-part="name"] a span', "fontSize"),
      bylineColor: css('[data-mfga-part="byline"]', "color"),
      bylineSize: css('[data-mfga-part="byline"]', "fontSize"),
      messageSize: css('[data-mfga-part="message"] [dir="auto"][style]', "fontSize"),
      messageColor: css('[data-mfga-part="message"] [dir="auto"][style]', "color"),
      likeColor: css('[data-mfga-action="like"] span span', "color"),
      likeSize: css('[data-mfga-action="like"] span span', "fontSize"),
      likeIcon: css('[data-mfga-action="like"] i', "display"),
      react: css('[aria-label="React"]', "display"),
      separator: getComputedStyle(unit.querySelector('[data-mfga-action="comment"]'), "::before").content,
      commentsBg: css('[data-mfga-part="comments"]', "backgroundColor"),
      bubbleRadius: css('[data-mfga-part="comments"] .fx-bubble', "borderTopLeftRadius"),
      commentAvatar: unit.querySelector('[data-mfga-part="comments"] svg').getBoundingClientRect().width,
      textboxBorder: css('[data-mfga-part="composer"] [role="textbox"]', "borderTopColor"),
      cardRadius: getComputedStyle(card).getPropertyValue("--card-corner-radius").trim(),
      cardShadow: getComputedStyle(card).boxShadow,
      rule: `${getComputedStyle(unit).borderBottomWidth} ${getComputedStyle(unit).borderBottomColor}`,
      messageLeft: unit.querySelector('[data-mfga-part="message"]').getBoundingClientRect().left,
      nameLeft: unit.querySelector('[data-mfga-part="name"]').getBoundingClientRect().left,
    };
  });
  assert.equal(s.avatarW, 50);
  assert.equal(s.avatarH, 50);
  assert.equal(s.avatarMask, "none", "square avatar: the circle mask is gone");
  assert.equal(s.nameColor, "rgb(59, 89, 152)");
  assert.equal(s.nameWeight, "700");
  assert.equal(s.nameSize, "13px");
  assert.equal(s.bylineColor, "rgb(128, 128, 128)");
  assert.equal(s.bylineSize, "11px");
  assert.equal(s.messageSize, "13px");
  assert.equal(s.messageColor, "rgb(51, 51, 51)");
  assert.equal(s.likeColor, "rgb(59, 89, 152)");
  assert.equal(s.likeSize, "11px");
  assert.equal(s.likeIcon, "none");
  assert.equal(s.react, "none");
  assert.equal(s.separator, '"·"');
  assert.equal(s.commentsBg, "rgb(237, 239, 244)");
  assert.equal(s.bubbleRadius, "0px");
  assert.equal(s.commentAvatar, 32);
  assert.equal(s.textboxBorder, "rgb(189, 199, 216)");
  assert.equal(s.cardRadius, "0px");
  assert.equal(s.cardShadow, "none");
  assert.equal(s.rule, "1px rgb(233, 233, 233)");
  assert.ok(Math.abs(s.messageLeft - s.nameLeft) <= 4, `message (${s.messageLeft}) lines up with the name (${s.nameLeft})`);
  noErrors(page);
  await page.close();
});

test("the theme overrides the root light and dark modes, not nested dark islands", async () => {
  const page = await open("feed.html");
  await page.addStyleTag({ content: DARK_VARS });
  const r = await page.evaluate(() => {
    const root = document.documentElement;
    const island = document.createElement("div");
    island.className = "__fb-dark-mode";
    // Facebook's portals (dialogs, menus) carry their own light class, which re-declares every token.
    const portal = document.createElement("div");
    portal.className = "__fb-light-mode";
    document.body.append(island, portal);
    const tok = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();
    const light = { wash: tok(root, "--web-wash"), link: tok(root, "--blue-link"), radius: tok(root, "--card-corner-radius"), size: tok(root, "--body-font-size"), font: tok(root, "--body-font-family") };
    const layer = { link: tok(portal, "--blue-link"), radius: tok(portal, "--card-corner-radius"), size: tok(portal, "--body-font-size") };
    root.classList.replace("__fb-light-mode", "__fb-dark-mode");
    const dark = {
      wash: tok(root, "--web-wash"), text: tok(root, "--primary-text"), white: tok(root, "--fds-white"), glimmer: tok(root, "--glimmer"),
      island: tok(island, "--web-wash"), islandText: tok(island, "--primary-text"), islandWhite: tok(island, "--fds-white"),
      portal: tok(portal, "--card-background"),
    };
    root.setAttribute("data-mfga-font", "tahoma");
    const tahoma = { root: tok(root, "--body-font-family"), portal: tok(portal, "--body-font-family") };
    root.removeAttribute("data-mfga-theme");
    const off = { root: tok(root, "--web-wash"), portal: tok(portal, "--blue-link") };
    return { light, layer, dark, tahoma, off };
  });
  assert.deepEqual(r.light, { wash: "#FFFFFF", link: "#3B5998", radius: "0px", size: "0.8125rem", font: '"lucida grande", tahoma, verdana, arial, sans-serif' });
  assert.deepEqual(r.layer, { link: "#3B5998", radius: "0px", size: "0.8125rem" }, "Facebook's light layers get the 2010 tokens too");
  assert.equal(r.dark.wash, "#FFFFFF", "2010 had no dark mode: the dark root renders 2010 light");
  assert.equal(r.dark.text, "#333333");
  assert.equal(r.dark.white, "#FFFFFF", "palette tokens the dark theme blacks out are light again");
  assert.equal(r.dark.glimmer, "#383B3D");
  assert.equal(r.dark.island, "#1F1F20", "a nested dark island keeps Facebook's own tokens");
  assert.equal(r.dark.islandText, "#F3F4F5");
  assert.equal(r.dark.islandWhite, "black");
  assert.equal(r.dark.portal, "#FFFFFF");
  assert.ok(r.tahoma.root.startsWith("tahoma"));
  assert.ok(r.tahoma.portal.startsWith("tahoma"));
  assert.equal(r.off.root, "#1F1F20", "without data-mfga-theme Facebook's dark token is back");
  assert.notEqual(r.off.portal, "#3B5998");
  noErrors(page);
  await page.close();
});

test("Polish page: verdicts, locale probe and 2010 Polish action labels", async () => {
  const page = await open("feed-pl.html", { lang: "pl" });
  assertVerdicts(await verdicts(page));
  const stats = await page.evaluate(() => window.__cleaner.stats());
  assert.equal(stats.probe.pl.detected, "pl");
  assert.deepEqual(stats.probe.pl.mismatches, {});
  assert.equal(stats.reasons.stories, 1, "Relacje tray");
  const like = await page.evaluate(() => {
    const b = document.querySelector('[data-fixture="organic-pl"] [data-mfga-action="like"]');
    return b.textContent;
  });
  assert.equal(like, "Lubię to!");
  const shared = await page.evaluate(() => {
    const att = document.querySelector('[data-fixture="shared-pl-addfriend"] [data-mfga-part="attachment"]');
    return {
      mask: getComputedStyle(att.querySelector("svg g[mask]")).mask,
      name: getComputedStyle(att.querySelector('[data-ad-rendering-role="profile_name"] a span')).color,
    };
  });
  assert.deepEqual(shared, { mask: "none", name: "rgb(59, 89, 152)" }, "a shared post's header looks 2010 too");
  await page.screenshot({ path: `${SHOTS}/feed-pl-after.png`, fullPage: true });
  noErrors(page);
  await page.close();
});

// Real 2026-10-11 posts (test/fixtures/real/, HushFacebookWeb's scrubbed captures): on the live page the message
// and the attachment share one wrapper, and a rich-text message may hold its own h5/h6 headings.
const REAL = ["post-group-photo-2026-10-11.html", "post-richtext-video-2026-10-11.html"];

test("real 2026 posts: kept, message and attachments tagged even when they share a wrapper", async () => {
  const posts = REAL.map((f) => readFileSync(`${ROOT}/test/fixtures/real/${f}`, "utf8"));
  const html = `<!doctype html><html lang="en"><head><style>/*FB_VARS*/</style></head><body><div role="main"><div id="feed-list">${posts.map((p) => `<div class="fx-slot">${p}</div>`).join("")}</div><div style="height:2000px"></div></div></body></html>`;
  const page = await browser.newPage({ html: html.replace("/*FB_VARS*/", LIGHT_VARS), url: "https://www.facebook.com/?real=1" });
  await page.addScriptTag({ content: entry });
  await startModules(page);
  const units = await page.evaluate(() =>
    [...document.querySelectorAll("[aria-posinset]")].map((u) => {
      const tag = (part) => [...u.querySelectorAll(`[data-mfga-part="${part}"]`)];
      const message = tag("message")[0] ?? null;
      const attachments = tag("attachment");
      const inAttachment = (sel) => [...u.querySelectorAll(sel)].filter((el) => !el.closest('[aria-hidden="true"]')).every((el) => attachments.some((a) => a.contains(el)));
      return {
        mark: u.firstElementChild.getAttribute("data-mfga-hide"),
        message: message?.getAttribute("data-ad-rendering-role") ?? null,
        attachments: attachments.length,
        mediaTagged: inAttachment('a[href*="/photo"], video, [data-ad-rendering-role="title"]'),
        messageNotInAttachment: !attachments.some((a) => a.contains(message)),
        indent: message ? getComputedStyle(message).marginInlineStart : null,
        attachmentIndent: attachments[0] ? getComputedStyle(attachments[0]).marginInlineStart : null,
      };
    }),
  );
  assert.equal(units.length, 2);
  for (const [i, u] of units.entries()) {
    assert.equal(u.mark, null, `${REAL[i]}: an organic post is never hidden`);
    assert.equal(u.message, "story_message", `${REAL[i]}: the message is tagged (rich-text h5 headings inside it are not a shared post)`);
    assert.ok(u.attachments >= 1, `${REAL[i]}: the photo/video and link card next to the message are tagged`);
    assert.equal(u.mediaTagged, true, `${REAL[i]}: every photo, video and link card sits in an attachment part`);
    assert.equal(u.messageNotInAttachment, true);
    assert.equal(u.indent, "58px");
    assert.equal(u.attachmentIndent, "74px");
  }
  noErrors(page);
  await page.close();
});
