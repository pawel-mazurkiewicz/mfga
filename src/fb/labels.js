// Locale dictionaries for junk detection and the locale probe (docs/research/dom-feed.md §5).
// Every label is compared after labelKey() and matched EXACTLY, never as a substring: a post saying
// "Sponsored by my mom" or a Page called "Ad" must stay. Matching uses the union of all locales, so a
// wrong or missing <html lang> never disables detection.

import { normLabel } from "../shared/util.js";

// Invisible characters normLabel() does not strip: bidi marks and isolates, invisible operators, Hangul
// and Khmer fillers, Mongolian and Unicode variation selectors. Facebook pads labels with them.
const EXTRA_INVISIBLE = /[؜ᅟᅠ឴឵᠋-᠏‎‏‪-‮⁡-⁩ㅤ︀-️ﾠ]/g;

/** Canonical form of a UI label: NFKC, lowercase, no invisible characters or bullets, single spaces. */
export function labelKey(s) {
  return normLabel(String(s ?? "").replace(EXTRA_INVISIBLE, "").replace(/ /g, " "));
}

/** A byline split on its "·" separators: "Ad · 🌐" -> ["ad", "🌐"]. */
export function bylineSegments(s) {
  return String(s ?? "")
    .split(/[·•]/)
    .map(labelKey)
    .filter(Boolean);
}

/**
 * MFGA core tables (dom-feed §5.1). EN is Facebook's 2026 wording. PL is confirmed in a 2026 Polish
 * capture or in Facebook's own Polish string table unless marked "dictionary" (taken from a blocker's
 * dictionary, possibly a contributor's translation).
 */
export const CORE = Object.freeze({
  en: {
    ad: ["Sponsored", "Ad"],
    paidPartnership: ["Paid partnership"],
    follow: ["Follow"],
    join: ["Join", "Join group"],
    addFriend: ["Add friend"],
    postMenu: ["Actions for this post"],
    hidePost: ["Hide post"],
    like: ["Like"],
    commentLabel: ["Leave a comment"],
    shareLabel: ["Send this to friends or post it on your profile.", "Share, send this to friends or post it on your profile."],
    stories: ["Stories", "Feed Stories"],
    reels: ["Reels", "Reels and short videos", "Short videos"],
    pymk: ["People you may know"],
    groupSuggestions: ["Suggested groups", "Groups you may like", "Suggested for you in groups", "Your group suggestions"],
    suggestedPanels: ["Suggested pages", "Pages you may like", "Events you may like", "Suggested events"],
    // Legacy header lines above the author; matched as prefixes (Social Fixer's 2026 list).
    suggestedHeaders: [
      "Suggested for you", "Suggested post", "Suggested posts", "Recommended for you", "Recommended post",
      "Based on your recent", "Because you may be interested in", "Because you recently viewed",
      "Because you viewed", "From a group that", "From a group with members who like", "From a group you",
      "Post from a public group", "Suggested from", "You recently viewed a similar group",
    ],
    ai: ["AI info", "AI content"],
    metaAI: ["Meta AI", "Try Meta AI", "Ask Meta AI", "Visit Meta AI", "Meta AI branding"],
    memories: ["Memories", "On this day"],
  },
  pl: {
    // "Reklama" and "Materiał sponsorowany" are in Facebook's Polish string table; the feed byline that
    // uses them in 2026 was not captured yet.
    ad: ["Sponsorowane", "Reklama", "Materiał sponsorowany"],
    paidPartnership: ["Post sponsorowany"], // dictionary (zbluebugz), LOW
    follow: ["Obserwuj"],
    join: ["Dołącz", "Dołącz do grupy"],
    addFriend: ["Dodaj znajomego"],
    postMenu: ["Działania dla tego posta"],
    hidePost: ["ukryj post"],
    like: ["Lubię to!"],
    commentLabel: ["Dodaj komentarz"],
    shareLabel: ["Wyślij do znajomych lub opublikuj w Twoim profilu."],
    stories: ["Relacje"],
    reels: ["Rolki", "Reels", "Rolki i krótkie filmy"],
    pymk: ["Osoby, które możesz znać"],
    groupSuggestions: ["Proponowane grupy"], // dictionary (zbluebugz 2022)
    suggestedPanels: ["Wydarzenia, które mogą Ci się spodobać", "Proponowane wydarzenia"], // dictionary
    suggestedHeaders: ["Propozycje dla Ciebie", "Proponowane dla Ciebie", "Polecany post", "Proponowany post z grupy publicznej"],
    ai: ["Informacje o SI", "Informacje SI"], // both in Facebook's Polish string table
    metaAI: ["Meta AI"],
    memories: ["Wspomnienia"],
  },
});

