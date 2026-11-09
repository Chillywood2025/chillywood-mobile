import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';
import {nativeStoreDeploymentPacket} from '../../isolated-runtime/native-store-sandbox-v1/deployment-packet.mjs';
const root=path.resolve(import.meta.dirname,'../..'),commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const read=name=>fs.readFileSync(path.join(root,name));
test('one exact app source binds all four Edge closures separately from SQL catalog',()=>{
 const p=nativeStoreDeploymentPacket(commit);assert.equal(p.sql.moduleCount,48);assert.equal(p.appSourceCommit,commit);assert.equal(p.appSourceTree,execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:root,encoding:'utf8'}).trim());assert.equal(p.edges.length,4);
 assert.deepEqual(p.edges.map(x=>x.verify_jwt),[true,true,false,true]);assert.equal(new Set(p.edges.map(x=>x.sourceDigest)).size,4);
 for(const [key,value] of Object.entries(p.qualification))assert.equal(value,key==='sourceBound');assert.match(p.packetDigest,/^[a-f0-9]{64}$/u);
 assert.equal(nativeStoreDeploymentPacket(commit).packetDigest,p.packetDigest);assert.ok(p.edges.every(x=>x.files.some(f=>f.name.endsWith('/deno.lock'))));
 assert.equal('sqlText' in p.sql,false);assert.equal('target' in p,false);
 assert.ok(p.provenance.some(x=>x.name==='isolated-runtime/native-store-sandbox-v1/install-recovery.mjs'));
});
test('exact commit required, no ref names or caller activation switches',()=>{for(const c of ['HEAD','main','--help','a'.repeat(39),null])assert.throws(()=>nativeStoreDeploymentPacket(c),/Exact/);});
test('JWT substitution or duplicate section is rejected',()=>{for(const change of [s=>s.replace('[functions.native-store-ingress-v1]\nverify_jwt = false','[functions.native-store-ingress-v1]\nverify_jwt = true'),s=>s+'\n[functions.native-store-ingress-v1]\nverify_jwt = false\n'])assert.throws(()=>nativeStoreDeploymentPacket(commit,{readFile:n=>n==='supabase/config.toml'?change(read(n).toString()):read(n)}),/JWT/);});
test('runtime source cannot be relabelled as the original app commit',()=>assert.throws(()=>nativeStoreDeploymentPacket(commit,{readFile:n=>n==='supabase/functions/native-store-reconcile-v1/index.ts'?read(n)+'\n// changed\n':read(n)}),/Source differs/));
test('SQL source, catalog, lock and missing source substitutions fail closed',()=>{
 for(const [file,change] of [
 ['isolated-runtime/native-store-sandbox-v1/quote.sql',s=>s+'\n'],
 ['isolated-runtime/native-store-sandbox-v1/install-delta.json',s=>s.replace(/"sourceDigest": "[a-f0-9]+"/u,'"sourceDigest": "'+ '0'.repeat(64)+'"')],
 ['supabase/functions/native-store-reconcile-v1/deno.lock',s=>s+'\n'],
 ['supabase/functions/native-store-reconcile-v1/index.ts',()=>null],
 ['isolated-runtime/native-store-sandbox-v1/install-recovery.mjs',s=>s+'\n// changed recovery\n'],
 ['isolated-runtime/native-store-sandbox-v1/install-recovery.mjs',()=>null],
 ])assert.throws(()=>nativeStoreDeploymentPacket(commit,{readFile:n=>n===file?change(read(n).toString()):read(n)}));
});

test('dirty packet or transitive SQL generator cannot label output with the committed source',async()=>{
 const packet=nativeStoreDeploymentPacket(commit),dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-packet-binding-'));
 try{
  for(const {name} of packet.provenance){const dest=path.join(dir,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,read(name));}
  fs.symlinkSync(path.join(root,'node_modules'),path.join(dir,'node_modules'));
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','-q');git('add','.');git('-c','user.name=Synthetic Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Synthetic packet fixture');const head=git('rev-parse','HEAD');
  const {nativeStoreDeploymentPacket:check}=await import(pathToFileURL(path.join(dir,'isolated-runtime/native-store-sandbox-v1/deployment-packet.mjs')).href);
  assert.equal(check(head).appSourceTree,git('rev-parse','HEAD^{tree}'));
  for(const name of ['isolated-runtime/native-store-sandbox-v1/deployment-packet.mjs','isolated-runtime/native-store-sandbox-v1/install-recovery.mjs','scripts/native-store-install-prepare.mjs']){const file=path.join(dir,name),original=fs.readFileSync(file);fs.appendFileSync(file,'\n// changed generator\n');assert.throws(()=>check(head),/TRACKED_SOURCE_DIRTY/u);fs.writeFileSync(file,original);}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
