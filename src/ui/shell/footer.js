// The 2010 page footer (retro-spec §8.5) and the bottom-right chat tab (§7).
import { h, joinNodes } from "../dom.js";
import { icon } from "../icons.js";
import { t } from "../../shared/i18n.js";
import "./strings.js";

const LINKS = [
  ["footer.about", "https://www.facebook.com/facebook"],
  ["footer.advertising", "https://www.facebook.com/business/ads"],
  ["footer.developers", "https://developers.facebook.com/"],
  ["footer.careers", "https://www.metacareers.com/"],
  ["footer.privacy", "https://www.facebook.com/privacy/policy/"],
  ["footer.terms", "https://www.facebook.com/policies"],
  ["footer.help", "https://www.facebook.com/help/"],
];

/** "Facebook © 2010 · English (US)" on the left (the language opens MFGA's settings), links on the right. */
export function renderFooter({ openSettings } = {}) {
  return h(
    "div.mfga-footer-inner",
    h("div.mfga-footer-left", "Facebook © 2010 · ", h("button.mfga-footer-lang", { type: "button", onclick: () => openSettings?.() }, t("footer.language"))),
    h("div.mfga-footer-links", joinNodes(LINKS.map(([key, href]) => h("a", { href }, t(key))), () => " · ")),
  );
}

/** The chat tab's content for a chatTabModel(). */
export function renderChatTab(model) {
  return [icon(model.icon), h("span.mfga-chat-label", model.label)];
}
