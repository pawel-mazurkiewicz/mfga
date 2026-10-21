import { test } from "node:test";
import assert from "node:assert/strict";
import { nativeCss } from "../../../src/ui/css/native.js";
import { setLocale } from "../../../src/shared/i18n.js";
import { DEFAULTS } from "../../../src/shared/settings.js";

const settings = (look = {}) => ({ ...DEFAULTS, look: { ...DEFAULTS.look, ...look } });
/** Splits a selector list on its top-level commas (not those inside :is() / :not()). */
function splitList(list) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  return [...out, cur.trim()];
}
const selectors = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{[^}]*\}/g)].flatMap(([, sel]) => splitList(sel));

test("hide rules: the marked first child and its [aria-posinset] slot via :has()", () => {
  const css = nativeCss(settings());
  assert.ok(css.includes("[aria-posinset]:has(> [data-mfga-hide]), [data-mfga-hide] { display: none !important; }"));
  for (const s of selectors(css)) {
    assert.doesNotMatch(s, /(^|\s):has\(/, `unanchored :has() in ${s}`);
    assert.doesNotMatch(s, /(^|\s)div:has\(/, `:has() on every div in ${s}`);
  }
});

test("skin rules are scoped to html[data-mfga-skin] and never repeat the root", () => {
  const all = selectors(nativeCss(settings()));
  const skin = all.filter((s) => !s.includes("data-mfga-hide"));
  assert.ok(skin.length > 30);
  for (const s of skin) {
    assert.match(s, /^html\[data-mfga-skin\]/, s);
    assert.equal(s.split("html[").length, 2, `root repeated in ${s}`);
  }
  for (const part of ["avatar", "name", "byline", "message", "attachment", "actions", "summary", "comments", "composer", "footer"]) {
    assert.ok(skin.some((s) => s.includes(`[data-mfga-part="${part}"]`)), part);
  }
});

test("skinPosts off leaves only the hide rules", () => {
  const css = nativeCss(settings({ skinPosts: false }));
  assert.ok(css.includes("[data-mfga-hide]"));
  assert.ok(!css.includes("data-mfga-skin"));
});

test("one body column: attachments, Like · Comment · Share and the UFI box start where the message text does", () => {
  // Live 2026 posts inset the header and message text 12px but run the action bar and comments edge to edge,
  // so everything after the message is pushed by the same 12px (it used to start 12px left of the text).
  const css = nativeCss(settings()).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /--mfga-indent: 58px; --mfga-pad: 12px;/);
  const body = "calc(var(--mfga-indent) + var(--mfga-pad))";
  const rule = (sel) => new RegExp(`${sel.replace(/[[\]().*+?^$|\\]/g, "\\$&")}[^{]*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  assert.ok(rule('[data-mfga-part="attachment"] ').includes(`margin-inline: ${body} var(--mfga-pad) !important`));
  assert.ok(rule('[data-mfga-part="actions"] ').includes(`margin: 0 0 0 ${body} !important`));
  assert.ok(rule('[data-mfga-part="summary"], ').includes(`margin: 2px var(--mfga-pad) 0 ${body} !important`), "summary, comments, composer: under the text, as wide as the photo");
  assert.ok(rule('[data-mfga-part="message"] ').includes("margin-inline-start: var(--mfga-indent) !important"), "the text's own 12px inset follows");
});

test("2010 values: blue bold names, 13px text, 11px action links, #EDEFF4 UFI", () => {
  const css = nativeCss(settings());
  assert.match(css, /\[data-mfga-part="name"\] a, [^{]*\{ color: #3B5998 !important; font-weight: bold !important; \}/);
  assert.match(css, /\[data-mfga-part="message"\] \* \{ font-size: 13px !important;/);
  assert.match(css, /\[data-mfga-action\] \* \{ color: #3B5998 !important; font-size: 11px !important;/);
  assert.match(css, /background: #EDEFF4 !important;/);
  assert.match(css, /svg g\[mask\] \{ mask: none !important; \}/);
  assert.match(css, /width: 50px !important; height: 50px !important;/);
});

test("count-only action buttons get the localized 2010 word", () => {
  setLocale("en");
  assert.ok(nativeCss(settings()).includes('[data-mfga-action="like"][data-mfga-count]::after { content: "Like"; }'));
  setLocale("pl");
  const pl = nativeCss(settings());
  assert.ok(pl.includes('content: "Lubię to!"'));
  assert.ok(pl.includes('content: "Komentarz"'));
  assert.ok(pl.includes('content: "Udostępnij"'));
  setLocale("en");
});
