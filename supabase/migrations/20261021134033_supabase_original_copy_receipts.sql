-- Copy evidence foundation only, NOT a cutover or retention activation.
-- Trusted workers assert create-only upload plus independent full GET digest
-- and length equality. PostgreSQL cannot independently inspect provider bytes.
-- No upload reservations, clean scan results, legacy enrollment, source update,
-- historical audit marked updated, provider deletion, or rollout changes here.
-- A later cutover must allow the existing scanner triggers to run, then own the
-- fresh-scan success/rollback workflow. Never preserve/bypass scanner authority.
begin;

create table private.supabase_original_copy_receipts (
 id uuid primary key,
 table_name text not null check(table_name in ('videos','social_attachments')),
 row_id uuid not null,
 owner_id uuid not null,
 source_created_at text not null,
 parent_type text,
 parent_id uuid,
 source_snapshot_sha256 text not null check(source_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 source_binding jsonb not null check(jsonb_typeof(source_binding)='object'),
 old_provider text not null check(old_provider in ('supabase','supabase_storage')),
 old_bucket text not null,
 old_object_key text not null,
 old_storage_path text,
 target_provider text not null default 'cloudflare_r2' check(target_provider='cloudflare_r2'),
 target_bucket text not null default 'chillywood-media-origin' check(target_bucket='chillywood-media-origin'),
 target_key text not null unique,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 size_bytes bigint not null check(size_bytes>0),
 proof_assertions jsonb not null,
 recorded_at timestamptz not null default clock_timestamp(),
 -- Both locators are permanent evidence. No FK/cascade to account/source.
 check((table_name='videos' and parent_type is null and parent_id is null and old_bucket='creator-videos')
   or (table_name='social_attachments' and parent_type in ('profile_post','profile_post_comment',
    'creator_video_comment','chat_message','watch_party_room_message','room_message')
    and parent_id is not null and old_bucket='social-attachments')),
 check(target_key='originals/supabase-migration/'||id::text||'/'||table_name||'/'||row_id::text)
);
alter table private.supabase_original_copy_receipts enable row level security;
alter table private.supabase_original_copy_receipts force row level security;
revoke all on private.supabase_original_copy_receipts from public,anon,authenticated,service_role;
comment on table private.supabase_original_copy_receipts is
 'Immutable trusted-worker copy assertions, not byte verification by SQL, scan authority, delivery authority, cutover approval or deletion authority. Original Supabase object remains untouched. Retains minimal provenance and canonical full-row SHA-256, never a permanent duplicate of title/description/body.';

create function private.preserve_supabase_original_copy_receipt() returns trigger
language plpgsql set search_path='' as $$ begin
 raise exception 'supabase_copy_receipt_permanent' using errcode='55000';
end $$;
create trigger preserve_supabase_original_copy_receipt before update or delete
 on private.supabase_original_copy_receipts for each row
 execute function private.preserve_supabase_original_copy_receipt();
create trigger preserve_supabase_original_copy_receipt_truncate before truncate
 on private.supabase_original_copy_receipts for each statement
 execute function private.preserve_supabase_original_copy_receipt();

-- JSONB canonical full-row hash binds all fields without permanently retaining
-- source text. Callers supply UTC source JSON; live reads also pin UTC below.
create function private.supabase_original_copy_snapshot_sha256(p_source jsonb)
returns text language sql immutable set search_path='' as $$
 select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_source::text,'UTF8')),'hex')
$$;

create function private.read_supabase_original_copy_source(p_table_name text,p_row_id uuid)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare s jsonb;
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'supabase_copy_requires_read_committed' using errcode='25000'; end if;
 if p_table_name='videos' then
  select to_jsonb(v) into s from public.videos v where id=p_row_id for update;
 elsif p_table_name='social_attachments' then
  select to_jsonb(a) into s from public.social_attachments a where id=p_row_id for update;
 else raise exception 'supabase_copy_unsupported_table'; end if;
 if s is null or nullif(s->>'deleted_at','') is not null or nullif(s->>'hard_deleted_at','') is not null then
  raise exception 'supabase_copy_live_source_required'; end if;
 return s;
end $$;

