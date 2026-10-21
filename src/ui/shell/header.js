// The 2010 blue bar (retro-spec §3): logo, jewels with red count badges, search, Home · Profile · Account ▾
// and the 2010 account menu.
import { h, replaceChildren, safeUrl } from "../dom.js";
import { icon } from "../icons.js";
import { t } from "../../shared/i18n.js";
import { health } from "../../shared/util.js";
import { findAccountButton } from "../../fb/chrome-reader.js";
import { badgeText } from "./model.js";
import "./strings.js";

const FB = "https://www.facebook.com";

const JEWELS = [
  { key: "requests", count: "friendRequests", href: `${FB}/friends/requests/`, label: "header.requests" },
  { key: "messages", count: "messages", href: `${FB}/messages/`, label: "header.messages" },
  { key: "notifications", count: "notifications", href: `${FB}/notifications/`, label: "header.notifications" },
];

function jewel(spec) {
  const el = h(`a.mfga-header-jewel.mfga-header-jewel-${spec.key}`, { href: spec.href, title: t(spec.label), "aria-label": t(spec.label) });
  return { spec, el, count: -1 };
}

function setJewelCount(j, n) {
  const count = Number.isFinite(n) ? n : 0;
  if (count === j.count) return;
  j.count = count;
  const badge = badgeText(count);
  const label = badge ? `${t(j.spec.label)} (${badge})` : t(j.spec.label);
  j.el.setAttribute("aria-label", label);
  replaceChildren(j.el, icon(`jewel_${j.spec.key}_${badge ? "on" : "off"}`), badge && h("span.mfga-header-count", badge));
}

/**
 * Shows Facebook's own banner for a moment and opens its account menu (the only safe way to log out: the
 * logout form carries a per-session token). Hidden again once the menu closes.
 */
function revealNativeAccountMenu(navigator) {
  const btn = findAccountButton(document);
  if (!btn) {
    health.count("header.logout-fallback");
    navigator.go(`${FB}/settings/`);
    return;
  }
  const html = document.documentElement;
  let opened = false;
  const done = () => {
    html.removeAttribute("data-mfga-native-banner");
    mo.disconnect();
    document.removeEventListener("mousedown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
  };
  const mo = new MutationObserver(() => {
    if (btn.getAttribute("aria-expanded") === "true") opened = true;
    else if (opened) done();
  });
  const onDown = (e) => {
    if (!e.target.closest?.('[role="banner"], [role="dialog"]')) done();
  };
  const onKey = (e) => {
    if (e.key === "Escape") done();
  };
  html.setAttribute("data-mfga-native-banner", "");
  mo.observe(btn, { attributes: true, attributeFilter: ["aria-expanded"] });
  document.addEventListener("mousedown", onDown, true);
  document.addEventListener("keydown", onKey, true);
  health.count("header.logout-native");
  btn.click();
}

/**
 * createHeader({navigator, openSettings}) → {el, update({identity, counts}), destroy()}.
 * Links are plain anchors; the shell's delegated click handler routes them through the navigator.
 */
export function createHeader({ navigator, openSettings }) {
  const jewels = JEWELS.map(jewel);
  const input = h("input.mfga-header-search-input", { type: "text", name: "q", placeholder: t("header.search"), "aria-label": t("header.search"), autocomplete: "off", enterkeyhint: "search" });
  const search = h(
    "form.mfga-header-search",
    {
      role: "search",
      onsubmit: (e) => {
        e.preventDefault();
        const q = input.value.trim();
        if (q) navigator.go(`${FB}/search/top/?q=${encodeURIComponent(q)}`);
        else input.focus();
      },
    },
    input,
    h("button.mfga-header-search-btn", { type: "submit", "aria-label": t("header.search") }, icon("search_glass")),
  );

  const profileLink = h("a.mfga-header-link", { href: `${FB}/me/` }, t("header.profile"));
  const menu = h("ul.mfga-header-menu", { role: "menu", hidden: true });
  const accountBtn = h(
    "button.mfga-header-link.mfga-header-account-btn",
    { type: "button", "aria-haspopup": "menu", "aria-expanded": "false" },
    t("header.account"),
    h("span.mfga-header-arrow", { "aria-hidden": "true" }),
  );
  const account = h("li.mfga-header-account", accountBtn, menu);
  const el = h(
    "div.mfga-header",
    h(
      "div.mfga-header-page",
      h("a.mfga-header-logo", { href: `${FB}/`, "aria-label": "Facebook", title: t("header.home") }, icon("logo_header")),
      h("div.mfga-header-jewels", jewels.map((j) => j.el)),
      h(
        "div.mfga-header-nav",
        search,
        h("ul.mfga-header-links", h("li", h("a.mfga-header-link", { href: `${FB}/` }, t("header.home"))), h("li", profileLink), account),
      ),
    ),
  );

  const setOpen = (open) => {
    menu.hidden = !open;
    account.classList.toggle("mfga-open", open);
    el.classList.toggle("mfga-header-open", open);
    accountBtn.setAttribute("aria-expanded", String(open));
    if (open) menu.querySelector(".mfga-header-menu-item")?.focus();
  };
  const action = (label, run) => {
    const onclick = () => {
      setOpen(false);
      run();
    };
    return h("li", { role: "none" }, h("button.mfga-header-menu-item", { type: "button", role: "menuitem", onclick }, label));
  };
  const link = (label, href) => h("li", { role: "none" }, h("a.mfga-header-menu-item", { role: "menuitem", href, onclick: () => setOpen(false) }, label));
  const sep = () => h("li.mfga-header-menu-sep", { role: "separator" });
  replaceChildren(
    menu,
    link(t("header.editFriends"), `${FB}/friends/`),
    sep(),
    link(t("header.accountSettings"), `${FB}/settings/`),
    link(t("header.privacySettings"), `${FB}/settings/?tab=privacy`),
    action(t("header.mfgaSettings"), () => openSettings?.()),
    sep(),
    link(t("header.help"), `${FB}/help/`),
    sep(),
    action(t("header.logout"), () => revealNativeAccountMenu(navigator)),
  );

  accountBtn.addEventListener("click", () => setOpen(menu.hidden));
  const onDocDown = (e) => {
    if (!menu.hidden && !account.contains(e.target)) setOpen(false);
  };
  const onKey = (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      setOpen(false);
      accountBtn.focus();
    }
  };
  document.addEventListener("mousedown", onDocDown, true);
  document.addEventListener("keydown", onKey, true);

  return {
    el,
    update({ identity, counts }) {
      for (const j of jewels) setJewelCount(j, counts?.[j.spec.count]);
      const url = safeUrl(identity?.url);
      if (url) profileLink.setAttribute("href", url);
    },
    destroy() {
      document.removeEventListener("mousedown", onDocDown, true);
      document.removeEventListener("keydown", onKey, true);
    },
  };
}
