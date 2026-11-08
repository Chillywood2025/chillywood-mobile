import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { validatePaidVideoBaselineManifest } from "./paid-video-baseline.mjs";
import { verifyFreshCaptureProfile } from "../../isolated-runtime/sandbox-commerce-v1/tests/test-store-v3-profile-binding.mjs";

const sqlRoot = "isolated-runtime/sandbox-commerce-v1";
const fixtureRoot = `${sqlRoot}/tests`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const check = (condition, code) => assert.ok(condition, `PAID_VIDEO_PROOF_${code}`);
const digest = (value) => check(typeof value === "string" && /^[a-f0-9]{64}$/u.test(value), "HASH_INVALID");
const same = (actual, expected, code) => assert.deepEqual(actual, expected, `PAID_VIDEO_PROOF_${code}`);
const profiles = {
  fresh: { count: 31, manifest: "source-manifest.json", modules: "orderedModules",
    harness: "test-store-v3-capture-composed-managed.native.mjs",
    installation: "09c284aa0b56536f6975ef3debb86d1b29f157f04c3b1a1593fec8e7b8d5e563" },
  retained: { count: 19, manifest: "retained-source-manifest.json", modules: "executedModules",
    harness: "test-store-v3-retained-capture-managed.native.mjs",
    installation: "0740568bed37dbc21cb462efcfd577078c9325f3449b1e50bfac6fe57e8e559a" },
};
const edgePaths = ["supabase/functions/_shared/isolated-test-store-v3-provisioner.ts",
  `${fixtureRoot}/test-store-v3-provider.fixture.mjs`, "supabase/functions/_shared/revenuecat-router-envelope.ts",
  "supabase/functions/_shared/isolated-test-store-v3-receipt.ts", "supabase/functions/_shared/revenuecat-lossless-envelope.ts",
  "supabase/functions/_shared/isolated-test-store-v3-command.ts"];
const capturePaths = ["supabase/functions/_shared/revenuecat-router-envelope.ts",
  "supabase/functions/_shared/isolated-test-store-qualification.ts", "supabase/functions/isolated-test-store-capture-v1/index.ts",
  "isolated-runtime/test-store-capture-v1/tests/source-loader.mjs"];
const cleanupKeys = ["sessionsClosed", "clusterStopped", "clusterNotRunningVerified", "directoryRemoved"];
const retainedTables = ["project_reservations", "test_store_qualification_connections", "test_store_qualification_controls",
  "test_store_qualification_entries", "test_store_qualification_deliveries", "test_store_qualification_exclusions", "test_store_qualification_conflicts"];
const httpSource = "22c7dcfd9a2569b9b902db79f8468df90c1058b53fe663cdefe01a63bcd663b2";
const secretFiles = ["edge.private.json", "credentials.private.json", "accounts.private.json",
  "purchase.private.json", "compose.private.json", "gateway.private.json"];
const evidenceNames = ["auth-issuance-proof.json", "cleanup-proof.json", "edge-cleanup-proof.json", "edge-listener-proof.json",
  "edge-process-log.json", "final-gateway-proof.json", "gateway-health-proof.json", "generic-delivery-isolation-proof.json",
  "harness-source-hashes.json", "http-qualification-proof.json", "image-chain-proof.json", "install-permission-proof.json", "install-proof.json",
  "loopback-bindings.json", "ownership.json", "pre-cleanup-proof.json", "range-deadline-proof.json",
  "settlement-boundary-proof.json", "stack-provenance.json", "summary.json", "synthetic-scanner-boundary.json"];
const limitations = ["Actual local Auth/PostgREST/PostgreSQL and four production Deno entries.",
  "RevenueCat transport/provider observations, immutable object origin, native configuration, signed scanner evidence and human decisions are synthetic.",
  "No target/provider/device/deployment qualification or external mutation.",
  "Recovery scheduler, credentials and approved target witness are not installed."];

