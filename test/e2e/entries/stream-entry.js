// Browser entry for test/e2e/stream.test.mjs: renders the fixture stories with a fake StreamCtx.
//   window.mfgaStream.mount(options)   -> builds the feed view into #col
//   window.__calls                     -> every ctx callback/action call, in order
//   window.__ctl                       -> switches the fake actions and feed (failures, delays, page size)
import { iconCss } from "../../../src/ui/icons.js";
import { baseCss } from "../../../src/ui/css/base.js";
import { streamCss } from "../../../src/ui/css/stream.js";
import { createFeedView } from "../../../src/ui/stream/feed-view.js";
import { renderStory } from "../../../src/ui/stream/story.js";
import { setLocale } from "../../../src/shared/i18n.js";
import { sanitize } from "../../../src/shared/settings.js";
import { health } from "../../../src/shared/util.js";
import { COMMENTS, ME, NOW, allStories, extraStories, galleryStories, replicaStories } from "../../fixtures/stream/stories.mjs";

const calls = [];
const ctl = {
  delayMs: 30,
  pageSize: 4,
  commentsPageSize: 10,
  failReact: false,
  throwReact: false,
  failComment: false,
  failComments: false,
  failPage: false,
  emptyPages: false, // more() returns nothing yet the feed goes on (every story filtered out)
  bareEcho: false,
  nowShiftMs: 0,
};
window.__calls = calls;
window.__ctl = ctl;

const record = (name, ...args) => calls.push({ name, args });
const wait = () => new Promise((r) => setTimeout(r, ctl.delayMs));
const now = () => NOW + ctl.nowShiftMs;

const STORY_SETS = {
  all: () => [...allStories].sort((a, b) => b.time - a.time),
  replica: () => replicaStories,
  gallery: () => galleryStories,
  extra: () => extraStories,
  none: () => [],
};

/** Server-side like state per story, so react() can echo counts like Facebook does. */
const server = new Map();
function serverState(story) {
  if (!server.has(story.key)) {
    const fb = story.feedback;
    server.set(story.key, { count: fb.reactions, reaction: fb.viewerReaction, comments: [...(COMMENTS[story.postId] || [])] });
  }
  return server.get(story.key);
}

const actions = {
  async react(story, reactionId) {
    record("react", story.key, reactionId);
    await wait();
    if (ctl.throwReact) throw new Error("boom");
    if (ctl.failReact) return { ok: false, error: "stale-doc" };
    const s = serverState(story);
    const was = s.reaction != null;
    const liked = reactionId !== "0";
    s.count += (liked ? 1 : 0) - (was ? 1 : 0);
    s.reaction = liked ? reactionId : null;
    return { ok: true, reactions: s.count, viewerReaction: s.reaction };
  },
  async comments(story, cursor) {
    record("comments", story.key, cursor ?? null);
    await wait();
    if (ctl.failComments) return { ok: false, comments: [], cursor: null, hasMore: false, error: "network" };
    const newestFirst = [...serverState(story).comments].reverse();
    const start = cursor ? Number(cursor) : 0;
    const page = newestFirst.slice(start, start + ctl.commentsPageSize);
    const next = start + page.length;
    return { ok: true, comments: page, cursor: next < newestFirst.length ? String(next) : null, hasMore: next < newestFirst.length };
  },
  async comment(story, text) {
    record("comment", story.key, text);
    await wait();
    if (ctl.failComment) return { ok: false, error: "soft-block" };
    const author = ctl.bareEcho ? { id: "me", name: ME.name, url: null, avatar: null } : { id: "me", ...ME };
    const c = { id: `${story.postId}_new${calls.length}`, author, text, ranges: [], time: ctl.bareEcho ? undefined : Math.floor(now() / 1000), reactions: 0, replies: 0 };
    serverState(story).comments.push(c);
    return { ok: true, comment: c };
  },
  async can() {
    return true;
  },
};

function makeFeed(list) {
  let next = 0;
  const feed = {
    exhausted: false,
    async more() {
      record("more");
      await wait();
      if (ctl.failPage) throw new Error("network");
      if (ctl.emptyPages) return [];
      const page = list.slice(next, next + ctl.pageSize);
      next += page.length;
      feed.exhausted = next >= list.length;
      return page;
    },
  };
  return feed;
}

const style = document.head.appendChild(document.createElement("style"));
/** The stylesheets src/main.js concatenates for the stream: base, icons, stream. */
const css = (settings) => [baseCss(settings), iconCss(), streamCss(settings)].join("\n");
let view = null;

function mount({
  locale = "en",
  welcome = false,
  autoLoad = false,
  previewComments = true,
  stories = "all",
  topStories = "gallery",
  mode = "recent",
  lastSeen = null,
  hidden = { ads: 3, suggested: 5 },
  noActions = false,
  noFeed = false,
  throwingCallbacks = false,
} = {}) {
  setLocale(locale);
  const settings = sanitize({ feed: { autoLoad, previewComments, mode }, look: { welcome } });
  style.textContent = css(settings);
  view?.destroy();
  const ctx = {
    actions: noActions ? null : actions,
    settings,
    me: ME,
    now,
    open: (url, opts) => record("open", url, opts),
    getFeed(feedMode, sources) {
      record("getFeed", feedMode, sources);
      return noFeed ? null : makeFeed(STORY_SETS[feedMode === "top" ? topStories : stories]());
    },
    mode,
    onModeChange: (m) => record("modeChange", m),
    openComposer: () => record("openComposer"),
    hiddenStats: () => {
      if (throwingCallbacks) throw new Error("stats not ready");
      return hidden;
    },
    onDismissWelcome: () => record("dismissWelcome"),
    lastSeen,
    onSeen: (t) => {
      record("seen", t);
      if (throwingCallbacks) throw new Error("storage full");
    },
  };
  view = createFeedView(ctx);
  document.getElementById("col").append(view.el);
  return true;
}

/** Renders one fixture story on its own (no feed view) into #col. */
function renderOne(key, { locale = "en" } = {}) {
  setLocale(locale);
  const settings = sanitize({});
  style.textContent = css(settings);
  const story = allStories.find((s) => s.key === key);
  const ctx = { actions, settings, me: ME, now, open: (url, opts) => record("open", url, opts) };
  const root = document.createElement("div");
  root.className = "mfga-ui";
  root.append(renderStory(story, ctx));
  document.getElementById("col").append(root);
  return true;
}

window.mfgaStream = {
  mount,
  renderOne,
  reload: () => view?.reload(),
  destroy: () => view?.destroy(),
  health: () => health.snapshot(),
};
