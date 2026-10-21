# MFGA retro spec — Facebook desktop UI, 2010 ("new home page" era)

Target: `/home/user/mfga/assets/reference/2010-home.png` (994×882). The goal is a pixel-faithful CSS reproduction.
Author: retro-spec research agent, 2026-10-21. Every value has a source tag and a confidence rating.

## 0. How to read this

### Source tags

| Tag | Meaning |
|---|---|
| **[M x,y]** | Measured from the capture with Pillow at the given screenshot pixel coordinates. Inclusive ranges are written `a–b`. |
| **[FB12]** | Real Facebook CSS bundle, `rsrc.php` `upssLaANr2h.css`, build stamp `/*1346881577*/` (2012-09-05). It was saved inside a page at princeton.edu ([link](https://www.princeton.edu/~mgilens/Gilens%20homepage%20materials/MSNBC%20review%20of%20A&I/13317619-princeton-scholar-poor-and-middle-class-have-no-say-in-government-policy_files/likebox_data/upssLaANr2h.css)). Local copy: `research/assets/fb-css-2010/fb-rsrc-2012-09-upssLaANr2h.css`. This is two years after the target, but many `ui*` classes were unchanged from 2010. I use it only where the capture agrees, or as a fallback for parts the capture does not show. |
| **[CJS10]** | Facebook's own JS SDK CSS: `facebookarchive/connect-js` `src/css/{dialog,button,base}.css` at commit `ec03d81` (2010-11-25). The files are identical to their first 2010 versions. Local copies: `research/assets/fb-css-2010/connectjs-2010-*.css`. |
| **[IOS10]** | `facebook-ios-sdk` `src/FBDialog.m` at commit `beca7ece` (2010-11-29). Local copy: `research/assets/fb-css-2010/ios-sdk-2010-FBDialog.m`. |
| **[TOR09]** | Tornado `demos/facebook/static/facebook.css` (©2009 Facebook) at commit `2afa9734` (2009-09-10), a Facebook-authored stream mock. Local copy: `research/assets/fb-css-2010/tornado-2009-facebook-demo.css`. |
| **[MEM]** | My recollection of 2010–11 Facebook CSS. Use it only where nothing better exists. |

### Confidence

- **H**: verified by two sources, or by an unambiguous pixel measurement.
- **M**: one source, or a measurement complicated by dithering.
- **L**: memory or inference only.

### Capture forensics (this matters for interpreting pixels)

- **Browser and fonts:** Firefox 3.x on Windows XP, with ClearType off. Text is aliased Tahoma, which is the second entry in the font stack because Lucida Grande does not exist on Windows.
- **Half-pixel horizontal offset:** the 980 px page was centred at a half-pixel x offset. As a result:
  - images are bilinear-smeared over 51 px instead of 50, and 33 instead of 32;
  - the left 1 px column of the selected nav row is a 50% blend (#EDF2F5);
  - some 1 px rules split across two columns.

  **Page origin: screenshot x = 7.5 corresponds to CSS x = 0.** Vertical positions are integer in the header and mostly integer below it.
- **Palette:** the capture is quantised to a 205-colour palette with ordered-dither dots (e.g. #44629E specks in the blue bar). Solid colours snap to the nearest palette entry; mixed colours alternate between two entries. Canonical values below are chosen where the measured value is within quantisation noise of a known FB colour.
- **Chat tab:** the tab is `position:fixed`. It sits at y=424–449 because the browser viewport was about 450 px tall when the full-page capture was stitched.

---

## 1. Global tokens

### 1.1 Colours (measured vs canonical)

| Token | Measured in capture | Canonical (use) | Where | Source / conf |
|---|---|---|---|---|
| `--fb-blue` (bar, links) | #3A5897/#3A5899 + #44629E dots | **#3B5998** | bar 0–40; all links | [M] + [FB12] `a{color:#3b5998}` + [CJS10] **H** |
| `--fb-headnav` | #627AAD (solid) | **#627AAD** | lighter header block | [M 188–985,11–39] **H** |
| headNav outer border | #305695/#2B427F dither, avg ≈#2E4F8E | **#2E4F8E** (no proven canonical; #1D4088/#29447E are both too dark for this dither) | x=186 and x=987, y=10–39 | [M] **M** |
| headNav inner edge | #5B78AC/#536EA7, avg ≈#5873AA | **#5873AA** | x=187, x=986, row y=40 | [M] **M** |
| `--fb-text` | #323232 | **#333333** | body text | [M] + [FB12] `body{color:#333}` **H** |
| `--fb-gray` (timestamps, counts, "Chat with Friends") | #818181 | **#808080** (`gray`) | | [M] + [FB12] `.fcg{color:gray}` **H** |
| `--fb-placeholder` | #767676 | **#777777** | "Search", "What's on your mind?", "Write a comment…", comment timestamps | [M] + [FB12] `.DOMControl_placeholder{color:#777}` **H** |
| `--fb-sep-dot` (· between actions) | #97999C | **#999999** | story meta line, pokes | [M 344,421–431] + [FB12] `.UIActionLinks_bottom{color:#999}` **M** |
| `--fb-lightblue` (UFI, welcome box) | #EBEFF5 (UFI), #EDEFF5 (welcome) | **#EDEFF4** | | [M] + [FB12] `.uiUfi .ufiItem{background-color:#edeff4}`, `.uiBoxLightblue` **H** |
| `--fb-selected` (left-nav selected row) | #D9DFEB/#D8DEE7 | **#D8DFEA** | | [M 8–185,121–140] + [FB12] `.uiSideNav .selectedItem .item{background-color:#d8dfea}` **H** |
| `--fb-rule` (right-column header underline) | #E7E7E8 | **#E9E9E9** | y=77,190,338,520,597,684 | [M] + [FB12] `.uiListLight{border-color:#e9e9e9}` **M** |
| left/content separator (beside left col) | #C7C7C7 | **#CCCCCC** | x=186, y=42–417 | [M] + [FB12] `.hasLeftCol #contentCol{border-left:1px solid #ccc}` **H** |
| content separator (below left col) | #DBDBDB | **#DDDDDD** (approximately) | x=186, y=418→ | [M] **M** |
| page right rule | #EDEDED | **#EDEDED** | x=986, y=41→bottom | [M] **M** (its role is unknown) |
| story separator | #F8F7F7 (or two rows #FCFBFC+#FEFEFF) | **#F7F7F7** for a pixel match ([TOR09] used #EEE) | y=633/634, 837 | [M] **M** |
| left-nav group separator | #F8F7F7 (or two-row #FEFEFF+#FAFAFA) | **#F7F7F7** | y=233/234, 377; x=13–185 | [M] **M** |
| jewel unlit / lit | #2B427F / #93BAE2 | **#2B427F / #93BAE2** | header jewels | [M] (coordinator) **H** |
| notification badge fill | #EF3821 | **#F03D25** | | [M] + [FB12] `.jewelCount span{background-color:#f03d25}` **H** |
| count pill ("25") | #6E87B6 + #6683B3/#627AAD dots | **#6D84B4** | x=696–721,y=292–305 | [M] **M** (#6D84B4 is the FB "light blue" in [IOS10] and [FB12]) |
| welcome step badges | #A6B2CA | **#A6B2CA** | 15×16 squares | [M] **M** |
| comment input border | #CBD3E0 (solid) | **#CBD3E0** for a pixel match. The canonical input border #BDC7D8 is *not* what the capture shows; #BDC7D8 would quantise to #BECADE. | | [M] **M**; [FB12] `.inputtext{border:1px solid #bdc7d8}` |
| composer border | top/left #DBDBDB, bottom #D3D3D4, inner top #F5F5F5 | **#DBDBDB / #D3D3D3 / inset #F5F5F5** | | [M] **M** |

### 1.2 Typography

| Property | Value | Source / conf |
|---|---|---|
| font-family | `"lucida grande", tahoma, verdana, arial, sans-serif`. The capture renders Tahoma. | [FB12] body rule, [CJS10] `.fb_reset`, [M] glyph shapes **H** |
| base size | 11px | [FB12] `body{font-size:11px}` + [M] (x-height 6, cap 8) **H** |
| base line-height | `1.28` (14.08px) is the global rule. In the capture, wrapped 11px text in the right column, ads and comments steps **13px**. The welcome box steps 14px. | [FB12] `body{line-height:1.28}` **H**; [M] pitches **H** |
| size scale | 9 / 11 / 13 / 16 px (`.fss/.fsm/.fsl/.fsxl`) | [FB12] + [M] **H** |
| 9px | event dates ("Today", "Saturday": cap 7, x 5); badge digits (bold) | [M 886–910,531–540] **H** |
| 11px | everything default; bold for names, headers and buttons | [M] **H** |
| 13px | story message and actor name (cap 9, x 7, 16px line pitch); composer placeholder; "Top News · Most Recent"; welcome "Learn more…" link (bold) | [M 262–675,370–414] **H** |
| 16px | "News Feed" page header and welcome headline (cap 12, x 9) | [M 224–311,292–304] + [FB12] `.uiHeader h2{font-size:16px}` **H** |
| link decoration | none; underline on hover | [FB12] `a{text-decoration:none} a:hover{text-decoration:underline}` **H** |

Rendering note for 2026: Lucida Grande still ships on macOS. Windows has Tahoma. On Linux and Android neither exists, so add a metric-compatible fallback such as `"DejaVu Sans"` at `font-size-adjust` about 0.545. Pin line-heights in px (13, 14, 16) to get deterministic rows.

---

## 2. Page grid

Columns are given in screenshot px, with CSS px (origin at x=7.5) in brackets.

| Region | Screenshot px | CSS px | Notes / source |
|---|---|---|---|
| `#blueBar` | x 0–993, y 0–40 (41 px tall), full width | height 41px, `background:#3B5998`, **no bottom border in 2010** (2012 added `border-bottom:1px solid #133783`) | [M] **H**; [FB12] for contrast |
| page container | 7.5–987.5 | **width 980px**, centred | [M] + [FB12] `#pageHead{width:980px}` **H** |
| `#leftCol` | 7.5–186.5 | x 0–179, **width 179px**, padding-top 20px (content starts y=61) | [M] + [FB12] `#leftCol{padding:20px 0 0 2px;width:179px}` **H**. The capture shows no 2px left pad. |
| left separator | x=186 | x 179, 1px `#CCC` | [M] **H** |
| `#contentArea` | 202.5–722.5 | x 195–715, **width 520px**, padding 0 15px | [M] (welcome box 202–721, composer 202–722, story rules 202–722) **H** |
| `#rightCol` | 737.5–970.5 (content), gutter to 987.5 | x 730–963 content (**233px**), 17px right gutter | [M] rules 738–970 **H**. 2012 used `width:244px`. |
| right rule | x=986 | x 979, 1px #EDEDED, full height below header | [M] **M** |
| content top | y=61 (welcome box top) / 60 (right header line box) | 20px below bar | [M] **H** |

---

## 3. Header (y 0–40)

### 3.1 Logo and jewels

| Component | Property | Value | Source / conf |
|---|---|---|---|
| `#pageLogo` wordmark | box | glyphs x 7–96, y 15–33 (white, anti-aliased) | [M] **H** |
| | asset | `logo_header` in atlas (recovered from capture). Big logo `logo_big` = 2009 sprite (0,0,190,90). | atlas **H** |
| | hover | none visible. In 2011 the logo link was 103×31 sprite. | [FB12] `#pageLogo a{height:31px;width:103px}` **M** |
| jewels | glyph boxes | requests x108–123 y17–32; messages x132–148 y18–32; notifications (globe) x157–172 y17–32 | [M] **H** |
| | pitch | about 24–25px; buttons 24px wide, 1px side margin, 31px tall | [M] + [FB12] `.fbJewel a.jewelButton{height:31px;margin:0 1px;width:24px}` **H** |
| | unlit / lit | #2B427F / #93BAE2 silhouettes | [M] **H** |
| | hover / open | hover bg #4B67A1 (2012). Open: white bg, `border:1px solid #333; border-bottom:0`. | [FB12] **M** for 2010 |
| `.jewelCount` badge | outer box | x164–178, y8–20 (15×13 including border), plus a 1px shadow row at y=21 | [M] **H** |
| | fill | #F03D25 (measured #EF3821) | [M]+[FB12] **H** |
| | border | darker red edge (measured #C03140/#A0360E). Canonical 2012: `border:1px solid #d83722; border-top-color:#e23923; border-bottom-color:#c0311e` | [M] + [FB12] **M** |
| | shadow | `box-shadow:0 1px 0 rgba(0,39,121,.77)` (row 21 reads #2B427F) | [FB12] + [M] **M** |
| | text | white, bold, **9px**; digits 7px tall at x166–176, y11–17; padding 0 1px; `border-radius:2px` (the 2010 capture looks square) | [M] + [FB12] **H** |
| | position | top-right of the notifications jewel, overlapping the globe | [M] **H** |

### 3.2 headNav block

| Property | Value | Source / conf |
|---|---|---|
| box | x186–987, y10–40. Left and right 1px borders run y10–39. Fill #627AAD y11–39. | [M] **H** |
| top edge | there is no visible top border: row y=10 is bar colour from x≥187 | [M] **H** |
| left/right border | 1px ≈#2E4F8E (dither of #2B427F/#305695) | [M] **M** |
| inner shading | 1px ≈#5873AA at x=187 and x=986; bottom row y=40 #536EA7 | [M] **M** |
| CSS sketch | `#headNav{position:absolute;left:179px;top:10px;width:800px;height:30px;background:#627AAD;border:1px solid #2E4F8E;border-top:0;border-bottom:0;box-shadow:inset 1px 0 #5873AA,inset -1px 0 #5873AA,inset 0 -1px #536EA7}` | derived |

### 3.3 Search box (`#navSearch .uiSearchInput`)

| Property | Value | Source / conf |
|---|---|---|
| outer box | x191–490, y14–36 (**300×23**). That is 4–5px right of the headNav border and 3px below its top. | [M] **H**; [FB12] `#navSearch{margin:3px 0 0 4px}` **H** |
| border | top #536EA7, bottom #536DA6, right #44629E. The left edge shows no distinct colour (reads #627AAD). | [M] **M** |
| inner highlight | row y=15 #D3DBE5 (top inset); row y=35 #B4C0D8 (bottom inset) | [M] **M** |
| field | white; x192–468 | [M] **H** |
| placeholder | "Search", 11px, #777. Glyphs start x=197; baseline y=30. | [M] **H** |
| magnifier button | x469–489, y15–35: 1px divider at x=469 (#F5F5F5), white bg, top inset #EDF2F5, bottom inset #CFD8E7 | [M] **M** |
| magnifier glyph | grey (#B6B6B5–#C7C7C7) ring with handle, about 12×13 at x473–484, y19–31. Not in either sprite sheet: draw it in CSS/SVG or crop it from the capture. | [M] **M** |

### 3.4 Page nav links (`#pageNav`: Home · Profile · Account ▾)

| Property | Value | Source / conf |
|---|---|---|
| font | 11px **bold**, **#FFFFFF** in 2010 (2012 used #D8DFEA). | [M] **H** |
| baseline | y=29 (caps y22–29) | [M] **H** |
| glyph x | Home 808–838; Profile 860–896; Account 918–963; ▾ 968–975 (y24–27, white, about 7×4 with anti-aliasing) | [M] **H** |
| spacing | 21–22px between words, so about 10px padding per side. Right edge: arrow ends 11px inside the headNav border. | [M] **M** |
| separators | none visible in 2010 (2012 drew 1px #526DA4 dividers via `:after`) | [M]/[FB12] **H** |
| link box | height 30px (y11–40), `line-height` ≈ 29px | [FB12] `#pageNav .navItem a{height:31px;line-height:29px}` **M** |
| hover | background #4B67A1, text #FFF (2012) | [FB12] **M**; [MEM] says 2010 used a similar darker-blue hover **L** |
| ▾ arrow | white CSS triangle: `border-top:4px solid #fff; border-left:4px solid transparent; border-right:4px solid transparent` (about 7–8×4), 5px after "Account" | [M] **M** |

### 3.5 Account dropdown (not in capture; 2011–12 rules, design unchanged since 2010)

| Property | Value | Source / conf |
|---|---|---|
| open link | `background:#fff; border:1px solid #333; border-bottom:0; color:#333` (the link becomes a white tab) | [FB12] `#navAccount.openToggler #navAccountLink` **M** |
| menu box | `position:absolute; right:-1px; top:100%; background:#fff; border:1px solid #333; border-bottom:2px solid #333; padding:4px 0; min-width:200px` | [FB12] `#navAccount .navigation` **M** |
| item | `display:block; height:18px; line-height:18px; padding:0 22px; color:#222; border-top:1px solid #fff; border-bottom:1px solid #fff` | [FB12] `.navSubmenu` **M** |
| item hover | `background:#6D84B4; border-top:1px solid #3B5998; border-bottom:1px solid #3B5998; color:#fff` | [FB12] **H** (same as `.uiMenuItem` focus) |
| separator | `border-bottom:1px solid #ddd; margin:5px 7px 6px` | [FB12] `.uiMenuSeparator` **M** |
| items (2010) | Edit Friends · Account Settings · Privacy Settings · Application Settings · Help Center · Log Out | [MEM] **M** |

---

## 4. Left column (x 7.5–186.5)

| Component | Property | Value | Source / conf |
|---|---|---|---|
| profile photo | box | x 7.5–57.5 (50px wide). The visible image is y67/68–110 (≈43px tall): a non-square `_t` thumbnail, vertically centred in a ≈50px box at y64–114. **Use a 50×50 `object-fit:cover`.** | [M] **M** |
| name | style | "J.D. Hodges": 11px **bold** link #3B5998; glyph x=66; baseline y=73 | [M] **H** |
| "View My Profile" | style | 11px regular link; x=66; baseline y=87 (14px pitch) | [M] **H** |
| name offset | | 8px gap after photo (57.5→65.5) | [M] **M** |
| nav list | row pitch | **21px**. Row tops: 121, 142, 163, 184, 205, then 247, 268, 289, 310, 331. | [M] **H** |
| | CSS | `.item{display:block;min-height:17px;line-height:13px;padding:3px 8px 0 27px;border-bottom:1px solid #fff;color:#333}` gives 3+17+1 = 21 | [FB12] `.uiSideNav .item{…min-height:17px;line-height:13px;padding:3px 8px 0 28px;border-bottom:1px solid #fff}` **H**; padding-left measured 27 (text box x=34.5) |
| | icon | 16×16 at row-left +5.5 (x=13), top +3 (e.g. Messages y145–160) | [M] **H** |
| | text | 11px #333; glyphs from x=35; baseline = row top + 13 (134, 155, 176, 197, 218, 261, 282, 303, 324, 345) | [M] **H** |
| | selected | `background:#D8DFEA; font-weight:bold`. Spans x 7.5–186.5 and covers the separator column, which reads ≈#CFD5DE there. The 1px white `border-bottom` shows as a light row at y=141. | [M] + [FB12] **H** |
| | hover | (not in capture) 2011: `background:#EFF2F7`? | [MEM] **L** |
| | count "(4)" | 11px regular, #808080, one space after label | [M 74–87,210–220] **H** |
| | "more" arrow | light-blue right arrow, 9×8, at label end + 6px (x112–120, y296–303), colour ≈#BECADE. Shown on "Ads and Pages" and "Garden World". | [M] **H** |
| group separator | | 1px ≈#F7F7F7 rule, x 13–185, at y=233.5 (21px block between groups) and y=377 | [M] **M** |
| "More ▾" | | 11px link #3B5998 at x=13, baseline 367. Blue ▾ 9×5 sprite (2009 sprite 63,128) at x=38. | [M] **H** |
| "Chat with Friends" | | 11px **bold** #808080 at x=13, baseline 397 | [M] **H** |
| "Go Online" | | 11px link at x=13, baseline 415 | [M] **H** |

---

## 5. Centre column (x 202.5–722.5, width 520)

### 5.1 Welcome box (one-off intro; optional)

| Property | Value | Source / conf |
|---|---|---|
| box | x202–721, y61–264 (520×204). Fill #EDEFF4. Edge reads #E3E7EF/#E4E8F1 (lighter than #D8DFEA, probably half-pixel smear). | [M] **M**; [FB12] `.uiBoxLightblue{background-color:#edeff4;border:1px solid #d8dfea}` |
| padding | about 20px (headline glyphs x=223, top 80) | [M] **M** |
| headline | 16px regular #333; baseline 92 | [M] **H** |
| "close" | 11px link, right-aligned, glyphs x677–700, baseline 87 | [M] **H** |
| illustration | x223–397, y110–222 (175×113) | [M] **H** |
| step badges | 15×16 #A6B2CA squares with white bold digit at x418–432, y116/154/192 | [M] **M** |
| step text | 11px #333 at x=441, 14px line pitch, 10px between items | [M] **H** |
| "Learn more about your new home page ▸" | 13px **bold** link; baseline 247; ▸ 5×8 blue triangle after it | [M] **H** |

### 5.2 Stream header ("News Feed")

| Property | Value | Source / conf |
|---|---|---|
| icon | 16×13 at x202–217, y291–303. Use the 2010 newspaper icon (§10). | [M] **H** |
| title | "News Feed", **16px regular #333**, x=224, baseline 304 | [M] + [FB12] `.uiHeader h2{font-size:16px}` (2012 colour #1C2A47; 2010 is #333) **H** |
| filters | right-aligned: "Top News" 13px **bold** #333; "·" #333 bold 2×2 dot at x611; "Most Recent" 13px link; baseline 303 | [M] **H** |
| count pill | x696–721, y292–305 (26×14). Fully rounded (radius 7). bg #6D84B4. Text "25" 11px bold white, digits 8px tall at x703–715. 3–5px left of the pill edge. | [M] **M** |
| spacing | welcome box bottom 264 → header glyphs 291; header → composer 328 | [M] **H** |

### 5.3 Composer ("What's on your mind?")

| Property | Value | Source / conf |
|---|---|---|
| box | x202–722, y328–356 (521×29) | [M] **H** |
| border | top #DBDBDB, inner top line #F5F5F5 (y=329), left #DDD, bottom #D3D3D3, right split over 2 columns (#EBEBEB/#E3E3E3) | [M] **M** |
| placeholder | 13px #777, glyphs from x=209 (padding about 6px), baseline 347 | [M] **H** |
| focused state | 2010: grows, shows attach bar (Photo/Video/Link/Event) and blue "Share" `.uiButtonConfirm` | [MEM] **L** |

### 5.4 Story (`.uiStreamStory`)

| Property | Value | Source / conf |
|---|---|---|
| vertical rhythm | about 10px padding top/bottom. 1px ≈#F7F7F7 rule (x202–722) between stories. | [M] (composer 356 → avatar 366.5; UFI end 622.5 → rule 633 → avatar 642.5) **M** |
| actor photo | **50×50** at the content left (x202.5–252.5), top aligned with the first text line | [M] + [TOR09] `.post .picture img{height:50px;width:50px}` **H** |
| body offset | text column starts **60px** from the photo's left (x=262.5) | [M] + [TOR09] `.post .body{margin-left:60px}` + [FB12] `.storyInnerContent{margin-left:60px}` **H** |
| actor name | **13px bold** link #3B5998, inline before the message | [M 262–389,370–382] + [FB12] `.uiStreamMessage .actorName{font-weight:bold}` **H** |
| message | 13px regular #333, **16px line pitch** (baselines 379/395/411) | [M] **H** |
| meta line | 11px; baseline 18px below the last message baseline (429 vs 411). "26 minutes ago" #808080 · "Comment" link · "Unlike"/"Like" link. Separators " · " #999. | [M 262–439,421–431] **H** |
| UFI nub | #EDEFF4 up-pointing triangle, about 10×5, apex x≈283.5; base y=438 just above the first UFI item; 17px from the UFI left edge | [M] **M** |

### 5.5 UFI (feedback box under each story)

| Component | Property | Value | Source / conf |
|---|---|---|---|
| `.uiUfi` | box | x262.5–617.5 (**355px wide**), starts at the body column | [M] **H** (2012 widened it to 398) |
| `.ufiItem` | style | `background:#EDEFF4; padding:5px 5px 4px; line-height:14px`. Items are separated by a **2px white gap** in 2010 (2012: `margin-top:1px`). No darker separator line is visible. | [M] + [FB12] `.uiUfi .ufiItem{background-color:#edeff4;margin-top:1px;padding:5px 5px 4px}` **H** |
| like row | geometry | 23px tall (y439.5–462.5). Thumb icon at +5.5 (x268–281, y445–457). Text "You and **Amy Winstead** like this." 11px #333 + link at x=287, baseline 454. | [M] + [FB12] `.uiUfiLikeIcon{height:13px;width:15px}` **H** |
| "View all N comments" | geometry | 26px tall (y464.5–490.5). Comment-bubble icon x269–282, y472–484. Link 11px at x=288, baseline 481. | [M] **H** |
| comment | avatar | **32×32** at UFI +5 (x267.5–299.5), top = item top + 5 | [M] **H** |
| | text | name **11px bold** link + text #333 at x=306.5 (32 + 7px gap); line pitch **13px**. Timestamp 11px **#777** on its own line, baseline 15–16px below the last text line. Item padding-bottom 4. | [M] **H** |
| add comment | input | x268–612 (345×22, i.e. full UFI width − 2×5), border 1px #CBD3E0, bg #FFF, `padding:3px`. Placeholder "Write a comment..." 11px #777, glyphs x=273, baseline 611. Item y592.5–622.5. | [M] + [FB12] `textarea,.inputtext{padding:3px}` **H** |

---

## 6. Right column (x 737.5–970.5)

| Component | Property | Value | Source / conf |
|---|---|---|---|
| section header | text | 11px **bold** #333 at x=738 ("Requests", "Suggestions", "Sponsored", "Events", "Pokes", "Connect With Friends") | [M] + [FB12] `.uiHeader h3,.uiHeader h4{color:#333;font-size:11px}` **H** |
| | "See All" | 11px link, right-aligned to x=970 (glyphs 937–969), same baseline | [M] **H** |
| | rule | 1px #E9E9E9 from x738–970, **6px below the header baseline** (baseline 71 → rule 77). Equivalent: line 13px + `padding-bottom:3px` + `border-bottom`. | [M] **H** |
| | baselines | Requests 71 / rule 77; Suggestions 184/190; Sponsored 332/338; Events 514/520; Pokes 591/597; Connect 678/684 | [M] **H** |
| section spacing | | 13–17px between sections | [M] + [FB12] `.ego_section{margin-bottom:15px}` **M** |
| Requests rows | | 20px pitch; first row top ≈80 (2px under rule). Icon 16px at x=738 (y84, 103, 124, 144). Text at x=758/759 (icon + 5px). Baselines 94/114/134/154. Count **bold** + label regular, all links #3B5998 ("**3** friend requests", "**108** other requests"). | [M] **H** |
| Suggestions | photo | 50×50 at x738–787, y197–246 and 257–306 (60px pitch) | [M] **H** |
| | text | x=795 (photo + 7–8px). Name **bold** link baseline = photo top + 11. Lines 16px apart: "2 friends are fans." (#333 with link) / icon + "Become a Fan" link, or envelope + "Send him a message". Small icons 16px at x=795, text at x≈815. | [M] **H** |
| | close × | grey ×, 8×7 at x958/960–967 on the name row (core #999, anti-aliasing #CFCFCF). Pixel pattern in §10.3. | [M] **H** |
| Sponsored ad | title | "Fight AIDS in Africa" 11px **bold** link, baseline 355; × at right | [M] **H** |
| | image | x738–≈818, y362–442 (≈80×80) | [M] **M** (overlapped by chat tab) |
| | body | 11px #333 at x=825, **13px line pitch** (baselines 372, 385, 398, 411, 424) | [M] **H** |
| | social line | "516,727 people are fans of (RED)." 11px, baseline 458 | [M] **H** |
| | button | "Become a Fan" `.uiButton` (§8.1) at x738–850, y467–487, icon + 11px bold #333 | [M] **H** |
| Events | rows | gift icon 16×14 at x738, y528. Text x=758: name link + "'s birthday" #333 + date **9px #808080** ("Today", "Saturday"). Baselines 537 and 552 (15px pitch). | [M] **H** |
| Pokes | rows | poke-hand icon at x738, y603 (first row only). "John Odom · Poke Back" (links, · #999). × at x≈960–966 per row. 16px pitch, baselines 615/631/647. | [M] **H** |
| Connect With Friends | rows | 16px icons at x738 (y690, 713, 748). Text x=758, 13px line pitch. "Invite friends to join Facebook." link; "Use our **contact importer** to find friends you didn't know were on Facebook."; "Use Facebook on your **mobile phone** to connect with friends on the go." | [M] **H** |

---

## 7. Chat dock tab ("Chat (Offline)")

| Property | Value | Source / conf |
|---|---|---|
| position | `position:fixed; bottom:0; right:15px` (right edge x=978 in a ≈994 viewport) | [M] + [FB12] `.fbDock{margin:0 15px 0 0}`, `.fbDockWrapper{bottom:0;height:25px;position:fixed}` **H** |
| box | x778–978 (**≈200px wide**), y424–449: 1px top border plus 25px body | [M] **H** |
| top border | translucent grey ≈`rgba(164,164,164,.48)` (reads #D3D3D4 on white, #B45F6B on red). Side borders similar. No bottom border. | [M] (solved from two backgrounds) **M** |
| background | vertical gradient #F7F7F7 (top) → #DDDDDD (bottom) | [M] **H** |
| content | status icon (person + grey dot, §10) at x784–799, y431–441; label "Chat (Offline)" 11px **bold** #333 at x≈804, baseline 440 | [M] **H** |
| 2012 equivalent | `.fbNubButton{background:#ebeef4;border:1px solid rgba(29,49,91,.3);border-bottom:0;height:16px;padding:4px 5px;font-weight:bold}`. Different look; do not use for 2010. | [FB12] |

---

## 8. Shared components (mostly not in capture)

### 8.1 Buttons

| Component | Property | Value | Source / conf |
|---|---|---|---|
| `.uiButton` (grey), as seen in 2010 capture | box | "Become a Fan": x738–850, y467–487 (113×21) plus 1px shadow row at y488 (#E5E5E5) | [M] **H** |
| | border | 1px ≈#BEBEBE (lighter than 2012's #999/#888) | [M] **M** |
| | background | gradient #F8F8F8 (top) → #E3E3E3 (bottom), with a 1px highlight at the top | [M] **M** |
| | text | 11px **bold** #333; icon 16px + 5px gap; padding about 2px 6px | [M] + [FB12] **H** |
| `.uiButton` (2011–12 canonical) | | `background:#EEE url(gradient) ; border:1px solid #999; border-bottom-color:#888; box-shadow:0 1px 0 rgba(0,0,0,.1); font:bold 11px/13px; padding:2px 6px` | [FB12] **H** (for late 2010–2012) |
| | :active | `background:#DDD; border-bottom-color:#999; box-shadow:0 1px 0 rgba(0,0,0,.05)` | [FB12] **H** |
| `.uiButtonConfirm` (blue) | | `background-color:#5B74A8; border-color:#29447E #29447E #1A356E;` text white bold. Inner highlight `box-shadow:inset 0 1px 0 #8A9CC2`. | [FB12] **H**; highlight [CJS10] `border-top:1px solid #879ac0` **M** |
| | :active | `background:#4F6AA3; border-bottom-color:#29447E` | [FB12] + [CJS10] (`#4f6aa3`, top `#45619d`) **H** |
| `.uiButtonLarge` | | `font-size:13px; line-height:16px` | [FB12] **H** |
| FB Connect button (2010) | | outer `background:#29447E`. Text span `background:#5F78AB; border-top:1px solid #879AC0; border-bottom:1px solid #1A356E; color:#fff; font-weight:bold; padding:2px 6px 3px` | [CJS10] **H** |

### 8.2 Inputs

| Property | Value | Source / conf |
|---|---|---|
| `textarea, .inputtext` | `border:1px solid #BDC7D8; padding:3px; font:11px "lucida grande",tahoma,…` (`.inputtext` padding-bottom 4px) | [FB12] **H**. The capture's comment box is lighter (#CBD3E0, §5.5). |
| placeholder | #777 | [FB12] + [M] **H** |
| `label` | `color:#666; font-weight:bold` | legacy rule in 2018 FB CSS `refs/fbcss-gist/facebook.css` **M** |
| select | `border:1px solid #BDC7D8; padding:2px` | same **M** |

### 8.3 Dialogs (pop_dialog / generic dialog)

| Component | Property | Value | Source / conf |
|---|---|---|---|
| frame | outer | 10px translucent frame `rgba(82,82,82,.7)`, `border-radius:8px` | [CJS10] `.fb_dialog_advanced{background:rgba(82,82,82,.7);padding:10px;border-radius:8px}` **H** |
| title bar | `h2.dialog_title` | `background:#6D84B4; border:1px solid #3B5998; border-bottom:none; color:#fff; font-size:14px; font-weight:bold; margin:0`. Inner span padding about 4px 10px 5px. | [FB12] `.pop_content h2.dialog_title` **H** + [IOS10] `kFacebookBlue=#6D84B4`, `kBorderBlue≈#3B5998`, `kBorderWidth=10` **H**; padding [MEM] **M** |
| content | | `background:#fff; border:1px solid #555; border-top-width:0` | [FB12] `.pop_content .dialog_content` **H** |
| body | | padding 10px; 11px #333 | [MEM] **M** |
| footer (buttons) | | `background:#F2F2F2; border-top:1px solid #CCC; padding:8px 10px; text-align:right`. Buttons `.uiButton` + `.uiButtonConfirm`. | [MEM] **M** (#F2F2F2/#CCC match [FB12] `.uiBoxGray`) |
| close | | 2010 SDK close icon at top-right (right 19px, top 18px) | [CJS10] **M** |

### 8.4 Menus, typeahead, tooltips, boxes

| Component | Value | Source / conf |
|---|---|---|
| `.uiMenu` / `.uiMenuX` | `background:#fff; padding:3px 0 4px; border:1px solid #777; border-bottom:2px solid #293E6A` | [FB12] `.uiMenuXBorder` **H** |
| `.uiMenuItem .itemAnchor` | `color:#111; line-height:16px; padding:1px 16px 1px 22px; border:solid #fff; border-width:1px 0`. Hover/focus: `background:#6D84B4; border-color:#3B5998; color:#fff`. | [FB12] **H** |
| typeahead dropdown | `ul{background:#fff; border:solid; border-width:1px 1px 2px; border-color:#333 #333 #293E6A; padding:2px 0}`, items `padding:0 6px` | [FB12] **H** |
| tooltip | `background-color:#282828; color:#fff; font-size:11px; line-height:14px; padding:4px 8px; white-space:nowrap`, plus a small pointer | [FB12] `.uiTooltipText` **M** for 2010 |
| `.uiBoxGray` | `background:#F2F2F2; border:1px solid #CCC` | [FB12] **H** |
| `.uiBoxLightblue` | `background:#EDEFF4; border:1px solid #D8DFEA` | [FB12] **H** |
| `.uiBoxYellow` | `background:#FFF9D7; border:1px solid #E2C822` | [FB12] **H** |
| `.uiBoxRed` | `background:#FFEBE8; border:1px solid #DD3C10` | [FB12] **H** |
| overlay (2012) | `border:1px solid rgba(0,0,0,.45); border-bottom-color:#666; box-shadow:0 3px 8px rgba(0,0,0,.3)` | [FB12] **L** for 2010 |

### 8.5 Footer (not in capture)

| Property | Value | Source / conf |
|---|---|---|
| container | `#pageFooter{width:980px; margin:0 auto; color:#737373; font-size:11px}` | [FB12] **M** |
| curve / rule | `#contentCurve{background:#fff; border-bottom:1px solid #CCC; height:8px}`, then `#footerContainer{border-top:1px solid #EEE; padding:8px 8px 38px}` | [FB12] **M** |
| left text | "Facebook © 2010 · English (US)" (language is a link) | [MEM] **M** |
| right links | About · Advertising · Developers · Careers · Privacy · Terms · Help. Links #3B5998, separators " · ". ("Create a Page" was added in 2011.) | [MEM] **M** |

---

## 9. Annotated layout map

The overlay image is `research/assets/retro-layout-annotated.png` (2× scale, boxes labelled). Coordinates are screenshot px.

```
y\x 0      7.5   96 108   178 186 191          490          808  838 860 896 918  975 987 993
 0  ┌──────────────────────────── #blueBar #3B5998 (h41, no bottom border) ─────────────────────┐
10  │ logo 7–96×15–33   jewels  ┃#627AAD headNav x186–987 y10–40 (border ≈#2E4F8E L/R)        ┃   │
14  │                  108/132/157┃ ┌search 300×23 x191–490 y14–36┐       Home Profile Account▾ ┃   │
40  └────────────────────────────┸─┴──────────────────────────────┴───── bold 11px #fff b=29 ─┸───┘
    x:7.5        186│202.5                          722.5│737.5                      970.5│986
61  leftCol 179px   │ welcome box 520×204 (#EDEFF4)      │ Requests (b71) ── rule y77 #E9E9E9 ─│
64  [50px pic] name │                                    │  ▪ 3 friend requests   rows 20px    │ #EDEDED
121 ▓News Feed▓ sel │                                    │ Suggestions (b184) rule 190         │ rule
142  Messages  21px │                                    │  [50px] Mafia Wars ×    60px pitch   │
..   rows           │ ▤ News Feed 16px       Top News·Most Recent (25) y291–305               │
233 ── sep #F7F7F7 ─│ ┌composer 521×29 y328–356──────────┐│ Sponsored (b332) rule 338           │
247  Applications…  │ [50px]  Name msg 13px/16px          │  title / 80px img / 11px/13px text │
361  More ▾         │   x262.5  meta 11px (b429)          │  [Become a Fan] 113×21 y467        │
377 ── sep ─────────│   ┌UFI 355px #EDEFF4 x262.5–617.5┐ │ Events (b514) rule 520              │
397 Chat with Friends│  │like 23 / view-all 26 / cmts │  │ Pokes (b591) rule 597               │
415 Go Online       │   │32px pics, add-comment 345×22│  │ Connect With Friends (b678) r684    │
424                 │   └──────────────────────────────┘ │ ┌Chat (Offline) fixed 200×26 r15─┐  │
633                 │ ─── story rule #F7F7F7 x202–722 ── │                                     │
```

CSS-px (origin x=7.5) cheat-sheet: leftCol 0–179 · border 179 · contentArea 195–715 · story body 255 · UFI 255–610 · rightCol 730–963 · right rule 979 · headNav 179–980 (y10–40) · search 184–483.

---

## 10. Icon mapping review (`/home/user/mfga/assets/icons.json`)

### 10.1 Method and sheets

- **How I checked:** each UI slot in the capture was cropped and compared at 6× against the mapped crop and against candidates. The comparison sheets are:
  - `research/assets/retro-icons-cmp-nav.png`
  - `research/assets/retro-icons-cmp-rightcol.png`
  - `research/assets/retro-icons-cmp-misc.png`
  - `research/assets/retro-icons-cliptest.png` (crop boxes with a 3px context margin)
- **Labelled sprite views:**
  - `retro-strip2012-0-799.png`, `retro-strip2012-800-1599.png`, `retro-strip2012-1600-1757.png` (4×, y ticks)
  - `retro-sprite2009-icons-zoom.png` (7×, x/y grid)
- **Box format:** all boxes below are `(x,y,w,h)` and were verified from the alpha map. s12 = `fb-2012-Mj5nS9bWTJX.png`, s09 = `fb-2009-ejni29l8.png`.

### 10.2 Slot verdicts

| Slot | Current pick | Verdict | Proposed (verified) |
|---|---|---|---|
| nav **News Feed** + stream header icon | s12 (1,847,15,15). 2011–12 newspaper with red/blue blocks. | **Not 2010.** The capture shows a grey newspaper with light-blue blocks and no red. | **s12 (0,927,16,15)**: 2010-style grey/light-blue newspaper. Exact match. |
| nav Messages | s12 (1,1167,16,14) + orange→pink recolour | Closest + recolour. The shape matches; the 2010 back bubble was pink/magenta. | keep |
| nav Events | s12 (1,155,15,16) | Authentic ("31" calendar). The box is exact. | keep (or s09 (53,109,15,16), identical design) |
| nav Photos | s12 (0,959,16,15) | Authentic design (same as s09 (33,92,16,15)) | keep |
| nav Friends | s12 (0,1366,16,14) | Authentic (grey + blue person) but **box bleeds 1 row** of the next icon (row 1379) | **s12 (0,1366,16,13)** |
| nav Applications | s12 (0,1118,16,16) | Authentic | keep |
| nav **Games** | s12 (0,991,14,14), grey d-pad | **Not 2010.** 2010 was a pair of playing cards (grey back card with a spade, front card with a red heart), which is in neither sheet. The current box also **clips the right column**. | Fix the box to **s12 (1,991,14,14)** if the d-pad is kept. For authenticity, crop the 2010 icon from the capture at x13–29, y270–286 and key out white. |
| nav Ads and Pages | `nav_pages` s12 (0,334,16,16) | Authentic (green page + blue "f") | keep. `nav_ads` megaphone (1,1246,15,15) is fine for an Ads-only slot. |
| nav Groups | s12 (0,671,16,14) | Authentic (blue + navy people) | keep |
| nav Notes | s12 (0,1437,16,13) | Plausible (lined notebook). Same design as s09 (0,128,13,16). | keep |
| nav **Video** | s12 (0,1261,16,15), blue "play" square (2011–12) | Not 2010. The 2010 Video app icon was the camcorder. | **s09 (51,93,15,12)** (= `misc_video09`) or s12 (1,896,15,12) |
| nav Marketplace | s12 (0,1102,16,16) | Unverified (no 2010 reference in capture) | keep, mark as closest |
| nav Saved | s12 (1,1308,15,13) bookmark | Anachronistic slot (no 2010 equivalent) | keep |
| nav Favorites | s12 (0,1633,12,11) star | OK | keep |
| nav Most Recent | s12 (1,1276,15,15) RSS | Anachronistic: in 2010 "Most Recent" was a text filter, not a nav item | keep, or show no icon |
| nav flag (`nav_flag`) | s12 (1,637,15,16) | **Box includes the bottom row of the `<>` icon above** | **s12 (3,638,13,15)** |
| rc friend request | s12 (0,703,16,14) | Authentic (person + green "+1") | keep |
| rc **friend suggestion** | s12 (1,734,16,16), plain person | **Wrong.** The capture shows person + green ⇄ arrows. | **s12 (1,750,15,16)** |
| rc group invite | s12 (0,671,16,14) | Authentic | keep |
| rc other requests | s12 (0,1071,16,14) | Authentic (card + blue check) | keep |
| rc birthday gift | s09 (104,109,15,14) | Authentic | keep (s12 (1,1292,15,14) is the same design) |
| rc poke | s12 (0,1410,16,15) | Authentic (hand) | keep |
| rc **invite** | s12 (0,1454,16,12), envelope | **Wrong.** The capture shows a blue speech bubble with two white people. | **s12 (0,814,16,16)** |
| rc contact importer | s12 (0,718,16,17) | Authentic (card + green plus) | keep |
| rc **mobile** | s12 (5,862,11,16), black touchscreen phone (2011+) | **Not 2010.** The capture shows a grey phone with a blue screen and keypad. | **s09 (14,128,10,16)** |
| rc **become a fan** | s12 (0,879,16,14), green "like" thumb (2011 Like) | **Wrong for 2010.** The capture (suggestions and the ad button) shows an orange ribbon + blue plus + page. | **s12 (0,654,16,15)** |
| rc send message | s12 (0,398,16,16) square envelope | Close. The capture's is a flatter 17×12 envelope. | **s12 (0,1454,16,12)** (current `rc_invite` box) |
| rc event | s09 (53,109,15,16) | OK | keep |
| UFI like | s09 (38,128,12,11) / s12 (1,1543,13,12) | Both authentic shapes. The capture glyph is about 14×13. | prefer **`ufi_like_big` s12 (1,1543,13,12)**. 2012 CSS box is 15×13. |
| UFI comment ("View all") | s09 (171,93,13,13) | Authentic (blue bubble with light-blue back bubble) | keep |
| chat online / idle | s12 (0,1486,16,10) / (0,1466,16,10) | Correct boxes (person 8w + status 7w) | keep |
| chat **offline** | s12 (0,1476,16,10): person + **red** dot | 2010 offline is a **grey** dot (#7A7D7F) | keep the box; recolour red→#7A7A7A at build time (as is done for messages) |
| misc ▾ blue ("More") | s09 (63,128,9,5) | Exact (#526EA6) | keep |
| Account ▾ (white) | none | The capture's is a white triangle about 7–8×4 | draw in CSS (border triangle) |
| bookmark "more" arrow (light-blue →) | `misc_arrow_right` s12 (3,503,10,4), grey half-arrow | **Wrong shape and colour** | Crop from the capture: x112–120, y295–303 (9×9), key out white. Or recolour the grey right arrow in s12 (6,548,10,9) to #BECADE after masking the blue arrow pixels at x≤9. |
| misc × (close) | s12 (0,1705,11,11), red-pink ✕ (11×13) | **Wrong for 2010.** The right column uses a small grey × of 8×7. | Draw it: core #999 with #CFCFCF anti-aliasing (pattern below), or crop from the capture at x957–966, y201–207. |
| misc heart | s12 (0,1039,15,14) | **Clips the right column** | **s12 (1,1039,15,14)** |
| misc green plus | s12 (0,1743,10,10) | OK | keep |
| search magnifier | none | The capture's is a grey glass about 12×13 | crop from capture x472–485, y19–31, or use SVG |

### 10.3 Pixel patterns from the capture (for icons not in either sheet)

Grey close × (8×7), taken from capture x958–965, y201–207. `#` = #999 (measured #97999C), `+` = #CFCFCF (measured #CFCFD0), `.` = transparent:

```
+#+..+#+
+##++##+
.+####+.
..+##+..
.+####+.
+##++##+
+#+..+#+
```

This is an exact transcription, symmetric. The hover state is not in the capture; [MEM] says it darkened to #666. **L**

Bookmark arrow: the light-blue (#BECADE core, #D9DFEB/#C5D1E3 edges) right arrow occupies x112–120, y295–303. Crop it rather than redraw.

### 10.4 Suggested `icons.json` patch

```json
{
  "nav_news_feed":        {"sheet":"fb-2012-Mj5nS9bWTJX.png","x":0,"y":927,"w":16,"h":15},
  "nav_friends":          {"sheet":"fb-2012-Mj5nS9bWTJX.png","x":0,"y":1366,"w":16,"h":13},
  "nav_games":            {"sheet":"fb-2012-Mj5nS9bWTJX.png","x":1,"y":991,"w":14,"h":14},
  "nav_video":            {"sheet":"fb-2009-ejni29l8.png","x":51,"y":93,"w":15,"h":12},
  "nav_flag":             {"sheet":"fb-2012-Mj5nS9bWTJX.png","x":3,"y":638,"w":13,"h":15},
  "rc_friend_suggestion": {"sheet":"fb-2012-Mj5nS9bWTJX.png","x":1,"y":750,"w":15,"h":16},
  "rc_invite":            {"sheet":"fb-2012-Mj5nS9bWTJX.png","x":0,"y":814,"w":16,"h":16},
  "rc_mobile":            {"sheet":"fb-2009-ejni29l8.png","x":14,"y":128,"w":10,"h":16},
  "rc_become_fan":        {"sheet":"fb-2012-Mj5nS9bWTJX.png","x":0,"y":654,"w":16,"h":15},
  "rc_send_message":      {"sheet":"fb-2012-Mj5nS9bWTJX.png","x":0,"y":1454,"w":16,"h":12},
  "misc_heart":           {"sheet":"fb-2012-Mj5nS9bWTJX.png","x":1,"y":1039,"w":15,"h":14}
}
```

Build-time additions to `make-atlas.py`:

1. Recolour `chat_offline`'s red dot (pixels with r ≫ g,b in the right 7 columns) to #7A7A7A.
2. Optionally add capture-keyed crops: `nav_games_2010` (x13–29, y270–286), `misc_more_arrow` (x112–120, y295–303), `misc_close_gray` (x957–966, y201–207) and `search_glass` (x472–485, y19–31). Use the white-keying approach already used for the header logo. Note that these come from a dithered capture.

---

## 11. Research log and limits

- **Wayback Machine.** A background job tried the CDX API for `static.ak.fbcdn.net/rsrc.php/*`, `b.static.ak.fbcdn.net/rsrc.php/*` and `static.ak.fbcdn.net/rsrc.php/z*` (2010, `text/css`). There were 6 attempts with ≥35s spacing. Every attempt failed with `curl: (35) Recv failure: Connection reset by peer`, so I gave up as instructed. WebFetch to web.archive.org is blocked ("unable to fetch"). Log: `scratchpad/wb/log.txt`. **No 2010 rsrc CSS was obtained.**
- **Best substitutes found.** All are saved under `research/assets/fb-css-2010/`:
  - (a) A real FB rsrc CSS bundle from 2012-09, found via web search (princeton.edu page cache). It is very rich: `body`, `.uiButton*`, `.uiUfi`, `.uiSideNav`, `#pageNav`, `#navAccount`, `.jewelCount`, `.pop_content`, `.uiMenu`, `.uiTooltipText`, footer and more.
  - (b) Facebook connect-js CSS, 2010.
  - (c) iOS SDK FBDialog constants, 2010.
  - (d) Tornado's Facebook demo CSS, 2009.
- **No 2010 CSS clone of this layout was found.** GitHub code search is unavailable to this session (gh 403), grep.app is behind a Vercel challenge, and WebSearch turned up nothing usable. One unrelated WebSearch hit, a Harvard "marblebook" Facebook clone from 2006, was not pursued.
- **Things the capture cannot tell us:** hover states, focus rings, the open account menu, jewel flyouts, dialogs, the footer, and the expanded composer. For these I give [FB12] values (the same design language, two years later) or [MEM], with confidence marked.
- **Search box border:** the left edge of the 2010 search box shows no distinct border column in the capture. It may be hidden by the half-pixel offset. A 1px #536EA7 left border is a safe reproduction.

### Web sources consulted

- [Princeton-hosted copy of a Facebook rsrc CSS bundle (2012)](https://www.princeton.edu/~mgilens/Gilens%20homepage%20materials/MSNBC%20review%20of%20A&I/13317619-princeton-scholar-poor-and-middle-class-have-no-say-in-government-policy_files/likebox_data/upssLaANr2h.css)
- [Tornado Facebook demo CSS (googlesource mirror)](https://gfiber.googlesource.com/vendor/opensource/tornado/+/3d994a53cbc77ee84391ad8c31dead432bc0650a/demos/facebook/static/facebook.css)
- [facebookarchive/connect-js](https://github.com/facebookarchive/connect-js) (history before 2012-07 deprecation)
- [facebook/facebook-ios-sdk](https://github.com/facebook/facebook-ios-sdk) (`src/FBDialog.m`, 2010)
- [Elgg forum palette mention of #3b5998/#d8dfea](https://elgg.org/discussion/reply/view/2083354/2081994), weak corroboration only
- [dyclassroom "dialog box like facebook" (#6d84b4 header)](https://dyclassroom.com/web-project/html5-create-custom-dialog-box-like-facebook), weak corroboration only
