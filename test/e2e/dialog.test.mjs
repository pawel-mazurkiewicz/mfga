// Browser tests for WP-F: base CSS, the 2010 dialog, the settings dialog and the Health tab.
// Screenshots land in test-results/dialog/ (compare them with assets/reference/2010-home.png).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { bundle, launchBrowser, ROOT } from "./helpers/browser.mjs";
import { DEFAULTS } from "../../src/shared/settings.js";
import { mayExport } from "../../src/ui/dialog/report.js";

const OUT = path.join(ROOT, "test-results", "dialog");
const VIEWPORT = { width: 994, height: 882 }; // the 2010 reference capture

let browser;
let script;

before(async () => {
  await fs.mkdir(OUT, { recursive: true });
  script = await bundle("test/e2e/entries/dialog-harness.js");
  browser = await launchBrowser({ viewport: VIEWPORT });
  browser.servePage("/__ref.png", await fs.readFile(path.join(ROOT, "assets/reference/2010-home.png")), { contentType: "image/png" });
});

after(() => browser?.close());

/** A page with the 2010 home page capture as backdrop and the harness loaded. */
async function openPage({ lang = "en", backdrop = true } = {}) {
  const img = backdrop ? '<img src="/__ref.png" alt="" style="display:block">' : "";
  const page = await browser.newPage({
    html: `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"></head><body style="margin:0;background:#fff">${img}</body></html>`,
  });
  await page.addScriptTag({ content: script });
  if (backdrop) await page.waitForFunction(() => document.images[0]?.complete);
  return page;
}

