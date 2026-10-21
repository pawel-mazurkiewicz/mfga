// The 2010 home page centre column: welcome box, "News Feed" header with "Top News · Most Recent",
// "What's on your mind?" box, the stories, "Older Posts" (or auto-load), empty/error states and the
// "N ads and M suggested posts were hidden." status line.
import { clear, h, replaceChildren } from "../dom.js";
import { icon } from "../icons.js";
import { t } from "../../shared/i18n.js";
import { health, safe } from "../../shared/util.js";
import { DEFAULTS } from "../../shared/settings.js";
import { countNewer, enabledSources, formatCount, hiddenSentence } from "./format.js";
import { guard, linkButton, nowMs, routeClicks, settingsOf } from "./parts.js";
import { renderStory } from "./story.js";
import { refreshTimes } from "./time.js";
import { unwatchWithin } from "./visibility.js";
import { renderWelcome } from "./welcome.js";

const MODES = ["top", "recent"];
const TIME_REFRESH_MS = 60_000;
const AUTOLOAD_PX = 600;

const renderOne = safe("stream.story", renderStory, { disableOnError: false });

/**
 * createFeedView(ctx) -> { el, reload(), destroy() }. Starts loading the first page right away.
 * FeedViewCtx = StreamCtx & { getFeed(mode, sources), mode, onModeChange(mode), openComposer(),
 *   hiddenStats(), onDismissWelcome() } and optionally { lastSeen: unix seconds, onSeen(unixSeconds) }
 *   for the 2010 count pill next to "Most Recent" (stories newer than the last visit).
 */
