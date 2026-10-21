import test from "node:test";
import assert from "node:assert/strict";
import { actions as mod, gql } from "./fixtures/load.mjs";
import { extractComment } from "./fixtures/stubs.mjs";
import { fakeClient, fakeHarvest, fakeOps, fixtureJson } from "./fixtures/helpers.mjs";

const { ACTION_OPS, REACTIONS, createActions, commentsVariables } = mod;
const { GqlError } = gql;

const REACT_SAMPLE = fixtureJson("mutation-react-2026-09.json");
const COMMENT_SAMPLE = fixtureJson("mutation-comment-2026-09.json");

const NOW = 1_792_582_184_123;
const NAV_ID = "550000"; // 100000 + floor(0.5 × 900000)
const ATTRIBUTION = `CometHomeRoot.react,comet.home,via_cold_start,${NOW},${NAV_ID},4748854339,,`;
const UUIDS = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];

const POST_URL = "https://www.facebook.com/sample.page/posts/pfbid02SampleSyntheticPostToken0123456789abcdef";
const STORY = {
  key: "3937024329774036",
  postId: "3937024329774036",
  url: POST_URL,
  feedback: { id: "ZmVlZGJhY2s6MzkzNzAyNDMyOTc3NDAzNg==", canComment: true },
  tracking: "<story encrypted tracking>",
  groupId: null,
};
const GROUP_STORY = { ...STORY, feedback: { id: "ZmVlZGJhY2s6MzkzNzM0MTU2NjQwODk3OQ==" }, groupId: "12345678901234567" };

function setup({ table = {}, handler = () => ({ data: {} }) } = {}) {
  let u = 0;
  const uuid = () => UUIDS[u++] ?? `uuid-${u}`;
  const ops = fakeOps({
    [ACTION_OPS.react]: [{ docId: "27646120298312844", variables: null, source: "fallback", fresh: false }],
    [ACTION_OPS.comment]: [{ docId: "39607465588840384", variables: null, source: "fallback", fresh: false }],
    ...table,
  });
  const client = fakeClient(handler);
  const harvest = fakeHarvest({ tokens: { userId: "12345678901234", name: "Ann Example" } });
  const actions = createActions({ client, ops, harvest, extractComment, uuid: () => uuid(), now: () => NOW, random: () => 0.5 });
  return { actions, client, ops, harvest, nextUuid: () => UUIDS[u] ?? `uuid-${u + 1}` };
}

/** The captured LIKE variables with every per-user/per-call id replaced by ours. */
function expectedReact(reactionId, mutationId) {
  const v = structuredClone(REACT_SAMPLE.variables_LIKE);
  Object.assign(v.input, {
    attribution_id_v2: ATTRIBUTION,
    feedback_id: STORY.feedback.id,
    feedback_reaction_id: reactionId,
    feedback_referrer: "/sample.page/posts/pfbid02SampleSyntheticPostToken0123456789abcdef",
    tracking: [STORY.tracking],
    session_id: UUIDS[0],
    downstream_share_session_id: UUIDS[1],
    downstream_share_session_origin_uri: POST_URL,
    downstream_share_session_start_time: String(NOW),
    actor_id: "12345678901234",
    client_mutation_id: mutationId,
  });
  return v;
}

test("REACTIONS ids (graphql-protocol §7.2)", () => {
  assert.deepEqual(REACTIONS, {
    LIKE: "1635855486666999",
    LOVE: "1678524932434102",
    CARE: "613557422527858",
    HAHA: "115940658764963",
    WOW: "478547315650144",
    SAD: "908563459236466",
    ANGRY: "444813342392137",
    NONE: "0",
  });
});

test("the generated attribution id has the captured shape", () => {
  const shape = /^CometHomeRoot\.react,comet\.home,via_cold_start,\d{13},\d{6},\d+,,$/;
  assert.match(REACT_SAMPLE.variables_LIKE.input.attribution_id_v2, shape);
  assert.match(ATTRIBUTION, shape);
});

