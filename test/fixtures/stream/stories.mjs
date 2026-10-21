// Story fixtures for the stream UI (Story model: docs/ARCHITECTURE.md §3.2).
// `replicaStories` recreate the three stories of assets/reference/2010-home.png for side-by-side
// screenshots; `galleryStories` cover every attachment kind and edge case.
// Images live under IMG_HOST and are served by test/e2e/stream.test.mjs (PNG crops in ./img, SVG otherwise).

export const NOW = Date.UTC(2026, 9, 21, 15, 0, 0);
export const IMG_HOST = "https://scontent.fixture.fbcdn.net";
export const VIDEO_HOST = "https://video.fixture.fbcdn.net";

const nowSec = Math.floor(NOW / 1000);
const MIN = 60;
const HOUR = 3600;
const ago = (seconds) => nowSec - seconds;
const img = (name) => `${IMG_HOST}/${name}`;
const fb = (path) => `https://www.facebook.com/${path}`;

export const LIKE_ID = "1635855486666999";
export const LOVE_ID = "1678524932434102";

export const ME = { name: "J.D. Hodges", avatar: img("jd-50.png"), url: fb("jd.hodges") };

const user = (vanity, name) => ({ id: `u-${vanity}`, name, url: fb(vanity), type: "User" });
const page = (vanity, name) => ({ id: `p-${vanity}`, name, url: fb(vanity), type: "Page" });

const SAMANTHA = user("samantha.hodges", "Samantha Hodges");
const AMY = user("amy.winstead", "Amy Winstead");
const RACHEL = user("rachel.wise", "Rachel Wise");
const JESSICA = user("jessica.kohler", "Jessica Kohler");
const BLAKE = user("blake.segafredo", "Blake Segafredo");
const MARTA = user("marta.nowak", "Marta Nowak");
const TOMEK = user("tomek.zielinski", "Tomek Zieliński");
const NASA = page("NASA", "NASA");
const GUARDIAN = page("theguardian", "The Guardian");

/** Fills every Story field with its empty value. */
function story(fields) {
  const postId = fields.postId;
  return {
    key: postId,
    postId,
    nodeId: `UzpfS${postId}`,
    time: null,
    url: fb(`${fields.actors?.[0]?.url?.split("/").pop() || "story"}/posts/${postId}`),
    actors: [],
    avatar: null,
    target: null,
    title: null,
    text: null,
    ranges: [],
    attachments: [],
    shared: null,
    groupId: null,
    tracking: null,
    sources: ["friends"],
    audience: null,
    ai: false,
    ...fields,
    feedback: {
      id: `feedback:${postId}`,
      reactions: 0,
      comments: 0,
      shares: 0,
      viewerReaction: null,
      canComment: true,
      topReactions: [],
      ...fields.feedback,
    },
  };
}

const comment = (id, author, avatarName, text, time, extra = {}) => ({
  id,
  author: { id: author.id, name: author.name, url: author.url, avatar: avatarName ? img(avatarName) : null },
  text,
  ranges: [],
  time,
  reactions: 0,
  replies: 0,
  ...extra,
});

// ---- the three stories of the 2010 screenshot ----

export const replicaStories = [
  story({
    postId: "1001",
    time: ago(26 * MIN),
    actors: [SAMANTHA],
    avatar: img("samantha-50.png"),
    text: "had a great lunch, but an even better conversation with J.D. (at lunch) today. By the way, chcolate lava cake is a must when you're in Hawaii!",
    feedback: { reactions: 2, comments: 4, viewerReaction: LIKE_ID },
  }),
  story({
    postId: "1002",
    time: ago(9 * HOUR),
    actors: [RACHEL],
    avatar: img("rachel-50.png"),
    text: "RIP Belle-sweet dog till the end",
    feedback: { reactions: 1, comments: 2 },
  }),
  story({
    postId: "1003",
    time: ago(10 * HOUR),
    actors: [BLAKE],
    avatar: img("blake-50.png"),
    text: "I see comments about some major change on Facebook. Mine looks the same as it has for the last 6 months. What am I missing?",
    feedback: { reactions: 0, comments: 0 },
  }),
];

