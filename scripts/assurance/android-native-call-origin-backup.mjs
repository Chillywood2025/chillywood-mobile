#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawn, spawnSync} from "node:child_process";

const root = process.cwd();
const productPackageName = "com.chillywood.mobile";
const packageName = `${productPackageName}.d2btest`;
const testPackageName = `${packageName}.test`;
const adversaryPackageName = "com.chillywood.assurance.adversary";
const priorDigest = "4262e9434c0acbd5fc104d115b7dc7e0ea95aee40ad276e84f361caaf5410d2b";
const contract = JSON.parse(fs.readFileSync(path.join(root, "config/assurance/android-native-call-origin-backup-v1.json"), "utf8"));
const targetId = contract.target.id;
const correctedDigest = contract.target.correctedGeneratedDigest;
const lockParent = path.join(os.homedir(), ".codex", "first-pass-assurance-locks");
const lockPath = path.join(lockParent, "test-lock-native-android");
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const stable = (value) => JSON.stringify(value, (_, current) => current && typeof current === "object" && !Array.isArray(current)
  ? Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b))) : current);

class GateError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const gate = (condition, code, message, details) => {
  if (!condition) throw new GateError(code, message, details);
};
const run = (command, args, options = {}) => spawnSync(command, args, {
  cwd: options.cwd ?? root,
  encoding: "utf8",
  env: options.env ?? process.env,
  maxBuffer: 64 * 1024 * 1024,
  stdio: options.stdio,
  timeout: options.timeout ?? 15 * 60 * 1000,
});
const sleep = (milliseconds) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
const normalizeXml = (value) => String(value).replace(/<!--[\s\S]*?-->/gu, "");
const exactExclusion = (xml, sectionName) => {
  const section = sectionName
    ? normalizeXml(xml).match(new RegExp(`<${sectionName}\\b[^>]*>([\\s\\S]*?)<\\/${sectionName}>`, "u"))?.[1] ?? ""
    : normalizeXml(xml);
  return (section.match(/<exclude\b(?=[^>]*\bdomain="sharedpref")(?=[^>]*\bpath="chilly_chat_native_call_action_v1\.xml")[^>]*\/?\s*>/gu) ?? []).length === 1;
};
const sanitizeDiagnostic = (value, privatePaths) => {
  let output = String(value ?? "");
  for (const [privatePath, marker] of privatePaths) {
    if (privatePath) output = output.replaceAll(privatePath, marker);
  }
  const lines = output.split("\n").map((line) => line.trim()).filter(Boolean);
  const compiler = lines.filter((line) => /(^e:|error:)/iu.test(line));
  const summary = lines.filter((line) => /(FAILURE:|What went wrong|Execution failed|Compilation error|FAILED)/iu.test(line));
  const failureIndex = lines.findIndex((line) => /What went wrong/iu.test(line));
  const failureWindow = failureIndex >= 0 ? lines.slice(failureIndex, failureIndex + 36) : [];
  const relevant = [...compiler.slice(0, 20), ...failureWindow, ...summary.slice(-8)];
  return (relevant.length ? [...new Set(relevant)] : lines.slice(-36)).slice(0, 48).join(" | ").slice(0, 5000);
};

const walkFiles = (directory) => {
  if (!fs.existsSync(directory)) return [];
  const output = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) output.push(absolute);
    }
  };
  visit(directory);
  return output.sort();
};

const acquireLock = () => {
  fs.mkdirSync(lockParent, {mode: 0o700, recursive: true});
  try {
    fs.mkdirSync(lockPath, {mode: 0o700});
  } catch {
    throw new GateError("ANDROID_NATIVE_RESOURCE_LOCKED", "The Android native assurance resource is already locked");
  }
  return () => fs.rmdirSync(lockPath);
};

const findAndroidSdk = () => {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), "Library", "Android", "sdk"),
    path.join(os.homedir(), "Android", "Sdk"),
  ].filter(Boolean);
  const sdk = candidates.find((candidate) => (
    fs.existsSync(path.join(candidate, "platforms"))
    && fs.existsSync(path.join(candidate, "platform-tools", "adb"))
  ));
  gate(sdk, "ANDROID_SDK_MISSING", "A local Android SDK with platform tools is required");
  return sdk;
};

