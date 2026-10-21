# MFGA architecture

MFGA ("Make Facebook Great Again") turns the 2026 React/Comet Facebook into the 2010 Facebook: the 2010
shell (blue bar, left nav, right column, footer), the 2010 story look, and a News Feed that contains only
friends, groups and pages — no ads, no "Suggested for you", no reels, no People You May Know.

One codebase, three targets:

| Target | Output | Notes |
| --- | --- | --- |
| Tampermonkey / Violentmonkey | `dist/mfga.user.js` | see `platform/userscript/` |
| Chrome / Edge (MV3) | `dist/chrome/`, `dist/mfga-chrome.zip` | isolated content script + tiny MAIN-world helper + background |
| Firefox (MV3, 128+) | `dist/firefox/`, `dist/mfga-firefox.zip` | same, `background.scripts`, `content.fetch` |

Research behind every decision lives in `docs/research/` (summaries of the dossiers).

---

## 1. Design rules (non-negotiable)

1. **Patch nothing in Facebook's page.** Facebook 2026 ships anti-tamper code (`GHLDetectionUtils`,
   logger `ad_blocker_defense_ghost_owl`) that detects patched `JSON.parse`, `XMLHttpRequest` and its
   getters, `Function.prototype.call/toString`, `String`, canvas `fillText`, and extension URLs in error
   stacks, and restores natives from a hidden iframe. MFGA never wraps or replaces any page global.
   We *read* inert inline JSON, *issue our own* same-origin requests, and *hide* with CSS.
2. **Never move or remove React-owned nodes.** We add `data-mfga-*` attributes (React rewrites
   `className`; it does not touch unknown attributes), we add our own nodes, and we hide with one
   stylesheet. Grafts inside a post are idempotent because Facebook unmounts/remounts virtualised posts.
3. **No attributes on the feed list's direct children** (measured to stall infinite scroll). Mark the
   `[aria-posinset]` element's first child and hide with `:has()`.
4. **CSS first.** Hiding and restyling go through `data-mfga-*` selectors and Facebook's own theme tokens.
5. **No `innerHTML`, ever.** All UI is built with `h()` (`src/ui/dom.js`). Facebook data is untrusted and
   always rendered as text nodes or attribute values that went through `safeUrl()`.
6. **Stable anchors only:** ARIA roles/labels (multi-language dictionary), `aria-posinset`,
   `data-virtualized`, `data-ad-rendering-role`, `data-ad-preview`, `data-focus-target`, URL shapes,
   `__tn__` codes, theme tokens, geometry. Never Facebook's atomic class names.
7. **Fail open, visibly.** Every module runs in `safe()`; an exception disables that module for the page
   lifetime and is recorded in the health panel. Unparseable data is passed through, never guessed at.
8. **Behave like a person.** One GraphQL request in flight, ≥1.5 s jittered spacing, fetch only on user
   intent ("Older Posts" or scroll), nothing while the tab is hidden, stop everything on checkpoint markers.

---

## 2. Runtime layout

```
facebook.com tab
├─ isolated world (content script / userscript sandbox) — EVERYTHING lives here
│   src/main.js            boot: settings → theme CSS → harvesters → route loop → shell/feed/cleaner
│   src/data/*             SSR harvest, GraphQL client, JSONL/Relay stitcher, classifier, extractor, merge
│   src/fb/*               read Facebook's chrome (identity, counts, shortcuts), routes, cleaner, skin
│   src/ui/*               2010 shell, stream renderer, dialog, settings, icons, CSS
├─ MAIN world (optional, read-only)  src/page/main-world.js
│   requireLazy(['<Op>_facebookRelayOperation']) → doc_id, posted back over the bridge. Nothing else.
└─ extension background (Chrome + Firefox only)  src/background/background.js
    webRequest.onBeforeRequest(requestBody) on /api/graphql/ → learn {friendlyName → doc_id, variables}
    of Facebook's own requests (invisible to page JS); answers registry queries from the content script.
```

The isolated world talks to the MAIN-world helper over `src/shared/bridge.js` (CustomEvent on `document`,
JSON-string detail). The event names come from a random per-load channel id: both sides run before any page
script, in either order; whichever runs first writes the id to `<html data-mfga-channel>`, the other reads it
and removes the attribute at once, so page scripts never see it. The MAIN side captures `dispatchEvent`,
`CustomEvent`, the `detail` getter and `JSON` at load. The helper is used only while
`advanced.mainWorldHelper` is on; the userscript does not plant it at all when that switch (or MFGA) is off.

Signed out (no `c_user`/`i_user` cookie: the login page, public pages after Log Out) MFGA only re-themes
Facebook's page: no shell, no News Feed, and the rail cache (`mfga:rail`, which is bound to one account id)
is deleted. The background learner stores only the variables' shape of a capture; post, group, actor,
tracking, cursor and session values are blanked (`src/background/scrub.js`) and captures expire after 30 days.

