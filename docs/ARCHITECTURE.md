# MFGA architecture

MFGA ("Make Facebook Great Again") turns the 2026 React/Comet Facebook into the 2010 Facebook:
the 2010 shell (blue bar, left nav, right column, footer), the 2010 story look, and a feed that
contains only friends, groups and pages — no ads, no "Suggested for you", no reels.

It ships as one codebase, three targets:

| Target | Output | Page-world code | Isolated-world code |
| --- | --- | --- | --- |
| Tampermonkey / Violentmonkey | `dist/mfga.user.js` | injected (see `platform/userscript`) | the userscript body |
| Chrome / Edge MV3 | `dist/chrome/` + zip | `content_scripts` `world: "MAIN"` | `content_scripts` isolated |
| Firefox MV3 (128+) | `dist/firefox/` + zip | `content_scripts` `world: "MAIN"` | `content_scripts` isolated |

## Design rules

1. **Never break Facebook.** Every feature degrades to "Facebook as it is, minus junk". Each module
   runs inside its own error boundary; a failing module logs once and switches itself off.
2. **Never move or remove React-owned nodes.** We add `data-mfga-*` attributes (React rewrites
   `className`, so classes are never added to its nodes), we add our own nodes outside React roots,
   and we hide with stylesheets.
3. **CSS first.** Hiding and restyling happen through one injected stylesheet keyed on
   `data-mfga-*` attributes and Facebook's own theme tokens. JavaScript only classifies and tags.
4. **No `innerHTML`.** All UI is built with `h()` (`src/content/ui/dom.js`); user content is always
   text nodes. Facebook data rendered by us is treated as untrusted.
5. **Stable anchors only.** ARIA roles, `aria-label`s (with a multi-language dictionary),
   `data-pagelet`, `data-ad-*`/`data-ad-rendering-role`, URL shapes, theme tokens and geometry.
   Never Facebook's atomic class names (`x1n2onr6`...).
6. **Observable degradation.** Every detector reports hit counts; the settings dialog shows a health
   panel and can export an anonymised DOM skeleton for bug reports.

## Runtime worlds

```
 page world (document_start)                 isolated world (document_start)
 ───────────────────────────                 ───────────────────────────────
 src/page/                                   src/content/
  net/hook.js      XHR + fetch hooks           settings.js     storage adapter (GM / chrome.storage / localStorage)
  net/jsonl.js     JSON-lines + Relay          theme/          token overrides + 2010 base CSS
                   incremental assembler       shell/          header, left nav, right column, footer, chat tab
  net/prune.js     drop sponsored/suggested    fb/             adapters reading Facebook's DOM
  net/templates.js capture request templates   cleaner/        feed-unit classification (junk tagging)
  net/replay.js    replay feed + mutations     skin/           native post part-tagging for the 2010 look
  relay/ops.js     doc_id map from __d         feed/           combined feed controller + 2010 story renderer
  story/normalize  raw story node → Story      dialog/         2010 pop_dialog + settings + diagnostics
  bridge.js  ◄──── CustomEvent JSON ────►      bridge.js
```

The two worlds talk over a `CustomEvent` channel on `document` whose `detail` is always a JSON
string (strings cross Firefox Xray boundaries without `cloneInto`). See `src/shared/bridge-protocol.js`.

## Feed modes on the home page

| Mode | What renders the center column | Source |
| --- | --- | --- |
| **Most Recent** (default) | MFGA's combined feed, rendered by us | friends + groups + pages + favorites Feeds-tab queries replayed and merged by time |
| **Top News** | Facebook's native feed, cleaned and re-skinned | `/` |
| Friends / Groups / Pages / Favorites (left nav) | Facebook's native filtered feed, cleaned and re-skinned | `/?filter=<x>&sk=h_chr` |

If the combined feed cannot initialise (no usable query template yet, or the request fails), the
home page falls back to Facebook's native chronological feed and the 2010 status box says why.

## Layout integration

* Our shell lives in `#mfga-shell`, a sibling of Facebook's React root inside `<body>`.
* Facebook's own top banner, left rail and right rail are hidden with the stylesheet.
* `--header-height` is overridden to the 2010 bar height, so Facebook's layout reserves exactly the
  space our bar occupies.
* On 3-column routes Facebook's `[role="main"]` is clamped to the 2010 content width and shifted
  into our grid with `position: relative; left: Δpx` (relative positioning does not create a
  containing block for fixed/sticky descendants, unlike `transform`). Δ is measured, not assumed,
  and re-measured on resize and route changes.
* Dialogs, popovers and chat windows are portalled by Facebook outside `[role="main"]` and are never
  hidden or covered.

## Error handling

`safe(name, fn)` wraps every module entry point; the first exception disables that module for the
page lifetime and is recorded in the health panel. Network editing always fails open: a payload
that cannot be parsed is passed through unmodified.
