import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setLocale } from "../../../src/shared/i18n.js";
import { photosUrl, badgeText, normalizeStats, leftNavModel, rightColModel, chatTabModel, splitTemplate } from "../../../src/ui/shell/model.js";
import { GRID, pageLeft, mainSlot } from "../../../src/ui/shell/grid.js";

afterEach(() => setLocale("en"));

const identity = { id: "1", name: "Pat Example", url: "https://www.facebook.com/profile.php?id=1", avatar: "https://x/a.png" };
const shortcuts = {
  groups: [
    { name: "Kraków Cyclists", url: "https://www.facebook.com/groups/1/", image: "https://x/g.png", count: 12 },
    { name: "Gaming Club", url: "https://www.facebook.com/groups/gamingclub/", image: null, count: 0 },
  ],
  pages: [{ name: "Example Bakery", url: "https://www.facebook.com/examplebakery", image: null, count: 0 }],
};
const contacts = [
  { name: "Tom", online: true, url: "https://www.facebook.com/messages/t/2/" },
  { name: "Ana", online: false, url: "https://www.facebook.com/messages/t/3/" },
];

test("photosUrl for numeric and vanity profiles", () => {
  assert.equal(photosUrl("https://www.facebook.com/profile.php?id=42&ref=x"), "https://www.facebook.com/profile.php?id=42&sk=photos");
  assert.equal(photosUrl("https://www.facebook.com/pat.example"), "https://www.facebook.com/pat.example/photos");
  assert.equal(photosUrl("https://www.facebook.com/pat.example/"), "https://www.facebook.com/pat.example/photos");
  assert.equal(photosUrl("https://www.facebook.com/me/"), "https://www.facebook.com/me/");
  assert.equal(photosUrl(undefined), "https://www.facebook.com/me/");
  assert.equal(photosUrl("http://[bad"), "https://www.facebook.com/me/");
});

test("badgeText hides zero/unknown and caps at 99+", () => {
  assert.equal(badgeText(0), null);
  assert.equal(badgeText(null), null);
  assert.equal(badgeText(NaN), null);
  assert.equal(badgeText(5), "5");
  assert.equal(badgeText(99), "99");
  assert.equal(badgeText(100), "99+");
});

test("normalizeStats tolerates any shape", () => {
  assert.deepEqual(normalizeStats({ ads: 3, suggested: "4", other: 9 }), { ads: 3, suggested: 4 });
  assert.deepEqual(normalizeStats({ ads: -1, suggested: 2.7 }), { ads: 0, suggested: 2 });
  assert.deepEqual(normalizeStats(undefined), { ads: 0, suggested: 0 });
  assert.deepEqual(normalizeStats({ ads: "x" }), { ads: 0, suggested: 0 });
});

test("leftNavModel on home: News Feed selected, gray counts, shortcuts, online friends", () => {
  const m = leftNavModel({ route: { mode: "home" }, identity, counts: { notifications: 5, messages: 1, friendRequests: 3 }, shortcuts, contacts });
  assert.deepEqual(m.me, { name: "Pat Example", url: identity.url, avatar: identity.avatar });
  assert.deepEqual(m.primary.map((i) => i.label), ["News Feed", "Messages", "Events", "Photos", "Friends"]);
  assert.deepEqual(m.primary.map((i) => i.icon), ["nav_news_feed", "nav_messages", "nav_events", "nav_photos", "nav_friends"]);
  assert.equal(m.primary[0].selected, true);
  assert.equal(m.primary[1].count, 1);
  assert.equal(m.primary[4].count, 3);
  assert.equal(m.primary[3].href, "https://www.facebook.com/profile.php?id=1&sk=photos");
  assert.deepEqual(m.apps.map((i) => i.icon), ["nav_apps", "nav_games_2010", "nav_pages", "nav_groups"]);
  const groups = m.apps.find((i) => i.key === "groups");
  assert.deepEqual([groups.count, groups.selected, groups.arrow], [1, false, true]);
  assert.deepEqual(m.groups.map((g) => [g.label, g.count]), [["Kraków Cyclists", 12], ["Gaming Club", 0]]);
  assert.deepEqual(m.pages.map((p) => p.label), ["Example Bakery"]);
  assert.deepEqual(m.chat, [{ label: "Tom", href: "https://www.facebook.com/messages/t/2/" }]);
});

test("leftNavModel on the groups feed selects Groups; unknown data degrades quietly", () => {
  const m = leftNavModel({ route: { mode: "groups-feed" }, identity: null, counts: null, shortcuts: null, contacts: null });
  assert.equal(m.primary[0].selected, false);
  assert.equal(m.apps.find((i) => i.key === "groups").selected, true);
  assert.equal(m.me.url, "https://www.facebook.com/me/");
  assert.equal(m.me.name, null);
  assert.deepEqual([m.groups, m.pages, m.chat], [[], [], []]);
  assert.ok(m.primary.every((i) => i.count === 0));
  assert.equal(m.apps.find((i) => i.key === "pages").arrow, false);
});

