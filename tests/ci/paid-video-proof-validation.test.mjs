import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validatePaidVideoPostgresProof, aggregatePaidVideoRetainedHttpProof,
  wrapPaidVideoRetainedHttpCaptures, validatePaidVideoPlatformHttpAggregate } from "../../scripts/ci/paid-video-proof-validation.mjs";

// These are validator-only fabricated records. No historical run, response,
// user, transaction, capture, or provider artifact is copied into the fixture.
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fakeHash = hash("validator-only input");
const clone = (value) => structuredClone(value);
const source = "fe5e8295d8e0dae69d8fa60a5a4b23040a781bcd29fd046c205402a788470ca4";
const installation = { fresh: "09c284aa0b56536f6975ef3debb86d1b29f157f04c3b1a1593fec8e7b8d5e563",
  retained: "0740568bed37dbc21cb462efcfd577078c9325f3449b1e50bfac6fe57e8e559a" };
const map = (count) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`fixture-${i}`, hash(`fixture-${i}`)]));
const rows = (count) => Array.from({ length: count }, (_, i) => ({ name: `validator-only case ${i}` }));
function postgres(profile) {
  const count = profile === "fresh" ? 31 : 19;
  const sourceHashes = Object.fromEntries(Array.from({ length: 39 }, (_, i) => [`fixture-${i}.sql`, hash(`sql-${i}`)]));
  const orderedModules = Array.from({ length: 42 }, (_, index) => ({ position: index + 1,
    path: `isolated-runtime/sandbox-commerce-v1/fixture-${index % 39}.sql`, sha256: sourceHashes[`fixture-${index % 39}.sql`] }));
  const expected = { profile, installationSourceSha256: installation[profile], profileManifestSha256: fakeHash,
    orderedModules, sourceHashes, fixtureHashes: map(profile === "fresh" ? 5 : 2), edgeHashes: map(6), harnessHash: fakeHash };
  if (profile === "retained") Object.assign(expected, { captureFixtureSourceHashes: map(4), retainedCaptureSourceSha256: fakeHash });
  const proof = { ...clone(expected), status: "passed", engine: "postgres (PostgreSQL) 17.6", caseCount: count, cases: rows(count),
    cleanup: { sessionsClosed: true, clusterStopped: true, clusterNotRunningVerified: true, directoryRemoved: true },
    combinedCaptures: [{ validatorOnly: true }], durationMs: 100 };
  delete proof.profile;
  if (profile === "retained") Object.assign(proof, { retainedCaptureDataSha256: fakeHash,
    retainedCaptureCounts: { project_reservations: 1, test_store_qualification_connections: 1, test_store_qualification_controls: 1,
      test_store_qualification_entries: 1, test_store_qualification_deliveries: 1, test_store_qualification_exclusions: 0, test_store_qualification_conflicts: 0 } });
  return { proof, expected, profile };
}

for (const profile of ["fresh", "retained"]) {
  test(`${profile} PostgreSQL proof accepts complete validator fixture and binds every captured source field`, () => {
    const fixture = postgres(profile);
    assert.equal(validatePaidVideoPostgresProof(fixture.proof, fixture), fixture.proof);
    for (const key of ["installationSourceSha256", "profileManifestSha256", "harnessHash"])
      assert.throws(() => validatePaidVideoPostgresProof({ ...fixture.proof, [key]: hash("changed") }, fixture), /SOURCE_MISMATCH/u, key);
    for (const key of ["sourceHashes", "fixtureHashes", "edgeHashes"]) {
      const mutated = clone(fixture.proof); mutated[key][Object.keys(mutated[key])[0]] = hash("changed");
      assert.throws(() => validatePaidVideoPostgresProof(mutated, fixture), /SOURCE_MISMATCH/u, key);
    }
    const changedOrder = clone(fixture.proof); changedOrder.orderedModules.reverse();
    assert.throws(() => validatePaidVideoPostgresProof(changedOrder, fixture), /SOURCE_MISMATCH/u);
  });

  test(`${profile} PostgreSQL proof rejects incomplete, duplicated, failed or improperly cleaned runs`, () => {
    for (const mutate of [
      (v) => { v.status = "failed"; }, (v) => { v.engine = "postgres (PostgreSQL) 17.5"; },
      (v) => { v.caseCount--; }, (v) => { v.cases.pop(); }, (v) => { v.cases[1].name = v.cases[0].name; },
      (v) => { v.cases[0].name = ""; }, (v) => { v.cleanup.directoryRemoved = false; },
      (v) => { delete v.cleanup.sessionsClosed; }, (v) => { v.cleanup.unexpected = true; },
      (v) => { v.combinedCaptures = []; }, (v) => { v.durationMs = 0; },
    ]) {
      const fixture = postgres(profile), proof = clone(fixture.proof); mutate(proof);
      assert.throws(() => validatePaidVideoPostgresProof(proof, fixture), /PAID_VIDEO_PROOF/u);
    }
    const fixture = postgres(profile), incomplete = clone(fixture.expected); delete incomplete.sourceHashes["fixture-0.sql"];
    assert.throws(() => validatePaidVideoPostgresProof(fixture.proof, { profile, expected: incomplete }), /HASH_MAP_COUNT/u);
  });
}

