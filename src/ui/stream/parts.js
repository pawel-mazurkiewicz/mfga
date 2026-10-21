// Small DOM builders shared by stories, attachments and the UFI.
import { h, svg, text } from "../dom.js";
import { safe } from "../../shared/util.js";
import { textSegments } from "./segments.js";

const FACEBOOK_HOST = /(^|\.)facebook\.com$/i;

export function isFacebookUrl(url) {
  try {
    return FACEBOOK_HOST.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * <a> to a URL from Facebook data. Facebook URLs are marked `data-mfga-open` so plain clicks go through
 * ctx.open (see routeClicks); other sites open in a new tab. Unusable URLs give a plain <span>.
 */
export function link(url, props, ...children) {
  const a = h("a", { ...props, href: url }, ...children);
  if (!a.hasAttribute("href")) return h("span", { class: props?.class }, ...children);
  if (isFacebookUrl(a.href)) {
    a.setAttribute("data-mfga-open", "");
  } else {
    a.target = "_blank";
    a.rel = "noopener noreferrer nofollow";
  }
  return a;
}

/** 2010 "uiLinkButton": a <button> that looks like a link (Like, Comment, View all ...). */
export function linkButton(label, onClick, cls = "") {
  return h("button", { type: "button", class: ["mfga-linkbtn", cls], onclick: guard(onClick) }, label);
}

/** Error boundary for UI callbacks: records the error in the health panel, keeps the stream alive. */
export function guard(fn) {
  return safe("stream.ui", fn, { disableOnError: false });
}

/** " · " separator of 2010 action lines. */
export function sep() {
  return h("span.mfga-sep", " · ");
}

/** The default "silhouette" picture for people without a usable avatar. */
function blankPicture() {
  return svg(
    "svg",
    { class: "mfga-pic-blank", viewBox: "0 0 50 50", "aria-hidden": "true" },
    svg("rect", { width: 50, height: 50, fill: "#F0F2F7" }),
    svg("circle", { cx: 25, cy: 19, r: 9, fill: "#BFC8DB" }),
    svg("path", { d: "M8 50C8 37 15 31 25 31S42 37 42 50Z", fill: "#BFC8DB" }),
  );
}

/** Square profile picture (CSS sets the size through `cls`), linked to the profile when known. */
export function avatar(profileUrl, pictureUri, cls) {
  const img = pictureUri ? h("img", { src: pictureUri, alt: "", loading: "lazy", decoding: "async" }) : null;
  const pic = img && img.hasAttribute("src") ? img : blankPicture();
  return link(profileUrl, { class: cls, tabindex: "-1", "aria-hidden": "true" }, pic);
}

/** Text segments -> text nodes and links. */
export function segmentNodes(segments) {
  return segments.map((s) => (s.url ? link(s.url, { class: `mfga-entity mfga-entity-${s.kind || "other"}` }, s.text) : text(s.text)));
}

/** Message text with its entity ranges as linked nodes. */
export function richText(value, ranges) {
  return segmentNodes(textSegments(value, ranges));
}

/** Plain left clicks on internal links inside `root` call ctx.open(url) instead of a page load. */
export function routeClicks(root, ctx) {
  root.addEventListener(
    "click",
    guard((ev) => {
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const a = ev.target.closest?.("a[data-mfga-open]");
      if (!a || !root.contains(a) || typeof ctx.open !== "function") return;
      ev.preventDefault();
      ctx.open(a.href, { newTab: false });
    }),
  );
}

/** Current time in ms from the context clock. */
export function nowMs(ctx) {
  const v = typeof ctx?.now === "function" ? ctx.now() : NaN;
  return Number.isFinite(v) ? v : Date.now();
}
