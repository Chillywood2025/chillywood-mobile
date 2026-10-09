import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";
import { nativeSourceSnapshot } from "../scripts/ota-native-source-compatibility.mjs";

const repo = new URL("../", import.meta.url).pathname;
const run = (root, command, args, options = {}) => {
  const value = spawnSync(command, args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...options });
  assert.equal(value.status, 0, `${command} ${args[0]}: ${value.stderr || value.stdout}`);
  return value.stdout.trim();
};
const git = (root, ...args) => run(root, "git", args);
const write = (root, name, value) => {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
};
const commit = (root) => {
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "isolated compatibility fixture");
  return { sha: git(root, "rev-parse", "HEAD"), tree: git(root, "rev-parse", "HEAD^{tree}") };
};

// Recorded v3-compatible source from PR #534 and
// docs/chat/PR532_EVIDENCE_RECONCILIATION.md. This pins Git-native inputs,
// not independently verified binary provenance or a physical qualification.
const recordedV3Source = {
  sha: "442f9c6d1d3ed23a7626474cdecd7cf606d3c1d3",
  tree: "bd6833408192d1ea547a7317f764b231dd08a422",
};
// Installed Android 95 / iOS 30 qualification source recorded by PR #538.
const recordedV4Source = {
  sha: "f44437c8acf9c9ad0f1621c985b3a70831e8459c",
  tree: "1ed514c1c377cad857eea5a33dabb89de6a78390",
};
// Signed internal binaries Android 96 / iOS 31, installed and physically tested.
const recordedV5Source = {
  sha: "2f6560724ba821c0fcc07a38b57b311b177a8e15",
  tree: "c929e6c9013ef3d1966ab6e5675997ec240654d7",
};
// Signed internal binaries Android 97 / iOS 32, installed for paired diagnostics.
const recordedV6Source = {
  sha: "936107eca963440599c4f3a2c9c247dcaca5faef",
  tree: "efca05683c171e4d7e55f77e342df9daf455c057",
};
// Signed internal binaries Android 98 / iOS 33, installed for paired diagnostics.
const recordedV7Source = {
  sha: "0d942593fe7db6187212ebdf234eca03f83c342d",
  tree: "280e5b59ebfeb21f1275ad1dc102e8b6a7cfc27a",
};

test("recorded internal v3 cohorts retain their historical Git-native inputs", () => {
  const generation = JSON.parse(fs.readFileSync(path.join(repo, "config/release/internal-native-generation.json"), "utf8"));
  const recorded = JSON.parse(git(repo, "show", `${recordedV3Source.sha}:config/release/internal-native-generation.json`));
  assert.equal(recorded.generation, "internal-native-v3");
  assert.equal(recorded.nativeCompatibility.algorithm, "git-native-inputs/v1");
  for (const platform of ["android", "ios"]) {
    const recordedDigest = recorded.nativeCompatibility[`${platform}Digest`];
    assert.equal(
      recordedDigest,
      nativeSourceSnapshot({ repositoryRoot: repo, platform, sourceSha: recordedV3Source.sha, sourceTree: recordedV3Source.tree }).digest,
    );
    // A new native generation may legitimately move forward. Reusing the old
    // runtime string must never rewrite its cohort to match a newer HEAD.
    if (generation.runtimeVersions[platform] === recorded.runtimeVersions[platform]) {
      assert.equal(generation.nativeCompatibility.algorithm, recorded.nativeCompatibility.algorithm);
      assert.equal(generation.nativeCompatibility[`${platform}Digest`], recordedDigest);
    }
  }
});

test("recorded internal v4 cohorts retain their historical Git-native inputs", () => {
  const recorded = JSON.parse(git(repo, "show", `${recordedV4Source.sha}:config/release/internal-native-generation.json`));
  assert.equal(recorded.generation, "internal-native-v4");
  for (const platform of ["android", "ios"]) {
    assert.equal(recorded.nativeCompatibility[`${platform}Digest`], nativeSourceSnapshot({
      repositoryRoot: repo, platform, sourceSha: recordedV4Source.sha, sourceTree: recordedV4Source.tree,
    }).digest);
  }
});

