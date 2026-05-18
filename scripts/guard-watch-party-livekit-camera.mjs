import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

const readSource = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Watch-Party LiveKit camera guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) {
    fail(`${label} is missing.`);
  }
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) {
    fail(`${label} must not be present.`);
  }
};

const assertBefore = (source, firstNeedle, secondNeedle, label) => {
  const firstIndex = source.indexOf(firstNeedle);
  const secondIndex = source.indexOf(secondNeedle);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex > secondIndex) {
    fail(label);
  }
};

const sliceBetween = (source, startNeedle, endNeedle, label) => {
  const startIndex = source.indexOf(startNeedle);
  const endIndex = source.indexOf(endNeedle, startIndex + startNeedle.length);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    fail(label);
    return "";
  }
  return source.slice(startIndex, endIndex);
};

const livekitSurface = readSource("components/watch-party-live/livekit-stage-media-surface.tsx");
const watchPartyIndex = readSource("app/watch-party/index.tsx");
const partyRoom = readSource("app/watch-party/[partyId].tsx");
const liveStage = readSource("app/watch-party/live-stage/[partyId].tsx");
const player = readSource("app/player/[id].tsx");
const premiumWatchPartyAccess = readSource("_lib/premiumWatchPartyAccess.ts");
const partyRoomWatchTogether = sliceBetween(
  partyRoom,
  "const onWatchTogether = useCallback(async () => {",
  "const onPickPartyRoomCommentAttachment = useCallback(async () => {",
  "Party Room Watch Together handler boundary",
);
const premiumLiveProofHoldBranch = sliceBetween(
  premiumWatchPartyAccess,
  "if (PREMIUM_LIVE_GATE_PROOF_HOLD) {",
  "return premiumAccess;",
  "Premium live proof hold branch boundary",
);
const playerFallbackHandler = sliceBetween(
  player,
  "const onWatchPartyLiveKitFallback = useCallback(",
  "useEffect(() => {\n    if (!activeParticipantId) return;",
  "Player Watch-Party LiveKit fallback handler boundary",
);
const playerWatchPartyEntryAccessCheck = sliceBetween(
  player,
  "const premiumAccess = await requireWatchPartyLivePremium({ accessKey: partyId })",
  "return () => {\n      active = false;",
  "Player Watch-Party entry access check boundary",
);
const lobbyJoinAccessCheck = sliceBetween(
  watchPartyIndex,
  "const attemptJoinRoom = useCallback(async (nextPreview: RoomPreview) => {",
  "const onConfirmJoin = async () => {",
  "Watch-Party lobby join access check boundary",
);
const liveStageEntryHandler = sliceBetween(
  liveStage,
  "const onEnterLiveStage = useCallback(async () => {",
  "const onReturnToLiveRoom = useCallback",
  "Live Stage entry handler boundary",
);
const liveStageRouteAccessCheck = sliceBetween(
  liveStage,
  "const access = await resolveRoomAccess({",
  "syncStageSnapshot(snapshot, trackedUserId);",
  "Live Stage route access check boundary",
);
const partyRoomRouteAccessCheck = sliceBetween(
  partyRoom,
  "const access = await resolveRoomAccess({",
  "if (snapshot.room.roomType === \"live\") {",
  "Party Room route access check boundary",
);
const liveStageFallbackHandler = sliceBetween(
  liveStage,
  "const onLiveKitStageFallback = useCallback(",
  "const resolveLiveKitStageEntryRole = useCallback",
  "Live Stage LiveKit fallback handler boundary",
);
const liveWatchPartyCreateHandler = sliceBetween(
  watchPartyIndex,
  "const onCreateRoom = async () => {",
  "const activeRoomType: WatchPartyRoomType",
  "Live Watch-Party create-room handler boundary",
);

