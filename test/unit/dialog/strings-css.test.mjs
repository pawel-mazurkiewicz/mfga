import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { STRINGS } from "../../../src/ui/dialog/strings.js";
import { DEFAULTS } from "../../../src/shared/settings.js";
import { baseCss, FONT_LUCIDA, FONT_TAHOMA } from "../../../src/ui/css/base.js";
import { dialogCss } from "../../../src/ui/dialog/dialog-css.js";

test("every settings string exists in English and Polish", () => {
  const en = Object.keys(STRINGS.en).sort();
  const pl = Object.keys(STRINGS.pl).sort();
  assert.deepEqual(pl, en);
  for (const [lang, bundle] of Object.entries(STRINGS)) {
    for (const [key, value] of Object.entries(bundle)) {
      assert.ok(key.startsWith("settings."), `${lang} ${key}`);
      assert.ok(typeof value === "string" && value.trim(), `${lang} ${key} is empty`);
    }
  }
});

test("every settings string is used by the dialog (no dead strings)", () => {
  const dir = new URL("../../../src/ui/dialog/", import.meta.url);
  const source = fs.readdirSync(dir).map((f) => fs.readFileSync(new URL(f, dir), "utf8")).join("\n");
  // Keys the dialog builds from a name: tabs, feed sources, clean-up keys and the shell's parts.
  const built = [/^settings\.tab\.\w+$/, /^settings\.feed\.(?:friends|groups|pages|favorites)$/, /^settings\.look\.(?:fixedHeader|rightColumn|chat)$/];
  for (const key of Object.keys(DEFAULTS.clean)) built.push(new RegExp(`^settings\\.clean\\.${key}$`));
  const unused = Object.keys(STRINGS.en).filter((key) => !source.includes(`"${key}"`) && !built.some((r) => r.test(key)));
  assert.deepEqual(unused, []);
});

test("placeholders match between languages", () => {
  const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const key of Object.keys(STRINGS.en)) assert.equal(vars(STRINGS.pl[key]), vars(STRINGS.en[key]), key);
});

test("every clean-up setting has a label", () => {
  for (const key of Object.keys(DEFAULTS.clean)) assert.ok(STRINGS.en[`settings.clean.${key}`], key);
});

test("Polish uses the 2010 Facebook wording", () => {
  assert.equal(STRINGS.pl["settings.tab.feed"], "Aktualności");
  assert.equal(STRINGS.pl["settings.feed.recent"], "Najnowsze");
  assert.equal(STRINGS.pl["settings.feed.top"], "Najciekawsze");
  assert.match(STRINGS.pl["settings.feed.olderButton"], /Starsze posty/);
});

/** Minimal structural check: balanced braces and every rule has a selector. */
function assertWellFormed(css) {
  let depth = 0;
  for (const ch of css) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    assert.ok(depth >= 0, "unbalanced }");
  }
  assert.equal(depth, 0, "unbalanced {");
  assert.doesNotMatch(css, /(^|})\s*{/, "rule without selector");
  assert.doesNotMatch(css, /undefined|NaN|\[object/);
}

test("baseCss defines every shared base class from CONTRACTS §1", () => {
  const css = baseCss({});
  assertWellFormed(css);
  for (const cls of [
    "mfga-ui", "mfga-btn", "mfga-btn-confirm", "mfga-btn-small", "mfga-input", "mfga-textarea", "mfga-muted", "mfga-sep",
    "mfga-box", "mfga-box-title", "mfga-see-all", "mfga-spinner", "mfga-pill", "mfga-badge", "mfga-notice", "mfga-error",
  ]) {
    assert.match(css, new RegExp(`\\.${cls}[\\s{:,.+>\\[]`), cls);
  }
});

test("baseCss switches the font stack on html[data-mfga-font]", () => {
  const css = baseCss({});
  assert.ok(FONT_LUCIDA.startsWith('"lucida grande", tahoma'));
  assert.ok(FONT_TAHOMA.startsWith('tahoma, "lucida grande"'));
  assert.ok(css.includes(`.mfga-ui{--mfga-font:${FONT_LUCIDA}`));
  assert.ok(css.includes(`html[data-mfga-font="tahoma"] .mfga-ui{--mfga-font:${FONT_TAHOMA}}`));
});

test("baseCss uses the canonical 2010 palette", () => {
  const css = baseCss({}).toUpperCase();
  for (const colour of ["#3B5998", "#333", "#808080", "#999", "#BDC7D8", "#5B74A8", "#29447E", "#F03D25", "#FFF9D7", "#E2C822", "#6D84B4", "#E9E9E9"]) {
    assert.ok(css.includes(colour), colour);
  }
});

test("dialogCss carries the pop_dialog frame and title bar", () => {
  const css = dialogCss();
  assertWellFormed(css);
  assert.match(css, /\.mfga-dialog\{[^}]*padding:10px;[^}]*border-radius:8px;[^}]*background:rgba\(82,82,82,\.7\)/);
  assert.match(css, /\.mfga-dialog-title\{[^}]*border:1px solid #3B5998;[^}]*background:#6D84B4;[^}]*color:#FFF;[^}]*font-size:14px;[^}]*font-weight:bold/);
  assert.match(css, /\.mfga-dialog-footer\{[^}]*background:#F2F2F2/);
  assert.doesNotMatch(css, /!important/);
});
