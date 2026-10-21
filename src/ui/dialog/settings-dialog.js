// The MFGA settings dialog: a 2010 pop_dialog with Account Settings style tabs (News Feed, Clean-up, Look,
// Health, About). Every control applies at once through settings.update(patch); there is no Save button.

import { h } from "../dom.js";
import { safe } from "../../shared/util.js";
import { DEFAULTS } from "../../shared/settings.js";
import { setLocale, t } from "../../shared/i18n.js";
import { openDialog } from "./dialog.js";
import { dialogCss } from "./dialog-css.js";
import { createBinder, row, uid } from "./controls.js";
import { healthPanel } from "./health.js";
import { aboutPanel } from "./about.js";
import { FEED_SOURCES, pageSizeOptions, sourcesPatch, welcomePatch } from "./settings-model.js";
import "./strings.js";

export { dialogCss };

const TABS = ["feed", "clean", "look", "health", "about"];
const WIDTH = 580;
const CLEAN_KEYS = Object.keys(DEFAULTS.clean);
const LANGUAGES = [
  { value: "en", label: "English (US)" },
  { value: "pl", label: "Polski" },
];

let lastTab = "feed"; // reopening the dialog returns to the tab it was closed on

/**
 * openSettingsDialog({ settings, healthSnapshot, exportReport }) -> { close() }
 *   settings        the store from createSettings() (get, update, reset, subscribe)
 *   healthSnapshot  () => object (or a promise): health.snapshot() plus anything main.js adds
 *   exportReport    () => object (or a promise): the diagnostics report; it is anonymised again before saving
 *   version         optional MFGA version for the About tab (platform.version)
 */
export function openSettingsDialog({ settings, healthSnapshot, exportReport, version = null }) {
  let dialog = null;
  let binder = null;
  let reopening = false;
  let unsubscribe = null;

  function open(focusSetting = null) {
    const current = createBinder(settings);
    binder = current;
    const view = buildView({ binder: current, settings, healthSnapshot, exportReport, version });
    current.sync(settings.get());
    const focus = (focusSetting && view.el.querySelector(`[data-mfga-setting="${focusSetting}"]`)) || view.selectedTab();
    dialog = openDialog({
      title: t("settings.title"),
      body: view.el,
      width: WIDTH,
      note: t("settings.saved"),
      focus,
      className: "mfga-settings-dialog",
      onClose: () => {
        current.flush();
        view.dispose();
        if (!reopening) unsubscribe?.();
      },
    });
  }

  // A language change re-renders the whole dialog in the new language, keeping the tab and the focus.
  function onSettings(next, prev) {
    if (next.language === prev?.language) {
      binder.sync(next);
      return;
    }
    setLocale(next.language);
    reopening = true;
    dialog.close();
    reopening = false;
    open("language");
  }

  open();
  unsubscribe = settings.subscribe?.(safe("settings-dialog", onSettings, { disableOnError: false }));
  return { close: () => dialog.close() };
}

function buildView(ctx) {
  const panels = {
    feed: feedPanel(ctx),
    clean: cleanPanel(ctx),
    look: lookPanel(ctx),
    health: healthPanel(ctx),
    about: aboutPanel(ctx),
  };
  const ids = Object.fromEntries(TABS.map((name) => [name, uid(`tab-${name}`)]));
  const tabs = {};
  const panelEls = {};
  for (const name of TABS) {
    tabs[name] = h(
      "button.mfga-settings-tab",
      { type: "button", role: "tab", id: ids[name], "aria-controls": `${ids[name]}-panel`, onclick: () => select(name) },
      t(`settings.tab.${name}`),
    );
    panelEls[name] = h(
      "div.mfga-settings-panel",
      { role: "tabpanel", id: `${ids[name]}-panel`, "aria-labelledby": ids[name], dataset: { mfgaTab: name } },
      panels[name].el,
    );
  }

  function select(name, { focus = false } = {}) {
    lastTab = name;
    for (const n of TABS) {
      tabs[n].setAttribute("aria-selected", String(n === name));
      tabs[n].tabIndex = n === name ? 0 : -1;
      panelEls[n].hidden = n !== name;
    }
    panels[name].onShow?.();
    if (focus) tabs[name].focus();
  }

  const tablist = h("div.mfga-settings-tabs", { role: "tablist" }, TABS.map((n) => tabs[n]));
  tablist.addEventListener("keydown", (ev) => {
    const i = TABS.indexOf(lastTab);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[ev.key];
    if (next === undefined) return;
    ev.preventDefault();
    select(TABS[(next + TABS.length) % TABS.length], { focus: true });
  });

  select(TABS.includes(lastTab) ? lastTab : "feed");
  return {
    el: h("div.mfga-settings", tablist, TABS.map((n) => panelEls[n])),
    selectedTab: () => tabs[lastTab],
    dispose: () => panels.health.dispose(),
  };
}

