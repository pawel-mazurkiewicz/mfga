# MFGA module contracts

Binding interface spec for every module. Read `docs/ARCHITECTURE.md` first. Research behind the
decisions: `docs/research/*.md` (graphql-protocol, dom-feed, dom-chrome, retro-spec-2010, platform).

## 0. Conventions

* ES modules, plain JavaScript (no TypeScript), no runtime dependencies. Target: Chrome 111+, Firefox 128+.
* Files are owned by exactly one work package (WP). Never edit another WP's files; if you need a change
  there, write it in your hand-back notes.
* Shared foundation (already written, read-only for WPs): `src/ui/dom.js` (`h`, `svg`, `text`, `clear`,
  `replaceChildren`, `joinNodes`, `safeUrl`), `src/shared/util.js` (`safe`, `health`, `log`, `warn`,
  `sleep`, `jitter`, `uuid`, `debounce`, `rafBatch`, `onIdle`, `onRoot`, `onBody`, `normLabel`, `get`),
  `src/shared/settings.js` (`DEFAULTS`, `sanitize`, `createSettings`), `src/shared/i18n.js`
  (`registerStrings`, `t`, `setLocale`, `getLocale`, `relativeTime`), `src/shared/bridge.js`,
  `src/shared/platform.js` (the `Platform` typedef, `basePlatform`), `src/ui/icons.js` (`icon(name)`,
  `iconCss()`, `ICON_NAMES`; names listed in `src/generated/atlas.json`).
* UI strings: each module calls `registerStrings({en:{...}, pl:{...}})` at import time with keys
  prefixed by its area (`feed.*`, `ufi.*`, `nav.*`, `rc.*`, `header.*`, `dialog.*`, `settings.*`,
  `clean.*`). Polish uses 2010 Facebook Polish wording (Aktualności, Najciekawsze, Najnowsze, Lubię to!,
  Komentarz, Napisz komentarz..., Starsze posty, Strona główna, Profil, Konto, Znajomi, Zdjęcia,
  Wydarzenia, Wiadomości, Grupy, Zaczepki, Prośby, Czat ...). Plurals: keys `x.one` / `x.other` (en),
  `x.one` / `x.few` / `x.many` (pl), selected by `t(key, {n})`.
* Errors: wrap every entry point with `safe("<module>", fn)`. Count notable events with
  `health.count("<area>.<event>")`.
* DOM: build with `h()`. Never `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`.
  Links from Facebook data go through `h("a", {href})` (which runs `safeUrl`).
* Facebook DOM: never remove/move Facebook nodes, never set `className`/inline styles on them, only
  `data-mfga-*` attributes. Never write attributes on the feed list's direct children.
* Unit tests: `node:test` + `node:assert/strict` in `test/unit/<area>/*.test.mjs`, runnable with
  `npm test` (no DOM available there — keep DOM-free logic in pure functions and test those).
  Browser tests: `test/e2e/*.test.mjs` using `test/e2e/helpers/browser.mjs` (Playwright + Chromium).

## 1. CSS conventions

* Everything MFGA renders sits under an element with class `mfga-ui` (the shell root, dialogs, the
  stream). Class names: `mfga-<area>-<thing>` (`mfga-story-actor`, `mfga-nav-item`, ...).
* Each area exports its CSS as a function returning a string: `export function xxxCss(settings) {...}`.
  `src/main.js` concatenates them into one `<style id="mfga-style">` element.
* Root state lives in attributes on `<html>` (Facebook owns `html.className`):
  `data-mfga` (present when enabled), `data-mfga-theme`, `data-mfga-shell`, `data-mfga-route`
  (`home` | `groups-feed` | `page`), `data-mfga-feed` (`ours` | `native`), `data-mfga-font`
  (`lucida` | `tahoma`), `data-mfga-fixed-header`, `data-mfga-skin`.
* 2010 palette (canonical): blue `#3B5998`, headNav `#627AAD`, dark border `#29447E`/`#1D4088`,
  link `#3B5998`, text `#333`, meta gray `#808080`, light gray `#999`, separators `#E9E9E9`/`#CCC`,
  selected nav `#D8DFEA`, UFI `#EDEFF4` with `#E5EAF1`/white separators, input border `#BDC7D8`,
  confirm button `#5B74A8` / border `#29447E`, badge `#F03D25`. Font stack:
  `"lucida grande", tahoma, verdana, arial, sans-serif` (tahoma first when `data-mfga-font=tahoma`),
  base 11px, story text 13px. Exact geometry: `docs/research/retro-spec-2010.md`.