const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const git = (...args) => {
  const result = run("git", args);
  gate(result.status === 0, "GIT_READ_FAILED", `git ${args[0]} failed`);
  return result.stdout.trim();
};
const merge = (base, next) => {
  if (!base || typeof base !== "object" || Array.isArray(base)) return structuredClone(next);
  const output = structuredClone(base);
  for (const [key, value] of Object.entries(next ?? {})) {
    output[key] = value && typeof value === "object" && !Array.isArray(value)
      ? merge(output[key] ?? {}, value)
      : structuredClone(value);
  }
  return output;
};
const resolveProfile = (eas, name, seen = []) => {
  gate(!seen.includes(name), "PROFILE_EXTENDS_CYCLE", `EAS profile cycle at ${name}`);
  const value = eas.build?.[name];
  gate(value, "BUILD_PROFILE_UNKNOWN", `Unknown EAS profile ${name}`);
  return value.extends ? merge(resolveProfile(eas, value.extends, [...seen, name]), value) : structuredClone(value);
};
const resolveDependencies = () => {
  const packageHash = digest(fs.readFileSync(path.join(root, "package.json")));
  const lockHash = digest(fs.readFileSync(path.join(root, "package-lock.json")));
  const packageJson = readJson("package.json");
  const lock = readJson("package-lock.json");
  const direct = Object.keys({...packageJson.dependencies, ...packageJson.devDependencies}).sort();
  const worktrees = git("worktree", "list", "--porcelain").split("\n")
    .filter((line) => line.startsWith("worktree ")).map((line) => line.slice(9));
  for (const worktree of worktrees) {
    const modules = path.join(worktree, "node_modules");
    if (!fs.existsSync(modules)) continue;
    const packagePath = path.join(worktree, "package.json");
    const lockPath = path.join(worktree, "package-lock.json");
    if (!fs.existsSync(packagePath) || !fs.existsSync(lockPath)) continue;
    if (digest(fs.readFileSync(packagePath)) !== packageHash || digest(fs.readFileSync(lockPath)) !== lockHash) continue;
    const mismatches = direct.filter((name) => {
      const installed = path.join(modules, name, "package.json");
      const expected = lock.packages?.[`node_modules/${name}`]?.version;
      return !expected || !fs.existsSync(installed) || JSON.parse(fs.readFileSync(installed, "utf8")).version !== expected;
    });
    if (!mismatches.length) {
      const npmTree = run("npm", ["ls", "--all", "--json", "--offline"], {
        cwd: worktree,
        env: {...process.env, npm_config_offline: "true"},
      });
      let parsed;
      try { parsed = JSON.parse(npmTree.stdout); } catch { parsed = null; }
      if (npmTree.status !== 0 || !parsed || (parsed.problems?.length ?? 0) !== 0) continue;
      return {modules, packageHash, lockHash, directPackages: direct.length, fullTreeValidated: true};
    }
  }
  throw new GateError("DEPENDENCY_SET_MISMATCH", "No installed worktree matches the exact package and direct dependency lock");
};
const copyTrackedSource = (destination) => {
  for (const relative of git("ls-files", "-z").split("\0").filter(Boolean)) {
    const source = path.join(root, relative);
    const target = path.join(destination, relative);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.cpSync(source, target, {dereference: false});
  }
};
const generationEnvironment = (temp, profile, modules) => ({
  PATH: `${path.dirname(process.execPath)}:${path.dirname(fs.realpathSync(path.join(modules, ".bin/expo")))}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
  CI: "1",
  EXPO_OFFLINE: "1",
  EXPO_NO_TELEMETRY: "1",
  npm_config_offline: "true",
  TMPDIR: temp,
  ...(profile.env ?? {}),
});
const normalizeGenerated = (contents, temp, modules) => contents.toString("binary")
  .replaceAll(temp, "<DISPOSABLE>")
  .replaceAll(path.dirname(modules), "<DEPENDENCIES>")
  .replaceAll("\r\n", "\n");
const writeAutolinkingEvidence = (temp, modules, environment) => {
  const binary = path.join(modules, ".bin/expo-modules-autolinking");
  const output = path.join(temp, "android/.assurance");
  fs.mkdirSync(output, {recursive: true});
  for (const [name, args] of [
    ["expo-modules-resolve.json", ["resolve", "--platform", "android", "--project-root", temp, "--json"]],
    ["react-native-config.json", ["react-native-config", "--platform", "android", "--project-root", temp, "--source-dir", path.join(temp, "android"), "--json"]],
  ]) {
    const result = run(binary, args, {cwd: temp, env: environment});
    gate(result.status === 0, "AUTOLINKING_EVIDENCE_FAILED", `${name} failed`);
    let parsed;
    try { parsed = JSON.parse(result.stdout); } catch { throw new GateError("AUTOLINKING_EVIDENCE_MALFORMED", `${name} emitted malformed JSON`); }
    const canonical = stable(parsed).replaceAll(temp, "<DISPOSABLE>").replaceAll(path.dirname(modules), "<DEPENDENCIES>");
    fs.writeFileSync(path.join(output, name), `${canonical}\n`, {mode: 0o600});
  }
};
const generatedAuthoritativePaths = () => {
  const releaseContract = readJson("config/assurance/release-target-parity-v1.json");
  const registry = readJson("config/assurance/native-capability-registry-v1.json");
  return [...new Set([
    ...releaseContract.generatedSource.androidFiles,
    ...registry.capabilities.filter(({platform}) => platform === "android")
      .flatMap(({generatedBy}) => generatedBy.map(({path: generatedPath}) => generatedPath)),
  ])].sort();
};

const inspectGeneratedSecurity = ({projectRoot, generatedDigest}) => {
  const manifestPath = path.join(projectRoot, "android/app/src/main/AndroidManifest.xml");
  const legacyPath = path.join(projectRoot, "android/app/src/main/res/xml/chillywood_native_call_full_backup_rules.xml");
  const modernPath = path.join(projectRoot, "android/app/src/main/res/xml/chillywood_native_call_data_extraction_rules.xml");
  for (const requiredPath of [manifestPath, legacyPath, modernPath]) {
    gate(fs.existsSync(requiredPath), "ANDROID_GENERATED_BACKUP_RESOURCE_MISSING", "A generated Android backup policy resource is missing");
  }
  const manifest = fs.readFileSync(manifestPath, "utf8");
  const legacy = fs.readFileSync(legacyPath, "utf8");
  const modern = fs.readFileSync(modernPath, "utf8");
  gate(manifest.includes('android:fullBackupContent="@xml/chillywood_native_call_full_backup_rules"'), "ANDROID_NATIVE_ACTION_LEGACY_BACKUP_EXCLUSION_MISSING", "The merged manifest lacks the legacy backup binding");
  gate(manifest.includes('android:dataExtractionRules="@xml/chillywood_native_call_data_extraction_rules"'), "ANDROID_NATIVE_ACTION_DEVICE_TRANSFER_EXCLUSION_MISSING", "The merged manifest lacks the modern backup binding");
  gate(exactExclusion(legacy), "ANDROID_NATIVE_ACTION_LEGACY_BACKUP_EXCLUSION_MISSING", "The exact transient preference is not excluded from legacy backup");
  gate(exactExclusion(modern, "cloud-backup"), "ANDROID_NATIVE_ACTION_CLOUD_BACKUP_EXCLUSION_MISSING", "The exact transient preference is not excluded from cloud backup");
  gate(exactExclusion(modern, "device-transfer"), "ANDROID_NATIVE_ACTION_DEVICE_TRANSFER_EXCLUSION_MISSING", "The exact transient preference is not excluded from device transfer");
  gate(exactExclusion(modern, "cross-platform-transfer"), "ANDROID_NATIVE_ACTION_CROSS_PLATFORM_TRANSFER_EXCLUSION_MISSING", "The exact transient preference is not excluded from supported cross-platform transfer");
  gate((legacy.match(/chilly_chat_native_call_action_v1\.xml/gu) ?? []).length === 1, "ANDROID_BACKUP_UNRELATED_EXCLUSION", "Legacy backup must exclude the transient preference exactly once");
  gate((modern.match(/chilly_chat_native_call_action_v1\.xml/gu) ?? []).length === 3, "ANDROID_BACKUP_UNRELATED_EXCLUSION", "Modern rules must contain only the three scoped transient exclusions");
  gate((legacy.match(/<exclude\b/gu) ?? []).length === 1, "ANDROID_BACKUP_UNRELATED_EXCLUSION", "The generated legacy resource must not add an unrelated exclusion");
  gate((modern.match(/<exclude\b/gu) ?? []).length === 3, "ANDROID_BACKUP_UNRELATED_EXCLUSION", "The generated modern resource must not add an unrelated exclusion");
  gate(/<receiver\b(?=[^>]*android:name="\.ChillyChatCallNotificationActionReceiver")(?=[^>]*android:exported="false")[^>]*>/u.test(normalizeXml(manifest)), "ANDROID_NATIVE_ACTION_RECEIVER_EXPORTED", "The merged action receiver must be non-exported");
  const supplement = [
    ["AndroidManifest.xml", manifest],
    ["chillywood_native_call_full_backup_rules.xml", legacy],
    ["chillywood_native_call_data_extraction_rules.xml", modern],
  ].map(([name, contents]) => `${name}\0${digest(contents.replaceAll("\r\n", "\n"))}\n`).join("");
  return {
    cloudBackupExcluded: true,
    crossPlatformTransferExcluded: true,
    deviceTransferExcluded: true,
    generatedDigest,
    legacyBackupExcluded: true,
    manifestBound: true,
    receiverExported: false,
    securitySupplementDigest: digest(supplement),
  };
};

const generateOnce = ({dependencies, inspect} = {}) => {
  const resolvedDependencies = dependencies ?? resolveDependencies();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-pr-d2b-"));
  fs.chmodSync(temp, 0o700);
  try {
    copyTrackedSource(temp);
    fs.rmSync(path.join(temp, "android"), {recursive: true, force: true});
    fs.symlinkSync(resolvedDependencies.modules, path.join(temp, "node_modules"), "dir");
    const privateConfig = ["google-services.json", "android/app/google-services.json"]
      .map((relative) => path.join(root, relative)).find(fs.existsSync);
    gate(privateConfig, "PRIVATE_NATIVE_CONFIG_MISSING", "Android generation requires the existing owner-local Google services input");
    fs.copyFileSync(privateConfig, path.join(temp, "google-services.json"));
    const profile = resolveProfile(readJson("eas.json"), "android-chat-livekit-qa");
    const environment = generationEnvironment(temp, profile, resolvedDependencies.modules);
    const result = run(process.execPath, [
      path.join(resolvedDependencies.modules, "expo/bin/cli"),
      "prebuild", "--no-install", "--platform", "android",
      "--template", path.join(resolvedDependencies.modules, "expo/template.tgz"),
    ], {cwd: temp, env: environment});
    const diagnostic = sanitizeDiagnostic(`${result.stderr ?? ""}\n${result.stdout ?? ""}`, [
      [temp, "<DISPOSABLE>"],
      [root, "<REPOSITORY>"],
      [resolvedDependencies.modules, "<DEPENDENCIES>"],
      [os.homedir(), "<OWNER_HOME>"],
    ]);
    gate(result.status === 0, "GENERATED_ANDROID_SOURCE_FAILED", `Disposable offline Expo Android prebuild failed${diagnostic ? `: ${diagnostic}` : ""}`);
    writeAutolinkingEvidence(temp, resolvedDependencies.modules, environment);
    const paths = generatedAuthoritativePaths();
    const fileHashes = {};
    for (const relative of paths) {
      const absolute = path.join(temp, relative);
      gate(fs.existsSync(absolute), "GENERATED_NATIVE_SOURCE_MISSING", `Missing generated path ${relative}`);
      fileHashes[relative] = digest(normalizeGenerated(fs.readFileSync(absolute), temp, resolvedDependencies.modules));
    }
    const generatedDigest = digest(Object.entries(fileHashes).map(([relative, hash]) => `${relative}\0${hash}\n`).join(""));
    const generated = Object.freeze({
      androidRoot: path.join(temp, "android"),
      environment: Object.freeze({...environment}),
      generatedDigest,
      modules: resolvedDependencies.modules,
      projectRoot: temp,
    });
    const security = inspectGeneratedSecurity(generated);
    const inspection = inspect ? inspect(generated) : null;
    gate(!inspection || typeof inspection.then !== "function", "ASYNC_DISPOSABLE_INSPECTION_UNSUPPORTED", "Disposable inspection must be synchronous");
    return {fileHashes, generatedDigest, inspection, security};
  } finally {
    fs.rmSync(temp, {recursive: true, force: true});
    gate(!fs.existsSync(temp), "ANDROID_DISPOSABLE_PROJECT_CLEANUP_FAILED", "The disposable generated Android project remains on disk");
  }
};

const generateThree = (inspectThird) => {
  const dependencies = resolveDependencies();
  const runs = [
    generateOnce({dependencies}),
    generateOnce({dependencies}),
    generateOnce({dependencies, inspect: inspectThird}),
  ];
  const digests = runs.map(({generatedDigest}) => generatedDigest);
  gate(new Set(digests).size === 1, "GENERATED_ANDROID_NONDETERMINISTIC", "Corrected Android generated source differs across three runs");
  gate(new Set(runs.map(({fileHashes}) => stable(fileHashes))).size === 1, "GENERATED_ANDROID_NONDETERMINISTIC", "A generated Android authoritative path differs across three runs");
  gate(new Set(runs.map(({security}) => security.securitySupplementDigest)).size === 1, "GENERATED_ANDROID_SECURITY_EVIDENCE_NONDETERMINISTIC", "Generated backup/manifest security evidence differs across three runs");
  return {
    correctedDigest: digests[0],
    fileCount: Object.keys(runs[0].fileHashes).length,
    inspection: runs[2].inspection,
    runs: "3/3",
    security: runs[0].security,
    securityRuns: "3/3",
  };
};

const unitTestSource = String.raw`package com.chillywood.mobile

import android.app.Application
import android.content.ContextWrapper
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

class D2BTestApplication : Application()

@RunWith(RobolectricTestRunner::class)
@Config(application = D2BTestApplication::class, sdk = [34])
class ChillyChatNativeActionOriginBackupTest {
  private val context: Application
    get() = ApplicationProvider.getApplicationContext()
  private val preferences
    get() = context.getSharedPreferences("chilly_chat_native_call_action_v1", 0)
  private val threadId = "11111111-1111-4111-8111-111111111111"
  private val inviteId = "22222222-2222-4222-8222-222222222222"

  @Before fun clear() { preferences.edit().clear().commit() }

  @Test fun schemaOneStateIsInvalidatedBeforeFreshCapture() {
    preferences.edit().putInt("schema_version", 1).putString("request_key", "a".repeat(64)).commit()
    assertTrue(ChillyChatNativeCallActionStore.captureTrustedNotificationAction(context, threadId, inviteId, "answer"))
    val action = ChillyChatNativeCallActionStore.consume(context)
    assertNotNull(action)
    assertEquals(2, action?.schemaVersion)
    assertEquals(1L, action?.captureGeneration)
  }

  @Test fun restoredSchemaOneActionIsRejectedAndDeletedWithoutFreshCapture() {
    preferences.edit()
      .putInt("schema_version", 1)
      .putString("thread_id", threadId)
      .putString("call_invite_id", inviteId)
      .putString("native_call_action", "answer")
      .putLong("created_at", System.currentTimeMillis())
      .putString("request_key", "a".repeat(64))
      .putLong("capture_generation", 1L)
      .putString("last_consumed_request_key", "b".repeat(64))
      .commit()
    assertNull(ChillyChatNativeCallActionStore.consume(context))
    assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
    assertTrue(preferences.all.isEmpty())
  }

  @Test fun duplicateDoesNotExtendGenerationAndConsumeIsOneTime() {
    assertTrue(ChillyChatNativeCallActionStore.captureTrustedNotificationAction(context, threadId, inviteId, "answer"))
    assertTrue(ChillyChatNativeCallActionStore.captureTrustedNotificationAction(context, threadId, inviteId, "answer"))
    val action = ChillyChatNativeCallActionStore.consume(context)
    assertEquals(1L, action?.captureGeneration)
    assertNull(ChillyChatNativeCallActionStore.consume(context))
    assertFalse(ChillyChatNativeCallActionStore.captureTrustedNotificationAction(context, threadId, inviteId, "answer"))
  }

  @Test fun concurrentConsumeHasOneWinner() {
    assertTrue(ChillyChatNativeCallActionStore.captureTrustedNotificationAction(context, threadId, inviteId, "decline"))
    val ready = CountDownLatch(2)
    val start = CountDownLatch(1)
    val winners = AtomicInteger(0)
    val threads = (1..2).map {
      Thread {
        ready.countDown()
        start.await()
        if (ChillyChatNativeCallActionStore.consume(context) != null) winners.incrementAndGet()
      }.apply { start() }
    }
    ready.await()
    start.countDown()
    threads.forEach { it.join() }
    assertEquals(1, winners.get())
  }

  @Test fun receiverPersistsBeforeNeutralActivityLaunch() {
    var launched = false
    val interceptingContext = object : ContextWrapper(context) {
      override fun startActivity(intent: Intent) {
        assertEquals("present", ChillyChatNativeCallActionStore.readStatus(this))
        assertEquals(Intent.ACTION_MAIN, intent.action)
        assertNull(intent.data)
        assertEquals(packageName, intent.component?.packageName)
        launched = true
      }
    }
    val intent = Intent(interceptingContext, ChillyChatCallNotificationActionReceiver::class.java).apply {
      action = ChillyChatCallNotifications.ACTION_ANSWER
      putExtra("threadId", threadId)
      putExtra("callInviteId", inviteId)
    }
    ChillyChatCallNotificationActionReceiver().onReceive(interceptingContext, intent)
    assertEquals("present", ChillyChatNativeCallActionStore.readStatus(context))
    assertTrue(launched)
  }
}
`;

const instrumentationSource = String.raw`package com.chillywood.mobile

import android.content.Intent
import android.net.Uri
import android.app.NotificationManager
import android.app.PendingIntent
import android.os.Build
import android.os.SystemClock
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ChillyChatNativeActionOriginInstrumentationTest {
  private val context get() = ApplicationProvider.getApplicationContext<android.content.Context>()
  private val preferences get() = context.getSharedPreferences("chilly_chat_native_call_action_v1", 0)
  private val threadId = "11111111-1111-4111-8111-111111111111"
  private val inviteId = "22222222-2222-4222-8222-222222222222"

  @Before fun clear() {
    context.getSystemService(NotificationManager::class.java).cancelAll()
    preferences.edit().clear().commit()
    InstrumentationRegistry.getInstrumentation().waitForIdleSync()
    SystemClock.sleep(200L)
    context.getSystemService(NotificationManager::class.java).cancelAll()
    preferences.edit().clear().commit()
    assertEquals("test precondition must start with an empty native-action store", "empty", ChillyChatNativeCallActionStore.readStatus(context))
  }

  private fun awaitStatus(expected: String): Boolean {
    val deadline = SystemClock.elapsedRealtime() + 2_000L
    while (SystemClock.elapsedRealtime() < deadline) {
      if (ChillyChatNativeCallActionStore.readStatus(context) == expected) return true
      SystemClock.sleep(20L)
    }
    return ChillyChatNativeCallActionStore.readStatus(context) == expected
  }

  private fun awaitNotification(): android.app.Notification {
    val manager = context.getSystemService(NotificationManager::class.java)
    val deadline = SystemClock.elapsedRealtime() + 2_000L
    while (SystemClock.elapsedRealtime() < deadline) {
      manager.activeNotifications.singleOrNull()?.notification?.let { return it }
      SystemClock.sleep(20L)
    }
    return manager.activeNotifications.single().notification
  }

  private fun sendPendingIntent(pendingIntent: PendingIntent) {
    pendingIntent.send()
    InstrumentationRegistry.getInstrumentation().waitForIdleSync()
  }

  @Test fun trustedAnswerReceiverConsumesOnce() {
    val data = mapOf("threadId" to threadId, "callInviteId" to inviteId, "callType" to "voice", "callerName" to "Synthetic")
    ChillyChatCallNotifications.showIncomingCallNotification(context, data)
    val notification = awaitNotification()
    val observed = mutableListOf<String>()
    for (action in notification.actions) {
      if (Build.VERSION.SDK_INT >= 31) assertTrue("notification action PendingIntent must be immutable", action.actionIntent.isImmutable)
      sendPendingIntent(action.actionIntent)
      assertTrue("trusted notification receiver must persist before native consumption", awaitStatus("present"))
      val captured = ChillyChatNativeCallActionStore.consume(context)
      if (captured != null) observed.add(captured.nativeCallAction)
      ChillyChatCallNotifications.showIncomingCallNotification(context, data)
    }
    assertEquals(listOf("answer", "decline"), observed.sorted())
    assertNull(ChillyChatNativeCallActionStore.consume(context))
  }

  @Test fun trustedDeclineReceiverConsumesOnce() {
    val data = mapOf("threadId" to threadId, "callInviteId" to inviteId, "callType" to "voice", "callerName" to "Synthetic")
    ChillyChatCallNotifications.showIncomingCallNotification(context, data)
    val notification = awaitNotification()
    assertTrue(notification.deleteIntent != null)
    if (Build.VERSION.SDK_INT >= 31) assertTrue(notification.deleteIntent.isImmutable)
    sendPendingIntent(notification.deleteIntent)
    assertTrue(awaitStatus("present"))
    assertEquals("decline", ChillyChatNativeCallActionStore.consume(context)?.nativeCallAction)
    assertNull(ChillyChatNativeCallActionStore.consume(context))
    ChillyChatCallNotifications.showIncomingCallNotification(context, data)
    val navigation = awaitNotification()
    navigation.contentIntent.send()
    assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
    assertTrue(navigation.fullScreenIntent != null)
    navigation.fullScreenIntent.send()
    assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
  }

  @Test fun foregroundNeutralWakeConsumesImmediatelyAndCannotReplay() {
    assertTrue(ChillyChatNativeCallActionStore.captureTrustedNotificationAction(context, threadId, inviteId, "answer"))
    val warm = Intent(Intent.ACTION_MAIN).apply { setPackage(context.packageName); data = null }
    assertTrue(ChillyChatCallNotificationModule.shouldEmitPendingAction(warm, ChillyChatNativeCallActionStore.readStatus(context)))
    assertTrue(ChillyChatNativeCallActionStore.consume(context) != null)
    assertFalse(ChillyChatCallNotificationModule.shouldEmitPendingAction(warm, ChillyChatNativeCallActionStore.readStatus(context)))
    assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
  }

  @Test fun externalViewAndEmptyWarmIntentCannotManufactureAuthority() {
    val external = Intent(Intent.ACTION_VIEW, Uri.parse("chillywoodmobile://chat/$threadId?callInviteId=$inviteId&nativeCallAction=answer"))
    val emptyWarm = Intent(Intent.ACTION_MAIN).apply { setPackage(context.packageName); data = null }
    assertFalse(ChillyChatCallNotificationModule.shouldEmitPendingAction(external, "present"))
    assertFalse(ChillyChatCallNotificationModule.shouldEmitPendingAction(emptyWarm, "empty"))
    assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
  }

  @Test fun unknownAndMalformedReceiverActionsFailClosed() {
    assertEquals("unknown-action precondition must be empty", "empty", ChillyChatNativeCallActionStore.readStatus(context))
    ChillyChatCallNotificationActionReceiver().onReceive(context, Intent(context, ChillyChatCallNotificationActionReceiver::class.java).apply {
      action = "com.chillywood.mobile.action.UNKNOWN"
      putExtra("threadId", threadId)
      putExtra("callInviteId", inviteId)
    })
    assertEquals("unknown receiver action must not persist", "empty", ChillyChatNativeCallActionStore.readStatus(context))
    assertFalse(ChillyChatNativeCallActionStore.captureTrustedNotificationAction(context, "malformed", inviteId, "answer"))
  }

  @Test fun statusIsEmpty() { assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context)) }
}