async function done(page) {
  assert.deepEqual(page.__errors || [], [], "page errors");
  await page.close();
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const SNAPSHOT = {
  counters: {
    "classify.keep": 42,
    "classify.drop.sponsored-data": 7,
    "classify.drop.recommended": 3,
    "gql.requests": 5,
    "gql.halted": 0,
    "cleaner.hide.sponsored": 3,
    "cleaner.hide.reels": 1,
    "harvest.preloaders": 2,
    uptime: 1,
  },
  errors: { stream: { n: 2, first: "Cannot read properties of undefined (reading 'edges')" } },
  disabled: ["stream"],
  facts: { route: "home", feed: "ours", tokensFound: ["dtsg", "lsd"] },
  merge: { sources: 4, buffered: 12 },
};

const REPORT = {
  version: "1.0.0",
  platform: "chrome",
  counters: SNAPSHOT.counters,
  errors: { stream: { n: 2, first: "Failed https://www.facebook.com/profile.php?id=100012345678 for 'Jan Kowalski'" } },
  facts: {
    route: "home",
    userId: "100012345678",
    me: { name: "Jan Kowalski", url: "https://www.facebook.com/jan.kowalski" },
    tokensFound: ["dtsg", "lsd"],
    lsd: "AVqZ1h2bXyE",
  },
  sample: { __typename: "Story", text: "Happy birthday Jan!", feedback: { reactions: 12 }, actors: [{ id: "4", name: "Mark" }] },
  keywords: ["politics"],
  feedEndCursor: "AQHRabcdefghijkl",
};

/** Every [path, value] leaf of a JSON value. */
function leaves(v, p = []) {
  if (v === null || typeof v !== "object") return [[p, v]];
  return Object.entries(v).flatMap(([k, x]) => leaves(x, [...p, k]));
}

const valueAt = (obj, dotted) => dotted.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

const tab = (page, name) => page.locator(`[role=tab][aria-controls="${name}"]`);

async function selectTab(page, name) {
  const panelId = await page.getAttribute(`[data-mfga-tab="${name}"]`, "id");
  await tab(page, panelId).click();
  return page.locator(`[data-mfga-tab="${name}"]`);
}

const lastUpdate = (page) => page.evaluate(() => mfgaTest.updates.at(-1));
const updateCount = (page) => page.evaluate(() => mfgaTest.updates.length);

// ---------------------------------------------------------------------------------------------------------

test("base classes render the 2010 components", async () => {
  const page = await openPage({ backdrop: false });
  await page.evaluate(() => mfgaTest.gallery());
  const css = await page.evaluate(() => {
    const cs = (sel) => getComputedStyle(document.querySelector(sel));
    const box = (sel) => document.querySelector(sel).getBoundingClientRect();
    return {
      font: cs("#gallery").fontFamily,
      size: cs("#gallery").fontSize,
      color: cs("#gallery").color,
      link: cs("#g-link").color,
      linkDecoration: cs("#g-link").textDecorationLine,
      muted: cs("#g-muted").color,
      sep: getComputedStyle(document.querySelector("p .mfga-sep:empty"), "::before").content,
      btn: { border: cs("#g-btn").borderTopColor, bottom: cs("#g-btn").borderBottomColor, color: cs("#g-btn").color, weight: cs("#g-btn").fontWeight, image: cs("#g-btn").backgroundImage, shadow: cs("#g-btn").boxShadow, height: box("#g-confirm").height },
      confirm: { bg: cs("#g-confirm").backgroundColor, border: cs("#g-confirm").borderTopColor, bottom: cs("#g-confirm").borderBottomColor, color: cs("#g-confirm").color, shadow: cs("#g-confirm").boxShadow },
      small: box("#g-small").height,
      disabled: { bg: cs("#g-disabled").backgroundColor, color: cs("#g-disabled").color },
      input: { border: cs("#g-input").borderTopColor, padding: cs("#g-input").paddingTop, size: cs("#g-input").fontSize, sizing: cs("#g-input").boxSizing },
      textarea: cs("#g-textarea").borderTopColor,
      pill: { bg: cs("#g-pill").backgroundColor, color: cs("#g-pill").color, radius: cs("#g-pill").borderTopLeftRadius, height: box("#g-pill").height },
      badge: { bg: cs(".mfga-badge").backgroundColor, size: cs(".mfga-badge").fontSize, height: box(".mfga-badge").height },
      boxTitle: { rule: cs("#g-box .mfga-box-title").borderBottomColor, weight: cs("#g-box .mfga-box-title").fontWeight, seeAll: cs("#g-box .mfga-see-all").fontWeight },
      spinner: { w: box("#g-spinner").width, h: box("#g-spinner").height, animation: cs("#g-spinner").animationName },
      notice: { bg: cs("#g-notice").backgroundColor, border: cs("#g-notice").borderTopColor },
      error: { bg: cs("#g-error").backgroundColor, border: cs("#g-error").borderTopColor },
      menu: { border: cs("#g-menu").borderTopColor, bottom: cs("#g-menu").borderBottomColor },
      tooltip: cs("#g-tooltip").backgroundColor,
    };
  });
  assert.match(css.font, /^"lucida grande", tahoma, verdana, arial, sans-serif$/);
  assert.equal(css.size, "11px");
  assert.equal(css.color, "rgb(51, 51, 51)");
  assert.equal(css.link, "rgb(59, 89, 152)");
  assert.equal(css.linkDecoration, "none");
  assert.equal(css.muted, "rgb(128, 128, 128)");
  assert.equal(css.sep, '" · "');
  assert.deepEqual(
    { border: css.btn.border, bottom: css.btn.bottom, color: css.btn.color, weight: css.btn.weight },
    { border: "rgb(170, 170, 170)", bottom: "rgb(153, 153, 153)", color: "rgb(51, 51, 51)", weight: "700" },
  );
  assert.match(css.btn.image, /linear-gradient\(rgb\(245, 245, 245\), rgb\(227, 227, 227\)\)/);
  assert.match(css.btn.shadow, /rgba\(0, 0, 0, 0\.1\) 0px 1px 0px/);
  assert.equal(css.btn.height, 22);
  assert.deepEqual(css.confirm, {
    bg: "rgb(91, 116, 168)",
    border: "rgb(41, 68, 126)",
    bottom: "rgb(26, 53, 110)",
    color: "rgb(255, 255, 255)",
    shadow: "rgb(138, 156, 194) 0px 1px 0px 0px inset, rgba(0, 0, 0, 0.1) 0px 1px 0px 0px",
  });
  assert.ok(css.small < css.btn.height);
  assert.deepEqual(css.disabled, { bg: "rgb(242, 242, 242)", color: "rgb(184, 184, 184)" });
  assert.deepEqual(css.input, { border: "rgb(189, 199, 216)", padding: "3px", size: "11px", sizing: "border-box" });
  assert.equal(css.textarea, "rgb(189, 199, 216)");
  assert.deepEqual(css.pill, { bg: "rgb(109, 132, 180)", color: "rgb(255, 255, 255)", radius: "7px", height: 14 });
  assert.deepEqual(css.badge, { bg: "rgb(240, 61, 37)", size: "9px", height: 13 });
  assert.deepEqual(css.boxTitle, { rule: "rgb(233, 233, 233)", weight: "700", seeAll: "400" });
  assert.deepEqual(css.spinner, { w: 16, h: 11, animation: "mfga-spinner" });
  assert.deepEqual(css.notice, { bg: "rgb(255, 249, 215)", border: "rgb(226, 200, 34)" });
  assert.deepEqual(css.error, { bg: "rgb(255, 235, 232)", border: "rgb(221, 60, 16)" });
  assert.deepEqual(css.menu, { border: "rgb(119, 119, 119)", bottom: "rgb(41, 62, 106)" });
  assert.equal(css.tooltip, "rgb(40, 40, 40)");

  // :active states
  for (const [sel, bg] of [["#g-btn", "rgb(221, 221, 221)"], ["#g-confirm", "rgb(79, 106, 163)"]]) {
    await page.hover(sel);
    await page.mouse.down();
    assert.equal(await page.evaluate((s) => getComputedStyle(document.querySelector(s)).backgroundColor, sel), bg, sel);
    await page.mouse.up();
  }
  await page.hover("#g-menu-hover");
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#g-menu-hover")).backgroundColor), "rgb(109, 132, 180)");
  await page.locator("#gallery").screenshot({ path: path.join(OUT, "base-gallery.png") });

  // Tahoma first when the user picks it.
  await page.evaluate(() => (document.documentElement.dataset.mfgaFont = "tahoma"));
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#g-btn")).fontFamily), 'tahoma, "lucida grande", verdana, arial, sans-serif');
  await done(page);
});

test("openDialog: 2010 frame, accessible, focus trap, Esc and focus return", async () => {
  const page = await openPage();
  await page.evaluate(() => {
    const b = document.createElement("button");
    b.id = "opener";
    b.textContent = "Open";
    document.body.prepend(b);
    b.focus();
    window.pageKeys = 0;
    document.addEventListener("keydown", () => window.pageKeys++);
  });
  await page.evaluate(() => mfgaTest.openGeneric());
  const info = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const r = d.getBoundingClientRect();
    const title = document.getElementById(d.getAttribute("aria-labelledby"));
    const layer = d.parentElement;
    const cs = (el) => getComputedStyle(el);
    return {
      modal: d.getAttribute("aria-modal"),
      title: title?.textContent,
      titleTag: title?.tagName,
      top: r.top,
      left: r.left,
      width: r.width,
      vw: document.documentElement.clientWidth,
      active: document.activeElement.id,
      frame: { bg: cs(d).backgroundColor, radius: cs(d).borderTopLeftRadius, padding: cs(d).paddingTop },
      titleBar: { bg: cs(title).backgroundColor, border: cs(title).borderTopColor, color: cs(title).color, size: cs(title).fontSize, weight: cs(title).fontWeight },
      footer: cs(d.querySelector(".mfga-dialog-footer")).backgroundColor,
      overlay: { position: cs(layer).position, bg: cs(layer).backgroundColor, ui: layer.classList.contains("mfga-ui") },
      buttons: [...d.querySelectorAll(".mfga-dialog-footer button")].map((b) => [b.textContent, b.className]),
    };
  });
  assert.equal(info.modal, "true");
  assert.equal(info.title, "Confirm Request");
  assert.equal(info.titleTag, "H2");
  assert.equal(info.top, 125);
  assert.equal(info.width, 465);
  assert.ok(Math.abs(info.left - (info.vw - info.width) / 2) <= 1, "centred");
  assert.equal(info.active, "generic-input", "first field gets focus");
  assert.deepEqual(info.frame, { bg: "rgba(82, 82, 82, 0.7)", radius: "8px", padding: "10px" });
  assert.deepEqual(info.titleBar, { bg: "rgb(109, 132, 180)", border: "rgb(59, 89, 152)", color: "rgb(255, 255, 255)", size: "14px", weight: "700" });
  assert.equal(info.footer, "rgb(242, 242, 242)");
  assert.equal(info.overlay.position, "fixed");
  assert.match(info.overlay.bg, /^rgba\(252, 252, 252, 0\.\d+\)$/);
  assert.ok(info.overlay.ui);
  assert.deepEqual(info.buttons, [
    ["Stay Open", "mfga-btn mfga-btn-confirm"],
    ["Later", "mfga-btn"],
    ["Cancel", "mfga-btn"],
  ]);
  await shot(page, "dialog-generic");

  // Tab cycles inside the dialog, both ways.
  const focused = () => page.evaluate(() => document.activeElement.id || document.activeElement.textContent);
  await page.keyboard.press("Tab");
  assert.equal(await focused(), "Stay Open");
  await page.keyboard.press("Tab");
  assert.equal(await focused(), "Later");
  await page.keyboard.press("Tab");
  assert.equal(await focused(), "Cancel");
  await page.keyboard.press("Tab");
  assert.equal(await focused(), "generic-input");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await focused(), "Cancel");

  // Typing in the dialog does not reach Facebook's document-level shortcut handlers.
  await page.focus("#generic-input");
  await page.keyboard.type("jk");
  assert.equal(await page.evaluate(() => window.pageKeys), 0);

  // onClick returning false keeps the dialog open.
  await page.click("text=Stay Open");
  assert.deepEqual(await page.evaluate(() => mfgaTest.clicks), ["stay"]);
  assert.equal(await page.locator('[role="dialog"]').count(), 1);

  // Esc closes and focus returns to the opener.
  await page.keyboard.press("Escape");
  assert.equal(await page.locator('[role="dialog"]').count(), 0);
  assert.equal(await page.evaluate(() => mfgaTest.closes), 1);
  assert.equal(await page.evaluate(() => document.activeElement.id), "opener");

  // A plain button closes; an async one closes once its promise settles; so does a click on the overlay,
  // but not a click inside the dialog.
  await page.evaluate(() => mfgaTest.openGeneric());
  await page.click("text=Cancel");
  assert.equal(await page.locator('[role="dialog"]').count(), 0);
  await page.evaluate(() => mfgaTest.openGeneric());
  await page.click("text=Later");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.deepEqual(await page.evaluate(() => mfgaTest.clicks), ["later"]);
  await page.evaluate(() => mfgaTest.openGeneric());
  await page.click(".mfga-dialog-body p");
  assert.equal(await page.locator('[role="dialog"]').count(), 1);
  await page.mouse.click(10, 10);
  assert.equal(await page.locator('[role="dialog"]').count(), 0);
  assert.equal(await page.evaluate(() => document.querySelectorAll("[data-mfga-dialog]").length), 0, "layer removed");

  // close() from the handle is idempotent.
  await page.evaluate(() => mfgaTest.openGeneric());
  await page.evaluate(() => (mfgaTest.handle.close(), mfgaTest.handle.close()));
  assert.equal(await page.evaluate(() => mfgaTest.closes), 1);
  await done(page);
});

