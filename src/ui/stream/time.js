// 2010 relative timestamps ("26 minutes ago") that the feed view refreshes every minute.
import { h } from "../dom.js";
import { relativeTime } from "../../shared/i18n.js";
import { fullDate } from "./format.js";

/** <abbr class="mfga-time" data-utime title="Wednesday, March 10, 2010 at 4:41pm">26 minutes ago</abbr> */
export function timeNode(unixSeconds, nowMs) {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return null;
  return h("abbr.mfga-time", { title: fullDate(unixSeconds), "data-utime": unixSeconds }, relativeTime(unixSeconds, nowMs));
}

/** Re-renders every timestamp under `root`. */
export function refreshTimes(root, nowMs) {
  for (const el of root.querySelectorAll("abbr.mfga-time[data-utime]")) {
    const next = relativeTime(Number(el.getAttribute("data-utime")), nowMs);
    if (el.textContent !== next) el.textContent = next;
  }
}
