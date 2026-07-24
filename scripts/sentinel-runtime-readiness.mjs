#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const configPath = path.join(root, "config/intelligence/sentinel-installed-runner.config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const NEW_BINARY_OR_OTA_REQUIRED = config.newBinaryOrOtaRequiredStatus;

const args = new Set(process.argv.slice(2));
const writeArtifact = args.has("--write-artifact");
const markdown = args.has("--markdown");

const commandTimeoutMs = 10_000;

function hashId(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function run(command, commandArgs = [], timeout = commandTimeoutMs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
    error: result.error?.code || result.error?.message || "",
  };
}

function commandAvailable(command) {
  const result = run("which", [command], 3_000);
  return result.ok && result.stdout.trim().length > 0;
}

function status(pass, fallback = "blocked") {
  return pass ? "pass" : fallback;
}

function parseAndroidDevices() {
  if (!commandAvailable("adb")) return { adbAvailable: false, online: [] };
  const devices = run("adb", ["devices"]);
  if (!devices.ok) return { adbAvailable: true, online: [], error: "adb_devices_failed" };
  const online = devices.stdout
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === "device")
    .map(([serial]) => serial);
  return { adbAvailable: true, online };
}

function parseAndroidPackage(serial) {
  const target = config.installedTargets.android;
  const dump = run("adb", ["-s", serial, "shell", "dumpsys", "package", target.packageId]);
  if (!dump.ok || !dump.stdout.includes(target.packageId)) {
    return { installed: false, status: "blocked", blocker: "android_package_not_found" };
  }
  const versionName = dump.stdout.match(/versionName=([^\s]+)/)?.[1] ?? "";
  const versionCode = dump.stdout.match(/versionCode=(\d+)/)?.[1] ?? "";
  const installer = dump.stdout.match(/installerPackageName=([^\s]+)/)?.[1] ?? "";
  return {
    installed: true,
    packageId: target.packageId,
    versionName,
    versionCode,
    installer,
    versionMatchesExpected: versionName === target.expectedVersionName,
    buildMatchesExpected: versionCode === target.expectedNativeBuild,
    installerMatchesExpected: installer === target.requiredInstaller,
  };
}

function androidCapability(serial, executableName) {
  const result = run("adb", ["-s", serial, "shell", "command", "-v", executableName]);
  return result.ok && result.stdout.trim().length > 0;
}

function parseLogcatCapability(serial) {
  const result = run("adb", ["-s", serial, "logcat", "-g"]);
  return {
    available: result.ok && /ring buffer/u.test(result.stdout),
    rawLogCaptured: false,
  };
}

function readAndroid() {
  const devices = parseAndroidDevices();
  const summaries = devices.online.map((serial) => {
    const packageReadback = parseAndroidPackage(serial);
    return {
      deviceHash: hashId(serial),
      packageReadback,
      screenshotCaptureAvailable: androidCapability(serial, "screencap"),
      uiAutomationAvailable: androidCapability(serial, "uiautomator"),
      logCaptureAvailable: parseLogcatCapability(serial).available,
    };
  });
  const matching = summaries.find((entry) =>
    entry.packageReadback.installed
      && entry.packageReadback.versionMatchesExpected
      && entry.packageReadback.buildMatchesExpected
      && entry.packageReadback.installerMatchesExpected
  );
  return {
    status: status(Boolean(matching)),
    adbAvailable: devices.adbAvailable,
    onlineDeviceCount: devices.online.length,
    devices: summaries,
    canaryRuntimeChannelStatus: matching ? "blocked" : "blocked",
    canaryRuntimeChannelBlocker: NEW_BINARY_OR_OTA_REQUIRED,
    notes: matching
      ? [
          "Google Play-installed Android internal build is present.",
          "Installed package readback does not expose current Expo update id/runtime/channel; canary proof needs installed diagnostics.",
        ]
      : ["No connected Android device proved the expected Play-internal build."],
  };
}

