// Places the 2010 shell around Facebook's page (ARCHITECTURE §5, dom-chrome §1.2/§9):
// root state on <html>, #mfga-shell inserted before Facebook's mount root, and on the column routes
// [role=main] clamped and moved into the 980px grid by a measured relative offset. Facebook nodes only ever
// get data-mfga-* marks; geometry goes through CSS variables in our own <style> element.
import { safe, health, rafBatch } from "../shared/util.js";
import { DEFAULTS } from "../shared/settings.js";
import { GRID, mainSlot } from "../ui/shell/grid.js";
import { effectiveMode } from "./routes.js";

export const HOST_ID = "mfga-shell";
const VARS_ID = "mfga-layout-vars";
const ENSURE_MS = 1000;

const hasColumns = (mode) => mode === "home" || mode === "groups-feed";

function readSettings(settings) {
  return (typeof settings?.get === "function" ? settings.get() : settings) || DEFAULTS;
}

/** Facebook's React root, or the <body> child that contains it. */
export function mountRoot(doc = document) {
  const root = doc.querySelector('body > div[id^="mount_"]') || doc.querySelector('div[id^="mount_"]');
  if (!root || !doc.body) return root;
  let el = root;
  while (el.parentElement && el.parentElement !== doc.body) el = el.parentElement;
  return el.parentElement === doc.body ? el : root;
}

function placeHost(host, doc) {
  const root = mountRoot(doc);
  if (root?.parentNode) {
    if (host.nextSibling !== root) root.parentNode.insertBefore(host, root);
  } else if (doc.body && host.parentNode !== doc.body) {
    doc.body.prepend(host);
  } else if (!host.parentNode && doc.documentElement) {
    doc.documentElement.appendChild(host);
  }
}

/** The #mfga-shell host (created and placed on first use). The shell renders into it. */
export function shellHost(doc = document) {
  let host = doc.getElementById(HOST_ID);
  if (!host) {
    host = doc.createElement("div");
    host.id = HOST_ID;
    host.className = "mfga-ui";
  }
  placeHost(host, doc);
  return host;
}

/** The page's [role=main] column (not one inside a dialog/push view). */
export function findMain(doc = document) {
  return [...doc.querySelectorAll('[role="main"]')].find((m) => !m.closest('[role="dialog"]')) || null;
}

/** A photo/post push view (route dialog) is open over the page. */
export function pushViewOpen(doc = document) {
  const root = mountRoot(doc);
  return !!root && [...root.querySelectorAll('[role="dialog"]')].some((d) => !d.closest('[role="banner"]'));
}

/** Facebook's top banner (not a push view's, never ours). */
export function findBanner(doc = document) {
  return [...doc.querySelectorAll('[role="banner"]')].find((b) => !b.closest(`[role="dialog"], #${HOST_ID}`)) || null;
}

/**
 * Facebook's root wrappers paint above the shell (they form their own z-index:0 stacking context after it),
 * so the ancestors of [role=main] — or of the banner on pages without one — (the "chain") are made
 * click-through on every shell route and transparent on the column routes. The sibling branches that hold
 * the left/right rails are hidden on the column routes. Returns {chain, rails}.
 */
export function passThroughMarks(anchor, doc = document) {
  const chain = [];
  for (let el = anchor.parentElement; el && el !== doc.body && el !== doc.documentElement; el = el.parentElement) chain.push(el);
  const inChain = new Set(chain);
  const rails = [];
  for (const el of chain) {
    for (const child of el.children) {
      if (child === anchor || inChain.has(child) || child.id === HOST_ID) continue;
      const isRail = child.matches('[role="navigation"], [role="complementary"]') || child.querySelector('[role="navigation"], [role="complementary"]');
      const isLayer = child.matches('[role="banner"], [role="dialog"]') || child.querySelector('[role="banner"], [role="dialog"]');
      if (isRail && !isLayer) rails.push(child);
    }
  }
  return { chain, rails };
}

/**
 * Makes `ro` observe the connected elements of `targets` and forget detached ones (Facebook replaces whole
 * columns on navigation; an observed old [role=main] would keep its feed's DOM alive). Returns the new set.
 */
export function syncObserved(ro, observed, targets) {
  const next = new Set();
  for (const el of targets) if (el?.isConnected) next.add(el);
  for (const el of observed) if (!next.has(el)) ro.unobserve(el);
  for (const el of next) if (!observed.has(el)) ro.observe(el);
  return next;
}

