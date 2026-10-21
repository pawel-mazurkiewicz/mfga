// 2010 News Feed stylesheet: stream header, composer, stories, attachments, UFI, pager, welcome box.
// Geometry follows docs/research/retro-spec-2010.md §5 (measured from assets/reference/2010-home.png).

const LUCIDA = `"lucida grande", tahoma, verdana, arial, sans-serif`;
const TAHOMA = `tahoma, "lucida grande", verdana, arial, sans-serif`;

const BLUE = "#3B5998";
const UFI_BG = "#EDEFF4";

function rootRules(font) {
  return `
.mfga-stream,.mfga-story{font-family:${font};font-size:11px;line-height:1.28;color:#333;text-align:left;direction:ltr}
.mfga-stream *,.mfga-story *,.mfga-stream *::before,.mfga-story *::before,.mfga-stream *::after,.mfga-story *::after{box-sizing:border-box}
.mfga-stream [hidden],.mfga-story [hidden]{display:none!important}
.mfga-stream a,.mfga-story a{color:${BLUE};text-decoration:none;cursor:pointer}
.mfga-stream a:hover,.mfga-story a:hover{text-decoration:underline}
.mfga-stream img,.mfga-story img{border:0;max-width:none}
.mfga-linkbtn{display:inline;margin:0;padding:0;border:0;background:none;font:inherit;line-height:inherit;color:${BLUE};text-align:left;cursor:pointer}
.mfga-linkbtn:hover{text-decoration:underline}
.mfga-linkbtn:focus-visible,.mfga-feed-composer:focus-visible,.mfga-feed-more:focus-visible{outline:1px dotted #333;outline-offset:1px}
.mfga-sep{color:#999}
.mfga-time{color:#808080;text-decoration:none;border:0;cursor:inherit}
.mfga-pic-blank{display:block}
`;
}

function headerRules() {
  return `
.mfga-feed-header{position:relative;height:20px;margin:0 0 20px;line-height:20px}
.mfga-feed-ico{position:absolute;left:0;top:3px}
.mfga-feed-title{margin:0 0 0 22px;padding:0;font-size:16px;font-weight:normal;line-height:20px;color:#333}
.mfga-feed-modes{position:absolute;right:0;top:0;font-size:13px;line-height:20px;white-space:nowrap}
.mfga-feed-mode-on{font-weight:bold;color:#333}
.mfga-feed-dot{font-weight:bold;color:#333}
.mfga-feed-pill{display:inline-block;vertical-align:top;height:14px;margin:4px 0 0 5px;padding:0 6px;border-radius:7px;background:#6D84B4;color:#fff;font-size:11px;font-weight:bold;line-height:14px}
.mfga-feed-composer{height:29px;margin:0 0 1px;padding:5px 6px 6px;border:1px solid #DBDBDB;border-bottom-color:#D3D3D3;box-shadow:inset 0 1px 0 #F5F5F5;background:#fff;color:#777;font-size:13px;line-height:16px;cursor:text;overflow:hidden;white-space:nowrap}
`;
}

function storyRules() {
  return `
.mfga-story{position:relative;padding:9px 0 10px;border-bottom:1px solid #F7F7F7}
.mfga-story-pic{position:absolute;left:0;top:9px;display:block;width:50px;height:50px;overflow:hidden;background:#F0F2F7}
.mfga-story-pic img,.mfga-story-pic svg{display:block;width:50px;height:50px;object-fit:cover}
.mfga-story-body{min-height:50px;margin-left:60px}
.mfga-story-msg{font-size:13px;line-height:16px;color:#333;overflow-wrap:break-word}
.mfga-story-actor{font-weight:bold}
.mfga-story-text{white-space:pre-line}
.mfga-story-passive{color:#333}
.mfga-story-arrow{display:inline-block;width:0;height:0;margin:0 5px 1px;border-left:5px solid #6D84B4;border-top:4px solid transparent;border-bottom:4px solid transparent;vertical-align:middle}
.mfga-story-title{margin-top:2px;font-size:13px;font-weight:bold;line-height:16px;color:#333;overflow-wrap:break-word}
.mfga-story-meta{margin-top:3px;font-size:11px;line-height:14px;color:#808080}
.mfga-story-time,.mfga-story-time .mfga-time,.mfga-story-ai{color:#808080}
.mfga-story-shared{margin-top:6px;padding:1px 0 1px 10px;border-left:2px solid #CCC}
.mfga-story-shared .mfga-story-meta{margin-top:2px}
.mfga-story-attachments{margin-top:6px}
`;
}

