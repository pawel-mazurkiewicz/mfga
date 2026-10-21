// Deterministic SVG pictures behind Facebook-shaped CDN URLs:
//   https://scontent.test.fbcdn.net/v/t39.30808-1/<kind>_<id>_<w>x<h>_n.jpg?stp=…&oh=…&oe=…
// The URL carries the signed-looking query Facebook uses (changing it "breaks the signature" in real life);
// the server only reads kind, id and size from the file name.

import { createHash } from "node:crypto";
import { esc } from "./html.mjs";

export const CDN_HOST = "scontent.test.fbcdn.net";
export const VIDEO_HOST = "video.test.fbcdn.net";

const BUCKET = { avatar: "t39.30808-1", logo: "t39.30808-1", photo: "t39.30808-6", share: "t45.1600-4", poster: "t15.5256-10", ad: "t45.1600-4" };

const hash = (s) => createHash("sha1").update(String(s)).digest("hex");

export function imageUrl(kind, id, w, h = w) {
  const x = hash(`${kind}:${id}:${w}x${h}`);
  const stp = kind === "avatar" || kind === "logo" ? `cp0_dst-jpg_s${w}x${h}_tt6` : `dst-jpg_p${w}x${h}_tt6`;
  return `https://${CDN_HOST}/v/${BUCKET[kind] || BUCKET.photo}/${kind}_${id}_${w}x${h}_n.jpg?stp=${stp}&_nc_cat=${parseInt(x.slice(0, 2), 16) % 110}&ccb=1-7&_nc_sid=${x.slice(2, 8)}&_nc_ohc=${x.slice(8, 30)}&_nc_ht=${CDN_HOST}&oh=00_${x.slice(10, 40)}&oe=${x.slice(30, 38).toUpperCase()}`;
}

export function videoUrl(id, quality) {
  const x = hash(`video:${id}:${quality}`);
  return `https://${VIDEO_HOST}/o1/v/t2/f2/m69/${id}_${quality}.mp4?efg=${x.slice(0, 24)}&_nc_ht=${VIDEO_HOST}&oh=00_${x.slice(4, 30)}&oe=${x.slice(30, 38).toUpperCase()}`;
}

/** Parses a CDN path back to { kind, id, w, h } or null. */
export function parseImagePath(pathname) {
  const m = /\/([a-z]+)_([\w-]+)_(\d+)x(\d+)_n\.jpg$/.exec(pathname);
  return m ? { kind: m[1], id: m[2], w: +m[3], h: +m[4] } : null;
}

function palette(id) {
  const x = hash(id);
  const hue = parseInt(x.slice(0, 4), 16) % 360;
  return { hue, n: (i) => parseInt(x.slice(i * 2, i * 2 + 2), 16) };
}

const initials = (name) =>
  String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

function svgDoc(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

function avatar(id, w, h) {
  const { hue } = palette(id);
  return svgDoc(w, h, `<rect width="${w}" height="${h}" fill="hsl(${hue},45%,62%)"/>
<circle cx="${w / 2}" cy="${h * 0.4}" r="${w * 0.2}" fill="hsl(${hue},35%,88%)"/>
<ellipse cx="${w / 2}" cy="${h * 1.02}" rx="${w * 0.38}" ry="${h * 0.36}" fill="hsl(${hue},35%,88%)"/>`);
}

function logo(id, w, h, name) {
  const { hue } = palette(id);
  return svgDoc(w, h, `<rect width="${w}" height="${h}" fill="hsl(${hue},55%,40%)"/>
<text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="${Math.round(h * 0.42)}" fill="#fff">${esc(initials(name))}</text>`);
}

function scene(id, w, h, extra = "") {
  const { hue, n } = palette(id);
  const sky = `hsl(${(hue + 200) % 360},60%,${70 + (n(3) % 15)}%)`;
  const hill1 = `hsl(${90 + (n(4) % 60)},40%,${35 + (n(5) % 15)}%)`;
  const hill2 = `hsl(${100 + (n(6) % 50)},35%,${25 + (n(7) % 15)}%)`;
  const sunX = w * (0.15 + (n(8) % 70) / 100);
  return svgDoc(w, h, `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="#fff8e7"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#s)"/>
<circle cx="${sunX}" cy="${h * 0.28}" r="${Math.min(w, h) * 0.09}" fill="#ffd56b"/>
<path d="M0 ${h * 0.7} Q ${w * 0.25} ${h * (0.45 + (n(9) % 20) / 100)} ${w * 0.5} ${h * 0.66} T ${w} ${h * 0.6} V ${h} H 0 Z" fill="${hill1}"/>
<path d="M0 ${h * 0.85} Q ${w * 0.4} ${h * 0.7} ${w * 0.7} ${h * 0.82} T ${w} ${h * 0.78} V ${h} H 0 Z" fill="${hill2}"/>${extra}`);
}

function share(id, w, h, name) {
  const { hue } = palette(id);
  return svgDoc(w, h, `<rect width="${w}" height="${h}" fill="hsl(${hue},30%,92%)"/>
<rect x="${w * 0.08}" y="${h * 0.2}" width="${w * 0.5}" height="${h * 0.12}" rx="4" fill="hsl(${hue},45%,55%)"/>
<rect x="${w * 0.08}" y="${h * 0.42}" width="${w * 0.75}" height="${h * 0.06}" fill="hsl(${hue},20%,70%)"/>
<rect x="${w * 0.08}" y="${h * 0.54}" width="${w * 0.66}" height="${h * 0.06}" fill="hsl(${hue},20%,70%)"/>
<text x="${w * 0.08}" y="${h * 0.85}" font-family="Arial, sans-serif" font-size="${Math.round(h * 0.08)}" fill="hsl(${hue},40%,35%)">${esc(name || "")}</text>`);
}

function poster(id, w, h) {
  const r = Math.min(w, h) * 0.12;
  return scene(id, w, h, `<circle cx="${w / 2}" cy="${h / 2}" r="${r}" fill="rgba(0,0,0,.55)"/><path d="M${w / 2 - r * 0.35} ${h / 2 - r * 0.5} L${w / 2 + r * 0.55} ${h / 2} L${w / 2 - r * 0.35} ${h / 2 + r * 0.5} Z" fill="#fff"/>`);
}

/** SVG markup for a parsed CDN path; `name` labels logos and link previews. */
export function renderImage({ kind, id, w, h }, name) {
  if (kind === "avatar") return avatar(id, w, h);
  if (kind === "logo") return logo(id, w, h, name);
  if (kind === "share" || kind === "ad") return share(id, w, h, name);
  if (kind === "poster") return poster(id, w, h);
  return scene(id, w, h);
}
