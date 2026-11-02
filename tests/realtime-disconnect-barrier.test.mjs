import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
function load(){const context={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/realtimeDisconnectBarrier.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,context);return context.exports.observeRealtimeDisconnect;}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('disconnect observation captures buffer drain without initiating or changing SDK operations',async()=>{
  const observe=load();let finish,calls=0,received;
  const original=new Promise(resolve=>{finish=resolve;});
  const realtime={disconnect(...args){assert.equal(this,realtime);calls++;received=args;return original;}};
  const read=observe(realtime);assert.equal(observe(realtime),read);assert.equal(calls,0);assert.equal(read(),null);
  assert.equal(realtime.disconnect(1000,'fixture'),original);assert.deepEqual(received,[1000,'fixture']);
  let retired=false;read().then(()=>{retired=true;});await tick();assert.equal(retired,false);
  finish('ok');await read();await tick();assert.equal(read(),null);assert.equal(calls,1);
  assert.equal(realtime.disconnect(),original);assert.deepEqual(received,[],'zero arguments remain zero arguments');await read();
});
test('redundant immediate ok cannot replace an older pending native close',async()=>{
  const observe=load();let finish,calls=0;
  const original=new Promise(resolve=>{finish=resolve;});
  const realtime={disconnect(){return ++calls===1?original:Promise.resolve('ok');}};
  const read=observe(realtime);realtime.disconnect();realtime.disconnect();
  let retired=false;read().then(()=>{retired=true;});await tick();assert.equal(retired,false);
  finish('ok');await read();await tick();assert.equal(read(),null);assert.equal(calls,2);
});
test('timeout or rejected disconnect stays failed closed without forcing a peer disconnect',async()=>{
  for(const status of ['timeout','rejected']){
    const observe=load();let calls=0;
    const original=status==='timeout'?Promise.resolve('timeout'):Promise.reject(Error('native close failed'));
    const realtime={disconnect(){calls++;return original;}};const read=observe(realtime);
    assert.equal(realtime.disconnect(),original);await original.catch(()=>undefined);
    await assert.rejects(read(),/realtime_disconnect_unconfirmed|native close failed/);await tick();
    assert.notEqual(read(),null);assert.equal(calls,1);
  }
});
test('independent clients never share retirement or close one another',async()=>{
  const observe=load();let finish;
  const one={disconnect(){return new Promise(resolve=>{finish=resolve;});}};
  const two={disconnect(){throw Error('unrelated peer must not be closed');}};
  const a=observe(one),b=observe(two);one.disconnect();assert.ok(a());assert.equal(b(),null);
  finish('ok');await a();assert.equal(b(),null);
});

test('shared client initializer installs the real observer before session consumers execute',async()=>{
  const observe=load();let finish,calls=0,guarded=false;
  const original=new Promise(resolve=>{finish=resolve;});
  const realtime={disconnect(){assert.equal(this,realtime);calls++;return original;}};
  const client={realtime,auth:{}};const storage={};
  const context={exports:{},require(name){
    if(name==='react-native-get-random-values'||name==='react-native-url-polyfill/auto')return {};
    if(name==='@react-native-async-storage/async-storage')return {default:storage};
    if(name==='react-native')return {Platform:{OS:'ios'}};
    if(name==='@supabase/supabase-js')return {createClient:()=>client};
    if(name==='./runtimeConfig')return {getRuntimeConfig:()=>({supabaseUrl:'https://fixture.invalid',supabaseAnonKey:'fixture-public'})};
    if(name==='./realtimeDisconnectBarrier')return {observeRealtimeDisconnect:observe};
    if(name==='./accountSessionStorage')return {
      createAccountSessionStorage:()=>({storage}),
      guardAccountSessionSignOutEvents(auth){
        assert.equal(auth,client.auth);assert.equal(calls,0,'installation observes without disconnecting');
        assert.equal(realtime.disconnect(),original);
        assert.ok(observe(realtime)(),'first consumer sees teardown already tracked');guarded=true;
      },
    };
    assert.fail(`unmodeled initializer import ${name}`);
  }};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/supabase.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText,context);
  assert.equal(guarded,true);assert.equal(context.exports.supabase,client);
  assert.equal(context.exports.getRealtimeDisconnectBarrier,observe(realtime));
  finish('ok');await context.exports.getRealtimeDisconnectBarrier();
});

