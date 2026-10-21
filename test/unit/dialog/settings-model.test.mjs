import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, sanitize } from "../../../src/shared/settings.js";
import {
  FEED_SOURCES,
  MAX_KEYWORDS,
  formatKeywords,
  pageSizeOptions,
  parseKeywords,
  patchFor,
  sameList,
  sourcesPatch,
  welcomePatch,
} from "../../../src/ui/dialog/settings-model.js";

test("patchFor builds a nested patch from a dotted path", () => {
  assert.deepEqual(patchFor("language", "pl"), { language: "pl" });
  assert.deepEqual(patchFor("feed.sources.groups", false), { feed: { sources: { groups: false } } });
});

test("FEED_SOURCES matches the settings schema", () => {
  assert.deepEqual(FEED_SOURCES, Object.keys(DEFAULTS.feed.sources));
});

test("sourcesPatch refuses to turn off the last source", () => {
  const all = { friends: true, groups: true, pages: true, favorites: true };
  assert.deepEqual(sourcesPatch(all, "groups", false), { feed: { sources: { groups: false } } });
  assert.equal(sourcesPatch({ friends: true, groups: false, pages: false, favorites: false }, "friends", false), null);
  assert.deepEqual(sourcesPatch({ friends: false, groups: false, pages: false, favorites: false }, "pages", true), {
    feed: { sources: { pages: true } },
  });
  assert.equal(sourcesPatch(undefined, "friends", false), null);
});

test("welcomePatch brings a dismissed welcome box back", () => {
  assert.deepEqual(welcomePatch(true), { look: { welcome: true }, state: { welcomeDismissed: false } });
  assert.deepEqual(welcomePatch(false), { look: { welcome: false } });
});

test("parseKeywords: one phrase per line, trimmed, deduplicated, capped", () => {
  assert.deepEqual(parseKeywords("Politics\n\n  politics  \r\nCrypto   bros\nＣｒｙｐｔｏ bros\n"), ["Politics", "Crypto bros"]);
  assert.deepEqual(parseKeywords(""), []);
  assert.deepEqual(parseKeywords(null), []);
  const many = Array.from({ length: 250 }, (_, i) => `word${i}`).join("\n");
  assert.equal(parseKeywords(many).length, MAX_KEYWORDS);
});

test("parseKeywords output survives the settings sanitiser unchanged", () => {
  const keywords = parseKeywords(" a \nb\n\nc ");
  assert.deepEqual(sanitize({ feed: { keywords } }).feed.keywords, keywords);
});

test("formatKeywords and sameList", () => {
  assert.equal(formatKeywords(["a", "b c"]), "a\nb c");
  assert.equal(formatKeywords(undefined), "");
  assert.equal(sameList(["a"], ["a"]), true);
  assert.equal(sameList(["a"], ["a", "b"]), false);
  assert.equal(sameList(["a", "b"], ["b", "a"]), false);
});

test("pageSizeOptions includes an unusual current value, sorted", () => {
  assert.deepEqual(pageSizeOptions(10), [5, 10, 15, 20, 25, 30]);
  assert.deepEqual(pageSizeOptions(7), [5, 7, 10, 15, 20, 25, 30]);
  assert.deepEqual(pageSizeOptions(undefined), [5, 10, 15, 20, 25, 30]);
});