function hashMap(value, count) {
  check(value && typeof value === "object" && !Array.isArray(value), "HASH_MAP_INVALID");
  check(Object.keys(value).length === count, "HASH_MAP_COUNT");
  for (const hash of Object.values(value)) digest(hash);
}
function cases(value, count) {
  check(Array.isArray(value) && value.length === count, "CASE_COUNT");
  check(value.every((row) => row && typeof row.name === "string" && row.name.trim().length > 0), "CASE_NAME_INVALID");
  check(new Set(value.map((row) => row.name)).size === count, "CASE_DUPLICATE");
}

// Capture this before starting a harness, retain it unchanged, and compare a
// second capture afterwards. Never derive expected inputs from a proof itself.
export function capturePaidVideoPostgresSources({ repositoryRoot, baselineDirectory, profile }) {
  const selected = profiles[profile]; check(selected, "PROFILE_INVALID");
  check(path.isAbsolute(repositoryRoot) && path.isAbsolute(baselineDirectory), "SOURCE_ROOT_INVALID");
  const baseline = validatePaidVideoBaselineManifest(fs.readFileSync(path.join(baselineDirectory, "manifest.json")));
  const read = (name) => fs.readFileSync(path.join(repositoryRoot, name));
  const baselineRead = (name) => Object.hasOwn(baseline.files, name)
    ? fs.readFileSync(path.join(baselineDirectory, name)) : read(name);
  for (const [name, expected] of Object.entries(baseline.files)) same(sha256(baselineRead(name)), expected, "BASELINE_CHANGED");
  const manifestBytes = read(`${sqlRoot}/candidates/paid-video-capture-composed/${selected.manifest}`);
  const manifest = JSON.parse(manifestBytes);
  const modules = manifest[selected.modules];
  check(Array.isArray(modules) && modules.length === 42, "MODULE_COUNT");
  same(manifest.installationSourceSha256, selected.installation, "INSTALLATION_MISMATCH");
  if (profile === "fresh") verifyFreshCaptureProfile(manifest, modules.map((entry) => entry.path), baselineRead);
  else same(sha256(manifestBytes), "39f259c62d0683c750be6b4fa01d254aa91a8dc3cefb9d74219398c70eb36a37", "RETAINED_PROFILE_CHANGED");
  const sourceHashes = {};
  for (const [index, entry] of modules.entries()) {
    same(entry.position, index + 1, "MODULE_POSITION");
    digest(entry.sha256);
    check(!path.posix.isAbsolute(entry.path) && !entry.path.split("/").includes(".."), "MODULE_PATH_INVALID");
    same(sha256(baselineRead(entry.path)), entry.sha256, "SQL_SOURCE_CHANGED");
    sourceHashes[path.posix.relative(sqlRoot, entry.path)] = entry.sha256;
  }
  hashMap(sourceHashes, 39);
  const fixtureFiles = { "premium-authority.fixture.sql": `${fixtureRoot}/premium-authority.fixture.sql`,
    "authority.fixture.sql": `${fixtureRoot}/authority.fixture.sql` };
  if (profile === "fresh") Object.assign(fixtureFiles, {
    "test-store-v3-profile-binding.mjs": `${fixtureRoot}/test-store-v3-profile-binding.mjs`,
    "test-store-v3.fixture.mjs": `${fixtureRoot}/test-store-v3.fixture.mjs`,
    "paid-video-scan.mjs": "ops/isolated-paid-video-worker/scan.mjs",
  });
  const result = { profile, installationSourceSha256: selected.installation, profileManifestSha256: sha256(manifestBytes),
    orderedModules: structuredClone(modules), sourceHashes,
    fixtureHashes: Object.fromEntries(Object.entries(fixtureFiles).map(([name, file]) => [name, sha256(read(file))])),
    edgeHashes: Object.fromEntries(edgePaths.map((file) => [file, sha256(read(file))])),
    harnessHash: sha256(read(`${fixtureRoot}/${selected.harness}`)) };
  if (profile === "retained") Object.assign(result, {
    captureFixtureSourceHashes: Object.fromEntries(capturePaths.map((file) => [path.resolve(repositoryRoot, file), sha256(read(file))])),
    retainedCaptureSourceSha256: sha256(read("isolated-runtime/test-store-capture-v1/capture.sql")),
  });
  return result;
}

