import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {webcrypto} from 'node:crypto';
import {Buffer} from 'node:buffer';
import ts from 'typescript';
globalThis.crypto ??= webcrypto;
const root = path.resolve(import.meta.dirname, '../../supabase/functions');
const id = n => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Execute the actual entrypoint, configuration, authentication, encrypted
// journal preparation, private worker and legacy dispatcher. Only external
// SQL/RPC boundaries are modeled here; this is not provider/device proof.
function loader(env = {}, client = {}, clock = performance) {
  const cache = new Map(); let handler;
  const Deno = {env: {get: key => env[key]}, serve: fn => {handler = fn;}};
  const load = name => {
    const file = path.resolve(root, name);
    if (cache.has(file)) return cache.get(file);
    const api = {}; cache.set(file, api);
    const source = fs.readFileSync(file, 'utf8');
    const code = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText;
    new Function('exports', 'require', 'Deno', 'performance', code)(api, specifier => {
      if (specifier.startsWith('jsr:')) return {};
      if (specifier.startsWith('npm:')) return {createClient: () => client};
      return load(path.relative(root, path.resolve(path.dirname(file), specifier)));
    }, Deno, clock);
    return api;
  };
  return {load, get handler() {return handler;}};
}

async function harness({store = 'APP_STORE', negative = false, mode = 'success', legacyPatch = {}, enabled = true, clock = performance, beforeRpc = () => {}, legacyDatabase = null} = {}) {
  const env = {}, calls = [], client = {};
  const l = loader(env, client, clock), f = await l.load('native-store-reconcile-v1/runtime_fixture.ts').fixture(negative);
  f.config.store = store; f.event.store = store;
  f.config.appId = store === 'PLAY_STORE' ? 'synthetic-google-app' : 'synthetic-app'; f.event.app_id = f.config.appId;
  f.context.raw.store = store; f.context.raw.appId = f.config.appId;
  f.context.settlementProtocol.store = store; f.context.settlementProtocol.appId = f.config.appId;
  f.context.settlementProtocol.platform = store === 'PLAY_STORE' ? 'android' : 'ios';
  f.context.settlementProtocol.scopeKey = JSON.stringify(['native-store-sandbox-v1','revenuecat',f.config.projectId,f.config.appId,store,'SANDBOX']);
  if (f.context.claim) {f.context.claim.quote.catalog.store = store; f.context.claim.quote.catalog.appId = f.config.appId;}
  f.journal.registry.store = store; f.journal.registry.app_id = f.config.appId;
  const config = {connectionId:f.config.connectionId,connectionRevision:1,projectId:f.config.projectId,appId:f.config.appId,
    store,environment:'SANDBOX',authentication:f.config.authentication,
    encryption:{keyId:f.config.encryption.keyId,keyBase64:Buffer.from(f.config.encryption.key).toString('base64')}};
  const other = structuredClone(config);other.connectionId=id(90);other.appId='other-app';other.store=store==='APP_STORE'?'PLAY_STORE':'APP_STORE';
  Object.assign(env, {SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-only',
    REVENUECAT_WEBHOOK_SECRET:f.config.authentication.secret,NATIVE_STORE_SHARED_ROUTING_ENABLED:enabled?'true':'false',
    NATIVE_STORE_INGRESS_ENABLED:'true',NATIVE_STORE_RECONCILE_ENABLED:'true',
    NATIVE_STORE_CONNECTIONS_JSON:JSON.stringify({connections:[other,config]}),
    NATIVE_STORE_SHARED_ROUTES_JSON:JSON.stringify({routes:[other,config].map(c=>({connectionId:c.connectionId,connectionRevision:1,
      nativeProducts:['synthetic-product'],legacyProducts:['legacy-product']}))})});
  client.from = table => {
    const q = {select:()=>q,eq:()=>q,is:()=>q,limit:()=>q,maybeSingle:async()=>({data:null}),
      insert:async()=>({data:null}),then:resolve=>resolve({data:[]})};
    return q;
  };
  const excluded = {status:'ignored',reason:'product_mapping_missing',providerEventId:id(70),productKey:null,purchaseIntentId:null,
    accessGrantId:null,ledgerEventId:null,environment:'sandbox',payableState:'not_payable',grantStatus:'blocked',
    duplicateProviderEvent:false,duplicateAccessGrant:false,duplicateLedgerEvent:false};
  client.rpc = async (name, args) => {
    const call={name,args};calls.push(call);
    beforeRpc(name);
    if(legacyDatabase && !name.startsWith('native_store_')) {
      const overloads=(await legacyDatabase.query(`select p.proargnames names,
        array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t) types
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`,[name])).rows;
      const fn=overloads.find(f=>f.names.length===Object.keys(args).length&&f.names.every(k=>Object.hasOwn(args,k)));
      assert.ok(fn,`exact RPC overload ${name}`);
      const values=fn.names.map(k=>args[k]),params=fn.types.map((t,i)=>`$${i+1}::${t}`);
      try {const data=(await legacyDatabase.query(`select public.${name}(${params.join(',')}) result`,values)).rows[0].result;call.result=data;return {data};}
      catch(error){call.error=error.message;return {error:{message:error.message}};}
    }
    if (name==='reserve_revenuecat_webhook_ingress_event') return {data:{status:'reserved',providerEventId:args.p_provider_event_id,duplicateEvent:false,authorityGranted:false}};
    if (name==='process_revenuecat_app_store_event_atomic'||name==='process_revenuecat_google_play_event_atomic')
      return mode==='legacy-loss'?{error:{message:'PRIVATE_LEGACY_FAILURE'}}:{data:{...excluded,...legacyPatch}};
    if (name==='process_revenuecat_terminal_event_atomic') return {data:{status:'ignored',reason:'terminal_dispatch_binding_missing',
      domain:'missing',providerEventId:id(70),originalTransactionId:f.event.original_transaction_id,duplicateEvent:false,authorityGranted:false,...legacyPatch}};
    if(name==='revenuecat_native_legacy_exclusion_v1')return {data:{protocol:'revenuecat-native-legacy-exclusion-v1',
      providerEventId:args.p_provider_event_id,rawSha256:args.p_raw_sha256,status:mode==='exclusion-held'?'held':'excluded',
      financialAuthority:false,obligationResolved:false}};
    if (name==='native_store_sandbox_journal_v1') {
      if(mode==='journal-loss') return {error:{message:'PRIVATE_JOURNAL_FAILURE'}};
      const intake=args.p_intake; f.journal.receipt.envelope=intake.envelope;f.journal.receipt.raw_sha256=intake.envelope.rawSha256;
      f.journal.receipt.raw_byte_length=intake.envelope.rawByteLength;f.context.raw.rawSha256=intake.envelope.rawSha256;
      f.context.raw.rawByteLength=intake.envelope.rawByteLength;f.context.raw.observation=intake.envelope.observation;
      return {data:{protocol:'native-store-sandbox-journal-result-v1',receiptId:f.work.rawReceiptId,connectionId:intake.connectionId,
        connectionRevision:intake.connectionRevision,projectId:intake.projectId,rawSha256:intake.envelope.rawSha256,
        status:mode==='conflict'?'conflict':mode==='duplicate'?'duplicate':'recorded',durable:true,correlation:'unsupported',
        acknowledgementAllowed:false,dispatchAllowed:false,grantsAccess:false,financialAuthority:false}};
    }
    if (name==='native_store_sandbox_effect_candidate_v1') return {data:{protocol:'native-store-effect-candidate-v1',rawReceiptId:f.work.rawReceiptId,
      status:mode==='unqualified'?'held':'candidate',work:mode==='unqualified'?null:f.work,acknowledgementAllowed:false}};
    if (name==='native_store_sandbox_effect_context_v1') return {data:f.context};
    if (name==='native_store_sandbox_journal_read_v1') return {data:f.journal};
    if (name==='native_store_sandbox_effect_v1') return mode==='effect-loss'?{error:{message:'PRIVATE_EFFECT_FAILURE'}}:
      {data:{...f.result,...(mode==='duplicate'?{status:'already_processed'}:{}),...(mode==='forged-effect'?{grantsAccess:true}:{})}};
    if(name==='quarantine_revenuecat_terminal_authority') return {data:{status:'quarantined',quarantineId:id(80),duplicateEvent:false,authorityGranted:false,scope:'project'}};
    throw Error(`Unexpected RPC ${name}`);
  };
  l.load('revenuecat-webhook/index.ts');
  return {calls,env,f,l,send:async(patch={},options={})=>{
    const raw=options.raw??JSON.stringify({api_version:'1.0',event:{...f.event,...patch}});
    const response=await l.handler(new Request('https://synthetic.invalid/revenuecat-webhook',{method:'POST',
      headers:options.headers??{authorization:options.authorization??f.config.authentication.secret},body:raw}));
    return {status:response.status,body:await response.json(),raw};
  }};
}

