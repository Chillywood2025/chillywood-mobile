#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const configPath = path.join(root, "config/intelligence/sentinel-installed-runner.config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const NEW_BINARY_OR_OTA_REQUIRED = config.newBinaryOrOtaRequiredStatus;
const NO_ARTIFACT_CHANGE_REQUIRED = "NO_ARTIFACT_CHANGE_REQUIRED";
const INTERNAL_QA_OTA_REQUIRED = "INTERNAL_QA_OTA_REQUIRED";
const INTERNAL_QA_BINARY_REQUIRED = "INTERNAL_QA_BINARY_REQUIRED";

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

function readAndroidSourceCapabilities() {
  const manifestPath = path.join(root, "config/release/android-production.json");
  if (!fs.existsSync(manifestPath)) {
    return {
      releaseManifestMatchesTarget: false,
      diagnosticsAtRecordedSource: false,
      liveKitTelemetryAtRecordedSource: false,
    };
  }

  let manifest = {};
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return {
      releaseManifestMatchesTarget: false,
      diagnosticsAtRecordedSource: false,
      liveKitTelemetryAtRecordedSource: false,
    };
  }

  const target = config.installedTargets.android;
  const sourceCommit = String(manifest.expectedBinarySourceCommit ?? "").trim();
  const settingsAtSource = sourceCommit
    ? run("git", ["show", `${sourceCommit}:app/settings.tsx`])
    : { ok: false, stdout: "" };
  const liveKitAtSource = sourceCommit
    ? run("git", [
        "grep",
        "-F",
        "--name-only",
        "emitLiveKitRenderTelemetryEvent",
        sourceCommit,
        "--",
        "app",
        "components",
        "_lib",
      ])
    : { ok: false, stdout: "" };
  const requiredDiagnosticMarkers = [
    "release-diagnostics-runtime-version",
    "release-diagnostics-channel",
    "release-diagnostics-update-id",
  ];

  return {
    releaseManifestMatchesTarget:
      String(manifest.packageIdentifier ?? "") === target.packageId
      && String(manifest.nativeBuild ?? "") === target.expectedNativeBuild
      && String(manifest.runtimeVersion ?? "") === target.expectedRuntimeVersion
      && String(manifest.channel ?? "") === target.expectedChannel
      && String(manifest.distributionSource ?? "") === target.requiredDistributionSource,
    recordedSourceCommitPresent: Boolean(sourceCommit && settingsAtSource.ok),
    diagnosticsAtRecordedSource:
      settingsAtSource.ok
      && requiredDiagnosticMarkers.every((marker) => settingsAtSource.stdout.includes(marker)),
    liveKitTelemetryAtRecordedSource: liveKitAtSource.ok && liveKitAtSource.stdout.trim().length > 0,
  };
}

function readAndroid() {
  const devices = parseAndroidDevices();
  const sourceCapabilities = readAndroidSourceCapabilities();
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
  const matchingHasObservationCapabilities = Boolean(
    matching
      && matching.screenshotCaptureAvailable
      && matching.uiAutomationAvailable
      && matching.logCaptureAvailable,
  );
  const installedDiagnosticsAvailable = Boolean(
    matching
      && sourceCapabilities.releaseManifestMatchesTarget
      && sourceCapabilities.diagnosticsAtRecordedSource,
  );
  const sentinelObservationAvailable = Boolean(
    matchingHasObservationCapabilities
      && installedDiagnosticsAvailable
      && sourceCapabilities.liveKitTelemetryAtRecordedSource,
  );
  const artifactDecision = sentinelObservationAvailable
    ? NO_ARTIFACT_CHANGE_REQUIRED
    : INTERNAL_QA_BINARY_REQUIRED;
  return {
    status: status(Boolean(matching)),
    adbAvailable: devices.adbAvailable,
    onlineDeviceCount: devices.online.length,
    devices: summaries,
    sourceCapabilities,
    canaryRuntimeChannelStatus: installedDiagnosticsAvailable
      ? "available_from_installed_diagnostics_unobserved"
      : "blocked",
    canaryRuntimeChannelBlocker: installedDiagnosticsAvailable ? null : NEW_BINARY_OR_OTA_REQUIRED,
    artifactDecision,
    artifactDecisionReason: artifactDecision === NO_ARTIFACT_CHANGE_REQUIRED
      ? "play_internal_build_has_external_observation_and_installed_release_diagnostics"
      : "matching_play_internal_binary_or_required_installed_diagnostics_unavailable",
    otaDecisionReason: artifactDecision === NO_ARTIFACT_CHANGE_REQUIRED
      ? "no_js_instrumentation_gap_proved"
      : "production_channel_is_not_an_internal_qa_only_ota_target",
    notes: sentinelObservationAvailable
      ? [
          "Google Play-installed Android internal build is present.",
          "The recorded binary source contains installed runtime/channel/update diagnostics and LiveKit render telemetry.",
          "A synthetic-account traversal must still read the active values; source capability is not installed canary proof.",
        ]
      : [
          "The current environment did not prove a matching Play-internal binary with all required observation capabilities.",
        ],
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
      screenshotCaptureAvailable: false,
      uiAutomationAvailable: false,
      logCaptureAvailable: false,
      canaryRuntimeChannelStatus: "blocked",
      canaryRuntimeChannelBlocker: NEW_BINARY_OR_OTA_REQUIRED,
      artifactDecision: INTERNAL_QA_BINARY_REQUIRED,
      artifactDecisionReason: "ios_internal_candidate_cannot_be_verified_on_this_host",
      otaDecisionReason: "runtime_and_channel_compatibility_unverified",
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
  const artifactDecision = internalCandidateReady
    ? NO_ARTIFACT_CHANGE_REQUIRED
    : INTERNAL_QA_BINARY_REQUIRED;

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
    artifactDecision,
    artifactDecisionReason: internalCandidateReady
      ? "installed_internal_candidate_matches_build_runtime_and_channel"
      : installedApp
        ? "installed_development_candidate_cannot_receive_ios_qa_runtime"
        : "expected_ios_internal_candidate_not_installed",
    otaDecisionReason: internalCandidateReady
      ? "no_js_instrumentation_gap_proved"
      : "runtime_and_channel_mismatch_is_not_ota_compatible",
    notes: internalCandidateReady
      ? ["Booted iOS simulator has the expected internal canary runtime/channel."]
      : [
          "Booted iOS simulator is not the expected ios-qa internal canary candidate.",
          "Reuse an already-approved matching internal binary if available; do not start a new build until that availability check fails.",
        ],
  };
}

