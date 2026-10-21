import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseLines, stitch, deepMerge } from "../../../src/data/jsonl.js";
import { buildFeedPayloads, buildEdge, buildStory, pymkUnit, buildSjsBlocks, PEOPLE, STREAM_LABEL, PAGE_INFO_LABEL } from "../../fixtures/gql/make-fixtures.mjs";
import { readFixture, REAL_DIR, feedEdges, sjsPayloads, stitchFile } from "./helpers.mjs";

describe("parseLines", () => {
  test("parses one object per line and skips blank lines", () => {
    assert.deepEqual(parseLines('{"a":1}\n\n  \n{"b":2}\n'), [{ a: 1 }, { b: 2 }]);
  });

  test("accepts CRLF line endings and surrounding whitespace", () => {
    assert.deepEqual(parseLines('  {"a":1}  \r\n{"b":2}\r\n'), [{ a: 1 }, { b: 2 }]);
  });

  test('strips the "for (;;);" guard on any line', () => {
    assert.deepEqual(parseLines('for (;;);{"a":1}\nfor (;;); {"b":2}'), [{ a: 1 }, { b: 2 }]);
  });

  test("ignores a partial trailing line (cut stream)", () => {
    assert.deepEqual(parseLines('{"a":1}\n{"data":{"viewer":'), [{ a: 1 }]);
  });

  test("ignores lines that are valid JSON but not objects", () => {
    assert.deepEqual(parseLines('123\nnull\n"x"\n[1,2]\n{"ok":true}'), [{ ok: true }]);
  });

  test("handles empty, null and non-string input", () => {
    assert.deepEqual(parseLines(""), []);
    assert.deepEqual(parseLines(null), []);
    assert.deepEqual(parseLines(undefined), []);
    assert.deepEqual(parseLines("for (;;);"), []);
  });

  test("keeps payloads containing newlines inside strings only when escaped (JSON lines)", () => {
    assert.deepEqual(parseLines('{"text":"a\\nb"}'), [{ text: "a\nb" }]);
  });
});

describe("deepMerge", () => {
  test("b's leaves win and nested objects merge", () => {
    const a = { x: 1, o: { p: 1, q: 1 } };
    const out = deepMerge(a, { x: 2, o: { q: 2, r: 3 }, n: null });
    assert.equal(out, a, "merges into a and returns it");
    assert.deepEqual(a, { x: 2, o: { p: 1, q: 2, r: 3 }, n: null });
  });

  test("arrays are replaced, not merged", () => {
    assert.deepEqual(deepMerge({ l: [1, 2, 3] }, { l: [9] }), { l: [9] });
  });

  test("objects replace primitives and vice versa", () => {
    assert.deepEqual(deepMerge({ a: 1, b: { c: 1 } }, { a: { z: 1 }, b: 5 }), { a: { z: 1 }, b: 5 });
  });

  test("non-object arguments return b", () => {
    assert.equal(deepMerge(null, 5), 5);
    assert.deepEqual(deepMerge([1], { a: 1 }), { a: 1 });
    assert.equal(deepMerge({ a: 1 }, null), null);
  });
});

