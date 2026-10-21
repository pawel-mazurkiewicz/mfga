# MFGA — Make Facebook Great Again

**Facebook, the way it looked in 2010 — and a News Feed with only your friends, groups and pages.**
No ads. No "Suggested for you". No reels, no stories tray, no People You May Know.

MFGA is a browser extension (Chrome, Edge, Firefox) and a Tampermonkey userscript. It puts the
February-2010 Facebook back on top of today's facebook.com:

* the **2010 blue bar** with the old `facebook` wordmark, the three jewels (friend requests, messages,
  notifications) with their red counters, the search box and **Home · Profile · Account ▾**;
* the **left column** — your picture, *News Feed, Messages, Events, Photos, Friends*, *Applications,
  Games, Pages, Groups*, your groups and pages, and *Chat with Friends*;
* the **right column** — *Requests*, *Events* (today's birthdays), *Pokes*, *Connect With Friends*, and
  an MFGA box where the ads used to be, counting what was removed;
* **2010 stories** — 50px square pictures, the bold blue name followed by the post, "26 minutes ago ·
  Comment · Like", the light-blue box with "You and 3 others like this.", comments and "Write a
  comment...";
* the original icons, cut pixel-for-pixel from Facebook's own 2009 and 2012 sprite sheets;
* English and Polish, following Facebook's 2010 Polish wording (Aktualności, Najnowsze, Lubię to!…).

## The News Feed you actually wanted

Facebook 2026 has chronological feeds hidden behind URLs like
`facebook.com/?filter=friends&sk=h_chr` (also `groups`, `pages`, `favorites`) — but only one at a
time, and still with ads in between.

MFGA's **Most Recent** feed asks Facebook for all four at once, exactly the way Facebook's own page
asks for one of them, merges them by time, removes duplicates (a friend's post in a group shows up
once), and drops every ad and suggestion before anything is drawn. Each source can be switched off in
the settings. **Top News** shows Facebook's ranked feed, cleaned the same way.

Older posts load with the 2010 **Older Posts** button (or automatically, if you prefer). Open a photo
or a profile from the feed and press Back: you are where you left off, with the same stories.

The combined feed does not depend on the 2010 look: switch the 2010 layout off and Home keeps Facebook's
2026 page around MFGA's feed (and loses the right column's ads).

## Install

### Chrome / Edge / Brave

1. Download `dist/mfga-chrome.zip` from this repository and unzip it (or clone the repository).
2. Open `chrome://extensions`, switch on **Developer mode** (top right).
3. Click **Load unpacked** and pick the unzipped folder (the one with `manifest.json`, i.e. `dist/chrome`).
4. Open facebook.com. The puzzle-piece menu → MFGA (the Like-thumb icon) opens the settings.

### Firefox (128 or newer)

* For a quick try: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick
  `dist/firefox/manifest.json` (it stays until Firefox restarts).
* Permanently: install the signed build from addons.mozilla.org once published, or on Firefox
  Developer Edition / Nightly set `xpinstall.signatures.required` to `false` and install
  `dist/mfga-firefox.zip`.
* Firefox asks for permission to read facebook.com — allow it (MFGA does nothing without it).