@RunWith(AndroidJUnit4::class)
class ChillyChatNativeActionProbeInstrumentationTest {
  private val context get() = ApplicationProvider.getApplicationContext<android.content.Context>()
  @Test fun statusIsEmptyWithoutClearingFirst() {
    assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
  }
}

@RunWith(AndroidJUnit4::class)
class ChillyChatNativeActionBackupInstrumentationTest {
  private val context get() = ApplicationProvider.getApplicationContext<android.content.Context>()
  private val actionPreferences get() = context.getSharedPreferences("chilly_chat_native_call_action_v1", 0)
  private val controlPreferences get() = context.getSharedPreferences("d2b_allowed_control", 0)
  private val threadId = "11111111-1111-4111-8111-111111111111"
  private val inviteId = "22222222-2222-4222-8222-222222222222"

  @Test fun seedBackupFixture() {
    actionPreferences.edit().clear().commit()
    controlPreferences.edit().clear().putBoolean("allowed_control", true).commit()
    assertTrue(ChillyChatNativeCallActionStore.captureTrustedNotificationAction(context, threadId, inviteId, "answer"))
    ChillyChatNativeCallActionStore.consume(context)
    assertTrue(ChillyChatNativeCallActionStore.captureTrustedNotificationAction(context, threadId, inviteId, "decline"))
    assertEquals("present", ChillyChatNativeCallActionStore.readStatus(context))
  }

