// MAIN-world helper. Deliberately tiny and read-only: it patches nothing and wraps nothing.
//   requireOp — waits (requireLazy) for "<Op>_facebookRelayOperation" to be defined and returns its doc_id
//   navigate  — Facebook's router handles history.pushState + popstate as an in-app navigation
import { serveBridge, BRIDGE_CHANNEL } from "../shared/bridge.js";

const OP_NAME = /^[A-Za-z0-9_]{3,120}$/;

function requireOp({ name, timeoutMs = 3000 }) {
  if (!OP_NAME.test(String(name))) return null;
  const requireLazy = window.requireLazy;
  if (typeof requireLazy !== "function") return null;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), Math.min(10000, Math.max(100, timeoutMs)));
    try {
      requireLazy([`${name}_facebookRelayOperation`], (id) => {
        clearTimeout(timer);
        resolve(typeof id === "string" && /^\d{5,25}$/.test(id) ? id : null);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

function navigate({ url }) {
  let target;
  try {
    target = new URL(String(url), location.href);
  } catch {
    return false;
  }
  if (target.origin !== location.origin) return false;
  history.pushState({}, "", target.pathname + target.search + target.hash);
  window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
  return true;
}

// No page-visible marker globals: the manifest injects this file exactly once per document.
serveBridge(BRIDGE_CHANNEL, { requireOp, navigate });