function feedPanel({ binder, settings }) {
  const sourcesError = h("div.mfga-settings-inline-error", { role: "alert", hidden: true });
  binder.onSync(() => {
    sourcesError.hidden = true;
  });
  const refuseSource = () => {
    sourcesError.textContent = t("settings.feed.oneSource");
    sourcesError.hidden = false;
  };
  const sources = h(
    "div",
    FEED_SOURCES.map((name) =>
      binder.checkbox(`feed.sources.${name}`, t(`settings.feed.${name}`), {
        inline: true,
        patch: (checked, s) => sourcesPatch(s.feed.sources, name, checked),
        onRefuse: refuseSource,
      }),
    ),
  );
  binder.enableWhen(sources, (s) => s.feed.mode === "recent");

  return {
    el: h(
      "div",
      row(
        t("settings.feed.show"),
        () =>
          binder.radios("feed.mode", [
            { value: "recent", label: t("settings.feed.recent"), hint: t("settings.feed.recentHint") },
            { value: "top", label: t("settings.feed.top"), hint: t("settings.feed.topHint") },
          ]),
        { role: "radiogroup" },
      ),
      row(t("settings.feed.sources"), () => [sources, h("div.mfga-settings-hint", t("settings.feed.sourcesHint")), sourcesError], {
        role: "group",
      }),
      row(
        t("settings.feed.more"),
        () =>
          binder.radios("feed.autoLoad", [
            { value: false, label: t("settings.feed.olderButton") },
            { value: true, label: t("settings.feed.autoLoad") },
          ]),
        { role: "radiogroup" },
      ),
      row(t("settings.feed.pageSize"), (labelId) =>
        binder.select(
          "feed.pageSize",
          pageSizeOptions(settings.get().feed.pageSize).map((n) => ({ value: n, label: String(n) })),
          { labelledBy: labelId, parse: Number },
        ),
      ),
      row(t("settings.feed.comments"), () => binder.checkbox("feed.previewComments", t("settings.feed.previewComments"))),
      row(t("settings.feed.ai"), () => binder.checkbox("feed.hideAI", t("settings.feed.hideAI"))),
      row(t("settings.feed.keywords"), (labelId) => {
        const hintId = uid("hint");
        return [
          binder.listTextarea("feed.keywords", { class: "mfga-settings-keywords", "aria-labelledby": labelId, "aria-describedby": hintId }),
          h("div.mfga-settings-hint", { id: hintId }, t("settings.feed.keywordsHint")),
        ];
      }),
    ),
  };
}

function cleanPanel({ binder }) {
  return {
    el: h(
      "div",
      h("p.mfga-settings-intro.mfga-muted", t("settings.clean.intro")),
      row(t("settings.clean.hide"), () => CLEAN_KEYS.map((key) => binder.checkbox(`clean.${key}`, t(`settings.clean.${key}`))), {
        role: "group",
      }),
    ),
  };
}

function lookPanel({ binder }) {
  const shellParts = h(
    "div.mfga-settings-sub",
    ["fixedHeader", "rightColumn", "chat"].map((key) => binder.checkbox(`look.${key}`, t(`settings.look.${key}`))),
    binder.checkbox("look.welcome", t("settings.look.welcome"), { patch: welcomePatch }),
  );
  binder.enableWhen(shellParts, (s) => s.look.shell);

  return {
    el: h(
      "div",
      row(t("settings.look.page"), () => [binder.checkbox("look.shell", t("settings.look.shell")), shellParts], { role: "group" }),
      row(
        t("settings.look.style"),
        () => [binder.checkbox("look.theme", t("settings.look.theme")), binder.checkbox("look.skinPosts", t("settings.look.skinPosts"))],
        { role: "group" },
      ),
      row(
        t("settings.look.font"),
        () =>
          binder.radios(
            "look.font",
            [
              { value: "lucida", label: "Lucida Grande", className: "mfga-settings-font-lucida" },
              { value: "tahoma", label: "Tahoma", className: "mfga-settings-font-tahoma" },
            ],
            { inline: true },
          ),
        { role: "radiogroup" },
      ),
      row(t("settings.look.language"), (labelId) =>
        binder.select("language", [{ value: "auto", label: t("settings.look.auto") }, ...LANGUAGES], { labelledBy: labelId }),
      ),
    ),
  };
}