for(const store of ['APP_STORE','PLAY_STORE']) for(const negative of [false,true])
test(`actual shared ${store} ${negative?'refund':'purchase'} requires both durable consumers and exact original bytes`,async()=>{
  const h=await harness({store,negative}),r=await h.send();assert.equal(r.status,200,JSON.stringify(r));
  assert.equal(r.body.acknowledgementAllowed,true);assert.equal(r.body.financialAuthority,false);
  const journal=h.calls.find(c=>c.name==='native_store_sandbox_journal_v1').args.p_intake;
  assert.equal(journal.connectionId,h.f.config.connectionId);assert.equal(journal.envelope.observation.store,store);
  const decrypted=await h.l.load('_shared/revenuecat-lossless-envelope.ts').decryptLosslessRouterEnvelope(journal.envelope,h.f.config);
  assert.equal(new TextDecoder().decode(decrypted),r.raw);
  const effect=h.calls.find(c=>c.name==='native_store_sandbox_effect_v1');assert.ok(effect);assert.equal(effect.args.p_projection.kind,negative?'refund':'purchase');
  assert.equal(h.calls.filter(c=>c.name==='native_store_sandbox_effect_v1').length,1);
  assert.ok(h.calls.findIndex(c=>c.name.startsWith('process_revenuecat_'))<h.calls.indexOf(effect));
  assert.equal(JSON.stringify(r.body).includes('synthetic-tx'),false);
});

