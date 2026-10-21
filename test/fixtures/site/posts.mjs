// Native feed units: the 2026 `[aria-posinset]` post skeleton (dom-feed.md §3.1/§3.2) for organic stories,
// sponsored posts (obfuscated "Ad" label, query-only ?__cft__ info link), Follow/Join/Add-friend suggestions,
// People You May Know and Reels panels, plus a loading skeleton. Junk carries no fixture-only markers: tests
// map `aria-posinset` numbers to kinds through `describeUnits()`.

import { createHash } from "node:crypto";
import { el, raw } from "./html.mjs";
import { C } from "./styles.mjs";
import { avatarSvg, svgIcon } from "./chrome.mjs";
import { imageUrl } from "./images.mjs";

const hex = (s, n) => createHash("sha1").update(String(s)).digest("hex").slice(0, n);
const cft = (seed, len = 238) => `AZ${createHash("sha512").update(String(seed)).digest("base64url").repeat(5)}`.slice(0, len);
const withTn = (url, seed, tn, len) => `${url}${url.includes("?") ? "&" : "?"}__cft__[0]=${cft(seed, len)}&__tn__=${tn}`;
const TN = { avatar: "%3C%3C%2CP-R", name: "-UC%2CP-R", time: "%2CO%2CP-R", photo: "EH-y-R", link: "%2CmH-y-R", sharedName: "-UC%2CP-y-R", sharedTime: "%2CO%2CP-y-R" };

const uri = (who, px) => imageUrl(who.type === "User" ? "avatar" : "logo", who.id, px);

/** Relative time as Facebook shows it in the byline ("7m", "3h", "2d"). */
function shortAge(now, time) {
  const m = Math.max(1, Math.round((now - time) / 60));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
}

/**
 * The obfuscated byline label (dom-feed §4.1.5): span[aria-labelledby] -> svg > use -> use -> text, with the
 * labelledby target in a hidden node the fake runtime removes after load.
 */
function obfuscatedLabel(ctx, text) {
  const labelId = ctx.uid();
  const useA = ctx.uid();
  const useB = ctx.uid();
  const textId = ctx.uid();
  const width = Math.ceil(text.length * 7.2) + 2;
  return el(
    "span",
    raw("⁠"),
    el("span", { "aria-labelledby": labelId }, el("svg", { width, height: 16, style: "vertical-align:text-bottom;overflow:visible" }, el("use", { href: `#${useA}` }))),
    el("span", { id: labelId, style: "display:none" }, text),
    el("svg", { width: 0, height: 0, style: "position:absolute", "aria-hidden": "true" }, el("defs", el("use", { id: useA, href: `#${useB}` }), el("use", { id: useB, href: `#${textId}` }), el("text", { id: textId, x: 0, y: 12, "font-size": 13, fill: "currentColor" }, text))),
  );
}

function honeypots(ctx, seed) {
  return [0, 1, 2].map((i) => el("div", { "aria-hidden": "true", "data-0": "0", "data-1": "1", "data-2": "2", class: C.honeypot }, el("blockquote", el("span", { dir: "auto" }, el("span", i ? hex(`${seed}${i}`, 6) : "Facebook")))));
}

function audience(ctx, story) {
  const title = story.privacy === "group" ? ctx.s.sharedWithGroup : story.privacy === "friends" ? ctx.s.sharedWithFriends : ctx.s.sharedWithPublic;
  return svgIcon("globe", { size: 12, title });
}

