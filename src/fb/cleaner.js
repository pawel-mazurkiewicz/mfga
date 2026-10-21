// Junk cleaning for Facebook-rendered feeds (docs/research/dom-feed.md §4, §6).
//
// Units are `[aria-posinset]` slots. Each unit is classified once its content is mounted; the hits are
// cached per slot element (a WeakMap), because Facebook unmounts far-away posts (data-virtualized="true")
// and remounts a fresh subtree whose ad label may be gone by then. A hidden unit's FIRST CHILD carries
// data-mfga-hide and a :has() rule hides the slot (src/ui/css/native.js); nothing is written on the feed
// list's own children, and nothing is hidden within 1200px of the document bottom, where Facebook's
// load-more sentinel lives.

import { safe, health, rafBatch, debounce, onBody } from "../shared/util.js";
import { DEFAULTS } from "../shared/settings.js";
import { isWord, isAdLabel, bylineSegments, startsWithWord, labelKey, probeLabels } from "./labels.js";

export const UNIT_SELECTOR = "[aria-posinset]:not([role])";
export const HIDE_ATTR = "data-mfga-hide";
export const BOTTOM_GUARD_PX = 1200;
const STORIES_SELECTOR = '[data-focus-target="stories_tray"]';
const MAX_TRIES = 8; // detection passes on one mounted subtree that still lacks a decodable header
const XLINK = "http://www.w3.org/1999/xlink";

/** Hide reason -> whether the user's settings hide it. */
const REASON_SETTINGS = {
  sponsored: (s) => s.clean.sponsored,
  suggested: (s) => s.clean.suggested,
  pymk: (s) => s.clean.peopleYouMayKnow,
  reels: (s) => s.clean.reels,
  stories: (s) => s.clean.stories,
  "group-suggestions": (s) => s.clean.groupSuggestions,
  "meta-ai": (s) => s.clean.metaAI,
  ai: (s) => s.feed.hideAI,
  memories: (s) => s.clean.memories,
};
export const REASONS = Object.freeze(Object.keys(REASON_SETTINGS));

// ---------------------------------------------------------------------------------------------------
// Pure helpers

