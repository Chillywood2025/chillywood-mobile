// Additive Test Store v2 local fixture. All provider credentials, observations
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

export const V2_SQL_FILES = Object.freeze([
  'core.sql', 'premium-authority.sql', 'authority.sql', 'commands.sql', 'receipts.sql', 'test-store.sql', 'history.sql',
  'test-store-offerings-core.sql', 'test-store-qualification.sql', 'test-store-offerings-provisioning.sql',
  'test-store-offerings-commands.sql', 'test-store-offerings-receipts.sql', 'permissions-finalize.sql',
]);

export function installTestStoreV2Sql(here, extraSources = []) {
  const runtime = path.dirname(here), repo = path.resolve(runtime, '../..');
  const sql = Object.fromEntries(V2_SQL_FILES.map(name => [name, fs.readFileSync(path.join(runtime, name), 'utf8')]));
  const fixtures = Object.fromEntries(['premium-authority.fixture.sql', 'authority.fixture.sql']
    .map(name => [name, fs.readFileSync(path.join(here, name), 'utf8')]));
  const declaration = 'create table sandbox_commerce_v1.declarations(user_id uuid primary key,session_id uuid,\n'
    + ' declared_18_plus boolean,country_code text,region_code text,declaration_version text,updated_at timestamptz);';
  assert.equal(fixtures['authority.fixture.sql'].split(declaration).length, 2,
    'Fixture declarations changed; exact adaptation needs review');
  const paths = [...new Set([...V2_SQL_FILES.map(name => path.join(runtime, name)),
    ...Object.keys(fixtures).map(name => path.join(here, name)),
    ...['test-store-v2.fixture.mjs', 'test-store-v2.native.mjs', 'test-store.fixture.mjs', 'receipts.fixture.mjs']
      .map(name => path.join(here, name)), ...extraSources])];
  for (const file of paths) assert.ok(path.isAbsolute(file), 'Every source dependency must be explicit and absolute');
  const sourceHashes = Object.fromEntries(paths.map(file => [path.relative(repo, file), fileHash(file)]));
  return {
    sql: 'begin;create role anon nologin;create role authenticated nologin;create role service_role nologin;'
      + 'alter default privileges for role postgres grant execute on functions to authenticated;'
      + sql['core.sql'] + fixtures['premium-authority.fixture.sql']
      + fixtures['authority.fixture.sql'].replace(declaration, '-- The real core supplies exactly this declarations table.')
      + V2_SQL_FILES.filter(name => name !== 'core.sql').map(name => sql[name]).join('\n') + 'commit;',
    sourceHashes,
    fixtureAdaptation: 'Removed exactly one fixture declarations CREATE; all installed product SQL is unchanged.',
    assertUnchanged() {
      for (const file of paths) assert.equal(fileHash(file), sourceHashes[path.relative(repo, file)],
        'Source changed during native proof: ' + path.relative(repo, file));
    },
  };
}

export const V2_FIXTURE = Object.freeze({
  connectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', connectionRevision: 1,
  projectId: 'synthetic-test-store-v2-project', appId: 'synthetic-test-store-v2-app',
  providerConfigurationDigest: syntheticHash('v2-provider-configuration'),
  configurationDigest: syntheticHash('v2-dedicated-native-profile'),
  credentialVersion: 'synthetic-v2-api-credential', credentialRef: 'synthetic-v2-credential-domain',
  productId: 'fixture.isolated.test_store.v2.tip', providerProductId: 'synthetic-provider-product-v2',
  amountMinor: 199, currency: 'usd',
});

export function v2Scope() {
  return { provider: 'revenuecat', providerScopeKey: JSON.stringify(['revenuecat', V2_FIXTURE.projectId,
    V2_FIXTURE.appId, 'TEST_STORE', 'SANDBOX']), store: 'test_store', sourceEnvironment: 'SANDBOX',
  productId: V2_FIXTURE.productId, amountMinor: V2_FIXTURE.amountMinor };
}

export function v2Connection() {
  return { connectionId: V2_FIXTURE.connectionId, connectionRevision: V2_FIXTURE.connectionRevision,
    projectId: V2_FIXTURE.projectId, appId: V2_FIXTURE.appId,
    providerConfigurationDigest: V2_FIXTURE.providerConfigurationDigest,
    authentication: { method: 'shared_secret', keyVersion: 'synthetic-v2-auth', secret: 'Bearer ' + 'v'.repeat(40) },
    encryption: { keyId: 'synthetic-v2-storage', key: new Uint8Array(32).fill(22) } };
}

