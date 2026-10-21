// Diagnostics helpers (pure): shape the health snapshot for the Health tab, and anonymise the exported report.
// A report may carry key names, typenames, operation names, enum values and counts. It must never carry post
// text, people's names, ids, URLs, tokens or cursors (ARCHITECTURE §7), so sanitizeReport() runs over whatever
// exportReport() returns before anything is written to a file.

const MAX_DEPTH = 12;
const MAX_ITEMS = 100;
const MAX_KEYS = 500;
const MAX_TOKEN = 120;

// Keys whose values are personal or secret. Matching uses the last dotted segment ("me.name" -> "name"),
// lowercased with punctuation removed, plus the suffix rules below. Under such a key only a count or a flag
// survives (a counter may well be called "...title"), except under identity keys, where a number is an id.
export const FORBIDDEN_KEYS = new Set([
  "id", "ids", "name", "names", "firstname", "lastname", "fullname", "shortname", "username", "displayname",
  "text", "message", "body", "title", "description", "caption", "snippet", "query", "keywords",
  "link", "links", "permalink", "email", "phone", "address", "location", "birthday", "birthdays",
  "actor", "actors", "author", "owner", "user", "viewer", "me", "profile", "identity", "contacts", "shortcuts",
  "avatar", "picture", "photo", "image", "variables", "tracking", "encryptedtracking", "cft", "tn",
  "dtsg", "fbdtsg", "lsd", "jazoest", "cookie", "cookies", "cuser", "xs", "datr", "secret", "password", "session",
]);
const IDENTITY_KEYS = new Set(["id", "ids", "actor", "actors", "author", "owner", "user", "viewer", "me", "profile", "identity", "cuser"]);
const DATA_SUFFIX = /(?:url|uri|href|src|cursor|token)s?$/i;
const ID_SUFFIX = /(?:^|[_\s-])(?:ids?|IDs?)$|[a-z0-9](?:Id|ID)s?$/;

// Free-text values are only kept (scrubbed) under keys that hold error messages.
const MESSAGE_KEYS = new Set(["first", "error", "err", "reason", "warning", "detail", "last"]);

const normKey = (key) => String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
const lastSegment = (key) => String(key).split(".").pop();
const isCount = (v) => typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e13);

export function isForbiddenKey(key) {
  const k = lastSegment(key);
  return FORBIDDEN_KEYS.has(normKey(k)) || DATA_SUFFIX.test(k) || ID_SUFFIX.test(k);
}

export function isIdentityKey(key) {
  const k = lastSegment(key);
  return IDENTITY_KEYS.has(normKey(k)) || ID_SUFFIX.test(k);
}

/** Whether `value` may be exported under `key` at all (before the value itself is sanitised). */
export function mayExport(key, value) {
  return !isForbiddenKey(key) || (!isIdentityKey(key) && isCount(value));
}

/**
 * True for identifier-like strings: typenames, operation names, enum values, versions, counter keys.
 * Anything with spaces, slashes or "@", any run of 5+ digits (ids) and random-looking tokens fail.
 */
export function isSafeToken(s) {
  return (
    typeof s === "string" &&
    s.length <= MAX_TOKEN &&
    /^\w[\w.:$-]*$/.test(s) &&
    !/\d{5,}/.test(s) &&
    !looksRandom(s)
  );
}

// Mixed-case letters with digits and no separators, e.g. an "lsd" token ("AVqZ1h2bXyE").
function looksRandom(s) {
  return s.length >= 8 && /\d/.test(s) && /[a-z]/.test(s) && /[A-Z]/.test(s) && !/[._:$-]/.test(s);
}

