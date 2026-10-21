import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS } from "../../../src/shared/settings.js";
import {
  errorRows,
  formatValue,
  groupCounters,
  isForbiddenKey,
  isIdentityKey,
  isSafeToken,
  mayExport,
  otherEntries,
  reportFileName,
  sanitizeReport,
  scrubText,
} from "../../../src/ui/dialog/report.js";

/** Every [path, value] leaf of a JSON value. */
function leaves(v, path = []) {
  if (v === null || typeof v !== "object") return [[path, v]];
  return Object.entries(v).flatMap(([k, x]) => leaves(x, [...path, k]));
}

test("isForbiddenKey: personal, secret, URL and id keys in any spelling", () => {
  for (const k of ["name", "Name", "short_name", "text", "message", "title", "keywords", "email", "avatar", "variables"]) {
    assert.equal(isForbiddenKey(k), true, k);
  }
  for (const k of ["url", "profileUrl", "image_uri", "href", "src", "endCursor", "feedEndCursor", "accessToken", "tokens"]) {
    assert.equal(isForbiddenKey(k), true, k);
  }
  for (const k of ["id", "ids", "postId", "post_id", "docID", "userIds", "group-id", "dtsg", "fb_dtsg", "lsd", "cookie", "c_user"]) {
    assert.equal(isForbiddenKey(k), true, k);
  }
  assert.equal(isForbiddenKey("me.name"), true, "last dotted segment decides");
});

test("isForbiddenKey: counter names, typenames and ordinary words pass", () => {
  for (const k of ["counters", "classify.drop.category:ENGAGEMENT", "gql.requests", "valid", "paid", "android", "__typename", "tokensFound", "sources", "version", "first", "harvest.cursor.repeat"]) {
    assert.equal(isForbiddenKey(k), false, k);
  }
});

test("isForbiddenKey: compound keys ending in a personal word, ids written without a word break", () => {
  for (const k of ["groupName", "actorName", "GROUP_NAME", "post_text", "storyTitle", "commentBody", "linkImage", "uid", "fbid", "story_fbid", "userid", "USERID", "pageids"]) {
    assert.equal(isForbiddenKey(k), true, k);
  }
  for (const k of ["friendlyName", "queryName", "operationName", "fluid", "squid", "guide", "titleCount", "nameLength", "CometPhotoRootQuery"]) {
    assert.equal(isForbiddenKey(k), false, k);
  }
});

test("isForbiddenKey: no setting name except the keyword list is treated as personal", () => {
  const leaves = (obj) => Object.entries(obj).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? [k, ...leaves(v)] : [k]));
  assert.deepEqual(leaves(DEFAULTS).filter((k) => isForbiddenKey(k)), ["keywords"]);
});

test("sanitizeReport drops ids under joined keys and names under compound keys (regression)", () => {
  const out = sanitizeReport({
    facts: { uid: 532512345, fbid: 1234567890, story_fbid: 123456789, groupName: "Cyclists", actorName: "Anna", postText: "Hello", storyTitle: "Party", friendlyName: "CometModernHomeFeedQuery" },
    counters: { "stream.render.groupName": 3 },
  });
  assert.deepEqual(out.facts, { friendlyName: "CometModernHomeFeedQuery", _removedKeys: 7 });
  assert.deepEqual(out.counters, { "stream.render.groupName": 3 }, "a count may still carry such a name");
});

test("isIdentityKey: ids and people, not plain data keys", () => {
  assert.equal(isIdentityKey("user"), true);
  assert.equal(isIdentityKey("actorID"), true);
  assert.equal(isIdentityKey("id"), true);
  assert.equal(isIdentityKey("title"), false);
  assert.equal(isIdentityKey("keywords"), false);
});

