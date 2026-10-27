import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url), ts = require('typescript');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
const authority = (userId = 'A', sessionGeneration = 'one') => ({userId, accountId:userId, sessionGeneration, state:'ACTIVE', restoreOnly:false});
function load(file, mocks, globals = {}, transform = source => source) {
  const context = {exports:{}, console, setTimeout, clearTimeout, ...globals,
    require:name => { assert.ok(name in mocks, `unmodeled dependency ${name}`); return mocks[name]; }};
  vm.runInNewContext(ts.transpileModule(transform(fs.readFileSync(file, 'utf8')), {
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}, fileName:file,
  }).outputText, context, {filename:file});
  return context.exports;
}
function harness({legacyCacheWrite = false, realSdk = false} = {}) {
  let current = authority(), hold = null, failed = false, cleanupFailed = false, cacheReadFailed = false;
  let requestGate = null, requestTable = '';
  const transportEntered = deferred(), requests = [];
  const entered = deferred(), writes = [], upserts = [], deletes = [], options = [], snapshots = [], storage = new Map();
  const scoped = load('_lib/accountScopedStorage.ts', {});
  const key = id => scoped.getAccountScopedStorageKey('@chillywood/user-profile', id);
  storage.set(key('A'), JSON.stringify({username:'alpha',avatarIndex:0,tagline:'old'}));
  storage.set(key('B'), JSON.stringify({username:'bravo',avatarIndex:1,tagline:'B unchanged'}));
  const assertCurrent = subject => {
    if (JSON.stringify(subject.authority) !== JSON.stringify(current)) throw new Error('Account changed');
  };
  const mutation = {
    captureAccountBoundSupabaseMutationSubject:async () => {
      if (!current || current.restoreOnly) throw new Error('Account changed');
      return {authority:{...current},accessToken:`token-${current.userId}-${current.sessionGeneration}`};
    },
    assertAccountBoundSupabaseMutationSubjectCurrent:assertCurrent,
  };
  function client(token) {
    return {
      auth:{getSession:async () => ({data:{session:{user:{id:current.userId},access_token:'shared'}}})},
      from:table => {
        let patch, id;
        const query = {
          update:value => {patch=value; return query;}, select:() => query,
          eq:(_column,value) => {id=value;return query;},
          maybeSingle:async () => {
            if (!patch) return {data:null,error:null}; // real readUserProfile uses seeded account cache
            writes.push({token,table,id,patch}); entered.resolve();
            if (hold) await hold.promise;
            return failed ? {data:null,error:{message:'network failed'}} : {data:{user_id:id},error:null};
          },
          upsert:async value => {upserts.push({token,value});return {error:failed?{message:'network failed'}:null};},
          then:resolve => {if(patch)snapshots.push({table,patch,token});return Promise.resolve({data:null,error:null}).then(resolve);},
        };
        return query;
      },
      storage:{from:() => ({
        remove:async keys => {deletes.push({token,keys});return {error:cleanupFailed?{message:'cleanup failed'}:null};},
        createSignedUrl:async () => ({data:{signedUrl:'https://fixture.invalid/image'},error:null}),
        upload:async () => ({error:null}),
      })},
    };
  }
  const shared = client('shared'), supabase = {supabase:shared,SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'public-fixture'};
  const sdk = {createClient:(url,key,config) => {
    options.push(config);
    if (!realSdk) return client(config.global.headers.Authorization);
    return require('@supabase/supabase-js').createClient(url,key,{...config,global:{...config.global,
      fetch:async (url,init) => {
        const table=new URL(String(url)).pathname.split('/').at(-1);
        if (table===requestTable) {transportEntered.resolve();await requestGate.promise;}
        requests.push({table,url:String(url),token:new Headers(init.headers).get('Authorization'),body:JSON.parse(init.body??'null')});
        return new Response(JSON.stringify(table==='user_profiles' && init.method==='PATCH'?{user_id:'A'}:[]),{
          status:200,headers:{'content-type':'application/json'},
        });
      },
    }});
  }};
  const normalize = value => value;
  const userData = load('_lib/userData.ts', {
    'react-native-get-random-values':{},
    '@react-native-async-storage/async-storage':{default:{getItem:async k => {if(cacheReadFailed)throw new Error('cache read failed');return storage.get(k) ?? null;},setItem:async(k,v) => {storage.set(k,v);}}},
    '@supabase/supabase-js':sdk, './accountBoundSupabaseMutation':mutation,
    './accountScopedStorage':scoped, './userCollectionSync':{},
    './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:() => current,
      sameAccountSessionAuthority:(a,b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b)},
    './accessVisibility':{normalizeAccessVisibility:normalize},
    './officialAccounts':{getOfficialPlatformAccount:() => null},
    './roomRules':Object.fromEntries(['normalizeCapturePolicy','normalizeContentAccessRule','normalizeJoinPolicy','normalizeReactionsPolicy'].map(k => [k,normalize])),
    './profileVisibility':{normalizeProfileVisibility:normalize}, './supabase':supabase,
    './usernameHandles':{normalizeUsernameHandle:normalize,formatUsernameHandle:normalize},
  });
  const media = load('_lib/profileMedia.ts', {
    'expo-file-system':{File:class {}},
    'expo-file-system/legacy':{uploadAsync:async () => ({status:200}),FileSystemUploadType:{BINARY_CONTENT:0},getInfoAsync:async () => ({exists:true,size:10})},
    '@supabase/supabase-js':sdk, './accountBoundSupabaseMutation':mutation,
    './imageUploadNormalization':{normalizeImageUploadFile:async file => ({file,cleanup:async () => {}})},
    './userData':userData, './supabase':supabase,
    './logger':{reportRuntimeError:() => {}},
  }, {fetch:async () => ({ok:true,arrayBuffer:async () => new ArrayBuffer(1)})}, source => {
    if (!legacyCacheWrite) return source;
    // Negative control restores the audited unsafe chain: no post-response
    // ownership check, and saveUserProfile captures whichever account is current.
    return source.replace('  cacheAcknowledgedUserProfile,','  cacheAcknowledgedUserProfile,\n  saveUserProfile,')
      .replace('.maybeSingle();\n  assertMediaOperationCurrent(operation);','.maybeSingle();')
      .replace('return cacheAcknowledgedUserProfile(cachePatch, operation.subject.authority, operation.client);','await saveUserProfile(normalized); return normalized;');
  });
  return {media,userData,storage,key,writes,upserts,deletes,options,snapshots,entered:entered.promise,
    hold:() => (hold=deferred()), switch:(id,generation='one') => {current=authority(id,generation);},
    fail:() => {failed=true;}, failCleanup:() => {cleanupFailed=true;}, binding:() => current,
    failCacheRead:() => {cacheReadFailed=true;},
    requests, transportEntered:transportEntered.promise,
    holdTransport:table => {requestTable=table;return requestGate=deferred();}};
}
const operations = {
  upload:h => h.media.uploadProfileMedia('avatar',{uri:'file:///photo.jpg',mimeType:'image/jpeg',size:10}),
  remove:h => h.media.removeProfileMedia('avatar'),
  fit:h => h.media.updateProfileMediaFitMode('background','fit'),
  about:h => h.userData.saveUserProfileAbout('new About','A',h.binding()),
};
for (const [name, run] of Object.entries(operations)) {
  for (const transition of ['account','generation']) test(`${name}: held row response cannot cache across ${transition} replacement`, async () => {
    const h=harness(), held=h.hold(), beforeA=h.storage.get(h.key('A')), beforeB=h.storage.get(h.key('B'));
    const pending=run(h); await h.entered;
    h.switch(transition==='account'?'B':'A', transition==='generation'?'two':'one'); held.resolve();
    await assert.rejects(pending,/Account changed/);
    assert.equal(h.storage.get(h.key('A')),beforeA); assert.equal(h.storage.get(h.key('B')),beforeB);
    assert.equal(h.upserts.length,0); assert.equal(h.writes[0].id,'A');
    assert.equal(h.writes[0].token,'Bearer token-A-one');
    assert.equal(h.deletes.length,0,'an acknowledged/ambiguous upload must not be deleted after lost ownership');
  });
  test(`${name}: successful acknowledged patch updates only initiating cache without second upsert`,async () => {
    const h=harness(), beforeB=h.storage.get(h.key('B'));await run(h);
    assert.equal(h.storage.get(h.key('B')),beforeB);assert.equal(h.writes.length,1);assert.equal(h.upserts.length,0);
    const profile=JSON.parse(h.storage.get(h.key('A')));assert.equal(profile.username,'alpha');
    if(name==='upload')assert.match(profile.avatarUrl,/ownerUserId=A/);
    if(name==='remove')assert.equal(profile.profileAvatarMediaStatus,'user_removed');
    if(name==='fit')assert.equal(profile.profileBackgroundFitMode,'fit');
    if(name==='about')assert.equal(profile.tagline,'new About');
    assert.equal(h.options[0].auth.persistSession,false);
  });
  test(`${name}: failed remote patch leaves profile cache unchanged`,async () => {
    const h=harness(), before=h.storage.get(h.key('A'));h.fail();await assert.rejects(run(h),/network failed/);
    assert.equal(h.storage.get(h.key('A')),before);assert.equal(h.upserts.length,0);
  });
}
test('remote-ack About save rejects network error without caching a false success',async () => {
  const h=harness(), before=h.storage.get(h.key('A'));h.fail();
  await assert.rejects(h.userData.saveUserProfileRemote({username:'alpha',avatarIndex:0,tagline:'new'},'A',h.binding()),/could not be saved/);
  assert.equal(h.storage.get(h.key('A')),before);
});
test('remote-ack save rejects a stale same-user authority before transport',async () => {
  const h=harness(), initiating=h.binding();h.switch('A','two');
  await assert.rejects(h.userData.saveUserProfileRemote({username:'alpha'},'A',initiating),/Account changed/);
  assert.equal(h.upserts.length,0);
});
test('negative control: the isolation oracle rejects the old post-await recapture chain',async () => {
  const h=harness({legacyCacheWrite:true}), held=h.hold(), before=h.storage.get(h.key('B'));
  const pending=operations.fit(h);await h.entered;h.switch('B');held.resolve();
  await assert.rejects(async () => { await assert.rejects(pending,/Account changed/); },/Missing expected rejection/);
  assert.notEqual(h.storage.get(h.key('B')),before);
  assert.equal(JSON.parse(h.storage.get(h.key('B'))).username,'alpha');
  assert.equal(h.upserts[0].value.user_id,'B');
});
test('appearance cache merge preserves a concurrent About update while row request is held',async () => {
  const h=harness(), held=h.hold(), pending=operations.fit(h);await h.entered;
  const profile=JSON.parse(h.storage.get(h.key('A')));profile.tagline='new About';h.storage.set(h.key('A'),JSON.stringify(profile));
  held.resolve();const result=await pending;assert.equal(result.tagline,'new About');
  const saved=JSON.parse(h.storage.get(h.key('A')));assert.equal(saved.tagline,'new About');assert.equal(saved.profileBackgroundFitMode,'fit');
});
test('cleanup failure after committed removal does not falsely report save failure',async () => {
  const h=harness(), profile=JSON.parse(h.storage.get(h.key('A')));
  profile.avatarUrl='https://fixture.invalid/storage/v1/object/public/profile-media/A/avatar/old.jpg';
  h.storage.set(h.key('A'),JSON.stringify(profile));h.failCleanup();
  const result=await operations.remove(h);assert.equal(result.profileAvatarMediaStatus,'user_removed');
  assert.equal(h.deletes.length,1);assert.equal(h.writes.length,1);assert.equal(h.upserts.length,0);
});
test('cache helper itself rejects stale authority, including same-user replacement',async () => {
  const h=harness(), initiating=h.binding(), before=h.storage.get(h.key('A'));h.switch('A','two');
  await assert.rejects(h.userData.cacheAcknowledgedUserProfile({tagline:'stale'},initiating),/Account changed/);
  assert.equal(h.storage.get(h.key('A')),before);
});
for(const transition of ['account','generation']) {
  test(`real SDK Studio upsert keeps initiating bearer while transport spans ${transition} change`,async () => {
    const h=harness({realSdk:true}), gate=h.holdTransport('user_profiles'), before=h.storage.get(h.key('B'));
    const pending=h.userData.saveUserProfileRemote({username:'alpha',avatarIndex:0,tagline:'new'},'A',h.binding());
    await h.transportEntered;h.switch(transition==='account'?'B':'A',transition==='generation'?'two':'one');gate.resolve();
    await assert.rejects(pending,/Account changed/);
    assert.equal(h.requests.length,1);assert.equal(h.requests[0].token,'Bearer token-A-one');
    assert.equal(h.requests[0].body.user_id,'A');assert.equal(h.storage.get(h.key('B')),before);
  });
  for(const surface of ['About','appearance'])test(`real SDK ${surface} identity refresh keeps initiating bearer across ${transition} change`,async () => {
    const h=harness({realSdk:true}), gate=h.holdTransport('chat_thread_members'), before=h.storage.get(h.key('B'));
    const pending=surface==='About'
      ? h.userData.saveUserProfileAbout('new About','A',h.binding())
      : operations.fit(h);
    await h.transportEntered;h.switch(transition==='account'?'B':'A',transition==='generation'?'two':'one');gate.resolve();
    await assert.rejects(pending,/Account changed/);
    const identity=h.requests.filter(r=>r.table!=='user_profiles');assert.equal(identity.length,3);
    assert.ok(identity.every(r=>r.token==='Bearer token-A-one'));assert.equal(h.storage.get(h.key('B')),before);
  });
}
test('appearance cache read failure cannot replace identity with fallback defaults',async () => {
  const h=harness(), held=h.hold(), before=h.storage.get(h.key('A')), pending=operations.fit(h);
  await h.entered;h.failCacheRead();held.resolve();await assert.rejects(pending,/cache read failed/);
  assert.equal(h.storage.get(h.key('A')),before);
});
test('appearance cache disappearing cannot invent a default replacement identity',async () => {
  const h=harness(), held=h.hold(), pending=operations.fit(h);
  await h.entered;h.storage.delete(h.key('A'));held.resolve();await assert.rejects(pending,/local profile is unavailable/);
  assert.equal(h.storage.has(h.key('A')),false);
});
test('narrow About update preserves concurrent appearance in cache and returned profile',async () => {
  const h=harness(), held=h.hold(), pending=operations.about(h);await h.entered;
  const profile=JSON.parse(h.storage.get(h.key('A')));profile.avatarUrl='https://fixture.invalid/new-avatar';
  h.storage.set(h.key('A'),JSON.stringify(profile));held.resolve();const saved=await pending;
  assert.deepEqual(Object.keys(h.writes[0].patch),['tagline']);assert.equal(h.upserts.length,0);
  assert.equal(saved.avatarUrl,profile.avatarUrl);assert.equal(saved.tagline,'new About');
  assert.equal(JSON.parse(h.storage.get(h.key('A'))).avatarUrl,profile.avatarUrl);
});
test('real SDK About sends only a bounded tagline patch for the initiating user',async () => {
  const h=harness({realSdk:true});await h.userData.saveUserProfileAbout(' x '.repeat(100),'A',h.binding());
  const request=h.requests.find(r=>r.table==='user_profiles');assert.deepEqual(Object.keys(request.body),['tagline']);
  assert.equal(request.body.tagline.length,160);assert.match(request.url,/user_id=eq.A/);
  assert.equal(request.token,'Bearer token-A-one');
  await h.userData.saveUserProfileAbout('  ','A',h.binding());
  assert.equal(h.requests.filter(r=>r.table==='user_profiles').at(-1).body.tagline,null);
});
for(const order of ['about-first','appearance-first'])test(`simultaneous About and appearance acknowledgments serialize cache merges (${order})`,async () => {
  const h=harness();
  await Promise.all(order==='about-first'?[operations.about(h),operations.fit(h)]:[operations.fit(h),operations.about(h)]);
  const saved=JSON.parse(h.storage.get(h.key('A')));
  assert.equal(saved.tagline,'new About');assert.equal(saved.profileBackgroundFitMode,'fit');
  assert.equal(h.snapshots.filter(s=>s.table==='chat_thread_members').at(-1).patch.tagline,'new About');
});
