#!/usr/bin/env node
// Actual current SQL + actual FFmpeg/ClamAV + real runner orchestration.
// Auth JWT/service claims, provider qualification and object storage are LOCAL
// SYNTHETIC facts. This is not a hosted/provider/device deployment receipt.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createTestStoreCluster } from '../../isolated-runtime/sandbox-commerce-v1/tests/test-store.fixture.mjs';
import { seedV3Qualified, V3_FIXTURE, SELLER, SELLER_SESSION, BUYER, BUYER_SESSION, sqlText, sqlJson } from '../../isolated-runtime/sandbox-commerce-v1/tests/test-store-v3.fixture.mjs';
import { runBounded } from '../isolated-paid-video-worker/scan.mjs';
import { executeScanTicket } from '../isolated-paid-video-worker/job.mjs';
import { runWorker, workerStatus, journalState, hash } from './runner.mjs';

assert.equal(process.argv.length, 8, 'Use --local-bin /pg17/bin --database /clamdb --certificates /certs');
assert.equal(process.argv[2], '--local-bin'); assert.equal(process.argv[4], '--database'); assert.equal(process.argv[6], '--certificates');
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../..');
const baseline = '12335a768fb683267ac281b1a180f9650479a98d';
const sourceHashes = {}, read = file => { const text = fs.readFileSync(path.join(repo, file), 'utf8'); sourceHashes[file] = hash(text); return text; };
const baseFiles = new Set(['core.sql','premium-authority.sql','authority.sql','commands.sql','receipts.sql','test-store.sql','test-store-offerings-core.sql',
 'test-store-qualification.sql','test-store-offerings-provisioning.sql','test-store-offerings-commands.sql','test-store-offerings-receipts.sql',
 'history.sql','resource-graphs.sql','delivery-authority.sql','permissions-finalize.sql','tests/authority.fixture.sql','tests/premium-authority.fixture.sql']);
const sql = file => {
 const name = 'isolated-runtime/sandbox-commerce-v1/' + file, local = read(name);
 if (!baseFiles.has(file)) return local;
 const frozen = execFileSync('git',['show',baseline+':'+name],{cwd:repo,encoding:'utf8',maxBuffer:4*1024*1024});
 assert.equal(local,frozen,'Published baseline drift: '+name); return frozen;
};
const declaration = 'create table sandbox_commerce_v1.declarations(user_id uuid primary key,session_id uuid,\n declared_18_plus boolean,country_code text,region_code text,declaration_version text,updated_at timestamptz);';
const authority = sql('tests/authority.fixture.sql'); assert.equal(authority.split(declaration).length, 2);
const modules = ['premium-authority.sql','authority.sql','commands.sql','receipts.sql','test-store.sql','test-store-offerings-core.sql',
 'test-store-qualification.sql','test-store-offerings-provisioning.sql','test-store-offerings-commands.sql','test-store-offerings-receipts.sql',
 'history.sql','resource-graphs.sql','delivery-authority.sql','paid-video-install-context-v2.sql','paid-video-install-grant-v2.sql',
 'paid-video-media.sql','paid-video-upload.sql','paid-video-commands.sql','paid-video-install-revoke-v2.sql','test-store-paid-video-core.sql',
 'candidates/paid-video-plan-lifecycle/lifecycle.sql','candidates/paid-video-combined-readiness/commands.sql',
 'candidates/paid-video-checkout-recovery/abandon.sql','candidates/paid-video-plan-lifecycle/provisioning.sql','test-store-paid-video-receipts.sql',
 'paid-video-install-grant-v2.sql','paid-video-access.sql','candidates/paid-video-combined-readiness/gateway.sql',
 'candidates/paid-video-combined-readiness/media.sql'];
const install = 'begin;create role anon nologin;create role authenticated nologin;create role service_role nologin;'
 + 'alter default privileges for role postgres grant execute on functions to authenticated;'
 + sql('core.sql') + sql('tests/premium-authority.fixture.sql') + authority.replace(declaration, '-- Actual core declarations.')
 + 'create table public.channel_audience_blocks(channel_user_id text,blocked_user_id text);'
 + modules.map(sql).join('\n') + read('ops/isolated-paid-video-operations-v2/operations.sql') + read('ops/isolated-paid-video-operations-v2/monotonic-removal.sql')
 + sql('paid-video-install-revoke-v2.sql') + sql('permissions-finalize.sql') + 'commit;';
