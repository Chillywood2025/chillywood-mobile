import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const removedCandidatePath =
  "supabase/migrations/20260725224000_allow_room_host_participant_block_check.sql";
const deployedPath =
  "supabase/migrations/20260730161737_allow_room_host_participant_block_check.sql";
const forwardCorrectionPath =
  "supabase/migrations/20260730230031_room_host_block_check_fail_closed_authority.sql";
const reportPath =
  "docs/assurance/reconciliation/b3-room-host-block-check.json";
const staticContractPath =
  "tests/assurance/reconciliation/room-host-source-parity.test.mjs";
const focusedTestPath =
  "supabase/tests/room_host_participant_block_check_test.sql";
const compatibilityTestPath =
  "supabase/tests/watch_party_room_host_block_check_test.sql";
const scopeWaiverPath =
  "config/assurance/pr-b3-room-host-authorization-scope-waiver-v1.json";
const deployedSha256 =
  "6cb22f9719c5c1325ac4ee814998a39e50318d92499504e8f4ece52717d5a765";
const forwardCorrectionSha256 =
  "0d610a322fa54ae411609736d2db30031944e1d77ac9fc8ac722bd4cd6d70d38";

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
const stableValue = (value) =>
  Array.isArray(value)
    ? value.map(stableValue)
    : value && typeof value === "object"
      ? Object.fromEntries(
        Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
      )
      : value;

const HOST_A = "host-a";
const HOST_B = "host-b";
const PARTICIPANT = "participant";
const UNRELATED = "unrelated";
const ROOM_A = "room-a";
const ROOM_B = "room-b";
const modelFixture = {
  roomHosts: new Map([[ROOM_A, HOST_A], [ROOM_B, HOST_B]]),
  blocks: new Set([`${ROOM_A}:${PARTICIPANT}`]),
};

const evaluateAuthorization = (context, mutation = {}) => {
  const serviceAuthorized =
    (context.invokerRole === "service_role" &&
      context.requestRole === "service_role") ||
    (mutation.inferServiceFromNullIdentity && context.userId === null);
  const authenticatedAuthorized =
    context.invokerRole === "authenticated" &&
    context.requestRole === "authenticated" &&
    (context.userId !== null || mutation.allowNullAuthenticatedIdentity);

  if (!serviceAuthorized && !authenticatedAuthorized) {
    return { status: "denied" };
  }

  if (authenticatedAuthorized && context.actorId !== context.userId) {
    const exactHost = mutation.allowEveryAuthenticatedActorCheck ||
      (mutation.removeHostIdentityPredicate
        ? modelFixture.roomHosts.has(context.partyId)
        : mutation.removeHostPartyPredicate
          ? [...modelFixture.roomHosts.values()].includes(context.userId)
          : modelFixture.roomHosts.get(context.partyId) === context.userId);
    if (!exactHost) return { status: "denied" };
  }

  if (!context.partyId || !context.actorId) {
    return { status: "allowed", value: false };
  }

  const blocked = mutation.removeBlockPartyPredicate
    ? [...modelFixture.blocks].some((entry) =>
      entry.endsWith(`:${context.actorId}`)
    )
    : modelFixture.blocks.has(`${context.partyId}:${context.actorId}`);
  return { status: "allowed", value: blocked };
};

const assertDenied = (result) => assert.equal(result.status, "denied");
const assertAllowedValue = (result, value) => {
  assert.equal(result.status, "allowed");
  assert.equal(result.value, value);
};
const assertControlTrips = (assertion) => {
  assert.throws(assertion, { name: "AssertionError" });
};