  @Test fun assertBackupRestoreResult() {
    assertTrue(controlPreferences.getBoolean("allowed_control", false))
    assertTrue(actionPreferences.all.isEmpty())
    assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
  }
}
`;

const adversaryJava = String.raw`package com.chillywood.assurance.adversary;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

public final class ProbeActivity extends Activity {
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    String thread = "11111111-1111-4111-8111-111111111111";
    String invite = "22222222-2222-4222-8222-222222222222";
    try {
      Intent broadcast = new Intent("com.chillywood.mobile.action.ANSWER_CHILLY_CHAT_CALL");
      broadcast.setComponent(new ComponentName("${packageName}", "com.chillywood.mobile.ChillyChatCallNotificationActionReceiver"));
      broadcast.putExtra("threadId", thread);
      broadcast.putExtra("callInviteId", invite);
      sendBroadcast(broadcast);
    } catch (SecurityException ignored) {}
    try {
      Intent route = new Intent(Intent.ACTION_VIEW, Uri.parse("chillywoodmobile://chat/" + thread + "?callInviteId=" + invite + "&nativeCallAction=answer"));
      route.setComponent(new ComponentName("${packageName}", "com.chillywood.mobile.MainActivity"));
      startActivity(route);
    } catch (RuntimeException ignored) {}
    finish();
  }
}
`;

const injectHarness = (projectRoot) => {
  const unitPath = path.join(projectRoot, "android/app/src/test/java/com/chillywood/mobile/ChillyChatNativeActionOriginBackupTest.kt");
  const instrumentPath = path.join(projectRoot, "android/app/src/androidTest/java/com/chillywood/mobile/ChillyChatNativeActionOriginInstrumentationTest.kt");
  fs.mkdirSync(path.dirname(unitPath), {recursive: true});
  fs.mkdirSync(path.dirname(instrumentPath), {recursive: true});
  fs.writeFileSync(unitPath, unitTestSource, {mode: 0o600});
  fs.writeFileSync(instrumentPath, instrumentationSource, {mode: 0o600});
  const gradlePropertiesPath = path.join(projectRoot, "android/gradle.properties");
  const gradleProperties = fs.readFileSync(gradlePropertiesPath, "utf8")
    .split("\n")
    .filter((line) => !/^(?:org\.gradle\.jvmargs|org\.gradle\.parallel|org\.gradle\.workers\.max)=/u.test(line))
    .join("\n")
    .trimEnd();
  fs.writeFileSync(gradlePropertiesPath, `${gradleProperties}\norg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m\norg.gradle.parallel=false\norg.gradle.workers.max=2\n`, {mode: 0o600});
  const appGradle = path.join(projectRoot, "android/app/build.gradle");
  fs.appendFileSync(appGradle, `