test("mayExport: a count may be called 'title', an id never survives", () => {
  assert.equal(mayExport("skin.part.title", 4), true);
  assert.equal(mayExport("keywords", 3), true);
  assert.equal(mayExport("keywords", ["politics"]), false);
  assert.equal(mayExport("title", "Hello"), false);
  assert.equal(mayExport("id", 4), false);
  assert.equal(mayExport("user", 100012345), false);
  assert.equal(mayExport("hideAI", true), true);
  assert.equal(mayExport("text", 1e14), false, "a huge number is not a count");
});

test("isSafeToken: identifiers yes; text, URLs, ids, emails and random tokens no", () => {
  for (const s of ["Story", "CometModernHomeFeedQuery", "MOST_RECENT_FRIENDS_FEED", "category:ENGAGEMENT", "1.0.0", "home", "2026-10-21", "q9k7m2x", "Query$stream$edges"]) {
    assert.equal(isSafeToken(s), true, s);
  }
  for (const s of ["Jan Kowalski", "https://www.facebook.com/", "100012345678", "jan@example.com", "AVqZ1h2bXyE", "", "a/b", "x".repeat(121)]) {
    assert.equal(isSafeToken(s), false, s);
  }
  assert.equal(isSafeToken(42), false);
});

test("scrubText keeps the shape of an error message and removes data", () => {
  assert.equal(scrubText("Cannot read properties of undefined (reading 'edges')"), "Cannot read properties of undefined (reading 'edges')");
  const s = scrubText("Failed https://www.facebook.com/profile.php?id=100012345678 for 'Jan Kowalski' <jan@example.com> at 12345");
  assert.doesNotMatch(s, /facebook\.com|100012345678|Kowalski|example\.com|12345/);
  assert.match(s, /^Failed <url> for '<text>'/);
  assert.ok(scrubText("x ".repeat(500)).length <= 200);
});

test("sanitizeReport keeps names and counts and drops everything personal", () => {
  const out = sanitizeReport({
    version: "1.0.0",
    platform: "chrome",
    counters: { "classify.keep": 42, "classify.drop.sponsored-data": 7, "skin.part.title": 3 },
    errors: { stream: { n: 2, first: "Failed https://www.facebook.com/x?id=100012345678 for 'Jan Kowalski'" } },
    disabled: ["stream"],
    facts: {
      route: "home",
      userId: "100012345678",
      me: { name: "Jan Kowalski", url: "https://www.facebook.com/jan" },
      tokensFound: ["dtsg", "lsd"],
      lsd: "AVqZ1h2bXyE",
      docIds: { CometModernHomeFeedQuery: "25131870473159236" },
      greeting: "Happy birthday Jan!",
    },
    sample: {
      __typename: "Story",
      text: "Happy birthday!",
      feedback: { reactions: 12 },
      actors: [{ id: "4", name: "Mark" }],
      attachments: [{ __typename: "Photo", uri: "https://scontent.xx.fbcdn.net/a.jpg" }],
    },
    keywords: ["politics"],
    cursor: "AQHRabc",
    "100012345678": 1,
    "Jan Kowalski": 1,
  });

  assert.equal(out.version, "1.0.0");
  assert.equal(out.platform, "chrome");
  assert.deepEqual(out.counters, { "classify.keep": 42, "classify.drop.sponsored-data": 7, "skin.part.title": 3 });
  assert.equal(out.errors.stream.n, 2);
  assert.match(out.errors.stream.first, /^Failed <url> for '<text>'$/);
  assert.deepEqual(out.disabled, ["stream"]);
  assert.equal(out.facts.route, "home");
  assert.deepEqual(out.facts.tokensFound, ["dtsg", "lsd"]);
  assert.equal(out.facts.greeting, "<text>");
  for (const gone of ["userId", "me", "lsd", "docIds"]) assert.equal(gone in out.facts, false, gone);
  assert.deepEqual(out.sample, { __typename: "Story", feedback: { reactions: 12 }, attachments: [{ __typename: "Photo", _removedKeys: 1 }], _removedKeys: 2 });
  for (const gone of ["keywords", "cursor", "100012345678", "Jan Kowalski"]) assert.equal(gone in out, false, gone);
  assert.equal(out._removedKeys, 4);

  const json = JSON.stringify(out);
  assert.doesNotMatch(json, /facebook\.com|fbcdn|Kowalski|Mark|100012345678|AVqZ1h2bXyE|AQHRabc|politics|birthday!/);
  for (const [path, v] of leaves(out)) {
    const key = path.at(-1);
    if (key !== undefined && Number.isNaN(Number(key))) assert.ok(mayExport(key, v), path.join("."));
  }
});

