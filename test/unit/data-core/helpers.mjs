// Shared helpers for the data-core tests: fixture loading and the parse -> stitch -> edges pipeline.

import { readFileSync } from "node:fs";
import path from "node:path";
import { FIXTURE_DIR } from "../../fixtures/gql/make-fixtures.mjs";
import { parseLines, stitch } from "../../../src/data/jsonl.js";

export const REAL_DIR = path.join(FIXTURE_DIR, "real");

export const readFixture = (file, dir = FIXTURE_DIR) => readFileSync(path.join(dir, file), "utf8");
export const readJson = (file, dir = FIXTURE_DIR) => JSON.parse(readFixture(file, dir));

/** Stitched data of a JSON-lines fixture. */
export function stitchFile(file, dir) {
  return stitch(parseLines(readFixture(file, dir)));
}

/** Non-hole edges of a stitched home-feed response. */
export function feedEdges(data) {
  return (data?.viewer?.news_feed?.edges ?? []).filter(Boolean);
}

/** Edges of a fixture file, in order. */
export function edgesOf(file, dir) {
  return feedEdges(stitchFile(file, dir).data);
}

/** The first edge's node of a single-scenario fixture. */
export const nodeOf = (file) => edgesOf(file)[0].node;

/** Payloads carried by data-sjs blocks (RelayPrefetchedStreamCache.next), sorted by sequence_number. */
export function sjsPayloads(blocks) {
  const found = [];
  const walk = (v) => {
    if (Array.isArray(v)) {
      if (typeof v[0] === "string" && v[0].startsWith("RelayPrefetchedStreamCache") && v[1] === "next") found.push(v[3][1].__bbox);
      else v.forEach(walk);
    } else if (v && typeof v === "object") {
      Object.values(v).forEach(walk);
    }
  };
  blocks.forEach(walk);
  return found.sort((a, b) => a.sequence_number - b.sequence_number).map((b) => b.result);
}

/**
 * The research samples mark trimmed data with "<trimmed>" values and "<+N more trimmed>" list entries.
 * Trimmed values become null (missing data) and the list markers are removed.
 */
export function untrim(value) {
  if (Array.isArray(value)) return value.filter((v) => !(typeof v === "string" && /^<\+\d+ more trimmed>$/.test(v))).map(untrim);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, v === "<trimmed>" ? null : untrim(v)]));
  return value;
}

/** Deep clone that also nests `value` `depth` levels down under `key` (for depth-bound tests). */
export function nest(value, depth, key = "x") {
  let out = value;
  for (let i = 0; i < depth; i++) out = { [key]: out };
  return out;
}