* Shared base classes (WP-F provides them in `src/ui/css/base.js`): `.mfga-ui` (font, color, links),
  `.mfga-btn`, `.mfga-btn-confirm`, `.mfga-btn-small`, `.mfga-input`, `.mfga-textarea`, `.mfga-muted`,
  `.mfga-sep` (" · "), `.mfga-box`, `.mfga-box-title`, `.mfga-see-all`, `.mfga-spinner`, `.mfga-pill`,
  `.mfga-badge`, `.mfga-notice` (yellow 2010 info box `#FFF9D7` / `#E2C822`), `.mfga-error`.

## 2. Work packages and their files

| WP | Files (owned) | Summary |
| --- | --- | --- |
| A data-core | `src/data/jsonl.js`, `typenames.js`, `classify.js`, `extract.js`, `text.js`; `test/unit/data-core/**`, `test/fixtures/gql/**` | pure parsing/classification/extraction |
| B data-net | `src/data/harvest.js`, `gql.js`, `ops.js`, `feed-source.js`, `merge.js`, `actions.js`; `test/unit/data-net/**` | tokens, requests, pacing, registry, merge, mutations |
| C stream UI | `src/ui/stream/*.js`, `src/ui/css/stream.js`; `test/unit/stream/**`, `test/e2e/stream.test.mjs` | 2010 story + feed view |
| D shell | `src/ui/shell/*.js`, `src/ui/css/shell.js`, `src/fb/chrome-reader.js`, `src/fb/routes.js`, `src/fb/nav.js`, `src/fb/layout.js`; `test/unit/shell/**`, `test/e2e/shell.test.mjs` | header, left nav, right column, footer, chat tab, layout |
| E native | `src/fb/cleaner.js`, `src/fb/skin.js`, `src/fb/labels.js`, `src/ui/css/theme.js`, `src/ui/css/native.js`; `test/unit/native/**`, `test/e2e/native.test.mjs` | DOM junk cleaning, native post skin, theme tokens |
| F dialog | `src/ui/css/base.js`, `src/ui/dialog/*.js`; `test/unit/dialog/**`, `test/e2e/dialog.test.mjs` | base CSS, 2010 dialog, settings, health/diagnostics |
| G platform | `src/main.js`, `src/page/main-world.js`, `src/background/background.js`, `platform/**`, `scripts/**`, `test/e2e/build.test.mjs` | boot, targets, build |
| H harness | `test/e2e/helpers/**`, `test/fixtures/site/**`, `test/e2e/fullpage.test.mjs` | fake facebook.com + mock GraphQL server + end-to-end tests |

## 3. WP-A data-core (pure)

```js
// src/data/jsonl.js
parseLines(text: string): object[]            // strips "for (;;);", ignores blank/partial lines
stitch(payloads: object[]): { data: object|null, errors: object[], final: boolean }
  // Relay incremental delivery: payload w/o label/path = root (deep-merge into data);
  // @stream (label contains "$stream$" or last path elem is a number not yet present): parent[idx] = data;
  // @defer: deep-merge data into object at path; arrays replaced; final = any extensions.is_final.
deepMerge(a, b): object

// src/data/typenames.js
restoreTypenames(root: any, pairs: Array<[string, string]>): any   // in place; obfuscated -> real

// src/data/classify.js
export const REASONS: string[]
export const NON_STORY_UNITS: Set<string>
export const CATEGORY_NUMBERS: Record<string, number>   // FeedStoryCategory enum
createClassifier({ sha256Hex = webCryptoSha256Hex, hideAI = false } = {}):
  { classify(edge): Promise<{ keep: boolean, reason: string, category: string|null }> }
  // order and rules: ARCHITECTURE §3.3 and graphql-protocol §6.4 exactly. Never inspect
  // attached_story subtrees for markers. Depth-bounded search (<= 40). Unknown categories are dropped;
  // "UNDECODABLE" and null are kept.

// src/data/extract.js
extractStory(node: object, opts?: { sources?: string[] }): Story|null   // Story per ARCHITECTURE §3.2
extractComment(node: object): Comment|null
  // Comment = { id, author: {id, name, url, avatar}, text, ranges, time, reactions, replies }
cleanPermalink(url): string|null          // strips __cft__[0], __tn__, mibextid, fbclid; absolute URL
unwrapLinkShim(url): string|null          // l.facebook.com/l.php?u=... -> target (http/https only)

// src/data/text.js
textSegments(text: string, ranges: Range[]): Array<{ text: string, url?: string, kind?: string }>
  // UTF-16 offsets, overlapping/out-of-range ranges ignored, external links unwrapped
matchesKeywords(story: Story, keywords: string[]): boolean   // case-insensitive, NFKC, text+title+shared
```

## 4. WP-B data-net

