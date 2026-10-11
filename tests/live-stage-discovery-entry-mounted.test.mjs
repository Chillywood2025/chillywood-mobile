import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const React = require("react");
const { createRoot } = require("react-dom/client");
const ts = require("typescript");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const document = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml",
  nodeName: "DIV", nodeType: 1, ownerDocument: document, parentNode: null, tagName: "DIV" });
document.documentElement = container();
globalThis.document = document;
globalThis.window = globalThis;
globalThis.HTMLIFrameElement = class {};
const owner = (id = "viewer") => ({ userId: id, accountId: id, sessionGeneration: `${id}-session`, state: "ACTIVE", restoreOnly: false });
const sameOwner = (a, b) => !!a && !!b && a.userId === b.userId && a.accountId === b.accountId
  && a.sessionGeneration === b.sessionGeneration && a.restoreOnly === b.restoreOnly;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const projection = (lane = "public", overrides = {}) => ({
  id: "projection-a", source_type: "live_stage_room", source_id: "STAGE42", room_id: "STAGE42",
  item_type: "live_room", owner_user_id: "host", channel_user_id: "host", host_user_id: "host",
  creator_user_id: "host", title: "A current stage", live_state: "live", ended_at: null,
  starts_at: new Date().toISOString(), published_at: new Date().toISOString(),
  visibility: lane, access_type: lane === "public" ? "public_free" : "circle", status: "active",
  is_publicly_discoverable: lane === "public", is_spectator_enabled: true,
  is_spectator_playback_enabled: false, rights_status: "creator_owned", moderation_status: "clean",
  discovery_surface: "home_profile_channel", ranking_score: 100,
  metadata: { producer: "canonical_live_stage_v1", canonical_projection_active: true, destination: "live_stage", room_id: "STAGE42" },
  ...overrides,
});

