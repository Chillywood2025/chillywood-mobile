import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { SDK_VERSION, definitions, coordinatorPath, COORDINATOR_SHA256, digest,
  WEBRTC_VERSION, webRtcInputs, trackProbePath, accessorPath, TRACK_PROBE_SHA256, ACCESSOR_SHA256,
  transformSource, applyOwnedAudioPatch } = require("../plugins/withOwnedAndroidAudioSession.js").__test;
const root = process.cwd();
const options = new Set(process.argv.slice(2));
assert([...options].every(value => value === "--check-source"), "Unknown owned-audio contract option");
const checkSource = options.has("--check-source");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-owned-audio-"));
const sdkRoot = path.join(root, "node_modules/@livekit/react-native");
const webRtcRoot = path.join(root, "node_modules/@livekit/react-native-webrtc");
const fixtureRoot = path.join(root, "tools/owned-android-audio-harness");
const javac = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin/javac") : "javac";
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin/java") : "java";
const deviceKind = "android/src/main/java/com/livekit/reactnative/audio/AudioDeviceKind.java";
const execute = (command, args, cwd = temporary) => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
};
const collect = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const filename = path.join(directory, entry.name);
  return entry.isDirectory() ? collect(filename) : [filename];
});
const replace = (source, before, after) => {
  assert.equal(source.split(before).length, 2, `Mutation anchor must occur once: ${before}`);
  return source.replace(before, after);
};
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };

