import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash, createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {loadQualificationModule} from '../../../tests/helpers/r2-qualification-fixture.mjs';
const {BUCKET, CLEANUP_APPROVED, CONFLICT_PAYLOAD, DEADLINE, MUTATION_RECEIPTS, OBJECTS, R2_ENDPOINT, RUN_APPROVED, RUN_ID, sha256}=loadQualificationModule('r2-disposable-qualification-manifest.ts');
const {createQualificationOrigin, readBoundedBody}=loadQualificationModule('r2-disposable-qualification-origin.ts');
const {createQualificationHandler}=loadQualificationModule('r2-disposable-qualification-handler.ts');
const {initialState, runQualification}=loadQualificationModule('r2-disposable-qualification.ts');

const at = Date.parse('2026-10-23T20:00:00.000Z');
async function fixture() {
  let state = await initialState(), fault = null;
  const objects = new Map(), calls = [], observations = [];
  const store = {
    read: async () => structuredClone(state),
    compareAndSwap: async (revision, next) => {
      if (state.revision !== revision) return false;
      state = structuredClone(next); return true;
    },
  };
  const origin = async (op) => {
    calls.push(op);
    const name = op.endsWith('_control') ? 'control' : 'target';
    const stamp = new Date(at).toISOString();
    if (fault) { const f = fault; fault = null; return f(op, objects); }
    if (op.startsWith('get_')) {
      const body = objects.get(name);
      const value = body === undefined ? {status: 404, observedAt: stamp} :
        {status: 200, byteCount: new TextEncoder().encode(body).length, sha256: await sha256(new TextEncoder().encode(body)), observedAt: stamp};
      observations.push(value); return value;
    }
    if (op.startsWith('delete_')) { objects.delete(name); return {status: 204, observedAt: stamp}; }
    if (objects.has(name)) return {status: 412, observedAt: stamp};
    objects.set(name, op === 'conflict_target' ? CONFLICT_PAYLOAD : OBJECTS[name].payload);
    return {status: 200, observedAt: stamp};
  };
  const deps = {store, origin, now: () => at, cleanupApproved: false};
  return {deps, calls, objects, observations, state: () => structuredClone(state),
    setFault: f => {fault = f;}, run: action => runQualification(action, deps)};
}
async function qualified(f) {
  assert.equal((await f.run('prepare')).status, 'prepared');
  assert.equal((await f.run('read')).status, 'read_verified');
  assert.equal((await f.run('conflict')).status, 'conflict_verified');
}

