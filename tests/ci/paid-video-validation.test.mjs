import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {PAID_VIDEO_NATIVE_STAGES,PAID_VIDEO_PORTABLE_STAGES,PAID_VIDEO_APP_TEST_COUNT,paidVideoAppFiles,paidVideoValidationPlan,extractPaidVideoFixtures,validateLegacyProof,readPaidVideoHttpSummary,httpFailureDiagnostics,collectPaidVideoSourceManifest,nodeFailureDiagnostics}
 from '../../scripts/ci/paid-video-validation.mjs';

test('failed Node stage diagnostics retain only bounded source locations and machine metadata',()=>{
 const root=process.cwd(),privateValue='private-capture-value-must-not-be-emitted';
 const tap=`not ok 31 - ${privateValue}\n  ---\n  location: '${root}/tests/example.test.mjs:150:2'\n  failureType: 'testCodeFailure'\n  error: '${privateValue}'\n  code: 'ERR_TEST_FAILURE'\n  signal: 'SIGKILL'\n  ...\nnot ok 32 - hidden\n  location: '${root}/../outside.test.mjs:1:1'\n  failureType: '${privateValue}'\n  code: '${privateValue}'\n  ...\n# tests 270\n# pass 269\n# fail 1\n`;
 const result=nodeFailureDiagnostics(tap,root);
 assert.deepEqual(result,{counts:{tests:270,pass:269,fail:1},failures:[{ordinal:31,location:'tests/example.test.mjs:150:2',failureType:'testCodeFailure',code:'ERR_TEST_FAILURE',signal:'SIGKILL'},{ordinal:32}]});
 assert.ok(!JSON.stringify(result).includes(privateValue));
 assert.equal(nodeFailureDiagnostics(Array.from({length:150},(_,i)=>`not ok ${i+1} - ignored`).join('\n')).failures.length,100);
 assert.deepEqual(nodeFailureDiagnostics('not ok 1 - ignored\n  code: ERR_PRIVATE_CAPTURE_VALUE',root,'SIGKILL'),{counts:{},failures:[{ordinal:1}],signal:'SIGKILL'});
 assert.deepEqual(nodeFailureDiagnostics('',root,privateValue),{counts:{},failures:[]});
 assert.deepEqual(nodeFailureDiagnostics(`not ok 1 - ignored\n    TestContext.<anonymous> (file://${root}/tests/example.test.mjs:151:3)\n    TestContext.<anonymous> (file://${root}/../outside.test.mjs:1:2)`,root),
  {counts:{},failures:[{ordinal:1,sourceFrames:['tests/example.test.mjs:151:3']}]});
});

