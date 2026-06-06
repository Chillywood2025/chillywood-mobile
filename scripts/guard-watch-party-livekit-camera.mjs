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
const watchPartySeatRequestProof = readSource("scripts/proof-watch-party-seat-request.mjs");
const liveStageSeatApprovalProof = readSource("scripts/proof-live-stage-seat-approval.mjs");
const premiumWatchPartyAccess = readSource("_lib/premiumWatchPartyAccess.ts");
const partyRoomWatchTogether = sliceBetween(
  partyRoom,
  "const onWatchTogether = useCallback(async () => {",
  "const onPickPartyRoomCommentAttachment = useCallback(async (scope: SocialAttachmentPickerScope) => {",
  "Party Room Watch Together handler boundary",
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
  "const persistPartySeatRequestMarker = useCallback(async (participantId: string, pending: boolean) => {",
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
  "const requestPartySeat = useCallback(async () => {",
  "const persistPartySeatState = useCallback(async (participantId: string, options: {",
  "Player Watch-Party seat request boundary",
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
const liveStageHostCardPress = sliceBetween(
  liveStage,
  "debugLiveStage(\"host tap user\", { userId: participant.userId });",
  "onLongPress={() => {",
  "Live Stage host card press boundary",
);
const liveStageHostActionMenu = sliceBetween(
  liveStage,
  "{isHost && isActiveParticipant && canModerateParticipant ? (",
  "<View style={[styles.stagePresenceTapWrap",
  "Live Stage host action menu boundary",
);
const liveStageHostApproveAction = sliceBetween(
  liveStageHostActionMenu,
  "const seatPersisted = await emitParticipantUpdate(participant.userId, { role: \"speaker\" });",
  "<Text style={styles.stageParticipantActionText}>Deny</Text>",
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
  "onPress={() => onParticipantPress?.(item.identity)}",
  "LiveKit bubble-grid items must call the participant press handler",
);
assertIncludes(
  livekitSurface,
  "normalizedCandidate !== \"you\" && normalizedCandidate !== \"me\"",
  "LiveKit media surface must never trust local-only labels for remote participants",
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
  "item.isRequestingToSpeak ? \"Request\"",
  "LiveKit bubble-grid placeholders must show pending camera requests",
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
  "requestPartySeat().catch",
  "Player Watch-Party LiveKit current-user bubble tap must send the visible camera request quietly",
);
assertIncludes(
  player,
  "watch-party-live seat request sent",
  "Player Watch-Party LiveKit viewer requests must log Realtime broadcast send status",
);
assertIncludes(
  watchParty,
  "PARTY_SEAT_REQUEST_MESSAGE_PREFIX",
  "Watch-Party shared helpers must define the durable hidden seat-request marker prefix",
);
assertIncludes(
  watchParty,
  "export const encodePartySeatRequestMessage",
  "Watch-Party shared helpers must encode durable seat-request markers",
);
assertIncludes(
  watchParty,
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
  "setPendingPartySeatRequest(participantId, pending, source, sentAt)",
  "Player Watch-Party LiveKit host polling must persist pending request state across roster refresh",
);
assertIncludes(
  player,
  "pendingPartySeatRequestsRef",
  "Player Watch-Party LiveKit host must keep pending camera requests in a durable component ref",
);
assertIncludes(
  playerWatchPartySeatPersistence,
  "broadcastPartySeatRequest(participantId, false)",
  "Player Watch-Party LiveKit host approvals must persistently clear pending camera request markers",
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
  "isRequestingToSpeak: currentWatchPartyHostAuthority.isHost && !!participant.isRequestingToSpeak && role === \"viewer\"",
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
  "pending request should survive a roster refresh",
  "Watch-Party seat request proof must cover durable host pending state",
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
  "pointerEvents=\"none\" style={styles.livePresenceEventToast}",
  "Player Watch-Party Live request toast must not block host control taps",
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
  5,
  "Live Stage host action buttons must stop parent card tap propagation.",
);
assertBefore(
  liveStageHostApproveAction,
  "const seatPersisted = await emitParticipantUpdate(participant.userId, { role: \"speaker\" });",
  "broadcastSeatState(participant.userId, {",
  "Live Stage approve broadcasts must wait until membership authority is persisted.",
);
assertBefore(
  liveStageHostApproveAction,
  "broadcastSeatState(participant.userId, {",
  "collapseHostParticipantControls(participant.userId);",
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