for(const mode of ['journal-loss','legacy-loss','conflict','unqualified','effect-loss','forged-effect','exclusion-held'])
test(`actual shared ${mode} cannot acknowledge and never retries`,async()=>{
  const h=await harness({mode}),r=await h.send();assert.equal(r.status,503);assert.equal(r.body.acknowledgementAllowed,false);
  assert.equal(JSON.stringify(r.body).includes('PRIVATE_'),false);
  assert.equal(h.calls.filter(c=>c.name==='native_store_sandbox_journal_v1').length,1);
  assert.ok(h.calls.some(c=>c.name==='process_revenuecat_app_store_event_atomic'),'legacy path survives native failure');
  assert.equal(h.calls.filter(c=>c.name==='native_store_sandbox_effect_v1').length,['effect-loss','forged-effect'].includes(mode)?1:0);
});
test('durable duplicate delivers one idempotent worker call and can acknowledge',async()=>{
  const h=await harness({mode:'duplicate'}),r=await h.send();assert.equal(r.status,200);
  assert.equal(h.calls.filter(c=>c.name==='native_store_sandbox_effect_v1').length,1);
});

test('legacy matched, ambiguous, malformed, wrong-environment and generic ignored outcomes are not exclusion proof',async()=>{
  for(const legacyPatch of [{status:'processed'},{status:'unexpected'}, {reason:'purchase_intent_missing_or_expired'},
    {reason:'product_catalog_binding_ambiguous'},{productKey:'legacy'},{purchaseIntentId:id(50)},{accessGrantId:id(51)},
    {ledgerEventId:id(52)},{providerEventId:null},{environment:'production'},{duplicateLedgerEvent:true},{grantStatus:'active'}]) {
    const h=await harness({legacyPatch}),r=await h.send();assert.equal(r.status,503,JSON.stringify(legacyPatch));
    assert.equal(h.calls.some(c=>c.name==='native_store_sandbox_effect_candidate_v1'),false);
  }
  for(const legacyPatch of [{domain:'ambiguous'}, {reason:'terminal_dispatch_subject_or_environment_mismatch'}, {authorityGranted:true}, {originalTransactionId:'other'}]) {
    const h=await harness({negative:true,legacyPatch});assert.equal((await h.send()).status,503);
    assert.equal(h.calls.some(c=>c.name==='native_store_sandbox_effect_candidate_v1'),false);
  }
});

