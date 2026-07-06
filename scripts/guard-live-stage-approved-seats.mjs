import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const readSource = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Live Stage Approved Seats guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing.`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not be present.`);
};

const assertBefore = (source, firstNeedle, secondNeedle, label) => {
  const firstIndex = source.indexOf(firstNeedle);
  const secondIndex = source.indexOf(secondNeedle);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex > secondIndex) fail(label);
};

const assertStaticRole = ({ label, requestedRole, isHost, freshMembership, approved, muted, expectedRole, expectedCanPublish }) => {
  let participantRole = "viewer";
  let canPublish = false;

  if (isHost) {
    participantRole = "host";
    canPublish = true;
  } else if (freshMembership && requestedRole === "speaker" && approved) {
    participantRole = "speaker";
    canPublish = !muted;
  }

  if (participantRole !== expectedRole || canPublish !== expectedCanPublish) {
    fail(`${label} expected ${expectedRole}/${expectedCanPublish ? "publish" : "no-publish"} but resolved ${participantRole}/${canPublish ? "publish" : "no-publish"}.`);
  }
};

const liveStage = readSource("app/watch-party/live-stage/[partyId].tsx");
const livekitSurface = readSource("components/watch-party-live/livekit-stage-media-surface.tsx");
const livekitToken = readSource("supabase/functions/livekit-token/index.ts");
const participantPermissions = readSource("_lib/livekit/participant-permissions.ts");
const joinBoundary = readSource("_lib/livekit/join-boundary.ts");
const oldRoomGuard = readSource("scripts/guard-old-room-handling.mjs");
const watchPartyLiveKitGuard = readSource("scripts/guard-watch-party-livekit-camera.mjs");
const seatApprovalProof = readSource("scripts/proof-live-stage-seat-approval.mjs");

assertStaticRole({
  label: "host",
  requestedRole: "viewer",
  isHost: true,
  freshMembership: false,
  approved: false,
  muted: false,
  expectedRole: "host",
  expectedCanPublish: true,
});
assertStaticRole({
  label: "approved speaker",
  requestedRole: "speaker",
  isHost: false,
  freshMembership: true,
  approved: true,
  muted: false,
  expectedRole: "speaker",
  expectedCanPublish: true,
});
assertStaticRole({
  label: "unapproved viewer",
  requestedRole: "speaker",
  isHost: false,
  freshMembership: true,
  approved: false,
  muted: false,
  expectedRole: "viewer",
  expectedCanPublish: false,
});
assertStaticRole({
  label: "muted approved speaker",
  requestedRole: "speaker",
  isHost: false,
  freshMembership: true,
  approved: true,
  muted: true,
  expectedRole: "speaker",
  expectedCanPublish: false,
});
assertStaticRole({
  label: "stale membership",
  requestedRole: "speaker",
  isHost: false,
  freshMembership: false,
  approved: true,
  muted: false,
  expectedRole: "viewer",
  expectedCanPublish: false,
});

assertIncludes(livekitToken, "if (room.hostUserId === userId)", "LiveKit token host authority branch");
assertIncludes(livekitToken, "participantRole: \"host\"", "LiveKit token host role");
assertIncludes(livekitToken, "canPublish: true", "LiveKit token host publish grant");
assertIncludes(livekitToken, "isFreshWatchPartyMembership(currentMembership, nowMillis)", "LiveKit token fresh membership requirement");
assertIncludes(livekitToken, "if (requestedParticipantRole === \"viewer\")", "LiveKit token viewer request branch");
assertIncludes(livekitToken, "participantRole: \"viewer\"", "LiveKit token viewer role downgrade");
assertIncludes(livekitToken, "canPublish: false", "LiveKit token viewer no-publish grant");
assertIncludes(livekitToken, "getAuthorizedWatchPartySpeakerSeatIds", "LiveKit token approved speaker seat authority");
assertIncludes(livekitToken, "speaker_not_approved_or_over_cap", "LiveKit token client-requested speaker rejection");
assertIncludes(livekitToken, "currentMembership?.isMuted ? \"approved_speaker_muted\"", "LiveKit token muted speaker reason");
assertIncludes(livekitToken, "canPublish: !currentMembership?.isMuted", "LiveKit token muted speaker audio/video publish block");
assertIncludes(livekitToken, "getRequestedLiveKitGrants(effectiveParticipantRole, effectiveRole.canPublish)", "LiveKit token backend grant authority");
assertIncludes(livekitToken, "requestedParticipantRole: participantRole", "LiveKit token keeps requested role separate from effective role");
assertIncludes(livekitToken, "error: \"room_expired\"", "LiveKit token expired room rejection");
assertBefore(
  livekitToken,
  "isWatchPartyRoomCurrentlyActive(room)",
  "room_surface_mismatch",
  "LiveKit token must reject stale/expired rooms before route-specific surface handling.",
);
assertIncludes(livekitToken, "\"enforce-participant-state\"", "LiveKit token participant enforcement endpoint");
assertIncludes(livekitToken, "removeParticipant(room.roomName, targetUserId)", "LiveKit token stale publish-capable participant removal");

