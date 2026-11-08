#!/usr/bin/env node
// Separate checkout recovery/readiness candidate: actual local SQL and source Edge crypto/provider worker. Every provider API,
// route, key and catalog qualification is synthetic. No remote adapter exists.
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createTestStoreCluster, fileHash } from './test-store.fixture.mjs';
import { createV3SourceLoader, seedV3Qualified, createV3CommandApi, legacyAuthoritySnapshot, V3_FIXTURE, BUYER, BUYER_SESSION, SELLER, SELLER_SESSION, sqlText, sqlJson, syntheticHash } from './test-store-v3.fixture.mjs';
import { createV3ProviderFixture, providerSources } from './test-store-v3-provider.fixture.mjs';
import { createV3ReceiptFixture, receiptSources } from './test-store-v3-receipts.fixture.mjs';
import { signScanResult } from '../../../ops/isolated-paid-video-worker/scan.mjs';
import { runBounded } from '../../../ops/isolated-paid-video-worker/scan.mjs';
import { executeScanTicket } from '../../../ops/isolated-paid-video-worker/job.mjs';

assert.equal(process.argv[2], '--local-bin'); assert.equal(process.argv[4], '--v2-reference');
const bin = process.argv[3], reference = process.argv[5];
const actualScanner = process.argv[6] === '--database';
const databaseDirectory = actualScanner ? process.argv[7] : null, certificateDirectory = actualScanner ? process.argv[9] : null;
if(actualScanner) { assert.equal(process.argv[8],'--certificates'); assert.ok(path.isAbsolute(databaseDirectory) && path.isAbsolute(certificateDirectory)); }
assert.ok(path.isAbsolute(bin) && path.isAbsolute(reference));
const here = path.dirname(fileURLToPath(import.meta.url)), runtime = path.dirname(here), repo = path.resolve(here, '../../..');
const manifest = JSON.parse(fs.readFileSync(path.join(reference, 'manifest.json')));
const sources = new Map(), sourceHashes = {};
const retain = (file, key) => { const value = fs.readFileSync(file, 'utf8'); sources.set(file, fileHash(file)); sourceHashes[key] = fileHash(file); return value; };
for (const [name, hash] of Object.entries(manifest.files)) assert.equal(fileHash(path.join(reference, name)), hash);
const frozen = name => retain(path.join(reference, 'isolated-runtime/sandbox-commerce-v1', name), 'frozen/' + name);
const local = name => retain(path.join(runtime, name), name);
const declaration = 'create table sandbox_commerce_v1.declarations(user_id uuid primary key,session_id uuid,\n declared_18_plus boolean,country_code text,region_code text,declaration_version text,updated_at timestamptz);';
const authority = retain(path.join(here, 'authority.fixture.sql'), 'tests/authority.fixture.sql');
assert.equal(authority.split(declaration).length, 2);
const baseline = ['premium-authority.sql','authority.sql','commands.sql','receipts.sql','test-store.sql',
 'test-store-offerings-core.sql','test-store-qualification.sql','test-store-offerings-provisioning.sql',
 'test-store-offerings-commands.sql','test-store-offerings-receipts.sql','history.sql','resource-graphs.sql','delivery-authority.sql'];
const newSql = ['paid-video-media.sql','paid-video-upload.sql','paid-video-commands.sql','test-store-paid-video-core.sql',
 'candidates/paid-video-plan-lifecycle/lifecycle.sql','candidates/paid-video-checkout-recovery/commands.sql','candidates/paid-video-checkout-recovery/abandon.sql','candidates/paid-video-plan-lifecycle/provisioning.sql','test-store-paid-video-receipts.sql','paid-video-access.sql'];
const install = 'begin;create role anon nologin;create role authenticated nologin;create role service_role nologin;'
 + 'alter default privileges for role postgres grant execute on functions to authenticated;'
 + frozen('core.sql') + retain(path.join(here, 'premium-authority.fixture.sql'), 'tests/premium-authority.fixture.sql')
 + authority.replace(declaration, '-- Real unchanged core declarations table.')
 + 'create table public.channel_audience_blocks(channel_user_id text,blocked_user_id text);' + baseline.map(frozen).join('\n')
 + newSql.map(local).join('\n') + frozen('permissions-finalize.sql') + 'commit;';
const edgeSources = [...new Set([...providerSources(repo), ...receiptSources(repo),
 path.join(repo, 'supabase/functions/_shared/isolated-test-store-v3-command.ts')])];
for (const file of [...edgeSources, ...['test-store-v3-checkout-recovery.native.mjs','test-store-v3-lifecycle.native.mjs','test-store-v3.native.mjs','test-store-v3.fixture.mjs','test-store-v3-provider.fixture.mjs',
 'test-store-v3-receipts.fixture.mjs','test-store.fixture.mjs','receipts.fixture.mjs'].map(name => path.join(here,name)),
 path.join(repo,'ops/isolated-paid-video-worker/scan.mjs'),path.join(repo,'ops/isolated-paid-video-worker/job.mjs')]) retain(file, path.relative(repo,file));
