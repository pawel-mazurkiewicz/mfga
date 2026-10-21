# MFGA dossier: the Facebook desktop (Comet) chrome DOM, routes and SPA mechanics, 2024–2026

Author: research agent (bg-dom-chrome). Written 2026-10-21.
Scope: everything on www.facebook.com desktop that is **not** a feed post: the top banner, the left rail, the
right rail, the composer, the stories and reels trays, the current user's identity, routes, SPA navigation,
layers and portals, and dark mode. The 2010 shell must replace FB's chrome while reading live data from it
and handing actions back to it.

Feed-post DOM and the GraphQL feed protocol are covered by the sibling dossiers `dom-feed.md` and
`graphql-protocol.md` in this folder.

---------------------------------------------------------------------------------------------------

## 0. How to read this document

### 0.1 Confidence tags

| Tag | Meaning |
|---|---|
| **[VERIFIED-LIVE-2026]** | Seen in a logged-in 2026 DOM or accessibility snapshot, or measured live by a 2026 project that states it. |
| **[CODE-2026]** | Read from Facebook's own JS bundles that were live on 2026-10-21 (logged-out bundles, so this covers shared infrastructure only). |
| **[CODE-2025-10]** | Read from Facebook's own **logged-in, pl_PL** JS bundles saved around 2025-10-21. This is the strongest source for logged-in component logic and the Polish strings, but it is a year old and may be stale. |
| **[REF-2026]** | Taken from a third-party script or extension that was updated in 2026 and works against live FB. |
| **[OLD]** | The source is older than 2024. It may be stale. |
| **INFERRED** | My own reasoning. The reason is stated each time. It must be verified live, ideally with the shell's diagnostics dump. |

### 0.2 Sources (all paths are under `/tmp/claude-0/-home-user-mfga/80791cd0-cb87-5148-8f51-26da76f4aa2e/scratchpad/`)

