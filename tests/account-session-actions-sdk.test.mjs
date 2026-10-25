import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as sdk from '@supabase/supabase-js';
const load = (file, mocks) => {
  const context = { exports: {}, atob, console, require: name => {
    assert.ok(name in mocks, `unmodeled import ${name}`); return mocks[name];
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText, context); return context.exports;
};
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const owner = (userId = 'a', sessionGeneration = 'generation-a') => ({ userId, accountId: userId, sessionGeneration, state: 'ACTIVE', restoreOnly: false });
const expiresAt = Math.floor(Date.now()/1000)+7200;
const token = (binding, version = 1) => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: binding.userId,
  session_id: binding.sessionGeneration, exp: expiresAt, version })).toString('base64url'), 'fixture'].join('.');
const session = (binding, version) => ({ user: { id: binding.userId, aud: 'authenticated', role: 'authenticated' },
  access_token: token(binding, version), refresh_token: `fixture-refresh-${binding.sessionGeneration}`, token_type: 'bearer', expires_in: 7200, expires_at: Math.floor(Date.now()/1000)+7200 });
async function harness(t) {
  const a = owner(); const key = 'fixture-auth'; const values = new Map([[key, JSON.stringify(session(a))]]);
  const events = [], requests = []; let replacement = owner('b', 'generation-b'), barrier = null, status = 204, onRead = null;
  const storageRuntime = load('_lib/accountSessionStorage.ts', {});
  const adapter = storageRuntime.createAccountSessionStorage({
    async getItem(k) { if (onRead) await onRead(k); return values.get(k) ?? null; },
    async setItem(k,v) { values.set(k,v); }, async removeItem(k) { values.delete(k); },
  });
  const client = sdk.createClient('https://auth.fixture.invalid', 'fixture-anon', {
    auth: { storage: adapter.storage, storageKey: key, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      const path = new URL(url).pathname; requests.push({ url: String(url), authorization: new Headers(init.headers).get('authorization') });
      if (path === '/auth/v1/logout') { if (barrier) { barrier.started.resolve(); await barrier.release.promise; }
        return new Response(status === 204 ? null : JSON.stringify({ message: 'fixture rejection' }), { status }); }
      if (path === '/auth/v1/token') return Response.json(session(replacement));
      assert.fail(`unmodeled network request ${path}`);
    } },
  });
  storageRuntime.guardAccountSessionSignOutEvents(client.auth, adapter.storage, key);
  await client.auth.initializePromise;
  const authority = load('_lib/accountSessionAuthority.ts', { './supabase': { supabase: client }, './entitlementAuthority': {} });
  authority.publishAccountSessionAuthoritySnapshot(a);
  const subscription = client.auth.onAuthStateChange(event => { if(event !== 'INITIAL_SESSION') events.push(event); });
  t.after(() => subscription.data.subscription.unsubscribe());
  const actions = load('_lib/accountSessionActions.ts', { '@supabase/supabase-js': sdk,
    './supabase': { supabase: client, accountSessionStorage: adapter, ACCOUNT_SESSION_STORAGE_KEY: key }, './accountSessionAuthority': authority });
  return { a, values, key, client, authority, actions, adapter, events, requests,
    hold() { barrier = { started: deferred(), release: deferred() }; return barrier; },
    setStatus(next) { status = next; }, setRead(next) { onRead = next; },
    async signIn(next = replacement, publish = true) { replacement = next; const result = await client.auth.signInWithPassword({ email: 'fixture@example.invalid', password: 'not-a-real-password' });
      assert.equal(result.error, null); if (publish) authority.publishAccountSessionAuthoritySnapshot(next); return result; },
  };
}
test('exact SDK baseline demonstrates replacement session removal during public signOut', async t => {
  const h = await harness(t), barrier = h.hold(); const pending = h.client.auth.signOut();
  await barrier.started.promise; await h.signIn(); barrier.release.resolve(); await pending;
  assert.equal(h.values.has(h.key), false); assert.deepEqual(h.events, ['SIGNED_IN', 'SIGNED_OUT']);
});
test('same-session global logout removes local state and emits exactly one signed-out event', async t => {
  const h = await harness(t); assert.equal(await h.actions.signOutExactAccountSession(h.a), true);
  assert.equal(h.values.has(h.key), false); assert.deepEqual(h.events, ['SIGNED_OUT']);
  assert.equal(h.requests.length, 1); assert.match(h.requests[0].url, /logout\?scope=global$/);
  assert.equal(h.requests[0].authorization, `Bearer ${token(h.a)}`);
});
for (const [name,next,publish] of [['replacement account', owner('b','generation-b'),true], ['same user new session',owner('a','generation-new'),true], ['lagging published authority',owner('b','generation-b'),false]]) {
  test(`${name} survives logout request settlement`, async t => {
    const h=await harness(t), barrier=h.hold(), pending=h.actions.signOutExactAccountSession(h.a);
    await barrier.started.promise; await h.signIn(next,publish); barrier.release.resolve();
    assert.equal(await pending,false); assert.equal(JSON.parse(h.values.get(h.key)).access_token,token(next));
    assert.deepEqual(h.events,['SIGNED_IN']); assert.equal(h.requests[0].authorization,`Bearer ${token(h.a)}`);
  });
}
test('replacement saved while exact logout waits for SDK lock cannot become its target', async t => {
  const h=await harness(t), started=deferred(), release=deferred();
  const held=h.client.auth._acquireLock(-1,async()=>{started.resolve(); await release.promise;});
  await started.promise; const pending=h.actions.signOutExactAccountSession(h.a);
  await h.signIn(owner('b','generation-b'),false); release.resolve(); await held;
  assert.equal(await pending,false); assert.equal(h.requests.filter(r=>r.url.includes('/logout')).length,0);
  assert.equal(JSON.parse(h.values.get(h.key)).user.id,'b');
});
test('token refresh in same session and restore-only transition still allow intended logout', async t=>{
  const h=await harness(t); await h.client.auth._saveSession(session(h.a,2));
  h.authority.publishAccountSessionAuthoritySnapshot({...h.a,restoreOnly:true});
  assert.equal(await h.actions.signOutExactAccountSession(h.a),true);
  assert.equal(h.requests[0].authorization,`Bearer ${token(h.a,2)}`);
});
test('all SDK saves serialize with conditional cleanup through async storage', async t=>{
  const h=await harness(t), barrier=h.hold(), pending=h.actions.signOutExactAccountSession(h.a);
  await barrier.started.promise; const read=deferred(), release=deferred(); let intercepted=false;
  h.setRead(async key=>{if(key===h.key&&!intercepted){intercepted=true; read.resolve(); await release.promise;}});
  barrier.release.resolve(); await read.promise;
  const signingIn=h.signIn(); await Promise.resolve(); release.resolve();
  assert.equal(await pending,true); await signingIn;
  assert.equal(JSON.parse(h.values.get(h.key)).user.id,'b'); assert.deepEqual(h.events,['SIGNED_OUT','SIGNED_IN']);
});
for(const status of [401,403,404]) test(`SDK-compatible ${status} still clears exact local session`,async t=>{
  const h=await harness(t); h.setStatus(status); assert.equal(await h.actions.signOutExactAccountSession(h.a),true);
});
test('server failure preserves session and permits retry',async t=>{
  const h=await harness(t); h.setStatus(400); await assert.rejects(h.actions.signOutExactAccountSession(h.a));
  assert.ok(h.values.has(h.key)); assert.deepEqual(h.events,[]); h.setStatus(204);
  assert.equal(await h.actions.signOutExactAccountSession(h.a),true);
});
test('expired local token capture never invokes implicit refresh or deletes its replacement',async t=>{
  const h=await harness(t); const old=session(h.a); old.expires_at=1;
  const claims={sub:h.a.userId,session_id:h.a.sessionGeneration,exp:1};
  old.access_token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify(claims)).toString('base64url'),'fixture'].join('.');
  await h.client.auth._saveSession(old); const barrier=h.hold(); h.setStatus(401);
  const pending=h.actions.signOutExactAccountSession(h.a); await barrier.started.promise;
  assert.equal(h.requests.length,1); assert.ok(h.requests[0].url.includes('/logout'));
  await h.signIn(); barrier.release.resolve(); assert.equal(await pending,false);
  assert.equal(JSON.parse(h.values.get(h.key)).user.id,'b');
});
test('logout remains available when server authority is unknown',async t=>{
  const h=await harness(t); h.authority.publishAccountSessionAuthoritySnapshot(null);
  const expected=h.actions.accountSessionActionIdentity(JSON.parse(h.values.get(h.key)));
  assert.ok(expected); assert.equal(await h.actions.signOutExactAccountSession(expected),true);
});
test('SDK refresh queued during logout cannot resurrect its removed session',async t=>{
  const h=await harness(t), barrier=h.hold(), pending=h.actions.signOutExactAccountSession(h.a);
  await barrier.started.promise; const refreshing=h.client.auth.refreshSession();
  barrier.release.resolve(); assert.equal(await pending,true); const refreshed=await refreshing;
  assert.ok(refreshed.error); assert.equal(h.values.has(h.key),false);
  assert.equal(h.requests.length,1,'no old refresh request may begin after cleanup');
});
test('delayed SDK cross-tab SIGNED_OUT cannot clear replacement UI or realtime subscriber',async t=>{
  const h=await harness(t); await h.signIn();
  await h.client.auth._notifyAllSubscribers('SIGNED_OUT',null,false);
  assert.deepEqual(h.events,['SIGNED_IN']); assert.equal(JSON.parse(h.values.get(h.key)).user.id,'b');
});
test('new sign-in during delayed signed-out storage read retires the old event',async t=>{
  const h=await harness(t), read=deferred(), release=deferred(); let held=false;
  h.setRead(async key=>{if(key===h.key&&!held){held=true;read.resolve();await release.promise;}});
  const event=h.client.auth._notifyAllSubscribers('SIGNED_OUT',null,false);
  await read.promise; await h.signIn(); release.resolve(); await event;
  assert.deepEqual(h.events,['SIGNED_IN']);
});
