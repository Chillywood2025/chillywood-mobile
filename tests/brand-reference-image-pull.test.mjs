import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {brandImageRetryAfterMs,pullBrandNativeImage,runBrandImagePullAttempt,BRAND_IMAGE_PULL_BUDGET_MS} from './helpers/brand-reference-image-pull.mjs';
import {computeValidationPlan} from '../scripts/ci/required-validation.mjs';

const imageReference='ghcr.io/supabase/postgres@sha256:86a2e078779e5bdccda1f6f6c5063aa9779a322d1fface5fb408d051909b230f';
const rate={code:1,signal:null,diagnostic:'Error response from daemon: toomanyrequests: retry-after: 947.237µs, allowed: 44000/minute'};
// Exact acquisition output from run40704020738/job122889353184, attempt2.
// Timestamps stripped only; no Docker/network access is needed for this replay.
const observedWrappedThrottle="ghcr.io/supabase/postgres@sha256:86a2e078779e5bdccda1f6f6c5063aa9779a322d1fface5fb408d051909b230f: Pulling from supabase/postgres\ne6f31ffc071e: Pulling fs layer\nc331a95a3ded: Pulling fs layer\n0de693b11719: Pulling fs layer\nae2e3acb5669: Pulling fs layer\n7455df3e077d: Pulling fs layer\ncaa5116ed4b8: Pulling fs layer\n4af8ac3da2f9: Pulling fs layer\n60d9b26a23ef: Pulling fs layer\n9f7b4105d9d2: Pulling fs layer\nbbcd8e2f47bd: Pulling fs layer\ne4c75db06451: Pulling fs layer\ne70bd6858950: Pulling fs layer\n0f0f5d6c6a72: Pulling fs layer\n439d07cca121: Pulling fs layer\nfa7f1f248d5e: Pulling fs layer\na1bc17dd40b2: Pulling fs layer\n67dbb4ddc3a7: Pulling fs layer\nc91442609c05: Pulling fs layer\n30eceb95cc71: Pulling fs layer\n319ec79ee793: Pulling fs layer\nff48e91a05e9: Pulling fs layer\na8c0be2aef64: Pulling fs layer\n540d1d9604d2: Pulling fs layer\nd9ff237b3bdf: Pulling fs layer\ne4d9ec943689: Pulling fs layer\n0f4863cd9c52: Pulling fs layer\n92132f761160: Pulling fs layer\nd438d0655c04: Pulling fs layer\n82cf28f3d1b5: Pulling fs layer\nfa7f1f248d5e: Waiting\na1bc17dd40b2: Waiting\n67dbb4ddc3a7: Waiting\nc91442609c05: Waiting\n30eceb95cc71: Waiting\n319ec79ee793: Waiting\nff48e91a05e9: Waiting\na8c0be2aef64: Waiting\n540d1d9604d2: Waiting\nd9ff237b3bdf: Waiting\ne4d9ec943689: Waiting\n0f4863cd9c52: Waiting\n92132f761160: Waiting\nd438d0655c04: Waiting\n82cf28f3d1b5: Waiting\nae2e3acb5669: Waiting\n7455df3e077d: Waiting\nbbcd8e2f47bd: Waiting\ncaa5116ed4b8: Waiting\ne4c75db06451: Waiting\n4af8ac3da2f9: Waiting\ne70bd6858950: Waiting\n60d9b26a23ef: Waiting\n0f0f5d6c6a72: Waiting\n9f7b4105d9d2: Waiting\n439d07cca121: Waiting\nerror pulling image configuration: download failed after attempts=1: toomanyrequests: retry-after: 927.09µs, allowed: 44000/minute";
const ok={code:0,signal:null,diagnostic:''};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function scenario(results,overrides={}){
 let time=0;const calls=[],sleeps=[],backoffs=[];
 const promise=pullBrandNativeImage({imageReference,now:()=>time,random:()=>0,
  runAttempt:async input=>{calls.push(input);const result=results.shift();time+=result.elapsed??0;return result;},
  sleep:async ms=>{sleeps.push(ms);time+=ms;},onBackoff:entry=>backoffs.push(entry),...overrides});
 return {promise,calls,sleeps,backoffs};
}
function childFixture(){
 const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();
 const kills=[],timers=[],cleared=[];child.kill=signal=>{kills.push(signal);return true;};
 return {child,kills,timers,cleared,options:{spawnProcess:()=>child,setTimer:(callback,ms)=>{timers.push({callback,ms});return timers.length;},clearTimer:id=>cleared.push(id)}};
}