/** Header: avatar link, h4 profile_name (with optional Follow/Join/Add-friend button), byline, menu, hide. */
function header(ctx, story, { button = null, label = null, infoLink = null, h = "h4", shared = false } = {}) {
  const { s, world } = ctx;
  const actor = story.actor;
  const group = story.to;
  const avatarHref = group && !shared ? group.url : actor.url;
  const avatar = group && !shared
    ? el("div", { style: "position:relative" }, el("a", { "aria-label": group.name, role: "link", tabindex: 0, href: withTn(avatarHref, `${story.postId}a`, TN.avatar) }, avatarSvg(ctx, { uri: imageUrl("logo", group.id, 40 * ctx.scale), label: group.name, size: 40, square: true })), el("a", { "aria-hidden": "true", tabindex: "-1", href: `${group.url}user/${actor.id}/`, style: "position:absolute;right:-4px;bottom:-4px" }, avatarSvg(ctx, { uri: uri(actor, 24 * ctx.scale), size: 24, hidden: true })))
    : shared && actor.type === "Page"
      ? el("a", { "aria-label": ctx.s.viewStory(actor.name), role: "link", tabindex: 0, href: `/stories/${actor.id}/?source=from_feed` }, avatarSvg(ctx, { uri: uri(actor, 36 * ctx.scale), label: actor.name, size: 36 }))
      : el("a", { "aria-label": actor.name, role: "link", tabindex: 0, href: withTn(actor.url, `${story.postId}a`, shared ? "%3C%3C%2CP-y-R" : TN.avatar) }, avatarSvg(ctx, { uri: uri(actor, 40 * ctx.scale), label: actor.name, size: 40 }));
  const nameLink = group && !shared
    ? el("a", { role: "link", tabindex: 0, href: withTn(group.url, `${story.postId}g`, TN.name), class: C.postNameLink }, el("span", group.name))
    : el("a", { role: "link", tabindex: 0, href: withTn(actor.url, `${story.postId}n`, shared ? TN.sharedName : TN.name), class: C.postNameLink }, el("b", el("span", actor.name)));
  const suggestion = button
    ? el("span", el("span", el("span", raw("&nbsp;")), el("span", { "aria-hidden": "true" }, " · ")), el("div", { role: "button", tabindex: 0, "aria-label": button.label, class: C.followButton }, el("span", button.text)))
    : null;
  const timeLink = infoLink || el("a", { href: `?__cft__[0]=${cft(`${story.postId}t`)}&__tn__=${shared ? TN.sharedTime : TN.time}#?efh`, role: "link", tabindex: 0, target: "_blank", class: C.bylineLink }, obfuscatedLabel(ctx, label || shortAge(world.now, story.time)));
  const poster = group && !shared ? [el("a", { href: withTn(`${group.url}user/${actor.id}/`, `${story.postId}p`, TN.name), role: "link", tabindex: 0, class: C.bylineLink }, el("span", actor.name)), el("span", { "aria-hidden": "true" }, " · ")] : null;
  return el(
    "div",
    { class: C.postHeader },
    avatar,
    el(
      "div",
      { class: C.postHeaderText },
      el("div", { "data-ad-rendering-role": "profile_name" }, el(h, { class: C.postName, dir: "auto" }, el("span", el("span", el("span", el("span", nameLink, suggestion)))))),
      el("div", { class: C.byline }, poster, el("span", { dir: "ltr" }, el("span", timeLink)), el("span", { "aria-hidden": "true" }, " · "), audience(ctx, story)),
    ),
    shared ? null : el("div", { role: "button", tabindex: 0, "aria-haspopup": "menu", "aria-expanded": "false", "aria-label": s.actionsFor(actor.name), class: C.postMenu }, svgIcon("dots")),
    shared ? null : el("a", { "aria-label": s.hidePost(actor.name), href: "#", role: "link", tabindex: 0, class: C.postMenu }, svgIcon("close", { size: 16 })),
  );
}

function message(text) {
  const paragraphs = text.split(/\n+/);
  return el("div", { dir: "auto" }, el("div", { "data-ad-rendering-role": "story_message" }, el("div", { "data-ad-comet-preview": "message", "data-ad-preview": "message", class: C.postMessage }, el("div", paragraphs.map((p) => el("div", { dir: "auto", style: "text-align: start;", class: C.paragraph }, p))))));
}

function photo(ctx, story, id, w, h, tn = TN.photo, extra = null) {
  return el(
    "a",
    { href: withTn(`https://www.facebook.com/photo/?fbid=${id}&set=${story.to ? `gm.${story.postId}&idorvanity=${story.to.id}` : `a.${id.slice(0, 9)}`}`, `${id}ph`, tn), role: "link", tabindex: 0 },
    el("div", { class: C.photoBox, style: `padding-top:${((h / w) * 100).toFixed(2)}%` }, el("img", { "data-imgperflogname": "feedImage", src: imageUrl("photo", id, w * Math.min(ctx.scale, 2), h * Math.min(ctx.scale, 2)), width: w, height: h, alt: ctx.s.mayBeImage("mountain, lake and sky"), class: C.photoImg, referrerpolicy: "origin-when-cross-origin" }), extra),
  );
}

