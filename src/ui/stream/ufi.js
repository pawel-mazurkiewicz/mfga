// The 2010 feedback box under a story (".uiUfi"): like sentence, "View all N comments", comments and the
// "Write a comment..." box, plus the story's "Comment" and "Like/Unlike" action links, which share state.
import { h, replaceChildren } from "../dom.js";
import { icon } from "../icons.js";
import { t } from "../../shared/i18n.js";
import { health, uuid } from "../../shared/util.js";
import { DEFAULTS } from "../../shared/settings.js";
import { chronological, feedbackState, formatCount, isReacted, likeSentence, mergeComments } from "./format.js";
import { avatar, guard, link, linkButton, nowMs, richText, sep } from "./parts.js";
import { timeNode } from "./time.js";
import { whenVisibleFor } from "./visibility.js";

// feedback_reaction_id values (src/data/actions.js REACTIONS.LIKE / REACTIONS.NONE).
const LIKE = "1635855486666999";
const UNREACT = "0";
const PREVIEW_COUNT = 2;
const PREVIEW_DELAY_MS = 1000;

/** Reads the settings object whether ctx.settings is the plain object or the reactive store. */
export function settingsOf(ctx) {
  const s = typeof ctx?.settings?.get === "function" ? ctx.settings.get() : ctx?.settings;
  return s || DEFAULTS;
}

/** Runs an action, turning exceptions and malformed results into {ok:false}. */
async function attempt(fn) {
  try {
    const r = await fn();
    return r && typeof r === "object" ? r : { ok: false };
  } catch (error) {
    return { ok: false, error };
  }
}

function renderComment(c, story, ctx) {
  const author = c.author || {};
  const reactions = Number.isFinite(c.reactions) && c.reactions > 0 ? c.reactions : 0;
  const replies = Number.isFinite(c.replies) && c.replies > 0 ? c.replies : 0;
  return h(
    "div.mfga-ufi-item.mfga-ufi-comment",
    { "data-id": c.id || null },
    avatar(author.url, author.avatar, "mfga-ufi-pic"),
    h(
      "div.mfga-ufi-comment-body",
      h("div.mfga-ufi-comment-text", author.name ? [link(author.url, { class: "mfga-ufi-actor" }, author.name), " "] : null, richText(c.text, c.ranges)),
      h(
        "div.mfga-ufi-comment-meta",
        timeNode(c.time, nowMs(ctx)),
        reactions ? [sep(), icon("ufi_like", { className: "mfga-ufi-comment-like" }), ` ${formatCount(reactions)}`] : null,
        replies ? [sep(), link(story.url, { class: "mfga-ufi-replies" }, t("ufi.replies", { n: replies }))] : null,
      ),
    ),
  );
}

/**
 * Builds the UFI of one story. Returns { ufi, likeLink, commentLink } — the two links go in the story's
 * meta line; commentLink is null when the viewer can't comment.
 */
