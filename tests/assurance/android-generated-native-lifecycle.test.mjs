#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import {
  assertBackupPolicyClear,
  assertCompleteScenarioMatrix,
  deterministicEvidenceDigest,
  evaluateBackupPolicy,
  evaluateScenarioMatrix,
  fixtureIds,
  runNegativeControls,
  validateSourceModel,
} from "../../scripts/assurance/android-generated-native-lifecycle.mjs";

const contract = JSON.parse(fs.readFileSync("config/assurance/android-generated-native-lifecycle-v1.json", "utf8"));
const scopeWaiver = JSON.parse(fs.readFileSync("config/assurance/pr-d2a-scope-waiver-v1.json", "utf8"));
const report = JSON.parse(fs.readFileSync("docs/assurance/pr-d2a-android-generated-native-lifecycle-report-v1.json", "utf8"));
assert.equal(contract.contractId, "android-generated-native-lifecycle-v1");
assert.equal(contract.target.targetId, "android-chat-livekit-qa-build-86");
assert.equal(contract.target.d1GeneratedSourceDigest, "4262e9434c0acbd5fc104d115b7dc7e0ea95aee40ad276e84f361caaf5410d2b");
assert.equal(contract.target.platform, "android");
assert.equal(contract.scopeWaiver.maximumChangedFiles, 20);
assert.equal(contract.scopeWaiver.maximumNetLines, 2500);
assert.equal(contract.scopeWaiver.productBehaviorChangesAllowed, false);
assert.equal(contract.scopeWaiver.file, "config/assurance/pr-d2a-scope-waiver-v1.json");
assert.equal(contract.scopeWaiver.contractId, scopeWaiver.contractId);
assert.equal(scopeWaiver.secondHighRiskDomain, false);
assert.equal(scopeWaiver.newTimeboxHours, 8);
assert.equal(scopeWaiver.fileBudget.waivedMaximum, 20);
assert.equal(scopeWaiver.lineBudget.waivedMaximum, 2500);
assert.equal(scopeWaiver.supportingDomains.length, 1);
assert.equal(scopeWaiver.prohibitedScope.length, 8);
assert.equal(contract.nativeActionStore.mode, "MODE_PRIVATE");
assert.equal(contract.nativeActionStore.ttlMs, 45_000);
assert.equal(contract.nativeActionStore.consumeRule, "ATOMIC_EXACTLY_ONCE");
assert.equal(contract.nativeActionStore.backupRule, "PENDING_ACTION_PREFERENCES_EXCLUDED_FROM_CLOUD_AND_DEVICE_TRANSFER_BACKUP");
assert.equal(contract.nativeActionStore.backupSharedPreferencesPath, "chilly_chat_native_call_action_v1.xml");
assert.equal(contract.logging.identifierValuesAllowed, false);
assert.equal(contract.logging.observedNoncanonical[0].category, "ACTION_BUFFERED");
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
assert.equal(source.sourceAssertions, 17);
assert.equal(source.serverAuthority, false);
assert.equal(source.preacceptMediaAuthority, false);
assert.equal(source.externalActionOriginRiskRequiresInstrumentation, true);
assert.equal(source.logging.rawValuesRetained, false);
assert.equal(source.logging.noncanonical[0].classification, "P2_D2B_LOGGING_NORMALIZATION");

