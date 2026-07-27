#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  classifyIosInstalledQaReadiness,
  classifyIosReleaseAutonomy,
  classifyNotificationAutonomy,
  IOS_QA_RELEASE_EXPECTATION,
  matchesIosBinaryAttestation,
  sanitizeAutonomousReadback,
} from "../supabase/functions/_shared/ios-autonomous-operator-policy.mjs";
import { isApnsInvalidVoipTokenReason } from "../supabase/functions/_shared/ios-voip-policy.mjs";
import { normalizeInstalledQaPlatform } from "../supabase/functions/_shared/installed-qa-platform-policy.mjs";
import { normalizeSanitizedObservabilityExport } from "./observability-sanitized-readback.mjs";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const mode = process.argv[2] ?? "all-platform";
const kind = process.argv[3] ?? "test";
let assertions = 0;
const check = (condition, message) => { assertions += 1; assert.ok(condition, message); };

const loadTypeScriptModule = (file, transform = (source) => source) => {
  const source = transform(read(file));
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier.startsWith("npm:@supabase/supabase-js")) return { createClient: () => ({}) };
    throw new Error(`unexpected_test_require:${specifier}`);
  };
  new Function("exports", "module", "require", output)(module.exports, module, localRequire);
  return module.exports;
};

const runScheduledAdapters = () => {
  const releaseTimer = read("ops/release-operator/systemd/chillywood-release-operator-watch-once.timer");
  const releaseService = read("ops/release-operator/systemd/chillywood-release-provider-readback.service");
  const releaseAdapter = read("scripts/all-platform-release-provider-readback.mjs");
  check(releaseTimer.includes("OnUnitActiveSec=30min") && releaseTimer.includes("Unit=chillywood-release-provider-readback.service"), "release adapter must execute at unchanged 30-minute cadence");
  check(releaseService.includes("all-platform-release-provider-readback.mjs --post"), "release systemd service must execute the provider adapter");
  check(releaseService.includes("NoNewPrivileges=true") && releaseService.includes("ProtectSystem=strict") && releaseService.includes("TimeoutStartSec=5min"), "release adapter service must be hardened and bounded");
  check(releaseService.includes("EnvironmentFile=/etc/chillywood/release-operator.env") && releaseService.includes("EnvironmentFile=-/etc/chillywood/release-provider-readback.env") && !releaseService.includes("SUPABASE_SERVICE_ROLE_KEY="), "release host adapter must use the narrow operator credential and optional read-only provider access, never service-role credentials");
  check(releaseAdapter.includes("ios-release-provider-readback.mjs") && releaseAdapter.includes("android-release-provider-readback.mjs"), "release schedule must compose iOS and Android adapters");

  const obsTimer = read("ops/observability-operator/systemd/chillywood-observability-operator-watch-once.timer");
  const obsService = read("ops/observability-operator/systemd/chillywood-observability-provider-readback.service");
  const obsAdapter = read("scripts/all-platform-observability-provider-readback.mjs");
  check(obsTimer.includes("OnUnitActiveSec=10min") && obsTimer.includes("Unit=chillywood-observability-provider-readback.service"), "observability adapter must execute at unchanged ten-minute cadence");
  check(obsService.includes("all-platform-observability-provider-readback.mjs --post") && obsService.includes("ProtectSystem=strict") && obsService.includes("EnvironmentFile=/etc/chillywood/observability-operator.env") && obsService.includes("EnvironmentFile=-/etc/chillywood/observability-provider-readback.env") && !obsService.includes("SUPABASE_SERVICE_ROLE_KEY="), "observability provider adapter service must execute with hardening, narrow operator access, and optional read-only provider access");
  check(obsAdapter.includes("--android") && obsAdapter.includes("ios"), "observability schedule must compose Android and iOS provider adapters");
  check(obsAdapter.includes("SUPABASE_FUNCTIONS_URL") && obsAdapter.includes("/observability-operator"), "observability adapter must reuse the protected canonical functions base URL when no explicit endpoint override exists");
  check(obsAdapter.includes("provider_adapter_unavailable") && obsAdapter.includes("readbackComplete: false"), "missing scheduled provider access must be blocked, not healthy");

  const androidFtl = read("ops/installed-product-qa-operator/systemd/installed-qa-firebase-smoke.sh");
  const iosTimer = read("ops/installed-product-qa-operator/systemd/chillywood-installed-qa-ios-readiness.timer");
  const iosReadiness = read("ops/installed-product-qa-operator/systemd/installed-qa-ios-readiness.sh");
  check(!androidFtl.includes("ios_installed_product_qa_readiness_watch_once"), "Android Firebase Test Lab must not gate iOS readiness");
  check(iosTimer.includes("OnCalendar=*-*-* 03:17:00") && iosTimer.includes("chillywood-installed-qa-ios-readiness.service"), "iOS readiness must run independently at the existing daily cadence");
  check(iosReadiness.includes('PLATFORM="${1:-ios}"') && iosReadiness.includes('android) SOURCE="local_fixture"'), "installed readiness adapter must support bounded Android readback without invoking Firebase Test Lab");
};

