// K-way watermark merge of feed sources by creation time, with dedup (graphql-protocol §9).
// A buffered story is shown only once no unfinished source can still deliver anything newer: the watermark
// is the newest "oldest story seen so far" among unfinished sources, and the source holding it is fetched next.

import { health } from "../shared/util.js";
import { matchesKeywords } from "./text.js";

const FATAL = new Set(["auth", "checkpoint"]);
const TRANSIENT = new Set(["network", "server", "rate", "soft-block", "token"]);

/**
 * createMergedFeed({ sources, pageSize, keywords }) -> { more(): Promise<Story[]>, exhausted, stats() }
 * A single source keeps its own order (Top News is ranked, not chronological).
 * Hooks: maxFetches (source requests per more() call, a safety valve), matches (WP-A matchesKeywords).
 */
export function createMergedFeed({ sources, pageSize = 10, keywords = [], maxFetches = 6, matches = matchesKeywords }) {
  const lanes = sources.map((src) => ({ src, buf: [], oldest: Infinity, lastTime: null, failed: null, fetched: 0, kept: 0, dropped: {} }));
  const ordered = lanes.length > 1;
  const byKey = new Map();
  const counts = { emitted: 0, duplicates: 0, keyword: 0 };
  const feed = { more, exhausted: lanes.length === 0, stats };
  return feed;

  async function more() {
    const out = [];
    let fetches = 0;
    for (;;) {
      drain(out);
      if (out.length >= pageSize) break;
      const lane = laggard();
      if (!lane || fetches++ >= maxFetches) break;
      try {
        await pull(lane);
      } catch (err) {
        if (FATAL.has(err?.kind) || TRANSIENT.has(err?.kind)) {
          if (out.length) break; // show what we have; the next call retries
          throw err;
        }
        retire(lane, err);
      }
    }
    feed.exhausted = lanes.every((l) => finished(l) && !l.buf.length);
    const failures = lanes.filter((l) => l.failed);
    if (!out.length && feed.exhausted && failures.length === lanes.length && lanes.length) throw failures[0].failed;
    return out;
  }

  /** Moves every story at or above the watermark into `out`, newest first. */
  function drain(out) {
    const mark = watermark();
    while (out.length < pageSize) {
      const lane = newestHead();
      if (!lane || lane.buf[0].t < mark) return;
      const { story } = lane.buf.shift();
      if (keywords.length && matches(story, keywords)) {
        counts.keyword++;
        continue;
      }
      out.push(story);
      counts.emitted++;
    }
  }

  function watermark() {
    let mark = -Infinity;
    for (const l of lanes) if (!finished(l)) mark = Math.max(mark, l.oldest);
    return mark;
  }

  function newestHead() {
    let best = null;
    for (const l of lanes) if (l.buf.length && (!best || l.buf[0].t > best.buf[0].t)) best = l;
    return best;
  }

  /** The unfinished source holding the watermark back (never-fetched sources first). */
  function laggard() {
    let best = null;
    for (const l of lanes) if (!finished(l) && (!best || l.oldest > best.oldest)) best = l;
    return best;
  }

  const finished = (l) => l.src.done || !!l.failed;

  async function pull(lane) {
    const page = await lane.src.next();
    lane.fetched++;
    for (const [reason, n] of Object.entries(page?.dropped ?? {})) lane.dropped[reason] = (lane.dropped[reason] || 0) + n;
    for (const story of page?.stories ?? []) admit(lane, story);
  }

  function admit(lane, story) {
    // Stories without a time stay next to their neighbours in the same source.
    const t = Number.isFinite(story.time) ? story.time : (lane.lastTime ?? Number.MAX_SAFE_INTEGER);
    lane.lastTime = t;
    lane.oldest = Math.min(lane.oldest, t);
    const known = story.key != null ? byKey.get(story.key) : null;
    if (known) {
      for (const s of story.sources ?? []) if (!known.sources.includes(s)) known.sources.push(s);
      counts.duplicates++;
      return;
    }
    if (story.key != null) byKey.set(story.key, story);
    story.sources = [...(story.sources ?? [])];
    lane.kept++;
    insert(lane, { story, t });
  }

  function insert(lane, item) {
    let at = lane.buf.length;
    if (ordered) while (at > 0 && lane.buf[at - 1].t < item.t) at--;
    lane.buf.splice(at, 0, item);
  }

  function retire(lane, err) {
    lane.failed = err;
    health.count("feed.sourceFailed");
    health.error(`feed.${lane.src.name}`, err);
  }

  function stats() {
    const hidden = { keyword: counts.keyword };
    const perSource = {};
    for (const l of lanes) {
      for (const [reason, n] of Object.entries(l.dropped)) hidden[reason] = (hidden[reason] || 0) + n;
      perSource[l.src.name] = {
        fetched: l.fetched,
        kept: l.kept,
        buffered: l.buf.length,
        done: !!l.src.done,
        failed: l.failed ? l.failed.kind || "error" : null,
        dropped: { ...l.dropped },
      };
    }
    return { ...counts, hidden, sources: perSource };
  }
}
