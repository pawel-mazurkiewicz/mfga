// The 2010 shell on a reproduction of Facebook's 2026 chrome (test/fixtures/shell/page.html):
// rendering against the 2010 reference, EN/PL counts, the 520px slot, layers above the shell,
// navigation fallbacks, resizing, route modes, the rail cache, the account menu and settings toggles.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { launchBrowser, bundle, ROOT } from "./helpers/browser.mjs";

const OUT = path.join(ROOT, "test-results", "shell");
const FIXTURE = fs.readFileSync(path.join(ROOT, "test/fixtures/shell/page.html"), "utf8");
const REFERENCE = fs.readFileSync(path.join(ROOT, "assets/reference/2010-home.png"));
const FB = "https://www.facebook.com";

const PL = [
  ['lang="en"', 'lang="pl"'],
  ['"Account Controls and Settings"', '"Mechanizmy kontrolne i ustawienia konta"'],
  ['"Facebook menu"', '"Menu Facebooka"'],
  ['"Messenger, 1 unread"', '"Wiadomości, nieprzeczytane: 2"'],
  ['"Notifications, 5 unread"', '"Powiadomienia, 7 nieprzeczytanych"'],
  ['"Friends, 3 notifications"', '"Znajomi, 4 powiadomienia"'],
  ['"Your profile"', '"Twój profil"'],
  ['"Shortcuts"', '"Skróty"'],
  ["Dasha Trofimova's birthday is today.", "Dasha Trofimova ma dziś urodziny 🎉"],
  [", Active", ", Aktywny teraz"],
  ["Meta AI profile photo Meta AIVerified account", "Zdjęcie profilowe Meta AI Meta AIZweryfikowane konto"],
];
const polish = (html) => PL.reduce((s, [a, b]) => s.replaceAll(a, b), html);
/** The Feeds filter routes render no rails (dom-chrome §3.3). */
const withoutRails = (html) => html.replace(/<!--left-rail-->[\s\S]*?<!--\/left-rail-->/, "").replace(/<!--right-rail-->[\s\S]*?<!--\/right-rail-->/, "");

/** A small PNG (avatars and group pictures served for fbcdn URLs). */
function png(w, h, [r, g, b]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = (r + x * 2) & 255;
      raw[o + 1] = (g + y * 2) & 255;
      raw[o + 2] = b;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

let b;
let entry;
const pages = [];

async function openShell({ url = `${FB}/`, html = FIXTURE, cfg = {}, viewport } = {}) {
  const page = await b.newPage({ html, url });
  pages.push(page);
  if (viewport) await page.setViewportSize(viewport);
  await page.evaluate((c) => (window.__mfgaTest = c), cfg);
  await page.addScriptTag({ content: entry });
  await page.waitForSelector("#mfga-shell .mfga-header");
  await settle(page);
  return page;
}

/** Waits until the layout's measured variables stop changing. */
async function settle(page) {
  let last = "";
  for (let i = 0; i < 40; i++) {
    const vars = await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r((document.getElementById("mfga-layout-vars")?.textContent || "") + (document.getElementById("mfga-shell")?.style.getPropertyValue("--mfga-footer-top") || ""))))));
    if (vars && vars === last) return vars;
    last = vars;
    await page.waitForTimeout(50);
  }
  return last;
}

const rect = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left + scrollX, top: r.top + scrollY, width: r.width, height: r.height, right: r.right + scrollX, bottom: r.bottom + scrollY };
  }, sel);
const pageLeft = (page) => page.evaluate(() => document.querySelector("#mfga-shell .mfga-shell-page").getBoundingClientRect().left);
const hitOwner = (page, x, y) =>
  page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    if (!el) return null;
    if (el.closest("#mfga-shell")) return "shell:" + (el.closest("a,button")?.textContent.trim() || el.className);
    return "fb:" + (el.closest("[id],[role]")?.id || el.closest("[role]")?.getAttribute("role") || el.tagName);
  }, [x, y]);
const save = (name, buf) => fs.writeFileSync(path.join(OUT, name), buf);

/**
 * Decodes the 2010 reference and our screenshot in a canvas: samples colours at page-relative CSS points,
 * scores regions by 8×8 block colour similarity and returns a stacked "reference over ours" image per region.
 */
async function compareWithReference(shot, ourPageLeft, { points, regions }) {
  const page = await b.context.newPage();
  pages.push(page);
  await page.setContent("<body></body>");
  return page.evaluate(
    async ({ ref, ours, left, points, regions }) => {
      const load = (b64) => new Promise((res, rej) => Object.assign(new Image(), { onload() { res(this); }, onerror: rej, src: `data:image/png;base64,${b64}` }));
      const ctxOf = (img) => {
        const c = Object.assign(document.createElement("canvas"), { width: img.width, height: img.height });
        const x = c.getContext("2d", { willReadFrequently: true });
        x.drawImage(img, 0, 0);
        return x;
      };
      const [ri, oi] = await Promise.all([load(ref), load(ours)]);
      const rc = ctxOf(ri);
      const oc = ctxOf(oi);
      const REF_LEFT = 7; // the capture's page origin is x=7.5 (retro-spec §0); 1px rules land on the left pixel
      const px = (c, x, y) => [...c.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)];
      const samples = Object.fromEntries(points.map(([name, x, y]) => [name, { ref: px(rc, x + REF_LEFT, y), ours: px(oc, x + left, y) }]));
      const avg = (c, x, y, n) => {
        const d = c.getImageData(Math.round(x), Math.round(y), n, n).data;
        const s = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) s[k] += d[i + k];
        return s.map((v) => v / (n * n));
      };
      const out = {};
      for (const [name, [x0, y0, w, h]] of Object.entries(regions)) {
        let same = 0;
        let total = 0;
        for (let y = y0; y + 8 <= y0 + h; y += 8) {
          for (let x = x0; x + 8 <= x0 + w; x += 8) {
            const a = avg(rc, x + REF_LEFT, y, 8);
            const o = avg(oc, x + left, y, 8);
            total++;
            if (Math.max(...a.map((v, i) => Math.abs(v - o[i]))) < 24) same++;
          }
        }
        const c = Object.assign(document.createElement("canvas"), { width: w * 2, height: h * 4 + 8 });
        const g = c.getContext("2d");
        g.imageSmoothingEnabled = false;
        g.fillStyle = "#f00";
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(ri, x0 + REF_LEFT, y0, w, h, 0, 0, w * 2, h * 2);
        g.drawImage(oi, x0 + left, y0, w, h, 0, h * 2 + 8, w * 2, h * 2);
        out[name] = { score: same / total, image: c.toDataURL("image/png").split(",")[1] };
      }
      return { samples, regions: out };
    },
    { ref: REFERENCE.toString("base64"), ours: shot.toString("base64"), left: ourPageLeft, points, regions },
  );
}