const assertCorrectionSourceContract = (source) => {
  const text = source.toString("utf8");
  const body = text.match(/as \$\$([\s\S]+?)\$\$;/u)?.[1] ?? "";
  const executableBody = body.replace(/--.*$/gmu, "");
  const callerGate = body.indexOf("if not v_authenticated_authorized");
  const invalidInput = body.indexOf("if v_party_id is null");

  assert.match(text, /security definer\s+set search_path = ''/u);
  assert.match(text, /v_invoker_role = 'authenticated'[\s\S]+v_request_role = 'authenticated'/u);
  assert.match(text, /v_invoker_role = 'service_role'[\s\S]+v_request_role = 'service_role'/u);
  assert.match(text, /if v_auth_user_id is null then\s+raise exception 'room_block_check_forbidden'/u);
  assert.match(text, /where room\."party_id" = v_party_id\s+and room\."host_user_id"::text = v_auth_user_id/u);
  assert.match(text, /if not v_auth_is_room_host then\s+raise exception 'room_block_check_forbidden'/u);
  assert.match(text, /from public\."watch_party_rooms"/u);
  assert.match(text, /join public\."channel_audience_blocks"/u);
  assert.doesNotMatch(executableBody, /request\.jwt\.claim\.role/u);
  assert.doesNotMatch(executableBody, /\bcurrent_user\b/u);
  assert.doesNotMatch(executableBody, /\b(insert|update|delete|merge|execute|format)\b/iu);
  assert.ok(callerGate >= 0 && callerGate < invalidInput);
  assert.match(
    text,
    /revoke all on function\s+public\."watch_party_room_actor_blocked_by_host"\(text, text\)\s+from public, anon, authenticated, service_role;/u,
  );
  assert.match(
    text,
    /grant execute on function\s+public\."watch_party_room_actor_blocked_by_host"\(text, text\)\s+to authenticated, service_role;/u,
  );
  assert.doesNotMatch(text, /grant execute[\s\S]+\bto\s+anon\b/iu);
};

const [
  deployed,
  forwardCorrection,
  focusedTest,
  compatibilityTest,
  reportText,
  staticContract,
  scopeWaiverText,
  migrationNames,
] =
  await Promise.all([
    readFile(deployedPath),
    readFile(forwardCorrectionPath),
    readFile(focusedTestPath),
    readFile(compatibilityTestPath),
    readFile(reportPath, "utf8"),
    readFile(staticContractPath),
    readFile(scopeWaiverPath, "utf8"),
    readdir("supabase/migrations"),
  ]);
const report = JSON.parse(reportText);
const scopeWaiver = JSON.parse(scopeWaiverText);

test("the confirmed undeployed predecessor is absent", async () => {
  await assert.rejects(
    access(removedCandidatePath),
    (error) => error?.code === "ENOENT",
  );
  assert.deepEqual(
    migrationNames.filter((name) =>
      name.endsWith("_allow_room_host_participant_block_check.sql")
    ),
    ["20260730161737_allow_room_host_participant_block_check.sql"],
  );
});

test("the exact deployed migration remains byte-identical", () => {
  assert.equal(sha256(deployed), deployedSha256);
  assert.equal(
    report.deployedMigrationEvidence.version,
    "20260730161737",
  );
  assert.equal(
    report.deployedMigrationEvidence.name,
    "allow_room_host_participant_block_check",
  );
  assert.equal(report.deployedMigrationEvidence.sourceFile, deployedPath);
  assert.equal(
    report.deployedMigrationEvidence.sourceRawSha256,
    deployedSha256,
  );
  assert.equal(
    report.deployedMigrationEvidence.remoteStatementArraySha256,
    deployedSha256,
  );
  assert.equal(
    report.deployedMigrationEvidence.classification,
    "REMOTE_AND_SOURCE_MATCH",
  );
  assert.equal(report.deployedMigrationEvidence.deployedFileModified, false);
});

