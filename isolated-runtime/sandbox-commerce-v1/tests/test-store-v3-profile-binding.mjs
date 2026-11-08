// Bind the local native fixture to executable SQL, independently of packaging
// notes and later qualification records. This grants no installation authority.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const installationSourceSha256='09c284aa0b56536f6975ef3debb86d1b29f157f04c3b1a1593fec8e7b8d5e563';
const identityPath='isolated-runtime/sandbox-commerce-v1/candidates/paid-video-capture-composed/identity.sql';
const identitySha256='894b788aa5a982934952d851020f67423c96c755f59007862ddb524a15c10f62';
const baseline={
 commit:'12335a768fb683267ac281b1a180f9650479a98d',
 remoteCommit:'0d1d3b3a959295dfc44a6485ab8f7067d933bb43',
 tree:'5e9b8f86792c2fab606ed216037aec916f094b7c',
 referenceManifestSha256:'f3b28f88a28e8024c100b999e7cbc7569e60507838a4ffa0f8a7856a8f9d6959',
};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

export function verifyFreshCaptureProfile(profile,executionPaths,readSource){
 assert.equal(profile.protocol,'scpv-capture-composed-source-profile-v1');
 assert.equal(profile.freshInactiveInstallOnly,true);
 assert.equal(profile.deploymentAuthorized,false);
 assert.equal(profile.consumerBinding,'sandbox-commerce-v1:protocol-3:capture-composed-v1');
 assert.deepEqual(profile.baseline,baseline);
 assert.equal(profile.installationSourceSha256,installationSourceSha256);
 assert.equal(executionPaths.length,42);
 assert.ok(Array.isArray(profile.orderedModules));
 assert.deepEqual(profile.orderedModules.map(entry=>entry.path),executionPaths,'Manifest order must match the actual installation order');
 for(const [index,entry] of profile.orderedModules.entries()){
  assert.equal(entry.position,index+1);
  assert.match(entry.sha256,/^[a-f0-9]{64}$/u);
 }
 const identities=profile.orderedModules.filter(entry=>entry.path===identityPath);
 assert.equal(identities.length,1);
 assert.equal(identities[0].position,23,'Generated identity must retain its exact installation position');
 // The identity includes the installation digest and therefore is excluded
 // from its own preimage. Pin its complete bytes separately.
 assert.equal(identities[0].sha256,identitySha256);
 const preimage={protocol:'scpv-capture-install-source-preimage-v1',
  orderedModules:profile.orderedModules.filter(entry=>entry.path!==identityPath).map(({path,sha256})=>({path,sha256}))};
 assert.deepEqual(profile.witnessPreimage,preimage,'Witness must describe every executed SQL position except the generated identity');
 assert.equal(sha256(JSON.stringify(preimage)),installationSourceSha256,'Executable SQL profile has changed');
 for(const entry of profile.orderedModules){
  assert.equal(sha256(readSource(entry.path)),entry.sha256,`Source bytes changed: ${entry.path}`);
 }
 return {installationSourceSha256,moduleCount:profile.orderedModules.length,identitySha256};
}
