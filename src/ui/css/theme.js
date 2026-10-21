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

// Facebook's own light values for tokens that would otherwise stay dark when <html> is in dark mode.
const LIGHT_BASE = {
  "--attachment-footer-background": "rgba(17, 17, 18, 0.1)",
  "--divider-on-color": "#CED0D4",
  "--inverse-text": "#F3F4F5",
  "--list-cell-chevron": "#686A6E",
  "--media-inner-border": "rgba(17, 17, 18, 0.1)",
  "--media-outer-border": "#FFFFFF",
  "--media-pressed": "rgba(17, 17, 18, 0.3)",
  "--non-media-pressed": "rgba(17, 17, 18, 0.15)",
  "--press-overlay": "rgba(0, 0, 0, 0.10)",
  "--placeholder-image": "#E0E2E4",
  "--scroll-thumb": "#BCC0C4",
  "--shadow-inset": "rgba(255, 255, 255, 0.5)",
  "--secondary-button-background-on-dark": "rgba(0, 0, 0, 0.4)",
  "--text-input-bar-background": "rgba(255, 255, 255, 0.2)",
  "--text-input-outside-label": "#000000",
  "--toggle-active-background": "#111112",
  "--toggle-active-icon": "#F3F4F5",
  "--toggle-active-text": "#F3F4F5",
  "--chip-background-selected": "#28292B",
  "--segmented-control-indicator-background": "#FFFFFF",
  "--segmented-control-pressed": "rgba(0, 0, 0, 0.08)",
  "--positive": "#147B29",
  "--positive-background": "#DEEFE1",
  "--negative": "#D31130",
  "--warning": "#965E03",
  "--nav-bar-background-gradient":
    "linear-gradient(to top, #FFFFFF, rgba(255,255,255,.9), rgba(255,255,255,.7), rgba(255,255,255,.4), rgba(255,255,255,0))",
  "--nav-bar-background-gradient-wash":
    "linear-gradient(to top, #FFFFFF, rgba(255,255,255,.9), rgba(255,255,255,.7), rgba(255,255,255,.4), rgba(255,255,255,0))",
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
