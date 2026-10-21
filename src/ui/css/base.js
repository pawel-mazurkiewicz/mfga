// Shared 2010 base styles for everything MFGA renders (every subtree under `.mfga-ui`): typography, links,
// buttons, inputs, sidebar boxes, count pills and badges, notices, menus, tooltips and the loading indicator.
// Values: docs/research/retro-spec-2010.md §1 and §8 ([FB12] = Facebook's 2012 rsrc CSS, [M] = the 2010
// capture). Element resets use :where() so any single-class rule from another area overrides them.

export const FONT_LUCIDA = '"lucida grande", tahoma, verdana, arial, sans-serif';
export const FONT_TAHOMA = 'tahoma, "lucida grande", verdana, arial, sans-serif';

// Components outside a `.mfga-ui` root (none should be, but be safe) still get the 2010 stack.
const FONT = `var(--mfga-font, ${FONT_LUCIDA})`;

/** Base stylesheet. `settings` is accepted for signature uniformity; nothing here depends on it. */
export function baseCss() {
  return [rootCss(), linkCss(), buttonCss(), inputCss(), textCss(), boxCss(), countCss(), messageCss(), menuCss(), tooltipCss(), spinnerCss()].join("\n");
}

function rootCss() {
  return `
.mfga-ui{--mfga-font:${FONT_LUCIDA};font-family:var(--mfga-font);font-size:11px;font-weight:normal;font-style:normal;line-height:1.28;color:#333;text-align:left;direction:ltr;letter-spacing:normal;color-scheme:light;-webkit-text-size-adjust:100%}
html[data-mfga-font="tahoma"] .mfga-ui{--mfga-font:${FONT_TAHOMA}}
.mfga-ui [hidden]{display:none!important}
.mfga-ui :where(h1,h2,h3,h4,h5,h6,p,ul,ol,li,dl,dt,dd,figure,form,fieldset,legend,blockquote,table,td,th){margin:0;padding:0;border:0}
.mfga-ui :where(h1,h2,h3,h4,h5,h6){color:#333;font-size:13px;font-weight:bold}
.mfga-ui :where(h1){font-size:14px}
.mfga-ui :where(ul,ol){list-style:none}
.mfga-ui :where(table){border-collapse:collapse;border-spacing:0}
.mfga-ui :where(img){border:0}
.mfga-ui :where(button,input,select,textarea){font:inherit;color:inherit;letter-spacing:inherit}
.mfga-ui :where(input[type="checkbox"],input[type="radio"]){margin:0 5px 0 0;vertical-align:middle;accent-color:#3B5998}
.mfga-ui :where(:focus-visible){outline:1px dotted #333;outline-offset:1px}`;
}

// [FB12] a{color:#3b5998;text-decoration:none} a:hover{text-decoration:underline}
function linkCss() {
  return `
.mfga-ui :where(a){color:#3B5998;text-decoration:none;cursor:pointer}
.mfga-ui :where(a:hover){text-decoration:underline}`;
}

// .uiButton / .uiButtonConfirm: [FB12] shadow, confirm colours, active and disabled states. The grey button is
// measured from the 2010 capture ("Become a Fan"): gradient #F5F5F5 -> #E3E3E3 under a 1px highlight, and a
// border lighter than FB12's #999/#888 (the resampled rows fit #AAA with a darker bottom edge).
function buttonCss() {
  return `
.mfga-btn{display:inline-block;box-sizing:content-box;margin:0;padding:3px 6px 4px;border:1px solid #AAA;border-bottom-color:#999;border-radius:0;background:#EEE linear-gradient(#F5F5F5,#E3E3E3);box-shadow:inset 0 1px 0 #FAFAFA,0 1px 0 rgba(0,0,0,.1);color:#333;font:bold 11px/13px ${FONT};text-align:center;text-decoration:none;vertical-align:top;white-space:nowrap;cursor:pointer;-webkit-appearance:none;appearance:none}
.mfga-btn:hover{text-decoration:none}
.mfga-btn:active{background:#DDD;border-bottom-color:#AAA;box-shadow:0 1px 0 rgba(0,0,0,.05)}
.mfga-btn+.mfga-btn{margin-left:4px}
.mfga-btn .mfga-ico{margin:-1px 5px -2px -1px;vertical-align:top}
.mfga-btn-confirm{background:#5B74A8;border-color:#29447E #29447E #1A356E;box-shadow:inset 0 1px 0 #8A9CC2,0 1px 0 rgba(0,0,0,.1);color:#FFF}
.mfga-btn-confirm:active{background:#4F6AA3;border-bottom-color:#29447E;box-shadow:inset 0 1px 0 #45619D}
.mfga-btn-small{padding:1px 5px 2px;line-height:12px}
.mfga-btn:disabled,.mfga-btn[aria-disabled="true"]{background:#F2F2F2;border-color:#C8C8C8;box-shadow:none;color:#B8B8B8;cursor:default}
.mfga-btn-confirm:disabled,.mfga-btn-confirm[aria-disabled="true"]{background:#ADBAD4;border-color:#94A2BF;color:#FFF}`;
}

