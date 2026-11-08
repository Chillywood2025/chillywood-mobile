#!/usr/bin/env node
// Actual local workerd/Miniflare R2 operations. The private bucket and authority
// are synthetic fixtures; this is explicitly not Cloudflare provider proof.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
assert.equal(process.argv.length, 4, 'Use --runtime /absolute/private/runtime-directory'); assert.equal(process.argv[2], '--runtime');
const runtime = process.argv[3]; assert.ok(path.isAbsolute(runtime));
const require = createRequire(path.join(runtime, 'package.json')), { Miniflare } = require('miniflare');
const miniflarePackage = JSON.parse(await fs.readFile(path.join(runtime, 'node_modules/miniflare/package.json'), 'utf8'));
assert.equal(miniflarePackage.version, '4.20260730.0');
const workerd = require('workerd');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const source = await fs.readFile(new URL('./r2-native.mjs', import.meta.url), 'utf8');
const harnessSource = await fs.readFile(new URL(import.meta.url));
const work = await fs.mkdtemp('/tmp/scpv-r2-native-'); await fs.chmod(work, 0o700);
const resourceId = 'scv1_resource_' + randomUUID(), incarnation = randomUUID(), routeId = randomUUID();
const bytes = Buffer.alloc(1024 * 1024, 7), object = { provider: 'cloudflare_r2', bucket: 'synthetic-paid-video-r2', routeId,
  objectKey: `sandbox-commerce-v1/${randomUUID()}/${resourceId}/scv1_asset_${randomUUID()}/${incarnation}.mp4`,
  incarnation, expectedSha256: hash(bytes), expectedByteLength: bytes.length };
const actor = { userId: randomUUID(), sessionGeneration: randomUUID() }, grantId = 'scv1_grant_' + randomUUID();
const lostIncarnation = randomUUID(), lostObject = { ...object, incarnation: lostIncarnation,
  objectKey: object.objectKey.replace(incarnation + '.mp4', lostIncarnation + '.mp4') };