test("openDialog without buttons gets a Close button; nested dialogs close one at a time", async () => {
  const page = await openPage({ backdrop: false });
  await page.evaluate(() => mfgaTest.openGeneric({ plain: true }));
  assert.deepEqual(await page.locator(".mfga-dialog-footer button").allTextContents(), ["Close"]);
  assert.equal(await page.evaluate(() => document.activeElement.textContent), "Close");
  await page.keyboard.press("Enter");
  assert.equal(await page.locator('[role="dialog"]').count(), 0);

  await page.evaluate(() => mfgaTest.setup());
  await page.evaluate(() => mfgaTest.openSettings());
  const panel = await selectTab(page, "health");
  await panel.locator("text=Reset settings").click();
  assert.equal(await page.locator('[role="dialog"]').count(), 2);
  const confirm = page.locator('[role="dialog"]').nth(1);
  assert.equal(await confirm.locator("h2").textContent(), "Reset Settings");
  assert.equal(await page.evaluate(() => document.activeElement.textContent), "Cancel", "the safe button gets focus");
  await shot(page, "dialog-confirm");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator('[role="dialog"]').count(), 1, "Esc closes only the top dialog");
  assert.equal(await page.evaluate(() => document.activeElement.textContent), "Reset settings", "focus back on the opener");
  assert.equal(await page.evaluate(() => mfgaTest.resets), 0);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator('[role="dialog"]').count(), 0);
  await done(page);
});