test("Like: exactly the captured 2026-09 variables, ids replaced", async () => {
  const { actions, client } = setup();
  await actions.react(STORY, REACTIONS.LIKE);
  assert.equal(client.calls[0].name, "CometUFIFeedbackReactMutation");
  assert.equal(client.calls[0].docId, "27646120298312844");
  assert.deepEqual(client.calls[0].variables, expectedReact("1635855486666999", "1"));
});

test("Unlike: the same mutation with reaction id 0 and the next client_mutation_id (the captured REMOVE diff)", async () => {
  const { actions, client } = setup();
  await actions.react(STORY, REACTIONS.LIKE);
  await actions.react(STORY, REACTIONS.NONE);
  assert.deepEqual(REACT_SAMPLE.variables_REMOVE_diff, { "input.feedback_reaction_id": "0", "input.client_mutation_id": "2" });
  assert.deepEqual(client.calls[1].variables, expectedReact("0", "2"));
});

test("Comment: exactly the captured 2026-09 variables, ids replaced, groupID = the post's group", async () => {
  const { actions, client } = setup();
  await actions.comment(GROUP_STORY, "  👍  ");
  const expected = structuredClone(COMMENT_SAMPLE.variables);
  expected.groupID = "12345678901234567";
  Object.assign(expected.input, {
    client_mutation_id: "1",
    feedback_id: GROUP_STORY.feedback.id,
    message: { ranges: [], text: "👍" },
    attribution_id_v2: ATTRIBUTION,
    tracking: [STORY.tracking, JSON.stringify({ assistant_caller: "comet_above_composer", conversation_guide_session_id: UUIDS[2], conversation_guide_shown: null })],
    idempotence_token: "client:uuid-4",
    session_id: UUIDS[0],
    downstream_share_session_id: UUIDS[1],
    downstream_share_session_origin_uri: POST_URL,
    downstream_share_session_start_time: String(NOW),
  });
  assert.equal(client.calls[0].name, "useCometUFICreateCommentMutation");
  assert.equal(client.calls[0].docId, "39607465588840384");
  assert.deepEqual(client.calls[0].variables, expected);
  assert.equal(JSON.parse(expected.input.tracking[1]).assistant_caller, JSON.parse(COMMENT_SAMPLE.variables.input.tracking[1]).assistant_caller);
});

test("Comment on a non-group post sends groupID null; every call gets a fresh mutation id and idempotence token", async () => {
  const { actions, client } = setup();
  await actions.comment(STORY, "first");
  await actions.comment(STORY, "second");
  const [a, b] = client.calls.map((c) => c.variables);
  assert.equal(a.groupID, null);
  assert.notEqual(a.input.client_mutation_id, b.input.client_mutation_id);
  assert.notEqual(a.input.idempotence_token, b.input.idempotence_token);
  assert.match(b.input.idempotence_token, /^client:/);
  assert.equal(b.input.message.text, "second");
  assert.equal(a.input.session_id, b.input.session_id, "session ids last for the page");
});

test("without story tracking the tracking list is empty", async () => {
  const { actions, client } = setup();
  const bare = { ...STORY, tracking: null, url: null };
  await actions.react(bare, REACTIONS.LIKE);
  await actions.comment(bare, "x");
  assert.deepEqual(client.calls[0].variables.input.tracking, []);
  assert.equal(client.calls[0].variables.input.feedback_referrer, "/");
  assert.equal(client.calls[0].variables.input.downstream_share_session_origin_uri, "https://www.facebook.com/");
  assert.deepEqual(client.calls[1].variables.input.tracking, []);
});

