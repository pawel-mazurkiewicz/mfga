// Server-side HTML string builder for the fake facebook.com. Every text and attribute value is escaped;
// only values wrapped in `raw()` are emitted verbatim (used for already-built markup and inert JSON).

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const SVG_LEAF = new Set(["image", "use", "circle", "rect", "path", "stop", "ellipse", "polygon", "line"]);

class Raw {
  constructor(html) {
    this.html = html;
  }
  toString() {
    return this.html;
  }
}

export const raw = (html) => new Raw(String(html));

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function attrs(map) {
  let out = "";
  for (const [k, v] of Object.entries(map || {})) {
    if (v == null || v === false) continue;
    out += v === true ? ` ${k}` : ` ${k}="${esc(v)}"`;
  }
  return out;
}

function children(list) {
  let out = "";
  for (const c of list) {
    if (c == null || c === false || c === true) continue;
    if (Array.isArray(c)) out += children(c);
    else if (c instanceof Raw) out += c.html;
    else out += esc(c);
  }
  return out;
}

/** el("div", {role: "main"}, "text", el(...), [more]) -> Raw. `attrs` may be omitted. */
export function el(tag, attrMap, ...kids) {
  if (attrMap instanceof Raw || Array.isArray(attrMap) || typeof attrMap !== "object" || attrMap === null) {
    if (attrMap !== undefined && attrMap !== null) kids.unshift(attrMap);
    attrMap = {};
  }
  if (VOID.has(tag)) return raw(`<${tag}${attrs(attrMap)}>`);
  if (SVG_LEAF.has(tag) && kids.length === 0) return raw(`<${tag}${attrs(attrMap)}/>`);
  return raw(`<${tag}${attrs(attrMap)}>${children(kids)}</${tag}>`);
}

/**
 * JSON as Facebook inlines it: "/" escaped as "\/" and every non-ASCII character as \uXXXX, which also makes
 * the text safe inside <script> (no "</script", no U+2028).
 */
export function inlineJson(value) {
  return JSON.stringify(value)
    .replace(/\//g, "\\/")
    .replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** <script type="application/json" data-content-len=N data-sjs>…</script> as served in 2026. */
export function sjsScript(value, nonce) {
  const body = inlineJson(value);
  return raw(`<script type="application/json" nonce="${esc(nonce)}" data-content-len="${Buffer.byteLength(body)}" data-sjs>${body}</script>`);
}

/** Facebook's bootstrap: a data: URL script running requireLazy(["ServerJSPayloadListener"], m => m.process()). */
export function payloadListenerScript(nonce) {
  const js = 'requireLazy(["ServerJSPayloadListener"],function(m){m.process();},null,0x100)';
  return raw(`<script src="data:text/javascript;base64,${Buffer.from(js).toString("base64")}" nonce="${esc(nonce)}"></script>`);
}
