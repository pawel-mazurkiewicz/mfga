// Reads live data out of Facebook's own (hidden) chrome for the 2010 shell (dom-chrome §2–§6):
// identity, unread counts, group/page shortcuts, birthdays and contacts. Rail data is cached in storage
// ("mfga:rail") because the Feeds routes (/?filter=…) render no rails at all.
import { safe, health, normLabel } from "../shared/util.js";
import { classifyRoute } from "./routes.js";
import { HOST_ID, findBanner } from "./layout.js";

export const RAIL_KEY = "mfga:rail";
const RAIL_VERSION = 1;
const CONTACTS_FRESH_MS = 10 * 60 * 1000;
const REFRESH_GAP_MS = 400;
const RESCAN_MS = 2000;

// ---------------------------------------------------------------------------------------------------
// Labels (EN + PL) and pure parsers

const ACCOUNT_NAV = new Set(["account controls and settings", "mechanizmy kontrolne i ustawienia konta"]);
const SHORTCUTS_NAV = new Set(["shortcuts", "skróty"]);
const JEWELS = {
  notifications: new Set(["notifications", "powiadomienia"]),
  messages: new Set(["messenger", "messages", "wiadomości", "chats", "czaty"]),
  profile: new Set(["your profile", "twój profil", "account", "konto"]),
  menu: new Set(["menu", "facebook menu", "menu facebooka"]),
};
const COUNT_RE = /,\s*[^\d,]*?(\d+)\+?/;
const PRESENCE_RE = /,\s*(?:active|aktywn\S*|online)(?:\s.*)?$/i;

/** "Notifications, 5 unread" → 5, "Wiadomości, nieprzeczytane: 5" → 5, "Notifications" → 0. */
export function parseCount(label) {
  const m = COUNT_RE.exec(String(label ?? ""));
  return m ? Number(m[1]) : 0;
}

/** Which banner button an aria-label names: "notifications" | "messages" | "profile" | "menu" | null. */
export function jewelKind(label) {
  const head = normLabel(String(label ?? "").split(",")[0]);
  for (const [kind, names] of Object.entries(JEWELS)) if (names.has(head)) return kind;
  return null;
}

/**
 * Reads the account-controls buttons' labels (in DOM order, focus-helper duplicates removed).
 * Unknown languages fall back to position: [menu, messenger, notifications, profile].
 */
export function countsFromLabels(labels) {
  const out = { notifications: null, messages: null };
  for (const label of labels) {
    const kind = jewelKind(label);
    if ((kind === "notifications" || kind === "messages") && out[kind] == null) out[kind] = parseCount(label);
  }
  if (out.notifications == null && out.messages == null && labels.length >= 3) {
    out.notifications = parseCount(labels[labels.length - 2]);
    if (labels.length >= 4) out.messages = parseCount(labels[labels.length - 3]);
  }
  return out;
}

const APOS = "['’]";
// Most specific first: "X and 3 others …" must not be read as one person called "X and 3 others".
const BIRTHDAY_PATTERNS = [
  [/^(.+?) and (\d+) others? (?:have birthdays|has a birthday) today/i, "others"],
  [/^(.+?) i (\d+) \S+(?: \S+)? mają dziś urodziny/i, "others"],
  [/^(.+?) and (.+?) have birthdays today/i, "list"],
  [/^(.+?) i (.+?) mają dziś urodziny/i, "list"],
  [new RegExp(`^(.+?)${APOS}s? birthday is today`, "i"), "one"],
  [/^(.+?) has a birthday today/i, "one"],
  [/^(.+?) ma dziś urodziny/i, "one"],
];

/**
 * Parses the right rail's birthday sentence. Returns {names, others} or null when the sentence has an
 * unknown shape (the caller then shows Facebook's sentence as-is).
 */
