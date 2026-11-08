import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../supabase/functions/_shared/isolated-sandbox-delivery-policy.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, context);
const { evaluateIsolatedSandboxDeliveryPolicy: evaluate, ISOLATED_DELIVERY_KINDS: kinds } = context.exports;
const NS = "sandbox-commerce-v1", NOW = 1900000000000;
const uuid = (n) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const id = (type, n) => `scv1_${type}_${uuid(n)}`;
const clone = (value) => JSON.parse(JSON.stringify(value));
const hash = "a".repeat(64);
function fixture(kind = "paid_content") {
  const user = uuid(1), creator = uuid(2), session = uuid(3), generation = uuid(4);
  const product = { namespace: NS, id: id("resource", 10), revision: 1, kind, creatorId: creator, state: "published", moderation: "clear", quarantined: false };
  const target = { ...product, audience: kind === "vip_pass" ? "vip" : "paid" };
  let action = "play_video";
  if (["channel_subscription", "vip_pass"].includes(kind)) Object.assign(target, { id: id("resource", 11), kind: "paid_content" });
  if (kind === "event_auction") Object.assign(target, { id: id("resource", 11), kind: "event" });
  if (kind === "room_seat_auction:party_admission") Object.assign(target, { id: id("resource", 11), kind: "watch_party_live" });
  if (["live_watch_party_seat", "room_seat_auction:stage_reserved_seat"].includes(kind)) Object.assign(target, { id: id("resource", 11), kind: "live_watch_party_access" });
  if (kind === "creator_tip") action = "read_tip_receipt";
  if (kind === "physical_merch") action = "read_test_order";
  if (["event", "event_auction"].includes(kind)) action = "watch_event";
  if (["watch_party_live", "live_watch_party_access", "room_seat_auction:party_admission"].includes(kind)) action = "join_room";
  if (["live_watch_party_seat", "room_seat_auction:stage_reserved_seat"].includes(kind)) action = "request_seat";
  const assetId = id("asset", 20), incarnation = uuid(21), receiptId = id("receipt", 30), grantId = id("grant", 31);
  return {
    protocol: NS, environment: "sandbox",
    authority: { userId: user, accountId: user, sessionId: session, accountActive: true, sessionActive: true, restoreOnly: false, legalCurrent: true, observedAtMs: NOW, validUntilMs: NOW + 4000 },
    request: { productId: product.id, productRevision: product.revision, targetId: target.id, targetRevision: target.revision, action }, product, target,
    receipt: { namespace: NS, id: receiptId, productId: product.id, productRevision: 1, kind, buyerId: user, creatorId: creator,
      verification: "provider_verified", providerTestMode: true, ownership: "isolated", provider: "stripe", providerScope: "test-scope", transactionId: "test-transaction", state: "verified" },
    creator: { userId: creator, accountActive: true, moderation: "clear", viewerBlocked: false, premium: false },
    grant: { namespace: NS, id: grantId, buyerId: user, creatorId: creator, productId: product.id, productRevision: 1, kind,
      receiptId, revoked: false, quarantined: false, startsAtMs: NOW - 1000, expiresAtMs: NOW + 60000, termsRevision: 1, roomGeneration: generation, eventGeneration: generation },
    asset: { namespace: NS, id: assetId, ownerId: creator, resourceId: target.id, resourceRevision: 1, purpose: "video", provider: "s3", bucket: "isolated-private-fixture",
      objectKey: `${NS}/${creator}/${target.id}/${assetId}/bytes.mp4`, objectVersion: "immutable-version-1", incarnation, sha256: hash, byteLength: 1234, immutable: true, retained: true, deleted: false,
      scan: { assetId, incarnation, sha256: hash, byteLength: 1234, provider: "s3", bucket: "isolated-private-fixture",
        objectKey: `${NS}/${creator}/${target.id}/${assetId}/bytes.mp4`, objectVersion: "immutable-version-1",
        state: "clean", quarantined: false, scannerVersion: "fixture-scanner-v1", completedAtMs: NOW - 1000 } },
    inclusion: { namespace: NS, productId: product.id, productRevision: 1, targetId: target.id, targetRevision: 1, creatorId: creator, active: true,
      audience: kind === "vip_pass" ? "vip" : "subscriber", vipOnly: kind === "vip_pass" },
    room: { namespace: NS, resourceId: target.id, resourceRevision: 1, creatorId: creator, generation, state: "open", moderation: "clear", providerNamespace: NS,
      providerRoomName: `scv1-room-${target.id}-${generation}`, endsAtMs: NOW + 30000 },
    membership: { namespace: NS, resourceId: target.id, resourceRevision: 1, roomGeneration: generation, userId: user, sessionId: session, providerIdentity: user, state: "admitted", banned: false, validUntilMs: NOW + 2000 },
    seat: { namespace: NS, id: id("seat", 40), resourceId: target.id, resourceRevision: 1, productId: product.id, productRevision: 1, roomGeneration: generation, buyerId: user, grantId, state: "reserved", revoked: false },
    entry: { namespace: NS, grantId: id("grant", 41), userId: user, resourceId: target.id, resourceRevision: 1, roomGeneration: generation, sessionId: session, state: "admitted", revoked: false, validUntilMs: NOW + 1500 },
    event: { namespace: NS, resourceId: target.id, resourceRevision: 1, generation, creatorId: creator, termsRevision: 1, canceled: false, moderation: "clear",
      accessStartsAtMs: NOW - 1000, accessEndsAtMs: NOW + 30000, state: "live", providerNamespace: NS, broadcastGeneration: generation,
      providerRoomName: `scv1-event-${target.id}-${generation}`, outputId: id("output", 50), outputState: "active", audience: "spectator", fullRoomTokenAllowed: false },
    award: { namespace: NS, id: id("award", 60), productId: product.id, productRevision: 1, targetId: target.id, targetRevision: 1, buyerId: user, creatorId: creator,
      kind, receiptId, grantId, state: "settled", revoked: false, roomGeneration: generation, eventGeneration: generation,
      lotId: id("lot", 61), claimId: id("claim", 62), claimState: "consumed", termsRevision: 1, settledAtMs: NOW - 1000, claimDeadlineMs: NOW - 500,
      claim: { namespace: NS, id: id("claim", 62), lotId: id("lot", 61), productId: product.id, targetId: target.id, targetRevision: 1,
        buyerId: user, receiptId, grantId, kind, state: "consumed", deadlineMs: NOW - 500, consumedAtMs: NOW - 750, roomGeneration: generation, eventGeneration: generation } },
    order: { id: id("order", 70), buyerId: user, productId: product.id, productRevision: 1, receiptId, environment: "sandbox", fulfillmentMode: "test_only",
      shipmentDispatched: false, state: "paid", variantId: id("variant", 71), sku: "fixture-shirt-medium", quantity: 1, reservationId: id("reservation", 72), inventoryState: "allocated" },
  };
}
function allows(facts, issuer) {
  const result = evaluate(facts, NOW);
  assert.equal(result.eligibleForIssuer, true, result.reason);
  assert.equal(result.issuer, issuer);
  assert.equal(result.authorizationProof, false); assert.equal(result.grantsAccess, false); assert.equal(result.publishAllowed, false);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.binding));
  assert.ok(result.binding.expiresAtMs > NOW && result.binding.expiresAtMs <= NOW + 5000);
  assert.equal(result.binding.sessionId, facts.authority.sessionId);
  assert.doesNotMatch(JSON.stringify(result), /bytes\.mp4|test-transaction|test-scope|token|https/u);
  return result;
}
function rejects(facts, reason) {
  const result = evaluate(facts, NOW);
  assert.equal(result.eligibleForIssuer, false, `Unexpected issuer eligibility: ${JSON.stringify(result)}`);
  assert.equal(result.authorizationProof, false); assert.equal(result.grantsAccess, false); assert.equal(result.publishAllowed, false);
  if (reason) assert.equal(result.reason, reason);
}
const mutate = (source, change) => { const result = clone(source); change(result); return result; };

