// Facebook theme-token overrides: every Facebook page renders in 2010 colours, fonts and square corners.
//
// Facebook declares its tokens on `:root, .__fb-light-mode:root, .__fb-light-mode` (and the dark-mode
// equivalents) and puts the mode class on <html>. These rules sit on <html> only, with higher
// specificity, for both root modes (2010 had no dark mode). Nested `.__fb-dark-mode` / `.__fb-light-mode`
// islands (portals, media viewer) declare their own tokens and keep Facebook's values. Every token name
// below exists in Facebook's 2026 light theme (test/fixtures/native/fb-light-vars.css, checked by
// test/unit/native/theme.test.mjs).

export const FONT_STACKS = Object.freeze({
  lucida: '"lucida grande", tahoma, verdana, arial, sans-serif',
  tahoma: 'tahoma, "lucida grande", verdana, arial, sans-serif',
});

const rem = (px) => `${px / 16}rem`;

// 2010 palette (CONTRACTS §1).
const COLORS = {
  // Surfaces: flat white page and cards.
  "--web-wash": "#FFFFFF",
  "--surface-background": "#FFFFFF",
  "--card-background": "#FFFFFF",
  "--card-background-flat": "#FFFFFF",
  "--card-background-filled": "#F2F2F2",
  "--popover-background": "#FFFFFF",
  "--messenger-card-background": "#FFFFFF",
  "--wash": "#F2F2F2",
  "--background-deemphasized": "#F2F2F2",
  "--search-input-background": "#FFFFFF",
  "--input-background": "#FFFFFF",
  "--input-background-disabled": "#F2F2F2",
  // UFI / comments: the 2010 light blue box.
  "--comment-background": "#EDEFF4",
  "--fds-comment-background": "#EDEFF4",
  "--comment-footer-background": "#EDEFF4",
  "--highlight-bg": "#EDEFF4",
  "--new-notification-background": "#EDEFF4",
  "--nav-list-selected-accent": "#D8DFEA",
  "--nav-list-selected-accent-text": "#333333",
  "--hover-overlay": "rgba(59, 89, 152, 0.08)",
  // Text.
  "--primary-text": "#333333",
  "--fds-primary-text": "#333333",
  "--secondary-text": "#808080",
  "--placeholder-text": "#777777",
  "--section-header-text": "#333333",
  "--disabled-text": "#999999",
  "--primary-icon": "#333333",
  "--fds-primary-icon": "#333333",
  "--secondary-icon": "#808080",
  "--placeholder-icon": "#777777",
  "--disabled-icon": "#999999",
  // Links and accents: Facebook blue.
  "--blue-link": "#3B5998",
  "--accent": "#3B5998",
  "--text-highlight": "#3B5998",
  "--fds-blue-60": "#3B5998",
  "--tab-underline-color": "#3B5998",
  "--focus-ring-blue": "#6D84B4",
  "--border-selected": "#3B5998",
  // Rules and borders.
  "--divider": "#E9E9E9",
  "--card-border-color": "#E9E9E9",
  "--list-border-color": "#E9E9E9",
  "--border-unfocused": "#E9E9E9",
  "--input-border-color": "#BDC7D8",
  "--secondary-button-stroke": "#999999",
  "--popover-border-color": "rgba(0, 0, 0, 0.45)",
  // Buttons: blue confirm, grey plain.
  "--primary-button-background": "#5B74A8",
  "--primary-button-pressed": "#4F6AA3",
  "--primary-button-text": "#FFFFFF",
  "--primary-button-icon": "#FFFFFF",
  "--primary-deemphasized-button-background": "#EDEFF4",
  "--primary-deemphasized-button-text": "#3B5998",
  "--secondary-button-background": "#EEEEEE",
  "--secondary-button-background-floating": "#EEEEEE",
  "--secondary-button-text": "#333333",
  "--button-filled-secondary-background": "#EEEEEE",
  "--button-filled-secondary-text": "#333333",
  "--disabled-button-background": "#F2F2F2",
  "--disabled-button-text": "#999999",
  "--notification-badge": "#F03D25",
  "--badge-background-color-red": "#F03D25",
  // Fades over the white 2010 page.
  "--nav-bar-background-gradient":
    "linear-gradient(to top, #FFFFFF, rgba(255,255,255,.9), rgba(255,255,255,.7), rgba(255,255,255,.4), rgba(255,255,255,0))",
  "--nav-bar-background-gradient-wash":
    "linear-gradient(to top, #FFFFFF, rgba(255,255,255,.9), rgba(255,255,255,.7), rgba(255,255,255,.4), rgba(255,255,255,0))",
};