export function parseBirthdays(text) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  for (const [re, kind] of BIRTHDAY_PATTERNS) {
    const m = re.exec(s);
    if (!m) continue;
    if (kind === "one") return { names: [m[1].trim()], others: 0 };
    if (kind === "others") return { names: [m[1].trim()], others: Number(m[2]) };
    const names = m[1].split(/\s*,\s*/).concat(m[2]).map((x) => x.trim()).filter(Boolean);
    return { names, others: 0 };
  }
  return null;
}

/** "Tom Hellier, Active" → {name: "Tom Hellier", online: true}. */
export function parseContactLabel(label) {
  const s = String(label ?? "").replace(/\s+/g, " ").trim();
  const online = PRESENCE_RE.test(s);
  return { name: online ? s.replace(PRESENCE_RE, "").trim() : s, online };
}

// First path segments that are Facebook apps/sections, never a person, Page or group.
const RESERVED = new Set([
  "", "friends", "onthisday", "memories", "saved", "groups", "reel", "reels", "watch", "marketplace", "dating",
  "events", "messages", "pages", "ad_campaign", "adsmanager", "ads", "fundraisers", "gaming", "games",
  "messenger_kids", "professional_dashboard", "bookmarks", "feeds", "news", "video", "live", "jobs", "weather",
  "me", "home.php", "notifications", "settings", "help", "privacy", "policies", "search", "photo", "photo.php",
  "photos", "permalink.php", "story.php", "stories", "hashtag", "pokes", "business", "climatescienceinfo",
  "coronavirus_info", "lift", "offers", "recommendations", "community_notes", "meta_verified", "orders",
]);
const GROUP_RESERVED = new Set(["feed", "joins", "discover", "create", "search", "notifications", "your_groups"]);

/**
 * Classifies a left-rail href: {kind: "group"|"profile"|"app"|"external", url}. "profile" covers people,
 * Pages and other profiles you can switch to.
 */
export function classifyShortcut(href, base = "https://www.facebook.com/") {
  let u;
  try {
    u = new URL(href, base);
  } catch {
    return { kind: "external", url: null };
  }
  if (!/(^|\.)facebook\.com$/i.test(u.hostname) || /^l\./i.test(u.hostname)) return { kind: "external", url: u.href };
  const segs = u.pathname.split("/").filter(Boolean);
  if (segs[0] === "groups" && segs.length === 2 && !GROUP_RESERVED.has(segs[1])) {
    return { kind: "group", url: `https://www.facebook.com/groups/${segs[1]}/`, id: segs[1] };
  }
  if (segs.length === 1 && segs[0] === "profile.php" && u.searchParams.get("id")) {
    return { kind: "profile", url: `https://www.facebook.com/profile.php?id=${u.searchParams.get("id")}`, id: u.searchParams.get("id") };
  }
  if (segs.length === 1 && !RESERVED.has(segs[0].toLowerCase()) && !segs[0].includes(".")) {
    return { kind: "profile", url: `https://www.facebook.com/${segs[0]}`, id: segs[0] };
  }
  return { kind: "app", url: u.href, path: `/${segs.join("/")}` };
}

/** Picks a row's name and badge count from its text leaves (["Gaming Club", "12"] → name, 12). */
export function nameAndCount(leaves) {
  const texts = leaves.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  const isCount = (s) => /^\d+\+?$/.test(s);
  const name = texts.find((s) => !isCount(s) && !/^\d+\s/.test(s)) ?? texts.find((s) => !isCount(s)) ?? texts[0] ?? "";
  const countText = texts.length > 1 ? texts.find((s) => isCount(s) && s !== name) : null;
  return { name, count: countText ? parseInt(countText, 10) : 0 };
}

/**
 * Turns left-rail rows [{href, name, image, count}] into {me, groups, pages, friendsCount}. The first row is
 * the viewer (dom-chrome §3.1); further profile rows are Pages/profiles they can switch to or pinned.
 */