| ID | What | Date | Where |
|---|---|---|---|
| S1 | Playwright accessibility snapshot of a logged-in **en_US** FB group page (NYC user) | committed 2026-04-19 | `refs/gh2026/rarestg_nyc-housing-scout/examples/feed-snapshot-1.txt` |
| S2 | Playwright accessibility snapshot of a logged-in **Home** page (anonymized "Fixture User", EU user, English UI, probably en_GB) | committed 2026-04-17 | `refs/raw/fredheir/snapshot.txt` (github.com/fredheir/feed-tools `tests/fixtures/facebook/snapshot.txt`) |
| S3 | Accessibility snapshots while acting **as a Page profile** (Professional dashboard) | 2026-08-23 and 2026-09-04 | `refs/raw/gaiaeyes/*.txt` (github.com/GaiaEyesHQ/gaiaeyes-backend `tmp/social_growth_audit/…`) |
| S4 | HushFacebookWeb v0.0.4: source and tests with notes on live captures from 2026-10-11/12 | commit 2026-10-18 | `refs/gh2026/SysAdminDoc_HushFacebookWeb/` (`src/features/appearance/declutter-table.js`, `hide-tab-badges.js`, `force-dark.js`, `src/features/menu/menu-entry.js`, `src/features/opening/*.js`, `src/core/route.js`, `tests/declutter.test.js`, `tests/messenger-page.test.js`, `tests/menu-entry.test.js`) |
| S5 | webcleaner (pyxis3-ai): README changelog with live logged-in measurements | 2026-10-12 | `refs/webcleaner/README.md` (line 342: selector audit), `webcleaner.user.js` lines 1636–1741 and 2131 |
| S6 | unalgorithm (HeitechSoft): Facebook adapter, routes and fixtures captured 2026-10-19 | commit 2026-10-20 | `refs/gh2026/HeitechSoft_unalgorithm/packages/platforms/src/facebook/{adapter,routes}.ts`, `fixtures/facebook/` |
| S7 | **Saved logged-in pl_PL Facebook page**: 237 JS bundles (`*.pobrane`) and 5 CSS files | bundles ≈2025-10-21 (repo github.com/peblo13/21102025) | `refs/raw/peblo13_fbfiles/`. Derived files: `research/out/bg-dom-chrome-artifacts/pl_fbt_strings.txt` (4,132 decoded Polish UI strings), `pl_modules.txt` (module to file index), `route_builders.txt` (138 route templates), `fbmod_dump.py` and `fbmod_summary.py` (module extractors) |
| S8 | **Live logged-out** home HTML plus 311 bundles, fetched by another researcher | 2026-10-21 | `refs/raw/live/home_loggedout.html`, `refs/raw/live/bundles/` |
| S9 | `CometHomeRoot.entrypoint` bundle | 2025-10-21 | `refs/raw/fbbundles/peblo13_21102025_xqgbZQq2-Ee.js` |
| S10 | Greasyfork "Old Facebook Home/Profile Page (2018)" v1.6.5 (updated 2026-08-02) and "…Beta (2013)" v1.1.5 (updated 2026-07-28), by Avolition. These rebuild an old shell on top of live Comet. | 2026-07/08 | `refs/greasyfork/gf-524987.user.js`, `gf-549966.user.js` |
| S11 | Social Fixer: hideables data (repo 2026-08-09) and userscript 31.1.1 | 2020–2025 rows | `refs/socialfixerdata/hideable.json`, `refs/greasyfork/gf-583964.user.js` |
| S12 | uBlock Origin uAssets `quick-fixes.txt` | 2026-10-21 | `refs/uAssets/filters/quick-fixes.txt` lines 109–135 |
| S13 | Sieve extension: right-rail ad CSS, live 2026-09-02 | 2026-10-13 | `refs/gh2026/codepurse_Sieve/content/facebook-ads.css` lines 84–150, `facebook-ads-dom.js` lines 415–470 |
| S14 | FB Clean My Feeds, Artificial-Sweetener fork 6.3.2 | 2026-10-05 | `refs/fcmf-artificial-sweetener/src/feeds/news.js`, `src/selectors/news.js`, `src/entry/userscript.js` |
| S15 | 4Message ADR "facebook.com/messages as default surface" | 2026-07-28 | `refs/raw/loind/surface.md` |
| S16 | "Facebook Cleaner…" (gf-545421): right-rail title keywords | 2025/2026 | `refs/greasyfork/gf-545421.user.js` lines 60–200 |
| S17 | News and docs: messenger.com retired in April 2026 ([Gulf News](https://gulfnews.com/technology/meta-to-shut-messenger-website-in-april-2026-redirect-users-to-facebook-1.500447134), [FactCrescendo 2026-03-04](https://english.factcrescendo.com/2026/03/04/meta-not-shutting-down-messenger-only-website/)); Navigation API in Firefox 147, Jan 2026 ([InfoQ 2026-05](https://infoq.com/news/2026/05/navigation-api-browser), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigation/navigate_event)); Pokes revival ([TechCrunch 2025-09-04](https://techcrunch.com/2025/09/04/facebook-is-trying-to-make-pokes-happen-again)); contacts sidebar vanishing for some desktop users ([PiunikaWeb 2026-04-24](https://piunikaweb.com/2026/04/24/facebook-friends-sidebar-gone-desktop/)) | 2025–2026 | web |
| S18 | Uses of `require('CurrentUserInitialData')` | 2025–2026 | `refs/raw/opentabs/plugins/facebook/src/facebook-api.ts` lines 18–95, `refs/raw/misc/crouton_helpers.ts` lines 70–75, `refs/raw/hopfian_fbk/src/auth/bootstrap.py` lines 101–206 and 514 |
| S19 | Third-party code that uses Polish labels: pkirklewski/bgNews (`Twój profil`, `Mechanizmy kontrolne i ustawienia konta`); MEMCIA/Tests (`Szukaj na Facebooku`, `svg[aria-label='Twój profil']`) | undated | GitHub code search |

> **Method note.** In S7, every UI string sits in the bundles as `h._(/*BTDS*/"…")`, with `\uXXXX` escapes for
> Polish characters. Each module is `__d("ModuleName",[deps],factory)`. To check any statement below, run
> `python3 -I research/out/bg-dom-chrome-artifacts/fbmod_dump.py refs/raw/peblo13_fbfiles <ModuleName>`.
> Set `MAXLEN` to raise the size limit. The same works on `refs/raw/live/bundles` (S8) for modules that also
> ship to logged-out pages.

---------------------------------------------------------------------------------------------------

## 1. The global page skeleton

### 1.1 Top-level DOM

| Fact | Evidence | Confidence |
|---|---|---|
| `<html id="facebook" class="_9dls __fb-light-mode" lang="en" dir="ltr">`. `lang` and `dir` follow the UI locale. | S8 `home_loggedout.html` | [VERIFIED-LIVE-2026] (logged-out) |
| `<body class="_6s5d _71pn system-fonts--body">`. These are legacy classes; their meaning is undocumented, so don't key on them. | S8 | [VERIFIED-LIVE-2026] |
| React root: `<div id="mount_0_0_qI">`. The 2-character suffix is random on every load, so select it with `div[id^="mount_0_0"]`. | S8; S15 ("mount_0_0_wK — the suffix is a random token on every page load") | [VERIFIED-LIVE-2026] |
| Below the root are several layers of atomic-class `div`s, then the app view stack (§7.4). The **banner** (`[role=banner]`) and the **main content wrapper** are siblings in the base view. Hush notes that the top bar's next sibling holds the whole page. | S7 `CometAppContent.react`, `CometAppViewStack.react`; S4 `hide-stories-tray.js` header comment | [CODE-2025-10] + [REF-2026] |
| Server data arrives in `<script type="application/json" data-sjs>` blocks (46 of them on S8). Config modules are defined as `["ModuleName",[],{…},id]`, for example `"CurrentUserInitialData"`, `"LSD"`, `"DTSGInitialData"`, `"SiteData"`, `"IntlCurrentLocale",[],{"code":"en_US"}`. | S8; S4 `src/core/net/hooks.js` header | [VERIFIED-LIVE-2026] |
| Hidden cross-origin iframes exist, for example `https://www.fbsbx.com/maw_proxy_page/…` for E2EE Messenger. Its body is `class="chrome webkit win x1 Locale_pl_PL"`. **Never touch iframes.** | S7 `saved_resource.html` | [CODE-2025-10] |
| Atomic classes (`x1n2onr6` and similar) are generated by StyleX. Their **meaning is stable** (`x1s85apg` always means `display:none`), but **which class a component uses changes per deploy**. Never select on them. | S15; S7 CSS | [REF-2026] |

### 1.2 Geometry and z-index

Atomic classes were resolved against S7 CSS file `Vc6JYk-….css`.

| Element | CSS | Source |
|---|---|---|
| Banner start section (logo) | `position:fixed; top:0; inset-inline-start:0; z-index:3; height:var(--header-height)` | S7 `CometBaseAppNavigation.react` (classes `xixxii4 x13vifvy x1o0tod xzkaem6 x1s65kcs`) |
| Banner end section (account controls) | `position:fixed; top:0; inset-inline-end:0; z-index:3` | same module (`xtijo5x xixxii4 x13vifvy xzkaem6`) |
| Tab bar (centre tabs) | fixed, `top:0`, `z-index:1`, wrapped in `aria-hidden` and `FocusInertRegion` while a push view is open | S7 `CometAppNavigationLayout.react` |
| `--header-height` | `56px` in the logged-in theme. The theme object is injected from JS: `"header-height":"56px"`, with a `"0px"` variant. The logged-out login-page CSS (`research/fb-*-vars.css`) has `0px`. `CometAppNavigationConstants.HEADER_HEIGHT = 56` (44 on mobile). | S7 `fIx_…` bundle; S8 `CometAppNavigationConstants` [CODE-2026] |
| Main content wrapper | `position:relative; top:var(--header-height); min-height:calc(100vh - var(--header-height))`. Scrolling is **document** scrolling (`BaseDocumentScrollView`). | S7 `CometMainContentWrapper.react` |
| Home left rail `nav[aria-label=Shortcuts]` | `position:sticky; top:var(--header-height)`; flex-basis 360px, min-width 280px, max-width 360px; **`display:none` at ≤1099px** | S7 `CometHomeLayout.react` (`x7wzq59 xxzkxad xnp8db0 x1u2d2a2 xxc7z9f x9e5oc1`) |
| Home layout container | `max-width:1464px` (`none` at ≤1920px per the media rule), `min-width:320px` | same |
| Right rail (`CometRightRailContentArea`) | width 360px by default, with 400/440/480/520 variants, **+80px** when the chat sliver shows; `role="complementary"`; background `var(--surface-background)` | S7 `CometRightRailContentArea.react` |
| Top-nav tabs | each `li` has `min-width:50px; max-width:129.6px`; **tabs are hidden at ≤700px** | S7 `CometTopNavTabRenderer.react` |
| Chat tabs root (docked chats) | `position:fixed; bottom:0; inset-inline-end:0; z-index:1`, `isolation:isolate`; tab strip `inset-inline-end:80px` leaves a column free for chat heads; hidden at ≤320px | S7 `MWV2ChatTabsRoot.react`, `MWV2ChatTabsLayout.react` |
| Modals (`BaseCometModal`) | `position:fixed`, z-index 0, 1 or 3 | S7 |

**Takeaway.** FB uses tiny z-indexes (0, 1, 3) and relies on **DOM order**. Layers and portals are appended
later in the DOM, so they paint on top.

INFERRED recommendation: give the shell's fixed chrome `z-index:0` and insert it **before**
`div[id^=mount_0_0]` in `<body>`. Every FB layer and dialog then paints above it. Because the main column is
offset by `var(--header-height)`, our header is not overlapped if we set `--header-height` to our header's
height (§9.3). Verify this live.

---------------------------------------------------------------------------------------------------

## 2. The top banner (`[role="banner"]`)

### 2.1 Structure

From S7 `CometAppLoggedInNavigation.react` and `CometBaseAppNavigation.react` [CODE-2025-10], confirmed against the
S1, S2 and S3 snapshots [VERIFIED-LIVE-2026]:

```
div[role=banner]
├─ div (fixed, start)            ← CometContextualLayerAnchorRoot
│   └─ a[aria-label="Facebook"][href="/"]   (logo, CometLoggedInFacebookLogo; on push views a Back/Close
│                                             button may replace it: "Go back"/"Close" – PL "Wróć do poprzedniej strony"/"Zamknij")
├─ searchSection                 ← label > input[type=search][role=combobox][aria-label="Search Facebook"]
├─ tabBar  div[role=navigation][aria-label="Facebook"] > ul > li …   (centre tabs)
└─ div (fixed, end)              ← CometContextualLayerAnchorRoot  ← **jewel dropdowns render in here**
    └─ div[role=navigation][aria-label="Account Controls and Settings"]   (CometAppNavigationEndSection)
        ├─ [optional] div > a[href="/friends/"] (no aria-label)  "Find friends" pivot (gk-gated)
        ├─ [role=button][aria-label="Menu" | "Facebook menu"][aria-haspopup=dialog]   (mega-menu grid)
        ├─ [role=button][aria-label="Messenger" | "Messenger, N unread"][aria-haspopup=dialog]
        │     + a zero-size duplicate [role=button][aria-label="Messenger"][tabindex="-1"] (focus helper)
        ├─ [role=button][aria-label="Notifications" | "Notifications, N unread"]
        │     + badge: span > (screen-reader text "Number of unread notifications") + span[aria-hidden]"N"
        └─ [role=button][aria-label="Your profile"] > svg[aria-label="Your profile"] > image (avatar)
```

**Caveats**

* When you act **as a Page profile** (S3, 2026-08/09), Messenger becomes **links** to
  `business.facebook.com/latest/inbox/all/?…`. The centre tabs become Home, Pages, Professional dashboard,
  Ad Center and Reels.
* The Messenger jewel is absent when `useShouldShowMessagingEntrypointInCometRoot("JEWEL")` is false (S7).
* On `/notifications` the bell is labelled plain "Notifications" with no count: `isNotifications` forces 0
  (S7 `CometNotificationsDropdownTrigger.react`, `useIsDsaNotifications`).
* The order of the end section in code is: Find-friends pivot (gk 22811), `cr:4705` (the mega-menu
  "Menu"), Messenger, `cr:1266079` (Notifications), then account settings (S7). In live snapshots it is
  Menu, Messenger, Notifications, Your profile (S1, S2).

### 2.2 Selector table (English and Polish)

| Element | English (2026 live) | Polish (S7 code, 2025-10) | Language-free fallback | Confidence |
|---|---|---|---|---|
| Banner | `[role="banner"]` | same | the first `[role=banner]` in `#mount_0_0_*` that contains a `[role=navigation]` | VERIFIED-LIVE-2026 (S1, S2, S3, S5 audit) |
| Logo | `[role=banner] a[aria-label="Facebook"][href="/"]` | `aria-label="Facebook"` (string not translated) | `[role=banner] a[href="/"]:not([role=navigation] a)` | VERIFIED-LIVE-2026 (S1, S2), S4 logo-long-press |
| Search box | `input[aria-label="Search Facebook"]` (combobox; placeholder is the same) | `"Szukaj na Facebooku"` | `[role=banner] input[type=search]`, `[role=banner] [role=combobox]` | VERIFIED-LIVE-2026 (S1, S2); S7 `SearchCometGlobalTypeahead.react`; S11 2020120702 |
| Tabs nav | `[role=banner] [role=navigation][aria-label="Facebook"]` | aria-label is likely "Facebook" too (INFERRED, the brand is untranslated) | `[role=banner] [role=navigation]:has(ul li a[href="/"])` | VERIFIED-LIVE-2026 (S1, S2); S5 audit |
| Account controls nav | `[aria-label="Account Controls and Settings"]` (en_US, S1 and S3) **or** `"Account controls and settings"` (S2, probably en_GB). Use the CSS `i` flag: `[aria-label="account controls and settings" i]` | `"Mechanizmy kontrolne i ustawienia konta"` | the `[role=navigation]` in the banner that has `[aria-haspopup]` buttons and no tab `ul` | VERIFIED-LIVE-2026 + S7 `CometAppNavigationEndSection.react` + S19 |
| Mega-menu button | `"Menu"` (S1, Apr 2026) **or** `"Facebook menu"` (S2 Apr 2026; S3 Aug/Sep 2026; S4 Oct 2026) | `"Menu"` (S7 `CometMegaMenuJewelButton.react`); in 2026 probably `"Menu Facebooka"` (INFERRED: the string exists in S7 as the left-rail heading) | the first `[role=button][aria-haspopup]` in the account nav | VERIFIED-LIVE-2026 |
| Messenger button | `"Messenger"` / `"Messenger, 1 unread"` | `"Messenger"` / `"Messenger, {badge count} nieprzeczytanych"`. For "users without Messenger access": `"Wiadomości"` / `"Wiadomości, nieprzeczytane: {badge count}"` | `[role=button][aria-haspopup=dialog]` whose `tabindex` is not -1 and whose box is larger than 0, containing the Messenger svg | S4 test fixture "as drawn live 2026-10-12"; S7 `MWJewelDropdownTrigger.react` |
| Messenger badge screen-reader text | `"1 Unread Chats"` (S4, live 2026-10-12) | `"1 nieprzeczytany czat"` / `"{num_messages} nieprzeczytanych czatów"` (S7 `LSLocalizedStringsV2`) | a numeric leaf (§2.4) | REF-2026 + CODE-2025-10 |
| Notifications button | `"Notifications"` / `"Notifications, 5 unread"` (S1), `", 24 unread"` (S2), `", 4 unread"` (S3) | `"Powiadomienia"` / `"Powiadomienia, {badge count} nieprzeczytanych"` | — | VERIFIED-LIVE-2026 + S7 `CometNotificationsDropdownTrigger.react` |
| Notification badge | screen-reader text `"Number of unread notifications"` + `"5"` (S1, S3: the badge sits in its own `button` node) | `"Liczba nieprzeczytanych powiadomień"` | — | VERIFIED-LIVE-2026 + S7 `CometNotificationsBadgeCount.react` |
| Account button | `[role=button][aria-label="Your profile"]` containing `svg[aria-label="Your profile"]`; tooltip "Account" | `"Twój profil"`; tooltip `"Konto"` | the last `[role=button]` in the account nav | VERIFIED-LIVE-2026 (S1, S2, S3) + S7 `CometSettingsDropdownTrigger(Wrapper).react` + S19 |
| Find-friends pivot | `[role=banner] [role=navigation] div:has(> a[href^="/friends/"]:not([aria-label]))` | same | — | REF-2026 (S4 `declutter-table.js`, live 2026-10-11) |

### 2.3 Centre tabs: labels, hrefs and test IDs

Source: S7 `CometLoggedInTargetedTabsList` [CODE-2025-10]. Each tab is rendered by `CometTopNavTabRenderer.react`
as `li > [div indicator, a(CometPressable)[aria-label][aria-current="page" when active]]`.
**Which tabs appear is targeted per user.** Live examples: S1 (Apr 2026, en_US) showed Home, Reels,
Marketplace, Groups, Gaming. S4's account (Oct 2026) had Home, Friends, Groups.

| tabKey | EN label | PL label | href (relative inside the banner) | Badge |
|---|---|---|---|---|
| home | Home | Strona główna | `/` | `CometHomeTabBadge`, which shows "New posts" (PL "Nowe posty") when the feed is stale. **This is not a notification count**, even though the aria-label reads "Home, 1 notification" (S1). |
| friends | Friends | Znajomi | `/friends/` | **friend-request count** (`FriendingCometFriendRequestSubscriptionHelper`; badge test ID `friends_tab_badge`) |
| watch or reel | Video, or Reels when `FBUnifiedVideoGating.enableReelsTab()` | Filmy / Rolki | `/watch/?ref=tab` or `/reel/?s=tab`. S1 (Apr 2026) had "Reels" pointing at `/watch/?ref=tab`; S3 (Sep 2026) had `/reel/?s=tab`. S5: "/watch now redirects to /reel/". | numbered |
| marketplace | Marketplace | Marketplace | `/marketplace/?ref=app_tab` | numbered |
| groups | Groups | Grupy | `/groups/` (S1); older builds used `/groups/feed/` (S6 synthetic) | badge test ID `groups-badge-count` |
| gaming | Gaming | Gry | `/gaming/play/?store_visit_source=gaming_tab` | |
| events | Events | Wydarzenia | `/events/` | |
| most_recent_feed | **Feeds** | **Kanały aktualności** | **`/?filter=all&sk=h_chr`** | |
| pages | Pages | Strony | `/pages/?category=your_pages&ref=bookmarks` | |
| pro_dash | Professional dashboard | Pulpit profesjonalny | `/professional_dashboard/?ref=tab_bar` | |
| ad_center | Ad Center | Centrum reklam | `/<userId>/ad_center/` | |
| more | More | Więcej | `/bookmarks/` (only at ≥1100px) | |

**Tab aria-label with a badge** (S7 `CometTopNavTabRenderer.react`): if `badgeCount > 0` the label is
`"{label}, {number} notification(s)"`, otherwise just `{label}`.

* EN, seen live: `"Home, 1 notification"` (S1). The plural `"Friends, 3 notifications"` is INFERRED from fbt
  plural rules.
* PL plural table:

  ```
  "_1": "{label}, 1 powiadomienie"
  "4":  "{label}, {number} powiadomienie"
  "20": "{label}, {number} powiadomienia"
  "*":  "{label}, {number} powiadomień"
  ```

* Tab badges overflow at 9, so they show "9+" (`m=9`).
* Tab screen-reader badge text (PL): `"{number} elementów"`, `"1 element"`, …

### 2.4 Reading the unread counts robustly

Facts (S7 [CODE-2025-10]; the title logic was re-confirmed in S8 [CODE-2026]):

* The notification badge value is `viewer.notifications_unseen_count`, kept fresh by a live query
  (`setupNotificationsLiveQuery`). It is **unseen, not unread**: it resets when the bell dropdown is opened.
  The EN and PL labels nevertheless say "unread" / "nieprzeczytanych".
* The Messenger badge value is `viewer.message_threads.unseen_count` **capped at 15** (j=15 in
  `useCometMetaManagerBadgeCount`).
* The **document title** is `"(" + (notif + messenger) + ") " + title`, capped at 20 so it shows "(20+)".
  There is an optional alternate `[M]` part. The app title is `"Facebook"`; other pages use
  `"<Route title> | Facebook"` (separator `" | "`). Source: `createCometRouterMetaManagerBadgedTitle`,
  `CometMetaManager.react` (`m="Facebook", n=20`), `CometRouterMetaManager`. Hush's tests confirm the shapes
  `"(3) Facebook"` and `"(99+) Pat Example | Facebook"` (S4 `tests/declutter.test.js`). Note that 99+ only
  appears in Hush's test, not in FB's own limit.
* The title also **blinks** (`useBlinkingTitleMessage`, `DocumentTitle.blink`, interval 1500 ms) for new
  messages. Never trust a single read of the title. Parse only a leading `^\((\d+)\+?\) `.
* `FDSNumberedBadge` renders `<span><SR text/><span aria-hidden="true">N or "{overflow}+"</span></span>`.
  The default overflow is 20 ("20+"); tabs use 9 ("9+"). Shapes per S4: `"3"`, `"9+"`, `"99+"`.
* Friend requests: the **Friends tab badge**, if that tab exists. Otherwise the left-rail Friends bookmark
  meta (`unread_count_string`, §3). Otherwise the right-rail "Friend requests" header card (§4). Otherwise
  unknown. Confidence: medium-low.

Recommended reader (INFERRED code, every input VERIFIED above):

```js
const COUNT_RE = /,\s*(?:[^\d,]*?)(\d+)(\+)?/;         // "Notifications, 5 unread" / "Wiadomości, nieprzeczytane: 5"
const NOTIF_RE = /^(notifications|powiadomienia)\b/i;
const MSG_RE   = /^(messenger|messages|wiadomości|chats|czaty)\b/i;
function accountNav(doc = document) {
  const b = doc.querySelector('[role="banner"]'); if (!b) return null;
  return b.querySelector('[role="navigation"][aria-label="account controls and settings" i],' +
                         '[role="navigation"][aria-label="Mechanizmy kontrolne i ustawienia konta"]')
      || [...b.querySelectorAll('[role="navigation"]')].find(n => !n.querySelector('ul a[href="/"]') &&
                                                                     n.querySelector('[aria-haspopup]'));
}
function visibleButtons(nav) {
  return [...nav.querySelectorAll('[role="button"]')].filter(el =>
    el.getAttribute('tabindex') !== '-1' && el.getBoundingClientRect().width > 0);
}
function readJewels() {
  const nav = accountNav(); if (!nav) return null;
  const out = { notifications: null, messages: null, friendRequests: null, source: {} };
  for (const btn of visibleButtons(nav)) {
    const label = (btn.getAttribute('aria-label') || '').trim();
    const m = COUNT_RE.exec(label); const n = m ? +m[1] : 0;
    if (NOTIF_RE.test(label)) { out.notifications = n; out.source.notifications = 'aria'; }
    else if (MSG_RE.test(label)) { out.messages = n; out.source.messages = 'aria'; }
  }
  // positional fallback for unknown locales: [menu?, messenger, notifications, profile] – profile is last
  // friend requests: Friends tab badge, if that tab exists
  const ft = document.querySelector('[role="banner"] [role="navigation"] a[href="/friends/"][aria-label]');
  if (ft) { const m = COUNT_RE.exec(ft.getAttribute('aria-label')); out.friendRequests = m ? +m[1] : 0; }
  // title cross-check: notif + msgs (unseen), capped at "(20+)"
  const t = /^\((\d+)(\+)?\)\s/.exec(document.title); out.titleTotal = t ? +t[1] : 0;
  return out;
}
// Keep it live: MutationObserver(banner, {subtree:true, attributes:true, attributeFilter:['aria-label'],
//                                         childList:true, characterData:true}), debounced ~150 ms (S4 does 150 ms).
```

### 2.5 Jewel dropdowns: where they render, and how to open them from our UI

* Each fixed banner section wraps its children in **`CometContextualLayerAnchorRoot`**, which renders a
  plain `document.createElement("div")` **inside the banner subtree** (S7
  `BaseContextualLayerAnchorRoot.react`). Dropdowns therefore live **inside `[role=banner]`**: the
  Notifications list, the Messenger thread list, the account menu and the mega-menu. Hush confirms this live
  on 2026-10-11 (S4 `force-dark.js` header).
  * **`display:none` or `opacity:0` on `[role=banner]` kills the dropdowns.**
  * INFERRED safe pattern (verify live):

    ```css
    [role=banner] { visibility: hidden }
    [role=banner] [role=dialog], [role=banner] [role=menu],
    [role=banner] [role=listbox], [role=banner] [role=tooltip] { visibility: visible }
    ```

    Descendants may override an inherited `visibility:hidden`. Add `pointer-events:none` on the banner and
    `pointer-events:auto` on the same layer selectors.
* Dropdown identities (S4 [REF-2026], live 2026-10-11):
  * **Account menu**: `[role=dialog][aria-label="Your profile"]`. It contains `a[href="/me/"]` (the profile
    card, with the user's display name) and a `[role=list]` of `[role=listitem]` rows, ending with Log out.
    The opener button gets `aria-expanded="true"`. The whole menu is redrawn on every open.
  * **Mega menu**: `[role=dialog]:has(a[href*="/pages/creation/"]):has(a[href*="/events/create/"])`.
  * **Notifications list**: rows are `[role=listitem]` containing `a[href*="notif_t="]` (with `notif_id=` too).
    The same structure is used on the `/notifications` page.
* **Opening one from the shell**: call `.click()` on the **visible** native button. This fires a synthetic
  click; React's root listener handles it, and `CometPressable` reacts to click and Enter.
  * Evidence that `.click()` on native Comet controls works in 2026: S10 calls
    `document.querySelector('[aria-label="Create a post"] [role="button"]').click()` and
    `[aria-label="Create story"]` `.click()` (`gf-549966.user.js` lines 929–945, 1164–1189). S4 intercepts the
    Messenger button with capture-phase pointer and click handlers.
  * The dropdown is positioned relative to the native button's rectangle. With a visibility-hidden banner it
    appears at the top right under 56px. To anchor it under our 2010 jewels instead, we could move the end
    section with CSS (`position:fixed; left:…`). INFERRED, verify.
* **Alternative with no dropdowns**: navigate to the full pages: `/notifications/`, `/messages/` (Hush's
  "Open Messenger as a full page" calls `location.assign('/messages/')`), `/friends/requests/`.

### 2.6 Search: forwarding a query

* The search route is `/search/{searchtype}/?q=<query>`. The default `searchtype` is `"top"` and the
  query parameter is `q`. Source: S7 `XCometSearchResultsControllerRouteBuilder` (`/search/{?searchtype}/{?*bqf}/`),
  `useSearchCometResultsURLBuilder` (`searchtype: … ?? "top"`), `useSearchCometResultsCommonRouteParamBuilder`
  (`q:`) [CODE-2025-10].
* Other search types seen in builders and literals: `people`, `groups`, `posts`, `pages`, `photos`,
  `videos`, `marketplace`, `events`, … The exact slugs are INFERRED except `top`.
* Hashtags use `/hashtag/{hashtag}/`.
* **Recommended**: SPA-navigate (§7.2) to ``/search/top/?q=${encodeURIComponent(q)}``.
* Driving the native combobox is not recommended. You would need the native value setter, an `input` event,
  then Enter, and it is fragile because the input is React-controlled with typeahead state.
* Keyboard: `/` focuses search (`CometDefaultKeyCommands` `search: SLASH`), but only when FB single-key
  shortcuts are enabled.

---------------------------------------------------------------------------------------------------

## 3. The left rail (`nav[aria-label="Shortcuts"]`, Home only)

### 3.1 Structure

From S7 `CometHomeLayout.react`, `CometHomeLeftRailWithBlueRanking.react` and `CometHomeRootLayout.react`
[CODE-2025-10], cross-checked with S2 [VERIFIED-LIVE-2026]:

```
[role=navigation][aria-label="Shortcuts"]          PL "Skróty"   (BaseView; sticky; hidden ≤1099px)
└─ scroll view
   ├─ h2 (screen-reader heading) "Facebook menu"    PL "Menu Facebooka"
   └─ div[data-visualcompletion=ignore-dynamic]
       ├─ identity rows (comet_classic_identity.bookmarks: YOU, plus profiles you can switch to), badge "dot"
       ├─ [professional_tools section]  (only for pro accounts; then explore gets header "Suggestions"/"Propozycje")
       ├─ explore section   (Friends, Memories, Saved, Groups, Reels/Video, Marketplace, Feeds, Dating, Events, …)
       │     initial count = 5..10 (numExploreBookmarks 10, or 8 with pro tools), then
       │     [role=button] "See more" (aria-label "See more explore items" in S2; testid bookmark_seemore_explore)
       │     PL "Zobacz więcej" / "Pokaż mniej"
       ├─ separator
       ├─ shortcuts section: header "Your shortcuts" (PL "Twoje skróty") + "Edit"/"Edit shortcuts" (PL "Edytuj (skróty)")
       │     pinned groups, pages and games: numShortcutBookmarks 5, then "See more"
       └─ footer: [role=contentinfo][aria-label="Facebook"] (Privacy · Terms · Advertising · Ad choices · Cookies · More)
```

Row markup per Hush (S4, live 2026-10-11): `li > div > div > div > a[href]` holding a 36px image (avatar or
icon sprite) and a name `span`.

**Hrefs are absolute** (`https://www.facebook.com/…`, or `https://web.facebook.com/…` when that is the page
host) and **carry a query string**. Banner tabs are relative. Hush uses this difference to tell the two navs
apart:

```css
[role="navigation"]:not([role="banner"] *):has(a[href^="https://www.facebook.com/friends/"]):has(a[href^="https://www.facebook.com/groups/"])
```

Fallbacks when the aria-label isn't English:

* Hush: the absolute-href rule above.
* webcleaner: geometry. Any `[role=navigation]` with height above 350, width between 120 and 460, and
  `left` ≤ 24 (S5 `webcleaner.user.js` line 2133).
* Social Fixer: `[role=banner] ~ * [role=navigation]:has(footer)` (S11 2020082901).

Each row's data (S7 `CometBookmarkListItemWrapper_bookmark` fragment): `bookmarked_node.id`, `name`, `url`,
`image.uri`, `section`, `tracking` (JSON with `bmid` and `bookmark_type`, for example `"type_group"`),
`is_news_feed`, and `unread_count` / `unread_count_string` / `context_sentence`, all
`(bookmark_render_location:"COMET_LEFT_NAV")`. In the DOM, the badge is the meta line (`unread_count_string`)
in "highlight" colour, preceded by a dot with screen-reader text "Unread items indicator" (PL "Wskaźnik
nieprzeczytanych pozycji").

### 3.2 Known row hrefs

The first two columns are from S4's fixture ("addresses from captures/2026-10-11"). The extra columns are
from the Social Fixer hideables (S11, 2021–2025).

| Item | Href (match by path prefix) | Source |
|---|---|---|
| **You** (first row) | `https://www.facebook.com/profile.php?id=<id>` or `https://www.facebook.com/<username>` | S4 fixture; S2 (first listitem = the user's name) |
| Meta AI | `https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.meta.ai%2F…` | S4; S11 2025041801 |
| Friends | `/friends/?ref=bookmarks` (absolute) | S4; S11 2021010401 |
| Memories | `/onthisday/?ref=bookmarks` (older form `/memories/`) | S4; S11 2021100601, 2021010423 |
| Saved | `/saved/` | S11 2021010433 |
| Groups | `/groups/?ref=bookmarks` | S4; S11 2021010402 |
| Reels / Video | `/reel/…`, `/watch/` | S11 2023010301, 2021120801 |
| Marketplace | `/marketplace/?ref=bookmark` | S4 |
| Feeds | `/?filter=all&sk=h_chr` (INFERRED: same as the Feeds tab); Social Fixer matches `a[href*='filter=all']` | S7, S11 2023081701 |
| Dating | `/dating` | S11 2023101301 |
| Events | `/events?…` | S11 2021010413 |
| Birthdays | `/events/birthdays` | S11 2024092301 |
| Messenger | `/messages/t/` | S4; S11 2021010424 |
| Pages | `/pages/?category=your_pages…` (older: `category=top`) | S11 2021011003 |
| Ads Manager | `/ad_campaign/landing.php?campaign_id=…&ref=bookmarks`, also `/adsmanager/` | S4; S11 2021010406 |
| Fundraisers | `/fundraisers/` | S11 2021010417 |
| Gaming Video / Play games | `/gaming/?ref=bookmarks`, `/gaming/play/?ref=bookmarks` | S4 |
| Messenger Kids | `/messenger_kids/?ref=bookmarks` | S4 |
| Professional dashboard | `/professional_dashboard/` | S11 2022040101 |
| Most Recent / Favorites (older) | `/?sk=h_chr`, `/?sk=favorites` | S11 2021010426, 2021010415 [OLD] |
| Your shortcuts: a group | `https://www.facebook.com/groups/<id-or-vanity>/` | S4 fixture (`/groups/615000000000042/`, `/groups/gamingclub/`) |

For **Groups (N)** in the 2010 left nav (INFERRED plan):

* List the shortcuts rows whose URL path starts with `/groups/` and whose next segment is neither empty nor
  one of `feed`, `joins`, `discover` or `create`.
* N = the count of those rows that have a non-empty badge meta, or simply the number of groups shown.
  This is a product decision.
* The shortcuts list is **partial**: 5 rows plus "See more". The full membership list lives on
  `/groups/joins/` ("Your groups") and in the Groups left rail on `/groups/feed/`
  (`GroupsCometLeftRailContainerQuery`).

### 3.3 Visibility caveats

* The left rail exists only on the **Home layout** (`CometHomeRoot`). The `CometHomeRoot.entrypoint`
  preloads `CometClassicHomeLeftRailContainerQuery` with `numShortcutBookmarks:5` and
  `numExploreBookmarks:10` (8 with pro tools) (S9).
* **`/?filter=…&sk=h_chr` renders `FeedsCometRoot`**. That root preloads only the feed query and
  `FeedsCometFilterPanelQuery`: **no Shortcuts rail, no contacts, no stories** (S7
  `FeedsCometRoot.entrypoint`). **The shell must cache left- and right-rail data captured on `/` or
  `/?sk=h_chr` and reuse it on filter routes.** (`/?sk=h_chr` without `filter` stays in `CometHomeRoot`,
  whose `getPreloadProps` reads `routeParams.sk`.)
* The rail is `display:none` at ≤1099px window width. The DOM may still exist, but don't rely on it
  (INFERRED).

---------------------------------------------------------------------------------------------------

## 4. The right rail (`[role="complementary"]`)

### 4.1 What it contains on Home

Order per S7 `CometHomeRightRail.react`, a SuspenseList of:

1. `CometRightSideHeaderCards`: Sponsored ads, birthdays, friend requests, "Your Pages and profiles". The
   order of these sub-cards is server-ranked (`viewer.side_feed`, `query_ego_units`).
2. `CometHomeContactAndGroupContainer`: Contacts, then Group chats, Community chats and Channels.

Live S2 (Apr 2026) order: **Sponsored, Birthdays, Contacts, Group chats** [VERIFIED-LIVE-2026].

**Not every `[role=complementary]` is the Home rail.**

* The photo or post "theater" viewer's comments sidebar is also `[role=complementary]` (S11 userscript
  line 5133: `'[role=complementary] [role=presentation] *', // 'theater' mode sidebar`; S7
  `CometMediaViewerRightRail.react`).
* `CometRightRailContentArea` wraps other routes in `[role=main]` + `[role=complementary]`.

Check that the route is Home and that the element is inside the base view, not inside a `[role=dialog]`.

| Block | Heading (h3) EN | PL | Item markup | Source / confidence |
|---|---|---|---|---|
| Sponsored | `Sponsored` (uBO: `div[role=complementary] h3 span[style^="-webkit-box-orient:vertical"]:has-text(/^Sponsored$/)`) | `Sponsorowane` | `a[target^="rhcad"]` (S13 saw `rhcad3` on 2026-09-02; uBO still pins `rhcad2`), `rel="nofollow noreferrer …"`, `attributionsrc^="/privacy_sandbox/comet/register/"`, href with `fbclid` and `utm_*`. Accessible name `"Advertiser <headline> <domain>"`. Next to each ad: button `"Open menu for <Advertiser> sponsored content"`. GraphQL typename `AdsSideFeedUnit`; path `data.viewer.sideFeedUnit.nodes[].new_adverts.nodes[]` | VERIFIED-LIVE-2026 (S2, S12, S13) |
| Birthdays | `Birthdays` | `Urodziny` | one link `a[href*="/events/birthdays/"]` whose text is **one of**: `"<Name>'s birthday is today."` (S2, Apr 2026), `"<Name> has a birthday today."` (S14 test), `"<Name> and <Other> have birthdays today."` / `"<Name> and N others have birthdays today."` (S13 test; S10 strips `'have birthdays today.'`). The PL sentences come from the server and are unknown. | VERIFIED-LIVE-2026 (S2) + REF-2026 |
| Friend requests | `Friend requests` (INFERRED EN; the card exists in the `CometRightSideHeaderCards_viewerSideFeed` fragment with `friend_requester`, `FriendingCometFriendRequestConfirmMutation`, `…DeleteMutation`) | ? | Confirm / Delete buttons; `a[href*="/friends/"][href*="profile_id"]` (S11 2022082358 [OLD-ish 2022]) | CODE-2025-10 + OLD |
| Your Pages and profiles | heading text unverified | ? | `PagesCometHomeAdminContainer_query` (page admins only) | CODE-2025-10 (existence only) |
| Contacts | `Contacts` (header actions: `"Search for a name or group"`, `"More options for contacts"`) | `Kontakty` (`Wyszukaj osobę lub grupę`, `Opcje`) | `ul > li > a` (MWXListCellPressable). Href `/messages/t/<userId>/`, or `/messages/e2ee/t/<threadKey>/`, or `/active/t/<id>/` under gk 23433 (S7 `MWChatContactImpl.react`). Accessible name `"<Name>, Active"` when online, else `"<Name>"` (S2). Avatar is `MWXProfilePhoto` 36px circle with `aria-label "Profile picture"` (PL "Zdjęcie profilowe"). Online shows a green `availabilityBadge` dot; active within the last hour shows a `lastActiveTimeBadge` with minutes. The first row is often the Meta AI bot: `"Meta AI profile photo Meta AIVerified account"` (S2); S11 2025062601 matches it via `image[*\|href*='/gen-ai']`. When collapsed: button "See all (N)" (PL `Zobacz wszystkie ({contact count})`). **A click opens a docked chat tab; it does not navigate.** | VERIFIED-LIVE-2026 (S2) + CODE-2025-10 |
| Group chats | `Group chats` (older builds: `Group conversations`, S16) | `Czaty grupowe` | `li > [role=button]` labelled `"Ela, Marcin and 9 others, last active 41w"`; button `"Create group chat"` (PL `Utwórz czat grupowy`) | VERIFIED-LIVE-2026 (S2) |
| Community chats / Channels | `Community chats` / `Channels` (INFERRED EN) | `Czaty społecznościowe` / `Kanały` | `"{memberCount} members"` | CODE-2025-10 |

**Availability warning.** From around April 2026, some desktop users **lost the contacts sidebar
entirely** (S17, PiunikaWeb 2026-04-24; also seen with extensions disabled and in private windows). It is not
universal. Also, `useShouldShowMessagingEntrypointOnCurrentRoute("CHAT")` gates the chat sliver (S7). **The
2010 "Chat (N online)" must degrade to hidden.**

### 4.2 Extraction recipe (INFERRED code over VERIFIED structure)

```js
function homeRightRail() {
  return [...document.querySelectorAll('[role="complementary"]')]
    .find(r => !r.closest('[role="dialog"]') && r.getBoundingClientRect().left > innerWidth / 2) || null;
}
function railSections(rail) {         // heading-anchored: h3 (or [role=heading]) per block
  return [...rail.querySelectorAll('h2,h3,[role="heading"]')].map(h => {
    let box = h; // climb until the parent holds another heading (gf-545421 / unalgorithm approach)
    while (box.parentElement && box.parentElement !== rail &&
           box.parentElement.querySelectorAll('h2,h3,[role="heading"]').length <= 1) box = box.parentElement;
    return { title: h.textContent.trim(), el: box };
  });
}
function contacts(rail) {
  return [...rail.querySelectorAll('li a[href*="/messages/"], li a[href*="/active/t/"]')].map(a => {
    const name = (a.getAttribute('aria-label') || a.textContent || '').replace(/,\s*(Active|Aktywn\S*).*$/i, '').trim();
    const img = a.querySelector('image, img');
    return { name, href: a.href, online: /,\s*(Active|Aktywn)/i.test(a.getAttribute('aria-label') || a.textContent),
             avatar: img && (img.getAttribute('xlink:href') || img.getAttribute('href') || img.src),
             isMetaAI: !!a.querySelector('image[href*="/gen-ai"], image[*|href*="/gen-ai"]') };
  });
}
```

Notes:

* The "Active" suffix lives in screen-reader text. The PL equivalents ("Aktywny", "Aktywny(a) teraz") exist
  in S7 strings, but the exact PL contact label is unverified. Prefer detecting the green-dot node (§12
  open question).
* Keep the rail rendered when harvesting it. Sections are deferred (`requireDeferredForDisplay`) and some
  use visibility observers. If you hide it, prefer `opacity:0; pointer-events:none` over `display:none`
  (INFERRED: IntersectionObserver ignores opacity).

---------------------------------------------------------------------------------------------------

## 5. The composer, the stories and reels trays, and the feed heading (Home)

### 5.1 Main column children

Live 2026-10-11, S4 `hide-stories-tray.js`: the column above the feed has four children: an empty one, the
composer block, the Stories block, and the feed.

### 5.2 Composer

* `div[role="region"][aria-label="Create a post"]` (PL `"Utwórz post"`, S7 `CometFeedInlineComposer.react`)
  [VERIFIED-LIVE-2026: S2, S5 audit "desktop matched all fourteen"].
* Inside it (S2):
  * h3 `"Create a post"`
  * link `"<Name>'s timeline"` (PL `"Oś czasu {userName}"`): the profile picture, linking to the profile
  * **button `"What's on your mind, <ShortName>?"`** (PL `"O czym myślisz, {short name}?"`; when there is no
    name, `"What's new?"`/`"Co słychać?"`; behind gk 20836 it becomes PL `"Czym się zajmujesz?"`) (S7
    `useCometFeedInlineComposerWOYMText`)
  * buttons `"Live video"`, `"Photo/video"`, `"Feeling/activity"`
* On a **group** page the button is `"Write something..."` (S1). On someone else's profile it is
  `"Write something to {short name}…"` (PL `"Napisz coś do {short name}…"`).
* **Opening the native composer.** `.click()` the `[role=button]` inside the region; S10 does exactly that
  (`gf-549966` line 1164). This opens a modal through a portal: `[role=dialog]` titled "Create post" (title
  text INFERRED). The FB keyboard shortcut `P` ("newPost", PL `"Utworzenie posta"`) works only when
  single-key shortcuts are enabled.
* Language-free fallback (S4): the composer block is the element right before the Stories block, in the
  column that holds the feed, and it has a `[role=button]`.

### 5.3 Stories tray

* `[role=region][aria-label="Stories"]` (PL `"Relacje"`) contains
  `div[data-virtualized="false"] > div > div[role=region][data-focus-target="stories_tray"]`
  (min-height 160px). **`data-focus-target="stories_tray"` is language-free.** [VERIFIED-LIVE-2026: S4,
  2026-10-11]
* S2 shows: h3 `"Stories"`, a grid `"stories tray"`, gridcells `"Create story"` (link to `/stories/create/`)
  and `"<Name>'s Story"`, and a button `"Next items"`.
* Fed by `StoriesTrayRectangularRootQuery` with `bucketsToFetch:6`. It is not loaded on Favorites-only feeds
  (S9).

### 5.4 Reels tray in the feed

The heading is "Reels" / "Reels and short videos" (S5 TRAYS list). This is an in-feed unit; see `dom-feed.md`.

### 5.5 Feed heading

* Screen-reader h3 **`"Feed posts"`** (PL `"Posty w Aktualnościach"`) sits immediately before the feed list.
* The 2026 feed list has **no `role="feed"`**. Posts carry `[aria-posinset]` (S6, 2026-10-16/19; S2).
* The content area also has a screen-reader h1 `"Home"` (S2).

---------------------------------------------------------------------------------------------------

## 6. The current user's identity

| Datum | Best source | Fallbacks | Confidence |
|---|---|---|---|
| **Numeric user ID** | Cookie **`c_user`** (readable from `document.cookie`, not HttpOnly; Social Fixer, Hush and FB's own `Cookie.get("c_user")` all read it) | `CurrentUserInitialData.USER_ID` in a data-sjs block; `require("CurrentUserInitialData").USER_ID` (page world only) | VERIFIED (S4 `main.js` line 27; S11 line 12253; S7 `CurrentUser`) |
| Acting-as-Page ID | Cookie **`i_user`**. While switched to a Page or profile, FB checks `USER_ID === (i_user ?? c_user)`. `ACCOUNT_ID` is the person's account; `USER_ID` is the acting actor. | `CurrentUserInitialData.ACCOUNT_ID` | CODE-2025-10 (S7 `CurrentUser.isLoggedInNow`) + S8 [CODE-2026] same module |
| Display name | `CurrentUserInitialData.NAME`; `SHORT_NAME` = first name | account-menu dialog `a[href="/me/"]` text (S4); left-rail first row text; composer `"What's on your mind, X?"` (short name) | VERIFIED: hopfian regex `"CurrentUserInitialData",[],{"ACCOUNT_ID":"\d+","USER_ID":"\d+","NAME":"…"` (S18 `bootstrap.py` line 516); S8 shows the full field list |
| Avatar URL | `[role=banner] [aria-label="Your profile" i] svg image` → `xlink:href`/`href` (40px) | left-rail first row `image`/`img` (36px); composer profile-pic link image | VERIFIED structure (S1/S2 `img "Your profile"`; S19 `svg[aria-label='Twój profil']`). **fbcdn URLs are signed: changing `stp=` or any size parameter breaks them** (S4 `url.js`). Larger sizes need GraphQL or the profile page. |
| Profile URL | left-rail first row `href` (absolute); `/me/` always redirects to your profile (`XCometMeControllerRouteBuilder` = `/me/`) | `/profile.php?id=<c_user>` | VERIFIED (S4 fixture, S7 route builders) |
| Locale | `document.documentElement.lang` ("pl"/"en"); `IntlCurrentLocale {"code":"pl_PL"}` in data-sjs | — | VERIFIED (S8; S14 uses `documentElement.lang`) |
| Logged-in check | `c_user` present, plus banner nav links to two or more of friends/watch/marketplace/groups/… (S6 `facebookSignedIn`), and no `input[type=password]`/`form[action*="/login"]` | — | REF-2026 |

`CurrentUserInitialData` fields, from the logged-out live page S8 (2026-10-21): `ACCOUNT_ID, USER_ID, NAME,
SHORT_NAME, IS_BUSINESS_PERSON_ACCOUNT, HAS_SECONDARY_BUSINESS_PERSON, IS_FACEBOOK_WORK_ACCOUNT,
IS_INSTAGRAM_BUSINESS_PERSON, IS_WABA_BUSINESS_PERSON, IS_MESSENGER_ONLY_USER,
IS_DEACTIVATED_ALLOWED_ON_MESSENGER, IS_MESSENGER_CALL_GUEST_USER, IS_WORK_MESSENGER_CALL_GUEST_USER,
IS_WORKROOMS_USER, APP_ID, IS_BUSINESS_DOMAIN`. When logged out, `ACCOUNT_ID` and `USER_ID` are `"0"`.

Isolated-world (MV3 content script) safe reader:

```js
function identityFromSjs() {
  for (const s of document.querySelectorAll('script[type="application/json"][data-sjs]')) {
    const t = s.textContent; const i = t.indexOf('"CurrentUserInitialData",[],');
    if (i < 0) continue;
    const m = /"CurrentUserInitialData",\[\],(\{.*?\})\s*,\s*-?\d+\]/.exec(t.slice(i, i + 4000));
    if (m) try { return JSON.parse(m[1]); } catch {}
  }
  return null;  // page world alternative: window.require?.('CurrentUserInitialData')
}
const cUser = (document.cookie.match(/(?:^|;\s*)c_user=(\d+)/) || [])[1] || null;
const iUser = (document.cookie.match(/(?:^|;\s*)i_user=(\d+)/) || [])[1] || null;
```

The trailing `,-1]` or `,<id>]` pattern is how data-sjs closes a define entry (S4 fixture shows `…},-1]`).
The regex is INFERRED from that format.

---------------------------------------------------------------------------------------------------

## 7. Routes, layouts, SPA mechanics and layers

### 7.1 Route table

Paths come from S7 `route_builders.txt` [CODE-2025-10] unless noted.

| Purpose | URL | Notes |
|---|---|---|
| Home (ranked) | `/` (also `/home.php`) | `CometHomeRoot`: left rail, right rail, stories, composer, feed `orderby TOP_STORIES`. Title `"Facebook"`. |
| Home, Most Recent | `/?sk=h_chr` | Still `CometHomeRoot` with `orderby:["MOST_RECENT"]`, `feedStyle MOST_RECENT_FEED_DEFAULT` for route feedStyle 16 (S9). webcleaner forces it with `location.replace(origin+"/?sk=h_chr")` (S5 line 1648). |
| Top Stories (explicit) | `/?sk=h_nor` | S10 sorting menu (`gf-524987` lines 133–134) |
| **Feeds (all)** | **`/?filter=all&sk=h_chr`** | The **Feeds** tab URL (S7 `CometLoggedInTargetedTabsList`). Hush offers "Everyone you follow" with `filter=all` (S4 `following-feed.js`, "documented working 2025-02, needs a check"). It renders **`FeedsCometRoot`** (filter panel, **no Home rails**). See §12. |
| Feeds filters | `/?filter=favorites&sk=h_chr`, `/?filter=friends&sk=h_chr`, `/?filter=groups&sk=h_chr`, `/?filter=pages&sk=h_chr` | Route `feedStyle` codes when `sk=h_chr` (S9 `getCometFeedVariablesForSk`): 12 → FAVORITES_FEED, 17 → MOST_RECENT_FRIENDS_FEED, 18 → MOST_RECENT_GROUPS_FEED, 19 → MOST_RECENT_PAGES_FEED, 16 → MOST_RECENT_FEED_DEFAULT, 24 → MOST_RECENT_FEED_NOTIFICATIONS. The filter-to-code mapping happens server-side; matching filter names to codes is INFERRED. `?sk=favorites` alone maps to FAVORITES_FEED. |
| Groups tab / feed / your groups | `/groups/`, `/groups/feed/`, `/groups/joins/`, `/groups/search/`, `/groups/<id>/`, `/groups/<id>/posts/<pid>/` | S6 FCMF-AS uses `/groups/feed`; S7 builders |
| Friends | `/friends/`, `/friends/requests/`, `/friends/suggestions/`, `/friends/list/`, `/friends/birthdays/` | `XCometFriendingSectionControllerRouteBuilder` = `/friends/{friending_section}/`. The section slugs are from common knowledge (INFERRED). |
| Notifications | `/notifications/` | bell count forced to 0 here |
| Messages | `/messages/`, `/messages/t/<threadOrUserId>/`, `/messages/e2ee/t/<key>/`, `/messages/requests/`, `/messages/archived/`, `/messages/filtered/`, `/messages/groups/`, `/messages/new/`, `/messages/search/` | S7 literals. **messenger.com was retired around 2026-04-15/16 and redirects to `facebook.com/messages`** (S17). S15 (2026-07-28) found `facebook.com/messages` to be the full client and still reached messenger.com, so the rollout may vary. |
| Events | `/events/`, `/events/<id>/`, `/events/birthdays/` | |
| Me / profile | `/me/` (redirects), `/profile.php?id=<id>`, `/<vanity>/`; tabs `/<vanity>/photos`, `/profile.php?id=<id>&sk=photos`, `…&sk=friends`, `…&sk=about` | `sk=` profile tabs are INFERRED from common knowledge |
| Photos (user) | `/<vanity>/photos` (INFERRED); a single photo is `/photo/?fbid=<id>&set=<set>` (S1 hrefs), opened as a push view | |
| Pokes | `/pokes/` | revived 2024–2025 (S17 TechCrunch 2025-09-04) |
| Bookmarks ("More") | `/bookmarks/` | Hush route table `bookmarks: 'menu'` |
| Memories | `/onthisday/` (left rail), `/memories/` [OLD] | |
| Saved | `/saved/` | |
| Settings | `/settings/` (many sub-pages hand off to accountscenter.facebook.com; INFERRED) | `XCometSettingsControllerRouteBuilder` |
| Help | `/help/`, `/help/<cms_id>/` | |
| Privacy | `/privacy/policy/`, `/privacy/policies/health/`, `/privacy/center/` (INFERRED) | |
| Search | `/search/top/?q=…` | §2.6 |
| Watch / Reels / Stories | `/watch/` (now redirects to `/reel/`, S5), `/reel/<id>/`, `/stories/<bucket>/<card>/`, `/stories/create/` | |
| Marketplace, Gaming | `/marketplace/`, `/gaming/play/` | |
| Logout | via the account menu (do not hard-code; it needs the `logout_hash` token, S18) | |

**Page titles** (S7/S8 `CometMetaManager` [CODE-2026]): `[(<N>)|(20+)] <breadcrumb title>`. The app title is
"Facebook"; other routes use `"<Route title> | Facebook"`. Examples from S4 tests: `"(3) Facebook"`,
`"Pat Example | Facebook"`. Specific route titles such as "Notifications | Facebook" are INFERRED.

**Route classifier.** Hush `src/core/route.js` (S4) maps the first path segment:

* `''`/`home.php` → home, `marketplace`, `groups`, `watch`, `reel`/`reels`, `stories`, `messages`,
  `notifications`, `search`, `friends`, `gaming`, `events`
* `photo`/`photo.php`/`photos` → photo, `permalink.php`/`story.php` → post, `profile.php` → profile
* `settings`, `saved`, `hashtag`, `feeds`, `bookmarks` → menu
* anything else → profile (vanity)

It flags a permalink for `/posts/<id|pfbid0…>`, `/groups/<g>/(posts|permalink)/`, `multi_permalinks` and
`view=permalink`. Reuse this table.

### 7.2 How Comet navigates, and how an extension can trigger native SPA navigation

Facts:

* `CometLink` / `BaseLink` render a real `<a href>`. Their React `onClick` (delegated at the React root
  container) calls `router.go(url)` and `preventDefault()` [CODE-2025-10].
* `buildCometHistory` [CODE-2026, S8] wraps `history.pushState/replaceState/go/back`. It registers
  **`window.addEventListener("popstate", …)`**.
* On popstate the router [CODE-2026, S8 `buildCometRouter`] does the following:
  1. If `cometRouterPopStateInterceptor` handled the event, stop. It is used for "unsaved changes" prompts
     (INFERRED).
  2. Read `history.state.key`.
  3. **If the key is null or not in its route map, call
     `router.go(location.pathname+location.search+location.hash, {navigationType:"popstate", replace:true})`.**
     That is a full SPA navigation to whatever URL is now in the address bar.
  4. Otherwise it restores the remembered route.

  `createRouteKey()` returns `"state-key-"+Date.now()`.

Ranked recipes for the shell:

1. **Click a native anchor that has the same target.** If FB already renders a link to that URL (left rail,
   tabs, profile link), call `.click()` on it. FB's own handler runs, with its prefetching and logging.
   Works from the isolated world. [REF-2026: S10 clicks native buttons; S4]
2. **pushState + synthetic popstate.** This is the universal recipe. FB reads `history.state.key`, finds
   none, and routes to `location`:

   ```js
   function spaGo(url) {
     const u = new URL(url, location.href);
     if (u.origin !== location.origin) { location.assign(u.href); return; }
     history.pushState({}, '', u.pathname + u.search + u.hash);   // state without "key"
     window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
   }
   ```

   Evidence:
   * S10 uses exactly this in 2026 (`gf-524987` lines 154–155, 257–259, 505–511; `gf-549966` lines 370–372,
     724–726, 1491–1562), for example `history.pushState({}, '', '/friends'); dispatchEvent(new PopStateEvent('popstate'))`.
   * The router code path above explains why it works.

   Cross-world notes:
   * `history.pushState` from an MV3 content script changes the shared session history.
   * `window.dispatchEvent` from the isolated world reaches page-world listeners, because DOM events are
     shared. INFERRED, but standard.
   * In Firefox, `{state:{}}` is created in the content compartment; FB reads `history.state`, not
     `event.state`.
   * The router replaces our blank state with a keyed state (`replace:true`), so Back and Forward work.
3. **Page world only, INFERRED and unverified**: `require("currentCometRouterInstance").get_THIS_IS_NOT_WHAT_YOU_WANT()`
   returns the router (S7 module; it exposes `getCurrentRouterState()`, and probably `go`).
   Don't build on it.
4. **Full navigation** (`location.assign`/`replace`): what Hush, webcleaner and FCMF do. Simple and robust,
   but it costs a full page load (§7.5).

Clicks on **our own** anchors (outside React) navigate natively, which means a full load. Intercept them
(capture phase, left button only, no modifier keys; see S4 `sameTabLink`) and call `spaGo`.

### 7.3 Detecting route changes

| Method | World | Notes | Source |
|---|---|---|---|
| Poll `location.href` every 250–500 ms | any | Simplest and robust; used by Hush in content mode, webcleaner ("history.pushState is no longer patched … works in sandboxed worlds") and FCMF-AS (500 ms plus a popstate listener) | S4 `route.js`; S5 line 105; S14 lines 279–288 |
| Wrap `history.pushState/replaceState` + `popstate` + `hashchange` | page only | Patching history in the isolated world does not see the page's calls (S4 comment). Social Fixer injects the patch into the page and re-dispatches `pushState`/`replaceState` events. | S4; S11 lines 3947–3975 |
| Navigation API: `navigation.addEventListener('currententrychange' / 'navigatesuccess')` | any (INFERRED for the isolated world) | Chrome 102+, **Firefox 147+ (Jan 2026)**, Safari 26.2 (S17) | S17 |
| `MutationObserver` on `<title>` | any | Also fires on blinking titles and badge changes, so filter them out | S4 `hide-tab-badges.js` |

Recommendation: Navigation API where present, falling back to a 300 ms href poll. On every change,
re-resolve the route and its anchors, and re-mount rail harvesters. Facebook re-renders Home after a visit
elsewhere, so marked nodes disappear (S4).

### 7.4 Layers, portals, push views and chat: what the shell must never cover or hide

| Kind | What renders there | DOM location | How to detect | Source |
|---|---|---|---|---|
| **Contextual layers** (dropdowns, menus, tooltips, hovercards, reaction pickers, post "…" menus) | Jewel dropdowns (banner end), post menus (main content), chat popovers (chat root) | A plain `div` created by the nearest `BaseContextualLayerAnchorRoot`: inside `[role=banner]`'s fixed sections, inside the main content wrapper, inside the chat-tabs root | `[role=dialog]`, `[role=menu]`, `[role=listbox]`, `[role=tooltip]` | S7 [CODE-2025-10]; S4 live 2026-10-11 |
| **Portals** (modals: composer, share, "Create post", sticker pickers, toasts) | `BasePortal` creates `<div class="__fb-light-mode|__fb-dark-mode …">` per portal, so it carries its own theme class | Target = `BasePortalTargetContext`. The default is **`document.body`** [CODE-2026, S8]. Inside the app view stack it is a dedicated container `div` appended after the base view, unless `useBodyAsPortalsContainer`. Hush saw them **at the end of `<body>`** live. | body children after `#mount_0_0_*`, `[role=dialog]` | S7/S8; S4 `force-dark.js` |
| **Push views** (route overlays: post permalink dialog `CometSinglePostDialogRoot`, photo/media viewer, some settings dialogs) | `CometPushView` → `BaseCometModal`, **`role="dialog"` with `aria-label=<route label>`**, for example `"Pat Example's post"` (S4 test). The URL changes (for example `/photo/?fbid=…`, `/<user>/posts/<id>`). | App view stack (inside the root) | URL plus `[role=dialog][aria-label]` not inside `[role=banner]` | S7 `CometAppViewStack.react`, `CometPushView.react` |
| ⚠ While **one or more opaque push views** are open | FB sets the **main content container to `display:none`** (`contentContainerHidden`, `numOpaquePushViewsOnTopBeforeHiding=1`). The tab bar becomes `aria-hidden` and inert. Routes may set `theme.forceDarkMode`, which flips the html class to dark until they close. | — | — | S7 `CometAppMainContentAreaRenderer.react`, `makeCometDarkModeStateProvider.react` |
| **Docked chat** (chat windows, chat heads, the compose head) | `MWV2ChatTabsRoot`: fixed bottom-right, z-index 1. Contains chat tabs (`MWV2ChatTab`), heads (button `"Open chat with: {participants}"` / PL `"Otwórz czat z: …"`), close `"Close chat"` (PL `"Zamknij czat"`), and the compose head **button `"New message"`** (PL `"Nowa wiadomość"`), seen at the end of S1 and S2 outside `main` | inside the root, outside `[role=main]` | `[aria-label="New message"][role=button]`, `[aria-label^="Open chat with"]` | S1/S2 [VERIFIED-LIVE-2026]; S7 |

Rules:

* **Do not reparent FB nodes.** S15 warns that it "breaks React — modals, media viewer, emoji picker,
  dropdown all mount through portals elsewhere". S10 does `detach().appendTo()` on the account nav and still
  works in 2026, so it is survivable but fragile.
* Hide FB chrome with **CSS on stable anchors** (roles and aria-labels, plus our own `data-mfga-*` marks set
  by JS), never on atomic classes. Run a self-check that counts matches: zero matches means warn, not fail
  silently (S15 advice).
* While any `[role=dialog]` outside the banner exists, or the URL is a permalink/photo/reel/stories route,
  the shell's own columns must yield: stay below in z-order and don't steal focus, Escape or scroll.

### 7.5 Full reloads: when FB forces them, and what they cost

* Comet **forces a full page load on the next SPA navigation** in three cases [CODE-2026, S8
  `cometRouterConstants`; S7 `buildCometRouter`]:
  1. After **50 SPA navigations** (`NAVIGATION_COUNT_THRESHOLD:50`, reason `"navigation_limit"`).
  2. When the page is **older than 2.5 days** (`RELOAD_RESOURCE_THRESHOLD:216e6 ms`, `"session_time_limit"`).
  3. When client consistency demands it, i.e. a new deploy (`REFRESH_ON_CLIENT_CONSISTENCY:true`).

  **The shell must be idempotent across reloads**: re-capture the GraphQL template, re-harvest rails, and
  restore scroll and state from its own storage.
* Cost of a full reload (INFERRED, not measured here): FB re-downloads the SSR HTML (≈435 KB logged-out per
  S8; logged-in is larger) plus data-sjs. JS bundles come mostly from cache. React state is lost: feed
  position, open chats and drafts. The feed refetches as `COLD_START`. Hush, webcleaner and FCMF accept this
  for redirects. S4 guards against redirect loops with a 15 s sessionStorage guard.
* `CometFeedStalenessConstants`: after 600 s hidden or stale, FB may auto-refresh the feed when you return
  to the tab (`FEED_STALE_TIMEOUT 600s`, `FEED_VISIBILITY_TIMEOUT 120s`, S9). gf-600341 ("Stop Feed
  Auto-Refresh") targets this.

### 7.6 Untrusted events

Synthetic `.click()` events have `isTrusted=false`. React ignores the flag, and menus and dialogs open
(S10). FB *may* treat untrusted events as a signal for engagement actions (like, comment, friend request).
INFERRED risk: for those, delegate to native buttons sparingly, never in bulk.

---------------------------------------------------------------------------------------------------

## 8. Dark mode, and the html and body classes FB toggles

### 8.1 The theme class lives on `<html>`

Source: S7 `CometDarkModeRootClass`; identical in S8 [CODE-2026].

```
updateDarkModeRootClass(setting):
  html.classList.toggle("__fb-dark-mode",  setting === "ENABLED")
  html.classList.toggle("__fb-light-mode", setting === "DISABLED" || setting === "UNDECLARED")
```

* Settings are `ENABLED`, `DISABLED`, `USE_SYSTEM` and `UNDECLARED`. With `USE_SYSTEM` the provider computes
  `dark = (ENABLED) || (USE_SYSTEM && prefers-color-scheme: dark)`.
* `initDarkMode` calls `updateDarkModeRootClass(q())`, where `q()` can be `"USE_SYSTEM"`. In that state
  **neither class** may be set and the server-side guess applies (INFERRED from the code, verify).
* Shell rule: `isDark = html.classList.contains('__fb-dark-mode') || (!html.classList.contains('__fb-light-mode') && matchMedia('(prefers-color-scheme: dark)').matches)`.
* A route can force dark mode (`route.theme.forceDarkMode`, used by media viewers), which adds the dark
  class and reverts it on close (S7 `makeCometDarkModeStateProvider.react`).
* There is a keyboard toggle (`toggleDarkMode`, gk 22802) that shows the toast "Dark mode is on/off"
  (PL `"Tryb ciemny jest włączony/wyłączony."`).
* **Layers carry their own theme class.** Portals and the account/notification/messenger menus are plain
  divs with `__fb-light-mode` even when `<html>` is dark (S4 live 2026-10-11). FB also nests
  `__fb-light-mode` "islands" inside dark areas on purpose (selected chips). Hush forces dark by swapping the
  class on `<html>` and on every light layer, skipping deliberate islands, and gives up after 20 swaps in 5 s
  (S4 `force-dark.js`).
* For a **light-only 2010 shell** (INFERRED recommendation): don't fight FB's class. Style the shell with its
  own palette (independent of `--fds-*` tokens), and let FB-owned layers keep FB's theme. Optionally force
  light with the Hush mechanism in reverse (swap `__fb-dark-mode` to `__fb-light-mode`).

### 8.2 Other classes and attributes FB sets

| Class or attribute | When | Source |
|---|---|---|
| `html._9t1d` | toggled when the top route has `enableFullPageAutoYOverflow` | S7/S8 `CometMetaManager.react` |
| `html._8ykn` | added when `shouldDisableAnimations()` (reduced-motion type) | S7 `maybeDisableAnimations` |
| `html._9dls` | present on load (meaning unknown) | S8 |
| `html[lang]`, `html[dir]` | locale and direction | S8 |
| `body._6s5d._71pn.system-fonts--body` (other OSes may get e.g. `segoe`; INFERRED) | static | S8 |
| Third-party marks to avoid colliding with: Hush `html[data-hfw-route]`, `[data-hfw-badge]`, `[data-hfw-composer]`; webcleaner `html.fcf-s`, `[data-fcf*]`; Social Fixer `html[sfx_url]` | — | S4, S5, S11 |

---------------------------------------------------------------------------------------------------

## 9. Recommendations for building the shell (synthesis; each item rests on the facts above)

1. **Anchor on roles, ARIA labels, hrefs and `data-focus-target`; never on atomic classes.**
   S5's 2026-10-12 audit found that `[role=banner]`, `[role=main]`, `[role=complementary]`,
   `[role=region][aria-label="Create a post"]`, `[aria-label="Shortcuts"]`, `[aria-label="Facebook"]`,
   `[aria-label="Account Controls and Settings"]`, `[aria-label="Stories"]` and `[aria-label="Reels"]` all
   matched on **desktop** (14 of 14). On the **mobile/responsive shell, 11 of 14 were dead**: phones get a
   responsive www with almost no landmarks. Detect the desktop shell via `[role=main]` and `[role=banner]`,
   and do nothing otherwise.
2. **Locale handling.** Prefer language-free signals, in this order: hrefs, `data-focus-target`, structure
   and position, the `i` flag for case. Then use an EN/PL dictionary (§10). The en_US/en_GB case difference
   ("Account Controls and Settings" vs "Account controls and settings") is real across 2026 snapshots
   (S1 vs S2).
3. **Hide FB chrome but keep its layers working.**
   * Banner: visibility-hidden, with the layer roles set back to visible (§2.5).
   * Left rail and Home right rail: `opacity:0; pointer-events:none` while harvesting, or `display:none`
     once the data is cached.
   * Stories and composer: `display:none` via `[data-focus-target="stories_tray"]` and the composer region
     (S4 uses `display:none`).
   * Always keep the chat-tabs root, portals and push views.
4. **Header height.** Override `--header-height` to the 2010 bar height (≈41px INFERRED; measure from
   `target-2010-screenshot.png`) on `:root, .__fb-light-mode, .__fb-dark-mode` with `!important`, so FB's
   main column, sticky rails and `calc(100vh - var(--header-height))` follow. This is INFERRED: the theme
   variables are injected from JS objects (S7), and a CSS `!important` custom property should win. Verify.
5. **Jewels.**
   * Counts come from aria-labels, with the badge screen-reader text and the title as cross-checks (§2.4).
   * Clicking our jewel calls `.click()` on the native button (dropdowns render in the banner), or
     SPA-navigates to the full page.
   * Remember that the counts are *unseen* counts, that Messenger caps at 15 and the title at 20, and that
     the bell shows 0 on `/notifications`.
6. **Navigation.** Use `spaGo` (pushState plus popstate) for every shell link, and a native-anchor `.click()`
   when one exists. Detect changes with the Navigation API or an href poll. Survive FB's forced reloads
   (50 navigations, 2.5 days, deploys).
7. **Identity.** `c_user` cookie, then data-sjs `CurrentUserInitialData`, then DOM (§6). Watch `i_user` for
   the Page-acting mode, where the chrome changes (S3).
8. **Filter routes have no rails.** Cache left/right-rail harvests from Home. Contacts may be missing for
   some users (April 2026).
9. **Diagnostics dump.** The shell should record, per route:
   * counts of `[role=banner]`, `[role=main]`, `[role=complementary]`, `[role=navigation]` together with
     their aria-labels
   * `[role=region]` aria-labels, `[data-focus-target]` values, and `[role=dialog]` aria-labels
   * account-nav button aria-labels, tab aria-labels and hrefs
   * left-rail hrefs (first path segment only) and right-rail h2/h3 texts
   * `html.className`, `document.title` (count-stripped), `documentElement.lang`
   * presence of `c_user` and `i_user`, and whether the `CurrentUserInitialData` keys are present

   Exclude names and content. This is how the INFERRED items get confirmed in the field.

---------------------------------------------------------------------------------------------------

## 10. EN/PL label dictionary (chrome only)

PL is verbatim from S7 `pl_fbt_strings.txt` unless marked. EN is from the 2026 snapshots S1, S2 and S3, or
from S4/S5 where noted.

| Key | EN | PL |
|---|---|---|
| tabs nav | Facebook | (brand) |
| account nav | Account Controls and Settings / Account controls and settings | Mechanizmy kontrolne i ustawienia konta |
| search | Search Facebook | Szukaj na Facebooku |
| mega menu | Menu / Facebook menu | Menu / Menu Facebooka |
| messenger | Messenger; `Messenger, {n} unread` | Messenger; `Messenger, {n} nieprzeczytanych` |
| messages (no Messenger access) | Messages; `Messages, {n} unread` (INFERRED EN) | Wiadomości; `Wiadomości, nieprzeczytane: {n}` |
| messenger badge SR | `1 Unread Chats` (S4) | `1 nieprzeczytany czat`; `{n} nieprzeczytanych czatów` |
| notifications | Notifications; `Notifications, {n} unread` | Powiadomienia; `Powiadomienia, {n} nieprzeczytanych` |
| notification badge SR | Number of unread notifications | Liczba nieprzeczytanych powiadomień |
| account button / tooltip | Your profile / Account | Twój profil / Konto |
| tab with badge | `Home, 1 notification` | `{label}, 1 powiadomienie`, `{label}, {n} powiadomienia`, `{label}, {n} powiadomień` |
| tabs | Home, Friends, Video/Reels, Marketplace, Groups, Gaming, Events, Feeds, Pages, Professional dashboard, Ad Center, More | Strona główna, Znajomi, Filmy/Rolki, Marketplace, Grupy, Gry, Wydarzenia, Kanały aktualności, Strony, Pulpit profesjonalny, Centrum reklam, Więcej |
| home tab badge | New posts | Nowe posty |
| left rail nav | Shortcuts | Skróty |
| left rail SR heading | Facebook menu | Menu Facebooka |
| shortcuts header | Your shortcuts (S10) | Twoje skróty |
| explore header (pro) | Suggestions (INFERRED EN) | Propozycje |
| see more / less | See more (aria `See more explore items`) / Show less | Zobacz więcej / Pokaż mniej |
| edit shortcuts | Edit / Edit shortcuts | Edytuj / Edytuj skróty |
| unread dot SR | Unread items indicator (INFERRED EN) | Wskaźnik nieprzeczytanych pozycji |
| right rail headings | Sponsored, Birthdays, Contacts, Group chats (older: Group conversations), Community chats, Channels | Sponsorowane, Urodziny, Kontakty, Czaty grupowe, Czaty społecznościowe, Kanały |
| contacts actions | Search for a name or group; More options for contacts; See all (N) (INFERRED EN) | Wyszukaj osobę lub grupę; Opcje; Zobacz wszystkie ({contact count}) |
| presence | `<Name>, Active` | Aktywny / Aktywny(a) teraz / `Aktywny(a) {t} temu` (exact contact label unverified) |
| create group chat | Create group chat | Utwórz czat grupowy |
| composer region | Create a post | Utwórz post |
| composer button | `What's on your mind, {short name}?` / What's new? | `O czym myślisz, {short name}?` / Co słychać? |
| profile-pic link | `{name}'s timeline` | `Oś czasu {userName}` |
| stories region | Stories; Create story; `{Name}'s Story`; Next items | Relacje; Utwórz relację (INFERRED); Następne elementy |
| feed SR heading | Feed posts | Posty w Aktualnościach |
| chat compose head | New message | Nowa wiadomość |
| chat head | `Open chat with: {participants}` (INFERRED EN from PL) | `Otwórz czat z: {chat participants}` |
| close chat | Close chat | Zamknij czat |
| profile picture | Profile picture | Zdjęcie profilowe |
| back / close (top-left in push views) | Go back / Close | Wróć do poprzedniej strony / Zamknij |
| dark mode toast | Dark mode is on/off (INFERRED EN) | Tryb ciemny jest włączony. / …wyłączony. |

---------------------------------------------------------------------------------------------------

## 11. What is VERIFIED versus INFERRED (quick audit)

**VERIFIED-LIVE-2026**

* the banner, tabs-nav and account-nav landmarks and their labels (both cases)
* the bell's `"Notifications, N unread"` label and badge text
* the `"Your profile"` button
* the `"Search Facebook"` combobox
* the Shortcuts nav, its first row (the user), its explore items and footer
* the `"Create a post"` region and the "What's on your mind" button
* the Stories region with `data-focus-target`
* the right-rail h3 blocks (Sponsored, Birthdays, Contacts, Group chats) and the contact `", Active"` label
* the "New message" button
* the `mount_0_0_XX` root and the html/body classes
* `c_user`
* the `CurrentUserInitialData` shape
* `rhcad3` ad targets
* the `"Facebook menu"` vs `"Menu"` variance

**CODE-2025-10** (logged-in bundles, a year old)

* the exact component structure and the PL strings
* tab hrefs and keys, including **`/?filter=all&sk=h_chr` = Feeds**
* dropdowns living inside the banner's layer roots
* unseen-count semantics and the caps
* left-rail sections and bookmark fields
* contact hrefs and presence badges
* `FeedsCometRoot` lacking the rails
* push views hiding main content

**CODE-2026** (live logged-out bundles, 2026-10-21)

* the history/popstate router path that makes pushState+popstate work
* the forced-reload thresholds
* the title badge format and limit 20
* the dark-mode class function
* `BasePortalTargetContext` defaulting to `document.body`
* `HEADER_HEIGHT=56`

**INFERRED (verify with the diagnostics dump)**

* the visibility-based banner hiding that keeps dropdowns
* overriding `--header-height`
* z-index 0 placement before `#mount`
* the Navigation API seeing pushState from the isolated world
* `"Friends, N notifications"` plural wording in EN
* the EN texts for "Friend requests" and "Your Pages and profiles"
* the PL contact presence label
* friend-request fallbacks
* the profile `sk=` tab slugs
* route-specific title strings
* the `USE_SYSTEM` no-class state
* the feedStyle-code-to-filter mapping
* `currentCometRouterInstance.go`

---------------------------------------------------------------------------------------------------

## 12. Open questions (need a logged-in check, ideally in pl_PL and en_US)

1. **What exactly does `/?filter=all&sk=h_chr` ("Feeds") show in 2026?** If it is chronological friends +
   groups + pages + favorites, it may already be the combined feed the headline feature wants. Then only
   ad and suggestion stripping plus the 2010 rendering are needed. Hush calls it "Everyone you follow"
   (unverified since 2025-02). Coordinate with the feed and GraphQL researchers: capture its
   `CometModernHomeFeedQuery` variables (`feedStyle`, `orderby`) and compare them with `filter=friends`.
2. Does the Polish UI in 2026 still say `"Mechanizmy kontrolne i ustawienia konta"`, `"Powiadomienia, N
   nieprzeczytanych"` and `"Messenger, N nieprzeczytanych"`, and is the mega-menu `"Menu"` or `"Menu
   Facebooka"`?
3. Is the mega-menu label `"Menu"` vs `"Facebook menu"` an A/B test or a rollout? Both appear in April 2026.
4. Does `[role=banner]{visibility:hidden}` with layer roles set back to `visible` keep the Notifications,
   Messenger and account dropdowns usable? Where does the dropdown appear when the shell's jewels are
   top-left?
5. Does overriding `--header-height` reflow FB's main column and push views correctly, with no gap or
   overlap in media viewers?
6. Friend-request count: which source is present for a typical PL user? Candidates are the Friends tab, the
   left-rail Friends meta, and the right-rail card. What is the exact text of `unread_count_string`, for
   example "3 new"?
7. What are the contact presence markers in PL (accessible-name suffix), and is the contacts list present at
   all for the target user (the April 2026 disappearance reports)?
8. Exact birthday sentences in PL, and whether the right-rail header-card order is stable.
9. Does a synthetic `PopStateEvent` dispatched from the **Firefox** content-script compartment reach FB's
   listener? It should, but verify. And does `cometRouterPopStateInterceptor` ever swallow it, for example
   when the composer has a draft?
10. Is `require('currentCometRouterInstance').get_THIS_IS_NOT_WHAT_YOU_WANT().go(url)` available, for a
    page-world userscript fast path?
11. For `USE_SYSTEM` dark-mode users: is either class present on `<html>` after hydration?
