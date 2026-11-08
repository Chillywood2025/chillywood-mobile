import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRpc, durableJson, journalState, hash, privateJson, runScanChild, runWorker, validateBinding, workerStatus } from './runner.mjs';

const binding = () => ({ protocol: 'scpv-operations-binding-v1', projectRef: 'abcdefghijklmnopqrst', endpoint: 'https://abcdefghijklmnopqrst.supabase.co',
 installationId: randomUUID(), sourceSha256: '1'.repeat(64), workerId: randomUUID(), workerSha256: '2'.repeat(64), verifierId: randomUUID(),
 verifierEvidenceSha256: '3'.repeat(64), configurationDigest: '4'.repeat(64), routeId: randomUUID(), qualificationSha256: '5'.repeat(64) });
const privateWork = async t => { const dir = await fs.mkdtemp('/tmp/scpv-runner-test-'); await fs.chmod(dir,0o700); t.after(()=>fs.rm(dir,{recursive:true,force:true})); return dir; };
const ack = (raw, result) => ({ protocol:'scpv-operations-response-v1',state:'acknowledged',requestId:JSON.parse(raw).requestId,requestSha256:hash(raw),result });
test('endpoint/project binding rejects redirects, arbitrary target and malformed scope', () => {
 const b = binding(); assert.deepEqual(validateBinding(b),b);
 for (const changed of [{endpoint:'http://localhost:8000'},{projectRef:'different'},{sourceSha256:'x'},{workerId:undefined},{extra:true}])
  assert.throws(()=>validateBinding({...b,...changed}),/binding_invalid/u);
});
test('transport uses only pinned RPC and separate authenticated credential/apikey; malformed response bounded', async () => {
 const b=binding(); let seen;
 const rpc=createRpc({binding:b,token:'user-jwt-'.repeat(4),apiKey:'publishable-'.repeat(4),request:async(url,opts)=>{
  seen={url,opts};return new Response(JSON.stringify({state:'ok'}),{headers:{'content-type':'application/json'}});
 }});
 assert.deepEqual(await rpc('inspect','{}',Date.now()+1000,'isolated_paid_video_review_v1'),{state:'ok'});
 assert.equal(seen.url,b.endpoint+'/rest/v1/rpc/isolated_paid_video_review_v1');assert.equal(seen.opts.redirect,'error');
 assert.equal(seen.opts.headers.apikey,'publishable-'.repeat(4));assert.equal(seen.opts.headers.authorization,'Bearer '+'user-jwt-'.repeat(4));
 await assert.rejects(rpc('inspect','{}',Date.now()+1000,'arbitrary'),/rpc_invalid/u);
 const huge=createRpc({binding:b,token:'secret'.repeat(10),request:async()=>new Response('x'.repeat(65537),{headers:{'content-type':'application/json'}})});
 await assert.rejects(huge('recover','{}',Date.now()+1000),/response_limit/u);
});
test('private durable state refuses insecure files and symlinks', async t => {
 const dir=await privateWork(t);await durableJson(dir,'state.json',{phase:'unknown'});
 assert.deepEqual(await privateJson(path.join(dir,'state.json')),{phase:'unknown'});
 await fs.symlink(path.join(dir,'state.json'),path.join(dir,'alias'));
 await assert.rejects(privateJson(path.join(dir,'alias')));
 await fs.chmod(path.join(dir,'state.json'),0o644);await assert.rejects(privateJson(path.join(dir,'state.json')),/private_file_required/u);
});
test('lost request never re-executes, does not lease another upload, and persists across restart',async t=>{
 const dir=await privateWork(t),b=binding();const calls=[];
 const args={binding:b,directory:dir,deadline:Date.now()+10000,scan:async()=>assert.fail('no scan'),rpc:async(action,raw)=>{calls.push({action,raw});throw Error('offline');}};
 assert.equal((await runWorker(args)).state,'unknown');assert.equal((await runWorker(args)).state,'unknown');
 assert.deepEqual(calls.map(c=>c.action),['execute','recover']);assert.equal(calls[0].raw,calls[1].raw);
 assert.equal((await privateJson(path.join(dir,'state.json'))).phase,'unknown');
});
test('mismatched recovery ack does not authorize a scan',async t=>{
 const dir=await privateWork(t),b=binding();let raw;
 const args={binding:b,directory:dir,deadline:Date.now()+10000,scan:async()=>assert.fail('no scan'),rpc:async(action,sent)=>{
  raw=sent;if(action==='execute')throw Error('lost');return{...ack(sent,{state:'empty'}),requestSha256:'f'.repeat(64)};
 }};
 assert.equal((await runWorker(args)).state,'unknown');assert.equal((await runWorker(args)).state,'unknown');
 assert.equal((await privateJson(path.join(dir,'state.json'))).raw,raw);
});
test('same retained state cannot be reused with new installation/source/worker',async t=>{
 const dir=await privateWork(t),b=binding();await journalState(dir,null,{binding:b,phase:'unknown',raw:'{}'},'fixture');
 await assert.rejects(runWorker({binding:{...b,installationId:randomUUID()},directory:dir,deadline:Date.now()+1000,
 rpc:async()=>assert.fail('no network'),scan:async()=>assert.fail('no scan')}),/retained_binding_changed/u);
});
test('interrupted scanner state is held for review, never restarted automatically',async t=>{
 const dir=await privateWork(t),b=binding();await journalState(dir,null,{binding:b,phase:'scanning',raw:'{}'},'fixture');
 assert.equal((await runWorker({binding:b,directory:dir,deadline:Date.now()+1000,rpc:async()=>assert.fail('no network'),scan:async()=>assert.fail('no scan')})).state,'interrupted_scan');
});
test('live lock blocks a second worker and remains untouched',async t=>{
 const dir=await privateWork(t),b=binding();await fs.mkdir(path.join(dir,'runner.lock'),{mode:0o700});
 await assert.rejects(runWorker({binding:b,directory:dir,deadline:Date.now()+1000,rpc:async()=>assert.fail('no network'),scan:async()=>assert.fail('no scan')}),{code:'EEXIST'});
 assert.equal((await fs.stat(path.join(dir,'runner.lock'))).isDirectory(),true);
});
test('polling remains bounded by overall deadline even when queue stays empty',async t=>{
 const dir=await privateWork(t),b=binding();let now=1000,calls=0;
 const result=await runWorker({binding:b,directory:dir,deadline:3500,maxJobs:16,pollMs:1000,now:()=>now,
 sleep:async ms=>{now+=ms;},rpc:async(a,r)=>{calls++;return ack(r,{state:'empty'});},scan:async()=>assert.fail('no scan')});
 assert.equal(calls,3);assert.equal(result.completed,0);assert.equal(now,3500);
});
test('stale leased ticket cannot launch scanner',async t=>{
 const dir=await privateWork(t),b=binding();
 const result={state:'leased',binding:b,ticket:{protocol:'scpv-worker-ticket-v1',profile:'scpv-mp4-h264-aac-v1',ticketId:randomUUID(),uploadId:'scpv_upload_'+randomUUID(),
 incarnation:randomUUID(),routeId:b.routeId,provider:'s3',objectVersion:'v1',expiresAt:new Date(Date.now()-1).toISOString()}};
 await assert.rejects(runWorker({binding:b,directory:dir,deadline:Date.now()+10000,rpc:async(a,r)=>ack(r,result),scan:async()=>assert.fail('no scan')}),/ticket_invalid/u);
});
test('scanner subprocess hard deadline kills its process group',async()=>{
 await assert.rejects(runScanChild({ticket:{expiresAt:new Date(Date.now()+10000).toISOString()},configuration:{},deadline:Date.now()+1,onProcess:async()=>{}}),/scan_deadline|runner_deadline/u);
});