function evaluateCanaryReadiness(android, ios) {
  const hasAndroidDevice = android.status === "pass"
    && android.artifactDecision === NO_ARTIFACT_CHANGE_REQUIRED;
  const hasIosCandidate = ios.status === "pass"
    && ios.artifactDecision === NO_ARTIFACT_CHANGE_REQUIRED;
  const hasInstalledTarget = hasAndroidDevice || hasIosCandidate;
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
      status: hasInstalledTarget && hasTwoLiveKitParticipants ? "ready" : "blocked",
      blocker: hasInstalledTarget
        ? "two_distinct_approved_livekit_participants_required"
        : NEW_BINARY_OR_OTA_REQUIRED,
    },
    visualExperienceCanary: {
      status: hasInstalledTarget ? "ready_with_blockers" : "blocked",
      blocker: hasInstalledTarget
        ? "approved_baseline_and_sanitized_screenshot_metrics_required"
        : NEW_BINARY_OR_OTA_REQUIRED,
    },
    installedJourneyCanary: {
      status: hasInstalledTarget ? "ready_with_blockers" : "blocked",
      blocker: !hasInstalledTarget
        ? NEW_BINARY_OR_OTA_REQUIRED
        : syntheticAccountsApproved
          ? "sanitized_journey_evidence_required"
          : "approved_synthetic_fixture_not_available_locally",
    },
    noArtifactInstalledCanarySubset: {
      status: hasInstalledTarget ? "blocked_on_non_artifact_prerequisites" : "blocked",
      platform: hasAndroidDevice ? "android" : hasIosCandidate ? "ios" : null,
      candidateCanaries: hasInstalledTarget
        ? ["livekit_experience", "visual_experience_metrics", "installed_journey"]
        : [],
      runnableNow: [],
      blockers: hasInstalledTarget
        ? [
            "approved_synthetic_fixture_not_available_locally",
            "two_distinct_approved_livekit_participants_required",
            "sanitized_installed_evidence_not_captured",
          ]
        : [NEW_BINARY_OR_OTA_REQUIRED],
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
    `- Android artifact decision: ${android.artifactDecision}`,
    `- iOS internal/simulator build: ${ios.status}`,
    `- iOS artifact decision: ${ios.artifactDecision}`,
    `- Android runtime/channel readback: ${android.canaryRuntimeChannelStatus}`,
    `- iOS runtime/channel readback: ${ios.canaryRuntimeChannelStatus}`,
    `- Approved synthetic accounts: ${canaryReadiness.approvedSyntheticAccounts.status}`,
    `- Two LiveKit participants: ${canaryReadiness.twoLiveKitParticipants.status}`,
    `- Screenshot capture: ${canaryReadiness.screenshotCapture.status}`,
    `- UI automation: ${canaryReadiness.uiAutomation.status}`,
    `- Log capture: ${canaryReadiness.logCapture.status}`,
    `- Provider/backend telemetry: ${canaryReadiness.providerBackendReadOnlyTelemetry.status}`,
    `- No-artifact installed canary subset: ${canaryReadiness.noArtifactInstalledCanarySubset.status}`,
  ];
  console.log(lines.join("\n"));
} else {
  console.log(JSON.stringify(report, null, 2));
}