test('PaidVideo plan requires five actual native profiles and the distinct retained HTTP successor',()=>{
 const plan=paidVideoValidationPlan();
 assert.equal(plan.nativeCases,84);assert.equal(plan.nativeStages.reduce((n,s)=>n+s.cases,0),84);
 assert.deepEqual(plan.nativeStages.map(s=>[s.name,s.cases]),[['authoring',10],['gateway',13],['capture-composed',31],['capture-retained',19],['operations',11]]);
 assert.deepEqual(plan.http,{cases:103,actualGatewayEntries:4});assert.equal(plan.providerOrProductionActions,false);
 assert.equal(plan.execution,'sequential/local-disposable-only');
 assert.equal(PAID_VIDEO_NATIVE_STAGES.filter(s=>s.scanner).length,2);assert.equal(PAID_VIDEO_NATIVE_STAGES.filter(s=>s.reference).length,3);
 for(const name of ['tests/helpers/isolated-test-store-v3-fixtures.mjs','tests/helpers/media-picker-host.mjs','tests/isolated-paid-video-object-version-corpus.mjs','hooks/useMediaPicker.tsx','components/ui/MediaSourceSheet.tsx','_lib/deviceAttachmentPicker.ts','modules/chillywood-gallery-picker/index.js','_lib/paidVideoAuthoringProfile.ts','tests/native-paid-video-authoring-profile.test.mjs'])assert.match(collectPaidVideoSourceManifest()[name],/^[a-f0-9]{64}$/u);
});
test('successor app coverage explicitly replaces only historical HTTP48 with the real HTTP103 bridge',()=>{
 const plan=paidVideoValidationPlan(),files=paidVideoAppFiles();
 assert.ok(files.includes('tests/isolated-paid-video-checkout-v3.test.mjs'));assert.ok(files.includes('tests/isolated-test-store-v3-native.test.mjs'));
 assert.ok(!files.includes('tests/isolated-paid-video-http-bridge.test.mjs'));assert.ok(!files.includes('tests/isolated-paid-video-retained-http-bridge.test.mjs'));
 assert.ok(!files.includes('tests/isolated-paid-video-platform-http-bridge.test.mjs'));
 assert.equal(PAID_VIDEO_APP_TEST_COUNT,279);assert.equal(plan.app.tests,PAID_VIDEO_APP_TEST_COUNT);assert.equal(plan.app.libraryTestsInExistingCanonicalLane,19);
 assert.equal(PAID_VIDEO_PORTABLE_STAGES.find(s=>s.name==='platform-http-app').tests,7);
 assert.equal(PAID_VIDEO_APP_TEST_COUNT+19+7,305);assert.equal(plan.app.historicalBridgeExcluded,'tests/isolated-paid-video-http-bridge.test.mjs');
 const all=PAID_VIDEO_PORTABLE_STAGES.flatMap(s=>s.files);assert.equal(new Set(all).size,all.length);
 assert.equal(PAID_VIDEO_PORTABLE_STAGES.reduce((n,s)=>n+s.tests,0)+PAID_VIDEO_APP_TEST_COUNT,403);
});
const fixtures=()=>({authoring:{contractCaptures:[]},gateway:{captures:[]},'capture-composed':{combinedCaptures:
 [['checkout',42],['provider-command',31],['prepared-closure',8],['playback',15]].flatMap(([kind,count])=>Array.from({length:count},(_,index)=>({kind,
  input:{actor:{userId:`synthetic-${index}`},request:{command:'read',requestId:`synthetic-request-${index}`,payload:{index}}},
  result:{grantsAccess:false,notPayable:true,status:'synthetic-validator-only',index}})))}});