try {
  const project = path.join(temporary, "project");
  const generatedSdk = path.join(project, "node_modules/@livekit/react-native");
  const generatedWebRtc = path.join(project, "node_modules/@livekit/react-native-webrtc");
  fs.mkdirSync(generatedSdk, { recursive: true });
  const sdkPackage = JSON.parse(fs.readFileSync(path.join(sdkRoot, "package.json"), "utf8"));
  assert.equal(sdkPackage.version, SDK_VERSION);
  // Preserve exports: this SDK deliberately does not export package.json.
  fs.writeFileSync(path.join(generatedSdk, "package.json"), JSON.stringify(sdkPackage));
  const webRtcPackage = JSON.parse(fs.readFileSync(path.join(webRtcRoot, "package.json"), "utf8"));
  assert.equal(webRtcPackage.version, WEBRTC_VERSION);
  fs.mkdirSync(generatedWebRtc, { recursive: true });
  fs.writeFileSync(path.join(generatedWebRtc, "package.json"), JSON.stringify(webRtcPackage));
  const immutableWebRtc = {};
  for (const [relative, known] of Object.entries(webRtcInputs)) {
    copy(path.join(webRtcRoot, relative), path.join(generatedWebRtc, relative));
    immutableWebRtc[relative] = digest(fs.readFileSync(path.join(generatedWebRtc, relative)));
    assert(known.includes(immutableWebRtc[relative]), `Pinned WebRTC input: ${relative}`);
  }
  const immutablePaths = ["android/src/main/AndroidManifest.xml", "android/build.gradle", deviceKind];
  for (const relative of immutablePaths) copy(path.join(sdkRoot, relative), path.join(generatedSdk, relative));
  const immutable = Object.fromEntries(immutablePaths.map(relative => [relative, digest(fs.readFileSync(path.join(generatedSdk, relative)))]));
  const installedSources = {};
  for (const [kind, definition] of Object.entries(definitions)) {
    const original = fs.readFileSync(path.join(sdkRoot, definition.relativePath), "utf8");
    installedSources[kind] = original;
    assert([definition.originalSha256, definition.patchedSha256].includes(digest(original)), `Installed ${kind} source must be pinned`);
    const generated = transformSource(kind, original);
    assert.equal(digest(generated), definition.patchedSha256, `${kind} digest`);
    assert.equal(transformSource(kind, generated), generated, `${kind} source idempotence`);
    assert.throws(() => transformSource(kind, `${original}\n// unreviewed drift\n`), /unreviewed/u, `${kind} drift must fail closed`);
    const filename = path.join(generatedSdk, definition.relativePath);
    fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, original);
  }
  const receipt = applyOwnedAudioPatch(project);
  assert.equal(receipt.coordinatorSha256, COORDINATOR_SHA256);
  assert.equal(receipt.trackProbeSha256, TRACK_PROBE_SHA256);
  assert.equal(receipt.accessorSha256, ACCESSOR_SHA256);
  assert.equal(receipt.nativeWebRtcVersion, "144.7559.01");
  assert.deepEqual(applyOwnedAudioPatch(project), receipt, "Exact Expo patch application is idempotent");
  for (const [relative, hash] of Object.entries(immutable)) assert.equal(digest(fs.readFileSync(path.join(generatedSdk, relative))), hash, `${relative} unchanged`);
  for (const [relative, hash] of Object.entries(immutableWebRtc)) assert.equal(digest(fs.readFileSync(path.join(generatedWebRtc, relative))), hash, `WebRTC ${relative} unchanged`);
  const manager = fs.readFileSync(path.join(generatedSdk, definitions.manager.relativePath), "utf8");
  const coordinator = fs.readFileSync(path.join(generatedSdk, coordinatorPath), "utf8");
  const module = fs.readFileSync(path.join(generatedSdk, definitions.module.relativePath), "utf8");
  const setup = fs.readFileSync(path.join(generatedSdk, definitions.setup.relativePath), "utf8");
  const probe = fs.readFileSync(path.join(generatedSdk, trackProbePath), "utf8");
  const accessor = fs.readFileSync(path.join(generatedWebRtc, accessorPath), "utf8");
  assert.equal(digest(coordinator), COORDINATOR_SHA256);
  assert.equal(digest(probe), TRACK_PROBE_SHA256);
  assert.equal(digest(accessor), ACCESSOR_SHA256);
  assert.match(module, /setLegacyRouteProbe\(org\.webrtc\.audio\.ChillywoodAudioTrackRoute\(reactContext\)\)/u);
  assert.match(setup, /val routeObserver = org\.webrtc\.audio\.ChillywoodAudioTrackRoute\.Observer\(\)/u);
  assert.match(setup, /\.setAudioTrackStateCallback\(routeObserver\)/u);
  assert.match(setup, /routeObserver\.bind\(adm!!\)/u);
  const bridgeMethods = [
    ["acquireOwnedAudioSession", "owner: String, defaultOutput: String, promise: Promise", "acquire(owner, defaultOutput, promise)"],
    ["releaseOwnedAudioSession", "owner: String, promise: Promise", "release(owner, promise)"],
    ["selectOwnedAudioOutput", "owner: String, output: String, promise: Promise", "select(owner, output, promise)"],
    ["readOwnedAudioRoute", "owner: String, promise: Promise", "read(owner, promise)"],
  ];
  for (const [name, parameters, forwarding] of bridgeMethods) {
    const expected = `    @ReactMethod\n    fun ${name}(${parameters}) {\n        audioManager.ownedSession.${forwarding}\n    }`;
    assert.equal(module.split(expected).length, 2, `${name} must directly forward owner and promise`);
  }
  assert.match(module, /fun configureAudio\(config: ReadableMap\) \{\s*audioManager\.ownedSession\.runUnowned \{ configureAudioUnowned\(config\) \}/u);
  assert.match(module, /override fun invalidate\(\) \{\s*audioManager\.ownedSession\.invalidate\(\)/u);
  assert.match(module, /setRouteListener[\s\S]*?\.emit\("ChillywoodAndroidAudioRouteChanged", receipt\)/u);
  assert.doesNotMatch(manager, /removeCallbacksAndMessages|postAtFrontOfQueue/u, "Generated lifecycle cannot clear or overtake main-queue work");
  // A bad second input must not leave the first source partially rewritten.
  const moduleFile = path.join(generatedSdk, definitions.module.relativePath);
  const managerFile = path.join(generatedSdk, definitions.manager.relativePath);
  fs.writeFileSync(managerFile, installedSources.manager);
  fs.writeFileSync(moduleFile, `${module}\n// unreviewed drift\n`);
  assert.throws(() => applyOwnedAudioPatch(project), /unreviewed/u);
  assert.equal(fs.readFileSync(managerFile, "utf8"), installedSources.manager, "Invalid second input cannot partially patch the first");
  fs.writeFileSync(managerFile, manager);
  fs.writeFileSync(moduleFile, module);
  fs.writeFileSync(path.join(generatedSdk, coordinatorPath), `${coordinator}\n// unreviewed drift\n`);
  assert.throws(() => applyOwnedAudioPatch(project), /unreviewed existing coordinator/u);
  fs.writeFileSync(path.join(generatedSdk, coordinatorPath), coordinator);
  // Every wrapper source/shape input must fail before any SDK source write.
  for (const relative of Object.keys(webRtcInputs)) {
    const filename = path.join(generatedWebRtc, relative), original = fs.readFileSync(filename, "utf8");
    fs.writeFileSync(managerFile, installedSources.manager);
    fs.writeFileSync(filename, `${original}\n// unreviewed drift\n`);
    assert.throws(() => applyOwnedAudioPatch(project), /unreviewed WebRTC native input/u);
    assert.equal(fs.readFileSync(managerFile, "utf8"), installedSources.manager, "Invalid WebRTC input cannot partially write SDK");
    fs.writeFileSync(filename, original);
    fs.writeFileSync(managerFile, manager);
  }
  fs.writeFileSync(path.join(generatedWebRtc, "package.json"), JSON.stringify({ ...webRtcPackage, version: "0.0.0-unreviewed" }));
  assert.throws(() => applyOwnedAudioPatch(project), /review required for SDK version/u);
  fs.writeFileSync(path.join(generatedWebRtc, "package.json"), JSON.stringify(webRtcPackage));
  fs.writeFileSync(path.join(generatedSdk, "package.json"), JSON.stringify({ ...sdkPackage, version: "0.0.0-unreviewed" }));
  assert.throws(() => applyOwnedAudioPatch(project), /review required for SDK version/u);

  console.log(`Generated manager SHA-256: ${digest(manager)}`);
  console.log(`Generated bridge SHA-256: ${digest(module)}`);
  console.log(`Generated coordinator SHA-256: ${digest(coordinator)}`);
  console.log(`Generated ADM setup SHA-256: ${digest(setup)}`);
  console.log(`Generated actual-track probe SHA-256: ${digest(probe)}`);
  console.log(`Generated actual-factory accessor SHA-256: ${digest(accessor)}`);
  console.log("Expo generation, hash guards, idempotence, Kotlin bridge forwarding, unchanged manifest/build settings: PASS");
  if (!checkSource) {
    const version = execute(javac, ["-version"]); assert.equal(version.status, 0, version.stderr); process.stdout.write(version.stdout || version.stderr);
    const compileAndRun = (label, managerSource, coordinatorSource, caseName, probeSource = probe, mutateStub) => {
      const directory = path.join(temporary, label), source = path.join(directory, "src"), classes = path.join(directory, "classes");
      fs.mkdirSync(source, { recursive: true }); fs.mkdirSync(classes, { recursive: true });
      fs.cpSync(path.join(fixtureRoot, "stubs"), source, { recursive: true });
      const production = path.join(source, "com/livekit/reactnative/audio"); fs.mkdirSync(production, { recursive: true });
      fs.writeFileSync(path.join(production, "AudioSwitchManager.java"), managerSource);
      fs.writeFileSync(path.join(production, "ChillywoodOwnedAudioSession.java"), coordinatorSource);
      const probeFile = path.join(source, "org/webrtc/audio/ChillywoodAudioTrackRoute.java");
      const accessorFile = path.join(source, "com/oney/WebRTCModule/ChillywoodAudioModuleAccessor.java");
      fs.mkdirSync(path.dirname(probeFile), { recursive: true });
      fs.mkdirSync(path.dirname(accessorFile), { recursive: true });
      fs.writeFileSync(probeFile, probeSource);
      fs.writeFileSync(accessorFile, accessor);
      if (mutateStub) {
        const filename = path.join(source, "org/webrtc/audio/WebRtcAudioTrack.java");
        fs.writeFileSync(filename, mutateStub(fs.readFileSync(filename, "utf8")));
      }
      copy(path.join(sdkRoot, deviceKind), path.join(production, "AudioDeviceKind.java"));
      copy(path.join(fixtureRoot, "OwnedAudioContract.java"), path.join(production, "OwnedAudioContract.java"));
      const compilation = execute(javac, ["-encoding", "UTF-8", "-d", classes, ...collect(source).filter(filename => filename.endsWith(".java"))]);
      assert.equal(compilation.status, 0, `Actual generated Java compilation failed (${label}):\n${compilation.stdout}\n${compilation.stderr}`);
      return execute(java, ["-cp", classes, "com.livekit.reactnative.audio.OwnedAudioContract", ...(caseName ? [caseName] : [])]);
    };
    const baseline = compileAndRun("production", manager, coordinator);
    process.stdout.write(baseline.stdout); process.stderr.write(baseline.stderr);
    assert.equal(baseline.status, 0, "Generated production owned-audio contracts failed");
    for (const [name, mutate] of [
      ["renamed-private-track", source => source.replaceAll("audioTrack", "renamedTrack")],
      ["wrong-private-track-type", source => replace(source, "private AudioTrack audioTrack;", "private Object audioTrack;")],
    ]) {
      const result = compileAndRun(name, manager, coordinator, "api30_reflection_shape_fails_closed", probe, mutate);
      assert.equal(result.status, 0, `Reflection shape control failed (${name}):\n${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout, /PASS api30_reflection_shape_fails_closed/u);
      console.log(`Runtime reflection shape safely disabled routing: ${name}`);
    }
    const mutants = [
      { name: "stale-release-unfenced", caseName: "queued_old_release_after_successor_activation",
        source: replace(coordinator, "if (owner.equals(activeOwner)) {", "if (true) {") },
      { name: "setter-accepted-is-false-proof", caseName: "accepted_setter_requires_os_confirmation",
        source: replace(replace(coordinator, ": operation.selectionIssued && operation.output.equals(selected);", ": operation.selectionIssued;"),
          ": operation.output.equals(receiptOutput))) {", ": true)) {") },
      { name: "empty-availability-is-ready", caseName: "empty_availability_acquisition_waits",
        source: replace(replace(coordinator, "!\"none\".equals(selected) && !available().isEmpty()", "!\"none\".equals(selected)"),
          "if (receiptContainsOutput(receipt, receiptOutput) && (", "if (true && (") },
      { name: "raw-queue-unfenced", caseName: "raw_queued_commands_fenced",
        source: replace(coordinator, "if (!invalidated && desiredOwner == null && activeOwner == null && lifecycle == epoch) operation.run();", "if (!invalidated) operation.run();") },
      { name: "failed-stop-discards-manager", caseName: "stop_failure_retains_exact_cleanup_owner", source: coordinator,
        manager: replace(manager, "        if (audioSwitch != null) audioSwitch.stop();\n        audioSwitch = null;",
          "        try { if (audioSwitch != null) audioSwitch.stop(); } finally { audioSwitch = null; }") },
      { name: "route-event-owner-unfenced", caseName: "route_events_are_owner_fenced",
        source: replace(coordinator, "if (!ownedReady(owner, epoch) || routeListener == null) return;", "if (routeListener == null) return;") },
      { name: "scanner-change-not-forwarded", caseName: "scanner_only_change_refreshes_available", source: coordinator,
        manager: replace(manager, "            devicesChanged.run();", "            // Regression: scanner changes are dropped.") },
      { name: "scanner-callback-relabeled-as-successor", caseName: "scanner_only_change_refreshes_available",
        source: replace(replace(coordinator, "if (!ownedReady(owner, epoch)) return;", "if (!ownedReady(desiredOwner, lifecycle)) return;"),
          "                    emitCurrentRoute(owner, epoch);", "                    emitCurrentRoute(desiredOwner, lifecycle);") },
      { name: "failed-listener-removal-forgets-handle", caseName: "failed_listener_removal_retains_retryable_cleanup",
        source: replace(coordinator, "            remove.run();\n            removeRouteListener = null;",
          "            try { remove.run(); } finally { removeRouteListener = null; }") },
      { name: "startup-route-repair-omitted", caseName: "startup_default_repairs_opposite_os_route",
        source: replace(coordinator, "if (operation.acquiring && defaultReady && !operation.selectionIssued) {",
          "if (false && operation.acquiring && defaultReady && !operation.selectionIssued) {") },
      { name: "startup-external-candidate-ignored", caseName: "startup_never_forces_builtin_with_external_candidate",
        source: replace(coordinator, "&& !systemAvailable().contains(\"other\")", "&& true") },
      { name: "startup-temporary-default-acknowledged", caseName: "startup_waits_for_preferred_scanner_default",
        source: replace(coordinator, "return !systemAvailable().contains(preferred) || preferred.equals(scannerOutput);", "return true;") },
      { name: "automatic-route-not-cleared-for-accessory", caseName: "accessory_change_clears_only_automatic_startup_request",
        source: replace(coordinator, "if (automaticOutput != null && !\"none\".equals(manager.ownedSelectedOutputOnMainThread())",
          "if (false && automaticOutput != null && !\"none\".equals(manager.ownedSelectedOutputOnMainThread())") },
      { name: "manual-route-still-marked-automatic", caseName: "accessory_change_preserves_manual_route",
        source: replace(coordinator, "                    automaticOutput = null;\n                    if (api31() && !systemAudio.setCommunicationDevice(target)) {",
          "                    // Regression: manual route retains automatic marker.\n                    if (api31() && !systemAudio.setCommunicationDevice(target)) {") },
      { name: "api30-scanner-is-false-proof", caseName: "api30_requested_flag_and_scanner_are_not_playback_route_proof",
        source: replace(replace(coordinator, "? kind(legacyProbe.selectedDevice(operation.trackBinding)) : selected();", "? manager.ownedSelectedOutputOnMainThread() : selected();"),
          'return supported() ? kind(legacyProbe.selectedDevice(null)) : "none";', 'return supported() ? manager.ownedSelectedOutputOnMainThread() : "none";') },
      { name: "api30-actual-factory-binding-omitted", caseName: "api30_shared_actual_factory_adm_is_required", source: coordinator,
        probe: replace(probe, "&& ChillywoodAudioModuleAccessor.matches(context, expected);", "&& true;") },
      { name: "api30-post-read-identity-omitted", caseName: "api30_inner_track_replacement_during_read_fails_closed", source: coordinator,
        probe: replace(probe, "return route != null && current(token) && currentTrack() == token && isAvailable() ? route : null;", "return route;") },
      { name: "api30-replacement-satisfies-old-request", caseName: "api30_replaced_track_cannot_complete_old_selection",
        source: replace(replace(coordinator, "return supported() && operation.trackBinding != null && legacyProbe.currentTrack() == operation.trackBinding;", "return supported() && legacyProbe.currentTrack() != null;"),
          "legacyProbe.selectedDevice(operation.trackBinding)", "legacyProbe.selectedDevice(null)") },
      { name: "api30-stopped-playback-is-false-proof", caseName: "api30_stopped_or_unrouted_track_never_means_earpiece", source: coordinator,
        probe: replace(probe, "&& token.track.getPlayState() == AudioTrack.PLAYSTATE_PLAYING;", "&& true;") },
      { name: "api30-failed-observer-is-ready", caseName: "api30_failed_track_listener_registration_revokes_observer_capability", source: coordinator,
        probe: replace(probe, "if (subscription.probe == this && !subscription.ready(token)) return false;", "if (false) return false;") },
    ];
    for (const mutant of mutants) {
      const result = compileAndRun(mutant.name, mutant.manager ?? manager, mutant.source, mutant.caseName, mutant.probe ?? probe);
      assert.notEqual(result.status, 0, `Regression mutant unexpectedly passed: ${mutant.name}`);
      assert.match(result.stderr, new RegExp(`FAIL ${mutant.caseName}:`, "u"), "Mutant must fail its behavioral assertion");
      console.log(`Regression mutant rejected: ${mutant.name}`);
    }
    console.log("Production Java compiled and executed; Android/RN/AudioSwitch boundaries are controlled. Kotlin source guards are not a Kotlin or Android binary build. No device or audible media proof is claimed.");
  } else console.log("Source checks only: Java compilation, execution, and behavioral mutants NOT RUN.");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
