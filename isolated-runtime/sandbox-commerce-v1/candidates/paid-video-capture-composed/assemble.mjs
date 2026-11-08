// Exact fresh source assembly only. Never executes SQL or contacts a provider.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../../..');
const sha=v=>createHash('sha256').update(v).digest('hex');
const original=JSON.parse(fs.readFileSync(path.join(here,'../paid-video-combined-readiness/source-manifest.json'),'utf8'));
const prefix='isolated-runtime/sandbox-commerce-v1/candidates/paid-video-capture-composed/';
const substitutions={
 'isolated-runtime/sandbox-commerce-v1/commands.sql':'legacy_commands.sql',
 'isolated-runtime/sandbox-commerce-v1/candidates/paid-video-combined-readiness/commands.sql':'commands.sql',
 'isolated-runtime/sandbox-commerce-v1/candidates/paid-video-combined-readiness/gateway.sql':'gateway.sql',
 'isolated-runtime/sandbox-commerce-v1/candidates/paid-video-combined-readiness/provisioning.sql':'provisioning.sql',
 'isolated-runtime/sandbox-commerce-v1/test-store-paid-video-receipts.sql':'receipts.sql',
 'isolated-runtime/sandbox-commerce-v1/paid-video-access.sql':'access.sql',
};
const modules=[];
function add(file,expected,extra={}){
 const source=extra.origin==='selected-published-baseline'
  ?execFileSync('git',['show',original.baseline.tree+':'+file],{cwd:repo})
  :fs.readFileSync(path.join(repo,file));
 const digest=sha(source);if(expected)assert.equal(digest,expected,'Pinned assembly input changed: '+file);
 modules.push({path:file,sha256:digest,origin:'reviewed-additive-source',...extra});
}
add('isolated-runtime/test-store-capture-v1/capture.sql','ea98dc0230a1026a40fe8c23e60e97f6c29c13dc19f2bf1b12c94f04a5289e81',{origin:'independent-capture-source'});
for(const entry of original.orderedModules){
 const file=entry.path;
 if(entry.position===31){add(prefix+'reconcile.sql');add(prefix+'profile-guard.sql');}
 if(substitutions[file])add(prefix+substitutions[file],null,{origin:'fresh-source-substitution',derivedFrom:{path:file,sha256:entry.sha256,...(entry.gitBlob?{gitBlob:entry.gitBlob}:{})}});
 else add(file,entry.sha256,{origin:entry.origin,...(entry.gitBlob?{gitBlob:entry.gitBlob}:{})});
 if(file.endsWith('/test-store-paid-video-core.sql'))add(prefix+'admission.sql');
 if(file.endsWith('/paid-video-checkout-recovery/abandon.sql'))add('isolated-runtime/sandbox-commerce-v1/candidates/paid-video-prepared-closure/close.sql','ad521a1cc86e09967aa2860c31061c696156f686a3527624c5e24c6e5646568e');
 if(file.endsWith('/paid-video-combined-readiness/media.sql')){
  add('isolated-runtime/sandbox-commerce-v1/candidates/paid-video-current-grant/resolve.sql','4d790421c86984f035f6ff9880fb89508fe994a94dab447863db916eaa5886ed');
  // The self-contained resolver revokes public CREATE. Reopen only the existing
  // transaction-bound install interval for the following new owned wrappers.
  add('isolated-runtime/sandbox-commerce-v1/paid-video-install-grant-v2.sql','34198830d90c0b97ea57d2cdecdf82033768fc344f38fbdcb515118c1546a791');
  add('ops/isolated-paid-video-operations-v2/operations.sql','32f965cb5e8bb815b17c0958ddc8dc933f149918b89ce9e1a708de42f7973355');
  add('ops/isolated-paid-video-operations-v2/monotonic-removal.sql','3398dcc95cbce6e45a0bed9934f48ee859cece5ec96979ada8dd15ca95b4b5ee');
 }
}
const preimage={protocol:'scpv-capture-install-source-preimage-v1',orderedModules:modules.map(({path,sha256})=>({path,sha256}))};
const sourceSha256=sha(JSON.stringify(preimage));
const identity=`-- Generated installation witness. Source digest covers every other ordered SQL
-- input in source-manifest.json. This module is excluded from its own preimage.
set local role sbx_v1_core_owner;
create table sandbox_commerce_v1.test_store_v3_capture_identity (
 singleton boolean primary key default true check(singleton),
 installation_id uuid not null unique default gen_random_uuid(),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$')
);
alter table sandbox_commerce_v1.test_store_v3_capture_identity enable row level security;
alter table sandbox_commerce_v1.test_store_v3_capture_identity force row level security;
create policy core_owner on sandbox_commerce_v1.test_store_v3_capture_identity to sbx_v1_core_owner using(true) with check(true);
revoke all on sandbox_commerce_v1.test_store_v3_capture_identity from public,anon,authenticated,service_role,sbx_v1_operator;
insert into sandbox_commerce_v1.test_store_v3_capture_identity(source_sha256) values('${sourceSha256}');
create trigger immutable before update or delete on sandbox_commerce_v1.test_store_v3_capture_identity for each row execute function sandbox_commerce_v1.test_store_v3_immutable();
create trigger no_truncate before truncate on sandbox_commerce_v1.test_store_v3_capture_identity for each statement execute function sandbox_commerce_v1.test_store_v3_immutable();
reset role;
`;
if(process.argv[2]==='--write')fs.writeFileSync(path.join(here,'identity.sql'),identity);
else {assert.equal(process.argv[2],'--check');assert.equal(fs.readFileSync(path.join(here,'identity.sql'),'utf8'),identity);}
const index=modules.findIndex(v=>v.path===prefix+'admission.sql');
modules.splice(index,0,{path:prefix+'identity.sql',sha256:sha(identity),origin:'generated-install-witness'});
const candidateFiles=Object.fromEntries(fs.readdirSync(here).sort().filter(name=>!['source-manifest.json','retained-source-manifest.json'].includes(name)&&fs.statSync(path.join(here,name)).isFile()).map(name=>[prefix+name,sha(fs.readFileSync(path.join(here,name)))]));
const manifest={protocol:'scpv-capture-composed-source-profile-v1',status:'source-candidate-awaiting-local-qualification',freshInactiveInstallOnly:true,deploymentAuthorized:false,
 baseline:original.baseline,consumerBinding:'sandbox-commerce-v1:protocol-3:capture-composed-v1',installationSourceSha256:sourceSha256,witnessPreimage:preimage,
 orderedModules:modules.map((value,index)=>({position:index+1,...value})),candidateFiles,
 qualifications:[],limitations:['No target reservation, provider action, deployment or live-money activation.','Actual local combined SQL/Auth/HTTP qualification is pending.','Provider/native/origin facts remain synthetic until separately qualified.']};
if(process.argv[2]==='--write')fs.writeFileSync(path.join(here,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
else {
 const saved=JSON.parse(fs.readFileSync(path.join(here,'source-manifest.json'),'utf8'));
 assert.deepEqual(saved.orderedModules,manifest.orderedModules);assert.deepEqual(saved.candidateFiles,manifest.candidateFiles);assert.equal(saved.installationSourceSha256,sourceSha256);
}
console.log(JSON.stringify({orderedModules:modules.length,unique: new Set(modules.map(m=>m.path)).size,installationSourceSha256:sourceSha256,identitySha256:sha(identity)}));
