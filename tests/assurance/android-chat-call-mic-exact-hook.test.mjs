#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";

const sourcePath = "hooks/use-livekit-chat-call-session.ts";
const contractPath = "config/assurance/android-chat-call-mic-control-v1.json";
const mountedTestPath = "tests/assurance/livekit-chat-call-mic-mounted-hook.test.mjs";
const mountedHelperPath = "tests/assurance/helpers/livekit-mounted-hook-harness.mjs";
const exactTestPath = "tests/assurance/android-chat-call-mic-exact-hook.test.mjs";
const expectedBindingPaths = [sourcePath, mountedTestPath, mountedHelperPath, exactTestPath];
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const source = fs.readFileSync(sourcePath, "utf8");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));

const slice = (value, startMarker, endMarker) => {
  assert.equal(value.split(startMarker).length - 1, 1, `unique start marker: ${startMarker}`);
  assert.equal(value.split(endMarker).length - 1, 1, `unique end marker: ${endMarker}`);
  const start = value.indexOf(startMarker);
  const end = value.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `ordered source slice: ${startMarker}`);
  return value.slice(start, end);
};

const invariants = (candidate, candidateContract = contract) => {
  const renderPrefix = slice(
    candidate,
    "export function useLiveKitChatCallSession",
    "  useLayoutEffect(() => {",
  );
  const commitSlice = slice(
    candidate,
    "  useLayoutEffect(() => {",
    "  useEffect(() => {\n    onRoomEndedRef.current = onRoomEnded;",
  );
  const schedulerSlice = slice(
    candidate,
    "  const scheduleLatestMediaReconciliation",
    "  const setSpeaker",
  );
  const reconciliationSlice = slice(
    candidate,
    "  const reconcileLatestCommittedMedia",
    "  const scheduleLatestMediaReconciliation",
  );
  const microphoneSlice = slice(candidate, "  const setMicrophoneEnabled", "  const setCameraEnabled");
  const heartbeatSlice = slice(candidate, "      heartbeat = setInterval", "    };\n\n    void initialize()");
  const permissionSlice = slice(candidate, "  const setReconciliationWarning", "  const isCommittedSessionCurrent");
  const cleanupSlice = slice(candidate, "  const cleanupSession", "  const leaveRoom");
  const initialMembershipSlice = slice(candidate, "      const initialMembership", "      heartbeat = setInterval");
  const reconciliationWarningOnly = slice(
    candidate,
    "  const setReconciliationWarning",
    "  const clearReconciliationWarning",
  );
  const returnedState = slice(candidate, "  return {\n    room,", "  };\n}");

  assert.doesNotMatch(renderPrefix, /sessionGenerationRef\.current\s*[+]?=/u, "generation is render-pure");
  assert.doesNotMatch(renderPrefix, /committedSessionRef\.current\s*=/u, "session binding is render-pure");
  assert.match(commitSlice, /sessionGenerationRef\.current = generation/u);
  assert.match(commitSlice, /committedSessionRef\.current = Object\.freeze/u);
  assert.match(schedulerSlice, /enqueueSessionMediaWrite\(binding/u);
  assert.match(schedulerSlice, /return reconcileLatestCommittedMedia\(binding, request\.reconcileNative\)/u);
  assert.match(reconciliationSlice, /cameraRequestedRef\.current/u);
  assert.match(reconciliationSlice, /micRequestedRef\.current/u);
  assert.match(heartbeatSlice, /scheduleLatestMediaReconciliation\(false\)/u);
  assert.doesNotMatch(heartbeatSlice, /performMembershipMediaWrite\(/u);
  assert.doesNotMatch(candidate, /productRoomRef\.current\s*===/u);
  assert.match(candidate, /left\.generation === right\.generation/u);
  assert.match(candidate, /left\.liveKitRoom === right\.liveKitRoom/u);
  assert.match(candidate, /left\.participantAuthority === right\.participantAuthority/u);
  assert.match(candidate, /const writeKey = `\$\{binding\.normalizedRoomId\}:\$\{binding\.userId\}`/u);
  assert.match(candidate, /Promise\.race\(\[/u);
  assert.match(candidate, /MEDIA_WRITE_PREDECESSOR_DRAIN_TIMEOUT_MS/u);
  assert.match(candidate, /predecessorTimedOut && predecessor[\s\S]{0,120}mediaWriteTailsRef\.current\.set\(writeKey, predecessor\)/u);
  assert.doesNotMatch(candidate, /blockedMediaWriteKeysRef/u);
  assert.match(candidate, /if \(!isCommittedSessionCurrent\(binding\)\) return null;/u);
  assert.match(candidate, /current\.roomState === "terminal" && roomState !== "terminal"/u);
  assert.match(candidate, /const bindingStillCurrent = sameCommittedAuthority\(committedSessionRef\.current, binding\)/u);
  assert.match(cleanupSlice, /if \(replacementReusesDurableAuthority\) return null;/u);
  assert.match(cleanupSlice, /const endContext = currentDurableContext\(\);/u);
  assert.match(cleanupSlice, /const leaveContext = currentDurableContext\(\);/u);
  assert.ok(
    cleanupSlice.indexOf("await liveKitRoom.disconnect") < cleanupSlice.indexOf("const endContext = currentDurableContext();"),
    "cleanup revalidates durable authority after native shutdown",
  );
  assert.match(candidate, /allowBackgroundAudioRef\.current = allowBackgroundAudio/u);
  assert.doesNotMatch(candidate, /\n    allowBackgroundAudio,\n/u);
  assert.match(initialMembershipSlice, /if \(!initialMembership\) \{[\s\S]{0,180}setChannelState\("reconnecting"\)/u);
  assert.ok(
    initialMembershipSlice.indexOf("setChannelState(\"live\")")
      > initialMembershipSlice.indexOf("} else {"),
    "initial session becomes live only after durable convergence",
  );
  assert.match(permissionSlice, /setMediaReconciliationState\("warning"\)/u);
  assert.doesNotMatch(reconciliationWarningOnly, /set(?:Camera|Microphone)PermissionState/u);
  assert.doesNotMatch(permissionSlice, /setCameraPermissionState\("denied"\).*setReconciliationWarning/su);
  assert.match(returnedState, /cameraPermissionState,/u);
  assert.match(returnedState, /microphonePermissionState,/u);
  assert.match(returnedState, /mediaReconciliationMessage,/u);
  assert.match(returnedState, /cameraPermissionState === "denied" \|\| microphonePermissionState === "denied"/u);
  assert.match(microphoneSlice, /const membership = await performMembershipMediaWrite/u);
  assert.ok(
    microphoneSlice.indexOf("const membership = await performMembershipMediaWrite")
      < microphoneSlice.indexOf("micRequestedRef.current = nextEnabled"),
    "durable convergence precedes requested/UI success commit",
  );
  const requestedCommit = microphoneSlice.indexOf("micRequestedRef.current = nextEnabled");
  assert.ok(
    microphoneSlice.indexOf("setMicEnabledState(nextEnabled)", requestedCommit)
      < microphoneSlice.indexOf("return true;", requestedCommit),
    "UI commit precedes success return",
  );
  assert.doesNotMatch(microphoneSlice, /requestLiveKitParticipantToken/u);
  assert.doesNotMatch(microphoneSlice, /cleanupSession\(/u);
  assert.doesNotMatch(microphoneSlice, /mediaProvider\s*=/u);
  assert.match(microphoneSlice, /if \(nextEnabled\) \{\s*setMicrophonePermissionState\("granted"\)/u);

  assert.equal(candidateContract.proofTiers.T2_MODEL, "MODEL_CLEAR_MOUNTED_HOOK_EXECUTION");
  assert.equal(candidateContract.mountedHookEvidence.execution, "REACT_DOM_COMMIT_PHASE_EXACT_HOOK");
  assert.equal(candidateContract.mountedHookEvidence.testFile, mountedTestPath);
  assert.equal(candidateContract.mountedHookEvidence.helperFile, mountedHelperPath);
  assert.equal(candidateContract.mountedHookEvidence.executesInternalAdapterModel, false);
};

test("source bindings cover only the exact product and executable evidence files", () => {
  assert.deepEqual(Object.keys(contract.sourceBindings).sort(), [...expectedBindingPaths].sort());
  for (const bindingPath of expectedBindingPaths) {
    assert.equal(contract.sourceBindings[bindingPath], hash(fs.readFileSync(bindingPath)));
  }
});

test("declared source slices are unique, ordered, and digest-bound", () => {
  for (const binding of Object.values(contract.sourceSlices)) {
    assert.ok(expectedBindingPaths.includes(binding.path));
    const content = fs.readFileSync(binding.path, "utf8");
    assert.equal(hash(slice(content, binding.start, binding.end)), binding.sha256);
  }
});

test("source structure and T2 contract preserve the five corrections", () => {
  invariants(source, contract);
  assert.equal(contract.requiredCaseMatrix.length, 38);
  assert.equal(new Set(contract.requiredCaseMatrix).size, 38);
});

const mutateAfter = (value, marker, from, to) => {
  const markerIndex = value.indexOf(marker);
  const mutationIndex = value.indexOf(from, markerIndex);
  assert.ok(markerIndex >= 0 && mutationIndex > markerIndex, `mutant target after ${marker}`);
  return `${value.slice(0, mutationIndex)}${to}${value.slice(mutationIndex + from.length)}`;
};

const mutants = [
  ["HEARTBEAT_BYPASSES_STRICT_LEASE", (value) => value.replace(
    "void scheduleLatestMediaReconciliation(false).then((reconciled) => {",
    "void performMembershipMediaWrite(false, false); Promise.resolve(false).then((reconciled) => {",
  )],
  ["HEARTBEAT_QUEUES_STALE_MIC_VALUE", (value) => value.replace(
    "return reconcileLatestCommittedMedia(binding, request.reconcileNative);",
    "return performMembershipMediaWrite(false, false, \"active\", true, binding);",
  )],
  ["PRODUCT_ROOM_OBJECT_EQUALITY_RESTORED", (value) => value.replace(
    "|| roomRef.current !== binding.liveKitRoom",
    "|| productRoomRef.current === productRoomRef.current\n      || roomRef.current !== binding.liveKitRoom",
  )],
  ["GENERATION_MUTATED_DURING_RENDER", (value) => value.replace(
    "  useLayoutEffect(() => {",
    "  sessionGenerationRef.current += 1;\n  useLayoutEffect(() => {",
  )],
  ["ABANDONED_RENDER_INCREMENTS_GENERATION", (value) => value.replace(
    "  useLayoutEffect(() => {",
    "  committedSessionRef.current = committedSessionRef.current;\n  useLayoutEffect(() => {",
  )],
  ["RECONCILIATION_MARKS_PERMISSION_DENIED", (value) => value.replace(
    "setMediaReconciliationState(\"warning\");",
    "setCameraPermissionState(\"denied\"); setMediaReconciliationState(\"warning\");",
  )],
  ["SETTINGS_ENABLED_BY_RECONCILIATION", (value) => value.replace(
    "cameraPermissionState === \"denied\" || microphonePermissionState === \"denied\"",
    "!!mediaReconciliationMessage",
  )],
  ["EXTRACTED_ADAPTER_LABELED_MOUNTED", (_value, value) => ({
    ...value,
    mountedHookEvidence: { ...value.mountedHookEvidence, execution: "EXTRACTED_SOURCE_SLICE_VM" },
  })],
  ["T2_CONTRACT_EVIDENCE_DISAGREEMENT", (_value, value) => ({
    ...value,
    proofTiers: { ...value.proofTiers, T2_MODEL: "BLOCKED_INTERNAL" },
  })],
  ["STALE_SESSION_WRITES_REPLACEMENT_STATE", (value) => mutateAfter(
    value,
    "  const enqueueSessionMediaWrite",
    "if (!isCommittedSessionCurrent(binding)) return null;",
    "if (!binding) return null;",
  )],
  ["SUCCESS_BEFORE_DURABLE_CONVERGENCE", (value) => value.replace(
    "micRequestedRef.current = nextEnabled;",
    "micRequestedRef.current = nextEnabled; return true;",
  )],
  ["TOKEN_REQUEST_DURING_TOGGLE", (value) => mutateAfter(
    value,
    "  const setMicrophoneEnabled",
    "const binding = committedSessionRef.current;",
    "void requestLiveKitParticipantToken({}); const binding = committedSessionRef.current;",
  )],
  ["PROVIDER_MUTATION_DURING_TOGGLE", (value) => mutateAfter(
    value,
    "  const setMicrophoneEnabled",
    "const binding = committedSessionRef.current;",
    "mediaProvider = \"webrtc\"; const binding = committedSessionRef.current;",
  )],
  ["CALL_CLEANUP_ON_TOGGLE_FAILURE", (value) => mutateAfter(
    value,
    "  const setMicrophoneEnabled",
    "setReconciliationWarning();",
    "void cleanupSession(); setReconciliationWarning();",
  )],
  ["DURABLE_QUEUE_KEYED_BY_SESSION_GENERATION", (value) => value.replace(
    "const writeKey = `${binding.normalizedRoomId}:${binding.userId}`;",
    "const writeKey = String(binding.generation);",
  )],
  ["UNBOUNDED_MEDIA_WRITE_PREDECESSOR", (value) => value.replace(
    "const drained = await Promise.race([",
    "const drained = await Promise.all([",
  )],
  ["TERMINAL_SESSION_RESURRECTION", (value) => value.replace(
    "|| (current.roomState === \"terminal\" && roomState !== \"terminal\")",
    "|| false",
  )],
  ["DISABLE_ERASES_PERMISSION_DENIAL", (value) => mutateAfter(
    value,
    "  const setMicrophoneEnabled",
    "if (nextEnabled) {\n            setMicrophonePermissionState(\"granted\");",
    "{\n            setMicrophonePermissionState(\"granted\");",
  )],
  ["STALE_CLEANUP_LEAVES_REPLACEMENT", (value) => value.replace(
    "if (replacementReusesDurableAuthority) return null;",
    "if (false) return null;",
  )],
  ["MEDIA_QUEUE_TIMEOUT_DROPS_PREDECESSOR", (value) => value.replace(
    "mediaWriteTailsRef.current.set(writeKey, predecessor);",
    "mediaWriteTailsRef.current.delete(writeKey);",
  )],
  ["ALLOW_BACKGROUND_AUDIO_RESTARTS_SESSION", (value) => value.replace(
    "    activateCommittedSession,\n    clearReconciliationWarning,",
    "    activateCommittedSession,\n    allowBackgroundAudio,\n    clearReconciliationWarning,",
  )],
  ["STALE_CLEANUP_REUSES_DURABLE_SNAPSHOT", (value) => value.replace(
    "const leaveContext = currentDurableContext();",
    "const leaveContext = endContext;",
  )],
  ["INITIAL_CONVERGENCE_FAILURE_MARKS_LIVE", (value) => value.replace(
    "if (!initialMembership) {",
    "if (false) {",
  )],
];

test("all required negative-control mutants are rejected", () => {
  assert.deepEqual(contract.negativeControls, mutants.map(([id]) => id));
  for (const [id, mutate] of mutants) {
    let mutatedSource = source;
    let mutatedContract = contract;
    const result = mutate(source, contract);
    if (typeof result === "string") mutatedSource = result;
    else mutatedContract = result;
    assert.throws(() => invariants(mutatedSource, mutatedContract), undefined, id);
  }
});

test("proof tiers remain separated after mounted T2 clears", () => {
  assert.equal(contract.proofTiers.T1_SOURCE, "SOURCE_BOUND");
  assert.equal(contract.proofTiers.T2_MODEL, "MODEL_CLEAR_MOUNTED_HOOK_EXECUTION");
  assert.equal(contract.proofTiers.T3_INTEGRATION, "BLOCKED_INTERNAL_NATIVE_AUDIO_MATRIX_INCOMPLETE");
  assert.equal(contract.proofTiers.T4_NATIVE_PROVIDER, "BLOCKED_INTERNAL_NATIVE_AUDIO_MATRIX_INCOMPLETE");
  assert.equal(contract.providerContact, false);
  assert.equal(contract.hostedCodexSecurity, false);
  assert.equal(contract.providerCodexReview, "OPTIONAL_ADVISORY_NOT_REQUESTED");
});