test("retained PostgreSQL proof binds capture sources and requires retained original evidence", () => {
  for (const mutate of [
    (v) => { v.captureFixtureSourceHashes["fixture-0"] = hash("changed"); },
    (v) => { v.retainedCaptureSourceSha256 = hash("changed"); },
    (v) => { v.retainedCaptureDataSha256 = "missing"; },
    (v) => { v.retainedCaptureCounts.test_store_qualification_entries = 0; },
    (v) => { v.retainedCaptureCounts.project_reservations = -1; },
    (v) => { delete v.retainedCaptureCounts.test_store_qualification_conflicts; },
  ]) {
    const fixture = postgres("retained"), proof = clone(fixture.proof); mutate(proof);
    assert.throws(() => validatePaidVideoPostgresProof(proof, fixture), /PAID_VIDEO_PROOF/u);
  }
});

function http(t) {
  // Synthetic evidence uses an explicit whole-second clock inside the attempt.
  // Native filesystem sub-millisecond mtimes can exceed integer Date.now() in
  // the same tick. Do not weaken the production stale/future rejection for this.
  const evidenceTimeMs = Math.floor(Date.now() / 1000) * 1000 - 1000;
  const attemptStartedAtMs = evidenceTimeMs - 1000;
  const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "paid-video-validator-"));
  const expectedRunId=randomBytes(16).toString('hex'),evidenceDirectory=path.join(parent,'chillywood-local-auth-'+expectedRunId);
  fs.mkdirSync(evidenceDirectory,{mode:0o700});t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const project='chillywood-auth-fixture-'+expectedRunId.slice(0,12);
  const summary = { status: "passed", cleanupVerified: true, error: null, evidenceDirectory,runId:expectedRunId };
  const template=new URL('../../isolated-runtime/sandbox-commerce-v1/tests/local-auth-paid-video-retained-platform-v2/',import.meta.url);
  const pinsRaw=fs.readFileSync(new URL('image-chains.json',template)),pins=JSON.parse(pinsRaw);
  const imageChains=Object.fromEntries(Object.entries(pins.images).map(([role,pin])=>[role,{reference:pin.reference,indexDigest:pin.index.digest,
    manifestDigest:pin.platformManifest.digest,configDigest:pin.config.digest,os:'linux',architecture:'amd64'}]));
  const executionInputs = {...map(103),'image-chains.json':hash(pinsRaw)};
  const artifacts = Object.fromEntries(["edge-listener-proof.json", "edge-process-log.json", "gateway-health-proof.json",
    "install-proof.json", "loopback-bindings.json", "settlement-boundary-proof.json", "synthetic-scanner-boundary.json"].map((name) => [name, { validatorOnly: true }]));
  Object.assign(artifacts, {
    "summary.json": summary,
    "harness-source-hashes.json": executionInputs,
    "ownership.json": { root: evidenceDirectory, project, runId: expectedRunId },
    "stack-provenance.json": { root:evidenceDirectory,runId:expectedRunId,project, sourceProfile: { source }, freshVolume: true, reusedCliVolume: false, repoMigrationBootstrapExecuted: false },
    "image-chain-proof.json":imageChains,
    "http-qualification-proof.json": { source, cases: rows(103).map((row) => ({ ...row, httpStatus: 200, response: { validatorOnly: true } })) },
    "final-gateway-proof.json": { source, cases: 103, actualGatewayEntries: 4, actualAuth: true, actualPostgREST: true,
      actualLocalOriginHttp: true, liveMoneyOff: true, freeBuyerRemainsFree: true, providerOrigin: "synthetic" },
    "cleanup-proof.json": { project, taskResourcesRemaining: [], unownedResourcesTouched: false,
      generatedSecretFilesRemoved: ["edge.private.json", "credentials.private.json", "accounts.private.json", "purchase.private.json", "compose.private.json", "gateway.private.json"] },
    "edge-cleanup-proof.json": { processStopped: true },
    "pre-cleanup-proof.json": { authSessionsRemaining: 0 },
    "install-permission-proof.json": { actualInstaller: "postgres", installerIsSuperuser: false,
      omittedFinalRevokeAbortedCommit: true, failedInstallRolledBackFreshSchemaAndRoles: true, finalPublicCreatePrivilege: false,
      retainedCapture: { phase: "sealed", rollbackPreserved: true, successfulInstallPreserved: true, beforeAndAfterSha256: fakeHash } },
    "auth-issuance-proof.json": { sessionClaimsMatchedOfficialAuthRows: true, accounts: 2 },
    "generic-delivery-isolation-proof.json": { privateServiceExecutionDenied: true, publicRpcAbsent: true, privateSchemaNotExposed: true, coreOwnerStillOwnsPrivateGraph: true },
    "range-deadline-proof.json": { clientStartedAtMs: 10, clientReceivedAtMs: 20, serverAuthorizedUntilMs: 100, remainingMilliseconds: 80 },
  });
  const write = (name, value) => {
    const file = path.join(evidenceDirectory, name);
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
    fs.utimesSync(file, evidenceTimeMs / 1000, evidenceTimeMs / 1000);
    const mtime = fs.statSync(file).mtimeMs;
    assert.ok(Number.isInteger(mtime) && mtime > attemptStartedAtMs && mtime < Date.now());
  };
  for (const [name, value] of Object.entries(artifacts)) write(name, value);
  return { summary, evidenceDirectory,expectedEvidenceDirectory:evidenceDirectory,expectedRunId, executionInputs,
    templateManifestSha256:hash(fs.readFileSync(new URL('source-manifest.json',template))), attemptStartedAtMs, evidenceTimeMs,
    artifacts, write, read: (name) => fs.readFileSync(path.join(evidenceDirectory, name)) };
}