/*
 * zbluebugz "FB - Clean my feeds" v5.02 dictionary: the keys holding Facebook's own wording, verbatim
 * (object masterKeyWords.translations in greasyfork-release/fb-clean-my-feeds.user.js, November 2024,
 * https://github.com/zbluebugz/facebook-clean-my-feeds). That file is released under the MIT License
 * (its header: "@license MIT; https://opensource.org/licenses/MIT"):
 *
 *   Copyright (c) zbluebugz
 *
 *   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
 *   associated documentation files (the "Software"), to deal in the Software without restriction,
 *   including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
 *   and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
 *   subject to the following conditions:
 *
 *   The above copyright notice and this permission notice shall be included in all copies or substantial
 *   portions of the Software.
 *
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
 *   LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
 *   NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 *   WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 *   SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * 2024 wording: Facebook's 2026 "Ad" label is absent and some entries are contributor guesses.
 */
export const ZB502_KEYS = Object.freeze([
  "SPONSORED", "NF_STORIES", "NF_PEOPLE_YOU_MAY_KNOW", "NF_PAID_PARTNERSHIP", "NF_SPONSORED_PAID", "NF_FOLLOW",
  "NF_PARTICIPATE", "NF_REELS_SHORT_VIDEOS", "NF_EVENTS_YOU_MAY_LIKE", "REELS_TITLE", "VF_LIVE", "NF_SURVEY",
]);
const ZB502_ROWS = {
  en: ["Sponsored", "Stories", "People you may know", "Paid partnership", "Sponsored · Paid for by ______", "Follow", "Participate", "Reels and short videos", "Events you may like", "Reels", "LIVE", "Survey"],
  ar: ["مُموَّل", "القصص", "أشخاص قد تعرفهم", "شراكة مدفوعة", "برعاية · مدفوعة بواسطة ______", "تابع", "المشاركة", "ريلز ومقاطع الفيديو القصيرة", "أحداث قد تعجبك", "ريلز", "مباشر", "استبيان"],
  bg: ["Спонсорирано", "Истории", "Хора, които може би познавате", "Платено партньорство", "Спонсорирано · Платено от ______", "Следвай", "Участвай", "Ленти и кратки видеоклипове", "Събития, които може да ви харесат", "Ленти", "НА ЖИВО", "Анкета"],
  cs: ["Sponzorováno", "Stories", "Koho možná znáte", "Placené partnerství", "Sponzorováno · Platí za to ______", "Sledovat", "Participovat", "Sekvence a krátká videa", "Události, které se vám mohou líbit", "Reels", "ŽIVĚ", "Průzkum"],
  de: ["Gesponsert", "Stories", "Personen, die du kennen könntest", "Bezahlte Werbepartnerschaft", "Gesponsert · Finanziert von ______", "Folgen", "Teilnehmen", "Reels und Kurzvideos", "Veranstaltungen, die Ihnen gefallen könnten", "Reels", "LIVE", "Umfrage"],
  el: ["Χορηγούμενη", "Ιστορίες", "Άτομα που ίσως γνωρίζετε", "Πληρωμένη συνεργασία", "Χορηγούμενο · Πληρωμένο από ______", "Ακολούθησε", "Συμμετέχω", "Reel και σύντομα βίντεο", "Εκδηλώσεις που μπορεί να σας αρέσουν", "Reel", "ΖΩΝΤΑΝΑ", "Τοπογράφηση"],
  es: ["Publicidad", "Historias", "Personas que quizá conozcas", "Colaboración pagada", "Publicidad · Pagado por ______", "Seguir", "Participar", "Reels y vídeos cortos", "Eventos que te pueden gustar", "Reels", "ESTRENO", "Encuesta"],
  fi: ["Sponsoroitu", "Tarinat", "Ihmiset, jotka saatat tuntea", "Maksettu kumppanuus", "Sponsoroitu · Maksaja ______", "Seuraa", "Osallistua", "Keloja ja lyhyitä videoita", "Kela/lyhyt video", "Reels", "LIVE", "Kysely"],
  fr: ["Sponsorisé", "Stories", "Connaissez-vous...", "Partenariat rémunéré", "Sponsorisé · Financé par ______", "Suivre", "Participer", "Reels et vidéos courtes", "Évènements qui pourraient vous intéresser", "Reels", "EN DIRECT", "Enquête"],
  he: ["ממומן", "סטוריז ", "אנשים שאולי אתה מכיר", "שותפות בתשלום", "ממומן · שולם על ידי ______", "עקוב", "השתתף", "סרטוני Reels וקטעי וידאו קצרים", "אירועים שאולי תאהבו", "Reels", "שידור חי", "סקר"],
  id: ["Bersponsor", "Cerita", "Orang yang Mungkin Anda Kenal", "Kemitraan berbayar", "Disponsori · Dibayar oleh ______", "Ikuti", "Berpartisipasi", "Reels dan Video Pendek", "Acara yang mungkin Anda sukai", "Reels", "LANGSUNG", "Survei"],
  it: ["Sponsorizzato", "Storie", "Persone che potresti conoscere", "Partnership pubblicizzata", "Sponsorizzato · Finanziato da ______", "Segui", "Partecipare", "Reel e video brevi", "Eventi che potrebbero piacerti", "Reels", "IN DIRETTA", "Sondaggio"],
  ja: ["広告", "Stories", "あなたが知っているかもしれない人々", "有償パートナーシップ", "後援 · ______ による支払い", "フォロー", "参加する", "リールとショート動画", "リール/ショートビデオ", "リール動画", "ライブ", "アンケート"],
  lv: ["Apmaksāta reklāma", "Stāsti", "Cilvēki, kurus tu varētu pazīt", "Apmaksāta sadarbība", "Apmaksāta reklāma · Apmaksā ______", "Sekot", "Piedalīties", "Reels un īsi videoklipi", "Notikumi, kas jums varētu patikt", "Reels", "TIEŠRAIDE", "Aptauja"],
  nl: ["Gesponsord", "Verhalen", "Mensen die je misschien kent", "Betaald partnerschap", "Gesponsord · Betaald door ______", "Volgen", "Deelnemen", "Reels en korte video's", "Evenementen die je misschien leuk vindt", "Reels", "LIVE", "Vragenlijst"],
  pl: ["Sponsorowane", "Relacje", "Osoby, które możesz znać", "Post sponsorowany", "Sponsorowane · Opłacona przez ______", "Obserwuj", "Uczestniczyć", "Rolki i krótkie filmy", "Wydarzenia, które mogą Ci się spodobać", "Reels", "NA ŻYWO", "Badanie"],
  pt: ["Patrocinado", "Stories", "Pessoas que talvez conheças", "Parceria paga", "Patrocinado · Financiado por ______", "Seguir", "Participar", "Vídeos do Reels e vídeos de curta duração", "Eventos que você pode gostar", "Reels", "DIRETO", "Enquete"],
  ru: ["Реклама", "Истории", "Люди, которых вы можете знать", "Платное партнерство", "Реклама · Оплачено ______", "Подписаться", "Участвовать", "Reels и короткие видео", "Мероприятия, которые вам могут понравиться", "Видео Reels", "В ЭФИРЕ", "Опрос"],
  tr: ["Sponsorlu", "Hikayeler", "Tanıyor olabileceğin kişiler", "ücretli ortaklık", "Sponsorlu · ______ tarafından ödendi", "Takip Et", "Katılmak", "Makaralar ve kısa videolar", "makara/kısa video", "Reels", "CANLI", "Anket"],
  uk: ["Спонсорована", "Історії", "Люди, яких Ви можете знати", "Оплачуване партнерство", "Спонсоровано · Оплачено ______", "Слідуйте", "Беріть участь", "Відео Reels і короткі відео", "Події, які можуть вам сподобатися", "Reels", "ЕФІР", "Опитування"],
  vi: ["Được tài trợ", "Tin", "Những người bạn có thể biết", "Mối quan hệ tài trợ", "Được tài trợ · Tài trợ bởi ______", "Theo dõi", "Tham gia", "Reels và video ngắn", "Sự kiện bạn có thể thích", "Reels", "TRỰC TIẾP", "Khảo sát"],
  "zh-Hans": ["赞助内容", "故事", "你可能认识的人", "付费合伙", "赞助 · 由 ______ 付费", "关注", "参与", "卷轴和短视频", "您可能喜欢的活动", "Reels", "现场直播", "调查"],
  "zh-Hant": ["贊助", "故事", "你可能認識的人", "付費合作", "贊助 · 出資者：______", "追蹤", "參與", "Reels 和短影片", "你可能感興趣的活動", "Reels", "現場直播", "調查"],
};

