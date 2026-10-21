// The settings dialog's About tab: what MFGA is, links and credits.

import { h } from "../dom.js";
import { t } from "../../shared/i18n.js";

export const REPO_URL = "https://github.com/pawel-mazurkiewicz/mfga";
export const ISSUES_URL = `${REPO_URL}/issues`;

export function externalLink(href, label) {
  return h("a", { href, target: "_blank", rel: "noopener noreferrer" }, label);
}

function section(title, ...content) {
  return h("div.mfga-about-section", h("h3.mfga-box-title", title), content);
}

const bullets = (items) => h("ul.mfga-about-list", items.map((item) => h("li", item)));

export function aboutPanel({ version }) {
  const el = h(
    "div",
    h(
      "div.mfga-about-head",
      h("span.mfga-about-name", "MFGA"),
      h("span", t("settings.about.tagline")),
      version ? h("span.mfga-muted", t("settings.about.version", { version })) : null,
    ),
    section(t("settings.about.what"), h("p", t("settings.about.p1")), h("p", t("settings.about.p2")), h("p", t("settings.about.p3"))),
    section(
      t("settings.about.links"),
      bullets([externalLink(REPO_URL, t("settings.about.repo")), externalLink(ISSUES_URL, t("settings.about.issues"))]),
    ),
    section(
      t("settings.about.credits"),
      bullets([t("settings.about.creditSprites"), t("settings.about.creditClean"), t("settings.about.creditResearch")]),
    ),
    h("p.mfga-about-legal", t("settings.about.legal")),
  );
  return { el };
}
