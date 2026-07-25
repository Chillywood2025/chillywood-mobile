#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const readSource = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Player overlay policy guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const sliceBetween = (source, startNeedle, endNeedle, label) => {
  const startIndex = source.indexOf(startNeedle);
  const endIndex = source.indexOf(endNeedle, startIndex + startNeedle.length);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    fail(`${label} boundary changed.`);
    return "";
  }
  return source.slice(startIndex, endIndex);
};

const player = readSource("app/player/[id].tsx");
const watchPartyLiveKitGuard = readSource("scripts/guard-watch-party-livekit-camera.mjs");
const oldRoomGuard = readSource("scripts/guard-old-room-handling.mjs");

const standaloneTopChrome = sliceBetween(
  player,
  "function StandalonePlayerTopChrome",
  "const getLiveFaceFilterPresentation",
  "Standalone Player top chrome",
);
const standaloneVideoGestureTargetStyle = sliceBetween(
  player,
  "standaloneVideoGestureTarget: {",
  "sharedAndroidVideoTapTarget:",
  "Standalone Player gesture target styles",
);
const panResponder = sliceBetween(
  player,
  "const panResponder = useMemo(",
  "const progressScrubResponder = useMemo(",
  "Player gesture responder",
);

[
  "standalone-title",
  "standalone-creator-video",
  "spectator-child-playback",
  "watch-party-live-shared",
  "live-watch-party-stage",
  "resolvePlayerSurfaceMode",
].forEach((needle) => assertIncludes(player, needle, "Player surface mode resolver"));

assertIncludes(standaloneTopChrome, "canStartWatchPartyLive", "standalone Watch-Party Live CTA guard");
assertIncludes(standaloneTopChrome, "Watch-Party Live", "standalone Watch-Party Live CTA");
assertNotIncludes(standaloneTopChrome, "+ List", "standalone top-left actions");
assertNotIncludes(standaloneTopChrome, "Like", "standalone top-left actions");
assertIncludes(standaloneTopChrome, "Share", "standalone top-left Share action");
assertIncludes(standaloneTopChrome, "canShare", "standalone Share action");
assertIncludes(standaloneTopChrome, "canReport", "standalone Report action");
assertIncludes(standaloneTopChrome, "playbackRateLabel", "standalone top playback-rate chip");
assertIncludes(standaloneTopChrome, "onCyclePlaybackRate", "standalone top playback-rate action");
assertNotIncludes(standaloneTopChrome, "onToggleSpeedMenu", "standalone top chrome");
assertNotIncludes(player, "Mark Shared", "standalone Player Share label");