function linkCard(ctx, story, { cta = null, hidden = false } = {}) {
  const target = `https://example.org/${story.actor.vanity || "news"}/${story.postId.slice(-6)}`;
  const title = story.text.split(/[.!?]/)[0].slice(0, 80);
  const card = el(
    "a",
    { href: `https://l.facebook.com/l.php?u=${encodeURIComponent(target)}&h=AT${hex(target, 30)}`, rel: "nofollow noreferrer", target: "_blank", role: "link", tabindex: 0, class: C.linkCard },
    hidden ? null : el("div", { class: C.photoBox, style: "padding-top:52.2%", "data-ad-rendering-role": "image" }, el("img", { src: imageUrl("share", story.postId, 500, 261), alt: "", width: 500, height: 261, class: C.photoImg })),
    el("div", { class: C.linkText }, el("div", { "data-ad-rendering-role": "meta", class: C.linkMeta }, hidden ? `${hex(story.postId, 9)}.com` : "example.org"), el("span", { "data-ad-rendering-role": "title", class: C.linkTitle }, hidden ? hex(`${story.postId}t`, 12) : title), el("span", { "data-ad-rendering-role": "description", class: C.linkDesc }, hidden ? hex(`${story.postId}d`, 20) : "Read the full story on example.org.")),
  );
  const ctaRow = cta ? el("div", { class: C.ctaRow }, el("span", { class: C.linkMeta }, `${story.actor.vanity}.example`), el("div", { "data-ad-rendering-role": "cta-" }, el("object", { type: "nomatch" }, el("a", { href: `https://l.facebook.com/l.php?u=${encodeURIComponent(target)}`, role: "link", class: C.ctaButton }, cta)))) : null;
  return hidden ? el("div", { class: C.hiddenDecoy }, card, el("div", { "data-ad-rendering-role": "cta-" }, el("object", { type: "nomatch" }, el("a", { href: `?__cft__[0]=${cft(`${story.postId}l`)}&__tn__=${TN.link}#?gfk`, role: "link" }, ctx.s.learnMore)))) : el("div", card, ctaRow);
}

function attachment(ctx, story, cta) {
  if (story.kind === "photo") return photo(ctx, story, `${story.postId}1`, 520, 390);
  if (story.kind === "album") {
    const tiles = [2, 3, 4, 5].map((n, i) => photo(ctx, story, `${story.postId}${n}`, 260, 260, `*b${i}H-R`, i === 3 ? el("div", { class: C.albumMore }, "+3") : null));
    return el("div", { class: C.albumGrid }, tiles);
  }
  if (story.kind === "link") return linkCard(ctx, story, { cta });
  if (story.kind === "video") {
    return el("div", { role: "group", "aria-label": ctx.s.videoPlayer, class: C.videoBox }, el("img", { src: imageUrl("poster", `${story.postId}7`, 640, 360), alt: "", class: C.photoImg }), el("div", { role: "button", tabindex: 0, "aria-label": ctx.s.playVideo, style: "position:absolute;inset:0" }), el("div", { role: "slider", "aria-label": ctx.s.changePosition, "aria-valuemin": 0, "aria-valuemax": 94, "aria-valuenow": 0, tabindex: 0 }), el("span", { style: "position:absolute;left:8px;bottom:6px;color:#fff;font-size:12px" }, "0:00 / 1:34"));
  }
  return null;
}

function sharedPost(ctx, original) {
  const button = original.actor.type === "Page" ? { label: ctx.s.followName(original.actor.name), text: ctx.s.follow } : null;
  return el("div", { style: "margin:0 16px 12px;border:1px solid var(--divider);border-radius:8px;overflow:hidden" }, header(ctx, original, { h: "h5", shared: true, button }), message(original.text), attachment(ctx, original, null));
}

const reactionImg = (color) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><circle cx="9" cy="9" r="9" fill="${color}"/></svg>`)}`;