android {
    defaultConfig { testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner" }
    buildTypes { debug { applicationIdSuffix ".d2btest" } }
    testOptions { unitTests.includeAndroidResources = true }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("androidx.test:core:1.6.1")
    testImplementation("org.robolectric:robolectric:4.13")
    androidTestImplementation("androidx.test:core:1.6.1")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
}

`, {encoding: "utf8"});

  const debugManifest = path.join(projectRoot, "android/app/src/debug/AndroidManifest.xml");
  fs.mkdirSync(path.dirname(debugManifest), {recursive: true});
  fs.writeFileSync(debugManifest, `<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
  <uses-permission android:name="android.permission.INTERNET" tools:node="remove" />
  <application>
    <receiver android:name="com.amazon.device.iap.ResponseReceiver" tools:node="remove" tools:ignore="MissingClass" />
    <provider android:name="com.google.firebase.provider.FirebaseInitProvider" tools:node="remove" />
  </application>
</manifest>
`, {mode: 0o600});
  const androidTestManifest = path.join(projectRoot, "android/app/src/androidTest/AndroidManifest.xml");
  fs.writeFileSync(androidTestManifest, `<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
  <uses-permission android:name="android.permission.INTERNET" tools:node="remove" />
</manifest>
`, {mode: 0o600});
  const sanitizedGoogleServices = {
    client: [{
      api_key: [{current_key: "offline-invalid"}],
      client_info: {android_client_info: {package_name: packageName}, mobilesdk_app_id: "1:000000000000:android:0000000000000000"},
      oauth_client: [],
      services: {appinvite_service: {other_platform_oauth_client: []}},
    }],
    configuration_version: "1",
    project_info: {project_id: "offline-invalid", project_number: "000000000000", storage_bucket: "offline.invalid"},
  };
  fs.writeFileSync(path.join(projectRoot, "android/app/google-services.json"), `${JSON.stringify(sanitizedGoogleServices)}\n`, {mode: 0o600});

  const adversaryRoot = path.join(projectRoot, "android/adversary");
  fs.mkdirSync(path.join(adversaryRoot, "src/main/java/com/chillywood/assurance/adversary"), {recursive: true});
  fs.writeFileSync(path.join(adversaryRoot, "build.gradle"), `apply plugin: "com.android.application"
android {
    namespace "${adversaryPackageName}"
    compileSdk rootProject.ext.compileSdkVersion
    defaultConfig {
        applicationId "${adversaryPackageName}"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1"
    }
}
`, {mode: 0o600});
  fs.writeFileSync(path.join(adversaryRoot, "src/main/AndroidManifest.xml"), `<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:theme="@android:style/Theme.NoDisplay"><activity android:name=".ProbeActivity" android:exported="true" /></application></manifest>\n`, {mode: 0o600});
  fs.writeFileSync(path.join(adversaryRoot, "src/main/java/com/chillywood/assurance/adversary/ProbeActivity.java"), adversaryJava, {mode: 0o600});
  fs.appendFileSync(path.join(projectRoot, "android/settings.gradle"), `\ninclude ':adversary'\n`, {encoding: "utf8"});
};

const runGradle = ({androidRoot, environment, modules, projectRoot, sdk}) => {
  const javaHome = process.env.JAVA_HOME;
  gate(javaHome && fs.existsSync(javaHome), "JAVA_HOME_MISSING", "A supported local Java runtime is required");
  fs.writeFileSync(path.join(androidRoot, "local.properties"), `sdk.dir=${sdk.replaceAll("\\", "\\\\")}\n`, {mode: 0o600});
  injectHarness(projectRoot);
  const gradleEnvironment = {
    ...environment,
    ANDROID_HOME: sdk,
    ANDROID_SDK_ROOT: sdk,
    GRADLE_USER_HOME: path.join(os.homedir(), ".gradle"),
    JAVA_HOME: javaHome,
    PATH: `${path.join(sdk, "platform-tools")}:${environment.PATH}`,
  };
  const tasks = [
    ":app:testDebugUnitTest",
    ":app:compileDebugAndroidTestKotlin",
    ":app:assembleDebugAndroidTest",
    ":app:processDebugMainManifest",
    ":app:mergeDebugResources",
    ":app:compileDebugKotlin",
    ":app:compileDebugUnitTestKotlin",
    ":app:assembleDebug",
    ":app:lintDebug",
    ":adversary:assembleDebug",
  ];
  const timeoutBinary = ["/usr/local/bin/timeout", "/usr/local/bin/gtimeout"].find((candidate) => fs.existsSync(candidate));
  gate(timeoutBinary, "ANDROID_TOOLCHAIN_TIMEOUT_UNAVAILABLE", "A process-tree timeout is required for the bounded Android gate");
  const privatePaths = [
    [projectRoot, "<DISPOSABLE>"],
    [root, "<REPOSITORY>"],
    [modules, "<DEPENDENCIES>"],
    [sdk, "<ANDROID_SDK>"],
    [os.homedir(), "<OWNER_HOME>"],
  ];
  const groups = [
    {
      id: "core",
      tasks: [":app:testDebugUnitTest", ":app:assembleDebugAndroidTest", ":app:assembleDebug", ":adversary:assembleDebug"],
    },
    {id: "lint", tasks: [":app:lintDebug"]},
  ];
  let lintOnlyExpoGenerationMarkersRemoved = 0;
  let lintOnlyOptionalCameraFeaturesAdded = 0;
  let lintOnlySplashTargetApiAnnotations = 0;
  for (const group of groups) {
    if (group.id === "lint") {
      // Expo's generated `data-generated` marker is tool metadata, not an Android
      // runtime attribute, and AGP lint rejects it for lacking a namespace. Core
      // compilation above uses the exact generated manifest; lint removes only
      // this reviewed marker after the exact generated digest has been recorded.
      const mainManifestPath = path.join(androidRoot, "app/src/main/AndroidManifest.xml");
      const mainManifest = fs.readFileSync(mainManifestPath, "utf8");
      lintOnlyExpoGenerationMarkersRemoved = (mainManifest.match(/\sdata-generated="true"/gu) ?? []).length;
      gate(lintOnlyExpoGenerationMarkersRemoved > 0, "ANDROID_LINT_NORMALIZATION_INPUT_MISSING", "The exact Expo lint-only marker allowlist no longer matches generated source");
      let normalizedMainManifest = mainManifest.replace(/\sdata-generated="true"/gu, "");
      gate(normalizedMainManifest.includes('android.permission.CAMERA'), "ANDROID_LINT_NORMALIZATION_INPUT_MISSING", "The expected generated camera permission is missing");
      if (!/uses-feature\b[^>]*android:name="android\.hardware\.camera"/u.test(normalizedMainManifest)) {
        normalizedMainManifest = normalizedMainManifest.replace(
          /(<manifest\b[^>]*>)/u,
          '$1\n  <uses-feature android:name="android.hardware.camera" android:required="false" />',
        );
        lintOnlyOptionalCameraFeaturesAdded = 1;
      }
      gate(lintOnlyOptionalCameraFeaturesAdded === 1, "ANDROID_LINT_NORMALIZATION_INPUT_MISSING", "The exact optional-camera lint baseline input is required");
      fs.writeFileSync(mainManifestPath, normalizedMainManifest, {mode: 0o600});
      for (const stylesPath of walkFiles(path.join(androidRoot, "app/src/main/res"))
        .filter((candidate) => /[/\\]values(?:-[^/\\]+)?[/\\]styles\.xml$/u.test(candidate))) {
        const styles = fs.readFileSync(stylesPath, "utf8");
        const count = (styles.match(/<item name="android:windowSplashScreenBehavior">/gu) ?? []).length;
        if (count === 0) continue;
        let normalized = styles.replace(
          /<item name="android:windowSplashScreenBehavior">/gu,
          '<item name="android:windowSplashScreenBehavior" tools:targetApi="33">',
        );
        if (!/xmlns:tools=/u.test(normalized)) {
          normalized = normalized.replace("<resources>", '<resources xmlns:tools="http://schemas.android.com/tools">');
        }
        fs.writeFileSync(stylesPath, normalized, {mode: 0o600});
        lintOnlySplashTargetApiAnnotations += count;
      }
      gate(lintOnlySplashTargetApiAnnotations === 1, "ANDROID_LINT_NORMALIZATION_INPUT_MISSING", "The exact Expo splash-style lint input is required");
    }
    process.stderr.write(`D2B_ANDROID_GRADLE_${group.id.toUpperCase()}_START\n`);
    const result = run(timeoutBinary, ["--signal=INT", "--kill-after=30s", "14m", path.join(androidRoot, "gradlew"), ...group.tasks, "--no-daemon", "--console=plain", "--stacktrace"], {
      cwd: androidRoot,
      env: gradleEnvironment,
    });
    let diagnostic = sanitizeDiagnostic(`${result.stderr ?? ""}\n${result.stdout ?? ""}`, privatePaths);
    if (result.status !== 0) {
      const failureXml = walkFiles(path.join(androidRoot, "app/build/test-results/testDebugUnitTest"))
        .filter((candidate) => candidate.endsWith(".xml"));
      const junitFailures = failureXml.flatMap((candidate) => {
        const contents = fs.readFileSync(candidate, "utf8");
        return [...contents.matchAll(/<failure\b([^>]*)>([\s\S]*?)<\/failure>/gu)].map((match) => `${match[1]} ${match[2].replace(/<[^>]+>/gu, " ")}`);
      });
      const junitDiagnostic = sanitizeDiagnostic(junitFailures.join("\n"), privatePaths);
      if (junitDiagnostic) diagnostic = `${junitDiagnostic} | ${diagnostic}`.slice(0, 5000);
    }
    gate(result.status !== 124 && result.status !== 137, "ANDROID_GRADLE_GATE_TIMEOUT", `The ${group.id} Gradle gate exceeded its 14-minute bound`, {tasks: group.tasks});
    gate(result.status === 0, "ANDROID_GRADLE_COMPILE_FAILED", `The ${group.id} Gradle gate failed${diagnostic ? `: ${diagnostic}` : ""}`, {tasks: group.tasks});
    process.stderr.write(`D2B_ANDROID_GRADLE_${group.id.toUpperCase()}_PASS\n`);
  }
  const results = tasks.map((task) => ({passed: true, task}));

  const mergedManifestCandidates = walkFiles(path.join(androidRoot, "app/build/intermediates"))
    .filter((candidate) => candidate.endsWith("AndroidManifest.xml")
      && /[/\\]merged_manifest(?:s)?[/\\]debug[/\\]/u.test(candidate)
      && !/androidTest/iu.test(candidate));
  gate(mergedManifestCandidates.length >= 1, "ANDROID_MERGED_DEBUG_MANIFEST_MISSING", "A merged debug application manifest is required");
  const mergedManifests = mergedManifestCandidates.map((candidate) => fs.readFileSync(candidate, "utf8"));
  gate(new Set(mergedManifests).size === 1, "ANDROID_MERGED_DEBUG_MANIFEST_AMBIGUOUS", "Gradle produced divergent merged debug application manifests", {count: mergedManifestCandidates.length});
  const mergedManifest = mergedManifests[0];
  gate(mergedManifest.includes(`package="${packageName}"`), "ANDROID_DISPOSABLE_PACKAGE_MISMATCH", "The compiled debug application must use the isolated D2B package ID");
  gate(!mergedManifest.includes("android.permission.INTERNET"), "ANDROID_DISPOSABLE_NETWORK_PERMISSION_PRESENT", "The disposable D2B debug application must not retain INTERNET permission");
  gate(!mergedManifest.includes("com.google.firebase.provider.FirebaseInitProvider"), "ANDROID_DISPOSABLE_PROVIDER_INITIALIZATION_PRESENT", "The offline D2B debug application must not initialize Firebase");
  gate(mergedManifest.includes('android:fullBackupContent="@xml/chillywood_native_call_full_backup_rules"'), "ANDROID_NATIVE_ACTION_LEGACY_BACKUP_EXCLUSION_MISSING", "The compiled debug manifest lacks the legacy backup binding");
  gate(mergedManifest.includes('android:dataExtractionRules="@xml/chillywood_native_call_data_extraction_rules"'), "ANDROID_NATIVE_ACTION_DEVICE_TRANSFER_EXCLUSION_MISSING", "The compiled debug manifest lacks the modern backup binding");
  gate(/<receiver\b(?=[^>]*android:name="com\.chillywood\.mobile\.ChillyChatCallNotificationActionReceiver")(?=[^>]*android:exported="false")[^>]*>/u.test(normalizeXml(mergedManifest)), "ANDROID_NATIVE_ACTION_RECEIVER_EXPORTED", "The compiled debug receiver must be non-exported");
  const androidTestManifestCandidates = walkFiles(path.join(androidRoot, "app/build/intermediates"))
    .filter((candidate) => candidate.endsWith("AndroidManifest.xml") && /[/\\]debugAndroidTest[/\\]/u.test(candidate));
  gate(androidTestManifestCandidates.length >= 1, "ANDROID_TEST_MERGED_MANIFEST_MISSING", "A merged instrumentation-test manifest is required");
  const mergedAndroidTestManifests = androidTestManifestCandidates.map((candidate) => fs.readFileSync(candidate, "utf8"));
  gate(new Set(mergedAndroidTestManifests).size === 1, "ANDROID_TEST_MERGED_MANIFEST_AMBIGUOUS", "Gradle produced divergent merged instrumentation-test manifests", {count: androidTestManifestCandidates.length});
  const mergedAndroidTestManifest = mergedAndroidTestManifests[0];
  gate(!mergedAndroidTestManifest.includes("android.permission.INTERNET"), "ANDROID_DISPOSABLE_NETWORK_PERMISSION_PRESENT", "The disposable D2B instrumentation package must not retain INTERNET permission");
  gate(mergedAndroidTestManifest.includes(`android:targetPackage="${packageName}"`), "ANDROID_TEST_TARGET_PACKAGE_MISMATCH", "Instrumentation must target only the isolated D2B application package");

  const unitResultPath = path.join(androidRoot, "app/build/test-results/testDebugUnitTest/TEST-com.chillywood.mobile.ChillyChatNativeActionOriginBackupTest.xml");
  gate(fs.existsSync(unitResultPath), "ANDROID_UNIT_TEST_RESULT_MISSING", "The focused JVM result file is missing");
  const unitResult = fs.readFileSync(unitResultPath, "utf8");
  const suite = unitResult.match(/<testsuite\b([^>]*)>/u)?.[1];
  gate(suite, "ANDROID_UNIT_TEST_RESULT_MALFORMED", "The focused JVM result is not parseable");
  const suiteAttributes = Object.fromEntries([...suite.matchAll(/\b(tests|failures|errors|skipped)="(\d+)"/gu)].map((match) => [match[1], Number(match[2])]));
  const normalizedCounts = {tests: suiteAttributes.tests, failures: suiteAttributes.failures, errors: suiteAttributes.errors, skipped: suiteAttributes.skipped};
  gate(normalizedCounts.tests === 5 && normalizedCounts.failures === 0 && normalizedCounts.errors === 0 && normalizedCounts.skipped === 0, "ANDROID_UNIT_TEST_COUNT_MISMATCH", "The exact focused JVM test plan must pass 5/5", normalizedCounts);
  const testcaseNames = [...unitResult.matchAll(/<testcase\b[^>]*\bname="([^"]+)"/gu)].map((match) => match[1]).sort();
  gate(testcaseNames.length === 5 && new Set(testcaseNames).size === 5, "ANDROID_UNIT_TEST_RESULT_MALFORMED", "The exact focused JVM testcase identities are required");
  return {
    lintNormalization: {expoGenerationMarkersRemoved: lintOnlyExpoGenerationMarkersRemoved, optionalCameraFeaturesAdded: lintOnlyOptionalCameraFeaturesAdded, scope: "LINT_ONLY_AFTER_EXACT_CORE_COMPILE", splashTargetApiAnnotations: lintOnlySplashTargetApiAnnotations},
    mergedManifest: {networkPermission: "OFFLINE_NETWORK_PERMISSION_DENIED", resultSha256: digest(mergedManifest), testResultSha256: digest(mergedAndroidTestManifest)},
    tasks: results,
    toolchainMemory: {gradleHeapMiB: 4096, maxMetaspaceMiB: 1024, maxWorkers: 2, parallel: false},
    unitTests: {...normalizedCounts, resultSha256: digest(stable({counts: normalizedCounts, testcaseNames})), status: "PASS_5_OF_5"},
  };
};

const adbRun = (adb, serial, args, options = {}) => run(adb, ["-s", serial, ...args], {timeout: options.timeout ?? 5 * 60 * 1000});
const connectedEmulators = (adb) => {
  const result = run(adb, ["devices"]);
  gate(result.status === 0, "ANDROID_ADB_UNAVAILABLE", "ADB is unavailable");
  return result.stdout.split("\n").slice(1).map((line) => line.trim().split(/\s+/u))
    .filter(([serial, state]) => serial?.startsWith("emulator-") && state === "device")
    .map(([serial]) => serial);
};
const selectAvd = (sdk) => {
  const avdRoot = path.join(os.homedir(), ".android", "avd");
  if (!fs.existsSync(avdRoot)) return null;
  const candidates = fs.readdirSync(avdRoot).filter((name) => name.endsWith(".avd")).map((name) => {
    const configPath = path.join(avdRoot, name, "config.ini");
    const config = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "";
    const api = Number(config.match(/image\.sysdir\.1=.*android-(\d+)/u)?.[1] ?? 0);
    return {api, name: name.slice(0, -4)};
  }).filter(({api}) => api >= 34).sort((a, b) => b.api - a.api);
  gate(fs.existsSync(path.join(sdk, "emulator", "emulator")), "ANDROID_EMULATOR_BINARY_MISSING", "The local Android emulator binary is unavailable");
  return candidates[0] ?? null;
};
const ensureEmulator = (sdk) => {
  const adb = path.join(sdk, "platform-tools", "adb");
  let serials = connectedEmulators(adb);
  gate(serials.length <= 1, "ANDROID_EMULATOR_NOT_EXACTLY_ONE", "At most one local emulator may be active");
  let started = false;
  let emulatorProcess = null;
  const bootReady = (serial) => {
    const boot = adbRun(adb, serial, ["shell", "getprop", "sys.boot_completed"]);
    return boot.status === 0 && boot.stdout.trim() === "1";
  };
  if (serials.length === 0) {
    const selected = selectAvd(sdk);
    gate(selected, "BLOCKED_LOCAL_ANDROID_SDK_IMAGE", "No supported local Android emulator definition is available");
    emulatorProcess = spawn(path.join(sdk, "emulator", "emulator"), [
      "-avd", selected.name,
      "-read-only", "-no-snapshot-load", "-no-snapshot-save",
      "-no-audio", "-no-boot-anim", "-no-window",
    ], {env: process.env, stdio: "ignore"});
    started = true;
    try {
      const deadline = Date.now() + 15 * 60 * 1000;
      while (Date.now() < deadline) {
        serials = connectedEmulators(adb);
        if (serials.length === 1 && bootReady(serials[0])) break;
        sleep(2000);
      }
      gate(serials.length === 1 && bootReady(serials[0]), "BLOCKED_LOCAL_ANDROID_SDK_IMAGE", "The local Android emulator did not become ready within 15 minutes");
    } catch (error) {
      if (serials.length === 1) adbRun(adb, serials[0], ["emu", "kill"]);
      if (emulatorProcess && !emulatorProcess.killed) emulatorProcess.kill();
      throw error;
    }
  } else gate(bootReady(serials[0]), "BLOCKED_LOCAL_ANDROID_SDK_IMAGE", "The selected local Android emulator is not fully booted");
  return {adb, emulatorProcess, serial: serials[0], started};
};
const packagePresent = (adb, serial, name) => {
  const result = adbRun(adb, serial, ["shell", "pm", "list", "packages", "--user", "0", name]);
  gate(result.status === 0, "ANDROID_PACKAGE_STATE_UNAVAILABLE", "Unable to verify disposable package state");
  return result.stdout.split("\n").map((line) => line.trim()).includes(`package:${name}`);
};
const instrument = (adb, serial, className, method, expectedCount) => {
  const selected = method ? `${className}#${method}` : className;
  const result = adbRun(adb, serial, ["shell", "am", "instrument", "-w", "-r", "-e", "class", selected, `${testPackageName}/androidx.test.runner.AndroidJUnitRunner`]);
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const count = Number(output.match(/OK \((\d+) tests?\)/u)?.[1] ?? NaN);
  const diagnostic = output
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/giu, "<SYNTHETIC_UUID>")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /INSTRUMENTATION_STATUS: (?:class|test|stack)|INSTRUMENTATION_STATUS_CODE: -|FAILURES!!!|Process crashed|AssertionError|shortMsg/iu.test(line))
    .slice(0, 24)
    .join(" | ")
    .slice(0, 3000);
  gate(
    result.status === 0
      && !/FAILURES!!!|INSTRUMENTATION_FAILED|Process crashed/iu.test(output)
      && Number.isSafeInteger(count)
      && count === expectedCount,
    "ANDROID_NATIVE_ACTION_INSTRUMENTATION_FAILED",
    `Focused Android native-action instrumentation did not pass its exact ${expectedCount}-test plan${diagnostic ? `: ${diagnostic}` : ""}`,
  );
  return {count, outputSha256: digest(output.trim())};
};

