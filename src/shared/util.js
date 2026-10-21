// Shared helpers: error boundaries, health counters, scheduling, ids.

const PREFIX = "[MFGA]";

/** Health registry: counters, per-module errors and free-form facts, shown in the settings Health tab. */
export const health = {
  counters: Object.create(null),
  errors: Object.create(null),
  facts: Object.create(null),
  disabled: new Set(),
  count(key, n = 1) {
    this.counters[key] = (this.counters[key] || 0) + n;
  },
  fact(key, value) {
    this.facts[key] = value;
  },
  error(module, err) {
    const e = (this.errors[module] ||= { n: 0, first: null });
    e.n++;
    if (!e.first) e.first = String((err && err.message) || err).slice(0, 300);
  },
  snapshot() {
    return {
      counters: { ...this.counters },
      errors: JSON.parse(JSON.stringify(this.errors)),
      facts: JSON.parse(JSON.stringify(this.facts)),
      disabled: [...this.disabled],
    };
  },
};

let debugEnabled = false;
export function setDebug(on) {
  debugEnabled = !!on;
}
export function log(...args) {
  if (debugEnabled) console.debug(PREFIX, ...args);
}
export function warn(...args) {
  console.warn(PREFIX, ...args);
}

/**
 * Error boundary. safe("shell", fn) returns a wrapped function; the first exception disables the module
 * for the rest of the page lifetime (subsequent calls are no-ops returning undefined).
 */
export function safe(module, fn, { disableOnError = true } = {}) {
  return function safeWrapped(...args) {
    if (health.disabled.has(module)) return undefined;
    try {
      const r = fn.apply(this, args);
      if (r && typeof r.then === "function") {
        return r.catch((err) => {
          onError(module, err, disableOnError);
          return undefined;
        });
      }
      return r;
    } catch (err) {
      onError(module, err, disableOnError);
      return undefined;
    }
  };
}

function onError(module, err, disable) {
  health.error(module, err);
  if (disable) health.disabled.add(module);
  warn(`${module} ${disable ? "disabled" : "error"}:`, err);
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Random delay around `ms`, ±`spread` fraction. */
export function jitter(ms, spread = 0.35) {
  return Math.max(0, Math.round(ms * (1 - spread + Math.random() * 2 * spread)));
}

export function uuid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((v) => v.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export function debounce(fn, ms) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Coalesces many calls into one per animation frame. */
export function rafBatch(fn) {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn();
    });
  };
}

/** Runs fn when the browser is idle (falls back to a timeout). */
export function onIdle(fn, timeout = 500) {
  if (typeof requestIdleCallback === "function") return requestIdleCallback(fn, { timeout });
  return setTimeout(fn, 1);
}

/** Calls fn once the <html> element exists (document_start scripts may run before it). */
export function onRoot(fn) {
  if (document.documentElement) return fn();
  const mo = new MutationObserver(() => {
    if (document.documentElement) {
      mo.disconnect();
      fn();
    }
  });
  mo.observe(document, { childList: true });
}

/** Calls fn once <body> exists. */
export function onBody(fn) {
  if (document.body) return fn();
  onRoot(() => {
    if (document.body) return fn();
    const mo = new MutationObserver(() => {
      if (document.body) {
        mo.disconnect();
        fn();
      }
    });
    mo.observe(document.documentElement, { childList: true });
  });
}

/** Normalises label text for dictionary matching (NFKC, lowercase, strips invisible chars and bullets). */
export function normLabel(s) {
  return String(s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[͏​-‍⁠﻿­]/g, "")
    .replace(/[·•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Deep get: get(obj, "a", "b", 0, "c"). */
export function get(obj, ...path) {
  let o = obj;
  for (const k of path) {
    if (o == null) return undefined;
    o = o[k];
  }
  return o;
}