/** The v5.02 dictionary as { lang: { KEY: wording } }. */
export const ZB502 = Object.freeze(
  Object.fromEntries(Object.entries(ZB502_ROWS).map(([lang, row]) => [lang, Object.freeze(Object.fromEntries(ZB502_KEYS.map((k, i) => [k, row[i]])))])),
);

// Which zbluebugz keys feed which concept. NF_SPONSORED_PAID needs no entry: its first byline segment is
// the SPONSORED word. VF_LIVE and NF_SURVEY are not junk signals for MFGA.
const ZB_CONCEPTS = {
  ad: ["SPONSORED"],
  paidPartnership: ["NF_PAID_PARTNERSHIP"],
  follow: ["NF_FOLLOW"],
  join: ["NF_PARTICIPATE"],
  stories: ["NF_STORIES"],
  reels: ["NF_REELS_SHORT_VIDEOS", "REELS_TITLE"],
  pymk: ["NF_PEOPLE_YOU_MAY_KNOW"],
  suggestedPanels: ["NF_EVENTS_YOU_MAY_LIKE"],
};

function buildWords() {
  const words = {};
  const add = (concept, list) => {
    const set = (words[concept] ||= new Set());
    for (const w of list) {
      const k = labelKey(w);
      if (k) set.add(k);
    }
  };
  for (const table of Object.values(CORE)) for (const [concept, list] of Object.entries(table)) add(concept, list);
  for (const row of Object.values(ZB502)) {
    for (const [concept, keys] of Object.entries(ZB_CONCEPTS)) add(concept, keys.map((k) => row[k]));
  }
  return Object.freeze(Object.fromEntries(Object.entries(words).map(([k, v]) => [k, Object.freeze(v)])));
}

