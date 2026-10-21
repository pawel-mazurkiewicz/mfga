// The 2010 page grid in CSS px (retro-spec-2010 §2), shared by the stylesheet and the layout measurer.

export const GRID = Object.freeze({
  page: 980, // centred page container
  bar: 41, // blue bar height (2010: no bottom border)
  top: 20, // gap between the bar and the columns' content
  left: { x: 0, w: 179 }, // left column, then the 1px #CCC separator at x=179
  content: { x: 195, w: 520 }, // centre column (#contentArea)
  wide: { x: 195, w: 680 }, // centre column without a right column (groups feed): Facebook's own feed width
  right: { x: 730, w: 233 }, // right column
  rule: 979, // 1px #EDEDED page rule
  footerGap: 20, // space between the tallest column and the footer
});

/** Left edge of the page container for a viewport (document) width. */
export function pageLeft(viewportWidth) {
  return Math.max(0, (viewportWidth - GRID.page) / 2);
}

/** Document-coordinate rectangle the [role=main] column must occupy in a layout mode, or null. */
export function mainSlot(mode, viewportWidth) {
  const col = mode === "home" ? GRID.content : mode === "groups-feed" ? GRID.wide : null;
  if (!col) return null;
  return { left: pageLeft(viewportWidth) + col.x, top: GRID.bar + GRID.top, width: col.w };
}