function attachmentRules() {
  return `
.mfga-att+.mfga-att{margin-top:6px}
.mfga-att-photos{display:flex;flex-wrap:wrap;gap:4px}
.mfga-att-photo{position:relative;display:block;padding:3px;border:1px solid #CCC;background:#fff;line-height:0}
.mfga-att-photo:hover{border-color:${BLUE}}
.mfga-att-photo img{display:block;object-fit:cover;background:#F2F2F2}
.mfga-att-grid .mfga-att-photo img{width:100px;height:100px}
.mfga-att-more{position:absolute;top:3px;right:3px;bottom:3px;left:3px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);color:#fff;font-size:16px;font-weight:bold;line-height:1}
.mfga-att-photo:hover .mfga-att-more{text-decoration:underline}
.mfga-att-video-thumb{position:relative;display:block;overflow:hidden;background:#000;line-height:0;cursor:pointer}
.mfga-att-video-thumb img{display:block;width:100%;height:100%;object-fit:cover}
.mfga-att-play{position:absolute;left:5px;bottom:5px;width:35px;height:26px;border:1px solid rgba(255,255,255,.7);border-radius:3px;background:rgba(0,0,0,.7)}
.mfga-att-play::after{content:"";position:absolute;left:13px;top:6px;border-left:10px solid #fff;border-top:6px solid transparent;border-bottom:6px solid transparent}
.mfga-att-video-thumb:hover .mfga-att-play{background:${BLUE}}
.mfga-att-live{position:absolute;left:5px;top:5px;padding:0 4px;background:#F03D25;color:#fff;font-size:9px;font-weight:bold;line-height:13px}
.mfga-att-player{display:block;max-width:100%;background:#000}
.mfga-att-caption{margin-top:3px;color:#808080}
.mfga-att-link{display:flex;align-items:flex-start;line-height:14px}
.mfga-att-link-img{flex:none;display:block;margin-right:10px;line-height:0}
.mfga-att-link-img img{display:block;max-width:90px;max-height:90px}
.mfga-att-link-body{flex:1;min-width:0;overflow-wrap:break-word}
.mfga-att-title{font-weight:bold}
.mfga-att-source{color:#808080}
.mfga-att-desc{margin-top:2px;color:#808080}
.mfga-att-event{display:flex;align-items:flex-start;line-height:14px}
.mfga-att-event-ico{margin:0 6px 0 0}
.mfga-att-unavailable{padding:7px 10px;border:1px solid #CCC;background:#F2F2F2;color:#808080;line-height:14px}
.mfga-att-unavailable-title{font-weight:bold;color:#333}
`;
}

