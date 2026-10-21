// Read-only operations that must run in the page's own JavaScript world. Used by the extension's
// MAIN-world helper (over the bridge) and directly by the userscript when it runs in the page.
//
// Safety invariant: requireLazy is only ever asked for "<Op>_facebookRelayOperation" modules. Their
// factories have no dependencies and only export a doc_id string, so running them early cannot trip
// the failure HushFacebookWeb hit (forcing a module that reads experiment values before the page has
// them left Facebook on its splash screen). Never extend this to other modules.

const OP_NAME = /^[A-Za-z0-9_]{3,120}$/;
const DOC_ID = /^\d{5,25}$/;

/** Resolves the doc_id of Facebook operation `name`, or null if it is not defined within timeoutMs. */
export function requireOp(win, { name, timeoutMs = 3000 }) {
  if (!OP_NAME.test(String(name))) return Promise.resolve(null);
  const requireLazy = win.requireLazy;
  if (typeof requireLazy !== "function") return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), Math.min(10000, Math.max(100, timeoutMs)));
    try {
      requireLazy([`${name}_facebookRelayOperation`], (id) => {
        clearTimeout(timer);
        // Facebook's loader would report a throw from this callback as its own error; nothing here throws.
        resolve(typeof id === "string" && DOC_ID.test(id) ? id : null);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/** In-app navigation: Facebook's router treats pushState + popstate with an unknown state as a route. */
export function navigate(win, { url }) {
  let target;
  try {
    target = new URL(String(url), win.location.href);
  } catch {
    return false;
  }
  if (target.origin !== win.location.origin) return false;
  win.history.pushState({}, "", target.pathname + target.search + target.hash);
  win.dispatchEvent(new win.PopStateEvent("popstate", { state: {} }));
  return true;
}