// Icons are black glyphs tinted with CSS filters; these chains turn black into the 2010 colours
// (#3B5998 blue, #333 / #808080 / #777 / #999 greys), measured in Chromium.
const BLUE_FILTER = "invert(31%) sepia(43%) saturate(776%) hue-rotate(182deg) brightness(96%) contrast(91%)";
const FILTERS = {
  "--filter-accent": BLUE_FILTER,
  "--filter-primary-accent": BLUE_FILTER,
  "--filter-blue-link-icon": BLUE_FILTER,
  "--filter-primary-icon": "invert(20%)",
  "--filter-secondary-icon": "invert(50.2%)",
  "--filter-placeholder-icon": "invert(46.7%)",
  "--filter-disabled-icon": "invert(60%)",
};

// Facebook's own light values (fb-light-vars.css) for every other token its dark theme changes, so a dark
// <html> renders light like 2010 (which had no dark mode). Written on the dark root only; generated from
// Facebook's light and dark token files and checked against them by test/unit/native/theme.test.mjs.
const DARK_ROOT_LIGHT = {
  "--fds-black": "#000000", "--fds-blue-05": "#ECF3FF", "--fds-blue-30": "#AAC9FF", "--fds-blue-40": "#77A7FF",
  "--fds-blue-70": "#2851A3", "--fds-blue-80": "#1D3C78", "--fds-button-text": "#444950",
  "--fds-dark-mode-gray-35": "#CCCCCC", "--fds-dark-mode-gray-50": "#828282", "--fds-dark-mode-gray-70": "#4A4A4A",
  "--fds-dark-mode-gray-80": "#373737", "--fds-dark-mode-gray-90": "#282828", "--fds-dark-mode-gray-100": "#1C1C1C",
  "--fds-gray-00": "#F5F6F7", "--fds-gray-05": "#F2F3F5", "--fds-gray-10": "#EBEDF0", "--fds-gray-20": "#DADDE1",
  "--fds-gray-25": "#CCD0D5", "--fds-gray-30": "#BEC3C9", "--fds-gray-45": "#8D949E", "--fds-gray-70": "#606770",
  "--fds-gray-80": "#444950", "--fds-gray-90": "#303338", "--fds-gray-100": "#1C1E21", "--fds-green-55": "#00A400",
  "--fds-green-65": "#51CE70", "--fds-highlight": "#3578E5", "--fds-highlight-cell-background": "#ECF3FF",
  "--fds-red-55": "#FA383E", "--fds-spectrum-aluminum-tint-70": "#E4F0F6",
  "--fds-spectrum-blue-gray-tint-70": "#CFD1D5", "--fds-spectrum-cherry": "#F35369",
  "--fds-spectrum-cherry-tint-70": "#FBCCD2", "--fds-spectrum-grape-tint-70": "#DDD5F0",
  "--fds-spectrum-grape-tint-90": "#F4F1FA", "--fds-spectrum-lemon-dark-1": "#F5C33B",
  "--fds-spectrum-lemon-tint-70": "#FEF2D1", "--fds-spectrum-lime": "#A3CE71",
  "--fds-spectrum-lime-tint-70": "#E4F0D5", "--fds-spectrum-orange-tint-70": "#FCDEC5",
  "--fds-spectrum-orange-tint-90": "#FEF4EC", "--fds-spectrum-seafoam-tint-70": "#CAEEF9",
  "--fds-spectrum-slate-dark-2": "#89A1AC", "--fds-spectrum-slate-tint-70": "#EAEFF2",
  "--fds-spectrum-teal": "#6BCEBB", "--fds-spectrum-teal-dark-1": "#4DBBA6", "--fds-spectrum-teal-dark-2": "#31A38D",
  "--fds-spectrum-teal-tint-70": "#D2F0EA", "--fds-spectrum-teal-tint-90": "#F0FAF8",
  "--fds-spectrum-tomato": "#FB724B", "--fds-spectrum-tomato-tint-30": "#F38E7B",
  "--fds-spectrum-tomato-tint-90": "#FDEFED", "--fds-unified-blue-35": "#1455B0", "--fds-unified-gray-20": "#323436",
  "--fds-white": "#FFFFFF", "--fds-yellow-20": "#FFBA00", "--attachment-footer-background": "rgba(17, 17, 18, 0.1)",
  "--text-badge-info-background": "hsl(214, 89%, 52%)", "--border-focused": "#686A6E",
  "--dataviz-blue-secondary": "#043B72", "--divider-on-color": "#CED0D4", "--event-date": "#D31130",
  "--fb-wordmark": "#0866FF",
  "--filter-primary-deemphasized-button-icon": "invert(28%) sepia(100%) saturate(6042%) hue-rotate(202deg) brightness(96%) contrast(101%)",
  "--glimmer-base-opaque": "#979A9F", "--glimmer-high-contrast-base-opaque": "#65686C",
  "--glimmer-opacity-high-contrast-max": "1", "--glimmer-opacity-high-contrast-min": "0.08",
  "--glimmer-spinner-icon": "#65676B", "--hero-banner-background": "#FFFFFF",
  "--hosted-view-selected-state": "#434648", "--inverse-text": "#F3F4F5", "--list-cell-chevron": "#686A6E",
  "--media-inner-border": "rgba(17, 17, 18, 0.1)", "--media-outer-border": "#FFFFFF",
  "--media-pressed": "rgba(17, 17, 18, 0.3)", "--messenger-card-box-shadow": "0px 1px 2px 0px #0000001A",
  "--messenger-reply-background": "#F0F2F5", "--negative": "#D31130",
  "--non-media-pressed": "rgba(17, 17, 18, 0.15)", "--placeholder-image": "#E0E2E4", "--positive": "#147B29",
  "--positive-background": "#DEEFE1", "--press-overlay": "rgba(0, 0, 0, 0.10)",
  "--primary-deemphasized-button-pressed": "rgb(0,0,0,.05)",
  "--primary-deemphasized-button-pressed-overlay": "rgb(0,0,0,.1)",
  "--progress-ring-neutral-background": "rgba(0, 0, 0, 0.2)", "--progress-ring-neutral-foreground": "#000000",
  "--progress-ring-blue-background": "rgba(24, 119, 242, 0.2)",
  "--progress-ring-blue-foreground": "hsl(214, 89%, 52%)",
  "--progress-ring-disabled-background": "rgba(190,195,201, 0.2)", "--progress-ring-disabled-foreground": "#BEC3C9",
  "--rating-star-active": "#EB660D", "--scroll-thumb": "#BCC0C4",
  "--secondary-button-background-on-dark": "rgba(0, 0, 0, 0.4)", "--shadow-inset": "rgba(255, 255, 255, 0.5)",
  "--switch-active": "#0064E0", "--switch-inactive": "#8F9296", "--switch-unchecked-background-color": "#8F9297",
  "--input-label-color-highlighted": "hsl(214, 89%, 52%)", "--text-input-bar-background": "rgba(255, 255, 255, 0.2)",
  "--text-input-outside-label": "#000000", "--toggle-active-background": "#111112",
  "--toggle-active-icon": "#F3F4F5", "--toggle-active-text": "#F3F4F5",
  "--toggle-button-active-background": "#E7F3FF", "--warning": "#965E03",
  "--chat-bubble-emphasis-ring-after": "black", "--chat-bubble-emphasis-ring-before": "white",
  "--chat-text-blockquote-color-background-line": "rgba(0, 0, 0, 0.12)",
  "--chat-incoming-message-bubble-background-color": "#F0F0F0",
  "--chat-replied-message-background-color": "rgba(0, 0, 0, 0.03)", "--blue-secondary": "rgb(4,59,114)",
  "--blue-tertiary": "rgb(235,245,255)", "--chartreuse-secondary": "rgb(50,65,19)",
  "--chartreuse-tertiary": "rgb(226,255,152)", "--cyan-secondary": "rgb(15,63,93)",
  "--cyan-tertiary": "rgb(231,245,255)", "--dataviz-secondary-1": "rgb(83,78,191)",
  "--dataviz-secondary-2": "rgb(103,96,228)", "--dataviz-supplementary-4": "rgb(51,51,52)",
  "--fuschia-secondary": "rgb(118,14,62)", "--fuschia-tertiary": "rgb(255,241,246)",
  "--green-secondary": "rgb(26,68,27)", "--green-tertiary": "rgb(227,250,224)",
  "--magenta-secondary": "rgb(96,36,91)", "--magenta-tertiary": "rgb(255,239,254)",
  "--orange-secondary": "rgb(94,49,14)", "--orange-tertiary": "rgb(255,241,239)",
  "--purple-secondary": "rgb(55,50,121)", "--purple-tertiary": "rgb(245,241,255)",
  "--red-secondary": "rgb(118,22,27)", "--red-tertiary": "rgb(255,241,239)", "--teal-secondary": "rgb(10,68,56)",
  "--teal-tertiary": "rgb(227,247,241)", "--yellow-secondary": "rgb(72,59,12)",
  "--yellow-tertiary": "rgb(255,246,161)",
  "--emphasized-card-background-blue-comet": "linear-gradient(rgb(192,223,255),rgb(210,232,255))",
  "--emphasized-card-background-green-comet": "linear-gradient(rgb(185,245,170),rgb(205,250,195))",
  "--emphasized-card-background-purple-comet": "linear-gradient(rgb(210, 210, 255),rgb(225,225,253))",
  "--emphasized-card-background-teal-comet": "linear-gradient(rgb(165,240,230),rgb(195,245,240))",
  "--secondary-emphasized-button-stroke": "rgb(0,100,224)", "--stepper-active": "#111112",
  "--stepper-inactive": "#8F9296", "--badge-attention-background-color": "#FAEBA4",
  "--badge-cancelled-background-color": "#B5B7BB", "--badge-critical-background-color": "#FEE4E6",
  "--badge-informational-background-color": "#DBECFF", "--badge-neutral-background-color": "#E9EAEB",
  "--badge-pending-background-color": "#B3B0FE", "--badge-success-background-color": "#DAF0D4",
  "--button-blur-background-adaptive": "rgba(243, 244, 245, 0.7)",
  "--button-blur-background-adaptive-blurred": "rgba(243, 244, 245, 0.7)", "--button-blur-icon-adaptive": "#111112",
  "--button-blur-spinner-progress-adaptive": "#111112",
  "--button-blur-spinner-track-adaptive": "rgba(17, 17, 18, 0.15)", "--button-blur-text-adaptive": "#111112",
  "--button-filled-secondary-icon": "#28292B", "--button-tonal-destructive-background": "#FFF0F2",
  "--button-tonal-destructive-icon": "#D31130", "--button-tonal-destructive-text": "#D31130",
  "--button-tonal-primary-background": "#ECF5FF", "--button-tonal-primary-icon": "#0457CB",
  "--button-tonal-primary-text": "#0457CB", "--chip-background-selected": "#28292B", "--dot-active": "#111112",
  "--dot-inactive": "#8F9296", "--fb-app-wordmark": "#1877F2", "--glimmer": "#383B3D",
  "--glimmer-on-white-background": "#383B3D", "--primary-button-background-on-color": "#FFFFFF",
  "--primary-button-icon-on-color": "#111112", "--primary-button-text-on-color": "#111112",
  "--progress-ring-default-track": "#D1D3D5", "--progress-ring-on-color-button-progress": "#111112",
  "--progress-ring-on-color-button-track": "#D1D3D5", "--progress-ring-on-ghost-primary-button-progress": "#0064E0",
  "--progress-ring-on-ghost-primary-button-track": "rgba(0, 100, 224, 0.15)",
  "--progress-ring-on-ghost-secondary-button-progress": "#111112",
  "--progress-ring-on-ghost-secondary-button-track": "rgba(17, 17, 18, 0.15)",
  "--progress-ring-on-neutral-background-progress": "#111112",
  "--progress-ring-on-neutral-background-track": "#D1D3D5",
  "--progress-ring-on-outline-destructive-button-progress": "#D31130",
  "--progress-ring-on-outline-destructive-button-track": "#FFD8DB",
  "--progress-ring-on-outline-primary-button-progress": "#0064E0",
  "--progress-ring-on-outline-primary-button-track": "#D1D3D5",
  "--progress-ring-on-outline-secondary-button-progress": "#111112",
  "--progress-ring-on-outline-secondary-button-track": "#D1D3D5",
  "--progress-ring-on-primary-destructive-button-progress": "#F3F4F5",
  "--progress-ring-on-primary-destructive-button-track": "#AA071E",
  "--progress-ring-on-secondary-button-track": "rgba(17, 17, 18, 0.15)",
  "--progress-ring-on-tonal-destructive-button-progress": "#D31130",
  "--progress-ring-on-tonal-destructive-button-track": "#FFD8DB",
  "--progress-ring-on-tonal-primary-button-progress": "#0457CB",
  "--progress-ring-on-tonal-primary-button-track": "#CBE5FF",
  "--secondary-button-background-experimental-v1": "#F3F4F5", "--secondary-button-background-on-color": "#E9EAEB",
  "--secondary-button-icon-on-color": "#111112", "--secondary-button-text-on-color": "#111112",
  "--secondary-button-text-variant-3": "#28292B",
  "--secondary-destructive-button-background": "rgba(255, 255, 255, 0.2)",
  "--secondary-destructive-button-icon": "#D31130", "--secondary-destructive-button-stroke": "#D31130",
  "--secondary-destructive-button-text": "#D31130", "--segmented-control-indicator-background": "#FFFFFF",
  "--segmented-control-pressed": "rgba(0, 0, 0, 0.08)",
  "--segmented-control-track-background": "rgba(143, 146, 150, 0.1)", "--slider-handle": "#0064E0",
  "--slider-handle-disabled": "#A1A4A8", "--slider-track-filled": "#0064E0",
  "--slider-track-filled-disabled": "#A1A4A8", "--slider-track-unfilled": "#8F9296",
  "--slider-track-unfilled-disabled": "#E0E2E4", "--text-input-border-focus": "#686A6E",
  "--text-input-label-focus": "#686A6E", "--tile-tonal-container-background-blue": "#ECF5FF",
  "--tile-tonal-container-background-elevated": "#F3F4F5", "--tile-tonal-container-background-green": "#E9F8E5",
  "--tile-tonal-container-background-orange": "#FFF2E4", "--tile-tonal-container-background-purple": "#F3F3FE",
  "--tile-tonal-container-background-rose": "#FFF0F6", "--tile-tonal-container-background-teal": "#E5F7F4",
  "--tile-tonal-container-background-yellow": "#FBF5CF", "--tile-tonal-icon-blue": "#0457CB",
  "--tile-tonal-icon-container-background-blue": "#CBE5FF",
  "--tile-tonal-icon-container-background-elevated": "#F3F4F5",
  "--tile-tonal-icon-container-background-green": "#C6ECBD",
  "--tile-tonal-icon-container-background-orange": "#FFDBB9",
  "--tile-tonal-icon-container-background-purple": "#DFDFFF",
  "--tile-tonal-icon-container-background-rose": "#FCD9E5", "--tile-tonal-icon-container-background-teal": "#B7ECE4",
  "--tile-tonal-icon-container-background-yellow": "#F7E27F", "--tile-tonal-icon-green": "#076D29",
  "--tile-tonal-icon-orange": "#A13F04", "--tile-tonal-icon-purple": "#6B1EFD", "--tile-tonal-icon-rose": "#BB0844",
  "--tile-tonal-icon-teal": "#0F686F", "--tile-tonal-icon-yellow": "#8A5001", "--tile-tonal-text-blue": "#0457CB",
  "--tile-tonal-text-green": "#076D29", "--tile-tonal-text-orange": "#A13F04", "--tile-tonal-text-purple": "#6B1EFD",
  "--tile-tonal-text-rose": "#BB0844", "--tile-tonal-text-teal": "#0F686F", "--tile-tonal-text-yellow": "#8A5001",
  "--toggle-off-icon": "#8F9296", "--toggle-on-icon": "#0064E0", "--variant-1-input-field-experimental": "#28292B",
  "--variant-3-input-field-secondary-experimental": "#DBECFF", "--variants-input-field-blue-experimental": "#0064E0",
};

