// Styles for the 2010 pop_dialog (dialog.js) and the settings dialog (settings-dialog.js, health.js).
// Dialog values: retro-spec-2010 §8.3 ([CJS10] frame, [FB12] .pop_content title/content/body/buttons).

export function dialogCss() {
  return [frameCss(), settingsCss(), healthCss(), aboutCss()].join("\n");
}

// The page overlay is FB12's light .generic_dialog_modal colour, kept see-through so "Look" changes made in
// the settings dialog stay visible behind it. 2010 opened dialogs about 125px from the top of the window.
function frameCss() {
  return `
.mfga-dialog-layer{position:fixed;inset:0;z-index:2147483000;overflow-y:auto;overscroll-behavior:contain;background:rgba(252,252,252,.55)}
.mfga-dialog{box-sizing:border-box;max-width:calc(100vw - 20px);margin:125px auto 40px;padding:10px;border-radius:8px;background:rgba(82,82,82,.7);outline:none}
@media (max-height:700px){.mfga-dialog{margin-top:20px}}
.mfga-dialog-content{background:#FFF}
.mfga-dialog-title{margin:0;padding:5px 10px;border:1px solid #3B5998;border-bottom:0;background:#6D84B4;color:#FFF;font-size:14px;font-weight:bold;line-height:17px}
.mfga-dialog-body{padding:10px;border:1px solid #555;border-top:0;border-bottom-color:#CCC}
.mfga-dialog-footer{display:flex;align-items:center;justify-content:flex-end;gap:4px;padding:8px 10px;border:1px solid #555;border-top:0;background:#F2F2F2}
.mfga-dialog-footer .mfga-btn+.mfga-btn{margin-left:0}
.mfga-dialog-note{margin-right:auto;color:#808080;line-height:17px}`;
}

// 2009–2010 profile / Account Settings tabs: #D8DFEA tabs with bold blue labels, the selected tab white and
// joined to the panel, all sitting on a #898989 rule. Form rows follow FB's .uiInfoTable (bold #666 labels).
function settingsCss() {
  return `
.mfga-settings-tabs{display:flex;gap:3px;margin:0 -10px;padding:0 10px;border-bottom:1px solid #898989}
.mfga-settings-tab{position:relative;bottom:-1px;margin:0;padding:3px 8px 4px;border:1px solid #D8DFEA;border-bottom:0;border-radius:0;background:#D8DFEA;color:#3B5998;font-weight:bold;line-height:13px;cursor:pointer}
.mfga-settings-tab:hover{border-color:#627AAD;background:#627AAD;color:#FFF}
.mfga-settings-tab[aria-selected="true"]{border-color:#898989;background:#FFF;color:#333;cursor:default;padding-bottom:5px}
.mfga-settings-panel{box-sizing:border-box;height:360px;max-height:calc(100vh - 290px);min-height:160px;margin:0 -10px -10px;padding:12px 10px 10px;overflow-y:auto}
.mfga-settings-intro{margin:0 0 10px}
.mfga-settings-row{display:grid;grid-template-columns:120px minmax(0,1fr);column-gap:10px;padding:0 0 9px}
.mfga-settings-label{padding-top:2px;color:#666;font-weight:bold;text-align:right}
.mfga-settings-field{min-width:0}
.mfga-settings-check{display:flex;align-items:flex-start;gap:5px;padding:2px 0;color:#333;cursor:pointer}
.mfga-settings-check input{flex:none;margin:0}
.mfga-settings-check-inline{display:inline-flex;margin-right:14px}
.mfga-settings-hint{margin:1px 0 2px;color:#808080}
.mfga-settings-check+.mfga-settings-hint{margin-left:18px}
.mfga-settings-sub{margin-left:18px}
.mfga-settings-off{opacity:.5;cursor:default}
.mfga-settings-off .mfga-settings-check{cursor:default}
.mfga-settings-inline-error{margin:3px 0 0;color:#DD3C10}
.mfga-settings-keywords{width:100%;height:64px}
.mfga-settings-font-lucida{font-family:"lucida grande",tahoma,verdana,arial,sans-serif}
.mfga-settings-font-tahoma{font-family:tahoma,"lucida grande",verdana,arial,sans-serif}`;
}

function healthCss() {
  return `
.mfga-health-status{margin:0 0 8px}
.mfga-health-actions{display:flex;align-items:flex-start;gap:4px;margin:0 0 6px}
.mfga-health-actions .mfga-btn+.mfga-btn{margin-left:0}
.mfga-health-actions .mfga-btn.mfga-health-reset{margin-left:auto}
.mfga-health-exported{margin:0 0 10px;color:#333}
.mfga-health-exported:empty{display:none}
.mfga-health-section{margin:12px 0 0}
.mfga-health-section>.mfga-box-title{margin-bottom:4px}
.mfga-health-areas{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:16px}
.mfga-health-areas .mfga-box{margin-bottom:10px}
.mfga-health-table{width:100%;table-layout:fixed}
.mfga-health-table th{padding:2px 6px 2px 0;color:#666;font-weight:bold;text-align:left}
.mfga-health-table td{padding:1px 6px 1px 0;vertical-align:top;overflow-wrap:anywhere}
.mfga-health-table .mfga-health-num{width:60px;padding-right:0;text-align:right;white-space:nowrap}
.mfga-health-table tr+tr td{border-top:1px solid #F2F2F2}
.mfga-health-total{margin-left:auto;color:#808080;font-weight:normal}`;
}

function aboutCss() {
  return `
.mfga-about-head{display:flex;align-items:baseline;gap:8px;margin:0 0 10px}
.mfga-about-name{color:#3B5998;font-size:16px;font-weight:bold}
.mfga-about-section{margin:0 0 12px}
.mfga-about-section>.mfga-box-title{margin-bottom:5px}
.mfga-about-section p+p{margin-top:6px}
.mfga-about-list li{padding:1px 0 1px 12px;text-indent:-12px}
.mfga-about-list li::before{content:"\\25AA";display:inline-block;width:12px;text-indent:0;color:#3B5998}
.mfga-about-legal{color:#808080}`;
}
