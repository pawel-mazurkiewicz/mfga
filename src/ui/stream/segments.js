// Message text + entity ranges -> text/link segments.
// Local stand-in with the contract signature of WP-A's `textSegments` (src/data/text.js), which did not
// exist when the stream UI was written. Swap the import in story.js/parts.js once it lands.

const SHIM_HOSTS = new Set(["l.facebook.com", "lm.facebook.com"]);

const isWeb = (u) => u.protocol === "http:" || u.protocol === "https:";

/** Absolute http(s) URL, with l.facebook.com/l.php?u=<target> unwrapped; null for anything else. */
export function unwrapShim(url) {
  try {
    const u = new URL(url, "https://www.facebook.com/");
    if (!isWeb(u)) return null;
    if (!SHIM_HOSTS.has(u.hostname) || u.pathname !== "/l.php") return u.href;
    const target = new URL(u.searchParams.get("u") || "");
    return isWeb(target) ? target.href : null;
  } catch {
    return null;
  }
}

const isIndex = (n) => Number.isInteger(n) && n >= 0;

/**
 * textSegments("Hi Amy #tbt", [{offset:3, length:3, url, kind:"user"}])
 *   -> [{text:"Hi "}, {text:"Amy", url, kind:"user"}, {text:" #tbt"}]
 * Offsets are UTF-16 indices. Ranges without a usable URL, out of range or overlapping an earlier one are
 * ignored (their text stays plain).
 */
export function textSegments(text, ranges = []) {
  const s = text == null ? "" : String(text);
  const usable = (Array.isArray(ranges) ? ranges : [])
    .filter((r) => r && isIndex(r.offset) && isIndex(r.length) && r.length > 0 && r.offset + r.length <= s.length)
    .sort((a, b) => a.offset - b.offset);
  const out = [];
  let pos = 0;
  for (const r of usable) {
    if (r.offset < pos) continue;
    const url = r.url ? unwrapShim(r.url) : null;
    if (!url) continue;
    if (r.offset > pos) out.push({ text: s.slice(pos, r.offset) });
    out.push({ text: s.slice(r.offset, r.offset + r.length), url, kind: r.kind || "other" });
    pos = r.offset + r.length;
  }
  if (pos < s.length) out.push({ text: s.slice(pos) });
  return out;
}
