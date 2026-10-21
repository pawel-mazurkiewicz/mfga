// MFGA boot: the only module that wires the others together (ARCHITECTURE §2).
//
// Order matters at document_start:
//   1. the inline-data harvester starts before Facebook's scripts are parsed,
//   2. the 2010 stylesheet is painted with defaults immediately (no flash of 2026 Facebook),
//   3. settings load, then the route loop drives the shell, the cleaner, the skin and our News Feed.
import { createSettings, DEFAULTS, sanitize } from "./shared/settings.js";
import { registerStrings, setLocale, t } from "./shared/i18n.js";
import { health, onBody, onRoot, safe, setDebug, warn } from "./shared/util.js";
import { iconCss } from "./ui/icons.js";
import { baseCss } from "./ui/css/base.js";
import { themeCss } from "./ui/css/theme.js";
import { nativeCss } from "./ui/css/native.js";
import { shellCss } from "./ui/css/shell.js";
import { streamCss } from "./ui/css/stream.js";
import { dialogCss } from "./ui/dialog/dialog.js";
import { startHarvest } from "./data/harvest.js";
import { createGqlClient } from "./data/gql.js";
import { createOpRegistry } from "./data/ops.js";
import { createClassifier } from "./data/classify.js";
import { createFeedSource, FEED_QUERY, FEED_STYLES } from "./data/feed-source.js";
import { createMergedFeed } from "./data/merge.js";
import { createActions } from "./data/actions.js";
import { classifyRoute, onRouteChange } from "./fb/routes.js";
import { createNavigator } from "./fb/nav.js";
import { createChromeReader } from "./fb/chrome-reader.js";
import { createLayout, findMain } from "./fb/layout.js";
import { startCleaner } from "./fb/cleaner.js";
import { startSkin } from "./fb/skin.js";
import { createShell } from "./ui/shell/shell.js";
import { createFeedView } from "./ui/stream/feed-view.js";
import { hiddenCounts } from "./ui/stream/format.js";
import { openSettingsDialog } from "./ui/dialog/settings-dialog.js";

const STYLE_ID = "mfga-style";
const FEED_SOURCES = ["friends", "groups", "pages", "favorites"];
// At least a second (1-1.5 s, jittered) between our requests, one at a time: Facebook's own page load
// is far busier. Everything after the first page is user-paced ("Older Posts" or scrolling to the end).
const REQUEST_GAP_MS = 1000;
const LAST_SEEN_KEY = "mfga:lastSeen";
const COMPOSER_SELECTORS = ['[role="region"][aria-label="Create a post"] [role="button"]', '[role="region"][aria-label="Utwórz post"] [role="button"]'];

registerStrings({
  en: {
    "main.menu": "MFGA settings",
    "main.turnOff": "Turn MFGA off (back to 2026 Facebook)",
    "main.turnOn": "Turn MFGA on",
    "main.halted": "MFGA paused its own requests because Facebook asked to verify your account. Facebook itself is unaffected.",
  },
  pl: {
    "main.menu": "Ustawienia MFGA",
    "main.turnOff": "Wyłącz MFGA (powrót do Facebooka 2026)",
    "main.turnOn": "Włącz MFGA",
    "main.halted": "MFGA wstrzymało własne zapytania, bo Facebook poprosił o weryfikację konta. Sam Facebook działa normalnie.",
  },
});

/** Every stylesheet MFGA needs, scoped by the html[data-mfga-*] attributes set below. */
function buildCss(settings) {
  // baseCss first: its resets are low-specificity and every area's rules must come after them.
  return [
    baseCss(settings),
    dialogCss(),
    iconCss(),
    themeCss(settings),
    nativeCss(settings),
    shellCss(settings),
    streamCss(settings),
    // Our News Feed replaces Facebook's home column; "pending" keeps Facebook's column invisible (but laid
    // out) while we decide, so there is no flash of the 2026 feed.
    'html[data-mfga-feed="ours"] [data-mfga-main]>:not(#mfga-stream){display:none!important}',
    'html[data-mfga-feed="pending"] [data-mfga-main]>:not(#mfga-stream){visibility:hidden!important}',
    'html:not([data-mfga-feed="ours"]) #mfga-stream{display:none!important}',
  ].join("\n");
}

// Facebook forces its media viewers dark by putting the class on <html>; leave those routes alone.
const MEDIA_ROUTE = /^\/(photo|photos|reel|reels|stories|watch|video|videos)(\/|\.php|$)/;

