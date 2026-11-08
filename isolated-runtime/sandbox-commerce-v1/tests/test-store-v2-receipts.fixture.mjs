// Actual raw parser/crypto and SQL projection; provider bytes and keys are
// explicit synthetic fixtures. No fetch, provider or target connection exists.
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createV2SourceLoader, v2Connection, V2_FIXTURE, sqlText, sqlJson } from './test-store-v2.fixture.mjs';

export const receiptSources = repo => ['revenuecat-router-envelope.ts', 'isolated-test-store-v2-receipt.ts', 'revenuecat-lossless-envelope.ts']
  .map(name => path.join(repo, 'supabase/functions/_shared', name));
export function createV2ReceiptFixture(q, api, repo) {
  const files = receiptSources(repo), load = createV2SourceLoader(files);
  const transport = load(files[0]), contract = load(files[1]), lossless = load(files[2]), connection = v2Connection();
  const service = expression => JSON.parse(q(api.servicePrefix + 'select ' + expression + ';'));
  const event = (context, patch = {}) => {
    const millis = Number(q('select floor(extract(epoch from clock_timestamp())*1000)::bigint;')) + 2;
    assert.ok(Number.isSafeInteger(millis));
    const transaction = 'synthetic-v2-' + randomUUID();
    return { id: randomUUID(), type: 'NON_RENEWING_PURCHASE', app_id: connection.appId,
      store: 'TEST_STORE', environment: 'SANDBOX', app_user_id: context.customer.providerAppUserId,
      original_app_user_id: context.customer.providerAppUserId, aliases: [], product_id: V2_FIXTURE.productId,
      transaction_id: transaction, original_transaction_id: transaction, purchased_at_ms: millis,
      event_timestamp_ms: millis + 1, expiration_at_ms: null, price_in_purchased_currency: 1.99,
      currency: 'USD', quantity: 1, presented_offering_id: context.allocation.registration.offeringIdentifier, ...patch };
  };
  const evidence = async (value, rawOverride) => {
    const raw = rawOverride ?? JSON.stringify({ api_version: '1.0', event: value });
    const authenticated = await transport.authenticateRevenueCatEnvelope(new Request('https://synthetic.invalid/test-store-v2', {
      method: 'POST', headers: { authorization: connection.authentication.secret }, body: raw,
    }), connection);
    const bytes = await transport.decryptRouterEnvelope(authenticated, connection);
    const envelope = await lossless.createLosslessRouterEnvelope(authenticated);
    const observation = contract.parseTestStoreV2Observation(bytes, connection);
    return { raw, envelope, observation };
  };
  const ingestEvidence = value => service(`public.isolated_test_store_ingest_v2(${sqlText(connection.connectionId)},1,${sqlJson(value.envelope)},${sqlJson(value.observation)})`);
  const ingest = async (value, rawOverride) => ingestEvidence(await evidence(value, rawOverride));
  const effect = ingressId => {
    assert.match(ingressId, /^[a-f0-9-]{36}$/u);
    return JSON.parse(q(`select result from sandbox_commerce_v1.test_store_v2_effects where ingress_id=${sqlText(ingressId)};`));
  };
  const decrypt = envelope => lossless.decryptLosslessRouterEnvelope(envelope, connection);
  const capture = async raw => {
    let prepared;
    const handler = contract.createIsolatedTestStoreV2Handler({ connection: () => connection,
      persist: async (_id, _revision, envelope, observation) => {
        prepared = { envelope, observation }; return ingestEvidence(prepared);
      } });
    const response = await handler(new Request('https://synthetic.invalid/test-store-v2', {
      method: 'POST', headers: { authorization: connection.authentication.secret }, body: raw,
    }));
    return { status: response.status, result: await response.json(), prepared };
  };
  return { event, evidence, ingestEvidence, ingest, service, effect, decrypt, capture };
}