test("all twelve actual modes require their own complete fact graph and yield only nonauthorizing issuer eligibility", () => {
  const expected = { creator_tip: "receipt_reader", paid_content: "media_signer", channel_subscription: "media_signer", vip_pass: "media_signer",
    watch_party_live: "room_admission", live_watch_party_access: "room_admission", live_watch_party_seat: "seat_request",
    event: "event_spectator_proxy", event_auction: "event_spectator_proxy", physical_merch: "order_reader",
    "room_seat_auction:party_admission": "room_admission", "room_seat_auction:stage_reserved_seat": "seat_request" };
  assert.deepEqual([...kinds].sort(), Object.keys(expected).sort());
  for (const kind of kinds) allows(fixture(kind), expected[kind]);
});

test("exact current account/session, finite fresh facts and explicit environment are mandatory", () => {
  const base = fixture();
  for (const change of [
    (f) => { f.protocol = "legacy"; }, (f) => { f.environment = "live"; },
    (f) => { f.authority.accountId = uuid(99); }, (f) => { f.authority.sessionId = "17"; },
    (f) => { f.authority.accountActive = false; }, (f) => { f.authority.sessionActive = false; },
    (f) => { f.authority.restoreOnly = true; }, (f) => { f.authority.legalCurrent = false; },
    (f) => { f.authority.observedAtMs = NOW + 1; }, (f) => { f.authority.observedAtMs = NOW - 5001; },
    (f) => { f.authority.validUntilMs = NOW; }, (f) => { f.authority.validUntilMs = NOW + 5001; },
    (f) => { f.authority.validUntilMs = String(NOW + 1000); }, (f) => { delete f.authority; },
  ]) rejects(mutate(base, change));
  for (const input of [null, [], "claims", { protocol: NS }]) rejects(input);
});

