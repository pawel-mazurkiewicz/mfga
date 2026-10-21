// Server-side data of the fake pages, in the exact 2026 inline formats (graphql-protocol §2.5, §3.5, §3.6):
// config frames ["SiteData",[],{…},317] inside ScheduledServerJS/__bbox, CometRootEntryPointRenderer.init with
// preloaders {actorID, preloaderID:"adp_<Op>RelayPreloader_<hex>", queryID, variables, queryName},
// RelayPrefetchedStreamCache "next" frames carrying the first feed page, and the #envjson object.

import { createHash } from "node:crypto";
import { FEED_STYLES } from "./world.mjs";
import { TYPENAME_PAIRS } from "./graphql-shapes.mjs";

const hex = (s, n) => createHash("sha256").update(String(s)).digest("hex").slice(0, n);
const alnum = (s, n) => createHash("sha512").update(String(s)).digest("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, n);

/** doc_ids of the fake deploy. They differ from the dossier's (§14) so discovery paths are exercised. */
export const DOC_IDS = Object.freeze({
  CometModernHomeFeedQuery: "28297046932014517",
  CometNewsFeedPaginationQuery: "28440112285596315",
  CometUFIFeedbackReactMutation: "28512937681104392",
  useCometUFICreateCommentMutation: "40211658743275907",
  CommentsListComponentsPaginationQuery: "28403618705961402",
  FeedsCometFilterPanelQuery: "10051869914845503",
  CometClassicHomeLeftRailContainerQuery: "27994352870165011",
  StoriesTrayRectangularRootQuery: "28160531286950113",
  GroupsCometCrossGroupFeedPaginationQuery: "28205562945843170",
  GroupsCometLeftRailContainerQuery: "27850196137992618",
  ProfileCometTimelineFeedQuery: "28736035046001218",
  ProfileCometHeaderQuery: "28122917290710556",
});

/** Newest doc_ids from graphql-protocol §14 (what a product's fallback table would hold). */
export const DOSSIER_DOC_IDS = Object.freeze({
  CometModernHomeFeedQuery: ["28136951115834703", "28176044945385264", "28044109855291494"],
  CometNewsFeedPaginationQuery: ["28827638856853689"],
  CometUFIFeedbackReactMutation: ["27646120298312844"],
  useCometUFICreateCommentMutation: ["39607465588840384"],
});

/** Per-page tokens. dtsg uses the 2026 "NAf…:<n>:<expiry>" shape; jazoest = "2" + Σ charCodes(dtsg). */
export function makeTokens(world, salt = "") {
  const dtsg = `NAf${alnum(`dtsg${world.seed}${salt}`, 41)}:17:${world.now + 86400}`;
  return {
    dtsg,
    asyncToken: `AQ${alnum(`async${world.seed}${salt}`, 30)}:17:${world.now + 86400}`,
    lsd: `AdR${alnum(`lsd${world.seed}${salt}`, 24)}`,
    jazoest: jazoest(dtsg),
    hsi: String(7699081856574727250n + BigInt(world.seed)),
    rev: 1051133768,
    spinT: world.now - 1800,
    nonce: alnum(`nonce${world.seed}`, 8),
    compatIframeToken: alnum(`compat${world.seed}`, 30),
  };
}

export const jazoest = (token) => `2${[...token].reduce((sum, c) => sum + c.charCodeAt(0), 0)}`;

/** Provided variables of CometModernHomeFeedQuery (live 2026-09 values, request-feed-variables sample). */
export const RELAY_PROVIDED = Object.freeze({
  __relay_internal__pv__GHLShouldChangeSponsoredAuctionDistanceFieldNamerelayprovider: true,
  __relay_internal__pv__GHLShouldUseSponsoredAuctionLabelFieldNameV1relayprovider: true,
  __relay_internal__pv__GHLShouldUseSponsoredAuctionLabelFieldNameV2relayprovider: false,
  __relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider: true,
  __relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider: true,
  __relay_internal__pv__CometFeedStory_enable_reactor_facepilerelayprovider: false,
  __relay_internal__pv__CometFeedStory_enable_social_bubblesrelayprovider: false,
  __relay_internal__pv__CometFeedStory_enable_post_permalink_white_space_clickrelayprovider: false,
  __relay_internal__pv__CometUFICommentActionLinksRewriteEnabledrelayprovider: true,
  __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider: false,
  __relay_internal__pv__IsWorkUserrelayprovider: false,
  __relay_internal__pv__TestPilotShouldIncludeDemoAdUseCaserelayprovider: false,
  __relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider: true,
  __relay_internal__pv__FBReels_enable_view_dubbed_audio_type_gkrelayprovider: true,
  __relay_internal__pv__CometFeedShareMedia_shouldPrefetchShareImagerelayprovider: false,
  __relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider: false,
  __relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider: false,
  __relay_internal__pv__IsMergQAPollsrelayprovider: false,
  __relay_internal__pv__FBReelsMediaFooter_comet_enable_reels_ads_gkrelayprovider: true,
  __relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider: false,
  __relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider: "AUTO_TRANSLATE",
  __relay_internal__pv__CometUFIShareActionMigrationrelayprovider: true,
  __relay_internal__pv__CometUFISingleLineUFIrelayprovider: true,
  __relay_internal__pv__relay_provider_comet_ufi_ssr_seo_deferrelayprovider: true,
  __relay_internal__pv__CometUFI_dedicated_comment_routable_dialog_gkrelayprovider: true,
  __relay_internal__pv__ReelsIFUCard_reelsIFULikeCountrelayprovider: false,
  __relay_internal__pv__FBReelsIFUTileContent_reelsIFUPlayOnHoverrelayprovider: true,
  __relay_internal__pv__GroupsCometGYSJFeedItemHeightrelayprovider: 206,
  __relay_internal__pv__StoriesShouldEnablePhotosensitiveContentWarningrelayprovider: false,
  __relay_internal__pv__ShouldEnableBakedInTextStoriesrelayprovider: false,
  __relay_internal__pv__StoriesShouldIncludeFbNotesrelayprovider: true,
});

/** Feed query variables as getCometFeedVariablesForSk builds them for a route (graphql-protocol §4.2). */
export function feedPreloaderVariables(feedName, { fetchSize = 4, scale = 1 } = {}) {
  return {
    RELAY_INCREMENTAL_DELIVERY: true,
    connectionClass: "EXCELLENT",
    feedbackSource: 1,
    feedInitialFetchSize: fetchSize,
    feedLocation: "NEWSFEED",
    feedStyle: FEED_STYLES[feedName],
    orderby: feedName === "top" ? ["TOP_STORIES"] : ["MOST_RECENT"],
    privacySelectorRenderLocation: "COMET_STREAM",
    recentVPVs: [],
    refreshMode: "COLD_START",
    renderLocation: "homepage_stream",
    scale,
    shouldChangeBRSLabelFieldName: false,
    shouldObfuscateCategoryField: true,
    shouldUseBRSLabelFieldNameV1: false,
    shouldUseBRSLabelFieldNameV2: false,
    useDefaultActor: false,
    ...RELAY_PROVIDED,
  };
}

/** Numeric routeProps.feedStyle per Feeds filter (graphql-protocol §4.2). */
const ROUTE_FEED_STYLE = { all: 16, favorites: 12, friends: 17, groups: 18, pages: 19 };

export const preloaderId = (op, salt) => `adp_${op}RelayPreloader_${hex(`${op}:${salt}`, 19)}`;

const scheduled = (bbox) => ({ require: [["ScheduledServerJS", "handle", null, [{ __bbox: bbox }]]] });

/** The config frames (SiteData, LSD, DTSG*, CurrentUserInitialData, locale) as two data-sjs objects. */
export function configBlocks(world, tokens, { localeCode, checkpointed = false }) {
  const v = world.viewer;
  const siteData = {
    server_revision: tokens.rev,
    client_revision: tokens.rev,
    push_phase: "C3",
    pkg_cohort: "HYP:comet_pkg",
    haste_session: `20747.HYP:comet_pkg.2.1...0`,
    pr: 1,
    manifest_base_uri: "https://static.xx.fbcdn.net",
    manifest_origin: null,
    manifest_version_prefix: null,
    be_one_ahead: true,
    is_rtl: false,
    is_experimental_tier: false,
    is_jit_warmed_up: true,
    hsi: tokens.hsi,
    semr_host_bucket: "",
    bl_hash_version: 2,
    comet_env: 15,
    wbloks_env: false,
    ef_page: null,
    compose_bootloads: false,
    spin: 2,
    __spin_r: tokens.rev,
    __spin_b: "trunk",
    __spin_t: tokens.spinT,
    vip: "157.240.0.35",
  };
  const currentUser = {
    ACCOUNT_ID: v.id,
    USER_ID: v.id,
    NAME: v.name,
    SHORT_NAME: v.shortName,
    IS_BUSINESS_PERSON_ACCOUNT: false,
    HAS_SECONDARY_BUSINESS_PERSON: false,
    IS_FACEBOOK_WORK_ACCOUNT: false,
    IS_INSTAGRAM_BUSINESS_PERSON: false,
    IS_WABA_BUSINESS_PERSON: false,
    IS_MESSENGER_ONLY_USER: false,
    IS_DEACTIVATED_ALLOWED_ON_MESSENGER: false,
    IS_MESSENGER_CALL_GUEST_USER: false,
    IS_WORK_MESSENGER_CALL_GUEST_USER: false,
    IS_WORKROOMS_USER: false,
    APP_ID: "2220391788200892",
    IS_BUSINESS_DOMAIN: false,
  };
  return [
    {
      define: [
        ["SiteData", [], siteData, 317],
        ["ServerNonce", [], { ServerNonce: tokens.nonce }, 141],
        ["IntlCurrentLocale", [], { code: localeCode }, 5954],
        ["CookieCoreConfig", [], { c_user: { t: 31536000, s: "None" }, xs: { t: 31536000, s: "None" } }, 2104],
        ["WebConnectionClassServerGuess", [], { connectionClass: "EXCELLENT" }, 4705],
      ],
      require: [["markJSEnabled"], ["lowerDomain"], ["TimeSlice"]],
    },
    scheduled({
      define: [
        ["LSD", [], { token: tokens.lsd }, 323],
        ["DTSGInitialData", [], { token: tokens.dtsg }, 258],
        ["DTSGInitData", [], { token: tokens.dtsg, async_get_token: tokens.asyncToken }, 3515],
        ["CurrentUserInitialData", [], currentUser, 270],
        ["MqttWebDeviceID", [], { clientID: hex(`mqtt${world.seed}`, 32) }, 5003],
        ...(checkpointed ? [["CometCheckpointConfig", [], { is_checkpointed: true, checkpoint_type: 1501092823525282 }, 6100]] : []),
      ],
      require: [],
    }),
  ];
}

/** A later frame repeating LSD (pages carry three LSD frames; the first wins). */
export const lsdEchoBlock = (tokens) => scheduled({ define: [["LSD", [], { token: tokens.lsd }, 323]], require: [] });

/**
 * CometRootEntryPointRenderer.init with the route's preloaders. preloaders: [{ op, variables, salt }].
 */
export function entrypointBlock(world, { entryPoint, routeProps = {}, routeParams = {}, preloaders, elementId, tracePolicy }) {
  return scheduled({
    require: [
      [
        "CometRootEntryPointRenderer",
        "init",
        [entryPoint, "RequireDeferredReference"],
        [
          {
            actorID: world.viewer.id,
            cavalryLid: hex(`lid${world.seed}`, 19),
            elementId,
            entryPointRoot: { entryPoint: { __m: entryPoint }, allResources: [{ __dr: entryPoint.replace(".entrypoint", ".react") }, { __dr: entryPoint }], otherProps: { routeProps, routeParams }, entryPointParams: {} },
            preloaders: preloaders.map((p) => ({ actorID: world.viewer.id, preloaderID: preloaderId(p.op, p.salt), queryID: DOC_IDS[p.op], variables: p.variables, queryName: p.op })),
            ssrEnabled: true,
            tracePolicy,
          },
        ],
      ],
    ],
  });
}

/** One data-sjs frame per streamed payload: RelayPrefetchedStreamCache.next(preloaderID, {__bbox}). */
export function prefetchedBlocks(preloaderID, payloads, { moduleSuffix = "" } = {}) {
  return payloads.map((payload, i) =>
    scheduled({
      define: [],
      require: [["RelayPrefetchedStreamCache" + moduleSuffix, "next", [], [preloaderID, { __bbox: { complete: i === payloads.length - 1, result: payload, sequence_number: i } }]]],
    }),
  );
}

/** Route descriptors: entry point, preloaders and route props for each page kind. */
export function routeDescriptor(kind, { feedName = "top", filter = null, profileId = null, fetchSize = 4 } = {}) {
  if (kind === "home") {
    return {
      entryPoint: "CometHomeRoot.entrypoint",
      tracePolicy: "comet.home",
      routeProps: {},
      routeParams: { sk: feedName === "all" ? "h_chr" : null },
      preloaders: [
        { op: "CometModernHomeFeedQuery", salt: feedName, variables: feedPreloaderVariables(feedName, { fetchSize }) },
        { op: "CometClassicHomeLeftRailContainerQuery", salt: "home", variables: { numShortcutBookmarks: 5, numExploreBookmarks: 10, scale: 1 } },
        { op: "StoriesTrayRectangularRootQuery", salt: "home", variables: { bucketsToFetch: 6, scale: 1, shouldEnableLiveInStoriesTray: true } },
      ],
    };
  }
  if (kind === "feeds") {
    return {
      entryPoint: "FeedsCometRoot.entrypoint",
      tracePolicy: "comet.feeds",
      routeProps: { feedStyle: ROUTE_FEED_STYLE[filter] },
      routeParams: { filter, sk: "h_chr" },
      preloaders: [
        { op: "CometModernHomeFeedQuery", salt: filter, variables: feedPreloaderVariables(filter, { fetchSize }) },
        { op: "FeedsCometFilterPanelQuery", salt: filter, variables: { scale: 1 } },
      ],
    };
  }
  if (kind === "groups-feed") {
    return {
      entryPoint: "CometGroupsFeedRoot.entrypoint",
      tracePolicy: "comet.groups.feed",
      routeProps: {},
      routeParams: {},
      preloaders: [
        { op: "GroupsCometCrossGroupFeedPaginationQuery", salt: "groups", variables: { count: 3, cursor: null, feedLocation: "GROUPS_TAB", feedType: "DISCUSSION", scale: 1, sortingSetting: "TOP_POSTS", useDefaultActor: false } },
        { op: "GroupsCometLeftRailContainerQuery", salt: "groups", variables: { count: 10, scale: 1 } },
      ],
    };
  }
  return {
    entryPoint: "ProfileCometTimelineRoot.entrypoint",
    tracePolicy: "comet.profile.timeline",
    routeProps: { userID: profileId },
    routeParams: {},
    preloaders: [
      { op: "ProfileCometHeaderQuery", salt: profileId, variables: { userID: profileId, scale: 1 } },
      { op: "ProfileCometTimelineFeedQuery", salt: profileId, variables: { id: profileId, count: 3, scale: 1, renderLocation: "timeline", feedLocation: "TIMELINE" } },
    ],
  };
}

/** <script id="envjson"> (window.Env): GHL flags and the typename-restore table (graphql-protocol §8). */
export function envJson(tokens) {
  return {
    ghlss: "b1pLEJ",
    sjsListenerNew: true,
    sjsNonce: tokens.nonce,
    sjsNonceEnforce: false,
    use_ssr_state_manager: true,
    compat_iframe_token: tokens.compatIframeToken,
    clear_js_factory_after_used: true,
    brsid: tokens.hsi,
    promise_include_trace: false,
    h4npx7qw: true,
    z2ht6xqp: true,
    k8pq2mnb: true,
    q9k7m2x: TYPENAME_PAIRS.map((pair) => [...pair]),
  };
}

/** __d("<Op>_facebookRelayOperation") modules, as Facebook's JS bundles define them (graphql-protocol §11.1). */
export function relayOperationsBundle(docIds = DOC_IDS) {
  return Object.entries(docIds)
    .map(([op, id]) => `__d("${op}_facebookRelayOperation",[],(function(a,b,c,d,e,f){e.exports="${id}"}),null);`)
    .join("\n");
}
