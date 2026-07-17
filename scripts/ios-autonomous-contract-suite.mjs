#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  classifyIosInstalledQaReadiness,
  classifyIosObservabilityAutonomy,
  classifyIosReleaseAutonomy,
  classifyNotificationAutonomy,
  IOS_QA_RELEASE_EXPECTATION,
  sanitizeAutonomousReadback,
} from "../supabase/functions/_shared/ios-autonomous-operator-policy.mjs";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const mode = process.argv[2] ?? "coverage";
const kind = process.argv[3] ?? "test";
let assertions = 0;
const check = (condition, message) => {
  assertions += 1;
  assert.ok(condition, message);
};

const runCallRetry = () => {
  const registry = read("_lib/autonomousSystemsRegistry.ts");
  const worker = read("supabase/functions/chilly-chat-call-transition-retry/index.ts");
  const migration = read("supabase/migrations/20260718113000_durable_call_delivery_retry_and_storefront_prices.sql");
  const schedule = `${migration}\n${read("supabase/migrations/20260718114500_enable_chat_call_transition_retry_scheduler.sql")}`;
  check(registry.includes('id: "ios_terminal_call_delivery_retry"'), "terminal retry surface must be registered");
  check(registry.includes("raw token reads or output"), "registry must forbid raw token output");
  check(worker.includes("batchSize") && worker.includes(", 10)"), "worker must cap batch size");
  check(migration.includes('"attempt_count" < 10'), "claims must stop at maximum attempts");
  check(migration.includes("2 ^ least") && migration.includes("interval '2 minutes'"), "failed backoff and stale lease recovery required");
  check(migration.includes("delivery_result") && migration.includes("raw_payload"), "delivery result must be sanitized");
  check(migration.includes("skip locked"), "claims must be concurrency safe");
  check(schedule.includes("* * * * *"), "scheduler must run every minute");
  check(schedule.includes("vault.decrypted_secrets"), "scheduler credential must come from Vault");
  check(!schedule.includes("service_role_key"), "scheduled request must not contain service-role key");
  check(!worker.includes("action: \"incoming\""), "retry worker must not create incoming calls");
  check(worker.includes("complete_chilly_chat_call_transition_delivery"), "worker must finalize idempotent delivery rows without a mobile client");
};

const runNotification = () => {
  const healthyExpo = classifyNotificationAutonomy({ readbackComplete: true, providerConfigured: true, rolloutEnabled: true, activeTokenCount: 1, attemptCount: 10, successfulAttemptCount: 10, failedAttemptCount: 0 });
  check(healthyExpo.healthState === "delivery_evidence_healthy", "healthy iOS Expo fixture");
  check(classifyNotificationAutonomy({ readbackComplete: true, attemptCount: 10, failedAttemptCount: 3 }).healthState === "degraded", "degraded Expo receipts fixture");
  check(classifyNotificationAutonomy({ readbackComplete: true, attemptCount: 1, invalidTokenCount: 1 }).finding === "invalid_token_evidence", "invalid iOS token fixture");
  check(classifyNotificationAutonomy({ readbackComplete: true, providerConfigured: true, rolloutEnabled: true, activeTokenCount: 1, attemptCount: 1, successfulAttemptCount: 1 }).healthState === "delivery_evidence_healthy", "healthy APNs VoIP fixture");
  check(classifyNotificationAutonomy({ readbackComplete: true, attemptCount: 1, failedAttemptCount: 1 }).healthState === "degraded", "failed APNs VoIP fixture");
  check(classifyNotificationAutonomy({ readbackComplete: true, retryBacklog: 2 }).finding === "delivery_recovery_pending", "terminal retry backlog fixture");
  check(classifyNotificationAutonomy({ readbackComplete: true, cappedAttemptCount: 1 }).healthState === "critical", "capped retry fixture");
  check(classifyNotificationAutonomy({ readbackComplete: false }).healthState === "unknown", "missing readback cannot be healthy");
  check(healthyExpo.readbackComplete === true, "Android parity uses same complete-readback rule");
  const probe = read("supabase/functions/notification-operator/probe.ts");
  for (const rail of ['platform: "ios", provider: "expo"', 'platform: "android", provider: "expo"', 'platform: "android", provider: "fcm"', 'provider: "voip_apns"', 'provider: "terminal_call_retry"']) {
    check(probe.includes(rail), `notification probe missing rail ${rail}`);
  }
  check(!probe.includes('.select("token,'), "notification probe must not select raw tokens");
  check(probe.includes("DeviceNotRegistered") && probe.includes("Unregistered"), "invalid token evidence must be classified");
  check(probe.includes("broadPushSent: false"), "watch_once must never send broad push");
};