test("settings: every control writes its patch through settings.update", async () => {
  const page = await openPage();
  await page.evaluate(() => mfgaTest.setup());
  await page.evaluate(() => mfgaTest.openSettings());
  const seen = new Set();

  for (const name of ["feed", "clean", "look", "health"]) {
    const panel = await selectTab(page, name);
    const controls = panel.locator("[data-mfga-setting]");
    const n = await controls.count();
    for (let i = 0; i < n; i++) {
      const c = controls.nth(i);
      const { setting, type, tag, checked, value } = await c.evaluate((el) => ({
        setting: el.dataset.mfgaSetting,
        type: el.type,
        tag: el.tagName,
        checked: el.checked,
        value: el.value,
      }));
      if (setting === "language") continue; // re-renders the dialog: covered by its own test
      seen.add(setting);
      assert.equal(await c.isEnabled(), true, `${setting} enabled with default settings`);
      const before = await updateCount(page);
      if (type === "checkbox") {
        await c.click();
        let patch = await lastUpdate(page);
        assert.equal(valueAt(patch, setting), !checked, setting);
        await c.click(); // restore
        patch = await lastUpdate(page);
        assert.equal(valueAt(patch, setting), checked, `${setting} restored`);
        if (setting === "look.welcome") assert.deepEqual(patch, { look: { welcome: true }, state: { welcomeDismissed: false } });
      } else if (type === "radio") {
        if (checked) continue; // a radio is exercised by clicking its unchecked siblings
        const current = await page.evaluate((s) => mfgaTest.settings()[s.split(".")[0]][s.split(".")[1]], setting);
        await c.click();
        const patch = await lastUpdate(page);
        assert.equal(String(valueAt(patch, setting)), value, setting);
        assert.equal(typeof valueAt(patch, setting), typeof current, `${setting} keeps its type`);
        await panel.locator(`[data-mfga-setting="${setting}"][value="${String(current)}"]`).click();
        assert.equal(valueAt(await lastUpdate(page), setting), current, `${setting} restored`);
      } else if (tag === "SELECT") {
        await c.selectOption("20");
        assert.equal(valueAt(await lastUpdate(page), setting), 20, setting);
        await c.selectOption(value);
        assert.equal(valueAt(await lastUpdate(page), setting), Number(value));
      } else if (tag === "TEXTAREA") {
        await c.fill("Politics\n\n crypto bros \nPOLITICS");
        await c.blur();
        await page.waitForFunction(() => mfgaTest.updates.length > 0 && mfgaTest.updates.at(-1).feed?.keywords);
        assert.deepEqual(valueAt(await lastUpdate(page), setting), ["Politics", "crypto bros"]);
        assert.equal(await c.inputValue(), "Politics\ncrypto bros", "normalised after saving");
      } else {
        assert.fail(`unexpected control ${setting} ${tag}/${type}`);
      }
      assert.ok((await updateCount(page)) > before, `${setting} wrote a patch`);
    }
  }
  seen.add("language");

  // Every setting the user may change has a control (version/enabled/state are internal).
  const expected = [];
  const walk = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) walk(v, p);
      else expected.push(p);
    }
  };
  walk(DEFAULTS, "");
  const internal = new Set(["version", "enabled", "state.welcomeDismissed"]);
  assert.deepEqual([...seen].sort(), expected.filter((p) => !internal.has(p)).sort());
  await done(page);
});

