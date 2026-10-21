// One Feeds-tab connection of CometModernHomeFeedQuery (one feedStyle) with its own cursor.
// graphql-protocol §4: replay the page's own preloader variables, override only the filter, the cursor,
// refreshMode and scale; page 1 of the filter the user landed on comes from the SSR payload (zero requests).

import { health } from "../shared/util.js";
import { createClassifier } from "./classify.js";
import { extractStory } from "./extract.js";
import { DEFAULT_CODEC, GqlError, decodePayloads, errorKind } from "./gql.js";
import { runOp } from "./ops.js";

export const FEED_QUERY = "CometModernHomeFeedQuery";

export const FEED_STYLES = Object.freeze({
  friends: "MOST_RECENT_FRIENDS_FEED",
  groups: "MOST_RECENT_GROUPS_FEED",
  pages: "MOST_RECENT_PAGES_FEED",
  favorites: "FAVORITES_FEED",
  all: "MOST_RECENT_FEED_DEFAULT",
  top: "DEFAULT",
});

// Facebook "did not advance the feed": give up after this many pages in a row without edges.
const MAX_EMPTY_PAGES = 3;

/** The preloader's variables with only the documented overrides (ARCHITECTURE §3.1). */
export function feedVariables(template, { feedStyle, orderby, cursor, scale }) {
  return {
    ...template,
    feedStyle,
    orderby,
    feedEndCursor: cursor ?? null,
    refreshMode: "COLD_START",
    scale: Math.max(2, Number(scale) || 0, Number(template.scale) || 0),
  };
}

/**
 * createFeedSource({ name, client, ops, harvest, classifier, scale })
 *   -> { name, done, next(): Promise<{stories, dropped}>, reset() }
 * Hooks: extract (WP-A extractStory), codec (JSONL/typename decoders for SSR payloads).
 */
export function createFeedSource({
  name,
  client,
  ops,
  harvest,
  classifier = createClassifier(),
  scale,
  extract = extractStory,
  codec = DEFAULT_CODEC,
}) {
  const feedStyle = FEED_STYLES[name];
  if (!feedStyle) throw new Error(`unknown feed source "${name}"`);
  const orderby = name === "top" ? ["TOP_STORIES"] : ["MOST_RECENT"];
  let cursor, seenCursors, ssrPending, emptyPages;
  let generation = 0;
  let queue = Promise.resolve();

  const source = { name, done: false, next, reset };
  reset();
  return source;

  function reset() {
    generation++;
    cursor = null;
    seenCursors = new Set();
    ssrPending = true;
    emptyPages = 0;
    source.done = false;
  }

  /** One page at a time: overlapping calls would replay the same cursor and end the feed as "not advancing". */
  function next() {
    const run = queue.then(readPage);
    queue = run.catch(() => {});
    return run;
  }

  async function readPage() {
    if (source.done) return { stories: [], dropped: {} };
    const gen = generation;
    await harvest.ready;
    const ssr = ssrPending ? ssrConnection() : null;
    ssrPending = false;
    const connection = ssr ?? (await fetchConnection());
    const page = await readEdges(connection.edges);
    if (gen === generation) advance(connection, !!ssr); // a reset() meanwhile starts over; keep its state
    return page;
  }

  /** The SSR-streamed first page, when the page's own preloader was for this connection (feedStyle + orderby). */
  function ssrConnection() {
    const preloader = harvest.preloaders?.get(FEED_QUERY);
    if (preloader?.variables?.feedStyle !== feedStyle || !sameOrder(preloader.variables.orderby)) return null;
    const payloads = harvest.prefetched?.get(preloader.preloaderID);
    if (!payloads?.length) return null;
    const connection = decodePayloads(payloads, harvest.env?.typenamePairs, codec).data?.viewer?.news_feed;
    if (connection) health.count("feed.ssrPage");
    return connection ?? null;
  }

  /** Each orderby is its own connection with its own cursors (e.g. legacy ?sk=favorites preloads orderby []). */
  function sameOrder(preloaded) {
    return preloaded == null || JSON.stringify(preloaded) === JSON.stringify(orderby);
  }

  async function fetchConnection() {
    const res = await runOp({ client, ops }, FEED_QUERY, (op) => {
      if (!op.variables) throw new GqlError(`no ${FEED_QUERY} variables template`, { kind: "variables" });
      return feedVariables(op.variables, { feedStyle, orderby, cursor, scale });
    });
    if (!res) throw new GqlError(`no doc_id for ${FEED_QUERY}`, { kind: "stale-doc" });
    const connection = res.data?.viewer?.news_feed;
    if (connection == null || typeof connection !== "object") {
      // A field error nulled the connection: that is a failed page, not the end of the feed.
      const first = res.errors?.[0];
      throw new GqlError(String(first?.message || "response without news_feed"), { code: first?.code ?? null, kind: errorKind(first?.code) });
    }
    health.count("feed.pages");
    return connection;
  }

  async function readEdges(edges) {
    const stories = [];
    const dropped = {};
    const drop = (reason) => (dropped[reason] = (dropped[reason] || 0) + 1);
    for (const edge of Array.isArray(edges) ? edges : []) {
      if (!edge) {
        drop("no-node"); // a hole left by a stream line that never arrived
        continue;
      }
      const verdict = await classifier.classify(edge);
      if (!verdict?.keep) {
        drop(verdict?.reason || "unknown");
        continue;
      }
      const story = extract(edge.node, { sources: [name], dedupKey: edge.deduplication_key });
      if (story) stories.push(story);
      else drop("unparsed");
    }
    return { stories, dropped };
  }

  /** Moves the cursor; stops on has_next_page false, a missing or repeated cursor, or repeated empty pages. */
  function advance(connection, fromSsr) {
    const info = connection.page_info;
    // An SSR stream cut before its page_info: page 1 is fetched again from the network (merge dedups).
    if (fromSsr && !info) return;
    const edgeCount = Array.isArray(connection.edges) ? connection.edges.filter(Boolean).length : 0;
    emptyPages = edgeCount ? 0 : emptyPages + 1;
    const end = info?.end_cursor;
    if (info?.has_next_page === false || !end || seenCursors.has(end) || emptyPages >= MAX_EMPTY_PAGES) {
      source.done = true;
      return;
    }
    seenCursors.add(end);
    cursor = end;
  }
}
