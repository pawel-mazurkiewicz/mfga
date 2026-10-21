// Form controls bound to one settings path each. A control hands its patch to settings.update() as soon as it
// changes, and registers a sync function so the dialog follows changes made anywhere else (another tab,
// "Reset settings"). Every input carries data-mfga-setting="<path>".

import { h } from "../dom.js";
import { get, safe } from "../../shared/util.js";
import { formatKeywords, parseKeywords, patchFor, sameList } from "./settings-model.js";

const KEYWORDS_DELAY_MS = 600;

let seq = 0;
export const uid = (prefix) => `mfga-settings-${prefix}-${++seq}`;

const read = (s, path) => get(s, ...path.split("."));

/** A labelled form row (FB's .uiInfoTable): bold grey label on the left, controls on the right. */
export function row(label, build, { role = null } = {}) {
  const labelId = uid("label");
  return h(
    "div.mfga-settings-row",
    h("div.mfga-settings-label", { id: labelId }, label),
    h("div.mfga-settings-field", { role, "aria-labelledby": role ? labelId : null }, build(labelId)),
  );
}

export function createBinder(settings) {
  const syncs = [];
  const flushers = [];
  const apply = safe("settings-dialog", (patch) => settings.update(patch), { disableOnError: false });
  const onSync = (fn) => syncs.push(fn);

  function hinted(control, hint) {
    if (!hint) return control;
    const id = uid("hint");
    control.querySelector("input").setAttribute("aria-describedby", id);
    return [control, h("div.mfga-settings-hint", { id }, hint)];
  }

  return {
    apply,
    onSync,

    sync(s = settings.get()) {
      for (const fn of syncs) fn(s);
    },

    /** Commits pending typing (the keyword list waits for a pause); called when the dialog closes. */
    flush() {
      for (const fn of flushers) fn();
    },

    /**
     * Checkbox for a boolean path. `patch(checked, settings)` may return null to refuse the change: the box
     * flips back and `onRefuse()` runs.
     */
    checkbox(path, label, { hint = null, inline = false, patch = (checked) => patchFor(path, checked), onRefuse = null } = {}) {
      const input = h("input", { type: "checkbox", dataset: { mfgaSetting: path } });
      input.addEventListener("change", () => {
        const p = patch(input.checked, settings.get());
        if (p) {
          apply(p);
        } else {
          input.checked = !input.checked;
          onRefuse?.();
        }
      });
      onSync((s) => {
        input.checked = !!read(s, path);
      });
      const control = h("label.mfga-settings-check", { class: inline ? "mfga-settings-check-inline" : null }, input, h("span", label));
      return hinted(control, hint);
    },

    /** Radio buttons; option values keep their type (booleans stay booleans in the patch). */
    radios(path, options, { inline = false } = {}) {
      const name = uid("radio");
      const inputs = options.map((o) => {
        const input = h("input", { type: "radio", name, value: String(o.value), dataset: { mfgaSetting: path } });
        input.addEventListener("change", () => input.checked && apply(patchFor(path, o.value)));
        return input;
      });
      onSync((s) => {
        const v = String(read(s, path));
        for (const input of inputs) input.checked = input.value === v;
      });
      return options.map((o, i) =>
        hinted(
          h(
            "label.mfga-settings-check",
            { class: inline ? "mfga-settings-check-inline" : null },
            inputs[i],
            h("span", { class: o.className }, o.label),
          ),
          o.hint,
        ),
      );
    },

    /** <select>; `parse` turns the option string back into the setting's type. */
    select(path, options, { labelledBy, parse = (v) => v } = {}) {
      const select = h(
        "select.mfga-input",
        { dataset: { mfgaSetting: path }, "aria-labelledby": labelledBy },
        options.map((o) => h("option", { value: String(o.value) }, o.label)),
      );
      select.addEventListener("change", () => apply(patchFor(path, parse(select.value))));
      onSync((s) => {
        const v = String(read(s, path));
        if (![...select.options].some((o) => o.value === v)) select.append(h("option", { value: v }, v));
        select.value = v;
      });
      return select;
    },

    /** Textarea holding a string list, one item per line; saved after a pause in typing and on blur. */
    listTextarea(path, attrs = {}) {
      const textarea = h("textarea.mfga-textarea", { rows: 4, spellcheck: "false", dataset: { mfgaSetting: path }, ...attrs });
      let timer = 0;
      const commit = () => {
        clearTimeout(timer);
        const next = parseKeywords(textarea.value);
        if (!sameList(next, read(settings.get(), path) || [])) apply(patchFor(path, next));
      };
      textarea.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(commit, KEYWORDS_DELAY_MS);
      });
      textarea.addEventListener("change", commit);
      flushers.push(commit);
      onSync((s) => {
        if (document.activeElement !== textarea) textarea.value = formatKeywords(read(s, path));
      });
      return textarea;
    },

    /** Greys out and disables every control inside `el` while `predicate(settings)` is false. */
    enableWhen(el, predicate) {
      onSync((s) => {
        const on = !!predicate(s);
        el.classList.toggle("mfga-settings-off", !on);
        for (const input of el.querySelectorAll("input, select, textarea")) input.disabled = !on;
      });
      return el;
    },
  };
}
