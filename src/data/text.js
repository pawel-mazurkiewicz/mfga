// Message text helpers: entity ranges -> renderable segments, and keyword matching for the user's filter.

import { normLabel } from "../shared/util.js";
import { cleanPermalink, unwrapLinkShim } from "./extract.js";

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);

/**
 * Splits `text` into plain and linked segments: [{text}, {text, url, kind}, ...]. Offsets are UTF-16 (JS
 * string) indices. Ranges that are out of bounds, split a surrogate pair, overlap an earlier range or
 * have no http(s) link are ignored; external links are unwrapped from l.facebook.com and cleaned.
 */
export function textSegments(text, ranges) {
  const s = typeof text === "string" ? text : "";
  if (!s) return [];
  const out = [];
  let pos = 0;
  for (const r of usableRanges(s, ranges)) {
    if (r.offset > pos) out.push({ text: s.slice(pos, r.offset) });
    out.push({ text: s.slice(r.offset, r.offset + r.length), url: r.url, kind: r.kind });
    pos = r.offset + r.length;
  }
  if (pos < s.length) out.push({ text: s.slice(pos) });
  return out;
}

function usableRanges(s, ranges) {
  const candidates = (Array.isArray(ranges) ? ranges : [])
    .filter(isObj)
    .map((r) => ({ offset: r.offset, length: r.length, kind: typeof r.kind === "string" ? r.kind : "other", url: linkOf(r) }))
    .filter((r) => fits(s, r) && r.url)
    .sort((a, b) => a.offset - b.offset || b.length - a.length);
  const accepted = [];
  let end = 0;
  for (const r of candidates) {
    if (r.offset < end) continue;
    accepted.push(r);
    end = r.offset + r.length;
  }
  return accepted;
}

function linkOf(r) {
  return cleanPermalink(r.kind === "link" ? unwrapLinkShim(r.url) : r.url);
}

function fits(s, r) {
  const { offset, length } = r;
  if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length <= 0) return false;
  return offset + length <= s.length && !splitsPair(s, offset) && !splitsPair(s, offset + length);
}

/** True when index i falls between the two halves of a surrogate pair (an emoji, for example). */
function splitsPair(s, i) {
  if (i <= 0 || i >= s.length) return false;
  const before = s.charCodeAt(i - 1);
  const after = s.charCodeAt(i);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

/** True when the story's text, title or shared story contains any keyword (case-insensitive, NFKC). */
export function matchesKeywords(story, keywords) {
  const needles = (Array.isArray(keywords) ? keywords : []).map(normLabel).filter(Boolean);
  if (!needles.length) return false;
  return searchableTexts(story).some((t) => {
    const hay = normLabel(t);
    return needles.some((n) => hay.includes(n));
  });
}

function searchableTexts(story) {
  const out = [];
  for (let s = story, depth = 0; isObj(s) && depth < 3; s = s.shared, depth++) {
    for (const t of [s.text, s.title]) if (typeof t === "string" && t) out.push(t);
  }
  return out;
}