const close = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

// Page-relative CSS points where the 2010 capture and our shell must show the same 2010 colour.
const SAMPLES = [
  ["bar", 300, 5, "#3B5998"],
  ["headNav", 600, 25, "#627AAD"],
  ["search field", 250, 22, "#FFFFFF"],
  ["selected nav row", 150, 131, "#D8DFEA"],
  ["left separator", 179, 300, "#CCCCCC"],
  ["nav group rule", 60, 234, "#F7F7F7"],
  ["right header rule", 800, 77, "#E9E9E9"],
  ["left column paper", 150, 240, "#FFFFFF"],
  ["content paper", 400, 50, "#FFFFFF"],
];
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));

before(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  entry = await bundle("test/e2e/entries/shell-entry.js");
  b = await launchBrowser({ viewport: { width: 1280, height: 900 } });
  await b.context.addCookies([{ name: "c_user", value: "100001234567890", domain: ".facebook.com", path: "/" }]);
  const colours = { me: [70, 110, 160], group: [160, 120, 60], page: [200, 90, 60], c: [90, 150, 90] };
  b.route(
    (u) => u.hostname.endsWith("fbcdn.net"),
    (route, request) => {
      const name = Object.keys(colours).find((k) => request.url().includes(`/${k}`)) || "c";
      return route.fulfill({ status: 200, contentType: "image/png", body: png(50, 50, colours[name]) });
    },
  );
  b.servePage("*", FIXTURE);
});

after(async () => {
  const errors = pages.flatMap((p) => p.__errors || []);
  await b?.close();
  assert.deepEqual(errors, [], "no page errors in any shell page");
});