test('known legacy product bypasses native journal/fence; disabled composition leaves legacy response intact',async()=>{
  for(const enabled of [true,false]) {const h=await harness({enabled}),r=await h.send(enabled?{product_id:'legacy-product'}:{});
    assert.equal(r.status,200);assert.equal(r.body.capability,'digital_access_sandbox');
    assert.equal(h.calls.some(c=>c.name.startsWith('native_store_')),false);
  }
});
test('invalid auth never invokes either consumer or trusts a payload project',async()=>{
  const h=await harness();assert.equal((await h.send({project_id:'attacker'},{authorization:'wrong'})).status,401);assert.equal(h.calls.length,0);
});
test('existing Bearer, bare and explicit header authentication remains compatible',async()=>{
  for(const kind of ['bearer','bare','explicit']) {
    const h=await harness(),secret=h.f.config.authentication.secret;
    const headers=kind==='explicit'?{'x-chillywood-webhook-secret':secret}:{authorization:kind==='bearer'?`Bearer ${secret}`:secret};
    assert.equal((await h.send({}, {headers})).status,200,kind);
  }
  const h=await harness();h.env.REVENUECAT_WEBHOOK_SECRET='different-existing-legacy-secret-'.repeat(2);
  const r=await h.send({}, {authorization:h.env.REVENUECAT_WEBHOOK_SECRET});assert.equal(r.status,503);
  assert.ok(h.calls.some(c=>c.name==='process_revenuecat_app_store_event_atomic'));
  assert.equal(h.calls.some(c=>c.name.startsWith('native_store_')),false);
});
test('production transfer, unknown app and malformed identities stay entirely on the legacy path',async()=>{
  for(const patch of [{},{app_id:'unknown-app'},{type:'TRANSFER',transferred_from:[id(1)],transferred_to:[id(2)]},
    {appUserId:id(1)},{transferred_from:[id(1)]}]) {
    const h=await harness({negative:true}),r=await h.send({...patch,environment:'PRODUCTION'});
    assert.equal(r.status,200,JSON.stringify(patch));assert.equal(h.calls.some(c=>c.name.startsWith('native_store_')),false);
  }
});
test('unknown, mixed, transfer and malformed deliveries persist holds without native effects',async()=>{
  const patches=[{product_id:'unknown-product'}, {app_id:'unknown-app'}, {environment:'sandbox'}, {type:'FUTURE_EVENT'},
    {entitlement_ids:['premium']},{entitlement_id:'premium'},{entitlements:{premium:true}},
    {product_identifier:'legacy-product'}, {type:'TRANSFER',transferred_from:[id(1)],transferred_to:[id(2)]}];
  for(const patch of patches){const h=await harness(),r=await h.send(patch);assert.equal(r.status,503,JSON.stringify(patch));
    assert.ok(h.calls.some(c=>c.name==='native_store_sandbox_journal_v1'));assert.equal(h.calls.some(c=>c.name==='native_store_sandbox_effect_candidate_v1'),false);}
  for(const raw of ['{bad','{"api_version":"1.0","event":{"id":"a","id":"b"}}']) {
    const h=await harness(),r=await h.send({}, {raw});assert.equal(r.status,503);assert.ok(h.calls.some(c=>c.name==='native_store_sandbox_journal_v1'));
  }
});
test('missing runtime setup cannot acknowledge but does not suppress legacy processing',async()=>{
  for(const key of ['NATIVE_STORE_SHARED_ROUTES_JSON','NATIVE_STORE_CONNECTIONS_JSON','NATIVE_STORE_RECONCILE_ENABLED']){
    const h=await harness();delete h.env[key];assert.equal((await h.send()).status,503);
    assert.ok(h.calls.some(c=>c.name==='process_revenuecat_app_store_event_atomic'));assert.equal(h.calls.some(c=>c.name.startsWith('native_store_')),false);
  }
});
test('manifest rejects cross-project/auth ambiguity, product overlaps, retired-revision guessing and Premium diversion',async()=>{
  const h=await harness(),parse=h.l.load('_shared/revenuecat-shared-routing-v1.ts').parseRevenueCatSharedRoutesV1;
  const configs=h.l.load('_shared/native-store-runtime-config-v1.ts').parseNativeStoreRuntimeConnectionsV1(h.env.NATIVE_STORE_CONNECTIONS_JSON);
  const original=JSON.parse(h.env.NATIVE_STORE_SHARED_ROUTES_JSON);
  for(const mutate of [r=>r.routes.push(r.routes[0]),r=>{r.routes[1].nativeProducts=['legacy-product'];},r=>{r.routes[1].nativeProducts=['premium_subscription'];},
    r=>{r.routes[1].connectionRevision=2;},r=>{r.routes[1].nativeProducts=['duplicate','duplicate'];},r=>{r.routes[1].unexpected=true;}]){
    const value=structuredClone(original);mutate(value);assert.throws(()=>parse(JSON.stringify(value),configs));
  }
  for(const mutate of [c=>{c[1].projectId='another-project';},c=>{c[1].authentication.secret='different-not-real-authentication-secret';},
    c=>{c[1].appId=c[0].appId;c[1].store=c[0].store;}]) {
    const value=structuredClone(configs);mutate(value);assert.throws(()=>parse(JSON.stringify(original),value));
  }
});

