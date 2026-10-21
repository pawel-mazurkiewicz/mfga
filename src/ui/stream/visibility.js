// "Visible for at least N ms" callbacks on one shared IntersectionObserver (lazy comment previews).

const watched = new Map(); // element -> { ms, cb, timer }
let observer = null;

function onEntries(entries) {
  for (const entry of entries) {
    const w = watched.get(entry.target);
    if (!w) continue;
    if (entry.isIntersecting) {
      w.timer ||= setTimeout(() => fire(entry.target), w.ms);
    } else {
      clearTimeout(w.timer);
      w.timer = 0;
    }
  }
}

function fire(el) {
  const w = watched.get(el);
  unwatch(el);
  w?.cb();
}

/** Calls cb once, after `el` has stayed in the viewport for `ms`. Returns a cancel function. */
export function whenVisibleFor(el, ms, cb) {
  if (typeof IntersectionObserver !== "function") return () => {};
  observer ||= new IntersectionObserver(onEntries);
  watched.set(el, { ms, cb, timer: 0 });
  observer.observe(el);
  return () => unwatch(el);
}

export function unwatch(el) {
  const w = watched.get(el);
  if (!w) return;
  clearTimeout(w.timer);
  watched.delete(el);
  observer?.unobserve(el);
}

/** Drops every watch on elements inside `root` (feed reload/destroy). */
export function unwatchWithin(root) {
  for (const el of [...watched.keys()]) if (root.contains(el)) unwatch(el);
}