test("recorded internal v5 cohorts retain their historical Git-native inputs", () => {
  const recorded = JSON.parse(git(repo, "show", `${recordedV5Source.sha}:config/release/internal-native-generation.json`));
  assert.equal(recorded.generation, "internal-native-v5");
  for (const platform of ["android", "ios"]) {
    assert.equal(recorded.nativeCompatibility[`${platform}Digest`], nativeSourceSnapshot({
      repositoryRoot: repo, platform, sourceSha: recordedV5Source.sha, sourceTree: recordedV5Source.tree,
    }).digest);
  }
});

test("recorded internal v6 cohorts retain their historical Git-native inputs", () => {
  const recorded = JSON.parse(git(repo, "show", `${recordedV6Source.sha}:config/release/internal-native-generation.json`));
  assert.equal(recorded.generation, "internal-native-v6");
  for (const platform of ["android", "ios"]) {
    assert.equal(recorded.nativeCompatibility[`${platform}Digest`], nativeSourceSnapshot({
      repositoryRoot: repo, platform, sourceSha: recordedV6Source.sha, sourceTree: recordedV6Source.tree,
    }).digest);
  }
});

test("recorded internal v7 cohorts retain their historical Git-native inputs", () => {
  const recorded = JSON.parse(git(repo, "show", `${recordedV7Source.sha}:config/release/internal-native-generation.json`));
  assert.equal(recorded.generation, "internal-native-v7");
  for (const platform of ["android", "ios"]) {
    assert.equal(recorded.nativeCompatibility[`${platform}Digest`], nativeSourceSnapshot({
      repositoryRoot: repo, platform, sourceSha: recordedV7Source.sha, sourceTree: recordedV7Source.tree,
    }).digest);
  }
});

test("internal v8 supersedes the incompatible v7 runtimes without rewriting their historical digests", () => {
  const generation = JSON.parse(fs.readFileSync(path.join(repo, "config/release/internal-native-generation.json"), "utf8"));
  const recorded = JSON.parse(git(repo, "show", `${recordedV7Source.sha}:config/release/internal-native-generation.json`));
  assert.equal(generation.generation, "internal-native-v8");
  assert.equal(generation.supersedes.generation, recorded.generation);
  assert.equal(generation.nativeCompatibility.algorithm, recorded.nativeCompatibility.algorithm);
  for (const platform of ["android", "ios"]) {
    assert.equal(generation.runtimeVersions[platform], `1.0.0-${platform}-production-v8`);
    assert.equal(generation.supersedes[`${platform}RuntimeVersion`], recorded.runtimeVersions[platform]);
    assert.equal(generation.supersedes[`${platform}CompatibilityDigest`], recorded.nativeCompatibility[`${platform}Digest`]);
    assert.match(generation.nativeCompatibility[`${platform}Digest`], /^[0-9a-f]{64}$/u);
    assert.notEqual(generation.nativeCompatibility[`${platform}Digest`], recorded.nativeCompatibility[`${platform}Digest`]);
    assert.equal(generation.channels[platform], recorded.channels[platform]);
  }
});

test("effective EAS inheritance enables diagnostics only for the exact reviewed iOS tester build", () => {
  const eas = JSON.parse(fs.readFileSync(path.join(repo, "eas.json"), "utf8"));
  const generation = JSON.parse(fs.readFileSync(path.join(repo, "config/release/internal-native-generation.json"), "utf8"));
  const { resolveDiagnosticsGate } = createRequire(import.meta.url)("../plugins/withChillyChatIosNativeCalls.js").__test;
  const resolveEnv = (name, platform, parents = new Set()) => {
    assert.ok(eas.build[name] && !parents.has(name), "profile inheritance must resolve without a cycle");
    const profile = eas.build[name];
    return { ...(profile.extends ? resolveEnv(profile.extends, platform, new Set([...parents, name])) : {}),
      ...profile.env, ...profile[platform]?.env, EAS_BUILD_PROFILE: name };
  };
  const config = { extra: { runtime: { otaGeneration: {
    internalOnly: generation.policy.internalOnly, channel: generation.channels.ios,
  } } } };
  for (const name of Object.keys(eas.build)) for (const platform of ["ios", "android"]) {
    assert.equal(resolveDiagnosticsGate(config, resolveEnv(name, platform)), name === "ios-internal-v2", name);
  }
  assert.equal(eas.build["ios-internal-device-v3"].env.CHILLYWOOD_INTERNAL_CALL_DIAGNOSTICS, "false");
  delete eas.build["ios-internal-device-v3"].env.CHILLYWOOD_INTERNAL_CALL_DIAGNOSTICS;
  assert.throws(() => resolveDiagnosticsGate(config, resolveEnv("ios-internal-device-v3", "ios")),
    /explicit ios-internal-v2/, "a new child profile may not inherit an unreviewed diagnostic build");
  eas.build.production.env = { CHILLYWOOD_INTERNAL_CALL_DIAGNOSTICS: "true" };
  assert.throws(() => resolveDiagnosticsGate(config, resolveEnv("production", "ios")), /explicit ios-internal-v2/);
});