test('settled failure recovers only after detached SDK completion, not merely public closed state',async()=>{
  for(const status of ['timeout','rejected']){
    const observe=load();let finish,calls=0;
    const socket={conn:{},disconnecting:true};let state='closing';
    const realtime={connectionState:()=>state,socketAdapter:{getSocket:()=>socket},disconnect(){
      calls++;return calls===1?(status==='timeout'?Promise.resolve('timeout'):Promise.reject(Error('close failed')))
        :new Promise(resolve=>{finish=resolve;});
    }};
    const read=observe(realtime);realtime.disconnect().catch(()=>{});await assert.rejects(read());
    state='closed';await assert.rejects(read(),'native closed with old connection attached is not cleanup');
    socket.conn=null;await assert.rejects(read(),'detached but completion callback still pending is not cleanup');
    realtime.disconnect();const pending=read();socket.disconnecting=false;
    assert.equal(read(),pending,'even detached state never skips a still-active operation');
    finish('ok');await pending;await tick();assert.equal(read(),null);assert.equal(calls,2);
  }
});
test('late original timeout completion allows a future generation without another forced disconnect',async()=>{
  const observe=load();let calls=0;const socket={conn:null,disconnecting:true};
  const realtime={connectionState:()=> 'closed',socketAdapter:{getSocket:()=>socket},disconnect(){calls++;return Promise.resolve('timeout');}};
  const read=observe(realtime);await realtime.disconnect();await assert.rejects(read());
  socket.disconnecting=false;assert.equal(read(),null);assert.equal(calls,1);
});
test('unknown SDK cleanup shape and redundant early ok cannot recover unconfirmed failed teardown',async()=>{
  for(const socket of [{conn:{},disconnecting:false},{conn:null,disconnecting:true},{}]){
    const observe=load();let calls=0;
    const realtime={connectionState:()=> 'closed',socketAdapter:{getSocket:()=>socket},disconnect(){return Promise.resolve(++calls===1?'timeout':'ok');}};
    const read=observe(realtime);await realtime.disconnect();await assert.rejects(read());
    await realtime.disconnect();await assert.rejects(read());assert.notEqual(read(),null);assert.equal(calls,2);
  }
});
test('overlapping failure cannot release an older still-active close even with detached-looking state',async()=>{
  const observe=load();let finish,calls=0,settled=false;
  const realtime={connectionState:()=> 'closed',socketAdapter:{getSocket:()=>({conn:null,disconnecting:false})},disconnect(){
    return ++calls===1?new Promise(resolve=>{finish=resolve;}):Promise.reject(Error('second close failed'));
  }};
  const read=observe(realtime);realtime.disconnect();realtime.disconnect().catch(()=>{});
  const pending=read();void pending.then(()=>{settled=true;},()=>{settled=true;});await tick();
  assert.equal(settled,false);assert.equal(read(),pending);finish('ok');await pending;await tick();
  assert.equal(read(),null);assert.equal(calls,2);
});
test('a reopened peer is not detached-idle proof and is never disconnected to recover discovery',async()=>{
  const observe=load();let calls=0;
  const realtime={connectionState:()=> 'open',socketAdapter:{getSocket:()=>({conn:null,disconnecting:false})},disconnect(){calls++;return Promise.resolve('timeout');}};
  const read=observe(realtime);await realtime.disconnect();await assert.rejects(read());
  assert.notEqual(read(),null);assert.equal(calls,1);
});