function ufiRules(font) {
  return `
.mfga-ufi{width:355px;max-width:100%;margin-top:2px;line-height:14px}
.mfga-ufi-nub{display:block;width:0;height:0;margin:0 0 -2px 16px;border:5px solid transparent;border-top:0;border-bottom-color:${UFI_BG}}
.mfga-ufi-item{margin-top:2px;padding:5px 5px 4px;background:${UFI_BG};line-height:14px;overflow-wrap:break-word}
.mfga-ufi-likes,.mfga-ufi-viewall{display:flex;align-items:flex-start}
.mfga-ufi-likes .mfga-ufi-ico{margin:1px 6px 0 0}
.mfga-ufi-viewall{padding-bottom:6px}
.mfga-ufi-viewall .mfga-ufi-ico{margin:2px 6px 0 1px}
.mfga-ufi-spinner{margin-left:6px}
.mfga-ufi-comment{display:flex;align-items:flex-start}
.mfga-ufi-pic{flex:none;display:block;width:32px;height:32px;margin-right:7px;overflow:hidden;background:#F0F2F7}
.mfga-ufi-pic img,.mfga-ufi-pic svg{display:block;width:32px;height:32px;object-fit:cover}
.mfga-ufi-comment-body{flex:1;min-width:0;padding-top:1px}
.mfga-ufi-comment-text{line-height:13px;white-space:pre-line}
.mfga-ufi-actor{font-weight:bold;white-space:normal}
.mfga-ufi-comment-meta{margin-top:3px;line-height:14px;color:#777}
.mfga-ufi-comment-meta .mfga-time{color:#777}
.mfga-ufi-comment-like{margin:-2px 0 0 1px}
.mfga-ufi-add{display:flex;align-items:flex-start;padding:4px 5px}
.mfga-ufi-me{display:none}
.mfga-ufi-add-active .mfga-ufi-me{display:block}
.mfga-ufi-add-body{flex:1;min-width:0}
.mfga-ufi-input{display:block;width:100%;height:22px;min-height:22px;margin:0;padding:3px;border:1px solid #CBD3E0;border-radius:0;background:#fff;color:#333;font:11px/14px ${font};resize:none;overflow:hidden;outline:none;box-shadow:none}
.mfga-ufi-input::placeholder{color:#777;opacity:1}
.mfga-ufi-add-active .mfga-ufi-input{min-height:32px;border-color:#BDC7D8}
.mfga-ufi-add-actions{display:none;margin-top:4px;text-align:right}
.mfga-ufi-add-active .mfga-ufi-add-actions{display:block}
.mfga-busy .mfga-ufi-input{color:#999;background:#F7F7F7}
.mfga-busy .mfga-ufi-submit{opacity:.6;cursor:default}
.mfga-ufi-item.mfga-ufi-error{padding-left:5px;border-left:2px solid #AAA7A2;background:#F2F2F2;color:#111}
`;
}

function buttonRules(font) {
  return `
.mfga-ufi-submit,.mfga-feed-retry{display:inline-block;margin:0;padding:2px 6px;border:1px solid #999;border-bottom-color:#888;background:linear-gradient(#F8F8F8,#E3E3E3);box-shadow:0 1px 0 rgba(0,0,0,.1);color:#333;font:bold 11px/13px ${font};text-align:center;white-space:nowrap;cursor:pointer;vertical-align:middle}
.mfga-ufi-submit{border-color:#29447E #29447E #1A356E;background:#5B74A8;box-shadow:inset 0 1px 0 #8A9CC2,0 1px 0 rgba(0,0,0,.1);color:#fff}
.mfga-ufi-submit:active{background:#4F6AA3;border-bottom-color:#29447E}
.mfga-feed-retry:active{background:#DDD;border-bottom-color:#999;box-shadow:0 1px 0 rgba(0,0,0,.05)}
`;
}

function footerRules(font) {
  return `
.mfga-feed-footer{margin-top:10px}
.mfga-feed-more{display:block;width:100%;margin:0;padding:7px 10px 8px;border:0;border-top:1px solid #D8DFEA;background:${UFI_BG};color:${BLUE};font:bold 11px/14px ${font};text-align:left;cursor:pointer}
.mfga-feed-more:hover{background:#D8DFEA}
.mfga-feed-more-arrow{display:inline-block;width:0;height:0;margin:0 6px 2px 0;border-top:5px solid ${BLUE};border-left:4px solid transparent;border-right:4px solid transparent;vertical-align:middle}
.mfga-feed-more.mfga-loading{text-align:center;cursor:default}
.mfga-feed-more.mfga-loading:hover{background:${UFI_BG}}
.mfga-feed-spinner,.mfga-ufi-spinner{display:inline-block;width:4px;height:11px;margin-right:12px;vertical-align:middle;animation:mfga-stream-bars .9s steps(1) infinite}
@keyframes mfga-stream-bars{0%{background:${BLUE};box-shadow:6px 0 #BCC6DB,12px 0 #BCC6DB}33%{background:#BCC6DB;box-shadow:6px 0 ${BLUE},12px 0 #BCC6DB}66%{background:#BCC6DB;box-shadow:6px 0 #BCC6DB,12px 0 ${BLUE}}}
.mfga-feed-empty{padding:20px 10px;color:#808080;text-align:center}
.mfga-feed-empty-title{margin-bottom:4px;font-size:13px;color:#333}
.mfga-feed-end{padding:10px;color:#808080;text-align:center}
.mfga-feed-error{padding:7px 10px;border:1px solid #DD3C10;background:#FFEBE8;color:#333;line-height:20px}
.mfga-feed-status{margin-top:8px;color:#808080;text-align:center}
`;
}

