// 2026 Comet GraphQL shapes for the fake world, modelled on the real trimmed captures in the research samples
// (graphql-protocol.md §3-§7): feed edges with cat_sensitive / th_dat_spo / sposnsor_new_distac_action, Story
// nodes with comet_sections (content, context_layout, feedback, timestamp), junk edges, Relay JSON lines,
// comments and mutation echoes.

import { createHash } from "node:crypto";
import { b64, sha256hex } from "./world.mjs";
import { imageUrl, videoUrl } from "./images.mjs";

export const REACTIONS = Object.freeze({ LIKE: "1635855486666999", LOVE: "1678524932434102", CARE: "613557422527858", HAHA: "115940658764963", WOW: "478547315650144", SAD: "908563459236466", ANGRY: "444813342392137" });
const REACTION_NAMES = { [REACTIONS.LIKE]: "Like", [REACTIONS.LOVE]: "Love", [REACTIONS.CARE]: "Care", [REACTIONS.HAHA]: "Haha", [REACTIONS.WOW]: "Wow", [REACTIONS.SAD]: "Sad", [REACTIONS.ANGRY]: "Angry" };

/** FeedStoryCategory (graphql-protocol §6.1). */
export const CATEGORY = Object.freeze({ ORGANIC: 1, ENGAGEMENT: 2, PROMOTION: 4, SPONSORED: 5, FB_SHORTS: 11, MULTI_FB_STORIES_TRAY: 14 });

/** Env.q9k7m2x typename-restore pairs [obfuscated, real] (graphql-protocol §8.4). */
export const TYPENAME_PAIRS = Object.freeze([
  ["Q4xN7zP9aLbM3vT", "AdsSideFeedUnit"],
  ["Kx7Rq2mZp9TnLw4", "SponsoredData"],
]);
const OBFUSCATED_SPONSORED_DATA = TYPENAME_PAIRS[1][0];

export const STREAM_LABEL = "CometNewsFeed_viewerConnection$stream$CometNewsFeed_viewer_news_feed";
export const PAGE_INFO_LABEL = "CometNewsFeed_viewerConnection$defer$CometNewsFeed_viewer_news_feed$page_info";

const hex = (s, n = 40) => createHash("sha1").update(String(s)).digest("hex").slice(0, n);
const b64url = (s) => Buffer.from(String(s)).toString("base64url");
/** An opaque "AZ…" blob like Facebook's encrypted tracking and __cft__ tokens. */
const blob = (seed, len = 180) => `AZ${b64url(createHash("sha512").update(String(seed)).digest()).repeat(4)}`.slice(0, len);

/** cat_sensitive.enc = sha256hex(sha256hex(post_id) + n) (graphql-protocol §6.2). */
export const catEnc = (postId, n) => sha256hex(sha256hex(String(postId)) + String(n));

const section = (typename, body) => ({ __typename: typename, __isICometStorySection: typename, is_prod_eligible: true, ...body });
const moduleRef = (name) => ({ __dr: `${name}$normalization.graphql` });

function actorRef(a) {
  return { __typename: a.type, name: a.name, id: a.id, __isActor: a.type, __isEntity: a.type, url: a.url, work_foreign_entity_info: null, work_info: null };
}

function picture(a, size, scale) {
  return { uri: imageUrl(a.type === "User" ? "avatar" : "logo", a.id, size * scale), width: size, height: size, scale };
}

function groupRef(g) {
  return { __typename: "Group", __isActor: "Group", id: g.id, __isEntity: "Group", url: g.url, work_foreign_entity_info: null, is_multi_company_group: false, work_official_status: "UNOFFICIAL", name: g.name };
}