test("internal tester store profiles bind current runtimes only to their private audiences", () => {
  const eas = JSON.parse(fs.readFileSync(path.join(repo, "eas.json"), "utf8"));
  const generation = JSON.parse(fs.readFileSync(path.join(repo, "config/release/internal-native-generation.json"), "utf8"));
  assert.equal(generation.policy?.internalOnly, true);
  assert.equal(generation.policy?.publicReleaseAuthorized, false);
  assert.equal(generation.policy?.storeSubmissionOutsideInternalTestersAuthorized, false);
  assert.equal(eas.build?.["android-internal-v2"]?.env?.CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM, "android");
  assert.equal(eas.submit?.["android-internal-v2"]?.android?.track, generation.policy?.internalTesterDistribution?.android?.track);
  assert.equal(eas.build?.["ios-internal-v2"]?.env?.CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM, "ios");
  assert.deepEqual(eas.submit?.["ios-internal-v2"]?.ios?.groups, [generation.policy?.internalTesterDistribution?.ios?.group]);
  assert.notEqual(eas.build?.["android-internal-v2"]?.channel, eas.build?.production?.channel);
  assert.notEqual(eas.build?.["ios-internal-v2"]?.channel, eas.build?.production?.channel);
});

function fixture(t, sourceSha = "HEAD") {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "chilly-native-publication-"));
  const root = path.join(temp, "repo");
  fs.mkdirSync(root);
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  git(root, "init", "--quiet", "--initial-branch=main");
  git(root, "config", "user.name", "Local test");
  git(root, "config", "user.email", "test@example.invalid");
  git(root, "remote", "add", "origin", root); // ls-remote stays entirely local.
  const paths = git(repo, "ls-tree", "-r", "--name-only", sourceSha).split("\n").filter((name) =>
    /^(?:plugins|modules|assets|vendor|config\/ios|config\/release)\//u.test(name)
    || ["package.json", "package-lock.json", "app.json", "app.config.ts", "eas.json", ".easignore", "google-services.json"].includes(name));
  for (const name of paths) {
    const value = spawnSync("git", ["show", `${sourceSha}:${name}`], { cwd: repo, maxBuffer: 32 * 1024 * 1024 });
    assert.equal(value.status, 0);
    write(root, name, value.stdout);
  }
  for (const name of ["publish-internal-v2-ota.mjs", "verify-internal-v2-ota-config.mjs", "release-control-plane-lib.mjs", "ota-native-source-compatibility.mjs", "android-native-compatibility.mjs"]) {
    write(root, `scripts/${name}`, fs.readFileSync(path.join(repo, "scripts", name)));
  }
  const initial = commit(root);
  const generationPath = path.join(root, "config/release/internal-native-generation.json");
  const generation = JSON.parse(fs.readFileSync(generationPath, "utf8"));
  for (const platform of ["android", "ios"]) {
    generation.nativeCompatibility[`${platform}Digest`] = nativeSourceSnapshot({
      repositoryRoot: root,
      platform,
      sourceSha: initial.sha,
    }).digest;
  }
  fs.writeFileSync(generationPath, `${JSON.stringify(generation, null, 2)}\n`);
  const baseline = commit(root);
  const providerLog = path.join(temp, "provider.log");
  const npx = path.join(temp, "bin/npx");
  write(temp, "bin/npx", `#!/usr/bin/env node
const fs = require('node:fs');
const {spawnSync} = require('node:child_process');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.PROVIDER_LOG, JSON.stringify(args)+'\\n');
const platform = process.env.CHILLYWOOD_INTERNAL_V2_OTA_PLATFORM;
const generation = JSON.parse(fs.readFileSync('config/release/internal-native-generation.json','utf8'));
const runtimeVersion = generation.runtimeVersions[platform];
if (args[0] === 'expo' && args[1] === 'config') {
  console.log(JSON.stringify({updates:{checkAutomatically:'NEVER'},[platform]:{runtimeVersion},extra:{runtime:{internalV2OtaPlatform:platform,communication:{iosNativeCallsEnabled:platform==='ios'}}}}));
} else if (args[0] === 'eas-cli' && args[1] === 'env:exec') {
  const command = args.at(-1).split(' '); const start = command.indexOf('node');
  const result = spawnSync(process.execPath, command.slice(start+1), {stdio:'inherit',env:process.env});
  process.exitCode = result.status ?? 1;
  if (result.status === 0 && process.env.PREFLIGHT_MUTATION) {
    const mode = process.env.PREFLIGHT_MUTATION;
    if (mode === 'dirty') fs.appendFileSync('app.config.ts', '\\n// concurrent edit\\n');
    else if (mode === 'receipt') {
      const receiptPath = command[command.indexOf('--binary-receipt')+1];
      const receipt = JSON.parse(fs.readFileSync(receiptPath,'utf8'));
      receipt.revoked = true; fs.writeFileSync(receiptPath, JSON.stringify(receipt));
    } else {
      const commit = spawnSync('git', ['commit-tree', 'HEAD^{tree}', '-p', 'HEAD'], {encoding:'utf8',input:'concurrent source change\\n'});
      if (commit.status !== 0) throw new Error(commit.stderr);
      const changed = spawnSync('git', ['update-ref', mode === 'main' ? 'refs/heads/main' : 'HEAD', commit.stdout.trim()], {encoding:'utf8'});
      if (changed.status !== 0) throw new Error(changed.stderr);
    }
  }
} else if (args[0] === 'eas-cli' && args[1] === 'update') {
  const value = name => args[args.indexOf(name)+1];
  console.log(JSON.stringify([{id:'fixture-update',group:'fixture-group',platform,runtimeVersion,branchName:value('--branch'),message:value('--message')}]));
} else { process.exitCode=90; }
`);
  fs.chmodSync(npx, 0o755);
  const publish = (platform, binary = baseline, extra = {}, preflightMutation = "") => {
    fs.writeFileSync(providerLog, "");
    const receipt = path.join(temp, "receipt.json");
    const generation = JSON.parse(fs.readFileSync(path.join(root, "config/release/internal-native-generation.json"), "utf8"));
    fs.writeFileSync(receipt, JSON.stringify({ platform, runtimeVersion: generation.runtimeVersions[platform], artifactSha256: "c".repeat(64), sourceSha: binary.sha, sourceTree: binary.tree, nativeCapabilities: platform === "ios" ? ["ios-native-calls"] : [], revoked: false, valid: true, ...extra }));
    const result = spawnSync(process.execPath, ["scripts/publish-internal-v2-ota.mjs", "--platform", platform, "--message", "isolated-test", "--binary-receipt", receipt], {
      cwd: root, encoding: "utf8", env: { ...process.env, PATH: `${path.dirname(npx)}:${process.env.PATH}`, PROVIDER_LOG: providerLog, PREFLIGHT_MUTATION: preflightMutation },
    });
    return { ...result, calls: fs.readFileSync(providerLog, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) };
  };
  return { root, baseline, publish };
}

