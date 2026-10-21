import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTarget } from "../../../src/fb/nav.js";
import { changedVars, syncObserved } from "../../../src/fb/layout.js";

const www = new URL("https://www.facebook.com/?filter=all&sk=h_chr");
const web = new URL("https://web.facebook.com/groups/feed/");

test("resolveTarget resolves relative and absolute links against the current page", () => {
  assert.equal(resolveTarget("/friends/", www).href, "https://www.facebook.com/friends/");
  assert.equal(resolveTarget("https://www.facebook.com/messages/", www).href, "https://www.facebook.com/messages/");
  assert.equal(resolveTarget("https://developers.facebook.com/", www).href, "https://developers.facebook.com/", "other apps stay where they are");
  assert.equal(resolveTarget("https://www.metacareers.com/", www).href, "https://www.metacareers.com/");
});

test("resolveTarget keeps www.facebook.com links on web.facebook.com (and back) so they stay in the SPA", () => {
  assert.equal(resolveTarget("https://www.facebook.com/friends/?a=1#x", web).href, "https://web.facebook.com/friends/?a=1#x");
  assert.equal(resolveTarget("https://web.facebook.com/pokes/", www).href, "https://www.facebook.com/pokes/");
  assert.equal(resolveTarget("https://facebook.com/me/", web).href, "https://web.facebook.com/me/");
  assert.equal(resolveTarget("https://business.facebook.com/latest/", web).host, "business.facebook.com");
});

test("resolveTarget refuses script and other non-web URLs", () => {
  for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "blob:https://www.facebook.com/1", "mailto:x@example.com", "http://[bad"]) {
    assert.equal(resolveTarget(bad, www), null, bad);
  }
});

/** A ResizeObserver stand-in that records what it observes. */
function fakeObserver() {
  const live = new Set();
  return { live, observe: (el) => live.add(el), unobserve: (el) => live.delete(el) };
}
const node = (connected = true) => ({ isConnected: connected });

test("syncObserved observes new targets once and forgets detached ones", () => {
  const ro = fakeObserver();
  const html = node();
  const main1 = node();
  let observed = syncObserved(ro, new Set(), [html, main1, null, html]);
  assert.deepEqual([...ro.live], [html, main1]);
  assert.deepEqual([...observed], [html, main1]);

  // Facebook re-renders: the old main column is detached and a new one takes its place.
  main1.isConnected = false;
  const main2 = node();
  observed = syncObserved(ro, observed, [html, main1, main2]);
  assert.deepEqual([...ro.live], [html, main2], "the detached column is no longer held");
  assert.deepEqual([...observed], [html, main2]);

  // A target that is simply no longer wanted (no main column on plain pages) is dropped too.
  observed = syncObserved(ro, observed, [html, null]);
  assert.deepEqual([...ro.live], [html]);
});

test("changedVars ignores sub-pixel re-measurement noise, so an idle page is never restyled", () => {
  // Measured on /groups/feed/: a fractional column offset re-measures 0.02px off after it is applied
  // (LayoutUnit snapping); each rewrite of the :root variables cost a full-page style recalc every second.
  const applied = { dx: 43.66, dy: 20, footer: 8931 };
  assert.deepEqual(changedVars({ dx: 43.64, dy: 20, footer: 8931 }, applied), { geometry: false, footer: false });
  assert.deepEqual(changedVars({ dx: 43.66, dy: 20.05, footer: 8931.04 }, applied), { geometry: false, footer: false });
  assert.deepEqual(changedVars({ dx: 44.66, dy: 20, footer: 8931 }, applied), { geometry: true, footer: false });
  assert.deepEqual(changedVars({ dx: 43.66, dy: 20, footer: 9500 }, applied), { geometry: false, footer: true }, "the footer alone moves when the page grows");
});
