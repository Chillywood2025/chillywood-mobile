import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import * as objectSource from '../../ops/isolated-paid-video-worker/private-object.mjs';
import * as nativeObject from '../../ops/isolated-paid-video-worker/native-private-object.mjs';
// Called only after the genuine worker has allocated a receipt/link/grant. The
// private storage/scanner evidence and returned object bytes are synthetic.
export async function runNativeAccessCases(x,positive){
 const {q,actor,root,ts,route,asset,other,otherSession}=x;
 const {f,receipt,result}=positive;let cases=0;
 const grantId=result.nativeConsumerEffect.grantId,resourceId=f.quote.resourceId;
 const service="set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}';";
 const rpc=(who=actor)=>`public.native_store_paid_video_access_v1('${who.userId}','${who.sessionGeneration}','${resourceId.slice(14)}','${grantId.slice(11)}')`;
 assert.equal(q("select to_regprocedure('public.native_store_paid_video_access_v1(uuid,uuid,uuid,uuid)') is not null;"),'t');
 for(const role of ['anon','authenticated'])assert.throws(()=>q(`set role ${role};select ${rpc()};`),/permission denied/u);cases++;
 assert.throws(()=>q(service+'select '+rpc()+';'),/native_video_/u);cases++;
 const worker=randomUUID(),verifier=randomUUID(),transfer=randomUUID();
 q(`insert into sandbox_commerce_v1.paid_video_workers values('${worker}',decode(repeat('01',32),'hex'),repeat('a',64),true);
 insert into sandbox_commerce_v1.paid_video_verifiers values('${verifier}',decode(repeat('02',32),'hex'),repeat('b',64),true);
 insert into sandbox_commerce_v1.paid_video_transfers(id,upload_id,user_id,session_id,request_id)
 select '${transfer}',id,creator_id,'${randomUUID()}','${randomUUID()}' from sandbox_commerce_v1.paid_video_uploads where asset_id='${asset}';
 insert into sandbox_commerce_v1.paid_video_object_receipts(upload_id,transfer_id,verifier_id,object_version,observation_raw,signature)
 select id,'${transfer}','${verifier}',object_version,jsonb_build_object('incarnation',incarnation,'sha256',expected_sha256,'byteLength',expected_byte_length)::text,'synthetic-signature-not-provider-evidence' from sandbox_commerce_v1.paid_video_uploads where asset_id='${asset}';
 update sandbox_commerce_v1.paid_video_gateway_controls set enabled=true,route_id='${route}',worker_id='${worker}',verifier_id='${verifier}',qualification_sha256=repeat('c',64);`);
 const read=(who=actor)=>JSON.parse(q(service+'select '+rpc(who)+';'));
 const value=read();assert.equal(value.protocol,'nssv1-current-access-gateway-v1');assert.equal(value.receiptId,'scv1_receipt_'+receipt);assert.equal(value.allocationId,result.nativeConsumerEffect.allocationId);assert.equal(value.media.assetId,f.quote.asset.id);cases++;
 for(const change of [
  `update sandbox_commerce_v1.paid_video_gateway_controls set enabled=false;`,
  `update sandbox_commerce_v1.paid_video_workers set active=false where id='${worker}';`,
  `update sandbox_commerce_v1.paid_video_verifiers set active=false where id='${verifier}';`,
  `update sandbox_commerce_v1.paid_video_routes set active=false where id='${route}';`,
  `update sandbox_commerce_v1.delivery_assets set state='quarantined' where id='${asset}';`,
  `update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id='${actor.sessionGeneration}';`,
  `update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id='${actor.userId}';`,
  `insert into sandbox_commerce_v1.native_store_protocol_revocations(qualification_id,qualification_revision,reason) select qa.qualification_id,qa.qualification_revision,'synthetic revoke' from sandbox_commerce_v1.native_store_allocations a join sandbox_commerce_v1.native_store_qualified_attempts qa on qa.attempt_id=a.attempt_id where a.core_receipt_id='${receipt}';`,
  `insert into sandbox_commerce_v1.native_store_settlement_revocations(protocol_id,protocol_revision,reason) select protocol_id,protocol_revision,'synthetic revoke' from sandbox_commerce_v1.native_store_allocations where core_receipt_id='${receipt}';`,
  `insert into native_store_sandbox_v1.revocations(connection_id,connection_revision,reason) select r.connection_id,r.connection_revision,'synthetic revoke' from sandbox_commerce_v1.native_store_allocations a join native_store_sandbox_v1.receipts r on r.id=a.raw_receipt_id where a.core_receipt_id='${receipt}';`
 ]){assert.throws(()=>q('begin;'+change+service+'select '+rpc()+';rollback;'),/native_video_|native_store_|sandbox_/u);cases++;}
 assert.throws(()=>read({userId:other,sessionGeneration:otherSession}));cases++;
 const cache=new Map([[path.join(root,'ops/isolated-paid-video-worker/private-object.mjs'),objectSource],[path.join(root,'ops/isolated-paid-video-worker/native-private-object.mjs'),nativeObject]]);
 const load=file=>{if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});new Function('exports','require',compiled.outputText)(exports,s=>{assert.ok(s.startsWith('.'));return load(path.resolve(path.dirname(file),s));});return exports;};
 const {createNativeStorePaidVideoRangeHandlerV1}=load(path.join(root,'supabase/functions/_shared/native-store-paid-video-range-v1.ts'));
 let reads=0,sqlCalls=0,afterOrigin=false;
 const handler=createNativeStorePaidVideoRangeHandlerV1({authenticate:async()=>({actor:{userId:actor.userId,sessionId:actor.sessionGeneration,expiresAtMs:Date.now()+60000},authorization:'Bearer synthetic'}),rpc:async(name,p)=>{assert.equal(name,'native_store_paid_video_access_v1');assert.equal(p.p_grant_id,grantId.slice(11));sqlCalls++;return read();},transport:{readRange:async()=>{reads++;if(afterOrigin)q(`update sandbox_commerce_v1.paid_video_gateway_controls set enabled=false;`);return Uint8Array.of(7);}}});
 const request=()=>new Request(`https://synthetic.invalid/functions/v1/native-store-paid-video-range-v1/${resourceId}/${grantId}`,{headers:{range:'bytes=0-0','x-chillywood-auth-session':actor.sessionGeneration}});
 let response=await handler(request());assert.equal(response.status,206);cases+=await (await import('./native-playback-projection.native-cases.mjs')).verifyNativePlaybackProjection({response,requestUrl:request().url,quote:f.quote,grantId,root,ts,loadShared:x.load});assert.equal(sqlCalls,2);assert.equal(reads,1);assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[7]);assert.equal(response.headers.get('x-chillywood-asset-id'),f.quote.asset.id);assert.equal(response.headers.get('cache-control'),'private, no-store, max-age=0');cases++;
 afterOrigin=true;sqlCalls=0;response=await handler(request());assert.equal(response.status,403);assert.equal(sqlCalls,2);assert.equal(response.headers.get('x-chillywood-asset-id'),null);cases++;
 q(`update sandbox_commerce_v1.paid_video_gateway_controls set enabled=true;`);
 console.log(JSON.stringify({protocol:'native-store-private-access-managed-proof-v1',cases,passed:cases,realAllocation:true,realPostgres:true,realEdge:true,syntheticMediaOnly:true,hostedQualified:false}));return cases;
}
