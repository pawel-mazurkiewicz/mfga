// The 2010 right column (retro-spec §6): Requests, the MFGA box in place of "Sponsored", Events
// (birthdays), Pokes and Connect With Friends.
import { h } from "../dom.js";
import { icon } from "../icons.js";
import { t } from "../../shared/i18n.js";
import { splitTemplate } from "./model.js";
import "./strings.js";

const FB = "https://www.facebook.com";

function box(key, title, action, body) {
  return h(
    `div.mfga-rc-box.mfga-rc-${key}`,
    h("div.mfga-rc-head", h("h4.mfga-rc-title", title), action),
    h("div.mfga-rc-body", body),
  );
}

const seeAll = (href) => h("a.mfga-rc-action", { href }, t("rc.seeAll"));

/** "**3** friend requests": a bold count before its label. */
function countRow(row) {
  const content = [icon(row.icon), h("b", String(row.count)), " ", row.label];
  return row.href ? h("a.mfga-rc-row.mfga-rc-link", { href: row.href }, content) : h("div.mfga-rc-row", content);
}

/** A sentence with one link in it, e.g. "Use our {link} to find friends…". */
function linkedSentence(key, linkKey, href) {
  const [before, after] = splitTemplate(t(key), "link");
  return [before, h("a", { href }, t(linkKey)), after];
}

function birthdayContent(row) {
  if (!row.name) return h("a", { href: row.href }, row.text);
  const [before, after] = splitTemplate(t("rc.birthday"), "name");
  return [before, h("a", { href: row.href }, row.name), after, " ", h("span.mfga-rc-when", t("rc.today"))];
}

/** 2010 drew the gift once, on the first row; every row keeps the icon's indent. */
function birthdayRow(row, first) {
  return h("div.mfga-rc-row.mfga-rc-event", first ? icon("rc_gift") : null, birthdayContent(row));
}

/** Renders the column's content for a rightColModel(). opts.openSettings opens the MFGA settings. */
export function renderRightCol(model, { openSettings } = {}) {
  return [
    model.requests.length ? box("requests", t("rc.requests"), seeAll(`${FB}/friends/requests/`), model.requests.map(countRow)) : null,
    box(
      "mfga",
      t("rc.mfga"),
      h("button.mfga-rc-action", { type: "button", onclick: () => openSettings?.() }, t("rc.mfgaSettings")),
      [...model.mfga.map(countRow), h("p.mfga-rc-note", t("rc.mfgaNote"))],
    ),
    model.events.length ? box("events", t("rc.events"), seeAll(`${FB}/events/birthdays/`), model.events.map((row, i) => birthdayRow(row, i === 0))) : null,
    box("pokes", t("rc.pokes"), seeAll(`${FB}/pokes/`), h("a.mfga-rc-row.mfga-rc-link", { href: `${FB}/pokes/` }, icon("rc_poke"), t("rc.viewPokes"))),
    box("connect", t("rc.connect"), null, [
      h("div.mfga-rc-row.mfga-rc-text", icon("rc_invite"), h("a", { href: `${FB}/friends/` }, t("rc.invite"))),
      h("div.mfga-rc-row.mfga-rc-text", icon("rc_contact_importer"), linkedSentence("rc.importer", "rc.importerLink", `${FB}/friends/suggestions/`)),
      h("div.mfga-rc-row.mfga-rc-text", icon("rc_mobile"), linkedSentence("rc.mobile", "rc.mobileLink", `${FB}/mobile/`)),
    ]),
  ];
}
