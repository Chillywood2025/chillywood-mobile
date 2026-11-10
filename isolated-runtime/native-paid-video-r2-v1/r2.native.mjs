#!/usr/bin/env node
// Disposable real PostgreSQL only. Synthetic actors, keys, byte evidence and
// native catalog qualification here never count as target/provider proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes,createHash,createHmac} from 'node:crypto';
import {nativeStoreInstallProfile} from '../native-store-sandbox-v1/install-profile.mjs';
import {createNativeAuthoringCluster} from '../native-paid-video-authoring-v1/cluster.mjs';
import {SELLER,SELLER_SESSION,BUYER,BUYER_SESSION,sqlJson,sqlText} from '../sandbox-commerce-v1/tests/test-store-v3.fixture.mjs';
import {nativeR2Source} from './source.mjs';
import {verifySource as verifyPlaySource} from '../native-store-play-handoff-v1/deployment.mjs';
assert.deepEqual(process.argv.slice(2,3),['--local-bin']);assert.equal(process.argv.length,4);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),source=p=>fs.readFileSync(path.join(root,p),'utf8');
const h=await createNativeAuthoringCluster(process.argv[3]),q=h.q,cases=[];
const declaration='create table sandbox_commerce_v1.declarations(user_id uuid primary key,session_id uuid,\n declared_18_plus boolean,country_code text,region_code text,declaration_version text,updated_at timestamptz);';
const authority=source('isolated-runtime/sandbox-commerce-v1/tests/authority.fixture.sql');assert.equal(authority.split(declaration).length,2);
const fixtures='create role anon nologin;create role authenticated nologin;create role service_role nologin;create role supabase_read_only_user login nosuperuser nocreaterole nocreatedb noreplication bypassrls;'
 +source('isolated-runtime/sandbox-commerce-v1/tests/premium-authority.fixture.sql')+authority.replace(declaration,'-- Supplied by core.')
 +'create table public.channel_audience_blocks(channel_user_id text,blocked_user_id text);';