test('same-attempt capture extraction preserves every input/result and makes no new economic claim',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'paid-video-capture-validator-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const proof=fixtures(),before=JSON.stringify(proof),files=extractPaidVideoFixtures(proof,dir);
 assert.equal(JSON.stringify(proof),before);
 for(const [kind,name] of [['checkout','checkout'],['prepared-closure','closure'],['playback','playback']]){
  assert.deepEqual(JSON.parse(fs.readFileSync(files[name],'utf8')),proof['capture-composed'].combinedCaptures.filter(v=>v.kind===kind).map(({kind,...entry})=>entry));
 }
 const provider=JSON.parse(fs.readFileSync(files.provider,'utf8'));assert.equal(provider.protocol,'isolated-test-store-v3');assert.equal(provider.cases.length,31);
 for(const [index,entry] of provider.cases.entries()){
  const raw=proof['capture-composed'].combinedCaptures.filter(v=>v.kind==='provider-command')[index];
  assert.deepEqual(entry,{...raw.input.request,actor:raw.input.actor,response:raw.result});
 }
});
test('capture extraction rejects missing or duplicated required source groups before writing fixtures',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'paid-video-capture-mutants-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const kind of ['checkout','provider-command','prepared-closure','playback'])for(const direction of [-1,1]){
  const proof=fixtures(),rows=proof['capture-composed'].combinedCaptures,index=rows.findIndex(row=>row.kind===kind);
  if(direction<0)rows.splice(index,1);else rows.push(structuredClone(rows[index]));
  assert.throws(()=>extractPaidVideoFixtures(proof,dir));assert.deepEqual(fs.readdirSync(dir),[]);
 }
});
test('CLI permits a read-only plan and refuses execution switches or remote connection inputs',()=>{
 const source='scripts/ci/paid-video-validation.mjs';
 const plan=spawnSync(process.execPath,[source,'--plan'],{encoding:'utf8'});assert.equal(plan.status,0);assert.equal(JSON.parse(plan.stdout).nativeCases,84);
 for(const args of [['--database-url','postgres://forbidden.invalid/db'],['--plan','--run'],['--production'],['--skip-http']]){
  const result=spawnSync(process.execPath,[source,...args],{encoding:'utf8'});assert.notEqual(result.status,0);
 }
});
test('legacy operations proof requires every reviewed case, source, cleanup field and stated boundary',()=>{
 const shape=JSON.parse(fs.readFileSync(new URL('../../scripts/ci/fixtures/paid-video-native-profiles.json',import.meta.url),'utf8')).profiles.operations;
 const stage=PAID_VIDEO_NATIVE_STAGES.find(v=>v.name==='operations'),expected={harnessPath:stage.file,harnessSha256:'a'.repeat(64),
  sourceHashes:Object.fromEntries(shape.sourceKeys.map(k=>[k,'b'.repeat(64)])),fixtureHashes:{}};
 // Validator-only records; these do not execute a scanner or a database.
 const proof={protocol:'scpv-operations-native-proof-v2',passed:11,cases:shape.cases,sourceHashes:expected.sourceHashes,
  cleanup:Object.fromEntries(shape.cleanupKeys.map(k=>[k,true])),boundaries:shape.boundaries};
 assert.equal(validateLegacyProof(stage,proof,expected),undefined);
 for(const mutate of [v=>{v.sourceHashes={['ops/isolated-paid-video-operations-v2/operations.sql']:'b'.repeat(64)};},
  v=>{delete v.cleanup.sessionsClosed;},v=>{v.cleanup.sessionsClosed=false;},v=>{v.cases=v.cases.map((_,i)=>`arbitrary-${i}`);},
  v=>{v.boundaries.scanner='synthetic';},v=>{delete v.sourceHashes[stage.file];},v=>{v.sourceHashes[stage.file]='f'.repeat(64);}]){
  const candidate=structuredClone(proof);mutate(candidate);assert.throws(()=>validateLegacyProof(stage,candidate,expected));
 }
 for(const name of shape.sourceKeys){const candidate=structuredClone(proof);delete candidate.sourceHashes[name];assert.throws(()=>validateLegacyProof(stage,candidate,expected));}
});
test('actual HTTP progress is accepted only with the exact caller-owned final summary',t=>{
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'paid-video-summary-')));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const runId='ab'.repeat(16),summary={status:'passed',evidenceDirectory:dir,runId,cleanupVerified:true,error:null};
 fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(summary));
 const stdout='Local gateway evidence directory: '+dir+'\n103 actual HTTP gateway cases passed\n'+JSON.stringify(summary)+'\n';
 assert.deepEqual(readPaidVideoHttpSummary({stdout,evidenceDirectory:dir,runId}),summary);
 for(const change of [{runId:'cd'.repeat(16)},{evidenceDirectory:path.dirname(dir)},{cleanupVerified:false},{status:'failed'}]){
  const changed={...summary,...change};fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(changed));
  assert.throws(()=>readPaidVideoHttpSummary({stdout,evidenceDirectory:dir,runId}));
  assert.throws(()=>readPaidVideoHttpSummary({stdout:JSON.stringify(changed),evidenceDirectory:dir,runId}));
 }
 fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(summary));
 for(const bad of ['',stdout+'later progress\n',JSON.stringify({...summary,runId:'cd'.repeat(16)})])
  assert.throws(()=>readPaidVideoHttpSummary({stdout:bad,evidenceDirectory:dir,runId}));
});