const manifestWithRules = '<manifest><application android:allowBackup="true" android:fullBackupContent="@xml/backup_rules" android:dataExtractionRules="@xml/data_extraction_rules" /></manifest>';
const legacyRules = '<full-backup-content><exclude domain="sharedpref" path="chilly_chat_native_call_action_v1.xml" /></full-backup-content>';
const extractionRules = '<data-extraction-rules><cloud-backup><exclude domain="sharedpref" path="chilly_chat_native_call_action_v1.xml" /></cloud-backup><device-transfer><exclude path="chilly_chat_native_call_action_v1.xml" domain="sharedpref" /></device-transfer></data-extraction-rules>';
const ruleResources = {
  "android/app/src/main/res/xml/backup_rules.xml": legacyRules,
  "android/app/src/main/res/xml/data_extraction_rules.xml": extractionRules,
};
assert.equal(evaluateBackupPolicy({manifest: '<manifest><application android:allowBackup="false" /></manifest>'}).clear, true);
const fullBackup = evaluateBackupPolicy({manifest: manifestWithRules, resources: ruleResources});
assert.equal(fullBackup.clear, true);
assert.equal(fullBackup.legacyExcluded, true);
assert.equal(fullBackup.cloudExcluded, true);
assert.equal(fullBackup.deviceTransferExcluded, true);
assert.equal(evaluateBackupPolicy({manifest: manifestWithRules, resources: {...ruleResources, "android/app/src/main/res/xml/backup_rules.xml": "<full-backup-content />"}}).clear, false);
assert.equal(evaluateBackupPolicy({manifest: manifestWithRules, resources: {...ruleResources, "android/app/src/main/res/xml/data_extraction_rules.xml": '<data-extraction-rules><cloud-backup /></data-extraction-rules>'}}).clear, false);
assert.equal(evaluateBackupPolicy({manifest: manifestWithRules, resources: {}}).missingReferencedResources.length, 2);
assert.equal(evaluateBackupPolicy({manifest: '<manifest><application android:allowBackup="true" /></manifest>'}).clear, false);
assert.throws(() => assertBackupPolicyClear({clear: false}), (error) => error.code === "ANDROID_NATIVE_ACTION_BACKUP_EXCLUSION_MISSING");

