// MAIN-world helper (extension content script with world:"MAIN", or injected by the userscript in
// content mode). Deliberately tiny and read-only: it patches nothing and wraps nothing.
import { joinChannel, serveBridge } from "../shared/bridge.js";
import { navigate, readTokens, requireOp } from "./page-api.js";

// No page-visible marker globals: this file is injected exactly once per document, and it answers only on the
// per-load channel it shares with the isolated world (bridge.js), which page scripts never see.
const channel = joinChannel();
if (channel) {
  serveBridge(channel, {
    requireOp: (params) => requireOp(window, params),
    navigate: (params) => navigate(window, params),
    readTokens: (params) => readTokens(window, params),
  });
}
