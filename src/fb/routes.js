// Route classification for the 2010 shell (ARCHITECTURE §5) and URL-change detection.
//   home        "/", "/home.php", "/?filter=…&sk=h_chr", "/?sk=…"   full three-column 2010 page
//   groups-feed "/groups/feed/"                                       left nav + Facebook's own feed
//   page        everything else                                       2010 header + footer only

const HOME_PATHS = new Set(["/", "/home.php"]);
const GROUPS_FEED = /^\/groups\/feed\/?$/;

/** Accepts a Location, URL, {pathname, search} or URL string. */
function toUrl(loc) {
  if (typeof loc === "string") return new URL(loc, "https://www.facebook.com/");
  return { pathname: loc?.pathname || "/", search: loc?.search || "" };
}

/** @returns {{mode: "home"|"groups-feed"|"page", filter: string|null, sk: string|null, path: string}} */
export function classifyRoute(loc = location) {
  const { pathname, search } = toUrl(loc);
  const path = pathname.replace(/\/{2,}/g, "/") || "/";
  const params = new URLSearchParams(search);
  let mode = "page";
  if (HOME_PATHS.has(path)) mode = "home";
  else if (GROUPS_FEED.test(path)) mode = "groups-feed";
  return { mode, filter: params.get("filter") || null, sk: params.get("sk") || null, path };
}

/** The part of a URL that identifies a route (the hash is not part of it). */
export function routeKey(loc = location) {
  const { pathname, search } = toUrl(loc);
  return pathname + search;
}

/** Calls cb(route, prevRoute) whenever the URL's path or query changes. Returns an unsubscribe function. */
export function onRouteChange(cb, { interval = 250 } = {}) {
  let key = routeKey();
  let route = classifyRoute();
  const check = () => {
    const next = routeKey();
    if (next === key) return;
    const prev = route;
    key = next;
    route = classifyRoute();
    cb(route, prev);
  };
  const timer = setInterval(check, interval);
  addEventListener("popstate", check);
  return () => {
    clearInterval(timer);
    removeEventListener("popstate", check);
  };
}

/**
 * Layout mode to apply. Opening a photo or a post over the feed changes the URL while Facebook keeps the
 * home column mounted underneath (a "push view" dialog); keeping the previous 3-column layout until that
 * dialog closes avoids tearing the page apart and rebuilding it a second later.
 */
export function effectiveMode(route, prevMode, pushViewOpen) {
  if (route.mode === "page" && pushViewOpen && (prevMode === "home" || prevMode === "groups-feed")) return prevMode;
  return route.mode;
}
