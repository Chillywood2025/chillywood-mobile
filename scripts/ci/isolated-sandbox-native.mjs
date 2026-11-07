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
 archiveUrl:'https://ftp.postgresql.org/pub/source/v17.6/postgresql-17.6.tar.bz2',
 sha256:'e0630a3600aea27511715563259ec2111cd5f4353a4b040e0be827f94cd7a8b0'});
const ordinaryCleanup=['clusterStopped','clusterNotRunningVerified','directoryRemoved'];
const allSql=['core.sql','premium-authority.sql','authority.sql','commands.sql','receipts.sql','permissions-finalize.sql'];
const resourceSql=[...allSql.filter(file=>file!=='permissions-finalize.sql'),'resource-graphs.sql','delivery-authority.sql','permissions-finalize.sql'];
const routerPath='isolated-runtime/receipt-router-v1';
const routerSql=['core.sql','holds.sql','ownership.sql','worker.sql','permissions-finalize.sql'];
const routerSources=[...routerSql.map(file=>`${routerPath}/${file}`),
 `${routerPath}/tests/router.native.mjs`,...['envelope','planner','handler','worker'].map(name=>`supabase/functions/_shared/revenuecat-router-${name}.ts`)];
const isolatedBridgeSources=[...routerSql,'isolated-source-bridge.sql'].map(file=>`${routerPath}/${file}`).concat(
 allSql.map(file=>`${modulePath}/${file}`),'supabase/functions/_shared/revenuecat-router-envelope.ts',
 `${routerPath}/tests/isolated-source-bridge.native.mjs`,
 ['receipts.fixture.mjs','authority.fixture.sql','premium-authority.fixture.sql'].map(file=>`${modulePath}/tests/${file}`));
const legacyBridgeSources=[...routerSql,'legacy-source-bridge.sql'].map(file=>`${routerPath}/${file}`).concat(
 `${routerPath}/tests/legacy-source-bridge.native.mjs`,`${routerPath}/tests/legacy-source-bridge.fixture.mjs`,
 'supabase/functions/_shared/revenuecat-router-envelope.ts');
const testStoreSources=[...allSql.filter(file=>file!=='permissions-finalize.sql'),'test-store.sql','permissions-finalize.sql']
 .map(file=>`${modulePath}/${file}`).concat(
 ['premium-authority.fixture.sql','authority.fixture.sql','test-store.fixture.mjs','test-store.native.mjs'].map(file=>`${modulePath}/tests/${file}`),
 'supabase/functions/_shared/revenuecat-router-envelope.ts','supabase/functions/_shared/isolated-test-store-contract.ts');
