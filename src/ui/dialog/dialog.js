// The 2010 pop_dialog: a modal over a translucent page overlay, with the dark translucent frame, the
// #6D84B4 title bar and the grey button footer. Focus is trapped inside the top-most dialog, Esc closes it,
// and focus returns to whatever had it before the dialog opened.

import { h } from "../dom.js";
import { safe } from "../../shared/util.js";
import { registerStrings, t } from "../../shared/i18n.js";
import { dialogCss } from "./dialog-css.js";

export { dialogCss };

registerStrings({
  en: { "dialog.close": "Close", "dialog.cancel": "Cancel" },
  pl: { "dialog.close": "Zamknij", "dialog.cancel": "Anuluj" },
});

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const stack = []; // open dialogs, top-most last
let seq = 0;

/** Visible, enabled Tab stops inside `root`, in DOM order (one per radio group, like the browser). */
function tabbables(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0 && isRadioTabStop(el, root));
}

function isRadioTabStop(el, root) {
  if (el.type !== "radio" || !el.name) return true;
  const group = [...root.querySelectorAll(`input[type=radio][name="${CSS.escape(el.name)}"]`)];
  return el === (group.find((r) => r.checked) || group[0]);
}

/**
 * openDialog({ title, body, buttons, width }) -> { close() }
 *   title    string or Node, shown in the blue title bar (also the dialog's accessible name)
 *   body     Node
 *   buttons  [{ label, primary, onClick }]: onClick({ close }) may return false (or a promise of false) to keep
 *            the dialog open; any other result closes it. Without buttons a "Close" button is shown.
 *   width    outer width in px, frame included (2010's generic dialog was 465)
 * Extras: note (footer text on the left), focus (element to focus first), onClose(), className.
 */
export function openDialog({ title, body, buttons = [], width = 465, note = null, focus = null, onClose = null, className = null }) {
  const id = `mfga-dialog-${++seq}`;
  const opener = document.activeElement;
  let closed = false;
  const handle = {
    close() {
      if (closed) return;
      closed = true;
      stack.splice(stack.indexOf(handle), 1);
      document.removeEventListener("focusin", onFocusIn, true);
      layer.remove();
      if (opener && opener.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
      if (onClose) safe("dialog", onClose, { disableOnError: false })();
    },
  };
  const isTop = () => stack[stack.length - 1] === handle;
  const footerButtons = (buttons?.length ? buttons : [{ label: t("dialog.close") }]).map((b) => renderButton(b, handle));

  const dialog = h(
    "div.mfga-dialog",
    { class: className, role: "dialog", "aria-modal": "true", "aria-labelledby": `${id}-title`, tabindex: "-1", style: { width } },
    h(
      "div.mfga-dialog-content",
      h("h2.mfga-dialog-title", { id: `${id}-title` }, title),
      h("div.mfga-dialog-body", body),
      h("div.mfga-dialog-footer", note ? h("div.mfga-dialog-note", note) : null, footerButtons),
    ),
  );
  const layer = h("div.mfga-ui.mfga-dialog-layer", { dataset: { mfgaDialog: id } }, dialog);

  function onKeyDown(ev) {
    // Our keystrokes are ours: Facebook's document-level shortcuts must not react to typing in the dialog.
    ev.stopPropagation();
    if (!isTop()) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      handle.close();
    } else if (ev.key === "Tab") {
      trapTab(ev, dialog);
    }
  }

  function onFocusIn(ev) {
    if (isTop() && !dialog.contains(ev.target)) focusFirst(dialog);
  }

  // Clicking the overlay closes the dialog; mousedown on it must not move focus out of the dialog.
  let downOnLayer = false;
  layer.addEventListener("mousedown", (ev) => {
    downOnLayer = ev.target === layer;
    if (downOnLayer) ev.preventDefault();
  });
  layer.addEventListener("click", (ev) => {
    if (ev.target === layer && downOnLayer && isTop()) handle.close();
  });
  layer.addEventListener("keydown", onKeyDown);
  layer.addEventListener("keyup", stopPropagation);
  layer.addEventListener("keypress", stopPropagation);

  stack.push(handle);
  document.body.appendChild(layer);
  document.addEventListener("focusin", onFocusIn, true);
  if (focus && dialog.contains(focus)) focus.focus({ preventScroll: true });
  else focusFirst(dialog);
  return handle;
}

function stopPropagation(ev) {
  ev.stopPropagation();
}

function renderButton({ label, primary = false, onClick = null }, handle) {
  return h(
    "button.mfga-btn",
    {
      type: "button",
      class: primary ? "mfga-btn-confirm" : null,
      onclick: safe(
        "dialog",
        () => {
          const result = onClick ? onClick({ close: handle.close }) : undefined;
          if (result && typeof result.then === "function") {
            return result.then((r) => {
              if (r !== false) handle.close();
            });
          }
          if (result !== false) handle.close();
          return undefined;
        },
        { disableOnError: false },
      ),
    },
    label,
  );
}

/** Focuses the first Tab stop of the body; else the last footer button (usually the safe "Cancel"). */
function focusFirst(dialog) {
  const target =
    tabbables(dialog.querySelector(".mfga-dialog-body"))[0] || tabbables(dialog.querySelector(".mfga-dialog-footer")).at(-1) || dialog;
  target.focus({ preventScroll: true });
}

function trapTab(ev, dialog) {
  const items = tabbables(dialog);
  if (!items.length) {
    ev.preventDefault();
    dialog.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const inside = items.includes(active);
  if (ev.shiftKey && (active === first || !inside)) {
    ev.preventDefault();
    last.focus();
  } else if (!ev.shiftKey && (active === last || !inside)) {
    ev.preventDefault();
    first.focus();
  }
}
