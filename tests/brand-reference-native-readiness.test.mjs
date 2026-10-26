import assert from 'node:assert/strict';
import test from 'node:test';
import {waitForBrandNativeQuiet,BRAND_NATIVE_QUIET_DEADLINE_MS} from './helpers/brand-reference-native-readiness.mjs';

const other={pid:43,backendType:'autovacuum worker',applicationName:'',state:'active'};
test('readiness waits for all backends to drain and two consecutive zero snapshots',async()=>{
 let time=0;const samples=[[other],[],[{...other,backendType:'client backend',state:'idle'}],[],[]],seen=[],budgets=[];
 const result=await waitForBrandNativeQuiet({now:()=>time,sleep:async ms=>{time+=ms;},
  readOtherSessions:remaining=>{budgets.push(remaining);return samples.shift();},onObservation:x=>seen.push(x)});
 assert.equal(result.elapsedMs,400);assert.equal(samples.length,0);assert.equal(seen.length,5);
 assert.deepEqual(seen[0].sessions,[other]);assert.equal(seen[2].sessions[0].state,'idle');
 assert.deepEqual(budgets,[15000,14900,14800,14700,14600]);
});
test('persistent background workers and idle clients both fail at the fixed deadline',async()=>{
 for(const backend of [other,{...other,backendType:'client backend',state:'idle'}]){
  let time=0,calls=0;const observations=[];
  await assert.rejects(waitForBrandNativeQuiet({now:()=>time,sleep:async ms=>{time+=ms;},
   readOtherSessions:()=>{calls++;return [backend];},onObservation:x=>observations.push(x)}),/fixed 15-second/);
  assert.equal(time,BRAND_NATIVE_QUIET_DEADLINE_MS);assert.equal(calls,150);assert.equal(observations.at(-1).sessions[0],backend);
 }
});
test('readiness rejects late empty snapshots and propagates query failures without retry',async()=>{
 let time=0;
 await assert.rejects(waitForBrandNativeQuiet({now:()=>time,sleep:async()=>{},readOtherSessions:()=>{time=15001;return [];}}),/overall deadline/);
 time=0;await assert.rejects(waitForBrandNativeQuiet({now:()=>time,sleep:async()=>{},readOtherSessions:()=>[],onObservation:()=>{time=15001;}}),/overall deadline/);
 let calls=0;await assert.rejects(waitForBrandNativeQuiet({readOtherSessions:()=>{calls++;throw Error('snapshot connection failed');}}),/snapshot connection failed/);
 assert.equal(calls,1);
});
