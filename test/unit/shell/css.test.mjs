import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shellCss } from "../../../src/ui/css/shell.js";
import { DEFAULTS } from "../../../src/shared/settings.js";
import { ICON_NAMES } from "../../../src/ui/icons.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const css = shellCss(DEFAULTS);

test("Facebook's header height follows the 41px 2010 bar", () => {
  assert.match(css, /html\[data-mfga-shell\][^{]*\{--header-height:41px!important\}/);
});

test("the banner is hidden with visibility (its dropdown layers survive), never display:none", () => {
  const rule = /\[role="banner"\]:not\(\[role="dialog"\] \*\)\{([^}]*)\}/.exec(css)[1];
  assert.match(rule, /visibility:hidden!important/);
  assert.match(rule, /height:0!important/);
  assert.doesNotMatch(rule, /display:\s*none/);
  assert.match(css, /\[role="banner"\] :is\(\[role="dialog"\],\[role="menu"\],\[role="listbox"\],\[role="tooltip"\]\)\{visibility:visible!important/);
  assert.match(css, /html\[data-mfga-shell\]:not\(\[data-mfga-native-banner\]\)/, "Log Out can reveal it");
});

test("the main column is clamped and moved through measured variables", () => {
  assert.match(css, /\[data-mfga-main\]\{[^}]*left:var\(--mfga-main-dx,0px\)!important;top:var\(--mfga-main-dy,0px\)!important/);
  assert.match(css, /html\[data-mfga-route="home"\] \[data-mfga-main\]\{width:520px!important;max-width:520px!important/);
  assert.doesNotMatch(css, /transform/, "transform would capture Facebook's fixed descendants");
});

test("the 2010 palette and grid are in place", () => {
  for (const color of ["#3B5998", "#627AAD", "#D8DFEA", "#F03D25", "#E9E9E9", "#CCC", "#6D84B4"]) assert.ok(css.includes(color), color);
  assert.match(css, /\.mfga-shell-left\{position:absolute;left:0px;top:61px;z-index:0;width:179px\}/);
  assert.match(css, /\.mfga-shell-right\{position:absolute;left:730px;top:61px;z-index:0;width:233px\}/);
  assert.match(css, /\.mfga-header\{position:absolute;top:0;left:0;right:0;min-width:980px;height:41px/);
});

test("shell layers stay at z-index 0 so Facebook's layers, dialogs and docked chat paint above them", () => {
  const zs = [...css.matchAll(/z-index:(\d+)/g)].map((m) => Number(m[1]));
  assert.ok(zs.every((z) => z <= 2), String(zs));
  assert.match(css, /\.mfga-chat-tab\{position:fixed;right:15px;bottom:0;z-index:0/);
  assert.match(css, /html\[data-mfga-fixed-header\] #mfga-shell \.mfga-header\{position:fixed;z-index:1\}/, "a fixed bar must stay above the scrolling page");
  assert.match(css, /html\[data-mfga-fixed-header\]:has\(\[role="dialog"\]:not\(\[role="banner"\] \*\)\) #mfga-shell \.mfga-header\{z-index:0\}/, "…but not above Facebook's dialogs");
  assert.match(css, /#mfga-shell \.mfga-header\.mfga-header-open\{z-index:2\}/, "the open account menu sits above the page");
});

test("Facebook's wrappers are click-through on every shell route, transparent only around the columns", () => {
  assert.match(css, /html\[data-mfga-shell\] \[data-mfga-pass\]\{pointer-events:none!important\}/);
  assert.match(css, /:where\(html\[data-mfga-shell\] \[data-mfga-pass\]>:not\(\[data-mfga-pass\]\)\)\{pointer-events:auto\}/, "zero specificity: Facebook's own pointer-events rules win");
  assert.match(css, /html\[data-mfga-route="home"\] \[data-mfga-pass\],html\[data-mfga-route="groups-feed"\] \[data-mfga-pass\]\{background:transparent!important;overflow:visible!important\}/);
});

test("no shell source file uses innerHTML-like sinks, and every icon it names exists", () => {
  const files = ["src/ui/shell", "src/fb"].flatMap((dir) =>
    fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".js")).map((f) => path.join(ROOT, dir, f)),
  );
  const mine = files.filter((f) => /shell|chrome-reader|routes|nav\.js|layout/.test(f));
  for (const f of [...mine, path.join(ROOT, "src/ui/css/shell.js")]) {
    const src = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, f);
    for (const m of src.matchAll(/icon\("([a-z0-9_]+)"/g)) assert.ok(ICON_NAMES.includes(m[1]), `${f}: ${m[1]}`);
    for (const m of src.matchAll(/"((?:nav|rc|chat|misc|jewel)_[a-z0-9_]+)"/g)) assert.ok(ICON_NAMES.includes(m[1]), `${f}: ${m[1]}`);
  }
});