/** Decoded `__tn__` of an href ("%2CO%2CP-R" -> ",O,P-R"), or null. */
export function tnCode(href) {
  const m = /[?&]__tn__=([^&#]*)/.exec(String(href ?? ""));
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/** The query-only "Sponsored/Ad" info link: `?__cft__…` without `__tn__` (organic timestamps carry one). */
export function isAdInfoHref(href) {
  const h = String(href ?? "");
  return h.startsWith("?") && h.includes("__cft__") && !h.includes("__tn__");
}

/** A link to Facebook's /ads/about, directly or through the l.facebook.com/l.php?u= shim. */
export function isAdsAboutHref(href) {
  try {
    let u = new URL(String(href ?? ""), "https://www.facebook.com/");
    if (/(^|\.)l\.facebook\.com$/.test(u.hostname) && u.pathname === "/l.php") {
      u = new URL(u.searchParams.get("u") ?? "", "https://www.facebook.com/");
    }
    return /(^|\.)facebook\.com$/.test(u.hostname) && /^\/ads\/about(\/|$)/.test(u.pathname);
  } catch {
    return false;
  }
}

/** Distinct reel ids among hrefs (/reel/<id>/). */
export function reelIds(hrefs) {
  const ids = new Set();
  for (const href of hrefs) {
    const m = /\/reel\/(\d+)/.exec(String(href ?? ""));
    if (m) ids.add(m[1]);
  }
  return ids;
}

/** Home, the feeds filters and the groups feed: the only routes where Follow/Join marks a suggestion. */
export function isFeedRoute(route, loc = globalThis.location) {
  if (route?.mode) return route.mode === "home" || route.mode === "groups-feed";
  const path = route?.path ?? loc?.pathname ?? "";
  return path === "/" || path === "/home.php" || /^\/groups\/feed\/?$/.test(path);
}

/** First hit the settings hide; route-gated hits only count on feed routes. */
export function chooseVerdict(hits, settings, feedRoute) {
  for (const hit of hits ?? []) {
    if (hit.gated && !feedRoute) continue;
    if (REASON_SETTINGS[hit.reason]?.(settings)) return hit;
  }
  return null;
}

/** Whether an element whose bottom edge sits at `bottom` (document px) is too close to the end to hide. */
export function isNearBottom(bottom, docHeight, guard = BOTTOM_GUARD_PX) {
  return docHeight - bottom < guard;
}

// ---------------------------------------------------------------------------------------------------
// Label cache: aria-labelledby and <use href> targets vanish within a frame, so their text (or, for an
// SVG link in a <use> chain, the next id) is recorded the moment they are inserted.

export function createLabelCache({ max = 500 } = {}) {
  const entries = new Map();
  const record = (el) => {
    if (!el.id || el.childElementCount > 3) return;
    const use = el.localName === "use" ? el : el.querySelector(":scope > use");
    const entry = use ? { ref: useRef(use) } : textEntry(el);
    if (!entry) return;
    entries.delete(el.id);
    entries.set(el.id, entry);
    if (entries.size > max) entries.delete(entries.keys().next().value);
  };
  return {
    capture(node) {
      if (node?.nodeType !== 1) return;
      record(node);
      for (const el of node.querySelectorAll("[id]")) record(el);
    },
    get: (id) => entries.get(id) ?? null,
    get size() {
      return entries.size;
    },
  };
}

function textEntry(el) {
  const text = (el.textContent ?? "").trim();
  return text && text.length <= 80 ? { text } : null;
}

function useRef(use) {
  return (use.getAttribute("href") ?? use.getAttributeNS(XLINK, "href") ?? "").replace(/^#/, "");
}

/** Resolves ids to label text through the live document first, then the cache. */
export function labelResolver(cache, doc = globalThis.document) {
  const follow = (id, depth) => {
    if (!id || depth > 16) return "";
    const live = doc.getElementById(id);
    if (live) {
      const use = live.localName === "use" ? live : live.querySelector("use");
      return live.localName !== "text" && use ? follow(useRef(use), depth + 1) : (live.textContent ?? "");
    }
    const hit = cache.get(id);
    return hit?.ref ? follow(hit.ref, depth + 1) : (hit?.text ?? "");
  };
  return {
    byId: (id) => follow(id, 0),
    byUse: (use) => follow(useRef(use), 0),
  };
}

// ---------------------------------------------------------------------------------------------------
// DOM reading

// The first of these (document order) ends a post's header: everything before it is avatar, name,
// byline, menu and hide button; after it come message, attachment, footer and comments.
const BODY_MARKERS = [
  '[data-ad-rendering-role="story_message"]', '[data-ad-preview="message"]', "h5",
  '[data-ad-rendering-role="meta"]', '[data-ad-rendering-role="title"]', '[data-ad-rendering-role^="cta"]',
  '[data-ad-rendering-role="image"]', 'a[rel~="nofollow"]', "img[data-imgperflogname]", '[role="group"]',
  '[data-ad-rendering-role$="_button"]', 'span[role="toolbar"]', '[role="grid"]', '[role="article"]', "form",
].join(",");

const SKIP_TEXT = new Set(["title", "desc", "style", "script", "template"]);

/** The first body element of a post (message, attachment, footer...): the header ends there. */
export function headerEnd(root) {
  return root.querySelector(BODY_MARKERS);
}

/** Whether `el` comes before `end` in document order (and does not contain it). */
export function before(el, end) {
  if (!end) return true;
  const pos = el.compareDocumentPosition(end);
  return Boolean(pos & Node.DOCUMENT_POSITION_FOLLOWING) && !(pos & Node.DOCUMENT_POSITION_CONTAINED_BY);
}

/** Inside an aria-hidden honeypot of this unit (an aria-hidden page behind a dialog does not count). */
function inDecoy(el, unit) {
  const hidden = el.closest('[aria-hidden="true"]');
  return hidden != null && unit.contains(hidden);
}

/** A glyph or wrapper the reader does not see: hidden, transparent, zero-size, or an absolutely placed decoy. */
function isUnpainted(el, view) {
  if (el.hidden || el.getAttribute("aria-hidden") === "true" || SKIP_TEXT.has(el.localName)) return true;
  const s = view.getComputedStyle(el);
  return (
    s.display === "none" || s.visibility === "hidden" || s.visibility === "collapse" ||
    parseFloat(s.opacity || "1") <= 0.01 || parseFloat(s.fontSize) <= 0 ||
    s.position === "absolute" || s.position === "fixed"
  );
}

/**
 * The text a reader sees inside `el`: decoy letters dropped, flex children re-sorted by their CSS `order`
 * (Facebook shuffles one-letter spans and restores the visual order with `order`).
 */
function paintedText(el, view = el.ownerDocument.defaultView) {
  let nodes = [...el.childNodes];
  if (view.getComputedStyle(el).display.includes("flex")) {
    nodes = nodes
      .map((n, i) => ({ n, i, o: n.nodeType === 1 ? parseInt(view.getComputedStyle(n).order, 10) || 0 : 0 }))
      .sort((a, b) => a.o - b.o || a.i - b.i)
      .map((x) => x.n);
  }
  let out = "";
  for (const n of nodes) {
    if (n.nodeType === 3) out += n.nodeValue;
    else if (n.nodeType === 1 && !isUnpainted(n, view)) out += paintedText(n, view);
  }
  return out;
}

/** Every reading of a byline label carrier: aria-label, aria-labelledby targets, <use> chains, painted glyphs. */
function carrierTexts(el, resolve) {
  const out = [el.getAttribute("aria-label")];
  for (const node of [el, ...el.querySelectorAll("[aria-labelledby]")]) {
    for (const id of (node.getAttribute("aria-labelledby") ?? "").split(/\s+/)) out.push(resolve.byId(id));
  }
  for (const use of el.querySelectorAll("use")) out.push(resolve.byUse(use));
  out.push(paintedText(el));
  return out.filter((t) => labelKey(t));
}

function headerParts(unit) {
  const end = headerEnd(unit);
  const inHeader = (el) => before(el, end) && !inDecoy(el, unit);
  const name = unit.querySelector('[data-ad-rendering-role="profile_name"]');
  const heading = [...unit.querySelectorAll('h2, h3, h4, [role="heading"]')].find((h) => h.localName !== "h5" && !inDecoy(h, unit)) ?? null;
  return { end, inHeader, name, heading };
}

/** Avatar, author and member links: their labels are names, which are never matched (a Page may be called "Ad"). */
export function isPersonLink(a) {
  const href = a.getAttribute("href") ?? "";
  const tn = tnCode(href) ?? "";
  return (
    a.querySelector("img, image, mask, svg[role='img']") != null ||
    tn.startsWith("<<") || tn.startsWith("-UC") || /\/groups\/[^/?#]+\/user\//.test(href)
  );
}

/** Links and spans in the header that may hold the obfuscated byline label (not the avatar, name or hide link). */
function labelCarriers(unit, { inHeader }) {
  const carriers = [];
  for (const a of unit.querySelectorAll("a")) {
    if (!inHeader(a) || a.closest("h2, h3, h4, [role='heading'], [data-ad-rendering-role]")) continue;
    if (isPersonLink(a) || a.getAttribute("href") === "#") continue;
    carriers.push(a);
  }
  for (const s of unit.querySelectorAll("[aria-labelledby]")) {
    if (inHeader(s) && !s.closest("a, h2, h3, h4, [data-ad-rendering-role]")) carriers.push(s);
  }
  return carriers;
}

/** Short texts that may name a module panel: headings, plain title spans, region and grid labels. */
function panelTitles(unit, { inHeader }) {
  const titles = [];
  for (const el of unit.querySelectorAll('h2, h3, h4, [role="heading"], span[dir="auto"]')) {
    if (!inHeader(el) || el.closest('[data-ad-rendering-role="profile_name"], [role="article"]')) continue;
    const text = el.textContent ?? "";
    if (text.length <= 80) titles.push(text);
  }
  for (const el of unit.querySelectorAll('[role="region"][aria-label], [role="grid"][aria-label]')) {
    titles.push(el.getAttribute("aria-label"));
  }
  return titles;
}

const outsideMessage = (el) => !el.closest('[data-ad-rendering-role="story_message"], [data-ad-preview="message"], [role="article"]');
const hrefs = (unit, selector) => [...unit.querySelectorAll(selector)].filter(outsideMessage).map((a) => a.getAttribute("href"));
const buttonTexts = (root) => [...root.querySelectorAll('[role="button"], button')].map((b) => b.textContent ?? "");

/** Skeleton placeholders fill in later: never hidden, re-checked when they change. */
function isSkeleton(unit) {
  return unit.querySelector('[role="progressbar"], [role="status"], [aria-busy="true"]') != null && !unit.querySelector("a[href]");
}

/**
 * Classifies one mounted unit. Returns every hit in priority order ({reason, signal, gated}), whether the
 * unit is still a loading skeleton, whether its header was readable (`complete`), and whether a post's
 * byline could not be decoded at all (`undecodable`).
 */
export function detectUnit(unit, resolve) {
  if (isSkeleton(unit)) return { hits: [], skeleton: true, complete: false, undecodable: false };
  const parts = headerParts(unit);
  const hits = [];
  const hit = (reason, signal, gated = false) => hits.push({ reason, signal, gated });

  // Sponsored: structural signals first (locale-free), then the decoded byline label.
  const carriers = labelCarriers(unit, parts);
  if (carriers.some((a) => a.localName === "a" && isAdInfoHref(a.getAttribute("href")))) hit("sponsored", "ad-info-link");
  if (hrefs(unit, 'a[href*="/ads/about"], a[href*="l.facebook.com/l.php"]').some(isAdsAboutHref)) hit("sponsored", "ads-about");
  const labels = carriers.flatMap((c) => carrierTexts(c, resolve));
  if (labels.some(isAdLabel)) hit("sponsored", "ad-label");

  // Module panels.
  const titles = panelTitles(unit, parts);
  const titled = (concept) => titles.some((t) => isWord(concept, t));
  if (titled("pymk") || hrefs(unit, 'a[href*="/friends/suggestions"]').length) hit("pymk", "panel");
  if (titled("reels") || reelIds(hrefs(unit, 'a[href*="/reel/"]')).size >= 2) hit("reels", "panel");
  if (titled("stories")) hit("stories", "panel");
  if (titled("groupSuggestions") || hrefs(unit, 'a[href*="/groups/discover"]').length) hit("group-suggestions", "panel");
  if (titled("suggestedPanels")) hit("suggested", "panel");

  // Suggestions: a Follow / Add friend / Join button in the post's first (non-h5) heading.
  const headingButtons = parts.heading ? buttonTexts(parts.heading) : [];
  if (headingButtons.some((t) => isWord("follow", t) || isWord("addFriend", t))) hit("suggested", "follow", true);
  if (headingButtons.some((t) => isWord("join", t))) hit("group-suggestions", "join", true);
  if (legacyHeader(unit, parts)) hit("suggested", "header", true);

  // AI. Meta AI promotion units have no author; a friend's post with an "Ask Meta AI" chip stays.
  const postLike = parts.name != null;
  if (!postLike && metaAIUnit(unit)) hit("meta-ai", "unit");
  const headerButtons = [...unit.querySelectorAll('[role="button"]')].filter(parts.inHeader);
  if (labels.some((t) => bylineSegments(t).some((seg) => isWord("ai", seg))) || headerButtons.some((b) => isWord("ai", b.textContent))) hit("ai", "label");

  if (hrefs(unit, 'a[href*="/onthisday"]').length || titled("memories")) hit("memories", "link");

  const decoded = labels.length > 0;
  return {
    hits,
    skeleton: false,
    complete: hits.length > 0 || (postLike && decoded),
    undecodable: postLike && !decoded,
  };
}

function isMetaAIHref(href) {
  try {
    return /(^|\.)meta\.ai$/.test(new URL(href, "https://www.facebook.com/").hostname);
  } catch {
    return false;
  }
}

function metaAIUnit(unit) {
  return (
    [...unit.querySelectorAll("a[aria-label]")].some((a) => isWord("metaAI", a.getAttribute("aria-label"))) ||
    hrefs(unit, 'a[href*="meta.ai"]').some(isMetaAIHref) ||
    buttonTexts(unit).some((t) => isWord("metaAI", t))
  );
}

/** A legacy "Suggested for you"-style line above the author block. */
function legacyHeader(unit, { heading, inHeader }) {
  for (const el of unit.querySelectorAll('span[dir="auto"]')) {
    if (heading && !before(el, heading)) break;
    if (inHeader(el) && startsWithWord("suggestedHeaders", el.textContent)) return true;
  }
  return false;
}

/** The mounted post subtree of a unit, or null while Facebook has it virtualised away. */
export function mountedRoot(unit) {
  const v = unit.querySelector("[data-virtualized]");
  if (!v) return unit.firstElementChild;
  return v.getAttribute("data-virtualized") === "true" ? null : v.firstElementChild;
}

/** The outermost unit containing `el` (nested candidates belong to the outer post). */
export function closestUnit(el) {
  let unit = el?.closest?.(UNIT_SELECTOR) ?? null;
  for (let up = unit?.parentElement?.closest(UNIT_SELECTOR); up; up = up.parentElement?.closest(UNIT_SELECTOR)) unit = up;
  return unit;
}

/** Stories trays in `node`, plus "Stories" regions that hold no tray (cohorts without data-focus-target). */
function storyBlocks(node) {
  const blocks = node.matches(STORIES_SELECTOR) ? [node] : [...node.querySelectorAll(STORIES_SELECTOR)];
  const regions = node.matches('[role="region"][aria-label]') ? [node] : node.querySelectorAll('[role="region"][aria-label]');
  for (const r of regions) {
    if (isWord("stories", r.getAttribute("aria-label")) && !r.querySelector(STORIES_SELECTOR)) blocks.push(r);
  }
  return blocks;
}

function observedLabels(unit) {
  const button = (role) => unit.querySelector(`[data-ad-rendering-role="${role}"]`)?.closest('[role="button"]')?.getAttribute("aria-label");
  return {
    like: button("like_button"),
    comment: button("comment_button"),
    share: button("share_button"),
    menu: unit.querySelector('[aria-haspopup="menu"][aria-label]')?.getAttribute("aria-label"),
    hide: unit.querySelector('a[href="#"][aria-label]')?.getAttribute("aria-label"),
  };
}

// ---------------------------------------------------------------------------------------------------
// The running cleaner

/**
 * startCleaner({ settings, route, onStats }). `settings` is the settings store (get/subscribe) or a plain
 * settings object; `route` is classifyRoute()'s result. Returns { setRoute(route), stop(), stats() }.
 */
export function startCleaner({ settings, route, onStats } = {}) {
  const current = () => {
    const s = typeof settings?.get === "function" ? settings.get() : settings;
    return s?.clean && s?.feed ? s : DEFAULTS;
  };
  const doc = document;
  let feedRoute = isFeedRoute(route);
  const cache = createLabelCache();
  const resolve = labelResolver(cache, doc);
  const states = new WeakMap(); // unit -> { hits, mount, tries, done }
  const counted = new WeakSet();
  const seen = { skeleton: new WeakSet(), virtualized: new WeakSet(), undecodable: new WeakSet() };
  const pending = new Set();
  const dirtyUnits = new Set();
  const dirtyBlocks = new Set();
  const stats = { seen: 0, hidden: 0, skeletons: 0, virtualized: 0, undecodable: 0, reasons: {}, signals: {}, probe: {} };
  const emit = debounce(() => onStats?.(snapshot()), 250);

  function snapshot() {
    return { ...stats, pending: pending.size, reasons: { ...stats.reasons }, signals: { ...stats.signals }, probe: structuredClone(stats.probe) };
  }

  function once(set, el, key) {
    if (set.has(el)) return;
    set.add(el);
    stats[key]++;
  }

  function count(el, verdict) {
    if (counted.has(el)) return;
    counted.add(el);
    stats.hidden++;
    stats.reasons[verdict.reason] = (stats.reasons[verdict.reason] || 0) + 1;
    const sig = `${verdict.reason}:${verdict.signal}`;
    stats.signals[sig] = (stats.signals[sig] || 0) + 1;
    health.count(`clean.${verdict.reason}`);
    emit();
  }

  function nearBottom(el) {
    const rect = el.getBoundingClientRect();
    return isNearBottom(rect.bottom + window.scrollY, doc.documentElement.scrollHeight);
  }

  /**
   * Marks `target` hidden for `verdict` (or clears it). `owner` is what the bottom guard measures and the
   * stats count; `counts` is false for a second element hidden with the same owner.
   */
  function mark(owner, target, verdict, counts = true) {
    if (!verdict) {
      pending.delete(owner);
      target?.removeAttribute(HIDE_ATTR);
      return;
    }
    if (!target || target.getAttribute(HIDE_ATTR) === verdict.reason) return;
    if (!target.hasAttribute(HIDE_ATTR) && nearBottom(owner)) {
      pending.add(owner);
      return;
    }
    pending.delete(owner);
    target.setAttribute(HIDE_ATTR, verdict.reason);
    if (counts) count(owner, verdict);
  }

  function applyUnit(unit, state) {
    const target = unit.firstElementChild;
    // Facebook may put a node in front of the marked child: the mark always lives on the first one.
    for (const child of unit.children) if (child !== target && child.hasAttribute(HIDE_ATTR)) child.removeAttribute(HIDE_ATTR);
    mark(unit, target, chooseVerdict(state.hits, current(), feedRoute));
  }

  function probe(unit) {
    const lang = doc.documentElement.lang || "unknown";
    const entry = (stats.probe[lang] ||= { posts: 0, detected: null, mismatches: {} });
    if (entry.posts >= 5) return;
    const result = probeLabels(observedLabels(unit));
    if (!result.checked) return;
    entry.posts++;
    entry.detected = result.detected ?? entry.detected;
    for (const f of result.mismatches) entry.mismatches[f] = (entry.mismatches[f] || 0) + 1;
    health.fact("clean.localeProbe", stats.probe);
  }

  function processUnit(unit) {
    if (!unit.isConnected || closestUnit(unit) !== unit || unit.closest("form")) return;
    let state = states.get(unit);
    if (!state) {
      state = { hits: null, mount: null, tries: 0, done: false };
      states.set(unit, state);
      stats.seen++;
    }
    const mount = mountedRoot(unit);
    if (!mount) {
      once(seen.virtualized, unit, "virtualized");
    } else {
      if (mount !== state.mount) Object.assign(state, { mount, tries: 0, done: false });
      // A junk verdict sticks to the slot: after a remount its label targets may be gone.
      if (!state.hits?.length && !state.done && state.tries < MAX_TRIES) detectInto(unit, state);
    }
    if (state.hits) applyUnit(unit, state);
  }

  function detectInto(unit, state) {
    const r = detectUnit(unit, resolve);
    if (r.skeleton) {
      once(seen.skeleton, unit, "skeletons");
      return;
    }
    state.tries++;
    state.hits = r.hits;
    state.done = r.complete;
    if (r.undecodable && state.tries === 1) once(seen.undecodable, unit, "undecodable");
    if (!r.hits.length && r.complete) probe(unit);
  }

  /**
   * Top-of-feed blocks that are not units: the Stories tray (hidden with its labelled wrapper region) or,
   * on cohorts without data-focus-target, a region labelled "Stories".
   */
  function processBlock(block) {
    if (!block.isConnected || block.querySelector(UNIT_SELECTOR)) return;
    const verdict = chooseVerdict([{ reason: "stories", signal: "tray" }], current(), feedRoute);
    mark(block, block, verdict);
    if (!block.matches(STORIES_SELECTOR)) return;
    const outer = block.parentElement?.closest('[role="region"]');
    if (outer && !outer.querySelector(UNIT_SELECTOR) && outer.closest('[role="main"]')) mark(block, outer, verdict, false);
  }

  function collect(node) {
    if (node.nodeType !== 1) return;
    cache.capture(node);
    for (const u of node.matches(UNIT_SELECTOR) ? [node] : node.querySelectorAll(UNIT_SELECTOR)) dirtyUnits.add(u);
    for (const b of storyBlocks(node)) dirtyBlocks.add(b);
  }

  const flush = rafBatch(
    safe("cleaner", () => {
      for (const u of dirtyUnits) processUnit(u);
      for (const b of dirtyBlocks) processBlock(b);
      dirtyUnits.clear();
      dirtyBlocks.clear();
      recheckPending();
      emit();
    }),
  );

  function recheckPending() {
    for (const owner of [...pending]) {
      if (!owner.isConnected) pending.delete(owner);
      else if (owner.matches(UNIT_SELECTOR)) processUnit(owner);
      else processBlock(owner);
    }
  }

  const observer = new MutationObserver(
    safe("cleaner", (records) => {
      for (const rec of records) {
        for (const n of rec.addedNodes) collect(n);
        const unit = closestUnit(rec.target.nodeType === 1 ? rec.target : rec.target.parentElement);
        if (unit) dirtyUnits.add(unit);
      }
      flush();
    }),
  );

  const onScroll = rafBatch(safe("cleaner", () => pending.size && recheckPending()));

  function reapplyAll() {
    for (const unit of doc.querySelectorAll(UNIT_SELECTOR)) dirtyUnits.add(unit);
    for (const block of storyBlocks(doc.body)) dirtyBlocks.add(block);
    flush();
  }

  const unsubscribe = typeof settings?.subscribe === "function" ? settings.subscribe(() => reapplyAll()) : null;
  let stopped = false;
  onBody(
    safe("cleaner", () => {
      if (stopped) return;
      observer.observe(doc.body, { childList: true, subtree: true });
      collect(doc.body);
      flush();
    }),
  );
  window.addEventListener("scroll", onScroll, { passive: true });

  return {
    setRoute: safe("cleaner", (next) => {
      feedRoute = isFeedRoute(next);
      reapplyAll();
    }),
    stop() {
      stopped = true;
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      unsubscribe?.();
      pending.clear();
      for (const el of doc.querySelectorAll(`[${HIDE_ATTR}]`)) el.removeAttribute(HIDE_ATTR);
    },
    stats: snapshot,
  };
}