const tryLocalBackupRestore = ({adb, serial}) => {
  const transports = adbRun(adb, serial, ["shell", "bmgr", "list", "transports"]);
  if (transports.status !== 0) return {status: "BLOCKED_LOCAL_ANDROID_BACKUP_TRANSPORT"};
  const lines = transports.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  const previous = lines.find((line) => line.startsWith("*"))?.replace(/^\*\s*/u, "") ?? null;
  const local = lines.map((line) => line.replace(/^\*\s*/u, "")).find((line) => /LocalTransport/iu.test(line) && !/google/iu.test(line));
  if (!local) return {status: "BLOCKED_LOCAL_ANDROID_BACKUP_TRANSPORT"};
  let enabledByRun = false;
  const cleanupFailures = [];
  try {
    const enabled = adbRun(adb, serial, ["shell", "bmgr", "enabled"]);
    gate(enabled.status === 0, "ANDROID_BACKUP_MANAGER_STATE_FAILED", "Unable to read local Backup Manager state");
    if (!/currently enabled/iu.test(enabled.stdout)) {
      gate(adbRun(adb, serial, ["shell", "bmgr", "enable", "true"]).status === 0, "ANDROID_BACKUP_MANAGER_ENABLE_FAILED", "Unable to enable local Backup Manager");
      enabledByRun = true;
    }
    gate(adbRun(adb, serial, ["shell", "bmgr", "transport", local]).status === 0, "ANDROID_BACKUP_TRANSPORT_SELECTION_FAILED", "Unable to select the verified local Backup Manager transport");
    instrument(adb, serial, "com.chillywood.mobile.ChillyChatNativeActionBackupInstrumentationTest", "seedBackupFixture", 1);
    const backup = adbRun(adb, serial, ["shell", "bmgr", "backupnow", "--non-incremental", packageName], {timeout: 10 * 60 * 1000});
    gate(backup.status === 0 && /Package .* with result: Success|Backup finished with result: Success/iu.test(backup.stdout), "ANDROID_NATIVE_ACTION_BACKUP_EXECUTION_FAILED", "The local backup transport did not complete the disposable backup successfully");
    const sets = adbRun(adb, serial, ["shell", "bmgr", "list", "sets"]);
    gate(sets.status === 0, "ANDROID_BACKUP_SET_LIST_FAILED", "Unable to list the local backup set");
    const token = sets.stdout.match(/^\s*([0-9a-fx]+)\s*:/imu)?.[1];
    gate(token, "ANDROID_BACKUP_SET_MISSING", "The completed local backup did not expose a restore token");
    gate(adbRun(adb, serial, ["shell", "pm", "clear", packageName]).status === 0, "ANDROID_BACKUP_RESTORE_SETUP_FAILED", "Unable to clear the disposable app before local restore");
    const restore = adbRun(adb, serial, ["shell", "bmgr", "restore", token, packageName], {timeout: 10 * 60 * 1000});
    gate(restore.status === 0 && /restoreFinished:\s*0|Restore finished with result:\s*0/iu.test(restore.stdout), "ANDROID_NATIVE_ACTION_RESTORE_EXECUTION_FAILED", "The local restore did not complete successfully");
    instrument(adb, serial, "com.chillywood.mobile.ChillyChatNativeActionBackupInstrumentationTest", "assertBackupRestoreResult", 1);
    return {allowedControlRestored: true, replayStateRestored: false, status: "ANDROID_NATIVE_ACTION_BACKUP_RESTORE_CLEAR", transientActionRestored: false};
  } finally {
    if (adbRun(adb, serial, ["shell", "bmgr", "wipe", local, packageName]).status !== 0) cleanupFailures.push("wipe");
    if (previous && previous !== local && adbRun(adb, serial, ["shell", "bmgr", "transport", previous]).status !== 0) cleanupFailures.push("transport");
    if (enabledByRun && adbRun(adb, serial, ["shell", "bmgr", "enable", "false"]).status !== 0) cleanupFailures.push("enabled");
    gate(cleanupFailures.length === 0, "ANDROID_BACKUP_MANAGER_CLEANUP_FAILED", "Local Backup Manager state could not be restored", {categories: cleanupFailures});
  }
};

const findExactApk = (projectRoot, matcher, code) => {
  const matches = walkFiles(path.join(projectRoot, "android"))
    .filter((candidate) => candidate.endsWith(".apk") && matcher(candidate));
  gate(matches.length === 1, code, "Exactly one disposable APK must match the expected output", {count: matches.length});
  return matches[0];
};