test("settings: keyword list saves after a pause in typing and on close", async () => {
  const page = await openPage({ backdrop: false });
  await page.evaluate(() => mfgaTest.setup({ initial: { feed: { keywords: ["one"] } } }));
  await page.evaluate(() => mfgaTest.openSettings());
  await selectTab(page, "feed");
  const ta = page.locator('[data-mfga-setting="feed.keywords"]');
  assert.equal(await ta.inputValue(), "one");
  await ta.focus();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\ntwo");
  await page.waitForFunction(() => mfgaTest.settings().feed.keywords.length === 2, null, { timeout: 3000 });
  assert.deepEqual(await page.evaluate(() => mfgaTest.settings().feed.keywords), ["one", "two"]);
  assert.equal(await ta.inputValue(), "one\ntwo", "focused textarea is not rewritten under the cursor");
  await page.keyboard.type("\n\n  TWO  ");
  await ta.blur();
  assert.equal(await ta.inputValue(), "one\ntwo", "tidied on blur");
  await ta.focus();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\nthree");
  await page.keyboard.press("Escape"); // closing flushes the pending edit
  await page.waitForFunction(() => mfgaTest.settings().feed.keywords.length === 3);
  await done(page);
});

test("settings: the last News Feed source cannot be turned off; Top News disables sources", async () => {
  const page = await openPage({ backdrop: false });
  await page.evaluate(() => mfgaTest.setup());
  await page.evaluate(() => mfgaTest.openSettings());
  const panel = await selectTab(page, "feed");
  for (const s of ["groups", "pages", "favorites"]) await panel.locator(`[data-mfga-setting="feed.sources.${s}"]`).click();
  const before = await updateCount(page);
  const friends = panel.locator('[data-mfga-setting="feed.sources.friends"]');
  await friends.click();
  assert.equal(await friends.isChecked(), true);
  assert.equal(await updateCount(page), before, "no patch for a refused change");
  assert.equal(await page.evaluate(() => mfgaTest.settings().feed.sources.friends), true);
  const alert = panel.locator('[role="alert"]');
  assert.equal(await alert.isVisible(), true);
  assert.equal(await alert.textContent(), "Keep at least one of them.");
  await panel.locator('[data-mfga-setting="feed.sources.pages"]').click();
  assert.equal(await alert.isVisible(), false, "message clears on the next change");

  await panel.locator('[data-mfga-setting="feed.mode"][value="top"]').click();
  assert.deepEqual(await lastUpdate(page), { feed: { mode: "top" } });
  for (const s of ["friends", "groups", "pages", "favorites"]) {
    assert.equal(await panel.locator(`[data-mfga-setting="feed.sources.${s}"]`).isDisabled(), true, s);
  }
  await panel.locator('[data-mfga-setting="feed.mode"][value="recent"]').click();
  assert.equal(await friends.isDisabled(), false);
  await done(page);
});