export function createV2SourceLoader(sourceFiles) {
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
    projectId: V2_FIXTURE.projectId, appId: V2_FIXTURE.appId,
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

export function seedV2Authority(q) {
  q(`select authority_fixture.reset();
    insert into auth.users(id,email_confirmed_at,raw_app_meta_data) values('${BUYER}',clock_timestamp(),'{}');
    insert into auth.sessions values('${BUYER_SESSION}','${BUYER}',clock_timestamp()+interval '1 hour');
    insert into public.wave1_legal_acceptances select '${BUYER}','${BUYER_SESSION}',document_key,version,market,capability,'member',null
      from public.wave1_legal_document_versions where capability='account';
    update sandbox_commerce_v1.lifecycle set state='active';`);
  assert.equal(q(`select count(*) from public.user_entitlements where user_id='${BUYER}';`), '0');
}

export function seedV2Qualified(q, { seedAuthority = true } = {}) {
  if (seedAuthority) seedV2Authority(q);
  const connection = v2Connection(), scope = v2Scope(), catalogId = randomUUID();
  q(`insert into sandbox_commerce_v1.test_store_v2_connections(id,revision,project_id,app_id,scope_key,economic_application_id,
      provider_configuration_digest,auth_key_version,storage_key_id,credential_ref,credential_version,qualified,
      ownership_evidence_sha256,delivery_evidence_sha256,lifecycle_evidence_sha256,provisioning_evidence_sha256,
      qualified_offering_state,webhook_offering_representation,refund_contract)
    values('${connection.connectionId}',1,${sqlText(connection.projectId)},${sqlText(connection.appId)},${sqlText(scope.providerScopeKey)},
      ${sqlText(`rc_test_store:${connection.projectId}:${connection.appId}`)},${sqlText(connection.providerConfigurationDigest)},
      ${sqlText(connection.authentication.keyVersion)},${sqlText(connection.encryption.keyId)},${sqlText(V2_FIXTURE.credentialRef)},
      ${sqlText(V2_FIXTURE.credentialVersion)},true,${sqlText(syntheticHash('v2-ownership'))},${sqlText(syntheticHash('v2-delivery'))},
      ${sqlText(syntheticHash('v2-lifecycle'))},${sqlText(syntheticHash('v2-provisioning'))},'active','lookup_key','cancellation_customer_support_full_tip_v1');
    insert into sandbox_commerce_v1.test_store_v2_native_profiles(configuration_digest,connection_id,connection_revision,platform,
      application_id,public_sdk_key_sha256,storage_namespace,qualified,native_evidence_sha256,lifetime_evidence_sha256)
    values(${sqlText(V2_FIXTURE.configurationDigest)},'${connection.connectionId}',1,'ios','fixture.dedicated.v2.debug',
      ${sqlText(syntheticHash('v2-public-key'))},'fixture-dedicated-test-store-v2',true,${sqlText(syntheticHash('v2-native'))},
      ${sqlText(syntheticHash('v2-native-lifetime'))});
    insert into sandbox_commerce_v1.catalog(id,kind,provider,scope_key,store,product_id,amount_minor,currency)
    values('${catalogId}','creator_tip','revenuecat',${sqlText(scope.providerScopeKey)},'test_store',${sqlText(scope.productId)},199,'usd');
    insert into sandbox_commerce_v1.test_store_v2_products(catalog_id,connection_id,connection_revision,provider_product_id,store_identifier,
      qualified_product_type,qualified_one_time_consumable,qualified_product_state,amount_minor,currency,qualified,source_evidence_sha256)
    values('${catalogId}','${connection.connectionId}',1,${sqlText(V2_FIXTURE.providerProductId)},${sqlText(scope.productId)},
      'consumable',null,'active',199,'usd',true,${sqlText(syntheticHash('v2-product'))});
    update sandbox_commerce_v1.test_store_v2_controls set connection_id='${connection.connectionId}',connection_revision=1,
      ingress_enabled=true,provisioning_enabled=true,initiation_enabled=true,max_active_plans=32,requests_per_minute=60,max_pages=10;
  `);
  assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_connections;'), '0', 'The v2 fixture must not seed a v1 connection');
  return { connection, scope, catalogId };
}

export function legacyAuthoritySnapshot(q) {
  return q(`select jsonb_build_object(
    'entitlements',(select coalesce(jsonb_agg(to_jsonb(e) order by to_jsonb(e)::text),'[]'::jsonb) from public.user_entitlements e),
    'grants',(select coalesce(jsonb_agg(to_jsonb(g) order by to_jsonb(g)::text),'[]'::jsonb) from public.access_grants g));`);
}

export function createV2CommandApi(q) {
  const captures = [];
  let capturing = false;
  const servicePrefix = "set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}';";
  const expression = (command, payload, requestId = randomUUID(),
    actor = { userId: BUYER, sessionId: BUYER_SESSION }, configurationDigest = V2_FIXTURE.configurationDigest) =>
    `public.isolated_test_store_command_v2(${sqlText(actor.userId)},${sqlText(actor.sessionId)},${sqlText(command)},`
    + `${sqlText(requestId)},${sqlText(configurationDigest)},${sqlJson(payload)})`;
  const call = (command, payload, requestId = randomUUID(),
    actor = { userId: BUYER, sessionId: BUYER_SESSION }, configurationDigest = V2_FIXTURE.configurationDigest) => {
    const response = JSON.parse(q(servicePrefix + 'select ' + expression(command, payload, requestId, actor, configurationDigest) + ';'));
    assert.equal(response.protocol, 'isolated-test-store-v2'); assert.equal(response.command, command);
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
