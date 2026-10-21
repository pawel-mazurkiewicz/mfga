// Pure, DOM-free helpers of the stream UI: sentences, counts, layout maths. Unit-tested in node.
import { getLocale, t } from "../../shared/i18n.js";
import "./strings.js";

const numberLocale = () => (getLocale() === "pl" ? "pl-PL" : "en-US");

/** 1234 -> "1,234" (en) / "1234" (pl; Polish groups from 10 000). Non-numbers count as 0. */
export function formatCount(n) {
  const v = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  return v.toLocaleString(numberLocale());
}

/** Any non-empty viewer reaction (id, object) other than the "0" un-react id counts as a 2010 Like. */
export function isReacted(viewerReaction) {
  if (viewerReaction == null || viewerReaction === false || viewerReaction === "") return false;
  return String(viewerReaction) !== "0";
}

/** Story.feedback -> the UFI's starting state. */
export function feedbackState(feedback) {
  const fb = feedback || {};
  const liked = isReacted(fb.viewerReaction);
  const count = Number.isFinite(fb.reactions) ? Math.max(0, fb.reactions) : 0;
  return {
    liked,
    count: Math.max(count, liked ? 1 : 0),
    comments: Number.isFinite(fb.comments) ? Math.max(0, fb.comments) : 0,
    canComment: fb.canComment !== false,
  };
}

function withLink(template, linkText) {
  const [before, after = ""] = template.split("{link}");
  return [before && { text: before }, { text: linkText, link: true }, after && { text: after }].filter(Boolean);
}

/**
 * The 2010 like sentence as parts; the count phrase is a link part.
 *   (4, true)  -> "You and [3 others] like this."    (1, true) -> "You like this."
 *   (5, false) -> "[5 people] like this."            (0, false) -> []
 */
export function likeSentence(count, liked) {
  const n = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  if (liked) {
    const others = Math.max(0, n - 1);
    return others ? withLink(t("ufi.youAndOthers"), t("ufi.others", { n: others })) : [{ text: t("ufi.youLike") }];
  }
  return n ? withLink(t("ufi.peopleLike", { n }), t("ufi.people", { n })) : [];
}

/** Reasons of src/data/classify.js that are advertising; every other drop reason is a "suggestion". */
const AD_REASONS = new Set([
  "sponsored-data",
  "sponsored-label",
  "auction-distance",
  "category:SPONSORED",
  "category:PROMOTION",
  "category:HIGH_VALUE_PROMOTION",
  "unit:MarketplaceFeedAdStory",
  "unit:AdsSideFeedUnit",
]);
const NOT_HIDDEN = new Set(["keep", "no-node", "ai", "keyword"]);

/**
 * ctx.hiddenStats() -> {ads, suggested}. Accepts {ads, suggested}, a classifier reason map
 * ({"sponsored-data": 2, "recommended": 3, ...}) or {dropped: <reason map>}.
 */
export function hiddenCounts(stats) {
  if (!stats || typeof stats !== "object") return { ads: 0, suggested: 0 };
  const num = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
  if ("ads" in stats || "suggested" in stats) return { ads: num(stats.ads), suggested: num(stats.suggested) };
  const reasons = stats.dropped && typeof stats.dropped === "object" ? stats.dropped : stats;
  let ads = 0;
  let suggested = 0;
  for (const [reason, n] of Object.entries(reasons)) {
    if (AD_REASONS.has(reason)) ads += num(n);
    else if (!NOT_HIDDEN.has(reason)) suggested += num(n);
  }
  return { ads, suggested };
}

/** "3 ads and 5 suggested posts were hidden." or "" when nothing was hidden. */
export function hiddenSentence(stats) {
  const { ads, suggested } = hiddenCounts(stats);
  if (!ads && !suggested) return "";
  return t("feed.hidden", { ads: t("feed.hiddenAds", { n: ads }), suggested: t("feed.hiddenSuggested", { n: suggested }) });
}

