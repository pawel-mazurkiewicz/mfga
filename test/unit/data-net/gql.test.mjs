import test from "node:test";
import assert from "node:assert/strict";
import { gql } from "./fixtures/load.mjs";
import { codec } from "./fixtures/stubs.mjs";
import { fakeClock, fakeFetch, fakeHarvest, fixture, jsonl, response } from "./fixtures/helpers.mjs";

const { GqlError, buildForm, createGqlClient, errorKind, jazoest } = gql;

const OK = jsonl({ data: { viewer: { id: "1" } }, extensions: { is_final: true } });
const errorBody = (code, extra = {}) => JSON.stringify({ errors: [{ message: `error ${code}`, code, severity: "CRITICAL", ...extra }], data: null });

function setup({ reply = () => response(OK), harvest = fakeHarvest(), minGapMs = 0, delay = 0, ...opts } = {}) {
  const clock = fakeClock();
  const net = fakeFetch(reply, { delay });
  const halts = [];
  const client = createGqlClient({
    platform: { fetch: net.fetch },
    harvest,
    minGapMs,
    onHalt: (reason) => halts.push(reason),
    codec,
    now: clock.now,
    sleep: clock.sleep,
    random: () => 0.5,
    visibility: { hidden: () => false, wait: async () => {} },
    ...opts,
  });
  return { client, net, clock, halts, harvest };
}

async function rejectsKind(promise, kind, code) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof GqlError, `expected GqlError, got ${err}`);
    assert.equal(err.kind, kind);
    if (code !== undefined) assert.equal(err.code, code);
    return true;
  });
}

test("jazoest matches Facebook's own value for the live 2026-10-21 LSD token", () => {
  assert.equal(jazoest("AdR16GsCBuzx6HMHP0pOQzBIMP8"), "22177");
  assert.equal(jazoest(""), "20");
});

test("errorKind maps the documented codes (graphql-protocol §3.3)", () => {
  const table = {
    1357004: "auth",
    1357051: "token",
    1677047: "token",
    1675012: "variables",
    1570245: "stale-doc",
    1357010: "field",
    1675004: "rate",
    1357046: "rate",
    1675039: "soft-block",
    1384000: "checkpoint",
  };
  for (const [code, kind] of Object.entries(table)) {
    assert.equal(errorKind(Number(code)), kind, `code ${code}`);
    assert.equal(errorKind(code), kind, `string code ${code}`);
  }
  assert.equal(errorKind(1), "server");
  assert.equal(errorKind(undefined), "server");
});

test("buildForm sends Facebook's Comet field set in order, from tokens and SiteData", () => {
  const h = fakeHarvest();
  const body = buildForm(h.tokens, { friendlyName: "CometModernHomeFeedQuery", docId: "123456789", variables: { a: 1 }, req: 11, session: "aaaaaa:bbbbbb:cccccc", dpr: 2 });
  assert.deepEqual([...body.keys()], [
    "av", "__aaid", "__user", "__a", "__req", "__hs", "dpr", "__ccg", "__rev", "__s", "__hsi", "__comet_req",
    "fb_dtsg", "jazoest", "lsd", "__spin_r", "__spin_b", "__spin_t",
    "fb_api_caller_class", "fb_api_req_friendly_name", "variables", "server_timestamps", "doc_id",
  ]);
  assert.equal(body.get("av"), "100000000000001");
  assert.equal(body.get("__user"), "100000000000001");
  assert.equal(body.get("__req"), "b");
  assert.equal(body.get("__hs"), "20747.HYP:comet_pkg.2.1...0");
  assert.equal(body.get("dpr"), "2");
  assert.equal(body.get("__rev"), "1051133768");
  assert.equal(body.get("__hsi"), "7699081856574727250");
  assert.equal(body.get("__comet_req"), "15");
  assert.equal(body.get("fb_dtsg"), h.tokens.dtsg);
  assert.equal(body.get("jazoest"), jazoest(h.tokens.dtsg));
  assert.equal(body.get("lsd"), h.tokens.lsd);
  assert.equal(body.get("__spin_b"), "trunk");
  assert.equal(body.get("fb_api_caller_class"), "RelayModern");
  assert.equal(body.get("fb_api_req_friendly_name"), "CometModernHomeFeedQuery");
  assert.equal(body.get("variables"), '{"a":1}');
  assert.equal(body.get("server_timestamps"), "true");
  assert.equal(body.get("doc_id"), "123456789");
});

test("buildForm omits fields it does not know instead of sending empty values", () => {
  const body = buildForm({ dtsg: null, lsd: "LSDONLY", userId: "5", site: {} }, { friendlyName: "Op", docId: "99999", variables: null, req: 1, session: "s" });
  for (const key of ["fb_dtsg", "__hs", "__rev", "__hsi", "__spin_r", "__spin_b", "__spin_t"]) assert.equal(body.has(key), false, key);
  assert.equal(body.get("jazoest"), jazoest("LSDONLY")); // logged-out pages use the LSD token
  assert.equal(body.get("__comet_req"), "15");
  assert.equal(body.get("variables"), "{}");
});

