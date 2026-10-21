// Builds feed.html and feed-pl.html (this folder) from the 2026 skeletons in docs/research/dom-feed.md
// §2.1/§3.1 (MBFC-FWD 2026-03, PAGRU 2026-03 Polish, UA-CAP 2026-10 captures). The output is committed;
// re-run with `node test/fixtures/native/build-fixtures.mjs` after changing a unit.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL(".", import.meta.url));
const enc = (svg) => `data:image/svg+xml,${encodeURIComponent(svg)}`;
const avatarImg = (bg) =>
  enc(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 50 50'><rect width='50' height='50' fill='${bg}'/><circle cx='25' cy='19' r='9' fill='#fff'/><path d='M8 50c0-11 8-17 17-17s17 6 17 17z' fill='#fff'/></svg>`);
const photoImg = (sky = "#7ab8e8", sand = "#f7d9a5") =>
  enc(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 320'><defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${sky}'/><stop offset='1' stop-color='${sand}'/></linearGradient></defs><rect width='512' height='320' fill='url(#s)'/><circle cx='400' cy='90' r='36' fill='#ffe27a'/><path d='M0 250 Q130 190 260 240 T512 230 V320 H0z' fill='#3b7d4a'/><path d='M0 290 Q150 250 300 285 T512 280 V320 H0z' fill='#2e6a3c'/></svg>`);
const glyph = {
  like: enc(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><path d='M2 9h3v9H2zM7 18V9l4-7c2 0 2.5 1.5 2 3.5L12.5 8H17c1.2 0 2 1 1.8 2.2l-1.3 6.3c-.2 1-1 1.5-2 1.5z'/></svg>`),
  comment: enc(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><path d='M10 2c4.7 0 8 3 8 7s-3.3 7-8 7c-1 0-2-.1-2.8-.4L3 18l1-3.6C2.7 13 2 11.2 2 9c0-4 3.3-7 8-7z'/></svg>`),
  share: enc(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><path d='M11 3l8 7-8 7v-4c-5 0-8 1.5-10 5 .5-6 3.5-10 10-11z'/></svg>`),
};
const reactLike = enc(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 18 18'><circle cx='9' cy='9' r='9' fill='#1877f2'/><path d='M5 8h2v5H5zM8 13V8l2.5-4c1 0 1.3.8 1 2l-.3 1.5h2.3c.6 0 1 .5.9 1.1l-.6 3.3c-.1.5-.5.8-1 .8z' fill='#fff'/></svg>`);
const reactLove = enc(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 18 18'><circle cx='9' cy='9' r='9' fill='#f33e58'/><path d='M9 13.5 4.8 9.4C3.6 8.2 4.3 5.8 6.3 5.8c1.1 0 1.9.7 2.7 1.6.8-.9 1.6-1.6 2.7-1.6 2 0 2.7 2.4 1.5 3.6z' fill='#fff'/></svg>`);

let uid = 0;
const nextId = (p = "_r_") => `${p}${(++uid).toString(36)}_`;
const CFT = "AZY8zp3dwI2jcFt1xich_5gal3yIH1HqVm-imhRidTMuZeobm8tFfMYzeXNWf2hYEwJ8oreyvhf7xDvAGEJjGMEWKdAIXKr9qK";
const LONG_CFT = CFT + "Xq4p41fPK2ogrek0Ho0ayTvLjB3gU6oW0KNZS7PJ_O_IhlvQA3LgKMRWlrhVQzpXoWIQLIGdN8FrvUkzroKlU8Pkctf99W6cGyamnmqWxDoNglHbxVcPzMR66mZRLiqPfNBKPBtFDXUA5wLA95JsGz63I3e6oC4ADXNm1LY0m1mHFyAONdoobbARzc84Vz_iRtkE";
const cft = (tn) => `?__cft__[0]=${CFT}${tn ? `&amp;__tn__=${tn}` : ""}`;
const defs = []; // <use> chain targets, appended at the end of <body>

const honeypots = (n) =>
  Array.from({ length: n }, () =>
    `<div aria-hidden="true" data-0="0" class="fx-honeypot"><blockquote><span dir="auto"><span>Facebook</span></span></blockquote><div aria-hidden="true" role="button" tabindex="-1"></div></div>`,
  ).join("\n              ");

/** A label drawn as an SVG <use> chain about 7 deep ending in a <text> (2026-10). */
function useChain(text) {
  const ids = Array.from({ length: 7 }, () => nextId("SvgT"));
  for (let i = 0; i < ids.length - 1; i++) defs.push(`<svg id="${ids[i]}"><use href="#${ids[i + 1]}"></use></svg>`);
  defs.push(`<text id="${ids[ids.length - 1]}" x="0" y="12">${text}</text>`);
  return `<svg class="fx-uselabel" width="96" height="16"><use href="#${ids[0]}"></use></svg>`;
}

/** One character per span, shuffled in the DOM and put back in order with CSS `order`, plus absolutely
 * placed decoy letters and U+034F after each real letter when `joiner` (2026-03 .. 2026-10). */
function shuffled(text, decoys = "", { joiner = false } = {}) {
  const real = [...text].map((ch, i) => ({ ch: ch === " " ? "&nbsp;" : ch + (joiner ? "͏" : ""), order: i + 1 }));
  const fake = [...decoys].map((ch) => ({ ch, decoy: true }));
  const all = [...real, ...fake];
  // deterministic shuffle
  let seed = text.length * 31 + decoys.length;
  for (let i = all.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const j = seed % (i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }
  const spans = all.map((g) => (g.decoy ? `<span style="position: absolute; top: 3em;">${g.ch}</span>` : `<span class="fx-o${g.order}">${g.ch}</span>`));
  return `<span class="fx-glyphs" style="display: flex;">${spans.join("")}</span>`;
}

function svgAvatar(name, bg, size = 40, { shape = "circle", role = "img" } = {}) {
  const m = nextId();
  const shapeEl = shape === "rect" ? `<rect width="${size}" height="${size}" rx="8" fill="white"></rect>` : `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"></circle>`;
  const labelled = role === "img" ? `aria-label="${name}" role="img"` : `aria-hidden="true" role="none"`;
  return `<svg ${labelled} data-visualcompletion="ignore-dynamic" style="height: ${size}px; width: ${size}px;"><mask id="${m}">${shapeEl}</mask><g mask="url(#${m})"><image x="0" y="0" height="100%" width="100%" preserveAspectRatio="xMidYMid slice" xlink:href="${avatarImg(bg)}" style="height: ${size}px; width: ${size}px;"></image><circle class="fx-ring" cx="${size / 2}" cy="${size / 2}" r="${size / 2}"></circle></g></svg>`;
}

const audience = (title) =>
  `<span><svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" role="img" class="fx-audience"><title>${title}</title><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"></circle><path d="M2 8h12M8 1.5c2 2 2 11 0 13M8 1.5c-2 2-2 11 0 13" fill="none" stroke="currentColor" stroke-width="1.2"></path></svg></span>`;
const dot = `<span><span aria-hidden="true"> · </span></span>`;

/** Header of a post: avatar link, profile_name heading, byline, "…" menu and the X hide link. */
function header({ name, slug, bg, heading = "h4", nameExtra = "", byline, menu, hide, avatar, line2Prefix = "" }) {
  const avatarHtml =
    avatar ??
    `<a aria-label="${name}" role="link" tabindex="0" href="https://www.facebook.com/${slug}${cft("%3C%3C%2CP-R")}"><div class="fx-avatar">${svgAvatar(name, bg)}</div></a>`;
  return `<div class="fx-header">
                <div class="fx-avatar-col"><span>${avatarHtml}</span></div>
                <div class="fx-hcol">
                  <div><span dir="ltr" class="fx-name-line"><div data-ad-rendering-role="profile_name"><${heading} class="fx-name"><span><span><span><a role="link" tabindex="0" href="https://www.facebook.com/${slug}${cft("-UC%2CP-R")}"><b><span>${name}</span></b></a></span></span>${nameExtra}</span></${heading}></div></span></div>
                  <div><span dir="ltr" class="fx-byline">${line2Prefix}<div class="fx-inline"><span><span>${byline}</span></span></div>${dot}${audience("Shared with Public")}</span></div>
                </div>
                <div class="fx-menu"><div aria-expanded="false" aria-haspopup="menu" aria-label="${menu}" role="button" tabindex="0"><svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor"><circle cx="4" cy="10" r="2"></circle><circle cx="10" cy="10" r="2"></circle><circle cx="16" cy="10" r="2"></circle></svg></div></div>
                <div class="fx-hide"><a aria-label="${hide}" href="#" role="link" tabindex="0"><svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2"></path></svg></a></div>
              </div>`;
}

/** Byline link forms: 2026-03 shuffled spans with aria-labelledby, 2026-10 SVG <use> chain. */
const bylineShuffled = (href, text, decoys, opts) =>
  `<a href="${href}" target="_blank" role="link" tabindex="0"><span><span aria-labelledby="${nextId()}" class="fx-label">${shuffled(text, decoys, opts)}</span></span></a>`;
const bylineUse = (href, text) => `<a href="${href}" role="link" tabindex="0">⁠<span aria-labelledby="${nextId()}">${useChain(text)}</span></a>`;

const message = (text) =>
  `<div class="fx-body"><div dir="auto"><div data-ad-rendering-role="story_message"><div data-ad-comet-preview="message" data-ad-preview="message"><div><div><span dir="auto"><div><div dir="auto" style="text-align: start;">${text}</div></div></span></div></div></div></div></div></div>`;

const photo = (alt, sky, sand) =>
  `<div class="fx-attach"><div><a href="https://www.facebook.com/photo/?fbid=1222729806&amp;set=a.1221095876&amp;__cft__[0]=${CFT}&amp;__tn__=EH-y-R" role="link" tabindex="0"><div style="padding-top: 62.5%; position: relative;"><img data-imgperflogname="feedImage" alt="${alt}" src="${photoImg(sky, sand)}" width="512" height="320" class="fx-img"></div></a></div></div>`;

/** Every organic post in the 2026-10 captures carries a visually hidden link card with a "Learn More" CTA. */
const decoyCard = (domain) =>
  `<div class="fx-decoy"><a href="?__cft__[0]=${CFT}" rel="nofollow noreferrer" target="_blank" role="link" tabindex="0"><div data-ad-rendering-role="meta"><span>${domain}</span></div><span data-ad-rendering-role="title"><span dir="auto">Xxxx Xxxxx</span></span><span data-ad-rendering-role="description">Xxxxxxx</span><div data-ad-rendering-role="cta-"><object><a href="https://l.facebook.com/l.php?u=https%3A%2F%2F${domain}%2F&amp;__tn__=%2CmH-y-R#?gfk" role="link" tabindex="0">Learn More</a></object></div></a></div>`;

const linkCard = (domain, title, cta) =>
  `<div class="fx-attach"><a aria-labelledby="${nextId()}" href="https://l.facebook.com/l.php?u=https%3A%2F%2F${domain}%2Fa" rel="nofollow noreferrer" target="_blank" role="link" tabindex="0" class="fx-linkcard"><img src="${photoImg("#d7e3f4", "#9fb3d1")}" alt="" class="fx-lc-img" data-ad-rendering-role="image"><div class="fx-lc-text"><div data-ad-rendering-role="meta"><span>${domain.toUpperCase()}</span></div><span data-ad-rendering-role="title"><span dir="auto">${title}</span></span></div><div data-ad-rendering-role="cta-" class="fx-cta"><object><a href="https://l.facebook.com/l.php?u=https%3A%2F%2F${domain}%2Fa" role="link" tabindex="0">${cta}</a></object></div></a></div>`;

const video = (label) =>
  `<div class="fx-attach"><div aria-label="${label}" role="group" class="fx-video"><div aria-label="Play video" role="button" tabindex="0" class="fx-play"></div><div class="fx-time">0:00 / 0:30</div></div></div>`;

function actionButton({ aria, role, icon, text }) {
  return `<div aria-label="${aria}" role="button" tabindex="0" class="fx-btn"><div class="fx-btn-in"><div class="fx-btn-icon"><span><i data-visualcompletion="css-img" class="fx-ico" style="background-image: url(&quot;${glyph[icon]}&quot;);"></i></span><div data-ad-rendering-role="${role}"></div></div><div><span dir="auto"><span>${text}</span></span></div></div><div role="none" data-visualcompletion="ignore" class="fx-overlay"></div></div>`;
}

const toolbar = (L, likes) =>
  `<span aria-label="${L.reactedTo}" role="toolbar" class="fx-toolbar"><span><div aria-label="${L.likeWord}: ${likes} people" role="button" tabindex="0"><img height="18" width="18" role="presentation" src="${reactLike}"></div></span><span><div aria-label="Love: 3 people" role="button" tabindex="0"><img height="18" width="18" role="presentation" src="${reactLove}"></div></span><span class="fx-count">${likes + 3}</span></span>`;

/** Footer layout A (summary row above word buttons) or B (counts inside the buttons, toolbar after). */
function footer(L, { layout = "A", likes = 12, comments = 0, shares = 0 } = {}) {
  const react = `<div aria-label="${L.react}" role="button" tabindex="0" class="fx-react"><svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M4 6l4 4 4-4"></path></svg></div>`;
  const words = layout === "A" ? [L.likeWord, L.commentWord, L.shareWord] : [String(likes), String(comments), String(shares)];
  const buttons = [
    `<div class="fx-act">${actionButton({ aria: L.likeAria, role: "like_button", icon: "like", text: words[0] })}${react}</div>`,
    `<div class="fx-act">${actionButton({ aria: L.commentAria, role: "comment_button", icon: "comment", text: words[1] })}</div>`,
    `<div class="fx-act">${actionButton({ aria: L.shareAria, role: "share_button", icon: "share", text: words[2] })}</div>`,
  ];
  if (layout === "A") {
    const summary = `<div class="fx-summary">${toolbar(L, likes)}<div role="button" tabindex="0" class="fx-sum-right"><span dir="auto"><span>${comments ? L.comments(comments) : ""}</span></span></div></div>`;
    return `<div data-visualcompletion="ignore-dynamic" class="fx-footer">${summary}<div class="fx-actions">${buttons.join("")}</div></div>`;
  }
  return `<div data-visualcompletion="ignore-dynamic" class="fx-footer"><div class="fx-actions">${buttons.join("")}<div class="fx-act fx-toolbar-wrap">${toolbar(L, likes)}</div></div></div>`;
}

function comment(L, { name, bg, text, age }) {
  return `<div><div aria-label="${L.commentBy} ${name} ${age}" role="article" tabindex="-1" class="fx-comment"><div class="fx-c-avatar"><a aria-hidden="true" href="https://www.facebook.com/profile.php?id=5001" role="link" tabindex="-1">${svgAvatar(name, bg, 32)}</a></div><div class="fx-c-main"><div class="fx-bubble"><span class="fx-c-name"><a href="https://www.facebook.com/profile.php?id=5001&amp;comment_id=9" role="link" tabindex="0"><span>${name}</span></a></span><div dir="auto">${text}</div></div><ul class="fx-c-actions"><li><div role="button" tabindex="0">${L.likeWord}</div></li><li><div role="button" tabindex="0">${L.reply}</div></li><li><a href="https://www.facebook.com/x/posts/1?comment_id=9" role="link">${age}</a></li></ul></div></div></div>`;
}

function composer(L, bg) {
  return `<div class="fx-composer-row"><div class="fx-c-avatar">${svgAvatar("You", bg, 32)}</div><form role="presentation" class="fx-form"><div class="fx-input"><div aria-label="${L.writeComment}" role="textbox" contenteditable="true" data-lexical-editor="true" class="fx-textbox" spellcheck="true"><p><br></p></div><div class="fx-placeholder" aria-hidden="true">${L.writeComment}</div></div></form></div>`;
}

function card(inner) {
  return `<div class="fx-card" style="border-radius: max(0px, min(var(--card-corner-radius), calc((100vw - 4px - 100%) * 9999))) / var(--card-corner-radius);"><div class="fx-post">
              ${honeypots(3)}
              ${inner}
            </div></div>`;
}

let pos = 0;
function unit(fixture, expect, inner, { virtualized = false } = {}) {
  pos++;
  const content = virtualized ? `<div data-virtualized="true"><div hidden=""></div></div>` : `<div data-virtualized="false"><div>${inner}</div></div>`;
  return `
    <div class="fx-slot">
      <div><span><div><div>
        <div aria-posinset="${pos}" data-fixture="${fixture}" data-expect="${expect}">
          <div>
            ${content}
          </div>
        </div>
      </div></div></span></div>
    </div>`;
}

function post(L, { name, slug, bg, byline, body = "", footerOpts, comments = [], heading, nameExtra, avatar, line2Prefix, withComposer = false }) {
  const hdr = header({ name, slug, bg, byline, menu: L.menu, hide: L.hide, heading, nameExtra, avatar, line2Prefix });
  const tail = comments.length || withComposer ? `<div class="fx-comments">${comments.map((c) => comment(L, c)).join("")}</div>${withComposer ? composer(L, "#8b9dc3") : ""}` : "";
  return card(`${hdr}\n              ${body}\n              <div class="fx-footer-wrap">${footer(L, footerOpts)}${tail}</div>`);
}

const followButton = (word, name) =>
  `<span class="fx-follow"><span><span>&nbsp;</span><span aria-hidden="true"> · </span></span><div aria-label="${word} ${name}" role="button" tabindex="0"><span>${word}</span></div></span>`;

function reelsPanel(L, title, n = 4) {
  const cells = Array.from({ length: n }, (_, i) =>
    `<div role="gridcell" tabindex="0" class="fx-reel-cell"><a aria-label="Reel by Creator ${i + 1}" href="https://www.facebook.com/reel/20000${i}/" role="link" tabindex="0"><img src="${photoImg(["#f5a3a3", "#a3c8f5", "#c7f5a3", "#f5e3a3"][i % 4], "#333")}" alt=""><div aria-label="Menu" role="button" tabindex="0" class="fx-reel-menu"></div></a></div>`,
  ).join("");
  return card(`<div class="fx-panel"><div class="fx-panel-head"><h3 dir="auto" class="fx-h3">${title}</h3><div aria-expanded="false" aria-haspopup="menu" aria-label="${L.menu}" role="button" tabindex="0" class="fx-menu"></div></div><div aria-label="${title}" role="grid" class="fx-grid"><div role="row">${cells}</div></div></div>`);
}

function pymkPanel(L, title) {
  const people = [["Ines Sombra", "#c58b8b"], ["John Odom", "#8bc5a0"], ["Nicole Goldkamp", "#b08bc5"]];
  const cells = people
    .map(([n, bg], i) => `<div role="gridcell" class="fx-person"><a aria-hidden="true" href="https://www.facebook.com/friends/suggestions/?profile_id=30000${i}" tabindex="-1"><img src="${avatarImg(bg)}" alt="" class="fx-person-img"></a><a href="https://www.facebook.com/profile.php?id=30000${i}" role="link" tabindex="0"><span dir="auto">${n}</span></a><div aria-label="${L.addFriend}" role="button" tabindex="0" class="fx-pbtn"><span>${L.addFriend}</span></div></div>`)
    .join("");
  return card(`<div class="fx-panel"><div class="fx-panel-head"><h3 dir="auto" class="fx-h3">${title}</h3><div aria-expanded="false" aria-haspopup="menu" aria-label="${L.menu}" role="button" tabindex="0" class="fx-menu"></div></div><div aria-label="${title}" role="region"><div role="grid" class="fx-grid"><div role="row">${cells}</div></div></div></div>`);
}

function groupSuggestionsPanel(L, title) {
  const groups = [["Garden World", "500001"], ["Mafia Wars Players", "500002"]];
  const cells = groups
    .map(([n, id]) => `<div class="fx-person"><a href="https://www.facebook.com/groups/${id}/" role="link" tabindex="0"><img src="${photoImg("#cde", "#9ab")}" alt="" class="fx-person-img"><span dir="auto">${n}</span></a><div role="button" tabindex="0" class="fx-pbtn"><span>${L.joinGroup}</span></div></div>`)
    .join("");
  return card(`<div class="fx-panel"><div class="fx-panel-head"><span dir="auto" class="fx-h3">${title}</span></div><div class="fx-grid">${cells}</div><a href="https://www.facebook.com/groups/discover/" role="link" tabindex="0">${L.seeAll}</a></div>`);
}

function metaAIUnit() {
  return card(`<div class="fx-panel fx-metaai"><a aria-label="Visit Meta AI" href="https://www.meta.ai/" role="link" tabindex="0" class="fx-metaai-logo"></a><span dir="auto">Ask Meta AI anything</span><div role="button" tabindex="0" class="fx-pbtn"><span>Ask Meta AI</span></div></div>`);
}

const skeleton = () =>
  `<div class="fx-card fx-skel"><div aria-label="Loading..." role="status"><div aria-valuemax="100" aria-valuemin="0" aria-valuetext="Loading..." role="progressbar" tabindex="-1" class="fx-glimmer"></div><div class="fx-glimmer fx-glimmer-2"></div></div></div>`;

function storiesTray(L) {
  const cells = ["#a3c8f5", "#f5a3a3", "#c7f5a3"].map((c, i) => `<div role="gridcell" class="fx-story"><a href="${i ? `https://www.facebook.com/stories/10000${i}/` : "https://www.facebook.com/stories/create/"}" role="link" tabindex="0"><img src="${photoImg(c, "#555")}" alt=""></a></div>`).join("");
  return `<div aria-label="${L.stories}" role="region" class="fx-card fx-stories-region"><h3 class="fx-sr">${L.stories}</h3><div data-virtualized="false"><div><div role="region" data-focus-target="stories_tray" class="fx-stories"><div aria-label="stories tray" role="grid"><div role="row">${cells}</div></div></div></div></div></div>`;
}

const CSS = `
html { background: var(--web-wash); }
body { margin: 0; background: var(--web-wash); color: var(--primary-text); font-family: var(--body-font-family), "Liberation Sans", Arial, sans-serif; font-size: var(--body-font-size); line-height: var(--body-line-height); }
a { color: inherit; text-decoration: none; }
h3, h4, h5 { margin: 0; font-weight: inherit; font-size: inherit; }
ul { margin: 0; padding: 0; list-style: none; }
.fx-sr, .fx-honeypot, .fx-decoy { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.fx-main { width: 520px; margin: 0 auto; padding: 16px 0; }
.fx-card { background: var(--card-background); box-shadow: var(--card-box-shadow); overflow: hidden; margin-bottom: 16px; }
.fx-slot { margin: 0; }
.fx-composer { display: flex; align-items: center; gap: 8px; padding: 12px 16px; }
.fx-composer-btn { flex: 1; background: var(--search-input-background); border-radius: 20px; padding: 9px 12px; color: var(--secondary-text); font-size: var(--body-large-font-size); }
.fx-stories { min-height: 160px; padding: 12px 16px; }
.fx-stories [role=row], .fx-grid [role=row] { display: flex; gap: 8px; }
.fx-story img { width: 110px; height: 190px; border-radius: var(--media-corner-radius); object-fit: cover; display: block; }
.fx-header { display: flex; align-items: flex-start; gap: 8px; padding: 12px 12px 0; }
.fx-avatar-col a { display: block; }
.fx-ring { fill: none; stroke: var(--media-inner-border); stroke-width: 2; }
.fx-hcol { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; padding-top: 2px; }
.fx-name { font-size: var(--body-emphasized-font-size); font-weight: var(--body-emphasized-font-weight); line-height: var(--body-emphasized-line-height); }
.fx-name b { font-weight: inherit; }
.fx-follow div[role=button], .fx-name div[role=button] { display: inline; color: var(--blue-link); }
.fx-byline { display: flex; align-items: center; gap: 0; font-size: var(--meta-font-size); line-height: var(--meta-line-height); color: var(--secondary-text); }
.fx-inline { display: inline-flex; }
.fx-label { position: relative; display: inline-flex; overflow: hidden; vertical-align: top; }
.fx-uselabel { fill: currentColor; font-size: 12px; vertical-align: top; }
.fx-audience { margin-left: 2px; vertical-align: -2px; }
.fx-menu, .fx-hide { color: var(--secondary-icon); padding: 4px; }
.fx-menu [role=button], .fx-hide a { display: block; width: 20px; height: 20px; border-radius: 50%; }
.fx-body { padding: 4px 12px 12px; font-size: var(--body-font-size); line-height: var(--body-line-height); }
.fx-attach img.fx-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.fx-linkcard { display: block; background: var(--card-background-filled); position: relative; }
.fx-lc-img { display: block; width: 100%; height: 180px; object-fit: cover; }
.fx-lc-text { padding: 10px 16px; padding-right: 110px; }
.fx-lc-text [data-ad-rendering-role=meta] { color: var(--secondary-text); font-size: var(--meta-font-size); }
.fx-lc-text [data-ad-rendering-role=title] { font-weight: 600; }
.fx-cta { position: absolute; right: 16px; bottom: 12px; }
.fx-cta a { display: block; background: var(--secondary-button-background-floating); border: 1px solid var(--secondary-button-stroke); border-radius: var(--button-corner-radius-medium); padding: 6px 12px; font-weight: 600; }
.fx-video { height: 220px; background: #111; position: relative; color: #fff; }
.fx-play { position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px; border-radius: 50%; background: rgba(255,255,255,.85); }
.fx-time { position: absolute; left: 12px; bottom: 8px; font-size: 12px; }
/* Live 2026-10 layout rects (HushFacebookWeb organic-posts): the header and the message text are inset 12px; the action
   row (first button at 4px), the comments and the comment box span the card and inset only their contents. */
.fx-footer-wrap { padding: 0; }
.fx-summary { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; color: var(--secondary-text); font-size: var(--meta-font-size); }
.fx-toolbar { display: inline-flex; align-items: center; gap: 0; }
.fx-toolbar img { display: block; }
.fx-count { margin-left: 6px; }
.fx-actions { display: flex; border-top: 1px solid var(--divider); padding: 4px; }
.fx-act { flex: 1; display: flex; justify-content: center; align-items: center; }
.fx-toolbar-wrap { flex: 0 0 auto; padding-left: 8px; color: var(--secondary-text); font-size: var(--meta-font-size); }
.fx-btn { position: relative; display: flex; justify-content: center; border-radius: var(--button-corner-radius-medium); padding: 6px 12px; color: var(--secondary-text); font-size: var(--primary-label-font-size); font-weight: 600; }
.fx-btn-in { display: flex; align-items: center; gap: 6px; }
.fx-btn-icon { display: flex; }
.fx-ico { display: inline-block; width: 20px; height: 20px; background-size: 20px 20px; filter: var(--filter-secondary-icon); }
.fx-react { width: 16px; height: 16px; color: var(--secondary-icon); }
.fx-overlay { position: absolute; inset: 0; border-radius: inherit; }
.fx-comments { padding: 4px 12px 0; }
.fx-comment { display: flex; gap: 6px; padding: 4px 0; }
.fx-c-avatar a, .fx-c-avatar svg { display: block; }
.fx-c-main { min-width: 0; }
.fx-bubble { display: inline-block; background: var(--comment-background); border-radius: var(--comment-bubble); padding: 8px 12px; font-size: var(--body-small-font-size); line-height: var(--body-small-line-height); }
.fx-c-name { font-weight: 600; font-size: var(--meta-emphasized-font-size); }
.fx-c-actions { display: flex; gap: 12px; padding: 2px 12px; font-size: var(--meta-font-size); color: var(--secondary-text); font-weight: 600; }
.fx-composer-row { display: flex; gap: 6px; padding: 4px 12px 12px; }
.fx-form { flex: 1; }
.fx-input { position: relative; background: var(--comment-background); border-radius: var(--comment-bubble); padding: 8px 12px; font-size: var(--body-small-font-size); }
.fx-textbox { outline: none; min-height: 16px; }
.fx-textbox p { margin: 0; }
.fx-placeholder { position: absolute; left: 12px; top: 8px; color: var(--placeholder-text); pointer-events: none; }
.fx-panel { padding: 12px 16px; }
.fx-panel-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.fx-h3 { font-size: var(--headline3-font-size); font-weight: 600; }
.fx-reel-cell img { width: 110px; height: 190px; object-fit: cover; border-radius: var(--media-corner-radius); display: block; }
.fx-person { width: 150px; border: 1px solid var(--divider); border-radius: var(--card-corner-radius); overflow: hidden; display: flex; flex-direction: column; gap: 6px; padding-bottom: 8px; text-align: center; }
.fx-person-img { width: 100%; height: 120px; object-fit: cover; display: block; }
.fx-pbtn { margin: 0 8px; background: var(--primary-deemphasized-button-background); color: var(--primary-deemphasized-button-text); border-radius: var(--button-corner-radius-medium); padding: 6px; font-weight: 600; }
.fx-metaai { display: flex; gap: 10px; align-items: center; }
.fx-metaai-logo { width: 36px; height: 36px; border-radius: 50%; background: conic-gradient(#3b82f6, #a855f7, #ec4899, #3b82f6); }
.fx-skel { padding: 16px; }
.fx-glimmer { height: 12px; background: var(--placeholder-image); border-radius: var(--glimmer-corner-radius); margin-bottom: 8px; width: 60%; }
.fx-glimmer-2 { width: 85%; }
.fx-loader { height: 1500px; }
${Array.from({ length: 60 }, (_, i) => `.fx-o${i + 1} { order: ${i + 1}; }`).join(" ")}
`;

function page(L, units, { lang }) {
  const html = `<!doctype html>
<!-- MFGA native fixture: Facebook's 2026 desktop feed, rebuilt from the skeletons in docs/research/dom-feed.md §2.1/§3.1.
     Generated by build-fixtures.mjs; the fx-* classes only emulate Facebook's look and are never used by MFGA. data-fixture/data-expect
     name each unit and its expected verdict for test/e2e/native.test.mjs. -->
<html id="facebook" class="__fb-light-mode" lang="${lang}" dir="ltr">
<head>
<meta charset="utf-8">
<title>Facebook</title>
<style id="fb-vars">/*FB_VARS*/</style>
<style id="fb-components">${CSS}</style>
</head>
<body>
<div id="mount_0_0_Fx">
  <div role="main" class="fx-main">
    <div>
      <h1 class="fx-sr">${L.home}</h1>
      <div></div>
      <div role="region" aria-label="${L.createPost}" class="fx-card fx-composer"><a aria-label="${L.timeline}" href="https://www.facebook.com/me" role="link" tabindex="0">${svgAvatar("You", "#8b9dc3")}</a><div role="button" tabindex="0" class="fx-composer-btn">${L.woym}</div></div>
      ${storiesTray(L)}
      <div class="fx-feed">
        <h3 class="fx-sr">${L.feedPosts}</h3>
        <div aria-hidden="true"></div>
        <div id="feed-list">${units.join("")}
        </div>
      </div>
      <div class="fx-loader" id="fx-loader"><div role="progressbar" aria-label="Loading..." class="fx-glimmer"></div></div>
    </div>
  </div>
</div>
<div hidden="" id="fx-svg-defs"><svg width="0" height="0">${defs.join("")}</svg></div>
</body>
</html>
`;
  return html;
}

const EN = {
  home: "Home", createPost: "Create a post", timeline: "Your timeline", woym: "What's on your mind, Jay?", feedPosts: "Feed posts",
  stories: "Stories", menu: "Actions for this post", hide: "hide post", react: "React", likeWord: "Like", commentWord: "Comment",
  shareWord: "Share", likeAria: "Like", commentAria: "Leave a comment", shareAria: "Send this to friends or post it on your profile.",
  reactedTo: "See who reacted to this", comments: (n) => `${n} comments`, commentBy: "Comment by", reply: "Reply",
  writeComment: "Write a comment…", addFriend: "Add friend", joinGroup: "Join group", seeAll: "See all",
};
const PL = {
  home: "Strona główna", createPost: "Utwórz post", timeline: "Oś czasu", woym: "O czym myślisz, Jan?", feedPosts: "Posty w Aktualnościach",
  stories: "Relacje", menu: "Działania dla tego posta", hide: "ukryj post", react: "Zareaguj", likeWord: "Lubię to!", commentWord: "Komentarz",
  shareWord: "Udostępnij", likeAria: "Lubię to!", commentAria: "Dodaj komentarz", shareAria: "Wyślij do znajomych lub opublikuj w Twoim profilu.",
  reactedTo: "Zobacz, kto zareagował", comments: (n) => `${n} komentarze`, commentBy: "Komentarz", reply: "Odpowiedz",
  writeComment: "Napisz komentarz…", addFriend: "Dodaj znajomego", joinGroup: "Dołącz do grupy", seeAll: "Zobacz wszystkie",
};

function buildEN() {
  pos = 0; defs.length = 0; uid = 0;
  const L = EN;
  const units = [
    unit("organic-photo", "keep", post(L, {
      name: "Samantha Hodges", slug: "samantha.hodges", bg: "#6d84b4",
      byline: bylineShuffled(`?__cft__[0]=${CFT}&amp;__tn__=%2CO%2CP-R#?efh`, "26 minutes ago", "Sponsored13047"),
      body: `${message("had a great lunch, but an even better conversation with J.D. (at lunch) today. By the way, chocolate lava cake is a must when you're in Hawaii!")}\n              ${photo("May be an image of the beach")}`,
      footerOpts: { layout: "A", likes: 2, comments: 2 },
      comments: [
        { name: "Amy Winstead", bg: "#c58b8b", text: "oh, go ahead and \"gush!\" about the cake... (teehee...)", age: "14m" },
        { name: "Samantha Hodges", bg: "#6d84b4", text: "Ha Ha!", age: "12m" },
      ],
      withComposer: true,
    })),
    unit("organic-decoy-card", "keep", post(L, {
      name: "Rachel Wise", slug: "rachel.wise", bg: "#8bc5a0",
      byline: bylineUse("https://www.facebook.com/", "9 hours ago"),
      body: `${message("RIP Belle-sweet dog till the end")}\n              ${decoyCard("iBgTWMHI9.com")}`,
      footerOpts: { layout: "B", likes: 47, comments: 5, shares: 2 },
      comments: [{ name: "Jessica Kohler", bg: "#b08bc5", text: "I'm so happy I got to meet her :hugs:", age: "5h" }],
    })),
    unit("sponsored-cft-use", "hide:sponsored", post(L, {
      name: "Run Further", slug: "runfurther", bg: "#e0a050",
      avatar: `<a aria-label="Run Further, view story" href="/stories/122108995904220981/?view_single=false&amp;__cft__[0]=${CFT}" role="link" tabindex="0"><div class="fx-avatar">${svgAvatar("Run Further, view story", "#e0a050")}</div></a>`,
      byline: `<a href="?__cft__[0]=${LONG_CFT}" target="_blank" role="link" tabindex="0">⁠<span>${useChain("Sponsored")}</span></a>`,
      body: `${message("Our lightest trail shoe yet. Free shipping this week only.")}\n              ${video("Video player")}\n              ${linkCard("runfurther.example", "Run Further Trail 3", "Shop now")}`,
      footerOpts: { layout: "B", likes: 310, comments: 12, shares: 9 },
    })),
    unit("sponsored-shuffled-ad", "hide:sponsored", post(L, {
      name: "Cloud Storage Co", slug: "cloudstorage", bg: "#50a0e0",
      byline: bylineShuffled("https://www.facebook.com/", "Ad", "1hJs", { joiner: true }),
      body: `${message("Back up every photo you have ever taken. Try it free for 30 days.")}\n              ${linkCard("cloud.example", "2 TB for the price of 1", "Learn More")}`,
      footerOpts: { layout: "B", likes: 88, comments: 4, shares: 1 },
    })),
    unit("sponsored-labelledby", "hide:sponsored", post(L, {
      name: "Garden Supplies", slug: "gardensupplies", bg: "#60b060",
      byline: `<a href="https://www.facebook.com/" role="link" tabindex="0"><span><span aria-labelledby="_r_lbl1_"></span></span></a>`,
      body: message("Spring bulbs are here. Plant now, bloom in April."),
      footerOpts: { layout: "A", likes: 21 },
    })),
    unit("sponsored-ads-about", "hide:sponsored", post(L, {
      name: "Holiday Deals", slug: "holidaydeals", bg: "#d06080",
      byline: bylineUse("https://www.facebook.com/", "2 hours ago"),
      body: `${message("Last-minute flights to the sun.")}\n              <div class="fx-attach"><a href="https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.facebook.com%2Fads%2Fabout%2F%3Fentry_product%3Dad_preferences" role="link" tabindex="0" class="fx-sr">Why am I seeing this ad?</a></div>`,
      footerOpts: { layout: "A", likes: 5 },
    })),
    unit("suggested-follow", "hide:suggested", post(L, {
      name: "Proton", slug: "proton", bg: "#6d4aff",
      nameExtra: followButton("Follow", "Proton"),
      byline: bylineUse(`?__cft__[0]=${CFT}&amp;__tn__=%2CO%2CP-R`, "7h"),
      body: message("Your inbox, encrypted. Read our new privacy report."),
      footerOpts: { layout: "B", likes: 1200, comments: 80, shares: 40 },
    })),
    unit("group-join", "hide:group-suggestions", card(`${header({
      name: "Garden World", slug: "groups/100002/", bg: "#9ab",
      avatar: `<a aria-label="Garden World" href="https://www.facebook.com/groups/100002/${cft("%3C%3C%2CP-R")}" role="link" tabindex="0"><div class="fx-avatar">${svgAvatar("Garden World", "#9ab", 40, { shape: "rect", role: "none" })}</div></a>`,
      nameExtra: `<span dir="ltr">${followButton("Join", "Garden World").replace(/aria-label="[^"]*" /, "")}</span>`,
      line2Prefix: `<span><a href="https://www.facebook.com/groups/100002/user/100003/" role="link" tabindex="0"><span>Sami Mks</span></a></span>${dot}`,
      byline: bylineUse("https://www.facebook.com/", "3h"),
      menu: L.menu, hide: L.hide,
    })}
              ${message("First tomatoes of the season!")}
              <div class="fx-footer-wrap">${footer(L, { layout: "B", likes: 64, comments: 7, shares: 0 })}</div>`)),
    unit("shared-reel", "keep", post(L, {
      name: "Blake Segafredo", slug: "blake.segafredo", bg: "#c5b08b",
      byline: bylineUse(`?__cft__[0]=${CFT}&amp;__tn__=%2CO%2CP-R`, "2 hours ago"),
      body: `${message("this made my day")}\n              <div class="fx-attach"><a aria-label="Open reel in Reels Viewer" href="https://www.facebook.com/reel/100000/" role="link" tabindex="0" class="fx-reel">${video("Video player").replace('class="fx-attach"', "")}<div class="fx-reel-overlay"><span dir="auto">Sunset timelapse #nofilter</span><object><a aria-label="See owner profile" href="https://www.facebook.com/profile.php?id=100001" role="link" tabindex="0">${svgAvatar("Travel Creator", "#f0a000", 24)}</a></object><h5 dir="auto"><span dir="auto"><object><a href="https://www.facebook.com/profile.php?id=100001" role="link" tabindex="0">Travel Creator</a></object></span>${followButton("Follow", "Travel Creator")}</h5></div></a></div>`,
      footerOpts: { layout: "A", likes: 9, comments: 1 },
    })),
    unit("reels-panel", "hide:reels", reelsPanel(L, "Reels")),
    unit("pymk-panel", "hide:pymk", pymkPanel(L, "People you may know")),
    unit("group-suggestions-panel", "hide:group-suggestions", groupSuggestionsPanel(L, "Your group suggestions")),
    unit("meta-ai", "hide:meta-ai", metaAIUnit()),
    unit("skeleton", "keep", skeleton()),
    unit("virtualized", "keep", "", { virtualized: true }),
    unit("organic-plain", "keep", post(L, {
      name: "Nicole Goldkamp", slug: "nicole.goldkamp", bg: "#b08bc5",
      byline: bylineShuffled(`?__cft__[0]=${CFT}&amp;__tn__=%2CO%2CP-R`, "Yesterday at 9:12 PM", "Adx"),
      body: message("I see comments about some major change on Facebook. Mine looks the same as it has for the last 6 months."),
      footerOpts: { layout: "A", likes: 3 },
    })),
  ];
  const html = page(L, units, { lang: "en" }).replace("</body>", `<span id="_r_lbl1_" hidden="">Sponsored</span>\n</body>`);
  writeFileSync(`${OUT}feed.html`, html);
}

function buildPL() {
  pos = 0; defs.length = 0; uid = 100;
  const L = PL;
  const units = [
    unit("organic-pl", "keep", post(L, {
      name: "Samanta Nowak", slug: "samanta.nowak", bg: "#6d84b4",
      byline: bylineShuffled(`?__cft__[0]=${CFT}&amp;__tn__=%2CO%2CP-R#?efh`, "4 marca o 17:47", "Sponsorowane"),
      body: `${message("Świetny obiad, a rozmowa jeszcze lepsza!")}\n              ${photo("Może być zdjęciem przedstawiającym plażę")}`,
      footerOpts: { layout: "A", likes: 4, comments: 1 },
      comments: [{ name: "Anna Wiśniewska", bg: "#c58b8b", text: "Zazdroszczę!", age: "2 godz." }],
      withComposer: true,
    })),
    unit("sponsored-pl-use", "hide:sponsored", post(L, {
      name: "Sklep Biegowy", slug: "sklepbiegowy", bg: "#e0a050",
      byline: bylineUse("https://www.facebook.com/", "Sponsorowane"),
      body: message("Nowe buty trailowe. Darmowa dostawa."),
      footerOpts: { layout: "B", likes: 31, comments: 2, shares: 1 },
    })),
    unit("sponsored-pl-reklama", "hide:sponsored", post(L, {
      name: "Chmura Plus", slug: "chmuraplus", bg: "#50a0e0",
      byline: bylineShuffled("https://www.facebook.com/", "Reklama", "3hSq", { joiner: true }),
      body: message("Kopia zapasowa wszystkich zdjęć. 30 dni za darmo."),
      footerOpts: { layout: "B", likes: 12, comments: 0, shares: 0 },
    })),
    unit("suggested-pl-follow", "hide:suggested", post(L, {
      name: "Kuchnia Polska", slug: "kuchniapolska", bg: "#d06080",
      nameExtra: followButton("Obserwuj", "Kuchnia Polska"),
      byline: bylineUse(`?__cft__[0]=${CFT}&amp;__tn__=%2CO%2CP-R`, "7 godz."),
      body: message("Pierogi ruskie: przepis babci."),
      footerOpts: { layout: "A", likes: 900 },
    })),
    unit("group-pl-join", "hide:group-suggestions", card(`${header({
      name: "Gotuj z jolanta", slug: "groups/200002/", bg: "#9ab",
      avatar: `<a aria-label="Gotuj z jolanta" href="https://www.facebook.com/groups/200002/${cft("%3C%3C%2CP-R")}" role="link" tabindex="0"><div class="fx-avatar">${svgAvatar("Gotuj z jolanta", "#9ab", 40, { shape: "rect", role: "none" })}</div></a>`,
      nameExtra: `<span dir="ltr">${followButton("Dołącz", "Gotuj z jolanta").replace(/aria-label="[^"]*" /, "")}</span>`,
      line2Prefix: `<span><a href="https://www.facebook.com/groups/200002/user/200003/" role="link" tabindex="0"><span>Sami Mks</span></a></span>${dot}`,
      byline: bylineShuffled(`?__cft__[0]=${CFT}&amp;__tn__=%2CO%2CP-R`, "3 godz.", "Rekl"),
      menu: L.menu, hide: L.hide,
    })}
              ${message("Sernik na zimno, prosty i szybki.")}
              <div class="fx-footer-wrap">${footer(L, { layout: "A", likes: 40, comments: 1 })}</div>`)),
    unit("reels-pl-panel", "hide:reels", reelsPanel(L, "Rolki")),
    unit("pymk-pl-panel", "hide:pymk", pymkPanel(L, "Osoby, które możesz znać")),
    unit("shared-pl-addfriend", "keep", post(L, {
      name: "Jan Kowalski", slug: "jan.kowalski", bg: "#c5b08b",
      byline: bylineUse(`?__cft__[0]=${CFT}&amp;__tn__=%2CO%2CP-R`, "2 godz."),
      body: `${message("Zobaczcie to!")}\n              <div class="fx-attach"><div class="fx-shared"><a aria-label="Ewa Zielińska" href="https://www.facebook.com/ewa${cft("%3C%3C%2CP-y-R")}" role="link" tabindex="0">${svgAvatar("Ewa Zielińska", "#a0c0e0", 36)}</a><div data-ad-rendering-role="profile_name"><h5><span style="-webkit-line-clamp: 2;"><a href="https://www.facebook.com/ewa${cft("-UC%2CP-y-R")}" role="link" tabindex="0"><b><span>Ewa Zielińska</span></b></a>${followButton("Dodaj znajomego", "Ewa Zielińska")}</span></h5></div><div data-ad-rendering-role="story_message"><div dir="auto">Mój pierwszy maraton!</div></div></div></div>`,
      footerOpts: { layout: "A", likes: 15 },
    })),
    unit("organic-pl-2", "keep", post(L, {
      name: "Rachela Mądra", slug: "rachela.madra", bg: "#8bc5a0",
      byline: bylineShuffled(`?__cft__[0]=${CFT}&amp;__tn__=%2CO%2CP-R`, "Wczoraj o 21:12", "Ad"),
      body: message("Dziękuję wszystkim za życzenia!"),
      footerOpts: { layout: "A", likes: 30, comments: 3 },
    })),
  ];
  writeFileSync(`${OUT}feed-pl.html`, page(L, units, { lang: "pl" }));
}

buildEN();
buildPL();