const runAllPlatform = async () => {
  const scoped = loadTypeScriptModule("supabase/functions/_shared/scoped-operator.ts");
  const context = { client: {}, config: {}, payload: {}, metadata: {} };
  const composed = await scoped.runComposedOperatorHandlers([
    async () => ({ platform: "shared", readbackComplete: true, healthState: "healthy", source: "shared_fixture", dataWindow: { start: null, end: "2026-07-16T00:00:00Z" }, reasons: [] }),
    async () => { throw new Error("android_provider_unavailable"); },
    async () => ({ platform: "ios", readbackComplete: true, healthState: "healthy", source: "ios_fixture", dataWindow: { start: null, end: "2026-07-16T00:00:00Z" }, reasons: [] }),
  ], context, ["shared", "android", "ios"]);
  check(composed.platformResults.some((result) => result.platform === "shared" && result.readbackComplete), "shared probe result must survive another platform failure");
  check(composed.platformResults.some((result) => result.platform === "ios" && result.readbackComplete), "iOS probe result must survive Android failure");
  check(composed.platformResults.some((result) => result.platform === "android" && result.healthState === "blocked"), "missing required Android result must be blocked");
  check(composed.readbackComplete === false && composed.healthState !== "healthy", "overall result cannot be healthy when a required platform is blocked");

  const lifecycleCalls = [];
  const lifecycleClient = {
    rpc: async (name, args) => {
      lifecycleCalls.push({ name, args });
      return {
        data: name === "record_autonomous_finding"
          ? `finding-${lifecycleCalls.length}`
          : null,
        error: null,
      };
    },
  };
  await scoped.persistOperatorFindingLifecycle(
    lifecycleClient,
    "security_owner_operator",
    {
      readbackComplete: false,
      platform: "shared",
      source: "composed_fixture",
      dataWindow: { start: null, end: null },
      platformResults: [
        {
          lifecycleManaged: true,
          platform: "shared",
          readbackComplete: false,
          healthState: "critical",
          provider: "supabase",
          surface: "cognitive_pg_net_acl",
          source: "cognitive_runtime.net_acl_guard_snapshot",
          dataWindow: { start: null, end: null },
          reasons: ["cognitive_net_acl_guard_mismatch"],
        },
        {
          platform: "shared",
          readbackComplete: true,
          healthState: "healthy",
          provider: "source_tree",
          surface: "security_source_probe",
          source: "shared_security_probe",
          dataWindow: { start: null, end: null },
          reasons: [],
        },
      ],
    },
  );
  check(
    !lifecycleCalls.some((call) =>
      call.name === "record_autonomous_finding" &&
      call.args.p_finding_type === "cognitive_net_acl_guard_mismatch"
    ),
    "SQL-managed ACL lifecycle must bypass generic composed finding writes",
  );
  check(
    lifecycleCalls.filter((call) =>
      call.name === "resolve_autonomous_findings"
    ).length === 1,
    "unmanaged healthy shared probe must retain its existing lifecycle",
  );

  const noReadback = classifyNotificationAutonomy({ readbackComplete: false });
  const rolloutOff = classifyNotificationAutonomy({ readbackComplete: true, providerConfigured: true, rolloutEnabled: false, activeTokenCount: 1 });
  const noInstall = classifyNotificationAutonomy({ readbackComplete: true, providerConfigured: true, rolloutEnabled: true, activeTokenCount: 0 });
  const idle = classifyNotificationAutonomy({ readbackComplete: true, providerConfigured: true, rolloutEnabled: true, activeTokenCount: 1, attemptCount: 0 });
  const delivered = classifyNotificationAutonomy({ readbackComplete: true, providerConfigured: true, rolloutEnabled: true, activeTokenCount: 1, attemptCount: 1, successfulAttemptCount: 1 });
  check(noReadback.healthState === "unknown", "missing notification readback cannot be healthy");
  check(rolloutOff.healthState === "rollout_disabled", "configured disabled rollout must be distinct from delivery health");
  check(noInstall.healthState === "no_active_install", "enabled rail without active token must report no active install");
  check(idle.healthState === "idle_no_delivery_evidence", "active token without attempts must remain idle");
  check(delivered.healthState === "delivery_evidence_healthy", "only successful provider evidence may be delivery healthy");
  for (const reason of ["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"]) check(isApnsInvalidVoipTokenReason(reason), `APNs invalid reason must be recognized: ${reason}`);
  const notificationProbe = read("supabase/functions/notification-operator/probe.ts");
  check(notificationProbe.includes("SENDER_ID_MISMATCH") && notificationProbe.includes("UNREGISTERED"), "Android FCM invalid-token parity must remain");

  const installed = classifyIosInstalledQaReadiness({ providerReadbackComplete: false, release: {}, clientCapabilities: IOS_QA_RELEASE_EXPECTATION.clientCapabilities, physicalEvidenceAvailable: false, availablePhysicalDeviceCount: 0 });
  check(installed.blockers.includes("ios_provider_readback_blocked") && installed.fakePhysicalProof === false, "missing iOS provider truth must be blocked without physical proof");
  check(!installed.blockers.some((blocker) => blocker.endsWith("_mismatch") || blocker === "ios_testflight_build_unavailable"), "missing installed-provider evidence must not be relabeled as an observed identity mismatch");
  const missingRelease = classifyIosReleaseAutonomy({ eas: { readbackComplete: false }, appStoreConnect: { readbackComplete: false }, binaryIdentityComplete: false, channelReadbackComplete: false, release: {} });
  check(!missingRelease.reasons.some((reason) => reason.endsWith("_mismatch") || reason === "rollback_target_missing"), "missing release-provider evidence must not be relabeled as an observed identity mismatch");
  const installedSource = read("supabase/functions/installed-product-qa-operator/index.ts");
  const firebaseInstalledAdapter = read("scripts/installed-qa-firebase-test-lab.mjs");
  check(installedSource.includes("runAndroidWatchOnce") && installedSource.includes("runWatchOnce"), "installed QA must retain independent Android and iOS handlers");
  check(installedSource.includes("signed_ios_build_available") && installedSource.includes("testflight_internal_build_available"), "iOS readiness fields must be first class");
  check(normalizeInstalledQaPlatform(undefined, "firebase_test_lab_uploaded_artifact") === "android", "Firebase Test Lab source must infer Android when an older adapter omits platform");
  check(normalizeInstalledQaPlatform("ios", "firebase_test_lab_uploaded_artifact") === "ios", "an explicit valid platform must remain authoritative");
  check(firebaseInstalledAdapter.includes("platform,") && firebaseInstalledAdapter.includes('normalizeInstalledQaPlatform("android", PROOF_SOURCE)'), "Firebase Test Lab adapter must submit an explicit Android platform");

  const mediaRecoveryMigration = read("supabase/migrations/20260718211432_harden_media_scan_retry_recovery.sql");
  const malwareWorker = read("ops/malware-scanner-worker/worker.mjs");
  check(mediaRecoveryMigration.includes("recover_media_scan_jobs") && mediaRecoveryMigration.includes("for update skip locked"), "media recovery must be bounded and concurrency safe");
  check(mediaRecoveryMigration.includes("scan_attempt_cap_reached") && mediaRecoveryMigration.includes("'manual_review'"), "capped media scans must fail closed into manual review");
  check(malwareWorker.includes('rpc("recover_media_scan_jobs"') && malwareWorker.includes("SCAN_RECOVERY_INTERVAL_MS"), "malware worker must periodically recover stale and capped jobs");
  check(malwareWorker.includes("p_stale_after_minutes: 20") && malwareWorker.includes("p_max_jobs: 25"), "media recovery must preserve lease and batch caps");
  check(malwareWorker.includes("AbortSignal.timeout(NETWORK_REQUEST_TIMEOUT_MS)") && malwareWorker.includes("AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)"), "media provider requests must be time bounded");
  check(malwareWorker.includes('child.kill("SIGKILL")') && malwareWorker.includes('timedOut ? "command_timeout"'), "ClamAV subprocesses must fail closed after a bounded timeout");

  const owner = loadTypeScriptModule("_lib/ownerCommandOperator.ts");
  const routed = owner.mapOwnerCommandToAutonomousSystems("Audit StoreKit purchase, APNs CallKit delivery, TestFlight runtime, and Crashlytics on iPhone");
  for (const system of ["money_flow_control", "notification_delivery_operator", "release_ota_operator", "installed_product_qa_operator", "observability_runtime_operator"]) check(routed.includes(system), `mixed-system iOS command missing ${system}`);
  const mixed = owner.classifyOwnerCommand("Audit StoreKit on iPhone and Play Billing on Android");
  check(mixed.platformScope === "unknown" && mixed.blockers.includes("multiple_platform_scopes_require_separate_approval_requests"), "mixed platforms must not share one approval scope");

  const reports = loadTypeScriptModule("_lib/userReportRouter.ts");
  const iosReport = { summary: "StoreKit Restore Purchases failed in TestFlight", devicePlatform: "ios" };
  const androidReport = { summary: "Google Play Billing restore failed", devicePlatform: "android" };
  const iosClass = reports.classifyUserReport(iosReport);
  const androidClass = reports.classifyUserReport(androidReport);
  check(iosClass.platform === "ios" && iosClass.routedSystemId === "money_flow_control", "iOS StoreKit report must route to money control");
  check(androidClass.platform === "android" && androidClass.routedSystemId === "money_flow_control", "Android Play Billing report must remain routed");
  check(reports.fingerprintUserReport(iosReport, iosClass) !== reports.fingerprintUserReport(androidReport, androidClass), "platform-specific report clusters must remain separated");
  const callClass = reports.classifyUserReport({ summary: "PushKit CallKit native incoming call did not close", devicePlatform: "ios" });
  check(callClass.routedSystemId === "notification_delivery_operator", "PushKit/CallKit reports must route to notification delivery");
  const sharedSafety = reports.classifyUserReport({ summary: "This user is harassing me", devicePlatform: "ios" });
  check(sharedSafety.platform === "shared", "genuinely shared safety reports must cluster across platforms");
  const iosPrivacy = reports.classifyUserReport({ summary: "App Privacy screen is wrong on iPhone", devicePlatform: "ios" });
  const androidPrivacy = reports.classifyUserReport({ summary: "Data Safety screen is wrong on Android", devicePlatform: "android" });
  check(iosPrivacy.platform === "ios" && androidPrivacy.platform === "android", "platform-specific privacy surfaces must not be merged into a shared cluster");

  const money = read("supabase/functions/money-operator/index.ts");
  for (const rail of ['platform: "shared"', 'platform: "ios"', 'platform: "android"', 'provider: "revenuecat_app_store"', 'provider: "revenuecat_google_play"']) check(money.includes(rail), `money autonomy missing ${rail}`);
  check(money.includes("stripe_digital_ios_used: false") && money.includes("payableBalanceCreated: false"), "money watch must preserve non-payable and Stripe exclusion policy");

  const releaseProbe = read("supabase/functions/release-operator/probe.ts");
  check(releaseProbe.includes("release_binary_attestations") && releaseProbe.includes("app_store_connect_readback+reviewed_local_binary_manifest"), "local iOS build attestation must require App Store readback");
  check(releaseProbe.includes("const observed = (complete") && !releaseProbe.includes("observedIdentity = IOS_QA_RELEASE_MANIFEST"), "expected identity must never become observed identity");
  const validAttestation = {
    platform: "ios", bundle_identifier: IOS_QA_RELEASE_EXPECTATION.bundleIdentifier, app_version: IOS_QA_RELEASE_EXPECTATION.appVersion,
    native_build: IOS_QA_RELEASE_EXPECTATION.nativeBuild, runtime_version: IOS_QA_RELEASE_EXPECTATION.runtimeVersion,
    channel: IOS_QA_RELEASE_EXPECTATION.channel, distribution_source: IOS_QA_RELEASE_EXPECTATION.distributionSource,
    source_commit: IOS_QA_RELEASE_EXPECTATION.sourceCommit, binary_sha256: IOS_QA_RELEASE_EXPECTATION.binarySha256,
    app_store_connect_build_id: IOS_QA_RELEASE_EXPECTATION.appStoreConnectBuildId,
  };
  const validAsc = {
    readbackComplete: true,
    bundleIdentifier: IOS_QA_RELEASE_EXPECTATION.bundleIdentifier,
    appVersion: IOS_QA_RELEASE_EXPECTATION.appVersion,
    latestNativeBuild: IOS_QA_RELEASE_EXPECTATION.nativeBuild,
    latestBuildId: IOS_QA_RELEASE_EXPECTATION.appStoreConnectBuildId,
    attestedAppVersion: IOS_QA_RELEASE_EXPECTATION.appVersion,
    attestedNativeBuild: IOS_QA_RELEASE_EXPECTATION.nativeBuild,
    attestedBuildId: IOS_QA_RELEASE_EXPECTATION.appStoreConnectBuildId,
  };
  check(matchesIosBinaryAttestation(validAttestation, validAsc), "reviewed local binary must match every App Store and manifest identity field");
  check(!matchesIosBinaryAttestation(validAttestation, { ...validAsc, attestedAppVersion: "9.9.9" }), "App Store version mismatch must block local binary verification");
  check(matchesIosBinaryAttestation(validAttestation, { ...validAsc, latestNativeBuild: "9", latestBuildId: "later-build" }), "a later build must not erase exact attested-binary verification");
  check(releaseProbe.includes("newer_app_store_build_observed") && releaseProbe.includes("latestAppStoreBuild !== IOS_QA_RELEASE_MANIFEST.nativeBuild"), "a later App Store build must create release drift without corrupting exact attestation identity");
  const releaseAdapter = read("scripts/ios-release-provider-readback.mjs");
  check(releaseAdapter.includes("include=preReleaseVersion") && releaseAdapter.includes("attestedAppVersion: attestedPreReleaseVersion") && releaseAdapter.includes("attestedBuildId: attestedBuild"), "App Store readback must separate latest drift from exact attested build identity");
  check(read("scripts/ios-release-provider-readback.mjs").includes("local_ios_build_absent_from_eas_cloud_build_history"), "local binary absence from EAS cloud history must be truthful");

  const iosSourceProbes = read("supabase/functions/_shared/ios-source-operator-probes.ts");
  const allPlatformSourceProbes = read("supabase/functions/_shared/all-platform-source-operator-probes.ts");
  const observabilityProbe = read("supabase/functions/observability-operator/probe.ts");
  const observabilityAdapter = read("scripts/ios-observability-provider-readback.mjs");
  const observabilityDedupeMigration = read("supabase/migrations/20260718142000_dedupe_open_observability_findings.sql");
  const installedQa = read("supabase/functions/installed-product-qa-operator/index.ts");
  const deviceDedupeMigration = read("supabase/migrations/20260718143000_dedupe_device_availability_findings.sql");
  check(iosSourceProbes.includes("release?.readback_complete === true") && iosSourceProbes.includes("release?.runtime_version === IOS_QA_RELEASE_EXPECTATION.runtimeVersion"), "iOS recovery cannot treat expected values in an incomplete row as observed identity");
  for (const reason of ["signing_certificate_status_unavailable", "ios_release_or_retry_recovery_readback_blocked", "ios_release_identity_readback_unavailable"]) {
    check(iosSourceProbes.includes(reason), `iOS source probe must expose lifecycle reason: ${reason}`);
  }
  check(!iosSourceProbes.includes('from("privacy_request_findings").insert') && !allPlatformSourceProbes.includes('from("privacy_request_findings").insert'), "scheduled privacy probes must use lifecycle findings instead of inserting duplicate current findings");
  check(observabilityProbe.includes('eq("review_status", "open")') && observabilityProbe.includes('review_status: "reviewed"') && observabilityProbe.includes("reasons: classification.findings"), "typed observability findings must dedupe, resolve, and feed the canonical lifecycle");
  check(observabilityProbe.includes('error?.code === "23505"') && observabilityDedupeMigration.includes("review_status = 'superseded'") && observabilityDedupeMigration.includes("create unique index if not exists"), "typed observability dedupe must be concurrency-safe and retain superseded audit history");
  check(observabilityProbe.includes('capability: "android_health_readback"'), "Android observability must record provider capability state like iOS");
  const allPlatformObservabilityAdapter = read("scripts/all-platform-observability-provider-readback.mjs");
  check(observabilityAdapter.includes("FIREBASE_ANDROID_OBSERVABILITY_READBACK_PATH") && observabilityAdapter.includes("FIREBASE_IOS_OBSERVABILITY_READBACK_PATH"), "scheduled observability adapter must accept sanitized official Firebase exports for both platforms");
  check(observabilityAdapter.includes("SUPABASE_ANDROID_EDGE_OBSERVABILITY_READBACK_PATH") && observabilityAdapter.includes("SUPABASE_IOS_EDGE_OBSERVABILITY_READBACK_PATH") && allPlatformObservabilityAdapter.includes("SUPABASE_SHARED_EDGE_OBSERVABILITY_READBACK_PATH"), "scheduled observability adapter must keep shared, Android, and iOS Edge exports separate");
  const normalizedTelemetry = normalizeSanitizedObservabilityExport({ platform: "android", readbackComplete: true, nativeCrashCount: 2, crashlyticsReadbackComplete: true }, "android");
  check(normalizedTelemetry.readbackComplete === true && normalizedTelemetry.nativeCrashCount === 2, "sanitized provider export must retain bounded Android metrics");
  check(normalizeSanitizedObservabilityExport({ platform: "ios", readbackComplete: true }, "android").readbackComplete === false, "cross-platform observability exports must fail closed");
  check(installedQa.includes('error?.code === "23505"') && installedQa.includes('result === "pass" ? "reviewed" : "open"') && deviceDedupeMigration.includes("finding_status = 'superseded'") && deviceDedupeMigration.includes("device_availability_one_open_condition_uidx"), "installed QA device findings must update one current condition and retain superseded history");
  check(deviceDedupeMigration.includes("review_status = 'superseded'") && deviceDedupeMigration.includes("qa_review_one_open_condition_uidx") && installedQa.includes('from("qa_required_review_flags").update(row)'), "installed QA review flags must update one current condition and retain superseded history");

  const controlMigration = read("supabase/migrations/20260718133000_all_platform_autonomous_control_plane.sql");
  check(controlMigration.includes("assert_autonomous_approval_platform_scope") && controlMigration.includes("request.platform = p_platform"), "approval platform mismatch must be rejected in the database");
  check(controlMigration.includes("occurrence_count") && controlMigration.includes("resolved_at") && controlMigration.includes("record_autonomous_finding") && controlMigration.includes("resolve_autonomous_findings"), "finding lifecycle must dedupe and resolve");
  check(read("supabase/functions/_shared/scoped-operator.ts").includes('platform: normalizeOperatorPlatform(payload.platform)'), "approval creation audit must retain the request platform");
  const reportMigration = read("supabase/migrations/20260718134500_governed_user_report_router.sql");
  const atomicReportMigration = read("supabase/migrations/20260718141500_atomic_user_report_clustering.sql");
  check(reportMigration.includes("unique (platform, normalized_fingerprint)"), "report clusters must be platform separated");
  check(reportMigration.includes("revoke all on table") && reportMigration.includes("service_role"), "report router must deny direct client writes");
  check(atomicReportMigration.includes("upsert_user_report_cluster_membership") && atomicReportMigration.includes("for update") && atomicReportMigration.includes("on conflict (platform, normalized_fingerprint)"), "report clustering must be atomic and retry-safe");
  check(read("supabase/functions/user-report-intake/index.ts").includes("upsert_user_report_cluster_membership"), "report intake must use the atomic cluster transition");

  const sourceCorpus = [controlMigration, reportMigration, notificationProbe, releaseProbe, money, read("config/autonomy/autonomous-components.json")].join("\n");
  check(!/(AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(sourceCorpus), "no credential material may appear in autonomy sources");
  check(sanitizeAutonomousReadback({ token: "not-stored", nested: { authorization: "not-stored", safe: true } }).nested.safe === true, "recursive sanitizer must retain safe fields");
  const sanitizedCounts = sanitizeAutonomousReadback({ activeTokenCount: 2, revokedTokenCount: 1, rawToken: "not-a-real-provider-token-value" });
  check(sanitizedCounts.activeTokenCount === 2 && sanitizedCounts.revokedTokenCount === 1 && !("rawToken" in sanitizedCounts), "aggregate token counts must survive sanitization while raw token fields remain blocked");
  const obsoleteRevenueCatAlias = ["EXPO_PUBLIC", "REVENUECAT", "IOS", "API_KEY"].join("_");
  const revenueCatReadinessCorpus = [read("app.config.ts"), read("_lib/runtimeConfig.ts"), read("supabase/functions/_shared/ios-source-operator-probes.ts")].join("\n");
  check(!revenueCatReadinessCorpus.includes(obsoleteRevenueCatAlias) && revenueCatReadinessCorpus.includes("EXPO_PUBLIC_REVENUECAT_IOS_PUBLIC_SDK_KEY"), "application and readiness probes must use only the canonical RevenueCat iOS public SDK-key name");
};

if (mode === "scheduled-adapters") runScheduledAdapters();
else if (mode === "all-platform") { runScheduledAdapters(); await runAllPlatform(); }
else throw new Error(`unknown suite:${mode}`);

process.stdout.write(`${JSON.stringify({ ok: true, suite: mode, kind, assertions, platforms: ["shared", "android", "ios"], moneyMoved: false, userRightsChanged: false, releaseActionExecuted: false })}\n`);
