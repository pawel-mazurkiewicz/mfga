// Pure helpers behind the settings dialog's controls: they turn a control's new value into the patch handed
// to settings.update(). No DOM here, so they are unit-tested directly.

export const FEED_SOURCES = ["friends", "groups", "pages", "favorites"];
export const PAGE_SIZES = [5, 10, 15, 20, 25, 30];
export const MAX_KEYWORDS = 200;

/** patchFor("feed.sources.groups", false) -> { feed: { sources: { groups: false } } } */
export function patchFor(path, value) {
  return path
    .split(".")
    .reduceRight((inner, key) => ({ [key]: inner }), value);
}

/**
 * Patch for toggling one News Feed source, or null when that would leave no source at all
 * (an empty "Most Recent" feed is never what anyone wants).
 */
export function sourcesPatch(sources, name, checked) {
  if (!checked && !FEED_SOURCES.some((s) => s !== name && sources?.[s])) return null;
  return patchFor(`feed.sources.${name}`, checked);
}

/** Turning the welcome box back on also forgets that it was dismissed, so it really comes back. */
export function welcomePatch(checked) {
  return checked ? { look: { welcome: true }, state: { welcomeDismissed: false } } : { look: { welcome: false } };
}

/** Textarea text -> keyword list: one phrase per line, trimmed, blank lines and repeats (any case) dropped. */
export function parseKeywords(text) {
  const seen = new Set();
  const out = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const phrase = line.trim().replace(/\s+/g, " ");
    const key = phrase.normalize("NFKC").toLowerCase();
    if (!phrase || seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

export function formatKeywords(keywords) {
  return (Array.isArray(keywords) ? keywords : []).join("\n");
}

export function sameList(a, b) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** The "Stories at a time" choices, including the current value when it is not one of the presets. */
export function pageSizeOptions(current) {
  const n = Number(current);
  const all = Number.isFinite(n) && !PAGE_SIZES.includes(n) ? [...PAGE_SIZES, n] : PAGE_SIZES;
  return [...all].sort((x, y) => x - y);
}