const h = createTestStoreCluster(bin), q = h.q, api = createV3CommandApi(q), load = createV3SourceLoader(edgeSources);
const provider = createV3ProviderFixture(q,repo,load), receipts = createV3ReceiptFixture(q,api,repo), cases = [], captures = [];
const commandContract=load(path.join(repo,'supabase/functions/_shared/isolated-test-store-v3-command.ts')), sqlCommand=api.call;
api.call=(command,payload,requestId=randomUUID(),actor={userId:BUYER,sessionId:BUYER_SESSION},configurationDigest=V3_FIXTURE.configurationDigest)=>{
 const response=sqlCommand(command,payload,requestId,actor,configurationDigest);
 const input={actor,request:{protocol:'isolated-test-store-v3',command,payload,requestId,expectedSessionId:actor.sessionId,configurationDigest}};
 commandContract.validateTestStoreV3CommandResult(response,input,Date.now()); captures.push({kind:'command',input,result:response}); return response;
};
const actor = (user=SELLER, session=SELLER_SESSION) => `set role authenticated;set request.jwt.claims=${sqlText(JSON.stringify({role:'authenticated',sub:user,session_id:session}))};`;
const service = expression => JSON.parse(q(api.servicePrefix+'select '+expression+';'));
const author = (command, values, requestId=randomUUID()) => {
 const payload = {protocol:'isolated-paid-video-v1',requestId,...values};
 const response=JSON.parse(q(actor()+`select public.isolated_paid_video_v1(${sqlText(command)},${sqlJson(payload)},'${SELLER}','${SELLER_SESSION}');`));
 captures.push({kind:'author',command,payload,response}); return response;
};
const checkoutExpression = (command,payload,requestId=randomUUID(), session=BUYER_SESSION) =>
 `public.${command==='abandon'?'isolated_paid_video_abandon_v3':'isolated_paid_video_checkout_v3'}('${BUYER}','${session}',${sqlText(command)},'${requestId}',${sqlText(V3_FIXTURE.configurationDigest)},${sqlJson(payload)})`;
const checkout = (command,payload,requestId=randomUUID(),session) => {
 const response=service(checkoutExpression(command,payload,requestId,session));
 captures.push({kind:'checkout',input:{actor:{userId:BUYER,sessionId:session??BUYER_SESSION},request:{protocol:'isolated-paid-video-checkout-v3',command,payload,requestId,
  expectedSessionId:session??BUYER_SESSION,configurationDigest:V3_FIXTURE.configurationDigest}},result:response}); return response;
};
const cleanResult = () => ({protocol:'scpv-byte-scan-v1',profile:'scpv-mp4-h264-aac-v1',sha256:syntheticHash('synthetic-video-bytes'),byteLength:1024,
 checkedAt:new Date().toISOString(),definitions:{protocol:'scpv-definition-manifest-v1',files:[{filename:'daily.cvd',createdAt:new Date().toISOString()}],manifestSha256:syntheticHash('synthetic-scanner-definitions')},
 moderation:'unreviewed',verdict:'clean',reason:'exact_bytes_scanned',media:{durationMs:1000,width:320,height:180,framesPerSecond:24,videoCodec:'h264',pixelFormat:'yuv420p',audioCodec:null}});
