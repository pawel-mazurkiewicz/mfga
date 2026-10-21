import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { themeCss, themeTokenNames, FONT_STACKS } from "../../../src/ui/css/theme.js";
import { DEFAULTS } from "../../../src/shared/settings.js";

const FB_VARS = readFileSync(new URL("../../fixtures/native/fb-light-vars.css", import.meta.url), "utf8");
const FB_TOKENS = new Set([...FB_VARS.matchAll(/^(--[a-z0-9-]+):/gm)].map((m) => m[1]));
const settings = (look = {}) => ({ ...DEFAULTS, look: { ...DEFAULTS.look, ...look } });

/** [{selectors: string[], decls: Map}] from a flat stylesheet (no nesting, no at-rules). */
function parse(css) {
  return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, sel, body]) => ({
    selectors: sel.split(",").map((s) => s.trim()),
    decls: new Map([...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.replace(/\s*!important\s*$/, "").trim()])),
  }));
}

test("Facebook's light theme fixture has its full token set", () => {
  assert.ok(FB_TOKENS.size > 900, `${FB_TOKENS.size} tokens`);
});

test("every overridden token exists in Facebook's fb-light-vars.css", () => {
  const declared = new Set(parse(themeCss(settings())).flatMap((r) => [...r.decls.keys()]));
  for (const name of [...themeTokenNames(), ...declared]) assert.ok(FB_TOKENS.has(name), `${name} is not a Facebook token`);
  assert.deepEqual([...declared].sort(), [...new Set(themeTokenNames())].sort());
});

test("rules target only the root element, in its light and dark modes", () => {
  const rules = parse(themeCss(settings()));
  for (const { selectors } of rules) {
    for (const s of selectors) {
      assert.match(s, /^html\[data-mfga-theme\]/, s);
      assert.doesNotMatch(s, /\s\.__fb-(dark|light)-mode/, `${s} would override a nested island`);
    }
  }
  const tokenRule = rules.find((r) => r.decls.has("--web-wash"));
  assert.deepEqual(tokenRule.selectors, ["html[data-mfga-theme]", "html[data-mfga-theme].__fb-light-mode", "html[data-mfga-theme].__fb-dark-mode"]);
});

test("2010 palette, square corners and no shadows", () => {
  const d = parse(themeCss(settings())).find((r) => r.decls.has("--web-wash")).decls;
  const expect = {
    "--web-wash": "#FFFFFF", "--card-background": "#FFFFFF", "--surface-background": "#FFFFFF",
    "--primary-text": "#333333", "--secondary-text": "#808080", "--blue-link": "#3B5998", "--accent": "#3B5998",
    "--primary-button-background": "#5B74A8", "--divider": "#E9E9E9", "--comment-background": "#EDEFF4",
    "--card-corner-radius": "0px", "--comment-bubble": "0px", "--card-box-shadow": "none", "--shadow-base": "none",
  };
  for (const [k, v] of Object.entries(expect)) assert.equal(d.get(k), v, k);
  for (const [k, v] of d) {
    if (/corner-radius|radius$|^--comment-bubble$/.test(k)) assert.ok(parseFloat(v) <= 3, `${k}: ${v}`);
    if (/^--(card-box-shadow|shadow-(base|elevated|emphasis))$/.test(k)) assert.equal(v, "none", k);
  }
});

test("type scale: 11-13px body text and 16px headlines, as rem against a 16px root", () => {
  const d = parse(themeCss(settings())).find((r) => r.decls.has("--web-wash")).decls;
  const px = (k) => parseFloat(d.get(k)) * 16;
  assert.equal(d.get("--body-font-size"), "0.8125rem");
  assert.equal(px("--body-font-size"), 13);
  assert.equal(px("--meta-font-size"), 11);
  assert.equal(px("--headline1-font-size"), 16);
  for (const [k, v] of d) {
    if (!k.endsWith("-font-size")) continue;
    assert.match(v, /^[\d.]+rem$/, k);
    const size = parseFloat(v) * 16;
    assert.ok(size >= 11 && size <= 16, `${k}: ${size}px`);
    if (/^--(body|meta|primary-label|secondary-label|tertiary-label)/.test(k)) assert.ok(size <= 13, `${k}: ${size}px`);
  }
});

test("font families follow settings.look.font and html[data-mfga-font]", () => {
  const lucida = parse(themeCss(settings({ font: "lucida" }))).find((r) => r.decls.has("--web-wash")).decls;
  assert.equal(lucida.get("--body-font-family"), FONT_STACKS.lucida);
  assert.equal(lucida.get("--headline1-font-family"), FONT_STACKS.lucida);
  assert.equal(FONT_STACKS.lucida, '"lucida grande", tahoma, verdana, arial, sans-serif');
  const tahoma = parse(themeCss(settings({ font: "tahoma" }))).find((r) => r.decls.has("--web-wash")).decls;
  assert.ok(tahoma.get("--body-font-family").startsWith("tahoma"));
  const byAttr = parse(themeCss(settings())).find((r) => r.selectors[0] === 'html[data-mfga-theme][data-mfga-font="tahoma"]');
  assert.equal(byAttr.decls.get("--meta-font-family"), FONT_STACKS.tahoma);
  assert.ok([...byAttr.decls.keys()].every((k) => k.endsWith("font-family")));
  const bogus = parse(themeCss(settings({ font: "comic" }))).find((r) => r.decls.has("--web-wash")).decls;
  assert.equal(bogus.get("--body-font-family"), FONT_STACKS.lucida);
});

test("theme off produces no CSS", () => {
  assert.equal(themeCss(settings({ theme: false })), "");
  assert.ok(themeCss(undefined).length > 0, "defaults when settings are missing");
});