// RPC/signatures below are synthetic orchestration fixtures. The separate
// native proof exercises actual PostgreSQL and actual FFmpeg/ClamAV.
async function interruptedFixture(t) {
 const directory=await privateWork(t),b=binding(),calls=[],results=new Map();let scans=0,failScan=true,loseResult=false;
 const ticket={protocol:'scpv-worker-ticket-v1',profile:'scpv-mp4-h264-aac-v1',ticketId:randomUUID(),uploadId:'scpv_upload_'+randomUUID(),
  incarnation:randomUUID(),routeId:b.routeId,provider:'s3',objectVersion:'v1',expectedSha256:'a'.repeat(64),expiresAt:new Date(Date.now()+60000).toISOString()};
 const rpc=async(action,raw)=>{
  const request=JSON.parse(raw);calls.push({action,raw});
  if(action==='execute') {
   const result=request.command==='result'?{accepted:true}:{state:'leased',binding:b,ticket};results.set(raw,ack(raw,result));
   if(request.command==='result'&&loseResult){loseResult=false;throw Error('lost result acknowledgement');}
  }
  return results.get(raw);
 };
 const args={binding:b,directory,rpc,deadline:Date.now()+10000,scan:async()=>{
  scans++;if(failScan)throw Error('definite local configuration error');
  return{raw:JSON.stringify({ticketId:ticket.ticketId,uploadId:ticket.uploadId,incarnation:ticket.incarnation,objectVersion:ticket.objectVersion,result:{sha256:ticket.expectedSha256}}),signature:'b'.repeat(64)};
 }};
 assert.equal((await runWorker(args)).state,'interrupted_scan');
 const authorize=async action=>({action,requestId:randomUUID(),...(await workerStatus(directory)),authorizationSha256:'c'.repeat(64),
  processesStoppedConfirmed:true,reason:'Inspected local process evidence and corrected configuration.',resolutionEvidenceSha256:'d'.repeat(64)});
 // Status fields are informational; recovery accepts exact required bindings.
 return{args,calls,directory,ticket,authorize,scans:()=>scans,fix:()=>{failScan=false;},lose:()=>{loseResult=true;}};
}
test('explicit audited resume fixes local error using same lease and no repeated lease POST',async t=>{
 const f=await interruptedFixture(t);f.fix();const recovery=await f.authorize('resume');
 const before=await fs.readdir(f.directory);
 assert.equal((await runWorker({...f.args,recovery,recoveryAuthorizationSha256:'c'.repeat(64)})).state,'complete');
 assert.equal(f.scans(),2);
 assert.deepEqual(f.calls.filter(c=>c.action==='execute').map(c=>JSON.parse(c.raw).command),['lease-next','result']);
 const after=await fs.readdir(f.directory);for(const file of before)assert.ok(after.includes(file));
 const audits=await Promise.all(after.filter(n=>n.startsWith('audit-')).map(n=>privateJson(path.join(f.directory,n),262144)));
 assert.equal(audits.filter(a=>a.event==='operator_resumed_scan').length,1);
 assert.ok(audits.some(a=>a.event==='scan_incomplete'));
 await assert.rejects(runWorker({...f.args,recovery,recoveryAuthorizationSha256:'c'.repeat(64)}),/recovery_invalid/u);
});
test('unknown result remains immutable and recovery cannot retire or resume it',async t=>{
 const f=await interruptedFixture(t);f.fix();f.lose();const recovery=await f.authorize('resume');
 assert.equal((await runWorker({...f.args,recovery,recoveryAuthorizationSha256:'c'.repeat(64)})).state,'unknown');
 const retained=await fs.readFile(path.join(f.directory,'state.json'),'utf8'),before=f.calls.length;
 await assert.rejects(runWorker({...f.args,recovery:{...recovery,action:'retire'},recoveryAuthorizationSha256:'c'.repeat(64)}),/recovery_invalid/u);
 assert.equal(await fs.readFile(path.join(f.directory,'state.json'),'utf8'),retained);assert.equal(f.calls.length,before);
 assert.equal((await runWorker(f.args)).state,'complete');assert.equal(f.calls.at(-1).action,'recover');assert.equal(f.scans(),2);
});
test('stale binding, authority, state approval and active process group prevent resume',async t=>{
 const f=await interruptedFixture(t),recovery=await f.authorize('resume');
 await assert.rejects(runWorker({...f.args,recovery,recoveryAuthorizationSha256:'e'.repeat(64)}),/recovery_invalid/u);
 await assert.rejects(runWorker({...f.args,recovery:{...recovery,expectedStateSha256:'e'.repeat(64)},recoveryAuthorizationSha256:'c'.repeat(64)}),/recovery_invalid/u);
 await assert.rejects(runWorker({...f.args,binding:{...f.args.binding,workerId:randomUUID()},recovery,recoveryAuthorizationSha256:'c'.repeat(64)}),/binding_changed/u);
 const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});
 try {
  const old=await privateJson(path.join(f.directory,'state.json'));
  await journalState(f.directory,old,{...old,attempt:{...old.attempt,processGroupId:child.pid}},'fixture_running_group');
  await assert.rejects(runWorker({...f.args,recovery:await f.authorize('resume'),recoveryAuthorizationSha256:'c'.repeat(64)}),/still_running/u);
 }finally{await new Promise(resolve=>{child.once('exit',resolve);process.kill(-child.pid,'SIGKILL');});}
 assert.equal(f.scans(),1);
});
test('explicit retirement preserves exact lease/audit, performs only read and cannot submit old result',async t=>{
 const f=await interruptedFixture(t),before=f.calls.length,recovery=await f.authorize('retire');
 assert.equal((await runWorker({...f.args,recovery,recoveryAuthorizationSha256:'c'.repeat(64)})).state,'retired_scan');
 assert.deepEqual(f.calls.slice(before).map(c=>c.action),['recover']);assert.equal(f.scans(),1);
 const state=await privateJson(path.join(f.directory,'state.json'));assert.equal(state.response.result.ticket.ticketId,f.ticket.ticketId);
 assert.equal(state.recovery.expectedStateSha256,recovery.expectedStateSha256);
 await assert.rejects(runWorker({...f.args,recovery:{...recovery,action:'resume'},recoveryAuthorizationSha256:'c'.repeat(64)}),/recovery_invalid/u);
});
test('tampered audit head fails before any network or scan',async t=>{
 const f=await interruptedFixture(t),state=await privateJson(path.join(f.directory,'state.json')),before=f.calls.length;
 await fs.writeFile(path.join(f.directory,state.auditEntry.name),'{}');
 await assert.rejects(runWorker(f.args),/audit_changed/u);assert.equal(f.calls.length,before);
});
test('recovered lease must pass fresh server admission before any origin read',async t=>{
 const dir=await privateWork(t),b=binding();let checks=0;
 const result={state:'leased',binding:b,ticket:{protocol:'scpv-worker-ticket-v1',profile:'scpv-mp4-h264-aac-v1',ticketId:randomUUID(),uploadId:'scpv_upload_'+randomUUID(),
 incarnation:randomUUID(),routeId:b.routeId,provider:'s3',objectVersion:'v1',expiresAt:new Date(Date.now()+60000).toISOString()}};
 const outcome=await runWorker({binding:b,directory:dir,deadline:Date.now()+10000,rpc:async(a,r)=>{
  if(a==='check'){checks++;throw Error('current generation retired');}return ack(r,result);
 },scan:async()=>assert.fail('origin must not be read')});
 assert.equal(outcome.state,'held');assert.equal(checks,1);assert.equal((await privateJson(path.join(dir,'state.json'))).phase,'acknowledged');
});
test('held acknowledged lease can be audited and retired after expiry using only original recovery',async t=>{
 const directory=await privateWork(t),b=binding(),calls=[];let clock=Date.now(),original;
 const result={state:'leased',binding:b,ticket:{protocol:'scpv-worker-ticket-v1',profile:'scpv-mp4-h264-aac-v1',ticketId:randomUUID(),uploadId:'scpv_upload_'+randomUUID(),
  incarnation:randomUUID(),routeId:b.routeId,provider:'s3',objectVersion:'v1',expiresAt:new Date(clock+60000).toISOString()}};
 const rpc=async(action,raw)=>{calls.push({action,raw});if(action==='check')throw Error('current admission held');if(action==='execute')original=raw;return ack(raw,result);};
 const args=()=>({binding:b,directory,rpc,deadline:clock+10000,now:()=>clock,scan:async()=>assert.fail('no scan')});
 assert.equal((await runWorker(args())).state,'held');clock+=60001;
 await assert.rejects(runWorker(args()),/ticket_invalid/u);
 const before=calls.length,prior=await fs.readFile(path.join(directory,'state.json'),'utf8');
 const recovery={...(await workerStatus(directory)),action:'retire',requestId:randomUUID(),authorizationSha256:'c'.repeat(64),processesStoppedConfirmed:true,
  reason:'Original acknowledged lease expired while admission was held.',resolutionEvidenceSha256:'d'.repeat(64)};
 assert.equal((await runWorker({...args(),recovery,recoveryAuthorizationSha256:'c'.repeat(64)})).state,'retired_scan');
 assert.deepEqual(calls.slice(before),[{action:'recover',raw:original}]);
 const state=await privateJson(path.join(directory,'state.json'));assert.equal(state.raw,original);assert.equal(state.recovery.expectedStateSha256,hash(prior));
 assert.equal(calls.filter(c=>c.action==='execute').length,1);
});
test('acknowledgement-only crash can retire, but cannot use resume or substitute original receipt',async t=>{
 const directory=await privateWork(t),b=binding();
 const raw=JSON.stringify({protocol:'scpv-operations-request-v1',requestId:randomUUID(),command:'lease',binding:b,uploadId:'scpv_upload_'+randomUUID()});
 const result={state:'leased',binding:b,ticket:{protocol:'scpv-worker-ticket-v1',profile:'scpv-mp4-h264-aac-v1',ticketId:randomUUID(),uploadId:JSON.parse(raw).uploadId,
  incarnation:randomUUID(),routeId:b.routeId,provider:'s3',objectVersion:'v1',expiresAt:new Date(Date.now()-1000).toISOString()}};
 await journalState(directory,null,{binding:b,phase:'acknowledged',raw,response:ack(raw,result)},'fixture_acknowledgement_before_crash');
 const recovery={...(await workerStatus(directory)),action:'retire',requestId:randomUUID(),authorizationSha256:'c'.repeat(64),processesStoppedConfirmed:true,
  reason:'Inspected acknowledged lease after runner exited before scan.',resolutionEvidenceSha256:'d'.repeat(64)};
 const args={binding:b,directory,deadline:Date.now()+10000,recoveryAuthorizationSha256:'c'.repeat(64),scan:async()=>assert.fail('no scan')};
 await assert.rejects(runWorker({...args,recovery:{...recovery,action:'resume'},rpc:async()=>assert.fail('no network')}),/recovery_invalid/u);
 const prior=await fs.readFile(path.join(directory,'state.json'),'utf8');
 await assert.rejects(runWorker({...args,recovery,rpc:async()=>ack(raw,{...result,ticket:{...result.ticket,ticketId:randomUUID()}})}),/recovery_unconfirmed/u);
 assert.equal(await fs.readFile(path.join(directory,'state.json'),'utf8'),prior);
 assert.equal((await runWorker({...args,recovery,rpc:async(action,sent)=>{assert.equal(action,'recover');assert.equal(sent,raw);return ack(raw,result);}})).state,'retired_scan');
});
test('acknowledged result and unknown lease cannot be retired as a scan lease',async t=>{
 for(const [phase,command] of [['acknowledged','result'],['unknown','lease-next']]) {
  const directory=await privateWork(t),b=binding(),raw=JSON.stringify({protocol:'scpv-operations-request-v1',requestId:randomUUID(),command,binding:b});
  await journalState(directory,null,{binding:b,phase,raw,...(phase==='acknowledged'?{response:ack(raw,{accepted:true})}:{})},'fixture_nonlease');
  const recovery={...(await workerStatus(directory)),action:'retire',requestId:randomUUID(),authorizationSha256:'c'.repeat(64),processesStoppedConfirmed:true,
   reason:'This request must not bypass exact mutation recovery.',resolutionEvidenceSha256:'d'.repeat(64)};
  const prior=await fs.readFile(path.join(directory,'state.json'),'utf8');
  await assert.rejects(runWorker({binding:b,directory,deadline:Date.now()+10000,recovery,recoveryAuthorizationSha256:'c'.repeat(64),rpc:async()=>assert.fail('no network'),scan:async()=>assert.fail('no scan')}),/recovery_invalid/u);
  assert.equal(await fs.readFile(path.join(directory,'state.json'),'utf8'),prior);
 }
});
test('acknowledged lease retains previous child-group guard before retirement',async t=>{
 const f=await interruptedFixture(t),child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});
 let recovery;
 try {
  const old=await privateJson(path.join(f.directory,'state.json'));
  await journalState(f.directory,old,{...old,phase:'acknowledged',attempt:{...old.attempt,processGroupId:child.pid}},'fixture_recovered_lease');
  recovery=await f.authorize('retire');
  await assert.rejects(runWorker({...f.args,recovery,recoveryAuthorizationSha256:'c'.repeat(64)}),/still_running/u);
 } finally {await new Promise(resolve=>{child.once('exit',resolve);process.kill(-child.pid,'SIGKILL');});}
 const before=f.calls.length;
 assert.equal((await runWorker({...f.args,recovery,recoveryAuthorizationSha256:'c'.repeat(64)})).state,'retired_scan');
 assert.deepEqual(f.calls.slice(before).map(c=>c.action),['recover']);assert.equal(f.scans(),1);
});