// Square 2010 corners; small radii only on buttons, chips and tooltips.
const RADII = {
  "--card-corner-radius": "0px",
  "--card-container-radius": "0px",
  "--card-media-inset-radius": "0px",
  "--dialog-corner-radius": "0px",
  "--alert-banner-corner-radius": "0px",
  "--image-corner-radius": "0px",
  "--media-corner-radius": "0px",
  "--media-card-corner-radius": "0px",
  "--media-small-corner-radius": "0px",
  "--media-large-corner-radius": "0px",
  "--glimmer-corner-radius": "0px",
  "--comment-bubble": "0px",
  "--input-corner-radius": "0px",
  "--input-dense-corner-radius": "0px",
  "--nav-list-cell-corner-radius": "0px",
  "--nav-list-cell-corner-radius-dense": "0px",
  "--list-cell-corner-radius": "0px",
  "--menu-item-base-overlay-radius": "0px",
  "--messenger-card-corner-radius": "0px",
  "--button-corner-radius": "2px",
  "--button-corner-radius-medium": "2px",
  "--button-corner-radius-large": "2px",
  "--button-small-corner-radius": "2px",
  "--button-medium-corner-radius": "2px",
  "--button-large-corner-radius": "2px",
  "--chip-corner-radius": "2px",
  "--segmented-control-corner-radius": "2px",
  "--text-badge-corner-radius": "2px",
  "--tooltip-corner-radius": "3px",
  "--toast-corner-radius": "3px",
};

