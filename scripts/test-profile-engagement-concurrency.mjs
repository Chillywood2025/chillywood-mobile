#!/usr/bin/env node
// Native PostgreSQL protocol/trigger tests, not an RLS or production load proof.
// Runs the complete checked-in migration against disposable minimal source tables.
// Default: local Supabase Docker. --native: explicit loopback-only psql transport.
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';

const native = process.argv.includes('--native');
assert.ok(process.argv.slice(2).every(arg => arg === '--native'), 'only --native is accepted; no database URLs');
const database = `profile_counts_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const project = readFileSync('supabase/config.toml', 'utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]+)"/mu)?.[1];
const container = process.env.SUPABASE_DB_CONTAINER || `supabase_db_${project}`;
assert.match(container, /^supabase_db_[A-Za-z0-9_.-]+$/u);
if (native) {
  assert.equal(process.env.PGHOST, '127.0.0.1', 'native test requires explicit IPv4 loopback');
  assert.match(process.env.PGPORT || '', /^\d{1,5}$/u);
  assert.equal(process.env.PGUSER, 'postgres', 'local disposable test administrator required');
  assert.ok(!process.env.PGHOSTADDR, 'host-address override forbidden');
  assert.ok(!process.env.PGSERVICE && !process.env.PGSERVICEFILE, 'service indirection forbidden');
} else {
  // A local-looking container name is not sufficient if Docker targets SSH/TCP.
  const context = spawnSync('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], {encoding:'utf8', timeout:10_000});
  assert.equal(context.status, 0, 'local Docker context must be inspectable');
  assert.match((process.env.DOCKER_HOST || context.stdout).trim(), /^unix:\/\/\//u, 'only a local Unix-socket Docker daemon is accepted');
}
const env = {...process.env};
delete env.DATABASE_URL;
delete env.PGOPTIONS;
const args = target => {
  const psql = ['psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', target];
  return native ? psql : ['docker', 'exec', '-i', container, ...psql];
};
function query(sql, target = database) {
  const [command, ...argv] = args(target);
  const result = spawnSync(command, argv, {env, encoding: 'utf8', input: `set statement_timeout='20s';${sql}\n`, timeout: 30_000, maxBuffer: 8 * 1024 * 1024});
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  return result.stdout.trim();
}
const sessions = new Set();
function session(name, sql) {
  const [command, ...argv] = args(database);
  const child = spawn(command, argv, {env, stdio: ['pipe', 'pipe', 'pipe']});
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => { sessions.delete(child); resolve({code, stdout, stderr}); });
  });
  sessions.add(child);
  child.stdin.write(`set application_name=${literal(name)};set statement_timeout='20s';${sql}\n`);
  return {child, done, output: () => stdout};
}
async function until(test, label) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) { if (test()) return; await delay(20); }
  throw new Error(`timeout: ${label}`);
}
async function finish(s, sql = 'commit;') {
  s.child.stdin.end(`${sql}\n\\q\n`);
  const result = await s.done;
  assert.equal(result.code, 0, result.stderr);
  return result.stdout;
}
function blocked(waiter, holder) {
  return query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${literal(holder)}
    where w.datname=current_database() and h.datname=current_database() and w.application_name=${literal(waiter)}
      and w.pid<>h.pid and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid));`) === '1';
}
let checks = 0;
const pass = label => { checks++; console.log(`ok ${checks} - ${label}`); };
const post = randomUUID(), post2 = randomUUID();
const like = user => `insert into public.profile_post_likes values(${literal(post)},${literal(user)}) on conflict do nothing;`;
function exact(label) {
  const result = JSON.parse(query(`select json_build_object(
    'likes',(select count(*) from public.profile_post_likes where post_id=${literal(post)}),
    'comments',(select count(*) from public.profile_post_comments where post_id=${literal(post)} and deleted_at is null and moderation_status in ('clean','reported')),
    'countLikes',coalesce((select sum(like_count) from profile_engagement_private.post_counts where post_id=${literal(post)}),0),
    'countComments',coalesce((select sum(comment_count) from profile_engagement_private.post_counts where post_id=${literal(post)}),0))::text;`));
  assert.equal(result.countLikes, result.likes, `${label}: exact likes`);
  assert.equal(result.countComments, result.comments, `${label}: exact comments`);
  pass(label);
}
async function race(label, holderSql, waiterSql, release = 'commit;') {
  const holderName = `counts-holder-${checks}`, waiterName = `counts-waiter-${checks}`;
  const holder = session(holderName, `begin;${holderSql}select 'HOLDER_READY';`);
  await until(() => holder.output().includes('HOLDER_READY'), `${label}: holder acquired`);
  const waiter = session(waiterName, `begin;${waiterSql}commit;`);
  waiter.child.stdin.end('\\q\n');
  await until(() => blocked(waiterName, holderName), `${label}: actual independent backend blocked`);
  await finish(holder, release);
  const result = await waiter.done;
  assert.equal(result.code, 0, result.stderr);
  exact(label);
}

