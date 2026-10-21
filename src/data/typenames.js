// Restores obfuscated __typename values (Facebook's GHLTypenameRestore, fed by Env.q9k7m2x).
// The server may send typenames, ad typenames in particular, under random names that only the
// client maps back; every payload goes through this before classification.

import { health } from "../shared/util.js";

/** In place: every `__typename` equal to an obfuscated name becomes the real one. Returns root. */
export function restoreTypenames(root, pairs) {
  const table = pairTable(pairs);
  if (!table.size || root == null || typeof root !== "object") return root;
  let restored = 0;
  const stack = [root];
  while (stack.length) {
    const value = stack.pop();
    if (!Array.isArray(value)) {
      const real = table.get(value.__typename);
      if (real !== undefined) {
        value.__typename = real;
        restored++;
      }
    }
    for (const child of Object.values(value)) if (child != null && typeof child === "object") stack.push(child);
  }
  if (restored) health.count("typenames.restored", restored);
  return root;
}

function pairTable(pairs) {
  const table = new Map();
  if (!Array.isArray(pairs)) return table;
  for (const pair of pairs) {
    if (Array.isArray(pair) && pair.length === 2 && typeof pair[0] === "string" && typeof pair[1] === "string") table.set(pair[0], pair[1]);
  }
  return table;
}