const stageSources={
 'premium-authority':['premium-authority.sql'],authority:['authority.sql','premium-authority.sql'],
 core:allSql.filter(file=>file!=='receipts.sql'),declarations:allSql,receipts:allSql,
 'managed-install':[...resourceSql,'history.sql','test-store.sql'],availability:['core.sql'],history:[...allSql,'history.sql'],
 'resource-graphs':resourceSql,
};
export const NATIVE_STAGES=Object.freeze([
 ['premium-authority',46,['stopped','notRunningVerified','directoryRemoved']],
 ['authority',20,[...ordinaryCleanup,'sessionsClosed']],
 ['core',11,[...ordinaryCleanup,'sessionsClosed']],
 ['declarations',12,[...ordinaryCleanup,'sessionsClosed']],
 ['receipts',26,[...ordinaryCleanup,'sessionsClosed']],
 ['history',25,[...ordinaryCleanup,'sessionsClosed']],
 ['resource-graphs',46,[...ordinaryCleanup,'sessionsClosed']],
 ['managed-install',20,[...ordinaryCleanup,'sessionsClosed']],
 ['availability',21,ordinaryCleanup],
].map(([name,caseCount,cleanupKeys])=>Object.freeze({name,caseCount,cleanupKeys,sourceBase:modulePath,
 sourceFiles:Object.freeze(stageSources[name]),file:`${modulePath}/tests/${name}.native.mjs`})).concat([
 Object.freeze({name:'test-store',caseCount:29,cleanupKeys:[...ordinaryCleanup,'sessionsClosed'],sourceBase:'',
  sourceFiles:Object.freeze(testStoreSources),file:`${modulePath}/tests/test-store.native.mjs`}),
 Object.freeze({name:'receipt-router',caseCount:22,cleanupKeys:[...ordinaryCleanup,'sessionsClosed'],
  sourceBase:'',sourceFiles:Object.freeze(routerSources),file:`${routerPath}/tests/router.native.mjs`,proofFormat:'receipt-router-v1',
  proofKind:'actual-local-postgresql-source-proof',providerQualificationField:'actualProviderAuthenticationProven'}),
 Object.freeze({name:'isolated-source-bridge',caseCount:16,cleanupKeys:ordinaryCleanup,sourceBase:'',
  sourceFiles:Object.freeze(isolatedBridgeSources),file:`${routerPath}/tests/isolated-source-bridge.native.mjs`,proofFormat:'receipt-router-v1',
  proofKind:'actual-local-source-bridge-proof',providerQualificationField:'actualProviderQualificationProven'}),
 Object.freeze({name:'legacy-source-bridge',caseCount:49,cleanupKeys:[...ordinaryCleanup,'sessionsClosed'],sourceBase:'',
  sourceFiles:Object.freeze(legacyBridgeSources),file:`${routerPath}/tests/legacy-source-bridge.native.mjs`,
  providerQualificationField:'actualProviderAuthenticationProven'}),
]));
export const NODE_STAGES=Object.freeze([
 {name:'commerce-provider-delivery',expectedTests:52,files:['tests/isolated-sandbox-commerce-client.test.mjs',
  'tests/isolated-sandbox-delivery-policy.test.mjs','tests/creator-money/isolated-sandbox-provider.test.mjs']},
 {name:'tip-client',expectedTests:17,files:['tests/isolated-sandbox-tips-client.test.mjs']},
 {name:'tip-mounted',expectedTests:25,files:['tests/isolated-sandbox-tips-mounted.test.mjs']},
 {name:'tip-journal',expectedTests:18,files:['tests/isolated-sandbox-tip-attempts.test.mjs']},
 {name:'tip-checkout-journal',expectedTests:19,files:['tests/isolated-sandbox-tip-checkout-attempts.test.mjs']},
 {name:'library-discovery',expectedTests:19,files:['tests/saved-media-screens-mounted.test.mjs']},
 {name:'receipt-router',expectedTests:18,files:['tests/creator-money/revenuecat-router.test.mjs']},
 {name:'test-store-provider',expectedTests:20,files:['tests/creator-money/isolated-test-store-contract.test.mjs']},
 {name:'test-store-command',expectedTests:28,files:['tests/creator-money/isolated-test-store-command.test.mjs']},
 {name:'test-store-client',expectedTests:7,files:['tests/isolated-test-store-client.test.mjs']},
 {name:'test-store-sdk',expectedTests:9,files:['tests/isolated-test-store-sdk.test.mjs']},
 {name:'test-store-legacy-suppression',expectedTests:6,files:['tests/isolated-test-store-legacy-suppression.test.mjs']},
 {name:'test-store-mounted',expectedTests:12,files:['tests/isolated-test-store-mounted.test.mjs']},
 {name:'test-store-attempts',expectedTests:26,files:['tests/isolated-test-store-attempts.test.mjs']},
 {name:'test-store-build',expectedTests:7,files:['tests/isolated-test-store-build.test.mjs']},
 {name:'test-store-native-compile-guard',expectedTests:6,files:['tests/isolated-test-store-native-compile.test.mjs']},
].map(stage=>Object.freeze({...stage,files:Object.freeze(stage.files)})));
export const NODE_TEST_FILES=Object.freeze(NODE_STAGES.flatMap(stage=>stage.files));
export const EXPECTED_NODE_TESTS=NODE_STAGES.reduce((total,stage)=>total+stage.expectedTests,0);
export const createPlan=()=>({postgres:POSTGRES,nativeStages:NATIVE_STAGES,nodeTests:NODE_TEST_FILES,
 nodeStages:NODE_STAGES,expectedNodeTests:EXPECTED_NODE_TESTS,execution:'sequential/local-only',
 fixture:'Fresh actual core and history SQL responses, generated in this attempt before client tests',
 limitations:['Synthetic source fixtures only; no production schema, hosted owner/Auth/RLS or device qualification.',
  'Provider classifier and delivery policy tests do not authenticate provider observations or issue real access.']});