test("HTTP aggregator binds same-attempt raw evidence and wrapper preserves all 103 captured cases", (t) => {
  const fixture = http(t), aggregate = aggregatePaidVideoRetainedHttpProof(fixture);
  assert.equal(aggregate.protocol, "scpv-retained-platform-auth-http-proof-v1");
  assert.equal(aggregate.caseCount, 103); assert.equal(aggregate.actualGatewayEntries, 4);
  assert.equal(Object.keys(aggregate.executionInputs).length, 104);
  for (const [name, digest] of Object.entries(aggregate.evidenceSha256)) assert.equal(digest, hash(fixture.read(name)));
  const aggregateBytes = Buffer.from(JSON.stringify(aggregate, null, 2) + "\n");
  const httpCaptureBytes = fixture.read("http-qualification-proof.json");
  const identity={expectedEvidenceDirectory:fixture.expectedEvidenceDirectory,expectedRunId:fixture.expectedRunId};
  const wrapped = wrapPaidVideoRetainedHttpCaptures({ aggregateBytes, httpCaptureBytes,...identity });
  assert.equal(wrapped.protocol, "scpv-retained-platform-gateway-http-captures-v1");
  assert.deepEqual(wrapped.expectedAttempt,identity);
  assert.equal(wrapped.sourceProofSha256, hash(aggregateBytes));
  assert.deepEqual(wrapped.cases, fixture.artifacts["http-qualification-proof.json"].cases);
  assert.equal(wrapped.caseCount, 103); assert.equal(wrapped.actualGatewayEntries, 4);
  const replaced = JSON.parse(httpCaptureBytes); replaced.cases[0].response = { changed: true };
  assert.throws(() => wrapPaidVideoRetainedHttpCaptures({ aggregateBytes, httpCaptureBytes: Buffer.from(JSON.stringify(replaced)),...identity }), /HTTP_CAPTURE_HASH/u);
  assert.throws(() => wrapPaidVideoRetainedHttpCaptures({ aggregateBytes: aggregate, httpCaptureBytes }), /HTTP_RAW_BYTES_REQUIRED/u);
});

