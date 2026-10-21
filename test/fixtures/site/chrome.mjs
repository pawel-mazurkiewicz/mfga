// Facebook 2026 chrome DOM for the fake site (dom-chrome.md §1-§5): banner with tab and account navigation,
// "Shortcuts" left rail, [role=complementary] right rail, composer region, stories tray, docked-chat root, and
// the left panels of the Feeds and Groups routes. Anchors are ARIA roles/labels, hrefs and data-* attributes;
// classes are opaque.

import { el } from "./html.mjs";
import { C } from "./styles.mjs";
import { imageUrl, CDN_HOST } from "./images.mjs";

export const STATIC_HOST = "static.xx.fbcdn.net";
export const SPRITE_URL = `https://${STATIC_HOST}/rsrc.php/v4/y5/r/fixture-bookmarks.svg`;
const SPRITE_ICONS = ["friends", "memories", "saved", "groups", "video", "marketplace", "feeds", "events"];
const SPRITE_COLORS = ["#1b74e4", "#2abba7", "#a033ff", "#1b74e4", "#e41e3f", "#1b74e4", "#f5533d", "#f02849"];

/** The bookmarks icon sprite (36px tiles) referenced by the left rail's css-img icons. */
export function bookmarksSprite() {
  const tiles = SPRITE_ICONS.map((name, i) => {
    const y = i * 36;
    return `<circle cx="18" cy="${y + 18}" r="16" fill="${SPRITE_COLORS[i]}"/><text x="18" y="${y + 23}" text-anchor="middle" font-family="Arial" font-size="14" font-weight="bold" fill="#fff">${name[0].toUpperCase()}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="${36 * SPRITE_ICONS.length}">${tiles.join("")}</svg>`;
}

const ICON_PATHS = {
  home: "M12 3 2 11h3v9h5v-6h4v6h5v-9h3z",
  friends: "M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM1 20c0-4 3-6 7-6s7 2 7 6zm15-6c3 0 6 2 6 5v1h-5c0-2-1-4-3-5.5z",
  video: "M3 5h13v14H3zm14 4 5-3v12l-5-3z",
  groups: "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 20c0-4 4-6 8-6s8 2 8 6z",
  marketplace: "M4 9 6 3h12l2 6v2a3 3 0 0 1-2 2v8H6v-8a3 3 0 0 1-2-2z",
  menu: "M4 4h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zM4 10h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zM4 16h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4z",
  messenger: "M12 2C6.5 2 2 6.1 2 11.2c0 2.9 1.4 5.4 3.7 7.1V22l3.4-1.9c.9.3 1.9.4 2.9.4 5.5 0 10-4.1 10-9.2S17.5 2 12 2zm1 12.4-2.6-2.7-5 2.7 5.5-5.8 2.6 2.7 4.9-2.7z",
  bell: "M12 22a2.5 2.5 0 0 0 2.5-2.5h-5A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5-6.7V3.5a2 2 0 0 0-4 0v.8A7 7 0 0 0 5 11v5l-2 2v1h18v-1z",
  search: "M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z",
  dots: "M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  compose: "M3 17.3V21h3.7L17.8 9.9l-3.7-3.7zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.7 3.7z",
  gift: "M20 7h-2.2A3 3 0 0 0 12 4a3 3 0 0 0-5.8 3H4v5h1v8h14v-8h1zM9 5a1 1 0 0 1 1 1v1H9a1 1 0 0 1 0-2zm6 0a1 1 0 0 1 0 2h-1V6a1 1 0 0 1 1-1z",
  close: "M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z",
  next: "m9 5 7 7-7 7-1.4-1.4 5.6-5.6-5.6-5.6z",
  like: "M2 21h4V9H2zm20-11c0-1.1-.9-2-2-2h-6.3l1-4.6v-.3c0-.4-.2-.8-.4-1.1L13.2 1 6.6 7.6C6.2 8 6 8.5 6 9v10c0 1.1.9 2 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7.1c.1-.2.2-.5.2-.7z",
  comment: "M12 2C6.5 2 2 5.9 2 10.8c0 2.8 1.5 5.3 3.9 6.9L5 22l4.4-2.4c.8.2 1.7.3 2.6.3 5.5 0 10-3.9 10-8.8S17.5 2 12 2z",
  share: "M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z",
  globe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.9a15.7 15.7 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8zM12 4c.8 1.2 1.5 2.5 1.9 4h-3.8c.4-1.5 1.1-2.8 1.9-4z",
};

export function svgIcon(name, { size = 20, title = null, label = null } = {}) {
  return el(
    "svg",
    { viewBox: "0 0 24 24", width: size, height: size, fill: "currentColor", role: label || title ? "img" : null, "aria-label": label, "aria-hidden": label || title ? null : "true" },
    title ? el("title", title) : null,
    el("path", { d: ICON_PATHS[name] }),
  );
}

/** Facebook's masked avatar: svg[role=img][aria-label] > mask(circle|rect) + g[mask] > image[xlink:href]. */
export function avatarSvg(ctx, { uri, label, size = 40, square = false, hidden = false }) {
  const id = ctx.uid();
  return el(
    "svg",
    { "aria-label": hidden ? null : label, "aria-hidden": hidden ? "true" : null, role: hidden ? null : "img", class: C.avatarSvg, style: `height:${size}px;width:${size}px`, "data-visualcompletion": "ignore-dynamic", viewBox: `0 0 ${size} ${size}` },
    el("mask", { id }, square ? el("rect", { width: size, height: size, rx: 6, fill: "white" }) : el("circle", { cx: size / 2, cy: size / 2, r: size / 2, fill: "white" })),
    el("g", { mask: `url(#${id})` }, el("image", { x: 0, y: 0, height: "100%", width: "100%", preserveAspectRatio: "xMidYMid slice", "xlink:href": uri, style: `height:${size}px;width:${size}px` })),
  );
}

const avatarUri = (who, px) => imageUrl(who.type === "User" ? "avatar" : "logo", who.id, px);

function badge(label, n, cls = C.jewelBadge) {
  return el("span", { class: cls }, el("span", { class: C.srOnly }, label), el("span", { "aria-hidden": "true" }, String(n)));
}

function tab(ctx, key, href, icon, { active = false, count = 0 } = {}) {
  const label = ctx.s.tabs[key];
  return el(
    "li",
    { class: C.tab },
    el(
      "a",
      { "aria-label": count ? ctx.s.tabBadge(label, count) : label, "aria-current": active ? "page" : null, href, role: "link", tabindex: 0, class: [C.tabLink, active ? C.tabActive : ""].join(" ").trim() },
      svgIcon(icon, { size: 24 }),
      count ? el("span", { class: C.tabBadge, "aria-hidden": "true" }, String(count)) : null,
    ),
  );
}

/**
 * [role=banner] (dom-chrome §2.1): start section (logo, search), centre tabs, end section. `activeTab` marks the
 * current centre tab; `layers` go into the end section's contextual layer root, where Facebook renders the jewel
 * dropdowns.
 */
export function banner(ctx, { activeTab = "home", layers = [] } = {}) {
  const { s, world } = ctx;
  const { counts } = world.rails;
  return el(
    "div",
    { role: "banner", class: C.banner },
    el(
      "div",
      { class: C.bannerStart },
      el("a", { "aria-label": s.facebook, href: "/", role: "link", tabindex: 0 }, el("svg", { viewBox: "0 0 36 36", class: C.logo, fill: "#0866ff", height: 40, width: 40 }, el("path", { d: "M20.2 35.8V23.2h4.2l.7-4.9h-4.9v-3.2c0-1.4.4-2.4 2.4-2.4h2.6V8.4a34 34 0 0 0-3.8-.2c-3.7 0-6.3 2.3-6.3 6.5v3.6h-4.2v4.9h4.2v12.6A18 18 0 1 1 20.2 35.8z" }))),
      el("div", { class: C.search }, svgIcon("search", { size: 16 }), el("label", el("input", { type: "search", role: "combobox", "aria-label": s.search, placeholder: s.search, "aria-autocomplete": "list", "aria-expanded": "false", autocomplete: "off", spellcheck: "false", dir: "ltr", class: C.searchInput, value: "" }))),
    ),
    el(
      "div",
      { class: C.bannerTabs },
      el(
        "div",
        { role: "navigation", "aria-label": s.facebook },
        el(
          "ul",
          { class: C.tabList },
          tab(ctx, "home", "/", "home", { active: activeTab === "home" }),
          tab(ctx, "friends", "/friends/", "friends", { active: activeTab === "friends", count: counts.friendRequests }),
          tab(ctx, "video", "/watch/?ref=tab", "video", { active: activeTab === "video" }),
          tab(ctx, "groups", "/groups/", "groups", { active: activeTab === "groups" }),
          tab(ctx, "marketplace", "/marketplace/?ref=app_tab", "marketplace", { active: activeTab === "marketplace" }),
        ),
      ),
    ),
    el(
      "div",
      { class: C.bannerEnd },
      el(
        "div",
        { role: "navigation", "aria-label": s.accountNav, class: C.composerRow },
        el("div", { role: "button", tabindex: 0, "aria-label": s.megaMenu, "aria-haspopup": "dialog", "aria-expanded": "false", class: C.jewel }, svgIcon("menu")),
        el("div", { role: "button", tabindex: 0, "aria-label": s.messenger(counts.messages), "aria-haspopup": "dialog", "aria-expanded": "false", class: C.jewel }, svgIcon("messenger"), counts.messages ? badge(s.messengerBadge(counts.messages), counts.messages) : null),
        el("div", { role: "button", tabindex: "-1", "aria-label": s.messenger(0), class: C.jewelHelper }),
        el("div", { role: "button", tabindex: 0, "aria-label": s.notifications(counts.notifications), "aria-haspopup": "dialog", "aria-expanded": "false", class: C.jewel }, svgIcon("bell"), counts.notifications ? badge(s.notificationsBadge, counts.notifications) : null),
        el("div", { role: "button", tabindex: 0, "aria-label": s.yourProfile, "aria-haspopup": "dialog", "aria-expanded": "false", class: C.jewel }, avatarSvg(ctx, { uri: avatarUri(world.viewer, 40 * ctx.scale), label: s.yourProfile, size: 40 })),
      ),
      el("div", { class: C.layerRoot }, layers),
    ),
  );
}

function spriteIcon(name) {
  const i = SPRITE_ICONS.indexOf(name);
  return el("i", { "data-visualcompletion": "css-img", style: `background-image:url("${SPRITE_URL}");background-position:0 -${i * 36}px;background-size:auto;width:36px;height:36px;background-repeat:no-repeat;display:inline-block;flex:none` });
}

function railItem(href, icon, label, meta = null, { unread = null } = {}) {
  return el(
    "li",
    el(
      "div",
      el(
        "div",
        el(
          "div",
          el(
            "a",
            { href, role: "link", tabindex: 0, class: C.railRow },
            icon,
            el("span", el("span", label), meta ? el("span", { class: C.railMeta }, unread ? el("span", { class: C.srOnly }, unread) : null, meta) : null),
          ),
        ),
      ),
    ),
  );
}

const EXPLORE = [
  ["friends", "https://www.facebook.com/friends/?ref=bookmarks"],
  ["memories", "https://www.facebook.com/onthisday/?ref=bookmarks"],
  ["saved", "https://www.facebook.com/saved/?ref=bookmarks"],
  ["groups", "https://www.facebook.com/groups/?ref=bookmarks"],
  ["video", "https://www.facebook.com/watch/?ref=bookmarks"],
  ["marketplace", "https://www.facebook.com/marketplace/?ref=bookmark"],
  ["feeds", "https://www.facebook.com/?filter=all&sk=h_chr"],
  ["events", "https://www.facebook.com/events/?ref=bookmarks"],
];

/** nav[aria-label=Shortcuts] (dom-chrome §3): you, explore, "Your shortcuts" (groups), footer. */
export function leftRail(ctx) {
  const { s, world } = ctx;
  const v = world.viewer;
  return el(
    "div",
    { role: "navigation", "aria-label": s.shortcuts, class: C.leftRail },
    el(
      "div",
      el("h2", { class: C.srOnly }, s.fbMenuHeading),
      el(
        "div",
        { "data-visualcompletion": "ignore-dynamic" },
        el(
          "ul",
          { class: C.list },
          railItem(v.url, avatarSvg(ctx, { uri: avatarUri(v, 36 * ctx.scale), label: v.name, size: 36, hidden: true }), v.name),
          EXPLORE.map(([key, href]) => railItem(href, spriteIcon(key), s.explore[key], key === "friends" ? s.newItems(world.rails.counts.friendRequests) : null, { unread: key === "friends" ? s.unreadDot : null })),
          el("li", el("div", { role: "button", tabindex: 0, "aria-label": s.seeMoreExplore, class: C.railRow }, el("span", { class: C.jewel }, svgIcon("next")), el("span", s.seeMore))),
        ),
        el("div", { class: C.sep }),
        el("div", { class: C.railHeader }, el("span", s.yourShortcuts), el("div", { role: "button", tabindex: 0, "aria-label": s.editShortcuts, class: C.bylineLink }, s.editShortcuts)),
        el(
          "ul",
          { class: C.list },
          world.rails.shortcuts.map((g) => railItem(g.url, el("img", { src: imageUrl("logo", g.id, 36 * ctx.scale), alt: "", class: C.railImgSquare, width: 36, height: 36 }), g.name, g.unread ? s.newItems(g.unread) : null, { unread: g.unread ? s.unreadDot : null })),
        ),
      ),
      footerLinks(ctx),
    ),
  );
}

export function footerLinks(ctx) {
  const links = ctx.s.footer;
  const hrefs = ["/privacy/policy/", "/policies/", "/business", "/ad_choices", "/policies/cookies/", "/help/", null];
  return el(
    "footer",
    { role: "contentinfo", "aria-label": ctx.s.facebook, class: C.footer },
    links.map((label, i) => [i ? el("span", { "aria-hidden": "true" }, " · ") : null, hrefs[i] ? el("a", { href: hrefs[i], role: "link", class: C.bylineLink }, label) : el("span", label)]),
  );
}

function railSection(title, ...body) {
  return el("div", { class: C.railSection }, el("h3", { class: C.railHeader }, el("span", { style: "-webkit-box-orient:vertical;-webkit-line-clamp:2;display:-webkit-box;overflow:hidden" }, title)), ...body);
}

/** [role=complementary] Home right rail (dom-chrome §4): Sponsored, Birthdays, Contacts, Group chats. */
export function rightRail(ctx) {
  const { s, world } = ctx;
  const { rails } = world;
  const ads = world.advertisers.slice(0, 2).map((a, i) => {
    const target = `https://${a.vanity}.example/landing?utm_source=fb&utm_medium=paid&utm_campaign=rhc${i}&fbclid=IwAR${a.id}`;
    return el(
      "div",
      { class: C.composerRow },
      el(
        "a",
        { href: `https://l.facebook.com/l.php?u=${encodeURIComponent(target)}&h=AT${a.id}`, target: "rhcad3", rel: "nofollow noreferrer", attributionsrc: `/privacy_sandbox/comet/register/source/?xt=AZ${a.id}&eid=${a.id}${i}`, role: "link", tabindex: 0, class: C.adLink },
        el("img", { src: imageUrl("ad", a.id, 260, 260), alt: "", class: C.adImg, width: 130, height: 130 }),
        el("div", { class: C.ellipsis }, el("span", { class: C.linkTitle }, a.name), el("span", { class: [C.linkMeta, C.ellipsis].join(" ") }, `${a.vanity}.example`)),
      ),
      el("div", { role: "button", tabindex: 0, "aria-label": s.adMenu(a.name), class: C.postMenu }, svgIcon("dots")),
    );
  });
  const birthdayNames = rails.birthdays.map((p) => p.name);
  const contacts = el(
    "ul",
    { class: C.list },
    el(
      "li",
      el(
        "a",
        { href: "/messages/t/1000000000000002/", role: "link", tabindex: 0, class: C.contact },
        el("div", { class: C.contactPic }, el("svg", { "aria-label": `Meta AI ${s.profilePicture}`, role: "img", width: 36, height: 36, class: C.avatarSvg }, el("image", { "xlink:href": `https://${CDN_HOST}/v/t39.30808-1/gen-ai/logo_metaai_72x72_n.jpg?_nc_cat=1`, width: 36, height: 36 }))),
        el("span", "Meta AI"),
        el("svg", { viewBox: "0 0 12 12", width: 12, height: 12, role: "img", fill: "#0866ff" }, el("title", s.verified), el("circle", { cx: 6, cy: 6, r: 6 })),
      ),
    ),
    rails.contacts.map((c) =>
      el(
        "li",
        el(
          "a",
          { href: `/messages/t/${c.id}/`, role: "link", tabindex: 0, class: C.contact },
          el("div", { class: C.contactPic }, avatarSvg(ctx, { uri: avatarUri(c, 36 * ctx.scale), label: s.profilePicture, size: 36 }), c.online ? el("div", { class: C.onlineDot, "aria-hidden": "true", "data-visualcompletion": "ignore" }) : null),
          el("span", c.name),
          c.online ? el("span", { class: C.srOnly }, `, ${s.active}`) : null,
        ),
      ),
    ),
  );
  const gc = rails.groupChat;
  return el(
    "div",
    { role: "complementary", class: C.rightRail },
    el(
      "div",
      railSection(s.sponsored, ...ads),
      railSection(s.birthdays, el("a", { href: "/events/birthdays/", role: "link", tabindex: 0, class: C.railRow }, el("span", { class: C.jewel }, svgIcon("gift")), el("span", s.birthdayToday([birthdayNames[0]])))),
      el("div", { class: C.railSection }, el("div", { class: C.railHeader }, el("h3", { class: C.postName }, s.contacts), el("div", { class: C.composerRow }, el("div", { role: "button", tabindex: 0, "aria-label": s.contactsSearch, class: C.postMenu }, svgIcon("search", { size: 16 })), el("div", { role: "button", tabindex: 0, "aria-label": s.contactsMore, class: C.postMenu }, svgIcon("dots", { size: 16 })))), contacts),
      railSection(s.groupChats, el("ul", { class: C.list }, el("li", el("div", { role: "button", tabindex: 0, "aria-label": s.groupChatLabel(gc.a, gc.b, gc.others, gc.ago), class: C.contact }, el("span", { class: C.jewel }, svgIcon("groups")), el("span", `${gc.a}, ${gc.b}…`)))), el("div", { role: "button", tabindex: 0, class: C.railRow }, el("span", { class: C.jewel }, svgIcon("compose", { size: 16 })), el("span", s.createGroupChat))),
    ),
  );
}

/** Docked chat root (bottom right, outside [role=main]) with the "New message" head. */
export function chatRoot(ctx) {
  return el("div", { class: C.chatRoot }, el("div", { role: "button", tabindex: 0, "aria-label": ctx.s.newMessage, class: C.chatHead }, svgIcon("compose")));
}

/** [role=region][aria-label="Create a post"] (dom-chrome §5.2). */
export function composer(ctx) {
  const { s, world } = ctx;
  const v = world.viewer;
  return el(
    "div",
    { role: "region", "aria-label": s.createPost, class: C.card },
    el(
      "div",
      { class: C.cardPad },
      el("h3", { class: C.srOnly }, s.createPost),
      el("div", { class: C.composerRow }, el("a", { href: v.url, "aria-label": s.timelineOf(v.name), role: "link", tabindex: 0 }, avatarSvg(ctx, { uri: avatarUri(v, 40 * ctx.scale), label: v.name, size: 40, hidden: true })), el("div", { role: "button", tabindex: 0, class: C.pill }, el("span", s.whatsOnYourMind(v.shortName)))),
      el("div", { class: C.composerButtons }, s.composerButtons.map((label) => el("div", { role: "button", tabindex: 0, class: C.plainButton }, label))),
    ),
  );
}

/** Stories block: region "Stories" > div[data-virtualized=false] > div > [data-focus-target=stories_tray]. */
export function storiesBlock(ctx) {
  const { s, world } = ctx;
  const cells = world.friends.slice(0, 4).map((f) =>
    el("div", { role: "gridcell" }, el("a", { href: `/stories/${f.id}/${Buffer.from(`story:${f.id}`).toString("base64url")}/?source=story_tray`, "aria-label": s.storyOf(f.name), role: "link", tabindex: 0, class: C.storyCard }, el("img", { src: imageUrl("photo", `st${f.id}`, 224, 400), alt: "", class: C.storyImg }), el("span", { class: C.storyName }, f.name))),
  );
  return el(
    "div",
    { role: "region", "aria-label": s.stories },
    el(
      "div",
      { "data-virtualized": "false" },
      el(
        "div",
        el(
          "div",
          { role: "region", "data-focus-target": "stories_tray", class: C.storiesRegion },
          el("h3", { class: C.srOnly }, s.stories),
          el("div", { role: "grid", "aria-label": s.storiesTray }, el("div", { role: "row", class: C.storiesTray }, el("div", { role: "gridcell" }, el("a", { href: "/stories/create/", "aria-label": s.createStory, role: "link", tabindex: 0, class: C.storyCard }, el("img", { src: imageUrl("avatar", world.viewer.id, 224, 300), alt: "", class: C.storyImg }), el("span", { class: C.storyName }, s.createStory))), cells)),
          el("div", { role: "button", tabindex: 0, "aria-label": s.nextItems, class: C.storiesNext }, svgIcon("next")),
        ),
      ),
    ),
  );
}

/** Left panel of the Feeds routes (FeedsCometRoot): filter links, no Shortcuts rail (dom-chrome §3.3). */
export function feedsNav(ctx, active) {
  const { s } = ctx;
  return el(
    "div",
    { role: "navigation", "aria-label": s.feeds, class: C.feedsNav },
    el("h1", { class: C.navTitle }, s.feeds),
    el("ul", { class: C.list }, Object.entries(s.feedFilters).map(([key, label]) => el("li", el("a", { href: `/?filter=${key}&sk=h_chr`, role: "link", tabindex: 0, "aria-current": key === active ? "page" : null, class: C.railRow }, spriteIcon(key === "all" ? "feeds" : key === "favorites" ? "saved" : key === "pages" ? "marketplace" : key), el("span", label))))),
  );
}

/** Left panel of /groups/feed/ (Groups root): feed, discover, groups you've joined. */
export function groupsNav(ctx) {
  const { s, world } = ctx;
  return el(
    "div",
    { role: "navigation", "aria-label": s.groupsNav, class: C.feedsNav },
    el("h1", { class: C.navTitle }, s.groupsNav),
    el("ul", { class: C.list }, el("li", el("a", { href: "/groups/feed/", role: "link", "aria-current": "page", class: C.railRow }, spriteIcon("groups"), el("span", s.groupsFeed))), el("li", el("a", { href: "/groups/discover/", role: "link", class: C.railRow }, spriteIcon("feeds"), el("span", s.discover)))),
    el("div", { class: C.sep }),
    el("h2", { class: C.railHeader }, s.yourGroups),
    el("ul", { class: C.list }, world.groups.map((g) => railItem(g.url, el("img", { src: imageUrl("logo", g.id, 36 * ctx.scale), alt: "", class: C.railImgSquare, width: 36, height: 36 }), g.name, s.lastActive(g.unread ? "5m" : "2h")))),
  );
}
