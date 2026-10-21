// One page of a Feeds-tab connection: organic stories from the world plus deterministic junk, with opaque
// cursors. Shared by the SSR first page (site.mjs) and the mock /api/graphql/ (mock-graphql.mjs), so page 1 in
// the HTML and page 1 over GraphQL are identical.

import { createHash } from "node:crypto";
import { junkPlan } from "./world.mjs";
import { organicEdge, junkEdge } from "./graphql-shapes.mjs";

const PREFIX_BYTES = 48; // multiple of 3: the prefix encodes to exactly 64 base64url characters

/** Opaque base64url cursor (connection + offset) with a random-looking tail like Facebook's. */
export function encodeCursor(feedName, offset) {
  const head = Buffer.from(`mfgafx|${feedName}|${offset}|`.padEnd(PREFIX_BYTES, "~")).toString("base64url");
  const tail = createHash("sha512").update(`${feedName}:${offset}`).digest("base64url");
  return head + tail;
}

/** -> { feedName, offset } or null when the string is not one of our cursors. */
export function decodeCursor(cursor) {
  if (typeof cursor !== "string" || cursor.length < 64) return null;
  const m = /^mfgafx\|(\w+)\|(\d+)\|~*$/.exec(Buffer.from(cursor.slice(0, 64), "base64url").toString());
  return m ? { feedName: m[1], offset: Number(m[2]) } : null;
}

/**
 * feedPage(world, "friends", { offset, size, ctx }) ->
 *   { edges, pageInfo: { endCursor, hasNextPage }, organicIds, junkIds }
 * ctx: { scale, obfuscateCategory } for the shape builders.
 */
export function feedPage(world, feedName, { offset = 0, size = 4, ctx }) {
  const ids = world.feed(feedName);
  const organic = ids.slice(offset, offset + size).map((id) => world.story(id));
  const edges = organic.map((story, i) => organicEdge(world, story, ctx, encodeCursor(feedName, offset + i + 1), { engagement: feedName === "top" && world.engagement.has(story.postId) }));
  const plan = junkPlan(world, feedName, Math.floor(offset / Math.max(1, size)), organic.length);
  const junkIds = [];
  for (const item of plan) {
    edges.splice(item.position, 0, junkEdge(world, item, ctx, encodeCursor(feedName, offset + Math.min(item.position, organic.length))));
    junkIds.push(item.instance);
  }
  const next = offset + organic.length;
  return {
    edges,
    pageInfo: { endCursor: organic.length ? encodeCursor(feedName, next) : null, hasNextPage: next < ids.length },
    organicIds: organic.map((s) => s.postId),
    junkIds,
  };
}
