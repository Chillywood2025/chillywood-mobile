#!/usr/bin/env node
// Native PostgreSQL protocol/trigger tests, not an RLS or production load proof.
// Runs the complete checked-in migration against disposable minimal source tables.
// Default: local Supabase Docker. --native: explicit loopback-only psql transport.
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';

const native = process.argv.includes('--native');
assert.ok(process.argv.slice(2).every(arg => arg === '--native'), 'only --native is accepted; no database URLs');
const database = `video_engagement_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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
let checks=0;
const pass=label=>{checks++;console.log(`ok ${checks} - ${label}`);};
const owner=randomUUID(),viewer=randomUUID(),video=randomUUID();
const actor=`select set_config('app.viewer',${literal(viewer)},false);`;
const like=state=>actor+`select public.set_creator_video_like(${literal(video)},${state});`;
const repost=state=>actor+`select public.set_creator_video_repost(${literal(video)},${state});`;
const total=column=>Number(query(`select coalesce(sum(${column}),0) from video_engagement_private.counts where video_id=${literal(video)};`));
async function race(label,holderSql,waiterSql,{failure=false,rollback=false}={}){
  const hname=`video-holder-${checks}`,wname=`video-waiter-${checks}`;
  const h=session(hname,`begin;${holderSql}select 'HOLDER_READY';`);
  await until(()=>h.output().includes('HOLDER_READY'),label+' holder ready');
  const w=session(wname,`begin;${waiterSql}commit;`);w.child.stdin.end('\\q\n');
  await until(()=>blocked(wname,hname),label+' genuine lock contention');
  await finish(h,rollback?'rollback;':'commit;');
  const result=await w.done;
  if(failure){assert.notEqual(result.code,0);assert.match(result.stderr,/Public profile|Account unavailable|Current signed-in|Video unavailable/);}
  else assert.equal(result.code,0,result.stderr);
  pass(label);
}
try{
  query(`create database ${database};`,'postgres');
  query(`do $$ begin
    if not exists(select from pg_roles where rolname='anon') then create role anon;end if;
    if not exists(select from pg_roles where rolname='authenticated') then create role authenticated;end if;
    if not exists(select from pg_roles where rolname='service_role') then create role service_role;end if;
  end $$;
  create schema auth;
  create table auth.users(id uuid primary key,banned_until timestamptz);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.viewer',true),'')::uuid$$;
  create table public.user_profiles(user_id text primary key,shares_visibility text default 'public',profile_access_visibility text default 'public',profile_visibility text default 'everyone');
  create table public.account_deletion_requests(id uuid default gen_random_uuid(),user_id uuid not null,status text);
  create table public.videos(id uuid primary key,owner_id uuid references auth.users(id),visibility text default 'public',moderation_status text default 'clean',
    scan_status text default 'clean',quarantined_at timestamptz,storage_path text,storage_object_key text,playback_url text);
  create table public.creator_video_comments(id uuid primary key,video_id uuid references public.videos(id) on delete cascade,parent_comment_id uuid,deleted_at timestamptz,moderation_status text default 'clean');
  create function public.is_account_access_restricted(value text) returns boolean language sql stable as $$
    select exists(select 1 from auth.users where id::text=value and banned_until>now())
      or exists(select 1 from public.account_deletion_requests where user_id::text=value and status in ('scheduled','completed'))
  $$;
  create function public.wave1_current_caller_authority_internal() returns boolean language sql stable as $$select auth.uid() is not null$$;
  create function public.media_scan_public_safe(value text) returns boolean language sql immutable as $$select value='clean'$$;
  create function public.can_read_creator_video_row(a text,b text,c text,d text,e text,f text,g text,h text) returns boolean language sql stable as $$select b='public' and c='clean' and d='clean'$$;
  create function public.can_view_profile_content(value text) returns boolean language sql stable as $$select exists(select 1 from public.user_profiles where user_id=value and profile_access_visibility='public')$$;
  insert into auth.users(id) values(${literal(owner)}),(${literal(viewer)});
  insert into public.user_profiles(user_id) values(${literal(owner)}),(${literal(viewer)});
  insert into public.videos(id,owner_id) values(${literal(video)},${literal(owner)});
  `);
  query(readFileSync('supabase/migrations/20261107173220_creator_video_social_engagement.sql','utf8'));
  await race('simultaneous duplicate likes serialize to one relation',like(true),like(true));
  assert.equal(total('like_count'),1);
  await race('like/unlike desired state serializes without lost decrement',like(true),like(false));
  assert.equal(total('like_count'),0);
  await race('rollback cannot leave phantom counts',like(true),like(false),{rollback:true});
  assert.equal(total('like_count'),0);
  await race('duplicate reposts publish once',repost(true),repost(true));
  assert.equal(total('repost_count'),1);
  query(repost(false));
  await race('profile privacy waits for an in-flight public repost then withdraws it',repost(true),
    `update public.user_profiles set shares_visibility='private' where user_id=${literal(viewer)};`);
  assert.equal(total('repost_count'),0);
  query(`update public.user_profiles set shares_visibility='public' where user_id=${literal(viewer)};`);
  await race('repost waiting for profile privacy change is denied',
    `update public.user_profiles set shares_visibility='private' where user_id=${literal(viewer)};`,repost(true),{failure:true});
  assert.equal(total('repost_count'),0);
  query(`update public.user_profiles set shares_visibility='public' where user_id=${literal(viewer)};`);
  await race('ban waits for repost then removes publication',repost(true),
    `update auth.users set banned_until=now()+interval '1 hour' where id=${literal(viewer)};`);
  assert.equal(total('repost_count'),0);
  query(`update auth.users set banned_until=null where id=${literal(viewer)};`);
  await race('deletion scheduling cannot leave a concurrent public repost',repost(true),
    `insert into public.account_deletion_requests(user_id,status) values(${literal(viewer)},'scheduled');`);
  assert.equal(total('repost_count'),0);
  query(`delete from public.account_deletion_requests where user_id=${literal(viewer)};`);
  await race('source withdrawal waits for repost and read authorization hides it',repost(true),
    `update public.videos set visibility='draft' where id=${literal(video)};`);
  assert.equal(query(actor+`select count(*) from public.read_authorized_creator_video_engagement(${literal(video)});`).split('\n').at(-1),'0');
  console.log(`PASS: ${checks} native concurrency cases; minimal source fixture only. Full-schema authority is tested separately.`);
}finally{
  for(const child of sessions)child.kill('SIGTERM');
  query(`drop database if exists ${database} with(force);`,'postgres');
}
