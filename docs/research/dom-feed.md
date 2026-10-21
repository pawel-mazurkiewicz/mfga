# MFGA research dossier: the facebook.com (Comet) feed-post DOM, 2024-2026

Prepared 2026-10-21 for MFGA, a browser extension and userscript that restyles 2026 facebook.com to look like Facebook in 2010.

**Scope.** This dossier covers the desktop Comet DOM of the News Feed and the feeds next to it. It serves two jobs:

- **Junk:** detect and hide units such as ads, suggested posts, Reels, Stories and PYMK.
- **Parts:** identify each semantic part of a real post, so MFGA can restyle it the 2010 way or graft its own elements in.

The GraphQL and data layer, the page chrome (top bar and left rail), the 2010 visual spec and platform constraints are covered by sibling dossiers. They come up here only where they touch the feed DOM.

**Method.** I did not fetch a logged-in Facebook page from this sandbox, because a logged-out facebook.com redirects to the login form. Every claim therefore rests on:

- real DOM captures committed to public repositories in 2026;
- live-dated code comments in actively maintained blockers and userscripts;
- filter lists.

Each claim carries the source ID (see §1), the date, and a confidence level.

## 0. Legend and summary

### 0.1 Confidence and status tags

| tag | meaning |
|---|---|
| **HIGH** | Seen in at least 2 independent 2026 sources, at least one of them a real DOM capture or a live-dated code comment. |
| **MEDIUM** | One 2026 source (a capture or a live-dated comment), or several consistent 2025 sources. |
| **LOW** | One source with unclear provenance, 2024-only evidence, or evidence contradicted elsewhere. |
| **INFERRED** | Not observed. Reasoning is given. Verify on a live page before shipping. |
| **STALE** | Evidence older than 2024, or contradicted by 2026 live evidence. Keep only as a fallback, if at all. |
| **CONTESTED** | Credible 2026 sources disagree. Probably a cohort or A/B difference, so support both forms. |

Facebook serves different DOM to different account cohorts and routes at the same time. "Current" below means "seen on at least one 2026 cohort", not "universal".

### 0.2 The ten things that matter most

1. **The post unit is `div[aria-posinset]` (HIGH, Mar–Oct 2026).**
   - It has no `role`.
   - Its subtree is `div[aria-posinset] > div > div[data-virtualized="false|true"] > div > …content…`.
   - `role="article"` now marks comments, posts opened from a permalink or in a dialog, and some "Loading..." skeletons. It does **not** mark home-feed posts.
   - Sources: [HUSH] 2026-10-10, [UA-CAP] 2026-10-19/20, [PAGRU] 2026-03-13, [TOL], [QUORUM].
2. **The home feed no longer has `role="feed"` (CONTESTED, leaning HIGH for 2026-10).**
   - Posts sit under the `div[role="main"]` column, after a visually hidden `<h3>Feed posts</h3>` and an `aria-hidden` spacer.
   - Single-group pages and search results still had `role="feed"` in Mar–Jul 2026.
   - Two userscripts dated Jul and Sep 2026 still rely on `[role=feed]` on home, so keep a fallback.
3. **The stable hooks are attributes, not classes.**
   - `data-ad-rendering-role` takes these values: `profile_name`, `story_message`, `meta`, `title`, `description`, `like_button`, `comment_button`, `share_button`, `cta-`, `image`.
   - Other stable hooks: `data-ad-preview="message"` and `data-ad-comet-preview="message"`, `data-virtualized`, `aria-posinset`, `aria-label`/`role`, and `data-visualcompletion`.
   - These attributes appear on organic posts too. They are part identifiers, **not** ad signals (HIGH).
4. **The ad label is deliberately unreadable.** In 2026 it reads "Ad" more often than "Sponsored". It is drawn in one of four ways, all of which also occur on organic timestamps:
   - an SVG `<use>` chain about 7 deep that ends in a `<text>` (2026-10);
   - `aria-labelledby` pointing at nodes that disappear;
   - one character per span, shuffled with flex `order`, with absolutely positioned decoys and U+034F after each letter;
   - nested `<b>` elements.
   A naive textContent read yields garbage or false positives.
5. **The most dependable DOM ad signals, in order:**
   1. A header link that is query-only, `?__cft__…`, and has **no** `__tn__` (the "Sponsored/Ad" info link). [WC] measured it live in 2026-10; [GF598911] uses it.
   2. A link to `/ads/about` (high precision, but missing in the Oct-2026 ad capture [UA-CAP], so recall is uneven).
   3. The decoded header label, matched against a per-locale dictionary.
   4. A long `__cft__[0]` token: at least 290 characters per [UBO], or 311 counted to the end of the href per [ZB502]. This is fragile.
   Do not use `data-ad-preview`, `data-ad-rendering-role`, or a "Learn More" CTA as ad signals. Every organic post in the Oct-2026 captures carries a hidden decoy link card with a "Learn More" CTA.
6. **Suggested content no longer says "Suggested for you".** A non-followed author is marked by a `div[role="button"]` reading "Follow" or "Join" (PL "Obserwuj" / "Dołącz") inside the post's **first** heading.
   - Its aria-label is "Follow <Name>".
   - The rule only applies on home, `?filter=` and `/groups/feed/`. Gate it by route: in a group you belong to, members' posts show "· Follow" legitimately [NYC].
   - Ignore Follow buttons inside embedded reels or shared posts (h5) [UA-CAP].
7. **The header and footer anatomy is stable and readable by attribute.**
   - Avatar: `a[aria-label=Name] svg[role=img]`.
   - Name: `[data-ad-rendering-role=profile_name] :is(h2,h3,h4) a` (h5 for an embedded or shared post).
   - Menu: `[aria-label^="Actions for this post"]`. PL: "Działania dla tego posta".
   - Hide: `a[aria-label^="Hide post"]` or `a[aria-label="hide post"]`. PL: "ukryj post".
   - Action buttons: `div[role=button][aria-label="Like"|"Leave a comment"|…]`, each containing a `data-ad-rendering-role="*_button"` marker.
   - There are two footer layouts: a separate summary row (to mid-2026) and counts inside the buttons (Sep–Oct 2026).
8. **Hide by CSS, never by removing nodes.** On desktop, `display:none` on the slot or the post's first child works with the virtualiser ([WC], [BOUNCER], [FCMF-AS], [HUSH]). Two refinements:
   - Do not write attributes on the feed's direct children; [HUSH] reports they stall infinite scroll. Mark the post's first child and hide through `:has()`.
   - Never hide anything within about 1200 px of the bottom of the document, where the load-more sentinel lives [WC].
9. **No stable post ID exists in the DOM.**
   - The timestamp `href` is a per-render `?__cft__…` token or the home URL until hover. [HUSH] found 0 of 60 links naming the post.
   - React stores nothing on the elements, per [HUSH] and [ANYSAVE]; [FCMF-AS] reads `__reactFiber$`, so this is CONTESTED.
   - Key per-post state on the element through a WeakMap, or take the ID from the GraphQL layer.
10. **Polish coverage.** A real Polish capture from 2026-03 confirms most action-bar and menu labels (see §5.1). These remain **unverified** in Polish: "See more", "Write a comment…", "Comment by", "Add friend", "Ad", and "Feed posts".

## 1. Source register

All local paths are relative to `/tmp/claude-0/-home-user-mfga/80791cd0-cb87-5148-8f51-26da76f4aa2e/scratchpad/refs/`. "Live-dated" means the author wrote a date of live observation in a code comment.

| ID | Source | Kind | Date | Local path |
|---|---|---|---|---|
| UA-CAP | HeitechSoft/unalgorithm Facebook fixtures. Anonymized real captures: words are scrambled except FB UI words, and `?query` hrefs are rewritten to `https://www.facebook.com/`. | **real DOM, EN** | captured 2026-10-19/20 | `gh2026/HeitechSoft_unalgorithm/packages/platforms/fixtures/facebook/2026-10-{home-1..9,ads-1,reels-1..3}.html`; capture script `scripts/capture/facebook.js` |
| UNALG | unalgorithm adapter code, `live2026.ts` and CHANGELOG | code + notes | 2026-10-16..20 | `gh2026/HeitechSoft_unalgorithm/packages/platforms/src/facebook/*`, `.../fixtures/facebook/live2026.ts` |
| HUSH | SysAdminDoc/HushFacebookWeb 0.0.4 (ports FB Feed Filter 0.1.0.17, MIT 2026) | code, live-dated 2026-10-10..12 | HEAD 2026-10-18 | `gh2026/SysAdminDoc_HushFacebookWeb/src/...` |
| WC | pyxis3-ai/webcleaner 8.23.0 (README plus `test/fixtures/fb-desktop.html`) | code + README, live-verified | 2026-10-12 | `webcleaner/` |
| BOUNCER | imbue-ai/bouncer `FacebookAdapter.ts` | code | 2026-10-20 | `gh2026/imbue-ai_bouncer/` |
| TOL | gtech/tolerance `scraper.ts` | code | 2026-10-18 | `gh2026/gtech_tolerance/` |
| UBO | uBlockOrigin/uAssets `filters/filters.txt` l.264-352, `filters/quick-fixes.txt` l.110-156, `filters/filters-mobile.txt` l.32-36 | filter list | HEAD 2026-10-21. Individual rules date from 2023 to 2026. | `uAssets/` |
| FCMF-AS | Artificial-Sweetener/facebook-clean-my-feeds 6.3.2 (fork of zbluebugz) | code + tests | 2026-10-05 | `fcmf-artificial-sweetener/` |
| GF598911 | Greasy Fork 598911 "FB Feed Cleaner" 0.6.2 | userscript | 2026-10-06 | `greasyfork/gf-598911.user.js` |
| GF600341 | Greasy Fork 600341 "Stop Feed Auto-Refresh" | userscript | 2026-10-15 | `greasyfork/gf-600341.user.js` |
| SIEVE | codepurse/Sieve | code | 2026-09-02 (HEAD 2026-10-13) | `gh2026/codepurse_Sieve/` |
| NOOK | nook-browser/Nook `facebook-sponsored-blocker.js` | code | 2026-09 (HEAD 2026-10-15) | `gh2026/nook-browser_Nook/Packages/NookBlocker/...` |
| ZK | zenithkandel/fb-post-image-downloader, "facebook dom finding.md" | **real DOM, EN** | 2026-09-12 | `gh2026/zenithkandel_fb-post-image-downloader/`; extracted to `../zk_block_7.html`, `../zk_block_18.html` |
| GF594983 | Greasy Fork 594983 "Kill News Feed" | userscript | 2026-09 | `greasyfork/gf-594983.user.js` |
| FSPB | SaifMahmud366/facebook-sponsored-post-blocker 2.1 | userscript | 2026-09-18 | `facebook-sponsored-post-blocker/` |
| SFX | matt-kruse/socialfixerdata `filters.json`, `hideable.json`, plus Social Fixer 31.1.1 (Greasy Fork 583964) | data + code | 2026-08-09 / 2026-06-22 | `socialfixerdata/`, `greasyfork/gf-583964.user.js` |
| ANYSAVE | yusupsupriyadi/anything-save-extension | code | 2026-07-29 | `gh2026/yusupsupriyadi_anything-save-extension/` |
| GF588918 | Greasy Fork 588918 "Feed Cleaner for Facebook" 2.2.5 (cuzic) | userscript | 2026-07-29 | `greasyfork/gf-588918.user.js` |
| GF587952 | Greasy Fork 587952 "Hide Sponsored Ads + AI Content" 3.6 | userscript | 2026-07-21 | `greasyfork/gf-587952.user.js` |
| QUORUM | bluek1te/quorum, search-results fixture | **real DOM, EN** | 2026-07-03/04 | `gh2026/bluek1te_quorum/` |
| BH | browser-use/browser-harness `groups.md` | notes | 2026-04-18 | `gh2026/browser-harness/` |
| NYC | rarestg/nyc-housing-scout `examples/feed-snapshot-1.txt` (Playwright ARIA snapshot of a single group) | **real a11y tree, EN** | ≤2026-03-13 (repo HEAD 2026-04-19) | `gh2026/rarestg_nyc-housing-scout/` |
| PAGRU | pagru7/facebook-shit-remover `template.html` + `content.js` | **real DOM, PL** | 2026-03-13 | `gh2026/pagru7_facebook-shit-remover_template.html`, `gh2026/pagru7_repo/` |
| MBFC-FWD | drmikecrowe/mbfcext `.planning/examples/forward-post.html` (organic share) | **real DOM, EN** | committed 2026-03-09 (post dated "March 4") | `gh2026/drmikecrowe_mbfcext/`; tree at `../fwd_tree.txt` |
| MBFC-TS | drmikecrowe/mbfcext `src/contents/content/facebook.ts` | code | 2026-03 | same repo |
| RENT | oricho123/rentifier | code | 2026-03-03 | `gh2026/oricho123_rentifier/` |
| DOOM / LENIE | GGrzesiek DoomStop `Config.kt`; ziutus ai_assistant_lenie (`popup.js`, `social_post_text_cleanup.py`) | code (PL strings) | 2026 | `gh2026/GGrzesiek_*`, `gh2026/ziutus_*` |
| BLIND / CAM | blindpentester Tampermonkey-Scripts; bvolpato copy-as-markdown | code | 2026-09 / 2026-10 | `gh2026/...` |
| ZB502 | zbluebugz/facebook-clean-my-feeds `greasyfork-release/fb-clean-my-feeds.user.js` v5.02 | code + **dictionary** | Nov 2024 (repo HEAD 2025-12-17) | `facebook-clean-my-feeds/` |
| ZB328 | zbluebugz `beta/archive/beta-3-28.js` | code + **dictionary** | ~Sept 2022, **STALE** | `facebook-clean-my-feeds/beta/archive/` |
| GF misc | Greasy Fork 577212 (FXCK Meta Stories), 575507 (Wide Feed), 524987/549966 (Old Facebook 2018/2013 restyles), 581285 (Expand All Comments) | userscripts | 2025-2026 | `greasyfork/` |
| BRIEF | MFGA research BRIEF.md | project facts | 2026-10 | research dir |

The scripts I wrote to extract data are in the scratchpad `tools/` directory (one level above `refs/`):

- `extract_dict.js` and `extract_kw328.js`: evaluate zbluebugz's dictionary literals in an empty `vm` sandbox.
- `gen_dict_tables.py`: renders those dictionaries as the §5 tables.
- `tree.py`: dumps an HTML capture as an indented tree.

## 2. Feed containers by surface

### 2.1 The shape every surface shares (2026)

This is the skeleton of the home feed from the Oct-2026 captures ([UA-CAP] `2026-10-ads-1.html` and `2026-10-home-*.html`). The anonymizer stripped classes and most attributes but kept the nesting:

```
div[role="main"]
  div
    h3  "Feed posts"                      <- visually hidden heading, no attributes left after anonymizing
    div[aria-hidden="true"]               <- spacer
    div                                   <- THE LIST (no role, no aria-label)
      div                                 <- list item = "slot" (the feed's direct child)
        div > span > div > div > … (6-8 wrapper levels, depth varies by capture)
          div[aria-posinset="12"]         <- POST UNIT; no role, no aria-describedby/-labelledby
            div                           <- [HUSH] says this first child is display:contents (live 2026-10-11)
              div[data-virtualized="false"]   <- flips to "true" when scrolled far away; content unmounted
                div                       <- [BOUNCER] "post element" (mounted only while virtualized=false)
                  div …
                    div[aria-hidden="true"] > blockquote > span[dir=auto] > span "word"   (x ~11-22 honeypots)
                    div[aria-hidden="true"][role="button"][tabindex="-1"]
                    … header / message / attachment / footer / inline comments …
```

**Confirmations and status:**

- **Nesting.** Confirmed in [PAGRU] (2026-03, Polish): `div[aria-posinset="2"].x1a2a7pz > div[data-virtualized="false"] > …`. **HIGH.**
- **Wrapper attribute.** [UBO] relies on the same nesting in `div[aria-posinset] > div[data-virtualized]`. In PAGRU the posinset's first child is `data-virtualized` itself, while in UA-CAP there is one plain `div` between them. That one-level difference may be a cohort difference or an anonymizer artefact; it is unresolved. Code should use the descendant selector `[aria-posinset] [data-virtualized]` rather than the child combinator.
- **The `Feed posts` heading.** [BOUNCER] (2026-10-20): "The home feed is the sibling list that follows a visually-hidden `<h3>Feed posts</h3>` inside `[role="main"]`. Each child of that list is a virtualization slot holding a `[data-virtualized]` wrapper." [UNALG] `discover.ts`: "Since 2026: the unlabelled block right after a heading … the 2026 list follows a screen-reader 'Feed posts' h3 and a spacer." **HIGH.**
- **The `Feed posts` text is localized: INFERRED.** It is a screen-reader string, so it is very likely translated. Do not match its text. Match `h3 ~ div` structurally instead.
- **Virtualized slots.** [UA-CAP] `live2026.ts` shows the far-scrolled form:

  ```html
  <div aria-posinset="900"><div><div data-virtualized="true"><div hidden=""></div></div></div></div>
  ```

  The slot and `aria-posinset` survive; the content is dropped. [BOUNCER]: "Facebook flips the wrapper to 'true' and UNMOUNTS the post's contents when it scrolls far off-screen, then mounts a fresh subtree when it comes back." **HIGH.**
- **Consequence for MFGA: HIGH.** Anything MFGA grafts *inside* a post is destroyed when the post scrolls far away, and the post comes back as a fresh subtree. Grafting must be idempotent and re-run on remount. Key verdicts by the `[aria-posinset]` element, which persists, or by a content hash. Do not key them by the inner nodes.

### 2.2 Per-surface container table

