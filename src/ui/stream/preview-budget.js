// Comment previews are MFGA's own idea: Facebook's client asks for a post's comments only when someone clicks
// "View more comments" (graphql-protocol §5.7). One request per story read would make MFGA's traffic look like a
// comments scraper, so previews are rationed per minute and per page, and stop for a while after a failure.
// Clicking "View all N comments" is the user's own request and is never rationed.

export const PREVIEW_LIMITS = Object.freeze({
  perMinute: 6,
  perPage: 60,
  pauseAfterFailureMs: 10 * 60e3,
});

const MINUTE_MS = 60e3;

/**
 * createPreviewBudget(limits?, now?) -> { take(): boolean, failed(): void, spent(): boolean }
 * take(): whether one more preview may be sent now (and counts it). spent(): no preview will be allowed again
 * on this page. failed(): a preview request failed; previews pause for pauseAfterFailureMs.
 */
export function createPreviewBudget(limits = PREVIEW_LIMITS, now = () => Date.now()) {
  const { perMinute, perPage, pauseAfterFailureMs } = { ...PREVIEW_LIMITS, ...limits };
  const recent = [];
  let total = 0;
  let pausedUntil = 0;
  return {
    take() {
      const t = now();
      if (total >= perPage || t < pausedUntil) return false;
      while (recent.length && t - recent[0] >= MINUTE_MS) recent.shift();
      if (recent.length >= perMinute) return false;
      recent.push(t);
      total++;
      return true;
    },
    failed() {
      pausedUntil = now() + pauseAfterFailureMs;
    },
    spent() {
      return total >= perPage;
    },
  };
}