test('retry-after understands bounded positive Go durations, HTTP seconds and HTTP dates without submillisecond spinning',()=>{
 const now=Date.parse('Wed, 28 Oct 2026 15:00:00 GMT');
 for(const [value,expected] of [['947.237µs',1],['947.237μs',1],['947.237us',1],['1ns',1],['1.5ms',2],['2s',2000],['1m30s',90000],['0.5h',1800000],['90',90000],['0.1',100],['Wed, 28 Oct 2026 15:01:30 GMT',90000],['Wed, 28 Oct 2026 14:00:00 GMT',0]]){
  assert.equal(brandImageRetryAfterMs(`toomanyrequests: retry-after: ${value}, allowed: 44000/minute`,now),expected,value);
 }
 assert.equal(brandImageRetryAfterMs('toomanyrequests'),0);
 for(const value of ['','-1','NaN','Infinity','1fortnight','tomorrow','Wed, not a date','1s, allowed: 44000/minute; Error:TLS failure'])assert.throws(()=>brandImageRetryAfterMs(`retry-after: ${value}`,now),/unreadable/);
 assert.throws(()=>brandImageRetryAfterMs('Retry-After: 1\nRetry-After: 600'),/ambiguous/);
 assert.throws(()=>brandImageRetryAfterMs('toomanyrequests: retry-after:1, allowed:44000/minute; retry-after:600'),/ambiguous/);
});

test('a successful first pull is single-attempt and retains exact immutable arguments',async()=>{
 const run=scenario([ok]);await run.promise;
 assert.equal(BRAND_IMAGE_PULL_BUDGET_MS,300000);
 assert.equal(run.calls.length,1);assert.deepEqual(run.sleeps,[]);
 assert.deepEqual(run.calls[0].args,['pull','--platform','linux/amd64',imageReference]);
 assert.equal(Object.isFrozen(run.calls[0].args),true);assert.equal(run.calls[0].timeoutMs,300000);
});

test('both observed CI throttle shapes retry, including exact pinned-image and layer progress',async()=>{
 for(const diagnostic of [rate.diagnostic,observedWrappedThrottle]){
  const run=scenario([{...rate,diagnostic},ok]);await run.promise;
  assert.equal(run.calls.length,2);assert.deepEqual(run.sleeps,[10000]);
  for(const input of run.calls)assert.equal(input.args.at(-1),imageReference);
 }
 for(const diagnostic of [
  observedWrappedThrottle.replace('attempts=1: toomanyrequests: retry-after: 927.09µs, allowed: 44000/minute','attempts=1: TLS handshake failure'),
  observedWrappedThrottle+'\nError: TLS handshake failure',
  observedWrappedThrottle.replace(': Pulling from supabase/postgres',': Pulling from unrelated/postgres'),
  observedWrappedThrottle.replace('e6f31ffc071e: Pulling fs layer','unverified: Pulling fs layer'),
  observedWrappedThrottle.replace('e6f31ffc071e: Pulling fs layer','e6f31ffc071e: unknown error'),
 ]){
  const run=scenario([{...rate,diagnostic},ok]);await assert.rejects(run.promise,/without retryable throttling/);assert.equal(run.calls.length,1);
 }
});

test('throttled attempts use lower-bound backoff, one total budget and unique evidence labels',async()=>{
 const run=scenario([rate,rate,rate,ok]);await run.promise;
 assert.deepEqual(run.sleeps,[10000,30000,60000]);
 assert.deepEqual(run.calls.map(x=>x.timeoutMs),[300000,290000,260000,200000]);
 assert.deepEqual(run.calls.map(x=>x.label),['pull-image-attempt-1','pull-image-attempt-2','pull-image-attempt-3','pull-image-attempt-4']);
 for(const call of run.calls)assert.deepEqual(call.args,['pull','--platform','linux/amd64',imageReference]);
 assert.equal(new Set(run.calls.map(x=>`brand-native-ci-${x.label}.log`)).size,4);
});