for (const platform of ["android", "ios"]) {
  test(`${platform}: foreground presentation contract rejects the delivered v5 binary and runtime cohort`, (t) => {
    const { root, publish } = fixture(t, recordedV5Source.sha);
    const changedPaths = ["modules/chillywood-native-calls/index.d.ts",
      ...(platform === "ios" ? ["modules/chillywood-native-calls/ios/ChillywoodNativeCallCoordinator.swift"] : [])];
    for (const name of changedPaths) write(root, name, fs.readFileSync(path.join(repo, name)));
    const changedSource = commit(root);
    const oldBinary = publish(platform);
    assert.notEqual(oldBinary.status, 0);
    assert.match(oldBinary.stderr, /OTA_BINARY_NATIVE_SOURCE_INCOMPATIBLE/u);
    assert.deepEqual(oldBinary.calls, [], "v5 signed artifacts must stop before Expo or provider calls");
    const rebuiltInOldRuntime = publish(platform, changedSource);
    assert.notEqual(rebuiltInOldRuntime.status, 0);
    assert.match(rebuiltInOldRuntime.stderr, /OTA_RUNTIME_NATIVE_COHORT_INCOMPATIBLE/u);
    assert.deepEqual(rebuiltInOldRuntime.calls, [], "new native presentation cannot repurpose the delivered v5 cohort");
  });

  test(`${platform}: diagnostic candidate native inputs reject the recorded v4 binary and runtime cohort`, (t) => {
    const { root, publish } = fixture(t, recordedV4Source.sha);
    const changedPaths = platform === "ios" ? [
      "plugins/withChillyChatIosNativeCalls.js",
      "modules/chillywood-native-calls/ios/ChillywoodNativeCallDiagnostics.swift",
      "modules/chillywood-native-calls/ios/ChillywoodNativeCallCoordinator.swift",
    ] : ["eas.json"];
    for (const name of changedPaths) write(root, name, fs.readFileSync(path.join(repo, name)));
    const changedSource = commit(root);
    const oldBinary = publish(platform);
    assert.notEqual(oldBinary.status, 0);
    assert.match(oldBinary.stderr, /OTA_BINARY_NATIVE_SOURCE_INCOMPATIBLE/u);
    assert.deepEqual(oldBinary.calls, [], "v4 signed artifacts must stop before Expo or provider calls");
    const rebuiltInOldRuntime = publish(platform, changedSource);
    assert.notEqual(rebuiltInOldRuntime.status, 0);
    assert.match(rebuiltInOldRuntime.stderr, /OTA_RUNTIME_NATIVE_COHORT_INCOMPATIBLE/u);
    assert.deepEqual(rebuiltInOldRuntime.calls, [], "new diagnostics cannot repurpose the immutable v4 cohort");
  });

  test(`${platform}: current sender patch rejects the recorded v3 binary and runtime cohort`, (t) => {
    const { root, publish } = fixture(t, recordedV3Source.sha);
    for (const name of ["app.config.ts", "plugins/withWebRtcSenderAcknowledgment.js"]) {
      const value = spawnSync("git", ["show", `HEAD:${name}`], { cwd: repo, maxBuffer: 32 * 1024 * 1024 });
      assert.equal(value.status, 0);
      write(root, name, value.stdout);
    }
    const changedSource = commit(root);
    const oldBinary = publish(platform);
    assert.notEqual(oldBinary.status, 0);
    assert.match(oldBinary.stderr, /OTA_BINARY_NATIVE_SOURCE_INCOMPATIBLE/u);
    assert.deepEqual(oldBinary.calls, [], "native mismatch stops before Expo or provider calls");

    const rebuiltInOldRuntime = publish(platform, changedSource);
    assert.notEqual(rebuiltInOldRuntime.status, 0);
    assert.match(rebuiltInOldRuntime.stderr, /OTA_RUNTIME_NATIVE_COHORT_INCOMPATIBLE/u);
    assert.doesNotMatch(rebuiltInOldRuntime.stderr, /OTA_BINARY_NATIVE_SOURCE_INCOMPATIBLE/u);
    assert.deepEqual(rebuiltInOldRuntime.calls, [], "a matching new binary cannot repurpose the old runtime");
  });

  test(`${platform}: real canonical publisher permits JS-only source and ignores receipt-history-only changes`, (t) => {
    const { root, publish } = fixture(t);
    write(root, "hooks/ordinary-ui-change.ts", "export const value = 2;\n");
    commit(root);
    const result = publish(platform);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.calls.filter((args) => args[1] === "update").length, 1);
  });

  test(`${platform}: native source changes reject the old binary before Expo or provider calls`, (t) => {
    const { root, publish } = fixture(t);
    const nativePath = platform === "ios" ? "modules/chillywood-native-calls/ios/ChillywoodNativeCallCoordinator.swift" : "plugins/withChillyChatNativeCallNotifications.js";
    const before = fs.readFileSync(path.join(root, nativePath), "utf8");
    // A controlled mutation makes this a permanent release regression. It must
    // also run from a clean checkout after the correction itself is committed.
    write(root, nativePath, `${before}\n// isolated native source change\n`);
    commit(root);
    const result = publish(platform);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /OTA_BINARY_NATIVE_SOURCE_INCOMPATIBLE/u);
    assert.deepEqual(result.calls, []);
  });

  test(`${platform}: matching newly built receipt cannot repurpose the existing runtime cohort`, (t) => {
    const { root, publish } = fixture(t);
    const nativePath = platform === "ios" ? "modules/chillywood-native-calls/ios/ChillywoodNativeCallCoordinator.swift" : "plugins/withChillyChatNativeCallNotifications.js";
    fs.appendFileSync(path.join(root, nativePath), "\n// changed native source fixture\n");
    const newBinary = commit(root);
    const result = publish(platform, newBinary);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /OTA_RUNTIME_NATIVE_COHORT_INCOMPATIBLE/u);
    assert.doesNotMatch(result.stderr, /OTA_BINARY_NATIVE_SOURCE_INCOMPATIBLE/u);
    assert.deepEqual(result.calls, []);
  });
}