test("a learned capture is the template: its keys and values are kept, only per-call ids replaced", async () => {
  const learned = {
    input: { feedback_id: "OLD", feedback_reaction_id: "OLD", client_mutation_id: "9", tracking: ["OLD"], session_id: "fb-session", new_field_2027: 1 },
    scale: 2,
    __relay_internal__pv__NewProviderrelayprovider: true,
  };
  const { actions, client } = setup({ table: { [ACTION_OPS.react]: [{ docId: "99999999999999999", variables: learned, source: "learned", fresh: true }] } });
  await actions.react(STORY, REACTIONS.LOVE);
  assert.deepEqual(client.calls[0].variables, {
    input: { feedback_id: STORY.feedback.id, feedback_reaction_id: REACTIONS.LOVE, client_mutation_id: "1", tracking: [STORY.tracking], session_id: "fb-session", new_field_2027: 1 },
    scale: 2,
    __relay_internal__pv__NewProviderrelayprovider: true,
  });
  assert.equal("actor_id" in client.calls[0].variables.input, false, "fields the capture lacks are not added");
});

test("a learned comment capture keeps its composer tracking entry and its own groupID key", async () => {
  const learned = structuredClone(COMMENT_SAMPLE.variables);
  const { actions, client } = setup({ table: { [ACTION_OPS.comment]: [{ docId: "88888888888888888", variables: learned, source: "learned", fresh: true }] } });
  await actions.comment(STORY, "hi");
  const v = client.calls[0].variables;
  assert.equal(v.groupID, null);
  assert.deepEqual(v.input.tracking, [STORY.tracking, COMMENT_SAMPLE.variables.input.tracking[1]]);
  assert.equal(v.input.attribution_id_v2, COMMENT_SAMPLE.variables.input.attribution_id_v2);
});

test("react reconciles from the echo", async () => {
  const echo = (info, count) => ({ data: { feedback_react: { feedback: { id: "f", reaction_count: { count }, viewer_feedback_reaction_info: info } } } });
  let s = setup({ handler: () => echo({ id: REACTIONS.LIKE }, 44) });
  assert.deepEqual(await s.actions.react(STORY, REACTIONS.LIKE), { ok: true, reactions: 44, viewerReaction: REACTIONS.LIKE });
  s = setup({ handler: () => echo(null, 43) });
  assert.deepEqual(await s.actions.react(STORY, REACTIONS.NONE), { ok: true, reactions: 43, viewerReaction: null });
  s = setup({ handler: () => echo({ reaction_type: "LIKE" }, 1) });
  assert.equal((await s.actions.react(STORY, REACTIONS.LIKE)).viewerReaction, REACTIONS.LIKE);
  s = setup({ handler: () => ({ data: { feedback_react: null } }) });
  assert.deepEqual(await s.actions.react(STORY, REACTIONS.WOW), { ok: true, reactions: undefined, viewerReaction: REACTIONS.WOW });
});

test("comment returns the echoed comment, or ours with the echoed id when the echo is sparse", async () => {
  const full = { id: "Y29tbWVudDox", body: { text: "hi" }, author: { id: "12345678901234", name: "Ann Example", url: "https://www.facebook.com/ann" }, created_time: 1792582000 };
  let s = setup({ handler: () => ({ data: { comment_create: { feedback_comment_edge: { node: full } } } }) });
  let res = await s.actions.comment(STORY, "hi");
  assert.equal(res.ok, true);
  assert.equal(res.comment.author.url, "https://www.facebook.com/ann");

  s = setup({ handler: () => ({ data: { comment_create: { feedback_comment_edge: { node: { id: "Y29tbWVudDoy", feedback: { url: "u" } } } } } }) });
  res = await s.actions.comment(STORY, "hello there");
  assert.deepEqual(res.comment, {
    id: "Y29tbWVudDoy",
    author: { id: "12345678901234", name: "Ann Example", url: "https://www.facebook.com/profile.php?id=12345678901234", avatar: null },
    text: "hello there",
    ranges: [],
    time: Math.floor(NOW / 1000),
    reactions: 0,
    replies: 0,
  });

  s = setup({ handler: () => ({ data: { comment_create: null } }) });
  assert.deepEqual(await s.actions.comment(STORY, "x"), { ok: false, error: "no-echo" });
});

