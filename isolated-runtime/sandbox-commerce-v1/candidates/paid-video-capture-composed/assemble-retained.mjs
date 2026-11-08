// Explicit dependency reuse, never catch a CREATE collision and continue.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../../..');
const sha=value=>createHash('sha256').update(value).digest('hex');
const prefix='isolated-runtime/sandbox-commerce-v1/candidates/paid-video-capture-composed/';
const bootstrap=JSON.parse(fs.readFileSync(path.join(here,'source-manifest.json'),'utf8'));
const contract=JSON.parse(fs.readFileSync(path.join(here,'capture-owned-contract.json'),'utf8'));
assert.equal(contract.protocol,'rcq-owned-dependency-contract-v1');assert.equal(contract.relations.length,7);assert.equal(contract.functions.length,16);
const query=fs.readFileSync(path.join(here,'capture-contract-query.sql'),'utf8').trimEnd().replace(/;$/u,'');
const encoded=Buffer.from(JSON.stringify(contract)).toString('base64');
const dependency=`-- Explicit RETAINED dependency mode; no capture CREATE, reset or promotion.
-- Only newly owned capture metadata is read. Capture phase, evidence and rows
-- are neither selected nor mutated; active and populated sealed capture remain.
do $owned_capture_dependency$
declare observed jsonb; previous_path text:=current_setting('search_path');
begin
 if current_setting('server_version_num')::integer not between 170000 and 179999
 then raise exception 'capture_dependency_pg17_required'; end if;
 perform set_config('search_path','',true);
 observed := (${query});
 if observed is distinct from convert_from(decode('${encoded}','base64'),'UTF8')::jsonb
 then raise exception 'capture_owned_dependency_contract_mismatch' using errcode='42501'; end if;
 if exists(select 1 from pg_auth_members m join pg_roles owner_role on owner_role.oid=m.roleid
  join pg_roles member_role on member_role.oid=m.member where owner_role.rolname='rcq_v1_owner'
   and(member_role.rolname<>'postgres' or m.inherit_option or m.set_option))
 then raise exception 'capture_owned_dependency_owner_membership' using errcode='42501'; end if;
 perform set_config('search_path',previous_path,true);
end; $owned_capture_dependency$;
`;
assert.equal(bootstrap.orderedModules[0].path,'isolated-runtime/test-store-capture-v1/capture.sql');
const modules=bootstrap.orderedModules.slice(1).filter(v=>v.path!==prefix+'identity.sql').map(({position,...entry})=>entry);
modules.unshift({path:prefix+'capture-dependency.sql',sha256:sha(dependency),origin:'owned-retained-dependency-verifier'});
const preimage={protocol:'scpv-retained-capture-source-preimage-v1',requiredCaptureSource:bootstrap.orderedModules[0],orderedModules:modules.map(({path,sha256})=>({path,sha256}))};
const sourceSha256=sha(JSON.stringify(preimage));
const oldIdentity=fs.readFileSync(path.join(here,'identity.sql'),'utf8');
assert.equal(oldIdentity.split(bootstrap.installationSourceSha256).length,2);
const identity=oldIdentity.replace(bootstrap.installationSourceSha256,sourceSha256);
modules.splice(modules.findIndex(v=>v.path===prefix+'admission.sql'),0,{path:prefix+'retained-identity.sql',sha256:sha(identity),origin:'generated-retained-install-witness'});
for(const item of modules){
 if([prefix+'capture-dependency.sql',prefix+'retained-identity.sql'].includes(item.path))continue;
 const source=item.origin==='selected-published-baseline'
  ?execFileSync('git',['show',bootstrap.baseline.tree+':'+item.path],{cwd:repo})
  :fs.readFileSync(path.join(repo,item.path));
 assert.equal(sha(source),item.sha256,'Retained assembly input changed: '+item.path);
}
const manifest={protocol:'scpv-retained-capture-install-profile-v1',status:'source-candidate-awaiting-local-qualification',mode:'explicit-retained-capture-dependency',fallbackAllowed:false,deploymentAuthorized:false,
 baseline:bootstrap.baseline,requiredCaptureSource:bootstrap.orderedModules[0],consumerBinding:bootstrap.consumerBinding,installationSourceSha256:sourceSha256,witnessPreimage:preimage,
 ownedDependencyQuerySha256:sha(query),ownedDependencyContractSha256:sha(JSON.stringify(contract)),executedModules:modules.map((item,index)=>({position:index+1,...item})),
 preserved:['capture phase','encrypted evidence','seal','reservations','operator configuration'],
 limitations:['No target verification or external mutation performed.','Only newly owned capture object metadata is verified; no legacy metadata operation.','Populated/sealed full commerce composition must be qualified separately.']};
if(process.argv[2]==='--write'){
 fs.writeFileSync(path.join(here,'capture-dependency.sql'),dependency);fs.writeFileSync(path.join(here,'retained-identity.sql'),identity);
 fs.writeFileSync(path.join(here,'retained-source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
}else{
 assert.equal(process.argv[2],'--check');assert.equal(fs.readFileSync(path.join(here,'capture-dependency.sql'),'utf8'),dependency);
 assert.equal(fs.readFileSync(path.join(here,'retained-identity.sql'),'utf8'),identity);
 const saved=JSON.parse(fs.readFileSync(path.join(here,'retained-source-manifest.json'),'utf8'));
 assert.deepEqual(saved,manifest);
}
console.log(JSON.stringify({executedModules:modules.length,installationSourceSha256:sourceSha256,dependencySha256:sha(dependency),identitySha256:sha(identity)}));
