import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const readSource = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Old live room handling guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing.`);
};

const assertBefore = (source, firstNeedle, secondNeedle, label) => {
  const firstIndex = source.indexOf(firstNeedle);
  const secondIndex = source.indexOf(secondNeedle);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex > secondIndex) fail(label);
};

const performancePolicy = readSource("_lib/performancePolicy.ts");
const watchParty = readSource("_lib/watchParty.ts");
const communication = readSource("_lib/communication.ts");
const chat = readSource("_lib/chat.ts");
const communicationSession = readSource("hooks/use-communication-room-session.ts");
const livekitToken = readSource("supabase/functions/livekit-token/index.ts");
const livekitRouting = readSource("supabase/functions/_shared/livekit-routing.ts");
const home = readSource("app/(tabs)/index.tsx");
const explore = readSource("app/(tabs)/explore.tsx");
const title = readSource("app/title/[id].tsx");
const platformUsage = readSource("_lib/platformUsage.ts");
const player = readSource("app/player/[id].tsx");
const liveStage = readSource("app/watch-party/live-stage/[partyId].tsx");

assertIncludes(
  performancePolicy,
  "export const ROOM_ACTIVITY_ACTIVE_WINDOW_MS = 15 * 60_000;",
  "Shared 15-minute room activity window",
);

assertIncludes(watchParty, "isActive: boolean;", "WatchPartyState active flag");
assertIncludes(watchParty, "is_active", "watch_party_rooms active column selection");
assertIncludes(watchParty, "export const isWatchPartyRoomActive", "shared room liveness helper");
assertIncludes(
  watchParty,
  "return isWatchPartyRoomActive(room) ? room : null;",
  "getPartyRoom stale/inactive guard",
);
assertIncludes(
  watchParty,
  "last_activity_at: new Date().toISOString()",
  "room heartbeat last_activity_at refresh",
);
assertIncludes(
  watchParty,
  ".eq(\"is_active\", true)",
  "room heartbeat inactive-room guard",
);

assertIncludes(
  communication,
  "export const COMMUNICATION_ROOM_ACTIVE_WINDOW_MILLIS = ROOM_ACTIVITY_ACTIVE_WINDOW_MS;",
  "Communication shared 15-minute room activity window",
);
assertIncludes(communication, "export const isCommunicationRoomActive", "shared communication room liveness helper");
assertIncludes(
  communication,
  "return isCommunicationRoomActive(room) ? room : null;",
  "getCommunicationRoom stale/ended guard",
);
assertIncludes(
  communication,
  "last_activity_at: new Date().toISOString()",
  "communication room heartbeat last_activity_at refresh",
);
assertIncludes(
  communication,
  ".eq(\"status\", \"active\")",
  "communication room heartbeat active-status guard",
);
assertIncludes(
  chat,
  "isCommunicationRoomActive(snapshot.room)",
  "Chat thread active-call reuse stale-room guard",
);
assertIncludes(
  chat,
  "await clearEndedChatThreadCall(thread.threadId);",
  "Chat thread stale active-call reference cleanup",
);
assertIncludes(
  communicationSession,
  "onRoomEndedRef.current?.(\"ended\");",
  "Chat call unavailable room clears active thread state",
);

assertIncludes(
  livekitToken,
  ".select(\"party_id,host_user_id,room_type,is_active,started_at,updated_at,last_activity_at\")",
  "LiveKit token room liveness select",
);
assertIncludes(livekitToken, "isWatchPartyRoomCurrentlyActive(room)", "LiveKit token stale-room check");
assertIncludes(livekitToken, "error: \"room_expired\"", "LiveKit token room_expired rejection");
assertBefore(
  livekitToken,
  "isWatchPartyRoomCurrentlyActive(room)",
  "room_surface_mismatch",
  "LiveKit token must reject expired rooms before surface-specific token handling.",
);
assertIncludes(
  livekitToken,
  "isRecentTime(lastSeenAt, WATCH_PARTY_MEMBERSHIP_ACTIVE_WINDOW_MS)",
  "LiveKit token fresh membership presence check",
);
assertIncludes(
  livekitToken,
  ".select(\"room_id,host_user_id,status,created_at,updated_at,last_activity_at\")",
  "Chat-call token communication room liveness select",
);
assertIncludes(
  livekitToken,
  "isCommunicationRoomCurrentlyActive(room)",
  "Chat-call token stale communication room check",
);
assertIncludes(
  livekitToken,
  "This Chi'llywood call has ended or expired.",
  "Chat-call token room_expired rejection copy",
);
assertIncludes(
  livekitToken,
  "isRecentTime(lastSeenAt, COMMUNICATION_MEMBERSHIP_ACTIVE_WINDOW_MS)",
  "Chat-call token fresh membership presence check",
);

assertIncludes(
  livekitRouting,
  "assigned_server_stale_heartbeat",
  "LiveKit existing assignment stale heartbeat rejection",
);

[home, explore, title].forEach((source, index) => {
  const label = ["Home", "Explore", "Title"][index];
  assertIncludes(source, "ROOM_ACTIVITY_ACTIVE_WINDOW_MS", `${label} shared room activity window`);
  assertIncludes(source, "is_active", `${label} active room column`);
  assertIncludes(source, ".eq(\"is_active\", true)", `${label} active room filter`);
});

assertIncludes(platformUsage, "ROOM_ACTIVITY_ACTIVE_WINDOW_MS", "Admin usage shared room activity window");
assertIncludes(platformUsage, ".gte(\"last_activity_at\", activeRoomCutoffIso)", "Admin usage stale room filter");

assertIncludes(
  player,
  "falling back to legacy watch-party-live playback path",
  "Watch-Party Live fallback proof log",
);
assertIncludes(
  liveStage,
  "live-stage join contract unavailable",
  "Live Stage token failure proof log",
);
assertIncludes(
  liveStage,
  "setLiveKitJoinContract(null);",
  "Live Stage fallback clears LiveKit success contract",
);

if (process.exitCode) process.exit();
console.log("Old live room handling guard passed.");