test("receipt provenance, original target, creator, buyer, revision and sandbox ownership cannot be substituted", () => {
  const base = fixture();
  for (const change of [
    (f) => { f.receipt.id = uuid(30); }, (f) => { f.receipt.verification = "synthetic_offline"; },
    (f) => { f.receipt.providerTestMode = false; }, (f) => { f.receipt.ownership = "legacy"; },
    (f) => { f.receipt.buyerId = uuid(99); }, (f) => { f.receipt.creatorId = uuid(99); },
    (f) => { f.receipt.productId = id("resource", 99); }, (f) => { f.receipt.productRevision = 2; },
    (f) => { f.receipt.kind = "vip_pass"; }, (f) => { f.receipt.providerScope = ""; },
    (f) => { f.request.targetRevision = 2; }, (f) => { f.target.creatorId = uuid(99); },
    (f) => { f.product.namespace = "legacy"; }, (f) => { f.target.id = uuid(10); },
  ]) rejects(mutate(base, change));
});

test("retained paid rights do not require seller Premium but still require current grant and resource safety", () => {
  const base = fixture(); base.product.state = "retained"; base.target.state = "retained"; base.grant.expiresAtMs = null;
  allows(base, "media_signer");
  for (const change of [
    (f) => { f.target.quarantined = true; }, (f) => { f.target.moderation = "removed"; },
    (f) => { f.creator.viewerBlocked = true; }, (f) => { f.creator.accountActive = false; },
    (f) => { f.grant.revoked = true; }, (f) => { f.grant.quarantined = true; },
    (f) => { f.grant.receiptId = id("receipt", 99); }, (f) => { f.grant.startsAtMs = NOW + 1; },
    (f) => { f.grant.expiresAtMs = NOW; }, (f) => { f.grant.buyerId = uuid(99); },
    (f) => { f.grant.productRevision = 2; }, (f) => { f.receipt.state = "refunded"; },
    (f) => { f.receipt.state = "quarantined"; }, (f) => { delete f.grant; },
    (f) => { f.target.audience = "vip"; },
  ]) rejects(mutate(base, change));
});