export function validatePaidVideoPostgresProof(proof, { profile, expected }) {
  const selected = profiles[profile]; check(selected && expected?.profile === profile, "PROFILE_INVALID");
  same(proof.status, "passed", "STATUS"); same(proof.engine, "postgres (PostgreSQL) 17.6", "ENGINE");
  same(proof.caseCount, selected.count, "CASE_COUNT"); cases(proof.cases, selected.count);
  same(proof.cleanup, Object.fromEntries(cleanupKeys.map((name) => [name, true])), "CLEANUP");
  check(Array.isArray(proof.combinedCaptures) && proof.combinedCaptures.length > 0, "CAPTURES_MISSING");
  check(Number.isFinite(proof.durationMs) && proof.durationMs > 0, "DURATION_INVALID");
  same(expected.installationSourceSha256, selected.installation, "EXPECTED_INSTALLATION");
  check(Array.isArray(expected.orderedModules) && expected.orderedModules.length === 42, "EXPECTED_MODULE_COUNT");
  hashMap(expected.sourceHashes, 39); hashMap(expected.edgeHashes, 6); hashMap(expected.fixtureHashes, profile === "fresh" ? 5 : 2);
  digest(expected.profileManifestSha256); digest(expected.harnessHash);
  for (const name of ["installationSourceSha256", "profileManifestSha256", "orderedModules", "sourceHashes", "fixtureHashes", "edgeHashes", "harnessHash"])
    same(proof[name], expected[name], `SOURCE_MISMATCH:${name}`);
  for (const [index, entry] of proof.orderedModules.entries()) {
    same(entry.position, index + 1, "MODULE_POSITION");
    same(entry.sha256, proof.sourceHashes[path.posix.relative(sqlRoot, entry.path)], "ORDERED_SQL_MISMATCH");
  }
  if (profile === "retained") {
    hashMap(expected.captureFixtureSourceHashes, 4); digest(expected.retainedCaptureSourceSha256);
    same(proof.captureFixtureSourceHashes, expected.captureFixtureSourceHashes, "CAPTURE_FIXTURE_SOURCE");
    same(proof.retainedCaptureSourceSha256, expected.retainedCaptureSourceSha256, "CAPTURE_SOURCE");
    digest(proof.retainedCaptureDataSha256);
    same(Object.keys(proof.retainedCaptureCounts).sort(), [...retainedTables].sort(), "RETAINED_TABLES");
    check(Object.values(proof.retainedCaptureCounts).every((value) => Number.isSafeInteger(value) && value >= 0), "RETAINED_COUNTS");
    check(proof.retainedCaptureCounts.test_store_qualification_entries > 0, "RETAINED_EVIDENCE_MISSING");
  }
  return proof;
}

