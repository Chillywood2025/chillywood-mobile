import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/stripeVideoAttemptJournal.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});
const {withStripeVideoAttempt:withAttempt}=exports;
const buyer='11111111-1111-4111-8111-111111111111',video='22222222-2222-4222-8222-222222222222',request='33333333-3333-4333-8333-333333333333',order='44444444-4444-4444-8444-444444444444';
const key=`stripe-video-sandbox:${buyer}:${video}`;
function fixture(){const map=new Map();return {map,storage:{getItem:async k=>map.get(k)??null,setItem:async(k,v)=>{map.set(k,v)},removeItem:async k=>{map.delete(k)}}};}
test('concurrent requests share durable identity and serialize complete operations',async()=>{
 const {map,storage}=fixture();let created=0,active=0,maxActive=0;
 const run=()=>withAttempt(storage,buyer,video,()=>{},async journal=>{active++;maxActive=Math.max(active,maxActive);const a=await journal.prepare(()=>{created++;return request});await journal.remember(a,order);active--;return a.requestId});
 assert.deepEqual(await Promise.all([run(),run()]),[request,request]);assert.equal(created,1);assert.equal(maxActive,1);assert.equal(map.size,2);
});
test('ambiguous transport retains attempt across journal recreation',async()=>{
 const {map,storage}=fixture();await assert.rejects(withAttempt(storage,buyer,video,()=>{},async j=>{await j.prepare(()=>request);throw Error('network')}),/network/);
 const a=await withAttempt(storage,buyer,video,()=>{},j=>j.prepare(()=>{throw Error('must reuse')}));assert.equal(a.requestId,request);assert.equal(map.size,1);
});
test('corrupt and orphaned legacy identities fail closed without deletion',async()=>{
 for(const entries of [[[key,'bad']],[[`${key}:order`,order]],[[key,request],[`${key}:order`,'bad']]]){
  const {map,storage}=fixture();for(const [k,v]of entries)map.set(k,v);
  await assert.rejects(withAttempt(storage,buyer,video,()=>{},j=>j.prepare(()=>request)),/recovery/);assert.equal(map.size,entries.length);
 }
});
test('silent storage failures cannot authorize transport',async()=>{
 const storage={getItem:async()=>null,setItem:async()=>{},removeItem:async()=>{}};
 await assert.rejects(withAttempt(storage,buyer,video,()=>{},j=>j.prepare(()=>request)),/could not be saved/);
});
test('different accounts cannot inspect another account attempt',async()=>{
 const {storage}=fixture();await withAttempt(storage,buyer,video,()=>{},j=>j.prepare(()=>request));
 assert.equal(await withAttempt(storage,order,video,()=>{},j=>j.read()),null);
});
test('order substitution rejected; exact unpaid terminal retirement only removes matching identity',async()=>{
 const {map,storage}=fixture();await withAttempt(storage,buyer,video,()=>{},async j=>{
  const a=await j.prepare(()=>request);await j.remember(a,order);
  await assert.rejects(j.remember(a,video),/changed/);
  await assert.rejects(j.retireUnpaid({requestId:video,orderId:order}),/changed/);
  assert.equal(map.size,2);await j.retireUnpaid({requestId:request,orderId:order});assert.equal(map.size,0);
 });
});
test('account change after a storage write blocks subsequent use and keeps recovery identity',async()=>{
 const {map,storage}=fixture();let valid=true;storage.setItem=async(k,v)=>{map.set(k,v);valid=false};
 await assert.rejects(withAttempt(storage,buyer,video,()=>{if(!valid)throw Error('account changed')},j=>j.prepare(()=>request)),/account changed/);assert.equal(map.get(key),request);
});