for (const name of ['runner.mjs','operations.native.mjs','worker.mjs','reviewer.mjs','scan-child.mjs']) read('ops/isolated-paid-video-operations-v2/' + name);
for (const name of ['job.mjs','scan.mjs','private-object.mjs']) read('ops/isolated-paid-video-worker/' + name);
for (const name of ['test-store.fixture.mjs','test-store-v3.fixture.mjs','receipts.fixture.mjs']) read('isolated-runtime/sandbox-commerce-v1/tests/' + name);
const cluster = createTestStoreCluster(process.argv[3]), q = cluster.q, cases = [];
const work = fs.mkdtempSync('/tmp/scpv-operations-'); fs.chmodSync(work, 0o700);
const stateDirectory = path.join(work, 'state'); fs.mkdirSync(stateDirectory, { mode: 0o700 });
const route = randomUUID(), worker = randomUUID(), verifier = randomUUID(), workerKey = randomBytes(32), verifierKey = randomBytes(32);
const binding = { protocol: 'scpv-operations-binding-v1', projectRef: 'abcdefghijklmnopqrst', endpoint: 'https://abcdefghijklmnopqrst.supabase.co',
 installationId: randomUUID(), sourceSha256: '1'.repeat(64), workerId: worker, workerSha256: '2'.repeat(64),
 verifierId: verifier, verifierEvidenceSha256: '3'.repeat(64), configurationDigest: V3_FIXTURE.configurationDigest, routeId: route, qualificationSha256: '4'.repeat(64) };
const service = "set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}';";
const actor = (uid = BUYER, sid = BUYER_SESSION) => `set role authenticated;set request.jwt.claims=${sqlText(JSON.stringify({ role: 'authenticated', sub: uid, session_id: sid }))};`;
const opSql = (action, raw) => `select public.isolated_paid_video_operations_v1(${sqlText(action)},${sqlText(raw)});`;
const reviewSql = (action, raw) => `select public.isolated_paid_video_review_v1(${sqlText(action)},${sqlText(raw)});`;
const scanConfig = { databaseDirectory: process.argv[5], certificateDirectory: process.argv[7], binaries: {
 ffmpeg: '/usr/local/bin/ffmpeg', ffprobe: '/usr/local/bin/ffprobe', clamscan: '/usr/local/bin/clamscan', sigtool: '/usr/local/bin/sigtool' } };
