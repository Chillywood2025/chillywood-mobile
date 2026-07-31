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

test("the report records the first assembled dry-run without substitution", () => {
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
  };

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
  assert.deepEqual(parity.linkedDryRun.identifiedLocalBeforeRemote, [
    removedCandidatePath,
  ]);
  assert.equal(
    parity.linkedDryRun.assembledHead,
    "98b9dc7364f1e656fe77291d0b62ecfe9d9f31ae",
  );
  assert.equal(parity.linkedDryRun.attempt, 1);
  assert.equal(parity.linkedDryRun.status, "FAIL_CLOSED_NO_APPLY");
  assert.equal(
    parity.linkedDryRun.errorClass,
    "LegacyDbPushMissingRemoteError",
  );
  assert.equal(parity.linkedDryRun.requiresIncludeAll, true);
  assert.equal(parity.linkedDryRun.includeAllUsed, false);
  assert.equal(parity.linkedDryRun.applyOccurred, false);
  assert.equal(parity.linkedDryRun.otherMigrationIdentified, false);
  assert.equal(
    parity.linkedDryRun.temporaryWorktreeUnlinkedImmediately,
    true,
  );
  assert.equal(report.safety.migrationDeployed, false);
  assert.equal(report.safety.deployedMigrationChanged, false);
  assert.equal(report.safety.confirmedUndeployedCandidateRemoved, true);
  assert.equal(report.safety.proofSubstitutionAccepted, false);
});