test("request POSTs the form with the friendly-name and LSD headers, cookies included", async () => {
  const { client, net } = setup();
  const res = await client.request("CometModernHomeFeedQuery", "28136951115834703", { feedStyle: "DEFAULT" });
  assert.deepEqual(res.data, { viewer: { id: "1" } });
  assert.deepEqual(res.errors, []);
  assert.equal(res.lines.length, 1);
  const [call] = net.calls;
  assert.equal(call.url, "/api/graphql/");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.credentials, "include");
  assert.equal(call.headers["content-type"], "application/x-www-form-urlencoded");
  assert.equal(call.headers["x-fb-friendly-name"], "CometModernHomeFeedQuery");
  assert.equal(call.headers["x-fb-lsd"], "AdR16GsCBuzx6HMHP0pOQzBIMP8");
  assert.equal(call.form.get("doc_id"), "28136951115834703");
  assert.equal(call.form.get("fb_api_req_friendly_name"), "CometModernHomeFeedQuery");
  assert.deepEqual(call.variables, { feedStyle: "DEFAULT" });
});

test("__req counts up in base 36 and __s stays the same for the page", async () => {
  const { client, net } = setup();
  for (let i = 0; i < 12; i++) await client.request("Op", "11111", {});
  assert.deepEqual(net.calls.map((c) => c.form.get("__req")), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c"]);
  assert.equal(new Set(net.calls.map((c) => c.form.get("__s"))).size, 1);
  assert.match(net.calls[0].form.get("__s"), /^[0-9a-z]{6}:[0-9a-z]{6}:[0-9a-z]{6}$/);
});

test("responses are JSON lines stitched across @stream and @defer payloads", async () => {
  const { client } = setup({ reply: () => response(fixture("reassembly-vector.jsonl")) });
  const { data, lines } = await client.request("CometNewsFeedPaginationQuery", "11111", {});
  assert.equal(lines.length, 5);
  const feed = data.viewer.news_feed;
  assert.equal(feed.edges.length, 3);
  assert.equal(feed.edges[1].node.post_id, "1002");
  assert.equal(feed.edges[2].node.__typename, "PaginatedPeopleYouMayKnowFeedUnit");
  assert.equal(feed.edges[0].node.comet_sections.feedback.__typename, "CometStoryFeedbackUFIStrategy");
  assert.equal(feed.edges[0].node.comet_sections.content.story.message.text, "hello");
  assert.deepEqual(feed.page_info, { __typename: "PageInfo", end_cursor: "END", has_next_page: true });
});

test("a for (;;); guard is stripped and obfuscated typenames are restored from Env pairs", async () => {
  const harvest = fakeHarvest({ env: { typenamePairs: [["Q4xN7zP9aLbM3vT", "SponsoredData"]], keys: ["q9k7m2x"] } });
  const body = `for (;;);${JSON.stringify({ data: { node: { th_dat_spo: { __typename: "Q4xN7zP9aLbM3vT" } } } })}`;
  const { client } = setup({ harvest, reply: () => response(body) });
  const { data } = await client.request("Op", "11111", {});
  assert.equal(data.node.th_dat_spo.__typename, "SponsoredData");
});

test("error codes become GqlError kinds", async () => {
  for (const [code, kind] of [[1357004, "auth"], [1675012, "variables"], [1570245, "stale-doc"], [1357010, "field"], [1675039, "soft-block"]]) {
    const { client } = setup({ reply: () => response(errorBody(code)) });
    await rejectsKind(client.request("Op", "11111", {}), kind, code);
  }
});

test("unknown codes with no data are server errors; warnings next to data are returned, not thrown", async () => {
  const s1 = setup({ reply: () => response(errorBody(42)) });
  await rejectsKind(s1.client.request("Op", "11111", {}), "server", 42);

  const partial = JSON.stringify({ data: { viewer: { id: "1" } }, errors: [{ message: "partial", code: 1357010, severity: "WARNING" }, { message: "odd", code: 7 }] });
  const s2 = setup({ reply: () => response(partial) });
  const res = await s2.client.request("Op", "11111", {});
  assert.deepEqual(res.data, { viewer: { id: "1" } });
  assert.equal(res.errors.length, 2);
});

test("HTTP failures and network errors map to kinds", async () => {
  const cases = [
    [() => response("", { status: 429 }), "rate"],
    [() => response("", { status: 500 }), "server"],
    [() => response("", { status: 403 }), "auth"],
    [() => response("<html>login</html>", { url: "https://www.facebook.com/login.php?next=x" }), "auth"],
    [() => Promise.reject(new TypeError("Failed to fetch")), "network"],
  ];
  for (const [reply, kind] of cases) {
    const { client } = setup({ reply });
    await rejectsKind(client.request("Op", "11111", {}), kind);
  }
});

test("an empty body is a soft block and starts a cooldown that refuses requests without sending", async () => {
  const { client, net, clock } = setup({ reply: () => response("") });
  await rejectsKind(client.request("Op", "11111", {}), "soft-block");
  assert.equal(client.stats().cooldownMs, 60e3);
  await rejectsKind(client.request("Op", "11111", {}), "rate");
  await rejectsKind(client.request("Op", "11111", {}), "rate");
  assert.equal(net.calls.length, 1, "nothing is sent while cooling down");
  assert.equal(client.stats().cooldownMs, 60e3, "refused requests do not extend the cooldown");
  clock.advance(60e3);
  await rejectsKind(client.request("Op", "11111", {}), "soft-block");
  assert.equal(net.calls.length, 2);
  assert.equal(client.stats().cooldownMs, 120e3, "repeated blocks back off exponentially");
});

test("a checkpoint redirect halts everything and calls onHalt once", async () => {
  const { client, net, halts } = setup({ reply: () => response("<html></html>", { url: "https://www.facebook.com/checkpoint/?next" }) });
  await rejectsKind(client.request("Op", "11111", {}), "checkpoint");
  assert.equal(client.halted, true);
  await rejectsKind(client.request("Op", "11111", {}), "checkpoint");
  assert.equal(net.calls.length, 1);
  assert.deepEqual(halts, ["checkpoint-redirect"]);
  assert.equal(client.stats().haltReason, "checkpoint-redirect");
});

test("account-warning pages, checkpoint flags and checkpoint codes halt", async () => {
  const cases = [
    [response("<html><body>We suspect automated behavior on your account</body></html>"), "account-warning"],
    [response(JSON.stringify({ data: { viewer: null }, config: { "is_checkpointed": true } })), "checkpoint-flag"],
    [response(errorBody(1384000)), "checkpoint-code"],
    [response(errorBody(1, { summary: "Your account is temporarily restricted" })), "account-warning"],
  ];
  for (const [res, reason] of cases) {
    const { client, halts } = setup({ reply: () => res });
    await rejectsKind(client.request("Op", "11111", {}), "checkpoint");
    assert.deepEqual(halts, [reason]);
  }
});

test("stopOnCheckpoint: false fails the request and reports, without stopping later requests", async () => {
  const { client, net, halts } = setup({
    stopOnCheckpoint: false,
    harvest: fakeHarvest({ checkpointed: true }),
    reply: (c, i) => (i === 0 ? response("", { url: "https://www.facebook.com/checkpoint/1501092823525282/" }) : response(OK)),
  });
  await rejectsKind(client.request("Op", "11111", {}), "checkpoint");
  assert.equal(client.halted, false);
  assert.deepEqual((await client.request("Op", "11111", {})).data, { viewer: { id: "1" } });
  assert.deepEqual(halts, ["checkpoint-redirect"]);
  assert.equal(net.calls.length, 2, "the harvested flag alone does not block");
});

test("warning phrases inside story data never halt", async () => {
  const story = { data: { node: { message: { text: "We noticed unusual activity: \"is_checkpointed\":true, temporarily restricted" } } } };
  const { client, halts } = setup({ reply: () => response(JSON.stringify(story)) });
  const res = await client.request("Op", "11111", {});
  assert.equal(res.data.node.message.text.includes("unusual activity"), true);
  assert.deepEqual(halts, []);
  assert.equal(client.halted, false);
});

test("a checkpoint flag in harvested config halts before anything is sent", async () => {
  const { client, net, halts } = setup({ harvest: fakeHarvest({ checkpointed: true }) });
  await rejectsKind(client.request("Op", "11111", {}), "checkpoint");
  assert.equal(net.calls.length, 0);
  assert.deepEqual(halts, ["checkpoint-flag"]);
});

test("a token error refreshes tokens and retries once with the new fb_dtsg", async () => {
  const harvest = fakeHarvest();
  let refreshes = 0;
  const { client, net } = setup({
    harvest,
    reply: (call) => response(call.form.get("fb_dtsg") === "NAcFresh:1:2" ? OK : errorBody(1357051)),
    refreshTokens: () => {
      refreshes++;
      harvest.tokens.dtsg = "NAcFresh:1:2";
    },
  });
  const res = await client.request("Op", "11111", {});
  assert.deepEqual(res.data, { viewer: { id: "1" } });
  assert.equal(refreshes, 1);
  assert.equal(net.calls.length, 2);
  assert.equal(net.calls[1].form.get("jazoest"), jazoest("NAcFresh:1:2"));
  assert.equal(client.stats().retries, 1);
});

test("a token error without a fresher token is not retried", async () => {
  const { client, net } = setup({ reply: () => response(errorBody(1677047)), refreshTokens: () => {} });
  await rejectsKind(client.request("Op", "11111", {}), "token", 1677047);
  assert.equal(net.calls.length, 1);
});

test("the retry after a token refresh happens only once", async () => {
  const harvest = fakeHarvest();
  let n = 0;
  const { client, net } = setup({ harvest, reply: () => response(errorBody(1357051)), refreshTokens: () => (harvest.tokens.dtsg = `NAcNew${++n}`) });
  await rejectsKind(client.request("Op", "11111", {}), "token");
  assert.equal(net.calls.length, 2);
});

test("no viewer means not logged in; a missing fb_dtsg is looked for once before giving up", async () => {
  const s1 = setup({ harvest: fakeHarvest({ tokens: { userId: "0" } }) });
  await rejectsKind(s1.client.request("Op", "11111", {}), "auth");
  assert.equal(s1.net.calls.length, 0);

  const harvest = fakeHarvest({ tokens: { dtsg: null } });
  const s2 = setup({ harvest, refreshTokens: () => (harvest.tokens.dtsg = "NAcLate:1:1") });
  await s2.client.request("Op", "11111", {});
  assert.equal(s2.net.calls[0].form.get("fb_dtsg"), "NAcLate:1:1");

  const s3 = setup({ harvest: fakeHarvest({ tokens: { dtsg: null } }), refreshTokens: () => {} });
  await rejectsKind(s3.client.request("Op", "11111", {}), "token");
  assert.equal(s3.net.calls.length, 0);
});

test("one request in flight at a time, even when callers fire them together", async () => {
  const { client, net } = setup({ delay: 5 });
  const results = await Promise.allSettled([1, 2, 3, 4].map((i) => client.request(`Op${i}`, "11111", { i })));
  assert.ok(results.every((r) => r.status === "fulfilled"));
  assert.equal(net.maxInFlight, 1);
  assert.deepEqual(net.calls.map((c) => c.variables.i), [1, 2, 3, 4], "FIFO order");
});

test("a failed request does not block the queue", async () => {
  const { client } = setup({ reply: (call, i) => (i === 0 ? Promise.reject(new Error("boom")) : response(OK)) });
  const [a, b] = await Promise.allSettled([client.request("Op", "11111", {}), client.request("Op", "11111", {})]);
  assert.equal(a.status, "rejected");
  assert.equal(b.status, "fulfilled");
});

test("requests are spaced by at least minGapMs with jitter (virtual clock)", async () => {
  const clock = fakeClock();
  const starts = [];
  let r = 0;
  const randoms = [0, 0.99, 0.4, 0.7];
  const net = fakeFetch(() => {
    starts.push(clock.now());
    clock.advance(300); // server time
    return response(OK);
  });
  const client = createGqlClient({
    platform: { fetch: net.fetch },
    harvest: fakeHarvest(),
    codec,
    now: clock.now,
    sleep: clock.sleep,
    random: () => randoms[r++ % randoms.length],
    visibility: { hidden: () => false, wait: async () => {} },
  });
  await Promise.all([0, 1, 2, 3, 4].map(() => client.request("Op", "11111", {})));
  assert.equal(starts.length, 5);
  for (let i = 1; i < starts.length; i++) {
    const gap = starts[i] - (starts[i - 1] + 300);
    assert.ok(gap >= 1500, `gap ${gap} >= 1500`);
    assert.ok(gap < 2250, `gap ${gap} < 2250`);
  }
  assert.equal(new Set(starts.slice(1).map((s, i) => s - starts[i])).size > 1, true, "gaps vary");
});

test("nothing is sent while the tab is hidden", async () => {
  let hidden = true;
  let wake;
  const visibility = { hidden: () => hidden, wait: () => new Promise((r) => (wake = r)) };
  const { client, net } = setup({ visibility });
  const pending = client.request("Op", "11111", {});
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(net.calls.length, 0);
  hidden = false;
  wake();
  await pending;
  assert.equal(net.calls.length, 1);
});

test("stats report counts and errors by kind, never tokens", async () => {
  const { client, harvest } = setup({ reply: (c, i) => response(i ? errorBody(1675012) : OK) });
  await client.request("Op", "11111", {});
  await assert.rejects(client.request("Op", "11111", {}));
  const stats = client.stats();
  assert.equal(stats.requests, 2);
  assert.equal(stats.ok, 1);
  assert.deepEqual(stats.errors, { variables: 1 });
  assert.equal(stats.inFlight, false);
  assert.equal(stats.halted, false);
  assert.equal(JSON.stringify(stats).includes(harvest.tokens.dtsg), false);
});
