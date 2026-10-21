import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scrubVariables } from "../../../src/background/scrub.js";
import { reactVariables, commentVariables, createSessionIds } from "../../../src/data/actions.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`../data-net/fixtures/${name}`, import.meta.url), "utf8"));
const REACT = fixture("mutation-react-2026-09.json").variables_LIKE;
const COMMENT = fixture("mutation-comment-2026-09.json").variables;

/** Every string anywhere in a value. */
const strings = (v, out = []) => {
  if (typeof v === "string") out.push(v);
  else if (v && typeof v === "object") for (const x of Object.values(v)) strings(x, out);
  return out;
};

test("a learned Like keeps only the template's shape: no post, URL, actor, tracking or session", () => {
  const scrubbed = scrubVariables(structuredClone(REACT));
  assert.deepEqual(Object.keys(scrubbed.input), Object.keys(REACT.input), "every key stays present");
  assert.deepEqual(Object.keys(scrubbed), Object.keys(REACT));
  for (const key of ["feedback_id", "feedback_referrer", "downstream_share_session_origin_uri", "actor_id", "session_id", "downstream_share_session_id", "downstream_share_session_start_time", "attribution_id_v2", "client_mutation_id", "feedback_reaction_id"]) {
    assert.equal(scrubbed.input[key], null, key);
  }
  assert.deepEqual(scrubbed.input.tracking, [], "the story's encrypted tracking is not kept");
  assert.equal(scrubbed.input.feedback_source, "NEWS_FEED", "shape constants stay");
  assert.equal(scrubbed.input.is_tracking_encrypted, true);
  const kept = strings(scrubbed).join("\n");
  for (const secret of [REACT.input.feedback_id, "pfbid02Sample", REACT.input.actor_id, REACT.input.session_id, "1789727958490"]) {
    assert.equal(kept.includes(secret), false, `${secret} is not stored`);
  }
});

test("a learned comment keeps its composer entry's keys but no group, post, text, token or session", () => {
  const scrubbed = scrubVariables(structuredClone(COMMENT));
  assert.equal(scrubbed.groupID, null);
  assert.deepEqual(scrubbed.input.message, { ranges: [], text: "" });
  for (const key of ["feedback_id", "idempotence_token", "client_mutation_id", "downstream_share_session_origin_uri", "session_id", "attribution_id_v2"]) {
    assert.equal(scrubbed.input[key], null, key);
  }
  assert.deepEqual(scrubbed.input.tracking.map((s) => JSON.parse(s)), [{ assistant_caller: "comet_above_composer", conversation_guide_session_id: null, conversation_guide_shown: null }]);
  const kept = strings(scrubbed).join("\n");
  for (const secret of [COMMENT.groupID, COMMENT.input.feedback_id, "👍", "c34d1b66", "2207beac", "1789729322369"]) {
    assert.equal(kept.includes(secret), false, `${secret} is not stored`);
  }
});

test("a scrubbed capture still works as the actions' template", () => {
  const ids = createSessionIds({ uuid: () => "u-1", now: () => 1792582184123, random: () => 0.5 });
  const react = reactVariables(scrubVariables(structuredClone(REACT)), { feedbackId: "F", reactionId: "1635855486666999", userId: "42", mutationId: "1", tracking: "T", referrer: "/p", originUri: "https://www.facebook.com/p", ids });
  assert.deepEqual(
    [react.input.feedback_id, react.input.actor_id, react.input.tracking, react.input.feedback_referrer, react.input.session_id, react.input.attribution_id_v2],
    ["F", "42", ["T"], "/p", "u-1", ids.attribution],
  );
  const comment = commentVariables(scrubVariables(structuredClone(COMMENT)), { feedbackId: "F", groupId: "G", text: "hi", mutationId: "2", idempotenceToken: "client:x", tracking: "T", originUri: "https://www.facebook.com/p", ids });
  assert.equal(comment.groupID, "G");
  assert.deepEqual(comment.input.tracking.map((s, i) => (i ? JSON.parse(s).conversation_guide_session_id : s)), ["T", "u-1"]);
});

test("feed and comment-list captures lose their cursors, viewed posts and feedback id", () => {
  const feed = scrubVariables({ cursor: "AQHR", feedEndCursor: "abc", recentVPVs: [{ id: "123" }], feedStyle: "DEFAULT", count: 3 });
  assert.deepEqual(feed, { cursor: null, feedEndCursor: null, recentVPVs: [], feedStyle: "DEFAULT", count: 3 });
  const list = scrubVariables({ id: "ZmVlZGJhY2s6MQ==", commentsAfterCursor: "c", commentsAfterCount: -1, feedLocation: "POST_PERMALINK_DIALOG" });
  assert.deepEqual(list, { id: null, commentsAfterCursor: null, commentsAfterCount: -1, feedLocation: "POST_PERMALINK_DIALOG" });
  assert.equal(scrubVariables(null), null);
});