const configuration='8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0';
const route=randomUUID(),worker=randomUUID(),verifier=randomUUID(),profile=randomUUID(),keyId=randomUUID();
const role=name=>`set role ${name};set request.jwt.claims=${sqlText(JSON.stringify({role:name,...(name==='sbx_v1_r2_gateway'?{profile_id:profile}:name==='sbx_v1_r2_scanner'?{profile_id:profile,worker_id:worker}:{})}))};`;
const service=role('service_role'),gateway=role('sbx_v1_r2_gateway'),scanner=role('sbx_v1_r2_scanner');
const subject=(user=SELLER,session=SELLER_SESSION)=>`set role authenticated;set request.jwt.claims=${sqlText(JSON.stringify({role:'authenticated',sub:user,session_id:session}))};`;
const gatewayKey=randomBytes(32),workerKey=randomBytes(32),verifierKey=randomBytes(32);
const sha=createHash('sha256').update('synthetic bytes').digest('hex'),length=15;
const nativeIdentity={kind:'r2-native-upload-v1',nativeVersion:'synthetic-r2-native-version',etag:'a'.repeat(32)};
const json=sql=>{const value=q(sql);return value===''?null:JSON.parse(value);};
const authorSql=(command,payload={},requestId=randomUUID())=>`select public.isolated_paid_video_v2(${sqlText(command)},${sqlJson({protocol:'isolated-paid-video-v1',requestId,...payload})},'${SELLER}','${SELLER_SESSION}','${configuration}');`;
const author=(...args)=>json(subject()+authorSql(...args));
const reserve=()=>author('upload.reserve',{title:'Typed native R2 sample',expectedSha256:sha,expectedByteLength:length}).data.upload;
const admitSql=(action,u,request,extra={})=>`select public.native_paid_video_r2_admit_v1(${sqlText(action)},'${extra.user??SELLER}',${sqlText(extra.session??SELLER_SESSION)},${u?sqlText(u.id.slice(12)):'null'},'${request}','${extra.configuration??configuration}',${extra.range?sqlJson(extra.range):'null'},${extra.grant?sqlText(extra.grant):'null'});`;
const admit=(action,u,request,extra)=>json(service+admitSql(action,u,request,extra));
const gatewaySql=(token,phase,outcome=null)=>`select public.native_paid_video_r2_gateway_v1(${sqlJson(token)},'${phase}',${outcome?sqlJson(outcome):'null'});`;
const callGateway=(token,phase,outcome)=>json(gateway+gatewaySql(token,phase,outcome));
const sign=(raw,key)=>createHmac('sha256',key).update(raw).digest('hex');
let failure;
try{
 h.start('');q(fixtures);q(nativeStoreInstallProfile().sql);
 // Exact installed Play successor, not the original48 pre-Play function set.
 q('begin;'+verifyPlaySource().map(x=>x.data.toString('utf8')).join('\n')+'commit;');
 const studio=['isolated-runtime/native-paid-video-authoring-v1/authoring.sql','ops/isolated-paid-video-operations-v2/operations.sql','ops/isolated-paid-video-operations-v2/monotonic-removal.sql'].map(source).join('\n');
 q('begin;grant usage,create on schema public to sbx_v1_core_owner;'+studio+'revoke create on schema public from sbx_v1_core_owner;commit;');
 const before=q("select jsonb_object_agg(p.oid::text,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('sandbox_commerce_v1','native_store_sandbox_v1');");
 const extension=nativeR2Source();
 q('begin;'+extension.sql+'commit;');
 for(const table of ['r2_profiles','r2_bindings','r2_dispatches','r2_commits','r2_receipts','r2_tickets']){
  assert.equal(q(`select count(*) from sandbox_commerce_v1.${table}`),'0');
  assert.equal(q(`select relrowsecurity and relforcerowsecurity from pg_class where oid='sandbox_commerce_v1.${table}'::regclass`),'t');
  for(const r of ['anon','authenticated','service_role','sbx_v1_operator','sbx_v1_r2_gateway','sbx_v1_r2_scanner'])
   assert.equal(q(`select has_table_privilege('${r}','sandbox_commerce_v1.${table}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')`),'f');
 }
 assert.equal(q("select bool_and(not rolcanlogin and not rolbypassrls and not rolsuper and not rolcreaterole) from pg_roles where rolname in('sbx_v1_r2_gateway','sbx_v1_r2_scanner')"),'t');
 for(const r of ['anon','authenticated','service_role','sbx_v1_operator','sbx_v1_r2_scanner'])assert.equal(q(`select has_function_privilege('${r}','public.native_paid_video_r2_gateway_v1(jsonb,text,jsonb)','EXECUTE')`),'f');
 for(const r of ['anon','authenticated','service_role','sbx_v1_operator','sbx_v1_r2_gateway','sbx_v1_r2_scanner'])
  assert.equal(q(`select bool_and(not has_function_privilege('${r}',p.oid,'EXECUTE')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='sandbox_commerce_v1' and (p.proname like 'r2_%' or p.proname in('native_r2_assert_media','native_typed_assert_media','native_store_paid_video_r2_access'));`),'t');
 const after=json("select jsonb_object_agg(p.oid::text,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('sandbox_commerce_v1','native_store_sandbox_v1');");
 assert.equal(Object.entries(JSON.parse(before)).filter(([oid,hash])=>after[oid]!==hash).length,extension.replacements.length);
 for(const retained of extension.retained)assert.equal(q(`select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.${retained.name}(${retained.signature})'::regprocedure;`),retained.previousSha256);
 h.rejects('begin;'+extension.sql+'rollback;',/r2_predecessor_function_drift/u);
 cases.push('Forward source preserves prior function OIDs, rejects predecessor drift/replay, keeps all new tables empty/default-off/FORCE RLS and narrow NOLOGIN roles.');
 q(`select authority_fixture.reset();insert into auth.users(id,email_confirmed_at,raw_app_meta_data) values('${BUYER}',clock_timestamp(),'{}');
 insert into auth.sessions values('${BUYER_SESSION}','${BUYER}',clock_timestamp()+interval '1 hour');
 insert into public.wave1_legal_acceptances select '${BUYER}','${BUYER_SESSION}',document_key,version,market,capability,'member',null from public.wave1_legal_document_versions where capability='account';
 update sandbox_commerce_v1.lifecycle set state='active';
 insert into sandbox_commerce_v1.paid_video_routes values('${route}','cloudflare_r2','synthetic-native-r2',repeat('1',64),true);
 insert into sandbox_commerce_v1.paid_video_workers values('${worker}',decode('${workerKey.toString('hex')}','hex'),repeat('2',64),true);
 insert into sandbox_commerce_v1.paid_video_verifiers values('${verifier}',decode('${verifierKey.toString('hex')}','hex'),repeat('3',64),true);
 insert into sandbox_commerce_v1.r2_profiles values('${profile}','${configuration}','${route}','${worker}','${verifier}','${keyId}',decode('${gatewayKey.toString('hex')}','hex'),repeat('4',64),repeat('c',64),16777216,false);`);
 assert.equal(author('capability.read').data.transferAvailable,false);
 q('update sandbox_commerce_v1.r2_profiles set enabled=true;');
 assert.equal(author('capability.read').data.transferAvailable,true);
 // An unrelated active S3 route cannot change native R2 route selection.
 q(`insert into sandbox_commerce_v1.paid_video_routes values('00000000-0000-4000-8000-000000000001','s3','synthetic-s3-first',repeat('b',64),true);`);
 const upload=reserve(),request=randomUUID(),envelope=admit('upload',upload,request),token=JSON.parse(envelope.raw);
 assert.equal(token.object.routeId,route);assert.equal(token.object.identity,undefined);assert.equal(envelope.signature,sign(envelope.raw,gatewayKey));
 h.rejects(service+gatewaySql(token,'before'),/permission denied/u);
 h.rejects(`set role sbx_v1_r2_gateway;set request.jwt.claims=${sqlText(JSON.stringify({role:'sbx_v1_r2_gateway',profile_id:randomUUID()}))};`+gatewaySql(token,'before'),/gateway_role_required/u);
 h.rejects(gateway+gatewaySql({...token,object:{...token.object,provider:'s3'}},'before'),/current_binding_required/u);
 const first=callGateway(token,'before');assert.equal(first.dispatchAllowed,true);
 h.rejects(gateway+gatewaySql(token,'before'),/duplicate key/u);
 h.rejects(service+admitSql('upload',upload,randomUUID()),/non_retriable/u);
 callGateway(token,'commit',{state:'acknowledged',identity:nativeIdentity});
 h.rejects(gateway+gatewaySql(token,'commit',{state:'acknowledged',identity:nativeIdentity}),/duplicate key/u);
 assert.equal(q(`select object_version is null and r2_identity is null from sandbox_commerce_v1.paid_video_uploads where id='${upload.id.slice(12)}'`),'t');
 const probe=JSON.parse(admit('probe',upload,request).raw);assert.deepEqual(probe.object.identity,nativeIdentity);
 const pb=callGateway(probe,'before'),pa=callGateway(probe,'after');assert.equal(pb.authorityDigest,pa.authorityDigest);
 const observation={protocol:'scpv-object-observation-r2-v1',verifierId:verifier,token:probe,identity:nativeIdentity,sha256:sha,byteLength:length,checkedAtMs:Date.now(),expiresAtMs:probe.expiresAtMs};
 const raw=JSON.stringify(observation),signature=sign(raw,verifierKey);
 const reconcile=(raw,signature)=>`select public.native_paid_video_r2_reconcile_v1(${sqlText(raw)},'${signature}','${SELLER}','${SELLER_SESSION}');`;
 h.rejects(service+reconcile(raw,'0'.repeat(64)),/signature_invalid/u);
 const mismatch=JSON.stringify({...observation,identity:{...nativeIdentity,nativeVersion:'replacement'}});
 h.rejects(service+reconcile(mismatch,sign(mismatch,verifierKey)),/binding_invalid/u);
 const receipt=json(service+reconcile(raw,signature));assert.equal(receipt.protocol,'scpv-object-receipt-r2-v1');assert.deepEqual(receipt.identity,nativeIdentity);
 assert.deepEqual(admit('probe',upload,request),receipt);
 assert.equal(JSON.parse(q(`begin;update sandbox_commerce_v1.r2_profiles set enabled=false;`+service+admitSql('probe',upload,request)+'rollback;')).state,'recorded');
 h.rejects(`update sandbox_commerce_v1.paid_video_uploads set object_version='fake-r2-version' where id='${upload.id.slice(12)}';`,/typed_identity_required/u);
 cases.push('Exact profile route wins over active-first S3; signed token rebinding/provider changes reject; claim and commit replay fail; only acknowledged exact identity can be verified, never fake S3 VersionId.');
 for(const state of ['started','unknown','exists_unverified']){
  const u=reserve(),req=randomUUID(),t=JSON.parse(admit('upload',u,req).raw);callGateway(t,'before');
  if(state!=='started')callGateway(t,'commit',{state});
  h.rejects(service+admitSql('upload',u,req),/non_retriable/u);
  h.rejects(service+admitSql('probe',u,req),/acknowledged_identity_required/u);
 }
 const race=reserve(),raceRequest=randomUUID(),raceToken=JSON.parse(admit('upload',race,raceRequest).raw);
 const held=await h.held('begin;'+gateway+gatewaySql(raceToken,'before'));
 h.rejects(gateway+gatewaySql(raceToken,'before'),/dispatch_busy/u);await held.finish('commit');
 h.rejects(gateway+gatewaySql(raceToken,'before'),/duplicate key/u);
 cases.push('Committed started/lost acknowledgment, unknown PUT and existing-object conflict remain durable non-retriable and cannot probe to discover latest identity.');
 assert.equal(author('upload.finalize',{uploadId:upload.id}).data.upload.state,'scan_pending');
 const leaseSql=`select public.native_paid_video_r2_worker_v1('lease','${upload.id.slice(12)}','${worker}',null,null);`;
 h.rejects(`set role sbx_v1_r2_scanner;set request.jwt.claims=${sqlText(JSON.stringify({role:'sbx_v1_r2_scanner',profile_id:profile,worker_id:randomUUID()}))};`+leaseSql,/scanner_role_required/u);
 const ticket=json(scanner+`select public.native_paid_video_r2_next_v1('${worker}');`);assert.deepEqual(ticket.object.identity,nativeIdentity);
 assert.equal(json(scanner+`select public.native_paid_video_r2_next_v1('${worker}');`),null);
 h.rejects(scanner+leaseSql,/already_leased/u);
 const scanToken=JSON.parse(json(scanner+`select public.native_paid_video_r2_scan_admit_v1('${upload.id.slice(12)}','${ticket.ticketId}');`).raw);
 assert.equal(callGateway(scanToken,'before').dispatchAllowed,false);
 const result={protocol:'scpv-byte-scan-v1',profile:'scpv-mp4-h264-aac-v1',sha256:sha,byteLength:length,checkedAt:new Date().toISOString(),
  definitions:{protocol:'scpv-definition-manifest-v1',files:[{filename:'daily.cvd',createdAt:new Date().toISOString()}],manifestSha256:'7'.repeat(64)},
  moderation:'unreviewed',verdict:'clean',reason:'exact_bytes_scanned',media:{durationMs:1000,width:320,height:180,framesPerSecond:24,videoCodec:'h264',pixelFormat:'yuv420p',audioCodec:null}};
 const scan={protocol:'scpv-worker-result-r2-v1',ticketId:ticket.ticketId,uploadId:upload.id,workerId:worker,qualificationSha256:'4'.repeat(64),object:ticket.object,result};
 const scanSql=value=>{const raw=JSON.stringify(value);return `select public.native_paid_video_r2_worker_v1('complete',null,null,${sqlText(raw)},'${sign(raw,workerKey)}');`;};
 h.rejects(scanner+scanSql({...scan,object:{...ticket.object,identity:{...nativeIdentity,nativeVersion:'same-byte-overwrite'}}}),/binding_invalid/u);
 h.rejects(scanner+scanSql({...scan,qualificationSha256:'5'.repeat(64)}),/binding_invalid/u);
 assert.equal(json(scanner+scanSql(scan)).protocol,'scpv-r2-worker-completion-v1');
 assert.equal(q(`select state from sandbox_commerce_v1.paid_video_uploads where id='${upload.id.slice(12)}'`),'clean');
 h.rejects(subject()+authorSql('offer.publish',{uploadId:upload.id,expectedRevision:1,amountMinor:99,currency:'usd'}),/publication_evidence_unavailable/u);
 // Synthetic reviewer eligibility/evidence, actual independent authenticated
 // inspect/decide implementation. No privileged moderation shortcut.
 q(`insert into sandbox_commerce_v1.paid_video_reviewers values('${BUYER}',repeat('8',64),true),('${SELLER}',repeat('8',64),true);`);
 const reviewBody={protocol:'scpv-review-request-v1',requestId:randomUUID(),reviewerId:BUYER,sessionId:BUYER_SESSION,uploadId:upload.id};
 const reviewSql=(action,body)=>`select public.isolated_paid_video_review_v1('${action}',${sqlText(JSON.stringify(body))});`;
 h.rejects(subject()+reviewSql('inspect',{...reviewBody,reviewerId:SELLER,sessionId:SELLER_SESSION}),/independent_reviewer_required/u);
 const snapshot=json(subject(BUYER,BUYER_SESSION)+reviewSql('inspect',reviewBody));assert.deepEqual(snapshot.object.identity,nativeIdentity);
 const decision={...reviewBody,requestId:randomUUID(),snapshot,decision:'clear',evidenceSha256:'8'.repeat(64),reviewedAt:new Date().toISOString(),humanReviewConfirmed:true};
 h.rejects(subject(BUYER,BUYER_SESSION)+reviewSql('decide',{...decision,snapshot:{...snapshot,object:{...snapshot.object,identity:{...nativeIdentity,nativeVersion:'replaced'}}}}),/review_evidence_invalid/u);
 assert.equal(json(subject(BUYER,BUYER_SESSION)+reviewSql('decide',decision)).state,'acknowledged');
 const catalog=randomUUID();
 q(`insert into sandbox_commerce_v1.catalog values('${catalog}','paid_content','revenuecat','synthetic-native-project','APP_STORE','synthetic.ios',99,'usd');
 insert into sandbox_commerce_v1.paid_video_native_catalog_templates values
 ('${randomUUID()}',1,'${catalog}','PLAY_STORE','synthetic-native-project','synthetic-play-app','synthetic.play',repeat('9',64),true),
 ('${randomUUID()}',1,'${catalog}','APP_STORE','synthetic-native-project','synthetic-ios-app','synthetic.ios',repeat('9',64),true);`);
 const published=author('offer.publish',{uploadId:upload.id,expectedRevision:1,amountMinor:99,currency:'usd'});assert.equal(published.status,'ok');
 assert.equal(q(`select object_version is null and r2_identity=${sqlJson(nativeIdentity)} from sandbox_commerce_v1.delivery_assets where id='${upload.assetId.slice(11)}'`),'t');
 assert.equal(q(`select r2_identity=${sqlJson(nativeIdentity)} from sandbox_commerce_v1.delivery_asset_scans where asset_id='${upload.assetId.slice(11)}'`),'t');
 q(`set role sbx_v1_core_owner;select sandbox_commerce_v1.clean_resource_asset('${upload.assetId.slice(11)}','${upload.resourceId.slice(14)}',1,'${SELLER}','video');`);
 cases.push('Scanner lease/result pin exact accepted R2 identity, wrong nativeVersion/profile rejects, clean alone cannot publish, publication writes typed asset and scan evidence without objectVersion.');
 cases.push(await (await import('./allocation.native-cases.mjs')).runR2AllocationCases({h,q,root,published,upload,profile,worker,route,identity:nativeIdentity}));
 // Same local buyer/content, independent store test: retire the first grant so
 // the exact-current-grant selector cannot choose the earlier Apple purchase.
 q(`update sandbox_commerce_v1.resource_grants set revoked_at=clock_timestamp() where product_id='${upload.resourceId.slice(14)}';`);
 cases.push(await (await import('./allocation.native-cases.mjs')).runR2AllocationCases({h,q,root,published,upload,profile,worker,route,identity:nativeIdentity,store:'PLAY_STORE'}));
 cases.push((await import('./s3-v3.native-cases.mjs')).runS3V3Cases({h,q,profile,worker,verifier,verifierKey,workerKey,sha,length,result}));
 // Authenticated late negative is accepted even after worker/profile disabled,
 // and the unchanged removal tombstone forbids clean/reviewer resurrection.
 q(`update sandbox_commerce_v1.r2_profiles set enabled=false;update sandbox_commerce_v1.paid_video_workers set active=false where id='${worker}';`);
 assert.equal(json(scanner+scanSql({...scan,result:{...result,verdict:'rejected',reason:'synthetic_late_negative',media:null}})).state,'recorded');
 assert.equal(q(`select state from sandbox_commerce_v1.paid_video_uploads where id='${upload.id.slice(12)}'`),'rejected');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.paid_video_removals where resource_id='${upload.resourceId.slice(14)}'`),'1');
 h.rejects(`update sandbox_commerce_v1.paid_video_uploads set moderation='clear',state='clean' where id='${upload.id.slice(12)}';`,/removed_history_permanent/u);
 cases.push('Late signed negatives remain monotonic after disablement; existing removal tombstone prevents positive resurrection.');
 console.log(JSON.stringify({protocol:'native-paid-video-r2-local-proof-v1',sourceSha256:extension.sourceSha256,cases,realPostgres:true,syntheticEvidence:true,targetInstalled:false,providerQualified:false},null,2));
}catch(error){failure=error;throw error;}finally{
 try{await h.close();}catch(error){console.error(h.diagnostics(failure,error));throw error;}
}
