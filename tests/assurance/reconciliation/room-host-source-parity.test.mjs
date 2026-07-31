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
const deployedSha256 =
  "6cb22f9719c5c1325ac4ee814998a39e50318d92499504e8f4ece52717d5a765";
const forwardCorrectionSha256 =
  "4aea3d852682f921c13aa382f7afe59c971999793472f1654c0d74f3c7376127";

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

const [deployed, forwardCorrection, reportText, staticContract, migrationNames] =
  await Promise.all([
    readFile(deployedPath),
    readFile(forwardCorrectionPath),
    readFile(reportPath, "utf8"),
    readFile(staticContractPath),
    readdir("supabase/migrations"),
  ]);
const report = JSON.parse(reportText);

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
  assert.ok(forwardCorrectionPath > deployedPath);
  assert.equal(report.forwardCorrection.version, "20260730230031");
  assert.equal(
    report.forwardCorrection.name,
    "room_host_block_check_fail_closed_authority",
  );
  assert.equal(report.forwardCorrection.file, forwardCorrectionPath);
  assert.equal(report.forwardCorrection.rawSha256, forwardCorrectionSha256);
  assert.equal(report.forwardCorrection.deployed, false);
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
