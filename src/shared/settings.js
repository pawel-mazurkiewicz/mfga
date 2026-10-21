// Settings schema, sanitising and the reactive store backed by the platform storage adapter.

export const STORAGE_KEY = "mfga:settings";

export const DEFAULTS = Object.freeze({
  version: 1,
  enabled: true,
  language: "auto", // "auto" | "en" | "pl"
  feed: {
    // What the home page's News Feed shows: "recent" = combined chronological, "top" = Facebook's ranking.
    mode: "recent",
    sources: { friends: true, groups: true, pages: true, favorites: true },
    // false = the 2010 "Older Posts" button; true = load more when scrolling near the end.
    autoLoad: false,
    pageSize: 10,
    previewComments: true,
    hideAI: false,
    keywords: [], // extra phrases: stories whose text contains one are hidden (case-insensitive)
  },
  clean: {
    // Applies to Facebook-rendered feeds (fallback home feed, groups feed, groups, search).
    sponsored: true,
    suggested: true,
    peopleYouMayKnow: true,
    reels: true,
    stories: true,
    groupSuggestions: true,
    memories: false,
    metaAI: true,
  },
  look: {
    shell: true, // 2010 header, left nav, right column, footer
    theme: true, // 2010 colours, fonts and square corners on every page
    skinPosts: true, // 2010 look for Facebook-rendered posts
    fixedHeader: false, // 2010's bar scrolled with the page
    font: "lucida", // "lucida" | "tahoma"
    welcome: true,
    chat: true,
    rightColumn: true,
  },
  advanced: {
    debug: false,
    mainWorldHelper: true,
    stopOnCheckpoint: true,
  },
  state: {
    welcomeDismissed: false,
  },
});

const isPlainObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

/** Returns a full settings object: every key of DEFAULTS present, with the type of its default. */
export function sanitize(input, defaults = DEFAULTS) {
  const out = {};
  const src = isPlainObject(input) ? input : {};
  for (const [key, def] of Object.entries(defaults)) {
    const v = src[key];
    if (isPlainObject(def)) out[key] = sanitize(v, def);
    else if (Array.isArray(def)) out[key] = Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()).slice(0, 200) : [...def];
    else if (typeof v === typeof def) out[key] = v;
    else out[key] = def;
  }
  if (!["auto", "en", "pl"].includes(out.language)) out.language = "auto";
  if (out.feed && !["recent", "top"].includes(out.feed.mode)) out.feed.mode = "recent";
  if (out.feed) out.feed.pageSize = Math.min(30, Math.max(3, Math.round(out.feed.pageSize) || 10));
  if (out.look && !["lucida", "tahoma"].includes(out.look.font)) out.look.font = "lucida";
  return out;
}

function deepMerge(base, patch) {
  if (!isPlainObject(patch)) return patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = isPlainObject(v) && isPlainObject(base[k]) ? deepMerge(base[k], v) : v;
  return out;
}

/**
 * Reactive settings store.
 *   const s = await createSettings(platform); s.get().feed.mode; await s.update({feed: {mode: "top"}});
 *   s.subscribe((settings, prev) => ...)
 */
export async function createSettings(platform) {
  let current = sanitize(await platform.storage.get(STORAGE_KEY).catch(() => undefined));
  const subs = new Set();
  const emit = (prev) => {
    for (const fn of subs) {
      try {
        fn(current, prev);
      } catch (e) {
        console.warn("[MFGA] settings subscriber failed", e);
      }
    }
  };
  platform.storage.onChange((key, value) => {
    if (key !== STORAGE_KEY) return;
    const next = sanitize(value);
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    const prev = current;
    current = next;
    emit(prev);
  });
  return {
    get: () => current,
    async update(patch) {
      const prev = current;
      current = sanitize(deepMerge(current, patch));
      await platform.storage.set(STORAGE_KEY, current);
      emit(prev);
      return current;
    },
    async reset() {
      const prev = current;
      current = sanitize({});
      await platform.storage.set(STORAGE_KEY, current);
      emit(prev);
      return current;
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