assertIncludes(
  premiumWatchPartyAccess,
  "export const PREMIUM_LIVE_GATE_PROOF_HOLD = true;",
  "Premium live proof hold flag",
);
assertIncludes(
  premiumWatchPartyAccess,
  "This does not grant Premium.",
  "Premium live proof hold no-grant copy",
);
assertBefore(
  premiumWatchPartyAccess,
  "if (!enabled) {",
  "if (PREMIUM_LIVE_GATE_PROOF_HOLD) {",
  "Runtime controls must still block before the Premium live proof hold opens entry.",
);
assertIncludes(
  premiumLiveProofHoldBranch,
  "allowed: true",
  "Premium live proof hold allowed proof entry",
);
assertIncludes(
  premiumLiveProofHoldBranch,
  'reason: "allowed"',
  "Premium live proof hold non-gated reason",
);
assertIncludes(
  premiumLiveProofHoldBranch,
  "requiresPremium: false",
  "Premium live proof hold must not show the Premium gate during media proof",
);
assertIncludes(
  premiumLiveProofHoldBranch,
  "requiresPartyPass: false",
  "Premium live proof hold must not require a party pass during media proof",
);
assertIncludes(
  premiumLiveProofHoldBranch,
  "canPurchase: false",
  "Premium live proof hold must not expose a purchase action",
);
assertIncludes(
  premiumLiveProofHoldBranch,
  "PREMIUM_LIVE_GATE_PROOF_HOLD_MESSAGE",
  "Premium live proof hold issue copy",
);

