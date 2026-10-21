> **Note (MFGA maintainers):** this dossier was researched when network hooks were still on the table. The final
> architecture patches nothing in the page (see `docs/ARCHITECTURE.md` §1 and `graphql-protocol.md` §8), so the
> hook sections (§4) are background only. The verified facts about userscript managers (§2.4–2.7), the bridge (§3),
> storage (§5), manifests (§7.3) and testing (§8) apply directly.

# MFGA platform dossier: one codebase as a userscript and as an MV3 extension

Status: research and hands-on experiments, 2026-10-21. Author: platform-engineering sub-agent.
Scope: page-world injection at document start, bridging between worlds, XHR/fetch hooking,
storage, assets and CSP, build, testing, performance and React safety.

Path abbreviations used below:

- `$REFS` = `/tmp/claude-0/-home-user-mfga/80791cd0-cb87-5148-8f51-26da76f4aa2e/scratchpad/refs`
- `$PT` = `/tmp/claude-0/-home-user-mfga/80791cd0-cb87-5148-8f51-26da76f4aa2e/scratchpad/platform-test` (experiment harness, runnable)
- `$DOCS` = `$REFS/platform-docs` (docs captured 2026-10-21 by curl; raw HTML and text kept on disk)

Labels: **VERIFIED** means I ran it here. **SOURCE** means I read it in code or docs (cited).
**INFERRED** means reasoning that was not tested.

---

## 0. Executive summary: the recommended architecture

**One core that always runs in the page's JS world.** Network hooks, the `__d` observer, the feed
engine, the renderer and the in-page settings panel live in the page world. Only the storage
adapter and a few host capabilities differ by platform.

| Platform | Page-world entry | Storage / settings | Frame guard | Status |
|---|---|---|---|---|
| **Chrome / Edge MV3 extension** (Chrome 111+; floor 120 recommended) | `content_scripts` entry with `world: "MAIN"`, `run_at: "document_start"`, `all_frames: true`, `match_about_blank: true`, `match_origin_as_fallback: true` | ISOLATED-world `bridge.js` (document_start) ↔ `chrome.storage.local` (+ `sync` for small settings) over a secret `CustomEvent` channel; options page + action popup | Chrome injects the MAIN script **synchronously into new about:blank frames**, so each frame hooks itself. Keep the insertion-sweep guard as belt and braces | **VERIFIED** in Chromium 141: runs before the first inline `<script>` 6/6 in every delivery mode tried |
| **Firefox MV3 extension** (128+) | Same manifest entry. `world: "MAIN"` landed in Firefox 128 | Same bridge. Use **string** (JSON) `detail` only: Xray rules | **Required:** Firefox does not inject `document_start` scripts into empty iframes (BCD note), so the insertion-sweep guard is the defence | SOURCE (MDN/BCD). Not runnable here (no Firefox binary) |
| **Safari** (best effort) | MV3 web extension through Xcode; `content_scripts.world` from Safari 18 (BCD) | `storage.sync` does not sync in Safari | Insertion-sweep guard | SOURCE only. Needs Xcode/App Store. Treat as phase 2 |
| **Tampermonkey 5.x** (Chrome MV3 / Firefox MV2) | Default `@sandbox raw` (state it explicitly, **never `JavaScript`**). All page patches go on `unsafeWindow` | `GM_getValue`/`GM_setValue` (synchronous) + `GM_addValueChangeListener` | Insertion-sweep guard + `contentWindow` getters | **VERIFIED** with TM 5.5.1 in Chromium 141: `unsafeWindow` is the real page window. With TM's default "Content Script API" it runs **late** (after FB-like head scripts) when the HTML arrives in one piece. With **"UserScripts API Dynamic"** it ran early 6/6 |
| **Violentmonkey 2.49** (Chrome MV3 / Firefox MV2) | `@inject-into auto` + runtime check of `GM_info.injectInto`. VM extracts FB's CSP nonce and injects in page mode | Same GM API | Same | **VERIFIED** (2.49.0 MV3): page mode works under the nonce CSP but timing is not guaranteed. It missed 1 of 6 loads in several runs |
| **Greasemonkey 4.14** (Firefox) | Not reliable: content-script sandbox (Xray), `tabs.executeScript` on `webNavigation.onCommitted` | `GM.getValue` (promise) | n/a | SOURCE. Ship a **DOM-only degraded mode** |
| **Safari "Userscripts" app** | `@inject-into page` has no GM API | `localStorage` fallback (per origin) | Insertion-sweep guard | SOURCE (README) |

The four decisions that matter most:

1. **The extension is the robust channel.** A MAIN-world content script at `document_start` is
   guaranteed to run before page scripts (Chrome docs + VERIFIED). It does not depend on CSP
   nonces, header sniffing or registration races. The userscript is a convenience channel that
   must survive late injection (§2.6).
2. **Do not inject `<script>` elements from the ISOLATED world.** In Chrome MV3 the isolated
   world's own CSP blocks them even with the correct page nonce, and blocks `blob:` too (VERIFIED
   console messages, §1). In Firefox the page CSP applies to them (MDN). The MAIN-world manifest
   entry makes this unnecessary.
3. **Hook XHR with a subclass whose getters re-edit on every read.** Gate on the URL the request
   was opened with and on `responseURL`. Use a *monotonic, separator-preserving* line transformer.
   Do not hook `JSON.parse` (canary-detected per webcleaner). Mask `Function.prototype.toString`
   with one Proxy. Guard fresh same-origin frames **at insertion time**: the `contentWindow`-getter
   guard that webcleaner ships is bypassed through `window.frames[n]` (VERIFIED, §4.4).
4. **Send our own GraphQL replays with natives captured before patching.** That is the
   `NativeXHR` reference taken at document start. Our own hook then never touches them, and FB's
   cookies are still sent because the request is same-origin from the page world (VERIFIED,
   §4.6).

---

## 1. Experiments run here (all reproducible under `$PT`)

Environment: Chromium **141.0.7390.37** (`/opt/pw-browsers/chromium-1194`),
**playwright-core 1.56.1**, pinned because revision 1194 is the browser that 1.56.1 expects
(`$PT/node_modules/playwright-core/browsers.json`). Node 22.22.0, esbuild 0.28.2.

The fixture `$PT/fixture.mjs` serves `https://www.facebook.com/` with a **copy of the live
facebook.com CSP**, fetched 2026-10-21 (`$DOCS/fb-headers-2026-10-21.txt`), using a fixed nonce:

- a nonce'd inline head script that records what the page sees first, then performs
  FB's **clean-frame trick**: it appends an about:blank iframe and reads natives through
  `window.frames[n]` and through `iframe.contentWindow`;
- a nonce'd external `rsrc.php` script;
- body scripts that issue `POST /api/graphql/` through XHR and through fetch, returning JSONL with
  one `category: "SPONSORED"` edge.

The probe extension is `$PT/ext/`: a MAIN-world `main.js`, an ISOLATED `isolated.js`, a service
worker that registers `dyn-main.js` with `chrome.scripting.registerContentScripts({world:'MAIN'})`,
and a web-accessible `icon.png`.