assertIncludes(player, "canStartStandaloneWatchPartyLive = isStandalonePlayer", "standalone Watch-Party Live eligibility");
assertIncludes(player, "&& !isSpectatorPlayback", "Spectator playback Watch-Party Live CTA exclusion");
assertNotIncludes(player, "&& !isCreatorVideoPlaybackUnavailable\n    && !isPlatformVideoUnavailable", "standalone Watch-Party Live CTA source-availability gating");
assertIncludes(player, "playbackSource && !standalonePlaybackSourceFailed", "standalone video source render");
assertNotIncludes(player, "&& !controlsVisible ? (\n              <View\n                collapsable={false}\n                pointerEvents=\"auto\"\n                style={styles.standaloneVideoGestureTarget}", "standalone gesture target must remain available for visible-control play/pause taps");
assertIncludes(standaloneVideoGestureTargetStyle, "top: 58", "standalone gesture target must match compact top overlay controls");
assertIncludes(standaloneVideoGestureTargetStyle, "bottom: 76", "standalone gesture target must match compact bottom overlay controls");
assertIncludes(standaloneVideoGestureTargetStyle, "zIndex: 40", "standalone gesture target must sit below control chrome and above the video");
assertIncludes(player, "zIndex: 46", "standalone top chrome remains above gesture target");
assertIncludes(player, "zIndex: 90", "standalone bottom chrome remains above gesture target");
assertIncludes(player, "playerFrameworkFullscreenBackground", "standalone fullscreen must use plain background");
assertIncludes(player, "isStandaloneFullscreen ? (\n          <View style={styles.playerFrameworkFullscreenBackground} />", "standalone fullscreen must not render poster blur/background wash");
assertIncludes(player, "!isStandaloneFullscreen ? (\n          <>", "standalone fullscreen must suppress framework depth overlays");
assertNotIncludes(player, "standaloneVideoBottomMatte", "standalone Player bottom matte");
assertNotIncludes(player, "StandalonePlaybackMenu", "standalone Playback sheet");
assertNotIncludes(player, "Speed and quality", "standalone Playback sheet visible copy");
assertNotIncludes(player, "PLAYBACK_QUALITY_AUTO_LABEL", "standalone Auto quality row");
assertNotIncludes(player, "More options appear when available.", "standalone Auto quality helper copy");
assertNotIncludes(player, "Quality options appear when multiple sources are available.", "bulky Auto quality helper copy");
assertNotIncludes(player, "standalonePlaybackSpeedGrid", "bulky speed chip grid");
assertNotIncludes(player, "standalonePlaybackSpeedList", "Playback menu Speed rows");
assertNotIncludes(player, "720p", "Playback menu must not fake quality options");
assertNotIncludes(player, "1080p", "Playback menu must not fake quality options");
assertIncludes(player, "onCycleStandalonePlaybackRate", "compact direct playback-rate control");
assertIncludes(player, "formatPlaybackRateLabel(playbackRate)", "compact direct playback-rate label");
assertIncludes(player, "ScreenOrientation.OrientationLock.LANDSCAPE", "standalone fullscreen landscape orientation lock");
assertIncludes(player, "ScreenOrientation.OrientationLock.PORTRAIT_UP", "standalone fullscreen portrait orientation restore");
assertNotIncludes(player, "partySpeedOverlay", "loose speed pills across video");
assertNotIncludes(player, "onToggleSpeedMenu", "loose top speed toggle");

[
  "getTouchFocalPoint",
  "clampZoomTranslation",
  "pinchStartFocalRef",
  "zoomTranslateX",
  "zoomTranslateY",
  "zoomPanStartTranslateRef",
  "setZoomTransform",
  "resetZoom",
].forEach((needle) => assertIncludes(player, needle, "precision zoom support"));
assertIncludes(panResponder, "getTouchFocalPoint(touches, videoLayoutRef.current)", "pinch focal-point handling");
assertIncludes(panResponder, "setZoomTransform(nextScale", "pinch updates scale and translation together");
assertIncludes(panResponder, "zoomPanStartTranslateRef.current.x + gestureState.dx", "zoomed pan handling");
assertIncludes(panResponder, "resetZoom()", "zoom reset handling");
assertIncludes(player, "Reset Zoom", "Reset Zoom control");

assertIncludes(player, "watchPartyAudioMixPanel", "Watch-Party Live shared Audio Mix remains");
assertIncludes(player, "Audio Mix", "Watch-Party Live shared Audio Mix label remains");
assertNotIncludes(standaloneTopChrome, "Audio Mix", "standalone top chrome");
assertIncludes(player, "shouldAutoStartAuthorizedNativeLiveKitMedia(Platform.OS)", "shared Player uses the Android/iOS LiveKit auto-start policy");
assertIncludes(player, "const publishWatchPartyLiveKitAudio = watchPartyLocalMediaIntent", "LiveKit audio publish remains local-intent gated");
assertIncludes(player, "&& watchPartyLiveKitCanPublish", "LiveKit local publish remains backend-authority gated");
assertIncludes(watchPartyLiveKitGuard, "Player Watch-Party LiveKit", "Watch-Party LiveKit guard still tracks Player route");
assertIncludes(oldRoomGuard, "isWatchPartyRoomActive", "old-room handling guard remains present");

assertNotIncludes(player, "Mini Platform", "Player user-facing copy");
assertNotIncludes(player, "storage_path", "raw storage path rendering");

if (process.exitCode) process.exit();

console.log("Player overlay policy guard passed.");
