// Places the 2010 shell around Facebook's page (ARCHITECTURE §5, dom-chrome §1.2/§9):
// root state on <html>, #mfga-shell inserted before Facebook's mount root, and on the column routes
// [role=main] clamped and moved into the 980px grid by a measured relative offset. Facebook nodes only ever
// get data-mfga-* marks; geometry goes through CSS variables in our own <style> element and on our own host.
import { safe, health, rafBatch } from "../shared/util.js";
import { DEFAULTS } from "../shared/settings.js";
import { GRID, mainSlot } from "../ui/shell/grid.js";
import { effectiveMode } from "./routes.js";

export const HOST_ID = "mfga-shell";
const VARS_ID = "mfga-layout-vars";
const ENSURE_MS = 1000;
const PUSH_VIEW_MIN_WIDTH = 450; // the post dialog is ~680px, the photo viewer full width; hovercards ~360px
const VARS_EPSILON_PX = 0.1; // re-measurement noise (see changedVars); far below anything visible
const DIALOG = '[role="dialog"]';
const PAGE_DIALOG = '[role="dialog"]:not([role="banner"] *)';
// With the fixed bar on, html[data-mfga-dialog] tells the stylesheet that a Facebook dialog is open. It used to
// be `html:has([role=dialog]:not([role=banner] *))` in CSS, but a :has() on <html> made every DOM change on
// the page restyle the whole document: on a long feed (100k elements) 3.8 s of style recalculation per 5 s of
// ordinary feed activity, ~200 ms per frame. An observer that looks only at inserted/removed subtrees costs
// nothing measurable.
const DIALOG_ATTR = "data-mfga-dialog";

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
  // One querySelector, not querySelectorAll + filter: it stops at the column instead of walking the whole
  // feed below it, and it runs every second (1.6 ms per full walk on a long, 100k-element feed).
  return doc.querySelector('[role="main"]:not([role="dialog"] *)');
}

/**
 * A photo/post push view (route dialog) is open over the page. Hovercards, menus, pickers and docked chat
 * windows are dialogs inside the root too, but they are narrow or off to the side; a push view spans the
 * middle of the viewport.
 */
export function pushViewOpen(doc = document) {
  const root = mountRoot(doc);
  if (!root) return false;
  const mid = doc.documentElement.clientWidth / 2;
  return [...root.querySelectorAll('[role="dialog"]')].some((d) => {
    if (d.closest('[role="banner"]')) return false;
    const r = d.getBoundingClientRect();
    return r.width >= PUSH_VIEW_MIN_WIDTH && r.left <= mid && r.right >= mid;
  });
}

/** Facebook's top banner (not a push view's, never ours). */
export function findBanner(doc = document) {
  return doc.querySelector(`[role="banner"]:not([role="dialog"] *, #${HOST_ID} *)`);
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

/**
 * Which of the written variables a new measurement changes: `geometry` (dx/dy, read by Facebook's [role=main])
 * and `footer`. Layout snaps positions to 1/64 px, so a fractional offset re-measured after it was applied
 * comes back a hundredth off (43.66 -> 43.64 -> 43.66 ...): without a tolerance every check would rewrite the
 * variables, and a rewrite of the :root variables restyles the whole page.
 */
export function changedVars(next, applied, eps = VARS_EPSILON_PX) {
  return {
    geometry: Math.abs(next.dx - applied.dx) >= eps || Math.abs(next.dy - applied.dy) >= eps,
    footer: Math.abs(next.footer - applied.footer) >= eps,
  };
}

/** A Facebook dialog is open (not a banner dropdown): the fixed 2010 bar then steps below it. */
export function hasPageDialog(doc = document) {
  return doc.querySelector(PAGE_DIALOG) != null;
}

/** Whether a batch of mutation records may have opened or closed such a dialog. */
export function touchesDialog(records) {
  const holds = (n) => n.nodeType === 1 && (n.matches(DIALOG) || n.querySelector(DIALOG) != null);
  for (const r of records) {
    if (r.type === "attributes") {
      if (r.oldValue === "dialog" || r.target.getAttribute?.("role") === "dialog") return true;
      continue;
    }
    for (const n of r.addedNodes) if (holds(n)) return true;
    for (const n of r.removedNodes) if (holds(n)) return true;
  }
  return false;
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
  let dialogs = null; // MutationObserver keeping html[data-mfga-dialog] while the bar is fixed

  const syncDialog = () => html.toggleAttribute(DIALOG_ATTR, hasPageDialog(doc));
  const watchDialogs = (on) => {
    if (!on) {
      dialogs?.disconnect();
      dialogs = null;
      html.removeAttribute(DIALOG_ATTR);
      return;
    }
    if (dialogs) return;
    dialogs = new MutationObserver(safe("layout", (records) => touchesDialog(records) && syncDialog(), { disableOnError: false }));
    dialogs.observe(doc.body || html, { childList: true, subtree: true, attributes: true, attributeFilter: ["role"], attributeOldValue: true });
    syncDialog();
  };

  // dx/dy live in a :root stylesheet because Facebook's [role=main] uses them; they change on resizes and
  // route changes only. The footer position moves whenever the page grows (feed pages, images, comments), so
  // it is set on our own host: a custom property changed on :root restyles every element of the page.
  let footerHost = null;
  const writeVars = (next) => {
    const changed = changedVars(next, vars);
    if (changed.geometry || !varsEl?.isConnected) {
      vars = { ...vars, dx: next.dx, dy: next.dy };
      if (!varsEl?.isConnected) {
        varsEl = doc.getElementById(VARS_ID) || doc.createElement("style");
        varsEl.id = VARS_ID;
        (doc.head || html).appendChild(varsEl);
      }
      varsEl.textContent = `:root{--mfga-main-dx:${next.dx}px;--mfga-main-dy:${next.dy}px}`;
    }
    const host = doc.getElementById(HOST_ID);
    if (changed.footer || (host && host !== footerHost)) {
      vars = { ...vars, footer: next.footer };
      footerHost = host;
      host?.style.setProperty("--mfga-footer-top", `${next.footer}px`);
    }
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
    watchDialogs(false);
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
    watchDialogs(!!s.look.fixedHeader);
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