const readCrashBuffer = (adb, serial) => {
  const result = adbRun(adb, serial, ["logcat", "-b", "crash", "-d", "-v", "epoch", "-t", "2000"]);
  gate(result.status === 0, "ANDROID_FATAL_SCAN_UNAVAILABLE", "The bounded Android crash buffer could not be read");
  return result.stdout;
};

const runEmulator = ({projectRoot, requireBackup, sdk}) => {
  const state = ensureEmulator(sdk);
  const installed = [];
  const crashBaseline = readCrashBuffer(state.adb, state.serial);
  try {
    for (const name of [packageName, testPackageName, adversaryPackageName]) {
      gate(!packagePresent(state.adb, state.serial, name), "ANDROID_EMULATOR_PACKAGE_PREEXISTED", "A disposable test package already exists on the selected emulator");
    }
    const apks = [
      [packageName, findExactApk(projectRoot, (candidate) => /[/\\]app[/\\]build[/\\]outputs[/\\]apk[/\\]debug[/\\][^/\\]+-debug\.apk$/u.test(candidate), "ANDROID_DEBUG_APK_AMBIGUOUS")],
      [testPackageName, findExactApk(projectRoot, (candidate) => /[/\\]app[/\\]build[/\\]outputs[/\\]apk[/\\]androidTest[/\\]debug[/\\].*-androidTest\.apk$/u.test(candidate), "ANDROID_TEST_APK_AMBIGUOUS")],
      [adversaryPackageName, findExactApk(projectRoot, (candidate) => /[/\\]adversary[/\\]build[/\\]outputs[/\\]apk[/\\]debug[/\\].*-debug\.apk$/u.test(candidate), "ANDROID_ADVERSARY_APK_AMBIGUOUS")],
    ];
    for (const [name, apk] of apks) {
      const result = adbRun(state.adb, state.serial, ["install", "-t", apk]);
      gate(result.status === 0 && packagePresent(state.adb, state.serial, name), "ANDROID_TEST_APK_INSTALL_FAILED", "A disposable debug/test APK could not be installed");
      installed.push(name);
    }
    const apiResult = adbRun(state.adb, state.serial, ["shell", "getprop", "ro.build.version.sdk"]);
    const api = Number(apiResult.stdout.trim());
    gate(apiResult.status === 0 && Number.isSafeInteger(api), "ANDROID_EMULATOR_API_UNKNOWN", "The emulator API level could not be classified");
    const grantNotificationPermission = () => {
      if (api < 33) return;
      const permission = adbRun(state.adb, state.serial, ["shell", "pm", "grant", packageName, "android.permission.POST_NOTIFICATIONS"]);
      gate(permission.status === 0, "ANDROID_NOTIFICATION_PERMISSION_SETUP_FAILED", "The disposable notification permission could not be granted");
    };
    grantNotificationPermission();
    const focusedInstrumentationMethods = [
      "trustedAnswerReceiverConsumesOnce",
      "trustedDeclineReceiverConsumesOnce",
      "foregroundNeutralWakeConsumesImmediatelyAndCannotReplay",
      "externalViewAndEmptyWarmIntentCannotManufactureAuthority",
      "unknownAndMalformedReceiverActionsFailClosed",
      "statusIsEmpty",
    ];
    const focusedInstrumentationResults = focusedInstrumentationMethods.map((method) => {
      gate(adbRun(state.adb, state.serial, ["shell", "pm", "clear", packageName]).status === 0, "ANDROID_INSTRUMENTATION_ISOLATION_FAILED", "The disposable target package could not be reset between focused instrumentation cases");
      grantNotificationPermission();
      return instrument(state.adb, state.serial, "com.chillywood.mobile.ChillyChatNativeActionOriginInstrumentationTest", method, 1);
    });
    const instrumentationResult = {
      count: focusedInstrumentationResults.reduce((sum, result) => sum + result.count, 0),
      outputSha256: digest(stable(focusedInstrumentationResults.map(({outputSha256}) => outputSha256))),
    };

    for (const action of ["answer", "decline"]) {
      gate(adbRun(state.adb, state.serial, ["shell", "pm", "clear", packageName]).status === 0, "ANDROID_EXTERNAL_ACTION_TEST_SETUP_FAILED", "The disposable package could not be cleared");
      const uri = `chillywoodmobile://chat/11111111-1111-4111-8111-111111111111?callInviteId=22222222-2222-4222-8222-222222222222&nativeCallAction=${action}`;
      const external = adbRun(state.adb, state.serial, ["shell", "am", "start", "-W", "-n", `${packageName}/com.chillywood.mobile.MainActivity`, "-a", "android.intent.action.VIEW", "-d", uri]);
      gate(external.status === 0, "ANDROID_EXTERNAL_ACTION_TEST_SETUP_FAILED", "The external Activity-origin test could not execute");
      instrument(state.adb, state.serial, "com.chillywood.mobile.ChillyChatNativeActionProbeInstrumentationTest", "statusIsEmptyWithoutClearingFirst", 1);
    }

    gate(adbRun(state.adb, state.serial, ["shell", "pm", "clear", packageName]).status === 0, "ANDROID_EXTERNAL_RECEIVER_TEST_SETUP_FAILED", "The disposable package could not be cleared");
    const shellBroadcast = adbRun(state.adb, state.serial, ["shell", "am", "broadcast", "--receiver-foreground", "-n", `${packageName}/com.chillywood.mobile.ChillyChatCallNotificationActionReceiver`, "-a", "com.chillywood.mobile.action.ANSWER_CHILLY_CHAT_CALL", "--es", "threadId", "11111111-1111-4111-8111-111111111111", "--es", "callInviteId", "22222222-2222-4222-8222-222222222222"]);
    gate(shellBroadcast.status === 0, "ANDROID_EXTERNAL_RECEIVER_TEST_SETUP_FAILED", "The exact external receiver action attempt could not execute");
    gate(adbRun(state.adb, state.serial, ["shell", "am", "wait-for-broadcast-idle"]).status === 0, "ANDROID_EXTERNAL_RECEIVER_TEST_SETUP_FAILED", "The external receiver attempt did not reach broadcast idle");
    instrument(state.adb, state.serial, "com.chillywood.mobile.ChillyChatNativeActionProbeInstrumentationTest", "statusIsEmptyWithoutClearingFirst", 1);

    const siblingAttempt = adbRun(state.adb, state.serial, ["shell", "am", "start", "-W", "-n", `${adversaryPackageName}/.ProbeActivity`]);
    gate(siblingAttempt.status === 0, "ANDROID_SIBLING_ORIGIN_TEST_SETUP_FAILED", "The sibling-package adversary could not execute");
    gate(adbRun(state.adb, state.serial, ["shell", "am", "wait-for-broadcast-idle"]).status === 0, "ANDROID_SIBLING_ORIGIN_TEST_SETUP_FAILED", "The sibling-package broadcast did not reach idle");
    instrument(state.adb, state.serial, "com.chillywood.mobile.ChillyChatNativeActionProbeInstrumentationTest", "statusIsEmptyWithoutClearingFirst", 1);

    const backupRestore = tryLocalBackupRestore(state);
    if (requireBackup) gate(backupRestore.status !== "BLOCKED_LOCAL_ANDROID_BACKUP_TRANSPORT", "BLOCKED_LOCAL_ANDROID_BACKUP_TRANSPORT", "No usable local Android backup transport was available within the bounded attempt");
    const crashAfter = readCrashBuffer(state.adb, state.serial);
    gate(crashAfter === crashBaseline || crashAfter.startsWith(crashBaseline), "ANDROID_FATAL_SCAN_INDETERMINATE", "The bounded crash buffer rotated during D2B execution");
    const crashDelta = crashAfter.slice(crashBaseline.length);
    const fatalMarkers = (crashDelta.match(/FATAL EXCEPTION|Fatal signal|SIGABRT|ReactNativeJS.*fatal|WebRTC.*fatal/giu) ?? []).length;
    gate(fatalMarkers === 0, "ANDROID_NATIVE_ACTION_PROCESS_FATAL", "A fatal process marker appeared during focused native-action execution");
    return {
      adversaryOriginsDenied: 4,
      apiClassification: `API_${api}`,
      backupRestore,
      fatalScan: "CLEAR",
      instrumentationTests: `${instrumentationResult.count}/6`,
      networkPermission: "OFFLINE_NETWORK_PERMISSION_DENIED",
      physicalDeviceProof: false,
      providerContact: false,
      serialRecorded: false,
      signedArtifactProof: false,
      status: backupRestore.status === "BLOCKED_LOCAL_ANDROID_BACKUP_TRANSPORT"
        ? "ANDROID_NATIVE_ACTION_EMULATOR_CLEAR_BACKUP_TRANSPORT_BLOCKED"
        : "ANDROID_NATIVE_ACTION_EMULATOR_AND_BACKUP_RESTORE_CLEAR",
    };
  } finally {
    const cleanupFailures = [];
    if (adbRun(state.adb, state.serial, ["shell", "am", "force-stop", packageName]).status !== 0) cleanupFailures.push("force_stop");
    for (const name of installed.reverse()) {
      if (adbRun(state.adb, state.serial, ["uninstall", name]).status !== 0) cleanupFailures.push(`uninstall_${name}`);
    }
    for (const name of [packageName, testPackageName, adversaryPackageName]) {
      if (packagePresent(state.adb, state.serial, name)) cleanupFailures.push(`present_${name}`);
    }
    if (state.started) {
      if (adbRun(state.adb, state.serial, ["emu", "kill"]).status !== 0) cleanupFailures.push("emulator_kill");
      if (state.emulatorProcess && !state.emulatorProcess.killed) state.emulatorProcess.kill();
      const deadline = Date.now() + 60 * 1000;
      while (Date.now() < deadline && connectedEmulators(state.adb).length > 0) sleep(1000);
      if (connectedEmulators(state.adb).length > 0) cleanupFailures.push("emulator_still_running");
    }
    gate(cleanupFailures.length === 0, "ANDROID_EMULATOR_PACKAGE_CLEANUP_FAILED", "Disposable Android cleanup could not be fully verified", {categories: cleanupFailures});
  }
};