test('HTTP identity rejects old artifacts recopied with fresh timestamps and foreign caller roots',t=>{
  const fixture=http(t),old=aggregatePaidVideoRetainedHttpProof(fixture);
  assert.equal(validatePaidVideoPlatformHttpAggregate(old,old.expectedAttempt),undefined);
  for(const runId of ['malformed-unrelated-old-attempt','ff'.repeat(16)]){
    fixture.write('ownership.json',{...fixture.artifacts['ownership.json'],runId});
    assert.throws(()=>aggregatePaidVideoRetainedHttpProof(fixture),/PAID_VIDEO_PROOF/u);
  }
  fixture.write('ownership.json',fixture.artifacts['ownership.json']);
  const newRunId='aa'.repeat(16),newRoot=path.join(path.dirname(fixture.evidenceDirectory),'chillywood-local-auth-'+newRunId);
  fs.mkdirSync(newRoot,{mode:0o700});
  for(const name of Object.keys(fixture.artifacts)){
    const file=path.join(newRoot,name);fs.writeFileSync(file,fixture.read(name));
    fs.utimesSync(file,fixture.evidenceTimeMs/1000,fixture.evidenceTimeMs/1000);
  }
  assert.throws(()=>aggregatePaidVideoRetainedHttpProof({...fixture,evidenceDirectory:newRoot,expectedEvidenceDirectory:newRoot,
    expectedRunId:newRunId,attemptStartedAtMs:fixture.attemptStartedAtMs}),/PAID_VIDEO_PROOF/u);
  for(const change of [{expectedRunId:newRunId},{expectedEvidenceDirectory:newRoot},{expectedRunId:undefined}])
    assert.throws(()=>validatePaidVideoPlatformHttpAggregate(old,{...old.expectedAttempt,...change}),/PAID_VIDEO_PROOF/u);
  const historical={...old,protocol:'scpv-retained-auth-http-proof-v1'};
  assert.throws(()=>validatePaidVideoPlatformHttpAggregate(historical,old.expectedAttempt),/HTTP_PROTOCOL/u);
  const predecessorSource={...old,source:'22c7dcfd9a2569b9b902db79f8468df90c1058b53fe663cdefe01a63bcd663b2'};
  assert.throws(()=>validatePaidVideoPlatformHttpAggregate(predecessorSource,old.expectedAttempt),/HTTP_SOURCE/u);
  const incomplete=clone(old);
  for(let i=0;i<4;i++)delete incomplete.executionInputs['fixture-'+i];
  assert.throws(()=>validatePaidVideoPlatformHttpAggregate(incomplete,old.expectedAttempt),/HASH_MAP_COUNT/u);
});

test('all four image identities must match the immutable raw index-platform-config chains',t=>{
  const fixture=http(t);
  for(const role of ['db','auth','rest','gateway'])for(const field of ['reference','indexDigest','manifestDigest','configDigest','os','architecture']){
    const changed=clone(fixture.artifacts['image-chain-proof.json']);changed[role][field]='wrong';fixture.write('image-chain-proof.json',changed);
    assert.throws(()=>aggregatePaidVideoRetainedHttpProof(fixture),/HTTP_IMAGE_CHAINS/u);
  }
  fixture.write('image-chain-proof.json',fixture.artifacts['image-chain-proof.json']);
  const changed=clone(fixture.executionInputs);delete changed['image-chains.json'];changed['unrelated-chain.json']=fakeHash;
  fixture.write('harness-source-hashes.json',changed);
  assert.throws(()=>aggregatePaidVideoRetainedHttpProof({...fixture,executionInputs:changed}),/HTTP_IMAGE_PINS/u);
});

