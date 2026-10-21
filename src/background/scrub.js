// What the background learner keeps of a captured request: the variables' shape, never what the request was
// about. Pure (unit-tested): no extension APIs here.
//
// A capture is the user's own activity: which post they liked or commented on (feedback id, post URL), in which
// group, the comments they opened, their actor id, the encrypted per-story tracking, feed cursors and recently
// viewed posts, and the page's session and navigation chain. MFGA fills every one of these in itself for each
// request (data/actions.js, data/feed-source.js), so they are blanked before anything is stored. Keys stay present
// (as null or []): a key the capture lacks means Facebook stopped sending it.

const isObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

/** Per-call / per-page values, blanked to null wherever they appear (top level or `input`). */
export const PER_CALL_KEYS = Object.freeze([
  // what the request was about
  "feedback_id",
  "feedback_reaction_id",
  "feedback_referrer",
  "downstream_share_session_origin_uri",
  "groupID",
  "id",
  "reply_comment_parent_fbid",
  "focusCommentID",
  "attachments",
  // who and which call
  "actor_id",
  "client_mutation_id",
  "idempotence_token",
  // the page's session and navigation chain
  "session_id",
  "downstream_share_session_id",
  "downstream_share_session_start_time",
  "attribution_id_v2",
  // paging
  "cursor",
  "feedEndCursor",
  "commentsAfterCursor",
  "commentsBeforeCursor",
]);

/** Lists of per-call values, emptied. */
const PER_CALL_LISTS = Object.freeze(["recentVPVs"]);

/** A plain-JSON tracking entry (composer info) keeps its keys; its conversation-guide session does not. */
function scrubTrackingEntry(entry) {
  if (typeof entry !== "string" || !entry.startsWith("{")) return null; // encrypted per-story blobs
  try {
    const o = JSON.parse(entry);
    if (!isObject(o)) return null;
    if ("conversation_guide_session_id" in o) o.conversation_guide_session_id = null;
    return JSON.stringify(o);
  } catch {
    return null;
  }
}

function scrubLevel(o) {
  for (const key of PER_CALL_KEYS) if (key in o) o[key] = null;
  for (const key of PER_CALL_LISTS) if (Array.isArray(o[key])) o[key] = [];
  if (Array.isArray(o.tracking)) o.tracking = o.tracking.map(scrubTrackingEntry).filter(Boolean);
  // User-authored free text (comment bodies).
  if ("message" in o && isObject(o.message)) o.message = { ranges: [], text: "" };
}

/** Removes everything but the template's shape from captured `variables` (mutated and returned). */
export function scrubVariables(variables) {
  if (!isObject(variables)) return variables;
  scrubLevel(variables);
  if (isObject(variables.input)) scrubLevel(variables.input);
  return variables;
}
