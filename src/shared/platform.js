// The platform contract every target (extension, userscript, tests) implements and hands to boot().
// Feature code never touches chrome.*, browser.*, GM_* or unsafeWindow directly: it uses this object.

/**
 * @typedef {Object} LearnedOp
 * @property {string} docId
 * @property {Object|null} variables   parsed `variables` of the most recent request with this name
 * @property {number} seenAt           epoch ms
 * @property {string} [rev]            SiteData revision when seen, if known
 */

/**
 * @typedef {Object} Platform
 * @property {"chrome"|"firefox"|"userscript"|"test"} kind
 * @property {(url: string, init?: RequestInit) => Promise<Response>} fetch
 *   Same-origin request made *as the page* (cookies, page Origin). Firefox: content.fetch.
 * @property {{get(key: string): Promise<any>, set(key: string, value: any): Promise<void>,
 *             onChange(cb: (key: string, value: any) => void): void}} storage
 * @property {() => Promise<Record<string, LearnedOp>>} learnedOps
 *   Operations Facebook itself was seen sending (extension background webRequest). {} when unavailable.
 * @property {{requireOp(name: string, timeoutMs?: number): Promise<string|null>,
 *             navigate(url: string): Promise<boolean>,
 *             readTokens(): Promise<{dtsg: string|null, lsd: string|null}>}|null} page
 *   MAIN-world helper (read-only requireLazy probe, SPA navigation). null when unavailable.
 * @property {(label: string, fn: () => void) => void} addMenuCommand
 *   Userscript manager menu / extension action. No-op when unavailable.
 * @property {string} version
 * @property {{manager?: string, mode?: string, late?: boolean}} [diagnostics]
 *   Facts about how this target was injected, shown in the Health tab.
 */

/** A platform that does nothing; used as a base by targets and tests. */
export function basePlatform(overrides = {}) {
  const mem = new Map();
  const listeners = [];
  return {
    kind: "test",
    version: "0.0.0",
    fetch: (url, init) => fetch(url, init),
    storage: {
      async get(key) {
        return mem.has(key) ? structuredClone(mem.get(key)) : undefined;
      },
      async set(key, value) {
        mem.set(key, structuredClone(value));
        for (const cb of listeners) cb(key, value);
      },
      onChange(cb) {
        listeners.push(cb);
      },
    },
    learnedOps: async () => ({}),
    page: null,
    addMenuCommand() {},
    ...overrides,
  };
}
