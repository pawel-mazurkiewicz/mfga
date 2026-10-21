// Browser entry for test/e2e/native.test.mjs: exposes the native-path modules on window.__mfgaNative.
import { startCleaner, detectUnit, createLabelCache, labelResolver } from "../../../src/fb/cleaner.js";
import { startSkin } from "../../../src/fb/skin.js";
import { themeCss } from "../../../src/ui/css/theme.js";
import { nativeCss } from "../../../src/ui/css/native.js";
import { DEFAULTS, sanitize } from "../../../src/shared/settings.js";
import { setLocale } from "../../../src/shared/i18n.js";

/** A minimal settings store (get/update/subscribe) like createSettings(), without storage. */
function memorySettings(patch = {}) {
  let current = sanitize(structuredClone({ ...DEFAULTS, ...patch }));
  const subs = new Set();
  return {
    get: () => current,
    update(next) {
      const prev = current;
      current = sanitize({ ...current, ...next, clean: { ...current.clean, ...next.clean }, look: { ...current.look, ...next.look } });
      for (const fn of subs) fn(current, prev);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

/** Injects the MFGA stylesheet and root attributes the way src/main.js does. */
function installStyle(settings) {
  const root = document.documentElement;
  root.setAttribute("data-mfga", "");
  root.setAttribute("data-mfga-theme", "2010");
  root.setAttribute("data-mfga-skin", "");
  root.setAttribute("data-mfga-font", settings.look.font);
  const style = document.createElement("style");
  style.id = "mfga-style";
  style.textContent = `${themeCss(settings)}\n${nativeCss(settings)}`;
  document.head.append(style);
}

/** A fresh copy of a fixture unit's slot (no MFGA marks), renamed `name` at aria-posinset `pos`. */
function cloneSlot(from, name, pos) {
  const slot = document.querySelector(`[data-fixture="${from}"]`).closest(".fx-slot").cloneNode(true);
  for (const el of [slot, ...slot.querySelectorAll("*")]) {
    for (const a of [...el.attributes]) if (a.name.startsWith("data-mfga")) el.removeAttribute(a.name);
  }
  const unit = slot.querySelector("[aria-posinset]");
  unit.setAttribute("aria-posinset", String(pos));
  unit.dataset.fixture = name;
  return slot;
}

window.__mfgaNative = {
  cloneSlot,
  startCleaner,
  startSkin,
  themeCss,
  nativeCss,
  detectUnit,
  createLabelCache,
  labelResolver,
  memorySettings,
  installStyle,
  setLocale,
  DEFAULTS,
};
