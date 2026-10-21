// Stylesheet of the 2010 shell (retro-spec-2010 §2–§8.5) and of the layout around Facebook's page
// (ARCHITECTURE §5). Geometry comes from src/ui/shell/grid.js; measured offsets arrive as CSS variables
// (--mfga-main-dx/-dy, --mfga-footer-top) written by src/fb/layout.js.
import { GRID } from "../shell/grid.js";

const FONT = '"lucida grande", tahoma, verdana, arial, sans-serif';
const FONT_TAHOMA = 'tahoma, "lucida grande", verdana, arial, sans-serif';
const S = "#mfga-shell";
const FOOTER_HEIGHT = 70; // curve 9 + rule 1 + 8 + one 14px line + 38 (#footerContainer padding)
const COLUMN_ROUTES = ['html[data-mfga-route="home"]', 'html[data-mfga-route="groups-feed"]'];
const onColumns = (sel) => COLUMN_ROUTES.map((r) => `${r} ${sel}`).join(",");

/** Facebook's own chrome: hidden, but its layers, dialogs and chat keep working (dom-chrome §2.5, §7.4). */
function facebookCss() {
  const g = GRID;
  return `
html[data-mfga-shell],html[data-mfga-shell] .__fb-light-mode,html[data-mfga-shell] .__fb-dark-mode{--header-height:${g.bar}px!important}
html[data-mfga-shell]:not([data-mfga-native-banner]) div[id^="mount_"] [role="banner"]:not([role="dialog"] *){visibility:hidden!important;height:0!important;min-height:0!important;pointer-events:none!important}
html[data-mfga-shell] [role="banner"] :is([role="dialog"],[role="menu"],[role="listbox"],[role="tooltip"]){visibility:visible!important;pointer-events:auto!important}
${onColumns("[data-mfga-chrome]")}{visibility:hidden!important;pointer-events:none!important}
html[data-mfga-shell] [data-mfga-pass]{pointer-events:none!important}
:where(html[data-mfga-shell] [data-mfga-pass]>:not([data-mfga-pass])){pointer-events:auto}
${onColumns("[data-mfga-pass]")}{background:transparent!important;overflow:visible!important}
${onColumns("[data-mfga-main]")}{box-sizing:border-box!important;min-width:0!important;margin-left:0!important;margin-right:0!important;position:relative!important;left:var(--mfga-main-dx,0px)!important;top:var(--mfga-main-dy,0px)!important}
html[data-mfga-route="home"] [data-mfga-main]{width:${g.content.w}px!important;max-width:${g.content.w}px!important;flex:0 0 ${g.content.w}px!important}
html[data-mfga-route="groups-feed"] [data-mfga-main]{width:${g.wide.w}px!important;max-width:${g.wide.w}px!important;flex:0 0 ${g.wide.w}px!important}
`;
}

function baseCss() {
  const g = GRID;
  return `
${S}{position:absolute;top:0;left:0;right:0;height:0;direction:ltr;font-family:${FONT};font-size:11px;line-height:1.28;color:#333;text-align:left}
html[data-mfga-font="tahoma"] ${S}{font-family:${FONT_TAHOMA}}
html:not([data-mfga-shell]) ${S}{display:none}
${S} *{box-sizing:content-box}
${S} a{color:#3B5998;text-decoration:none;cursor:pointer}
${S} a:hover{text-decoration:underline}
${S} ul{list-style:none;margin:0;padding:0}
${S} button{font:inherit;color:inherit;margin:0}
${S} [hidden]{display:none!important}
${S} .mfga-shell-backdrop,${S} .mfga-shell-sep,${S} .mfga-shell-rule{position:absolute;top:${g.bar}px;height:calc(var(--mfga-footer-top,100vh) - ${g.bar}px)}
${S} .mfga-shell-backdrop{left:0;right:0;z-index:0;background:#fff;padding-bottom:${FOOTER_HEIGHT}px}
${S} .mfga-shell-page{position:absolute;top:0;left:max(0px,calc(50% - ${g.page / 2}px));width:${g.page}px;height:0}
${S} .mfga-shell-sep{left:${g.left.w}px;width:1px;z-index:0;background:#CCC}
${S} .mfga-shell-rule{left:${g.rule}px;width:1px;z-index:0;background:#EDEDED}
html[data-mfga-route="page"] ${S} :is(.mfga-shell-backdrop,.mfga-shell-sep,.mfga-shell-rule,.mfga-shell-left,.mfga-shell-right),
html[data-mfga-route="groups-feed"] ${S} :is(.mfga-shell-rule,.mfga-shell-right){display:none}
`;
}

