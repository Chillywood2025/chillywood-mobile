import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscoveryInvalidationHandler } from '../supabase/functions/_shared/discovery-invalidation-worker.mjs';
const body = {enabled:true,claimed:2,completed:2,failed:0,superseded:0,topics:1,deferred:0};
const request = () => new Request('https://worker.test', {method:'POST',headers:{'x-chillywood-discovery-token':'t'.repeat(32)},body:'{"limit":999999}'});
test('worker denies before claiming and never accepts caller batch sizing', async () => {
  const calls=[];
  let allowed=false;
  const handler=createDiscoveryInvalidationHandler({adminClient:{rpc:async(name,args)=>{calls.push([name,args]);return {data:name.startsWith('authorize')?allowed:body};}}});
  assert.equal((await handler(new Request('https://worker.test'))).status,405);
  assert.equal((await handler(new Request('https://worker.test',{method:'POST'}))).status,401);
  assert.equal(calls.length,0);
  assert.equal((await handler(request())).status,401);
  assert.equal(calls.length,1);
  allowed=true;
  assert.deepEqual(await (await handler(request())).json(),body);
  assert.deepEqual(calls.at(-1),['flush_discovery_invalidations',{p_limit:100}]);
});
test('worker strips unexpected data and reports unknown deadlines without retrying',async()=>{
  const clean=createDiscoveryInvalidationHandler({adminClient:{rpc:async name=>({data:name.startsWith('authorize')?true:{...body,private:'must not escape'}})}});
  assert.deepEqual(await(await clean(request())).json(),body);
  let calls=0;
  const timeout=createDiscoveryInvalidationHandler({deadlineMs:5,adminClient:{rpc:name=>{calls++;return name.startsWith('authorize')?Promise.resolve({data:true}):new Promise(()=>{});}}});
  assert.equal((await timeout(request())).status,503);assert.equal(calls,2);
});
test('worker rejects malformed results and storage errors without exposing internals',async()=>{
  for (const outcome of [{data:{...body,claimed:101}}, {data:{...body,completed:-1}}, {error:{message:'private operator detail'}}]) {
    const handler=createDiscoveryInvalidationHandler({adminClient:{rpc:async name=>name.startsWith('authorize')?{data:true}:outcome}});
    const response=await handler(request());
    assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{error:'discovery_worker_unavailable'});
  }
});