// ---- every attachment kind and edge case ----

const LONG_TEXT =
  "Big news for the Kraków hiking group! 🥾 Thanks to everyone who came to Saturday's walk with Marta Nowak — " +
  "we covered 18 km and nobody got lost (this time). Photos are below, the full route is on https://example.org/routes/tatry-2026 " +
  "and next month we're going back for the sunrise trip. #hiking #tatry\n\n" +
  "A few practical notes for the next one: bring proper boots, at least two litres of water, a warm layer even if the " +
  "forecast looks fine, and a head torch because we start before dawn. The bus leaves from the main station at 4:30, " +
  "please be there ten minutes early. If you can't make it, write a comment so we know how many seats to book. " +
  "Dogs are welcome as long as they're on a lead in the national park.";

function rangeOf(text, needle, url, kind) {
  return { offset: text.indexOf(needle), length: needle.length, url, kind };
}

export const galleryStories = [
  story({
    postId: "2001",
    time: ago(30 * MIN),
    actors: [MARTA],
    avatar: img("photo-marta-50x50.svg"),
    target: { type: "Group", id: "g-krakow", name: "Kraków Hiking Club", url: fb("groups/krakowhiking/") },
    groupId: "g-krakow",
    sources: ["groups"],
    title: "Saturday walk: 18 km in the Tatras",
    text: LONG_TEXT,
    ranges: [
      rangeOf(LONG_TEXT, "Marta Nowak", MARTA.url, "user"),
      rangeOf(LONG_TEXT, "https://example.org/routes/tatry-2026", "https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.org%2Froutes%2Ftatry-2026&h=AT1", "link"),
      rangeOf(LONG_TEXT, "#hiking", fb("hashtag/hiking"), "hashtag"),
      rangeOf(LONG_TEXT, "#tatry", fb("hashtag/tatry"), "hashtag"),
    ],
    attachments: [
      {
        kind: "photo",
        total: 7,
        items: [1, 2, 3, 4, 5].map((i) => ({ uri: img(`photo-trail${i}-1200x900.svg`), width: 1200, height: 900, href: fb(`photo/?fbid=50${i}`), alt: `Trail photo ${i}` })),
      },
    ],
    feedback: { reactions: 14, comments: 23, viewerReaction: null },
  }),
  story({
    postId: "2002",
    time: ago(47 * MIN),
    actors: [GUARDIAN],
    avatar: img("photo-guardian-50x50.svg"),
    sources: ["pages"],
    text: "The night sky this week: where to look for the Orionids.",
    attachments: [
      {
        kind: "link",
        url: "https://www.theguardian.com/science/2026/oct/20/orionids-meteor-shower",
        title: "Orionid meteor shower 2026: when and how to see it",
        description: "The Orionids, debris from Halley's comet, peak this week. Here is the best time to look up and what you can expect to see.",
        source: "theguardian.com",
        image: img("photo-meteor-400x300.svg"),
      },
    ],
    feedback: { reactions: 1234, comments: 0 },
  }),
  story({
    postId: "2003",
    time: ago(2 * HOUR + 5 * MIN),
    actors: [NASA],
    avatar: img("photo-nasa-50x50.svg"),
    sources: ["pages"],
    text: "Watch: the Artemis crew's first view of the far side of the Moon.",
    attachments: [
      {
        kind: "video",
        poster: img("photo-moon-1280x720.svg"),
        sd: `${VIDEO_HOST}/artemis-sd.mp4`,
        hd: `${VIDEO_HOST}/artemis-hd.mp4`,
        width: 1280,
        height: 720,
        href: fb("NASA/videos/777/"),
        duration: 151,
        live: false,
      },
    ],
    feedback: { reactions: 5, comments: 1, viewerReaction: LOVE_ID },
  }),
  story({
    postId: "2004",
    time: ago(5 * HOUR),
    actors: [TOMEK],
    avatar: img("photo-tomek-50x50.svg"),
    text: "This is exactly what I meant yesterday 😂",
    shared: story({
      postId: "2104",
      time: ago(30 * HOUR),
      actors: [NASA],
      avatar: img("photo-nasa-50x50.svg"),
      text: "Saturn's rings, photographed in infrared.",
      attachments: [{ kind: "photo", total: 1, items: [{ uri: img("photo-saturn-900x1200.svg"), width: 900, height: 1200, href: fb("photo/?fbid=9001"), alt: "Saturn" }] }],
    }),
    feedback: { reactions: 3, comments: 0 },
  }),
  story({
    postId: "2005",
    time: ago(26 * HOUR),
    actors: [JESSICA],
    avatar: img("jessica-32.png"),
    attachments: [{ kind: "event", url: fb("events/31337/"), title: "Halloween party at Jess's", when: "Saturday, October 31 at 8:00pm" }],
    feedback: { reactions: 0, comments: 0 },
  }),
  story({
    postId: "2006",
    time: ago(3 * 24 * HOUR),
    actors: [AMY],
    avatar: img("amy-32.png"),
    text: "Can't see the post I shared? Neither can I.",
    attachments: [{ kind: "unavailable" }, { kind: "other", href: fb("amy.winstead/posts/2006/attachment") }],
    feedback: { reactions: 0, comments: 0 },
  }),
  story({
    postId: "2007",
    time: ago(8 * MIN),
    actors: [page("frozenpeaksfanpage", "Frozen Peaks")],
    avatar: null,
    ai: true,
    sources: ["pages"],
    text: "Comments are turned off for this post.",
    attachments: [{ kind: "photo", total: 1, items: [{ uri: img("photo-peak-800x1000.svg"), width: 800, height: 1000, href: fb("photo/?fbid=7007"), alt: "" }] }],
    feedback: { reactions: 12, comments: 0, viewerReaction: LOVE_ID, canComment: false },
  }),
  story({
    postId: "2008",
    time: ago(95 * MIN),
    actors: [SAMANTHA, AMY],
    avatar: img("samantha-50.png"),
    text: "Road trip!\nFirst stop: the coast.",
    feedback: { reactions: 0, comments: 45 },
  }),
];

