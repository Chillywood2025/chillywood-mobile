#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260907163000_pre_activation_discovery_event_authority.sql");
const lifecycleClosure = read("supabase/migrations/20260907195000_pre_activation_discovery_lifecycle_fixture_closure.sql");
const physicalFixtureClosure = read("supabase/migrations/20260907230000_pre_activation_physical_feed_fixture_quarantine.sql");
const home = read("app/(tabs)/index.tsx");
const live = read("app/(tabs)/live.tsx");
const liveTabDiscoveryBuckets = read("_lib/liveTabDiscoveryBuckets.ts");
const explore = read("app/(tabs)/explore.tsx");
const saved = read("app/(tabs)/my-list.tsx");
const channel = read("app/channel/[userId].tsx");
const channelSettings = read("app/channel-settings.tsx");
const event = read("app/event/[eventId].tsx");
const creatorVideoCard = read("components/creator-media/creator-video-card.tsx");
const replayPlayer = read("app/player/replay/[replayId].tsx");
const eventSource = read("_lib/liveEvents.ts");
const discoverySource = read("_lib/discoveryFeed.ts");
const creatorVideoSource = read("_lib/creatorVideos.ts");
const liveStage = read("app/watch-party/live-stage/[partyId].tsx");
const livekitClient = read("_lib/livekit/token-contract.ts");
const livekitEdge = read("supabase/functions/livekit-token/index.ts");
const notifications = read("supabase/functions/notification-dispatch/index.ts");
const foregroundRefresh = read("hooks/useRefreshOnForeground.ts");
const releaseSource = read("config/release/ios-internal-v2.json");
const generatedRelease = read("supabase/functions/_shared/release-manifest-contract.generated.mjs");

for (const [label, source] of [["Home", home], ["creator Platform", channel]]) {
  for (const forbidden of ["Circle Watch-Party Ready", ">Empty<", ">Ready<", ">Official<"]) {
    assert.ok(!source.includes(forbidden), `${label} exposes release-facing status copy: ${forbidden}`);
  }
}
for (const [label, source] of [["Explore", explore], ["Saved", saved]]) {
  assert.ok(!/\$\{[^}]+\}\s+ready\b/iu.test(source), `${label} exposes a release-facing ready count`);
}
assert.ok(!creatorVideoCard.includes('"Media Ready"'), "public creator cards must not expose a generic Media Ready status");
assert.ok(creatorVideoCard.includes("ownerMode || !playable"), "public playable creator cards must omit redundant media-status pills");
assert.ok((creatorVideoCard.match(/accessibilityRole="button"/gu) ?? []).length >= 2,
  "compact and detail creator cards must expose button semantics");
assert.ok(creatorVideoCard.includes("accessibilityState={{ disabled: !playable && !ownerMode }}"),
  "creator cards must expose unavailable state accessibly");
assert.ok(creatorVideoCard.includes("creator video."), "creator card labels must identify the content type and visibility");
assert.ok(!replayPlayer.includes('"Ready Replay"'), "the public replay route must use customer-facing availability copy");
assert.ok(home.includes('title: "Circle Watch-Party"'), "Home must use the customer-facing Circle Watch-Party heading");
assert.ok(home.includes("Official Chi&apos;llywood"), "Rachi official identity must remain creator-tied rather than a section status");
assert.ok(home.includes("readLatestPublicEventSummaries({ limit: 24 }).catch"), "Home Event failure must not erase independent public creator rails");
assert.ok(live.includes("readLatestPublicEventSummaries({ limit: 32 }).catch"), "Live Event failure must not erase active discovery");
assert.ok(live.includes("buildLiveTabDiscoveryBuckets(discoveryItems, events)"),
  "Live must use the tested lifecycle-aware discovery buckets");
assert.ok(channelSettings.includes("styles.eventCardActionStack")
  && channelSettings.includes("styles.eventCardMonetizationRow")
  && channelSettings.includes("styles.eventCardMonetizationButton"),
"creator Event cards must separate navigation from monetization controls on small screens");
assert.ok(channelSettings.includes('eventCardOpenButton: {\n    flex: 0,\n    width: "100%"')
  && channelSettings.includes("eventCardMonetizationButton: {\n    flex: 0,\n    flexBasis: 132,\n    flexGrow: 1,\n    flexShrink: 1,\n    minWidth: 132"),
"creator Event actions must reserve measured rows instead of overlapping following content");
assert.ok(channelSettings.includes('accessibilityLabel={`Open ${event.eventTitle} Event`}'),
  "creator Event navigation must expose the exact Event title accessibly");

