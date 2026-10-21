// The 2010 left column (retro-spec §4): profile picture and name, the side nav, the viewer's groups and
// Pages from Facebook's shortcuts, and "Chat with Friends".
import { h } from "../dom.js";
import { icon } from "../icons.js";
import { t } from "../../shared/i18n.js";
import "./strings.js";

function count(n) {
  return n > 0 ? [" ", h("span.mfga-nav-count", `(${n})`)] : null;
}

function navRow(item) {
  return h(
    "li.mfga-nav-item",
    { class: item.selected && "mfga-nav-selected", dataset: { key: item.key } },
    h(
      "a.mfga-nav-link",
      { href: item.href, "aria-current": item.selected ? "page" : null, "aria-expanded": item.expanded == null ? null : String(item.expanded) },
      h("span.mfga-nav-icon", icon(item.icon)),
      h("span.mfga-nav-label", item.label),
      count(item.count),
      item.arrow && icon("misc_more_arrow", { className: "mfga-nav-arrow" }),
    ),
  );
}

/** News Feed's filters, indented under it while its list is open (2010's side-nav sub-items). */
function feedFilters(items) {
  return h("li.mfga-nav-item.mfga-nav-subwrap", h("ul.mfga-nav-list.mfga-nav-sub", items.map(navRow)));
}

/** A group or Page shortcut: its 16px picture stands where the 2010 nav icon was. */
function shortcutRow(item, fallbackIcon) {
  return h(
    "li.mfga-nav-item",
    h(
      "a.mfga-nav-link",
      { href: item.href, title: item.label },
      h("span.mfga-nav-icon", item.image ? h("img.mfga-nav-pic", { src: item.image, alt: "", width: 16, height: 16, loading: "lazy" }) : icon(fallbackIcon)),
      h("span.mfga-nav-label", item.label),
      count(item.count),
    ),
  );
}

function section(title, rows, fallbackIcon) {
  if (!rows.length) return null;
  return [h("div.mfga-nav-sep"), h("div.mfga-nav-title", title), h("ul.mfga-nav-list", rows.map((row) => shortcutRow(row, fallbackIcon)))];
}

function me(model) {
  const { name, url, avatar } = model.me;
  return h(
    "div.mfga-nav-me",
    h("a.mfga-nav-me-pic", { href: url, "aria-hidden": "true", tabindex: "-1" }, avatar ? h("img", { src: avatar, alt: "", width: 50, height: 50 }) : null),
    h(
      "div.mfga-nav-me-text",
      name && h("a.mfga-nav-me-name", { href: url }, name),
      h("a.mfga-nav-me-view", { href: url }, t("nav.viewProfile")),
    ),
  );
}

function chat(model) {
  const online = model.chat;
  return h(
    "div.mfga-nav-chat",
    h("div.mfga-nav-sep"),
    h("div.mfga-nav-title", t("nav.chat")),
    online.length
      ? h("ul.mfga-nav-list", online.map((c) => h("li.mfga-nav-item", h("a.mfga-nav-link", { href: c.href }, h("span.mfga-nav-icon", icon("chat_online")), h("span.mfga-nav-label", c.label)))))
      : h("a.mfga-nav-go-online", { href: "https://www.facebook.com/messages/" }, t("nav.goOnline")),
  );
}

/** The News Feed row and, while its list is open, its filters. On Home the row says whether it is open. */
function newsFeedRows(item, model, feedsOpen) {
  if (!model.feeds?.length) return [navRow(item)];
  const open = Boolean(model.feedsOpen || feedsOpen);
  const row = navRow(model.feedsOpen ? item : { ...item, expanded: open });
  return open ? [row, feedFilters(model.feeds)] : [row];
}

/**
 * Renders the column's content for a leftNavModel(). opts: {expanded, onMore, showChat, feedsOpen}.
 * "More ▾" reveals the extra apps in place, as in 2010; feedsOpen opens News Feed's filters on Home.
 */
export function renderLeftCol(model, { expanded = false, onMore, showChat = true, feedsOpen = false } = {}) {
  const more = expanded
    ? model.more.map(navRow)
    : h(
        "li.mfga-nav-item",
        h("button.mfga-nav-more", { type: "button", "aria-expanded": "false", onclick: onMore }, t("nav.more"), icon("misc_tri_blue_down", { className: "mfga-nav-more-arrow" })),
      );
  return [
    me(model),
    h("ul.mfga-nav-list", model.primary.flatMap((item) => (item.key === "newsFeed" ? newsFeedRows(item, model, feedsOpen) : [navRow(item)]))),
    h("div.mfga-nav-sep.mfga-nav-sep-apps"),
    h("ul.mfga-nav-list", model.apps.map(navRow), more),
    section(t("nav.groups"), model.groups, "nav_groups"),
    section(t("nav.pages"), model.pages, "nav_pages"),
    showChat && chat(model),
  ];
}