test("HTTP aggregator rejects every cleanup, source, identity and count mismatch", (t) => {
  const fixture = http(t);
  for (const [name, mutate] of [
    ["summary.json", (v) => { v.status = "failed"; }],
    ["summary.json", (v) => { v.cleanupVerified = false; }],
    ["final-gateway-proof.json", (v) => { v.cases = 102; }],
    ["final-gateway-proof.json", (v) => { v.actualGatewayEntries = 3; }],
    ["final-gateway-proof.json", (v) => { v.source = fakeHash; }],
    ["final-gateway-proof.json", (v) => { v.liveMoneyOff = false; }],
    ["cleanup-proof.json", (v) => { v.taskResourcesRemaining = ["leaked"]; }],
    ["cleanup-proof.json", (v) => { v.generatedSecretFilesRemoved.pop(); }],
    ["cleanup-proof.json", (v) => { v.unownedResourcesTouched = true; }],
    ["edge-cleanup-proof.json", (v) => { v.processStopped = false; }],
    ["pre-cleanup-proof.json", (v) => { v.authSessionsRemaining = 1; }],
    ["ownership.json", (v) => { v.project = "another-run"; }],
    ["ownership.json", (v) => { v.root = "/different-evidence"; }],
    ["harness-source-hashes.json", (v) => { v["fixture-0"] = hash("changed"); }],
    ["http-qualification-proof.json", (v) => { v.cases[1].name = v.cases[0].name; }],
    ["http-qualification-proof.json", (v) => { v.cases.pop(); }],
    ["install-permission-proof.json", (v) => { v.retainedCapture.rollbackPreserved = false; }],
    ["generic-delivery-isolation-proof.json", (v) => { v.privateServiceExecutionDenied = false; }],
    ["range-deadline-proof.json", (v) => { v.remainingMilliseconds = 0; }],
  ]) {
    const changed = clone(fixture.artifacts[name]); mutate(changed); fixture.write(name, changed);
    assert.throws(() => aggregatePaidVideoRetainedHttpProof(fixture), /PAID_VIDEO_PROOF/u, name);
    fixture.write(name, fixture.artifacts[name]);
  }
});

test("HTTP aggregator rejects stale, missing, symlinked evidence and physically retained secret files", (t) => {
  const fixture = http(t), file = path.join(fixture.evidenceDirectory, "final-gateway-proof.json");
  fs.utimesSync(file, 1, 1);
  assert.throws(() => aggregatePaidVideoRetainedHttpProof(fixture), /HTTP_STALE_EVIDENCE/u);
  fixture.write("final-gateway-proof.json", fixture.artifacts["final-gateway-proof.json"]);
  const futureSeconds = Math.ceil(Date.now() / 1000) + 60;
  fs.utimesSync(file, futureSeconds, futureSeconds);
  assert.throws(() => aggregatePaidVideoRetainedHttpProof(fixture), /HTTP_STALE_EVIDENCE/u);
  fixture.write("final-gateway-proof.json", fixture.artifacts["final-gateway-proof.json"]);
  fs.unlinkSync(file);
  assert.throws(() => aggregatePaidVideoRetainedHttpProof(fixture), /ENOENT/u);
  fs.symlinkSync(path.join(fixture.evidenceDirectory, "summary.json"), file);
  assert.throws(() => aggregatePaidVideoRetainedHttpProof(fixture), /HTTP_EVIDENCE_NOT_REGULAR/u);
  fs.unlinkSync(file); fixture.write("final-gateway-proof.json", fixture.artifacts["final-gateway-proof.json"]);
  fs.writeFileSync(path.join(fixture.evidenceDirectory, "edge.private.json"), "validator-only secret file");
  assert.throws(() => aggregatePaidVideoRetainedHttpProof(fixture), /HTTP_SECRET_FILE_REMAINS/u);
});