// ---- comments, chronological (oldest first) ----

function generated(postId, count, startAgo) {
  const people = [[AMY, "amy-32.png"], [RACHEL, "rachel-32.png"], [JESSICA, "jessica-32.png"], [SAMANTHA, "samantha-32.png"]];
  return Array.from({ length: count }, (_, i) => {
    const [who, pic] = people[i % people.length];
    return comment(`${postId}_${i + 1}`, who, pic, `Comment number ${i + 1} on this post.`, ago(startAgo - i * 60), { reactions: i % 5 === 0 ? 2 : 0, replies: i % 7 === 3 ? 3 : 0 });
  });
}

export const COMMENTS = {
  1001: [
    comment("1001_1", RACHEL, "rachel-32.png", "Lava cake for lunch? Jealous!", ago(25 * MIN)),
    comment("1001_2", JESSICA, "jessica-32.png", "Aloha!", ago(20 * MIN)),
    comment("1001_3", AMY, "amy-32.png", 'oh, go ahead and "gush!" about the cake... (teehee...)', ago(14 * MIN)),
    comment("1001_4", SAMANTHA, "samantha-32.png", "Ha Ha!", ago(12 * MIN)),
  ],
  1002: [
    comment("1002_1", JESSICA, "jessica-32.png", "I'm  so happy I got to meet her, :hugs: bff", ago(5 * HOUR)),
    comment("1002_2", RACHEL, "rachel-32.png", "aw thanks Jess, she was a good doggy", ago(4 * HOUR)),
  ],
  2001: generated("2001", 23, 2 * MIN + 23 * 60),
  2003: [comment("2003_1", MARTA, null, "Goosebumps.", ago(HOUR), { reactions: 4, replies: 2 })],
  2008: generated("2008", 45, 39 * MIN + 45 * 60),
};

export const allStories = [...replicaStories, ...galleryStories];