const compiledLiveTabDiscoveryBuckets = ts.transpileModule(liveTabDiscoveryBuckets, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    strict: true,
  },
}).outputText;
const liveTabDiscoveryBucketModule = { exports: {} };
new Function("exports", "module", "require", compiledLiveTabDiscoveryBuckets)(
  liveTabDiscoveryBucketModule.exports,
  liveTabDiscoveryBucketModule,
  require,
);
const { buildLiveTabDiscoveryBuckets } = liveTabDiscoveryBucketModule.exports;
const futureEvent = { id: "future-event", isLiveNow: false, isUpcoming: true };
const scheduledProjection = { id: "scheduled-projection", event_id: "future-event", live_state: "scheduled" };
const futureBuckets = buildLiveTabDiscoveryBuckets([scheduledProjection], [futureEvent]);
assert.deepEqual(futureBuckets.upcomingEvents.map(({ id }) => id), ["future-event"],
  "a canonical scheduled projection must not suppress its Upcoming Event card");
const activeEvent = { id: "active-event", isLiveNow: true, isUpcoming: false };
const liveProjection = { id: "live-projection", event_id: "active-event", live_state: "live" };
const activeBuckets = buildLiveTabDiscoveryBuckets([liveProjection], [activeEvent]);
assert.equal(activeBuckets.liveItems.length, 1,
  "a canonical live projection must remain in Live Now");
assert.equal(activeBuckets.liveEvents.length, 0,
  "a rendered live projection must de-duplicate its active Event summary");

const compiledDiscoverySource = ts.transpileModule(discoverySource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    strict: true,
  },
}).outputText;
const discoverySourceModule = { exports: {} };
new Function("exports", "module", "require", compiledDiscoverySource)(
  discoverySourceModule.exports,
  discoverySourceModule,
  (specifier) => {
    if (specifier === "./channelAudience") return { readFollowedChannelUserIds: async () => [] };
    if (specifier === "./friendGraph") return { readActiveFriendUserIds: async () => [] };
    if (specifier === "./supabase") return { supabase: {} };
    return {};
  },
);
const { getDiscoveryItemDestination } = discoverySourceModule.exports;
for (const sourceType of ["live_stage_room", "watch_party_room"]) {
  assert.equal(
    getDiscoveryItemDestination({
      id: `${sourceType}-item`,
      item_type: "live_room",
      room_id: `${sourceType}-room`,
      source_type: sourceType,
    }),
    `/spectate/${sourceType}-item`,
    `${sourceType} discovery must resolve audience authority before entering a room route`,
  );
}

for (const [label, source] of [["Home", home], ["Live", live], ["Explore", explore], ["Saved", saved]]) {
  assert.ok(source.includes("useBottomTabBarHeight"), `${label} must derive final scroll clearance from the actual tab bar`);
  assert.ok(source.includes("bottomTabBarHeight"), `${label} must apply the measured bottom inset`);
}
for (const [label, source] of [["Home", home], ["Live", live], ["Explore", explore]]) {
  assert.ok(source.includes("accessibilityLabel"), `${label} discovery cards need deterministic accessibility meaning`);
  assert.ok(source.includes("useRefreshOnForeground"), `${label} must refresh canonical discovery after foreground resume`);
  assert.ok(source.includes("LoadGenerationRef") && source.includes("generation !=="),
    `${label} must prevent an older discovery request from overwriting newer authoritative state`);
}
assert.ok(foregroundRefresh.includes('nextState === "active"') && foregroundRefresh.includes('appStateRef.current !== "active"'),
  "foreground refresh must run once on a real inactive-to-active transition");
assert.ok(event.includes("Audience") && event.includes("accessibilityLabel"), "Event detail must expose its authoritative audience accessibly");
assert.ok(eventSource.includes('.eq("visibility", "public")'), "public Event queries must request only public authoritative rows");
assert.ok(discoverySource.includes('item.live_state === "scheduled"')
  && discoverySource.includes("startsAtMillis > nowMillis")
  && discoverySource.includes('item.live_state === "live" && item.ended_at')
  && discoverySource.includes("endedAtMillis > nowMillis"),
"public and Circle discovery hydration must reject stale schedule/end boundaries");
assert.ok(creatorVideoSource.includes('.in("moderation_status", ["clean", "reported"])')
  && creatorVideoSource.includes('.eq("scan_status", "clean")')
  && creatorVideoSource.includes('.is("quarantined_at", null)'),
"relationship video hydration must not re-expose unsafe or quarantined sources");

for (const required of [
  'add column if not exists "visibility"',
  'can_read_creator_event',
  'join_watch_party_room_session_pre_discovery_rfgc',
  'resolve_watch_party_livekit_authority_pre_discovery_rfgc',
  'sync_creator_event_discovery_after_write',
  'sync_paid_creator_event_discovery_after_write',
  'publish_live_stage_discovery',
  'sync_spectator_broadcast_discovery_after_write',
  'sync_spectator_playback_discovery_after_write',
  'revoke insert, update, delete on table public."discovery_feed_items" from authenticated',
  "d7f_public_safe_approved",
  "circle_spectator_approved",
  "positively_identified_qa_fixture",
]) assert.ok(migration.includes(required), `canonical discovery migration missing ${required}`);

