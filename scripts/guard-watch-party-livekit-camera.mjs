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

const assertCountAtLeast = (source, needle, minimumCount, label) => {
  const count = source.split(needle).length - 1;
  if (count < minimumCount) {
    fail(`${label} Expected at least ${minimumCount}, found ${count}.`);
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
const watchParty = readSource("_lib/watchParty.ts");
const watchPartyLiveSourceTruth = readSource("_lib/watch-party/watch-party-live-source-truth.ts");
const watchPartySeatRequestProof = readSource("scripts/proof-watch-party-seat-request.mjs");
const liveStageSeatApprovalProof = readSource("scripts/proof-live-stage-seat-approval.mjs");
const premiumWatchPartyAccess = readSource("_lib/premiumWatchPartyAccess.ts");
const partyRoomWatchTogether = sliceBetween(
  partyRoom,
  "const onWatchTogether = useCallback(async () => {",
  "const onPickPartyRoomCommentAttachment = useCallback(async (scope: SocialAttachmentPickerScope) => {",
  "Party Room Watch Together handler boundary",
);
const partyRoomSharedPlayerMainCta = sliceBetween(
  partyRoom,
  'testID="watch-party-open-shared-player-button"',
  '<Text style={styles.watchCTAText}',
  "Party Room main Shared Player CTA boundary",
);
const partyRoomSharedPlayerDockAction = sliceBetween(
  partyRoom,
  'testID="watch-party-action-player-button"',
  '<MaterialIcons name="play-arrow"',
  "Party Room action dock Shared Player button boundary",
);
const playerFallbackHandler = sliceBetween(
  player,
  "const onWatchPartyLiveKitFallback = useCallback(",
  "useEffect(() => {\n    if (!activeParticipantId) return;",
  "Player Watch-Party LiveKit fallback handler boundary",
);
const playerWatchPartyLiveKitContractRefresh = sliceBetween(
  player,
  "useEffect(() => {\n    if (!inWatchParty || !partyId || !watchPartyEntryAllowed || Platform.OS === \"web\") {",
  "const onWatchPartyLiveKitFallback = useCallback(",
  "Player Watch-Party LiveKit contract refresh boundary",
);
const playerWatchPartySeatPersistence = sliceBetween(
  player,
  "const persistPartySeatState = useCallback(async (participantId: string, options: {",
  "const handleSharedPlaybackTap = useCallback(async () => {",
  "Player Watch-Party seat persistence boundary",
);
const playerSharedAndroidVideoSurface = sliceBetween(
  player,
  "const SharedAndroidVideoSurface = forwardRef<PlayerController, SharedAndroidVideoSurfaceProps>(",
  "type StandalonePlayerTopChromeProps = {",
  "Player shared Android video surface boundary",
);
const playerVideoLoadHandler = sliceBetween(
  player,
  "const onVideoLoad = useCallback(",
  "const onVideoError = useCallback(",
  "Player video load handler boundary",
);
const playerWatchPartyPresenceSync = sliceBetween(
  player,
  "const syncCurrentPartyPresence = useCallback(async (overrides?: Partial<{",
  "const persistPartySeatRequestMarker = useCallback(async (",
  "Player Watch-Party presence sync boundary",
);
const playerWatchPartyHostSeatRequestPolling = sliceBetween(
  player,
  "useEffect(() => {\n    if (!inWatchParty || !partyId || !watchPartyEntryAllowed) {\n      if (partySeatRequestPollRef.current)",
  "useEffect(() => {\n    return () => {\n      if (seekFeedbackTimeoutRef.current)",
  "Player Watch-Party host seat request polling boundary",
);
const playerWatchPartyHostControls = sliceBetween(
  player,
  "const renderParticipantExpandedHostShell = ({",
  "const renderParticipantPanel = (liveLayout = false, dockLayout = false",
  "Player Watch-Party host controls boundary",
);
const playerWatchPartyHostSeatApproval = sliceBetween(
  player,
  "const approvePartyParticipantSeat = useCallback(async (participant: PartyParticipant) => {",
  "const renderParticipantExpandedHostShell = ({",
  "Player Watch-Party host seat approval boundary",
);
const playerSharedPlaybackControlAuthority = sliceBetween(
  player,
  "const getSharedPlaybackControlAuthority = useCallback(() => {",
  "const setPendingPartySeatRequest = useCallback((",
  "Player Watch-Party shared playback control authority boundary",
);
assertIncludes(
  watchPartyLiveSourceTruth,
  "export const createWatchPartySeatRequestVersion",
  "Watch-Party Live source-truth helper must create request versions",
);
assertIncludes(
  watchPartyLiveSourceTruth,
  "closeWatchPartySeatRequestReview",
  "Watch-Party Live source-truth helper must own X/Close suppression",
);
assertIncludes(
  watchPartyLiveSourceTruth,
  "shouldAutoOpenWatchPartySeatRequestReview",
  "Watch-Party Live source-truth helper must own duplicate auto-open checks",
);
assertIncludes(
  watchPartyLiveSourceTruth,
  "if (currentVersion && !eventVersion)",
  "Watch-Party Live source-truth helper must reject unversioned clears against versioned pending requests",
);
assertIncludes(
  watchPartyLiveSourceTruth,
  "watchPartyLiveContractMatchesDesiredAuthority",
  "Watch-Party Live source-truth helper must own contract authority matching",
);
assertIncludes(
  watchPartyLiveSourceTruth,
  "canRenderWatchPartyParticipantSpecificTrack",
  "Watch-Party Live source-truth helper must own identity-safe track checks",
);
assertIncludes(
  watchPartyLiveSourceTruth,
  "classifyWatchPartyLiveMediaSource",
  "Watch-Party Live source-truth helper must classify real media versus fixture/fallback proof",
);
assertIncludes(
  watchPartyLiveSourceTruth,
  "shouldTriggerWatchPartyLiveSharedPlaybackRecovery",
  "Watch-Party Live source-truth helper must decide Android shared-video recovery from real playback evidence",
);
assertIncludes(
  watchPartyLiveSourceTruth,
  "canCloseWatchPartyLiveActualPlaybackProof",
  "Watch-Party Live source-truth helper must reject Synced Playing without actual video playback proof",
);
assertIncludes(
  watchPartyLiveSourceTruth,
  "export const mergeWatchPartyLiveRoster",
  "Watch-Party Live source-truth helper must merge membership-authoritative roster state",
);
assertIncludes(
  watchPartyLiveSourceTruth,
  "presenceIdentityCollidesWithCurrent",
  "Watch-Party Live roster merge must drop remote LiveKit identities that collide with the current device identity",
);
assertIncludes(
  watchPartyLiveSourceTruth,
  "const isCurrentUser = !!participantId && participantId === sanitizeIdentifier(options.currentUserId)",
  "Watch-Party Live roster labels must use durable app participant id, not transient LiveKit aliases, for current-user truth",
);
assertIncludes(
  watchPartyLiveSourceTruth,
  "identityCollidesWithCurrent",
  "Watch-Party Live participant roster must recover from LiveKit identity collisions without collapsing remote members",
);
assertIncludes(
  watchPartyLiveSourceTruth,
  "export const resolveWatchPartyLiveParticipantRole",
  "Watch-Party Live source-truth helper must own role precedence between membership and presence",
);
assertIncludes(
  watchPartyLiveSourceTruth,
  "membershipStageRole === \"speaker\" || options.membershipCanSpeak === true",
  "Watch-Party Live role resolution must prefer approved speaker membership over stale presence",
);
assertIncludes(
  watchPartyLiveSourceTruth,
  "presenceRole = normalizeParticipantRole(options.presenceRole)",
  "Watch-Party Live role resolution may only consult presence after membership truth",
);
assertIncludes(
  player,
  "watchPartyLiveMediaSourceDebugMetadata",
  "Player runtime must wire Watch-Party Live media classification metadata",
);
assertIncludes(
  player,
  "watch-party-live media source classification",
  "Player runtime must log Watch-Party Live media classification before installed proof",
);
assertIncludes(
  partyRoom,
  'testID="watch-party-open-shared-player-button"',
  "Party Room main Open Shared Player CTA must expose a stable installed-proof testID",
);
assertIncludes(
  partyRoomSharedPlayerMainCta,
  "onPress={onWatchTogether}",
  "Party Room main Open Shared Player CTA must call the real shared-player handoff handler",
);
assertIncludes(
  partyRoomSharedPlayerMainCta,
  'accessibilityRole="button"',
  "Party Room main Open Shared Player CTA must expose native button semantics for installed proof taps",
);
assertIncludes(
  partyRoomSharedPlayerMainCta,
  "onLongPress={onWatchTogether}",
  "Party Room main Open Shared Player CTA must keep a long-press fallback wired to the handoff handler",
);
assertIncludes(
  partyRoomSharedPlayerMainCta,
  "hitSlop={12}",
  "Party Room main Open Shared Player CTA must keep a stable expanded tap target",
);
assertIncludes(
  partyRoomSharedPlayerMainCta,
  "disabled={watchPartyLiveOpening}",
  "Party Room main Open Shared Player CTA must remain guarded while opening",
);
assertIncludes(
  partyRoom,
  'testID="watch-party-action-player-button"',
  "Party Room action dock Player button must expose a stable installed-proof testID",
);
assertIncludes(
  partyRoomSharedPlayerDockAction,
  "onPress={onWatchTogether}",
  "Party Room action dock Player button must call the real shared-player handoff handler",
);
assertIncludes(
  partyRoomSharedPlayerDockAction,
  'accessibilityRole="button"',
  "Party Room action dock Player button must expose native button semantics for installed proof taps",
);
assertIncludes(
  partyRoomSharedPlayerDockAction,
  "onLongPress={onWatchTogether}",
  "Party Room action dock Player button must keep a long-press fallback wired to the handoff handler",
);
assertIncludes(
  partyRoomSharedPlayerDockAction,
  "hitSlop={10}",
  "Party Room action dock Player button must keep a stable expanded tap target",
);
assertIncludes(
  partyRoomSharedPlayerDockAction,
  "disabled={watchPartyLiveOpening}",
  "Party Room action dock Player button must remain guarded while opening",
);
assertIncludes(
  partyRoomWatchTogether,
  '"shared player open requested"',
  "Party Room shared-player handoff must log a redacted request event before LiveKit preparation",
);
assertIncludes(
  player,
  "playbackUrlPresent",
  "Player runtime media classification log must include redacted playback URL presence",
);
assertIncludes(
  player,
  "usedBundledFallback",
  "Player runtime media classification log must include bundled fallback status",
);
assertIncludes(
  player,
  'playbackUrl: playbackUrlPresent ? "redacted-present" : ""',
  "Player runtime media classification must not log full playback URLs",
);
assertIncludes(
  player,
  "isSharedPartyPlayback && isPlayerFullscreen ? styles.sharedFullscreenRailsLayout",
  "Shared Player fullscreen must keep the custom three-zone rails layout",
);
assertIncludes(
  player,
  "isSharedPartyPlayback && isPlayerFullscreen ? renderSharedFullscreenCommentsRail() : null",
  "Shared Player fullscreen must keep the left comments rail",
);
assertIncludes(
  player,
  "isSharedPartyPlayback && isPlayerFullscreen ? styles.sharedFullscreenCenterStage",
  "Shared Player fullscreen must keep the center shared video surface",
);
assertIncludes(
  player,
  "isSharedPartyPlayback && isPlayerFullscreen ? renderSharedFullscreenParticipantRail() : null",
  "Shared Player fullscreen must keep the right LiveKit bubble rail",
);
assertIncludes(
  player,
  "renderWatchPartyBubbleGridSurface(styles.sharedFullscreenLiveKitBubbleSurface)",
  "Shared Player fullscreen right rail must reuse the portrait LiveKit bubble surface",
);
assertIncludes(
  player,
  "const shouldShowRegularSharedComments = isSharedPartyPlayback && !isPlayerFullscreen;",
  "regular Shared Player must keep visible comments mounted outside fullscreen",
);
assertIncludes(
  player,
  "shouldShowRegularSharedComments || partyCommentsOpen",
  "regular Shared Player comments must not be menu-only behind the Room Comments button",
);
assertIncludes(
  player,
  'testID={shouldShowRegularSharedComments ? "shared-player-visible-comments" : undefined}',
  "regular Shared Player visible comments need an installed-proof target",
);
assertIncludes(
  player,
  "renderPartyCommentsContent(false, shouldShowRegularSharedComments && !partyCommentsOpen)",
  "regular Shared Player visible comments must use the compact dock input/send layout",
);
assertIncludes(
  player,
  "const sharedPartyCommentsKeyboardActive = isSharedPartyPlayback && !isPlayerFullscreen && watchPartyCommentKeyboardOpen;",
  "regular Shared Player comments must enter keyboard-safe mode when the default visible composer is focused",
);
assertIncludes(
  player,
  "sharedPartyCommentsKeyboardActive && styles.videoWrapWatchPartyTitleKeyboard",
  "regular Shared Player must shrink the shared video while the Android comment keyboard is active so the composer is not covered",
);
assertIncludes(
  player,
  "videoWrapWatchPartyTitleKeyboard: {",
  "regular Shared Player keyboard-safe video shrink style must remain present",
);
assertIncludes(
  player,
  "{sharedPartyCommentsKeyboardActive ? null : (",
  "regular Shared Player keyboard comment mode must hide action rows so the composer stays reachable",
);
assertIncludes(
  player,
  "!sharedPartyCommentsKeyboardActive && watchPartyMenuOpen",
  "regular Shared Player keyboard comment mode must hide the controls menu below the composer",
);
const sharedPlayerDockForKeyboard = sliceBetween(
  player,
  "const renderTitleParticipantExpandedPanel = () => (",
  "const renderCreatorVideoCommentsPanel = () => {",
  "Player Shared Player keyboard dock boundary",
);
if (
  !(
    sharedPlayerDockForKeyboard.indexOf("{sharedPartyCommentsKeyboardActive ? null : (")
      < sharedPlayerDockForKeyboard.indexOf('testID={shouldShowRegularSharedComments ? "shared-player-visible-comments" : undefined}')
      && sharedPlayerDockForKeyboard.indexOf('testID={shouldShowRegularSharedComments ? "shared-player-visible-comments" : undefined}')
        < sharedPlayerDockForKeyboard.indexOf("!sharedPartyCommentsKeyboardActive && watchPartyMenuOpen")
  )
) {
  fail("regular Shared Player keyboard mode must render comments between hidden action rows and hidden menu controls");
}
assertIncludes(
  player,
  'testID="shared-player-lower-dock-scroll"',
  "regular Shared Player lower dock must expose a scroll container for clipped comments/composer states",
);
assertIncludes(
  player,
  'keyboardShouldPersistTaps="handled"',
  "regular Shared Player lower dock scroll must keep comment Send taps handled while the keyboard is open",
);
assertIncludes(
  player,
  "watch-party-live shared video watchdog check",
  "Android shared playback must log watchdog checks when sync says playing but render has no progress",
);
assertIncludes(
  player,
  "watch-party-live shared video recovery",
  "Android shared playback must log bounded recovery actions",
);
assertIncludes(
  player,
  "watch-party-live shared video render stalled",
  "Android shared playback must expose a clear render-stalled failure state",
);
assertIncludes(
  player,
  "setSharedAndroidVideoFallbackMode(\"expo-av\")",
  "Android shared playback must fall back to expo-av if expo-video stays black/stalled",
);
assertNotIncludes(
  player,
  "renderParticipantPanel(false, false, true)",
  "Shared Player fullscreen right rail must not fall back to the non-LiveKit participant panel",
);
const playerSharedPlaybackSync = sliceBetween(
  player,
  "const syncHostSharedPlayback = useCallback(",
  "const applySeekDelta = useCallback(",
  "Player Watch-Party shared playback sync boundary",
);
const playerSharedPlaybackSeekDelta = sliceBetween(
  player,
  "const applySeekDelta = useCallback(",
  "const setZoomTransform = useCallback(",
  "Player Watch-Party shared playback seek boundary",
);
const playerSharedPlaybackTap = sliceBetween(
  player,
  "const handleSharedPlaybackTap = useCallback(async () => {",
  "const handleSingleTap = () => {",
  "Player Watch-Party shared playback tap boundary",
);
const playerSharedPlaybackPanResponder = sliceBetween(
  player,
  "const panResponder = useMemo(",
  "const progressScrubResponder = useMemo(",
  "Player Watch-Party shared playback pan responder boundary",
);
const playerSharedPlaybackProgressResponder = sliceBetween(
  player,
  "const progressScrubResponder = useMemo(",
  "const navigateToNext = useCallback",
  "Player Watch-Party shared playback progress responder boundary",
);
const playerSharedPlaybackUpNext = sliceBetween(
  player,
  "const navigateToNext = useCallback(() => {",
  "const onPlaybackStatusUpdate = useCallback(",
  "Player Watch-Party shared playback up-next boundary",
);
const playerSharedPlaybackStatusSync = sliceBetween(
  player,
  "const onPlaybackStatusUpdate = useCallback(",
  "const onVideoLoad = useCallback(",
  "Player Watch-Party shared playback status sync boundary",
);
const playerWatchPartyRateControl = sliceBetween(
  player,
  "const onSelectWatchPartyRate = useCallback((rate: number) => {",
  "const onToggleWatchPartyMyList = useCallback(() => {",
  "Player Watch-Party shared playback rate control boundary",
);
const playerWatchPartyCommentsToggle = sliceBetween(
  player,
  "const onToggleWatchPartyComments = useCallback(() => {",
  "const onToggleWatchPartyMenu = useCallback(() => {",
  "Player Watch-Party comments toggle boundary",
);
const playerWatchPartyRoomButton = sliceBetween(
  player,
  "const onPressWatchPartyRoom = useCallback(() => {",
  "const showLivePresenceEvent = useCallback((message: string) => {",
  "Player Watch-Party room button boundary",
);
const playerWatchPartyReactionSelect = sliceBetween(
  player,
  "const onSelectReactionFromPicker = useCallback((emoji: string) => {",
  "const onToggleLiveFilters = useCallback(() => {",
  "Player Watch-Party reaction select boundary",
);
const playerWatchPartySeatRequest = sliceBetween(
  player,
  "const requestPartySeat = useCallback(async (participantIdOverride?: string) => {",
  "const persistPartySeatState = useCallback(async (participantId: string, options: {",
  "Player Watch-Party seat request boundary",
);
const playerWatchPartyRequestCameraControl = sliceBetween(
  player,
  "const onPressSharedPlayerRequestCamera = useCallback(async (source: \"dock\" | \"bubble\" = \"dock\") => {",
  "const watchPartyLiveSharedPlaybackControlsLocked = isSharedPartyPlayback && !currentWatchPartyHostAuthority.isHost;",
  "Player Watch-Party explicit request camera control boundary",
);
const playerSharedPlayerDock = sliceBetween(
  player,
  "const renderTitleParticipantExpandedPanel = () => (",
  "const renderCreatorVideoCommentsPanel = () => {",
  "Player Shared Player dock boundary",
);
const playerPartyCommentsContent = sliceBetween(
  player,
  "const renderPartyCommentsContent = (compactFullscreenRail = false, compactSharedDock = false) => (",
  "const renderSharedFullscreenCommentsRail = () => (",
  "Player party comments content boundary",
);
const playerWatchPartyEntryAccessCheck = sliceBetween(
  player,
  "const premiumAccessKey = resolvePremiumAccessKeyForRoom(snapshot.room);",
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
const liveStageHostCardPress = sliceBetween(
  liveStage,
  "debugLiveStage(\"host tap user\", { userId: participant.userId });",
  "onLongPress={() => {",
  "Live Stage host card press boundary",
);
const liveStageHostActionMenu = sliceBetween(
  liveStage,
  "{shouldShowInlineHostControls ? (",
  "<View style={[styles.stagePresenceTapWrap",
  "Live Stage host action menu boundary",
);
const liveStageHostApproveAction = sliceBetween(
  liveStage,
  "const approveStageSeatRequest = useCallback(async (participantId: string) => {",
  "const pendingSeatRequestParticipants = useMemo(() => {",
  "Live Stage host approve action boundary",
);
const liveStageHostMuteAction = sliceBetween(
  liveStageHostActionMenu,
  "const mutePersisted = await emitParticipantUpdate(participant.userId, { isMuted: !isMuted });",
  "<Text style={styles.stageParticipantActionText}>{isMuted ? \"Unmute\" : \"Mute\"}</Text>",
  "Live Stage host mute action boundary",
);
const liveStageHostRemoveAction = sliceBetween(
  liveStageHostActionMenu,
  "const removePersisted = await emitParticipantUpdate(participant.userId, { isRemoved: !isRemoved });",
  "<Text style={[styles.stageParticipantActionText, styles.stageParticipantActionTextDanger]}",
  "Live Stage host remove action boundary",
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

[
  premiumWatchPartyAccess,
  liveStage,
  partyRoom,
  watchPartyIndex,
  player,
].forEach((source) => {
  assertNotIncludes(
    source,
    "PREMIUM_LIVE_GATE_PROOF_HOLD",
    "Premium live proof hold bypass",
  );
  assertNotIncludes(
    source,
    "premium proof hold opened",
    "Premium live proof hold logging",
  );
});

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
  "publishLocalVideo",
  "LiveKit media surface must accept an explicit publish-local-video authority flag",
);
assertIncludes(
  livekitSurface,
  "joinContract.requestedGrants.canPublish",
  "LiveKit media surface must honor backend canPublish grants before enabling camera publish",
);
assertIncludes(
  livekitSurface,
  "participantRole: joinContract.participantRole",
  "LiveKit media proof logs must include participantRole",
);
assertIncludes(
  livekitSurface,
  "participantLabelsByIdentity",
  "LiveKit media surface must accept participant labels keyed by identity",
);
assertIncludes(
  livekitSurface,
  "participantRoster?: LiveKitStageParticipantRosterEntry[]",
  "LiveKit media surface must accept a roster for participants without camera tracks",
);
assertIncludes(
  livekitSurface,
  "isRequestingToSpeak?: boolean",
  "LiveKit media surface roster must carry host-visible camera request state",
);
assertIncludes(
  livekitSurface,
  "onParticipantPress?: (identity: string) => void",
  "LiveKit media surface bubble grid must expose participant tap callbacks",
);
assertIncludes(
  livekitSurface,
  "pointerEvents={onParticipantPress ? \"auto\" : \"none\"}",
  "LiveKit media surface must allow taps when the player wires participant press handling",
);
assertIncludes(
  livekitSurface,
  "onPress={() => onParticipantPress?.(item.participantId)}",
  "LiveKit bubble-grid items must call the participant press handler with the app participant id",
);
assertIncludes(
  livekitSurface,
  "currentParticipantIdentity?: string",
  "LiveKit media surface must accept explicit current participant identity for app/LiveKit alias safety",
);
assertIncludes(
  livekitSurface,
  "identityAliases?: string[]",
  "LiveKit media surface roster must carry identity aliases for app id and LiveKit id matching",
);
assertIncludes(
  livekitSurface,
  "normalizedCandidate !== \"you\" && normalizedCandidate !== \"me\"",
  "LiveKit media surface must never trust local-only labels for remote participants",
);
assertIncludes(
  livekitSurface,
  "if (rosterEntry) {\n    if (rosterEntry.isCurrentUser) return \"You\";",
  "LiveKit media surface must let durable roster current-user truth beat local LiveKit identity aliases",
);
assertIncludes(
  livekitSurface,
  "const isCurrentParticipant = entry.isCurrentUser === true;",
  "LiveKit roster entries must not mark remote members current just because a transient identity alias collides",
);
assertIncludes(
  livekitSurface,
  "const bubbleGridItems = useMemo<BubbleGridItem[]>(() => {",
  "LiveKit media surface must build roster-aware bubble-grid items",
);
assertIncludes(
  livekitSurface,
  "styles.bubblePlaceholderWrap",
  "LiveKit bubble grid must render placeholders for known participants without camera tracks",
);
assertIncludes(
  livekitSurface,
  "getBubblePlaceholderStatus(item)",
  "LiveKit bubble-grid placeholders must use the explicit proofable placeholder-status helper",
);
assertIncludes(
  livekitSurface,
  "Camera preparing",
  "LiveKit bubble-grid placeholders must show approved speakers without tracks as camera-preparing, not falsely complete",
);
assertIncludes(
  livekitSurface,
  "styles.bubbleRequestBadge",
  "LiveKit bubble grid must show a visible request badge for host review",
);
assertIncludes(
  livekitSurface,
  "remoteCameraIdentities",
  "LiveKit media proof logs must include remote camera identities",
);
assertIncludes(
  livekitSurface,
  "bubbleGridIdentities",
  "LiveKit media proof logs must include bubble-grid identity mapping",
);
assertIncludes(
  livekitSurface,
  "bubbleGridTrackMappings",
  "LiveKit media proof logs must include readable identity-to-track mappings",
);
assertIncludes(
  livekitSurface,
  "participantLabelEntries",
  "LiveKit media proof logs must include readable identity-to-label mappings",
);
assertIncludes(
  livekitSurface,
  "isRequestingToSpeak: showRequestIndicators && !!participantRosterByIdentity.get(identity)?.isRequestingToSpeak",
  "LiveKit media proof logs must include readable request-state mappings",
);
assertIncludes(
  livekitSurface,
  "setCameraEnabled?.(shouldPublishLocalCamera, LIVE_VIDEO_CAPTURE_OPTIONS)",
  "LiveKit media surface must explicitly toggle camera publish after speaker upgrades",
);
assertIncludes(
  livekitSurface,
  "setMicrophoneEnabled?.(publishLocalAudio)",
  "LiveKit media surface must explicitly toggle microphone publish after speaker upgrades",
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
  "testID=\"live-stage-self-hero-toggle\"",
  "Live Stage must expose a viewer-only local self-hero toggle for installed proof",
);
assertIncludes(
  liveStage,
  "\"live-stage-self-party-card\"",
  "Live Stage must expose the viewer self party card in default host-hero layout",
);
assertIncludes(
  liveStage,
  "`live-stage-pending-seat-card-${participant.userId}`",
  "Live Stage pending requester card must be a direct seat-sheet tap target",
);
assertIncludes(
  liveStage,
  "\"Local self view\"",
  "Live Stage self-hero fallback must be immediate local role copy, not a syncing state",
);
assertIncludes(
  liveStage,
  "forceLocalHeroFallback={false}",
  "Live Stage self-hero must not route viewer fallback through LiveKit syncing state",
);
assertIncludes(
  liveStage,
  "testID=\"live-stage-seat-request-sheet\"",
  "Live Stage host seat-request sheet must be directly testable",
);
assertIncludes(
  liveStage,
  "testID=\"live-stage-seat-request-approve\"",
  "Live Stage host seat-request sheet must expose a direct approve action",
);
assertIncludes(
  liveStage,
  "testID=\"live-stage-seat-request-dismiss\"",
  "Live Stage host seat-request sheet must expose a safe dismiss action",
);
assertIncludes(
  partyRoomRouteAccessCheck,
  "setBlockedRoomAccess(access);",
  "Party Room route access must set a blocked-room gate when room access is denied.",
);

assertIncludes(
  liveWatchPartyCreateHandler,
  "preparedRoomBelongsToCurrentUser",
  "Live Watch-Party lobby must verify a prepared room still belongs to the current signed-in user before entering proof",
);
assertIncludes(
  liveWatchPartyCreateHandler,
  "watch_party_prepared_room_ignored",
  "Live Watch-Party lobby must emit a sanitized dev log and ignore stale prepared rooms instead of entering as viewer",
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
  "currentMembership?.canSpeak || currentMembership?.stageRole === \"speaker\"",
  "Watch-Party Live proof handoff must request speaker only from host-approved speaker membership",
);
assertIncludes(
  partyRoomWatchTogether,
  "participantRole: joinResult.participantRole",
  "Watch-Party Live prepared contract log must include participantRole",
);
assertIncludes(
  playerWatchPartyLiveKitContractRefresh,
  "watchPartyLiveKitJoinContract.participantRole !== desiredWatchPartyLiveKitParticipantRole",
  "Player Watch-Party LiveKit refresh must treat role upgrades and downgrades as stale",
);
assertIncludes(
  playerWatchPartyLiveKitContractRefresh,
  "existingCanPublish !== desiredWatchPartyLiveKitCanPublish",
  "Player Watch-Party LiveKit refresh must treat canPublish upgrades and downgrades as stale",
);
assertIncludes(
  playerWatchPartyLiveKitContractRefresh,
  "rejected stale prepared watch-party-live join contract",
  "Player Watch-Party LiveKit must reject prepared contracts that do not match current authority",
);
assertIncludes(
  playerWatchPartyLiveKitContractRefresh,
  "watch-party-live publish contract still downgraded; refreshing snapshot before one retry",
  "Player Watch-Party LiveKit must retry once after refreshing membership authority",
);
assertIncludes(
  playerWatchPartyLiveKitContractRefresh,
  "watchPartyLiveContractMatchesDesiredAuthority(",
  "Player Watch-Party LiveKit must use shared authority matching helper",
);
assertBefore(
  playerWatchPartyLiveKitContractRefresh,
  "if (joinResultMatchesDesired) {",
  "setWatchPartyLiveKitJoinContract(joinResult);",
  "Player Watch-Party LiveKit must only store fresh join contracts after authority matches",
);
assertNotIncludes(
  playerWatchPartyLiveKitContractRefresh,
  "kept backend-authoritative watch-party-live contract after guarded publish retry",
  "Player Watch-Party LiveKit must not keep downgraded publish contracts as ready",
);
assertIncludes(
  playerWatchPartyLiveKitContractRefresh,
  "watchPartyLiveKitContractRequestKeyRef.current = \"\";",
  "Player Watch-Party LiveKit must reset request keys after matching authority",
);
assertIncludes(
  player,
  "watch-party-live authority state",
  "Player Watch-Party LiveKit must log authority state for two-device proof",
);
assertIncludes(
  player,
  "membershipIdentities",
  "Player Watch-Party LiveKit proof logs must include membership identities for roster convergence",
);
assertIncludes(
  player,
  "presenceIdentities",
  "Player Watch-Party LiveKit proof logs must include realtime presence identities for roster convergence",
);
assertIncludes(
  player,
  "bubbleRenderedIdentities",
  "Player Watch-Party LiveKit proof logs must include rendered bubble identities",
);
assertIncludes(
  player,
  "missingBubbleIdentities",
  "Player Watch-Party LiveKit proof logs must expose membership participants missing from bubbles",
);
assertIncludes(
  player,
  "duplicateBubbleIdentities",
  "Player Watch-Party LiveKit proof logs must expose duplicate rendered participants",
);
assertIncludes(
  player,
  "roleMap: JSON.stringify(liveBubbleParticipants.map",
  "Player Watch-Party LiveKit proof logs must include the merged role map",
);
assertIncludes(
  player,
  "const resolvePartyParticipantDisplayName = (options: {",
  "Player Watch-Party participant labels must resolve through one sanitizer",
);
assertIncludes(
  player,
  "isLocalOnlyPartyParticipantLabel(label)",
  "Player Watch-Party participant labels must reject local-only remote labels",
);
assertIncludes(
  player,
  "const refreshMembershipRosterFromAuthority = async (force = false) => {",
  "Player Watch-Party roster must refresh membership authority for placeholder bubbles",
);
assertIncludes(
  player,
  "participantRoster={watchPartyLiveKitParticipantRoster}",
  "Player Watch-Party LiveKit surface must receive a roster for camera-less participants",
);
assertIncludes(
  player,
  "buildWatchPartyLiveParticipantRoster",
  "Player Watch-Party LiveKit roster must be built by the shared source-truth helper",
);
assertIncludes(
  player,
  "mergeWatchPartyLiveRoster",
  "Player Watch-Party bubble participants must come from the membership-authoritative roster merge",
);
assertIncludes(
  player,
  "memberships: Object.values(partyMembershipMapRef.current)",
  "Player Watch-Party bubble roster must use durable membership as its base source",
);
assertIncludes(
  player,
  "presenceParticipants: partyParticipants",
  "Player Watch-Party bubble roster may enrich membership with realtime presence",
);
assertIncludes(
  player,
  "shared-player-live-roster-placeholder",
  "regular Shared Player must render membership roster placeholders when LiveKit bubbles are still syncing",
);
assertIncludes(
  player,
  "if (liveBubbleParticipants.length === 1) return \"1 in room\";",
  "Shared Player participant preview text must use a neutral room count instead of concatenating host/viewer labels that can look like role mixing",
);
assertIncludes(
  player,
  "return `${liveBubbleParticipants.length} in room`;",
  "Shared Player participant preview text must remain a neutral room count for two-device Watch-Party Live proof",
);
assertIncludes(
  player,
  "Camera bubbles will appear as room members connect.",
  "Shared Player roster fallback must be honest about camera syncing instead of hiding active room members",
);
assertIncludes(
  player,
  "liveBubbleParticipants.find((participant) => participant.id === trackedUserId)",
  "Player Watch-Party current participant must be resolved from the merged roster, not raw presence only",
);
assertIncludes(
  player,
  "const tappedParticipant = liveBubbleParticipants.find((entry) => entry.id === participantIdentity)",
  "Player Watch-Party bubble taps must resolve remote viewers from the merged roster so focus does not hide them",
);
assertIncludes(
  player,
  "currentParticipantIdentity={watchPartyLiveKitIdentity || trackedUserId}",
  "Player Watch-Party LiveKit surface must receive explicit current identity",
);
assertIncludes(
  player,
  "partyMembershipRosterPollRef.current = setInterval",
  "Player Watch-Party Shared Player must poll membership authority so bubbles do not depend only on presence",
);
assertIncludes(
  player,
  "const onWatchPartyLiveKitParticipantPress = useCallback((identity: string) => {",
  "Player Watch-Party LiveKit bubble taps must route to participant handling",
);
assertIncludes(
  player,
  "watch-party-live bubble tapped",
  "Player Watch-Party LiveKit bubble taps must be logged for proof",
);
assertIncludes(
  player,
  "onParticipantPress={onWatchPartyLiveKitParticipantPress}",
  "Player Watch-Party LiveKit surface must wire bubble taps to seat requests",
);
assertIncludes(
  player,
  "onPressSharedPlayerRequestCamera(\"bubble\")",
  "Player Watch-Party LiveKit current-user bubble tap must use the explicit request-camera path",
);
assertIncludes(
  playerSharedPlayerDock,
  "shared-player-request-camera-button",
  "regular Shared Player must expose an explicit viewer Request Camera button",
);
assertIncludes(
  playerSharedPlayerDock,
  "shared-player-request-camera-pending",
  "regular Shared Player Request Camera button must expose a pending proof state",
);
assertIncludes(
  playerSharedPlayerDock,
  "shared-player-camera-request-error",
  "regular Shared Player Request Camera button must expose a safe error proof state",
);
assertIncludes(
  playerSharedPlayerDock,
  "onPressSharedPlayerRequestCamera(\"dock\")",
  "regular Shared Player Request Camera button must call the versioned request path",
);
assertIncludes(
  playerWatchPartyRequestCameraControl,
  "await requestPartySeat(currentWatchPartyParticipant.id);",
  "explicit Request Camera control must pass the visible participant id into the versioned request path",
);
assertIncludes(
  player,
  "const requestPartySeat = useCallback(async (participantIdOverride?: string)",
  "Watch-Party Live request path must accept a stable participant id override",
);
assertIncludes(
  playerWatchPartyRequestCameraControl,
  "Camera request sent. Waiting for host.",
  "explicit Request Camera control must show local pending feedback",
);
assertIncludes(
  playerWatchPartyRequestCameraControl,
  "Camera request unavailable. Try again in a moment.",
  "explicit Request Camera control must show safe failure feedback",
);
assertNotIncludes(
  playerWatchPartyRequestCameraControl,
  "blockViewerSharedPlaybackControl",
  "explicit Request Camera control must not be blocked by viewer playback lock",
);
assertNotIncludes(
  playerWatchPartyRequestCameraControl,
  "Share.share",
  "explicit Request Camera control must not open the Android share intent",
);
assertIncludes(
  player,
  "watch-party-live seat request sent",
  "Player Watch-Party LiveKit viewer requests must log Realtime broadcast send status",
);
assertIncludes(
  watchPartyLiveSourceTruth,
  "PARTY_SEAT_REQUEST_MESSAGE_PREFIX",
  "Watch-Party shared helpers must define the durable hidden seat-request marker prefix",
);
assertIncludes(
  watchPartyLiveSourceTruth,
  "export const encodePartySeatRequestMessage",
  "Watch-Party shared helpers must encode durable seat-request markers",
);
assertIncludes(
  watchPartyLiveSourceTruth,
  "export const decodePartySeatRequestMessage",
  "Watch-Party shared helpers must decode durable seat-request markers",
);
assertIncludes(
  player,
  "watch-party-live seat request marker persisted",
  "Player Watch-Party LiveKit viewer requests must persist a fallback marker for host receipt",
);
assertIncludes(
  player,
  "watch_party_live_seat_request_marker_unavailable",
  "Player Watch-Party LiveKit viewer requests must fail when the durable marker cannot persist",
);
assertIncludes(
  player,
  "watch-party-live seat request broadcast skipped; durable marker already persisted",
  "Player Watch-Party LiveKit viewer requests must not treat an unavailable social channel as delivery failure after marker persistence",
);
assertIncludes(
  player,
  "partyParticipantsRef.current.find",
  "Player Watch-Party presence sync must read participant state from a ref",
);
assertNotIncludes(
  playerWatchPartyPresenceSync,
  "partyParticipants.find",
  "Player Watch-Party presence sync must not close over participant state",
);
assertIncludes(
  playerWatchPartyPresenceSync,
  "}, []);",
  "Player Watch-Party presence sync callback must be stable so participant state changes do not tear down the social channel",
);
assertIncludes(
  player,
  "watch-party-live seat request received",
  "Player Watch-Party LiveKit host must log incoming visible-camera requests",
);
assertIncludes(
  player,
  "watch-party-live seat request message received",
  "Player Watch-Party LiveKit host must listen for persisted request markers",
);
assertIncludes(
  player,
  "applyPersistedSeatRequestMessages",
  "Player Watch-Party LiveKit host must process persisted camera request markers",
);
assertIncludes(
  player,
  "partySeatRequestPollRef.current = setInterval",
  "Player Watch-Party LiveKit host must poll persisted request markers as a Realtime fallback",
);
assertNotIncludes(
  playerWatchPartyHostSeatRequestPolling,
  "partySyncRole !== \"host\"",
  "Player Watch-Party LiveKit host polling must not be gated only by fragile partySyncRole state",
);
assertIncludes(
  playerWatchPartyHostSeatRequestPolling,
  "getWatchPartyHostAuthority()",
  "Player Watch-Party LiveKit host polling must use consolidated host authority",
);
assertIncludes(
  playerWatchPartyHostSeatRequestPolling,
  "applyPersistedHostSeatRequestMessages",
  "Player Watch-Party LiveKit host polling must process durable request markers independently of the social channel",
);
assertIncludes(
  playerWatchPartyHostSeatRequestPolling,
  "setPendingPartySeatRequest(participantId, pending, source, sentAt, requestVersion)",
  "Player Watch-Party LiveKit host polling must persist versioned pending request state across roster refresh",
);
assertIncludes(
  player,
  "pendingPartySeatRequestsRef",
  "Player Watch-Party LiveKit host must keep pending camera requests in a durable component ref",
);
assertIncludes(
  playerWatchPartySeatPersistence,
  "broadcastPartySeatRequest(participantId, false, clearingRequestVersion)",
  "Player Watch-Party LiveKit host approvals must persistently clear versioned pending camera request markers",
);
assertIncludes(
  playerWatchPartySeatPersistence,
  'clearPendingPartySeatRequest(participantId, "seat-state-persisted", clearingRequestVersion)',
  "Player Watch-Party LiveKit host approvals must locally clear using the current request version",
);
assertIncludes(
  player,
  'clearPendingPartySeatRequest(participant.id, "seat-request-denied", clearingRequestVersion)',
  "Player Watch-Party LiveKit host denies must locally clear using the current request version",
);
assertIncludes(
  player,
  "!decodePartySeatRequestMessage(m.body)",
  "Player Watch-Party LiveKit hidden request markers must not render as chat",
);
assertIncludes(
  partyRoom,
  "visibleRows = orderedRows.filter((row) => !decodePartySeatRequestMessage(row.text))",
  "Party Room chat history must filter hidden Watch-Party Live request markers",
);
assertIncludes(
  partyRoom,
  "if (decodePartySeatRequestMessage(rowText)) return;",
  "Party Room chat listener must filter hidden Watch-Party Live request markers",
);
assertIncludes(
  player,
  "currentUserIsHost",
  "Player Watch-Party LiveKit request receipt logs must show whether the receiver can approve",
);
assertIncludes(
  player,
  "setActiveParticipantToolsId(hostVisibleSeatRequester.id)",
  "Player Watch-Party LiveKit host must auto-open tools for pending camera requests",
);
assertIncludes(
  player,
  "watch-party-live host focused seat request",
  "Player Watch-Party LiveKit host must log request focus from roster/presence state",
);
assertIncludes(
  player,
  "showRequestIndicators: currentWatchPartyHostAuthority.isHost",
  "Player Watch-Party LiveKit roster must only expose pending viewer request state to hosts",
);
assertIncludes(
  player,
  "showRequestIndicators={currentWatchPartyHostAuthority.isHost}",
  "Player Watch-Party LiveKit media surface must hide request badges for viewers",
);
assertIncludes(
  livekitSurface,
  "showRequestIndicators?: boolean",
  "LiveKit media surface must accept a host-only request indicator flag",
);
assertIncludes(
  livekitSurface,
  "isRequestingToSpeak: showRequestIndicators &&",
  "LiveKit media surface must suppress request indicators when hidden",
);
assertNotIncludes(
  player,
  "Camera request sent to host.",
  "Viewer Watch-Party Live request success must not show a new overlay message",
);
assertNotIncludes(
  player,
  "Camera request is already waiting for the host.",
  "Viewer Watch-Party Live duplicate request must stay quiet",
);
assertIncludes(
  player,
  "participantLabelEntries: JSON.stringify(watchPartyLiveKitParticipantRoster.map",
  "Player Watch-Party authority logs must include readable roster label mappings",
);
assertIncludes(
  watchPartySeatRequestProof,
  "deviceOrEmulatorUsed: false",
  "Watch-Party seat request proof must not use attached devices or emulators",
);
assertIncludes(
  watchPartySeatRequestProof,
  "viewer roster should hide request indicators",
  "Watch-Party seat request proof must cover restored viewer-side request UX",
);
assertIncludes(
  watchPartySeatRequestProof,
  "duplicate pending request version must not reopen after X close",
  "Watch-Party seat request proof must cover request-version close suppression",
);
assertIncludes(
  watchPartySeatRequestProof,
  "helperBackedProof: true",
  "Watch-Party seat request proof must import real source-truth helpers",
);
assertIncludes(
  watchPartySeatRequestProof,
  "_lib/watch-party/watch-party-live-source-truth.ts",
  "Watch-Party seat request proof must import the production source-truth helper",
);
assertIncludes(
  partyRoom,
  "event: \"participant:seat-request\"",
  "Party Room viewer taps must broadcast a camera/mic seat request",
);
assertIncludes(
  partyRoom,
  "requested visible speaker seat",
  "Party Room viewer request flow must log visible-seat requests",
);
assertIncludes(
  partyRoom,
  "participant:seat-state",
  "Party Room host approvals must broadcast the persisted seat state",
);
assertIncludes(
  partyRoom,
  "blocked participant seat-state broadcast before membership persisted",
  "Party Room host approvals must not broadcast active seat state before persistence",
);
assertIncludes(
  playerWatchPartySeatPersistence,
  "return false;",
  "Player Watch-Party seat persistence must return failure when authority is not saved",
);
assertIncludes(
  playerWatchPartySeatPersistence,
  "blocked watch-party-live seat broadcast before membership authority persisted",
  "Player Watch-Party seat persistence must log blocked active-seat broadcasts",
);
assertBefore(
  playerWatchPartySeatPersistence,
  "if (!nextMembership)",
  "await broadcastPartySeatState(participantId, options);",
  "Player Watch-Party seat broadcasts must wait until membership authority is persisted.",
);
assertBefore(
  playerWatchPartyHostSeatApproval,
  "const seatPersisted = await persistPartySeatState(participant.id, {",
  "setPartyParticipants((prev) =>",
  "Player Watch-Party host controls must await seat persistence before committing speaker UI.",
);
assertIncludes(
  playerSharedAndroidVideoSurface,
  "const runSharedVideoOperation = useCallback(async (operation: string, action: () => unknown) => {",
  "Player shared Android video operations must be caught and logged",
);
assertIncludes(
  playerSharedAndroidVideoSurface,
  "logSharedVideoOperationFailure(\"source-load-callback\", error);",
  "Player shared Android sourceLoad callback promise rejections must be logged",
);
assertIncludes(
  player,
  "const logPlayerVideoOperationFailure = useCallback((operation: string, error: unknown, extra?: Record<string, unknown>) => {",
  "Player video operation failures must have safe logging",
);
assertIncludes(
  playerVideoLoadHandler,
  "void (async () => {",
  "Player video load handler must not return an unhandled promise to native onLoad",
);
assertIncludes(
  playerVideoLoadHandler,
  "runPlayerVideoOperation(\n            \"load-resume-seek\"",
  "Player resume seek during load must catch rejected native video promises",
);
assertIncludes(
  playerVideoLoadHandler,
  "runPlayerVideoOperation(\n          \"load-set-rate\"",
  "Player rate application during load must catch rejected native video promises",
);
assertIncludes(
  playerSharedPlaybackControlAuthority,
  "canControl: !isSharedPartyPlayback || authority.isHost",
  "Player Watch-Party shared playback control authority must allow only host mutation while shared",
);
assertIncludes(
  playerSharedPlaybackControlAuthority,
  "blocked viewer shared playback control",
  "Player Watch-Party shared playback viewer blocks must be logged for proof",
);
assertIncludes(
  playerSharedPlaybackControlAuthority,
  "setPartySyncStatus(\"Synced to Host · Controls locked\")",
  "Player Watch-Party shared playback viewer blocks must preserve sync-facing feedback",
);
assertIncludes(
  playerSharedPlaybackSync,
  "getSharedPlaybackControlAuthority().canControl",
  "Player Watch-Party shared playback sync writes must use host control authority",
);
assertBefore(
  playerSharedPlaybackStatusSync,
  "const canControlSharedPlayback = getSharedPlaybackControlAuthority().canControl;",
  "updateRoomPlayback(partyId, position, hostState).catch(() => {});",
  "Player Watch-Party status sync writes must read host control authority before writing playback.",
);
assertIncludes(
  playerSharedPlaybackStatusSync,
  "inWatchParty && partyId && canControlSharedPlayback && partySyncRoleRef.current === \"host\"",
  "Player Watch-Party status sync writes must stay host-only",
);
assertIncludes(
  playerSharedPlaybackTap,
  "blockViewerSharedPlaybackControl(\"tap-toggle\")",
  "Player Watch-Party shared playback taps must be host-only mutations",
);
assertBefore(
  playerSharedPlaybackTap,
  "blockViewerSharedPlaybackControl(\"tap-toggle\")",
  "await videoRef.current?.playAsync();",
  "Player Watch-Party viewer taps must be blocked before local play/pause mutation.",
);
assertIncludes(
  playerSharedPlaybackSeekDelta,
  "blockViewerSharedPlaybackControl(\"double-tap-seek\")",
  "Player Watch-Party shared playback double-tap seek must be host-only",
);
assertBefore(
  playerSharedPlaybackSeekDelta,
  "blockViewerSharedPlaybackControl(\"double-tap-seek\")",
  "await videoRef.current?.setPositionAsync(next);",
  "Player Watch-Party viewer double-tap seek must be blocked before local seek mutation.",
);
assertIncludes(
  playerSharedPlaybackPanResponder,
  "blockViewerSharedPlaybackControl(\"pan-scrub\")",
  "Player Watch-Party shared playback drag scrub must be host-only",
);
assertBefore(
  playerSharedPlaybackPanResponder,
  "blockViewerSharedPlaybackControl(\"pan-scrub\")",
  "videoRef.current\n            ?.setPositionAsync(nextPosition)",
  "Player Watch-Party viewer drag scrub must be blocked before local scrub mutation.",
);
assertIncludes(
  playerSharedPlaybackProgressResponder,
  "blockViewerSharedPlaybackControl(\"progress-scrub\")",
  "Player Watch-Party shared playback progress scrub must be host-only",
);
assertBefore(
  playerSharedPlaybackProgressResponder,
  "blockViewerSharedPlaybackControl(\"progress-scrub\")",
  "await videoRef.current?.setPositionAsync(finalPosition);",
  "Player Watch-Party viewer progress scrub must be blocked before local seek mutation.",
);
assertIncludes(
  playerSharedPlaybackUpNext,
  "blockViewerSharedPlaybackControl(\"up-next-navigate\")",
  "Player Watch-Party shared playback up-next navigation must be host-only",
);
assertIncludes(
  playerSharedPlaybackUpNext,
  "blockViewerSharedPlaybackControl(\"up-next-countdown\")",
  "Player Watch-Party shared playback up-next countdown must be host-only",
);
assertIncludes(
  player,
  "const canControlSharedPlayback = getSharedPlaybackControlAuthority().canControl;",
  "Player Watch-Party shared playback up-next status must read host authority",
);
assertIncludes(
  player,
  "canControlSharedPlayback &&",
  "Player Watch-Party shared playback up-next overlay must be host-only",
);
assertIncludes(
  playerWatchPartyRateControl,
  "blockViewerSharedPlaybackControl(\"rate-change\")",
  "Player Watch-Party shared playback speed changes must be host-only",
);
assertIncludes(
  player,
  "const watchPartyLiveSharedPlaybackControlsLocked = isSharedPartyPlayback && !currentWatchPartyHostAuthority.isHost;",
  "Player Watch-Party shared playback controls must expose a viewer-locked render state",
);
assertIncludes(
  player,
  "!watchPartyLiveSharedPlaybackControlsLocked ? progressScrubResponder.panHandlers : {}",
  "Player Watch-Party viewer progress scrub handlers must be removed while shared playback is locked",
);
assertIncludes(
  player,
  "!inWatchParty && !isLiveMode && !standalonePlaybackGateActive",
  "Player Watch-Party shared surface must not receive the standalone gesture target",
);
assertIncludes(
  player,
  "style={styles.standaloneVideoGestureTarget}",
  "Player standalone gesture target must stay explicit for visible-control play/pause taps",
);
assertIncludes(
  player,
  "top: 58",
  "Player standalone gesture target must match compact top overlay controls",
);
assertIncludes(
  player,
  "bottom: 76",
  "Player standalone gesture target must match compact bottom overlay controls",
);
assertIncludes(
  player,
  "zIndex: 40",
  "Player standalone gesture target must stay below standalone control chrome and above the video",
);
assertIncludes(
  player,
  "disabled={watchPartyLiveSharedPlaybackControlsLocked}",
  "Player Watch-Party viewer speed chips must be disabled while shared playback is locked",
);
assertNotIncludes(
  playerWatchPartyCommentsToggle,
  "blockViewerSharedPlaybackControl",
  "Player Watch-Party comments must not become host-only",
);
assertNotIncludes(
  playerWatchPartyRoomButton,
  "blockViewerSharedPlaybackControl",
  "Player Watch-Party room navigation must not become host-only",
);
assertNotIncludes(
  playerWatchPartyReactionSelect,
  "blockViewerSharedPlaybackControl",
  "Player Watch-Party reactions must not become host-only",
);
assertNotIncludes(
  playerWatchPartySeatRequest,
  "blockViewerSharedPlaybackControl",
  "Player Watch-Party camera/mic requests must not become host-only",
);
assertIncludes(
  player,
  "const renderWatchPartyLiveHostReviewCard = () => {",
  "Player Watch-Party Live title player must render host request review controls",
);
assertIncludes(
  player,
  "{renderWatchPartyLiveHostReviewCard()}",
  "Player Watch-Party Live title player must mount host request review controls under the media deck",
);
assertIncludes(
  player,
  "watchPartyHostReviewPrimaryBtn",
  "Player Watch-Party Live title host request controls must expose a tappable primary action",
);
assertIncludes(
  player,
  "shared-player-host-request-card",
  "Player Watch-Party host request review card must expose an installed-proof target",
);
assertIncludes(
  player,
  "shared-player-host-request-approve",
  "Player Watch-Party host request review card must expose an installed-proof approve target",
);
assertIncludes(
  player,
  "shared-player-host-request-deny",
  "Player Watch-Party host request review card must expose an installed-proof deny target",
);
assertIncludes(
  player,
  "shared-player-host-request-close",
  "Player Watch-Party host request review card must expose an installed-proof close target",
);
const playerSharedHostReviewCard = sliceBetween(
  player,
  "const renderWatchPartyLiveHostReviewCard = () => {",
  "const renderWatchPartySocialPanel =",
  "Player Watch-Party host request review card boundary",
);
assertIncludes(
  playerSharedHostReviewCard,
  "const renderHostReviewActions = () => (",
  "Player Watch-Party host request review card must centralize tappable actions",
);
assertBefore(
  playerSharedHostReviewCard,
  "{isRequesting ? renderHostReviewActions() : null}",
  "<Text style={styles.watchPartyHostReviewBody}>",
  "Player Watch-Party pending request approve/deny actions must render before the explanatory body so they stay reachable",
);
assertIncludes(
  playerPartyCommentsContent,
  "shared-player-comment-input",
  "regular Shared Player comments must expose an installed-proof input target",
);
assertIncludes(
  playerPartyCommentsContent,
  "shared-player-comment-send",
  "regular Shared Player comments must expose an installed-proof send target",
);
assertIncludes(
  playerPartyCommentsContent,
  "!compactSharedDock ? (",
  "regular Shared Player compact comments must prioritize the input/send composer over a clipped title/list",
);
assertIncludes(
  playerPartyCommentsContent,
  "setPartyCommentsOpen(true);",
  "regular Shared Player comment input focus must open keyboard-safe comment mode",
);
assertNotIncludes(
  playerPartyCommentsContent,
  "Share.share",
  "regular Shared Player comment controls must not open the Android share intent",
);
assertNotIncludes(
  playerPartyCommentsContent,
  "blockViewerSharedPlaybackControl",
  "regular Shared Player comments must not be blocked by viewer playback lock",
);
assertIncludes(
  playerSharedPlayerDock,
  'testID="shared-player-regular-controls"',
  "regular Shared Player must mount a stable control deck for installed proof",
);
assertNotIncludes(
  playerSharedPlayerDock,
  'pointerEvents={effectiveControlsVisible ? "auto" : "none"}',
  "regular Shared Player controls must not be hidden behind the auto-hide pointer gate",
);
assertNotIncludes(
  playerSharedPlayerDock,
  "partyOverlayControlsOpacity",
  "regular Shared Player controls must not rely on hidden overlay opacity for reachability",
);
assertIncludes(
  playerSharedPlayerDock,
  "shared-player-reaction-button",
  "regular Shared Player must expose a reachable viewer reaction button",
);
assertIncludes(
  playerSharedPlayerDock,
  "onPressSharedPlayerQuickReaction",
  "regular Shared Player reaction button must use the local reaction path",
);
assertIncludes(
  player,
  "event: \"reaction\"",
  "regular Shared Player reactions must broadcast to the room",
);
assertIncludes(
  player,
  "watch-party-live reaction received",
  "regular Shared Player reactions must log receiver-side reaction delivery for installed proof",
);
assertIncludes(
  player,
  "author: \"Reaction\"",
  "regular Shared Player reactions must create a visible local receiver event, not only a transient animation",
);
assertIncludes(
  player,
  "selfParticipantId",
  "regular Shared Player reactions must associate local reactions with the sender participant instead of an arbitrary active/host participant",
);
assertNotIncludes(
  playerSharedPlayerDock,
  "Share.share",
  "regular Shared Player lower controls must not open Android Share directly",
);
assertIncludes(
  player,
  "zIndex: 60",
  "regular Shared Player lower controls must stay above video/share gesture surfaces",
);
assertIncludes(
  player,
  "elevation: 60",
  "regular Shared Player lower controls must stay above Android touch layers",
);
assertIncludes(
  player,
  "titleParticipantFeedDock: {\n    marginTop: 4,\n    position: \"relative\",\n    zIndex: 120,\n    elevation: 120,",
  "regular Shared Player lower dock must own the highest Android touch layer",
);
assertIncludes(
  player,
  "sharedAndroidVideoTapTarget: {\n    ...StyleSheet.absoluteFillObject,\n    bottom: 56,\n    zIndex: 1,\n    elevation: 1,",
  "regular Shared Player video tap target must stay below the lower dock touch layer",
);
assertIncludes(
  playerWatchPartyHostControls,
  "Use the review card to approve or deny this camera request.",
  "Player Watch-Party pending inline tools must defer approval to the stable review card",
);
assertNotIncludes(
  playerWatchPartyHostControls,
  "Approve</Text>",
  "Player Watch-Party pending inline tools must not expose inline Approve",
);
assertNotIncludes(
  playerWatchPartyHostControls,
  "Deny</Text>",
  "Player Watch-Party pending inline tools must not expose inline Deny",
);
assertNotIncludes(
  playerWatchPartyHostControls,
  "Seat Participant",
  "Player Watch-Party non-requesting audience listeners must not expose direct Seat Participant inline controls",
);
assertIncludes(
  player,
  "pointerEvents=\"none\" style={styles.livePresenceEventToast}",
  "Player Watch-Party Live request toast must not block host control taps",
);
assertIncludes(
  partyRoom,
  "liveKitIdentity: participantIdentity",
  "Party Room must pass the prepared LiveKit participant identity through the Player route handoff",
);
assertIncludes(
  watchParty,
  "export const resolvePremiumAccessKeyForRoom",
  "Watch-Party shared helpers must export the canonical Premium access key resolver",
);
assertIncludes(
  partyRoom,
  "resolvePremiumAccessKeyForRoom(",
  "Party Room Watch-Party Live handoff must use the canonical Premium access key resolver",
);
assertIncludes(
  player,
  "const premiumAccessKey = resolvePremiumAccessKeyForRoom(snapshot.room);",
  "Player Watch-Party Live entry must use the same canonical Premium access key resolver",
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
  player,
  "desiredWatchPartyLiveKitParticipantRole",
  "Player must resolve Watch-Party Live effective participant role from membership before token refresh",
);
assertIncludes(
  player,
  "publishLocalVideo={publishWatchPartyLiveKitVideo}",
  "Player must disable local LiveKit camera publish when backend canPublish is false or the speaker is muted",
);
assertIncludes(
  player,
  "numColumns={liveLayout && !fullscreenRail ? 5 : undefined}",
  "Watch-Party Live player participant surface must use a five-column grid outside shared fullscreen rail",
);
assertIncludes(
  player,
  "LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS",
  "Player must cap approved active speakers through the shared launch seat cap",
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
  "Live video unavailable",
  "Live Stage must show a user-safe unavailable state instead of a silent avatar fallback",
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
assertIncludes(
  liveStage,
  "const collapseHostParticipantControls = useCallback",
  "Live Stage must provide a host-control collapse path after seat actions",
);
assertIncludes(
  liveStageHostCardPress,
  "if (!isHost || !canModerateParticipant)",
  "Live Stage host moderation taps must not open the participant detail sheet",
);
assertIncludes(
  liveStageHostCardPress,
  "setSelectedParticipantId(\"\");",
  "Live Stage host moderation taps must close any open participant detail sheet",
);
assertCountAtLeast(
  liveStageHostActionMenu,
  "event.stopPropagation();",
  3,
  "Live Stage host action buttons must stop parent card tap propagation.",
);
assertBefore(
  liveStageHostApproveAction,
  "const seatPersisted = await emitParticipantUpdate(nextParticipantId, { role: \"speaker\" });",
  "broadcastSeatState(nextParticipantId, {",
  "Live Stage approve broadcasts must wait until membership authority is persisted.",
);
assertBefore(
  liveStageHostApproveAction,
  "broadcastSeatState(nextParticipantId, {",
  "collapseHostParticipantControls(nextParticipantId);",
  "Live Stage approve must collapse host controls after broadcasting the persisted seat state.",
);
assertBefore(
  liveStageHostMuteAction,
  "const mutePersisted = await emitParticipantUpdate(participant.userId, { isMuted: !isMuted });",
  "setParticipantStateById((prev) => {",
  "Live Stage mute UI must wait until membership authority is persisted.",
);
assertBefore(
  liveStageHostRemoveAction,
  "const removePersisted = await emitParticipantUpdate(participant.userId, { isRemoved: !isRemoved });",
  "broadcastSeatState(participant.userId, {",
  "Live Stage remove broadcasts must wait until membership authority is persisted.",
);
assertIncludes(
  liveStageSeatApprovalProof,
  "proof-live-stage-host-0001",
  "Live Stage proof must use a deterministic fake host identity",
);
assertIncludes(
  liveStageSeatApprovalProof,
  "proof-live-stage-viewer-0001",
  "Live Stage proof must use a deterministic fake viewer identity",
);
assertIncludes(
  liveStageSeatApprovalProof,
  "detail modal should stay closed for host moderation taps",
  "Live Stage proof must cover the host detail-sheet regression",
);
assertIncludes(
  liveStageSeatApprovalProof,
  "viewer should become publish-capable after host approval",
  "Live Stage proof must cover approved viewer publish authority",
);
assertIncludes(
  liveStageSeatApprovalProof,
  "deviceOrEmulatorUsed: false",
  "Live Stage proof must not use attached devices or emulators",
);
assertIncludes(
  liveStageSeatApprovalProof,
  "realAuthAccountCreated: false",
  "Live Stage proof must not create real auth accounts",
);

if (process.exitCode) {
  process.exit();
}

console.log("Watch-Party LiveKit camera guard passed.");
