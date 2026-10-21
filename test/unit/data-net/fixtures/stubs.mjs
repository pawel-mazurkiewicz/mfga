// Small local collaborators for data-net tests, so they never depend on WP-A internals.
// The JSONL stitcher is the reference algorithm from graphql-protocol §3.4.

export function parseLines(text) {
  const out = [];
  for (let line of String(text).split("\n")) {
    line = line.trim();
    if (!line) continue;
    if (line.startsWith("for (;;);")) line = line.slice(9).trim();
    try {
      out.push(JSON.parse(line));
    } catch {
      // partial trailing line
    }
  }
  return out;
}

const isObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

export function deepMerge(a, b) {
  if (!isObject(a) || !isObject(b)) return b;
  for (const [k, v] of Object.entries(b)) a[k] = isObject(v) && isObject(a[k]) ? deepMerge(a[k], v) : v;
  return a;
}

function ensurePath(root, path) {
  let o = root;
  path.forEach((key, i) => {
    if (o[key] == null) o[key] = typeof path[i + 1] === "number" ? [] : {};
    o = o[key];
  });
  return o;
}

export function stitch(payloads) {
  let data = null;
  const errors = [];
  let final = false;
  for (const p of payloads) {
    if (Array.isArray(p?.errors)) errors.push(...p.errors);
    if (p?.extensions?.is_final) final = true;
    if (!("label" in p) && !("path" in p)) {
      if (p.data != null) data = deepMerge(data ?? {}, p.data);
      continue;
    }
    data ??= {};
    const path = p.path || [];
    const last = path[path.length - 1];
    const parent = ensurePath(data, path.slice(0, -1));
    if (typeof last === "number" && (/\$stream\$/.test(p.label || "") || !(last in parent))) parent[last] = p.data;
    else deepMerge(path.length ? (parent[last] ??= {}) : data, p.data ?? {});
  }
  return { data, errors, final };
}

export function restoreTypenames(root, pairs) {
  const map = new Map(pairs);
  const visit = (o) => {
    if (o == null || typeof o !== "object") return;
    if (!Array.isArray(o) && map.has(o.__typename)) o.__typename = map.get(o.__typename);
    for (const v of Object.values(o)) visit(v);
  };
  visit(root);
  return root;
}

/** Keeps Story nodes without SponsoredData; drops everything else with ARCHITECTURE §3.3 reason names. */
export function createClassifier() {
  const hasSponsored = (o, depth = 0) =>
    o != null && typeof o === "object" && depth < 40 && (o.__typename === "SponsoredData" || Object.values(o).some((v) => hasSponsored(v, depth + 1)));
  return {
    async classify(edge) {
      const node = edge?.node;
      if (!node) return { keep: false, reason: "no-node", category: null };
      if (node.__typename !== "Story") return { keep: false, reason: `unit:${node.__typename}`, category: null };
      if (hasSponsored(node)) return { keep: false, reason: "sponsored-data", category: null };
      return { keep: true, reason: "keep", category: null };
    },
  };
}

/** Minimal Story: only the fields data-net reads. */
export function extractStory(node, { sources = [], dedupKey } = {}) {
  const key = node?.post_id || node?.id || dedupKey;
  if (!key) return null;
  return {
    key: String(key),
    postId: node.post_id ?? null,
    nodeId: node.id ?? null,
    time: Number.isFinite(node.creation_time) ? node.creation_time : null,
    url: node.permalink_url ?? null,
    text: node.comet_sections?.content?.story?.message?.text ?? null,
    feedback: { id: node.feedback?.id ?? null },
    groupId: node.to?.__typename === "Group" ? node.to.id : null,
    tracking: typeof node.encrypted_tracking === "string" ? node.encrypted_tracking : null,
    sources: [...sources],
  };
}

export function extractComment(node) {
  if (!node?.id) return null;
  return {
    id: node.id,
    author: { id: node.author?.id ?? null, name: node.author?.name ?? null, url: node.author?.url ?? null, avatar: null },
    text: node.body?.text ?? null,
    ranges: [],
    time: node.created_time ?? null,
    reactions: node.feedback?.reaction_count?.count ?? 0,
    replies: 0,
  };
}

export function matchesKeywords(story, keywords) {
  const text = String(story?.text ?? "").toLowerCase();
  return keywords.some((k) => text.includes(String(k).toLowerCase()));
}

export const codec = { parseLines, stitch, restoreTypenames };