test("the forward-only authority correction remains present and unchanged", () => {
  assert.equal(sha256(forwardCorrection), forwardCorrectionSha256);
  assertCorrectionSourceContract(forwardCorrection);
  assert.ok(forwardCorrectionPath > deployedPath);
  assert.equal(report.forwardCorrection.version, "20260730230031");
  assert.equal(
    report.forwardCorrection.name,
    "room_host_block_check_fail_closed_authority",
  );
  assert.equal(report.forwardCorrection.file, forwardCorrectionPath);
  assert.equal(report.forwardCorrection.rawSha256, forwardCorrectionSha256);
  assert.equal(report.forwardCorrection.deployed, false);
  assert.equal(report.focusedTest.file, focusedTestPath);
  assert.equal(report.focusedTest.fileRawSha256, sha256(focusedTest));
  assert.equal(report.focusedTest.assertions, 48);
  assert.equal(report.focusedTest.executionStatus, "PASS_LOCAL_INTEGRATION");
  assert.deepEqual(
    {
      planned: report.focusedTest.execution.planned,
      executed: report.focusedTest.execution.executed,
      passed: report.focusedTest.execution.passed,
      failed: report.focusedTest.execution.failed,
    },
    { planned: 48, executed: 48, passed: 48, failed: 0 },
  );
  assert.equal(report.focusedTest.execution.remoteAccess, undefined);
  assert.equal(report.focusedTest.remoteAccess, false);
  assert.equal(report.focusedTest.execution.localAclReadback.publicExecute, false);
  assert.equal(report.focusedTest.execution.localAclReadback.anonExecute, false);
  assert.equal(
    report.focusedTest.execution.localAclReadback.authenticatedExecute,
    true,
  );
  assert.equal(
    report.focusedTest.execution.localAclReadback.serviceRoleExecute,
    true,
  );
  assert.equal(report.focusedTest.cases.length, 48);
  assert.match(
    report.focusedTest.cases.join("\n"),
    /invalid input cannot bypass caller authorization/u,
  );
  assert.match(
    report.focusedTest.cases.join("\n"),
    /behavioral cross-user membership RLS denial/u,
  );
  assert.match(
    report.focusedTest.cases.join("\n"),
    /content digest unchanged/u,
  );
  assert.match(report.gateApplicability.T2_MODEL, /^required-/u);
  assert.equal(report.proofTiers.T2_MODEL, "MODEL_CLEAR");
  assert.equal(
    report.proofTiers.T3_INTEGRATION,
    "INTEGRATION_CLEAR",
  );
  assert.match(report.permittedNextAction, /freeze and push/u);
  assert.match(report.permittedNextAction, /bind current truth/u);
  assert.equal(
    report.compatibilityFixture.file,
    compatibilityTestPath,
  );
  assert.equal(
    report.compatibilityFixture.fileRawSha256,
    sha256(compatibilityTest),
  );
  assert.equal(
    report.compatibilityFixture.executionStatus,
    "PASS_LOCAL_INTEGRATION",
  );
  assert.equal(report.compatibilityFixture.passed, 4);
  assert.equal(report.compatibilityFixture.failed, 0);
  assert.match(
    compatibilityTest.toString("utf8"),
    /set local role authenticated;/u,
  );
  assert.match(
    compatibilityTest.toString("utf8"),
    /request\.jwt\.claims/u,
  );
  assert.deepEqual(report.livePreCorrectionFunction, {
    evidenceMode: "owner-supplied-read-only-linked-inspection",
    owner: "postgres",
    securityDefiner: true,
    volatility: "stable",
    searchPath: "public",
    explicitExecuteGrantees: [
      "postgres",
      "anon",
      "authenticated",
      "service_role",
    ],
    publicExplicitGranteePresent: false,
    definitionSha256:
      "c68fb3282ba4955f41f4aae5c143dabf678f278c051eb641251bdfd7097c8ad2",
    changedByThisProgram: false,
  });
});

test("the deterministic authorization model satisfies the unmutated decision table", () => {
  const authenticated = (userId, partyId, actorId, requestRole = "authenticated") =>
    evaluateAuthorization({
      invokerRole: "authenticated",
      requestRole,
      userId,
      partyId,
      actorId,
    });
  const service = (partyId, actorId, userId = null, requestRole = "service_role") =>
    evaluateAuthorization({
      invokerRole: "service_role",
      requestRole,
      userId,
      partyId,
      actorId,
    });

  assertAllowedValue(
    authenticated(PARTICIPANT, ROOM_A, PARTICIPANT),
    true,
  );
  assertAllowedValue(authenticated(UNRELATED, ROOM_A, UNRELATED), false);
  assertAllowedValue(authenticated(HOST_A, ROOM_A, PARTICIPANT), true);
  assertDenied(authenticated(HOST_B, ROOM_A, PARTICIPANT));
  assertDenied(authenticated(UNRELATED, ROOM_A, PARTICIPANT));
  assertDenied(authenticated(PARTICIPANT, ROOM_A, PARTICIPANT, "unknown"));
  assertDenied(authenticated(null, ROOM_A, PARTICIPANT));
  assertAllowedValue(service(ROOM_A, PARTICIPANT), true);
  assertAllowedValue(service(ROOM_B, PARTICIPANT, UNRELATED), false);
  assertAllowedValue(authenticated(PARTICIPANT, null, PARTICIPANT), false);
  assertDenied(service(ROOM_A, PARTICIPANT, null, null));
});

