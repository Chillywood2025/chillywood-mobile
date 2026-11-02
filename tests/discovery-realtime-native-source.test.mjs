import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {parse} from 'yaml';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {assertDiscoveryHintPayload} from '../scripts/lib/discovery-native-hint-contract.mjs';

const command='node --experimental-websocket scripts/test-discovery-realtime-delivery.mjs';
const script=fs.readFileSync('scripts/test-discovery-realtime-delivery.mjs','utf8');
const workflowSource=fs.readFileSync('.github/workflows/required-validation.yml','utf8');
function validate(source,workflowText) {
  for(const fragment of ["from '@supabase/supabase-js'","process.env.GITHUB_ACTIONS,'true'",'GITHUB_REPOSITORY',
    "typeof globalThis.WebSocket,'function'",'globalThis.WebSocket.prototype.close','globalThis.WebSocket.prototype.send',
    "query('show cron.launch_active_jobs'),'off'", "['127.0.0.1','localhost']",'com.supabase.cli.project',
    "admin.auth.admin.createUser",'auth.signInWithPassword','seedLiveRoomActor',"client.channel(topic",
    "event:'discovery:invalidate'",'discovery:v1:viewer:',"{denied:true}","receiptMs<3000",'inserted_at>=','pg_sleep(0.25)',
    'managedClock.default','clock_timestamp',
    'assertDiscoveryHintPayload(message.payload','JSON.stringify(message.payload)','message.payload.keys.includes(source.key)',
    'message.payload.keys.includes(titleKey)',"profile_access_visibility='private'",'rt_circle_',
    'set_watch_party_room_host_settings',"next_action:'remove'",'actual Circle reacceptance',
    'private-only edit','rolled-back publication','post-reconnect Off','primary-disabled negative control',
    "admin.rpc('flush_discovery_invalidations'",'receive-only viewer channel',"delete from auth.sessions",'host session revoked',
    'primary_delivery_enabled=${initial.config.primary_delivery_enabled}']) assert.ok(source.includes(fragment),fragment);
  assert.doesNotMatch(source,/create\s+(?:or\s+replace\s+)?function\s+(?:public|private|realtime)\./i,
    'no fake authority or Realtime transport replaces actual native boundaries');
  assert.doesNotMatch(source,/alter\s+table\s+realtime\.messages/i,'never adapt the managed schema to satisfy the proof');
  assert.doesNotMatch(source,/setInterval\s*\(/,'no polling loop can satisfy primary receipt proof');
  const workflow=parse(workflowText),database=workflow.jobs.database;
  assert.equal(database.if,"needs.plan.outputs.database == 'true'");
  assert.equal(database['continue-on-error'],undefined);
  const steps=database.steps.filter(step=>step.run?.split('\n').includes(command));
  assert.equal(steps.length,1,'actual SDK proof executes once, not merely mentioned');
  assert.equal(steps[0].if,undefined);assert.equal(steps[0]['continue-on-error'],undefined);
  const block=steps[0].run.split("<<'NATIVE_PROOFS'")[1]?.split('NATIVE_PROOFS')[0];
  assert.ok(block?.split('\n').includes(command),'real websocket proof is inside cron-paused disposable validation');
  assert.ok(block.includes('node --test tests/discovery-realtime-native-source.test.mjs'));
}
test('native discovery proof retains real SDK/Auth/RLS receipts, no polling substitute, and mandatory CI execution',()=>validate(script,workflowSource));
test('native runner rejects missing WebSocket before any cluster or Auth setup',()=>{
  const result=spawnSync(process.execPath,['--no-experimental-websocket','scripts/test-discovery-realtime-delivery.mjs'],{
    encoding:'utf8',timeout:10000,env:{...process.env,GITHUB_ACTIONS:'false'},
  });
  assert.equal(result.error,undefined);assert.equal(result.status,1);
  assert.match(result.stderr,/native WebSocket required: run node --experimental-websocket/);
  assert.doesNotMatch(result.stderr,/owned Actions cluster only|connToClose|spawnSync docker/);
});
test('native flag supplies the actual SDK WebSocket transport, never Object or a fake adapter',()=>{
  const preflight=script.slice(script.indexOf('assert.equal(typeof globalThis.WebSocket'),script.indexOf('assert.equal(process.env.GITHUB_ACTIONS'));
  assert.ok(preflight.includes('globalThis.WebSocket.prototype.close'));
  assert.throws(()=>vm.runInNewContext(preflight,{assert,WebSocket:Object}),assert.AssertionError,'a function without socket methods is not a transport');
  const result=spawnSync(process.execPath,['--experimental-websocket','--input-type=module','-e',`
    import assert from 'node:assert/strict';
    import {createClient} from '@supabase/supabase-js';
    ${preflight}
    const client=createClient('http://127.0.0.1:1','synthetic-noncredential',{
      auth:{persistSession:false,autoRefreshToken:false}
    });
    assert.equal(client.realtime.transport,globalThis.WebSocket);
    assert.notEqual(client.realtime.transport,Object);
  `],{encoding:'utf8',timeout:10000});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
});
test('native proof qualifies exact managed transaction or wall-clock defaults without accepting arbitrary timestamps',()=>{
  const contract=script.slice(script.indexOf('assert.equal(managedClock.type'),script.indexOf('const lit='));
  assert.ok(contract.includes('managedClock.default'));
  const run=(type,defaultValue)=>vm.runInNewContext(contract,{assert,managedClock:{type,default:defaultValue}});
  for(const value of ['now()',"timezone('utc'::text, clock_timestamp())"])
    assert.doesNotThrow(()=>run('timestamp without time zone',value));
  for(const value of [null,'',"'2000-01-01'::timestamp without time zone",'arbitrary_clock()'])
    assert.throws(()=>run('timestamp without time zone',value),assert.AssertionError);
  assert.throws(()=>run('timestamp with time zone','now()'),assert.AssertionError);
});
test('native proof source guard rejects removed privacy, primary timing and execution boundaries',()=>{
  for(const needle of ["query('show cron.launch_active_jobs'),'off'",'receiptMs<3000',"next_action:'remove'",'rolled-back publication',
    'primary-disabled negative control','receive-only viewer channel',"delete from auth.sessions",'JSON.stringify(message.payload)',
    'message.payload.keys.includes(source.key)',"profile_access_visibility='private'"])
    assert.throws(()=>validate(script.replaceAll(needle,'REMOVED_BOUNDARY'),workflowSource),assert.AssertionError,needle);
  for(const replacement of ['',command.replace(' --experimental-websocket',''),`${command} || true`,`if false; then ${command}; fi`])
    assert.throws(()=>validate(script,workflowSource.replace(command,replacement)),assert.AssertionError,replacement);
  assert.throws(()=>validate(`${script}\nalter table realtime.messages alter column inserted_at set default clock_timestamp();`,workflowSource),assert.AssertionError);
});
test('native receipt parser rejects ID-only, raw identity, unbounded and metadata-bearing payloads',()=>{
  const id=randomUUID(),key=randomUUID(),raw=randomUUID();
  assert.doesNotThrow(()=>assertDiscoveryHintPayload({id,keys:[key]},[raw]));
  for(const payload of [null,[],{id},{id,keys:[]},{id,keys:[key,key]},
    {id,keys:Array.from({length:257},()=>randomUUID())},{id,keys:['ROOM-CODE']},
    {id,keys:[raw]},{id,keys:[id]},{id,keys:[key],roomId:'private-code'},{id,keys:[key],name:'Hidden host'}])
    assert.throws(()=>assertDiscoveryHintPayload(payload,[raw]),assert.AssertionError);
});