| Surface / route | Container to scope to | Post unit selector | Status / confidence | Sources |
|---|---|---|---|---|
| Home `/`, `/home.php`, `/?sk=h_nor` | `[role="main"]` → `h3` → `~ div` (the list) | `[role="main"] [aria-posinset]:not([role])` | **HIGH** (2026-10) | UA-CAP, HUSH 2026-10-10, BOUNCER 2026-10-20, UNALG 2026-10-16, TOL 2026-10 |
| Home, older or other cohort | `div[role="feed"]` | `div[role="feed"] > div`, then `[aria-posinset]` inside | **CONTESTED**: still used by GF587952 (2026-07-21) and GF594983 (2026-09); UNALG says "Until 2026" | GF587952, GF594983, UNALG |
| Feeds: friends, favorites, groups, pages, all | Same `[role="main"]` column (INFERRED, see below) | `[aria-posinset]` | **INFERRED/LOW** for DOM. The routes exist (HIGH). | HUSH (routes "documented working 2025-02"), SFX hideable 2026, ZB502, FCMF-AS |
| `/groups/feed/` (your groups' feed) | `div[role="feed"]` (2024-25); probably the same no-role list in 2026 | `div[role="feed"] > div` or `[aria-posinset]` | **MEDIUM** (2024-2026 code); 2026 DOM not captured | ZB502, FCMF-AS (`feedQueryRecent`), HUSH (hides suggestions "in your groups feed") |
| Single group `/groups/<id>/` | `[role="feed"]` whose first child is the sort widget ("sort group feed by", heading h2 "New posts") | `[role="feed"] > div` minus the first child; posts are generic `div`, not `article` | **MEDIUM-HIGH** (≤2026-03, two sources) | NYC a11y snapshot, RENT 2026-03-03 (`[role="feed"] > div`, first child is the sort widget) |
| Profile or Page timeline `/<user>`, `/profile.php?id=` | Deep nth-of-type chain in 2024 | 2026: climb from permalinks (`a[href*="/posts/"]`, `/story.php`, `/permalink/`, `permalink.php`) to the post root. INFERRED: `[aria-posinset]` also present. | **LOW**. The ZB502 chain `div[role="main"] > div > div > div > div:nth-of-type(2) > div:not([class]) > div > div[class]` is STALE (Oct 2024). | ZB502, FCMF-AS (2026-02), GF575507 `[role=main] [role=article]` (suspect) |
| Search `/search/posts?q=` | `[role="feed"][aria-label="Search results"]` | outermost `div[data-virtualized]` that contains `profile_name` or `story_message`; **no** `role=article` | **MEDIUM** (2026-07 fixture) | QUORUM |
| Permalink `/…/posts/…`, `/permalink.php`, a post opened in a dialog over the feed | `[role="dialog"]` or main | `[role="article"]` that is not a comment | **MEDIUM** | HUSH (`posts.js`: "role=article marks permalink posts and, mostly, comments") |
| Watch / Reels / Marketplace | out of scope | — | — | — |

**Feeds filter routes** (`/?filter=…&sk=h_chr`):

- **What is known.** These are the user's "only friends' updates" views.
  - [HUSH] lists `/?filter=<all|friends|favorites|groups|pages>&sk=h_chr` and says the routes were "documented working 2025-02".
  - [SFX] `hideable.json` (2026) has three entries tied to them:
    - "Left Rail (in Feeds)" = `[role=banner] ~ * [role=navigation]:has(a[href*='/?filter='])`. The left rail switches to the filter links on these routes.
    - "Header 'Feeds' button" = `a[href*='filter=all']`.
    - "Left Rail Most Recent" = `a[href*='/?sk=h_chr']`.
  - [WC] forces `/?sk=h_chr` (chronological).
  - zbluebugz ([ZB502]) and the fork ([FCMF-AS]) treat `?filter=groups` specially. Their scope is `h2[dir="auto"] + div > div`: the "Recent activity" list under an h2. For the other filters they fall back to the home-feed logic.
  - As the user notes, ads stay interleaved on `filter=friends`.
- **INFERRED.** The post units on these routes are the same `div[aria-posinset]` slots as on home. These views render the same CometFeedUnit components, so the post anatomy is identical, and none of the 2026 code distinguishes them at the post level. **Verify the container on a live page:** whether the h3 is "Feed posts" or an h2 with the filter's name, and whether `role=feed` is present.
- **uBO path gotcha (INFERRED from regex semantics).** The uBO cosmetic ad rule is gated by `:matches-path(/^\/(\?[a-z]+=\w+)?$/)`. That regex accepts `/` and `/?filter=friends`, but **not** `/?filter=friends&sk=h_chr`, because `&sk=` breaks the single-parameter pattern. A uBO user on the chronological filter URL therefore gets only uBO's json-edit (network) protection, not the cosmetic rule. MFGA must not assume uBO cleans these routes.

### 2.3 Container and post selectors from references, current vs stale

| Selector | Used by (date) | What it targets | Status |
|---|---|---|---|
| `[aria-posinset]:not([role]), [role="article"]` | HUSH `CANDIDATE_SELECTOR` (2026-10-10) | post or comment candidates, with sanity checks (nested, in a form, comment, loading, empty) | **CURRENT, HIGH** |
| `[role="main"] h3 ~ div [data-virtualized="false"] > div` | BOUNCER (2026-10-20) | mounted post element | **CURRENT, HIGH** |
| `[aria-posinset]` (+ `[data-virtualized="true"]` as the empty-slot marker) | UNALG `FB_SEL` (2026-10) | post | **CURRENT, HIGH** |
| `div[role="main"] div[aria-posinset]`, `div[role="main"] div[data-virtualized] div[role="article"]`, `h3[dir="auto"] ~ div div[aria-posinset]` (also h2), legacy FeedUnit queries | FCMF-AS `src/selectors/news.js` (2026-10-05) | post (multi-query fallback) | posinset queries **CURRENT**; article and FeedUnit **STALE on home** |
| `div[aria-posinset]` / `div[aria-posinset] > div[data-virtualized]` | UBO filters.txt (rules from 2024, still shipped 2026-10) | ad post | **CURRENT** |
| `div[aria-describedby]:not([aria-posinset])` | UBO variant (~May 2024, issue 3367 comment 2094725581); ZB502 fallback | post (an older cohort) | **STALE**: the 2026 PL and EN captures carry no `aria-describedby` on units |
| `h3[dir="auto"] ~ div:not([class]) > div > div > div > div > div` | ZB502 `nf_getCollectionOfPosts`, "mostly English" (Oct 2024) | post | **STALE** (atomic depth) |
| `div[role="feed"] > h3[dir="auto"] ~ div:not([class]) > div[data-pagelet*="FeedUnit_"] > div > div > div > div` | ZB502, "non-English" (Oct 2024) | post | **STALE**: HUSH found no `data-pagelet` on 2026-10-10 |
| nearest `[data-pagelet]` (FeedUnit_N) | GF588918 (2026-07-29) | post wrapper | **CONTESTED**: possibly cohort-specific |
| `div[role="feed"] > div` | ZB502 groups, RENT 2026-03, GF587952 (child of `[role=feed]`) | group feed, single group, older home | group: **CURRENT-ish**; home: **CONTESTED** |
| `[role=article]` | GF575507 Wide Feed, BH groups.md (2026-04-18) | "post" | **WRONG on home in 2026**: matches comments, dialogs and skeletons. BH's claim is suspect. |
| `[aria-posinset]:has(a[href*="/reel/"])`, `[style*="card-corner-radius"]` | TOL (2026-10) | reel posts and grids | **CURRENT** |
| a node with `:scope > div > div[aria-hidden="true"][data-0] > blockquote` | GF587952 (2026-07-21) | post root, identified by its honeypot children | **CURRENT** (honeypots seen 2026-03..10), but not a primary anchor |
| `div[role="navigation"] ~ div[role="main"]` | ZB502 | main column | **STILL VALID** (INFERRED: banner, navigation and main roles persist; see the chrome dossier) |

### 2.4 Top-of-feed blocks (home), siblings of the list

[HUSH] `hide-stories-tray.js` (live 2026-10-11) observed that the Home column has four children, in this order:

1. an empty block;
2. the composer, `[role="region"][aria-label="Create a post"]`;
3. the Stories block, `div[data-virtualized="false"] > div > div[role="region"][data-focus-target="stories_tray"]`;
4. the feed.

This is why BOUNCER scopes with `h3 ~ div`: "keeps out the one other `[data-virtualized]` region in [role="main"], above the feed". **HIGH.**

Other top-of-feed hooks, older or alternative:

- `[role="region"][aria-label="profile plus top of feed cards"]`. FCMF-AS (2026) uses it for the top cards.
- `a[href="/reel/"]` together with `a[href="/stories/"]` inside a region. FCMF-AS uses this pair.
- `div[aria-label="Feed Stories"]`. GF588918 (2026-07) has the I18N value `feedStories`: ja "フィードのストーリーズ", es "Historias", zh-Hant "限時動態", and so on.
- `[aria-label="Stories"]`. WC uses it.
- `a[href*="/stories/create"]`. ZB502 (2024) uses it.
- The `div[role="tablist"]` "Stories | Reels | Rooms" tab box is **STALE** (ZB328, 2022).
- `data-pagelet` values Stories, StoriesBar and StoriesPaneRoot appear in GF577212. They are **STALE or CONTESTED** in light of HUSH's finding that no `data-pagelet` exists.

## 3. Post anatomy (part identification)

### 3.1 Reference skeleton of an organic post (EN, March 2026)

The source is [MBFC-FWD]: a real capture of a friend's share of a Page post, with classes collapsed. Polish equivalents come from [PAGRU], a real capture from 2026-03-13. Oct-2026 deltas from [UA-CAP] are flagged `[2026-10]`.

```
div[aria-posinset] > div > div[data-virtualized=false] > div …
  div[aria-hidden="true"][data-0 … data-19] > blockquote > … "Facebook"     (x22 in MBFC-FWD; x11+ in UA-CAP)  HONEYPOTS
  ── HEADER ─────────────────────────────────────────────────────────────
  a[aria-label="<Name>"][role=link][href=<profile>?__cft__[0]=…&__tn__=%3C%3C%2CP-R]          AVATAR LINK
    div > svg[aria-label="<Name>"][role=img][data-visualcompletion=ignore-dynamic][style="height:40px;width:40px"]
            mask#_r_6cv_ > circle ; g[mask] > image[xlink:href="https://scontent…"]
  div[data-ad-rendering-role="profile_name"] > h4 > span > span > span > span          NAME
     > a[role=link][tabindex=0][href="https://www.facebook.com/<user>?__cft__[0]=…&__tn__=-UC%2CP-R"] > b > span "Blair …"
  span[dir=ltr] (style "--x-fontSize: 12px …")                                         BYLINE (2nd line)
     a[href="?__cft__[0]=…&__tn__=%2CO%2CP-R#?efh"][target=_blank][role=link]           TIMESTAMP / PERMALINK
        > span > span[aria-labelledby="_r_6d2_"] > span[style="display:flex"] > 56 x span (1 char each; decoys
          style="position:absolute;top:3em"; 14 visible reordered by order-classes) => "March 4 at 5:47 PM"
     span[aria-hidden=true] " · "
     svg[role=img] > title "Shared with Blair's friends"                                AUDIENCE
  div[aria-haspopup=menu][aria-expanded=false][aria-label="Actions for this post"][role=button][tabindex=0]  "…" MENU
  a[aria-label="hide post"][href="#"][role=link]                                         "X" HIDE
  ── BODY ───────────────────────────────────────────────────────────────
  div[dir=auto] > div[data-ad-rendering-role="story_message"]
     > div[data-ad-comet-preview="message"][data-ad-preview="message"] > … > div[dir=auto][style="text-align: start;"]  (one per paragraph)
  ── ATTACHMENT ─────────────────────────────────────────────────────────
  a[href="https://www.facebook.com/photo/?fbid=…&set=a.…&__cft__[0]=…&__tn__=EH-y-R"]   PHOTO
     … div[style="padding-top:125%"] … img[data-imgperflogname="feedImage"][width=512][height=640][alt="May be an image of …"]
  a[href="?__cft__[0]=…"][rel="nofollow noreferrer"][target=_blank]                      LINK CARD (here: hidden decoy)
     div[data-ad-rendering-role="meta"] "iBgTWMHI9.com" ; span[data-ad-rendering-role="title"] ;
     span[data-ad-rendering-role="description"] ; object > a … (obfuscated "Learn More", __tn__=%2CmH-y-R#?gfk)
  (shared original:) a[aria-label="Home & garden, view story"][href="/stories/…"] (36px ring svg, 28px image at 4,4);
     div[data-ad-rendering-role="profile_name"] > h5 > span[style*="-webkit-line-clamp: 2"] > … > a > b > span ;
     own timestamp (__tn__=%2CO%2CP-y-R#?acb, decodes "March 1 at 4:08 PM"), own message, div[role=button] "See more"
  ── FOOTER ─────────────────────────────────────────────────────────────
  div[data-visualcompletion="ignore-dynamic"]
     div[aria-label="Like"][role=button] > … i[data-visualcompletion=css-img] + div[data-ad-rendering-role="like_button"] + "Like"
     div[aria-label="React"][role=button] (chevron svg)
     div[aria-label="Leave a comment"][role=button] > … div[data-ad-rendering-role="comment_button"] + "Comment"
     div[aria-label="Send this to friends or post it on your profile."][role=button] > … [data-ad-rendering-role="share_button"] + "Share"
```

Every link in [MBFC-FWD] also carries `attributionsrc="/privacy_sandbox/comet/register/source/?xt=…"`. See §4.1.7.

### 3.2 Part-by-part selector catalog

In the Confidence column, "2026-10" means the part was confirmed in the Oct-2026 captures as well.

| Part | Selector / rule | Example value | Confidence | Sources |
|---|---|---|---|---|
| **Post root** | `[aria-posinset]:not([role])` | `aria-posinset="12"` | HIGH | §2 |
| **Honeypot blocks** | `:scope div[aria-hidden="true"] > blockquote` (`data-0..data-19` attributes in raw DOM) | text "Facebook" or random words | HIGH (2026-03, 2026-10) | MBFC-FWD, PAGRU, UA-CAP, GF587952; ZB502 removes `[data-0="0"]` |
| **Card box** | `div[style*="border-radius: max(0px,"]` / `[style*="card-corner-radius"]` | inline CSS var | MEDIUM | PAGRU; TOL; UBO uses `div[style^="border-radius:"]` |
| **Avatar (person)** | `a[aria-label][role=link] svg[role=img][aria-label]` (first one in the header, outside `profile_name`). Size: `style="height:40px;width:40px"`, circle mask. | aria-label = display name | HIGH | MBFC-FWD, UA-CAP, ZK |
| **Avatar (story ring)** | `a[aria-label$=", view story"][href^="/stories/"]`; 36px svg, 28px image at (4,4) | "Home & garden, view story" | HIGH (2026-03 and 2026-10; ad avatar in `ads-1` is a story-ring link) | MBFC-FWD, UA-CAP |
| **Avatar (group post)** | Group avatar: 36×36 svg with a **rect** mask (square), `a[href^="/groups/<gid>/"]`. Member avatar: 24px circle overlay, `a[aria-hidden=true][href*="/groups/<gid>/user/<uid>/"]`. | `svg[aria-label="Sami Mks"]` | HIGH | PAGRU, UA-CAP home-1 |
| **Author name** | `[data-ad-rendering-role="profile_name"] :is(h2,h3,h4) a[role=link]`. Text is in `a > b > span` (2026-03 EN, 2026-10) or `a > span` (group name). | "Blair …" | HIGH | MBFC-FWD, ZK, PAGRU, UA-CAP, BOUNCER, MBFC-TS |
| — heading level by surface | **h4** on home and search; **h2** in single-group pages (NYC a11y "heading level 2", RENT `[data-ad-rendering-role="profile_name"] h2`); **h5** for embedded or shared posts and reel overlays | — | MEDIUM | NYC, RENT, MBFC-FWD, UA-CAP |
| — legacy | `h3 span > a > strong > span`, `h3 span > a[href*='https://www.facebook.com']`, zbluebugz `strong` | — | **STALE** | MBFC-TS fallbacks, ZB |
| **Author name, cleanest source** | Take it from the menu label `[aria-label^="Actions for this post by "]` or `[aria-label^="Hide post by "]` and strip the prefix. BOUNCER: "These labels are the cleanest source of the author's name (the visible name block also carries 'Verified account', '· Follow', co-author suffixes)." | "Actions for this post by Khalid Al Ameri" | HIGH for EN 2026-09/10; the PL capture (2026-03) has no "by" form | ZK, BOUNCER, UA-CAP |
| **Group context** | In a group post, `profile_name` holds the **group** (`a[href^="/groups/<gid>/"]`). The poster is on the 2nd line, `a[href*="/groups/<gid>/user/<uid>/"]`. TOL: "group posts' profile_name is the group, with the poster at `a[href*="/user/"]`". | "Gotuj z jolanta" / "Sami Mks" | HIGH | PAGRU, UA-CAP home-1, TOL |
| **Page context, "is with", "is at", "is feeling", "shared a memory", "updated his profile picture"** | Extra text nodes and extra `a[role=link]` inside the same `h4`, after the first name link. [ZK] shows "is at" plus a second link (a check-in). UNALG has activity/reshare regexes. INFERRED: "is with" follows the same pattern. | `<Name> is at <Place>` | MEDIUM (is at); INFERRED (is with) | ZK, UNALG `markers/en.ts`, SFX (" shared a memory") |
| **Activity context line** ("X commented on this", "X reacted to this") | A separate line **above** the author block: `div > span[dir=auto]` before the header | "Jamie Park commented on this." | MEDIUM (synthetic builder modeled on captures) | UNALG `live2026.ts` (`context` option) |
| **Verified badge** | `svg[role=img] > title` "Verified account", inside or next to the h4. In ads the badge is a **sibling** of the heading [SIEVE]. FCMF-AS uses `h4 svg` / `h5 svg`. | "Verified account" | HIGH | ZK, UA-CAP (16x), SIEVE, FCMF-AS |
| **Follow / Join in header** | `span > span > span[aria-hidden] " · "` + `div[role=button][tabindex=0] > span "Follow"`. The button's aria-label is "Follow <Name>". | "Follow", "Join"; PL "Dołącz", "Obserwuj" | HIGH | HUSH 2026-10-11/12, UA-CAP, PAGRU, ZK |
| **Timestamp / permalink link** | The first own `a[role=link]` on the 2nd line with `target` (2026-03), no `rel`, no `aria-label`, not inside the message, headings or `<object>` [HUSH `post-dates.js`]. 2026-03 href: `?__cft__[0]=…&__tn__=%2CO%2CP-R`. 2026-10: href is the home URL (or `?__cft__`, anonymized) until hover, then the real permalink. | accessible name "3 hours ago"; visible "6h" / "March 4 at 5:47 PM" | HIGH | MBFC-FWD, PAGRU, UA-CAP, HUSH, NYC, UNALG CHANGELOG |
| — label carrier | 2026-03: `span[aria-labelledby="_r_xxx_"] > span[style="display:flex"] > span×N`. 2026-10: `span[aria-labelledby] > svg > use[href="#…"]`, a chain of `<svg><use>` "about 7 deep" ending in `<text>` "9 hours ago". A leading U+2060 sits inside the `a`. | `<text id=…>Ad</text>` | HIGH | UA-CAP, UNALG `slots.ts`, capture script comment |
| — full date | A tooltip on hover gives the full date; HUSH reads it ("Sunday, October 11, 2026 at 6:24 PM"). Visible text is relative under 7 days, else "October 1 at 5:47 PM". | — | MEDIUM | HUSH `post-dates.js` |
| **Audience icon** | `svg[role=img] > title` starting "Shared with". UNALG: `[aria-label^="Shared with"], [title^="Shared with"]`. The 2026-10 reel overlay also has `span[role=button][aria-label="<Xxxxxxx>: Public"]` (prefix word anonymized; not decoded). | "Shared with Public", "Shared with Blair's friends", "Shared with Public group", "Shared with Private group"; PL "Grono odbiorców: Grupa publiczna" | HIGH | MBFC-FWD, UA-CAP, NYC, PAGRU, UNALG |
| **"…" post menu** | `div[role=button][aria-haspopup=menu][aria-label^="Actions for this post"]` | EN 2026-03: "Actions for this post"; 2026-09/10: "Actions for this post by <Name>"; PL: "Działania dla tego posta" | HIGH | MBFC-FWD, ZK, UA-CAP, BOUNCER, PAGRU |
| **"X" hide** | `a[role=link][href="#"][aria-label]`. EN 2026-03: "hide post" (lowercase); 2026-09/10: "Hide post by <Name>"; PL: "ukryj post". | — | HIGH | MBFC-FWD, ZK, BOUNCER, PAGRU, UA-CAP |
| **Message** | `[data-ad-rendering-role="story_message"]`, wrapping `[data-ad-preview="message"][data-ad-comet-preview="message"]`, with paragraphs as `div[dir=auto][style="text-align: start;"]`. UNALG `FB_SEL.message` is the union of all three. | — | HIGH | all captures |
| — shared or embedded text | An inner post's text may sit in a plain `div > span[dir=auto]` with no hook (2026-10 reel overlay) | — | MEDIUM | UA-CAP, UNALG `sharedCard` |
| — group post title | `h5` or `h3` text inside `story_message` (group "title" field) | — | MEDIUM | PAGRU (h5), NYC (h3 title) |
| **See more** | An unlabelled `div[role=button][tabindex=0]` that is the **last child** of the text block, right after "…". Sometimes wrapped in `<object>` (2026-10 reel caption). | "See more" (EN); PL **unverified** (see §5.1) | HIGH (structure) | HUSH `expand-long-posts.js` (2026-10-12), UA-CAP (11x), MBFC-FWD, MBFC-TS |
| **Photo (single)** | `a[href*="/photo/?fbid="] img[data-imgperflogname="feedImage"]`, inside a `div[style="padding-top:NN%"]` aspect box. `__tn__=EH-y-R`. `set=a.<album>` for a profile or Page; `set=gm.<id>&idorvanity=<gid>` for a group. | alt "May be an image of …" / PL "Może być zdjęciem przedstawiającym …" | HIGH | MBFC-FWD, PAGRU, UA-CAP |
| **Photo grid** | Absolutely positioned tiles (`inset:` calc). `a[href*="set=pcb."][href*="__tn__=*b0H-R"]` … `*b3H-R`. The tile aria-label may be "No photo description available." | — | MEDIUM (2026-09) | ZK |
| **Image CDN** | `scontent…fbcdn.net`. Removing `ctp=s640x640` gives higher resolution; `oh` = signature, `oe` = expiry (do not edit). | — | MEDIUM | ZK |
| **Video** | `div[role=group][aria-label^="Video"]` (a11y "Video player") with `div[role=button][aria-label="Play video"]`, `[aria-label="Play"]`, `[role=slider]`, and a "0:00 / 0:00" time display | — | HIGH | UA-CAP ads-1, NYC |
| **Reel in post** | `a[aria-label][href*="/reel/<id>/"]` ("Open reel in Reels Viewer"-like label, words anonymized). It holds the caption, a `See owner profile` link, an h5 creator name, and an optional "Follow <creator>" button. | — | HIGH | UA-CAP home-1, reels-1/2, UNALG `reel()` |
| **Link card** | `a[rel="nofollow noreferrer"][target=_blank]` (2026-03) or `a[aria-labelledby]` (2026-10). Contains `[data-ad-rendering-role="meta"]` (domain), `span[data-ad-rendering-role="title"]`, `span[data-ad-rendering-role="description"]`, optional `[data-ad-rendering-role="image"]`, and a CTA `div[data-ad-rendering-role="cta-"] > object > a[href^="https://l.facebook.com/l.php?u="]` | domain "example.com"; CTA "Learn More" / "Shop now" | HIGH | MBFC-FWD, UA-CAP, NOOK |
| — **decoy link card** | Posts with **no** link attachment still contain a full meta, title, description and CTA block. The domain is random (`iBgTWMHI9.com`, `Z9mww.com`, `6fqRH.com`) and the CTA text is "Learn More". Every one of the 9 UA-CAP home captures has a "Learn More" `<text>` per post. **INFERRED:** it is a visually hidden anti-adblock decoy. Never read `[data-ad-rendering-role="meta"]` without first checking that the card is visible (non-zero rect, not `aria-hidden`, not clipped). MBFC-TS reads `meta` directly and is likely fooled. | — | observation HIGH; purpose INFERRED | MBFC-FWD, ZK, PAGRU, UA-CAP |
| **Shared post (reshare)** | A nested block with its own avatar (often a story ring), its own `profile_name` with **h5** and `-webkit-line-clamp:2`, its own timestamp (`__tn__=%2CO%2CP-y-R`, note the `-y-`), message and See more. It has no `aria-posinset`. HUSH treats "nested inside another candidate" as part of the outer post. | — | HIGH | MBFC-FWD, UA-CAP, HUSH |
| **Reaction summary** | `span[role=toolbar][aria-label="See who reacted to this"]` > `div[role=button][aria-label="Like: 38K people"]`, `"Love: 8.6K people"`, …, each with `img[height=18][width=18][role=presentation][src^="data:image/svg+xml"]` | — | HIGH | ZK, UA-CAP, NYC |
| — totals (layout A) | `button "All reactions: 2"`, `button "3 comments"`, `"N shares"`; PL "1 komentarz" | — | MEDIUM | NYC, PAGRU |
| **Action bar** | Inside `div[data-visualcompletion="ignore-dynamic"]` (2026-03; ZB uses it for shares). Each button is `div[role=button][aria-label=…]` containing a `data-ad-rendering-role` marker: `like_button`, `comment_button`, `share_button`. | see the rows below | HIGH | all |
| — Like | `div[role=button][aria-label="Like"]` containing `i[data-visualcompletion="css-img"]` (sprite) + `[data-ad-rendering-role="like_button"]` + text "Like" (layout A) or a count "47.7K" (layout B) | PL "Lubię to!" | HIGH | MBFC-FWD, ZK, UA-CAP, PAGRU |
| — React | `div[role=button][aria-label="React"]` (chevron) | PL "Zareaguj" | HIGH | MBFC-FWD, NYC, PAGRU |
| — Comment | `div[role=button][aria-label="Leave a comment"]` containing `[data-ad-rendering-role="comment_button"]` + "Comment" or a count. **Absent** when comments are off. | PL aria "Dodaj komentarz", text "Komentarz" | HIGH | MBFC-FWD, ZK (2nd post has none), UA-CAP, PAGRU |
| — Share | aria-label "Send this to friends or post it on your profile." (2026-03); **"Share, send this to friends or post it on your profile."** (2026-10). Contains `[data-ad-rendering-role="share_button"]` + "Share". In groups the button is "Send" ([NYC], ≤2026-03). | PL "Wyślij do znajomych lub opublikuj w Twoim profilu." / "Udostępnij" | HIGH | MBFC-FWD, UA-CAP, PAGRU, NYC |
| **Footer layouts** | **A** (≤2026-03 and still in the PL capture): summary row (reactions toolbar, comment and share counts) **above** text-labelled buttons. **B** (2026-09..10): counts **inside** the buttons ("47.7K", "930", "94"), with the reactions toolbar after them. | — | HIGH (both seen) | NYC, PAGRU, MBFC-FWD vs ZK, UA-CAP |
| **Inline comments** | `div[role=article][aria-label^="Comment by "][tabindex=-1]`, e.g. "Comment by Anna Wilson 2 hours ago". Replies: `^Reply by `. A comment's permalink is `a[href*="comment_id="]` with text like "2h" or "6w". Buttons: "Like" (svg title "Like"), "React", `li > div[role=button]` "Reply", and `div[role=button][aria-label="Hide or report this"]`. | — | HIGH | NYC, UA-CAP ads-1, HUSH regex `/^(?:comment|reply) by /i` |
| — "View more comments" | `div[role=button]` text "View more comments" ("Xxxx more xxxxxxxx" in UA-CAP); order menu "Most relevant" (PL "Najtrafniejsze") / "All comments" (PL "Wszystkie komentarze") | — | MEDIUM | NYC, UA-CAP, LENIE, HUSH `orders.js` |
| — comment text hook | `[data-ad-rendering-role="comment_message"]` | — | **LOW / unverified** (one 2026 extractor; absent from all captures) | CAM |
| **Comment composer** | `form[role="presentation"]` > `div[role="textbox"][contenteditable="true"][data-lexical-editor="true"]`. aria-label "Write a comment…" (2026-10-11), or "Comment as <Name>" / "Answer as <Name>" (≤2026-03, group). Submit: `[aria-label="Post comment"]` (aria-disabled until text). Tool buttons (`aria-haspopup`): "Comment with an avatar sticker", "Insert an emoji", "Attach a photo or video", "Comment with a GIF", "Comment with a sticker". | — | HIGH | HUSH `comment-stickers.test.js`, NYC, GF581285 |
| **Loading skeleton** | A post root with `[role=progressbar]` and no links. Variants: `article > status "Loading..."`; `[aria-label="Loading..."], [role="status"]`. | — | HIGH | HUSH, SFX, NYC, TOL |

### 3.3 Link-token (`__tn__`) map

From real hrefs in [MBFC-FWD] (2026-03), [ZK] (2026-09) and [PAGRU]. These values let MFGA name an `<a>` element's role without any text. **MEDIUM**: the `__tn__` codes are internal tracking codes and could change, but they have been stable across the 2026 captures. (Oct-2026 [UA-CAP] hrefs had their query strings stripped by the anonymizer, so they cannot confirm this.)

| `__tn__` (URL-decoded) | Element |
|---|---|
| `<<,P-R` (`%3C%3C%2CP-R`) | avatar link |
| `-UC,P-R` (`-UC%2CP-R`) | author name link |
| `,O,P-R` (`%2CO%2CP-R`, `#?…` fragment) | timestamp / permalink |
| `EH-y-R` | single photo |
| `*b0H-R` … `*b3H-R` | grid photo tiles 1–4 |
| `,mH-y-R` (`%2CmH-y-R#?gfk`) | link card / CTA |
| `<<,P-y-R`, `-UC,P-y-R`, `,O,P-y-R` | the same three parts in an **embedded/shared** post (note `-y-`) |
| *(no `__tn__`, href starts with `?__cft__`)* | **the "Sponsored/Ad" info link** (WC adInfoLink, GF598911); see §4.1.2 |

`__cft__[0]` is a per-render token (a `AZ…` base64url string). It is about 238 characters on organic links in [MBFC-FWD], and longer on ad links (see §4.1.4). It carries no stable post identity: [HUSH] `seen-keys.js` found that links no longer name the post, 0 of 60 even after hovering.

### 3.4 Grafting notes for MFGA (2010 restyle)

- **Restyle anchors.**
  - Name: `[data-ad-rendering-role=profile_name]`.
  - Body: `[data-ad-rendering-role=story_message]`.
  - Footer marker: `[data-ad-rendering-role$="_button"]`. Its `closest('[role=button]')` is the button, and the parent of the three buttons is the action bar.
  - Menu: `[aria-haspopup=menu][aria-label^="Actions for this post"]`.
  - Each of these exists exactly once per post. Nested shared posts add a second `profile_name` and `story_message`, so always take the **first one whose `closest('[aria-posinset]')` is the post** and that does not sit in an `h5` block.
- **2010-style "Name: message" layout.** Reading order is honeypots (hidden), header, body, attachment, footer. CSS `order` and `display:contents` can rearrange it. React re-renders reset inline styles but not stylesheet rules, so restyle through a stylesheet keyed on attributes. Do not use inline styles on FB nodes.
- **Inject, do not mutate, FB-owned text nodes.** React reconciles text nodes and will throw or revert. Put grafted elements (e.g. a 2010 "Like · Comment · Share · 3 hours ago" line) as **siblings** in a container MFGA owns, appended to the post root's mounted child. Re-insert on remount (§2.1). Hide FB's original with CSS rather than removing it. *(INFERRED from React behaviour plus [HUSH]'s "Nothing is ever inserted into Facebook's markup" policy. WC and FCMF-AS insert placeholders without reported breakage.)*
- **Timestamp text for the 2010 line.**
  1. Prefer the `aria-labelledby` target text ("3 hours ago"), cached because the target is removed within a frame [HUSH `label-cache.js`].
  2. Otherwise the final `<text>` of the `<use>` chain.
  3. Otherwise the hover tooltip.
  Never use the link's `textContent` (it is scrambled).
- **Lexical composer.** Do not set `innerHTML` or `textContent` in `[data-lexical-editor]`. To restyle, style the container. To insert text, focus it and dispatch `beforeinput`/`input` events or use `document.execCommand('insertText')`. *(INFERRED from Lexical's design: it owns its DOM and re-renders from its own state.)*

## 4. Junk detection catalog

The "Reliability" column rates two things:

- **Precision:** how often a hit is really junk.
- **Recall:** how often junk is hit.

Both refer to 2026 evidence. Every text-based signal needs the §5 dictionaries, and every geometry-based signal needs layout (see §4.11, rule 2).

### 4.1 Sponsored and Ad posts in the feed

#### 4.1.1 Visible label forms (what users see)

| Form | Where | Date | Source |
|---|---|---|---|
| "Sponsored" in the byline, in place of the timestamp | Feed | 2019-2025, still in some cohorts in 2026 | all |
| **"Ad"** in the byline (`Ad · 🌐`) | Feed | 2026; seen in Oct 2026 captures | SIEVE (Spotify ad, 2026-09-02), UNALG CHANGELOG (2026-10-16 "hide posts labelled 'Ad'"), UA-CAP `ads-1` (`<text>Ad</text>`), FCMF-AS fixture `<a href="/ads/about/?entry_product=ad_preferences">Ad</a>` |
| "Sponsored · Paid for by ______" (political/issue ads) | Feed | 2022-2024 dictionaries | ZB502 `NF_SPONSORED_PAID` |
| "Paid partnership" / "Sponsored · Paid partnership with <Brand>" (branded content; strictly not an ad) | Feed | 2022-2026 | ZB502, HUSH AD_LABELS, UNALG markers (`tail "paid partnership"`) |
| "Sponsored​" (with U+200B) as the h3 heading of the right-rail ads block | Right rail | 2026-09/10 | SIEVE, UA-CAP home-2 (h3 text `"Sponsored​"`) |
| `a[aria-label="広告"]` (Japanese ad-label link with an aria-label) | Feed, Watch | 2023-2026 rule still shipped | UBO filters.txt |
| `span > span > a[aria-label="Sponsored"]` | Feed | 2026-03 | MBFC-TS (code, not a capture) |
| "Promoted", "Ad · Paid" | — | **unverified**: they appear only in UNALG's synthetic `LABELS`, described as "reworded ad labels" | UNALG `live2026.ts` |

#### 4.1.2 The sponsored-info link (query-only `?__cft__`, no `__tn__`)

- **Rule:** inside the post header, find `a[href^="?"][href*="__cft__"]:not([href*="__tn__"])`.
  - GF598911 (2026-10-06) uses `a[target='_blank'][href^='?'][href*='__cft__']` without `__tn__`, then `closest("[aria-posinset]")`.
  - [WC] `adInfoLink` (2026-10-12): href starts with "?", includes `__cft__`, does not include `__tn__`; measured live at 48×16 with empty text.
  - WC test fixture: `a[href="?__cft__[0]=AZhvx7SjeDAgkZ73"]` next to an SVG label `<use href="#lbl">`.
- **Why it works:** the organic timestamp is also query-only before hover, but it carries `__tn__=%2CO%2CP-R` (§3.3). The ad label link does not.
- **Reliability:** precision HIGH, recall MEDIUM-HIGH.
- **Failure modes:**
  - Facebook adds `__tn__` to ad links.
  - Hovering rewrites the href. INFERRED: the ad link's hover target is `/ads/about` or similar, so evaluate before hover or accept both forms.
  - The anonymized Oct-2026 captures cannot confirm this signal, because their query strings were stripped.

#### 4.1.3 `/ads/about` link

- **Rule:** `a[href*="/ads/about"]` inside the post. Include `l.facebook.com/l.php?u=` wrappers that decode to it ([HUSH] `matchesAdDisclosureUrl`).
- **Who uses it:**
  - FCMF-AS uses it as its primary signal.
  - GF587952 matches `a[href^="/ads/about"]`.
  - SFX matches `a[aria-label][href*='/ads'][href*='/about']`.
  - FSPB says it is "present only on sponsored posts" (2025-09).
  - SIEVE's `SIGNAL_SELECTOR` includes it.
- **Orphan ads:** FCMF-AS (2026-09-16) handles an `/ads/about` link found **outside** any `[role=article]` or `[aria-posinset]` by hiding `closest("div[data-virtualized]")`.
- **Reliability:** precision HIGH, recall **LOW-MEDIUM in 2026**. UA-CAP `2026-10-ads-1.html` (captured 2026-10-20) contains **no** `/ads/about` link; the anonymizer keeps `ads/about` paths, so it would have shown. INFERRED: the link only materializes on hover, or only in some cohorts.

#### 4.1.4 `__cft__[0]` token length

- **Rules:**
  - UBO: `div[aria-posinset] :is(h3, h4) span > a[href]:not([href^="/groups/"]):not([href*="section_header_type"]):matches-attr(href="/__cft__\[0\]=[-\w]{290,}/"):upward(div[aria-posinset])`, gated by `:matches-path(/^\/(\?[a-z]+=\w+)?$/)`.
  - A second UBO rule, `div[aria-posinset] > div[data-virtualized]:has(div[style^="border-radius:"] a[href^="?__cft__"]:matches-attr(href="/__cft__\[0\]=[-\w]{290,}/"))`.
  - Search results use `{265,}` on `[role=article]`.
  - ZB502 (Nov 2024): minimum length **311**, measured from `__cft__[0]=` to the **end of the href**. Thresholds are 250 for search and 299 for video. It considers 1-9 links and inspects the first 2.
- **Organic baseline:** 238 characters (MBFC-FWD, 2026-03).
- **Reliability:** MEDIUM precision, MEDIUM recall. Facebook can change token sizes at any deploy. Use it as **corroboration only**, never alone.

#### 4.1.5 Decoding the obfuscated label text

The label is drawn so that `textContent` lies. Every known technique:

| Technique | Era | Detail | Sources |
|---|---|---|---|
| Letters as individual `<span>`s in a `display:flex` box, shuffled with CSS `order` (atomic classes) | 2023 → 2026-10 | Visible letters must be re-sorted by computed `order` or by on-screen x (geometry). | MBFC-FWD (56 spans; 14 visible), UBO watch rule (`span[aria-labelledby]:has(> span[style="display: flex;"] > span[class]:has-text(/^S$/))…`), HUSH "glyph order" (live 2026-10-10) |
| Decoy letters | 2023 → 2026 | Inline `style="position:absolute;top:3em"`, or display:none, opacity:0, font-size:0 | MBFC-FWD, HUSH `visible-text.js` (`isHidden` checks display, visibility, opacity, fontSize), PAGRU |
| U+034F COMBINING GRAPHEME JOINER after **every** letter | since 2026-10-11 | Also U+2060 WORD JOINER and U+200B. Strip `[͏⁠​-‍﻿]`. | HUSH (2026-10-11), UNALG `slots.ts`, SFX regex `[͏⁠]*` |
| SVG `<use href="#id">` pointing at an off-screen `<text>`; since 2026-10 a **chain** of `<svg><use>` "about 7 deep" | 2023 (single) → 2026-10 (chain) | Follow `href`/`xlink:href` until a `<text>` is reached | UA-CAP (all home and ads captures), UNALG capture script comment, ZB502 `ShadowRoot2`, WC fixture |
| `aria-labelledby` pointing at a node that is **removed within a frame** | 2023 → 2026 | Needs a MutationObserver label cache. Ids look like `_r_6d2_` (2026), formerly `:r1a:`. | HUSH `label-cache.js`, ZB502 (`:`-prefixed ids), UA-CAP (`span[aria-labelledby="_r_2go_"]`) |
| `<canvas>` drawing | 2022-2023 | **STALE** | ZB502 `ShadowRoot1` |
| Nested `<b>` with display:none children | 2026-07 | Decode `b:has(> b)` from child `b` elements that are not display:none | GF587952 |
| Per-language SVG width fingerprint (en 56.8906px, pl 78.5465px Chromium; 59px / 80.8px Firefox; vi 65.0684px) | 2023 | **STALE**: commented out in UBO | UBO filters.txt |

**The same obfuscation is applied to organic timestamps** ([WC] README; MBFC-FWD decodes "March 4 at 5:47 PM" from the same span soup). A careless decoder that keeps decoy letters can read "Ad" or "Sponsored" inside an organic timestamp: WC's decoded examples include "Just now", "Ad" and "Learn more".

Recommended decode procedure:

1. Look only in the **byline region**: the 2nd header line, outside `profile_name`, headings, message, title, description and `cta`. HUSH limits this to the top 115-230 px of the post (`min(230, max(115, 0.28·height))`) and excludes `[data-ad-rendering-role^="cta"]` and the other rendering roles.
2. Try the sources in order:
   1. the `aria-labelledby` target text, live or cached;
   2. the end of the SVG `<use>` chain;
   3. the visible glyphs with layout: drop hidden ones, sort by `getBoundingClientRect().left` on the top line (WC `paintedLabel()`: top line, sort by x, drop stacked duplicates), or by computed `order`.
3. Normalize: NFKC, strip joiners, trim the "·" separators.
4. Match **exactly** (not as a substring) against the locale's ad words. HUSH: "Labels are matched exactly, never as a substring, and never in headings or the author's name, so a post that says 'Sponsored by my mom' or a Page called 'Ad' stays."

**Reliability:** precision HIGH when done as above, recall MEDIUM. It breaks with each obfuscation change; there were roughly 3 changes in 2026.

#### 4.1.6 CTA buttons

- `[data-ad-rendering-role^="cta"]` (`cta-`), e.g. "Shop now", "Learn More", "Sign up", "Book now". UNALG `ctaButtons` has the full list; see §5.
- **Not a standalone signal.** Every organic post in the Oct-2026 captures has a hidden decoy "Learn More" (§3.2).
- HUSH: "An ad button never hides a post by itself: Pages post with buttons in groups, and reshares carry the original's button. It only corroborates."
- NOOK's rule is a `cta-` element **and no permalink** in the post: "no cta- post carried one, against 103 of 131 other posts that did". MEDIUM.

#### 4.1.7 Privacy Sandbox `attributionsrc`

- `a[attributionsrc^="/privacy_sandbox/comet/register/source/"]` on links. SIEVE's `SIGNAL_SELECTOR` includes `a[attributionsrc^="/privacy_sandbox/"]`.
- **Contradiction:** MBFC-FWD, an apparently **organic** friend share captured 2026-03, has `attributionsrc` on **every** link. **LOW** as a post-level signal.
- In the right rail, `[attributionsrc*="?eid="]` is used by UBO (rule linked to issue 3367 comment 3060431385, 2025-26), and the SFX 2026 rule is `[role=complementary] a[aria-labelledby][attributionsrc][href*=utm_c]`. In the rail it is acceptable.

#### 4.1.8 Signals that are NOT ad signals (false-positive traps)

- **`[data-ad-preview]`, `[data-ad-comet-preview]` and `[data-ad-rendering-role]` (profile_name, story_message, …).** Present on organic posts: UBO commented its rule out; SIEVE and NOOK removed "Strategy 2/5" as false positives; all captures confirm. **HIGH.**
- **`[data-ad-rendering-role="meta"]` / title / description.** Present as a decoy on organic posts. **HIGH.**
- **Text "Sponsored" anywhere in the post.** Matches user text and Page names. Match exactly in the byline only.
- **`a[href*="/ads/"]` in general.** Too broad: "/ads/preferences" and boosted-post buttons on your own posts. INFERRED.

#### 4.1.9 Right-rail ads (column `div[role="complementary"]`)

| Rule | Source / date |
|---|---|
| Heading `h3` whose text with ZW characters stripped is "Sponsored" (or the locale word), then hide its block | SIEVE, FCMF-AS, UA-CAP home-2 (2026-10-19) |
| `div[role="complementary"] h3 span[style^="-webkit-box-orient:vertical"]:has-text(/^Sponsored$/)` | UBO quick-fixes |
| `a[target^="rhcad"]` (`rhcad2`, `rhcad3`); NOOK CSS `[role="complementary"] div:has(> div > div > a[target^="rhcad"])` | UBO, SIEVE, NOOK (2026-09) |
| `div[role="complementary"] a[rel="nofollow noreferrer tag"][aria-labelledby^="_R_"]`; `a[rel="nofollow noreferrer external"][attributionsrc^="/privacy_sandbox/comet/register/"][attributionsrc*="?eid="]`; `a[href*="fbclid"][href*="utm_medium"]…` | UBO quick-fixes |
| `[role=complementary] a[aria-labelledby][attributionsrc][href*=utm_c]` ("Right Rail Sponsored (2026)") | SFX hideable.json |
| `div[data-visualcompletion="ignore-late-mutation"]` holding `a[attributionsrc]` | GF587952 |
| Plausible ad link: `l.facebook.com/l.php`, or utm/fbclid/ad_id in the href | FCMF-AS |
| Oct-2026 shape: each ad is an `a[href^="https://l.facebook.com/l.php"]` holding `div[id] > span[aria-labelledby]`, a title and a domain, followed by an options button `div[role=button][aria-label="… <Advertiser> sponsored …"]` (wording anonymized; only "sponsored" survived) | UA-CAP home-2 |

For MFGA's 2010 layout, the whole right rail is usually rebuilt anyway; see the chrome dossier. The rail in Oct 2026 also holds **Contacts** (Meta AI pinned first, `i[role=img][aria-label="Meta AI …"]`-like) and **Group chats**.

#### 4.1.10 GraphQL-level (pointer only)

The most robust ad removal happens before render. The markers are:

- `category: "SPONSORED"` edges;
- `SponsoredData` / `sponsored_data`;
- `th_dat_spo`;
- `AdsSideFeedUnit`;
- `rhc_ad`.

UBO quick-fixes json-edit rules (lines 110-156) cover these. HUSH `ad-markers.js` drops rows for `follow_button`, `group_join` and `genai_label` from the data. See the GraphQL dossier. The DOM layer is the fallback for whatever slips through.

### 4.2 Suggested and recommended posts (non-followed authors)

- **2026 state (HIGH).** FB no longer labels these "Suggested for you" [WC README]. The marker is an inline **Follow** button (Pages, people) or **Join** button (groups) after the author name in the post's own first heading:
  - HUSH `hide-suggested-posts.js` (live 2026-10-11): `h4 > … > div[role=button] > span "Follow"`.
  - HUSH `hide-follow-buttons.js` (2026-10-12), exact markup:

    ```html
    <span><span><span>&nbsp;</span><span aria-hidden="true"> · </span></span><div role="button">Follow</div></span>
    ```

    with button aria-label "Follow Cynthia Ravinski".
  - PAGRU (PL, 2026-03): `profile_name > h4 > div[dir=ltr] > span > span > a[href^="/groups/"]` "Gotuj z jolanta", then " · ", then `div[role=button][tabindex=0] > span "Dołącz"`.
  - UA-CAP home-1 (2026-10-19): group post with "Join" in h4; reel overlay with "Follow <creator>".
  - [WC] README examples: `Proton · Follow · 7h`. Strangers carry "Add friend" or "Join".
- **Rule:** take the post's first heading (`h2, h3, h4, [role=heading]` whose `closest(CANDIDATE)` is the post; skip `h5`, which belongs to embedded or shared content). If it contains a `[role=button]` (or `button`) whose normalized visible text is exactly a locale's Follow, Join or Add friend word, the post is suggested.
  - FCMF-AS variant (2026-02): h4 has a `[role=button]` and a **non-group** link → "Follow" class; with a **group** link → "Participate/Join" class.
- **Route gating (HIGH).** Apply on `/`, `/?filter=*`, `/?sk=*` and `/groups/feed/` only.
  - NYC (single group, ≤2026-03): a group member's post shows "Duke Winn · Follow". That is legitimate content from a group you joined.
  - QUORUM (search, 2026-07): `profile_name` contains "· Follow".
  - HUSH applies its data rules "only on those two feeds [Home and your groups feed], since search results and a Page's own timeline carry the same buttons".
- **Embedded content trap (HIGH).** A friend sharing a stranger's reel or post puts "Follow <creator>" inside the h5 overlay (UA-CAP home-1, reels-1/2). That must not mark the friend's share as suggested.
- **Legacy header phrases**, still worth matching as a fallback. Some cohorts and the groups feed may still show them; SFX keeps the list in 2026:
  - Based on your recent
  - Because you may be interested in
  - Because you recently viewed
  - Because you viewed
  - Events you may like
  - From a group that
  - From a group with members who like
  - From a group you
  - Post from a public group
  - Suggested Events
  - Suggested for you
  - Suggested pages
  - Suggested post
  - You recently viewed a similar group
  - More like…
  - Suggested groups…posts a day/week/month

  ZB328 (2022, STALE) has these phrases in 14 languages (§5.3). ZB502 also matched `a[href*="/groups/discover"]` and a deep `nth-of-type` path to a header `span` (STALE).
- **Reliability:** Follow/Join button: precision HIGH (with gating), recall HIGH in EN. In other locales recall depends on the dictionary; the PL words "Obserwuj" and "Dołącz" are confirmed.

### 4.3 People You May Know (PYMK)

- Panel: `h3` "People you may know" + `div[role=region][aria-label="People you may know"]` holding a `role=grid` of `role=cell` people with `div[role=button]` "Add friend". **MEDIUM**: UNALG's synthetic panel is modeled on the captures, and its title/kind enum says panels use h3.
- SFX:
  - `[aria-hidden][href*='friends/suggestions']`
  - `[role=region][aria-label*=eople][aria-label*=now]` (case-agnostic "People … know")
- ZB502: `a[href*="/friends/"][role="link"]`. LOW precision, because it also matches a friend's `/friends/` links.
- Text: PL "Osoby, które możesz znać" (ZB502/ZB328).
- The panel is itself an `[aria-posinset]` slot with an "Actions for this post" menu, like Reels panels (UA-CAP reels-3).

### 4.4 Reels and short videos

- **Reels panel** (UA-CAP reels-3, 2026-10-20, HIGH): an `[aria-posinset]` slot with `h3 "Reels"`, an "Actions for this post" menu, and `div[aria-label="Reels"][role="grid"] > div[role=row] > div[role=gridcell] > a[aria-label^="Reel by "][href*="/reel/"]`. Each reel has a `div[role=button][aria-label="Menu"]`.
- **Other signals:**
  - TOL: `[aria-posinset]:has(a[href*="/reel/"])` plus a `[style*="card-corner-radius"]` grid.
  - HUSH: a block that is a sibling of posts with **≥2 distinct reel ids** and is not `[data-focus-target="stories_tray"]`, a region, dialog, complementary or navigation.
  - ZB502:
    - `a[href="/reel/?s=ifu_see_more"]`
    - more than 4 `a[href*="/reel/"]`
    - `div[role="button"] > i ~ div` text in the dictionary (`NF_REELS_SHORT_VIDEOS`, `REELS_TITLE`)
  - GF588918: h3 "Reels".
  - Kill News Feed: labels "Reels", "Rolki", "Reel".
- **Single reel post:** a post with exactly one `/reel/` link, by a followed author or a stranger (Follow in the overlay).
  - A friend's share of a reel is a **friend post**. Treat it as junk only if MFGA policy says so.
  - ZB502 `NF_SHORT_REEL_VIDEO` is optional.
- **Reliability:** panel HIGH; single reel MEDIUM (policy question).

### 4.5 Stories tray

| Selector | Source |
|---|---|
| `div[role="region"][data-focus-target="stories_tray"]` (inside `div[data-virtualized="false"] > div`) | HUSH, live 2026-10-11. **HIGH**. |
| `[aria-label="Stories"]` | WC (2026) |
| `div[aria-label="Feed Stories"]` | GF588918 (2026-07; ja "フィードのストーリーズ", es "Historias", ko "스토리", zh-Hans "快拍", zh-Hant "限時動態") |
| `[role="region"][aria-label="profile plus top of feed cards"]` | FCMF-AS (2026) |
| `a[href*="/stories/create"]` (+ region) | ZB502 (2024), GF588918 `createStory` label ("Create story", es "Crear historia", de "Story erstellen", …) |
| `data-pagelet` Stories / StoriesBar / StoriesPaneRoot | GF577212. **STALE/CONTESTED**. |
| Stories-post inside the feed: `a[href^="/stories/"][href*="source=from_feed"]` | ZB502 (2024) |

Story-ring avatars (`a[aria-label$=", view story"][href^="/stories/"]`) are **not** junk: they are the author's avatar (§3.2).

### 4.6 Groups you may like and suggested groups

- 2026: the panel title is a plain `span[dir=auto]` (not a heading), e.g. "Your group suggestions", with group links and `div[role=button]` "Join group". **MEDIUM**: UNALG synthetic panel `GROUP_SUGGESTIONS`, kind `span`.
- UNALG module titles: suggested groups, groups you may like, suggested for you in groups, your group suggestions.
- Social Fixer: "Suggested groups…posts a day/week/month".
- ZB328 GF_* phrases (STALE): "Suggested for you" (groups), "Suggested groups", "See More Groups", "Suggested post from a public group", "Because you viewed a similar post/group", "Based on your recent activity", "From a group that your friend is in", "Friends' groups", "Popular near you", "Join Group".
- `a[href*="/groups/discover"]` (ZB502). On `/groups/feed/`, a suggested **group post** (from a group you are not in) shows "Join" in the h4 (PAGRU). Treat it like §4.2.

### 4.7 Pages, events, games, marketplace and other modules

- UNALG `markers/en.ts` module titles:
  - pages: suggested pages, pages you may like
  - games: games, instant games
  - promo: marketplace, today's picks, events you may like
- ZB502: `:scope div > div:nth-of-type(2) > div > div > h3 > span` text "Events you may like" (PL "Wydarzenia, które mogą Ci się spodobać").
- Survey: `a[href*="/survey/?session="] > div[role="none"]` (ZB502); ZB328 "See Survey Details" / PL "Zobacz szczegóły ankiety".
- "Are you interested?" card: `div[style*='card-corner']:has([aria-label=Interested][role=button] …)` (SFX 2026).
- Donate: `[aria-label=Donate]` (SFX 2026).
- LIVE videos: "LIVE" / PL "NA ŻYWO" (ZB502 `VF_LIVE`).
- Info boxes (Coronavirus, Climate Science) and "Facebook is now Meta" or privacy-policy notices: **STALE** (ZB328).

### 4.8 Memories

- `a[href*='/onthisday/'][href*='shared_feed_story']` and the text " shared a memory" (SFX 2026).
- A friend's shared memory is a friend's post; FB's own "On this day" prompt card is the junk. INFERRED distinction: FB's own card has no `profile_name` of another person. Verify on a live page.

### 4.9 AI content and Meta AI

| Signal | Source / date | Reliability |
|---|---|---|
| Byline label "AI content", e.g. `ADHD Treatment · AI content · 2m` | WC README (2026) | MEDIUM |
| `div[role=button]` with exact text "AI content" | GF587952 (2026-07-21) | MEDIUM |
| Button with exact text "AI info" | FCMF-AS (2026-07); HUSH ("It goes by the AI info label") | MEDIUM |
| Data: `CometFeedStoryGenAIContentTransparencyStrategy` / `genai_label` | HUSH `ad-markers.js` (data layer) | HIGH (data layer) |
| Meta AI branding: `a[aria-label="Visit Meta AI"]`, `a[aria-label="Meta AI branding"]`, `a[href*="meta.ai"]`, text "try meta ai"; prompt chips `[data-type="hscroll-child"]` (fiber props `promptId` / `genAISessionID`) | FCMF-AS (2026) | MEDIUM |
| "Annoying AI Questions": `i[role=img][aria-label]` | SFX hideable 2026 | LOW (generic selector) |
| AI_MARKS vocabulary (normalized, spaces removed) | WC (2026-10), see §5 | MEDIUM |

### 4.10 Empty, skeleton and virtualized units

- **Skeleton** (still loading, will fill in):
  - `[aria-posinset]` containing `[role=progressbar]` and no `a[href]` (SFX, HUSH).
  - `article > status "Loading..."` (NYC).
  - `[aria-label="Loading..."], [role="status"]` (TOL).
  - TOL: "role=article is now only used for loading placeholders".
  - **Do not hide skeletons.** Re-check when they fill in (HUSH: "checked again when it fills in").
- **Empty slot:** `[data-virtualized="true"]`, whose content is unmounted (`<div hidden>`). Keep the previous verdict on the `[aria-posinset]` element; do not re-classify it as "empty".
- **Mobile only** (not desktop): grey skeleton cards `div.m.displayed` with an inline height [WC]. BOUNCER `RENDERER_DISPLAYED_CLASS = 'displayed'`.

### 4.11 Hiding mechanics, virtualization and infinite scroll

What each reference does (desktop):

| Method | Who | Notes |
|---|---|---|
| Stylesheet `[data-mark]{display:none!important}` on the post or story root | WC (8.x, 2026-10) | "Desktop hides by stylesheet." |
| Inline `style.display='none'` on the mounted post (`[data-virtualized=false] > div`) | BOUNCER (2026-10-20) | Defers collapsing posts that are entirely **above** the viewport. Reason: "WebKit has no scroll anchoring to compensate". They are faded when scrolled back to. |
| Mark the post's **first child** (a `display:contents` wrapper), hide through `:has(> [mark]){display:none!important}` | HUSH (live 2026-10-11) | "Attributes written on the feed's direct children have been measured to stall infinite scroll (the MIT fb-sponsored-ad-post-blocker)". Its test: "A live scroll past 100 posts with every other one hidden kept paging." |
| `display:none!important; max-height:0; height:0; margin:0; padding:0; border:0; overflow:hidden; opacity:0; pointer-events:none` | FCMF-AS (since 5.04, Oct 2025) | Belt and braces. |
| `height:0!important; overflow:hidden!important` | UBO, SIEVE | SIEVE collapses with height 0 "because of virtualiser measuring" and warns to avoid release/collapse oscillation. |
| `max-height:0; overflow:hidden; margin-bottom:0`, plus a `<details>/<summary>` wrapper copying the post's classes to "prevent fb from removing the post" | ZB502 (Feb 2024) | **STALE** approach. ZB also needed `body > div[style*="position: absolute"]{top:-1000000px}`. |
| `.remove()` | WC on **mobile only** | "the virtualiser keeps zero-height rows and the feed stops advancing". Never remove on desktop: React owns those nodes (INFERRED crash/revert risk). |

**Rules learned the hard way:**

1. **Do not hide near the bottom.** [WC] 8.10.16 broke loading; WC now never hides within 1200 px of the document bottom. The load-more sentinel lives there (SFX pager: `[role=feed] div.S2F_wid_1.S2F_hei_1:empty`, a 1×1 empty div). INFERRED mechanism: hiding the last real posts collapses the page height, so the sentinel stays in view or never re-intersects. MEDIUM.
2. **Detect before you hide.** `display:none` makes every geometry probe read 0×0 [WC 8.21]. Layout-based label decoding and the header-band tests in §4.1.5 and §4.2 must run on visible nodes.
3. **Too many hidden in a row can starve the feed.** ZB changelog 4.14: "FB limits 40 posts in News Feed". SFX: "Facebook clears posts from the top as you scroll". INFERRED: if most posts are hidden, scroll distance per page shrinks and FB may stop paginating. Mitigation: MFGA could render a 2010-style placeholder line ("N stories hidden") with a real height instead of zero.
4. **Hidden posts above the viewport cause scroll jumps.** Chromium and Firefox scroll anchoring compensates; WebKit does not [BOUNCER]. Defer collapsing posts that are fully above the viewport.
5. **The feed auto-refreshes and resets position.** The FB module `CometFeedStalenessConstantsEntryPointVariables` sets `FEED_VISIBILITY_TIMEOUT` = 120 s, `FEED_STALE_TIMEOUT` = 600 s and `FEED_STALE_PUSH_VIEW_TIMEOUT`. The hooks involved are `useCometHomeStaleFeedRefresh`, `useCometFeedPushViewCloseRefresh`, `useStaleSessionReturnToFeed` and `CometReturnToFeedRouteUtils.isRouteEligible` ([HUSH] `keep-feed-place.js`; GF600341 2026-10-15 "Stop Feed Auto-Refresh"). Relevant if MFGA wants a 2010-like stable feed.
6. **Do not store state on FB nodes in attributes on the feed's direct children** (rule 3 above, per HUSH). Use a WeakMap or WeakSet keyed by element.

**Recommended for MFGA (desktop):** a single injected stylesheet containing

```css
[data-mfga-hide] { display: none !important; }
:has(> [data-mfga-hide]) { display: none !important; }
```

- Set `data-mfga-hide` on the `[aria-posinset]` element's **first child**, never on the feed list's child.
- Optionally add a one-line 2010-style stub ("Hidden: Sponsored") via `::before`, which keeps a non-zero height. HUSH does this with "Leave a note".
- Skip the bottom 1200 px.
- Defer hiding above the viewport on WebKit (Safari userscript managers).

**Confidence:** HIGH for display:none working on desktop (four independent 2026 implementations). MEDIUM for the first-child refinement (one source, but measured).

### 4.12 Detection-signal summary (ranked for MFGA)

| Rank | Signal | Junk type | Precision | Recall | Locale-dependent |
|---|---|---|---|---|---|
| 1 | GraphQL markers (other dossier) | ads, suggested, AI | HIGH | HIGH | no |
| 2 | `?__cft__` header link without `__tn__` | ad | HIGH | MED-HIGH | no |
| 3 | `/ads/about` link (incl. `l.php`) | ad | HIGH | LOW-MED | no |
| 4 | Decoded byline label = locale ad word (exact) | ad | HIGH | MED | yes |
| 5 | First-heading Follow/Join/Add friend button (route-gated) | suggested | HIGH | HIGH (EN/PL) | yes |
| 6 | Panel title h3/span ∈ {Reels, People you may know, …} + grid/region | modules | HIGH | MED | yes |
| 7 | `data-focus-target="stories_tray"` | stories | HIGH | HIGH | no |
| 8 | ≥2 distinct `/reel/` ids in a slot / `role=grid[aria-label=Reels]` | reels | HIGH | HIGH | partly |
| 9 | `__cft__[0]` length ≥290 | ad | MED | MED | no |
| 10 | `cta-` with no permalink | ad | MED | MED | no |
| 11 | `attributionsrc` on a post | ad | LOW | HIGH | no |
| ✗ | `data-ad-preview`, `data-ad-rendering-role`, `meta` domain, "Learn More" | — | false positives | — | — |

## 5. i18n dictionaries for detection and part identification

**Matching rules**, to be applied to every table below:

- Normalize with NFKC and lowercase.
- Strip `[͏⁠​-‍﻿]`.
- Collapse whitespace and trim "·"/"•".
- Match **exactly**, for labels in label positions only.

[WC]'s `norm()` additionally strips all non-letters: `String(s).normalize("NFKC").toLowerCase().replace(/[^\p{L}]/gu, "")`. That is why its vocabularies below are written without spaces.

Locale source: `document.documentElement.lang`. GF588918 resolves `zh-tw`/`zh-hk` to zh-hant and other `zh*` to zh-hans.

### 5.1 MFGA core table: English and Polish, with provenance

**Status values:** "confirmed" means seen in a real capture or in FB-facing code dated 2025-26. "Dictionary" means it comes from a blocker's dictionary, which may be translated by a contributor rather than copied from FB. "Unverified" means no Polish source was found; the value given is INFERRED.

| Concept | Where it appears | English (FB) | Polish (FB) | PL status, source |
|---|---|---|---|---|
| Ad label (old) | byline | Sponsored | Sponsorowane | confirmed-dictionary: ZB502, ZB328, UBO mobile, SIEVE, NOOK, GF588918, WC (`sponsorowan`) |
| Ad label (2026) | byline | Ad | **unverified**. Candidate "Reklama" (INFERRED: WC's AD_WORDS includes `reklama`, the Polish/Czech/Slovak word for "ad"). PL captures (2026-03) predate the switch. | — |
| Paid partnership | byline | Paid partnership | Post sponsorowany | dictionary (ZB502/ZB328), **LOW** (looks like a contributor's paraphrase) |
| Paid political/issue ad | byline | Sponsored · Paid for by ______ | Sponsorowane · Opłacona przez ______ | dictionary (ZB502) |
| Advertiser link (Marketplace) | aria-label | (various, see §5.5) | Link reklamodawcy | UBO filters.txt |
| Post menu | aria-label | Actions for this post / Actions for this post by <Name> | Działania dla tego posta | **confirmed** (PAGRU 2026-03) |
| Hide (X) | aria-label | hide post / Hide post by <Name> | ukryj post | **confirmed** (PAGRU) |
| Like button | aria-label + text | Like | Lubię to! | **confirmed** (PAGRU; DOOM `"lubię to!"`; LENIE "Lubię to!", "Lubię to") |
| React chevron | aria-label | React | Zareaguj | **confirmed** (PAGRU) |
| Comment button | aria-label | Leave a comment | Dodaj komentarz | **confirmed** (PAGRU) |
| Comment button | text | Comment | Komentarz | **confirmed** (PAGRU; DOOM "komentarz"); LENIE also lists "Skomentuj" (MEDIUM, maybe another surface) |
| Share button | aria-label | Send this to friends or post it on your profile. (2026-10: "Share, send this to friends or post it on your profile.") | Wyślij do znajomych lub opublikuj w Twoim profilu. | **confirmed** (PAGRU, 2026-03 form) |
| Share button | text | Share | Udostępnij | **confirmed** (PAGRU; DOOM; LENIE) |
| Send (groups) | text | Send | Wyślij | dictionary (LENIE, mixed with LinkedIn strings), MEDIUM |
| Comment count | summary | 1 comment / N comments | 1 komentarz; plural `komentarz(e\|y)` (2-4 "komentarze", 5+ "komentarzy") | **confirmed** for "1 komentarz" (PAGRU); plural from the LENIE regex |
| Reactions count | summary | All reactions: N | `reakcj[ei]` (LENIE regex) | MEDIUM |
| Shares count | summary | N shares | `udostępnie(ń\|nia)` (LENIE regex) | MEDIUM |
| Follow | header button | Follow | Obserwuj | **confirmed** (ZB502, WC FOLLOW, PAGRU `content.js` joinTexts, LENIE) |
| Join (group) | header button | Join | Dołącz | **confirmed** (PAGRU capture 2026-03) |
| Join group | button | Join group | Dołącz do grupy | dictionary (ZB328, STALE) |
| Add friend | button | Add friend | **unverified**. INFERRED "Dodaj znajomego" (common FB-PL wording; no source in references) | — |
| Audience | svg title | Shared with Public / … friends / Public group / Private group | Grono odbiorców: Grupa publiczna | **confirmed** for the group-public form (PAGRU). The PL equivalent for "Public" alone is unverified. |
| Image alt | img alt | May be an image of … | Może być zdjęciem przedstawiającym … | **confirmed** (PAGRU) |
| See more | text | See more | **unverified**. INFERRED "Wyświetl więcej" (ZB328 uses "Wyświetl więcej grup" for "See More Groups", so "Wyświetl więcej" is FB-PL's usual rendering of "See more"). Detect structurally (§3.2). | — |
| Comment composer | aria-label | Write a comment… / Comment as <Name> / Answer as <Name> | **unverified** (INFERRED "Napisz komentarz…") | — |
| Comment article | aria-label | Comment by <Name> <age> / Reply by … | **unverified** | — |
| Most relevant | comments order | Most relevant | Najtrafniejsze | dictionary (LENIE), MEDIUM |
| All comments | comments order | All comments | Wszystkie komentarze | dictionary (LENIE), MEDIUM |
| See translation | link | See translation | Zobacz tłumaczenie | dictionary (LENIE), MEDIUM; LENIE also "Przetłumacz" |
| Stories | tray / heading | Stories | Relacje | confirmed-dictionary (ZB502, GF594983). ZB328 had "Historie" (STALE). |
| Reels | panel h3 | Reels | Rolki (GF594983) or "Reels" (ZB502 `REELS_TITLE`) | MEDIUM: both appear |
| Reels and short videos | panel title | Reels and short videos | Rolki i krótkie filmy | dictionary (ZB502, ZB328) |
| People you may know | panel title | People you may know | Osoby, które możesz znać | dictionary (ZB502, ZB328) |
| Events you may like | panel title | Events you may like | Wydarzenia, które mogą Ci się spodobać | dictionary (ZB502) |
| Suggested for you | header (legacy) | Suggested for you | Propozycje dla Ciebie (ZB328 author unsure: "Proponowane dla Ciebie?") | STALE |
| Suggested for you (groups) | header (legacy) | Suggested for you | Proponowane dla Ciebie | STALE (ZB328) |
| LIVE | badge | LIVE | NA ŻYWO | dictionary (ZB502) |
| Survey | card | Survey / See Survey Details | Badanie / Zobacz szczegóły ankiety | dictionary (ZB502 / ZB328) |
| Participate | button | Participate | Uczestniczyć | dictionary (ZB502), LOW |
| Feed posts | hidden h3 | Feed posts | **unverified** | — |
| Create a post | composer region | Create a post | **unverified** | — |
| AI labels | byline / button | AI content, AI info | **unverified** | — |
| Verified badge | svg title | Verified account | **unverified** | — |
| View more comments | button | View more comments | **unverified** | — |
| Reply | comment button | Reply | **unverified** | — |

### 5.2 zbluebugz "FB - Clean my feeds" v5.02 dictionary (verbatim)

**Attribution.** Copied from zbluebugz, *facebook-clean-my-feeds*:

- File: `greasyfork-release/fb-clean-my-feeds.user.js`, v5.02 (November 2024), object `masterKeyWords.translations`, lines 181-2167.
- License: **MIT** (header: `@license MIT; https://opensource.org/licenses/MIT`).
- Repository: https://github.com/zbluebugz/facebook-clean-my-feeds (HEAD 2025-12-17).
- Extracted with `tools/extract_dict.js`, which evaluates the literal in an empty `vm` sandbox, and rendered by `tools/gen_dict_tables.py`.

**What is reproduced.** Only the keys that hold Facebook wording. The other ~70 keys per language are the script's own dialog-box UI.

**How the script used these keys:**

- `SPONSORED` (plus de `SPONSORED_EXTRA: 'Anzeige'`) and the Reels keys were used for text matching.
- `NF_*` keys double as dialog labels, but they mirror FB's own panel titles. The script's comment on the structure reads "Keywords - use FB's wording".

**Staleness (2024):**

- Facebook's 2026 "Ad" label is absent.
- Some entries are contributor guesses. For example, fi `NF_EVENTS_YOU_MAY_LIKE` = "Kela/lyhyt video", ja = "リール/ショートビデオ" and tr = "makara/kısa video" are clearly copy-paste slips, and es `VF_LIVE` = "ESTRENO" means "premiere".

Treat it as **MEDIUM** for `SPONSORED` and **LOW** for the rest.

| lang | `SPONSORED` | `NF_STORIES` | `NF_PEOPLE_YOU_MAY_KNOW` | `NF_PAID_PARTNERSHIP` | `NF_SPONSORED_PAID` | `NF_FOLLOW` |
|---|---|---|---|---|---|---|
| en | Sponsored | Stories | People you may know | Paid partnership | Sponsored · Paid for by ______ | Follow |
| ar | مُموَّل | القصص | أشخاص قد تعرفهم | شراكة مدفوعة | برعاية · مدفوعة بواسطة ______ | تابع |
| bg | Спонсорирано | Истории | Хора, които може би познавате | Платено партньорство | Спонсорирано · Платено от ______ | Следвай |
| cs | Sponzorováno | Stories | Koho možná znáte | Placené partnerství | Sponzorováno · Platí za to ______ | Sledovat |
| de | Gesponsert | Stories | Personen, die du kennen könntest | Bezahlte Werbepartnerschaft | Gesponsert · Finanziert von ______ | Folgen |
| el | Χορηγούμενη | Ιστορίες | Άτομα που ίσως γνωρίζετε | Πληρωμένη συνεργασία | Χορηγούμενο · Πληρωμένο από ______ | Ακολούθησε |
| es | Publicidad | Historias | Personas que quizá conozcas | Colaboración pagada | Publicidad · Pagado por ______ | Seguir |
| fi | Sponsoroitu | Tarinat | Ihmiset, jotka saatat tuntea | Maksettu kumppanuus | Sponsoroitu · Maksaja ______ | Seuraa |
| fr | Sponsorisé | Stories | Connaissez-vous... | Partenariat rémunéré | Sponsorisé · Financé par ______ | Suivre |
| he | ממומן | סטוריז  | אנשים שאולי אתה מכיר | שותפות בתשלום | ממומן · שולם על ידי ______ | עקוב |
| id | Bersponsor | Cerita | Orang yang Mungkin Anda Kenal | Kemitraan berbayar | Disponsori · Dibayar oleh ______ | Ikuti |
| it | Sponsorizzato | Storie | Persone che potresti conoscere | Partnership pubblicizzata | Sponsorizzato · Finanziato da ______ | Segui |
| ja | 広告 | Stories | あなたが知っているかもしれない人々 | 有償パートナーシップ | 後援 · ______ による支払い | フォロー |
| lv | Apmaksāta reklāma | Stāsti | Cilvēki, kurus tu varētu pazīt | Apmaksāta sadarbība | Apmaksāta reklāma · Apmaksā ______ | Sekot |
| nl | Gesponsord | Verhalen | Mensen die je misschien kent | Betaald partnerschap | Gesponsord · Betaald door ______ | Volgen |
| pl | Sponsorowane | Relacje | Osoby, które możesz znać | Post sponsorowany | Sponsorowane · Opłacona przez ______ | Obserwuj |
| pt | Patrocinado | Stories | Pessoas que talvez conheças | Parceria paga | Patrocinado · Financiado por ______ | Seguir |
| ru | Реклама | Истории | Люди, которых вы можете знать | Платное партнерство | Реклама · Оплачено ______ | Подписаться |
| tr | Sponsorlu | Hikayeler | Tanıyor olabileceğin kişiler | ücretli ortaklık | Sponsorlu · ______ tarafından ödendi | Takip Et |
| uk | Спонсорована | Історії | Люди, яких Ви можете знати | Оплачуване партнерство | Спонсоровано · Оплачено ______ | Слідуйте |
| vi | Được tài trợ | Tin | Những người bạn có thể biết | Mối quan hệ tài trợ | Được tài trợ · Tài trợ bởi ______ | Theo dõi |
| zh-Hans | 赞助内容 | 故事 | 你可能认识的人 | 付费合伙 | 赞助 · 由 ______ 付费 | 关注 |
| zh-Hant | 贊助 | 故事 | 你可能認識的人 | 付費合作 | 贊助 · 出資者：______ | 追蹤 |

| lang | `NF_PARTICIPATE` | `NF_REELS_SHORT_VIDEOS` | `NF_EVENTS_YOU_MAY_LIKE` | `REELS_TITLE` | `VF_LIVE` | `NF_SURVEY` |
|---|---|---|---|---|---|---|
| en | Participate | Reels and short videos | Events you may like | Reels | LIVE | Survey |
| ar | المشاركة | ريلز ومقاطع الفيديو القصيرة | أحداث قد تعجبك | ريلز | مباشر | استبيان |
| bg | Участвай | Ленти и кратки видеоклипове | Събития, които може да ви харесат | Ленти | НА ЖИВО | Анкета |
| cs | Participovat | Sekvence a krátká videa | Události, které se vám mohou líbit | Reels | ŽIVĚ | Průzkum |
| de | Teilnehmen | Reels und Kurzvideos | Veranstaltungen, die Ihnen gefallen könnten | Reels | LIVE | Umfrage |
| el | Συμμετέχω | Reel και σύντομα βίντεο | Εκδηλώσεις που μπορεί να σας αρέσουν | Reel | ΖΩΝΤΑΝΑ | Τοπογράφηση |
| es | Participar | Reels y vídeos cortos | Eventos que te pueden gustar | Reels | ESTRENO | Encuesta |
| fi | Osallistua | Keloja ja lyhyitä videoita | Kela/lyhyt video | Reels | LIVE | Kysely |
| fr | Participer | Reels et vidéos courtes | Évènements qui pourraient vous intéresser | Reels | EN DIRECT | Enquête |
| he | השתתף | סרטוני Reels וקטעי וידאו קצרים | אירועים שאולי תאהבו | Reels | שידור חי | סקר |
| id | Berpartisipasi | Reels dan Video Pendek | Acara yang mungkin Anda sukai | Reels | LANGSUNG | Survei |
| it | Partecipare | Reel e video brevi | Eventi che potrebbero piacerti | Reels | IN DIRETTA | Sondaggio |
| ja | 参加する | リールとショート動画 | リール/ショートビデオ | リール動画 | ライブ | アンケート |
| lv | Piedalīties | Reels un īsi videoklipi | Notikumi, kas jums varētu patikt | Reels | TIEŠRAIDE | Aptauja |
| nl | Deelnemen | Reels en korte video's | Evenementen die je misschien leuk vindt | Reels | LIVE | Vragenlijst |
| pl | Uczestniczyć | Rolki i krótkie filmy | Wydarzenia, które mogą Ci się spodobać | Reels | NA ŻYWO | Badanie |
| pt | Participar | Vídeos do Reels e vídeos de curta duração | Eventos que você pode gostar | Reels | DIRETO | Enquete |
| ru | Участвовать | Reels и короткие видео | Мероприятия, которые вам могут понравиться | Видео Reels | В ЭФИРЕ | Опрос |
| tr | Katılmak | Makaralar ve kısa videolar | makara/kısa video | Reels | CANLI | Anket |
| uk | Беріть участь | Відео Reels і короткі відео | Події, які можуть вам сподобатися | Reels | ЕФІР | Опитування |
| vi | Tham gia | Reels và video ngắn | Sự kiện bạn có thể thích | Reels | TRỰC TIẾP | Khảo sát |
| zh-Hans | 参与 | 卷轴和短视频 | 您可能喜欢的活动 | Reels | 现场直播 | 调查 |
| zh-Hant | 參與 | Reels 和短影片 | 你可能感興趣的活動 | Reels | 現場直播 | 調查 |

### 5.3 zbluebugz beta-3-28 FB-phrase dictionary (verbatim, **STALE ~2022**)

**Attribution.** Copied from zbluebugz, *facebook-clean-my-feeds*:

- File: `beta/archive/beta-3-28.js`, object `KeyWords` (lines 119-1550).
- License: MIT. The comment on the object reads "Keywords - use FB's wording. If unknown, use EN's words and add '// --- needs translation'".
- 14 languages: `en, pt, de, fr, es, cs, vi, it, lv, pl, nl, he, ar, id`.
- Extracted with `tools/extract_kw328.js` (vm sandbox). Only FB-wording keys are shown.

**Why it is useful.** It is the richest per-language list of legacy "suggested" header phrases (`NF_*`, `GF_*`). It predates the 2026 Follow/Join-button era. Use it only as a low-weight fallback.

**Columns.** In the "other languages" column, `=en` marks an untranslated English fallback in the source. In the `pl` column, `=en` means the same.

| key | en | pl | other languages (`=en` marks an untranslated English fallback in the source) |
|---|---|---|---|
| `SPONSORED` | Sponsored | Sponsorowane | pt: Patrocinado; de: Gesponsert; fr: Sponsorisé; es: Publicidad; cs: Sponzorováno; vi: Được tài trợ; it: Sponsorizzato; lv: Apmaksāta reklāma; nl: Gesponsord; he: ממומן; ar: مُموَّل; id: Bersponsor |
| `MP_SPONSORED` | Sponsored | Sponsorowane | pt: Patrocinado; de: Gesponsert; fr: Sponsorisée; es: Publicidad; cs: Sponzorováno; vi: Được tài trợ; it: Sponsorizzata; lv: Apmaksāta reklāma; nl: Gesponsord; he: ממומן; ar: مُموَّل; id: Bersponsor |
| `NF_STORIES` | Stories | Historie | pt: Histórias; de: =en; fr: =en; es: Historias; cs: Příběhy; vi: Những câu chuyện; it: Storia; lv: Stāsti; nl: Verhalen; he: סטוריז; ar: القصص; id: Cerita |
| `NF_CREATE_ROOM` | Create room | Utwórz pokój | pt: Criar sala; de: Room erstellen; fr: Créer un salon; es: Crear sala; cs: Vytvořit místnost; vi: Tạo phòng họp mặt; it: Crea stanza; lv: Izveidot istabu; nl: Ruimte maken; he: יצירת חדר; ar: إنشاء غرفة; id: Buat Forum |
| `NF_PEOPLE_YOU_MAY_KNOW` | People you may know | Osoby, które możesz znać | pt: Pessoas que talvez conheças / Pessoas que você talvez conheça; de: Personen, die du kennen könntest; fr: Connaissez-vous...; es: Personas que quizá conozcas; cs: Koho možná znáte; vi: Những người bạn có thể biết; it: Persone che potresti conoscere; lv: Cilvēki, kurus tu varētu pazīt; nl: Mensen die je misschien kent; he: אנשים שאולי אתה מכיר; ar: أشخاص قد تعرفهم; id: Orang yang Mungkin Anda Kenal |
| `NF_PAID_PARTNERSHIP` | Paid partnership | Post sponsorowany | pt: Parceria paga; de: Bezahlte Werbepartnerschaft; fr: Partenariat rémunéré; es: Colaboración pagada; cs: Placené partnerství; vi: Mối quan hệ tài trợ; it: Partnership pubblicizzata; lv: Apmaksāta sadarbība; nl: Betaald partnerschap; he: שותפות בתשלום; ar: شراكة مدفوعة; id: =en |
| `NF_SPONSORED_PAID` | Sponsored · Paid for by ______ | Sponsorowane · Opłacona przez ______ | pt: Patrocinado · Financiado por ______; de: Gesponsert · Finanziert von ______; fr: Sponsorisé · Financé par ______; es: Publicidad · Pagado por ______; cs: Sponzorováno · Platí za to ______; vi: Được tài trợ · Tài trợ bởi ______; it: Sponsorizzato · Finanziato da ______; lv: Apmaksāta reklāma · Apmaksā ______; nl: Gesponsord · Betaald door ______; he: ממומן · שולם על ידי ______; ar: Sponsored * Paid for by ______; id: =en |
| `NF_SUGGESTED_FOR_YOU` | Suggested for you | Propozycje dla Ciebie | pt: Sugestões para ti / Sugestões para você; de: Vorschläge für dich; fr: Suggestions pour vous; es: Sugerencias para ti; cs: Návrhy pro vás; vi: Gợi ý cho bạn; it: Suggeriti per te; lv: Ieteikts tev; nl: =en; he: הצעות בשבילך; ar: اقتراحات قد تعجبك; id: =en |
| `NF_RECOMMENDED_POST` | Recommended post | Polecany post | pt: Publicação recomendada; de: Empfohlener Beitrag; fr: Publication recommandée; es: Publicación recomendada; cs: Doporučený příspěvek; vi: Bài viết đề xuất; it: Post suggerito; lv: Ieteikts ieraksts; nl: Aanbevolen bericht; he: מומלץ בשבילך; ar: =en; id: Disarankan untuk Anda |
| `NF_SUGGESTED_PAGES` | Suggested Pages | =en Suggested Pages | pt: Páginas sugeridas; de: Vorgeschlagene Seiten; fr: Pages suggérées; es: Páginas sugeridas; cs: Navrhované stránky; vi: =en; it: Contenuto suggerito per te; lv: =en; nl: =en; he: =en; ar: Suggested pages; id: Suggested pages |
| `NF_SUGGESTED_EVENTS` | Suggested Events | Proponowane wydarzenia | pt: Eventos Sugeridos; de: Vorgeschlagene Veranstaltungen; fr: Évènements suggérés; es: =en; cs: =en; vi: =en; it: =en; lv: =en; nl: Voorgestelde evenementen; he: =en; ar: =en; id: Saran Acara |
| `NF_EVENTS_YOU_MAY_LIKE` | Events you may like | =en Events you may like | pt: =en; de: =en; fr: Évènements qui pourraient vous intéresser; es: Eventos que te pueden gustar / Eventos que quizá te gusten; cs: =en; vi: =en; it: =en; lv: =en; nl: =en; he: =en; ar: =en; id: =en |
| `NF_REELS_SHORT_VIDEOS` | Reels and short videos | Rolki i krótkie filmy | pt: Vídeos do Reels e vídeos de curta duração / Vídeos curtos/do Reels; de: Reels und Kurzvideos; fr: Reels et vidéos courtes; es: Reels y vídeos cortos; cs: Sekvence a krátká videa; vi: Reels và video ngắn; it: Reel e video brevi; lv: Reels un īsi videoklipi; nl: Reels en korte video's; he: סרטוני Reels וקטעי וידאו קצרים; ar: ريلز ومقاطع الفيديو القصيرة; id: Reels dan Video Pendek |
| `NF_TABLIST_STORIES_REELS_ROOMS` | "Stories \| Reels \| Rooms" tabs list box | Pole listy zakładki "Relacje \| Reels \| Pokoje" | pt: Caixa de listagem da guia "Histórias \| Vídeos do Reels \| Salas" / Caixa de listagem da guia "Stories \| Vídeos do Reels \| Salas"; de: Listenfeld der Registerkarte "Stories \| Reels \| Rooms"; fr: Zone de liste de l'onglet "Stories \| Reels \| Salons"; es: Cuadro de lista de la pestaña "Historias \| Reels \| Salas"; cs: Seznam karet "Stories \| Reels \| Místnosti"; vi: Hộp danh sách tab "Tin \| Reels \| Phòng họp mặt"; it: Casella di riepilogo della scheda "Storie \| Reels \| Stanze"; lv: Cilnes "Stāsti \| Video rullīši \| Rooms" sarakstlodziņš; nl: Keuzelijst tabblad "Verhalen \| Reels \| Ruimtes"; he: תיבת רשימה של כרטיסיות "סטוריז \| Reels \| חדרים"; ar: "القصص \| ريلز \| الغرف" مربع قائمة علامات تبويب; id: Kotak daftar tab "Cerita \| Reels \| Forum" |
| `GF_NEW_FOR_YOU` | New for you | =en New for you | pt: Novidades para ti; de: Neu für dich; fr: Nouveautés; es: Novedades para ti; cs: Novinky pro vás; vi: =en; it: =en; lv: =en; nl: =en; he: =en; ar: =en; id: =en |
| `GF_SUGGESTED_FOR_YOU_GROUPS` | Suggested for you | Proponowane dla Ciebie | pt: Sugestões para ti / Sugestões para você; de: Vorschläge für dich; fr: Suggestions pour vous / Groupes qui pourraient vous intéresser; es: Sugerencias para ti; cs: Návrhy pro vás; vi: Gợi ý cho bạn; it: Suggeriti per te; lv: Iesakām; nl: Voorgesteld voor jou; he: הצעות בשבילך; ar: اقتراحات قد تعجبك; id: Disarankan untuk Anda |
| `GF_PAID_PARTNERSHIP` | Paid partnership | Post sponsorowany | pt: Parceria paga; de: Bezahlte Werbepartnerschaft; fr: Partenariat rémunéré; es: Colaboración pagada; cs: Placené partnerství; vi: Mối quan hệ tài trợ; it: Partnership pubblicizzata; lv: Apmaksāta sadarbība; nl: Betaald partnerschap; he: שותפות בתשלום; ar: شراكة مدفوعة; id: =en |
| `GF_SUGGESTED_GROUPS` | Suggested groups | Proponowane grupy | pt: Grupos sugeridos; de: Vorgeschlagene Gruppen; fr: Groupes suggérés; es: Grupos sugeridos; cs: Navrhované skupiny; vi: Nhóm gợi ý; it: Gruppi suggeriti; lv: Ieteiktās grupas; nl: Voorgestelde groepen; he: הצעות לקבוצות; ar: =en; id: =en |
| `GF_SEE_MORE_GROUPS` | See More Groups | Wyświetl więcej grup | pt: Ver mais grupos; de: Weitere Gruppen ansehen; fr: Voir plus de groupes; es: Ver más grupos; cs: Zobrazit další skupiny; vi: Xem thêm nhóm; it: Vedi altri gruppi; lv: Skatīt vairāk grupu; nl: Meer groepen bekijken; he: =en; ar: =en; id: =en |
| `GF_SUGGESTED_POST_PUBLIC_GROUP` | Suggested post from a public group / Post from public group | Proponowany post z grupy publicznej | pt: Publicação sugerida de um grupo público / Postagem de grupo público; de: Vorgeschlagener Beitrag aus einer öffentlichen Gruppe; fr: Publication suggérée d’un groupe public; es: Publicación sugerida de un grupo público; cs: Navrhovaný příspěvek z veřejné skupiny; vi: Bài viết gợi ý từ nhóm công khai; it: Post suggerito di un gruppo pubblico; lv: Ieteikts ieraksts no publiskas grupas; nl: Voorgesteld bericht van een openbare groep; he: הצעה של פוסט מקבוצה ציבורית; ar: منشور مقترح من مجموعة عامة; id: Saran postingan dari grup publik |
| `GF_BECAUSE_YOU_VIEWED_A_SIMILAR_POST` | Because you viewed a similar post | Ponieważ wyświetliłaś podobny post | pt: Porque viste uma publicação semelhante / Porque você visualizou uma publicação semelhante; de: Weil du dir einen ähnlichen Beitrag angesehen hast; fr: Parce que vous avez consulté une publication similaire; es: Porque has visto una publicación similar; cs: Protože jste se díval na podobný příspěvek; vi: Xem thêm bài viết tương tự / Vì bạn đã xem một bài viết tương tự; it: Perché hai visualizzato un post simile; lv: Jo tu skatīji līdzīgu ierakstu; nl: =en; he: בגלל שצפית בפוסט דומה; ar: لأنك شاهدت منشورًا مشابهًا; id: =en |
| `GF_BECAUSE_YOU_VIEWED_A_SIMILAR_GROUP` | Because you viewed a similar group | Ponieważ wyświetliłaś podobną grupę / Ponieważ wyświetliłeś podobną grupę | pt: Porque viste um grupo semelhante / Porque você visualizou um grupo semelhante; de: Weil du dir eine ähnliche Gruppe angesehen hast; fr: Parce que vous avez consulté un groupe similaire; es: Porque has visto un grupo similar; cs: Protože jste zobrazil podobnou skupinu; vi: Vì bạn đã xem một nhóm tương tự; it: Perché hai visualizzato un gruppo simile; lv: Jo tu apskatīji līdzīgu grupu; nl: Omdat je een vergelijkbare groep hebt bekeken; he: בגלל שצפית בקבוצה דומה; ar: لأنك شاهدت مجموعة مشابهة; id: Karena Anda melihat grup serupa |
| `GF_YOUR_RECENT_ACTIVITY` | Based on your recent activity | Na podstawie Twojej ostatniej aktywności | pt: Com base na tua atividade recente; de: Basierend auf deinen neuesten Aktivitäten; fr: D’après votre activité récente; es: Según tu actividad reciente; cs: Na základě vaší nedávné aktivity; vi: Dựa trên hoạt động gần đây của bạn; it: In base alla tua attività recente; lv: Pamatojoties uz tavām nesenajām darbībām; nl: Gebaseerd op je recente activiteit; he: =en; ar: =en; id: =en |
| `GF_FROM_A_GROUP_YOUR_FRIEND_IS_IN` | From a group that your friend is in | =en From a group that your friend is in | pt: De um grupo em que o teu amigo/a é membro; de: Aus einer Gruppe, in der dein/e Freund/in ist; fr: D’un groupe dont votre ami(e) est membre; es: De un grupo al que tu amigo pertenece; cs: Ze skupiny, kde je váš přítel; vi: =en; it: =en; lv: =en; nl: =en; he: =en; ar: =en; id: =en |
| `GF_FRIENDS_GROUPS` | Friends' groups | =en Friends' groups | pt: Grupos dos amigos; de: Gruppen von Freunden; fr: =en; es: =en; cs: =en; vi: =en; it: =en; lv: =en; nl: =en; he: =en; ar: =en; id: =en |
| `GF_POPULAR_NEAR_YOU` | Popular near you | =en Popular near you | pt: Populares perto de ti / Populares perto de você; de: Beliebt in deiner Nähe; fr: =en; es: =en; cs: =en; vi: =en; it: =en; lv: =en; nl: =en; he: פופולרי באזורך; ar: الأكثر رواجًا بالجوار; id: Populer di Sekitar Anda |
| `GF_JOIN_GROUP` | Join Group / Join | Dołącz do grupy / Dołącz | pt: Aderir ao grupo / Aderir / Participar / Participar do grupo; de: Gruppe beitreten / Beitreten; fr: Rejoindre le groupe / Rejoindre; es: Unirte al grupo / Unirte / Unirse al grupo; cs: Přidat se ke skupině / Přidat se; vi: Tham gia nhóm / Tham gia; it: Iscriviti al gruppo / Iscriviti; lv: Pievienoties grupai / Pievienoties; nl: Lid worden; he: הצטרף לקבוצה / הצטרפי / הצטרף; ar: انضمام إلى المجموعة / انضمام; id: Gabung Grup / Gabung |
| `VF_NEW_FOR_YOU_VIDEOS` | New for you | =en New for you | pt: Novidades para ti; de: Neu für dich; fr: Nouveautés; es: Novedades para ti; cs: Novinky pro vás; vi: Video mới dành cho bạn; it: =en; lv: New Videos for You; nl: Nieuwe video's voor jou; he: =en; ar: =en; id: =en |
| `VF_LIVE` | LIVE | NA ŻYWO | pt: DIRETO; de: =en; fr: EN DIRECT; es: ESTRENO; cs: ŽIVĚ; vi: TRỰC TIẾP; it: IN DIRETTA; lv: TIEŠRAIDE; nl: =en; he: שידור חי; ar: مباشر; id: =en |
| `OTHER_SURVEY` | See Survey Details | Zobacz szczegóły ankiety | pt: Veja os detalhes da pesquisa; de: Siehe Umfragedetails ; fr: Voir les détails de l'enquête; es: Consulte los detalles de la encuesta; cs: Viz Podrobnosti průzkumu; vi: Xem chi tiết khảo sát; it: Vedi i dettagli del sondaggio; lv: Skatiet aptaujas detaļas; nl: Bekijk de details van het onderzoek; he: ראה פרטי הסקר; ar: انظر تفاصيل الاستطلاع; id: Lihat Detail Survei |
| `OTHER_FB_RENAMED` | The Facebook company is now called Meta | Firma Facebook nazywa się teraz Meta | pt: A empresa do Facebook agora se chama Meta; de: Das Facebook-Unternehmen heißt jetzt Meta; fr: La société Facebook s'appelle désormais Meta; es: La compañía de Facebook ahora se llama Meta; cs: Facebooková společnost se nyní jmenuje Meta; vi: Công ty Facebook bây giờ được gọi là Meta; it: La società di Facebook si chiama ora Meta; lv: Facebook uzņēmumu tagad sauc par Meta; nl: Het Facebook-bedrijf heet nu Meta; he: לחברת פייסבוק קוראים כיום Meta; ar: شركة Facebook تسمى الآن Meta; id: Perusahaan Facebook sekarang bernama Meta |
| `OTHER_FB_PRIVACY_TERMS` | We've updated the Meta Privacy Policy and Terms of Service | Zaktualizowaliśmy Politykę prywatności Meta i Warunki korzystania z usługi Meta | pt: Atualizámos a Política de Privacidade e os Termos de Serviço da Meta; de: Wir haben die Meta-Datenrichtlinie und die Meta-Nutzungsbedingungen aktualisiert; fr: Nous avons mis à jour la Politique de confidentialité et les Conditions de service de Meta; es: Hemos actualizado la Política de privacidad y las Condiciones del servicio de Meta; cs: Aktualizovali jsme Zásady ochrany osobních údajů a Smluvní podmínky společnosti Meta; vi: Chúng tôi đã cập nhật Chính sách quyền riêng tư và Điều khoản dịch vụ của Meta; it: Abbiamo aggiornato l'Informativa sulla privacy e i Termini di servizio di Meta; lv: Esam atjauninājuši Meta konfidencialitātes politiku un pakalpojumu sniegšanas noteikumus; nl: We hebben het Meta Privacybeleid en de Servicevoorwaarden bijgewerkt; he: עדכנו את מדיניות הפרטיות ותנאי השירות של Meta; ar: لقد أجرينا تحديثات على سياسة خصوصية وشروط خدمة Meta; id: Kami telah memperbarui Meta Privacy Policy dan Terms of Service |
| `PAUSE_ANIMATED_GIFS` | pause GIF / Pause GIF | wstrzymaj GIF | pt: Pausar GIF; de: Pause-GIF; fr: pause GIF; es: pausa GIF; cs: pozastavit GIF; vi: tạm dừng GIF; it: mettere in pausa GIF; lv: pauzēt GIF; nl: pauzeer GIF; he: השהיית GIF; ar: إيقاف صورة GIF مؤقتًا; id: Jeda GIF |

### 5.4 Ad-label word lists from 2026 blockers (verbatim)

#### 5.4.1 webcleaner 8.23.0 (pyxis3-ai/webcleaner, `webcleaner.user.js` l.512-522, 1652-1665, 1755-1779; 2026-10-12)

The words are compared after `norm()`, which strips non-letters.

- **`SPON`** (sponsored labels, prefix-matched after norm):

  > sponsored paidpartnership publicidad patrocinado sponsoris commandit gesponsert sponsorizzat gesponsord bersponsor sponsorlu sponsorowan sponsrad sponset sponsoreret ممول ממומן реклама 広告 광고 赞助 贊助 χορηγούμενη

- **`PROMOTED`:**

  > promoted promocionado

- **`AD_WORDS`** (whole-token "Ad" words, at most 12 letters):

  > ad ads anuncio anuncios annonce anzeige werbung pubblicita annuncio advertentie reklam reklama reklame hirdetes mainos διαφημιση إعلان اعلان реклама 広告 광고 广告 廣告 প্রচারিত publicidade patrocinado

- **`AI_MARKS`:**

  > aicontent aigenerated generatedbyai imaginedwithai madewithai createdwithai aiinfo aigeneratedcontent metaai askmetaai trymetaai aistudio poweredbyai chatwithai aiimage contenidodeia contenidogeneradoconia contenuia genereparlia kiinhalt mitkigeneriert aiコンテンツ ai콘텐츠 محتوىالذكاءالاصطناعي محتوىمولدبالذكاءالاصطناعي

- **`RECS`** (feed routes only):

  > suggestedforyou suggestedpost pagesforyou pagesyoumaylike groupsyoumaylike suggestedaccounts peopletofollow accountstofollow pagestofollow peopleyoumayknow

- **`TRAYS`:**

  > reels reelsandshortvideos stories

- **`FOLLOW`** (exact button text, feed routes only):

  > follow · seguir · suivre · folgen · segui · volgen · takip et · följ · følg · obserwuj · متابعة · подписаться · フォロー · 팔로우 · 关注 · 關注 · add friend · join · join group · إضافة صديق · انضمام

#### 5.4.2 Sieve (codepurse/Sieve, `content/facebook-ads-dom.js` l.173-230; 2026-09)

Exact whole-label match on the segment before "·". The source comment reads: "Facebook has moved the feed byline from 'Sponsored' to plain 'Ad' — visible in a feed screenshot from 2 September 2026."

> ad, sponsored, sponsorisé, commandité, patrocinado, publicidad, gesponsert, sponsorizzato, gesponsord, sponsrad, sponsoreret, sponset, sponsoroitu, sponsorowane, sponzorováno, sponzorované, szponzorált, hirdetés, sponsorizat, sponsorlu, sponzorirano, χορηγούμενη, реклама, спонсорирано, спонзорисано, ממומן, إعلان ممول, ممول, حمایت‌شده, प्रायोजित, স্পনসর্ড, ได้รับการสนับสนุน, được tài trợ, bersponsor, ditaja, may sponsor, 広告, 광고, 赞助内容, 贊助, 广告, 廣告

#### 5.4.3 Nook (`facebook-sponsored-blocker.js` l.30-40; 2026-09)

Whitespace is removed before matching.

> sponsored, publicidad, publicaciónpagada, sponsorisé, commandité, gesponsert, patrocinado, sponsorizzato, gesponsord, sponsoreret, sponsrad, sponset, sponsoroitu, sponsorowane, sponzorováno, szponzorált, спонсорирано, реклама, 赞助内容, 贊助, スポンサー, 광고, ได้รับการสนับสนุน, đượctàitrợ, bersponsor, प्रायोजित, ditaja, χορηγούμενο, promovare, sponzorované, sponsorlu, ממומן

#### 5.4.4 HushFacebookWeb (`sponsored-dom.js`; 2026-10)

English only ("A table per language comes later"):

> ad, advertiser link, paid, paid partnership, sponsored

#### 5.4.5 unalgorithm `markers/en.ts` (HeitechSoft/unalgorithm, 2026-10)

The patterns below are copied from the file (regex bodies abbreviated only where noted):

- labels:
  - `sponsored`: heads ['sponsored', 'ad'], tails ['paid partnership']
  - `follow`: heads ['follow'] (never "Following")
  - `join`: heads ['join', 'join group'], prefix 'request to'
- `paidPartnership`: `/^paid partnership\b/i`
- `suggestedHeader`: `/^(suggested for you|suggested post|suggested posts|recommended for you|suggested from .+|because you (follow|like|viewed) .+)$/i`
- `activity`: `/^.+?\s(?:commented on|reacted to|replied to|was tagged in|was mentioned in|likes?|loves?|is interested in|answered)\s+(?:this|a|an|.+?['’]s)\b.*$/i`
- `reshare`: `/^.+?\sshared\s+(?:a|an|this|.+?['’]s)\s+(?:post|memory|reel|video|link|photo|event)\b.*$/i`
- `ageWords`: `/\bago$|^(just now|now|yesterday|today)\b/i`
- `seeMore`: `/^see more$/i`
- `ctaButtons`: shop now, learn more, sign up, book now, download, get offer, apply now, install now, contact us, send message, subscribe, watch more, order now, get quote, get directions, buy tickets, see menu, play game, use app, donate now, listen now
- modules:
  - people-you-may-know: [people you may know]
  - reels: [reels, short videos] + tail "and short videos"
  - groups: [suggested groups, groups you may like, suggested for you in groups, your group suggestions]
  - pages: [suggested pages, pages you may like]
  - stories: [stories]
  - games: [games, instant games]
  - promo: [marketplace, today's picks, todays picks, events you may like]
- audience:
  - public: `/^shared with public$/i`
  - friends: `/^shared with (your |.+['’]s )?friends( of friends)?$/i`
  - custom: `/^shared with (custom|only me|.+)$/i`
- `chrome`: `/^(like|comment|share|send)$/i`

#### 5.4.6 Social Fixer filter #28 "Sponsored" (matt-kruse/socialfixerdata `filters.json` l.75; 2026)

```
[role=button],[role=link]:has-visible-text(^[͏⁠]*(A[͏⁠]*d[͏⁠]*$|Anzeig|Chartered$|Спонз|Спонс|Được|Gespons|Hirdetés|Patrocin|Реклам|Publicid|S[͏⁠]*p[͏⁠]*o[͏⁠]*n[͏⁠]*[sz]|Χορηγ|広告|贊助|赞助|ממומ))
```

It is paired with `a[aria-label][href*='/ads'][href*='/about']`. Note the explicit U+034F/U+2060 tolerance between letters.

#### 5.4.7 cuzic "Feed Cleaner for Facebook" 2.2.5 (Greasy Fork 588918, l.21-191; 2026-07-29)

**`I18N`** (per-locale UI strings used for matching):

| key | en | ja | es | pt | fr | de | ko | zh-hans | zh-hant |
|---|---|---|---|---|---|---|---|---|---|
| ad | Ad | 広告 | Publicidad | Patrocinado | Sponsorisé | Gesponsert | 광고 | 赞助内容 | 贊助 |
| addFriend | Add friend | 友達になる | Añadir como amigo(a) | Adicionar à lista de amigos | Ajouter ami(e) | Freund/in hinzufügen | 친구 추가 | 加为好友 | 加朋友 |
| follow | Follow | フォローする | Seguir | Seguir | Suivre | Folgen | 팔로우 | 关注 | 追蹤 |
| join | Join | 参加する | Unirte | Aderir | Rejoindre | Beitreten | 가입 | 加入 | 加入 |
| suggestedGroups | Suggested for you | おすすめ | Sugerencias para ti | Sugestões para ti | Suggestions | Für dich vorgeschlagen | 회원님을 위한 추천 | 推荐 | 推薦 |
| createStory | Create story | ストーリーズを作成 | Crear historia | Criar história | Créer une story | Story erstellen | 스토리 만들기 | 创建快拍 | 建立限時動態 |
| reels | Reels | リール | Reels | Reels | Reels | Reels | 릴스 | Reels | Reels |
| feedStories | Feed Stories | フィードのストーリーズ | Historias | Stories | Stories | Stories | 스토리 | 快拍 | 限時動態 |

**`AD_WORDS_BY_LANG`** ("Sponsored" in 64 locales):

> af Geborg · am የተከፈለበት ማስታወቂያ · ar إعلان مُموَّل · as পৃষ্ঠপোষকতা কৰা · ay Yatiyanaka · az Sponsor dəstəkli · be Рэклама · bg Спонсорирано · br Paeroniet · bs Sponzorirano · bn সৌজন্যে · ca Patrocinat · co Spunsurizatu · cs Sponzorováno · cy Noddwyd · da Sponsoreret · de Gesponsert · el Χορηγούμενη · eo Reklamo · es Publicidad · et Sponsitud · eu Babestua · fa دارای پشتیبانی مالی · fi Sponsoroitu · fo Stuðlað · fr Sponsorisé · fy Sponsore · ga Urraithe · gl Patrocinado · gn Oñepatrosinapyre · hi प्रायोजित · hu Hirdetés · id Bersponsor · it Sponsorizzata · ja 広告 · jv Disponsori · kk Демеушілік көрсеткен · km បានឧបត្ថម្ភ · lo ໄດ້ຮັບການສະໜັບສະໜູນ · mk Спонзорирано · ml സ്പോൺസർ ചെയ്തത് · mn Ивээн тэтгэсэн · mr प्रायोजित · ms Ditaja · ne प्रायोजित · nl Gesponsord · or ପ୍ରଯୋଜିତ · pa ਸਰਪ੍ਰਸਤੀ ਪ੍ਰਾਪਤ · **pl Sponsorowane** · ps تمويل شوي · pt Patrocinado · ru Реклама · si අනුග්‍රහය දක්වන ලද · so La maalgeliyey · sv Sponsrad · te స్పాన్సర్ చేసినవి · th ได้รับการสนับสนุน · tl May Sponsor · tr Sponsorlu · uk Реклама · ur تعاون کردہ · vi Được tài trợ · zh-hans 赞助内容 · zh-hant 贊助

### 5.5 uBlock Origin lists (uBlockOrigin/uAssets, HEAD 2026-10-21)

**Marketplace "advertiser link" aria-labels** (`filters/filters.txt`, the `:matches-path(/marketplace/item)` rule; about 55 locales). The selector requires `a[attributionsrc^="/privacy_sandbox/"]` plus one of these labels:

> `[aria-label$=" anunciante"][aria-label*=" d"]` (es/pt "Link do/del anunciante"), Lien de l’annonceur, `$="autan pengiklan"`, Adverteerderskakel, Link sa nag-advertise, Link oglašivača, Odkaz od inzerenta, Link fra annoncør, Werbelink, Link ng advertiser, Link dell'inserzionista, Veza oglašivača, Manisautilirijimut kasurvik, Kiunganishi cha mtangazaji, Lyen konpayi ki fè piblisite a, Reklāmdevēja saite, Reklamuotojo nuoroda, Hirdető hivatkozása, Link tar-reklamatur, Adverteerderslink, Annonsørlenke, **Link reklamodawcy** (pl), Link promotor, Lidhja e reklamuesit, Odkaz na inzerenta, Povezava oglaševalca, Mainostajan linkki, Annonsörlänk, Liên kết của nhà quảng cáo, Reklamveren bağlantısı, Σύνδεσμος διαφημιζόμενου, Връзка на рекламодател, Линк на огласувач на реклами, Сурталчлагчийн холбоос, Ссылка рекламодателя, Веза оглашивача, Посилання рекламодавця, რეკლამის განმთავსებლის ბმული, קישור של מפרסם, ایڈورٹائزر کا لنک, رابط المعلن, जाहिरातदार लिंक, विज्ञापनदाता द्वारा लिंक, বিজ্ঞাপনদাতা লিংক, বিজ্ঞাপনদাতার লিঙ্ক, જાહેરાતકર્તા લિંક, అడ్వర్టయిజర్ లింక్, പരസ്യദാതാവിന്റെ ലിങ്ക്, වෙළඳ ප්‍රචාරක සබැඳිය, ลิงก์ผู้ลงโฆษณา, 광고주 링크, `^="廣告"$="連結"`, 广告主提供的链接, 広告主によるリンク

**m.facebook.com "Sponsored" regex** (`filters/filters-mobile.txt` l.32-36). It is a mobile surface, but the words are the same as the desktop byline words in those locales:

> Sponsored | Gesponsert | Sponsorlu | **Sponsorowane** | Ispoonsara godhameera | Geborg | Bersponsor | Ditaja | Disponsori | Giisponsoran | Sponzorováno | Sponsoreret | Publicidad | May Sponsor | Sponsorisée | Oipytyvôva | Ɗaukar Nayin | Sponzorirano | Uterwa inkunga | Sponsorizzato | Imedhaminiwa | Hirdetés | Misy Mpiantoka | Gesponsord | Sponset | Patrocinado | Sponsorizat | Sponzorované | Sponsoroitu | Sponsrat | Được tài trợ | Χορηγούμενη | Спонсорирано | Спонзорирано | Ивээн тэтгэсэн | Реклама | Спонзорисано | במימון | سپانسرڈ | دارای پشتیبانی مالی | ስፖንሰር የተደረገ | प्रायोजित | স্পনসর্ড | ਪ੍ਰਯੋਜਿਤ | પ્રાયોજિત | ପ୍ରାୟୋଜିତ | ಪ್ರಾಯೋಜಿಸಲಾಗಿದೆ | 광고 | 贊助 | 赞助内容 | 広告 | സ്‌പോൺസർ ചെയ്‌തത്

(Some entries in the source are fragmentary script-split forms, e.g. "செய்யப்பட்ட செய்யப்பட்ட" and "ලද ලද ලද". They are omitted here as unusable for exact matching.)

**Japanese ad link aria-label:** `a[aria-label="広告"]` (feed and Watch).

### 5.6 Stories and Reels labels (Kill News Feed, Greasy Fork 594983; 2026-09)

The source comment describes them as "aria-label values Facebook uses for 'Stories' and 'Reels' across languages".

- STORIES_LABELS:

  > Stories, Storie, Historias, Histórias, Historias destacadas, Verhalen, Storys, Relatos, Povești, **Relacje**, Истории, Történetek, Històries

- REELS_LABELS:

  > Reels, **Rolki**, Reel

### 5.7 Coverage gaps (what no reference provides)

- No reference gives the 2026 "Ad" byline word for any locale except en (and ja 広告, which is the same word as "Sponsored" there). Per-locale "Ad" words are only guessable from WC's AD_WORDS list. This is the biggest i18n risk. The structural signals in §4.1.2 and §4.1.3 are locale-free, so rank them first.
- Polish has no captured strings for: Ad, See more, Write a comment, Comment by, Add friend, Feed posts, Create a post, AI info, Verified account, View more comments, Reply. MFGA should ship a **self-calibrating locale probe** (§6.3).

## 6. Recommended detection architecture for MFGA (synthesis)

These are recommendations built from §2-§5. They are not observations.

### 6.1 Pipeline

1. **Route classifier.** Decide which surface the page is:
   - `home`: `/`, `/home.php`, `/?sk=*`
   - `feeds-filter`: `/?filter=friends|favorites|groups|pages|all`, with or without `&sk=h_chr`
   - `groups-feed`: `/groups/feed/`
   - `group`: `/groups/<id>/…`
   - `profile`
   - `search`: `/search/…`
   - `permalink` or `dialog`
   - `other`

   Follow/Join suggestion rules run only on home, feeds-filter and groups-feed.
2. **Unit discovery.** Use one MutationObserver on `document.body` with `childList+subtree`. For each added subtree, collect `[aria-posinset]:not([role])` and `[role="article"]`, then drop:
   - comments: label `/^(comment|reply) by /i`, or own links carrying `comment_id`;
   - nested candidates;
   - candidates inside a `<form>`;
   - skeletons (`[role=progressbar]` and no `a[href]`);
   - `[data-virtualized="true"]` slots.

   This is HUSH's proven filter set. Fallbacks in order: `[role="main"] h3 ~ div [data-virtualized="false"] > div`, then `[role="feed"] > div`, then `[data-pagelet^="FeedUnit"]`.
3. **Label cache.** A second observer records the text of nodes referenced by `aria-labelledby` or `<use href>` as they are inserted (HUSH `label-cache.js`), because the targets vanish within a frame.
4. **Classifier.** Run in priority order and stop at the first decisive hit. The result is `{kind, reason, confidence}`:
   1. An earlier verdict from the GraphQL layer, keyed by any stable token you can join on. INFERRED: if no join key exists, skip this step.
   2. Structural ad signals: §4.1.2, then §4.1.3.
   3. Decoded byline label equals a locale ad word (§4.1.5).
   4. Module panels: §4.3, §4.4 (Reels grid), §4.6.
   5. Follow/Join in the first non-h5 heading (route-gated, §4.2).
   6. AI labels (§4.9).
   7. Weak corroboration, only combined with another weak signal: `__cft__` length, `cta-` without a permalink, `attributionsrc`.
5. **Hider.** Set `data-mfga-hide="<reason>"` on the first child of `[aria-posinset]` and hide it through the stylesheet (§4.11). Never hide within 1200 px of the document bottom; re-run hiding on scroll. On WebKit, defer posts fully above the viewport.
6. **Part tagger (for restyle).** For kept posts, set MFGA's own attributes on **MFGA-owned wrappers**, or use attribute selectors directly in CSS. The CSS hooks are:
   - `[data-ad-rendering-role=profile_name]`
   - `[data-ad-rendering-role=story_message]`
   - `[data-ad-rendering-role$=_button]`
   - `[aria-haspopup=menu][aria-label^="Actions for this post"]`
   - `a[aria-label^="Hide post"], a[aria-label="hide post"]`
   - `svg[role=img] > title`
   - `span[role=toolbar]`
   - `[role=article][aria-label^="Comment by"]`
   - `[data-lexical-editor]`

   Re-apply on remount, keyed by the posinset element in a WeakMap.

### 6.2 Things MFGA should never do

- Rely on atomic classes (`x1a2a7pz`…). If a declaration is needed, discover the class at runtime with Social Fixer's "S2F gib" technique, which scans the stylesheets for a declaration such as `display:flex` and maps it back to the class.
- Write attributes on the feed list's direct children (HUSH), or `.remove()` FB nodes on desktop.
- Treat `data-ad-preview`, `data-ad-rendering-role`, `meta` domains or "Learn More" as ad evidence.
- Read a post's identity from hrefs. They are per-render tokens; the home URL appears until hover.
- Substring-match "Sponsored" or "Ad" anywhere in the post.

### 6.3 Self-calibrating locale probe (diagnostics)

On each page load, read these from the first few kept posts and store them per `document.documentElement.lang`:

- the observed action-bar texts (`[data-ad-rendering-role=like_button]` closest button's text and aria-label);
- the comment and share aria-labels;
- the menu's aria-label prefix;
- the hide link's aria-label prefix.

Compare them with the §5.1 dictionary and surface mismatches in a diagnostics panel. HUSH does something similar: `diagnostics.js` and "Copy report"; UNALG's `chrome` regex exists "for the locale self-test". This is how the unverified Polish strings (Ad, See more, Write a comment, Comment by) get filled from real use.

Suggested counters:

- posts seen;
- posts hidden, by reason;
- posts with an undecodable byline;
- `[data-virtualized=true]` count;
- whether pagination is still advancing (has `aria-posinset` max increased in the last N seconds of scrolling).

## 7. Open questions (need a live logged-in check)

1. **Feeds filter pages** (`/?filter=friends&sk=h_chr` and the others): is the list still preceded by the hidden h3 "Feed posts", by an h2 with the filter's name, or by `role=feed`? Are ads inserted as `[aria-posinset]` slots of the same shape? (INFERRED yes.)
2. **Polish 2026 strings:** "Ad" byline word, "See more", "Write a comment…", "Comment by …", "Add friend", "Feed posts", "Create a post", "Actions for this post by <Name>" (is there a "by" form in PL?), "Hide post by <Name>", "AI info"/"AI content", "Verified account".
3. **`/ads/about` recall in 2026.** It was absent in the 2026-10-20 EN ad capture. Does it appear on hover, only in some cohorts, or never in the feed any more?
4. **Sponsored-info link** (`?__cft__` without `__tn__`): does it survive in Oct-2026 cohorts where the label is a deep SVG `<use>` chain? The anonymized captures strip queries, so this cannot be confirmed from them.
5. **`role="feed"` on home:** what share of cohorts still has it in late 2026? GF587952 and GF594983 vs HUSH, UNALG and BOUNCER.
6. **The hidden decoy link card:** how exactly is it hidden (clip, offscreen, zero size)? MFGA needs a reliable "is this attachment real" test before treating `meta`/`title`/`description` as a real link share.
7. **Profile timelines in 2026:** are posts `[aria-posinset]` there as well? No 2026 capture was found.
8. **React fiber keys:** HUSH and ANYSAVE say nothing is on the elements and the root has `__reactContainer$`; FCMF-AS reads `__reactFiber$`. Which is right, and does MV3 isolated-world vs MAIN-world access matter?
9. **Footer layout A vs B:** is it per cohort or per post type? For example, do groups keep A and keep the "Send" button?
10. **"Feed posts" heading in non-English locales:** is it translated, and is it always an `h3`?
11. **Exact first-child `display:contents` claim (HUSH):** in PAGRU (2026-03) the posinset's first child **is** `div[data-virtualized]`; in UA-CAP (2026-10) there is a plain `div` between them. Is the stall-on-attribute effect tied to the list's children or to the posinset element?

## 8. Source URLs and provenance details

- zbluebugz/facebook-clean-my-feeds:
  - https://github.com/zbluebugz/facebook-clean-my-feeds
  - `greasyfork-release/fb-clean-my-feeds.user.js` v5.02 (Nov 2024): dictionary l.181-2167; detection functions `nf_isSponsored_*`, `nf_isSuggested`, `nf_getCollectionOfPosts` (Oct 2024).
  - `beta/archive/beta-3-28.js` (~2022): `KeyWords` l.119-1550.
  - Issues #80 (Mar–Apr 2025, "FB is using custom random HTML elements", structure changes daily), #87 (follow rules, 2025-12), #88, #89 (Feb 2026: the fork works). MIT.
- Artificial-Sweetener/facebook-clean-my-feeds 6.3.2 (2026-10-05):
  - https://github.com/Artificial-Sweetener/facebook-clean-my-feeds
  - `src/selectors/news.js`, `src/feeds/shared/sponsored.js`; commit 53ced90 (2026-03-16) removed locale detection.
  - Greasy Fork 552339.
- pyxis3-ai/webcleaner 8.23.0 (2026-10-12):
  - https://github.com/pyxis3-ai/webcleaner
  - `webcleaner.user.js` (vocab l.512-522, 1652-1665, 1755-1779; `OBFUSCATED` l.1869); README (desktop vs mobile hiding, 1200 px rule, 8.10.16, 8.21); `test/fixtures/fb-desktop.html`.
- uBlockOrigin/uAssets (HEAD 2026-10-21):
  - https://github.com/uBlockOrigin/uAssets
  - `filters/filters.txt` l.264-352, `filters/quick-fixes.txt` l.110-156, `filters/filters-mobile.txt` l.32-36.
  - Issue #3367 (Facebook ads megathread; Aug 2026 discussion of reduced support; Jamie0 commit 2026-08-10 "block Facebook ads again").
- HeitechSoft/unalgorithm (2026-10-20):
  - https://github.com/HeitechSoft/unalgorithm
  - `packages/platforms/fixtures/facebook/2026-10-*.html` (captured 2026-10-19/20, EN), `live2026.ts`, `src/facebook/discover.ts`, `src/facebook/markers/en.ts`, `scripts/capture/facebook.js`.
  - Commits 681d1b5 (2026-10-16, "find the 2026 feed without role="feed", hide posts labelled 'Ad'") and 07f613c (2026-10-17).
- SysAdminDoc/HushFacebookWeb 0.0.4 (HEAD 2026-10-18):
  - https://github.com/SysAdminDoc/HushFacebookWeb
  - `src/core/dom/posts.js`, `hide.js`, `label-cache.js`, `visible-text.js`, `seen-keys.js`; `src/features/feed/sponsored-dom.js`, `hide-suggested-posts.js`, `hide-follow-buttons.js`, `hide-stories-tray.js`, `hide-reels-in-feed.js`, `expand-long-posts.js`, `post-dates.js`, `keep-feed-place.js`, `hide-ai-posts.js`, `ad-markers.js`; `src/features/comments/*`; `tests/comment-stickers.test.js`.
  - Credits FB Feed Filter 0.1.0.17 (MIT 2026).
- imbue-ai/bouncer:
  - https://github.com/imbue-ai/bouncer
  - `Bouncer/adapters/facebook/FacebookAdapter.ts` (2026-10-20; "verified against the live feed, October 2026").
- gtech/tolerance:
  - https://github.com/gtech/tolerance
  - `scraper.ts` (2026-10).
- codepurse/Sieve:
  - https://github.com/codepurse/Sieve
  - `content/facebook-ads-dom.js` (2026-09).
- nook-browser/Nook:
  - https://github.com/nook-browser/Nook
  - `Packages/NookBlocker/Sources/NookBlocker/Resources/facebook-sponsored-blocker.js` (2026-09).
- drmikecrowe/mbfcext:
  - https://github.com/drmikecrowe/mbfcext
  - `.planning/examples/forward-post.html` (committed 2026-03-09), `src/contents/content/facebook.ts`.
- zenithkandel/fb-post-image-downloader:
  - https://github.com/zenithkandel/fb-post-image-downloader
  - "facebook dom finding.md" (2026-09-12).
- pagru7/facebook-shit-remover:
  - https://github.com/pagru7/facebook-shit-remover
  - `template.html`, `content.js` (2026-03-13, Polish).
- rarestg/nyc-housing-scout:
  - https://github.com/rarestg/nyc-housing-scout
  - `examples/feed-snapshot-1.txt` (≤2026-03-13).
- bluek1te/quorum:
  - https://github.com/bluek1te/quorum
  - search fixture (2026-07-03/04).
- matt-kruse/socialfixerdata:
  - https://github.com/matt-kruse/socialfixerdata
  - `filters.json` (#28 Sponsored, suggested regex, PYMK, Memories, Reels), `hideable.json` (2026 entries); HEAD 2026-08-09.
  - Social Fixer 31.1.1 is Greasy Fork 583964 (2026-06-22).
- yusupsupriyadi/anything-save-extension:
  - https://github.com/yusupsupriyadi/anything-save-extension (2026-07-29).
- Greasy Fork scripts:
  - Fetched via `https://update.greasyfork.org/scripts/<id>.user.js`: 598911, 600341, 594983, 588918, 587952, 577212, 575507, 583964, 581285, 524987, 549966.
  - Local copies: `refs/greasyfork/gf-<id>.user.js`.
- SaifMahmud366/facebook-sponsored-post-blocker 2.1:
  - https://github.com/SaifMahmud366/facebook-sponsored-post-blocker (2026-09-18).
- Others:
  - browser-use/browser-harness `groups.md` (2026-04-18)
  - oricho123/rentifier (2026-03-03)
  - blindpentester/Tampermonkey-Scripts (2026-09-13)
  - bvolpato/copy-as-markdown (2026-10-18)
  - GGrzesiek DoomStop `Config.kt`
  - ziutus ai_assistant_lenie (`popup.js`, `social_post_text_cleanup.py`)