test('late journal, legacy or effect completion never becomes success or starts a subsequent native write',async()=>{
  for(const phase of ['journal','legacy','effect']) {
    let tick=0;
    const h=await harness({clock:{now:()=>tick},beforeRpc:name=>{
      if(phase==='journal'&&name==='native_store_sandbox_journal_v1')tick+=10001;
      if(phase==='legacy'&&name==='process_revenuecat_app_store_event_atomic')tick+=15001;
      if(phase==='effect'&&name==='native_store_sandbox_effect_v1')tick+=15001;
    }});
    const r=await h.send();assert.equal(r.status,503,phase);assert.equal(r.body.acknowledgementAllowed,false);
    assert.equal(h.calls.filter(c=>c.name==='native_store_sandbox_effect_v1').length,phase==='effect'?1:0);
  }
});
test('late preliminary and native-intake encryption cannot start the journal after their deadlines',async()=>{
  for(const delayedEncryption of [1,2]) {
    let tick=0,encryptions=0;const h=await harness({clock:{now:()=>tick}}),original=crypto.subtle.encrypt;
    crypto.subtle.encrypt=async function(...args){const value=await original.apply(this,args);if(++encryptions===delayedEncryption)tick+=10001;return value;};
    try {
      assert.equal((await h.send()).status,503);assert.equal(encryptions,delayedEncryption);
      assert.equal(h.calls.some(c=>c.name==='native_store_sandbox_journal_v1'),false);
    } finally {crypto.subtle.encrypt=original;}
  }
});