test("settings: turning the 2010 layout off greys out the parts that need it", async () => {
  const page = await openPage({ backdrop: false });
  await page.evaluate(() => mfgaTest.setup());
  await page.evaluate(() => mfgaTest.openSettings());
  const panel = await selectTab(page, "look");
  await panel.locator('[data-mfga-setting="look.shell"]').click();
  assert.deepEqual(await lastUpdate(page), { look: { shell: false } });
  for (const k of ["fixedHeader", "rightColumn", "chat", "welcome"]) {
    assert.equal(await panel.locator(`[data-mfga-setting="look.${k}"]`).isDisabled(), true, k);
  }
  for (const k of ["theme", "skinPosts"]) assert.equal(await panel.locator(`[data-mfga-setting="look.${k}"]`).isDisabled(), false, k);
  await panel.locator('[data-mfga-setting="look.font"][value="tahoma"]').click();
  assert.deepEqual(await lastUpdate(page), { look: { font: "tahoma" } });
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".mfga-dialog")).fontFamily.split(",")[0]), "tahoma");
  await done(page);
});

test("settings: tabs, keyboard navigation, Tab trap and Esc", async () => {
  const page = await openPage({ backdrop: false });
  await page.evaluate(() => {
    const b = document.createElement("a");
    b.id = "opener";
    b.href = "#settings";
    b.textContent = "MFGA Settings";
    document.body.prepend(b);
    b.focus();
  });
  await page.evaluate(() => mfgaTest.setup());
  await page.evaluate(() => mfgaTest.openSettings());
  const sameHandle = await page.evaluate(() => {
    const first = mfgaTest.handle;
    mfgaTest.openSettings();
    return first === mfgaTest.handle;
  });
  assert.equal(sameHandle, true, "opening twice returns the open dialog");
  assert.equal(await page.locator('[role="dialog"]').count(), 1);
  const state = () =>
    page.evaluate(() => ({
      focused: document.activeElement.getAttribute("role") === "tab" ? document.activeElement.textContent : document.activeElement.tagName,
      selected: [...document.querySelectorAll('[role="tab"][aria-selected="true"]')].map((t) => t.textContent),
      visible: [...document.querySelectorAll('[role="tabpanel"]')].filter((p) => !p.hidden).map((p) => p.dataset.mfgaTab),
      tabbable: [...document.querySelectorAll('[role="tab"]')].filter((t) => t.tabIndex === 0).length,
    }));
  assert.deepEqual(await state(), { focused: "News Feed", selected: ["News Feed"], visible: ["feed"], tabbable: 1 });
  await page.keyboard.press("ArrowRight");
  assert.deepEqual(await state(), { focused: "Clean-up", selected: ["Clean-up"], visible: ["clean"], tabbable: 1 });
  await page.keyboard.press("End");
  assert.deepEqual(await state(), { focused: "About", selected: ["About"], visible: ["about"], tabbable: 1 });
  await page.keyboard.press("ArrowRight");
  assert.equal((await state()).focused, "News Feed", "wraps around");
  await page.keyboard.press("ArrowLeft");
  assert.equal((await state()).focused, "About");
  await page.keyboard.press("Home");
  assert.equal((await state()).focused, "News Feed");

  // Tab never leaves the dialog.
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => !!document.activeElement.closest(".mfga-dialog")), true, `tab ${i}`);
  }
  await page.focus('[role="tab"][aria-selected="true"]');
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement.textContent), "Close", "Shift+Tab from the first stop goes to the last");

  // The dialog reopens on the tab it was closed on.
  await page.focus('[role="tab"][aria-selected="true"]');
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator('[role="dialog"]').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement.id), "opener");
  await page.evaluate(() => mfgaTest.openSettings());
  assert.deepEqual((await state()).visible, ["about"]);
  await page.click("text=Close");
  assert.equal(await page.locator('[role="dialog"]').count(), 0);
  await done(page);
});

test("settings: follows changes made elsewhere, stops listening once closed", async () => {
  const page = await openPage({ backdrop: false });
  await page.evaluate(() => mfgaTest.setup());
  await page.evaluate(() => mfgaTest.openSettings());
  const panel = await selectTab(page, "clean");
  const reels = panel.locator('[data-mfga-setting="clean.reels"]');
  assert.equal(await reels.isChecked(), true);
  await page.evaluate(() => mfgaTest.externalChange({ ...mfgaTest.settings(), clean: { ...mfgaTest.settings().clean, reels: false } }));
  assert.equal(await reels.isChecked(), false);
  assert.equal(await page.evaluate(() => mfgaTest.updates.length), 0, "syncing does not write back");
  await page.keyboard.press("Escape");
  await page.evaluate(() => mfgaTest.externalChange({ ...mfgaTest.settings(), clean: { ...mfgaTest.settings().clean, reels: true } }));
  assert.equal(await page.locator('[role="dialog"]').count(), 0);
  await done(page);
});

