import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCount,
  jewelKind,
  countsFromLabels,
  parseBirthdays,
  parseContactLabel,
  classifyShortcut,
  nameAndCount,
  shortcutsFromRows,
  mergeRail,
  railToCache,
} from "../../../src/fb/chrome-reader.js";

test("parseCount reads the 2026 EN and PL banner labels", () => {
  assert.equal(parseCount("Notifications, 5 unread"), 5);
  assert.equal(parseCount("Notifications, 24 unread"), 24);
  assert.equal(parseCount("Messenger, 1 unread"), 1);
  assert.equal(parseCount("Powiadomienia, 7 nieprzeczytanych"), 7);
  assert.equal(parseCount("Messenger, 3 nieprzeczytanych"), 3);
  assert.equal(parseCount("Wiadomości, nieprzeczytane: 9"), 9);
  assert.equal(parseCount("Friends, 3 notifications"), 3);
  assert.equal(parseCount("Znajomi, 4 powiadomienia"), 4);
  assert.equal(parseCount("Home, 1 notification"), 1);
  assert.equal(parseCount("Friends, 9+ notifications"), 9);
  assert.equal(parseCount("Notifications"), 0);
  assert.equal(parseCount(""), 0);
  assert.equal(parseCount(null), 0);
});

test("jewelKind recognises both languages and both mega-menu labels", () => {
  assert.equal(jewelKind("Notifications, 5 unread"), "notifications");
  assert.equal(jewelKind("Powiadomienia, 5 nieprzeczytanych"), "notifications");
  assert.equal(jewelKind("Messenger"), "messages");
  assert.equal(jewelKind("Wiadomości, nieprzeczytane: 2"), "messages");
  assert.equal(jewelKind("Your profile"), "profile");
  assert.equal(jewelKind("Twój profil"), "profile");
  assert.equal(jewelKind("Facebook menu"), "menu");
  assert.equal(jewelKind("Menu Facebooka"), "menu");
  assert.equal(jewelKind("Menu"), "menu");
  assert.equal(jewelKind("Benachrichtigungen, 5 ungelesen"), null);
});

test("countsFromLabels: by label first, the first match wins", () => {
  assert.deepEqual(countsFromLabels(["Facebook menu", "Messenger, 1 unread", "Notifications, 5 unread", "Your profile"]), { notifications: 5, messages: 1 });
  assert.deepEqual(countsFromLabels(["Menu", "Messenger", "Notifications", "Your profile"]), { notifications: 0, messages: 0 });
  assert.deepEqual(countsFromLabels(["Menu Facebooka", "Wiadomości, nieprzeczytane: 2", "Powiadomienia, 7 nieprzeczytanych", "Twój profil"]), { notifications: 7, messages: 2 });
  assert.deepEqual(countsFromLabels(["Your profile"]), { notifications: null, messages: null });
});

test("countsFromLabels falls back to position for unknown languages", () => {
  assert.deepEqual(countsFromLabels(["Menü", "Messenger-Chats, 2 ungelesen", "Benachrichtigungen, 4 ungelesen", "Dein Profil"]), { notifications: 4, messages: 2 });
  assert.deepEqual(countsFromLabels(["Menü", "Benachrichtigungen, 4 ungelesen", "Dein Profil"]), { notifications: 4, messages: null });
  assert.deepEqual(countsFromLabels(["a", "b"]), { notifications: null, messages: null });
});

test("parseBirthdays understands every observed sentence shape", () => {
  assert.deepEqual(parseBirthdays("Dasha Trofimova's birthday is today."), { names: ["Dasha Trofimova"], others: 0 });
  assert.deepEqual(parseBirthdays("Dasha Trofimova’s birthday is today."), { names: ["Dasha Trofimova"], others: 0 });
  assert.deepEqual(parseBirthdays("Chris Jones' birthday is today."), { names: ["Chris Jones"], others: 0 });
  assert.deepEqual(parseBirthdays("Ana Silva has a birthday today."), { names: ["Ana Silva"], others: 0 });
  assert.deepEqual(parseBirthdays("Ana Silva and Bo Chen have birthdays today."), { names: ["Ana Silva", "Bo Chen"], others: 0 });
  assert.deepEqual(parseBirthdays("Ana Silva and 3 others have birthdays today."), { names: ["Ana Silva"], others: 3 });
  assert.deepEqual(parseBirthdays("Ana Silva and 1 other has a birthday today."), { names: ["Ana Silva"], others: 1 });
  assert.deepEqual(parseBirthdays("Ana Silva and 1 other have birthdays today."), { names: ["Ana Silva"], others: 1 });
  assert.deepEqual(parseBirthdays("Kasia Nowak ma dziś urodziny 🎉"), { names: ["Kasia Nowak"], others: 0 });
  assert.deepEqual(parseBirthdays("Kasia Nowak i Jan Kowalski mają dziś urodziny"), { names: ["Kasia Nowak", "Jan Kowalski"], others: 0 });
  assert.deepEqual(parseBirthdays("Kasia Nowak i 2 inne osoby mają dziś urodziny"), { names: ["Kasia Nowak"], others: 2 });
  assert.equal(parseBirthdays("Today is a good day"), null);
  assert.equal(parseBirthdays(""), null);
});