for (const required of [
  'sync_creator_event_discovery_lifecycle_boundary_not_found',
  'media_scan_public_safe',
  'sync_creator_video_feed_items_after_change',
  'can_read_creator_feed_item',
  'can_read_circle_spectator_feed_item',
  'discovery_feed_items_select_public_safe_authenticated',
  'pre_activation_discovery_lifecycle_fixture_closure_v1',
  "v_event.\"starts_at\" <= v_now",
  "v_event.\"ends_at\" <= v_now",
]) assert.ok(lifecycleClosure.includes(required), `lifecycle/fixture closure missing ${required}`);

for (const required of [
  "4a75de25-b1c9-48b3-b45c-90ccbffc7449",
  "Supabase Fallback Runtime Proof 2026-04-30T21-47-33-462Z",
  "pre_activation_physical_proof_fixture_quarantine_v1",
  '"visibility" = \'draft\'',
  '"moderation_status" = \'hidden\'',
  '"quarantined_at" = coalesce',
  '"status" = \'hidden\'',
  "canonical_projection_active",
]) assert.ok(physicalFixtureClosure.includes(required), `physical fixture closure missing ${required}`);
assert.ok(!physicalFixtureClosure.includes("delete from"),
  "physical fixture closure must preserve source, comment, audit, and provider evidence");

assert.ok(livekitClient.includes('action: "mark-room-live"'), "the connected host must request the exact server publication transition");
assert.ok(livekitClient.includes("attempt < 3") && livekitClient.includes("response.status !== 409"),
  "the connected host must retry only the bounded provider-propagation race");
assert.ok(liveStage.includes("onConnectedAuthoritative") && liveStage.includes("markLiveStageRoomConnectedForDiscovery"),
  "Live discovery must begin only at the provider-connected host boundary");
assert.ok(livekitEdge.includes('action === "mark-room-live"') && livekitEdge.includes('surface !== "live-stage"'),
  "the LiveKit edge boundary must bind publication to Live Stage");
assert.ok(livekitEdge.includes("fetchExistingLiveKitAssignmentEndpoint")
  && livekitEdge.includes("listParticipants(room.roomName)")
  && livekitEdge.includes("live_discovery_provider_host_unconfirmed"),
"the server must confirm the exact host in the assigned LiveKit room before discovery publication");
assert.ok(discoverySource.includes('return `/spectate/${encodeURIComponent(item.id)}`'),
  "discovery cards must enter the authority-resolving Spectator route");
assert.ok(!discoverySource.includes('/watch-party/live-stage/${encodeURIComponent(roomId)}'),
"Live discovery cards must never enter the host-capable Live Stage route directly");
for (const surface of [home, live, explore]) {
  assert.ok(surface.includes("getDiscoveryItemDestination(item)"),
    "Home, Live, and Explore must share the spectator-safe discovery destination boundary");
}
assert.ok(notifications.includes("read_authorized_event_reminder_recipients")
  && notifications.includes("chillywoodmobile://event/"),
"Event notifications must reuse Event authority and exact Event deep links");

const releaseManifest = JSON.parse(releaseSource);
assert.equal(releaseManifest.releaseLane, "internal-v2");
assert.equal(releaseManifest.buildProfile, "ios-internal-v2");
assert.equal(releaseManifest.nativeBuild, "13");
assert.equal(releaseManifest.runtimeVersion, "1.0.0-ios-production-v2");
assert.equal(releaseManifest.channel, "ios-internal-v2");
assert.match(releaseManifest.expectedBinarySourceCommit, /^[0-9a-f]{40}$/u);
assert.match(releaseManifest.currentOtaSourceCommit, /^[0-9a-f]{40}$/u);
assert.match(releaseManifest.currentOtaUpdateGroup, /^[0-9a-f-]{36}$/u);
assert.ok(generatedRelease.includes("IOS_INTERNAL_V2_RELEASE_MANIFEST"));
assert.ok(!generatedRelease.includes("IOS_QA_RELEASE_MANIFEST") && !generatedRelease.includes("ios-qa"),
  "generated release authority cannot regress to obsolete iOS QA identity");
assert.ok(read("supabase/functions/_shared/ios-autonomous-operator-policy.mjs")
  .includes('!String(expected?.appStoreConnectBuildId ?? "").trim()'),
"an unavailable App Store build ID must remain unverified rather than matching null authority");

console.log("Pre-activation discovery, Home, Event, and iOS manifest guard passed.");
