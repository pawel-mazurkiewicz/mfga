// Browser entry for harvest-dom.test.mjs: starts the harvester as a document_start content script would,
// and records when each update happened relative to DOMContentLoaded.

import { startHarvest } from "../../../../src/data/harvest.js";

const log = (window.__harvestLog = { updates: [], dcl: null });
document.addEventListener("DOMContentLoaded", () => (log.dcl = performance.now()));

window.__harvest = startHarvest({
  onUpdate: (h) =>
    log.updates.push({
      t: performance.now(),
      preloaders: [...h.preloaders.keys()],
      prefetched: [...h.prefetched.values()].reduce((n, list) => n + list.length, 0),
      lsd: !!h.tokens.lsd,
    }),
});
