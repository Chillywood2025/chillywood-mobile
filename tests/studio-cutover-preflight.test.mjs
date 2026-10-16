import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = 'supabase/migrations/20261015073423_platform_studio_publication_and_audience_authority.sql';
const project = 'abcdefghijklmnopqrst';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const baselineStatement = 'Reviewed live project, migration ledger and catalog against this exact source; required predecessors are present and the held migration is absent';
const rosterStatement = 'Every installed, cached, offline and automated Studio/Audience-capable client for this account is listed; no unknown clients remain';
const inventoryStatement = 'All privileged humans, services, jobs and credential holders with Studio/Audience mutation access are enumerated';
const behavior = 'Exact-source disposable post-migration Studio/Audience tests passed; installed client verified pre-cutover truthful failure';
const pauseScope = 'All Studio/Audience creation, review, writes and deletes, storage, privileged automation, eligibility and role changes, account reactivation, new installs and offline client resumption';
const retirement = 'Cannot resume Studio/Audience actions, including cached/offline sessions';

test('actual CLI emits exact one migration only for complete private bound evidence; mutations fail closed', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-cutover-test-'));
  const repo = path.join(temp, 'repo'), privateDir = path.join(temp, 'private'), bin = path.join(temp, 'bin');
  for (const directory of [repo, privateDir, bin]) fs.mkdirSync(directory);
  try {
    for (const file of [migration, 'scripts/studio-cutover-preflight.mjs', 'scripts/studio-cutover-live.sql']) {
      fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
      fs.copyFileSync(path.join(root, file), path.join(repo, file));
    }
    const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe', encoding: 'utf8' }).trim();
    git('init'); git('add', '.'); git('-c', 'user.name=Synthetic Test', '-c', 'user.email=synthetic@example.invalid', 'commit', '-m', 'Synthetic CLI fixture');
    const incompatibleSource = git('rev-parse', 'HEAD');
    fs.writeFileSync(path.join(repo, 'product.ts'), '// Synthetic product revision'); git('add', '.');
    git('-c', 'user.name=Synthetic Test', '-c', 'user.email=synthetic@example.invalid', 'commit', '-m', 'Synthetic product revision');
    const compatibleSource = git('rev-parse', 'HEAD');
    fs.mkdirSync(path.join(repo, 'docs')); fs.writeFileSync(path.join(repo, 'docs/studio-cutover-runbook.md'), 'Synthetic tool-only revision'); git('add', '.');
    git('-c', 'user.name=Synthetic Test', '-c', 'user.email=synthetic@example.invalid', 'commit', '-m', 'Synthetic tool-only revision');
    const live = { schema: 1, heldObjectsAbsent: true, stateSha256: sha('synthetic-state'), history: [{ version: '20261014000000', name: 'fixture' }],
      catalog: { functions: ['synthetic definition'] }, profileWriters: ['writer'], assetOwners: ['asset-only'],
      profileOwners: ['preserved'], storageOwners: ['storage-only'], reviewers: ['reviewer'], audienceReviewers: ['audience-only'], unknownSubjects: 0 };
    const liveFile = path.join(privateDir, 'live.json');
    const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
    write(liveFile, live);
    // A synthetic transport, not live proof. It asserts the executable sends the
    // committed read-only transaction and psql safety options, then returns data.
    fs.writeFileSync(path.join(bin, 'psql'), `#!${process.execPath}\nconst fs=require('fs');const sql=fs.readFileSync(0,'utf8');if(!sql.includes('isolation level repeatable read read only')||!sql.trim().endsWith('rollback;')||!process.argv.includes('-X')||process.env.PGOPTIONS!=='-c default_transaction_read_only=on -c statement_timeout=25000')process.exit(42);if(process.env.STUDIO_TEST_DELAY)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,Number(process.env.STUDIO_TEST_DELAY));process.stdout.write(fs.readFileSync(process.env.STUDIO_TEST_LIVE));`, { mode: 0o700 });
    const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, PGHOST: `db.${project}.supabase.co`,
      PGSSLMODE: 'verify-full', PGUSER: 'postgres', PGDATABASE: 'postgres', STUDIO_TEST_LIVE: liveFile };
    const cli = (args, extraEnv = {}) => spawnSync(process.execPath, [path.join(repo, 'scripts/studio-cutover-preflight.mjs'), ...args], {
      cwd: temp, env: { ...env, ...extraEnv }, encoding: 'utf8' });
    const baselineFile = path.join(privateDir, 'baseline.json');
    const captured = cli(['capture', project, baselineFile]);
    assert.equal(captured.status, 0, captured.stderr);
    const baseline = JSON.parse(fs.readFileSync(baselineFile));
    let sequence = 0;
    function receipt(kind, claims) {
      const file = `receipt-${sequence++}.json`;
      const original = `original-${sequence++}.txt`;
      const originalBytes = `Synthetic original ${kind} evidence, not production proof.`;
      fs.writeFileSync(path.join(privateDir, original), originalBytes);
      const record = { schema: 1, reviewer: 'synthetic-operator', kind, claims, binding: baseline.binding,
        observedAt: new Date().toISOString(), reviewedAt: new Date().toISOString(), observation: 'Synthetic observation for tests only', sourceReference: 'synthetic://reviewed-proof',
        sourceEvidence: [{ file: original, sha256: sha(originalBytes) }] };
      if (['sourceReceipt', 'buildReceipt', 'runtimeReceipt', 'behaviorReceipt'].includes(kind)) record.observedAt = '2026-01-01T00:00:00Z';
      const bytes = JSON.stringify(record); fs.writeFileSync(path.join(privateDir, file), bytes);
      return { file, sha256: sha(bytes) };
    }
    const subjects = ['writer', 'asset-only', 'preserved', 'storage-only', 'reviewer', 'audience-only', 'automation'];
    const evidence = { schema: 1, binding: baseline.binding, reviewer: 'synthetic-operator', reviewedAt: new Date().toISOString(),
      cohortScope: 'Finite closed internal tester cohort; no public rollout, unknown clients or unenumerated account access',
      baselineReview: { statement: baselineStatement, receipt: receipt('baseline-review', { liveSha256: baseline.binding.liveSha256 }) },
      privilegedInventory: { statement: inventoryStatement, holders: ['automation'], receipt: receipt('privileged-inventory', { holders: ['automation'] }) },
      accounts: subjects.map(subject => {
        const client = { id: 'device-1', state: 'upgraded', sourceCommit: compatibleSource,
          build: 'synthetic-build', runtime: 'synthetic-runtime', platform: 'android', behavior };
        const claims = { subject, client: client.id, sourceCommit: client.sourceCommit, build: client.build,
          runtime: client.runtime, platform: client.platform, behavior };
        for (const kind of ['sourceReceipt', 'buildReceipt', 'runtimeReceipt', 'installReceipt', 'behaviorReceipt']) client[kind] = receipt(kind, claims);
        const retired = { id: 'old-client', state: 'retired', retirement,
          retirementReceipt: receipt('retirement', { subject, client: 'old-client', retirement }) };
        return { subject, statement: rosterStatement, clients: [client, retired],
          rosterReceipt: receipt('client-roster', { subject, clients: [{ id: client.id, state: client.state }, { id: retired.id, state: retired.state }] }) };
      }),
      pause: { scope: pauseScope, subjects, startedAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() } };
    evidence.pause.receipt = receipt('pause', evidence.pause);
    const evidenceFile = path.join(privateDir, 'evidence.json');
    write(evidenceFile, evidence);
    const output = path.join(privateDir, 'payload.sql');
    const success = cli(['prepare', project, evidenceFile, baselineFile, output]);
    assert.equal(success.status, 0, success.stderr);
    assert.deepEqual(fs.readFileSync(output), fs.readFileSync(path.join(repo, migration)));
    assert.equal(fs.statSync(output).mode & 0o777, 0o600);
    assert.equal(cli(['prepare', project, evidenceFile, baselineFile, output]).status, 1, 'never overwrite an earlier payload');
    function blocked(code, extraEnv = {}) {
      const target = path.join(privateDir, `blocked-${sequence++}.sql`);
      const result = cli(['prepare', project, evidenceFile, baselineFile, target], extraEnv);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, new RegExp(`blocked: ${code}\\.`));
      assert.equal(fs.existsSync(target), false);
    }
    write(baselineFile, { ...baseline, capturedAt: '2000-01-01T00:00:00Z' });
    blocked('EVIDENCE_NOT_FRESH'); write(baselineFile, baseline);
    const reference = evidence.accounts[0].clients[0].buildReceipt;
    const recordPath = path.join(privateDir, reference.file);
    const originalRecord = fs.readFileSync(recordPath, 'utf8');
    fs.appendFileSync(recordPath, 'tampered'); blocked('RECEIPT_INTEGRITY_MISMATCH'); fs.writeFileSync(recordPath, originalRecord);
    for (const [code, mutate, extraEnv] of [
      ['SOURCE_EVIDENCE_MISSING', record => { delete record.sourceEvidence; }],
      ['SOURCE_EVIDENCE_INTEGRITY_MISMATCH', record => { record.sourceEvidence[0].sha256 = 'a'.repeat(64); }],
      ['SOURCE_EVIDENCE_CIRCULAR', record => { record.sourceEvidence[0] = reference; }],
      ['RECEIPT_OBSERVATION_INVALID', record => { record.observedAt = '2099-01-01T00:00:00Z'; }],
      ['EVIDENCE_NOT_FRESH', record => { record.reviewedAt = '2099-01-01T00:00:00Z'; }],
      ['EVIDENCE_NOT_FRESH', record => { record.reviewedAt = new Date(Date.now() - 299_000).toISOString(); }, { STUDIO_TEST_DELAY: '2500' }],
    ]) {
      const record = JSON.parse(originalRecord); mutate(record); const bytes = JSON.stringify(record);
      fs.writeFileSync(recordPath, bytes);
      const changed = structuredClone(evidence); changed.accounts[0].clients[0].buildReceipt.sha256 = sha(bytes);
      write(evidenceFile, changed); blocked(code, extraEnv);
      fs.writeFileSync(recordPath, originalRecord); write(evidenceFile, evidence);
    }
    const expiring = structuredClone(evidence);
    expiring.pause.expiresAt = new Date(Date.now() + 61_000).toISOString();
    const { receipt: _receipt, ...pauseClaims } = expiring.pause;
    expiring.pause.receipt = receipt('pause', pauseClaims);
    write(evidenceFile, expiring); blocked('PAUSE_EXPIRING', { STUDIO_TEST_DELAY: '2500' }); write(evidenceFile, evidence);
    const dormant = structuredClone(evidence);
    const account = dormant.accounts.find(item => item.subject === 'audience-only');
    account.clients = []; account.disposition = 'No client provisioned; dormant account cannot resume or obtain a client during cutover';
    account.rosterReceipt = receipt('client-roster', { subject: account.subject, clients: [] });
    account.dormancyReceipt = receipt('dormancy', { subject: account.subject, disposition: account.disposition });
    write(evidenceFile, dormant);
    assert.equal(cli(['prepare', project, evidenceFile, baselineFile, path.join(privateDir, 'dormant.sql')]).status, 0);
    write(evidenceFile, evidence);
    const mutations = [
      ['missing evidence', e => { delete e.accounts; }],
      ['stale review', e => { e.reviewedAt = '2000-01-01T00:00:00Z'; }],
      ['future review', e => { e.reviewedAt = '2099-01-01T00:00:00Z'; }],
      ['wrong source', e => { e.binding.commit = 'a'.repeat(40); }],
      ['wrong tree', e => { e.binding.tree = 'a'.repeat(40); }],
      ['wrong SQL', e => { e.binding.migrationSha256 = 'a'.repeat(64); }],
      ['wrong project', e => { e.binding.project = 'z'.repeat(20); }],
      ['missing reviewer', e => { delete e.reviewer; }],
      ['no baseline review', e => { delete e.baselineReview; }],
      ['missing asset owner', e => { e.accounts = e.accounts.filter(a => a.subject !== 'asset-only'); }],
      ['missing storage owner', e => { e.accounts = e.accounts.filter(a => a.subject !== 'storage-only'); }],
      ['missing automation', e => { e.accounts = e.accounts.filter(a => a.subject !== 'automation'); }],
      ['missing Audience reviewer', e => { e.accounts = e.accounts.filter(a => a.subject !== 'audience-only'); }],
      ['unbounded cohort', e => { delete e.cohortScope; }],
      ['duplicate account', e => { e.accounts.push(e.accounts[0]); }],
      ['empty roster', e => { e.accounts[0].clients = []; }],
      ['unknown roster', e => { e.accounts[0].statement = 'complete: true'; }],
      ['old active client', e => { e.accounts[0].clients[0].state = 'legacy'; }],
      ['wrong installed source', e => { e.accounts[0].clients[0].sourceCommit = 'b'.repeat(40); }],
      ['ancestor with product drift', e => { e.accounts[0].clients[0].sourceCommit = incompatibleSource; }],
      ['wrong runtime receipt', e => { e.accounts[0].clients[0].runtime = 'different-runtime'; }],
      ['missing install', e => { delete e.accounts[0].clients[0].installReceipt; }],
      ['unretired old client', e => { delete e.accounts[0].clients[1].retirementReceipt; }],
      ['missing inventory', e => { delete e.privilegedInventory; }],
      ['partial pause', e => { e.pause.scope = 'Publishing only'; }],
      ['expired pause', e => { e.pause.expiresAt = '2000-01-01T00:00:00Z'; }],
      ['unbounded pause', e => { e.pause.expiresAt = '2099-01-01T00:00:00Z'; }],
      ['pause after capture', e => { e.pause.startedAt = new Date(Date.now() + 1_000).toISOString(); }],
      ['missing pause subject', e => { e.pause.subjects.pop(); }],
    ];
    for (const [label, mutate] of mutations) {
      const changed = structuredClone(evidence); mutate(changed); write(evidenceFile, changed);
      const target = path.join(privateDir, `reject-${sequence++}.sql`);
      const result = cli(['prepare', project, evidenceFile, baselineFile, target]);
      assert.equal(result.status, 1, label); assert.equal(fs.existsSync(target), false, label);
      assert.ok(!result.stderr.includes('INPUT_OR_CAPTURE_FAILED'), `${label}: expected a semantic gate rejection, got ${result.stderr}`);
      assert.ok(!`${result.stdout}${result.stderr}`.includes('asset-only'), 'no private subject leakage');
    }
    write(evidenceFile, evidence);
    for (const [label, mutate] of [
      ['new owner', l => { l.assetOwners.push('new-owner'); }],
      ['changed catalog', l => { l.catalog.functions.push('drift'); }],
      ['same-subject data drift', l => { l.stateSha256 = sha('changed-state'); }],
      ['changed history', l => { l.history.push({ version: '20261016000000', name: 'other' }); }],
      ['already applied', l => { l.history.push({ version: '20261015073423' }); }],
      ['partial apply', l => { l.heldObjectsAbsent = false; }],
      ['unknown storage owner', l => { l.unknownSubjects = 1; }],
      ['malformed cohort', l => { delete l.reviewers; }],
    ]) {
      const changed = structuredClone(live); mutate(changed); write(liveFile, changed);
      const target = path.join(privateDir, `reject-${sequence++}.sql`);
      const result = cli(['prepare', project, evidenceFile, baselineFile, target]);
      assert.equal(result.status, 1, label);
      assert.ok(!result.stderr.includes('INPUT_OR_CAPTURE_FAILED'), `${label}: expected a semantic gate rejection, got ${result.stderr}`);
      assert.equal(fs.existsSync(target), false, label);
    }
    write(liveFile, live);
    for (const override of [{ PGHOST: 'wrong.example' }, { PGSSLMODE: 'require' }, { PGDATABASE: 'other' },
      { PGHOSTADDR: '127.0.0.1' }, { PGSERVICE: 'override' }, { PGSERVICEFILE: '/private/override' }, { PGUSER: 'other' }, { PGPORT: '6543' }]) {
      assert.equal(cli(['prepare', project, evidenceFile, baselineFile, path.join(privateDir, 'no.sql')], override).status, 1);
      assert.equal(fs.existsSync(path.join(privateDir, 'no.sql')), false);
    }
    fs.appendFileSync(path.join(repo, migration), '\n-- dirty source');
    assert.equal(cli(['prepare', project, evidenceFile, baselineFile, path.join(privateDir, 'dirty.sql')]).status, 1);
    assert.equal(fs.existsSync(path.join(privateDir, 'dirty.sql')), false);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('real PostgreSQL-compatible extractor includes owner-only/storage/reviewer subjects and detects catalog drift', async () => {
  const db = new PGlite();
  const ids = Array.from({ length: 6 }, (_, i) => `00000000-0000-4000-8000-00000000000${i + 1}`);
  try {
    await db.exec(`create schema storage; create schema auth; create schema supabase_migrations;
      create table auth.users(id uuid, deleted_at timestamptz);
      create table public.channel_audience_requests(channel_user_id text);
      create table public.channel_followers(channel_user_id text, follower_user_id text);
      create table supabase_migrations.schema_migrations(version text, name text);
      insert into supabase_migrations.schema_migrations values ('20261014000000','fixture');
      create table public.user_entitlements(user_id text,entitlement_key text);
      create table public.platform_role_memberships(user_id text,role text);
      create table public.platform_staff_permission_grants(target_user_id text,status text,expires_at timestamptz,permission_key text);
      create table public.platform_brand_assets(owner_user_id text);
      create table public.platform_brand_profiles(owner_user_id text);
      create table storage.objects(bucket_id text,name text);
      create function public.platform_subject_has_role_internal(subject text,roles text[]) returns boolean language sql as $$
        select exists(select 1 from public.platform_role_memberships where user_id=subject and role=any(roles)) $$;
      create function public.premium_subject_has_finite_authority_internal(subject text) returns boolean language sql as $$ select subject='${ids[0]}' $$;
      create function public.platform_admin_scope_legacy_aliases(scope text) returns text[] language sql as $$ select array[scope] $$;
      insert into public.user_entitlements values ('${ids[0]}','premium');
      insert into public.platform_role_memberships values ('${ids[1]}','owner'),('${ids[4]}','moderator');
      insert into public.platform_staff_permission_grants values ('${ids[4]}','active',null,'content_moderation');
      insert into public.platform_brand_assets values ('${ids[2]}');
      insert into public.platform_brand_profiles values ('${ids[5]}');
      insert into auth.users values ('${ids[5]}',null);
      insert into storage.objects values ('platform-brand-assets','${ids[3]}/old.jpg');`);
    const sql = fs.readFileSync(path.join(root, 'scripts/studio-cutover-live.sql'), 'utf8');
    const capture = async () => (await db.exec(sql)).find(result => result.rows.length)?.rows[0].jsonb_build_object;
    const before = await capture();
    assert.deepEqual(before.profileWriters, [ids[0], ids[1]]);
    assert.deepEqual(before.assetOwners, [ids[2]]);
    assert.deepEqual(before.profileOwners, [ids[5]]);
    assert.deepEqual(before.storageOwners, [ids[3]]);
    assert.deepEqual(before.reviewers, [ids[1], ids[4]]);
    assert.deepEqual(before.audienceReviewers, [ids[5]]);
    assert.equal(before.unknownSubjects, 0);
    assert.equal(before.heldObjectsAbsent, true);
    await db.exec(`insert into public.channel_audience_requests values ('${ids[5]}');`);
    const sameSubjectChange = await capture();
    assert.deepEqual(sameSubjectChange.audienceReviewers, before.audienceReviewers);
    assert.deepEqual(sameSubjectChange.catalog, before.catalog);
    assert.notEqual(sameSubjectChange.stateSha256, before.stateSha256);
    await db.exec(`insert into storage.objects values ('platform-brand-assets','unattributed');
      alter table public.platform_brand_assets add column changed boolean;
      create table public.platform_brand_publications(id text);`);
    const after = await capture();
    assert.equal(after.unknownSubjects, 1);
    assert.equal(after.heldObjectsAbsent, false);
    assert.notDeepEqual(after.catalog, before.catalog);
  } finally { await db.close(); }
});