describe("2010 shell on Home", () => {
  it("renders header, left and right columns that match the 2010 reference layout", async () => {
    const page = await openShell();
    const shot = await page.screenshot({ fullPage: true });
    save("home-1280.png", shot);
    const left = await pageLeft(page);
    assert.equal(left, 150);

    assert.deepEqual(await rect(page, "#mfga-shell .mfga-header"), { left: 0, top: 0, width: 1280, height: 41, right: 1280, bottom: 41 });
    const l = await rect(page, "#mfga-shell .mfga-shell-left");
    assert.deepEqual([l.left, l.top, l.width], [150, 61, 179]);
    const r = await rect(page, "#mfga-shell .mfga-shell-right");
    assert.deepEqual([r.left, r.top, r.width], [880, 61, 233]);
    const sep = await rect(page, "#mfga-shell .mfga-shell-sep");
    assert.deepEqual([sep.left, sep.top, sep.width], [329, 41, 1]);

    const { samples, regions } = await compareWithReference(shot, left, {
      points: SAMPLES.map(([name, x, y]) => [name, x, y]),
      regions: { header: [0, 0, 980, 41], left: [0, 41, 179, 190], right: [730, 41, 233, 120] },
    });
    for (const [name, x, y, colour] of SAMPLES) {
      const s = samples[name];
      assert.ok(close(s.ref, hex(colour), 16), `reference ${name} at ${x},${y}: ${s.ref}`);
      assert.ok(close(s.ours, hex(colour), 4), `ours ${name} at ${x},${y}: ${s.ours}`);
    }
    for (const [name, { score, image }] of Object.entries(regions)) save(`compare-${name}.png`, Buffer.from(image, "base64"));
    assert.ok(regions.header.score >= 0.93, `header similarity ${regions.header.score}`);
    assert.ok(regions.left.score >= 0.88, `left column similarity ${regions.left.score}`);
    assert.ok(regions.right.score >= 0.8, `right column similarity ${regions.right.score}`);
  });

  it("parses the English counts and shows them as 2010 jewels, nav counts and requests", async () => {
    const page = await openShell();
    const data = await page.evaluate(() => ({ counts: __mfga.reader.counts(), identity: __mfga.reader.identity() }));
    assert.deepEqual(data.counts, { notifications: 5, messages: 1, friendRequests: 3 });
    assert.equal(data.identity.id, "100001234567890");
    assert.equal(data.identity.name, "Pat Example");
    assert.match(data.identity.avatar, /me-40\.png/);
    const ui = await page.evaluate(() => ({
      jewels: [...document.querySelectorAll(".mfga-header-jewel")].map((j) => [j.getAttribute("aria-label"), j.querySelector(".mfga-header-count")?.textContent || null, j.querySelector(".mfga-ico").className.split("mfga-ico-")[1]]),
      nav: [...document.querySelectorAll(".mfga-shell-left .mfga-nav-link")].slice(0, 5).map((a) => a.textContent),
      requests: document.querySelector(".mfga-rc-requests .mfga-rc-row")?.textContent,
      birthday: document.querySelector(".mfga-rc-events .mfga-rc-row")?.textContent,
      mfga: [...document.querySelectorAll(".mfga-rc-mfga .mfga-rc-row")].map((r) => r.textContent),
      groups: [...document.querySelectorAll(".mfga-shell-left .mfga-nav-pic")].length,
      chat: document.querySelector(".mfga-chat-tab").textContent,
      online: [...document.querySelectorAll(".mfga-nav-chat .mfga-nav-label")].map((e) => e.textContent),
      name: document.querySelector(".mfga-nav-me-name")?.textContent,
    }));
    assert.deepEqual(ui.jewels, [
      ["Friend Requests (3)", "3", "jewel_requests_on"],
      ["Messages (1)", "1", "jewel_messages_on"],
      ["Notifications (5)", "5", "jewel_notifications_on"],
    ]);
    assert.deepEqual(ui.nav, ["News Feed", "Messages (1)", "Events", "Photos", "Friends (3)"]);
    assert.equal(ui.requests, "3 friend requests");
    assert.equal(ui.birthday, "Dasha Trofimova's birthday Today");
    assert.deepEqual(ui.mfga, ["12 ads removed", "34 suggested posts removed"]);
    assert.equal(ui.groups, 4, "3 groups + 1 Page with their 16px pictures");
    assert.equal(ui.chat, "Chat (4)", "Meta AI is not a friend");
    assert.deepEqual(ui.online, ["Petronella O'Negriezz", "Tom Hellier", "Ágnes Fülöp", "Ash Bainbridge"]);
    assert.equal(ui.name, "Pat Example");
  });

  it("parses the Polish chrome and speaks 2010 Polish", async () => {
    const page = await openShell({ html: polish(FIXTURE) });
    const counts = await page.evaluate(() => __mfga.reader.counts());
    assert.deepEqual(counts, { notifications: 7, messages: 2, friendRequests: 4 });
    const contacts = await page.evaluate(() => __mfga.reader.contacts().map((c) => c.name));
    assert.ok(contacts.length === 6 && !contacts.some((n) => /meta ai/i.test(n)), `Meta AI is recognised by its picture: ${contacts}`);
    const ui = await page.evaluate(() => ({
      links: [...document.querySelectorAll(".mfga-header-link")].map((a) => a.textContent),
      nav: [...document.querySelectorAll(".mfga-shell-left .mfga-nav-link")].slice(0, 5).map((a) => a.textContent),
      requests: document.querySelector(".mfga-rc-requests .mfga-rc-row")?.textContent,
      birthday: document.querySelector(".mfga-rc-events .mfga-rc-row")?.textContent,
      chat: document.querySelector(".mfga-chat-tab").textContent,
      search: document.querySelector(".mfga-header-search-input").placeholder,
      footer: document.querySelector(".mfga-footer-left").textContent,
    }));
    assert.deepEqual(ui.links, ["Strona główna", "Profil", "Konto"]);
    assert.deepEqual(ui.nav, ["Aktualności", "Wiadomości (2)", "Wydarzenia", "Zdjęcia", "Znajomi (4)"]);
    assert.equal(ui.requests, "4 zaproszenia do grona znajomych");
    assert.equal(ui.birthday, "Urodziny: Dasha Trofimova Dzisiaj");
    assert.equal(ui.chat, "Czat (4)");
    assert.equal(ui.search, "Szukaj");
    assert.equal(ui.footer, "Facebook © 2010 · Polski");
    save("home-pl.png", await page.screenshot());
  });

  it("relabels the bar, columns and footer when the language changes", async () => {
    const page = await openShell();
    await page.evaluate(() => {
      __mfga.setLocale("pl");
      __mfga.shell.update({});
    });
    const ui = await page.evaluate(() => ({
      links: [...document.querySelectorAll(".mfga-header-link")].map((a) => a.textContent),
      first: document.querySelector(".mfga-shell-left .mfga-nav-link").textContent,
      footer: document.querySelector(".mfga-footer-left").textContent,
      jewel: document.querySelector(".mfga-header-jewel-notifications").getAttribute("aria-label"),
      headers: document.querySelectorAll("#mfga-shell .mfga-header").length,
    }));
    assert.deepEqual(ui, { links: ["Strona główna", "Profil", "Konto"], first: "Aktualności", footer: "Facebook © 2010 · Polski", jewel: "Powiadomienia (5)", headers: 1 });
  });

  it("boots at document_start, before Facebook's DOM exists", async () => {
    const page = await b.context.newPage();
    pages.push(page);
    page.on("pageerror", (err) => (page.__errors ||= []).push(String(err)));
    await page.addInitScript({ content: `window.__mfgaTest = {};\n${entry}` });
    await page.goto(`${FB}/`);
    await page.waitForFunction(() => document.getElementById("mfga-shell")?.nextElementSibling?.id === "mount_0_0_Qx", null, { timeout: 4000 });
    await page.waitForFunction(() => document.querySelector(".mfga-header-jewel-notifications .mfga-header-count")?.textContent === "5", null, { timeout: 5000 });
    await page.waitForFunction(() => document.querySelector("[data-mfga-main]")?.getBoundingClientRect().left === 345, null, { timeout: 4000 });
    assert.equal(await page.evaluate(() => document.querySelector(".mfga-nav-me-name")?.textContent), "Pat Example");
  });

  it("keeps working when Facebook's banner has a link without an href", async () => {
    const html = FIXTURE.replace('<li><span><div><a aria-label="Home"', '<li><span><div><a aria-label="Reels" role="link" tabindex="0">Reels</a></div></span></li><li><span><div><a aria-label="Home"');
    const page = await openShell({ html });
    assert.deepEqual(await page.evaluate(() => __mfga.reader.counts()), { notifications: 5, messages: 1, friendRequests: 3 });
    const ui = await page.evaluate(() => ({ jewel: document.querySelector(".mfga-header-jewel-notifications .mfga-header-count")?.textContent, rows: document.querySelectorAll(".mfga-shell-left .mfga-nav-item").length }));
    assert.equal(ui.jewel, "5");
    assert.ok(ui.rows > 10, "the left column rendered");
  });

  it("recognises a viewer whose username has dots, and their groups", async () => {
    const html = FIXTURE.replace('href="https://www.facebook.com/profile.php?id=100001234567890"><img', 'href="https://www.facebook.com/pat.example"><img');
    const page = await openShell({ html, cfg: { clearCache: true } });
    await page.waitForFunction(() => document.querySelectorAll(".mfga-shell-left .mfga-nav-pic").length === 4);
    const ui = await page.evaluate(() => ({
      name: document.querySelector(".mfga-nav-me-name")?.textContent,
      href: document.querySelector(".mfga-nav-me-name")?.getAttribute("href"),
      photos: document.querySelector(".mfga-nav-item[data-key=photos] a").getAttribute("href"),
    }));
    assert.deepEqual(ui, { name: "Pat Example", href: `${FB}/pat.example`, photos: `${FB}/pat.example/photos` });
  });

  it("follows Facebook when it replaces the main column", async () => {
    const page = await openShell();
    await page.evaluate(() => {
      const old = document.querySelector('[role="main"]');
      const next = old.cloneNode(true);
      next.removeAttribute("data-mfga-main");
      old.replaceWith(next);
      window.__oldMain = old;
    });
    await page.waitForFunction(() => document.querySelector('[role="main"]').hasAttribute("data-mfga-main"), null, { timeout: 3000 });
    await settle(page);
    const m = await rect(page, "[data-mfga-main]");
    assert.deepEqual([m.left, m.top, m.width], [345, 61, 520]);
    assert.equal(await page.evaluate(() => window.__oldMain.hasAttribute("data-mfga-main")), false, "the detached column is unmarked");
  });

  it("keeps the counts live when Facebook updates its labels", async () => {
    const page = await openShell();
    await page.evaluate(() => document.querySelector('[aria-label="Notifications, 5 unread"]').setAttribute("aria-label", "Notifications, 9 unread"));
    await page.waitForFunction(() => document.querySelector(".mfga-header-jewel-notifications .mfga-header-count")?.textContent === "9");
    await page.evaluate(() => document.querySelector('[aria-label="Messenger, 1 unread"]').setAttribute("aria-label", "Messenger"));
    await page.waitForFunction(() => !document.querySelector(".mfga-header-jewel-messages .mfga-header-count"));
    assert.equal(await page.evaluate(() => document.querySelector(".mfga-header-jewel-messages .mfga-ico").classList.contains("mfga-ico-jewel_messages_off")), true);
  });

  it("puts [role=main] exactly into the 520px slot, also after scrolling", async () => {
    const page = await openShell();
    const m = await rect(page, "[data-mfga-main]");
    assert.deepEqual([m.left, m.top, m.width], [345, 61, 520]);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(100);
    await settle(page);
    const m2 = await rect(page, "[data-mfga-main]");
    assert.deepEqual([m2.left, m2.top, m2.width], [345, 61, 520]);
    const marks = await page.evaluate(() => ({
      main: document.querySelectorAll("[data-mfga-main]").length,
      rails: [...document.querySelectorAll("[data-mfga-chrome]")].map((e) => e.className),
      pass: [...document.querySelectorAll("[data-mfga-pass]")].map((e) => e.id || e.className),
      inline: [...document.querySelectorAll("#mount_0_0_Qx [style]")].filter((e) => /mfga|left:|top:/.test(e.getAttribute("style"))).length,
    }));
    assert.equal(marks.main, 1);
    assert.deepEqual(marks.rails, ["xleft", "xright"]);
    assert.ok(marks.pass.includes("mount_0_0_Qx") && marks.pass.includes("xcenter"), String(marks.pass));
    assert.equal(marks.inline, 0, "no inline styles on Facebook nodes");
    const footer = await rect(page, "#mfga-shell .mfga-footer");
    assert.ok(footer.top >= m2.top + m2.height, "footer below the main column");
  });

  it("starts the column's content at the slot's edge even when Facebook pads [role=main]", async () => {
    // Facebook pads its feed column (the fake site: 16px 16px 40px); the stream must still fill x 195-715, y 61.
    const html = FIXTURE.replace("[role=main] { width: 100%; max-width: 680px; padding: 16px 0 0; }", "[role=main] { width: 100%; max-width: 680px; padding: 16px 16px 40px; }");
    assert.notEqual(html, FIXTURE);
    const page = await openShell({ html });
    const m = await rect(page, "[data-mfga-main]");
    assert.deepEqual([m.left, m.top, m.width], [345, 61, 520]);
    const first = await rect(page, '[role="main"] [aria-label="Create a post"]');
    assert.deepEqual([first.left, first.top, first.width], [345, 61, 520]);
  });

  it("sets the bar's links and the left column's text on the 2010 capture's baselines", async () => {
    const page = await openShell();
    // The top of a 0×0 inline-block on the baseline is the baseline; glyphs end there whatever the font.
    const geometry = () =>
      page.evaluate(() => {
        const baseline = (el) => {
          const probe = document.createElement("span");
          probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
          el.insertBefore(probe, el.firstChild);
          const y = probe.getBoundingClientRect().top + scrollY;
          probe.remove();
          return y;
        };
        const top = (el) => el.getBoundingClientRect().top + scrollY;
        const rows = [...document.querySelectorAll(".mfga-shell-left > ul:first-of-type > li > a, .mfga-shell-left > .mfga-nav-sep-apps + ul > li > a")];
        const seps = [...document.querySelectorAll(".mfga-shell-left .mfga-nav-sep")];
        const chat = document.querySelector(".mfga-nav-chat .mfga-nav-title");
        return {
          links: [...document.querySelectorAll(".mfga-header-link")].map(baseline),
          rowTops: rows.map(top),
          // how far under its line's top this font draws the baseline (Tahoma: ≈10.9, the capture: 10)
          k: baseline(rows[0]) - (top(rows[0]) + 3),
          more: baseline(document.querySelector(".mfga-nav-more")),
          seps: seps.map(top),
          chatSep: top(chat.previousElementSibling),
          chatTitle: baseline(chat),
        };
      });
    const g = await geometry();
    assert.equal(new Set(g.links).size, 1, `Home, Profile and Account share one baseline: ${g.links}`);
    // retro-spec §4 (glyph bottoms 10px under each 13px line's top): rows 121, 142, …, 205, then 247 …;
    // the first rule at 234; "More" 36px under the last row's top and the next rule at +46; "Chat with Friends" 20px under its rule.
    assert.deepEqual(g.rowTops.slice(0, 6), [121, 142, 163, 184, 205, 247]);
    const last = g.rowTops[g.rowTops.length - 1];
    assert.equal(g.seps[0], 234, "the rule between the two nav lists");
    assert.equal(g.more - g.k, last + 26, "More ▾");
    assert.equal(g.seps[1], last + 46, "the rule under More ▾");
    assert.equal(g.chatTitle - g.k, g.chatSep + 10, "Chat with Friends");

    await page.click(".mfga-header-account-btn");
    const open = await geometry();
    assert.deepEqual(open.links, g.links, "opening the account menu does not move its label");
  });

  it("keeps News Feed's filters closed on Home; News Feed opens them, a filter route shows them selected", async () => {
    const page = await openShell();
    const nav = () =>
      page.evaluate(() => ({
        rows: [...document.querySelectorAll(".mfga-shell-left .mfga-nav-sub .mfga-nav-item")].map((li) => li.dataset.key),
        expanded: document.querySelector('.mfga-nav-item[data-key="newsFeed"] a').getAttribute("aria-expanded"),
        selected: [...document.querySelectorAll(".mfga-shell-left .mfga-nav-selected")].map((li) => li.dataset.key),
        path: location.pathname + location.search,
      }));
    assert.deepEqual(await nav(), { rows: [], expanded: "false", selected: ["newsFeed"], path: "/" }, "the 2010 Home shows News Feed alone");
    await page.click('.mfga-nav-item[data-key="newsFeed"] a');
    assert.deepEqual(await nav(), { rows: ["feed_friends", "feed_groups", "feed_pages", "feed_favorites"], expanded: "true", selected: ["newsFeed"], path: "/" });
    assert.equal(await page.evaluate(() => document.activeElement?.closest(".mfga-nav-item")?.dataset.key), "newsFeed", "focus stays on News Feed");
    await page.click('.mfga-nav-item[data-key="newsFeed"] a');
    assert.deepEqual((await nav()).rows, []);

    const filtered = await openShell({ url: `${FB}/?filter=groups&sk=h_chr`, html: withoutRails(FIXTURE) });
    const f = await filtered.evaluate(() => ({
      rows: [...document.querySelectorAll(".mfga-shell-left .mfga-nav-sub .mfga-nav-item")].map((li) => li.dataset.key),
      selected: [...document.querySelectorAll(".mfga-shell-left .mfga-nav-selected")].map((li) => li.dataset.key),
      expanded: document.querySelector('.mfga-nav-item[data-key="newsFeed"] a').hasAttribute("aria-expanded"),
    }));
    assert.deepEqual(f, { rows: ["feed_friends", "feed_groups", "feed_pages", "feed_favorites"], selected: ["feed_groups"], expanded: false });
  });

  it("lets clicks reach the shell through Facebook's wrappers, and Facebook's column stays interactive", async () => {
    const page = await openShell();
    assert.equal(await hitOwner(page, 150 + 60, 151), "shell:Messages (1)");
    assert.equal(await hitOwner(page, 880 + 50, 90), "shell:3 friend requests");
    assert.equal(await hitOwner(page, 600, 400), "fb:fx-post-1");
    assert.match(await hitOwner(page, 400, 20), /^shell:/, "Facebook's invisible banner does not swallow header clicks");
  });

  it("hides Facebook's banner and rails but keeps its dialogs, dropdowns and chat above the shell", async () => {
    const page = await openShell();
    const state = await page.evaluate(() => {
      const cs = (sel) => getComputedStyle(document.querySelector(sel));
      return { banner: cs('[role="banner"]').visibility, height: document.querySelector('[role="banner"]').getBoundingClientRect().height, left: cs(".xleft").visibility, right: cs(".xright").visibility, headerVar: getComputedStyle(document.documentElement).getPropertyValue("--header-height").trim() };
    });
    assert.deepEqual(state, { banner: "hidden", height: 0, left: "hidden", right: "hidden", headerVar: "41px" });

    await page.evaluate(() => (document.getElementById("fx-portal").hidden = false));
    assert.equal(await hitOwner(page, 640, 450), "fb:fx-dialog", "portal dialog paints above the shell");
    assert.equal(await hitOwner(page, 200, 140), "fb:fx-portal", "its backdrop covers the shell too");
    await page.evaluate(() => (document.getElementById("fx-portal").hidden = true));

    await page.evaluate(() => document.getElementById("fx-account").click());
    const menu = await page.evaluate(() => {
      const el = document.getElementById("fx-account-menu");
      const r = el.getBoundingClientRect();
      return { visibility: getComputedStyle(el).visibility, x: r.left + r.width / 2, y: r.top + 20 };
    });
    assert.equal(menu.visibility, "visible", "a dropdown inside the hidden banner stays visible");
    assert.match(await hitOwner(page, menu.x, menu.y), /^fb:/);
    await page.evaluate(() => document.getElementById("fx-account").click());

    // Facebook's docked chat stays usable above the shell; only its New message launcher gives way to the 2010
    // chat tab, and keeps its place so the conversation heads above it stay clear of the tab.
    const scroll = await page.evaluate(() => scrollY);
    const head = await rect(page, '[aria-label^="Open chat with"]');
    assert.equal(await hitOwner(page, head.left + 24, head.top + 24 - scroll), "fb:button");
    const launcher = await rect(page, '[aria-label="New message"]');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[aria-label="New message"]')).visibility), "hidden");
    assert.notEqual(await hitOwner(page, launcher.left + 24, launcher.top + 24 - scroll), "fb:button");
    const tab = await rect(page, ".mfga-chat-tab");
    assert.ok(head.top + head.height <= tab.top, `the head stays above the 2010 tab: ${JSON.stringify({ head, tab })}`);
  });
});

