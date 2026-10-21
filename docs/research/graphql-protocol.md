# MFGA research dossier: Facebook Comet GraphQL feed protocol (2026)

Author: research subagent, compiled 2026-10-21. Audience: MFGA implementers who cannot open a logged-in Facebook.

Scope:
- (a) remove ads and suggested edges from responses
- (b) build one chronological friends + groups + pages + favorites feed by replaying the page's own feed query
- (c) render stories ourselves from the data
- (d) Like, Unlike and comment from our UI

How to read this:
- Every fact carries a source tag `[S#]` (index in §17) and a confidence label.
- **HIGH**: seen in a 2025-2026 primary artifact (Facebook's own JS, a live capture, or a live fetch), or in two independent 2026 sources.
- **MED**: one credible 2025-2026 secondary source, or an older primary source that still matches 2026 data.
- **LOW**: older than 2024, a single unverified source, or partly guessed.
- **INFERRED**: reasoning, not observation. The reasoning is given.
- Anything sourced before 2024 is flagged **STALE?**.

Samples cited as `samples/<file>` are in `/tmp/claude-0/-home-user-mfga/80791cd0-cb87-5148-8f51-26da76f4aa2e/scratchpad/research/samples/`. They are listed in §16.

---

## 0. TL;DR: decisions for implementers

1. **Hook nothing in the page.** Facebook's anti-adblock code ("GHL", logger category `ad_blocker_defense_ghost_owl`) does several things (§8):
   - It detects patched `JSON.parse`, `XMLHttpRequest`, the XHR `response`/`responseText` getters, `String`, `Function.prototype.call`/`toString` and `CanvasRenderingContext2D.fillText`.
   - It looks for extension URLs (`chrome-extension://`, `moz-extension://`, `<anonymous>:N`) in the stack traces of `JSON.parse` and `XMLHttpRequest.send`.
   - It re-installs clean natives taken from a hidden iframe.

   MFGA renders its own feed, so it does not need to edit Facebook's responses at all. Hide Facebook's feed column with CSS. Fetch the data with our own requests. Parse it in our own (isolated) world. [S6 HIGH, live 2026-10-21]
2. **Tokens and query descriptors are readable from the DOM. No `require()` is needed.**
   - Tokens are in the HTML's inline JSON as `["DTSGInitData",[],{"token":…}]`, `["DTSGInitialData",[],{"token":…}]`, `["LSD",[],{"token":…}]`, `["CurrentUserInitialData",[],{"USER_ID":…}]` and `["SiteData",[],{…"__spin_r"…}]`.
   - Query descriptors are in the same HTML as `"preloaders":[{"actorID","preloaderID":"adp_<Op>RelayPreloader_<hex>","queryID":"<doc_id>","variables":{…},"queryName":"<Op>"}]`.

   [S3 HIGH live 2026-09; S6 HIGH live 2026-10-21 (logged-out shape)]
3. **The Feeds-tab filter is the `feedStyle` variable on the same home-feed operations.** The operations are `CometModernHomeFeedQuery` (first page) and `CometNewsFeedPaginationQuery` (next pages). With `sk=h_chr`, Facebook sets `orderby:["MOST_RECENT"]` and one of:

   | Filter | `feedStyle` | Numeric route id |
   |---|---|---|
   | all | `MOST_RECENT_FEED_DEFAULT` | 16 |
   | favorites | `FAVORITES_FEED` | 12 |
   | friends | `MOST_RECENT_FRIENDS_FEED` | 17 |
   | groups | `MOST_RECENT_GROUPS_FEED` | 18 |
   | pages | `MOST_RECENT_PAGES_FEED` | 19 |

   [S5 HIGH; Facebook source ~2025-10 (`CometHomeRootEntryPointVariables.getCometFeedVariablesForSk`). Corroborated by S18 for friends (~2024) and S8 for all (~2026).]
4. **Replay variables verbatim.** Take the SSR preloader's `variables`. Override only `feedStyle`, `orderby`, and the cursor: `feedEndCursor` for the home query, or `cursor` + `count` for the pagination query.
   - The `__relay_internal__pv__*` keys are required. Leaving one out returns "A server error occurred". [S9 MED]
   - `doc_id`s rotate on every deploy, sometimes within 2 days [S3 HIGH]. Never hard-code them except as a last-resort fallback.
5. **Responses are JSON lines** (Relay `@stream`/`@defer`):
   - line 0: `{data, extensions}`
   - later lines: `{label, path, data, extensions}`
   - the last line has `extensions.is_final: true`

   An edge arriving on a `$stream$` line has `path:["viewer","news_feed","edges",N]`, and `data` is the whole edge. Set `edges[N] = data`. Do not merge into an existing node: index N does not exist yet. One OSS stitcher (tamnd) silently drops these lines. `page_info` arrives on a `$defer$…$page_info` line at `path:["viewer","news_feed"]`. [S4 HIGH, real capture 2026-10-10]
6. **Ad markers in 2026 (field names are obfuscated and rotate):**
   - Sponsored data: the node carries a child object with `__typename:"SponsoredData"`. Its key is aliased: `th_dat_spo` in 2026-10, `daspo_sto` in 2025-10, `sponsored_data` when unaliased.
   - Category: the edge carries `cat_sensitive:{enc:<sha256 hex>, cat:<name|null>}` instead of `category`. To decode: `enc == sha256hex( sha256hex(post_id) + String(n) )` where `n` is the category number; SPONSORED is 5.
   - Match on typenames, not keys. Before matching, apply Facebook's typename-restore table `Env.q9k7m2x` if present.

   [S1 HIGH live 2026-10-12; S4 HIGH 2026-10-10; S5 HIGH algorithm, 2025-10 source; S6 HIGH live 2026-10-21]
7. **"Suggested" (unconnected) markers in 2026:**
   - `…context_layout.story.unconnected_waist_data != null`
   - `…title.story.recommendation_context` is non-null (`ExploreRecommendationContext`)
   - a `CometFeedStoryFollowButtonStrategy` in the title section (follow suggestion)
   - a `GroupJoinForumAction` with `viewer_forum_join_state:"CAN_JOIN"` (join suggestion)

   Non-`Story` feed units (People You May Know, Reels rows, Stories tray, groups-you-should-join, quick promotions…) are dropped by typename (§6.4). [S4 HIGH 2026-10-11; S5 HIGH 2025-10]
8. **Like/Unlike** both use `CometUFIFeedbackReactMutation` (doc `27646120298312844` as of 2026-09-20). Set `input.feedback_reaction_id` to `"1635855486666999"` for Like and to `"0"` to unlike.

   **Comment** uses `useCometUFICreateCommentMutation` (doc `39607465588840384` as of 2026-09-20; it rotated 2026-09-18 → 09-20). The text goes in `input.message.text`. `groupID` must equal the post's group or be `null`. [S3 HIGH, live 2026-09]

---

## 1. Recommended architecture (context for every section below)

```
                ┌──────────── facebook.com tab ────────────────────────────────────────────┐
 document_start │ content script (ISOLATED world)                                          │
                │  • MutationObserver(documentElement) → capture every                     │
                │    <script type="application/json" data-sjs> textContent  (§3.6)         │
                │    and <script id="envjson"> (window.Env source)          (§8)           │
                │  • harvest tokens (§2.5) + preloaders (§3.6)                             │
                │  • CSS: hide FB's feed column (FB's virtualised feed then stops paging)  │
                │  • our fetch('/api/graphql/') POSTs  ───────────────────────────────┐    │
                │  • JSONL parser + Relay stitcher (§3.4) + edge classifier (§6.4)    │    │
                │  • merge scheduler (§9) → 2010 renderer (§10)                       │    │
                │ MAIN world (optional, read-only): require('<Op>_facebookRelayOperation')  │
                │   only for doc_ids absent from preloaders (§11); never patch natives      │
                └───────────────────────────────────────────────────────────────────────────┘
 extension bg   │ webRequest.onBeforeRequest(urls:*://www.facebook.com/api/graphql/*,      │
 (Chrome+FF)    │   ["requestBody"]) → passively learn doc_id/variables/friendly_name of   │
                │   every request FB itself makes (invisible to page JS)           (§11.2)  │
 Firefox only   │ optional webRequest.filterResponseData to edit FB's own responses (§8.6) │
```

Why this shape:
- Facebook's 2026 detection (§8) targets code that modifies page natives.
- Reading `textContent` of inert JSON script tags from a content script, and issuing our own same-origin requests, touches none of the detected surfaces.
- This is **INFERRED** from the detection code [S6]. It has not been tested against a logged-in account by us.

**INFERRED, platform behaviour, verify in the diagnostics build:**
- **Chrome MV3 content scripts.** A `fetch` to the page's own origin carries the page origin and its cookies (Chrome ≥85 content-script fetch model).
- **Firefox content scripts.** Use `content.fetch(...)` or `window.wrappedJSObject.fetch` so the request is made as the page. The plain global `fetch` in a Firefox content script uses the extension principal (different `Origin`/`Sec-Fetch-Site`).
- **Userscript.** Run with `@grant none` / `@inject-into page` (or the manager's page-context fetch) so the request is a normal same-origin XHR/fetch. Do not use `GM_xmlhttpRequest`: it gives `Sec-Fetch-Site: none` and no Origin.

---

## 2. `/api/graphql/` request (task item 1)

### 2.1 Transport
- **Endpoint:** `POST https://www.facebook.com/api/graphql/`. The body is `application/x-www-form-urlencoded`. A GET is a no-op (HTTP 200, 0-byte body). [S3 HIGH, 2026-09]
- **Facebook's own client uses XMLHttpRequest and reads the stream as it arrives** (readyState 3, `responseText` read repeatedly). [S1 HIGH live 2026-10-12; S4 HIGH 2026-10]
- **For our requests**, `fetch` + `await res.text()` is enough. Streaming is optional; incremental rendering is not needed.

### 2.2 Body parameters

| Param | Example / source | Required for our replay? | Notes |
|---|---|---|---|
| `doc_id` | `"28827638856853689"` | **YES** | Persisted-query id. Rotates per deploy (§14). Stale id → error `1570245` [S3]. |
| `variables` | JSON **string** | **YES** | Compact JSON (`JSON.stringify`). Must include every `__relay_internal__pv__*` key the operation declares [S9 MED]. |
| `fb_dtsg` | `DTSGInitialData.token` / `DTSGInitData.token` | **YES** (logged in) | CSRF token. Format in 2026 starts with `NAf…`; "AQ…" is the pre-2024 format [S3 MED]. Rejection codes `1357051` / `1677047` → re-read the token [S3 MED]. |
| `lsd` | `LSD.token` | send it | Also sent as the `x-fb-lsd` header. 3 LSD frames per page; the first one is used [S3]. |
| `fb_api_req_friendly_name` | `CometNewsFeedPaginationQuery` | send it | Must match the `x-fb-friendly-name` header. |
| `fb_api_caller_class` | `RelayModern` | send it | |
| `server_timestamps` | `true` | send it | |
| `av` | viewer id (`USER_ID`) | optional | Acting actor id. Use the profile id; a Page id when acting as a Page. |
| `__user` | `USER_ID` | optional | |
| `__a` | `1` | optional | |
| `__req` | base-36 counter (`1`,`2`,…,`a`,`b`) | optional | Per-page monotonic counter [S14]. |
| `__hs` | `SiteData.haste_session`, e.g. `"20747.HYP:comet_loggedout_pkg.2.1...0"` | optional | Live 2026-10-21 [S6]. |
| `dpr` | `1` / `2` | optional | Device pixel ratio. |
| `__ccg` | `EXCELLENT`/`GOOD`/`MODERATE`/`POOR`/`UNKNOWN` | optional | Connection class. |
| `__rev` | `SiteData.client_revision` (= `server_revision`) | optional | e.g. `1051133768` on 2026-10-21 [S6]. |
| `__s` | `xxxxxx:yyyyyy:zzzzzz` | optional | Session triple (random-looking). |
| `__hsi` | `SiteData.hsi` | optional | e.g. `"7699081856574727250"` [S6]. |
| `__dyn`, `__csr`, `__hsdp`, `__hblp`, `__sjsp` | long base64-ish bitmaps | optional | Loaded-module bitmaps. fbscrape copies the freshest values from Facebook's own last request to look natural [S10]. |
| `__comet_req` | `15` | optional | Equals `SiteData.comet_env` (15 on 2026-10-21) [S6]. |
| `__crn` | `comet.fbweb.CometHomeRoute`, `comet.fbweb.CometGroupDiscussionRoute` | optional | Comet route name [S11, S13]. |
| `jazoest` | `"2" + Σ charCode(token)` | optional for GraphQL (INFERRED) | See §2.4. |
| `__spin_r` / `__spin_b` / `__spin_t` | `SiteData.__spin_r` / `"trunk"` / `SiteData.__spin_t` | optional | |
| `__aaid` | `0` | optional | [S11, S13] |
| `q` | — | no | fbk-only artifact, not a browser field. |

Evidence on which fields are actually required:
- **fbk (live 2026-09)** sends only `fb_api_req_friendly_name, fb_api_caller_class, variables, doc_id, server_timestamps, fb_dtsg, lsd` (+`q`). Reads and mutations succeed. [S3 HIGH]
- **opentabs** sends `av, __user, __a, __comet_req=15, fb_dtsg, lsd, fb_api_caller_class, fb_api_req_friendly_name, variables, server_timestamps, doc_id`. [S12 MED]
- **browser-act (in-page, groups)** sends the full set, but with a **hard-coded wrong `jazoest`** (`22166`), and it works. So jazoest is probably not validated on `/api/graphql/`. [S11 MED, INFERRED]
- **Recommendation:** build the full Comet set from `SiteData`, with a correct `jazoest`. Missing or odd fields are a fingerprint, not an error. Behavioural detection is described in fbk docs/10 and fbscrape [S3, S10].

### 2.3 Headers

| Header | Value | Required? | Source |
|---|---|---|---|
| `content-type` | `application/x-www-form-urlencoded` | YES | S3, S9, S12 |
| `x-fb-friendly-name` | the operation name | send (Facebook always does; omitting it is an anomaly) | S3 HIGH |
| `x-fb-lsd` | the LSD token | send | S3, S9, S11, S12 |
| `x-asbd-id` | `359341` (2026) | optional (fbk omits it and works) | S9 MED. `129477` is an older value, **STALE?** |
| `origin` / `referer` / `sec-fetch-*` | set by the browser | — | A same-origin fetch from the page or content script sets these correctly (§1). |

### 2.4 jazoest
- **Formula:** `jazoest = "2" + sum(token.charCodeAt(i))`. The leading `"2"` is a version marker.
- **Token:** `fb_dtsg` when logged in. On logged-out pages Facebook uses the LSD token.
- **Verified live 2026-10-21 (logged-out):**
  - `LSD.token = "AdR16GsCBuzx6HMHP0pOQzBIMP8"` gives 22177.
  - That matches Facebook's own `__eqmc` blob: `"/ajax/qm/?__a=1&__user=0&__comet_req=15&jazoest=22177"`.
  - [S6 HIGH, computed here]
- The dtsg-based variant is consistent across many 2025-2026 code bases [S19 HIGH].

```js
const jazoest = t => '2' + [...t].reduce((s, c) => s + c.charCodeAt(0), 0);
```

### 2.5 Where the tokens come from

| Value | DOM / inline JSON (readable from an isolated content script) | Page-world module (MAIN world) |
|---|---|---|
| fb_dtsg | `["DTSGInitData",[],{"token":"NAf…","async_get_token":"…"},N]` (primary 2026-09 [S3]); `["DTSGInitialData",[],{"token":"…"},N]` | `require("DTSGInitialData").token` [S12, S11] or `require("DTSGInitData").token` |
| lsd | `["LSD",[],{"token":"…"},N]` | `require("LSD").token` |
| user id | `["CurrentUserInitialData",[],{"ACCOUNT_ID":"…","USER_ID":"…","NAME":"…","SHORT_NAME":…,…,"APP_ID":"2220391788200892"},N]` | `require("CurrentUserInitialData").USER_ID` |
| revision, hsi, haste session, spin | `["SiteData",[],{"server_revision":…,"client_revision":…,"haste_session":"…","hsi":"…","comet_env":15,"__spin_r":…,"__spin_b":"trunk","__spin_t":…},N]` | `require("SiteData")` |
| Env (GHL flags) | `<script id="envjson" type="application/json">{…}</script>` | `window.Env` |

- **Live check 2026-10-21 (logged-out):** both `DTSGInitialData` (empty `{}`) and `DTSGInitData` (`{"token":"","async_get_token":""}`) frames are present.
- **Rule:** try both names; take the first non-empty token. [S6 HIGH] Verbatim frames: `samples/live-loggedout-page-frames-2026-10-21.txt`.
- **Regexes that matched live HTML** (2026-09 per S3; 2026-10-21 per S6):
  - `/"DTSGInitData",\[\],\{"token":"([^"]+)"/` and `/"DTSGInitialData",\[\],\{"token":"([^"]+)"/`
  - `/"LSD",\[\],\{"token":"([^"]+)"/`
  - `/"USER_ID":"(\d+)"/` (take it from `CurrentUserInitialData`)
  - `/"__spin_r":(\d+)/`, `/"haste_session":"([^"]+)"/`, `/"hsi":"([^"]+)"/`
- **Token refresh.** fb_dtsg expires; the token embeds an expiry, per S3 "`NAf…:1:<unix-expiry>`". When an error with code 1357051 or 1677047 appears:
  1. Re-read `DTSGInitData` from new inline JSON (SPA navigations deliver more data-sjs blocks), or
  2. call `require("DTSGInitialData")` in MAIN world.
  3. As a last resort, reload the tab.

  `async_get_token` exists but its endpoint is not documented here (**LOW**).

### 2.6 Minimal request builder (reference implementation, INFERRED composition of verified parts)

```js
async function gql(op, docId, variables, t /* tokens */) {
  const body = new URLSearchParams({
    av: t.userId, __user: t.userId, __a: '1', __req: (t.req = (t.req||0)+1).toString(36),
    __hs: t.hasteSession ?? '', dpr: String(devicePixelRatio|0||1), __ccg: 'GOOD',
    __rev: String(t.rev ?? ''), __hsi: t.hsi ?? '', __comet_req: '15',
    fb_dtsg: t.dtsg, jazoest: jazoest(t.dtsg), lsd: t.lsd,
    __spin_r: String(t.rev ?? ''), __spin_b: t.spinB ?? 'trunk', __spin_t: String(t.spinT ?? ''),
    fb_api_caller_class: 'RelayModern', fb_api_req_friendly_name: op,
    variables: JSON.stringify(variables), server_timestamps: 'true', doc_id: docId,
  });
  const r = await fetch('/api/graphql/', { method: 'POST', credentials: 'include', body,
    headers: { 'content-type': 'application/x-www-form-urlencoded',
               'x-fb-friendly-name': op, 'x-fb-lsd': t.lsd } });
  if (r.status === 302 || r.redirected && /\/(login|checkpoint)/.test(r.url)) throw new Error('auth');
  return r.text();   // JSON-lines → §3
}
```

---

## 3. Response format and reassembly (task item 2)

### 3.1 Shape
- **Body:** one JSON document per line (NDJSON).
- **Line 0 (root):** `{"data":{…},"extensions":{…,"is_final":false}}`.
- **Lines 1…n (incremental payloads):** `{"label":"…","path":[…],"data":{…},"extensions":{…}}`.
- **Last line:** carries `"extensions":{"is_final":true}`.
- **Real 2026-10-10 feed page, 3 lines** [S4 HIGH; `samples/feed-CometNewsFeedPaginationQuery-2026-10-10.trimmed.jsonl`]:
  - line 0: `data.viewer.news_feed.edges[0]`, the first edge.
  - line 1: `label:"CometNewsFeed_viewerConnection$stream$CometNewsFeed_viewer_news_feed"`, `path:["viewer","news_feed","edges",1]`. `data` is the whole edge object (`{brs_content_label, cat_sensitive, deduplication_key, min_gap_type_index_string, sposnsor_new_distac_action, top_story_cache_score, is_ad_eligible_for_ad_pod, node, feed_backend_data, cursor}`).
  - line 2: `label:"CometNewsFeed_viewerConnection$defer$CometNewsFeed_viewer_news_feed$page_info"`, `path:["viewer","news_feed"]`, `data:{"page_info":{"__typename":"PageInfo","end_cursor":"…","has_next_page":true}}`, `extensions.is_final:true`.
- These labels come from the Relay artifact [S5 HIGH, 2025-10]:
  - `@stream(label:"CometNewsFeed_viewerConnection$stream$CometNewsFeed_viewer_news_feed", if:$RELAY_INCREMENTAL_DELIVERY)` on `edges`.
  - `@defer(label:"…$page_info")` on `page_info`.
  - With `RELAY_INCREMENTAL_DELIVERY:false`, expect a single document. **INFERRED**; Facebook always sends `true`.
- **Group feed** [S11 MED]:
  - Root: `data.node.group_feed.edges[]` (+ `page_info`).
  - Stream lines: `label` starts with `GroupsCometFeedRegularStories_paginationGroup$stream`, `path:[…,"edges",i]`, and `data` is the edge.
- **Profile timeline** uses the container key `timeline_list_feed_units` (`data.node.timeline_list_feed_units.edges[]`). [S10 MED]
- **Comments list** (`CommentsListComponentsPaginationQuery`) is a **single JSON document**, with no @stream. [S10 MED]
- **`extensions` keys seen** [S4]:
  - `prefetch_uris_v2[] {uri,label,width,height,surface}`: image URLs Facebook prefetches.
  - `server_metadata {request_start_time_ms, time_at_flush_ms}`
  - `sr_payload.ddd.hsrp.hsdp.ixData` (sprite/icon map)
  - `all_video_dash_prefetch_representations[]`
  - `is_final`

### 3.2 `for (;;);` prefix
- Not normally present on Comet `/api/graphql/` responses.
- It appears on legacy `/ajax/*` endpoints and on the old `graphqlbatch`. [S3 HIGH] HushFacebookWeb: "sometimes behind a `for (;;);` guard" [S4].
- **Always** strip a leading `for (;;);` from each line before `JSON.parse`. It is cheap.

### 3.3 Errors
- Logical errors come back as HTTP 200 with a top-level `errors` array: `{"errors":[{"message","code","severity","description","summary",…}],"data":…}`. [S3, S9]
- An empty or missing `errors` means success.
- Partial data plus non-critical errors can coexist. opentabs throws only if `data` is null. [S12]

| Code | Meaning | Source |
|---|---|---|
| 1357004 | Not logged in | S3 HIGH |
| 1357051 / 1677047 | fb_dtsg expired / invalid → refresh tokens, retry once | S3 MED (verify) |
| 1675012 | Variable coercion: `missing_required_variable_value` / `noncoercible_variable_value` (wrong variable shape; an extra undeclared variable also triggers it) | S3 HIGH (live) |
| 1570245 | Persisted query (doc_id) unknown → re-discover the doc_id | S3 HIGH (live heal log) |
| 1357010 | `field_exception`. Seen for a stale comment doc_id and for a wrong `groupID` on comment create | S3 HIGH (live 2026-09-20) |
| 1675004 | "Rate limit exceeded" message, but actually an allowlist refusal for signed-out callers | S9 MED |
| 1675039 | Query blocked | S12 LOW |
| 1357046 / 1384000 | Rate-limit / checkpoint families (seed knowledge) | S3 LOW |

**Soft-block signature:** a 200 response with an empty or unparseable body, or a feed with no `Story` nodes. Back off. [S3]

### 3.4 Reassembly algorithm (correct for `@stream` and `@defer`)

Relay semantics:
- **`@stream` payload:** `path` ends with a list index; `data` *is* the list item. Set `list[index] = data`, growing the list if needed.
- **`@defer` payload:** `path` names an object; deep-merge `data` into that object.
- **Distinguishing them:** the label (`$stream$` vs `$defer$`), or the shape (the last path element is a number and that index is not yet present).
- **Order:** apply payloads in arrival order. For SSR blocks, order by `sequence_number`.

```js
function parseLines(text) {
  const out = [];
  for (let line of text.split('\n')) {
    line = line.trim(); if (!line) continue;
    if (line.startsWith('for (;;);')) line = line.slice(9).trim();
    try { out.push(JSON.parse(line)); } catch { /* partial trailing line → ignore (stream cut) */ }
  }
  return out;
}
function stitch(payloads) {            // payloads: parsed lines of ONE response, in order
  let root = null; const errors = [];
  for (const p of payloads) {
    if (p.errors) errors.push(...p.errors);
    if (!('label' in p) && !('path' in p)) { root = deepMerge(root ?? {}, p.data ?? {}); continue; }
    if (!root) root = {};
    const path = p.path || [], last = path[path.length - 1];
    const parent = ensurePath(root, path.slice(0, -1));          // creates {} / [] as needed
    if (typeof last === 'number' && (/\$stream\$/.test(p.label || '') || !(last in parent))) {
      parent[last] = p.data;                                       // @stream item
    } else {
      const target = path.length ? (parent[last] ??= {}) : root;
      deepMerge(target, p.data ?? {});                             // @defer fragment
    }
  }
  return { data: root, errors };
}
// deepMerge(a,b): b's leaves win; objects merge recursively; arrays replaced.
```

- Test vector: `samples/reassembly-test-vector.synthetic.jsonl`. It has a root edge, a stream edge carrying an ad, a stream PYMK unit, a nested defer into `edges[0].node.comet_sections`, and the page_info defer.
- webcleaner's test fixture uses a deferred payload `{label:"x$defer$y", path:["viewer","news_feed","edges",5,"node"], data:{…}}` [S1].
- **Pitfalls:**
  - tamnd's `stitch()` drops any fragment whose path names a missing node, so it loses every streamed edge [S9, read in source].
  - subsocial's `applyPatch` handles it correctly [S8].
  - fbk's `merge_docs` ignores `path` entirely. That works only for regex extraction [S3].

### 3.5 The same stitcher works for SSR blocks
Inline `data-sjs` blocks deliver the same payloads wrapped as follows (§3.6):

```
["RelayPrefetchedStreamCache","next",[],["adp_<Op>RelayPreloader_<hex>",{"__bbox":{"complete":false,"result":{<payload>},"sequence_number":N}}]]
```

Group them by preloader id, sort by `sequence_number`, then stitch `result` objects exactly as above. [S4 HIGH 2026-10-10; S6 HIGH 2026-10-21; S9]
- The module name can carry a hash suffix, e.g. `"RelayPrefetchedStreamCache@4a1fb7054d45192b147ad69ff77e2f17"`. Match by prefix. [S9 MED]

### 3.6 Initial page data embedded in HTML

Format, live 2026-10-21 [S6] and 2026-10-10 [S4]:

```html
<script src="data:text/javascript;base64,cmVxdWlyZUxhenkoWyJTZXJ2ZXJKU1BheWxvYWRMaXN0ZW5lciJdLGZ1bmN0aW9uKG0pe20ucHJvY2VzcygpO30sbnVsbCwweDEwMCk=" nonce="…"></script>
   <!-- = requireLazy(["ServerJSPayloadListener"],function(m){m.process();},null,0x100) -->
<script type="application/json" nonce="…" data-content-len="7446" data-sjs>{"require":[["ScheduledServerJS","handle",null,[{"__bbox":{"require":[["RelayPrefetchedStreamCache","next",[],["adp_FDSIntlLocaleSelectorListQueryRelayPreloader_6ad8a2285cb0b2632013957",{"__bbox":{"complete":true,"result":{"data":{…}}, …}}]]]}}]]]}</script>
```

- **Preloader descriptors.** They live in the entry-point renderer's init call, live logged-out 2026-10-21 [S6 HIGH]:

  ```
  ["CometRootEntryPointRenderer","init",["<X>Root.entrypoint","RequireDeferredReference"],
    [{"actorID":"0","cavalryLid":"…","elementId":"mount_0_0_qI",
      "entryPointRoot":{"entryPoint":{"__m":"<X>Root.entrypoint"},…,
         "otherProps":{"routeProps":{…},"routeParams":{…}},"entryPointParams":{…}},
      …,"preloaders":[{"actorID":"0","preloaderID":"adp_<Op>RelayPreloader_<hex>",
                        "queryID":"27915678758041942","variables":{"suggestedLocaleLimit":11},
                        "queryName":"<Op>"}, …]}]]
  ```

  On the logged-in home page this yields 11-12 preloaders [S3 HIGH, 2026-09]: newsfeed, composer, contacts, megaphone, right rail, stories tray, …. The feed one is `adp_CometModernHomeFeedQueryRelayPreloader_<hex>` with `queryID` = the CometModernHomeFeedQuery doc_id and `variables` = the exact SSR variables. [S3 HIGH; S4 HIGH]
- **INFERRED: how routeProps carry the filter.** `CometHomeRoot.entrypoint.getPreloadProps` [S5 HIGH, 2025-10] calls `getCometFeedVariablesForSk(routeProps.feedStyle /*numeric*/, routeParams.sk, "COLD_START")`. So on `/?filter=groups&sk=h_chr` the SSR home preloader's `variables.feedStyle` should be `"MOST_RECENT_GROUPS_FEED"`, and `routeProps.feedStyle` should be `18`.
- **Harvest from the tree, not with fixed indices.** Walk every decoded data-sjs block. Any object with string keys `queryID` and `queryName` is a descriptor. Any array whose `[0]` starts with `RelayPrefetchedStreamCache` is a payload. The nesting moves between routes [S9].
- **Regex fallback (fbk, live 2026-09):**
  ```
  \{"actorID":"(\d+)","preloaderID":"(adp_[A-Za-z0-9_]+RelayPreloader_[0-9a-f]+)","queryID":"(\d{5,})","variables":
  ```
  then raw-decode the `variables` object from the match end and read `queryName` from the next 4 KB. [S3]
- **Timing (INFERRED).** Facebook's `ServerJSPayloadListener` processes these blocks, and Env has `sjsListenerNew:true` [S6]. Whether processed blocks are removed from the DOM is **not verified**. Capture them at `document_start` with a `MutationObserver` on `document.documentElement` (`childList`, `subtree`). Content scripts see parser-inserted nodes. Also scan `document.scripts` once at `DOMContentLoaded`.
- **Clean JSON first.** If any `__typename` is in `Env.q9k7m2x`, apply the typename-restore table (§8.4).

---

## 4. Feed queries (task item 3)

### 4.1 Operations

| Operation | Role | Variables of note | Response root |
|---|---|---|---|
| `CometModernHomeFeedQuery` | Home / Feeds tab **first page**. SSR-preloaded on `/` and `/?filter=…&sk=h_chr` | `feedStyle`, `orderby`, `feedInitialFetchSize`, `feedEndCursor`, `feedClientSession`, `refreshMode:"COLD_START"`, `feedLocation:"NEWSFEED"`, `renderLocation:"homepage_stream"`, `privacySelectorRenderLocation:"COMET_STREAM"`, `feedbackSource:1`, `scale`, `recentVPVs:[]`, `connectionClass`, `useDefaultActor:false`, `shouldObfuscateCategoryField`, `shouldChangeBRSLabelFieldName`, `shouldUseBRSLabelFieldNameV1/V2`, `RELAY_INCREMENTAL_DELIVERY:true`, `__relay_internal__pv__*` | `data.viewer.news_feed.{edges[],page_info}` |
| `CometNewsFeedPaginationQuery` | Next pages of the same connection | as above, minus the feed* names; plus `cursor`, `count` (artifact default 2), `clientQueryId` (uuid), `clientSession`, `experimentalValues`, `focusCommentID` | `data.viewer.news_feed.{edges[],page_info}` |
| `GroupsCometCrossGroupFeedPaginationQuery` | `/groups/feed/` ("Your groups" feed) | — | (container not verified) |
| `GroupsCometFeedRegularStoriesPaginationQuery` | One group's feed | `id` (group id), `count:3`, `cursor`, `sortingSetting`, `feedType:"DISCUSSION"`, `feedLocation:"GROUP"`, `renderLocation:"group"`, `stream_initial_count:1`, `feedbackSource:0` | `data.node.group_feed.edges[]` |
| `ProfileCometTimelineFeedQuery` / `ProfileCometTimelineFeedRefetchQuery` | Profile timeline | — | `…timeline_list_feed_units` |
| `CometFeedFavoritesEndOfFeedMessageQuery` | "No more favorites" end message | — | — |
| `FeedsCometFilterPanelQuery` | Feeds-tab filter panel (list of favorites etc.) | — | — |
| `CommentsListComponentsPaginationQuery` | Comments list | `id`, `commentsAfterCursor`, `commentsAfterCount`, `feedLocation` | `data.node.comment_rendering_instance_for_feed_location.comments` |

Sources and confidence per row:
- `CometModernHomeFeedQuery`: argument list from the artifact [S5 HIGH 2025-10]; values live 2026-09 [S3 HIGH]. See `samples/request-feed-variables-2025-2026.json`.
- `CometNewsFeedPaginationQuery`: artifact [S5 HIGH]; fbk live 2026-09 [S3 HIGH].
- `GroupsCometCrossGroupFeedPaginationQuery`: [S4 MED, 2026-10]. Treat it like the news feed and probe the shape with diagnostics.
- `GroupsCometFeedRegularStoriesPaginationQuery`: [S11 MED, S10 MED].
- Profile timeline queries: [S10 MED; S3 registry 2026-09].
- `CometFeedFavoritesEndOfFeedMessageQuery` and `FeedsCometFilterPanelQuery`: [S3 2026-09; S5 2025-10].
- `CommentsListComponentsPaginationQuery`: [S10 MED 2026].

Notes on the home-feed connection [S5 HIGH, 2025-10]:
- `news_feed` field arguments from the artifact:
  - `after: $cursor` / `$feedEndCursor`
  - `first: $count` / `$feedInitialFetchSize`
  - `client_query_id`, `client_session`, `connection_class`, `experimental_values`, `feed_style`, `orderby`, `recent_vpvs_v2: $recentVPVs`, `refresh_mode`
  - literals: `environment:"DESKTOP"`, `site:"comet"`, `is_setting_suitable_for_autoplay:true`
- The Relay connection key is `CometNewsFeed_viewer_news_feed` with **filters `["orderby","feed_style","client_session"]`**. Each feedStyle/orderby combination is therefore a *separate connection* with its own cursor space. Never reuse a cursor from one filter in another.
- **Paging without the pagination doc_id:** `CometModernHomeFeedQuery` itself accepts `feedEndCursor`. subsocial pages the whole feed with only the home query. [S8 MED] This avoids needing the `CometNewsFeedPaginationQuery` doc_id when its module is not yet loaded. **Recommended primary path.** Fall back to the pagination query if the server ever rejects the cursor.

### 4.2 The Feeds tab (`?filter=…&sk=h_chr`): which variable carries the filter

Verbatim Facebook source, ~2025-10 (module `CometHomeRootEntryPointVariables`, bundle `xqgbZQq2-Ee.js` saved in repo peblo13/21102025) [S5 HIGH]:

```js
function a(a /*routeProps.feedStyle (number)*/, b /*sk*/, e /*refreshMode*/, f /*recentVPVs*/){
  var g=b==="favorites"&&!c("gkx")("20836"), i="DEFAULT";
  if(b==="h_chr")switch(a){case 16:i="MOST_RECENT_FEED_DEFAULT";break;case 12:i="FAVORITES_FEED";break;
    case 17:i="MOST_RECENT_FRIENDS_FEED";break;case 18:i="MOST_RECENT_GROUPS_FEED";break;
    case 19:i="MOST_RECENT_PAGES_FEED";break;case 24:i="MOST_RECENT_FEED_NOTIFICATIONS"}
  else if(g)i="FAVORITES_FEED";else switch(a){case 10:i="SEEN_FEED";break;case 27:i="FRIENDLY_FEED"}
  …
  return{RELAY_INCREMENTAL_DELIVERY:!0,connectionClass:…,feedbackSource:1,feedInitialFetchSize:…,
    feedLocation:"NEWSFEED",feedStyle:i,orderby:g?[]:b==="h_chr"?["MOST_RECENT"]:["TOP_STORIES"],
    privacySelectorRenderLocation:"COMET_STREAM",recentVPVs:f,refreshMode:e,renderLocation:"homepage_stream",
    scale:…,shouldChangeBRSLabelFieldName:j,shouldObfuscateCategoryField:a /*gk*/,shouldUseBRSLabelFieldNameV1:l,
    shouldUseBRSLabelFieldNameV2:k,useDefaultActor:!1}}   // = getCometFeedVariablesForSk
```

| URL | `feedStyle` | `orderby` | Corroboration |
|---|---|---|---|
| `/?filter=all&sk=h_chr` | `MOST_RECENT_FEED_DEFAULT` | `["MOST_RECENT"]` | subsocial uses exactly this for its chronological feed [S8] |
| `/?filter=friends&sk=h_chr` | `MOST_RECENT_FRIENDS_FEED` | `["MOST_RECENT"]` | unplugged iOS app ~2024 [S18] |
| `/?filter=groups&sk=h_chr` | `MOST_RECENT_GROUPS_FEED` | `["MOST_RECENT"]` | ViniciusGularte scraper uses referer `?filter=groups&sk=h_chr` with `orderby:["MOST_RECENT"]` [code search] |
| `/?filter=pages&sk=h_chr` | `MOST_RECENT_PAGES_FEED` | `["MOST_RECENT"]` | — |
| `/?filter=favorites&sk=h_chr` | `FAVORITES_FEED` | `["MOST_RECENT"]` | old `/?sk=favorites`: `FAVORITES_FEED` with `orderby:[]` when gk 20836 is off |
| `/` | `DEFAULT` | `["TOP_STORIES"]` | fbk live 2026-09 [S3] |

- **INFERRED:** the numeric ids (16/12/17/18/19/24) are what the server puts in `routeProps.feedStyle` for each `filter=`. The name-to-number mapping comes from the case labels. MFGA never needs the numbers, because we send the string `feedStyle` directly.
- **Unknown:** whether `MOST_RECENT_FEED_DEFAULT` ("All") contains recommendations or other non-followed content. The user says the filtered feeds are clean apart from ads, and they want all of them at once. Two options:
  - **(A)** Merge the four filtered feeds (§9). That is the user's plan and the most predictable.
  - **(B)** Fetch `MOST_RECENT_FEED_DEFAULT` once and filter strictly (§6.4). One connection instead of four, so fewer requests and lower risk.
  - The diagnostics build should log, for B, how many edges per page the §6.4 classifier drops. Then decide. **INFERRED**, untested.

### 4.3 Edges and `page_info`

Edge keys seen 2026-10-10 [S4 HIGH]:

| Key | Notes |
|---|---|
| `node` | The feed unit |
| `cursor` | Per-edge cursor |
| `cat_sensitive` `{enc, cat}` | Obfuscated `category` (§5.2) |
| `deduplication_key` | String |
| `min_gap_type_index_string` | e.g. `"14"` |
| `top_story_cache_score` | Number |
| `brs_content_label` | Number (e.g. 60, 90) |
| `sposnsor_new_distac_action` | Renamed `sponsored_auction_distance`; null on organic |
| `is_ad_eligible_for_ad_pod` | |
| `feed_backend_data` | `{qid, original_qid, vsid, vspos, should_recent_vpv_fetch_tracking_data, serialized_payloads}` |

- **Unobfuscated (when `shouldObfuscateCategoryField:false`):** `category` is a string from the `FeedStoryCategory` enum (§5.1). [S5 HIGH]
- **`page_info`:** `{__typename:"PageInfo", end_cursor:"<opaque base64-url>", has_next_page:true|false}`. Never edit the cursor. [S3, S4]
- **Termination.** Stop when `has_next_page===false`, or when `end_cursor` is null or repeats (subsocial guards against "Facebook did not advance the feed" [S8]).

### 4.4 SSR preloader for the feed: complete picture
1. On a home or Feeds-tab load, the HTML carries `preloaders[…{queryName:"CometModernHomeFeedQuery", queryID, variables}]`.
2. It also carries the first edges as `RelayPrefetchedStreamCache.next("adp_CometModernHomeFeedQueryRelayPreloader_<hex>", {__bbox:{complete,result,sequence_number}})` blocks. [S4 HIGH 2026-10-10; `samples/home-ssr-data-sjs-RelayPrefetchedStreamCache-2026-10-10.trimmed.jsonl`]
3. MFGA can render page 1 of whichever filter the user loaded straight from these blocks, with zero requests.
4. MFGA then calls the same `queryID` with the other `feedStyle` values and with `feedEndCursor` for later pages.

---

## 5. Story node structure: what to render (task item 4)

Real structure (2026-10, scrubbed): `samples/feed-CometNewsFeedPaginationQuery-2026-10-10.trimmed.jsonl` (friend text post + group share) and `samples/feed-group-posts-ai-label-2026-10-11.trimmed.jsonl` (group posts with album/photo, AI label, Join suggestion).

**Rule:** the same field appears in several places, because every `comet_sections.*.story` is a *partial* projection of the same Story. Prefer the canonical path below, then fall back to a *bounded* deep search. Bounded means: skip `attached_story` subtrees, and skip nested objects that have both `node` and `cursor`.

### 5.1 Identity and timing [S4 HIGH]

| Field | Canonical path(s) | Notes |
|---|---|---|
| typename | `edge.node.__typename` | Must be `"Story"` for posts (§6) |
| story id | `node.id` | Opaque base64 Relay id (`UzpfS…`, base64 of `S:_I…`). Use for dedup when `post_id` is missing. |
| post id | `node.post_id` | Numeric string. **Primary dedup key.** Also the seed for the category hash. |
| creation time | `node.creation_time` (unix seconds); also `node.comet_sections.timestamp.story.creation_time` and `…context_layout.story.comet_sections.metadata[__typename=CometFeedStoryLongerTimestampStrategy].story.creation_time` | Sibling typenames `CometFeedStoryMinimizedTimestampStrategy` and `CometFeedStoryBackdatedTimestampStrategy` [S10] |
| permalink | `node.comet_sections.timestamp.story.url` → `node.permalink_url` → `…feedback_target_with_context.url` → `node.wwwURL` / `node.url` | Strip `__cft__[0]`, `__tn__`, `mibextid` query params [S8] |
| feedback id (react/comment target) | `node.feedback.id`; also `…comet_sections.feedback.story.feedback.id` and `…comet_ufi_summary_and_actions_renderer.feedback.id` | base64 of `feedback:<post_id>` [S3] |
| privacy | `…metadata[__typename=CometFeedStoryAudienceStrategy].story.privacy_scope.description` | [S10] |

### 5.2 Actors and target (group / page)

| Field | Path | Notes |
|---|---|---|
| actors | `node.actors[]` → `{__typename:"User"|"Page"|…, id, name, url, profile_url?}` | 2026-10 [S4] |
| actor photo (50px avatar) | `node.comet_sections.context_layout.story.comet_sections.actor_photo.story.actors[0].profile_picture {uri, width, height, scale}`; also `…content.story.actors[0].profile_picture.uri` | **Observed 2026-10-11:** the actor-photo strategy's picture was `width:24, height:24, scale:1` [S4]. Upscaling a 24 px image to 50 px will look soft. The `content.story.actors[].profile_picture` size is unknown. Open question §15: find a larger source, for example a profile-picture query or Facebook's own `/<id>/picture` redirect. |
| actor URL | `actors[0].url` | e.g. `https://www.facebook.com/<vanity>` |
| post author (fallback) | `node.feedback.owning_profile {__typename,id,name,short_name}` | [S4, S10] |
| target (group, or a wall post to a person) | `node.to {__typename:"Group", id, url, …}`; name and picture at `…actor_photo.story.to {__typename:"Group", id, name, profile_picture.uri}`; also `…content.story.target_group {id}` and `…story_ufi_container.story.target_group {id, visibility, privacy_info}` | Render 2010-style as "Actor ▸ Group" |
| group-post attribution | `…metadata[] __typename:"CometStoryCommunityAttributionGroupPostByStrategy"` with `story.actors[]` + `story.to{Group}`; actor-photo strategy `CometFeedStoryActorCommunityAttributionStrategy` | [S4] |
| title strategy | `…context_layout.story.comet_sections.title {__typename:"CometFeedStoryTitleWithActorStrategy", story:{actors[], to, title, comet_sections:{action_link, follow_button}, recommendation_context}}` | Suggestion markers live here (§6) |

### 5.3 Message text and entities

| Field | Path | Notes |
|---|---|---|
| text | `node.comet_sections.content.story.message.text` (`TextWithEntities`) → `…content.story.comet_sections.message.story.message.text` → `…content.story.comet_sections.message_container.story.message.text` | [S4 HIGH, S10] |
| ranges | `…content.story.comet_sections.message.story.message.ranges[] {offset, length, entity:{__typename:"User"|"Page"|"Hashtag"|"ExternalUrl"|…, id?, url?, external_url?, web_link:{__typename:"ExternalWebLink", url, fbclid}}}` | Hashtag entities have only `url`; take the name from the last URL segment [S10]. **INFERRED:** offsets/lengths are JS (UTF-16) indices. Verify with emoji posts in diagnostics. |
| other range lists | `delight_ranges`, `image_ranges`, `inline_style_ranges`, `aggregated_ranges`, `color_ranges` | Ignore for 2010 style |
| message strategies | `comet_sections.message.__typename`: `CometFeedStoryDefaultMessageRenderingStrategy`, `CometFeedStoryLargeMessageRenderingStrategy` (big-font text-only post, `story.is_text_only_story:true`), `CometFeedStoryRichMessageRenderingStrategy` | [S4] |
| external links | `ranges[].entity.web_link.url` or `l.facebook.com/l.php?u=` | Unwrap `l.php` with `?u=` [S2, S8] |
| translations | `CometFeedStoryTranslatedContentQuery` exists | Not needed |

### 5.4 Attachments

Location: `node.attachments[]` **and** `node.comet_sections.content.story.attachments[]`. They are often duplicated; dedup by `deduplication_key` or media id. Each attachment looks like this [S4 HIGH, S10 MED]:

```
{__typename:"StoryAttachment", deduplication_key, style_list:["photo","fallback"], target:{__typename,"id"}, media:{__typename,"id"},
 styles:{__typename:<StyleRenderer>, attachment:{media:{…}, url, title_with_entities:{text}, description:{text}, source:{text},
         all_subattachments:{count, nodes:[{media:{…}, url}]}, mediaset_token, story_attachment_link_renderer:{attachment:{web_link:{url}}}, style_infos:[…]}},
 comet_footer_renderer:{__typename:"CometStoryAttachmentFooterGHLMockedGenericShareStrategy"|…}}
```

| `styles.__typename` [S10] | Kind | What to read |
|---|---|---|
| `StoryAttachmentPhotoStyleRenderer` | single photo | `styles.attachment.media.photo_image{uri,width,height}` (has a uri); `viewer_image{width,height[,uri]}`; `image{uri}` low-res; `accessibility_caption`; `focus{x,y}` |
| `StoryAttachmentAlbumStyleRenderer` | album | `styles.attachment.all_subattachments.{count, nodes[].media{__typename:"Photo"|"Video", image{uri,w,h}, viewer_image{uri,w,h}}, nodes[].url}`, `mediaset_token`, `url` (media set) |
| `StoryAttachmentVideoStyleRenderer` / `…UnifiedLightweightVideoStyleRenderer` / `…AnimatedImageShareStyleRenderer` | video / GIF | §5.5 |
| `StoryAttachmentShareStyleRenderer` / `…ShareMediumStyleRenderer` | link share | `title_with_entities.text`, `description.text`, `source.text` (domain), image `media.large_share_image.uri` → `media.image.uri`, destination `story_attachment_link_renderer.attachment.web_link.url` → `styles.attachment.url` (unwrap `l.php`) |
| `StoryAttachmentFBReelsStyleRenderer` | shared reel | `style_infos[].fb_shorts_story.attachments[].media` |
| `StoryAttachmentUnavailableStyleRenderer` / `…CustomUnavailableStyleRenderer` | unavailable | Show "Attachment unavailable" |
| event | `target.__typename:"Event"` | `target.url`, `event.name`, `capitalized_day_time_sentence` [S8 MED] |

**Shared post (2010 "X shared Y's post").** The shared story is a full Story at:
- `node.attached_story`
- `node.comet_sections.content.story.attached_story`
- `…content.story.comet_sections.attached_story {__typename:"CometStoryAttachedStoryStrategy", story:{attached_story:{…, comet_sections:{attached_story_layout:{__typename:"CometStoryAttachedStoryInvertedLayoutStrategy", story:{…}}}}}}`

Render it recursively. **Exclude** `attached_story` subtrees when searching for ad and suggestion markers: a friend's share of a Page post must not inherit that Page's Follow button [S4].

### 5.5 Video (2026 field set) [S4 HIGH live 2026-10-11, S10 MED]
- **`media.__typename:"Video"`.** In 2026-10 captures, `videoDeliveryLegacyFields` is **null**. The playable URLs are at `media.videoDeliveryResponseFragment.videoDeliveryResponseResult`:
  - `progressive_urls[] {progressive_url, failure_reason, metadata:{quality:"SD"|"HD"}}`: plain mp4 files. Use them in `<video src>`; `media-src *.fbcdn.net` is allowed per BRIEF.
  - `dash_manifest_urls[] {manifest_url}` and `dash_manifests[] {manifest_xml}`: DASH.
- HushFacebookWeb: "All 48 full videos in captured feed answers had both an SD and an HD file". [S4]
- **Legacy fields, still read as a fallback:** `playable_url`, `playable_url_quality_hd`, `browser_native_sd_url`, `browser_native_hd_url`, on the video itself or under `videoDeliveryLegacyFields`. [S4, S8] **STALE?** for 2026.
- **Thumbnail:** `preferred_thumbnail.image.uri` → `first_frame_thumbnail` (a string) → `thumbnailImage.uri` → `image.uri`. Animated: `animated_preview_thumbnail.animated_image.uri`.
- **Other fields:** `length_in_second`, `is_live_streaming`, `permalink_url`, `width`/`height`/`original_width`/`original_height`/`aspect_ratio`.
- Sample: `samples/video-delivery-2026-10.trimmed.jsonl`.

### 5.6 Feedback / UFI (counts, viewer reaction)

Path (2026-10) [S4 HIGH, S10 MED]: `node.comet_sections.feedback {__typename:"CometStoryFeedbackUFIStrategy" | "CometStoryFeedbackGroupContextualProfileUFIStrategy"}.story.story_ufi_container.story.feedback_context.feedback_target_with_context`

Let `ftwc` = that object, and `S` = `ftwc.comet_ufi_summary_and_actions_renderer.feedback`.

| Field | Where |
|---|---|
| feedback id | `ftwc.id`, `S.id` |
| reaction total | `S.reaction_count.count` (variant A); else `S.adaptive_ufi_action_renderers[__typename=UFIStoryReactActionRenderer].feedback.reaction_count.count` (variant B, ~60% of profile-timeline responses [S10]); else sum `top_reactions.edges[].reaction_count`; also `S.i18n_reaction_count` (string, localized) |
| per-reaction breakdown | `S.top_reactions.edges[] {visible_in_bling_bar, node:{id:<reaction id>, localized_name}, reaction_count, i18n_reaction_count}`. Map `node.id` through the reaction-id table (§7.2). Do not rely on `localized_name`: it is locale-dependent, and in comments it is absent. |
| comment total | `ftwc.comment_rendering_instance.comments.total_count`; `S.comments_count_summary_renderer.feedback.comment_rendering_instance.comments.total_count`; `…[UFICommentActionRenderer].feedback.comment_rendering_instance.comments.total_count` |
| share total | `S.share_count.count` or `…[XFBUFIAdaptiveShareActionRenderer].feedback.share_count.count`; `i18n_share_count` |
| viewer's reaction | `S.viewer_feedback_reaction_info` (null when the viewer has not reacted). Its non-null shape was not observed; **INFERRED** to contain the reaction id. Persist our own optimistic state after mutations. |
| can comment | `ftwc.can_viewer_comment`; `comments_disabled_notice_renderer`, `have_comments_been_disabled` |
| supported reactions | `…supported_reaction_infos[] {id, animation…}` (large; trim) |
| reactor names ("You and Amy like this") | **Not present in feed payloads** (key census 2026-10 [S4]). Render "You and N others" / "N people like this" from counts plus `viewer_feedback_reaction_info`. Names would need `CometUFIReactionsDialogQuery` (doc in fbk registry 2026-09 [S3]). |

### 5.7 Comment preview
- `…feedback_context.interesting_top_level_comments[] {comment:{id, body:{text}, author:{id,name,url}, created_time, feedback:{reaction_count{count}, top_reactions}}}`. [S10 MED]
- In the 2026-10 home-feed captures this array was **empty** for every story [S4]. Expect to fetch comments separately.
- **Separate fetch:** `CommentsListComponentsPaginationQuery`, with `variables.id` = the feedback id, `feedLocation:"POST_PERMALINK_DIALOG"`, `commentsAfterCursor`, and `commentsAfterCount` (server default ~10).
  - Response: `data.node(__typename:"Feedback").comment_rendering_instance_for_feed_location.comments.{edges[].node(Comment), page_info}`.
  - Comment fields: `id` (base64 of `comment:<post>_<cid>`), `legacy_fbid`, `body.text`, `preferred_body.text` (translation), `author{id,name,url,profile_picture…}`, `created_time`, `feedback{reaction_count{count}, top_reactions}`, `replies_fields.total_count`.
  - [S10 MED]
- Ordering intents seen 2026-10 [S4] (`samples/comment-order-intents-2026-10.jsonl`):
  - `RANKED_FILTERED_INTENT_V1` ("Most relevant", default)
  - `REVERSE_CHRONOLOGICAL_UNFILTERED_INTENT_V1` ("Newest")
  - `RANKED_UNFILTERED_CHRONOLOGICAL_REPLIES_INTENT_V1` ("All comments")
  - Which variable carries the intent is **not verified**.
- For 2010 "View all N comments" plus the last 2 comments: fetch lazily, on click or when the story scrolls into view, rate-limited.

### 5.8 Deep-search key list (fallbacks when canonical paths move)

Search inside one `edge.node`, skipping `attached_story` and nested `{node,cursor}` objects:

| Purpose | Search |
|---|---|
| story | `__typename:"Story"`, `post_id`, `creation_time`, `permalink_url`, `url`, `wwwURL` |
| text | first object with `__typename:"TextWithEntities"` → `.text`; or key `message` whose value has a string `text` [S3, S11] |
| actor | first `__typename:"User"` (or `"Page"`) object with a non-empty `name` [S3]; key `actors`; key `owning_profile` |
| avatar | key `profile_picture` → `.uri` |
| target | key `to` with `__typename:"Group"`; key `target_group` |
| feedback | first `__typename:"Feedback"` with an `id` [S3]; keys `reaction_count` (int or `{count}`), `i18n_reaction_count`, `top_reactions`, `share_count`, `i18n_share_count`, `comment_rendering_instance` → `comments.total_count`, `total_count`, `viewer_feedback_reaction_info`, `can_viewer_comment`, `interesting_top_level_comments` |
| media | `__typename:"Photo"` with `photo_image`/`viewer_image`/`image`; `__typename:"Video"` with `videoDeliveryResponseFragment`/`progressive_urls`/`playable_url*`/`browser_native_*`; keys `all_subattachments`, `style_list`, `styles`, `title_with_entities`, `source`, `large_share_image`, `web_link`, `external_url` |
| typename restore | before any typename match, apply §8.4 |

Also: `GHLExtraElementWrapper` and `ghl_label` are presentation obfuscation (§8.5). Ignore `ghl_label` and compute the timestamp from `creation_time`.

### 5.9 Extractor sketch (canonical paths first, then search)

```js
const G = (o, ...p) => p.reduce((a, k) => a == null ? a : a[k], o);
function extractStory(node) {
  const cs = node.comet_sections || {}, content = G(cs,'content','story') || {};
  const ctx = G(cs,'context_layout','story') || {};
  const md = G(ctx,'comet_sections','metadata') || [];
  const ts = md.find(m => /TimestampStrategy$/.test(m?.__typename)) || cs.timestamp;
  const ftwc = G(cs,'feedback','story','story_ufi_container','story','feedback_context','feedback_target_with_context') || {};
  const S = G(ftwc,'comet_ufi_summary_and_actions_renderer','feedback') || {};
  const rr = tn => (S.adaptive_ufi_action_renderers||[]).find(r => r?.__typename === tn)?.feedback || {};
  return {
    postId: node.post_id ?? null, id: node.id,
    time: node.creation_time ?? G(ts,'story','creation_time'),
    url: G(ts,'story','url') ?? node.permalink_url ?? ftwc.url,
    actors: (node.actors || content.actors || []).map(a => ({ id: a.id, name: a.name, url: a.url, type: a.__typename })),
    avatar: G(ctx,'comet_sections','actor_photo','story','actors',0,'profile_picture','uri') ?? G(content,'actors',0,'profile_picture','uri'),
    to: node.to ? { ...node.to, name: node.to.name ?? G(ctx,'comet_sections','actor_photo','story','to','name') } : null,
    text: G(content,'message','text') ?? G(content,'comet_sections','message','story','message','text')
          ?? G(content,'comet_sections','message_container','story','message','text') ?? null,
    ranges: G(content,'comet_sections','message','story','message','ranges') || [],
    attachments: dedupAttachments([...(content.attachments||[]), ...(node.attachments||[])]),
    shared: content.attached_story ?? node.attached_story ?? null,
    feedbackId: node.feedback?.id ?? ftwc.id ?? S.id,
    reactions: S.reaction_count?.count ?? rr('UFIStoryReactActionRenderer').reaction_count?.count ?? null,
    topReactions: (S.top_reactions?.edges || []).map(e => ({ id: e.node?.id, n: e.reaction_count })),
    comments: ftwc.comment_rendering_instance?.comments?.total_count ?? rr('UFICommentActionRenderer').comment_rendering_instance?.comments?.total_count ?? null,
    shares: S.share_count?.count ?? rr('XFBUFIAdaptiveShareActionRenderer').share_count?.count ?? null,
    viewerReaction: S.viewer_feedback_reaction_info ?? rr('UFIStoryReactActionRenderer').viewer_feedback_reaction_info ?? null,
    canComment: ftwc.can_viewer_comment !== false,
  };
}
```

---

## 6. Ad and "suggested" markers, and the edge classifier (task item 5)

### 6.1 `FeedStoryCategory` enum

Verbatim Facebook source, 2025-10 [S5 HIGH]:

```js
__d("FeedStoryCategory",[],(function(a,b,c,d,e,f){a=Object.freeze({UNKNOWN:0,ORGANIC:1,ENGAGEMENT:2,FIXED_POSITION:3,
 PROMOTION:4,SPONSORED:5,END_OF_FEED_CONTENT:6,FB_STORIES:7,HIGH_VALUE_PROMOTION:8,FB_STORIES_ENGAGEMENT:9,SHOWCASE:10,
 FB_SHORTS:11,TRENDING:12,ENGAGEMENT_QP:13,MULTI_FB_STORIES_TRAY:14,END_OF_FEED_REELS:15,FB_SHORTS_FALLBACK:16,
 FRIENDLY_FEED_MID_CARD:17,FRIENDLY_FEED_PROMOTION:18,INJECTED_STORY:19,LIMITED_PERSONALIZATION_NOTICE:20});f["default"]=a}),66);
```

The module was also present in the live 2026-10-21 logged-out bundles (`ynvALLIPkll.js`) [S6].

Recommended policy (INFERRED):
- **Keep:** `ORGANIC`. Also `ENGAGEMENT` when the node is a `Story` and passes §6.4; webcleaner's tests treat ENGAGEMENT as kept [S1].
- **Drop:** everything else, in particular `SPONSORED`, `PROMOTION`, `HIGH_VALUE_PROMOTION`, `FB_STORIES*`, `SHOWCASE`, `FB_SHORTS*`, `TRENDING`, `ENGAGEMENT_QP`, `MULTI_FB_STORIES_TRAY`, `END_OF_FEED_*`, `FRIENDLY_FEED_*`, `INJECTED_STORY`, `LIMITED_PERSONALIZATION_NOTICE`.
- **`UNKNOWN` / `FIXED_POSITION`:** decide by node typename.

### 6.2 Obfuscated category (`cat_sensitive`)
- **Activation.** When `shouldObfuscateCategoryField` is true, the edge has no `category`. It carries `cat_sensitive` instead: GraphQL field `category_sensitive`, type `FeedCategorySensitive {enc, cat}`. [S5 HIGH, artifact 2025-10]
- **Seen live.** HushFacebookWeb saw it on **every** feed edge on 2026-10-10, with `cat:null` on organic stories [S4 HIGH].
- **Facebook's own decoder**, verbatim from S5:

  ```js
  __d("GHLFeedStoryCategoryObfuscationUtils",["CryptoJS","FeedStoryCategory"],function(…){
    function a(a /*enc*/, b /*post_id*/){ if(a==null||b==null)return null;
      b=CryptoJS.SHA256(b).toString(CryptoJS.enc.Hex);
      for(var [name,num] of Object.entries(FeedStoryCategory)){
        if(CryptoJS.SHA256(b.concat(num)).toString(CryptoJS.enc.Hex)===a) return name; }
      return null }
    g.getMatchWithFeedStoryCategory=a })
  // caller (useLogCometFeedUnitRenderAttemptEvent / CometNewsFeedUnit): category = cat_sensitive.cat ?? getMatchWithFeedStoryCategory(cat_sensitive.enc, edge.node.post_id)
  ```

- **Our implementation** (WebCrypto, lowercase hex, string concatenation of the decimal number):

  ```js
  const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join('');
  const sha = async s => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  async function edgeCategory(edge) {
    if (typeof edge.category === 'string') return edge.category;                 // unobfuscated
    const cs = edge.cat_sensitive ?? edge.category_sensitive; if (!cs) return null;
    if (typeof cs.cat === 'string') return cs.cat;
    const pid = edge.node?.post_id; if (!cs.enc || !pid) return null;
    const seed = await sha(String(pid));
    for (const [name, n] of CATS /* ordered: SPONSORED first, ORGANIC, ENGAGEMENT, … */) if (await sha(seed + n) === cs.enc) return name;
    return 'UNDECODABLE';
  }
  ```

- **Confidence:** algorithm HIGH as of 2025-10; field shape HIGH for 2026-10. That the algorithm is unchanged in 2026 is **MED**: the HushFacebookWeb fixtures scrub hashes and ids, so it could not be re-checked here.
- **Self-test:** log the decode rate in diagnostics. `UNDECODABLE` on most edges means the scheme changed, so fall back to the other markers.
- **Observed 2026-10-11:** the Reels-row edge (`ShowcaseFeedUnit`) carried `cat_sensitive:{"enc":null,"cat":"FB_SHORTS"}`. Organic `Story` edges carried `{"enc":"<64 hex>","cat":null}`. So `cat` is a plain category name when present, and at least some non-organic units are sent with `cat` filled in. [S4 HIGH; `samples/feed-reels-ShowcaseFeedUnit-2026-10-11.trimmed.jsonl`] Whether *sponsored* edges come as `cat:"SPONSORED"` or as an `enc` hash was not observed. Handle both.
- **Alternative (INFERRED risk):** send `shouldObfuscateCategoryField:false` and get the plain `category` string. subsocial and the iOS app do this [S8, S18]. It deviates from the page's own value, so it is a possible fingerprint. Recommended: keep the page's value and decode.

### 6.3 Sponsored-data aliasing

GHL "provided variables" rename ad fields per user/session [S5 HIGH artifact 2025-10; S1/S4 live 2026-10]:

| Real field | Alias(es) seen | Controlled by |
|---|---|---|
| `Story.sponsored_data` (type `SponsoredData {ad_id, client_token, brs_filter_setting, post_rendering_loggers, __typename}`) | `daspo_sto` (artifact 2025-10); **`th_dat_spo`** (live 2026-10-10/12) | `__relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider` |
| `SponsoredData.ad_id` | `lbl_adv_iden` | `…GHLShouldChangeAdIdFieldName…` |
| `edge.sponsored_auction_distance` | `the_disan_sonsore_auctigo` (V1), `new_sponsorw_distn_aucton_of` (V2), **`sposnsor_new_distac_action`** (live 2026-10-10; null on organic) | `…GHLShouldChangeSponsoredAuctionDistanceFieldName…`, `…UseSponsoredAuctionLabelFieldNameV1/V2…` |
| `edge.category` | `cat_sensitive{enc,cat}` | `shouldObfuscateCategoryField` |
| `edge.brs_content_label` | `brs_la_conten` (V1), `brs_new_cont_labl_label` (V2) | `shouldUseBRSLabelFieldNameV1/V2` |
| right-rail ads | `GHLShouldChangeRHCAdsFieldName`, `…RHCFieldName`, `…RHCSideFeedFieldName` providers exist | [S5] |

- webcleaner live (2026-10-12): the raw feed responses carried **6 `SponsoredData` objects**, under key `th_dat_spo`. Removing them collapsed the feed's scroll height from ~18,000 px to ~2,000 px. [S1 HIGH]
- **Match on `__typename:"SponsoredData"`, never on the key.** Typenames do not rotate, but they can be obfuscated on the wire (§8.4), so restore them first.

### 6.4 Classifier (one edge → KEEP | DROP(reason))

Evaluate in order; `node = edge.node`. Exclude `attached_story` subtrees from every search.

1. `!node` → DROP `no-node`. Edges without a node exist after Facebook's own pruning, and uBO-style edits produce them too.
2. `node.__typename !== 'Story'` → DROP `unit:<typename>`.

   Known non-post units, from the 2025-10 pagination artifact [S5 HIGH] and 2026-10 fixtures [S4]:

   | Typename | What it is |
   |---|---|
   | `PaginatedPeopleYouMayKnowFeedUnit` | People You May Know |
   | `FriendRequestsFeedUnit` | friend requests |
   | `GroupsYouShouldJoinFeedUnit`, `GroupsMultiGYSJStoryUnit`, `GroupRelatedGroupsFeedUnit`, `GroupsTabCategoriesUnit` | groups suggestions |
   | `PagesYouMayLikeFeedUnit` | pages suggestions |
   | `StoriesTrayFeedUnit`, `StoriesSingleBucketInlineViewerFeedUnit` | stories |
   | `ShowcaseFeedUnit` (`showcase_story_type:"SHOWCASE_SHORT_VIDEO"`, `showcase_item[]`, the Reels row, seen 2026-10-11), `FBShortsMidCardFeedUnit`, `XFBDummyReelsInWatchIFU` | reels |
   | `QuickPromotionFeedUnit`, `QuickPromotionNativeTemplateFeedUnit` | megaphone / quick promotions |
   | `EndOfFeedUpsellFeedUnit` | end-of-feed upsell |
   | `CommunityTabTrendingPOGFeedUnit` | trending |
   | `GoodwillCometStory` | memories |
   | `CustomizedStory` | **INFERRED**: probably not a normal friend post; log it |
   | `MarketplaceFeedAdStory` | Marketplace ad [S2] |
   | `AdsSideFeedUnit` | right-rail ad [S2, S6] |

3. Any object in `node` (not in `attached_story`) has `__typename === 'SponsoredData'`, or `node.sponsored_data != null` → DROP `sponsored-data`. [S1, S2, S4]
4. `await edgeCategory(edge)` is not in {`ORGANIC`, `ENGAGEMENT`, `null`} → DROP `category:<name>`. `UNDECODABLE` → keep, but count it in diagnostics.
5. Any object with `__typename === 'CometStorySponsoredLabelStrategy'` (the "Sponsored"/"Ad" label section) → DROP `sponsored-label`. [S4 HIGH, seen on a search ad 2026-10-10]
6. Non-null sponsored-auction-distance under any alias (`sponsored_auction_distance`, `the_disan_sonsore_auctigo`, `new_sponsorw_distn_aucton_of`, `sposnsor_new_distac_action`) → DROP `auction-distance`. **INFERRED**: null on organic in 2026-10 [S4]; non-null on ads assumed. Unknown future aliases are not caught, so log edges with unexplained non-null keys matching `/spo|spn|auct|adv/i`.
7. Suggestion markers (all [S4 HIGH 2026-10-11]):
   - `ctx = node.comet_sections.context_layout.story`
   - **7a.** `ctx.unconnected_waist_data != null` → DROP `unconnected`. It holds `{serialized_ranking_info:"{\"primary_generator\":…,\"trigger_id\":…,\"all_generators\":[…]}"}`, and is null on friend posts. subsocial also drops on it [S8].
   - **7b.** `ctx.comet_sections.title.story.recommendation_context != null` (e.g. `{__typename:"ExploreRecommendationContext"}`) → DROP `recommended`.
   - **7c.** The title section contains `__typename:"CometFeedStoryFollowButtonStrategy"` (`…title.story.comet_sections.follow_button`) → DROP `follow-suggestion`. Seen on 36 of 137 Home stories in HushFacebookWeb's capture. uBO's annoyances list keys on the same typename, but with stale key names (`category_sensitive`, `newest_lbl_for_brs`), so it is **STALE?** [S2]
   - **7d.** The title section contains `__typename:"GroupJoinForumAction"` with `group.viewer_forum_join_state === "CAN_JOIN"` (`…title.if_viewer_can_join_group.join_action`) → DROP `join-suggestion`. Seen on 17 of 137 Home stories.
   - If the title section has moved, search the whole story; that is HushFacebookWeb's fallback [S4].
8. AI label (optional user setting): `…metadata[] __typename:"CometFeedStoryGenAIContentTransparencyStrategy"` with `was_detected_as_ai_generated || was_self_disclosed_as_ai_generated || ai_generated_detected_info.gen_ai_transparency_type` → optional DROP or badge. [S4]
9. Otherwise KEEP.

- **Scope (important).** HushFacebookWeb applies the Follow/Join rules **only** to feed queries: `CometNewsFeedPaginationQuery`, `GroupsCometCrossGroupFeedPaginationQuery`, and inline home data. A Page's own timeline or a group you browse legitimately shows Follow/Join buttons. [S4] For MFGA's merged feed, all four sources are feed queries, so apply every rule.
- **Do not use `is_ad_eligible_for_ad_pod`.** It is eligibility, not adness: false on organic.

---

## 7. Mutations (task item 7)

### 7.1 Reaction: `CometUFIFeedbackReactMutation` [S3 HIGH, live 2026-09-18/20]
- **doc_id:** `27646120298312844`. It was the same in the 2026-09-18 and 2026-09-20 registries. Still: discover it at runtime (§11).
- **Variables** (verbatim capture with ids scrubbed; `samples/mutation-CometUFIFeedbackReactMutation-2026-09.json`):

  ```json
  {"input":{"attribution_id_v2":"CometHomeRoot.react,comet.home,via_cold_start,1789727958490,883891,4748854339,,",
            "feedback_id":"ZmVlZGJhY2s6MzkzNzAyNDMyOTc3NDAzNg==","feedback_reaction_id":"1635855486666999",
            "feedback_source":"NEWS_FEED","feedback_referrer":"/sample.page/posts/pfbid02…",
            "is_tracking_encrypted":true,"tracking":["AZjPesN-…<encrypted blob>"],
            "session_id":"fd0d4d15-2063-4af1-9a4c-cfbbd9f2014f",
            "downstream_share_session_id":"d90ac567-…","downstream_share_session_origin_uri":"https://www.facebook.com/…",
            "downstream_share_session_start_time":"1789727933949",
            "actor_id":"<viewer USER_ID>","client_mutation_id":"1"},
   "scale":1,"canUseNicknameOnComet":false,"useDefaultActor":false,
   "__relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider":false}
  ```

- **Unlike / unreact:** the same mutation with `"feedback_reaction_id":"0"`. There is no separate unlike mutation. Live: `reaction_count` went 43 → 44 → 43. [S3 HIGH]
- **`actor_id` must be the live viewer's id.** A stale actor id gives a `field_exception`. [S3 HIGH, 2026-09-20]
- **`tracking` / `attribution_id_v2` / `downstream_share_*`.** fbk replays the captured encrypted `tracking` verbatim and works. Older libraries send `tracking: []` [S15]. **INFERRED:** `tracking: []` plus a fresh `session_id` uuid probably works; the server does not validate tracking per post, since fbk reuses one blob for any post.
  - Best option: use the story's own tracking string. Story nodes carry `encrypted_tracking`, and `…story_ufi_container.story.encrypted_tracking` exists [S4 key census]. Whether *that* is what goes into `tracking[]` is **INFERRED, unverified**.
- **`feedback_source`:** `"NEWS_FEED"` from the home feed; `"OBJECT"` from permalinks [S3, S15]. `feedback_referrer` is a path-style referrer.
- **Response (MED; fca libraries, not re-verified 2026):** `data.feedback_react.feedback.{id, reaction_count{count}, viewer_feedback_reaction_info, top_reactions{edges[]}, supported_reactions…}`. Update the UI optimistically, then reconcile from the echo.
- **STALE, do not use:** the legacy shape `{feedback_reaction:<int>, is_undo:bool}` (legacy ints LIKE 1, LOVE 2, WOW 3, HAHA 4, SAD 7, ANGRY 8, CARE 16) with doc ids like `4769042373179384`. It still appears in opentabs (2026) and in fca libraries [S12, S15] and is unverified for 2026.

### 7.2 Reaction ids [HIGH; S3 live-harvested 2026-09 + S16 cross-check]

| UI | internal enum | `feedback_reaction_id` |
|---|---|---|
| Like | LIKE | `1635855486666999` |
| Love | LOVE | `1678524932434102` |
| Care | SUPPORT | `613557422527858` |
| Haha | HAHA | `115940658764963` |
| Wow | WOW | `478547315650144` |
| Sad | SORRY | `908563459236466` |
| Angry | ANGER | `444813342392137` |
| (remove) | — | `0` |

**Erratum:** fbk's comment "SORRY … displayed as Care" is wrong. Four independent sources map `908563459236466` to Sad and `613557422527858` to Care/support [S16].

### 7.3 Comment: `useCometUFICreateCommentMutation` [S3 HIGH capture 2026-09-18; doc rotated 2026-09-20]
- **doc_id:** `28882491998025365` (2026-09-18), then **`39607465588840384`** (2026-09-20, deploy rev 1047963790). The old id returned `field_exception 1357010` live.
- **Variables** (in a group permalink dialog; `samples/mutation-useCometUFICreateCommentMutation-2026-09.json`):

  ```json
  {"feedLocation":"POST_PERMALINK_DIALOG","feedbackSource":2,"groupID":"<group id or null>",
   "input":{"client_mutation_id":"1","attachments":null,"feedback_id":"<feedback id>","formatting_style":null,
            "is_inline_vote_enabled_for_qna":false,"message":{"ranges":[],"text":"👍"},
            "attribution_id_v2":"CometSinglePostDialogRoot.react,comet.post.single_dialog,…","vod_video_timestamp":null,
            "is_tracking_encrypted":true,"tracking":["<encrypted>","{\"assistant_caller\":\"comet_above_composer\",…}"],
            "feedback_source":"OBJECT","idempotence_token":"client:<uuid>","session_id":"<uuid>",
            "downstream_share_session_id":"<uuid>","downstream_share_session_origin_uri":"…","downstream_share_session_start_time":"…"},
   "inviteShortLinkKey":null,"renderLocation":null,"scale":1,"useDefaultActor":false,"focusCommentID":null,
   "translationType":"AUTO_TRANSLATE","canUseNicknameOnComet":false,
   "__relay_internal__pv__groups_comet_use_glvrelayprovider":false,
   "__relay_internal__pv__CometUFICommentActionLinksRewriteEnabledrelayprovider":true,
   "__relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider":false,
   "__relay_internal__pv__IsWorkUserrelayprovider":false,
   "__relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider":"AUTO_TRANSLATE"}
  ```

- **Live findings (2026-09-20)** [S3 HIGH]:
  - **`groupID` must be the post's owning group id, or `null` for non-group posts.** A mismatch gives `field_exception 1357010`. Take it from `node.to.id` when `node.to.__typename==="Group"`.
  - A fresh `client_mutation_id` and `idempotence_token: "client:"+uuid` are needed on every call.
  - Comments are "the most soft-filtered mutation class". A success echo is not proof the comment landed, so verify by refetch.
- **Field details:**
  - Note that `input.actor_id` is **absent** in the 2026 capture. The STALE minimal shape included it [S15]. The server takes the actor from the session.
  - **Mentions:** `message.ranges[] {entity:{id}, offset, length}` [S15 STALE?].
  - **Reply:** `input.reply_comment_parent_fbid` [S15 STALE?].
  - **Photo:** upload to `/ajax/ufi/upload/` (form fields `profile_id`, `source:19`, `target_id`, `file`), then `attachments:[{media:{id}}]` [S15 STALE?].
- **Response:** `data.comment_create.feedback_comment_edge.node.{id, feedback.url}`, `data.comment_create.feedback.total_comment_count` [S15 MED].
- **Related operations** (fbk registry 2026-09 [S3]):
  - `CometUFIDeleteCommentMutation` (strict variable set)
  - `useCometUFIEditCommentMutation`
  - `CometUFILiveTypingBroadcastMutation_StartMutation` / `_StopMutation`. Facebook sends typing broadcasts around a comment; optional, but natural-looking.

### 7.4 `__relay_internal__pv__*` (provided variables)
- **What they are.** Relay "provided variables" whose values the client computes from gatekeepers (`gkx`) and experiments (`justknobx`/`qex`). Example [S5]:

  ```js
  GHLShouldChangeSponsoredAuctionDistanceFieldName.relayprovider:
    {get(){ return justknobx(2981) && gkx(6352) && 1<=justknobx(1813)<=2 }}
  ```

- **Every one the operation declares must be sent.** Missing ones cause a server error [S9]. Extra undeclared variables cause `1675012` (fbk saw this on the delete-comment mutation) [S3].
- **Value source.** Use the values from the page's own preloader or captured request. They differ per user. For mutations whose variables we have not seen on this page, use the 2026-09 capture values from §7.1/§7.3 as defaults. **MED.**

---

## 8. Anti-tamper: what to avoid (task item 8)

All of this is Facebook's own code, verified identical in the **live 2026-10-21 facebook.com bundles** (`e3z46jPnNA-.js`, `dc0963WG87T.js`, `EXRGS8jx…js`) and in WhatsApp Web (wa-diff) [S6 HIGH, S7 HIGH]. Logger category: `ad_blocker_defense_ghost_owl`.

### 8.1 The JSON.parse canary (`GHLDetectionUtilsPreludeSafe`)

```js
function d(){for(var e=["Spon","sored","Data"],t="",n=0;n<e.length;n++)t+=e[n];return'{"node":{"s":{"__typename":"'+t+'"}}}'}
var m=d(), p='{"data":'+m+',"edges":['+m+'],"require":['+m+'],"t8":"'+"3f0a7c1b9e42d685"+'","extensions":{"is_final":true}'+" ".repeat(4079)+"}";
// isJSONParseBehaviorallyShimmed: M(JSON.parse(p)) — true if data.node / edges[0].node / require[0].node got removed
// isJSONParseShimmed: Function.prototype.toString(JSON.parse) vs the iframe's clean copy, and "function parse() { [native code] }"
```

- **Why the canary is built this way:**
  - The string is assembled from pieces, which defeats uBO's old bundle rewrite of `"__typename":"SponsoredData"` [S2].
  - It is padded to more than 4 KB, so it passes size gates.
  - It includes `"is_final":true` and `require` / `edges` / `data` shapes, so it looks like a feed payload.
- **Consequence.** Any JSON.parse hook that removes `node`s with a `SponsoredData` child, which is exactly uBO's `..node[?.*.__typename=="SponsoredData"]` rule, is detected. Facebook then parses through fallbacks:
  1. boxed: `JSON.parse('{"q7z":'+t+'}')`
  2. wrapped: `JSON.parse('['+t+']')`
  3. a clean `JSON.parse` taken from the iframe
  4. `json5.fromPiece` on text with a `/*x*/` comment injected after the first key, so a string-prefix-matching filter no longer matches

  [S6 `GHLRelayJsonParse`, `GHLServerJSParse`] webcleaner confirmed the fallback live [S1].
- **MFGA rule: never touch `JSON.parse`.**

### 8.2 Clean natives from a hidden iframe
`L()` in `GHLDetectionUtilsPreludeSafe` [S6]:
1. Creates `<iframe style="display:none">`. Its `src` is `about:blank#g` if `"h4npx7qw" in Env`, or `about:blank` + `srcdoc=""` if `"p9fk3wmn" in Env`.
2. Inserts the iframe by a method chosen from Env flags, so hooks on one DOM method miss it:

   | Env flag | Insertion method |
   |---|---|
   | `f2yq8vnd` | replaceWith on a span |
   | `b7xr2qnf` | replaceChildren |
   | `w8kq3zmt` | replaceChild |
   | `t5nd8vqc` | comment.replaceWith |
   | `m8r3kp6w` | `Range.insertNode` |
   | `q4v7nx3k` | after |
   | `b3xk8fqm` | before |
   | `r7c2m9xk` | prepend |
   | `z2ht6xqp` | append |
   | `k7q3nv9d` | insertBefore |
   | `w6jt4rnq` | insertAdjacentElement |
   | (none) | appendChild |

3. Harvests the iframe's `String`, `Function.prototype.call`, `JSON.parse`, `Function.prototype.toString`, and the `XMLHttpRequest.prototype` `response`/`responseText` getters.
4. Parses the canary with the iframe's `JSON.parse`. If that is edited too, it marks the harvest "poisoned" and stops trusting it.

**Restorers:**
- `restoreNativeXHRGetters()` redefines `XMLHttpRequest.prototype.response`/`responseText` with the clean getters. This silently undoes any prototype-level XHR patch.
- `restoreNativeCall()` sets `Function.prototype.call` to a `Reflect.apply` wrapper.
- `restoreNativeString()` replaces `window.String`.

The 8-character Env flags (`h4npx7qw`, …) are delivered in `<script id="envjson">` on logged-in pages.
- **INFERRED:** uBO strips them with `rpnt, script, '/"[a-z0-9]{8}":true,/g', , condition, compat_iframe_token`. `compat_iframe_token` is a key of the envjson script (live 2026-10-21) [S2, S6].
- On the logged-out page none of the flags were present [S6].

### 8.3 Other checks [S6]

| Check | Signal |
|---|---|
| `isXHRModified(window.XMLHttpRequest)` | `XMLHttpRequest.toString()` must be `"function XMLHttpRequest() { [native code] }"`, and `toString === toString.toString` |
| `isXHRResponseGetterShimmed` | the getter's toString vs the iframe's copy |
| `isCanvasFillTextModified` | the same test on `CanvasRenderingContext2D.prototype.fillText` |
| `isStringShimmed` / `isStringBehaviorallyShimmed` | `String(p) !== p` |
| `isCallShimmed` / `isCallBehaviorallyShimmed` / `isCallShimmedCrossRealm` | the same idea for `Function.prototype.call` |

**`isNativeStackTampered()`:**
1. Runs `JSON.parse("{ ")`, `iframe.JSON.parse("{ ")`, `new XMLHttpRequest().send()` and `new iframe.XMLHttpRequest().send()` inside try/catch.
2. Tests each `error.stack` against `/chrome-extension:\/\/|moz-extension:\/\/|safari-web-extension:\/\/|<anonymous>:\d/`.

So if *our* wrapper is on the call path, the extension URL (or eval'd/userscript `<anonymous>` code) shows up in the stack.

**Telemetry:** `useGHLNativeFunctionModificationLogger` (gk 5599) logs `GhlNfmFalcoEvent {event:"xm"}` (XHR modified), `{event:"jm"}` (JSON.parse modified) and `{event:"cfm"}` (canvas fillText modified). [S5, 2025-10]

### 8.4 Typename obfuscation and restore
- `GHLTypenameRestore.restoreAllTypenames(obj, text)` reads `window.Env.q9k7m2x`, an array of `[obfuscated, real]` pairs. It replaces `__typename` values that occur in the raw text. [S6 live 2026-10-21]
- `GHLServerJSParse` hard-codes one case: `"__typename":"AdsSideFeedUnit"` ↔ `"Q4xN7zP9aLbM3vT"` (gated by `k8pq2mnb`/`n5tq2wjb`).
- **Impact on MFGA.** The server may send ad typenames under random names (for example a non-`SponsoredData` name), and only the client maps them back. Our parser must:
  1. read `Env` from `<script id="envjson">` (isolated world, DOM read);
  2. apply `q9k7m2x` pairs to every parsed payload before classification;
  3. log in diagnostics any `__typename` that matches `/^[A-Za-z0-9]{12,16}$/` and is not in a known list.
- **Not verified on a logged-in page:** whether `q9k7m2x` is actually populated. **LOW/INFERRED.**

### 8.5 Presentation obfuscation (DOM side; FYI)
- **`GHLExtraElementWrapper`** wraps elements in N random nested spans or divs.
- **`GHLRandomTags.react`** exists. [S5]
- **`ghl_label`:** the timestamp/label area is rendered from a server-sent pseudo-DOM tree. In 2026-10 it appeared on every story's `timestamp.story` and on `metadata[].story` [S4]:
  - shape: `{tag:"span", styles:[{name:"display",val:"flex"},{name:"order",val:"0"}], children:[{tag:"span", text:"…", attributes:[{name:"<word>",val:"…"},{name:"<word>",val:"k1pLES"}], styles:[{name:"position",val:"absolute"},{name:"top",val:"3em"},{name:"order",val:"29"}]}, …]}`
  - Decoy letters are pushed off-screen, and the visible order comes from CSS `order`.
  - **INFERRED:** the 6-character attribute value relates to `Env.ghlss`; `"ghlss":"b1pLEJ"` was seen live 2026-10-21 [S6].
  - MFGA ignores `ghl_label`. Do not use it for ad detection; use §6.
- **Decoy "ad-like" data on organic posts** (observed 2026-10-11 on an ordinary group album post) [S4 HIGH; `samples/feed-group-posts-ai-label-2026-10-11.trimmed.jsonl`]:
  - attachment `comet_footer_renderer {__typename:"CometStoryAttachmentFooterGHLMockedGenericShareStrategy", attachment:{ghl_mocked_footer_info:{headline, footer_body, link:"https://l.facebook.com/l.php?u=…", meta, cta_button:<ghl tree>}}}`
  - `content.story.ghl_mocked_encrypted_link` (an `l.php` URL)
  - `content.story.ghl_label_mocked_cta_button`

  These look like ad CTA footers and links, but they sit on organic stories. They are meant to poison DOM- and text-based ad detectors. **Never treat any `*GHLMocked*` / `ghl_mocked_*` field as an ad signal, and never render them.**

### 8.6 What MFGA should and should not do

| Do | Don't |
|---|---|
| Read inline `<script type=application/json>` text and `envjson` from an isolated content script | Patch `JSON.parse`, `XMLHttpRequest`, `fetch`, `Function.prototype.*`, `String`, `Object.getOwnPropertyDescriptor` in the page |
| Issue our own same-origin `/api/graphql/` requests (§1) | Wrap `XMLHttpRequest.prototype.send/open` to sniff requests (stack check + `restoreNativeXHRGetters`) |
| Learn doc_ids and variables from SSR preloaders, from `require('<Op>_facebookRelayOperation')` (read-only), and from extension `webRequest.onBeforeRequest` with `requestBody` (background, invisible to the page) | Inject inline `<script>` (CSP nonce blocks it anyway, per BRIEF) |
| Hide Facebook's feed with CSS (`style-src 'unsafe-inline'` is allowed per BRIEF) | Remove Facebook's feed DOM nodes. On mobile, Facebook's virtualiser stops paging past hidden or removed slots [S1 README] |
| If response editing is ever needed: use Firefox `webRequest.filterResponseData` (network level, invisible to JS). In Chrome, use webcleaner's XHR-subclass pattern with masked `toString` and a frame guard [S1] as a documented **opt-in risk** | Use `JSON.parse` hooks (canary + stack test), as uBO filters and HushFacebookWeb (`src/core/net/hooks.js`) do. HushFacebookWeb works live 2026-10-11 only because its rules never touch the canary's shape [S4] |

Background: on 2026-08-19/20, members of the uBO team stated in uAssets#3367 that uBO "already decided to stop supporting Facebook". The community now maintains these filters [S20 MED]. Treat uAssets Facebook rules as possibly stale. webcleaner re-verified the core JSON edits live on 2026-10-12 [S1].

---

## 9. Combined chronological feed: merge scheduler (task item b)

**Inputs:** the source list `SRC = [FRIENDS, GROUPS, PAGES, FAVORITES]`. Each source is `{feedStyle, orderby:["MOST_RECENT"], cursor:null, done:false, buf:[], oldestTs:+∞}`.

**Fetching one page for a source:**
- First page: `CometModernHomeFeedQuery`. Use the preloader's `queryID` and `variables`, overriding `feedStyle`, `orderby`, `feedEndCursor:null` and `refreshMode:"COLD_START"`.
- Later pages: the same query with `feedEndCursor:cursor` [S8]. Alternative: `CometNewsFeedPaginationQuery` with `cursor`, `count` (copy Facebook's; artifact default 2) and `clientQueryId:crypto.randomUUID()`.
- Then: parse (§3) → classify (§6) → extract (§5) → push into `buf` → set `cursor = page_info.end_cursor`, `done = !has_next_page || !cursor || cursor repeats`.

**Emission rule.** Merge by `creation_time` descending.
- Let `W = max(src.oldestTs for src of SRC if !src.done)`. This is the watermark: no undelivered post from an unfinished source can be newer than W.
- Emit every buffered item with `creation_time >= W`, in time order.
- When the user scrolls and nothing is emittable, fetch from the unfinished source with the **largest** `oldestTs` (the one holding the watermark back).

**Dedup.**
- Key: `post_id ?? node.id ?? edge.deduplication_key`. Favorites overlap with friends and pages; a friend's group post may appear in both the friends and groups feeds (**INFERRED**).
- Keep the first occurrence, but remember which sources it appeared in (useful for diagnostics).
- Shared posts are separate stories (their own `post_id`). Do not dedup a share against its original.

**Pacing (risk control, INFERRED from S3/S10):**
- Never fetch the four sources in a burst.
- Space requests by ≥1.5 s with jitter. fbk uses lognormal gaps and a ±50% page gap.
- Fetch only on user scroll (IntersectionObserver near the bottom), and stop when the tab is hidden.
- fbk caps mutations at 40/day. fbscrape found that sustained CHRONOLOGICAL *group* scraping correlates with account suspension [S10].
- MFGA's volume should stay close to a human scrolling four Feeds tabs.

**Page 1 without requests.** If the user opened `/?filter=X&sk=h_chr`, source X's first page is already in the SSR blocks (§4.4).

**Option B (single "All" feed).** One source, `MOST_RECENT_FEED_DEFAULT`, with the same classifier. Prefer it if diagnostics show the strict classifier leaves it clean (§4.2).

**`doc_id` invalidation.** On error `1570245` or `1357010`, re-discover (§11), then retry once [S3].

**Cursor lifetime.** Cursors embed server state, and their lifetime is unknown. When paging deep after a long pause, an expired cursor may return an error or an empty page. Restart that source from the top and rely on dedup. **INFERRED.**

---

## 10. Rendering to the 2010 stream (task item c): field mapping

| 2010 element | Data |
|---|---|
| 50 px avatar | §5.2 `profile_picture.uri` (actor photo strategy) |
| bold blue actor name (+ " ▸ Group") | `actors[0].name`, link `actors[0].url`; group from `to` (`__typename:"Group"`) or `target_group`, link `to.url` / `https://www.facebook.com/groups/<id>/` |
| inline message | §5.3 text + ranges → links (User/Page → their URL, Hashtag → its URL, ExternalUrl → unwrapped `web_link.url`) |
| attachment block | §5.4 / §5.5 (photo grid ≤ 4, album "+N", link card with title/source/description, `<video controls preload=none src=progressive HD/SD>`) |
| shared story | recursive render of `attached_story`, indented, with the original actor and time |
| "26 minutes ago · Comment · Like/Unlike" | relative time from `creation_time`; permalink from §5.1; Like toggles `viewer_feedback_reaction_info` (§7) |
| "You and N others like this." | reaction total and viewer reaction (§5.6). Names are not available without a dialog query. |
| "View all N comments" | comment total (§5.6); expand with `CommentsListComponentsPaginationQuery` (§5.7) |
| comment rows (author pic, name, body, time) | §5.7 comment fields |
| "Write a comment…" | `useCometUFICreateCommentMutation` (§7.3); disable if `can_viewer_comment === false` |

---

## 11. Discovering operation doc_ids (task item 6)

### 11.1 Module form
Every Relay operation ships a tiny module whose export is the doc_id string. Verbatim, 2025-10 bundle [S5 HIGH]:

```js
__d("CometNewsFeedPaginationQuery_facebookRelayOperation",[],(function(a,b,c,d,e,f){e.exports="25027116716920260"}),null);
__d("CometModernHomeFeedQuery_facebookRelayOperation",[],(function(a,b,c,d,e,f){e.exports="9174561626000918"}),null);
__d("FeedsCometFilterPanelQuery_facebookRelayOperation",[],(function(a,b,c,d,e,f){e.exports="10051869914845503"}),null);
```

- The operation's `…$Parameters` / `.graphql` module references it: `params:{id:b("<Op>_facebookRelayOperation"), name:"<Op>", operationKind:"query"|"mutation", text:null, providedVariables:{…}}`. [S5]
- Bundles come from `https://static.xx.fbcdn.net/rsrc.php/v4/…/*.js`. 313 bundle URLs were referenced by the logged-out page on 2026-10-21 [S6].

### 11.2 Ways to obtain doc_ids at runtime, ranked

1. **SSR preloaders** (§3.6): `queryID` for `CometModernHomeFeedQuery` and anything else preloaded on the current route. Zero risk, DOM only. [S3, S6 HIGH]
2. **Extension background `webRequest.onBeforeRequest`** with `extraInfoSpec:["requestBody"]` on `*://www.facebook.com/api/graphql/*`.
   - `details.requestBody.formData` gives `fb_api_req_friendly_name`, `doc_id` and `variables` (and the `__*` fields) of **every** request Facebook itself makes, including `CometNewsFeedPaginationQuery` when Facebook paginates, `CometUFIFeedbackReactMutation` when the user reacts natively, and comment creates.
   - It is non-blocking and invisible to page JS. Persist `{friendlyName → {docId, variablesTemplate, rev: SiteData.__spin_r, seenAt}}`.
   - **HIGH** (standard WebExtension API, available in Chrome MV3 and Firefox).
   - Not available to the userscript build.
3. **Read-only `require` in MAIN world:** `try { require('<Op>_facebookRelayOperation') } catch {}`.
   - Used in production by opentabs (2026) and browser-act [S12, S11]. It returns the string once the module is defined.
   - **Caveat (INFERRED):** requiring an undefined module throws, and Facebook may log that through its error reporter.
   - Guard: call only after `requireLazy` resolves. `requireLazy(['<Op>_facebookRelayOperation'], id => …)` waits until the module is defined; it does not load it (**INFERRED** from Facebook module-system conventions; not tested).
   - **Caveat (INFERRED):** lazy-loaded operations, such as the comment mutation, may not be defined until Facebook's own UI needs them. Fallback: 2, then 5.
   - **MAIN-world injection:** a manifest `content_scripts` entry with `"world":"MAIN"` (Chrome ≥111; Firefox ≥128 **INFERRED**) or `scripting.executeScript({world:'MAIN'})`. Userscript: `@grant none` / `unsafeWindow.require`.
   - Read-only use of `require` does not trip any GHL check (§8). **INFERRED.**
4. **Wrapping `__d` at document_start** to observe `<Op>_facebookRelayOperation` definitions as bundles load. **Not recommended.**
   - Unknown whether Facebook defines `__d` with a function declaration (a global function declaration replaces a configurable accessor and would bypass a setter trap) or an assignment.
   - A wrapped `__d` has a non-native `toString`. No GHL check on `__d` was seen, but `Function.prototype.toString` checks exist.
   - Wrapping makes our code part of every module definition: a stack-trace and performance risk.
   - Use only behind a diagnostics flag. **LOW confidence it is safe.**
5. **Fetch Facebook bundles and grep** (extension background has host permissions for `static.xx.fbcdn.net`):
   - collect the `rsrc.php` URLs from the page HTML and the `deferred-scripts` JSON;
   - fetch them (cached by URL hash, which is content-addressed);
   - regex `__d\("(\w+)_facebookRelayOperation",\[\],\(function\([^)]*\)\{[a-z]\.exports="(\d+)"\}`.
   - Works for any operation in any bundle the page references. fbk's `registry refresh` does this server-side: 170 bundles, 1031 operation pairs, of which 272 are mutations [S3 HIGH].
   - Cost: bandwidth. Lazy bundles are not referenced until needed. **MED.**
6. **Hard-coded fallback table** (§14) with a staleness check. A `1570245`/`1357010` error triggers 2→3→5 rediscovery.

### 11.3 The `require` global
- Comet exposes `window.require`, `window.requireLazy` and `window.__d` (module system), plus `window.Env`. [S12, S11, S6]
- Live 2026-10-21: each page has 41 `data:` scripts that call `requireLazy(["ServerJSPayloadListener"],…)` [S6].
- Useful read-only modules: `DTSGInitialData`/`DTSGInitData`, `LSD`, `CurrentUserInitialData`, `SiteData`, `<Op>_facebookRelayOperation`.
- **Do not call** mutating or internal modules.

---

## 12. Diagnostics / skeleton dump (strongly recommended)

Because nobody on the team can observe logged-in Facebook, ship a diagnostics panel. Log only key names, typenames and counts; never values.

- Tokens found: which names, the token prefix (first 3 characters), and the jazoest length.
- Preloaders: `queryName → queryID`.
- `Env` keys present (names only), and whether `q9k7m2x` exists and its length.
- Per response: operation, doc_id, line count, labels seen, `is_final`, edge count, and edges by node typename.
- Per edge:
  - edge key set, so new aliases show up (e.g. a new `*spo*` key);
  - category decode result (`ORGANIC`/`SPONSORED`/…/`UNDECODABLE`);
  - the classifier's reason;
  - the set of typenames inside the node (bounded).
- "Skeleton" of one story: the JSON tree with values replaced by type tags and arrays cut to 1, matching the format of `samples/*.trimmed.jsonl`. Users can paste it into issues.
- Mutation outcomes: request variables (redacted), `errors[].code`, and the echoed counts.

---

## 13. Pacing and safety notes (INFERRED from S3/S10; no MFGA measurements yet)

- **fbk governor:** lognormal inter-arrival gaps, hourly and daily caps, a **40 mutations/day** cap, soft-block cooldown, and checkpoint disengagement [S3].
- **Account-warning HTML markers** (fbk, observed live 2026-09): "We suspect automated behaviour", "suspicious activity on your account", "temporarily restricted", "permanently disabled", "unusual activity". Checkpoint flag: `"is_checkpointed":true` in config frames [S3 HIGH]. If one of these appears, stop all MFGA requests.
- **fbscrape:** chronological group-feed scraping correlated with suspensions; Facebook's UI default sort is the lowest-fingerprint choice [S10 MED].
- **MFGA behaviour:**
  - only fetch on scroll;
  - at most one GraphQL request in flight;
  - ≥1.5 s spacing with jitter;
  - comments fetched lazily;
  - no background polling while the tab is hidden.

---

## 14. Observed doc_ids (all expire; for fallback and sanity checks only)

| Operation | doc_id | Date / deploy revision | Source |
|---|---|---|---|
| CometModernHomeFeedQuery | 9174561626000918 | ~2025-10 | S5 |
| CometModernHomeFeedQuery | 28024744447224397 | 2026-09-18, rev 1047871790 | S3 v2 |
| CometModernHomeFeedQuery | 28044109855291494 | 2026-09-20, rev 1047963790 | S3 v3 |
| CometModernHomeFeedQuery | 28136951115834703 | after 2026-09-20 (heal log) | S3 docs/11 |
| CometModernHomeFeedQuery | 28176044945385264 | undated (≥2026-09?) | S8 |
| CometNewsFeedPaginationQuery | 25027116716920260 | ~2025-10 | S5 |
| CometNewsFeedPaginationQuery | 28431709043107123 | 2026-09-18 | S3 v2 |
| CometNewsFeedPaginationQuery | 28827638856853689 | 2026-09-20 | S3 v3 |
| CometUFIFeedbackReactMutation | 27646120298312844 | 2026-09-18 and 09-20 | S3 |
| useCometUFICreateCommentMutation | 28882491998025365 → 39607465588840384 | 2026-09-18 → 09-20 | S3 |
| CometUFIDeleteCommentMutation | 28058620387108821 | 2026-09 | S3 |
| useCometUFIEditCommentMutation | 28765227863112159 | 2026-09-18 | S3 v2 |
| CometUFIReactionsDialogQuery | 28316088138022831 | 2026-09-18 | S3 v2 |
| CometFeedFavoritesEndOfFeedMessageQuery | 9839941666067123 | 2026-09 | S3 |
| FeedsCometFilterPanelQuery | 10051869914845503 | ~2025-10 | S5 |
| GroupsCometFeedRegularStoriesPaginationQuery | 26577462205242925 | undated | S11 |
| ProfileCometTimelineFeedQuery | 28736035046001218 | 2026-09-20 | S3 v3 |
| FriendingCometFeedPYMKHScrollPaginationQuery | 23978308165110357 | 2026-09-18 | S3 v2 |
| CometFeedStoryExecuteNFXActionMutation / Undo (hide post etc.) | 28746494401615167 / 27602007642724569 | 2026-09 | S3 |
| SiteData.server_revision (logged-out) | 1051133768 | 2026-10-21 | S6 |

---

## 15. Open questions, gaps and risks (what we could NOT verify)

1. **No logged-in observation by us.** Everything logged-in comes from third-party captures dated 2026-09 (fbk) and 2026-10-10…12 (HushFacebookWeb, webcleaner), and from Facebook's own JS (2025-10 bundles plus the live 2026-10-21 logged-out bundles).
2. Whether `MOST_RECENT_FEED_DEFAULT` ("All") includes suggestions or ads beyond what §6 catches: **unknown**. Measure with diagnostics.
3. Whether the `cat_sensitive.enc` hash algorithm is unchanged in 2026: **MED**. Our decoder self-reports.
4. Whether `Env.q9k7m2x` typename obfuscation is active for Relay feed responses on logged-in pages: **unknown**. The restore step is cheap; always apply it.
5. The non-null shape of `viewer_feedback_reaction_info`, and whether `input.tracking:[]` is accepted for reactions in 2026: **INFERRED**. The first live test should compare the result against the echo.
6. Whether `require()` of a not-yet-defined module is logged by Facebook: **INFERRED** risk. Prefer `requireLazy`, webRequest, and preloaders.
7. Firefox content-script fetch semantics (`content.fetch`) and MAIN-world support version: verify on the target versions.
8. The `GroupsCometCrossGroupFeedPaginationQuery` response container: unverified. Treat it like the news feed and probe with diagnostics.
9. Comment ordering-intent variable name: unverified.
10. Facebook's mobile shell (logged-in phones get responsive www) delivers server-driven components without readable sponsored markers [S1, 2026-10-12]. This dossier covers the desktop Comet shell only.
11. A larger profile-picture source than the 24 px actor-photo field (§5.2): unknown.
12. uAssets `quick-fixes.txt` line 158 (issue comment 4635090748) rewrites `return r instanceof ArrayBuffer` in Facebook scripts to `return r.constructor.name==="ArrayBuffer"`. That suggests some Facebook response path handles `ArrayBuffer` bodies and fails with cross-realm (replaced) buffers. It is irrelevant to our own requests. It matters only if MFGA ever edits Facebook's XHR responses. **LOW**, not investigated further.
13. Group-post timestamps carry `timestamp.override_url` such as `https://www.facebook.com/groups/<gid>/?multi_permalinks=<post>&hoisted_section_header_type=recently_seen`. Prefer `timestamp.story.url` / `permalink_url` for our links [S4].

---

## 16. Samples index (`…/scratchpad/research/samples/`)

**Trimming convention** (files marked `.trimmed`):
- Heavy subtrees are replaced by the string `"<trimmed>"`: `tracking`, `encrypted_*`, `supported_reaction_infos`, `plugins`, `ghl_label`, `debug_info`, `feed_backend_data`, `sr_payload`, `prefetch_uris_v2`, DASH XML, etc.
- Arrays are cut to their first element, followed by a string marker `"<+N more trimmed>"`. This also applies to `style_list`.
- Long strings end in `…<trimmed N chars>`.
- `path` arrays were restored by hand to the real values.

Test code that loads these samples must skip the marker strings.

**Licensing note:** HushFacebookWeb is MIT-licensed. The fbk license was not checked. Both are used here as research references. Do not ship their capture blobs (`tracking` strings etc.) verbatim in MFGA.

| File | What | Provenance / date |
|---|---|---|
| `feed-CometNewsFeedPaginationQuery-2026-10-10.trimmed.jsonl` | Real 3-line feed page: root edge (friend text post with Follow-suggestion title), stream edge (group share of a photo post), page_info defer. Ids, text and URLs scrubbed by the source; trimmed here (tracking and supported_reaction_infos removed; arrays cut to 1) | HushFacebookWeb tests/fixtures (MIT), captured 2026-10-10 [S4] |
| `feed-group-posts-ai-label-2026-10-11.trimmed.jsonl` | Two group-post stream edges: album with subattachments, single photo, AI label, `GroupJoinForumAction` suggestion, `ExploreRecommendationContext`, `unconnected_waist_data` | S4, 2026-10-11 |
| `feed-reels-ShowcaseFeedUnit-2026-10-11.trimmed.jsonl` | Reels row unit (`ShowcaseFeedUnit`, `SHOWCASE_SHORT_VIDEO`) with video delivery fields | S4 |
| `home-ssr-data-sjs-RelayPrefetchedStreamCache-2026-10-10.trimmed.jsonl` | Inline SSR blocks: `ScheduledServerJS` → `__bbox.require` → `RelayPrefetchedStreamCache.next(adp_CometModernHomeFeedQueryRelayPreloader_…)` root and stream payloads | S4 |
| `video-delivery-2026-10.trimmed.jsonl` | `videoDeliveryResponseFragment` with `progressive_urls` (SD/HD) and DASH | S4 |
| `comment-order-intents-2026-10.jsonl` | Comment ordering intents | S4 |
| `request-capture-format-example-2026-10.jsonl` | Shape of a captured request (method, path, friendly name, doc_id, variables) | S4 |
| `live-loggedout-page-frames-2026-10-21.txt` | Verbatim (tokens redacted) `SiteData`, `LSD`, `DTSGInitialData`, `DTSGInitData`, `CurrentUserInitialData`, `envjson`, `__eqmc`, `CometRootEntryPointRenderer.init` preloaders, `RelayPrefetchedStreamCache` block | Live fetch from this container, 2026-10-21 [S6] |
| `mutation-CometUFIFeedbackReactMutation-2026-09.json` | Live-captured reaction variables (like / remove), reaction-id table, response notes | fbk, 2026-09-18 [S3] |
| `mutation-useCometUFICreateCommentMutation-2026-09.json` | Live-captured comment variables, plus the older minimal shape (STALE) | fbk 2026-09 [S3]; ws3-fca [S15] |
| `request-feed-variables-2025-2026.json` | Home-feed variables (live 2026-09), Feeds-tab overrides (FB source 2025-10), pagination argument names, group-feed variables, comments-list notes | S3, S5, S8, S11, S13, S10 |
| `reassembly-test-vector.synthetic.jsonl` | **Synthetic** JSONL exercising stream / defer / ad / PYMK for unit tests of §3.4 and §6.4 | written here, modelled on real labels |

---

## 17. Sources (local copies are under `…/scratchpad/refs/`)

- **S1** webcleaner (pyxis3-ai): `refs/webcleaner/README.md` (lines 98, 109, 110, 531: live logged-in verification **2026-10-12**), `webcleaner.user.js` 384-505 (XHR subclass, toString masking, frame guard) and 1675-1718 (sponsored edit), `test/facebook.test.js` 105-130 (JSONL fixture). HIGH.
- **S2** uBlock Origin uAssets snapshot 2026-10-21: `refs/uAssets/filters/quick-fixes.txt` 109-158, `filters.txt` 305-350, `annoyances-others.txt` 667-680. Individual rule dates unknown; some keyed on 2024-era names (**STALE?**).
- **S3** hopfian/fbk ("research client", live calibration **2026-09-18…20**, deploy revs 1047871790 / 1047963790). Local `refs/raw/hopfian_fbk/`: `src/constants.py`, `src/graphql/client.py`, `src/graphql/parsing.py`, `src/auth/bootstrap.py`, `src/transport/headers.py`, `src/surfaces/feed.py`, `data/captured_mutations.json`, `data/captured_comment_mutations.json`, `data/doc_id_registry_v2.json` (2026-09-18), `data/doc_id_registry_v3.json` (2026-09-20), `04-reference-feed.md`, `docs/11-troubleshooting.md`. Raw: `https://raw.githubusercontent.com/hopfian/fbk/HEAD/<path>`.
- **S4** SysAdminDoc/HushFacebookWeb v0.0.4 (MIT), captures **2026-10-10/11**. Local `refs/raw/hush/web/`: `src/features/feed/ad-markers.js`, `src/core/net/hooks.js`, `src/core/net/payload.js`, `src/core/media-index.js`, `CONTRIBUTING.md`, `tests/fixtures/*.jsonl`.
- **S5** Facebook JS bundles saved with a "Save page" capture in GitHub repo peblo13/21102025 (folder name suggests **2025-10-21**; doc_id magnitudes agree). Local `refs/raw/fbbundles/peblo13_21102025_u6y2CMb7ukN.js` (Relay artifacts `CometNewsFeedPaginationQuery.graphql`, `CometModernHomeFeedQuery.graphql`, `FeedStoryCategory`, `GHLFeedStoryCategoryObfuscationUtils`, `useGHL*`, `useLogCometFeedUnitRenderAttemptEvent`) and `…_xqgbZQq2-Ee.js` (`CometHomeRootEntryPointVariables`, `CometHomeRoot.entrypoint`, `FeedsCometFilterPanelQuery_facebookRelayOperation`). Also `chienhuak_YC4--bWJ7ew.js` (undated, same family). Facebook's own code; HIGH for its date.
- **S6** Live logged-out fetch of `https://www.facebook.com/?filter=friends&sk=h_chr` from this container at **2026-10-21T11:29Z**, plus its 311 referenced `static.xx.fbcdn.net/rsrc.php` bundles (`e3z46jPnNA-.js`, `dc0963WG87T.js`, `EXRGS8jx…js` contain `GHLDetectionUtilsPreludeSafe`, `GHLTypenameRestore`, `GHLServerJSParse`, `GHLRelayJsonParse`; `ynvALLIPkll.js` contains `FeedStoryCategory`). Local `refs/raw/live/`. HIGH.
- **S7** vinikjkkj/wa-diff `files/GHLDetectionUtils.js`, `GHLDetectionUtilsPreludeSafe.js`, `GHLRelayJsonParse.js`, `GHLServerJSParse.js`, `GHLTypenameRestore.js` (WhatsApp Web, same Meta code; identical to S6). Local `refs/raw/wadiff/`.
- **S8** kremec/subsocial `src/platforms/facebook/service.ts`, `schemas/feed-response-schema.ts` (undated, doc_id suggests ~2026-09+). Local `refs/raw/misc/subsocial_*`. MED.
- **S9** tamnd/facebook-cli `fb/graphql.go`, `fb/relay.go`, `fb/descriptors.go`, `fb/reactions.go` (2026; signed-out focus). Local `refs/raw/tamnd/`. MED.
- **S10** MEOMcGill/fbscrape `docs/endpoints/group_timeline.md`, `docs/endpoints/comments_list.md`, `docs/adding_endpoints.md`, `fbscrape/response.py` (active 2026-08). Local `refs/raw/fbscrape/`. MED.
- **S11** browser-act/skills `solutions/social-listening/facebook-groups-scrape-posts/scripts/scrape-posts.py` (in-page `require` + fetch for groups; undated). Local `refs/raw/browseract/`. MED.
- **S12** opentabs-dev/opentabs `plugins/facebook/src/facebook-api.ts`, `tools/react-to-post.ts` (plugin v0.0.89). Local `refs/raw/opentabs/`. MED for tokens; LOW/STALE for the reaction variables.
- **S13** 403Code/Bot-React `bot.gs` (full Comet form body incl. `__aaid`, `__hsdp`, `__hblp`, `__sjsp`, `__crn`; undated). Via GitHub code search. LOW-MED.
- **S14** jakka351/Mark-Interceptor `README.md` (request-parameter glossary). Local `refs/raw/misc/markinterceptor_README.md`. LOW-MED.
- **S15** nethgraves/ws3-fca `src/deltas/apis/posting/comment.js`; Nexus-016/Nexus-fCA `src/setPostReaction.js` (older doc_ids; **STALE?**). Local `refs/raw/misc/`.
- **S16** Reaction-id cross-check: tamnd `fb/reactions.go`; m008v/fbchat-v2 `_reactionPost.py`; kevinzg/facebook-scraper `utils.py`; 403Code `bot.gs` (via code search).
- **S17** zbluebugz facebook-clean-my-feeds `beta/archive/beta-4-16.js` 3385-3440 (React props `feedEdge.category === 'SPONSORED'`, `story` with a `SponsoredData` child; 2024, **STALE?**). Local `refs/facebook-clean-my-feeds/`.
- **S18** ajaygandecha/unplugged `FacebookProvider.swift` (`MOST_RECENT_FRIENDS_FEED` with `CometModernHomeFeedQuery`; ~2024, **STALE?** doc ids). Local `refs/raw/misc/`.
- **S19** jazoest implementations via GitHub code search (davidarroyo1234/InstagramUnfollowers, jackwener/OpenCLI, wr1159/msoutlookthreads, irfan420x/orion-fca, …), plus the live check in S6.
- **S20** uBlockOrigin/uAssets issue #3367 (WebFetch summary, 2026-10-21): 2026-08-19/20 statements that the uBO team stopped supporting Facebook.
