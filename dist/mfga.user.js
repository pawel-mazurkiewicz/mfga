// ==UserScript==
// @name         MFGA - Make Facebook Great Again
// @name:pl      MFGA - Facebook jak w 2010
// @namespace    https://github.com/pawel-mazurkiewicz/mfga
// @version      1.0.0
// @description  Facebook, the way it looked in 2010 - and a News Feed with only your friends, groups and pages. No ads, no suggestions, no reels.
// @description:pl  Facebook taki jak w 2010 roku - Aktualności tylko od znajomych, grup i stron. Bez reklam, propozycji i rolek.
// @author       pawel-mazurkiewicz
// @homepageURL  https://github.com/pawel-mazurkiewicz/mfga
// @supportURL   https://github.com/pawel-mazurkiewicz/mfga/issues
// @updateURL    https://raw.githubusercontent.com/pawel-mazurkiewicz/mfga/main/dist/mfga.user.js
// @downloadURL  https://raw.githubusercontent.com/pawel-mazurkiewicz/mfga/main/dist/mfga.user.js
// @license      MIT
// @match        https://www.facebook.com/*
// @match        https://web.facebook.com/*
// @icon         data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABK0lEQVR42mNkQALWkTP+M9ABHF2ewQhjsyBbvGlaDD3sZ/BjYPgPcwgTTJBelqPbxWgdOeM/PS1HCYmsJQxMDAMMRh0w6oDh4QC/rCUMSdXrB8YBpd07GY4sSx+4ELh5/zUDAwMDw5v3X+nvgE37bzBYG8lT5AEWSjTPWX0GJfj9spYwMDAwMNibKjIUJ1pTzwGl3TvhQY0MkC1HZttEzaSuA27ef80Q5qnLwMDAwLBq+2WKEh3ZUfD05afRgogmgKxcYBM1E9KGNJJn8HPSxMiK8lIC1HWAuqIow9FzD+H8DVMhLajTl58wbNp3naG8ZweK5ROrfajrgO5Sd6zi5noyDOZ6MgwMDLajiXDUAaMOIN8BR5dnMMKqUXr3ilD6hvR0BLJdjAPdPQcAbCldQKlpIgMAAAAASUVORK5CYII=
// @run-at       document-start
// @sandbox      raw
// @inject-into  auto
// @noframes
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_addElement
// ==/UserScript==

(() => {
  // src/shared/settings.js
  var STORAGE_KEY = "mfga:settings";
  var DEFAULTS = Object.freeze({
    version: 1,
    enabled: true,
    language: "auto",
    // "auto" | "en" | "pl"
    feed: {
      // What the home page's News Feed shows: "recent" = combined chronological, "top" = Facebook's ranking.
      mode: "recent",
      sources: { friends: true, groups: true, pages: true, favorites: true },
      // false = the 2010 "Older Posts" button; true = load more when scrolling near the end.
      autoLoad: false,
      pageSize: 10,
      previewComments: true,
      hideAI: false,
      keywords: []
      // extra phrases: stories whose text contains one are hidden (case-insensitive)
    },
    clean: {
      // Applies to Facebook-rendered feeds (fallback home feed, groups feed, groups, search).
      sponsored: true,
      suggested: true,
      peopleYouMayKnow: true,
      reels: true,
      stories: true,
      groupSuggestions: true,
      memories: false,
      metaAI: true
    },
    look: {
      shell: true,
      // 2010 header, left nav, right column, footer
      theme: true,
      // 2010 colours, fonts and square corners on every page
      skinPosts: true,
      // 2010 look for Facebook-rendered posts
      fixedHeader: false,
      // 2010's bar scrolled with the page
      font: "lucida",
      // "lucida" | "tahoma"
      welcome: true,
      chat: true,
      rightColumn: true
    },
    advanced: {
      debug: false,
      mainWorldHelper: true,
      stopOnCheckpoint: true
    },
    state: {
      welcomeDismissed: false
    }
  });
  var isPlainObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  function sanitize(input, defaults = DEFAULTS) {
    const out = {};
    const src = isPlainObject(input) ? input : {};
    for (const [key, def] of Object.entries(defaults)) {
      const v = src[key];
      if (isPlainObject(def)) out[key] = sanitize(v, def);
      else if (Array.isArray(def)) out[key] = Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()).slice(0, 200) : [...def];
      else if (typeof v === typeof def) out[key] = v;
      else out[key] = def;
    }
    if (!["auto", "en", "pl"].includes(out.language)) out.language = "auto";
    if (out.feed && !["recent", "top"].includes(out.feed.mode)) out.feed.mode = "recent";
    if (out.feed) out.feed.pageSize = Math.min(30, Math.max(3, Math.round(out.feed.pageSize) || 10));
    if (out.look && !["lucida", "tahoma"].includes(out.look.font)) out.look.font = "lucida";
    return out;
  }
  function deepMerge(base, patch2) {
    if (!isPlainObject(patch2)) return patch2;
    const out = { ...base };
    for (const [k, v] of Object.entries(patch2)) out[k] = isPlainObject(v) && isPlainObject(base[k]) ? deepMerge(base[k], v) : v;
    return out;
  }
  async function createSettings(platform) {
    let current = sanitize(await platform.storage.get(STORAGE_KEY).catch(() => void 0));
    const subs = /* @__PURE__ */ new Set();
    const emit = (prev) => {
      for (const fn of subs) {
        try {
          fn(current, prev);
        } catch (e) {
          console.warn("[MFGA] settings subscriber failed", e);
        }
      }
    };
    platform.storage.onChange((key, value) => {
      if (key !== STORAGE_KEY) return;
      const next = sanitize(value);
      if (JSON.stringify(next) === JSON.stringify(current)) return;
      const prev = current;
      current = next;
      emit(prev);
    });
    return {
      get: () => current,
      async update(patch2) {
        const prev = current;
        current = sanitize(deepMerge(current, patch2));
        await platform.storage.set(STORAGE_KEY, current);
        emit(prev);
        return current;
      },
      async reset() {
        const prev = current;
        current = sanitize({});
        await platform.storage.set(STORAGE_KEY, current);
        emit(prev);
        return current;
      },
      subscribe(fn) {
        subs.add(fn);
        return () => subs.delete(fn);
      }
    };
  }

  // src/shared/i18n.js
  var bundles = { en: /* @__PURE__ */ Object.create(null), pl: /* @__PURE__ */ Object.create(null) };
  var locale = "en";
  function registerStrings(map) {
    for (const [lang, strings] of Object.entries(map)) {
      if (!bundles[lang]) bundles[lang] = /* @__PURE__ */ Object.create(null);
      Object.assign(bundles[lang], strings);
    }
  }
  function setLocale(pref = "auto") {
    if (pref === "en" || pref === "pl") locale = pref;
    else locale = detectFacebookLocale();
    return locale;
  }
  function getLocale() {
    return locale;
  }
  function detectFacebookLocale() {
    const lang = document.documentElement && document.documentElement.lang || navigator.language || "en";
    return /^pl\b/i.test(lang) ? "pl" : "en";
  }
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
  function t(key, vars = {}) {
    const lang = locale;
    let s;
    if (typeof vars.n === "number") {
      const suf = pluralSuffix(vars.n, lang);
      s = bundles[lang][`${key}.${suf}`] ?? bundles.en[`${key}.${pluralSuffix(vars.n, "en")}`];
    }
    s ??= bundles[lang][key] ?? bundles.en[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] != null ? formatVar(vars[k], lang) : `{${k}}`);
  }
  function formatVar(v, lang) {
    if (typeof v === "number") return v.toLocaleString(lang === "pl" ? "pl-PL" : "en-US");
    return String(v);
  }
  function relativeTime(unixSeconds, now = Date.now()) {
    if (!unixSeconds) return "";
    const then = new Date(unixSeconds * 1e3);
    const diff = Math.max(0, Math.round((now - then.getTime()) / 1e3));
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
    const yesterday = new Date(now - 864e5);
    if (then.toDateString() === yesterday.toDateString()) return t("time.yesterday", { time: clock });
    const months = lang === "pl" ? MONTHS_PL : MONTHS_EN;
    const day = then.getDate();
    let date = lang === "pl" ? `${day} ${months[then.getMonth()]}` : `${months[then.getMonth()]} ${day}`;
    if (then.getFullYear() !== today.getFullYear()) date += lang === "pl" ? ` ${then.getFullYear()}` : `, ${then.getFullYear()}`;
    return t("time.date", { date, time: clock });
  }
  function formatClock(d, lang) {
    const mm = String(d.getMinutes()).padStart(2, "0");
    if (lang === "pl") return `${d.getHours()}:${mm}`;
    const h2 = d.getHours() % 12 || 12;
    return `${h2}:${mm}${d.getHours() < 12 ? "am" : "pm"}`;
  }
  var MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var MONTHS_PL = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
  registerStrings({
    en: {
      "time.seconds.one": "a few seconds ago",
      "time.seconds.other": "a few seconds ago",
      "time.minute": "about a minute ago",
      "time.minutes.one": "{n} minute ago",
      "time.minutes.other": "{n} minutes ago",
      "time.hour": "about an hour ago",
      "time.hours.one": "{n} hour ago",
      "time.hours.other": "{n} hours ago",
      "time.yesterday": "Yesterday at {time}",
      "time.date": "{date} at {time}"
    },
    pl: {
      "time.seconds.one": "kilka sekund temu",
      "time.seconds.few": "kilka sekund temu",
      "time.seconds.many": "kilka sekund temu",
      "time.minute": "około minuty temu",
      "time.minutes.one": "{n} minutę temu",
      "time.minutes.few": "{n} minuty temu",
      "time.minutes.many": "{n} minut temu",
      "time.hour": "około godziny temu",
      "time.hours.one": "{n} godzinę temu",
      "time.hours.few": "{n} godziny temu",
      "time.hours.many": "{n} godzin temu",
      "time.yesterday": "Wczoraj o {time}",
      "time.date": "{date} o {time}"
    }
  });

  // src/shared/util.js
  var PREFIX = "[MFGA]";
  var health = {
    counters: /* @__PURE__ */ Object.create(null),
    errors: /* @__PURE__ */ Object.create(null),
    facts: /* @__PURE__ */ Object.create(null),
    disabled: /* @__PURE__ */ new Set(),
    count(key, n = 1) {
      this.counters[key] = (this.counters[key] || 0) + n;
    },
    fact(key, value) {
      this.facts[key] = value;
    },
    error(module, err) {
      const e = this.errors[module] ||= { n: 0, first: null };
      e.n++;
      if (!e.first) e.first = String(err && err.message || err).slice(0, 300);
    },
    snapshot() {
      return {
        counters: { ...this.counters },
        errors: JSON.parse(JSON.stringify(this.errors)),
        facts: JSON.parse(JSON.stringify(this.facts)),
        disabled: [...this.disabled]
      };
    }
  };
  var debugEnabled = false;
  function setDebug(on) {
    debugEnabled = !!on;
  }
  function warn(...args) {
    console.warn(PREFIX, ...args);
  }
  function safe(module, fn, { disableOnError = true } = {}) {
    return function safeWrapped(...args) {
      if (health.disabled.has(module)) return void 0;
      try {
        const r = fn.apply(this, args);
        if (r && typeof r.then === "function") {
          return r.catch((err) => {
            onError(module, err, disableOnError);
            return void 0;
          });
        }
        return r;
      } catch (err) {
        onError(module, err, disableOnError);
        return void 0;
      }
    };
  }
  function onError(module, err, disable) {
    health.error(module, err);
    if (disable) health.disabled.add(module);
    warn(`${module} ${disable ? "disabled" : "error"}:`, err);
  }
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function uuid() {
    if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = b[6] & 15 | 64;
    b[8] = b[8] & 63 | 128;
    const x = [...b].map((v) => v.toString(16).padStart(2, "0")).join("");
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
  }
  function rafBatch(fn) {
    let queued = false;
    return () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fn();
      });
    };
  }
  function onRoot(fn) {
    if (document.documentElement) return fn();
    const mo = new MutationObserver(() => {
      if (document.documentElement) {
        mo.disconnect();
        fn();
      }
    });
    mo.observe(document, { childList: true });
  }
  function onBody(fn) {
    if (document.body) return fn();
    onRoot(() => {
      if (document.body) return fn();
      const mo = new MutationObserver(() => {
        if (document.body) {
          mo.disconnect();
          fn();
        }
      });
      mo.observe(document.documentElement, { childList: true });
    });
  }
  function normLabel(s) {
    return String(s ?? "").normalize("NFKC").toLowerCase().replace(/[͏​-‍⁠﻿­]/g, "").replace(/[·•]/g, " ").replace(/\s+/g, " ").trim();
  }
  function get(obj2, ...path) {
    let o = obj2;
    for (const k of path) {
      if (o == null) return void 0;
      o = o[k];
    }
    return o;
  }

  // src/generated/atlas.js
  var ICONS = { "chat_idle": { "x": 76, "y": 159, "w": 16, "h": 10 }, "chat_offline": { "x": 93, "y": 159, "w": 16, "h": 10 }, "chat_online": { "x": 110, "y": 159, "w": 16, "h": 10 }, "chat_person": { "x": 124, "y": 91, "w": 15, "h": 17 }, "jewel_messages_off": { "x": 227, "y": 111, "w": 20, "h": 15 }, "jewel_messages_on": { "x": 0, "y": 128, "w": 20, "h": 15 }, "jewel_notifications_off": { "x": 176, "y": 91, "w": 16, "h": 16 }, "jewel_notifications_on": { "x": 193, "y": 91, "w": 16, "h": 16 }, "jewel_requests_off": { "x": 140, "y": 91, "w": 17, "h": 16 }, "jewel_requests_on": { "x": 158, "y": 91, "w": 17, "h": 16 }, "logo_big": { "x": 0, "y": 0, "w": 190, "h": 90 }, "logo_header": { "x": 0, "y": 91, "w": 88, "h": 19 }, "misc_addfriend09": { "x": 21, "y": 128, "w": 16, "h": 15 }, "misc_arrow_right": { "x": 194, "y": 159, "w": 10, "h": 4 }, "misc_check": { "x": 14, "y": 159, "w": 13, "h": 11 }, "misc_close": { "x": 175, "y": 159, "w": 8, "h": 7 }, "misc_fb_square": { "x": 82, "y": 144, "w": 14, "h": 14 }, "misc_green_plus": { "x": 127, "y": 159, "w": 10, "h": 10 }, "misc_heart": { "x": 34, "y": 144, "w": 15, "h": 14 }, "misc_lock": { "x": 66, "y": 159, "w": 9, "h": 11 }, "misc_lock_small": { "x": 138, "y": 159, "w": 8, "h": 10 }, "misc_more_arrow": { "x": 147, "y": 159, "w": 9, "h": 9 }, "misc_pencil": { "x": 210, "y": 91, "w": 16, "h": 16 }, "misc_photo09": { "x": 38, "y": 128, "w": 16, "h": 15 }, "misc_status09": { "x": 136, "y": 111, "w": 15, "h": 16 }, "misc_tri_blue_down": { "x": 184, "y": 159, "w": 9, "h": 5 }, "misc_tri_gray_down": { "x": 165, "y": 159, "w": 9, "h": 7 }, "misc_tri_gray_right": { "x": 157, "y": 159, "w": 7, "h": 9 }, "misc_video09": { "x": 223, "y": 144, "w": 15, "h": 12 }, "misc_warning": { "x": 227, "y": 91, "w": 16, "h": 16 }, "misc_x": { "x": 54, "y": 159, "w": 11, "h": 11 }, "nav_ads": { "x": 140, "y": 128, "w": 15, "h": 15 }, "nav_apps": { "x": 0, "y": 111, "w": 16, "h": 16 }, "nav_birthdays": { "x": 50, "y": 144, "w": 15, "h": 14 }, "nav_events": { "x": 152, "y": 111, "w": 15, "h": 16 }, "nav_favorites": { "x": 28, "y": 159, "w": 12, "h": 11 }, "nav_flag": { "x": 188, "y": 128, "w": 13, "h": 15 }, "nav_friends": { "x": 112, "y": 144, "w": 16, "h": 13 }, "nav_games": { "x": 97, "y": 144, "w": 14, "h": 14 }, "nav_games_2010": { "x": 89, "y": 91, "w": 17, "h": 17 }, "nav_globe": { "x": 17, "y": 111, "w": 16, "h": 16 }, "nav_groups": { "x": 202, "y": 128, "w": 16, "h": 14 }, "nav_help": { "x": 168, "y": 111, "w": 15, "h": 16 }, "nav_inbox_envelope": { "x": 34, "y": 111, "w": 16, "h": 16 }, "nav_marketplace": { "x": 51, "y": 111, "w": 16, "h": 16 }, "nav_messages": { "x": 219, "y": 128, "w": 16, "h": 14 }, "nav_messages_blue": { "x": 162, "y": 144, "w": 14, "h": 13 }, "nav_most_recent": { "x": 156, "y": 128, "w": 15, "h": 15 }, "nav_news_feed": { "x": 55, "y": 128, "w": 16, "h": 15 }, "nav_news_feed_2012": { "x": 172, "y": 128, "w": 15, "h": 15 }, "nav_notes": { "x": 129, "y": 144, "w": 16, "h": 13 }, "nav_pages": { "x": 68, "y": 111, "w": 16, "h": 16 }, "nav_photos": { "x": 72, "y": 128, "w": 16, "h": 15 }, "nav_play": { "x": 89, "y": 128, "w": 16, "h": 15 }, "nav_saved": { "x": 146, "y": 144, "w": 15, "h": 13 }, "nav_search": { "x": 85, "y": 111, "w": 16, "h": 16 }, "nav_status": { "x": 102, "y": 111, "w": 16, "h": 16 }, "nav_video": { "x": 239, "y": 144, "w": 15, "h": 12 }, "rc_become_fan": { "x": 106, "y": 128, "w": 16, "h": 15 }, "rc_contact_importer": { "x": 107, "y": 91, "w": 16, "h": 17 }, "rc_event": { "x": 184, "y": 111, "w": 15, "h": 16 }, "rc_friend_request": { "x": 236, "y": 128, "w": 16, "h": 14 }, "rc_friend_suggestion": { "x": 200, "y": 111, "w": 15, "h": 16 }, "rc_gift": { "x": 66, "y": 144, "w": 15, "h": 14 }, "rc_group_invite": { "x": 0, "y": 144, "w": 16, "h": 14 }, "rc_invite": { "x": 119, "y": 111, "w": 16, "h": 16 }, "rc_mobile": { "x": 216, "y": 111, "w": 10, "h": 16 }, "rc_other_requests": { "x": 17, "y": 144, "w": 16, "h": 14 }, "rc_poke": { "x": 123, "y": 128, "w": 16, "h": 15 }, "rc_send_message": { "x": 206, "y": 144, "w": 16, "h": 12 }, "search_glass": { "x": 177, "y": 144, "w": 14, "h": 13 }, "ufi_comment": { "x": 192, "y": 144, "w": 13, "h": 13 }, "ufi_like": { "x": 41, "y": 159, "w": 12, "h": 11 }, "ufi_like_big": { "x": 0, "y": 159, "w": 13, "h": 12 } };
  var ATLAS_URL = "data:image/png;base64,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";

  // src/ui/dom.js
  var SVG_NS = "http://www.w3.org/2000/svg";
  var ALLOWED_PROTOCOLS = /* @__PURE__ */ new Set(["http:", "https:", "mailto:"]);
  function safeUrl(url, base = "https://www.facebook.com/") {
    if (url == null || url === "") return null;
    try {
      const u = new URL(String(url), base);
      return ALLOWED_PROTOCOLS.has(u.protocol) ? u.href : null;
    } catch {
      return null;
    }
  }
  function setProp(el, key, value) {
    if (value == null || value === false) return;
    if (key === "class" || key === "className") {
      el.setAttribute("class", Array.isArray(value) ? value.filter(Boolean).join(" ") : String(value));
    } else if (key === "style" && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (v == null) continue;
        if (k.startsWith("--")) el.style.setProperty(k, String(v));
        else el.style[k] = typeof v === "number" && !/^(opacity|zIndex|flex|fontWeight|lineHeight)$/.test(k) ? `${v}px` : String(v);
      }
    } else if (key === "dataset" && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) if (v != null) el.dataset[k] = String(v);
    } else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "href" || key === "src") {
      const safe2 = safeUrl(value);
      if (safe2) el.setAttribute(key, safe2);
    } else if (key === "text") {
      el.textContent = String(value);
    } else if (value === true) {
      el.setAttribute(key, "");
    } else {
      el.setAttribute(key, String(value));
    }
  }
  function append(el, child) {
    if (child == null || child === false || child === true) return;
    if (Array.isArray(child)) {
      for (const c of child) append(el, c);
    } else if (child instanceof Node) {
      el.appendChild(child);
    } else {
      el.appendChild(document.createTextNode(String(child)));
    }
  }
  function h(tag, props, ...children) {
    if (props instanceof Node || Array.isArray(props) || typeof props !== "object" || props === null) {
      if (props !== void 0 && props !== null) children.unshift(props);
      props = {};
    }
    const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(tag);
    const name = m && m[1] || "div";
    const el = document.createElement(name);
    if (m && m[2]) {
      const classes = [];
      for (const part of m[2].match(/[.#][\w-]+/g) || []) {
        if (part[0] === ".") classes.push(part.slice(1));
        else el.id = part.slice(1);
      }
      if (classes.length) el.setAttribute("class", classes.join(" "));
    }
    for (const [k, v] of Object.entries(props)) {
      if ((k === "class" || k === "className") && el.hasAttribute("class") && v) {
        el.setAttribute("class", `${el.getAttribute("class")} ${Array.isArray(v) ? v.filter(Boolean).join(" ") : v}`);
      } else {
        setProp(el, k, v);
      }
    }
    append(el, children);
    return el;
  }
  function svg(tag, attrs = {}, ...children) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
    append(el, children);
    return el;
  }
  function text(s) {
    return document.createTextNode(s == null ? "" : String(s));
  }
  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }
  function replaceChildren(el, ...children) {
    clear(el);
    append(el, children);
    return el;
  }
  function joinNodes(nodes, sep2 = () => text(" · ")) {
    const out = [];
    nodes.filter(Boolean).forEach((n, i) => {
      if (i) out.push(sep2());
      out.push(n);
    });
    return out;
  }

  // src/ui/icons.js
  var ICON_NAMES = Object.freeze(Object.keys(ICONS));
  function iconCss() {
    const rules = [
      `.mfga-ico{display:inline-block;flex:none;vertical-align:middle;background-image:url("${ATLAS_URL}");background-repeat:no-repeat;image-rendering:auto}`
    ];
    for (const [name, b] of Object.entries(ICONS)) {
      rules.push(`.mfga-ico-${name}{width:${b.w}px;height:${b.h}px;background-position:-${b.x}px -${b.y}px}`);
    }
    return rules.join("\n");
  }
  function icon(name, { label = null, className = "" } = {}) {
    if (!ICONS[name]) throw new Error(`unknown icon ${name}`);
    return h("i", {
      class: ["mfga-ico", `mfga-ico-${name}`, className],
      role: label ? "img" : null,
      "aria-label": label,
      "aria-hidden": label ? null : "true"
    });
  }

  // src/ui/css/base.js
  var FONT_LUCIDA = '"lucida grande", tahoma, verdana, arial, sans-serif';
  var FONT_TAHOMA = 'tahoma, "lucida grande", verdana, arial, sans-serif';
  var FONT = `var(--mfga-font, ${FONT_LUCIDA})`;
  function baseCss() {
    return [rootCss(), linkCss(), buttonCss(), inputCss(), textCss(), boxCss(), countCss(), messageCss(), menuCss(), tooltipCss(), spinnerCss()].join("\n");
  }
  function rootCss() {
    return `
.mfga-ui{--mfga-font:${FONT_LUCIDA};font-family:var(--mfga-font);font-size:11px;font-weight:normal;font-style:normal;line-height:1.28;color:#333;text-align:left;direction:ltr;letter-spacing:normal;color-scheme:light;-webkit-text-size-adjust:100%}
html[data-mfga-font="tahoma"] .mfga-ui{--mfga-font:${FONT_TAHOMA}}
.mfga-ui [hidden]{display:none!important}
.mfga-ui :where(h1,h2,h3,h4,h5,h6,p,ul,ol,li,dl,dt,dd,figure,form,fieldset,legend,blockquote,table,td,th){margin:0;padding:0;border:0}
.mfga-ui :where(h1,h2,h3,h4,h5,h6){color:#333;font-size:13px;font-weight:bold}
.mfga-ui :where(h1){font-size:14px}
.mfga-ui :where(ul,ol){list-style:none}
.mfga-ui :where(table){border-collapse:collapse;border-spacing:0}
.mfga-ui :where(img){border:0}
.mfga-ui :where(button,input,select,textarea){font:inherit;color:inherit;letter-spacing:inherit}
.mfga-ui :where(input[type="checkbox"],input[type="radio"]){margin:0 5px 0 0;vertical-align:middle;accent-color:#3B5998}
.mfga-ui :where(:focus-visible){outline:1px dotted #333;outline-offset:1px}`;
  }
  function linkCss() {
    return `
.mfga-ui :where(a){color:#3B5998;text-decoration:none;cursor:pointer}
.mfga-ui :where(a:hover){text-decoration:underline}`;
  }
  function buttonCss() {
    return `
.mfga-btn{display:inline-block;box-sizing:content-box;margin:0;padding:3px 6px 4px;border:1px solid #AAA;border-bottom-color:#999;border-radius:0;background:#EEE linear-gradient(#F5F5F5,#E3E3E3);box-shadow:inset 0 1px 0 #FAFAFA,0 1px 0 rgba(0,0,0,.1);color:#333;font:bold 11px/13px ${FONT};text-align:center;text-decoration:none;vertical-align:top;white-space:nowrap;cursor:pointer;-webkit-appearance:none;appearance:none}
.mfga-btn:hover{text-decoration:none}
.mfga-btn:active{background:#DDD;border-bottom-color:#AAA;box-shadow:0 1px 0 rgba(0,0,0,.05)}
.mfga-btn+.mfga-btn{margin-left:4px}
.mfga-btn .mfga-ico{margin:-1px 5px -2px -1px;vertical-align:top}
.mfga-btn-confirm{background:#5B74A8;border-color:#29447E #29447E #1A356E;box-shadow:inset 0 1px 0 #8A9CC2,0 1px 0 rgba(0,0,0,.1);color:#FFF}
.mfga-btn-confirm:active{background:#4F6AA3;border-bottom-color:#29447E;box-shadow:inset 0 1px 0 #45619D}
.mfga-btn-small{padding:1px 5px 2px;line-height:12px}
.mfga-btn:disabled,.mfga-btn[aria-disabled="true"]{background:#F2F2F2;border-color:#C8C8C8;box-shadow:none;color:#B8B8B8;cursor:default}
.mfga-btn-confirm:disabled,.mfga-btn-confirm[aria-disabled="true"]{background:#ADBAD4;border-color:#94A2BF;color:#FFF}`;
  }
  function inputCss() {
    return `
.mfga-input,.mfga-textarea{box-sizing:border-box;max-width:100%;margin:0;padding:3px 3px 4px;border:1px solid #BDC7D8;border-radius:0;background:#FFF;color:#333;font:11px/14px ${FONT};box-shadow:none;-webkit-appearance:none;appearance:none}
.mfga-textarea{display:block;padding:3px;resize:vertical}
select.mfga-input{padding:2px;-webkit-appearance:auto;appearance:auto}
.mfga-input::placeholder,.mfga-textarea::placeholder{color:#777;opacity:1}
.mfga-input:focus,.mfga-textarea:focus{outline:none;border-color:#6D84B4}
.mfga-input:disabled,.mfga-textarea:disabled{background:#F2F2F2;color:#999}`;
  }
  function textCss() {
    return `
.mfga-muted{color:#808080}
.mfga-sep{color:#999}
.mfga-sep:empty::before{content:" · ";white-space:pre}`;
  }
  function boxCss() {
    return `
.mfga-box{margin-bottom:15px}
.mfga-box-title{display:flex;align-items:baseline;gap:6px;margin:0;padding:0 0 3px;border-bottom:1px solid #E9E9E9;color:#333;font-size:11px;font-weight:bold;line-height:13px}
.mfga-see-all{margin-left:auto;font-weight:normal;white-space:nowrap}`;
  }
  function countCss() {
    return `
.mfga-pill{display:inline-block;box-sizing:border-box;min-width:14px;padding:0 6px;border-radius:7px;background:#6D84B4;color:#FFF;font-size:11px;font-weight:bold;line-height:14px;text-align:center;vertical-align:middle;white-space:nowrap}
.mfga-badge{display:inline-block;box-sizing:border-box;min-width:13px;padding:0 1px;border:1px solid #D83722;border-top-color:#E23923;border-bottom-color:#C0311E;border-radius:0;background:#F03D25;box-shadow:0 1px 0 rgba(0,39,121,.77);color:#FFF;font-size:9px;font-weight:bold;line-height:11px;text-align:center;white-space:nowrap}`;
  }
  function messageCss() {
    return `
.mfga-notice,.mfga-error{padding:7px 10px;color:#333;line-height:14px}
.mfga-notice{border:1px solid #E2C822;background:#FFF9D7}
.mfga-error{border:1px solid #DD3C10;background:#FFEBE8}`;
  }
  function menuCss() {
    return `
.mfga-menu{box-sizing:border-box;padding:3px 0 4px;border:1px solid #777;border-bottom:2px solid #293E6A;background:#FFF}
.mfga-menu-item{display:block;padding:1px 16px 1px 22px;border:solid #FFF;border-width:1px 0;color:#111;line-height:16px;white-space:nowrap;text-decoration:none;cursor:pointer}
.mfga-menu-item:hover,.mfga-menu-item:focus{background:#6D84B4;border-color:#3B5998;color:#FFF;text-decoration:none;outline:none}
.mfga-menu-sep{margin:5px 7px 6px;padding-top:1px;border-bottom:1px solid #DDD}`;
  }
  function tooltipCss() {
    return `
.mfga-tooltip{position:absolute;z-index:1;padding:4px 8px;background:#282828;color:#FFF;font-size:11px;line-height:14px;white-space:nowrap;pointer-events:none}
.mfga-tooltip::after{content:"";position:absolute;top:100%;left:8px;border:4px solid transparent;border-top-color:#282828;border-bottom:0}`;
  }
  function spinnerCss() {
    const bar = (color) => `linear-gradient(${color},${color})`;
    const on = bar("#6D84B4");
    const off = bar("#C4CDE0");
    const frame = (i) => `background-image:${[0, 1, 2].map((b) => b === i ? on : off).join(",")};background-size:${[0, 1, 2].map((b) => b === i ? "4px 11px" : "4px 7px").join(",")}`;
    return `
.mfga-spinner{display:inline-block;width:16px;height:11px;vertical-align:middle;background-repeat:no-repeat;background-position:0 50%,6px 50%,12px 50%;${frame(0)};animation:mfga-spinner .75s step-end infinite}
@keyframes mfga-spinner{0%{${frame(0)}}33.333%{${frame(1)}}66.667%{${frame(2)}}}`;
  }

  // src/ui/css/theme.js
  var FONT_STACKS = Object.freeze({
    lucida: '"lucida grande", tahoma, verdana, arial, sans-serif',
    tahoma: 'tahoma, "lucida grande", verdana, arial, sans-serif'
  });
  var rem = (px) => `${px / 16}rem`;
  var COLORS = {
    // Surfaces: flat white page and cards.
    "--web-wash": "#FFFFFF",
    "--surface-background": "#FFFFFF",
    "--card-background": "#FFFFFF",
    "--card-background-flat": "#FFFFFF",
    "--card-background-filled": "#F2F2F2",
    "--popover-background": "#FFFFFF",
    "--messenger-card-background": "#FFFFFF",
    "--wash": "#F2F2F2",
    "--background-deemphasized": "#F2F2F2",
    "--search-input-background": "#FFFFFF",
    "--input-background": "#FFFFFF",
    "--input-background-disabled": "#F2F2F2",
    // UFI / comments: the 2010 light blue box.
    "--comment-background": "#EDEFF4",
    "--fds-comment-background": "#EDEFF4",
    "--comment-footer-background": "#EDEFF4",
    "--highlight-bg": "#EDEFF4",
    "--new-notification-background": "#EDEFF4",
    "--nav-list-selected-accent": "#D8DFEA",
    "--nav-list-selected-accent-text": "#333333",
    "--hover-overlay": "rgba(59, 89, 152, 0.08)",
    // Text.
    "--primary-text": "#333333",
    "--fds-primary-text": "#333333",
    "--secondary-text": "#808080",
    "--placeholder-text": "#777777",
    "--section-header-text": "#333333",
    "--disabled-text": "#999999",
    "--primary-icon": "#333333",
    "--fds-primary-icon": "#333333",
    "--secondary-icon": "#808080",
    "--placeholder-icon": "#777777",
    "--disabled-icon": "#999999",
    // Links and accents: Facebook blue.
    "--blue-link": "#3B5998",
    "--accent": "#3B5998",
    "--text-highlight": "#3B5998",
    "--fds-blue-60": "#3B5998",
    "--tab-underline-color": "#3B5998",
    "--focus-ring-blue": "#6D84B4",
    "--border-selected": "#3B5998",
    // Rules and borders.
    "--divider": "#E9E9E9",
    "--card-border-color": "#E9E9E9",
    "--list-border-color": "#E9E9E9",
    "--border-unfocused": "#E9E9E9",
    "--input-border-color": "#BDC7D8",
    "--secondary-button-stroke": "#999999",
    "--popover-border-color": "rgba(0, 0, 0, 0.45)",
    // Buttons: blue confirm, grey plain.
    "--primary-button-background": "#5B74A8",
    "--primary-button-pressed": "#4F6AA3",
    "--primary-button-text": "#FFFFFF",
    "--primary-button-icon": "#FFFFFF",
    "--primary-deemphasized-button-background": "#EDEFF4",
    "--primary-deemphasized-button-text": "#3B5998",
    "--secondary-button-background": "#EEEEEE",
    "--secondary-button-background-floating": "#EEEEEE",
    "--secondary-button-text": "#333333",
    "--button-filled-secondary-background": "#EEEEEE",
    "--button-filled-secondary-text": "#333333",
    "--disabled-button-background": "#F2F2F2",
    "--disabled-button-text": "#999999",
    "--notification-badge": "#F03D25",
    "--badge-background-color-red": "#F03D25",
    // Fades over the white 2010 page.
    "--nav-bar-background-gradient": "linear-gradient(to top, #FFFFFF, rgba(255,255,255,.9), rgba(255,255,255,.7), rgba(255,255,255,.4), rgba(255,255,255,0))",
    "--nav-bar-background-gradient-wash": "linear-gradient(to top, #FFFFFF, rgba(255,255,255,.9), rgba(255,255,255,.7), rgba(255,255,255,.4), rgba(255,255,255,0))"
  };
  var BLUE_FILTER = "invert(31%) sepia(43%) saturate(776%) hue-rotate(182deg) brightness(96%) contrast(91%)";
  var FILTERS = {
    "--filter-accent": BLUE_FILTER,
    "--filter-primary-accent": BLUE_FILTER,
    "--filter-blue-link-icon": BLUE_FILTER,
    "--filter-primary-icon": "invert(20%)",
    "--filter-secondary-icon": "invert(50.2%)",
    "--filter-placeholder-icon": "invert(46.7%)",
    "--filter-disabled-icon": "invert(60%)"
  };
  var DARK_ROOT_LIGHT = {
    "--fds-black": "#000000",
    "--fds-blue-05": "#ECF3FF",
    "--fds-blue-30": "#AAC9FF",
    "--fds-blue-40": "#77A7FF",
    "--fds-blue-70": "#2851A3",
    "--fds-blue-80": "#1D3C78",
    "--fds-button-text": "#444950",
    "--fds-dark-mode-gray-35": "#CCCCCC",
    "--fds-dark-mode-gray-50": "#828282",
    "--fds-dark-mode-gray-70": "#4A4A4A",
    "--fds-dark-mode-gray-80": "#373737",
    "--fds-dark-mode-gray-90": "#282828",
    "--fds-dark-mode-gray-100": "#1C1C1C",
    "--fds-gray-00": "#F5F6F7",
    "--fds-gray-05": "#F2F3F5",
    "--fds-gray-10": "#EBEDF0",
    "--fds-gray-20": "#DADDE1",
    "--fds-gray-25": "#CCD0D5",
    "--fds-gray-30": "#BEC3C9",
    "--fds-gray-45": "#8D949E",
    "--fds-gray-70": "#606770",
    "--fds-gray-80": "#444950",
    "--fds-gray-90": "#303338",
    "--fds-gray-100": "#1C1E21",
    "--fds-green-55": "#00A400",
    "--fds-green-65": "#51CE70",
    "--fds-highlight": "#3578E5",
    "--fds-highlight-cell-background": "#ECF3FF",
    "--fds-red-55": "#FA383E",
    "--fds-spectrum-aluminum-tint-70": "#E4F0F6",
    "--fds-spectrum-blue-gray-tint-70": "#CFD1D5",
    "--fds-spectrum-cherry": "#F35369",
    "--fds-spectrum-cherry-tint-70": "#FBCCD2",
    "--fds-spectrum-grape-tint-70": "#DDD5F0",
    "--fds-spectrum-grape-tint-90": "#F4F1FA",
    "--fds-spectrum-lemon-dark-1": "#F5C33B",
    "--fds-spectrum-lemon-tint-70": "#FEF2D1",
    "--fds-spectrum-lime": "#A3CE71",
    "--fds-spectrum-lime-tint-70": "#E4F0D5",
    "--fds-spectrum-orange-tint-70": "#FCDEC5",
    "--fds-spectrum-orange-tint-90": "#FEF4EC",
    "--fds-spectrum-seafoam-tint-70": "#CAEEF9",
    "--fds-spectrum-slate-dark-2": "#89A1AC",
    "--fds-spectrum-slate-tint-70": "#EAEFF2",
    "--fds-spectrum-teal": "#6BCEBB",
    "--fds-spectrum-teal-dark-1": "#4DBBA6",
    "--fds-spectrum-teal-dark-2": "#31A38D",
    "--fds-spectrum-teal-tint-70": "#D2F0EA",
    "--fds-spectrum-teal-tint-90": "#F0FAF8",
    "--fds-spectrum-tomato": "#FB724B",
    "--fds-spectrum-tomato-tint-30": "#F38E7B",
    "--fds-spectrum-tomato-tint-90": "#FDEFED",
    "--fds-unified-blue-35": "#1455B0",
    "--fds-unified-gray-20": "#323436",
    "--fds-white": "#FFFFFF",
    "--fds-yellow-20": "#FFBA00",
    "--attachment-footer-background": "rgba(17, 17, 18, 0.1)",
    "--text-badge-info-background": "hsl(214, 89%, 52%)",
    "--border-focused": "#686A6E",
    "--dataviz-blue-secondary": "#043B72",
    "--divider-on-color": "#CED0D4",
    "--event-date": "#D31130",
    "--fb-wordmark": "#0866FF",
    "--filter-primary-deemphasized-button-icon": "invert(28%) sepia(100%) saturate(6042%) hue-rotate(202deg) brightness(96%) contrast(101%)",
    "--glimmer-base-opaque": "#979A9F",
    "--glimmer-high-contrast-base-opaque": "#65686C",
    "--glimmer-opacity-high-contrast-max": "1",
    "--glimmer-opacity-high-contrast-min": "0.08",
    "--glimmer-spinner-icon": "#65676B",
    "--hero-banner-background": "#FFFFFF",
    "--hosted-view-selected-state": "#434648",
    "--inverse-text": "#F3F4F5",
    "--list-cell-chevron": "#686A6E",
    "--media-inner-border": "rgba(17, 17, 18, 0.1)",
    "--media-outer-border": "#FFFFFF",
    "--media-pressed": "rgba(17, 17, 18, 0.3)",
    "--messenger-card-box-shadow": "0px 1px 2px 0px #0000001A",
    "--messenger-reply-background": "#F0F2F5",
    "--negative": "#D31130",
    "--non-media-pressed": "rgba(17, 17, 18, 0.15)",
    "--placeholder-image": "#E0E2E4",
    "--positive": "#147B29",
    "--positive-background": "#DEEFE1",
    "--press-overlay": "rgba(0, 0, 0, 0.10)",
    "--primary-deemphasized-button-pressed": "rgb(0,0,0,.05)",
    "--primary-deemphasized-button-pressed-overlay": "rgb(0,0,0,.1)",
    "--progress-ring-neutral-background": "rgba(0, 0, 0, 0.2)",
    "--progress-ring-neutral-foreground": "#000000",
    "--progress-ring-blue-background": "rgba(24, 119, 242, 0.2)",
    "--progress-ring-blue-foreground": "hsl(214, 89%, 52%)",
    "--progress-ring-disabled-background": "rgba(190,195,201, 0.2)",
    "--progress-ring-disabled-foreground": "#BEC3C9",
    "--rating-star-active": "#EB660D",
    "--scroll-thumb": "#BCC0C4",
    "--secondary-button-background-on-dark": "rgba(0, 0, 0, 0.4)",
    "--shadow-inset": "rgba(255, 255, 255, 0.5)",
    "--switch-active": "#0064E0",
    "--switch-inactive": "#8F9296",
    "--switch-unchecked-background-color": "#8F9297",
    "--input-label-color-highlighted": "hsl(214, 89%, 52%)",
    "--text-input-bar-background": "rgba(255, 255, 255, 0.2)",
    "--text-input-outside-label": "#000000",
    "--toggle-active-background": "#111112",
    "--toggle-active-icon": "#F3F4F5",
    "--toggle-active-text": "#F3F4F5",
    "--toggle-button-active-background": "#E7F3FF",
    "--warning": "#965E03",
    "--chat-bubble-emphasis-ring-after": "black",
    "--chat-bubble-emphasis-ring-before": "white",
    "--chat-text-blockquote-color-background-line": "rgba(0, 0, 0, 0.12)",
    "--chat-incoming-message-bubble-background-color": "#F0F0F0",
    "--chat-replied-message-background-color": "rgba(0, 0, 0, 0.03)",
    "--blue-secondary": "rgb(4,59,114)",
    "--blue-tertiary": "rgb(235,245,255)",
    "--chartreuse-secondary": "rgb(50,65,19)",
    "--chartreuse-tertiary": "rgb(226,255,152)",
    "--cyan-secondary": "rgb(15,63,93)",
    "--cyan-tertiary": "rgb(231,245,255)",
    "--dataviz-secondary-1": "rgb(83,78,191)",
    "--dataviz-secondary-2": "rgb(103,96,228)",
    "--dataviz-supplementary-4": "rgb(51,51,52)",
    "--fuschia-secondary": "rgb(118,14,62)",
    "--fuschia-tertiary": "rgb(255,241,246)",
    "--green-secondary": "rgb(26,68,27)",
    "--green-tertiary": "rgb(227,250,224)",
    "--magenta-secondary": "rgb(96,36,91)",
    "--magenta-tertiary": "rgb(255,239,254)",
    "--orange-secondary": "rgb(94,49,14)",
    "--orange-tertiary": "rgb(255,241,239)",
    "--purple-secondary": "rgb(55,50,121)",
    "--purple-tertiary": "rgb(245,241,255)",
    "--red-secondary": "rgb(118,22,27)",
    "--red-tertiary": "rgb(255,241,239)",
    "--teal-secondary": "rgb(10,68,56)",
    "--teal-tertiary": "rgb(227,247,241)",
    "--yellow-secondary": "rgb(72,59,12)",
    "--yellow-tertiary": "rgb(255,246,161)",
    "--emphasized-card-background-blue-comet": "linear-gradient(rgb(192,223,255),rgb(210,232,255))",
    "--emphasized-card-background-green-comet": "linear-gradient(rgb(185,245,170),rgb(205,250,195))",
    "--emphasized-card-background-purple-comet": "linear-gradient(rgb(210, 210, 255),rgb(225,225,253))",
    "--emphasized-card-background-teal-comet": "linear-gradient(rgb(165,240,230),rgb(195,245,240))",
    "--secondary-emphasized-button-stroke": "rgb(0,100,224)",
    "--stepper-active": "#111112",
    "--stepper-inactive": "#8F9296",
    "--badge-attention-background-color": "#FAEBA4",
    "--badge-cancelled-background-color": "#B5B7BB",
    "--badge-critical-background-color": "#FEE4E6",
    "--badge-informational-background-color": "#DBECFF",
    "--badge-neutral-background-color": "#E9EAEB",
    "--badge-pending-background-color": "#B3B0FE",
    "--badge-success-background-color": "#DAF0D4",
    "--button-blur-background-adaptive": "rgba(243, 244, 245, 0.7)",
    "--button-blur-background-adaptive-blurred": "rgba(243, 244, 245, 0.7)",
    "--button-blur-icon-adaptive": "#111112",
    "--button-blur-spinner-progress-adaptive": "#111112",
    "--button-blur-spinner-track-adaptive": "rgba(17, 17, 18, 0.15)",
    "--button-blur-text-adaptive": "#111112",
    "--button-filled-secondary-icon": "#28292B",
    "--button-tonal-destructive-background": "#FFF0F2",
    "--button-tonal-destructive-icon": "#D31130",
    "--button-tonal-destructive-text": "#D31130",
    "--button-tonal-primary-background": "#ECF5FF",
    "--button-tonal-primary-icon": "#0457CB",
    "--button-tonal-primary-text": "#0457CB",
    "--chip-background-selected": "#28292B",
    "--dot-active": "#111112",
    "--dot-inactive": "#8F9296",
    "--fb-app-wordmark": "#1877F2",
    "--glimmer": "#383B3D",
    "--glimmer-on-white-background": "#383B3D",
    "--primary-button-background-on-color": "#FFFFFF",
    "--primary-button-icon-on-color": "#111112",
    "--primary-button-text-on-color": "#111112",
    "--progress-ring-default-track": "#D1D3D5",
    "--progress-ring-on-color-button-progress": "#111112",
    "--progress-ring-on-color-button-track": "#D1D3D5",
    "--progress-ring-on-ghost-primary-button-progress": "#0064E0",
    "--progress-ring-on-ghost-primary-button-track": "rgba(0, 100, 224, 0.15)",
    "--progress-ring-on-ghost-secondary-button-progress": "#111112",
    "--progress-ring-on-ghost-secondary-button-track": "rgba(17, 17, 18, 0.15)",
    "--progress-ring-on-neutral-background-progress": "#111112",
    "--progress-ring-on-neutral-background-track": "#D1D3D5",
    "--progress-ring-on-outline-destructive-button-progress": "#D31130",
    "--progress-ring-on-outline-destructive-button-track": "#FFD8DB",
    "--progress-ring-on-outline-primary-button-progress": "#0064E0",
    "--progress-ring-on-outline-primary-button-track": "#D1D3D5",
    "--progress-ring-on-outline-secondary-button-progress": "#111112",
    "--progress-ring-on-outline-secondary-button-track": "#D1D3D5",
    "--progress-ring-on-primary-destructive-button-progress": "#F3F4F5",
    "--progress-ring-on-primary-destructive-button-track": "#AA071E",
    "--progress-ring-on-secondary-button-track": "rgba(17, 17, 18, 0.15)",
    "--progress-ring-on-tonal-destructive-button-progress": "#D31130",
    "--progress-ring-on-tonal-destructive-button-track": "#FFD8DB",
    "--progress-ring-on-tonal-primary-button-progress": "#0457CB",
    "--progress-ring-on-tonal-primary-button-track": "#CBE5FF",
    "--secondary-button-background-experimental-v1": "#F3F4F5",
    "--secondary-button-background-on-color": "#E9EAEB",
    "--secondary-button-icon-on-color": "#111112",
    "--secondary-button-text-on-color": "#111112",
    "--secondary-button-text-variant-3": "#28292B",
    "--secondary-destructive-button-background": "rgba(255, 255, 255, 0.2)",
    "--secondary-destructive-button-icon": "#D31130",
    "--secondary-destructive-button-stroke": "#D31130",
    "--secondary-destructive-button-text": "#D31130",
    "--segmented-control-indicator-background": "#FFFFFF",
    "--segmented-control-pressed": "rgba(0, 0, 0, 0.08)",
    "--segmented-control-track-background": "rgba(143, 146, 150, 0.1)",
    "--slider-handle": "#0064E0",
    "--slider-handle-disabled": "#A1A4A8",
    "--slider-track-filled": "#0064E0",
    "--slider-track-filled-disabled": "#A1A4A8",
    "--slider-track-unfilled": "#8F9296",
    "--slider-track-unfilled-disabled": "#E0E2E4",
    "--text-input-border-focus": "#686A6E",
    "--text-input-label-focus": "#686A6E",
    "--tile-tonal-container-background-blue": "#ECF5FF",
    "--tile-tonal-container-background-elevated": "#F3F4F5",
    "--tile-tonal-container-background-green": "#E9F8E5",
    "--tile-tonal-container-background-orange": "#FFF2E4",
    "--tile-tonal-container-background-purple": "#F3F3FE",
    "--tile-tonal-container-background-rose": "#FFF0F6",
    "--tile-tonal-container-background-teal": "#E5F7F4",
    "--tile-tonal-container-background-yellow": "#FBF5CF",
    "--tile-tonal-icon-blue": "#0457CB",
    "--tile-tonal-icon-container-background-blue": "#CBE5FF",
    "--tile-tonal-icon-container-background-elevated": "#F3F4F5",
    "--tile-tonal-icon-container-background-green": "#C6ECBD",
    "--tile-tonal-icon-container-background-orange": "#FFDBB9",
    "--tile-tonal-icon-container-background-purple": "#DFDFFF",
    "--tile-tonal-icon-container-background-rose": "#FCD9E5",
    "--tile-tonal-icon-container-background-teal": "#B7ECE4",
    "--tile-tonal-icon-container-background-yellow": "#F7E27F",
    "--tile-tonal-icon-green": "#076D29",
    "--tile-tonal-icon-orange": "#A13F04",
    "--tile-tonal-icon-purple": "#6B1EFD",
    "--tile-tonal-icon-rose": "#BB0844",
    "--tile-tonal-icon-teal": "#0F686F",
    "--tile-tonal-icon-yellow": "#8A5001",
    "--tile-tonal-text-blue": "#0457CB",
    "--tile-tonal-text-green": "#076D29",
    "--tile-tonal-text-orange": "#A13F04",
    "--tile-tonal-text-purple": "#6B1EFD",
    "--tile-tonal-text-rose": "#BB0844",
    "--tile-tonal-text-teal": "#0F686F",
    "--tile-tonal-text-yellow": "#8A5001",
    "--toggle-off-icon": "#8F9296",
    "--toggle-on-icon": "#0064E0",
    "--variant-1-input-field-experimental": "#28292B",
    "--variant-3-input-field-secondary-experimental": "#DBECFF",
    "--variants-input-field-blue-experimental": "#0064E0"
  };
  var RADII = {
    "--card-corner-radius": "0px",
    "--card-container-radius": "0px",
    "--card-media-inset-radius": "0px",
    "--dialog-corner-radius": "0px",
    "--alert-banner-corner-radius": "0px",
    "--image-corner-radius": "0px",
    "--media-corner-radius": "0px",
    "--media-card-corner-radius": "0px",
    "--media-small-corner-radius": "0px",
    "--media-large-corner-radius": "0px",
    "--glimmer-corner-radius": "0px",
    "--comment-bubble": "0px",
    "--input-corner-radius": "0px",
    "--input-dense-corner-radius": "0px",
    "--nav-list-cell-corner-radius": "0px",
    "--nav-list-cell-corner-radius-dense": "0px",
    "--list-cell-corner-radius": "0px",
    "--menu-item-base-overlay-radius": "0px",
    "--messenger-card-corner-radius": "0px",
    "--button-corner-radius": "2px",
    "--button-corner-radius-medium": "2px",
    "--button-corner-radius-large": "2px",
    "--button-small-corner-radius": "2px",
    "--button-medium-corner-radius": "2px",
    "--button-large-corner-radius": "2px",
    "--chip-corner-radius": "2px",
    "--segmented-control-corner-radius": "2px",
    "--text-badge-corner-radius": "2px",
    "--tooltip-corner-radius": "3px",
    "--toast-corner-radius": "3px"
  };
  var SHADOWS = {
    "--card-box-shadow": "none",
    "--shadow-base": "none",
    "--shadow-emphasis": "none",
    "--shadow-elevated": "none",
    "--shadow-persistent": "none",
    "--shadow-responsive": "none",
    "--shadow-1": "transparent",
    "--shadow-2": "transparent",
    "--scroll-shadow": "none",
    "--popover-border-width": "1px",
    "--popover-border-style": "solid"
  };
  var TYPE_SCALE = [
    ["body", 13, 1.2308],
    ["body-emphasized", 13, 1.2308],
    ["body-medium", 13, 1.2308],
    ["body-medium-emphasized", 13, 1.2308],
    ["body-large", 13, 1.2308],
    ["body-large-emphasized", 13, 1.2308],
    ["body-small", 11, 1.28],
    ["body-small-emphasized", 11, 1.28],
    ["meta", 11, 1.28],
    ["meta-emphasized", 11, 1.28],
    ["primary-label", 11, 1.28],
    ["primary-label-emphasized", 11, 1.28],
    ["secondary-label", 11, 1.28],
    ["secondary-label-emphasized", 11, 1.28],
    ["tertiary-label", 11, 1.28],
    ["label-large", 13, 1.2308],
    ["label-large-emphasized", 13, 1.2308],
    ["label-medium", 11, 1.28],
    ["label-medium-emphasized", 11, 1.28],
    ["label-small", 11, 1.28],
    ["label-small-emphasized", 11, 1.28],
    ["label-extra-small", null],
    ["label-extra-small-emphasized", null],
    ["headline1", 16, 1.25],
    ["headline2", 16, 1.25],
    ["headline3", 13, 1.2308],
    ["headline-large", 16, 1.25],
    ["headline-medium", 16, 1.25],
    ["headline-small", 13, 1.2308],
    ["headline-extra-small", 13, 1.2308],
    ["display-large", null],
    ["display-medium", null],
    ["display-small", null],
    ["display-extra-small", null],
    ["display1", null]
  ];
  var FAMILY_ONLY = ["--font-family-default", "--font-family-apple", "--font-family-segoe", "--font-family-system-fds", "--text-input-label-font-family"];
  function typeTokens(stack2) {
    const out = {};
    for (const name of FAMILY_ONLY) out[name] = stack2;
    for (const [prefix, px, lineHeight] of TYPE_SCALE) {
      out[`--${prefix}-font-family`] = stack2;
      if (px == null) continue;
      out[`--${prefix}-font-size`] = rem(px);
      out[`--${prefix}-line-height`] = String(lineHeight);
    }
    out["--text-input-field-font-family"] = stack2;
    out["--text-input-field-font-size"] = rem(11);
    out["--text-input-field-line-height"] = "1.28";
    out["--text-input-label-font-size"] = rem(11);
    return out;
  }
  function rootSelector(extra = "") {
    const base = `html[data-mfga-theme]${extra}`;
    return `${base}, ${base}.__fb-light-mode, ${base}.__fb-dark-mode, ${base} .__fb-light-mode`;
  }
  var block = (selector, tokens) => `${selector} {
${Object.entries(tokens).map(([k, v]) => `  ${k}: ${v} !important;`).join("\n")}
}`;
  function themeCss(settings) {
    if (settings?.look?.theme === false) return "";
    const font = FONT_STACKS[settings?.look?.font] ? settings.look.font : "lucida";
    return [
      block("html[data-mfga-theme].__fb-dark-mode", DARK_ROOT_LIGHT),
      block(rootSelector(), { ...COLORS, ...FILTERS, ...RADII, ...SHADOWS, ...typeTokens(FONT_STACKS[font]) }),
      // html[data-mfga-font] (set at runtime) wins over the stored setting.
      ...Object.entries(FONT_STACKS).map(
        ([name, stack2]) => block(rootSelector(`[data-mfga-font="${name}"]`), Object.fromEntries(Object.entries(typeTokens(stack2)).filter(([k]) => k.endsWith("font-family"))))
      ),
      `html[data-mfga-theme] body { background: var(--web-wash); color: var(--primary-text); }`
    ].join("\n");
  }

  // src/ui/css/native.js
  registerStrings({
    en: { "clean.like": "Like", "clean.comment": "Comment", "clean.share": "Share" },
    pl: { "clean.like": "Lubię to!", "clean.comment": "Komentarz", "clean.share": "Udostępnij" }
  });
  var cssString = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
  var HIDE = `[aria-posinset]:has(> [data-mfga-hide]), [data-mfga-hide] { display: none !important; }`;
  var S = "html[data-mfga-skin]";
  var P = (part) => `${S} [data-mfga-part="${part}"]`;
  var IN = (part) => `[data-mfga-part="${part}"]`;
  function skinRules() {
    return `
${S} { --mfga-indent: 58px; }
${S} [aria-posinset]:not([role]) {
  border-bottom: 1px solid #E9E9E9;
  --card-corner-radius: 0px; --card-box-shadow: none; --shadow-base: none; --shadow-2: transparent;
  --comment-background: #EDEFF4; --comment-bubble: 0px;
}

${P("avatar")} { flex: none !important; }
${P("avatar")} svg { width: 50px !important; height: 50px !important; border-radius: 0 !important; }
${P("avatar")} svg g[mask] { mask: none !important; }
${P("avatar")} svg image { x: 0; y: 0; width: 50px !important; height: 50px !important; }
${P("avatar")} svg g > :not(image), ${P("avatar")} svg > circle { display: none !important; }
${P("avatar")} img { width: 50px !important; height: 50px !important; border-radius: 0 !important; object-fit: cover; }

${P("name")} :is(h2, h3, h4), ${P("name")} :is(h2, h3, h4) * { font-size: 13px !important; line-height: 16px !important; }
${P("name")} a, ${P("name")} a * { color: #3B5998 !important; font-weight: bold !important; }
${P("name")} a:hover { text-decoration: underline !important; }

${P("byline")}, ${P("byline")} * { font-size: 11px !important; line-height: 14px !important; color: #808080 !important; }
${P("byline")} a:hover { text-decoration: underline !important; }

${P("message")} { margin-inline-start: var(--mfga-indent) !important; }
${P("message")}, ${P("message")} * { font-size: 13px !important; line-height: 16px !important; color: #333 !important; }
${P("message")} a, ${P("message")} a *, ${P("message")} [role="button"] { color: #3B5998 !important; font-weight: normal !important; }

${P("attachment")} { margin-inline: calc(var(--mfga-indent) + 16px) 16px !important; }
${P("attachment")} * { border-radius: 0 !important; }
/* Shared posts and reels inside an attachment: square avatars and blue names, like the post's own header. */
${P("attachment")} svg g[mask] { mask: none !important; }
${P("attachment")} svg g[mask] > :not(image) { display: none !important; }
${P("attachment")} [data-ad-rendering-role="profile_name"] a, ${P("attachment")} [data-ad-rendering-role="profile_name"] a * {
  color: #3B5998 !important; font-weight: bold !important;
}

${P("actions")} {
  display: flex !important; flex-wrap: wrap !important; justify-content: flex-start !important; align-items: center !important;
  gap: 0 !important; margin: 0 0 0 var(--mfga-indent) !important; padding: 3px 0 !important; border: 0 !important; min-height: 0 !important;
}
${P("actions")} > * { flex: none !important; width: auto !important; margin: 0 !important; padding: 0 !important; }
${P("actions")} [role="button"]:not([data-mfga-action]):not([data-mfga-part="summary"] [role="button"]) { display: none !important; }
${S} [data-mfga-action] {
  display: inline-flex !important; align-items: center !important; padding: 0 !important; margin: 0 !important;
  min-height: 0 !important; height: auto !important; background: none !important; border: 0 !important; border-radius: 0 !important; cursor: pointer;
}
${S} [data-mfga-action], ${S} [data-mfga-action] * { color: #3B5998 !important; font-size: 11px !important; line-height: 14px !important; font-weight: normal !important; }
${S} [data-mfga-action] * { gap: 0 !important; margin: 0 !important; padding: 0 !important; }
${S} [data-mfga-action] i[data-visualcompletion="css-img"], ${S} [data-mfga-action] [role="none"], ${S} [data-mfga-action] svg {
  display: none !important;
}
${S} [data-mfga-action]:hover { text-decoration: underline !important; }
${S} [data-mfga-action="comment"]::before, ${S} [data-mfga-action="share"]::before {
  content: "\\00B7"; display: inline-block; padding: 0 5px; color: #999; text-decoration: none;
}
${S} [data-mfga-action][data-mfga-count] > * { display: none !important; }
${S} [data-mfga-action="like"][data-mfga-count]::after { content: ${cssString(t("clean.like"))}; }
${S} [data-mfga-action="comment"][data-mfga-count]::after { content: ${cssString(t("clean.comment"))}; }
${S} [data-mfga-action="share"][data-mfga-count]::after { content: ${cssString(t("clean.share"))}; }

${P("summary")}, ${P("comments")}, ${P("composer")} {
  background: #EDEFF4 !important; margin: 2px 0 0 var(--mfga-indent) !important; border: 0 !important; border-radius: 0 !important;
}
${P("summary")} { padding: 5px !important; justify-content: flex-start !important; gap: 0 12px !important; }
/* 2010 order: "Like · Comment · Share" first, then the light-blue box (likes, comments, composer). */
${P("footer")} { display: flex !important; flex-direction: column !important; }
${P("footer")} > ${IN("summary")} { order: 1; }
${P("actions")} ${IN("summary")} { flex: 1 1 100% !important; margin-left: 0 !important; }
${P("summary")}, ${P("summary")} *, ${P("comments")}, ${P("comments")} *, ${P("composer")} * {
  font-size: 11px !important; line-height: 14px !important;
}
${P("summary")} :is(img, svg) { width: 13px !important; height: 13px !important; }
${P("summary")} a, ${P("summary")} a *, ${P("comments")} a, ${P("comments")} a * { color: #3B5998 !important; }

${P("comments")} { padding: 0 !important; }
${P("comments")} [role="article"] { padding: 5px 5px 4px !important; border-top: 2px solid #FFFFFF; gap: 7px !important; }
${P("comments")} [role="article"] * { padding: 0 !important; }
${P("comments")} li [role="button"] { color: #3B5998 !important; font-weight: normal !important; }
${P("comments")} li a, ${P("comments")} li a * { color: #808080 !important; font-weight: normal !important; }
${P("comments")} *, ${P("composer")} * { border-radius: 0 !important; }
${P("comments")} svg g[mask], ${P("composer")} svg g[mask] { mask: none !important; }
${P("comments")} svg:has(image), ${P("composer")} svg:has(image) { width: 32px !important; height: 32px !important; }
${P("comments")} svg image, ${P("composer")} svg image { x: 0; y: 0; width: 32px !important; height: 32px !important; }
${P("comments")} svg g > :not(image), ${P("composer")} svg g > :not(image) { display: none !important; }

${P("composer")} { padding: 5px !important; }
${P("composer")} :not([role="textbox"]) { padding: 0 !important; }
${P("composer")}:has(form) > :not(form):not(:has(form)) { display: none !important; }
${P("composer")} [role="textbox"] {
  background: #FFFFFF !important; border: 1px solid #BDC7D8 !important; padding: 3px !important;
  min-height: 14px !important; color: #333 !important;
}
`;
  }
  function nativeCss(settings) {
    return settings?.look?.skinPosts === false ? HIDE : `${HIDE}
${skinRules()}`;
  }

  // src/ui/shell/grid.js
  var GRID = Object.freeze({
    page: 980,
    // centred page container
    bar: 41,
    // blue bar height (2010: no bottom border)
    top: 20,
    // gap between the bar and the columns' content
    left: { x: 0, w: 179 },
    // left column, then the 1px #CCC separator at x=179
    content: { x: 195, w: 520 },
    // centre column (#contentArea)
    wide: { x: 195, w: 680 },
    // centre column without a right column (groups feed): Facebook's own feed width
    right: { x: 730, w: 233 },
    // right column
    rule: 979,
    // 1px #EDEDED page rule
    footerGap: 20
    // space between the tallest column and the footer
  });
  function pageLeft(viewportWidth) {
    return Math.max(0, (viewportWidth - GRID.page) / 2);
  }
  function mainSlot(mode, viewportWidth) {
    const col = mode === "home" ? GRID.content : mode === "groups-feed" ? GRID.wide : null;
    if (!col) return null;
    return { left: pageLeft(viewportWidth) + col.x, top: GRID.bar + GRID.top, width: col.w };
  }

  // src/ui/css/shell.js
  var FONT2 = '"lucida grande", tahoma, verdana, arial, sans-serif';
  var FONT_TAHOMA2 = 'tahoma, "lucida grande", verdana, arial, sans-serif';
  var S2 = "#mfga-shell";
  var FOOTER_HEIGHT = 70;
  var COLUMN_ROUTES = ['html[data-mfga-route="home"]', 'html[data-mfga-route="groups-feed"]'];
  var onColumns = (sel) => COLUMN_ROUTES.map((r) => `${r} ${sel}`).join(",");
  function facebookCss() {
    const g = GRID;
    return `
html[data-mfga-shell],html[data-mfga-shell] .__fb-light-mode,html[data-mfga-shell] .__fb-dark-mode{--header-height:${g.bar}px!important}
html[data-mfga-shell]:not([data-mfga-native-banner]) div[id^="mount_"] [role="banner"]:not([role="dialog"] *){visibility:hidden!important;height:0!important;min-height:0!important;pointer-events:none!important}
html[data-mfga-shell] [role="banner"] :is([role="dialog"],[role="menu"],[role="listbox"],[role="tooltip"]){visibility:visible!important;pointer-events:auto!important}
${onColumns("[data-mfga-chrome]")}{visibility:hidden!important;pointer-events:none!important}
html[data-mfga-shell] [data-mfga-pass]{pointer-events:none!important}
:where(html[data-mfga-shell] [data-mfga-pass]>:not([data-mfga-pass])){pointer-events:auto}
${onColumns("[data-mfga-pass]")}{background:transparent!important;overflow:visible!important}
${onColumns("[data-mfga-main]")}{box-sizing:border-box!important;min-width:0!important;margin-left:0!important;margin-right:0!important;position:relative!important;left:var(--mfga-main-dx,0px)!important;top:var(--mfga-main-dy,0px)!important}
html[data-mfga-route="home"] [data-mfga-main]{width:${g.content.w}px!important;max-width:${g.content.w}px!important;flex:0 0 ${g.content.w}px!important}
html[data-mfga-route="groups-feed"] [data-mfga-main]{width:${g.wide.w}px!important;max-width:${g.wide.w}px!important;flex:0 0 ${g.wide.w}px!important}
`;
  }
  function baseCss2() {
    const g = GRID;
    return `
${S2}{position:absolute;top:0;left:0;right:0;height:0;direction:ltr;font-family:${FONT2};font-size:11px;line-height:1.28;color:#333;text-align:left}
html[data-mfga-font="tahoma"] ${S2}{font-family:${FONT_TAHOMA2}}
html:not([data-mfga-shell]) ${S2}{display:none}
${S2} *{box-sizing:content-box}
${S2} a{color:#3B5998;text-decoration:none;cursor:pointer}
${S2} a:hover{text-decoration:underline}
${S2} ul{list-style:none;margin:0;padding:0}
${S2} button{font:inherit;color:inherit;margin:0}
${S2} [hidden]{display:none!important}
${S2} .mfga-shell-backdrop,${S2} .mfga-shell-sep,${S2} .mfga-shell-rule{position:absolute;top:${g.bar}px;height:calc(var(--mfga-footer-top,100vh) - ${g.bar}px)}
${S2} .mfga-shell-backdrop{left:0;right:0;z-index:0;background:#fff;padding-bottom:${FOOTER_HEIGHT}px}
${S2} .mfga-shell-page{position:absolute;top:0;left:max(0px,calc(50% - ${g.page / 2}px));width:${g.page}px;height:0}
${S2} .mfga-shell-sep{left:${g.left.w}px;width:1px;z-index:0;background:#CCC}
${S2} .mfga-shell-rule{left:${g.rule}px;width:1px;z-index:0;background:#EDEDED}
html[data-mfga-route="page"] ${S2} :is(.mfga-shell-backdrop,.mfga-shell-sep,.mfga-shell-rule,.mfga-shell-left,.mfga-shell-right),
html[data-mfga-route="groups-feed"] ${S2} :is(.mfga-shell-rule,.mfga-shell-right){display:none}
`;
  }
  function headerCss() {
    const g = GRID;
    return `
${S2} .mfga-header{position:absolute;top:0;left:0;right:0;min-width:${g.page}px;height:${g.bar}px;z-index:0;background:#3B5998}
html[data-mfga-fixed-header] ${S2} .mfga-header{position:fixed;z-index:1}
html[data-mfga-fixed-header]:has([role="dialog"]:not([role="banner"] *)) ${S2} .mfga-header{z-index:0}
html[data-mfga-native-banner] ${S2} .mfga-header{visibility:hidden}
${S2} .mfga-header.mfga-header-open{z-index:2}
${S2} .mfga-header-page{position:relative;width:${g.page}px;height:${g.bar}px;margin:0 auto}
${S2} .mfga-header-logo{position:absolute;left:0;top:15px;display:block;width:88px;height:19px}
${S2} .mfga-header-logo .mfga-ico{display:block}
${S2} .mfga-header-jewel{position:absolute;top:10px;display:flex;align-items:center;justify-content:center;width:24px;height:30px}
${S2} .mfga-header-jewel:hover{background:#4B67A1;text-decoration:none}
${S2} .mfga-header-jewel-requests{left:97px}
${S2} .mfga-header-jewel-messages{left:122px}
${S2} .mfga-header-jewel-notifications{left:146px}
${S2} .mfga-header-count{position:absolute;top:-2px;left:10px;min-width:11px;height:11px;padding:0 1px;border:1px solid #D83722;border-top-color:#E23923;border-bottom-color:#C0311E;background:#F03D25;box-shadow:0 1px 0 rgba(0,39,121,.77);color:#fff;font:bold 9px/11px ${FONT2};text-align:center}
${S2} .mfga-header-nav{position:absolute;left:${g.left.w}px;top:11px;width:${g.page - g.left.w - 1}px;height:30px;border:solid #2E4F8E;border-width:0 1px;background:#627AAD;box-shadow:inset 1px 0 #5873AA,inset -1px 0 #5873AA,inset 0 -1px #536EA7}
${S2} .mfga-header-search{position:absolute;left:4px;top:3px;display:flex;width:298px;height:21px;border:1px solid #536EA7;border-right-color:#44629E;border-bottom-color:#536DA6;background:#fff}
${S2} .mfga-header-search-input{flex:1;min-width:0;height:21px;margin:0;padding:0 0 0 4px;border:0;outline:0;background:#fff;box-shadow:inset 0 1px #D3DBE5;color:#333;font:11px ${FONT2}}
html[data-mfga-font="tahoma"] ${S2} .mfga-header-search-input{font-family:${FONT_TAHOMA2}}
${S2} .mfga-header-search-input::placeholder{color:#777;opacity:1}
${S2} .mfga-header-search-btn{display:flex;align-items:center;justify-content:center;width:20px;height:21px;padding:0;border:0;border-left:1px solid #F5F5F5;background:#fff;box-shadow:inset 0 1px #EDF2F5,inset 0 -1px #CFD8E7;cursor:pointer}
${S2} .mfga-header-links{position:absolute;top:0;right:0;display:flex;height:30px}
${S2} .mfga-header-link{display:block;height:30px;padding:0 11px;border:0;background:none;color:#fff;font-weight:bold;line-height:29px;white-space:nowrap;cursor:pointer}
${S2} a.mfga-header-link:hover,${S2} button.mfga-header-link:hover{background:#4B67A1;text-decoration:none}
${S2} .mfga-header-arrow{display:inline-block;width:0;height:0;margin-left:5px;vertical-align:1px;border-top:4px solid #fff;border-left:4px solid transparent;border-right:4px solid transparent}
${S2} .mfga-header-account{position:relative}
${S2} .mfga-open .mfga-header-account-btn,${S2} .mfga-open .mfga-header-account-btn:hover{position:relative;z-index:2;height:31px;background:#fff;color:#333;box-shadow:inset 1px 0 #333,inset -1px 0 #333,inset 0 1px #333}
${S2} .mfga-open .mfga-header-arrow{border-top-color:#333}
${S2} .mfga-header-menu{position:absolute;top:30px;right:0;z-index:1;min-width:200px;max-width:400px;padding:4px 0;border:1px solid #333;border-bottom-width:2px;background:#fff}
${S2} .mfga-header-menu-item{display:block;box-sizing:border-box;width:100%;height:20px;padding:0 22px;border:solid #fff;border-width:1px 0;background:#fff;color:#222;line-height:18px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
${S2} .mfga-header-menu-item:hover,${S2} .mfga-header-menu-item:focus-visible{border-color:#3B5998;background:#6D84B4;color:#fff;text-decoration:none;outline:none}
${S2} .mfga-header-menu-sep{height:1px;margin:5px 7px 6px;background:#DDD}
`;
  }
  function leftCss() {
    const g = GRID;
    return `
${S2} .mfga-shell-left{position:absolute;left:${g.left.x}px;top:${g.bar + g.top}px;z-index:0;width:${g.left.w}px}
${S2} .mfga-nav-me{position:relative;height:50px;margin:3px 0 7px}
${S2} .mfga-nav-me-pic{position:absolute;left:0;top:0;display:block;width:50px;height:50px;background:#EDEFF4}
${S2} .mfga-nav-me-pic img{display:block;width:50px;height:50px;object-fit:cover}
${S2} .mfga-nav-me-text{position:absolute;left:58px;top:-3px;right:4px;line-height:14px}
${S2} .mfga-nav-me-name{display:block;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${S2} .mfga-nav-me-view{display:block}
${S2} .mfga-nav-link{position:relative;display:block;min-height:17px;padding:3px 8px 0 28px;border-bottom:1px solid #fff;color:#333;line-height:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${S2} .mfga-nav-link:hover{background:#EFF2F7;text-decoration:none}
${S2} .mfga-nav-selected .mfga-nav-link{margin-right:-1px;background:#D8DFEA;font-weight:bold}
${S2} .mfga-nav-sub{margin:0;padding:0;list-style:none}
${S2} .mfga-nav-sub .mfga-nav-link{padding-left:46px}
${S2} .mfga-nav-sub .mfga-nav-icon{left:24px}
${S2} .mfga-nav-icon{position:absolute;left:6px;top:3px;display:flex;align-items:center;justify-content:center;width:16px;height:16px}
${S2} .mfga-nav-pic{display:block;width:16px;height:16px;object-fit:cover}
${S2} .mfga-nav-count{color:#808080;font-weight:normal}
${S2} .mfga-nav-arrow{margin-left:6px;vertical-align:0}
${S2} .mfga-nav-sep{width:172px;height:1px;margin:7px 0 13px 6px;background:#EEE}
${S2} .mfga-nav-more{display:block;padding:4px 0 1px 6px;border:0;background:none;color:#3B5998;line-height:13px;cursor:pointer}
${S2} .mfga-nav-more:hover{text-decoration:underline}
${S2} .mfga-nav-more-arrow{margin-left:4px;vertical-align:2px}
${S2} .mfga-nav-title{padding:0 0 5px 6px;color:#808080;font-weight:bold;line-height:13px}
${S2} .mfga-nav-go-online{display:inline-block;margin-left:6px;line-height:14px}
`;
  }
  function rightCss() {
    const g = GRID;
    return `
${S2} .mfga-shell-right{position:absolute;left:${g.right.x}px;top:${g.bar + g.top}px;z-index:0;width:${g.right.w}px}
${S2} .mfga-rc-box{margin-bottom:15px}
${S2} .mfga-rc-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;padding-bottom:3px;border-bottom:1px solid #E9E9E9;line-height:13px}
${S2} .mfga-rc-title{margin:0;color:#333;font-size:11px;font-weight:bold}
${S2} .mfga-rc-action{padding:0;border:0;background:none;color:#3B5998;line-height:13px;cursor:pointer}
${S2} .mfga-rc-action:hover{text-decoration:underline}
${S2} .mfga-rc-row{position:relative;display:block;min-height:20px;padding-left:20px;line-height:20px}
${S2} .mfga-rc-row>.mfga-ico{position:absolute;left:0;top:4px}
${S2} .mfga-rc-event{min-height:15px;line-height:15px}
${S2} .mfga-rc-event>.mfga-ico{top:1px}
${S2} .mfga-rc-event:first-child{margin-top:4px}
${S2} .mfga-rc-when{color:#808080;font-size:9px}
${S2} .mfga-rc-text{min-height:16px;margin:3px 0 7px;line-height:13px}
${S2} .mfga-rc-text>.mfga-ico{top:0}
${S2} .mfga-rc-note{margin:4px 0 0;color:#808080;line-height:13px}
`;
  }
  function footerCss() {
    const g = GRID;
    return `
${S2} .mfga-footer{position:absolute;top:var(--mfga-footer-top,100vh);left:${g.left.w}px;z-index:0;width:${g.page - g.left.w}px;height:${FOOTER_HEIGHT}px;overflow:hidden;color:#737373;background:#fff}
html[data-mfga-route="page"] ${S2} .mfga-footer{left:0;width:${g.page}px}
${S2} .mfga-footer-curve{height:8px;border-left:1px solid #CCC;border-bottom:1px solid #CCC}
html[data-mfga-route="page"] ${S2} .mfga-footer-curve{border-left:0}
${S2} .mfga-footer-inner{display:flex;justify-content:space-between;gap:16px;padding:8px 8px 38px;border-top:1px solid #EEE;line-height:14px;white-space:nowrap}
${S2} .mfga-footer-lang{padding:0;border:0;background:none;color:#3B5998;cursor:pointer}
${S2} .mfga-footer-lang:hover{text-decoration:underline}
${S2} .mfga-footer-links{text-align:right}
${S2} .mfga-chat-tab{position:fixed;right:15px;bottom:0;z-index:0;display:flex;align-items:center;gap:4px;width:188px;height:25px;padding:0 5px;border:1px solid rgba(164,164,164,.48);border-bottom:0;background:linear-gradient(#F7F7F7,#DDD);color:#333;font-weight:bold;text-align:left;cursor:pointer}
${S2} .mfga-chat-tab:hover{background:linear-gradient(#FFF,#E5E5E5)}
`;
  }
  function shellCss() {
    return [facebookCss(), baseCss2(), headerCss(), leftCss(), rightCss(), footerCss()].join("");
  }

  // src/ui/css/stream.js
  var BLUE = "#3B5998";
  var UFI_BG = "#EDEFF4";
  var rootRules = `
.mfga-stream *,.mfga-story,.mfga-story *,.mfga-stream *::before,.mfga-stream *::after{box-sizing:border-box}
.mfga-stream img{max-width:none}
.mfga-linkbtn{display:inline;margin:0;padding:0;border:0;background:none;font:inherit;line-height:inherit;color:${BLUE};text-align:left;cursor:pointer}
.mfga-linkbtn:hover{text-decoration:underline}
.mfga-time{color:#808080;text-decoration:none;border:0;cursor:inherit}
.mfga-pic-blank{display:block}
`;
  var headerRules = `
.mfga-feed-header{position:relative;height:20px;margin:0 0 20px;line-height:20px}
.mfga-feed-ico{position:absolute;left:0;top:3px}
.mfga-stream .mfga-feed-title{margin:0 0 0 22px;padding:0;font-size:16px;font-weight:normal;line-height:20px;color:#333}
.mfga-feed-modes{position:absolute;right:0;top:0;font-size:13px;line-height:20px;white-space:nowrap}
.mfga-feed-mode-on,.mfga-feed-dot{font-weight:bold;color:#333}
.mfga-feed-modes .mfga-feed-pill{vertical-align:top;margin:4px 0 0 5px}
.mfga-feed-composer{height:29px;margin:0 0 1px;padding:5px 6px 6px;border:1px solid #DBDBDB;border-bottom-color:#D3D3D3;box-shadow:inset 0 1px 0 #F5F5F5;background:#fff;color:#777;font-size:13px;line-height:16px;cursor:text;overflow:hidden;white-space:nowrap}
`;
  var storyRules = `
.mfga-story{position:relative;padding:9px 0 10px;border-bottom:1px solid #F7F7F7}
.mfga-story-pic{position:absolute;left:0;top:9px;display:block;width:50px;height:50px;overflow:hidden;background:#F0F2F7}
.mfga-story-pic img,.mfga-story-pic svg{display:block;width:50px;height:50px;object-fit:cover}
.mfga-story-body{min-height:50px;margin-left:60px}
.mfga-story-msg{font-size:13px;line-height:16px;color:#333;overflow-wrap:break-word}
.mfga-story-actor{font-weight:bold}
.mfga-story-text{white-space:pre-line}
.mfga-story-arrow{display:inline-block;width:0;height:0;margin:0 1px 1px;border-left:5px solid #6D84B4;border-top:4px solid transparent;border-bottom:4px solid transparent;vertical-align:middle}
.mfga-story-title{margin-top:2px;font-size:13px;font-weight:bold;line-height:16px;color:#333;overflow-wrap:break-word}
.mfga-story-meta{margin-top:3px;font-size:11px;line-height:14px;color:#808080}
.mfga-story-time,.mfga-story-time .mfga-time,.mfga-story-ai{color:#808080}
.mfga-story-shared{margin-top:6px;padding:1px 0 1px 10px;border-left:2px solid #CCC}
.mfga-story-shared .mfga-story-meta{margin-top:2px}
.mfga-story-attachments{margin-top:6px}
`;
  var attachmentRules = `
.mfga-att+.mfga-att{margin-top:6px}
.mfga-att-photos{display:flex;flex-wrap:wrap;gap:4px}
.mfga-att-photo{position:relative;display:block;padding:3px;border:1px solid #CCC;background:#fff;line-height:0}
.mfga-att-photo:hover{border-color:${BLUE}}
.mfga-att-photo img{display:block;object-fit:cover;background:#F2F2F2}
.mfga-att-grid .mfga-att-photo img{width:100px;height:100px}
.mfga-att-more{position:absolute;top:3px;right:3px;bottom:3px;left:3px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);color:#fff;font-size:16px;font-weight:bold;line-height:1}
.mfga-att-photo:hover .mfga-att-more{text-decoration:underline}
.mfga-att-video-thumb{position:relative;display:block;overflow:hidden;background:#000;line-height:0;cursor:pointer}
.mfga-att-video-thumb img{display:block;width:100%;height:100%;object-fit:cover}
.mfga-att-play{position:absolute;left:5px;bottom:5px;width:35px;height:26px;border:1px solid rgba(255,255,255,.7);border-radius:3px;background:rgba(0,0,0,.7)}
.mfga-att-play::after{content:"";position:absolute;left:13px;top:6px;border-left:10px solid #fff;border-top:6px solid transparent;border-bottom:6px solid transparent}
.mfga-att-video-thumb:hover .mfga-att-play{background:${BLUE}}
.mfga-att-live{position:absolute;left:5px;top:5px;padding:0 4px;background:#F03D25;color:#fff;font-size:9px;font-weight:bold;line-height:13px}
.mfga-att-player{display:block;max-width:100%;background:#000}
.mfga-att-caption{margin-top:3px;color:#808080}
.mfga-att-link,.mfga-att-event{display:flex;align-items:flex-start;line-height:14px}
.mfga-att-link-img{flex:none;display:block;margin-right:10px;line-height:0}
.mfga-att-link-img img{display:block;max-width:90px;max-height:90px}
.mfga-att-link-body{flex:1;min-width:0;overflow-wrap:break-word}
.mfga-att-title{font-weight:bold}
.mfga-att-source{color:#808080}
.mfga-att-desc{margin-top:2px;color:#808080}
.mfga-att-event-ico{margin:0 6px 0 0}
.mfga-att-unavailable{padding:7px 10px;border:1px solid #CCC;background:#F2F2F2;color:#808080;line-height:14px}
.mfga-att-unavailable-title{font-weight:bold;color:#333}
`;
  var ufiRules = `
.mfga-ufi{width:355px;max-width:100%;margin-top:2px;line-height:14px}
.mfga-ufi-nub{display:block;width:0;height:0;margin:0 0 -2px 16px;border:5px solid transparent;border-top:0;border-bottom-color:${UFI_BG}}
.mfga-ufi-item{margin-top:2px;padding:5px 5px 4px;background:${UFI_BG};line-height:14px;overflow-wrap:break-word}
.mfga-ufi-likes,.mfga-ufi-viewall{display:flex;align-items:flex-start}
.mfga-ufi-likes .mfga-ufi-ico{margin:1px 6px 0 0}
.mfga-ufi-viewall{padding-bottom:5px}
.mfga-ufi-viewall .mfga-ufi-ico{margin:2px 6px 0 1px}
.mfga-ufi-viewall .mfga-ufi-spinner{margin:1px 0 0 6px}
.mfga-ufi-comment{display:flex;align-items:flex-start}
.mfga-ufi-pic{flex:none;display:block;width:32px;height:32px;margin-right:7px;overflow:hidden;background:#F0F2F7}
.mfga-ufi-pic img,.mfga-ufi-pic svg{display:block;width:32px;height:32px;object-fit:cover}
.mfga-ufi-comment-body{flex:1;min-width:0;padding-top:1px}
.mfga-ufi-comment-text{line-height:13px;white-space:pre-line}
.mfga-ufi-actor{font-weight:bold;white-space:normal}
.mfga-ufi-comment-meta{margin-top:3px;line-height:14px;color:#777}
.mfga-ufi-comment-meta .mfga-time{color:#777}
.mfga-ufi-comment-like{margin:-2px 0 0 1px}
.mfga-ufi-add{display:flex;align-items:flex-start;padding:4px 5px}
.mfga-ufi-me{display:none}
.mfga-ufi-add-active .mfga-ufi-me{display:block}
.mfga-ufi-add-body{flex:1;min-width:0}
.mfga-ufi-input{display:block;width:100%;height:22px;min-height:22px;margin:0;padding:3px;border:1px solid #CBD3E0;border-radius:0;background:#fff;color:#333;font-family:inherit;font-size:11px;line-height:14px;resize:none;overflow:hidden;outline:none;box-shadow:none}
.mfga-ufi-input::placeholder{color:#777;opacity:1}
.mfga-ufi-add-active .mfga-ufi-input{min-height:32px;border-color:#BDC7D8}
.mfga-ufi-add-actions{display:none;margin-top:4px;text-align:right}
.mfga-ufi-add-active .mfga-ufi-add-actions{display:block}
.mfga-busy .mfga-ufi-input{color:#999;background:#F7F7F7}
.mfga-busy .mfga-ufi-submit{opacity:.6;cursor:default}
.mfga-ufi-item.mfga-ufi-error{padding-left:5px;border-left:2px solid #AAA7A2;background:#F2F2F2;color:#111}
`;
  var footerRules = `
.mfga-feed-footer{margin-top:10px}
.mfga-feed-more{display:block;width:100%;margin:0;padding:7px 10px 8px;border:0;border-top:1px solid #D8DFEA;background:${UFI_BG};color:${BLUE};font:inherit;font-weight:bold;line-height:14px;text-align:left;cursor:pointer}
.mfga-feed-more:hover{background:#D8DFEA}
.mfga-feed-more-arrow{display:inline-block;width:0;height:0;margin:0 6px 2px 0;border-top:5px solid ${BLUE};border-left:4px solid transparent;border-right:4px solid transparent;vertical-align:middle}
.mfga-feed-more.mfga-loading{text-align:center;cursor:default}
.mfga-feed-more.mfga-loading:hover{background:${UFI_BG}}
.mfga-feed-empty{padding:20px 10px;color:#808080;text-align:center}
.mfga-feed-empty-title{margin-bottom:4px;font-size:13px;color:#333}
.mfga-feed-end{padding:10px;color:#808080;text-align:center}
.mfga-feed-footer .mfga-feed-error{line-height:22px}
.mfga-feed-status{margin-top:8px;color:#808080;text-align:center}
`;
  var welcomeRules = `
.mfga-welcome{margin:0 0 23px;padding:14px 20px 13px;border:1px solid #E1E5EE;background:${UFI_BG}}
.mfga-welcome-head{display:flex;align-items:flex-start;justify-content:space-between}
.mfga-stream .mfga-welcome-title{margin:0;padding:0;font-size:16px;font-weight:normal;line-height:20px;color:#333}
.mfga-welcome-close{flex:none;margin-left:10px;line-height:14px}
.mfga-welcome-main{display:flex;align-items:flex-start;margin-top:14px}
.mfga-stream .mfga-welcome-steps{flex:1;min-width:0;margin:6px 0 0;padding:0;list-style:none}
.mfga-welcome-step{display:flex;align-items:flex-start;margin:0 0 10px;line-height:14px}
.mfga-welcome-step:last-child{margin-bottom:0}
.mfga-welcome-num{flex:none;width:15px;height:16px;margin-right:8px;background:#A6B2CA;color:#fff;font-weight:bold;line-height:16px;text-align:center}
.mfga-welcome-learn{display:inline-block;margin-top:12px;font-size:13px;font-weight:bold;line-height:16px}
.mfga-welcome-arrow{display:inline-block;width:0;height:0;margin:0 0 2px 5px;border-left:4px solid ${BLUE};border-top:4px solid transparent;border-bottom:4px solid transparent;vertical-align:middle}
.mfga-welcome-mini{position:relative;flex:none;display:block;width:175px;height:113px;margin-right:21px;border:1px solid #E1E3EB;background:#fff;overflow:hidden}
.mfga-welcome-mini i{position:absolute;display:block}
.mfga-welcome-mini .mfga-welcome-block{position:static;background:#E3E3E3}
.mfga-welcome-mini-bar{left:0;top:0;width:100%;height:6px;background:${BLUE}}
.mfga-welcome-mini-logo{left:4px;top:2px;width:18px;height:2px;background:#C3CDE0}
.mfga-welcome-mini-search{left:41px;top:1px;width:46px;height:4px;background:#fff}
.mfga-welcome-mini-left{left:0;top:6px;bottom:0;width:39px;padding:5px 4px;border-right:1px solid #E3E3E3;background:#F3F3F3}
.mfga-welcome-mini-left .mfga-welcome-pic{width:10px;height:10px;margin-bottom:8px}
.mfga-welcome-mini-left .mfga-welcome-nav{width:28px;height:3px;margin-bottom:4px}
.mfga-welcome-mini-center{left:44px;top:11px;width:73px}
.mfga-welcome-mhead.mfga-welcome-block{width:18px;height:3px;margin-bottom:3px;background:#ACACAD}
.mfga-welcome-composer.mfga-welcome-block{height:5px;margin-bottom:4px;border:1px solid #D3D3D3;background:#fff}
.mfga-welcome-mini .mfga-welcome-mini-story{position:static;display:flex;gap:3px;margin-bottom:4px}
.mfga-welcome-mini-story .mfga-welcome-pic{flex:none;width:8px;height:8px}
.mfga-welcome-mini-story .mfga-welcome-lines{flex:1;height:12px}
.mfga-welcome-mini-right{left:126px;top:11px;width:42px}
.mfga-welcome-mini-right .mfga-welcome-box{height:14px;margin-bottom:6px}
.mfga-welcome-marker{position:absolute;width:11px;height:12px;background:#EF504F;color:#fff;font-size:9px;font-weight:bold;line-height:12px;text-align:center}
.mfga-welcome-m1{left:49px;top:58px}
.mfga-welcome-m2{left:95px;top:3px}
.mfga-welcome-m3{left:150px;top:0}
`;
  function streamCss() {
    return [rootRules, headerRules, storyRules, attachmentRules, ufiRules, footerRules, welcomeRules].join("").trim();
  }

  // src/ui/dialog/dialog-css.js
  function dialogCss() {
    return [frameCss(), settingsCss(), healthCss(), aboutCss()].join("\n");
  }
  function frameCss() {
    return `
.mfga-dialog-layer{position:fixed;inset:0;z-index:2147483000;overflow-y:auto;overscroll-behavior:contain;background:rgba(252,252,252,.55)}
.mfga-dialog{box-sizing:border-box;max-width:calc(100vw - 20px);margin:125px auto 40px;padding:10px;border-radius:8px;background:rgba(82,82,82,.7);outline:none}
@media (max-height:700px){.mfga-dialog{margin-top:20px}}
.mfga-dialog-content{background:#FFF}
.mfga-dialog-title{margin:0;padding:5px 10px;border:1px solid #3B5998;border-bottom:0;background:#6D84B4;color:#FFF;font-size:14px;font-weight:bold;line-height:17px}
.mfga-dialog-body{padding:10px;border:1px solid #555;border-top:0;border-bottom-color:#CCC}
.mfga-dialog-footer{display:flex;align-items:center;justify-content:flex-end;padding:8px 10px;border:1px solid #555;border-top:0;background:#F2F2F2}
.mfga-dialog-note{margin-right:auto;color:#808080;line-height:17px}`;
  }
  function settingsCss() {
    return `
.mfga-settings-tabs{display:flex;gap:3px;margin:0 -10px;padding:0 10px;border-bottom:1px solid #898989}
.mfga-settings-tab{position:relative;bottom:-1px;margin:0;padding:3px 8px 4px;border:1px solid #D8DFEA;border-bottom:0;border-radius:0;background:#D8DFEA;color:#3B5998;font-weight:bold;line-height:13px;cursor:pointer}
.mfga-settings-tab:hover{border-color:#627AAD;background:#627AAD;color:#FFF}
.mfga-settings-tab[aria-selected="true"]{border-color:#898989;background:#FFF;color:#333;cursor:default;padding-bottom:5px}
.mfga-settings-panel{box-sizing:border-box;height:360px;max-height:calc(100vh - 290px);min-height:160px;margin:0 -10px -10px;padding:12px 10px 10px;overflow-y:auto}
.mfga-settings-intro{margin:0 0 10px}
.mfga-settings-row{display:grid;grid-template-columns:120px minmax(0,1fr);column-gap:10px;padding:0 0 9px}
.mfga-settings-label{padding-top:2px;color:#666;font-weight:bold;text-align:right}
.mfga-settings-field{min-width:0}
.mfga-settings-check{display:flex;align-items:flex-start;gap:5px;padding:2px 0;color:#333;cursor:pointer}
.mfga-settings-check input{flex:none;margin:0}
.mfga-settings-check-inline{display:inline-flex;margin-right:14px}
.mfga-settings-hint{margin:1px 0 2px;color:#808080}
.mfga-settings-check+.mfga-settings-hint{margin-left:18px}
.mfga-settings-sub{margin-left:18px}
.mfga-settings-off{opacity:.5;cursor:default}
.mfga-settings-off .mfga-settings-check{cursor:default}
.mfga-settings-inline-error{margin:3px 0 0;color:#DD3C10}
.mfga-settings-keywords{width:100%;height:64px}
.mfga-settings-font-lucida{font-family:${FONT_LUCIDA}}
.mfga-settings-font-tahoma{font-family:${FONT_TAHOMA}}`;
  }
  function healthCss() {
    return `
.mfga-health-status{margin:0 0 8px}
.mfga-health-actions{display:flex;align-items:flex-start;margin:0 0 6px}
.mfga-btn.mfga-health-reset{margin-left:auto}
.mfga-health-exported{margin:0 0 10px;color:#333}
.mfga-health-exported:empty{display:none}
.mfga-health-section{margin:12px 0 0}
.mfga-health-section>.mfga-box-title{margin-bottom:4px}
.mfga-health-areas{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:16px}
.mfga-health-areas .mfga-box{margin-bottom:10px}
.mfga-health-table{width:100%;table-layout:fixed}
.mfga-health-table th{padding:2px 6px 2px 0;color:#666;font-weight:bold;text-align:left}
.mfga-health-table td{padding:1px 6px 1px 0;vertical-align:top;overflow-wrap:anywhere}
.mfga-health-table .mfga-health-num{width:50px;padding-right:12px;text-align:right;white-space:nowrap}
.mfga-health-table .mfga-health-num:last-child{padding-right:0}
.mfga-health-errors th:first-child{width:110px}
.mfga-health-table tr+tr td{border-top:1px solid #F2F2F2}
.mfga-health-total{margin-left:auto;color:#808080;font-weight:normal}`;
  }
  function aboutCss() {
    return `
.mfga-about-head{display:flex;align-items:baseline;gap:8px;margin:0 0 10px}
.mfga-about-name{color:#3B5998;font-size:16px;font-weight:bold}
.mfga-about-section{margin:0 0 12px}
.mfga-about-section>.mfga-box-title{margin-bottom:5px}
.mfga-about-section p+p{margin-top:6px}
.mfga-about-list li{padding:1px 0 1px 12px;text-indent:-12px}
.mfga-about-list li::before{content:"\\25AA";display:inline-block;width:12px;text-indent:0;color:#3B5998}
.mfga-about-legal{color:#808080}`;
  }

  // src/ui/dialog/dialog.js
  registerStrings({
    en: { "dialog.close": "Close", "dialog.cancel": "Cancel" },
    pl: { "dialog.close": "Zamknij", "dialog.cancel": "Anuluj" }
  });
  var FOCUSABLE = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type=hidden])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");
  var stack = [];
  var seq = 0;
  function tabbables(root) {
    return [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0 && isRadioTabStop(el, root));
  }
  function isRadioTabStop(el, root) {
    if (el.type !== "radio" || !el.name) return true;
    const group = [...root.querySelectorAll(`input[type=radio][name="${CSS.escape(el.name)}"]`)];
    return el === (group.find((r) => r.checked) || group[0]);
  }
  function openDialog({ title, body, buttons = [], width = 465, note = null, focus = null, onClose = null, className = null }) {
    const id = `mfga-dialog-${++seq}`;
    const opener = document.activeElement;
    let closed = false;
    const dispose = (restoreFocus) => {
      if (closed) return;
      closed = true;
      stack.splice(stack.indexOf(handle), 1);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("keydown", onStrayKeyDown, true);
      layer.remove();
      if (restoreFocus && opener && opener.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
      if (onClose) safe("dialog", onClose, { disableOnError: false })();
    };
    const handle = { close: () => dispose(true) };
    const detached = () => {
      if (layer.isConnected) return false;
      dispose(false);
      return true;
    };
    const isTop = () => stack[stack.length - 1] === handle;
    const footerButtons = (buttons?.length ? buttons : [{ label: t("dialog.close") }]).map((b) => renderButton(b, handle));
    const dialog = h(
      "div.mfga-dialog",
      { class: className, role: "dialog", "aria-modal": "true", "aria-labelledby": `${id}-title`, tabindex: "-1", style: { width } },
      h(
        "div.mfga-dialog-content",
        h("h2.mfga-dialog-title", { id: `${id}-title` }, title),
        h("div.mfga-dialog-body", body),
        h("div.mfga-dialog-footer", note ? h("div.mfga-dialog-note", note) : null, footerButtons)
      )
    );
    const layer = h("div.mfga-ui.mfga-dialog-layer", { dataset: { mfgaDialog: id } }, dialog);
    function onKeyDown(ev) {
      ev.stopPropagation();
      if (!isTop()) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        handle.close();
      } else if (ev.key === "Tab") {
        trapTab(ev, dialog);
      }
    }
    function onFocusIn(ev) {
      if (detached()) return;
      if (isTop() && !dialog.contains(ev.target)) focusFirst(dialog);
    }
    function onStrayKeyDown(ev) {
      if (ev.defaultPrevented || ev.target !== document.body && ev.target !== document.documentElement) return;
      if (!detached()) onKeyDown(ev);
    }
    let downOnLayer = false;
    layer.addEventListener("mousedown", (ev) => {
      downOnLayer = ev.target === layer;
      if (downOnLayer) ev.preventDefault();
    });
    layer.addEventListener("click", (ev) => {
      if (ev.target === layer && downOnLayer && isTop()) handle.close();
    });
    layer.addEventListener("keydown", onKeyDown);
    layer.addEventListener("keyup", stopPropagation);
    layer.addEventListener("keypress", stopPropagation);
    stack.push(handle);
    document.body.appendChild(layer);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("keydown", onStrayKeyDown, true);
    if (focus && dialog.contains(focus)) focus.focus({ preventScroll: true });
    else focusFirst(dialog);
    return handle;
  }
  function stopPropagation(ev) {
    ev.stopPropagation();
  }
  function renderButton({ label, primary = false, onClick = null }, handle) {
    return h(
      "button.mfga-btn",
      {
        type: "button",
        class: primary ? "mfga-btn-confirm" : null,
        onclick: safe(
          "dialog",
          () => {
            const result = onClick ? onClick({ close: handle.close }) : void 0;
            if (result && typeof result.then === "function") {
              return result.then((r) => {
                if (r !== false) handle.close();
              });
            }
            if (result !== false) handle.close();
            return void 0;
          },
          { disableOnError: false }
        )
      },
      label
    );
  }
  function focusFirst(dialog) {
    const target = tabbables(dialog.querySelector(".mfga-dialog-body"))[0] || tabbables(dialog.querySelector(".mfga-dialog-footer")).at(-1) || dialog;
    target.focus({ preventScroll: true });
  }
  function trapTab(ev, dialog) {
    const items = tabbables(dialog);
    if (!items.length) {
      ev.preventDefault();
      dialog.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active2 = document.activeElement;
    const inside = items.includes(active2);
    if (ev.shiftKey && (active2 === first || !inside)) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && (active2 === last || !inside)) {
      ev.preventDefault();
      first.focus();
    }
  }

  // src/data/harvest.js
  var SCRIPT_SELECTOR = 'script[type="application/json"][data-sjs], script#envjson';
  var MAX_DEPTH = 64;
  var DTSG_FRAMES = /* @__PURE__ */ new Set(["DTSGInitData", "DTSGInitialData"]);
  var isObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  var internals = /* @__PURE__ */ new WeakMap();
  var internal = (sink) => {
    let s = internals.get(sink);
    if (!s) internals.set(sink, s = { sequences: /* @__PURE__ */ new Map(), blocks: 0, failed: 0 });
    return s;
  };
  function createHarvest() {
    const harvest = {
      tokens: { dtsg: null, lsd: null, userId: null, name: null, shortName: null, site: {} },
      preloaders: /* @__PURE__ */ new Map(),
      prefetched: /* @__PURE__ */ new Map(),
      env: { typenamePairs: [], keys: [] },
      routeProps: null,
      checkpointed: false,
      /** Diagnostics: names and counts only, never token values. */
      snapshot() {
        const t2 = harvest.tokens;
        const { blocks, failed } = internal(harvest);
        return {
          tokens: { dtsg: !!t2.dtsg, lsd: !!t2.lsd, userId: !!t2.userId, name: !!t2.name, site: Object.keys(t2.site) },
          preloaders: [...harvest.preloaders.keys()],
          prefetched: Object.fromEntries([...harvest.prefetched].map(([id, list]) => [operationOf(id), list.length])),
          env: { keys: [...harvest.env.keys], typenamePairs: harvest.env.typenamePairs.length },
          routeProps: harvest.routeProps ? Object.keys(harvest.routeProps) : null,
          checkpointed: harvest.checkpointed,
          blocks,
          failed
        };
      }
    };
    return harvest;
  }
  function operationOf(preloaderID) {
    return /^adp_(.+?)RelayPreloader_/.exec(preloaderID)?.[1] ?? "other";
  }
  function parseSjs(json, sink) {
    walk(json, sink, 0);
    internal(sink).blocks++;
  }
  function parseEnv(json, sink) {
    if (!isObject(json)) return;
    sink.env.keys = Object.keys(json);
    const pairs = Array.isArray(json.q9k7m2x) ? json.q9k7m2x : [];
    sink.env.typenamePairs = pairs.filter((p) => Array.isArray(p) && typeof p[0] === "string" && typeof p[1] === "string").map((p) => [p[0], p[1]]);
  }
  function walk(node, sink, depth) {
    if (node == null || typeof node !== "object" || depth > MAX_DEPTH) return;
    if (Array.isArray(node)) {
      if (readFrame(node, sink)) return;
      for (const item of node) walk(item, sink, depth + 1);
      return;
    }
    readObject(node, sink);
    for (const key in node) walk(node[key], sink, depth + 1);
  }
  function readFrame(a, sink) {
    const head = a[0];
    if (typeof head !== "string") return false;
    if (head.startsWith("RelayPrefetchedStreamCache")) {
      if (a[1] === "next") addPrefetched(sink, a[3]);
      return true;
    }
    if (head === "CometRootEntryPointRenderer" && a[1] === "init") readEntryPoint(a[3], sink);
    if (!Array.isArray(a[1]) || !isObject(a[2])) return false;
    return readConfig(head, a[2], sink);
  }
  function readConfig(name, config, sink) {
    const t2 = sink.tokens;
    if (DTSG_FRAMES.has(name)) {
      if (typeof config.token === "string" && config.token) t2.dtsg = config.token;
    } else if (name === "LSD") {
      if (typeof config.token === "string" && config.token) t2.lsd = config.token;
    } else if (name === "CurrentUserInitialData") {
      const id = String(config.USER_ID ?? "");
      if (/^\d+$/.test(id) && id !== "0") t2.userId = id;
      if (typeof config.NAME === "string" && config.NAME) t2.name = config.NAME;
      if (typeof config.SHORT_NAME === "string" && config.SHORT_NAME) t2.shortName = config.SHORT_NAME;
    } else if (name === "SiteData") {
      t2.site = { ...config };
    } else {
      return false;
    }
    return true;
  }
  function readObject(o, sink) {
    if (typeof o.queryName === "string" && typeof o.preloaderID === "string" && (typeof o.queryID === "string" || typeof o.queryID === "number")) {
      sink.preloaders.set(o.queryName, {
        queryID: String(o.queryID),
        variables: isObject(o.variables) ? o.variables : {},
        preloaderID: o.preloaderID
      });
    }
    if (o.is_checkpointed === true) sink.checkpointed = true;
  }
  function readEntryPoint(args, sink) {
    const root = Array.isArray(args) ? args[0]?.entryPointRoot : null;
    const routeProps = root?.otherProps?.routeProps ?? root?.entryPointParams?.routeProps;
    if (isObject(routeProps)) sink.routeProps = routeProps;
  }
  function addPrefetched(sink, args) {
    const [id, box2] = Array.isArray(args) ? args : [];
    const bbox = box2?.__bbox;
    if (typeof id !== "string" || !isObject(bbox?.result)) return;
    const { sequences } = internal(sink);
    const list = sink.prefetched.get(id) ?? [];
    const seqs = sequences.get(id) ?? [];
    const seq3 = Number.isFinite(bbox.sequence_number) ? bbox.sequence_number : (seqs.at(-1) ?? -1) + 1;
    if (seqs.includes(seq3)) return;
    let at = seqs.length;
    while (at > 0 && seqs[at - 1] > seq3) at--;
    seqs.splice(at, 0, seq3);
    list.splice(at, 0, bbox.result);
    sequences.set(id, seqs);
    sink.prefetched.set(id, list);
  }
  function cookieUserId(cookie) {
    const read2 = (name) => new RegExp(`(?:^|;\\s*)${name}=(\\d+)`).exec(cookie)?.[1] ?? null;
    return read2("i_user") ?? read2("c_user");
  }
  var isHarvestScript = (node) => node?.nodeName === "SCRIPT" && (node.id === "envjson" || node.type === "application/json" && node.hasAttribute("data-sjs"));
  function startHarvest({ onUpdate } = {}) {
    const harvest = createHarvest();
    const parsed = /* @__PURE__ */ new WeakSet();
    const broken = /* @__PURE__ */ new WeakSet();
    const pending = /* @__PURE__ */ new Set();
    let swept = false;
    let notifyQueued = false;
    let observer2 = null;
    let resolveReady;
    harvest.ready = new Promise((r) => resolveReady = r);
    const notify = () => {
      if (notifyQueued || !onUpdate) return;
      notifyQueued = true;
      queueMicrotask(() => {
        notifyQueued = false;
        onUpdate(harvest);
      });
    };
    function read2(script, force = false) {
      if (parsed.has(script) || broken.has(script)) return;
      const text2 = script.textContent || "";
      const expected = Number(script.getAttribute("data-content-len"));
      const incomplete = !text2.trim() || !force && expected > 0 && text2.length < expected;
      let json;
      let ok = false;
      if (!incomplete) {
        try {
          json = JSON.parse(text2);
          ok = true;
        } catch {
        }
      }
      if (!ok) {
        if (swept) {
          pending.delete(script);
          if (!incomplete) markBroken(script);
        } else {
          pending.add(script);
        }
        return;
      }
      pending.delete(script);
      parsed.add(script);
      if (script.id === "envjson") parseEnv(json, harvest);
      else parseSjs(json, harvest);
      notify();
    }
    function markBroken(script) {
      broken.add(script);
      internal(harvest).failed++;
      health.count("harvest.unparsed");
    }
    const onMutations = safe(
      "harvest",
      (records) => {
        for (const r of records) {
          if (isHarvestScript(r.target)) read2(r.target);
          for (const n of r.addedNodes) if (isHarvestScript(n)) read2(n);
        }
        for (const s of pending) read2(s);
      },
      { disableOnError: false }
    );
    function refresh() {
      for (const s of document.querySelectorAll(SCRIPT_SELECTOR)) read2(s, true);
      if (!harvest.tokens.userId) {
        const id = cookieUserId(document.cookie || "");
        if (id) {
          harvest.tokens.userId = id;
          notify();
        }
      }
    }
    const finish = safe(
      "harvest",
      () => {
        swept = true;
        try {
          for (const s of [...pending]) read2(s, true);
          refresh();
          pending.clear();
        } finally {
          resolveReady();
        }
      },
      { disableOnError: false }
    );
    onRoot(() => {
      observer2 = new MutationObserver(onMutations);
      observer2.observe(document.documentElement, { childList: true, subtree: true });
      for (const s of document.querySelectorAll(SCRIPT_SELECTOR)) read2(s);
    });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", finish, { once: true });
    else queueMicrotask(finish);
    harvest.refresh = refresh;
    harvest.stop = () => observer2?.disconnect();
    return harvest;
  }

  // src/data/jsonl.js
  var GUARD = "for (;;);";
  var PROTO = "__proto__";
  var isPlainObject2 = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  function parseLines(text2) {
    const out = [];
    for (let line of String(text2 ?? "").split("\n")) {
      line = line.trim();
      if (line.startsWith(GUARD)) line = line.slice(GUARD.length).trim();
      if (!line) continue;
      try {
        const value = JSON.parse(line);
        if (isPlainObject2(value)) out.push(value);
      } catch {
      }
    }
    return out;
  }
  function deepMerge2(a, b) {
    if (!isPlainObject2(a) || !isPlainObject2(b)) return b;
    for (const [key, value] of Object.entries(b)) {
      if (key === PROTO) continue;
      a[key] = isPlainObject2(value) && isPlainObject2(a[key]) ? deepMerge2(a[key], value) : value;
    }
    return a;
  }
  function stitch(payloads) {
    let data = null;
    const errors = [];
    let final = false;
    for (const p of Array.isArray(payloads) ? payloads : []) {
      if (!isPlainObject2(p)) continue;
      if (Array.isArray(p.errors)) errors.push(...p.errors);
      if (p.extensions?.is_final === true) final = true;
      if (!isPlainObject2(p.data)) continue;
      const payload = structuredClone(p.data);
      if (!("label" in p) && !("path" in p)) {
        data = deepMerge2(data ?? {}, payload);
      } else {
        data ??= {};
        try {
          applyIncremental(data, Array.isArray(p.path) ? p.path : [], p.label, payload);
        } catch {
        }
      }
    }
    return { data, errors, final };
  }
  function applyIncremental(root, path, label, payload) {
    if (path.includes(PROTO)) return;
    if (!path.length) {
      deepMerge2(root, payload);
      return;
    }
    const parent = ensurePath(root, path.slice(0, -1), path[path.length - 1]);
    const last = path[path.length - 1];
    const isStream = typeof last === "number" && (/\$stream\$/.test(String(label ?? "")) || !(last in parent));
    if (isStream || !isPlainObject2(parent[last])) parent[last] = payload;
    else deepMerge2(parent[last], payload);
  }
  function ensurePath(root, path, finalKey) {
    let node = root;
    path.forEach((key, i) => {
      const nextKey = i + 1 < path.length ? path[i + 1] : finalKey;
      if (node[key] == null || typeof node[key] !== "object") node[key] = typeof nextKey === "number" ? [] : {};
      node = node[key];
    });
    return node;
  }

  // src/data/typenames.js
  function restoreTypenames(root, pairs) {
    const table2 = pairTable(pairs);
    if (!table2.size || root == null || typeof root !== "object") return root;
    let restored = 0;
    const stack2 = [root];
    while (stack2.length) {
      const value = stack2.pop();
      if (!Array.isArray(value)) {
        const real = table2.get(value.__typename);
        if (real !== void 0) {
          value.__typename = real;
          restored++;
        }
      }
      for (const child of Object.values(value)) if (child != null && typeof child === "object") stack2.push(child);
    }
    if (restored) health.count("typenames.restored", restored);
    return root;
  }
  function pairTable(pairs) {
    const table2 = /* @__PURE__ */ new Map();
    if (!Array.isArray(pairs)) return table2;
    for (const pair of pairs) {
      if (Array.isArray(pair) && pair.length === 2 && typeof pair[0] === "string" && typeof pair[1] === "string") table2.set(pair[0], pair[1]);
    }
    return table2;
  }

  // src/data/gql.js
  var DEFAULT_CODEC = { parseLines, stitch, restoreTypenames };
  var ENDPOINT_PATH = "/api/graphql/";
  var ASBD_ID = "359341";
  var GAP_SPREAD = 0.5;
  var COOLDOWN_BASE_MS = 6e4;
  var COOLDOWN_MAX_MS = 15 * 6e4;
  var REQUEST_TIMEOUT_MS = 45e3;
  var CODE_KINDS = /* @__PURE__ */ new Map([
    [1357001, "auth"],
    // "Not Logged In" of Facebook's async-response envelope
    [1357004, "auth"],
    [1357051, "token"],
    [1677047, "token"],
    [1675012, "variables"],
    [1570245, "stale-doc"],
    [1357010, "field"],
    [1675004, "rate"],
    [1357046, "rate"],
    [1675039, "soft-block"],
    [1384e3, "checkpoint"]
  ]);
  var WARNING_MARKERS = [
    /we suspect automated behaviou?r/i,
    /suspicious activity on your account/i,
    /temporarily restricted/i,
    /permanently disabled/i,
    /unusual activity/i
  ];
  var CHECKPOINT_FLAG = /"is_checkpointed":true/;
  var CHECKPOINT_URL = /\/checkpoint\b/;
  var LOGIN_URL = /\/login\b/;
  var GqlError = class extends Error {
    /** kind: "auth"|"token"|"stale-doc"|"variables"|"field"|"rate"|"soft-block"|"checkpoint"|"network"|"server" */
    constructor(message, { code = null, kind = "server" } = {}) {
      super(message);
      this.name = "GqlError";
      this.code = code;
      this.kind = kind;
    }
  };
  function errorKind(code) {
    return CODE_KINDS.get(Number(code)) ?? "server";
  }
  function jazoest(token) {
    let sum = 0;
    for (let i = 0; i < token.length; i++) sum += token.charCodeAt(i);
    return `2${sum}`;
  }
  function buildForm(tokens, { friendlyName, docId, variables, req, session, dpr = 1 }) {
    const site = tokens.site || {};
    const csrf = tokens.dtsg || tokens.lsd;
    const fields = [
      ["av", tokens.userId],
      ["__aaid", "0"],
      ["__user", tokens.userId],
      ["__a", "1"],
      ["__req", req.toString(36)],
      ["__hs", site.haste_session],
      ["dpr", dpr],
      ["__ccg", "EXCELLENT"],
      ["__rev", site.client_revision ?? site.server_revision],
      ["__s", session],
      ["__hsi", site.hsi],
      ["__comet_req", site.comet_env ?? 15],
      ["fb_dtsg", tokens.dtsg],
      ["jazoest", csrf ? jazoest(csrf) : null],
      ["lsd", tokens.lsd],
      ["__spin_r", site.__spin_r],
      ["__spin_b", site.__spin_b],
      ["__spin_t", site.__spin_t],
      ["fb_api_caller_class", "RelayModern"],
      ["fb_api_req_friendly_name", friendlyName],
      ["variables", JSON.stringify(variables ?? {})],
      ["server_timestamps", "true"],
      ["doc_id", docId]
    ];
    const body = new URLSearchParams();
    for (const [key, value] of fields) if (value != null && value !== "") body.append(key, String(value));
    return body;
  }
  function decodePayloads(payloads, typenamePairs, codec = DEFAULT_CODEC) {
    const { data = null, errors = [] } = codec.stitch(payloads) || {};
    if (data && typenamePairs?.length) codec.restoreTypenames(data, typenamePairs);
    return { data, errors };
  }
  function sessionTriple(random) {
    const part = () => Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0");
    return `${part()}:${part()}:${part()}`;
  }
  function endpoint() {
    const origin = globalThis.location?.origin;
    return typeof origin === "string" && origin.startsWith("http") ? origin + ENDPOINT_PATH : ENDPOINT_PATH;
  }
  function documentVisibility() {
    const doc = globalThis.document;
    return {
      hidden: () => doc?.visibilityState === "hidden",
      wait: () => new Promise((resolve) => doc.addEventListener("visibilitychange", resolve, { once: true }))
    };
  }
  var hasWarning = (s) => typeof s === "string" && WARNING_MARKERS.some((re) => re.test(s));
  function envelopeErrors(lines) {
    return lines.filter((line) => line?.error != null && !("data" in line) && !("errors" in line)).map((line) => ({ code: Number(line.error) || null, message: line.errorSummary, summary: line.errorSummary, description: line.errorDescription }));
  }
  function withTimeout(promise, ms) {
    let timer;
    const expired = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new GqlError(`no response after ${ms} ms`, { kind: "network" })), ms);
    });
    return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
  }
  function createGqlClient({
    platform,
    harvest,
    minGapMs = 1500,
    onHalt,
    stopOnCheckpoint = true,
    timeoutMs = REQUEST_TIMEOUT_MS,
    codec = DEFAULT_CODEC,
    now = () => Date.now(),
    sleep: sleep2 = sleep,
    random = Math.random,
    visibility = documentVisibility(),
    refreshTokens = () => harvest.refresh?.()
  }) {
    const session = sessionTriple(random);
    const counts = { requests: 0, ok: 0, errors: /* @__PURE__ */ Object.create(null), retries: 0 };
    let tail = Promise.resolve();
    let queued = 0;
    let inFlight = false;
    let reqCounter = 0;
    let nextAt = 0;
    let strikes = 0;
    let cooldownUntil = 0;
    let haltReason = null;
    const client = {
      request,
      get halted() {
        return haltReason != null;
      },
      stats
    };
    return client;
    function request(friendlyName, docId, variables) {
      queued++;
      const run = tail.then(() => {
        queued--;
        return execute(friendlyName, docId, variables);
      });
      tail = run.catch(() => {
      });
      return run;
    }
    async function execute(friendlyName, docId, variables) {
      try {
        await ensureUsable();
        await pace();
        await ensureUsable();
        const usedDtsg = harvest.tokens.dtsg;
        try {
          return await send(friendlyName, docId, variables);
        } catch (err) {
          if (err.kind !== "token" || !await tokensRefreshed(usedDtsg)) throw err;
          counts.retries++;
          await pace();
          return await send(friendlyName, docId, variables);
        }
      } catch (err) {
        const e = err instanceof GqlError ? err : new GqlError(String(err?.message || err), { kind: "server" });
        counts.errors[e.kind] = (counts.errors[e.kind] || 0) + 1;
        health.count(`gql.error.${e.kind}`);
        throw e;
      }
    }
    async function ensureUsable() {
      if (haltReason) throw new GqlError(`requests halted (${haltReason})`, { kind: "checkpoint" });
      if (harvest.checkpointed && stopOnCheckpoint) halt("checkpoint-flag");
      if (now() < cooldownUntil) throw new GqlError("cooling down after a rate limit", { kind: "rate" });
      const { userId, dtsg } = harvest.tokens;
      if (!userId || userId === "0") throw new GqlError("not logged in", { kind: "auth" });
      if (!dtsg && !await tokensRefreshed(null)) throw new GqlError("no fb_dtsg token", { kind: "token" });
    }
    async function tokensRefreshed(previous) {
      try {
        await refreshTokens();
      } catch (err) {
        warn("token refresh failed", err);
      }
      const dtsg = harvest.tokens.dtsg;
      return !!dtsg && dtsg !== previous;
    }
    async function pace() {
      for (; ; ) {
        if (visibility.hidden()) {
          await visibility.wait();
          continue;
        }
        const wait = nextAt - now();
        if (wait <= 0) return;
        await sleep2(wait);
      }
    }
    async function send(friendlyName, docId, variables) {
      const tokens = harvest.tokens;
      const body = buildForm(tokens, {
        friendlyName,
        docId,
        variables,
        req: ++reqCounter,
        session,
        dpr: Math.trunc(globalThis.devicePixelRatio || 1) || 1
      });
      const headers = { "content-type": "application/x-www-form-urlencoded", "x-fb-friendly-name": friendlyName, "x-asbd-id": ASBD_ID };
      if (tokens.lsd) headers["x-fb-lsd"] = tokens.lsd;
      counts.requests++;
      health.count("gql.requests");
      inFlight = true;
      try {
        const text2 = await withTimeout(fetchText(body, headers), timeoutMs);
        const result = parse(text2);
        counts.ok++;
        strikes = 0;
        return result;
      } catch (err) {
        if (err.kind === "rate" || err.kind === "soft-block") coolDown();
        throw err;
      } finally {
        inFlight = false;
        nextAt = now() + minGapMs * (1 + random() * GAP_SPREAD);
      }
    }
    async function fetchText(body, headers) {
      let res;
      try {
        res = await platform.fetch(endpoint(), { method: "POST", credentials: "include", headers, body: body.toString() });
      } catch (err) {
        throw new GqlError(`network: ${err?.message || err}`, { kind: "network" });
      }
      checkRedirect(res.url);
      if (res.status === 429) throw new GqlError("HTTP 429", { kind: "rate" });
      if (res.status === 401 || res.status === 403) throw new GqlError(`HTTP ${res.status}`, { kind: "auth" });
      if (!res.ok) throw new GqlError(`HTTP ${res.status}`, { kind: "server" });
      try {
        return await res.text();
      } catch (err) {
        throw new GqlError(`network: ${err?.message || err}`, { kind: "network" });
      }
    }
    function checkRedirect(target) {
      const url = String(target || "");
      if (CHECKPOINT_URL.test(url)) halt("checkpoint-redirect");
      if (LOGIN_URL.test(url)) throw new GqlError("redirected to login", { kind: "auth" });
    }
    function parse(text2) {
      if (CHECKPOINT_FLAG.test(text2)) halt("checkpoint-flag");
      const lines = codec.parseLines(text2);
      if (!lines.length) {
        if (hasWarning(text2)) halt("account-warning");
        throw new GqlError("empty or unparseable response", { kind: "soft-block" });
      }
      for (const line of lines) if (typeof line?.redirect === "string") checkRedirect(line.redirect);
      const decoded = decodePayloads(lines, harvest.env?.typenamePairs, codec);
      const data = decoded.data;
      const errors = [...decoded.errors, ...envelopeErrors(lines)];
      for (const e of errors) if (hasWarning(e?.message) || hasWarning(e?.summary) || hasWarning(e?.description)) halt("account-warning");
      const critical = errors.find((e) => e?.severity !== "WARNING" && errorKind(e?.code) !== "server");
      const failure = critical ?? (data == null ? errors[0] : null);
      if (failure) {
        const kind = errorKind(failure.code);
        if (kind === "checkpoint") halt("checkpoint-code");
        throw new GqlError(String(failure.message || failure.summary || `GraphQL error ${failure.code}`), { code: failure.code ?? null, kind });
      }
      if (data == null) throw new GqlError("response without data", { kind: "soft-block" });
      return { data, errors, lines };
    }
    function halt(reason) {
      if (!haltReason) {
        if (stopOnCheckpoint) haltReason = reason;
        health.count("gql.halt");
        health.fact("gql.haltReason", reason);
        try {
          onHalt?.(reason);
        } catch (err) {
          warn("onHalt failed", err);
        }
      }
      throw new GqlError(`requests halted (${reason})`, { kind: "checkpoint" });
    }
    function coolDown() {
      strikes++;
      cooldownUntil = Math.max(cooldownUntil, now() + Math.min(COOLDOWN_MAX_MS, COOLDOWN_BASE_MS * 2 ** (strikes - 1)));
    }
    function stats() {
      return {
        requests: counts.requests,
        ok: counts.ok,
        retries: counts.retries,
        errors: { ...counts.errors },
        inFlight,
        queued,
        halted: haltReason != null,
        haltReason,
        cooldownMs: Math.max(0, cooldownUntil - now())
      };
    }
  }

  // src/data/ops.js
  var OPS_STORAGE_KEY = "mfga:ops";
  var CACHE_MAX_AGE_MS = 30 * 864e5;
  var LEARNED_TTL_MS = 15e3;
  var PROBE_TIMEOUT_MS = 1500;
  var DOC_ID = /^\d{5,}$/;
  var FALLBACK_DOC_IDS = Object.freeze({
    CometModernHomeFeedQuery: "28136951115834703",
    CometNewsFeedPaginationQuery: "28827638856853689",
    CometUFIFeedbackReactMutation: "27646120298312844",
    useCometUFICreateCommentMutation: "39607465588840384",
    CometUFIDeleteCommentMutation: "28058620387108821",
    useCometUFIEditCommentMutation: "28765227863112159",
    CometUFIReactionsDialogQuery: "28316088138022831",
    CometFeedFavoritesEndOfFeedMessageQuery: "9839941666067123",
    FeedsCometFilterPanelQuery: "10051869914845503",
    GroupsCometFeedRegularStoriesPaginationQuery: "26577462205242925",
    ProfileCometTimelineFeedQuery: "28736035046001218"
  });
  var badKey = (name, docId) => `${name}
${docId}`;
  var validEntry = (e) => e != null && typeof e === "object" && DOC_ID.test(String(e.docId));
  function isDocError(err, op) {
    return err?.kind === "stale-doc" || err?.kind === "field" && !op?.fresh;
  }
  async function runOp({ client, ops }, name, build) {
    const op = await ops.get(name);
    if (!op) return null;
    try {
      return await client.request(name, op.docId, build(op));
    } catch (err) {
      if (!isDocError(err, op)) throw err;
      ops.invalidate(name, op.docId);
      const next = await ops.get(name);
      if (!next) throw err;
      health.count("ops.retry");
      try {
        return await client.request(name, next.docId, build(next));
      } catch (retryErr) {
        if (isDocError(retryErr, next)) ops.invalidate(name, next.docId);
        throw retryErr;
      }
    }
  }
  function createOpRegistry({ platform, harvest, now = () => Date.now() }) {
    const bad = /* @__PURE__ */ new Set();
    const memory = /* @__PURE__ */ new Map();
    const probes = /* @__PURE__ */ new Map();
    const resolved = /* @__PURE__ */ new Map();
    let cache = null;
    let background = null;
    const currentRev = () => {
      const site = harvest.tokens?.site;
      return site?.client_revision ?? site?.server_revision ?? null;
    };
    const candidate = (entry, source) => ({
      docId: String(entry.docId),
      variables: entry.variables ?? null,
      source,
      fresh: source === "preloader" || source === "probe" || entry.rev != null && String(entry.rev) === String(currentRev())
    });
    const tiers = [fromPreloader, fromLearned, fromCache, fromProbe, fromFallback];
    return {
      async get(name) {
        for (const tier of tiers) {
          const op = await tier(name);
          if (op && !bad.has(badKey(name, op.docId))) {
            resolved.set(name, { source: op.source, docId: op.docId });
            return { ...op, variables: op.variables == null ? null : structuredClone(op.variables) };
          }
        }
        resolved.set(name, null);
        return null;
      },
      invalidate(name, docId) {
        bad.add(badKey(name, docId));
        health.count("ops.invalidate");
        if (memory.get(name)?.docId === docId) memory.delete(name);
        return loadCache().then((c) => {
          if (c[name]?.docId !== docId) return;
          delete c[name];
          return save(c);
        });
      },
      learn(name, docId, variables, source = "learned") {
        if (!DOC_ID.test(String(docId))) return Promise.resolve();
        const entry = { docId: String(docId), variables: variables ?? null, seenAt: now(), source, rev: currentRev() };
        bad.delete(badKey(name, entry.docId));
        memory.set(name, entry);
        return persist(name, entry);
      },
      snapshot() {
        return {
          resolved: Object.fromEntries(resolved),
          invalidated: [...bad].map((k) => k.split("\n")[0]),
          learned: [...memory.keys()],
          preloaders: [...harvest.preloaders?.keys() ?? []],
          probe: !!platform.page?.requireOp
        };
      }
    };
    function fromPreloader(name) {
      const p = harvest.preloaders?.get(name);
      return p && DOC_ID.test(p.queryID) ? candidate({ docId: p.queryID, variables: p.variables }, "preloader") : null;
    }
    async function fromLearned(name) {
      const fromBackground = (await backgroundOps())[name];
      const mine = memory.get(name);
      const newest = [fromBackground, mine].filter(validEntry).sort((a, b) => (b.seenAt || 0) - (a.seenAt || 0))[0];
      if (!newest) return null;
      const cached = (await loadCache())[name];
      if (newest === fromBackground && (cached?.docId !== String(newest.docId) || (cached.seenAt || 0) < (newest.seenAt || 0))) {
        persist(name, { docId: String(newest.docId), variables: newest.variables ?? null, seenAt: newest.seenAt || now(), source: "background", rev: newest.rev ?? null });
      }
      return candidate(newest, "learned");
    }
    async function backgroundOps() {
      if (!background || now() - background.at > LEARNED_TTL_MS) {
        background = { at: now(), ops: Promise.resolve().then(() => platform.learnedOps?.()).catch(() => null) };
      }
      return await background.ops || {};
    }
    async function fromCache(name) {
      const entry = (await loadCache())[name];
      return entry ? candidate(entry, "cache") : null;
    }
    async function fromProbe(name) {
      if (!platform.page?.requireOp) return null;
      if (!probes.has(name)) probes.set(name, probe(name));
      const docId = await probes.get(name);
      return docId ? candidate({ docId }, "probe") : null;
    }
    async function probe(name) {
      const docId = await platform.page.requireOp(name, PROBE_TIMEOUT_MS).catch(() => null);
      if (!DOC_ID.test(String(docId ?? ""))) return null;
      health.count("ops.probed");
      persist(name, { docId: String(docId), variables: null, seenAt: now(), source: "probe", rev: currentRev() });
      return String(docId);
    }
    function fromFallback(name) {
      const docId = FALLBACK_DOC_IDS[name];
      return docId ? candidate({ docId }, "fallback") : null;
    }
    function loadCache() {
      cache ??= Promise.resolve().then(() => platform.storage.get(OPS_STORAGE_KEY)).then((stored) => {
        const fresh = {};
        for (const [name, entry] of Object.entries(stored && typeof stored === "object" ? stored : {})) {
          if (validEntry(entry) && now() - (entry.seenAt || 0) < CACHE_MAX_AGE_MS) fresh[name] = entry;
        }
        return fresh;
      }).catch(() => ({}));
      return cache;
    }
    async function persist(name, entry) {
      const c = await loadCache();
      c[name] = entry;
      await save(c);
    }
    function save(c) {
      return Promise.resolve().then(() => platform.storage.set(OPS_STORAGE_KEY, c)).catch(() => health.count("ops.persistFailed"));
    }
  }

  // src/data/extract.js
  var FB_ORIGIN = "https://www.facebook.com/";
  var SEARCH_DEPTH = 40;
  var SHARED_DEPTH = 2;
  var ALBUM_ITEMS = 4;
  var EMPTY = Object.freeze({});
  var isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  var obj = (v) => isObj(v) ? v : EMPTY;
  var objects = (v) => Array.isArray(v) ? v.filter(isObj) : [];
  var str = (v) => typeof v === "string" && v !== "" ? v : null;
  var num = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
  var textOf = (v) => str(v?.text) ?? str(v);
  var int = (v) => {
    if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
    return Number.isInteger(v) && v >= 0 ? v : null;
  };
  var idString = (v) => str(v) ?? (Number.isFinite(v) ? String(v) : null);
  function pick(...values) {
    for (const v of values) if (v != null) return v;
    return null;
  }
  var SKIP_KEY = /^(?:attached_story$|ghl_)/i;
  var isDecoy = (o) => typeof o.__typename === "string" && /GHLMocked/i.test(o.__typename);
  function findInStory(root, test, maxDepth = SEARCH_DEPTH) {
    if (root == null || typeof root !== "object") return null;
    const stack2 = [[root, null, 0]];
    while (stack2.length) {
      const [value, key, depth] = stack2.pop();
      const isList = Array.isArray(value);
      if (!isList && value !== root && (isDecoy(value) || "node" in value && "cursor" in value)) continue;
      if (!isList && test(value, key)) return value;
      if (depth >= maxDepth) continue;
      const entries = isList ? value.map((child) => [key, child]) : Object.entries(value).filter(([k]) => !SKIP_KEY.test(k));
      for (let i = entries.length - 1; i >= 0; i--) {
        const [childKey, child] = entries[i];
        if (child != null && typeof child === "object") stack2.push([child, childKey, depth + 1]);
      }
    }
    return null;
  }
  var GENAI_TYPENAME = "CometFeedStoryGenAIContentTransparencyStrategy";
  function isAiLabel(o) {
    return isObj(o) && o.__typename === GENAI_TYPENAME && (o.was_detected_as_ai_generated === true || o.was_self_disclosed_as_ai_generated === true || Boolean(o.ai_generated_detected_info?.gen_ai_transparency_type));
  }
  var TRACKING_PARAM = /^(?:__cft__\[\d*\]|__xts__\[\d*\]|__tn__|mibextid|fbclid)$/;
  var SHIM_HOST = /^(?:(?:l|lm|www|m)\.)?facebook\.com$/i;
  function httpUrl(url, base) {
    if (url == null || url === "") return null;
    try {
      const u = base ? new URL(String(url), base) : new URL(String(url));
      return u.protocol === "http:" || u.protocol === "https:" ? u : null;
    } catch {
      return null;
    }
  }
  function cleanPermalink(url) {
    const u = httpUrl(url, FB_ORIGIN);
    if (!u) return null;
    const tracking = [...u.searchParams.keys()].filter((key) => TRACKING_PARAM.test(key));
    for (const key of tracking) u.searchParams.delete(key);
    return u.href;
  }
  function unwrapLinkShim(url) {
    const u = httpUrl(url, FB_ORIGIN);
    if (!u) return null;
    if (!SHIM_HOST.test(u.hostname) || u.pathname !== "/l.php") return u.href;
    return httpUrl(u.searchParams.get("u"))?.href ?? null;
  }
  var mediaUrl = (url) => httpUrl(url, FB_ORIGIN)?.href ?? null;
  function extractStory(node, opts) {
    return storyFrom(node, opts ?? {}, 0);
  }
  function storyFrom(node, opts, depth) {
    if (!isObj(node) || node.__typename != null && node.__typename !== "Story") return null;
    const v = viewsOf(node);
    const postId = idString(pick(node.post_id, v.content.post_id, v.ufi.post_id) ?? findKey(node, "post_id"));
    const nodeId = str(node.id) ?? str(v.content.id);
    const key = postId ?? nodeId ?? str(opts.dedupKey);
    if (!key) {
      health.count("extract.no-key");
      return null;
    }
    const actors = extractActors(v);
    const { text: text2, ranges } = extractMessage(v);
    const target = extractTarget(v, actors);
    return {
      key,
      postId,
      nodeId,
      time: extractTime(v),
      url: extractUrl(v),
      actors,
      avatar: extractAvatar(v, actors[0]),
      target,
      title: pick(...v.sections.map((s) => textOf(s.title?.story?.title))),
      text: text2,
      ranges,
      attachments: collectAttachments([...objects(v.content.attachments), ...objects(node.attachments), ...objects(v.layout.attachments)]),
      shared: depth < SHARED_DEPTH ? storyFrom(sharedNode(v), {}, depth + 1) : null,
      feedback: extractFeedback(v),
      groupId: extractGroupId(v, target),
      tracking: str(node.encrypted_tracking) ?? str(v.ufi.encrypted_tracking) ?? str(v.content.encrypted_tracking),
      sources: Array.isArray(opts.sources) ? opts.sources.filter((s) => typeof s === "string") : [],
      audience: extractAudience(v),
      // Same search as the classifier's hideAI rule, so a hidden-when-on story is badged when it is off.
      ai: Boolean(findInStory(node, isAiLabel))
    };
  }
  function viewsOf(node) {
    const cs = obj(node.comet_sections);
    const content = obj(cs.content?.story);
    const ctx = obj(cs.context_layout?.story);
    const layout = obj(cs.attached_story_layout?.story);
    const ufi = obj(get(cs, "feedback", "story", "story_ufi_container", "story"));
    const ftwc = isObj(ufi.feedback_context?.feedback_target_with_context?.comet_ufi_summary_and_actions_renderer) ? ufi.feedback_context.feedback_target_with_context : obj(findInStory(node, (o) => isObj(o.comet_ufi_summary_and_actions_renderer)));
    const sections = [ctx, layout, node, content].map((s) => obj(s.comet_sections));
    return {
      node,
      cs,
      content,
      ctx,
      layout,
      ufi,
      ftwc,
      summary: obj(ftwc.comet_ufi_summary_and_actions_renderer?.feedback),
      sections,
      metadata: sections.flatMap((s) => objects(s.metadata)),
      actorPhotos: sections.map((s) => obj(s.actor_photo?.story))
    };
  }
  function findKey(node, key) {
    const found = findInStory(node, (o) => typeof o[key] === "string" || typeof o[key] === "number");
    return found ? found[key] : null;
  }
  function timestamps(v) {
    return [v.cs.timestamp?.story, ...v.metadata.filter((m) => /TimestampStrategy$/.test(m.__typename ?? "")).map((m) => m.story)].map(obj);
  }
  function extractTime(v) {
    const canonical = [v.node.creation_time, ...timestamps(v).map((s) => s.creation_time), v.content.creation_time];
    return pick(...canonical.map(num)) ?? num(findKey(v.node, "creation_time"));
  }
  function extractUrl(v) {
    const { node, ufi } = v;
    const candidates = [...timestamps(v).map((s) => s.url), node.permalink_url, ufi.permalink_url, v.ftwc.url, node.wwwURL, v.content.wwwURL, node.url, ufi.url];
    return cleanPermalink(pick(...candidates.map(str)) ?? str(findKey(v.node, "permalink_url")));
  }
  function extractActors(v) {
    const lists = [
      v.node.actors,
      v.content.actors,
      ...v.sections.map((s) => s.title?.story?.actors),
      ...v.actorPhotos.map((s) => s.actors),
      v.ctx.actors,
      v.ufi.actors
    ].map(objects);
    const all = lists.flat();
    let primary = lists.find((list) => list.some((a) => str(a.name) || idString(a.id)));
    if (!primary) {
      const owner = pick(v.node.feedback?.owning_profile, v.ftwc.owning_profile);
      const found = owner ?? findInStory(v.node, (o, key) => key === "actors" && Boolean(str(o.name)));
      primary = found ? [found] : [];
    }
    return primary.map((a) => normActor(a, all)).filter((a) => a.id || a.name);
  }
  function normActor(actor, all) {
    const id = idString(actor.id);
    const same = [actor, ...id ? all.filter((a) => idString(a.id) === id) : []];
    const field = (read2) => pick(...same.map(read2));
    return {
      id,
      name: field((a) => str(a.name)),
      url: cleanPermalink(field((a) => str(a.url) ?? str(a.profile_url))),
      type: field((a) => str(a.__typename))
    };
  }
  function extractAvatar(v, actor) {
    const owners = [...v.actorPhotos.map((s) => s.actors), v.content.actors, v.node.actors].flatMap(objects);
    const pictures = owners.filter((a) => !actor?.id || !idString(a.id) || idString(a.id) === actor.id).map((a) => a.profile_picture).filter((p) => isObj(p) && mediaUrl(p.uri));
    let best = null;
    for (const p of pictures) if (!best || pictureSize(p) > pictureSize(best)) best = p;
    return best ? mediaUrl(best.uri) : null;
  }
  function pictureSize(p) {
    const hint = /[/_=,-][sp](\d{2,4})x\d{2,4}(?!\d)/i.exec(String(p.uri))?.[1];
    const width = num(p.width) ?? (hint ? Number(hint) : 0);
    return width * (num(p.scale) ?? 1);
  }
  function extractTarget(v, actors) {
    const candidates = [
      v.node.to,
      v.content.to,
      ...v.sections.map((s) => s.title?.story?.to),
      ...v.actorPhotos.map((s) => s.to),
      ...v.metadata.map((m) => m.story?.to)
    ].filter((t2) => isObj(t2) && idString(t2.id));
    if (candidates.length) {
      const id = idString(candidates[0].id);
      const same = candidates.filter((t2) => idString(t2.id) === id);
      const type = pick(...same.map((t2) => str(t2.__typename)));
      if (actors.length === 1 && actors[0].id === id) return null;
      return {
        type,
        id,
        name: pick(...same.map((t2) => str(t2.name))),
        url: cleanPermalink(pick(...same.map((t2) => str(t2.url)))) ?? (type === "Group" ? groupUrl(id) : null)
      };
    }
    const groupId = targetGroupId(v);
    return groupId ? { type: "Group", id: groupId, name: null, url: groupUrl(groupId) } : null;
  }
  var groupUrl = (id) => `${FB_ORIGIN}groups/${encodeURIComponent(id)}/`;
  function targetGroupId(v) {
    const canonical = idString(pick(v.node.target_group?.id, v.content.target_group?.id, v.ufi.target_group?.id));
    if (canonical) return canonical;
    const isGroupRef = (o, key) => (key === "target_group" || key === "to" && o.__typename === "Group") && Boolean(idString(o.id));
    return idString(findInStory(v.node, isGroupRef)?.id);
  }
  function extractGroupId(v, target) {
    if (target?.type === "Group") return target.id;
    return targetGroupId(v) ?? idString(pick(v.node.feedback?.associated_group?.id, v.ftwc.associated_group?.id));
  }
  function extractAudience(v) {
    const strategy = v.metadata.find((m) => m.__typename === "CometFeedStoryAudienceStrategy");
    const scope = strategy?.story?.privacy_scope ?? findInStory(v.node, (o, key) => key === "privacy_scope");
    return textOf(scope?.description);
  }
  function extractMessage(v) {
    const candidates = [v.content, v.node, v.layout, v.ufi].flatMap((s) => [
      s.message,
      get(s, "comet_sections", "message", "story", "message"),
      get(s, "comet_sections", "message_container", "story", "message"),
      richMessage(get(s, "comet_sections", "message", "rich_message"))
    ]);
    const messages = candidates.filter((m) => isObj(m) && str(m.text));
    if (!messages.length) {
      const found = findInStory(v.node, (o, key) => key === "message" && Boolean(str(o.text)));
      if (found) messages.push(found);
    }
    const text2 = messages[0]?.text ?? null;
    const withRanges = messages.find((m) => m.text === text2 && objects(m.ranges).length);
    return { text: text2, ranges: withRanges ? normRanges(withRanges.ranges, text2) : [] };
  }
  function richMessage(blocks) {
    const lines = objects(blocks).map((b) => b.text).filter((t2) => typeof t2 === "string");
    return lines.length ? { text: lines.join("\n") } : null;
  }
  var RANGE_KINDS = { User: "user", Page: "page", Hashtag: "hashtag", ExternalUrl: "link" };
  function normRanges(ranges, text2) {
    const out = [];
    for (const r of objects(ranges)) {
      const offset = int(r.offset);
      const length = int(r.length);
      if (offset == null || !length || offset + length > text2.length) continue;
      const entity = obj(r.entity);
      const kind = RANGE_KINDS[entity.__typename] ?? (isObj(entity.web_link) || str(entity.external_url) ? "link" : "other");
      const raw = kind === "link" ? unwrapLinkShim(pick(str(entity.web_link?.url), str(entity.external_url), str(entity.url))) : pick(str(entity.url), str(entity.profile_url));
      const url = cleanPermalink(raw);
      if (url) out.push({ offset, length, url, kind });
    }
    return out;
  }
  function sharedNode(v) {
    const holders = [v.node, v.content, v.layout];
    const parts = [
      ...holders.map((h2) => h2.attached_story),
      ...holders.map((h2) => get(h2, "comet_sections", "attached_story", "story", "attached_story"))
    ].filter(isObj);
    const id = pick(...parts.map((p) => str(p.id)));
    const same = parts.filter((p) => !str(p.id) || p.id === id);
    return same.length ? fillMerge(same) : null;
  }
  function fillMerge(parts) {
    const out = {};
    for (const part of parts) {
      for (const [key, value] of Object.entries(part)) {
        if (key === "__proto__") continue;
        const current = out[key];
        if (current == null || Array.isArray(current) && !current.length && Array.isArray(value)) out[key] = value;
        else if (isObj(current) && isObj(value)) out[key] = fillMerge([current, value]);
      }
    }
    return out;
  }
  function extractFeedback(v) {
    const { summary, ftwc } = v;
    const renderers = objects(summary.adaptive_ufi_action_renderers);
    const rendered2 = (typename) => obj(renderers.find((r) => r.__typename === typename)?.feedback);
    const react = rendered2("UFIStoryReactActionRenderer");
    const comment = rendered2("UFICommentActionRenderer");
    const share = rendered2("XFBUFIAdaptiveShareActionRenderer");
    const count2 = (c) => int(c) ?? int(c?.count);
    const commentTotal = (f) => int(get(f, "comment_rendering_instance", "comments", "total_count"));
    const topReactions = objects(summary.top_reactions?.edges).map((e) => ({ id: idString(e.node?.id), count: int(e.reaction_count) ?? 0 })).filter((r) => r.id);
    const isFeedback = (o) => o.__typename === "Feedback" && Boolean(str(o.id));
    const topTotal = topReactions.length ? topReactions.reduce((n, r) => n + r.count, 0) : null;
    return {
      id: str(v.node.feedback?.id) ?? str(ftwc.id) ?? str(summary.id) ?? str(v.content.feedback?.id) ?? str(findInStory(v.node, isFeedback)?.id),
      reactions: pick(count2(summary.reaction_count), count2(react.reaction_count), topTotal, int(summary.i18n_reaction_count)),
      comments: pick(commentTotal(ftwc), commentTotal(summary.comments_count_summary_renderer?.feedback), commentTotal(comment)),
      shares: pick(count2(summary.share_count), count2(share.share_count), int(summary.i18n_share_count)),
      viewerReaction: idString(pick(summary.viewer_feedback_reaction_info, react.viewer_feedback_reaction_info)?.id),
      canComment: ftwc.can_viewer_comment !== false && ftwc.have_comments_been_disabled !== true,
      topReactions
    };
  }
  function collectAttachments(raws) {
    const out = [];
    const seen = /* @__PURE__ */ new Map();
    for (const raw of raws) {
      const attachment = normalizeAttachment(raw);
      if (!attachment) continue;
      const ids = attachmentIds(raw, attachment);
      const dup = ids.map((id) => seen.get(id)).find((i) => i !== void 0);
      const index = dup ?? out.length;
      if (dup === void 0) out.push(attachment);
      else if (out[dup].kind === "other" && attachment.kind !== "other") out[dup] = attachment;
      for (const id of ids) seen.set(id, index);
    }
    return out;
  }
  function attachmentIds(raw, a) {
    const sa = obj(raw.styles?.attachment);
    const mediaId = idString(pick(sa.media?.id, raw.media?.id));
    const targetId = idString(pick(sa.target?.id, raw.target?.id));
    const primary = a.url ?? a.href ?? a.items?.[0]?.uri ?? a.hd ?? a.sd;
    return [
      str(raw.deduplication_key) && `d:${raw.deduplication_key}`,
      mediaId && `m:${mediaId}`,
      targetId && `t:${targetId}`,
      primary && `u:${primary}`,
      a.kind === "unavailable" && "unavailable"
    ].filter(Boolean);
  }
  function normalizeAttachment(att) {
    const styles = obj(att.styles);
    const style = str(styles.__typename) ?? "";
    const sa = isObj(styles.attachment) ? styles.attachment : att;
    const media = obj(pick(sa.media, att.media));
    const target = obj(pick(sa.target, att.target));
    const footer = isObj(att.comet_footer_renderer) && !isDecoy(att.comet_footer_renderer) ? obj(att.comet_footer_renderer.attachment) : EMPTY;
    const link2 = () => linkAttachment(sa, att, media, target, footer);
    if (/Unavailable/.test(style)) return { kind: "unavailable" };
    if (target.__typename === "Event" || isObj(sa.event)) return eventAttachment(sa, target);
    const album = albumAttachment(sa, style);
    if (album) return album;
    if (/Share|Link/.test(style)) return link2();
    const reel = objects(sa.style_infos).flatMap((s) => objects(s.fb_shorts_story?.attachments)).find((a) => isObj(a.media));
    if (reel) return videoAttachment(reel.media, sa, att);
    if (media.__typename === "Video" || /Video|AnimatedImage/.test(style)) return videoAttachment(media, sa, att);
    if (media.__typename === "Photo" || /Photo/.test(style)) {
      const item = photoItem(media, pick(str(sa.url), str(att.url)));
      if (item) return { kind: "photo", items: [item], total: 1 };
    }
    if (hasLinkSignal(sa, att, target, footer)) return link2();
    const href = cleanPermalink(pick(str(sa.url), str(att.url), str(target.url), str(media.url)));
    return href ? { kind: "other", href } : null;
  }
  function photoItem(media, href) {
    const image = [media.photo_image, media.image, media.viewer_image].find((i) => isObj(i) && mediaUrl(i.uri));
    if (!image) return null;
    return {
      uri: mediaUrl(image.uri),
      width: int(image.width),
      height: int(image.height),
      href: cleanPermalink(pick(str(media.url), href)),
      alt: str(media.accessibility_caption)
    };
  }
  function albumAttachment(sa, style) {
    const subs = obj(sa.all_subattachments);
    const items = objects(subs.nodes).map((n) => photoItem(obj(n.media), str(n.url))).filter(Boolean);
    if (!items.length || !/Album/.test(style) && items.length < 2) return null;
    return { kind: "photo", items: items.slice(0, ALBUM_ITEMS), total: Math.max(int(subs.count) ?? 0, items.length) };
  }
  function videoAttachment(media, sa, att) {
    const delivery = obj(get(media, "videoDeliveryResponseFragment", "videoDeliveryResponseResult"));
    const progressive = objects(delivery.progressive_urls).filter((p) => p.failure_reason == null && mediaUrl(p.progressive_url));
    const quality = (q) => progressive.find((p) => p.metadata?.quality === q)?.progressive_url;
    const legacy = obj(media.videoDeliveryLegacyFields);
    const legacyUrl = (...keys) => pick(...keys.flatMap((k) => [str(media[k]), str(legacy[k])]));
    const sd = pick(quality("SD"), legacyUrl("playable_url", "browser_native_sd_url"), progressive[0]?.progressive_url);
    const hd = pick(quality("HD"), legacyUrl("playable_url_quality_hd", "browser_native_hd_url"));
    const poster = pick(str(media.preferred_thumbnail?.image?.uri), str(media.first_frame_thumbnail), str(media.thumbnailImage?.uri), str(media.image?.uri));
    return {
      kind: "video",
      poster: mediaUrl(poster),
      sd: mediaUrl(sd),
      hd: mediaUrl(hd),
      width: pick(int(media.width), int(media.original_width)),
      height: pick(int(media.height), int(media.original_height)),
      href: cleanPermalink(pick(str(media.permalink_url), str(sa.url), str(att.url))),
      duration: num(media.length_in_second),
      live: media.is_live_streaming === true
    };
  }
  var webLink = (o) => str(get(o, "story_attachment_link_renderer", "attachment", "web_link", "url"));
  function hasLinkSignal(sa, att, target, footer) {
    return Boolean(
      textOf(pick(sa.title_with_entities, att.title_with_entities, footer.title_with_entities)) || webLink(sa) || webLink(att) || webLink(footer) || str(target.external_url) || target.__typename === "ExternalUrl"
    );
  }
  function linkTarget(sa, att, target, footer) {
    const raw = pick(
      webLink(sa),
      webLink(att),
      webLink(footer),
      str(sa.url),
      str(att.url),
      str(target.external_url),
      str(footer.target?.external_url)
    );
    return cleanPermalink(unwrapLinkShim(raw));
  }
  function linkAttachment(sa, att, media, target, footer) {
    const url = linkTarget(sa, att, target, footer);
    const image = [media.large_share_image, media.image, media.imageLargeAspect, media.imageFlexible].find((i) => isObj(i) && mediaUrl(i.uri));
    return {
      kind: "link",
      url,
      title: textOf(pick(sa.title_with_entities, att.title_with_entities, footer.title_with_entities)),
      description: textOf(pick(sa.description, att.description, footer.description)),
      source: textOf(pick(sa.source, att.source, footer.source)) ?? (url ? new URL(url).hostname : null),
      image: image ? mediaUrl(image.uri) : null
    };
  }
  function eventAttachment(sa, target) {
    const event = isObj(sa.event) ? sa.event : target;
    return {
      kind: "event",
      url: cleanPermalink(pick(str(event.url), str(target.url), str(sa.url))),
      title: textOf(sa.title_with_entities) ?? str(event.name),
      when: pick(str(event.capitalized_day_time_sentence), str(event.day_time_sentence), textOf(sa.description))
    };
  }
  var COMMENT_AVATARS = ["profile_picture_depth_0", "profile_picture", "profile_picture_depth_0_increased", "profile_picture_depth_1"];
  function extractComment(node) {
    if (!isObj(node)) return null;
    const id = idString(node.id) ?? idString(node.legacy_fbid);
    if (!id) return null;
    const author = obj(node.author);
    const body = [node.body, node.body_renderer, node.preferred_body].find((b) => isObj(b) && str(b.text)) ?? EMPTY;
    const text2 = str(body.text);
    const feedback = obj(node.feedback);
    return {
      id,
      author: {
        id: idString(author.id),
        name: str(author.name),
        url: cleanPermalink(pick(str(author.url), str(author.profile_url))),
        avatar: mediaUrl(pick(...COMMENT_AVATARS.map((k) => str(author[k]?.uri))))
      },
      text: text2,
      ranges: text2 ? normRanges(body.ranges, text2) : [],
      time: num(node.created_time) ?? num(findInStory(node, (o) => o.id === node.id && num(o.created_time) != null)?.created_time),
      reactions: commentReactions(node, feedback),
      replies: pick(int(feedback.replies_fields?.total_count), int(feedback.replies_fields?.count), int(node.replies_fields?.total_count)) ?? 0
    };
  }
  function commentReactions(node, feedback) {
    const linked = objects(node.comment_action_links).map((l) => obj(l.comment?.feedback));
    const counts = [feedback, ...linked].flatMap((f) => [f.reactors?.count, f.unified_reactors?.count, f.reaction_count?.count, f.reaction_count].map(int));
    const top = objects(feedback.top_reactions?.edges).map((e) => int(e.reaction_count) ?? 0);
    return pick(...counts, top.length ? top.reduce((a, b) => a + b, 0) : null, int(feedback.reactors?.count_reduced)) ?? 0;
  }

  // src/data/classify.js
  var CATEGORY_NUMBERS = Object.freeze({
    UNKNOWN: 0,
    ORGANIC: 1,
    ENGAGEMENT: 2,
    FIXED_POSITION: 3,
    PROMOTION: 4,
    SPONSORED: 5,
    END_OF_FEED_CONTENT: 6,
    FB_STORIES: 7,
    HIGH_VALUE_PROMOTION: 8,
    FB_STORIES_ENGAGEMENT: 9,
    SHOWCASE: 10,
    FB_SHORTS: 11,
    TRENDING: 12,
    ENGAGEMENT_QP: 13,
    MULTI_FB_STORIES_TRAY: 14,
    END_OF_FEED_REELS: 15,
    FB_SHORTS_FALLBACK: 16,
    FRIENDLY_FEED_MID_CARD: 17,
    FRIENDLY_FEED_PROMOTION: 18,
    INJECTED_STORY: 19,
    LIMITED_PERSONALIZATION_NOTICE: 20
  });
  var REASONS = Object.freeze([
    "no-node",
    "unit",
    "sponsored-data",
    "category",
    "sponsored-label",
    "auction-distance",
    "unconnected",
    "recommended",
    "follow-suggestion",
    "join-suggestion",
    "ai"
  ]);
  var NON_STORY_UNITS = /* @__PURE__ */ new Set([
    "PaginatedPeopleYouMayKnowFeedUnit",
    "FriendRequestsFeedUnit",
    "GroupsYouShouldJoinFeedUnit",
    "GroupsMultiGYSJStoryUnit",
    "GroupRelatedGroupsFeedUnit",
    "GroupsTabCategoriesUnit",
    "PagesYouMayLikeFeedUnit",
    "StoriesTrayFeedUnit",
    "StoriesSingleBucketInlineViewerFeedUnit",
    "ShowcaseFeedUnit",
    "FBShortsMidCardFeedUnit",
    "XFBDummyReelsInWatchIFU",
    "QuickPromotionFeedUnit",
    "QuickPromotionNativeTemplateFeedUnit",
    "EndOfFeedUpsellFeedUnit",
    "CommunityTabTrendingPOGFeedUnit",
    "GoodwillCometStory",
    "CustomizedStory",
    "MarketplaceFeedAdStory",
    "AdsSideFeedUnit"
  ]);
  var KEPT_CATEGORIES = /* @__PURE__ */ new Set(["ORGANIC", "ENGAGEMENT", "UNDECODABLE"]);
  var LIKELY = ["SPONSORED", "ORGANIC", "ENGAGEMENT"];
  var DECODE_ORDER = [...LIKELY, ...Object.keys(CATEGORY_NUMBERS).filter((name) => !LIKELY.includes(name))];
  var SPONSORED_DATA_KEYS = ["sponsored_data", "daspo_sto", "th_dat_spo"];
  var AUCTION_KEYS = ["sponsored_auction_distance", "the_disan_sonsore_auctigo", "new_sponsorw_distn_aucton_of", "sposnsor_new_distac_action"];
  var SUSPECT_KEY = /spo|spn|auct|adv/i;
  var isObj2 = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  var nonEmpty = (v) => typeof v === "string" && v !== "";
  async function webCryptoSha256Hex(text2) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text2)));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function createClassifier({ sha256Hex = webCryptoSha256Hex, hideAI = false } = {}) {
    async function edgeCategory(edge) {
      if (nonEmpty(edge.category)) return edge.category;
      const sensitive = [edge.cat_sensitive, edge.category_sensitive].find(isObj2);
      if (!sensitive) return null;
      if (nonEmpty(sensitive.cat)) return sensitive.cat;
      if (!nonEmpty(sensitive.enc)) return null;
      const name = await decodeCategory(sensitive.enc.toLowerCase(), edge.node.post_id);
      health.count(name ? "classify.enc.decoded" : "classify.enc.undecodable");
      return name ?? "UNDECODABLE";
    }
    async function decodeCategory(enc, postId) {
      if (postId == null || postId === "") return null;
      const hex = async (s) => String(await sha256Hex(s)).toLowerCase();
      try {
        const seed = await hex(String(postId));
        for (const name of DECODE_ORDER) {
          if (await hex(seed + CATEGORY_NUMBERS[name]) === enc) return name;
        }
      } catch (err) {
        health.error("classify.sha256", err);
      }
      return null;
    }
    async function decide(edge) {
      const node = edge?.node;
      if (!isObj2(node)) return drop("no-node");
      if (node.__typename !== "Story") {
        const typename = node.__typename ?? "unknown";
        if (!NON_STORY_UNITS.has(typename)) health.count("classify.unknown-unit");
        return drop(`unit:${typename}`);
      }
      const signals = scanStory(node);
      if (signals.sponsoredData || SPONSORED_DATA_KEYS.some((key) => node[key] != null)) return drop("sponsored-data");
      const category = await edgeCategory(edge);
      if (category != null && !KEPT_CATEGORIES.has(category)) return drop(`category:${category}`, category);
      if (signals.sponsoredLabel) return drop("sponsored-label", category);
      if (AUCTION_KEYS.some((key) => edge[key] != null)) return drop("auction-distance", category);
      noteSuspectKeys(edge);
      if (signals.unconnected) return drop("unconnected", category);
      const suggestion = suggestionReason(node);
      if (suggestion) return drop(suggestion, category);
      if (hideAI && signals.ai) return drop("ai", category);
      return { keep: true, reason: "keep", category };
    }
    async function classify(edge) {
      let verdict;
      try {
        verdict = await decide(edge);
      } catch (err) {
        health.error("classify", err);
        verdict = { keep: true, reason: "error", category: null };
      }
      health.count(`classify.${verdict.reason}`);
      return verdict;
    }
    return { classify };
  }
  var drop = (reason, category = null) => ({ keep: false, reason, category });
  function scanStory(node) {
    const signals = { sponsoredData: false, sponsoredLabel: false, unconnected: false, ai: false };
    findInStory(node, (o) => {
      if (o.__typename === "SponsoredData") signals.sponsoredData = true;
      if (o.__typename === "CometStorySponsoredLabelStrategy") signals.sponsoredLabel = true;
      if (o.unconnected_waist_data != null) signals.unconnected = true;
      if (isAiLabel(o)) signals.ai = true;
      return false;
    });
    return signals;
  }
  function suggestionReason(node) {
    const title = node.comet_sections?.context_layout?.story?.comet_sections?.title;
    const scope = isObj2(title) ? title : node;
    if (findInStory(scope, (o) => o.recommendation_context != null)) return "recommended";
    if (findInStory(scope, (o) => o.__typename === "CometFeedStoryFollowButtonStrategy")) return "follow-suggestion";
    if (findInStory(scope, (o) => o.__typename === "GroupJoinForumAction" && o.group?.viewer_forum_join_state === "CAN_JOIN")) return "join-suggestion";
    return null;
  }
  function noteSuspectKeys(edge) {
    for (const [key, value] of Object.entries(edge)) {
      if (value != null && SUSPECT_KEY.test(key) && !AUCTION_KEYS.includes(key)) health.count(`classify.suspect-key:${key}`);
    }
  }

  // src/data/feed-source.js
  var FEED_QUERY = "CometModernHomeFeedQuery";
  var FEED_STYLES = Object.freeze({
    friends: "MOST_RECENT_FRIENDS_FEED",
    groups: "MOST_RECENT_GROUPS_FEED",
    pages: "MOST_RECENT_PAGES_FEED",
    favorites: "FAVORITES_FEED",
    all: "MOST_RECENT_FEED_DEFAULT",
    top: "DEFAULT"
  });
  var MAX_EMPTY_PAGES = 3;
  function feedVariables(template, { feedStyle, orderby, cursor, scale }) {
    return {
      ...template,
      feedStyle,
      orderby,
      feedEndCursor: cursor ?? null,
      refreshMode: "COLD_START",
      scale: Math.max(2, Number(scale) || 0, Number(template.scale) || 0)
    };
  }
  function createFeedSource({
    name,
    client,
    ops,
    harvest,
    classifier = createClassifier(),
    scale,
    extract = extractStory,
    codec = DEFAULT_CODEC
  }) {
    const feedStyle = FEED_STYLES[name];
    if (!feedStyle) throw new Error(`unknown feed source "${name}"`);
    const orderby = name === "top" ? ["TOP_STORIES"] : ["MOST_RECENT"];
    let cursor, seenCursors, ssrPending, emptyPages;
    let generation = 0;
    let queue = Promise.resolve();
    const source = { name, done: false, next, reset };
    reset();
    return source;
    function reset() {
      generation++;
      cursor = null;
      seenCursors = /* @__PURE__ */ new Set();
      ssrPending = true;
      emptyPages = 0;
      source.done = false;
    }
    function next() {
      const run = queue.then(readPage);
      queue = run.catch(() => {
      });
      return run;
    }
    async function readPage() {
      if (source.done) return { stories: [], dropped: {} };
      const gen = generation;
      await harvest.ready;
      const ssr = ssrPending ? ssrConnection() : null;
      ssrPending = false;
      const connection = ssr ?? await fetchConnection();
      const page = await readEdges(connection.edges);
      if (gen === generation) advance(connection, !!ssr);
      return page;
    }
    function ssrConnection() {
      const preloader = harvest.preloaders?.get(FEED_QUERY);
      if (preloader?.variables?.feedStyle !== feedStyle || !sameOrder(preloader.variables.orderby)) return null;
      const payloads = harvest.prefetched?.get(preloader.preloaderID);
      if (!payloads?.length) return null;
      const connection = decodePayloads(payloads, harvest.env?.typenamePairs, codec).data?.viewer?.news_feed;
      if (connection) health.count("feed.ssrPage");
      return connection ?? null;
    }
    function sameOrder(preloaded) {
      return preloaded == null || JSON.stringify(preloaded) === JSON.stringify(orderby);
    }
    async function fetchConnection() {
      const res = await runOp({ client, ops }, FEED_QUERY, (op) => {
        if (!op.variables) throw new GqlError(`no ${FEED_QUERY} variables template`, { kind: "variables" });
        return feedVariables(op.variables, { feedStyle, orderby, cursor, scale });
      });
      if (!res) throw new GqlError(`no doc_id for ${FEED_QUERY}`, { kind: "stale-doc" });
      const connection = res.data?.viewer?.news_feed;
      if (connection == null || typeof connection !== "object") {
        const first = res.errors?.[0];
        throw new GqlError(String(first?.message || "response without news_feed"), { code: first?.code ?? null, kind: errorKind(first?.code) });
      }
      health.count("feed.pages");
      return connection;
    }
    async function readEdges(edges) {
      const stories = [];
      const dropped = {};
      const drop2 = (reason) => dropped[reason] = (dropped[reason] || 0) + 1;
      for (const edge of Array.isArray(edges) ? edges : []) {
        if (!edge) {
          drop2("no-node");
          continue;
        }
        const verdict = await classifier.classify(edge);
        if (!verdict?.keep) {
          drop2(verdict?.reason || "unknown");
          continue;
        }
        const story = extract(edge.node, { sources: [name], dedupKey: edge.deduplication_key });
        if (story) stories.push(story);
        else drop2("unparsed");
      }
      return { stories, dropped };
    }
    function advance(connection, fromSsr) {
      const info2 = connection.page_info;
      if (fromSsr && !info2) return;
      const edgeCount = Array.isArray(connection.edges) ? connection.edges.filter(Boolean).length : 0;
      emptyPages = edgeCount ? 0 : emptyPages + 1;
      const end = info2?.end_cursor;
      if (info2?.has_next_page === false || !end || seenCursors.has(end) || emptyPages >= MAX_EMPTY_PAGES) {
        source.done = true;
        return;
      }
      seenCursors.add(end);
      cursor = end;
    }
  }

  // src/data/text.js
  var isObj3 = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  function textSegments(text2, ranges) {
    const s = typeof text2 === "string" ? text2 : "";
    if (!s) return [];
    const out = [];
    let pos = 0;
    for (const r of usableRanges(s, ranges)) {
      if (r.offset > pos) out.push({ text: s.slice(pos, r.offset) });
      out.push({ text: s.slice(r.offset, r.offset + r.length), url: r.url, kind: r.kind });
      pos = r.offset + r.length;
    }
    if (pos < s.length) out.push({ text: s.slice(pos) });
    return out;
  }
  function usableRanges(s, ranges) {
    const candidates = (Array.isArray(ranges) ? ranges : []).filter(isObj3).map((r) => ({ offset: r.offset, length: r.length, kind: typeof r.kind === "string" ? r.kind : "other", url: linkOf(r) })).filter((r) => fits(s, r) && r.url).sort((a, b) => a.offset - b.offset || b.length - a.length);
    const accepted = [];
    let end = 0;
    for (const r of candidates) {
      if (r.offset < end) continue;
      accepted.push(r);
      end = r.offset + r.length;
    }
    return accepted;
  }
  function linkOf(r) {
    return cleanPermalink(r.kind === "link" ? unwrapLinkShim(r.url) : r.url);
  }
  function fits(s, r) {
    const { offset, length } = r;
    if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length <= 0) return false;
    return offset + length <= s.length && !splitsPair(s, offset) && !splitsPair(s, offset + length);
  }
  function splitsPair(s, i) {
    if (i <= 0 || i >= s.length) return false;
    const before2 = s.charCodeAt(i - 1);
    const after = s.charCodeAt(i);
    return before2 >= 55296 && before2 <= 56319 && after >= 56320 && after <= 57343;
  }
  function matchesKeywords(story, keywords) {
    const needles = (Array.isArray(keywords) ? keywords : []).map(normLabel).filter(Boolean);
    if (!needles.length) return false;
    return searchableTexts(story).some((t2) => {
      const hay = normLabel(t2);
      return needles.some((n) => hay.includes(n));
    });
  }
  function searchableTexts(story) {
    const out = [];
    for (let s = story, depth = 0; isObj3(s) && depth < 3; s = s.shared, depth++) {
      for (const t2 of [s.text, s.title]) if (typeof t2 === "string" && t2) out.push(t2);
    }
    return out;
  }

  // src/data/merge.js
  var FATAL = /* @__PURE__ */ new Set(["auth", "checkpoint"]);
  var TRANSIENT = /* @__PURE__ */ new Set(["network", "server", "rate", "soft-block", "token"]);
  function createMergedFeed({ sources, pageSize = 10, keywords = [], maxFetches = 6, matches = matchesKeywords }) {
    const lanes = sources.map((src) => ({ src, buf: [], oldest: Infinity, lastTime: null, failed: null, fetched: 0, kept: 0, dropped: {} }));
    const ordered = lanes.length > 1;
    const byKey = /* @__PURE__ */ new Map();
    const counts = { emitted: 0, duplicates: 0, keyword: 0 };
    const feed = { more, exhausted: lanes.length === 0, stats };
    return feed;
    async function more() {
      const out = [];
      let fetches = 0;
      for (; ; ) {
        drain(out);
        if (out.length >= pageSize) break;
        const lane = laggard();
        if (!lane || fetches++ >= maxFetches) break;
        try {
          await pull(lane);
        } catch (err) {
          if (FATAL.has(err?.kind) || TRANSIENT.has(err?.kind)) {
            if (out.length) break;
            throw err;
          }
          retire(lane, err);
        }
      }
      feed.exhausted = lanes.every((l) => finished(l) && !l.buf.length);
      const failures = lanes.filter((l) => l.failed);
      if (!out.length && feed.exhausted && failures.length === lanes.length && lanes.length) throw failures[0].failed;
      return out;
    }
    function drain(out) {
      const mark = watermark();
      while (out.length < pageSize) {
        const lane = newestHead();
        if (!lane || lane.buf[0].t < mark) return;
        const { story } = lane.buf.shift();
        if (keywords.length && matches(story, keywords)) {
          counts.keyword++;
          continue;
        }
        out.push(story);
        counts.emitted++;
      }
    }
    function watermark() {
      let mark = -Infinity;
      for (const l of lanes) if (!finished(l)) mark = Math.max(mark, l.oldest);
      return mark;
    }
    function newestHead() {
      let best = null;
      for (const l of lanes) if (l.buf.length && (!best || l.buf[0].t > best.buf[0].t)) best = l;
      return best;
    }
    function laggard() {
      let best = null;
      for (const l of lanes) if (!finished(l) && (!best || l.oldest > best.oldest)) best = l;
      return best;
    }
    function finished(lane) {
      return lane.src.done || !!lane.failed;
    }
    async function pull(lane) {
      const page = await lane.src.next();
      lane.fetched++;
      for (const [reason, n] of Object.entries(page?.dropped ?? {})) lane.dropped[reason] = (lane.dropped[reason] || 0) + n;
      for (const story of page?.stories ?? []) admit(lane, story);
    }
    function admit(lane, story) {
      const t2 = Number.isFinite(story.time) ? story.time : lane.lastTime ?? Number.MAX_SAFE_INTEGER;
      lane.lastTime = t2;
      lane.oldest = Math.min(lane.oldest, t2);
      const known = story.key != null ? byKey.get(story.key) : null;
      if (known) {
        for (const s of story.sources ?? []) if (!known.sources.includes(s)) known.sources.push(s);
        counts.duplicates++;
        return;
      }
      if (story.key != null) byKey.set(story.key, story);
      story.sources = [...story.sources ?? []];
      lane.kept++;
      insert(lane, { story, t: t2 });
    }
    function insert(lane, item) {
      let at = lane.buf.length;
      if (ordered) while (at > 0 && lane.buf[at - 1].t < item.t) at--;
      lane.buf.splice(at, 0, item);
    }
    function retire(lane, err) {
      lane.failed = err;
      health.count("feed.sourceFailed");
      health.error(`feed.${lane.src.name}`, err);
    }
    function stats() {
      const hidden = { keyword: counts.keyword };
      const perSource = {};
      for (const l of lanes) {
        for (const [reason, n] of Object.entries(l.dropped)) hidden[reason] = (hidden[reason] || 0) + n;
        perSource[l.src.name] = {
          fetched: l.fetched,
          kept: l.kept,
          buffered: l.buf.length,
          done: !!l.src.done,
          failed: l.failed ? l.failed.kind || "error" : null,
          dropped: { ...l.dropped }
        };
      }
      return { ...counts, hidden, sources: perSource };
    }
  }

  // src/data/actions.js
  var REACTIONS = Object.freeze({
    LIKE: "1635855486666999",
    LOVE: "1678524932434102",
    CARE: "613557422527858",
    HAHA: "115940658764963",
    WOW: "478547315650144",
    SAD: "908563459236466",
    ANGRY: "444813342392137",
    NONE: "0"
  });
  var ACTION_OPS = Object.freeze({
    react: "CometUFIFeedbackReactMutation",
    comment: "useCometUFICreateCommentMutation",
    comments: "CommentsListComponentsPaginationQuery"
  });
  var HOME_BOOKMARK_ID = "4748854339";
  var isObject2 = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  function assignPresent(target, values) {
    for (const [key, value] of Object.entries(values)) if (key in target && value !== void 0) target[key] = value;
  }
  function createSessionIds({ uuid: uuid2 = uuid, now = Date.now, random = Math.random } = {}) {
    const startTime = String(now());
    const navId = String(1e5 + Math.floor(random() * 9e5));
    return {
      sessionId: uuid2(),
      shareSessionId: uuid2(),
      assistantSessionId: uuid2(),
      startTime,
      attribution: `CometHomeRoot.react,comet.home,via_cold_start,${startTime},${navId},${HOME_BOOKMARK_ID},,`
    };
  }
  function reactTemplate(ids) {
    return {
      input: {
        attribution_id_v2: ids.attribution,
        feedback_id: null,
        feedback_reaction_id: null,
        feedback_source: "NEWS_FEED",
        feedback_referrer: null,
        is_tracking_encrypted: true,
        tracking: [],
        session_id: ids.sessionId,
        downstream_share_session_id: ids.shareSessionId,
        downstream_share_session_origin_uri: null,
        downstream_share_session_start_time: ids.startTime,
        actor_id: null,
        client_mutation_id: null
      },
      scale: 1,
      canUseNicknameOnComet: false,
      useDefaultActor: false,
      __relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider: false
    };
  }
  function commentTemplate(ids) {
    const assistant = { assistant_caller: "comet_above_composer", conversation_guide_session_id: ids.assistantSessionId, conversation_guide_shown: null };
    return {
      feedLocation: "POST_PERMALINK_DIALOG",
      feedbackSource: 2,
      groupID: null,
      input: {
        client_mutation_id: null,
        attachments: null,
        feedback_id: null,
        formatting_style: null,
        is_inline_vote_enabled_for_qna: false,
        message: { ranges: [], text: "" },
        attribution_id_v2: ids.attribution,
        vod_video_timestamp: null,
        is_tracking_encrypted: true,
        tracking: [JSON.stringify(assistant)],
        feedback_source: "OBJECT",
        idempotence_token: null,
        session_id: ids.sessionId,
        downstream_share_session_id: ids.shareSessionId,
        downstream_share_session_origin_uri: null,
        downstream_share_session_start_time: ids.startTime
      },
      inviteShortLinkKey: null,
      renderLocation: null,
      scale: 1,
      useDefaultActor: false,
      focusCommentID: null,
      translationType: "AUTO_TRANSLATE",
      canUseNicknameOnComet: false,
      __relay_internal__pv__groups_comet_use_glvrelayprovider: false,
      __relay_internal__pv__CometUFICommentActionLinksRewriteEnabledrelayprovider: true,
      __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider: false,
      __relay_internal__pv__IsWorkUserrelayprovider: false,
      __relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider: "AUTO_TRANSLATE"
    };
  }
  function reactVariables(template, p) {
    const v = structuredClone(template);
    const input = isObject2(v.input) ? v.input : v.input = {};
    Object.assign(input, { feedback_id: p.feedbackId, feedback_reaction_id: p.reactionId, client_mutation_id: p.mutationId });
    assignPresent(input, {
      actor_id: p.userId,
      tracking: p.tracking ? [p.tracking] : [],
      feedback_referrer: p.referrer,
      downstream_share_session_origin_uri: p.originUri
    });
    return v;
  }
  function commentVariables(template, p) {
    const v = structuredClone(template);
    if ("groupID" in v) v.groupID = p.groupId ?? null;
    const input = isObject2(v.input) ? v.input : v.input = {};
    Object.assign(input, {
      client_mutation_id: p.mutationId,
      feedback_id: p.feedbackId,
      message: { ranges: [], text: p.text },
      idempotence_token: p.idempotenceToken
    });
    const plain = (Array.isArray(input.tracking) ? input.tracking : []).filter((s) => typeof s === "string" && s.startsWith("{"));
    assignPresent(input, { tracking: p.tracking ? [p.tracking, ...plain] : [], downstream_share_session_origin_uri: p.originUri });
    assignPresent(input, { attachments: null, formatting_style: null, vod_video_timestamp: null, reply_comment_parent_fbid: null });
    assignPresent(v, { focusCommentID: null });
    return v;
  }
  function commentsVariables(template, { feedbackId, cursor }) {
    const base = isObject2(template) ? structuredClone(template) : { commentsAfterCount: -1, commentsAfterCursor: null, feedLocation: "POST_PERMALINK_DIALOG", id: null };
    return { ...base, id: feedbackId, commentsAfterCursor: cursor ?? null };
  }
  function referrerOf(url) {
    try {
      const u = new URL(url);
      return u.pathname + u.search;
    } catch {
      return "/";
    }
  }
  function failedKind(res, payload) {
    return payload == null && res.errors?.length ? errorKind(res.errors[0]?.code) : null;
  }
  function echoedReaction(feedback, requested) {
    if (isObject2(feedback) && "viewer_feedback_reaction_info" in feedback) {
      const info2 = feedback.viewer_feedback_reaction_info;
      return info2 ? String(info2.id ?? requested) : null;
    }
    return requested === REACTIONS.NONE ? null : requested;
  }
  function createActions({ client, ops, harvest, extractComment: extractComment2 = extractComment, uuid: uuid2 = uuid, now = Date.now, random = Math.random }) {
    const ids = createSessionIds({ uuid: uuid2, now, random });
    let mutationCounter = 0;
    const nextMutationId = () => String(++mutationCounter);
    return {
      async react(story, reactionId) {
        const feedbackId = story?.feedback?.id;
        if (!feedbackId) return { ok: false, error: "no-feedback" };
        if (!/^\d+$/.test(String(reactionId))) return { ok: false, error: "bad-reaction" };
        try {
          const res = await runOp(
            { client, ops },
            ACTION_OPS.react,
            (op) => reactVariables(op.variables?.input ? op.variables : reactTemplate(ids), {
              feedbackId,
              reactionId: String(reactionId),
              userId: harvest.tokens.userId,
              mutationId: nextMutationId(),
              tracking: story.tracking,
              referrer: story.url ? referrerOf(story.url) : "/",
              originUri: story.url || "https://www.facebook.com/"
            })
          );
          if (!res) return { ok: false, error: "unavailable" };
          const failed = failedKind(res, res.data?.feedback_react);
          if (failed) return failure("react", { kind: failed });
          health.count("actions.react");
          const feedback = res.data?.feedback_react?.feedback;
          const count2 = feedback?.reaction_count?.count;
          return { ok: true, reactions: Number.isFinite(count2) ? count2 : void 0, viewerReaction: echoedReaction(feedback, String(reactionId)) };
        } catch (err) {
          return failure("react", err);
        }
      },
      async comment(story, text2) {
        const feedbackId = story?.feedback?.id;
        const message = String(text2 ?? "").trim();
        if (!feedbackId) return { ok: false, error: "no-feedback" };
        if (!message) return { ok: false, error: "empty" };
        if (story.feedback.canComment === false) return { ok: false, error: "disabled" };
        try {
          const res = await runOp(
            { client, ops },
            ACTION_OPS.comment,
            (op) => commentVariables(op.variables?.input ? op.variables : commentTemplate(ids), {
              feedbackId,
              groupId: story.groupId ?? null,
              text: message,
              mutationId: nextMutationId(),
              idempotenceToken: `client:${uuid2()}`,
              tracking: story.tracking,
              originUri: story.url || "https://www.facebook.com/"
            })
          );
          if (!res) return { ok: false, error: "unavailable" };
          const created = res.data?.comment_create;
          if (!created) return { ok: false, error: failedKind(res, created) ?? "no-echo" };
          health.count("actions.comment");
          const node = created.feedback_comment_edge?.node;
          const echoed = node ? extractComment2(node) : null;
          return { ok: true, comment: echoed?.text ? echoed : ownComment(node?.id ?? null, message) };
        } catch (err) {
          return failure("comment", err);
        }
      },
      async comments(story, cursor) {
        const feedbackId = story?.feedback?.id;
        const empty = { ok: false, comments: [], cursor: cursor ?? null, hasMore: false };
        if (!feedbackId) return { ...empty, error: "no-feedback" };
        try {
          const res = await runOp({ client, ops }, ACTION_OPS.comments, (op) => commentsVariables(op.variables, { feedbackId, cursor }));
          if (!res) return { ...empty, error: "unavailable" };
          const connection = res.data?.node?.comment_rendering_instance_for_feed_location?.comments;
          const failed = failedKind(res, connection);
          if (failed) return { ...empty, ...failure("comments", { kind: failed }) };
          const comments = (Array.isArray(connection?.edges) ? connection.edges : []).map((e) => e?.node ? extractComment2(e.node) : null).filter(Boolean);
          const info2 = connection?.page_info;
          return { ok: true, comments, cursor: info2?.end_cursor ?? null, hasMore: info2?.has_next_page === true };
        } catch (err) {
          return { ...failure("comments", err), comments: [], cursor: cursor ?? null, hasMore: false };
        }
      },
      async can(action) {
        const name = ACTION_OPS[action];
        return !!name && !!await ops.get(name);
      }
    };
    function ownComment(id, text2) {
      const { userId, name } = harvest.tokens;
      return {
        id,
        author: { id: userId, name: name ?? null, url: userId ? `https://www.facebook.com/profile.php?id=${userId}` : null, avatar: null },
        text: text2,
        ranges: [],
        time: Math.floor(now() / 1e3),
        reactions: 0,
        replies: 0
      };
    }
    function failure(action, err) {
      health.count(`actions.${action}.failed`);
      if (!err?.kind) warn(`${action} failed`, err);
      return { ok: false, error: err?.kind || "error" };
    }
  }

  // src/fb/routes.js
  var HOME_PATHS = /* @__PURE__ */ new Set(["/", "/home.php"]);
  var GROUPS_FEED = /^\/groups\/feed\/?$/;
  function toUrl(loc) {
    if (typeof loc === "string") return new URL(loc, "https://www.facebook.com/");
    return { pathname: loc?.pathname || "/", search: loc?.search || "" };
  }
  function classifyRoute(loc = location) {
    const { pathname, search } = toUrl(loc);
    const path = pathname.replace(/\/{2,}/g, "/") || "/";
    const params = new URLSearchParams(search);
    let mode = "page";
    if (HOME_PATHS.has(path)) mode = "home";
    else if (GROUPS_FEED.test(path)) mode = "groups-feed";
    return { mode, filter: params.get("filter") || null, sk: params.get("sk") || null, path };
  }
  function routeKey(loc = location) {
    const { pathname, search } = toUrl(loc);
    return pathname + search;
  }
  function onRouteChange(cb, { interval = 250 } = {}) {
    let key = routeKey();
    let route = classifyRoute();
    const check = () => {
      const next = routeKey();
      if (next === key) return;
      const prev = route;
      key = next;
      route = classifyRoute();
      cb(route, prev);
    };
    const timer = setInterval(check, interval);
    addEventListener("popstate", check);
    return () => {
      clearInterval(timer);
      removeEventListener("popstate", check);
    };
  }
  function effectiveMode(route, prevMode, pushViewOpen2) {
    if (route.mode === "page" && pushViewOpen2 && (prevMode === "home" || prevMode === "groups-feed")) return prevMode;
    return route.mode;
  }

  // src/fb/layout.js
  var HOST_ID = "mfga-shell";
  var VARS_ID = "mfga-layout-vars";
  var ENSURE_MS = 1e3;
  var PUSH_VIEW_MIN_WIDTH = 450;
  var hasColumns = (mode) => mode === "home" || mode === "groups-feed";
  function readSettings(settings) {
    return (typeof settings?.get === "function" ? settings.get() : settings) || DEFAULTS;
  }
  function mountRoot(doc = document) {
    const root = doc.querySelector('body > div[id^="mount_"]') || doc.querySelector('div[id^="mount_"]');
    if (!root || !doc.body) return root;
    let el = root;
    while (el.parentElement && el.parentElement !== doc.body) el = el.parentElement;
    return el.parentElement === doc.body ? el : root;
  }
  function placeHost(host, doc) {
    const root = mountRoot(doc);
    if (root?.parentNode) {
      if (host.nextSibling !== root) root.parentNode.insertBefore(host, root);
    } else if (doc.body && host.parentNode !== doc.body) {
      doc.body.prepend(host);
    } else if (!host.parentNode && doc.documentElement) {
      doc.documentElement.appendChild(host);
    }
  }
  function shellHost(doc = document) {
    let host = doc.getElementById(HOST_ID);
    if (!host) {
      host = doc.createElement("div");
      host.id = HOST_ID;
      host.className = "mfga-ui";
    }
    placeHost(host, doc);
    return host;
  }
  function findMain(doc = document) {
    return [...doc.querySelectorAll('[role="main"]')].find((m) => !m.closest('[role="dialog"]')) || null;
  }
  function pushViewOpen(doc = document) {
    const root = mountRoot(doc);
    if (!root) return false;
    const mid = doc.documentElement.clientWidth / 2;
    return [...root.querySelectorAll('[role="dialog"]')].some((d) => {
      if (d.closest('[role="banner"]')) return false;
      const r = d.getBoundingClientRect();
      return r.width >= PUSH_VIEW_MIN_WIDTH && r.left <= mid && r.right >= mid;
    });
  }
  function findBanner(doc = document) {
    return [...doc.querySelectorAll('[role="banner"]')].find((b) => !b.closest(`[role="dialog"], #${HOST_ID}`)) || null;
  }
  function passThroughMarks(anchor, doc = document) {
    const chain = [];
    for (let el = anchor.parentElement; el && el !== doc.body && el !== doc.documentElement; el = el.parentElement) chain.push(el);
    const inChain = new Set(chain);
    const rails = [];
    for (const el of chain) {
      for (const child of el.children) {
        if (child === anchor || inChain.has(child) || child.id === HOST_ID) continue;
        const isRail = child.matches('[role="navigation"], [role="complementary"]') || child.querySelector('[role="navigation"], [role="complementary"]');
        const isLayer = child.matches('[role="banner"], [role="dialog"]') || child.querySelector('[role="banner"], [role="dialog"]');
        if (isRail && !isLayer) rails.push(child);
      }
    }
    return { chain, rails };
  }
  function syncObserved(ro, observed, targets) {
    const next = /* @__PURE__ */ new Set();
    for (const el of targets) if (el?.isConnected) next.add(el);
    for (const el of observed) if (!next.has(el)) ro.unobserve(el);
    for (const el of next) if (!observed.has(el)) ro.observe(el);
    return next;
  }
  function createLayout({ settings } = {}) {
    const doc = document;
    const html = doc.documentElement;
    let route = null;
    let mode = null;
    let main = null;
    let marked = /* @__PURE__ */ new Map();
    let vars = { dx: 0, dy: 0, footer: 0 };
    let varsEl = null;
    let ro = null;
    let observed = /* @__PURE__ */ new Set();
    let timer = 0;
    const writeVars = (next) => {
      if (next.dx === vars.dx && next.dy === vars.dy && next.footer === vars.footer && varsEl?.isConnected) return;
      vars = next;
      if (!varsEl?.isConnected) {
        varsEl = doc.getElementById(VARS_ID) || doc.createElement("style");
        varsEl.id = VARS_ID;
        (doc.head || html).appendChild(varsEl);
      }
      varsEl.textContent = `:root{--mfga-main-dx:${next.dx}px;--mfga-main-dy:${next.dy}px;--mfga-footer-top:${next.footer}px}`;
    };
    const setMarks = (next) => {
      for (const [el, attr] of marked) if (next.get(el) !== attr) el.removeAttribute(attr);
      for (const [el, attr] of next) if (marked.get(el) !== attr) el.setAttribute(attr, attr === "data-mfga-chrome" ? "rail" : "");
      marked = next;
    };
    const markPage = () => {
      const found = findMain(doc);
      main = hasColumns(mode) ? found : null;
      const anchor = found || findBanner(doc);
      if (!anchor) return setMarks(/* @__PURE__ */ new Map());
      const { chain, rails } = passThroughMarks(anchor, doc);
      const next = new Map(chain.map((el) => [el, "data-mfga-pass"]));
      if (main) {
        next.set(main, "data-mfga-main");
        for (const el of rails) next.set(el, "data-mfga-chrome");
      }
      setMarks(next);
    };
    const observeTargets = () => {
      observed = syncObserved(ro, observed, [html, mountRoot(doc), main, ...doc.querySelectorAll(`#${HOST_ID} .mfga-shell-col`)]);
    };
    const round = (n) => Math.round(n * 100) / 100;
    const contentBottom = (nextDy) => {
      const sy = scrollY;
      let bottom = GRID.bar;
      const root = mountRoot(doc);
      if (root) bottom = Math.max(bottom, root.getBoundingClientRect().top + sy + root.scrollHeight);
      if (main?.isConnected) bottom = Math.max(bottom, main.getBoundingClientRect().bottom + sy + nextDy - vars.dy);
      for (const col of doc.querySelectorAll(`#${HOST_ID} .mfga-shell-col`)) {
        if (col.offsetParent) bottom = Math.max(bottom, col.getBoundingClientRect().bottom + sy);
      }
      return bottom;
    };
    const measure = safe("layout", () => {
      if (!mode) return;
      const slot = mainSlot(mode, html.clientWidth);
      let dx = 0;
      let dy = 0;
      if (slot && main?.isConnected) {
        const r = main.getBoundingClientRect();
        if (!r.width) return;
        dx = round(slot.left - (r.left + scrollX - vars.dx));
        dy = round(slot.top - (r.top + scrollY - vars.dy));
      }
      writeVars({ dx, dy, footer: round(contentBottom(dy) + GRID.footerGap) });
    });
    const scheduleMeasure = rafBatch(measure);
    const start = () => {
      if (timer) return;
      ro = new ResizeObserver(scheduleMeasure);
      observed = /* @__PURE__ */ new Set();
      timer = setInterval(ensure, ENSURE_MS);
    };
    const stop = () => {
      clearInterval(timer);
      timer = 0;
      ro?.disconnect();
      ro = null;
      observed = /* @__PURE__ */ new Set();
    };
    const teardown = () => {
      stop();
      mode = null;
      setMarks(/* @__PURE__ */ new Map());
      main = null;
      for (const a of ["data-mfga-shell", "data-mfga-route", "data-mfga-fixed-header"]) html.removeAttribute(a);
      writeVars({ dx: 0, dy: 0, footer: 0 });
      const host = doc.getElementById(HOST_ID);
      if (host) host.hidden = true;
    };
    const apply = safe("layout", (nextRoute) => {
      route = nextRoute || route;
      const s = readSettings(settings);
      if (!route || !s.enabled || !s.look?.shell) return teardown();
      mode = effectiveMode(route, mode, pushViewOpen(doc));
      html.setAttribute("data-mfga-shell", "");
      html.setAttribute("data-mfga-route", mode);
      html.toggleAttribute("data-mfga-fixed-header", !!s.look.fixedHeader);
      const host = shellHost(doc);
      host.hidden = false;
      start();
      markPage();
      observeTargets();
      measure();
      health.count(`layout.apply.${mode}`);
    });
    function ensure() {
      if (!mode) return;
      shellHost(doc);
      if (route && route.mode !== mode && !pushViewOpen(doc)) return apply(route);
      markPage();
      observeTargets();
      measure();
    }
    const unsubscribe = typeof settings?.subscribe === "function" ? settings.subscribe(() => route && apply(route)) : null;
    return {
      apply,
      measure,
      destroy() {
        unsubscribe?.();
        teardown();
        varsEl?.remove();
        doc.getElementById(HOST_ID)?.remove();
      }
    };
  }

  // src/fb/nav.js
  var HELPER_WAIT_MS = 1500;
  var APP_HOSTS = /* @__PURE__ */ new Set(["www.facebook.com", "web.facebook.com", "facebook.com"]);
  function normPath(pathname) {
    return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  }
  function samePlace(a, b) {
    return a.origin === b.origin && normPath(a.pathname) === normPath(b.pathname) && a.search === b.search;
  }
  function resolveTarget(href, current) {
    let url;
    try {
      url = new URL(href, current.href);
    } catch {
      return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.host !== current.host && APP_HOSTS.has(url.host) && APP_HOSTS.has(current.host)) {
      url.protocol = current.protocol;
      url.host = current.host;
    }
    return url;
  }
  function findNativeAnchor(target, doc = document) {
    const root = mountRoot(doc);
    if (!root) return null;
    for (const a of root.querySelectorAll("a[href]")) {
      if (a.target && a.target !== "_self" || a.closest(".mfga-ui")) continue;
      let u;
      try {
        u = new URL(a.getAttribute("href"), doc.baseURI);
      } catch {
        continue;
      }
      if (samePlace(u, target)) return a;
    }
    return null;
  }
  function createNavigator({ platform } = {}) {
    const assign = (url) => {
      health.count("nav.assign");
      location.assign(url.href);
    };
    const clickNative = (url) => {
      const a = findNativeAnchor(url);
      if (!a) return false;
      health.count("nav.native-anchor");
      a.click();
      return true;
    };
    const viaHelper = async (url) => {
      const target = url.pathname + url.search + url.hash;
      const timeout = new Promise((resolve) => setTimeout(() => resolve(false), HELPER_WAIT_MS));
      const ok = await Promise.race([platform.page.navigate(target).catch(() => false), timeout]);
      if (ok || routeKey() === url.pathname + url.search) {
        health.count("nav.helper");
        return;
      }
      if (!clickNative(url)) assign(url);
    };
    const go = safe("nav", (href, { hard = false } = {}) => {
      const url = resolveTarget(href, location);
      if (!url) return health.count("nav.refused");
      if (hard || url.origin !== location.origin) return assign(url);
      if (typeof platform?.page?.navigate === "function") return viaHelper(url);
      if (!clickNative(url)) assign(url);
    }, { disableOnError: false });
    return { go };
  }

  // src/fb/chrome-reader.js
  var RAIL_KEY = "mfga:rail";
  var RAIL_VERSION = 2;
  var CONTACTS_FRESH_MS = 10 * 60 * 1e3;
  var REFRESH_GAP_MS = 400;
  var RESCAN_MS = 2e3;
  var ACCOUNT_NAV = /* @__PURE__ */ new Set(["account controls and settings", "mechanizmy kontrolne i ustawienia konta"]);
  var SHORTCUTS_NAV = /* @__PURE__ */ new Set(["shortcuts", "skróty"]);
  var JEWELS = {
    notifications: /* @__PURE__ */ new Set(["notifications", "powiadomienia"]),
    messages: /* @__PURE__ */ new Set(["messenger", "messages", "wiadomości", "chats", "czaty"]),
    profile: /* @__PURE__ */ new Set(["your profile", "twój profil", "account", "konto"]),
    menu: /* @__PURE__ */ new Set(["menu", "facebook menu", "menu facebooka"])
  };
  var COUNT_RE = /,\s*[^\d,]*?(\d+)\+?/;
  var PRESENCE_RE = /,\s*(?:active|aktywn\S*|online)((?:\s.*)?)$/i;
  var AGO_RE = /\b(?:ago|temu)\b/i;
  function parseCount(label) {
    const m = COUNT_RE.exec(String(label ?? ""));
    return m ? Number(m[1]) : 0;
  }
  function jewelKind(label) {
    const head = normLabel(String(label ?? "").split(",")[0]);
    for (const [kind, names] of Object.entries(JEWELS)) if (names.has(head)) return kind;
    return null;
  }
  function countsFromLabels(labels) {
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
  var APOS = "['’]";
  var BIRTHDAY_PATTERNS = [
    [/^(.+?) and (\d+) others? (?:have birthdays|has a birthday) today/i, "others"],
    [/^(.+?) i (\d+) \S+(?: \S+)? mają dziś urodziny/i, "others"],
    [/^(.+?) and (.+?) have birthdays today/i, "list"],
    [/^(.+?) i (.+?) mają dziś urodziny/i, "list"],
    [new RegExp(`^(.+?)${APOS}s? birthday is today`, "i"), "one"],
    [/^(.+?) has a birthday today/i, "one"],
    [/^(.+?) ma dziś urodziny/i, "one"]
  ];
  function parseBirthdays(text2) {
    const s = String(text2 ?? "").replace(/\s+/g, " ").trim();
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
  function parseContactLabel(label) {
    const s = String(label ?? "").replace(/\s+/g, " ").trim();
    const m = PRESENCE_RE.exec(s);
    if (!m) return { name: s, online: false };
    return { name: s.slice(0, m.index).trim(), online: !AGO_RE.test(m[1]) };
  }
  var RESERVED = /* @__PURE__ */ new Set([
    "",
    "friends",
    "onthisday",
    "memories",
    "saved",
    "groups",
    "reel",
    "reels",
    "watch",
    "marketplace",
    "dating",
    "events",
    "messages",
    "pages",
    "ad_campaign",
    "adsmanager",
    "ads",
    "fundraisers",
    "gaming",
    "games",
    "messenger_kids",
    "professional_dashboard",
    "bookmarks",
    "feeds",
    "news",
    "video",
    "live",
    "jobs",
    "weather",
    "me",
    "home.php",
    "notifications",
    "settings",
    "help",
    "privacy",
    "policies",
    "search",
    "photo",
    "photo.php",
    "photos",
    "permalink.php",
    "story.php",
    "stories",
    "hashtag",
    "pokes",
    "business",
    "climatescienceinfo",
    "coronavirus_info",
    "lift",
    "offers",
    "recommendations",
    "community_notes",
    "meta_verified",
    "orders"
  ]);
  var GROUP_RESERVED = /* @__PURE__ */ new Set(["feed", "joins", "discover", "create", "search", "notifications", "your_groups"]);
  function classifyShortcut(href, base = "https://www.facebook.com/") {
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
    if (segs.length === 1 && !RESERVED.has(segs[0].toLowerCase()) && !/\.php$/i.test(segs[0])) {
      return { kind: "profile", url: `https://www.facebook.com/${segs[0]}`, id: segs[0] };
    }
    return { kind: "app", url: u.href, path: `/${segs.join("/")}` };
  }
  function nameAndCount(leaves) {
    const texts = leaves.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
    const isCount2 = (s) => /^\d+\+?$/.test(s);
    const leadingCount = (s) => /^\d+\+?\s/.test(s);
    const name = texts.find((s) => !isCount2(s) && !leadingCount(s)) ?? texts.find((s) => !isCount2(s)) ?? texts[0] ?? "";
    const rest = texts.filter((s) => s !== name);
    const countText = rest.find(isCount2) ?? rest.find(leadingCount);
    return { name, count: countText ? parseInt(countText, 10) : 0 };
  }
  function shortcutsFromRows(rows, { userId = null } = {}) {
    const out = { me: null, groups: [], pages: [], friendsCount: null };
    const seen = /* @__PURE__ */ new Set();
    rows.forEach((row2, i) => {
      const c = classifyShortcut(row2.href);
      if (!c.url || seen.has(c.url)) return;
      seen.add(c.url);
      const item = { name: row2.name, url: c.url, image: row2.image || null, count: row2.count || 0 };
      if (c.kind === "profile" && (i === 0 || userId && c.id === userId) && !out.me) out.me = item;
      else if (c.kind === "profile" && row2.name) out.pages.push(item);
      else if (c.kind === "group" && row2.name) out.groups.push(item);
      else if (c.kind === "app" && /^\/friends$/.test(c.path)) out.friendsCount = row2.count || 0;
    });
    return out;
  }
  function usableCache(cached, userId) {
    if (!cached || cached.v !== RAIL_VERSION) return null;
    return !userId || cached.userId === userId ? cached : null;
  }
  function mergeRail(live, cached, now = Date.now(), userId = null) {
    const c = usableCache(cached, userId);
    const sameDay = c && new Date(c.birthdaysAt).toDateString() === new Date(now).toDateString();
    const fresh = c && now - c.contactsAt < CONTACTS_FRESH_MS;
    const cachedContacts = (c?.contacts || []).map((x) => fresh ? x : { ...x, online: false });
    return {
      me: live.me || c?.me || null,
      groups: live.groups ?? c?.groups ?? [],
      pages: live.pages ?? c?.pages ?? [],
      birthdays: live.birthdays ?? (sameDay ? c.birthdays : null) ?? [],
      contacts: live.contacts ?? (c ? cachedContacts : null)
    };
  }
  function railToCache(live, prev, now = Date.now(), userId = null) {
    const base = usableCache(prev, userId) || {};
    return {
      v: RAIL_VERSION,
      userId,
      savedAt: now,
      me: live.me || base.me || null,
      groups: live.groups ?? base.groups ?? [],
      pages: live.pages ?? base.pages ?? [],
      birthdays: live.birthdays ?? base.birthdays ?? [],
      birthdaysAt: live.birthdays ? now : base.birthdaysAt ?? 0,
      contacts: live.contacts ?? base.contacts ?? [],
      contactsAt: live.contacts ? now : base.contactsAt ?? 0
    };
  }
  var isFacebookChrome = (el) => !el.closest(`[role="dialog"], #${HOST_ID}`);
  function findAccountNav(doc = document) {
    const banner = findBanner(doc);
    if (!banner) return null;
    const navs = [...banner.querySelectorAll('[role="navigation"]')];
    return navs.find((n) => ACCOUNT_NAV.has(normLabel(n.getAttribute("aria-label")))) || navs.find((n) => !n.querySelector('ul a[href="/"]') && n.querySelector("[aria-haspopup]")) || null;
  }
  function accountButtons(nav) {
    return [...nav.querySelectorAll('[role="button"]')].filter(
      (b) => b.getAttribute("tabindex") !== "-1" && !b.parentElement?.closest('[role="button"], [role="dialog"]')
    );
  }
  function findAccountButton(doc = document) {
    const nav = findAccountNav(doc);
    if (!nav) return null;
    const buttons = accountButtons(nav);
    return buttons.find((b) => jewelKind(b.getAttribute("aria-label")) === "profile") || buttons[buttons.length - 1] || null;
  }
  function findLeftRail(doc = document) {
    const navs = [...doc.querySelectorAll('[role="navigation"]')].filter(
      (n) => isFacebookChrome(n) && !n.closest('[role="banner"]') && !n.closest('[role="main"]')
    );
    return navs.find((n) => SHORTCUTS_NAV.has(normLabel(n.getAttribute("aria-label")))) || navs.find((n) => n.querySelector('a[href*="facebook.com/friends/"]') && n.querySelector('a[href*="facebook.com/groups/"]')) || null;
  }
  function findRightRail(doc = document) {
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
    return [...nav.querySelectorAll("a[href]")].filter((a) => !a.closest('[role="contentinfo"], footer')).map((a) => ({ href: a.href, image: imageOf(a), ...nameAndCount(textLeaves(a)) }));
  }
  function readBirthdays(rail) {
    return [...rail.querySelectorAll('a[href*="/birthdays"]')].map((a) => {
      const text2 = (a.getAttribute("aria-label") || a.textContent || "").replace(/\s+/g, " ").trim();
      return { text: text2, url: a.href, ...parseBirthdays(text2) || { names: [], others: 0 } };
    }).filter((b) => b.text);
  }
  function readContacts(rail) {
    const out = [];
    for (const a of rail.querySelectorAll('li a[href*="/messages/"], li a[href*="/active/t/"]')) {
      const label = a.getAttribute("aria-label") || a.textContent || "";
      if (/^meta ai\b/i.test(label.trim()) || a.querySelector('image[*|href*="/gen-ai"], img[src*="/gen-ai"]')) continue;
      const { name, online } = parseContactLabel(label);
      if (name) out.push({ name, online, url: a.href, avatar: imageOf(a) });
    }
    return out;
  }
  function accountAvatar(doc) {
    const btn = findAccountButton(doc);
    return btn ? imageOf(btn) : null;
  }
  function readCookie(name, doc) {
    const m = new RegExp(`(?:^|;\\s*)${name}=(\\d+)`).exec(doc.cookie || "");
    return m ? m[1] : null;
  }
  function readCounts(doc = document, railFriendsCount = null) {
    const out = { notifications: null, messages: null, friendRequests: null };
    const nav = findAccountNav(doc);
    if (nav) Object.assign(out, countsFromLabels(accountButtons(nav).map((b) => b.getAttribute("aria-label") || "")));
    const banner = findBanner(doc);
    const friendsTab = banner && [...banner.querySelectorAll('[role="navigation"] a[aria-label][href]')].find((a) => /^\/friends\/?$/.test(a.pathname));
    if (friendsTab) out.friendRequests = parseCount(friendsTab.getAttribute("aria-label"));
    else if (railFriendsCount != null) out.friendRequests = railFriendsCount;
    return out;
  }
  var STAMPS = /* @__PURE__ */ new Set(["savedAt", "birthdaysAt", "contactsAt"]);
  var railContent = (c) => JSON.stringify(c ?? null, (k, v) => STAMPS.has(k) ? void 0 : v);
  var EMPTY_SNAP = Object.freeze({
    identity: { id: null, name: null, url: "https://www.facebook.com/me/", avatar: null },
    counts: { notifications: null, messages: null, friendRequests: null },
    shortcuts: { groups: [], pages: [] },
    birthdays: [],
    contacts: null
  });
  function createChromeReader({ platform, identityHint = null } = {}) {
    const storage = platform?.storage;
    const subs = /* @__PURE__ */ new Set();
    let cache = null;
    let snap = null;
    let lastJson = "";
    let observer2 = null;
    let targets = [];
    let rescanTimer = 0;
    let refreshTimer = 0;
    let lastRefresh = 0;
    let persistTimer = 0;
    const readLive = () => {
      const route = classifyRoute(location);
      const onRailRoute = route.mode === "home" && !route.filter;
      const left = onRailRoute ? findLeftRail(document) : null;
      const right = onRailRoute ? findRightRail(document) : null;
      const userId = readCookie("i_user", document) || readCookie("c_user", document);
      const parsed = left ? shortcutsFromRows(readRailRows(left), { userId }) : null;
      const rail = parsed?.me ? parsed : null;
      return {
        userId,
        counts: readCounts(document, rail?.friendsCount ?? null),
        bannerAvatar: accountAvatar(document),
        rail: {
          me: rail?.me || null,
          groups: rail ? rail.groups : void 0,
          pages: rail ? rail.pages : void 0,
          birthdays: right ? readBirthdays(right) : void 0,
          contacts: right ? readContacts(right) : void 0
        }
      };
    };
    const persist = (liveRail, userId) => {
      if (!storage || !liveRail.me && liveRail.groups === void 0 && liveRail.contacts === void 0) return;
      clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        const now = Date.now();
        const next = railToCache(liveRail, cache, now, userId);
        const presenceAging = liveRail.contacts && now - (cache?.contactsAt ?? 0) > CONTACTS_FRESH_MS / 2;
        if (!presenceAging && railContent(next) === railContent(cache)) return;
        cache = next;
        storage.set(RAIL_KEY, next).catch(() => health.count("shell.rail-cache-write-failed"));
      }, 1e3);
    };
    const compute = () => {
      const live = readLive();
      const hint = identityHint && identityHint() || {};
      const id = live.userId || hint.id || null;
      const rail = mergeRail(live.rail, cache, Date.now(), id);
      const me2 = rail.me;
      snap = {
        identity: {
          id,
          name: me2?.name || hint.name || null,
          url: me2?.url || (id ? `https://www.facebook.com/profile.php?id=${id}` : "https://www.facebook.com/me/"),
          avatar: live.bannerAvatar || me2?.image || null
        },
        counts: live.counts,
        shortcuts: { groups: rail.groups, pages: rail.pages },
        birthdays: rail.birthdays,
        contacts: rail.contacts
      };
      persist(live.rail, id);
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
    const retarget = () => {
      const next = [findBanner(document), findLeftRail(document), findRightRail(document)].filter(Boolean);
      if (next.length === targets.length && next.every((t2, i) => t2 === targets[i])) return false;
      targets = next;
      observer2.disconnect();
      for (const t2 of targets) {
        observer2.observe(t2, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["aria-label", "href"] });
      }
      return true;
    };
    const start = () => {
      observer2 = new MutationObserver(scheduleRefresh);
      retarget();
      rescanTimer = setInterval(() => {
        if (retarget()) scheduleRefresh();
      }, RESCAN_MS);
    };
    const stop = () => {
      observer2?.disconnect();
      observer2 = null;
      targets = [];
      clearInterval(rescanTimer);
      clearTimeout(refreshTimer);
      refreshTimer = 0;
    };
    storage?.get(RAIL_KEY).then((v) => {
      if (v && typeof v === "object") cache = v;
      refresh();
    }).catch(() => health.count("shell.rail-cache-read-failed"));
    const read2 = safe("chrome-reader", compute);
    const current = () => observer2 && snap ? snap : read2() || snap || EMPTY_SNAP;
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
      }
    };
  }

  // src/fb/labels.js
  var EXTRA_INVISIBLE = /[؜ᅟᅠ឴឵᠋-᠏‎‏‪-‮⁡-⁩ㅤ︀-️ﾠ]/g;
  function labelKey(s) {
    return normLabel(String(s ?? "").replace(EXTRA_INVISIBLE, "").replace(/ /g, " "));
  }
  function bylineSegments(s) {
    return String(s ?? "").split(/[·•]/).map(labelKey).filter(Boolean);
  }
  var CORE = Object.freeze({
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
        "Suggested for you",
        "Suggested post",
        "Suggested posts",
        "Recommended for you",
        "Recommended post",
        "Based on your recent",
        "Because you may be interested in",
        "Because you recently viewed",
        "Because you viewed",
        "From a group that",
        "From a group with members who like",
        "From a group you",
        "Post from a public group",
        "Suggested from",
        "You recently viewed a similar group"
      ],
      ai: ["AI info", "AI content"],
      metaAI: ["Meta AI", "Try Meta AI", "Ask Meta AI", "Visit Meta AI", "Meta AI branding"],
      memories: ["Memories", "On this day"]
    },
    pl: {
      // "Reklama" and "Materiał sponsorowany" are in Facebook's Polish string table; the feed byline that
      // uses them in 2026 was not captured yet.
      ad: ["Sponsorowane", "Reklama", "Materiał sponsorowany"],
      paidPartnership: ["Post sponsorowany"],
      // dictionary (zbluebugz), LOW
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
      groupSuggestions: ["Proponowane grupy"],
      // dictionary (zbluebugz 2022)
      suggestedPanels: ["Wydarzenia, które mogą Ci się spodobać", "Proponowane wydarzenia"],
      // dictionary
      suggestedHeaders: ["Propozycje dla Ciebie", "Proponowane dla Ciebie", "Polecany post", "Proponowany post z grupy publicznej"],
      ai: ["Informacje o SI", "Informacje SI"],
      // both in Facebook's Polish string table
      metaAI: ["Meta AI"],
      memories: ["Wspomnienia"]
    }
  });
  var ZB502_KEYS = Object.freeze([
    "SPONSORED",
    "NF_STORIES",
    "NF_PEOPLE_YOU_MAY_KNOW",
    "NF_PAID_PARTNERSHIP",
    "NF_SPONSORED_PAID",
    "NF_FOLLOW",
    "NF_PARTICIPATE",
    "NF_REELS_SHORT_VIDEOS",
    "NF_EVENTS_YOU_MAY_LIKE",
    "REELS_TITLE",
    "VF_LIVE",
    "NF_SURVEY"
  ]);
  var ZB502_ROWS = {
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
    "zh-Hant": ["贊助", "故事", "你可能認識的人", "付費合作", "贊助 · 出資者：______", "追蹤", "參與", "Reels 和短影片", "你可能感興趣的活動", "Reels", "現場直播", "調查"]
  };
  var ZB502 = Object.freeze(
    Object.fromEntries(Object.entries(ZB502_ROWS).map(([lang, row2]) => [lang, Object.freeze(Object.fromEntries(ZB502_KEYS.map((k, i) => [k, row2[i]])))]))
  );
  var ZB_CONCEPTS = {
    ad: ["SPONSORED"],
    paidPartnership: ["NF_PAID_PARTNERSHIP"],
    follow: ["NF_FOLLOW"],
    join: ["NF_PARTICIPATE"],
    stories: ["NF_STORIES"],
    reels: ["NF_REELS_SHORT_VIDEOS", "REELS_TITLE"],
    pymk: ["NF_PEOPLE_YOU_MAY_KNOW"],
    suggestedPanels: ["NF_EVENTS_YOU_MAY_LIKE"]
  };
  function buildWords() {
    const words = {};
    const add = (concept, list) => {
      const set = words[concept] ||= /* @__PURE__ */ new Set();
      for (const w of list) {
        const k = labelKey(w);
        if (k) set.add(k);
      }
    };
    for (const table2 of Object.values(CORE)) for (const [concept, list] of Object.entries(table2)) add(concept, list);
    for (const row2 of Object.values(ZB502)) {
      for (const [concept, keys] of Object.entries(ZB_CONCEPTS)) add(concept, keys.map((k) => row2[k]));
    }
    return Object.freeze(Object.fromEntries(Object.entries(words).map(([k, v]) => [k, Object.freeze(v)])));
  }
  var WORDS = buildWords();
  function isWord(concept, text2) {
    return WORDS[concept]?.has(labelKey(text2)) ?? false;
  }
  function startsWithWord(concept, text2) {
    const key = labelKey(text2);
    if (!key) return false;
    for (const w of WORDS[concept] ?? []) if (key === w || key.startsWith(`${w} `)) return true;
    return false;
  }
  function isAdLabel(text2) {
    return bylineSegments(text2).some((seg) => WORDS.ad.has(seg) || startsWithWord("paidPartnership", seg));
  }
  function labelHasPrefix(concept, label, locale2) {
    const key = labelKey(label);
    return (CORE[locale2]?.[concept] ?? []).some((p) => {
      const w = labelKey(p);
      return key === w || key.startsWith(`${w} `);
    });
  }
  var PROBE_FIELDS = { like: "like", comment: "commentLabel", share: "shareLabel", menu: "postMenu", hide: "hidePost" };
  function probeLabels(observed) {
    const fields = Object.keys(PROBE_FIELDS).filter((f) => observed?.[f]);
    const score = {};
    for (const locale2 of Object.keys(CORE)) {
      score[locale2] = fields.filter((f) => labelHasPrefix(PROBE_FIELDS[f], observed[f], locale2)).length;
    }
    const best = Object.keys(score).sort((a, b) => score[b] - score[a])[0];
    const detected = score[best] > 0 ? best : null;
    const mismatches = fields.filter((f) => !detected || !labelHasPrefix(PROBE_FIELDS[f], observed[f], detected));
    return { detected, checked: fields.length, mismatches };
  }

  // src/fb/cleaner.js
  var UNIT_SELECTOR = "[aria-posinset]:not([role])";
  var HIDE_ATTR = "data-mfga-hide";
  var BOTTOM_GUARD_PX = 1200;
  var STORIES_SELECTOR = '[data-focus-target="stories_tray"]';
  var MAX_TRIES = 8;
  var XLINK = "http://www.w3.org/1999/xlink";
  var REASON_SETTINGS = {
    sponsored: (s) => s.clean.sponsored,
    suggested: (s) => s.clean.suggested,
    pymk: (s) => s.clean.peopleYouMayKnow,
    reels: (s) => s.clean.reels,
    stories: (s) => s.clean.stories,
    "group-suggestions": (s) => s.clean.groupSuggestions,
    "meta-ai": (s) => s.clean.metaAI,
    ai: (s) => s.feed.hideAI,
    memories: (s) => s.clean.memories
  };
  var REASONS2 = Object.freeze(Object.keys(REASON_SETTINGS));
  function tnCode(href) {
    const m = /[?&]__tn__=([^&#]*)/.exec(String(href ?? ""));
    if (!m) return null;
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  function isAdInfoHref(href) {
    const h2 = String(href ?? "");
    return h2.startsWith("?") && h2.includes("__cft__") && !h2.includes("__tn__");
  }
  function isAdsAboutHref(href) {
    try {
      let u = new URL(String(href ?? ""), "https://www.facebook.com/");
      if (/(^|\.)l\.facebook\.com$/.test(u.hostname) && u.pathname === "/l.php") {
        u = new URL(u.searchParams.get("u") ?? "", "https://www.facebook.com/");
      }
      return /(^|\.)facebook\.com$/.test(u.hostname) && /^\/ads\/about(\/|$)/.test(u.pathname);
    } catch {
      return false;
    }
  }
  function reelIds(hrefs2) {
    const ids = /* @__PURE__ */ new Set();
    for (const href of hrefs2) {
      const m = /\/reel\/(\d+)/.exec(String(href ?? ""));
      if (m) ids.add(m[1]);
    }
    return ids;
  }
  function isFeedRoute(route, loc = globalThis.location) {
    if (route?.mode) return route.mode === "home" || route.mode === "groups-feed";
    const path = route?.path ?? loc?.pathname ?? "";
    return path === "/" || path === "/home.php" || /^\/groups\/feed\/?$/.test(path);
  }
  function chooseVerdict(hits, settings, feedRoute) {
    for (const hit of hits ?? []) {
      if (hit.gated && !feedRoute) continue;
      if (REASON_SETTINGS[hit.reason]?.(settings)) return hit;
    }
    return null;
  }
  function isNearBottom(bottom, docHeight, guard2 = BOTTOM_GUARD_PX) {
    return docHeight - bottom < guard2;
  }
  function createLabelCache({ max = 500 } = {}) {
    const entries = /* @__PURE__ */ new Map();
    const record = (el) => {
      if (!el.id || el.childElementCount > 3) return;
      const use = el.localName === "use" ? el : el.querySelector(":scope > use");
      const entry = use ? { ref: useRef(use) } : textEntry(el);
      if (!entry) return;
      entries.delete(el.id);
      entries.set(el.id, entry);
      if (entries.size > max) entries.delete(entries.keys().next().value);
    };
    return {
      capture(node) {
        if (node?.nodeType !== 1) return;
        record(node);
        for (const el of node.querySelectorAll("[id]")) record(el);
      },
      get: (id) => entries.get(id) ?? null,
      get size() {
        return entries.size;
      }
    };
  }
  function textEntry(el) {
    const text2 = (el.textContent ?? "").trim();
    return text2 && text2.length <= 80 ? { text: text2 } : null;
  }
  function useRef(use) {
    return (use.getAttribute("href") ?? use.getAttributeNS(XLINK, "href") ?? "").replace(/^#/, "");
  }
  function labelResolver(cache, doc = globalThis.document) {
    const follow = (id, depth) => {
      if (!id || depth > 16) return "";
      const live = doc.getElementById(id);
      if (live) {
        const use = live.localName === "use" ? live : live.querySelector("use");
        return live.localName !== "text" && use ? follow(useRef(use), depth + 1) : live.textContent ?? "";
      }
      const hit = cache.get(id);
      return hit?.ref ? follow(hit.ref, depth + 1) : hit?.text ?? "";
    };
    return {
      byId: (id) => follow(id, 0),
      byUse: (use) => follow(useRef(use), 0)
    };
  }
  var BODY_MARKERS = [
    '[data-ad-rendering-role="story_message"]',
    '[data-ad-preview="message"]',
    "h5",
    '[data-ad-rendering-role="meta"]',
    '[data-ad-rendering-role="title"]',
    '[data-ad-rendering-role^="cta"]',
    '[data-ad-rendering-role="image"]',
    'a[rel~="nofollow"]',
    "img[data-imgperflogname]",
    '[role="group"]',
    '[data-ad-rendering-role$="_button"]',
    'span[role="toolbar"]',
    '[role="grid"]',
    '[role="article"]',
    "form"
  ].join(",");
  var SKIP_TEXT = /* @__PURE__ */ new Set(["title", "desc", "style", "script", "template"]);
  function headerEnd(root) {
    return root.querySelector(BODY_MARKERS);
  }
  function before(el, end) {
    if (!end) return true;
    const pos = el.compareDocumentPosition(end);
    return Boolean(pos & Node.DOCUMENT_POSITION_FOLLOWING) && !(pos & Node.DOCUMENT_POSITION_CONTAINED_BY);
  }
  function inDecoy(el, unit) {
    const hidden = el.closest('[aria-hidden="true"]');
    return hidden != null && unit.contains(hidden);
  }
  function isUnpainted(el, view) {
    if (el.hidden || el.getAttribute("aria-hidden") === "true" || SKIP_TEXT.has(el.localName)) return true;
    const s = view.getComputedStyle(el);
    return s.display === "none" || s.visibility === "hidden" || s.visibility === "collapse" || parseFloat(s.opacity || "1") <= 0.01 || parseFloat(s.fontSize) <= 0 || s.position === "absolute" || s.position === "fixed";
  }
  function paintedText(el, view = el.ownerDocument.defaultView) {
    let nodes = [...el.childNodes];
    if (view.getComputedStyle(el).display.includes("flex")) {
      nodes = nodes.map((n, i) => ({ n, i, o: n.nodeType === 1 ? parseInt(view.getComputedStyle(n).order, 10) || 0 : 0 })).sort((a, b) => a.o - b.o || a.i - b.i).map((x) => x.n);
    }
    let out = "";
    for (const n of nodes) {
      if (n.nodeType === 3) out += n.nodeValue;
      else if (n.nodeType === 1 && !isUnpainted(n, view)) out += paintedText(n, view);
    }
    return out;
  }
  function carrierTexts(el, resolve) {
    const out = [el.getAttribute("aria-label")];
    for (const node of [el, ...el.querySelectorAll("[aria-labelledby]")]) {
      for (const id of (node.getAttribute("aria-labelledby") ?? "").split(/\s+/)) out.push(resolve.byId(id));
    }
    for (const use of el.querySelectorAll("use")) out.push(resolve.byUse(use));
    out.push(paintedText(el));
    return out.filter((t2) => labelKey(t2));
  }
  function headerParts(unit) {
    const end = headerEnd(unit);
    const inHeader = (el) => before(el, end) && !inDecoy(el, unit);
    const name = unit.querySelector('[data-ad-rendering-role="profile_name"]');
    const heading = [...unit.querySelectorAll('h2, h3, h4, [role="heading"]')].find((h2) => h2.localName !== "h5" && !inDecoy(h2, unit)) ?? null;
    return { end, inHeader, name, heading };
  }
  function isPersonLink(a) {
    const href = a.getAttribute("href") ?? "";
    const tn = tnCode(href) ?? "";
    return a.querySelector("img, image, mask, svg[role='img']") != null || tn.startsWith("<<") || tn.startsWith("-UC") || /\/groups\/[^/?#]+\/user\//.test(href);
  }
  function labelCarriers(unit, { inHeader }) {
    const carriers = [];
    for (const a of unit.querySelectorAll("a")) {
      if (!inHeader(a) || a.closest("h2, h3, h4, [role='heading'], [data-ad-rendering-role]")) continue;
      if (isPersonLink(a) || a.getAttribute("href") === "#") continue;
      carriers.push(a);
    }
    for (const s of unit.querySelectorAll("[aria-labelledby]")) {
      if (inHeader(s) && !s.closest("a, h2, h3, h4, [data-ad-rendering-role]")) carriers.push(s);
    }
    return carriers;
  }
  function panelTitles(unit, { inHeader }) {
    const titles = [];
    for (const el of unit.querySelectorAll('h2, h3, h4, [role="heading"], span[dir="auto"]')) {
      if (!inHeader(el) || el.closest('[data-ad-rendering-role="profile_name"], [role="article"]')) continue;
      const text2 = el.textContent ?? "";
      if (text2.length <= 80) titles.push(text2);
    }
    for (const el of unit.querySelectorAll('[role="region"][aria-label], [role="grid"][aria-label]')) {
      titles.push(el.getAttribute("aria-label"));
    }
    return titles;
  }
  var outsideMessage = (el) => !el.closest('[data-ad-rendering-role="story_message"], [data-ad-preview="message"], [role="article"]');
  var hrefs = (unit, selector) => [...unit.querySelectorAll(selector)].filter(outsideMessage).map((a) => a.getAttribute("href"));
  var buttonTexts = (root) => [...root.querySelectorAll('[role="button"], button')].map((b) => b.textContent ?? "");
  function isSkeleton(unit) {
    return unit.querySelector('[role="progressbar"], [role="status"], [aria-busy="true"]') != null && !unit.querySelector("a[href]");
  }
  function detectUnit(unit, resolve) {
    if (isSkeleton(unit)) return { hits: [], skeleton: true, complete: false, undecodable: false };
    const parts = headerParts(unit);
    const hits = [];
    const hit = (reason, signal, gated = false) => hits.push({ reason, signal, gated });
    const carriers = labelCarriers(unit, parts);
    if (carriers.some((a) => a.localName === "a" && isAdInfoHref(a.getAttribute("href")))) hit("sponsored", "ad-info-link");
    if (hrefs(unit, 'a[href*="/ads/about"], a[href*="l.facebook.com/l.php"]').some(isAdsAboutHref)) hit("sponsored", "ads-about");
    const labels = carriers.flatMap((c) => carrierTexts(c, resolve));
    if (labels.some(isAdLabel)) hit("sponsored", "ad-label");
    const titles = panelTitles(unit, parts);
    const titled = (concept) => titles.some((t2) => isWord(concept, t2));
    if (titled("pymk") || hrefs(unit, 'a[href*="/friends/suggestions"]').length) hit("pymk", "panel");
    if (titled("reels") || reelIds(hrefs(unit, 'a[href*="/reel/"]')).size >= 2) hit("reels", "panel");
    if (titled("stories")) hit("stories", "panel");
    if (titled("groupSuggestions") || hrefs(unit, 'a[href*="/groups/discover"]').length) hit("group-suggestions", "panel");
    if (titled("suggestedPanels")) hit("suggested", "panel");
    const headingButtons = parts.heading ? buttonTexts(parts.heading) : [];
    if (headingButtons.some((t2) => isWord("follow", t2) || isWord("addFriend", t2))) hit("suggested", "follow", true);
    if (headingButtons.some((t2) => isWord("join", t2))) hit("group-suggestions", "join", true);
    if (legacyHeader(unit, parts)) hit("suggested", "header", true);
    const postLike = parts.name != null;
    if (!postLike && metaAIUnit(unit)) hit("meta-ai", "unit");
    const headerButtons = [...unit.querySelectorAll('[role="button"]')].filter(parts.inHeader);
    if (labels.some((t2) => bylineSegments(t2).some((seg) => isWord("ai", seg))) || headerButtons.some((b) => isWord("ai", b.textContent))) hit("ai", "label");
    if (hrefs(unit, 'a[href*="/onthisday"]').length || titled("memories")) hit("memories", "link");
    const decoded = labels.length > 0;
    return {
      hits,
      skeleton: false,
      complete: hits.length > 0 || postLike && decoded,
      undecodable: postLike && !decoded
    };
  }
  function isMetaAIHref(href) {
    try {
      return /(^|\.)meta\.ai$/.test(new URL(href, "https://www.facebook.com/").hostname);
    } catch {
      return false;
    }
  }
  function metaAIUnit(unit) {
    return [...unit.querySelectorAll("a[aria-label]")].some((a) => isWord("metaAI", a.getAttribute("aria-label"))) || hrefs(unit, 'a[href*="meta.ai"]').some(isMetaAIHref) || buttonTexts(unit).some((t2) => isWord("metaAI", t2));
  }
  function legacyHeader(unit, { heading, inHeader }) {
    for (const el of unit.querySelectorAll('span[dir="auto"]')) {
      if (heading && !before(el, heading)) break;
      if (inHeader(el) && startsWithWord("suggestedHeaders", el.textContent)) return true;
    }
    return false;
  }
  function mountedRoot(unit) {
    const v = unit.querySelector("[data-virtualized]");
    if (!v) return unit.firstElementChild;
    return v.getAttribute("data-virtualized") === "true" ? null : v.firstElementChild;
  }
  function closestUnit(el) {
    let unit = el?.closest?.(UNIT_SELECTOR) ?? null;
    for (let up = unit?.parentElement?.closest(UNIT_SELECTOR); up; up = up.parentElement?.closest(UNIT_SELECTOR)) unit = up;
    return unit;
  }
  var selfAndBelow = (node, selector) => [...node.matches(selector) ? [node] : [], ...node.querySelectorAll(selector)];
  var isStoriesRegion = (el) => el.closest('[role="main"]') != null && isWord("stories", el.getAttribute("aria-label"));
  function storyBlocks(node) {
    const blocks = selfAndBelow(node, STORIES_SELECTOR);
    for (const r of selfAndBelow(node, '[role="region"][aria-label]')) {
      if (isStoriesRegion(r) && !r.querySelector(STORIES_SELECTOR)) blocks.push(r);
    }
    return blocks;
  }
  function observedLabels(unit) {
    const button = (role) => unit.querySelector(`[data-ad-rendering-role="${role}"]`)?.closest('[role="button"]')?.getAttribute("aria-label");
    return {
      like: button("like_button"),
      comment: button("comment_button"),
      share: button("share_button"),
      menu: unit.querySelector('[aria-haspopup="menu"][aria-label]')?.getAttribute("aria-label"),
      hide: unit.querySelector('a[href="#"][aria-label]')?.getAttribute("aria-label")
    };
  }
  function startCleaner({ settings, route, onStats } = {}) {
    const current = () => {
      const s = typeof settings?.get === "function" ? settings.get() : settings;
      return s?.clean && s?.feed ? s : DEFAULTS;
    };
    const doc = document;
    let feedRoute = isFeedRoute(route);
    let stopped = false;
    const cache = createLabelCache();
    const resolve = labelResolver(cache, doc);
    const states = /* @__PURE__ */ new WeakMap();
    const counted = /* @__PURE__ */ new WeakSet();
    const seen = { skeleton: /* @__PURE__ */ new WeakSet(), virtualized: /* @__PURE__ */ new WeakSet(), undecodable: /* @__PURE__ */ new WeakSet() };
    const pending = /* @__PURE__ */ new Set();
    const dirtyUnits = /* @__PURE__ */ new Set();
    const dirtyBlocks = /* @__PURE__ */ new Set();
    const stats = { seen: 0, hidden: 0, skeletons: 0, virtualized: 0, undecodable: 0, reasons: {}, signals: {}, probe: {} };
    let statsTimer = 0;
    function snapshot() {
      return { ...stats, pending: pending.size, reasons: { ...stats.reasons }, signals: { ...stats.signals }, probe: structuredClone(stats.probe) };
    }
    function touch() {
      if (!onStats || statsTimer || stopped) return;
      statsTimer = setTimeout(
        safe(
          "cleaner",
          () => {
            statsTimer = 0;
            if (!stopped) onStats(snapshot());
          },
          { disableOnError: false }
        ),
        250
      );
    }
    function once(set, el, key) {
      if (set.has(el)) return;
      set.add(el);
      stats[key]++;
      touch();
    }
    function count2(el, verdict) {
      if (counted.has(el)) return;
      counted.add(el);
      stats.hidden++;
      stats.reasons[verdict.reason] = (stats.reasons[verdict.reason] || 0) + 1;
      const sig = `${verdict.reason}:${verdict.signal}`;
      stats.signals[sig] = (stats.signals[sig] || 0) + 1;
      health.count(`clean.${verdict.reason}`);
      touch();
    }
    function blockedOwners(decisions) {
      const owners = new Set(decisions.filter((d) => d.verdict && d.target && !d.target.hasAttribute(HIDE_ATTR)).map((d) => d.owner));
      if (!owners.size) return owners;
      const docHeight = doc.documentElement.scrollHeight;
      const top = window.scrollY;
      return new Set([...owners].filter((owner) => isNearBottom(owner.getBoundingClientRect().bottom + top, docHeight)));
    }
    function commit(decisions) {
      const blocked = blockedOwners(decisions);
      const waiting = pending.size;
      for (const { owner, target, verdict, counts, stale } of decisions) {
        for (const el of stale ?? []) el.removeAttribute(HIDE_ATTR);
        if (!verdict) {
          pending.delete(owner);
          target?.removeAttribute(HIDE_ATTR);
        } else if (!target || target.getAttribute(HIDE_ATTR) === verdict.reason) {
          continue;
        } else if (blocked.has(owner)) {
          pending.add(owner);
        } else {
          pending.delete(owner);
          target.setAttribute(HIDE_ATTR, verdict.reason);
          if (counts) count2(owner, verdict);
        }
      }
      if (pending.size !== waiting) touch();
    }
    function unitDecision(unit, state) {
      const target = unit.firstElementChild;
      const stale = [...unit.children].filter((child) => child !== target && child.hasAttribute(HIDE_ATTR));
      return { owner: unit, target, verdict: chooseVerdict(state.hits, current(), feedRoute), counts: true, stale };
    }
    function probe(unit) {
      const lang = doc.documentElement.lang || "unknown";
      const entry = stats.probe[lang] ||= { posts: 0, detected: null, mismatches: {} };
      if (entry.posts >= 5) return;
      const result = probeLabels(observedLabels(unit));
      if (!result.checked) return;
      entry.posts++;
      entry.detected = result.detected ?? entry.detected;
      for (const f of result.mismatches) entry.mismatches[f] = (entry.mismatches[f] || 0) + 1;
      health.fact("clean.localeProbe", stats.probe);
      touch();
    }
    function processUnit(unit) {
      if (!unit.isConnected || closestUnit(unit) !== unit || unit.closest("form")) return null;
      let state = states.get(unit);
      if (!state) {
        state = { hits: null, mount: null, tries: 0, done: false };
        states.set(unit, state);
        stats.seen++;
        touch();
      }
      const mount = mountedRoot(unit);
      if (!mount) {
        once(seen.virtualized, unit, "virtualized");
      } else {
        if (mount !== state.mount) Object.assign(state, { mount, tries: 0, done: false });
        if (!state.hits?.length && !state.done && state.tries < MAX_TRIES) detectInto(unit, state);
      }
      return state.hits ? unitDecision(unit, state) : null;
    }
    function detectInto(unit, state) {
      const r = detectUnit(unit, resolve);
      if (r.skeleton) {
        once(seen.skeleton, unit, "skeletons");
        return;
      }
      state.tries++;
      state.hits = r.hits;
      state.done = r.complete;
      if (r.undecodable && state.tries === 1) once(seen.undecodable, unit, "undecodable");
      if (!r.hits.length && r.complete) probe(unit);
    }
    function processBlock(block3) {
      if (!block3.isConnected || block3.querySelector(UNIT_SELECTOR)) return [];
      const verdict = chooseVerdict([{ reason: "stories", signal: "tray" }], current(), feedRoute);
      const decisions = [{ owner: block3, target: block3, verdict, counts: true }];
      if (!block3.matches(STORIES_SELECTOR)) return decisions;
      const outer = block3.parentElement?.closest('[role="region"]');
      if (outer && isStoriesRegion(outer) && !outer.querySelector(UNIT_SELECTOR)) decisions.push({ owner: block3, target: outer, verdict, counts: false });
      return decisions;
    }
    function collect(node) {
      if (node.nodeType !== 1) return;
      cache.capture(node);
      for (const u of node.matches(UNIT_SELECTOR) ? [node] : node.querySelectorAll(UNIT_SELECTOR)) dirtyUnits.add(u);
      for (const b of storyBlocks(node)) dirtyBlocks.add(b);
    }
    const flush = rafBatch(
      safe("cleaner", () => {
        if (stopped) return;
        for (const owner of pending) {
          if (!owner.isConnected) pending.delete(owner);
          else (owner.matches(UNIT_SELECTOR) ? dirtyUnits : dirtyBlocks).add(owner);
        }
        const decisions = [];
        for (const u of dirtyUnits) {
          const d = processUnit(u);
          if (d) decisions.push(d);
        }
        for (const b of dirtyBlocks) decisions.push(...processBlock(b));
        dirtyUnits.clear();
        dirtyBlocks.clear();
        commit(decisions);
      })
    );
    const observer2 = new MutationObserver(
      safe("cleaner", (records) => {
        for (const rec of records) {
          for (const n of rec.addedNodes) collect(n);
          const unit = closestUnit(rec.target.nodeType === 1 ? rec.target : rec.target.parentElement);
          if (unit) dirtyUnits.add(unit);
        }
        flush();
      })
    );
    const onScroll = () => {
      if (pending.size) flush();
    };
    function reapplyAll() {
      for (const unit of doc.querySelectorAll(UNIT_SELECTOR)) dirtyUnits.add(unit);
      for (const block3 of storyBlocks(doc.body)) dirtyBlocks.add(block3);
      flush();
    }
    const unsubscribe = typeof settings?.subscribe === "function" ? settings.subscribe(() => reapplyAll()) : null;
    onBody(
      safe("cleaner", () => {
        if (stopped) return;
        observer2.observe(doc.body, { childList: true, subtree: true });
        collect(doc.body);
        flush();
      })
    );
    window.addEventListener("scroll", onScroll, { passive: true });
    return {
      setRoute: safe("cleaner", (next) => {
        feedRoute = isFeedRoute(next);
        reapplyAll();
      }),
      stop() {
        stopped = true;
        observer2.disconnect();
        window.removeEventListener("scroll", onScroll);
        clearTimeout(statsTimer);
        unsubscribe?.();
        pending.clear();
        dirtyUnits.clear();
        dirtyBlocks.clear();
        for (const el of doc.querySelectorAll(`[${HIDE_ATTR}]`)) el.removeAttribute(HIDE_ATTR);
      },
      stats: snapshot
    };
  }

  // src/fb/skin.js
  var PART_ATTR = "data-mfga-part";
  var ACTION_ATTR = "data-mfga-action";
  var COUNT_ATTR = "data-mfga-count";
  var ACTIONS = { like_button: "like", comment_button: "comment", share_button: "share" };
  function commonAncestor(a, b) {
    let p = a;
    while (p && !p.contains(b)) p = p.parentElement;
    return p;
  }
  function childOf(ancestor, el) {
    let c = el;
    while (c && c.parentElement !== ancestor) c = c.parentElement;
    return c;
  }
  var notInComment = (el) => !el.closest('[role="article"]');
  function findName(root) {
    return [...root.querySelectorAll('[data-ad-rendering-role="profile_name"]')].find((n) => !n.querySelector("h5") && notInComment(n)) ?? null;
  }
  function findMessage(root) {
    const embedded = root.querySelector("h5");
    const msg = root.querySelector('[data-ad-rendering-role="story_message"]');
    return msg && (!embedded || before(msg, embedded)) && notInComment(msg) ? msg : null;
  }
  function findAvatar(root, name) {
    if (!name) return null;
    return [...root.querySelectorAll("a")].find((a) => before(a, name) && a.querySelector("svg, img") && isPersonLink(a)) ?? null;
  }
  function findByline(root, name) {
    const end = headerEnd(root);
    const link2 = [...root.querySelectorAll("a[href]")].find(
      (a) => name && !before(a, name) && before(a, end) && !name.contains(a) && !isPersonLink(a) && a.getAttribute("href") !== "#"
    );
    const line = link2?.closest("span[dir]");
    return line && !line.contains(name) ? line : link2?.parentElement ?? null;
  }
  function findActionButtons(root) {
    const buttons = [];
    for (const marker2 of root.querySelectorAll('[data-ad-rendering-role$="_button"]')) {
      const action = ACTIONS[marker2.getAttribute("data-ad-rendering-role")];
      const button = marker2.closest('[role="button"]');
      if (action && button && notInComment(button) && root.contains(button)) buttons.push({ action, button });
    }
    return buttons;
  }
  function climbUntil(el, avoid, root) {
    let c = el;
    while (c.parentElement && c.parentElement !== root && !avoid.some((a) => c.parentElement.contains(a))) c = c.parentElement;
    return c;
  }
  function findComments(root, avoid) {
    const top = [...root.querySelectorAll('[role="article"]')].filter((a) => !a.parentElement.closest('[role="article"]'));
    if (!top.length) return null;
    const box2 = top.length > 1 ? commonAncestor(top[0], top[top.length - 1]) : top[0].parentElement;
    return box2 && !avoid.some((a) => box2.contains(a)) ? box2 : climbUntil(top[0], avoid, root);
  }
  function findAttachments(root, name, message, footer) {
    if (!name || !footer) return [];
    const lca = commonAncestor(name, footer);
    if (!lca || lca === name) return [];
    const head = childOf(lca, name);
    const foot = childOf(lca, footer);
    const out = [];
    for (let c = head?.nextElementSibling; c && c !== foot; c = c.nextElementSibling) {
      if (c.getAttribute("aria-hidden") === "true" || message && c.contains(message) || !c.firstElementChild) continue;
      out.push(c);
    }
    return out;
  }
  function postParts(root) {
    const parts = [];
    const add = (el, part) => el && parts.push([el, part]);
    const name = findName(root);
    const message = findMessage(root);
    const buttons = findActionButtons(root);
    const buttonEls = buttons.map((b) => b.button);
    const actions = buttonEls.length > 1 ? commonAncestor(buttonEls[0], buttonEls[buttonEls.length - 1]) : buttonEls[0]?.parentElement;
    const head = [name, message].filter(Boolean);
    const toolbar = [...root.querySelectorAll('span[role="toolbar"]')].find(notInComment);
    const summary = toolbar ? climbUntil(toolbar, [...head, ...buttonEls], root) : null;
    const form = [...root.querySelectorAll("form")].find((f) => f.querySelector('[role="textbox"], [contenteditable="true"]'));
    const articles = [...root.querySelectorAll('[role="article"]')];
    const composer = form ? climbUntil(form, [...head, actions, summary, ...articles].filter(Boolean), root) : null;
    const comments = findComments(root, [...head, actions, summary, composer].filter(Boolean));
    add(findAvatar(root, name), "avatar");
    add(name, "name");
    add(findByline(root, name), "byline");
    add(message, "message");
    for (const a of findAttachments(root, name, message, actions ?? summary)) add(a, "attachment");
    if (summary && summary.nextElementSibling === actions) add(summary.parentElement, "footer");
    add(actions, "actions");
    add(summary, "summary");
    add(comments, "comments");
    add(composer, "composer");
    return { parts, buttons };
  }
  function setAttr(el, attr, value) {
    if (value == null) el.removeAttribute(attr);
    else if (el.getAttribute(attr) !== value) el.setAttribute(attr, value);
  }
  var isCountText = (text2) => /^(\d[\d\s.,]*\s*[\p{L}.]{0,4})?$/u.test(text2.trim());
  function tagUnit(unit) {
    const root = mountedRoot(unit);
    if (!root) return;
    const { parts, buttons } = postParts(root);
    const keep = new Set(parts.map(([el]) => el));
    for (const el of root.querySelectorAll(`[${PART_ATTR}]`)) if (!keep.has(el)) el.removeAttribute(PART_ATTR);
    for (const [el, part] of parts) setAttr(el, PART_ATTR, part);
    for (const { action, button } of buttons) {
      setAttr(button, ACTION_ATTR, action);
      setAttr(button, COUNT_ATTR, isCountText(button.textContent ?? "") ? "" : null);
    }
  }
  function untagAll(doc) {
    for (const attr of [PART_ATTR, ACTION_ATTR, COUNT_ATTR]) for (const el of doc.querySelectorAll(`[${attr}]`)) el.removeAttribute(attr);
  }
  function startSkin({ settings } = {}) {
    const doc = document;
    const enabled = () => {
      const s = typeof settings?.get === "function" ? settings.get() : settings;
      return (s?.look ?? DEFAULTS.look).skinPosts;
    };
    const dirty = /* @__PURE__ */ new Set();
    let stopped = false;
    const flush = rafBatch(
      safe("skin", () => {
        if (!stopped && enabled()) {
          for (const unit of dirty) if (unit.isConnected && !unit.firstElementChild?.hasAttribute(HIDE_ATTR)) tagUnit(unit);
        }
        dirty.clear();
      })
    );
    const all = () => {
      for (const unit of doc.querySelectorAll(UNIT_SELECTOR)) dirty.add(unit);
      flush();
    };
    const observer2 = new MutationObserver(
      safe("skin", (records) => {
        for (const rec of records) {
          const unit = closestUnit(rec.target);
          if (unit) dirty.add(unit);
          for (const n of rec.addedNodes) {
            if (n.nodeType !== 1) continue;
            if (n.matches(UNIT_SELECTOR)) dirty.add(n);
            for (const u of n.querySelectorAll(UNIT_SELECTOR)) dirty.add(u);
          }
        }
        flush();
      })
    );
    const unsubscribe = typeof settings?.subscribe === "function" ? settings.subscribe(() => enabled() ? all() : untagAll(doc)) : null;
    onBody(
      safe("skin", () => {
        if (stopped) return;
        observer2.observe(doc.body, { childList: true, subtree: true });
        all();
      })
    );
    return {
      stop() {
        stopped = true;
        observer2.disconnect();
        unsubscribe?.();
        dirty.clear();
        untagAll(doc);
      }
    };
  }

  // src/ui/shell/strings.js
  registerStrings({
    en: {
      "header.home": "Home",
      "header.profile": "Profile",
      "header.account": "Account",
      "header.search": "Search",
      "header.requests": "Friend Requests",
      "header.messages": "Messages",
      "header.notifications": "Notifications",
      "header.editFriends": "Edit Friends",
      "header.accountSettings": "Account Settings",
      "header.privacySettings": "Privacy Settings",
      "header.mfgaSettings": "MFGA Settings…",
      "header.help": "Help Center",
      "header.logout": "Log Out",
      "nav.viewProfile": "View My Profile",
      "nav.newsFeed": "News Feed",
      "nav.feed.friends": "Friends",
      "nav.feed.groups": "Groups",
      "nav.feed.pages": "Pages",
      "nav.feed.favorites": "Favorites",
      "nav.messages": "Messages",
      "nav.events": "Events",
      "nav.photos": "Photos",
      "nav.friends": "Friends",
      "nav.apps": "Applications",
      "nav.games": "Games",
      "nav.pages": "Pages",
      "nav.groups": "Groups",
      "nav.more": "More",
      "nav.saved": "Saved",
      "nav.video": "Video",
      "nav.marketplace": "Marketplace",
      "nav.chat": "Chat with Friends",
      "nav.goOnline": "Go Online",
      "rc.seeAll": "See All",
      "rc.requests": "Requests",
      "rc.friendRequests.one": "friend request",
      "rc.friendRequests.other": "friend requests",
      "rc.events": "Events",
      "rc.birthday": "{name}'s birthday",
      "rc.andOthers.one": "and {n} other",
      "rc.andOthers.other": "and {n} others",
      "rc.today": "Today",
      "rc.pokes": "Pokes",
      "rc.viewPokes": "See who poked you",
      "rc.connect": "Connect With Friends",
      "rc.invite": "Invite friends to join Facebook.",
      "rc.importer": "Use our {link} to find friends you didn't know were on Facebook.",
      "rc.importerLink": "contact importer",
      "rc.mobile": "Use Facebook on your {link} to connect with friends on the go.",
      "rc.mobileLink": "mobile phone",
      "rc.mfga": "MFGA",
      "rc.mfgaSettings": "Settings",
      "rc.adsRemoved.one": "ad removed today",
      "rc.adsRemoved.other": "ads removed today",
      "rc.suggestedRemoved.one": "suggested post removed today",
      "rc.suggestedRemoved.other": "suggested posts removed today",
      "rc.mfgaNote": "Your News Feed shows only your friends, groups and pages.",
      "chat.online": "Chat ({n})",
      "chat.offline": "Chat (Offline)",
      "footer.language": "English (US)",
      "footer.about": "About",
      "footer.advertising": "Advertising",
      "footer.developers": "Developers",
      "footer.careers": "Careers",
      "footer.privacy": "Privacy",
      "footer.terms": "Terms",
      "footer.help": "Help"
    },
    pl: {
      "header.home": "Strona główna",
      "header.profile": "Profil",
      "header.account": "Konto",
      "header.search": "Szukaj",
      "header.requests": "Zaproszenia do grona znajomych",
      "header.messages": "Wiadomości",
      "header.notifications": "Powiadomienia",
      "header.editFriends": "Edytuj znajomych",
      "header.accountSettings": "Ustawienia konta",
      "header.privacySettings": "Ustawienia prywatności",
      "header.mfgaSettings": "Ustawienia MFGA…",
      "header.help": "Centrum pomocy",
      "header.logout": "Wyloguj",
      "nav.viewProfile": "Zobacz mój profil",
      "nav.newsFeed": "Aktualności",
      "nav.feed.friends": "Znajomi",
      "nav.feed.groups": "Grupy",
      "nav.feed.pages": "Strony",
      "nav.feed.favorites": "Ulubione",
      "nav.messages": "Wiadomości",
      "nav.events": "Wydarzenia",
      "nav.photos": "Zdjęcia",
      "nav.friends": "Znajomi",
      "nav.apps": "Aplikacje",
      "nav.games": "Gry",
      "nav.pages": "Strony",
      "nav.groups": "Grupy",
      "nav.more": "Więcej",
      "nav.saved": "Zapisane",
      "nav.video": "Filmy",
      "nav.marketplace": "Marketplace",
      "nav.chat": "Czat ze znajomymi",
      "nav.goOnline": "Połącz z czatem",
      "rc.seeAll": "Zobacz wszystkie",
      "rc.requests": "Prośby",
      "rc.friendRequests.one": "zaproszenie do grona znajomych",
      "rc.friendRequests.few": "zaproszenia do grona znajomych",
      "rc.friendRequests.many": "zaproszeń do grona znajomych",
      "rc.events": "Wydarzenia",
      "rc.birthday": "Urodziny: {name}",
      "rc.andOthers.one": "i {n} inna osoba",
      "rc.andOthers.few": "i {n} inne osoby",
      "rc.andOthers.many": "i {n} innych osób",
      "rc.today": "Dzisiaj",
      "rc.pokes": "Zaczepki",
      "rc.viewPokes": "Zobacz, kto Cię zaczepił",
      "rc.connect": "Połącz się ze znajomymi",
      "rc.invite": "Zaproś znajomych na Facebooka.",
      "rc.importer": "Użyj {link}, aby znaleźć znajomych, o których nie wiesz, że są na Facebooku.",
      "rc.importerLink": "importera kontaktów",
      "rc.mobile": "Korzystaj z Facebooka na {link}, aby być w kontakcie ze znajomymi w drodze.",
      "rc.mobileLink": "telefonie komórkowym",
      "rc.mfga": "MFGA",
      "rc.mfgaSettings": "Ustawienia",
      "rc.adsRemoved.one": "reklama usunięta dzisiaj",
      "rc.adsRemoved.few": "reklamy usunięte dzisiaj",
      "rc.adsRemoved.many": "reklam usuniętych dzisiaj",
      "rc.suggestedRemoved.one": "proponowany post usunięty dzisiaj",
      "rc.suggestedRemoved.few": "proponowane posty usunięte dzisiaj",
      "rc.suggestedRemoved.many": "proponowanych postów usuniętych dzisiaj",
      "rc.mfgaNote": "Twoje Aktualności pokazują tylko znajomych, grupy i strony.",
      "chat.online": "Czat ({n})",
      "chat.offline": "Czat (offline)",
      "footer.language": "Polski",
      "footer.about": "Informacje",
      "footer.advertising": "Reklama",
      "footer.developers": "Programiści",
      "footer.careers": "Kariera",
      "footer.privacy": "Prywatność",
      "footer.terms": "Regulamin",
      "footer.help": "Pomoc"
    }
  });

  // src/ui/shell/model.js
  var FB = "https://www.facebook.com";
  var MAX_CHAT = 8;
  function photosUrl(profileUrl) {
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
  function badgeText(n) {
    if (!Number.isFinite(n) || n <= 0) return null;
    return n > 99 ? "99+" : String(n);
  }
  function normalizeStats(stats) {
    const num2 = (v) => Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0;
    return { ads: num2(stats?.ads), suggested: num2(stats?.suggested) };
  }
  function navItem(key, icon2, href, { count: count2 = 0, selected = false, arrow = false } = {}) {
    return { key, icon: icon2, label: t(`nav.${key}`), href, count: count2 > 0 ? count2 : 0, selected, arrow };
  }
  var FEED_FILTERS = [
    ["friends", "nav_friends"],
    ["groups", "nav_groups"],
    ["pages", "nav_pages"],
    ["favorites", "nav_favorites"]
  ];
  function leftNavModel({ route, identity, counts, shortcuts, contacts }) {
    const mode = route?.mode;
    const filter = mode === "home" ? route?.filter || null : null;
    const groups = shortcuts?.groups || [];
    const pages = shortcuts?.pages || [];
    const unreadGroups = groups.filter((g) => g.count > 0).length;
    const toRow = (s) => ({ label: s.name, href: s.url, image: s.image, count: s.count > 0 ? s.count : 0 });
    return {
      me: { name: identity?.name || null, url: identity?.url || `${FB}/me/`, avatar: identity?.avatar || null },
      primary: [
        navItem("newsFeed", "nav_news_feed", `${FB}/`, { selected: mode === "home" && !filter }),
        navItem("messages", "nav_messages", `${FB}/messages/`, { count: counts?.messages }),
        navItem("events", "nav_events", `${FB}/events/`),
        navItem("photos", "nav_photos", photosUrl(identity?.url)),
        navItem("friends", "nav_friends", `${FB}/friends/`, { count: counts?.friendRequests })
      ],
      apps: [
        navItem("apps", "nav_apps", `${FB}/bookmarks/`),
        navItem("games", "nav_games_2010", `${FB}/gaming/play/`),
        navItem("pages", "nav_pages", `${FB}/pages/?category=your_pages`, { arrow: pages.length > 0 }),
        navItem("groups", "nav_groups", `${FB}/groups/feed/`, { count: unreadGroups, selected: mode === "groups-feed", arrow: groups.length > 0 })
      ],
      more: [
        navItem("saved", "nav_saved", `${FB}/saved/`),
        navItem("video", "nav_video", `${FB}/watch/`),
        navItem("marketplace", "nav_marketplace", `${FB}/marketplace/`)
      ],
      feeds: mode === "home" ? FEED_FILTERS.map(([key, ico]) => ({
        ...navItem(`feed_${key}`, ico, `${FB}/?filter=${key}&sk=h_chr`, { selected: filter === key }),
        label: t(`nav.feed.${key}`)
      })) : [],
      groups: groups.map(toRow),
      pages: pages.map(toRow),
      chat: (contacts || []).filter((c) => c.online).slice(0, MAX_CHAT).map((c) => ({ label: c.name, href: c.url }))
    };
  }
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
  function rightColModel({ counts, birthdays, stats }) {
    const requests = counts?.friendRequests > 0 ? [{ icon: "rc_friend_request", count: counts.friendRequests, label: t("rc.friendRequests", { n: counts.friendRequests }), href: `${FB}/friends/requests/` }] : [];
    const { ads, suggested } = normalizeStats(stats);
    return {
      requests,
      events: birthdayRows(birthdays),
      mfga: [
        { icon: "nav_ads", count: ads, label: t("rc.adsRemoved", { n: ads }) },
        { icon: "rc_friend_suggestion", count: suggested, label: t("rc.suggestedRemoved", { n: suggested }) }
      ]
    };
  }
  function chatTabModel(contacts) {
    const n = (contacts || []).filter((c) => c.online).length;
    return n > 0 ? { icon: "chat_online", label: t("chat.online", { n }) } : { icon: "chat_offline", label: t("chat.offline") };
  }
  function splitTemplate(template, name) {
    const i = template.indexOf(`{${name}}`);
    return i < 0 ? [template, ""] : [template.slice(0, i), template.slice(i + name.length + 2)];
  }

  // src/ui/shell/header.js
  var FB2 = "https://www.facebook.com";
  var JEWELS2 = [
    { key: "requests", count: "friendRequests", href: `${FB2}/friends/requests/`, label: "header.requests" },
    { key: "messages", count: "messages", href: `${FB2}/messages/`, label: "header.messages" },
    { key: "notifications", count: "notifications", href: `${FB2}/notifications/`, label: "header.notifications" }
  ];
  function jewel(spec) {
    const el = h(`a.mfga-header-jewel.mfga-header-jewel-${spec.key}`, { href: spec.href, title: t(spec.label), "aria-label": t(spec.label) });
    return { spec, el, count: -1 };
  }
  function setJewelCount(j, n) {
    const count2 = Number.isFinite(n) ? n : 0;
    if (count2 === j.count) return;
    j.count = count2;
    const badge = badgeText(count2);
    const label = badge ? `${t(j.spec.label)} (${badge})` : t(j.spec.label);
    j.el.setAttribute("aria-label", label);
    replaceChildren(j.el, icon(`jewel_${j.spec.key}_${badge ? "on" : "off"}`), badge && h("span.mfga-header-count", badge));
  }
  function revealNativeAccountMenu(navigator2) {
    const btn = findAccountButton(document);
    if (!btn) {
      health.count("header.logout-fallback");
      navigator2.go(`${FB2}/settings/`);
      return;
    }
    const html = document.documentElement;
    let opened = false;
    const done = () => {
      html.removeAttribute("data-mfga-native-banner");
      mo.disconnect();
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
    const mo = new MutationObserver(() => {
      if (btn.getAttribute("aria-expanded") === "true") opened = true;
      else if (opened) done();
    });
    const onDown = (e) => {
      if (!e.target.closest?.('[role="banner"], [role="dialog"]')) done();
    };
    const onKey = (e) => {
      if (e.key === "Escape") done();
    };
    html.setAttribute("data-mfga-native-banner", "");
    mo.observe(btn, { attributes: true, attributeFilter: ["aria-expanded"] });
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    health.count("header.logout-native");
    btn.click();
  }
  function createHeader({ navigator: navigator2, openSettings }) {
    const jewels = JEWELS2.map(jewel);
    const input = h("input.mfga-header-search-input", { type: "text", name: "q", placeholder: t("header.search"), "aria-label": t("header.search"), autocomplete: "off", enterkeyhint: "search" });
    const search = h(
      "form.mfga-header-search",
      {
        role: "search",
        onsubmit: (e) => {
          e.preventDefault();
          const q = input.value.trim();
          if (q) navigator2.go(`${FB2}/search/top/?q=${encodeURIComponent(q)}`);
          else input.focus();
        }
      },
      input,
      h("button.mfga-header-search-btn", { type: "submit", "aria-label": t("header.search") }, icon("search_glass"))
    );
    const profileLink = h("a.mfga-header-link", { href: `${FB2}/me/` }, t("header.profile"));
    const menu = h("ul.mfga-header-menu", { role: "menu", hidden: true });
    const accountBtn = h(
      "button.mfga-header-link.mfga-header-account-btn",
      { type: "button", "aria-haspopup": "menu", "aria-expanded": "false" },
      t("header.account"),
      h("span.mfga-header-arrow", { "aria-hidden": "true" })
    );
    const account = h("li.mfga-header-account", accountBtn, menu);
    const el = h(
      "div.mfga-header",
      h(
        "div.mfga-header-page",
        h("a.mfga-header-logo", { href: `${FB2}/`, "aria-label": "Facebook", title: t("header.home") }, icon("logo_header")),
        h("div.mfga-header-jewels", jewels.map((j) => j.el)),
        h(
          "div.mfga-header-nav",
          search,
          h("ul.mfga-header-links", h("li", h("a.mfga-header-link", { href: `${FB2}/` }, t("header.home"))), h("li", profileLink), account)
        )
      )
    );
    const setOpen = (open) => {
      menu.hidden = !open;
      account.classList.toggle("mfga-open", open);
      el.classList.toggle("mfga-header-open", open);
      accountBtn.setAttribute("aria-expanded", String(open));
      if (open) menu.querySelector(".mfga-header-menu-item")?.focus();
    };
    const action = (label, run) => {
      const onclick = () => {
        setOpen(false);
        run();
      };
      return h("li", { role: "none" }, h("button.mfga-header-menu-item", { type: "button", role: "menuitem", onclick }, label));
    };
    const link2 = (label, href) => h("li", { role: "none" }, h("a.mfga-header-menu-item", { role: "menuitem", href, onclick: () => setOpen(false) }, label));
    const sep2 = () => h("li.mfga-header-menu-sep", { role: "separator" });
    replaceChildren(
      menu,
      link2(t("header.editFriends"), `${FB2}/friends/`),
      sep2(),
      link2(t("header.accountSettings"), `${FB2}/settings/`),
      link2(t("header.privacySettings"), `${FB2}/settings/?tab=privacy`),
      action(t("header.mfgaSettings"), () => openSettings?.()),
      sep2(),
      link2(t("header.help"), `${FB2}/help/`),
      sep2(),
      action(t("header.logout"), () => revealNativeAccountMenu(navigator2))
    );
    accountBtn.addEventListener("click", () => setOpen(menu.hidden));
    const onDocDown = (e) => {
      if (!menu.hidden && !account.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape" && !menu.hidden) {
        setOpen(false);
        accountBtn.focus();
      }
    };
    document.addEventListener("mousedown", onDocDown, true);
    document.addEventListener("keydown", onKey, true);
    return {
      el,
      update({ identity, counts }) {
        for (const j of jewels) setJewelCount(j, counts?.[j.spec.count]);
        const url = safeUrl(identity?.url);
        if (url) profileLink.setAttribute("href", url);
      },
      destroy() {
        document.removeEventListener("mousedown", onDocDown, true);
        document.removeEventListener("keydown", onKey, true);
      }
    };
  }

  // src/ui/shell/left-col.js
  function count(n) {
    return n > 0 ? [" ", h("span.mfga-nav-count", `(${n})`)] : null;
  }
  function navRow(item) {
    return h(
      "li.mfga-nav-item",
      { class: item.selected && "mfga-nav-selected", dataset: { key: item.key } },
      h(
        "a.mfga-nav-link",
        { href: item.href, "aria-current": item.selected ? "page" : null },
        h("span.mfga-nav-icon", icon(item.icon)),
        h("span.mfga-nav-label", item.label),
        count(item.count),
        item.arrow && icon("misc_more_arrow", { className: "mfga-nav-arrow" })
      )
    );
  }
  function feedFilters(items) {
    return h("li.mfga-nav-item.mfga-nav-subwrap", h("ul.mfga-nav-list.mfga-nav-sub", items.map(navRow)));
  }
  function shortcutRow(item, fallbackIcon) {
    return h(
      "li.mfga-nav-item",
      h(
        "a.mfga-nav-link",
        { href: item.href, title: item.label },
        h("span.mfga-nav-icon", item.image ? h("img.mfga-nav-pic", { src: item.image, alt: "", width: 16, height: 16, loading: "lazy" }) : icon(fallbackIcon)),
        h("span.mfga-nav-label", item.label),
        count(item.count)
      )
    );
  }
  function section(title, rows, fallbackIcon) {
    if (!rows.length) return null;
    return [h("div.mfga-nav-sep"), h("div.mfga-nav-title", title), h("ul.mfga-nav-list", rows.map((row2) => shortcutRow(row2, fallbackIcon)))];
  }
  function me(model) {
    const { name, url, avatar: avatar2 } = model.me;
    return h(
      "div.mfga-nav-me",
      h("a.mfga-nav-me-pic", { href: url, "aria-hidden": "true", tabindex: "-1" }, avatar2 ? h("img", { src: avatar2, alt: "", width: 50, height: 50 }) : null),
      h(
        "div.mfga-nav-me-text",
        name && h("a.mfga-nav-me-name", { href: url }, name),
        h("a.mfga-nav-me-view", { href: url }, t("nav.viewProfile"))
      )
    );
  }
  function chat(model) {
    const online = model.chat;
    return h(
      "div.mfga-nav-chat",
      h("div.mfga-nav-sep"),
      h("div.mfga-nav-title", t("nav.chat")),
      online.length ? h("ul.mfga-nav-list", online.map((c) => h("li.mfga-nav-item", h("a.mfga-nav-link", { href: c.href }, h("span.mfga-nav-icon", icon("chat_online")), h("span.mfga-nav-label", c.label))))) : h("a.mfga-nav-go-online", { href: "https://www.facebook.com/messages/" }, t("nav.goOnline"))
    );
  }
  function renderLeftCol(model, { expanded = false, onMore, showChat = true } = {}) {
    const more = expanded ? model.more.map(navRow) : h(
      "li.mfga-nav-item",
      h("button.mfga-nav-more", { type: "button", "aria-expanded": "false", onclick: onMore }, t("nav.more"), icon("misc_tri_blue_down", { className: "mfga-nav-more-arrow" }))
    );
    return [
      me(model),
      h("ul.mfga-nav-list", model.primary.flatMap((item) => item.key === "newsFeed" && model.feeds?.length ? [navRow(item), feedFilters(model.feeds)] : [navRow(item)])),
      h("div.mfga-nav-sep"),
      h("ul.mfga-nav-list", model.apps.map(navRow), more),
      section(t("nav.groups"), model.groups, "nav_groups"),
      section(t("nav.pages"), model.pages, "nav_pages"),
      showChat && chat(model)
    ];
  }

  // src/ui/shell/right-col.js
  var FB3 = "https://www.facebook.com";
  function box(key, title, action, body) {
    return h(
      `div.mfga-rc-box.mfga-rc-${key}`,
      h("div.mfga-rc-head", h("h4.mfga-rc-title", title), action),
      h("div.mfga-rc-body", body)
    );
  }
  var seeAll = (href) => h("a.mfga-rc-action", { href }, t("rc.seeAll"));
  function countRow(row2) {
    const content = [icon(row2.icon), h("b", String(row2.count)), " ", row2.label];
    return row2.href ? h("a.mfga-rc-row.mfga-rc-link", { href: row2.href }, content) : h("div.mfga-rc-row", content);
  }
  function linkedSentence(key, linkKey, href) {
    const [before2, after] = splitTemplate(t(key), "link");
    return [before2, h("a", { href }, t(linkKey)), after];
  }
  function birthdayContent(row2) {
    if (!row2.name) return h("a", { href: row2.href }, row2.text);
    const [before2, after] = splitTemplate(t("rc.birthday"), "name");
    return [before2, h("a", { href: row2.href }, row2.name), after, " ", h("span.mfga-rc-when", t("rc.today"))];
  }
  function birthdayRow(row2, first) {
    return h("div.mfga-rc-row.mfga-rc-event", first ? icon("rc_gift") : null, birthdayContent(row2));
  }
  function renderRightCol(model, { openSettings } = {}) {
    return [
      model.requests.length ? box("requests", t("rc.requests"), seeAll(`${FB3}/friends/requests/`), model.requests.map(countRow)) : null,
      box(
        "mfga",
        t("rc.mfga"),
        h("button.mfga-rc-action", { type: "button", onclick: () => openSettings?.() }, t("rc.mfgaSettings")),
        [...model.mfga.map(countRow), h("p.mfga-rc-note", t("rc.mfgaNote"))]
      ),
      model.events.length ? box("events", t("rc.events"), seeAll(`${FB3}/events/birthdays/`), model.events.map((row2, i) => birthdayRow(row2, i === 0))) : null,
      box("pokes", t("rc.pokes"), seeAll(`${FB3}/pokes/`), h("a.mfga-rc-row.mfga-rc-link", { href: `${FB3}/pokes/` }, icon("rc_poke"), t("rc.viewPokes"))),
      box("connect", t("rc.connect"), null, [
        h("div.mfga-rc-row.mfga-rc-text", icon("rc_invite"), h("a", { href: `${FB3}/friends/` }, t("rc.invite"))),
        h("div.mfga-rc-row.mfga-rc-text", icon("rc_contact_importer"), linkedSentence("rc.importer", "rc.importerLink", `${FB3}/friends/suggestions/`)),
        h("div.mfga-rc-row.mfga-rc-text", icon("rc_mobile"), linkedSentence("rc.mobile", "rc.mobileLink", `${FB3}/mobile/`))
      ])
    ];
  }

  // src/ui/shell/footer.js
  var LINKS = [
    ["footer.about", "https://www.facebook.com/facebook"],
    ["footer.advertising", "https://www.facebook.com/business/ads"],
    ["footer.developers", "https://developers.facebook.com/"],
    ["footer.careers", "https://www.metacareers.com/"],
    ["footer.privacy", "https://www.facebook.com/privacy/policy/"],
    ["footer.terms", "https://www.facebook.com/policies"],
    ["footer.help", "https://www.facebook.com/help/"]
  ];
  function renderFooter({ openSettings } = {}) {
    return h(
      "div.mfga-footer-inner",
      h("div.mfga-footer-left", "Facebook © 2010 · ", h("button.mfga-footer-lang", { type: "button", onclick: () => openSettings?.() }, t("footer.language"))),
      h("div.mfga-footer-links", joinNodes(LINKS.map(([key, href]) => h("a", { href }, t(key))), () => " · "))
    );
  }
  function renderChatTab(model) {
    return [icon(model.icon), h("span.mfga-chat-label", model.label)];
  }

  // src/ui/shell/shell.js
  var FB4 = "https://www.facebook.com";
  var STATS_REFRESH_MS = 1e4;
  var rendered = /* @__PURE__ */ new WeakMap();
  function patch(el, model, render) {
    const key = JSON.stringify(model);
    if (rendered.get(el) === key) return;
    rendered.set(el, key);
    replaceChildren(el, render());
  }
  function createShell(ctx) {
    const { reader, navigator: navigator2 } = ctx;
    let route = ctx.route || null;
    let settings = ctx.settings;
    let expanded = false;
    const look = () => ((typeof settings?.get === "function" ? settings.get() : settings) || DEFAULTS).look;
    let header = createHeader({ navigator: navigator2, openSettings: ctx.openSettings });
    let locale2 = getLocale();
    const left = h("nav.mfga-shell-col.mfga-shell-left");
    const right = h("aside.mfga-shell-col.mfga-shell-right");
    const chatTab = h("button.mfga-chat-tab", { type: "button", onclick: () => navigator2.go(`${FB4}/messages/`) });
    const footer = h("footer.mfga-footer", h("div.mfga-footer-curve"), renderFooter({ openSettings: ctx.openSettings }));
    const el = h(
      "div.mfga-shell-root",
      h("div.mfga-shell-backdrop"),
      header.el,
      h("div.mfga-shell-page", h("div.mfga-shell-sep"), h("div.mfga-shell-rule"), left, right, footer),
      chatTab
    );
    const relabel = () => {
      if (getLocale() === locale2) return;
      locale2 = getLocale();
      const next = createHeader({ navigator: navigator2, openSettings: ctx.openSettings });
      header.el.replaceWith(next.el);
      header.destroy();
      header = next;
      replaceChildren(footer, h("div.mfga-footer-curve"), renderFooter({ openSettings: ctx.openSettings }));
    };
    const render = safe("shell", () => {
      relabel();
      const { chat: chat2, rightColumn } = look();
      const identity = reader.identity();
      const counts = reader.counts();
      const contacts = reader.contacts();
      header.update({ identity, counts });
      const leftModel = leftNavModel({ route, identity, counts, shortcuts: reader.shortcuts(), contacts });
      const onMore = () => {
        expanded = true;
        render();
      };
      patch(left, [leftModel, expanded, chat2], () => renderLeftCol(leftModel, { expanded, onMore, showChat: chat2 }));
      right.hidden = !rightColumn;
      if (rightColumn) {
        const rightModel = rightColModel({ counts, birthdays: reader.birthdays(), stats: ctx.stats?.() });
        patch(right, rightModel, () => renderRightCol(rightModel, { openSettings: ctx.openSettings }));
      }
      chatTab.hidden = !chat2;
      const chatModel = chatTabModel(contacts);
      chatTab.setAttribute("aria-label", chatModel.label);
      patch(chatTab, chatModel, () => renderChatTab(chatModel));
    });
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.("a[href]");
      if (!a || a.target && a.target !== "_self") return;
      e.preventDefault();
      navigator2.go(a.href);
    };
    el.addEventListener("click", onClick);
    shellHost().appendChild(el);
    const unsubscribeReader = reader.subscribe(render);
    const unsubscribeSettings = typeof settings?.subscribe === "function" ? settings.subscribe(render) : null;
    const statsTimer = setInterval(render, STATS_REFRESH_MS);
    render();
    return {
      el,
      update(state = {}) {
        if (state.route) route = state.route;
        if (state.settings) settings = state.settings;
        render();
      },
      destroy() {
        clearInterval(statsTimer);
        unsubscribeReader?.();
        unsubscribeSettings?.();
        header.destroy();
        el.remove();
      }
    };
  }

  // src/ui/stream/strings.js
  registerStrings({
    en: {
      "feed.title": "News Feed",
      "feed.top": "Top News",
      "feed.recent": "Most Recent",
      "feed.newPosts.one": "1 new post",
      "feed.newPosts.other": "{n} new posts",
      "feed.composer": "What's on your mind?",
      "feed.older": "Older Posts",
      "feed.loading": "Loading...",
      "feed.empty": "There are no posts to show right now.",
      "feed.emptyHint": "Posts from your friends, groups and pages will show up here.",
      "feed.end": "There are no more posts to show right now.",
      "feed.error": "News Feed couldn't be loaded right now.",
      "feed.retry": "Try Again",
      "feed.hidden": "{ads} and {suggested} were hidden.",
      "feed.hiddenAds.one": "1 ad",
      "feed.hiddenAds.other": "{n} ads",
      "feed.hiddenSuggested.one": "1 suggested post",
      "feed.hiddenSuggested.other": "{n} suggested posts",
      "feed.welcome.title": "Welcome back to your old home page.",
      "feed.welcome.close": "close",
      "feed.welcome.step1": "See only posts from your friends, groups and pages. Ads and suggested posts are hidden.",
      "feed.welcome.step2": "Switch between Top News and Most Recent above the stream; Most Recent is newest first.",
      "feed.welcome.step3": "Choose what you see and how Facebook looks in MFGA Settings, in the Account menu above.",
      "feed.welcome.learn": "Learn more about Make Facebook Great Again",
      "story.and": " and ",
      "story.to": "to",
      "story.seeMore": "See More",
      "story.comment": "Comment",
      "story.share": "Share",
      "story.ai": "AI-generated",
      "story.addedPhoto.one": "added a new photo.",
      "story.addedPhoto.other": "added {n} new photos.",
      "story.addedVideo": "added a new video.",
      "story.sharedLink": "shared a link.",
      "story.sharedEvent": "shared an event.",
      "story.sharedPost": "shared {name}'s post.",
      "story.sharedPostAnon": "shared a post.",
      "story.morePhotos.one": "1 more photo",
      "story.morePhotos.other": "{n} more photos",
      "story.play": "Play video",
      "story.videoLength": "Length: {time}",
      "story.live": "LIVE",
      "story.unavailableTitle": "Attachment Unavailable",
      "story.unavailableText": "This attachment may have been removed or the person who shared it may not have permission to share it with you.",
      "story.viewAttachment": "View attachment",
      "ufi.like": "Like",
      "ufi.unlike": "Unlike",
      "ufi.youLike": "You like this.",
      "ufi.youAndOthers": "You and {link} like this.",
      "ufi.others.one": "1 other person",
      "ufi.others.other": "{n} others",
      "ufi.peopleLike.one": "{link} likes this.",
      "ufi.peopleLike.other": "{link} like this.",
      "ufi.people.one": "1 person",
      "ufi.people.other": "{n} people",
      "ufi.viewAll.one": "View 1 comment",
      "ufi.viewAll.other": "View all {n} comments",
      "ufi.viewMore": "View more comments",
      "ufi.replies.one": "1 reply",
      "ufi.replies.other": "{n} replies",
      "ufi.write": "Write a comment...",
      "ufi.submit": "Comment",
      "ufi.error.like": "Your Like couldn't be saved.",
      "ufi.error.comment": "Your comment couldn't be posted.",
      "ufi.error.comments": "Comments couldn't be loaded.",
      "ufi.error.open": "Open the post on Facebook"
    },
    pl: {
      "feed.title": "Aktualności",
      "feed.top": "Najciekawsze",
      "feed.recent": "Najnowsze",
      "feed.newPosts.one": "1 nowy post",
      "feed.newPosts.few": "{n} nowe posty",
      "feed.newPosts.many": "{n} nowych postów",
      "feed.composer": "O czym myślisz?",
      "feed.older": "Starsze posty",
      "feed.loading": "Wczytywanie...",
      "feed.empty": "W tej chwili nie ma postów do wyświetlenia.",
      "feed.emptyHint": "Tutaj pojawią się posty Twoich znajomych, grup i stron.",
      "feed.end": "W tej chwili nie ma więcej postów do wyświetlenia.",
      "feed.error": "Nie udało się teraz wczytać Aktualności.",
      "feed.retry": "Spróbuj ponownie",
      "feed.hidden": "Ukryto {ads} i {suggested}.",
      "feed.hiddenAds.one": "1 reklamę",
      "feed.hiddenAds.few": "{n} reklamy",
      "feed.hiddenAds.many": "{n} reklam",
      "feed.hiddenSuggested.one": "1 sugerowany post",
      "feed.hiddenSuggested.few": "{n} sugerowane posty",
      "feed.hiddenSuggested.many": "{n} sugerowanych postów",
      "feed.welcome.title": "Witaj ponownie na swojej starej stronie głównej.",
      "feed.welcome.close": "zamknij",
      "feed.welcome.step1": "Widzisz tylko posty znajomych, grup i stron. Reklamy i sugerowane posty są ukryte.",
      "feed.welcome.step2": "Przełączaj Najciekawsze i Najnowsze nad listą postów; Najnowsze są od najnowszych.",
      "feed.welcome.step3": "Wybierz, co widzisz i jak wygląda Facebook, w Ustawieniach MFGA w menu Konto powyżej.",
      "feed.welcome.learn": "Dowiedz się więcej o Make Facebook Great Again",
      "story.and": " i ",
      "story.to": "do",
      "story.seeMore": "Zobacz więcej",
      "story.comment": "Komentarz",
      "story.share": "Udostępnij",
      "story.ai": "Wygenerowane przez SI",
      "story.addedPhoto.one": "dodaje nowe zdjęcie.",
      "story.addedPhoto.few": "dodaje {n} nowe zdjęcia.",
      "story.addedPhoto.many": "dodaje {n} nowych zdjęć.",
      "story.addedVideo": "dodaje nowy film.",
      "story.sharedLink": "udostępnia link.",
      "story.sharedEvent": "udostępnia wydarzenie.",
      "story.sharedPost": "udostępnia post: {name}.",
      "story.sharedPostAnon": "udostępnia post.",
      "story.morePhotos.one": "1 zdjęcie więcej",
      "story.morePhotos.few": "{n} zdjęcia więcej",
      "story.morePhotos.many": "{n} zdjęć więcej",
      "story.play": "Odtwórz film",
      "story.videoLength": "Długość: {time}",
      "story.live": "NA ŻYWO",
      "story.unavailableTitle": "Załącznik niedostępny",
      "story.unavailableText": "Ten załącznik mógł zostać usunięty lub osoba, która go udostępniła, może nie mieć uprawnień, by udostępnić go Tobie.",
      "story.viewAttachment": "Zobacz załącznik",
      "ufi.like": "Lubię to!",
      "ufi.unlike": "Nie lubię",
      "ufi.youLike": "Lubisz to.",
      "ufi.youAndOthers": "Ty i {link} lubicie to.",
      "ufi.others.one": "1 inna osoba",
      "ufi.others.few": "{n} inne osoby",
      "ufi.others.many": "{n} innych osób",
      "ufi.peopleLike.one": "{link} lubi to.",
      "ufi.peopleLike.few": "{link} lubią to.",
      "ufi.peopleLike.many": "{link} lubi to.",
      "ufi.people.one": "1 osoba",
      "ufi.people.few": "{n} osoby",
      "ufi.people.many": "{n} osób",
      "ufi.viewAll.one": "Wyświetl 1 komentarz",
      "ufi.viewAll.few": "Wyświetl wszystkie {n} komentarze",
      "ufi.viewAll.many": "Wyświetl wszystkie {n} komentarzy",
      "ufi.viewMore": "Wyświetl więcej komentarzy",
      "ufi.replies.one": "1 odpowiedź",
      "ufi.replies.few": "{n} odpowiedzi",
      "ufi.replies.many": "{n} odpowiedzi",
      "ufi.write": "Napisz komentarz...",
      "ufi.submit": "Komentarz",
      "ufi.error.like": "Nie udało się zapisać polubienia.",
      "ufi.error.comment": "Nie udało się opublikować komentarza.",
      "ufi.error.comments": "Nie udało się wczytać komentarzy.",
      "ufi.error.open": "Otwórz post na Facebooku"
    }
  });

  // src/ui/stream/format.js
  var numberLocale = () => getLocale() === "pl" ? "pl-PL" : "en-US";
  function formatCount(n) {
    const v = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
    return v.toLocaleString(numberLocale());
  }
  function isReacted(viewerReaction) {
    if (viewerReaction == null || viewerReaction === false || viewerReaction === "") return false;
    return String(viewerReaction) !== "0";
  }
  function feedbackState(feedback) {
    const fb = feedback || {};
    const liked = isReacted(fb.viewerReaction);
    const count2 = Number.isFinite(fb.reactions) ? Math.max(0, fb.reactions) : 0;
    return {
      liked,
      count: Math.max(count2, liked ? 1 : 0),
      comments: Number.isFinite(fb.comments) ? Math.max(0, fb.comments) : 0,
      canComment: fb.canComment !== false
    };
  }
  function withLink(template, linkText) {
    const [before2, after = ""] = template.split("{link}");
    return [before2 && { text: before2 }, { text: linkText, link: true }, after && { text: after }].filter(Boolean);
  }
  function likeSentence(count2, liked) {
    const n = Number.isFinite(count2) ? Math.max(0, Math.round(count2)) : 0;
    if (liked) {
      const others = Math.max(0, n - 1);
      return others ? withLink(t("ufi.youAndOthers"), t("ufi.others", { n: others })) : [{ text: t("ufi.youLike") }];
    }
    return n ? withLink(t("ufi.peopleLike", { n }), t("ufi.people", { n })) : [];
  }
  var AD_REASONS = /* @__PURE__ */ new Set([
    "sponsored-data",
    "sponsored-label",
    "auction-distance",
    "category:SPONSORED",
    "category:PROMOTION",
    "category:HIGH_VALUE_PROMOTION",
    "unit:MarketplaceFeedAdStory",
    "unit:AdsSideFeedUnit"
  ]);
  var SUGGESTION_REASONS = /* @__PURE__ */ new Set(["unconnected", "recommended", "follow-suggestion", "join-suggestion"]);
  var isSuggestion = (reason) => SUGGESTION_REASONS.has(reason) || /^(unit|category):/.test(reason);
  var isMap = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  function hiddenCounts(stats) {
    if (!isMap(stats)) return { ads: 0, suggested: 0 };
    const num2 = (v) => Number.isFinite(v) && v > 0 ? v : 0;
    if ("ads" in stats || "suggested" in stats) return { ads: num2(stats.ads), suggested: num2(stats.suggested) };
    const reasons = [stats.dropped, stats.hidden].find(isMap) ?? stats;
    let ads = 0;
    let suggested = 0;
    for (const [reason, n] of Object.entries(reasons)) {
      if (AD_REASONS.has(reason)) ads += num2(n);
      else if (isSuggestion(reason)) suggested += num2(n);
    }
    return { ads, suggested };
  }
  function hiddenSentence(stats) {
    const { ads, suggested } = hiddenCounts(stats);
    if (!ads && !suggested) return "";
    return t("feed.hidden", { ads: t("feed.hiddenAds", { n: ads }), suggested: t("feed.hiddenSuggested", { n: suggested }) });
  }
  function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    const s = Math.round(seconds);
    const hh = Math.floor(s / 3600);
    const mm = Math.floor(s % 3600 / 60);
    const ss = String(s % 60).padStart(2, "0");
    return hh ? `${hh}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
  }
  function fitBox(w, h2, maxW, maxH) {
    if (!(w > 0 && h2 > 0)) return { width: maxW, height: Math.round(maxW * 3 / 4) };
    const k = Math.min(1, maxW / w, maxH / h2);
    return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h2 * k)) };
  }
  function photoGrid(att, max = 4) {
    const items = (att?.items || []).filter((it) => it && it.uri);
    const shown = items.slice(0, max);
    const total = Number.isFinite(att?.total) ? Math.max(att.total, items.length) : items.length;
    return { shown, more: Math.max(0, total - shown.length) };
  }
  function chronological(comments) {
    return [...comments || []].filter(Boolean).sort((a, b) => (a.time || 0) - (b.time || 0));
  }
  function mergeComments(existing, incoming) {
    const seen = new Set(existing.map((c) => c.id).filter(Boolean));
    const out = [...existing];
    for (const c of incoming || []) {
      if (!c || c.id && seen.has(c.id)) continue;
      if (c.id) seen.add(c.id);
      out.push(c);
    }
    return out;
  }
  function truncateSegments(segments, { keep = 400, max = 520 } = {}) {
    const total = segments.reduce((n, s) => n + s.text.length, 0);
    if (total <= max) return { visible: segments, truncated: false };
    const visible = [];
    let used = 0;
    for (const seg of segments) {
      const room = keep - used;
      if (seg.text.length <= room) {
        visible.push(seg);
        used += seg.text.length;
        continue;
      }
      if (!seg.url && room > 0) {
        const cut = seg.text.slice(0, room);
        const space = cut.search(/\s\S*$/);
        const head = (space > 0 ? cut.slice(0, space) : cut).trimEnd();
        if (head) visible.push({ text: head });
      }
      break;
    }
    return { visible, truncated: true };
  }
  function titleTail(story) {
    const name = story?.actors?.[0]?.name;
    const title = typeof story?.title === "string" ? story.title.trim() : "";
    if (!name || !title.startsWith(name)) return null;
    const tail = title.slice(name.length);
    return /^[\p{L}\p{N}]/u.test(tail) ? null : tail;
  }
  function passiveHeadline(story) {
    if (!story || story.text || story.title) return null;
    if (story.shared) {
      const name = story.shared.actors?.[0]?.name;
      return name ? t("story.sharedPost", { name }) : t("story.sharedPostAnon");
    }
    const att = (story.attachments || [])[0];
    switch (att?.kind) {
      case "photo": {
        const { shown, more } = photoGrid(att);
        return t("story.addedPhoto", { n: Math.max(1, shown.length + more) });
      }
      case "video":
        return t("story.addedVideo");
      case "link":
        return t("story.sharedLink");
      case "event":
        return t("story.sharedEvent");
      default:
        return null;
    }
  }
  function enabledSources(feedSettings) {
    const src = feedSettings?.sources || {};
    return ["friends", "groups", "pages", "favorites"].filter((k) => src[k] !== false);
  }
  function countNewer(stories, lastSeen) {
    if (!Number.isFinite(lastSeen) || lastSeen <= 0) return 0;
    return stories.filter((s) => Number.isFinite(s?.time) && s.time > lastSeen).length;
  }
  function fullDate(unixSeconds) {
    if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return "";
    const d = new Date(unixSeconds * 1e3);
    const pl = getLocale() === "pl";
    const date = d.toLocaleDateString(numberLocale(), { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const mm = String(d.getMinutes()).padStart(2, "0");
    const time = pl ? `${d.getHours()}:${mm}` : `${d.getHours() % 12 || 12}:${mm}${d.getHours() < 12 ? "am" : "pm"}`;
    return t("time.date", { date, time });
  }

  // src/ui/stream/parts.js
  var FACEBOOK_HOST = /(^|\.)facebook\.com$/i;
  function isFacebookUrl(url) {
    try {
      return FACEBOOK_HOST.test(new URL(url).hostname);
    } catch {
      return false;
    }
  }
  function link(url, props, ...children) {
    const a = h("a", { ...props, href: url }, ...children);
    if (!a.hasAttribute("href")) return h("span", { class: props?.class }, ...children);
    if (isFacebookUrl(a.href)) {
      a.setAttribute("data-mfga-open", "");
    } else {
      a.target = "_blank";
      a.rel = "noopener noreferrer nofollow";
    }
    return a;
  }
  function linkButton(label, onClick, cls = "") {
    return h("button", { type: "button", class: ["mfga-linkbtn", cls], onclick: guard(onClick) }, label);
  }
  function guard(fn) {
    return safe("stream.ui", fn, { disableOnError: false });
  }
  function sep() {
    return h("span.mfga-sep", " · ");
  }
  function blankPicture() {
    return svg(
      "svg",
      { class: "mfga-pic-blank", viewBox: "0 0 50 50", "aria-hidden": "true" },
      svg("rect", { width: 50, height: 50, fill: "#F0F2F7" }),
      svg("circle", { cx: 25, cy: 19, r: 9, fill: "#BFC8DB" }),
      svg("path", { d: "M8 50C8 37 15 31 25 31S42 37 42 50Z", fill: "#BFC8DB" })
    );
  }
  function avatar(profileUrl, pictureUri, cls) {
    const img = pictureUri ? h("img", { src: pictureUri, alt: "", loading: "lazy", decoding: "async" }) : null;
    const pic = img && img.hasAttribute("src") ? img : blankPicture();
    return link(profileUrl, { class: cls, tabindex: "-1", "aria-hidden": "true" }, pic);
  }
  function segmentNodes(segments) {
    return segments.map((s) => s.url ? link(s.url, { class: `mfga-entity mfga-entity-${s.kind || "other"}` }, s.text) : text(s.text));
  }
  function richText(value, ranges) {
    return segmentNodes(textSegments(value, ranges));
  }
  function routeClicks(root, ctx) {
    root.addEventListener(
      "click",
      guard((ev) => {
        if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
        const a = ev.target.closest?.("a[data-mfga-open]");
        if (!a || !root.contains(a) || typeof ctx.open !== "function") return;
        ev.preventDefault();
        ctx.open(a.href, { newTab: false });
      })
    );
  }
  function settingsOf(ctx) {
    const s = typeof ctx?.settings?.get === "function" ? ctx.settings.get() : ctx?.settings;
    return s || DEFAULTS;
  }
  function nowMs(ctx) {
    const v = typeof ctx?.now === "function" ? ctx.now() : NaN;
    return Number.isFinite(v) ? v : Date.now();
  }

  // src/ui/stream/attachments.js
  var SINGLE_PHOTO = { w: 320, h: 320 };
  var VIDEO_BOX = { w: 320, h: 240 };
  function photoThumb(item, fallbackUrl, size, extra = null) {
    const img = h("img", {
      src: item.uri,
      alt: item.alt || "",
      loading: "lazy",
      decoding: "async",
      width: size.width,
      height: size.height
    });
    return link(item.href || fallbackUrl, { class: "mfga-att-photo" }, img, extra);
  }
  function renderPhotos(att, story) {
    const { shown, more } = photoGrid(att);
    if (!shown.length) return null;
    if (shown.length === 1 && !more) {
      const it = shown[0];
      return h("div.mfga-att.mfga-att-photos.mfga-att-single", photoThumb(it, story.url, fitBox(it.width, it.height, SINGLE_PHOTO.w, SINGLE_PHOTO.h)));
    }
    const square = { width: 100, height: 100 };
    return h(
      "div.mfga-att.mfga-att-photos.mfga-att-grid",
      shown.map((it, i) => {
        const last = i === shown.length - 1;
        const badge = last && more ? h("span.mfga-att-more", { "aria-label": t("story.morePhotos", { n: more }) }, `+${more}`) : null;
        return photoThumb(it, story.url, square, badge);
      })
    );
  }
  function playVideo(thumb, poster, src, size) {
    const video = h("video.mfga-att-player", {
      src,
      poster,
      controls: true,
      autoplay: true,
      preload: "none",
      playsinline: true,
      width: size.width,
      height: size.height
    });
    if (!video.hasAttribute("src")) return false;
    thumb.replaceWith(video);
    return true;
  }
  function renderVideo(att, story) {
    const size = fitBox(att.width, att.height, VIDEO_BOX.w, VIDEO_BOX.h);
    const posterUrl = safeUrl(att.poster);
    const poster = posterUrl ? h("img", { src: posterUrl, alt: "", loading: "lazy", decoding: "async", width: size.width, height: size.height }) : null;
    const thumb = link(
      att.href || story.url,
      { class: "mfga-att-video-thumb", style: { width: size.width, height: size.height }, "aria-label": t("story.play"), role: "button" },
      poster,
      h("i.mfga-att-play", { "aria-hidden": "true" }),
      att.live ? h("span.mfga-att-live", t("story.live")) : null
    );
    const src = att.hd || att.sd;
    if (src) {
      thumb.addEventListener(
        "click",
        guard((ev) => {
          if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
          if (playVideo(thumb, posterUrl, src, size)) ev.preventDefault();
        })
      );
    }
    const duration = formatDuration(att.duration);
    return h("div.mfga-att.mfga-att-video", thumb, duration ? h("div.mfga-att-caption", t("story.videoLength", { time: duration })) : null);
  }
  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }
  function renderLink(att) {
    const title = att.title || att.source || hostOf(att.url);
    const image = att.image ? link(att.url, { class: "mfga-att-link-img", tabindex: "-1" }, h("img", { src: att.image, alt: "", loading: "lazy", decoding: "async" })) : null;
    return h(
      "div.mfga-att.mfga-att-link",
      { class: image ? "mfga-att-has-img" : null },
      image,
      h(
        "div.mfga-att-link-body",
        title ? link(att.url, { class: "mfga-att-title" }, title) : null,
        att.source ? h("div.mfga-att-source", att.source) : null,
        att.description ? h("div.mfga-att-desc", att.description) : null
      )
    );
  }
  function renderEvent(att) {
    return h(
      "div.mfga-att.mfga-att-event",
      icon("nav_events", { className: "mfga-att-event-ico" }),
      h("div.mfga-att-event-body", link(att.url, { class: "mfga-att-title" }, att.title || att.url), att.when ? h("div.mfga-att-source", att.when) : null)
    );
  }
  function renderUnavailable() {
    return h("div.mfga-att.mfga-att-unavailable", h("div.mfga-att-unavailable-title", t("story.unavailableTitle")), h("div", t("story.unavailableText")));
  }
  function renderOther(att) {
    return att.href ? h("div.mfga-att.mfga-att-other", link(att.href, {}, t("story.viewAttachment"))) : null;
  }
  var RENDERERS = {
    photo: renderPhotos,
    video: renderVideo,
    link: renderLink,
    event: renderEvent,
    unavailable: renderUnavailable,
    other: renderOther
  };
  function renderAttachments(story) {
    const nodes = (story.attachments || []).map((att) => RENDERERS[att?.kind]?.(att, story)).filter(Boolean);
    return nodes.length ? h("div.mfga-story-attachments", nodes) : null;
  }

  // src/ui/stream/time.js
  function timeNode(unixSeconds, nowMs2) {
    if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return null;
    return h("abbr.mfga-time", { title: fullDate(unixSeconds), "data-utime": unixSeconds }, relativeTime(unixSeconds, nowMs2));
  }
  function refreshTimes(root, nowMs2) {
    for (const el of root.querySelectorAll("abbr.mfga-time[data-utime]")) {
      const next = relativeTime(Number(el.getAttribute("data-utime")), nowMs2);
      if (el.textContent !== next) el.textContent = next;
    }
  }

  // src/ui/stream/visibility.js
  var watched = /* @__PURE__ */ new Map();
  var observer = null;
  function onEntries(entries) {
    for (const entry of entries) {
      const w = watched.get(entry.target);
      if (!w) continue;
      if (entry.isIntersecting) {
        w.timer ||= setTimeout(() => fire(entry.target), w.ms);
      } else {
        clearTimeout(w.timer);
        w.timer = 0;
      }
    }
  }
  function fire(el) {
    const w = watched.get(el);
    unwatch(el);
    w?.cb();
  }
  function whenVisibleFor(el, ms, cb) {
    if (typeof IntersectionObserver !== "function") return () => {
    };
    observer ||= new IntersectionObserver(onEntries);
    watched.set(el, { ms, cb, timer: 0 });
    observer.observe(el);
    return () => unwatch(el);
  }
  function unwatch(el) {
    const w = watched.get(el);
    if (!w) return;
    clearTimeout(w.timer);
    watched.delete(el);
    observer?.unobserve(el);
  }
  function unwatchWithin(root) {
    for (const el of [...watched.keys()]) if (root.contains(el)) unwatch(el);
  }

  // src/ui/stream/ufi.js
  var PREVIEW_COUNT = 2;
  var PREVIEW_DELAY_MS = 1e3;
  async function attempt(fn) {
    try {
      const r = await fn();
      return r && typeof r === "object" ? r : { ok: false };
    } catch (error) {
      return { ok: false, error };
    }
  }
  function renderComment(c, story, ctx) {
    const author = c.author || {};
    const reactions = Number.isFinite(c.reactions) && c.reactions > 0 ? c.reactions : 0;
    const replies = Number.isFinite(c.replies) && c.replies > 0 ? c.replies : 0;
    return h(
      "div.mfga-ufi-item.mfga-ufi-comment",
      { "data-id": c.id || null },
      avatar(author.url, author.avatar, "mfga-ufi-pic"),
      h(
        "div.mfga-ufi-comment-body",
        h("div.mfga-ufi-comment-text", author.name ? [link(author.url, { class: "mfga-ufi-actor" }, author.name), " "] : null, richText(c.text, c.ranges)),
        h(
          "div.mfga-ufi-comment-meta",
          timeNode(c.time, nowMs(ctx)),
          reactions ? [sep(), icon("ufi_like", { className: "mfga-ufi-comment-like" }), ` ${formatCount(reactions)}`] : null,
          replies ? [sep(), link(story.url, { class: "mfga-ufi-replies" }, t("ufi.replies", { n: replies }))] : null
        )
      )
    );
  }
  function createFeedback(story, ctx) {
    const initial = feedbackState(story.feedback);
    const state = {
      liked: initial.liked,
      count: initial.count,
      total: initial.comments,
      comments: [],
      cursor: null,
      hasMore: true,
      loaded: false,
      expanded: false,
      loading: false,
      liking: false,
      posting: false,
      composing: false,
      expandOnLoad: false,
      posted: 0
    };
    const canComment = initial.canComment;
    const likes = h("div.mfga-ufi-item.mfga-ufi-likes");
    const viewAll = h("div.mfga-ufi-item.mfga-ufi-viewall");
    const list = h("div.mfga-ufi-comments");
    const error = h("div.mfga-ufi-item.mfga-ufi-error", { role: "alert", hidden: true });
    const add = canComment ? buildAddComment() : null;
    const nub = h("i.mfga-ufi-nub", { "aria-hidden": "true" });
    const ufi = h("div.mfga-ufi", nub, likes, viewAll, list, error, add?.item);
    const likeLink = linkButton("", toggleLike, "mfga-story-like");
    const commentLink = canComment ? linkButton(t("story.comment"), openComposer, "mfga-story-comment") : null;
    let cancelPreview = null;
    if (settingsOf(ctx).feed?.previewComments !== false && state.total > 0 && typeof ctx.actions?.comments === "function") {
      cancelPreview = whenVisibleFor(ufi, PREVIEW_DELAY_MS, guard(() => loadComments(true)));
    }
    render();
    return { ufi, likeLink, commentLink };
    function totalComments() {
      return Math.max(state.total, state.comments.length);
    }
    function shownComments() {
      const all = chronological(state.comments);
      return state.expanded ? all : all.slice(-(PREVIEW_COUNT + state.posted));
    }
    function render() {
      renderLikes();
      renderComments();
      renderViewAll();
      if (add) add.item.hidden = !(state.composing || totalComments() > 0);
      updateVisibility();
    }
    function renderLikes() {
      likeLink.textContent = state.liked ? t("ufi.unlike") : t("ufi.like");
      likeLink.setAttribute("aria-pressed", String(state.liked));
      const parts = likeSentence(state.count, state.liked);
      likes.hidden = !parts.length;
      const line = parts.map((p) => p.link ? link(story.url, { class: "mfga-ufi-likers" }, p.text) : p.text);
      replaceChildren(likes, parts.length ? icon("ufi_like_big", { className: "mfga-ufi-ico" }) : null, h("span.mfga-ufi-line", line));
    }
    function renderComments() {
      replaceChildren(list, shownComments().map((c) => renderComment(c, story, ctx)));
    }
    function renderViewAll() {
      const total = totalComments();
      const shown = shownComments().length;
      const more = state.expanded ? state.hasMore : total > shown;
      viewAll.hidden = !more;
      viewAll.classList.toggle("mfga-loading", state.loading);
      if (!more) return;
      const label = state.expanded ? t("ufi.viewMore") : t("ufi.viewAll", { n: total });
      replaceChildren(
        viewAll,
        icon("ufi_comment", { className: "mfga-ufi-ico" }),
        linkButton(label, onViewAll, "mfga-ufi-viewall-link"),
        state.loading ? h("span.mfga-spinner.mfga-ufi-spinner", { role: "progressbar" }) : null
      );
    }
    function updateVisibility() {
      ufi.hidden = [likes, viewAll, error, add?.item].every((el) => !el || el.hidden) && !list.childElementCount;
    }
    function showError(kind) {
      replaceChildren(
        error,
        h("span.mfga-ufi-error-text", t(`ufi.error.${kind}`)),
        story.url ? [" ", link(story.url, { class: "mfga-ufi-error-open" }, t("ufi.error.open"))] : null
      );
      error.hidden = false;
      updateVisibility();
    }
    function clearError() {
      if (error.hidden) return;
      error.hidden = true;
      replaceChildren(error);
      updateVisibility();
    }
    async function toggleLike() {
      if (state.liking) return;
      if (typeof ctx.actions?.react !== "function") return showError("like");
      const before2 = { liked: state.liked, count: state.count };
      state.liked = !before2.liked;
      state.count = Math.max(0, before2.count + (state.liked ? 1 : -1));
      state.liking = true;
      clearError();
      render();
      const r = await attempt(() => ctx.actions.react(story, state.liked ? REACTIONS.LIKE : REACTIONS.NONE));
      state.liking = false;
      if (!r.ok) {
        Object.assign(state, before2);
        render();
        showError("like");
        health.count("stream.like-failed");
        return;
      }
      if (Number.isFinite(r.reactions)) state.count = Math.max(0, r.reactions);
      if (r.viewerReaction !== void 0) state.liked = isReacted(r.viewerReaction);
      render();
      health.count("stream.like");
    }
    function onViewAll() {
      cancelPreview?.();
      if (state.loading) {
        state.expandOnLoad = true;
        return;
      }
      if (state.loaded && !state.expanded) {
        state.expanded = true;
        render();
        if (!state.hasMore || state.comments.length >= totalComments()) return;
      }
      loadComments(false);
    }
    async function loadComments(preview) {
      cancelPreview = null;
      if (state.loading || state.loaded && !state.hasMore) return;
      if (typeof ctx.actions?.comments !== "function") {
        if (!preview) showError("comments");
        return;
      }
      state.loading = true;
      renderViewAll();
      const r = await attempt(() => ctx.actions.comments(story, state.cursor ?? void 0));
      state.loading = false;
      if (!r.ok) {
        renderViewAll();
        if (!preview || state.expandOnLoad) showError("comments");
        health.count("stream.comments-failed");
        return;
      }
      state.comments = mergeComments(state.comments, Array.isArray(r.comments) ? r.comments : []);
      state.cursor = r.cursor ?? null;
      state.hasMore = Boolean(r.hasMore && r.cursor);
      state.loaded = true;
      if (!preview || state.expandOnLoad) state.expanded = true;
      clearError();
      render();
      health.count(preview ? "stream.comments-preview" : "stream.comments-load");
    }
    function buildAddComment() {
      const input = h("textarea.mfga-ufi-input", {
        rows: 1,
        placeholder: t("ufi.write"),
        "aria-label": t("ufi.write"),
        onkeydown: guard(onKey),
        oninput: guard(autosize),
        onfocus: guard(() => item.classList.add("mfga-ufi-add-active")),
        onblur: guard(() => {
          if (input.value.trim()) return;
          item.classList.remove("mfga-ufi-add-active");
          input.style.height = "";
        })
      });
      const me2 = ctx.me || {};
      const submit = h("button.mfga-btn.mfga-btn-confirm.mfga-ufi-submit", { type: "button", onclick: guard(postComment) }, t("ufi.submit"));
      const item = h(
        "div.mfga-ufi-item.mfga-ufi-add",
        avatar(me2.url, me2.avatar, "mfga-ufi-pic mfga-ufi-me"),
        h("div.mfga-ufi-add-body", input, h("div.mfga-ufi-add-actions", submit))
      );
      return { item, input };
    }
    function onKey(ev) {
      if (ev.key !== "Enter" || ev.shiftKey || ev.isComposing) return;
      ev.preventDefault();
      postComment();
    }
    function autosize() {
      const input = add.input;
      input.style.height = "";
      input.style.height = `${Math.min(input.scrollHeight + 2, 200)}px`;
    }
    function openComposer() {
      state.composing = true;
      render();
      add.input.focus();
    }
    function postedComment(echo, text2) {
      const me2 = ctx.me || {};
      const mine = { id: `local:${uuid()}`, author: { name: me2.name || "", url: me2.url || null, avatar: me2.avatar || null }, text: text2, ranges: [], time: Math.floor(nowMs(ctx) / 1e3), reactions: 0, replies: 0 };
      if (!echo || typeof echo !== "object") return mine;
      const known = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v != null && v !== ""));
      return { ...mine, ...known(echo), author: { ...mine.author, ...known(echo.author) } };
    }
    async function postComment() {
      const text2 = add.input.value.trim();
      if (!text2 || state.posting) return;
      if (typeof ctx.actions?.comment !== "function") return showError("comment");
      state.posting = true;
      add.input.readOnly = true;
      add.item.classList.add("mfga-busy");
      clearError();
      const r = await attempt(() => ctx.actions.comment(story, text2));
      state.posting = false;
      add.input.readOnly = false;
      add.item.classList.remove("mfga-busy");
      if (!r.ok) {
        showError("comment");
        health.count("stream.comment-failed");
        return;
      }
      state.comments = mergeComments(state.comments, [postedComment(r.comment, text2)]);
      state.total += 1;
      state.posted += 1;
      add.input.value = "";
      autosize();
      render();
      add.input.focus();
      health.count("stream.comment");
    }
  }

  // src/ui/stream/story.js
  function actorNodes(actors) {
    const named = (actors || []).filter((a) => a && a.name);
    const nodes = named.map((a) => link(a.url, { class: "mfga-story-actor" }, a.name));
    if (nodes.length < 2) return nodes;
    const last = nodes.pop();
    return [joinNodes(nodes, () => ", "), t("story.and"), last];
  }
  function targetNodes(target) {
    if (!target?.name) return null;
    return [" ", h("i.mfga-story-arrow", { role: "img", "aria-label": t("story.to") }), " ", link(target.url, { class: "mfga-story-actor mfga-story-target" }, target.name)];
  }
  function messageText(story) {
    const segments = textSegments(story.text, story.ranges);
    if (!segments.length) return null;
    const { visible, truncated } = truncateSegments(segments);
    const el = h("span.mfga-story-text", segmentNodes(visible));
    if (truncated) {
      const expand = linkButton(t("story.seeMore"), () => replaceChildren(el, segmentNodes(segments)), "mfga-story-seemore");
      el.append(h("span.mfga-story-more", "... ", expand));
    }
    return el;
  }
  function passiveText(story, tail) {
    if (tail != null) return tail;
    const passive = passiveHeadline(story);
    return passive && ` ${passive}`;
  }
  function headline(story) {
    const tail = titleTail(story);
    const actors = tail == null ? story.actors : story.actors.slice(0, 1);
    const passive = passiveText(story, tail);
    const text2 = messageText(story);
    const head = h("div.mfga-story-msg", actorNodes(actors), targetNodes(story.target), passive ? h("span.mfga-story-passive", passive) : null, !story.title && text2 ? [" ", text2] : null);
    if (!story.title) return head;
    return [head, tail == null ? h("div.mfga-story-title", story.title) : null, text2 ? h("div.mfga-story-msg", text2) : null];
  }
  function timeLink(story, ctx) {
    const time = timeNode(story.time, nowMs(ctx));
    if (!time) return null;
    return story.url ? link(story.url, { class: "mfga-story-time" }, time) : h("span.mfga-story-time", time);
  }
  function shareLink(story, ctx) {
    const shareable = story.shared || (story.attachments || []).some((a) => a && a.kind !== "unavailable");
    if (!shareable || !story.url || typeof ctx.open !== "function") return null;
    return linkButton(t("story.share"), () => ctx.open(story.url, { newTab: false }), "mfga-story-share");
  }
  function sharedStory(shared, ctx) {
    if (!shared) return null;
    return h(
      "div.mfga-story-shared",
      { "data-key": shared.key || null },
      headline(shared),
      renderAttachments(shared),
      h("div.mfga-story-meta", timeLink(shared, ctx))
    );
  }
  function renderStory(story, ctx) {
    const fb = createFeedback(story, ctx);
    const meta = joinNodes(
      [timeLink(story, ctx), story.ai ? h("span.mfga-story-ai", t("story.ai")) : null, fb.commentLink, fb.likeLink, shareLink(story, ctx)],
      sep
    );
    const actor = (story.actors || [])[0];
    const el = h(
      "div.mfga-story",
      { "data-key": story.key || story.postId || story.nodeId || null },
      avatar(actor?.url, story.avatar, "mfga-story-pic"),
      h(
        "div.mfga-story-body",
        headline(story),
        renderAttachments(story),
        sharedStory(story.shared, ctx),
        h("div.mfga-story-meta", meta),
        fb.ufi
      )
    );
    routeClicks(el, ctx);
    return el;
  }

  // src/ui/stream/welcome.js
  var PROJECT_URL = "https://github.com/pawel-mazurkiewicz/mfga#readme";
  var block2 = (cls) => h("i", { class: `mfga-welcome-block ${cls}` });
  var marker = (n, cls) => h("b", { class: `mfga-welcome-marker ${cls}` }, String(n));
  function miniature() {
    const stories = [0, 1, 2, 3].map(() => h("i.mfga-welcome-mini-story", block2("mfga-welcome-pic"), block2("mfga-welcome-lines")));
    return h(
      "div.mfga-welcome-mini",
      { "aria-hidden": "true" },
      h("i.mfga-welcome-mini-bar", h("i.mfga-welcome-mini-logo"), h("i.mfga-welcome-mini-search")),
      h("i.mfga-welcome-mini-left", block2("mfga-welcome-pic"), [0, 1, 2, 3, 4].map(() => block2("mfga-welcome-nav"))),
      h("i.mfga-welcome-mini-center", block2("mfga-welcome-mhead"), block2("mfga-welcome-composer"), stories),
      h("i.mfga-welcome-mini-right", [0, 1, 2].map(() => block2("mfga-welcome-box"))),
      marker(1, "mfga-welcome-m1"),
      marker(2, "mfga-welcome-m2"),
      marker(3, "mfga-welcome-m3")
    );
  }
  function renderWelcome({ onClose, open }) {
    const steps = [1, 2, 3].map((n) => h("li.mfga-welcome-step", h("b.mfga-welcome-num", String(n)), h("span", t(`feed.welcome.step${n}`))));
    const box2 = h(
      "div.mfga-welcome",
      h("div.mfga-welcome-head", h("h2.mfga-welcome-title", t("feed.welcome.title")), linkButton(t("feed.welcome.close"), close, "mfga-welcome-close")),
      h("div.mfga-welcome-main", miniature(), h("ol.mfga-welcome-steps", steps)),
      h(
        "a.mfga-welcome-learn",
        {
          href: PROJECT_URL,
          target: "_blank",
          rel: "noopener noreferrer",
          onclick: guard((ev) => {
            if (typeof open !== "function" || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
            ev.preventDefault();
            open(PROJECT_URL, { newTab: true });
          })
        },
        t("feed.welcome.learn"),
        h("i.mfga-welcome-arrow", { "aria-hidden": "true" })
      )
    );
    function close() {
      box2.remove();
      onClose?.();
    }
    return box2;
  }

  // src/ui/stream/feed-view.js
  var MODES = ["top", "recent"];
  var TIME_REFRESH_MS = 6e4;
  var AUTOLOAD_PX = 600;
  var renderOne = safe("stream.story", renderStory, { disableOnError: false });
  function createFeedView(ctx) {
    const feedSettings = () => ({ ...DEFAULTS.feed, ...settingsOf(ctx).feed });
    const view = {
      mode: MODES.includes(ctx.mode) ? ctx.mode : feedSettings().mode,
      feed: null,
      gen: 0,
      loading: false,
      error: null,
      keys: /* @__PURE__ */ new Set(),
      stories: []
    };
    const modes = h("div.mfga-feed-modes");
    const header = h("div.mfga-feed-header", icon("nav_news_feed", { className: "mfga-feed-ico" }), h("h2.mfga-feed-title", t("feed.title")), modes);
    const composer = h(
      "div.mfga-feed-composer",
      {
        role: "button",
        tabindex: "0",
        onclick: guard(() => ctx.openComposer?.()),
        onkeydown: guard((ev) => {
          if (ev.key !== "Enter" && ev.key !== " ") return;
          ev.preventDefault();
          ctx.openComposer?.();
        })
      },
      t("feed.composer")
    );
    const list = h("div.mfga-feed-stories");
    const footer = h("div.mfga-feed-footer");
    const status = h("div.mfga-feed-status", { hidden: true });
    const el = h("div#mfga-stream.mfga-ui.mfga-stream", welcomeBox(), header, composer, list, footer, status);
    routeClicks(el, ctx);
    const timer = setInterval(guard(() => refreshTimes(el, nowMs(ctx))), TIME_REFRESH_MS);
    const sentinel = feedSettings().autoLoad && typeof IntersectionObserver === "function" ? new IntersectionObserver(onSentinel, { rootMargin: `0px 0px ${AUTOLOAD_PX}px 0px` }) : null;
    sentinel?.observe(footer);
    renderModes();
    guard(reload)();
    return { el, reload, destroy };
    function welcomeBox() {
      const s = settingsOf(ctx);
      if (s.look?.welcome === false || s.state?.welcomeDismissed) return null;
      return renderWelcome({ onClose: () => ctx.onDismissWelcome?.(), open: ctx.open });
    }
    function renderModes() {
      const parts = MODES.map((mode) => {
        const label = t(mode === "top" ? "feed.top" : "feed.recent");
        return mode === view.mode ? h("strong.mfga-feed-mode.mfga-feed-mode-on", label) : linkButton(label, () => switchMode(mode), "mfga-feed-mode");
      });
      const fresh = view.mode === "recent" ? countNewer(view.stories, ctx.lastSeen) : 0;
      replaceChildren(
        modes,
        parts[0],
        h("span.mfga-feed-dot", " · "),
        parts[1],
        fresh ? h("span.mfga-pill.mfga-feed-pill", { title: t("feed.newPosts", { n: fresh }) }, formatCount(fresh)) : null
      );
    }
    function switchMode(mode) {
      if (mode === view.mode) return;
      view.mode = mode;
      renderModes();
      guard(() => ctx.onModeChange?.(mode))();
      return reload();
    }
    async function reload() {
      view.gen++;
      Object.assign(view, { feed: null, loading: false, error: null, stories: [] });
      view.keys.clear();
      unwatchWithin(list);
      clear(list);
      try {
        const feed = ctx.getFeed(view.mode, enabledSources(feedSettings()));
        if (typeof feed?.more !== "function") throw new Error("getFeed() returned no feed");
        view.feed = feed;
      } catch (err) {
        view.error = err;
        renderFooter2();
        return;
      }
      await loadMore();
    }
    async function loadMore({ auto = false } = {}) {
      const { feed, gen } = view;
      if (!feed || view.loading || feed.exhausted || auto && view.error) return;
      view.loading = true;
      view.error = null;
      renderFooter2();
      let stories;
      try {
        stories = await feed.more();
      } catch (err) {
        if (gen !== view.gen) return;
        view.loading = false;
        view.error = err;
        health.count("stream.page-failed");
        renderFooter2();
        return;
      }
      if (gen !== view.gen) return;
      view.loading = false;
      const first = !view.stories.length;
      appendStories(Array.isArray(stories) ? stories : []);
      renderFooter2();
      if (first) guard(reportSeen)();
      renderModes();
      guard(renderStatus)();
      health.count("stream.page");
      if (sentinel && !feed.exhausted) requestAnimationFrame(guard(() => nearEnd() && loadMore({ auto: true })));
    }
    function appendStories(stories) {
      for (const story of stories) {
        const key = story?.key || story?.postId || story?.nodeId;
        if (!key || view.keys.has(key)) continue;
        const node = renderOne(story, ctx);
        if (!node) continue;
        view.keys.add(key);
        view.stories.push(story);
        list.append(node);
      }
    }
    function reportSeen() {
      const newest = Math.max(0, ...view.stories.map((s) => Number.isFinite(s.time) ? s.time : 0));
      if (newest) ctx.onSeen?.(newest);
    }
    function renderFooter2() {
      const feed = view.feed;
      if (view.loading) {
        return replaceChildren(footer, h("div.mfga-feed-more.mfga-loading", { role: "progressbar", "aria-label": t("feed.loading") }, h("span.mfga-spinner")));
      }
      if (view.error) {
        return replaceChildren(
          footer,
          h(
            "div.mfga-error.mfga-feed-error",
            { role: "alert" },
            h("span", t("feed.error")),
            " ",
            h("button.mfga-btn.mfga-feed-retry", { type: "button", onclick: guard(() => view.feed ? loadMore() : reload()) }, t("feed.retry"))
          )
        );
      }
      if (!feed || !feed.exhausted) {
        return replaceChildren(footer, h("button.mfga-feed-more", { type: "button", onclick: guard(() => loadMore()) }, h("i.mfga-feed-more-arrow", { "aria-hidden": "true" }), t("feed.older")));
      }
      if (!view.stories.length) {
        return replaceChildren(footer, h("div.mfga-feed-empty", h("div.mfga-feed-empty-title", t("feed.empty")), h("div", t("feed.emptyHint"))));
      }
      replaceChildren(footer, h("div.mfga-feed-end", t("feed.end")));
    }
    function renderStatus() {
      const sentence = hiddenSentence(ctx.hiddenStats?.());
      status.hidden = !sentence;
      status.textContent = sentence;
    }
    function nearEnd() {
      return footer.getClientRects().length > 0 && footer.getBoundingClientRect().top < innerHeight + AUTOLOAD_PX;
    }
    function onSentinel(entries) {
      if (entries.some((e) => e.isIntersecting)) guard(loadMore)({ auto: true });
    }
    function destroy() {
      view.gen++;
      clearInterval(timer);
      sentinel?.disconnect();
      unwatchWithin(el);
      el.remove();
    }
  }

  // src/ui/dialog/settings-model.js
  var FEED_SOURCES = ["friends", "groups", "pages", "favorites"];
  var PAGE_SIZES = [5, 10, 15, 20, 25, 30];
  var MAX_KEYWORDS = 200;
  function patchFor(path, value) {
    return path.split(".").reduceRight((inner, key) => ({ [key]: inner }), value);
  }
  function sourcesPatch(sources, name, checked) {
    if (!checked && !FEED_SOURCES.some((s) => s !== name && sources?.[s])) return null;
    return patchFor(`feed.sources.${name}`, checked);
  }
  function welcomePatch(checked) {
    return checked ? { look: { welcome: true }, state: { welcomeDismissed: false } } : { look: { welcome: false } };
  }
  function parseKeywords(text2) {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const line of String(text2 ?? "").split(/\r?\n/)) {
      const phrase = line.trim().replace(/\s+/g, " ");
      const key = phrase.normalize("NFKC").toLowerCase();
      if (!phrase || seen.has(key)) continue;
      seen.add(key);
      out.push(phrase);
      if (out.length >= MAX_KEYWORDS) break;
    }
    return out;
  }
  function formatKeywords(keywords) {
    return (Array.isArray(keywords) ? keywords : []).join("\n");
  }
  function sameList(a, b) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  function pageSizeOptions(current) {
    const n = Number(current);
    const all = Number.isFinite(n) && !PAGE_SIZES.includes(n) ? [...PAGE_SIZES, n] : PAGE_SIZES;
    return [...all].sort((x, y) => x - y);
  }

  // src/ui/dialog/controls.js
  var KEYWORDS_DELAY_MS = 600;
  var seq2 = 0;
  var uid = (prefix) => `mfga-settings-${prefix}-${++seq2}`;
  var read = (s, path) => get(s, ...path.split("."));
  function row(label, build, { role = null } = {}) {
    const labelId = uid("label");
    return h(
      "div.mfga-settings-row",
      h("div.mfga-settings-label", { id: labelId }, label),
      h("div.mfga-settings-field", { role, "aria-labelledby": role ? labelId : null }, build(labelId))
    );
  }
  function createBinder(settings) {
    const syncs = [];
    const flushers = [];
    const apply = safe("settings-dialog", (patch2) => settings.update(patch2), { disableOnError: false });
    const onSync = (fn) => syncs.push(fn);
    function hinted(control, hint) {
      if (!hint) return control;
      const id = uid("hint");
      control.querySelector("input").setAttribute("aria-describedby", id);
      return [control, h("div.mfga-settings-hint", { id }, hint)];
    }
    return {
      onSync,
      sync(s = settings.get()) {
        for (const fn of syncs) fn(s);
      },
      /** Commits pending typing (the keyword list waits for a pause); called when the dialog closes. */
      flush() {
        for (const fn of flushers) fn();
      },
      /**
       * Checkbox for a boolean path. `patch(checked, settings)` may return null to refuse the change: the box
       * flips back and `onRefuse()` runs.
       */
      checkbox(path, label, { hint = null, inline = false, patch: patch2 = (checked) => patchFor(path, checked), onRefuse = null } = {}) {
        const input = h("input", { type: "checkbox", dataset: { mfgaSetting: path } });
        input.addEventListener("change", () => {
          const p = patch2(input.checked, settings.get());
          if (p) {
            apply(p);
          } else {
            input.checked = !input.checked;
            onRefuse?.();
          }
        });
        onSync((s) => {
          input.checked = !!read(s, path);
        });
        const control = h("label.mfga-settings-check", { class: inline ? "mfga-settings-check-inline" : null }, input, h("span", label));
        return hinted(control, hint);
      },
      /** Radio buttons; option values keep their type (booleans stay booleans in the patch). */
      radios(path, options, { inline = false } = {}) {
        const name = uid("radio");
        const inputs = options.map((o) => {
          const input = h("input", { type: "radio", name, value: String(o.value), dataset: { mfgaSetting: path } });
          input.addEventListener("change", () => input.checked && apply(patchFor(path, o.value)));
          return input;
        });
        onSync((s) => {
          const v = String(read(s, path));
          for (const input of inputs) input.checked = input.value === v;
        });
        return options.map(
          (o, i) => hinted(
            h(
              "label.mfga-settings-check",
              { class: inline ? "mfga-settings-check-inline" : null },
              inputs[i],
              h("span", { class: o.className }, o.label)
            ),
            o.hint
          )
        );
      },
      /** <select>; `parse` turns the option string back into the setting's type. */
      select(path, options, { labelledBy, parse = (v) => v } = {}) {
        const select = h(
          "select.mfga-input",
          { dataset: { mfgaSetting: path }, "aria-labelledby": labelledBy },
          options.map((o) => h("option", { value: String(o.value) }, o.label))
        );
        select.addEventListener("change", () => apply(patchFor(path, parse(select.value))));
        onSync((s) => {
          const v = String(read(s, path));
          if (![...select.options].some((o) => o.value === v)) select.append(h("option", { value: v }, v));
          select.value = v;
        });
        return select;
      },
      /**
       * Textarea for a keyword list, one phrase per line: saved after a pause in typing and on blur, when the
       * text is also tidied to what was saved.
       */
      keywordList(path, attrs = {}) {
        const textarea = h("textarea.mfga-textarea", { rows: 4, spellcheck: "false", dataset: { mfgaSetting: path }, ...attrs });
        let timer = 0;
        const commit = () => {
          clearTimeout(timer);
          const next = parseKeywords(textarea.value);
          if (!sameList(next, read(settings.get(), path) || [])) apply(patchFor(path, next));
          return next;
        };
        textarea.addEventListener("input", () => {
          clearTimeout(timer);
          timer = setTimeout(commit, KEYWORDS_DELAY_MS);
        });
        textarea.addEventListener("blur", () => {
          textarea.value = formatKeywords(commit());
        });
        flushers.push(commit);
        onSync((s) => {
          if (document.activeElement !== textarea) textarea.value = formatKeywords(read(s, path));
        });
        return textarea;
      },
      /** Greys out and disables every control inside `el` while `predicate(settings)` is false. */
      enableWhen(el, predicate) {
        onSync((s) => {
          const on = !!predicate(s);
          el.classList.toggle("mfga-settings-off", !on);
          for (const input of el.querySelectorAll("input, select, textarea")) input.disabled = !on;
        });
        return el;
      }
    };
  }

  // src/ui/dialog/about.js
  var REPO_URL = "https://github.com/pawel-mazurkiewicz/mfga";
  var ISSUES_URL = `${REPO_URL}/issues`;
  function externalLink(href, label) {
    return h("a", { href, target: "_blank", rel: "noopener noreferrer" }, label);
  }
  function section2(title, ...content) {
    return h("div.mfga-about-section", h("h3.mfga-box-title", title), content);
  }
  var bullets = (items) => h("ul.mfga-about-list", items.map((item) => h("li", item)));
  function aboutPanel({ version }) {
    const el = h(
      "div",
      h(
        "div.mfga-about-head",
        h("span.mfga-about-name", "MFGA"),
        h("span", t("settings.about.tagline")),
        version ? h("span.mfga-muted", t("settings.about.version", { version })) : null
      ),
      section2(t("settings.about.what"), h("p", t("settings.about.p1")), h("p", t("settings.about.p2")), h("p", t("settings.about.p3"))),
      section2(
        t("settings.about.links"),
        bullets([externalLink(REPO_URL, t("settings.about.repo")), externalLink(ISSUES_URL, t("settings.about.issues"))])
      ),
      section2(
        t("settings.about.credits"),
        bullets([t("settings.about.creditSprites"), t("settings.about.creditClean"), t("settings.about.creditResearch")])
      ),
      h("p.mfga-about-legal", t("settings.about.legal"))
    );
    return { el };
  }

  // src/ui/dialog/report.js
  var MAX_DEPTH2 = 12;
  var MAX_ITEMS = 100;
  var MAX_KEYS = 500;
  var MAX_TOKEN = 120;
  var FORBIDDEN_KEYS = /* @__PURE__ */ new Set([
    "id",
    "ids",
    "name",
    "names",
    "firstname",
    "lastname",
    "fullname",
    "shortname",
    "username",
    "displayname",
    "text",
    "message",
    "body",
    "title",
    "description",
    "caption",
    "snippet",
    "query",
    "keywords",
    "link",
    "links",
    "permalink",
    "email",
    "phone",
    "address",
    "location",
    "birthday",
    "birthdays",
    "actor",
    "actors",
    "author",
    "owner",
    "user",
    "viewer",
    "me",
    "profile",
    "identity",
    "contacts",
    "shortcuts",
    "avatar",
    "picture",
    "photo",
    "image",
    "variables",
    "tracking",
    "encryptedtracking",
    "cft",
    "tn",
    "dtsg",
    "fbdtsg",
    "lsd",
    "jazoest",
    "cookie",
    "cookies",
    "cuser",
    "xs",
    "datr",
    "secret",
    "password",
    "session"
  ]);
  var IDENTITY_KEYS = /* @__PURE__ */ new Set(["id", "ids", "actor", "actors", "author", "owner", "user", "viewer", "me", "profile", "identity", "cuser"]);
  var DATA_SUFFIX = /(?:url|uri|href|src|cursor|token)s?$/i;
  var ID_SUFFIX = /(?:^|[_\s-])(?:ids?|IDs?)$|[a-z0-9](?:Id|ID)s?$/;
  var JOINED_ID = /(?:^u|fb|^(?:user|actor|owner|author|viewer|profile|page|group|post|story|target|node|feedback|photo|video|comment|thread|doc))ids?$/;
  var PERSONAL_WORDS = /* @__PURE__ */ new Set([
    "name",
    "names",
    "text",
    "title",
    "message",
    "body",
    "description",
    "caption",
    "snippet",
    "email",
    "phone",
    "address",
    "birthday",
    "avatar",
    "picture",
    "photo",
    "image",
    "link",
    "permalink",
    "keywords"
  ]);
  var TECHNICAL_NAMES = /* @__PURE__ */ new Set(["typename", "friendlyname", "queryname", "operationname", "opname", "modulename"]);
  var MESSAGE_KEYS = /* @__PURE__ */ new Set(["first", "error", "err", "reason", "warning", "detail", "last"]);
  var normKey = (key) => String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
  var lastSegment = (key) => String(key).split(".").pop();
  var isCount = (v) => typeof v === "boolean" || typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e13;
  function lastWord(key) {
    const chunk = key.split(/[^A-Za-z0-9]+/).filter(Boolean).pop() || "";
    const word = chunk === chunk.toUpperCase() ? chunk : /[A-Z]?[a-z0-9]+$/.exec(chunk)?.[0] || chunk;
    return word.toLowerCase();
  }
  function isForbiddenKey(key) {
    const k = lastSegment(key);
    const n = normKey(k);
    const personal = PERSONAL_WORDS.has(lastWord(k)) && !TECHNICAL_NAMES.has(n);
    return FORBIDDEN_KEYS.has(n) || DATA_SUFFIX.test(k) || personal || isIdentityKey(k);
  }
  function isIdentityKey(key) {
    const k = lastSegment(key);
    const n = normKey(k);
    return IDENTITY_KEYS.has(n) || ID_SUFFIX.test(k) || JOINED_ID.test(n);
  }
  function mayExport(key, value) {
    return !isForbiddenKey(key) || !isIdentityKey(key) && isCount(value);
  }
  function isSafeToken(s) {
    return typeof s === "string" && s.length <= MAX_TOKEN && /^\w[\w.:$-]*$/.test(s) && !/\d{5,}/.test(s) && !looksRandom(s);
  }
  function looksRandom(s) {
    return s.length >= 8 && /\d/.test(s) && /[a-z]/.test(s) && /[A-Z]/.test(s) && !/[._:$-]/.test(s);
  }
  function scrubText(s) {
    return String(s).replace(/\b(?:https?|blob|data|file):\S+|\bwww\.\S+/gi, "<url>").replace(/\S+@\S+\.\w+/g, "<email>").replace(/(["'`])([^"'`]{0,300})\1/g, (m, q, inner) => isSafeToken(inner) ? m : `${q}<text>${q}`).replace(/\d{3,}/g, "<n>").replace(/\s+/g, " ").trim().slice(0, 200);
  }
  function sanitizeReport(value) {
    const out = clean(value, "", 0, /* @__PURE__ */ new WeakSet());
    return out === void 0 ? null : out;
  }
  function clean(v, key, depth, seen) {
    if (v === null) return null;
    switch (typeof v) {
      case "number":
        if (!Number.isFinite(v)) return null;
        return Math.abs(v) >= 1e13 ? "<number>" : v;
      // 1e13+ is an id, not a count or a timestamp
      case "boolean":
        return v;
      case "bigint":
        return "<number>";
      case "string":
        if (isSafeToken(v)) return v;
        return MESSAGE_KEYS.has(normKey(key)) ? scrubText(v) : "<text>";
      case "object":
        break;
      default:
        return void 0;
    }
    if (seen.has(v)) return "<circular>";
    if (depth >= MAX_DEPTH2) return "<deep>";
    seen.add(v);
    if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : null;
    if (Array.isArray(v) || v instanceof Set) return cleanArray([...v], key, depth, seen);
    const entries = v instanceof Map ? [...v].map(([k, x]) => [String(k), x]) : Object.entries(v);
    return cleanObject(entries, depth, seen);
  }
  function cleanArray(items, key, depth, seen) {
    const out = [];
    for (const item of items.slice(0, MAX_ITEMS)) {
      const c = clean(item, key, depth + 1, seen);
      if (c !== void 0) out.push(c);
    }
    if (items.length > MAX_ITEMS) out.push(`<+${items.length - MAX_ITEMS} more>`);
    return out;
  }
  function cleanObject(entries, depth, seen) {
    const out = {};
    let removed = 0;
    let kept = 0;
    for (const [k, x] of entries) {
      if (!mayExport(k, x) || !isSafeKey(k) || kept >= MAX_KEYS) {
        removed++;
        continue;
      }
      const c = clean(x, k, depth + 1, seen);
      if (c === void 0) continue;
      out[k] = c;
      kept++;
    }
    if (removed) out._removedKeys = removed;
    return out;
  }
  function isSafeKey(k) {
    return k.length <= MAX_TOKEN && !/\s|\/|@/.test(k) && !/\d{5,}/.test(k) && !looksRandom(k);
  }
  function reportFileName(date = /* @__PURE__ */ new Date()) {
    return `mfga-report-${date.toISOString().slice(0, 10)}.json`;
  }
  function groupCounters(counters) {
    const areas = /* @__PURE__ */ new Map();
    for (const [key, n] of Object.entries(counters || {})) {
      if (typeof n !== "number") continue;
      const dot = key.indexOf(".");
      const area = dot > 0 ? key.slice(0, dot) : "general";
      const name = dot > 0 ? key.slice(dot + 1) : key;
      if (!areas.has(area)) areas.set(area, []);
      areas.get(area).push([name, n]);
    }
    return [...areas].sort(([a], [b]) => a.localeCompare(b)).map(([area, rows]) => ({
      area,
      rows: rows.sort(([a], [b]) => a.localeCompare(b)),
      total: rows.reduce((sum, [, n]) => sum + n, 0)
    }));
  }
  function errorRows(errors) {
    return Object.entries(errors || {}).map(([module, e]) => [module, Number(e?.n) || 0, e?.first == null ? "" : String(e.first)]).sort(([a], [b]) => a.localeCompare(b));
  }
  function formatValue(v, max = 300) {
    let s;
    if (v == null) s = "—";
    else if (typeof v === "string") s = v;
    else if (typeof v !== "object") s = String(v);
    else if (Array.isArray(v) && v.every((x) => x == null || typeof x !== "object")) s = v.join(", ");
    else s = safeJson(v);
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  }
  function safeJson(v) {
    try {
      return JSON.stringify(v) ?? String(v);
    } catch {
      return String(v);
    }
  }
  var SNAPSHOT_KEYS = /* @__PURE__ */ new Set(["counters", "errors", "facts", "disabled"]);
  function otherEntries(snapshot) {
    const out = [];
    for (const [key, v] of Object.entries(snapshot || {})) {
      if (SNAPSHOT_KEYS.has(key)) continue;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const [sub, x] of Object.entries(v)) out.push([`${key}.${sub}`, formatValue(x)]);
      } else {
        out.push([key, formatValue(v)]);
      }
    }
    return out;
  }

  // src/ui/dialog/health.js
  var formatCount2 = (n) => n.toLocaleString(getLocale() === "pl" ? "pl-PL" : "en-US");
  function tNodes(key, nodes) {
    return t(key).split(/(\{\w+\})/).filter(Boolean).map((part) => nodes[part.slice(1, -1)] ?? text(part));
  }
  function healthPanel({ binder, settings, healthSnapshot, exportReport }) {
    const status = h("div.mfga-health-status", { role: "status" });
    const exported = h("div.mfga-health-exported", { role: "status" });
    const details = h("div.mfga-health-details");
    const refresh = safe(
      "settings-dialog",
      async () => {
        const snap = await healthSnapshot?.() || {};
        replaceChildren(status, statusBox(snap));
        replaceChildren(details, snapshotSections(snap));
      },
      { disableOnError: false }
    );
    async function exportNow() {
      try {
        const json = `${JSON.stringify(sanitizeReport(await exportReport()), null, 2)}
`;
        const file = reportFileName();
        const link2 = h("a.mfga-health-file", { download: file }, file);
        link2.href = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
        replaceChildren(exported, tNodes("settings.health.exported", { file: link2 }), " ", externalLink(ISSUES_URL, t("settings.health.attach")), ".");
        link2.click();
      } catch (err) {
        health.error("settings-dialog", err);
        replaceChildren(exported, h("div.mfga-error", t("settings.health.exportFailed")));
      }
    }
    const resetNow = safe("settings-dialog", () => settings.reset(), { disableOnError: false });
    const confirmReset = () => openDialog({
      title: t("settings.reset.title"),
      body: h("p", t("settings.reset.body")),
      buttons: [
        { label: t("settings.reset.confirm"), primary: true, onClick: () => void resetNow() },
        { label: t("dialog.cancel") }
      ]
    });
    const actions = h(
      "div.mfga-health-actions",
      h("button.mfga-btn.mfga-btn-confirm", { type: "button", onclick: exportNow }, t("settings.health.export")),
      h("button.mfga-btn", { type: "button", onclick: refresh }, t("settings.health.refresh")),
      h("button.mfga-btn.mfga-health-reset", { type: "button", onclick: confirmReset }, t("settings.health.reset"))
    );
    const advanced = section3(t("settings.health.advanced"), [
      binder.checkbox("advanced.debug", t("settings.health.debug")),
      binder.checkbox("advanced.mainWorldHelper", t("settings.health.mainWorldHelper")),
      binder.checkbox("advanced.stopOnCheckpoint", t("settings.health.stopOnCheckpoint"))
    ]);
    return { el: h("div", status, actions, exported, details, advanced), onShow: refresh };
  }
  function statusBox(snap) {
    const stopped = Array.isArray(snap.disabled) ? snap.disabled : [];
    return stopped.length ? h("div.mfga-error", t("settings.health.stopped", { list: stopped.join(", ") })) : h("div.mfga-notice", t("settings.health.ok"));
  }
  function snapshotSections(snap) {
    const out = [];
    const errors = errorRows(snap.errors);
    if (errors.length) {
      out.push(
        section3(
          t("settings.health.errors"),
          table(
            [t("settings.health.module"), t("settings.health.count"), t("settings.health.first")],
            errors.map(([module, n, first]) => [module, formatCount2(n), first]),
            [1],
            "mfga-health-errors"
          )
        )
      );
    }
    const areas = groupCounters(snap.counters);
    if (areas.length) out.push(section3(t("settings.health.counters"), h("div.mfga-health-areas", areas.map(areaBox))));
    const facts = Object.entries(snap.facts || {}).map(([k, v]) => [k, formatValue(v)]);
    if (facts.length) out.push(section3(t("settings.health.facts"), table(null, facts)));
    const other = otherEntries(snap);
    if (other.length) out.push(section3(t("settings.health.other"), table(null, other)));
    return out.length ? out : h("p.mfga-muted.mfga-health-section", t("settings.health.empty"));
  }
  function areaBox({ area, rows, total }) {
    return h(
      "div.mfga-box",
      h("h4.mfga-box-title", area, h("span.mfga-health-total", formatCount2(total))),
      table(null, rows.map(([name, n]) => [name, formatCount2(n)]), [1])
    );
  }
  function section3(title, content) {
    return h("div.mfga-health-section", h("h3.mfga-box-title", title), content);
  }
  function table(head, rows, numeric = [], className = null) {
    const cell = (tag, value, i) => h(tag, { class: numeric.includes(i) ? "mfga-health-num" : null }, value);
    return h(
      "table.mfga-health-table",
      { class: className },
      head ? h("thead", h("tr", head.map((v, i) => cell("th", v, i)))) : null,
      h("tbody", rows.map((r) => h("tr", r.map((v, i) => cell("td", v, i)))))
    );
  }

  // src/ui/dialog/strings.js
  var STRINGS = {
    en: {
      "settings.title": "MFGA Settings",
      "settings.saved": "Changes are saved automatically.",
      "settings.tab.feed": "News Feed",
      "settings.tab.clean": "Clean-up",
      "settings.tab.look": "Look",
      "settings.tab.health": "Health",
      "settings.tab.about": "About",
      "settings.feed.show": "Show:",
      "settings.feed.recent": "Most Recent",
      "settings.feed.recentHint": "Posts from your friends, groups and pages, newest first.",
      "settings.feed.top": "Top News",
      "settings.feed.topHint": "Facebook's own order, still without ads and suggestions.",
      "settings.feed.sources": "Include:",
      "settings.feed.friends": "Friends",
      "settings.feed.groups": "Groups",
      "settings.feed.pages": "Pages",
      "settings.feed.favorites": "Favorites",
      "settings.feed.sourcesHint": "Top News always includes all of them.",
      "settings.feed.oneSource": "Keep at least one of them.",
      "settings.feed.more": "More stories:",
      "settings.feed.olderButton": "An “Older Posts” button at the bottom",
      "settings.feed.autoLoad": "Load them automatically as I scroll",
      "settings.feed.pageSize": "Stories at a time:",
      "settings.feed.comments": "Comments:",
      "settings.feed.previewComments": "Show the latest comments under each story",
      "settings.feed.ai": "AI posts:",
      "settings.feed.hideAI": "Hide posts labelled as made with AI",
      "settings.feed.keywords": "Hidden words:",
      "settings.feed.keywordsHint": "One word or phrase per line. Stories that contain any of them are hidden.",
      "settings.clean.intro": "These apply wherever Facebook draws the feed itself: the groups feed, groups, search, and the home page when MFGA cannot build its own News Feed.",
      "settings.clean.hide": "Hide:",
      "settings.clean.sponsored": "Sponsored posts (ads)",
      "settings.clean.suggested": "Suggested posts and “Follow” or “Join” suggestions",
      "settings.clean.peopleYouMayKnow": "People You May Know",
      "settings.clean.reels": "Reels",
      "settings.clean.stories": "Stories",
      "settings.clean.groupSuggestions": "Suggested groups",
      "settings.clean.memories": "Memories",
      "settings.clean.metaAI": "Meta AI",
      "settings.look.page": "Page:",
      "settings.look.shell": "2010 layout: blue bar, left column, right column and footer",
      "settings.look.fixedHeader": "Keep the blue bar at the top while scrolling",
      "settings.look.rightColumn": "Right column",
      "settings.look.chat": "Chat tab",
      "settings.look.welcome": "Welcome box on the home page",
      "settings.look.style": "Style:",
      "settings.look.theme": "2010 colours and fonts on every Facebook page",
      "settings.look.skinPosts": "2010 look for posts that Facebook draws itself",
      "settings.look.font": "Font:",
      "settings.look.language": "Language:",
      "settings.look.auto": "Same as Facebook",
      "settings.health.ok": "All parts of MFGA are running.",
      "settings.health.stopped": "Stopped after an error: {list}. Reload the page to start them again.",
      "settings.health.export": "Export report",
      "settings.health.refresh": "Refresh",
      "settings.health.reset": "Reset settings",
      "settings.health.exported": "Saved {file}. It holds only counts and internal names: no posts, people or links.",
      "settings.health.attach": "Attach it to a problem report",
      "settings.health.exportFailed": "The report could not be created.",
      "settings.health.errors": "Errors",
      "settings.health.module": "Module",
      "settings.health.count": "Count",
      "settings.health.first": "First error",
      "settings.health.counters": "Counters",
      "settings.health.facts": "Details",
      "settings.health.other": "Other",
      "settings.health.empty": "Nothing recorded yet.",
      "settings.health.advanced": "Advanced",
      "settings.health.debug": "Write diagnostic messages to the browser console",
      "settings.health.mainWorldHelper": "Use the page helper to look up Facebook's request ids",
      "settings.health.stopOnCheckpoint": "Stop all requests when Facebook asks for a security check",
      "settings.reset.title": "Reset Settings",
      "settings.reset.body": "Put every MFGA setting back to its default? Your hidden words will be removed.",
      "settings.reset.confirm": "Reset",
      "settings.about.tagline": "Make Facebook Great Again",
      "settings.about.version": "Version {version}",
      "settings.about.what": "What it does",
      "settings.about.p1": "MFGA brings back the Facebook of 2010: the blue bar, the left column with your groups and pages, the right column and the 2010 look of stories.",
      "settings.about.p2": "Your News Feed shows only your friends, groups and pages — no ads, no suggestions, no reels.",
      "settings.about.p3": "Everything happens in your browser. MFGA reads the page you already have and asks Facebook for the same data Facebook itself loads, as you. It sends nothing anywhere else.",
      "settings.about.links": "Links",
      "settings.about.repo": "Source code on GitHub",
      "settings.about.issues": "Report a problem or suggest an idea",
      "settings.about.credits": "Credits",
      "settings.about.creditSprites": "Icons: Facebook's original 2009 and 2012 sprites.",
      "settings.about.creditClean": "Detection words: the dictionary of zbluebugz's “FB – Clean my feeds” (MIT licence).",
      "settings.about.creditResearch": "Research: the webcleaner and uBlock Origin filter communities.",
      "settings.about.legal": "MFGA is not affiliated with or endorsed by Meta Platforms, Inc. Facebook is a trademark of Meta Platforms, Inc."
    },
    pl: {
      "settings.title": "Ustawienia MFGA",
      "settings.saved": "Zmiany są zapisywane automatycznie.",
      "settings.tab.feed": "Aktualności",
      "settings.tab.clean": "Porządki",
      "settings.tab.look": "Wygląd",
      "settings.tab.health": "Diagnostyka",
      "settings.tab.about": "Informacje",
      "settings.feed.show": "Pokazuj:",
      "settings.feed.recent": "Najnowsze",
      "settings.feed.recentHint": "Posty znajomych, grup i stron, od najnowszych.",
      "settings.feed.top": "Najciekawsze",
      "settings.feed.topHint": "Kolejność ustalana przez Facebooka, nadal bez reklam i propozycji.",
      "settings.feed.sources": "Uwzględniaj:",
      "settings.feed.friends": "Znajomi",
      "settings.feed.groups": "Grupy",
      "settings.feed.pages": "Strony",
      "settings.feed.favorites": "Ulubione",
      "settings.feed.sourcesHint": "Najciekawsze zawsze obejmują wszystkie.",
      "settings.feed.oneSource": "Zostaw zaznaczone co najmniej jedno.",
      "settings.feed.more": "Więcej postów:",
      "settings.feed.olderButton": "Przycisk „Starsze posty” na dole",
      "settings.feed.autoLoad": "Wczytuj je automatycznie podczas przewijania",
      "settings.feed.pageSize": "Postów naraz:",
      "settings.feed.comments": "Komentarze:",
      "settings.feed.previewComments": "Pokazuj najnowsze komentarze pod każdym postem",
      "settings.feed.ai": "Posty SI:",
      "settings.feed.hideAI": "Ukrywaj posty oznaczone jako utworzone przez SI",
      "settings.feed.keywords": "Ukryte słowa:",
      "settings.feed.keywordsHint": "Jedno słowo lub wyrażenie w wierszu. Posty, które je zawierają, są ukrywane.",
      "settings.clean.intro": "Dotyczy miejsc, w których Facebook sam wyświetla posty: aktualności grup, grup, wyszukiwania oraz strony głównej, gdy MFGA nie może zbudować własnych Aktualności.",
      "settings.clean.hide": "Ukrywaj:",
      "settings.clean.sponsored": "Posty sponsorowane (reklamy)",
      "settings.clean.suggested": "Proponowane posty oraz propozycje „Obserwuj” i „Dołącz”",
      "settings.clean.peopleYouMayKnow": "Osoby, które możesz znać",
      "settings.clean.reels": "Rolki",
      "settings.clean.stories": "Relacje",
      "settings.clean.groupSuggestions": "Proponowane grupy",
      "settings.clean.memories": "Wspomnienia",
      "settings.clean.metaAI": "Meta AI",
      "settings.look.page": "Strona:",
      "settings.look.shell": "Układ z 2010 roku: niebieski pasek, lewa i prawa kolumna oraz stopka",
      "settings.look.fixedHeader": "Przypnij niebieski pasek u góry podczas przewijania",
      "settings.look.rightColumn": "Prawa kolumna",
      "settings.look.chat": "Karta czatu",
      "settings.look.welcome": "Okno powitalne na stronie głównej",
      "settings.look.style": "Styl:",
      "settings.look.theme": "Kolory i czcionki z 2010 roku na każdej stronie Facebooka",
      "settings.look.skinPosts": "Wygląd z 2010 roku dla postów wyświetlanych przez Facebooka",
      "settings.look.font": "Czcionka:",
      "settings.look.language": "Język:",
      "settings.look.auto": "Taki jak na Facebooku",
      "settings.health.ok": "Wszystkie części MFGA działają.",
      "settings.health.stopped": "Zatrzymane po błędzie: {list}. Odśwież stronę, aby je ponownie uruchomić.",
      "settings.health.export": "Eksportuj raport",
      "settings.health.refresh": "Odśwież",
      "settings.health.reset": "Resetuj ustawienia",
      "settings.health.exported": "Zapisano {file}. Zawiera tylko liczniki i nazwy wewnętrzne: żadnych postów, osób ani linków.",
      "settings.health.attach": "Dołącz go do zgłoszenia problemu",
      "settings.health.exportFailed": "Nie udało się utworzyć raportu.",
      "settings.health.errors": "Błędy",
      "settings.health.module": "Moduł",
      "settings.health.count": "Liczba",
      "settings.health.first": "Pierwszy błąd",
      "settings.health.counters": "Liczniki",
      "settings.health.facts": "Szczegóły",
      "settings.health.other": "Inne",
      "settings.health.empty": "Na razie nic nie zarejestrowano.",
      "settings.health.advanced": "Zaawansowane",
      "settings.health.debug": "Zapisuj komunikaty diagnostyczne w konsoli przeglądarki",
      "settings.health.mainWorldHelper": "Używaj skryptu pomocniczego do odczytu identyfikatorów zapytań Facebooka",
      "settings.health.stopOnCheckpoint": "Wstrzymaj wszystkie zapytania, gdy Facebook poprosi o weryfikację",
      "settings.reset.title": "Resetowanie ustawień",
      "settings.reset.body": "Przywrócić domyślne wartości wszystkich ustawień MFGA? Twoje ukryte słowa zostaną usunięte.",
      "settings.reset.confirm": "Resetuj",
      "settings.about.tagline": "Make Facebook Great Again",
      "settings.about.version": "Wersja {version}",
      "settings.about.what": "Co robi",
      "settings.about.p1": "MFGA przywraca Facebooka z 2010 roku: niebieski pasek, lewą kolumnę z grupami i stronami, prawą kolumnę oraz wygląd postów z 2010 roku.",
      "settings.about.p2": "Aktualności pokazują tylko Twoich znajomych, grupy i strony — bez reklam, propozycji i rolek.",
      "settings.about.p3": "Wszystko dzieje się w Twojej przeglądarce. MFGA czyta stronę, którą już masz, i prosi Facebooka o te same dane, które Facebook sam wczytuje, w Twoim imieniu. Niczego nigdzie indziej nie wysyła.",
      "settings.about.links": "Linki",
      "settings.about.repo": "Kod źródłowy na GitHubie",
      "settings.about.issues": "Zgłoś problem lub zaproponuj pomysł",
      "settings.about.credits": "Podziękowania",
      "settings.about.creditSprites": "Ikony: oryginalne grafiki Facebooka z 2009 i 2012 roku.",
      "settings.about.creditClean": "Słowa do wykrywania: słownik skryptu „FB – Clean my feeds” autorstwa zbluebugz (licencja MIT).",
      "settings.about.creditResearch": "Badania: społeczności filtrów webcleaner i uBlock Origin.",
      "settings.about.legal": "MFGA nie jest powiązany z Meta Platforms, Inc. ani przez nią wspierany. Facebook jest znakiem towarowym Meta Platforms, Inc."
    }
  };
  registerStrings(STRINGS);

  // src/ui/dialog/settings-dialog.js
  var TABS = ["feed", "clean", "look", "health", "about"];
  var WIDTH = 580;
  var CLEAN_KEYS = Object.keys(DEFAULTS.clean);
  var LANGUAGES = [
    { value: "en", label: "English (US)" },
    { value: "pl", label: "Polski" }
  ];
  var lastTab = "feed";
  var active = null;
  function openSettingsDialog({ settings, healthSnapshot, exportReport, version = null }) {
    if (active?.isOpen()) return active.handle;
    active?.handle.close();
    let dialog = null;
    let binder = null;
    let body = null;
    let reopening = false;
    let unsubscribe = null;
    function open(focusSetting = null) {
      const current = createBinder(settings);
      binder = current;
      const view = buildView({ binder: current, settings, healthSnapshot, exportReport, version });
      body = view.el;
      current.sync(settings.get());
      const control = focusSetting && view.el.querySelector(`[data-mfga-setting="${focusSetting}"]`);
      const focus = control && !control.closest("[hidden]") ? control : view.selectedTab();
      dialog = openDialog({
        title: t("settings.title"),
        body: view.el,
        width: WIDTH,
        note: t("settings.saved"),
        focus,
        className: "mfga-settings-dialog",
        onClose: () => {
          current.flush();
          if (reopening) return;
          unsubscribe?.();
          active = null;
        }
      });
    }
    function onSettings(next, prev) {
      if (next.language === prev?.language) {
        binder.sync(next);
        return;
      }
      setLocale(next.language);
      reopening = true;
      dialog.close();
      reopening = false;
      open("language");
    }
    open();
    unsubscribe = settings.subscribe?.(safe("settings-dialog", onSettings, { disableOnError: false }));
    active = { handle: { close: () => dialog.close() }, isOpen: () => body.isConnected };
    return active.handle;
  }
  function buildView(ctx) {
    const panels = {
      feed: feedPanel(ctx),
      clean: cleanPanel(ctx),
      look: lookPanel(ctx),
      health: healthPanel(ctx),
      about: aboutPanel(ctx)
    };
    const ids = Object.fromEntries(TABS.map((name) => [name, uid(`tab-${name}`)]));
    const tabs = {};
    const panelEls = {};
    for (const name of TABS) {
      tabs[name] = h(
        "button.mfga-settings-tab",
        { type: "button", role: "tab", id: ids[name], "aria-controls": `${ids[name]}-panel`, onclick: () => select(name) },
        t(`settings.tab.${name}`)
      );
      panelEls[name] = h(
        "div.mfga-settings-panel",
        { role: "tabpanel", id: `${ids[name]}-panel`, "aria-labelledby": ids[name], dataset: { mfgaTab: name } },
        panels[name].el
      );
    }
    let selected = lastTab;
    function select(name, { focus = false } = {}) {
      selected = name;
      lastTab = name;
      for (const n of TABS) {
        tabs[n].setAttribute("aria-selected", String(n === name));
        tabs[n].tabIndex = n === name ? 0 : -1;
        panelEls[n].hidden = n !== name;
      }
      panels[name].onShow?.();
      if (focus) tabs[name].focus();
    }
    const tablist = h("div.mfga-settings-tabs", { role: "tablist" }, TABS.map((n) => tabs[n]));
    tablist.addEventListener("keydown", (ev) => {
      const i = TABS.indexOf(selected);
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[ev.key];
      if (next === void 0) return;
      ev.preventDefault();
      select(TABS[(next + TABS.length) % TABS.length], { focus: true });
    });
    select(selected);
    return {
      el: h("div.mfga-settings", tablist, TABS.map((n) => panelEls[n])),
      selectedTab: () => tabs[selected]
    };
  }
  function feedPanel({ binder, settings }) {
    const sourcesError = h("div.mfga-settings-inline-error", { role: "alert", hidden: true });
    binder.onSync(() => {
      sourcesError.hidden = true;
    });
    const refuseSource = () => {
      sourcesError.textContent = t("settings.feed.oneSource");
      sourcesError.hidden = false;
    };
    const sources = h(
      "div",
      FEED_SOURCES.map(
        (name) => binder.checkbox(`feed.sources.${name}`, t(`settings.feed.${name}`), {
          inline: true,
          patch: (checked, s) => sourcesPatch(s.feed.sources, name, checked),
          onRefuse: refuseSource
        })
      )
    );
    binder.enableWhen(sources, (s) => s.feed.mode === "recent");
    return {
      el: h(
        "div",
        row(
          t("settings.feed.show"),
          () => binder.radios("feed.mode", [
            { value: "recent", label: t("settings.feed.recent"), hint: t("settings.feed.recentHint") },
            { value: "top", label: t("settings.feed.top"), hint: t("settings.feed.topHint") }
          ]),
          { role: "radiogroup" }
        ),
        row(t("settings.feed.sources"), () => [sources, h("div.mfga-settings-hint", t("settings.feed.sourcesHint")), sourcesError], {
          role: "group"
        }),
        row(
          t("settings.feed.more"),
          () => binder.radios("feed.autoLoad", [
            { value: false, label: t("settings.feed.olderButton") },
            { value: true, label: t("settings.feed.autoLoad") }
          ]),
          { role: "radiogroup" }
        ),
        row(
          t("settings.feed.pageSize"),
          (labelId) => binder.select(
            "feed.pageSize",
            pageSizeOptions(settings.get().feed.pageSize).map((n) => ({ value: n, label: String(n) })),
            { labelledBy: labelId, parse: Number }
          )
        ),
        row(t("settings.feed.comments"), () => binder.checkbox("feed.previewComments", t("settings.feed.previewComments"))),
        row(t("settings.feed.ai"), () => binder.checkbox("feed.hideAI", t("settings.feed.hideAI"))),
        row(t("settings.feed.keywords"), (labelId) => {
          const hintId = uid("hint");
          return [
            binder.keywordList("feed.keywords", { class: "mfga-settings-keywords", "aria-labelledby": labelId, "aria-describedby": hintId }),
            h("div.mfga-settings-hint", { id: hintId }, t("settings.feed.keywordsHint"))
          ];
        })
      )
    };
  }
  function cleanPanel({ binder }) {
    return {
      el: h(
        "div",
        h("p.mfga-settings-intro.mfga-muted", t("settings.clean.intro")),
        row(t("settings.clean.hide"), () => CLEAN_KEYS.map((key) => binder.checkbox(`clean.${key}`, t(`settings.clean.${key}`))), {
          role: "group"
        })
      )
    };
  }
  function lookPanel({ binder }) {
    const shellParts = h(
      "div.mfga-settings-sub",
      ["fixedHeader", "rightColumn", "chat"].map((key) => binder.checkbox(`look.${key}`, t(`settings.look.${key}`)))
    );
    binder.enableWhen(shellParts, (s) => s.look.shell);
    const welcome = binder.checkbox("look.welcome", t("settings.look.welcome"), { patch: welcomePatch });
    return {
      el: h(
        "div",
        row(t("settings.look.page"), () => [binder.checkbox("look.shell", t("settings.look.shell")), shellParts, welcome], { role: "group" }),
        row(
          t("settings.look.style"),
          () => [binder.checkbox("look.theme", t("settings.look.theme")), binder.checkbox("look.skinPosts", t("settings.look.skinPosts"))],
          { role: "group" }
        ),
        row(
          t("settings.look.font"),
          () => binder.radios(
            "look.font",
            [
              { value: "lucida", label: "Lucida Grande", className: "mfga-settings-font-lucida" },
              { value: "tahoma", label: "Tahoma", className: "mfga-settings-font-tahoma" }
            ],
            { inline: true }
          ),
          { role: "radiogroup" }
        ),
        row(
          t("settings.look.language"),
          (labelId) => binder.select("language", [{ value: "auto", label: t("settings.look.auto") }, ...LANGUAGES], { labelledBy: labelId })
        )
      )
    };
  }

  // src/main.js
  var STYLE_ID = "mfga-style";
  var FEED_SOURCES2 = ["friends", "groups", "pages", "favorites"];
  var REQUEST_GAP_MS = 1e3;
  var LAST_SEEN_KEY = "mfga:lastSeen";
  var COMPOSER_SELECTORS = ['[role="region"][aria-label="Create a post"] [role="button"]', '[role="region"][aria-label="Utwórz post"] [role="button"]'];
  registerStrings({
    en: {
      "main.menu": "MFGA settings",
      "main.turnOff": "Turn MFGA off (back to 2026 Facebook)",
      "main.turnOn": "Turn MFGA on",
      "main.halted": "MFGA paused its own requests because Facebook asked to verify your account. Facebook itself is unaffected."
    },
    pl: {
      "main.menu": "Ustawienia MFGA",
      "main.turnOff": "Wyłącz MFGA (powrót do Facebooka 2026)",
      "main.turnOn": "Włącz MFGA",
      "main.halted": "MFGA wstrzymało własne zapytania, bo Facebook poprosił o weryfikację konta. Sam Facebook działa normalnie."
    }
  });
  function buildCss(settings) {
    return [
      baseCss(settings),
      dialogCss(),
      iconCss(),
      themeCss(settings),
      nativeCss(settings),
      shellCss(settings),
      streamCss(settings),
      // Our News Feed replaces Facebook's home column; "pending" keeps Facebook's column invisible (but laid
      // out) while we decide, so there is no flash of the 2026 feed.
      'html[data-mfga-feed="ours"] [data-mfga-main]>:not(#mfga-stream){display:none!important}',
      'html[data-mfga-feed="pending"] [data-mfga-main]>:not(#mfga-stream){visibility:hidden!important}',
      'html:not([data-mfga-feed="ours"]) #mfga-stream{display:none!important}'
    ].join("\n");
  }
  var MEDIA_ROUTE = /^\/(photo|photos|reel|reels|stories|watch|video|videos)(\/|\.php|$)/;
  function applyRootAttributes(s) {
    const html = document.documentElement;
    if (!html) return;
    html.toggleAttribute("data-mfga", !!s.enabled);
    html.toggleAttribute("data-mfga-theme", !!(s.enabled && s.look.theme && !MEDIA_ROUTE.test(location.pathname)));
    html.toggleAttribute("data-mfga-skin", !!(s.enabled && s.look.skinPosts));
    html.setAttribute("data-mfga-font", s.look.font);
  }
  function paint(style, s) {
    applyRootAttributes(s);
    style.textContent = s.enabled ? buildCss(s) : "";
    if (!style.isConnected) (document.head || document.documentElement).appendChild(style);
  }
  function removalStats(feed, cleaner) {
    const fromFeed = hiddenCounts(feed?.stats?.() ?? {});
    const reasons = cleaner?.stats?.()?.reasons ?? {};
    let nativeAds = 0;
    let nativeSuggested = 0;
    for (const [reason, n] of Object.entries(reasons)) {
      if (reason === "sponsored") nativeAds += n;
      else nativeSuggested += n;
    }
    return { ads: fromFeed.ads + nativeAds, suggested: fromFeed.suggested + nativeSuggested };
  }
  async function boot(platform) {
    const harvest = safe("harvest", () => startHarvest())() || null;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    onRoot(safe("paint", () => paint(style, sanitize({}))));
    let settings;
    try {
      settings = await createSettings(platform);
    } catch (err) {
      warn("settings unavailable, using defaults", err);
      settings = await createSettings({ ...platform, storage: { get: async () => void 0, set: async () => {
      }, onChange() {
      } } });
    }
    const s0 = settings.get();
    setDebug(s0.advanced.debug);
    setLocale(s0.language);
    onRoot(
      safe("paint", () => {
        setLocale(settings.get().language);
        paint(style, settings.get());
      })
    );
    const lastSeen = Number(await platform.storage.get(LAST_SEEN_KEY).catch(() => 0)) || 0;
    health.fact("platform", { kind: platform.kind, version: platform.version, ...platform.diagnostics || {} });
    const app = createApp({ platform, settings, harvest, style, lastSeen });
    platform.addMenuCommand(t("main.menu"), () => app.openSettings());
    if (platform.kind === "userscript") {
      platform.addMenuCommand(t(s0.enabled ? "main.turnOff" : "main.turnOn"), async () => {
        await settings.update({ enabled: !settings.get().enabled });
        location.reload();
      });
    }
    settings.subscribe((next, prev) => app.onSettings(next, prev));
    if (!s0.enabled) return;
    onBody(safe("boot", () => app.start()));
  }
  function createApp({ platform, settings, harvest, style, lastSeen }) {
    const S3 = () => settings.get();
    let route = classifyRoute();
    let started = false;
    const client = harvest ? createGqlClient({
      platform,
      harvest,
      minGapMs: REQUEST_GAP_MS,
      stopOnCheckpoint: S3().advanced.stopOnCheckpoint,
      onHalt: (reason) => {
        health.fact("halted", reason);
        warn(t("main.halted"));
        feedDecided = false;
        syncFeed();
      },
      refreshTokens: async () => {
        harvest.refresh?.();
        const fresh = await platform.page?.readTokens?.().catch(() => null);
        if (fresh?.dtsg) harvest.tokens.dtsg = fresh.dtsg;
        if (fresh?.lsd) harvest.tokens.lsd = fresh.lsd;
      }
    }) : null;
    const ops = harvest ? createOpRegistry({ platform, harvest }) : null;
    const actions = client ? createActions({ client, ops, harvest }) : null;
    let classifier = createClassifier({ hideAI: S3().feed.hideAI });
    const navigator2 = createNavigator({ platform });
    const reader = createChromeReader({
      platform,
      identityHint: () => harvest?.tokens?.userId ? { id: harvest.tokens.userId, name: harvest.tokens.name || null } : null
    });
    const layout = createLayout({ settings });
    let shell = null;
    let cleaner = null;
    let skin = null;
    let feedView = null;
    let feedKey = null;
    let currentFeed = null;
    let feedDecided = false;
    const openSettings = safe(
      "settings-dialog",
      () => openSettingsDialog({
        settings,
        version: platform.version,
        healthSnapshot: () => healthSnapshot(),
        exportReport: () => healthSnapshot()
      })
    );
    function healthSnapshot() {
      return {
        ...health.snapshot(),
        harvest: harvest?.snapshot?.() ?? null,
        ops: ops?.snapshot?.() ?? null,
        requests: client?.stats?.() ?? null,
        feed: currentFeed?.stats?.() ?? null,
        cleaner: cleaner?.stats?.() ?? null,
        route: route.mode,
        feedMode: document.documentElement.getAttribute("data-mfga-feed")
      };
    }
    function feedSpec(r, s) {
      if (r.filter && FEED_STYLES[r.filter] && r.filter !== "top") return { mode: "recent", sources: [r.filter], key: `filter:${r.filter}` };
      if (s.feed.mode === "top" && !r.sk) return { mode: "top", sources: ["top"], key: "top" };
      const names = FEED_SOURCES2.filter((n) => s.feed.sources[n]);
      const sources = names.length ? names : ["all"];
      return { mode: "recent", sources, key: `recent|${sources.join(",")}` };
    }
    function getFeed(mode, sources) {
      const s = S3();
      const spec = feedSpec(route, s);
      const names = mode === "top" ? ["top"] : route.filter ? spec.sources : sources?.length ? sources : spec.sources;
      const scale = Math.max(2, Math.round(globalThis.devicePixelRatio || 1));
      currentFeed = createMergedFeed({
        sources: names.map((name) => createFeedSource({ name, client, ops, harvest, classifier, scale })),
        pageSize: s.feed.pageSize,
        keywords: s.feed.keywords
      });
      return currentFeed;
    }
    function openComposer() {
      for (const sel of COMPOSER_SELECTORS) {
        const btn = document.querySelector(sel);
        if (btn) {
          btn.click();
          return;
        }
      }
      health.count("main.composer-miss");
      navigator2.go("https://www.facebook.com/");
      let tries = 0;
      const timer = setInterval(() => {
        const btn = COMPOSER_SELECTORS.map((sel) => document.querySelector(sel)).find(Boolean);
        if (btn || ++tries > 20) {
          clearInterval(timer);
          btn?.click();
        }
      }, 250);
    }
    function me2() {
      const id = reader.identity?.() || null;
      return id ? { name: id.name, avatar: id.avatar, url: id.url } : null;
    }
    function buildFeedView(spec) {
      feedView?.destroy?.();
      let seen = lastSeen;
      feedView = createFeedView({
        actions,
        settings,
        // A getter: the chrome reader may learn who you are after the view is built.
        get me() {
          return me2();
        },
        // The 2010 count pill: stories newer than the previous visit (fixed for this view's lifetime).
        lastSeen,
        onSeen: (newest) => {
          if (!(newest > seen)) return;
          seen = newest;
          platform.storage.set(LAST_SEEN_KEY, newest).catch(() => {
          });
        },
        open: (url, opts) => opts?.newTab ? window.open(url, "_blank", "noopener") : navigator2.go(url),
        now: () => Date.now(),
        getFeed,
        mode: spec.mode,
        onModeChange: (mode) => {
          settings.update({ feed: { mode } });
          if (route.filter || route.sk) navigator2.go("https://www.facebook.com/");
        },
        openComposer,
        hiddenStats: () => currentFeed?.stats?.() ?? {},
        onDismissWelcome: () => settings.update({ state: { welcomeDismissed: true } })
      });
      feedKey = spec.key;
    }
    async function canUseOurFeed() {
      if (!client || !ops || client.halted) return false;
      if (!S3().look.shell) return false;
      const op = await ops.get(FEED_QUERY).catch(() => null);
      return !!op?.variables;
    }
    const syncFeed = safe("feed", async () => {
      const html = document.documentElement;
      if (route.mode !== "home" || !S3().enabled) {
        html.removeAttribute("data-mfga-feed");
        return;
      }
      if (!feedDecided) html.setAttribute("data-mfga-feed", "pending");
      await harvest?.ready?.catch?.(() => {
      });
      const ours = await canUseOurFeed();
      feedDecided = true;
      if (route.mode !== "home") return;
      if (!ours) {
        html.setAttribute("data-mfga-feed", "native");
        health.fact("feed", "native");
        return;
      }
      const spec = feedSpec(route, S3());
      if (!feedView || feedKey !== spec.key) buildFeedView(spec);
      mountFeed();
      html.setAttribute("data-mfga-feed", "ours");
      health.fact("feed", "ours");
    });
    function mountFeed() {
      if (!feedView) return;
      const main = findMain();
      if (!main) return;
      if (feedView.el.parentNode !== main || main.firstElementChild !== feedView.el) main.prepend(feedView.el);
    }
    const remount = safe(
      "feed",
      () => {
        if (route.mode === "home" && document.documentElement.getAttribute("data-mfga-feed") === "ours") mountFeed();
      },
      { disableOnError: false }
    );
    const persistPreloader = safe(
      "ops",
      () => {
        const p = harvest?.preloaders?.get?.(FEED_QUERY);
        if (p?.queryID && p.variables) ops.learn(FEED_QUERY, p.queryID, p.variables, "preloader");
      },
      { disableOnError: false }
    );
    function onRoute(next) {
      route = next;
      applyRootAttributes(S3());
      layout.apply(route);
      shell?.update?.({ route });
      cleaner?.setRoute?.(route);
      if (route.mode !== "home") {
        feedView?.el?.remove();
      }
      syncFeed();
    }
    function start() {
      if (started) return;
      started = true;
      setLocale(S3().language);
      paint(style, S3());
      const s = S3();
      layout.apply(route);
      if (s.look.shell) {
        shell = safe(
          "shell",
          () => createShell({
            settings,
            reader,
            navigator: navigator2,
            openSettings,
            stats: () => removalStats(currentFeed, cleaner),
            route
          })
        )();
      }
      cleaner = safe("cleaner", () => startCleaner({ settings, route }))();
      skin = safe("skin", () => startSkin({ settings }))();
      onRouteChange((next) => onRoute(next));
      harvest?.ready?.then?.(persistPreloader);
      persistPreloader();
      syncFeed();
      setInterval(remount, 1e3);
    }
    function onSettings(next, prev) {
      setDebug(next.advanced.debug);
      if (next.language !== prev.language) setLocale(next.language);
      paint(style, next);
      if (next.language !== prev.language) shell?.update?.({});
      if (next.feed.hideAI !== prev.feed.hideAI) classifier = createClassifier({ hideAI: next.feed.hideAI });
      if (!next.enabled) {
        layout.apply(route);
        document.documentElement.removeAttribute("data-mfga-feed");
        return;
      }
      if (!started) return start();
      layout.apply(route);
      const feedChanged = JSON.stringify(next.feed) !== JSON.stringify(prev.feed) || next.look.shell !== prev.look.shell || next.language !== prev.language;
      if (feedChanged && route.mode === "home") {
        feedKey = null;
        syncFeed();
      }
    }
    return { start, onSettings, openSettings };
  }

  // src/shared/bridge.js
  var PREFIX2 = "mfga:";
  var BRIDGE_CHANNEL = "v1";
  function createBridgeClient(channel, { timeoutMs = 4e3 } = {}) {
    let seq3 = 0;
    const pending = /* @__PURE__ */ new Map();
    document.addEventListener(`${PREFIX2}${channel}:res`, (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.detail);
      } catch {
        return;
      }
      const p = pending.get(msg && msg.id);
      if (!p) return;
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(msg.error));
      else p.resolve(msg.result);
    });
    return {
      call(method, params = {}, ms = timeoutMs) {
        const id = ++seq3;
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`bridge timeout: ${method}`));
          }, ms);
          pending.set(id, { resolve, reject, timer });
          document.dispatchEvent(new CustomEvent(`${PREFIX2}${channel}:req`, { detail: JSON.stringify({ id, method, params }) }));
        });
      }
    };
  }

  // src/page/page-api.js
  var OP_NAME = /^[A-Za-z0-9_]{3,120}$/;
  var DOC_ID2 = /^\d{5,25}$/;
  function requireOp(win, { name, timeoutMs = 3e3 }) {
    if (!OP_NAME.test(String(name))) return Promise.resolve(null);
    const requireLazy = win.requireLazy;
    if (typeof requireLazy !== "function") return Promise.resolve(null);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), Math.min(1e4, Math.max(100, timeoutMs)));
      try {
        requireLazy([`${name}_facebookRelayOperation`], (id) => {
          clearTimeout(timer);
          resolve(typeof id === "string" && DOC_ID2.test(id) ? id : null);
        });
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }
  var TOKEN_MODULES = ["DTSGInitData", "DTSGInitialData", "LSD"];
  function readTokens(win, { timeoutMs = 1500 } = {}) {
    const requireLazy = win.requireLazy;
    if (typeof requireLazy !== "function") return Promise.resolve({ dtsg: null, lsd: null });
    const one = (name) => new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      try {
        requireLazy([name], (mod) => {
          clearTimeout(timer);
          const token = mod && typeof mod.token === "string" && mod.token ? mod.token : null;
          resolve(token);
        });
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    });
    return Promise.all(TOKEN_MODULES.map(one)).then(([a, b, lsd]) => ({ dtsg: a || b, lsd }));
  }
  function navigate(win, { url }) {
    let target;
    try {
      target = new URL(String(url), win.location.href);
    } catch {
      return false;
    }
    if (target.origin !== win.location.origin) return false;
    win.history.pushState({}, "", target.pathname + target.search + target.hash);
    win.dispatchEvent(new win.PopStateEvent("popstate", { state: {} }));
    return true;
  }

  // platform/userscript/entry.js
  var W = typeof unsafeWindow !== "undefined" && unsafeWindow || window;
  var info = typeof GM_info !== "undefined" ? GM_info : null;
  var xray = typeof window.wrappedJSObject === "object" && window.wrappedJSObject !== null;
  var inPage = !xray && info?.injectInto !== "content" && info?.sandboxMode !== "dom" && info?.sandboxMode !== "js";
  function storageAdapter() {
    if (typeof GM_getValue === "function" && typeof GM_setValue === "function") {
      return {
        get: async (key) => GM_getValue(key),
        set: async (key, value) => GM_setValue(key, value),
        onChange(cb) {
          if (typeof GM_addValueChangeListener === "function") {
            GM_addValueChangeListener("mfga:settings", (key, _old, value) => cb(key, value));
            GM_addValueChangeListener("mfga:ops", (key, _old, value) => cb(key, value));
            GM_addValueChangeListener("mfga:rail", (key, _old, value) => cb(key, value));
          }
        }
      };
    }
    return {
      get: async (key) => {
        try {
          const raw = localStorage.getItem(key);
          return raw == null ? void 0 : JSON.parse(raw);
        } catch {
          return void 0;
        }
      },
      set: async (key, value) => {
        try {
          localStorage.setItem(key, JSON.stringify(value));
        } catch {
        }
      },
      onChange() {
      }
    };
  }
  function pageApi() {
    if (inPage) {
      return {
        requireOp: (name, timeoutMs = 3e3) => requireOp(W, { name, timeoutMs }),
        navigate: async (url) => navigate(W, { url }),
        readTokens: () => readTokens(W)
      };
    }
    if (typeof GM_addElement !== "function") return null;
    try {
      GM_addElement("script", { textContent: '(()=>{var u="mfga:";function c(e,i){document.addEventListener(`${u}${e}:req`,async n=>{let r;try{r=JSON.parse(n.detail)}catch{return}if(!r||typeof r.id!="number")return;let o;try{let t=i[r.method];if(!t)throw new Error(`unknown method ${r.method}`);o={id:r.id,result:await t(r.params||{})}}catch(t){o={id:r.id,error:String(t&&t.message||t)}}document.dispatchEvent(new CustomEvent(`${u}${e}:res`,{detail:JSON.stringify(o)}))})}var f=/^[A-Za-z0-9_]{3,120}$/,g=/^\\d{5,25}$/;function l(e,{name:i,timeoutMs:n=3e3}){if(!f.test(String(i)))return Promise.resolve(null);let r=e.requireLazy;return typeof r!="function"?Promise.resolve(null):new Promise(o=>{let t=setTimeout(()=>o(null),Math.min(1e4,Math.max(100,n)));try{r([`${i}_facebookRelayOperation`],s=>{clearTimeout(t),o(typeof s=="string"&&g.test(s)?s:null)})}catch{clearTimeout(t),o(null)}})}var y=["DTSGInitData","DTSGInitialData","LSD"];function m(e,{timeoutMs:i=1500}={}){let n=e.requireLazy;if(typeof n!="function")return Promise.resolve({dtsg:null,lsd:null});let r=o=>new Promise(t=>{let s=setTimeout(()=>t(null),i);try{n([o],a=>{clearTimeout(s);let p=a&&typeof a.token=="string"&&a.token?a.token:null;t(p)})}catch{clearTimeout(s),t(null)}});return Promise.all(y.map(r)).then(([o,t,s])=>({dtsg:o||t,lsd:s}))}function d(e,{url:i}){let n;try{n=new URL(String(i),e.location.href)}catch{return!1}return n.origin!==e.location.origin?!1:(e.history.pushState({},"",n.pathname+n.search+n.hash),e.dispatchEvent(new e.PopStateEvent("popstate",{state:{}})),!0)}c("v1",{requireOp:e=>l(window,e),navigate:e=>d(window,e),readTokens:e=>m(window,e)});})();\n' });
    } catch {
      return null;
    }
    const bridge = createBridgeClient(BRIDGE_CHANNEL);
    return {
      requireOp: (name, timeoutMs = 3e3) => bridge.call("requireOp", { name, timeoutMs }, timeoutMs + 1e3).catch(() => null),
      navigate: (url) => bridge.call("navigate", { url }, 2e3).then(Boolean, () => false),
      readTokens: () => bridge.call("readTokens", {}, 3e3).catch(() => ({ dtsg: null, lsd: null }))
    };
  }
  function pageFetch() {
    if (xray && typeof globalThis.content !== "undefined" && globalThis.content?.fetch) {
      return (url, init) => globalThis.content.fetch(url, init);
    }
    return (url, init) => W.fetch(url, init);
  }
  boot({
    kind: "userscript",
    version: "1.0.0",
    fetch: pageFetch(),
    storage: storageAdapter(),
    learnedOps: async () => ({}),
    page: pageApi(),
    addMenuCommand(label, fn) {
      if (typeof GM_registerMenuCommand === "function") GM_registerMenuCommand(label, fn);
    },
    diagnostics: {
      manager: info?.scriptHandler ? `${info.scriptHandler} ${info.version || ""}`.trim() : "unknown",
      mode: inPage ? "page" : xray ? "xray" : info?.injectInto || info?.sandboxMode || "content",
      late: document.readyState !== "loading" || typeof W.requireLazy === "function"
    }
  });
})();
