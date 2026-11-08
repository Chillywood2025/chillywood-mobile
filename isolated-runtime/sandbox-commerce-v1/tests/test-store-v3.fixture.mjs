// Additive Test Store v3 local fixture. All provider credentials, observations
// and qualification facts are synthetic; no real provider/target is consulted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { fileHash } from './test-store.fixture.mjs';
import { BUYER, BUYER_SESSION, sqlText, sqlJson, syntheticHash } from './receipts.fixture.mjs';
export { createTestStoreCluster } from './test-store.fixture.mjs';
export { BUYER, BUYER_SESSION, SELLER, SELLER_SESSION, sqlText, sqlJson, syntheticHash } from './receipts.fixture.mjs';

export const V3_FIXTURE = Object.freeze({
  connectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', connectionRevision: 1,
  projectId: 'synthetic-test-store-v3-project', appId: 'synthetic-test-store-v3-app',
  providerConfigurationDigest: syntheticHash('v3-provider-configuration'),
  configurationDigest: syntheticHash('v3-dedicated-native-profile'),
  credentialVersion: 'synthetic-v3-api-credential', credentialRef: 'synthetic-v3-credential-domain',
  productId: 'fixture.isolated.test_store.v3.video', providerProductId: 'synthetic-provider-product-v3',
  amountMinor: 199, currency: 'usd',
});

export function v3Scope() {
  return { provider: 'revenuecat', providerScopeKey: JSON.stringify(['revenuecat', V3_FIXTURE.projectId,
    V3_FIXTURE.appId, 'TEST_STORE', 'SANDBOX']), store: 'test_store', sourceEnvironment: 'SANDBOX',
  productId: V3_FIXTURE.productId, amountMinor: V3_FIXTURE.amountMinor };
}

export function v3Connection() {
  return { connectionId: V3_FIXTURE.connectionId, connectionRevision: V3_FIXTURE.connectionRevision,
    projectId: V3_FIXTURE.projectId, appId: V3_FIXTURE.appId,
    providerConfigurationDigest: V3_FIXTURE.providerConfigurationDigest,
    authentication: { method: 'shared_secret', keyVersion: 'synthetic-v3-auth', secret: 'Bearer ' + 'v'.repeat(40) },
    encryption: { keyId: 'synthetic-v3-storage', key: new Uint8Array(32).fill(22) } };
}

export function createV3SourceLoader(sourceFiles) {
  const allowed = new Set(sourceFiles), cache = new Map(), require = createRequire(import.meta.url), ts = require('typescript');
  for (const file of sourceFiles) assert.ok(path.isAbsolute(file), 'Source loader requires exact absolute paths');
  const load = file => {
    assert.ok(allowed.has(file), 'Unreviewed source import: ' + file);
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    assert.deepEqual(compiled.diagnostics, []);
    new Function('exports', 'require', compiled.outputText)(exports, name => load(path.resolve(path.dirname(file), name)));
    return exports;
  };
  return load;
}

export function qualificationSources(repo) {
  return ['revenuecat-router-envelope.ts', 'isolated-test-store-qualification.ts']
    .map(name => path.join(repo, 'supabase/functions/_shared', name));
}