export function createFeedback(story, ctx) {
  const initial = feedbackState(story.feedback);
  const state = {
    liked: initial.liked,
    count: initial.count,
    total: initial.comments,
    comments: [],
    cursor: null,
    hasMore: true,
    loaded: false,
    expanded: false,
    loading: false,
    liking: false,
    posting: false,
    composing: false,
    expandOnLoad: false,
  };
  const canComment = initial.canComment;

  const likes = h("div.mfga-ufi-item.mfga-ufi-likes");
  const viewAll = h("div.mfga-ufi-item.mfga-ufi-viewall");
  const list = h("div.mfga-ufi-comments");
  const error = h("div.mfga-ufi-item.mfga-ufi-error", { role: "alert", hidden: true });
  const add = canComment ? buildAddComment() : null;
  const nub = h("i.mfga-ufi-nub", { "aria-hidden": "true" });
  const ufi = h("div.mfga-ufi", nub, likes, viewAll, list, error, add?.item);

  const likeLink = linkButton("", toggleLike, "mfga-story-like");
  const commentLink = canComment ? linkButton(t("story.comment"), openComposer, "mfga-story-comment") : null;

  let cancelPreview = null;
  if (settingsOf(ctx).feed?.previewComments !== false && state.total > 0 && typeof ctx.actions?.comments === "function") {
    cancelPreview = whenVisibleFor(ufi, PREVIEW_DELAY_MS, guard(() => loadComments(true)));
  }
  render();
  return { ufi, likeLink, commentLink };

  // ---- rendering ----

  function totalComments() {
    return Math.max(state.total, state.comments.length);
  }

  function shownComments() {
    const all = chronological(state.comments);
    return state.expanded ? all : all.slice(-PREVIEW_COUNT);
  }

  function render() {
    renderLikes();
    renderComments();
    renderViewAll();
    if (add) add.item.hidden = !(state.composing || totalComments() > 0);
    updateVisibility();
  }

  function renderLikes() {
    likeLink.textContent = state.liked ? t("ufi.unlike") : t("ufi.like");
    likeLink.setAttribute("aria-pressed", String(state.liked));
    const parts = likeSentence(state.count, state.liked);
    likes.hidden = !parts.length;
    replaceChildren(
      likes,
      parts.length ? icon("ufi_like_big", { className: "mfga-ufi-ico" }) : null,
      h(
        "span.mfga-ufi-line",
        parts.map((p) => (p.link ? link(story.url, { class: "mfga-ufi-likers" }, p.text) : p.text)),
      ),
    );
  }

  function renderComments() {
    replaceChildren(
      list,
      shownComments().map((c) => renderComment(c, story, ctx)),
    );
  }

  function renderViewAll() {
    const total = totalComments();
    const shown = shownComments().length;
    const more = state.expanded ? state.hasMore : total > shown;
    viewAll.hidden = !more;
    viewAll.classList.toggle("mfga-loading", state.loading);
    if (!more) return;
    const label = state.expanded ? t("ufi.viewMore") : t("ufi.viewAll", { n: total });
    replaceChildren(
      viewAll,
      icon("ufi_comment", { className: "mfga-ufi-ico" }),
      linkButton(label, onViewAll, "mfga-ufi-viewall-link"),
      state.loading ? h("span.mfga-spinner.mfga-ufi-spinner", { role: "progressbar" }) : null,
    );
  }

  function updateVisibility() {
    ufi.hidden = [likes, viewAll, error, add?.item].every((el) => !el || el.hidden) && !list.childElementCount;
  }

  function showError(kind) {
    replaceChildren(
      error,
      h("span.mfga-ufi-error-text", t(`ufi.error.${kind}`)),
      story.url ? [" ", link(story.url, { class: "mfga-ufi-error-open" }, t("ufi.error.open"))] : null,
    );
    error.hidden = false;
    updateVisibility();
  }

  function clearError() {
    if (error.hidden) return;
    error.hidden = true;
    replaceChildren(error);
    updateVisibility();
  }

  // ---- like ----

  async function toggleLike() {
    if (state.liking) return;
    if (typeof ctx.actions?.react !== "function") return showError("like");
    const before = { liked: state.liked, count: state.count };
    state.liked = !before.liked;
    state.count = Math.max(0, before.count + (state.liked ? 1 : -1));
    state.liking = true;
    clearError();
    render();
    const r = await attempt(() => ctx.actions.react(story, state.liked ? LIKE : UNREACT));
    state.liking = false;
    if (!r.ok) {
      Object.assign(state, before);
      render();
      showError("like");
      health.count("stream.like-failed");
      return;
    }
    if (Number.isFinite(r.reactions)) state.count = Math.max(0, r.reactions);
    if ("viewerReaction" in r) state.liked = isReacted(r.viewerReaction);
    render();
    health.count("stream.like");
  }

  // ---- comments ----

  function onViewAll() {
    cancelPreview?.();
    if (state.loading) {
      state.expandOnLoad = true;
      return;
    }
    if (state.loaded && !state.expanded) {
      state.expanded = true;
      render();
      if (!state.hasMore || state.comments.length >= totalComments()) return;
    }
    loadComments(false);
  }

  async function loadComments(preview) {
    cancelPreview = null;
    if (state.loading || (state.loaded && !state.hasMore)) return;
    if (typeof ctx.actions?.comments !== "function") {
      if (!preview) showError("comments");
      return;
    }
    state.loading = true;
    renderViewAll();
    const r = await attempt(() => ctx.actions.comments(story, state.cursor ?? undefined));
    state.loading = false;
    if (!r.ok) {
      renderViewAll();
      if (!preview) showError("comments");
      health.count("stream.comments-failed");
      return;
    }
    state.comments = mergeComments(state.comments, Array.isArray(r.comments) ? r.comments : []);
    state.cursor = r.cursor ?? null;
    state.hasMore = Boolean(r.hasMore && r.cursor);
    state.loaded = true;
    if (!preview || state.expandOnLoad) state.expanded = true;
    clearError();
    render();
    health.count(preview ? "stream.comments-preview" : "stream.comments-load");
  }

  // ---- add comment ----

  function buildAddComment() {
    const input = h("textarea.mfga-ufi-input", {
      rows: 1,
      placeholder: t("ufi.write"),
      "aria-label": t("ufi.write"),
      onkeydown: guard(onKey),
      oninput: guard(autosize),
      onfocus: guard(() => item.classList.add("mfga-ufi-add-active")),
      onblur: guard(() => {
        if (!input.value.trim()) item.classList.remove("mfga-ufi-add-active");
      }),
    });
    const me = ctx.me || {};
    const submit = h("button.mfga-ufi-submit", { type: "button", onclick: guard(postComment) }, t("ufi.submit"));
    const item = h(
      "div.mfga-ufi-item.mfga-ufi-add",
      avatar(me.url, me.avatar, "mfga-ufi-pic mfga-ufi-me"),
      h("div.mfga-ufi-add-body", input, h("div.mfga-ufi-add-actions", submit)),
    );
    return { item, input, submit };
  }

  function onKey(ev) {
    if (ev.key !== "Enter" || ev.shiftKey || ev.isComposing) return;
    ev.preventDefault();
    postComment();
  }

  function autosize() {
    const input = add.input;
    input.style.height = "";
    input.style.height = `${Math.min(input.scrollHeight + 2, 200)}px`;
  }

  function openComposer() {
    state.composing = true;
    render();
    add.input.focus();
  }

  function localComment(text) {
    const me = ctx.me || {};
    const time = Math.floor(nowMs(ctx) / 1000);
    return { id: `local:${uuid()}`, author: { name: me.name || "", url: me.url || null, avatar: me.avatar || null }, text, ranges: [], time, reactions: 0, replies: 0 };
  }

  async function postComment() {
    const text = add.input.value.trim();
    if (!text || state.posting) return;
    if (typeof ctx.actions?.comment !== "function") return showError("comment");
    state.posting = true;
    add.input.readOnly = true;
    add.item.classList.add("mfga-busy");
    clearError();
    const r = await attempt(() => ctx.actions.comment(story, text));
    state.posting = false;
    add.input.readOnly = false;
    add.item.classList.remove("mfga-busy");
    if (!r.ok) {
      showError("comment");
      health.count("stream.comment-failed");
      return;
    }
    const echo = r.comment && typeof r.comment === "object" ? r.comment : localComment(text);
    const posted = Number.isFinite(echo.time) ? echo : { ...echo, time: Math.floor(nowMs(ctx) / 1000) };
    state.comments = mergeComments(state.comments, [posted]);
    state.total += 1;
    add.input.value = "";
    autosize();
    render();
    add.input.focus();
    health.count("stream.comment");
  }
}