export function createFeedView(ctx) {
  const feedSettings = () => ({ ...DEFAULTS.feed, ...settingsOf(ctx).feed });
  const view = {
    mode: MODES.includes(ctx.mode) ? ctx.mode : feedSettings().mode,
    feed: null,
    gen: 0,
    loading: false,
    error: null,
    keys: new Set(),
    stories: [],
  };

  const modes = h("div.mfga-feed-modes");
  const header = h("div.mfga-feed-header", icon("nav_news_feed", { className: "mfga-feed-ico" }), h("h2.mfga-feed-title", t("feed.title")), modes);
  const composer = h(
    "div.mfga-feed-composer",
    {
      role: "button",
      tabindex: "0",
      onclick: guard(() => ctx.openComposer?.()),
      onkeydown: guard((ev) => {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        ev.preventDefault();
        ctx.openComposer?.();
      }),
    },
    t("feed.composer"),
  );
  const list = h("div.mfga-feed-stories");
  const footer = h("div.mfga-feed-footer");
  const status = h("div.mfga-feed-status", { hidden: true });
  const el = h("div#mfga-stream.mfga-ui.mfga-stream", welcomeBox(), header, composer, list, footer, status);
  routeClicks(el, ctx);

  const timer = setInterval(guard(() => refreshTimes(el, nowMs(ctx))), TIME_REFRESH_MS);
  const sentinel =
    feedSettings().autoLoad && typeof IntersectionObserver === "function"
      ? new IntersectionObserver(onSentinel, { rootMargin: `0px 0px ${AUTOLOAD_PX}px 0px` })
      : null;
  sentinel?.observe(footer);

  renderModes();
  guard(reload)();
  return { el, reload, destroy };

  function welcomeBox() {
    const s = settingsOf(ctx);
    if (s.look?.welcome === false || s.state?.welcomeDismissed) return null;
    return renderWelcome({ onClose: () => ctx.onDismissWelcome?.(), open: ctx.open });
  }

  function renderModes() {
    const parts = MODES.map((mode) => {
      const label = t(mode === "top" ? "feed.top" : "feed.recent");
      return mode === view.mode ? h("strong.mfga-feed-mode.mfga-feed-mode-on", label) : linkButton(label, () => switchMode(mode), "mfga-feed-mode");
    });
    const fresh = view.mode === "recent" ? countNewer(view.stories, ctx.lastSeen) : 0;
    replaceChildren(
      modes,
      parts[0],
      h("span.mfga-feed-dot", " · "),
      parts[1],
      fresh ? h("span.mfga-pill.mfga-feed-pill", { title: t("feed.newPosts", { n: fresh }) }, formatCount(fresh)) : null,
    );
  }

  function switchMode(mode) {
    if (mode === view.mode) return;
    view.mode = mode;
    renderModes();
    ctx.onModeChange?.(mode);
    reload();
  }

  /** Drops the stories and starts again from the first page of a fresh feed. */
  async function reload() {
    view.gen++;
    Object.assign(view, { feed: null, loading: false, error: null, stories: [] });
    view.keys.clear();
    unwatchWithin(list);
    clear(list);
    try {
      view.feed = ctx.getFeed(view.mode, enabledSources(feedSettings()));
    } catch (err) {
      view.error = err;
      renderFooter();
      return;
    }
    await loadMore();
  }

  async function loadMore({ auto = false } = {}) {
    const { feed, gen } = view;
    if (!feed || view.loading || feed.exhausted || (auto && view.error)) return;
    view.loading = true;
    view.error = null;
    renderFooter();
    let stories;
    try {
      stories = await feed.more();
    } catch (err) {
      if (gen !== view.gen) return;
      view.loading = false;
      view.error = err;
      health.count("stream.page-failed");
      renderFooter();
      return;
    }
    if (gen !== view.gen) return;
    view.loading = false;
    const first = !view.stories.length;
    appendStories(Array.isArray(stories) ? stories : []);
    if (first) reportSeen();
    renderModes();
    renderFooter();
    renderStatus();
    health.count("stream.page");
    if (sentinel && !feed.exhausted) requestAnimationFrame(guard(() => nearEnd() && loadMore({ auto: true })));
  }

  function appendStories(stories) {
    for (const story of stories) {
      const key = story?.key || story?.postId || story?.nodeId;
      if (!key || view.keys.has(key)) continue;
      const node = renderOne(story, ctx);
      if (!node) continue;
      view.keys.add(key);
      view.stories.push(story);
      list.append(node);
    }
  }

  function reportSeen() {
    const newest = Math.max(0, ...view.stories.map((s) => (Number.isFinite(s.time) ? s.time : 0)));
    if (newest) ctx.onSeen?.(newest);
  }

  function renderFooter() {
    const feed = view.feed;
    if (view.loading) {
      return replaceChildren(footer, h("div.mfga-feed-more.mfga-loading", { role: "progressbar", "aria-label": t("feed.loading") }, h("span.mfga-spinner")));
    }
    if (view.error) {
      return replaceChildren(
        footer,
        h(
          "div.mfga-error.mfga-feed-error",
          { role: "alert" },
          h("span", t("feed.error")),
          " ",
          h("button.mfga-btn.mfga-feed-retry", { type: "button", onclick: guard(() => (view.feed ? loadMore() : reload())) }, t("feed.retry")),
        ),
      );
    }
    if (!feed || !feed.exhausted) {
      return replaceChildren(footer, h("button.mfga-feed-more", { type: "button", onclick: guard(() => loadMore()) }, h("i.mfga-feed-more-arrow", { "aria-hidden": "true" }), t("feed.older")));
    }
    if (!view.stories.length) {
      return replaceChildren(footer, h("div.mfga-feed-empty", h("div.mfga-feed-empty-title", t("feed.empty")), h("div", t("feed.emptyHint"))));
    }
    replaceChildren(footer, h("div.mfga-feed-end", t("feed.end")));
  }

  function renderStatus() {
    const sentence = hiddenSentence(ctx.hiddenStats?.());
    status.hidden = !sentence;
    status.textContent = sentence;
  }

  /** Auto-load: the end of the stream is within AUTOLOAD_PX of the viewport (measured after layout). */
  function nearEnd() {
    return footer.isConnected && footer.getBoundingClientRect().top < innerHeight + AUTOLOAD_PX;
  }

  function onSentinel(entries) {
    if (entries.some((e) => e.isIntersecting)) guard(loadMore)({ auto: true });
  }

  function destroy() {
    view.gen++;
    clearInterval(timer);
    sentinel?.disconnect();
    unwatchWithin(el);
    el.remove();
  }
}