export function createQualificationFixture(q, repo, load) {
  const files = qualificationSources(repo), envelopeSource = load(files[0]), source = load(files[1]);
  const connection = { connectionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', connectionRevision: 1,
    projectId: V3_FIXTURE.projectId, appId: V3_FIXTURE.appId,
    authentication: { method: 'shared_secret', keyVersion: 'synthetic-qualification-auth', secret: 'Bearer ' + 'q'.repeat(40) },
    encryption: { keyId: 'synthetic-qualification-storage', key: new Uint8Array(32).fill(33) } };
  const prefix = "set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}';";
  const expression = value => `public.isolated_test_store_qualification_ingest_v1('${connection.connectionId}',1,${sqlJson(value.envelope)},${sqlJson(value.observation)})`;
  const ingest = value => JSON.parse(q(prefix + 'select ' + expression(value) + ';'));
  const evidence = async value => {
    const raw = typeof value === 'string' ? value : JSON.stringify({ api_version: '1.0', event: value });
    const request = () => new Request('https://synthetic.invalid/qualification', { method: 'POST',
      headers: { authorization: connection.authentication.secret }, body: raw });
    const authenticated = await envelopeSource.authenticateRevenueCatEnvelope(request(), connection);
    const bytes = await envelopeSource.decryptRouterEnvelope(authenticated, connection);
    const envelope = await source.createQualificationEnvelope(authenticated);
    const observation = source.observeQualificationBytes(bytes, connection);
    return { raw, envelope, observation, request };
  };
  let persisted = null;
  const handler = source.createQualificationHandler({ connection: () => connection,
    persist: async (id, revision, envelope, observation) => {
      assert.equal(id, connection.connectionId); assert.equal(revision, 1);
      persisted = structuredClone({ envelope, observation }); return ingest({ envelope, observation });
    } });
  const capture = async value => {
    const prepared = await evidence(value); persisted = null;
    const response = await handler(prepared.request());
    const result = await response.json();
    assert.equal(result.behavioralQualificationGranted, false); assert.equal(result.authorityGranted, false);
    assert.equal(result.economicProjectionAllowed, false);
    return { status: response.status, result, prepared, persisted };
  };
  return { connection, source, expression, prefix, evidence, ingest, capture,
    decrypt: stored => source.decryptQualificationEnvelope(stored, connection) };
}

export function seedV3Authority(q) {
  q(`select authority_fixture.reset();
    insert into auth.users(id,email_confirmed_at,raw_app_meta_data) values('${BUYER}',clock_timestamp(),'{}');
    insert into auth.sessions values('${BUYER_SESSION}','${BUYER}',clock_timestamp()+interval '1 hour');
    insert into public.wave1_legal_acceptances select '${BUYER}','${BUYER_SESSION}',document_key,version,market,capability,'member',null
      from public.wave1_legal_document_versions where capability='account';
    update sandbox_commerce_v1.lifecycle set state='active';`);
  assert.equal(q(`select count(*) from public.user_entitlements where user_id='${BUYER}';`), '0');
}

export function seedV3Qualified(q, { seedAuthority = true } = {}) {
  if (seedAuthority) seedV3Authority(q);
  const connection = v3Connection(), scope = v3Scope(), catalogId = randomUUID();
  q(`insert into sandbox_commerce_v1.test_store_v3_connections(id,revision,project_id,app_id,scope_key,economic_application_id,
      provider_configuration_digest,auth_key_version,storage_key_id,credential_ref,credential_version,qualified,
      ownership_evidence_sha256,delivery_evidence_sha256,lifecycle_evidence_sha256,provisioning_evidence_sha256,
      qualified_offering_state,webhook_offering_representation,refund_contract)
    values('${connection.connectionId}',1,${sqlText(connection.projectId)},${sqlText(connection.appId)},${sqlText(scope.providerScopeKey)},
      ${sqlText(`rc_test_store:${connection.projectId}:${connection.appId}`)},${sqlText(connection.providerConfigurationDigest)},
      ${sqlText(connection.authentication.keyVersion)},${sqlText(connection.encryption.keyId)},${sqlText(V3_FIXTURE.credentialRef)},
      ${sqlText(V3_FIXTURE.credentialVersion)},true,${sqlText(syntheticHash('v3-ownership'))},${sqlText(syntheticHash('v3-delivery'))},
      ${sqlText(syntheticHash('v3-lifecycle'))},${sqlText(syntheticHash('v3-provisioning'))},'active','lookup_key','cancellation_customer_support_full_paid_video_v1');
    insert into sandbox_commerce_v1.test_store_v3_native_profiles(configuration_digest,connection_id,connection_revision,platform,
      application_id,public_sdk_key_sha256,storage_namespace,qualified,native_evidence_sha256,lifetime_evidence_sha256)
    values(${sqlText(V3_FIXTURE.configurationDigest)},'${connection.connectionId}',1,'ios','fixture.dedicated.v3.debug',
      ${sqlText(syntheticHash('v3-public-key'))},'fixture-dedicated-test-store-v3',true,${sqlText(syntheticHash('v3-native'))},
      ${sqlText(syntheticHash('v3-native-lifetime'))});
    insert into sandbox_commerce_v1.catalog(id,kind,provider,scope_key,store,product_id,amount_minor,currency)
    values('${catalogId}','paid_content','revenuecat',${sqlText(scope.providerScopeKey)},'test_store',${sqlText(scope.productId)},199,'usd');
    insert into sandbox_commerce_v1.test_store_v3_products(catalog_id,connection_id,connection_revision,provider_product_id,store_identifier,
      qualified_product_type,qualified_one_time_consumable,qualified_product_state,amount_minor,currency,qualified,source_evidence_sha256)
    values('${catalogId}','${connection.connectionId}',1,${sqlText(V3_FIXTURE.providerProductId)},${sqlText(scope.productId)},
      'consumable',null,'active',199,'usd',true,${sqlText(syntheticHash('v3-product'))});
    update sandbox_commerce_v1.test_store_v3_controls set connection_id='${connection.connectionId}',connection_revision=1,
      ingress_enabled=true,provisioning_enabled=true,initiation_enabled=true,max_active_plans=32,requests_per_minute=60,max_pages=10;
  `);
  q(`insert into sandbox_commerce_v1.paid_video_catalog values('${catalogId}',3,${sqlText(syntheticHash('v3-catalog'))});`);
  return { connection, scope, catalogId };
}