test("guard rails: no feedback id, empty text, comments disabled, unavailable operation", async () => {
  const { actions, client } = setup({ table: { [ACTION_OPS.react]: [] } });
  assert.deepEqual(await actions.react({ ...STORY, feedback: {} }, REACTIONS.LIKE), { ok: false, error: "no-feedback" });
  assert.deepEqual(await actions.react(STORY, undefined), { ok: false, error: "bad-reaction" });
  assert.deepEqual(await actions.react(STORY, "LIKE"), { ok: false, error: "bad-reaction" });
  assert.deepEqual(await actions.comment(STORY, "   "), { ok: false, error: "empty" });
  assert.deepEqual(await actions.comment({ ...STORY, feedback: { id: "f", canComment: false } }, "x"), { ok: false, error: "disabled" });
  assert.deepEqual(await actions.react(STORY, REACTIONS.LIKE), { ok: false, error: "unavailable" });
  assert.equal(client.calls.length, 0);
});

test("request failures come back as { ok: false, error: kind }", async () => {
  const { actions } = setup({
    handler: () => {
      throw new GqlError("halted", { kind: "checkpoint" });
    },
  });
  assert.deepEqual(await actions.react(STORY, REACTIONS.LIKE), { ok: false, error: "checkpoint" });
  assert.deepEqual(await actions.comment(STORY, "x"), { ok: false, error: "checkpoint" });
});

test("a stale mutation doc_id is replaced and retried with a fresh client_mutation_id", async () => {
  const table = { [ACTION_OPS.react]: [{ docId: "1111", variables: null, source: "cache", fresh: false }, { docId: "2222", variables: null, source: "fallback", fresh: false }] };
  const { actions, client, ops } = setup({
    table,
    handler: (name, docId) => {
      if (docId === "1111") throw new GqlError("stale", { code: 1570245, kind: "stale-doc" });
      return { data: {} };
    },
  });
  assert.equal((await actions.react(STORY, REACTIONS.LIKE)).ok, true);
  assert.deepEqual(client.calls.map((c) => [c.docId, c.variables.input.client_mutation_id]), [["1111", "1"], ["2222", "2"]]);
  assert.deepEqual(ops.invalidated, [{ name: ACTION_OPS.react, docId: "1111" }]);
});

test("comments(): documented variables, paged by cursor, parsed from the Feedback node", async () => {
  const page = {
    data: {
      node: {
        __typename: "Feedback",
        comment_rendering_instance_for_feed_location: {
          comments: {
            edges: [{ node: { id: "c1", body: { text: "one" }, author: { id: "1", name: "A" }, created_time: 10 } }, { node: null }, { node: { id: "c2", body: { text: "two" } } }],
            page_info: { end_cursor: "NEXT", has_next_page: true },
          },
        },
      },
    },
  };
  const table = { [ACTION_OPS.comments]: [{ docId: "77777777777777777", variables: null, source: "probe", fresh: true }] };
  const { actions, client } = setup({ table, handler: () => page });
  const res = await actions.comments(STORY);
  assert.equal(res.ok, true);
  assert.deepEqual(res.comments.map((c) => c.text), ["one", "two"]);
  assert.equal(res.cursor, "NEXT");
  assert.equal(res.hasMore, true);
  assert.deepEqual(client.calls[0].variables, { commentsAfterCount: -1, commentsAfterCursor: null, feedLocation: "POST_PERMALINK_DIALOG", id: STORY.feedback.id });
  await actions.comments(STORY, "NEXT");
  assert.equal(client.calls[1].variables.commentsAfterCursor, "NEXT");
});