/** Normalised word sets per concept, the union of every locale: WORDS.ad.has("reklama"). */
export const WORDS = buildWords();

/** Exact match of a label against a concept's words. */
export function isWord(concept, text) {
  return WORDS[concept]?.has(labelKey(text)) ?? false;
}

/** Whether the label starts with one of the concept's phrases (for "Paid partnership with Brand"). */
export function startsWithWord(concept, text) {
  const key = labelKey(text);
  if (!key) return false;
  for (const w of WORDS[concept] ?? []) if (key === w || key.startsWith(`${w} `)) return true;
  return false;
}

/** A decoded byline is an ad label when one of its segments is an ad word or starts with a paid-partnership phrase. */
export function isAdLabel(text) {
  return bylineSegments(text).some((seg) => WORDS.ad.has(seg) || startsWithWord("paidPartnership", seg));
}

/** Whether an aria-label is `phrase` or `phrase by <Name>`/`phrase <Name>` for one of the concept's phrases. */
function labelHasPrefix(concept, label, locale) {
  const key = labelKey(label);
  return (CORE[locale]?.[concept] ?? []).some((p) => {
    const w = labelKey(p);
    return key === w || key.startsWith(`${w} `);
  });
}

const PROBE_FIELDS = { like: "like", comment: "commentLabel", share: "shareLabel", menu: "postMenu", hide: "hidePost" };

/**
 * Self-calibrating locale probe (dom-feed §6.3). `observed` holds the action-bar, menu and hide labels read
 * from a kept post ({like, comment, share, menu, hide}, any may be missing). Returns which core locale they
 * match and which fields match none, so unverified dictionary entries surface in diagnostics. Never
 * returns label text: menu and hide labels carry the author's name.
 */
export function probeLabels(observed) {
  const fields = Object.keys(PROBE_FIELDS).filter((f) => observed?.[f]);
  const score = {};
  for (const locale of Object.keys(CORE)) {
    score[locale] = fields.filter((f) => labelHasPrefix(PROBE_FIELDS[f], observed[f], locale)).length;
  }
  const best = Object.keys(score).sort((a, b) => score[b] - score[a])[0];
  const detected = score[best] > 0 ? best : null;
  const mismatches = fields.filter((f) => !detected || !labelHasPrefix(PROBE_FIELDS[f], observed[f], detected));
  return { detected, checked: fields.length, mismatches };
}