function headerCss() {
  const g = GRID;
  return `
${S} .mfga-header{position:absolute;top:0;left:0;right:0;min-width:${g.page}px;height:${g.bar}px;z-index:0;background:#3B5998}
html[data-mfga-fixed-header] ${S} .mfga-header{position:fixed;z-index:1}
html[data-mfga-fixed-header]:has([role="dialog"]:not([role="banner"] *)) ${S} .mfga-header{z-index:0}
html[data-mfga-native-banner] ${S} .mfga-header{visibility:hidden}
${S} .mfga-header.mfga-header-open{z-index:2}
${S} .mfga-header-page{position:relative;width:${g.page}px;height:${g.bar}px;margin:0 auto}
${S} .mfga-header-logo{position:absolute;left:0;top:15px;display:block;width:88px;height:19px}
${S} .mfga-header-logo .mfga-ico{display:block}
${S} .mfga-header-jewel{position:absolute;top:10px;display:flex;align-items:center;justify-content:center;width:24px;height:30px}
${S} .mfga-header-jewel:hover{background:#4B67A1;text-decoration:none}
${S} .mfga-header-jewel-requests{left:97px}
${S} .mfga-header-jewel-messages{left:122px}
${S} .mfga-header-jewel-notifications{left:146px}
${S} .mfga-header-count{position:absolute;top:-2px;left:10px;min-width:11px;height:11px;padding:0 1px;border:1px solid #D83722;border-top-color:#E23923;border-bottom-color:#C0311E;background:#F03D25;box-shadow:0 1px 0 rgba(0,39,121,.77);color:#fff;font:bold 9px/11px ${FONT};text-align:center}
${S} .mfga-header-nav{position:absolute;left:${g.left.w}px;top:11px;width:${g.page - g.left.w - 1}px;height:30px;border:solid #2E4F8E;border-width:0 1px;background:#627AAD;box-shadow:inset 1px 0 #5873AA,inset -1px 0 #5873AA,inset 0 -1px #536EA7}
${S} .mfga-header-search{position:absolute;left:4px;top:3px;display:flex;width:298px;height:21px;border:1px solid #536EA7;border-right-color:#44629E;border-bottom-color:#536DA6;background:#fff}
${S} .mfga-header-search-input{flex:1;min-width:0;height:21px;margin:0;padding:0 0 0 4px;border:0;outline:0;background:#fff;box-shadow:inset 0 1px #D3DBE5;color:#333;font:11px ${FONT}}
html[data-mfga-font="tahoma"] ${S} .mfga-header-search-input{font-family:${FONT_TAHOMA}}
${S} .mfga-header-search-input::placeholder{color:#777;opacity:1}
${S} .mfga-header-search-btn{display:flex;align-items:center;justify-content:center;width:20px;height:21px;padding:0;border:0;border-left:1px solid #F5F5F5;background:#fff;box-shadow:inset 0 1px #EDF2F5,inset 0 -1px #CFD8E7;cursor:pointer}
${S} .mfga-header-links{position:absolute;top:0;right:0;display:flex;height:30px}
${S} .mfga-header-link{display:block;height:30px;padding:0 11px;border:0;background:none;color:#fff;font-weight:bold;line-height:29px;white-space:nowrap;cursor:pointer}
${S} a.mfga-header-link:hover,${S} button.mfga-header-link:hover{background:#4B67A1;text-decoration:none}
${S} .mfga-header-arrow{display:inline-block;width:0;height:0;margin-left:5px;vertical-align:1px;border-top:4px solid #fff;border-left:4px solid transparent;border-right:4px solid transparent}
${S} .mfga-header-account{position:relative}
${S} .mfga-open .mfga-header-account-btn,${S} .mfga-open .mfga-header-account-btn:hover{position:relative;z-index:2;height:31px;background:#fff;color:#333;box-shadow:inset 1px 0 #333,inset -1px 0 #333,inset 0 1px #333}
${S} .mfga-open .mfga-header-arrow{border-top-color:#333}
${S} .mfga-header-menu{position:absolute;top:30px;right:0;z-index:1;min-width:200px;max-width:400px;padding:4px 0;border:1px solid #333;border-bottom-width:2px;background:#fff}
${S} .mfga-header-menu-item{display:block;box-sizing:border-box;width:100%;height:20px;padding:0 22px;border:solid #fff;border-width:1px 0;background:#fff;color:#222;line-height:18px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
${S} .mfga-header-menu-item:hover,${S} .mfga-header-menu-item:focus-visible{border-color:#3B5998;background:#6D84B4;color:#fff;text-decoration:none;outline:none}
${S} .mfga-header-menu-sep{height:1px;margin:5px 7px 6px;background:#DDD}
`;
}

