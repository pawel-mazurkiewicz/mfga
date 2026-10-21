// Foundation browser helper for MFGA tests (Playwright + the preinstalled Chromium).
//
//   const b = await launchBrowser();
//   const page = await b.newPage({ html: "<html lang=en><body></body></html>" });   // served at https://www.facebook.com/
//   await page.addScriptTag({ content: await bundle("test/e2e/entries/story-entry.js") });
//   ...
//   await b.close();
//
// Pages are served on https://www.facebook.com/ through request interception, so code that checks the
// origin behaves as on Facebook. Nothing touches the network: unrouted requests are aborted.

import { chromium } from "playwright-core";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const CHROMIUM = process.env.MFGA_CHROMIUM || "/opt/pw-browsers/chromium";

/** Bundles an ES module entry into an IIFE string (for page.addScriptTag / addInitScript). */
export async function bundle(entry, { define = {}, globalName } = {}) {
  const r = await build({
    entryPoints: [path.resolve(ROOT, entry)],
    bundle: true,
    format: "iife",
    globalName,
    write: false,
    target: ["chrome111", "firefox128"],
    define,
    logLevel: "silent",
  });
  return r.outputFiles[0].text;
}

/**
 * Launches Chromium. options.routes: [{ url: string|RegExp|fn, handler(route, request) }] extra routes,
 * checked before the default page route. options.extensionPath: load an unpacked extension (headed
 * "new headless" mode is used automatically).
 */
export async function launchBrowser({ extensionPath = null, viewport = { width: 1280, height: 900 } } = {}) {
  let browser = null;
  let context;
  if (extensionPath) {
    const userDataDir = path.join(ROOT, "test-results", `udd-${process.pid}-${Date.now()}`);
    context = await chromium.launchPersistentContext(userDataDir, {
      executablePath: CHROMIUM,
      headless: true,
      viewport,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, "--headless=new"],
    });
  } else {
    browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
    context = await browser.newContext({ viewport, locale: "en-US" });
  }

  const pages = new Map(); // pathname+search -> { html, status }
  const extraRoutes = [];

  await context.route("**/*", async (route, request) => {
    const url = new URL(request.url());
    for (const r of extraRoutes) {
      if (r.match(url, request)) return r.handler(route, request);
    }
    if (url.hostname === "www.facebook.com") {
      const key = url.pathname + url.search;
      const hit = pages.get(key) || pages.get(url.pathname) || pages.get("*");
      if (hit) {
        return route.fulfill({
          status: hit.status || 200,
          contentType: hit.contentType || "text/html; charset=utf-8",
          body: hit.body,
        });
      }
    }
    // Never intercept chrome-extension:, data:, blob: loads (extension scripts would break).
    if (!/^https?:$/.test(url.protocol)) return route.continue();
    return route.abort();
  });

  return {
    context,
    browser,
    /** Serve `body` at https://www.facebook.com<pathKey> ("*" = every unmatched path). */
    servePage(pathKey, body, { status = 200, contentType } = {}) {
      pages.set(pathKey, { body, status, contentType });
    },
    /** Add a route: match(url: URL, request) -> boolean. */
    route(match, handler) {
      extraRoutes.push({ match, handler });
    },
    async newPage({ html, url = "https://www.facebook.com/" } = {}) {
      if (html != null) pages.set(new URL(url).pathname + new URL(url).search, { body: html });
      const page = await context.newPage();
      page.on("pageerror", (err) => {
        (page.__errors ||= []).push(String(err && err.stack ? err.stack : err));
      });
      await page.goto(url, { waitUntil: "domcontentloaded" });
      return page;
    },
    async close() {
      await context.close();
      if (browser) await browser.close();
    },
  };
}