```js
// src/data/harvest.js
parseSjs(json: any, sink: Harvest): void   // pure: walks one decoded data-sjs JSON tree
createHarvest(): Harvest                   // pure store
  // Harvest: { tokens: {dtsg, lsd, userId, name, shortName, site: {...}}, preloaders: Map<queryName,
  //   {queryID, variables, preloaderID}>, prefetched: Map<preloaderID, payload[] (sorted by sequence)>,
  //   env: {typenamePairs: [string,string][], keys: string[]}, routeProps: object|null }
startHarvest({ onUpdate }): Harvest        // DOM: MutationObserver at document_start on
  // script[type="application/json"][data-sjs] and script#envjson + one sweep at DOMContentLoaded;
  // also reads the c_user cookie for userId when inline data lacks it.

// src/data/gql.js
jazoest(token: string): string
class GqlError extends Error { code: number|null, kind: "auth"|"token"|"stale-doc"|"variables"|
  "field"|"rate"|"soft-block"|"checkpoint"|"network"|"server" }
createGqlClient({ platform, harvest, minGapMs = 1500, onHalt }):
  { request(friendlyName, docId, variables): Promise<{ data, errors, lines }>,
    halted: boolean, stats(): object }
  // single request in flight, jittered spacing, waits while document.hidden, token-error refresh +
  // one retry, checkpoint/account-warning markers -> halt everything and call onHalt(reason)

// src/data/ops.js
export const FALLBACK_DOC_IDS: Record<string, string>   // graphql-protocol §14, newest per op
createOpRegistry({ platform, harvest }):
  { get(name): Promise<{ docId, variables: object|null, source: string }|null>,
    invalidate(name, docId): void, learn(name, docId, variables, source): void,
    snapshot(): object }
  // order: SSR preloader -> background-learned -> persisted cache ("mfga:ops") -> MAIN-world probe
  // (platform.page?.requireOp) -> FALLBACK_DOC_IDS. Persist learned/probed ids with timestamp.

// src/data/feed-source.js
export const FEED_STYLES = { friends: "MOST_RECENT_FRIENDS_FEED", groups: "MOST_RECENT_GROUPS_FEED",
  pages: "MOST_RECENT_PAGES_FEED", favorites: "FAVORITES_FEED", all: "MOST_RECENT_FEED_DEFAULT",
  top: "DEFAULT" }
createFeedSource({ name, client, ops, harvest, classifier, scale }):
  { name, done: boolean, next(): Promise<{ stories: Story[], dropped: Record<string, number> }>,
    reset(): void }
  // CometModernHomeFeedQuery with the preloader's variables; override feedStyle/orderby
  // (top: ["TOP_STORIES"], others ["MOST_RECENT"]), feedEndCursor, refreshMode "COLD_START",
  // scale = max(2, preloader scale). First page from harvest.prefetched when the preloader's own
  // feedStyle matches. Stops on has_next_page false, null or repeated cursor.

// src/data/merge.js
createMergedFeed({ sources: FeedSource[], pageSize = 10, keywords = [] }):
  { more(): Promise<Story[]>, exhausted: boolean, stats(): object }
  // watermark merge (graphql-protocol §9): emit only stories newer than every unfinished source's
  // oldest buffered story; fetch from the source holding the watermark; dedup by key, union `sources`.

// src/data/actions.js
export const REACTIONS = { LIKE: "1635855486666999", LOVE: "1678524932434102", CARE: "613557422527858",
  HAHA: "115940658764963", WOW: "478547315650144", SAD: "908563459236466", ANGRY: "444813342392137",
  NONE: "0" }
createActions({ client, ops, harvest }):
  { react(story, reactionId): Promise<{ ok, reactions?, viewerReaction? , error? }>,
    comment(story, text): Promise<{ ok, comment?: Comment, error? }>,
    comments(story, cursor?): Promise<{ ok, comments: Comment[], cursor, hasMore, error? }>,
    can(action): Promise<boolean> }   // whether a doc_id is available for that action
```

## 5. WP-C stream UI

