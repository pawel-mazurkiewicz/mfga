// GraphQL response parsing: JSON lines and Relay incremental delivery (@stream / @defer).
// The same stitcher reassembles SSR RelayPrefetchedStreamCache payloads (callers sort them by
// sequence_number first). Pure: inputs are never mutated.

const GUARD = "for (;;);";
// JSON.parse turns "__proto__" into an ordinary key; assigning it on a merge target would swap that
// object's prototype (Object.prototype itself at the root), so it is never merged or walked.
const PROTO = "__proto__";

const isPlainObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

/** Splits a response body into parsed JSON objects. Strips "for (;;);", skips blank and partial lines. */
export function parseLines(text) {
  const out = [];
  for (let line of String(text ?? "").split("\n")) {
    line = line.trim();
    if (line.startsWith(GUARD)) line = line.slice(GUARD.length).trim();
    if (!line) continue;
    try {
      const value = JSON.parse(line);
      if (isPlainObject(value)) out.push(value);
    } catch {
      // A cut stream leaves a partial last line; it carries nothing we can use.
    }
  }
  return out;
}

/** Recursive merge into `a` (mutated and returned): b's leaves win, objects merge, arrays are replaced. */
export function deepMerge(a, b) {
  if (!isPlainObject(a) || !isPlainObject(b)) return b;
  for (const [key, value] of Object.entries(b)) {
    if (key === PROTO) continue;
    a[key] = isPlainObject(value) && isPlainObject(a[key]) ? deepMerge(a[key], value) : value;
  }
  return a;
}

/**
 * Reassembles the payloads of one response, in arrival order.
 *   root payload (no label, no path)  -> deep-merged into data
 *   @stream (label has "$stream$", or the last path element is a list index not yet present)
 *                                     -> list[index] = payload.data (the whole item)
 *   @defer                            -> deep-merged into the object at path
 * A stream line that arrives before its predecessors leaves holes in the list; read lists with filter().
 */
export function stitch(payloads) {
  let data = null;
  const errors = [];
  let final = false;
  for (const p of Array.isArray(payloads) ? payloads : []) {
    if (!isPlainObject(p)) continue;
    if (Array.isArray(p.errors)) errors.push(...p.errors);
    if (p.extensions?.is_final === true) final = true;
    if (!isPlainObject(p.data)) continue;
    const payload = structuredClone(p.data);
    if (!("label" in p) && !("path" in p)) {
      data = deepMerge(data ?? {}, payload);
    } else {
      data ??= {};
      try {
        applyIncremental(data, Array.isArray(p.path) ? p.path : [], p.label, payload);
      } catch {
        // A path no list can take (a list's "length"): only this payload is lost, not the response.
      }
    }
  }
  return { data, errors, final };
}

function applyIncremental(root, path, label, payload) {
  if (path.includes(PROTO)) return;
  if (!path.length) {
    deepMerge(root, payload);
    return;
  }
  const parent = ensurePath(root, path.slice(0, -1), path[path.length - 1]);
  const last = path[path.length - 1];
  const isStream = typeof last === "number" && (/\$stream\$/.test(String(label ?? "")) || !(last in parent));
  if (isStream || !isPlainObject(parent[last])) parent[last] = payload;
  else deepMerge(parent[last], payload);
}

/** Walks along `path`, creating missing containers (a numeric next key makes a list); existing ones are kept. */
function ensurePath(root, path, finalKey) {
  let node = root;
  path.forEach((key, i) => {
    const nextKey = i + 1 < path.length ? path[i + 1] : finalKey;
    if (node[key] == null || typeof node[key] !== "object") node[key] = typeof nextKey === "number" ? [] : {};
    node = node[key];
  });
  return node;
}