export function validateNativeProof(stage,proof,sourceHashes){
 if(stage.proofFormat==='receipt-router-v1'){
  assert.equal(proof.kind,stage.proofKind,`${stage.name}: proof kind`);
  assert.equal(proof.postgres,'17.6');assert.equal(proof.cases,stage.caseCount,`${stage.name}: native case count changed`);
  assert.ok(Array.isArray(proof.passed),`${stage.name}: native cases must be an array`);
  assert.equal(proof.passed.length,stage.caseCount,`${stage.name}: incomplete case list`);
 }else{
  assert.equal(proof.status,'passed',`${stage.name}: status`);
  assert.equal(proof.caseCount,stage.caseCount,`${stage.name}: native case count changed`);
  assert.ok(Array.isArray(proof.cases),`${stage.name}: native cases must be an array`);
  assert.equal(proof.cases?.length,stage.caseCount,`${stage.name}: incomplete case list`);
  assert.match(proof.engine??proof.version??'',/^postgres \(PostgreSQL\) 17\.6$/u);
 }
 if(stage.providerQualificationField){
  for(const key of ['providerOrProductionCalls',stage.providerQualificationField,'legacyEnforcementProven'])assert.equal(proof[key],false,`${stage.name}: ${key}`);
  assert.equal(proof.syntheticProviderEvidence,true);
 }
 if(stage.name==='test-store'){
  assert.equal(proof.kind,'isolated-test-store-native-source-proof');assert.equal(proof.syntheticProviderEvidence,true);
  for(const key of ['providerOrProductionCalls','actualProviderAuthenticationProven','actualDeviceBehaviorProven'])assert.equal(proof[key],false,`test-store: ${key}`);
 }
 for(const key of stage.cleanupKeys)assert.equal(proof.cleanup?.[key],true,`${stage.name}: cleanup ${key}`);
 assert.ok(Object.values(proof.cleanup).every(value=>value===true),`${stage.name}: cleanup failure`);
 if(stage.name==='premium-authority'){
  assert.equal(proof.sourceSha256,sourceHashes[`${modulePath}/premium-authority.sql`]);
  assert.equal(proof.fixtureSha256,sourceHashes[`${modulePath}/tests/premium-authority.fixture.sql`]);
  assert.equal(proof.harnessSha256,sourceHashes[stage.file]);
 }else{
  assert.deepEqual(Object.keys(proof.sourceHashes??{}).sort(),[...stage.sourceFiles].sort(),`${stage.name}: incomplete source identity`);
  for(const [file,value]of Object.entries(proof.sourceHashes)){
   assert.match(value??'',/^[a-f0-9]{64}$/u,`${stage.name}: invalid source digest ${file}`);
   assert.equal(value,sourceHashes[stage.sourceBase?`${stage.sourceBase}/${file}`:file],`${stage.name}: source ${file}`);
  }
 }
}
export function validateNodeTap(tap,expectedTests=EXPECTED_NODE_TESTS){
 assert.ok(Number.isSafeInteger(expectedTests)&&expectedTests>0,'Exact expected Node count required');
 const values={};
 for(const key of ['tests','pass','fail','cancelled','skipped','todo']){
  const matches=[...tap.matchAll(new RegExp(`^# ${key} (\\d+)$`,'gm'))];
  assert.equal(matches.length,1,`Missing or ambiguous TAP ${key} summary`);
  values[key]=Number(matches[0][1]);
 }
 assert.equal(values.tests,expectedTests);assert.equal(values.pass,expectedTests);
 for(const key of ['fail','cancelled','skipped','todo'])assert.equal(values[key],0,`Node ${key} must be zero`);
 return values;
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function collectSourceManifest(){
 const files=[...NODE_TEST_FILES,...NATIVE_STAGES.flatMap(stage=>stage.sourceFiles.map(file=>stage.sourceBase?`${stage.sourceBase}/${file}`:file)),
  '_lib/isolatedSandboxCommerce.ts','_lib/accountBoundSupabaseRpc.mjs',
  '_lib/accountSessionAuthority.ts','_lib/accountBoundSupabaseMutation.ts','package.json','package-lock.json',
  '_lib/isolatedSandboxTips.ts','_lib/isolatedSandboxTipAttempts.ts','_lib/isolatedSandboxTipCheckoutAttempts.ts','_lib/session.tsx','_lib/supabase.ts',
  '_lib/entitlementAuthority.ts','app/(tabs)/my-list.tsx','app/(tabs)/index.tsx','app/title/[id].tsx',
  '_lib/liveDiscoveryInvalidation.ts','_lib/publicPartyRoomCounts.ts','_lib/usePublicPartyRoomCounts.ts',
  'components/navigation/app-back-button.tsx',
  ...['envelope','planner','handler','worker'].map(name=>`supabase/functions/_shared/revenuecat-router-${name}.ts`),
  'supabase/functions/_shared/provider-readiness.ts',
  'supabase/functions/_shared/isolated-sandbox-provider.ts','supabase/functions/_shared/isolated-sandbox-delivery-policy.ts',
  'supabase/functions/_shared/isolated-test-store-contract.ts','supabase/functions/_shared/isolated-test-store-command.ts','supabase/config.toml',
  'supabase/functions/_shared/stripe-connect.ts','supabase/functions/_shared/exact-subject-authority.ts','supabase/functions/_shared/livekit-session-generation.ts',
  ...['','Attempts','Build','Contract','Rehearsal','Sdk'].map(name=>`_lib/isolatedTestStore${name}.ts`),
  '_lib/monetization.ts','_lib/revenuecat.ts','tests/helpers/premium-runtime-harness.mjs',
  'app.config.ts','eas.json','config/test-store-debug-config.js','config/test-store-debug-v1.json',
  'plugins/withIsolatedTestStoreDebug.js','scripts/compile-native-camera-effects.mjs',
  'scripts/test-local-camera-inference-offline.mjs','scripts/camera-provider-closure.mjs','tests/native-camera-compile-records.test.mjs',
  'supabase/migrations/20260730170000_revenuecat_transfer_authoritative_ordering.sql',
  'supabase/migrations/20260908231500_pre_activation_premium_repurchase_quarantine_closure.sql',
  'supabase/migrations/20260909015439_pre_activation_premium_fresh_generation_lifecycle.sql',
  'scripts/ci/isolated-sandbox-native.mjs','scripts/ci/required-validation.mjs','config/ci/required-validation-v1.json',
  'tests/ci/legacy-source-bridge-bootstrap.test.mjs',
  'tests/ci/managed-install-bootstrap.test.mjs',
  'tests/ci/isolated-sandbox-native-validation.test.mjs','.github/workflows/required-validation.yml'];
 const visit=relative=>{for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){
  const next=`${relative}/${entry.name}`;assert.ok(!entry.isSymbolicLink(),`Source symlink rejected: ${next}`);
  if(entry.isDirectory())visit(next);else if(entry.isFile())files.push(next);
 }};
 for(const directory of [modulePath,routerPath,'app/sandbox-tips','components/monetization',
  'supabase/functions/revenuecat-receipt-router-v1','supabase/functions/isolated-sandbox-test-store-v1',
  'supabase/functions/isolated-test-store-revenuecat-webhook-v1','modules/chillywood-test-store-admission'])visit(directory);
 return Object.fromEntries([...new Set(files)].sort().map(file=>{
  const absolute=path.join(root,file);assert.ok(fs.lstatSync(absolute).isFile(),`Regular source required: ${file}`);
  return [file,hash(fs.readFileSync(absolute))];
 }));
}