```js
// src/ui/stream/story.js
renderStory(story: Story, ctx: StreamCtx): HTMLElement      // <div class="mfga-story" data-key=...>
// StreamCtx = { actions, settings, me: {name, avatar, url}|null, open(url, {newTab}), now(): number }
// src/ui/stream/feed-view.js
createFeedView(ctx: FeedViewCtx): { el: HTMLElement, reload(): Promise<void>, destroy(): void }
// FeedViewCtx = StreamCtx & { getFeed(mode, sources): {more(): Promise<Story[]>, exhausted},
//   mode: "recent"|"top", onModeChange(mode), openComposer(): void, hiddenStats(): object,
//   onDismissWelcome(): void }
export function streamCss(settings): string
```
Story layout per retro-spec §5.4–5.5: 50px avatar, bold blue actor (+ " ▸ " + target), inline 13px
message with links, attachments (photo grid ≤4 with "+N", album, inline `<video controls preload=none>`
on click of the poster, link card, event, shared story indented with its own actor/time), meta line
"time · Comment · Like/Unlike · Share", UFI box (#EDEFF4): "You and N others like this." /
"N people like this.", "View all N comments", comments (32px avatar), "Write a comment..." box that
expands on focus and submits on Enter (Shift+Enter newline). Optimistic like/unlike; on failure revert
and show the permalink. Feed view: "News Feed" header (icon + title), "Top News · Most Recent" switch,
"What's on your mind?" box (calls `openComposer`), optional 2010 welcome box, stories, "Older Posts"
button (or auto-load when `settings.feed.autoLoad`), loading/empty/error states, and a small status line
with how many ads/suggestions were hidden.

## 6. WP-D shell

```js
// src/fb/routes.js
classifyRoute(loc = location): { mode: "home"|"groups-feed"|"page", filter: string|null, sk: string|null, path }
onRouteChange(cb): () => void       // URL polling (250ms) + popstate; calls cb(route, prevRoute)
// src/fb/nav.js
createNavigator({ platform }): { go(url, { hard = false } = {}): void }
  // platform.page.navigate (pushState + popstate in MAIN world) -> click a native anchor with the same
  // pathname+search inside Facebook's root -> location.assign. hard=true -> location.assign.
// src/fb/chrome-reader.js
createChromeReader({ platform }): { identity(), counts(), shortcuts(), birthdays(), contacts(),
  subscribe(cb), refresh() }
  // reads FB's (hidden) banner, left rail, right rail; caches rail data in storage ("mfga:rail") for
  // routes without rails (?filter=). counts: {notifications, messages, friendRequests} numbers|null.
// src/fb/layout.js
createLayout({ settings }): { apply(route), measure(), destroy() }
  // sets html data attributes, positions [role=main] (relative left/top delta) on 3-column routes,
  // inserts #mfga-shell before Facebook's mount root, z-index 0.
// src/ui/shell/*.js
createShell(ctx: ShellCtx): { el: HTMLElement, update(state), destroy() }
// ShellCtx = { settings, reader, navigator, openSettings(), stats(): object, route }
export function shellCss(settings): string
```

## 7. WP-E native

```js
// src/fb/labels.js   locale dictionaries for detection (en, pl, + zbluebugz/webcleaner lists)
// src/fb/cleaner.js
startCleaner({ settings, route, onStats }): { setRoute(route), stop(), stats() }
// src/fb/skin.js
startSkin({ settings }): { stop() }
// src/ui/css/theme.js
themeCss(settings): string     // Facebook theme-token overrides under html[data-mfga-theme]
// src/ui/css/native.js
nativeCss(settings): string    // hide rules ([data-mfga-hide], :has()), native-post 2010 restyle
```

## 8. WP-F dialog

```js
// src/ui/css/base.js
baseCss(settings): string
// src/ui/dialog/dialog.js
openDialog({ title, body: Node, buttons: [{label, primary, onClick}], width = 465 }): { close() }
// src/ui/dialog/settings-dialog.js
openSettingsDialog({ settings, healthSnapshot(): object, exportReport(): object }): { close() }
export function dialogCss(): string
```

## 9. WP-G platform and build

* `src/main.js`: `export async function boot(platform)` — the only place that wires modules together.
* `src/page/main-world.js`: MAIN-world helper (bridge server: `requireOp`, `navigate`).
* `src/background/background.js`: webRequest learner + `runtime.onMessage` (`getLearnedOps`).
* `platform/extension/{chrome,firefox}`: manifests, content entry (`boot(chromePlatform)`).
* `platform/userscript`: metadata block + entry (`boot(userscriptPlatform)`).
* `scripts/build.mjs`: esbuild bundles → `dist/`.

## 10. WP-H harness

* `test/e2e/helpers/browser.mjs`: `launch({ extension?: boolean, userscript?: boolean })` → Playwright
  context with `https://www.facebook.com/*` served from `test/fixtures/site/` and `/api/graphql/`
  answered by `test/e2e/helpers/mock-graphql.mjs` (JSON-lines, per feedStyle, cursors, mutations).
* Fixture pages reproduce Facebook's 2026 structure (dossiers), including SSR `data-sjs` blocks,
  `#envjson`, banner/rails/main with `[aria-posinset]` units (organic, sponsored, suggested, reels,
  stories tray), so every module can be exercised end to end.
