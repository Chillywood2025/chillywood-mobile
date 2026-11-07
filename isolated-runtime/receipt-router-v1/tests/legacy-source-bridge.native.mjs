#!/usr/bin/env node
// Offline PostgreSQL 17.6 proof using synthetic raw webhook bytes and minimal
// source projections. No legacy handler, production role or provider is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash,randomUUID,webcrypto} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {spawn,spawnSync} from 'node:child_process';
import {BUYER,OTHER,CONN,lit,json,legacySchema,clearLegacy,source,sourceEvent,sourceRows} from './legacy-source-bridge.fixture.mjs';
globalThis.crypto??=webcrypto;
assert.equal(process.argv.length,4);assert.equal(process.argv[2],'--local-bin');
const bin=process.argv[3];assert.ok(path.isAbsolute(bin));
const here=path.dirname(fileURLToPath(import.meta.url)),runtime=path.dirname(here),repo=path.resolve(runtime,'../..');
const sourceFiles=['core.sql','holds.sql','ownership.sql','worker.sql','legacy-source-bridge.sql','permissions-finalize.sql'];
const paths=[...sourceFiles.map(n=>path.join(runtime,n)),fileURLToPath(import.meta.url),path.join(here,'legacy-source-bridge.fixture.mjs'),
 path.join(repo,'supabase/functions/_shared/revenuecat-router-envelope.ts')];
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const sourceHashes=Object.fromEntries(paths.map(p=>[path.relative(repo,p),hash(p)]));
const require=createRequire(import.meta.url),ts=require('typescript');
const loaded={};new Function('exports',ts.transpileModule(fs.readFileSync(paths.at(-1),'utf8'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(loaded);
const config={connectionId:CONN,connectionRevision:1,projectId:'fixture-project',
 authentication:{method:'shared_secret',keyVersion:'fixture-auth-v1',secret:'Bearer '+'a'.repeat(40)},
 encryption:{keyId:'fixture-encryption-v1',key:new Uint8Array(32).fill(7)}};
const envelope=(event,connection=config)=>loaded.authenticateRevenueCatEnvelope(new Request('https://fixture.invalid/receipt',
 {method:'POST',headers:{authorization:connection.authentication.secret},body:JSON.stringify({api_version:'1.0',event})}),connection);
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'receipt-legacy-bridge-')),data=path.join(directory,'data'),port='55458';
// A short, private socket namespace avoids both TCP port collisions and Unix
// socket path-length limits on macOS/Linux. No shared listener is created.
const socketDirectory=fs.mkdtempSync(path.join(fs.realpathSync('/tmp'),'rclb-'));
fs.chmodSync(socketDirectory,0o700);
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')));
const args=db=>['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',socketDirectory,'-p',port,'-U','postgres','-d',db];
const redact=value=>String(value??'')
 .replace(/\b(?:https?|postgres(?:ql)?):\/\/[^\s"'<>]+/giu,'[redacted URL]')
 .replace(/\b(Bearer|Basic)\s+[^\s"',;]+/giu,'$1 [redacted]')
 .replace(/\b(authorization|password|passfile|access[_-]?token|refresh[_-]?token|secret|api[_-]?key)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu,'$1=[redacted]')
 .replace(/^.*\b(?:STATEMENT|QUERY|CONTEXT):[^\n]*(?:\n(?!\d{4}-\d{2}-\d{2}[ T]|\s*(?:LOG|FATAL|ERROR|HINT|WARNING|DETAIL):)[^\n]*)*/gmu,'[redacted SQL context]');
const boundedText=value=>redact(value).slice(-8192);
const bootstrapCommands=[];
const run=(tool,a,input)=>{
 const result=spawnSync(path.join(bin,tool),a,{env,input,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
 if(['postgres','initdb','pg_ctl'].includes(tool)&&bootstrapCommands.length<12)bootstrapCommands.push({tool,
  operation:a.includes('start')?'start':a.includes('stop')?'stop':a.includes('status')?'status':tool==='initdb'?'initdb':'version',
  status:result.status,signal:result.signal,error:result.error?boundedText(result.error.message):null,
  stdout:boundedText(result.stdout),stderr:boundedText(result.stderr)});
 return result;
};
const invoke=(tool,a,input)=>{const r=run(tool,a,input);assert.equal(r.status,0,`${tool}: ${tool==='psql'?r.stderr:boundedText(r.stderr)}\n${r.error?.message??''}`);return r.stdout.trim();};
const startupLog=()=>{
 const file=path.join(directory,'server.log');let fd;
 try{
  fd=fs.openSync(file,'r');const size=fs.fstatSync(fd).size,bytes=Buffer.alloc(Math.min(size,32768));
  fs.readSync(fd,bytes,0,bytes.length,Math.max(0,size-bytes.length));
  const redacted=redact(bytes.toString('utf8'));
  return {path:file,available:true,truncated:size>bytes.length||redacted.length>8192,text:redacted.slice(-8192)};
 }catch(error){return {path:file,available:false,error:boundedText(error.code??error.name)};}
 finally{if(fd!==undefined){try{fs.closeSync(fd);}catch{/* Diagnostic collection cannot replace the primary error. */}}}
};
const q=sql=>invoke('psql',args('legacy_fixture'),sql);
const bad=(sql,pattern)=>{const r=run('psql',args('legacy_fixture'),sql);assert.notEqual(r.status,0);assert.match(r.stderr,pattern);return r;};
const service=`set role service_role;set request.jwt.claims='{"role":"service_role"}';`;
const bounded=expression=>`begin;select receipt_router_v1.arm_source_import_context();select ${expression};commit;`;
const ingest=(e,connectionId=CONN)=>JSON.parse(q(service+`select public.receipt_router_ingest_v1('${connectionId}',1,${json(e)});`));
const importExpression=v=>`receipt_router_legacy_v1.import_authenticated_replay('${v.receipt}','${v.id}')`;
const importSource=v=>JSON.parse(q(bounded(importExpression(v))));
const veto=(v,overrides={})=>{const x={...v,...overrides};return JSON.parse(q(bounded(`receipt_router_legacy_v1.original_veto(${lit(x.domain)},${lit(x.provider)},${lit(x.environment)},${lit(x.subject)},${lit(x.original)})`)));};
const reset=()=>q(`truncate receipt_router_legacy_v1.source_bindings,receipt_router_v1.deliveries,receipt_router_v1.pending_holds,
 receipt_router_v1.plans,receipt_router_v1.jobs,receipt_router_v1.conflicts,receipt_router_v1.subjects,receipt_router_v1.original_admissions,
 receipt_router_v1.originals,receipt_router_v1.events,receipt_router_v1.receipts,receipt_router_v1.catalog,receipt_router_v1.scopes;
 ${clearLegacy}update receipt_router_v1.configuration set ingress_enabled=true,worker_enabled=false,ownership_coverage='complete';`);
async function seed(options={}){
 const v=source(options),e=await envelope(sourceEvent(v));assert.equal(e.observation.parseStatus,'valid');
 v.receipt=ingest(e).receiptId;v.rawHash=e.rawSha256;q(sourceRows(v,e.rawSha256));
 const existing=q(`select id from receipt_router_v1.scopes where app_id='fixture-app' and store=${lit(v.store)} and environment=${lit(v.environment.toUpperCase())};`);
 if(existing)v.scope=existing;
 else q(`insert into receipt_router_v1.scopes values('${v.scope}','fixture-project','fixture-app',${lit(v.store)},${lit(v.environment.toUpperCase())},'fixture-bundle');`);
 q(`insert into receipt_router_v1.catalog values('${v.scope}',${lit(v.sku)},${lit(v.domain)},1) on conflict do nothing;`);
 return v;
}
const cases=[],sessions=new Set(),cleanup={sessionsClosed:false,clusterStopped:false,clusterNotRunningVerified:false,directoryRemoved:false};
const record=async(name,fn)=>{reset();await fn();cases.push(name);};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function held(sql){
 const child=spawn(path.join(bin,'psql'),args('legacy_fixture'),{env,stdio:['pipe','pipe','pipe']});sessions.add(child);
 let output='',error='';child.stdout.on('data',x=>{output+=x;});child.stderr.on('data',x=>{error+=x;});child.stdin.on('error',()=>{});
 const done=new Promise(resolve=>child.once('exit',code=>{sessions.delete(child);resolve({code,error});}));
 child.stdin.write(sql+"\nselect 'legacy_fixture_ready';\n");
 const deadline=Date.now()+2000;while(!output.includes('legacy_fixture_ready')&&child.exitCode===null&&Date.now()<deadline)await pause(10);
 assert.ok(output.includes('legacy_fixture_ready'),error||'session readiness deadline');
 return {child,done,finish:async ending=>{child.stdin.end(ending+';\n');const r=await done;assert.equal(r.code,0,r.error);}};
}
let initAttempted=false,initialized=false,startAttempted=false,started=false,report;
let phase='version',primaryFailure,cleanupFailure,failureLog;
const began=Date.now();
try{
 const version=invoke('postgres',['--version']);assert.match(version,/PostgreSQL\) 17\.6/u);
 phase='initdb';initAttempted=true;invoke('initdb',['-D',data,'-U','postgres','--encoding=UTF8','--no-locale','--auth=trust']);initialized=true;
 phase='pg_ctl_start';startAttempted=true;invoke('pg_ctl',['-D',data,'-w','-t','15','-l',path.join(directory,'server.log'),'-o',
  `-c listen_addresses='' -c unix_socket_directories='${socketDirectory}' -p ${port} -c autovacuum=off`,'start']);started=true;phase='test_execution';
 invoke('psql',args('postgres'),'create database legacy_fixture;');
 assert.equal(q("select current_setting('listen_addresses')"),'');
 assert.equal(q("select current_setting('unix_socket_directories')"),socketDirectory);
 assert.equal(q('select inet_server_addr() is null'),'t');
 assert.equal(fs.statSync(socketDirectory).mode&0o777,0o700);
 q(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
  create role fixture_default_exec nologin;alter default privileges for role postgres grant execute on functions to fixture_default_exec;
  ${legacySchema}
  begin;${sourceFiles.map(n=>fs.readFileSync(path.join(runtime,n),'utf8')).join('\n')}commit;`);
 assert.equal(q('select ingress_enabled,worker_enabled from receipt_router_v1.configuration;'),'f|f');
 assert.equal(q('select count(*) from receipt_router_v1.connections;'),'0');
 q(`insert into receipt_router_v1.connections values('${CONN}',1,'fixture-project','shared_secret','fixture-auth-v1','fixture-encryption-v1',true);`);
 await record('Combined six-file bridge install remains inactive; immutable source mapping has FORCE RLS and no ordinary runtime access',async()=>{
  assert.equal(q("select relrowsecurity and relforcerowsecurity from pg_class where oid='receipt_router_legacy_v1.source_bindings'::regclass;"),'t');
  for(const role of ['anon','authenticated','service_role']){
   assert.equal(q(`select count(*) from pg_proc where pronamespace='receipt_router_legacy_v1'::regnamespace and has_function_privilege('${role}',oid,'EXECUTE');`),'0');
   bad(`set role ${role};select * from receipt_router_legacy_v1.source_bindings;`,/permission denied/u);
  }
 });
 await record('Fresh-role reader creation prevents hostile installer default EXECUTE from surviving postgres ownership transfer',async()=>{
  q('create function public.fixture_default_control() returns integer language sql as $$select 1$$;');
  assert.equal(q("select has_function_privilege('fixture_default_exec','public.fixture_default_control()','EXECUTE');"),'t');
  assert.equal(q("select pg_get_userbyid(proowner) from pg_proc where oid='receipt_router_legacy_v1.read_source(uuid)'::regprocedure;"),'postgres');
  assert.equal(q("select has_function_privilege('fixture_default_exec','receipt_router_legacy_v1.read_source(uuid)','EXECUTE');"),'f');
  assert.equal(q("select has_function_privilege('receipt_router_legacy_v1_owner','receipt_router_legacy_v1.read_source(uuid)','EXECUTE');"),'t');
  q('drop function public.fixture_default_control();');
 });
 for(const domain of ['legacy_premium','legacy_creator'])for(const store of ['APP_STORE','PLAY_STORE'])await record(`${domain} ${store}: exact authenticated bytes and actual legacy graph admit immutable ownership, never authority`,async()=>{
  const v=await seed({domain,store});const r=importSource(v);assert.equal(r.status,'original_admitted');assert.equal(r.authorityGranted,false);assert.equal(r.providerDispatchAllowed,false);
  assert.equal(importSource(v).status,'already_admitted');assert.equal(veto(v).state,'clear');assert.equal(veto(v).authorityGranted,false);
  assert.equal(q('select count(*) from receipt_router_v1.originals;'),'1');
  bad("update receipt_router_legacy_v1.source_bindings set source_raw_hash=repeat('b',64);",/evidence_immutable/u);
  bad('delete from receipt_router_v1.original_admissions;',/evidence_immutable/u);
 });
 for(const productType of ['paid_content_access','watch_party_live_ticket','live_watch_party_access_pass','live_watch_party_seat_pass','event_pass','vip_pass','channel_subscription'])await record(`Creator source ${productType} retains its exact intent/grant type contract`,async()=>{
  const v=await seed({domain:'legacy_creator',productType,sku:'fixture-'+productType});
  assert.equal(importSource(v).status,'original_admitted');assert.equal(veto(v).state,'clear');
  assert.equal(q('select source_intent_id,source_grant_id from receipt_router_legacy_v1.source_bindings;'),v.intent+'|'+v.grant);
 });
 const mutations=[
  ['source raw hash','legacy_premium',v=>`update public.provider_events set raw_payload_hash=repeat('b',64) where id='${v.id}';`],
  ['ingress raw hash','legacy_premium',()=>"update public.revenuecat_webhook_ingress_events set raw_payload_hash=repeat('b',64);"],
  ['missing ingress','legacy_premium',()=> 'delete from public.revenuecat_webhook_ingress_events;'],
  ['source owner','legacy_premium',()=>`update public.revenuecat_premium_transaction_authority set user_id='${OTHER}';`],
  ['source environment','legacy_premium',()=>"update public.revenuecat_premium_transaction_authority set environment='production';"],
  ['first event id','legacy_premium',()=>"update public.revenuecat_premium_transaction_authority set first_event_id='not-the-authenticated-event';"],
  ['first event hash','legacy_premium',()=>"update public.revenuecat_premium_transaction_authority set first_event_hash=repeat('c',64);"],
  ['source SKU','legacy_premium',()=>`update public.provider_events set metadata=jsonb_set(metadata,'{provider_product_id}','"wrong-sku"');`],
  ['malformed original','legacy_premium',()=>`update public.provider_events set metadata=jsonb_set(metadata,'{original_transaction_id}','" bad "');`],
  ['wrong premium authority','legacy_premium',()=>`update public.provider_events set metadata=jsonb_set(metadata,'{premium_transaction_binding_id}','"${randomUUID()}"');`],
  ['unconsumed creator intent','legacy_creator',()=> 'update public.money_purchase_intents set consumed_at=null;'],
  ['wrong creator intent subject','legacy_creator',()=>`update public.money_purchase_intents set user_id='${OTHER}';`],
  ['wrong creator intent SKU','legacy_creator',()=>"update public.money_purchase_intents set provider_product_id='wrong-sku';"],
  ['malformed intent UUID','legacy_creator',()=>`update public.provider_events set metadata=jsonb_set(metadata,'{purchase_intent_id}','"------------------------------------"');`],
  ['inexact transaction binding','legacy_creator',()=>"update public.revenuecat_consumable_transaction_intents set binding_state='unresolved';"],
  ['transaction source event mismatch','legacy_creator',()=>`update public.revenuecat_consumable_transaction_intents set provider_event_id='${randomUUID()}';`],
  ['grant subject mismatch','legacy_creator',()=>`update public.access_grants set user_id='${OTHER}';`],
  ['grant source mismatch','legacy_creator',()=>"update public.access_grants set source_id='other-content';"],
  ['grant intent mismatch','legacy_creator',()=>`update public.access_grants set metadata=jsonb_set(metadata,'{purchase_intent_id}','"${randomUUID()}"');`],
  ['grant original mismatch','legacy_creator',()=>`update public.access_grants set metadata=jsonb_set(metadata,'{original_transaction_id}','"wrong-original"');`],
 ];
 for(const [name,domain,mutate] of mutations)await record(`Unqualified ${name} cannot import or create a clear veto`,async()=>{
  const v=await seed({domain});q(mutate(v));const r=importSource(v);assert.equal(r.status,'unavailable');assert.equal(r.authorityGranted,false);
  assert.equal(q('select count(*) from receipt_router_v1.originals;'),'0');assert.equal(veto(v).state,'unavailable');
 });
 await record('Incomplete ownership coverage, wrong authenticated receipt and missing exact-domain mapping remain unavailable',async()=>{
  const v=await seed();q("update receipt_router_v1.configuration set ownership_coverage='incomplete';");assert.equal(importSource(v).status,'unavailable');
  q("update receipt_router_v1.configuration set ownership_coverage='complete';");
  const e=await envelope({...sourceEvent(v),id:randomUUID(),product_id:'wrong-sku'});const receipt=ingest(e).receiptId;
  assert.equal(importSource({...v,receipt}).status,'unavailable');assert.equal(veto(v).state,'unavailable');
  importSource(v);assert.equal(veto(v,{domain:'legacy_creator'}).state,'unavailable');assert.equal(veto(v,{subject:OTHER}).state,'unavailable');
 });
 await record('Exact Premium refund holds only its immutable domain/original while creator and other Premium originals stay clear',async()=>{
  const premium=await seed(),creator=await seed({domain:'legacy_creator'}),other=await seed();
  for(const v of [premium,creator,other])importSource(v);
  ingest(await envelope({...sourceEvent(premium),id:randomUUID(),type:'REFUND'}));
  assert.equal(veto(premium).state,'held');assert.equal(veto(premium).reason,'exact_original_pending');
  assert.equal(veto(creator).state,'clear');assert.equal(veto(other).state,'clear');
 });
 for(const variant of ['malformed identity','unknown lifecycle','conflicting event bytes'])await record(`${variant} cannot narrow unresolved subject evidence to a creator original and bypass Premium`,async()=>{
  const premium=await seed(),creator=await seed({domain:'legacy_creator'});importSource(premium);importSource(creator);
  const validEvent={...sourceEvent(creator),id:randomUUID(),type:'REFUND'};
  ingest(await envelope(validEvent));assert.equal(veto(premium).state,'clear');
  if(variant==='malformed identity'){
   const e=await envelope({...validEvent,id:randomUUID(),appUserId:OTHER});assert.equal(e.observation.parseStatus,'invalid');ingest(e);
  }else if(variant==='unknown lifecycle'){
   const e=await envelope({...validEvent,id:randomUUID(),type:'SYNTHETIC_UNKNOWN_LIFECYCLE'});assert.equal(e.observation.parseStatus,'valid');ingest(e);
  }else{
   const conflict=ingest(await envelope({...validEvent,event_timestamp_ms:1794052800001}));assert.equal(conflict.status,'conflict');
  }
  const decision=veto(premium);assert.equal(decision.state,'held');assert.equal(decision.reason,'subject_scope_unresolved');
  assert.equal(decision.authorityGranted,false);
 });
 for(const variant of ['malformed alias identity','unknown alias lifecycle','conflicting alias bytes'])await record(`${variant} follows the proven economic scope but remains domain-unresolved`,async()=>{
  const premium=await seed(),creator=await seed({domain:'legacy_creator'});importSource(premium);importSource(creator);
  const connectionId=randomUUID(),scopeId=randomUUID(),project='fixture-final-alias-project',app='fixture-final-alias-app';
  const connection={...config,connectionId,projectId:project};
  q(`insert into receipt_router_v1.connections values('${connectionId}',1,${lit(project)},'shared_secret','fixture-auth-v1','fixture-encryption-v1',true);`);
  q(`insert into receipt_router_v1.scopes values('${scopeId}',${lit(project)},${lit(app)},'APP_STORE','SANDBOX','fixture-bundle');
   insert into receipt_router_v1.catalog values('${scopeId}',${lit(creator.sku)},'legacy_creator',1);`);
  const valid={...sourceEvent(creator),id:randomUUID(),type:'REFUND',app_id:app};
  ingest(await envelope(valid,connection),connectionId);
  assert.equal(veto(premium).state,'clear','valid exact creator refund does not veto Premium');
  assert.equal(veto(creator).state,'held');
  // An unknown original on a qualified alias cannot establish an economic
  // subject scope across projects merely because its text is plausible.
  const unknown={...valid,id:randomUUID(),original_transaction_id:'unqualified-original',appUserId:OTHER};
  ingest(await envelope(unknown,connection),connectionId);
  assert.equal(veto(premium).state,'clear','unknown-original alias cannot broaden into Premium');
  if(variant==='malformed alias identity'){
   const e=await envelope({...valid,id:randomUUID(),appUserId:OTHER},connection);assert.equal(e.observation.parseStatus,'invalid');ingest(e,connectionId);
  }else if(variant==='unknown alias lifecycle'){
   ingest(await envelope({...valid,id:randomUUID(),type:'SYNTHETIC_UNKNOWN_LIFECYCLE'},connection),connectionId);
  }else{
   assert.equal(ingest(await envelope({...valid,event_timestamp_ms:1794052800001},connection),connectionId).status,'conflict');
  }
  for(const candidate of [premium,creator]){
   const result=veto(candidate);assert.equal(result.state,'held');if(candidate===premium)assert.equal(result.reason,'subject_scope_unresolved');assert.equal(result.authorityGranted,false);
  }
 });
 await record('Productless transfer holds both canonical subjects across their independently admitted lineages',async()=>{
  const a=await seed(),b=await seed({subject:OTHER,domain:'legacy_creator'});importSource(a);importSource(b);
  ingest(await envelope({...sourceEvent(a),id:randomUUID(),type:'TRANSFER',app_user_id:null,original_app_user_id:null,
   product_id:null,original_transaction_id:null,transaction_id:null,transferred_from:[BUYER],transferred_to:[OTHER]}));
  assert.equal(veto(a).state,'held');assert.equal(veto(b).state,'held');assert.equal(veto(a).reason,'subject_scope_unresolved');
 });
 await record('Qualified same-store-app refund crosses provider project aliases; unrelated or unqualified projects remain isolated',async()=>{
  const v=await seed();importSource(v);
  async function refundFrom(project,app,storeIdentity){
   const connectionId=randomUUID(),scopeId=randomUUID(),connection={...config,connectionId,projectId:project};
   q(`insert into receipt_router_v1.connections values('${connectionId}',1,${lit(project)},'shared_secret','fixture-auth-v1','fixture-encryption-v1',true);`);
   if(storeIdentity!==null)q(`insert into receipt_router_v1.scopes values('${scopeId}',${lit(project)},${lit(app)},'APP_STORE','SANDBOX',${lit(storeIdentity)});
    insert into receipt_router_v1.catalog values('${scopeId}',${lit(v.sku)},'legacy_premium',1);`);
   return ingest(await envelope({...sourceEvent(v),id:randomUUID(),type:'REFUND',app_id:app},connection),connectionId);
  }
  await refundFrom('fixture-unqualified-project','fixture-unqualified-app',null);assert.equal(veto(v).state,'clear');
  await refundFrom('fixture-unrelated-project','fixture-unrelated-app','different-economic-store-app');assert.equal(veto(v).state,'clear');
  await refundFrom('fixture-alias-project','fixture-alias-app','fixture-bundle');assert.equal(veto(v).state,'held');
 });
 for(const [label,subject,type] of [['different reported subject',OTHER,'REFUND'],['missing reported subject',null,'EXPIRATION']])await record(`Ownership learned after ${label} negative preserves the immutable original owner's veto`,async()=>{
  const v=await seed();
  const negative=ingest(await envelope({...sourceEvent(v),id:randomUUID(),type,app_user_id:subject,original_app_user_id:subject}));
  if(subject)assert.equal(q(`select count(*) from receipt_router_v1.pending_holds where evidence_receipt_id='${negative.receiptId}' and subject_id='${subject}';`),'1');
  assert.equal(importSource(v).status,'original_admitted');
  const decision=veto(v);assert.equal(decision.state,'held');assert.equal(decision.authorityGranted,false);
  if(subject)assert.equal(q(`select count(*) from receipt_router_v1.pending_holds where evidence_receipt_id='${negative.receiptId}' and subject_id='${subject}';`),'1');
 });
 await record('Source expiry/refund retains admitted provenance without pretending the original purchase is currently active',async()=>{
  const a=await seed(),b=await seed({domain:'legacy_creator'});importSource(a);importSource(b);
  q("update public.provider_events set status='refunded';update public.revenuecat_premium_transaction_authority set status='refunded',expires_at=clock_timestamp()-interval '1 day';update public.money_purchase_intents set status='revoked';update public.access_grants set status='revoked',expires_at=clock_timestamp()-interval '1 day';");
  for(const v of [a,b]){assert.equal(importSource(v).status,'already_admitted');assert.equal(veto(v).state,'clear');assert.equal(veto(v).authorityGranted,false);}
 });
 await record('Concurrent legacy source writer makes import fail immediately; reader fences source updates until commit',async()=>{
  const v=await seed();const writer=await held(`begin;update public.provider_events set status='refunded' where id='${v.id}';`);
  try{const start=Date.now();bad(bounded(importExpression(v)),/could not obtain lock/u);assert.ok(Date.now()-start<1000);}finally{await writer.finish('rollback');}
  const reader=await held(`begin;select receipt_router_v1.arm_source_import_context();select ${importExpression(v)};`);
  try{bad(`begin;set local lock_timeout='100ms';update public.provider_events set status='refunded' where id='${v.id}';commit;`,/lock timeout/u);}finally{await reader.finish('commit');}
  assert.equal(importSource(v).status,'already_admitted');
 });
 await record('Unarmed and repeatable-read private calls reject before source graph access',async()=>{
  const v=await seed();bad(`select ${importExpression(v)};`,/context_invalid/u);
  bad(`begin;set local transaction_timeout='6s';select ${importExpression(v)};commit;`,/context_invalid/u);
  bad(`begin isolation level repeatable read;set local transaction_timeout='5s';select ${importExpression(v)};commit;`,/context_invalid/u);
  assert.equal(q('select count(*) from receipt_router_v1.originals;'),'0');
 });
 await record('Private assert veto rejects missing or held mappings; clear return grants no positive authority',async()=>{
  const v=await seed();
  const call=`receipt_router_legacy_v1.assert_original_clear(${lit(v.domain)},${lit(v.provider)},${lit(v.environment)},'${v.subject}',${lit(v.original)})`;
  bad(bounded(call),/legacy_original_router_veto/u);importSource(v);assert.equal(q(bounded(call)),'');
  ingest(await envelope({...sourceEvent(v),id:randomUUID(),type:'REFUND'}));bad(bounded(call),/legacy_original_router_veto/u);
  assert.equal(q('select count(*) from public.access_grants;'),'0');
 });
 for(const p of paths)assert.equal(hash(p),sourceHashes[path.relative(repo,p)],'Source changed during run: '+p);
 report={status:'passed',scope:'local-native-source-proof',engine:version,caseCount:cases.length,cases,sourceHashes,
  syntheticProviderEvidence:true,providerOrProductionCalls:false,actualProviderAuthenticationProven:false,legacyEnforcementProven:false,
  assumptions:['Synthetic exact legacy projections only; not a bootstrap or hosted schema/ACL attestation',
   'Local postgres is fixture superuser; private bridge functions still run as source-defined non-bypass roles',
   'Authenticated envelope uses synthetic local keys/raw bytes; no real provider verification',
   'Clear is absence of a router veto, never positive ownership, entitlement, payment or delivery authority'],durationMs:Date.now()-began};
}catch(error){
 primaryFailure=error;
 // Capture before cleanup can change the directory. Only a failed bootstrap
 // reads this log; SQL/provider fixture statements cannot enter this evidence.
 if(!started&&startAttempted)failureLog=startupLog();
}finally{
 try{
 for(const child of sessions)child.kill('SIGTERM');
 if(sessions.size)await Promise.all([...sessions].map(child=>new Promise(resolve=>child.once('exit',resolve))));cleanup.sessionsClosed=true;
 if(startAttempted){let s=run('pg_ctl',['-D',data,'status']);if(s.status===0){invoke('pg_ctl',['-D',data,'-m','immediate','-w','-t','15','stop']);cleanup.clusterStopped=true;}
  else if(s.status!==3||!started)throw new Error('Uncertain local cluster; preserved '+directory);
  assert.equal(run('pg_ctl',['-D',data,'status']).status,3);cleanup.clusterNotRunningVerified=true;
 }else if(initAttempted&&!initialized)throw new Error('Uncertain local initialization; preserved '+directory);
 fs.rmSync(directory,{recursive:true});fs.rmSync(socketDirectory,{recursive:true});cleanup.directoryRemoved=true;
 }catch(error){cleanupFailure=error;}
}
if(primaryFailure||cleanupFailure){
 const failure=error=>error?{name:error.name??'Error',message:boundedText(error.message??error),code:error.code??null}:null;
 process.stderr.write('LEGACY_BOOTSTRAP_DIAGNOSTICS '+JSON.stringify({phase,primaryFailure:failure(primaryFailure),
  cleanupFailure:failure(cleanupFailure),initAttempted,initialized,startAttempted,started,commands:bootstrapCommands,
  serverLog:failureLog??null,directoryPreserved:fs.existsSync(directory),socketDirectory,
  socketDirectoryPreserved:fs.existsSync(socketDirectory),cleanup})+'\n');
 // Cleanup never replaces the original failure. Neither failure can emit a
 // passing proof, and uncertain clusters retain their exact directory.
 throw primaryFailure??cleanupFailure;
}
assert.ok(report);console.log(JSON.stringify({...report,cleanup},null,2));