describe("navigation", () => {
  it("uses the MAIN-world helper when there is one", async () => {
    const page = await openShell({ cfg: { helper: true } });
    await page.click(".mfga-shell-left .mfga-nav-item[data-key=friends] a");
    await page.waitForFunction(() => location.pathname === "/friends/");
    assert.deepEqual(await page.evaluate(() => __mfga.state.navCalls), ["/friends/"]);
    await page.waitForFunction(() => document.documentElement.dataset.mfgaRoute === "page");
    assert.deepEqual(await page.evaluate(() => __fb.clicks), []);
  });

  it("clicks Facebook's own anchor for the same place when there is no helper", async () => {
    const page = await openShell();
    await page.click(".mfga-shell-left .mfga-nav-item[data-key=friends] a");
    await page.waitForFunction(() => location.pathname === "/friends/");
    assert.deepEqual(await page.evaluate(() => __fb.clicks), ["/friends/"]);
    await page.waitForFunction(() => document.documentElement.dataset.mfgaRoute === "page");
  });

  it("falls back to a full page load, and hard navigations always load", async () => {
    const page = await openShell();
    await Promise.all([page.waitForURL(`${FB}/pokes/`), page.click(".mfga-rc-pokes .mfga-rc-row")]);
    assert.equal(page.url(), `${FB}/pokes/`);
    const page2 = await openShell({ cfg: { helper: true } });
    await Promise.all([page2.waitForURL(`${FB}/friends/`), page2.evaluate(() => void setTimeout(() => __mfga.navigator.go("/friends/", { hard: true })))]);
    assert.equal(await page2.evaluate(() => window.__mfga), undefined, "a real load happened");
  });

  it("never clicks MFGA's own anchors inside Facebook's root (the stream), it loads the page instead", async () => {
    const page = await openShell();
    // WP-C's stream sits inside [role=main] and hands its internal links to the navigator.
    await page.evaluate(() => {
      const stream = document.createElement("div");
      stream.id = "mfga-stream";
      stream.className = "mfga-ui";
      const a = Object.assign(document.createElement("a"), { href: "/kasia.nowak/posts/123", textContent: "permalink" });
      a.setAttribute("data-mfga-open", "");
      stream.appendChild(a);
      stream.addEventListener("click", (e) => {
        const link = e.target.closest("a[data-mfga-open]");
        if (!link) return;
        e.preventDefault();
        window.__streamClicks = (window.__streamClicks || 0) + 1;
        __mfga.navigator.go(link.href);
      });
      document.querySelector('[role="main"]').prepend(stream);
    });
    await Promise.all([page.waitForURL(`${FB}/kasia.nowak/posts/123`, { timeout: 4000 }), page.click("#mfga-stream a")]);
    assert.equal(await page.evaluate(() => window.__mfga), undefined, "a real load happened");
  });

  it("refuses script URLs", async () => {
    const page = await openShell({ cfg: { helper: true } });
    const r = await page.evaluate(async () => {
      for (const url of ["javascript:window.__pwned=1", "data:text/html,<script>parent.__pwned=1</script>"]) __mfga.navigator.go(url);
      await new Promise((res) => setTimeout(res, 300));
      return { pwned: window.__pwned ?? null, href: location.href, calls: __mfga.state.navCalls };
    });
    assert.deepEqual(r, { pwned: null, href: `${FB}/`, calls: [] });
  });

  it("stays in the single-page app on web.facebook.com", async () => {
    const WEB = "https://web.facebook.com";
    b.route((u) => u.hostname === "web.facebook.com", (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: FIXTURE }));
    const page = await openShell({ url: `${WEB}/` });
    await page.click(".mfga-shell-left .mfga-nav-item[data-key=friends] a");
    await page.waitForFunction(() => location.pathname === "/friends/");
    assert.deepEqual(await page.evaluate(() => [location.host, __fb.clicks, !!window.__mfga]), ["web.facebook.com", ["/friends/"], true], "Facebook's own anchor, no page load");
    const helper = await openShell({ url: `${WEB}/`, cfg: { helper: true } });
    await helper.click(".mfga-shell-right .mfga-rc-pokes .mfga-rc-row");
    await helper.waitForFunction(() => location.pathname === "/pokes/");
    assert.deepEqual(await helper.evaluate(() => [location.host, __mfga.state.navCalls]), ["web.facebook.com", ["/pokes/"]]);
  });

  it("leaves modified clicks to the browser and routes search and jewels", async () => {
    const page = await openShell({ cfg: { helper: true } });
    // The browser's own new-tab load escapes the context's routes and reaches the real facebook.com, whose answer
    // signs the whole context out (c_user deleted). Record what MFGA did with the click, then cancel the tab.
    await page.evaluate(() =>
      addEventListener("click", (e) => {
        if (!e.ctrlKey) return;
        window.__ctrlClick = { mfgaPrevented: e.defaultPrevented };
        e.preventDefault();
      }),
    );
    await page.click(".mfga-shell-left .mfga-nav-item[data-key=events] a", { modifiers: ["Control"] });
    assert.deepEqual(await page.evaluate(() => window.__ctrlClick), { mfgaPrevented: false }, "the click is left to the browser");
    assert.deepEqual(await page.evaluate(() => __mfga.state.navCalls), []);
    await page.click(".mfga-header-search-btn");
    assert.equal(await page.evaluate(() => document.activeElement.className), "mfga-header-search-input", "empty search focuses the box");
    await page.fill(".mfga-header-search-input", "kasia nowak");
    await page.press(".mfga-header-search-input", "Enter");
    await page.click(".mfga-header-jewel-notifications");
    assert.deepEqual(await page.evaluate(() => __mfga.state.navCalls), ["/search/top/?q=kasia%20nowak", "/notifications/"]);
  });
});

