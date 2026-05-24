import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

const readSource = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Refresh/video cost policy guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing.`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not be present.`);
};

const readNumericConst = (source, name) => {
  const match = source.match(new RegExp(`export\\s+const\\s+${name}\\s*=\\s*([0-9_]+)`));
  if (!match) {
    fail(`${name} constant is missing.`);
    return Number.NaN;
  }
  return Number(String(match[1]).replaceAll("_", ""));
};

const performancePolicy = readSource("_lib/performancePolicy.ts");
const partyRoom = readSource("app/watch-party/[partyId].tsx");
const liveStage = readSource("app/watch-party/live-stage/[partyId].tsx");
const liveKitSurface = readSource("components/watch-party-live/livekit-stage-media-surface.tsx");
const communicationSession = readSource("hooks/use-communication-room-session.ts");
const roomRules = readSource("_lib/roomRules.ts");
const chatThread = readSource("app/chat/[threadId].tsx");
const premiumLiveAccess = readSource("_lib/premiumWatchPartyAccess.ts");
const home = readSource("app/(tabs)/index.tsx");
const channel = readSource("app/channel/[userId].tsx");
const profile = readSource("app/profile/[userId].tsx");
const studio = readSource("app/channel-settings.tsx");

const liveDefaultFps = readNumericConst(performancePolicy, "LIVE_VIDEO_DEFAULT_FPS");
const liveMaxFps = readNumericConst(performancePolicy, "LIVE_VIDEO_MAX_FPS_V1");
const premiumLiveMaxHeight = readNumericConst(performancePolicy, "PREMIUM_LIVE_MAX_HEIGHT_V1");
const roomHeartbeat = readNumericConst(performancePolicy, "ROOM_HEARTBEAT_MS");
const roomActiveWindow = readNumericConst(performancePolicy, "ROOM_MEMBERSHIP_ACTIVE_WINDOW_MS");
const homeSoftRefresh = readNumericConst(performancePolicy, "HOME_SOFT_REFRESH_MS");
const studioRefresh = readNumericConst(performancePolicy, "STUDIO_DASHBOARD_REFRESH_MS");
const analyticsMode = performancePolicy.match(/export\s+const\s+ANALYTICS_REFRESH_MODE\s*=\s*"([^"]+)"/)?.[1] ?? "";
const typingThrottle = readNumericConst(performancePolicy, "TYPING_THROTTLE_MS");
const readReceiptThrottle = readNumericConst(performancePolicy, "READ_RECEIPT_THROTTLE_MS");

if (liveDefaultFps !== 30) fail("LIVE_VIDEO_DEFAULT_FPS must be 30.");
if (liveMaxFps !== 30) fail("LIVE_VIDEO_MAX_FPS_V1 must be 30.");
if (premiumLiveMaxHeight !== 720) fail("PREMIUM_LIVE_MAX_HEIGHT_V1 must be 720.");
if (roomHeartbeat < 15_000) fail("ROOM_HEARTBEAT_MS must not be below 15 seconds.");
if (roomActiveWindow < roomHeartbeat * 3) fail("ROOM_MEMBERSHIP_ACTIVE_WINDOW_MS must tolerate at least three heartbeat windows.");
if (homeSoftRefresh < 120_000) fail("HOME_SOFT_REFRESH_MS must not be below 2 minutes.");
if (studioRefresh < 60_000) fail("STUDIO_DASHBOARD_REFRESH_MS must not be below 60 seconds.");
if (analyticsMode !== "manual_on_open_cache") fail("Analytics refresh must be manual/on-open/cache for V1.");
if (typingThrottle < 1_000) fail("TYPING_THROTTLE_MS must be throttled.");
if (readReceiptThrottle < 5_000) fail("READ_RECEIPT_THROTTLE_MS must be throttled.");

