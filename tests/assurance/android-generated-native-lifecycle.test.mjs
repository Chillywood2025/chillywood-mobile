#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import {
  assertBackupPolicyClear,
  assertCompleteScenarioMatrix,
  assertNativeEntryPreflight,
  deterministicEvidenceDigest,
  evaluateBackupPolicy,
  evaluateD1SourceCapabilityParity,
  evaluateMicNativeAudioMatrix,
  evaluateScenarioMatrix,
  fixtureIds,
  resolveDependencySet,
  runNegativeControls,
  validateInstalledDirectPackageSet,
  validateSourceModel,
} from "../../scripts/assurance/android-generated-native-lifecycle.mjs";
import { runReceipt } from "../../scripts/assurance/receipt.mjs";

const contract = JSON.parse(fs.readFileSync("config/assurance/android-generated-native-lifecycle-v1.json", "utf8"));
const scopeWaiver = JSON.parse(fs.readFileSync("config/assurance/pr-d2a-scope-waiver-v1.json", "utf8"));
const report = JSON.parse(fs.readFileSync("docs/assurance/pr-d2a-android-generated-native-lifecycle-report-v1.json", "utf8"));
assert.equal(contract.contractId, "android-generated-native-lifecycle-v1");
assert.equal(contract.target.targetId, "android-chat-livekit-qa-build-86");
assert.equal(contract.target.d1GeneratedSourceDigest, "d6fd0855600666a6d15de762204b6ced853128704acc7a0b41846b5b537e0de0");
assert.equal(contract.target.platform, "android");
assert.equal(contract.scopeWaiver.maximumChangedFiles, 20);
assert.equal(contract.scopeWaiver.maximumNetLines, 2500);
assert.equal(contract.scopeWaiver.productBehaviorChangesAllowed, false);
assert.equal(contract.proofTiers.T1_SOURCE, "SOURCE_CLEAR");
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
assert.equal(contract.nativeMicrophoneScenarios.length, 4);
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
assert.equal(evaluateBackupPolicy({manifest: '<manifest><uses-sdk android:allowBackup="false"/><application android:allowBackup="true" /></manifest>'}).clear, false);
assert.equal(evaluateBackupPolicy({manifest: '<manifest><!-- <application android:allowBackup="false"/> --><application android:allowBackup="true" /></manifest>'}).clear, false);
assert.equal(evaluateBackupPolicy({manifest: '<manifest><application-fake android:allowBackup="false"></application-fake><application android:allowBackup="true" /></manifest>'}).clear, false);
assert.equal(evaluateBackupPolicy({manifest: '<manifest><!-- <application android:fullBackupContent="@xml/backup_rules" android:dataExtractionRules="@xml/data_extraction_rules"/> --><application android:allowBackup="true" /></manifest>', resources: ruleResources}).clear, false);
assert.equal(evaluateBackupPolicy({manifest: manifestWithRules, resources: {...ruleResources,
  "android/app/src/main/res/xml/backup_rules.xml": '<full-backup-content><!-- <exclude domain="sharedpref" path="chilly_chat_native_call_action_v1.xml" /> --></full-backup-content>'}}).clear, false);
assert.equal(evaluateBackupPolicy({manifest: manifestWithRules, resources: {...ruleResources,
  "android/app/src/main/res/xml/data_extraction_rules.xml": '<data-extraction-rules><cloud-backup><!-- <exclude domain="sharedpref" path="chilly_chat_native_call_action_v1.xml" /> --></cloud-backup><device-transfer><!-- <exclude domain="sharedpref" path="chilly_chat_native_call_action_v1.xml" /> --></device-transfer></data-extraction-rules>'}}).clear, false);
assert.throws(() => assertBackupPolicyClear({clear: false}), (error) => error.code === "ANDROID_NATIVE_ACTION_BACKUP_EXCLUSION_MISSING");