let report, primaryFailure, cleanupFailure;
try {
 cluster.start(install); seedV3Qualified(q);
 assert.equal(q("select has_schema_privilege('sbx_v1_core_owner','public','CREATE');"), 'f');
 for (const role of ['anon','authenticated']) cluster.rejects(`set role ${role};` + opSql('recover','{}'), /permission denied/u);
 cluster.rejects(service + "select public.isolated_paid_video_worker_v1('lease',null,null,null,null);", /permission denied/u);
 cluster.rejects(service + reviewSql('inspect','{}'), /permission denied/u);
 cluster.rejects("set role sbx_v1_operator;select sandbox_commerce_v1.paid_video_moderate(null,'clear',null);",/permission denied/u);
 assert.equal(q("select count(*) from sandbox_commerce_v1.paid_video_reviewers;"), '0');
 cases.push('Fresh inactive installation: explicit RPC ACLs, legacy worker bypass closed, no reviewers provisioned, public CREATE revoked.');
 const nextRaw = () => JSON.stringify({ protocol: 'scpv-operations-request-v1', requestId: randomUUID(), command: 'lease-next', binding });
 cluster.rejects(service + opSql('execute', nextRaw()), /query returned no rows/u);
 q(`insert into sandbox_commerce_v1.paid_video_routes values('${route}','s3','synthetic-private-media','${'1'.repeat(64)}',true);
 insert into sandbox_commerce_v1.paid_video_workers values('${worker}',decode('${workerKey.toString('hex')}','hex'),'${binding.workerSha256}',true);
 insert into sandbox_commerce_v1.paid_video_verifiers values('${verifier}',decode('${verifierKey.toString('hex')}','hex'),'${binding.verifierEvidenceSha256}',true);
 update sandbox_commerce_v1.paid_video_gateway_controls set enabled=true,route_id='${route}',worker_id='${worker}',verifier_id='${verifier}',qualification_sha256='${binding.qualificationSha256}';
 insert into sandbox_commerce_v1.paid_video_operations_config values(true,${sqlJson(binding)},false);`);
 cluster.rejects(service + opSql('execute', nextRaw()), /paid_video_operations_unavailable/u);
 q('update sandbox_commerce_v1.paid_video_operations_config set enabled=true;');
 const wrong = JSON.parse(nextRaw()); wrong.binding = { ...binding, sourceSha256: 'f'.repeat(64) };
 cluster.rejects(service + opSql('execute', JSON.stringify(wrong)), /paid_video_operations_binding_invalid/u);
 assert.equal(JSON.parse(q(service + opSql('execute', nextRaw()))).result.state, 'empty');
 cases.push('Absent/disabled configuration and changed source fail closed; automatic queue returns bounded empty acknowledgement.');
 const file = path.join(work, 'generated.mp4');
 assert.equal((await runBounded(scanConfig.binaries.ffmpeg, ['-nostdin','-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=24:d=2',
 '-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',file])).code, 0);
 const bytes = fs.readFileSync(file), sha = hash(bytes);
 const reserve = { protocol: 'isolated-paid-video-v1', requestId: randomUUID(), title: 'Actual local operations scan', expectedSha256: sha, expectedByteLength: bytes.length };
 const reserved = JSON.parse(q(actor(SELLER, SELLER_SESSION) + `select public.isolated_paid_video_v2('upload.reserve',${sqlJson(reserve)},'${SELLER}','${SELLER_SESSION}','${binding.configurationDigest}');`)).data.upload;
 const uploadId = reserved.id.slice(12), transfer = randomUUID(), request = randomUUID(), version = 'synthetic-version-1';
 const observation = JSON.stringify({ protocol: 'scpv-object-observation-v2', uploadId: reserved.id, userId: SELLER, requestId: request,
 transferId: transfer, originalSessionId: SELLER_SESSION, originalConfigurationDigest: binding.configurationDigest, verifierId: verifier,
 incarnation: reserved.incarnation, sha256: sha, objectVersion: version, byteLength: bytes.length });
 // Synthetic authenticated origin receipt ONLY; real cloud object qualification
 // is a prerequisite and is deliberately not claimed by this fixture.
 q(`insert into sandbox_commerce_v1.paid_video_transfers(id,upload_id,user_id,session_id,request_id) values('${transfer}','${uploadId}','${SELLER}','${SELLER_SESSION}','${request}');
 insert into sandbox_commerce_v1.paid_video_gateway_transfers values('${transfer}','${binding.configurationDigest}');
 insert into sandbox_commerce_v1.paid_video_object_receipts(upload_id,transfer_id,verifier_id,object_version,observation_raw,signature)
 values('${uploadId}','${transfer}','${verifier}','${version}',${sqlText(observation)},'${createHmac('sha256',verifierKey).update(observation).digest('hex')}');
 update sandbox_commerce_v1.paid_video_uploads set state='scan_pending',object_version='${version}' where id='${uploadId}';`);
 const held = await cluster.held(`begin;select id from sandbox_commerce_v1.paid_video_uploads where id='${uploadId}' for update;`);
 try { assert.equal(JSON.parse(q(service+opSql('execute',nextRaw()))).result.state,'empty'); }
 finally { await held.finish('rollback'); }
 cases.push('Concurrent private queue row lock is skipped without waiting, issuing a lease or changing the upload.');
 let lostLease = true, lostResult = true, localFailure = true, scans = 0, kernelRuns = 0, executions = 0, recoveries = 0;
 const rpc = async (action, raw) => {
  if (action === 'execute') executions++; else if (action === 'recover') recoveries++;
  const response = JSON.parse(q(service + opSql(action, raw)));
  const command = JSON.parse(raw).command;
  if (action === 'execute' && ((command === 'lease-next' && lostLease) || (command === 'result' && lostResult))) {
   if (command === 'lease-next') lostLease = false; else lostResult = false;
   throw new Error('synthetic post-commit response loss');
  }
  return response;
 };
 const scan = async ticket => {
  scans++; assert.equal(ticket.objectVersion, version);
  if(localFailure){localFailure=false;throw Error('Injected definite local configuration failure before scanner dispatch');}
  kernelRuns++;
  const signed = await executeScanTicket({ ticket, workerKey, transport: { async readForScan(object) {
   assert.equal(object.expectedSha256, sha); return { bytes, objectVersion: version };
  } }, workDirectory: work, scanner: scanConfig });
  assert.equal(JSON.parse(signed.raw).result.verdict, 'clean');
  const leaseRaw = JSON.parse(fs.readFileSync(path.join(stateDirectory, 'state.json'))).raw;
  const resultRaw = JSON.stringify({ protocol: 'scpv-operations-request-v1', requestId: randomUUID(), command: 'result', binding,
   leaseRequestId: JSON.parse(leaseRaw).requestId, raw: signed.raw, signature: signed.signature });
  q('update sandbox_commerce_v1.paid_video_gateway_controls set enabled=false;');
  cluster.rejects(service + opSql('execute', resultRaw), /paid_video_operations_unavailable/u);
  q('update sandbox_commerce_v1.paid_video_gateway_controls set enabled=true;');
  q(`update sandbox_commerce_v1.paid_video_workers set active=false where id='${worker}';`);
  cluster.rejects(service + opSql('execute', resultRaw), /paid_video_operations_unavailable/u);
  q(`update sandbox_commerce_v1.paid_video_workers set active=true where id='${worker}';`);
  const changed = JSON.parse(resultRaw); changed.raw = JSON.stringify({ ...JSON.parse(signed.raw), objectVersion: 'different' });
  cluster.rejects(service + opSql('execute', JSON.stringify(changed)), /paid_video_operations_lease_invalid/u);
  return signed;
 };
 const run = recovery => runWorker({ binding, directory: stateDirectory, rpc, scan, deadline: Date.now()+600000,recovery,recoveryAuthorizationSha256:'c'.repeat(64) });
 assert.equal((await run()).state, 'unknown'); assert.equal(scans, 0);
 const retainedLease = JSON.parse(fs.readFileSync(path.join(stateDirectory,'state.json'))).raw;
 q('update sandbox_commerce_v1.paid_video_gateway_controls set enabled=false;');
 cluster.rejects(service+opSql('check',retainedLease),/paid_video_operations_unavailable/u);
 // Clone only the protected local state for this isolated retirement scenario.
 // The lease and recover/check calls are actual SQL; only client time is advanced.
 const heldStateDirectory=path.join(work,'held-state');fs.mkdirSync(heldStateDirectory,{mode:0o700});
 const originalState=fs.readFileSync(path.join(stateDirectory,'state.json'),'utf8');
 await journalState(heldStateDirectory,null,JSON.parse(originalState),'fixture_known_lease_clone');
 const heldCalls=[],heldRpc=async(action,raw)=>{heldCalls.push(action);return JSON.parse(q(service+opSql(action,raw)));};
 const heldArgs={binding,directory:heldStateDirectory,rpc:heldRpc,scan:async()=>assert.fail('held lease must not scan'),deadline:Date.now()+10000};
 assert.equal((await runWorker(heldArgs)).state,'held');
 const heldStatus=await workerStatus(heldStateDirectory),afterExpiry=Date.parse(heldStatus.expiresAt)+1;
 await assert.rejects(runWorker({...heldArgs,now:()=>afterExpiry,deadline:afterExpiry+10000}),/ticket_invalid/u);
 const retire={...heldStatus,action:'retire',requestId:randomUUID(),authorizationSha256:'c'.repeat(64),processesStoppedConfirmed:true,
  reason:'Synthetic local operator retires exact acknowledged lease after held admission and client expiry.',resolutionEvidenceSha256:'e'.repeat(64)};
 assert.equal((await runWorker({...heldArgs,now:()=>afterExpiry,deadline:afterExpiry+10000,recovery:retire,recoveryAuthorizationSha256:'c'.repeat(64)})).state,'retired_scan');
 assert.deepEqual(heldCalls,['recover','check','recover']);assert.equal(fs.readFileSync(path.join(stateDirectory,'state.json'),'utf8'),originalState);
 assert.equal(q('select count(*) from sandbox_commerce_v1.paid_video_tickets;'),'1');
 assert.equal(q('select count(*) from sandbox_commerce_v1.paid_video_scan_results;'),'0');
 cases.push('Acknowledged lease held by real SQL admission can be explicitly retired after simulated client expiry using only exact read-only recovery; no scan, new lease, result, or alteration of original mutation state.');
 q('update sandbox_commerce_v1.paid_video_gateway_controls set enabled=true;');
 assert.equal((await run()).state, 'interrupted_scan'); assert.equal(scans, 1);
 assert.equal((await run()).state, 'interrupted_scan'); assert.equal(scans, 1);
 const interruptedState=fs.readFileSync(path.join(stateDirectory,'state.json'),'utf8');
 const recovery={...(await workerStatus(stateDirectory)),action:'resume',requestId:randomUUID(),authorizationSha256:'c'.repeat(64),
  processesStoppedConfirmed:true,reason:'Synthetic local operator reviewed and corrected the injected local configuration fault.',resolutionEvidenceSha256:'d'.repeat(64)};
 assert.equal((await run(recovery)).state,'unknown');assert.equal(scans,2);assert.equal(kernelRuns,1);
 await assert.rejects(run({...recovery,action:'retire'}),/recovery_invalid/u);
 assert.equal((await run()).state, 'complete'); assert.equal(scans, 2); assert.equal(executions, 2); assert.equal(recoveries, 3);
 const auditRecords=fs.readdirSync(stateDirectory).filter(n=>n.startsWith('audit-')).map(n=>JSON.parse(fs.readFileSync(path.join(stateDirectory,n),'utf8')));
 assert.ok(auditRecords.some(a=>a.event==='operator_resumed_scan'&&a.detail.expectedStateSha256===hash(interruptedState)));
 assert.equal(auditRecords.filter(a=>a.event==='mutation_dispatch_prepared').length,2);
 assert.equal(q(`select state||':'||moderation from sandbox_commerce_v1.paid_video_uploads where id='${uploadId}';`), 'clean:unreviewed');
 assert.equal(q('select count(*) from sandbox_commerce_v1.paid_video_tickets;'), '1');
 cases.push('Actual FFmpeg/ClamAV kernel after explicit audited recovery of local error: one kernel run/one ticket/two mutations; lost lease/result acknowledgements recovered read-only, unknown result cannot be retired, clean remains unreviewed.');
 cases.push('Current disabled controls/inactive worker and wrong exact object version reject positive result before ingestion.');
 const makeReview = fields => ({ protocol: 'scpv-review-request-v1', requestId: randomUUID(), reviewerId: BUYER, sessionId: BUYER_SESSION, uploadId: reserved.id, ...fields });
 const inspect = JSON.stringify(makeReview());
 cluster.rejects(actor() + reviewSql('inspect',inspect), /query returned no rows/u);
 q(`insert into sandbox_commerce_v1.paid_video_reviewers values('${BUYER}','${'9'.repeat(64)}',true),('${SELLER}','${'8'.repeat(64)}',true);`);
 cluster.rejects(actor(SELLER,SELLER_SESSION) + reviewSql('inspect',JSON.stringify(makeReview({ reviewerId: SELLER, sessionId: SELLER_SESSION }))), /paid_video_independent_reviewer_required/u);
 const snapshot = JSON.parse(q(actor() + reviewSql('inspect',inspect)));
 const decision = makeReview({ snapshot, decision: 'clear', evidenceSha256: '6'.repeat(64), reviewedAt: new Date().toISOString(), humanReviewConfirmed: true });
 cluster.rejects(actor() + reviewSql('decide',JSON.stringify({ ...decision, humanReviewConfirmed: false })), /paid_video_review_evidence_invalid/u);
 cluster.rejects(actor() + reviewSql('decide',JSON.stringify({ ...decision, snapshot: { ...snapshot, sha256: '0'.repeat(64) } })), /paid_video_review_evidence_invalid/u);
 q(`update auth.sessions set not_after=clock_timestamp()-interval '1 minute' where id='${BUYER_SESSION}';`);
 cluster.rejects(actor() + reviewSql('decide',JSON.stringify(decision)), /sandbox_.*authority|sandbox_session/u);
 q(`update auth.sessions set not_after=clock_timestamp()+interval '1 hour' where id='${BUYER_SESSION}';`);
 const accepted = JSON.parse(q(actor() + reviewSql('decide',JSON.stringify(decision)))); assert.equal(accepted.decision, 'clear');
 assert.deepEqual(JSON.parse(q(actor() + reviewSql('recover',JSON.stringify(decision)))), accepted);
 assert.equal(q('select count(*) from sandbox_commerce_v1.paid_video_reviews;'), '1');
 cluster.rejects('update sandbox_commerce_v1.paid_video_reviews set decision=\'removed\';', /immutable/u);
 cases.push('Explicit reviewer provisioning/current session/independence required; altered snapshot and nonhuman approval denied; decision journal immutable and read-only recovery exact.');
 // Clone the clean actual-scanned unpublished fixture to test each boundary
 // independently; no synthetic clean scan is introduced by these scenarios.
 cluster.freshDatabase();
 const immutableTuple=()=>q(`select jsonb_build_array(id,resource_id,asset_id,incarnation,expected_sha256,object_version) from sandbox_commerce_v1.paid_video_uploads where id='${uploadId}';`);
 const tupleBefore=immutableTuple();
 q("update sandbox_commerce_v1.lifecycle set state='retired';");
 const retiredSnapshot = JSON.parse(q(actor() + reviewSql('inspect',inspect)));
 const removed = makeReview({ snapshot: retiredSnapshot, decision: 'removed', evidenceSha256: '7'.repeat(64), reviewedAt: new Date().toISOString(), humanReviewConfirmed: true });
 assert.equal(JSON.parse(q(actor() + reviewSql('decide',JSON.stringify(removed)))).decision, 'removed');
 q("update sandbox_commerce_v1.lifecycle set state='active';");
 const removedSnapshot = JSON.parse(q(actor() + reviewSql('inspect',inspect)));
 cluster.rejects(actor()+reviewSql('decide',JSON.stringify({...decision,requestId:randomUUID(),snapshot:removedSnapshot,decision:'held'})),/paid_video_removed_history_permanent/u);
 cluster.rejects(actor() + reviewSql('decide',JSON.stringify({ ...decision, requestId: randomUUID(), snapshot: removedSnapshot })), /paid_video_moderation_invalid/u);
 cluster.rejects(`select sandbox_commerce_v1.paid_video_moderate('${uploadId}','held','${'f'.repeat(64)}');`,/paid_video_removed_history_permanent/u);
 cluster.rejects(`select sandbox_commerce_v1.paid_video_moderate('${uploadId}','clear','${'f'.repeat(64)}');`,/paid_video_moderation_invalid/u);
 cluster.rejects(`update sandbox_commerce_v1.paid_video_uploads set moderation='held' where id='${uploadId}';`,/paid_video_removed_history_permanent/u);
 assert.equal(q(`select count(*) from sandbox_commerce_v1.delivery_assets where resource_id='${reserved.resourceId.slice(14)}';`),'0');
 assert.equal(q('select count(*) from sandbox_commerce_v1.paid_video_removals;'),'1');
 assert.equal(immutableTuple(),tupleBefore);
 cluster.rejects('delete from sandbox_commerce_v1.paid_video_removals;',/immutable/u);
 cases.push('Unpublished same upload/incarnation/hash/version: removed→held→clear blocked through authenticated review, underlying legacy core API and direct row update; immutable removal survives without a delivery asset.');
 const resourceId=reserved.resourceId.slice(14);
 const publication=()=>actor(SELLER,SELLER_SESSION)+`select public.isolated_paid_video_v2('offer.publish',${sqlJson({protocol:'isolated-paid-video-v1',requestId:randomUUID(),uploadId:reserved.id,expectedRevision:1,amountMinor:199,currency:'usd'})},'${SELLER}','${SELLER_SESSION}','${binding.configurationDigest}');`;
 cluster.rejects(publication(),/paid_video_publication_evidence_unavailable/u);
 // A later resource revision and different asset cannot erase resource removal.
 const newAsset=randomUUID(),newIncarnation=randomUUID();
 const assetSql=(revision=2)=>`insert into sandbox_commerce_v1.delivery_assets(id,resource_id,resource_revision,owner_id,purpose,provider,bucket,object_key,object_version,incarnation,sha256,byte_length,state,moderation)
 values('${newAsset}','${resourceId}',${revision},'${SELLER}','video','s3','synthetic-private-media','sandbox-commerce-v1/${SELLER}/scv1_resource_${resourceId}/scv1_asset_${newAsset}/${newIncarnation}.mp4','new-version','${newIncarnation}','${sha}',${bytes.length},'retained','clear');`;
 q(`insert into sandbox_commerce_v1.resource_versions(resource_id,revision,creator_id,kind,title,price_minor,currency) values('${resourceId}',2,'${SELLER}','paid_content','Revision cannot restore removal',199,'usd');`);
 cluster.rejects(assetSql(),/paid_video_removed_history_permanent/u);
 cluster.rejects(`update sandbox_commerce_v1.resources set revision=2,status='published' where id='${resourceId}';`,/paid_video_removed_history_permanent/u);
 cases.push('Removed resource cannot publish or acquire a clear asset under a new revision/incarnation; tombstone is resource-scoped, not current-row-only.');
 cluster.freshDatabase();
 const published=JSON.parse(q(publication()));assert.equal(published.status,'ok');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.delivery_assets where resource_id='${resourceId}';`),'1');
 const publishedSnapshot=JSON.parse(q(actor()+reviewSql('inspect',inspect)));
 const publishedRemoval=makeReview({snapshot:publishedSnapshot,decision:'removed',evidenceSha256:'7'.repeat(64),reviewedAt:new Date().toISOString(),humanReviewConfirmed:true});
 assert.equal(JSON.parse(q(actor()+reviewSql('decide',JSON.stringify(publishedRemoval)))).decision,'removed');
 cluster.rejects(`select sandbox_commerce_v1.paid_video_moderate('${uploadId}','held','${'f'.repeat(64)}');`,/paid_video_removed_history_permanent/u);
 cluster.rejects(`update sandbox_commerce_v1.offers set status='published' where resource_id='${resourceId}';`,/paid_video_removed_history_permanent/u);
 assert.equal(q(`select moderation from sandbox_commerce_v1.delivery_assets where resource_id='${resourceId}';`),'removed');
 cases.push('After actual source publication, removal keeps upload and existing asset removed and rejects offer republishing and legacy held transition.');
 cluster.freshDatabase();
 q(`insert into sandbox_commerce_v1.resource_versions(resource_id,revision,creator_id,kind,title,price_minor,currency) values('${resourceId}',2,'${SELLER}','paid_content','Concurrent revision',199,'usd');`);
 const removalTx=await cluster.held(`begin;select sandbox_commerce_v1.paid_video_moderate('${uploadId}','removed','${'f'.repeat(64)}');`);
 try { cluster.rejects(assetSql(),/could not obtain lock/u); }
 finally { await removalTx.finish('commit'); }
 cluster.rejects(assetSql(),/paid_video_removed_history_permanent/u);
 cluster.rejects(publication(),/paid_video_publication_evidence_unavailable/u);
 cases.push('Concurrent uncommitted removal fences new asset admission with NOWAIT; after commit, immutable history rejects publication and revision asset insertion.');
 for (const [name, digest] of Object.entries(sourceHashes)) assert.equal(hash(fs.readFileSync(path.join(repo,name))), digest, 'Source changed: '+name);
 report = { protocol: 'scpv-operations-native-proof-v2', baseline, passed: cases.length, cases, sourceHashes,
  boundaries: { postgres: 'actual local 17.6', scanner: 'actual FFmpeg/ClamAV', auth: 'synthetic claims/current local Auth tables', objectOrigin: 'synthetic local bytes and verifier receipt', provider: 'synthetic qualification', deployment: false } };
} catch (error) { primaryFailure = error; cluster.captureFailure(); }
finally {
 try { await cluster.close(); fs.rmSync(work, { recursive: true, force: true }); } catch (error) { cleanupFailure = error; }
}
if (primaryFailure || cleanupFailure) {
 process.stderr.write(JSON.stringify(cluster.diagnostics(primaryFailure,cleanupFailure),null,2)+'\n'); process.exit(1);
}
report.cleanup = cluster.cleanup;
process.stdout.write(JSON.stringify(report,null,2)+'\n');