let routeId, workerId, workerKey, actualCleanScan=null, scanWork=null;
const seed = () => {
 h.freshDatabase(); seedV3Qualified(q); provider.reset();
 routeId=randomUUID(); workerId=randomUUID(); workerKey=randomBytes(32);
 q(`insert into sandbox_commerce_v1.paid_video_routes values('${routeId}','s3','synthetic-private-media',${sqlText(syntheticHash('route'))},true);
 insert into sandbox_commerce_v1.paid_video_workers values('${workerId}',decode('${workerKey.toString('hex')}','hex'),${sqlText(syntheticHash('worker'))},true);`);
};
const publish = async () => {
 let clean=cleanResult(), bytes=null;
 const binaries={ffmpeg:'/usr/local/bin/ffmpeg',ffprobe:'/usr/local/bin/ffprobe',clamscan:'/usr/local/bin/clamscan',sigtool:'/usr/local/bin/sigtool'};
 if(actualScanner && !actualCleanScan) {
  scanWork=fs.mkdtempSync('/tmp/scpv-v3-scan-'); fs.chmodSync(scanWork,0o700); const file=path.join(scanWork,'video.mp4');
  const generated=await runBounded(binaries.ffmpeg,['-nostdin','-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=24:d=2','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',file]);
  assert.equal(generated.code,0,generated.stderr); fs.chmodSync(file,0o600); bytes=fs.readFileSync(file);
  clean.sha256=createHash('sha256').update(bytes).digest('hex'); clean.byteLength=bytes.length;
  for(const [name,file] of Object.entries(binaries)) sourceHashes['actualBinary/'+name]=fileHash(file);
 }
 const upload=author('upload.reserve',{title:bytes?'Actual locally scanned video':'Explicit synthetic scanner fixture',expectedSha256:clean.sha256,expectedByteLength:clean.byteLength}).data.upload;
 author('upload.finalize',{uploadId:upload.id});
 const ticket=service(`public.isolated_paid_video_worker_v1('lease','${upload.id.slice(12)}','${workerId}',null,null)`);
 const signed=bytes ? await executeScanTicket({ticket,workerKey,workDirectory:scanWork,scanner:{databaseDirectory,certificateDirectory,binaries},
  transport:{readForScan:async binding=>{ assert.equal(binding.objectKey,q(`select object_key from sandbox_commerce_v1.paid_video_uploads where id='${upload.id.slice(12)}';`)); return {bytes,objectVersion:'synthetic-immutable-version'}; }}})
  : signScanResult({key:workerKey,ticketId:ticket.ticketId,uploadId:upload.id,incarnation:upload.incarnation,objectVersion:'synthetic-immutable-version',result:clean});
 if(bytes) { actualCleanScan=JSON.parse(signed.raw).result; assert.equal(actualCleanScan.verdict,'clean'); }
 service(`public.isolated_paid_video_worker_v1('result',null,null,${sqlText(signed.raw)},${sqlText(signed.signature)})`);
 q(`set role sbx_v1_operator;select sandbox_commerce_v1.paid_video_moderate('${upload.id.slice(12)}','clear',${sqlText(syntheticHash('synthetic-moderation'))});`);
 const offer=author('offer.publish',{uploadId:upload.id,expectedRevision:1,amountMinor:199,currency:'usd'}).data.offer;
 return {upload,offer};
};
const prepare = async () => {
 const context=await publish(), quote=checkout('offer',{offerId:context.offer.id}).data.quote;
 const requestId=randomUUID(), payload={offerId:context.offer.id,expectedQuote:quote};
 const response=checkout('prepare',payload,requestId), intent=response.data.intent;
 assert.equal(intent.state,'prepared'); assert.deepEqual(intent.quote,quote);
 assert.deepEqual(checkout('prepare',payload,requestId).data.intent,intent);
 assert.equal(checkout('prepare',payload,requestId).data.replayed,true);
 assert.deepEqual(checkout('recover',{originalRequestId:requestId}).data.originalPayload,payload);
 assert.equal(checkout('recover',{originalRequestId:randomUUID()}).status,'unknown');
 return {...context,quote,intent,requestId,payload,rawIntentId:intent.id.slice(12)};
};
const claimed = async () => {
 const context=await prepare(), customer=api.call('bind',{installationId:randomUUID()}).result.customer;
 let result=api.call('allocate',{customerBindingId:customer.id,intentId:context.intent.id,expectedQuote:context.quote}).result;
 await provider.registerPlan(result.allocation);
 result=api.call('read',{intentId:context.intent.id}).result;
 const claimId=randomUUID(), claimPayload={intentId:context.intent.id,dispatchId:result.allocation.dispatchId,registrationId:result.allocation.registration.id,expectedQuote:context.quote};
 const claim=api.call('claim',claimPayload,claimId).result; assert.equal(claim.dispatchAllowed,true);
 assert.equal(api.call('claim',claimPayload,claimId).result.dispatchAllowed,false);
 return {...context,customer:result.customer,allocation:result.allocation,claim};
};
const accessExpression = (context,grantId) => `public.isolated_paid_video_access_v3('${BUYER}','${BUYER_SESSION}','${context.quote.resourceId.slice(14)}','${grantId}')`;
const lifecycleCaptures=[];
const lifecycleExpression=(plan,action,request=randomUUID(),revision=1)=>
 `sandbox_commerce_v1.test_store_v3_retire_plan('${plan}',${sqlText(action)},'${request}',${revision})`;
const retire=(plan,action,request=randomUUID(),revision=1)=>{
 const value=JSON.parse(q('set role sbx_v1_operator;select '+lifecycleExpression(plan,action,request,revision)+';'));
 lifecycleCaptures.push({plan,action,request,revision,result:value}); return value;
};
const phase=plan=>JSON.parse(q(`set role sbx_v1_operator;select sandbox_commerce_v1.test_store_v3_plan_lifecycle_read('${plan}');`));
const allocate=(context,customer)=>{
 customer??=api.call('bind',{installationId:randomUUID()}).result.customer;
 const result=api.call('allocate',{customerBindingId:customer.id,intentId:context.intent.id,expectedQuote:context.quote}).result;
 return {...context,customer,allocation:result.allocation,plan:provider.planFor(result.allocation)};
};
const release=(context,disposition='retain_unknown',receiptId=null)=>{
 const read=api.call('read',{intentId:context.intent.id}).result;
 return api.call('advance',{intentId:context.intent.id,dispatchId:context.allocation.dispatchId,
  expectedReservationRevision:read.reservation.revision,disposition,expectedReceiptId:receiptId}).result;
};
const allocationSql=(context,customer)=>api.servicePrefix+'select '+api.expression('allocate',{
 customerBindingId:customer.id,intentId:context.intent.id,expectedQuote:context.quote})+';';