-- This binding is not an upload reservation and does not grant a clean result.
create function private.supabase_original_copy_binding(p_table_name text,p_source jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare k text; owner_key text;
begin
 if p_table_name not in ('videos','social_attachments') or p_table_name is null then
  raise exception 'supabase_copy_unsupported_table'; end if;
 owner_key:=case p_table_name when 'videos' then p_source->>'owner_id' else p_source->>'owner_user_id' end;
 if coalesce(p_source->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or coalesce(owner_key,'') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or nullif(p_source->>'created_at','') is null then raise exception 'supabase_copy_source_identity_required'; end if;
 k:=coalesce(nullif(p_source->>'storage_object_key',''),p_source->>'storage_path');
 if coalesce(p_source->>'storage_provider','') not in ('supabase','supabase_storage')
  or p_source->>'storage_bucket' is distinct from (case p_table_name when 'videos' then 'creator-videos' else 'social-attachments' end)
  or k is null or length(k) not between 1 and 1024 or k !~ '^[A-Za-z0-9_./-]+$'
  or left(k,1)='/' or position('..' in k)>0 or k like 'backups/%' or k like 'playback/%'
  or (nullif(p_source->>'storage_path','') is not null and p_source->>'storage_path'<>k) then
  raise exception 'supabase_copy_exact_original_locator_required'; end if;
 if p_table_name='social_attachments' and (
  coalesce(p_source->>'surface_type','') not in ('profile_post','profile_post_comment','creator_video_comment',
   'chat_message','watch_party_room_message','room_message')
  or coalesce(p_source->>'surface_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
  raise exception 'supabase_copy_exact_parent_required'; end if;
 return jsonb_build_object('ownerId',owner_key,'createdAt',p_source->>'created_at',
  'parentType',case when p_table_name='social_attachments' then p_source->>'surface_type' end,
  'parentId',case when p_table_name='social_attachments' then p_source->>'surface_id' end,
  'provider',p_source->>'storage_provider','bucket',p_source->>'storage_bucket',
  'objectKey',k,'storagePath',p_source->>'storage_path');
end $$;

create function public.record_supabase_original_copy_receipt(
 p_receipt_id uuid,p_table_name text,p_row_id uuid,p_source_snapshot jsonb,
 p_target_key text,p_sha256 text,p_size_bytes bigint,p_proof_assertions jsonb
) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare s jsonb; b jsonb; existing private.supabase_original_copy_receipts; t record; found_ref boolean;
begin
 s:=private.read_supabase_original_copy_source(p_table_name,p_row_id);
 if s is distinct from p_source_snapshot then raise exception 'supabase_copy_source_changed'; end if;
 b:=private.supabase_original_copy_binding(p_table_name,s);
 if p_receipt_id is null or p_row_id is null or p_target_key is distinct from
  'originals/supabase-migration/'||p_receipt_id::text||'/'||p_table_name||'/'||p_row_id::text
  or p_target_key=b->>'objectKey' then
  raise exception 'supabase_copy_fresh_target_required'; end if;
 if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_size_bytes is null or p_size_bytes<=0
  or p_proof_assertions is distinct from jsonb_build_object('protocol','supabase-original-copy-v1',
   'sourceSha256',p_sha256,'targetSha256',p_sha256,'sourceSizeBytes',p_size_bytes,'targetSizeBytes',p_size_bytes,
   'createOnly',true,'independentReadback',true) then raise exception 'supabase_copy_readback_assertions_required'; end if;
 -- Serialize receipt identity/key collision attempts; not a provider lock and
 -- not an authorization to write, publish, cut over or clean up the object.
 perform pg_catalog.pg_advisory_xact_lock(176214,31);
 select * into existing from private.supabase_original_copy_receipts where id=p_receipt_id;
 if existing.id is not null then
  if (existing.table_name,existing.row_id,existing.source_snapshot_sha256,existing.source_binding,existing.target_key,
    existing.sha256,existing.size_bytes,existing.proof_assertions)
   is not distinct from (p_table_name,p_row_id,private.supabase_original_copy_snapshot_sha256(s),b,p_target_key,p_sha256,p_size_bytes,p_proof_assertions) then
   return jsonb_build_object('receiptId',existing.id,'recorded',true,'alreadyRecorded',true,'cutoverAllowed',false); end if;
  raise exception 'supabase_copy_receipt_conflict';
 end if;
 if exists(select 1 from private.deleted_media_key_retirements where object_key=p_target_key)
  or exists(select 1 from private.deleted_media_legacy_provenance where object_key=p_target_key)
  or exists(select 1 from private.deleted_media_legacy_delivery_revocations where object_key=p_target_key)
  or exists(select 1 from public.media_upload_reservations where storage_object_key=p_target_key)
  or exists(select 1 from private.media_object_storage_migration_audit where new_storage_object_key=p_target_key) then
  raise exception 'supabase_copy_target_history_conflict'; end if;
 -- A copy receipt cannot adopt a target already named by application rows.
 -- This check records only the current database observation, not a provider
 -- lease or a substitute for future cutover/writer/reference fencing.
 for t in select c.oid,c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and cardinality(private.deleted_media_locator_columns(c.oid))>0 loop
  execute format('select exists(select 1 from public.%I x where private.deleted_media_mentions(private.deleted_media_locator_document(to_jsonb(x),%s::oid),$1))',t.relname,t.oid)
   into found_ref using p_target_key;
  if found_ref then raise exception 'supabase_copy_target_reference_conflict'; end if;
 end loop;
 insert into private.supabase_original_copy_receipts(id,table_name,row_id,owner_id,source_created_at,parent_type,parent_id,
  source_snapshot_sha256,source_binding,old_provider,old_bucket,old_object_key,old_storage_path,target_key,sha256,size_bytes,proof_assertions)
 values(p_receipt_id,p_table_name,p_row_id,(b->>'ownerId')::uuid,b->>'createdAt',b->>'parentType',(b->>'parentId')::uuid,
  private.supabase_original_copy_snapshot_sha256(s),b,b->>'provider',b->>'bucket',b->>'objectKey',b->>'storagePath',p_target_key,p_sha256,p_size_bytes,p_proof_assertions);
 return jsonb_build_object('receiptId',p_receipt_id,'recorded',true,'alreadyRecorded',false,'cutoverAllowed',false);
end $$;

-- Diagnostic only. The row lock gives the compare phase an exact live source;
-- it expires with this transaction and is NOT a token for any later mutation.
-- Even an otherwise clear preflight remains blocked until an independently
-- reviewed cutover/fresh-scan success/rollback workflow exists.
create function public.preflight_supabase_original_copy_cutover(p_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare r private.supabase_original_copy_receipts; s jsonb; b jsonb; kind text;
 t record; found_ref boolean; predicate text; source_oid oid; reason text;
begin
 select * into r from private.supabase_original_copy_receipts where id=p_receipt_id;
 if r.id is null then return jsonb_build_object('cutoverAllowed',false,'reason','copy_receipt_required'); end if;
 s:=private.read_supabase_original_copy_source(r.table_name,r.row_id);
 if private.supabase_original_copy_snapshot_sha256(s) is distinct from r.source_snapshot_sha256 then
  return jsonb_build_object('cutoverAllowed',false,'reason','source_changed'); end if;
 b:=private.supabase_original_copy_binding(r.table_name,s);
 kind:=case r.table_name when 'videos' then 'creator_video' else 'social_attachment' end;
 source_oid:=case r.table_name when 'videos' then 'public.videos'::regclass else 'public.social_attachments'::regclass end;
 if exists(select 1 from public.legal_holds h where h.status='active'
  and private.deleted_content_hold_matches(h.target_type,h.target_id,kind,r.row_id::text,
   r.owner_id::text,r.parent_type,r.parent_id::text)) then reason:='legal_hold';
 elsif exists(select 1 from jsonb_each(s) x(k,v) where k ~* '(url|uri|path|object_key|locator|manifest|playback)'
    and k not in ('storage_object_key','storage_path') and v not in ('null'::jsonb,'""'::jsonb))
  or private.deleted_media_mentions(private.deleted_media_locator_document(s,source_oid)-array['storage_object_key','storage_path'],r.old_object_key)
  or (r.table_name='videos' and exists(select 1 from public.video_renditions x where x.video_id=r.row_id))
  or exists(select 1 from public.media_renditions x where (r.table_name='videos' and x.video_id=r.row_id)
    or (x.source_type=kind and x.source_id=r.row_id::text))
  or exists(select 1 from public.media_transcode_jobs x where x.source_type=kind and x.source_id=r.row_id::text) then
  reason:='secondary_media_or_alias_uncovered';
 elsif s->>'scan_status' is distinct from 'clean' or nullif(s->>'scanned_at','') is null
  or nullif(s->>'quarantined_at','') is not null
  or not exists(select 1 from public.media_scan_jobs j where j.target_table=r.table_name and j.target_id=r.row_id::text
    and j.target_column=case r.table_name when 'videos' then 'source' else 'attachment' end
    and j.storage_provider in ('supabase','supabase_storage') and j.storage_bucket=r.old_bucket
    and j.storage_object_key=r.old_object_key and j.status='clean' and j.completed_at is not null)
  or exists(select 1 from public.media_scan_jobs j where j.target_table=r.table_name and j.target_id=r.row_id::text
    and j.status is distinct from 'clean') then reason:='source_scan_unresolved';
 elsif exists(select 1 from private.deleted_media_key_retirements where object_key in (r.old_object_key,r.target_key))
  or exists(select 1 from private.deleted_media_legacy_provenance where object_key in (r.old_object_key,r.target_key))
  or exists(select 1 from private.deleted_media_legacy_delivery_revocations where object_key in (r.old_object_key,r.target_key))
  or exists(select 1 from private.media_object_storage_migration_audit where new_storage_object_key in (r.old_object_key,r.target_key)) then
  reason:='object_history_conflict';
 elsif not private.deleted_media_reference_coverage_ready() then reason:='reference_coverage_incomplete';
 end if;
 if reason is not null then return jsonb_build_object('cutoverAllowed',false,'reason',reason,'receiptId',r.id); end if;
 -- Conservative locator scan across all public consumer tables. No original
 -- rendition aliases accepted in this phase. Only this exact source and its
 -- exact clean historical scan receipt may still name the old object.
 for t in select c.oid,c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and cardinality(private.deleted_media_locator_columns(c.oid))>0 loop
  predicate:='true';
  if t.relname=r.table_name then predicate:=format('id::text<>%L',r.row_id::text); end if;
  if t.relname='media_scan_jobs' then predicate:=format(
   'not coalesce((target_table=%L and target_id=%L and target_column=%L and storage_provider in (''supabase'',''supabase_storage'') and storage_bucket=%L and storage_object_key=%L and status=''clean'' and completed_at is not null),false)',
   r.table_name,r.row_id::text,case r.table_name when 'videos' then 'source' else 'attachment' end,r.old_bucket,r.old_object_key); end if;
  execute format('select exists(select 1 from public.%I x where %s and (private.deleted_media_mentions(private.deleted_media_locator_document(to_jsonb(x),%s::oid),$1) or private.deleted_media_mentions(private.deleted_media_locator_document(to_jsonb(x),%s::oid),$2)))',t.relname,predicate,t.oid,t.oid)
   into found_ref using r.old_object_key,r.target_key;
  if found_ref then return jsonb_build_object('cutoverAllowed',false,'reason','alias_or_live_reference','receiptId',r.id); end if;
 end loop;
 return jsonb_build_object('cutoverAllowed',false,'reason','fresh_scan_required_after_locator_cutover',
  'receiptId',r.id,'sourceMatches',true,'cutoverImplemented',false,'oldObjectDeletionAllowed',false);
end $$;

revoke all on function private.preserve_supabase_original_copy_receipt(),
 private.read_supabase_original_copy_source(text,uuid),private.supabase_original_copy_binding(text,jsonb),
 private.supabase_original_copy_snapshot_sha256(jsonb)
 from public,anon,authenticated,service_role;
revoke all on function public.record_supabase_original_copy_receipt(uuid,text,uuid,jsonb,text,text,bigint,jsonb),
 public.preflight_supabase_original_copy_cutover(uuid) from public,anon,authenticated,service_role;
grant execute on function public.record_supabase_original_copy_receipt(uuid,text,uuid,jsonb,text,text,bigint,jsonb),
 public.preflight_supabase_original_copy_cutover(uuid) to service_role;
comment on function public.record_supabase_original_copy_receipt(uuid,text,uuid,jsonb,text,text,bigint,jsonb) is
 'Trusted migration worker only. Exact source CAS and immutable copy assertions, not SQL byte verification. Does not change source, scanner state, migration audit, enrollment, delivery or retention.';
comment on function public.preflight_supabase_original_copy_cutover(uuid) is
 'Deny-only, transaction-local source comparison. Always cutoverAllowed=false. Normal key-change scanner triggers require a fresh-scan/rollback workflow not implemented here; no later write is authorized by this result.';
commit;