async function mount(t, { lane = "public", row = projection(lane), initialAuthority = owner(), query, authorityRead,
  screen = "entry", ranked = [] } = {}) {
  let authority = initialAuthority, itemId = row?.id ?? "projection-a", reader = authorityRead ?? (async () => authority);
  let disposed = false;
  const routes = [], reads = [], lists = [], cache = new Map();
  const appListeners = new Set();
  const AppState = { currentState: 'active', addEventListener: (_, fn) => { appListeners.add(fn); return { remove: () => appListeners.delete(fn) }; } };
  const router = { replace: value => routes.push(JSON.parse(JSON.stringify(value))), back: noop };
  const database = { from(table) {
    const filters = [];
    const q = { select: () => q, eq: (key, value) => { filters.push([key, value]); return q; },
      in: (key, values) => { filters.push([key, values]); return q; }, order: () => q, limit: () => q,
      async returns() {
        reads.push({ table, filters });
        if (query) return query(table, { authority, row, filters });
        const ownLane = table === "discovery_feed_items" ? "public" : "circle";
        const data = ownLane === lane ? [row, ...ranked].filter(candidate => candidate && filters.every(([key, value]) =>
          Array.isArray(value) ? value.includes(candidate[key]) : candidate[key] === value)) : [];
        return { data, error: null };
      } };
    return q;
  } };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    const context = { exports, console, setTimeout, clearTimeout, setInterval: () => 1, clearInterval: noop, require(name) {
      if (name === "react") return React;
      if (name === "react-native") return { AppState, ActivityIndicator: () => null, Text: () => null,
        View: ({ children }) => React.createElement(React.Fragment, null, children), Pressable: () => null,
        FlatList: ({ data }) => { lists.push(Array.from(data, item => item.id)); return null; },
        Image: () => null, Modal: () => null, TouchableOpacity: () => null, Alert: {}, Share: {},
        useWindowDimensions: () => ({ height: 800 }), StyleSheet: { create: value => value } };
      if (name === "expo-router") return { useLocalSearchParams: () => ({ itemId, lane }), useRouter: () => router,
        useFocusEffect: callback => React.useEffect(callback, [callback]), router };
      if (name === "expo-av") return { ResizeMode: { CONTAIN: "contain" }, Video: () => null };
      if (name === "react-native-safe-area-context") return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
      if (name.endsWith("/session")) return { useSession: () => ({ authority, authorityStatus: authority ? "active" : "anonymous", isSignedIn: !!authority }) };
      if (name.endsWith("/accountSessionAuthority")) return { readCurrentAccountSessionAuthority: () => reader(), sameAccountSessionAuthority: sameOwner };
      if (name === "./supabase") return { supabase: database };
      if (name === "./channelAudience") return { readFollowedChannelUserIds: async () => [] };
      if (name === "./friendGraph") return { readActiveFriendUserIds: async () => [] };
      if (name.endsWith("/discoveryFeed")) return load("_lib/discoveryFeed.ts");
      if (name.endsWith("/circleSpectatorFeed")) return load("_lib/circleSpectatorFeed.ts");
      if (name.endsWith("/liveStageDiscoveryDestination")) return load("_lib/liveStageDiscoveryDestination.ts");
      if (name.endsWith("/partyRoomDiscoveryDestination")) return load("_lib/partyRoomDiscoveryDestination.ts");
      if (name.endsWith("/spectatorAccess")) return { resolveSpectatorAccess: () => ({}) };
      if (name.endsWith("/spectatorPlayback")) return {};
      if (name.endsWith("/spectatorChildRooms")) return {};
      if (name.endsWith("/actionSingleFlight.mjs")) return { createActionSingleFlightLatch: () => ({ release: noop }) };
      if (name.endsWith("/moderation")) return {};
      if (name.endsWith("/performancePolicy")) return { SPECTATOR_LIFECYCLE_REFRESH_MS: 15000 };
      if (name.endsWith("/useNotificationViewTracking")) return { useNotificationViewTracking: () => noop };
      if (name.endsWith("/notificationViewProgress.mjs")) return { notificationPlaybackRecordId: () => null };
      if (name.endsWith("/supabase")) return { SUPABASE_URL: "https://fixture.invalid" };
      if (name.endsWith("/report-sheet")) return { ReportSheet: () => null };
      if (name.endsWith("/useRefreshOnForeground")) return { useRefreshOnForeground: noop };
      if (name.includes("spectate-metadata")) return { default: () => null, __esModule: true };
      throw Error(`unmodeled dependency ${name}`);
    } };
    const source = fs.readFileSync(file, "utf8");
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
      jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText, context, { filename: file });
    cache.set(file, exports); return exports;
  }
  const Screen = load(screen === "entry" ? "app/spectate/[itemId].tsx" : "app/spectate-live/[itemId].tsx").default;
  const root = createRoot(container());
  const render = () => React.act(async () => { root.render(React.createElement(Screen)); });
  await render();
  t.after(async () => { if (!disposed) await React.act(async () => root.unmount()); });
  return { routes, reads, lists, async account(value) { authority = value; await render(); },
    async background() { await React.act(async () => { AppState.currentState = 'background'; for (const fn of appListeners) fn('background'); }); },
    async item(value) { itemId = value; await render(); }, readAuthority(fn) { reader = fn; },
    async resolve(d, value) { await React.act(async () => d.resolve(value)); },
    async unmount() { disposed = true; await React.act(async () => root.unmount()); } };
}

const partyProjection = (lane = 'public', changes = {}) => projection(lane, {
  source_type: 'party_room', source_id: 'PARTY42', room_id: 'PARTY42', item_type: 'watch_party',
  rights_status: 'metadata_only', is_spectator_enabled: false, is_spectator_playback_enabled: false,
  requires_premium_to_join: true, access_type: lane === 'public' ? 'premium_only' : 'circle',
  metadata: { producer: 'canonical_party_room_v1', destination: 'party_room_join', room_id: 'PARTY42',
    canonical_projection_active: true, content_source_type: 'platform_title', content_source_id: 'title-a', publication_id: 'publication-a' },
  ...changes,
});

for (const lane of ['public', 'circle']) test(`actual ${lane} metadata-only Party card enters guarded waiting preview without host or playback intent`, async t => {
  const h = await mount(t, { lane, row: partyProjection(lane) });
  assert.deepEqual(h.routes, [{ pathname: '/watch-party', params: { partyId: 'PARTY42', source: 'discovery', discoveryItemId: 'projection-a', discoveryLane: lane } }]);
});

for (const [name, change] of Object.entries({
  rights: { rights_status: 'creator_owned' }, playback: { is_spectator_playback_enabled: true },
  spectator: { is_spectator_enabled: true }, ended: { ended_at: new Date().toISOString() },
  private: { visibility: 'private' }, owner: { owner_user_id: 'someone-else' },
  destination: { metadata: { ...partyProjection().metadata, destination: 'spectate_live' } },
  source: { metadata: { ...partyProjection().metadata, content_source_id: '' } },
  publication: { metadata: { ...partyProjection().metadata, publication_id: null } },
})) test(`metadata-only Party rejects ${name} mismatch`, async t => {
  const h = await mount(t, { row: partyProjection('public', change) });
  assert.equal(h.routes.length, 0);
});

