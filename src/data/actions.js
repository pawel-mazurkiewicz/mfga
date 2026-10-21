// Like/Unlike, comment and comment-list requests (graphql-protocol §7, §5.7).
// Variables come from the newest capture of the operation (background learner) or, failing that, the built-in
// 2026-09 templates below; only per-call ids are replaced. Requests share the paced GraphQL queue.

import { health, uuid as realUuid, warn } from "../shared/util.js";
import { extractComment as realExtractComment } from "./extract.js";
import { errorKind } from "./gql.js";
import { runOp } from "./ops.js";

export const REACTIONS = Object.freeze({
  LIKE: "1635855486666999",
  LOVE: "1678524932434102",
  CARE: "613557422527858",
  HAHA: "115940658764963",
  WOW: "478547315650144",
  SAD: "908563459236466",
  ANGRY: "444813342392137",
  NONE: "0",
});

export const ACTION_OPS = Object.freeze({
  react: "CometUFIFeedbackReactMutation",
  comment: "useCometUFICreateCommentMutation",
  comments: "CommentsListComponentsPaginationQuery",
});

// Constant field of the home attribution id in both 2026-09 captures (the Home bookmark).
const HOME_BOOKMARK_ID = "4748854339";

const isObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

/** Sets only keys the template already has: a capture without a field means Facebook stopped sending it. */
function assignPresent(target, values) {
  for (const [key, value] of Object.entries(values)) if (key in target && value !== undefined) target[key] = value;
}

/** Per-page ids Facebook keeps for the whole navigation (session, share session, attribution). */
export function createSessionIds({ uuid = realUuid, now = Date.now, random = Math.random } = {}) {
  const startTime = String(now());
  const navId = String(100000 + Math.floor(random() * 900000));
  return {
    sessionId: uuid(),
    shareSessionId: uuid(),
    assistantSessionId: uuid(),
    startTime,
    attribution: `CometHomeRoot.react,comet.home,via_cold_start,${startTime},${navId},${HOME_BOOKMARK_ID},,`,
  };
}

/** CometUFIFeedbackReactMutation variables, 2026-09 capture shape (samples/mutation-CometUFIFeedbackReactMutation). */
export function reactTemplate(ids) {
  return {
    input: {
      attribution_id_v2: ids.attribution,
      feedback_id: null,
      feedback_reaction_id: null,
      feedback_source: "NEWS_FEED",
      feedback_referrer: null,
      is_tracking_encrypted: true,
      tracking: [],
      session_id: ids.sessionId,
      downstream_share_session_id: ids.shareSessionId,
      downstream_share_session_origin_uri: null,
      downstream_share_session_start_time: ids.startTime,
      actor_id: null,
      client_mutation_id: null,
    },
    scale: 1,
    canUseNicknameOnComet: false,
    useDefaultActor: false,
    __relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider: false,
  };
}

/** useCometUFICreateCommentMutation variables, 2026-09 capture shape (samples/mutation-useCometUFICreateCommentMutation). */
export function commentTemplate(ids) {
  const assistant = { assistant_caller: "comet_above_composer", conversation_guide_session_id: ids.assistantSessionId, conversation_guide_shown: null };
  return {
    feedLocation: "POST_PERMALINK_DIALOG",
    feedbackSource: 2,
    groupID: null,
    input: {
      client_mutation_id: null,
      attachments: null,
      feedback_id: null,
      formatting_style: null,
      is_inline_vote_enabled_for_qna: false,
      message: { ranges: [], text: "" },
      attribution_id_v2: ids.attribution,
      vod_video_timestamp: null,
      is_tracking_encrypted: true,
      tracking: [JSON.stringify(assistant)],
      feedback_source: "OBJECT",
      idempotence_token: null,
      session_id: ids.sessionId,
      downstream_share_session_id: ids.shareSessionId,
      downstream_share_session_origin_uri: null,
      downstream_share_session_start_time: ids.startTime,
    },
    inviteShortLinkKey: null,
    renderLocation: null,
    scale: 1,
    useDefaultActor: false,
    focusCommentID: null,
    translationType: "AUTO_TRANSLATE",
    canUseNicknameOnComet: false,
    __relay_internal__pv__groups_comet_use_glvrelayprovider: false,
    __relay_internal__pv__CometUFICommentActionLinksRewriteEnabledrelayprovider: true,
    __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider: false,
    __relay_internal__pv__IsWorkUserrelayprovider: false,
    __relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider: "AUTO_TRANSLATE",
  };
}

