// Boots the 2010 shell on a fixture page the way src/main.js wires it: reader → navigator → layout → shell.
// Options come from window.__mfgaTest = { helper: boolean, look: {...}, stats: {...}, clearCache: boolean }.
import { basePlatform } from "../../../src/shared/platform.js";
import { sanitize } from "../../../src/shared/settings.js";
import { setLocale } from "../../../src/shared/i18n.js";
import { onRoot } from "../../../src/shared/util.js";
import { iconCss } from "../../../src/ui/icons.js";
import { shellCss } from "../../../src/ui/css/shell.js";
import { classifyRoute, onRouteChange } from "../../../src/fb/routes.js";
import { createNavigator } from "../../../src/fb/nav.js";
import { createChromeReader } from "../../../src/fb/chrome-reader.js";
import { createLayout } from "../../../src/fb/layout.js";
import { createShell } from "../../../src/ui/shell/shell.js";

const cfg = window.__mfgaTest || {};
const state = { navCalls: [], settingsOpened: 0, routes: [] };
if (cfg.clearCache) localStorage.removeItem("mfga:rail");

// localStorage-backed storage so the rail cache survives page loads, as chrome.storage / GM storage do.
const storage = {
  async get(key) {
    const v = localStorage.getItem(key);
    return v == null ? undefined : JSON.parse(v);
  },
  async set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  onChange() {},
};

// The MAIN-world helper's navigate(): pushState + popstate, exactly what src/page/main-world.js does.
const page = cfg.helper
  ? {
      async requireOp() {
        return null;
      },
      async navigate(url) {
        state.navCalls.push(url);
        history.pushState({}, "", url);
        dispatchEvent(new PopStateEvent("popstate", { state: {} }));
        return true;
      },
    }
  : null;

const platform = basePlatform({ storage, page });
const settings = sanitize({ look: cfg.look || {} });

// Like src/main.js: everything that touches <html> waits for it (document_start runs before it exists).
onRoot(() => {
  setLocale("auto");
  const style = document.createElement("style");
  style.id = "mfga-style";
  style.textContent = iconCss() + shellCss(settings);
  (document.head || document.documentElement).appendChild(style);

  const reader = createChromeReader({ platform });
  const navigator = createNavigator({ platform });
  const layout = createLayout({ settings });
  const shell = createShell({
    settings,
    reader,
    navigator,
    route: classifyRoute(),
    openSettings: () => state.settingsOpened++,
    stats: () => cfg.stats || { ads: 12, suggested: 34 },
  });
  layout.apply(classifyRoute());
  onRouteChange((route) => {
    state.routes.push(route.mode);
    layout.apply(route);
    shell.update({ route });
  });

  window.__mfga = { reader, navigator, layout, shell, state, setLocale };
});