test('jitter is positive-only and server delay is never shortened',async()=>{
 const run=scenario([{...rate,diagnostic:'HTTP 429 Too Many Requests\nRetry-After: 90'},ok],{random:()=>0.5});await run.promise;
 assert.deepEqual(run.sleeps,[90500]);assert.equal(run.calls[1].timeoutMs,209500);
 const fractional=scenario([rate,ok],{random:()=>0.999});await fractional.promise;assert.deepEqual(fractional.sleeps,[10999]);
});

test('persistent throttling exhausts exactly four attempts and remains a failure',async()=>{
 const run=scenario([rate,rate,rate,rate,ok]);await assert.rejects(run.promise,/exhausted four/);
 assert.equal(run.calls.length,4);assert.deepEqual(run.sleeps,[10000,30000,60000]);
});

test('a longer-than-budget or unreadable server delay fails without an early retry',async()=>{
 for(const hint of ['300','301','1h','unrecognized']){
  const run=scenario([{...rate,diagnostic:`toomanyrequests: retry-after: ${hint}`},ok]);
  await assert.rejects(run.promise,/remaining image-pull budget|unreadable/);
  assert.equal(run.calls.length,1);assert.deepEqual(run.sleeps,[]);
 }
});

test('ordinary auth, missing-image, unknown and mixed denial errors never retry',async()=>{
 for(const diagnostic of ['unauthorized: authentication required','denied: permission denied','manifest unknown','name unknown','image not found','unknown transport error','TLS certificate verification failed','unexpected status code: 403','request id 429','toomanyrequests: unauthorized','toomanyrequests: digest mismatch','Error:toomanyrequests\nError:TLS handshake failure','toomanyrequests\nunknown response','toomanyrequests: unknown failure']){
  const run=scenario([{...rate,diagnostic},ok]);await assert.rejects(run.promise,/without retryable throttling/,diagnostic);
  assert.equal(run.calls.length,1,diagnostic);assert.deepEqual(run.sleeps,[]);
 }
 for(const code of [null,undefined,-1]){
  const run=scenario([{...rate,code},ok]);await assert.rejects(run.promise,/without retryable/);assert.equal(run.calls.length,1);
 }
});

test('explicit HTTP 429 variants retry but malformed retry jitter fails closed',async()=>{
 for(const diagnostic of ['HTTP/1.1 429','429 Too Many Requests','unexpected status code: 429']){
  const run=scenario([{...rate,diagnostic},ok]);await run.promise;assert.equal(run.calls.length,2);
 }
 for(const random of [()=>-0.1,()=>1,()=>NaN]){
  const run=scenario([rate,ok],{random});await assert.rejects(run.promise,/invalid pull retry jitter/);assert.equal(run.calls.length,1);
 }
});

test('elapsed acquisition and backoff consume the same deadline; late success cannot qualify',async()=>{
 const run=scenario([{...rate,elapsed:100000},ok]);await run.promise;assert.equal(run.calls[1].timeoutMs,190000);
 for(const result of [{...ok,elapsed:300000},{...rate,elapsed:300001},{...rate,processTimeout:true},{...rate,error:'spawn failed'}]){
  const failed=scenario([result,ok]);await assert.rejects(failed.promise,/300-second budget|spawn failed/);assert.equal(failed.calls.length,1);
 }
 const late=scenario([{...rate,elapsed:295000},ok]);await assert.rejects(late.promise,/remaining image-pull budget/);assert.equal(late.calls.length,1);
});

test('pre-abort, cancellation, signals and abort during backoff never start a successor',async()=>{
 const controller=new AbortController();controller.abort();
 const before=scenario([ok],{signal:controller.signal});await assert.rejects(before.promise,/cancelled/);assert.equal(before.calls.length,0);
 for(const result of [{...rate,cancelled:true},{...rate,signal:'SIGTERM'}]){
  const run=scenario([result,ok]);await assert.rejects(run.promise,/cancelled or signalled/);assert.equal(run.calls.length,1);
 }
 const during=new AbortController();
 const run=scenario([rate,ok],{signal:during.signal,sleep:async()=>{during.abort();}});
 await assert.rejects(run.promise,/cancelled/);assert.equal(run.calls.length,1);
});