test("video delivery requires immutable owned object and exact clean scan of those bytes", () => {
  const base = fixture();
  for (const change of [
    (f) => { f.asset.ownerId = uuid(99); }, (f) => { f.asset.resourceRevision = 2; },
    (f) => { f.asset.objectKey = `creator-videos/${f.asset.ownerId}/legacy.mp4`; },
    (f) => { f.asset.objectKey += "/../other"; }, (f) => { f.asset.objectKey += "%2e%2e"; },
    (f) => { f.asset.sha256 = [hash]; }, (f) => { f.asset.immutable = false; },
    (f) => { f.asset.retained = false; }, (f) => { f.asset.deleted = true; },
    (f) => { f.asset.scan.state = "pending"; }, (f) => { f.asset.scan.quarantined = true; },
    (f) => { f.asset.scan.incarnation = uuid(99); }, (f) => { f.asset.scan.sha256 = "b".repeat(64); },
    (f) => { f.asset.scan.byteLength += 1; }, (f) => { f.asset.scan.completedAtMs = NOW + 1; },
    (f) => { f.asset.bucket = "unscanned-bucket"; }, (f) => { f.asset.objectKey += ".other"; },
    (f) => { f.asset.objectVersion = "replacement"; }, (f) => { f.asset.provider = "cloudflare_r2"; },
  ]) rejects(mutate(base, change), "immutable_clean_asset_required");
});

test("subscription and VIP have finite terms and explicit same-creator content inclusion; neither includes rooms or other classes", () => {
  for (const kind of ["channel_subscription", "vip_pass"]) {
    const base = fixture(kind); allows(base, "media_signer");
    for (const change of [
      (f) => { f.grant.expiresAtMs = null; }, (f) => { f.inclusion.active = false; },
      (f) => { f.inclusion.targetRevision = 2; }, (f) => { f.inclusion.creatorId = uuid(99); },
      (f) => { f.inclusion.vipOnly = !f.inclusion.vipOnly; }, (f) => { f.target.kind = "watch_party_live"; },
      (f) => { f.target.audience = kind === "vip_pass" ? "paid" : "vip"; },
    ]) rejects(mutate(base, change));
    const surface = clone(base); surface.target = { ...surface.product }; surface.request.targetId = surface.product.id; surface.request.action = "read_membership";
    allows(surface, "membership_reader");
  }
  const vip = fixture("vip_pass"); vip.grant.expiresAtMs = NOW + 31 * 86400000; rejects(vip, "vip_duration_exceeded");
});

test("room delivery binds exact provider namespace, generation, current member and authenticated participant", () => {
  const base = fixture("watch_party_live");
  assert.equal(allows(base, "room_admission").binding.expiresAtMs, NOW + 2000);
  for (const change of [
    (f) => { f.room.state = "ended"; }, (f) => { f.room.providerNamespace = "legacy"; },
    (f) => { f.room.providerRoomName = "legacy-party-room"; }, (f) => { f.grant.roomGeneration = uuid(99); },
    (f) => { f.membership.sessionId = uuid(99); }, (f) => { f.membership.userId = uuid(99); },
    (f) => { f.membership.providerIdentity = "host"; }, (f) => { f.membership.state = "pending"; },
    (f) => { f.membership.banned = true; }, (f) => { f.membership.validUntilMs = NOW; },
    (f) => { f.membership.resourceRevision = 2; },
    (f) => { f.request.action = "publish_room_media"; }, (f) => { f.grant.expiresAtMs = null; },
  ]) rejects(mutate(base, change));
});

test("paid seats require independent current entry and exact reserved seat; approval never becomes publish authority", () => {
  for (const kind of ["live_watch_party_seat", "room_seat_auction:stage_reserved_seat"]) {
    const base = fixture(kind); const result = allows(base, "seat_request");
    assert.equal(result.binding.expiresAtMs, NOW + 1500);
    for (const change of [
      (f) => { f.entry.grantId = f.grant.id; }, (f) => { f.entry.sessionId = uuid(99); },
      (f) => { f.entry.roomGeneration = uuid(99); }, (f) => { f.entry.validUntilMs = NOW; },
      (f) => { f.seat.buyerId = uuid(99); }, (f) => { f.seat.state = "released"; },
      (f) => { f.seat.revoked = true; }, (f) => { delete f.entry; },
      (f) => { f.seat.resourceRevision = 2; }, (f) => { f.entry.resourceRevision = 2; },
      (f) => { f.seat.productId = id("resource", 99); },
    ]) rejects(mutate(base, change), "separate_entry_and_seat_required");
    base.seat.hostApproved = true; assert.equal(allows(base, "seat_request").publishAllowed, false);
  }
});

