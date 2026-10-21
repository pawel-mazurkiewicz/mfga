// Page templates of the fake logged-in facebook.com 2026: full HTML documents with the inline data-sjs frames,
// #envjson, Facebook's stylesheets and runtime, and a DOM shaped like Comet's (dom-chrome.md, dom-feed.md).

import { el, raw, sjsScript, payloadListenerScript, inlineJson, esc } from "./html.mjs";
import { C } from "./styles.mjs";
import { strings } from "./strings.mjs";
import { createWorld } from "./world.mjs";
import { feedPayloads } from "./graphql-shapes.mjs";
import { feedPage } from "./feed-pages.mjs";
import { makeTokens, configBlocks, entrypointBlock, prefetchedBlocks, preloaderId, routeDescriptor, envJson, lsdEchoBlock } from "./ssr.mjs";
import { banner, leftRail, rightRail, chatRoot, composer, storiesBlock, feedsNav, groupsNav, footerLinks, avatarSvg, STATIC_HOST } from "./chrome.mjs";
import { renderUnits, skeletonSlot } from "./posts.mjs";
import { imageUrl } from "./images.mjs";

export const ASSETS = Object.freeze({
  themeCss: `https://${STATIC_HOST}/rsrc.php/v4/yW/l/0,cross/fixture-light-vars.css`,
  appCss: `https://${STATIC_HOST}/rsrc.php/v4/yZ/l/0,cross/fixture-app.css`,
  runtimeJs: `https://${STATIC_HOST}/rsrc.php/v4/y4/r/fixture-runtime.js`,
  opsJs: `https://${STATIC_HOST}/rsrc.php/v4/yQ/r/fixture-relay-ops.js`,
});

/** Shared page options: one world/token set per site so SSR, the mock and the DOM agree. */
function setup(opts = {}) {
  const locale = opts.locale || opts.world?.locale || "en";
  const world = opts.world || createWorld({ locale, now: opts.now });
  const tokens = opts.tokens || makeTokens(world);
  let n = 0;
  const ctx = { world, s: strings(locale), scale: opts.scale || 1, uid: () => `_r_${(n++).toString(36)}_` };
  return { ...opts, locale, world, tokens, ctx, fetchSize: opts.fetchSize || 4, mountId: opts.mountId || "mount_0_0_Xy" };
}

