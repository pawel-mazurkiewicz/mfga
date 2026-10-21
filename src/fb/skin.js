// Tags the parts of Facebook-rendered posts (docs/research/dom-feed.md §3.2) with data-mfga-part so the
// stylesheet in src/ui/css/native.js can give them the 2010 look. Only data-mfga-* attributes are
// written, never classes or inline styles. Tagging is idempotent and re-runs whenever a post's subtree
// changes, so a post Facebook unmounts and remounts (data-virtualized) is tagged again.

import { safe, rafBatch, onBody } from "../shared/util.js";
import { DEFAULTS } from "../shared/settings.js";
import { UNIT_SELECTOR, HIDE_ATTR, mountedRoot, closestUnit, headerEnd, before, isPersonLink } from "./cleaner.js";

// Parts: avatar, name, byline, message, attachment, actions, summary, comments, composer, and footer (the
// box holding summary and actions when they are siblings, so the stylesheet can put the links first).
const PART_ATTR = "data-mfga-part";
const ACTION_ATTR = "data-mfga-action"; // like | comment | share, on each action button
const COUNT_ATTR = "data-mfga-count"; // the button shows a count ("47.7K") instead of its word

const ACTIONS = { like_button: "like", comment_button: "comment", share_button: "share" };

/** Nearest element containing both a and b. */
function commonAncestor(a, b) {
  let p = a;
  while (p && !p.contains(b)) p = p.parentElement;
  return p;
}

/** The child of `ancestor` that holds `el`. */
function childOf(ancestor, el) {
  let c = el;
  while (c && c.parentElement !== ancestor) c = c.parentElement;
  return c;
}

const notInComment = (el) => !el.closest('[role="article"]');

/** The post's own author block: the first profile_name that is not an embedded post's (h5) one. */
function findName(root) {
  return [...root.querySelectorAll('[data-ad-rendering-role="profile_name"]')].find((n) => !n.querySelector("h5") && notInComment(n)) ?? null;
}

/** The post's own message: before any embedded post's h5 header. */
function findMessage(root) {
  const embedded = root.querySelector("h5");
  const msg = root.querySelector('[data-ad-rendering-role="story_message"]');
  return msg && (!embedded || before(msg, embedded)) && notInComment(msg) ? msg : null;
}

function findAvatar(root, name) {
  if (!name) return null;
  return [...root.querySelectorAll("a")].find((a) => before(a, name) && a.querySelector("svg, img") && isPersonLink(a)) ?? null;
}

/** The second header line: the span holding the timestamp link, its "·" and the audience icon. */
function findByline(root, name) {
  const end = headerEnd(root);
  const link = [...root.querySelectorAll("a[href]")].find(
    (a) => name && !before(a, name) && before(a, end) && !name.contains(a) && !isPersonLink(a) && a.getAttribute("href") !== "#",
  );
  const line = link?.closest("span[dir]");
  return line && !line.contains(name) ? line : (link?.parentElement ?? null);
}

function findActionButtons(root) {
  const buttons = [];
  for (const marker of root.querySelectorAll('[data-ad-rendering-role$="_button"]')) {
    const action = ACTIONS[marker.getAttribute("data-ad-rendering-role")];
    const button = marker.closest('[role="button"]');
    if (action && button && notInComment(button) && root.contains(button)) buttons.push({ action, button });
  }
  return buttons;
}

/** Climbs from `el` while the parent stays clear of `avoid` and inside `root`. */
function climbUntil(el, avoid, root) {
  let c = el;
  while (c.parentElement && c.parentElement !== root && !avoid.some((a) => c.parentElement.contains(a))) c = c.parentElement;
  return c;
}

function findComments(root, avoid) {
  const top = [...root.querySelectorAll('[role="article"]')].filter((a) => !a.parentElement.closest('[role="article"]'));
  if (!top.length) return null;
  const box = top.length > 1 ? commonAncestor(top[0], top[top.length - 1]) : top[0].parentElement;
  return box && !avoid.some((a) => box.contains(a)) ? box : climbUntil(top[0], avoid, root);
}

/** Sections between the header and the footer that are not the message: photos, videos, link cards, shares. */
function findAttachments(root, name, message, footer) {
  if (!name || !footer) return [];
  const lca = commonAncestor(name, footer);
  if (!lca || lca === name) return [];
  const head = childOf(lca, name);
  const foot = childOf(lca, footer);
  const out = [];
  for (let c = head?.nextElementSibling; c && c !== foot; c = c.nextElementSibling) {
    if (c.getAttribute("aria-hidden") === "true" || (message && c.contains(message)) || !c.firstElementChild) continue;
    out.push(c);
  }
  return out;
}

