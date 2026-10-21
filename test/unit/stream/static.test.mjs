import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { streamCss } from "../../../src/ui/css/stream.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const STREAM_DIR = path.join(ROOT, "src/ui/stream");

async function sources() {
  const names = (await fs.readdir(STREAM_DIR)).filter((n) => n.endsWith(".js"));
  const files = [...names.map((n) => path.join(STREAM_DIR, n)), path.join(ROOT, "src/ui/css/stream.js")];
  return Promise.all(files.map(async (f) => ({ f: path.relative(ROOT, f), src: await fs.readFile(f, "utf8") })));
}

test("no HTML injection APIs and no page-global patching in the stream UI", async () => {
  for (const { f, src } of await sources()) {
    assert.doesNotMatch(src, /\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/, f);
    assert.doesNotMatch(src, /\b(window|globalThis)\.\w+\s*=[^=]/, f);
    assert.doesNotMatch(src, /\blocalStorage\b/, f);
  }
});

test("streamCss is a well-formed, self-contained stylesheet", () => {
  const css = streamCss({});
  assert.ok(css.length > 1000);
  assert.doesNotMatch(css, /undefined|NaN|\$\{/);
  assert.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length);
  assert.doesNotMatch(css, /url\(/, "no external resources");
  for (const cls of ["mfga-story", "mfga-ufi-item", "mfga-feed-header", "mfga-feed-composer", "mfga-feed-more", "mfga-welcome"]) {
    assert.match(css, new RegExp(`\\.${cls}\\{`), cls);
  }
  assert.deepEqual(streamCss({ look: { font: "tahoma" } }), css, "fonts come from base.js");
});
