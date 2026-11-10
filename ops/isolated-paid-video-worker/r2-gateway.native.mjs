#!/usr/bin/env node
// Actual local workerd R2 operations. Authority/journal controls here are test
// doubles; durable PostgreSQL proof is separate. This is not provider proof.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import { signR2GatewayToken, signR2Raw } from './r2-protocol.mjs';

assert.ok([4, 5].includes(process.argv.length)); assert.equal(process.argv[2], '--runtime');
if (process.argv.length === 5) assert.equal(process.argv[4], '--maximum');
assert.ok(path.isAbsolute(process.argv[3]));
const runtime = process.argv[3], require = createRequire(path.join(runtime, 'package.json'));
const { Miniflare } = require('miniflare'), workerd = require('workerd');
const version = JSON.parse(await fs.readFile(path.join(runtime, 'node_modules/miniflare/package.json'), 'utf8')).version;
assert.equal(version, '4.20260730.0');
const work = await fs.mkdtemp('/tmp/scpv-r2-gateway-'); await fs.chmod(work, 0o700);
const origin = 'https://fixture.invalid', key = new Uint8Array(32).fill(51), routeId = randomUUID(), profileId = randomUUID(), keyId = randomUUID();
const userId = randomUUID(), sessionGeneration = randomUUID(), qualificationSha256 = 'a'.repeat(64), bytes = new Uint8Array(process.argv[4] === '--maximum' ? 16777216 : 1024).fill(7);
const sha = value => createHash('sha256').update(value).digest('hex');
const newToken = (operation = 'upload') => {
  const resourceId = 'scv1_resource_' + randomUUID(), incarnation = randomUUID(), now = Date.now();
  return { protocol: 'scpv-r2-gateway-token-v1', operation, keyId, profileId, qualificationSha256, bindingId: randomUUID(),
    uploadId: 'scpv_upload_' + randomUUID(), resourceId, requestId: randomUUID(), configurationDigest: 'b'.repeat(64),
    subject: { kind: 'session', userId, sessionGeneration }, object: { provider: 'cloudflare_r2', bucket: 'private-local-r2', routeId,
      objectKey: `sandbox-commerce-v1/${userId}/${resourceId}/scv1_asset_${randomUUID()}/${incarnation}.mp4`, incarnation,
      expectedSha256: sha(bytes), expectedByteLength: bytes.length }, range: null, grantId: null, issuedAtMs: now, expiresAtMs: now + 4500 };
};
const fixture = `import {createPrivateR2Gateway} from './r2-gateway.mjs';
import {createR2IsolateAdmission} from './r2-admission.mjs';
const admission=createR2IsolateAdmission();
const journal=new Map(), key=new Uint8Array(32).fill(51), origin=${JSON.stringify(origin)};
export default { async fetch(request,env,ctx) {
 const url=new URL(request.url), mode=request.headers.get('x-fixture-mode')||'';
 if(url.pathname==='/fixture-state') {const t=await request.json();const v=journal.get(t.bindingId);return Response.json(v||null);}
 if(url.pathname==='/fixture-replace') {const t=await request.json();await env.MEDIA.put(t.object.objectKey,new Uint8Array(${bytes.length}).fill(t.different?8:7),{httpMetadata:{contentType:'video/mp4'}});return Response.json({ok:true});}
 const binding={get:async(...args)=>{if(mode==='replace-during-read')await env.MEDIA.put(args[0],new Uint8Array(${bytes.length}).fill(7),{httpMetadata:{contentType:'video/mp4'}});return env.MEDIA.get(...args);},
 put:(...args)=>{const pending=(async()=>{if(mode==='late-put')await new Promise(r=>setTimeout(r,${bytes.length > 1024 ? 6000 : 1500}));const result=await env.MEDIA.put(...args);if(mode==='lost-put')throw Error('lost');return result;})();ctx.waitUntil(pending.catch(()=>{}));return pending;}};
 const authorize=async(token,{phase,outcome})=>{
  if(token.subject.kind==='session'&&(token.subject.userId!==${JSON.stringify(userId)}||token.subject.sessionGeneration!==${JSON.stringify(sessionGeneration)}))throw Error('actor');
  if(mode==='hold-before'||(mode==='hold-after'&&phase==='after'))throw Error('held');
  if(phase==='commit') {if(mode==='lost-commit')throw Error('lost');const current=journal.get(token.bindingId);if(!current||current.state!=='started')throw Error('state');journal.set(token.bindingId,{...current,...outcome});return {protocol:'scpv-r2-commit-v1',state:outcome.state,bindingId:token.bindingId};}
  let dispatchAllowed=false;
  if(token.operation==='upload'&&phase==='before'){if(!journal.has(token.bindingId)){journal.set(token.bindingId,{state:'started'});dispatchAllowed=true;}if(mode==='lost-claim')throw Error('lost');}
  else if(!journal.get(token.bindingId)?.identity||JSON.stringify(journal.get(token.bindingId).identity)!==JSON.stringify(token.object.identity))throw Error('unaccepted');
  return {protocol:'scpv-r2-authority-v1',bindingId:token.bindingId,profileId:token.profileId,qualificationSha256:token.qualificationSha256,
   object:token.object,authorityDigest:mode==='changed-authority'&&phase==='after'?'c'.repeat(64):'d'.repeat(64),validUntilMs:Math.min(token.expiresAtMs,Date.now()+4000),dispatchAllowed};
 };
 const gateway=createPrivateR2Gateway({enabled:mode!=='disabled',origin,binding,admission,bucket:'private-local-r2',routeId:${JSON.stringify(routeId)},profileId:${JSON.stringify(profileId)},
  qualificationSha256:${JSON.stringify(qualificationSha256)},keyId:${JSON.stringify(keyId)},gatewayKey:key,
  verifierId:${JSON.stringify(randomUUID())},verifierKey:new Uint8Array(32).fill(52),authorize});
 return gateway(request);
}};`;
const moduleNames = ['r2-native.mjs', 'r2-protocol.mjs', 'r2-gateway.mjs', 'r2-admission.mjs'];
const modules = await Promise.all(moduleNames.map(async name => ({ type: 'ESModule', path: path.join(work, name), contents: await fs.readFile(new URL(name, import.meta.url), 'utf8') })));
const mf = new Miniflare({ modules: [{ type: 'ESModule', path: path.join(work, 'fixture.mjs'), contents: fixture }, ...modules], modulesRoot: work,
  compatibilityDate: '2026-07-30', host: '127.0.0.1', port: 0, cf: false, r2Buckets: { MEDIA: 'private-local-r2' }, r2Persist: path.join(work, 'r2'),
  outboundService: () => { throw Error('External network forbidden'); } });