try {
  query(`create database ${database};`, 'postgres');
  // Roles are cluster-global; reuse Supabase roles, create only in a bare local cluster.
  query(`do $$ begin
    if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists(select from pg_roles where rolname='service_role') then create role service_role; end if;
  end $$;
  create schema auth;
  create table auth.users(id text primary key);
  create function auth.uid() returns uuid language sql as $$select null::uuid$$;
  create function public.can_view_profile_content(text) returns boolean language sql as $$select true$$;
  create function public.has_platform_role(text[]) returns boolean language sql as $$select false$$;
  create function public.is_platform_owner_user(text) returns boolean language sql as $$select false$$;
  create table public.profile_posts(id uuid primary key,user_id text references auth.users on delete cascade,deleted_at timestamptz,visibility text default 'public',moderation_status text default 'clean');
  create table public.profile_post_likes(post_id uuid references public.profile_posts on delete cascade,user_id text references auth.users on delete cascade,primary key(post_id,user_id));
  create table public.profile_post_comments(id uuid primary key,post_id uuid references public.profile_posts on delete cascade,deleted_at timestamptz,moderation_status text default 'clean');
  insert into auth.users values('owner');
  insert into auth.users select 'u'||n from generate_series(1,5000) n;
  insert into public.profile_posts(id,user_id) values(${literal(post)},'owner'),(${literal(post2)},'owner');`);

  const migration = readFileSync('supabase/migrations/20261027214412_profile_engagement_sharded_counters.sql', 'utf8');
  console.log(`Migration SHA256: ${createHash('sha256').update(migration).digest('hex')}`);
  const boundary = 'lock table public.profile_post_likes, public.profile_post_comments in share row exclusive mode;';
  const index = migration.indexOf(boundary) + boundary.length;
  assert.ok(index >= boundary.length, 'actual migration write barrier present');
  // Feed the entire migration verbatim, paused immediately after its actual lock.
  // An old writer must finish before backfill; a new writer must await installation.
  const before = session('counts-before-backfill', `begin;${like('u1')}select 'BEFORE_READY';`);
  await until(() => before.output().includes('BEFORE_READY'), 'pre-migration source writer');
  const deploy = session('counts-migration', `${migration.slice(0,index)}\nselect 'BACKFILL_LOCKED';`);
  await until(() => blocked('counts-migration','counts-before-backfill'), 'migration waits for prior source writer');
  await finish(before);
  await until(() => deploy.output().includes('BACKFILL_LOCKED'), 'migration owns source write barrier');
  const after = session('counts-after-backfill', `begin;${like('u2')}commit;`);
  after.child.stdin.end('\\q\n');
  await until(() => blocked('counts-after-backfill','counts-migration'), 'new writer waits through snapshot and trigger installation');
  await finish(deploy, migration.slice(index));
  const installed = await after.done; assert.equal(installed.code, 0, installed.stderr);
  exact('actual migration backfill serializes writers on both sides without omissions or double counts');

  const colliders = query(`select user_id from (select id user_id,profile_engagement_private.bucket(id) b from auth.users where id like 'u%') u
    where b=profile_engagement_private.bucket('u3') and user_id not in ('u1','u2') order by user_id limit 40;`).split('\n');
  assert.equal(colliders.length,40);
  await race('same-shard distinct likes serialize without lost increments', like(colliders[0]), like(colliders[1]));
  await race('duplicate concurrent ON CONFLICT is counted once', like(colliders[2]), like(colliders[2]));
  await race('rolled-back insert has no delta and waiting insert commits once', like(colliders[3]), like(colliders[3]), 'rollback;');
  await race('opposite same-shard add/remove preserves exact totals', like(colliders[4]), `delete from public.profile_post_likes where post_id=${literal(post)} and user_id=${literal(colliders[0])};`);

  const otherShard = query(`select id from auth.users where id like 'u%' and id not in ('u1','u2')
    and profile_engagement_private.bucket(id)<>profile_engagement_private.bucket(${literal(colliders[0])}) order by id limit 1;`);
  const shardHolder = session('counts-independent-shard-holder', `begin;${like(colliders[0])}select 'SHARD_HELD';`);
  await until(() => shardHolder.output().includes('SHARD_HELD'), 'one shard write held');
  const independent = session('counts-independent-shard-writer', `begin;${like(otherShard)}commit;select 'OTHER_COMMITTED';`);
  await until(() => independent.output().includes('OTHER_COMMITTED'), 'different shard commits before held shard releases');
  assert.equal(query("select count(*) from pg_stat_activity where datname=current_database() and application_name='counts-independent-shard-holder' and state='idle in transaction';"),'1');
  await finish(independent, '');
  await finish(shardHolder);
  exact('different shard commits while first shard remains locked (no global post serialization)');

  const jobs = colliders.slice(5).map((user,i) => {
    const s=session(`counts-burst-${i}`,`begin;${like(user)}commit;`); s.child.stdin.end('\\q\n'); return s.done;
  });
  for (const r of await Promise.all(jobs)) assert.equal(r.code,0,r.stderr);
  exact('35 concurrently launched same-shard native writer sessions preserve all deltas');

  const comment = randomUUID();
  query(`insert into public.profile_post_comments(id,post_id) values(${literal(comment)},${literal(post)});`);
  await race('concurrent moderation hide then report restores exactly one comment',
    `update public.profile_post_comments set moderation_status='hidden' where id=${literal(comment)};`,
    `update public.profile_post_comments set moderation_status='reported' where id=${literal(comment)};`);
  await race('rolled-back moderation transition leaves no phantom delta',
    `update public.profile_post_comments set moderation_status='removed' where id=${literal(comment)};`,
    `update public.profile_post_comments set moderation_status='clean' where id=${literal(comment)};`, 'rollback;');
  query(`update public.profile_post_comments set deleted_at=now() where id=${literal(comment)};`);
  exact('soft-deleted comment is removed from exact count');
  query(`update public.profile_post_comments set deleted_at=null where id=${literal(comment)};`);
  exact('restored comment is counted exactly once');
  query(`update public.profile_post_comments set post_id=${literal(post2)} where id=${literal(comment)};`);
  exact('comment move decrements previous source');
  assert.equal(query(`select sum(comment_count) from profile_engagement_private.post_counts where post_id=${literal(post2)};`),'1');
  pass('comment move increments destination exactly once');
  query(`delete from auth.users where id=${literal(colliders[5])};`);
  exact('constructed fixture account FK cascade preserves exact like decrement (not product purge proof)');
  query(`delete from public.profile_posts where id=${literal(post2)};`);
  assert.equal(query(`select count(*) from profile_engagement_private.post_counts where post_id=${literal(post2)};`),'0');
  pass('post deletion cascades source and counters without recreating orphan shards');
  query(`delete from auth.users where id='owner';`);
  assert.equal(query('select count(*) from profile_engagement_private.post_counts;'),'0');
  pass('constructed fixture owner FK cascade removes posts, engagement and shards (not product purge proof)');
  console.log(`PASS: ${checks} native concurrency/accounting cases; minimal source fixture, not full-schema authority or load qualification.`);
} finally {
  for (const child of sessions) child.kill('SIGTERM');
  query(`drop database if exists ${database} with (force);`, 'postgres');
}