const fixture = `import {createPrivateR2NativeTransport,deliverBoundedR2Range} from './r2-native.mjs';
const primarySpec=${JSON.stringify(object)},lostSpec=${JSON.stringify(lostObject)},actor=${JSON.stringify(actor)},resourceId=${JSON.stringify(resourceId)},grantId=${JSON.stringify(grantId)};
const bytes=new Uint8Array(1048576).fill(7);
const sha=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(n=>n.toString(16).padStart(2,'0')).join('');
export default {async fetch(request,env){
 const input=await request.json();const spec=input.lane==='lost'?lostSpec:primarySpec;let calls=0,gets=0,puts=0;
 const binding={get:async(...args)=>{gets++;if(input.action==='replace_during_read')await env.MEDIA.put(spec.objectKey,bytes,{httpMetadata:{contentType:'video/mp4'}});return env.MEDIA.get(...args);},
 put:async(...args)=>{puts++;const result=await env.MEDIA.put(...args);if(input.action==='lost_ack')throw Error('synthetic_lost_ack');return result;}};
 const transport=createPrivateR2NativeTransport({binding,bucket:spec.bucket,routeId:spec.routeId});
 const target={...spec,...(input.identity?{identity:input.identity}:{})};
 if(input.action==='wrong_route')target.routeId='00000000-0000-4000-8000-000000000001';
 if(input.action==='wrong_hash')target.expectedSha256='0'.repeat(64);
 try {
  if(input.action==='create'||input.action==='lost_ack'){
   const value=await transport.writeOnce(target,bytes,Date.now()+4000);return Response.json({value,gets,puts});
  }
  if(input.action==='scan'||input.action==='wrong_hash'){
   const value=await transport.readForScan(target,Date.now()+4000);return Response.json({identity:value.identity,sha256:await sha(value.bytes),byteLength:value.bytes.length,gets,puts});
  }
  const authorize=async()=>{
   calls++;if(input.action==='pre_hold'||(input.action==='post_hold'&&calls===2))throw Error('synthetic_current_test_store_hold');
   return {protocol:input.action==='wrong_protocol'?'scpv-current-access-v3':'scpv-current-access-r2-v1',actor,resourceId,grantId,
    receiptId:'scv1_receipt_00000000-0000-4000-8000-000000000001',originalTransactionId:'synthetic-original',customerId:input.action==='customer_changed'&&calls===2?'other':'synthetic-customer',
    projectId:'synthetic-project',validUntilMs:Date.now()+(input.action==='expired'?-1:4000),object:target};
  };
  const response=await deliverBoundedR2Range({actor,resourceId,grantId,rangeHeader:input.range??null,authorize,transport});
  const result=new Uint8Array(await response.arrayBuffer());return Response.json({status:response.status,byteLength:result.length,sha256:await sha(result),headers:Object.fromEntries(response.headers),calls,gets,puts});
 }catch(error){return Response.json({error:error.message,calls,gets,puts},{status:409});}
}};`;
const mf = new Miniflare({ modules: [
  { type: 'ESModule', path: path.join(work, 'fixture.mjs'), contents: fixture },
  { type: 'ESModule', path: path.join(work, 'r2-native.mjs'), contents: source },
], modulesRoot: work, compatibilityDate: '2026-07-30', host: '127.0.0.1', port: 0,
cf: false, r2Buckets: { MEDIA: object.bucket }, r2Persist: path.join(work, 'r2'),
outboundService: () => { throw Error('External network is disabled in this local fixture'); } });
const invoke = async fields => {
  const response = await mf.dispatchFetch('http://fixture.invalid/', { method: 'POST', body: JSON.stringify(fields), headers: { 'content-type': 'application/json' } });
  return { status: response.status, body: await response.json() };
};
const cases = []; let report, disposed = false;
try {
  const created = await invoke({ action: 'create' }); assert.equal(created.status, 200); assert.equal(created.body.value.state, 'acknowledged');
  const identity = created.body.value.identity; assert.equal(identity.kind, 'r2-native-upload-v1'); assert.ok(identity.nativeVersion); assert.ok(identity.etag);
  const duplicate = await invoke({ action: 'create' }); assert.equal(duplicate.body.value.state, 'exists_unverified');
  const scanned = await invoke({ action: 'scan' }); assert.equal(scanned.status, 200, JSON.stringify(scanned.body));
  assert.equal(scanned.body.sha256, object.expectedSha256); assert.equal(scanned.body.byteLength, bytes.length);
  assert.deepEqual(scanned.body.identity, identity);
  cases.push('Real local R2 conditional create rejects duplicate; full-body SHA256 readback binds actual returned native upload identity.');
  const range = await invoke({ action: 'range', identity }); assert.equal(range.status, 200, JSON.stringify(range.body));
  assert.equal(range.body.status, 206); assert.equal(range.body.byteLength, 512 * 1024); assert.equal(range.body.sha256, hash(bytes.subarray(0, 512 * 1024)));
  assert.equal(range.body.calls, 2); assert.equal(range.body.gets, 1); assert.match(range.body.headers['cache-control'], /no-store/u);
  cases.push('Actual workerd range operation emits at most512KiB only after both current-authorization calls, with private no-store headers.');
  for (const [action, expected, gets, calls] of [
    ['wrong_route', /route_mismatch/u, 0, 1], ['wrong_protocol', /current_access_required/u, 0, 1],
    ['expired', /current_access_required/u, 0, 1], ['pre_hold', /current_test_store_hold/u, 0, 1],
    ['post_hold', /current_test_store_hold/u, 1, 2], ['customer_changed', /authority_changed/u, 1, 2],
  ]) {
    const value = await invoke({ action, identity }); assert.equal(value.status, 409, action); assert.match(value.body.error, expected, action);
    assert.equal(value.body.gets, gets, action); assert.equal(value.body.calls, calls, action);
  }
  const badVersion = await invoke({ action: 'range', identity: { ...identity, nativeVersion: 'different-native-upload' } });
  assert.equal(badVersion.status, 409); assert.match(badVersion.body.error, /upload_changed/u);
  const badHash = await invoke({ action: 'wrong_hash' }); assert.equal(badHash.status, 409); assert.match(badHash.body.error, /bytes_mismatch/u);
  const multi = await invoke({ action: 'range', identity, range: 'bytes=0-1,3-4' }); assert.equal(multi.status, 409); assert.match(multi.body.error, /range_invalid/u); assert.equal(multi.body.gets, 0);
  cases.push('Wrong route/protocol/version, expired authority, current pre/post holds, changed customer, wrong full hash and multi-range all fail closed.');
  const replaced = await invoke({ action: 'replace_during_read', identity }); assert.equal(replaced.status, 409); assert.match(replaced.body.error, /upload_changed/u);
  const nowObject = await (await mf.getR2Bucket('MEDIA')).head(object.objectKey);
  assert.notEqual(nowObject.version, identity.nativeVersion); assert.equal(nowObject.etag, identity.etag);
  cases.push('Actual same-byte replacement keeps ETag but changes native upload version; returned-body identity blocks stale range delivery.');
  // A new disposable local incarnation only; no existing or remote object reuse.
  const lost = await invoke({ action: 'lost_ack', lane: 'lost' }); assert.equal(lost.body.value.state, 'unknown');
  const retry = await invoke({ action: 'create', lane: 'lost' }); assert.equal(retry.body.value.state, 'exists_unverified');
  assert.equal((await invoke({ action: 'scan', lane: 'lost' })).body.sha256, object.expectedSha256);
  cases.push('Actual local commit followed by lost acknowledgment remains unknown; another conditional write cannot overwrite it.');
  assert.equal(hash(await fs.readFile(new URL('./r2-native.mjs', import.meta.url))), hash(source), 'Source changed during qualification');
  assert.equal(hash(await fs.readFile(new URL(import.meta.url))), hash(harnessSource), 'Harness changed during qualification');
  report = { status: 'passed', cases, sourceSha256: hash(source), harnessSha256: hash(harnessSource),
    miniflare: miniflarePackage.version, workerd: workerd.version, workerdExecutableSha256: hash(await fs.readFile(workerd.default)),
    providerQualification: false, currentSqlContractChanged: false,
    scope: 'Actual local Miniflare/workerd R2 binding and bytes; authority responses are synthetic controls. No Cloudflare account, bucket, credentials, tunnel, deployment or actual provider qualification.' };
} finally { await mf.dispose(); disposed = true; await fs.rm(work, { recursive: true }); }
process.stdout.write(JSON.stringify({ ...report, cleanup: { runtimeDisposed: disposed, privateFixtureDirectoryRemoved: true } }, null, 2) + '\n');
