// Synthetic, deterministic Facebook GraphQL fixtures for MFGA tests.
//
// Every builder reproduces the key layout of the real 2026-10 captures (docs/research/graphql-protocol.md
// §16: news-feed pages, group posts with album / AI label / Join button, the Reels row, SSR data-sjs
// blocks, video delivery). Names, ids, URLs, hashes and tracking strings are invented; no captured blob is
// copied. Category hashes are real (sha256(sha256(post_id) + n)), so the classifier's decoder is exercised.
//
//   node test/fixtures/gql/make-fixtures.mjs     regenerates the fixture files next to this script
//
// Other packages build their own payloads with the exported builders:
//   buildFeedResponse({ stories: [buildStory({...}), buildEdge(pymkUnit()), ...], cursor, hasNext })

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const T0 = 1792540800; // 2026-10-21T00:00:00Z: newest fixture story
export const VIEWER = { id: "100090000000001", name: "Mark Viewer" };
export const STREAM_LABEL = "CometNewsFeed_viewerConnection$stream$CometNewsFeed_viewer_news_feed";
export const PAGE_INFO_LABEL = "CometNewsFeed_viewerConnection$defer$CometNewsFeed_viewer_news_feed$page_info";
export const PRELOADER_ID = "adp_CometModernHomeFeedQueryRelayPreloader_6f1c0de5a1b2c3d4e5f6071";
export const CATEGORY = { ORGANIC: 1, ENGAGEMENT: 2, SPONSORED: 5 };
export const REACTION = { LIKE: "1635855486666999", LOVE: "1678524932434102", HAHA: "115940658764963", WOW: "478547315650144" };

const FB = "https://www.facebook.com";
const b64 = (s) => Buffer.from(s).toString("base64");
const section = (typename, extra) => ({ __typename: typename, __isICometStorySection: typename, is_prod_eligible: true, ...extra });

export function sha256Hex(s) {
  return createHash("sha256").update(String(s)).digest("hex");
}

/** cat_sensitive.enc for a post: sha256hex(sha256hex(post_id) + n). */
export function categoryHash(postId, n) {
  return sha256Hex(sha256Hex(String(postId)) + n);
}

/** fbcdn-style image URL with the size hint Facebook puts in `stp`. */
export function cdnImage(name, size) {
  return `https://scontent.xx.fbcdn.net/v/t39.30808-6/${name}_n.jpg?stp=dst-jpg_s${size}x${size}&_nc_cat=1&oh=00_fx${name}&oe=6A1B2C3D`;
}

export function linkShim(url) {
  return `https://l.facebook.com/l.php?u=${encodeURIComponent(url)}&h=AT0fx${sha256Hex(url).slice(0, 24)}`;
}

// ---------------------------------------------------------------------------------------------
// Profiles

export function person({ id, name, vanity, type = "User" }) {
  return { __typename: type, id, name, url: `${FB}/${vanity ?? id}`, shortName: name.split(" ")[0] };
}

export const page = (spec) => person({ ...spec, type: "Page" });

export function group({ id, name, vanity }) {
  return { __typename: "Group", id, name, url: `${FB}/groups/${vanity ?? id}/` };
}

export const PEOPLE = {
  alice: person({ id: "100010000000101", name: "Alice Kowalska", vanity: "alice.kowalska" }),
  bob: person({ id: "100010000000102", name: "Bob Example", vanity: "bob.example" }),
  carol: person({ id: "100010000000103", name: "Carol Nowak", vanity: "carol.nowak" }),
  dave: person({ id: "100010000000104", name: "Dave Stranger", vanity: "dave.stranger" }),
  erin: person({ id: "100010000000105", name: "Erin Lis", vanity: "erin.lis" }),
  pizza: page({ id: "100050000000201", name: "Pizza Place", vanity: "pizzaplace" }),
  news: page({ id: "100050000000202", name: "Daily Gazette", vanity: "dailygazette" }),
  hikers: group({ id: "300000000000301", name: "Tatra Hikers", vanity: "tatrahikers" }),
  bakers: group({ id: "300000000000302", name: "Sourdough Bakers" }),
};

// ---------------------------------------------------------------------------------------------
// Text entities (offsets are UTF-16 indices, computed from the text)

export const userEntity = (p) => ({ __typename: p.__typename, __isEntity: p.__typename, id: p.id, url: p.url, profile_url: p.url, __isNode: p.__typename });
export const hashtagEntity = (tag) => ({ __typename: "Hashtag", __isEntity: "Hashtag", url: `${FB}/hashtag/${tag}?__eep__=6&__cft__[0]=AZfxhashtag&__tn__=*NK-R` });
export function linkEntity(url) {
  const fbclid = `IwAR0fx${sha256Hex(url).slice(0, 16)}`;
  return {
    __typename: "ExternalUrl",
    __isEntity: "ExternalUrl",
    url: linkShim(url),
    external_url: url,
    __isWebLinkable: "ExternalUrl",
    web_link: { __typename: "ExternalWebLink", url: `${url}${url.includes("?") ? "&" : "?"}fbclid=${fbclid}`, fbclid, lynx_mode: "ASYNCLAZY" },
    mobileUrl: linkShim(url).replace("//l.", "//lm."),
    __isNode: "ExternalUrl",
    id: `fxurl${sha256Hex(url).slice(0, 12)}`,
  };
}

/** Message object with ranges found by searching `text` for each {match, entity}. */
export function message(text, mentions = []) {
  const ranges = mentions.map(({ match, entity }) => {
    const offset = text.indexOf(match);
    if (offset < 0) throw new Error(`fixture: "${match}" not in text`);
    return { entity, entity_is_weak_reference: false, length: match.length, offset };
  });
  return { delight_ranges: [], image_ranges: [], inline_style_ranges: [], aggregated_ranges: [], ranges, color_ranges: [], text };
}

// ---------------------------------------------------------------------------------------------
// GHL decoys: ad-looking data Facebook puts on organic stories to poison detectors

const ghlTree = (letters) => ({
  attributes: [],
  styles: [{ name: "display", val: "flex" }, { name: "order", val: "0" }],
  text: null,
  tag: "span",
  children: [...letters].map((ch, i) => ({
    attributes: [{ name: "Ridge", val: "fx" }, { name: "Stone", val: "k1pLES" }],
    styles: [{ name: "position", val: i % 2 ? "absolute" : "relative" }, { name: "order", val: String(i) }],
    text: ch,
    tag: "span",
    children: [],
  })),
});

