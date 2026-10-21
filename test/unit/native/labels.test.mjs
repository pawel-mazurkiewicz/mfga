import { test } from "node:test";
import assert from "node:assert/strict";
import { labelKey, bylineSegments, isWord, startsWithWord, isAdLabel, probeLabels, WORDS, CORE, ZB502, ZB502_KEYS } from "../../../src/fb/labels.js";

test("labelKey strips Facebook's invisible padding, bullets and case", () => {
  assert.equal(labelKey("A͏d͏"), "ad");
  assert.equal(labelKey("⁠Spon​sored‎"), "sponsored");
  assert.equal(labelKey("  Lubię to!  "), "lubię to!");
  assert.equal(labelKey("Ａｄ"), "ad", "NFKC folds full-width letters");
  assert.equal(labelKey("‪Sponsored‬"), "sponsored", "bidi embedding marks");
  assert.equal(labelKey(null), "");
});

test("bylineSegments splits on the 2010-style middle dot", () => {
  assert.deepEqual(bylineSegments("Ad · 🌐"), ["ad", "🌐"]);
  assert.deepEqual(bylineSegments("Sponsored · Paid for by Jane Doe"), ["sponsored", "paid for by jane doe"]);
  assert.deepEqual(bylineSegments(" · "), []);
});

test("isAdLabel matches whole segments only, in every known locale", () => {
  for (const label of ["Sponsored", "Ad", "A͏d͏ · ", "Sponsorowane", "Reklama", "Реклама", "Gesponsert", "赞助内容", "広告", "Paid partnership with Nike", "Post sponsorowany"]) {
    assert.ok(isAdLabel(label), label);
  }
  for (const label of ["Sponsored by my mom", "Ad hoc meeting", "Adam", "3 hours ago", "March 4 at 5:47 PM", "", "Learn More"]) {
    assert.equal(isAdLabel(label), false, label);
  }
});

test("isWord is exact: Follow is a suggestion marker, Following is not", () => {
  assert.ok(isWord("follow", "Follow"));
  assert.ok(isWord("follow", " Obserwuj "));
  assert.ok(isWord("follow", "Seguir"));
  assert.equal(isWord("follow", "Following"), false);
  assert.ok(isWord("join", "Dołącz"));
  assert.ok(isWord("join", "Join group"));
  assert.ok(isWord("addFriend", "Dodaj znajomego"));
  assert.ok(isWord("pymk", "Osoby, które możesz znać"));
  assert.ok(isWord("reels", "Rolki"));
  assert.ok(isWord("stories", "Relacje"));
  assert.equal(isWord("nonexistent", "Follow"), false);
});

test("startsWithWord matches phrase prefixes on word boundaries", () => {
  assert.ok(startsWithWord("suggestedHeaders", "Suggested for you"));
  assert.ok(startsWithWord("suggestedHeaders", "Because you viewed Garden World"));
  assert.ok(startsWithWord("suggestedHeaders", "Propozycje dla Ciebie"));
  assert.equal(startsWithWord("suggestedHeaders", "Suggested forum rules"), false);
  assert.equal(startsWithWord("suggestedHeaders", ""), false);
});

test("WORDS are normalised sets built from CORE and the zbluebugz dictionary", () => {
  for (const [concept, set] of Object.entries(WORDS)) {
    assert.ok(set instanceof Set && set.size > 0, concept);
    for (const w of set) assert.equal(w, labelKey(w), `${concept}: ${w}`);
  }
  assert.ok(WORDS.ad.has("sponsorisé"), "zbluebugz fr");
  assert.ok(WORDS.follow.has("takip et"), "zbluebugz tr");
  assert.ok(WORDS.join.has("uczestniczyć"), "zbluebugz NF_PARTICIPATE");
});

test("CORE has the same concepts in English and Polish", () => {
  assert.deepEqual(Object.keys(CORE.pl).sort(), Object.keys(CORE.en).sort());
  assert.ok(CORE.pl.like.includes("Lubię to!"));
  assert.ok(CORE.pl.postMenu.includes("Działania dla tego posta"));
});

test("the zbluebugz v5.02 dictionary is complete and frozen", () => {
  assert.equal(Object.keys(ZB502).length, 23);
  for (const [lang, row] of Object.entries(ZB502)) {
    assert.deepEqual(Object.keys(row), [...ZB502_KEYS], lang);
    for (const k of ZB502_KEYS) assert.equal(typeof row[k], "string", `${lang}.${k}`);
    assert.ok(Object.isFrozen(row));
  }
  assert.equal(ZB502.pl.SPONSORED, "Sponsorowane");
  assert.equal(ZB502.en.NF_FOLLOW, "Follow");
  assert.equal(ZB502["zh-Hant"].SPONSORED, "贊助");
  assert.ok(Object.isFrozen(ZB502));
});

test("probeLabels detects the UI locale from action labels", () => {
  const en = probeLabels({
    like: "Like",
    comment: "Leave a comment",
    share: "Share, send this to friends or post it on your profile.",
    menu: "Actions for this post by Khalid Al Ameri",
    hide: "Hide post by Khalid Al Ameri",
  });
  assert.deepEqual(en, { detected: "en", checked: 5, mismatches: [] });

  const pl = probeLabels({ like: "Lubię to!", comment: "Dodaj komentarz", share: "Wyślij do znajomych lub opublikuj w Twoim profilu.", menu: "Działania dla tego posta", hide: "ukryj post" });
  assert.deepEqual(pl, { detected: "pl", checked: 5, mismatches: [] });
});

test("probeLabels reports mismatching fields and never returns label text", () => {
  const mixed = probeLabels({ like: "Lubię to!", comment: "Dodaj komentarz", share: "Udostępnij teraz", menu: "Actions for this post", hide: "ukryj post Jan Kowalski" });
  assert.equal(mixed.detected, "pl");
  assert.deepEqual(mixed.mismatches.sort(), ["menu", "share"]);
  assert.ok(!JSON.stringify(mixed).includes("Kowalski"));

  const unknown = probeLabels({ like: "Gefällt mir", menu: "Aktionen für diesen Beitrag" });
  assert.deepEqual(unknown, { detected: null, checked: 2, mismatches: ["like", "menu"] });
  assert.deepEqual(probeLabels({}), { detected: null, checked: 0, mismatches: [] });
  assert.deepEqual(probeLabels(null), { detected: null, checked: 0, mismatches: [] });
});