assertNotIncludes(
  livekitSurface,
  "expo-camera",
  "LiveKit media surface importing expo-camera",
);
assertNotIncludes(
  livekitSurface,
  "<CameraView",
  "LiveKit media surface rendering a separate CameraView",
);
assertIncludes(
  livekitSurface,
  "mirror={isLocalParticipant}",
  "LiveKit bubble grid mirrored local VideoTrack rendering",
);
assertIncludes(
  livekitSurface,
  "const publishedLocalCameraTrackRef = useMemo(",
  "LiveKit media surface must render the published local camera track from useTracks before showing fallback",
);
assertIncludes(
  livekitSurface,
  "hasLocalCameraTrack: !!cameraTrack",
  "LiveKit media proof logs must include local camera track state",
);
assertIncludes(
  livekitSurface,
  "hasPublishedLocalCameraTrack: !!publishedLocalCameraTrackRef",
  "LiveKit media proof logs must include published local camera track state",
);
assertIncludes(
  livekitSurface,
  "publishLocalAudio",
  "LiveKit media proof logs must include mic publish state",
);
assertIncludes(
  livekitSurface,
  "participantRole: joinContract.participantRole",
  "LiveKit media proof logs must include participantRole",
);
assertIncludes(
  liveStage,
  "const publishedLocalCameraTrackRef = useMemo(",
  "Live Stage hero must render the published local LiveKit camera track from useTracks before showing fallback",
);
assertIncludes(
  liveStage,
  "const shouldAllowLegacyStageRtcModule = Platform.OS === \"web\" || !shouldRenderLiveKitStage;",
  "Live Stage must allow legacy camera RTC fallback when native LiveKit is not actively rendering",
);
assertIncludes(
  liveStage,
  "PREMIUM_LIVE_GATE_PROOF_HOLD",
  "Live Stage route must import the Premium live proof hold flag",
);
assertIncludes(
  liveStageRouteAccessCheck,
  "PREMIUM_LIVE_GATE_PROOF_HOLD",
  "Live Stage route access must not let the Premium room-access gate block internal LiveKit proof",
);
assertIncludes(
  liveStageRouteAccessCheck,
  "requireLiveStagePremium(",
  "Live Stage route access must re-check the runtime-controlled Premium proof helper before opening proof entry",
);
assertIncludes(
  liveStageRouteAccessCheck,
  "premium proof hold opened live-stage route access",
  "Live Stage route access must log proof-hold entry instead of treating a Premium gate as media proof",
);
assertBefore(
  liveStageRouteAccessCheck,
  "PREMIUM_LIVE_GATE_PROOF_HOLD",
  "setBlockedRoomAccess(access);",
  "Live Stage route access must evaluate proof hold before setting a Premium blocked-room gate.",
);
assertIncludes(
  partyRoomRouteAccessCheck,
  "proofHoldRoomAccessAllowed",
  "Party Room route access must not let the Premium room-access gate block Watch-Party Live internal proof",
);
assertIncludes(
  partyRoomRouteAccessCheck,
  'premiumAccessSource === "watch_party_live"',
  "Party Room proof hold must be scoped to Watch-Party Live rooms",
);
assertIncludes(
  partyRoomRouteAccessCheck,
  'access?.reason === "premium_required"',
  "Party Room proof hold must only bypass Premium-required room gates",
);
assertIncludes(
  partyRoomRouteAccessCheck,
  "premium proof hold opened watch-party-live room access",
  "Party Room proof hold must log that it opened Watch-Party Live access",
);
assertBefore(
  partyRoomRouteAccessCheck,
  "proofHoldRoomAccessAllowed",
  "setBlockedRoomAccess(access);",
  "Party Room route access must evaluate proof hold before setting a blocked-room gate.",
);
assertIncludes(
  lobbyJoinAccessCheck,
  "proofHoldRoomAccessAllowed",
  "Watch-Party lobby must not let the Premium room-access gate block internal proof",
);
assertIncludes(
  lobbyJoinAccessCheck,
  'access?.reason === "premium_required"',
  "Watch-Party lobby proof hold must only bypass Premium-required room gates",
);
assertIncludes(
  lobbyJoinAccessCheck,
  "premium proof hold opened watch-party lobby room access",
  "Watch-Party lobby proof hold must log that it opened room access",
);
assertBefore(
  lobbyJoinAccessCheck,
  "proofHoldRoomAccessAllowed",
  "setAccessSheetVisible(true);",
  "Watch-Party lobby must evaluate proof hold before showing a Premium access sheet.",
);
assertIncludes(
  playerWatchPartyEntryAccessCheck,
  "proofHoldRoomAccessAllowed",
  "Player Watch-Party entry must not let the Premium room-access gate block internal proof",
);
assertIncludes(
  playerWatchPartyEntryAccessCheck,
  'access?.reason === "premium_required"',
  "Player Watch-Party entry proof hold must only bypass Premium-required room gates",
);
assertIncludes(
  playerWatchPartyEntryAccessCheck,
  "premium proof hold opened watch-party-live player access",
  "Player Watch-Party entry proof hold must log that it opened player access",
);
assertIncludes(
  playerWatchPartyEntryAccessCheck,
  'reason: "allowed"',
  "Player Watch-Party entry proof hold must convert the room access result to allowed for media proof",
);
assertBefore(
  playerWatchPartyEntryAccessCheck,
  "proofHoldRoomAccessAllowed",
  "setWatchPartyEntryError(\"Unable to confirm watch-party access right now.\");",
  "Player Watch-Party entry must evaluate proof hold inside the access check.",
);

