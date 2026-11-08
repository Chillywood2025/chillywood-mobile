import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {verifyFreshCaptureProfile} from './test-store-v3-profile-binding.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../..');
const profilePath='isolated-runtime/sandbox-commerce-v1/candidates/paid-video-capture-composed/source-manifest.json';
const profile=JSON.parse(fs.readFileSync(path.join(repo,profilePath),'utf8'));
const harness=fs.readFileSync(path.join(here,'test-store-v3-capture-composed-managed.native.mjs'),'utf8');
const orderLiteral=harness.match(/\nconst ordered=(\[[\s\S]*?\]);/u);
assert.ok(orderLiteral,'Read the actual native harness installation order without evaluating it');
const executionPaths=JSON.parse(orderLiteral[1]).map(file=>path.posix.normalize('isolated-runtime/sandbox-commerce-v1/'+file));
const readSource=file=>fs.readFileSync(path.join(repo,file));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const verify=(value=profile,paths=executionPaths,read=readSource)=>verifyFreshCaptureProfile(value,paths,read);
const clone=()=>structuredClone(profile);
const identity=profile.orderedModules.find(entry=>entry.path.endsWith('/identity.sql'));
const revisePreimage=value=>{value.witnessPreimage={protocol:'scpv-capture-install-source-preimage-v1',
 orderedModules:value.orderedModules.filter(entry=>entry.path!==identity.path).map(({path,sha256})=>({path,sha256}))};};

test('current packaging manifest verifies the same exact 42-position SQL profile',()=>{
 assert.deepEqual(verify(),{installationSourceSha256:'5b4eee14864d5e039114ae8c605407f7b3f9baaca90511172267d31b4fd1356e',moduleCount:42,identitySha256:identity.sha256});
});

test('non-executable packaging and qualification metadata do not determine SQL identity',()=>{
 const value=clone();
 value.status='additional local evidence recorded';
 value.candidateFiles=[{path:'README.md',sha256:'0'.repeat(64)}];
 value.qualifications={localOnly:true};value.limitations=['No provider authority'];
 for(const entry of value.orderedModules){delete entry.origin;delete entry.derivedFrom;delete entry.gitBlob;}
 assert.notEqual(hash(JSON.stringify(value)),hash(JSON.stringify(profile)));
 assert.deepEqual(verify(value),verify());
});

test('manifest order cannot diverge from the native installer order',()=>{
 const value=clone();[value.orderedModules[1],value.orderedModules[2]]=[value.orderedModules[2],value.orderedModules[1]];
 assert.throws(()=>verify(value),/installation order/u);
});

test('reordering both installer and manifest still changes the pinned preimage',()=>{
 const value=clone();[value.orderedModules[1],value.orderedModules[2]]=[value.orderedModules[2],value.orderedModules[1]];
 value.orderedModules.forEach((entry,index)=>entry.position=index+1);revisePreimage(value);
 assert.throws(()=>verify(value,value.orderedModules.map(entry=>entry.path)),/Executable SQL profile/u);
});

test('removed repeated grant, extra module and tampered position are rejected',()=>{
 const removed=clone();removed.orderedModules.splice(30,1);assert.throws(()=>verify(removed));
 const extra=clone();extra.orderedModules.push(extra.orderedModules[0]);assert.throws(()=>verify(extra));
 const position=clone();position.orderedModules[30].position=17;assert.throws(()=>verify(position));
});

test('removing a repeated guard from both arrays cannot reduce the approved profile',()=>{
 const value=clone();value.orderedModules.splice(30,1);value.orderedModules.forEach((entry,index)=>entry.position=index+1);revisePreimage(value);
 assert.throws(()=>verify(value,value.orderedModules.map(entry=>entry.path)));
});

test('source bytes must match the manifest even when SQL only gains a comment',()=>{
 const target=executionPaths[1];
 assert.throws(()=>verify(profile,executionPaths,file=>file===target?Buffer.concat([readSource(file),Buffer.from('\n-- changed\n')]):readSource(file)),/Source bytes changed/u);
});

