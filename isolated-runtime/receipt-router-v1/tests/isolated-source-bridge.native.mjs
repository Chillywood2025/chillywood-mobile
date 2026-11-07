#!/usr/bin/env node
// Actual isolated runtime + router source. All provider payloads are synthetic;
// this proves static source linkage, not real provider qualification or delivery.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID, createHash, webcrypto } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { BUYER, fixtureApi, installSql, sqlJson, sqlText } from '../../sandbox-commerce-v1/tests/receipts.fixture.mjs';
globalThis.crypto ??= webcrypto;
assert.equal(process.argv.length, 4); assert.equal(process.argv[2], '--local-bin');
const bin = process.argv[3]; assert.ok(path.isAbsolute(bin));
const here = path.dirname(fileURLToPath(import.meta.url)), runtime = path.dirname(here), repo = path.resolve(runtime, '../..');
const isolatedTests = path.join(repo, 'isolated-runtime/sandbox-commerce-v1/tests');
const isolated = installSql(isolatedTests);
const finalizer = fs.readFileSync(path.join(isolatedTests, '../permissions-finalize.sql'), 'utf8');
assert.equal(isolated.sql.split(finalizer).length, 2); assert.ok(isolated.sql.endsWith('commit;'));
const routerFiles = ['core.sql','holds.sql','ownership.sql','worker.sql','isolated-source-bridge.sql','permissions-finalize.sql'];
const sourcePaths = [...routerFiles.map(n => path.join(runtime,n)),
  ...Object.keys(isolated.sourceHashes).map(n => path.join(isolatedTests,'..',n)),
  path.join(repo,'supabase/functions/_shared/revenuecat-router-envelope.ts'),fileURLToPath(import.meta.url),
  path.join(isolatedTests,'receipts.fixture.mjs'),path.join(isolatedTests,'authority.fixture.sql'),path.join(isolatedTests,'premium-authority.fixture.sql')];