test("settings: choosing Polski re-renders the dialog in Polish and keeps the focus", async () => {
  const page = await openPage();
  await page.evaluate(() => mfgaTest.setup());
  await page.evaluate(() => mfgaTest.openSettings());
  const panel = await selectTab(page, "look");
  await panel.locator('[data-mfga-setting="language"]').selectOption("pl");
  assert.deepEqual(await lastUpdate(page), { language: "pl" });
  assert.equal(await page.locator('[role="dialog"]').count(), 1);
  assert.equal(await page.locator(".mfga-dialog-title").textContent(), "Ustawienia MFGA");
  assert.deepEqual(await page.locator('[role="tab"]').allTextContents(), ["Aktualności", "Porządki", "Wygląd", "Diagnostyka", "Informacje"]);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.mfgaSetting), "language");
  assert.equal(await page.locator('[data-mfga-setting="language"]').inputValue(), "pl");
  await page.mouse.move(0, 0);
  await shot(page, "settings-look-pl");
  await selectTab(page, "feed");
  await page.mouse.move(0, 0);
  await shot(page, "settings-feed-pl");
  await selectTab(page, "about");
  await page.mouse.move(0, 0);
  await shot(page, "settings-about-pl");
  await selectTab(page, "look");
  await page.locator('[data-mfga-setting="language"]').selectOption("auto");
  assert.equal(await page.locator(".mfga-dialog-title").textContent(), "MFGA Settings", "auto follows <html lang=en>");
  await done(page);
});

test("settings: Health renders the snapshot and exports an anonymised JSON report", async () => {
  const page = await openPage();
  await page.evaluate(({ snapshot, report }) => mfgaTest.setup({ snapshot, report }), { snapshot: SNAPSHOT, report: REPORT });
  await page.evaluate(() => mfgaTest.openSettings());
  const panel = await selectTab(page, "health");
  await panel.locator(".mfga-health-areas").waitFor();
  assert.equal(await panel.locator(".mfga-error").textContent(), "Stopped after an error: stream. Reload the page to start them again.");
  assert.deepEqual(await panel.locator(".mfga-health-errors tbody tr").first().locator("td").allTextContents(), [
    "stream",
    "2",
    "Cannot read properties of undefined (reading 'edges')",
  ]);
  assert.deepEqual(await panel.locator(".mfga-health-areas .mfga-box-title").allTextContents(), ["classify52", "cleaner4", "general1", "gql5", "harvest2"]);
  const text = await panel.textContent();
  for (const s of ["drop.sponsored-data", "tokensFound", "dtsg, lsd", "merge.sources", "Write diagnostic messages"]) assert.ok(text.includes(s), s);
  await page.mouse.move(0, 0);
  await shot(page, "settings-health");

  // Refresh re-reads the snapshot.
  await page.evaluate(() => (mfgaTest.snapshot = { counters: {}, errors: {}, facts: {}, disabled: [] }));
  await panel.locator("text=Refresh").click();
  await panel.locator(".mfga-notice").waitFor();
  assert.equal(await panel.locator(".mfga-notice").textContent(), "All parts of MFGA are running.");
  assert.equal(await panel.locator(".mfga-health-details").textContent(), "Nothing recorded yet.");

  const [download] = await Promise.all([page.waitForEvent("download"), panel.locator("text=Export report").click()]);
  assert.match(download.suggestedFilename(), /^mfga-report-\d{4}-\d{2}-\d{2}\.json$/);
  const raw = await fs.readFile(await download.path(), "utf8");
  await fs.writeFile(path.join(OUT, "report-sample.json"), raw);
  const report = JSON.parse(raw);
  assert.equal(report.version, "1.0.0");
  assert.deepEqual(report.counters, SNAPSHOT.counters);
  assert.deepEqual(report.facts.tokensFound, ["dtsg", "lsd"]);
  assert.equal(report.sample.feedback.reactions, 12);
  assert.doesNotMatch(raw, /facebook\.com|Kowalski|Mark|100012345678|AVqZ1h2bXyE|AQHRabc|politics|birthday/);
  for (const [p, v] of leaves(report)) {
    const key = p.filter((k) => Number.isNaN(Number(k))).at(-1);
    if (key) assert.ok(mayExport(key, v), `forbidden key in report: ${p.join(".")}`);
  }
  const status = panel.locator(".mfga-health-exported");
  assert.match(await status.textContent(), /^Saved mfga-report-.*\.json\. It holds only counts/);
  assert.equal(await status.locator("a").last().getAttribute("href"), "https://github.com/pawel-mazurkiewicz/mfga/issues");
  await done(page);
});

test("settings: a failing exportReport shows an error instead of a file", async () => {
  const page = await openPage({ backdrop: false });
  await page.evaluate(() => mfgaTest.setup());
  await page.evaluate(() => (mfgaTest.reportError = "registry unavailable"));
  await page.evaluate(() => mfgaTest.openSettings());
  const panel = await selectTab(page, "health");
  let downloads = 0;
  page.on("download", () => downloads++);
  await panel.locator("text=Export report").click();
  await panel.locator(".mfga-health-exported .mfga-error").waitFor();
  assert.equal(await panel.locator(".mfga-health-exported").textContent(), "The report could not be created.");
  assert.equal(downloads, 0);
  await done(page);
});