function footer(ctx, story, st) {
  const { s, world } = ctx;
  const liked = !!st.viewerReaction;
  return el(
    "div",
    { "data-visualcompletion": "ignore-dynamic" },
    st.reactions || st.comments.length
      ? el(
          "div",
          { class: C.counts },
          el("span", st.reactions ? [el("span", { role: "toolbar", "aria-label": s.seeWhoReacted }, el("div", { role: "button", tabindex: 0, "aria-label": s.likePeople(st.reactions), class: C.reactionIcon }, el("img", { height: 18, width: 18, role: "presentation", src: reactionImg("#0866ff") }))), el("span", { "aria-hidden": "true" }, String(st.reactions))] : null),
          el("span", st.comments.length ? el("div", { role: "button", tabindex: 0 }, s.commentsCount(st.comments.length)) : null, st.shares ? el("div", { role: "button", tabindex: 0 }, s.sharesCount(st.shares)) : null),
        )
      : null,
    el(
      "div",
      { class: C.actions },
      el("div", { "aria-label": s.like, role: "button", tabindex: 0, class: [C.actionButton, liked ? C.actionLiked : ""].join(" ").trim() }, el("i", { "data-visualcompletion": "css-img" }, svgIcon("like", { size: 18 })), el("div", { "data-ad-rendering-role": "like_button" }, el("span", s.like))),
      el("div", { "aria-label": s.react, role: "button", tabindex: 0, style: "display:none" }),
      el("div", { "aria-label": s.leaveComment, role: "button", tabindex: 0, class: C.actionButton }, svgIcon("comment", { size: 18 }), el("div", { "data-ad-rendering-role": "comment_button" }, el("span", s.comment))),
      el("div", { "aria-label": s.shareLabel, role: "button", tabindex: 0, class: C.actionButton }, svgIcon("share", { size: 18 }), el("div", { "data-ad-rendering-role": "share_button" }, el("span", s.share))),
    ),
    el("form", { role: "presentation", class: C.commentForm }, avatarSvg(ctx, { uri: uri(world.viewer, 32 * ctx.scale), size: 32, hidden: true }), el("div", { role: "textbox", contenteditable: "true", "data-lexical-editor": "true", "aria-label": s.writeComment, spellcheck: "true", tabindex: 0, class: C.commentBox }, el("p", el("br")))),
  );
}

/** The posinset wrapper chain: slot > div > span > div > div > [aria-posinset] > div > [data-virtualized] > card. */
function slot(posinset, card) {
  return el("div", el("div", el("span", el("div", el("div", el("div", { "aria-posinset": posinset }, el("div", el("div", { "data-virtualized": "false" }, card))))))));
}

function storyCard(ctx, story, opts = {}) {
  const st = ctx.world.feedback.get(story.postId) || { reactions: 12, viewerReaction: null, shares: 1, comments: [] };
  const original = story.shared ? ctx.world.story(story.shared) : null;
  return el(
    "div",
    { class: C.card },
    honeypots(ctx, story.postId),
    header(ctx, story, opts),
    message(story.text),
    original ? sharedPost(ctx, original) : attachment(ctx, story, opts.cta),
    story.decoys || opts.decoy ? linkCard(ctx, story, { hidden: true }) : null,
    footer(ctx, story, st),
  );
}

function panel(ctx, title, region, cells, { gridRole = "grid" } = {}) {
  return el(
    "div",
    { class: C.card },
    el("div", { class: C.postHeader }, el("h3", { class: [C.postHeaderText, C.postName].join(" ") }, title), el("div", { role: "button", tabindex: 0, "aria-haspopup": "menu", "aria-label": ctx.s.actionsFor(title), class: C.postMenu }, svgIcon("dots"))),
    el("div", region ? { role: "region", "aria-label": region } : {}, el("div", { role: gridRole, "aria-label": region ? null : title }, el("div", { role: "row", class: C.grid }, cells))),
  );
}

