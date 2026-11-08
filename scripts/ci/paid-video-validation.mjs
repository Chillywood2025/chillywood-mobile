#!/usr/bin/env node
// Local disposable qualification only. No database URL, provider credential or deployment mode.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Buffer} from 'node:buffer';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {collectSourceManifest,validateNodeTap} from './isolated-sandbox-native.mjs';
import {materializePaidVideoBaseline} from './paid-video-baseline.mjs';
import {capturePaidVideoPostgresSources,validatePaidVideoPostgresProof,
 aggregatePaidVideoRetainedHttpProof,wrapPaidVideoRetainedHttpCaptures} from './paid-video-proof-validation.mjs';

const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url))),runtime='isolated-runtime/sandbox-commerce-v1';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const nativeProfiles=JSON.parse(fs.readFileSync(new URL('./fixtures/paid-video-native-profiles.json',import.meta.url),'utf8')).profiles;
export const PAID_VIDEO_NATIVE_STAGES=Object.freeze([
 {name:'authoring',cases:10,file:`${runtime}/tests/paid-video.native.mjs`,scanner:true},
 {name:'gateway',cases:13,file:`${runtime}/tests/paid-video-gateway.native.mjs`,reference:true},
 {name:'capture-composed',cases:31,file:`${runtime}/tests/test-store-v3-capture-composed-managed.native.mjs`,reference:true,profile:'fresh'},
 {name:'capture-retained',cases:19,file:`${runtime}/tests/test-store-v3-retained-capture-managed.native.mjs`,reference:true,profile:'retained'},
 {name:'operations',cases:11,file:'ops/isolated-paid-video-operations-v2/operations.native.mjs',scanner:true},
]);
export const PAID_VIDEO_PORTABLE_STAGES=Object.freeze([
 {name:'provider-recovery-operations',tests:82,files:['tests/creator-money/isolated-paid-video-checkout-v3.test.mjs',
  'tests/creator-money/isolated-paid-video-gateway-boundary.test.mjs','tests/creator-money/isolated-test-store-v3-command.test.mjs',
  `${runtime}/candidates/paid-video-capture-composed/recovery.test.mjs`,'ops/isolated-paid-video-operations-v2/runner.test.mjs']},
 {name:'object-transport',tests:2,files:['ops/isolated-paid-video-worker/private-object.test.mjs']},
 {name:'profile-binding',tests:16,files:[`${runtime}/tests/test-store-v3-profile-binding.test.mjs`]},
 {name:'published-baseline',tests:7,files:['tests/ci/paid-video-baseline.test.mjs']},
 {name:'proof-validation',tests:10,files:['tests/ci/paid-video-proof-validation.test.mjs']},
 {name:'platform-http-app',tests:7,files:['tests/isolated-paid-video-platform-http-bridge.test.mjs']},
]);
export function paidVideoAppFiles(repositoryRoot=root){
 // The historical HTTP48 bridge retains its original fixture contract. The
 // successor explicitly exercises the actual retained HTTP103 bridge separately.
 return fs.readdirSync(path.join(repositoryRoot,'tests')).filter(name=>/^(?:isolated-paid-video|isolated-test-store-v3).*\.test\.mjs$/u.test(name)
  &&!['isolated-paid-video-http-bridge.test.mjs','isolated-paid-video-retained-http-bridge.test.mjs','isolated-paid-video-platform-http-bridge.test.mjs'].includes(name))
  .sort().map(name=>`tests/${name}`);
}
export function paidVideoValidationPlan(){return {nativeStages:PAID_VIDEO_NATIVE_STAGES,nativeCases:84,
 http:{cases:103,actualGatewayEntries:4},app:{tests:270,files:paidVideoAppFiles(),libraryTestsInExistingCanonicalLane:19,
  historicalBridgeExcluded:'tests/isolated-paid-video-http-bridge.test.mjs'},portableStages:PAID_VIDEO_PORTABLE_STAGES,
 execution:'sequential/local-disposable-only',providerOrProductionActions:false};}

