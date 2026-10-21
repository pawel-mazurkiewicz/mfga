// Request/response channel between the isolated world and the MAIN-world helper.
// CustomEvents on `document`; `detail` is always a JSON string so it crosses Firefox Xray boundaries.

const PREFIX = "mfga:";

/** Isolated-world side. `channel` is a random id shared with the helper via <html data-mfga-channel>. */
export function createBridgeClient(channel, { timeoutMs = 4000 } = {}) {
  let seq = 0;
  const pending = new Map();
  document.addEventListener(`${PREFIX}${channel}:res`, (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.detail);
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
        document.dispatchEvent(new CustomEvent(`${PREFIX}${channel}:req`, { detail: JSON.stringify({ id, method, params }) }));
      });
    },
  };
}

/** MAIN-world side. handlers: {method: async (params) => result}. */
export function serveBridge(channel, handlers) {
  document.addEventListener(`${PREFIX}${channel}:req`, async (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.detail);
    } catch {
      return;
    }
    if (!msg || typeof msg.id !== "number") return;
    let reply;
    try {
      const fn = handlers[msg.method];
      if (!fn) throw new Error(`unknown method ${msg.method}`);
      reply = { id: msg.id, result: await fn(msg.params || {}) };
    } catch (err) {
      reply = { id: msg.id, error: String((err && err.message) || err) };
    }
    document.dispatchEvent(new CustomEvent(`${PREFIX}${channel}:res`, { detail: JSON.stringify(reply) }));
  });
}