| # | Experiment | Result |
|---|---|---|
| E1 | MV3 extension in **headless** Chromium (full `chrome` binary, Playwright `headless: true`, `--disable-extensions-except` + `--load-extension`) | **Works.** The service worker starts and the content scripts run (`$PT/run.mjs`, `$PT/result-full-headless.json`) |
| E2 | Same with `chromium_headless_shell` | **Extensions do not load** (no service worker, no injection) (`$PT/result-shell.json`) |
| E3 | Headed under `xvfb-run` | Works (`$PT/result-headed.json`) |
| E4 | MAIN `document_start` vs the page's first inline `<script nonce>` | MAIN ran first every time: `document.scripts.length === 0`, `readyState: "loading"`, and the page saw `window.__mfgaMain` |
| E5 | Dynamic `scripting.registerContentScripts` (world MAIN, document_start, persisted) | Ran before page scripts, including on the first navigation after install |
| E6 | Order of ISOLATED vs MAIN, both document_start | MAIN ran before ISOLATED (manifest order MAIN first). Do not depend on it: the handshake in §3 works in either order |
| E7 | `eval` / `new Function` in MAIN world under FB CSP | Both throw `EvalError` (no `'unsafe-eval'`). **The bundle must contain no eval / Function constructor / string timers** |
| E8 | ISOLATED world injects inline `<script>` (no nonce / with page nonce read via `.nonce`) / `<script src=blob:>` | **All blocked.** Console: *Refused to execute inline script because it violates … "script-src 'self' 'wasm-unsafe-eval' 'inline-speculation-rules' http://localhost:* http://127.0.0.1:* chrome-extension://…"*. That is the **isolated world's** CSP, not the page's |
| E9 | `CustomEvent` bridge MAIN↔ISOLATED | String `detail` works both ways. In **Chrome**, object `detail` also arrives readable in the other world (nested arrays intact). Firefox differs (§3) |
| E10 | XHR subclass + fetch Proxy edit `/api/graphql/` | Sponsored `node` removed on both transports. fetch replacement kept `url`, `ok`, `type:"basic"`, `status`, `redirected`, content-type. `Function.prototype.toString` on `XMLHttpRequest`, `fetch` and `toString` reports `[native code]`. `fetch.name === "fetch"`, `length 1`, own keys `length,name`, no `prototype` |
| E11 | Clean-frame trick with MAIN `all_frames + match_about_blank + match_origin_as_fallback` | The MAIN script **was injected synchronously into the new about:blank frame**, including one created with `innerHTML`, before the page read `frames[n].XMLHttpRequest`. The frame's own XHR was hooked (edited response) |
| E12 | Same with `all_frames: false` (getter guard only, webcleaner-style) | `iframe.contentWindow.XMLHttpRequest` was patched, but **`window.frames[n].XMLHttpRequest` was the raw native** and its request came back **unedited** |
| E13 | Userscript simulation (`addInitScript`, `@noframes` semantics) with an insertion-time sweep over `appendChild/insertBefore/replaceChild/append/prepend/before/after/replaceWith/insertAdjacentElement/insertAdjacentHTML/setHTMLUnsafe/innerHTML/outerHTML/document.write/Range.insertNode` | `frames[n]` path closed: both frames' XHR edited. The getter-only variant leaked raw natives (negative control) (`$PT/run-us.mjs`, `$PT/userscript-sim.js`) |
| E14 | Streaming JSONL through XHR `readyState 3` with a line split across chunks, read by an offset-based incremental consumer (FB style) | Consumer parsed `1`, `(node removed)`, `2` correctly. **`responseText.length` shrank between reads** (111 → 85) once the sponsored line completed and was edited. The naive editor also **dropped a `\r`** from an edited CRLF line (`$PT/run-stream.mjs`) |
| E15 | Replay through a `NativeXHR` captured before patching | Not seen by our hook (`viaHook: false`, raw text). Request carried the page cookie (`c_user=123`) |
| E16 | Images under FB CSP | `data:` loads from both worlds. A foreign URL **loads when created from the ISOLATED world** (Chrome applies the isolated CSP to DOM APIs) but is **blocked from the MAIN world** by `img-src`. A `chrome-extension://` web-accessible image loads from ISOLATED. An inline `<style>` with `url(data:…)` applies |
| E17 | **Real Tampermonkey 5.5.1** (CRX from the Chrome update service, loaded unpacked, "Allow User Scripts" toggled on `chrome://extensions/?id=…`, probe installed through TM's own install page) | `GM_info.sandboxMode: "raw"`. `window` is TM's Proxy (stack shows `Proxy.<anonymous>`), `unsafeWindow !== window`, and **`unsafeWindow` is the real page window**: the page's XHR was replaced and edited. `GM_getValue` is synchronous and persisted. `GM_addElement('script', {textContent})` **executed synchronously under the nonce CSP** |
| E18 | TM timing, default "Content Script API = UserScripts API" | Fixture via `route.fulfill`: **0/6 before the first inline script** (ran after 2 head scripts). In 1/6 it ran after `load` and missed the XHR. Real HTTP server, whole HTML at once: 0/6 early, 6/6 XHR hooked. Real HTTP server, 120 ms gap before the first `<script>`: 6/6 early |
| E19 | TM with **"Content Script API = UserScripts API Dynamic"** (Settings → Security, visible in Config mode "Advanced") | **6/6 before the first inline script** in all three delivery modes. `GM_getValue` still synchronous |
| E20 | **Real Violentmonkey 2.49.0 MV3** | `GM_info.injectInto: "page"` (it found the nonce). Whole HTML at once: 0/6 early. Several runs **missed 1/6 loads entirely**, including the first load after install. Streamed: 6/6 early (one later run 5/6). "Synchronous page mode": no misses, still late for whole-HTML delivery. `GM_addElement` script ran under the CSP |
| E21 | esbuild prototype (`$PT/buildproto/`) with metadata banner + IIFE + `define` version + a zip writer with no dependencies (`zlib.deflateRawSync` + `zlib.crc32`) | Valid: `unzip -t` reports no errors. UTF-8 kept with `charset: 'utf8'` |

Caveats:

- Playwright's `route.fulfill` bypasses part of the webRequest/DNR machinery that
  TM and VM use. Manager-timing claims therefore come from the real local HTTP server runs
  (`$PT/run-real.mjs`, `$PT/localfb.mjs`), which reproduce FB's CSP header shape.
- The probe userscript also matches `http://127.0.0.1:*/*` for those runs.
- The real FB HTML starts with inline nonce'd scripts early in `<head>`. It therefore resembles
  the "whole HTML at once" case more than the "120 ms gap" case. **INFERRED.**

---

## 2. Running in the page world at document_start

### 2.1 facebook.com CSP (measured 2026-10-21, logged out; `$DOCS/fb-headers-2026-10-21.txt`)

```
script-src *.facebook.com *.fbcdn.net *.facebook.net 127.0.0.1:* 'nonce-<8 chars, rotates per response>' blob: 'self'
           connect.facebook.net 'wasm-unsafe-eval' https://accounts.google.com https://*.google-analytics.com *.google.com;
style-src  *.fbcdn.net data: *.facebook.com 'unsafe-inline' https://accounts.google.com https://fonts.googleapis.com;
img-src    *.fbcdn.net *.facebook.com data: https://*.fbsbx.com facebook.com … blob: … (no web.archive.org)
connect-src *.facebook.com facebook.com *.fbcdn.net *.facebook.net wss://*.facebook.com:* … blob: 'self' …
worker-src blob: *.facebook.com data:;  frame-src *.facebook.com *.fbsbx.com data: …;  block-all-mixed-content; upgrade-insecure-requests
x-frame-options: DENY;  document-policy: include-js-call-stacks-in-crash-reports;  origin-agent-cluster: ?1
cross-origin-opener-policy: same-origin-allow-popups;  no require-trusted-types-for
```

Consequences:

- No `'unsafe-inline'` and no `'unsafe-eval'` in script-src. Inline scripts need the per-response
  nonce, and eval-like code is blocked in the page world (E7).
- `blob:` **is** in script-src. A `<script src="blob:…">` created *by page-world code* is allowed.
  This is not useful for document start: an external script inserted dynamically runs
  asynchronously. It does not help from the Chrome isolated world either (E8).
- `style-src 'unsafe-inline' data:` means `<style>` elements, inline `style=""`, shadow-root
  styles and `data:` fonts or images in CSS are all fine.
- `document-policy: include-js-call-stacks-in-crash-reports` lets FB collect JS call stacks in
  crash/unresponsiveness reports. Our frames would appear as
  `chrome-extension://<id>/main.js` (extension) or `chrome-extension://<id>/userscript.html?name=…`
  (TM, E17 stack). **INFERRED** risk: FB can see that a script is present. Mitigation: never throw
  into FB call paths and keep hook bodies tiny.

### 2.2 MV3 extension: `world: "MAIN"` content scripts

- Support (BCD 8.1.6, `$REFS/bcd/package/data.json`):
  - `content_scripts.world`: Chrome/Edge **111**, Firefox **128** (desktop and Android), Safari **18**.
  - `scripting.RegisteredContentScript.world`: Chrome 102, Firefox 128, Safari 16.4.
  - `match_origin_as_fallback`: Chrome 99, Firefox 128, Safari 18.4.
- Chrome docs: *"document_start: Scripts are injected after any files from css, but before any
  other DOM is constructed or any other script is run."*
  (developer.chrome.com/docs/extensions/develop/concepts/content-scripts, fetched 2026-10-21).
  Also: *"When a content script is injected into the main world, the CSP of the page applies"*
  (same page). That means eval is blocked (E7), but the injection itself is not CSP-gated (E4).
- Firefox 128 release notes: *"Support is now provided for scripts to run in the web page execution
  environment … support for `world` in the `content_scripts` manifest key (bug 1736575)"*
  (`$DOCS/ff128.md:92`).
- MDN warning on MAIN: *"the web page can detect and interfere with the executed code"*
  (`$DOCS/mdn-manifest-json_content_scripts.md:316`).
- **Frames:**
  - Chrome injected MAIN scripts synchronously into a just-inserted about:blank frame (E11).
  - BCD for `match_about_blank` in Firefox: *"Content scripts won't be injected into empty iframes
    at 'document_start' even if you specify that value in 'run_at'."* Firefox therefore needs the
    insertion-time guard (§4.4).
- `chrome.scripting.registerContentScripts({world:'MAIN', runAt:'document_start',
  persistAcrossSessions:true})` also works (E5). It is useful only if MFGA wants a user toggle that
  removes the page script entirely. The static manifest entry is simpler and is the
  recommendation. Note: `registerContentScripts` takes files, not code strings, so settings cannot
  be baked in.
- uBO Lite (MV3) uses exactly this for scriptlets: `world: 'MAIN'`, `runAt: 'document_start'`,
  `allFrames: true`, `matchOriginAsFallback: true`
  (`$REFS/uBlock/platform/mv3/extension/js/scripting-manager.js:259-286`, commit 1e6f82b,
  2026-10-20). It ships on Chrome (min 122), Firefox (`strict_min_version 128.0`) and Safari
  (18.6) (`$REFS/uBlock/platform/mv3/{chromium,firefox,safari}/manifest.json`).

### 2.3 Why not "inject a script tag" from a normal content script

- Chrome MV3: the isolated world's CSP is
  `script-src 'self' 'wasm-unsafe-eval' 'inline-speculation-rules' chrome-extension://…/`
  (Chrome content-scripts doc). E8 shows it blocks inline (with or without the page nonce) and
  `blob:` scripts.
- MDN (`$DOCS/mdn-csp.md:149-156`): *"In Firefox … most DOM-based APIs are subjected to the CSP of
  the web page. In Chrome, many DOM APIs are covered by the extension CSP instead of the web page's
  CSP (crbug 896041)."* E16 shows the img side of the same rule.
- Conclusion: the classic MV2 trick is dead on FB in MV3. Use the MAIN-world entry.

### 2.4 Userscript managers: what actually happens

**Tampermonkey (Chrome MV3, 5.5.1, `$REFS/tm-crx/unpacked`, CRX from the Chrome update service
2026-10-21)**

- Requires the per-extension **"Allow User Scripts"** toggle (Chrome 138+) or Developer Mode
  (before 138) (TM FAQ Q209, `$DOCS/tm-faq-Q209.html`).
- Chrome userScripts docs: *"If the Allow User Scripts toggle is not enabled, browser.userScripts
  is undefined"* (developer.chrome.com/docs/extensions/reference/api/userScripts, last updated
  2026-09-11). VERIFIED: `typeof chrome.userScripts` was `undefined` before the toggle and
  `object` after it plus a reload.
- TM registers its scripts with `world:"USER_SCRIPT"` (background.js, search `world:"USER_SCRIPT"`).
  It injects `@sandbox raw` scripts **into the page** by creating a `<script>` element, setting the
  `nonce` attribute it learned from the response headers, assigning `textContent`, appending, then
  removing the nonce and the element (content.js, search `setAttribute("nonce"`). This works
  because TM's USER_SCRIPT world is allowed to create the element, unlike our ISOLATED test in E8.
  Mechanism INFERRED from code; outcome VERIFIED in E17.
