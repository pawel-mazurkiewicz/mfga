// The fake Facebook "world": a deterministic viewer, friends, groups, pages, organic stories per Feeds-tab
// source, junk (ads, suggestions, non-story units) and the data shown in the rails. Plain data plus one
// mutable part, the UFI state (reactions, comments); GraphQL shapes live in graphql-shapes.mjs and DOM in
// chrome.mjs / posts.mjs.

import { createHash } from "node:crypto";
import { TEXTS, JUNK_TEXTS, COMMENT_TEXTS } from "./texts.mjs";

export const DEFAULT_NOW = 1792584000; // 2026-10-21T12:00:00Z

/** Feeds-tab sources (ARCHITECTURE §3.1) and the two whole-feed styles. */
export const FEED_STYLES = Object.freeze({
  friends: "MOST_RECENT_FRIENDS_FEED",
  groups: "MOST_RECENT_GROUPS_FEED",
  pages: "MOST_RECENT_PAGES_FEED",
  favorites: "FAVORITES_FEED",
  all: "MOST_RECENT_FEED_DEFAULT",
  top: "DEFAULT",
});
export const SOURCES = Object.freeze(["friends", "groups", "pages", "favorites"]);
export const STYLE_TO_FEED = Object.freeze(Object.fromEntries(Object.entries(FEED_STYLES).map(([k, v]) => [v, k])));

export const sha256hex = (s) => createHash("sha256").update(String(s)).digest("hex");
export const b64 = (s) => Buffer.from(String(s)).toString("base64");

/** mulberry32: small seeded PRNG so every run builds the same world. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FRIENDS = [
  ["Marta Kowalczyk", "Marta", "marta.kowalczyk.77"],
  ["Samuel Okafor", "Samuel", "samuel.okafor"],
  ["Lena Fischer", "Lena", "lena.fischer.501"],
  ["Tomasz Wiśniewski", "Tomasz", "tomasz.wisniewski.3"],
  ["Priya Raman", "Priya", "priya.raman.88"],
  ["Daniel Brooks", "Daniel", "dbrooks"],
  ["Agnieszka Nowak", "Agnieszka", "aga.nowak.12"],
  ["Owen Gallagher", "Owen", "owen.gallagher.9"],
  ["Hannah Lindgren", "Hannah", "hannah.lindgren"],
  ["Mateo Alvarez", "Mateo", "mateo.alvarez.21"],
  ["Zofia Mazur", "Zofia", "zofia.mazur.4"],
  ["Ruth Abernathy", "Ruth", "ruth.abernathy"],
];
const MEMBERS = [
  ["Victor Hale", "Victor"],
  ["Nadia Petrova", "Nadia"],
  ["Ingrid Solberg", "Ingrid"],
  ["Kofi Mensah", "Kofi"],
  ["Elena Rossi", "Elena"],
  ["Julian Weber", "Julian"],
];
const GROUPS = [
  ["Lakeside Hiking Club", "lakesidehikers", 2],
  ["Sourdough Bakers Circle", null, 0],
  ["Retro Computing Enthusiasts", "retrocomputing", 5],
  ["Riverside Neighbours", null, 0],
  ["Board Game Night Kraków", "boardgamenightkrk", 1],
];
const PAGES = [
  ["City Public Library", "citypubliclibrary"],
  ["Green Valley Farmers Market", "greenvalleymarket"],
  ["Northwind Jazz Orchestra", "northwindjazz"],
  ["Daily Astronomy Notes", "dailyastronomynotes"],
  ["Café Marzipan", "cafemarzipan"],
];
const STRANGERS = [
  ["Trailhead Daily", "Page", "trailheaddaily"],
  ["Pixel Kitchen", "Page", "pixelkitchen"],
  ["Mia Thornton", "User", "mia.thornton.5"],
  ["Gus Ferreira", "User", "gus.ferreira"],
];
const ADVERTISERS = [
  ["BrightSmile Dental Plans", "brightsmileplans"],
  ["Velocity Running Shoes", "velocityrunning"],
  ["CloudNest Storage", "cloudneststorage"],
  ["Aurora Language School", "auroralanguages"],
  ["Petal Post Flowers", "petalpostflowers"],
];

const FRIEND_KINDS = ["text", "photo", "text", "link", "album", "text", "share", "photo", "text", "video", "text", "photo"];
const GROUP_KINDS = ["text", "photo", "text", "album", "text", "link"];
const PAGE_KINDS = ["photo", "text", "link", "video", "text", "album"];

const profileUrl = (vanity, id) => (vanity ? `https://www.facebook.com/${vanity}` : `https://www.facebook.com/profile.php?id=${id}`);

function person(id, [name, shortName, vanity], type = "User") {
  return { id, name, shortName, vanity, type, url: profileUrl(vanity, id) };
}

/**
 * createWorld({ now, locale, seed }) -> World. Story times are offsets from `now` (unix seconds), so tests can
 * pass the real clock and still get the same content.
 */