export function validateCommandFixture(fixture,kind){
 if(kind==='test-store'){
  assert.equal(fixture.protocol,'isolated-test-store-v1');
  assert.ok(Array.isArray(fixture.cases)&&fixture.cases.length>=7,'Fresh actual Test Store SQL responses required');
  const commands=new Set();let freshClaims=0;let verified=false;let deniedClaim=false;
  for(const entry of fixture.cases){
   assert.ok(['allocate','claim','read','report'].includes(entry.command));commands.add(entry.command);
   assert.match(entry.requestId??'',/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u);
   assert.match(entry.configurationDigest??'',/^[a-f0-9]{64}$/u);
   const response=entry.response;assert.equal(response?.protocol,fixture.protocol);assert.equal(response?.environment,'sandbox');
   assert.equal(response?.generation,1);assert.equal(response?.command,entry.command);assert.equal(response?.requestId,entry.requestId);
   assert.deepEqual(response?.actor,entry.actor);assert.equal(response?.result?.retryProviderMutation,false);
   assert.equal(response?.result?.grantsAccess,false);assert.equal(response?.result?.notPayable,true);
   const allocation=response.result.allocation;
   assert.equal(allocation.intentId,entry.payload.intentId);assert.equal(allocation.configurationDigest,entry.configurationDigest);
   assert.equal(allocation.store,'TEST_STORE');assert.equal(allocation.sourceEnvironment,'SANDBOX');assert.equal(allocation.quote.kind,'creator_tip');
   if(entry.payload.expectedQuote)assert.deepEqual(allocation.quote,entry.payload.expectedQuote);
   if(entry.payload.dispatchId)assert.equal(allocation.dispatchId,entry.payload.dispatchId);
   if(response.result.dispatchAllowed){assert.equal(entry.command,'claim');assert.equal(response.result.status,'dispatch_claimed');freshClaims++;}
   else {assert.equal(response.result.authorityValidUntil,null);if(entry.command==='claim')deniedClaim=true;}
   if(response.result.status==='verified'){assert.equal(response.result.receipt?.state,'verified');verified=true;}
  }
  for(const command of ['allocate','claim','read','report'])assert.ok(commands.has(command));
  assert.equal(freshClaims,1);assert.equal(deniedClaim,true);assert.equal(verified,true);
  return {cases:fixture.cases.length,commands:[...commands].sort(),freshClaims};
 }
 assert.equal(fixture.protocol,'sandbox-commerce-v1');
 assert.ok(Array.isArray(fixture.cases)&&fixture.cases.length>0,'Fresh actual SQL responses required');
 const commands=new Set();
 for(const entry of fixture.cases){
  assert.ok(entry&&typeof entry==='object'&&!Array.isArray(entry));
  assert.equal(typeof entry.command,'string');assert.ok(entry.payload&&typeof entry.payload==='object'&&!Array.isArray(entry.payload));
  const requestId=entry.requestId??entry.payload.requestId;
  assert.match(requestId??'',/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u);
  assert.equal(entry.response?.protocol,'sandbox-commerce-v1');assert.equal(entry.response?.environment,'sandbox');
  assert.equal(entry.response?.command,entry.command);
  assert.equal(entry.response?.requestId,requestId);
  commands.add(entry.command);
 }
 if(kind==='history')for(const command of ['capability.read','studio.read','offers.read','offer.read','history.read',
  'status.read','request.read','offer.retire','checkout.abandon'])assert.ok(commands.has(command),`Missing current SQL fixture command ${command}`);
 else assert.equal(kind,'core');
 assert.equal(fixture.provenance?.synthetic,true,'SQL fixtures must retain their synthetic-data boundary');
 assert.equal(fixture.provenance?.providerOrProductionCalls,false);
 assert.ok(Array.isArray(fixture.checkoutCases)&&fixture.checkoutCases.length===1,'One actual buyer preparation capture required');
 const checkout=fixture.checkoutCases[0];assert.ok(checkout?.actor&&checkout.quote&&checkout.response?.data?.intent);
 const {actor,quote,response}=checkout;
 assert.equal(checkout.command,'checkout.prepare');assert.equal(response.command,checkout.command);
 assert.equal(response.protocol,'sandbox-commerce-v1');assert.equal(response.environment,'sandbox');assert.equal(response.status,'ok');
 assert.equal(response.requestId,checkout.requestId);assert.equal(actor.accountId,actor.userId);assert.equal(actor.restoreOnly,false);
 for(const key of ['userId','sessionGeneration'])assert.match(actor[key]??'',/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u);
 for(const key of ['userId','accountId','sessionGeneration'])assert.equal(response.actor?.[key],actor[key]);
 assert.equal(checkout.payload?.offerId,quote.offerId);assert.equal(checkout.payload?.expectedRevision,quote.offerRevision);
 for(const key of ['offerRevision','resourceRevision','amountMinor'])assert.ok(Number.isSafeInteger(quote[key])&&quote[key]>0);
 assert.equal(quote.kind,'creator_tip');assert.match(quote.currency??'',/^[a-z]{3}$/u);
 for(const key of ['offerId','resourceId','kind'])assert.equal(response.data.intent[key],quote[key]);
 assert.equal(response.data.intent.providerDispatchAllowed,false);
 if(kind==='history'){
  const recovery=checkout.recovery?.response;assert.ok(recovery?.data?.entry,'Fresh original-request recovery capture required');
  assert.equal(recovery.protocol,'sandbox-commerce-v1');assert.equal(recovery.environment,'sandbox');assert.equal(recovery.status,'ok');
  assert.equal(recovery.command,'request.read');assert.equal(recovery.requestId,checkout.recovery.requestId);
  for(const key of ['userId','accountId','sessionGeneration'])assert.equal(recovery.actor?.[key],actor[key]);
  assert.equal(recovery.data.originalRequestId,checkout.requestId);assert.equal(recovery.data.recordedSessionId,actor.sessionGeneration);
  assert.equal(recovery.data.recordedCommand,'checkout.prepare');assert.equal(recovery.data.recordedPayload?.requestId,checkout.requestId);
  for(const key of ['offerId','expectedRevision'])assert.equal(recovery.data.recordedPayload?.[key],checkout.payload[key]);
  assert.equal(recovery.data.entry.id,response.data.intent.id);assert.equal(recovery.data.entry.providerDispatchAllowed,false);
  for(const key of ['offerId','offerRevision','resourceId','resourceRevision','creatorId','kind','amountMinor','currency'])
   assert.equal(recovery.data.entry[key],quote[key],`Recovered quote differs: ${key}`);
 }
 return {cases:fixture.cases.length,commands:[...commands].sort(),checkoutCases:fixture.checkoutCases.length};
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
  ISOLATED_SANDBOX_COMMAND_FIXTURE:path.join(output,'native-command-responses.json'),
  ISOLATED_SANDBOX_TIPS_FIXTURE:path.join(output,'native-tip-history-responses.json'),
  ISOLATED_TEST_STORE_FIXTURE:path.join(output,'native-test-store-responses.json'),
  ISOLATED_TIPS_NATIVE_FIXTURES:path.join(output,'native-tip-history-responses.json')});
 const sources=collectSourceManifest();
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
   assert.deepEqual(collectSourceManifest(),sources,'Source changed during qualification');return result.stdout;
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
  const fixtures={core:env.ISOLATED_SANDBOX_COMMAND_FIXTURE,history:env.ISOLATED_SANDBOX_TIPS_FIXTURE,'test-store':env.ISOLATED_TEST_STORE_FIXTURE};
  report.commandFixtures={};
  for(const [kind,file]of Object.entries(fixtures)){
   const bytes=fs.readFileSync(file);const fixture=JSON.parse(bytes.toString('utf8'));
   report.commandFixtures[kind]={sha256:hash(bytes),...validateCommandFixture(fixture,kind)};
  }
  report.nodeStages=[];
  for(const stage of NODE_STAGES){
   const tap=execute(`node-${stage.name}`,['--test','--test-reporter=tap',...stage.files]);
   const result=validateNodeTap(tap,stage.expectedTests);
   report.nodeStages.push({name:stage.name,...result});save();
   for(const [kind,file]of Object.entries(fixtures))assert.equal(hash(fs.readFileSync(file)),report.commandFixtures[kind].sha256,'SQL fixture changed during client validation');
   console.log(`${stage.name}: ${result.pass} passed; zero skipped, cancelled or todo`);
  }
  report.nodeTests=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo']
   .map(key=>[key,report.nodeStages.reduce((total,stage)=>total+stage[key],0)]));
  assert.equal(report.nodeTests.tests,EXPECTED_NODE_TESTS);assert.equal(report.nodeTests.pass,EXPECTED_NODE_TESTS);
  report.status='passed';
 }catch(error){report.status='failed';report.error=String(error.message);throw error;}
 finally{report.finishedAt=new Date().toISOString();save();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2));
