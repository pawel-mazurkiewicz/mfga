// Tiny DOM builder. The only way MFGA creates UI: no innerHTML anywhere, user content is always text.

const SVG_NS = "http://www.w3.org/2000/svg";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** Returns an absolute, safe URL string or null. Relative URLs resolve against facebook.com. */
export function safeUrl(url, base = "https://www.facebook.com/") {
  if (url == null || url === "") return null;
  try {
    const u = new URL(String(url), base);
    return ALLOWED_PROTOCOLS.has(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

function setProp(el, key, value) {
  if (value == null || value === false) return;
  if (key === "class" || key === "className") {
    el.setAttribute("class", Array.isArray(value) ? value.filter(Boolean).join(" ") : String(value));
  } else if (key === "style" && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (v == null) continue;
      if (k.startsWith("--")) el.style.setProperty(k, String(v));
      else el.style[k] = typeof v === "number" && !/^(opacity|zIndex|flex|fontWeight|lineHeight)$/.test(k) ? `${v}px` : String(v);
    }
  } else if (key === "dataset" && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) if (v != null) el.dataset[k] = String(v);
  } else if (key.startsWith("on") && typeof value === "function") {
    el.addEventListener(key.slice(2).toLowerCase(), value);
  } else if (key === "href" || key === "src") {
    const safe = safeUrl(value);
    if (safe) el.setAttribute(key, safe);
  } else if (key === "text") {
    el.textContent = String(value);
  } else if (value === true) {
    el.setAttribute(key, "");
  } else {
    el.setAttribute(key, String(value));
  }
}

function append(el, child) {
  if (child == null || child === false || child === true) return;
  if (Array.isArray(child)) {
    for (const c of child) append(el, c);
  } else if (child instanceof Node) {
    el.appendChild(child);
  } else {
    el.appendChild(document.createTextNode(String(child)));
  }
}

/**
 * h("a.mfga-link", {href, onclick}, "text", child, [more])
 * The tag may carry ".class" and "#id" suffixes. Strings and numbers become text nodes.
 */
export function h(tag, props, ...children) {
  if (props instanceof Node || Array.isArray(props) || typeof props !== "object" || props === null) {
    if (props !== undefined && props !== null) children.unshift(props);
    props = {};
  }
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(tag);
  const name = (m && m[1]) || "div";
  const el = document.createElement(name);
  if (m && m[2]) {
    const classes = [];
    for (const part of m[2].match(/[.#][\w-]+/g) || []) {
      if (part[0] === ".") classes.push(part.slice(1));
      else el.id = part.slice(1);
    }
    if (classes.length) el.setAttribute("class", classes.join(" "));
  }
  for (const [k, v] of Object.entries(props)) {
    if ((k === "class" || k === "className") && el.hasAttribute("class") && v) {
      el.setAttribute("class", `${el.getAttribute("class")} ${Array.isArray(v) ? v.filter(Boolean).join(" ") : v}`);
    } else {
      setProp(el, k, v);
    }
  }
  append(el, children);
  return el;
}

/** SVG element builder with the same calling convention (no class/id shorthand). */
export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  append(el, children);
  return el;
}

export function text(s) {
  return document.createTextNode(s == null ? "" : String(s));
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Replaces el's children with the given nodes. */
export function replaceChildren(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

/** Joins nodes with a separator node factory, e.g. 2010's " · " between links. */
export function joinNodes(nodes, sep = () => text(" · ")) {
  const out = [];
  nodes.filter(Boolean).forEach((n, i) => {
    if (i) out.push(sep());
    out.push(n);
  });
  return out;
}
