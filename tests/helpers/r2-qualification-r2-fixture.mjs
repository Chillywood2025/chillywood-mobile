// OFFLINE transport fixture only. No fetch/network/credential lookup. Keep this
// store outside restored database fixtures so tests cannot erase their own fence.
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {loadQualificationModule,fixtureNow} from './r2-qualification-fixture.mjs';
const {BUCKET,R2_ENDPOINT,OBJECTS,CONFLICT_PAYLOAD,MUTATION_RECEIPTS}=loadQualificationModule('r2-disposable-qualification-manifest.ts');
const {createQualificationOrigin}=loadQualificationModule('r2-disposable-qualification-origin.ts');
const hash=s=>createHash('sha256').update(s).digest('hex');
const environment={MEDIA_ORIGIN_PROVIDER:'cloudflare_r2',MEDIA_ORIGIN_PRIVATE_ONLY:'true',
  MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED:'true',MEDIA_ORIGIN_R2_ENDPOINT:R2_ENDPOINT,MEDIA_ORIGIN_BUCKET:BUCKET,
  MEDIA_ORIGIN_R2_ACCESS_KEY_ID:'synthetic-access',MEDIA_ORIGIN_R2_SECRET_ACCESS_KEY:'synthetic-secret'};

// Caller must first assert exact restored SQL state/approval readback. These
// assertions prove the intended gate was reached, not a vacuous RPC failure.
export async function assertRestoredQualificationFence({provider,state,run,cleanupApproved}) {
  const before=provider.requests.length;
  if(state.pending||state.phase==='cleaned'){
    assert.equal((await run('prepare')).status,state.pending?'pending_reconcile_required':'cleaned');
    assert.equal(provider.requests.length,before);return;
  }
  const next=['put_control','put_target','read','conflict_target','delete_target','delete_control','cleanup_verify'][state.completed.length];
  const action=next.startsWith('put_')?'prepare':next==='read'?'read':next==='conflict_target'?'conflict':'cleanup';
  if(state.phase==='conflict_verified'&&!cleanupApproved){
    await assert.rejects(run(action),/qualification_store_unconfirmed/);
    assert.equal(provider.requests.length,before);return;
  }
  if(next==='read'||next==='cleanup_verify'){
    assert.equal((await run(action)).status,next==='read'?'blocked':'cleaned');
    assert.deepEqual(provider.requests.slice(before).map(r=>r.op),['get_control','get_target']);return;
  }
  await assert.rejects(run(action),/qualification_fence_not_acquired/);
  assert.deepEqual(provider.requests.slice(before).map(r=>r.op),[`receipt_${next}`]);
}

export function createSyntheticQualificationR2({now=()=>Date.parse(fixtureNow),locked=true,conditional=true}={}) {
  const objects=new Map(),requests=[],protectedMutations=[];
  const receiptByKey=new Map(Object.entries(MUTATION_RECEIPTS).map(([op,item])=>[item.key,{...item,op}]));
  const objectByKey=new Map(Object.entries(OBJECTS).map(([name,item])=>[item.key,{...item,name}]));
  const fixture={objects,requests,protectedMutations,before:null,after:null,origin:null,
    // Negative controls may alter model assumptions. These are not live settings.
    locked,conditional};
  const request=async(address,init)=>{
    const url=new URL(address),key=decodeURIComponent(url.pathname.slice(1));
    assert.equal(url.origin,`https://${BUCKET}.${new URL(R2_ENDPOINT).hostname}`);
    assert.equal(url.search,'');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');
    assert.ok(init.signal instanceof AbortSignal);
    const receipt=receiptByKey.get(key),object=objectByKey.get(key);
    assert.ok(receipt||object,'only seven exact fixed keys are reachable');
    if(receipt){assert.equal(init.method,'PUT');assert.equal(init.body,receipt.payload);}
    const header=init.headers,fields=/Credential=([^,]+), SignedHeaders=([^,]+), Signature=(.+)$/.exec(header.Authorization);
    assert.ok(fields);assert.ok(fields[1].startsWith('synthetic-access/'));
    const names=fields[2].split(';'),all={...header,host:url.host};
    const canonical=[init.method,url.pathname,'',names.map(n=>`${n}:${all[n]}\n`).join(''),fields[2],hash(init.body??'')].join('\n');
    const scope=fields[1].split('/').slice(1).join('/');
    let signing=Buffer.from('AWS4synthetic-secret');for(const value of scope.split('/'))signing=createHmac('sha256',signing).update(value).digest();
    assert.equal(fields[3],createHmac('sha256',signing).update(['AWS4-HMAC-SHA256',header['x-amz-date'],scope,hash(canonical)].join('\n')).digest('hex'));
    assert.equal(header['x-amz-content-sha256'],hash(init.body??''));
    if(init.method==='PUT'){
      assert.equal(header['if-none-match'],'*');assert.ok(names.includes('if-none-match'));
      assert.equal(header['content-length'],String(Buffer.byteLength(init.body)));
    }
    const op=receipt?`receipt_${receipt.op}`:init.method==='GET'?`get_${object.name}`:
      init.method==='DELETE'?`delete_${object.name}`:init.body===CONFLICT_PAYLOAD?'conflict_target':`put_${object.name}`;
    const record={op,key,method:init.method,receipt:!!receipt,body:init.body};requests.push(record);
    if(!receipt&&init.method!=='GET')protectedMutations.push(record);
    if(fixture.before){const replacement=await fixture.before(record);if(replacement)return replacement;}
    let response;
    if(receipt&&objects.has(key)&&fixture.locked)response=new Response(null,{status:403});
    else if(init.method==='PUT'){
      if(objects.has(key)&&fixture.conditional)response=new Response(null,{status:412});
      else{objects.set(key,init.body);response=new Response(null,{status:200});}
    }else if(init.method==='DELETE'){
      assert.ok(object,'receipt deletion is never in transport allowlist');objects.delete(key);response=new Response(null,{status:204});
    }else{
      assert.equal(init.method,'GET');assert.ok(object,'no receipt GET/adoption path');
      response=objects.has(key)?new Response(objects.get(key),{status:200}):new Response(null,{status:404});
    }
    if(fixture.after)await fixture.after(record,response);
    return response;
  };
  fixture.origin=createQualificationOrigin(k=>environment[k],request,now);
  // Fresh factory means source/isolate restart does not preserve an in-memory
  // permit; all factories still share only this synthetic external object store.
  fixture.newOrigin=()=>createQualificationOrigin(k=>environment[k],request,now);
  return fixture;
}