assertIncludes(performancePolicy, "frameRate: LIVE_VIDEO_DEFAULT_FPS", "Live video capture frame-rate policy");
assertIncludes(performancePolicy, "maxFramerate: LIVE_VIDEO_MAX_FPS_V1", "Live video publish encoding frame-rate cap");
assertIncludes(performancePolicy, "height: PREMIUM_LIVE_MAX_HEIGHT_V1", "Premium live height cap");
assertIncludes(performancePolicy, "VOD_FREE_MAX_HEIGHT_V1 = 480", "VOD free quality cap");
assertIncludes(performancePolicy, "VOD_PREMIUM_MAX_HEIGHT_V1 = 1080", "VOD Premium quality cap");

assertNotIncludes(partyRoom, "ROOM_HEARTBEAT_INTERVAL_MILLIS = 10_000", "Watch-Party Live 10s heartbeat");
assertNotIncludes(partyRoom, "}, 5000);", "Watch-Party Live 5s snapshot poll");
assertIncludes(partyRoom, "ROOM_HEARTBEAT_INTERVAL_MILLIS = ROOM_HEARTBEAT_MS", "Watch-Party Live shared heartbeat");
assertIncludes(partyRoom, "}, ROOM_SNAPSHOT_REFRESH_MS);", "Watch-Party Live shared snapshot refresh");

assertNotIncludes(liveStage, "STAGE_HEARTBEAT_INTERVAL_MILLIS = 10_000", "Live Stage 10s heartbeat");
assertNotIncludes(liveStage, "}, 2_500);", "Live Stage 2.5s fallback comment poll");
assertIncludes(liveStage, "STAGE_HEARTBEAT_INTERVAL_MILLIS = ROOM_HEARTBEAT_MS", "Live Stage shared heartbeat");
assertIncludes(liveStage, "}, LIVE_COMMENT_FALLBACK_REFRESH_MS);", "Live Stage shared comment fallback refresh");

assertNotIncludes(communicationSession, "HEARTBEAT_INTERVAL_MILLIS = 10_000", "Communication 10s heartbeat");
assertIncludes(communicationSession, "HEARTBEAT_INTERVAL_MILLIS = ROOM_HEARTBEAT_MS", "Communication shared heartbeat");
assertIncludes(roomRules, "ROOM_MEMBERSHIP_ACTIVE_WINDOW_MILLIS = ROOM_MEMBERSHIP_ACTIVE_WINDOW_MS", "Room membership active window policy");

assertIncludes(liveKitSurface, "createLiveKitV1RoomOptions", "Watch-Party LiveKit v1 room options");
assertIncludes(liveKitSurface, "video={effectivePublishLocalCamera ? LIVE_VIDEO_CAPTURE_OPTIONS : false}", "Watch-Party LiveKit capture options");
assertIncludes(liveStage, "createLiveKitV1RoomOptions", "Live Stage v1 room options");
assertIncludes(liveStage, "video={publishLocalCamera ? LIVE_VIDEO_CAPTURE_OPTIONS : false}", "Live Stage capture options");

assertIncludes(chatThread, "READ_RECEIPT_THROTTLE_MS", "Chat read receipt throttle");
assertIncludes(chatThread, "markThreadReadWithThrottle", "Chat throttled mark-read wrapper");

assertIncludes(premiumLiveAccess, "strictEntitlementRequired: true", "Strict entitlement-backed Premium live gates");
assertIncludes(premiumLiveAccess, "requireLiveFirstPremium", "Live First Premium gate");
assertIncludes(premiumLiveAccess, "requireLiveWatchPartyPremium", "Live Watch-Party Premium gate");
assertIncludes(premiumLiveAccess, "requireWatchPartyLivePremium", "Watch-Party Live Premium gate");

if (/setInterval\s*\(/.test(home)) fail("Home feed must not add auto-polling; use open/focus/manual refresh.");
if (/setInterval\s*\(/.test(channel)) fail("Public Channel must not add auto-polling in this lane.");
if (/setInterval\s*\(/.test(profile)) fail("Profile must not add auto-polling in this lane.");
if (/setInterval\s*\(/.test(studio)) fail("Platform Studio must not add auto-polling in this lane.");

if (process.exitCode) {
  process.exit();
}

console.log("Refresh/video cost policy guard passed.");