- `@sandbox` (`$DOCS/tm-q-sandbox.txt`): *"raw … always needs to run in page context, the
  MAIN_WORLD. At the moment this mode is the default … If injection into the MAIN_WORLD is not
  possible (e.g. because of a CSP) the userscript will be injected into other (enabled) sandboxes"*.
  For *"JavaScript … At Firefox a special context, the USERSCRIPT_WORLD, is created which also
  bypasses existing CSPs. It however, might create new issues since now cloneInto and
  exportFunction are necessary"*. **So `@sandbox JavaScript` is wrong for MFGA on Firefox.**
  HushFacebook Web uses it (`$REFS/gh2026/SysAdminDoc_HushFacebookWeb/scripts/meta.mjs:30`). Use
  `raw` (the default) and say so explicitly.
- `@grant` (`$DOCS/tm-q-grant.txt`): *"@grant is used to whitelist GM_* and GM.* functions, the
  unsafeWindow object …"*. **`@grant unsafeWindow` must be declared** (webcleaner 8.23.0 lesson,
  `$REFS/webcleaner/README.md` changelog).
- `@run-at document-start` (`$DOCS/tm-q-run_at.txt`): *"defines the first possible moment a script
  wants to run"*. It is not a guarantee. E18 measured the default mode as late. E19 measured
  `runtime_content_mode: "userscripts-dynamic"` as early.
  - Defaults in background.js: `runtime_content_mode:"userscripts"`, `runtime_inject_mode:"default"`.
  - Other options on the same page: `sandbox_mode` (default|raw+|raw|dom) and
    `webrequest_fixCSP` (auto|remove|no).
- `GM_info.sandboxMode` is `'js'|'raw'|'dom'` (`$DOCS/tm-q-GM_info.html`). Use it to detect the
  mode at runtime.
- Firefox build: TM 5.5.0 on AMO (2026-05-08) is still MV2 (permissions include
  `webRequestBlocking`, `<all_urls>`). The AMO API was queried 2026-10-21.

**Violentmonkey (Chrome MV3 2.49.0; source `$REFS/violentmonkey` @6528001, 2026-10-19)**

- The site says *"Violentmonkey in Chrome Web Store has been updated to ManifestV3."*
  (violentmonkey.github.io, fetched 2026-10-21).
- The MV3 manifest needs Chrome **135** (`scripts/manifest-helper.js:21`, for
  `chrome.userScripts.execute`).
- `registerInjector` calls `configureWorld({csp: "script-src 'self' 'unsafe-inline' 'unsafe-eval'; …",
  messaging: true})` (`src/common/browser-scripts-api.js:19-49`).
- Strict-CSP handling (`src/background/utils/preinject-core.js:268-296`): VM parses the CSP
  header. If it has a nonce it reuses it (`NONCE_RE`, line 51); in Firefox (`ffCsp`) it can add
  its own. Otherwise it forces content mode (line 291).
- Page injection is a `<script>` with the nonce inside a closed shadow root
  (`src/injected/content/inject.js:260-300, 390-392`).
- Timing is a race the authors acknowledge: *"even in Chrome a site may be so fast that preinject
  on onHeadersReceived won't be useful"* (`preinject-core.js:157-158`). E20 matches this.
