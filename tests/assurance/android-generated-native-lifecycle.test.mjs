#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import {
  fixtureIds,
  runNegativeControls,
  validateSourceModel,
} from "../../scripts/assurance/android-generated-native-lifecycle.mjs";

const contract = JSON.parse(fs.readFileSync("config/assurance/android-generated-native-lifecycle-v1.json", "utf8"));
const report = JSON.parse(fs.readFileSync("docs/assurance/pr-d2a-android-generated-native-lifecycle-report-v1.json", "utf8"));
assert.equal(contract.contractId, "android-generated-native-lifecycle-v1");
assert.equal(contract.target.targetId, "android-chat-livekit-qa-build-86");
assert.equal(contract.target.d1GeneratedSourceDigest, "4262e9434c0acbd5fc104d115b7dc7e0ea95aee40ad276e84f361caaf5410d2b");
assert.equal(contract.target.platform, "android");
assert.equal(contract.scopeWaiver.maximumChangedFiles, 20);
assert.equal(contract.scopeWaiver.maximumNetLines, 2500);
assert.equal(contract.scopeWaiver.productBehaviorChangesAllowed, false);
assert.equal(contract.nativeActionStore.mode, "MODE_PRIVATE");
assert.equal(contract.nativeActionStore.ttlMs, 45_000);
assert.equal(contract.nativeActionStore.consumeRule, "ATOMIC_EXACTLY_ONCE");
assert.equal(contract.nativeActionStore.backupRule, "PENDING_ACTION_PREFERENCES_EXCLUDED_FROM_CLOUD_AND_DEVICE_TRANSFER_BACKUP");
assert.equal(contract.componentRules.actionReceiver.exported, false);
assert.equal(contract.componentRules.mainActivity.untrustedExternalNativeActionAllowed, false);
assert.equal(contract.componentRules.serverAuthority.acceptInvite, false);
assert.equal(contract.componentRules.serverAuthority.requestLiveKitToken, false);
assert.equal(contract.componentRules.serverAuthority.startMedia, false);
assert.equal(contract.requiredCapabilities.length, 21);
assert.equal(contract.lifecycleScenarios.length, 12);
assert.equal(contract.requiredGradleTasks.length, 6);
assert.equal(Object.keys(contract.negativeControls).length, 12);
assert.deepEqual(Object.keys(contract.negativeControls), fixtureIds);

const source = validateSourceModel();
assert.equal(source.sourceAssertions, 10);
assert.equal(source.serverAuthority, false);
assert.equal(source.preacceptMediaAuthority, false);
assert.equal(source.externalActionOriginRiskRequiresInstrumentation, true);

const controls = runNegativeControls();
assert.equal(controls.length, 12);
for (const result of controls) {
  assert.equal(result.expected, contract.negativeControls[result.fixtureId]);
  assert.equal(result.observed, result.expected);
  assert.equal(result.result, "FAIL_CLOSED");
}

for (const fixture of fixtureIds) {
  const result = spawnSync(process.execPath, ["scripts/assurance/android-generated-native-lifecycle.mjs", `--fixture=${fixture}`, "--json"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stdout).findings[0].code, contract.negativeControls[fixture]);
}
for (const argument of ["--unknown", "--fixture=not-registered"]) {
  const result = spawnSync(process.execPath, ["scripts/assurance/android-generated-native-lifecycle.mjs", argument, "--json"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stdout).findings[0].code, argument === "--unknown" ? "UNKNOWN_FLAG" : "UNKNOWN_FIXTURE");
}

const plugin = fs.readFileSync("plugins/withChillyChatNativeCallNotifications.js", "utf8");
const unitTemplate = fs.readFileSync("tools/android-native-call-harness/ChillyChatNativeCallActionStoreTest.kt", "utf8");
const instrumentationTemplate = fs.readFileSync("tools/android-native-call-harness/ChillyChatNativeLifecycleInstrumentationTest.kt", "utf8");
assert.match(plugin, /Context\.MODE_PRIVATE/u);
assert.match(plugin, /@Synchronized\s+fun consume/u);
assert.match(plugin, /MAX_ACTION_AGE_MS = 45_000L/u);
assert.doesNotMatch(plugin, /(?:acceptInviteDirectly|requestLiveKitTokenAndStartMedia)/u);
assert.match(unitTemplate, /concurrentConsumeHasOneWinner/u);
assert.match(unitTemplate, /duplicateDoesNotExtendOriginalTtlAndReplayIsDenied/u);
assert.match(instrumentationTemplate, /verifyExternallyLaunchedActionWasNotPersisted/u);
assert.match(instrumentationTemplate, /An external custom-scheme launch must not establish trusted native call action state/u);
const externalTest = instrumentationTemplate.slice(instrumentationTemplate.indexOf("fun verifyExternallyLaunchedActionWasNotPersisted"), instrumentationTemplate.indexOf("fun consumeColdActionExactlyOnce"));
assert.ok(externalTest.indexOf("Intent.ACTION_VIEW") >= 0);
assert.ok(externalTest.indexOf("chillywoodmobile://chat/") > externalTest.indexOf("Intent.ACTION_VIEW"));
assert.ok(externalTest.indexOf("ActivityScenario.launch<MainActivity>(externalIntent)") > externalTest.indexOf("chillywoodmobile://chat/"));
assert.ok(externalTest.indexOf("waitForIdleSync()") > externalTest.indexOf("ActivityScenario.launch<MainActivity>(externalIntent)"));
assert.ok(externalTest.indexOf("readStatus(context)") > externalTest.indexOf("waitForIdleSync()"));
assert.equal(report.classification, "BLOCKED_INTERNAL_NATIVE_PRODUCT_DEFECT");
assert.equal(report.generatedSource.runs, "3/3");
assert.equal(report.generatedSource.observedDigest, contract.target.d1GeneratedSourceDigest);
assert.equal(report.productDefects[0].code, "ANDROID_NATIVE_ACTION_BACKUP_EXCLUSION_MISSING");
assert.equal(report.productDefects[0].newBinaryRequired, true);
assert.equal(report.preservedSecurityTest.code, "ANDROID_EXTERNAL_NATIVE_ACTION_ORIGIN_UNTRUSTED");
assert.equal(report.preservedSecurityTest.emulatorResult, "NOT_RUN_AFTER_PRODUCT_DEFECT_STOP");
assert.equal(report.preservedSecurityTest.antiVacuity, "ACTION_VIEW_ACTIVITY_LAUNCH_PRECEDES_EMPTY_STORE_ASSERTION");
assert.equal(report.compile.releaseOrDistributionBuild, false);
assert.equal(report.compile.signedArtifactProof, false);
assert.equal(report.nonInterference.productNativeSourceModified, false);
assert.equal(report.nonInterference.providerContact, false);
assert.equal(report.cleanup.disposableProjectsRemoved, true);
assert.equal(report.cleanup.debugOrTestApksRetained, false);

console.log("android generated-native lifecycle source/model tests passed (contract/report 42 assertions; source 10/10; negative controls 12/12; CLI fail-closed 14/14).");
