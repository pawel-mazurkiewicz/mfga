// DOM-free view models for the shell: what the 2010 left nav, right column and chat tab show for the
// data read from Facebook's chrome. Labels are resolved here so the renderers only build nodes.
import { t } from "../../shared/i18n.js";
import "./strings.js";

const FB = "https://www.facebook.com";
const MAX_CHAT = 8;

/** The viewer's photos for a profile URL (profile.php?id=… gets sk=photos, vanity URLs get /photos). */
export function photosUrl(profileUrl) {
  if (!profileUrl) return `${FB}/me/`;
  let u;
  try {
    u = new URL(profileUrl, FB);
  } catch {
    return `${FB}/me/`;
  }
  if (u.pathname === "/profile.php" && u.searchParams.get("id")) return `${FB}/profile.php?id=${u.searchParams.get("id")}&sk=photos`;
  const vanity = u.pathname.split("/").filter(Boolean)[0];
  return vanity && vanity !== "me" ? `${FB}/${vanity}/photos` : `${FB}/me/`;
}

/** Red jewel badge text: null when nothing is unread. */
export function badgeText(n) {
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 99 ? "99+" : String(n);
}

/** ctx.stats() → {ads, suggested}: non-negative integers, whatever shape the caller had. */
export function normalizeStats(stats) {
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);
  return { ads: num(stats?.ads), suggested: num(stats?.suggested) };
}

function navItem(key, icon, href, { count = 0, selected = false, arrow = false } = {}) {
  return { key, icon, label: t(`nav.${key}`), href, count: count > 0 ? count : 0, selected, arrow };
}

export function leftNavModel({ route, identity, counts, shortcuts, contacts }) {
  const mode = route?.mode;
  const groups = shortcuts?.groups || [];
  const pages = shortcuts?.pages || [];
  const unreadGroups = groups.filter((g) => g.count > 0).length;
  const toRow = (s) => ({ label: s.name, href: s.url, image: s.image, count: s.count > 0 ? s.count : 0 });
  return {
    me: { name: identity?.name || null, url: identity?.url || `${FB}/me/`, avatar: identity?.avatar || null },
    primary: [
      navItem("newsFeed", "nav_news_feed", `${FB}/`, { selected: mode === "home" }),
      navItem("messages", "nav_messages", `${FB}/messages/`, { count: counts?.messages }),
      navItem("events", "nav_events", `${FB}/events/`),
      navItem("photos", "nav_photos", photosUrl(identity?.url)),
      navItem("friends", "nav_friends", `${FB}/friends/`, { count: counts?.friendRequests }),
    ],
    apps: [
      navItem("apps", "nav_apps", `${FB}/bookmarks/`),
      navItem("games", "nav_games_2010", `${FB}/gaming/play/`),
      navItem("pages", "nav_pages", `${FB}/pages/?category=your_pages`, { arrow: pages.length > 0 }),
      navItem("groups", "nav_groups", `${FB}/groups/feed/`, { count: unreadGroups, selected: mode === "groups-feed", arrow: groups.length > 0 }),
    ],
    more: [
      navItem("saved", "nav_saved", `${FB}/saved/`),
      navItem("video", "nav_video", `${FB}/watch/`),
      navItem("marketplace", "nav_marketplace", `${FB}/marketplace/`),
    ],
    groups: groups.map(toRow),
    pages: pages.map(toRow),
    chat: (contacts || []).filter((c) => c.online).slice(0, MAX_CHAT).map((c) => ({ label: c.name, href: c.url })),
  };
}

/** One Events row per birthday name; unparsed sentences are shown as Facebook wrote them. */
function birthdayRows(birthdays) {
  const rows = [];
  for (const b of birthdays || []) {
    if (!b.names?.length) {
      if (b.text) rows.push({ text: b.text, href: b.url });
      continue;
    }
    for (const name of b.names) rows.push({ name, href: b.url });
    if (b.others > 0) rows.push({ text: t("rc.andOthers", { n: b.others }), href: b.url });
  }
  return rows;
}

export function rightColModel({ counts, birthdays, stats }) {
  const requests = counts?.friendRequests > 0
    ? [{ icon: "rc_friend_request", count: counts.friendRequests, label: t("rc.friendRequests", { n: counts.friendRequests }), href: `${FB}/friends/requests/` }]
    : [];
  const { ads, suggested } = normalizeStats(stats);
  return {
    requests,
    events: birthdayRows(birthdays),
    mfga: [
      { icon: "nav_ads", count: ads, label: t("rc.adsRemoved", { n: ads }) },
      { icon: "rc_friend_suggestion", count: suggested, label: t("rc.suggestedRemoved", { n: suggested }) },
    ],
  };
}

/** The chat tab's icon and label: "Chat (N)" with N friends online, else "Chat (Offline)". */
export function chatTabModel(contacts) {
  const n = (contacts || []).filter((c) => c.online).length;
  return n > 0 ? { icon: "chat_online", label: t("chat.online", { n }) } : { icon: "chat_offline", label: t("chat.offline") };
}

/** Splits a template such as "Use our {link} to …" around one placeholder: [before, after]. */
export function splitTemplate(template, name) {
  const i = template.indexOf(`{${name}}`);
  return i < 0 ? [template, ""] : [template.slice(0, i), template.slice(i + name.length + 2)];
}