function plistBuddy(plistPath, key) {
  const result = run("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plistPath]);
  return result.ok ? result.stdout.trim() : "";
}

function readIos() {
  const xcrunAvailable = commandAvailable("xcrun");
  if (!xcrunAvailable) {
    return {
      status: "blocked",
      xcrunAvailable: false,
      simulatorCount: 0,
      bootedSimulatorCount: 0,
      notes: ["xcrun unavailable on this host."],
    };
  }

  let simulatorCount = 0;
  let booted = [];
  const list = run("xcrun", ["simctl", "list", "devices", "available", "-j"]);
  if (list.ok) {
    try {
      const parsed = JSON.parse(list.stdout);
      const all = Object.values(parsed.devices ?? {}).flat();
      simulatorCount = all.length;
      booted = all.filter((device) => device?.state === "Booted");
    } catch {
      simulatorCount = 0;
      booted = [];
    }
  }

  const target = config.installedTargets.ios;
  const container = run("xcrun", ["simctl", "get_app_container", "booted", target.bundleIdentifier, "app"]);
  let installedApp = null;
  if (container.ok) {
    const appPath = container.stdout.trim();
    const infoPlist = path.join(appPath, "Info.plist");
    const expoPlist = path.join(appPath, "Expo.plist");
    const versionName = fs.existsSync(infoPlist) ? plistBuddy(infoPlist, "CFBundleShortVersionString") : "";
    const build = fs.existsSync(infoPlist) ? plistBuddy(infoPlist, "CFBundleVersion") : "";
    const runtimeVersion = fs.existsSync(expoPlist) ? plistBuddy(expoPlist, "EXUpdatesRuntimeVersion") : "";
    const requestHeaders = fs.existsSync(expoPlist)
      ? run("/usr/bin/plutil", ["-extract", "EXUpdatesRequestHeaders.expo-channel-name", "raw", expoPlist])
      : { ok: false, stdout: "" };
    const channel = requestHeaders.ok ? requestHeaders.stdout.trim() : "";
    installedApp = {
      bundleIdentifier: target.bundleIdentifier,
      versionName,
      build,
      runtimeVersion,
      channel,
      versionMatchesExpected: versionName === target.expectedVersionName,
      buildMatchesInternalCandidate: build === target.expectedInternalBuild,
      runtimeMatchesInternalCandidate: runtimeVersion === target.expectedRuntimeVersion,
      channelMatchesInternalCandidate: channel === target.expectedChannel,
    };
  }

  const internalCandidateReady = Boolean(
    installedApp
      && installedApp.versionMatchesExpected
      && installedApp.buildMatchesInternalCandidate
      && installedApp.runtimeMatchesInternalCandidate
      && installedApp.channelMatchesInternalCandidate,
  );

  return {
    status: internalCandidateReady ? "pass" : "blocked",
    xcrunAvailable,
    simulatorCount,
    bootedSimulatorCount: booted.length,
    bootedSimulatorHashes: booted.map((device) => ({
      deviceHash: hashId(device.udid),
      deviceTypeIdentifier: device.deviceTypeIdentifier,
      state: device.state,
    })),
    installedApp,
    screenshotCaptureAvailable: booted.length > 0,
    uiAutomationAvailable: commandAvailable("maestro") && booted.length > 0,
    logCaptureAvailable: booted.length > 0,
    canaryRuntimeChannelStatus: internalCandidateReady ? "pass" : "blocked",
    canaryRuntimeChannelBlocker: internalCandidateReady ? null : NEW_BINARY_OR_OTA_REQUIRED,
    notes: internalCandidateReady
      ? ["Booted iOS simulator has the expected internal canary runtime/channel."]
      : ["Booted iOS simulator is not the expected ios-qa internal canary candidate."],
  };
}

function evaluateCanaryReadiness(android, ios) {
  const hasAndroidDevice = android.status === "pass";
  const hasIosCandidate = ios.status === "pass";
  const hasTwoLiveKitParticipants = false;
  const syntheticAccountsApproved = false;
  const providerReadOnlyTelemetry = false;
  return {
    approvedSyntheticAccounts: {
      status: syntheticAccountsApproved ? "pass" : "blocked",
      blocker: "approved_synthetic_fixture_not_available_locally",
    },
    twoLiveKitParticipants: {
      status: hasTwoLiveKitParticipants ? "pass" : "blocked",
      blocker: "two_distinct_approved_livekit_participants_required",
    },
    screenshotCapture: {
      status: (android.devices ?? []).some((device) => device.screenshotCaptureAvailable) || ios.screenshotCaptureAvailable ? "pass" : "blocked",
    },
    uiAutomation: {
      status: ((android.devices ?? []).some((device) => device.uiAutomationAvailable) || ios.uiAutomationAvailable) ? "pass" : "blocked",
    },
    logCapture: {
      status: ((android.devices ?? []).some((device) => device.logCaptureAvailable) || ios.logCaptureAvailable) ? "pass" : "blocked",
      rawLogsCaptured: false,
    },
    providerBackendReadOnlyTelemetry: {
      status: providerReadOnlyTelemetry ? "pass" : "blocked",
      blocker: "read_only_provider_backend_credentials_not_available_locally",
    },
    livekitExperienceCanary: {
      status: hasAndroidDevice && hasIosCandidate && hasTwoLiveKitParticipants ? "ready" : "blocked",
      blocker: NEW_BINARY_OR_OTA_REQUIRED,
    },
    visualExperienceCanary: {
      status: hasAndroidDevice || hasIosCandidate ? "ready_with_blockers" : "blocked",
      blocker: ios.status === "pass" || hasAndroidDevice ? "approved_baseline_and_sanitized_screenshot_metrics_required" : NEW_BINARY_OR_OTA_REQUIRED,
    },
    installedJourneyCanary: {
      status: hasAndroidDevice || hasIosCandidate ? "ready_with_blockers" : "blocked",
      blocker: syntheticAccountsApproved ? "sanitized_journey_evidence_required" : "approved_synthetic_fixture_not_available_locally",
    },
  };
}

const android = readAndroid();
const ios = readIos();
const canaryReadiness = evaluateCanaryReadiness(android, ios);

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "sentinel-runtime-readiness-read-only",
  mutationState: {
    built: false,
    otaPublished: false,
    deployed: false,
    providerProductsChanged: false,
    releaseTrackChanged: false,
    installedOrSideloaded: false,
    rawLogsCaptured: false,
    rawScreenshotsCaptured: false,
  },
  configKey: config.configKey,
  android,
  ios,
  canaryReadiness,
};

if (writeArtifact) {
  const artifactDir = path.join(root, "artifacts/sentinel-runtime-readiness");
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, "readiness-report.json"), `${JSON.stringify(report, null, 2)}\n`);
}

if (markdown) {
  const lines = [
    "# Sentinel Runtime Readiness Inventory",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `- Android internal build: ${android.status}`,
    `- iOS internal/simulator build: ${ios.status}`,
    `- Runtime/channel proof blocker: ${android.canaryRuntimeChannelBlocker || ios.canaryRuntimeChannelBlocker || "none"}`,
    `- Approved synthetic accounts: ${canaryReadiness.approvedSyntheticAccounts.status}`,
    `- Two LiveKit participants: ${canaryReadiness.twoLiveKitParticipants.status}`,
    `- Screenshot capture: ${canaryReadiness.screenshotCapture.status}`,
    `- UI automation: ${canaryReadiness.uiAutomation.status}`,
    `- Log capture: ${canaryReadiness.logCapture.status}`,
    `- Provider/backend telemetry: ${canaryReadiness.providerBackendReadOnlyTelemetry.status}`,
  ];
  console.log(lines.join("\n"));
} else {
  console.log(JSON.stringify(report, null, 2));
}