export function createLayout({ settings } = {}) {
  const doc = document;
  const html = doc.documentElement;
  let route = null;
  let mode = null;
  let main = null;
  let marked = new Map(); // element -> attribute name we set on it
  let vars = { dx: 0, dy: 0, footer: 0 };
  let varsEl = null;
  let ro = null;
  let observed = new Set();
  let timer = 0;

  const writeVars = (next) => {
    if (next.dx === vars.dx && next.dy === vars.dy && next.footer === vars.footer && varsEl?.isConnected) return;
    vars = next;
    if (!varsEl?.isConnected) {
      varsEl = doc.getElementById(VARS_ID) || doc.createElement("style");
      varsEl.id = VARS_ID;
      (doc.head || html).appendChild(varsEl);
    }
    varsEl.textContent = `:root{--mfga-main-dx:${next.dx}px;--mfga-main-dy:${next.dy}px;--mfga-footer-top:${next.footer}px}`;
  };

  const setMarks = (next) => {
    for (const [el, attr] of marked) if (next.get(el) !== attr) el.removeAttribute(attr);
    for (const [el, attr] of next) if (marked.get(el) !== attr) el.setAttribute(attr, attr === "data-mfga-chrome" ? "rail" : "");
    marked = next;
  };

  const markPage = () => {
    const found = findMain(doc);
    main = hasColumns(mode) ? found : null;
    const anchor = found || findBanner(doc);
    if (!anchor) return setMarks(new Map());
    const { chain, rails } = passThroughMarks(anchor, doc);
    const next = new Map(chain.map((el) => [el, "data-mfga-pass"]));
    if (main) {
      next.set(main, "data-mfga-main");
      for (const el of rails) next.set(el, "data-mfga-chrome");
    }
    setMarks(next);
  };

  // Size changes of the viewport, Facebook's root, the main column or our columns move things around.
  const observeTargets = () => {
    observed = syncObserved(ro, observed, [html, mountRoot(doc), main, ...doc.querySelectorAll(`#${HOST_ID} .mfga-shell-col`)]);
  };

  const round = (n) => Math.round(n * 100) / 100;

  /** Bottom of everything on the page, in document coordinates: where the footer goes. */
  const contentBottom = (nextDy) => {
    const sy = scrollY;
    let bottom = GRID.bar;
    const root = mountRoot(doc);
    if (root) bottom = Math.max(bottom, root.getBoundingClientRect().top + sy + root.scrollHeight);
    if (main?.isConnected) bottom = Math.max(bottom, main.getBoundingClientRect().bottom + sy + nextDy - vars.dy);
    for (const col of doc.querySelectorAll(`#${HOST_ID} .mfga-shell-col`)) {
      if (col.offsetParent) bottom = Math.max(bottom, col.getBoundingClientRect().bottom + sy);
    }
    return bottom;
  };

  const measure = safe("layout", () => {
    if (!mode) return;
    const slot = mainSlot(mode, html.clientWidth);
    let dx = 0;
    let dy = 0;
    if (slot && main?.isConnected) {
      const r = main.getBoundingClientRect();
      if (!r.width) return; // hidden under an opaque push view (photo viewer): keep the last geometry
      dx = round(slot.left - (r.left + scrollX - vars.dx));
      dy = round(slot.top - (r.top + scrollY - vars.dy));
    }
    writeVars({ dx, dy, footer: round(contentBottom(dy) + GRID.footerGap) });
  });
  const scheduleMeasure = rafBatch(measure);

  const start = () => {
    if (timer) return;
    ro = new ResizeObserver(scheduleMeasure);
    observed = new Set();
    timer = setInterval(ensure, ENSURE_MS);
  };

  const stop = () => {
    clearInterval(timer);
    timer = 0;
    ro?.disconnect();
    ro = null;
    observed = new Set();
  };

  const teardown = () => {
    stop();
    mode = null;
    setMarks(new Map());
    main = null;
    for (const a of ["data-mfga-shell", "data-mfga-route", "data-mfga-fixed-header"]) html.removeAttribute(a);
    writeVars({ dx: 0, dy: 0, footer: 0 });
    const host = doc.getElementById(HOST_ID);
    if (host) host.hidden = true;
  };

  const apply = safe("layout", (nextRoute) => {
    route = nextRoute || route;
    const s = readSettings(settings);
    if (!route || !s.enabled || !s.look?.shell) return teardown();
    mode = effectiveMode(route, mode, pushViewOpen(doc));
    html.setAttribute("data-mfga-shell", "");
    html.setAttribute("data-mfga-route", mode);
    html.toggleAttribute("data-mfga-fixed-header", !!s.look.fixedHeader);
    const host = shellHost(doc);
    host.hidden = false;
    start();
    markPage();
    observeTargets();
    measure();
    health.count(`layout.apply.${mode}`);
  });

  // Facebook re-renders whole regions on navigation and forced reloads: keep host, marks and geometry right.
  function ensure() {
    if (!mode) return;
    shellHost(doc);
    if (route && route.mode !== mode && !pushViewOpen(doc)) return apply(route);
    markPage();
    observeTargets();
    measure();
  }

  const unsubscribe = typeof settings?.subscribe === "function" ? settings.subscribe(() => route && apply(route)) : null;

  return {
    apply,
    measure,
    destroy() {
      unsubscribe?.();
      teardown();
      varsEl?.remove();
      doc.getElementById(HOST_ID)?.remove();
    },
  };
}