const releaseInput = (overrides = {}) => ({
  eas: { readbackComplete: true },
  appStoreConnect: { readbackComplete: true, externalGroupCount: 0, publicSubmissionPresent: false, publicReleasePresent: false },
  release: { ...IOS_QA_RELEASE_EXPECTATION, rollbackTargetAvailable: true, embeddedLaunch: false, emergencyLaunch: false, sourceChangedAfterBuild: false, ...overrides },
});
const runRelease = () => {
  check(classifyIosReleaseAutonomy(releaseInput()).healthState === "healthy", "correct build 8 fixture");
  check(classifyIosReleaseAutonomy(releaseInput({ channel: "production" })).reasons.includes("channel_mismatch"), "wrong channel fixture");
  check(classifyIosReleaseAutonomy(releaseInput({ runtimeVersion: "1.0.0" })).reasons.includes("runtimeVersion_mismatch"), "wrong runtime fixture");
  check(classifyIosReleaseAutonomy(releaseInput({ sourceCommit: "stale" })).reasons.includes("sourceCommit_mismatch"), "stale source fixture");
  const external = releaseInput(); external.appStoreConnect.externalGroupCount = 1;
  check(classifyIosReleaseAutonomy(external).healthState === "critical", "unexpected external group fixture");
  const submission = releaseInput(); submission.appStoreConnect.publicSubmissionPresent = true;
  check(classifyIosReleaseAutonomy(submission).reasons.includes("public_submission_present"), "unexpected public submission fixture");
  const unavailable = releaseInput(); unavailable.eas.readbackComplete = false;
  check(classifyIosReleaseAutonomy(unavailable).healthState === "blocked", "provider unavailable fixture");
  check(classifyIosReleaseAutonomy(releaseInput({ embeddedLaunch: true })).reasons.includes("embedded_launch"), "embedded launch fixture");
  const androidExpected = { ...IOS_QA_RELEASE_EXPECTATION, platform: "android" };
  check(classifyIosReleaseAutonomy({ ...releaseInput(), release: { ...releaseInput().release, platform: "android" } }, androidExpected).healthState === "healthy", "Android release parity fixture");
  const adapter = read("scripts/ios-release-provider-readback.mjs");
  const probe = read("supabase/functions/release-operator/probe.ts");
  check(adapter.includes("build:list") && adapter.includes("channel:view"), "release adapter must independently read EAS");
  check(adapter.includes("api.appstoreconnect.apple.com"), "release adapter must independently read App Store Connect");
  check(adapter.includes("local_ios_build_absent_from_eas_cloud_build_history"), "local build must not be invented in EAS cloud history");
  check(adapter.includes(`/builds/\${attestedBuild.id}/betaGroups`) && adapter.includes(`/builds/\${attestedBuild.id}/individualTesters`), "App Store readback must inspect exact attested-build assignments");
  check(!adapter.includes("build?.channel ?? IOS_QA_RELEASE_EXPECTATION.channel"), "missing EAS channel must not default to expected");
  check(!adapter.includes("build?.runtimeVersion ?? IOS_QA_RELEASE_EXPECTATION.runtimeVersion"), "missing EAS runtime must not default to expected");
  check(!adapter.includes("artifact.url"), "release adapter must not output signed artifact URL");
  check(probe.includes("provider_readback_unavailable") || probe.includes("providerReadbackUnavailable"), "provider failure must be explicit");
  for (const forbidden of ["eas update", "update:rollback", "submit", "change TestFlight"]) check(!probe.includes(forbidden), `release probe cannot execute ${forbidden}`);
};