/** Keeps the shape of an error message while removing anything that could be data. */
export function scrubText(s) {
  return String(s)
    .replace(/\b(?:https?|blob|data|file):\S+|\bwww\.\S+/gi, "<url>")
    .replace(/\S+@\S+\.\w+/g, "<email>")
    .replace(/(["'`])([^"'`]{0,300})\1/g, (m, q, inner) => (isSafeToken(inner) ? m : `${q}<text>${q}`))
    .replace(/\d{3,}/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** Returns a JSON-safe, anonymised copy of `value` (see the file comment for the rules). */
export function sanitizeReport(value) {
  const out = clean(value, "", 0, new WeakSet());
  return out === undefined ? null : out;
}

function clean(v, key, depth, seen) {
  if (v === null) return null;
  switch (typeof v) {
    case "number":
      if (!Number.isFinite(v)) return null;
      return Math.abs(v) >= 1e13 ? "<number>" : v; // 1e13+ is an id, not a count or a timestamp
    case "boolean":
      return v;
    case "bigint":
      return "<number>";
    case "string":
      if (isSafeToken(v)) return v;
      return MESSAGE_KEYS.has(normKey(key)) ? scrubText(v) : "<text>";
    case "object":
      break;
    default:
      return undefined; // functions, symbols, undefined
  }
  if (seen.has(v)) return "<circular>";
  if (depth >= MAX_DEPTH) return "<deep>";
  seen.add(v);
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : null;
  if (Array.isArray(v) || v instanceof Set) return cleanArray([...v], key, depth, seen);
  const entries = v instanceof Map ? [...v].map(([k, x]) => [String(k), x]) : Object.entries(v);
  return cleanObject(entries, depth, seen);
}

function cleanArray(items, key, depth, seen) {
  const out = [];
  for (const item of items.slice(0, MAX_ITEMS)) {
    const c = clean(item, key, depth + 1, seen);
    if (c !== undefined) out.push(c);
  }
  if (items.length > MAX_ITEMS) out.push(`<+${items.length - MAX_ITEMS} more>`);
  return out;
}

function cleanObject(entries, depth, seen) {
  const out = {};
  let removed = 0;
  let kept = 0;
  for (const [k, x] of entries) {
    if (!mayExport(k, x) || !isSafeKey(k) || kept >= MAX_KEYS) {
      removed++;
      continue;
    }
    const c = clean(x, k, depth + 1, seen);
    if (c === undefined) continue;
    out[k] = c;
    kept++;
  }
  if (removed) out._removedKeys = removed;
  return out;
}

// Keys may be counter names ("classify.drop.category:ENGAGEMENT") but not ids, URLs or free text.
function isSafeKey(k) {
  return k.length <= MAX_TOKEN && !/\s|\/|@/.test(k) && !/\d{5,}/.test(k) && !looksRandom(k);
}

export function reportFileName(date = new Date()) {
  return `mfga-report-${date.toISOString().slice(0, 10)}.json`;
}

// ---- Health tab ----------------------------------------------------------------------------------------

/** {"classify.keep": 3, "gql.requests": 2, misc: 1} -> [{area: "classify", rows: [["keep", 3]], total: 3}, ...] */
export function groupCounters(counters) {
  const areas = new Map();
  for (const [key, n] of Object.entries(counters || {})) {
    if (typeof n !== "number") continue;
    const dot = key.indexOf(".");
    const area = dot > 0 ? key.slice(0, dot) : "general";
    const name = dot > 0 ? key.slice(dot + 1) : key;
    if (!areas.has(area)) areas.set(area, []);
    areas.get(area).push([name, n]);
  }
  return [...areas]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([area, rows]) => ({
      area,
      rows: rows.sort(([a], [b]) => a.localeCompare(b)),
      total: rows.reduce((sum, [, n]) => sum + n, 0),
    }));
}

/** {module: {n, first}} -> [[module, n, first]] sorted by module. */
export function errorRows(errors) {
  return Object.entries(errors || {})
    .map(([module, e]) => [module, Number(e?.n) || 0, e?.first == null ? "" : String(e.first)])
    .sort(([a], [b]) => a.localeCompare(b));
}

/** Display text for a fact value: primitives as-is, lists joined, objects as compact JSON, capped. */
export function formatValue(v, max = 300) {
  let s;
  if (v == null) s = "—";
  else if (typeof v === "string") s = v;
  else if (typeof v !== "object") s = String(v);
  else if (Array.isArray(v) && v.every((x) => x == null || typeof x !== "object")) s = v.join(", ");
  else s = safeJson(v);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function safeJson(v) {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

const SNAPSHOT_KEYS = new Set(["counters", "errors", "facts", "disabled"]);

/** Everything else a snapshot carries (main.js may add registry or merge stats), one level flattened. */
export function otherEntries(snapshot) {
  const out = [];
  for (const [key, v] of Object.entries(snapshot || {})) {
    if (SNAPSHOT_KEYS.has(key)) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [sub, x] of Object.entries(v)) out.push([`${key}.${sub}`, formatValue(x)]);
    } else {
      out.push([key, formatValue(v)]);
    }
  }
  return out;
}
