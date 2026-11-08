import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Response compatibility only: outbound requests are omitted, while the new
// HTTP48 capture retains the signed observation bytes unchanged. This does not
// replay original HTTP transport or establish installed native behavior.
const capturePath = process.env.ISOLATED_PAID_VIDEO_HTTP_CAPTURES;
if (capturePath) test("actual local Auth/HTTP responses retain read-only recovery and exact playback metadata", async t => {
  const rawCapture = fs.readFileSync(capturePath, "utf8"), capture = JSON.parse(rawCapture);
  assert.equal(capture.protocol, "scpv-gateway-http-captures-v2");
  assert.match(capture.sourceProofSha256, /^[a-f0-9]{64}$/u);
  assert.equal(capture.cases.length, 48);
  const byName = name => {
    const matches = capture.cases.filter(entry => entry.name === name);
    assert.equal(matches.length, 1, name); return matches[0];
  };
  let now = 0;
  const Clock = class extends Date { static now() { return now; } };
  const unavailable = () => { throw Error("This compatibility bridge cannot perform Auth, native or network actions"); };
  const base = {
    "react-native": { Platform: { OS: "ios" } }, "react-native-get-random-values": {},
    "./isolatedTestStoreV3Build": { readIsolatedTestStoreV3Build: unavailable },
    "./accountBoundSupabaseMutation": { captureAccountBoundSupabaseMutationSubject: unavailable },
    "./accountSessionAuthority": { getCurrentAccountSessionAuthoritySnapshot: unavailable, sameAccountSessionAuthority: unavailable, subscribeToAccountSessionAuthority: unavailable },
    "./supabase": { SUPABASE_URL: "https://response-compatibility.invalid", SUPABASE_ANON_KEY: "unused" },
  };
  function load(name, bindings = {}) {
    const source = fs.readFileSync(new URL(`../_lib/${name}.ts`, import.meta.url), "utf8");
    const scope = { exports: {}, Date: Clock, Error, URL, Headers, AbortController, Uint8Array, fetch: unavailable,
      require(key) { assert.ok(Object.hasOwn(bindings, key) || Object.hasOwn(base, key), `Unmodeled import ${key}`); return Object.hasOwn(bindings, key) ? bindings[key] : base[key]; } };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, scope);
    return scope.exports;
  }
  const api = load("isolatedPaidVideoV2"), transfer = load("isolatedPaidVideoTransfer", { "./isolatedPaidVideoV2": api });
  const common = load("isolatedTestStoreContract"), v3 = load("isolatedTestStoreV3Contract", { "./isolatedTestStoreContract": common });
  const playback = load("isolatedPaidVideoPlayback", { "./isolatedTestStoreContract": common, "./isolatedTestStoreV3Contract": v3 });
  const parse = (entry, payload) => {
    assert.equal(entry.httpStatus, 200); const response = entry.response;
    now = Math.max(0, response.capabilityExpiresAtMs - 1000);
    return api.parsePaidVideoV2Response(response, { command: response.command, requestId: response.requestId,
      actor: response.actor, configurationDigest: response.configurationDigest, payload, now });
  };

  const creator = parse(byName("Exact real creator session sees qualified synthetic route"), {});
  const buyer = parse(byName("Free buyer remains ineligible despite user_metadata"), {});
  assert.equal(creator.data.creatorEligible, true); assert.equal(creator.data.transferAvailable, true);
  assert.equal(buyer.data.creatorEligible, false); assert.equal(buyer.data.transferAvailable, false);
  assert.equal(buyer.data.checkoutAvailable, true); // Buying does not upgrade the free buyer.
  assert.notEqual(creator.actor.userId, buyer.actor.userId);
  assert.equal(byName("Free buyer cannot reserve").httpStatus, 503);

  const recoveredRow = byName("Exact original reserve recovers without creating another object");
  const recovered = parse(recoveredRow, { originalRequestId: recoveredRow.response.data.recovery.originalRequestId });
  const original = recovered.data.recovery;
  assert.equal(original.originalCommand, "upload.reserve");
  const { protocol, requestId, ...reservePayload } = original.originalPayload;
  assert.equal(protocol, "isolated-paid-video-v1"); assert.equal(requestId, original.originalRequestId);
  const reserved = parse(byName("Actual Auth/PostgREST reserves server-owned upload"), reservePayload);
  assert.equal(reserved.requestId, original.originalRequestId);
  assert.equal(reserved.actor.sessionGeneration, original.originalSessionGeneration);
  assert.equal(reserved.configurationDigest, original.originalConfigurationDigest);
  const upload = { id: reserved.data.upload.id, incarnation: reserved.data.upload.incarnation,
    expectedSha256: reserved.data.upload.expectedSha256, expectedByteLength: reserved.data.upload.expectedByteLength };

  const originalRead = parse(byName("Owner discovers exact original transfer after losing local journal"), { uploadId: upload.id });
  const laterRow = byName("New actual Auth session recovers original transfer descriptor read-only");
  const later = parse(laterRow, { uploadId: upload.id }), retained = later.data.transfer;
  assert.deepEqual(retained, originalRead.data.transfer);
  assert.equal(later.actor.userId, reserved.actor.userId);
  assert.notEqual(later.actor.sessionGeneration, retained.originalSessionId);
  assert.equal(retained.originalSessionId, reserved.actor.sessionGeneration);
  assert.equal(retained.configurationDigest, reserved.configurationDigest);
  assert.equal(later.data.upload.transferAvailable, false);
  const input = { requestId: retained.requestId, sessionGeneration: retained.originalSessionId, configurationDigest: retained.configurationDigest, upload };
  const context = { userId: later.actor.userId, requestId: retained.requestId, upload, originalSessionId: retained.originalSessionId,
    originalConfigurationDigest: retained.configurationDigest, sessionGeneration: later.actor.sessionGeneration, configurationDigest: later.configurationDigest };
  const binding = { sessionGeneration: later.actor.sessionGeneration, configurationDigest: later.configurationDigest };

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "paid-video-http-bridge-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const storage = {
    async getItem(key) { try { return await fs.promises.readFile(path.join(directory, encodeURIComponent(key)), "utf8"); } catch (error) { if (error.code === "ENOENT") return null; throw error; } },
    async setItem(key, value) { await fs.promises.writeFile(path.join(directory, encodeURIComponent(key)), value); },
  };
  const reopen = () => load("isolatedPaidVideoTransferAttempts", { "@react-native-async-storage/async-storage": storage,
    "./isolatedPaidVideoV2": api, "./isolatedPaidVideoTransfer": transfer }).createIsolatedPaidVideoTransferJournal({ userId: later.actor.userId });
  const journal = reopen();
  const adopted = await journal.adoptRetained(laterRow.response, { requestId: later.requestId, uploadId: upload.id,
    currentSessionGeneration: later.actor.sessionGeneration, currentConfigurationDigest: later.configurationDigest });
  assert.equal(adopted.mayPut, false); assert.equal(adopted.stopBeforePut, null); assert.equal(adopted.attempt.state, "unknown");
  assert.equal(adopted.attempt.sessionGeneration, retained.originalSessionId);
  assert.equal((await reopen().prepare(input)).mayPut, false);
  for (const name of ["Signed conditional PUT reaches real local HTTP origin; lost response stays unknown", "Unknown PUT same identity does not resend"]) {
    const row = byName(name); assert.equal(row.httpStatus, 200);
    assert.equal(transfer.parsePaidVideoV2TransferResponse(row.response, context).state, "unknown");
    assert.equal((await journal.recordPut(retained.requestId, row.response)).state, "unknown");
  }
  const replacement = byName("New request cannot replace original unknown transfer");
  assert.equal(replacement.httpStatus, 503);
  await assert.rejects(journal.prepare({ ...input, requestId: replacement.response.requestId }), error => error.code === "unresolved_attempt");

  // Parse and persist the unchanged signed observation. Signature verification
  // occurs independently in the server; the client does not mint authority.
  const probe = byName("Read-only GET verifies actual full origin bytes and S3 version").response;
  const observation = JSON.parse(probe.observationRaw); now = observation.checkedAtMs;
  assert.match(observation.verifierId, /^[a-f0-9-]{36}$/u);
  for (const [key, expected] of Object.entries({ userId: context.userId, sessionId: context.sessionGeneration, originalSessionId: context.originalSessionId,
    configurationDigest: context.configurationDigest, originalConfigurationDigest: context.originalConfigurationDigest,
    requestId: retained.requestId, uploadId: upload.id, incarnation: upload.incarnation, sha256: upload.expectedSha256, byteLength: upload.expectedByteLength })) assert.equal(observation[key], expected, key);
  assert.equal(transfer.parsePaidVideoV2ProbeResponse(probe, { ...context, now }).state, "observed");
  await journal.recordProbe(retained.requestId, probe, { ...binding, now });
  assert.equal((await journal.list())[0].observation.transferId, observation.transferId);
  assert.equal((await journal.list())[0].observation.objectVersion, observation.objectVersion); assert.equal((await journal.list())[0].receipt, null);
  assert.equal(byName("Forged probe signature rejected by actual SQL").httpStatus, 503);
  for (const name of ["Explicit POST records exact verified object receipt", "Repeated exact POST returns durable receipt", "GET recovers receipt without another origin read"]) {
    const row = byName(name); assert.equal(row.httpStatus, 200);
    const receipt = transfer.parsePaidVideoV2ObjectReceipt(row.response, context);
    assert.equal(receipt.objectVersion, observation.objectVersion); assert.equal(receipt.transferId, observation.transferId);
    assert.equal((await journal.recordReceipt(retained.requestId, row.response, binding)).state, "recorded");
  }
  const restarted = reopen(), saved = (await restarted.list())[0];
  assert.equal(saved.state, "recorded"); assert.equal(saved.sessionGeneration, retained.originalSessionId);
  assert.equal(saved.configurationDigest, retained.configurationDigest); assert.equal((await restarted.prepare(input)).mayPut, false);
  const disk = fs.readFileSync(path.join(directory, fs.readdirSync(directory)[0]), "utf8");
  assert.equal(disk.includes("observationRaw"), false); assert.equal(disk.includes(probe.signature), false);
  const finalized = parse(byName("Receipt permits finalization to scan pending"), { uploadId: upload.id });
  assert.equal(finalized.data.upload.state, "scan_pending"); assert.equal(finalized.data.upload.bytesClean, false);
  assert.equal(byName("Receipt alone cannot publish without clean scan and moderation").httpStatus, 503);

  // The original publish request is not in this artifact. Parse only its intact
  // offer projection, without asserting an invented request/CAS equivalence.
  const published = byName("Actual authoring HTTP publishes exact receipt and synthetic scanner evidence").response;
  const offer = api.parsePaidVideoV2Offer(published.data.offer, api.parsePaidVideoV2Upload(published.data.upload));
  const quote = { offerId: offer.id, offerRevision: offer.revision, resourceId: offer.resourceId, resourceRevision: offer.resourceRevision,
    creatorId: published.actor.userId, kind: offer.kind, amountMinor: offer.amountMinor, currency: offer.currency, asset: offer.asset };
  const first = byName("Actual Auth SQL receipt grant and signed HTTP range return exact first-byte metadata");
  const headers = first.response.headers, selection = { resourceId: quote.resourceId, grantId: headers["x-chillywood-grant-id"], quote };
  const expectedUrl = `https://response-compatibility.invalid/functions/v1/isolated-paid-video-range-v1/${selection.resourceId}/${selection.grantId}`;
  // Only recorded status/headers enter the parser; no byte body is fabricated.
  // URL/nonredirect are explicit modeled transport prerequisites, since the
  // artifact does not retain them. This does not qualify native URL handling.
  const metadata = row => ({ status: row.httpStatus, headers: new Headers(row.response.headers), url: expectedUrl, redirected: false });
  const expiresAt = Number(headers["x-chillywood-authorized-until-ms"]);
  assert.equal(first.response.byteLength, 1); assert.equal(quote.asset.byteLength, 600 * 1024);
  assert.equal(playback.parsePaidVideoPlaybackProbe(metadata(first), selection, expectedUrl, expiresAt - 1000), expiresAt);
  assert.throws(() => playback.parsePaidVideoPlaybackProbe(metadata(first), selection, expectedUrl, expiresAt), error => error.code === "expired");
  const bounded = byName("Oversized range is bounded to exactly 512KiB by actual transport");
  assert.equal(bounded.httpStatus, 206); assert.equal(bounded.response.byteLength, 512 * 1024);
  assert.equal(bounded.response.headers["content-range"], `bytes 0-524287/${quote.asset.byteLength}`);
  assert.throws(() => playback.parsePaidVideoPlaybackProbe(metadata(bounded), selection, expectedUrl, expiresAt - 1000));
  for (const name of ["Actual authenticated range denies missing grant before origin", "Range rejects other real actor using same grant before origin",
    "Range rejects mismatched current session before origin", "Range rejects changed resource identity before origin", "Range rejects unsatisfiable request before origin",
    "Expired genuine Auth session denies current range with unexpired JWT", "Actual raw refund effect suppresses range before origin"]) {
    const row = byName(name); assert.ok([401, 403, 503].includes(row.httpStatus)); assert.equal(row.response.status, "unavailable");
    assert.throws(() => playback.parsePaidVideoPlaybackProbe(metadata(row), selection, expectedUrl, expiresAt - 1000));
  }
  const revoked = byName("Revoked session cannot recover upload bytes or receipt"); assert.equal(revoked.httpStatus, 401);
  await assert.rejects(journal.recordReceipt(retained.requestId, revoked.response, binding), error => error.code === "invalid_response");
  assert.equal((await journal.list())[0].state, "recorded"); // History survives; no current-access claim follows.
  assert.equal(fs.readFileSync(capturePath, "utf8"), rawCapture);
});