const providers = (missing = null) => Object.fromEntries(["crashlytics", "firebasePerformance", "firebaseAnalytics", "supabaseEdgeFunctions", "releaseDiagnostics", "livekitClientTelemetry"].map((name) => [name, { readbackComplete: name !== missing }]));
const runObservability = () => {
  check(classifyIosObservabilityAutonomy({ providers: providers() }).healthState === "healthy", "healthy iOS build fixture");
  check(classifyIosObservabilityAutonomy({ providers: providers(), nativeCrashCount: 1 }).healthState === "critical", "native crash cluster fixture");
  check(classifyIosObservabilityAutonomy({ providers: providers(), jsFatalCount: 1 }).findings.includes("javascript_fatal_cluster"), "JS fatal cluster fixture");
  check(classifyIosObservabilityAutonomy({ providers: providers(), startupFailureCount: 1 }).findings.includes("startup_failure"), "startup regression fixture");
  check(classifyIosObservabilityAutonomy({ providers: providers(), performanceRegressionCount: 1 }).findings.includes("performance_regression"), "performance regression fixture");
  check(classifyIosObservabilityAutonomy({ providers: providers("firebaseAnalytics") }).healthState !== "healthy", "analytics provider unavailable fixture");
  check(classifyIosObservabilityAutonomy({ providers: providers(), backendErrorRatePercent: 6 }).findings.includes("backend_error_rate_spike"), "backend spike fixture");
  check(classifyIosObservabilityAutonomy({ providers: providers(), runtimeMismatch: true }).findings.includes("runtime_channel_update_mismatch"), "wrong runtime/channel fixture");
  check(classifyIosObservabilityAutonomy({ providers: providers() }).readbackComplete === true, "Android uses same observability completion rule");
  const probe = read("supabase/functions/observability-operator/probe.ts");
  for (const source of ["release_health_snapshots", "livekit_surface_health_snapshots", "autonomous_provider_readback_capabilities"]) check(probe.includes(source), `observability query missing ${source}`);
  check(probe.includes("provider_unavailable"), "missing provider access must be recorded");
};

const readyInstalled = (overrides = {}) => ({
  providerReadbackComplete: true,
  release: {
    internalBuildAvailable: true,
    runtimeVersion: IOS_QA_RELEASE_EXPECTATION.runtimeVersion,
    channel: IOS_QA_RELEASE_EXPECTATION.channel,
    sourceCommit: IOS_QA_RELEASE_EXPECTATION.sourceCommit,
    bundleIdentifier: IOS_QA_RELEASE_EXPECTATION.bundleIdentifier,
    nativeBuild: IOS_QA_RELEASE_EXPECTATION.nativeBuild,
    externalGroupCount: 0,
    publicSubmissionPresent: false,
    ...overrides,
  },
  clientCapabilities: IOS_QA_RELEASE_EXPECTATION.clientCapabilities,
  physicalEvidenceAvailable: false,
  availablePhysicalDeviceCount: 0,
});
const runInstalled = () => {
  const current = classifyIosInstalledQaReadiness(readyInstalled());
  check(current.sourceReady === true && current.readinessState === "physical_proof_required", "correct internal build 8 stays physical-proof-required");
  check(classifyIosInstalledQaReadiness(readyInstalled({ runtimeVersion: "wrong" })).blockers.includes("ios_runtime_mismatch"), "wrong runtime fixture");
  check(classifyIosInstalledQaReadiness(readyInstalled({ channel: "production" })).blockers.includes("ios_channel_mismatch"), "wrong channel fixture");
  check(classifyIosInstalledQaReadiness(readyInstalled({ sourceCommit: "wrong" })).blockers.includes("ios_source_commit_mismatch"), "wrong source fixture");
  check(classifyIosInstalledQaReadiness(readyInstalled({ internalBuildAvailable: false })).blockers.includes("ios_testflight_build_unavailable"), "no TestFlight build fixture");
  check(classifyIosInstalledQaReadiness(readyInstalled({ externalGroupCount: 1 })).blockers.includes("ios_provider_readback_blocked"), "external TestFlight fixture");
  check(current.blockers.includes("ios_physical_proof_required"), "physical proof missing fixture");
  check(current.blockers.includes("ios_second_device_required"), "second device missing fixture");
  check(current.fakePhysicalProof === false, "operator never fabricates device proof");
  const fn = read("supabase/functions/installed-product-qa-operator/index.ts");
  for (const source of ["testflight_internal", "physical_ios", "ios_simulator", "eas_internal_ios", "app_store_internal", "play_installed"]) check(fn.includes(`"${source}"`), `proof source missing ${source}`);
  check(!fn.includes("CURRENT_MANUAL_FINDINGS"), "watch_once cannot replay hardcoded findings");
  check(fn.includes("release_health_snapshots"), "watch_once must derive from release readback");
};

