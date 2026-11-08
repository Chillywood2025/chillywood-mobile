import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import {validatePaidVideoPlatformHttpAggregate} from "../scripts/ci/paid-video-proof-validation.mjs";

// Response compatibility with the separately executed, source-bound local
// Auth/PostgREST/four-Edge fixture. No network, Auth, native or provider action
// occurs here. Outbound requests are not in the capture: expected tuples below
// are correlated from its unchanged original-request recovery responses.
const capturePath = process.env.ISOLATED_PAID_VIDEO_PLATFORM_HTTP_CAPTURES;
const proofPath = process.env.ISOLATED_PAID_VIDEO_PLATFORM_HTTP_PROOF;
const expectedRunId=process.env.ISOLATED_PAID_VIDEO_PLATFORM_HTTP_RUN_ID;
const expectedEvidenceDirectory=process.env.ISOLATED_PAID_VIDEO_PLATFORM_HTTP_EVIDENCE_DIRECTORY;
if (capturePath || proofPath || expectedRunId || expectedEvidenceDirectory) {
  assert.ok(capturePath && proofPath, "The retained HTTP bridge requires both same-attempt artifacts");
  assert.ok(expectedRunId && expectedEvidenceDirectory, "The platform bridge requires the caller-owned attempt identity");
  const captureRaw = fs.readFileSync(capturePath, "utf8"), proofRaw = fs.readFileSync(proofPath, "utf8");
  const capture = JSON.parse(captureRaw), proof = JSON.parse(proofRaw);
  const clone = value => JSON.parse(JSON.stringify(value));
  const id = n => `e9000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const row = name => {
    const matches = capture.cases.filter(entry => entry.name === name);
    assert.equal(matches.length, 1, name); return matches[0];
  };
  const response = name => row(name).response;
  const unavailable = () => { throw Error("Retained HTTP compatibility does not invoke external authority"); };
  const creator = response("Exact real creator session sees qualified synthetic route");
  const buyer = response("Free buyer remains ineligible despite user_metadata");
  const configurationDigest = creator.configurationDigest;
  const firstClose = response("Authenticated Edge closes exact registered allocation before any claim");
  const firstCloseRecovery = response("Read-only HTTP closure recovery preserves original request and session");
  const secondClose = response("New actual buyer session explicitly re-acks immutable original closure");
  const secondCloseRecovery = response("New close actor session remains distinct from original allocation session");
  const closePayload = firstCloseRecovery.data.originalPayload;
  const sessions = new Set([firstClose.actor.sessionId, secondClose.actor.sessionId]);
  const checkoutRows = capture.cases.filter(entry => entry.response.protocol === "isolated-paid-video-checkout-v3");
  const recoveries = checkoutRows.filter(entry => entry.response.command === "recover" && entry.response.status === "ok");
  function expected(value) {
    assert.equal(value.actor.userId, buyer.actor.userId);
    assert.ok(sessions.has(value.actor.sessionId), "A captured checkout actor must be one of the two genuine buyer sessions");
    let payload;
    if (value.command === "offer") payload = { offerId: value.data.quote.offerId };
    else if (value.command === "prepare") {
      const original = recoveries.find(entry => entry.response.data.originalRequestId === value.requestId)?.response;
      assert.ok(original); assert.equal(original.data.originalSessionId, value.actor.sessionId);
      payload = original.data.originalPayload;
    } else if (value.command === "recover" || value.command === "recover_close_prepared") payload = { originalRequestId: value.data.originalRequestId };
    else if (value.command === "close_prepared") payload = closePayload;
    else if (value.command === "resolve_playback") payload = { intentId: value.data.intent.id };
    else assert.fail(`Unreviewed captured command ${value.command}`);
    return { command: value.command, requestId: value.requestId, actor: value.actor, configurationDigest, payload };
  }
  function modules() {
    let now = 0;
    const Clock = class extends Date { static now() { return now; } };
    const base = {
      "react-native-get-random-values": {}, "react-native": { Platform: { OS: "ios" } },
      "./supabase": { SUPABASE_URL: "https://response-compatibility.invalid", SUPABASE_ANON_KEY: "unused" },
      "./isolatedTestStoreV3Build": { readIsolatedTestStoreV3Build: unavailable },
      "./accountBoundSupabaseMutation": { captureAccountBoundSupabaseMutationSubject: unavailable },
      "./accountSessionAuthority": { getCurrentAccountSessionAuthoritySnapshot: unavailable, sameAccountSessionAuthority: unavailable, subscribeToAccountSessionAuthority: unavailable },
    };
    function load(name, bindings = {}) {
      const scope = { exports: {}, Date: Clock, Error, URL, Headers, AbortController, Uint8Array, fetch: unavailable,
        require(key) { assert.ok(Object.hasOwn(bindings, key) || Object.hasOwn(base, key), `Unmodeled import ${key}`); return Object.hasOwn(bindings, key) ? bindings[key] : base[key]; } };
      const source = fs.readFileSync(new URL(`../_lib/${name}.ts`, import.meta.url), "utf8");
      const compiled = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
      assert.deepEqual(compiled.diagnostics, []); vm.runInNewContext(compiled.outputText, scope); return scope.exports;
    }
    const common = load("isolatedTestStoreContract"), v3 = load("isolatedTestStoreV3Contract", { "./isolatedTestStoreContract": common });
    const bindings = { "./isolatedTestStoreContract": common, "./isolatedTestStoreV3Contract": v3 };
    const checkout = load("isolatedPaidVideoCheckoutV3", bindings), authoring = load("isolatedPaidVideoV2");
    const transfer = load("isolatedPaidVideoTransfer", { "./isolatedPaidVideoV2": authoring });
    return { checkout, authoring, transfer, load, bindings, setNow(value) { now = value; },
      playback: load("isolatedPaidVideoPlayback", bindings),
      checkoutJournal: storage => load("isolatedPaidVideoCheckoutV3Attempts", { ...bindings, "./isolatedPaidVideoCheckoutV3": checkout, "@react-native-async-storage/async-storage": storage }),
      closureJournal: storage => load("isolatedTestStoreV3PreparedClosures", { ...bindings, "./isolatedPaidVideoCheckoutV3": checkout, "@react-native-async-storage/async-storage": storage }),
      transferJournal: storage => load("isolatedPaidVideoTransferAttempts", { "./isolatedPaidVideoV2": authoring, "./isolatedPaidVideoTransfer": transfer, "@react-native-async-storage/async-storage": storage }),
    };
  }
  function disk(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "retained-http-app-"));
    t.after(() => { fs.rmSync(directory, { recursive: true, force: true }); assert.equal(fs.readFileSync(capturePath, "utf8"), captureRaw); assert.equal(fs.readFileSync(proofPath, "utf8"), proofRaw); });
    return { directory, storage: {
      async getItem(key) { try { return await fs.promises.readFile(path.join(directory, encodeURIComponent(key)), "utf8"); } catch (error) { if (error.code === "ENOENT") return null; throw error; } },
      async setItem(key, value) { await fs.promises.writeFile(path.join(directory, encodeURIComponent(key)), value); },
    } };
  }
  function closureModel() {
    const scope = { userId: buyer.actor.userId, installationId: id(1), configurationDigest };
    // Explicit local native model only. The HTTP fixture cannot supply a device
    // prepared-only tombstone; its server closure is not native attestation.
    const nativeClosure = { protocol: "isolated-test-store-native-prepared-closure-v3", state: "prepared_closed", closedAt: firstClose.data.closure.closedAt,
      invocation: { protocol: "isolated-test-store-native-v3", invocationId: closePayload.dispatchId, customerBindingId: closePayload.customerBindingId,
        installationId: scope.installationId, buyerId: scope.userId, configurationDigest, providerAppUserId: `scv3_teststore_${id(2)}`,
        allocationId: firstClose.data.closure.allocationId, registrationId: closePayload.registrationId, sessionId: closePayload.originalSessionId,
        quote: closePayload.expectedQuote, state: "prepared", outcome: null, transactionHint: null, completedAt: null } };
    const operation = value => ({ requestId: value.requestId, sessionId: value.actor.sessionId, payload: closePayload, nativeClosure });
    return { scope, nativeClosure, operation };
  }

  test("retained four-entry HTTP artifacts bind exact source, 103 cases and verified cleanup", () => {
    assert.equal(capture.protocol, "scpv-retained-platform-gateway-http-captures-v1");
    assert.equal(proof.protocol, "scpv-retained-platform-auth-http-proof-v1");
    validatePaidVideoPlatformHttpAggregate(proof,{expectedRunId,expectedEvidenceDirectory});
    assert.deepEqual(capture.expectedAttempt,{expectedRunId,expectedEvidenceDirectory});
    assert.equal(capture.templateManifestSha256,proof.templateManifestSha256);
    for(const mutate of [
      value=>{value.protocol="scpv-retained-auth-http-proof-v1";},
      value=>{value.expectedAttempt.expectedRunId="ff".repeat(16);},
      value=>{value.summary.runId="ee".repeat(16);},
      value=>{value.summary.evidenceDirectory=path.dirname(expectedEvidenceDirectory);},
      value=>{delete value.executionInputs["image-chains.json"];},
      value=>{value.imageChains.db.configDigest="sha256:"+"a".repeat(64);},
      value=>{value.cleanup.taskResourcesRemaining=["foreign-resource"];},
    ]){
      const changed=clone(proof);mutate(changed);
      assert.throws(()=>validatePaidVideoPlatformHttpAggregate(changed,{expectedRunId,expectedEvidenceDirectory}));
    }
    assert.equal(createHash("sha256").update(proofRaw).digest("hex"), capture.sourceProofSha256);
    assert.equal(capture.caseCount, 103); assert.equal(capture.cases.length, 103); assert.equal(proof.caseCount, 103);
    assert.equal(capture.actualGatewayEntries, 4); assert.equal(proof.actualGatewayEntries, 4);
    assert.match(capture.source, /^[a-f0-9]{64}$/u); assert.equal(capture.source, proof.source);
    assert.equal(proof.status, "passed"); assert.equal(proof.summary.status, "passed"); assert.equal(proof.summary.cleanupVerified, true);
    assert.deepEqual(proof.cleanup.taskResourcesRemaining, []); assert.equal(proof.cleanup.unownedResourcesTouched, false);
    assert.equal(new Set(capture.cases.map(entry => entry.name)).size, 103);
    assert.equal(checkoutRows.length, 28); assert.equal(sessions.size, 2);
    assert.equal(buyer.data.creatorEligible, false); assert.equal(buyer.data.transferAvailable, false); assert.equal(buyer.data.checkoutAvailable, true);
    assert.notEqual(buyer.actor.userId, creator.actor.userId);
  });

  test("all 28 actual checkout responses cross strict app parsing without inventing delivery authority", () => {
    const f = modules();
    for (const entry of checkoutRows) {
      assert.equal(entry.httpStatus, 200);
      const parsed = f.checkout.parsePaidVideoCheckoutV3Result(entry.response, expected(entry.response));
      assert.equal(parsed.grantsAccess, false); assert.equal(parsed.providerDispatchAllowed, false); assert.equal(parsed.financialAuthority, false);
      if (parsed.data.intent) assert.equal(parsed.data.intent.accessRequiresCurrentAuthorization, true);
    }
    assert.equal(response("Fourth authenticated Edge checkout reads exact verified gateway media").data.preparationAllowed, true);
    for (const name of ["Disabled gateway suppresses actual PostgREST offer readiness", "Retired exact receipt verifier suppresses actual PostgREST offer readiness"])
      assert.equal(response(name).data.preparationAllowed, false);
    for (const name of ["Disabled gateway refuses authenticated Edge preparation", "Retired verifier refuses authenticated Edge preparation", "Fourth Edge rejects mismatched real current session"]) {
      const negative = row(name); assert.ok([401, 503].includes(negative.httpStatus));
      assert.throws(() => f.checkout.parsePaidVideoCheckoutV3Result(negative.response, expected(response("Unclaimed registered closure prepares through actual Edge"))), /invalid_response/u);
    }
  });

  test("actual preparation and new-session recovery retain original intent and quote across disk restart", async t => {
    const { storage } = disk(t), f = modules();
    const prepared = response("Replacement reservation prepares through actual Edge"), recovered = response("Replacement reservation recovers exact original HTTP preparation");
    const later = response("Current buyer session reads retained first-session preparation");
    const input = { requestId: prepared.requestId, sessionGeneration: prepared.actor.sessionId, quote: recovered.data.originalPayload.expectedQuote };
    const open = () => f.checkoutJournal(storage).createPaidVideoCheckoutV3Journal({ userId: buyer.actor.userId, configurationDigest, storage, now: () => Date.parse(prepared.data.intent.createdAt) + 1 });
    const journal = open(), ticket = await journal.prepare(input); let sends = 0;
    const direct = await ticket.dispatch(async () => { sends++; assert.equal((await open().list())[0].state, "unknown"); return prepared; });
    assert.equal(direct.state, "unknown"); assert.equal(direct.intentId, prepared.data.intent.id);
    assert.equal((await open().prepare(input)).mayDispatch, false);
    await open().reconcile(input.requestId, recovered, { requestId: recovered.requestId, sessionGeneration: recovered.actor.sessionId });
    const saved = await open().reconcile(input.requestId, later, { requestId: later.requestId, sessionGeneration: later.actor.sessionId });
    assert.equal(saved.state, "intent_prepared"); assert.equal(saved.sessionGeneration, prepared.actor.sessionId);
    assert.notEqual(saved.sessionGeneration, saved.observedSessionGeneration); assert.equal(saved.observedSessionGeneration, secondClose.actor.sessionId);
    assert.deepEqual(clone(saved.quote), recovered.data.originalPayload.expectedQuote); assert.equal(sends, 1);
    await assert.rejects(open().prepare({ ...input, sessionGeneration: later.actor.sessionId }), /request_conflict/u);
    for (const mutate of [v => { v.data.originalSessionId = later.actor.sessionId; }, v => { v.data.originalPayload.expectedQuote.asset.incarnation = id(3); }, v => { v.data.intent.quote.amountMinor++; }]) {
      const malformed = clone(later); mutate(malformed);
      await assert.rejects(open().reconcile(input.requestId, malformed, { requestId: later.requestId, sessionGeneration: later.actor.sessionId }), /invalid_response/u);
    }
    await assert.rejects(open().reconcile(input.requestId, later, { requestId: later.requestId, sessionGeneration: prepared.actor.sessionId }), /invalid_response/u);
    assert.equal((await open().list())[0].intentId, prepared.data.intent.id);
  });

  test("actual missing closure and later-session explicit re-ack preserve uncertainty and immutable native/server tuples", async t => {
    const { storage } = disk(t), f = modules(), model = closureModel();
    const open = () => f.closureJournal(storage).createTestStoreV3PreparedClosureJournal({ ...model.scope, storage });
    const original = model.operation(firstClose), ticket = await open().prepare(original);
    await assert.rejects(ticket.dispatch(async () => { assert.equal((await open().list())[0].state, "unknown"); throw Error("Modeled lost HTTP response"); }), /Modeled lost/u);
    const missing = response("Missing closure recovery is unknown rather than no claim");
    assert.equal((await open().reconcile(original.requestId, missing, { requestId: missing.requestId, sessionId: missing.actor.sessionId })).state, "unknown");
    assert.equal((await open().prepare(original)).mayDispatch, false);
    const later = model.operation(secondClose); assert.notEqual(later.sessionId, original.sessionId);
    assert.deepEqual(secondCloseRecovery.data.originalPayload, closePayload);
    assert.equal(secondCloseRecovery.data.originalSessionId, later.sessionId);
    assert.equal(secondCloseRecovery.data.originalPayload.originalSessionId, original.sessionId);
    const explicit = await open().prepare(later); assert.equal(explicit.mayDispatch, true);
    const closed = await explicit.dispatch(async payload => { assert.deepEqual(clone(payload), closePayload); return secondClose; });
    assert.equal(closed.state, "closed"); assert.equal(closed.nativeClosure.invocation.sessionId, original.sessionId);
    assert.equal((await open().reconcile(later.requestId, secondCloseRecovery, { requestId: secondCloseRecovery.requestId, sessionId: later.sessionId })).state, "closed");
    assert.equal((await open().reconcile(original.requestId, firstCloseRecovery, { requestId: firstCloseRecovery.requestId, sessionId: original.sessionId })).state, "closed");
    assert.equal((await open().reconcile(original.requestId, missing, { requestId: missing.requestId, sessionId: original.sessionId })).state, "closed");
    for (const saved of await open().list()) assert.equal(f.closureJournal(storage).parseClosedTestStoreV3PreparedAttempt(saved, model.scope).state, "closed");
    assert.equal((await open().prepare(original)).mayDispatch, false); assert.equal((await open().prepare(later)).mayDispatch, false);
  });

  test("actual claim-won errors and altered closure targets cannot clear the durable unknown attempt", async t => {
    const { storage } = disk(t), f = modules(), model = closureModel();
    const journal = f.closureJournal(storage).createTestStoreV3PreparedClosureJournal({ ...model.scope, storage });
    const operation = model.operation(firstClose), ticket = await journal.prepare(operation);
    const claimWon = row("Committed historical claim permanently refuses unclaimed HTTP closure");
    assert.equal(claimWon.httpStatus, 503); assert.equal(claimWon.response.outcome, "unknown");
    await assert.rejects(ticket.dispatch(async () => claimWon.response), /invalid_response/u);
    for (const name of ["Held actual claim transaction makes authenticated HTTP close uncertain", "Same original close request cannot be rebound to a new session"])
      await assert.rejects(journal.reconcile(operation.requestId, response(name)), /invalid_response/u);
    for (const mutate of [v => { v.data.closure.configurationDigest = "0".repeat(64); }, v => { v.data.closure.registrationId = `scv3_registration_${id(4)}`; },
      v => { v.data.closure.originalSessionId = secondClose.actor.sessionId; }, v => { v.data.closure.previousReservationRevision++; },
      v => { v.data.closure.claimAbsent = false; }, v => { v.actor.userId = creator.actor.userId; }]) {
      const malformed = clone(firstClose); mutate(malformed);
      await assert.rejects(journal.reconcile(operation.requestId, malformed), /invalid_response/u);
    }
    assert.equal((await journal.list())[0].state, "unknown"); assert.equal((await journal.prepare(operation)).mayDispatch, false);
    const pending = response("Held capture project retains discoverable actual authenticated receipt"), held = response("Actual service reconciliation remains deferred while project lock is held");
    assert.equal(pending.authorityGranted, false); assert.equal(held.authorityGranted, false);
    for (const value of [pending, held, response("Actual service recovers retained receipt after exact project lock release")])
      assert.throws(() => f.checkout.parsePaidVideoCheckoutV3Result(value, expected(firstClose)), /invalid_response/u);
    assert.equal(row("Actual service queue rejects another installation witness").httpStatus, 403);
    assert.equal(row("Wrong source witness cannot project retained receipt").httpStatus, 403);
  });

  test("actual duplicate and refunded receipt history resolves current grants only through fresh range metadata", () => {
    const f = modules(), parse = name => { const value = response(name); return f.checkout.parsePaidVideoCheckoutV3Result(value, expected(value)); };
    const first = parse("Actual fourth Edge resolves authoritative grant for first retained receipt");
    const second = parse("Second receipt resolves same authoritative current grant"), other = parse("Historical nonselected receipt resolves a different current grant");
    assert.equal(first.data.currentGrantId, second.data.currentGrantId);
    assert.notEqual(first.data.intent.grantId, second.data.intent.grantId); assert.notEqual(other.data.intent.grantId, other.data.currentGrantId);
    const refunded = parse("Refunded historical receipt resolves another exact valid owned grant");
    assert.equal(refunded.data.intent.receipt.state, "refunded"); assert.notEqual(refunded.data.intent.grantId, refunded.data.currentGrantId);
    for (const name of ["Current paid_video_gateway_controls loss suppresses resolver selection", "Current paid_video_verifiers loss suppresses resolver selection", "Both receipts refunded leaves no current grant", "Reconciled receipt refund removes current grant"])
      assert.equal(parse(name).data.currentGrantId, null);
    for (const [resolution, name] of [[first, "Authoritative selected grant reaches actual private origin"], [refunded, "Remaining verified grant still reaches private range"],
      [parse("Reconciled receipt becomes visible through actual current-grant Edge"), "Reconciled current grant reaches unchanged private range gate"]]) {
      const actual = row(name), quote = resolution.data.intent.quote, selection = { resourceId: quote.resourceId, grantId: resolution.data.currentGrantId, quote };
      const url = `https://response-compatibility.invalid/functions/v1/isolated-paid-video-range-v1/${selection.resourceId}/${selection.grantId}`;
      // Capture has real headers/status but omits transport URL/nonredirect.
      // Those are explicit local model prerequisites, not native/device proof.
      const metadata = { status: actual.httpStatus, headers: new Headers(actual.response.headers), url, redirected: false };
      const deadline = Number(actual.response.headers["x-chillywood-authorized-until-ms"]);
      assert.equal(f.playback.parsePaidVideoPlaybackProbe(metadata, selection, url, deadline - 1), deadline);
      assert.throws(() => f.playback.parsePaidVideoPlaybackProbe(metadata, selection, url, deadline), error => error.code === "expired");
      assert.throws(() => f.playback.parsePaidVideoPlaybackProbe(metadata, { ...selection, grantId: `scv1_grant_${id(5)}` }, url, deadline - 1));
      const stale = clone(selection); stale.quote.asset.incarnation = id(6);
      assert.throws(() => f.playback.parsePaidVideoPlaybackProbe(metadata, stale, url, deadline - 1));
    }
    for (const name of ["Historical nonselected grant stays denied by unchanged range authority", "Refunded selected grant is denied before origin", "All raw refunds suppress original range before origin"])
      assert.equal(row(name).httpStatus, 503);
    for (const mutate of [v => { v.data.currentGrantId = id(7); }, v => { v.data.intent.id = `scv1_intent_${id(8)}`; }, v => { v.grantsAccess = true; }, v => { v.data.signedUrl = "https://invalid.example/media"; }]) {
      const malformed = clone(first); mutate(malformed);
      assert.throws(() => f.checkout.parsePaidVideoCheckoutV3Result(malformed, expected(first)), /invalid_response/u);
    }
  });

  test("actual signed transfer recovery survives new-session disk restart without reconstructing PUT authority", async t => {
    const { storage, directory } = disk(t), f = modules();
    const reserved = response("Actual Auth/PostgREST reserves server-owned upload").data.upload;
    const later = response("New actual Auth session recovers original transfer descriptor read-only"), retained = later.data.transfer;
    const upload = { id: reserved.id, incarnation: reserved.incarnation, expectedSha256: reserved.expectedSha256, expectedByteLength: reserved.expectedByteLength };
    const context = { userId: later.actor.userId, requestId: retained.requestId, upload, originalSessionId: retained.originalSessionId,
      originalConfigurationDigest: retained.configurationDigest, sessionGeneration: later.actor.sessionGeneration, configurationDigest: later.configurationDigest };
    const binding = { sessionGeneration: context.sessionGeneration, configurationDigest: context.configurationDigest };
    const input = { requestId: retained.requestId, sessionGeneration: retained.originalSessionId, configurationDigest: retained.configurationDigest, upload };
    const open = () => f.transferJournal(storage).createIsolatedPaidVideoTransferJournal({ userId: later.actor.userId });
    const journal = open();
    f.setNow(later.capabilityExpiresAtMs - 1000);
    assert.equal((await journal.adoptRetained(later, { requestId: later.requestId, uploadId: upload.id, currentSessionGeneration: context.sessionGeneration, currentConfigurationDigest: context.configurationDigest })).mayPut, false);
    assert.notEqual(context.originalSessionId, context.sessionGeneration); assert.equal((await open().prepare(input)).mayPut, false);
    for (const name of ["Signed conditional PUT reaches real local HTTP origin; lost response stays unknown", "Unknown PUT same identity does not resend"])
      assert.equal((await journal.recordPut(retained.requestId, response(name))).state, "unknown");
    const probe = response("Read-only GET verifies actual full origin bytes and S3 version"), observation = JSON.parse(probe.observationRaw);
    f.setNow(observation.checkedAtMs); assert.equal(f.transfer.parsePaidVideoV2ProbeResponse(probe, { ...context, now: observation.checkedAtMs }).state, "observed");
    await journal.recordProbe(retained.requestId, probe, { ...binding, now: observation.checkedAtMs });
    for (const name of ["Explicit POST records exact verified object receipt", "Repeated exact POST returns durable receipt", "GET recovers receipt without another origin read"])
      assert.equal((await journal.recordReceipt(retained.requestId, response(name), binding)).state, "recorded");
    assert.equal((await open().list())[0].sessionGeneration, retained.originalSessionId); assert.equal((await open().prepare(input)).mayPut, false);
    const revoked = row("Revoked session cannot recover upload bytes or receipt"); assert.equal(revoked.httpStatus, 401);
    await assert.rejects(journal.recordReceipt(retained.requestId, revoked.response, binding), /invalid_response/u);
    assert.equal((await open().list())[0].state, "recorded");
    const persisted = fs.readFileSync(path.join(directory, fs.readdirSync(directory)[0]), "utf8");
    assert.equal(persisted.includes("observationRaw"), false); assert.equal(persisted.includes(probe.signature), false);
  });
}