const capabilityParity = evaluateD1SourceCapabilityParity();
assert.equal(capabilityParity.required, contract.requiredCapabilities.length);
assert.equal(capabilityParity.sourceProvided, contract.requiredCapabilities.length);
assert.equal(capabilityParity.sourceMissing, 0);
assert.equal(capabilityParity.derivation.independent, true);
const registryFixture = JSON.parse(fs.readFileSync("config/assurance/native-capability-registry-v1.json", "utf8"));
registryFixture.capabilities.find(({capabilityId}) => capabilityId === contract.requiredCapabilities[0]).providedBy[0].includes = ["__missing_capability_marker__"];
assert.throws(() => evaluateD1SourceCapabilityParity({registry: registryFixture}), (error) => error.code === "ANDROID_D1_SOURCE_CAPABILITY_MISSING");
const directPackageFixture = {dependencies: {alpha: "^1.0.0"}, devDependencies: {beta: "2.0.0"}};
const directLockFixture = {packages: {"": {dependencies: {alpha: "^1.0.0"}, devDependencies: {beta: "2.0.0"}},
  "node_modules/alpha": {version: "1.2.3"}, "node_modules/beta": {version: "2.0.0"}}};
const installed = {alpha: {name: "alpha", version: "1.2.3"}, beta: {name: "beta", version: "2.0.0"}};
assert.equal(validateInstalledDirectPackageSet({modules: "unused", packageJson: directPackageFixture, lock: directLockFixture, installedPackageReader: (name) => installed[name]}).versionsMatched, 2);
const aliasPackageFixture = {dependencies: {alias: "file:vendor/alias.tgz"}};
const aliasLockFixture = {packages: {"": {dependencies: {alias: "file:vendor/alias.tgz"}},
  "node_modules/alias": {name: "@trusted/alias", version: "1.0.0"}}};
assert.equal(validateInstalledDirectPackageSet({modules: "unused", packageJson: aliasPackageFixture, lock: aliasLockFixture,
  installedPackageReader: () => ({name: "@trusted/alias", version: "1.0.0"})}).versionsMatched, 1);
assert.throws(() => validateInstalledDirectPackageSet({modules: "unused", packageJson: directPackageFixture, lock: directLockFixture,
  installedPackageReader: (name) => name === "alpha" ? {name, version: "0.0.0"} : installed[name]}), (error) => error.code === "DEPENDENCY_INSTALLED_VERSION_MISMATCH");
const dependencyResolution = resolveDependencySet();
const dependencyEvidence = dependencyResolution.evidence;
const repositoryPackage = JSON.parse(fs.readFileSync("package.json", "utf8"));
assert.equal(fs.realpathSync(dependencyResolution.modules), fs.realpathSync("node_modules"));
assert.equal(dependencyEvidence.dependencySource, "CURRENT_D2A_WORKTREE_ONLY");
assert.equal(dependencyEvidence.status, "EXACT_LOCKED_ALL_DECLARED_DIRECT_PACKAGE_IDENTITIES");
assert.equal(dependencyEvidence.directPackageCount, Object.keys(repositoryPackage.dependencies).length + Object.keys(repositoryPackage.devDependencies).length);
assert.equal(dependencyEvidence.productionPackageCount, Object.keys(repositoryPackage.dependencies).length);
assert.equal(dependencyEvidence.developmentPackageCount, Object.keys(repositoryPackage.devDependencies).length);
assert.equal(dependencyEvidence.directPackageCount, dependencyEvidence.versionsMatched);
assert.equal(dependencyEvidence.allDeclaredDirectDependenciesValidated, true);
assert.equal(dependencyEvidence.pathsRecorded, false);