assertIncludes(liveStage, "currentTrackedParticipantState?.role === \"speaker\"", "Live Stage local speaker authority state");
assertIncludes(liveStage, "currentStageMembership?.canSpeak", "Live Stage canSpeak membership authority");
assertIncludes(liveStage, "currentStageMembership?.stageRole === \"speaker\"", "Live Stage stageRole membership authority");
assertIncludes(liveStage, "const publishLocalStageAudio = liveKitContractAllowsStagePublish && !isCurrentStageParticipantMuted;", "Live Stage local audio publish gate");
assertIncludes(liveStage, "const publishLocalStageCamera = liveKitContractAllowsStagePublish && !isCurrentStageParticipantMuted;", "Live Stage local camera publish gate");
assertIncludes(liveStage, "const staleRoleContract = !!liveKitJoinContract && liveKitJoinContract.participantRole !== liveKitParticipantRole;", "Live Stage role mismatch contract refresh");
assertIncludes(liveStage, "const stalePublishContract = !!liveKitJoinContract && existingCanPublish !== desiredCanPublish;", "Live Stage publish mismatch contract refresh");
assertIncludes(liveStage, "setLiveKitJoinContract(null);", "Live Stage stale/fallback contract clear");
assertIncludes(liveStage, "source: \"live-stage-authority-refresh\"", "Live Stage authority refresh token request marker");
assertIncludes(liveStage, "await enforceLiveKitParticipantState({", "Live Stage stale publish-capable session enforcement");
assertIncludes(liveStage, "blocked live-stage seat broadcast before membership authority persisted", "Live Stage blocks active seat broadcast until persistence succeeds");
assertBefore(
  liveStage,
  "let updatedMembership = await setPartyParticipantState",
  "await enforceLiveKitParticipantState({",
  "Live Stage must persist membership authority before enforcing participant state.",
);
assertIncludes(liveStage, "persistMembershipState: true", "Live Stage host approval must request server-backed membership persistence when client persistence fails");
assertIncludes(liveStage, "disableHybridLocalMediaQuietly(\"audio-authority-downgrade\"", "Live Stage audio stops immediately on downgrade/mute");
assertIncludes(liveStage, "disableHybridLocalMediaQuietly(\"camera-authority-downgrade\"", "Live Stage camera stops immediately on downgrade/mute");
assertIncludes(liveStage, "disableHybridLocalMediaQuietly(\"unmount\")", "Live Stage local media stops on unmount");

assertIncludes(liveStage, "HYBRID_LIVEKIT_CONNECT_TIMEOUT_MILLIS = 30_000", "Live Stage connect timeout remains explicit");
assertIncludes(liveStage, "HYBRID_LIVEKIT_DISCONNECT_FALLBACK_GRACE_MILLIS = 4_500", "Live Stage reconnect grace timeout");
assertIncludes(liveStage, "isHybridLiveKitConnectedishState(room.state)", "Live Stage reconnect grace checks connectedish state");
assertIncludes(liveStage, "hybrid community room disconnected during reconnect grace", "Live Stage reconnect grace debug proof");
assertIncludes(liveStage, "falling back to legacy live-stage media path", "Live Stage fallback logged as fallback");
assertIncludes(liveStage, "live-stage join contract unavailable", "Live Stage unavailable token logged separately from media success");
assertIncludes(liveStage, "live-stage viewer entered without host-granted camera seat", "Live Stage unapproved viewer no-publish proof log");
assertIncludes(livekitSurface, "hasPublishedLocalCameraTrack: !!publishedLocalCameraTrackRef", "Shared media surface logs published local camera proof");
assertIncludes(livekitSurface, "bubbleGridTrackCount: bubbleGridTracks.length", "Shared media surface logs real bubble track count");
assertNotIncludes(liveStage, "fallbackMediaSuccess", "Live Stage fallback must not be represented as media success");
assertIncludes(liveStage, "const canUseViewerSelfHero = !isHost && isHybridMode;", "Live Stage self-hero mode stays viewer-only");
assertIncludes(liveStage, "const shouldUseViewerSelfHero = canUseViewerSelfHero && viewerSelfHeroEnabled;", "Live Stage self-hero mode is local UI state");
assertIncludes(liveStage, "const selfHeroFallbackBody = currentStageParticipantState.role === \"speaker\"", "Live Stage self-hero fallback must be local state copy, not LiveKit syncing copy");
assertIncludes(liveStage, "shouldUseViewerSelfHero && participant.userId === currentUserParticipantId", "Live Stage self-hero removes self from party box only while self is hero");
assertIncludes(liveStage, "showHeroLocalRtcVideo && RTCView", "Live Stage self-hero uses local visual immediately when available");
assertIncludes(liveStage, "\"Local self view\"", "Live Stage self-hero fallback explains local-only layout instead of syncing or approval");
assertIncludes(liveStage, "forceLocalHeroFallback={false}", "Live Stage self-hero must not force the LiveKit syncing fallback");
assertIncludes(liveStage, "testID=\"live-stage-self-hero-toggle\"", "Live Stage self-hero toggle is exposed for proof");
assertIncludes(liveStage, "\"live-stage-self-party-card\"", "Live Stage default viewer layout exposes self party-card proof id");
assertIncludes(liveStage, "`live-stage-pending-seat-card-${participant.userId}`", "Live Stage pending requester card exposes a stable proof id");
assertIncludes(liveStage, "setSeatRequestSheetParticipantId(participant.userId);", "Live Stage pending requester card opens the seat sheet");
assertIncludes(liveStage, "testID=\"live-stage-seat-request-sheet\"", "Live Stage seat-request sheet is exposed for proof");
assertIncludes(liveStage, "testID=\"live-stage-seat-request-approve\"", "Live Stage seat-request sheet has approve action");
assertIncludes(liveStage, "testID=\"live-stage-seat-request-dismiss\"", "Live Stage seat-request sheet has dismiss action");
assertIncludes(liveStage, "testID=\"live-stage-seat-request-close\"", "Live Stage seat-request sheet has close action");
assertIncludes(liveStage, "onPress={() => setSeatRequestSheetParticipantId(\"\")}", "Live Stage close action only closes the request sheet");
assertIncludes(liveStage, "Live Watch-Party hybrid owns the member deck; it is not transient chrome.", "Live Stage hybrid deck visibility marker");
assertIncludes(liveStage, "setStageOverlayAutoHideArmed(entryStageMode !== \"hybrid\")", "Live Stage must not arm overlay auto-hide for hybrid Live Watch-Party entry");
assertIncludes(liveStage, "isHybridMode\n      || !stageOverlayAutoHideArmed", "Live Stage hybrid mode must block the overlay auto-hide timer");

