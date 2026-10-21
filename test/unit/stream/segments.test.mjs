import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { textSegments, unwrapShim } from "../../../src/ui/stream/segments.js";

describe("textSegments", () => {
  test("plain text", () => {
    assert.deepEqual(textSegments("hello", []), [{ text: "hello" }]);
    assert.deepEqual(textSegments("", []), []);
    assert.deepEqual(textSegments(null), []);
  });

  test("links users, hashtags and external links in order", () => {
    const text = "Lunch with Amy #tbt https://example.com";
    const ranges = [
      { offset: 15, length: 4, url: "https://www.facebook.com/hashtag/tbt", kind: "hashtag" },
      { offset: 11, length: 3, url: "https://www.facebook.com/amy", kind: "user" },
      { offset: 20, length: 19, url: "https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com%2F&h=AT0", kind: "link" },
    ];
    assert.deepEqual(textSegments(text, ranges), [
      { text: "Lunch with " },
      { text: "Amy", url: "https://www.facebook.com/amy", kind: "user" },
      { text: " " },
      { text: "#tbt", url: "https://www.facebook.com/hashtag/tbt", kind: "hashtag" },
      { text: " " },
      { text: "https://example.com", url: "https://example.com/", kind: "link" },
    ]);
  });

  test("uses UTF-16 offsets (emoji before an entity)", () => {
    const text = "😀 Amy";
    assert.deepEqual(textSegments(text, [{ offset: 3, length: 3, url: "https://www.facebook.com/amy", kind: "user" }]), [
      { text: "😀 " },
      { text: "Amy", url: "https://www.facebook.com/amy", kind: "user" },
    ]);
  });

  test("ignores overlapping, out-of-range, malformed and url-less ranges", () => {
    const text = "abcdefghij";
    const ranges = [
      { offset: 0, length: 4, url: "https://www.facebook.com/a" },
      { offset: 2, length: 4, url: "https://www.facebook.com/overlap" },
      { offset: 8, length: 5, url: "https://www.facebook.com/out" },
      { offset: -1, length: 2, url: "https://www.facebook.com/neg" },
      { offset: 5, length: 0, url: "https://www.facebook.com/empty" },
      { offset: 6, length: 1 },
      { offset: 7, length: 1, url: "javascript:alert(1)" },
      null,
    ];
    const out = textSegments(text, ranges);
    assert.equal(out.map((s) => s.text).join(""), text);
    assert.deepEqual(out.filter((s) => s.url).map((s) => s.url), ["https://www.facebook.com/a"]);
  });

  test("a shim to a non-http target stays plain text", () => {
    const out = textSegments("click", [{ offset: 0, length: 5, url: "https://l.facebook.com/l.php?u=javascript%3Aalert(1)" }]);
    assert.deepEqual(out, [{ text: "click" }]);
  });
});

describe("unwrapShim", () => {
  test("unwraps l.php and lm.facebook.com", () => {
    assert.equal(unwrapShim("https://l.facebook.com/l.php?u=https%3A%2F%2Fnews.example.org%2Fa%3Fb%3D1&h=x"), "https://news.example.org/a?b=1");
    assert.equal(unwrapShim("https://lm.facebook.com/l.php?u=http%3A%2F%2Fexample.com"), "http://example.com/");
  });
  test("leaves other URLs and resolves relative ones against facebook.com", () => {
    assert.equal(unwrapShim("https://example.com/x"), "https://example.com/x");
    assert.equal(unwrapShim("/groups/123/"), "https://www.facebook.com/groups/123/");
  });
  test("rejects garbage and non-web schemes", () => {
    assert.equal(unwrapShim("https://l.facebook.com/l.php"), null);
    assert.equal(unwrapShim("javascript:alert(1)"), null);
    assert.equal(unwrapShim("data:text/html,x"), null);
  });
});
