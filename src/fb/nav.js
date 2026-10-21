// Navigation that keeps Facebook's single-page app alive (dom-chrome §7.2), in order of preference:
//   1. the MAIN-world helper (history.pushState + popstate, which Comet's router follows),
//   2. a click on a native Facebook anchor with the same pathname+search (Facebook's own handler runs),
//   3. a full page load.
import { safe, health } from "../shared/util.js";
import { routeKey } from "./routes.js";

const HELPER_WAIT_MS = 1500;

function normPath(pathname) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/** True when two URLs point at the same Facebook route (origin, pathname and query; trailing slash ignored). */
export function samePlace(a, b) {
  return a.origin === b.origin && normPath(a.pathname) === normPath(b.pathname) && a.search === b.search;
}

function facebookRoot(doc) {
  return doc.querySelector('body > div[id^="mount_"]') || doc.querySelector('div[id^="mount_"]');
}

/** A native anchor inside Facebook's React root that leads to `target`, or null. */
export function findNativeAnchor(target, doc = document) {
  const root = facebookRoot(doc);
  if (!root) return null;
  for (const a of root.querySelectorAll("a[href]")) {
    if (a.target && a.target !== "_self") continue;
    let u;
    try {
      u = new URL(a.getAttribute("href"), doc.baseURI);
    } catch {
      continue;
    }
    if (samePlace(u, target)) return a;
  }
  return null;
}

export function createNavigator({ platform } = {}) {
  const assign = (url) => {
    health.count("nav.assign");
    location.assign(url.href);
  };

  const clickNative = (url) => {
    const a = findNativeAnchor(url);
    if (!a) return false;
    health.count("nav.native-anchor");
    a.click();
    return true;
  };

  const viaHelper = async (url) => {
    const target = url.pathname + url.search + url.hash;
    const timeout = new Promise((resolve) => setTimeout(() => resolve(false), HELPER_WAIT_MS));
    const ok = await Promise.race([platform.page.navigate(target).catch(() => false), timeout]);
    if (ok || routeKey() === url.pathname + url.search) {
      health.count("nav.helper");
      return;
    }
    if (!clickNative(url)) assign(url);
  };

  const go = safe("nav", (href, { hard = false } = {}) => {
    const url = new URL(href, location.href);
    if (hard || url.origin !== location.origin) return assign(url);
    if (typeof platform?.page?.navigate === "function") return void viaHelper(url);
    if (!clickNative(url)) assign(url);
  }, { disableOnError: false });

  return { go };
}
