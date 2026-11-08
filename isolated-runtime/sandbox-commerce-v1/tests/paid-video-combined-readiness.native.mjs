#!/usr/bin/env node
// Actual PostgreSQL + production gateway code. Auth, native/provider admission
// and object transport are explicitly synthetic here; the HTTP/Auth profile is
// separate. No production target, credential or provider is contacted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import * as objectSource from '../../../ops/isolated-paid-video-worker/private-object.mjs';
import * as brokerSource from '../../../ops/isolated-paid-video-worker/upload-broker.mjs';
import { createTestStoreCluster, fileHash } from './test-store.fixture.mjs';
import { seedV3Qualified, createV3CommandApi, V3_FIXTURE, SELLER, SELLER_SESSION, BUYER, BUYER_SESSION, sqlText, sqlJson } from './test-store-v3.fixture.mjs';
import { createV3ProviderFixture } from './test-store-v3-provider.fixture.mjs';
import { createV3ReceiptFixture, receiptSources } from './test-store-v3-receipts.fixture.mjs';
import { signScanResult } from '../../../ops/isolated-paid-video-worker/scan.mjs';

assert.equal(process.argv[2], '--local-bin'); assert.equal(process.argv[4], '--v2-reference');
const bin = process.argv[3], reference = process.argv[5]; assert.ok(path.isAbsolute(bin) && path.isAbsolute(reference));
const here = path.dirname(fileURLToPath(import.meta.url)), runtime = path.dirname(here), repo = path.resolve(here, '../../..');
const retained = new Map(), hashes = {}, keep = (file, name = path.relative(repo, file)) => {
  const value = fs.readFileSync(file, 'utf8'); retained.set(file, fileHash(file)); hashes[name] = fileHash(file); return value;
};
const manifest = JSON.parse(fs.readFileSync(path.join(reference, 'manifest.json')));
for (const [name, hash] of Object.entries(manifest.files)) assert.equal(fileHash(path.join(reference, name)), hash);
const frozen = name => keep(path.join(reference, 'isolated-runtime/sandbox-commerce-v1', name), 'frozen/' + name);
const local = name => keep(path.join(runtime, name));
const declaration = 'create table sandbox_commerce_v1.declarations(user_id uuid primary key,session_id uuid,\n declared_18_plus boolean,country_code text,region_code text,declaration_version text,updated_at timestamptz);';
const authority = keep(path.join(here, 'authority.fixture.sql')); assert.equal(authority.split(declaration).length, 2);
const baseline = ['premium-authority.sql','authority.sql','commands.sql','receipts.sql','test-store.sql','test-store-offerings-core.sql',
  'test-store-qualification.sql','test-store-offerings-provisioning.sql','test-store-offerings-commands.sql','test-store-offerings-receipts.sql','history.sql','resource-graphs.sql','delivery-authority.sql'];
const current = ['paid-video-install-context-v2.sql','paid-video-install-grant-v2.sql','paid-video-media.sql','paid-video-upload.sql','paid-video-commands.sql',
  'paid-video-install-revoke-v2.sql','test-store-paid-video-core.sql','candidates/paid-video-plan-lifecycle/lifecycle.sql','candidates/paid-video-combined-readiness/commands.sql','candidates/paid-video-checkout-recovery/abandon.sql','candidates/paid-video-combined-readiness/provisioning.sql','test-store-paid-video-receipts.sql',
  'paid-video-install-grant-v2.sql','paid-video-access.sql','candidates/paid-video-combined-readiness/gateway.sql','candidates/paid-video-combined-readiness/media.sql','paid-video-install-revoke-v2.sql'];
const install = 'begin;create role anon nologin;create role authenticated nologin;create role service_role nologin;'
  + 'alter default privileges for role postgres grant execute on functions to authenticated;'
  + frozen('core.sql') + keep(path.join(here,'premium-authority.fixture.sql')) + authority.replace(declaration,'-- Real core declarations.')
  + 'create table public.channel_audience_blocks(channel_user_id text,blocked_user_id text);'
  + baseline.map(frozen).join('\n') + current.map(local).join('\n') + frozen('permissions-finalize.sql') + 'commit;';
