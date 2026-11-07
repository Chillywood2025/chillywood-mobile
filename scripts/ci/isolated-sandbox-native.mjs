#!/usr/bin/env node
// Local-only orchestration. Harnesses create and remove their own disposable
// clusters; this runner accepts a binary directory, never a database URL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../../',import.meta.url));
const modulePath='isolated-runtime/sandbox-commerce-v1';
export const POSTGRES=Object.freeze({version:'17.6',
 archiveUrl:'https://ftp.postgresql.org/pub/source/v17.6/postgresql-17.6.tar.gz',
 sha256:'e0630a3600aea27511715563259ec2111cd5f4353a4b040e0be827f94cd7a8b0'});
const ordinaryCleanup=['clusterStopped','clusterNotRunningVerified','directoryRemoved'];
const allSql=['core.sql','premium-authority.sql','authority.sql','commands.sql','receipts.sql','permissions-finalize.sql'];
const stageSources={
 'premium-authority':['premium-authority.sql'],authority:['authority.sql','premium-authority.sql'],
 core:allSql.filter(file=>file!=='receipts.sql'),declarations:allSql,receipts:allSql,
 'managed-install':allSql,availability:['core.sql'],
};
export const NATIVE_STAGES=Object.freeze([
 ['premium-authority',46,['stopped','notRunningVerified','directoryRemoved']],
 ['authority',20,[...ordinaryCleanup,'sessionsClosed']],
 ['core',11,[...ordinaryCleanup,'sessionsClosed']],
 ['declarations',12,[...ordinaryCleanup,'sessionsClosed']],
 ['receipts',26,[...ordinaryCleanup,'sessionsClosed']],
 ['managed-install',8,ordinaryCleanup],
 ['availability',21,ordinaryCleanup],
].map(([name,caseCount,cleanupKeys])=>Object.freeze({name,caseCount,cleanupKeys,sourceFiles:stageSources[name],file:`${modulePath}/tests/${name}.native.mjs`})));
export const NODE_TEST_FILES=Object.freeze([
 'tests/isolated-sandbox-commerce-client.test.mjs',
 'tests/isolated-sandbox-delivery-policy.test.mjs',
 'tests/creator-money/isolated-sandbox-provider.test.mjs',
]);
export const createPlan=()=>({postgres:POSTGRES,nativeStages:NATIVE_STAGES,nodeTests:NODE_TEST_FILES,
 expectedNodeTests:52,execution:'sequential/local-only',
 fixture:'Fresh actual core SQL responses, generated in this attempt before client tests',
 limitations:['Synthetic source fixtures only; no production schema, hosted owner/Auth/RLS or device qualification.',
  'Provider classifier and delivery policy tests do not authenticate provider observations or issue real access.']});

