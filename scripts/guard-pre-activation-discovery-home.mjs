#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260907163000_pre_activation_discovery_event_authority.sql");
const home = read("app/(tabs)/index.tsx");
const live = read("app/(tabs)/live.tsx");
const explore = read("app/(tabs)/explore.tsx");
const saved = read("app/(tabs)/my-list.tsx");
const channel = read("app/channel/[userId].tsx");
const event = read("app/event/[eventId].tsx");
const eventSource = read("_lib/liveEvents.ts");
const discoverySource = read("_lib/discoveryFeed.ts");
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
assert.ok(home.includes('title: "Circle Watch-Party"'), "Home must use the customer-facing Circle Watch-Party heading");
assert.ok(home.includes("Official Chi&apos;llywood"), "Rachi official identity must remain creator-tied rather than a section status");
assert.ok(home.includes("readLatestPublicEventSummaries({ limit: 24 }).catch"), "Home Event failure must not erase independent public creator rails");
assert.ok(live.includes("readLatestPublicEventSummaries({ limit: 32 }).catch"), "Live Event failure must not erase active discovery");

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
assert.ok(discoverySource.includes('item.source_type === "live_stage_room"')
  && discoverySource.includes('/watch-party/live-stage/${encodeURIComponent(roomId)}'),
"Live discovery cards must route the exact Live Stage source without Party Room crossover");
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