/** html[data-mfga*] state that is not owned by the layout (which sets shell/route/fixed-header). */
function applyRootAttributes(s) {
  const html = document.documentElement;
  if (!html) return;
  html.toggleAttribute("data-mfga", !!s.enabled);
  html.toggleAttribute("data-mfga-theme", !!(s.enabled && s.look.theme && !MEDIA_ROUTE.test(location.pathname)));
  html.toggleAttribute("data-mfga-skin", !!(s.enabled && s.look.skinPosts));
  html.setAttribute("data-mfga-font", s.look.font);
}

function paint(style, s) {
  applyRootAttributes(s);
  style.textContent = s.enabled ? buildCss(s) : "";
  if (!style.isConnected) (document.head || document.documentElement).appendChild(style);
}

/** "Ad" and "suggestion" totals for the right column, from our feed and Facebook's cleaned feeds. */
function removalStats(feed, cleaner) {
  const fromFeed = hiddenCounts(feed?.stats?.() ?? {});
  const reasons = cleaner?.stats?.()?.reasons ?? {};
  let nativeAds = 0;
  let nativeSuggested = 0;
  for (const [reason, n] of Object.entries(reasons)) {
    if (reason === "sponsored") nativeAds += n;
    else nativeSuggested += n;
  }
  return { ads: fromFeed.ads + nativeAds, suggested: fromFeed.suggested + nativeSuggested };
}

export async function boot(platform) {
  // 1. Inline data first: the SSR blocks are parsed as they stream in.
  const harvest = safe("harvest", () => startHarvest())() || null;

  // 2. The 2010 look with default settings, before Facebook paints anything.
  const style = document.createElement("style");
  style.id = STYLE_ID;
  onRoot(safe("paint", () => paint(style, sanitize({}))));

  // 3. Settings.
  let settings;
  try {
    settings = await createSettings(platform);
  } catch (err) {
    warn("settings unavailable, using defaults", err);
    settings = await createSettings({ ...platform, storage: { get: async () => undefined, set: async () => {}, onChange() {} } });
  }
  const s0 = settings.get();
  setDebug(s0.advanced.debug);
  // "auto" reads <html lang>, which may not exist yet at document_start: resolve again once it does.
  setLocale(s0.language);
  onRoot(
    safe("paint", () => {
      setLocale(settings.get().language);
      paint(style, settings.get());
    }),
  );
  const lastSeen = Number(await platform.storage.get(LAST_SEEN_KEY).catch(() => 0)) || 0;
  health.fact("platform", { kind: platform.kind, version: platform.version, ...(platform.diagnostics || {}) });

  const app = createApp({ platform, settings, harvest, style, lastSeen });
  platform.addMenuCommand(t("main.menu"), () => app.openSettings());
  // The master switch has no control in the dialog; userscript managers get a menu entry for it.
  if (platform.kind === "userscript") {
    platform.addMenuCommand(t(s0.enabled ? "main.turnOff" : "main.turnOn"), async () => {
      await settings.update({ enabled: !settings.get().enabled });
      location.reload();
    });
  }
  settings.subscribe((next, prev) => app.onSettings(next, prev));
  if (!s0.enabled) return;
  onBody(safe("boot", () => app.start()));
}