test('fixed manifest has two disposable literal keys and closed approval gates', () => {
  assert.equal(RUN_APPROVED, false); assert.equal(CLEANUP_APPROVED, false);
  assert.equal(BUCKET, 'chillywood-media-origin');
  assert.equal(Object.keys(OBJECTS).length, 2);
  for (const item of Object.values(OBJECTS)) {
    assert.ok(item.key.includes(RUN_ID)); assert.ok(!item.key.includes('c8ffaa91-0017-4646-98df-8392e170e7ae'));
    assert.ok(item.payload.length < 1024);
  }
});
test('prepare/read/conflict is create-only and preserves the control and original bytes', async () => {
  const f = await fixture(); await qualified(f);
  assert.deepEqual(f.calls, ['put_control', 'put_target', 'get_control', 'get_target', 'conflict_target', 'get_control', 'get_target']);
  assert.equal(f.objects.get('control'), OBJECTS.control.payload);
  assert.equal(f.objects.get('target'), OBJECTS.target.payload);
  assert.equal(f.state().requestBudgetReserved, 10);
  assert.equal(f.state().observations.length, 2);
});
test('repeated phases do not replay actions or permit prepare after cleanup', async () => {
  const f = await fixture(); await qualified(f); const before = f.calls.length;
  for (const action of ['prepare', 'read', 'conflict']) await f.run(action);
  assert.equal(f.calls.length, before);
  f.deps.cleanupApproved = true;
  assert.equal((await f.run('cleanup')).status, 'cleaned');
  const cleaned = f.calls.length;
  for (const action of ['prepare', 'read', 'conflict', 'cleanup', 'reconcile', 'status']) assert.equal((await f.run(action)).status, 'cleaned');
  assert.equal(f.calls.length, cleaned); assert.equal(f.objects.size, 0);
});
test('explicit cleanup is separate; neither status nor premature cleanup contacts origin', async () => {
  const f = await fixture();
  await assert.rejects(f.run('cleanup'), /cleanup_not_approved/);
  f.deps.cleanupApproved = true; await f.run('cleanup'); await f.run('status');
  assert.deepEqual(f.calls, []);
  await qualified(f); f.deps.cleanupApproved = false;
  await assert.rejects(f.run('cleanup'), /cleanup_not_approved/); assert.equal(f.objects.size, 2);
});
test('cleanup fence exists before DELETE, no conditional DELETE or prefix operation', async () => {
  const f = await fixture(); await qualified(f); f.deps.cleanupApproved = true;
  const original = f.deps.origin;
  f.deps.origin = async op => {
    if (op.startsWith('delete_')) assert.equal(f.state().phase, 'cleanup_started');
    return original(op);
  };
  await f.run('cleanup');
  assert.deepEqual(f.calls.slice(7), ['delete_target', 'delete_control', 'get_control', 'get_target']);
});
test('preexisting target/control fails closed and cannot be adopted or cleaned', async () => {
  const f = await fixture(); f.objects.set('control', OBJECTS.control.payload);
  assert.equal((await f.run('prepare')).status, 'blocked');
  f.deps.cleanupApproved = true; await f.run('cleanup'); await f.run('prepare');
  assert.deepEqual(f.calls, ['put_control']);
});
test('wrong read hash, full byte count, or changed control blocks qualification', async () => {
  for (const changed of ['target', 'control']) {
    const f = await fixture(); await f.run('prepare'); f.objects.set(changed, 'not the approved bytes');
    assert.equal((await f.run('read')).status, 'blocked'); await f.run('conflict');
    assert.ok(!f.calls.includes('conflict_target'));
  }
});
test('provider ignoring create-only conflict is detected by both status and readback', async () => {
  const f = await fixture(); await f.run('prepare'); await f.run('read');
  f.setFault((_op, objects) => {objects.set('target', CONFLICT_PAYLOAD); return {status: 200, observedAt: new Date(at).toISOString()};});
  assert.equal((await f.run('conflict')).status, 'blocked');
  assert.deepEqual(f.calls.slice(-2), ['get_control', 'get_target']);
  assert.equal(f.objects.get('control'), OBJECTS.control.payload);
});
test('unknown PUT is read-reconciled but never replayed or treated as writer drain', async () => {
  for (const applied of [false, true]) {
    const f = await fixture();
    f.setFault((_op, objects) => {if (applied) objects.set('control', OBJECTS.control.payload); throw Error('lost response');});
    await assert.rejects(f.run('prepare'), /lost response/);
    assert.equal((await f.run('prepare')).status, 'pending_reconcile_required');
    assert.equal((await f.run('reconcile')).status, 'write_or_delete_outcome_unresolved');
    assert.equal(f.state().pending, 'put_control');
    f.deps.cleanupApproved = true; await f.run('cleanup');
    assert.deepEqual(f.calls, ['put_control', 'get_control', 'get_target']);
  }
});
test('lost conflict response cannot be inferred to be a 412 from unchanged bytes', async () => {
  const f = await fixture(); await f.run('prepare'); await f.run('read');
  f.setFault(() => {throw Error('lost conflict receipt');});
  await assert.rejects(f.run('conflict'), /lost conflict/);
  await f.run('reconcile'); assert.equal(f.state().pending, 'conflict_target');
  assert.equal(f.state().phase, 'read_verified');
});
test('unknown DELETE can reconcile absence without replay because writes are permanently fenced', async () => {
  const f = await fixture(); await qualified(f); f.deps.cleanupApproved = true;
  f.setFault((_op, objects) => {objects.delete('target'); throw Error('lost delete receipt');});
  await assert.rejects(f.run('cleanup'), /lost delete/);
  assert.equal((await f.run('reconcile')).status, 'delete_absence_reconciled');
  assert.equal((await f.run('cleanup')).status, 'cleaned');
  assert.equal(f.calls.filter(op => op === 'delete_target').length, 1);
});
test('unknown DELETE with bytes still present is not automatically retried', async () => {
  const f = await fixture(); await qualified(f); f.deps.cleanupApproved = true;
  f.setFault(() => {throw Error('unknown delete');}); await assert.rejects(f.run('cleanup'));
  assert.equal((await f.run('reconcile')).status, 'write_or_delete_outcome_unresolved');
  await f.run('cleanup'); assert.equal(f.calls.filter(op => op === 'delete_target').length, 1);
});
test('read crash can reconcile, but repeated uncertain reconciliations are capped', async () => {
  const f = await fixture(); await f.run('prepare');
  f.setFault(() => {throw Error('read stopped');}); await assert.rejects(f.run('read'));
  assert.equal((await f.run('reconcile')).status, 'read_verified');
  const g = await fixture(); g.setFault(() => {throw Error('unknown write');}); await assert.rejects(g.run('prepare'));
  for (let i=0; i<3; i++) await g.run('reconcile');
  const count = g.calls.length; await assert.rejects(g.run('reconcile'), /reconciliation_limit/); assert.equal(g.calls.length, count);
});
test('deadline and unknown operations fail before provider calls; status remains available', async () => {
  const f = await fixture(); f.deps.now = () => Date.parse(DEADLINE);
  for (const action of ['prepare', 'read', 'conflict', 'cleanup', 'reconcile']) await assert.rejects(f.run(action), /deadline_passed/);
  await assert.rejects(f.run('list'), /action_not_allowlisted/);
  assert.equal((await f.run('status')).status, 'new'); assert.deepEqual(f.calls, []);
});
test('missing or wrong durable manifest and failed CAS prevent all provider calls', async () => {
  for (const value of [null, {...await initialState(), runId: 'wrong'}, {...await initialState(), manifestHash: 'wrong'}]) {
    const f = await fixture(); f.deps.store.read = async () => value;
    await assert.rejects(f.run('prepare'), /durable_run_unavailable/); assert.deepEqual(f.calls, []);
  }
  const f = await fixture(); f.deps.store.compareAndSwap = async () => false;
  await assert.rejects(f.run('prepare'), /concurrent_or_unconfirmed_state/); assert.deepEqual(f.calls, []);
});
test('lost durable receipt is reconciled before any repeated write', async () => {
  const f = await fixture(), cas = f.deps.store.compareAndSwap;
  let n=0; f.deps.store.compareAndSwap = async (...args) => {if (++n === 2) throw Error('durable receipt unavailable'); return cas(...args);};
  await assert.rejects(f.run('prepare'), /durable receipt/); f.deps.store.compareAndSwap = cas;
  assert.equal((await f.run('prepare')).status, 'pending_reconcile_required'); await f.run('reconcile');
  assert.equal(f.calls.filter(op => op === 'put_control').length, 1);
});
test('two concurrent prepare calls acquire only one mutation intent', async () => {
  const f = await fixture(); const result = await Promise.allSettled([f.run('prepare'), f.run('prepare')]);
  assert.ok(result.some(r => r.status === 'fulfilled'));
  assert.equal(f.calls.filter(op => op === 'put_control').length, 1);
  assert.equal(f.calls.filter(op => op === 'put_target').length, 1);
});