test('actual migrated SQL supplies exclusion receipts and retains ignored-charge obligations across shared ACK and replay',
  {timeout:240000},async()=>{
    const {createDatabase}=await import('../helpers/database-runtime-authority-fixture.mjs');
    const {db}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false});
    try {
      await db.exec(`insert into auth.users(id,is_sso_user,is_anonymous) values('${id(1)}',false,false);
        select set_config('request.jwt.claims','{"role":"service_role"}',false);`);
      await db.exec(fs.readFileSync(new URL('../../isolated-runtime/native-store-shared-routing-v1/exclusion.sql',import.meta.url),'utf8'));
      for(const store of ['APP_STORE','PLAY_STORE']) {
        const h=await harness({store,legacyDatabase:db});
        const patch={id:`sql-${store}-purchase`,original_transaction_id:`sql-${store}-chain`,transaction_id:`sql-${store}-chain`};
        // The native replay fixture is held to the exact callback/transaction,
        // not changed just to make an unmatched receipt look successful.
        h.f.event.original_transaction_id=patch.original_transaction_id;h.f.event.transaction_id=patch.transaction_id;
        h.f.context.claim.claim.transactionIdentifier=patch.transaction_id;
        const first=await h.send(patch);assert.equal(first.status,200,JSON.stringify({first,calls:h.calls.filter(c=>!c.name.startsWith('native_store_'))}));
        const duplicate=await h.send(patch);assert.equal(duplicate.status,200,JSON.stringify(duplicate));
        const rows=(await db.query(`select o.state,o.reason,o.resolved_at,o.resolution_reference_hash,e.status,e.raw_payload_hash,
          e.metadata->>'provider_reconciliation_required' required
          from public.revenuecat_provider_reconciliation_obligations o join public.provider_events e on e.id=o.provider_event_id
          where e.provider_event_id=$1`,[patch.id])).rows;
        assert.equal(rows.length,1);assert.equal(rows[0].state,'pending_reconciliation');assert.equal(rows[0].reason,'provider_source_lock_unresolved');
        assert.equal(rows[0].resolved_at,null);assert.equal(rows[0].resolution_reference_hash,null);assert.equal(rows[0].status,'ignored');
        assert.equal(rows[0].required,'true');
        const changed=await h.send({...patch,price_in_purchased_currency:2.99});assert.equal(changed.status,503);
        assert.equal((await db.query(`select count(*)::int n from public.money_access_ledger_events`)).rows[0].n,0);
        assert.equal((await db.query(`select count(*)::int n from public.access_grants`)).rows[0].n,0);
        const refund=await harness({store,negative:true,legacyDatabase:db});
        refund.f.event.original_transaction_id=`refund-${store}-chain`;refund.f.event.transaction_id=`refund-${store}-chain`;
        const refunded=await refund.send({id:`sql-refund-${store}`});assert.equal(refunded.status,200,JSON.stringify({refunded,calls:refund.calls}));
      }
      for(const role of ['anon','authenticated','service_role']) {
        const allowed=(await db.query(`select has_function_privilege($1,'public.revenuecat_native_legacy_exclusion_v1(uuid,text,text)','execute') ok`,[role])).rows[0].ok;
        assert.equal(allowed,role==='service_role');
      }
      // A source-lock reason can MASK a pre-existing Premium original. The
      // independent SQL proof must find it instead of trusting that reason.
      await db.exec(`insert into public.revenuecat_premium_transaction_authority
        (provider,original_transaction_id,user_id,environment,current_provider_product_id,first_event_id,first_event_hash,
         latest_event_id,latest_event_hash,latest_event_type,latest_occurred_at,latest_event_rank,authority_state)
        values('revenuecat_app_store','premium-collision','${id(1)}','sandbox','premium_subscription','premium-before',repeat('a',64),
         'premium-before',repeat('a',64),'INITIAL_PURCHASE',now(),1,'blocked');`);
      const mixed=await harness({legacyDatabase:db});mixed.f.event.original_transaction_id='premium-collision';mixed.f.event.transaction_id='premium-collision';
      mixed.f.context.claim.claim.transactionIdentifier='premium-collision';
      assert.equal((await mixed.send({id:'premium-collision-purchase'})).status,503);
      assert.equal(mixed.calls.find(c=>c.name==='process_revenuecat_app_store_event_atomic').result.reason,'provider_source_lock_unresolved');
      assert.equal(mixed.calls.find(c=>c.name==='revenuecat_native_legacy_exclusion_v1').result.status,'held');
      assert.equal(mixed.calls.some(c=>c.name==='native_store_sandbox_effect_candidate_v1'),false);

      // Historical/ambiguous catalog inventory is independent of the masked
      // source-lock failure and must never be declared native-only.
      const seed=(await db.query(`select to_jsonb(p) data from public.monetization_products p where provider='revenuecat_google_play' limit 1`)).rows[0].data;
      for(let i=1;i<=2;i++) {
        const product={...seed,id:id(100+i),product_key:`shared-routing-ambiguous-${i}`,provider_product_id:'synthetic-product',provider_base_plan_id:null,
          environment:'sandbox'};
        await db.query(`insert into public.monetization_products select (jsonb_populate_record(null::public.monetization_products,$1::jsonb)).*`,[JSON.stringify(product)]);
      }
      const ambiguous=await harness({store:'PLAY_STORE',legacyDatabase:db});
      ambiguous.f.event.original_transaction_id='ambiguous-catalog-chain';ambiguous.f.event.transaction_id='ambiguous-catalog-chain';
      ambiguous.f.context.claim.claim.transactionIdentifier='ambiguous-catalog-chain';
      assert.equal((await ambiguous.send({id:'ambiguous-catalog-purchase'})).status,503);
      assert.equal(ambiguous.calls.find(c=>c.name==='process_revenuecat_google_play_event_atomic').result.reason,'provider_source_lock_unresolved');
      assert.equal(ambiguous.calls.find(c=>c.name==='revenuecat_native_legacy_exclusion_v1')?.result?.status,'held',JSON.stringify(ambiguous.calls));
      assert.equal(ambiguous.calls.some(c=>c.name==='native_store_sandbox_effect_candidate_v1'),false);
    } finally {await db.close();}
  });
