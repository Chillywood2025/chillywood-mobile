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
  "type StandalonePlaybackMenuProps",
  "Standalone Player top chrome",
);
const standalonePlaybackMenu = sliceBetween(
  player,
  "function StandalonePlaybackMenu",
  "const getLiveFaceFilterPresentation",
  "Standalone Player playback menu",
);
const standalonePlaybackMenuStyles = sliceBetween(
  player,
  "standalonePlaybackMenu: {",
  "partyReactionBurstWrap:",
  "Standalone Player playback menu styles",
);
const standaloneVideoGestureTargetStyle = sliceBetween(
  player,
  "standaloneVideoGestureTarget: {",
  "sharedAndroidVideoTapTarget:",
  "Standalone Player gesture target styles",
);
const standalonePlaybackQualityActiveStyle = sliceBetween(
  player,
  "standalonePlaybackQualityRowActive: {",
  "standalonePlaybackQualityLabel:",
  "Standalone Player quality active style",
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
assertIncludes(standaloneTopChrome, "+ List", "standalone top-left List action");
assertIncludes(standaloneTopChrome, "Like", "standalone top-left Like action");
assertIncludes(standaloneTopChrome, "Share", "standalone top-left Share action");
assertIncludes(standaloneTopChrome, "canShareCreatorVideo", "standalone Share action");
assertIncludes(standaloneTopChrome, "canReport", "standalone Report action");
assertNotIncludes(standaloneTopChrome, "playbackRate", "standalone top chrome");
assertNotIncludes(standaloneTopChrome, "onToggleSpeedMenu", "standalone top chrome");
assertNotIncludes(player, "Mark Shared", "standalone Player Share label");

assertIncludes(player, "canStartStandaloneWatchPartyLive = isStandalonePlayer", "standalone Watch-Party Live eligibility");
assertIncludes(player, "&& !isSpectatorPlayback", "Spectator playback Watch-Party Live CTA exclusion");
assertIncludes(player, "playbackSource && !standalonePlaybackSourceFailed", "standalone video source render");
assertNotIncludes(player, "&& !controlsVisible ? (\n              <View\n                collapsable={false}\n                pointerEvents=\"auto\"\n                style={styles.standaloneVideoGestureTarget}", "standalone gesture target must remain available for visible-control play/pause taps");
assertIncludes(standaloneVideoGestureTargetStyle, "top: 60", "standalone gesture target must avoid top controls");
assertIncludes(standaloneVideoGestureTargetStyle, "bottom: 82", "standalone gesture target must avoid bottom controls");
assertIncludes(standaloneVideoGestureTargetStyle, "zIndex: 40", "standalone gesture target must sit below control chrome and above the video");
assertIncludes(player, "zIndex: 46", "standalone top chrome remains above gesture target");
assertIncludes(player, "zIndex: 47", "standalone bottom chrome remains above gesture target");
assertIncludes(standalonePlaybackMenuStyles, "zIndex: 48", "standalone Playback menu remains above gesture target");
assertIncludes(player, "StandalonePlaybackMenu", "standalone playback menu render");
assertIncludes(standalonePlaybackMenu, "Playback", "Playback menu title");
assertIncludes(standalonePlaybackMenu, "Speed", "Playback menu Speed section");
assertIncludes(standalonePlaybackMenu, "Quality", "Playback menu Quality section");
assertIncludes(standalonePlaybackMenu, "PLAYBACK_QUALITY_AUTO_LABEL", "Playback menu Auto-only quality");
assertIncludes(standalonePlaybackMenu, "More options appear when available.", "Auto-only quality copy");
assertIncludes(standalonePlaybackMenuStyles, "position: \"absolute\"", "compact bottom Playback menu");
assertIncludes(standalonePlaybackMenuStyles, "maxHeight: \"40%\"", "compact bottom Playback menu height cap");
assertIncludes(standalonePlaybackMenuStyles, "standalonePlaybackSpeedList", "Playback menu Speed rows");
assertNotIncludes(standalonePlaybackMenuStyles, "standalonePlaybackSpeedGrid", "bulky speed chip grid");
assertNotIncludes(standalonePlaybackMenu, "Quality options appear when multiple sources are available.", "bulky Auto quality helper copy");
assertNotIncludes(standalonePlaybackQualityActiveStyle, "220,20,60", "Auto quality row must not be a giant red card");
assertNotIncludes(standalonePlaybackMenu, "720p", "Playback menu must not fake quality options");
assertNotIncludes(standalonePlaybackMenu, "1080p", "Playback menu must not fake quality options");
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
assertNotIncludes(standalonePlaybackMenu, "Audio Mix", "standalone Playback menu");
assertIncludes(player, "const publishWatchPartyLiveKitAudio = watchPartyLiveKitCanPublish && !currentWatchPartyParticipantMuted", "LiveKit audio publish guard unchanged");
assertIncludes(watchPartyLiveKitGuard, "Player Watch-Party LiveKit", "Watch-Party LiveKit guard still tracks Player route");
assertIncludes(oldRoomGuard, "isWatchPartyRoomActive", "old-room handling guard remains present");

assertNotIncludes(player, "Mini Platform", "Player user-facing copy");
assertNotIncludes(player, "storage_path", "raw storage path rendering");

if (process.exitCode) process.exit();

console.log("Player overlay policy guard passed.");
