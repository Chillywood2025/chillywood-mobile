import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const upstreamHashes = {
  "MediaStream.java": "8da47c10fc06364a55f4f58a4ffc115f0e1d3261873c89900f34fba5e4adc5c3",
  "MediaStreamTrack.java": "6e576c9f19dc022a831fc49f02f7e35cf903f0fbc466f2aebc05c5c4aa3c598f",
};
const nativeEdges = {
  "MediaStream.java": {
    nativeAddAudioTrackToNativeStream: "return true;",
    nativeAddVideoTrackToNativeStream: "return true;",
    nativeRemoveAudioTrack: "return true;",
    nativeRemoveVideoTrack: "return true;",
    nativeGetId: "return Long.toString(stream);",
  },
  "MediaStreamTrack.java": {
    nativeGetId: "return Long.toString(track);",
    nativeGetKind: "return NativeEdges.kind(track);",
    nativeGetEnabled: "return NativeEdges.enabled(track);",
    nativeSetEnabled: "return NativeEdges.enable(track, enabled);",
    nativeGetState: "return State.LIVE;",
  },
};
const edgesSource = `package org.webrtc;
import java.util.HashMap;
import java.util.Map;
public class NativeEdges {
  static long next = 1;
  static final Map<Long, String> kinds = new HashMap<>();
  static final Map<Long, Boolean> enabled = new HashMap<>();
  static final Map<Long, Integer> releases = new HashMap<>();
  public static long allocate(String kind) { long handle = next++; kinds.put(handle, kind); enabled.put(handle, true); return handle; }
  public static String kind(long handle) { return kinds.get(handle); }
  public static boolean enabled(long handle) { return enabled.get(handle); }
  public static boolean enable(long handle, boolean value) { enabled.put(handle, value); return true; }
  public static int releases(long handle) { return releases.getOrDefault(handle, 0); }
  static void release(long handle) { releases.merge(handle, 1, Integer::sum); }
}`;

export function runAndroidReleaseContract({ root, out, execute, checkSource, original, patched }) {
  const fixtureRoot = path.join(root, "tools/webrtc-native-sender-harness");
  const sources = new Map();
  for (const [name, expectedHash] of Object.entries(upstreamHashes)) {
    const source = fs.readFileSync(path.join(fixtureRoot, "upstream", name), "utf8");
    assert.equal(crypto.createHash("sha256").update(source).digest("hex"), expectedHash,
      `Unreviewed upstream Java disposal wrapper: ${name}`);
    let rewritten = source;
    for (const [method, body] of Object.entries(nativeEdges[name])) {
      const declaration = new RegExp(`private static native ([A-Za-z]+) ${method}\\(([\\s\\S]*?)\\);`, "gu");
      assert.equal([...rewritten.matchAll(declaration)].length, 1, `JNI declaration ${method} occurs exactly once`);
      rewritten = rewritten.replace(declaration, `private static $1 ${method}($2) { ${body} }`);
    }
    assert(!rewritten.includes("private static native"), "Every JNI edge must be explicitly controlled");
    sources.set(path.join("org/webrtc", name), rewritten);
  }
  sources.set("org/webrtc/NativeEdges.java", edgesSource);
  sources.set("org/webrtc/NativeSupport.java", `package org.webrtc;
@interface CalledByNative { String value() default ""; }
class JniCommon { static void nativeReleaseRef(long handle) { NativeEdges.release(handle); } }
class Logging { static void e(String tag, String message) {} }
`);
  sources.set("androidx/annotation/Nullable.java", "package androidx.annotation; public @interface Nullable {}\n");
  for (const kind of ["Audio", "Video"]) {
    sources.set(`org/webrtc/${kind}Track.java`, `package org.webrtc;
public class ${kind}Track extends MediaStreamTrack {
  public ${kind}Track(long track) { super(track); }
  long getNative${kind}Track() { return getNativeMediaStreamTrack(); }
}\n`);
  }
  const template = fs.readFileSync(path.join(fixtureRoot, "ReleaseContract.java"), "utf8");
  assert.equal(template.split("// __ACTUAL_SDK_RELEASE_METHODS__").length, 2);
  const methods = source => {
    const start = "    @ReactMethod\n    public void mediaStreamRemoveTrack(";
    const end = "    @ReactMethod\n    public void mediaStreamTrackSetEnabled(";
    assert.equal(source.split(start).length, 2);
    assert.equal(source.split(end).length, 2);
    return source.slice(source.indexOf(start), source.indexOf(end));
  };
  const videoCondition = "track instanceof VideoTrack && stream.videoTracks.contains(track)";
  const audioCondition = "track instanceof AudioTrack && stream.audioTracks.contains(track)";
  assert.equal(patched.split(videoCondition).length, 2);
  assert.equal(patched.split(audioCondition).length, 2);
  for (const [label, source] of [
    ["original", original], ["patched", patched],
    ["mutant-video-not-detached", patched.replace(videoCondition, "false")],
    ["mutant-audio-not-detached", patched.replace(audioCondition, "false")],
  ]) {
    const directory = path.join(out, "android-release", label);
    fs.mkdirSync(directory, { recursive: true });
    const files = [];
    for (const [filename, contents] of sources) {
      const destination = path.join(directory, filename);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, contents);
      files.push(destination);
    }
    const moduleFile = path.join(directory, "ReleaseContract.java");
    fs.writeFileSync(moduleFile, template.replace("// __ACTUAL_SDK_RELEASE_METHODS__", methods(source)));
    files.push(moduleFile);
    if (checkSource) continue;
    const javac = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin/javac") : "javac";
    const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin/java") : "java";
    execute(javac, ["-encoding", "UTF-8", "-d", directory, ...files]);
    const result = execute(java, ["-cp", directory, "ReleaseContract"], false);
    if (label === "patched") {
      assert.equal(result.status, 0, `Repaired Android disposal failed:\n${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout, /0 failures/u);
    } else {
      assert.notEqual(result.status, 0, `${label} must reproduce the disposed-track failure`);
      assert.match(result.stderr, /RELEASE_CONTRACT_FAIL:.*MediaStreamTrack has been disposed/u);
    }
    process.stdout.write(`android release ${label}: ${result.stdout.trim()}\n`);
  }
  console.log(checkSource
    ? "Android release bridge and hash-pinned upstream Java wrappers generated; compilation NOT RUN."
    : "Actual Android bridge release methods and upstream Java disposal wrappers executed; JNI edges controlled, device/process/media proof still required.");
}