export function createWorld({ now = DEFAULT_NOW, locale = "en", seed = 2010 } = {}) {
  const rand = rng(seed);
  const texts = TEXTS[locale] || TEXTS.en;
  const viewer = { ...person("100004217830511", ["Casey Lindqvist", "Casey", "casey.lindqvist"]), friendCount: 214 };
  const friends = FRIENDS.map((f, i) => person(String(100001000000000 + i * 7331), f));
  const members = MEMBERS.map((m, i) => person(String(100009000000000 + i * 1931), [...m, null]));
  const groups = GROUPS.map(([name, vanity, unread], i) => {
    const id = String(271000000000000 + i * 99991);
    return { id, name, type: "Group", unread, url: `https://www.facebook.com/groups/${vanity || id}/` };
  });
  const pages = PAGES.map(([name, vanity], i) => person(String(105000000000000 + i * 4243), [name, name, vanity], "Page"));
  const strangers = STRANGERS.map(([name, type, vanity], i) => person(String(100077000000000 + i * 613), [name, name, vanity], type));
  const advertisers = ADVERTISERS.map(([name, vanity], i) => person(String(109900000000000 + i * 877), [name, name, vanity], "Page"));
  const favoriteIds = new Set([friends[0].id, friends[3].id, pages[3].id]);

  const usedTimes = new Set();
  const uniqueTime = (t) => {
    let u = Math.round(t);
    while (usedTimes.has(u)) u -= 1;
    usedTimes.add(u);
    return u;
  };
  const stories = new Map();
  let serial = 0;
  const newId = () => String(1220000000000000 + ++serial * 104729 + Math.floor(rand() * 1000));

  function addStory({ actor, to = null, kind, template, mention = null, time, sources, shared = null }) {
    const postId = newId();
    const text = template.replace("{mention}", mention?.name ?? "");
    const story = {
      postId,
      nodeId: b64(`S:_I${actor.id}:${postId}:${postId}`),
      feedbackId: b64(`feedback:${postId}`),
      time: uniqueTime(time),
      actor,
      to,
      kind,
      text,
      mentions: template.includes("{mention}") ? [mention] : [],
      shared,
      sources: new Set(sources),
      reactions: Math.floor(rand() * 60) + (actor.type === "Page" ? 40 : 0),
      comments: Math.floor(rand() * 7),
      shares: Math.floor(rand() * 4),
      viewerLiked: rand() < 0.15,
      privacy: to ? "group" : actor.type === "Page" ? "public" : "friends",
      decoys: rand() < 0.5,
      ai: false,
      url: to ? `${to.url}posts/${postId}/` : `${actor.url}/posts/${postId}`,
    };
    if (favoriteIds.has(actor.id)) story.sources.add("favorites");
    stories.set(postId, story);
    return story;
  }

  // Timelines walk backwards from `now`, each source at its own pace, so the merge has real work to do.
  const timeline = (startMin, gapMin, n) => {
    const out = [];
    let t = now - startMin * 60;
    for (let i = 0; i < n; i++) {
      out.push(t);
      t -= gapMin * 60 * (0.6 + rand() * 0.8);
    }
    return out;
  };

  // texts.groups holds two posts per group: [g] and [g + groups.length].
  const groupText = (g, i) => texts.groups[g + (i % 2) * groups.length];

  const pagePosts = timeline(25, 95, 20).map((time, i) => {
    const page = pages[i % pages.length];
    return addStory({ actor: page, kind: PAGE_KINDS[i % PAGE_KINDS.length], template: texts.pages[i % texts.pages.length], time, sources: ["pages"] });
  });
  timeline(7, 52, 26).forEach((time, i) => {
    const actor = friends[(i * 5) % friends.length];
    const kind = FRIEND_KINDS[i % FRIEND_KINDS.length];
    const mention = friends[(i * 5 + 3) % friends.length];
    const shared = kind === "share" ? pagePosts[(i + 3) % pagePosts.length].postId : null;
    addStory({ actor, kind, template: texts.friends[i % texts.friends.length], mention, time, sources: ["friends"], shared });
  });
  timeline(40, 240, 6).forEach((time, i) => {
    const g = i % groups.length;
    addStory({ actor: friends[(i * 3 + 1) % friends.length], to: groups[g], kind: GROUP_KINDS[i % GROUP_KINDS.length], template: groupText(g, i + 1), time, sources: ["friends", "groups"] });
  });
  timeline(12, 68, 22).forEach((time, i) => {
    const g = (i * 2) % groups.length;
    const story = addStory({ actor: members[i % members.length], to: groups[g], kind: GROUP_KINDS[(i + 2) % GROUP_KINDS.length], template: groupText(g, i), time, sources: ["groups"] });
    if (i === 4) story.ai = true;
  });

  // The viewer's own posts: on their profile only, in no Feeds-tab source.
  timeline(300, 1440, 3).forEach((time, i) => addStory({ actor: viewer, kind: i === 1 ? "photo" : "text", template: texts.friends[(i * 7 + 2) % texts.friends.length], time, sources: [] }));

  const byTimeDesc = (a, b) => stories.get(b).time - stories.get(a).time;
  const feedOf = (source) => [...stories.values()].filter((s) => s.sources.has(source)).map((s) => s.postId).sort(byTimeDesc);
  const feeds = { friends: feedOf("friends"), groups: feedOf("groups"), pages: feedOf("pages"), favorites: feedOf("favorites") };
  feeds.all = [...new Set([...feeds.friends, ...feeds.groups, ...feeds.pages])].sort(byTimeDesc);
  // Top News: Facebook's ranking, i.e. a deterministic shuffle of recent stories that is clearly not chronological.
  feeds.top = feeds.all
    .slice(0, 40)
    .map((id, i) => ({ id, score: stories.get(id).reactions + rand() * 80 - i }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.id);
  const engagement = new Set(feeds.top.filter((_, i) => i % 5 === 2));

  const junk = buildJunk({ locale, advertisers, strangers, friends, members, newId });

  const feedback = createFeedbackState({ stories, people: [...friends, ...members], now, commentTexts: COMMENT_TEXTS[locale] || COMMENT_TEXTS.en });

  const birthdays = [friends[4], friends[8], friends[9]];
  const contacts = friends.slice(0, 9).map((f, i) => ({ ...f, online: i % 3 !== 2 }));

  return {
    now,
    locale,
    seed,
    viewer,
    friends,
    members,
    groups,
    pages,
    strangers,
    advertisers,
    favoriteIds,
    stories,
    feeds,
    engagement,
    junk,
    rails: {
      birthdays,
      contacts,
      groupChat: { a: friends[6].shortName, b: friends[1].shortName, others: 9, ago: "41w" },
      counts: { notifications: 5, messages: 2, friendRequests: 3 },
      shortcuts: groups,
    },
    feedback,
    story: (postId) => stories.get(postId) || null,
    storyByFeedbackId: (feedbackId) => [...stories.values()].find((st) => st.feedbackId === feedbackId) || null,
    /** Organic post ids of a Feeds-tab source (or "all" / "top"), newest first ("top": ranked order). */
    feed: (name) => feeds[name] || [],
    /** The combined feed MFGA must show: union of the given sources, deduplicated, strictly newest first. */
    expectedMerged(sources = SOURCES) {
      return [...new Set(sources.flatMap((s) => feeds[s] || []))].sort(byTimeDesc);
    },
  };
}

/**
 * Mutable UFI state per story (the only mutable part of the world): reactions, the viewer's reaction and the
 * comment list. Mutations change it; pages rendered afterwards and later queries see the change.
 */
function createFeedbackState({ stories, people, now, commentTexts }) {
  const states = new Map();
  const comment = (story, i, author, text, time) => {
    const legacy = String(BigInt(story.postId) % 1000000000n + BigInt(i) * 7919n + 300000000000000n);
    return { id: b64(`comment:${story.postId}_${legacy}`), legacy, postId: story.postId, author, text, time, reactions: (i * 3) % 5, replies: i % 4 === 1 ? 1 : 0 };
  };
  function get(postId) {
    const story = stories.get(postId);
    if (!story) return null;
    if (!states.has(postId)) {
      const gap = Math.max(60, Math.floor((now - story.time) / (story.comments + 1)));
      const comments = Array.from({ length: story.comments }, (_, i) =>
        comment(story, i, people[(Number(BigInt(story.postId) % 97n) + i * 5) % people.length], commentTexts[(i + story.text.length) % commentTexts.length], story.time + gap * (i + 1)),
      );
      states.set(postId, { reactions: story.reactions + (story.viewerLiked ? 1 : 0), viewerReaction: story.viewerLiked ? "1635855486666999" : null, shares: story.shares, comments });
    }
    return states.get(postId);
  }
  return {
    get,
    /** Sets the viewer's reaction ("0" removes it) and returns the new state. */
    react(postId, reactionId) {
      const st = get(postId);
      const had = st.viewerReaction != null;
      const has = reactionId !== "0";
      st.reactions += (has ? 1 : 0) - (had ? 1 : 0);
      st.viewerReaction = has ? reactionId : null;
      return st;
    },
    addComment(postId, author, text, time) {
      const st = get(postId);
      const c = comment(stories.get(postId), st.comments.length + 1000, author, text, time);
      st.comments.push(c);
      return c;
    },
  };
}

/** Junk templates: every kind of edge the classifier must drop (graphql-protocol §6.4). */
function buildJunk({ locale, advertisers, strangers, members, friends, newId }) {
  const t = JUNK_TEXTS[locale] || JUNK_TEXTS.en;
  const [trailhead, pixelKitchen, mia, gus] = strangers;
  const vanGroup = { id: "389900000000001", name: "Weekend Van Life", type: "Group", url: "https://www.facebook.com/groups/weekendvanlife/" };
  return [
    { id: "ad-full", type: "sponsored", variant: "full", actor: advertisers[0], text: t.ads[0], cta: "LEARN_MORE", postId: newId() },
    { id: "follow", type: "suggestion", variant: "follow", actor: trailhead, text: t.follow, postId: newId() },
    { id: "pymk", type: "unit", typename: "PaginatedPeopleYouMayKnowFeedUnit", people: [members[0], members[3], members[5]] },
    { id: "ad-obfuscated", type: "sponsored", variant: "obfuscated", actor: advertisers[1], text: t.ads[1], cta: "SHOP_NOW", postId: newId() },
    { id: "join", type: "suggestion", variant: "join", actor: gus, to: vanGroup, text: t.join, postId: newId() },
    { id: "reels", type: "unit", typename: "ShowcaseFeedUnit", creators: [trailhead, pixelKitchen, mia] },
    { id: "ad-category", type: "sponsored", variant: "category", actor: advertisers[2], text: t.ads[2], cta: "SIGN_UP", postId: newId() },
    { id: "recommended", type: "suggestion", variant: "recommended", actor: pixelKitchen, text: t.recommended, postId: newId() },
    { id: "stories", type: "unit", typename: "StoriesTrayFeedUnit", people: friends.slice(0, 4) },
    { id: "ad-label", type: "sponsored", variant: "label", actor: advertisers[3], text: t.ads[3], cta: "LEARN_MORE", postId: newId() },
    { id: "unconnected", type: "suggestion", variant: "unconnected", actor: mia, text: t.unconnected, postId: newId() },
    { id: "ad-auction", type: "sponsored", variant: "auction", actor: advertisers[4], text: t.ads[4], cta: "SHOP_NOW", postId: newId() },
    { id: "gysj", type: "unit", typename: "GroupsYouShouldJoinFeedUnit", groups: [vanGroup] },
    { id: "qp", type: "unit", typename: "QuickPromotionFeedUnit", text: t.promotion },
    { id: "no-node", type: "no-node" },
  ];
}

/**
 * Deterministic junk placement for one response page: [{ position, junk }]. Positions index the final edge
 * list (organic + junk), so junk lands between organic stories.
 */
export function junkPlan(world, feedName, page, organicCount) {
  const styleIndex = Object.keys(FEED_STYLES).indexOf(feedName);
  const picks = feedName === "top" || feedName === "all" ? 3 : 2;
  // Consecutive kinds per page, so every feed cycles through all junk kinds within a few pages.
  const base = page * picks + styleIndex * 5;
  const out = [];
  for (let k = 0; k < picks; k++) {
    const junk = world.junk[(base + k) % world.junk.length];
    out.push({ position: Math.min(1 + k * 2, organicCount + k), junk, instance: `${junk.id}:${feedName}:${page}:${k}` });
  }
  return out;
}
