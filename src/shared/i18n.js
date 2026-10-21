// UI strings. Modules register their own bundles so no single file becomes a merge hotspot:
//   registerStrings({ en: { "feed.older": "Older Posts" }, pl: { "feed.older": "Starsze posty" } });
//   t("feed.older")  t("ufi.viewAll", { n: 4 })  plural forms: t("ufi.likes", { n }) with key variants
// Polish follows the 2010 Facebook Polish UI wording where it existed.

const bundles = { en: Object.create(null), pl: Object.create(null) };
let locale = "en";

export function registerStrings(map) {
  for (const [lang, strings] of Object.entries(map)) {
    if (!bundles[lang]) bundles[lang] = Object.create(null);
    Object.assign(bundles[lang], strings);
  }
}

/** "auto" resolves from <html lang> (Facebook sets it to the account's UI language). */
export function setLocale(pref = "auto") {
  if (pref === "en" || pref === "pl") locale = pref;
  else locale = detectFacebookLocale();
  return locale;
}

export function getLocale() {
  return locale;
}

export function detectFacebookLocale() {
  const lang = (document.documentElement && document.documentElement.lang) || navigator.language || "en";
  return /^pl\b/i.test(lang) ? "pl" : "en";
}

// Polish plural categories: one (1), few (2-4, not 12-14), many (everything else).
function pluralSuffix(n, lang) {
  if (lang === "pl") {
    if (n === 1) return "one";
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) return "few";
    return "many";
  }
  return n === 1 ? "one" : "other";
}

/**
 * t(key, vars). If vars.n is a number and "<key>.<plural>" exists, that form is used.
 * Placeholders: {n}, {name}, ... Missing keys fall back to English, then to the key itself.
 */
export function t(key, vars = {}) {
  const lang = locale;
  let s;
  if (typeof vars.n === "number") {
    const suf = pluralSuffix(vars.n, lang);
    s = bundles[lang][`${key}.${suf}`] ?? bundles.en[`${key}.${pluralSuffix(vars.n, "en")}`];
  }
  s ??= bundles[lang][key] ?? bundles.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? formatVar(vars[k], lang) : `{${k}}`));
}

function formatVar(v, lang) {
  if (typeof v === "number") return v.toLocaleString(lang === "pl" ? "pl-PL" : "en-US");
  return String(v);
}

/** 2010-style relative time: "26 minutes ago", "about an hour ago", "Yesterday at 5:47pm", "March 4 at 5:47pm". */
export function relativeTime(unixSeconds, now = Date.now()) {
  if (!unixSeconds) return "";
  const then = new Date(unixSeconds * 1000);
  const diff = Math.max(0, Math.round((now - then.getTime()) / 1000));
  const lang = locale;
  if (diff < 60) return t("time.seconds", { n: diff });
  if (diff < 3600) {
    const m = Math.round(diff / 60);
    return m <= 1 ? t("time.minute") : t("time.minutes", { n: m });
  }
  if (diff < 2 * 3600) return t("time.hour");
  const today = new Date(now);
  const sameDay = then.toDateString() === today.toDateString();
  if (diff < 24 * 3600 && sameDay) return t("time.hours", { n: Math.floor(diff / 3600) });
  const clock = formatClock(then, lang);
  const yesterday = new Date(now - 86400000);
  if (then.toDateString() === yesterday.toDateString()) return t("time.yesterday", { time: clock });
  const months = (lang === "pl" ? MONTHS_PL : MONTHS_EN);
  const day = then.getDate();
  let date = lang === "pl" ? `${day} ${months[then.getMonth()]}` : `${months[then.getMonth()]} ${day}`;
  if (then.getFullYear() !== today.getFullYear()) date += lang === "pl" ? ` ${then.getFullYear()}` : `, ${then.getFullYear()}`;
  return t("time.date", { date, time: clock });
}

function formatClock(d, lang) {
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (lang === "pl") return `${d.getHours()}:${mm}`;
  const h = d.getHours() % 12 || 12;
  return `${h}:${mm}${d.getHours() < 12 ? "am" : "pm"}`;
}

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_PL = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];

registerStrings({
  en: {
    "time.seconds.one": "{n} second ago",
    "time.seconds.other": "{n} seconds ago",
    "time.minute": "about a minute ago",
    "time.minutes.one": "{n} minute ago",
    "time.minutes.other": "{n} minutes ago",
    "time.hour": "about an hour ago",
    "time.hours.one": "{n} hour ago",
    "time.hours.other": "{n} hours ago",
    "time.yesterday": "Yesterday at {time}",
    "time.date": "{date} at {time}",
  },
  pl: {
    "time.seconds.one": "{n} sekundę temu",
    "time.seconds.few": "{n} sekundy temu",
    "time.seconds.many": "{n} sekund temu",
    "time.minute": "około minuty temu",
    "time.minutes.one": "{n} minutę temu",
    "time.minutes.few": "{n} minuty temu",
    "time.minutes.many": "{n} minut temu",
    "time.hour": "około godziny temu",
    "time.hours.one": "{n} godzinę temu",
    "time.hours.few": "{n} godziny temu",
    "time.hours.many": "{n} godzin temu",
    "time.yesterday": "Wczoraj o {time}",
    "time.date": "{date} o {time}",
  },
});