export function validateNativeProof(stage,proof,sourceHashes){
 assert.equal(proof.status,'passed',`${stage.name}: status`);
 assert.equal(proof.caseCount,stage.caseCount,`${stage.name}: native case count changed`);
 assert.ok(Array.isArray(proof.cases),`${stage.name}: native cases must be an array`);
 assert.equal(proof.cases?.length,stage.caseCount,`${stage.name}: incomplete case list`);
 assert.match(proof.engine??proof.version??'',/^postgres \(PostgreSQL\) 17\.6$/u);
 for(const key of stage.cleanupKeys)assert.equal(proof.cleanup?.[key],true,`${stage.name}: cleanup ${key}`);
 assert.ok(Object.values(proof.cleanup).every(value=>value===true),`${stage.name}: cleanup failure`);
 if(stage.name==='premium-authority'){
  assert.equal(proof.sourceSha256,sourceHashes[`${modulePath}/premium-authority.sql`]);
  assert.equal(proof.fixtureSha256,sourceHashes[`${modulePath}/tests/premium-authority.fixture.sql`]);
  assert.equal(proof.harnessSha256,sourceHashes[stage.file]);
 }else{
  assert.deepEqual(Object.keys(proof.sourceHashes??{}).sort(),[...stage.sourceFiles].sort(),`${stage.name}: incomplete source identity`);
  for(const [file,value]of Object.entries(proof.sourceHashes)){
   assert.equal(value,sourceHashes[`${modulePath}/${file}`],`${stage.name}: source ${file}`);
  }
 }
}
export function validateNodeTap(tap){
 const values={};
 for(const key of ['tests','pass','fail','cancelled','skipped','todo']){
  const matches=[...tap.matchAll(new RegExp(`^# ${key} (\\d+)$`,'gm'))];
  assert.equal(matches.length,1,`Missing or ambiguous TAP ${key} summary`);
  values[key]=Number(matches[0][1]);
 }
 assert.equal(values.tests,52);assert.equal(values.pass,52);
 for(const key of ['fail','cancelled','skipped','todo'])assert.equal(values[key],0,`Node ${key} must be zero`);
 return values;
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function manifest(){
 const files=[...NODE_TEST_FILES,'_lib/isolatedSandboxCommerce.ts','_lib/accountBoundSupabaseRpc.mjs',
  '_lib/accountSessionAuthority.ts','_lib/accountBoundSupabaseMutation.ts','package.json','package-lock.json',
  'supabase/functions/_shared/isolated-sandbox-provider.ts','supabase/functions/_shared/isolated-sandbox-delivery-policy.ts',
  'supabase/migrations/20260730170000_revenuecat_transfer_authoritative_ordering.sql',
  'supabase/migrations/20260908231500_pre_activation_premium_repurchase_quarantine_closure.sql',
  'supabase/migrations/20260909015439_pre_activation_premium_fresh_generation_lifecycle.sql',
  'scripts/ci/isolated-sandbox-native.mjs','.github/workflows/required-validation.yml'];
 const visit=relative=>{for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){
  const next=`${relative}/${entry.name}`;assert.ok(!entry.isSymbolicLink(),`Source symlink rejected: ${next}`);
  if(entry.isDirectory())visit(next);else if(entry.isFile())files.push(next);
 }};
 visit(modulePath);
 return Object.fromEntries([...new Set(files)].sort().map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]));
}
function main(argv){
 if(argv.length===1&&argv[0]==='--plan'){console.log(JSON.stringify(createPlan(),null,2));return;}
 assert.equal(argv.length,4,'Use --local-bin /absolute/path --output-dir /absolute/new-directory');
 assert.equal(argv[0],'--local-bin');assert.equal(argv[2],'--output-dir');
 const bin=argv[1],output=argv[3];assert.ok(path.isAbsolute(bin));assert.ok(path.isAbsolute(output));
 assert.ok(path.relative(root,output)&&!path.relative(root,output).startsWith('..')&&!path.isAbsolute(path.relative(root,output)),
  'Evidence must be in a new directory within this checkout');
 fs.mkdirSync(output); // Refuse stale evidence or a reused attempt directory.
 const env=Object.fromEntries(['PATH','HOME','TMPDIR','TMP','TEMP','SYSTEMROOT','LANG','LC_ALL']
  .filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
 Object.assign(env,{CI:'1',EXPO_NO_DOTENV:'1',EXPO_NO_CLIENT_ENV_VARS:'1',
  ISOLATED_SANDBOX_COMMAND_FIXTURE:path.join(output,'native-command-responses.json')});
 const sources=manifest();
 const report={status:'running',startedAt:new Date().toISOString(),plan:createPlan(),sourceHashes:sources,stages:[],
  runtime:{node:process.version,platform:process.platform,architecture:process.arch},
  checkoutCommit:spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout?.trim()??null};
 const save=()=>fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(report,null,2)+'\n');
 const execute=(name,args)=>{
  // Harnesses own shutdown and removal. Do not kill their process on an outer
  // per-stage timeout and then claim cleanup; the hosted job has a 25m limit.
  const result=spawnSync(process.execPath,args,{cwd:root,env,encoding:'utf8',maxBuffer:16*1024*1024});
  fs.writeFileSync(path.join(output,name+'.stdout'),result.stdout??'');
  fs.writeFileSync(path.join(output,name+'.stderr'),result.stderr??'');
  assert.equal(result.status,0,`${name}: ${result.error?.message??result.signal??'failed'}; see saved stderr`);
  assert.deepEqual(manifest(),sources,'Source changed during qualification');return result.stdout;
 };
 save();
 try{
  for(const stage of NATIVE_STAGES){
   const stdout=execute(stage.name,[stage.file,'--local-bin',bin]);
   const proof=JSON.parse(stdout);validateNativeProof(stage,proof,sources);
   fs.writeFileSync(path.join(output,stage.name+'.json'),JSON.stringify(proof,null,2)+'\n');
   report.stages.push({name:stage.name,caseCount:stage.caseCount,status:'passed',cleanup:proof.cleanup});save();
   console.log(`${stage.name}: ${stage.caseCount} native groups passed; cleanup verified`);
  }
  const fixture=JSON.parse(fs.readFileSync(env.ISOLATED_SANDBOX_COMMAND_FIXTURE,'utf8'));
  assert.equal(fixture.protocol,'sandbox-commerce-v1');assert.ok(fixture.cases?.length>0,'Actual core responses required');
  report.commandFixture={sha256:hash(fs.readFileSync(env.ISOLATED_SANDBOX_COMMAND_FIXTURE)),cases:fixture.cases.length};
  const tap=execute('client-provider-delivery',['--test','--test-reporter=tap',...NODE_TEST_FILES]);
  report.nodeTests=validateNodeTap(tap);report.status='passed';
  console.log('Client/provider/delivery: 52 passed; zero skipped, cancelled or todo');
 }catch(error){report.status='failed';report.error=String(error.message);throw error;}
 finally{report.finishedAt=new Date().toISOString();save();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2));
