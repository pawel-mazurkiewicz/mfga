// Request/response channel between the isolated world and the MAIN-world helper.
// CustomEvents on `document`; `detail` is always a JSON string so it crosses Firefox Xray boundaries.
//
// The event names come from a per-load secret page scripts never see (platform research §3, verified E4/E6/E9):
// both sides run before any page script, in either order. Whichever runs first writes a random id to
// <html data-mfga-channel>; the other reads it and removes the attribute at once (joinChannel).

const PREFIX = "mfga:";
export const CHANNEL_ATTR = "data-mfga-channel";
const CHANNEL_ID = /^[0-9a-f]{32}$/;

// Natives captured at load, before any page script runs: the MAIN-world side shares the page's globals, and a
// page that replaced them later would otherwise see every message (and the channel's event names).
const dispatch = EventTarget.prototype.dispatchEvent;
const Custom = CustomEvent;
const detailOf =
  Object.getOwnPropertyDescriptor(CustomEvent.prototype, "detail")?.get ??
  function detail() {
    return this.detail;
  };
const { parse, stringify } = JSON;
const hasOwn = Object.prototype.hasOwnProperty;

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let id = "";
  for (const b of bytes) id += (b < 16 ? "0" : "") + b.toString(16);
  return id;
}

/**
 * The per-load channel id shared by the two sides, or null when there is no <html> yet. The first caller
 * creates it (leaving it on <html> for the other side), the second takes it and removes the attribute.
 */
export function joinChannel(doc = document) {
  const html = doc.documentElement;
  if (!html) return null;
  const given = html.getAttribute(CHANNEL_ATTR);
  if (given && CHANNEL_ID.test(given)) {
    html.removeAttribute(CHANNEL_ATTR);
    return given;
  }
  const id = randomId();
  html.setAttribute(CHANNEL_ATTR, id);
  return id;
}

/** Removes a channel id nobody took (the other side never ran), so it does not stay visible to the page. */
export function dropChannel(channel, doc = document) {
  const html = doc.documentElement;
  if (!html || html.getAttribute(CHANNEL_ATTR) !== channel) return false;
  html.removeAttribute(CHANNEL_ATTR);
  return true;
}

/** A CustomEvent built from a null-prototype init dictionary, so no page getter on Object.prototype runs. */
const message = (type, detail) => new Custom(type, { __proto__: null, detail });

/** Isolated-world side. */
export function createBridgeClient(channel, { timeoutMs = 4000 } = {}) {
  let seq = 0;
  const pending = new Map();
  document.addEventListener(`${PREFIX}${channel}:res`, (ev) => {
    let msg;
    try {
      msg = parse(detailOf.call(ev));
    } catch {
      return;
    }
    const p = pending.get(msg && msg.id);
    if (!p) return;
    pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.error) p.reject(new Error(msg.error));
    else p.resolve(msg.result);
  });
  return {
    call(method, params = {}, ms = timeoutMs) {
      const id = ++seq;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`bridge timeout: ${method}`));
        }, ms);
        pending.set(id, { resolve, reject, timer });
        dispatch.call(document, message(`${PREFIX}${channel}:req`, stringify({ id, method, params })));
      });
    },
  };
}

/** MAIN-world side. handlers: {method: async (params) => result}. */
export function serveBridge(channel, handlers) {
  document.addEventListener(`${PREFIX}${channel}:req`, async (ev) => {
    let msg;
    try {
      msg = parse(detailOf.call(ev));
    } catch {
      return;
    }
    if (!msg || typeof msg.id !== "number") return;
    let reply;
    try {
      const fn = typeof msg.method === "string" && hasOwn.call(handlers, msg.method) ? handlers[msg.method] : null;
      if (!fn) throw new Error(`unknown method ${msg.method}`);
      reply = { id: msg.id, result: await fn(msg.params || {}) };
    } catch (err) {
      reply = { id: msg.id, error: String((err && err.message) || err) };
    }
    dispatch.call(document, message(`${PREFIX}${channel}:res`, stringify(reply)));
  });
}
