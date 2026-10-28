import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const fixture = () => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/sharedLiveRead.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,AbortController});
  return exports.readSharedLiveSnapshot;
};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('100 identical simultaneous screen reads share one canonical request, never cache completion',async()=>{
  const read=fixture(),d=deferred();let calls=0;const source=()=>{calls++;return d.promise;};
  const results=Array.from({length:100},()=>read('account:generation','scope',new AbortController().signal,source));
  await Promise.resolve();assert.equal(calls,1);d.resolve({current:true});assert.equal((await Promise.all(results)).length,100);
  await read('account:generation','scope',new AbortController().signal,source);assert.equal(calls,2);
});
test('aborting one reader leaves another alive; last reader abort cancels source',async()=>{
  const read=fixture(),d=deferred(),a=new AbortController(),b=new AbortController();let sourceSignal;
  const source=signal=>{sourceSignal=signal;return d.promise;};const p=read('a','s',a.signal,source),q=read('a','s',b.signal,source);
  await Promise.resolve();const rejected=assert.rejects(p,/retired/);a.abort();await rejected;assert.equal(sourceSignal.aborted,false);
  d.resolve('fresh');assert.equal(await q,'fresh');
  const next=new AbortController(),held=deferred();const r=read('a','s',next.signal,signal=>{sourceSignal=signal;return held.promise;});await Promise.resolve();
  const aborted=assert.rejects(r,/retired/);next.abort();await aborted;assert.equal(sourceSignal.aborted,true);held.resolve('ignored');
});
test('different generations and different canonical interests never share results',async()=>{
  const read=fixture();let calls=0;const source=async()=>++calls;
  await Promise.all([read('one','scope',new AbortController().signal,source),read('two','scope',new AbortController().signal,source),read('one','other',new AbortController().signal,source)]);assert.equal(calls,3);
});
test('retired source keeps ownership until settlement and never serves late data to a new reader',async()=>{
  const read=fixture(),old=deferred(),fresh=deferred(),a=new AbortController();let calls=0;
  const p=read('a','s',a.signal,()=>old.promise);await Promise.resolve();const rejected=assert.rejects(p,/retired/);a.abort();await rejected;
  const source=()=>{calls++;return fresh.promise;};
  for(let i=0;i<10;i++)await assert.rejects(read('a','s',new AbortController().signal,source),/retired/);
  assert.equal(calls,0,'abort-ignoring source must not overlap a replacement');
  old.resolve('old');await new Promise(resolve=>setImmediate(resolve));
  const q=read('a','s',new AbortController().signal,source),r=read('a','s',new AbortController().signal,source);
  await Promise.resolve();assert.equal(calls,1);fresh.resolve('fresh');assert.deepEqual(await Promise.all([q,r]),['fresh','fresh']);
});
test('saturated ownership rejects excess work instead of bypassing the single-flight bound',async()=>{
  const read=fixture(),held=deferred();let calls=0;
  const source=()=>{calls++;return held.promise;};
  const pending=Array.from({length:128},(_,i)=>read('a',String(i),new AbortController().signal,source));
  await Promise.resolve();assert.equal(calls,128);
  await assert.rejects(read('a','overflow',new AbortController().signal,source),/capacity/);
  assert.equal(calls,128);held.resolve('done');await Promise.all(pending);
  assert.equal(await read('a','overflow',new AbortController().signal,source),'done');assert.equal(calls,129);
});
