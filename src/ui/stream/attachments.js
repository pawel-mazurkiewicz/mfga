// Story attachments in 2010 style: photo thumbnails (grid with "+N"), video poster with a play overlay
// that swaps in a <video>, link card, event, "Attachment Unavailable".
import { h, safeUrl } from "../dom.js";
import { icon } from "../icons.js";
import { t } from "../../shared/i18n.js";
import { fitBox, formatDuration, photoGrid } from "./format.js";
import { guard, link } from "./parts.js";

const SINGLE_PHOTO = { w: 320, h: 320 };
const VIDEO_BOX = { w: 320, h: 240 };

function photoThumb(item, fallbackUrl, size, extra = null) {
  const img = h("img", {
    src: item.uri,
    alt: item.alt || "",
    loading: "lazy",
    decoding: "async",
    width: size.width,
    height: size.height,
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
    }),
  );
}

function playVideo(thumb, att, src, size) {
  const video = h("video.mfga-att-player", {
    src,
    poster: safeUrl(att.poster),
    controls: true,
    autoplay: true,
    preload: "none",
    playsinline: true,
    width: size.width,
    height: size.height,
  });
  if (!video.hasAttribute("src")) return false;
  thumb.replaceWith(video);
  return true;
}

function renderVideo(att, story) {
  const size = fitBox(att.width, att.height, VIDEO_BOX.w, VIDEO_BOX.h);
  const poster = att.poster ? h("img", { src: att.poster, alt: "", loading: "lazy", decoding: "async", width: size.width, height: size.height }) : null;
  const thumb = link(
    att.href || story.url,
    { class: "mfga-att-video-thumb", style: { width: size.width, height: size.height }, "aria-label": t("story.play"), role: "button" },
    poster,
    h("i.mfga-att-play", { "aria-hidden": "true" }),
    att.live ? h("span.mfga-att-live", t("story.live")) : null,
  );
  const src = att.hd || att.sd;
  if (src) {
    thumb.addEventListener(
      "click",
      guard((ev) => {
        if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
        if (playVideo(thumb, att, src, size)) ev.preventDefault();
      }),
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
      att.description ? h("div.mfga-att-desc", att.description) : null,
    ),
  );
}

function renderEvent(att) {
  return h(
    "div.mfga-att.mfga-att-event",
    icon("nav_events", { className: "mfga-att-event-ico" }),
    h("div.mfga-att-event-body", link(att.url, { class: "mfga-att-title" }, att.title || att.url), att.when ? h("div.mfga-att-source", att.when) : null),
  );
}

function renderUnavailable() {
  return h("div.mfga-att.mfga-att-unavailable", h("div.mfga-att-unavailable-title", t("story.unavailableTitle")), h("div", t("story.unavailableText")));
}

function renderOther(att) {
  return att.href ? h("div.mfga-att.mfga-att-other", link(att.href, {}, t("story.viewAttachment"))) : null;
}

const RENDERERS = {
  photo: renderPhotos,
  video: renderVideo,
  link: renderLink,
  event: renderEvent,
  unavailable: renderUnavailable,
  other: renderOther,
};

/** Story attachments block, or null when there is nothing to show. */
export function renderAttachments(story) {
  const nodes = (story.attachments || []).map((att) => RENDERERS[att?.kind]?.(att, story)).filter(Boolean);
  return nodes.length ? h("div.mfga-story-attachments", nodes) : null;
}