export function shortcutsFromRows(rows, { userId = null } = {}) {
  const out = { me: null, groups: [], pages: [], friendsCount: null };
  const seen = new Set();
  rows.forEach((row, i) => {
    const c = classifyShortcut(row.href);
    if (!c.url || seen.has(c.url)) return;
    seen.add(c.url);
    const item = { name: row.name, url: c.url, image: row.image || null, count: row.count || 0 };
    if (c.kind === "profile" && (i === 0 || (userId && c.id === userId)) && !out.me) out.me = item;
    else if (c.kind === "profile" && row.name) out.pages.push(item);
    else if (c.kind === "group" && row.name) out.groups.push(item);
    else if (c.kind === "app" && /^\/friends$/.test(c.path)) out.friendsCount = row.count || 0;
  });
  return out;
}

/** Merges live rail data over the cached copy. Cached presence goes stale; cached birthdays only last a day. */
export function mergeRail(live, cached, now = Date.now()) {
  const c = cached && cached.v === RAIL_VERSION ? cached : null;
  const sameDay = c && new Date(c.savedAt).toDateString() === new Date(now).toDateString();
  const fresh = c && now - c.savedAt < CONTACTS_FRESH_MS;
  const cachedContacts = (c?.contacts || []).map((x) => (fresh ? x : { ...x, online: false }));
  return {
    me: live.me || c?.me || null,
    groups: live.groups ?? c?.groups ?? [],
    pages: live.pages ?? c?.pages ?? [],
    birthdays: live.birthdays ?? (sameDay ? c.birthdays : null) ?? [],
    contacts: live.contacts ?? (c ? cachedContacts : null),
  };
}

/** What goes to storage: only the parts that were read live this time, over the previous cache. */
export function railToCache(live, prev, now = Date.now()) {
  const base = prev && prev.v === RAIL_VERSION ? prev : {};
  return {
    v: RAIL_VERSION,
    savedAt: now,
    me: live.me || base.me || null,
    groups: live.groups ?? base.groups ?? [],
    pages: live.pages ?? base.pages ?? [],
    birthdays: live.birthdays ?? base.birthdays ?? [],
    contacts: live.contacts ?? base.contacts ?? [],
  };
}

// ---------------------------------------------------------------------------------------------------
// DOM finders (language-free first, then EN/PL labels)

// Facebook's own chrome only: not inside a dialog/push view, and never our shell (which links to the same places).
const isFacebookChrome = (el) => !el.closest(`[role="dialog"], #${HOST_ID}`);

/** The banner's "Account Controls and Settings" navigation. */
export function findAccountNav(doc = document) {
  const banner = findBanner(doc);
  if (!banner) return null;
  const navs = [...banner.querySelectorAll('[role="navigation"]')];
  return (
    navs.find((n) => ACCOUNT_NAV.has(normLabel(n.getAttribute("aria-label")))) ||
    navs.find((n) => !n.querySelector('ul a[href="/"]') && n.querySelector("[aria-haspopup]")) ||
    null
  );
}

/**
 * The account controls' real buttons: not Facebook's zero-size focus-helper duplicates (tabindex=-1), not
 * buttons nested in buttons, not rows of an open dropdown.
 */
function accountButtons(nav) {
  return [...nav.querySelectorAll('[role="button"]')].filter(
    (b) => b.getAttribute("tabindex") !== "-1" && !b.parentElement?.closest('[role="button"], [role="dialog"]'),
  );
}

/** Facebook's "Your profile" button (opens the account menu with Log out). */
export function findAccountButton(doc = document) {
  const nav = findAccountNav(doc);
  if (!nav) return null;
  const buttons = accountButtons(nav);
  return buttons.find((b) => jewelKind(b.getAttribute("aria-label")) === "profile") || buttons[buttons.length - 1] || null;
}

export function findLeftRail(doc = document) {
  const navs = [...doc.querySelectorAll('[role="navigation"]')].filter(
    (n) => isFacebookChrome(n) && !n.closest('[role="banner"]') && !n.closest('[role="main"]'),
  );
  return (
    navs.find((n) => SHORTCUTS_NAV.has(normLabel(n.getAttribute("aria-label")))) ||
    navs.find((n) => n.querySelector('a[href*="facebook.com/friends/"]') && n.querySelector('a[href*="facebook.com/groups/"]')) ||
    null
  );
}