/** p: {feedbackId, reactionId, userId, mutationId, tracking, referrer, originUri} */
export function reactVariables(template, p) {
  const v = structuredClone(template);
  const input = isObject(v.input) ? v.input : (v.input = {});
  Object.assign(input, { feedback_id: p.feedbackId, feedback_reaction_id: p.reactionId, client_mutation_id: p.mutationId });
  assignPresent(input, {
    actor_id: p.userId,
    tracking: p.tracking ? [p.tracking] : [],
    feedback_referrer: p.referrer,
    downstream_share_session_origin_uri: p.originUri,
  });
  return v;
}

/** p: {feedbackId, groupId, text, mutationId, idempotenceToken, tracking, originUri} */
export function commentVariables(template, p) {
  const v = structuredClone(template);
  if ("groupID" in v) v.groupID = p.groupId ?? null; // must be the post's own group or null (1357010 otherwise)
  const input = isObject(v.input) ? v.input : (v.input = {});
  Object.assign(input, {
    client_mutation_id: p.mutationId,
    feedback_id: p.feedbackId,
    message: { ranges: [], text: p.text },
    idempotence_token: p.idempotenceToken,
  });
  // Keep the template's plain-JSON tracking entries (composer info); the encrypted entry is the story's own.
  const plain = (Array.isArray(input.tracking) ? input.tracking : []).filter((s) => typeof s === "string" && s.startsWith("{"));
  assignPresent(input, { tracking: p.tracking ? [p.tracking, ...plain] : [], downstream_share_session_origin_uri: p.originUri });
  return v;
}

/** CommentsListComponentsPaginationQuery variables; the fallback lists only the documented ones (§5.7). */
export function commentsVariables(template, { feedbackId, cursor }) {
  const base = isObject(template) ? structuredClone(template) : { commentsAfterCount: -1, commentsAfterCursor: null, feedLocation: "POST_PERMALINK_DIALOG", id: null };
  return { ...base, id: feedbackId, commentsAfterCursor: cursor ?? null };
}

function referrerOf(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return "/";
  }
}

/**
 * A response without the field we asked for, next to GraphQL errors, is a failed request whose errors gql.js
 * passed through as non-critical (unknown codes with partial data). Its kind is the first error's.
 */
function failedKind(res, payload) {
  return payload == null && res.errors?.length ? errorKind(res.errors[0]?.code) : null;
}

/** The viewer's reaction after the mutation, from the echo when it carries one. */
function echoedReaction(feedback, requested) {
  if (isObject(feedback) && "viewer_feedback_reaction_info" in feedback) {
    const info = feedback.viewer_feedback_reaction_info;
    return info ? String(info.id ?? requested) : null;
  }
  return requested === REACTIONS.NONE ? null : requested;
}

/**
 * createActions({ client, ops, harvest }) -> { react, comment, comments, can }
 * Hooks: extractComment (WP-A), uuid, now, random.
 */