---

## 3. Data path (combined News Feed)

```
inline <script type="application/json" data-sjs> + #envjson ──► data/harvest.js
      tokens {dtsg, lsd, userId, siteData}, preloaders {queryName → {queryID, variables}},
      prefetched payloads {preloaderID → [payload…]}, env {q9k7m2x pairs}
                │
data/ops.js  ◄──┘ op registry: preloaders > background-learned > MAIN-world probe > fallback table
                │
data/gql.js     POST /api/graphql/ (form body, x-fb-friendly-name, x-fb-lsd) → text
data/jsonl.js   parseLines → stitch (@stream: set list[i]; @defer: deep-merge at path)
data/typenames  restore obfuscated __typename pairs from Env.q9k7m2x
data/classify   edge → KEEP | DROP(reason)   (typename, SponsoredData, cat_sensitive sha256, suggestions)
data/extract    node → Story (normalized model below)
data/feed-source one Feeds-tab connection (feedStyle) with its own cursor
data/merge      k-way watermark merge of N sources by creation_time, dedup by postId
                │
ui/stream/*     Story → 2010 DOM; actions via data/actions.js (react, comment, comments list)
```

### 3.1 Feed modes (home page center column)

| Mode (UI label) | Sources | Request |
| --- | --- | --- |
| **Most Recent** (default) | friends, groups, pages, favorites (each toggleable) | `CometModernHomeFeedQuery`, `feedStyle` ∈ {`MOST_RECENT_FRIENDS_FEED`, `MOST_RECENT_GROUPS_FEED`, `MOST_RECENT_PAGES_FEED`, `FAVORITES_FEED`}, `orderby:["MOST_RECENT"]`, paged with `feedEndCursor` |
| **Top News** | Facebook's ranking | same query, `feedStyle:"DEFAULT"`, `orderby:["TOP_STORIES"]` |
| Friends / Groups / Pages / Favorites (left nav) | one source | as above, single connection |

Variables are the page's own SSR preloader variables with only `feedStyle`, `orderby`, `feedEndCursor`,
`refreshMode:"COLD_START"` and `scale` (raised to ≥2 for crisp 50px avatars) overridden. Page 1 of the
filter the user landed on is read straight from the SSR payload (zero requests).

If no usable query descriptor exists (no preloader, nothing learned yet) the home page shows Facebook's
own feed, cleaned and re-skinned (§4), and the status box explains why; "News Feed" then does a hard
navigation to `/` so the next load carries a preloader.

### 3.2 Story model (`src/data/extract.js`)

```js
/** @typedef {Object} Story
 * @property {string} key            dedup key: postId || nodeId || dedupKey
 * @property {string|null} postId
 * @property {string|null} nodeId
 * @property {number|null} time       unix seconds
 * @property {string|null} url        permalink with __cft__/__tn__/mibextid stripped
 * @property {Actor[]} actors         [{id, name, url, type:'User'|'Page'|...}]
 * @property {string|null} avatar     best (largest) actor profile picture uri
 * @property {Target|null} target     {type, id, name, url}  ("Actor ▸ Group")
 * @property {string|null} title      group post title, if any
 * @property {string|null} text
 * @property {Range[]} ranges         [{offset, length, url, kind:'user'|'page'|'hashtag'|'link'|'other'}]
 * @property {Attachment[]} attachments
 * @property {Story|null} shared      attached (re-shared) story, already normalized, never classified
 * @property {Feedback} feedback      {id, reactions, comments, shares, viewerReaction, canComment, topReactions}
 * @property {string|null} groupId    owning group id (needed by the comment mutation) or null
 * @property {string|null} tracking   story's encrypted_tracking (reaction mutation)
 * @property {string[]} sources       feeds the story came from ('friends','groups',...)
 * @property {string|null} audience   privacy description, if present
 * @property {boolean} ai             AI-generated label present
 */
/** Attachment =
 *  {kind:'photo', items:[{uri, width, height, href, alt}], total}         (single photo or album)
 *  {kind:'video', poster, sd, hd, width, height, href, duration, live}
 *  {kind:'link', url, title, description, source, image}
 *  {kind:'event', url, title, when}
 *  {kind:'unavailable'}  {kind:'other', href} */
```

### 3.3 Edge classifier (`src/data/classify.js`)

