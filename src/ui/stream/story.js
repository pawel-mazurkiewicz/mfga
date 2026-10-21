// One 2010 News Feed story (".uiStreamStory"): 50px picture, bold actor (▸ group) with the message
// inline, attachments, the shared story, the "time · Comment · Like · Share" line and the UFI box.
import { h, joinNodes, replaceChildren } from "../dom.js";
import { t } from "../../shared/i18n.js";
import { textSegments } from "../../data/text.js";
import { renderAttachments } from "./attachments.js";
import { passiveHeadline, truncateSegments } from "./format.js";
import { avatar, link, linkButton, nowMs, routeClicks, segmentNodes, sep } from "./parts.js";
import { timeNode } from "./time.js";
import { createFeedback } from "./ufi.js";

function actorNodes(actors) {
  const named = (actors || []).filter((a) => a && a.name);
  const nodes = named.map((a) => link(a.url, { class: "mfga-story-actor" }, a.name));
  if (nodes.length < 2) return nodes;
  const last = nodes.pop();
  return [joinNodes(nodes, () => ", "), t("story.and"), last];
}

function targetNodes(target) {
  if (!target?.name) return null;
  return [" ", h("i.mfga-story-arrow", { role: "img", "aria-label": t("story.to") }), " ", link(target.url, { class: "mfga-story-actor mfga-story-target" }, target.name)];
}

/** Message text; long texts are cut with 2010's "... See More". */
function messageText(story) {
  const segments = textSegments(story.text, story.ranges);
  if (!segments.length) return null;
  const { visible, truncated } = truncateSegments(segments);
  const el = h("span.mfga-story-text", segmentNodes(visible));
  if (truncated) {
    const expand = linkButton(t("story.seeMore"), () => replaceChildren(el, segmentNodes(segments)), "mfga-story-seemore");
    el.append(h("span.mfga-story-more", "... ", expand));
  }
  return el;
}

/** "Actor ▸ Group  message"; a group post title gets its own bold line before the text. */
function headline(story) {
  const passive = passiveHeadline(story);
  const text = messageText(story);
  const head = h("div.mfga-story-msg", actorNodes(story.actors), targetNodes(story.target), passive ? [" ", h("span.mfga-story-passive", passive)] : null, !story.title && text ? [" ", text] : null);
  if (!story.title) return head;
  return [head, h("div.mfga-story-title", story.title), text ? h("div.mfga-story-msg", text) : null];
}

function timeLink(story, ctx) {
  const time = timeNode(story.time, nowMs(ctx));
  if (!time) return null;
  return story.url ? link(story.url, { class: "mfga-story-time" }, time) : h("span.mfga-story-time", time);
}

/** Share opens the post on Facebook (stories with something to share, as in 2010). */
function shareLink(story, ctx) {
  const shareable = story.shared || (story.attachments || []).some((a) => a && a.kind !== "unavailable");
  if (!shareable || !story.url || typeof ctx.open !== "function") return null;
  return linkButton(t("story.share"), () => ctx.open(story.url, { newTab: false }), "mfga-story-share");
}

function sharedStory(shared, ctx) {
  if (!shared) return null;
  return h(
    "div.mfga-story-shared",
    { "data-key": shared.key || null },
    headline(shared),
    renderAttachments(shared),
    h("div.mfga-story-meta", timeLink(shared, ctx)),
  );
}

/** <div class="mfga-story" data-key=...> for one Story (ARCHITECTURE §3.2). */
export function renderStory(story, ctx) {
  const fb = createFeedback(story, ctx);
  const meta = joinNodes(
    [timeLink(story, ctx), story.ai ? h("span.mfga-story-ai", t("story.ai")) : null, fb.commentLink, fb.likeLink, shareLink(story, ctx)],
    sep,
  );
  const actor = (story.actors || [])[0];
  const el = h(
    "div.mfga-story",
    { "data-key": story.key || story.postId || story.nodeId || null },
    avatar(actor?.url, story.avatar, "mfga-story-pic"),
    h(
      "div.mfga-story-body",
      headline(story),
      renderAttachments(story),
      sharedStory(story.shared, ctx),
      h("div.mfga-story-meta", meta),
      fb.ufi,
    ),
  );
  routeClicks(el, ctx);
  return el;
}