test("event delivery requires exact generation and purchased terms, spectator output or scanned replay", () => {
  const base = fixture("event"); allows(base, "event_spectator_proxy");
  for (const change of [
    (f) => { f.event.canceled = true; }, (f) => { f.event.accessEndsAtMs = NOW; },
    (f) => { f.event.termsRevision = 2; }, (f) => { f.grant.eventGeneration = uuid(99); },
    (f) => { f.event.broadcastGeneration = uuid(99); }, (f) => { f.event.fullRoomTokenAllowed = true; },
    (f) => { f.event.providerRoomName = "legacy-event"; }, (f) => { f.event.outputState = "pending"; },
    (f) => { f.event.audience = "host"; }, (f) => { f.event.state = "ended"; },
  ]) rejects(mutate(base, change));
  const replay = clone(base); replay.event.state = "replay"; replay.event.replayAvailable = true;
  replay.grant.replayAllowed = true; replay.grant.replayStartsAtMs = NOW - 1000; replay.grant.replayEndsAtMs = NOW + 2500;
  replay.asset.purpose = "event_replay"; replay.asset.eventGeneration = replay.event.generation;
  allows(replay, "event_spectator_proxy");
  for (const change of [
    (f) => { f.grant.replayAllowed = false; }, (f) => { delete f.grant.replayAllowed; },
    (f) => { f.grant.replayEndsAtMs = NOW; }, (f) => { f.grant.replayStartsAtMs = NOW + 1; },
    (f) => { f.event.replayAvailable = false; },
  ]) rejects(mutate(replay, change), "purchased_replay_terms_required");
  replay.asset.scan.state = "pending"; rejects(replay, "immutable_clean_replay_required");
});

test("auctions require paid settled exact lot, claim and target generation; historic claim deadline does not erase settled rights", () => {
  for (const kind of ["event_auction", "room_seat_auction:party_admission", "room_seat_auction:stage_reserved_seat"]) {
    const base = fixture(kind);
    assert.equal(evaluate(base, NOW).eligibleForIssuer, true);
    for (const change of [
      (f) => { f.award.state = "won"; }, (f) => { f.award.buyerId = uuid(99); },
      (f) => { f.award.receiptId = id("receipt", 99); }, (f) => { f.award.targetRevision = 2; },
      (f) => { f.award.claimState = "reserved"; }, (f) => { f.award.lotId = uuid(61); },
      (f) => { f.award.settledAtMs = NOW; }, (f) => { f.award.termsRevision = 2; },
      (f) => { f.award.claim.consumedAtMs = NOW; }, (f) => { f.award.claim.buyerId = uuid(99); },
      (f) => { f.award.claim.receiptId = id("receipt", 99); }, (f) => { f.award.claim.targetRevision = 2; },
      (f) => { f.award.claim.roomGeneration = uuid(99); f.award.claim.eventGeneration = uuid(99); },
      (f) => { f.award.roomGeneration = uuid(99); f.award.eventGeneration = uuid(99); },
    ]) rejects(mutate(base, change));
  }
});

test("tip and merch history remains buyer-owned through quarantine and takedown without any fulfillment or digital grant", () => {
  for (const kind of ["creator_tip", "physical_merch"]) {
    const base = fixture(kind); base.product.state = "retired"; base.target.state = "retired"; base.target.moderation = "removed";
    delete base.grant; delete base.creator;
    for (const state of ["verified", "refunded", "revoked", "quarantined"]) {
      base.receipt.state = state; allows(base, kind === "creator_tip" ? "receipt_reader" : "order_reader");
    }
    rejects(mutate(base, (f) => { f.request.action = "play_video"; }));
    rejects(mutate(base, (f) => { f.receipt.buyerId = uuid(99); }));
  }
  const merch = fixture("physical_merch");
  for (const change of [
    (f) => { f.order.fulfillmentMode = "live"; }, (f) => { f.order.shipmentDispatched = true; },
    (f) => { f.order.receiptId = id("receipt", 99); }, (f) => { f.order.quantity = 0; },
    (f) => { f.order.variantId = uuid(71); }, (f) => { delete f.order.reservationId; },
  ]) rejects(mutate(merch, change), "exact_test_order_required");
});
