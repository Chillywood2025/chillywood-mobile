#!/usr/bin/env node
// Real local PostgreSQL and production HTTP handlers. Auth, S3 transport and
// scanner/qualification evidence below are synthetic, never target proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {nativeStoreInstallProfile} from '../native-store-sandbox-v1/install-profile.mjs';
import {sqlText,sqlJson} from '../sandbox-commerce-v1/tests/test-store.fixture.mjs';
import {createNativeAuthoringCluster} from './cluster.mjs';
import {seedV3Qualified,V3_FIXTURE,SELLER,SELLER_SESSION,BUYER,BUYER_SESSION} from '../sandbox-commerce-v1/tests/test-store-v3.fixture.mjs';
import {signScanResult} from '../../ops/isolated-paid-video-worker/scan.mjs';
import * as objectSource from '../../ops/isolated-paid-video-worker/private-object.mjs';
import * as brokerSource from '../../ops/isolated-paid-video-worker/upload-broker.mjs';

assert.deepEqual(process.argv.slice(2,3),['--local-bin']);assert.equal(process.argv.length,4);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const source=p=>fs.readFileSync(path.join(root,p),'utf8');
const configuration='8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0';
const declaration='create table sandbox_commerce_v1.declarations(user_id uuid primary key,session_id uuid,\n declared_18_plus boolean,country_code text,region_code text,declaration_version text,updated_at timestamptz);';
const authority=source('isolated-runtime/sandbox-commerce-v1/tests/authority.fixture.sql');assert.equal(authority.split(declaration).length,2);
const fixtures='create role anon nologin;create role authenticated nologin;create role service_role nologin;create role supabase_read_only_user login nosuperuser nocreaterole nocreatedb noreplication bypassrls;'
 +source('isolated-runtime/sandbox-commerce-v1/tests/premium-authority.fixture.sql')+authority.replace(declaration,'-- Real declarations are supplied by core.')
 +'create table public.channel_audience_blocks(channel_user_id text,blocked_user_id text);';
const extension=source('isolated-runtime/native-paid-video-authoring-v1/authoring.sql');
const h=await createNativeAuthoringCluster(process.argv[3]),q=h.q,cases=[];
const service="set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}';";
const subject=(user=SELLER,session=SELLER_SESSION)=>`set role authenticated;set request.jwt.claims=${sqlText(JSON.stringify({role:'authenticated',sub:user,session_id:session}))};`;
let actor={userId:SELLER,sessionId:SELLER_SESSION,expiresAtMs:Date.now()+3600000},lastError=null,mode=configuration;
const route=randomUUID(),worker=randomUUID(),verifier=randomUUID(),key=randomBytes(32),workerKey=randomBytes(32);
const bytes=Buffer.from('Synthetic immutable origin bytes for local SQL proof only'),sha=createHash('sha256').update(bytes).digest('hex');
const stored=new Map();let writes=0,lostPut=false;
const ts=createRequire(import.meta.url)('typescript'),cache=new Map([
 [path.join(root,'ops/isolated-paid-video-worker/private-object.mjs'),objectSource],
 [path.join(root,'ops/isolated-paid-video-worker/upload-broker.mjs'),brokerSource],
]);
const load=file=>{if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);
 const text=fs.readFileSync(file,'utf8');if(file.endsWith('.json')){exports.default=JSON.parse(text);return exports;}
 new Function('exports','require',ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>{
  assert.ok(name.startsWith('.'));return load(path.resolve(path.dirname(file),name));});return exports;};
const shared=name=>load(path.join(root,'supabase/functions/_shared',name));
const rpc=async(name,parameters,authorization)=>{const args=Object.entries(parameters).map(([k,v])=>`${k}=>${v===null?'null':typeof v==='object'?sqlJson(v):sqlText(v)}`).join(',');
 try{return JSON.parse(q((authorization?subject(actor.userId,actor.sessionId):service)+`select public.${name}(${args});`));}
 catch(error){lastError=error.message;throw error;}};