export function collectPaidVideoSourceManifest(){
 const paths=new Set(Object.keys(collectSourceManifest()));
 const visit=relative=>{for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){
  if(entry.isDirectory()&&entry.name==='__pycache__')continue;
  assert.ok(!entry.isSymbolicLink(),`Source symlink rejected: ${relative}/${entry.name}`);
  const next=`${relative}/${entry.name}`;
  if(entry.isDirectory())visit(next);else if(entry.isFile())paths.add(next);
 }};
 for(const directory of ['ops/isolated-paid-video-worker','ops/isolated-paid-video-operations-v2','app/sandbox-videos'])visit(directory);
 for(const directory of ['_lib','tests','tests/creator-money','tests/ci','scripts/ci','supabase/functions/_shared']){
  for(const entry of fs.readdirSync(path.join(root,directory),{withFileTypes:true})){
   if(entry.isFile()&&/(?:isolatedPaidVideo|isolatedTestStoreV3|isolated-paid-video|isolated-test-store-v3|paid-video)/u.test(entry.name))paths.add(`${directory}/${entry.name}`);
  }
 }
 paths.add('scripts/ci/fixtures/paid-video-v2-baseline.json');
 paths.add('tests/helpers/isolated-test-store-v3-fixtures.mjs');
 paths.add('scripts/ci/fixtures/paid-video-native-profiles.json');
 visit('scripts/ci/paid-video-prerequisites');
 for(const name of ['isolated-paid-video-authoring-v2','isolated-paid-video-upload-v2','isolated-paid-video-range-v1',
  'isolated-paid-video-checkout-v3','isolated-sandbox-test-store-v3','isolated-test-store-provisioner-v3','isolated-test-store-revenuecat-webhook-v3'])visit(`supabase/functions/${name}`);
 for(const name of ['config/test-store-debug-v3-config.js','config/test-store-debug-v3.json','plugins/withIsolatedTestStoreV3Debug.js'])paths.add(name);
 return Object.fromEntries([...paths].sort().map(name=>{
  assert.ok(fs.lstatSync(path.join(root,name)).isFile());return [name,sha(fs.readFileSync(path.join(root,name)))];
 }));
}

function baselineBytes(reference,name){return fs.readFileSync(path.join(reference,'isolated-runtime/sandbox-commerce-v1',name));}
export function captureLegacyPaidVideoSources(stage,sources,reference){
 const profile=nativeProfiles[stage.name];assert.ok(profile);assert.equal(stage.file,profile.harness);
 const historical=new Set(['core.sql','premium-authority.sql','authority.sql','resource-graphs.sql','permissions-finalize.sql']);
 const expected={harnessPath:stage.file,harnessSha256:sources[stage.file],sourceHashes:{},fixtureHashes:{}};
 assert.match(expected.harnessSha256??'',/^[a-f0-9]{64}$/u);
 const gitRead=name=>{const result=spawnSync('git',['show',`a4396fc787cb3b1656f59559854ab18a9b96c9da:${runtime}/${name}`],{cwd:root,maxBuffer:8*1024*1024});assert.equal(result.status,0);return sha(result.stdout);};
 for(const name of profile.sourceKeys){
  const digest=stage.name==='authoring'&&historical.has(name)?gitRead(name):name.startsWith('frozen/')?sha(baselineBytes(reference,name.slice(7))):sources[name]??sources[`${runtime}/${name}`];
  assert.match(digest??'',/^[a-f0-9]{64}$/u);expected.sourceHashes[name]=digest;
 }
 for(const name of profile.fixtureKeys)expected.fixtureHashes[name]=gitRead(name);
 return expected;
}
export function validateLegacyProof(stage,proof,expected){
 const profile=nativeProfiles[stage.name];assert.ok(profile);assert.equal(stage.file,profile.harness);
 assert.equal(expected.harnessPath,stage.file);assert.match(expected.harnessSha256??'',/^[a-f0-9]{64}$/u);
 assert.deepEqual(Object.keys(expected.sourceHashes).sort(),profile.sourceKeys);assert.deepEqual(Object.keys(expected.fixtureHashes).sort(),profile.fixtureKeys);
 for(const digest of [...Object.values(expected.sourceHashes),...Object.values(expected.fixtureHashes)])assert.match(digest,/^[a-f0-9]{64}$/u);
 assert.deepEqual(proof.sourceHashes,expected.sourceHashes,`${stage.name}: complete executed source identity`);
 assert.deepEqual(proof.fixtureHashes??{},expected.fixtureHashes,`${stage.name}: complete fixture identity`);
 assert.deepEqual(proof.cases,profile.cases);assert.equal(proof.cases.length,stage.cases);
 assert.deepEqual(Object.keys(proof.cleanup??{}).sort(),profile.cleanupKeys);assert.ok(Object.values(proof.cleanup).every(v=>v===true));
 if(stage.name==='operations'){assert.equal(proof.protocol,'scpv-operations-native-proof-v2');assert.equal(proof.passed,stage.cases);assert.deepEqual(proof.boundaries,profile.boundaries);}
 else assert.equal(proof.status,'passed');
 if(stage.name==='authoring'){
  assert.match(proof.engine,/PostgreSQL\) 17\.6/u);assert.equal(proof.baseline,'a4396fc787cb3b1656f59559854ab18a9b96c9da');
  assert.ok(proof.contractCaptures.length>=19);assert.equal(proof.providerAuthenticationProven,false);
  assert.equal(proof.immutableObjectStoreProven,false);assert.equal(proof.deploymentReady,false);
  assert.equal(proof.actualCleanScan.protocol,'scpv-byte-scan-v1');assert.equal(proof.actualCleanScan.verdict,'clean');assert.equal(proof.actualCleanScan.moderation,'unreviewed');
  assert.equal(proof.actualCleanScan.definitions.protocol,'scpv-definition-manifest-v1');
  assert.deepEqual(proof.actualCleanScan.definitions.files.map(v=>v.filename),['bytecode.cvd','daily.cvd','main.cvd']);
  assert.equal(proof.actualCleanScan.definitions.manifestSha256,sha(JSON.stringify(proof.actualCleanScan.definitions.files)));
 }
 if(stage.name==='gateway'){assert.equal(proof.protocol,'scpv-gateway-native-proof-v2');assert.equal(proof.captures.length,32);assert.deepEqual(proof.limitations,profile.limitations);}
}