const sourceHashes = Object.fromEntries(sourcePaths.map(p => [path.relative(repo,p),createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const install = isolated.sql.replace(finalizer,'').slice(0,-'commit;'.length)
  + routerFiles.slice(0,-1).map(n => fs.readFileSync(path.join(runtime,n),'utf8')).join('\n')
  + finalizer + fs.readFileSync(path.join(runtime,'permissions-finalize.sql'),'utf8') + 'commit;';
const require = createRequire(import.meta.url), ts = require('typescript');
const exports = {};
new Function('exports',ts.transpileModule(fs.readFileSync(path.join(repo,'supabase/functions/_shared/revenuecat-router-envelope.ts'),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);
const { authenticateRevenueCatEnvelope } = exports;
const CONN='11111111-1111-4111-8111-111111111111',SCOPE='44444444-4444-4444-8444-444444444444';
const OTHER='33333333-3333-4333-8333-333333333333';
const connection={connectionId:CONN,connectionRevision:1,projectId:'fixture-project',
  authentication:{method:'shared_secret',keyVersion:'fixture-auth-v1',secret:'Bearer '+'a'.repeat(40)},
  encryption:{keyId:'fixture-key-v1',key:new Uint8Array(32).fill(7)}};
const work=fs.mkdtempSync(path.join(os.tmpdir(),'router-isolated-bridge-')),data=path.join(work,'data'),port='55454';
const db='bridge_'+randomUUID().replaceAll('-',''),env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')));
const run=(tool,args,input)=>spawnSync(path.join(bin,tool),args,{input,encoding:'utf8',env,timeout:30000,maxBuffer:16*1024*1024});
const invoke=(tool,args,input)=>{const r=run(tool,args,input);assert.equal(r.status,0,`${tool}: ${r.stderr}\n${r.error?.message??''}`);return r.stdout.trim();};
const args=name=>['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','postgres','-d',name];
const q=sql=>invoke('psql',args(db),sql),runQuery=sql=>run('psql',args(db),sql);
const api=fixtureApi(q,runQuery),cases=[],cleanup={clusterStopped:false,clusterNotRunningVerified:false,directoryRemoved:false};
const denied=(sql,pattern)=>{const r=runQuery(sql);assert.notEqual(r.status,0);assert.match(r.stderr,pattern);};
const routerReset=()=>{const tables=q("select string_agg(format('%I.%I',schemaname,tablename),',') from pg_tables where schemaname='receipt_router_v1' and tablename not in ('configuration','connections');");
  q(`truncate ${tables};update receipt_router_v1.configuration set ingress_enabled=true,worker_enabled=false,ownership_coverage='complete',catalog_revision=1;`);};
const ingest=e=>JSON.parse(q(api.servicePrefix+`select public.receipt_router_ingest_v1('${CONN}',1,${sqlJson(e)});`));
const seal=async(normalized,patch={},config=connection)=>{const event={id:normalized.providerEventId,type:normalized.providerEventType,app_id:'fixture-app',
  store:'APP_STORE',environment:'SANDBOX',event_timestamp_ms:Date.parse(normalized.providerEventAt),app_user_id:BUYER,
  original_app_user_id:BUYER,aliases:[],product_id:normalized.productId,transaction_id:normalized.providerTransactionId,
  original_transaction_id:normalized.originalTransactionId,...patch};
  const e=await authenticateRevenueCatEnvelope(new Request('https://fixture.invalid/provider',{method:'POST',
    headers:{authorization:config.authentication.secret},body:JSON.stringify({api_version:'1.0',event})}),config);
  normalized.rawBodySha256=e.rawSha256;return e;};
const ready=async()=>{
  routerReset();api.reset();const context=api.prepare(api.seedCatalog('app_store'));api.beginDispatch(context);
  const normalized=api.receipt(context),envelope=await seal(normalized),processed=api.invokeReceipt(normalized);
  assert.equal(processed.status,'processed');assert.ok(processed.receiptId);
  q(`insert into receipt_router_v1.scopes values('${SCOPE}','fixture-project','fixture-app','APP_STORE','SANDBOX','fixture-bundle');
    insert into receipt_router_v1.catalog values('${SCOPE}',${sqlText(normalized.productId)},'isolated_sandbox',1);`);
  return {context,normalized,envelope,sourceReceipt:processed.receiptId,routerReceipt:ingest(envelope).receiptId};
};
const importOriginal=c=>JSON.parse(q(`select receipt_router_v1.import_isolated_receipt('${c.routerReceipt}','${c.sourceReceipt}');`));
const read=(domain='isolated_sandbox',original=null,user=BUYER)=>JSON.parse(q(`select receipt_router_v1.read_hold('fixture-project','fixture-app','APP_STORE','SANDBOX',
  '${user}',${sqlText(domain)},1,${original===null?'null':sqlText(original)});`));
const noOwnership=()=>assert.equal(q('select count(*) from receipt_router_v1.original_admissions;'),'0');
const record=async(name,fn)=>{await fn();assert.equal(q('select count(*) from sandbox_commerce_v1.grants;'),'0');cases.push(name);};
let initializationAttempted=false,initialized=false,startAttempted=false,started=false,report;
try{
  assert.match(invoke('postgres',['--version']),/PostgreSQL\) 17\.6/u);
  initializationAttempted=true;invoke('initdb',['-D',data,'-U','postgres','--encoding=UTF8','--no-locale','--auth=trust']);initialized=true;
  startAttempted=true;invoke('pg_ctl',['-D',data,'-w','-t','15','-l',path.join(work,'server.log'),'-o',
    `-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port} -c max_prepared_transactions=0 -c autovacuum=off`,'start']);started=true;
  invoke('psql',args('postgres'),`create database ${db};`);q(install);
  assert.equal(q('select ingress_enabled or worker_enabled from receipt_router_v1.configuration;'),'f');
  q(`insert into receipt_router_v1.connections values('${CONN}',1,'fixture-project','shared_secret','fixture-auth-v1','fixture-key-v1',true);`);
  await record('Private typed bridge is inaccessible to public/service even with spoofed claims',async()=>{
    const c=await ready();for(const role of ['anon','authenticated','service_role'])denied(`set role ${role};set request.jwt.claims='{"role":"service_role"}';
      select receipt_router_v1.import_isolated_receipt('${c.routerReceipt}','${c.sourceReceipt}');`,/permission denied/u);noOwnership();
  });
  await record('Actual dispatched and processed isolated receipt imports immutable ownership only',async()=>{
    const c=await ready(),result=importOriginal(c);assert.equal(result.status,'original_admitted');assert.equal(result.authorityGranted,false);
    assert.equal(importOriginal(c).status,'already_admitted');
    assert.equal(q("select admission_kind from receipt_router_v1.original_admissions;"),'isolated_verified_receipt_v1');
    denied('delete from receipt_router_v1.original_admissions;',/evidence_immutable/u);
    denied(`update receipt_router_v1.originals set original_buyer_id='${OTHER}';`,/evidence_immutable/u);
  });
  await record('Historical ownership survives session loss, Premium expiry, disabled initiation and retired generation',async()=>{
    const c=await ready();q("delete from auth.sessions;update sandbox_commerce_v1.lifecycle set state='retired';update sandbox_commerce_v1.provider_routes set initiation_enabled=false;");
    assert.equal(importOriginal(c).status,'original_admitted');
  });
  await record('Wrong receipt/source hash and unprocessed evidence cannot establish ownership',async()=>{
    const c=await ready();q("update sandbox_commerce_v1.receipt_events set payload=jsonb_set(payload,'{rawBodySha256}',to_jsonb(repeat('b',64)));");
    denied(`select receipt_router_v1.import_isolated_receipt('${c.routerReceipt}','${c.sourceReceipt}');`,/source_mismatch/u);noOwnership();
  });
  await record('Missing admitted dispatch and quarantined source original are rejected',async()=>{
    let c=await ready();q('delete from sandbox_commerce_v1.dispatch_attempts;');
    denied(`select receipt_router_v1.import_isolated_receipt('${c.routerReceipt}','${c.sourceReceipt}');`,/query returned no rows/u);noOwnership();
    c=await ready();q("update sandbox_commerce_v1.original_states set state='quarantined';");
    denied(`select receipt_router_v1.import_isolated_receipt('${c.routerReceipt}','${c.sourceReceipt}');`,/source_mismatch/u);noOwnership();
  });
  await record('Unqualified provider route cannot be promoted by evidence-shaped catalog or receipt rows',async()=>{
    const c=await ready();q("update sandbox_commerce_v1.provider_routes set qualification_state='unavailable',initiation_enabled=false,ownership_evidence_sha256=null,delivery_evidence_sha256=null,adapter_evidence_sha256=null;");
    denied(`select receipt_router_v1.import_isolated_receipt('${c.routerReceipt}','${c.sourceReceipt}');`,/source_mismatch/u);noOwnership();
  });
  await record('Productless refund linked to actual admitted source affects only isolated exact original',async()=>{
    const c=await ready();const refund={...c.normalized,providerEventId:'refund_'+randomUUID(),providerEventType:'REFUND',eventType:'refund',
      productId:null,providerTransactionId:null,purchasedAt:null,amountMinor:null,currency:null,intentId:null,dispatchId:null,
      providerEventAt:new Date(Date.now()+100).toISOString()};
    const encrypted=await seal(refund);assert.equal(api.invokeReceipt(refund).status,'processed');
    const terminal={...c,routerReceipt:ingest(encrypted).receiptId};assert.equal(read('legacy_premium').state,'held');
    assert.equal(importOriginal(terminal).status,'original_admitted');
    assert.equal(read('legacy_premium').state,'clear');assert.equal(read('legacy_creator').state,'clear');
    assert.equal(read('isolated_sandbox',c.normalized.originalTransactionId).state,'held');
    assert.equal(read('isolated_sandbox','unrelated-original').state,'clear');
    assert.equal(read('isolated_sandbox').reason,'exact_original_pending');
  });
  await record('Productless transfer holds both identities across domains despite known isolated ownership',async()=>{
    const c=await ready();importOriginal(c);
    const e=await seal({...c.normalized,providerEventId:'transfer_'+randomUUID(),providerEventType:'TRANSFER'},
      {app_user_id:null,original_app_user_id:null,product_id:null,transaction_id:null,original_transaction_id:null,transferred_from:[BUYER],transferred_to:[OTHER]});
    ingest(e);for(const user of [BUYER,OTHER])for(const domain of ['legacy_premium','legacy_creator','isolated_sandbox']){
      const state=read(domain,null,user);assert.equal(state.state,'held');assert.equal(state.reason,'subject_scope_unresolved');}
    assert.equal(read('legacy_premium',null,randomUUID()).state,'clear');
  });
  await record('Conflicting raw event identity cannot be admitted using an otherwise valid source graph',async()=>{
    const c=await ready();ingest(await seal({...c.normalized},{app_user_id:OTHER}));
    denied(`select receipt_router_v1.import_isolated_receipt('${c.routerReceipt}','${c.sourceReceipt}');`,/candidate_unavailable/u);noOwnership();
  });
  for(const subject of [OTHER,null])await record(`Negative before original import backfills true owner while retaining ${subject?'reported other':'missing'} subject evidence`,async()=>{
    const c=await ready();const negative=await seal({...c.normalized,providerEventId:'early_'+randomUUID(),providerEventType:'REFUND'},
      {app_user_id:subject,original_app_user_id:subject,product_id:null});
    const parent=ingest(negative).receiptId;assert.equal(importOriginal(c).status,'original_admitted');
    assert.equal(read('isolated_sandbox',c.normalized.originalTransactionId).state,'held');
    assert.equal(q(`select count(*) from receipt_router_v1.pending_holds where evidence_receipt_id='${parent}' and subject_id='${BUYER}';`),'1');
    if(subject)assert.equal(q(`select count(*) from receipt_router_v1.pending_holds where evidence_receipt_id='${parent}' and subject_id='${subject}';`),'1');
    assert.equal(q(`select count(distinct raw_sha256) from receipt_router_v1.receipts where id='${parent}';`),'1');
  });
  await record('Known economic original negative crosses registered RC project/app aliases without widening domains',async()=>{
    const c=await ready();importOriginal(c);const foreignScope=randomUUID(),foreignConnection=randomUUID();
    q(`insert into receipt_router_v1.connections values('${foreignConnection}',1,'fixture-project-b','shared_secret','fixture-auth-v1','fixture-key-v1',true);
      insert into receipt_router_v1.scopes values('${foreignScope}','fixture-project-b','fixture-app-b','APP_STORE','SANDBOX','fixture-bundle');
      insert into receipt_router_v1.catalog values('${foreignScope}',${sqlText(c.normalized.productId)},'isolated_sandbox',1);`);
    const config={...connection,connectionId:foreignConnection,projectId:'fixture-project-b'};
    const negative=await seal({...c.normalized,providerEventId:'cross_scope_'+randomUUID(),providerEventType:'REFUND'},
      {app_id:'fixture-app-b',app_user_id:OTHER,original_app_user_id:OTHER,product_id:null},config);
    q(api.servicePrefix+`select public.receipt_router_ingest_v1('${foreignConnection}',1,${sqlJson(negative)});`);
    assert.equal(read('isolated_sandbox',c.normalized.originalTransactionId).state,'held');
    assert.equal(read('legacy_premium').state,'clear');assert.equal(read('isolated_sandbox','unrelated-original').state,'clear');
  });
  await record('Malformed known-original alias evidence bridges only proven store scope while leaving all domains unresolved',async()=>{
    const c=await ready();importOriginal(c);const foreignScope=randomUUID(),foreignConnection=randomUUID();
    q(`insert into receipt_router_v1.connections values('${foreignConnection}',1,'fixture-project-b','shared_secret','fixture-auth-v1','fixture-key-v1',true);
      insert into receipt_router_v1.scopes values('${foreignScope}','fixture-project-b','fixture-app-b','APP_STORE','SANDBOX','fixture-bundle');
      insert into receipt_router_v1.catalog values('${foreignScope}',${sqlText(c.normalized.productId)},'isolated_sandbox',1);`);
    const e=await seal({...c.normalized,providerEventId:'ambiguous_scope_'+randomUUID(),providerEventType:'REFUND'},
      {app_id:'fixture-app-b',appUserId:OTHER},{...connection,connectionId:foreignConnection,projectId:'fixture-project-b'});
    q(api.servicePrefix+`select public.receipt_router_ingest_v1('${foreignConnection}',1,${sqlJson(e)});`);
    for(const domain of ['legacy_premium','legacy_creator','isolated_sandbox']){
      const state=read(domain);assert.equal(state.state,'held');assert.equal(state.reason,'subject_scope_unresolved');}
  });
  for(const scenario of ['malformed_identity','unknown_event','conflicting_event'])await record(`Known original does not narrow ${scenario} into a domain-specific clear`,async()=>{
    const c=await ready();importOriginal(c);
    const normalized={...c.normalized,providerEventId:scenario==='conflicting_event'?c.normalized.providerEventId:'ambiguous_'+randomUUID(),
      providerEventType:scenario==='unknown_event'?'UNSUPPORTED_EVENT':'REFUND'};
    const e=await seal(normalized,scenario==='malformed_identity'?{appUserId:OTHER}:{});ingest(e);
    const result=read('legacy_premium');assert.equal(result.state,'held');assert.equal(result.reason,'subject_scope_unresolved');
    if(scenario==='malformed_identity')assert.equal(read('legacy_premium',null,OTHER).state,'held');
  });
  report={kind:'actual-local-source-bridge-proof',postgres:'17.6',cases:cases.length,passed:cases,sourceHashes,
    syntheticProviderEvidence:true,providerOrProductionCalls:false,legacyEnforcementProven:false,actualProviderQualificationProven:false,cleanup};
}finally{
  if(startAttempted){const status=run('pg_ctl',['-D',data,'status']);
    if(status.status===0){invoke('pg_ctl',['-D',data,'-m','immediate','-w','-t','15','stop']);cleanup.clusterStopped=true;}
    else if(status.status!==3||!started)throw new Error('Uncertain cluster status; preserved '+work);
    assert.equal(run('pg_ctl',['-D',data,'status']).status,3);cleanup.clusterNotRunningVerified=true;
  }else if(initializationAttempted&&!initialized)throw new Error('Uncertain init; preserved '+work);
  fs.rmSync(work,{recursive:true,force:true});cleanup.directoryRemoved=true;
}
assert.ok(report&&Object.values(cleanup).every(Boolean));console.log(JSON.stringify(report,null,2));