const scenarioMatrix = evaluateScenarioMatrix();
assert.equal(scenarioMatrix.complete, false);
assert.deepEqual(scenarioMatrix.missing, ["BACKGROUND", "ACTIVITY_DESTROYED_PROCESS_ALIVE", "REACT_CONTEXT_UNAVAILABLE", "DECLINE", "EXPIRATION", "BACKUP_POLICY"]);
assert.throws(() => assertCompleteScenarioMatrix(scenarioMatrix), (error) => error.code === "ANDROID_EMULATOR_SCENARIO_MATRIX_INCOMPLETE");
const evidenceA = {gradle: {tasks: [{task: "compile", passed: true, durationMs: 1}]}, value: "same"};
const evidenceB = {gradle: {tasks: [{task: "compile", passed: true, durationMs: 9999}]}, value: "same"};
assert.equal(deterministicEvidenceDigest(evidenceA), deterministicEvidenceDigest(evidenceB));

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
const runner = fs.readFileSync("scripts/assurance/android-generated-native-lifecycle.mjs", "utf8");
const unitTemplate = fs.readFileSync("tools/android-native-call-harness/ChillyChatNativeCallActionStoreTest.kt", "utf8");
const instrumentationTemplate = fs.readFileSync("tools/android-native-call-harness/ChillyChatNativeLifecycleInstrumentationTest.kt", "utf8");
assert.match(plugin, /Context\.MODE_PRIVATE/u);
assert.match(plugin, /@Synchronized\s+fun consume/u);
assert.match(plugin, /MAX_ACTION_AGE_MS = 45_000L/u);
assert.doesNotMatch(plugin, /(?:acceptInviteDirectly|requestLiveKitTokenAndStartMedia)/u);
assert.match(unitTemplate, /concurrentConsumeHasOneWinner/u);
assert.match(unitTemplate, /duplicateDoesNotExtendOriginalTtlAndReplayIsDenied/u);
const duplicateTest = unitTemplate.slice(unitTemplate.indexOf("fun duplicateDoesNotExtendOriginalTtlAndReplayIsDenied"), unitTemplate.indexOf("fun expiredActionIsDeletedAndDenied"));
assert.ok(duplicateTest.indexOf("ShadowSystemClock.advanceBy") > duplicateTest.indexOf("originalElapsed"));
assert.ok(duplicateTest.lastIndexOf("capture(context, intent())") > duplicateTest.indexOf("ShadowSystemClock.advanceBy"));
const consumeTest = unitTemplate.slice(unitTemplate.indexOf("fun consumeReturnsExactlyOnce"), unitTemplate.indexOf("fun concurrentConsumeHasOneWinner"));
assert.match(consumeTest, /for \(field in listOf\("schema_version", "thread_id", "call_invite_id", "native_action", "request_key", "created_at", "created_elapsed_at"\)\)/u);
assert.match(consumeTest, /assertFalse\("Pending field must be removed after consume: \$field", preferences\.contains\(field\)\)/u);
assert.match(instrumentationTemplate, /verifyExternallyLaunchedActionWasNotPersisted/u);
assert.match(instrumentationTemplate, /An external custom-scheme launch must not establish trusted native call action state/u);
const externalTest = instrumentationTemplate.slice(instrumentationTemplate.indexOf("fun verifyExternallyLaunchedActionWasNotPersisted"), instrumentationTemplate.indexOf("fun consumeColdActionExactlyOnce"));
assert.ok(externalTest.indexOf("Intent.ACTION_VIEW") >= 0);
assert.ok(externalTest.indexOf("chillywoodmobile://chat/") > externalTest.indexOf("Intent.ACTION_VIEW"));
assert.ok(externalTest.indexOf("ActivityScenario.launch<MainActivity>(externalIntent)") > externalTest.indexOf("chillywoodmobile://chat/"));
assert.ok(externalTest.indexOf("waitForIdleSync()") > externalTest.indexOf("ActivityScenario.launch<MainActivity>(externalIntent)"));
assert.ok(externalTest.indexOf("readStatus(context)") > externalTest.indexOf("waitForIdleSync()"));
assert.ok(runner.indexOf("if (!generation.backupPolicy.clear)") < runner.indexOf("generateOnce({ retain: true })"));
assert.ok(runner.indexOf("ANDROID_NATIVE_ACTION_BACKUP_EXCLUSION_MISSING") < runner.indexOf("gradleEvidence(generated)"));
assert.match(runner, /ANDROID_EMULATOR_SCENARIO_MATRIX_INCOMPLETE/u);
assert.match(runner, /ANDROID_EMULATOR_PACKAGE_PREEXISTED/u);
assert.match(runner, /cleanupSelectedEmulator\(installState\)/u);
assert.doesNotMatch(runner, /const cleanupEmulator/u);
assert.ok(runner.indexOf("ANDROID_EMULATOR_PACKAGE_PREEXISTED") < runner.indexOf('adbRun(serial, ["install", appApk])'));
assert.doesNotMatch(runner, /\["install", "-r"/u);
assert.match(runner, /if \(!state\.installedTest && !state\.installedApp\) return \{attempted: false, verified: true\}/u);
assert.match(runner, /if \(state\.installedTest\)[\s\S]{0,180}\["uninstall", state\.testPackage\]/u);
assert.match(runner, /if \(state\.installedApp\)[\s\S]{0,180}\["uninstall", state\.appPackage\]/u);
assert.equal(report.classification, "BLOCKED_INTERNAL_NATIVE_PRODUCT_DEFECT");
assert.equal(report.generatedSource.runs, "3/3");
assert.equal(report.generatedSource.observedDigest, contract.target.d1GeneratedSourceDigest);
assert.equal(report.productDefects[0].code, "ANDROID_NATIVE_ACTION_BACKUP_EXCLUSION_MISSING");
assert.equal(report.productDefects[0].newBinaryRequired, true);
assert.equal(report.preservedSecurityTest.code, "ANDROID_EXTERNAL_NATIVE_ACTION_ORIGIN_UNTRUSTED");
assert.equal(report.preservedSecurityTest.emulatorResult, "NOT_RUN_AFTER_PRODUCT_DEFECT_STOP");
assert.equal(report.preservedSecurityTest.antiVacuity, "ACTION_VIEW_ACTIVITY_LAUNCH_PRECEDES_EMPTY_STORE_ASSERTION");
assert.equal(report.scenarioMatrix.status, "ANDROID_EMULATOR_SCENARIO_MATRIX_INCOMPLETE");
assert.equal(report.capabilities.compiledRuntimeParity.provided, "UNKNOWN");
assert.equal(report.proofTiers.T2_MODEL, "BLOCKED_INTERNAL_NATIVE_TESTS_NOT_COMPILED_OR_EXECUTED");
assert.equal(report.logging.noncanonical[0].category, "ACTION_BUFFERED");
assert.equal(report.emulatorCleanupContract.preexistingTargetOrTestPackage, "REFUSE");
assert.equal(report.compile.releaseOrDistributionBuild, false);
assert.equal(report.compile.signedArtifactProof, false);
assert.equal(report.nonInterference.productNativeSourceModified, false);
assert.equal(report.nonInterference.providerContact, false);
assert.equal(report.cleanup.disposableProjectsRemoved, true);
assert.equal(report.cleanup.debugOrTestApksRetained, false);

console.log("android generated-native lifecycle source/model tests passed (hardened contract/report assertions; source 17/17; negative controls 12/12; CLI fail-closed 14/14; backup fixtures 8/8).");