describe("layout", () => {
  it("re-measures on resize, including when Facebook drops its left rail", async () => {
    const page = await openShell();
    for (const width of [1000, 1050, 1600, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForFunction((w) => document.querySelector("[data-mfga-main]").getBoundingClientRect().left === (w - 980) / 2 + 195, width, { timeout: 3000 });
      const m = await rect(page, "[data-mfga-main]");
      assert.deepEqual([m.left, m.top, m.width], [(width - 980) / 2 + 195, 61, 520], `width ${width}`);
      const r = await rect(page, "#mfga-shell .mfga-shell-right");
      assert.equal(r.left, (width - 980) / 2 + 730);
    }
    await page.setViewportSize({ width: 1000, height: 800 });
    await settle(page);
    save("home-1000.png", await page.screenshot());
  });

  it("leaves an idle page alone: no layout rewrites at a fractional offset, and the footer never restyles the page", async () => {
    // Facebook's column usually sits at a fractional x (centred flex children, browser zoom). The measured
    // offset then came back a hundredth of a pixel off after it was applied (layout snaps to 1/64 px), so the
    // :root variables were rewritten every second (-35.16, -35.14, -35.16 ...), each time restyling the page.
    const html = FIXTURE.replace("</head>", "<style>.xcenter{padding-left:.3px}</style></head>");
    const page = await openShell({ html });
    await page.waitForTimeout(1200);
    await settle(page);
    const idle = await page.evaluate(async () => {
      let writes = 0;
      const mo = new MutationObserver((records) => (writes += records.length));
      mo.observe(document.getElementById("mfga-layout-vars"), { childList: true, characterData: true, subtree: true });
      mo.observe(document.getElementById("mfga-shell"), { attributes: true, attributeFilter: ["style"] });
      await new Promise((r) => setTimeout(r, 2600));
      mo.disconnect();
      return {
        writes,
        rootFooter: getComputedStyle(document.documentElement).getPropertyValue("--mfga-footer-top"),
        hostFooter: document.getElementById("mfga-shell").style.getPropertyValue("--mfga-footer-top"),
      };
    });
    assert.equal(idle.writes, 0, "layout variables rewritten on an idle page");
    assert.equal(idle.rootFooter, "", "the footer position is not a :root variable (changing one restyles every element)");
    assert.match(idle.hostFooter, /^\d+(\.\d+)?px$/);
    const m = await rect(page, "[data-mfga-main]");
    assert.ok(Math.abs(m.left - 345) < 0.1 && m.top === 61, `main column at ${m.left},${m.top}`);
  });

  it("switches modes on route changes: groups feed, plain pages, and back home", async () => {
    const page = await openShell({ cfg: { helper: true } });
    await page.evaluate(() => __mfga.navigator.go("/groups/feed/"));
    await page.waitForFunction(() => document.documentElement.dataset.mfgaRoute === "groups-feed");
    await settle(page);
    const g = await rect(page, "[data-mfga-main]");
    assert.deepEqual([g.left, g.top, g.width], [345, 61, 680]);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".mfga-shell-right")).display), "none");
    assert.equal(await page.evaluate(() => document.querySelector(".mfga-nav-selected")?.dataset.key), "groups");
    save("groups-feed.png", await page.screenshot());

    await page.evaluate(() => __mfga.navigator.go("/friends/"));
    await page.waitForFunction(() => document.documentElement.dataset.mfgaRoute === "page");
    await settle(page);
    const plain = await page.evaluate(() => ({
      marks: document.querySelectorAll("[data-mfga-main],[data-mfga-chrome]").length,
      rails: getComputedStyle(document.querySelector(".xleft")).visibility,
      left: getComputedStyle(document.querySelector(".mfga-shell-left")).display,
      header: getComputedStyle(document.querySelector(".mfga-header")).display,
      chat: getComputedStyle(document.querySelector(".mfga-chat-tab")).display,
    }));
    // Facebook's page paints over our z-index-0 chat tab here (raising it would cover Facebook's docked chat).
    assert.deepEqual(plain, { marks: 0, rails: "visible", left: "none", header: "block", chat: "none" });
    const footer = await rect(page, "#mfga-shell .mfga-footer");
    assert.deepEqual([footer.left, footer.width], [150, 980]);
    save("page-mode.png", await page.screenshot({ fullPage: true }));

    await page.goBack();
    await page.goBack();
    await page.waitForFunction(() => document.documentElement.dataset.mfgaRoute === "home");
    await settle(page);
    const m = await rect(page, "[data-mfga-main]");
    assert.deepEqual([m.left, m.width], [345, 520]);
    assert.deepEqual(await page.evaluate(() => __mfga.state.routes), ["groups-feed", "page", "groups-feed", "home"]);
  });

  it("keeps the column layout while a photo opens over the feed", async () => {
    const page = await openShell({ cfg: { helper: true } });
    await page.evaluate(() => {
      const dialog = document.createElement("div");
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-label", "Pat Example's photo");
      dialog.id = "fx-push";
      dialog.style.cssText = "position:fixed;inset:0";
      document.querySelector(".xmainwrap").after(dialog);
      __mfga.navigator.go("/photo/?fbid=1");
    });
    await page.waitForFunction(() => __mfga.state.routes.length === 1);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.mfgaRoute), "home");
    await page.evaluate(() => document.getElementById("fx-push").remove());
    await page.waitForFunction(() => document.documentElement.dataset.mfgaRoute === "page", null, { timeout: 3000 });
  });

  it("does not mistake a docked chat window or a hovercard for a push view", async () => {
    const page = await openShell({ cfg: { helper: true } });
    await page.evaluate(() => {
      const layer = (label, css) => {
        const d = document.createElement("div");
        d.setAttribute("role", "dialog");
        d.setAttribute("aria-label", label);
        d.style.cssText = css;
        document.querySelector(".xchat").appendChild(d);
      };
      layer("Kasia Nowak", "position:fixed;right:80px;bottom:0;width:328px;height:455px;background:#fff");
      layer("Hovercard", "position:fixed;left:420px;top:300px;width:360px;height:220px;background:#fff");
      __mfga.navigator.go("/friends/");
    });
    await page.waitForFunction(() => __mfga.state.routes.length === 1);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.mfgaRoute), "page");
  });

  it("serves the Feeds filter routes, which have no rails, from the rail cache", async () => {
    const home = await openShell();
    await home.waitForFunction(() => !!localStorage.getItem("mfga:rail"), null, { timeout: 4000 });
    const page = await openShell({ url: `${FB}/?filter=friends&sk=h_chr`, html: withoutRails(FIXTURE) });
    await page.waitForFunction(() => document.querySelectorAll(".mfga-shell-left .mfga-nav-pic").length === 4);
    const ui = await page.evaluate(() => ({
      name: document.querySelector(".mfga-nav-me-name")?.textContent,
      groups: [...document.querySelectorAll(".mfga-shell-left .mfga-nav-pic")].map((i) => i.closest("a").title),
      birthday: document.querySelector(".mfga-rc-events .mfga-rc-row")?.textContent,
      route: document.documentElement.dataset.mfgaRoute,
    }));
    assert.deepEqual(ui, {
      name: "Pat Example",
      groups: ["Kraków Cyclists", "Gaming Club", "Old School Photography", "Example Bakery"],
      birthday: "Dasha Trofimova's birthday Today",
      route: "home",
    });
    const m = await rect(page, "[data-mfga-main]");
    assert.deepEqual([m.left, m.top, m.width], [345, 61, 520]);

    // Someone else signs in on the same browser: the cached rail is not theirs.
    await b.context.addCookies([{ name: "c_user", value: "100009999999999", domain: ".facebook.com", path: "/" }]);
    const other = await openShell({ url: `${FB}/?filter=friends&sk=h_chr`, html: withoutRails(FIXTURE) });
    await other.waitForTimeout(300);
    const ui2 = await other.evaluate(() => ({ name: document.querySelector(".mfga-nav-me-name")?.textContent ?? null, groups: document.querySelectorAll(".mfga-shell-left .mfga-nav-pic").length, chat: document.querySelector(".mfga-chat-tab").textContent }));
    assert.deepEqual(ui2, { name: null, groups: 0, chat: "Chat (Offline)" });
    await b.context.addCookies([{ name: "c_user", value: "100001234567890", domain: ".facebook.com", path: "/" }]);
    await other.evaluate(() => localStorage.clear());
  });

  it("looks for Facebook's rails only on Home, where it reads them, never on the groups feed", async () => {
    // Each lookup walks the whole document; on the groups feed that is Facebook's whole feed (~100k elements on
    // a long one), and the reader's rescan ran two of them every 2 s although nothing reads the rails there.
    const page = await openShell({ cfg: { helper: true } });
    await page.evaluate(() => {
      window.__railLookups = 0;
      const qsa = Document.prototype.querySelectorAll;
      Document.prototype.querySelectorAll = function (sel) {
        if (/role="(navigation|complementary)"/.test(sel)) window.__railLookups++;
        return qsa.call(this, sel);
      };
    });
    await page.waitForFunction(() => window.__railLookups > 0, null, { timeout: 5000 });
    await page.evaluate(() => __mfga.navigator.go("/groups/feed/"));
    await page.waitForFunction(() => document.documentElement.dataset.mfgaRoute === "groups-feed");
    await page.evaluate(() => (window.__railLookups = 0));
    await page.waitForTimeout(2600);
    assert.equal(await page.evaluate(() => window.__railLookups), 0, "rail lookups on the groups feed");
    await page.goBack();
    await page.waitForFunction(() => document.documentElement.dataset.mfgaRoute === "home");
    await page.waitForFunction(() => window.__railLookups > 0, null, { timeout: 5000 });
  });
});