test('self-consistent edited source, manifest and preimage cannot replace the pinned SQL',()=>{
 const value=clone(),target=value.orderedModules[1].path,bytes=Buffer.concat([readSource(target),Buffer.from('\n-- changed\n')]);
 value.orderedModules[1].sha256=hash(bytes);revisePreimage(value);
 assert.throws(()=>verify(value,executionPaths,file=>file===target?bytes:readSource(file)),/Executable SQL profile/u);
 value.installationSourceSha256=hash(JSON.stringify(value.witnessPreimage));
 assert.throws(()=>verify(value,executionPaths,file=>file===target?bytes:readSource(file)));
});

test('preimage omissions, changed protocol and unexpected fields are rejected',()=>{
 const missing=clone();missing.witnessPreimage.orderedModules.pop();assert.throws(()=>verify(missing),/Witness must describe/u);
 const protocol=clone();protocol.witnessPreimage.protocol='replacement';assert.throws(()=>verify(protocol),/Witness must describe/u);
 const extra=clone();extra.witnessPreimage.ignore='unexpected';assert.throws(()=>verify(extra),/Witness must describe/u);
});

test('generated identity bytes and self-consistent replacement hash are pinned separately',()=>{
 const bytes=Buffer.concat([readSource(identity.path),Buffer.from('\n-- changed identity\n')]);
 assert.throws(()=>verify(profile,executionPaths,file=>file===identity.path?bytes:readSource(file)),/Source bytes changed/u);
 const value=clone();value.orderedModules.find(entry=>entry.path===identity.path).sha256=hash(bytes);
 assert.throws(()=>verify(value,executionPaths,file=>file===identity.path?bytes:readSource(file)));
});

test('missing or duplicated generated identity cannot escape the installation preimage',()=>{
 const missing=clone();missing.orderedModules=missing.orderedModules.filter(entry=>entry.path!==identity.path);assert.throws(()=>verify(missing));
 const duplicate=clone();duplicate.orderedModules[0]={...identity,position:1};revisePreimage(duplicate);
 assert.throws(()=>verify(duplicate,duplicate.orderedModules.map(entry=>entry.path)));
});

test('moving identity in both manifest and installer cannot escape its preimage exclusion',()=>{
 const value=clone(),index=value.orderedModules.findIndex(entry=>entry.path===identity.path);
 const [entry]=value.orderedModules.splice(index,1);value.orderedModules.splice(38,0,entry);
 value.orderedModules.forEach((module,position)=>module.position=position+1);revisePreimage(value);
 assert.deepEqual(value.witnessPreimage,profile.witnessPreimage,'Identity relocation does not change the nonidentity preimage');
 assert.throws(()=>verify(value,value.orderedModules.map(module=>module.path)),/exact installation position/u);
});

test('fresh profile cannot be mistaken for retained mode or authorized deployment',()=>{
 for(const [key,value] of [['protocol','scpv-retained-capture-install-profile-v1'],['freshInactiveInstallOnly',false],['deploymentAuthorized',true],['consumerBinding','other-project']]){
  const changed=clone();changed[key]=value;assert.throws(()=>verify(changed),key);
 }
});

test('selected baseline commit, remote commit, tree and reference manifest remain exact',()=>{
 for(const key of Object.keys(profile.baseline)){const value=clone();value.baseline[key]='0'.repeat(value.baseline[key].length);assert.throws(()=>verify(value),key);}
});

test('invalid or missing hashes reject before source access',()=>{
 for(const bad of [undefined,null,'A'.repeat(64),'0'.repeat(63)]){
  const value=clone();value.orderedModules[0].sha256=bad;let reads=0;
  assert.throws(()=>verify(value,executionPaths,()=>{reads++;return Buffer.alloc(0);}));assert.equal(reads,0);
 }
});

test('native harness invokes the helper and retains its source hash in future proof',()=>{
 assert.match(harness,/import \{verifyFreshCaptureProfile\} from '\.\/test-store-v3-profile-binding\.mjs';/u);
 assert.match(harness,/verifyFreshCaptureProfile\(profileManifest,ordered\.map/u);
 assert.match(harness,/\['test-store-v3-profile-binding\.mjs',hash\(profileBindingRaw\)\]/u);
 assert.doesNotMatch(harness,/23175fd9445e69810698b60ab9cd434dd2571a451f07bd479376f54482eec60f/u);
});
