import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { textSegments, matchesKeywords } from "../../../src/data/text.js";
import { extractStory } from "../../../src/data/extract.js";
import { linkShim } from "../../fixtures/gql/make-fixtures.mjs";
import { nodeOf } from "./helpers.mjs";

const range = (offset, length, url = "https://www.facebook.com/x", kind = "user") => ({ offset, length, url, kind });
const joined = (segments) => segments.map((s) => s.text).join("");

describe("textSegments", () => {
  test("splits the fixture friend post into plain and linked segments", () => {
    const story = extractStory(nodeOf("organic-friend-text.jsonl"));
    const segments = textSegments(story.text, story.ranges);
    assert.equal(joined(segments), story.text, "segments cover the whole text");
    assert.deepEqual(
      segments.filter((s) => s.url),
      [
        { text: "Bob Example", url: "https://www.facebook.com/bob.example", kind: "user" },
        { text: "Pizza Place", url: "https://www.facebook.com/pizzaplace", kind: "page" },
        { text: "#summer", url: "https://www.facebook.com/hashtag/summer?__eep__=6", kind: "hashtag" },
        { text: "example.com/trip", url: "https://example.com/trip", kind: "link" },
      ],
    );
    assert.deepEqual(segments[0], { text: "Back from the lake 🏞️ with " });
  });

  test("offsets are UTF-16 indices: emoji count as two code units", () => {
    const text = "😀 Ann 👍🏽 Bob"; // 😀 = 2 units, 👍🏽 (with skin tone) = 4 units
    assert.deepEqual(textSegments(text, [range(3, 3, "https://www.facebook.com/ann"), range(12, 3, "https://www.facebook.com/bob")]), [
      { text: "😀 " },
      { text: "Ann", url: "https://www.facebook.com/ann", kind: "user" },
      { text: " 👍🏽 " },
      { text: "Bob", url: "https://www.facebook.com/bob", kind: "user" },
    ]);
  });

  test("a range may cover emoji, but one that splits a surrogate pair is ignored", () => {
    const text = "a😀b";
    assert.deepEqual(textSegments(text, [range(1, 2)]), [{ text: "a" }, { text: "😀", url: "https://www.facebook.com/x", kind: "user" }, { text: "b" }]);
    assert.deepEqual(textSegments(text, [range(1, 1)]), [{ text }], "ends inside the pair");
    assert.deepEqual(textSegments(text, [range(2, 2)]), [{ text }], "starts inside the pair");
  });

  test("overlapping ranges: the earlier one wins; at the same offset the longer one", () => {
    const text = "Alice Smith here";
    assert.deepEqual(textSegments(text, [range(6, 5, "https://www.facebook.com/b"), range(0, 11, "https://www.facebook.com/a"), range(0, 5, "https://www.facebook.com/c")]), [
      { text: "Alice Smith", url: "https://www.facebook.com/a", kind: "user" },
      { text: " here" },
    ]);
  });

  test("adjacent ranges both apply, in offset order whatever the input order", () => {
    assert.deepEqual(textSegments("AnnBob", [range(3, 3, "https://www.facebook.com/b"), range(0, 3, "https://www.facebook.com/a")]), [
      { text: "Ann", url: "https://www.facebook.com/a", kind: "user" },
      { text: "Bob", url: "https://www.facebook.com/b", kind: "user" },
    ]);
  });

  test("out-of-range, negative, empty and non-integer ranges are ignored", () => {
    const text = "hello";
    for (const r of [range(3, 5), range(-1, 2), range(1, 0), range(1.5, 2), range("1", 2), range(0, Infinity), null, "x", { offset: 0 }]) {
      assert.deepEqual(textSegments(text, [r]), [{ text }], JSON.stringify(r));
    }
  });

  test("link ranges are unwrapped from l.facebook.com and cleaned", () => {
    const text = "read this";
    assert.deepEqual(textSegments(text, [range(5, 4, linkShim("https://example.org/a?fbclid=zz"), "link")]), [
      { text: "read " },
      { text: "this", url: "https://example.org/a", kind: "link" },
    ]);
  });

  test("ranges without a safe http(s) link render as plain text", () => {
    const text = "click me";
    assert.deepEqual(textSegments(text, [range(0, 5, "javascript:alert(1)"), range(6, 2, null)]), [{ text }]);
  });

  test("relative URLs resolve to facebook.com; a missing kind becomes other", () => {
    assert.deepEqual(textSegments("tag", [{ offset: 0, length: 3, url: "/hashtag/x" }]), [{ text: "tag", url: "https://www.facebook.com/hashtag/x", kind: "other" }]);
  });

  test("empty or non-string text gives no segments; no ranges gives one plain segment", () => {
    assert.deepEqual(textSegments("", [range(0, 1)]), []);
    assert.deepEqual(textSegments(null, []), []);
    assert.deepEqual(textSegments(5, []), []);
    assert.deepEqual(textSegments("plain", null), [{ text: "plain" }]);
    assert.deepEqual(textSegments("plain", "junk"), [{ text: "plain" }]);
  });

  test("a range covering the whole text", () => {
    assert.deepEqual(textSegments("Bob", [range(0, 3)]), [{ text: "Bob", url: "https://www.facebook.com/x", kind: "user" }]);
  });
});

describe("matchesKeywords", () => {
  const story = { text: "Our new Puppy arrived", title: "Erin added 3 photos", shared: { text: "Original about ﬁshing", title: null, shared: { text: "deepest level", shared: null } } };

  test("case-insensitive substring match in the text", () => {
    assert.equal(matchesKeywords(story, ["puppy"]), true);
    assert.equal(matchesKeywords(story, ["PUPPY ARRIVED"]), true);
    assert.equal(matchesKeywords(story, ["kitten"]), false);
  });

  test("searches the title and shared stories", () => {
    assert.equal(matchesKeywords(story, ["3 photos"]), true);
    assert.equal(matchesKeywords(story, ["deepest"]), true);
  });

  test("NFKC normalisation: ligatures and full-width letters match their plain forms", () => {
    assert.equal(matchesKeywords(story, ["fishing"]), true);
    assert.equal(matchesKeywords({ text: "ＰＩＺＺＡ night" }, ["pizza"]), true);
    assert.equal(matchesKeywords({ text: "pizza night" }, ["ＰＩＺＺＡ"]), true);
  });

  test("whitespace differences and invisible characters do not prevent a match", () => {
    assert.equal(matchesKeywords({ text: "big   news​ today" }, ["big news today"]), true);
  });

  test("any keyword is enough; blank keywords are ignored", () => {
    assert.equal(matchesKeywords(story, ["   ", "", "kitten", "puppy"]), true);
    assert.equal(matchesKeywords(story, ["  ", ""]), false);
  });

  test("bad input never matches", () => {
    assert.equal(matchesKeywords(story, []), false);
    assert.equal(matchesKeywords(story, null), false);
    assert.equal(matchesKeywords(null, ["x"]), false);
    assert.equal(matchesKeywords({ text: null, title: 5 }, ["5"]), false);
    assert.equal(matchesKeywords(story, [null, 7]), false);
  });

  test("works on extracted fixture stories (shared text included)", () => {
    const shared = extractStory(nodeOf("shared-story.jsonl"));
    assert.equal(matchesKeywords(shared, ["winter has arrived"]), true);
    assert.equal(matchesKeywords(shared, ["this is us"]), true);
  });
});
