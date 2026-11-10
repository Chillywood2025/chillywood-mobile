import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {SELLER,SELLER_SESSION,sqlJson,sqlText,seedV3Qualified,V3_FIXTURE} from '../sandbox-commerce-v1/tests/test-store-v3.fixture.mjs';
export function runS3V3Cases({h,q,profile,worker,verifier,verifierKey,workerKey,sha,length,result}){
 const configuration='8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0',route='00000000-0000-4000-8000-000000000001';
 const subject=`set role authenticated;set request.jwt.claims=${sqlText(JSON.stringify({role:'authenticated',sub:SELLER,session_id:SELLER_SESSION}))};`;
 const service="set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}';";
 const core="set role sbx_v1_core_owner;set request.jwt.claims='{\"role\":\"service_role\"}';";
 const read=s=>JSON.parse(q(s));
 const command=(name,payload={},config=configuration)=>`select public.isolated_paid_video_v2('${name}',${sqlJson({protocol:'isolated-paid-video-v1',requestId:randomUUID(),...payload})},'${SELLER}','${SELLER_SESSION}','${config}');`;
 q(`insert into sandbox_commerce_v1.paid_video_native_authoring_profiles values('${configuration}','${route}','${worker}','${verifier}',repeat('4',64),true);
 update sandbox_commerce_v1.paid_video_gateway_controls set enabled=true,route_id='${route}',worker_id='${worker}',verifier_id='${verifier}',qualification_sha256=repeat('4',64);
 update sandbox_commerce_v1.r2_profiles set enabled=false where id='${profile}';`);
 const upload=read(subject+command('upload.reserve',{title:'Existing S3 stays S3',expectedSha256:sha,expectedByteLength:length})).data.upload;
 q(`update sandbox_commerce_v1.r2_profiles set enabled=true where id='${profile}';`);
 const uid=upload.id.slice(12),request=randomUUID();
 const mode=read(service+`select public.native_paid_video_r2_route_v1('${SELLER}','${SELLER_SESSION}','${uid}','${configuration}');`);
 assert.deepEqual(mode,{protocol:'scpv-storage-route-v1',mode:'s3'});
 const issued=read(service+`select public.isolated_paid_video_upload_v2('issue','${uid}','${SELLER}','${SELLER_SESSION}','${request}',null,'${configuration}');`);
 assert.equal(issued.object.provider,'s3');assert.equal(issued.object.routeId,route);
 const observation={protocol:'scpv-object-observation-v2',userId:SELLER,sessionId:SELLER_SESSION,uploadId:upload.id,requestId:request,transferId:issued.transferId,
  originalSessionId:SELLER_SESSION,configurationDigest:configuration,originalConfigurationDigest:configuration,verifierId:verifier,incarnation:upload.incarnation,sha256:sha,byteLength:length,
  objectVersion:'real-synthetic-s3-VersionId',checkedAtMs:Date.now(),expiresAtMs:Date.now()+4000};
 const raw=JSON.stringify(observation),sign=(raw,key)=>createHmac('sha256',key).update(raw).digest('hex');
 assert.equal(read(service+`select public.isolated_paid_video_reconcile_v2(${sqlText(raw)},'${sign(raw,verifierKey)}','${SELLER}','${SELLER_SESSION}');`).objectVersion,observation.objectVersion);
 assert.equal(read(subject+command('upload.finalize',{uploadId:upload.id})).data.upload.state,'scan_pending');
 const ticket=read(core+`select sandbox_commerce_v1.paid_video_lease('${uid}','${worker}');`);
 const scan={protocol:'scpv-worker-result-v1',ticketId:ticket.ticketId,uploadId:upload.id,incarnation:upload.incarnation,objectVersion:observation.objectVersion,
  result:{...result,checkedAt:new Date().toISOString()}};
 const scanRaw=JSON.stringify(scan);assert.equal(read(core+`select sandbox_commerce_v1.paid_video_scan_ingest(${sqlText(scanRaw)},'${sign(scanRaw,workerKey)}');`).upload.state,'clean');
 q(core+`select sandbox_commerce_v1.paid_video_moderate('${uid}','clear',repeat('8',64));`);
 const published=read(subject+command('offer.publish',{uploadId:upload.id,expectedRevision:1,amountMinor:99,currency:'usd'}));assert.equal(published.status,'ok');
 assert.equal(q(`select provider='s3' and object_version='real-synthetic-s3-VersionId' and r2_identity is null from sandbox_commerce_v1.delivery_assets where id='${upload.assetId.slice(11)}';`),'t');
 seedV3Qualified(q,{seedAuthority:false});
 assert.equal(read(subject+command('capability.read',{},V3_FIXTURE.configurationDigest)).data.transferAvailable,true);
 const v3=read(subject+command('upload.reserve',{title:'V3 stays isolated',expectedSha256:sha,expectedByteLength:length},V3_FIXTURE.configurationDigest)).data.upload;
 h.rejects(subject+command('upload.read',{uploadId:v3.id}),/authoring_mode_conflict/u);
 h.rejects(service+`select public.native_paid_video_r2_admit_v1('upload','${SELLER}','${SELLER_SESSION}','${v3.id.slice(12)}','${randomUUID()}','${configuration}',null,null);`,/authoring_mode_conflict/u);
 h.rejects(subject+command('offer.read',{offerId:published.data.offer.id},V3_FIXTURE.configurationDigest),/authoring_mode_conflict/u);
 return 'Coexisting native S3 reservation/upload/HMAC receipt/scan/publication remains genuine VersionId with null R2 identity; V3 capability/reservation still work and native/V3 cross-mode attempts reject.';
}