function createApp({ platform, settings, harvest, style, lastSeen }) {
  const S = () => settings.get();
  let route = classifyRoute();
  let started = false;

  // Data layer (only usable when the harvester runs).
  const client = harvest
    ? createGqlClient({
        platform,
        harvest,
        minGapMs: REQUEST_GAP_MS,
        stopOnCheckpoint: S().advanced.stopOnCheckpoint,
        onHalt: (reason) => {
          // A checkpoint or account warning: stop our own requests and hand Home back to Facebook.
          health.fact("halted", reason);
          warn(t("main.halted"));
          feedDecided = false;
          syncFeed();
        },
        refreshTokens: async () => {
          harvest.refresh?.();
          const fresh = await platform.page?.readTokens?.().catch(() => null);
          if (fresh?.dtsg) harvest.tokens.dtsg = fresh.dtsg;
          if (fresh?.lsd) harvest.tokens.lsd = fresh.lsd;
        },
      })
    : null;
  const ops = harvest ? createOpRegistry({ platform, harvest }) : null;
  const actions = client ? createActions({ client, ops, harvest }) : null;
  let classifier = createClassifier({ hideAI: S().feed.hideAI });

  // Facebook's chrome and navigation.
  const navigator = createNavigator({ platform });
  const reader = createChromeReader({
    platform,
    identityHint: () => (harvest?.tokens?.userId ? { id: harvest.tokens.userId, name: harvest.tokens.name || null } : null),
  });
  const layout = createLayout({ settings });

  let shell = null;
  let cleaner = null;
  let skin = null;
  let feedView = null;
  let feedKey = null; // which feed the view shows: "recent|friends,groups" / "top" / "filter:friends"
  let currentFeed = null;
  let feedDecided = false;

  const openSettings = safe("settings-dialog", () =>
    openSettingsDialog({
      settings,
      version: platform.version,
      healthSnapshot: () => healthSnapshot(),
      exportReport: () => healthSnapshot(),
    }),
  );

  function healthSnapshot() {
    return {
      ...health.snapshot(),
      harvest: harvest?.snapshot?.() ?? null,
      ops: ops?.snapshot?.() ?? null,
      requests: client?.stats?.() ?? null,
      feed: currentFeed?.stats?.() ?? null,
      cleaner: cleaner?.stats?.() ?? null,
      route: route.mode,
      feedMode: document.documentElement.getAttribute("data-mfga-feed"),
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Our News Feed on the home route

  /** Sources for the current home URL: /?filter=X&sk=h_chr shows one Feeds-tab connection. */
  function feedSpec(r, s) {
    if (r.filter && FEED_STYLES[r.filter] && r.filter !== "top") return { mode: "recent", sources: [r.filter], key: `filter:${r.filter}` };
    if (s.feed.mode === "top" && !r.sk) return { mode: "top", sources: ["top"], key: "top" };
    const names = FEED_SOURCES.filter((n) => s.feed.sources[n]);
    const sources = names.length ? names : ["all"];
    return { mode: "recent", sources, key: `recent|${sources.join(",")}` };
  }

  function getFeed(mode, sources) {
    const s = S();
    const spec = feedSpec(route, s);
    const names = mode === "top" ? ["top"] : route.filter ? spec.sources : sources?.length ? sources : spec.sources;
    const scale = Math.max(2, Math.round(globalThis.devicePixelRatio || 1));
    const feed = createMergedFeed({
      sources: names.map((name) => createFeedSource({ name, client, ops, harvest, classifier, scale })),
      pageSize: s.feed.pageSize,
      keywords: s.feed.keywords,
    });
    // The right column's "ads removed" box should move as soon as a page of stories lands.
    const more = feed.more;
    feed.more = async (...args) => {
      try {
        return await more(...args);
      } finally {
        shell?.update?.({});
      }
    };
    currentFeed = feed;
    return feed;
  }

  function openComposer() {
    for (const sel of COMPOSER_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn) {
        btn.click();
        return;
      }
    }
    // Feeds-filter routes have no composer: go home, where Facebook renders one, and open it there.
    health.count("main.composer-miss");
    navigator.go("https://www.facebook.com/");
    let tries = 0;
    const timer = setInterval(() => {
      const btn = COMPOSER_SELECTORS.map((sel) => document.querySelector(sel)).find(Boolean);
      if (btn || ++tries > 20) {
        clearInterval(timer);
        btn?.click();
      }
    }, 250);
  }

  function me() {
    const id = reader.identity?.() || null;
    return id ? { name: id.name, avatar: id.avatar, url: id.url } : null;
  }

  function buildFeedView(spec) {
    feedView?.destroy?.();
    let seen = lastSeen;
    feedView = createFeedView({
      actions,
      settings,
      // A getter: the chrome reader may learn who you are after the view is built.
      get me() {
        return me();
      },
      // The 2010 count pill: stories newer than the previous visit (fixed for this view's lifetime).
      lastSeen,
      onSeen: (newest) => {
        if (!(newest > seen)) return;
        seen = newest;
        platform.storage.set(LAST_SEEN_KEY, newest).catch(() => {});
      },
      open: (url, opts) => (opts?.newTab ? window.open(url, "_blank", "noopener") : navigator.go(url)),
      now: () => Date.now(),
      getFeed,
      mode: spec.mode,
      onModeChange: (mode) => {
        settings.update({ feed: { mode } });
        if (route.filter || route.sk) navigator.go("https://www.facebook.com/");
      },
      openComposer,
      hiddenStats: () => currentFeed?.stats?.() ?? {},
      onDismissWelcome: () => settings.update({ state: { welcomeDismissed: true } }),
    });
    feedKey = spec.key;
  }

  /** Can we render this feed ourselves? Needs the home-feed query descriptor with its variables. */
  async function canUseOurFeed() {
    if (!client || !ops || client.halted) return false;
    if (!S().look.shell) return false;
    const op = await ops.get(FEED_QUERY).catch(() => null);
    return !!op?.variables;
  }

  const syncFeed = safe("feed", async () => {
    const html = document.documentElement;
    if (route.mode !== "home" || !S().enabled) {
      html.removeAttribute("data-mfga-feed");
      return;
    }
    if (!feedDecided) html.setAttribute("data-mfga-feed", "pending");
    await harvest?.ready?.catch?.(() => {});
    const ours = await canUseOurFeed();
    feedDecided = true;
    if (route.mode !== "home") return;
    if (!ours) {
      html.setAttribute("data-mfga-feed", "native");
      health.fact("feed", "native");
      return;
    }
    const spec = feedSpec(route, S());
    if (!feedView || feedKey !== spec.key) buildFeedView(spec);
    mountFeed();
    html.setAttribute("data-mfga-feed", "ours");
    health.fact("feed", "ours");
  });

  /** Keeps #mfga-stream as the first child of Facebook's main column (it is re-rendered on navigation). */
  function mountFeed() {
    if (!feedView) return;
    const main = findMain();
    if (!main) return;
    if (feedView.el.parentNode !== main || main.firstElementChild !== feedView.el) main.prepend(feedView.el);
  }

  // Facebook replaces the home column on SPA navigations and forced reloads: re-attach our stream.
  const remount = safe(
    "feed",
    () => {
      if (route.mode === "home" && document.documentElement.getAttribute("data-mfga-feed") === "ours") mountFeed();
    },
    { disableOnError: false },
  );

  // Remember the home-feed query descriptor so a later SPA visit to Home works without a full page load.
  const persistPreloader = safe(
    "ops",
    () => {
      const p = harvest?.preloaders?.get?.(FEED_QUERY);
      if (p?.queryID && p.variables) ops.learn(FEED_QUERY, p.queryID, p.variables, "preloader");
    },
    { disableOnError: false },
  );

  // ---------------------------------------------------------------------------------------------

  function onRoute(next) {
    route = next;
    applyRootAttributes(S());
    layout.apply(route);
    shell?.update?.({ route });
    cleaner?.setRoute?.(route);
    if (route.mode !== "home") {
      feedView?.el?.remove();
    }
    syncFeed();
  }

  function start() {
    if (started) return;
    started = true;
    setLocale(S().language);
    paint(style, S());
    const s = S();
    layout.apply(route);
    if (s.look.shell) {
      shell = safe("shell", () =>
        createShell({
          settings,
          reader,
          navigator,
          openSettings,
          stats: () => removalStats(currentFeed, cleaner),
          route,
        }),
      )();
    }
    cleaner = safe("cleaner", () => startCleaner({ settings, route }))();
    skin = safe("skin", () => startSkin({ settings }))();
    onRouteChange((next) => onRoute(next));
    harvest?.ready?.then?.(persistPreloader);
    persistPreloader();
    syncFeed();
    setInterval(remount, 1000);
  }

  function onSettings(next, prev) {
    setDebug(next.advanced.debug);
    // setLocale before painting: nativeCss() contains translated labels.
    if (next.language !== prev.language) setLocale(next.language);
    paint(style, next);
    if (next.language !== prev.language) shell?.update?.({});
    if (next.feed.hideAI !== prev.feed.hideAI) classifier = createClassifier({ hideAI: next.feed.hideAI });
    if (!next.enabled) {
      layout.apply(route);
      document.documentElement.removeAttribute("data-mfga-feed");
      return;
    }
    if (!started) return start();
    layout.apply(route);
    const feedChanged =
      JSON.stringify(next.feed) !== JSON.stringify(prev.feed) || next.look.shell !== prev.look.shell || next.language !== prev.language;
    if (feedChanged && route.mode === "home") {
      feedKey = null; // rebuild with the new sources / mode / keywords
      syncFeed();
    }
  }

  return { start, onSettings, openSettings };
}