test("comments(): a learned template is replayed with the id and cursor replaced", () => {
  const template = { commentsAfterCount: -1, commentsAfterCursor: "OLD", feedLocation: "DEDICATED_COMMENTING_SURFACE", id: "OLD", scale: 1, __relay_internal__pv__Xrelayprovider: true };
  assert.deepEqual(commentsVariables(template, { feedbackId: "F", cursor: undefined }), { ...template, id: "F", commentsAfterCursor: null });
  assert.equal(template.id, "OLD");
});

test("comments(): failures and missing data", async () => {
  let s = setup({ table: { [ACTION_OPS.comments]: [] } });
  assert.deepEqual(await s.actions.comments(STORY, "C"), { ok: false, comments: [], cursor: "C", hasMore: false, error: "unavailable" });
  const table = { [ACTION_OPS.comments]: [{ docId: "77777777777777777", variables: null, source: "probe", fresh: true }] };
  s = setup({ table, handler: () => ({ data: { node: null } }) });
  assert.deepEqual(await s.actions.comments(STORY), { ok: true, comments: [], cursor: null, hasMore: false });
  s = setup({
    table,
    handler: () => {
      throw new GqlError("x", { kind: "network" });
    },
  });
  assert.deepEqual(await s.actions.comments(STORY), { ok: false, comments: [], cursor: null, hasMore: false, error: "network" });
});

test("can(): whether a doc_id is known for an action", async () => {
  const { actions } = setup();
  assert.equal(await actions.can("react"), true);
  assert.equal(await actions.can("comment"), true);
  assert.equal(await actions.can("comments"), false);
  assert.equal(await actions.can("share"), false);
});

test("a payload nulled next to GraphQL errors is a failure, so the optimistic UI reverts", async () => {
  const errors = (code) => [{ message: "Something went wrong", code, severity: "CRITICAL" }];
  let s = setup({ handler: () => ({ data: { feedback_react: null }, errors: errors(1675030) }) });
  assert.deepEqual(await s.actions.react(STORY, REACTIONS.LIKE), { ok: false, error: "server" });

  s = setup({ handler: () => ({ data: { comment_create: null }, errors: errors(1357004) }) });
  assert.deepEqual(await s.actions.comment(STORY, "x"), { ok: false, error: "auth" });

  const table = { [ACTION_OPS.comments]: [{ docId: "77777777777777777", variables: null, source: "probe", fresh: true }] };
  s = setup({ table, handler: () => ({ data: { node: null }, errors: errors(1675030) }) });
  assert.deepEqual(await s.actions.comments(STORY, "C"), { ok: false, comments: [], cursor: "C", hasMore: false, error: "server" });
});

test("a learned comment capture's own content (sticker, styling, reply target, focus) is not replayed", async () => {
  const learned = structuredClone(COMMENT_SAMPLE.variables);
  Object.assign(learned.input, { attachments: [{ media: { id: "555" } }], formatting_style: "BOLD", vod_video_timestamp: 42, reply_comment_parent_fbid: "777" });
  learned.focusCommentID = "Y29tbWVudDo3Nzc=";
  const { actions, client } = setup({ table: { [ACTION_OPS.comment]: [{ docId: "88888888888888888", variables: learned, source: "learned", fresh: true }] } });
  await actions.comment(STORY, "plain text");
  const v = client.calls[0].variables;
  assert.deepEqual(
    [v.input.attachments, v.input.formatting_style, v.input.vod_video_timestamp, v.input.reply_comment_parent_fbid, v.focusCommentID],
    [null, null, null, null, null],
  );
  assert.deepEqual(v.input.message, { ranges: [], text: "plain text" });

  const bare = { input: { feedback_id: "OLD", message: { text: "old" } } };
  const s2 = setup({ table: { [ACTION_OPS.comment]: [{ docId: "88888888888888888", variables: bare, source: "learned", fresh: true }] } });
  await s2.actions.comment(STORY, "x");
  assert.deepEqual(Object.keys(s2.client.calls[0].variables), ["input"], "keys the capture lacks are not added");
  assert.equal("attachments" in s2.client.calls[0].variables.input, false);
});