/** 151 -> "2:31", 3723 -> "1:02:03"; null for missing/zero durations. */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const s = Math.round(seconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return hh ? `${hh}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
}

/** Scales (w, h) down to fit inside (maxW, maxH); unknown sizes get the box's width and a 4:3 shape. */
export function fitBox(w, h, maxW, maxH) {
  if (!(w > 0 && h > 0)) return { width: maxW, height: Math.round((maxW * 3) / 4) };
  const k = Math.min(1, maxW / w, maxH / h);
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** Photo attachment -> at most `max` thumbnails plus how many more the album holds ("+N"). */
export function photoGrid(att, max = 4) {
  const items = (att?.items || []).filter((it) => it && it.uri);
  const shown = items.slice(0, max);
  const total = Number.isFinite(att?.total) ? Math.max(att.total, items.length) : items.length;
  return { shown, more: Math.max(0, total - shown.length) };
}

/** Comments in chronological order (stable; comments without a time keep their place at the start). */
export function chronological(comments) {
  return [...(comments || [])].filter(Boolean).sort((a, b) => (a.time || 0) - (b.time || 0));
}

/** Adds `incoming` to `existing`, skipping ids already present. */
export function mergeComments(existing, incoming) {
  const seen = new Set(existing.map((c) => c.id).filter(Boolean));
  const out = [...existing];
  for (const c of incoming || []) {
    if (!c || (c.id && seen.has(c.id))) continue;
    if (c.id) seen.add(c.id);
    out.push(c);
  }
  return out;
}

/**
 * Cuts long text segments for 2010's "... See More". Text up to `max` characters is left alone; longer
 * text is cut at the last space before `keep` characters (never inside a link).
 */
export function truncateSegments(segments, { keep = 400, max = 520 } = {}) {
  const total = segments.reduce((n, s) => n + s.text.length, 0);
  if (total <= max) return { visible: segments, truncated: false };
  const visible = [];
  let used = 0;
  for (const seg of segments) {
    const room = keep - used;
    if (seg.text.length <= room) {
      visible.push(seg);
      used += seg.text.length;
      continue;
    }
    if (!seg.url && room > 0) {
      const cut = seg.text.slice(0, room);
      const space = cut.search(/\s\S*$/);
      const head = (space > 0 ? cut.slice(0, space) : cut).trimEnd();
      if (head) visible.push({ text: head });
    }
    break;
  }
  return { visible, truncated: true };
}

/**
 * Passive 2010 headline for stories without their own text ("added 3 new photos.", "shared a link.").
 * Returns a string or null.
 */
export function passiveHeadline(story) {
  if (!story || story.text || story.title) return null;
  if (story.shared) {
    const name = story.shared.actors?.[0]?.name;
    return name ? t("story.sharedPost", { name }) : t("story.sharedPostAnon");
  }
  const att = (story.attachments || [])[0];
  switch (att?.kind) {
    case "photo": {
      const { shown, more } = photoGrid(att);
      return t("story.addedPhoto", { n: Math.max(1, shown.length + more) });
    }
    case "video":
      return t("story.addedVideo");
    case "link":
      return t("story.sharedLink");
    case "event":
      return t("story.sharedEvent");
    default:
      return null;
  }
}

/** Names of the feed sources switched on in settings.feed.sources, in a stable order. */
export function enabledSources(feedSettings) {
  const src = feedSettings?.sources || {};
  return ["friends", "groups", "pages", "favorites"].filter((k) => src[k] !== false);
}

/** How many stories are newer than `lastSeen` (unix seconds); 0 when lastSeen is unknown. */
export function countNewer(stories, lastSeen) {
  if (!Number.isFinite(lastSeen) || lastSeen <= 0) return 0;
  return stories.filter((s) => Number.isFinite(s?.time) && s.time > lastSeen).length;
}

/** Tooltip date of a timestamp: "Wednesday, March 10, 2010 at 4:41pm" / "środa, 10 marca 2010 o 16:41". */
export function fullDate(unixSeconds) {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return "";
  const d = new Date(unixSeconds * 1000);
  const pl = getLocale() === "pl";
  const date = d.toLocaleDateString(numberLocale(), { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const mm = String(d.getMinutes()).padStart(2, "0");
  const time = pl ? `${d.getHours()}:${mm}` : `${d.getHours() % 12 || 12}:${mm}${d.getHours() < 12 ? "am" : "pm"}`;
  return t("time.date", { date, time });
}