export function extractPaidVideoFixtures(proofs,output){
 const combined=proofs['capture-composed'].combinedCaptures;
 const rows=kind=>combined.filter(v=>v.kind===kind).map(({kind:ignored,...row})=>row);
 const checkout=rows('checkout'),commands=rows('provider-command'),closure=rows('prepared-closure'),playback=rows('playback');
 assert.equal(checkout.length,42);assert.equal(commands.length,31);assert.equal(closure.length,8);assert.equal(playback.length,15);
 const fixtures={authoring:proofs.authoring,gateway:proofs.gateway,checkout,closure,playback,
  provider:{protocol:'isolated-test-store-v3',cases:commands.map(({input,result})=>({...input.request,actor:input.actor,response:result}))}};
 const files={};for(const [name,value] of Object.entries(fixtures)){const file=path.join(output,`fresh-${name}-captures.json`);fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});files[name]=file;}
 return files;
}
export function readPaidVideoHttpSummary({stdout,evidenceDirectory,runId}){
 const file=path.join(evidenceDirectory,'summary.json');
 assert.ok(fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink(),'Regular actual summary required');
 const summary=JSON.parse(fs.readFileSync(file,'utf8'));
 // The actual harness emits progress before its final compact JSON line.
 const last=stdout.trimEnd().split('\n').at(-1);
 assert.deepEqual(JSON.parse(last),summary,'Terminal summary must match the caller-owned evidence file');
 assert.equal(summary.evidenceDirectory,evidenceDirectory);assert.equal(summary.runId,runId);
 assert.equal(summary.status,'passed');assert.equal(summary.cleanupVerified,true);assert.equal(summary.error,null);
 return summary;
}
function main(args){
 if(args.length===1&&args[0]==='--plan'){console.log(JSON.stringify(paidVideoValidationPlan(),null,2));return;}
 assert.equal(args.length,10,'Use --local-bin ABS --output-dir NEW_ABS --database ABS --certificates ABS --deno ABS');
 const names=['--local-bin','--output-dir','--database','--certificates','--deno'];names.forEach((name,i)=>assert.equal(args[i*2],name));
 const [bin,output,database,certificates,deno]=names.map((_,i)=>args[i*2+1]);
 for(const item of [bin,output,database,certificates,deno])assert.ok(path.isAbsolute(item));
 assert.ok(!fs.existsSync(output),'A fresh evidence directory is required');fs.mkdirSync(output,{mode:0o700});
 const reference=path.join(output,'published-v2-reference');materializePaidVideoBaseline({repositoryRoot:root,destination:reference});
 const sources=collectPaidVideoSourceManifest(),startedAt=Date.now();
 const env=Object.fromEntries(['PATH','HOME','TMPDIR','TMP','TEMP','DENO_DIR','DOCKER_HOST','DOCKER_CONTEXT','SSL_CERT_FILE','SSL_CERT_DIR']
  .filter(name=>process.env[name]!==undefined).map(name=>[name,process.env[name]]));
 Object.assign(env,{CI:'1',EXPO_NO_DOTENV:'1',EXPO_NO_CLIENT_ENV_VARS:'1',PYTHONDONTWRITEBYTECODE:'1'});
 const report={protocol:'paid-video-canonical-validation-v1',status:'running',startedAt:new Date(startedAt).toISOString(),
  plan:paidVideoValidationPlan(),sourceHashes:sources,stages:[],providerOrProductionActions:false};
 const save=()=>fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 const execute=(name,command,commandArgs)=>{
  const result=spawnSync(command,commandArgs,{cwd:root,env,encoding:'utf8',maxBuffer:32*1024*1024});
  fs.writeFileSync(path.join(output,name+'.stdout'),result.stdout??'',{mode:0o600});fs.writeFileSync(path.join(output,name+'.stderr'),result.stderr??'',{mode:0o600});
  assert.equal(result.status,0,`${name} failed; inspect private saved diagnostics`);
  assert.deepEqual(collectPaidVideoSourceManifest(),sources,'Source changed during qualification');return result.stdout;
 };
 save();
 try{
  const proofs={};
  for(const stage of PAID_VIDEO_NATIVE_STAGES){
   const expected=stage.profile?capturePaidVideoPostgresSources({repositoryRoot:root,baselineDirectory:reference,profile:stage.profile}):captureLegacyPaidVideoSources(stage,sources,reference);
   const commandArgs=[stage.file,'--local-bin',bin,...(stage.reference?['--v2-reference',reference]:[]),...(stage.scanner?['--database',database,'--certificates',certificates]:[])];
   const proof=JSON.parse(execute(stage.name,process.execPath,commandArgs));
   if(stage.profile){
    validatePaidVideoPostgresProof(proof,{profile:stage.profile,expected});
    assert.deepEqual(capturePaidVideoPostgresSources({repositoryRoot:root,baselineDirectory:reference,profile:stage.profile}),expected,'Executed profile source changed');
   }else{validateLegacyProof(stage,proof,expected);assert.deepEqual(captureLegacyPaidVideoSources(stage,sources,reference),expected,'Executed native source changed');}
   proofs[stage.name]=proof;fs.writeFileSync(path.join(output,stage.name+'.json'),JSON.stringify(proof,null,2)+'\n',{mode:0o600});
   report.stages.push({name:stage.name,cases:stage.cases,passed:true,cleanup:proof.cleanup});save();console.log(`${stage.name}: ${stage.cases} actual native groups passed; cleanup verified`);
  }
  const fixtures=extractPaidVideoFixtures(proofs,output);
  Object.assign(env,{ISOLATED_PAID_VIDEO_FIXTURE:fixtures.authoring,ISOLATED_PAID_VIDEO_CAPTURES:fixtures.authoring,
   ISOLATED_PAID_VIDEO_V2_FIXTURE:fixtures.gateway,ISOLATED_PAID_VIDEO_V2_CAPTURES:fixtures.gateway,ISOLATED_PAID_VIDEO_GATEWAY_CAPTURES:fixtures.gateway,
   ISOLATED_PAID_VIDEO_CHECKOUT_V3_FIXTURE:fixtures.checkout,ISOLATED_TEST_STORE_V3_FIXTURE:fixtures.provider,
   ISOLATED_PAID_VIDEO_PREPARED_CLOSURE_CAPTURES:fixtures.closure,ISOLATED_PAID_VIDEO_CURRENT_GRANT_CAPTURES:fixtures.playback});
  const httpDirectory=path.join(output,'retained-http-private');
  // The preparer requires runtime credentials and state to remain outside checkout.
  assert.ok(!httpDirectory.startsWith(root+path.sep),'Evidence root must be outside checkout for HTTP qualification');
  const template=`${runtime}/tests/local-auth-paid-video-retained-platform-v2`;
  execute('http-prepare','python3',[`${template}/prepare.py`,'--repo',root,'--output',httpDirectory,'--deno',deno]);
  const executionInputs=JSON.parse(fs.readFileSync(path.join(httpDirectory,'execution-inputs.json'),'utf8'));
  const expectedRunId=randomBytes(16).toString('hex');
  const expectedEvidenceDirectory=path.join(fs.realpathSync(output),`chillywood-local-auth-${expectedRunId}`);
  assert.ok(!fs.existsSync(expectedEvidenceDirectory),'A new caller-owned HTTP attempt is required');
  const attemptStartedAtMs=Date.now();
  const stdout=execute('http-run','python3',[path.join(httpDirectory,'harness/run.py'),'--evidence-root',expectedEvidenceDirectory,'--run-id',expectedRunId]);
  const summary=readPaidVideoHttpSummary({stdout,evidenceDirectory:expectedEvidenceDirectory,runId:expectedRunId});
  const aggregate=aggregatePaidVideoRetainedHttpProof({summary,evidenceDirectory:expectedEvidenceDirectory,expectedEvidenceDirectory,expectedRunId,executionInputs,
   templateManifestSha256:sources[`${template}/source-manifest.json`],attemptStartedAtMs});
  const aggregateBytes=Buffer.from(JSON.stringify(aggregate,null,2)+'\n');
  const proofFile=path.join(output,'retained-http-proof.json');fs.writeFileSync(proofFile,aggregateBytes,{mode:0o600});
  const httpCaptureBytes=fs.readFileSync(path.join(summary.evidenceDirectory,'http-qualification-proof.json'));
  const captured=wrapPaidVideoRetainedHttpCaptures({aggregateBytes,httpCaptureBytes,expectedEvidenceDirectory,expectedRunId});
  const captureFile=path.join(output,'retained-http-captures.json');fs.writeFileSync(captureFile,JSON.stringify(captured,null,2)+'\n',{mode:0o600});
  Object.assign(env,{ISOLATED_PAID_VIDEO_PLATFORM_HTTP_CAPTURES:captureFile,ISOLATED_PAID_VIDEO_PLATFORM_HTTP_PROOF:proofFile,
   ISOLATED_PAID_VIDEO_PLATFORM_HTTP_RUN_ID:expectedRunId,ISOLATED_PAID_VIDEO_PLATFORM_HTTP_EVIDENCE_DIRECTORY:expectedEvidenceDirectory});
  report.http={cases:103,actualGatewayEntries:4,proofSha256:sha(aggregateBytes),cleanupVerified:true};save();
  const fixtureHashes=Object.fromEntries([...Object.values(fixtures),proofFile,captureFile].map(file=>[file,sha(fs.readFileSync(file))]));
  const stages=[{name:'app-successor',tests:270,files:paidVideoAppFiles()},...PAID_VIDEO_PORTABLE_STAGES];report.nodeStages=[];
  for(const stage of stages){
   const tap=execute('node-'+stage.name,process.execPath,['--test','--test-reporter=tap',...stage.files]);
   const result=validateNodeTap(tap,stage.tests);report.nodeStages.push({name:stage.name,...result});
   for(const [file,digest] of Object.entries(fixtureHashes))assert.equal(sha(fs.readFileSync(file)),digest,'Same-attempt fixture changed');
   save();console.log(`${stage.name}: ${result.pass} tests passed; zero skipped`);
  }
  report.status='passed';
 }catch(error){report.status='failed';report.error=String(error.message);throw error;}
 finally{report.finishedAt=new Date().toISOString();save();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2));
