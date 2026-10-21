// MAIN-world helper (extension content script with world:"MAIN", or injected by the userscript in
// content mode). Deliberately tiny and read-only: it patches nothing and wraps nothing.
import { serveBridge, BRIDGE_CHANNEL } from "../shared/bridge.js";
import { navigate, requireOp } from "./page-api.js";

// No page-visible marker globals: this file is injected exactly once per document.
serveBridge(BRIDGE_CHANNEL, {
  requireOp: (params) => requireOp(window, params),
  navigate: (params) => navigate(window, params),
});
