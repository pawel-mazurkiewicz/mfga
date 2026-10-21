// The 2010 shell: blue bar, left column, right column, footer and chat tab, rendered into #mfga-shell from
// what the chrome reader sees in Facebook's hidden chrome. Which parts show on which route is decided by the
// stylesheet from html[data-mfga-route] (set by src/fb/layout.js).
import { h, replaceChildren } from "../dom.js";
import { safe } from "../../shared/util.js";
import { getLocale } from "../../shared/i18n.js";
import { DEFAULTS } from "../../shared/settings.js";
import { shellHost } from "../../fb/layout.js";
import { createHeader } from "./header.js";
import { renderLeftCol } from "./left-col.js";
import { renderRightCol } from "./right-col.js";
import { renderFooter, renderChatTab } from "./footer.js";
import { leftNavModel, rightColModel, chatTabModel } from "./model.js";

const FB = "https://www.facebook.com";
const STATS_REFRESH_MS = 10000;

const rendered = new WeakMap();

/** Replaces el's children only when the model changed (keeps focus and avoids layout churn). */
function patch(el, model, render) {
  const key = JSON.stringify(model);
  if (rendered.get(el) === key) return;
  rendered.set(el, key);
  replaceChildren(el, render());
}

/**
 * createShell(ctx) with ShellCtx = {settings, reader, navigator, openSettings(), stats(), route}.
 * `settings` may be the settings store or a plain settings object; stats() returns today's
 * {ads, suggested} removal counts. update({route?, settings?}) re-renders (call it after setLocale too).
 */
export function createShell(ctx) {
  const { reader, navigator } = ctx;
  let route = ctx.route || null;
  let settings = ctx.settings;
  let expanded = false;
  const look = () => ((typeof settings?.get === "function" ? settings.get() : settings) || DEFAULTS).look;

  let header = createHeader({ navigator, openSettings: ctx.openSettings });
  let locale = getLocale();
  const left = h("nav.mfga-shell-col.mfga-shell-left");
  const right = h("aside.mfga-shell-col.mfga-shell-right");
  const chatTab = h("button.mfga-chat-tab", { type: "button", onclick: () => navigator.go(`${FB}/messages/`) });
  const footer = h("footer.mfga-footer", h("div.mfga-footer-curve"), renderFooter({ openSettings: ctx.openSettings }));
  const el = h(
    "div.mfga-shell-root",
    h("div.mfga-shell-backdrop"),
    header.el,
    h("div.mfga-shell-page", h("div.mfga-shell-sep"), h("div.mfga-shell-rule"), left, right, footer),
    chatTab,
  );

  // The bar and the footer are built once; a language switch rebuilds them (the columns follow their models).
  const relabel = () => {
    if (getLocale() === locale) return;
    locale = getLocale();
    const next = createHeader({ navigator, openSettings: ctx.openSettings });
    header.el.replaceWith(next.el);
    header.destroy();
    header = next;
    replaceChildren(footer, h("div.mfga-footer-curve"), renderFooter({ openSettings: ctx.openSettings }));
  };

  const render = safe("shell", () => {
    relabel();
    const { chat, rightColumn } = look();
    const identity = reader.identity();
    const counts = reader.counts();
    const contacts = reader.contacts();
    header.update({ identity, counts });

    const leftModel = leftNavModel({ route, identity, counts, shortcuts: reader.shortcuts(), contacts });
    const onMore = () => {
      expanded = true;
      render();
    };
    patch(left, [leftModel, expanded, chat], () => renderLeftCol(leftModel, { expanded, onMore, showChat: chat }));

    right.hidden = !rightColumn;
    if (rightColumn) {
      const rightModel = rightColModel({ counts, birthdays: reader.birthdays(), stats: ctx.stats?.() });
      patch(right, rightModel, () => renderRightCol(rightModel, { openSettings: ctx.openSettings }));
    }

    chatTab.hidden = !chat;
    const chatModel = chatTabModel(contacts);
    chatTab.setAttribute("aria-label", chatModel.label);
    patch(chatTab, chatModel, () => renderChatTab(chatModel));
  });

  // Our anchors carry real hrefs (middle-click and "open in new tab" work); plain clicks stay in the SPA.
  const onClick = (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.("a[href]");
    if (!a || (a.target && a.target !== "_self")) return;
    e.preventDefault();
    navigator.go(a.href);
  };
  el.addEventListener("click", onClick);

  shellHost().appendChild(el);
  const unsubscribeReader = reader.subscribe(render);
  const unsubscribeSettings = typeof settings?.subscribe === "function" ? settings.subscribe(render) : null;
  const statsTimer = setInterval(render, STATS_REFRESH_MS);
  render();

  return {
    el,
    update(state = {}) {
      if (state.route) route = state.route;
      if (state.settings) settings = state.settings;
      render();
    },
    destroy() {
      clearInterval(statsTimer);
      unsubscribeReader?.();
      unsubscribeSettings?.();
      header.destroy();
      el.remove();
    },
  };
}