test("parseContactLabel strips the presence suffix", () => {
  assert.deepEqual(parseContactLabel("Tom Hellier, Active"), { name: "Tom Hellier", online: true });
  assert.deepEqual(parseContactLabel("Matt Gorle"), { name: "Matt Gorle", online: false });
  assert.deepEqual(parseContactLabel("Jan Kowalski, Aktywny teraz"), { name: "Jan Kowalski", online: true });
  assert.deepEqual(parseContactLabel("Anna Nowak, Aktywna"), { name: "Anna Nowak", online: true });
  assert.deepEqual(parseContactLabel("  Ágnes   Fülöp,  Active "), { name: "Ágnes Fülöp", online: true });
  assert.deepEqual(parseContactLabel("Smith, John"), { name: "Smith, John", online: false });
});

test("classifyShortcut separates groups, profiles, apps and outside links", () => {
  assert.deepEqual(classifyShortcut("https://www.facebook.com/groups/615000000000042/"), { kind: "group", url: "https://www.facebook.com/groups/615000000000042/", id: "615000000000042" });
  assert.equal(classifyShortcut("https://www.facebook.com/groups/gamingclub/?ref=bookmarks").url, "https://www.facebook.com/groups/gamingclub/");
  assert.equal(classifyShortcut("https://web.facebook.com/groups/gamingclub/").kind, "group");
  assert.equal(classifyShortcut("https://www.facebook.com/groups/?ref=bookmarks").kind, "app");
  assert.equal(classifyShortcut("https://www.facebook.com/groups/feed/").kind, "app");
  assert.equal(classifyShortcut("https://www.facebook.com/groups/1/posts/2/").kind, "app");
  assert.deepEqual(classifyShortcut("https://www.facebook.com/profile.php?id=100001&ref=x"), { kind: "profile", url: "https://www.facebook.com/profile.php?id=100001", id: "100001" });
  assert.equal(classifyShortcut("https://www.facebook.com/examplebakery").url, "https://www.facebook.com/examplebakery");
  for (const app of ["/friends/?ref=bookmarks", "/onthisday/", "/saved/", "/marketplace/?ref=bookmark", "/?filter=all&sk=h_chr", "/events?ref=bookmarks", "/messages/t/", "/gaming/play/", "/bookmarks/", "/profile.php"]) {
    assert.equal(classifyShortcut(`https://www.facebook.com${app}`).kind, "app", app);
  }
  assert.equal(classifyShortcut("https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.meta.ai%2F").kind, "external");
  assert.equal(classifyShortcut("https://www.meta.com/ai-glasses/").kind, "external");
  assert.equal(classifyShortcut("http://[bad").kind, "external");
});

test("nameAndCount picks the name and the badge number out of a row", () => {
  assert.deepEqual(nameAndCount(["Gaming Club", "12"]), { name: "Gaming Club", count: 12 });
  assert.deepEqual(nameAndCount(["7", "7 new posts", "Club"]), { name: "Club", count: 7 });
  assert.deepEqual(nameAndCount(["Kraków Cyclists", "9+"]), { name: "Kraków Cyclists", count: 9 });
  assert.deepEqual(nameAndCount(["42"]), { name: "42", count: 0 });
  assert.deepEqual(nameAndCount(["  Pat   Example "]), { name: "Pat Example", count: 0 });
  assert.deepEqual(nameAndCount([]), { name: "", count: 0 });
});