function leftCss() {
  const g = GRID;
  return `
${S} .mfga-shell-left{position:absolute;left:${g.left.x}px;top:${g.bar + g.top}px;z-index:0;width:${g.left.w}px}
${S} .mfga-nav-me{position:relative;height:50px;margin:3px 0 7px}
${S} .mfga-nav-me-pic{position:absolute;left:0;top:0;display:block;width:50px;height:50px;background:#EDEFF4}
${S} .mfga-nav-me-pic img{display:block;width:50px;height:50px;object-fit:cover}
${S} .mfga-nav-me-text{position:absolute;left:58px;top:-3px;right:4px;line-height:14px}
${S} .mfga-nav-me-name{display:block;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${S} .mfga-nav-me-view{display:block}
${S} .mfga-nav-link{position:relative;display:block;min-height:17px;padding:3px 8px 0 28px;border-bottom:1px solid #fff;color:#333;line-height:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${S} .mfga-nav-link:hover{background:#EFF2F7;text-decoration:none}
${S} .mfga-nav-selected .mfga-nav-link{margin-right:-1px;background:#D8DFEA;font-weight:bold}
${S} .mfga-nav-sub{margin:0;padding:0;list-style:none}
${S} .mfga-nav-sub .mfga-nav-link{padding-left:46px}
${S} .mfga-nav-sub .mfga-nav-icon{left:24px}
${S} .mfga-nav-icon{position:absolute;left:6px;top:3px;display:flex;align-items:center;justify-content:center;width:16px;height:16px}
${S} .mfga-nav-pic{display:block;width:16px;height:16px;object-fit:cover}
${S} .mfga-nav-count{color:#808080;font-weight:normal}
${S} .mfga-nav-arrow{margin-left:6px;vertical-align:0}
${S} .mfga-nav-sep{width:172px;height:1px;margin:7px 0 13px 6px;background:#EEE}
${S} .mfga-nav-more{display:block;padding:4px 0 1px 6px;border:0;background:none;color:#3B5998;line-height:13px;cursor:pointer}
${S} .mfga-nav-more:hover{text-decoration:underline}
${S} .mfga-nav-more-arrow{margin-left:4px;vertical-align:2px}
${S} .mfga-nav-title{padding:0 0 5px 6px;color:#808080;font-weight:bold;line-height:13px}
${S} .mfga-nav-go-online{display:inline-block;margin-left:6px;line-height:14px}
`;
}

function rightCss() {
  const g = GRID;
  return `
${S} .mfga-shell-right{position:absolute;left:${g.right.x}px;top:${g.bar + g.top}px;z-index:0;width:${g.right.w}px}
${S} .mfga-rc-box{margin-bottom:15px}
${S} .mfga-rc-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;padding-bottom:3px;border-bottom:1px solid #E9E9E9;line-height:13px}
${S} .mfga-rc-title{margin:0;color:#333;font-size:11px;font-weight:bold}
${S} .mfga-rc-action{padding:0;border:0;background:none;color:#3B5998;line-height:13px;cursor:pointer}
${S} .mfga-rc-action:hover{text-decoration:underline}
${S} .mfga-rc-row{position:relative;display:block;min-height:20px;padding-left:20px;line-height:20px}
${S} .mfga-rc-row>.mfga-ico{position:absolute;left:0;top:4px}
${S} .mfga-rc-event{min-height:15px;line-height:15px}
${S} .mfga-rc-event>.mfga-ico{top:1px}
${S} .mfga-rc-event:first-child{margin-top:4px}
${S} .mfga-rc-when{color:#808080;font-size:9px}
${S} .mfga-rc-text{min-height:16px;margin:3px 0 7px;line-height:13px}
${S} .mfga-rc-text>.mfga-ico{top:0}
${S} .mfga-rc-note{margin:4px 0 0;color:#808080;line-height:13px}
`;
}

function footerCss() {
  const g = GRID;
  return `
${S} .mfga-footer{position:absolute;top:var(--mfga-footer-top,100vh);left:${g.left.w}px;z-index:0;width:${g.page - g.left.w}px;height:${FOOTER_HEIGHT}px;overflow:hidden;color:#737373;background:#fff}
html[data-mfga-route="page"] ${S} .mfga-footer{left:0;width:${g.page}px}
${S} .mfga-footer-curve{height:8px;border-left:1px solid #CCC;border-bottom:1px solid #CCC}
html[data-mfga-route="page"] ${S} .mfga-footer-curve{border-left:0}
${S} .mfga-footer-inner{display:flex;justify-content:space-between;gap:16px;padding:8px 8px 38px;border-top:1px solid #EEE;line-height:14px;white-space:nowrap}
${S} .mfga-footer-lang{padding:0;border:0;background:none;color:#3B5998;cursor:pointer}
${S} .mfga-footer-lang:hover{text-decoration:underline}
${S} .mfga-footer-links{text-align:right}
${S} .mfga-chat-tab{position:fixed;right:15px;bottom:0;z-index:0;display:flex;align-items:center;gap:4px;width:188px;height:25px;padding:0 5px;border:1px solid rgba(164,164,164,.48);border-bottom:0;background:linear-gradient(#F7F7F7,#DDD);color:#333;font-weight:bold;text-align:left;cursor:pointer}
${S} .mfga-chat-tab:hover{background:linear-gradient(#FFF,#E5E5E5)}
`;
}

/** The shell's CSS; it does not depend on settings (visibility toggles are applied by the shell itself). */
export function shellCss() {
  return [facebookCss(), baseCss(), headerCss(), leftCss(), rightCss(), footerCss()].join("");
}
