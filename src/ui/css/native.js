// Stylesheet for the native path: the cleaner's hide rules and the 2010 skin for Facebook-rendered posts
// (parts tagged by src/fb/skin.js). Facebook nodes are restyled only from here, never inline.

import { registerStrings, t } from "../../shared/i18n.js";

registerStrings({
  en: { "clean.like": "Like", "clean.comment": "Comment", "clean.share": "Share" },
  pl: { "clean.like": "Lubię to!", "clean.comment": "Komentarz", "clean.share": "Udostępnij" },
});

const cssString = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;

// A hidden unit's first child carries the mark; :has() hides the [aria-posinset] slot itself, so no
// attribute is ever written on the feed list's direct children (dom-feed §4.11).
const HIDE = `[aria-posinset]:has(> [data-mfga-hide]), [data-mfga-hide] { display: none !important; }`;

const S = "html[data-mfga-skin]";
const P = (part) => `${S} [data-mfga-part="${part}"]`;
const IN = (part) => `[data-mfga-part="${part}"]`; // for descendant chains after a P()

function skinRules() {
  return `
${S} { --mfga-indent: 58px; }
${S} [aria-posinset]:not([role]) {
  border-bottom: 1px solid #E9E9E9;
  --card-corner-radius: 0px; --card-box-shadow: none; --shadow-base: none; --shadow-2: transparent;
  --comment-background: #EDEFF4; --comment-bubble: 0px;
}

${P("avatar")} { flex: none !important; }
${P("avatar")} svg { width: 50px !important; height: 50px !important; border-radius: 0 !important; }
${P("avatar")} svg g[mask] { mask: none !important; }
${P("avatar")} svg image { x: 0; y: 0; width: 50px !important; height: 50px !important; }
${P("avatar")} svg g > :not(image), ${P("avatar")} svg > circle { display: none !important; }
${P("avatar")} img { width: 50px !important; height: 50px !important; border-radius: 0 !important; object-fit: cover; }

${P("name")} :is(h2, h3, h4), ${P("name")} :is(h2, h3, h4) * { font-size: 13px !important; line-height: 16px !important; }
${P("name")} a, ${P("name")} a * { color: #3B5998 !important; font-weight: bold !important; }
${P("name")} a:hover { text-decoration: underline !important; }

${P("byline")}, ${P("byline")} * { font-size: 11px !important; line-height: 14px !important; color: #808080 !important; }
${P("byline")} a:hover { text-decoration: underline !important; }

${P("message")} { margin-inline-start: var(--mfga-indent) !important; }
${P("message")}, ${P("message")} * { font-size: 13px !important; line-height: 16px !important; color: #333 !important; }
${P("message")} a, ${P("message")} a *, ${P("message")} [role="button"] { color: #3B5998 !important; font-weight: normal !important; }

${P("attachment")} { margin-inline: calc(var(--mfga-indent) + 16px) 16px !important; }
${P("attachment")} * { border-radius: 0 !important; }
/* Shared posts and reels inside an attachment: square avatars and blue names, like the post's own header. */
${P("attachment")} svg g[mask] { mask: none !important; }
${P("attachment")} svg g[mask] > :not(image) { display: none !important; }
${P("attachment")} [data-ad-rendering-role="profile_name"] a, ${P("attachment")} [data-ad-rendering-role="profile_name"] a * {
  color: #3B5998 !important; font-weight: bold !important;
}

${P("actions")} {
  display: flex !important; flex-wrap: wrap !important; justify-content: flex-start !important; align-items: center !important;
  gap: 0 !important; margin: 0 0 0 var(--mfga-indent) !important; padding: 3px 0 !important; border: 0 !important; min-height: 0 !important;
}
${P("actions")} > * { flex: none !important; width: auto !important; margin: 0 !important; padding: 0 !important; }
${P("actions")} [role="button"]:not([data-mfga-action]):not([data-mfga-part="summary"] [role="button"]) { display: none !important; }
${S} [data-mfga-action] {
  display: inline-flex !important; align-items: center !important; padding: 0 !important; margin: 0 !important;
  min-height: 0 !important; height: auto !important; background: none !important; border: 0 !important; border-radius: 0 !important; cursor: pointer;
}
${S} [data-mfga-action], ${S} [data-mfga-action] * { color: #3B5998 !important; font-size: 11px !important; line-height: 14px !important; font-weight: normal !important; }
${S} [data-mfga-action] * { gap: 0 !important; margin: 0 !important; padding: 0 !important; }
${S} [data-mfga-action] i[data-visualcompletion="css-img"], ${S} [data-mfga-action] [role="none"], ${S} [data-mfga-action] svg {
  display: none !important;
}
${S} [data-mfga-action]:hover { text-decoration: underline !important; }
${S} [data-mfga-action="comment"]::before, ${S} [data-mfga-action="share"]::before {
  content: "\\00B7"; display: inline-block; padding: 0 5px; color: #999; text-decoration: none;
}
${S} [data-mfga-action][data-mfga-count] > * { display: none !important; }
${S} [data-mfga-action="like"][data-mfga-count]::after { content: ${cssString(t("clean.like"))}; }
${S} [data-mfga-action="comment"][data-mfga-count]::after { content: ${cssString(t("clean.comment"))}; }
${S} [data-mfga-action="share"][data-mfga-count]::after { content: ${cssString(t("clean.share"))}; }

${P("summary")}, ${P("comments")}, ${P("composer")} {
  background: #EDEFF4 !important; margin: 2px 0 0 var(--mfga-indent) !important; border: 0 !important; border-radius: 0 !important;
}
${P("summary")} { padding: 5px !important; justify-content: flex-start !important; gap: 0 12px !important; }
/* 2010 order: "Like · Comment · Share" first, then the light-blue box (likes, comments, composer). */
${P("footer")} { display: flex !important; flex-direction: column !important; }
${P("footer")} > ${IN("summary")} { order: 1; }
${P("actions")} ${IN("summary")} { flex: 1 1 100% !important; margin-left: 0 !important; }
${P("summary")}, ${P("summary")} *, ${P("comments")}, ${P("comments")} *, ${P("composer")} * {
  font-size: 11px !important; line-height: 14px !important;
}
${P("summary")} :is(img, svg) { width: 13px !important; height: 13px !important; }
${P("summary")} a, ${P("summary")} a *, ${P("comments")} a, ${P("comments")} a * { color: #3B5998 !important; }

${P("comments")} { padding: 0 !important; }
${P("comments")} [role="article"] { padding: 5px 5px 4px !important; border-top: 2px solid #FFFFFF; gap: 7px !important; }
${P("comments")} [role="article"] * { padding: 0 !important; }
${P("comments")} li [role="button"] { color: #3B5998 !important; font-weight: normal !important; }
${P("comments")} li a, ${P("comments")} li a * { color: #808080 !important; font-weight: normal !important; }
${P("comments")} *, ${P("composer")} * { border-radius: 0 !important; }
${P("comments")} svg g[mask], ${P("composer")} svg g[mask] { mask: none !important; }
${P("comments")} svg:has(image), ${P("composer")} svg:has(image) { width: 32px !important; height: 32px !important; }
${P("comments")} svg image, ${P("composer")} svg image { x: 0; y: 0; width: 32px !important; height: 32px !important; }
${P("comments")} svg g > :not(image), ${P("composer")} svg g > :not(image) { display: none !important; }

${P("composer")} { padding: 5px !important; }
${P("composer")} :not([role="textbox"]) { padding: 0 !important; }
${P("composer")}:has(form) > :not(form):not(:has(form)) { display: none !important; }
${P("composer")} [role="textbox"] {
  background: #FFFFFF !important; border: 1px solid #BDC7D8 !important; padding: 3px !important;
  min-height: 14px !important; color: #333 !important;
}
`;
}

/** Hide rules for the cleaner's marks, plus the 2010 post skin when settings.look.skinPosts is on. */
export function nativeCss(settings) {
  return settings?.look?.skinPosts === false ? HIDE : `${HIDE}\n${skinRules()}`;
}
