// The 2010 icon set: original Facebook 2009/2012 sprites packed into one atlas (tools/make-atlas.py).
import { ATLAS_URL, ICONS } from "../generated/atlas.js";
import { h } from "./dom.js";

export const ICON_NAMES = Object.freeze(Object.keys(ICONS));

/** CSS for `.mfga-ico` and one `.mfga-ico-<name>` class per icon. Inject once. */
export function iconCss() {
  const rules = [
    `.mfga-ico{display:inline-block;flex:none;vertical-align:middle;background-image:url("${ATLAS_URL}");background-repeat:no-repeat;image-rendering:auto}`,
  ];
  for (const [name, b] of Object.entries(ICONS)) {
    rules.push(`.mfga-ico-${name}{width:${b.w}px;height:${b.h}px;background-position:-${b.x}px -${b.y}px}`);
  }
  return rules.join("\n");
}

/** <i class="mfga-ico mfga-ico-name"> (decorative unless a label is given). */
export function icon(name, { label = null, className = "" } = {}) {
  if (!ICONS[name]) throw new Error(`unknown icon ${name}`);
  return h("i", {
    class: ["mfga-ico", `mfga-ico-${name}`, className],
    role: label ? "img" : null,
    "aria-label": label,
    "aria-hidden": label ? null : "true",
  });
}

/** Size of an icon, for layout code that needs it. */
export function iconSize(name) {
  const b = ICONS[name];
  return b ? { w: b.w, h: b.h } : null;
}

export { ATLAS_URL };