assertIncludes(
  liveWatchPartyCreateHandler,
  "preparedRoomBelongsToCurrentUser",
  "Live Watch-Party lobby must verify a prepared room still belongs to the current signed-in user before entering proof",
);
assertIncludes(
  liveWatchPartyCreateHandler,
  "stale prepared live room ignored",
  "Live Watch-Party lobby must log and ignore stale prepared rooms instead of entering as viewer",
);
assertBefore(
  liveWatchPartyCreateHandler,
  "preparedRoomBelongsToCurrentUser",
  "navigateToRoom({",
  "Live Watch-Party lobby must check prepared-room ownership before navigation.",
);
assertIncludes(
  partyRoom,
  "partyRoomCameraPreviewSuppressed",
  "Party Room handoff camera-preview suppression state",
);
assertIncludes(
  partyRoom,
  "const allowLocalCameraPreview = isNativeCameraPlatform && isFocused && !partyRoomCameraPreviewSuppressed;",
  "Party Room local preview focus/suppression gate",
);
assertBefore(
  partyRoomWatchTogether,
  "const joinResult = await prepareLiveKitJoinBoundary({",
  "setPartyRoomCameraPreviewSuppressed(true);",
  "Party Room must not suppress expo-camera preview before the LiveKit handoff is ready.",
);
assertBefore(
  partyRoomWatchTogether,
  "setPartyRoomCameraPreviewSuppressed(false);",
  "\"Live feed unavailable\"",
  "Party Room must restore expo-camera preview before reporting an unavailable LiveKit handoff.",
);
assertBefore(
  partyRoomWatchTogether,
  "setPartyRoomCameraPreviewSuppressed(true);",
  "router.push({",
  "Party Room must suppress expo-camera preview only before routing into the LiveKit Player.",
);
assertIncludes(
  partyRoomWatchTogether,
  "const participantRole = myRoleRef.current === \"host\" ? \"host\" : \"speaker\";",
  "Watch-Party Live proof handoff must not downgrade a visible proof participant to viewer",
);
assertIncludes(
  partyRoomWatchTogether,
  "participantRole: joinResult.participantRole",
  "Watch-Party Live prepared contract log must include participantRole",
);
assertIncludes(
  partyRoom,
  "liveKitIdentity: participantIdentity",
  "Party Room must pass the prepared LiveKit participant identity through the Player route handoff",
);
assertIncludes(
  partyRoom,
  "allowCameraPreview={allowLocalCameraPreview}",
  "Party Room bottom strip preview gate",
);
assertIncludes(
  partyRoom,
  "const showLocalCameraPreview = allowLocalCameraPreview && isCurrentUser && !!cameraPermission?.granted;",
  "Party Room live-grid preview gate",
);
assertNotIncludes(
  partyRoom,
  "allowCameraPreview={isNativeCameraPlatform}",
  "Party Room bottom strip raw native camera gate",
);
assertNotIncludes(
  partyRoom,
  "const showLocalCameraPreview = isNativeCameraPlatform && isCurrentUser && !!cameraPermission?.granted;",
  "Party Room live-grid raw native camera gate",
);

assertIncludes(
  player,
  "&& !shouldRenderWatchPartyLiveKit",
  "Player participant strip must disable expo-camera preview while Watch-Party LiveKit is rendered",
);
assertIncludes(
  player,
  "const liveKitParticipantIdentity = watchPartyLiveKitIdentity || trackedUserId;",
  "Player must consume the prepared Watch-Party LiveKit contract with the route handoff identity",
);
assertIncludes(
  player,
  "participantRole: preparedContract.participantRole",
  "Player consumed Watch-Party LiveKit contract log must include participantRole",
);
assertIncludes(
  playerFallbackHandler,
  "setWatchPartyLiveKitJoinContract(null);",
  "Player Watch-Party LiveKit fallback must explicitly clear the prepared contract",
);
assertIncludes(
  liveStageEntryHandler,
  "[live-stage-proof] enter live stage",
  "Live Stage proof entry must log role/runtime state in release proof builds",
);
assertIncludes(
  liveStageEntryHandler,
  "[live-stage-proof] live-stage join contract unavailable",
  "Live Stage proof must log token/role blockers instead of treating avatar fallback as media proof",
);
assertIncludes(
  liveStageEntryHandler,
  "responseError: joinResult.responseError",
  "Live Stage proof must log backend token response errors such as no_eligible_livekit_server",
);
assertIncludes(
  liveStage,
  "LiveKit server unavailable",
  "Live Stage must show an explicit LiveKit server unavailable state instead of a silent avatar fallback",
);
assertIncludes(
  liveStageEntryHandler,
  "participantRole: joinResult.participantRole",
  "Live Stage prepared contract log must include participantRole",
);
assertIncludes(
  liveStage,
  "live-stage viewer entered without host-granted camera seat",
  "Live Stage must log viewer-role proof blockers instead of treating viewer fallback as media proof",
);
assertIncludes(
  liveStageFallbackHandler,
  "setLiveKitJoinContract(null);",
  "Live Stage fallback must explicitly clear the prepared contract",
);

if (process.exitCode) {
  process.exit();
}

console.log("Watch-Party LiveKit camera guard passed.");