test('child exit without close retains ownership; only close permits one subsequent attempt',async()=>{
 const first=childFixture();let calls=0,settled=false,time=0;
 const promise=pullBrandNativeImage({imageReference,now:()=>time,random:()=>0,sleep:async ms=>{time+=ms;},
  runAttempt:input=>{calls++;return calls===1?runBrandImagePullAttempt({...input,...first.options}):Promise.resolve(ok);}}).finally(()=>{settled=true;});
 first.child.stderr.emit('data',Buffer.from(rate.diagnostic));first.child.emit('exit',1,null);
 await tick();assert.equal(calls,1);assert.equal(settled,false);
 first.child.emit('close',1,null);await promise;assert.equal(calls,2);assert.deepEqual(first.cleared,[1]);
});

test('child timeout kills at its deadline but retains ownership until close and never retries',async()=>{
 const fixture=childFixture();let calls=0,settled=false;
 const promise=pullBrandNativeImage({imageReference,runAttempt:input=>{calls++;return runBrandImagePullAttempt({...input,...fixture.options});}}).finally(()=>{settled=true;});
 const rejected=assert.rejects(promise,/300-second budget/);
 fixture.child.stderr.emit('data',Buffer.from(rate.diagnostic));fixture.timers[0].callback();
 await tick();assert.deepEqual(fixture.kills,['SIGKILL']);assert.equal(settled,false);assert.equal(calls,1);
 fixture.child.emit('close',0,null);await rejected;assert.equal(calls,1);
});

test('abort owns its child through close, including an exit-zero or throttling response',async()=>{
 const fixture=childFixture(),controller=new AbortController();let calls=0,settled=false;
 const promise=pullBrandNativeImage({imageReference,signal:controller.signal,runAttempt:input=>{calls++;return runBrandImagePullAttempt({...input,...fixture.options});}}).finally(()=>{settled=true;});
 const rejected=assert.rejects(promise,/cancelled/);controller.abort();
 fixture.child.stderr.emit('data',Buffer.from(rate.diagnostic));await tick();
 assert.deepEqual(fixture.kills,['SIGTERM']);assert.equal(settled,false);assert.equal(calls,1);
 fixture.child.emit('close',0,null);await rejected;assert.equal(calls,1);
});

test('spawn errors retain a returned child until close and cannot retry a throttling-looking diagnostic',async()=>{
 const fixture=childFixture();let settled=false,calls=0;
 const promise=pullBrandNativeImage({imageReference,runAttempt:input=>{calls++;return runBrandImagePullAttempt({...input,...fixture.options});}}).finally(()=>{settled=true;});
 const rejected=assert.rejects(promise,/spawn unavailable/);
 fixture.child.stderr.emit('data',Buffer.from(rate.diagnostic));fixture.child.emit('error',Error('spawn unavailable'));
 await tick();assert.equal(settled,false);fixture.child.emit('close',1,null);await rejected;assert.equal(calls,1);
 const result=await runBrandImagePullAttempt({args:[],timeoutMs:10,spawnProcess:()=>{throw Error('synchronous spawn failure');}});
 assert.equal(result.error,'synchronous spawn failure');
});

test('attempt forwards complete logs but bounds in-memory diagnostics and respects pre-abort',async()=>{
 const fixture=childFixture(),output=[];
 const promise=runBrandImagePullAttempt({args:[],timeoutMs:123,now:()=>0,...fixture.options,onOutput:chunk=>output.push(chunk)});
 const chunk=Buffer.from('x'.repeat(16000)+rate.diagnostic);fixture.child.stderr.emit('data',chunk);fixture.child.emit('close',1,null);
 const result=await promise;assert.equal(result.diagnostic.length,8192);assert.ok(result.diagnostic.endsWith(rate.diagnostic));
 assert.equal(result.diagnosticTruncated,true);
 assert.equal(Buffer.concat(output).length,chunk.length);assert.equal(fixture.timers[0].ms,123);
 const controller=new AbortController();controller.abort();let spawned=false;
 const skipped=await runBrandImagePullAttempt({signal:controller.signal,spawnProcess:()=>{spawned=true;}});
 assert.equal(skipped.cancelled,true);assert.equal(spawned,false);
});