const scenarioTemplate = fs.readFileSync("tools/android-native-call-harness/ChillyChatNativeLifecycleInstrumentationTest.kt", "utf8");
const scenarioMatrix = evaluateScenarioMatrix(scenarioTemplate, true);
assert.equal(scenarioMatrix.complete, true);
assert.equal(scenarioMatrix.mappingValid, true);
assert.equal(scenarioMatrix.executionPlan.length, 12);
assert.equal(new Set(scenarioMatrix.executionPlan.map(({method}) => method)).size, scenarioMatrix.executionPlan.length);
assert.deepEqual(scenarioMatrix.missing, []);
assert.doesNotThrow(() => assertCompleteScenarioMatrix(scenarioMatrix));
const missingBackgroundTemplate = scenarioTemplate.replace("fun backgroundActionResumesAndConsumesOnce()", "fun removedBackgroundActionResumesAndConsumesOnce()");
assert.equal(evaluateScenarioMatrix(missingBackgroundTemplate, true).complete, false);
assert.throws(() => assertCompleteScenarioMatrix(evaluateScenarioMatrix(missingBackgroundTemplate, true)), (error) => error.code === "ANDROID_EMULATOR_SCENARIO_MATRIX_INCOMPLETE");
const micTemplate = fs.readFileSync("tools/android-native-call-harness/ChillyChatMicControlInstrumentationTest.kt", "utf8");
const micMatrix = evaluateMicNativeAudioMatrix(micTemplate);
assert.equal(micMatrix.complete, true);
assert.deepEqual(micMatrix.required, contract.nativeMicrophoneScenarios.map(({id}) => id));
assert.deepEqual(micMatrix.missing, []);
const missingMicTemplate = micTemplate.replace("fun repeatedToggleRemainsLiveAndDeterministic()", "fun removedRepeatedToggleRemainsLiveAndDeterministic()");
assert.equal(evaluateMicNativeAudioMatrix(missingMicTemplate).complete, false);
assert.throws(() => evaluateMicNativeAudioMatrix(micTemplate, [], null), (error) => error.code === "ANDROID_MIC_NATIVE_AUDIO_CONTRACT_INVALID");
assert.equal(assertNativeEntryPreflight({backupPolicyClear: true}).complete, true);
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
assert.ok(duplicateTest.lastIndexOf("capture()") > duplicateTest.indexOf("ShadowSystemClock.advanceBy"));
assert.match(duplicateTest, /Duration\.ofSeconds\(41\)[\s\S]*assertNull\(ChillyChatNativeCallActionStore\.consume\(context\)\)/u);
const consumeTest = unitTemplate.slice(unitTemplate.indexOf("fun consumeReturnsExactlyOnce"), unitTemplate.indexOf("fun concurrentConsumeHasOneWinner"));
assert.match(consumeTest, /for \(field in listOf\("thread_id", "call_invite_id", "native_action", "request_key", "capture_generation", "created_at", "created_elapsed_at"\)\)/u);
assert.match(consumeTest, /assertFalse\("Pending field must be removed after consume: \$field", preferences\.contains\(field\)\)/u);
assert.match(instrumentationTemplate, /verifyExternallyLaunchedActionWasNotPersisted/u);
assert.match(instrumentationTemplate, /PendingIntent\.getBroadcast\([\s\S]*PendingIntent\.FLAG_UPDATE_CURRENT or PendingIntent\.FLAG_IMMUTABLE[\s\S]*\)\.send\(/u);
assert.doesNotMatch(instrumentationTemplate, /ChillyChatCallNotificationActionReceiver\(\)\.onReceive/u);
assert.match(instrumentationTemplate, /An external custom-scheme launch must not establish trusted native call action state/u);
const externalTest = instrumentationTemplate.slice(instrumentationTemplate.indexOf("fun verifyExternallyLaunchedActionWasNotPersisted"));
assert.ok(externalTest.indexOf("Intent.ACTION_VIEW") >= 0);
assert.ok(externalTest.indexOf("chillywoodmobile://chat/") > externalTest.indexOf("Intent.ACTION_VIEW"));
assert.ok(externalTest.indexOf("ActivityScenario.launch<MainActivity>(externalIntent)") > externalTest.indexOf("chillywoodmobile://chat/"));
assert.ok(externalTest.indexOf("waitForIdleSync()") > externalTest.indexOf("ActivityScenario.launch<MainActivity>(externalIntent)"));
assert.ok(externalTest.indexOf("readStatus(context)") > externalTest.indexOf("waitForIdleSync()"));
assert.ok(runner.indexOf("if (!generation.backupPolicy.clear)") < runner.indexOf("generateOnce({ retain: true })"));
assert.ok(runner.indexOf("ANDROID_NATIVE_ACTION_BACKUP_EXCLUSION_MISSING") < runner.indexOf("gradleEvidence(generated)"));
assert.match(runner, /ANDROID_EMULATOR_SCENARIO_MATRIX_INCOMPLETE/u);
assert.doesNotMatch(instrumentationTemplate, /fun consumeColdActionExactlyOnce/u);
assert.ok(runner.indexOf("assertCompleteScenarioMatrix(scenarioMatrix)") < runner.indexOf("const devices = run(\"adb\", [\"devices\"])", runner.indexOf("const emulatorEvidence")));
assert.match(runner, /scenarioMatrix\.executionPlan\.length === scenarioMatrix\.required\.length/u);
assert.match(runner, /for \(const \{scenario, method, runner\} of scenarioMatrix\.executionPlan\)/u);
assert.match(runner, /methodResults\.length === scenarioMatrix\.required\.length/u);
assert.match(runner, /result\.status === 0 && \/OK \\\(1 test\\\)\//u);
assert.ok(runner.indexOf("assertNativeEntryPreflight();") < runner.indexOf("const generated = generateOnce({retain: true})"));
assert.match(runner, /ANDROID_EMULATOR_PACKAGE_PREEXISTED/u);
assert.match(runner, /dependencySource: "CURRENT_D2A_WORKTREE_ONLY"/u);
assert.doesNotMatch(runner, /git\("worktree", "list"/u);
assert.match(runner, /cleanupSelectedEmulator\(installState\)/u);
assert.doesNotMatch(runner, /const cleanupEmulator/u);
assert.ok(runner.indexOf("ANDROID_EMULATOR_PACKAGE_PREEXISTED") < runner.indexOf('adbRun(serial, ["install", appApk])'));
assert.doesNotMatch(runner, /\["install", "-r"/u);
assert.match(runner, /if \(!state\.installedTest && !state\.installedApp\) return \{attempted: false, verified: true\}/u);
assert.match(runner, /if \(state\.installedTest\)[\s\S]{0,180}\["uninstall", state\.testPackage\]/u);
assert.match(runner, /if \(state\.installedApp\)[\s\S]{0,180}\["uninstall", state\.appPackage\]/u);
assert.match(runner, /installedApp = packagePresent\([\s\S]{0,150}appInstall\.status === 0/u);
assert.match(runner, /installedTest = packagePresent\([\s\S]{0,150}testInstall\.status === 0/u);
assert.equal(report.classification, "HARNESS_PATH_BYPASS_CORRECTED_PRE_MERGE_D2A_CLEAR");
assert.equal(report.finiteLeaseRuntimeScope.result, "PASS");
assert.ok(report.finiteLeaseRuntimeScope.observedFiles <= report.finiteLeaseRuntimeScope.maximumFiles);
assert.ok(report.finiteLeaseRuntimeScope.observedChangedLines <= report.finiteLeaseRuntimeScope.maximumChangedLines);
assert.equal(report.generatedSource.runs, "3/3");
assert.equal(report.generatedSource.observedDigest, contract.target.d1GeneratedSourceDigest);
assert.equal(report.productDefects[0].code, "ANDROID_NATIVE_ACTION_BACKUP_EXCLUSION_MISSING");
assert.equal(report.productDefects[0].status, "RESOLVED_BY_GENERATED_EXACT_BACKUP_RULES");
assert.equal(report.productDefects[0].newBinaryRequired, true);
assert.equal(report.preservedSecurityTest.code, "ANDROID_EXTERNAL_NATIVE_ACTION_ORIGIN_UNTRUSTED");
assert.equal(report.preservedSecurityTest.emulatorResult, "PASS_EXACT_PRODUCTION_PATH");
assert.equal(report.preservedSecurityTest.antiVacuity, "ACTION_VIEW_ACTIVITY_LAUNCH_PRECEDES_EMPTY_STORE_ASSERTION");
assert.equal(report.scenarioMatrix.status, "PASS_12_OF_12_EXACT_PRODUCTION_PATH");
assert.equal(report.capabilities.compiledRuntimeParity.provided, 21);
assert.equal(report.proofTiers.T2_MODEL, "CLEAR_JVM_7_OF_7");
assert.equal(report.preMergeD2AEvidence.result, "CLEAR");
assert.equal(report.preMergeD2AEvidence.lifecycleInstrumentation, "12/12");
assert.equal(report.preMergeD2AEvidence.micInstrumentation, "4/4");
assert.equal(report.preMergeD2AEvidence.fatalAnrUnhandledMatches, 0);
assert.equal(report.logging.noncanonical[0].category, "ACTION_BUFFERED");
assert.equal(report.emulatorCleanupContract.preexistingTargetOrTestPackage, "REFUSE");
assert.equal(report.compile.releaseOrDistributionBuild, false);
assert.equal(report.compile.signedArtifactProof, false);
assert.equal(report.nonInterference.productNativeSourceModified, false);
assert.equal(report.nonInterference.providerContact, false);
assert.equal(report.cleanup.disposableProjectsRemoved, true);
assert.equal(report.cleanup.debugOrTestApksRetained, false);

const receiptAllowlist = JSON.parse(fs.readFileSync("config/assurance/command-allowlist-v1.json", "utf8"));
for (const commandId of ["d2a-lifecycle-native", "d2a-lifecycle-emulator", "d2a-mic-native"]) {
  assert.equal(receiptAllowlist.commands.find(({ id }) => id === commandId)?.timeoutMs, 21_600_000);
}
assert.equal(receiptAllowlist.commands.find(({ id }) => id === "d2a-runtime-backup")?.timeoutMs, 900_000);
const priorJavaHome = process.env.JAVA_HOME;
const expectedJavaHome = "/Applications/Android Studio.app/Contents/jbr/Contents/Home";
let observedNativeReceiptEnvironment;
process.env.JAVA_HOME = expectedJavaHome;
try {
  const nativeReceipt = runReceipt(
    receiptAllowlist,
    "d2a-lifecycle-emulator",
    ["scripts/assurance/android-generated-native-lifecycle.mjs", "--emulator", "--json"],
    {
      sourceHead: "a".repeat(40),
      sourceTree: "b".repeat(40),
      clock: () => 1,
      spawn: (_file, _args, options) => {
        observedNativeReceiptEnvironment = options.env;
        return { status: 0, signal: null, stdout: "{}\n", stderr: "" };
      },
      artifactWriter: () => "/tmp/chillywood-assurance-d2a/java-toolchain-receipt"
    }
  );
  assert.equal(nativeReceipt.ok, true);
  assert.equal(observedNativeReceiptEnvironment.JAVA_HOME, expectedJavaHome);
  assert.equal(Object.hasOwn(observedNativeReceiptEnvironment, "ANDROID_HOME"), false);
  assert.equal(Object.hasOwn(observedNativeReceiptEnvironment, "HOME"), false);
} finally {
  if (priorJavaHome === undefined) delete process.env.JAVA_HOME;
  else process.env.JAVA_HOME = priorJavaHome;
}
assert.match(runner, /ANDROID_GRADLE_TASK_TIMEOUT/u);
assert.match(runner, /ANDROID_MIC_NATIVE_TASK_TIMEOUT/u);
assert.match(runner, /timeout: 2 \* 60 \* 60 \* 1000/u);
assert.match(instrumentationTemplate, /CountDownLatch\(1\)/u);
assert.match(instrumentationTemplate, /PendingIntent\.OnFinished[\s\S]*completion\.countDown\(\)/u);
assert.match(instrumentationTemplate, /completion\.await\(10, TimeUnit\.SECONDS\)/u);
assert.ok(instrumentationTemplate.indexOf("completion.await") < instrumentationTemplate.indexOf("waitForIdleSync", instrumentationTemplate.indexOf("private fun dispatchTrusted")));
assert.match(runner, /ANDROID_EMULATOR_LIFECYCLE_FAILED[\s\S]*diagnostic/u);

console.log("android generated-native lifecycle source/model tests passed (hardened contract/report assertions; source 17/17; negative controls 12/12; CLI fail-closed 14/14; backup fixtures 14/14; capability and all direct dependency identities fail closed).");
