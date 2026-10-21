// Module resolve hook for data-net tests: WP-A's modules (src/data/jsonl.js, typenames.js, classify.js,
// extract.js, text.js) are written in parallel. While one is missing, imports of it resolve to a local
// stand-in so data-net's modules still link. Tests inject their collaborators explicitly either way.

const STANDINS = new Set(["jsonl.js", "typenames.js", "classify.js", "extract.js", "text.js"]);

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const file = specifier.split("/").pop();
    const fromData = /\/src\/data\/[^/]+\.js$/.test(context.parentURL || "");
    if (err?.code !== "ERR_MODULE_NOT_FOUND" || !fromData || !STANDINS.has(file)) throw err;
    return { url: new URL(`./standins/${file}`, import.meta.url).href, shortCircuit: true };
  }
}