const platformTemplate = new URL('../../isolated-runtime/sandbox-commerce-v1/tests/local-auth-paid-video-retained-platform-v2/',import.meta.url);
function expectedImageChains(){
  const raw=fs.readFileSync(new URL('image-chains.json',platformTemplate));
  same(sha256(raw),'1e223c1d89821bb5d7a9c18fd56aae1eb560943dc3c07596cb4abc96b83b460e','IMAGE_PINS_SOURCE');
  const pins=JSON.parse(raw);same(pins.protocol,'scpv-public-image-chain-pins-v1','IMAGE_PINS_PROTOCOL');
  same(Object.keys(pins.images).sort(),['auth','db','gateway','rest'],'IMAGE_ROLES');
  return Object.fromEntries(Object.entries(pins.images).map(([role,pin])=>{
    const read=key=>{const item=pin[key];same(item.digest,'sha256:'+sha256(item.raw),'IMAGE_RAW_DIGEST');return JSON.parse(item.raw);};
    const index=read('index'),manifest=read('platformManifest'),config=read('config');
    same(pin.reference.split('@')[1],pin.index.digest,'IMAGE_REFERENCE');
    const matches=index.manifests.filter(item=>item.platform?.os==='linux'&&item.platform.architecture==='amd64'&&!item.platform.variant);
    same(matches.length,1,'IMAGE_PLATFORM_SELECTION');same(matches[0].digest,pin.platformManifest.digest,'IMAGE_PLATFORM_DIGEST');
    same(matches[0].size,Buffer.byteLength(pin.platformManifest.raw),'IMAGE_PLATFORM_SIZE');
    same(manifest.config.digest,pin.config.digest,'IMAGE_CONFIG_DIGEST');same(manifest.config.size,Buffer.byteLength(pin.config.raw),'IMAGE_CONFIG_SIZE');
    same(config.os,'linux','IMAGE_OS');same(config.architecture,'amd64','IMAGE_ARCH');
    return [role,{reference:pin.reference,indexDigest:pin.index.digest,manifestDigest:pin.platformManifest.digest,configDigest:pin.config.digest,os:'linux',architecture:'amd64'}];
  }));
}
function expectedIdentity({expectedEvidenceDirectory,expectedRunId}){
  check(typeof expectedRunId==='string'&&/^[a-f0-9]{32}$/u.test(expectedRunId),'EXPECTED_RUN_ID');
  check(typeof expectedEvidenceDirectory==='string'&&path.isAbsolute(expectedEvidenceDirectory)
    &&path.resolve(expectedEvidenceDirectory)===expectedEvidenceDirectory,'EXPECTED_ROOT');
  same(path.basename(expectedEvidenceDirectory),'chillywood-local-auth-'+expectedRunId,'EXPECTED_ROOT_NONCE');
  return {root:expectedEvidenceDirectory,runId:expectedRunId,project:'chillywood-auth-fixture-'+expectedRunId.slice(0,12)};
}
export function validatePaidVideoPlatformHttpAggregate(proof,expectedAttempt){
  const identity=expectedIdentity(expectedAttempt);
  same(proof.protocol, "scpv-retained-platform-auth-http-proof-v1", "HTTP_PROTOCOL"); same(proof.status, "passed", "HTTP_STATUS");
  same(proof.expectedAttempt,expectedAttempt,'EXPECTED_ATTEMPT');same(proof.callerIdentityBound,true,'CALLER_IDENTITY');
  same(proof.ownership,identity,'HTTP_OWNERSHIP');same(proof.provenanceIdentity,identity,'HTTP_PROVENANCE_IDENTITY');
  same(proof.summary.runId,identity.runId,'HTTP_SUMMARY_RUN_ID');same(proof.summary.evidenceDirectory,identity.root,'HTTP_SUMMARY_ROOT');
  same(proof.cleanup.project,identity.project,'HTTP_CLEANUP_PROJECT');
  same(proof.caseCount, 103, "HTTP_CASE_COUNT"); same(proof.actualGatewayEntries, 4, "HTTP_ENTRIES");
  same(proof.source, httpSource, "HTTP_SOURCE");
  same(proof.retainedInstallationSourceSha256, profiles.retained.installation, "HTTP_INSTALLATION");
  same(proof.templateManifestSha256,sha256(fs.readFileSync(new URL('source-manifest.json',platformTemplate))),'HTTP_TEMPLATE');
  hashMap(proof.executionInputs, 100); hashMap(proof.evidenceSha256, 21);
  same(proof.executionInputs['image-chains.json'],'1e223c1d89821bb5d7a9c18fd56aae1eb560943dc3c07596cb4abc96b83b460e','HTTP_IMAGE_PINS');
  same(proof.imageChains,expectedImageChains(),'HTTP_IMAGE_CHAINS');
  same(Object.keys(proof.evidenceSha256).sort(), [...evidenceNames].sort(), "HTTP_EVIDENCE_SET");
  same(proof.summary.status, "passed", "HTTP_SUMMARY"); same(proof.summary.cleanupVerified, true, "HTTP_SUMMARY_CLEANUP");
  same(proof.summary.error, null, "HTTP_SUMMARY_ERROR");
  same(proof.gateway.cases, 103, "HTTP_GATEWAY_CASES"); same(proof.gateway.source, httpSource, "HTTP_GATEWAY_SOURCE");
  same(proof.gateway.actualGatewayEntries, 4, "HTTP_GATEWAY_ENTRIES");
  for (const name of ["actualAuth", "actualPostgREST", "actualLocalOriginHttp", "liveMoneyOff", "freeBuyerRemainsFree"])
    same(proof.gateway[name], true, `HTTP_GATEWAY:${name}`);
  same(proof.gateway.providerOrigin, "synthetic", "HTTP_PROVIDER_ORIGIN");
  same(proof.cleanup.taskResourcesRemaining, [], "HTTP_RESOURCES_REMAIN");
  same(proof.cleanup.unownedResourcesTouched, false, "HTTP_UNOWNED_RESOURCES");
  same([...proof.cleanup.generatedSecretFilesRemoved].sort(), [...secretFiles].sort(), "HTTP_SECRET_FILES");
  same(proof.edgeCleanup.processStopped, true, "HTTP_EDGE_NOT_STOPPED");
  same(proof.authSessionsBeforeCleanup.authSessionsRemaining, 0, "HTTP_AUTH_SESSIONS");
  same(proof.install.actualInstaller, "postgres", "HTTP_INSTALLER"); same(proof.install.installerIsSuperuser, false, "HTTP_SUPERUSER");
  for (const name of ["omittedFinalRevokeAbortedCommit", "failedInstallRolledBackFreshSchemaAndRoles"])
    same(proof.install[name], true, `HTTP_INSTALL:${name}`);
  same(proof.install.finalPublicCreatePrivilege, false, "HTTP_CREATE_PRIVILEGE");
  same(proof.install.retainedCapture.phase, "sealed", "HTTP_RETAINED_PHASE");
  same(proof.install.retainedCapture.rollbackPreserved, true, "HTTP_RETAINED_ROLLBACK");
  same(proof.install.retainedCapture.successfulInstallPreserved, true, "HTTP_RETAINED_INSTALL");
  digest(proof.install.retainedCapture.beforeAndAfterSha256);
  same(proof.auth.sessionClaimsMatchedOfficialAuthRows, true, "HTTP_AUTH_CLAIMS"); same(proof.auth.accounts, 2, "HTTP_AUTH_ACCOUNTS");
  for (const name of ["privateServiceExecutionDenied", "publicRpcAbsent", "privateSchemaNotExposed", "coreOwnerStillOwnsPrivateGraph"])
    same(proof.genericDeliveryIsolation[name], true, `HTTP_DELIVERY:${name}`);
  const range = proof.rangeDeadline;
  check([range.clientStartedAtMs, range.clientReceivedAtMs, range.serverAuthorizedUntilMs, range.remainingMilliseconds].every(Number.isFinite), "HTTP_RANGE_INVALID");
  check(range.clientReceivedAtMs >= range.clientStartedAtMs && range.remainingMilliseconds > 0
    && range.serverAuthorizedUntilMs - range.clientReceivedAtMs === range.remainingMilliseconds, "HTTP_RANGE_EXPIRED");
  same(proof.limitations, limitations, "HTTP_LIMITATIONS");
}