const waitUntil=async instant=>{
 const remaining=new Date(instant).getTime()-Date.now()+30;
 assert.ok(remaining<20000,'Only a bounded synthetic fixture deadline may be waited');
 if(remaining>0) await delay(remaining);
};
const admit=async(context,shortDeadline=false)=>{
 await provider.registerPlan(context.allocation);
 // Explicit synthetic pre-admission deadline, never an alteration of a retained
 // claim or its immutable accepted window. Production preparation remains 15m.
 if(shortDeadline) q(`update sandbox_commerce_v1.intents set expires_at=clock_timestamp()+interval '8 seconds' where id='${context.rawIntentId}';`);
 const ready=api.call('read',{intentId:context.intent.id}).result;
 const request=randomUUID(),payload={intentId:context.intent.id,dispatchId:ready.allocation.dispatchId,
  registrationId:ready.allocation.registration.id,expectedQuote:context.quote};
 const claim=api.call('claim',payload,request).result;
 assert.equal(claim.dispatchAllowed,true);
 return {...context,allocation:ready.allocation,claim,claimRequest:request,claimPayload:payload};
};
let result,failure;
try {
 const engine=h.start(install);
 seed(); const readinessVideo=await publish(), offerPayload={offerId:readinessVideo.offer.id};
 const ready=checkout('offer',offerPayload); assert.equal(ready.data.preparationAllowed,true);
 assert.equal(q('select count(*) from sandbox_commerce_v1.intents;'),'0'); assert.equal(provider.calls.length,0);
 const readinessPayload={offerId:readinessVideo.offer.id,expectedQuote:ready.data.quote};
 for(const mutation of [
  'update sandbox_commerce_v1.test_store_v3_controls set initiation_enabled=false;',
  `update sandbox_commerce_v1.paid_video_routes set active=false where id='${routeId}';`,
  `update public.user_entitlements set status='inactive' where user_id='${SELLER}';`,
  "update public.platform_money_kill_switches set state='on' where key='live_money_enabled';",
  "update sandbox_commerce_v1.lifecycle set state='retired';",
 ]) {
  const requestId=randomUUID();
  const output=q('begin;'+mutation+api.servicePrefix+'select '+checkoutExpression('offer',offerPayload,requestId)+';rollback;');
  const response=JSON.parse(output.split('\n').find(line=>line.startsWith('{') && line.includes('isolated-paid-video-checkout-v3')));
  assert.equal(response.data.preparationAllowed,false,mutation);
  captures.push({kind:'checkout',input:{actor:{userId:BUYER,sessionId:BUYER_SESSION},request:{protocol:'isolated-paid-video-checkout-v3',command:'offer',payload:offerPayload,requestId,expectedSessionId:BUYER_SESSION,configurationDigest:V3_FIXTURE.configurationDigest}},result:response});
  h.rejects('begin;'+mutation+api.servicePrefix+'select '+checkoutExpression('prepare',readinessPayload)+';',/preparation_unavailable|current_media_required|creator_authority_required|financial_controls_required|generation_inactive/u);
 }
 const otherDigest=syntheticHash('separate-unqualified-native-profile');
 q(`insert into sandbox_commerce_v1.test_store_v3_native_profiles select ${sqlText(otherDigest)},connection_id,connection_revision,platform,'synthetic-other-native',public_sdk_key_sha256,'synthetic-other-namespace',false,null,null from sandbox_commerce_v1.test_store_v3_native_profiles limit 1;`);
 const otherOffer=service(checkoutExpression('offer',offerPayload).replace(V3_FIXTURE.configurationDigest,otherDigest));
 assert.equal(otherOffer.data.preparationAllowed,false);
 h.rejects(api.servicePrefix+'select '+checkoutExpression('prepare',readinessPayload).replace(V3_FIXTURE.configurationDigest,otherDigest)+';',/preparation_unavailable/u);
 assert.equal(checkout('offer',offerPayload).data.preparationAllowed,true);
 cases.push('Read-only offer readiness is true only under the same current preparation helper. Disabled initiation, inactive media route, expired creator authority, live-money switch, inactive generation and unqualified native profile fail readiness and preparation; no allocation/provider call is created.');

 const abandoned=await prepare(), abandonmentPayload={originalRequestId:abandoned.requestId,originalSessionId:BUYER_SESSION,intentId:abandoned.intent.id,expectedQuote:abandoned.quote};
 const abandonmentRequest=randomUUID(), closed=checkout('abandon',abandonmentPayload,abandonmentRequest);
 assert.equal(closed.data.intent.state,'expired'); assert.equal(closed.data.intent.receipt,null); assert.equal(closed.data.intent.grantId,null);
 assert.equal(closed.data.closure.kind,'unallocated_preparation'); assert.equal(closed.data.closure.allocationAbsent,true); assert.equal(closed.data.closure.dispatchAbsent,true);
 assert.equal(closed.data.closure.configurationDigest,V3_FIXTURE.configurationDigest); assert.equal(closed.data.replayed,false);
 assert.equal(checkout('abandon',abandonmentPayload,abandonmentRequest).data.replayed,true);
 assert.deepEqual(checkout('abandon',abandonmentPayload).data.closure,closed.data.closure);
 assert.equal(checkout('prepare',abandoned.payload,abandoned.requestId).data.intent.state,'expired');
 assert.equal(checkout('recover',{originalRequestId:abandoned.requestId}).data.intent.state,'expired');
 assert.equal(service(checkoutExpression('recover',{originalRequestId:abandoned.requestId}).replace(V3_FIXTURE.configurationDigest,otherDigest)).status,'unknown');
 const noAllocationCustomer=api.call('bind',{installationId:randomUUID()}).result.customer;
 h.rejects(allocationSql(abandoned,noAllocationCustomer),/test_store_v3_intent_or_product_unavailable/u);
 for(const patch of [{originalRequestId:randomUUID()},{originalSessionId:randomUUID()},{intentId:'scv1_intent_'+randomUUID()},
  {expectedQuote:{...abandoned.quote,amountMinor:200}}]) {
  h.rejects(api.servicePrefix+'select '+checkoutExpression('abandon',{...abandonmentPayload,...patch})+';',/no rows|binding_conflict/u);
 }
 h.rejects(api.servicePrefix+'select '+checkoutExpression('abandon',{...abandonmentPayload,expectedQuote:{...abandoned.quote,amountMinor:200}},abandonmentRequest)+';',/request_conflict/u);
 assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v3_abandonments;'),'1');
 const recoveredSession=randomUUID();
 q(`insert into auth.sessions values('${recoveredSession}','${BUYER}',clock_timestamp()+interval '1 hour');
 insert into public.wave1_legal_acceptances select '${BUYER}','${recoveredSession}',document_key,version,market,capability,'member',null
 from public.wave1_legal_document_versions where capability='account';`);
 h.rejects(api.servicePrefix+'select '+checkoutExpression('abandon',abandonmentPayload,abandonmentRequest,recoveredSession)+';',/request_conflict/u);
 assert.deepEqual(checkout('abandon',abandonmentPayload,randomUUID(),recoveredSession).data.closure,closed.data.closure);
 for(const command of [
  'delete from sandbox_commerce_v1.test_store_v3_abandonments;',
  'truncate sandbox_commerce_v1.test_store_v3_abandonment_requests;',
  "update sandbox_commerce_v1.test_store_v3_abandonments set quote='{}';"]) h.rejects(command,/immutable|foreign key/u);
 const parked=await prepare();
 q("set role sbx_v1_operator;select sandbox_commerce_v1.transition('active','retired');");
 assert.equal(checkout('offer',{offerId:parked.offer.id}).data.preparationAllowed,false);
 assert.equal(checkout('abandon',{originalRequestId:parked.requestId,originalSessionId:BUYER_SESSION,intentId:parked.intent.id,expectedQuote:parked.quote}).data.intent.state,'expired');
 assert.equal(checkout('recover',{originalRequestId:parked.requestId}).data.intent.state,'expired');
 const firstPage=checkout('history',{limit:1,cursor:null}).data;
 assert.ok(firstPage.nextCursor); assert.equal(firstPage.intents[0].id,parked.intent.id);
 const secondPage=checkout('history',{limit:1,cursor:firstPage.nextCursor}).data;
 assert.equal(secondPage.intents[0].id,abandoned.intent.id); assert.equal(secondPage.nextCursor,null);
 assert.deepEqual(secondPage.intents[0].quote,abandoned.quote);
 cases.push('Exact unallocated preparation closure retains immutable quote/request/session/configuration tombstone; repeat acknowledgments recover the same closure, drift conflicts, cross-session owner recovery works, and a different native profile cannot recover or adopt the preparation.');
 cases.push('After actual irreversible generation retirement, preparation readiness is false while unallocated closure, original-request recovery and exact cursor history remain available.');

 seed(); const contested=await prepare(), contestedCustomer=api.call('bind',{installationId:randomUUID()}).result.customer;
 const contestedPayload={originalRequestId:contested.requestId,originalSessionId:BUYER_SESSION,intentId:contested.intent.id,expectedQuote:contested.quote};
 let admission=await h.held('begin;'+allocationSql(contested,contestedCustomer));
 h.rejects(api.servicePrefix+'select '+checkoutExpression('abandon',contestedPayload)+';',/could not obtain lock/u);
 await admission.finish('commit');
 h.rejects(api.servicePrefix+'select '+checkoutExpression('abandon',contestedPayload)+';',/allocated_or_ambiguous/u);
 const registered=api.call('read',{intentId:contested.intent.id}).result;
 await provider.registerPlan(registered.allocation);
 const registeredRead=api.call('read',{intentId:contested.intent.id}).result;
 admission=await h.held('begin;'+api.servicePrefix+'select '+api.expression('claim',{intentId:contested.intent.id,dispatchId:registeredRead.allocation.dispatchId,registrationId:registeredRead.allocation.registration.id,expectedQuote:contested.quote})+';');
 h.rejects(api.servicePrefix+'select '+checkoutExpression('abandon',contestedPayload)+';',/could not obtain lock/u);
 await admission.finish('commit');
 h.rejects(api.servicePrefix+'select '+checkoutExpression('abandon',contestedPayload)+';',/allocated_or_ambiguous/u);
 assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v3_abandonments;'),'0');
 seed(); const closureFirst=await prepare(), closureCustomer=api.call('bind',{installationId:randomUUID()}).result.customer;
 const closurePayload={originalRequestId:closureFirst.requestId,originalSessionId:BUYER_SESSION,intentId:closureFirst.intent.id,expectedQuote:closureFirst.quote};
 const closing=await h.held('begin;'+api.servicePrefix+'select '+checkoutExpression('abandon',closurePayload)+';');
 h.rejects(allocationSql(closureFirst,closureCustomer),/could not obtain lock/u); await closing.finish('commit');
 h.rejects(allocationSql(closureFirst,closureCustomer),/test_store_v3_intent_or_product_unavailable/u);
 assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v3_plans;'),'0');
 assert.equal(q('select count(*) from sandbox_commerce_v1.dispatch_attempts;'),'0');
 assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v3_abandonments;'),'1');
 // Independent source guard control: a privileged fixture temporarily restores
 // prepared state, but real allocation still cannot adopt the retained tombstone.
 h.rejects(`begin;update sandbox_commerce_v1.intents set state='prepared' where id='${closureFirst.rawIntentId}';`+allocationSql(closureFirst,closureCustomer),/test_store_v3_preparation_closed/u);
 for(const role of ['anon','authenticated','service_role']) {
  h.rejects(`set role ${role};select * from sandbox_commerce_v1.test_store_v3_abandonments;`,/permission denied/u);
  h.rejects(`set role ${role};select sandbox_commerce_v1.test_store_v3_abandon(null,null,null,null,null,null);`,/permission denied/u);
 }
 cases.push('Actual allocate-versus-abandon and SDK-claim-versus-abandon races serialize on the intent NOWAIT lock. Allocation/claim first prevents closure; closure first prevents later plan/admission, even after a privileged rolled-back fixture restores prepared state. Private journals and action remain inaccessible to runtime roles.');

 seed(); q('update sandbox_commerce_v1.test_store_v3_controls set max_active_plans=1;');
 const first=allocate(await prepare()), second=await prepare();
 assert.equal(phase(first.plan).state,'active');
 h.rejects('set role sbx_v1_operator;select '+lifecycleExpression(first.plan,'retire')+';',/test_store_v3_plan_must_drain/u);
 release(first);
 h.rejects(allocationSql(second,first.customer),/test_store_v3_capacity_unavailable/u);
 const drainRequest=randomUUID(),drained=retire(first.plan,'drain',drainRequest);
 assert.equal(drained.state,'draining'); assert.equal(drained.revision,2);
 assert.equal(retire(first.plan,'drain',drainRequest).replayed,true);
 h.rejects('set role sbx_v1_operator;select '+lifecycleExpression(first.plan,'retire',drainRequest,2)+';',/test_store_v3_lifecycle_request_conflict/u);
 h.rejects('set role sbx_v1_operator;select '+lifecycleExpression(first.plan,'retire',randomUUID(),1)+';',/test_store_v3_lifecycle_revision_conflict/u);
 const retired=retire(first.plan,'retire',randomUUID(),2); assert.equal(retired.state,'retired');
 assert.equal(retire(first.plan,'drain',drainRequest).state,'retired');
 assert.equal(api.call('read',{intentId:first.intent.id}).result.status,'expired');
 const secondAllocated=allocate(second,first.customer);
 assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v3_plans;'),'2');
 assert.equal(q("select count(*) from sandbox_commerce_v1.test_store_v3_plan_lifecycle where state<>'retired';"),'1');
 assert.equal(retired.providerDeletionProven,false); assert.equal(retired.providerCompletionProven,false);
 for(const sql of [
  `delete from sandbox_commerce_v1.test_store_v3_plan_lifecycle where plan_id='${first.plan}';`,
  `update sandbox_commerce_v1.test_store_v3_plan_lifecycle set state='active',revision=revision+1 where plan_id='${first.plan}';`,
  'truncate sandbox_commerce_v1.test_store_v3_plan_lifecycle_requests;',
  'delete from sandbox_commerce_v1.test_store_v3_plan_lifecycle_events;']) h.rejects(sql,/irreversible|immutable|foreign key/u);
 cases.push('Actual allocation/release/drain/retire proves irreversible CAS and exact request replay; release alone does not free active capacity; retirement preserves all plans and frees one local slot.');

 // Capacity fence and phase-row fence reject instead of blocking in both orders.
 let concurrent=await h.held(`begin;select sandbox_commerce_v1.test_store_v3_lock_plan('${secondAllocated.plan}');`);
 h.rejects('set role sbx_v1_operator;select '+lifecycleExpression(secondAllocated.plan,'drain')+';',/test_store_v3_plan_lifecycle_busy/u);
 await concurrent.finish('rollback');
 concurrent=await h.held('begin;set role sbx_v1_operator;select '+lifecycleExpression(secondAllocated.plan,'drain')+';');
 h.rejects(api.servicePrefix+`select public.isolated_test_store_v3_provisioning_claim_v1('${secondAllocated.plan}','create_offering','${randomUUID()}',null);`,/test_store_v3_plan_lifecycle_busy/u);
 await concurrent.finish('commit');
 assert.equal((await provider.runWorker(secondAllocated.plan)).result.status,'unavailable');
 assert.equal(provider.calls.filter(call=>call.method==='POST').length,0);
 cases.push('Concurrent lifecycle and provider admission take nonblocking project/plan fences; draining an unstarted plan never proposes or sends a provider POST.');

 seed(); q('update sandbox_commerce_v1.test_store_v3_controls set max_active_plans=1;');
 const before=legacyAuthoritySnapshot(q), owned=await admit(allocate(await prepare()),true), original=receipts.event(owned), nextContext=await prepare();
 const sdkDrain=retire(owned.plan,'drain');
 assert.ok(new Date(sdkDrain.drainAfter).getTime()>=new Date(owned.allocation.acceptPurchaseUntil).getTime());
 const waitingRequest=randomUUID();
 assert.equal(retire(owned.plan,'retire',waitingRequest,2).outcome,'waiting');
 assert.equal(api.call('report',{intentId:owned.intent.id,dispatchId:owned.allocation.dispatchId,outcome:'sdk_cancelled',transactionHint:null}).result.status,'pending');
 const phaseLock=await h.held('begin;set role sbx_v1_operator;select '+lifecycleExpression(owned.plan,'retire',randomUUID(),2)+';');
 h.rejects(api.servicePrefix+`select public.isolated_test_store_v3_provisioning_claim_v1('${owned.plan}','read_offering','${randomUUID()}',null);`,/test_store_v3_plan_lifecycle_busy/u);
 await phaseLock.finish('rollback');
 await waitUntil(owned.claim.authorityValidUntil); release(owned);
 assert.equal(phase(owned.plan).drainAfter,sdkDrain.drainAfter);
 h.rejects(allocationSql(nextContext,owned.customer),/test_store_v3_capacity_unavailable/u);
 assert.equal((await provider.runStep(owned.plan,'read_offering')).status,'recorded');
 assert.equal(phase(owned.plan).drainAfter,sdkDrain.drainAfter,'New read ticket cannot indefinitely extend a captured drain horizon');
 assert.equal((await provider.runStep(owned.plan,'create_package')).status,'unavailable');
 await waitUntil(sdkDrain.drainAfter);
 assert.equal(retire(owned.plan,'retire',waitingRequest,2).state,'draining','A waiting request replay is not a second mutation');
 assert.equal(retire(owned.plan,'retire',randomUUID(),2).state,'retired');
 assert.equal(api.call('claim',owned.claimPayload,owned.claimRequest).result.dispatchAllowed,false);
 const newOwned=allocate(nextContext,owned.customer); await provider.registerPlan(newOwned.allocation);
 assert.equal(provider.states.size,2); assert.equal([...provider.states.values()].filter(s=>s.offering).length,2);
 assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v3_holds;'),'0');
 cases.push('Actual SDK claim with explicitly shortened pre-admission fixture deadline retains its complete acceptance horizon despite cancellation/release; waiting replay cannot retire; late GET cannot extend horizon; retired owned Offering remains recognized when a second active Offering registers under budget1.');
 const positive=await receipts.ingest(original), positiveEffect=receipts.effect(positive.receiptId);
 assert.equal(positiveEffect.projection.state,'verified');
 const receiptId=positiveEffect.projection.receiptId, grantId=q(`select id from sandbox_commerce_v1.resource_grants where receipt_id='${receiptId}';`);
 assert.equal(service(accessExpression(owned,grantId)).grantId,'scv1_grant_'+grantId);
 assert.equal((await receipts.ingest(original)).status,'duplicate');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.resource_grants where receipt_id='${receiptId}';`),'1');
 assert.equal(checkout('recover',{originalRequestId:owned.requestId}).data.intent.quote.asset.sha256,owned.quote.asset.sha256);
 assert.equal(api.call('read',{intentId:owned.intent.id}).result.status,'verified');
 const refund=await receipts.ingest({...original,id:randomUUID(),type:'CANCELLATION',cancel_reason:'CUSTOMER_SUPPORT',price_in_purchased_currency:-1.99,event_timestamp_ms:Date.now()});
 assert.equal(receipts.effect(refund.receiptId).projection.state,'refunded');
 h.rejects(api.servicePrefix+'select '+accessExpression(owned,grantId)+';',/paid_video_current_receipt_required|sandbox_delivery_/u);
 const outside=await receipts.ingest(receipts.event(owned));
 assert.equal(q(`select status from sandbox_commerce_v1.test_store_v3_effects where ingress_id='${outside.receiptId}';`),'held');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.receipts where intent_id='${newOwned.rawIntentId}';`),'0');
 const transferred=await receipts.ingest({...original,id:randomUUID(),type:'TRANSFER',transferred_from:[owned.customer.providerAppUserId],transferred_to:['synthetic-other-owner']});
 assert.equal(q(`select status from sandbox_commerce_v1.test_store_v3_effects where ingress_id='${transferred.receiptId}';`),'held');
 assert.equal(q(`select count(*) from public.user_entitlements where user_id='${BUYER}';`),'0');
 assert.equal(legacyAuthoritySnapshot(q),before);
 cases.push('Exact raw purchase inside the old immutable window settles and grants after retirement and capacity reuse; duplicate/history/current-access remain exact. Late refund/transfer revoke or hold, and outside-window purchase never rebinds to the newer plan; buyer remains free and shared/live authority unchanged.');

 seed(); q('update sandbox_commerce_v1.test_store_v3_controls set max_active_plans=1;');
 const unknown=allocate(await prepare()); provider.setFault(unknown.plan,'create_offering','response_lost');
 assert.equal((await provider.runWorker(unknown.plan)).result.status,'outcome_unknown');
 const unknownDrain=retire(unknown.plan,'drain');
 assert.equal(retire(unknown.plan,'retire',randomUUID(),2).outcome,'waiting');
 await waitUntil(unknownDrain.drainAfter); retire(unknown.plan,'retire',randomUUID(),2);
 assert.equal((await provider.runStep(unknown.plan,'list_offerings')).status,'recorded');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v3_object_bindings where plan_id='${unknown.plan}';`),'1');
 assert.equal((await provider.runWorker(unknown.plan)).result.status,'unavailable');
 assert.equal(provider.states.get(unknown.plan).postCounts.create_offering,1);
 assert.equal(provider.states.get(unknown.plan).postCounts.create_package,undefined);
 assert.equal(phase(unknown.plan).state,'retired');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v3_transport_evidence e join sandbox_commerce_v1.test_store_v3_tickets t on t.id=e.ticket_id where t.plan_id='${unknown.plan}';`)>0,true);
 cases.push('A consumed Offering POST with lost synthetic response is retained through retirement; a later authenticated raw GET binds only its original plan, without another POST or package creation.');

 seed(); const leased=allocate(await prepare());
 assert.equal((await provider.runStep(leased.plan,'list_offerings')).status,'recorded');
 const ticket=await provider.deps.claim({planId:leased.plan,operation:'create_offering',requestId:randomUUID(),cursor:null});
 assert.equal(ticket.status,'send_permit_consumed');
 const leaseDrain=retire(leased.plan,'drain');
 const leaseExpiry=q(`select expires_at from sandbox_commerce_v1.test_store_v3_work_leases where plan_id='${leased.plan}';`);
 assert.ok(new Date(leaseDrain.drainAfter).getTime()>=new Date(leaseExpiry).getTime());
 assert.equal(retire(leased.plan,'retire',randomUUID(),2).outcome,'waiting');
 await waitUntil(leaseDrain.drainAfter); assert.equal(retire(leased.plan,'retire',randomUUID(),2).state,'retired');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v3_tickets where id='${ticket.ticket.ticketId}';`),'1');
 assert.equal((await provider.runStep(leased.plan,'create_offering')).status,'unavailable');
 cases.push('Unacknowledged consumed provider ticket contributes the full existing15-second work lease; expiry allows local retirement but never erases the unknown permit or authorizes resend.');

 seed(); q('update sandbox_commerce_v1.test_store_v3_controls set max_active_plans=1;');
 const bulkFirst=await prepare(), bulkCustomer=api.call('bind',{installationId:randomUUID()}).result.customer;
 const bulkCaptureStart=captures.length;
 for(let n=0;n<32;n++) {
  const prepared=n===0?bulkFirst:{...bulkFirst,intent:checkout('prepare',bulkFirst.payload).data.intent};
  const allocated=allocate(prepared,bulkCustomer); release(allocated);
  retire(allocated.plan,'drain'); retire(allocated.plan,'retire',randomUUID(),2);
 }
 const thirtyThird={...bulkFirst,intent:checkout('prepare',bulkFirst.payload).data.intent};
 h.rejects(allocationSql(thirtyThird,bulkCustomer),/test_store_v3_retained_inventory_exhausted/u);
 assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v3_plans;'),'32');
 assert.equal(q("select count(*) from sandbox_commerce_v1.test_store_v3_plan_lifecycle where state='retired';"),'32');
 assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v3_plan_lifecycle_events;'),'96');
 captures.splice(bulkCaptureStart); // Compact repetitive fixture output; assertions above execute every real command.
 cases.push('All32 plans are allocated/released/retired through actual source commands; the33rd allocation still fails even with zero active plans, and all96 immutable lifecycle events remain. No provider-object ceiling is relaxed.');
 for(const role of ['anon','authenticated','service_role']) {
  h.rejects(`set role ${role};select sandbox_commerce_v1.test_store_v3_plan_lifecycle_read('${bulkFirst.rawIntentId}');`,/permission denied/u);
  h.rejects(`set role ${role};select `+lifecycleExpression(bulkFirst.rawIntentId,'drain')+';',/permission denied/u);
  h.rejects(`set role ${role};select * from sandbox_commerce_v1.test_store_v3_plan_lifecycle;`,/permission denied/u);
 }
 assert.equal(q("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='sandbox_commerce_v1' and c.relname like 'test_store_v3_plan_lifecycle%' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity);"),'0');
 for(const [file,hash] of sources) assert.equal(fileHash(file),hash,'Source changed during proof: '+file);
 result={status:'passed',candidate:'fresh-inactive-checkout-recovery-v1',engine,cases,sourceHashes,captures,lifecycleCaptures,
  syntheticFixtures:['provider APIs/credentials/catalog/moderation/object storage','signed scan facts unless actualScanner=true','8-second intent deadline set before source SDK claim'],
  totalRetainedLimit:32,providerAuthenticationProven:false,providerDeletionProven:false,actualScanner,actualCleanScan,deploymentReady:false};
} catch(error) { failure=error; h.captureFailure(); }
finally { try { await h.close(); } catch(error) { failure??=error; } if(scanWork) fs.rmSync(scanWork,{recursive:true}); }
if(failure) { process.stderr.write(JSON.stringify(h.diagnostics(failure,null),null,2)+'\n'); throw failure; }
process.stdout.write(JSON.stringify({...result,cleanup:h.cleanup},null,2)+'\n');