const runCoverage = () => {
  const registry = read("_lib/autonomousSystemsRegistry.ts");
  const migration = read("supabase/migrations/20260718123000_ios_autonomous_platform_contract.sql");
  const shared = read("supabase/functions/_shared/scoped-operator.ts");
  const active = ["media_automation", "livekit_operator", "money_flow_control", "notification_delivery_operator", "release_ota_operator", "security_owner_operator", "moderation_safety_operator", "observability_runtime_operator", "installed_product_qa_operator", "platform_recovery_operator", "privacy_compliance_operator", "support_success_operator", "search_ranking_integrity_operator", "owner_command_operator"];
  for (const id of active) {
    const start = registry.indexOf(`id: "${id}"`);
    const block = registry.slice(start, registry.indexOf("\n  },", start));
    check(start >= 0 && block.includes("supportedPlatforms:"), `${id} lacks supportedPlatforms`);
    check(block.includes('"shared"'), `${id} must preserve shared/Android-compatible backend scope`);
  }
  for (const id of ["notification_delivery_operator", "release_ota_operator", "observability_runtime_operator", "installed_product_qa_operator", "livekit_operator", "money_flow_control", "security_owner_operator", "platform_recovery_operator", "privacy_compliance_operator", "support_success_operator", "owner_command_operator"]) {
    const adapterStart = registry.indexOf(`systemId: "${id}"`);
    check(adapterStart >= 0 && registry.slice(adapterStart, adapterStart + 500).includes('platform: "ios"'), `${id} lacks explicit iOS adapter`);
  }
  check(registry.includes('id: "ads_sponsor_delivery_operator"') && registry.includes('activeActivationMode: "off"'), "ads must remain foundation-only off");
  check(migration.includes("platform in ('shared', 'ios', 'android', 'web', 'unknown')"), "database platform constraint missing");
  check(migration.includes("revoke all on table public.autonomous_provider_readback_capabilities from public, anon, authenticated"), "client write denial missing");
  check(shared.includes("watchOnceHandler?") && shared.includes("readbackComplete"), "shared custom handler envelope missing");
  check(shared.includes('health_state: "unknown"'), "generic missing readback cannot become healthy");
  check(read("supabase/functions/notification-operator/index.ts").includes("runNotificationAutonomyProbe"), "notification custom readback missing");
  check(read("supabase/functions/release-operator/index.ts").includes("runSharedReleaseProbe") && read("supabase/functions/release-operator/index.ts").includes("runAndroidReleaseAutonomyProbe") && read("supabase/functions/release-operator/index.ts").includes("runIosReleaseAutonomyProbe"), "composed release readback missing");
  check(read("supabase/functions/observability-operator/index.ts").includes("runIosObservabilityProbe"), "observability custom readback missing");
  check(read("supabase/functions/installed-product-qa-operator/index.ts").includes("classifyIosInstalledQaReadiness"), "installed iOS adapter missing");
  check(read("supabase/functions/livekit-operator/index.ts").includes("authenticated_client_render_telemetry"), "LiveKit platform telemetry missing");
  check(read("supabase/functions/money-operator/index.ts").includes("revenuecat_app_store"), "iOS money provider readback missing");
  const privacySource = read("supabase/functions/_shared/ios-source-operator-probes.ts");
  const privacyManifestHash = createHash("sha256").update(read("config/ios/privacy-manifest.json")).digest("hex");
  check(
    privacySource.includes(`privacyManifestSourceHashSha256: "${privacyManifestHash}"`),
    "compiled privacy source hash must match config/ios/privacy-manifest.json",
  );
  const sourceCorpus = [registry, migration, read("supabase/functions/notification-operator/probe.ts"), read("supabase/functions/release-operator/probe.ts"), read("supabase/functions/observability-operator/probe.ts")].join("\n");
  check(!/(AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(sourceCorpus), "provider secret material appears in autonomy source");
  check(sanitizeAutonomousReadback({ token: "hidden", safe: "ok" }).token === undefined, "recursive sanitizer must remove token keys");
};

if (mode === "call-retry") runCallRetry();
else if (mode === "notification") runNotification();
else if (mode === "release") runRelease();
else if (mode === "observability") runObservability();
else if (mode === "installed") runInstalled();
else if (mode === "coverage") runCoverage();
else throw new Error(`unknown suite: ${mode}`);

process.stdout.write(`${JSON.stringify({ ok: true, suite: mode, kind, assertions, platform: "ios", moneyMoved: false, userRightsChanged: false, highRiskExecuted: false })}\n`);
