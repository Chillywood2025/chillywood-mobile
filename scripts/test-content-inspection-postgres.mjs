#!/usr/bin/env node
// Disposable PGlite smoke test of the entire migration, not production parity
// or the full canonical legal/session dependency graph. pgTAP covers that graph.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const uid = n => `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sid = n => `a2000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const target = uid(50);
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const call = async (n, sql, params = []) => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub: uid(n),session_id: sid(n),role:'authenticated'})]);
  await db.exec('set role authenticated');
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); }
};
const reject = async (fn, pattern, label) => { await assert.rejects(fn, pattern, label); checks++; };
const read = (n, context, id = target, request = randomUUID()) => call(n,
  'select public.admin_read_content_inspection($1,$2,$3,$4,$5) as result', [context,'profile_post',id,'Synthetic review',request]);
const extract = (file,name) => {
  const source=readFileSync(file,'utf8');
  const start=source.indexOf(`create or replace function public."${name}"`);
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('$$;',start)+3);
};
try {
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to authenticated;
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz,deleted_at timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
    create table public.platform_role_memberships(user_id text,role text,status text,expires_at timestamptz);
    create table public.fixture_restrictions(user_id text primary key);
    create function public.is_account_access_restricted(p text) returns boolean language sql stable as $$ select exists(select 1 from public.fixture_restrictions where user_id=p) $$;
    create function public.is_account_deletion_scheduled(p text) returns boolean language sql stable as $$ select false $$;
    -- Local smoke fixture only: real legal acceptance graph is tested in pgTAP.
    create function public.wave1_current_caller_authority_internal() returns boolean language sql stable as $$ select not public.is_account_access_restricted(auth.uid()::text) $$;
    create table public.profile_posts(id uuid primary key,user_id text,body text,updated_at timestamptz,visibility text,moderation_status text,deleted_at timestamptz);
    create table public.profile_post_comments(like public.profile_posts);
    create table public.creator_video_comments(like public.profile_posts);
    create table public.chat_messages(id uuid primary key,sender_user_id text,body text,moderation_status text);
    create table public.watch_party_room_messages(id uuid primary key,user_id text,text text);
    create table public.videos(id uuid primary key,owner_id uuid,title text,description text,storage_provider text,storage_bucket text,storage_object_key text,storage_path text,mime_type text,file_size_bytes bigint,scan_status text,quarantined_at timestamptz,updated_at timestamptz);
    create table public.social_attachments(id uuid primary key,owner_user_id text,surface_type text,surface_id uuid,storage_provider text,storage_bucket text,storage_object_key text,storage_path text,mime_type text,size_bytes bigint,scan_status text,quarantined_at timestamptz,updated_at timestamptz,moderation_status text,deleted_at timestamptz);
    create table public.media_scan_jobs(id uuid primary key,target_table text,target_column text,target_id text,owner_user_id text,storage_provider text,storage_bucket text,storage_object_key text,mime_type text,size_bytes bigint,status text,completed_at timestamptz,updated_at timestamptz);
    create table public.media_upload_reservations(id uuid primary key,owner_user_id uuid,surface_type text,storage_provider text,storage_bucket text,storage_object_key text,expected_mime_type text,expected_size_bytes bigint,status text,expires_at timestamptz,observed_mime_type text,observed_size_bytes bigint,verified_at timestamptz,attached_record_id text,attached_at timestamptz,deleted_at timestamptz,updated_at timestamptz);
    create function public.has_verified_legacy_media_object_provenance(text,text,text,text,text) returns boolean language sql as $$ select false $$;
    create function public.money_purchase_intent_session_authorized_internal(uuid,text) returns boolean language sql as $$ select true $$;
  `);
  await db.exec(extract('supabase/migrations/20260826055737_exact_current_session_not_after_authority.sql','wave1_session_authority_readback'));
  for(const name of ['platform_exact_current_session_authority_internal','platform_subject_has_role_internal']) {
    await db.exec(extract('supabase/migrations/202608250004_platform_role_exact_subject_closure.sql',name));
  }
  await db.exec(readFileSync('supabase/migrations/20261020010608_owner_content_inspection_disabled.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261020011354_content_inspection_verified_media.sql','utf8'));
  for(const table of ['profile_posts','profile_post_comments','creator_video_comments','chat_messages','watch_party_room_messages','social_attachments']) {
    await db.exec(`alter table public.${table} add column created_at timestamptz default now()`);
  }
  await db.exec('alter table public.videos add column created_at timestamp default now()');
  await db.exec(readFileSync('supabase/migrations/20261020011409_content_inspection_subject_browse.sql','utf8'));
  for(let n=1;n<=6;n++) {
    await db.query('insert into auth.users values($1,now(),null)',[uid(n)]);
    await db.query('insert into auth.sessions values($1,$2,now()+interval \'1 hour\')',[sid(n),uid(n)]);
  }
  for(const [n,role] of [[1,'owner'],[2,'super_admin'],[3,'operator'],[4,'moderator']]) {
    await db.query("insert into public.platform_role_memberships values($1,$2,'active',null)",[uid(n),role]);
  }
  await db.query("insert into public.profile_posts(id,user_id,body,updated_at,visibility,moderation_status,deleted_at) values($1,$2,$3,now(),'draft','removed',now())",[target,uid(5),'  Original <script>inert</script> text\n']);
  await reject(()=>call(1,'select public.admin_list_content_inspection_contexts($1,$2)',['Synthetic review',randomUUID()]),/content_inspection_disabled/,'disabled by default');
  await db.exec('update private.content_inspection_settings set enabled=true');
  const [{result:created}]=await call(1,'select public.admin_create_content_inspection_context($1,$2,$3) as result',['Synthetic review',JSON.stringify([{targetType:'profile_post',targetId:target}]),randomUUID()]);
  const context=created.contextId;
  const [{result:superCreated}]=await call(2,'select public.admin_create_content_inspection_context($1,$2,$3) as result',['Synthetic SA review',JSON.stringify([{targetType:'profile_post',targetId:target}]),randomUUID()]);
  const superContext=superCreated.contextId;
  const [{result:ownerRead}]=await read(1,context);
  check(ownerRead.content.body==='  Original <script>inert</script> text\n','unchanged removed/draft stored body');
  check(ownerRead.deletedRetentionAvailability==='not_implemented','no deleted retention claim');
  check((await db.query("select count(*)::int as n from private.content_inspection_access_events where operation='read' and actor=$1",[uid(1)])).rows[0].n===0,'exact Owner read exempt from inspection access event');
  check((await read(2,superContext))[0].result.availability==='available','Super Admin own-context view');
  await reject(()=>read(2,context),/content_inspection_denied/,'Super Admin cannot inspect unshared Owner context');
  check((await call(2,'select public.admin_list_content_inspection_contexts($1,$2) as result',['Synthetic listing',randomUUID()]))[0].result.contexts.every(c=>c.contextId!==context),'Super Admin list hides Owner context metadata');
  await reject(()=>read(3,context),/content_inspection_denied/,'operator needs exact grant');
  await reject(()=>read(4,context),/content_inspection_denied/,'moderator denied');
  await reject(()=>read(5,context),/content_inspection_denied/,'ordinary denied');
  const grantSql='select public.admin_grant_content_inspection_access($1,$2,$3,$4,clock_timestamp()+interval \'1 hour\',$5,$6) as result';
  const grantArgs=[context,'profile_post',target,uid(3),'Synthetic grant',randomUUID()];
  await reject(()=>call(2,grantSql,grantArgs),/content_inspection_denied/,'Super Admin cannot delegate');
  const [{result:grant}]=await call(1,grantSql,grantArgs);
  await reject(()=>call(1,grantSql,[...grantArgs.slice(0,-1),randomUUID()]),/content_inspection_grant_exists/,'unknown-outcome new request cannot create parallel grant or renew expiry');
  check((await db.query('select count(*)::int as n from private.content_inspection_grants where context_id=$1 and grantee=$2',[context,uid(3)])).rows[0].n===1,'duplicate retry leaves one original grant');
  check((await read(3,context))[0].result.content.body===ownerRead.content.body,'exact operator grant works');
  await reject(()=>read(3,context,uid(51)),/content_inspection_denied/,'wrong target denied');
  await reject(()=>read(3,uid(90)),/content_inspection_denied/,'wrong context denied');
  await reject(()=>call(3,'select * from private.content_inspection_access_events'),/permission denied/,'private direct read denied');
  await reject(()=>call(3,'select private.content_inspection_source($1,$2)',['profile_post',target]),/permission denied/,'private source helper denied');
  const request=randomUUID(); await read(3,context,target,request);
  await reject(()=>read(3,context,target,request),/content_inspection_request_reused/,'audited request cannot replay');
  const ownerRequest=randomUUID(); await read(1,context,target,ownerRequest);
  check((await read(1,context,target,ownerRequest))[0].result.availability==='available','Owner repeated read freshly authorized without a fake event');
  await db.query('update auth.sessions set not_after=now()-interval \'1 second\' where id=$1',[sid(3)]);
  await reject(()=>read(3,context),/content_inspection_denied/,'expired exact session denied');
  await db.query('update auth.sessions set not_after=now()+interval \'1 hour\' where id=$1',[sid(3)]);
  await db.query("insert into public.fixture_restrictions values($1)",[uid(3)]);
  await reject(()=>read(3,context),/content_inspection_denied/,'restricted actor denied');
  await db.exec('delete from public.fixture_restrictions');
  await db.exec("create function private.fixture_audit_failure() returns trigger language plpgsql as $$ begin raise exception 'synthetic_audit_failure'; end; $$; create trigger fixture_audit_failure before insert on private.content_inspection_access_events for each row execute function private.fixture_audit_failure();");
  await reject(()=>read(2,superContext),/synthetic_audit_failure/,'audit failure prevents Super Admin return');
  await db.exec('drop trigger fixture_audit_failure on private.content_inspection_access_events');
  await db.query("update public.profile_posts set user_id=$1 where id=$2",[uid(1),target]);
  await reject(()=>read(2,superContext),/content_inspection_denied/,'Super Admin Owner-target denied');
  await reject(()=>read(3,context),/content_inspection_denied/,'operator Owner-target denied');
  await db.query('update public.profile_posts set user_id=$1 where id=$2',[uid(5),target]);
  const video=uid(60), scan=uid(61), reservation=uid(62);
  await db.query("insert into public.videos(id,owner_id,title,description,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes,scan_status,quarantined_at,updated_at) values($1,$2,'Original title','Stored description','cloudflare_r2','private-origin','immutable/source.mp4',null,'video/mp4',4096,'clean',null,now())",[video,uid(5)]);
  await db.query("insert into public.media_scan_jobs values($1,'videos','source',$2,$3,'cloudflare_r2','private-origin','immutable/source.mp4','video/mp4',4096,'clean',now(),now())",[scan,video,uid(5)]);
  await db.query("insert into public.media_upload_reservations values($1,$2,'creator_video','cloudflare_r2','private-origin','immutable/source.mp4','video/mp4',4096,'verified',now()+interval '1 hour','video/mp4',4096,now(),$3,now(),null,now())",[reservation,uid(5),video]);
  const [{result:mediaContextResult}]=await call(1,'select public.admin_create_content_inspection_context($1,$2,$3) as result',['Synthetic media review',JSON.stringify([{targetType:'creator_video',targetId:video}]),randomUUID()]);
  const mediaContext=mediaContextResult.contextId;
  const [{result:mediaGrant}]=await call(1,grantSql,[mediaContext,'creator_video',video,uid(3),'Synthetic media grant',randomUUID()]);
  const prepare = n => call(n,'select public.admin_prepare_content_inspection_media($1,$2,$3,$4,$5) as result',[mediaContext,'creator_video',video,'Synthetic media review',randomUUID()]);
  const [{result:receipt}]=await prepare(3);
  check(receipt.availability==='ready' && receipt.mediaKind==='video','exact verified original prepares');
  check(!JSON.stringify(receipt).includes('private-origin')&&!JSON.stringify(receipt).includes('source.mp4'),'client descriptor contains no coordinates');
  const authorize=(n,version=receipt.storedVersion)=>call(n,'select public.admin_authorize_content_inspection_media($1,$2,$3) as result',[receipt.receiptId,randomUUID(),version]);
  await reject(()=>authorize(1),/content_inspection_denied/,'even Owner cannot use another actor receipt');
  await reject(()=>authorize(3,'0'.repeat(32)),/content_inspection_stale_version/,'wrong version denied');
  const [{result:authorization}]=await authorize(3);
  await reject(()=>call(3,'select public.admin_resolve_content_inspection_media($1,$2,$3)',[authorization.authorizationId,uid(3),sid(3)]),/permission denied/,'client cannot call internal origin resolver');
  const resolve=async(actor=uid(3),session=sid(3))=>{
    await db.exec('set role service_role');
    try{return (await db.query('select public.admin_resolve_content_inspection_media($1,$2,$3) as result',[authorization.authorizationId,actor,session])).rows[0].result;}
    finally{await db.exec('reset role');}
  };
  await reject(()=>resolve(uid(1),sid(1)),/content_inspection_denied/,'resolver exact actor/session binding');
  check((await resolve()).objectKey==='immutable/source.mp4','service-only exact binding resolved');
  await reject(()=>resolve(),/content_inspection_denied/,'origin authorization single use');
  check((await authorize(3))[0].result.allowed,'final fresh authorization after origin succeeds');
  await db.query("update public.media_scan_jobs set status='quarantined' where id=$1",[scan]);
  await reject(()=>authorize(3),/content_inspection_stale_version/,'postfetch quarantine prevents delivery');
  check((await prepare(3))[0].result.availability==='unsupported_media_inspection','quarantined original not prepared');
  await db.query("update public.media_scan_jobs set status='clean' where id=$1",[scan]);
  await call(1,'select public.admin_revoke_content_inspection_access($1,$2,$3)',[mediaGrant.grantId,'Synthetic media revoke',randomUUID()]);
  await reject(()=>authorize(3),/content_inspection_denied/,'postfetch grant revocation prevents delivery');
  const [{result:ownerMediaReceipt}]=await prepare(1);
  check(ownerMediaReceipt.availability==='ready','Owner media operational receipt still required');
  check((await db.query("select count(*)::int as n from private.content_inspection_access_events where actor=$1 and operation in ('prepare_media','authorize_media')",[uid(1)])).rows[0].n===0,'Owner media app access exemption');
  check((await db.query("select count(*)::int as n from private.content_inspection_access_events where actor=$1 and operation='authorize_media'",[uid(3)])).rows[0].n===2,'operator media authorizations audited');
  await call(1,'select public.admin_revoke_content_inspection_access($1,$2,$3)',[grant.grantId,'Synthetic revoke',randomUUID()]);
  await reject(()=>read(3,context),/content_inspection_denied/,'committed revoke denies subsequent read');
  await call(1,'select public.admin_close_content_inspection_context($1,$2,$3)',[context,'Synthetic closure',randomUUID()]);
  await reject(()=>read(1,context),/content_inspection_denied/,'closed context denies Owner');
  await reject(()=>db.exec('delete from private.content_inspection_access_events'),/content_inspection_audit_immutable/,'audit append-only');
  check((await call(1,'select public.admin_list_content_inspection_contexts($1,$2) as result',['Synthetic listing',randomUUID()]))[0].result.canDelegate===true,'exact Owner capability');
  await db.query("insert into public.profile_posts(id,user_id,body,created_at) select gen_random_uuid(),$1,'Never return this body','2026-01-01T00:00:00Z' from generate_series(1,51)",[uid(5)]);
  const browse=(n,before=null,id=null)=>call(n,'select public.admin_list_content_inspection_subject_targets($1,$2,$3,$4,$5,$6) as result',[uid(5),'profile_post','Synthetic browse',randomUUID(),before,id]);
  const [{result:page1}]=await browse(1);
  check(page1.targets.length===50&&page1.hasMore,'bounded subject metadata first page');
  check(!JSON.stringify(page1).includes('Never return this body'),'browse never projects stored body');
  const [{result:page2}]=await browse(1,page1.nextCursor.createdAt,page1.nextCursor.id);
  check(page2.targets.length===1&&!page2.hasMore,'composite cursor retains tied timestamp tail');
  check(new Set([...page1.targets,...page2.targets].map(x=>x.targetId)).size===51,'composite cursor no repeats');
  await reject(()=>browse(3),/content_inspection_denied/,'delegated operator cannot enumerate subject');
  // Deleted fallback isolated from capture triggers here. The canonical pgTAP
  // runs use the actual retention migration and real account/session helpers.
  await db.exec(`create table private.deleted_content_retention_settings(capture_enabled boolean);
    insert into private.deleted_content_retention_settings values(false);
    create table private.deleted_content_records(id uuid default gen_random_uuid(),target_type text,target_id text,author text,content jsonb,
      source_updated_at timestamptz,deleted_at timestamptz,expires_at timestamptz,owner_protected boolean);`);
  const retentionSource=readFileSync('supabase/migrations/20261020011840_deleted_content_retention.sql','utf8');
  const retentionStart=retentionSource.indexOf('create function private.read_deleted_content_inspection(');
  assert.ok(retentionStart>=0);
  await db.exec(retentionSource.slice(retentionStart,retentionSource.indexOf('$$;',retentionStart)+3));
  await db.exec(readFileSync('supabase/migrations/20261020012144_content_inspection_deleted_fallback.sql','utf8'));
  check((await db.query('select private.content_inspection_source($1,$2) as source',['profile_post',target])).rows[0].source===null,'soft-deleted live row cannot bypass absent retained record');
  await db.query("insert into private.deleted_content_records(target_type,target_id,author,content,deleted_at,expires_at,owner_protected) values('profile_post',$1,$2,$3,now(),now()+interval '30 days',true)",[target,uid(5),JSON.stringify({body:'Exact deletion snapshot'})]);
  check((await db.query('select private.content_inspection_source($1,$2) as source',['profile_post',target])).rows[0].source===null,'disabled retention does not expose records');
  await db.exec('update private.deleted_content_retention_settings set capture_enabled=true');
  check((await db.query('select private.content_inspection_source($1,$2) as source',['profile_post',target])).rows[0].source.content.body==='Exact deletion snapshot','eligible actual deletion record available');
  check((await db.query('select private.content_inspection_owner_target($1,$2) as protected',['profile_post',target])).rows[0].protected,'retained Owner protection survives current role differences');
  await db.query("update private.deleted_content_records set expires_at=clock_timestamp()-interval '1 second' where target_id=$1",[target]);
  check((await db.query('select private.content_inspection_source($1,$2) as source',['profile_post',target])).rows[0].source===null,'expired archive never falls through to soft-deleted row');
  await db.query('update public.profile_posts set deleted_at=null,body=$1 where id=$2',['Live edited current text',target]);
  check((await db.query('select private.content_inspection_source($1,$2) as source',['profile_post',target])).rows[0].source.content.body==='Live edited current text','live current text wins, no edit history');
  console.log(`Content inspection SQL smoke: ${checks} checks passed. Full canonical pgTAP and two-backend concurrency remain separate requirements.`);
} finally { await db.close(); }
