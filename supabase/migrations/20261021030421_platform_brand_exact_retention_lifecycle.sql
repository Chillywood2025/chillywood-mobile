begin;
-- SOURCE ONLY. No activation, provider calls, credential changes, or global
-- readiness promotion. Brand identity is not a transcode job/reservation.
-- Storage metadata is an incarnation observation, NOT byte/scan evidence.
lock table public.platform_brand_assets, storage.objects in share row exclusive mode;
create table private.platform_brand_object_incarnations (
 asset_id uuid primary key, owner_id text not null, source_created_at timestamptz not null,
 provider text not null check(provider in ('supabase','s3')),
 bucket text not null check(bucket='platform-brand-assets'), object_key text not null, storage_path text not null,
 storage_object_id uuid, storage_version text,
 observed_at timestamptz not null default clock_timestamp(),
 removed_at timestamptz, retain_until timestamptz,
 removal_clock text check(removal_clock in ('server_observed_removal','legacy_unknown_conservative_observation')),
 check ((removed_at is null and retain_until is null) or retain_until=removed_at+interval '720 hours')
);
create table private.platform_brand_object_proofs (
 asset_id uuid primary key references private.platform_brand_object_incarnations(asset_id),
 binding jsonb not null, origin_sha256 text not null check(origin_sha256 ~ '^[0-9a-f]{64}$'),
 origin_size_bytes bigint not null check(origin_size_bytes>0 and origin_size_bytes<=536870912),
 scan_receipt_id uuid not null, recorded_at timestamptz not null default clock_timestamp()
);
create table private.platform_brand_expiry_claims (
 asset_id uuid primary key references private.platform_brand_object_incarnations(asset_id),
 claim_token uuid not null unique default gen_random_uuid(),
 claimed_at timestamptz not null default clock_timestamp(),
 observed_absent_at timestamptz
);
create table private.platform_brand_retention_settings (
 singleton boolean primary key default true check(singleton),
 expiry_enabled boolean not null default false,
 writer_drain_evidence_sha256 text, reference_review_evidence_sha256 text,
 check(not expiry_enabled or (writer_drain_evidence_sha256 ~ '^[0-9a-f]{64}$'
   and reference_review_evidence_sha256 ~ '^[0-9a-f]{64}$'
   and writer_drain_evidence_sha256 is not null and reference_review_evidence_sha256 is not null))
);
insert into private.platform_brand_retention_settings default values;
do $$ declare t text; begin
 foreach t in array array['platform_brand_object_incarnations','platform_brand_object_proofs','platform_brand_expiry_claims','platform_brand_retention_settings'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

create function private.platform_brand_retention_lock() returns void
language plpgsql security definer set search_path='' as $$ begin
 if current_setting('transaction_isolation')<>'read committed' then
   raise exception 'brand_retention_read_committed_required' using errcode='25000'; end if;
 perform pg_advisory_xact_lock(176214,30);
end $$;

create function private.platform_brand_retention_immutable() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then
   if tg_table_name='platform_brand_object_incarnations' then
     if old.removed_at is null and new.removed_at is not null
       and new.retain_until=new.removed_at+interval '720 hours'
       and new.removal_clock='server_observed_removal'
       and (to_jsonb(old)-array['removed_at','retain_until','removal_clock'])=(to_jsonb(new)-array['removed_at','retain_until','removal_clock']) then return new; end if;
   elsif tg_table_name='platform_brand_expiry_claims' then
     if old.observed_absent_at is null and new.observed_absent_at is not null
       and (to_jsonb(old)-'observed_absent_at')=(to_jsonb(new)-'observed_absent_at') then return new; end if;
   end if;
 end if;
 raise exception 'brand_retention_identity_permanent';
end $$;
do $$ declare t text; begin
 foreach t in array array['platform_brand_object_incarnations','platform_brand_object_proofs','platform_brand_expiry_claims'] loop
 execute format('create trigger brand_retention_immutable before update or delete on private.%I for each row execute function private.platform_brand_retention_immutable()',t);
 execute format('create trigger brand_retention_no_truncate before truncate on private.%I for each statement execute function private.platform_brand_retention_immutable()',t);
 end loop;
end $$;

-- Existing rows receive only an exact current metadata observation. No historical
-- scan is copied and deleted legacy rows start a new conservative 720h window.
insert into private.platform_brand_object_incarnations
 (asset_id,owner_id,source_created_at,provider,bucket,object_key,storage_path,storage_object_id,storage_version,removed_at,retain_until,removal_clock)
select a.id,a.owner_user_id,a.created_at,a.storage_provider,a.storage_bucket,a.storage_object_key,a.storage_path,
 o.id,nullif(to_jsonb(o)->>'version',''),
 case when a.deleted_at is not null then statement_timestamp() end,
 case when a.deleted_at is not null then statement_timestamp()+interval '720 hours' end,
 case when a.deleted_at is not null then 'legacy_unknown_conservative_observation' end
from public.platform_brand_assets a left join storage.objects o
 on a.storage_provider='supabase' and a.storage_bucket=o.bucket_id
 and a.storage_object_key=o.name and a.storage_path=a.storage_object_key;

create function private.guard_platform_brand_retained_asset() returns trigger
language plpgsql security definer set search_path='' as $$
declare o storage.objects%rowtype; r private.platform_brand_object_incarnations%rowtype; t timestamptz; referenced boolean;
begin
 perform private.platform_brand_retention_lock();
 if tg_op='DELETE' then raise exception 'brand_retention_soft_delete_required'; end if;
 if tg_op='INSERT' then
   if exists(select 1 from private.platform_brand_object_incarnations where asset_id=new.id
     or (provider=new.storage_provider and bucket=new.storage_bucket and object_key=new.storage_object_key)) then
     raise exception 'brand_retention_key_reuse_forbidden'; end if;
   if new.deleted_at is not null then raise exception 'brand_insert_tombstone_forbidden'; end if;
   if new.storage_provider='supabase' then
     if new.storage_object_key is distinct from new.storage_path then raise exception 'brand_exact_storage_path_required'; end if;
     select * into o from storage.objects where bucket_id=new.storage_bucket and name=new.storage_object_key for update;
     if o.id is null or nullif(to_jsonb(o)->>'version','') is null then raise exception 'brand_storage_incarnation_required'; end if;
   end if;
   insert into private.platform_brand_object_incarnations(asset_id,owner_id,source_created_at,provider,bucket,object_key,storage_path,storage_object_id,storage_version)
   values(new.id,new.owner_user_id,new.created_at,new.storage_provider,new.storage_bucket,new.storage_object_key,new.storage_path,o.id,nullif(to_jsonb(o)->>'version',''));
 else
   if (new.id,new.owner_user_id,new.created_at,new.storage_provider,new.storage_bucket,new.storage_object_key,new.storage_path)
     is distinct from (old.id,old.owner_user_id,old.created_at,old.storage_provider,old.storage_bucket,old.storage_object_key,old.storage_path) then
     raise exception 'brand_retention_asset_identity_immutable'; end if;
   if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then raise exception 'brand_retention_tombstone_permanent'; end if;
   if old.deleted_at is null and new.deleted_at is not null then
     referenced:=exists(select 1 from public.platform_brand_profiles p where old.id=any(array[p.hero_image_asset_id,p.hero_video_asset_id,p.hero_poster_asset_id,p.background_image_asset_id,p.avatar_asset_id,p.logo_asset_id,p.watermark_asset_id]));
     if to_regclass('public.platform_brand_publications') is not null then
       referenced:=referenced or exists(select 1 from public.platform_brand_publications p where old.id=any(array[p.hero_image_asset_id,p.hero_video_asset_id,p.hero_poster_asset_id,p.background_image_asset_id,p.avatar_asset_id,p.logo_asset_id,p.watermark_asset_id]));
     end if;
     -- Preserve the established, audited reviewer safety archive, not creator
     -- self-review, a caller-supplied context alone, or a service-role bypass.
     if referenced then
     if not coalesce(
       auth.uid() is not null
       and current_setting('app.platform_brand_review_context',true)='review_platform_brand_asset'
       and new.moderation_status='removed' and new.asset_state='archived'
       and new.moderated_by=auth.uid()::text and new.moderated_at is not null
       and length(btrim(coalesce(new.moderation_reason,'')))>=6
       and (public.has_platform_role(array['owner'::text,'operator'::text])
         or public.has_platform_permission('content_moderation')
         or public.has_platform_permission('reports_review')),false) then
       raise exception 'brand_asset_in_use';
     end if;
     end if;
     t:=clock_timestamp(); new.deleted_at:=t; new.asset_state:='archived';
     update private.platform_brand_object_incarnations set removed_at=t,retain_until=t+interval '720 hours',removal_clock='server_observed_removal' where asset_id=old.id and removed_at is null;
   end if;
 end if;
 return new;
end $$;
-- Before generic deletion capture, so it sees the server's timestamp.
create trigger aaa_platform_brand_retention before insert or update or delete on public.platform_brand_assets
for each row execute function private.guard_platform_brand_retained_asset();

create or replace function public."enqueue_platform_brand_asset_scan"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Removed assets retain the existing job unchanged; never enqueue a new scan.
  if new.deleted_at is not null then return new; end if;
  if new."scan_status" = 'pending_scan' then
    perform public."enqueue_media_scan_job"(
      'platform_brand_assets',
      new."asset_type",
      new."id"::text,
      new."owner_user_id",
      new."storage_provider",
      new."storage_bucket",
      coalesce(nullif(new."storage_object_key", ''), new."storage_path"),
      new."mime_type",
      new."file_size_bytes",
      30,
      jsonb_build_object('assetType', new."asset_type")
    );
  end if;
  return new;
end;
$$;

create function public.remove_platform_brand_asset(p_asset_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.platform_brand_assets%rowtype;
begin
 perform private.platform_brand_retention_lock();
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
   or public.is_account_access_restricted(auth.uid()::text) is distinct from false
   or not exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id
     where u.id=auth.uid() and u.deleted_at is null and s.id::text=auth.jwt()->>'session_id'
     and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception 'brand_remove_current_session_required'; end if;
 select * into a from public.platform_brand_assets where id=p_asset_id and owner_user_id=auth.uid()::text for update;
 if a.id is null then raise exception 'brand_remove_owner_required'; end if;
 -- Preserve the existing owner UPDATE policy's Premium/provider/path authority,
 -- and recheck session expiry after any row-lock wait. No new staff/official-owner
 -- impersonation route is introduced by this SECURITY DEFINER endpoint.
 if public.whole_app_exact_current_session_authority_internal() is distinct from true
   or public.is_account_access_restricted(auth.uid()::text) is distinct from false
   or not exists(select 1 from auth.users u join auth.sessions session_row on session_row.user_id=u.id
     where u.id=auth.uid() and u.deleted_at is null and session_row.id::text=auth.jwt()->>'session_id'
     and (session_row.not_after is null or session_row.not_after>clock_timestamp()))
   or public.has_active_premium_creator_tool_access(a.owner_user_id) is distinct from true
   or lower(btrim(coalesce(a.storage_provider,'')))<>'supabase'
   or a.storage_bucket<>'platform-brand-assets' or a.storage_object_key is distinct from a.storage_path
   or (storage.foldername(a.storage_path))[1] is distinct from a.owner_user_id then
   raise exception 'brand_remove_current_owner_access_required'; end if;
 if a.deleted_at is null then
   if exists(select 1 from public.platform_brand_profiles p where a.id=any(array[p.hero_image_asset_id,p.hero_video_asset_id,p.hero_poster_asset_id,p.background_image_asset_id,p.avatar_asset_id,p.logo_asset_id,p.watermark_asset_id])) then
     raise exception 'brand_asset_in_use';
   end if;
   if to_regclass('public.platform_brand_publications') is not null then
     if exists(select 1 from public.platform_brand_publications p where a.id=any(array[p.hero_image_asset_id,p.hero_video_asset_id,p.hero_poster_asset_id,p.background_image_asset_id,p.avatar_asset_id,p.logo_asset_id,p.watermark_asset_id])) then
       raise exception 'brand_asset_in_use';
     end if;
   end if;
   update public.platform_brand_assets set deleted_at=clock_timestamp(),asset_state='archived' where id=a.id returning * into a;
 end if;
 return jsonb_build_object('assetId',a.id,'deletedAt',a.deleted_at);
end $$;
revoke all on function public.remove_platform_brand_asset(uuid) from public,anon,authenticated,service_role;
grant execute on function public.remove_platform_brand_asset(uuid) to authenticated;

create function public.read_platform_brand_retention_binding(p_asset_id uuid) returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('assetId',r.asset_id,'ownerId',r.owner_id,
 'sourceCreatedAt',to_char(r.source_created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'provider',r.provider,'bucket',r.bucket,'objectKey',r.object_key,
 'storageObjectId',r.storage_object_id,'storageVersion',r.storage_version)
 from private.platform_brand_object_incarnations r join public.platform_brand_assets a on a.id=r.asset_id
 join storage.objects o on o.id=r.storage_object_id and o.bucket_id=r.bucket and o.name=r.object_key
 where r.asset_id=p_asset_id and r.provider='supabase' and r.storage_path=r.object_key and r.storage_version=to_jsonb(o)->>'version'
 and (a.owner_user_id,a.created_at,a.storage_provider,a.storage_bucket,a.storage_object_key,a.storage_path)
   is not distinct from (r.owner_id,r.source_created_at,r.provider,r.bucket,r.object_key,r.object_key)
$$;

create function public.record_platform_brand_retention_proof(p_asset_id uuid,p_binding jsonb,p_proof jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b jsonb; r private.platform_brand_object_incarnations%rowtype; receipt uuid; valid boolean;
begin
 perform private.platform_brand_retention_lock();
 b:=public.read_platform_brand_retention_binding(p_asset_id);
 select * into r from private.platform_brand_object_incarnations where asset_id=p_asset_id;
 if b is null or b is distinct from p_binding then raise exception 'brand_proof_current_incarnation_required'; end if;
 -- Only a durable receipt from the actual claimed scanner attempt is accepted.
 -- Bytes-only reads, old asset scan_status, and caller-supplied 'clean' are not proof.
 if to_regprocedure('private.platform_brand_scan_byte_receipt_matches(uuid,jsonb,text,bigint)') is null then
   raise exception 'brand_scan_receipt_adapter_unavailable'; end if;
 receipt:=nullif(p_proof->>'scanReceiptId','')::uuid;
 if receipt is null or p_proof->>'originSha256' is null or p_proof->>'originSizeBytes' is null then
   raise exception 'brand_proof_fresh_bound_scan_required'; end if;
 execute 'select private.platform_brand_scan_byte_receipt_matches($1,$2,$3,$4)'
 into valid using receipt,b,p_proof->>'originSha256',(p_proof->>'originSizeBytes')::bigint;
 if valid is distinct from true or not exists(select 1 from private.media_scan_byte_receipts x
   join private.media_scan_byte_observations observation on observation.id=x.observation_id
   where x.id=receipt and observation.observed_at>=r.observed_at) then
   raise exception 'brand_proof_fresh_bound_scan_required'; end if;
 insert into private.platform_brand_object_proofs(asset_id,binding,origin_sha256,origin_size_bytes,scan_receipt_id)
 values(p_asset_id,b,p_proof->>'originSha256',(p_proof->>'originSizeBytes')::bigint,receipt)
 on conflict(asset_id) do nothing;
 if not exists(select 1 from private.platform_brand_object_proofs p where p.asset_id=p_asset_id and p.binding=b
   and p.origin_sha256=p_proof->>'originSha256' and p.origin_size_bytes=(p_proof->>'originSizeBytes')::bigint
   and p.scan_receipt_id=receipt) then raise exception 'brand_proof_immutable_conflict'; end if;
 return jsonb_build_object('recorded',true,'assetId',p_asset_id);
end $$;

-- Exact historical review evidence is not a media delivery reference. Unknown
-- fields or another source/key remain blockers; this grants no read authority.
create function private.platform_brand_review_evidence_matches(p_table oid,p_row jsonb,p_asset_id uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare r private.platform_brand_object_incarnations%rowtype; a public.platform_brand_assets%rowtype;
 b jsonb:=p_row->'before_state'; z jsonb:=p_row->'after_state'; snapshot jsonb; e jsonb; action text;
 snapshot_keys text[]:=array['id','owner_user_id','asset_type','asset_state','storage_provider','storage_bucket','storage_object_key','storage_path','mime_type','width','height','duration_ms','file_size_bytes','original_file_name','moderation_status','moderation_reason','moderated_at','moderated_by','created_at','updated_at','deleted_at','scan_status','scan_provider','scan_result','scanned_at','scan_error','quarantined_at'];
begin
 if p_table is null or p_row is null or jsonb_typeof(p_row) is distinct from 'object' then return false; end if;
 select * into r from private.platform_brand_object_incarnations where asset_id=p_asset_id;
 select * into a from public.platform_brand_assets where id=p_asset_id;
 if r.asset_id is null or a.id is null or (a.owner_user_id,a.created_at,a.storage_provider,a.storage_bucket,a.storage_object_key,a.storage_path)
   is distinct from (r.owner_id,r.source_created_at,r.provider,r.bucket,r.object_key,r.storage_path) then return false; end if;
 if not exists(select 1 from storage.objects o where o.id=r.storage_object_id and o.bucket_id=r.bucket and o.name=r.object_key and to_jsonb(o)->>'version'=r.storage_version)
   and not (exists(select 1 from private.platform_brand_expiry_claims c where c.asset_id=r.asset_id)
     and not exists(select 1 from storage.objects o where o.id=r.storage_object_id or (o.bucket_id=r.bucket and o.name=r.object_key))) then return false; end if;
 if p_table=to_regclass('public.platform_admin_audit_logs') then
   if (p_row-array['id','actor_user_id','actor_email','actor_role','action','action_category','target_type','target_id','target_user_id','target_channel_user_id','reason','severity','before_state','after_state','metadata','ip_hash','user_agent_hash','request_id','created_at','security_context_id'])<>'{}'::jsonb
     or p_row->>'action_category' is distinct from 'moderation' or p_row->>'target_type' is distinct from 'platform_brand_asset'
     or p_row->>'target_id' is distinct from r.asset_id::text or p_row->>'target_user_id' is distinct from r.owner_id
     or p_row->>'target_channel_user_id' is distinct from r.owner_id
     or jsonb_typeof(p_row->'metadata') is distinct from 'object'
     or ((p_row->'metadata')-array['surface','asset_type','review_event_id','public_asset_state','moderation_status','raw_storage_path_logged','fake_approval','self_review','reviewer_access','review_context'])<>'{}'::jsonb then return false; end if;
   select to_jsonb(v) into e from public.platform_brand_asset_review_events v where v.id::text=p_row->'metadata'->>'review_event_id';
   if e is null then return false; end if;
   return coalesce(private.platform_brand_review_evidence_matches(to_regclass('public.platform_brand_asset_review_events'),e,p_asset_id)
     and p_row->>'action'='platform_brand_asset_'||(e->>'action')
     and (p_row->>'actor_user_id',p_row->>'actor_email',p_row->>'actor_role',p_row->>'reason',b,z)
       is not distinct from (e->>'actor_user_id',e->>'actor_email',e->>'actor_role',coalesce(e->>'reason',z->>'moderation_reason'),e->'before_state',e->'after_state')
     and p_row->>'severity'=case when e->>'action'='approve' then 'notice' else 'warning' end
     and p_row->'metadata'->>'surface'='platform_brand_studio'
     and p_row->'metadata'->>'asset_type'=z->>'asset_type'
     and p_row->'metadata'->>'public_asset_state'=z->>'asset_state'
     and p_row->'metadata'->>'moderation_status'=z->>'moderation_status'
     and p_row->'metadata'->'raw_storage_path_logged'='false'::jsonb
     and p_row->'metadata'->'fake_approval'='false'::jsonb
     and p_row->'metadata'->'self_review'=to_jsonb((e->>'actor_user_id')=r.owner_id)
     and jsonb_typeof(p_row->'metadata'->'reviewer_access')='boolean'
     and p_row->'metadata'->>'review_context'='review_platform_brand_asset',false);
 elsif p_table is distinct from to_regclass('public.platform_brand_asset_review_events') then return false; end if;
 if (p_row-array['id','asset_id','owner_user_id','actor_user_id','actor_email','actor_role','action','reason','before_state','after_state','created_at'])<>'{}'::jsonb
   or p_row->>'asset_id' is distinct from r.asset_id::text or p_row->>'owner_user_id' is distinct from r.owner_id
   or nullif(btrim(p_row->>'actor_user_id'),'') is null then return false; end if;
 foreach snapshot in array array[b,z] loop
   if jsonb_typeof(snapshot) is distinct from 'object' or (snapshot-snapshot_keys)<>'{}'::jsonb
     or not (snapshot ?& array['id','owner_user_id','asset_type','asset_state','storage_provider','storage_bucket','storage_object_key','storage_path','mime_type','width','height','duration_ms','file_size_bytes','original_file_name','moderation_status','moderation_reason','moderated_at','moderated_by','created_at','updated_at','deleted_at'])
     or (snapshot->>'id',snapshot->>'owner_user_id',(snapshot->>'created_at')::timestamptz,snapshot->>'storage_provider',snapshot->>'storage_bucket',snapshot->>'storage_object_key',snapshot->>'storage_path',snapshot->>'asset_type')
       is distinct from (r.asset_id::text,r.owner_id,r.source_created_at,r.provider,r.bucket,r.object_key,r.storage_path,a.asset_type) then return false; end if;
 end loop;
 if (b-array['asset_state','moderation_status','moderation_reason','moderated_at','moderated_by','updated_at','deleted_at'])
   is distinct from (z-array['asset_state','moderation_status','moderation_reason','moderated_at','moderated_by','updated_at','deleted_at'])
   or b->>'deleted_at' is not null or z->>'moderated_by' is distinct from p_row->>'actor_user_id'
   or z->>'moderated_at' is null
   or z->>'moderation_reason' is distinct from coalesce(p_row->>'reason','Approved for public Platform display.') then return false; end if;
 action:=p_row->>'action';
 return coalesce((action='approve' and z->>'moderation_status'='clean' and z->>'deleted_at' is null and z->>'asset_state'=b->>'asset_state')
   or (action='reject' and length(btrim(p_row->>'reason'))>=6 and z->>'moderation_status'='rejected' and z->>'deleted_at' is null
     and z->>'asset_state'=case when b->>'asset_state'='published' then 'draft' else b->>'asset_state' end)
   or (action='archive' and length(btrim(p_row->>'reason'))>=6 and z->>'moderation_status'='removed' and z->>'asset_state'='archived'
     and (z->>'deleted_at')::timestamptz=r.removed_at),false);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return false;
end $$;
revoke all on function private.platform_brand_review_evidence_matches(oid,jsonb,uuid) from public,anon,authenticated,service_role;

-- Every known generic key/URL/JSON reference participates in the same latch.
-- New locator-bearing tables block claims until reviewed and guarded.
create function private.guard_platform_brand_retention_references() returns trigger
language plpgsql security definer set search_path='' as $$
declare r private.platform_brand_object_incarnations%rowtype; doc jsonb; old_doc jsonb;
begin
 doc:=private.deleted_media_locator_document(to_jsonb(new),tg_relid);
 if tg_op='UPDATE' then old_doc:=private.deleted_media_locator_document(to_jsonb(old),tg_relid); end if;
 -- The dedicated hold trigger already preserves these unrelated scopes. The
 -- generic JSON trigger must agree only when neither row carries any locator.
 -- Exact document equality keeps future locator columns fail-closed as well.
 if tg_relid=to_regclass('public.legal_holds')
   and to_jsonb(new)->>'target_type' in ('profile_post','profile_post_comment','creator_video_comment','chat_message','room_message','watch_party_room_message','creator_video','video','social_attachment')
   and doc='{"metadata":{}}'::jsonb
   and (tg_op='INSERT' or (tg_op='UPDATE' and old_doc='{"metadata":{}}'::jsonb
     and to_jsonb(old)->>'target_type' in ('profile_post','profile_post_comment','creator_video_comment','chat_message','room_message','watch_party_room_message','creator_video','video','social_attachment'))) then return new; end if;
 perform private.platform_brand_retention_lock();
 for r in select * from private.platform_brand_object_incarnations where removed_at is not null loop
   if private.deleted_media_mentions(doc,r.object_key) or private.deleted_media_mentions(doc,r.storage_path) then
     if tg_table_name='platform_brand_assets' and to_jsonb(new)->>'id'=r.asset_id::text then continue; end if;
     if tg_relid in (to_regclass('public.platform_brand_asset_review_events'),to_regclass('public.platform_admin_audit_logs')) then
     if tg_op='INSERT' and private.platform_brand_review_evidence_matches(tg_relid,to_jsonb(new),r.asset_id)
       and auth.uid() is not null and to_jsonb(new)->>'actor_user_id'=auth.uid()::text
       and current_setting('app.platform_brand_review_context',true)='review_platform_brand_asset'
       and to_jsonb(new)->>'action' in ('archive','platform_brand_asset_archive')
       and (public.has_platform_role(array['owner'::text,'operator'::text]) or public.has_platform_permission('content_moderation') or public.has_platform_permission('reports_review'))
       and exists(select 1 from public.platform_brand_assets a where a.id=r.asset_id and a.asset_state='archived' and a.deleted_at=r.removed_at and to_jsonb(a)=to_jsonb(new)->'after_state') then continue; end if;
     end if;
     -- Completing the exact existing Brand scan changes outcome metadata, not
     -- its locator. This is not an INSERT, enqueue, retry or lease-reset path.
     if tg_table_schema='public' and tg_table_name='media_scan_jobs' and tg_op='UPDATE' then
       if coalesce(
         to_jsonb(old)->>'target_table'='platform_brand_assets'
         and to_jsonb(old)->>'target_id'=r.asset_id::text
         and to_jsonb(old)->>'owner_user_id'=r.owner_id
         and to_jsonb(old)->>'storage_provider'=r.provider
         and to_jsonb(old)->>'storage_bucket'=r.bucket
         and to_jsonb(old)->>'storage_object_key'=r.object_key
         and (to_jsonb(old)->>'created_at')::timestamptz>=r.source_created_at
         and (to_jsonb(old)->>'created_at')::timestamptz<=r.removed_at
         and to_jsonb(old)->>'status'='scanning'
         and nullif(btrim(to_jsonb(old)->>'claimed_by'),'') is not null
         and (to_jsonb(old)->>'claimed_at')::timestamptz<=clock_timestamp()
         and (to_jsonb(old)->>'claimed_at')::timestamptz+interval '20 minutes'>clock_timestamp()
         and to_jsonb(new)->>'status' in ('clean','malware_detected','scan_failed','manual_review','quarantined')
         and (to_jsonb(new)-array['status','completed_at','scanner_provider','scanner_version','signature_version','finding_name','error_message','metadata','updated_at','claimed_by','claimed_at'])
           =(to_jsonb(old)-array['status','completed_at','scanner_provider','scanner_version','signature_version','finding_name','error_message','metadata','updated_at','claimed_by','claimed_at'])
         and ((to_jsonb(new)->'claimed_by'=to_jsonb(old)->'claimed_by' and to_jsonb(new)->'claimed_at'=to_jsonb(old)->'claimed_at')
           or (to_jsonb(new)->>'claimed_by' is null and to_jsonb(new)->>'claimed_at' is null))
         and ((to_jsonb(new)->'metadata')-array['durationMs','completedAt','targetPropagationComplete','targetPropagationFailure','targetPropagationFailedAt'])
           =((to_jsonb(old)->'metadata')-array['durationMs','completedAt','targetPropagationComplete','targetPropagationFailure','targetPropagationFailedAt'])
         and jsonb_typeof(to_jsonb(new)->'metadata'->'durationMs') in ('number','null')
         and (to_jsonb(new)->'metadata'->>'completedAt')::timestamptz=(to_jsonb(new)->>'updated_at')::timestamptz
         and ((to_jsonb(new)->'metadata'->'targetPropagationComplete') is not distinct from (to_jsonb(old)->'metadata'->'targetPropagationComplete')
           or to_jsonb(new)->'metadata'->'targetPropagationComplete'='false'::jsonb)
         and ((to_jsonb(new)->'metadata'->'targetPropagationFailure') is not distinct from (to_jsonb(old)->'metadata'->'targetPropagationFailure')
           or to_jsonb(new)->'metadata'->>'targetPropagationFailure'='target_update_blocked')
         and ((to_jsonb(new)->'metadata'->'targetPropagationFailedAt') is not distinct from (to_jsonb(old)->'metadata'->'targetPropagationFailedAt')
           or (to_jsonb(new)->'metadata'->>'targetPropagationFailedAt')::timestamptz=(to_jsonb(new)->>'updated_at')::timestamptz)
         and not exists(select 1 from private.platform_brand_expiry_claims c where c.asset_id=r.asset_id)
         and exists(select 1 from public.platform_brand_assets a join storage.objects o
           on o.id=r.storage_object_id and o.bucket_id=r.bucket and o.name=r.object_key
           where a.id=r.asset_id and a.owner_user_id=r.owner_id and a.created_at=r.source_created_at
             and a.asset_type=to_jsonb(old)->>'target_column'
             and a.deleted_at=r.removed_at and a.asset_state='archived'
             and (a.storage_provider,a.storage_bucket,a.storage_object_key,a.storage_path)
               is not distinct from (r.provider,r.bucket,r.object_key,r.storage_path)
             and to_jsonb(o)->>'version'=r.storage_version),false)
       then continue; end if;
     end if;
     if tg_op='UPDATE' and doc=old_doc
       and private.deleted_media_reference_identity(to_jsonb(new))=private.deleted_media_reference_identity(to_jsonb(old))
       and not exists(select 1 from private.platform_brand_expiry_claims where asset_id=r.asset_id) then continue; end if;
     raise exception 'brand_retained_reference_forbidden';
   end if;
 end loop;
 return new;
end $$;
do $$ declare t record; begin
 for t in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p') and cardinality(private.deleted_media_locator_columns(c.oid))>0 loop
 execute format('create trigger zzz_platform_brand_retention_reference before insert or update on public.%I for each row execute function private.guard_platform_brand_retention_references()',t.relname);
 end loop;
end $$;

create function private.guard_platform_brand_retention_profile() returns trigger
language plpgsql security definer set search_path='' as $$
declare asset uuid;
begin
 perform private.platform_brand_retention_lock();
 foreach asset in array array[new.hero_image_asset_id,new.hero_video_asset_id,new.hero_poster_asset_id,new.background_image_asset_id,new.avatar_asset_id,new.logo_asset_id,new.watermark_asset_id] loop
   if exists(select 1 from private.platform_brand_expiry_claims where asset_id=asset) then raise exception 'brand_claimed_profile_reference_forbidden'; end if;
 end loop;
 return new;
end $$;
create trigger aaa_brand_retention_profile before insert or update on public.platform_brand_profiles for each row execute function private.guard_platform_brand_retention_profile();
do $$ begin
 if to_regclass('public.platform_brand_publications') is not null then
   execute 'create trigger aaa_brand_retention_publication before insert or update on public.platform_brand_publications for each row execute function private.guard_platform_brand_retention_profile()';
 end if;
end $$;

create function private.platform_brand_retention_references_clear(p_asset_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r private.platform_brand_object_incarnations%rowtype; t record; found_ref boolean; predicate text;
begin
 perform private.platform_brand_retention_lock();
 select * into r from private.platform_brand_object_incarnations where asset_id=p_asset_id;
 if r.asset_id is null or r.removed_at is null or to_regclass('public.platform_brand_publications') is null then return false; end if;
 if exists(select 1 from public.platform_brand_profiles p where r.asset_id=any(array[p.hero_image_asset_id,p.hero_video_asset_id,p.hero_poster_asset_id,p.background_image_asset_id,p.avatar_asset_id,p.logo_asset_id,p.watermark_asset_id]))
 or exists(select 1 from public.platform_brand_publications p where r.asset_id=any(array[p.hero_image_asset_id,p.hero_video_asset_id,p.hero_poster_asset_id,p.background_image_asset_id,p.avatar_asset_id,p.logo_asset_id,p.watermark_asset_id])) then return false; end if;
 for t in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p') and cardinality(private.deleted_media_locator_columns(c.oid))>0 loop
   if not exists(select 1 from pg_trigger g where g.tgrelid=t.oid and g.tgfoid='private.guard_platform_brand_retention_references()'::regprocedure
     and g.tgenabled in ('O','A') and (g.tgtype::int & 23)=23 and g.tgqual is null) then return false; end if;
   predicate:='true';
   if t.oid in (to_regclass('public.platform_brand_asset_review_events'),to_regclass('public.platform_admin_audit_logs')) then predicate:=format('not private.platform_brand_review_evidence_matches(%s::oid,to_jsonb(x),%L::uuid)',t.oid,r.asset_id); end if;
   if t.relname='platform_brand_assets' then predicate:=format('id<>%L::uuid',r.asset_id); end if;
   -- Only the exact proved terminal scan is evidence, not a live delivery alias.
   -- All other scans/reservations and unexpected references remain blockers.
   if t.relname='media_scan_jobs' and to_regclass('private.media_scan_byte_receipts') is not null then
     predicate:=format('id not in (select observation.job_id from private.platform_brand_object_proofs proof join private.media_scan_byte_receipts receipt on receipt.id=proof.scan_receipt_id join private.media_scan_byte_observations observation on observation.id=receipt.observation_id where proof.asset_id=%L::uuid and private.platform_brand_scan_byte_receipt_matches(receipt.id,proof.binding,proof.origin_sha256,proof.origin_size_bytes))',r.asset_id);
   end if;
   execute format('select exists(select 1 from public.%I x where %s and (private.deleted_media_mentions(private.deleted_media_locator_document(to_jsonb(x),%s::oid),$1) or private.deleted_media_mentions(private.deleted_media_locator_document(to_jsonb(x),%s::oid),$2)))',t.relname,predicate,t.oid,t.oid)
     into found_ref using r.object_key,r.storage_path;
   if found_ref then return false; end if;
 end loop;
 return true;
end $$;

create function private.guard_platform_brand_retention_hold() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 -- These recognized scopes cannot match a brand asset or its (absent) parent.
 -- Unknown scopes and account/brand holds remain conservatively serialized.
 if new.target_type in ('profile_post','profile_post_comment','creator_video_comment','chat_message','room_message',
  'watch_party_room_message','creator_video','video','social_attachment') then return new; end if;
 perform private.platform_brand_retention_lock();
 if new.status='active' and exists(select 1 from private.platform_brand_expiry_claims c
   join private.platform_brand_object_incarnations r on r.asset_id=c.asset_id
   where private.deleted_content_hold_matches(new.target_type,new.target_id,'platform_brand_asset',r.asset_id::text,r.owner_id,null,null)) then
   raise exception 'brand_preservation_unavailable_deletion_already_claimed'; end if;
 return new;
end $$;
create trigger aaa_platform_brand_retention_hold before insert or update on public.legal_holds for each row execute function private.guard_platform_brand_retention_hold();

create function public.claim_platform_brand_retention_expiry(p_asset_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.platform_brand_object_incarnations%rowtype; c private.platform_brand_expiry_claims%rowtype; b jsonb;
begin
 perform private.platform_brand_retention_lock();
 if not exists(select 1 from private.platform_brand_retention_settings where expiry_enabled) then return jsonb_build_object('status','disabled'); end if;
 if to_regclass('public.platform_brand_publications') is null then return jsonb_build_object('status','publication_schema_unavailable'); end if;
 if exists(select 1 from (values
   ('storage.objects','private.guard_platform_brand_storage_incarnation()',31),
   ('public.platform_brand_assets','private.guard_platform_brand_retained_asset()',31),
   ('public.legal_holds','private.guard_platform_brand_retention_hold()',23),
   ('public.platform_brand_profiles','private.guard_platform_brand_retention_profile()',23),
   ('public.platform_brand_publications','private.guard_platform_brand_retention_profile()',23)
 ) required(relation,func,mask) where not exists(select 1 from pg_trigger g
   where g.tgrelid=required.relation::regclass and g.tgfoid=required.func::regprocedure
   and g.tgenabled in ('O','A') and (g.tgtype::int & required.mask)=required.mask and g.tgqual is null)) then
   return jsonb_build_object('status','required_guard_unavailable'); end if;
 select * into r from private.platform_brand_object_incarnations where asset_id=p_asset_id;
 if r.asset_id is null or r.removed_at is null then return jsonb_build_object('status','not_removed'); end if;
 if r.retain_until>clock_timestamp() then return jsonb_build_object('status','not_due'); end if;
 if exists(select 1 from public.legal_holds h where h.status='active' and private.deleted_content_hold_matches(h.target_type,h.target_id,'platform_brand_asset',r.asset_id::text,r.owner_id,null,null)) then return jsonb_build_object('status','held'); end if;
 if not private.platform_brand_retention_references_clear(p_asset_id) then return jsonb_build_object('status','references_or_coverage_blocked'); end if;
 b:=public.read_platform_brand_retention_binding(p_asset_id);
 if b is null or not exists(select 1 from private.platform_brand_object_proofs where asset_id=p_asset_id and binding=b) then return jsonb_build_object('status','unproven_incarnation'); end if;
 if to_regprocedure('private.platform_brand_scan_byte_receipt_matches(uuid,jsonb,text,bigint)') is null then return jsonb_build_object('status','scan_receipt_adapter_unavailable'); end if;
 if not exists(select 1 from private.platform_brand_object_proofs proof where proof.asset_id=p_asset_id
   and private.platform_brand_scan_byte_receipt_matches(proof.scan_receipt_id,proof.binding,proof.origin_sha256,proof.origin_size_bytes)) then
   return jsonb_build_object('status','scan_receipt_no_longer_current'); end if;
 insert into private.platform_brand_expiry_claims(asset_id) values(p_asset_id) on conflict do nothing;
 select * into c from private.platform_brand_expiry_claims where asset_id=p_asset_id;
 return b||jsonb_build_object('status','claimed','claimToken',c.claim_token,'retainUntil',r.retain_until,
   'guarantee','permanent_nonreuse_with_qualified_writer_drain');
end $$;

-- Storage RLS owner-prefix DELETE previously bypassed retention. This trigger
-- is deny-only for attached objects, including service-role operations. It does
-- NOT delete provider bytes. Unattached failed-upload cleanup stays unchanged.
create function private.guard_platform_brand_storage_incarnation() returns trigger
language plpgsql security definer set search_path='' as $$
declare r private.platform_brand_object_incarnations%rowtype; old_doc jsonb:=case when tg_op<>'INSERT' then to_jsonb(old) end;
 new_doc jsonb:=case when tg_op<>'DELETE' then to_jsonb(new) end;
begin
 if coalesce(old_doc->>'bucket_id','')<>'platform-brand-assets' and coalesce(new_doc->>'bucket_id','')<>'platform-brand-assets' then
   if tg_op='DELETE' then return old; else return new; end if;
 end if;
 perform private.platform_brand_retention_lock();
 -- Storage path_tokens is generated from the still-fenced name and is NULL
 -- in a BEFORE UPDATE NEW record. Read timestamps may change automatically.
 if tg_op='UPDATE' and (old_doc-array['last_accessed_at','updated_at','path_tokens'])
  =(new_doc-array['last_accessed_at','updated_at','path_tokens']) then return new; end if;
 for r in select * from private.platform_brand_object_incarnations where provider='supabase' and bucket='platform-brand-assets'
   and (object_key in (old_doc->>'name',new_doc->>'name') or storage_path in (old_doc->>'name',new_doc->>'name')) loop
   if tg_op='DELETE' and auth.role()='service_role' and r.storage_object_id=old.id
     and r.storage_version=old_doc->>'version' and r.retain_until<=clock_timestamp()
     and exists(select 1 from private.platform_brand_retention_settings where expiry_enabled)
     and exists(select 1 from private.platform_brand_expiry_claims where asset_id=r.asset_id and observed_absent_at is null)
     and private.platform_brand_retention_references_clear(r.asset_id)
     and not exists(select 1 from public.legal_holds h where h.status='active' and private.deleted_content_hold_matches(h.target_type,h.target_id,'platform_brand_asset',r.asset_id::text,r.owner_id,null,null)) then
       continue;
   end if;
   raise exception 'brand_storage_attached_incarnation_fenced';
 end loop;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger aaa_platform_brand_storage_incarnation before insert or update or delete on storage.objects for each row execute function private.guard_platform_brand_storage_incarnation();

create function public.finish_platform_brand_retention_expiry(p_asset_id uuid,p_claim_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.platform_brand_object_incarnations%rowtype; c private.platform_brand_expiry_claims%rowtype;
begin
 perform private.platform_brand_retention_lock();
 select * into r from private.platform_brand_object_incarnations where asset_id=p_asset_id;
 select * into c from private.platform_brand_expiry_claims where asset_id=p_asset_id and claim_token=p_claim_token;
 if c.asset_id is null then raise exception 'brand_exact_claim_required'; end if;
 if exists(select 1 from storage.objects where bucket_id=r.bucket and name=r.object_key) then return jsonb_build_object('status','still_present'); end if;
 if c.observed_absent_at is null then update private.platform_brand_expiry_claims set observed_absent_at=clock_timestamp() where asset_id=p_asset_id; end if;
 -- Retain minimal identity/proof/tombstone permanently to prevent key reuse.
 return jsonb_build_object('status','metadata_absent','providerAbsenceVerified',false);
end $$;

do $$ declare p record; begin
 for p in select n.nspname,pr.oid::regprocedure signature from pg_proc pr join pg_namespace n on n.oid=pr.pronamespace
 where (n.nspname='private' and pr.proname in ('platform_brand_retention_lock','platform_brand_retention_immutable','guard_platform_brand_retained_asset','guard_platform_brand_retention_references','guard_platform_brand_retention_profile','platform_brand_retention_references_clear','guard_platform_brand_retention_hold','guard_platform_brand_storage_incarnation'))
 or (n.nspname='public' and pr.proname in ('read_platform_brand_retention_binding','record_platform_brand_retention_proof','claim_platform_brand_retention_expiry','finish_platform_brand_retention_expiry')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',p.signature);
 if p.nspname='public' then execute format('grant execute on function %s to service_role',p.signature); end if;
 end loop;
end $$;

commit;