test("the eight deterministic negative controls are non-vacuous", async (t) => {
  await t.test("1. removing null-auth denial is caught", () => {
    const mutant = evaluateAuthorization({
      invokerRole: "authenticated",
      requestRole: "authenticated",
      userId: null,
      partyId: ROOM_A,
      actorId: null,
    }, { allowNullAuthenticatedIdentity: true });
    assertControlTrips(() => assertDenied(mutant));
  });

  await t.test("2. removing the exact-host identity check is caught", () => {
    const mutant = evaluateAuthorization({
      invokerRole: "authenticated",
      requestRole: "authenticated",
      userId: UNRELATED,
      partyId: ROOM_A,
      actorId: PARTICIPANT,
    }, { removeHostIdentityPredicate: true });
    assertControlTrips(() => assertDenied(mutant));
  });

  await t.test("3. removing the block exact-party predicate is caught", () => {
    const mutant = evaluateAuthorization({
      invokerRole: "service_role",
      requestRole: "service_role",
      userId: null,
      partyId: ROOM_B,
      actorId: PARTICIPANT,
    }, { removeBlockPartyPredicate: true });
    assertControlTrips(() => assertAllowedValue(mutant, false));
  });

  await t.test("4. restoring anon execute is caught", () => {
    const mutant = forwardCorrection.toString("utf8").replace(
      "to authenticated, service_role;",
      "to anon, authenticated, service_role;",
    );
    assertControlTrips(() => assertCorrectionSourceContract(mutant));
  });

  await t.test("5. inferring service role from null identity is caught", () => {
    const mutant = evaluateAuthorization({
      invokerRole: "postgres",
      requestRole: "service_role",
      userId: null,
      partyId: ROOM_A,
      actorId: PARTICIPANT,
    }, { inferServiceFromNullIdentity: true });
    assertControlTrips(() => assertDenied(mutant));
  });

  await t.test("6. broadening the search path is caught", () => {
    const mutant = forwardCorrection.toString("utf8").replace(
      "set search_path = ''",
      "set search_path = public",
    );
    assertControlTrips(() => assertCorrectionSourceContract(mutant));
  });

  await t.test("7. allowing an unrelated authenticated caller is caught", () => {
    const mutant = evaluateAuthorization({
      invokerRole: "authenticated",
      requestRole: "authenticated",
      userId: UNRELATED,
      partyId: ROOM_A,
      actorId: PARTICIPANT,
    }, { allowEveryAuthenticatedActorCheck: true });
    assertControlTrips(() => assertDenied(mutant));
  });

  await t.test("8. allowing a host from another room is caught", () => {
    const mutant = evaluateAuthorization({
      invokerRole: "authenticated",
      requestRole: "authenticated",
      userId: HOST_B,
      partyId: ROOM_A,
      actorId: PARTICIPANT,
    }, { removeHostPartyPredicate: true });
    assertControlTrips(() => assertDenied(mutant));
  });
});

