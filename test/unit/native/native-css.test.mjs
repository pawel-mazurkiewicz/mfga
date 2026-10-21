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
