import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './stripe-connect-observed-fixture.mjs';
test('reviewed Connect cutover admission guard never touches request bodies or external services',async()=>{
 let handler;
 load('ops/connect-mode-cutover/paused-entrypoint.ts',{}, {Deno:{serve:fn=>handler=fn},fetch:()=>{throw Error('provider traffic forbidden');}});
 for(const method of ['POST','GET','DELETE','OPTIONS']){
  const request={method,get body(){throw Error('body read forbidden');},json(){throw Error('body read forbidden');}};
  const response=await handler(request);
  assert.equal(response.status,method==='OPTIONS'?204:503);
  assert.equal(response.headers.get('X-Chillywood-Setup-Admission'),'paused-connect-mode-cutover-v1');
  if(method!=='OPTIONS')assert.equal((await response.json()).liveMoneyAction,false);
 }
});