export function aggregatePaidVideoRetainedHttpProof({ summary, evidenceDirectory, expectedEvidenceDirectory, expectedRunId, executionInputs, templateManifestSha256, attemptStartedAtMs }) {
  const expectedAttempt={expectedEvidenceDirectory,expectedRunId},identity=expectedIdentity(expectedAttempt);
  same(evidenceDirectory,expectedEvidenceDirectory,'HTTP_EXPECTED_DIRECTORY');
  check(path.isAbsolute(evidenceDirectory) && fs.realpathSync(evidenceDirectory) === evidenceDirectory, "HTTP_EVIDENCE_DIRECTORY");
  same(summary.evidenceDirectory, evidenceDirectory, "HTTP_SUMMARY_DIRECTORY");
  check(Number.isFinite(attemptStartedAtMs) && attemptStartedAtMs > 0 && attemptStartedAtMs <= Date.now(), "HTTP_ATTEMPT_START");
  hashMap(executionInputs, 100); digest(templateManifestSha256);
  const evidence = {}, evidenceSha256 = {};
  for (const name of evidenceNames) {
    const file = path.join(evidenceDirectory, name), stat = fs.lstatSync(file);
    check(stat.isFile() && !stat.isSymbolicLink(), "HTTP_EVIDENCE_NOT_REGULAR");
    check(stat.mtimeMs >= attemptStartedAtMs && stat.mtimeMs <= Date.now(), "HTTP_STALE_EVIDENCE");
    const raw = fs.readFileSync(file); evidenceSha256[name] = sha256(raw); evidence[name] = JSON.parse(raw);
  }
  same(evidence["summary.json"], summary, "HTTP_SUMMARY_MISMATCH");
  same(evidence["harness-source-hashes.json"], executionInputs, "HTTP_EXECUTION_INPUTS");
  const ownership = evidence["ownership.json"], provenance = evidence["stack-provenance.json"];
  for(const [key,value] of Object.entries(identity)){same(ownership[key],value,'HTTP_OWNERSHIP_'+key);same(provenance[key],value,'HTTP_PROVENANCE_'+key);}
  same(ownership.project, evidence["cleanup-proof.json"].project, "HTTP_CLEANUP_PROJECT");
  same(ownership.project, provenance.project, "HTTP_PROVENANCE_PROJECT");
  same(provenance.sourceProfile.source, httpSource, "HTTP_PROVENANCE_SOURCE");
  same(provenance.freshVolume, true, "HTTP_VOLUME"); same(provenance.reusedCliVolume, false, "HTTP_REUSED_VOLUME");
  same(provenance.repoMigrationBootstrapExecuted, false, "HTTP_REPO_BOOTSTRAP");
  for (const name of secretFiles) {
    let present = true; try { fs.lstatSync(path.join(evidenceDirectory, name)); } catch (error) { if (error.code === "ENOENT") present = false; else throw error; }
    check(!present, "HTTP_SECRET_FILE_REMAINS");
  }
  check(!fs.existsSync(path.join(evidenceDirectory, "failure.json")), "HTTP_FAILURE_ARTIFACT");
  const captures = evidence["http-qualification-proof.json"];
  same(captures.source, httpSource, "HTTP_CAPTURE_SOURCE"); cases(captures.cases, 103);
  const proof = { protocol: "scpv-retained-platform-auth-http-proof-v1", status: "passed", caseCount: 103, actualGatewayEntries: 4,
    source: httpSource, retainedInstallationSourceSha256: profiles.retained.installation, templateManifestSha256,
    expectedAttempt,callerIdentityBound:true,ownership:identity,provenanceIdentity:{...identity},imageChains:evidence['image-chain-proof.json'],
    executionInputs: structuredClone(executionInputs), evidenceSha256, summary: evidence["summary.json"],
    install: evidence["install-permission-proof.json"], auth: evidence["auth-issuance-proof.json"], gateway: evidence["final-gateway-proof.json"],
    genericDeliveryIsolation: evidence["generic-delivery-isolation-proof.json"], rangeDeadline: evidence["range-deadline-proof.json"],
    cleanup: evidence["cleanup-proof.json"], edgeCleanup: evidence["edge-cleanup-proof.json"],
    authSessionsBeforeCleanup: evidence["pre-cleanup-proof.json"], limitations: [...limitations] };
  validatePaidVideoPlatformHttpAggregate(proof,expectedAttempt);
  return proof;
}

export function wrapPaidVideoRetainedHttpCaptures({ aggregateBytes, httpCaptureBytes, expectedEvidenceDirectory, expectedRunId }) {
  check(Buffer.isBuffer(aggregateBytes) && Buffer.isBuffer(httpCaptureBytes), "HTTP_RAW_BYTES_REQUIRED");
  const proof = JSON.parse(aggregateBytes), captures = JSON.parse(httpCaptureBytes);
  validatePaidVideoPlatformHttpAggregate(proof,{expectedEvidenceDirectory,expectedRunId});
  same(sha256(httpCaptureBytes), proof.evidenceSha256["http-qualification-proof.json"], "HTTP_CAPTURE_HASH");
  same(captures.source, proof.source, "HTTP_CAPTURE_SOURCE"); cases(captures.cases, 103);
  return { protocol: "scpv-retained-platform-gateway-http-captures-v1", sourceProofSha256: sha256(aggregateBytes),
    templateManifestSha256:proof.templateManifestSha256,expectedAttempt:structuredClone(proof.expectedAttempt),
    source: proof.source, caseCount: 103, actualGatewayEntries: 4, cases: structuredClone(captures.cases), limitations: [...proof.limitations] };
}
