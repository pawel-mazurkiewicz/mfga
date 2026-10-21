// The 2010 "Welcome to your new, simplified home page" box, adapted: three numbered points about MFGA
// next to a miniature of the page with red markers, a "close" link and a "Learn more" link.
import { h } from "../dom.js";
import { t } from "../../shared/i18n.js";
import { guard, linkButton } from "./parts.js";

export const PROJECT_URL = "https://github.com/pawel-mazurkiewicz/mfga#readme";

const block = (cls) => h("i", { class: `mfga-welcome-block ${cls}` });
const marker = (n, cls) => h("b", { class: `mfga-welcome-marker ${cls}` }, String(n));

/** Miniature of the 2010 home page; markers 1–3 point at the stream, the filters and the Account menu. */
function miniature() {
  const stories = [0, 1, 2, 3].map(() => h("i.mfga-welcome-mini-story", block("mfga-welcome-pic"), block("mfga-welcome-lines")));
  return h(
    "div.mfga-welcome-mini",
    { "aria-hidden": "true" },
    h("i.mfga-welcome-mini-bar", h("i.mfga-welcome-mini-logo"), h("i.mfga-welcome-mini-search")),
    h("i.mfga-welcome-mini-left", block("mfga-welcome-pic"), [0, 1, 2, 3, 4].map(() => block("mfga-welcome-nav"))),
    h("i.mfga-welcome-mini-center", block("mfga-welcome-mhead"), block("mfga-welcome-composer"), stories),
    h("i.mfga-welcome-mini-right", [0, 1, 2].map(() => block("mfga-welcome-box"))),
    marker(1, "mfga-welcome-m1"),
    marker(2, "mfga-welcome-m2"),
    marker(3, "mfga-welcome-m3"),
  );
}

/** Builds the box; onClose runs after the box removed itself. `open(url)` follows the "Learn more" link. */
export function renderWelcome({ onClose, open }) {
  const steps = [1, 2, 3].map((n) => h("li.mfga-welcome-step", h("b.mfga-welcome-num", String(n)), h("span", t(`feed.welcome.step${n}`))));
  const box = h(
    "div.mfga-welcome",
    h("div.mfga-welcome-head", h("h2.mfga-welcome-title", t("feed.welcome.title")), linkButton(t("feed.welcome.close"), close, "mfga-welcome-close")),
    h("div.mfga-welcome-main", miniature(), h("ol.mfga-welcome-steps", steps)),
    h(
      "a.mfga-welcome-learn",
      {
        href: PROJECT_URL,
        target: "_blank",
        rel: "noopener noreferrer",
        onclick: guard((ev) => {
          if (typeof open !== "function" || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
          ev.preventDefault();
          open(PROJECT_URL, { newTab: true });
        }),
      },
      t("feed.welcome.learn"),
      h("i.mfga-welcome-arrow", { "aria-hidden": "true" }),
    ),
  );
  function close() {
    box.remove();
    onClose?.();
  }
  return box;
}
