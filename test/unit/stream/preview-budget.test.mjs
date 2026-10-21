import { test } from "node:test";
import assert from "node:assert/strict";
import { PREVIEW_LIMITS, createPreviewBudget } from "../../../src/ui/stream/preview-budget.js";

function clock(start = 1_800_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

const takeAll = (budget, n) => Array.from({ length: n }, () => budget.take());

test("previews are rationed per minute (a sliding window), not one per story read", () => {
  const c = clock();
  const budget = createPreviewBudget({ perMinute: 3, perPage: 100 }, c.now);
  assert.deepEqual(takeAll(budget, 5), [true, true, true, false, false]);
  c.advance(59_999);
  assert.equal(budget.take(), false, "still inside the minute of the first three");
  c.advance(1);
  assert.deepEqual(takeAll(budget, 4), [true, true, true, false]);
});

test("a page gets a fixed number of previews; after that only clicks load comments", () => {
  const c = clock();
  const budget = createPreviewBudget({ perMinute: 2, perPage: 5 }, c.now);
  let granted = 0;
  for (let minute = 0; minute < 10; minute++, c.advance(60e3)) granted += takeAll(budget, 3).filter(Boolean).length;
  assert.equal(granted, 5);
  assert.equal(budget.spent(), true);
});

test("a failed preview pauses previews for a while", () => {
  const c = clock();
  const budget = createPreviewBudget({ perMinute: 10, perPage: 100, pauseAfterFailureMs: 600e3 }, c.now);
  assert.equal(budget.take(), true);
  budget.failed();
  c.advance(599e3);
  assert.equal(budget.take(), false);
  assert.equal(budget.spent(), false, "paused, not spent: stories may try again later");
  c.advance(1e3);
  assert.equal(budget.take(), true);
});

test("the default ration is at most a preview every ten seconds on average", () => {
  assert.ok(PREVIEW_LIMITS.perMinute <= 6);
  assert.ok(PREVIEW_LIMITS.perPage <= 60);
  const c = clock();
  const budget = createPreviewBudget(undefined, c.now);
  let granted = 0;
  // Someone reading one story a second for five minutes.
  for (let s = 0; s < 300; s++, c.advance(1e3)) if (budget.take()) granted++;
  assert.equal(granted, PREVIEW_LIMITS.perMinute * 5);
});
