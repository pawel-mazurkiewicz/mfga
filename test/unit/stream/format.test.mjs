import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { setLocale, t } from "../../../src/shared/i18n.js";
import {
  chronological,
  countNewer,
  enabledSources,
  feedbackState,
  fitBox,
  formatCount,
  formatDuration,
  fullDate,
  hiddenCounts,
  hiddenSentence,
  isReacted,
  likeSentence,
  mergeComments,
  passiveHeadline,
  photoGrid,
  titleTail,
  truncateSegments,
} from "../../../src/ui/stream/format.js";

const sentence = (parts) => parts.map((p) => (p.link ? `[${p.text}]` : p.text)).join("");

afterEach(() => setLocale("en"));

describe("likeSentence (en)", () => {
  test("nobody", () => assert.deepEqual(likeSentence(0, false), []));
  test("only the viewer", () => assert.equal(sentence(likeSentence(1, true)), "You like this."));
  test("viewer and one other", () => assert.equal(sentence(likeSentence(2, true)), "You and [1 other person] like this."));
  test("viewer and others", () => assert.equal(sentence(likeSentence(4, true)), "You and [3 others] like this."));
  test("one person", () => assert.equal(sentence(likeSentence(1, false)), "[1 person] likes this."));
  test("many people, grouped digits", () => assert.equal(sentence(likeSentence(1234, false)), "[1,234 people] like this."));
  test("liked with a stale zero count still says You", () => assert.equal(sentence(likeSentence(0, true)), "You like this."));
  test("garbage counts are zero", () => {
    assert.deepEqual(likeSentence(NaN, false), []);
    assert.deepEqual(likeSentence(-3, false), []);
    assert.deepEqual(likeSentence(undefined, false), []);
  });
});

describe("likeSentence (pl plurals)", () => {
  test("one / few / many forms with matching verbs", () => {
    setLocale("pl");
    assert.equal(sentence(likeSentence(1, true)), "Lubisz to.");
    assert.equal(sentence(likeSentence(2, true)), "Ty i [1 inna osoba] lubicie to.");
    assert.equal(sentence(likeSentence(4, true)), "Ty i [3 inne osoby] lubicie to.");
    assert.equal(sentence(likeSentence(6, true)), "Ty i [5 innych osób] lubicie to.");
    assert.equal(sentence(likeSentence(1, false)), "[1 osoba] lubi to.");
    assert.equal(sentence(likeSentence(3, false)), "[3 osoby] lubią to.");
    assert.equal(sentence(likeSentence(5, false)), "[5 osób] lubi to.");
    assert.equal(sentence(likeSentence(12, false)), "[12 osób] lubi to.");
    assert.equal(sentence(likeSentence(22, false)), "[22 osoby] lubią to.");
    assert.equal(sentence(likeSentence(25, false)), "[25 osób] lubi to.");
  });
});

describe("comment and status strings", () => {
  test("view all comments (en)", () => {
    assert.equal(t("ufi.viewAll", { n: 1 }), "View 1 comment");
    assert.equal(t("ufi.viewAll", { n: 4 }), "View all 4 comments");
  });
  test("view all comments (pl)", () => {
    setLocale("pl");
    assert.equal(t("ufi.viewAll", { n: 4 }), "Wyświetl wszystkie 4 komentarze");
    assert.equal(t("ufi.viewAll", { n: 5 }), "Wyświetl wszystkie 5 komentarzy");
    assert.equal(t("ufi.viewAll", { n: 23 }), "Wyświetl wszystkie 23 komentarze");
  });
  test("2010 Polish action wording", () => {
    setLocale("pl");
    assert.equal(t("ufi.like"), "Lubię to!");
    assert.equal(t("story.comment"), "Komentarz");
    assert.equal(t("ufi.write"), "Napisz komentarz...");
    assert.equal(t("feed.older"), "Starsze posty");
    assert.equal(t("feed.title"), "Aktualności");
    assert.equal(t("feed.top"), "Najciekawsze");
    assert.equal(t("feed.recent"), "Najnowsze");
  });
});

describe("formatCount", () => {
  test("en groups thousands", () => assert.equal(formatCount(1234567), "1,234,567"));
  test("pl groups from 10 000 with a no-break space", () => {
    setLocale("pl");
    assert.equal(formatCount(1234), "1234");
    assert.equal(formatCount(12345).replace(/\s/g, " "), "12 345");
  });
  test("rounds and clamps", () => {
    assert.equal(formatCount(2.6), "3");
    assert.equal(formatCount(-4), "0");
    assert.equal(formatCount("7"), "0");
  });
});

describe("reactions", () => {
  test("isReacted", () => {
    assert.equal(isReacted(null), false);
    assert.equal(isReacted(undefined), false);
    assert.equal(isReacted("0"), false);
    assert.equal(isReacted(0), false);
    assert.equal(isReacted(""), false);
    assert.equal(isReacted("1635855486666999"), true);
    assert.equal(isReacted({ id: "1678524932434102" }), true);
  });
  test("feedbackState defaults and viewer like floor", () => {
    assert.deepEqual(feedbackState(undefined), { liked: false, count: 0, comments: 0, canComment: true });
    assert.deepEqual(feedbackState({ reactions: 0, viewerReaction: "1635855486666999", comments: 3, canComment: false }), {
      liked: true,
      count: 1,
      comments: 3,
      canComment: false,
    });
    assert.equal(feedbackState({ reactions: "12" }).count, 0);
  });
});