/** Ranges for "{mention}" names, #hashtags and URLs, with UTF-16 offsets (graphql-protocol §5.3). */
export function messageRanges(text, mentions = []) {
  const ranges = [];
  for (const m of mentions) {
    const offset = text.indexOf(m.name);
    if (offset >= 0) ranges.push({ offset, length: m.name.length, entity: { __typename: "User", __isEntity: "User", id: m.id, url: m.url, profile_url: m.url }, entity_is_weak_reference: false });
  }
  for (const m of text.matchAll(/#(\w+)/gu)) {
    ranges.push({ offset: m.index, length: m[0].length, entity: { __typename: "Hashtag", __isEntity: "Hashtag", url: `https://www.facebook.com/hashtag/${m[1]}?__eep__=6&__cft__[0]=${blob(m[0], 60)}&__tn__=*NK-R` }, entity_is_weak_reference: false });
  }
  for (const m of text.matchAll(/https?:\/\/\S+/g)) {
    const target = m[0];
    ranges.push({
      offset: m.index,
      length: target.length,
      entity: {
        __typename: "ExternalUrl",
        __isEntity: "ExternalUrl",
        url: `https://l.facebook.com/l.php?u=${encodeURIComponent(target)}&h=AT${hex(target, 30)}`,
        external_url: target,
        web_link: { __typename: "ExternalWebLink", url: `${target}?fbclid=IwZXh0bgNhZW0CMTAAAR${hex(target, 20)}`, fbclid: `IwZXh0bgNhZW0CMTAAAR${hex(target, 20)}` },
      },
      entity_is_weak_reference: false,
    });
  }
  return ranges.sort((a, b) => a.offset - b.offset);
}

const textWithEntities = (text, ranges = []) => ({ delight_ranges: [], image_ranges: [], inline_style_ranges: [], aggregated_ranges: [], ranges, color_ranges: [], text });

/** The ghl_label pseudo-DOM (timestamp label) with off-screen decoy letters spelling an ad word (§8.5). */
function ghlLabel(seed) {
  const decoy = (ch, order) => ({ tag: "span", text: ch, attributes: [{ name: "data-x", val: hex(seed + ch, 6) }], styles: [{ name: "position", val: "absolute" }, { name: "top", val: "3em" }, { name: "order", val: String(order) }] });
  return { tag: "span", styles: [{ name: "display", val: "flex" }, { name: "order", val: "0" }], children: [..."Sponsored"].map((c, i) => decoy(c, 30 + i)) };
}

function photoMedia(world, id, w, h, caption, scale) {
  return {
    __typename: "Photo",
    __isMedia: "Photo",
    accent_color: `FF${hex(id, 6).toUpperCase()}`,
    viewer_image: { height: h * 2, width: w * 2 },
    photo_product_tags: [],
    focus: { x: 0.5, y: 0.4 },
    photo_image: { uri: imageUrl("photo", id, w * Math.min(scale, 2), h * Math.min(scale, 2)), height: h, width: w },
    image: { uri: imageUrl("photo", id, Math.round(w / 2), Math.round(h / 2)), height: Math.round(h / 2), width: Math.round(w / 2) },
    accessibility_caption: caption,
    url: `https://www.facebook.com/photo/?fbid=${id}&set=a.${id.slice(0, 9)}`,
    id,
    __isNode: "Photo",
  };
}

const PHOTO_CAPTION = { en: "May be an image of mountain, lake and sky", pl: "Może być zdjęciem przedstawiającym góry, jezioro i niebo" };

function attachmentFor(world, story, ctx) {
  const id = story.postId;
  const caption = PHOTO_CAPTION[world.locale] || PHOTO_CAPTION.en;
  const decoyFooter = story.decoys ? { comet_footer_renderer: ghlMockedFooter(story) } : {};
  if (story.kind === "photo") {
    return {
      deduplication_key: hex(`photo:${id}`, 32),
      style_list: ["photo", "fallback"],
      target: { __typename: "Photo", id: `${id}1` },
      media: { __typename: "Photo", __isNode: "Photo", id: `${id}1` },
      styles: section("StoryAttachmentPhotoStyleRenderer", { __isStoryAttachmentStyleRendererUnion: "StoryAttachmentPhotoStyleRenderer", attachment: { media: { ...photoMedia(world, `${id}1`, 520, 390, caption, ctx.scale), feedback: { can_viewer_comment: true, id: b64(`feedback:${id}1`) } } } }),
      __module_operation_CometFeedStoryAttachmentMatchRenderer_attachment: moduleRef("CometFeedStoryPhotoAttachmentStyle_styleTypeRenderer"),
      ...decoyFooter,
    };
  }
  if (story.kind === "album") {
    const count = 7;
    const nodes = Array.from({ length: 5 }, (_, i) => ({
      deduplication_key: hex(`album:${id}:${i}`, 32),
      media: { ...photoMedia(world, `${id}${i + 2}`, 590, 392, caption, ctx.scale), is_playable: false, owner: { __typename: story.actor.type, id: story.actor.id } },
      url: `https://www.facebook.com/photo.php?fbid=${id}${i + 2}&set=pcb.${id}&type=3`,
    }));
    return {
      deduplication_key: hex(`album:${id}`, 32),
      style_list: ["album", "photo", "fallback"],
      target: { __typename: "MediaSet", id: `pcb.${id}` },
      media: { __typename: "Photo", __isNode: "Photo", id: `${id}2` },
      styles: section("StoryAttachmentAlbumStyleRenderer", {
        __isStoryAttachmentStyleRendererUnion: "StoryAttachmentAlbumStyleRenderer",
        attachment: { mediaset_token: `pcb.${id}`, url: `https://www.facebook.com/media/set/?set=pcb.${id}&type=1`, all_subattachments: { count, nodes }, comet_product_tag_feed_overlay_renderer: null },
      }),
      __module_operation_CometFeedStoryAttachmentMatchRenderer_attachment: moduleRef("CometFeedStoryAlbumAttachmentStyle_styleTypeRenderer"),
    };
  }
  if (story.kind === "link") {
    const target = `https://example.org/${story.actor.vanity || "news"}/${id.slice(-6)}`;
    return {
      deduplication_key: hex(`link:${id}`, 32),
      style_list: ["share", "fallback"],
      target: { __typename: "ExternalUrl", id: hex(target, 16), external_url: target },
      media: { __typename: "GenericAttachmentMedia", __isNode: "GenericAttachmentMedia", id: `${id}9` },
      styles: section("StoryAttachmentShareStyleRenderer", {
        __isStoryAttachmentStyleRendererUnion: "StoryAttachmentShareStyleRenderer",
        attachment: {
          url: `https://l.facebook.com/l.php?u=${encodeURIComponent(target)}&h=AT${hex(target, 30)}`,
          title_with_entities: { text: story.text.split(/[.!?]/)[0].slice(0, 80) },
          description: { text: "Read the full story on example.org." },
          source: { text: "example.org" },
          media: { __typename: "GenericAttachmentMedia", large_share_image: { uri: imageUrl("share", id, 500, 261), height: 261, width: 500 }, image: { uri: imageUrl("share", id, 250, 131) } },
          story_attachment_link_renderer: { attachment: { web_link: { __typename: "ExternalWebLink", url: target } } },
        },
      }),
      __module_operation_CometFeedStoryAttachmentMatchRenderer_attachment: moduleRef("CometFeedStoryShareAttachmentStyle_styleTypeRenderer"),
      ...decoyFooter,
    };
  }
  if (story.kind === "video") {
    const vid = `${id}7`;
    return {
      deduplication_key: hex(`video:${id}`, 32),
      style_list: ["video_inline", "video", "fallback"],
      target: { __typename: "Video", id: vid },
      media: {
        __typename: "Video",
        __isMedia: "Video",
        id: vid,
        width: 1280,
        height: 720,
        aspect_ratio: 1.7777777777778,
        length_in_second: 94.5,
        is_live_streaming: false,
        permalink_url: `https://www.facebook.com/watch/?v=${vid}`,
        videoDeliveryLegacyFields: null,
        videoDeliveryResponseFragment: {
          videoDeliveryResponseResult: {
            dash_manifests: [{ manifest_xml: "<MPD/>", failure_reason: null }],
            dash_manifest_urls: [{ manifest_url: `https://www.facebook.com/${story.actor.vanity}?v=${vid}&dummy=.mpd`, failure_reason: null }],
            progressive_urls: [
              { progressive_url: videoUrl(vid, "SD"), failure_reason: null, metadata: { quality: "SD" } },
              { progressive_url: videoUrl(vid, "HD"), failure_reason: null, metadata: { quality: "HD" } },
            ],
            hls_playlist_urls: [{ hls_playlist_url: null, failure_reason: { type: "NotEligibleForHls", message_format: "", message_params: [] } }],
            id: vid,
          },
          id: vid,
        },
        preferred_thumbnail: { image: { uri: imageUrl("poster", vid, 640, 360) }, image_preview_payload: null, id: `${vid}0` },
      },
      styles: section("StoryAttachmentVideoStyleRenderer", { __isStoryAttachmentStyleRendererUnion: "StoryAttachmentVideoStyleRenderer", attachment: { url: `https://www.facebook.com/watch/?v=${vid}` } }),
      __module_operation_CometFeedStoryAttachmentMatchRenderer_attachment: moduleRef("CometFeedStoryVideoAttachmentStyle_styleTypeRenderer"),
    };
  }
  return null;
}

/** Ad-looking decoy footer present on organic stories in 2026 (§8.5); never an ad signal. */
function ghlMockedFooter(story) {
  return {
    __typename: "CometStoryAttachmentFooterGHLMockedGenericShareStrategy",
    attachment: {
      ghl_mocked_footer_info: {
        headline: "Learn More",
        footer_body: `${hex(story.postId, 5)}.com`,
        link: `https://l.facebook.com/l.php?u=${b64url(hex(story.postId, 48))}&h=CF${hex(story.postId, 24)}`,
        meta: "Sponsored",
        cta_button: ghlLabel(story.postId),
      },
    },
  };
}

function messageSection(story, ranges) {
  const textOnly = story.kind === "text" && !story.shared && ranges.length === 0 && story.text.length < 110;
  return section(textOnly ? "CometFeedStoryLargeMessageRenderingStrategy" : "CometFeedStoryDefaultMessageRenderingStrategy", {
    story: { ...(textOnly ? { is_text_only_story: true } : {}), message: textWithEntities(story.text, ranges), id: story.nodeId },
    __module_operation_CometFeedStoryMessageMatchRenderer_story: moduleRef(textOnly ? "CometFeedStoryLargeMessageRenderingStrategy_message" : "CometFeedStoryDefaultMessageRenderingStrategy_message"),
  });
}

/** comet_sections.content.story: message, attachments, actors (with profile pictures), shared story. */
function contentStory(world, story, ctx, attachments, shared) {
  const ranges = messageRanges(story.text, story.mentions);
  return {
    feedback: { id: story.feedbackId },
    comet_sections: {
      above_message: null,
      info_icon: null,
      attachment_overlay: null,
      attached_story: shared ? section("CometStoryAttachedStoryStrategy", { story: { attached_story: shared } }) : null,
      message: messageSection(story, ranges),
      message_suffix: null,
      message_container: section("CometFeedStoryMessageContainerRenderingStrategy", { story: { message: { text: story.text }, referenced_sticker: null, attachments: [], comet_sections: { message: null }, id: story.nodeId } }),
      message_sticker: null,
      aggregated_stories: null,
    },
    encrypted_tracking: blob(`et:${story.postId}`),
    attachments,
    future_of_feed_info: { dominant_readable_color: null },
    th_dat_spo: null,
    text_format_metadata: null,
    post_id: story.postId,
    actors: [{ profile_picture: { uri: imageUrl(story.actor.type === "User" ? "avatar" : "logo", story.actor.id, 60 * ctx.scale) }, __typename: story.actor.type, id: story.actor.id, name: story.actor.name, __isEntity: story.actor.type, url: story.actor.url }],
    message: { __typename: "TextWithEntities", text: story.text },
    ...(story.decoys ? { ghl_mocked_encrypted_link: `https://l.facebook.com/l.php?u=${b64url(hex(story.postId, 60))}&h=CF${hex(story.postId, 26)}`, ghl_label_mocked_cta_button: null } : {}),
    wwwURL: story.url,
    target_group: story.to ? { id: story.to.id } : null,
    attached_story: shared,
    id: story.nodeId,
  };
}

const AUDIENCE = { friends: ["friends", "Friends"], public: ["public", "Public"], group: ["group", "Public group"] };

function metadataSections(story, extra = []) {
  const [icon, description] = AUDIENCE[story.privacy] || AUDIENCE.public;
  const out = [
    section("CometFeedStoryLongerTimestampStrategy", {
      override_url: story.to ? `${story.to.url}?multi_permalinks=${story.postId}&hoisted_section_header_type=recently_seen` : null,
      video_override_url: null,
      story: { creation_time: story.time, url: story.url, ghl_label: ghlLabel(story.postId), id: story.nodeId },
    }),
    section("CometFeedStoryAudienceStrategy", { story: { privacy_scope: { icon_image: { name: icon }, description }, id: story.nodeId } }),
  ];
  if (story.to) {
    out.push(
      section("CometStoryCommunityAttributionGroupPostByStrategy", {
        story: { actors: [{ __typename: story.actor.type, id: story.actor.id, name: story.actor.name, url: story.actor.url }], to: { __typename: "Group", id: story.to.id }, id: story.nodeId },
        author_group_membership: { associated_group: { __typename: "Group", id: story.to.id }, has_member_feed: true, id: hex(`m:${story.actor.id}`, 9) },
      }),
    );
  }
  if (story.ai) {
    out.push(section("CometFeedStoryGenAIContentTransparencyStrategy", { story: { was_detected_as_ai_generated: false, was_self_disclosed_as_ai_generated: true, ai_generated_detected_info: null, id: story.nodeId } }));
  }
  return [...out, ...extra];
}

/**
 * comet_sections.context_layout: actor photo, title (with suggestion markers when asked), metadata.
 * opts: { followButton, joinAction, recommendation, unconnected, sponsoredLabel }
 */
function contextLayout(story, ctx, opts = {}) {
  const group = story.to;
  const photoSize = group ? 24 : 40;
  const titleStory = {
    id: story.nodeId,
    post_id: story.postId,
    actors: [actorRef(story.actor)],
    collaborators: [],
    title: null,
    comet_sections: {
      action_link: null,
      ...(opts.followButton
        ? {
            follow_button: section("CometFeedStoryFollowButtonStrategy", {
              story: { id: story.nodeId, action_links: [{ __typename: "FollowProfileActionLink", should_show_follow_back: false, should_use_blue_link: true, profile: { __typename: story.actor.type, id: story.actor.id, subscribe_status: "CAN_SUBSCRIBE" }, follow_location: "IFR_POST_IN_NEWS_FEED" }], tracking: blob(`fb:${story.postId}`, 60), post_id: story.postId },
            }),
          }
        : {}),
    },
    encrypted_tracking: blob(`tt:${story.postId}`, 120),
    to: group ? groupRef(group) : null,
    recommendation_context: opts.recommendation ? { __typename: "ExploreRecommendationContext" } : null,
  };
  const title = group
    ? section("CometFeedStoryCommunityAttributionTitleStrategy", {
        story: { recommendation_context: titleStory.recommendation_context, to: { ...groupRef(group), should_denudge_group_join_ctas: false, override_community_attribution_name: null }, id: story.nodeId, comet_sections: titleStory.comet_sections },
        if_viewer_can_join_group: opts.joinAction
          ? { join_action: { __typename: "GroupJoinForumAction", group: { id: group.id, viewer_forum_join_state: "CAN_JOIN", name: group.name, action_intervention_view_model: null, feature_intervention: null } }, id: group.id }
          : null,
      })
    : section("CometFeedStoryTitleWithActorStrategy", { pfp_swap_ig_profile_url: null, topic_display_name: null, story: titleStory });
  const extraMeta = opts.sponsoredLabel ? [section("CometStorySponsoredLabelStrategy", { story: { id: story.nodeId, sponsored_label: ghlLabel(`${story.postId}:ad`) } })] : [];
  return section("CometFeedStoryDefaultContextLayoutStrategy", {
    local_alerts_story_menu_promotion: null,
    story: {
      tuw_feed_prediction_scores: null,
      id: story.nodeId,
      serialized_frtp_identifiers: blob(`frtp:${story.postId}`, 40),
      unconnected_waist_data: opts.unconnected ? { serialized_ranking_info: JSON.stringify({ primary_generator: 9077, trigger_id: 1428019, all_generators: [9077] }) } : null,
      can_viewer_see_menu: true,
      actors: [{ __typename: story.actor.type, name: story.actor.name, id: story.actor.id }],
      comet_sections: {
        actor_photo: section(group ? "CometFeedStoryActorCommunityAttributionStrategy" : "CometFeedStoryActorPhotoStrategy", {
          story: {
            actors: [{ ...actorRef(story.actor), profile_url: story.actor.url, story_bucket: { nodes: [] }, live_video_for_comet_live_ring: null, profile_picture: picture(story.actor, photoSize, ctx.scale) }],
            comet_sections: { action_link: group ? { __typename: "GroupMemberProfileActionLink", has_member_profile: true, group: { id: group.id, __typename: "Group" } } : null },
            attachments: [],
            th_dat_spo: null,
            ...(group ? { to: { __typename: "Group", id: group.id, name: group.name, profile_picture: { uri: imageUrl("logo", group.id, 40 * ctx.scale) } } } : {}),
            id: story.nodeId,
          },
          __module_operation_CometFeedStoryActorPhotoSectionMatchRenderer_story: moduleRef("CometFeedStoryActorPhotoStrategy_actorPhoto"),
        }),
        metadata: metadataSections(story, extraMeta),
        title,
      },
      encrypted_tracking: blob(`cl:${story.postId}`, 120),
    },
  });
}

function topReactions(total, seed) {
  if (!total) return { edges: [] };
  const like = Math.max(1, Math.round(total * 0.7));
  const edges = [{ visible_in_bling_bar: true, node: { id: REACTIONS.LIKE, localized_name: "Like" }, i18n_reaction_count: String(like), reaction_count: like }];
  if (total - like > 0) edges.push({ visible_in_bling_bar: true, node: { id: seed % 2 ? REACTIONS.LOVE : REACTIONS.HAHA, localized_name: seed % 2 ? "Love" : "Haha" }, i18n_reaction_count: String(total - like), reaction_count: total - like });
  return { edges };
}

export function viewerReactionInfo(reactionId) {
  return reactionId ? { __typename: "FeedbackReactionInfo", id: reactionId, localized_name: REACTION_NAMES[reactionId] || "Like" } : null;
}

/**
 * The UFI section. Two real 2026 variants alternate (graphql-protocol §5.6): A puts counts on the summary
 * feedback, B only inside adaptive_ufi_action_renderers.
 */
function feedbackSection(world, story, ctx) {
  const st = world.feedback.get(story.postId) || { reactions: story.reactions, viewerReaction: null, shares: story.shares, comments: [] };
  const viewerActor = { __typename: "User", id: world.viewer.id };
  const commentsTotal = st.comments.length;
  const variantA = Number(BigInt(story.postId) % 2n) === 0;
  const reactInfo = viewerReactionInfo(st.viewerReaction);
  const summary = {
    id: story.feedbackId,
    subscription_target_id: story.postId,
    adaptive_ufi_action_renderers: [
      { __typename: "UFIStoryReactActionRenderer", feedback: { viewer_feedback_reaction_info: reactInfo, id: story.feedbackId, viewer_actor: viewerActor, associated_group: story.to ? { id: story.to.id } : null, reaction_count: { count: st.reactions }, reaction_display_config: { reaction_display_strategy: "USE_REACTION_SHEET_STRING_ONLY" } }, hideLabelForAMA: false },
      { __typename: "UFICommentActionRenderer", feedback: { id: story.feedbackId, comment_rendering_instance: { comments: { total_count: commentsTotal } } } },
      { __typename: "XFBUFIAdaptiveShareActionRenderer", feedback: { id: story.feedbackId, share_count: { count: st.shares } } },
    ],
    viewer_feedback_reaction_info: reactInfo,
    top_reactions: topReactions(st.reactions, Number(BigInt(story.postId) % 7n)),
    ...(variantA
      ? {
          reaction_count: { count: st.reactions },
          i18n_reaction_count: String(st.reactions),
          share_count: { count: st.shares },
          i18n_share_count: String(st.shares),
          comments_count_summary_renderer: { feedback: { comment_rendering_instance: { comments: { total_count: commentsTotal } } } },
        }
      : {}),
  };
  const ftwc = {
    id: story.feedbackId,
    owning_profile: { __typename: story.actor.type, name: story.actor.name, short_name: story.actor.shortName, id: story.actor.id },
    can_viewer_comment: true,
    comet_ufi_summary_and_actions_renderer: { __typename: "DefaultModernCometUFISummaryAndActionsRenderer", feedback: summary },
    threading_config: { __typename: "FullThreadingFeedbackConfig" },
    comment_rendering_instance: { comments: { total_count: commentsTotal } },
    url: story.url,
    __typename: "Feedback",
    viewer_actor: viewerActor,
    comment_composer_placeholder: "Write a comment…",
    have_comments_been_disabled: false,
    default_comment_ordering_mode: "RANKED_THREADED",
    inline_composer_visible_by_default: false,
    associated_group: story.to ? { id: story.to.id } : null,
    is_viewer_muted: false,
    comments_disabled_notice_renderer: null,
  };
  return section(story.to ? "CometStoryFeedbackGroupContextualProfileUFIStrategy" : "CometStoryFeedbackUFIStrategy", {
    story: {
      feedback: { if_viewer_can_comment_anonymously: null, id: story.feedbackId },
      feedback_context: { feedback_target_with_context: { viewer_actor: viewerActor, id: story.feedbackId } },
      story_ufi_container: {
        __typename: "XFBSimplifiedUFIContainer",
        story: {
          encrypted_tracking: blob(`et:${story.postId}`),
          feedback_context: { feedback_target_with_context: ftwc, interesting_top_level_comments: [] },
          shareable_from_perspective_of_feed_ufi: { __typename: "Story", __isEntity: "Story", url: story.url, id: story.nodeId, post_id: story.postId },
          id: story.nodeId,
          permalink_url: story.url,
          url: story.url,
          post_id: story.postId,
          tracking: JSON.stringify({ qid: hex(`q:${story.postId}`, 19), mf_story_key: story.postId, top_level_post_id: story.postId }),
          th_dat_spo: null,
          target_group: story.to ? { id: story.to.id } : null,
          message: { text: story.text },
          actors: [{ __typename: story.actor.type, name: story.actor.name, id: story.actor.id }],
        },
      },
      id: story.nodeId,
    },
  });
}

/** The reduced Story Facebook nests as attached_story (a shared post). Its title carries the original Page's
 * Follow button: a friend's share must not inherit it (graphql-protocol §5.4, §6.4 scope). */
function attachedStory(world, original, ctx) {
  const attachment = attachmentFor(world, original, ctx);
  return {
    __typename: "Story",
    id: original.nodeId,
    post_id: original.postId,
    creation_time: original.time,
    should_host_actor_link_in_watch: false,
    actors: [actorRef(original.actor)],
    permalink_url: original.url,
    url: original.url,
    message: { __typename: "TextWithEntities", text: original.text },
    attachments: attachment ? [attachment] : [],
    comet_sections: {
      content: section("CometFeedStoryDefaultContentStrategy", { story: contentStory(world, original, ctx, attachment ? [attachment] : [], null) }),
      context_layout: contextLayout(original, ctx, { followButton: original.actor.type === "Page" }),
      timestamp: metadataSections(original)[0],
      attached_story_layout: section("CometStoryAttachedStoryInvertedLayoutStrategy", { story: { id: original.nodeId } }),
    },
    encrypted_tracking: blob(`at:${original.postId}`),
    feedback: { id: original.feedbackId },
  };
}

/**
 * A full 2026 Story node. ctx: { scale }. markers: suggestion/sponsored opts for contextLayout plus
 * { sponsoredData: "plain" | "obfuscated" } for th_dat_spo.
 */
export function storyNode(world, story, ctx, markers = {}) {
  const attachment = attachmentFor(world, story, ctx);
  const attachments = attachment ? [attachment] : [];
  const original = story.shared ? world.story(story.shared) : null;
  const shared = original ? attachedStory(world, original, ctx) : null;
  const sponsoredData = markers.sponsoredData
    ? { __typename: markers.sponsoredData === "obfuscated" ? OBFUSCATED_SPONSORED_DATA : "SponsoredData", lbl_adv_iden: `6${hex(story.postId, 12).replace(/\D/g, "7")}`, client_token: blob(`ct:${story.postId}`, 40), brs_filter_setting: null, post_rendering_loggers: null }
    : null;
  return {
    __typename: "Story",
    th_dat_spo: sponsoredData,
    __isNode: "Story",
    id: story.nodeId,
    __isFeedUnit: "Story",
    post_id: story.postId,
    debug_info: null,
    feedback: { associated_group: story.to ? { context_actor_hovercard: "GROUP", id: story.to.id } : null, id: story.feedbackId, owning_profile: { __typename: story.actor.type, name: story.actor.name, short_name: story.actor.shortName, id: story.actor.id } },
    is_story_civic: null,
    cache_id: hex(`cache:${story.postId}`, 9).replace(/\D/g, "3"),
    matched_terms: [],
    creation_time: story.time,
    cix_screen: null,
    attachments,
    future_of_feed_info: { should_reverse_message_and_attachment_position: false, should_overlay_header: false, aspect_ratio_update: -1, web_reshare_variant: "NORMAL" },
    attached_story: shared,
    bumpers: null,
    comet_sections: {
      __typename: "CometStorySections",
      content: section("CometFeedStoryDefaultContentStrategy", {
        story: contentStory(world, story, ctx, attachments, shared),
        __module_operation_CometFeedStoryContentMatchRenderer_story: moduleRef("CometFeedStoryDefaultContentStrategy_content"),
      }),
      layout: section("CometStoryDefaultLayoutStrategy", {}),
      copyright_violation_header: null,
      header: null,
      context_layout: contextLayout(story, ctx, markers),
      aymt_footer: null,
      footer: null,
      feedback: feedbackSection(world, story, ctx),
      outer_footer: null,
      call_to_action: markers.cta ? { __typename: "CometFeedStoryCallToActionStrategy", story: { call_to_action: { type: markers.cta, link: `https://l.facebook.com/l.php?u=${encodeURIComponent(`https://${story.actor.vanity}.example/?utm_source=facebook`)}` } } } : null,
      post_inform_treatment: null,
      action_link: null,
      timestamp: metadataSections(story)[0],
    },
    encrypted_tracking: blob(`et:${story.postId}`),
    should_host_actor_link_in_watch: false,
    permalink_url: story.url,
    whatsapp_ad_context: null,
    schema_context: null,
    click_tracking_linkshim_cb: blob(`ls:${story.postId}`, 60),
    encrypted_click_tracking: blob(`ec:${story.postId}`, 120),
    serialized_frtp_identifiers: blob(`frtp:${story.postId}`, 40),
    can_viewer_see_menu: true,
    actors: [actorRef(story.actor)],
    to: story.to ? groupRef(story.to) : null,
    work_is_repost: null,
    work_reposted_story: null,
    __module_operation_CometFeedUnitContainerSection_feedUnit: moduleRef("CometFeedUnitStoryStrategy_feedUnit"),
    __isTrackableFeedUnit: "Story",
    trackingdata: { id: hex(`td:${story.postId}`, 16) },
    viewability_config: [0, 0, 0, 0],
    client_view_config: { can_delay_log_impression: false, use_banzai_vital: false, use_banzai_bypass: false },
  };
}

/** Category field on an edge: obfuscated cat_sensitive (2026 default) or plain category. */
function categoryFields(ctx, postId, category, { plainCat = null, undecodable = false } = {}) {
  if (!ctx.obfuscateCategory) return { category: plainCat || category };
  if (plainCat) return { cat_sensitive: { enc: null, cat: plainCat } };
  if (undecodable || !postId) return { cat_sensitive: { enc: undecodable ? sha256hex(`x:${postId}`) : null, cat: null } };
  return { cat_sensitive: { enc: catEnc(postId, CATEGORY[category]), cat: null } };
}

function edgeShell(ctx, { postId, dedup, category, catOpts, auction = null, adPod = false, node, cursor, score = 0 }) {
  return {
    brs_content_label: node && node.__typename === "Story" ? 60 + (Number(String(dedup).slice(-1)) % 4) * 10 : null,
    ...categoryFields(ctx, postId, category, catOpts),
    deduplication_key: String(dedup),
    min_gap_type_index_string: node && node.__typename === "Story" ? "14" : "12",
    sposnsor_new_distac_action: auction,
    top_story_cache_score: score,
    is_ad_eligible_for_ad_pod: adPod,
    node,
    feed_backend_data: { qid: hex(`qid:${dedup}`, 19).replace(/\D/g, "1"), original_qid: null, vsid: null, vspos: null, should_recent_vpv_fetch_tracking_data: false, serialized_payloads: null },
    cursor,
  };
}

export function organicEdge(world, story, ctx, cursor, { engagement = false } = {}) {
  return edgeShell(ctx, { postId: story.postId, dedup: Number(BigInt(story.postId) % 1000000000n), category: engagement ? "ENGAGEMENT" : "ORGANIC", node: storyNode(world, story, ctx), cursor, score: story.reactions * 13.7 });
}

/** A junk story spec rendered like an organic Story (ads and suggestions are Stories too). */
function junkStory(world, j, instance) {
  return {
    postId: j.postId,
    nodeId: b64(`S:_I${j.actor.id}:${j.postId}:${j.postId}`),
    feedbackId: b64(`feedback:${j.postId}`),
    time: world.now - 3600 * 5,
    actor: j.actor,
    to: j.to || null,
    kind: j.type === "sponsored" ? "link" : "photo",
    text: j.text,
    mentions: [],
    shared: null,
    privacy: "public",
    decoys: false,
    ai: false,
    url: j.to ? `${j.to.url}posts/${j.postId}/` : `${j.actor.url}/posts/${j.postId}`,
    reactions: 12,
    comments: 0,
    shares: 1,
    instance,
  };
}

const SPONSORED_VARIANTS = {
  full: { markers: { sponsoredData: "plain", sponsoredLabel: true }, category: "SPONSORED", auction: 3 },
  obfuscated: { markers: { sponsoredData: "obfuscated" }, catOpts: { undecodable: true } },
  category: { markers: {}, catOpts: { plainCat: "SPONSORED" } },
  label: { markers: { sponsoredLabel: true }, catOpts: { undecodable: true } },
  auction: { markers: {}, catOpts: { undecodable: true }, auction: 2 },
};
const SUGGESTION_MARKERS = { follow: { followButton: true }, join: { joinAction: true }, recommended: { recommendation: true }, unconnected: { unconnected: true } };
const UNIT_CATEGORY = { ShowcaseFeedUnit: "FB_SHORTS", StoriesTrayFeedUnit: "MULTI_FB_STORIES_TRAY", QuickPromotionFeedUnit: "PROMOTION" };

/** Ads, suggestions, non-Story units and node-less edges (graphql-protocol §6.4). */
export function junkEdge(world, { junk: j, instance }, ctx, cursor) {
  const dedup = Number.parseInt(hex(instance, 8), 16) % 1000000000;
  if (j.type === "no-node") return edgeShell(ctx, { dedup, category: null, node: null, cursor });
  if (j.type === "unit") {
    return edgeShell(ctx, { dedup, category: null, catOpts: { plainCat: UNIT_CATEGORY[j.typename] || null }, node: unitNode(world, j, instance, ctx), cursor });
  }
  const story = junkStory(world, j, instance);
  if (j.type === "sponsored") {
    const v = SPONSORED_VARIANTS[j.variant];
    const node = storyNode(world, story, ctx, { ...v.markers, cta: j.cta });
    return edgeShell(ctx, { postId: j.postId, dedup, category: v.category || "SPONSORED", catOpts: v.catOpts, auction: v.auction ?? null, adPod: true, node, cursor });
  }
  const node = storyNode(world, story, ctx, SUGGESTION_MARKERS[j.variant]);
  return edgeShell(ctx, { postId: j.postId, dedup, category: "ORGANIC", node, cursor });
}

function unitNode(world, j, instance, ctx) {
  const base = { __typename: j.typename, id: b64(`${j.typename}:${instance}`), tracking: blob(`unit:${instance}`, 60), debug_info: null };
  const personItem = (p) => ({ node: { __typename: "User", id: p.id, name: p.name, url: p.url, profile_picture: picture(p, 160, 1), social_context: { text: "3 mutual friends" } } });
  if (j.typename === "PaginatedPeopleYouMayKnowFeedUnit") return { ...base, title: { text: "People you may know" }, allPeople: { edges: j.people.map(personItem) } };
  if (j.typename === "ShowcaseFeedUnit") {
    return {
      ...base,
      showcase_story_type: "SHOWCASE_SHORT_VIDEO",
      showcase_item: j.creators.map((c, i) => ({
        attachment: { __typename: "ShowcaseShortVideoAttachment", story: { id: b64(`reel:${instance}:${i}`), post_id: hex(`${instance}:${i}`, 9).replace(/\D/g, "5"), actors: [actorRef(c)], attachments: [{ media: { __typename: "Video", id: `9${i}${hex(instance, 6).replace(/\D/g, "2")}`, width: 720, height: 1280, permalink_url: `https://www.facebook.com/reel/9${i}${hex(instance, 6).replace(/\D/g, "2")}/`, videoDeliveryLegacyFields: null } }] } },
      })),
    };
  }
  if (j.typename === "StoriesTrayFeedUnit") return { ...base, story_buckets: { edges: j.people.map((p) => ({ node: { id: b64(`bucket:${p.id}`), owner: actorRef(p) } })) } };
  if (j.typename === "GroupsYouShouldJoinFeedUnit") return { ...base, title: { text: "Suggested groups" }, groups: { edges: j.groups.map((g) => ({ node: { ...groupRef(g), viewer_join_state: "CAN_JOIN" } })) } };
  return { ...base, promotion: { title: { text: j.text }, primary_action: { title: { text: "Turn on" } } } };
}

/** Relay incremental delivery of one feed page: root, $stream$ edges, $defer$ page_info (graphql-protocol §3.1). */
export function feedPayloads(world, edges, pageInfo, { withViewerFields = true, timing = { start: 0, flush: 0 } } = {}) {
  const viewerFields = withViewerFields ? { actor: { __typename: "User", name: world.viewer.name, id: world.viewer.id }, can_have_friends: true, all_friends: { friend_count: world.viewer.friendCount }, is_fb_employee: false, rack_qrt_called_during_first_story: false, injected_stories: null } : {};
  const payloads = [
    {
      data: { viewer: { news_feed: { edges: edges.slice(0, 1) }, ...viewerFields } },
      extensions: { prefetch_uris_v2: [], server_metadata: { request_start_time_ms: timing.start, time_at_flush_ms: timing.flush }, is_final: false },
    },
  ];
  edges.slice(1).forEach((edge, i) => payloads.push({ label: STREAM_LABEL, path: ["viewer", "news_feed", "edges", i + 1], data: edge, extensions: { is_final: false } }));
  payloads.push({ label: PAGE_INFO_LABEL, path: ["viewer", "news_feed"], data: { page_info: { __typename: "PageInfo", end_cursor: pageInfo.endCursor, has_next_page: pageInfo.hasNextPage } }, extensions: { prefetch_uris_v2: [], is_final: true } });
  return payloads;
}

/** Response body: one JSON document per line, CRLF separated like Facebook's streamed responses. */
export const encodeLines = (payloads) => payloads.map((p) => JSON.stringify(p)).join("\r\n");

export function commentNode(world, c) {
  const a = c.author;
  return {
    __typename: "Comment",
    id: c.id,
    legacy_fbid: c.legacy,
    depth: 0,
    body: { text: c.text, ranges: [] },
    preferred_body: { __typename: "TextWithEntities", text: c.text, ranges: [] },
    author: { __typename: "User", id: a.id, name: a.name, short_name: a.shortName, url: a.url, is_verified: false, profile_picture_depth_0: { uri: imageUrl("avatar", a.id, 32) }, profile_picture_depth_1: { uri: imageUrl("avatar", a.id, 24) } },
    created_time: c.time,
    url: `https://www.facebook.com/${c.postId}?comment_id=${c.legacy}`,
    comment_parent: null,
    is_author_original_poster: false,
    feedback: { id: b64(`feedback:${c.postId}_${c.legacy}`), reaction_count: { count: c.reactions }, top_reactions: { edges: [] }, viewer_feedback_reaction_info: null },
    replies_fields: { total_count: c.replies },
  };
}

/** CommentsListComponentsPaginationQuery: one JSON document, no @stream (graphql-protocol §5.7). */
export function commentsPayload(world, story, { after = 0, count = 10 } = {}) {
  const all = world.feedback.get(story.postId).comments;
  const slice = all.slice(after, after + count);
  const cursor = (i) => b64url(`comments:${story.postId}:${i}`);
  return {
    data: {
      node: {
        __typename: "Feedback",
        id: story.feedbackId,
        comment_rendering_instance_for_feed_location: {
          comments: {
            edges: slice.map((c, i) => ({ node: commentNode(world, c), cursor: cursor(after + i + 1) })),
            page_info: { has_next_page: after + slice.length < all.length, end_cursor: slice.length ? cursor(after + slice.length) : null, has_previous_page: after > 0, start_cursor: cursor(after) },
            total_count: all.length,
          },
        },
      },
    },
    extensions: { is_final: true },
  };
}

export const commentsCursorOffset = (cursor, postId) => {
  const m = /^comments:(\d+):(\d+)$/.exec(Buffer.from(String(cursor || ""), "base64url").toString());
  return m && m[1] === postId ? Number(m[2]) : null;
};

export function reactEcho(world, story) {
  const st = world.feedback.get(story.postId);
  return {
    data: {
      feedback_react: {
        feedback: {
          id: story.feedbackId,
          reaction_count: { count: st.reactions },
          i18n_reaction_count: String(st.reactions),
          viewer_feedback_reaction_info: viewerReactionInfo(st.viewerReaction),
          top_reactions: topReactions(st.reactions, 1),
          viewer_actor: { __typename: "User", id: world.viewer.id },
        },
      },
    },
    extensions: { is_final: true },
  };
}

export function commentEcho(world, story, comment) {
  const total = world.feedback.get(story.postId).comments.length;
  return {
    data: {
      comment_create: {
        feedback_comment_edge: { cursor: b64url(`comments:${story.postId}:${total}`), node: commentNode(world, comment) },
        feedback: { id: story.feedbackId, total_comment_count: total, comment_rendering_instance: { comments: { total_count: total } } },
      },
    },
    extensions: { is_final: true },
  };
}

/** Facebook's logical error document (HTTP 200, graphql-protocol §3.3). */
export function gqlError(code, summary, description) {
  return {
    errors: [{ message: summary, severity: "CRITICAL", code, api_error_code: null, summary, description, description_raw: description, is_silent: false, is_transient: false, requires_reauth: code === 1357004, allow_user_retry: false, debug_info: null, query_path: null, fbtrace_id: hex(`${code}${description}`, 11) }],
    data: null,
    extensions: { is_final: true },
  };
}