export function findRightRail(doc = document) {
  return [...doc.querySelectorAll('[role="complementary"]')].find((r) => isFacebookChrome(r) && !r.closest('[role="main"]')) || null;
}

function imageOf(el) {
  const img = el.querySelector("img[src]");
  if (img) return img.getAttribute("src");
  const image = el.querySelector("image");
  return image ? image.getAttribute("xlink:href") || image.getAttribute("href") : null;
}

function textLeaves(el) {
  const out = [];
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue.trim()) out.push(n.nodeValue);
  return out;
}

function readRailRows(nav) {
  return [...nav.querySelectorAll("a[href]")]
    .filter((a) => !a.closest('[role="contentinfo"], footer'))
    .map((a) => ({ href: a.href, image: imageOf(a), ...nameAndCount(textLeaves(a)) }));
}

function readBirthdays(rail) {
  return [...rail.querySelectorAll('a[href*="/birthdays"]')].map((a) => {
    const text = (a.getAttribute("aria-label") || a.textContent || "").replace(/\s+/g, " ").trim();
    return { text, url: a.href, ...(parseBirthdays(text) || { names: [], others: 0 }) };
  }).filter((b) => b.text);
}

function readContacts(rail) {
  const out = [];
  for (const a of rail.querySelectorAll('li a[href*="/messages/"], li a[href*="/active/t/"]')) {
    const label = a.getAttribute("aria-label") || a.textContent || "";
    if (/^meta ai\b/i.test(label.trim()) || a.querySelector('image[href*="/gen-ai"], img[src*="/gen-ai"]')) continue;
    const { name, online } = parseContactLabel(label);
    if (name) out.push({ name, online, url: a.href, avatar: imageOf(a) });
  }
  return out;
}

/** The viewer's picture in the banner's "Your profile" button (svg <image>, 40px). */
function accountAvatar(doc) {
  const btn = findAccountButton(doc);
  return btn ? imageOf(btn) : null;
}

function readCookie(name, doc) {
  const m = new RegExp(`(?:^|;\\s*)${name}=(\\d+)`).exec(doc.cookie || "");
  return m ? m[1] : null;
}

/** Live counts from the banner: account-control labels, plus the Friends tab badge for friend requests. */
export function readCounts(doc = document, railFriendsCount = null) {
  const out = { notifications: null, messages: null, friendRequests: null };
  const nav = findAccountNav(doc);
  if (nav) Object.assign(out, countsFromLabels(accountButtons(nav).map((b) => b.getAttribute("aria-label") || "")));
  const banner = findBanner(doc);
  const friendsTab = banner && [...banner.querySelectorAll('[role="navigation"] a[aria-label]')].find((a) => /^\/friends\/?$/.test(new URL(a.href).pathname));
  if (friendsTab) out.friendRequests = parseCount(friendsTab.getAttribute("aria-label"));
  else if (railFriendsCount != null) out.friendRequests = railFriendsCount;
  return out;
}

// ---------------------------------------------------------------------------------------------------
// The reader

/**
 * createChromeReader({platform, identityHint?}) — identityHint() may return {id, name} harvested from
 * CurrentUserInitialData (used when neither the rail nor the cache knows the viewer's name).
 */