describe("account menu and settings", () => {
  it("opens the 2010 account menu and closes it on outside click and Escape", async () => {
    const page = await openShell({ cfg: { helper: true } });
    await page.click(".mfga-header-account-btn");
    const items = await page.evaluate(() => [...document.querySelectorAll(".mfga-header-menu-item")].map((i) => i.textContent));
    assert.deepEqual(items, ["Edit Friends", "Account Settings", "Privacy Settings", "MFGA Settings…", "Help Center", "Log Out"]);
    save("account-menu.png", await page.screenshot({ clip: { x: 700, y: 0, width: 580, height: 220 } }));
    assert.match(await hitOwner(page, 1050, 60), /^shell:/, "the menu paints above Facebook's page");
    await page.mouse.click(700, 500);
    assert.equal(await page.isHidden(".mfga-header-menu"), true);
    await page.click(".mfga-header-account-btn");
    await page.keyboard.press("Escape");
    assert.equal(await page.isHidden(".mfga-header-menu"), true);
    await page.click(".mfga-header-account-btn");
    await page.click("text=MFGA Settings…");
    assert.equal(await page.evaluate(() => __mfga.state.settingsOpened), 1);
    await page.click(".mfga-header-account-btn");
    await page.click("text=Privacy Settings");
    assert.deepEqual(await page.evaluate(() => __mfga.state.navCalls), ["/settings/?tab=privacy"]);
  });

  it("Log Out reveals Facebook's own account menu and hides its banner again afterwards", async () => {
    const page = await openShell({ cfg: { helper: true } });
    await page.click(".mfga-header-account-btn");
    await page.click("text=Log Out");
    const shown = await page.evaluate(() => ({
      attr: document.documentElement.hasAttribute("data-mfga-native-banner"),
      banner: getComputedStyle(document.querySelector('[role="banner"]')).visibility,
      menu: !document.getElementById("fx-account-menu").hidden,
    }));
    assert.deepEqual(shown, { attr: true, banner: "visible", menu: true });
    save("logout-native-menu.png", await page.screenshot({ clip: { x: 700, y: 0, width: 580, height: 260 } }));
    await page.click("#fx-logout");
    assert.equal(await page.evaluate(() => __fb.logout), 1, "Facebook's own Log out is reachable");
    await page.mouse.click(400, 600);
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute("data-mfga-native-banner")), false);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[role="banner"]')).visibility), "hidden");
  });

  it("Log Out without Facebook's account button goes to the settings page", async () => {
    const page = await openShell({ cfg: { helper: true }, html: FIXTURE.replace('aria-label="Account Controls and Settings"', 'aria-label="x"').replace(/<div><div role="button" aria-label="Your profile"[\s\S]*?<\/svg><\/div><\/div>/, "") });
    await page.evaluate(() => document.querySelectorAll('[role="banner"] [role="button"]').forEach((b) => b.setAttribute("tabindex", "-1")));
    await page.click(".mfga-header-account-btn");
    await page.click("text=Log Out");
    assert.deepEqual(await page.evaluate(() => __mfga.state.navCalls), ["/settings/"]);
  });

  it("More ▾ reveals the extra apps", async () => {
    const page = await openShell();
    await page.click(".mfga-nav-more");
    const keys = await page.evaluate(() => [...document.querySelectorAll(".mfga-shell-left .mfga-nav-item[data-key]")].map((i) => i.dataset.key));
    assert.deepEqual(keys.slice(5), ["apps", "games", "pages", "groups", "saved", "video", "marketplace"]);
  });

  it("honours look.rightColumn, look.chat and look.fixedHeader", async () => {
    const page = await openShell({ cfg: { look: { rightColumn: false, chat: false, fixedHeader: true } } });
    const s = await page.evaluate(() => ({
      right: getComputedStyle(document.querySelector(".mfga-shell-right")).display,
      chat: getComputedStyle(document.querySelector(".mfga-chat-tab")).display,
      chatNav: !!document.querySelector(".mfga-nav-chat"),
      header: getComputedStyle(document.querySelector(".mfga-header")).position,
      attr: document.documentElement.hasAttribute("data-mfga-fixed-header"),
    }));
    assert.deepEqual(s, { right: "none", chat: "none", chatNav: false, header: "fixed", attr: true });
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(100);
    assert.match(await hitOwner(page, 1100, 20), /^shell:/, "the fixed bar stays above the scrolled page");
  });

  it("keeps the fixed bar below Facebook's dialogs as they open and close, in the same frame", async () => {
    const page = await openShell({ cfg: { look: { fixedHeader: true } } });
    // The fixture keeps a hidden composer portal in the page; start from a page without dialogs.
    await page.evaluate(() => document.getElementById("fx-portal").parentElement.remove());
    await page.waitForFunction(() => !document.documentElement.hasAttribute("data-mfga-dialog"));
    const z = () => getComputedStyle(document.querySelector("#mfga-shell .mfga-header")).zIndex;
    assert.equal(await page.evaluate(z), "1");
    const seen = await page.evaluate(async (zSrc) => {
      const zIndex = new Function(`return (${zSrc})()`);
      const portal = document.createElement("div");
      const dialog = portal.appendChild(document.createElement("div"));
      dialog.setAttribute("role", "dialog");
      dialog.textContent = "Photo";
      document.body.appendChild(portal);
      await Promise.resolve(); // mutation observers run before this continuation, long before the next frame
      const open = zIndex();
      // Feed churn without dialogs leaves the mark alone.
      document.querySelector('[role="main"]').appendChild(document.createElement("div"));
      await Promise.resolve();
      const churn = zIndex();
      portal.remove();
      await Promise.resolve();
      return { open, churn, closed: zIndex() };
    }, z.toString());
    assert.deepEqual(seen, { open: "0", churn: "0", closed: "1" });
  });

  it("tears down cleanly when the shell is switched off", async () => {
    const page = await openShell();
    await page.evaluate(() => {
      __mfga.layout.destroy();
      __mfga.shell.destroy();
    });
    const left = await page.evaluate(() => ({
      attrs: [...document.documentElement.attributes].map((a) => a.name).filter((n) => n.startsWith("data-mfga")),
      marks: document.querySelectorAll("[data-mfga-main],[data-mfga-pass],[data-mfga-chrome]").length,
      host: !!document.getElementById("mfga-shell"),
      banner: getComputedStyle(document.querySelector('[role="banner"]')).visibility,
    }));
    assert.deepEqual(left, { attrs: [], marks: 0, host: false, banner: "visible" });
  });
});