const authenticate=async()=>({actor:{...actor},authorization:'Bearer synthetic-local'});
const transport={async writeOnce(binding,body){writes++;assert.equal(binding.provider,'s3');assert.equal(binding.routeId,route);
 if(stored.has(binding.objectKey))return{state:'exists_unverified'};const value={bytes:new Uint8Array(body),objectVersion:'synthetic-version-'+randomUUID()};stored.set(binding.objectKey,value);
 return lostPut?{state:'unknown'}:{state:'acknowledged',objectVersion:value.objectVersion};},
 async readForScan(binding){assert.equal(binding.expectedSha256,sha);return structuredClone(stored.get(binding.objectKey));}};
const authoring=shared('isolated-paid-video-authoring.ts').createPaidVideoAuthoringHandler({authenticate,rpc});
const uploader=shared('isolated-paid-video-upload.ts').createPaidVideoUploadHandler({authenticate,rpc,transport,verifier:{id:verifier,key}});
const author=async(command,payload={},requestId=randomUUID())=>{
 lastError=null;const response=await authoring(new Request('https://synthetic.invalid/isolated-paid-video-authoring-v2',{method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({protocol:'isolated-paid-video-v2',command,requestId,expectedSessionId:actor.sessionId,configurationDigest:mode,payload})}));
 return{code:response.status,...await response.json()};};
const transfer=async(method,uploadId,requestId,body)=>{
 const response=await uploader(new Request('https://synthetic.invalid/isolated-paid-video-upload-v2/'+uploadId,{method,headers:{
  'x-chillywood-auth-session':actor.sessionId,'x-chillywood-request-id':requestId,'x-chillywood-native-configuration':mode,
  ...(method==='PUT'?{'content-type':'video/mp4','content-length':String(bytes.length)}:method==='POST'?{'content-type':'application/json'}:{})},
  ...(body?{body:method==='PUT'?body:JSON.stringify(body)}:{})}));return{code:response.status,...await response.json()};};