function mockedFooter(seed) {
  return {
    __typename: "CometStoryAttachmentFooterGHLMockedGenericShareStrategy",
    attachment: {
      ghl_mocked_footer_info: {
        headline: "Shop now",
        footer_body: "Limited offer",
        link: `https://l.facebook.com/l.php?u=fx${sha256Hex(seed).slice(0, 40)}&h=AT0fxmock`,
        meta: "shop.example.invalid",
        cta_button: ghlTree("Sponsored"),
      },
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Attachments (styles.attachment carries the data; copies also sit in node.attachments)

export function photoMedia({ id, width = 960, height = 720, alt = "May be an image of mountains" }) {
  const shown = { width: Math.min(width, 526), height: Math.round((height * Math.min(width, 526)) / width) };
  return {
    __typename: "Photo",
    __isMedia: "Photo",
    accent_color: "FF6A8CAF",
    viewer_image: { height, width },
    photo_product_tags: [],
    focus: { x: 0.5, y: 0.5 },
    photo_image: { uri: cdnImage(`ph${id}`, shown.width), ...shown },
    accessibility_caption: alt,
    url: `${FB}/photo/?fbid=${id}&set=a.${id}0`,
    id,
    __isNode: "Photo",
  };
}

export function photoAttachment({ id, width, height, alt, decoy = true }) {
  return {
    deduplication_key: sha256Hex(`att${id}`).slice(0, 32),
    target: { __typename: "Photo", id },
    __typename: "StoryAttachment",
    style_list: ["photo", "fallback"],
    styles: section("StoryAttachmentPhotoStyleRenderer", {
      __isStoryAttachmentStyleRendererUnion: "StoryAttachmentPhotoStyleRenderer",
      attachment: { media: photoMedia({ id, width, height, alt }) },
    }),
    throwbackStyles: null,
    comet_footer_renderer: decoy ? mockedFooter(`photo${id}`) : null,
    media: { __typename: "Photo", __isNode: "Photo", id },
    all_subattachments: { nodes: [] },
  };
}

export function albumAttachment({ id, photoIds, count = photoIds.length, setToken }) {
  const nodes = photoIds.map((pid, i) => ({
    deduplication_key: sha256Hex(`sub${pid}`).slice(0, 32),
    media: {
      __typename: i === photoIds.length - 1 ? "Video" : "Photo",
      is_playable: i === photoIds.length - 1,
      image: { uri: cdnImage(`al${pid}`, 590), height: 443, width: 590 },
      viewer_image: { height: 1440, width: 1920, uri: cdnImage(`alv${pid}`, 1920) },
      id: pid,
      __isMedia: "Photo",
      accessibility_caption: `Album photo ${i + 1}`,
      focus: { x: 0.5, y: 0.33 },
      __isNode: "Photo",
    },
    url: `${FB}/photo.php?fbid=${pid}&set=pcb.${id}&type=3`,
  }));
  return {
    deduplication_key: sha256Hex(`album${id}`).slice(0, 32),
    target: { __typename: "MediaContainerMediaSet", id: b64(`mediaset:pcb.${id}`) },
    __typename: "StoryAttachment",
    style_list: ["album", "fallback"],
    styles: section("StoryAttachmentAlbumStyleRenderer", {
      __isStoryAttachmentStyleRendererUnion: "StoryAttachmentAlbumStyleRenderer",
      attachment: {
        mediaset_token: setToken ?? `pcb.${id}`,
        url: `${FB}/media/set/?set=pcb.${id}&type=1`,
        all_subattachments: { count, nodes },
        comet_product_tag_feed_overlay_renderer: null,
      },
    }),
    throwbackStyles: null,
    comet_footer_renderer: mockedFooter(`album${id}`),
    media: { __typename: "Photo", __isNode: "Photo", id: photoIds[0] },
    all_subattachments: { nodes: photoIds.map((pid) => ({ media: { __typename: "Photo", __isNode: "Photo", id: pid } })) },
  };
}

export function videoMedia({ id, width = 1280, height = 720, seconds = 95, live = false, legacy = false }) {
  const mp4 = (q) => `https://video.xx.fbcdn.net/o1/v/t2/f2/m69/fx${id}_${q}.mp4?efg=fx&_nc_cat=1&oh=00_fx${id}&oe=6A1B2C3D`;
  return {
    __typename: "Video",
    id,
    width,
    height,
    is_live_streaming: live,
    permalink_url: `${FB}/watch/?v=${id}`,
    length_in_second: seconds,
    videoDeliveryLegacyFields: legacy ? { playable_url: mp4("sd"), playable_url_quality_hd: mp4("hd") } : null,
    videoDeliveryResponseFragment: legacy
      ? null
      : {
          videoDeliveryResponseResult: {
            dash_manifest_urls: [{ manifest_url: `${FB}/dash_mpd_fx?v=${id}&dummy=.mpd`, failure_reason: null }],
            progressive_urls: [
              { progressive_url: mp4("sd"), failure_reason: null, metadata: { quality: "SD" } },
              { progressive_url: mp4("hd"), failure_reason: null, metadata: { quality: "HD" } },
            ],
            hls_playlist_urls: [{ hls_playlist_url: null, failure_reason: { type: "NotEligibleForHls", message_format: "", message_params: [] } }],
            id,
          },
          id,
        },
    preferred_thumbnail: { image: { uri: cdnImage(`vt${id}`, 720) }, image_preview_payload: null, id: `th${id}` },
    image: { uri: cdnImage(`vi${id}`, 320) },
    __isNode: "Video",
  };
}

export function videoAttachment(spec) {
  return {
    deduplication_key: sha256Hex(`video${spec.id}`).slice(0, 32),
    target: { __typename: "Video", id: spec.id },
    __typename: "StoryAttachment",
    style_list: ["video_inline", "video", "fallback"],
    styles: section("StoryAttachmentVideoStyleRenderer", {
      __isStoryAttachmentStyleRendererUnion: "StoryAttachmentVideoStyleRenderer",
      attachment: { media: videoMedia(spec), url: `${FB}/watch/?v=${spec.id}` },
    }),
    comet_footer_renderer: null,
    media: { __typename: "Video", __isNode: "Video", id: spec.id },
  };
}

export function linkAttachment({ url, title, description, source, imageId = "lnk1" }) {
  const shimmed = linkShim(url);
  return {
    deduplication_key: sha256Hex(`link${url}`).slice(0, 32),
    target: { __typename: "ExternalUrl", external_url: url, id: `fxext${sha256Hex(url).slice(0, 10)}` },
    __typename: "StoryAttachment",
    style_list: ["share", "fallback"],
    styles: section("StoryAttachmentShareStyleRenderer", {
      __isStoryAttachmentStyleRendererUnion: "StoryAttachmentShareStyleRenderer",
      attachment: {
        url: shimmed,
        title_with_entities: { text: title },
        description: { text: description },
        source: { text: source },
        media: {
          __typename: "GenericAttachmentMedia",
          large_share_image: { uri: cdnImage(imageId, 500), height: 261, width: 500 },
          image: { uri: cdnImage(`${imageId}s`, 130), height: 130, width: 130 },
          id: `fxmedia${imageId}`,
        },
        story_attachment_link_renderer: {
          __typename: "StoryAttachmentGenericLinkRenderer",
          attachment: { web_link: linkEntity(url).web_link, url: shimmed },
        },
      },
    }),
    comet_footer_renderer: mockedFooter(`link${url}`),
    media: { __typename: "GenericAttachmentMedia", id: `fxmedia${imageId}` },
  };
}

export function eventAttachment({ id, name, when }) {
  const url = `${FB}/events/${id}/?__cft__[0]=AZfxevent&__tn__=-R`;
  return {
    deduplication_key: sha256Hex(`event${id}`).slice(0, 32),
    target: { __typename: "Event", id, url },
    __typename: "StoryAttachment",
    style_list: ["event", "fallback"],
    styles: section("StoryAttachmentEventStyleRenderer", {
      attachment: { url, title_with_entities: { text: name }, description: { text: when }, event: { __typename: "Event", id, name, url, capitalized_day_time_sentence: when } },
    }),
    media: null,
  };
}

export function unavailableAttachment() {
  return {
    __typename: "StoryAttachment",
    style_list: ["unavailable"],
    styles: section("StoryAttachmentUnavailableStyleRenderer", { attachment: { title_with_entities: { text: "This content isn't available right now" } } }),
    media: null,
  };
}

// ---------------------------------------------------------------------------------------------
// Stories

const storyNodeId = (actorId, postId) => b64(`S:_I${actorId}:${postId}`);
const feedbackId = (postId) => b64(`feedback:${postId}`);
const tracking = (postId) => `AZfx_${postId}_encrypted_tracking`;

function picture(p, size, withSize = true) {
  const uri = cdnImage(`pp${p.id}`, size);
  return withSize ? { uri, width: size, height: size, scale: 1 } : { uri };
}

const actorRef = (p) => ({ __typename: p.__typename, name: p.name, id: p.id, __isActor: p.__typename, __isEntity: p.__typename, url: p.url, work_foreign_entity_info: null, work_info: null });
const ownerRef = (p) => ({ __typename: p.__typename, name: p.name, short_name: p.shortName, id: p.id });
const groupRef = (g) => ({ __typename: "Group", __isActor: "Group", id: g.id, __isEntity: "Group", url: g.url, work_foreign_entity_info: null, is_multi_company_group: false, work_official_status: "UNOFFICIAL", name: g.name });

/**
 * One feed Story node. spec: {postId, time, actor, to?, text?, mentions?, title?, attachments?, shared?
 * (a built story to re-share), feedback?: {reactions, comments, shares, viewerReaction, canComment, top,
 * layout: "direct"|"renderers"}, audience?, ai?, follow?, join?, unconnected?, recommended?,
 * sponsored?: {key, at?: "node"|"content", typename?}, sponsoredLabel?, decoys?}
 */
export function buildStory(spec) {
  const { postId, time = T0, actor, to = null, attachments = [], shared = null } = spec;
  const isGroup = to?.__typename === "Group";
  const id = storyNodeId(actor.id, postId);
  const url = isGroup ? `${to.url}posts/${postId}/` : `${actor.url}/posts/${postId}`;
  const msg = spec.text != null ? message(spec.text, spec.mentions) : null;
  const sponsoredData = spec.sponsored ? { __typename: spec.sponsored.typename ?? "SponsoredData", lbl_adv_iden: `6${postId}`, client_token: `fxct${postId}`, brs_filter_setting: null } : null;
  const nodeSponsored = spec.sponsored && (spec.sponsored.at ?? "node") === "node" ? sponsoredData : null;

  const content = {
    feedback: { id: feedbackId(postId) },
    comet_sections: {
      above_message: null,
      attached_story: null,
      message: msg
        ? section(spec.text.length < 80 && !attachments.length ? "CometFeedStoryLargeMessageRenderingStrategy" : "CometFeedStoryDefaultMessageRenderingStrategy", {
            story: { is_text_only_story: !attachments.length, message: msg, id, url },
          })
        : null,
      message_container: msg ? section("CometFeedStoryMessageContainerRenderingStrategy", { story: { message: { text: spec.text }, attachments: [], comet_sections: { message: null }, id } }) : null,
      message_sticker: null,
    },
    encrypted_tracking: tracking(postId),
    attachments,
    th_dat_spo: nodeSponsored,
    post_id: postId,
    actors: [{ profile_picture: picture(actor, 40, false), __typename: actor.__typename, id: actor.id, name: actor.name, __isEntity: actor.__typename, url: actor.url }],
    message: msg ? { __typename: "TextWithEntities", text: spec.text } : null,
    ghl_mocked_encrypted_link: `https://l.facebook.com/l.php?u=fx${sha256Hex(`mock${postId}`).slice(0, 48)}&h=AT0fxmock`,
    ghl_label_mocked_cta_button: spec.decoys ? ghlTree("Learn more") : null,
    wwwURL: url,
    target_group: isGroup ? { id: to.id } : null,
    attached_story: null,
    id,
  };
  if (spec.sponsored?.at === "content") content[spec.sponsored.key] = sponsoredData;
  if (spec.decoys) {
    // ghl_mocked_* and *GHLMocked* data must never count as a signal, whatever it contains.
    content.ghl_mocked_sponsored_data = { __typename: "SponsoredData", lbl_adv_iden: "0" };
    content.comet_footer_renderer = { ...mockedFooter(`text${postId}`), label: section("CometStorySponsoredLabelStrategy", {}) };
  }

  const node = {
    __typename: "Story",
    th_dat_spo: nodeSponsored,
    __isNode: "Story",
    id,
    __isFeedUnit: "Story",
    post_id: postId,
    feedback: { associated_group: isGroup ? { context_actor_hovercard: "GROUP", id: to.id } : null, id: feedbackId(postId), owning_profile: ownerRef(actor) },
    is_story_civic: null,
    cache_id: String(Number(postId) % 1000000007),
    creation_time: time,
    attachments: attachments.map(({ media, styles }) => ({ media, styles })),
    attached_story: null,
    comet_sections: {
      __typename: "CometStorySections",
      content: section("CometFeedStoryDefaultContentStrategy", { story: content }),
      layout: section("CometStoryDefaultLayoutStrategy", {}),
      context_layout: section("CometFeedStoryDefaultContextLayoutStrategy", { story: header(spec, id, url, isGroup) }),
      feedback: ufiSection(spec, id, url, isGroup),
      timestamp: section("CometFeedStoryLongerTimestampStrategy", {
        override_url: isGroup ? `${FB}/groups/${to.id}/?multi_permalinks=${postId}&hoisted_section_header_type=recently_seen` : null,
        story: { creation_time: time, url: `${url}?__cft__[0]=AZfx${postId}&__tn__=%2CO%2CP-R`, ghl_label: ghlTree("2h"), id },
      }),
    },
    encrypted_tracking: tracking(postId),
    permalink_url: url,
    actors: [actorRef(actor)],
    to: to ? (isGroup ? groupRef(to) : actorRef(to)) : null,
  };
  if (nodeSponsored && spec.sponsored.key !== "th_dat_spo") {
    node.th_dat_spo = null;
    content.th_dat_spo = null;
    node[spec.sponsored.key] = nodeSponsored;
  }
  if (shared) attachShared(node, shared);
  return node;
}

function header(spec, id, url, isGroup) {
  const { actor, to, postId, time = T0 } = spec;
  const metadata = [
    section("CometFeedStoryLongerTimestampStrategy", { override_url: null, story: { creation_time: time, url, ghl_label: ghlTree("2h"), id } }),
    section("CometFeedStoryAudienceStrategy", { story: { privacy_scope: { icon_image: { name: "friends" }, description: spec.audience ?? "Friends" }, id } }),
  ];
  if (isGroup) metadata.unshift(section("CometStoryCommunityAttributionGroupPostByStrategy", { story: { actors: [actorRef(actor)], to: { __typename: "Group", id: to.id }, id } }));
  if (spec.ai) {
    metadata.push(
      section("CometFeedStoryGenAIContentTransparencyStrategy", {
        ai_generated_detected_info: { gen_ai_transparency_type: "PROVENANCE_DETECTED_CREATED", ai_character_owner: null },
        was_self_disclosed_as_ai_generated: false,
        was_detected_as_ai_generated: true,
        story: { id, post_id: postId, sponsored_data: null },
      }),
    );
  }
  if (spec.sponsoredLabel) metadata.push(section("CometStorySponsoredLabelStrategy", { story: { id } }));
  return {
    id,
    unconnected_waist_data: spec.unconnected ? { serialized_ranking_info: '{"primary_generator":9077,"trigger_id":1428019,"all_generators":[9077]}' } : null,
    can_viewer_see_menu: true,
    actors: [{ __typename: actor.__typename, name: actor.name, id: actor.id }],
    comet_sections: {
      actor_photo: section(isGroup ? "CometFeedStoryActorCommunityAttributionStrategy" : "CometFeedStoryActorPhotoStrategy", {
        story: {
          actors: [{ ...actorRef(actor), profile_url: actor.url, story_bucket: { nodes: [] }, profile_picture: picture(actor, isGroup ? 24 : 40) }],
          comet_sections: { action_link: null },
          to: isGroup ? { __typename: "Group", id: to.id, name: to.name, profile_picture: { uri: cdnImage(`gp${to.id}`, 40) } } : undefined,
          th_dat_spo: null,
          id,
        },
      }),
      metadata,
      title: isGroup ? groupTitle(spec, id) : actorTitle(spec, id),
    },
    encrypted_tracking: tracking(postId),
  };
}

function actorTitle(spec, id) {
  const { actor, postId } = spec;
  const follow = spec.follow
    ? section("CometFeedStoryFollowButtonStrategy", {
        story: { id, action_links: [{ __typename: "FollowProfileActionLink", should_show_follow_back: false, profile: { __typename: actor.__typename, id: actor.id, subscribe_status: "CAN_SUBSCRIBE" }, follow_location: "IFR_POST_IN_NEWS_FEED" }], post_id: postId },
      })
    : null;
  return section("CometFeedStoryTitleWithActorStrategy", {
    story: {
      id,
      post_id: postId,
      actors: [actorRef(actor)],
      collaborators: [],
      title: spec.title ? message(spec.title, [{ match: actor.name, entity: userEntity(actor) }]) : null,
      comet_sections: { action_link: null, follow_button: follow, badge: null },
      recommendation_context: spec.recommended ? { __typename: "ExploreRecommendationContext" } : null,
      to: spec.to && spec.to.__typename !== "Group" ? actorRef(spec.to) : null,
    },
  });
}

function groupTitle(spec, id) {
  const { to } = spec;
  return section("CometFeedStoryCommunityAttributionTitleStrategy", {
    story: { recommendation_context: spec.recommended ? { __typename: "ExploreRecommendationContext" } : null, to: { ...groupRef(to), should_denudge_group_join_ctas: false }, id },
    if_viewer_can_join_group: spec.join
      ? {
          join_action: { __typename: "GroupJoinForumAction", group: { id: to.id, viewer_forum_join_state: "CAN_JOIN", name: to.name, action_intervention_view_model: null } },
          id: to.id,
        }
      : null,
  });
}

function ufiSection(spec, id, url, isGroup) {
  const { postId, actor, to } = spec;
  const fb = { reactions: 0, comments: 0, shares: 0, viewerReaction: null, canComment: true, top: [], layout: "direct", ...spec.feedback };
  const fid = feedbackId(postId);
  const top = { edges: fb.top.map(([rid, n]) => ({ visible_in_bling_bar: true, node: { id: rid, localized_name: "Like" }, i18n_reaction_count: String(n), reaction_count: n })) };
  const viewerInfo = fb.viewerReaction ? { id: fb.viewerReaction, reaction_type: "LIKE" } : null;
  const summary =
    fb.layout === "renderers"
      ? {
          id: fid,
          subscription_target_id: postId,
          adaptive_ufi_action_renderers: [
            { __typename: "UFIStoryReactActionRenderer", feedback: { viewer_feedback_reaction_info: viewerInfo, supported_reaction_infos: [], id: fid, reaction_count: { count: fb.reactions } } },
            { __typename: "UFICommentActionRenderer", feedback: { id: fid, comment_rendering_instance: { comments: { total_count: fb.comments } } } },
            { __typename: "XFBUFIAdaptiveShareActionRenderer", feedback: { id: fid, share_count: { count: fb.shares } } },
          ],
          top_reactions: top,
        }
      : {
          id: fid,
          subscription_target_id: postId,
          reaction_count: { count: fb.reactions },
          i18n_reaction_count: String(fb.reactions),
          share_count: { count: fb.shares },
          i18n_share_count: String(fb.shares),
          viewer_feedback_reaction_info: viewerInfo,
          top_reactions: top,
        };
  const ftwc = {
    id: fid,
    owning_profile: ownerRef(actor),
    can_viewer_comment: fb.canComment,
    comet_ufi_summary_and_actions_renderer: { __typename: "DefaultModernCometUFISummaryAndActionsRenderer", feedback: summary },
    comment_rendering_instance: fb.layout === "renderers" ? null : { comments: { total_count: fb.comments } },
    url,
    __typename: "Feedback",
    viewer_actor: { __typename: "User", id: VIEWER.id },
    have_comments_been_disabled: false,
    associated_group: isGroup ? { feature_intervention: null, id: to.id } : null,
    comments_disabled_notice_renderer: { __typename: "GeneralCommentDisableNotice", notice_message: { ranges: [], text: "Comments on this post have been limited." } },
  };
  return section(isGroup ? "CometStoryFeedbackGroupContextualProfileUFIStrategy" : "CometStoryFeedbackUFIStrategy", {
    story: {
      feedback: { id: fid },
      story_ufi_container: {
        __typename: "XFBSimplifiedUFIContainer",
        story: {
          encrypted_tracking: tracking(postId),
          feedback_context: { feedback_target_with_context: ftwc, interesting_top_level_comments: [] },
          id,
          permalink_url: url,
          url,
          post_id: postId,
          tracking: `{"qid":"fx","mf_story_key":"${postId}"}`,
          th_dat_spo: null,
          target_group: isGroup ? { id: to.id, visibility: "OPEN", privacy_info: { description: { text: "Public group" } } } : null,
          message: spec.text != null ? { text: spec.text } : null,
          actors: [{ __typename: actor.__typename, name: actor.name, id: actor.id }],
        },
      },
      id,
    },
  });
}

/** Re-share: the shared post travels as three partial copies, exactly as in the 2026-10 capture. */
function attachShared(node, original) {
  const sections = original.comet_sections;
  const content = sections.content.story;
  const header = sections.context_layout.story;
  node.attached_story = {
    id: original.id,
    should_host_actor_link_in_watch: false,
    comet_sections: { context_layout: sections.context_layout, footer: null },
    encrypted_tracking: original.encrypted_tracking,
    permalink_url: original.permalink_url,
    feedback: original.feedback,
  };
  node.comet_sections.content.story.attached_story = {
    actors: content.actors,
    id: original.id,
    comet_sections: { message: content.comet_sections.message, message_container: content.comet_sections.message_container, attached_story: null },
    encrypted_tracking: original.encrypted_tracking,
    attachments: content.attachments,
    post_id: original.post_id,
    message: content.message,
    ghl_mocked_encrypted_link: content.ghl_mocked_encrypted_link,
    wwwURL: content.wwwURL,
    target_group: content.target_group,
    attached_story: null,
  };
  node.comet_sections.content.story.comet_sections.attached_story = section("CometStoryAttachedStoryStrategy", {
    story: {
      attached_story: {
        id: original.id,
        encrypted_tracking: original.encrypted_tracking,
        comet_sections: {
          attached_story_layout: section("CometStoryAttachedStoryInvertedLayoutStrategy", {
            story: {
              comet_sections: {
                metadata: header.comet_sections.metadata,
                title: header.comet_sections.title,
                actor_photo: header.comet_sections.actor_photo,
                message: content.comet_sections.message,
                message_container: content.comet_sections.message_container,
              },
              attachments: content.attachments,
              sponsored_data: null,
              message: content.message && { text: content.message.text },
              id: original.id,
            },
          }),
        },
        attached_story: null,
      },
      id: node.id,
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Non-story feed units

export function showcaseUnit({ id = "fxshowcase1", videoIds = ["700000000000001", "700000000000002"] } = {}) {
  return {
    __typename: "ShowcaseFeedUnit",
    __isNode: "ShowcaseFeedUnit",
    id,
    __isFeedUnit: "ShowcaseFeedUnit",
    showcase_story_type: "SHOWCASE_SHORT_VIDEO",
    showcase_item: videoIds.map((vid, i) => ({
      attachment: {
        __typename: "ShowcaseShortVideoAttachment",
        story: { id: b64(`S:_I0:${vid}`), post_id: String(800000000000000 + i), attachments: [{ media: { ...videoMedia({ id: vid, width: 720, height: 1280, seconds: 15 }), permalink_url: `${FB}/reel/${vid}/` } }] },
      },
    })),
  };
}

export function pymkUnit({ id = "fxpymk1" } = {}) {
  return {
    __typename: "PaginatedPeopleYouMayKnowFeedUnit",
    __isNode: "PaginatedPeopleYouMayKnowFeedUnit",
    id,
    __isFeedUnit: "PaginatedPeopleYouMayKnowFeedUnit",
    title: { text: "People You May Know" },
    all_users: { edges: [{ node: { __typename: "User", id: PEOPLE.dave.id, name: PEOPLE.dave.name, profile_picture: picture(PEOPLE.dave, 100) } }] },
  };
}

// ---------------------------------------------------------------------------------------------
// Edges, responses, SSR blocks

/** Feed edge around a node. category: name for cat_sensitive.cat; enc: number to hash (defaults to ORGANIC for stories). */
export function buildEdge(node, { cursor = `fxcursor-${node?.post_id ?? node?.id}`, category = null, enc, auction = null, plainCategory } = {}) {
  const postId = node?.post_id;
  const n = enc === undefined ? (postId && !category ? CATEGORY.ORGANIC : null) : enc;
  const edge = {
    brs_content_label: 60,
    cat_sensitive: { enc: n != null && postId ? categoryHash(postId, n) : null, cat: category },
    deduplication_key: String(sha256Hex(`dedup${postId ?? node?.id}`).slice(0, 8)),
    min_gap_type_index_string: "14",
    sposnsor_new_distac_action: auction,
    top_story_cache_score: 0,
    is_ad_eligible_for_ad_pod: false,
    node,
    feed_backend_data: { qid: "fxqid", vsid: "fxvsid", vspos: 0 },
    cursor,
  };
  if (plainCategory) {
    delete edge.cat_sensitive;
    edge.category = plainCategory;
  }
  return edge;
}

const isEdge = (x) => x != null && typeof x === "object" && ("node" in x || "cursor" in x);

/**
 * Payload objects of one feed page: root line with edge 0, one @stream line per further edge, optional
 * @defer lines ({path, data, label}), then the page_info @defer line that ends the response.
 */
export function buildFeedPayloads({ stories = [], cursor = "fxend-cursor", hasNext = true, defers = [] } = {}) {
  const edges = stories.map((s) => (isEdge(s) ? s : buildEdge(s)));
  const lines = [{ data: { viewer: { news_feed: { edges: edges.slice(0, 1) } } }, extensions: { is_final: false } }];
  edges.slice(1).forEach((edge, i) => lines.push({ label: STREAM_LABEL, path: ["viewer", "news_feed", "edges", i + 1], data: edge, extensions: { is_final: false } }));
  for (const d of defers) lines.push({ label: d.label ?? "CometFeedStoryUFI$defer$fx", path: d.path, data: d.data, extensions: { is_final: false } });
  lines.push({ label: PAGE_INFO_LABEL, path: ["viewer", "news_feed"], data: { page_info: { __typename: "PageInfo", end_cursor: cursor, has_next_page: hasNext } }, extensions: { is_final: true } });
  return lines;
}

/** The JSON-lines body /api/graphql/ returns for a feed page. */
export function buildFeedResponse(opts) {
  return toJsonl(buildFeedPayloads(opts));
}

export const toJsonl = (payloads) => `${payloads.map((p) => JSON.stringify(p)).join("\n")}\n`;

/** data-sjs blocks (one <script type="application/json" data-sjs> each) carrying payloads as SSR stream-cache entries. */
export function buildSjsBlocks(payloads, { preloaderId = PRELOADER_ID } = {}) {
  return payloads.map((result, i) => ({
    require: [
      [
        "ScheduledServerJS",
        "handle",
        null,
        [
          {
            __bbox: {
              require: [
                [
                  i === 0 ? "RelayPrefetchedStreamCache" : "RelayPrefetchedStreamCache@4a1fb7054d45192b147ad69ff77e2f17",
                  "next",
                  [],
                  [preloaderId, { __bbox: { complete: i === payloads.length - 1, result, sequence_number: i } }],
                ],
              ],
            },
          },
        ],
      ],
    ],
  }));
}

/** The CometRootEntryPointRenderer.init block that names the feed preloader (queryID = doc_id, SSR variables). */
export function buildPreloaderBlock({ preloaderId = PRELOADER_ID, queryID = "28136951115834703", feedStyle = "DEFAULT", orderby = ["TOP_STORIES"] } = {}) {
  const variables = {
    RELAY_INCREMENTAL_DELIVERY: true,
    connectionClass: "EXCELLENT",
    feedbackSource: 1,
    feedInitialFetchSize: 4,
    feedLocation: "NEWSFEED",
    feedStyle,
    orderby,
    privacySelectorRenderLocation: "COMET_STREAM",
    recentVPVs: [],
    refreshMode: "COLD_START",
    renderLocation: "homepage_stream",
    scale: 1,
    shouldObfuscateCategoryField: true,
    useDefaultActor: false,
    __relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider: true,
    __relay_internal__pv__GHLShouldChangeSponsoredAuctionDistanceFieldNamerelayprovider: true,
    __relay_internal__pv__IsWorkUserrelayprovider: false,
  };
  return {
    require: [
      [
        "CometRootEntryPointRenderer",
        "init",
        ["CometHomeRoot.entrypoint", "RequireDeferredReference"],
        [{ actorID: VIEWER.id, elementId: "mount_0_0_fx", entryPointRoot: { otherProps: { routeProps: {}, routeParams: {} } }, preloaders: [{ actorID: VIEWER.id, preloaderID: preloaderId, queryID, variables, queryName: "CometModernHomeFeedQuery" }] }],
      ],
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Comments (CommentsListComponentsPaginationQuery: one JSON document)

export function buildComment({ id, author, text, mentions = [], time = T0, reactions = 0, replies = 0 }) {
  return {
    id: b64(`comment:${id}`),
    legacy_fbid: id,
    depth: 0,
    body: message(text, mentions),
    author: {
      __typename: author.__typename,
      id: author.id,
      name: author.name,
      __isActor: author.__typename,
      profile_picture_depth_0: { uri: cdnImage(`cp${author.id}`, 32) },
      profile_picture_depth_0_increased: { uri: cdnImage(`cpi${author.id}`, 40) },
      __isEntity: author.__typename,
      url: author.url,
    },
    feedback: { id: b64(`feedback:${id}`), replies_fields: { count: replies, total_count: replies }, reactors: { count_reduced: String(reactions) } },
    comment_action_links: [{ __typename: "XFBCommentThumbsUpReactionActionLink", comment: { id: b64(`comment:${id}`), feedback: { id: b64(`feedback:${id}`), viewer_feedback_reaction_info: null, reactors: { count: reactions, is_empty: reactions === 0 } } } }],
    created_time: time,
    __typename: "Comment",
  };
}

export function buildCommentsResponse({ feedbackId: fid, comments, cursor = "fxcomments-end", hasNext = false }) {
  return {
    data: {
      node: {
        __typename: "Feedback",
        id: fid,
        comment_rendering_instance_for_feed_location: {
          comments: { edges: comments.map((node, i) => ({ node, cursor: `fxc${i}` })), page_info: { end_cursor: cursor, has_next_page: hasNext } },
        },
      },
    },
    extensions: { is_final: true },
  };
}

// ---------------------------------------------------------------------------------------------
// The committed fixture set

const P = PEOPLE;
const at = (i) => T0 - i * 900;

export const STORIES = {
  friendText: () =>
    buildStory({
      postId: "9100000001",
      time: at(0),
      actor: P.alice,
      text: "Back from the lake 🏞️ with Bob Example! Dinner at Pizza Place #summer more: example.com/trip",
      mentions: [
        { match: "Bob Example", entity: userEntity(P.bob) },
        { match: "Pizza Place", entity: userEntity(P.pizza) },
        { match: "#summer", entity: hashtagEntity("summer") },
        { match: "example.com/trip", entity: linkEntity("https://example.com/trip") },
      ],
      feedback: { reactions: 12, comments: 3, shares: 1, viewerReaction: REACTION.LIKE, top: [[REACTION.LIKE, 10], [REACTION.LOVE, 2]], layout: "renderers" },
      audience: "Friends",
      decoys: true,
    }),
  friendPhoto: () =>
    buildStory({
      postId: "9100000002",
      time: at(1),
      actor: P.bob,
      text: "Morning view",
      attachments: [photoAttachment({ id: "5100000001", width: 1080, height: 810, alt: "May be an image of a lake" })],
      feedback: { reactions: 4, comments: 0, shares: 0, top: [[REACTION.LIKE, 4]] },
      audience: "Public",
    }),
  album: () =>
    buildStory({
      postId: "9100000003",
      time: at(2),
      actor: P.carol,
      text: "Wedding photos 💍",
      title: "Carol Nowak added 23 new photos to the album Wedding.",
      attachments: [albumAttachment({ id: "9100000003", photoIds: ["5100000011", "5100000012", "5100000013", "5100000014", "5100000015"], count: 23 })],
      feedback: { reactions: 40, comments: 9, shares: 0, top: [[REACTION.LOVE, 30], [REACTION.LIKE, 10]] },
    }),
  video: () =>
    buildStory({
      postId: "9100000004",
      time: at(3),
      actor: P.erin,
      text: "Our cat discovered the piano",
      attachments: [videoAttachment({ id: "6100000001", width: 1280, height: 720, seconds: 95 })],
      feedback: { reactions: 7, comments: 2, shares: 1, top: [[REACTION.HAHA, 7]], layout: "renderers" },
    }),
  linkShare: () =>
    buildStory({
      postId: "9100000005",
      time: at(4),
      actor: P.bob,
      text: "Worth reading",
      attachments: [linkAttachment({ url: "https://news.example.org/2026/10/article?id=7", title: "Mountain huts reopen for winter", description: "Twelve huts in the Tatras will stay open all season.", source: "news.example.org" })],
      feedback: { reactions: 2, comments: 1, shares: 0, top: [[REACTION.LIKE, 2]] },
    }),
  groupPost: () =>
    buildStory({
      postId: "9100000006",
      time: at(5),
      actor: P.carol,
      to: P.hikers,
      text: "Trail to Morskie Oko is icy, bring crampons.",
      feedback: { reactions: 15, comments: 6, shares: 2, top: [[REACTION.LIKE, 15]] },
      audience: "Public group",
    }),
  pagePost: () =>
    buildStory({
      postId: "9100000007",
      time: at(6),
      actor: P.pizza,
      text: "Two-for-one pizza every Tuesday this month!",
      attachments: [eventAttachment({ id: "7100000001", name: "Pizza Tuesday", when: "Tuesday, October 27, 2026 at 6 PM" })],
      feedback: { reactions: 88, comments: 14, shares: 5, top: [[REACTION.LIKE, 80], [REACTION.WOW, 8]], layout: "renderers" },
      audience: "Public",
    }),
  // A friend shares a Page's post. The Page's copy carries a Follow button and ranking data; they belong to
  // the shared post and must not make the friend's share a suggestion.
  shared: () =>
    buildStory({
      postId: "9100000008",
      time: at(7),
      actor: P.alice,
      text: "Ha! This is us every winter",
      shared: buildStory({
        postId: "9100000099",
        time: at(30),
        actor: P.news,
        text: "Ten signs winter has arrived in the mountains",
        attachments: [photoAttachment({ id: "5100000099", width: 800, height: 600, alt: "May be an image of snow" })],
        follow: true,
        unconnected: true,
        sponsoredLabel: true,
      }),
      feedback: { reactions: 3, comments: 0, shares: 0, top: [[REACTION.HAHA, 3]] },
    }),
  unavailable: () => buildStory({ postId: "9100000009", time: at(7) - 60, actor: P.erin, text: "Look at this", attachments: [unavailableAttachment()] }),
  sponsoredThDatSpo: () =>
    buildStory({ postId: "9100000010", time: at(8), actor: P.pizza, text: "Order now and get free delivery!", sponsored: { key: "th_dat_spo" }, attachments: [linkAttachment({ url: "https://shop.example.com/pizza", title: "Pizza Place delivery", description: "Hot in 30 minutes", source: "shop.example.com", imageId: "ad1" })] }),
  sponsoredRandomKey: () => buildStory({ postId: "9100000011", time: at(9), actor: P.news, text: "Subscribe for 1 zł", sponsored: { key: "qz_vb_dat_k9", at: "content" } }),
  sponsoredCategory: () => buildStory({ postId: "9100000012", time: at(10), actor: P.news, text: "Read without limits" }),
  followSuggestion: () => buildStory({ postId: "9100000013", time: at(11), actor: P.dave, text: "My hiking blog is live", follow: true }),
  joinSuggestion: () => buildStory({ postId: "9100000014", time: at(12), actor: P.dave, to: P.bakers, text: "First loaf of the season", join: true }),
  unconnected: () => buildStory({ postId: "9100000015", time: at(13), actor: P.dave, text: "Sunset at the coast", unconnected: true }),
  recommended: () => buildStory({ postId: "9100000016", time: at(14), actor: P.dave, to: P.bakers, text: "Rye starter tips", recommended: true }),
  aiLabel: () => buildStory({ postId: "9100000017", time: at(15), actor: P.erin, text: "Dreamy castle", ai: true, attachments: [photoAttachment({ id: "5100000017" })] }),
  sponsoredLabel: () => buildStory({ postId: "9100000018", time: at(16), actor: P.news, text: "Newsletter offer", sponsoredLabel: true }),
  auction: () => buildStory({ postId: "9100000019", time: at(17), actor: P.news, text: "Holiday sale" }),
  obfuscatedSponsored: () => buildStory({ postId: "9100000020", time: at(18), actor: P.pizza, text: "Lunch deal", sponsored: { key: "xk_r7_spd", typename: OBFUSCATED.sponsored } }),
};

export const OBFUSCATED = { sponsored: "Kp3mZ8qW1xRt5Ny", adsUnit: "Q4xN7zP9aLbM3vT" };
export const ENV = { ghlss: "b1pLEJ", q9k7m2x: [[OBFUSCATED.sponsored, "SponsoredData"], [OBFUSCATED.adsUnit, "AdsSideFeedUnit"]] };

const keep = { keep: true, reason: "keep" };
const dropped = (reason) => ({ keep: false, reason });

/** name -> {edges, expect[]} for the single-scenario files (one page each). */
function scenarios() {
  const S = STORIES;
  const one = (node, expect, edgeOpts) => ({ edges: [buildEdge(node, edgeOpts)], expect: [expect] });
  return {
    "organic-friend-text": one(S.friendText(), { ...keep, category: "ORGANIC" }),
    "friend-photo": one(S.friendPhoto(), { ...keep, category: "ORGANIC" }),
    album: one(S.album(), { ...keep, category: "ORGANIC" }),
    video: one(S.video(), { ...keep, category: "ORGANIC" }),
    "link-share": one(S.linkShare(), { ...keep, category: "ORGANIC" }),
    "group-post": one(S.groupPost(), { ...keep, category: "ORGANIC" }),
    "page-post": one(S.pagePost(), { ...keep, category: "ORGANIC" }),
    "shared-story": one(S.shared(), { ...keep, category: "ORGANIC" }),
    "unavailable-attachment": one(S.unavailable(), { ...keep, category: "ORGANIC" }),
    "sponsored-th_dat_spo": one(S.sponsoredThDatSpo(), dropped("sponsored-data"), { enc: CATEGORY.SPONSORED }),
    "sponsored-random-key": one(S.sponsoredRandomKey(), dropped("sponsored-data"), { enc: CATEGORY.SPONSORED }),
    "sponsored-cat-sensitive": one(S.sponsoredCategory(), { ...dropped("category:SPONSORED"), category: "SPONSORED" }, { enc: CATEGORY.SPONSORED }),
    "sponsored-label": one(S.sponsoredLabel(), dropped("sponsored-label")),
    "auction-distance": one(S.auction(), dropped("auction-distance"), { auction: 3 }),
    "reels-showcase": one(showcaseUnit(), dropped("unit:ShowcaseFeedUnit"), { category: "FB_SHORTS", enc: null }),
    pymk: one(pymkUnit(), dropped("unit:PaginatedPeopleYouMayKnowFeedUnit"), { enc: null }),
    "follow-suggestion": one(S.followSuggestion(), dropped("follow-suggestion")),
    "join-suggestion": one(S.joinSuggestion(), dropped("join-suggestion")),
    unconnected: one(S.unconnected(), dropped("unconnected")),
    recommended: one(S.recommended(), dropped("recommended")),
    "ai-label": one(S.aiLabel(), { ...keep, category: "ORGANIC", hideAI: dropped("ai") }),
    "obfuscated-typename": {
      edges: [buildEdge(S.obfuscatedSponsored()), buildEdge({ __typename: OBFUSCATED.adsUnit, id: "fxadsunit1" }, { enc: null })],
      expect: [dropped("sponsored-data"), dropped("unit:AdsSideFeedUnit")],
      env: "obfuscated-typename.env.json",
    },
  };
}

/** A full mixed page: stream lines, a deferred UFI section for edge 0, and the page_info line. */
function mixedPage() {
  const S = STORIES;
  const first = S.friendText();
  const deferredUfi = first.comet_sections.feedback;
  delete first.comet_sections.feedback;
  const edges = [
    buildEdge(first, { cursor: "fxm-0" }),
    buildEdge(S.friendPhoto(), { cursor: "fxm-1" }),
    buildEdge(S.sponsoredThDatSpo(), { cursor: "fxm-2", enc: CATEGORY.SPONSORED }),
    buildEdge(S.album(), { cursor: "fxm-3" }),
    buildEdge(pymkUnit(), { cursor: "fxm-4", enc: null }),
    buildEdge(S.groupPost(), { cursor: "fxm-5" }),
    buildEdge(showcaseUnit(), { cursor: "fxm-6", category: "FB_SHORTS", enc: null }),
    buildEdge(S.video(), { cursor: "fxm-7" }),
    buildEdge(S.followSuggestion(), { cursor: "fxm-8" }),
    buildEdge(S.linkShare(), { cursor: "fxm-9" }),
    buildEdge(S.sponsoredCategory(), { cursor: "fxm-10", enc: CATEGORY.SPONSORED }),
    buildEdge(S.pagePost(), { cursor: "fxm-11" }),
    buildEdge(S.shared(), { cursor: "fxm-12" }),
  ];
  const payloads = buildFeedPayloads({
    stories: edges,
    cursor: "fxmixed-page-2",
    hasNext: true,
    defers: [{ label: "CometFeedStoryFeedbackSection$defer$fx_ufi", path: ["viewer", "news_feed", "edges", 0, "node", "comet_sections"], data: { feedback: deferredUfi } }],
  });
  const expect = [
    { ...keep, category: "ORGANIC" },
    { ...keep, category: "ORGANIC" },
    dropped("sponsored-data"),
    { ...keep, category: "ORGANIC" },
    dropped("unit:PaginatedPeopleYouMayKnowFeedUnit"),
    { ...keep, category: "ORGANIC" },
    dropped("unit:ShowcaseFeedUnit"),
    { ...keep, category: "ORGANIC" },
    dropped("follow-suggestion"),
    { ...keep, category: "ORGANIC" },
    { ...dropped("category:SPONSORED"), category: "SPONSORED" },
    { ...keep, category: "ORGANIC" },
    { ...keep, category: "ORGANIC" },
  ];
  return { payloads, expect };
}

const comment = (id, author, text, extra) => buildComment({ id, author, text, ...extra });

/** Builds every fixture: [{file, content}] plus the manifest describing what each file must produce. */
export function buildFixtureFiles() {
  const files = [];
  const manifest = [];
  for (const [name, s] of Object.entries(scenarios())) {
    const file = `${name}.jsonl`;
    files.push({ file, content: buildFeedResponse({ stories: s.edges, cursor: `fxend-${name}`, hasNext: true }) });
    manifest.push({ file, kind: "feed", env: s.env ?? null, expect: s.expect });
  }
  files.push({ file: "obfuscated-typename.env.json", content: `${JSON.stringify(ENV, null, 2)}\n` });

  const mixed = mixedPage();
  files.push({ file: "feed-page-1.jsonl", content: toJsonl(mixed.payloads) });
  manifest.push({ file: "feed-page-1.jsonl", kind: "feed", env: null, expect: mixed.expect });

  const lastPage = [buildEdge(buildStory({ postId: "9100000030", time: at(40), actor: P.carol, text: "Throwback to last summer" }), { cursor: "fxl-0" })];
  files.push({ file: "feed-page-2.jsonl", content: buildFeedResponse({ stories: lastPage, cursor: "fxmixed-page-3", hasNext: false }) });
  manifest.push({ file: "feed-page-2.jsonl", kind: "feed", env: null, expect: [{ ...keep, category: "ORGANIC" }] });

  const sjs = [buildPreloaderBlock(), ...buildSjsBlocks(mixed.payloads)];
  files.push({ file: "ssr-home.sjs.jsonl", content: toJsonl(sjs) });
  manifest.push({ file: "ssr-home.sjs.jsonl", kind: "sjs", env: null, preloaderId: PRELOADER_ID, sameAs: "feed-page-1.jsonl", expect: mixed.expect });

  const comments = buildCommentsResponse({
    feedbackId: b64("feedback:9100000001"),
    comments: [
      comment("6600000001", P.bob, "Looks amazing! 😍", { time: at(0) + 300, reactions: 2, replies: 1 }),
      comment("6600000002", P.carol, "Say hi to Alice Kowalska from me", { time: at(0) + 600, mentions: [{ match: "Alice Kowalska", entity: userEntity(P.alice) }] }),
    ],
  });
  files.push({ file: "comments.json", content: `${JSON.stringify(comments, null, 2)}\n` });
  manifest.push({ file: "comments.json", kind: "comments", env: null, expect: [] });

  files.push({ file: "manifest.json", content: `${JSON.stringify(manifest, null, 2)}\n` });
  return files;
}

export const FIXTURE_DIR = path.dirname(fileURLToPath(import.meta.url));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = buildFixtureFiles();
  for (const { file, content } of files) writeFileSync(path.join(FIXTURE_DIR, file), content);
  console.log(`wrote ${files.length} fixture files to ${FIXTURE_DIR}`);
}