describe("stitch", () => {
  test("a single root payload", () => {
    const r = stitch([{ data: { viewer: { a: 1 } }, extensions: { is_final: true } }]);
    assert.deepEqual(r, { data: { viewer: { a: 1 } }, errors: [], final: true });
  });

  test("final is false until some payload says is_final", () => {
    assert.equal(stitch([{ data: {} }, { label: "x$defer$y", path: [], data: {} }]).final, false);
  });

  test("reassembly test vector: stream edges, nested defer, page_info defer", () => {
    const r = stitchFile("reassembly-test-vector.synthetic.jsonl", REAL_DIR);
    const feed = r.data.viewer.news_feed;
    assert.equal(r.final, true);
    assert.deepEqual(r.errors, []);
    assert.equal(feed.edges.length, 3);
    assert.equal(feed.edges[0].node.post_id, "1001");
    assert.equal(feed.edges[1].node.th_dat_spo.__typename, "SponsoredData", "streamed edge is set whole");
    assert.equal(feed.edges[2].node.__typename, "PaginatedPeopleYouMayKnowFeedUnit");
    const cs = feed.edges[0].node.comet_sections;
    assert.equal(cs.content.story.message.text, "hello", "defer keeps existing siblings");
    assert.equal(cs.feedback.__typename, "CometStoryFeedbackUFIStrategy", "defer merged at its path");
    assert.deepEqual(feed.page_info, { __typename: "PageInfo", end_cursor: "END", has_next_page: true });
  });

  test("@stream without a $stream$ label: a list index not yet present is set", () => {
    const r = stitch([
      { data: { list: [{ id: 0 }] } },
      { label: "Something", path: ["list", 1], data: { id: 1 } },
    ]);
    assert.deepEqual(r.data.list, [{ id: 0 }, { id: 1 }]);
  });

  test("a numeric path to an existing item without $stream$ deep-merges (@defer into a list item)", () => {
    const r = stitch([
      { data: { list: [{ id: 0, a: 1 }] } },
      { label: "Frag$defer$x", path: ["list", 0], data: { b: 2 } },
    ]);
    assert.deepEqual(r.data.list, [{ id: 0, a: 1, b: 2 }]);
  });

  test("a $stream$ label replaces an existing index", () => {
    const r = stitch([
      { data: { list: [{ id: 0, a: 1 }] } },
      { label: "C$stream$c", path: ["list", 0], data: { id: 9 } },
    ]);
    assert.deepEqual(r.data.list, [{ id: 9 }]);
  });

  test("a stream line before its predecessors leaves holes (callers filter)", () => {
    const r = stitch([{ label: STREAM_LABEL, path: ["viewer", "news_feed", "edges", 3], data: { cursor: "c3" } }]);
    const edges = r.data.viewer.news_feed.edges;
    assert.equal(edges.length, 4);
    assert.equal(0 in edges, false);
    assert.deepEqual(feedEdges(r.data), [{ cursor: "c3" }]);
  });

  test("@defer to a missing path creates the containers", () => {
    const r = stitch([{ data: { viewer: {} } }, { label: "x$defer$y", path: ["viewer", "news_feed"], data: { page_info: { end_cursor: "E" } } }]);
    assert.equal(r.data.viewer.news_feed.page_info.end_cursor, "E");
  });

  test("@defer replaces a null or primitive value at its path", () => {
    const r = stitch([{ data: { a: { b: null } } }, { label: "x$defer$y", path: ["a", "b"], data: { c: 1 } }]);
    assert.deepEqual(r.data, { a: { b: { c: 1 } } });
  });

  test("an incremental payload with an empty path merges into the root", () => {
    const r = stitch([{ data: { a: 1 } }, { label: "x$defer$root", path: [], data: { b: 2 } }]);
    assert.deepEqual(r.data, { a: 1, b: 2 });
  });

  test("incremental payloads before (or without) a root payload still build data", () => {
    const r = stitch([{ label: "x$defer$y", path: ["viewer", "n"], data: { v: 1 } }]);
    assert.deepEqual(r.data, { viewer: { n: { v: 1 } } });
  });

  test("errors from every line are collected; data stays null without any data", () => {
    const e1 = { message: "A server error occurred", code: 1675012 };
    const e2 = { message: "late", code: 1357010 };
    const r = stitch([{ errors: [e1], data: null }, { label: "x", path: ["a"], errors: [e2], data: null, extensions: { is_final: true } }]);
    assert.deepEqual(r, { data: null, errors: [e1, e2], final: true });
  });

  test("partial data with errors coexist", () => {
    const r = stitch([{ data: { viewer: { a: 1 } }, errors: [{ code: 1 }] }]);
    assert.deepEqual(r.data, { viewer: { a: 1 } });
    assert.equal(r.errors.length, 1);
  });

  test("ignores non-object payloads and non-array input", () => {
    assert.deepEqual(stitch([null, 5, "x", { data: { a: 1 } }]).data, { a: 1 });
    assert.deepEqual(stitch(null), { data: null, errors: [], final: false });
  });

  test("never mutates its input; stitching twice gives the same result", () => {
    const payloads = buildFeedPayloads({
      stories: [buildStory({ postId: "1", actor: PEOPLE.alice, text: "a" }), buildEdge(pymkUnit())],
      defers: [{ path: ["viewer", "news_feed", "edges", 0, "node"], data: { extra: true } }],
    });
    const before = structuredClone(payloads);
    const first = stitch(payloads);
    assert.deepEqual(payloads, before);
    assert.deepEqual(stitch(payloads), first);
    assert.equal(first.data.viewer.news_feed.edges[0].node.extra, true);
  });

  test("builder page: root edge, stream edges, deferred UFI and page_info", () => {
    const r = stitchFile("feed-page-1.jsonl");
    const edges = feedEdges(r.data);
    assert.equal(edges.length, 13);
    assert.equal(r.final, true);
    assert.equal(edges[0].node.comet_sections.feedback.__typename, "CometStoryFeedbackUFIStrategy", "deferred section arrived");
    assert.ok(edges[0].node.comet_sections.content, "deferred merge kept the content section");
    assert.deepEqual(r.data.viewer.news_feed.page_info, { __typename: "PageInfo", end_cursor: "fxmixed-page-2", has_next_page: true });
  });

  test("SSR data-sjs blocks stitch to the same data as the JSON-lines response", () => {
    const blocks = readFixture("ssr-home.sjs.jsonl").trim().split("\n").map((l) => JSON.parse(l));
    const fromSsr = stitch(sjsPayloads(blocks));
    const fromLines = stitchFile("feed-page-1.jsonl");
    assert.deepEqual(fromSsr, fromLines);
  });

  test("SSR payloads are applied in sequence_number order, whatever the block order", () => {
    const payloads = buildFeedPayloads({ stories: [buildStory({ postId: "1", actor: PEOPLE.alice, text: "a" }), buildStory({ postId: "2", actor: PEOPLE.bob, text: "b" })] });
    const shuffled = buildSjsBlocks(payloads).reverse();
    const r = stitch(sjsPayloads(shuffled));
    assert.deepEqual(r, stitch(payloads));
    assert.equal(r.data.viewer.news_feed.page_info.has_next_page, true);
  });

  test("labels of the real 2026-10 page are recognised", () => {
    const lines = parseLines(readFixture("feed-CometNewsFeedPaginationQuery-2026-10-10.trimmed.jsonl", REAL_DIR));
    assert.deepEqual(
      lines.map((l) => l.label ?? null),
      [null, STREAM_LABEL, PAGE_INFO_LABEL],
    );
    const r = stitch(lines);
    assert.equal(feedEdges(r.data).length, 2);
    assert.equal(r.data.viewer.news_feed.page_info.has_next_page, true);
    assert.equal(r.final, true);
  });
});