// [FB12] textarea,.inputtext{border:1px solid #bdc7d8;padding:3px} .inputtext{padding-bottom:4px}; placeholder #777.
// Form fields use border-box so `width:100%` fits their container.
function inputCss() {
  return `
.mfga-input,.mfga-textarea{box-sizing:border-box;max-width:100%;margin:0;padding:3px 3px 4px;border:1px solid #BDC7D8;border-radius:0;background:#FFF;color:#333;font:11px/14px ${FONT};box-shadow:none;-webkit-appearance:none;appearance:none}
.mfga-textarea{display:block;padding:3px;resize:vertical}
select.mfga-input{padding:2px;-webkit-appearance:auto;appearance:auto}
.mfga-input::placeholder,.mfga-textarea::placeholder{color:#777;opacity:1}
.mfga-input:focus,.mfga-textarea:focus{outline:none;border-color:#6D84B4}
.mfga-input:disabled,.mfga-textarea:disabled{background:#F2F2F2;color:#999}`;
}

// .fcg gray meta text; " · " separators between action links (#999 in the story meta line).
function textCss() {
  return `
.mfga-muted{color:#808080}
.mfga-sep{color:#999}
.mfga-sep:empty::before{content:" · ";white-space:pre}`;
}

// Right-column section: 11px bold header, "See All" on the right, #E9E9E9 rule 6px below the baseline.
function boxCss() {
  return `
.mfga-box{margin-bottom:15px}
.mfga-box-title{display:flex;align-items:baseline;gap:6px;margin:0;padding:0 0 3px;border-bottom:1px solid #E9E9E9;color:#333;font-size:11px;font-weight:bold;line-height:13px}
.mfga-see-all{margin-left:auto;font-weight:normal;white-space:nowrap}`;
}

// The blue "25" pill beside "Most Recent" [M], and the red jewel count [FB12 .jewelCount span].
function countCss() {
  return `
.mfga-pill{display:inline-block;box-sizing:border-box;min-width:14px;padding:0 6px;border-radius:7px;background:#6D84B4;color:#FFF;font-size:11px;font-weight:bold;line-height:14px;text-align:center;vertical-align:middle;white-space:nowrap}
.mfga-badge{display:inline-block;box-sizing:border-box;min-width:13px;padding:0 1px;border:1px solid #D83722;border-top-color:#E23923;border-bottom-color:#C0311E;border-radius:0;background:#F03D25;box-shadow:0 1px 0 rgba(0,39,121,.77);color:#FFF;font-size:9px;font-weight:bold;line-height:11px;text-align:center;white-space:nowrap}`;
}

// .uiBoxYellow / .uiBoxRed [FB12].
function messageCss() {
  return `
.mfga-notice,.mfga-error{padding:7px 10px;color:#333;line-height:14px}
.mfga-notice{border:1px solid #E2C822;background:#FFF9D7}
.mfga-error{border:1px solid #DD3C10;background:#FFEBE8}`;
}

// .uiMenu / .uiMenuItem / .uiMenuSeparator [FB12].
function menuCss() {
  return `
.mfga-menu{box-sizing:border-box;padding:3px 0 4px;border:1px solid #777;border-bottom:2px solid #293E6A;background:#FFF}
.mfga-menu-item{display:block;padding:1px 16px 1px 22px;border:solid #FFF;border-width:1px 0;color:#111;line-height:16px;white-space:nowrap;text-decoration:none;cursor:pointer}
.mfga-menu-item:hover,.mfga-menu-item:focus{background:#6D84B4;border-color:#3B5998;color:#FFF;text-decoration:none;outline:none}
.mfga-menu-sep{margin:5px 7px 6px;padding-top:1px;border-bottom:1px solid #DDD}`;
}

// .uiTooltipText [FB12]; the pointer sits under the bubble's left edge (tooltip shown above its anchor).
function tooltipCss() {
  return `
.mfga-tooltip{position:absolute;z-index:1;padding:4px 8px;background:#282828;color:#FFF;font-size:11px;line-height:14px;white-space:nowrap;pointer-events:none}
.mfga-tooltip::after{content:"";position:absolute;top:100%;left:8px;border:4px solid transparent;border-top-color:#282828;border-bottom:0}`;
}

// 2010's 16×11 "three bars" loading indicator, CSS only: one element, three gradient bars, the tall dark bar
// steps left to right.
function spinnerCss() {
  const bar = (color) => `linear-gradient(${color},${color})`;
  const on = bar("#6D84B4");
  const off = bar("#C4CDE0");
  const frame = (i) =>
    `background-image:${[0, 1, 2].map((b) => (b === i ? on : off)).join(",")};background-size:${[0, 1, 2].map((b) => (b === i ? "4px 11px" : "4px 7px")).join(",")}`;
  return `
.mfga-spinner{display:inline-block;width:16px;height:11px;vertical-align:middle;background-repeat:no-repeat;background-position:0 50%,6px 50%,12px 50%;${frame(0)};animation:mfga-spinner .75s step-end infinite}
@keyframes mfga-spinner{0%{${frame(0)}}33.333%{${frame(1)}}66.667%{${frame(2)}}}`;
}