test('logging and setup cannot extend the overall deadline or dispatch after it',async()=>{
 const fixture=childFixture();let time=40;
 const promise=runBrandImagePullAttempt({args:[],timeoutMs:100,deadline:100,now:()=>time,...fixture.options});
 assert.equal(fixture.timers[0].ms,60);fixture.child.emit('close',0,null);await promise;
 let spawned=false;
 const result=await runBrandImagePullAttempt({args:[],timeoutMs:100,deadline:100,now:()=>100,spawnProcess:()=>{spawned=true;}});
 assert.equal(result.processTimeout,true);assert.equal(spawned,false);
});

test('a denial cannot be erased by the bounded diagnostic tail and converted into a throttling retry',async()=>{
 const fixture=childFixture();let calls=0;
 const promise=pullBrandNativeImage({imageReference,runAttempt:input=>{calls++;return runBrandImagePullAttempt({...input,...fixture.options});}});
 const rejected=assert.rejects(promise,/without retryable throttling/);
 fixture.child.stderr.emit('data',Buffer.from('unauthorized\n'));
 fixture.child.stdout.emit('data',Buffer.from('x'.repeat(16000)+rate.diagnostic));fixture.child.emit('close',1,null);
 await rejected;assert.equal(calls,1);
});

test('truncated delay evidence and multiple server delays fail closed rather than retrying early',async()=>{
 const fixture=childFixture();let calls=0;
 const promise=pullBrandNativeImage({imageReference,runAttempt:input=>{calls++;return runBrandImagePullAttempt({...input,...fixture.options});}});
 const rejected=assert.rejects(promise,/without retryable throttling/);
 fixture.child.stderr.emit('data',Buffer.from('Retry-After: 600\n'+'x'.repeat(8300)+'\ntoomanyrequests'));
 fixture.child.emit('close',1,null);await rejected;assert.equal(calls,1);
 for(const diagnostic of ['toomanyrequests\nRetry-After: 1\nRetry-After: 600','toomanyrequests: retry-after:1, allowed:44000/minute; retry-after:600']){
  const ambiguous=scenario([{...rate,diagnostic},ok]);
  await assert.rejects(ambiguous.promise,/ambiguous/);assert.equal(ambiguous.calls.length,1);assert.deepEqual(ambiguous.sleeps,[]);
 }
 for(const diagnostic of ['toomanyrequests\nRetry-After:','toomanyrequests: retry-after: 1s, allowed: 44000/minute; Error:TLS failure']){
  const malformed=scenario([{...rate,diagnostic},ok]);await assert.rejects(malformed.promise,/unreadable/);assert.equal(malformed.calls.length,1);
 }
});

test('runner retains image identity, unique attempt evidence and every existing single-attempt qualification gate',()=>{
 const source=readFileSync(new URL('./brand-reference-native-ci.mjs',import.meta.url),'utf8');
 assert.ok(source.includes("const imageRepository='ghcr.io/supabase/postgres'"));
 assert.ok(source.includes("const imageDigest='sha256:86a2e078779e5bdccda1f6f6c5063aa9779a322d1fface5fb408d051909b230f'"));
 assert.ok(source.includes("await pullBrandNativeImage({imageReference,signal:pullController.signal"));
 assert.ok(source.includes("createWriteStream(evidence+'brand-native-ci-'+label+'.log',{flags:'wx'})"));
 assert.ok(source.includes("assert.ok(image.RepoDigests?.includes(imageReference)"));
 assert.ok(source.includes("assert.equal(image.Architecture,'amd64');assert.equal(image.Os,'linux')"));
 assert.ok(source.includes("assert.equal(identity.version,'170006')"));
 assert.ok(source.indexOf('await pullBrandNativeImage')<source.indexOf("docker(['image','inspect',imageReference]"));
 assert.ok(source.indexOf("docker(['image','inspect',imageReference]")<source.indexOf("docker(['create'"));
 assert.ok(source.includes('await command(label,process.execPath,[file,...args],seconds)'));
 assert.ok(source.includes("await command('overflow',process.execPath,['tests/brand-reference-normalized-overflow-native.mjs'],180)"));
 assert.ok(source.includes("assert.equal(result.code,0,result.error||`${label} exited ${result.code}/${result.signal}`)"));
 for(const path of ['tests/brand-reference-image-pull.test.mjs','tests/helpers/brand-reference-image-pull.mjs'])assert.equal(computeValidationPlan([path]).categories.database,true,path);
});
