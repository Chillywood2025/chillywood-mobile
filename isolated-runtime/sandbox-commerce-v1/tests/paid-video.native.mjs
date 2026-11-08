#!/usr/bin/env node
// Real additive SQL + real local byte scan. Shared source is read from immutable
// v1 commit; no existing harness/source is rewritten and no remote DB is accepted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { runBounded, signScanResult } from '../../../ops/isolated-paid-video-worker/scan.mjs';
import { executeScanTicket } from '../../../ops/isolated-paid-video-worker/job.mjs';

assert.equal(process.argv.length, 8, 'Use --local-bin /absolute/pg17/bin --database /absolute/private/clamdb --certificates /absolute/trusted/certs');
assert.equal(process.argv[2], '--local-bin'); assert.equal(process.argv[4], '--database'); assert.equal(process.argv[6], '--certificates');
const bin = process.argv[3], databaseDirectory = process.argv[5], certificateDirectory = process.argv[7];
for (const item of [bin, databaseDirectory, certificateDirectory]) assert.ok(path.isAbsolute(item));
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../../..');
const baseline = 'a4396fc787cb3b1656f59559854ab18a9b96c9da';
const baselineTree = 'b055c3931cf4f53275e0f95f740b64d34bef9b12';
const baselineIdentity = spawnSync('git', ['rev-parse', '--verify', `${baseline}^{tree}`], {cwd: root, encoding: 'utf8'});
assert.equal(baselineIdentity.status, 0, 'Published V1 source must be available in the checkout');
assert.equal(baselineIdentity.stdout.trim(), baselineTree, 'Published V1 source tree changed');
const digest = value => createHash('sha256').update(value).digest('hex');
const sourceHashes = {}, fixtureHashes = {};
const frozen = file => {
  const result = spawnSync('git', ['show', `${baseline}:isolated-runtime/sandbox-commerce-v1/${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  (file.startsWith('tests/') ? fixtureHashes : sourceHashes)[file] = digest(result.stdout); return result.stdout;
};
const local = file => { const text = fs.readFileSync(path.join(here, '..', file), 'utf8'); sourceHashes[file] = digest(text); return text; };
const core = frozen('core.sql'), premiumFixture = frozen('tests/premium-authority.fixture.sql');
const declaration = 'create table sandbox_commerce_v1.declarations(user_id uuid primary key,session_id uuid,\n'
  + ' declared_18_plus boolean,country_code text,region_code text,declaration_version text,updated_at timestamptz);';
const authorityFixture = frozen('tests/authority.fixture.sql'); assert.equal(authorityFixture.split(declaration).length, 2);
const install = 'begin;create role anon nologin;create role authenticated nologin;create role service_role nologin;'
  + 'alter default privileges for role postgres grant execute on functions to authenticated;'
  + core + premiumFixture + authorityFixture.replace(declaration, '-- Real core declarations table.')
  + frozen('premium-authority.sql') + frozen('authority.sql') + frozen('resource-graphs.sql')
  + local('paid-video-media.sql') + local('paid-video-upload.sql') + local('paid-video-commands.sql') + frozen('permissions-finalize.sql') + 'commit;';
const work = fs.mkdtempSync('/tmp/scpv-native-'); fs.chmodSync(work, 0o700);
const socket = path.join(work, 'socket'); fs.mkdirSync(socket, { mode: 0o700 });
const data = path.join(work, 'data'), port = '55472', db = 'paidvideo_' + randomUUID().replaceAll('-', '');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
const args = database => ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-U', 'postgres', '-d', database];
const run = (tool, a, input) => spawnSync(path.join(bin, tool), a, { input, encoding: 'utf8', env, timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
const invoke = (tool, a, input) => { const r = run(tool, a, input); assert.equal(r.status, 0, `${r.stderr}\n${r.error?.message ?? ''}`); return r.stdout.trim(); };
const q = sql => invoke('psql', args(db), sql), lit = value => "'" + String(value).replaceAll("'", "''") + "'";
const parse = sql => JSON.parse(q(sql));
const reject = (sql, pattern) => { const r = run('psql', args(db), sql); assert.notEqual(r.status, 0); assert.match(r.stderr, pattern); };
const creator = '11111111-1111-4111-8111-111111111111', sid = '22222222-2222-4222-8222-222222222222';
const buyer = '66666666-6666-4666-8666-666666666666', buyerSid = '77777777-7777-4777-8777-777777777777';
const payload = fields => ({ protocol: 'isolated-paid-video-v1', requestId: randomUUID(), ...fields });
const sql = (command, p, user = creator, session = sid, expectedSession = session) => `set role authenticated;set request.jwt.claims=${lit(JSON.stringify({ role: 'authenticated', sub: user, session_id: session }))};`
  + `select public.isolated_paid_video_v1(${lit(command)},${lit(JSON.stringify(p))},'${user}','${expectedSession}');`;
const captures = [], call = (command, p, user, session) => { const response = parse(sql(command, p, user, session)); captures.push({ command, payload: p, response }); return response; };
const worker = (action, upload = null, workerId = null, raw = null, signature = null) => 'set role service_role;select public.isolated_paid_video_worker_v1('
  + [action, upload, workerId, raw, signature].map(x => x === null ? 'null' : lit(x)).join(',') + ');';
let initialized = false, initializeAttempted = false, started = false, startAttempted = false, report;
const cases = [], cleanup = { clusterStopped: false, notRunningVerified: false, directoryRemoved: false };
try {
  const engine = invoke('postgres', ['--version']); assert.match(engine, /PostgreSQL\) 17\.6/u);
  initializeAttempted = true; invoke('initdb', ['-D', data, '-U', 'postgres', '--encoding=UTF8', '--no-locale', '--auth=trust']); initialized = true;
  startAttempted = true; invoke('pg_ctl', ['-D', data, '-w', '-t', '15', '-l', path.join(work, 'server.log'), '-o',
    `-c listen_addresses='' -c unix_socket_directories='${socket}' -p ${port} -c max_prepared_transactions=0 -c autovacuum=off`, 'start']); started = true;
  invoke('psql', args('postgres'), `create database ${db};`); q(install); q('select authority_fixture.reset();');
  q(`insert into auth.users(id,email_confirmed_at,raw_app_meta_data)values('${buyer}',clock_timestamp(),'{}');
   insert into auth.sessions values('${buyerSid}','${buyer}',clock_timestamp()+interval '1 hour');
   insert into public.wave1_legal_acceptances select '${buyer}','${buyerSid}',document_key,version,market,capability,'member',null from public.wave1_legal_document_versions;`);
  q('alter table auth.users enable row level security;alter table auth.users force row level security;alter table auth.sessions enable row level security;alter table auth.sessions force row level security;');
  const reserve = payload({ title: 'Generated scanner fixture', expectedSha256: 'a'.repeat(64), expectedByteLength: 1024 });
  reject(sql('upload.reserve', reserve), /sandbox_generation_inactive/u);
  q("set role sbx_v1_operator;select sandbox_commerce_v1.transition('disabled','active');");
  assert.equal(call('upload.reserve', reserve).data.reason, 'immutable_upload_route_unavailable');
  assert.equal(q('select count(*) from sandbox_commerce_v1.paid_video_requests;'), '0');
  cases.push('Disabled install fails closed; absent route holds without creating upload or journal.');
  reject(sql('upload.reserve', reserve, buyer, buyerSid), /sandbox_creator_authority_required/u);
  reject(sql('upload.reserve', { ...reserve, ready: true }), /paid_video_payload_invalid/u);
  reject(sql('upload.reserve', reserve, creator, sid, buyerSid), /paid_video_actor_binding_invalid/u);
  reject(sql('upload.reserve', { ...reserve, expectedByteLength: '1024' }), /paid_video_expectation_invalid/u);
  cases.push('Free buyer cannot author; exact session, strict keys and typed expectations enforce authority.');
  const routeId = randomUUID(), workerId = randomUUID(), key = randomBytes(32);
  // These local direct provisions are synthetic route/key authority, NOT an
  // authenticated object store or provider qualification.
  q(`insert into sandbox_commerce_v1.paid_video_routes values('${routeId}','s3','synthetic-private-media','${'1'.repeat(64)}',true);
   insert into sandbox_commerce_v1.paid_video_workers values('${workerId}',decode('${key.toString('hex')}','hex'),'${'2'.repeat(64)}',true);`);
  const binaries = { ffmpeg: '/usr/local/bin/ffmpeg', ffprobe: '/usr/local/bin/ffprobe', clamscan: '/usr/local/bin/clamscan', sigtool: '/usr/local/bin/sigtool' };
  const file = path.join(work, 'video.mp4');
  const generated = await runBounded(binaries.ffmpeg, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=24:d=2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file]); assert.equal(generated.code, 0, generated.stderr);
  const bytes = fs.readFileSync(file); reserve.expectedByteLength = bytes.length; reserve.expectedSha256 = digest(bytes);
  const first = call('upload.reserve', reserve).data.upload, upload = first.id.slice(12);
  assert.equal(first.title, reserve.title);
  assert.equal(first.bytesClean, false); assert.equal(first.transferAvailable, false);
  assert.equal(call('upload.reserve', reserve).data.upload.id, first.id);
  reject(sql('upload.reserve', { ...reserve, title: 'different' }), /paid_video_idempotency_conflict/u);
  reject(sql('upload.read', payload({ uploadId: first.id }), buyer, buyerSid), /query returned no rows/u);
  const recovered = call('upload.recover', payload({ originalRequestId: reserve.requestId }));
  assert.deepEqual(recovered.data.recovery.originalPayload, reserve); assert.equal(recovered.data.recovery.originalSessionGeneration, sid);
  assert.equal(call('upload.recover', payload({ originalRequestId: randomUUID() })).status, 'unknown');
  const objectKey = q(`select object_key from sandbox_commerce_v1.paid_video_uploads where id='${upload}';`);
  assert.equal(objectKey, `sandbox-commerce-v1/${creator}/${first.resourceId}/${first.assetId}/${first.incarnation}.mp4`);
  cases.push('Server creates exact private key/incarnation; duplicate reservation recovers same resource; unknown recovery does not resend.');
  const transferRequest = randomUUID();
  const transferSql = (action, id = null, user = creator, session = sid, requestId = transferRequest) =>
    `set role service_role;select public.isolated_paid_video_upload_v1('${action}','${upload}','${user}','${session}','${requestId}',${id ? lit(id) : 'null'});`;
  const transfer = parse(transferSql('issue'));
  assert.equal(transfer.dispatchAllowed, true); assert.equal(transfer.object.routeId, routeId);
  assert.equal(parse(transferSql('check', transfer.transferId)).object.objectKey, objectKey);
  assert.equal(parse(transferSql('issue')).dispatchAllowed, false);
  reject(transferSql('check', randomUUID()), /paid_video_transfer_stale/u);
  reject(transferSql('issue', null, creator, sid, randomUUID()), /paid_video_transfer_busy/u);
  q(`update sandbox_commerce_v1.paid_video_routes set active=false where id='${routeId}';`);
  reject(transferSql('check', transfer.transferId), /query returned no rows/u);
  q(`update sandbox_commerce_v1.paid_video_routes set active=true where id='${routeId}';`);
  cases.push('Private upload lease binds current actor/session and route; replay is unknown, competing dispatch and disabled route reject.');
  call('upload.finalize', payload({ uploadId: first.id }));
  reject(transferSql('check', transfer.transferId), /paid_video_upload_unavailable|paid_video_transfer_stale/u);
  const ticket = parse(worker('lease', upload, workerId));
  reject(worker('lease', upload, workerId), /paid_video_scan_unavailable/u);
  // Actual worker owns/copies/scans bytes; only object retrieval/version is a
  // synthetic local fixture. Separate HTTP transport tests qualify its wire path.
  const signed = await executeScanTicket({ ticket, workerKey: key, workDirectory: work,
    scanner: { databaseDirectory, certificateDirectory, binaries },
    transport: { readForScan: async actualBinding => { assert.equal(actualBinding.objectKey, objectKey);
      return { bytes, objectVersion: 'synthetic-version-1' }; } } });
  const clean = JSON.parse(signed.raw).result; assert.equal(clean.verdict, 'clean');
  assert.equal(fs.readdirSync(work).some(name => name.startsWith('scan-')), false);
  reject(worker('result', null, null, signed.raw, '0'.repeat(64)), /paid_video_worker_signature_invalid/u);
  const wrong = signScanResult({ key, ticketId: ticket.ticketId, uploadId: first.id, incarnation: randomUUID(), objectVersion: 'synthetic-version-1', result: clean });
  reject(worker('result', null, null, wrong.raw, wrong.signature), /paid_video_result_binding_invalid/u);
  const expiredTicket = randomUUID();
  q(`insert into sandbox_commerce_v1.paid_video_tickets(id,upload_id,worker_id,issued_at,expires_at)
    values('${expiredTicket}','${upload}','${workerId}',clock_timestamp()-interval '20 minutes',clock_timestamp()-interval '10 minutes');`);
  const expired = signScanResult({ key, ticketId: expiredTicket, uploadId: first.id, incarnation: first.incarnation, objectVersion: 'synthetic-version-1', result: clean });
  reject(worker('result', null, null, expired.raw, expired.signature), /paid_video_positive_stale/u);
  q(`update sandbox_commerce_v1.paid_video_workers set active=false where id='${workerId}';`);
  reject(worker('result', null, null, signed.raw, signed.signature), /paid_video_positive_stale/u);
  q(`update sandbox_commerce_v1.paid_video_workers set active=true where id='${workerId}';`);
  const accepted = parse(worker('result', null, null, signed.raw, signed.signature));
  assert.equal(accepted.upload.bytesClean, true); assert.equal(accepted.upload.moderation, 'unreviewed');
  assert.equal(parse(worker('result', null, null, signed.raw, signed.signature)).upload.id, first.id);
  cases.push('Actual worker byte scan traverses real SQL HMAC, exact object binding, stale/deactivated-worker rejection, one-use positive and idempotent replay.');
  const publish = payload({ uploadId: first.id, expectedRevision: 1, amountMinor: 99, currency: 'usd' });
  reject(sql('offer.publish', publish), /paid_video_publication_evidence_unavailable/u);
  q(`set role sbx_v1_operator;select sandbox_commerce_v1.paid_video_moderate('${upload}','clear','${'3'.repeat(64)}');`);
  assert.equal(call('offer.publish', publish).data.reason, 'protocol3_catalog_unavailable');
  const catalogId = randomUUID();
  q(`insert into sandbox_commerce_v1.catalog values('${catalogId}','paid_content','revenuecat','synthetic-test-store-scope','test_store','synthetic-video',99,'usd');`);
  assert.equal(call('offer.publish', publish).data.reason, 'protocol3_catalog_unavailable');
  q(`insert into sandbox_commerce_v1.paid_video_catalog values('${catalogId}',3,'${'4'.repeat(64)}');`);
  const published = call('offer.publish', publish).data.offer;
  assert.equal(published.asset.sha256, clean.sha256); assert.equal(published.asset.byteLength, clean.byteLength);
  assert.equal(published.asset.incarnation, first.incarnation); assert.equal(published.checkoutAvailable, false);
  assert.equal(q(`select count(*) from sandbox_commerce_v1.video_terms where resource_id='${first.resourceId.slice(14)}';`), '1');
  assert.equal(call('offer.publish', publish).data.offer.id, published.id);
  reject(`update sandbox_commerce_v1.delivery_assets set object_version='replacement';`, /sandbox_resource_identity_immutable/u);
  reject(`update sandbox_commerce_v1.paid_video_uploads set expected_sha256='${'e'.repeat(64)}' where id='${upload}';`, /sandbox_resource_identity_immutable/u);
  cases.push('Only clean exact bytes + explicit moderation + distinct protocol3 catalog admission atomically create immutable version/asset/scan/terms/offer.');
  assert.equal(call('offer.read', payload({ offerId: published.id }), buyer, buyerSid).data.offer.asset.sha256, clean.sha256);
  assert.equal(q(`select count(*) from public.user_entitlements where user_id='${buyer}';`), '0');
  assert.equal(q('select count(*) from sandbox_commerce_v1.resource_grants;'), '0');
  reject(sql('checkout.prepare', payload({ offerId: published.id })), /paid_video_payload_invalid/u);
  reject(sql('delivery.prepare', payload({ offerId: published.id })), /paid_video_payload_invalid/u);
  cases.push('Free buyer reads exact immutable offer; read/receipt-free publication grants no access and exposes no checkout/delivery.');
  for (let n = 0; n < 3; n++) call('upload.reserve', { ...reserve, requestId: randomUUID(), title: 'Pagination ' + n });
  const page1 = call('studio.read', payload({ limit: 2, cursor: null })).data;
  const page2 = call('studio.read', payload({ limit: 2, cursor: page1.nextCursor })).data;
  assert.equal(new Set([...page1.uploads, ...page2.uploads].map(x => x.id)).size, 4); assert.equal(page2.nextCursor, null);
  reject(sql('studio.read', payload({ limit: 51, cursor: null })), /paid_video_pagination_invalid/u);
  cases.push('Bounded stable cursor pagination returns each owned upload exactly once.');
  for (const role of ['anon', 'authenticated', 'service_role']) {
    reject(`set role ${role};select * from sandbox_commerce_v1.paid_video_workers;`, /permission denied/u);
    reject(`set role ${role};select sandbox_commerce_v1.paid_video_moderate('${upload}','clear','${'f'.repeat(64)}');`, /permission denied/u);
  }
  assert.equal(q("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='sandbox_commerce_v1' and c.relname like 'paid_video_%' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity);"), '0');
  reject("set role service_role;select public.isolated_paid_video_v1('capability.read','{}',null,null);", /permission denied/u);
  cases.push('Actual role ACLs and FORCE RLS deny private keys, direct mutation, generic moderation and service app command access.');
  call('offer.retire', payload({ offerId: published.id, expectedRevision: 1 }));
  q("set role sbx_v1_operator;select sandbox_commerce_v1.transition('active','retired');");
  const negative = signScanResult({ key, ticketId: ticket.ticketId, uploadId: first.id, incarnation: first.incarnation, objectVersion: 'synthetic-version-1',
    result: { ...clean, verdict: 'rejected', reason: 'malware_or_scan_limit', media: null } });
  assert.equal(parse(worker('result', null, null, negative.raw, negative.signature)).upload.state, 'rejected');
  assert.equal(parse(worker('result', null, null, signed.raw, signed.signature)).upload.state, 'rejected');
  assert.equal(call('upload.reserve', reserve).data.upload.state, 'rejected');
  assert.equal(call('upload.recover', payload({ originalRequestId: publish.requestId })).data.offer.status, 'retired');
  reject(sql('upload.reserve', { ...reserve, requestId: randomUUID() }), /sandbox_generation_inactive/u);
  reject(sql('offer.read', payload({ offerId: published.id }), buyer, buyerSid), /paid_video_offer_unavailable/u);
  assert.equal(q(`select moderation from sandbox_commerce_v1.delivery_assets where id='${first.assetId.slice(11)}';`), 'removed');
  cases.push('Retirement preserves history; signed late negatives revoke media; stale clean replay never restores authority.');
  for (const filename of ['scan.mjs', 'job.mjs', 'private-object.mjs', 'upload-broker.mjs']) {
    sourceHashes['ops/isolated-paid-video-worker/' + filename] = digest(fs.readFileSync(path.join(root, 'ops/isolated-paid-video-worker', filename)));
  }
  report = { status: 'passed', engine, baseline, cases, sourceHashes, fixtureHashes, actualCleanScan: clean, contractCaptures: captures,
    providerAuthenticationProven: false, immutableObjectStoreProven: false, deploymentReady: false,
    scope: 'Actual PostgreSQL permissions/lifecycle/HMAC/publication plus real local FFmpeg/ClamAV bytes. Route, object version, moderation and catalog are explicitly synthetic fixture provisions. No remote object adapter, protocol3 provider receipt, grant/delivery, app runtime or target installation proof.' };
} finally {
  assert.ok(!initializeAttempted || initialized, 'Uncertain initialization; preserve private directory');
  if (startAttempted) {
    let status = run('pg_ctl', ['-D', data, 'status']);
    if (status.status === 0) { invoke('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '15', 'stop']); cleanup.clusterStopped = true; status = run('pg_ctl', ['-D', data, 'status']); }
    else if (started && status.status === 3) cleanup.clusterStopped = true;
    assert.equal(status.status, 3, 'Uncertain cluster state; preserve directory'); assert.ok(started, 'Uncertain startup; preserve directory'); cleanup.notRunningVerified = true;
  } else { cleanup.clusterStopped = true; cleanup.notRunningVerified = true; }
  fs.rmSync(work, { recursive: true }); cleanup.directoryRemoved = true;
}
process.stdout.write(JSON.stringify({ ...report, cleanup }, null, 2) + '\n');