const JUNK_DOM = {
  sponsored(ctx, j) {
    const story = junkStory(ctx, j);
    const infoHref = j.variant === "category" ? "/ads/about/?entry_product=ad_preferences" : `?__cft__[0]=${cft(`${j.postId}ad`, 312)}`;
    const infoLink = el("a", { href: infoHref, role: "link", tabindex: 0, target: "_blank", class: C.bylineLink }, obfuscatedLabel(ctx, ctx.s.ad));
    return storyCard(ctx, story, { infoLink, cta: j.cta === "SHOP_NOW" ? ctx.s.shopNow : ctx.s.learnMore, decoy: true });
  },
  suggestion(ctx, j) {
    const story = junkStory(ctx, j);
    const button = j.variant === "join" ? { label: ctx.s.join, text: ctx.s.join } : j.variant === "unconnected" ? { label: ctx.s.addFriend, text: ctx.s.addFriend } : { label: ctx.s.followName(j.actor.name), text: ctx.s.follow };
    return storyCard(ctx, story, { button });
  },
  PaginatedPeopleYouMayKnowFeedUnit(ctx, j) {
    const cells = j.people.map((p) => el("div", { role: "cell", class: C.gridCell }, el("a", { href: p.url, role: "link", tabindex: 0 }, el("img", { src: uri(p, 280), alt: "", class: C.gridImg }), el("span", { class: C.gridLabel }, p.name)), el("div", { role: "button", tabindex: 0, class: C.secondaryButton }, ctx.s.addFriend)));
    return panel(ctx, ctx.s.peopleYouMayKnow, ctx.s.peopleYouMayKnow, cells);
  },
  ShowcaseFeedUnit(ctx, j) {
    const cells = j.creators.map((c, i) => el("div", { role: "gridcell", class: C.gridCell }, el("a", { "aria-label": ctx.s.reelBy(c.name), href: `/reel/9${i}${hex(c.id, 8).replace(/\D/g, "4")}/?s=fb_shorts_tab`, role: "link", tabindex: 0 }, el("img", { src: imageUrl("poster", `reel${c.id}`, 280, 500), alt: "", class: C.gridImg }), el("span", { class: C.gridLabel }, c.name)), el("div", { role: "button", tabindex: 0, "aria-label": ctx.s.reelMenu })));
    return panel(ctx, ctx.s.reels, null, cells);
  },
  GroupsYouShouldJoinFeedUnit(ctx, j) {
    const cells = j.groups.map((g) => el("div", { role: "cell", class: C.gridCell }, el("a", { href: g.url, role: "link", tabindex: 0 }, el("img", { src: imageUrl("logo", g.id, 280), alt: "", class: C.gridImg }), el("span", { class: C.gridLabel }, g.name)), el("div", { role: "button", tabindex: 0, class: C.secondaryButton }, ctx.s.join)));
    return el("div", { class: C.card }, el("span", { dir: "auto", class: C.panelTitle, style: "display:block" }, ctx.s.groupSuggestions), el("div", { role: "list" }, cells));
  },
};

function junkStory(ctx, j) {
  return { postId: j.postId, actor: j.actor, to: j.to || null, kind: j.type === "sponsored" ? "link" : "photo", text: j.text, time: ctx.world.now - 5 * 3600, privacy: "public", decoys: false, url: `${j.actor.url}/posts/${j.postId}` };
}

/** DOM for one feed item, or null for junk Facebook never renders as a unit (node-less edges, trays, QPs). */
function unitCard(ctx, item) {
  if (item.story) return storyCard(ctx, item.story);
  const render = JUNK_DOM[item.junk.type] || JUNK_DOM[item.junk.typename];
  return render ? render(ctx, item.junk) : null;
}

/**
 * Renders items as feed slots (the list's direct children) starting at aria-posinset `start`.
 * Returns { slots, units, next }; units maps each rendered posinset to { kind, junk, postId } for tests.
 */
export function renderUnits(ctx, items, start = 1) {
  const parts = [];
  const units = [];
  let pos = start;
  for (const item of items) {
    const card = unitCard(ctx, item);
    if (!card) continue;
    parts.push(slot(pos, card));
    units.push({ posinset: pos, kind: item.story ? "story" : item.junk.type === "unit" ? item.junk.typename : `${item.junk.type}:${item.junk.variant}`, junk: !item.story, postId: item.story?.postId ?? item.junk.postId ?? null });
    pos++;
  }
  return { slots: parts, units, next: pos };
}

/** The trailing "Loading..." skeleton slot Facebook shows while fetching more. */
export function skeletonSlot(ctx, posinset) {
  return slot(posinset, el("div", { class: C.card }, el("div", { role: "progressbar", "aria-label": ctx.s.loading, "aria-valuemin": 0, "aria-valuemax": 100, tabindex: "-1", class: C.skeleton })));
}