const count=table=>Number(q('select count(*) from sandbox_commerce_v1.'+table+';'));
const reserve=async()=>{const r=await author('upload.reserve',{title:'Normal creator sample',expectedSha256:sha,expectedByteLength:bytes.length});assert.equal(r.code,200,lastError);return r.data.upload;};
const publishPayload=u=>({uploadId:u.id,expectedRevision:1,amountMinor:99,currency:'usd'});
const enable=()=>q(`insert into sandbox_commerce_v1.paid_video_native_authoring_profiles values('${configuration}','${route}','${worker}','${verifier}',repeat('4',64),true);`);
let failure;
try{
 h.start('');q(fixtures);q(nativeStoreInstallProfile().sql);
 // A source extension is exercised as a forward transaction, never by changing
 // any of the 48 frozen baseline modules or their hashes.
 q('begin;'+extension+'commit;');
 assert.equal(count('paid_video_native_authoring_profiles'),0);assert.equal(count('paid_video_native_catalog_templates'),0);
 for(const role of ['anon','authenticated','service_role','sbx_v1_operator']){
  assert.equal(q(`select has_table_privilege('${role}','sandbox_commerce_v1.paid_video_native_catalog_templates','INSERT');`),'f');
  assert.equal(q(`select has_function_privilege('${role}','sandbox_commerce_v1.paid_video_native_command(text,jsonb,uuid,uuid)','EXECUTE');`),'f');
 }
 assert.equal(q("select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where relname in ('paid_video_native_authoring_profiles','paid_video_native_catalog_templates','paid_video_native_template_retirements','paid_video_native_publications');"),'t');
 cases.push('Forward module is empty/default-off with FORCE RLS and no application, service or operator generic writers.');
 q(`select authority_fixture.reset();insert into auth.users(id,email_confirmed_at,raw_app_meta_data) values('${BUYER}',clock_timestamp(),'{}');
 insert into auth.sessions values('${BUYER_SESSION}','${BUYER}',clock_timestamp()+interval '1 hour');
 insert into public.wave1_legal_acceptances select '${BUYER}','${BUYER_SESSION}',document_key,version,market,capability,'member',null from public.wave1_legal_document_versions where capability='account';
 update sandbox_commerce_v1.lifecycle set state='active';
 insert into sandbox_commerce_v1.paid_video_routes values('${route}','s3','synthetic-native-media',repeat('1',64),true);
 insert into sandbox_commerce_v1.paid_video_workers values('${worker}',decode('${workerKey.toString('hex')}','hex'),repeat('2',64),true);
 insert into sandbox_commerce_v1.paid_video_verifiers values('${verifier}',decode('${key.toString('hex')}','hex'),repeat('3',64),true);
 update sandbox_commerce_v1.paid_video_gateway_controls set enabled=true,route_id='${route}',worker_id='${worker}',verifier_id='${verifier}',qualification_sha256=repeat('4',64);`);
 assert.equal((await author('capability.read')).data.transferAvailable,false);enable();
 const cap=await author('capability.read');assert.equal(cap.data.transferAvailable,true,lastError);assert.equal(cap.data.checkoutAvailable,false);
 assert.equal(q('select ingress_enabled or provisioning_enabled or initiation_enabled from sandbox_commerce_v1.test_store_v3_controls;'),'f');
 actor={...actor,userId:BUYER,sessionId:BUYER_SESSION};assert.equal((await author('capability.read')).data.creatorEligible,false);
 assert.equal((await author('upload.reserve',{title:'No creator authority',expectedSha256:sha,expectedByteLength:bytes.length})).code,503);
 actor={...actor,userId:SELLER,sessionId:SELLER_SESSION};
 cases.push('Native authoring is independently admitted with V3 controls off; a free buyer cannot reserve creator content.');
 const upload=await reserve(),transferId=randomUUID();assert.equal((await author('upload.finalize',{uploadId:upload.id})).code,503);
 lostPut=true;assert.equal((await transfer('PUT',upload.id,transferId,bytes)).state,'unknown');
 await transfer('PUT',upload.id,transferId,bytes);await transfer('PUT',upload.id,randomUUID(),bytes);assert.equal(writes,1);
 const probe=await transfer('GET',upload.id,transferId);assert.equal(probe.code,200,lastError);assert.equal(count('paid_video_object_receipts'),0);
 const reconcile={protocol:'scpv-reconcile-v2',observationRaw:probe.observationRaw,signature:probe.signature};
 assert.equal((await transfer('POST',upload.id,transferId,{...reconcile,signature:'0'.repeat(64)})).code,503);
 assert.equal(count('paid_video_object_receipts'),0);assert.equal((await transfer('POST',upload.id,transferId,reconcile)).state,'recorded');
 assert.equal((await transfer('GET',upload.id,transferId)).state,'recorded');assert.equal(writes,1);
 assert.equal((await author('upload.finalize',{uploadId:upload.id})).data.upload.state,'scan_pending');
 assert.equal((await author('offer.publish',publishPayload(upload))).code,503);
 cases.push('Lost PUT never repeats; real verifier HMAC reconciliation is required, forged proof rejects, and object receipt does not invent scan/moderation.');
 const ticket=JSON.parse(q(service+`select public.isolated_paid_video_worker_v1('lease','${upload.id.slice(12)}','${worker}',null,null);`));
 const objectVersion=q(`select object_version from sandbox_commerce_v1.paid_video_uploads where id='${upload.id.slice(12)}';`);
 const scan={protocol:'scpv-byte-scan-v1',profile:'scpv-mp4-h264-aac-v1',sha256:sha,byteLength:bytes.length,checkedAt:new Date().toISOString(),
  definitions:{protocol:'scpv-definition-manifest-v1',files:[{filename:'daily.cvd',createdAt:new Date().toISOString()}],manifestSha256:'7'.repeat(64)},
  moderation:'unreviewed',verdict:'clean',reason:'exact_bytes_scanned',media:{durationMs:1000,width:320,height:180,framesPerSecond:24,videoCodec:'h264',pixelFormat:'yuv420p',audioCodec:null}};
 const signed=signScanResult({key:workerKey,ticketId:ticket.ticketId,uploadId:upload.id,incarnation:upload.incarnation,objectVersion,result:scan});
 q(service+`select public.isolated_paid_video_worker_v1('result',null,null,${sqlText(signed.raw)},${sqlText(signed.signature)});`);
 assert.equal((await author('offer.publish',publishPayload(upload))).code,503);
 // Dedicated operator in this disposable fixture only. Production reviewer
 // authority must use the separately reviewed operations-v2 installation.
 q(`set role sbx_v1_operator;select sandbox_commerce_v1.paid_video_moderate('${upload.id.slice(12)}','clear',repeat('8',64));`);
 let held=await author('offer.publish',publishPayload(upload));assert.equal(held.code,200,lastError);assert.equal(held.data.reason,'native_catalog_unavailable');
 const catalog=randomUUID(),appTemplate=randomUUID(),playTemplate=randomUUID();
 q(`insert into sandbox_commerce_v1.catalog values('${catalog}','paid_content','revenuecat','synthetic-native-project','APP_STORE','synthetic.ios',99,'usd');
 insert into sandbox_commerce_v1.paid_video_native_catalog_templates values
 ('${appTemplate}',1,'${catalog}','APP_STORE','synthetic-native-project','synthetic-ios-app','synthetic.ios',repeat('9',64),true),
 ('${playTemplate}',1,'${catalog}','PLAY_STORE','synthetic-native-project','synthetic-play-app','synthetic.play',repeat('a',64),true);`);
 for(const field of ['project_id','app_id','wire_product_id']){
  h.rejects(`insert into sandbox_commerce_v1.paid_video_native_catalog_templates(id,revision,catalog_id,store,project_id,app_id,wire_product_id,qualification_sha256)
   values('${randomUUID()}',1,'${catalog}','PLAY_STORE',${field==='project_id'?"U&'\\00A0project'":"'project'"},${field==='app_id'?"U&'app\\2000'":"'app'"},${field==='wire_product_id'?"U&'\\FEFFproduct'":"'product'"},repeat('b',64));`,/check constraint/u);
 }
 const duplicate=randomUUID();q(`insert into sandbox_commerce_v1.paid_video_native_catalog_templates select '${duplicate}',1,catalog_id,store,project_id,app_id,wire_product_id,qualification_sha256,true from sandbox_commerce_v1.paid_video_native_catalog_templates where id='${appTemplate}';`);
 held=await author('offer.publish',publishPayload(upload));assert.equal(held.data.reason,'native_catalog_unavailable');assert.equal(count('offers'),0);
 q(`insert into sandbox_commerce_v1.paid_video_native_template_retirements values('${duplicate}',1,'Synthetic duplicate retired');`);
 const privatePublish=(requestId=randomUUID())=>`public.isolated_paid_video_v2('offer.publish',${sqlJson({protocol:'isolated-paid-video-v1',requestId,...publishPayload(upload)})},'${SELLER}','${SELLER_SESSION}','${configuration}')`;
 // Missing Apple must not block an independently qualified Play offer. This
 // real publication is rolled back so the same draft can also prove dual-store.
 const playOnly=q(`begin;update sandbox_commerce_v1.paid_video_native_catalog_templates set enabled=false where id='${appTemplate}';`
  +subject()+`select ${privatePublish()};reset role;select jsonb_agg(store) from sandbox_commerce_v1.native_store_catalog_bindings;rollback;`).split('\n');
 assert.equal(JSON.parse(playOnly[0]).status,'ok');assert.deepEqual(JSON.parse(playOnly[1]),['PLAY_STORE']);assert.equal(count('offers'),0);
 for(const change of [
  `update sandbox_commerce_v1.paid_video_native_authoring_profiles set enabled=false;`,
  `update sandbox_commerce_v1.paid_video_verifiers set active=false where id='${verifier}';`,
  `update sandbox_commerce_v1.paid_video_uploads set daily_definitions_at=clock_timestamp()-interval '49 hours' where id='${upload.id.slice(12)}';`,
  `update sandbox_commerce_v1.paid_video_uploads set moderation='held' where id='${upload.id.slice(12)}';`,
 ])h.rejects('begin;'+change+subject()+`select ${privatePublish()};rollback;`,/paid_video_/u);
 assert.equal(count('offers'),0);
 const locked=await h.held(`begin;update sandbox_commerce_v1.paid_video_native_catalog_templates set enabled=false where id='${playTemplate}';`);
 assert.equal((await author('offer.publish',publishPayload(upload))).code,503);assert.equal(count('offers'),0);await locked.finish('rollback');
 const publishId=randomUUID(),published=await author('offer.publish',publishPayload(upload),publishId);assert.equal(published.code,200,lastError);
 assert.equal(published.data.offer.checkoutAvailable,false);assert.equal(count('offers'),1);assert.equal(count('native_store_catalog_bindings'),2);
 assert.equal(count('paid_video_native_publications'),2);assert.equal(count('catalog'),1);
 assert.equal((await author('offer.publish',publishPayload(upload),publishId)).data.offer.id,published.data.offer.id);assert.equal(count('native_store_catalog_bindings'),2);
 const recovery=await author('upload.recover',{originalRequestId:publishId});assert.equal(recovery.data.offer.id,published.data.offer.id);
 cases.push('Unapproved/ambiguous/Unicode-padded templates reject; Play-only works without Apple; stale scan/moderation/disabled controls reject; concurrent template mutation rolls back; one price anchor publishes exact dual-store bindings once and recovers.');
 actor={...actor,userId:BUYER,sessionId:BUYER_SESSION};
 const buyerRead=await author('offer.read',{offerId:published.data.offer.id});assert.equal(buyerRead.code,200);assert.equal(buyerRead.data.upload,undefined);
 assert.equal((await author('offer.retire',{offerId:published.data.offer.id,expectedRevision:1})).code,503);
 for(const store of ['APP_STORE','PLAY_STORE']){
  const quote=JSON.parse(q(service+`select public.native_store_sandbox_command_v1('${BUYER}','${BUYER_SESSION}','offer','${randomUUID()}',${sqlJson({offerId:published.data.offer.id,store})});`));
  assert.equal(quote.status,'ok');assert.equal(quote.data.quote.asset.id,upload.assetId);assert.equal(quote.data.quote.catalog.store,store);assert.equal(quote.dispatchAllowed,false);
 }
 assert.equal(count('intents'),0);assert.equal(count('receipts'),0);assert.equal(count('resource_grants'),0);
 cases.push('Ordinary buyer reads both actual native quotes without creator upload disclosure, retirement authority, dispatch, receipt or access grant.');
 actor={...actor,userId:SELLER,sessionId:SELLER_SESSION};
 seedV3Qualified(q,{seedAuthority:false});mode=V3_FIXTURE.configurationDigest;
 assert.equal((await author('capability.read')).data.transferAvailable,true);
 assert.equal((await author('offer.read',{offerId:published.data.offer.id})).code,503);
 const v3Upload=await reserve();mode=configuration;
 assert.equal((await transfer('PUT',v3Upload.id,randomUUID(),bytes)).code,503);assert.equal(writes,1);
 assert.equal((await author('upload.read',{uploadId:v3Upload.id})).code,503);
 q(`insert into sandbox_commerce_v1.test_store_v3_native_profiles select '${configuration}',connection_id,connection_revision,platform,application_id,public_sdk_key_sha256,storage_namespace,qualified,native_evidence_sha256,lifetime_evidence_sha256 from sandbox_commerce_v1.test_store_v3_native_profiles where configuration_digest='${V3_FIXTURE.configurationDigest}';`);
 assert.equal((await author('capability.read')).code,503);assert.equal(count('native_store_catalog_bindings'),2);
 cases.push('Original V3 branch still works; cross-mode upload/offer use and ambiguous native/V3 configuration reject without origin writes.');
 assert.equal(source('isolated-runtime/native-paid-video-authoring-v1/authoring.sql'),extension);
}catch(error){failure=error;h.captureFailure();}
finally{try{await h.close();}catch(error){console.error(JSON.stringify(h.diagnostics(failure,error)));throw error;}}
if(failure)throw failure;
console.log(JSON.stringify({protocol:'native-paid-video-authoring-source-proof-v1',passed:cases.length,cases,cleanup:h.cleanup,
 sourceSha256:createHash('sha256').update(extension).digest('hex'),realPostgres:true,realHttpHandlers:true,syntheticAuthStorageScanner:true,hostedQualified:false},null,2));