test("settings: Reset settings asks first, then restores the defaults", async () => {
  const page = await openPage({ backdrop: false });
  await page.evaluate(() => mfgaTest.setup({ initial: { clean: { reels: false }, feed: { keywords: ["x"] } } }));
  await page.evaluate(() => mfgaTest.openSettings());
  const panel = await selectTab(page, "health");
  await panel.locator("text=Reset settings").click();
  await page.locator('[role="dialog"]').nth(1).getByRole("button", { name: "Reset", exact: true }).click();
  await page.waitForFunction(() => mfgaTest.resets === 1);
  assert.equal(await page.locator('[role="dialog"]').count(), 1, "confirmation closed, settings still open");
  assert.equal(await page.evaluate(() => mfgaTest.settings().clean.reels), true);
  const clean = await selectTab(page, "clean");
  assert.equal(await clean.locator('[data-mfga-setting="clean.reels"]').isChecked(), true, "controls follow the reset");
  const feed = await selectTab(page, "feed");
  assert.equal(await feed.locator('[data-mfga-setting="feed.keywords"]').inputValue(), "");
  await done(page);
});

test("dialog keeps its 2010 look on a dark-mode page with global element styles", async () => {
  const page = await openPage({ backdrop: false });
  await page.evaluate(() => {
    document.documentElement.className = "__fb-dark-mode";
    const style = document.createElement("style");
    style.textContent = `:root{color-scheme:dark}
      body{background:#18191A;color:#E4E6EB;font:15px/1.34 "Segoe UI",sans-serif}
      a{color:#E4E6EB;text-decoration:underline}
      h2,h3,h4{font-size:24px;margin:20px;color:#E4E6EB}
      button,input,select,textarea{font-size:17px;border-radius:6px;color:#E4E6EB;background:#3A3B3C}
      ul{list-style:disc;padding-left:40px}`;
    document.head.prepend(style);
  });
  await page.evaluate(() => mfgaTest.setup());
  await page.evaluate(() => mfgaTest.openSettings());
  await selectTab(page, "about");
  const css = await page.evaluate(() => {
    const cs = (sel) => getComputedStyle(document.querySelector(sel));
    return {
      title: [cs(".mfga-dialog-title").fontSize, cs(".mfga-dialog-title").marginTop, cs(".mfga-dialog-title").color],
      tab: [cs(".mfga-settings-tab").fontSize, cs(".mfga-settings-tab").borderTopLeftRadius],
      close: [cs(".mfga-dialog-footer .mfga-btn").fontSize, cs(".mfga-dialog-footer .mfga-btn").color],
      link: [cs(".mfga-about-list a").color, cs(".mfga-about-list a").textDecorationLine],
      list: [cs(".mfga-about-list").listStyleType, cs(".mfga-about-list").paddingLeft],
      body: [cs(".mfga-dialog-body").color, cs(".mfga-dialog-body").fontSize],
      scheme: cs(".mfga-dialog-layer").colorScheme,
    };
  });
  assert.deepEqual(css, {
    title: ["14px", "0px", "rgb(255, 255, 255)"],
    tab: ["11px", "0px"],
    close: ["11px", "rgb(51, 51, 51)"],
    link: ["rgb(59, 89, 152)", "none"],
    list: ["none", "0px"],
    body: ["rgb(51, 51, 51)", "11px"],
    scheme: "light",
  });
  await selectTab(page, "feed");
  const select = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('[data-mfga-setting="feed.pageSize"]'));
    return [cs.fontSize, cs.borderTopLeftRadius, cs.color, cs.backgroundColor];
  });
  assert.deepEqual(select, ["11px", "0px", "rgb(51, 51, 51)", "rgb(255, 255, 255)"]);
  await page.mouse.move(0, 0);
  await shot(page, "settings-feed-darkpage");
  await done(page);
});

test("settings: screenshots of every tab over the 2010 home page", async () => {
  const page = await openPage();
  await page.evaluate(({ snapshot }) => mfgaTest.setup({ snapshot, initial: { feed: { keywords: ["politics", "crypto"] } } }), { snapshot: SNAPSHOT });
  await page.evaluate(() => mfgaTest.openSettings());
  for (const name of ["feed", "clean", "look", "health", "about"]) {
    await selectTab(page, name);
    await page.mouse.move(0, 0);
    await shot(page, `settings-${name}`);
  }
  const dialog = await page.locator(".mfga-dialog").boundingBox();
  assert.equal(dialog.width, 580);
  assert.equal(dialog.y, 125);
  await done(page);
});
