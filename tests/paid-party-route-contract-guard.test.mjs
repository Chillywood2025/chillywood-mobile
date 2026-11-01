import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,copyFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {inspectPaidPartyRouteContract} from '../scripts/lib/paid-party-route-contract.mjs';
const source=readFileSync('app/watch-party/index.tsx','utf8');
const navigation='await navigateToPreviewRoom(targetPreview);';
test('actual paid Party purchase retains verified-access handoff independent of callback dependencies',()=>{
 assert.deepEqual(inspectPaidPartyRouteContract(source),[]);
 assert.deepEqual(inspectPaidPartyRouteContract(source.replace('paidTicketGate?.offer?.provider, paidWatchPartyCheckoutAvailable','anotherSafeDependency, paidTicketGate?.offer?.provider, paidWatchPartyCheckoutAvailable')),[]);
});
test('removed, commented, unverified, wrong-target and Live Stage post-purchase paths fail closed',()=>{
 for(const mutated of [source.replace(navigation,''),source.replace(navigation,`// ${navigation}`),source.replace(navigation,'await navigateToPreviewRoom(preparedRoom);'),
  source.replace('if (result.ok && result.access.allowed) {','if (result.ok) {'),source.replace(navigation,'router.push("/watch-party/live-stage/other");'),
  source.replace(navigation,`${navigation} setEmbeddedLiveStageEntry({});`),source.replace(navigation,`const neverCalled = async () => { ${navigation} };`),
  source.replace(navigation,`if (false) { ${navigation} }`),source.replace('const onBuyPaidTicketAndJoin = useCallback','const renamedBuyer = useCallback')]){
  assert.notEqual(mutated,source);assert.ok(inspectPaidPartyRouteContract(mutated).length>0);
 }
});
test('real CLI route guard fails when only the actual paid post-purchase path is removed',()=>{
 const guard=path.resolve('scripts/guard-route-contracts.mjs');
 const guardSource=readFileSync(guard,'utf8');const temp=mkdtempSync(path.join(os.tmpdir(),'party-route-negative-'));
 try{
  const paths=new Set([...guardSource.matchAll(/"((?:app|_lib|supabase|docs)\/[^"\n]+)"/g)].map(m=>m[1]));
  for(const file of paths){const dest=path.join(temp,file);mkdirSync(path.dirname(dest),{recursive:true});copyFileSync(file,dest);}
  const run=()=>spawnSync(process.execPath,[guard],{cwd:temp,encoding:'utf8'});
  const baseline=run();assert.equal(baseline.status,0,baseline.stderr);
  writeFileSync(path.join(temp,'app/watch-party/index.tsx'),source.replace(navigation,`// removed actual call: ${navigation}`));
  const broken=run();assert.equal(broken.status,1);assert.match(broken.stderr,/post-purchase path must call navigateToPreviewRoom/);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