test("publisher rejects absent Git source and incorrect receipt source tree before external tools", (t) => {
  const { baseline, publish } = fixture(t);
  for (const extra of [{ sourceSha: "f".repeat(40) }, { sourceTree: "e".repeat(40) }]) {
    const result = publish("ios", baseline, extra);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /OTA_NATIVE_SOURCE_(?:GIT_OBJECT_UNAVAILABLE|TREE_MISMATCH)/u);
    assert.deepEqual(result.calls, []);
  }
});

test("native dependency lock changes cannot be certified from current installed packages", (t) => {
  const { root, baseline, publish } = fixture(t);
  const lockPath = path.join(root, "package-lock.json");
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  lock.packages["node_modules/react-native"].version = "0.81.999";
  fs.writeFileSync(lockPath, JSON.stringify(lock));
  commit(root);
  const result = publish("ios", baseline, { nativeCompatibilityDigest: "pretend-compatible" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OTA_BINARY_NATIVE_SOURCE_INCOMPATIBLE/u);
  assert.deepEqual(result.calls, []);
});

test("source digest rejects missing native files and verifies the target tree", (t) => {
  const { root, baseline } = fixture(t);
  const args = { repositoryRoot: root, platform: "ios", sourceSha: baseline.sha };
  assert.throws(() => nativeSourceSnapshot({ ...args, sourceTree: "0".repeat(40) }), /OTA_NATIVE_SOURCE_TREE_MISMATCH/u);
  fs.unlinkSync(path.join(root, "modules/chillywood-native-calls/ios/ChillywoodNativeCallCoordinator.swift"));
  const missing = commit(root);
  assert.throws(() => nativeSourceSnapshot({ ...args, sourceSha: missing.sha }), /OTA_NATIVE_SOURCE_INPUT_MISSING/u);
});

for (const [mode, finding] of [
  ["dirty", "OTA_SOURCE_CHANGED_DURING_PREFLIGHT"],
  ["head", "OTA_SOURCE_CHANGED_DURING_PREFLIGHT"],
  ["main", "OTA_PROTECTED_MAIN_CHANGED_DURING_PREFLIGHT"],
  ["receipt", "OTA_BINARY_RECEIPT_CHANGED_DURING_PREFLIGHT"],
]) test(`publisher stops before mutation when ${mode} changes during remote preflight`, (t) => {
  const { root, baseline, publish } = fixture(t);
  // Vary checkout and remote identity independently instead of changing both
  // through the same checked-out main branch.
  if (mode === "main" || mode === "head") git(root, "checkout", "--quiet", "--detach", "HEAD");
  const result = publish("ios", baseline, {}, mode);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, new RegExp(finding, "u"));
  assert.equal(result.calls.filter((args) => args[1] === "env:exec").length, 1);
  assert.equal(result.calls.filter((args) => args[1] === "update").length, 0);
});
