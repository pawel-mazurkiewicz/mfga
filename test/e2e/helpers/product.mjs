// Loads the finished MFGA product into the fake site: the userscript (dist/mfga.user.js) through an init script
// with a Tampermonkey-like GM_* shim, or the unpacked Chrome extension (dist/chrome).
//
//   const p = await launchProduct("userscript", { locale: "en" });
//   const page = await p.open("/");      // p.site.mock.log, p.site.world …
//   await p.close();

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROOT, launchBrowser } from "./browser.mjs";
import { installSite } from "./site.mjs";

/** Build outputs (overridable with MFGA_USERSCRIPT / MFGA_EXTENSION to test another build). */
export const DIST = Object.freeze({
  userscript: process.env.MFGA_USERSCRIPT || path.join(ROOT, "dist/mfga.user.js"),
  extension: process.env.MFGA_EXTENSION || path.join(ROOT, "dist/chrome"),
});
export const hasUserscript = () => existsSync(DIST.userscript);
export const hasExtension = () => existsSync(path.join(DIST.extension, "manifest.json"));

/**
 * Tampermonkey-like GM_* / GM.* shim (@sandbox raw: the script runs in the page world). Values live in
 * localStorage under a private prefix, so like a manager's store they survive reloads and navigations within
 * the browser context; GM_addValueChangeListener also fires for other tabs' changes (remote=true).
 */
export function gmShim({ name = "MFGA", version = "0.0.0" } = {}) {
  return `(() => {
  const PREFIX = "__gm_store__:";
  const decode = (raw) => (raw == null ? undefined : JSON.parse(raw));
  const listeners = new Map();
  let nextId = 1;
  const notify = (key, oldValue, newValue, remote) => { for (const l of listeners.values()) if (l.key === key) l.cb(key, oldValue, newValue, remote); };
  const GM_getValue = (key, def) => { const v = decode(localStorage.getItem(PREFIX + key)); return v === undefined ? def : v; };
  const GM_setValue = (key, value) => { const old = GM_getValue(key); localStorage.setItem(PREFIX + key, JSON.stringify(value)); notify(key, old, value, false); };
  const GM_deleteValue = (key) => { const old = GM_getValue(key); localStorage.removeItem(PREFIX + key); notify(key, old, undefined, false); };
  const GM_listValues = () => Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).map((k) => k.slice(PREFIX.length));
  const GM_addValueChangeListener = (key, cb) => { const id = nextId++; listeners.set(id, { key, cb }); return id; };
  const GM_removeValueChangeListener = (id) => listeners.delete(id);
  addEventListener("storage", (e) => { if (e.key && e.key.startsWith(PREFIX)) notify(e.key.slice(PREFIX.length), decode(e.oldValue), decode(e.newValue), true); });
  const menu = [];
  const GM_registerMenuCommand = (label, fn) => menu.push({ label, fn });
  const GM_addElement = (...args) => {
    const [parent, tag, attrs = {}] = typeof args[0] === "string" ? [null, ...args] : args;
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (k === "textContent") el.textContent = v; else el.setAttribute(k, v);
    (parent || document.head || document.documentElement).appendChild(el);
    return el;
  };
  const GM_addStyle = (css) => GM_addElement("style", { textContent: css });
  const GM_info = { script: { name: ${JSON.stringify(name)}, version: ${JSON.stringify(version)}, namespace: "mfga" }, scriptHandler: "Tampermonkey", version: "5.3.3", sandboxMode: "raw", injectInto: "page" };
  const GM = { info: GM_info, getValue: async (k, d) => GM_getValue(k, d), setValue: async (k, v) => GM_setValue(k, v), deleteValue: async (k) => GM_deleteValue(k), listValues: async () => GM_listValues(), registerMenuCommand: GM_registerMenuCommand, addElement: GM_addElement, addStyle: GM_addStyle };
  Object.assign(globalThis, { GM, GM_info, GM_getValue, GM_setValue, GM_deleteValue, GM_listValues, GM_addValueChangeListener, GM_removeValueChangeListener, GM_registerMenuCommand, GM_addElement, GM_addStyle, unsafeWindow: globalThis, __gmMenu: menu });
})();`;
}

/**
 * Init-script source running a userscript in top-level facebook.com frames only (@noframes).
 * timing "document-element" (default) starts it once <html> exists, like Chrome's document_start for
 * extensions and userscript managers; "earliest" starts it before <html> exists, the earliest a manager
 * can inject (MFGA must cope: ARCHITECTURE / util.onRoot).
 */
export function userscriptInit(source, { timing = "document-element", ...opts } = {}) {
  const run = `const __run = () => {\n${source}\n};`;
  const start = timing === "earliest" ? "__run();" : `if (document.documentElement) __run(); else new MutationObserver((_, mo) => { if (document.documentElement) { mo.disconnect(); __run(); } }).observe(document, { childList: true });`;
  return `if (window.top === window && location.hostname === "www.facebook.com") {\n${gmShim(opts)}\n${run}\n${start}\n}`;
}

/**
 * launchProduct("userscript" | "extension", siteOpts, { viewport, timing }) -> { b, site, open(path), close() }.
 * siteOpts go to installSite (locale, now, fetchSize, delayMs, …); timing is the userscript start (see
 * userscriptInit).
 */
export async function launchProduct(target, siteOpts = {}, { viewport, timing } = {}) {
  const b = await launchBrowser(target === "extension" ? { extensionPath: DIST.extension, viewport } : { viewport });
  const site = await installSite(b, siteOpts);
  if (target === "userscript") await b.context.addInitScript({ content: userscriptInit(readFileSync(DIST.userscript, "utf8"), { timing }) });
  return {
    b,
    site,
    open: (p = "/") => b.newPage({ url: site.url(p) }),
    close: () => b.close(),
  };
}