describe("hidden status line", () => {
  test("explicit counts", () => assert.deepEqual(hiddenCounts({ ads: 3, suggested: 5 }), { ads: 3, suggested: 5 }));
  test("classifier reason map", () => {
    const stats = { "sponsored-data": 2, "sponsored-label": 1, "category:SPONSORED": 1, recommended: 4, "follow-suggestion": 2, "unit:PaginatedPeopleYouMayKnowFeedUnit": 1, keep: 40, "no-node": 3, ai: 1 };
    assert.deepEqual(hiddenCounts(stats), { ads: 4, suggested: 7 });
    assert.deepEqual(hiddenCounts({ dropped: stats }), { ads: 4, suggested: 7 });
  });
  test("merge.stats() shape: reasons under `hidden`, counters ignored", () => {
    const stats = { emitted: 30, duplicates: 4, keyword: 2, hidden: { keyword: 2, "sponsored-data": 3, recommended: 1, "join-suggestion": 1, "category:FB_SHORTS": 1, "no-node": 2, unparsed: 1 }, sources: { friends: { fetched: 12 } } };
    assert.deepEqual(hiddenCounts(stats), { ads: 3, suggested: 3 });
  });
  test("only drop reasons count: unknown keys are neither ads nor suggestions", () => {
    assert.deepEqual(hiddenCounts({ unparsed: 5, unknown: 1, fetched: 9, "unit:StoriesTrayFeedUnit": 1 }), { ads: 0, suggested: 1 });
  });
  test("missing or odd input", () => {
    assert.deepEqual(hiddenCounts([3, 4]), { ads: 0, suggested: 0 });
    assert.deepEqual(hiddenCounts(null), { ads: 0, suggested: 0 });
    assert.deepEqual(hiddenCounts({ ads: "x", suggested: -1 }), { ads: 0, suggested: 0 });
  });
  test("sentences", () => {
    assert.equal(hiddenSentence({ ads: 0, suggested: 0 }), "");
    assert.equal(hiddenSentence({ ads: 3, suggested: 5 }), "3 ads and 5 suggested posts were hidden.");
    assert.equal(hiddenSentence({ ads: 1, suggested: 1 }), "1 ad and 1 suggested post were hidden.");
    assert.equal(hiddenSentence({ ads: 0, suggested: 2 }), "0 ads and 2 suggested posts were hidden.");
    setLocale("pl");
    assert.equal(hiddenSentence({ ads: 1, suggested: 1 }), "Ukryto 1 reklamę i 1 sugerowany post.");
    assert.equal(hiddenSentence({ ads: 3, suggested: 5 }), "Ukryto 3 reklamy i 5 sugerowanych postów.");
  });
});

describe("media helpers", () => {
  test("formatDuration", () => {
    assert.equal(formatDuration(151), "2:31");
    assert.equal(formatDuration(5), "0:05");
    assert.equal(formatDuration(3723), "1:02:03");
    assert.equal(formatDuration(0), null);
    assert.equal(formatDuration(undefined), null);
  });
  test("fitBox keeps the aspect ratio and never upscales", () => {
    assert.deepEqual(fitBox(1920, 1080, 320, 240), { width: 320, height: 180 });
    assert.deepEqual(fitBox(1080, 1920, 320, 240), { width: 135, height: 240 });
    assert.deepEqual(fitBox(100, 80, 320, 240), { width: 100, height: 80 });
    assert.deepEqual(fitBox(null, 0, 320, 240), { width: 320, height: 240 });
  });
  test("photoGrid shows at most four and counts the rest", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ uri: `https://x/${i}.jpg` }));
    assert.deepEqual(photoGrid({ items, total: 12 }).more, 8);
    assert.equal(photoGrid({ items, total: 12 }).shown.length, 4);
    assert.deepEqual(photoGrid({ items: items.slice(0, 2) }).more, 0);
    assert.equal(photoGrid({ items: [{ uri: null }, { uri: "https://x/a.jpg" }] }).shown.length, 1);
    assert.deepEqual(photoGrid(null), { shown: [], more: 0 });
  });
});

describe("comments", () => {
  test("chronological is stable and puts timeless first", () => {
    const list = [{ id: "b", time: 20 }, { id: "a", time: 10 }, { id: "x" }, { id: "c", time: 20 }];
    assert.deepEqual(chronological(list).map((c) => c.id), ["x", "a", "b", "c"]);
  });
  test("mergeComments skips duplicates", () => {
    const merged = mergeComments([{ id: "1" }, { id: "2" }], [{ id: "2" }, { id: "3" }, null, { text: "no id" }]);
    assert.deepEqual(merged.map((c) => c.id), ["1", "2", "3", undefined]);
  });
});