const deterministicEvidenceHash = (evidence) => {
  const normalized = structuredClone(evidence);
  delete normalized.deterministicEvidenceSha256;
  for (const task of normalized.gradle?.tasks ?? []) delete task.durationMs;
  return digest(stable(normalized));
};

const runFocusedNegativeControls = () => {
  const dependencies = resolveDependencies();
  const result = run(process.execPath, [path.join(root, "scripts/test-chilly-chat-native-call-action-handoff.mjs")], {
    env: {...process.env, NODE_PATH: dependencies.modules},
  });
  const resultLine = result.stdout.split("\n").find((line) => line.startsWith("D2B_NEGATIVE_CONTROL_RESULT "));
  let matrix;
  try {
    matrix = JSON.parse(resultLine?.slice("D2B_NEGATIVE_CONTROL_RESULT ".length) ?? "null");
  } catch {
    matrix = null;
  }
  const mandatoryControlCodes = [
    "ANDROID_NATIVE_ACTION_LEGACY_BACKUP_EXCLUSION_MISSING",
    "ANDROID_NATIVE_ACTION_CLOUD_BACKUP_EXCLUSION_MISSING",
    "ANDROID_NATIVE_ACTION_DEVICE_TRANSFER_EXCLUSION_MISSING",
    "ANDROID_NATIVE_ANSWER_ACTIVITY_ORIGIN_UNSAFE",
    "ANDROID_NATIVE_ACTION_RECEIVER_EXPORTED",
    "ANDROID_NATIVE_ACTION_PENDING_INTENT_MUTABLE",
    "ANDROID_NATIVE_ACTION_ACTIVITY_ORIGIN_ACCEPTED",
    "ANDROID_NATIVE_ACTION_LINKING_ORIGIN_ACCEPTED",
    "ANDROID_NATIVE_ACTION_ROUTE_PROVENANCE_MISSING",
    "ANDROID_NATIVE_ACTION_PROVENANCE_REPLAY",
    "ANDROID_NATIVE_ACTION_PROVENANCE_PERSISTENCE_INVALID",
    "ANDROID_ACTION_PERSISTENCE_ORDER_INVALID",
    "ANDROID_RESTORED_NATIVE_ACTION_ACCEPTED",
    "ANDROID_NATIVE_SERVER_AUTHORITY_VIOLATION",
    "ANDROID_PREACCEPT_MEDIA_AUTHORITY_VIOLATION",
    "PLATFORM_PROOF_SCOPE_MISMATCH",
  ];
  const executed = Array.isArray(matrix?.executedControlCodes) ? matrix.executedControlCodes : [];
  const required = Array.isArray(matrix?.requiredControlCodes) ? matrix.requiredControlCodes : [];
  gate(
    result.status === 0
      && Number.isInteger(matrix?.passed)
      && matrix.passed === matrix.total
      && new Set(executed).size === matrix.total
      && mandatoryControlCodes.every((code) => executed.includes(code) && required.includes(code)),
    "ANDROID_NATIVE_ACTION_NEGATIVE_CONTROLS_INCOMPLETE",
    "The focused Android native-action negative controls did not execute their exact required matrix",
  );
  return {
    outputSha256: digest(result.stdout.trim()),
    controlSetSha256: digest(stable(executed)),
    passed: matrix.passed,
    required: mandatoryControlCodes.length,
    total: matrix.total,
  };
};

const runDisposableInspection = ({currentDigest, emulator = false, native = false, requireBackup = false}) => (
  generateThree((generated) => {
    gate(generated.generatedDigest === currentDigest, "ANDROID_GENERATED_NATIVE_DIGEST_REPLAY_MISMATCH", `The corrected contract digest ${currentDigest} differs from the three-replay source digest ${generated.generatedDigest}`);
    if (!native && !emulator) return {};
    const sdk = findAndroidSdk();
    const gradle = runGradle({...generated, sdk});
    const emulatorEvidence = emulator ? runEmulator({projectRoot: generated.projectRoot, requireBackup, sdk}) : null;
    return {emulator: emulatorEvidence, gradle};
  })
);

export const evaluateAndroidNativeActionOriginBackup = ({native = false, emulator = false, requireBackup = false} = {}) => {
  const releaseLock = acquireLock();
  let generated;
  let negativeControls;
  const generatedProjectStatusBefore = run("git", ["status", "--porcelain", "--", "android", "ios"]);
  gate(generatedProjectStatusBefore.status === 0, "GIT_READ_FAILED", "Unable to classify generated native paths before execution");
  try {
    negativeControls = runFocusedNegativeControls();
    gate(/^[0-9a-f]{64}$/u.test(correctedDigest), "ANDROID_GENERATED_NATIVE_DIGEST_REQUIRED", "The D2B contract must bind the separately proved corrected digest");
    gate(correctedDigest !== priorDigest, "ANDROID_BUILD_86_D2B_FIX_NOT_BOUND", "Corrected source unexpectedly matches the historical build-86 generated digest");
    generated = runDisposableInspection({currentDigest: correctedDigest, emulator, native, requireBackup});
  } finally {
    releaseLock();
  }
  const headResult = run("git", ["rev-parse", "HEAD"]);
  const treeResult = run("git", ["rev-parse", "HEAD^{tree}"]);
  gate(headResult.status === 0 && treeResult.status === 0, "GIT_READ_FAILED", "Unable to bind local source identity");
  const statusResult = run("git", ["status", "--porcelain"]);
  const generatedProjectStatusAfter = run("git", ["status", "--porcelain", "--", "android", "ios"]);
  gate(statusResult.status === 0, "GIT_READ_FAILED", "Unable to classify local source state");
  gate(generatedProjectStatusAfter.status === 0 && generatedProjectStatusAfter.stdout === generatedProjectStatusBefore.stdout, "ANDROID_GENERATED_PROJECT_ENTERED_WORKTREE", "Disposable generation changed a repository Android or iOS path");
  const clean = statusResult.stdout.trim().length === 0;
  const sourceBinding = clean ? "EXACT_CLEAN_HEAD_TREE" : "PROVISIONAL_DIRTY_WORKTREE_NOT_FREEZE_EVIDENCE";
  const emulatorStatus = generated.inspection?.emulator?.status;
  const executionStatus = emulator
    ? emulatorStatus
    : native
      ? "ANDROID_NATIVE_COMPILE_CLEAR"
      : "ANDROID_GENERATED_NATIVE_SOURCE_CLEAR";
  const evidence = {
    schemaVersion: 1,
    evidenceId: "android-native-call-origin-backup-evidence-v1",
    implementationHead: headResult.stdout.trim(),
    implementationTree: treeResult.stdout.trim(),
    targetId,
    generation: {currentDigest: generated.correctedDigest, fileCount: generated.fileCount, oldBuild86Digest: priorDigest, runs: generated.runs, securityRuns: generated.securityRuns, status: "ANDROID_BUILD_86_LACKS_D2B_NATIVE_FIX"},
    security: generated.security,
    gradle: generated.inspection?.gradle ?? {status: "NOT_RUN"},
    emulator: generated.inspection?.emulator ?? {status: "NOT_RUN"},
    unitTests: generated.inspection?.gradle?.unitTests ?? {status: "NOT_RUN"},
    negativeControls,
    sourceBinding,
    cleanup: {debugAndTestApksRemoved: true, disposableProjectRemoved: true, generatedNativeWorktreeUnchanged: true, nativeLockReleased: !fs.existsSync(lockPath), serialRecorded: false},
    nonInterference: {databaseMutation: "NOT_PERFORMED", ota: "NOT_PERFORMED", physicalDevice: "NOT_USED", providerContact: "NETWORK_PERMISSION_REMOVED_AND_OFFLINE_GENERATION", releaseBuild: "NOT_PERFORMED", signedArtifact: "NOT_CREATED"},
    delivery: {classification: "SOURCE_FIX_NOT_DELIVERED", newBinaryRequired: true, historicalBuild86: "ANDROID_BUILD_86_LACKS_D2B_NATIVE_FIX"},
    status: clean ? executionStatus : `PROVISIONAL_${executionStatus}`,
  };
  evidence.deterministicEvidenceSha256 = deterministicEvidenceHash(evidence);
  return evidence;
};

const parseArgs = (argv) => {
  const options = {json: false, native: false, emulator: false, requireBackup: false};
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
    else if (arg === "--generate") continue;
    else if (arg === "--native") options.native = true;
    else if (arg === "--emulator" || arg === "--backup-restore") {
      options.native = true;
      options.emulator = true;
      if (arg === "--backup-restore") options.requireBackup = true;
    } else throw new GateError("UNKNOWN_FLAG", `Unknown flag ${arg}`);
  }
  return options;
};

const main = () => {
  const json = process.argv.includes("--json");
  try {
    const options = parseArgs(process.argv.slice(2));
    const evidence = evaluateAndroidNativeActionOriginBackup(options);
    if (options.json) process.stdout.write(`${JSON.stringify({ok: true, evidence})}\n`);
    else console.log(`Android native action origin/backup: PASS — ${evidence.status}; generation 3/3; negative controls ${evidence.negativeControls.passed}/${evidence.negativeControls.total}`);
  } catch (error) {
    const finding = {code: error.code ?? "UNCLASSIFIED_FAILURE", message: error.message};
    if (json) process.stdout.write(`${JSON.stringify({ok: false, findings: [finding]})}\n`);
    else console.error(`Android native action origin/backup: FAIL — ${finding.code}: ${finding.message}`);
    process.exitCode = 1;
  }
};

if (path.basename(process.argv[1] ?? "") === "android-native-call-origin-backup.mjs") main();
