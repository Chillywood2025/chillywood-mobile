import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {loadPureTypeScriptModule} from './helpers/pure-typescript-module.mjs';
import {mountReturns} from './helpers/merch-return-mounted-harness.mjs';
const {merchOrderHelpDestination} = loadPureTypeScriptModule('_lib/merchOrderHelp.ts');
const id='ab333333-3333-4333-8333-333333333333';
test('order help preserves creator target, defaults to buyer, and rejects malformed context',()=>{
 assert.deepEqual(merchOrderHelpDestination(id,'creator'),{pathname:'/merch/studio',params:{orderId:id}});
 assert.deepEqual(merchOrderHelpDestination(id,'buyer'),{pathname:'/merch/orders',params:{orderId:id}});
 assert.deepEqual(merchOrderHelpDestination(id,'staff'),{pathname:'/merch/orders',params:{orderId:id}});
 for(const value of [null,'bad',[id]])assert.equal(merchOrderHelpDestination(value,'creator'),null);
 const support=fs.readFileSync('components/system/support-screen.tsx','utf8');
 assert.match(support,/merchOrderHelpDestination\(params.orderId, params.orderRole\)/);
 assert.match(support,/router.push\(orderHelp\)/);
 assert.match(support,/merchOrderHelpDestination\(params.purchaseId, "buyer"\)/);
 assert.match(support,/Return to my purchases/);
 assert.match(support,/<MerchReturnReviewGate key=\{JSON.stringify\(authority\)\}/);
 const route=fs.readFileSync('app/merch/studio.tsx','utf8');
 assert.match(route,/useLocalSearchParams/);assert.match(route,/MerchStudioScreen .*orderId=/);
});
for(const allowed of [[],['admin.support.manage'],['admin.refund_status.record'],['admin.support.manage','admin.refund_status.record']])test(`staff review presentation requires both exact permissions: ${allowed.join(',')}`,async()=>{
 const calls=[];const h=await mountReturns({staff:true,gate:true,rpc:async(name,args)=>{calls.push(name);assert.equal(name,'has_platform_permission');return allowed.includes(args.p_permission_key);}});
 try{assert.equal(!!h.button('Open staff merch case review'),allowed.length===2);assert.equal(calls.length,2);assert.doesNotMatch(h.text(),/unavailable/);}finally{await h.close();}
});
test('permission failure and retired permission read never expose staff controls',async()=>{
 const denied=await mountReturns({staff:true,gate:true,rpc:async()=>{throw Error('offline');}});
 try{assert.equal(denied.button('Open staff merch case review'),undefined);}finally{await denied.close();}
 let resolve;const d={promise:new Promise(r=>{resolve=r;}),resolve:v=>resolve(v)};
 const h=await mountReturns({staff:true,gate:true,rpc:async(_name,_args,actor)=>actor==='buyer'?d.promise:false});
 try{await h.account('other');await h.resolve(d,true);assert.equal(h.button('Open staff merch case review'),undefined);}finally{await h.close();}
});
