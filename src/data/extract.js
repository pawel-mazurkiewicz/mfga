// Story extraction: one Facebook Story node -> the normalized Story model (ARCHITECTURE §3.2).
//
// Every comet_sections.*.story is a partial projection of the same Story, so each field is read from
// its canonical path first, then from the other projections, then by a bounded search that never
// enters a shared post (attached_story), a nested edge ({node, cursor}) or a GHL decoy.

import { get, health } from "../shared/util.js";

const FB_ORIGIN = "https://www.facebook.com/";
const SEARCH_DEPTH = 40;
const SHARED_DEPTH = 2;
const ALBUM_ITEMS = 4;

const EMPTY = Object.freeze({});
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const obj = (v) => (isObj(v) ? v : EMPTY);
const objects = (v) => (Array.isArray(v) ? v.filter(isObj) : []);
const str = (v) => (typeof v === "string" && v !== "" ? v : null);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const textOf = (v) => str(v?.text) ?? str(v);

/** Non-negative integer from a number or an all-digits string ("1.2K" and the like give null). */
const int = (v) => {
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return Number.isInteger(v) && v >= 0 ? v : null;
};
const idString = (v) => str(v) ?? (Number.isFinite(v) ? String(v) : null);

/** First argument that is not null/undefined, else null. */
function pick(...values) {
  for (const v of values) if (v != null) return v;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Bounded story search (shared with the classifier)

const SKIP_KEY = /^(?:attached_story$|ghl_)/i;
const isDecoy = (o) => typeof o.__typename === "string" && /GHLMocked/i.test(o.__typename);

/**
 * Depth-first search inside one story for the first object where test(object, key) is true. `key` is the
 * property the object sits under (array items report the array's key). Never enters attached_story,
 * ghl_* keys, *GHLMocked* objects or nested edges, and stops at `maxDepth`.
 */
export function findInStory(root, test, maxDepth = SEARCH_DEPTH) {
  if (root == null || typeof root !== "object") return null;
  const stack = [[root, null, 0]];
  while (stack.length) {
    const [value, key, depth] = stack.pop();
    const isList = Array.isArray(value);
    if (!isList && value !== root && (isDecoy(value) || ("node" in value && "cursor" in value))) continue;
    if (!isList && test(value, key)) return value;
    if (depth >= maxDepth) continue;
    const entries = isList ? value.map((child) => [key, child]) : Object.entries(value).filter(([k]) => !SKIP_KEY.test(k));
    for (let i = entries.length - 1; i >= 0; i--) {
      const [childKey, child] = entries[i];
      if (child != null && typeof child === "object") stack.push([child, childKey, depth + 1]);
    }
  }
  return null;
}

const GENAI_TYPENAME = "CometFeedStoryGenAIContentTransparencyStrategy";

/** Facebook's "made with AI" header section, when it says the post was made with AI. */
export function isAiLabel(o) {
  return (
    isObj(o) &&
    o.__typename === GENAI_TYPENAME &&
    (o.was_detected_as_ai_generated === true ||
      o.was_self_disclosed_as_ai_generated === true ||
      Boolean(o.ai_generated_detected_info?.gen_ai_transparency_type))
  );
}

// ---------------------------------------------------------------------------------------------
// URLs

const TRACKING_PARAM = /^(?:__cft__\[\d*\]|__xts__\[\d*\]|__tn__|mibextid|fbclid)$/;
const SHIM_HOST = /^(?:(?:l|lm|www|m)\.)?facebook\.com$/i;

function httpUrl(url, base) {
  if (url == null || url === "") return null;
  try {
    const u = base ? new URL(String(url), base) : new URL(String(url));
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

/** Absolute http(s) URL (relative ones resolve against facebook.com) without tracking parameters. */
export function cleanPermalink(url) {
  const u = httpUrl(url, FB_ORIGIN);
  if (!u) return null;
  const tracking = [...u.searchParams.keys()].filter((key) => TRACKING_PARAM.test(key));
  for (const key of tracking) u.searchParams.delete(key);
  return u.href;
}

/** l.facebook.com/l.php?u=<target> -> target (http/https only); other http(s) URLs come back as is. */
export function unwrapLinkShim(url) {
  const u = httpUrl(url, FB_ORIGIN);
  if (!u) return null;
  if (!SHIM_HOST.test(u.hostname) || u.pathname !== "/l.php") return u.href;
  return httpUrl(u.searchParams.get("u"))?.href ?? null;
}

const mediaUrl = (url) => httpUrl(url, FB_ORIGIN)?.href ?? null;

// ---------------------------------------------------------------------------------------------
// Story

/**
 * Normalizes a Story node. opts.sources: feeds it came from; opts.dedupKey: edge.deduplication_key,
 * used as the key when the node has neither post_id nor id. Returns null for anything without identity.
 */
export function extractStory(node, opts) {
  return storyFrom(node, opts ?? {}, 0);
}

function storyFrom(node, opts, depth) {
  // Shared-story copies carry no __typename; a typed node must be a Story.
  if (!isObj(node) || (node.__typename != null && node.__typename !== "Story")) return null;
  const v = viewsOf(node);
  const postId = idString(pick(node.post_id, v.content.post_id, v.ufi.post_id) ?? findKey(node, "post_id"));
  const nodeId = str(node.id) ?? str(v.content.id);
  const key = postId ?? nodeId ?? str(opts.dedupKey);
  if (!key) {
    health.count("extract.no-key");
    return null;
  }
  const actors = extractActors(v);
  const { text, ranges } = extractMessage(v);
  const target = extractTarget(v, actors);
  return {
    key,
    postId,
    nodeId,
    time: extractTime(v),
    url: extractUrl(v),
    actors,
    avatar: extractAvatar(v, actors[0]),
    target,
    title: pick(...v.sections.map((s) => textOf(s.title?.story?.title))),
    text,
    ranges,
    attachments: collectAttachments([...objects(v.content.attachments), ...objects(node.attachments), ...objects(v.layout.attachments)]),
    shared: depth < SHARED_DEPTH ? storyFrom(sharedNode(v), {}, depth + 1) : null,
    feedback: extractFeedback(v),
    groupId: extractGroupId(v, target),
    tracking: str(node.encrypted_tracking) ?? str(v.ufi.encrypted_tracking) ?? str(v.content.encrypted_tracking),
    sources: Array.isArray(opts.sources) ? opts.sources.filter((s) => typeof s === "string") : [],
    audience: extractAudience(v),
    ai: v.metadata.length ? v.metadata.some(isAiLabel) : Boolean(findInStory(node, isAiLabel)),
  };
}

/** The projections of one story that the field readers look into. */
function viewsOf(node) {
  const cs = obj(node.comet_sections);
  const content = obj(cs.content?.story);
  const ctx = obj(cs.context_layout?.story);
  const layout = obj(cs.attached_story_layout?.story);
  const ufi = obj(get(cs, "feedback", "story", "story_ufi_container", "story"));
  const ftwc = isObj(ufi.feedback_context?.feedback_target_with_context?.comet_ufi_summary_and_actions_renderer)
    ? ufi.feedback_context.feedback_target_with_context
    : obj(findInStory(node, (o) => isObj(o.comet_ufi_summary_and_actions_renderer)));
  // Section holders: context layout (header), inverted layout (shared posts), the story itself, content.
  const sections = [ctx, layout, node, content].map((s) => obj(s.comet_sections));
  return {
    node,
    cs,
    content,
    ctx,
    layout,
    ufi,
    ftwc,
    summary: obj(ftwc.comet_ufi_summary_and_actions_renderer?.feedback),
    sections,
    metadata: sections.flatMap((s) => objects(s.metadata)),
    actorPhotos: sections.map((s) => obj(s.actor_photo?.story)),
  };
}

/** First value of `key` (string or number) anywhere in the story, bounded. */
function findKey(node, key) {
  const found = findInStory(node, (o) => typeof o[key] === "string" || typeof o[key] === "number");
  return found ? found[key] : null;
}

/** The timestamp section and the header's *TimestampStrategy entries (creation_time + permalink). */
function timestamps(v) {
  return [v.cs.timestamp?.story, ...v.metadata.filter((m) => /TimestampStrategy$/.test(m.__typename ?? "")).map((m) => m.story)].map(obj);
}

function extractTime(v) {
  const canonical = [v.node.creation_time, ...timestamps(v).map((s) => s.creation_time), v.content.creation_time];
  return pick(...canonical.map(num)) ?? num(findKey(v.node, "creation_time"));
}

function extractUrl(v) {
  const { node, ufi } = v;
  const candidates = [...timestamps(v).map((s) => s.url), node.permalink_url, ufi.permalink_url, v.ftwc.url, node.wwwURL, v.content.wwwURL, node.url, ufi.url];
  return cleanPermalink(pick(...candidates.map(str)) ?? str(findKey(v.node, "permalink_url")));
}

// ----- actors, avatar, target

function extractActors(v) {
  const lists = [
    v.node.actors,
    v.content.actors,
    ...v.sections.map((s) => s.title?.story?.actors),
    ...v.actorPhotos.map((s) => s.actors),
    v.ctx.actors,
    v.ufi.actors,
  ].map(objects);
  const all = lists.flat();
  let primary = lists.find((list) => list.some((a) => str(a.name) || idString(a.id)));
  if (!primary) {
    const owner = pick(v.node.feedback?.owning_profile, v.ftwc.owning_profile);
    const found = owner ?? findInStory(v.node, (o, key) => key === "actors" && Boolean(str(o.name)));
    primary = found ? [found] : [];
  }
  return primary.map((a) => normActor(a, all)).filter((a) => a.id || a.name);
}

function normActor(actor, all) {
  const id = idString(actor.id);
  const same = [actor, ...(id ? all.filter((a) => idString(a.id) === id) : [])];
  const field = (read) => pick(...same.map(read));
  return {
    id,
    name: field((a) => str(a.name)),
    url: cleanPermalink(field((a) => str(a.url) ?? str(a.profile_url))),
    type: field((a) => str(a.__typename)),
  };
}

/** Largest profile picture of the first actor (actor-photo strategy, content actors, story actors). */
function extractAvatar(v, actor) {
  const owners = [...v.actorPhotos.map((s) => s.actors), v.content.actors, v.node.actors].flatMap(objects);
  const pictures = owners
    .filter((a) => !actor?.id || !idString(a.id) || idString(a.id) === actor.id)
    .map((a) => a.profile_picture)
    .filter((p) => isObj(p) && mediaUrl(p.uri));
  let best = null;
  for (const p of pictures) if (!best || pictureSize(p) > pictureSize(best)) best = p;
  return best ? mediaUrl(best.uri) : null;
}

/** Rendered width in pixels: width × scale, or the s40x40-style size hint in a CDN URL. */
function pictureSize(p) {
  const hint = /[/_=,-][sp](\d{2,4})x\d{2,4}(?!\d)/i.exec(String(p.uri))?.[1];
  const width = num(p.width) ?? (hint ? Number(hint) : 0);
  return width * (num(p.scale) ?? 1);
}

function extractTarget(v, actors) {
  const candidates = [
    v.node.to,
    v.content.to,
    ...v.sections.map((s) => s.title?.story?.to),
    ...v.actorPhotos.map((s) => s.to),
    ...v.metadata.map((m) => m.story?.to),
  ].filter((t) => isObj(t) && idString(t.id));
  if (candidates.length) {
    const id = idString(candidates[0].id);
    const same = candidates.filter((t) => idString(t.id) === id);
    const type = pick(...same.map((t) => str(t.__typename)));
    if (actors.length === 1 && actors[0].id === id) return null;
    return {
      type,
      id,
      name: pick(...same.map((t) => str(t.name))),
      url: cleanPermalink(pick(...same.map((t) => str(t.url)))) ?? (type === "Group" ? groupUrl(id) : null),
    };
  }
  const groupId = targetGroupId(v);
  return groupId ? { type: "Group", id: groupId, name: null, url: groupUrl(groupId) } : null;
}

const groupUrl = (id) => `${FB_ORIGIN}groups/${encodeURIComponent(id)}/`;

function targetGroupId(v) {
  const canonical = idString(pick(v.node.target_group?.id, v.content.target_group?.id, v.ufi.target_group?.id));
  if (canonical) return canonical;
  const isGroupRef = (o, key) => (key === "target_group" || (key === "to" && o.__typename === "Group")) && Boolean(idString(o.id));
  return idString(findInStory(v.node, isGroupRef)?.id);
}

function extractGroupId(v, target) {
  if (target?.type === "Group") return target.id;
  return targetGroupId(v) ?? idString(pick(v.node.feedback?.associated_group?.id, v.ftwc.associated_group?.id));
}

function extractAudience(v) {
  const strategy = v.metadata.find((m) => m.__typename === "CometFeedStoryAudienceStrategy");
  const scope = strategy?.story?.privacy_scope ?? findInStory(v.node, (o, key) => key === "privacy_scope");
  return textOf(scope?.description);
}

// ----- message

function extractMessage(v) {
  const candidates = [v.content, v.node, v.layout, v.ufi].flatMap((s) => [
    s.message,
    get(s, "comet_sections", "message", "story", "message"),
    get(s, "comet_sections", "message_container", "story", "message"),
    richMessage(get(s, "comet_sections", "message", "rich_message")),
  ]);
  const messages = candidates.filter((m) => isObj(m) && str(m.text));
  if (!messages.length) {
    const found = findInStory(v.node, (o, key) => key === "message" && Boolean(str(o.text)));
    if (found) messages.push(found);
  }
  const text = messages[0]?.text ?? null;
  const withRanges = messages.find((m) => m.text === text && objects(m.ranges).length);
  return { text, ranges: withRanges ? normRanges(withRanges.ranges, text) : [] };
}

/** Rich-text posts (CometFeedStoryRichMessageRenderingStrategy) come as blocks; one line each. */
function richMessage(blocks) {
  const lines = objects(blocks).map((b) => b.text).filter((t) => typeof t === "string");
  return lines.length ? { text: lines.join("\n") } : null;
}

const RANGE_KINDS = { User: "user", Page: "page", Hashtag: "hashtag", ExternalUrl: "link" };

/** Facebook entity ranges -> [{offset, length, url, kind}] that fit inside `text`, each with a usable link. */
function normRanges(ranges, text) {
  const out = [];
  for (const r of objects(ranges)) {
    const offset = int(r.offset);
    const length = int(r.length);
    if (offset == null || !length || offset + length > text.length) continue;
    const entity = obj(r.entity);
    const kind = RANGE_KINDS[entity.__typename] ?? (isObj(entity.web_link) || str(entity.external_url) ? "link" : "other");
    const raw =
      kind === "link"
        ? unwrapLinkShim(pick(str(entity.web_link?.url), str(entity.external_url), str(entity.url)))
        : pick(str(entity.url), str(entity.profile_url));
    const url = cleanPermalink(raw);
    if (url) out.push({ offset, length, url, kind });
  }
  return out;
}

// ----- shared story

/** A share carries its post in several partial copies; they are merged into one node. */
function sharedNode(v) {
  const holders = [v.node, v.content, v.layout];
  const parts = [
    ...holders.map((h) => h.attached_story),
    ...holders.map((h) => get(h, "comet_sections", "attached_story", "story", "attached_story")),
  ].filter(isObj);
  const id = pick(...parts.map((p) => str(p.id)));
  const same = parts.filter((p) => !str(p.id) || p.id === id);
  return same.length ? fillMerge(same) : null;
}

/** Merge without mutation: earlier objects win; null/missing values and empty lists are filled from later ones. */
function fillMerge(parts) {
  const out = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      const current = out[key];
      if (current == null || (Array.isArray(current) && !current.length && Array.isArray(value))) out[key] = value;
      else if (isObj(current) && isObj(value)) out[key] = fillMerge([current, value]);
    }
  }
  return out;
}

// ----- feedback

function extractFeedback(v) {
  const { summary, ftwc } = v;
  const renderers = objects(summary.adaptive_ufi_action_renderers);
  const rendered = (typename) => obj(renderers.find((r) => r.__typename === typename)?.feedback);
  const react = rendered("UFIStoryReactActionRenderer");
  const comment = rendered("UFICommentActionRenderer");
  const share = rendered("XFBUFIAdaptiveShareActionRenderer");
  const count = (c) => int(c) ?? int(c?.count);
  const commentTotal = (f) => int(get(f, "comment_rendering_instance", "comments", "total_count"));
  const topReactions = objects(summary.top_reactions?.edges)
    .map((e) => ({ id: idString(e.node?.id), count: int(e.reaction_count) ?? 0 }))
    .filter((r) => r.id);
  const isFeedback = (o) => o.__typename === "Feedback" && Boolean(str(o.id));
  const topTotal = topReactions.length ? topReactions.reduce((n, r) => n + r.count, 0) : null;
  return {
    id: str(v.node.feedback?.id) ?? str(ftwc.id) ?? str(summary.id) ?? str(v.content.feedback?.id) ?? str(findInStory(v.node, isFeedback)?.id),
    reactions: pick(count(summary.reaction_count), count(react.reaction_count), topTotal, int(summary.i18n_reaction_count)),
    comments: pick(commentTotal(ftwc), commentTotal(summary.comments_count_summary_renderer?.feedback), commentTotal(comment)),
    shares: pick(count(summary.share_count), count(share.share_count), int(summary.i18n_share_count)),
    viewerReaction: idString(pick(summary.viewer_feedback_reaction_info, react.viewer_feedback_reaction_info)?.id),
    canComment: ftwc.can_viewer_comment !== false && ftwc.have_comments_been_disabled !== true,
    topReactions,
  };
}

// ---------------------------------------------------------------------------------------------
// Attachments

function collectAttachments(raws) {
  const out = [];
  const seen = new Map();
  for (const raw of raws) {
    const attachment = normalizeAttachment(raw);
    if (!attachment) continue;
    const ids = attachmentIds(raw, attachment);
    const dup = ids.map((id) => seen.get(id)).find((i) => i !== undefined);
    const index = dup ?? out.length;
    if (dup === undefined) out.push(attachment);
    else if (out[dup].kind === "other" && attachment.kind !== "other") out[dup] = attachment;
    for (const id of ids) seen.set(id, index);
  }
  return out;
}

/** Identities of one raw attachment: any shared identity marks a duplicate copy. */
function attachmentIds(raw, a) {
  const sa = obj(raw.styles?.attachment);
  const mediaId = idString(pick(sa.media?.id, raw.media?.id));
  const targetId = idString(pick(sa.target?.id, raw.target?.id));
  const primary = a.url ?? a.href ?? a.items?.[0]?.uri ?? a.hd ?? a.sd;
  return [
    str(raw.deduplication_key) && `d:${raw.deduplication_key}`,
    mediaId && `m:${mediaId}`,
    targetId && `t:${targetId}`,
    primary && `u:${primary}`,
    a.kind === "unavailable" && "unavailable",
  ].filter(Boolean);
}

function normalizeAttachment(att) {
  const styles = obj(att.styles);
  const style = str(styles.__typename) ?? "";
  const sa = isObj(styles.attachment) ? styles.attachment : att;
  const media = obj(pick(sa.media, att.media));
  const target = obj(pick(sa.target, att.target));
  const footer = isObj(att.comet_footer_renderer) && !isDecoy(att.comet_footer_renderer) ? obj(att.comet_footer_renderer.attachment) : EMPTY;
  const link = () => linkAttachment(sa, att, media, target, footer);
  if (/Unavailable/.test(style)) return { kind: "unavailable" };
  if (target.__typename === "Event" || isObj(sa.event)) return eventAttachment(sa, target);
  const album = albumAttachment(sa, style);
  if (album) return album;
  if (/Share|Link/.test(style)) return link();
  const reel = objects(sa.style_infos).flatMap((s) => objects(s.fb_shorts_story?.attachments)).find((a) => isObj(a.media));
  if (reel) return videoAttachment(reel.media, sa, att);
  if (media.__typename === "Video" || /Video|AnimatedImage/.test(style)) return videoAttachment(media, sa, att);
  if (media.__typename === "Photo" || /Photo/.test(style)) {
    const item = photoItem(media, pick(str(sa.url), str(att.url)));
    if (item) return { kind: "photo", items: [item], total: 1 };
  }
  if (hasLinkSignal(sa, att, target, footer)) return link();
  const href = cleanPermalink(pick(str(sa.url), str(att.url), str(target.url), str(media.url)));
  return href ? { kind: "other", href } : null;
}

/** The feed-size image of a photo (photo_image / image before the large viewer_image); href: its page. */
function photoItem(media, href) {
  const image = [media.photo_image, media.image, media.viewer_image].find((i) => isObj(i) && mediaUrl(i.uri));
  if (!image) return null;
  return {
    uri: mediaUrl(image.uri),
    width: int(image.width),
    height: int(image.height),
    href: cleanPermalink(pick(str(media.url), href)),
    alt: str(media.accessibility_caption),
  };
}

function albumAttachment(sa, style) {
  const subs = obj(sa.all_subattachments);
  const items = objects(subs.nodes)
    .map((n) => photoItem(obj(n.media), str(n.url)))
    .filter(Boolean);
  if (!items.length || (!/Album/.test(style) && items.length < 2)) return null;
  return { kind: "photo", items: items.slice(0, ALBUM_ITEMS), total: Math.max(int(subs.count) ?? 0, items.length) };
}

function videoAttachment(media, sa, att) {
  const delivery = obj(get(media, "videoDeliveryResponseFragment", "videoDeliveryResponseResult"));
  const progressive = objects(delivery.progressive_urls).filter((p) => p.failure_reason == null && mediaUrl(p.progressive_url));
  const quality = (q) => progressive.find((p) => p.metadata?.quality === q)?.progressive_url;
  const legacy = obj(media.videoDeliveryLegacyFields);
  // 2026 delivery first, then the legacy fields (on the video itself or under videoDeliveryLegacyFields).
  const legacyUrl = (...keys) => pick(...keys.flatMap((k) => [str(media[k]), str(legacy[k])]));
  const sd = pick(quality("SD"), legacyUrl("playable_url", "browser_native_sd_url"), progressive[0]?.progressive_url);
  const hd = pick(quality("HD"), legacyUrl("playable_url_quality_hd", "browser_native_hd_url"));
  const poster = pick(str(media.preferred_thumbnail?.image?.uri), str(media.first_frame_thumbnail), str(media.thumbnailImage?.uri), str(media.image?.uri));
  return {
    kind: "video",
    poster: mediaUrl(poster),
    sd: mediaUrl(sd),
    hd: mediaUrl(hd),
    width: pick(int(media.width), int(media.original_width)),
    height: pick(int(media.height), int(media.original_height)),
    href: cleanPermalink(pick(str(media.permalink_url), str(sa.url), str(att.url))),
    duration: num(media.length_in_second),
    live: media.is_live_streaming === true,
  };
}

const webLink = (o) => str(get(o, "story_attachment_link_renderer", "attachment", "web_link", "url"));

/** A title, a web link or an external target: what a link share has and a bare media stub lacks. */
function hasLinkSignal(sa, att, target, footer) {
  return Boolean(
    textOf(pick(sa.title_with_entities, att.title_with_entities, footer.title_with_entities)) ||
      webLink(sa) ||
      webLink(att) ||
      webLink(footer) ||
      str(target.external_url) ||
      target.__typename === "ExternalUrl",
  );
}

function linkTarget(sa, att, target, footer) {
  const raw = pick(
    webLink(sa),
    webLink(att),
    webLink(footer),
    str(sa.url),
    str(att.url),
    str(target.external_url),
    str(footer.target?.external_url),
  );
  return cleanPermalink(unwrapLinkShim(raw));
}

function linkAttachment(sa, att, media, target, footer) {
  const url = linkTarget(sa, att, target, footer);
  const image = [media.large_share_image, media.image, media.imageLargeAspect, media.imageFlexible].find((i) => isObj(i) && mediaUrl(i.uri));
  return {
    kind: "link",
    url,
    title: textOf(pick(sa.title_with_entities, att.title_with_entities, footer.title_with_entities)),
    description: textOf(pick(sa.description, att.description, footer.description)),
    source: textOf(pick(sa.source, att.source, footer.source)) ?? (url ? new URL(url).hostname : null),
    image: image ? mediaUrl(image.uri) : null,
  };
}

function eventAttachment(sa, target) {
  const event = isObj(sa.event) ? sa.event : target;
  return {
    kind: "event",
    url: cleanPermalink(pick(str(event.url), str(target.url), str(sa.url))),
    title: textOf(sa.title_with_entities) ?? str(event.name),
    when: pick(str(event.capitalized_day_time_sentence), str(event.day_time_sentence), textOf(sa.description)),
  };
}

// ---------------------------------------------------------------------------------------------
// Comments

const COMMENT_AVATARS = ["profile_picture_depth_0", "profile_picture", "profile_picture_depth_0_increased", "profile_picture_depth_1"];

/** Comment node (CommentsListComponentsPaginationQuery, interesting_top_level_comments) -> Comment. */
export function extractComment(node) {
  if (!isObj(node)) return null;
  const id = idString(node.id) ?? idString(node.legacy_fbid);
  if (!id) return null;
  const author = obj(node.author);
  const body = [node.body, node.body_renderer, node.preferred_body].find((b) => isObj(b) && str(b.text)) ?? EMPTY;
  const text = str(body.text);
  const feedback = obj(node.feedback);
  return {
    id,
    author: {
      id: idString(author.id),
      name: str(author.name),
      url: cleanPermalink(pick(str(author.url), str(author.profile_url))),
      avatar: mediaUrl(pick(...COMMENT_AVATARS.map((k) => str(author[k]?.uri)))),
    },
    text,
    ranges: text ? normRanges(body.ranges, text) : [],
    time: num(node.created_time) ?? num(findInStory(node, (o) => o.id === node.id && num(o.created_time) != null)?.created_time),
    reactions: commentReactions(node, feedback),
    replies: pick(int(feedback.replies_fields?.total_count), int(feedback.replies_fields?.count), int(node.replies_fields?.total_count)) ?? 0,
  };
}

function commentReactions(node, feedback) {
  const linked = objects(node.comment_action_links).map((l) => obj(l.comment?.feedback));
  const counts = [feedback, ...linked].flatMap((f) => [f.reactors?.count, f.unified_reactors?.count, f.reaction_count?.count, f.reaction_count].map(int));
  const top = objects(feedback.top_reactions?.edges).map((e) => int(e.reaction_count) ?? 0);
  return pick(...counts, top.length ? top.reduce((a, b) => a + b, 0) : null, int(feedback.reactors?.count_reduced)) ?? 0;
}