test("sanitizeReport handles odd input: cycles, depth, Maps, Sets, Dates, bigints, functions, huge numbers", () => {
  const cyclic = { a: 1 };
  cyclic.self = cyclic;
  let deep = { v: 1 };
  for (let i = 0; i < 20; i++) deep = { deep };
  const out = sanitizeReport({
    cyclic,
    deep,
    map: new Map([["gql", 3], ["Jan Kowalski", 1]]),
    set: new Set(["Story", "Jan Kowalski"]),
    at: new Date(Date.UTC(2026, 9, 21)),
    big: 10n,
    fn() {},
    huge: 123456789012345,
    nan: Number.NaN,
    list: Array.from({ length: 150 }, (_, i) => i),
  });
  assert.equal(out.cyclic.self, "<circular>");
  assert.match(JSON.stringify(out.deep), /<deep>/);
  assert.deepEqual(out.map, { gql: 3, _removedKeys: 1 });
  assert.deepEqual(out.set, ["Story", "<text>"]);
  assert.equal(out.at, "2026-10-21T00:00:00.000Z");
  assert.equal(out.big, "<number>");
  assert.equal("fn" in out, false);
  assert.equal(out.huge, "<number>");
  assert.equal(out.nan, null);
  assert.equal(out.list.length, 101);
  assert.equal(out.list.at(-1), "<+50 more>");
  assert.equal(sanitizeReport(undefined), null);
  assert.equal(sanitizeReport("Jan Kowalski"), "<text>");
});

test("reportFileName is dated", () => {
  assert.equal(reportFileName(new Date(Date.UTC(2026, 9, 21, 12))), "mfga-report-2026-10-21.json");
});

test("groupCounters groups by the part before the first dot, sorted, with totals", () => {
  assert.deepEqual(groupCounters({ "gql.requests": 5, "classify.keep": 3, "classify.drop.ads": 2, misc: 1, "bad.value": "x" }), [
    { area: "classify", rows: [["drop.ads", 2], ["keep", 3]], total: 5 },
    { area: "general", rows: [["misc", 1]], total: 1 },
    { area: "gql", rows: [["requests", 5]], total: 5 },
  ]);
  assert.deepEqual(groupCounters(undefined), []);
});

test("errorRows tolerates missing fields", () => {
  assert.deepEqual(errorRows({ stream: { n: 2, first: "boom" }, alpha: {}, beta: null }), [
    ["alpha", 0, ""],
    ["beta", 0, ""],
    ["stream", 2, "boom"],
  ]);
  assert.deepEqual(errorRows(null), []);
});

test("formatValue renders facts compactly", () => {
  assert.equal(formatValue("home"), "home");
  assert.equal(formatValue(3), "3");
  assert.equal(formatValue(true), "true");
  assert.equal(formatValue(null), "—");
  assert.equal(formatValue(["dtsg", "lsd"]), "dtsg, lsd");
  assert.equal(formatValue({ a: 1 }), '{"a":1}');
  assert.equal(formatValue("x".repeat(400)).length, 300);
});

test("otherEntries lists what main.js adds beyond the health snapshot", () => {
  assert.deepEqual(otherEntries({ counters: {}, errors: {}, facts: {}, disabled: [], merge: { sources: 4, buffered: 12 }, halted: false }), [
    ["merge.sources", "4"],
    ["merge.buffered", "12"],
    ["halted", "false"],
  ]);
});
