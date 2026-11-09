import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {deliverBoundedRange} from './private-object.mjs';
import {deliverNativeBoundedRange} from './native-private-object.mjs';
function fixture(){
 const actor={userId:randomUUID(),sessionGeneration:randomUUID()},resourceId='scv1_resource_'+randomUUID(),grantId='scv1_grant_'+randomUUID(),incarnation=randomUUID();
 const authority={protocol:'nssv1-current-access-v1',actor,resourceId,grantId,receiptId:'scv1_receipt_'+randomUUID(),originalTransactionId:'synthetic-native-transaction',allocationId:'nssv1_allocation_'+randomUUID(),projectId:'synthetic-native-project',validUntilMs:5000,
 object:{provider:'s3',bucket:'synthetic-private-video',routeId:randomUUID(),objectKey:`sandbox-commerce-v1/${randomUUID()}/${resourceId}/scv1_asset_${randomUUID()}/${incarnation}.mp4`,incarnation,expectedSha256:'a'.repeat(64),expectedByteLength:1048576,objectVersion:'synthetic-version'}};
 let calls=0,reads=0;
 const options={actor,resourceId,grantId,rangeHeader:null,now:()=>1000,authorize:async()=>{calls++;return structuredClone(authority);},transport:{readRange:async(binding,range)=>{reads++;return new Uint8Array(range.end-range.start+1);}}};
 return {authority,options,counts:()=>({calls,reads})};
}
test('native range retains real allocation identity and bounds bytes with two current authority checks',async()=>{
 const f=fixture(),response=await deliverNativeBoundedRange(f.options);
 assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,524288);assert.deepEqual(f.counts(),{calls:2,reads:1});assert.match(response.headers.get('cache-control'),/no-store/u);
});
test('native and TestStore protocols cannot substitute for each other',async()=>{
 const f=fixture();await assert.rejects(deliverBoundedRange(f.options),/current_access_required/u);
 f.authority.protocol='scpv-current-access-v3';f.authority.customerId='scv3_customer_'+randomUUID();await assert.rejects(deliverNativeBoundedRange(f.options),/current_access_required/u);assert.equal(f.counts().reads,0);
});
for(const field of ['allocationId','receiptId','originalTransactionId','projectId'])test(`native range does not release bytes after ${field} changes`,async()=>{
 const f=fixture();f.options.transport.readRange=async()=>{f.authority[field]+='changed';return new Uint8Array(4);};
 await assert.rejects(deliverNativeBoundedRange(f.options),/authority_changed/u);
});
for(const mode of ['revoked','session','expired'])test(`native range rejects post-origin ${mode}`,async()=>{
 const f=fixture();let calls=0,clock=1000;f.options.now=()=>clock;
 f.options.authorize=async()=>{calls++;if(calls===2&&mode==='revoked')throw Error('revoked');return structuredClone(f.authority);};
 f.options.transport.readRange=async()=>{if(mode==='session')f.authority.actor.sessionGeneration=randomUUID();if(mode==='expired')clock=6000;return new Uint8Array(4);};
 await assert.rejects(deliverNativeBoundedRange(f.options));
});
