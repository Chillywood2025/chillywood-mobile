const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createRunOncePlugin, withDangerousMod } = require("@expo/config-plugins");

const PLUGIN_NAME = "with-webrtc-sender-acknowledgment";
// Compatibility repair for the pinned SDK bridge only. LiveKit intentionally
// binds native camera selection at acquisition (upstream PR #34); this plugin
// does not change that policy. New camera tracks use the supported capture /
// sender replacement path, whose native failure must reach JavaScript.
// https://github.com/livekit/react-native-webrtc/commit/d7dfbaecdd980364ce9591cbc83a75b5ca3a6db4
const SDK_VERSION = "144.0.0";
const digest = (source) => crypto.createHash("sha256").update(source).digest("hex");
const definitions = {
  android: {
    relativePath: "android/src/main/java/com/oney/WebRTCModule/WebRTCModule.java",
    originalSha256: "ed4aa8eacfa1311f681de34cae94d1bac5c4a2984ae7c9ad6835217e408dda20",
    patchedSha256: "bd5fe459edd9089ca418e214bf4f39120b55a898f9b0035408315a8a2e818df1",
    changes: [[
      "                MediaStreamTrack track = getLocalTrack(trackId);\n                sender.setTrack(track, false);\n                promise.resolve(true);",
      "                MediaStreamTrack track = trackId == null ? null : getLocalTrack(trackId);\n                if (trackId != null && track == null) {\n                    promise.reject(new Exception(\"Replacement track is not available\"));\n                    return;\n                }\n                if (!sender.setTrack(track, false)) {\n                    promise.reject(new Exception(\"Native sender rejected replacement track\"));\n                    return;\n                }\n                promise.resolve(true);",
    ], [
      "            track.setEnabled(false);\n            getUserMediaImpl.disposeTrack(id);",
      "            track.setEnabled(false);\n            // A recovered or cloned track can belong to several local streams.\n            // Detach every borrowed stream reference before disposing its native\n            // owner; otherwise later MediaStream.dispose() dereferences a freed\n            // track and aborts the WebRTC executor. All work stays on its queue.\n            for (MediaStream stream : localStreams.values()) {\n                if (track instanceof AudioTrack && stream.audioTracks.contains(track)) {\n                    stream.removeTrack((AudioTrack) track);\n                } else if (track instanceof VideoTrack && stream.videoTracks.contains(track)) {\n                    stream.removeTrack((VideoTrack) track);\n                }\n            }\n            getUserMediaImpl.disposeTrack(id);",
    ]],
  },
  ios: {
    relativePath: "ios/RCTWebRTC/WebRTCModule+Transceivers.m",
    originalSha256: "604178c48476fc16b4793eed9c7850f77f68e7a642e725dd14fc7abcd561e5a1",
    patchedSha256: "a7b93e9906e2143fb499e1fabef516d6c4cc6c2bea682928bdd37e181cbe60cf",
    changes: [
      [
        "        RCTLogWarn(@\"PeerConnection %@ not found in senderReplaceTrack()\", objectID);\n        reject(@\"E_INVALID\", @\"Peer Connection is not initialized\", nil);",
        "        RCTLogWarn(@\"PeerConnection %@ not found in senderReplaceTrack()\", objectID);\n        reject(@\"E_INVALID\", @\"Peer Connection is not initialized\", nil);\n        return;",
      ],
      [
        "        RCTLogWarn(@\"senderReplaceTrack() transceiver is null\");\n        reject(@\"E_INVALID\", @\"Could not get transceive\", nil);",
        "        RCTLogWarn(@\"senderReplaceTrack() transceiver is null\");\n        reject(@\"E_INVALID\", @\"Could not get transceive\", nil);\n        return;",
      ],
      [
        "    RTCMediaStreamTrack *track = self.localTracks[trackId];\n    [sender setTrack:track];\n    resolve(@true);",
        "    RTCMediaStreamTrack *track = trackId == nil ? nil : self.localTracks[trackId];\n    if (trackId != nil && track == nil) {\n        reject(@\"E_INVALID\", @\"Replacement track is not available\", nil);\n        return;\n    }\n    [sender setTrack:track];\n    // The native setter returns void and may only log a failed SetTrack.\n    // Read the actual native sender, whose getter queries its current track.\n    RTCMediaStreamTrack *attachedTrack = sender.track;\n    BOOL replacementConfirmed = track == nil ? attachedTrack == nil\n        : attachedTrack != nil && [attachedTrack.trackId isEqualToString:track.trackId]\n            && [attachedTrack.kind isEqualToString:track.kind];\n    if (!replacementConfirmed) {\n        reject(@\"E_OPERATION\", @\"Native sender rejected replacement track\", nil);\n        return;\n    }\n    resolve(@true);",
      ],
    ],
  },
};

function replaceExactly(source, from, to) {
  if (source.split(from).length !== 2) throw new Error(`${PLUGIN_NAME}: native source anchor changed.`);
  return source.replace(from, to);
}

function transformSource(platform, source, reverse = false) {
  const definition = definitions[platform];
  if (!definition) throw new Error(`${PLUGIN_NAME}: unsupported platform.`);
  const currentHash = digest(source);
  const desiredHash = reverse ? definition.originalSha256 : definition.patchedSha256;
  const requiredHash = reverse ? definition.patchedSha256 : definition.originalSha256;
  if (currentHash === desiredHash) return source;
  if (currentHash !== requiredHash) throw new Error(`${PLUGIN_NAME}: unreviewed ${platform} native source digest.`);
  const next = definition.changes.reduce((result, [before, after]) => (
    replaceExactly(result, reverse ? after : before, reverse ? before : after)
  ), source);
  if (digest(next) !== desiredHash) throw new Error(`${PLUGIN_NAME}: generated ${platform} source digest mismatch.`);
  return next;
}

function applyAcknowledgmentPatch(projectRoot, platform) {
  const packagePath = require.resolve("@livekit/react-native-webrtc/package.json", { paths: [projectRoot] });
  const sdk = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  if (sdk.version !== SDK_VERSION) throw new Error(`${PLUGIN_NAME}: review required for SDK version ${sdk.version}.`);
  const sourcePath = path.join(path.dirname(packagePath), definitions[platform].relativePath);
  const original = fs.readFileSync(sourcePath, "utf8");
  const patched = transformSource(platform, original);
  if (patched !== original) fs.writeFileSync(sourcePath, patched);
  return { platform, sdkVersion: sdk.version, sha256: digest(patched) };
}

function withWebRtcSenderAcknowledgment(config) {
  for (const platform of ["android", "ios"]) {
    config = withDangerousMod(config, [platform, (nextConfig) => {
      applyAcknowledgmentPatch(nextConfig.modRequest.projectRoot, platform);
      return nextConfig;
    }]);
  }
  return config;
}

module.exports = createRunOncePlugin(withWebRtcSenderAcknowledgment, PLUGIN_NAME, "1.0.0");
module.exports.__test = { definitions, SDK_VERSION, digest, transformSource, applyAcknowledgmentPatch };