assertIncludes(oldRoomGuard, "isWatchPartyRoomCurrentlyActive(room)", "Old-room guard covers LiveKit stale room rejection");
assertIncludes(oldRoomGuard, "LiveKit token room_expired rejection", "Old-room guard covers expired token response");
assertIncludes(watchPartyLiveKitGuard, "avatar fallback as media proof", "Watch-Party LiveKit guard keeps fallback-not-success coverage");

assertIncludes(seatApprovalProof, "proof-live-stage-host-0001", "Live Stage proof uses fake host identity");
assertIncludes(seatApprovalProof, "proof-live-stage-viewer-0001", "Live Stage proof uses fake viewer identity");
assertIncludes(seatApprovalProof, "deviceOrEmulatorUsed === false", "Live Stage proof avoids devices/emulators");
assertIncludes(seatApprovalProof, "realAuthAccountCreated === false", "Live Stage proof avoids real account creation");
assertIncludes(seatApprovalProof, "viewer should become publish-capable after host approval", "Live Stage proof covers approved speaker publish");
assertIncludes(seatApprovalProof, "approval should collapse host card overlay", "Live Stage proof covers overlay collapse");
assertIncludes(seatApprovalProof, "dismiss should close the seat-request sheet", "Live Stage proof covers request sheet dismissal");
assertIncludes(seatApprovalProof, "close should keep the pending request", "Live Stage proof covers X close preserving request");
assertIncludes(seatApprovalProof, "default viewer layout should include viewer self in party box", "Live Stage proof covers default self tile visibility");
assertIncludes(seatApprovalProof, "host pending-request card tap should open the seat-request sheet", "Live Stage proof covers card tap sheet behavior");
assertIncludes(seatApprovalProof, "self-hero party box should put the real host first", "Live Stage proof covers self-hero host ordering");
assertIncludes(seatApprovalProof, "self-hero fallback copy must not be Live feed syncing", "Live Stage proof covers instant self-hero fallback copy");
assertIncludes(seatApprovalProof, "host approve should use server-backed persistence when client write fails", "Live Stage proof covers host approve fallback after client persistence failure");

assertIncludes(participantPermissions, 'action: "enforce-participant-state"', "Client participant enforcement helper uses scoped endpoint action");
assertIncludes(livekitToken, "metadataFlagEnabled(metadata.persistMembershipState)", "LiveKit token function must recognize host-approved membership persistence requests");
assertIncludes(livekitToken, "Only the room host can update a Live Stage camera seat.", "LiveKit token function must keep server-backed seat persistence host-only");
assertIncludes(livekitToken, "stage_role: nextStageRole", "LiveKit token function must persist approved Live Stage role before enforcing media state");
assertIncludes(joinBoundary, "isLiveKitParticipantTokenExpired(entry.joinContract.participantToken)", "Prepared LiveKit join boundary rejects expired tokens");

if (process.exitCode) process.exit();
console.log("Live Stage Approved Seats guard passed.");