test("the report preserves the resolved first dry-run and binds the final no-apply pass", () => {
  const removed = report.removedSourceOnlyCandidate;
  const parity = report.assembledSourceParity;
  const removedClassification = parity.classifications.find(
    ({ version }) => version === "20260725224000",
  );
  const deployedClassification = parity.classifications.find(
    ({ version }) => version === "20260730161737",
  );
  const forwardClassification = parity.classifications.find(
    ({ version }) => version === "20260730230031",
  );
  const evidenceValue = {
    remoteEvidence: parity.remoteEvidence,
    classifications: parity.classifications,
    historicalLinkedDryRuns: parity.historicalLinkedDryRuns,
    linkedDryRun: parity.linkedDryRun,
  };
  const historicalDryRun = parity.historicalLinkedDryRuns[0];
  const finalDryRun = parity.linkedDryRun;

  assert.equal(report.staticSourceContract.file, staticContractPath);
  assert.equal(
    report.staticSourceContract.fileRawSha256,
    sha256(staticContract),
  );
  assert.equal(report.scopeWaiver.file, scopeWaiverPath);
  assert.equal(report.scopeWaiver.contractId, scopeWaiver.contractId);
  assert.equal(scopeWaiver.secondHighRiskDomain, false);
  assert.equal(scopeWaiver.fileBudget.waivedMaximum, 8);
  assert.equal(scopeWaiver.lineBudget.waivedMaximum, 2400);
  assert.equal(
    scopeWaiver.reviewStatus,
    "FRESH_FOUR_LANE_EXACT_HEAD_REVIEW_REQUIRED_BEFORE_MERGE",
  );
  assert.equal(removed.version, "20260725224000");
  assert.equal(removed.formerFile, removedCandidatePath);
  assert.equal(removed.remotePresent, false);
  assert.equal(removed.sourcePresent, false);
  assert.equal(removed.classificationBeforeRemoval, "SOURCE_ONLY");
  assert.equal(removed.deployedMigrationChanged, false);
  assert.deepEqual(removedClassification, {
    version: "20260725224000",
    name: "allow_room_host_participant_block_check",
    classification: "SOURCE_ONLY",
    sourcePresent: false,
    disposition: "removed-after-linked-dry-run-confirmation",
  });
  assert.equal(
    deployedClassification.classification,
    "REMOTE_AND_SOURCE_MATCH",
  );
  assert.equal(
    forwardClassification.classification,
    "SOURCE_ONLY_FORWARD_CORRECTION",
  );
  assert.equal(
    sha256(JSON.stringify(stableValue(evidenceValue))),
    parity.evidenceSha256,
  );
  assert.equal(parity.historicalLinkedDryRuns.length, 1);
  assert.deepEqual(historicalDryRun.identifiedLocalBeforeRemote, [
    removedCandidatePath,
  ]);
  assert.equal(
    historicalDryRun.assembledHead,
    "98b9dc7364f1e656fe77291d0b62ecfe9d9f31ae",
  );
  assert.equal(historicalDryRun.attempt, 1);
  assert.equal(historicalDryRun.status, "historical_resolved");
  assert.equal(historicalDryRun.originalStatus, "FAIL_CLOSED_NO_APPLY");
  assert.equal(
    historicalDryRun.errorClass,
    "LegacyDbPushMissingRemoteError",
  );
  assert.equal(historicalDryRun.requiresIncludeAll, true);
  assert.equal(historicalDryRun.includeAllUsed, false);
  assert.equal(historicalDryRun.applyOccurred, false);
  assert.equal(historicalDryRun.otherMigrationIdentified, false);
  assert.equal(
    historicalDryRun.temporaryWorktreeUnlinkedImmediately,
    true,
  );
  assert.equal(
    finalDryRun.assembledHead,
    "24237254fba83534018c3dca5e986d5c4f73ba66",
  );
  assert.equal(
    finalDryRun.assembledTree,
    "88588462ce33cd9fc0de72bc3be3515ef9d8b880",
  );
  assert.deepEqual(finalDryRun.componentHeads, {
    B0: "860ee2b80a9f215497128785b199add8418e66ee",
    B1: "7e39e49f2dc176fee29e78128443190638545ced",
    B2: "fdc04d5cfb02cfc34e408a11db265d55ce0dfdb6",
    B3: "67edc2b766e89b28b16962062ea7c7eb2c0d2565",
  });
  assert.equal(finalDryRun.cliVersion, "2.110.0");
  assert.equal(finalDryRun.attempt, 2);
  assert.equal(finalDryRun.status, "PASS_NO_APPLY");
  assert.equal(finalDryRun.includeAllUsed, false);
  assert.equal(finalDryRun.applyOccurred, false);
  assert.equal(finalDryRun.providerMutation, false);
  assert.equal(finalDryRun.databaseMutation, false);
  assert.equal(finalDryRun.pendingCount, 3);
  assert.deepEqual(finalDryRun.pendingMigrations, [
    {
      version: "20260730170000",
      name: "revenuecat_transfer_authoritative_ordering",
    },
    {
      version: "20260730230022",
      name: "cognitive_livekit_final_source_identity_cross_binding",
    },
    {
      version: "20260730230031",
      name: "room_host_block_check_fail_closed_authority",
    },
  ]);
  assert.deepEqual(finalDryRun.seedFiles, []);
  assert.deepEqual(finalDryRun.roleFiles, []);
  assert.equal(finalDryRun.temporaryWorktreeUnlinkedImmediately, true);
  assert.equal(report.safety.migrationDeployed, false);
  assert.equal(report.safety.deployedMigrationChanged, false);
  assert.equal(report.safety.confirmedUndeployedCandidateRemoved, true);
  assert.equal(report.safety.proofSubstitutionAccepted, false);
});