// Flat 2010: no card or button shadows; popovers get a thin border instead.
const SHADOWS = {
  "--card-box-shadow": "none",
  "--shadow-base": "none",
  "--shadow-emphasis": "none",
  "--shadow-elevated": "none",
  "--shadow-persistent": "none",
  "--shadow-responsive": "none",
  "--shadow-1": "transparent",
  "--shadow-2": "transparent",
  "--scroll-shadow": "none",
  "--popover-border-width": "1px",
  "--popover-border-style": "solid",
};

// Type scale: [token prefix, size in px (null = keep Facebook's), line height]. 2010 used 11px for
// almost everything, 13px for story text and actor names, 16px for page headers.
const TYPE_SCALE = [
  ["body", 13, 1.2308],
  ["body-emphasized", 13, 1.2308],
  ["body-medium", 13, 1.2308],
  ["body-medium-emphasized", 13, 1.2308],
  ["body-large", 13, 1.2308],
  ["body-large-emphasized", 13, 1.2308],
  ["body-small", 11, 1.28],
  ["body-small-emphasized", 11, 1.28],
  ["meta", 11, 1.28],
  ["meta-emphasized", 11, 1.28],
  ["primary-label", 11, 1.28],
  ["primary-label-emphasized", 11, 1.28],
  ["secondary-label", 11, 1.28],
  ["secondary-label-emphasized", 11, 1.28],
  ["tertiary-label", 11, 1.28],
  ["label-large", 13, 1.2308],
  ["label-large-emphasized", 13, 1.2308],
  ["label-medium", 11, 1.28],
  ["label-medium-emphasized", 11, 1.28],
  ["label-small", 11, 1.28],
  ["label-small-emphasized", 11, 1.28],
  ["label-extra-small", null],
  ["label-extra-small-emphasized", null],
  ["headline1", 16, 1.25],
  ["headline2", 16, 1.25],
  ["headline3", 13, 1.2308],
  ["headline-large", 16, 1.25],
  ["headline-medium", 16, 1.25],
  ["headline-small", 13, 1.2308],
  ["headline-extra-small", 13, 1.2308],
  ["display-large", null],
  ["display-medium", null],
  ["display-small", null],
  ["display-extra-small", null],
  ["display1", null],
];