Order (first hit wins, `attached_story` subtrees excluded from every search):
`no-node` → `unit:<typename>` (anything not `Story`) → `sponsored-data` (`__typename:"SponsoredData"`
anywhere, any key) → `category:<NAME>` (plain `category`, `cat_sensitive.cat`, or decoded
`cat_sensitive.enc == sha256hex(sha256hex(post_id) + n)`; keep ORGANIC / ENGAGEMENT / undecodable) →
`sponsored-label` (`CometStorySponsoredLabelStrategy`) → `auction-distance` (non-null under any known
alias) → `unconnected` (`unconnected_waist_data`) → `recommended` (`recommendation_context`) →
`follow-suggestion` (`CometFeedStoryFollowButtonStrategy` in the title section) → `join-suggestion`
(`GroupJoinForumAction` + `CAN_JOIN`) → optional `ai` → KEEP. `*GHLMocked*` / `ghl_mocked_*` decoys are
never signals. Every decision is counted for the health panel.

### 3.4 Actions (`src/data/actions.js`)

| Action | Operation | Notes |
| --- | --- | --- |
| Like / Unlike | `CometUFIFeedbackReactMutation` | `feedback_reaction_id` `1635855486666999` / `"0"`; optimistic UI, reconcile from echo |
| Comment | `useCometUFICreateCommentMutation` | `groupID` = story.groupId or null; fresh `client_mutation_id`, `idempotence_token:"client:"+uuid` |
| View comments | `CommentsListComponentsPaginationQuery` | lazy; paced through the same request queue |

Each needs a doc_id from the op registry; without one the link degrades to "open the post" (permalink).
The variable templates come from the most recent capture of that operation (background learner) or the
built-in 2026-09 template with ids replaced.

---

## 4. Native path (Facebook-rendered feeds and every other page)

* `src/fb/cleaner.js` — junk detection on `[aria-posinset]` units: ad info link (`?__cft__` without
  `__tn__`), `/ads/about`, decoded byline label (SVG `<use>` chain, shuffled spans, aria-labelledby
  cache), route-gated Follow/Join/Add-friend in the first heading, Reels grid, Stories tray
  (`data-focus-target="stories_tray"`), People You May Know, group suggestions, Meta AI. Hides by marking
  the unit's first child `data-mfga-hide` and a `:has()` rule. Never within 1200 px of the page bottom.
* `src/fb/skin.js` — tags parts of native posts (`data-mfga-part="avatar|name|message|actions|..."`) so
  the 2010 stylesheet can restyle them (square 50px avatars, blue bold names, text-link action bar,
  #EDEFF4 comment area).
* Theme tokens (`--web-wash`, `--card-background`, `--primary-text`, `--blue-link`, `--card-corner-radius`,
  `--body-font-family`, `--body-font-size`, …) are overridden on `html[data-mfga-theme]` so *every*
  Facebook page renders in 2010 colours, Tahoma/Lucida Grande 11–13px and square corners.

---

## 5. Shell (the 2010 chrome)

Route modes (`src/fb/routes.js`): `home` (`/`, `/home.php`, `/?filter=…&sk=h_chr`, `/?sk=…`) gets the full
three-column 2010 page; `groups-feed` (`/groups/feed/`) gets left nav + native feed; every other route
gets the 2010 header + footer over Facebook's own (re-themed) page.

* Our nodes live in `#mfga-shell`, a sibling of Facebook's React root inside `<body>`.
* Facebook's banner, left rail and right rail are hidden by stylesheet; dialogs, popovers, menus and chat
  windows (portalled outside `[role=main]`) are never hidden or covered.
* `--header-height` is overridden to the 2010 bar height so Facebook reserves exactly our bar's space.
* On 3-column routes `[role="main"]` is clamped to 520px and placed into the 980px grid with
  `position:relative; left:Δx; top:Δy` (measured, re-measured on resize/route change). Relative
  positioning does not create a containing block for fixed descendants, unlike `transform`.
* On `home` with our feed active, Facebook's own home column children are hidden and `#mfga-stream` is
  inserted as the first child of `[role=main]`.
* Data shown in the shell (name, avatar, unread counts, groups/pages shortcuts, birthdays, contacts) is
  read from Facebook's hidden chrome by `src/fb/chrome-reader.js`; clicks delegate to Facebook (native
  anchor click for SPA navigation, else `location.assign`).

---

## 6. Settings

Stored as one JSON object (`mfga:settings`) through the platform storage adapter (`chrome.storage.local`
in the extension, `GM_getValue/GM_setValue` (or async `GM.getValue/GM.setValue`) in the userscript, and as
a last resort facebook.com's `localStorage`, where Facebook can read it: then only the settings are kept, without
the keyword list, and the rail cache and op templates live in memory only).
Schema and defaults: `src/shared/settings.js`. The settings dialog is a 2010 `pop_dialog`.

## 7. Diagnostics

The settings dialog has a **Health** tab: tokens found (names only), preloaders seen, op registry
sources, requests made, classifier counts by reason, category decode rate, DOM detector hit counts,
errors per module, and an **Export report** button producing an anonymised JSON skeleton (key names,
typenames, counts — never text, names, ids or URLs) suitable for a GitHub issue.
