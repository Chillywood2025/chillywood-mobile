import {prepareNativeStoreSandboxIntakeV1,type NativeStoreSandboxConnectionV1} from "../_shared/native-store-sandbox-bridge-v1.ts";
const id = (n:number) => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export async function fixture(negative = false) {
  const config = { bridgeProtocol: 'native-store-sandbox-v1', connectionId: id(12), connectionRevision: 1,
    projectId: 'synthetic-project', appId: 'synthetic-app', store: 'APP_STORE', environment: 'SANDBOX',
    authentication: { method: 'shared_secret', keyVersion: 'synthetic-v1', secret: 'synthetic-not-a-real-secret-'.repeat(2) },
    encryption: { keyId: 'synthetic-key', key: new Uint8Array(32).fill(17) } };
  const event = { id: 'synthetic-event', type: negative ? 'CANCELLATION' : 'NON_RENEWING_PURCHASE', app_id: config.appId,
    store: config.store, environment: 'SANDBOX', app_user_id: id(1), original_app_user_id: id(1),
    transaction_id: 'synthetic-tx', original_transaction_id: 'synthetic-tx', product_id: 'synthetic-product',
    event_timestamp_ms: 1794139200000, purchased_at_ms: 1794139190000, price_in_purchased_currency: 1.99,
    currency: 'USD', quantity: 1, expiration_at_ms: null, ...(negative ? { cancel_reason: 'CUSTOMER_SUPPORT' } : {}) };
  const envelope = (await prepareNativeStoreSandboxIntakeV1(new Request('https://local.invalid', {
    method: 'POST', headers: { authorization: config.authentication.secret }, body: JSON.stringify({ api_version: '1.0', event }) }), config as NativeStoreSandboxConnectionV1)).envelope;
  const work = { rawReceiptId: id(13), claimId: negative ? null : id(2), protocolId: id(20), protocolRevision: 1 };
  const quote = { offerId: 'scv1_offer_' + id(6), offerRevision: 1, resourceId: 'scv1_resource_' + id(7), resourceRevision: 1,
    creatorId: id(8), kind: 'paid_content', amountMinor: 199, currency: 'usd',
    asset: { id: 'scv1_asset_' + id(9), incarnation: id(10), sha256: 'a'.repeat(64), byteLength: 100, resourceRevision: 1, profile: 'scpv-mp4-h264-aac-v1' },
    catalog: { bindingId: 'nssv1_catalog_' + id(11), revision: 1, projectId: config.projectId, appId: config.appId,
      store: config.store, environment: 'SANDBOX', wireProductId: event.product_id }, quoteDigest: 'b'.repeat(64) };
  const claim = { buyerId: id(1), selectionSessionGeneration: id(5), quote,
    claim: { id: 'nssv1_claim_' + id(2), selectionId: 'nssv1_selection_' + id(3), originalRequestId: id(4),
      originalSessionGeneration: id(5), createdAt: '2026-11-08T01:00:00Z', transactionIdentifier: event.transaction_id,
      productIdentifier: event.product_id, evidence: 'client_assertion', settlementAllowed: false } };
  const context = { protocol: 'native-store-effect-context-v1', raw: { rawReceiptId: work.rawReceiptId, rawSha256: envelope.rawSha256,
    rawByteLength: envelope.rawByteLength, connectionId: config.connectionId, connectionRevision: 1, projectId: config.projectId,
    appId: config.appId, store: config.store, environment: 'SANDBOX', intakeEnabled: true, originalRevisionRevoked: false,
    recordedAt: '2026-11-08T01:00:00Z', eventIds: [id(21)], conflicted: false, observation: envelope.observation },
    claim: negative ? null : claim,
    settlementProtocol: { id: work.protocolId, revision: 1, policy: 'exact_native_usd_consumable_v1', projectId: config.projectId,
      appId: config.appId, store: config.store, productId: event.product_id, connectionId: config.connectionId, connectionRevision: 1,
      scopeKey: JSON.stringify(['native-store-sandbox-v1', 'revenuecat', config.projectId, config.appId, config.store, 'SANDBOX']),
      platform: 'ios', nativeBuild: '43', nativeVersion: '1.0', signedAppVersion: '42.7', sdkVersion: '10.15.1' } };
  const journal = { protocol: 'native-store-sandbox-journal-read-v1', revoked: false,
    receipt: { id: work.rawReceiptId, project_id: config.projectId, connection_id: config.connectionId, connection_revision: 1,
      raw_sha256: envelope.rawSha256, raw_byte_length: envelope.rawByteLength, envelope },
    registry: { id: config.connectionId, revision: 1, project_id: config.projectId, app_id: config.appId, store: config.store,
      environment: 'SANDBOX', auth_key_version: config.authentication.keyVersion, storage_key_id: config.encryption.keyId } };
  const result = { protocol: 'native-store-effect-result-v1', consumer: 'native-store-sandbox-v1', rawReceiptId: work.rawReceiptId,
    status: 'processed', effectKind: negative ? 'negative_applied' : 'positive_applied', allocationId: negative ? null : 'nssv1_allocation_' + id(76),
    grantId: negative ? null : 'scv1_grant_' + id(77), durable: true, acknowledgementAllowed: true, grantsAccess: false, financialAuthority: false, payable: false };
  return { work, context, journal, config, result, event };
}