/** The part map of one mounted post: [[element, part], ...] and its action buttons. */
function postParts(root) {
  const parts = [];
  const add = (el, part) => el && parts.push([el, part]);
  const name = findName(root);
  const message = findMessage(root);
  const buttons = findActionButtons(root);
  const buttonEls = buttons.map((b) => b.button);
  const actions = buttonEls.length > 1 ? commonAncestor(buttonEls[0], buttonEls[buttonEls.length - 1]) : buttonEls[0]?.parentElement;
  // Footer boxes never climb into a section holding the author block or the message.
  const head = [name, message].filter(Boolean);
  const toolbar = [...root.querySelectorAll('span[role="toolbar"]')].find(notInComment);
  const summary = toolbar ? climbUntil(toolbar, [...head, ...buttonEls], root) : null;
  const form = [...root.querySelectorAll("form")].find((f) => f.querySelector('[role="textbox"], [contenteditable="true"]'));
  const articles = [...root.querySelectorAll('[role="article"]')];
  // The composer row: the form with the viewer's avatar beside it, short of the action bar and comments.
  const composer = form ? climbUntil(form, [...head, actions, summary, ...articles].filter(Boolean), root) : null;
  const comments = findComments(root, [...head, actions, summary, composer].filter(Boolean));

  add(findAvatar(root, name), "avatar");
  add(name, "name");
  add(findByline(root, name), "byline");
  add(message, "message");
  for (const a of findAttachments(root, name, message, actions ?? summary)) add(a, "attachment");
  if (summary && summary.nextElementSibling === actions) add(summary.parentElement, "footer");
  add(actions, "actions");
  add(summary, "summary");
  add(comments, "comments");
  add(composer, "composer");
  return { parts, buttons };
}

function setAttr(el, attr, value) {
  if (value == null) el.removeAttribute(attr);
  else if (el.getAttribute(attr) !== value) el.setAttribute(attr, value);
}

// Empty, or a number with an optional short unit: "930", "47.7K", "1,2 tys.", "3 mln".
const isCountText = (text) => /^(\d[\d\s.,]*\s*[\p{L}.]{0,4})?$/u.test(text.trim());

/** Tags one unit's mounted post and drops tags that no longer apply. */
function tagUnit(unit) {
  const root = mountedRoot(unit);
  if (!root) return;
  const { parts, buttons } = postParts(root);
  const keep = new Set(parts.map(([el]) => el));
  for (const el of root.querySelectorAll(`[${PART_ATTR}]`)) if (!keep.has(el)) el.removeAttribute(PART_ATTR);
  for (const [el, part] of parts) setAttr(el, PART_ATTR, part);
  for (const { action, button } of buttons) {
    setAttr(button, ACTION_ATTR, action);
    // Since mid-2026 the buttons show counts ("47.7K") instead of words; the stylesheet then draws the word.
    setAttr(button, COUNT_ATTR, isCountText(button.textContent ?? "") ? "" : null);
  }
}

function untagAll(doc) {
  for (const attr of [PART_ATTR, ACTION_ATTR, COUNT_ATTR]) for (const el of doc.querySelectorAll(`[${attr}]`)) el.removeAttribute(attr);
}

/**
 * startSkin({ settings }) -> { stop() }. `settings` is the settings store (get/subscribe) or a plain
 * settings object; posts are tagged while settings.look.skinPosts is on.
 */
export function startSkin({ settings } = {}) {
  const doc = document;
  const enabled = () => {
    const s = typeof settings?.get === "function" ? settings.get() : settings;
    return (s?.look ?? DEFAULTS.look).skinPosts;
  };
  const dirty = new Set();
  let stopped = false;

  const flush = rafBatch(
    safe("skin", () => {
      if (!stopped && enabled()) {
        for (const unit of dirty) if (unit.isConnected && !unit.firstElementChild?.hasAttribute(HIDE_ATTR)) tagUnit(unit);
      }
      dirty.clear();
    }),
  );

  const all = () => {
    for (const unit of doc.querySelectorAll(UNIT_SELECTOR)) dirty.add(unit);
    flush();
  };

  const observer = new MutationObserver(
    safe("skin", (records) => {
      for (const rec of records) {
        const unit = closestUnit(rec.target);
        if (unit) dirty.add(unit);
        for (const n of rec.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.matches(UNIT_SELECTOR)) dirty.add(n);
          for (const u of n.querySelectorAll(UNIT_SELECTOR)) dirty.add(u);
        }
      }
      flush();
    }),
  );

  const unsubscribe =
    typeof settings?.subscribe === "function"
      ? settings.subscribe(() => (enabled() ? all() : untagAll(doc)))
      : null;

  onBody(
    safe("skin", () => {
      if (stopped) return;
      observer.observe(doc.body, { childList: true, subtree: true });
      all();
    }),
  );

  return {
    stop() {
      stopped = true;
      observer.disconnect();
      unsubscribe?.();
      dirty.clear();
      untagAll(doc);
    },
  };
}