const ts = createRequire(import.meta.url)('typescript'), cache = new Map();
const imports = new Map([[path.join(repo,'ops/isolated-paid-video-worker/private-object.mjs'),objectSource],
  [path.join(repo,'ops/isolated-paid-video-worker/upload-broker.mjs'),brokerSource]]);
const load = file => {
  if (imports.has(file)) return imports.get(file); if (cache.has(file)) return cache.get(file);
  const source = keep(file), exports = {}; cache.set(file,exports);
  if (file.endsWith('.json')) { exports.default=JSON.parse(source); return exports; }
  const compiled=ts.transpileModule(source,{reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  assert.deepEqual(compiled.diagnostics,[]);
  new Function('exports','require',compiled.outputText)(exports,name=>{assert.ok(name.startsWith('.'));return load(path.resolve(path.dirname(file),name));}); return exports;
};
const shared = name => load(path.join(repo,'supabase/functions/_shared',name));
const boundary=shared('isolated-paid-video-boundary.ts'), contract=shared('isolated-paid-video-contract.ts');
const { createPaidVideoAuthoringHandler }=shared('isolated-paid-video-authoring.ts');
const { createPaidVideoUploadHandler }=shared('isolated-paid-video-upload.ts');
const { createPaidVideoRangeHandler }=shared('isolated-paid-video-range.ts');
const h=createTestStoreCluster(bin), q=h.q, cases=[], captures=[];
const api=createV3CommandApi(q), provider=createV3ProviderFixture(q,repo,load), receipts=createV3ReceiptFixture(q,api,repo);
for(const file of receiptSources(repo))keep(file);
for(const file of ['test-store-v3.fixture.mjs','test-store-v3-provider.fixture.mjs','test-store-v3-receipts.fixture.mjs','paid-video-combined-readiness.native.mjs'])keep(path.join(here,file));
for(const file of ['private-object.mjs','upload-broker.mjs','scan.mjs'])keep(path.join(repo,'ops/isolated-paid-video-worker',file));
const service="set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}';";
const subject=(user=SELLER,sid=SELLER_SESSION)=>`set role authenticated;set request.jwt.claims=${sqlText(JSON.stringify({role:'authenticated',sub:user,session_id:sid}))};`;
let actor={userId:SELLER,sessionId:SELLER_SESSION,expiresAtMs:Date.now()+3600000}, lostPut=false, stored=null, originWrites=0, originReads=0, afterOrigin=null, lastRpcError=null;
let transferConfiguration=V3_FIXTURE.configurationDigest;
const auth=async()=>({actor:{...actor},authorization:'Bearer synthetic-local-fixture'});
const route=randomUUID(), verifier=randomUUID(), worker=randomUUID(), key=randomBytes(32), workerKey=randomBytes(32);
const bytes=Buffer.alloc(4096,7), sha=createHash('sha256').update(bytes).digest('hex');
const rpc=async(name,parameters,authorization)=> {
  const prefix=authorization?subject(actor.userId,actor.sessionId):service;
  const args=Object.entries(parameters).map(([k,v])=>`${k}=>${v===null?'null':typeof v==='object'?sqlJson(v):sqlText(v)}`).join(',');
  try { const result=JSON.parse(q(prefix+`select public.${name}(${args});`));lastRpcError=null;return result; }
  catch(error){lastRpcError=error.message;throw error;}
};
const transport={
  async writeOnce(binding,body){originWrites++;assert.equal(binding.provider,'s3');assert.equal(binding.routeId,route);assert.deepEqual(body,bytes);
    if(stored)return{state:'exists_unverified'};stored={bytes:new Uint8Array(body),objectVersion:'fixture-version-1'};return{state:lostPut?'unknown':'acknowledged',...(lostPut?{}:{objectVersion:stored.objectVersion})};},
  async readForScan(binding){originReads++;assert.equal(binding.expectedSha256,sha);assert.ok(stored);if(afterOrigin)afterOrigin();return structuredClone(stored);},
};
const authoring=createPaidVideoAuthoringHandler({authenticate:auth,rpc});
const upload=createPaidVideoUploadHandler({authenticate:auth,rpc,transport,verifier:{id:verifier,key}});
const author=async(command,payload={},requestId=randomUUID(),extra={})=>{
  const input={protocol:'isolated-paid-video-v2',command,requestId,expectedSessionId:actor.sessionId,configurationDigest:V3_FIXTURE.configurationDigest,payload,...extra};
  const response=await authoring(new Request('https://fixture.invalid/isolated-paid-video-authoring-v2',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}));
  const result=await response.json(); if(response.status===200){assert.ok(contract.validPaidVideoV2Result(result));captures.push({input,result});}return{status:response.status,result};
};
const transfer=async(method,id,requestId,body,extra={})=>{
  const headers={'x-chillywood-auth-session':actor.sessionId,'x-chillywood-request-id':requestId,'x-chillywood-native-configuration':transferConfiguration,
    ...(method==='PUT'?{'content-type':'video/mp4','content-length':String(bytes.length)}:method==='POST'?{'content-type':'application/json'}:{}),...extra};
  const response=await upload(new Request('https://fixture.invalid/isolated-paid-video-upload-v2/'+id,{method,headers,...(body?{body:method==='PUT'?body:JSON.stringify(body)}:{})}));
  const result=await response.json();captures.push({kind:'upload',method,uploadId:id,requestId,status:response.status,result});
  return{status:response.status,result};
};
let report, failure;
try {
  h.start('');
  const lastRevoke=local('paid-video-install-revoke-v2.sql'),revokeOffset=install.lastIndexOf(lastRevoke);assert.ok(revokeOffset>0);
  h.rejects(install.slice(0,revokeOffset)+install.slice(revokeOffset+lastRevoke.length),/paid_video_install_finalization_required/u);
  assert.equal(q("select to_regnamespace('sandbox_commerce_v1') is null;"),'t');
  assert.equal(q("select count(*) from pg_roles where rolname='sbx_v1_core_owner';"),'0');
  q(install);seedV3Qualified(q);
  assert.equal(q("select has_schema_privilege('sbx_v1_core_owner','public','CREATE');"),'f');
  cases.push('Omitting final CREATE revoke aborts COMMIT and rolls back fresh schema/roles; complete install leaves no public CREATE privilege.');
  const disabled=await author('capability.read');assert.equal(disabled.status,200,JSON.stringify(disabled));assert.equal(disabled.result.data.transferAvailable,false);
  assert.equal((await author('upload.reserve',{title:'Video',expectedSha256:sha,expectedByteLength:bytes.length})).result.status,'unknown');
  cases.push('Inactive gateway controls prevent reservation and advertise false despite synthetic native/provider qualification.');
  q(`insert into sandbox_commerce_v1.paid_video_routes values('${route}','s3','synthetic-private-media','${'1'.repeat(64)}',true);
    insert into sandbox_commerce_v1.paid_video_workers values('${worker}',decode('${workerKey.toString('hex')}','hex'),'${'2'.repeat(64)}',true);
    insert into sandbox_commerce_v1.paid_video_verifiers values('${verifier}',decode('${key.toString('hex')}','hex'),'${'3'.repeat(64)}',true);
    update sandbox_commerce_v1.paid_video_gateway_controls set enabled=true,route_id='${route}',worker_id='${worker}',verifier_id='${verifier}',qualification_sha256='${'4'.repeat(64)}';`);
  const capability=await author('capability.read');assert.equal(capability.result.data.transferAvailable,true);
  assert.equal((await author('capability.read',{},randomUUID(),{configurationDigest:'0'.repeat(64)})).result.data.transferAvailable,false);
  actor={...actor,userId:BUYER,sessionId:BUYER_SESSION};assert.equal((await author('capability.read')).result.data.creatorEligible,false);
  assert.equal((await author('upload.reserve',{title:'Free buyer',expectedSha256:sha,expectedByteLength:bytes.length})).status,503);
  actor={...actor,userId:SELLER,sessionId:SELLER_SESSION};cases.push('Exact native profile and current creator determine positive capability; free buyer cannot author.');
  const requestId=randomUUID(), payload={title:'Gateway immutable video',expectedSha256:sha,expectedByteLength:bytes.length};
  const reserved=(await author('upload.reserve',payload,requestId)).result.data.upload, transferId=randomUUID();
  assert.equal(reserved.transferAvailable,true);assert.equal((await author('upload.recover',{originalRequestId:requestId})).result.data.upload.id,reserved.id);
  const recovery=(await author('upload.recover',{originalRequestId:requestId})).result.data.recovery;
  assert.equal(recovery.originalConfigurationDigest,V3_FIXTURE.configurationDigest);
  assert.deepEqual(recovery.originalPayload,{protocol:'isolated-paid-video-v1',requestId,...payload});
  assert.equal((await author('upload.reserve',payload,requestId,{configurationDigest:'0'.repeat(64)})).status,503);
  q("update sandbox_commerce_v1.lifecycle set state='retired';");
  assert.equal((await author('capability.read')).result.data.checkoutAvailable,false);
  assert.equal((await author('upload.read',{uploadId:reserved.id})).result.data.upload.transferAvailable,false);
  assert.equal((await author('upload.read',{uploadId:reserved.id})).result.data.transfer,null);
  q("update sandbox_commerce_v1.lifecycle set state='active';update public.user_entitlements set status='revoked';");
  assert.equal((await author('upload.read',{uploadId:reserved.id})).result.data.upload.transferAvailable,false);
  q(`select premium_fixture.reset('${SELLER}');`);
  h.rejects(subject()+`select public.isolated_paid_video_v2('upload.finalize',${sqlJson({protocol:'isolated-paid-video-v1',requestId:randomUUID(),uploadId:reserved.id})},'${BUYER}','${BUYER_SESSION}',${sqlText(V3_FIXTURE.configurationDigest)});`,/paid_video_actor_binding_invalid/u);
  cases.push('Retired generation and revoked creator suppress actionable capabilities; direct authenticated RPC actor spoof is rejected at wrapper entry.');
  const denied=await author('upload.finalize',{uploadId:reserved.id});assert.equal(denied.status,503);
  assert.equal(q(`select state from sandbox_commerce_v1.paid_video_uploads where id='${reserved.id.slice(12)}';`),'reserved');
  for(const role of ['authenticated','service_role']) {
    h.rejects(`set role ${role};select public.isolated_paid_video_v1('capability.read','{}',null,null);`,/permission denied/u);
    h.rejects(`set role ${role};select public.isolated_paid_video_upload_v1('issue',null,null,null,null,null);`,/permission denied/u);
    h.rejects(`set role ${role};select public.isolated_paid_video_access_v3(null,null,null,null);`,/permission denied/u);
  }
  cases.push('Old v1 authoring/upload and v3 access public bypasses revoked for authenticated and service roles; no finalize before object receipt.');
  lostPut=true;const put=await transfer('PUT',reserved.id,transferId,bytes);assert.equal(put.result.state,'unknown');assert.equal(originWrites,1);
  assert.equal((await transfer('PUT',reserved.id,transferId,bytes)).result.state,'unknown');assert.equal(originWrites,1);
  assert.equal((await transfer('PUT',reserved.id,randomUUID(),bytes)).status,503);assert.equal(originWrites,1);
  assert.equal((await author('upload.read',{uploadId:reserved.id})).result.data.upload.transferAvailable,false);
  cases.push('Unknown PUT is never resent; same ID and new ID both cannot issue a second origin write.');
  assert.deepEqual((await author('upload.read',{uploadId:reserved.id})).result.data.transfer,
    {requestId:transferId,originalSessionId:SELLER_SESSION,configurationDigest:V3_FIXTURE.configurationDigest});
  const probe=await transfer('GET',reserved.id,transferId);assert.equal(probe.status,200);assert.equal(probe.result.state,'observed');
  assert.equal(q('select count(*) from sandbox_commerce_v1.paid_video_object_receipts;'),'0');
  assert.equal(q(`select state from sandbox_commerce_v1.paid_video_uploads where id='${reserved.id.slice(12)}';`),'reserved');
  assert.equal(createHmac('sha256',key).update(probe.result.observationRaw).digest('hex'),probe.result.signature);
  assert.ok(!/objectKey|bucket|secret|https?:\/\//u.test(JSON.stringify(probe.result)));
  transferConfiguration='9'.repeat(64);
  q(`insert into sandbox_commerce_v1.test_store_v3_native_profiles
   select '${transferConfiguration}',connection_id,connection_revision,'android','fixture.second.v3.profile',public_sdk_key_sha256,
    'fixture-second-v3-storage',qualified,native_evidence_sha256,lifetime_evidence_sha256 from sandbox_commerce_v1.test_store_v3_native_profiles
    where configuration_digest='${V3_FIXTURE.configurationDigest}';`);
  assert.equal((await transfer('PUT',reserved.id,transferId,bytes)).status,503);assert.equal(originWrites,1);
  const newProfileProbe=await transfer('GET',reserved.id,transferId);assert.equal(newProfileProbe.status,200);
  const observed=JSON.parse(newProfileProbe.result.observationRaw);
  assert.equal(observed.configurationDigest,transferConfiguration);assert.equal(observed.originalConfigurationDigest,V3_FIXTURE.configurationDigest);
  const reconcile={protocol:'scpv-reconcile-v2',observationRaw:newProfileProbe.result.observationRaw,signature:newProfileProbe.result.signature};
  assert.equal((await transfer('POST',reserved.id,transferId,{...reconcile,signature:'0'.repeat(64)})).status,503);
  const wrong=JSON.parse(reconcile.observationRaw);wrong.incarnation=randomUUID();
  const wrongRaw=JSON.stringify(wrong),signedWrong=createHmac('sha256',key).update(wrongRaw).digest('hex');
  assert.equal((await transfer('POST',reserved.id,transferId,{...reconcile,observationRaw:wrongRaw,signature:signedWrong})).status,503);
  const record=await transfer('POST',reserved.id,transferId,reconcile);assert.equal(record.result.state,'recorded');
  assert.equal(record.result.originalConfigurationDigest,V3_FIXTURE.configurationDigest);
  assert.deepEqual((await transfer('POST',reserved.id,transferId,reconcile)).result,record.result);
  const reads=originReads;assert.deepEqual((await transfer('GET',reserved.id,transferId)).result,record.result);assert.equal(originReads,reads);
  cases.push('Read-only full-byte probe preserves original transfer/configuration under another qualified recovery profile; changed-profile PUT blocked; HMAC forgery/incarnation rejected; explicit reconcile durable and idempotent; GET reads receipt without origin.');
  assert.equal((await author('upload.finalize',{uploadId:reserved.id})).result.data.upload.state,'scan_pending');
  assert.equal((await author('offer.publish',{uploadId:reserved.id,expectedRevision:1,amountMinor:199,currency:'usd'})).status,503);
  cases.push('Receipt permits scan_pending only; no scan or moderation is invented and publication remains rejected.');
  const ticket=JSON.parse(q(service+`select public.isolated_paid_video_worker_v1('lease','${reserved.id.slice(12)}','${worker}',null,null);`));
  const scan={protocol:'scpv-byte-scan-v1',profile:'scpv-mp4-h264-aac-v1',sha256:sha,byteLength:bytes.length,checkedAt:new Date().toISOString(),
    definitions:{protocol:'scpv-definition-manifest-v1',files:[{filename:'daily.cvd',createdAt:new Date().toISOString()}],manifestSha256:'7'.repeat(64)},
    moderation:'unreviewed',verdict:'clean',reason:'exact_bytes_scanned',media:{durationMs:1000,width:320,height:180,framesPerSecond:24,videoCodec:'h264',pixelFormat:'yuv420p',audioCodec:null}};
  // Synthetic scanner evidence exercises version binding; actual scanner
  // qualification is separately frozen and is not claimed by this fixture.
  const signed=signScanResult({key:workerKey,ticketId:ticket.ticketId,uploadId:reserved.id,incarnation:reserved.incarnation,objectVersion:'fixture-version-1',result:scan});
  q(service+`select public.isolated_paid_video_worker_v1('result',null,null,${sqlText(signed.raw)},${sqlText(signed.signature)});`);
  q(`set role sbx_v1_operator;select sandbox_commerce_v1.paid_video_moderate('${reserved.id.slice(12)}','clear','${'8'.repeat(64)}');`);
  q(`update sandbox_commerce_v1.paid_video_uploads set object_version='wrong-version' where id='${reserved.id.slice(12)}';`);
  assert.equal((await author('offer.publish',{uploadId:reserved.id,expectedRevision:1,amountMinor:199,currency:'usd'})).status,503);
  q(`update sandbox_commerce_v1.paid_video_uploads set object_version='fixture-version-1' where id='${reserved.id.slice(12)}';`);
  const published=await author('offer.publish',{uploadId:reserved.id,expectedRevision:1,amountMinor:199,currency:'usd'});
  assert.equal(published.status,200,JSON.stringify({published,lastRpcError}));const offer=published.result.data.offer;
  assert.equal(offer.checkoutAvailable,true);
  assert.equal((await author('resource.read',{resourceId:reserved.resourceId})).result.data.offer.id,offer.id);
  cases.push('Synthetic signed scanner/moderation plus exact received version permits atomic publication; version mismatch denies; owner discovers offer from resource after restart.');
  const checkout=(command,payload)=>JSON.parse(q(service+`select public.isolated_paid_video_checkout_v3('${BUYER}','${BUYER_SESSION}',${sqlText(command)},'${randomUUID()}',${sqlText(V3_FIXTURE.configurationDigest)},${sqlJson(payload)});`));
  const offered=checkout('offer',{offerId:offer.id});assert.equal(offered.data.preparationAllowed,true);
  const quote=offered.data.quote;
  q('update sandbox_commerce_v1.paid_video_gateway_controls set enabled=false;');
  assert.equal(checkout('offer',{offerId:offer.id}).data.preparationAllowed,false);
  assert.throws(()=>checkout('prepare',{offerId:offer.id,expectedQuote:quote}),/paid_video_verified_media_required/u);
  q('update sandbox_commerce_v1.paid_video_gateway_controls set enabled=true;');
  q(`update sandbox_commerce_v1.paid_video_verifiers set active=false where id='${verifier}';`);
  assert.equal(checkout('offer',{offerId:offer.id}).data.preparationAllowed,false);
  assert.throws(()=>checkout('prepare',{offerId:offer.id,expectedQuote:quote}),/paid_video_verified_media_required/u);
  q(`update sandbox_commerce_v1.paid_video_verifiers set active=true where id='${verifier}';`);
  cases.push('Combined readiness and preparation require the same enabled gateway and current receipt verifier as range access.');
  const intent=checkout('prepare',{offerId:offer.id,expectedQuote:quote}).data.intent;
  const customer=api.call('bind',{installationId:randomUUID()}).result.customer;
  const allocation=api.call('allocate',{customerBindingId:customer.id,intentId:intent.id,expectedQuote:quote}).result.allocation;
  await provider.registerPlan(allocation);
  const prepared=api.call('read',{intentId:intent.id}).result;
  assert.equal(api.call('claim',{intentId:intent.id,dispatchId:prepared.allocation.dispatchId,registrationId:prepared.allocation.registration.id,expectedQuote:quote}).result.dispatchAllowed,true);
  const event=receipts.event({customer:prepared.customer,allocation:prepared.allocation}),ingress=await receipts.ingest(event);
  const receiptId=receipts.effect(ingress.receiptId).projection.receiptId;
  const grantId='scv1_grant_'+q(`select id from sandbox_commerce_v1.resource_grants where receipt_id='${receiptId}';`);
  actor={...actor,userId:BUYER,sessionId:BUYER_SESSION};let rangeReads=0,postReadHold=false;
  const range=createPaidVideoRangeHandler({authenticate:auth,rpc,transport:{async readRange(binding,range){rangeReads++;assert.equal(binding.objectVersion,'fixture-version-1');
    if(postReadHold)q('update sandbox_commerce_v1.test_store_v3_controls set initiation_enabled=false,ingress_enabled=false;');return bytes.subarray(range.start,range.end+1);}}});
  const play=(rangeHeader='bytes=20-119')=>range(new Request('https://fixture.invalid/isolated-paid-video-range-v1/'+reserved.resourceId+'/'+grantId,
    {headers:{'x-chillywood-auth-session':BUYER_SESSION,range:rangeHeader}}));
  const played=await play('bytes=0-0');assert.equal(played.status,206);assert.deepEqual(Buffer.from(await played.arrayBuffer()),bytes.subarray(0,1));
  assert.equal(played.headers.get('x-chillywood-media-protocol'),'scpv-range-metadata-v2');
  assert.equal(played.headers.get('x-chillywood-asset-id'),reserved.assetId);assert.equal(played.headers.get('x-chillywood-incarnation'),reserved.incarnation);
  assert.equal(played.headers.get('x-chillywood-sha256'),sha);assert.equal(played.headers.get('x-chillywood-resource-revision'),'1');
  assert.ok(Number(played.headers.get('x-chillywood-authorized-until-ms'))>Date.now());
  captures.push({kind:'range',status:played.status,resourceId:reserved.resourceId,grantId,headers:Object.fromEntries(played.headers)});
  h.rejects(service+`select sandbox_commerce_v1.authorize_resource_delivery('${BUYER}','${BUYER_SESSION}','${reserved.resourceId.slice(14)}',1,'${reserved.resourceId.slice(14)}',1,'play_video');`,/permission denied/u);
  assert.equal(q("select has_function_privilege('service_role','sandbox_commerce_v1.authorize_resource_delivery(uuid,uuid,uuid,bigint,uuid,bigint,text)','EXECUTE');"),'f');
  assert.equal(q("select has_function_privilege('sbx_v1_core_owner','sandbox_commerce_v1.authorize_resource_delivery(uuid,uuid,uuid,bigint,uuid,bigint,text)','EXECUTE');"),'t');
  assert.equal(q("select to_regprocedure('public.authorize_resource_delivery(uuid,uuid,uuid,bigint,uuid,bigint,text)') is null;"),'t');
  postReadHold=true;const held=await play();assert.notEqual(held.status,206);assert.equal(held.headers.get('content-type'),'application/json');assert.equal(rangeReads,2);
  postReadHold=false;q('update sandbox_commerce_v1.test_store_v3_controls set initiation_enabled=true,ingress_enabled=true;');
  const cancelled=await receipts.ingest({...event,id:randomUUID(),type:'CANCELLATION',cancel_reason:'CUSTOMER_SUPPORT',price_in_purchased_currency:-1.99,event_timestamp_ms:event.event_timestamp_ms+10});
  assert.equal(receipts.effect(cancelled.receiptId).projection.state,'refunded');assert.notEqual((await play()).status,206);assert.equal(rangeReads,2);
  assert.equal(q(`select count(*) from public.user_entitlements where user_id='${BUYER}';`),'0');
  cases.push('Actual SQL raw-effect receipt→grant→v2 receipt-aware current access drives range handler; generic graph remains private with core-owner reuse; post-origin provider control loss releases no bytes; refund denies before origin; buyer remains free.');
  actor={...actor,userId:SELLER,sessionId:SELLER_SESSION};
  // A second independent reservation qualifies post-I/O authority loss and byte mismatch.
  const second=(await author('upload.reserve',{...payload,title:'Post-check video'})).result.data.upload, secondRequest=randomUUID();stored=null;
  await transfer('PUT',second.id,secondRequest,bytes);
  afterOrigin=()=>q('update sandbox_commerce_v1.paid_video_gateway_controls set enabled=false;');
  assert.equal((await transfer('GET',second.id,secondRequest)).status,503);afterOrigin=null;
  q('update sandbox_commerce_v1.paid_video_gateway_controls set enabled=true;');stored.bytes[0]^=1;
  assert.equal((await transfer('GET',second.id,secondRequest)).status,503);
  assert.equal(q('select count(*) from sandbox_commerce_v1.paid_video_object_receipts;'),'1');
  cases.push('Post-origin route/control loss and mismatched actual bytes suppress signed proof and receipt.');
  const count=q('select count(*) from sandbox_commerce_v1.paid_video_requests;');
  assert.equal((await author('upload.reserve',{...payload,url:'https://client.invalid'})).status,400);
  assert.equal((await author('capability.read',{},randomUUID(),{expectedSessionId:randomUUID()})).status,401);
  assert.equal(q('select count(*) from sandbox_commerce_v1.paid_video_requests;'),count);
  assert.throws(()=>boundary.strictPaidVideoJson('{"a":1,"a":2}'),/duplicate/u);
  cases.push('Strict unknown-key/duplicate JSON and exact current-session rejection happen before SQL mutations.');
  const schema=JSON.parse(keep(path.join(runtime,'paid-video-contract-v2.json'))),Ajv=createRequire(import.meta.url)('ajv');
  const ajv=new Ajv({allErrors:true}),validate=ajv.compile(schema);
  const shapes=Object.fromEntries(['transferResponse','probeResponse','objectReceipt'].map(name=>[name,ajv.compile({...schema,oneOf:undefined,$ref:'#/definitions/'+name})]));
  for(const capture of captures){
    if(capture.kind==='range')continue;
    if(capture.kind!=='upload')assert.ok(validate(capture.result),JSON.stringify(validate.errors));
    else if(capture.status===200){const key=capture.result.protocol==='scpv-transfer-v2'?'transferResponse':capture.result.protocol==='scpv-upload-probe-v2'?'probeResponse':'objectReceipt';
      assert.ok(shapes[key](capture.result),JSON.stringify(shapes[key].errors));}
  }
  cases.push('Every actual SQL/handler authoring and successful transfer/probe/receipt capture matches the separate generated v2 machine schema.');
  for(const[file,hash]of retained)assert.equal(fileHash(file),hash,'source changed during run');
  report={protocol:'scpv-combined-readiness-native-proof-v2',status:'passed',cases,captures,sourceHashes:hashes,
    limitations:['Actual PostgreSQL and gateway source; Auth fixture is synthetic.','Native/provider/storage admission and scanner result synthetic; no provider or scanner qualification.','This fixture does not qualify malware scanner, actual native device, cloud route or production.']};
} catch (error) { failure=error;h.captureFailure(); }
finally { try { await h.close(); } catch(error) { console.error(JSON.stringify(h.diagnostics(failure,error))); throw error; } }
if(failure)throw failure;
assert.ok(report);report.cleanup=h.cleanup;console.log(JSON.stringify(report,null,2));