function failedHttpAttempt(t){
 const evidenceDirectory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'paid-video-failure-')));
 t.after(()=>fs.rmSync(evidenceDirectory,{recursive:true,force:true}));
 const runId='ab'.repeat(16),privateValue='private-token-payload-must-not-be-emitted';
 const diagnostic={protocol:'scpv-retained-http-failure-v1',phase:'qualify',exceptionType:'AssertionError',httpCasesRecorded:2,lastHttpStatus:503};
 const summary={status:'failed',evidenceDirectory,runId,cleanupVerified:true,error:privateValue,failureDiagnostic:diagnostic};
 const file=path.join(evidenceDirectory,'summary.json');
 const write=(value=summary)=>{fs.writeFileSync(file,JSON.stringify(value));return {stdout:privateValue+'\n'+JSON.stringify(value)+'\n',evidenceDirectory,runId};};
 return {evidenceDirectory,runId,privateValue,diagnostic,summary,file,write};
}
test('failed HTTP attempt emits only closed diagnostic fields and preserves failed cleanup',t=>{
 const f=failedHttpAttempt(t),result=httpFailureDiagnostics(f.write());
 assert.deepEqual(result,{available:true,cleanupVerified:true,...f.diagnostic});
 assert.ok(!JSON.stringify(result).includes(f.privateValue));assert.ok(!JSON.stringify(result).includes(f.evidenceDirectory));
 const cleanup={...f.summary,cleanupVerified:false,failureDiagnostic:{...f.diagnostic,phase:'cleanup',exceptionType:'RuntimeError',httpCasesRecorded:103,lastHttpStatus:null}};
 assert.deepEqual(httpFailureDiagnostics(f.write(cleanup)),{available:true,cleanupVerified:false,...cleanup.failureDiagnostic});
 assert.throws(()=>readPaidVideoHttpSummary(f.write()),'Failure diagnostics must not qualify a passing attempt');
});
test('failed HTTP diagnostic rejects wrong attempt identity, stale stdout and a successful summary',t=>{
 const f=failedHttpAttempt(t);
 for(const change of [{runId:'cd'.repeat(16)},{evidenceDirectory:path.dirname(f.evidenceDirectory)},{status:'passed'},{cleanupVerified:'true'}]){
  assert.deepEqual(httpFailureDiagnostics(f.write({...f.summary,...change})),{available:false});
 }
 const args=f.write();
 for(const stdout of ['',args.stdout+'later progress',JSON.stringify({...f.summary,error:'different'})])
  assert.deepEqual(httpFailureDiagnostics({...args,stdout}),{available:false});
 assert.deepEqual(httpFailureDiagnostics({...args,runId:'not-an-attempt'}),{available:false});
});
test('failed HTTP diagnostic rejects untrusted fields, enum strings and out-of-range counters',t=>{
 const f=failedHttpAttempt(t);
 for(const change of [{protocol:'unknown'},{phase:f.privateValue},{exceptionType:f.privateValue},{httpCasesRecorded:-1},{httpCasesRecorded:104},
  {httpCasesRecorded:1.5},{httpCasesRecorded:'2'},{lastHttpStatus:99},{lastHttpStatus:600},{lastHttpStatus:200.5},{lastHttpStatus:'503'},{error:f.privateValue}]){
  assert.deepEqual(httpFailureDiagnostics(f.write({...f.summary,failureDiagnostic:{...f.diagnostic,...change}})),{available:false});
 }
 for(const key of Object.keys(f.diagnostic)){const diagnostic={...f.diagnostic};delete diagnostic[key];
  assert.deepEqual(httpFailureDiagnostics(f.write({...f.summary,failureDiagnostic:diagnostic})),{available:false});
 }
 assert.deepEqual(httpFailureDiagnostics(f.write({...f.summary,failureDiagnostic:null})),{available:false});
});
test('failed HTTP diagnostic refuses absent, malformed, oversized and symlink evidence',t=>{
 const f=failedHttpAttempt(t),args=f.write();
 fs.unlinkSync(f.file);assert.deepEqual(httpFailureDiagnostics(args),{available:false});
 fs.writeFileSync(f.file,'not json '+f.privateValue);assert.deepEqual(httpFailureDiagnostics(args),{available:false});
 const large={...f.summary,error:f.privateValue.repeat(3000)};assert.deepEqual(httpFailureDiagnostics(f.write(large)),{available:false});
 const target=path.join(f.evidenceDirectory,'private.json');fs.writeFileSync(target,JSON.stringify(f.summary));
 fs.unlinkSync(f.file);fs.symlinkSync(target,f.file);assert.deepEqual(httpFailureDiagnostics(args),{available:false});
 fs.unlinkSync(f.file);f.write();
 const link=f.evidenceDirectory+'-link';fs.symlinkSync(f.evidenceDirectory,link);t.after(()=>fs.unlinkSync(link));
 assert.deepEqual(httpFailureDiagnostics({...args,evidenceDirectory:link}),{available:false});
});
