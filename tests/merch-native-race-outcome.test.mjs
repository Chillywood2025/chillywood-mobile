import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Execute the production race orchestration with synthetic child-process output.
// These tests prove result/error handling, NOT PostgreSQL concurrency. The
// unchanged native runner still requires actual distinct PIDs/blocking edges.
const source=fs.readFileSync('scripts/test-merch-return-cases-concurrency-postgres.mjs','utf8');
const parser=source.match(/^const parsed=.*;$/m)?.[0];
const start=source.indexOf('  async function race('),end=source.indexOf('\n  const product=',start);
assert.ok(parser&&start>0&&end>start,'exact native race function located');
function harness({holder={code:0,stdout:'{}\nHOLDER_READY\n',stderr:''},waiter={code:0,stdout:'{"authorized":true}\n',stderr:''},blocker=101,unconditionalParser=false}={}){
 let allocated=0;const logs=[],queries=[],ends=[];
 const context={assert,JSON,console:{log:value=>logs.push(value)},checks:0,
  lit:value=>`'${value}'`,
  session:()=>{const result=allocated++===0?holder:waiter;return{name:allocated===1?'holder':'waiter',output:()=>result.stdout,done:Promise.resolve(result),child:{stdin:{end:value=>ends.push(value)}}};},
  until:async(predicate,label)=>assert.ok(await predicate(),label),
  query:sql=>{queries.push(sql);return sql.includes('select count(*)')?'1':JSON.stringify({holderPid:101,waiterPid:102,waitEvent:'transactionid',blockers:[blocker]});},
 };
 const raceSource=unconditionalParser?source.slice(start,end).replace("second:error?null:parsed(b.stdout)","second:parsed(b.stdout)"):source.slice(start,end);
 vm.createContext(context);vm.runInContext(`${parser}\n${raceSource}\nglobalThis.runRace=race;`,context);
 return{run:options=>context.runRace('synthetic expected rejection',"select '{}'::jsonb;",'select failing_rpc();',options),logs,queries,ends,passed:()=>context.checks};
}
test('expected SQL denial with empty stdout does not parse undefined or discard the verified holder',async()=>{
 const h=harness({waiter:{code:3,stdout:'',stderr:'ERROR: merch_live_checkout_unqualified\n'}});
 const result=await h.run({error:/merch_live_checkout_unqualified/});
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{first:{},second:null});assert.equal(h.passed(),1);
 assert.ok(h.queries.some(q=>q.includes('pg_blocking_pids')));assert.equal(h.ends.at(-1),'commit;\n');
});
test('both successful sessions still require their exact JSON result',async()=>{
 const h=harness();assert.equal((await h.run()).second.authorized,true);assert.equal(h.passed(),1);
 const missing=harness({waiter:{code:0,stdout:'',stderr:''}});await assert.rejects(missing.run(),/JSON|undefined/);assert.equal(missing.passed(),0);
});
test('wrong error, unexpected success, holder failure and missing holder JSON all remain failures',async()=>{
 for(const overrides of [
  {waiter:{code:3,stdout:'',stderr:'ERROR: unrelated_failure'}},
  {waiter:{code:0,stdout:'{}',stderr:'merch_live_checkout_unqualified'}},
  {holder:{code:3,stdout:'{}\nHOLDER_READY',stderr:'holder_failure'},waiter:{code:3,stdout:'',stderr:'merch_live_checkout_unqualified'}},
  {holder:{code:0,stdout:'HOLDER_READY',stderr:''},waiter:{code:3,stdout:'',stderr:'merch_live_checkout_unqualified'}},
 ]){const h=harness(overrides);await assert.rejects(h.run({error:/merch_live_checkout_unqualified/}));assert.equal(h.passed(),0);}
});
test('natural-lock evidence remains mandatory even when the eventual error would match',async()=>{
 const h=harness({blocker:999,waiter:{code:3,stdout:'',stderr:'merch_live_checkout_unqualified'}});
 await assert.rejects(h.run({error:/merch_live_checkout_unqualified/}));assert.equal(h.passed(),0);
});

test('negative control reproduces hosted undefined-JSON failure with unconditional waiter parsing',async()=>{
 const h=harness({unconditionalParser:true,waiter:{code:3,stdout:'',stderr:'ERROR: merch_live_checkout_unqualified'}});
 await assert.rejects(h.run({error:/merch_live_checkout_unqualified/}),/JSON|undefined/);
});
