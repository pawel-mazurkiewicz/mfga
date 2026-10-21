// Browser harness for test/e2e/dialog.test.mjs: injects the base + dialog CSS and exposes window.mfgaTest.

import { baseCss } from "../../../src/ui/css/base.js";
import { dialogCss, openSettingsDialog } from "../../../src/ui/dialog/settings-dialog.js";
import { openDialog } from "../../../src/ui/dialog/dialog.js";
import { icon, iconCss } from "../../../src/ui/icons.js";
import { h } from "../../../src/ui/dom.js";
import { createSettings, STORAGE_KEY } from "../../../src/shared/settings.js";
import { basePlatform } from "../../../src/shared/platform.js";
import { setLocale } from "../../../src/shared/i18n.js";

document.head.append(h("style#mfga-style", [baseCss(), iconCss(), dialogCss()].join("\n")));

const test = {
  updates: [],
  resets: 0,
  clicks: [],
  closes: 0,
  snapshot: {},
  report: {},
  reportError: null,
  store: null,
  platform: null,
  handle: null,

  /** Fresh settings store (optionally pre-seeded); records every update(patch) and reset(). */
  async setup({ initial = null, snapshot = {}, report = {} } = {}) {
    this.platform = basePlatform({ version: "1.0.0" });
    if (initial) await this.platform.storage.set(STORAGE_KEY, initial);
    const store = await createSettings(this.platform);
    const update = store.update.bind(store);
    const reset = store.reset.bind(store);
    store.update = (patch) => {
      this.updates.push(structuredClone(patch));
      return update(patch);
    };
    store.reset = () => {
      this.resets++;
      return reset();
    };
    // What main.js does on a settings change, as far as this dialog can observe it.
    const applyRoot = (s) => {
      document.documentElement.dataset.mfgaFont = s.look.font;
      setLocale(s.language);
    };
    store.subscribe(applyRoot);
    applyRoot(store.get());
    this.store = store;
    this.snapshot = snapshot;
    this.report = report;
    this.updates.length = 0;
    return store.get();
  },

  openSettings() {
    this.handle = openSettingsDialog({
      settings: this.store,
      healthSnapshot: () => this.snapshot,
      exportReport: async () => {
        if (this.reportError) throw new Error(this.reportError);
        return this.report;
      },
      version: this.platform.version,
    });
  },

  /** Writes settings the way another tab would (storage change event, not through the dialog). */
  async externalChange(next) {
    await this.platform.storage.set(STORAGE_KEY, next);
  },

  settings() {
    return this.store.get();
  },

  /**
   * A generic dialog with a primary button that keeps it open (returns false), an async one that closes after
   * its promise, and a plain one. `plain: true` passes no buttons at all.
   */
  openGeneric({ title = "Confirm Request", text = "Do you want to add Amy Winstead as a friend?", plain = false } = {}) {
    this.clicks.length = 0;
    this.closes = 0;
    const buttons = [
      { label: "Stay Open", primary: true, onClick: () => (this.clicks.push("stay"), false) },
      { label: "Later", onClick: () => new Promise((r) => setTimeout(() => (this.clicks.push("later"), r()), 50)) },
      { label: "Cancel", onClick: () => this.clicks.push("cancel") },
    ];
    this.handle = openDialog({
      title,
      body: plain ? h("p", text) : h("div", h("p", text), h("input.mfga-input#generic-input", { type: "text", placeholder: "Add a personal message..." })),
      buttons: plain ? undefined : buttons,
      onClose: () => this.closes++,
    });
  },

  /** Every base class in one page, for the computed-style checks and the screenshot. */
  gallery() {
    const bar = h("div", { style: { background: "#3B5998", padding: "8px 10px", display: "inline-block" } }, icon("jewel_notifications_on"), " ", h("span.mfga-badge", "65"));
    const box = h(
      "div.mfga-box#g-box",
      { style: { width: "233px" } },
      h("div.mfga-box-title", "Requests", h("a.mfga-see-all", { href: "https://www.facebook.com/reqs.php" }, "See All")),
      h("div", { style: { padding: "4px 0" } }, icon("rc_friend_request"), " ", h("a", { href: "https://www.facebook.com/" }, h("b", "3"), " friend requests")),
    );
    const menu = h(
      "div.mfga-menu#g-menu",
      { style: { width: "200px" } },
      h("a.mfga-menu-item", { href: "https://www.facebook.com/editaccount.php" }, "Account Settings"),
      h("a.mfga-menu-item#g-menu-hover", { href: "https://www.facebook.com/privacy/" }, "Privacy Settings"),
      h("div.mfga-menu-sep"),
      h("a.mfga-menu-item", { href: "https://www.facebook.com/help/" }, "Help Center"),
    );
    const root = h(
      "div.mfga-ui#gallery",
      { style: { padding: "20px", width: "940px", background: "#fff" } },
      h("h1", "Base components"),
      h(
        "p",
        { style: { margin: "8px 0" } },
        "Body text 11px #333 with ",
        h("a#g-link", { href: "https://www.facebook.com/" }, "a link"),
        h("span.mfga-sep"),
        h("span.mfga-muted#g-muted", "26 minutes ago"),
        h("span.mfga-sep", " · "),
        h("a", { href: "https://www.facebook.com/" }, "Comment"),
      ),
      h(
        "div",
        { style: { margin: "10px 0", display: "flex", gap: "8px", alignItems: "flex-start" } },
        h("button.mfga-btn#g-btn", { type: "button" }, icon("rc_become_fan"), "Become a Fan"),
        h("button.mfga-btn.mfga-btn-confirm#g-confirm", { type: "button" }, "Share"),
        h("button.mfga-btn.mfga-btn-small#g-small", { type: "button" }, "Confirm"),
        h("button.mfga-btn#g-disabled", { type: "button", disabled: true }, "Disabled"),
        h("button.mfga-btn.mfga-btn-confirm", { type: "button", disabled: true }, "Disabled"),
        h("a.mfga-btn", { href: "https://www.facebook.com/" }, "Link button"),
      ),
      h(
        "div",
        { style: { margin: "10px 0", display: "flex", gap: "8px", alignItems: "flex-start" } },
        h("input.mfga-input#g-input", { type: "text", placeholder: "Write a comment...", style: { width: "345px" } }),
        h("textarea.mfga-textarea#g-textarea", { placeholder: "What's on your mind?", style: { width: "200px", height: "40px" } }),
        h("select.mfga-input", h("option", "10"), h("option", "20")),
      ),
      h(
        "div",
        { style: { margin: "10px 0", display: "flex", gap: "16px", alignItems: "center" } },
        h("span", "Most Recent ", h("span.mfga-pill#g-pill", "25")),
        bar,
        h("span", h("span.mfga-spinner#g-spinner", { role: "status", "aria-label": "Loading" }), " Loading..."),
      ),
      h("div", { style: { display: "flex", gap: "20px", alignItems: "flex-start", margin: "10px 0" } }, box, menu, h("div", { style: { position: "relative", width: "200px", height: "60px" } }, h("div.mfga-tooltip#g-tooltip", { style: { top: "10px", left: "0" } }, "Add to Favorites"))),
      h("div.mfga-notice#g-notice", { style: { margin: "10px 0" } }, "MFGA could not build the News Feed, so Facebook's own feed is shown, cleaned up."),
      h("div.mfga-error#g-error", "Facebook asked for a security check. MFGA stopped all requests."),
    );
    document.body.append(root);
  },
};

window.mfgaTest = test;
