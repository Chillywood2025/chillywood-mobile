// Actual raw parser/crypto and SQL projection; provider bytes and keys are
// explicit synthetic fixtures. No fetch, provider or target connection exists.
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createV3SourceLoader, v3Connection, V3_FIXTURE, sqlText, sqlJson } from './test-store-v3.fixture.mjs';

export const receiptSources = repo => ['revenuecat-router-envelope.ts', 'isolated-test-store-v3-receipt.ts', 'revenuecat-lossless-envelope.ts']
  .map(name => path.join(repo, 'supabase/functions/_shared', name));
export function createV3ReceiptFixture(q, api, repo) {
  const files = receiptSources(repo), load = createV3SourceLoader(files);
  const transport = load(files[0]), contract = load(files[1]), connection = v3Connection();
  const service = expression => JSON.parse(q(api.servicePrefix + 'select ' + expression + ';'));
  const event = (context, patch = {}) => {
    const millis = Number(q('select floor(extract(epoch from clock_timestamp())*1000)::bigint;')) + 2;
    assert.ok(Number.isSafeInteger(millis));
    const transaction = 'synthetic-v3-' + randomUUID();
    return { id: randomUUID(), type: 'NON_RENEWING_PURCHASE', app_id: connection.appId,
      store: 'TEST_STORE', environment: 'SANDBOX', app_user_id: context.customer.providerAppUserId,
      original_app_user_id: context.customer.providerAppUserId, aliases: [], product_id: V3_FIXTURE.productId,
      transaction_id: transaction, original_transaction_id: transaction, purchased_at_ms: millis,
      event_timestamp_ms: millis + 1, expiration_at_ms: null, price_in_purchased_currency: 1.99,
      currency: 'USD', quantity: 1, presented_offering_id: context.allocation.registration.offeringIdentifier, ...patch };
  };
  const evidence = async (value, rawOverride) => {
    const raw = rawOverride ?? JSON.stringify({ api_version: '1.0', event: value });
    const authenticated = await transport.authenticateRevenueCatEnvelope(new Request('https://synthetic.invalid/test-store-v3', {
      method: 'POST', headers: { authorization: connection.authentication.secret }, body: raw,
    }), connection);
    const bytes = await transport.decryptRouterEnvelope(authenticated, connection);
    const envelope = await contract.storeTestStoreV3Envelope(authenticated);
    const observation = contract.parseTestStoreV3Observation(bytes, connection);
    return { raw, envelope, observation };
  };
  const ingestEvidence = value => service(`public.isolated_test_store_ingest_v3(${sqlText(connection.connectionId)},1,${sqlJson(value.envelope)},${sqlJson(value.observation)})`);
  const ingest = async (value, rawOverride) => ingestEvidence(await evidence(value, rawOverride));
  const effect = ingressId => {
    assert.match(ingressId, /^[a-f0-9-]{36}$/u);
    return JSON.parse(q(`select result from sandbox_commerce_v1.test_store_v3_effects where ingress_id=${sqlText(ingressId)};`));
  };
  return { event, evidence, ingestEvidence, ingest, service, effect, connection };
}