// Font-family tokens outside the type scale.
const FAMILY_ONLY = ["--font-family-default", "--font-family-apple", "--font-family-segoe", "--font-family-system-fds", "--text-input-label-font-family"];

/** The type-scale declarations for one font stack. */
function typeTokens(stack) {
  const out = {};
  for (const name of FAMILY_ONLY) out[name] = stack;
  for (const [prefix, px, lineHeight] of TYPE_SCALE) {
    out[`--${prefix}-font-family`] = stack;
    if (px == null) continue;
    out[`--${prefix}-font-size`] = rem(px);
    out[`--${prefix}-line-height`] = String(lineHeight);
  }
  out["--text-input-field-font-family"] = stack;
  out["--text-input-field-font-size"] = rem(11);
  out["--text-input-field-line-height"] = "1.28";
  out["--text-input-label-font-size"] = rem(11);
  return out;
}

/** Every token name themeCss() may write (for the existence test and diagnostics). */
export function themeTokenNames() {
  return [...new Set([...Object.keys({ ...COLORS, ...FILTERS, ...LIGHT_BASE, ...RADII, ...SHADOWS }), ...Object.keys(typeTokens(""))])];
}

/** html[data-mfga-theme]<extra>, with and without Facebook's root mode classes. */
function rootSelector(extra = "") {
  const base = `html[data-mfga-theme]${extra}`;
  return `${base}, ${base}.__fb-light-mode, ${base}.__fb-dark-mode`;
}

const block = (selector, tokens) =>
  `${selector} {\n${Object.entries(tokens).map(([k, v]) => `  ${k}: ${v} !important;`).join("\n")}\n}`;

/** Facebook theme-token overrides under html[data-mfga-theme]; "" when the 2010 theme is off. */
export function themeCss(settings) {
  if (settings?.look?.theme === false) return "";
  const font = FONT_STACKS[settings?.look?.font] ? settings.look.font : "lucida";
  return [
    block(rootSelector(), { ...LIGHT_BASE, ...COLORS, ...FILTERS, ...RADII, ...SHADOWS, ...typeTokens(FONT_STACKS[font]) }),
    // html[data-mfga-font] (set at runtime) wins over the stored setting.
    ...Object.entries(FONT_STACKS).map(([name, stack]) =>
      block(rootSelector(`[data-mfga-font="${name}"]`), Object.fromEntries(Object.entries(typeTokens(stack)).filter(([k]) => k.endsWith("font-family")))),
    ),
    `html[data-mfga-theme] body { background: var(--web-wash); color: var(--primary-text); }`,
  ].join("\n");
}