describe("truncateSegments", () => {
  test("short text is untouched", () => {
    const segs = [{ text: "hello" }];
    assert.deepEqual(truncateSegments(segs), { visible: segs, truncated: false });
  });
  test("cuts at a word boundary before the limit", () => {
    const words = "lorem ipsum dolor sit amet ".repeat(30);
    const { visible, truncated } = truncateSegments([{ text: words }], { keep: 50, max: 60 });
    assert.equal(truncated, true);
    assert.equal(visible.length, 1);
    assert.ok(visible[0].text.length <= 50);
    assert.ok(words.startsWith(visible[0].text));
    assert.ok(!/\s$/.test(visible[0].text));
    assert.ok(words[visible[0].text.length] === " ");
  });
  test("never cuts inside a link", () => {
    const segs = [{ text: "a".repeat(40) + " " }, { text: "https://example.com/long", url: "https://example.com/long", kind: "link" }, { text: " tail".repeat(40) }];
    const { visible } = truncateSegments(segs, { keep: 50, max: 60 });
    assert.equal(visible.length, 1);
  });
});

describe("passiveHeadline", () => {
  test("photo, video, link, event, shared", () => {
    assert.equal(passiveHeadline({ attachments: [{ kind: "photo", items: [{ uri: "u" }], total: 1 }] }), "added a new photo.");
    assert.equal(passiveHeadline({ attachments: [{ kind: "photo", items: [{ uri: "u" }, { uri: "v" }], total: 7 }] }), "added 7 new photos.");
    assert.equal(passiveHeadline({ attachments: [{ kind: "video" }] }), "added a new video.");
    assert.equal(passiveHeadline({ attachments: [{ kind: "link" }] }), "shared a link.");
    assert.equal(passiveHeadline({ attachments: [{ kind: "event" }] }), "shared an event.");
    assert.equal(passiveHeadline({ shared: { actors: [{ name: "Amy Winstead" }] } }), "shared Amy Winstead's post.");
    assert.equal(passiveHeadline({ shared: { actors: [] } }), "shared a post.");
  });
  test("stories with their own text or nothing to describe", () => {
    assert.equal(passiveHeadline({ text: "hi", attachments: [{ kind: "photo", items: [{ uri: "u" }] }] }), null);
    assert.equal(passiveHeadline({ title: "Title", attachments: [{ kind: "link" }] }), null);
    assert.equal(passiveHeadline({ attachments: [{ kind: "unavailable" }] }), null);
    assert.equal(passiveHeadline(null), null);
  });
  test("polish", () => {
    setLocale("pl");
    assert.equal(passiveHeadline({ attachments: [{ kind: "photo", items: [{ uri: "u" }], total: 3 }] }), "dodaje 3 nowe zdjęcia.");
    assert.equal(passiveHeadline({ attachments: [{ kind: "photo", items: [{ uri: "u" }], total: 5 }] }), "dodaje 5 nowych zdjęć.");
  });
});

describe("titleTail (Facebook headline titles)", () => {
  const carol = [{ name: "Carol Nowak" }];
  test("a headline that starts with the actor's name keeps only what follows", () => {
    assert.equal(titleTail({ actors: carol, title: "Carol Nowak added 23 new photos to the album Wedding." }), " added 23 new photos to the album Wedding.");
    assert.equal(titleTail({ actors: carol, title: "Carol Nowak's birthday party" }), "'s birthday party");
    assert.equal(titleTail({ actors: carol, title: "  Carol Nowak  " }), "");
  });
  test("other titles are not headlines", () => {
    assert.equal(titleTail({ actors: carol, title: "Saturday walk: 18 km in the Tatras" }), null);
    assert.equal(titleTail({ actors: [{ name: "Ann" }], title: "Annual meeting notes" }), null, "a name is a whole word");
    assert.equal(titleTail({ actors: [{ name: "Zoë" }], title: "Zoëlle's rules" }), null);
    assert.equal(titleTail({ actors: [], title: "Carol Nowak added a photo." }), null);
    assert.equal(titleTail({ actors: carol, title: null }), null);
    assert.equal(titleTail(null), null);
  });
});

describe("feed helpers", () => {
  test("enabledSources", () => {
    assert.deepEqual(enabledSources({ sources: { friends: true, groups: false, pages: true, favorites: true } }), ["friends", "pages", "favorites"]);
    assert.deepEqual(enabledSources(undefined), ["friends", "groups", "pages", "favorites"]);
  });
  test("countNewer", () => {
    const stories = [{ time: 100 }, { time: 200 }, { time: null }, {}];
    assert.equal(countNewer(stories, 150), 1);
    assert.equal(countNewer(stories, 50), 2);
    assert.equal(countNewer(stories, null), 0);
  });
  test("fullDate", () => {
    const unix = Date.UTC(2010, 2, 10, 16, 41) / 1000 + new Date(2010, 2, 10).getTimezoneOffset() * 60;
    assert.equal(fullDate(unix), "Wednesday, March 10, 2010 at 4:41pm");
    setLocale("pl");
    assert.equal(fullDate(unix), "środa, 10 marca 2010 o 16:41");
    assert.equal(fullDate(0), "");
  });
});