const ROWS = [
  { href: "https://www.facebook.com/profile.php?id=100001234567890", name: "Pat Example", image: "https://x/me.png", count: 0 },
  { href: "https://l.facebook.com/l.php?u=meta.ai", name: "Meta AI", image: null, count: 0 },
  { href: "https://www.facebook.com/friends/?ref=bookmarks", name: "Friends", image: null, count: 2 },
  { href: "https://www.facebook.com/groups/?ref=bookmarks", name: "Groups", image: null, count: 0 },
  { href: "https://www.facebook.com/groups/615000000000042/", name: "Kraków Cyclists", image: "https://x/g1.png", count: 12 },
  { href: "https://www.facebook.com/groups/gamingclub/", name: "Gaming Club", image: "https://x/g2.png", count: 0 },
  { href: "https://www.facebook.com/groups/gamingclub/?ref=dup", name: "Gaming Club", image: null, count: 0 },
  { href: "https://www.facebook.com/examplebakery", name: "Example Bakery", image: "https://x/p.png", count: 0 },
];

test("shortcutsFromRows: the first row is the viewer, then groups and Pages", () => {
  const s = shortcutsFromRows(ROWS);
  assert.deepEqual(s.me, { name: "Pat Example", url: "https://www.facebook.com/profile.php?id=100001234567890", image: "https://x/me.png", count: 0 });
  assert.deepEqual(s.groups.map((g) => [g.name, g.count]), [["Kraków Cyclists", 12], ["Gaming Club", 0]]);
  assert.deepEqual(s.pages.map((p) => p.url), ["https://www.facebook.com/examplebakery"]);
  assert.equal(s.friendsCount, 2);
});

test("shortcutsFromRows finds the viewer by user id when the first row is something else", () => {
  const rows = [ROWS[1], ROWS[7], ROWS[0]];
  const s = shortcutsFromRows(rows, { userId: "100001234567890" });
  assert.equal(s.me.name, "Pat Example");
  assert.deepEqual(s.pages.map((p) => p.name), ["Example Bakery"]);
  assert.equal(shortcutsFromRows([ROWS[2], ROWS[4]]).me, null);
});

const DAY = Date.UTC(2026, 9, 21, 12);
const cached = {
  v: 1,
  savedAt: DAY - 60 * 60 * 1000,
  me: { name: "Pat Example", url: "https://www.facebook.com/profile.php?id=1", image: null, count: 0 },
  groups: [{ name: "Kraków Cyclists", url: "https://www.facebook.com/groups/1/", image: null, count: 3 }],
  pages: [],
  birthdays: [{ text: "Ana's birthday is today.", names: ["Ana"], others: 0, url: "https://www.facebook.com/events/birthdays/" }],
  contacts: [{ name: "Tom", online: true, url: "https://www.facebook.com/messages/t/2/", avatar: null }],
};

test("mergeRail prefers live data and falls back to the cache", () => {
  const live = { me: null, groups: undefined, pages: undefined, birthdays: undefined, contacts: undefined };
  const m = mergeRail(live, cached, DAY);
  assert.equal(m.me.name, "Pat Example");
  assert.equal(m.groups.length, 1);
  assert.equal(m.birthdays.length, 1, "same day: cached birthdays are still true");
  assert.deepEqual(m.contacts.map((c) => c.online), [false], "an hour-old presence is stale");
  const fresh = mergeRail(live, { ...cached, savedAt: DAY - 60 * 1000 }, DAY);
  assert.deepEqual(fresh.contacts.map((c) => c.online), [true]);
  const nextDay = mergeRail(live, cached, DAY + 24 * 60 * 60 * 1000);
  assert.deepEqual(nextDay.birthdays, [], "yesterday's birthdays are dropped");
  const liveGroups = mergeRail({ ...live, groups: [] }, cached, DAY);
  assert.deepEqual(liveGroups.groups, [], "a live empty list wins over the cache");
});

test("mergeRail without any cache, or with an unknown cache version", () => {
  const live = { me: null, groups: undefined, pages: undefined, birthdays: undefined, contacts: undefined };
  assert.deepEqual(mergeRail(live, null, DAY), { me: null, groups: [], pages: [], birthdays: [], contacts: null });
  assert.deepEqual(mergeRail(live, { ...cached, v: 99 }, DAY).groups, []);
});

test("railToCache keeps what was not read live this time", () => {
  const live = { me: null, groups: undefined, pages: undefined, birthdays: [], contacts: [{ name: "Ana", online: true, url: "u", avatar: null }] };
  const next = railToCache(live, cached, DAY);
  assert.equal(next.v, 1);
  assert.equal(next.savedAt, DAY);
  assert.equal(next.me.name, "Pat Example");
  assert.equal(next.groups.length, 1);
  assert.deepEqual(next.birthdays, []);
  assert.deepEqual(next.contacts.map((c) => c.name), ["Ana"]);
  assert.deepEqual(railToCache(live, null, DAY).groups, []);
});
