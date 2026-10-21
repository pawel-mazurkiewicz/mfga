// The fake facebook.com page runtime (served from static.xx.fbcdn.net). It stands in for the parts of Comet
// that MFGA interacts with:
//  - the module system: __d / require / requireLazy, ServerJSPayloadListener defining config modules
//    (SiteData, LSD, DTSGInitData, CurrentUserInitialData …) from the inline data-sjs frames, window.Env
//  - the router: native anchor clicks inside the React root and pushState + popstate without a known
//    state key navigate in place (dom-chrome §7.2), re-rendering the mount root from the server's HTML
//  - jewel dropdowns rendered inside [role=banner] and the composer dialog portalled to <body>
//  - aria-labelledby label nodes that disappear after mount, and infinite scroll of the native feed
(function () {
  "use strict";
  const modules = new Map();
  const waiting = [];

  function define(name, factory) {
    modules.set(name, { factory, done: false, exports: undefined });
    flushLazy();
  }
  function __d(name, deps, factory) {
    define(name, factory);
  }
  function require(name) {
    const m = modules.get(name);
    if (!m) throw new Error(`Requiring unknown module "${name}"`);
    if (!m.done) {
      const module = { exports: {} };
      m.done = true;
      m.factory(window, require, require, requireLazy, module, module.exports);
      m.exports = module.exports;
    }
    return m.exports;
  }
  function requireLazy(names, cb) {
    waiting.push({ names, cb });
    flushLazy();
  }
  function flushLazy() {
    for (let i = 0; i < waiting.length; i++) {
      const w = waiting[i];
      if (!w.names.every((n) => modules.has(n))) continue;
      waiting.splice(i--, 1);
      w.cb(...w.names.map(require));
    }
  }

  const isConfigFrame = (v) => Array.isArray(v) && v.length === 4 && typeof v[0] === "string" && Array.isArray(v[1]) && v[2] && typeof v[2] === "object" && typeof v[3] === "number";

  /** Defines every ["Name",[],{…},id] config frame found in a decoded data-sjs block. */
  function defineConfigs(node, depth = 0) {
    if (!node || typeof node !== "object" || depth > 12) return;
    if (isConfigFrame(node)) {
      if (!modules.has(node[0])) define(node[0], (g, r, rd, rl, module) => (module.exports = node[2]));
      return;
    }
    for (const v of Array.isArray(node) ? node : Object.values(node)) defineConfigs(v, depth + 1);
  }

  const processed = new WeakSet();
  define("ServerJSPayloadListener", (g, r, rd, rl, module) => {
    module.exports = {
      process() {
        for (const s of document.querySelectorAll('script[type="application/json"][data-sjs]')) {
          if (processed.has(s)) continue;
          processed.add(s);
          try {
            defineConfigs(JSON.parse(s.textContent));
          } catch (e) {
            // a malformed frame is skipped, like Facebook's listener does
          }
        }
      },
    };
  });

  window.__d = __d;
  window.require = require;
  window.requireLazy = requireLazy;
  const env = document.getElementById("envjson");
  window.Env = env ? JSON.parse(env.textContent) : {};

  // ---- router -------------------------------------------------------------------------------------------
  const knownKeys = new Set();
  const root = () => document.querySelector('div[id^="mount_0_0"]');

  function newKey() {
    const key = `state-key-${Date.now()}-${knownKeys.size}`;
    knownKeys.add(key);
    return key;
  }

  // ---- push views -----------------------------------------------------------------------------------------
  // A photo opened from Home is a "push view": the URL changes, a full-viewport dialog is layered over the
  // page and the page underneath stays mounted (scroll position included); Back closes the dialog without
  // re-rendering. Comet loads the viewer first, so the dialog appears a moment after the URL changes; likewise a
  // link out of the viewer changes the URL at once and the viewer stays up until the next page is in place.
  const PUSH_VIEW_PATH = /^\/photo(\/|\.php|$)/;
  const PUSH_VIEW_DELAY_MS = 350;
  const HOME_PATHS = new Set(["/", "/home.php"]);
  const here = () => location.pathname + location.search;
  let rendered = here(); // the URL the mounted page belongs to
  let pushView = null;
  let pushTimer = 0;

  function openPushView() {
    closePushView();
    const url = here();
    pushTimer = setTimeout(() => {
      if (here() !== url || !root()) return;
      pushView = document.createElement("div");
      pushView.setAttribute("role", "dialog");
      pushView.setAttribute("aria-label", "Photo viewer");
      pushView.dataset.fakePushView = "";
      pushView.style.cssText = "position:fixed;inset:0;z-index:5;background:#000;color:#fff";
      const close = document.createElement("div");
      close.setAttribute("role", "button");
      close.setAttribute("aria-label", "Close");
      close.textContent = "×";
      close.addEventListener("click", () => history.back());
      // A link out of the viewer (the photo's album, its owner): an ordinary in-app navigation.
      const out = document.createElement("a");
      out.href = "/photos/";
      out.textContent = "Photos";
      pushView.append(close, out);
      root().appendChild(pushView);
    }, PUSH_VIEW_DELAY_MS);
  }

  function closePushView() {
    clearTimeout(pushTimer);
    pushTimer = 0;
    if (pushView) pushView.remove();
    pushView = null;
  }

  /** Handles a URL change as a push view (open or close) when it is one; false for a normal navigation. */
  function pushViewNavigation() {
    if (PUSH_VIEW_PATH.test(location.pathname) && HOME_PATHS.has(new URL(rendered, location.href).pathname)) {
      openPushView();
      return true;
    }
    if ((pushView || pushTimer) && here() === rendered) {
      closePushView();
      return true;
    }
    // Anywhere else (a link out of the viewer): a viewer on screen stays up until the next page is ready.
    clearTimeout(pushTimer);
    pushTimer = 0;
    return false;
  }

  let renders = 0;
  /** Re-renders the root for the current URL; a navigation that started later wins over a slower earlier one. */
  async function render() {
    const id = ++renders;
    rendered = here();
    const res = await fetch(location.pathname + location.search, { credentials: "include" });
    const html = await res.text();
    if (id !== renders) return;
    const doc = new DOMParser().parseFromString(html, "text/html");
    const fresh = doc.querySelector('div[id^="mount_0_0"]');
    if (!fresh) return;
    closePushView();
    root().replaceChildren(...[...fresh.childNodes].map((n) => document.importNode(n, true)));
    document.title = doc.title;
    for (const s of doc.querySelectorAll('script[type="application/json"][data-sjs]')) document.body.appendChild(document.importNode(s, true));
    for (const t of document.querySelectorAll("body > template[data-portal]")) t.remove();
    for (const t of doc.querySelectorAll("body > template")) document.body.appendChild(document.importNode(t, true));
    require("ServerJSPayloadListener").process();
    window.scrollTo(0, 0);
    mount();
  }

  function go(url) {
    history.pushState({ key: newKey() }, "", url);
    if (!pushViewNavigation()) render();
  }

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || !root() || !root().contains(a) || a.target === "_blank") return;
    if (a.getAttribute("href") === "#") return e.preventDefault();
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin) return;
    e.preventDefault();
    go(u.pathname + u.search);
  });

  window.addEventListener("popstate", () => {
    const key = history.state && history.state.key;
    if (!key || !knownKeys.has(key)) history.replaceState({ key: newKey() }, "", location.href);
    if (!pushViewNavigation()) render();
  });

  // ---- layers ---------------------------------------------------------------------------------------------
  function toggleDropdown(button) {
    const nav = button.closest('[role="navigation"]');
    const buttons = [...nav.querySelectorAll('[role="button"][aria-haspopup]')];
    const layerRoot = nav.nextElementSibling;
    const template = layerRoot.querySelectorAll(":scope > template")[buttons.indexOf(button)];
    const open = layerRoot.querySelector(':scope > [role="dialog"]');
    for (const b of buttons) b.setAttribute("aria-expanded", "false");
    if (open) open.remove();
    if (!template || (open && open.dataset.owner === String(buttons.indexOf(button)))) return;
    const dialog = document.importNode(template.content, true).firstElementChild;
    dialog.dataset.owner = String(buttons.indexOf(button));
    layerRoot.appendChild(dialog);
    button.setAttribute("aria-expanded", "true");
  }

  let composerPortal = null;
  /** The composer opens as a portal at the end of <body> (dom-chrome §5.2, §7.4). */
  function openComposer(template) {
    if (composerPortal && composerPortal.isConnected) return;
    composerPortal = document.importNode(template.content, true).firstElementChild;
    document.body.appendChild(composerPortal);
    composerPortal.querySelector('[role="textbox"]').focus();
  }

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t.closest) return;
    const jewel = t.closest('[role="banner"] [role="navigation"] [role="button"][aria-haspopup="dialog"]');
    if (jewel) return toggleDropdown(jewel);
    if (composerPortal && t.closest('[role="dialog"] [role="button"]') && composerPortal.contains(t)) {
      composerPortal.remove();
      return;
    }
    const template = document.querySelector("body > template[data-portal]");
    const region = t.closest('[role="region"]');
    if (template && region && region.getAttribute("aria-label") === template.dataset.region && t.closest('[role="button"]')) openComposer(template);
  });

  // ---- mount-time behaviour -----------------------------------------------------------------------------
  /** Facebook removes aria-labelledby label nodes right after mount (dom-feed §4.1.5). */
  function dropEphemeralLabels(scope) {
    requestAnimationFrame(() => {
      for (const span of scope.querySelectorAll("span[aria-labelledby]")) {
        const target = document.getElementById(span.getAttribute("aria-labelledby"));
        if (target && target.style.display === "none") target.remove();
      }
    });
  }

  let scrollObserver = null;
  /** Appends the next batch of feed slots (kept in <template>s after the list) when the skeleton shows. */
  function infiniteScroll() {
    if (scrollObserver) scrollObserver.disconnect();
    const templates = [...document.querySelectorAll("template")].filter((t) => t.content.querySelector("[aria-posinset]"));
    if (!templates.length) return;
    const list = templates[0].previousElementSibling;
    scrollObserver = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        const next = templates.shift();
        const skeleton = list.lastElementChild;
        if (!next) {
          scrollObserver.disconnect();
          skeleton.remove();
          return;
        }
        const batch = document.importNode(next.content, true);
        list.insertBefore(batch, skeleton);
        next.remove();
        dropEphemeralLabels(list);
        scrollObserver.unobserve(skeleton);
        scrollObserver.observe(skeleton);
      },
      { rootMargin: "600px 0px" },
    );
    scrollObserver.observe(list.lastElementChild);
  }

  function mount() {
    dropEphemeralLabels(document);
    infiniteScroll();
  }

  const boot = () => {
    const key = history.state && history.state.key;
    if (!key) history.replaceState({ key: newKey() }, "", location.href);
    else knownKeys.add(key);
    mount();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
