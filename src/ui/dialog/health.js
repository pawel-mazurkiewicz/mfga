// The settings dialog's Health tab: module status, errors, counters by area, facts, the anonymised report
// export, advanced switches and "Reset settings".

import { h, replaceChildren, text } from "../dom.js";
import { health, safe } from "../../shared/util.js";
import { getLocale, t } from "../../shared/i18n.js";
import { openDialog } from "./dialog.js";
import { externalLink, ISSUES_URL } from "./about.js";
import { errorRows, formatValue, groupCounters, otherEntries, reportFileName, sanitizeReport } from "./report.js";

const formatCount = (n) => n.toLocaleString(getLocale() === "pl" ? "pl-PL" : "en-US");

/** t() with Node placeholders: "Saved {file}." + {file: <a>} -> ["Saved ", <a>, "."] */
function tNodes(key, nodes) {
  return t(key)
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map((part) => nodes[part.slice(1, -1)] ?? text(part));
}

export function healthPanel({ binder, settings, healthSnapshot, exportReport }) {
  const status = h("div.mfga-health-status", { role: "status" });
  const exported = h("div.mfga-health-exported", { role: "status" });
  const details = h("div.mfga-health-details");

  const refresh = safe(
    "settings-dialog",
    async () => {
      const snap = (await healthSnapshot?.()) || {};
      replaceChildren(status, statusBox(snap));
      replaceChildren(details, snapshotSections(snap));
    },
    { disableOnError: false },
  );

  // A data: link rather than a blob: URL: Firefox content scripts own their blobs under a different
  // principal, which can turn the download into a blocked navigation.
  async function exportNow() {
    try {
      const json = `${JSON.stringify(sanitizeReport(await exportReport()), null, 2)}\n`;
      const file = reportFileName();
      const link = h("a.mfga-health-file", { download: file }, file);
      link.href = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`; // ours; h() only passes http(s)/mailto
      replaceChildren(exported, tNodes("settings.health.exported", { file: link }), " ", externalLink(ISSUES_URL, t("settings.health.attach")), ".");
      link.click();
    } catch (err) {
      health.error("settings-dialog", err);
      replaceChildren(exported, h("div.mfga-error", t("settings.health.exportFailed")));
    }
  }

  const resetNow = safe("settings-dialog", () => settings.reset(), { disableOnError: false });
  const confirmReset = () =>
    openDialog({
      title: t("settings.reset.title"),
      body: h("p", t("settings.reset.body")),
      buttons: [
        { label: t("settings.reset.confirm"), primary: true, onClick: () => void resetNow() },
        { label: t("dialog.cancel") },
      ],
    });

  const actions = h(
    "div.mfga-health-actions",
    h("button.mfga-btn.mfga-btn-confirm", { type: "button", onclick: exportNow }, t("settings.health.export")),
    h("button.mfga-btn", { type: "button", onclick: refresh }, t("settings.health.refresh")),
    h("button.mfga-btn.mfga-health-reset", { type: "button", onclick: confirmReset }, t("settings.health.reset")),
  );

  const advanced = section(t("settings.health.advanced"), [
    binder.checkbox("advanced.debug", t("settings.health.debug")),
    binder.checkbox("advanced.mainWorldHelper", t("settings.health.mainWorldHelper")),
    binder.checkbox("advanced.stopOnCheckpoint", t("settings.health.stopOnCheckpoint")),
  ]);

  return { el: h("div", status, actions, exported, details, advanced), onShow: refresh };
}

function statusBox(snap) {
  const stopped = Array.isArray(snap.disabled) ? snap.disabled : [];
  return stopped.length
    ? h("div.mfga-error", t("settings.health.stopped", { list: stopped.join(", ") }))
    : h("div.mfga-notice", t("settings.health.ok"));
}

function snapshotSections(snap) {
  const out = [];
  const errors = errorRows(snap.errors);
  if (errors.length) {
    out.push(
      section(
        t("settings.health.errors"),
        table(
          [t("settings.health.module"), t("settings.health.count"), t("settings.health.first")],
          errors.map(([module, n, first]) => [module, formatCount(n), first]),
          [1],
          "mfga-health-errors",
        ),
      ),
    );
  }
  const areas = groupCounters(snap.counters);
  if (areas.length) out.push(section(t("settings.health.counters"), h("div.mfga-health-areas", areas.map(areaBox))));
  const facts = Object.entries(snap.facts || {}).map(([k, v]) => [k, formatValue(v)]);
  if (facts.length) out.push(section(t("settings.health.facts"), table(null, facts)));
  const other = otherEntries(snap);
  if (other.length) out.push(section(t("settings.health.other"), table(null, other)));
  return out.length ? out : h("p.mfga-muted.mfga-health-section", t("settings.health.empty"));
}

function areaBox({ area, rows, total }) {
  return h(
    "div.mfga-box",
    h("h4.mfga-box-title", area, h("span.mfga-health-total", formatCount(total))),
    table(null, rows.map(([name, n]) => [name, formatCount(n)]), [1]),
  );
}

function section(title, content) {
  return h("div.mfga-health-section", h("h3.mfga-box-title", title), content);
}

/** Plain table; `numeric` lists the column indexes that are right-aligned counts. */
function table(head, rows, numeric = [], className = null) {
  const cell = (tag, value, i) => h(tag, { class: numeric.includes(i) ? "mfga-health-num" : null }, value);
  return h(
    "table.mfga-health-table",
    { class: className },
    head ? h("thead", h("tr", head.map((v, i) => cell("th", v, i)))) : null,
    h("tbody", rows.map((r) => h("tr", r.map((v, i) => cell("td", v, i))))),
  );
}
