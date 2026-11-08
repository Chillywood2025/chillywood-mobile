#!/usr/bin/env node
// Actual local SQL and source Edge crypto/provider worker. Every provider API,
// route, key and catalog qualification is synthetic. No remote adapter exists.
import assert from 'node:assert/strict';
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
 'test-store-paid-video-commands.sql','test-store-paid-video-provisioning.sql','test-store-paid-video-receipts.sql','paid-video-access.sql'];
const install = 'begin;create role anon nologin;create role authenticated nologin;create role service_role nologin;'
 + 'alter default privileges for role postgres grant execute on functions to authenticated;'
 + frozen('core.sql') + retain(path.join(here, 'premium-authority.fixture.sql'), 'tests/premium-authority.fixture.sql')
 + authority.replace(declaration, '-- Real unchanged core declarations table.')
 + 'create table public.channel_audience_blocks(channel_user_id text,blocked_user_id text);' + baseline.map(frozen).join('\n')
 + newSql.map(local).join('\n') + frozen('permissions-finalize.sql') + 'commit;';
const edgeSources = [...new Set([...providerSources(repo), ...receiptSources(repo),
 path.join(repo, 'supabase/functions/_shared/isolated-test-store-v3-command.ts')])];
for (const file of [...edgeSources, ...['test-store-v3.native.mjs','test-store-v3.fixture.mjs','test-store-v3-provider.fixture.mjs',
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
 `public.isolated_paid_video_checkout_v3('${BUYER}','${session}',${sqlText(command)},'${requestId}',${sqlText(V3_FIXTURE.configurationDigest)},${sqlJson(payload)})`;
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
let result, failure;
try {
 const engine=h.start(install); seed(); const originalSharedAuthority=legacyAuthoritySnapshot(q);
 const context=await claimed();
 cases.push('Actual public authoring, signed synthetic scanner result, exact immutable media preparation/recovery, source provider worker readbacks and one-use SDK claim.');
 const event=receipts.event(context), initial=await receipts.ingest(event), effect=receipts.effect(initial.receiptId);
 assert.equal(effect.projection.state,'verified');
 const receiptId=effect.projection.receiptId, grantId=q(`select id from sandbox_commerce_v1.resource_grants where receipt_id='${receiptId}';`);
 assert.match(grantId,/^[a-f0-9-]{36}$/u);
 const access=service(accessExpression(context,grantId)); assert.equal(access.protocol,'scpv-current-access-v3');
 assert.equal(access.object.expectedSha256,context.quote.asset.sha256); assert.equal(access.object.objectVersion,'synthetic-immutable-version');
 assert.equal((await receipts.ingest(event)).status,'duplicate');
 const repeated=await receipts.ingest({...event,id:randomUUID()});
 assert.equal(receipts.effect(repeated.receiptId).projection.receiptId,receiptId);
 assert.equal(q(`select count(*) from sandbox_commerce_v1.resource_grants where receipt_id='${receiptId}';`),'1');
 assert.equal(checkout('history',{limit:25,cursor:null}).data.intents[0].grantId,'scv1_grant_'+grantId);
 cases.push('Exact authenticated encrypted raw receipt atomically creates one receipt, retained link and resource grant; source current-access function returns exact private media; duplicate preserves one grant.');
 const cancel={...event,id:randomUUID(),type:'CANCELLATION',cancel_reason:'CUSTOMER_SUPPORT',price_in_purchased_currency:-1.99,event_timestamp_ms:event.event_timestamp_ms+10};
 const cancelled=await receipts.ingest(cancel); assert.equal(receipts.effect(cancelled.receiptId).projection.state,'refunded');
 h.rejects(api.servicePrefix+'select '+accessExpression(context,grantId)+';',/paid_video_current_receipt_required|sandbox_delivery_/u);
 assert.equal(q(`select count(*) from public.user_entitlements where user_id='${BUYER}';`),'0');
 assert.equal(legacyAuthoritySnapshot(q),originalSharedAuthority,'No shared entitlement or live grant may change.');
 cases.push('Raw full refund denies current access, while the free buyer remains without Premium or shared live grants.');
 const recoveredSession=randomUUID();
 q(`insert into auth.sessions values('${recoveredSession}','${BUYER}',clock_timestamp()+interval '1 hour');
 insert into public.wave1_legal_acceptances select '${BUYER}','${recoveredSession}',document_key,version,market,capability,'member',null
 from public.wave1_legal_document_versions where capability='account';`);
 const recovered=checkout('recover',{originalRequestId:context.requestId},randomUUID(),recoveredSession);
 assert.equal(recovered.data.originalSessionId,BUYER_SESSION); assert.equal(recovered.data.intent.id,context.intent.id);
 h.rejects(api.servicePrefix+'select '+checkoutExpression('prepare',context.payload,context.requestId,recoveredSession)+';',/test_store_v3_prepare_conflict/u);
 await prepare();
 const page1=checkout('history',{limit:1,cursor:null}).data, page2=checkout('history',{limit:1,cursor:page1.nextCursor}).data;
 assert.ok(page1.nextCursor); assert.equal(page2.nextCursor,null); assert.notEqual(page1.intents[0].id,page2.intents[0].id);
 cases.push('Cross-session recovery reads original request/session without resend; changed-session preparation conflicts; stable owned cursor history preserves exact quote.');

 seed(); const heldContext=await claimed(), purchase=receipts.event(heldContext), positive=await receipts.ingest(purchase);
 const heldReceipt=receipts.effect(positive.receiptId).projection.receiptId;
 const heldGrant=q(`select id from sandbox_commerce_v1.resource_grants where receipt_id='${heldReceipt}';`);
 const allocation=heldContext.allocation.id.slice(16), customer=heldContext.customer.id.slice(14);
 const plan=q(`select plan_id from sandbox_commerce_v1.test_store_v3_allocations where id='${allocation}';`);
 const ticket=q(`select id from sandbox_commerce_v1.test_store_v3_tickets where plan_id='${plan}' limit 1;`);
 for(const scope of ['project','customer','original','plan']) {
  const hold=`insert into sandbox_commerce_v1.test_store_v3_holds(project_id,scope,customer_id,allocation_id,plan_id,ingress_id,ticket_id,reason)
   values(${sqlText(V3_FIXTURE.projectId)},'${scope}',${scope==='customer'?sqlText(customer):'null'},${scope==='original'?sqlText(allocation):'null'},${scope==='plan'?sqlText(plan):'null'},
   ${scope==='plan'?'null':sqlText(positive.receiptId)},${scope==='plan'?sqlText(ticket):'null'},'explicit_synthetic_current_hold');`;
  h.rejects('begin;'+hold+api.servicePrefix+'select '+accessExpression(heldContext,heldGrant)+';',/paid_video_provider_evidence_held/u);
 }
 assert.equal(service(accessExpression(heldContext,heldGrant)).grantId,'scv1_grant_'+heldGrant);
 cases.push('Each project, customer, original and plan hold independently denies current private access; rolled-back synthetic holds cannot change the retained grant.');
 const malformed={...purchase,id:randomUUID(),type:'TRANSFER',transferred_from:[heldContext.customer.providerAppUserId,'\ud800'],transferred_to:['\udc00'],aliases:[heldContext.customer.providerAppUserId,'\ud800']};
 const evidence=await receipts.evidence(malformed), observed=receipts.ingestEvidence(evidence);
 assert.equal(evidence.observation.parseStatus,'invalid'); assert.equal(evidence.observation.mode,'hold');
 assert.ok(evidence.observation.transferredFrom.includes(heldContext.customer.providerAppUserId));
 const stored=JSON.parse(q(`select envelope from sandbox_commerce_v1.test_store_v3_ingress where id='${observed.receiptId}';`));
 const receiptModule=load(path.join(repo,'supabase/functions/_shared/isolated-test-store-v3-receipt.ts'));
 assert.equal(new TextDecoder().decode(await receiptModule.decryptTestStoreV3Envelope(stored,receipts.connection)),evidence.raw);
 assert.equal(q(`select count(distinct customer_id) from sandbox_commerce_v1.test_store_v3_holds where customer_id='${customer}' and ingress_id='${observed.receiptId}';`),'1');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v3_holds where scope='project';`),'1');
 h.rejects(api.servicePrefix+'select '+accessExpression(heldContext,heldGrant)+';',/paid_video_current_receipt_required|paid_video_provider_evidence_held/u);
 q("set role sbx_v1_operator;select sandbox_commerce_v1.transition('active','retired');");
 const late=await receipts.ingest({...purchase,id:randomUUID(),type:'TRANSFER',transferred_from:[heldContext.customer.providerAppUserId],transferred_to:['synthetic-new-owner']});
 assert.equal(q(`select status from sandbox_commerce_v1.test_store_v3_effects where ingress_id='${late.receiptId}';`),'held');
 assert.equal(checkout('recover',{originalRequestId:heldContext.requestId}).data.intent.quote.asset.sha256,heldContext.quote.asset.sha256);
 h.rejects(api.servicePrefix+'select '+checkoutExpression('prepare',heldContext.payload)+';',/sandbox_generation_inactive/u);
 cases.push('Malformed Unicode transfer commits customer and project holds while exact encrypted raw/AAD decrypts after JSONB storage; late transfer and historical quote remain retained after retirement.');

 seed(); const stale=await prepare(), bound=api.call('bind',{installationId:randomUUID()}).result.customer;
 const wrongQuote={...stale.quote,asset:{...stale.quote.asset,incarnation:randomUUID()}};
 h.rejects(api.servicePrefix+'select '+api.expression('allocate',{customerBindingId:bound.id,intentId:stale.intent.id,expectedQuote:wrongQuote})+';',/test_store_v3_quote_conflict/u);
 q(`update sandbox_commerce_v1.paid_video_routes set active=false where id='${routeId}';`);
 h.rejects(api.servicePrefix+'select '+api.expression('allocate',{customerBindingId:bound.id,intentId:stale.intent.id,expectedQuote:stale.quote})+';',/test_store_v3_current_media_required/u);
 assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v3_allocations;'),'0'); assert.equal(provider.calls.length,0);
 q(`update sandbox_commerce_v1.paid_video_routes set active=true where id='${routeId}';`);
 const allocated=api.call('allocate',{customerBindingId:bound.id,intentId:stale.intent.id,expectedQuote:stale.quote}).result.allocation;
 const stalePlan=provider.planFor(allocated); provider.setFault(stalePlan,'create_offering','response_lost');
 assert.equal((await provider.runWorker(stalePlan)).result.status,'outcome_unknown');
 assert.equal((await provider.runStep(stalePlan,'create_offering')).status,'unavailable');
 await provider.registerPlan(allocated);
 assert.equal(provider.states.get(stalePlan).postCounts.create_offering,1);
 assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v3_tickets where plan_id='${stalePlan}' and operation='create_offering';`),'1');
 assert.equal(q('select count(*) from sandbox_commerce_v1.dispatch_attempts;'),'0');
 cases.push('Changed immutable asset quote and disabled media route reject before allocation/transport; committed synthetic provider POST with lost response recovers by reads without a second send permit.');

 seed(); const testCustomer=api.call('bind',{installationId:randomUUID()}).result.customer;
 const probe={id:randomUUID(),type:'TEST',app_id:V3_FIXTURE.appId,store:'TEST_STORE',environment:'SANDBOX',event_timestamp_ms:Date.now(),
  app_user_id:testCustomer.providerAppUserId,original_app_user_id:testCustomer.providerAppUserId,aliases:[]};
 const harmless=await receipts.ingest(probe);
 assert.equal(q(`select status from sandbox_commerce_v1.test_store_v3_effects where ingress_id='${harmless.receiptId}';`),'ignored');
 assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v3_holds;'),'0');
 const otherTestCustomer=api.call('bind',{installationId:randomUUID()}).result.customer;
 const mixedTest=await receipts.ingest({...probe,id:randomUUID(),original_app_user_id:otherTestCustomer.providerAppUserId,
  aliases:[testCustomer.providerAppUserId,otherTestCustomer.providerAppUserId]});
 assert.equal(q(`select status from sandbox_commerce_v1.test_store_v3_effects where ingress_id='${mixedTest.receiptId}';`),'held');
 assert.equal(q(`select count(distinct customer_id) from sandbox_commerce_v1.test_store_v3_holds where ingress_id='${mixedTest.receiptId}';`),'2');
 const unidentifiedTest=await receipts.ingest({...probe,id:randomUUID(),app_user_id:null,original_app_user_id:null});
 assert.equal(q(`select status from sandbox_commerce_v1.test_store_v3_effects where ingress_id='${unidentifiedTest.receiptId}';`),'held');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v3_holds where ingress_id='${unidentifiedTest.receiptId}' and scope='project';`),'1');
 const economicTest=await receipts.ingest({...probe,id:randomUUID(),transferred_from:[testCustomer.providerAppUserId],transferred_to:['synthetic-unresolved-owner'],
  original_transaction_id:'synthetic-test-original',transaction_id:'synthetic-test-transaction'});
 assert.equal(q(`select status from sandbox_commerce_v1.test_store_v3_effects where ingress_id='${economicTest.receiptId}';`),'held');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v3_holds where ingress_id='${economicTest.receiptId}' and customer_id='${testCustomer.id.slice(14)}';`),'1');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v3_holds where ingress_id='${economicTest.receiptId}' and scope='project';`),'1');
 for(const extra of [{aliases:[testCustomer.providerAppUserId,'\u0000']},{presented_offering_id:'\ud800'},{unknown:'\udc00'},{['unknown\ud800']:'representable'}]) {
  const malformedOnly=await receipts.evidence({...probe,id:randomUUID(),...extra}), durable=receipts.ingestEvidence(malformedOnly);
  assert.equal(malformedOnly.observation.mode,'hold'); assert.ok(malformedOnly.observation.issues.includes('invalid_unicode_observation'));
  assert.equal(q(`select count(distinct customer_id) from sandbox_commerce_v1.test_store_v3_holds where ingress_id='${durable.receiptId}' and customer_id='${testCustomer.id.slice(14)}';`),'1');
  assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v3_holds where ingress_id='${durable.receiptId}' and scope='project';`),'1');
  const exactStored=JSON.parse(q(`select envelope from sandbox_commerce_v1.test_store_v3_ingress where id='${durable.receiptId}';`));
  assert.equal(new TextDecoder().decode(await receiptModule.decryptTestStoreV3Envelope(exactStored,receipts.connection)),malformedOnly.raw);
 }
 assert.equal(q('select count(*) from sandbox_commerce_v1.receipts;'),'0');
 cases.push('Only a closed scope-compatible single-identity non-economic TEST probe is ignored; mixed/unknown identity and transfer/original/transaction context retain all known customer and unresolved project holds.');

 seed(); const invalidInventory=await prepare(), inventoryCustomer=api.call('bind',{installationId:randomUUID()}).result.customer;
 const inventoryAllocation=api.call('allocate',{customerBindingId:inventoryCustomer.id,intentId:invalidInventory.intent.id,expectedQuote:invalidInventory.quote}).result.allocation;
 const inventoryPlan=provider.planFor(inventoryAllocation), originalFetch=provider.deps.fetch; let exactInventoryRaw;
 provider.deps.fetch=async(input,init)=>{assert.equal(init.method,'GET');
  exactInventoryRaw=JSON.stringify({object:'list',url:String(input),items:[{object:'offering',id:'synthetic-malformed-offering',lookup_key:'unowned-fixture',
   display_name:'\ud800',project_id:V3_FIXTURE.projectId,state:'active',is_current:false,created_at:Date.now()}]});
  return new Response(exactInventoryRaw,{status:200,headers:{'content-type':'application/json'}});
 };
 const inventoryResult=await provider.runStep(inventoryPlan,'list_offerings'); provider.deps.fetch=originalFetch;
 assert.equal(inventoryResult.status,'recorded'); assert.equal(inventoryResult.observation.kind,'invalid');
 const representableInventory=JSON.parse(exactInventoryRaw); representableInventory.items[0].display_name='Representable inventory';
 assert.equal(provider.source.parseProvisioningResponse(new TextEncoder().encode(JSON.stringify(representableInventory)),200,provider.tickets.get(inventoryResult.ticketId),100).kind,'list');
 for(const extra of [{unknown:'\ud800'},{['unknown\udc00']:'valid'},{unknown:'\u0000'}]) {
  assert.equal(provider.source.parseProvisioningResponse(new TextEncoder().encode(JSON.stringify({...representableInventory,...extra})),200,provider.tickets.get(inventoryResult.ticketId),100).kind,'invalid');
 }
 const storedInventory=JSON.parse(q(`select jsonb_build_object('evidence',evidence,'observation',observation) from sandbox_commerce_v1.test_store_v3_transport_evidence where ticket_id='${inventoryResult.ticketId}';`));
 const decryptedInventory=await provider.source.decryptProvisioningEvidence(storedInventory.evidence,storedInventory.observation,provider.tickets.get(inventoryResult.ticketId),provider.config);
 assert.equal(new TextDecoder().decode(decryptedInventory),exactInventoryRaw);
 assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v3_holds where plan_id='${inventoryPlan}';`),'1');
 assert.equal(q("select count(*) from sandbox_commerce_v1.test_store_v3_holds where scope='project' and reason='project_inventory_unresolved';"),'1');
 assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v3_registrations;'),'0');
 cases.push('Malformed Unicode in provider inventory is captured as encrypted exact raw evidence plus representable invalid observation; plan and project holds commit without registration.');

 seed();
 const register=(protocol,project) => `insert into sandbox_commerce_v1.${protocol===1?'test_store_connections':'test_store_v'+protocol+'_connections'}
 (id,revision,project_id,app_id,scope_key,economic_application_id,provider_configuration_digest,auth_key_version,storage_key_id${protocol===1?'':',credential_ref,credential_version'})
 values('${randomUUID()}',1,${sqlText(project)},'synthetic-exclusive-app',${sqlText(JSON.stringify(['revenuecat',project,'synthetic-exclusive-app','TEST_STORE','SANDBOX']))},
 ${sqlText('rc_test_store:'+project+':synthetic-exclusive-app')},${sqlText(syntheticHash('exclusive'))},'synthetic-auth','synthetic-storage'${protocol===1?'':",'synthetic-credential','synthetic-version'"});`;
 for(const protocol of [1,2]) h.rejects(register(protocol,V3_FIXTURE.projectId),/test_store_v3_project_already_owned/u);
 const project='synthetic-concurrent-project', active=await h.held('begin;'+register(3,project));
 h.rejects(register(2,project),/test_store_v3_scope_busy/u); await active.finish('commit');
 h.rejects(register(2,project),/test_store_v3_project_already_owned/u);
 const qual=randomUUID(); q(`insert into sandbox_commerce_v1.test_store_qualification_connections values('${qual}',1,${sqlText(project)},'synthetic-exclusive-app','synthetic-auth','synthetic-storage');`);
 const capture=`set role sbx_v1_operator;select sandbox_commerce_v1.test_store_qualification_transition('capturing','${qual}',1,16,32,1048576);`;
 h.rejects(capture,/test_store_v3_economic_project_cannot_capture/u);
 const otherProject='synthetic-capture-first', otherQual=randomUUID();
 q(`insert into sandbox_commerce_v1.test_store_qualification_connections values('${otherQual}',1,${sqlText(otherProject)},'synthetic-exclusive-app','synthetic-auth','synthetic-storage');`);
 const capturing=await h.held(`begin;set role sbx_v1_operator;select sandbox_commerce_v1.test_store_qualification_transition('capturing','${otherQual}',1,16,32,1048576);`);
 h.rejects(register(3,otherProject),/test_store_v3_scope_busy/u); await capturing.finish('commit');
 h.rejects(register(3,otherProject),/test_store_v3_capture_active/u);
 cases.push('Registry forbids v1/v2 reuse of v3 project and concurrent cross-protocol registration; capture/registration reject in both orders without waiting or upgrade deadlocks.');
 for(const role of ['anon','authenticated','service_role']) {
  h.rejects(`set role ${role};select * from sandbox_commerce_v1.test_store_v3_ingress;`,/permission denied/u);
  h.rejects(`set role ${role};select sandbox_commerce_v1.test_store_v3_apply_paid_video(null,null,false);`,/permission denied|does not exist/u);
 }
 assert.equal(q("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='sandbox_commerce_v1' and c.relname like 'test_store_v3_%' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity);"),'0');
 cases.push('Actual runtime role ACLs deny raw/private mutation and all protocol3 tables enforce row-level security.');
 for(const [file,hash] of sources) assert.equal(fileHash(file),hash,'Source changed during proof: '+file);
 result={status:'passed',engine,cases,sourceHashes,captures,providerAuthenticationProven:false,actualScanner,actualCleanScan,deploymentReady:false};
} catch(error) { failure=error; h.captureFailure(); }
finally { try { await h.close(); } catch(error) { failure ??= error; } if(scanWork) fs.rmSync(scanWork,{recursive:true}); }
if(failure) { process.stderr.write(JSON.stringify(h.diagnostics(failure,null),null,2)+'\n'); throw failure; }
process.stdout.write(JSON.stringify({...result,cleanup:h.cleanup},null,2)+'\n');