export function createChromeReader({ platform, identityHint = null } = {}) {
  const storage = platform?.storage;
  const subs = new Set();
  let cache = null;
  let snap = null;
  let lastJson = "";
  let observer = null;
  let targets = [];
  let rescanTimer = 0;
  let refreshTimer = 0;
  let lastRefresh = 0;
  let persistTimer = 0;

  const readLive = () => {
    // Only the plain Home layout has the rails; the Feeds filter routes have other panels in their place.
    const route = classifyRoute(location);
    const onRailRoute = route.mode === "home" && !route.filter;
    const left = onRailRoute ? findLeftRail(document) : null;
    const right = onRailRoute ? findRightRail(document) : null;
    const userId = readCookie("i_user", document) || readCookie("c_user", document);
    const parsed = left ? shortcutsFromRows(readRailRows(left), { userId }) : null;
    const rail = parsed?.me ? parsed : null; // the Shortcuts rail always starts with the viewer
    return {
      userId,
      counts: readCounts(document, rail?.friendsCount ?? null),
      bannerAvatar: accountAvatar(document),
      rail: {
        me: rail?.me || null,
        groups: rail ? rail.groups : undefined,
        pages: rail ? rail.pages : undefined,
        birthdays: right ? readBirthdays(right) : undefined,
        contacts: right ? readContacts(right) : undefined,
      },
    };
  };

  const persist = (liveRail) => {
    if (!storage || (!liveRail.me && liveRail.groups === undefined && liveRail.contacts === undefined)) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const next = railToCache(liveRail, cache);
      const { savedAt: _a, ...a } = next;
      const { savedAt: _b, ...b } = cache || {};
      if (JSON.stringify(a) === JSON.stringify(b)) return;
      cache = next;
      storage.set(RAIL_KEY, next).catch(() => health.count("shell.rail-cache-write-failed"));
    }, 1000);
  };

  const compute = () => {
    const live = readLive();
    const rail = mergeRail(live.rail, cache);
    const hint = (identityHint && identityHint()) || {};
    const id = live.userId || hint.id || null;
    const me = rail.me;
    snap = {
      identity: {
        id,
        name: me?.name || hint.name || null,
        url: me?.url || (id ? `https://www.facebook.com/profile.php?id=${id}` : "https://www.facebook.com/me/"),
        avatar: live.bannerAvatar || me?.image || null,
      },
      counts: live.counts,
      shortcuts: { groups: rail.groups, pages: rail.pages },
      birthdays: rail.birthdays,
      contacts: rail.contacts,
    };
    persist(live.rail);
    return snap;
  };

  const refresh = safe("chrome-reader", () => {
    lastRefresh = Date.now();
    compute();
    const json = JSON.stringify(snap);
    if (json === lastJson) return snap;
    lastJson = json;
    health.count("shell.reader-update");
    for (const cb of subs) cb(snap);
    return snap;
  });

  const scheduleRefresh = () => {
    if (refreshTimer) return;
    const wait = Math.max(0, REFRESH_GAP_MS - (Date.now() - lastRefresh));
    refreshTimer = setTimeout(() => {
      refreshTimer = 0;
      refresh();
    }, wait);
  };

  // Observe only the banner and the rails (never the feed); re-target when Facebook re-renders them.
  const retarget = () => {
    const next = [findBanner(document), findLeftRail(document), findRightRail(document)].filter(Boolean);
    if (next.length === targets.length && next.every((t, i) => t === targets[i])) return false;
    targets = next;
    observer.disconnect();
    for (const t of targets) {
      observer.observe(t, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["aria-label", "href"] });
    }
    return true;
  };

  const start = () => {
    observer = new MutationObserver(scheduleRefresh);
    retarget();
    rescanTimer = setInterval(() => {
      if (retarget()) scheduleRefresh();
    }, RESCAN_MS);
  };

  const stop = () => {
    observer?.disconnect();
    observer = null;
    targets = [];
    clearInterval(rescanTimer);
    clearTimeout(refreshTimer);
    refreshTimer = 0;
  };

  storage
    ?.get(RAIL_KEY)
    .then((v) => {
      if (v && typeof v === "object") cache = v;
      refresh();
    })
    .catch(() => health.count("shell.rail-cache-read-failed"));

  // While subscribed the snapshot is kept fresh by the observer; otherwise read on demand.
  const current = () => (observer && snap ? snap : compute());

  return {
    identity: () => current().identity,
    counts: () => current().counts,
    shortcuts: () => current().shortcuts,
    birthdays: () => current().birthdays,
    contacts: () => current().contacts,
    refresh,
    subscribe(cb) {
      subs.add(cb);
      if (subs.size === 1) start();
      return () => {
        subs.delete(cb);
        if (!subs.size) stop();
      };
    },
  };
}
