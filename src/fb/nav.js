// Navigation that keeps Facebook's single-page app alive (dom-chrome §7.2), in order of preference:
//   1. the MAIN-world helper (history.pushState + popstate, which Comet's router follows),
//   2. a click on a native Facebook anchor with the same pathname+search (Facebook's own handler runs),
//   3. a full page load.
import { safe, health } from "../shared/util.js";
import { routeKey } from "./routes.js";
import { mountRoot } from "./layout.js";

const HELPER_WAIT_MS = 1500;
// Hosts that serve the same desktop app; the shell's links are written for www.facebook.com.
const APP_HOSTS = new Set(["www.facebook.com", "web.facebook.com", "facebook.com"]);

function normPath(pathname) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/** True when two URLs point at the same Facebook route (origin, pathname and query; trailing slash ignored). */
export function samePlace(a, b) {
  return a.origin === b.origin && normPath(a.pathname) === normPath(b.pathname) && a.search === b.search;
}

/**
 * Resolves `href` for navigation from `current` (a Location or URL): null unless http(s); a link to another
 * host of the same app (www ↔ web.facebook.com) is moved onto the current host so it stays in the SPA.
 */
export function resolveTarget(href, current) {
  let url;
  try {
    url = new URL(href, current.href);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.host !== current.host && APP_HOSTS.has(url.host) && APP_HOSTS.has(current.host)) {
    url.protocol = current.protocol;
    url.host = current.host;
  }
  return url;
}

/** A native anchor inside Facebook's React root that leads to `target`, or null. Never one of MFGA's own. */
export function findNativeAnchor(target, doc = document) {
  const root = mountRoot(doc);
  if (!root) return null;
  for (const a of root.querySelectorAll("a[href]")) {
    // MFGA UI inside Facebook's root (#mfga-stream) is not React's: clicking it would come straight back here.
    if ((a.target && a.target !== "_self") || a.closest(".mfga-ui")) continue;
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
    const url = resolveTarget(href, location);
    if (!url) return health.count("nav.refused");
    if (hard || url.origin !== location.origin) return assign(url);
    if (typeof platform?.page?.navigate === "function") return viaHelper(url);
    if (!clickNative(url)) assign(url);
  }, { disableOnError: false });

  return { go };
}