- `@inject-into` (VM docs, `$DOCS/vm-api_metadata-block.txt:132-150`): `page`, `content`, or `auto`
  (*"Try to inject into context of the web page. If blocked by CSP rules, inject as a content
  script."*). `GM_info.injectInto` reports the actual mode (`$DOCS/vm-api_gm.txt:44`).
- VM's documented "Synchronous page mode" / "Alternative page mode" are its tools for running
  before page scripts (`$DOCS/vm-api_metadata-block.txt` @run-at note). E20: sync mode removed the
  misses but was not early for whole-HTML delivery.
- Firefox: 2.49.0 on AMO (2026-09-06) is MV2.

**Greasemonkey 4.14 (2026-06-02; `$REFS/greasemonkey/gm`)**

- MV2, Firefox only.
- Injects with `chrome.tabs.executeScript` from `webNavigation.onCommitted`
  (`src/bg/execute.js:21`, `src/bg/execute.run.js:2`). The source admits *"TODO: Make
  document_start execution time work as intended."* (`src/bg/execute.js:6`).
- `unsafeWindow = window.wrappedJSObject` (`src/user-script-obj.js:345`): an Xray-unwrapped page
  window in a content-script sandbox.
- Async `GM.*` only; no `GM_addElement`.
- Firefox applies page CSP to content-script DOM inserts, so inline script injection fails on FB.
  **Verdict: support GM4 only in a DOM-only mode** (CSS restyle + DOM-based cleanup, no network
  hooks, no combined feed).
- Possible later experiment (INFERRED, untested): page hooks built with `exportFunction` and
  `cloneInto`, or a page-origin `blob:` script, since FB's script-src allows `blob:`. Both are
  asynchronous or laborious.

**Safari "Userscripts" app (quoid; `$DOCS/userscripts-readme.md:153-161`)**

- `@inject-into auto|content|page`.
- *"GM apis are only available when using content"*.
- `@run-at document-start` supported.
- A page-world script there therefore has no GM storage. webcleaner falls back to `localStorage`
  per origin (`$REFS/webcleaner/README.md`, Behaviour notes).

### 2.5 `GM_addElement('script', {textContent})` under a nonce CSP

- TM docs: *"adding script and img tags if the page limits these elements with a content security
  policy (CSP)"* (`$DOCS/tm-q-GM_addElement.txt`).
- VM docs: *"with the primary purpose of circumventing a strict Content-Security-Policy that
  forbids adding inline code or style"* (`$DOCS/vm-api_gm.txt:264-290`).
- **VERIFIED** for TM 5.5.1 and VM 2.49.0 MV3 under the FB-shaped CSP: it executed synchronously
  (E17, E20). TM sets the nonce on the element (content.js `…"script"===e.tag&&(r=xo())&&s.setAttribute("nonce",r)…`).
- MFGA does not need it in raw/page mode: the script is already in the page.
- It is only useful in a content-mode fallback, to plant a small page-world shim. Even then, the
  shim runs after page scripts that have already run, and it would need a bridge back to the
  content world.

### 2.6 What webcleaner learned (`$REFS/webcleaner/README.md`, 8.20.0 / 8.23.0 / Limits)

- 8.20.0: hooks installed on the sandbox `window` "never reached the page" under managers that
  sandbox. The fix moved hooks to `unsafeWindow` (`webcleaner.user.js:22`,
  `const PW = typeof unsafeWindow !== "undefined" && unsafeWindow ? unsafeWindow : window`).
- 8.23.0 corrected the 8.20.0 assumptions:
  - VM exposes `unsafeWindow` for any grant.
  - TM needs `@grant unsafeWindow`.
  - The iOS Userscripts app filters grants against `validGrants`, which contains neither
    `unsafeWindow` nor legacy `GM_*`.
- Also from 8.23.0:
  - `history.pushState` is no longer patched. SPA navigation is found by polling `location.href`
    (`webcleaner.user.js:367-375`).
  - DOM work waits for `<html>` with `onRoot` (`:300-308`), since some managers run before the
    root exists.
- "Limits": *"Tampermonkey's `JavaScript` sandbox on Firefox, and Violentmonkey's content mode
  after a CSP fallback, hand the script a wrapped page window whose objects can only be modified
  with `exportFunction`/`cloneInto` … There the … payload hooks … do not reach the page"*.
- Not stated by webcleaner, but E18 and E20 show that page-world userscripts can be **late**. FB's
  GraphQL feed requests happen after the bootloader loads modules, so late XHR hooks still catch
  them. That is consistent with webcleaner's live success. **INFERRED.** Early `__d` definitions
  and early frame grabs can still be missed.

### 2.7 Recommendation per platform, with fallbacks

**Extension (Chrome/Edge/Firefox):** static manifest entries (see §7.3):

1. `page.js`: MAIN, `document_start`, `all_frames`, `match_about_blank`, `match_origin_as_fallback`.
   In sub-frames it installs the network hooks only, then returns.
2. `bridge.js`: ISOLATED, `document_start`, top frame only.

No `scripting`, `userScripts` or `webRequest` permission is needed. Fallback: none required. If a
user revokes host access on Firefox, the options page detects it with `permissions.contains` and
asks again.

**Userscript:** one bundle, metadata in §7.2. Startup logic:

```js
const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;      // page window in raw/page mode
const info = typeof GM_info !== 'undefined' ? GM_info : null;
const contentOnly = info?.injectInto === 'content' || info?.sandboxMode === 'dom'
  || (typeof W.wrappedJSObject === 'object' && W.wrappedJSObject !== W);       // Firefox Xray (TM JavaScript sandbox, VM content, GM4)
const late = document.readyState !== 'loading' || document.scripts.length > 0
  || typeof W.requireLazy === 'function' || typeof W.__d === 'function';      // FB head script already ran
```

- `contentOnly`: run the DOM-only feature set and show "network features unavailable in this
  manager mode" in diagnostics.
- `late`:
  - still install XHR/fetch hooks;
  - wrap `__d` immediately if it exists (later module definitions still pass through);
  - run a frame sweep over existing `window.frames`;
  - record `late=true` in diagnostics;
  - in the install docs, recommend TM "Content Script API: UserScripts API Dynamic" or the
    extension.

Never call `requireLazy` for FB modules early. HushFacebook Web found that this left Feeds stuck
on the splash screen, 2026-10-11 live (`$REFS/gh2026/SysAdminDoc_HushFacebookWeb/src/core/modules.js:37-45`).

---

## 3. Bridging the page world and the isolated world

**Extension.** The MAIN script has no `chrome.*` APIs. The ISOLATED `bridge.js` owns
`chrome.storage` and runtime messaging.

- **Transport:** `CustomEvent` dispatched on `document`. Use synchronous dispatch and two event
  names derived from a per-page secret: `${secret}:down` (isolated→page) and `${secret}:up`.
  `window.postMessage` is asynchronous and every page `message` listener sees it; FB has many.
  Avoid it.
- **Secret handshake that the page cannot observe** (VERIFIED E4/E6/E9, `$PT/ext/main.js`,
  `$PT/ext/isolated.js`). Both scripts run at `document_start`, before any page script.
  1. Whichever runs first writes `data-mfga-ch="<crypto.randomUUID()>"` on `<html>`.
  2. The second reads it and **removes it immediately**. In E4, `chAttrLeft` was `null`.
  3. No page script exists yet that could read it.
  The order between the two worlds did not matter.
- **Capture natives first** in MAIN: `EventTarget.prototype.dispatchEvent`,
  `addEventListener` and `CustomEvent`. HushFacebook Web does `dispatch.call(doc, new Custom(type,
  {detail}))` (`src/core/bridge.js:75`). This matters for the userscript-late case, and against FB
  patching EventTarget.
- **Payloads:** JSON **strings**. Chrome passed object details across worlds readably (E9).
  Firefox does not: an object created in a content script is not readable by the page unless
  cloned with `cloneInto(obj, window)`, and page objects are seen through Xrays
  (`$DOCS/mdn-sharing_objects_with_page_scripts.md:35-91, 154-213`; note *"In Firefox 148 and
  earlier, `window.structuredClone(value)` creates values in the scope of the caller"*). Strings
  are portable.
- **Treat every bridge message as untrusted.**
  - MAIN shares FB's world. A late or compromised page could find the channel, for example by
    hooking `CustomEvent` before a late userscript.
  - Validate the schema, cap sizes and rate-limit.
  - Expose only `getSettings`, `setSetting(key,value)` with schema checks, `openOptions` and
    `log`. Never a generic "fetch any URL" or "eval".
  - HushFacebook Web's bridge does exactly this, with explicit byte, pending and request caps
    (`src/core/bridge.js:38-45`; header comment `extension/isolated.js:1-5`).
- **Settings latency:** MAIN must start before `chrome.storage` answers. HFW states the extension
  storage "fills a few milliseconds in" (`src/core/storage.js:3-6`).
  - Install hooks unconditionally, with embedded defaults.
  - Decide edits at **read time** (`responseText` getter). That is always after a network round
    trip, so settings have arrived by then.
  - Expose `settings.ready` for the UI.

**Userscript.** There is no second world. In TM raw mode and VM page mode, `GM_getValue`,
`GM_setValue` and `GM_addValueChangeListener` are callable directly from the script closure. TM
proxies them to its extension context internally, and `GM_getValue` is synchronous: VERIFIED
returning the stored value in E17/E19. The core reads settings through one interface; only the
adapter differs:

```js
// core/settings-port.js (shape)
export const createSettings = (adapter, defaults) => ({ get(k){…sync from cache…}, set(k,v){…}, onChange(fn){…}, ready: adapter.ready });
// adapters: gm-sync (GM_*), gm-async (GM.* → hydrate then cache), bridge (extension), localStorage (Safari page mode)
```

Do not expose anything on `window`. webcleaner removed `window.__wcAdPruned` because a uniquely
named global identifies the script (README 8.22.0).

---

## 4. Hooking XHR and fetch robustly and quietly

### 4.1 webcleaner 8.23.0, precisely (`$REFS/webcleaner/webcleaner.user.js`, commit ab55c06, 2026-10-12)

**`NATIVE` and `asNative`** (`:385-394`)

- A `WeakMap` maps each patched function to its native.
- `asNative(native, apply)` returns `new Proxy(native, {apply})` and registers it.
- A Proxy over a native keeps `name`, `length` and the absence of `prototype` (README 8.22.0
  "Other changes").

**`absUrl`** (`:395-401`)

- `new URL(String(u), location.href).href`, because FB and YouTube use relative URLs. The 8.22.0
  first cut gated on `/^https?:/` and did nothing.

**`textEditor(pre, edit, jsonl)`** (`:402-412`)

- Returns `t => …`. If `t` is not a string, or the cheap regex `pre` does not match, it returns `t`
  unchanged.
- Otherwise JSONL is handled with `t.split("\n").map(one).join("\n")`, where
  `one = JSON.parse → edit(o) → JSON.stringify` if the edit changed something. Parse errors are
  passed through.
- Note: splitting on `\n` only and re-stringifying can drop a trailing `\r` (E14).

**`hookResponses(win, gate, rewrite)`** (`:415-476`)

- *fetch:*
  - `win.fetch = asNative(win.fetch, …)`.
  - After the native resolves, it reads `res.url`, the URL the network actually served, so FB or
    YouTube canaries with spoofed `Request.url` pass through.
  - If the gate matches, `reissue`:
    1. `res.clone().text()`, then `rewrite`;
    2. if changed, `new win.Response(out, {status, statusText, headers})`;
    3. `Object.defineProperty` for `url`, `ok`, `redirected`, `type`.
  - (`:417-440`)
- *XHR:* `class XMLHttpRequest extends Native` (`:459-471`):
  - `open(...args)` records `seen.set(this, {len:-1, out:""})` if `hit(args[1])`, otherwise
    `seen.delete(this)`.
  - The `response` and `responseText` getters call `edited(self, super.x)`.
  - `edited` (`:445-458`) uses `responseURL` only as a **veto** (`if (real && !hit(real)) return v`).
    It re-runs `rewrite` only when the raw length changed (`st.len !== v.length`) and otherwise
    returns the cached output.
  - The getters sit on a **subclass** because FB *"restores the base prototype's native accessors
    from a clean frame after the page loads"* (comment `:439-441`).
  - `NATIVE.set(XMLHttpRequest, Native)` plus `open`/`response`/`responseText` mappings for
    `toString` (`:472-474`), then `win.XMLHttpRequest = XMLHttpRequest` (`:475`).

**`maskNatives(win)`** (`:478-485`)

- Replaces `Function.prototype.toString` with one Proxy that calls the native `toString` on
  `NATIVE.get(self) || self`.

**`guardFrames(win, copyInto)`** (`:487-511`)

- Redefines the `HTMLIFrameElement.prototype.contentWindow` and `contentDocument` getters and the
  `HTMLObjectElement.prototype.contentWindow` getter with `asNative` wrappers.
- On each access, if the frame is same-origin (`cw.location.href` readable), it calls `copyInto(cw)`.
- **Gap:** `window.frames[n]` / `window[n]` reach the frame without these getters (E12).

**FB wiring** (`:1675-1717`)

- `edit` drops a feed edge's `node` when `category === "SPONSORED"`.
- It deletes any `node` with a direct child whose `__typename === "SponsoredData"` (the key on the
  live node is `th_dat_spo`).
- It splices `nodes[]` entries that are sponsored or have `sponsored_data`. Depth is capped at 40.
- Pre-filter: `/"(SPONSORED|SponsoredData|sponsored_data)"/`.
- Gate: `/^https?:\/\/[^/]+\/api\/graphql\b/`. JSONL mode.
- `copyInto` copies `fetch`, `XMLHttpRequest` and `Function.prototype.toString` (not `JSON.parse`).
- The comment explains `JSON.parse` is deliberately not hooked: FB parses a canary
  `{"data":{"node":{"s":{"__typename":"SponsoredData"}}}…}` inside a throwaway frame and falls back
  to its own JSON5 parser if the canary comes back edited (`:1676-1680`; README 8.23.0).

### 4.2 uBlock Origin scriptlets (`$REFS/uBlock`, commit 1e6f82b, 2026-10-20)

**`jsonlEditFn(jsonp, text, jsonExtract)`** (`src/js/resources/json-edit.js:1365-1398`)

- `lineSeparator = /\r?\n/.exec(text)?.[0] || '\n'`, then `text.split('\n')`.
- Each line is matched with `jsonExtract` (default `/^(.*)$/`), parsed with the *saved* native
  `safe.JSON_parse`, and passed to `jsonp.apply(obj)` (uBO JSONPath). A changed line is
  re-stringified with `safe.JSON_stringify`; the result is joined with `lineSeparator`.
- Code-reading inference:
  - `.` does not match `\r`, so CRLF lines never match the default extractor and stay unedited.
  - The join would then double the `\r`.
  - Since the filters work on FB in 2026, **FB's `/api/graphql/` JSONL is `\n`-separated**.
    **INFERRED.**

**`jsonlEditXhrResponseFn`** (`:1408-1468`)

- `self.XMLHttpRequest = class extends self.XMLHttpRequest`.
- `open(method,url)` stores `{method,url}` in a WeakMap when `propsToMatch` matches. FB filters use
  `propsToMatch, /graphql`.
- The `response` getter caches by `lastResponseLength` and re-runs `jsonlEditFn` when the length
  changes. `responseText` returns `this.response` when it is a string.
- The same structure as webcleaner, so this is the reference design.
- There is no `toString` masking in this scriptlet itself.

**`jsonlEditFetchResponseFn`** (`:1539-1599`)

- `proxyApplyFn('fetch', …)`, then `responseBefore.clone().text()`, `jsonlEditFn`, a new
  `Response(textAfter, {status, statusText, headers})`, and `defineProperties` for
  `ok/redirected/type/url`. Errors fall back to the original response.

**`proxyApplyFn` / `proxyToStringFn`** (`src/js/resources/proxy-apply.js:27-51, 53-147`)

- One global Proxy on `Function.prototype.toString` resolves through a WeakMap chain of
  proxied→native. It is installed once and reused by every patched function.
- Apply and construct contexts are pooled objects.

**`trustedPreventDomBypass(methodPath, targetProp)`** (`src/js/resources/scriptlets.js:1951-2031`)

- `proxyApplyFn(methodPath, …)` wraps an insertion method. After the real call (`context.reflect()`)
  it loops over the HTMLElement arguments.
- If `elem.contentWindow` is `[object Window]` and its `location.href` is `about:blank` (or equals
  the parent URL), it either copies `it[prop] = self[prop]` along the dotted `targetProp`, or, with
  no target, defines `elem.contentWindow = self`.
- Root issue cited: crbug 40202434.
- Quirk: `elems` is a `Set`, so `elems.length === 0` is never true. Harmless.

**FB filters in use** (`$REFS/uAssets/filters/quick-fixes.txt:109-158`, commit 5b924ee, 2026-10-21)

- `jsonl-edit-xhr-response` with `.data[?.category=="SPONSORED"].node`,
  `..node[?.*.__typename=="SponsoredData"]` and
  `.data.viewer.news_feed.edges.*[?.category=="SPONSORED"].node`.
- `json-edit` (a `JSON.parse` hook) with `..node[?.*.__typename=="SponsoredData"]` and
  `..nodes.*[?.sponsored_data]`.
- `trusted-prevent-dom-bypass` over `Node.prototype.appendChild`, `insertBefore`, and
  `Element.prototype.insertAdjacentElement/append/prepend/before/after`, for targets `JSON.parse`,
  `Function.prototype.toString`, `Object.getOwnPropertyDescriptor` and `XMLHttpRequest.prototype`.
  Assigning `XMLHttpRequest.prototype` on a native constructor is non-writable and likely a no-op.
  **INFERRED.**
- **A network `replace=` filter rewrites FB's own JS bundles** (`quick-fixes.txt:157-158`,
  issue 3367 comment 4635090748):
  `||static.xx.fbcdn.net/rsrc.php/$script,…,replace=/return r instanceof ArrayBuffer/return r.constructor.name==="ArrayBuffer"/`.
  **INFERRED** reading:
  - once natives are shared across realms (the copies made by `trusted-prevent-dom-bypass`), FB
    code receives `ArrayBuffer`s from the *other* realm;
  - its `instanceof ArrayBuffer` checks then fail;
  - uBO patches FB's source to compensate, which a userscript cannot do.
  This is a concrete cost of the "copy parent natives into the frame" technique (§4.4).
- Suggested posts: `annoyances-others.txt:677` uses `trusted-replace-xhr-response` with a regex
  that removes edges containing `"follow_button":{"__typename":"CometFeedStoryFollowButtonStrategy"`.
- uBO *does* hook `JSON.parse` on FB (`json-edit`), and protects that hook in frames. webcleaner
  measured that a parse hook is canary-detected and bypassed. MFGA should follow webcleaner: no
  `JSON.parse` hook.

### 4.3 HushFacebook Web 0.0.4 (`$REFS/gh2026/SysAdminDoc_HushFacebookWeb`, c38ef54, 2026-10-18)

- **XHR:** patches the base prototype's methods. It puts `responseText` and `response` accessors
  **on each instance** through `xhrOverrides()` (`src/core/net/hooks.js:852-889`). These survive a
  prototype restore but can be seen with `Object.getOwnPropertyDescriptor(xhr,'responseText')`.
- **Monotonic text:** `attachTextTransform` (`:944-981`) appends the transformed text of *complete
  lines only* (`stream.push(raw.slice(seen))`) and flushes at `readyState 4`. The text "only ever
  grows". A re-entrancy guard avoids loops with other XHR hookers.
- **Module observation:** `__d` becomes an accessor on `window`. The stub `__d` from the head inline
  script is wrapped. When FB later assigns the real loader (*"swaps its loader in with a plain
  assignment (live 2026-10-11)"*) the setter wraps that too. Each factory is wrapped to hand its
  `module.exports` to watchers after it runs (`src/core/modules.js:34-146`). If `__d` is not there
  yet, a MutationObserver on `document` retries. *"A mutation callback runs before the parser gets
  to the next script."* (`:71-74`).
- No clean-frame guard was found in HFW (grep for `about:blank`/`contentWindow`: none).

### 4.4 Frame guard: what to build (from E11–E13)

- **Extension:** MAIN entry with `all_frames:true, match_about_blank:true,
  match_origin_as_fallback:true`. Chrome hooks each new about:blank frame itself, synchronously
  (E11). In sub-frames, `page.js` installs network hooks plus the toString mask and returns.
- **Userscript and Firefox:** an insertion-time sweep, plus the getters, plus a one-off sweep at
  start. Skeleton (VERIFIED E13 in Chromium):

```js
function guardFrames(W, copyInto) {
  const done = new WeakSet();
  const patch = (w) => { try { if (!w || w === W || done.has(w)) return; void w.location.href; copyInto(w); done.add(w); } catch {} };
  const sweep = () => { for (let i = 0; i < W.frames.length; i++) patch(W.frames[i]); };   // catches frames[n] reachability
  const after = (proto, name, kind = 'value') => {
    const d = Object.getOwnPropertyDescriptor(proto, name); if (!d || !d[kind]) return;
    const p = new Proxy(d[kind], { apply(t, self, a) { const r = Reflect.apply(t, self, a); sweep(); return r; } });
    NATIVE.set(p, d[kind]); Object.defineProperty(proto, name, { ...d, [kind]: p });
  };
  for (const n of ['appendChild','insertBefore','replaceChild']) after(W.Node.prototype, n);
  for (const n of ['append','prepend','before','after','replaceWith','insertAdjacentElement','insertAdjacentHTML','setHTMLUnsafe']) after(W.Element.prototype, n);
  for (const n of ['innerHTML','outerHTML']) after(W.Element.prototype, n, 'set');
  for (const n of ['write','writeln']) after(W.Document.prototype, n);
  after(W.Range.prototype, 'insertNode');
  // plus contentWindow/contentDocument getters on HTMLIFrameElement/HTMLFrameElement/HTMLObjectElement (webcleaner :487-511)
  sweep();
}
// copyInto(w): w.XMLHttpRequest = W.XMLHttpRequest; w.fetch = W.fetch; w.Function.prototype.toString = W.Function.prototype.toString;
```

- `sweep()` costs O(number of frames) per insertion. FB pages have few frames, so this is cheap.
  Insertions in a large React commit each trigger it.
- Possible optimisation (**INFERRED**): `W.frames.length` changes only when a frame is inserted.
  Cache it and sweep only when it grows.
- Copy only what we patched. Do not copy `JSON.parse` (we do not hook it).
- **Cross-realm hazard of copying.** A parent-realm `XMLHttpRequest` placed in a frame produces
  parent-realm objects, so `x instanceof frame.ArrayBuffer` and similar checks in FB code fail.
  uBO had to patch FB's bundle for exactly this (§4.2, `replace=` filter).
  - In the **extension**, Chrome self-hooks each frame *in its own realm* (E11). The copy guard
    must therefore **not overwrite a frame that already hooked itself**.
  - Cheap test: `Object.getPrototypeOf(w.XMLHttpRequest) === w.XMLHttpRequestEventTarget` is true
    only for an unpatched native. A subclass's `[[Prototype]]` is the native `XMLHttpRequest`. Copy
    only when it is true.
  - My probe's getter guard did overwrite the self-hooked frame (E11 `viaContentWindowXHRSame:
    true`). That is harmless in the probe, wrong for production.
  - In the **userscript** and on **Firefox**, copying is the only option. Keep it, monitor
    `pageerror` in diagnostics, and limit the copied set to `XMLHttpRequest`, `fetch` and
    `Function.prototype.toString`. webcleaner reported no page errors live with exactly this set
    (README 8.23.0 "Verification").

### 4.5 Recommended hook design for MFGA

**XHR subclass.** Same as uBO and webcleaner, with three upgrades:

1. **Monotonic, separator-preserving line transformer** (HFW-style), instead of re-editing the
   whole text:
   - Keep `rawSeen` and `outText`.
   - On each read, take the new raw suffix and split it with `/(\r?\n)/` **keeping separators**.
   - Transform only complete lines and keep the incomplete tail pending.
   - At `readyState 4`, flush the tail.
   - Edited lines are re-stringified, but the original separator is re-emitted.
   - Rationale: E14 showed the length shrinking under re-editing. A consumer that keeps offsets
     into `responseText` is safe either way when edits are prefix-stable (offsets point at complete
     edited lines). Monotonic growth also protects consumers that assume growth.
2. Gate on `absUrl(openUrl)` and veto with `responseURL` (webcleaner). Also check
   `responseType === '' || 'text'`. Leave `json`, `arraybuffer` and `blob` unchanged.
3. Use a cheap prefilter regex before any `JSON.parse`. Use the parser **captured at startup**
   (`const parse = JSON.parse.bind(JSON)`), as uBO's `safeSelf` does (`safe-self.js:62`). Never
   throw: every transform is wrapped in try/catch and returns the raw text on error.

**Other hook pieces:**

- **fetch:** a Proxy; gate on `Response.url`. To avoid buffering (which breaks streamed
  consumption and long-lived responses), return
  `new Response(res.body.pipeThrough(lineTransformStream), {status, statusText, headers})` and
  copy `url/ok/redirected/type` with `defineProperty` (uBO `json-edit.js:1574-1583`; E10).
  **INFERRED:** FB's Relay GraphQL uses XHR (all uBO FB filters target XHR), so fetch is a
  secondary path; keep it narrow.
- **`toString` mask:** one Proxy on `Function.prototype.toString` with a WeakMap. It is shared
  with the frame copies. VERIFIED shape in E10.
- **What the edits do for MFGA:**
  - (a) drop `SPONSORED` edges and `SponsoredData` nodes (uBO and webcleaner semantics);
  - (b) drop "suggested" edges (`follow_button` `CometFeedStoryFollowButtonStrategy`, from the uBO
    annoyances list);
  - (c) **observe** (clone, never mutate) feed requests and responses to learn `doc_id`,
    `variables`, `fb_dtsg`, `lsd` and cursors for the combined chronological feed. Capture the
    request body in `send()`; FB sends `application/x-www-form-urlencoded`.
- **Error and kill switch:** catch per hook. Count failures; after N failures in a session, disable
  the edit and keep pass-through. Diagnostics shows counts. Keep a settings switch "network
  features: off" that skips installation entirely. This only applies from the next load.

### 4.6 Sending our own requests (replaying FB GraphQL)

- Use the page world's **original** `XMLHttpRequest` (or `fetch`), captured before patching:
  `const NativeXHR = W.XMLHttpRequest` at the top of `page.js`. That request:
  - is same-origin (`https://www.facebook.com/api/graphql/`);
  - automatically carries FB's cookies (E15: `cookie: c_user=…` reached the server);
  - satisfies `connect-src`;
  - is invisible to our own hook (E15 `viaHook:false`).
- Alternative: keep the patched class and mark our instances in a `WeakSet` that the getters
  ignore. Capturing the native is simpler and also avoids any *other* page hooks.
- Body: copy FB's own captured form fields. Change only `variables` (cursor, count, filter) and
  `fb_api_req_friendly_name` if needed. Keep `doc_id`, `fb_dtsg`, `lsd`, `jazoest`, `__a`, `__req`
  and similar exactly as FB sent them.
- Headers: replicate the custom ones FB set on the captured request (record them in a
  `setRequestHeader` wrapper, for example `X-FB-LSD`, `X-FB-Friendly-Name`, `X-ASBD-ID`).
  **INFERRED** names; record whatever is present rather than hard-coding them.
- Do **not** use `GM_xmlhttpRequest` or the extension background for these. They run outside the
  page, send different Origin/Referer headers and fetch-metadata, and would need `@connect` or
  host permissions. They are also unnecessary.
- Rate-limit: serialize replays, cap pages per filter (for example 2 per scroll), and back off on
  any non-200 status or a GraphQL `errors[]` result. The account is the user's, and anomalous
  traffic is the main ban risk (**INFERRED**).
- Parse replay responses with our own line parser. Never feed them into FB's Relay store.

### 4.7 Risk of breaking Facebook, and mitigations

| Risk | Mitigation |
|---|---|
| Our getter throws → FB's network layer fails | try/catch everywhere; return raw on error; per-session failure counter + automatic disable |
| Edited payload violates a Relay invariant (missing `node` on an edge) | Prefer the uBO-proven edits only (FB tolerates `node` removal since uBO ships it); for MFGA's own feed we render our own DOM, so we need not mutate FB's payloads beyond ad removal |
| Integrity checks (`toString`, own-keys, prototype chain) | Proxy-based natives + single `toString` mask (E10). Subclass changes `Object.getPrototypeOf(XMLHttpRequest.prototype)`, which is detectable. Accepted (uBO and webcleaner ship it) |
| `JSON.parse` canary | Don't hook `JSON.parse` (webcleaner `:1676-1680`) |
| Clean natives from fresh frames | §4.4 guard |
| Requests with spoofed URLs (YouTube's NMP-style honeypot) | Gate on served/opened URL, not on a page-supplied `Request.url` (webcleaner README 8.22.0) |
| Late userscript misses early state | §2.7 detection, diagnostics, recommend the extension or TM Dynamic |

---

## 5. Storage and settings

**Userscript**

- `GM_getValue`/`GM_setValue` are synchronous in TM and VM. This matters at document start; HFW
  says the same (`src/core/storage.js:3-6`). VERIFIED E17/E19.
- `GM.getValue`/`GM.setValue` return promises. They are the only form in GM4 and the Safari
  Userscripts app. Use them to hydrate a cache.
- `GM_addValueChangeListener(key, (k, old, new, remote) => …)` gives cross-tab sync in TM and VM
  (TM API index; VM `$DOCS/vm-api_gm.txt:17`).
- VM also has `GM_getValues`/`GM_setValues` (VM 2.19.1+); TM has them from 5.3.
- Write each setting once. webcleaner fixed double writes on managers that expose both APIs
  (`webcleaner.user.js:172-215`; README 8.23.0).

**Extension**

- `chrome.storage.local`: 10 MB (`QUOTA_BYTES 10485760`), unlimited with `unlimitedStorage`. It is
  exposed to content scripts by default.
- `storage.sync`: about 100 KB total, 8 KB per item, `MAX_ITEMS 512`.
- `storage.session`: in memory and not exposed to content scripts by default.
- `storage.onChanged` fires in all contexts.
- Source: developer.chrome.com/docs/extensions/reference/api/storage, last updated 2026-09-11,
  `$DOCS/chrome-storage.txt:303-313, 430-467`.
- Platform differences (BCD): Safari does not actually sync `storage.sync`; Firefox Android does
  not sync it to the account.
- Recommendation: settings in `storage.sync` if under 8 KB per key, otherwise `local`. Mirror the
  settings into `local` so Safari and Android behave the same.

**Data placement**

- Settings: small, persisted.
- Feed state (seen IDs, cursors): **in-memory** per tab, optionally `sessionStorage`. Note that
  page-origin storage is readable by FB (**INFERRED** privacy point). Do not push large or chatty
  data through GM storage: each write is IPC.

**Settings UI**

- **One in-page panel in the core**, rendered in a **closed shadow root** so FB's CSS cannot leak
  in. `style-src 'unsafe-inline'` permits the `<style>`. Build it with `createElement`, not
  `innerHTML`; webcleaner made the same move for Trusted-Types sites (README 8.23.0).
- It opens from:
  - a 2010-style "Account ▾ → MFGA Settings" link in the custom header;
  - `GM_registerMenuCommand` (userscript);
  - the extension action popup (`runtime.sendMessage` → `bridge.js` → page event).
- The extension also ships `options_ui` (`open_in_tab: true`) that edits the same keys, for when FB
  breaks so badly the page UI cannot load.
- Include import/export, reset, and a **Diagnostics** tab: manager and mode, `late` flag, hook
  counters, a DOM skeleton dump. The brief requires diagnostics because the logged-in DOM cannot be
  observed from the container.

---

## 6. Assets and CSP

- **Icons atlas as `data:`.** `img-src` includes `data:` (header, §2.1). `data:` loads from both
  worlds, and a `<style>` with `url(data:…)` applies (VERIFIED E16).
  - A 30 KB PNG grows to about 40 KB as base64 (4/3).
  - Embed it **once** in a stylesheet rule:
    `.mfga-ic{background-image:url(data:image/png;base64,…)}` with `background-position` sprites.
    The image is then decoded once and reused by every element, which avoids repeating the
    `data:` string in many `src` attributes. **INFERRED** perf rationale.
- **Size:** a userscript of a few hundred KB is fine for TM and VM. Parse cost at document start
  scales with bundle size.
  - Put the hook installer first and keep it free of UI code.
  - Defer UI initialisation to `DOMContentLoaded` / `requestIdleCallback`.
  - **INFERRED:** about 300 KB of JS parses in single-digit to low-double-digit ms on desktop.
- **Do not use** `GM_getResourceURL`/`@resource` for the atlas (an extra fetch at install).
- **Do not use** extension `web_accessible_resources` for UI rendered from MAIN. A foreign origin
  was blocked by page `img-src` when created from MAIN (E16), and `chrome-extension:` is not in
  FB's img-src (behaviour from MAIN untested). The single `data:` path works for both builds.
- **Userscript `@icon`:** a `data:` URI. HFW embeds about 2.6 KB this way so the manager never
  fetches an image (`scripts/meta.mjs:6-8`).
- **Fonts:** Lucida Grande / Tahoma are system fonts. `font-src` allows `data:` if a bundled
  webfont is ever needed.
- **Never** reference web.archive.org at runtime: it is not in img-src, and it rate-limits.

---

## 7. Build tooling

### 7.1 Layout and build (esbuild, no other dependencies)

```
src/core/            pure logic: jsonl-transform, graphql-capture, feed-merge, settings schema, selectors  → node:test
src/page/            page-world runtime: hooks.js, frames.js, modules.js (__d), feed/, render/, panel/
src/platform/userscript/entry.js   imports page runtime + GM storage adapter + menu commands
src/platform/extension/page-entry.js  page runtime + bridge client (world MAIN)
src/platform/extension/bridge.js   ISOLATED: chrome.storage ↔ page, runtime messages
src/platform/extension/background.js  onInstalled (open options), action click; tiny, classic script (works as SW and as Firefox event page)
src/platform/extension/options.html/.js, popup.html/.js
assets/generated/atlas.png (+ atlas.json)  → inlined as data: at build time
scripts/build.mjs, scripts/meta.mjs, scripts/manifest.mjs, scripts/zip.mjs
```

`scripts/build.mjs` (verified pattern, `$PT/buildproto/build.mjs`, mirrors HFW `scripts/build.mjs`):

```js
import { build } from 'esbuild';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const common = { bundle: true, format: 'iife', target: ['chrome111', 'firefox128', 'safari17'], charset: 'utf8',
  legalComments: 'eof', minify: false, write: false,
  define: { __MFGA_VERSION__: JSON.stringify(pkg.version) },
  loader: { '.png': 'dataurl', '.css': 'text' } };          // atlas.png → data: URL string at build time
const us = await build({ ...common, entryPoints: ['src/platform/userscript/entry.js'], banner: { js: renderMeta(pkg.version) } });
// → dist/mfga.user.js (+ optional dist/mfga.meta.js = banner only)
for (const browser of ['chrome', 'firefox']) {
  // page.js (MAIN), bridge.js (ISOLATED), background.js, options/popup → dist/<browser>/ ; manifest from scripts/manifest.mjs
}
// zips: dist/mfga-chrome-<ver>.zip, dist/mfga-firefox-<ver>.zip via scripts/zip.mjs
```

- `minify: false`. AMO reviewers need readable code; HFW states the same (`scripts/build.mjs:3-4`).
- Pin esbuild exactly (`"esbuild": "0.28.2"`, as HFW `package.json` does). npm 10.9 is present.
- The target list keeps syntax at or below Chrome 111 (MAIN-world floor).
- HFW uses `chrome120/firefox128/safari17`, saying nothing older was checked (`scripts/manifest.mjs:20-26`).
- **No eval:** E7. esbuild does not emit eval for normal ESM. Add a CI grep of `dist/` for
  `eval(` / `new Function` as a guard.
- **Zip:**
  - Node 22 has `zlib.crc32` (since 22.2 / 20.15) and `deflateRawSync`. A writer of about 40 lines
    produced a valid archive (E21; `$PT/buildproto/zip.mjs`, the same approach as HFW
    `scripts/zip.mjs`, with a fixed DOS date for reproducibility).
  - `/usr/bin/zip` also exists (`zip -r -X -9`), but do not rely on it in CI.
- **Version stamping:**
  - The single source is `package.json` `version`.
  - It flows into `@version`, `manifest.version` (dotted integers only, at most 4 parts; no
    `-beta` suffix) and the in-page "About".
  - A check script asserts they match (HFW has `scripts/check-versions.mjs`).
  - webcleaner had a stale displayed version and now pins it with a test (README 8.23.0).
- **Reproducibility:** sorted file order, fixed zip timestamps, no `Date.now()` in bundles.

### 7.2 Userscript metadata (rendered by `scripts/meta.mjs`)

```
// ==UserScript==
// @name         MFGA – Make Facebook Great Again
// @namespace    https://github.com/pawel-mazurkiewicz/mfga
// @version      <package.json version>
// @description  Facebook, the 2010 way: classic look, one chronological feed of friends, groups and pages, no ads or suggestions.
// @author       pawel-mazurkiewicz
// @homepageURL  https://github.com/pawel-mazurkiewicz/mfga
// @supportURL   https://github.com/pawel-mazurkiewicz/mfga/issues
// @icon         data:image/png;base64,…            (≤ 3 KB)
// @match        https://www.facebook.com/*
// @match        https://web.facebook.com/*
// @run-at       document-start
// @noframes
// @sandbox      raw
// @inject-into  auto
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @updateURL    https://raw.githubusercontent.com/pawel-mazurkiewicz/mfga/main/dist/mfga.user.js
// @downloadURL  https://raw.githubusercontent.com/pawel-mazurkiewicz/mfga/main/dist/mfga.user.js
// ==/UserScript==
```

- `@noframes` is right for the userscript: the frame guard handles same-origin about:blank frames
  from the top window.
- `@sandbox raw`: TM. `@inject-into auto`: VM and Safari Userscripts. Each manager ignores the
  other's key.
- `@grant unsafeWindow` is required for TM (§2.4).
- Do **not** add `GM_xmlhttpRequest`, `@connect` or `GM_addElement`. They are not needed, and
  fewer grants make for a calmer install prompt.
- `@updateURL`: TM docs say *"a @version tag is required to make update checks work"*
  (`$DOCS/tm-q-update_url.html`).
  - Pointing both URLs at the full `.user.js` is what the brief asks for and works.
  - An optional `dist/mfga.meta.js` (banner only) as `@updateURL` saves bandwidth, as HFW does.
  - raw.githubusercontent.com is CDN-cached for a few minutes (**INFERRED**). Bump the version for
    every release.

### 7.3 Manifests (generated; Chrome and Firefox differ only where needed)

```jsonc
// dist/chrome/manifest.json
{
  "manifest_version": 3, "name": "MFGA – Make Facebook Great Again", "version": "<ver>",
  "description": "…", "minimum_chrome_version": "120",
  "icons": { "16": "icons/16.png", "32": "icons/32.png", "48": "icons/48.png", "128": "icons/128.png" },
  "action": { "default_title": "MFGA", "default_popup": "popup.html", "default_icon": { … } },
  "options_ui": { "page": "options.html", "open_in_tab": true },
  "background": { "service_worker": "background.js" },
  "permissions": ["storage"],
  "host_permissions": ["https://www.facebook.com/*", "https://web.facebook.com/*"],
  "content_scripts": [
    { "matches": ["https://www.facebook.com/*", "https://web.facebook.com/*"], "js": ["page.js"],
      "run_at": "document_start", "world": "MAIN", "all_frames": true, "match_about_blank": true, "match_origin_as_fallback": true },
    { "matches": ["https://www.facebook.com/*", "https://web.facebook.com/*"], "js": ["bridge.js"],
      "run_at": "document_start" }
  ]
}
// dist/firefox/manifest.json: same, except
  "background": { "scripts": ["background.js"] },              // Firefox has no extension service workers (BCD: firefox no)
  "browser_specific_settings": { "gecko": { "id": "mfga@pawel-mazurkiewicz.github.io", "strict_min_version": "128.0",
        "data_collection_permissions": { "required": ["none"] } },
        "gecko_android": { "strict_min_version": "128.0" } }
  // drop "minimum_chrome_version"
```

- **Background:** Chrome uses `service_worker`; Firefox has no extension service workers.
  - MDN (`$DOCS/mdn-manifest-json_background.md:178-196`): since Chrome 121, `background.scripts`
    in MV3 is ignored; since Firefox 121, `service_worker` is ignored when `scripts` is present.
    One manifest with both keys would therefore work. Separate manifests stay clearer and are
    what HFW and uBO Lite do.
  - Keep `background.js` a classic script that is valid in both contexts.
- **Gecko id:** required to sign MV3 on AMO. *"AMO does not assign an ID"*
  (`$DOCS/mdn-manifest-json_browser_specific_settings.md:78`).
- **`data_collection_permissions`:** *"Must be provided … for new extension submitted to
  addons.mozilla.org from November 3, 2025"* (same file, `:21`). Firefox 140+ knows the key; older
  ones load with a warning (`$DOCS/ff128.md:97`).
- **Host permissions on Firefox:** MV3 host permissions are user-revocable. *"From Firefox 127,
  host permissions listed in host_permissions and content_scripts are displayed in the install
  prompt"* (`$DOCS/mdn-manifest-json_host_permissions.md:41-49`). Check
  `permissions.contains({origins:[…]})` in the popup and options page, and show a "Grant access"
  button.
- **No `web_accessible_resources`** (§6).
- **No `scripting`, `userScripts` or `webRequest`.** The two static content scripts are enough.
  This also avoids the Chrome "Allow User Scripts" toggle entirely, which is a real advantage
  over userscripts (§2.4).
- **Edge:** the Chrome build as is (Edge Add-ons).
- **Chrome MV2** is gone:
  - Chrome 138 disabled MV2 for all users, and 139 removed the enterprise override
    (developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline, via search
    2026-10-21).
  - TM FAQ Q408 notes the policy removal from mid-2025.
  - The MV2 Chrome Web Store removal date was 2026-08-31.
- **Safari:** run `xcrun safari-web-extension-converter dist/firefox` on macOS. Requirements:
  - an Apple Developer account to distribute;
  - `storage.sync` does not sync;
  - content scripts apply only after the user grants site access in Safari (BCD note under
    `content_scripts.run_at`).
  - uBO Lite's Safari manifest uses `background.scripts` + `"persistent": false` and
    `browser_specific_settings.safari.strict_min_version "18.6"`
    (`$REFS/uBlock/platform/mv3/safari/manifest.json`).
  - **Phase 2; not testable here.**
- **Store and review notes:**
  - MV3 forbids remotely hosted code; MFGA bundles everything.
  - AMO requires source plus build instructions for bundled code; ship `README-build.md` in the
    source zip.

---

## 8. Testing

**Unit (node:test):** pure modules with no DOM:

- the JSONL transformer: CRLF, a split tail, monotonicity, prefix stability;
- the sponsored, suggested and edge classifiers, against fixture payloads;
- GraphQL form capture and rebuild (URLSearchParams round-trip);
- feed merge (by `creation_time`, dedup by story id, stable ordering);
- the settings schema and migration;
- the metadata and manifest generators (snapshot), version consistency.

Run with `node --test "test/unit/**/*.test.js"`. HFW does the same and adds `happy-dom` for
light DOM tests (`package.json` scripts/devDependencies). That is optional; Playwright covers
real DOM.

**E2E, userscript build (fast, headless-shell OK):**

- `chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' })`.
- Then `context.addInitScript({content: gmShim + builtUserscript})`:
  - the GM shim defines `GM_getValue`/`GM_setValue`/`GM_info`/`unsafeWindow = window`
    (webcleaner `test/harness.js:9-27` is a good template);
  - add `if (window !== top) return` to emulate `@noframes`.
- Then `context.route('**/*', …)`:
  - fulfil `https://www.facebook.com/**` documents with fixture HTML **plus the real CSP header**;
  - fulfil `/api/graphql/` with fixture JSONL;
  - abort the rest, but `route.continue()` for non-http(s) URLs.
- `addInitScript` ran before the page's first inline script and ignores page CSP (E13).
- This is the strictest document start and matches what webcleaner's suite does (README
  "Verification").

**E2E, extension build (VERIFIED feasible):**

- `chromium.launchPersistentContext(mkdtempSync(...), { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--disable-extensions-except=dist/chrome', '--load-extension=dist/chrome'] })`.
- Wait with `ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker')`.
- `context.route` works for MAIN-world content scripts (E1/E4).
- Pitfalls observed:
  - `headless_shell` cannot load extensions (E2).
  - A catch-all route also intercepts `chrome-extension://` loads; continue non-http(s) (E16).
  - Use a fresh user-data dir per run.
  - The dynamic-registration example raced with itself (`Duplicate script ID`); guard
    `registerContentScripts` with `getRegisteredContentScripts`.
- `--load-extension` is ignored by **branded** Chrome 137+ but still works in Chromium and Chrome
  for Testing (Chromium-extensions PSA, April 2025: groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY).
- Headed runs work under `xvfb-run -a` (E3).
- **Pin `playwright-core@1.56.1`** to match the installed browser revision 1194. Newer
  playwright-core expects revision 1248 (Chrome 156).

**Manager-timing tests (optional, slow):**

- Load real TM or VM CRX builds, as `$PT/run-mgr.mjs` and `$PT/run-real.mjs` do. Serve fixtures
  from a **real local HTTP server**, because `route.fulfill` skips their webRequest/DNR logic.
- TM install automation: toggle `#allow-user-scripts #crToggle` on `chrome://extensions/?id=…`,
  reload, navigate to `http://127.0.0.1:<port>/x.user.js`, click "Install" on `ask.html`.
- VM: `confirm/index.html` "Install".
- Useful as a regression canary for "document-start really is early". Do not run it on every
  commit.

**Not testable here:**

- Firefox (no binary; Playwright Firefox cannot load extensions anyway). Use `web-ext run` /
  `web-ext lint` on a dev machine (**INFERRED** tooling choice).
- Safari.
- Live logged-in FB (datacenter IP gets the login wall).
- Compensate with the built-in diagnostics and skeleton dump (§5), and with fixtures that copy
  live CSP and payload shapes.

**What to assert in E2E:**

- Hooks installed before the first inline script.
- Sponsored edges removed on XHR, fetch and streamed reads.
- `frames[n]` natives hooked.
- `toString` shape native.
- No `pageerror`, and no CSP violation console errors from our code.
- 2010 chrome (header, columns) rendered; FB-owned nodes not removed (React safety, §9).
- Settings persist and round-trip through the bridge.
- `NativeXHR` replay carries the cookie and is not edited.

---

## 9. Performance and React safety on Comet

**CSS first**

- Hiding and restyling go in one or a few `<style>` elements, gated by a class on `<html>`. For
  example `html.mfga-on [data-mfga-hide]{display:none!important}`. webcleaner gates on `html.fcf-s`
  (`webcleaner.user.js:1720-1730`) and injects with `addStyle` (`:323-326`).
- Toggling a feature flips a class or `style.disabled` (webcleaner `:1580-1586`) instead of walking
  the DOM.

**Mark with `data-*` attributes, never `className`**

- React writes `className` on every update of that host component, so our classes vanish. React
  does not touch attributes it does not own.
- **But Comet virtualises and reuses DOM nodes**: a node we tagged can be recycled for different
  content. Re-validate with a cheap signature. webcleaner's `NODE_ST` WeakMap with
  `fresh(el, mark)` resets the verdict when `textContent.length` changes (`:152-170`).

**Batching**

- MutationObserver callbacks only *enqueue*: push roots into a `Set`, then schedule one flush.
- webcleaner's `debounced` uses `requestIdleCallback(fn, {timeout: 250})`, falling back to rAF
  (`:136-149`). It has a separate rAF "fast" path for urgent work, with a coalescing flag
  (`:1606-1616`).
- Recommended:
  - rAF for anything visible: the restyle of new stories, so no frame shows the 2026 look;
  - idle callbacks for classification and diagnostics;
  - a hard cap on work per flush (for example 8 ms), with continuation.
- Observe `childList` + `subtree` on the feed container once found, not on `documentElement`
  forever. Re-acquire the container on route change (poll `location.href`, as webcleaner does,
  `:367-375`). fb-clean-my-feeds observes only `class` changes on `<html>` for dark-mode switching
  (`$REFS/facebook-clean-my-feeds/greasyfork-release/fb-clean-my-feeds.user.js:7250-7262`), which
  is a good example of a narrow observer.

**Caches and layout**

- `WeakSet` / `WeakMap` for "already processed" checks. They never leak when React unmounts.
- Avoid `getBoundingClientRect`/`offsetHeight` inside mutation handling. Batch all reads, then all
  writes, in the flush.
- Prefer `textContent` over `innerText`: `innerText` forces style and layout.
- **Exception:** detecting rendered labels needs rendered text, so do it on few candidates, at
  idle (webcleaner uses rendered-text matching as a bounded "rescue" only, README Limits).
- Use `content-visibility:auto` + `contain-intrinsic-size` only on *our* rendered feed items
  (**INFERRED** win for long merged feeds).

**React safety rules**

1. **Never remove or move React-owned nodes.**
   - React keeps fiber→DOM references. Removing a child it later updates or removes throws
     `NotFoundError: Failed to execute 'removeChild'` or `insertBefore`, and can crash the subtree
     or the app.
   - Hide with CSS (`display:none`, `visibility`, or off-screen) instead.
   - webcleaner hides by stylesheet: "Nothing is deleted — like every other switch it hides by
     stylesheet" (README Behaviour notes).
2. **Adding foreign nodes is usually safe:**
   - inside our own wrapper, or as a sibling *after* React's children, or in a portal root we own
     (for example `<div id="mfga-root">` under `<body>`, or a closed shadow root);
   - React's reconciliation uses its own fiber siblings as insertion references, so unknown
     siblings are ignored. **INFERRED** from React internals. Unknown siblings can still shift
     `:nth-child` CSS and FB's own index assumptions; prefer appending to our own root.
3. **For the 2010 layout, render our own chrome** (header, left nav, right column, the merged feed)
   in an MFGA-owned root.
   - Use CSS to hide FB's banner, navigation and complementary regions.
   - Do not re-parent FB nodes.
   - Reuse FB components only by *reading* data from them (or from the GraphQL payloads), not by
     moving them.
4. **Event handling:** use delegated listeners on our own root. Never `stopPropagation` on FB
   nodes. React's root listener must keep seeing its events.
5. **Hydration:** **INFERRED.** Some Comet surfaces stream server HTML and hydrate it. DOM edits
   before hydration finishes can cause hydration mismatches and client re-renders. Restrict
   pre-`DOMContentLoaded` work to `<style>` injection and network hooks.
6. **Theme tokens:** override FB's CSS custom properties (`--blue-link`, `--card-background`, etc.)
   at `:root` / `.__fb-light-mode` with higher specificity. This restyles FB-rendered parts without
   touching their DOM. The token list is in `research/fb-light-vars.css`.

---

## 10. Open risks and unverified items

1. **Firefox MAIN-world timing and frames** are documented, not tested here.
   - MAIN at `document_start` should precede page scripts like ISOLATED content scripts do
     (**INFERRED**).
   - About:blank frames are *not* auto-injected at document_start (BCD), hence the sweep guard.
2. **TM and VM timing on real facebook.com.** Fixtures say "late unless TM Dynamic" when the first
   `<script>` comes in the first HTML bytes. Real FB likely does that (**INFERRED**). The installer
   docs and diagnostics should say so, and recommend the extension.
3. **FB's clean-frame method set may change.** The uBO list (appendChild, insertBefore,
   insertAdjacentElement, append, prepend, before, after) plus innerHTML/outerHTML/write covers
   today's knowledge; the sweep on `frames.length` growth is the generic backstop.
4. **CustomEvent object detail across worlds:** fine in Chrome (E9), not in Firefox. Use strings
   only.
5. **Safari:** compiled from docs only.
6. **Stack traces expose our script URL** (E4/E17 stacks). There is no fix; minimize throwing.
7. **The `@sandbox JavaScript` trap.** HFW's choice; Firefox Xray breaks page hooks. MFGA uses
   `raw`.
8. **Cross-realm objects from copied natives** in frames (§4.4). uBO needed to rewrite FB's
   bundle (`instanceof ArrayBuffer`). Extension Chrome builds avoid it through per-frame
   self-hooking. Userscript and Firefox builds carry the risk.

---

## Appendix A: sources (fetched 2026-10-21 unless a date is given)

**Docs**

- Tampermonkey documentation, `documentation.php?q=sandbox|run_at|grant|unsafeWindow|GM_addElement|GM_info|update_url|noframes|run_in`,
  page timestamps 10/21/2026, https://www.tampermonkey.net/documentation.php. Saved in `$DOCS/tm-q-*.txt/html`.
- Tampermonkey FAQ Q209 (Allow User Scripts), Q404 (@sandbox), Q408 (MV2), https://www.tampermonkey.net/faq.php. `$DOCS/tm-faq-*.html`.
- Violentmonkey, https://violentmonkey.github.io/ (MV3 note):
  - /api/metadata-block/ (`@inject-into`, `@run-at`, `@grant`);
  - /api/gm/ (`unsafeWindow`, `GM_addElement`, `GM_getValues`, `GM_info.injectInto`);
  - /posts/inject-into-context/;
  - saved in `$DOCS/vm-*.txt`.
- Chrome for Developers, saved in `$DOCS/chrome-*.txt`:
  - manifest content_scripts (last updated 2023-08-10);
  - content-scripts concepts (document_start, isolated-world CSP, main-world CSP);
  - scripting API (2026-09-11);
  - userScripts API (2026-09-11);
  - storage API (2026-09-11).
- MDN via https://github.com/mdn/content (main, 2026-10-21):
  - manifest.json content_scripts, host_permissions, background, browser_specific_settings;
  - Content scripts; Sharing objects with page scripts; Content Security Policy;
  - Firefox 127/128/136 release notes.
  - Saved in `$DOCS/mdn-*.md`, `$DOCS/ff12*.md`, `$DOCS/ff136.md`.
- @mdn/browser-compat-data 8.1.6 (npm), `$REFS/bcd/package/data.json`; query helper
  `/tmp/claude-0/-home-user-mfga/80791cd0-cb87-5148-8f51-26da76f4aa2e/scratchpad/scripts/bcd.js`.
- Chrome MV2 timeline: https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline
  (via web search 2026-10-21).
- `--load-extension` removal in branded Chrome 137:
  https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY (April 2025, via search).
- VM MV3 status discussion: https://github.com/violentmonkey/violentmonkey/issues/1934 (via search).
- quoid/userscripts README, https://raw.githubusercontent.com/quoid/userscripts/main/README.md. `$DOCS/userscripts-readme.md`.
- facebook.com response headers, logged out: `$DOCS/fb-headers-2026-10-21.txt`.
- AMO API (`https://addons.mozilla.org/api/v5/addons/addon/{tampermonkey,violentmonkey,greasemonkey}/`):
  TM 5.5.0 (2026-05-08), VM 2.49.0 (2026-09-06) and GM 4.14 (2026-06-02), all MV2 permission sets.

**Code on disk**

- webcleaner 8.23.0 @ab55c06 (2026-10-12): `$REFS/webcleaner/webcleaner.user.js`,
  `$REFS/webcleaner/README.md`, `$REFS/webcleaner/test/harness.js`.
- uBlock Origin @1e6f82b (2026-10-20):
  - `$REFS/uBlock/src/js/resources/json-edit.js`, `proxy-apply.js`, `scriptlets.js`, `safe-self.js`;
  - `$REFS/uBlock/platform/mv3/{chromium,firefox,safari}/manifest.json`;
  - `$REFS/uBlock/platform/mv3/extension/js/scripting-manager.js`.
- uAssets @5b924ee (2026-10-21): `$REFS/uAssets/filters/quick-fixes.txt:109-158`,
  `filters.txt:321-348`, `annoyances-others.txt:677-680`.
- Violentmonkey source @6528001 (2026-10-19): `$REFS/violentmonkey`. CRX 2.49.0 at `$REFS/vm-crx/unpacked`.
- Tampermonkey CRX 5.5.1 (minified): `$REFS/tm-crx/unpacked`.
- Greasemonkey 4.14 @6080f91 (2026-06-02): `$REFS/greasemonkey/gm`.
- HushFacebook Web 0.0.4 @c38ef54 (2026-10-18): `$REFS/gh2026/SysAdminDoc_HushFacebookWeb`
  (`scripts/{build,meta,manifest,zip}.mjs`, `src/core/{env,storage,modules,bridge}.js`,
  `src/core/net/hooks.js`).
- fb-clean-my-feeds 5.02: `$REFS/facebook-clean-my-feeds/greasyfork-release/fb-clean-my-feeds.user.js`.

**Experiment harness (`$PT`)**

| File | Purpose |
|---|---|
| `fixture.mjs` | FB-like HTML + live CSP + JSONL |
| `ext/`, `ext-noframes/` | probe extensions |
| `run.mjs` | extension probes; results `result-*.json` |
| `run-us.mjs`, `userscript-sim.js` | userscript frame guard |
| `run-stream.mjs` | streaming JSONL |
| `run-tm2.mjs`, `run-mgr.mjs` | TM/VM via `route` |
| `run-real.mjs`, `localfb.mjs`, `probe.user.js` | TM/VM/extension with a real HTTP server |
| `buildproto/` | esbuild + zip prototype |