function welcomeRules() {
  return `
.mfga-welcome{margin:0 0 23px;padding:14px 20px 12px;border:1px solid #E1E5EE;background:${UFI_BG}}
.mfga-welcome-head{display:flex;align-items:flex-start;justify-content:space-between}
.mfga-welcome-title{margin:0;padding:0;font-size:16px;font-weight:normal;line-height:20px;color:#333}
.mfga-welcome-close{flex:none;margin-left:10px;line-height:14px}
.mfga-welcome-main{display:flex;align-items:flex-start;margin-top:14px}
.mfga-welcome-steps{flex:1;min-width:0;margin:6px 0 0;padding:0;list-style:none}
.mfga-welcome-step{display:flex;align-items:flex-start;margin:0 0 10px;line-height:14px}
.mfga-welcome-step:last-child{margin-bottom:0}
.mfga-welcome-num{flex:none;width:15px;height:16px;margin-right:8px;background:#A6B2CA;color:#fff;font-weight:bold;line-height:16px;text-align:center}
.mfga-welcome-learn{display:inline-block;margin-top:12px;font-size:13px;font-weight:bold;line-height:16px}
.mfga-welcome-arrow{display:inline-block;width:0;height:0;margin:0 0 2px 5px;border-left:4px solid ${BLUE};border-top:4px solid transparent;border-bottom:4px solid transparent;vertical-align:middle}
.mfga-welcome-mini{position:relative;flex:none;display:block;width:175px;height:113px;margin-right:21px;border:1px solid #E1E3EB;background:#fff;overflow:hidden}
.mfga-welcome-mini i{position:absolute;display:block}
.mfga-welcome-mini .mfga-welcome-block{position:static;background:#E3E3E3}
.mfga-welcome-mini-bar{left:0;top:0;width:100%;height:6px;background:${BLUE}}
.mfga-welcome-mini-logo{left:4px;top:2px;width:18px;height:2px;background:#C3CDE0}
.mfga-welcome-mini-search{left:41px;top:1px;width:46px;height:4px;background:#fff}
.mfga-welcome-mini-left{left:0;top:6px;bottom:0;width:39px;padding:5px 4px;border-right:1px solid #E3E3E3;background:#F3F3F3}
.mfga-welcome-mini-left .mfga-welcome-pic{width:10px;height:10px;margin-bottom:8px}
.mfga-welcome-mini-left .mfga-welcome-nav{width:28px;height:3px;margin-bottom:4px}
.mfga-welcome-mini-center{left:44px;top:11px;width:73px}
.mfga-welcome-mhead.mfga-welcome-block{width:18px;height:3px;margin-bottom:3px;background:#ACACAD}
.mfga-welcome-composer.mfga-welcome-block{height:5px;margin-bottom:4px;border:1px solid #D3D3D3;background:#fff}
.mfga-welcome-mini-story{position:static!important;display:flex!important;gap:3px;margin-bottom:4px}
.mfga-welcome-mini-story .mfga-welcome-pic{flex:none;width:8px;height:8px}
.mfga-welcome-mini-story .mfga-welcome-lines{flex:1;height:12px}
.mfga-welcome-mini-right{left:126px;top:11px;width:42px}
.mfga-welcome-mini-right .mfga-welcome-box{height:14px;margin-bottom:6px}
.mfga-welcome-marker{position:absolute;width:11px;height:12px;background:#EF504F;color:#fff;font-size:9px;font-weight:bold;line-height:12px;text-align:center}
.mfga-welcome-m1{left:49px;top:58px}
.mfga-welcome-m2{left:95px;top:3px}
.mfga-welcome-m3{left:150px;top:0}
`;
}

/** The stream stylesheet; `settings.look.font` picks Tahoma or Lucida Grande first. */
export function streamCss(settings) {
  const font = settings?.look?.font === "tahoma" ? TAHOMA : LUCIDA;
  return [rootRules(font), headerRules(), storyRules(), attachmentRules(), ufiRules(font), buttonRules(font), footerRules(font), welcomeRules()].join("").trim();
}