test("leftNavModel: News Feed's filters stay closed on Home and open on a filter route, as 2010's side nav", () => {
  const home = leftNavModel({ route: { mode: "home", filter: null }, identity, counts: null, shortcuts, contacts });
  assert.deepEqual(home.feeds.map((f) => [f.key, f.href, f.selected]), [
    ["feed_friends", "https://www.facebook.com/?filter=friends&sk=h_chr", false],
    ["feed_groups", "https://www.facebook.com/?filter=groups&sk=h_chr", false],
    ["feed_pages", "https://www.facebook.com/?filter=pages&sk=h_chr", false],
    ["feed_favorites", "https://www.facebook.com/?filter=favorites&sk=h_chr", false],
  ]);
  assert.equal(home.feedsOpen, false, "the 2010 Home shows News Feed alone");
  assert.equal(home.primary[0].selected, true);

  const friends = leftNavModel({ route: { mode: "home", filter: "friends" }, identity, counts: null, shortcuts, contacts });
  assert.equal(friends.feedsOpen, true);
  assert.equal(friends.primary[0].selected, false);
  assert.deepEqual(friends.feeds.filter((f) => f.selected).map((f) => f.label), ["Friends"]);

  const page = leftNavModel({ route: { mode: "page", filter: null }, identity, counts: null, shortcuts, contacts });
  assert.deepEqual([page.feeds, page.feedsOpen], [[], false]);
});

test("leftNavModel in Polish uses 2010 wording", () => {
  setLocale("pl");
  const m = leftNavModel({ route: { mode: "home" }, identity, counts: null, shortcuts, contacts });
  assert.deepEqual(m.primary.map((i) => i.label), ["Aktualności", "Wiadomości", "Wydarzenia", "Zdjęcia", "Znajomi"]);
  assert.deepEqual(m.apps.map((i) => i.label), ["Aplikacje", "Gry", "Strony", "Grupy"]);
});

test("rightColModel: requests only when there are some, birthdays per name, MFGA counters", () => {
  const birthdays = [
    { text: "Ana and Bo have birthdays today.", names: ["Ana", "Bo"], others: 0, url: "https://www.facebook.com/events/birthdays/" },
    { text: "Cy and 2 others have birthdays today.", names: ["Cy"], others: 2, url: "https://www.facebook.com/events/birthdays/" },
    { text: "Something we cannot parse.", names: [], others: 0, url: "https://www.facebook.com/events/birthdays/" },
  ];
  const m = rightColModel({ counts: { friendRequests: 3 }, birthdays, stats: { ads: 1, suggested: 34 } });
  assert.deepEqual(m.requests, [{ icon: "rc_friend_request", count: 3, label: "friend requests", href: "https://www.facebook.com/friends/requests/" }]);
  assert.deepEqual(m.events.map((r) => r.name || r.text), ["Ana", "Bo", "Cy", "and 2 others", "Something we cannot parse."]);
  assert.deepEqual(m.mfga.map((r) => [r.count, r.label]), [[1, "ad removed"], [34, "suggested posts removed"]]);
  assert.deepEqual(rightColModel({ counts: { friendRequests: 0 }, birthdays: null, stats: null }).requests, []);
  assert.deepEqual(rightColModel({}).events, []);
});

test("rightColModel plurals in Polish", () => {
  setLocale("pl");
  const label = (n) => rightColModel({ counts: { friendRequests: n } }).requests[0].label;
  assert.equal(label(1), "zaproszenie do grona znajomych");
  assert.equal(label(3), "zaproszenia do grona znajomych");
  assert.equal(label(5), "zaproszeń do grona znajomych");
  assert.equal(label(22), "zaproszenia do grona znajomych");
  const ads = (n) => rightColModel({ stats: { ads: n } }).mfga[0].label;
  assert.deepEqual([ads(1), ads(2), ads(12)], ["reklama usunięta", "reklamy usunięte", "reklam usuniętych"]);
});

test("chatTabModel counts online friends", () => {
  assert.deepEqual(chatTabModel(contacts), { icon: "chat_online", label: "Chat (1)" });
  assert.deepEqual(chatTabModel([]), { icon: "chat_offline", label: "Chat (Offline)" });
  assert.deepEqual(chatTabModel(null), { icon: "chat_offline", label: "Chat (Offline)" });
  setLocale("pl");
  assert.equal(chatTabModel(contacts).label, "Czat (1)");
});

test("splitTemplate cuts around one placeholder", () => {
  assert.deepEqual(splitTemplate("Use our {link} to find friends.", "link"), ["Use our ", " to find friends."]);
  assert.deepEqual(splitTemplate("{name}'s birthday", "name"), ["", "'s birthday"]);
  assert.deepEqual(splitTemplate("Urodziny: {name}", "name"), ["Urodziny: ", ""]);
  assert.deepEqual(splitTemplate("no placeholder", "link"), ["no placeholder", ""]);
});

test("grid: page container and main slots", () => {
  assert.equal(pageLeft(1280), 150);
  assert.equal(pageLeft(981), 0.5);
  assert.equal(pageLeft(800), 0);
  assert.deepEqual(mainSlot("home", 1280), { left: 345, top: GRID.bar + GRID.top, width: 520 });
  assert.deepEqual(mainSlot("groups-feed", 1000), { left: 205, top: 61, width: 680 });
  assert.equal(mainSlot("page", 1280), null);
  assert.equal(GRID.content.x + GRID.content.w + 15, GRID.right.x, "15px gutter between centre and right column");
});