const state = async token => (await mf.dispatchFetch(origin + '/fixture-state', { method: 'POST', body: JSON.stringify(token) })).json();
const invoke = async (token, mode = '', overrides = {}) => {
  const raw = JSON.stringify(token), signature = await signR2Raw(raw, key);
  const response = await mf.dispatchFetch(`${origin}/scpv-r2-gateway-v1/${token.operation}/${token.bindingId}`, {
    method: token.operation === 'upload' ? 'PUT' : 'GET', body: token.operation === 'upload' ? bytes : undefined,
    headers: { 'x-chillywood-r2-token': raw, authorization: 'R2-HMAC ' + signature, 'x-fixture-mode': mode,
      ...(token.operation === 'upload' ? { 'content-type': 'video/mp4', 'content-length': String(bytes.length) } : {}), ...overrides },
  });
  return new Response(await response.arrayBuffer(), { status: response.status, headers: response.headers });
};
const refresh = token => ({ ...token, issuedAtMs: Date.now(), expiresAtMs: Date.now() + 4500 });
const accepted = async token => ({ ...refresh(token), operation: 'probe', object: { ...token.object, identity: (await state(token)).identity } });
const cases = [];
try {
  const upload = newToken(); await signR2GatewayToken(upload, key);
  const create = await invoke(upload); assert.equal(create.status, 200); assert.equal((await create.json()).state, 'acknowledged');
  const stored = await state(upload); assert.equal(stored.identity.kind, 'r2-native-upload-v1');
  const probe = await accepted(upload); const observed = await invoke(probe); assert.equal(observed.status, 200);
  assert.equal(JSON.parse((await observed.json()).observationRaw).sha256, sha(bytes));
  const range = { ...probe, operation: 'range', grantId: randomUUID(), range: { start: 3, end: 97 } };
  const delivered = await invoke(range); assert.equal(delivered.status, 206); assert.equal(sha(new Uint8Array(await delivered.arrayBuffer())), sha(bytes.slice(3, 98)));
  const maximumRange = { ...range, range: { start: 0, end: Math.min(524288, bytes.length) - 1 } };
  const simultaneousRanges = await Promise.all([invoke(maximumRange), invoke(maximumRange)]);
  for (const response of simultaneousRanges) { assert.equal(response.status, 206); assert.equal((await response.arrayBuffer()).byteLength, maximumRange.range.end + 1); }
  cases.push('Authenticated exact-route conditional PUT, accepted upload identity, full-byte probe, bounded actual R2 range.');
  for (const mode of ['disabled', 'hold-before', 'hold-after', 'changed-authority']) assert.equal((await invoke(range, mode)).status, 503, mode);
  for (const changed of [
    { ...range, subject: { ...range.subject, sessionGeneration: randomUUID() } },
    { ...range, subject: { ...range.subject, userId: randomUUID() } },
    { ...range, object: { ...range.object, objectVersion: 'forbidden' } },
    { ...range, object: { ...range.object, routeId: randomUUID() } },
    { ...range, profileId: randomUUID() }, { ...range, qualificationSha256: '0'.repeat(64) },
    { ...range, operation: 'probe', range: range.range }, { ...range, expiresAtMs: Date.now() - 1 },
    { ...range, issuedAtMs: Date.now() + 1e4, expiresAtMs: Date.now() + 11000 },
    { ...range, object: { ...range.object, identity: { ...range.object.identity, nativeVersion: 'unaccepted' } } },
  ]) assert.equal((await invoke(changed)).status, 503);
  assert.equal((await invoke(range, '', { range: 'bytes=1-2' })).status, 503);
  assert.equal((await invoke(range, '', { authorization: 'R2-HMAC ' + '0'.repeat(64) })).status, 503);
  assert.equal((await invoke(refresh(upload))).status, 503);
  cases.push('Wrong actor/session/profile/qualification/route/operation/expiry/signature, mixed S3 identity, duplicate dispatch and pre/post revocation all deny.');
  const race = newToken(), racing = await Promise.all([invoke(race), invoke(race)]);
  assert.deepEqual(racing.map(r => r.status).sort(), [200, 503]);
  for (const mode of ['lost-claim', 'lost-put', 'lost-commit']) {
    const token = newToken(), result = await invoke(token, mode); assert.equal(result.status, mode === 'lost-put' ? 200 : 503);
    assert.equal((await result.json()).state, 'unknown');
    assert.equal((await invoke(refresh(token))).status, 503);
    assert.ok(!(await state(token)).identity);
  }
  const late = newToken(); late.expiresAtMs = late.issuedAtMs + (bytes.length > 1024 ? 4500 : 500);
  const bucket = await mf.getR2Bucket('MEDIA'), pending = invoke(late, 'late-put');
  for (let check = 0; check < 40 && !(await state(late)); check++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal((await state(late)).state, 'started');
  // Negative read while PUT is in flight, followed by a late real commit.
  assert.equal(await bucket.head(late.object.objectKey), null);
  assert.equal((await pending).status, 503);
  const duringLate = newToken();
  // An early capacity denial intentionally does not consume the16MiB body.
  // The local HTTP stack may reset that still-writing connection instead of
  // delivering its503. Either is a denial, never evidence to retry this PUT.
  const deniedDuringLate = await invoke(duringLate).then(response => response.status, error => {
    assert.equal(error.cause?.code, 'ECONNRESET'); return 503;
  });
  assert.equal(deniedDuringLate, 503);
  assert.equal(await state(duringLate), null, 'Capacity denial must precede durable dispatch claim');
  await new Promise(resolve => setTimeout(resolve, bytes.length > 1024 ? 6500 : 1700)); assert.ok(await bucket.head(late.object.objectKey));
  assert.equal((await invoke(refresh(late))).status, 503); assert.ok(!(await state(late)).identity);
  cases.push('Concurrent dispatch has one winner; lost claim/PUT/commit and late completion never re-dispatch or discover an accepted identity. Aggregate admission remains held by uncancelled late PUT and denies before a new claim.');
  const before = (await state(upload)).identity;
  assert.equal((await invoke(refresh(range), 'replace-during-read')).status, 503);
  const same = await bucket.head(upload.object.objectKey); assert.equal(same.etag, before.etag); assert.notEqual(same.version, before.nativeVersion);
  const second = newToken(); assert.equal((await invoke(second)).status, 200); const secondProbe = await accepted(second);
  await mf.dispatchFetch(origin + '/fixture-replace', { method: 'POST', body: JSON.stringify({ ...second, different: true }) });
  assert.equal((await invoke(refresh(secondProbe))).status, 503);
  cases.push('Actual same-byte and different-byte replacement, including replacement during GET, cannot substitute bytes.');
  for (const module of modules) assert.equal(sha(await fs.readFile(new URL(path.basename(module.path), import.meta.url))), sha(module.contents));
  process.stdout.write(JSON.stringify({ status: 'passed', cases, testedByteLength: bytes.length, miniflare: version, workerd: workerd.version,
    sourceSha256: Object.fromEntries(modules.map(m => [path.basename(m.path), sha(m.contents)])),
    providerQualification: false, durablePostgresProof: false, scope: 'Actual local workerd R2, synthetic authority/journal; no provider deployment or mutation.' }, null, 2) + '\n');
} finally { await mf.dispose(); await fs.rm(work, { recursive: true }); }