test('Party source replaced during session read cannot commit the old destination', async t => {
  let reads = 0;
  const h = await mount(t, { row: partyProjection(), query: table => ({ data: table === 'discovery_feed_items'
    ? [++reads === 1 ? partyProjection() : partyProjection('public', { metadata: { ...partyProjection().metadata, content_source_id: 'replacement' } })] : [], error: null }) });
  assert.equal(h.routes.length, 0);
});

test('Party route held in background cannot open after its response returns', async t => {
  const d = deferred();
  const h = await mount(t, { row: partyProjection(), authorityRead: () => d.promise });
  await h.background(); await h.resolve(d, owner()); assert.equal(h.routes.length, 0);
});

for (const lane of ["public", "circle"]) test(`actual ${lane} canonical Live Stage enters existing viewer-stage route, not HLS`, async t => {
  const h = await mount(t, { lane });
  assert.deepEqual(h.routes, [{ pathname: "/watch-party/live-stage/[partyId]", params: { partyId: "STAGE42", source: "discovery" } }]);
  assert.ok(h.reads.some(read => read.filters.some(([key, value]) => key === "id" && value === "projection-a")));
});

test("approved watch-party HLS keeps its existing spectator destination", async t => {
  const h = await mount(t, { row: projection("public", { source_type: "watch_party_room", item_type: "watch_party", is_spectator_playback_enabled: true,
    metadata: { producer: "canonical_spectator_broadcast_v1" } }) });
  assert.deepEqual(h.routes, ["/spectate-live/projection-a?lane=public"]);
});

for (const [label, change] of Object.entries({
  private: { visibility: "private", is_publicly_discoverable: false },
  hidden: { moderation_status: "hidden" },
  ended: { ended_at: new Date(Date.now() - 60_000).toISOString() },
  "unsafe rights": { rights_status: "unknown_block_public_spectator" },
  "wrong source room": { source_id: "OTHER42" },
  "wrong metadata room": { metadata: { ...projection().metadata, room_id: "OTHER42" } },
  "unconfirmed projection": { metadata: { ...projection().metadata, canonical_projection_active: false } },
  "wrong producer": { metadata: { ...projection().metadata, producer: "manual_foundation" } },
  "disabled spectator metadata": { is_spectator_enabled: false },
})) test(`${label} canonical stage never navigates`, async t => {
  const h = await mount(t, { row: projection("public", change) });
  assert.deepEqual(h.routes, []);
});

for (const lane of ["public", "circle"]) test(`${lane} query denial or failure never routes from a stale projection`, async t => {
  const h = await mount(t, { lane, query: async () => ({ data: null, error: { message: "not available" } }) });
  assert.deepEqual(h.routes, []);
});

for (const initialAuthority of [null, { ...owner(), restoreOnly: true }]) test(`stage requires current non-restoring session: ${initialAuthority ? "restore" : "anonymous"}`, async t => {
  const h = await mount(t, { initialAuthority });
  assert.deepEqual(h.routes, []);
});

for (const [label, authorityRead] of [
  ["revoked", async () => null],
  ["replaced account", async () => owner("other")],
  ["replaced session", async () => ({ ...owner(), sessionGeneration: "new-session" })],
  ["authority error", async () => { throw Error("offline"); }],
]) test(`${label} read prevents stage navigation`, async t => {
  const h = await mount(t, { authorityRead });
  assert.deepEqual(h.routes, []);
});

test("row hidden while authority is held is re-read before navigating", async t => {
  const d = deferred(); let publicReads = 0;
  const h = await mount(t, { authorityRead: () => d.promise, query: async table => ({
    data: table === "discovery_feed_items" && ++publicReads === 1 ? [projection()] : [], error: null,
  }) });
  assert.deepEqual(h.routes, []);
  await h.resolve(d, owner());
  assert.equal(publicReads, 2);
  assert.deepEqual(h.routes, []);
});

for (const replacement of ["account", "item", "unmount"]) test(`held authorized projection cannot cross ${replacement} replacement`, async t => {
  const d = deferred(); let first = true;
  const h = await mount(t, { query: async table => {
    if (table === "discovery_feed_items" && first) { first = false; return d.promise; }
    return { data: [], error: null };
  } });
  if (replacement === "account") await h.account(owner("replacement"));
  else if (replacement === "item") await h.item("projection-b");
  else await h.unmount();
  await h.resolve(d, { data: [projection()], error: null });
  assert.deepEqual(h.routes, []);
});