### Tampermonkey (or Violentmonkey)

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open [`dist/mfga.user.js`](https://raw.githubusercontent.com/pawel-mazurkiewicz/mfga/main/dist/mfga.user.js)
   and click **Install**. Updates arrive automatically from the same URL.
3. Chrome 138+: in `chrome://extensions` → Tampermonkey → **Details**, switch on **Allow User Scripts**.
4. Recommended: Tampermonkey → Settings (Advanced) → *Content Script API* → **UserScripts API Dynamic**.
   With the default, Tampermonkey starts scripts a moment late and you may see 2026 Facebook flash
   before the 2010 look appears.

The extension is the most robust option: it starts before Facebook does, and it learns the exact
request format Facebook is using today by watching Facebook's own requests (see *How it works*).

## Settings

Click **Account ▾ → MFGA Settings…** in the blue bar (or the toolbar button / userscript menu):

* **News Feed** — Most Recent or Top News; which sources to merge (friends, groups, pages,
  favorites); Older Posts button or automatic loading; stories per page; comment previews; hide
  AI-generated posts; your own hidden keywords.
* **Clean-up** — what to remove from feeds Facebook draws itself (groups, search, profiles):
  sponsored posts, suggestions, People You May Know, reels, stories, group suggestions, memories,
  Meta AI.
* **Look** — the 2010 shell, the 2010 colours everywhere, the 2010 post look, fixed or scrolling
  blue bar, Lucida Grande or Tahoma, the welcome box, the chat tab, the right column, language.
* **Health** — what MFGA found and did on this page (counts only), with **Export report** for bug
  reports. The report never contains names, texts, links or ids. Here too: debug logging, whether
  MFGA may use its small page helper (it asks Facebook's own module registry for request ids and
  tokens; without it MFGA relies on what it reads and learns), and stopping on security checks.

## How it works (and why it is safe)

Facebook 2026 actively looks for ad blockers: it checks whether `JSON.parse`, `XMLHttpRequest` and
friends were modified and looks for extension code in error stack traces. **MFGA modifies nothing in
Facebook's page.** Instead it:

1. **reads** the data Facebook embeds in the page (the security tokens and the exact feed query
   Facebook preloads for you) — the same inline JSON Facebook's own scripts read;
2. **asks** Facebook's own `/api/graphql/` endpoint for the four chronological feeds, from your
   browser, with your session — one request at a time, spaced like a person scrolling, and only when
   you open the feed or press *Older Posts*;
3. **filters** the answers: anything carrying Facebook's `SponsoredData`, a sponsored category,
   a "Follow"/"Join" suggestion, a recommendation context or a non-post unit (reels rows, People You
   May Know, stories trays, promotions…) is dropped;
4. **draws** the result in 2010 style, and **hides** Facebook's own chrome and feed with a
   stylesheet. Dialogs (photos, the post composer, chat windows, menus) are Facebook's own and keep
   working.

Likes and comments you make in MFGA's feed are sent with Facebook's own like/comment requests. If MFGA
cannot do something safely (for example Facebook changed a request format), the link opens the post
on Facebook instead. Comment previews under stories are rationed (a few a minute, only for stories you
stop on), and repeated failures pause MFGA's requests for a few minutes rather than retrying.

Everything happens in your browser. MFGA talks to nobody but facebook.com and keeps no history: the
request formats the extension learns are stored as empty templates, without post ids, texts or session
ids. Settings stay in your browser's extension (or userscript manager) storage, and after you log out
nothing of your account (name, groups, contacts) is shown or kept.

If Facebook ever asks you to verify your account, MFGA stops all of its own requests (in every tab, for
6 hours, reloads included), gives the home page back to Facebook and says why at the top of it.

## Limits

* Facebook changes constantly. MFGA has several independent ways to find what it needs and falls back
  to "Facebook as it is, minus the junk" when one stops working — check the **Health** tab and export a
  report into an issue if something looks off.
* Facebook-drawn pages (profiles, groups, events, Marketplace…) keep their 2026 layout under the 2010
  header and colours; only the home page is fully 2010.
* Facebook's feed answers do not name the people who liked a post, so the 2010 line reads "8 people
  like this." rather than naming friends.
* Outside links in MFGA's feed go straight to the site, not through Facebook's `l.facebook.com`
  redirect: Facebook does not learn which links you open, but it cannot warn you about a malicious one
  at click time either. The link box shows the site's address.
* The extension always registers its page helper; with the helper switched off it stays idle.
* Lucida Grande and Tahoma are Windows/macOS fonts; on Linux the closest available font is used.
* Mobile (m.facebook.com and the apps) is not supported.

## Development

```sh
npm install          # esbuild + playwright-core (tests use the system Chromium)
npm run build        # dist/mfga.user.js, dist/chrome, dist/firefox, store zips
npm test             # unit tests (node:test)
npm run test:e2e     # browser tests against a fake facebook.com
npm run atlas        # rebuild the icon atlas from assets/sprites (needs Python + Pillow)
```

* `docs/ARCHITECTURE.md` — how the pieces fit, and the rules that keep MFGA invisible to Facebook.
* `docs/CONTRACTS.md` — every module's interface.
* `docs/research/` — what we learned about 2026 Facebook (GraphQL protocol, feed and chrome DOM,
  userscript/extension platforms) and the exact 2010 design, with sources.

## Credits

* The icons are Facebook's own, from the December 2009 and February 2012 sprite sheets; the header
  logo and jewels come from a 2010 screenshot. Facebook and its logos are trademarks of Meta
  Platforms, Inc. MFGA is an unofficial, non-commercial fan project, not affiliated with Meta.
* Ad-label translations build on zbluebugz's
  [FB - Clean my feeds](https://github.com/zbluebugz/facebook-clean-my-feeds) dictionary (MIT, per its
  userscript header).
* Research leaned on [webcleaner](https://github.com/pyxis3-ai/webcleaner),
  [uBlock Origin's filter lists](https://github.com/uBlockOrigin/uAssets), HushFacebookWeb and other
  open-source projects listed in `docs/research/`.

## License

MIT — see [LICENSE](LICENSE).
