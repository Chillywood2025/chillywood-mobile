const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createRunOncePlugin, withDangerousMod } = require("@expo/config-plugins");

const PLUGIN_NAME = "with-webrtc-camera-effect-ownership";
const SDK_VERSION = "144.0.0";
const RELATIVE_PATH = "android/src/main/java/com/oney/WebRTCModule/videoEffects/VideoEffectProcessor.java";
const ORIGINAL_SHA256 = "81a669119616921df32c16f5b03950a89305250c904b448a31e7084bb40a1d51";
const PATCHED_SHA256 = "c0bd177ea32f11b422a10fa929ebf209f89b2b201797402f21b8f42a3d742897";
const digest = (source) => crypto.createHash("sha256").update(source).digest("hex");
const before = "    public void onFrameCaptured(VideoFrame frame) {\n        frame.retain();";
const after = `    public void onFrameCaptured(VideoFrame frame) {
        // A delayed bridge attach may resolve no providers after effect cleanup.
        // The input is borrowed from the capturer, including for an empty chain.
        if (videoFrameProcessors.isEmpty()) {
            if (mSink != null) {
                mSink.onFrame(frame);
            }
            return;
        }
        frame.retain();`;

// Expo synchronous module calls and RN asynchronous track calls use different
// bridge queues. Provider removal can legally precede an older delayed attach,
// so passing null on Off alone cannot prevent the upstream empty-chain bug.
// Repair the actual pinned wrapper instead of retaining unbounded tombstones or
// assuming cross-bridge FIFO. Nonempty processing is byte-for-byte unchanged.
function transformSource(source, reverse = false) {
  const required = reverse ? PATCHED_SHA256 : ORIGINAL_SHA256;
  const desired = reverse ? ORIGINAL_SHA256 : PATCHED_SHA256;
  const current = digest(source);
  if (current === desired) return source;
  if (current !== required) throw new Error(`${PLUGIN_NAME}: unreviewed native source digest.`);
  const from = reverse ? after : before;
  const to = reverse ? before : after;
  if (source.split(from).length !== 2) throw new Error(`${PLUGIN_NAME}: native source anchor changed.`);
  const result = source.replace(from, to);
  if (digest(result) !== desired) throw new Error(`${PLUGIN_NAME}: generated source digest mismatch.`);
  return result;
}

function applyOwnershipPatch(projectRoot) {
  const packagePath = require.resolve("@livekit/react-native-webrtc/package.json", { paths: [projectRoot] });
  const sdk = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  if (sdk.version !== SDK_VERSION) throw new Error(`${PLUGIN_NAME}: review required for SDK version ${sdk.version}.`);
  const sourcePath = path.join(path.dirname(packagePath), RELATIVE_PATH);
  const original = fs.readFileSync(sourcePath, "utf8");
  const patched = transformSource(original);
  if (patched !== original) fs.writeFileSync(sourcePath, patched);
  return { sdkVersion: sdk.version, sha256: digest(patched) };
}

function withWebRtcCameraEffectOwnership(config) {
  return withDangerousMod(config, ["android", (nextConfig) => {
    applyOwnershipPatch(nextConfig.modRequest.projectRoot);
    return nextConfig;
  }]);
}

module.exports = createRunOncePlugin(withWebRtcCameraEffectOwnership, PLUGIN_NAME, "1.0.0");
module.exports.__test = { SDK_VERSION, RELATIVE_PATH, ORIGINAL_SHA256, PATCHED_SHA256, digest, transformSource, applyOwnershipPatch };