function pageDocument({ o, title, head = [], beforeMount = [], mount, afterMount = [] }) {
  const { tokens, ctx } = o;
  const nonce = tokens.nonce;
  const page = el(
    "html",
    { id: "facebook", class: "_9dls __fb-light-mode", lang: ctx.s.lang, dir: "ltr" },
    el(
      "head",
      el("meta", { charset: "utf-8" }),
      el("meta", { name: "referrer", content: "origin-when-crossorigin", id: "meta_referrer" }),
      el("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
      el("title", title),
      el("link", { type: "text/css", rel: "stylesheet", href: ASSETS.themeCss, crossorigin: "anonymous" }),
      el("link", { type: "text/css", rel: "stylesheet", href: ASSETS.appCss, crossorigin: "anonymous" }),
      raw(`<script id="envjson" type="application/json" nonce="${esc(nonce)}">${inlineJson(envJson(tokens))}</script>`),
      el("script", { src: ASSETS.runtimeJs, crossorigin: "anonymous", nonce }),
      el("script", { src: ASSETS.opsJs, async: true, crossorigin: "anonymous", nonce }),
      head,
    ),
    el("body", { class: "_6s5d _71pn system-fonts--body segoe", dir: "ltr" }, beforeMount, el("div", { id: o.mountId, class: C.root }, mount), afterMount),
  );
  return `<!DOCTYPE html>\n${page}`;
}

/** SSR frames shared by every logged-in page: config, entry point, prefetched payloads, LSD echo. */
function ssrFrames(o, descriptor, prefetched = []) {
  const { world, tokens, ctx } = o;
  const [configA, configB] = configBlocks(world, tokens, { localeCode: ctx.s.localeCode, checkpointed: o.checkpointed });
  const frame = (v) => [sjsScript(v, tokens.nonce), payloadListenerScript(tokens.nonce)];
  return {
    head: frame(configA),
    beforeMount: frame(configB),
    afterMount: [frame(entrypointBlock(world, { ...descriptor, elementId: o.mountId })), prefetched.map(frame), frame(lsdEchoBlock(tokens))],
  };
}

/** <template>s holding jewel dropdowns, rendered by the runtime into the banner's layer root. */
function jewelTemplates(ctx) {
  const { s, world } = ctx;
  const dialog = (label, ...rows) => el("template", el("div", { role: "dialog", "aria-label": label, class: C.dropdown }, rows));
  const row = (href, who, text) => el("div", { role: "listitem" }, el("a", { href, role: "link", class: C.dropdownRow }, avatarSvg(ctx, { uri: imageUrl("avatar", who.id, 56), size: 56, hidden: true }), el("span", text)));
  return [
    dialog(s.megaMenu, el("a", { href: "/pages/creation/?ref_type=comet_megamenu", role: "link", class: C.dropdownRow }, s.megaMenuItems[0]), el("a", { href: "/events/create/?ref_type=comet_megamenu", role: "link", class: C.dropdownRow }, s.megaMenuItems[1])),
    dialog(s.messengerTitle, el("div", { role: "list" }, world.friends.slice(0, 3).map((f) => row(`/messages/t/${f.id}/`, f, f.name))), el("a", { href: "/messages/t/", role: "link", class: C.dropdownRow }, s.seeAllInMessenger)),
    dialog(s.notificationsTitle, el("div", { role: "list" }, world.friends.slice(0, 5).map((f, i) => row(`/notifications/?notif_id=${1700000000000 + i}&notif_t=feedback_comment&ref=notif`, f, s.notificationRow(f.name))))),
    dialog(s.yourProfile, el("a", { href: "/me/", role: "link", class: C.dropdownRow }, world.viewer.name), el("div", { role: "list" }, el("div", { role: "listitem" }, el("div", { role: "button", tabindex: 0, class: C.dropdownRow }, s.logOut)))),
  ];
}

function composerTemplate(ctx) {
  const { s, world } = ctx;
  return el(
    "template",
    { "data-portal": "composer", "data-region": s.createPost },
    el("div", { class: "__fb-light-mode" }, el("div", { class: C.dialogBackdrop }, el("div", { role: "dialog", "aria-label": s.createPostDialog, class: C.dialog }, el("div", { class: C.dialogHeader }, el("h2", s.createPostDialog), el("div", { role: "button", tabindex: 0, "aria-label": s.close, class: C.dialogClose }, "×")), el("div", { role: "textbox", contenteditable: "true", "aria-label": s.whatsOnYourMind(world.viewer.shortName), class: C.dialogText }), el("div", { style: "padding:0 16px" }, el("div", { role: "button", tabindex: 0, class: C.primaryButton, style: "text-align:center" }, s.post))))),
  );
}

/**
 * Native feed: the SSR page as [aria-posinset] slots, a trailing skeleton, and later pages as <template>s the
 * runtime appends on scroll. Returns { list, templates, units, payloads } (payloads: the SSR page as Relay
 * incremental payloads).
 */
function nativeFeed(o, feedName, { pages = 3, listRole = null } = {}) {
  const { world, ctx, fetchSize } = o;
  const shapeCtx = { scale: ctx.scale, obfuscateCategory: true };
  const first = feedPage(world, feedName, { offset: 0, size: fetchSize, ctx: shapeCtx });
  const firstSlots = renderUnits(ctx, first.items, 1);
  const units = [...firstSlots.units];
  const templates = [];
  let next = firstSlots.next;
  for (let p = 1; p < pages; p++) {
    const page = feedPage(world, feedName, { offset: p * fetchSize, size: fetchSize, ctx: shapeCtx });
    if (!page.items.length) break;
    const batch = renderUnits(ctx, page.items, next);
    units.push(...batch.units);
    next = batch.next;
    templates.push(el("template", batch.slots));
  }
  const list = el("div", listRole ? { role: listRole } : {}, firstSlots.slots, skeletonSlot(ctx, next));
  return { list, templates, units, payloads: feedPayloads(world, first.edges, first.pageInfo) };
}

function feedSection(o, feed) {
  return el("div", el("h3", { dir: "auto", class: C.srOnly }, o.ctx.s.feedPosts), el("div", { "aria-hidden": "true" }), feed.list, feed.templates);
}

function feedPrefetch(o, descriptor, feed) {
  const feedPreloader = descriptor.preloaders[0];
  return prefetchedBlocks(preloaderId(feedPreloader.op, feedPreloader.salt), feed.payloads);
}

function homeLike(o, feedName) {
  const { ctx } = o;
  const descriptor = routeDescriptor("home", { feedName, fetchSize: o.fetchSize });
  const feed = nativeFeed(o, feedName);
  const column = el("div", { class: C.column }, el("div"), composer(ctx), storiesBlock(ctx), feedSection(o, feed));
  const layout = el("div", { class: C.homeLayout }, leftRail(ctx), el("div", { role: "main", class: C.mainCol }, el("h1", { class: C.srOnly }, ctx.s.homeHeading), column), rightRail(ctx));
  const frames = ssrFrames(o, descriptor, feedPrefetch(o, descriptor, feed));
  const { counts } = o.world.rails;
  return {
    html: pageDocument({ o, title: `(${counts.notifications + counts.messages}) Facebook`, ...frames, mount: mountTree(ctx, "home", layout), afterMount: [frames.afterMount, composerTemplate(ctx)] }),
    units: feed.units,
    feedName,
  };
}

function mountTree(ctx, activeTab, layout) {
  return el("div", el("div", el("div", banner(ctx, { activeTab, layers: jewelTemplates(ctx) }), el("div", { class: C.main }, layout)), chatRoot(ctx)));
}

const BUILDERS = {
  /** "/" (Top News, feedStyle DEFAULT) or "/?sk=h_chr" (`feed: "all"`). */
  home: (o) => homeLike(o, o.feed === "all" ? "all" : "top"),

  /** "/?filter=<friends|groups|pages|favorites|all>&sk=h_chr": FeedsCometRoot, no Shortcuts/right rails. */
  feeds(o) {
    const filter = o.filter || "friends";
    const descriptor = routeDescriptor("feeds", { filter, fetchSize: o.fetchSize });
    const feed = nativeFeed(o, filter);
    const layout = el("div", { class: C.homeLayout }, feedsNav(o.ctx, filter), el("div", { role: "main", class: C.mainCol }, el("div", { class: C.column }, feedSection(o, feed))), el("div", { style: "flex:0 1 360px" }));
    const frames = ssrFrames(o, descriptor, feedPrefetch(o, descriptor, feed));
    return { html: pageDocument({ o, title: o.ctx.s.pageTitle(o.ctx.s.feeds), ...frames, mount: mountTree(o.ctx, null, layout) }), units: feed.units, feedName: filter };
  },

  /** "/groups/feed/": groups left panel and a native [role=feed] list (dom-feed §2.2). */
  "groups-feed"(o) {
    const descriptor = routeDescriptor("groups-feed");
    const feed = nativeFeed(o, "groups", { pages: 4, listRole: "feed" });
    const column = el("div", { class: C.column }, el("h2", { dir: "auto", class: C.railHeader }, o.ctx.s.recentActivity), feed.list, feed.templates);
    const layout = el("div", { class: C.homeLayout }, groupsNav(o.ctx), el("div", { role: "main", class: C.mainCol }, column), el("div", { style: "flex:0 1 360px" }));
    const frames = ssrFrames(o, descriptor);
    return { html: pageDocument({ o, title: o.ctx.s.pageTitle(o.ctx.s.groupsNav), ...frames, mount: mountTree(o.ctx, "groups", layout) }), units: feed.units, feedName: "groups" };
  },

  /** "/<vanity>": a profile with cover, tabs, intro and the person's own posts. */
  profile(o) {
    const { ctx, world } = o;
    const person = [world.viewer, ...world.friends].find((p) => p.vanity === o.vanity) || world.viewer;
    const own = [...world.stories.values()].filter((st) => st.actor.id === person.id && !st.to).sort((a, b) => b.time - a.time).slice(0, 6);
    const { slots, units } = renderUnits(ctx, own.map((story) => ({ story })));
    const isViewer = person.id === world.viewer.id;
    const header = el(
      "div",
      { class: C.profileHeader },
      el("img", { src: imageUrl("photo", `cover${person.id}`, 1250, 340), alt: "", class: C.cover }),
      el("div", { class: C.profileInfo }, el("img", { src: imageUrl("avatar", person.id, 336), alt: "", class: C.profilePic }), el("div", el("h1", { class: C.profileName }, person.name), el("a", { href: `${person.url}/friends`, role: "link", class: C.bylineLink }, ctx.s.friendsCount(isViewer ? world.viewer.friendCount : 180))), el("div", { class: C.profileButtons }, isViewer ? el("div", { role: "button", tabindex: 0, class: C.secondaryButton }, ctx.s.editProfile) : [el("div", { role: "button", tabindex: 0, class: C.primaryButton }, ctx.s.message)])),
      el("div", { role: "tablist", class: C.profileTabs }, ctx.s.profileTabs.map((t, i) => el("a", { role: "tab", "aria-selected": i === 0 ? "true" : "false", href: i ? `${person.url}/${t.toLowerCase()}` : person.url, class: C.profileTab }, t))),
    );
    const body = el("div", { class: C.profileBody }, el("div", { class: C.profileSide }, el("div", { class: [C.card, C.cardPad].join(" ") }, el("h2", { class: C.postName }, ctx.s.intro), el("p", "Kraków · Lakeside Hiking Club")), footerLinks(ctx)), el("div", { class: C.profileFeed }, el("div", slots)));
    const descriptor = routeDescriptor("profile", { profileId: person.id });
    const frames = ssrFrames(o, descriptor);
    return { html: pageDocument({ o, title: ctx.s.pageTitle(person.name), ...frames, mount: mountTree(ctx, null, el("div", { role: "main" }, header, body)) }), units, feedName: null };
  },

  /** Any other Facebook route: banner plus a simple main area (the shell's "page" mode target). */
  page(o) {
    const descriptor = routeDescriptor("profile", { profileId: o.world.viewer.id });
    const frames = ssrFrames(o, { ...descriptor, preloaders: [] });
    const title = o.title || o.ctx.s.facebook;
    const layout = el("div", { role: "main" }, el("div", { class: C.notFound }, el("h1", { class: C.profileName }, title), el("p", o.body || o.ctx.s.notAvailable)));
    return { html: pageDocument({ o, title: o.ctx.s.pageTitle(title), ...frames, mount: mountTree(o.ctx, o.activeTab || null, layout) }), units: [], feedName: null };
  },

  /** Checkpoint interstitial: account-warning text and "is_checkpointed":true (graphql-protocol §13). */
  checkpoint(o) {
    const frames = ssrFrames({ ...o, checkpointed: true }, { ...routeDescriptor("profile", { profileId: o.world.viewer.id }), preloaders: [] });
    const body = el("div", { role: "main" }, el("div", { class: C.notFound }, el("h1", { class: C.profileName }, o.ctx.s.checkpointTitle), el("p", o.ctx.s.checkpointBody)));
    return { html: pageDocument({ o, title: o.ctx.s.facebook, ...frames, mount: body }), units: [], feedName: null };
  },
};

/** renderPage(kind, opts) -> { html, units, feedName }. kinds: home, feeds, groups-feed, profile, page, checkpoint. */
export function renderPage(kind, opts = {}) {
  const build = BUILDERS[kind];
  if (!build) throw new Error(`unknown fixture page kind ${kind}`);
  return build(setup(opts));
}

export const homePage = (opts) => renderPage("home", opts).html;
export const filterPage = (opts) => renderPage("feeds", opts).html;
export const groupsFeedPage = (opts) => renderPage("groups-feed", opts).html;
export const profilePage = (opts) => renderPage("profile", opts).html;
export const genericPage = (opts) => renderPage("page", opts).html;
export const checkpointPage = (opts) => renderPage("checkpoint", opts).html;
