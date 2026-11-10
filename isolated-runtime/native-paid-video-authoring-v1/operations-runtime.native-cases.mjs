// Run ONLY after the actual bounded combined forward installation in a
// disposable local PostgreSQL fixture. No installer, grant repair or target
// connection lives here. Auth, storage, scanner and qualification facts are
// synthetic; SQL, production HTTP handlers and verifier/worker HMACs are real.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {sqlText,sqlJson} from '../sandbox-commerce-v1/tests/test-store.fixture.mjs';
import {SELLER,SELLER_SESSION,BUYER,BUYER_SESSION} from '../sandbox-commerce-v1/tests/test-store-v3.fixture.mjs';
import {signScanResult} from '../../ops/isolated-paid-video-worker/scan.mjs';
import * as objectSource from '../../ops/isolated-paid-video-worker/private-object.mjs';
import * as brokerSource from '../../ops/isolated-paid-video-worker/upload-broker.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const configuration='8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0';
const service="set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}';";
const subject=(user=SELLER,session=SELLER_SESSION)=>`set role authenticated;set request.jwt.claims=${sqlText(JSON.stringify({role:'authenticated',sub:user,session_id:session}))};`;
const opSql=(action,body)=>`select public.isolated_paid_video_operations_v1(${sqlText(action)},${sqlText(JSON.stringify(body))});`;
const reviewSql=(action,body)=>`select public.isolated_paid_video_review_v1(${sqlText(action)},${sqlText(JSON.stringify(body))});`;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function runCombinedOperationsCases({h,q=h.q}){
 const cases=[],sourceHashes={};
 const source=file=>{const bytes=fs.readFileSync(path.join(root,file));sourceHashes[file]=digest(bytes);return bytes.toString('utf8');};
 for(const file of ['ops/isolated-paid-video-operations-v2/operations.sql','ops/isolated-paid-video-operations-v2/monotonic-removal.sql',
  'isolated-runtime/native-paid-video-authoring-v1/authoring.sql','isolated-runtime/native-paid-video-authoring-v1/private-state.sql'])source(file);
 const count=table=>Number(q('select count(*) from sandbox_commerce_v1.'+table+';'));
 const newTables=['paid_video_native_authoring_profiles','paid_video_native_catalog_templates','paid_video_native_template_retirements',
  'paid_video_native_publications','paid_video_operations_config','paid_video_operations_requests','paid_video_reviewers','paid_video_reviews','paid_video_removals'];
 for(const table of newTables)assert.equal(count(table),0,table+' must be empty after installation');
 assert.equal(q('select enabled from sandbox_commerce_v1.paid_video_gateway_controls;'),'f');
 assert.equal(q('select preparation_enabled from sandbox_commerce_v1.native_store_quote_controls;'),'f');
 const v3State=()=>q('select row_to_json(c) from sandbox_commerce_v1.test_store_v3_controls c;');
 const initialV3=v3State();
 assert.equal(q('select ingress_enabled or provisioning_enabled or initiation_enabled from sandbox_commerce_v1.test_store_v3_controls;'),'f');
 assert.equal(count('test_store_v3_native_profiles'),0);
 assert.equal(q("select has_schema_privilege('sbx_v1_core_owner','public','CREATE');"),'f');
 h.rejects(service+"select public.isolated_paid_video_worker_v1('lease',null,null,null,null);",/permission denied/u);
 h.rejects("set role sbx_v1_operator;select sandbox_commerce_v1.paid_video_moderate(null,'clear',null);",/permission denied/u);
 for(const role of ['anon','authenticated'])h.rejects(`set role ${role};`+opSql('recover',{}),/permission denied/u);
 h.rejects(service+reviewSql('inspect',{}),/permission denied/u);
 cases.push('Actual combined installation starts empty/default-off; only service operations and authenticated review RPCs remain, with legacy worker/operator bypasses revoked.');

 const route=randomUUID(),worker=randomUUID(),verifier=randomUUID(),workerKey=randomBytes(32),verifierKey=randomBytes(32);
 const binding={protocol:'scpv-operations-binding-v1',projectRef:'abcdefghijklmnopqrst',endpoint:'https://abcdefghijklmnopqrst.supabase.co',
  installationId:randomUUID(),sourceSha256:sourceHashes['ops/isolated-paid-video-operations-v2/operations.sql'],workerId:worker,workerSha256:'2'.repeat(64),
  verifierId:verifier,verifierEvidenceSha256:'3'.repeat(64),configurationDigest:configuration,routeId:route,qualificationSha256:'4'.repeat(64)};
 const bytes=Buffer.from('Synthetic immutable media bytes; no cloud storage or actual scanner proof.'),sha=digest(bytes);
 let actor={userId:SELLER,sessionId:SELLER_SESSION,expiresAtMs:Date.now()+3600000},lastError=null,writes=0;
 const stored=new Map(),ts=createRequire(import.meta.url)('typescript');
 const cache=new Map([[path.join(root,'ops/isolated-paid-video-worker/private-object.mjs'),objectSource],
  [path.join(root,'ops/isolated-paid-video-worker/upload-broker.mjs'),brokerSource]]);
 const load=file=>{
  if(cache.has(file))return cache.get(file);
  const exports={};cache.set(file,exports);const text=source(path.relative(root,file));
  if(file.endsWith('.json')){exports.default=JSON.parse(text);return exports;}
  const compiled=ts.transpileModule(text,{reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  assert.deepEqual(compiled.diagnostics,[]);
  new Function('exports','require',compiled.outputText)(exports,name=>{assert.ok(name.startsWith('.'));return load(path.resolve(path.dirname(file),name));});
  return exports;
 };
 const rpc=async(name,parameters,authorization)=>{
  const args=Object.entries(parameters).map(([k,v])=>`${k}=>${v===null?'null':typeof v==='object'?sqlJson(v):sqlText(v)}`).join(',');
  try{return JSON.parse(q((authorization?subject(actor.userId,actor.sessionId):service)+`select public.${name}(${args});`));}
  catch(error){lastError=error.message;throw error;}
 };
 const authenticate=async()=>({actor:{...actor},authorization:'Bearer synthetic-local'});
 const transport={async writeOnce(object,body){
  assert.equal(object.provider,'s3');assert.equal(object.routeId,route);assert.equal(object.expectedSha256,sha);writes++;
  assert.equal(stored.has(object.objectKey),false,'Only one origin write is admitted');
  const value={bytes:new Uint8Array(body),objectVersion:'synthetic-version-'+randomUUID()};stored.set(object.objectKey,value);
  return{state:'acknowledged',objectVersion:value.objectVersion};
 },async readForScan(object){assert.equal(object.expectedSha256,sha);return structuredClone(stored.get(object.objectKey));}};
 const shared=name=>load(path.join(root,'supabase/functions/_shared',name));
 const authoring=shared('isolated-paid-video-authoring.ts').createPaidVideoAuthoringHandler({authenticate,rpc});
 const uploader=shared('isolated-paid-video-upload.ts').createPaidVideoUploadHandler({authenticate,rpc,transport,verifier:{id:verifier,key:verifierKey}});
 const author=async(command,payload={},requestId=randomUUID())=>{
  lastError=null;const response=await authoring(new Request('https://synthetic.invalid/isolated-paid-video-authoring-v2',{method:'POST',
   headers:{'content-type':'application/json'},body:JSON.stringify({protocol:'isolated-paid-video-v2',command,requestId,
    expectedSessionId:actor.sessionId,configurationDigest:configuration,payload})}));
  return{code:response.status,...await response.json()};
 };
 const transfer=async(method,uploadId,requestId,body)=>{
  lastError=null;const response=await uploader(new Request('https://synthetic.invalid/isolated-paid-video-upload-v2/'+uploadId,{method,headers:{
   'x-chillywood-auth-session':actor.sessionId,'x-chillywood-request-id':requestId,'x-chillywood-native-configuration':configuration,
   ...(method==='PUT'?{'content-type':'video/mp4','content-length':String(bytes.length)}:method==='POST'?{'content-type':'application/json'}:{})},
   ...(body?{body:method==='PUT'?body:JSON.stringify(body)}:{})}));
  return{code:response.status,...await response.json()};
 };
 // LOCAL fixture facts begin only after default-off and ACL assertions. This
 // reset seeds synthetic Auth/legal/Premium facts, never runtime replacements.
 q(`select authority_fixture.reset();insert into auth.users(id,email_confirmed_at,raw_app_meta_data) values('${BUYER}',clock_timestamp(),'{}');
  insert into auth.sessions values('${BUYER_SESSION}','${BUYER}',clock_timestamp()+interval '1 hour');
  insert into public.wave1_legal_acceptances select '${BUYER}','${BUYER_SESSION}',document_key,version,market,capability,'member',null
   from public.wave1_legal_document_versions where capability='account';
  update sandbox_commerce_v1.lifecycle set state='active';
  insert into sandbox_commerce_v1.paid_video_routes values('${route}','s3','synthetic-combined-native-media',repeat('1',64),true);
  insert into sandbox_commerce_v1.paid_video_workers values('${worker}',decode('${workerKey.toString('hex')}','hex'),repeat('2',64),true);
  insert into sandbox_commerce_v1.paid_video_verifiers values('${verifier}',decode('${verifierKey.toString('hex')}','hex'),repeat('3',64),true);
  update sandbox_commerce_v1.paid_video_gateway_controls set enabled=true,route_id='${route}',worker_id='${worker}',verifier_id='${verifier}',qualification_sha256=repeat('4',64);
  insert into sandbox_commerce_v1.paid_video_native_authoring_profiles values('${configuration}','${route}','${worker}','${verifier}',repeat('4',64),false);
  insert into sandbox_commerce_v1.paid_video_operations_config values(true,${sqlJson(binding)},false);`);
 assert.equal((await author('capability.read')).data.transferAvailable,false);
 q('update sandbox_commerce_v1.paid_video_native_authoring_profiles set enabled=true;');
 const cap=await author('capability.read');assert.equal(cap.code,200,lastError);assert.equal(cap.data.transferAvailable,true);assert.equal(cap.data.checkoutAvailable,false);
 const leaseBody={protocol:'scpv-operations-request-v1',requestId:randomUUID(),command:'lease-next',binding};
 h.rejects(service+opSql('execute',leaseBody),/paid_video_operations_unavailable/u);
 q('update sandbox_commerce_v1.paid_video_operations_config set enabled=true;');
 actor={...actor,userId:BUYER,sessionId:BUYER_SESSION};
 assert.equal((await author('capability.read')).data.creatorEligible,false);
 assert.equal((await author('upload.reserve',{title:'Buyer has no creator authority',expectedSha256:sha,expectedByteLength:bytes.length})).code,503);
 actor={...actor,userId:SELLER,sessionId:SELLER_SESSION};
 const reserved=await author('upload.reserve',{title:'Combined native operations sample',expectedSha256:sha,expectedByteLength:bytes.length});
 assert.equal(reserved.code,200,lastError);const upload=reserved.data.upload,uploadId=upload.id.slice(12),transferId=randomUUID();
 const publishPayload={uploadId:upload.id,expectedRevision:1,amountMinor:99,currency:'usd'};
 assert.equal((await transfer('PUT',upload.id,transferId,bytes)).state,'acknowledged');
 const observation=await transfer('GET',upload.id,transferId);assert.equal(observation.code,200,lastError);
 const reconciliation={protocol:'scpv-reconcile-v2',observationRaw:observation.observationRaw,signature:observation.signature};
 assert.equal((await transfer('POST',upload.id,transferId,{...reconciliation,signature:'0'.repeat(64)})).code,503);
 assert.equal(count('paid_video_object_receipts'),0);
 assert.equal((await transfer('POST',upload.id,transferId,reconciliation)).state,'recorded');
 assert.equal((await author('upload.finalize',{uploadId:upload.id})).data.upload.state,'scan_pending');
 assert.equal((await author('offer.publish',publishPayload)).code,503);
 cases.push('Explicit local native admission works with V3 off and a Free buyer cannot author; production upload handlers require a real verifier HMAC before finalize, without inventing scan or review.');

 h.rejects(service+opSql('execute',{...leaseBody,binding:{...binding,sourceSha256:'f'.repeat(64)}}),/paid_video_operations_binding_invalid/u);
 const leased=JSON.parse(q(service+opSql('execute',leaseBody)));
 assert.equal(leased.result.state,'leased');const ticket=leased.result.ticket;
 assert.equal(ticket.uploadId,upload.id);assert.equal(ticket.incarnation,upload.incarnation);
 assert.equal(ticket.objectVersion,JSON.parse(observation.observationRaw).objectVersion);
 assert.deepEqual(JSON.parse(q(service+opSql('recover',leaseBody))),leased);
 assert.deepEqual(JSON.parse(q(service+opSql('check',leaseBody))),leased);
 const scan={protocol:'scpv-byte-scan-v1',profile:'scpv-mp4-h264-aac-v1',sha256:sha,byteLength:bytes.length,checkedAt:new Date().toISOString(),
  definitions:{protocol:'scpv-definition-manifest-v1',files:[{filename:'daily.cvd',createdAt:new Date().toISOString()}],manifestSha256:'7'.repeat(64)},
  moderation:'unreviewed',verdict:'clean',reason:'exact_bytes_scanned',
  media:{durationMs:1000,width:320,height:180,framesPerSecond:24,videoCodec:'h264',pixelFormat:'yuv420p',audioCodec:null}};
 const signed=signScanResult({key:workerKey,ticketId:ticket.ticketId,uploadId:upload.id,incarnation:upload.incarnation,objectVersion:ticket.objectVersion,result:scan});
 const resultBody={protocol:'scpv-operations-request-v1',requestId:randomUUID(),command:'result',binding,leaseRequestId:leaseBody.requestId,...signed};
 h.rejects(service+opSql('execute',{...resultBody,signature:'0'.repeat(64)}),/paid_video_worker_signature_invalid/u);
 assert.equal(count('paid_video_scan_results'),0);assert.equal(count('paid_video_operations_requests'),1);
 const result=JSON.parse(q(service+opSql('execute',resultBody)));assert.equal(result.result.accepted,true);
 assert.deepEqual(JSON.parse(q(service+opSql('recover',resultBody))),result);
 assert.equal(count('paid_video_tickets'),1);assert.equal(count('paid_video_scan_results'),1);assert.equal(count('paid_video_operations_requests'),2);
 assert.equal(q(`select state||':'||moderation from sandbox_commerce_v1.paid_video_uploads where id='${uploadId}';`),'clean:unreviewed');
 assert.equal((await author('offer.publish',publishPayload)).code,503);
 cases.push('New public operations lease/check/recover/result binds the actual upload and object version; forged worker HMAC rejects, one accepted synthetic scan remains unreviewed and cannot publish.');

 const makeReview=fields=>({protocol:'scpv-review-request-v1',requestId:randomUUID(),reviewerId:BUYER,sessionId:BUYER_SESSION,uploadId:upload.id,...fields});
 const inspect=makeReview();
 h.rejects(subject(BUYER,BUYER_SESSION)+reviewSql('inspect',inspect),/query returned no rows/u);
 q(`insert into sandbox_commerce_v1.paid_video_reviewers values('${BUYER}',repeat('8',64),true),('${SELLER}',repeat('9',64),true);`);
 h.rejects(subject()+reviewSql('inspect',makeReview({reviewerId:SELLER,sessionId:SELLER_SESSION})),/paid_video_independent_reviewer_required/u);
 const snapshot=JSON.parse(q(subject(BUYER,BUYER_SESSION)+reviewSql('inspect',inspect)));
 const decision=makeReview({snapshot,decision:'clear',evidenceSha256:'a'.repeat(64),reviewedAt:new Date().toISOString(),humanReviewConfirmed:true});
 h.rejects(subject(BUYER,BUYER_SESSION)+reviewSql('decide',{...decision,snapshot:{...snapshot,objectVersion:'different'}}),/paid_video_review_evidence_invalid/u);
 h.rejects(subject(BUYER,BUYER_SESSION)+reviewSql('decide',{...decision,humanReviewConfirmed:false}),/paid_video_review_evidence_invalid/u);
 const accepted=JSON.parse(q(subject(BUYER,BUYER_SESSION)+reviewSql('decide',decision)));assert.equal(accepted.decision,'clear');
 assert.deepEqual(JSON.parse(q(subject(BUYER,BUYER_SESSION)+reviewSql('recover',decision))),accepted);
 assert.equal(count('paid_video_reviews'),1);
 assert.equal((await author('offer.publish',publishPayload)).data.reason,'native_catalog_unavailable');
 cases.push('Authenticated independently provisioned reviewer inspect/decide clears only the exact current snapshot and explicit synthetic human-review evidence; source recovery is read-only and catalogs still remain closed.');

 const catalog=randomUUID();
 q(`insert into sandbox_commerce_v1.catalog values('${catalog}','paid_content','revenuecat','synthetic-native-project','APP_STORE','synthetic.ios',99,'usd');
  insert into sandbox_commerce_v1.paid_video_native_catalog_templates values
  ('${randomUUID()}',1,'${catalog}','APP_STORE','synthetic-native-project','synthetic-ios-app','synthetic.ios',repeat('b',64),true),
  ('${randomUUID()}',1,'${catalog}','PLAY_STORE','synthetic-native-project','synthetic-play-app','synthetic.play',repeat('c',64),true);`);
 const publishId=randomUUID(),published=await author('offer.publish',publishPayload,publishId);assert.equal(published.code,200,lastError);
 assert.equal(published.data.offer.checkoutAvailable,false);assert.equal(count('offers'),1);
 assert.equal(count('native_store_catalog_bindings'),2);assert.equal(count('paid_video_native_publications'),2);
 assert.equal((await author('offer.publish',publishPayload,publishId)).data.offer.id,published.data.offer.id);
 assert.equal((await author('upload.recover',{originalRequestId:publishId})).data.offer.id,published.data.offer.id);
 actor={...actor,userId:BUYER,sessionId:BUYER_SESSION};
 const buyerRead=await author('offer.read',{offerId:published.data.offer.id});assert.equal(buyerRead.code,200);assert.equal(buyerRead.data.upload,undefined);
 const quoteSQL=store=>service+`select public.native_store_sandbox_command_v1('${BUYER}','${BUYER_SESSION}','offer','${randomUUID()}',${sqlJson({offerId:published.data.offer.id,store})});`;
 for(const store of ['APP_STORE','PLAY_STORE']){
  const quote=JSON.parse(q(quoteSQL(store)));assert.equal(quote.status,'ok');assert.equal(quote.data.quote.asset.id,upload.assetId);
  assert.equal(quote.data.quote.asset.sha256,sha);assert.equal(quote.data.quote.catalog.store,store);assert.equal(quote.dispatchAllowed,false);
 }
 assert.equal(count('native_store_catalog_bindings'),2);assert.equal(writes,1);
 cases.push('Ordinary native publication now succeeds once and recovers, creates dual-store bindings, and gives the Free buyer exact APP_STORE/PLAY_STORE quotes without upload disclosure, dispatch, payment or access grant.');

 const identity=()=>q(`select jsonb_build_array(id,resource_id,asset_id,incarnation,expected_sha256,object_version) from sandbox_commerce_v1.paid_video_uploads where id='${uploadId}';`);
 const beforeRemoval=identity();
 q("update sandbox_commerce_v1.lifecycle set state='retired';update sandbox_commerce_v1.paid_video_operations_config set enabled=false;");
 const publishedSnapshot=JSON.parse(q(subject(BUYER,BUYER_SESSION)+reviewSql('inspect',inspect)));
 const removal=makeReview({snapshot:publishedSnapshot,decision:'removed',evidenceSha256:'d'.repeat(64),reviewedAt:new Date().toISOString(),humanReviewConfirmed:true});
 assert.equal(JSON.parse(q(subject(BUYER,BUYER_SESSION)+reviewSql('decide',removal))).decision,'removed');
 q("update sandbox_commerce_v1.lifecycle set state='active';update sandbox_commerce_v1.paid_video_operations_config set enabled=true;");
 const removedSnapshot=JSON.parse(q(subject(BUYER,BUYER_SESSION)+reviewSql('inspect',inspect)));
 for(const [next,pattern] of [['held',/paid_video_removed_history_permanent/u],['clear',/paid_video_moderation_invalid/u]]){
  h.rejects(subject(BUYER,BUYER_SESSION)+reviewSql('decide',makeReview({...decision,requestId:randomUUID(),snapshot:removedSnapshot,decision:next})),pattern);
 }
 h.rejects(`update sandbox_commerce_v1.paid_video_uploads set moderation='held' where id='${uploadId}';`,/paid_video_removed_history_permanent/u);
 h.rejects(`update sandbox_commerce_v1.offers set status='published' where resource_id='${upload.resourceId.slice(14)}';`,/paid_video_removed_history_permanent/u);
 h.rejects('delete from sandbox_commerce_v1.paid_video_removals;',/immutable/u);
 for(const store of ['APP_STORE','PLAY_STORE'])h.rejects(quoteSQL(store),/sandbox_immutable_clean_asset_required/u);
 assert.equal((await author('offer.read',{offerId:published.data.offer.id})).code,503);
 assert.equal(count('paid_video_removals'),1);assert.equal(count('paid_video_reviews'),2);assert.equal(identity(),beforeRemoval);
 assert.equal(q(`select moderation from sandbox_commerce_v1.delivery_assets where id='${upload.assetId.slice(11)}';`),'removed');
 for(const table of ['intents','receipts','resource_grants','native_store_selections'])assert.equal(count(table),0,table);
 assert.equal(v3State(),initialV3);assert.equal(count('test_store_v3_native_profiles'),0);
 assert.equal(q('select preparation_enabled from sandbox_commerce_v1.native_store_quote_controls;'),'f');
 h.rejects(service+"select public.isolated_paid_video_worker_v1('lease',null,null,null,null);",/permission denied/u);
 h.rejects("set role sbx_v1_operator;select sandbox_commerce_v1.paid_video_moderate(null,'clear',null);",/permission denied/u);
 cases.push('Independent removal still works while positive operations/lifecycle are disabled; immutable tombstone blocks held/clear resurrection, republishing and both buyer quotes after reactivation. V3 stays unchanged/off and legacy bypasses stay revoked.');
 for(const [file,hash] of Object.entries(sourceHashes))assert.equal(digest(fs.readFileSync(path.join(root,file))),hash,file+' changed during proof');
 return{protocol:'native-paid-video-combined-operations-source-proof-v1',passed:cases.length,cases,configurationDigest:configuration,
  sourceHashes,realPostgres:true,realHttpHandlers:true,realVerifierAndWorkerHmac:true,syntheticAuthStorageScanner:true,hostedQualified:false};
}