export function legacyAuthoritySnapshot(q) {
  return q(`select jsonb_build_object(
    'entitlements',(select coalesce(jsonb_agg(to_jsonb(e) order by to_jsonb(e)::text),'[]'::jsonb) from public.user_entitlements e),
    'grants',(select coalesce(jsonb_agg(to_jsonb(g) order by to_jsonb(g)::text),'[]'::jsonb) from public.access_grants g));`);
}

export function createV3CommandApi(q) {
  const captures = [];
  let capturing = false;
  const servicePrefix = "set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}';";
  const expression = (command, payload, requestId = randomUUID(),
    actor = { userId: BUYER, sessionId: BUYER_SESSION }, configurationDigest = V3_FIXTURE.configurationDigest) =>
    `public.isolated_test_store_command_v3(${sqlText(actor.userId)},${sqlText(actor.sessionId)},${sqlText(command)},`
    + `${sqlText(requestId)},${sqlText(configurationDigest)},${sqlJson(payload)})`;
  const call = (command, payload, requestId = randomUUID(),
    actor = { userId: BUYER, sessionId: BUYER_SESSION }, configurationDigest = V3_FIXTURE.configurationDigest) => {
    const response = JSON.parse(q(servicePrefix + 'select ' + expression(command, payload, requestId, actor, configurationDigest) + ';'));
    assert.equal(response.protocol, 'isolated-test-store-v3'); assert.equal(response.command, command);
    assert.equal(response.requestId, requestId); assert.deepEqual(response.actor, actor);
    assert.equal(response.generation, 1); assert.equal(response.environment, 'sandbox');
    assert.equal(response.result.retryProviderMutation, false);
    assert.equal(response.result.grantsAccess, false); assert.equal(response.result.notPayable, true);
    if (response.result.dispatchAllowed) {
      assert.equal(command, 'claim'); assert.equal(response.result.status, 'dispatch_claimed');
      assert.ok(Number.isFinite(Date.parse(response.result.authorityValidUntil)));
    } else assert.equal(response.result.authorityValidUntil, null);
    if (capturing) captures.push({ command, requestId, actor, configurationDigest, payload, response });
    return response;
  };
  return { servicePrefix, expression, call, captures, capture(value) { capturing = value; } };
}