const environment = {SUPABASE_SERVICE_ROLE_KEY:'deliberately-different-injected-key', SUPABASE_URL:'https://bmkkhihfbmsnnmcqkoly.supabase.co',
  RETENTION_WORKER_SERVICE_KEY_SHA256:createHash('sha256').update('synthetic-service').digest('hex'),
  MEDIA_ORIGIN_PROVIDER:'cloudflare_r2', MEDIA_ORIGIN_PRIVATE_ONLY:'true', MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED:'true',
  MEDIA_ORIGIN_R2_ENDPOINT:R2_ENDPOINT, MEDIA_ORIGIN_BUCKET:BUCKET,
  MEDIA_ORIGIN_R2_ACCESS_KEY_ID:'synthetic-access', MEDIA_ORIGIN_R2_SECRET_ACCESS_KEY:'synthetic-secret'};
test('handler preserves exact service authority, denies wrong auth without touching storage', async () => {
  let calls=0; const fail=()=>{calls++; throw Error('must not construct');};
  const handler = createQualificationHandler({env:k=>environment[k], store:fail, origin:fail});
  for (const authorization of [undefined, 'Bearer wrong', 'bearer synthetic-service', 'Bearer  synthetic-service']) {
    const req = new Request('https://synthetic.invalid', {method:'POST', headers:authorization?{Authorization:authorization}:{}, body:JSON.stringify({runId:RUN_ID, action:'prepare'})});
    assert.equal((await handler(req)).status, 403);
  }
  assert.equal(calls, 0);
});
test('handler refuses extra keys, arbitrary payload/URL/fixture and uncommissioned run', async () => {
  let calls=0; const fail=()=>{calls++; throw Error('must not construct');};
  const handler = createQualificationHandler({env:k=>environment[k], store:fail, origin:fail});
  const call = body => handler(new Request('https://synthetic.invalid', {method:'POST', headers:{Authorization:'Bearer synthetic-service'}, body:JSON.stringify(body)}));
  for (const body of [{runId:RUN_ID, action:'prepare', key:OBJECTS.target.key}, {runId:RUN_ID, action:'prepare', payload:'x'},
    {runId:RUN_ID, action:'prepare', url:'https://example.com'}, {runId:'c8ffaa91-0017-4646-98df-8392e170e7ae', action:'prepare'},
    {runId:RUN_ID, action:'list'}, {runId:RUN_ID, action:'prepare', huge:'x'.repeat(1024)}]) assert.equal((await call(body)).status, 400);
  for (const action of ['prepare','read','conflict','cleanup','reconcile','status']) assert.equal((await call({runId:RUN_ID,action})).status, 409);
  assert.equal(calls, 0);
});
test('R2 transport independently verifies SigV4, signed create-only headers, allowlist and fixed payloads', async () => {
  const requests=[];
  const request=async (address, init) => {
    requests.push([address, init]); const url=new URL(address), header=init.headers;
    assert.equal(url.search, ''); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    const fields=/Credential=([^,]+), SignedHeaders=([^,]+), Signature=(.+)$/.exec(header.Authorization);
    const names=fields[2].split(';'); const all={...header,host:url.host};
    const canonicalHeaders=names.map(n=>`${n}:${all[n]}\n`).join('');
    const hash=s=>createHash('sha256').update(s).digest('hex');
    const canonical=[init.method,url.pathname,'',canonicalHeaders,fields[2],hash(init.body??'')].join('\n');
    const scope=fields[1].split('/').slice(1).join('/');
    const toSign=['AWS4-HMAC-SHA256',header['x-amz-date'],scope,hash(canonical)].join('\n');
    let key=Buffer.from('AWS4synthetic-secret');
    for(const value of scope.split('/')) key=createHmac('sha256',key).update(value).digest();
    assert.equal(fields[3],createHmac('sha256',key).update(toSign).digest('hex'));
    if(init.method==='PUT') {assert.equal(header['if-none-match'],'*'); assert.ok(names.includes('if-none-match')); assert.ok(names.includes('content-length'));}
    if(init.method==='DELETE') assert.equal(header['if-match'],undefined);
    const name=url.pathname.endsWith('/control.txt')?'control':'target';
    return init.method==='GET'?new Response(OBJECTS[name].payload,{status:200}):new Response(null,{status:init.method==='PUT'?200:204});
  };
  const origin=createQualificationOrigin(k=>environment[k],request,()=>at);
  for(const op of ['put_control','put_target','conflict_target','get_control','get_target','delete_target','delete_control']) await origin(op);
  assert.equal(requests[0][1].body,MUTATION_RECEIPTS.put_control.payload);
  assert.equal(requests[1][1].body,OBJECTS.control.payload); assert.equal(requests[5][1].body,CONFLICT_PAYLOAD);
  assert.equal(requests.length,12);
  const count=requests.length;
  for(const op of ['list','DELETE','put_arbitrary','__proto__','constructor',OBJECTS.target.key]) await assert.rejects(origin(op),/operation_not_allowlisted/);
  assert.equal(requests.length,count);
});
test('transport refuses non-R2, wrong bucket, endpoint injection, deadline, and sanitized failure', async () => {
  for(const change of [{MEDIA_ORIGIN_BUCKET:'wrong'}, {MEDIA_ORIGIN_R2_ENDPOINT:'https://example.com'},
    {MEDIA_ORIGIN_R2_ENDPOINT:`https://${'a'.repeat(32)}.r2.cloudflarestorage.com`},
    {MEDIA_ORIGIN_R2_ENDPOINT:environment.MEDIA_ORIGIN_R2_ENDPOINT+'/path'}, {MEDIA_ORIGIN_R2_ENDPOINT:environment.MEDIA_ORIGIN_R2_ENDPOINT+'?x=1'},
    {MEDIA_ORIGIN_R2_REGION:'wrong'}, {MEDIA_ORIGIN_PRIVATE_ONLY:'false'}]) {
    assert.throws(()=>createQualificationOrigin(k=>({...environment,...change})[k],()=>{throw Error('must not call');},()=>at));
  }
  const expired=createQualificationOrigin(k=>environment[k],()=>{throw Error('must not call');},()=>Date.parse(DEADLINE));
  await assert.rejects(expired('put_target'),/deadline_passed/);
  const failed=createQualificationOrigin(k=>environment[k],()=>{throw Error('sensitive provider response or credential');},()=>at);
  await assert.rejects(failed('get_target'),e=>e.message==='qualification_origin_unconfirmed');
});
test('bounded full body rejects partial, oversized, compressed, and length-mismatched reads', async () => {
  for(const response of [new Response('x',{status:206}), new Response('x',{headers:{'content-range':'bytes 0-0/4'}}),
    new Response('x',{headers:{'content-encoding':'gzip'}}),new Response('x'.repeat(1025)),
    new Response('x',{headers:{'content-length':'2'}}), new Response('x',{headers:{'content-length':'1025'}})]) await assert.rejects(readBoundedBody(response));
  assert.equal(new TextDecoder().decode(await readBoundedBody(new Response('whole body'))),'whole body');
});
test('rejected GET headers cancel the stream without consuming it', async () => {
  for(const headers of [{'content-length':'1025'},{'content-encoding':'gzip'},{'content-range':'bytes 0-1/4'}]) {
    let cancelled=false;
    const stream=new ReadableStream({cancel(){cancelled=true;}});
    await assert.rejects(readBoundedBody(new Response(stream,{headers})));
    assert.equal(cancelled,true);
  }
});
test('cleanup readback crash uses bounded reconciliation without repeating DELETE', async () => {
  const f=await fixture(); await qualified(f); f.deps.cleanupApproved=true;
  const original=f.deps.origin; let failRead=true;
  f.deps.origin=async op=>{
    if(op==='get_control'&&f.state().phase==='cleanup_started'&&failRead) {failRead=false;throw Error('lost final read');}
    return original(op);
  };
  await assert.rejects(f.run('cleanup'),/lost final read/);
  assert.equal(f.state().pending,'cleanup_verify');
  assert.equal((await f.run('cleanup')).status,'pending_reconcile_required');
  assert.equal((await f.run('reconcile')).status,'cleaned');
  assert.equal(f.calls.filter(op=>op.startsWith('delete_')).length,2);
});
test('endpoint drift cannot retarget cleanup to another R2 account', async () => {
  const f=await fixture(); await qualified(f); f.deps.cleanupApproved=true;
  let networkCalls=0;
  f.deps.origin=op=>createQualificationOrigin(k=>k==='MEDIA_ORIGIN_R2_ENDPOINT'
    ?`https://${'b'.repeat(32)}.r2.cloudflarestorage.com`:environment[k],
    ()=>{networkCalls++;throw Error('must not dispatch');},()=>at)(op);
  await assert.rejects(f.run('cleanup'),/origin_unsupported/);
  assert.equal(networkCalls,0); assert.equal(f.objects.size,2);
});
test('new code does not register a route or alter legacy/expiry behavior', () => {
  const handler=readFileSync(new URL('./r2-disposable-qualification-handler.ts',import.meta.url),'utf8');
  assert.ok(!/^\s*Deno\.serve/m.test(handler)); assert.ok(!handler.includes('apikey'));
  const existing=readFileSync(new URL('../deleted-content-retention-expiry/index.ts',import.meta.url),'utf8');
  assert.ok(existing.includes('timingSafeEqual(actual,expected)'));
  assert.ok(handler.includes('timingSafeEqual(actual, expected)'));
  assert.ok(!existing.includes('r2-disposable-qualification'));
});