export function createActions({ client, ops, harvest, extractComment = realExtractComment, uuid = realUuid, now = Date.now, random = Math.random }) {
  const ids = createSessionIds({ uuid, now, random });
  let mutationCounter = 0;
  const nextMutationId = () => String(++mutationCounter);

  return {
    async react(story, reactionId) {
      const feedbackId = story?.feedback?.id;
      if (!feedbackId) return { ok: false, error: "no-feedback" };
      if (!/^\d+$/.test(String(reactionId))) return { ok: false, error: "bad-reaction" };
      try {
        const res = await runOp({ client, ops }, ACTION_OPS.react, (op) =>
          reactVariables(op.variables?.input ? op.variables : reactTemplate(ids), {
            feedbackId,
            reactionId: String(reactionId),
            userId: harvest.tokens.userId,
            mutationId: nextMutationId(),
            tracking: story.tracking,
            referrer: story.url ? referrerOf(story.url) : "/",
            originUri: story.url || "https://www.facebook.com/",
          }),
        );
        if (!res) return { ok: false, error: "unavailable" };
        const failed = failedKind(res, res.data?.feedback_react);
        if (failed) return failure("react", { kind: failed });
        health.count("actions.react");
        const feedback = res.data?.feedback_react?.feedback;
        const count = feedback?.reaction_count?.count;
        return { ok: true, reactions: Number.isFinite(count) ? count : undefined, viewerReaction: echoedReaction(feedback, String(reactionId)) };
      } catch (err) {
        return failure("react", err);
      }
    },

    async comment(story, text) {
      const feedbackId = story?.feedback?.id;
      const message = String(text ?? "").trim();
      if (!feedbackId) return { ok: false, error: "no-feedback" };
      if (!message) return { ok: false, error: "empty" };
      if (story.feedback.canComment === false) return { ok: false, error: "disabled" };
      try {
        const res = await runOp({ client, ops }, ACTION_OPS.comment, (op) =>
          commentVariables(op.variables?.input ? op.variables : commentTemplate(ids), {
            feedbackId,
            groupId: story.groupId ?? null,
            text: message,
            mutationId: nextMutationId(),
            idempotenceToken: `client:${uuid()}`,
            tracking: story.tracking,
            originUri: story.url || "https://www.facebook.com/",
          }),
        );
        if (!res) return { ok: false, error: "unavailable" };
        const created = res.data?.comment_create;
        if (!created) return { ok: false, error: failedKind(res, created) ?? "no-echo" };
        health.count("actions.comment");
        const node = created.feedback_comment_edge?.node;
        const echoed = node ? extractComment(node) : null;
        return { ok: true, comment: echoed?.text ? echoed : ownComment(node?.id ?? null, message) };
      } catch (err) {
        return failure("comment", err);
      }
    },

    async comments(story, cursor) {
      const feedbackId = story?.feedback?.id;
      const empty = { ok: false, comments: [], cursor: cursor ?? null, hasMore: false };
      if (!feedbackId) return { ...empty, error: "no-feedback" };
      try {
        const res = await runOp({ client, ops }, ACTION_OPS.comments, (op) => commentsVariables(op.variables, { feedbackId, cursor }));
        if (!res) return { ...empty, error: "unavailable" };
        const connection = res.data?.node?.comment_rendering_instance_for_feed_location?.comments;
        const failed = failedKind(res, connection);
        if (failed) return { ...failure("comments", { kind: failed }), comments: [], cursor: cursor ?? null, hasMore: false };
        const comments = (Array.isArray(connection?.edges) ? connection.edges : []).map((e) => (e?.node ? extractComment(e.node) : null)).filter(Boolean);
        const info = connection?.page_info;
        return { ok: true, comments, cursor: info?.end_cursor ?? null, hasMore: info?.has_next_page === true };
      } catch (err) {
        return { ...failure("comments", err), comments: [], cursor: cursor ?? null, hasMore: false };
      }
    },

    async can(action) {
      const name = ACTION_OPS[action];
      return !!name && !!(await ops.get(name));
    },
  };

  /** What we know about a comment we just posted when the echo carries only its id. */
  function ownComment(id, text) {
    const { userId, name } = harvest.tokens;
    return {
      id,
      author: { id: userId, name: name ?? null, url: userId ? `https://www.facebook.com/profile.php?id=${userId}` : null, avatar: null },
      text,
      ranges: [],
      time: Math.floor(now() / 1000),
      reactions: 0,
      replies: 0,
    };
  }

  function failure(action, err) {
    health.count(`actions.${action}.failed`);
    if (!err?.kind) warn(`${action} failed`, err);
    return { ok: false, error: err?.kind || "error" };
  }
}