test("held final stage reread cannot route after account replacement", async t => {
  const d = deferred(); let publicReads = 0;
  const h = await mount(t, { query: async (table, { authority }) => {
    if (authority.userId !== "viewer" || table !== "discovery_feed_items") return { data: [], error: null };
    if (++publicReads === 2) return d.promise;
    return { data: [projection()], error: null };
  } });
  await h.account(owner("replacement"));
  await h.resolve(d, { data: [projection()], error: null });
  assert.deepEqual(h.routes, []);
});

for (const changed of [null, owner("replacement"), { ...owner(), sessionGeneration: "replaced-before-render" }])
  test(`authority changed during final row read before context rerender blocks route: ${changed?.sessionGeneration ?? "logout"}`, async t => {
    const d = deferred(); let publicReads = 0, actualAuthority = owner();
    const h = await mount(t, { authorityRead: async () => actualAuthority, query: async table => {
      if (table !== "discovery_feed_items") return { data: [], error: null };
      if (++publicReads === 2) return d.promise;
      return { data: [projection()], error: null };
    } });
    actualAuthority = changed;
    await h.resolve(d, { data: [projection()], error: null });
    assert.equal(publicReads, 2);
    assert.deepEqual(h.routes, []);
  });

test("approved public HLS remains readable without a signed-in stage session", async t => {
  const h = await mount(t, { initialAuthority: null, row: projection("public", {
    source_type: "watch_party_room", item_type: "watch_party", is_spectator_playback_enabled: true,
    metadata: { producer: "canonical_spectator_broadcast_v1" },
  }) });
  assert.deepEqual(h.routes, ["/spectate-live/projection-a?lane=public"]);
});

for (const lane of ["public", "circle"]) test(`direct ${lane} immersive stage link returns through guarded entry`, async t => {
  const h = await mount(t, { screen: "immersive", lane });
  assert.deepEqual(h.routes, [{ pathname: "/spectate/[itemId]", params: { itemId: "projection-a" } }]);
  assert.deepEqual(h.lists, []);
});

for (const lane of ["public", "circle"]) test(`${lane} HLS swiping never renders a non-HLS Live Stage as playback`, async t => {
  const hls = projection(lane, { id: "hls-a", source_type: "watch_party_room", item_type: "watch_party",
    is_spectator_playback_enabled: true, metadata: { producer: "canonical_spectator_broadcast_v1" } });
  const h = await mount(t, { screen: "immersive", lane, row: hls, ranked: [projection(lane)] });
  assert.deepEqual(h.routes, []);
  assert.ok(h.lists.length > 0);
  assert.deepEqual(h.lists.at(-1), ["hls-a"]);
});

for (const replacement of ["account", "item", "unmount"]) test(`held direct stage read is retired by ${replacement} change`, async t => {
  const d = deferred(); let first = true;
  const h = await mount(t, { screen: "immersive", query: async () => {
    if (first) { first = false; return d.promise; }
    return { data: [], error: null };
  } });
  if (replacement === "account") await h.account(owner("replacement"));
  else if (replacement === "item") await h.item("projection-b");
  else await h.unmount();
  await h.resolve(d, { data: [projection()], error: null });
  assert.deepEqual(h.routes, []);
  assert.deepEqual(h.lists, []);
});

for (const lane of ["public", "circle"]) test(`denied or ended direct ${lane} stage cannot redirect`, async t => {
  const denied = await mount(t, { screen: "immersive", lane, query: async () => ({ data: null, error: { message: "denied" } }) });
  assert.deepEqual(denied.routes, []);
  const ended = await mount(t, { screen: "immersive", lane, row: projection(lane, { live_state: "ended" }) });
  assert.deepEqual(ended.routes, []);
});

test("held HLS ranking cannot publish an old account list", async t => {
  const d = deferred();
  const hls = projection("public", { id: "hls-a", source_type: "watch_party_room", item_type: "watch_party",
    is_spectator_playback_enabled: true, metadata: { producer: "canonical_spectator_broadcast_v1" } });
  const h = await mount(t, { screen: "immersive", row: hls, query: async (table, { filters, authority }) => {
    if (table !== "discovery_feed_items" || authority.userId !== "viewer") return { data: [], error: null };
    return filters.some(([key]) => key === "id") ? { data: [hls], error: null } : d.promise;
  } });
  await h.account(owner("replacement"));
  await h.resolve(d, { data: [hls, projection()], error: null });
  assert.deepEqual(h.lists, []);
  assert.deepEqual(h.routes, []);
});
