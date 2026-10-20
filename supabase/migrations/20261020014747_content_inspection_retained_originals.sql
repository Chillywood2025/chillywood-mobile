-- SOURCE ONLY: finalized hard-deleted canonical R2 originals, fixed 30-day deadline.
-- No retention activation, provider requests or edit-history copies. Requires
-- deployed signed conditional-write upload contract and exact provider parity.
begin;
create function private.content_inspection_live_media_binding(p_type text,p_target uuid,p_revoked_reservation uuid default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_row jsonb; v_author text; v_table text; v_column text; v_parent jsonb;
  v_provider text; v_bucket text; v_key text; v_mime text; v_size bigint;
  v_scan public.media_scan_jobs; v_reservation public.media_upload_reservations; v_binding jsonb;
begin
  if p_type='creator_video' then
    select to_jsonb(v) into v_row from public.videos v where id=p_target;
    v_author:=v_row->>'owner_id'; v_table:='videos'; v_column:='source';
    v_size:=(v_row->>'file_size_bytes')::bigint;
  elsif p_type='social_attachment' then
    select to_jsonb(a) into v_row from public.social_attachments a where id=p_target;
    v_author:=v_row->>'owner_user_id'; v_table:='social_attachments'; v_column:='attachment';
    v_size:=(v_row->>'size_bytes')::bigint;
    if v_row is null or v_author is null then return null; end if;
    -- The exact parent must still exist and belong to the source author. No
    -- conversation membership or source metadata can nominate a different row.
    v_parent:=private.content_inspection_source(case v_row->>'surface_type'
      when 'watch_party_room_message' then 'room_message' else v_row->>'surface_type' end,(v_row->>'surface_id')::uuid);
    if v_parent is null or v_parent->>'author' is distinct from v_author
      or v_parent->>'deletedAt' is not null or coalesce((v_parent->>'isRetainedDeletion')::boolean,false) then return null; end if;
  else return null;
  end if;
  if v_row is null or v_author is null or v_row->>'deleted_at' is not null
    or v_row->>'scan_status' is distinct from 'clean' or v_row->>'quarantined_at' is not null then return null; end if;
  v_provider:=v_row->>'storage_provider'; v_bucket:=v_row->>'storage_bucket';
  v_key:=coalesce(nullif(v_row->>'storage_object_key',''),v_row->>'storage_path');
  v_mime:=lower(split_part(v_row->>'mime_type',';',1));
  if v_provider not in ('s3','cloudflare_r2') or coalesce(v_bucket,'')='' or coalesce(v_key,'')=''
    or v_key like '/%' or v_key like '%..%' or v_mime is null
    or v_mime not in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime','audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/x-wav','audio/webm')
    or v_size is null or v_size<=0 or v_size>(case when p_type='creator_video' then 5368709120 else 262144000 end) then return null; end if;
  select s.* into v_scan from public.media_scan_jobs s where s.target_table=v_table and s.target_column=v_column
    and s.target_id=p_target::text and s.owner_user_id=v_author and s.storage_provider=v_provider
    and s.storage_bucket=v_bucket and s.storage_object_key=v_key and s.status='clean' and s.completed_at is not null
    and lower(split_part(s.mime_type,';',1))=v_mime and s.size_bytes=v_size;
  if not found then return null; end if;
  select r.* into v_reservation from public.media_upload_reservations r where r.owner_user_id::text=v_author
    and r.surface_type=p_type and r.storage_provider=v_provider and r.storage_bucket=v_bucket and r.storage_object_key=v_key
    and ((r.status='verified' and r.deleted_at is null) or (r.id=p_revoked_reservation and r.status='deleted' and r.deleted_at is not null)) and r.verified_at is not null and r.verified_at<=r.expires_at
    and r.attached_at is not null and r.attached_record_id=p_target::text
    and lower(split_part(r.observed_mime_type,';',1))=v_mime and r.observed_size_bytes=v_size
    and lower(split_part(r.expected_mime_type,';',1))=v_mime and r.expected_size_bytes=v_size;
  if not found and (p_revoked_reservation is not null or not public.has_verified_legacy_media_object_provenance(v_table,p_target::text,v_provider,v_bucket,v_key)) then return null; end if;
  v_binding:=jsonb_build_object('provider',v_provider,'bucket',v_bucket,'objectKey',v_key,'mimeType',v_mime,'sizeBytes',v_size,
    'author',v_author,'targetType',p_type,'targetId',p_target,'parentType',v_row->>'surface_type','parentId',v_row->>'surface_id',
    'sourceUpdatedAt',v_row->>'updated_at','scanId',v_scan.id,'scanUpdatedAt',v_scan.updated_at,
    'reservationId',v_reservation.id,'reservationUpdatedAt',v_reservation.updated_at,
    'parentVersion',case when v_parent is not null then md5(v_parent::text) end);
  return v_binding||jsonb_build_object('storedVersion',md5(v_binding::text),'mediaKind',split_part(v_mime,'/',1));
end;
$$;
-- Exact staged proof is not access authority. Finalization runs during the real
-- DELETE, after delivery revocation, and refuses changed source or scan state.
create function private.finalize_deleted_media_inspection_proof(p_stage_id uuid,p_staged_proof jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare s private.deleted_content_media_stages; r private.deleted_media_key_retirements; v jsonb;
begin
  select * into s from private.deleted_content_media_stages where id=p_stage_id;
  select * into r from private.deleted_media_key_retirements where stage_id=p_stage_id;
  if s.id is null or r.id is null or r.status<>'staged' or p_staged_proof is null
    or p_staged_proof is distinct from r.staged_inspection_proof
    or p_staged_proof->>'reservationId' is distinct from s.reservation_id::text
    or p_staged_proof->>'provider' is distinct from r.provider
    or p_staged_proof->>'bucket' is distinct from r.bucket
    or p_staged_proof->>'objectKey' is distinct from r.object_key
    or not exists(select 1 from private.deleted_content_records d where d.id=s.deletion_id
      and d.deletion_kind='hard' and d.target_type=s.target_type and d.target_id=s.target_id and d.author=s.author)
    or not exists(select 1 from public.media_upload_reservations u where u.id=s.reservation_id
      and u.verified_at=r.verified_at and u.attached_at=r.attached_at) then return null; end if;
  v:=private.content_inspection_live_media_binding(s.target_type,s.target_id::uuid,s.reservation_id);
  -- The intentional gateway revoke changes reservation.updated_at only among
  -- these projection fields. MIME/size/identity/source/scan/parent stay exact.
  if v is null or (v-array['reservationUpdatedAt','storedVersion'])
    is distinct from (p_staged_proof-array['reservationUpdatedAt','storedVersion']) then return null; end if;
  return v;
end;
$$;

create or replace function private.content_inspection_media_binding(p_type text,p_target uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare d private.deleted_content_records; r private.deleted_media_key_retirements;
  s private.deleted_content_media_stages; v jsonb; proof jsonb; retirement jsonb; mime text; size bigint;
begin
  if p_type not in ('creator_video','social_attachment') then return null; end if;
  -- Any recreated/current row wins, including an unclean or soft-deleted row.
  -- Never use a historical original to substitute for that row's failed proof.
  if private.content_inspection_current_source(p_type,p_target) is not null then
    return private.content_inspection_live_media_binding(p_type,p_target); end if;
  if not exists(select 1 from private.deleted_content_retention_settings where capture_enabled) then return null; end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'content_inspection_retention_requires_read_committed' using errcode='25001'; end if;
  perform private.deleted_media_reference_fence_armed();
  perform pg_catalog.pg_advisory_xact_lock(176214,30);
  select * into d from private.deleted_content_records where target_type=p_type and target_id=p_target::text
    order by deleted_at desc,id limit 1;
  if d.id is null or d.deletion_kind<>'hard' or d.expires_at<=clock_timestamp() then return null; end if;
  select * into s from private.deleted_content_media_stages where deletion_id=d.id
    and target_type=p_type and target_id=p_target::text and author=d.author;
  if s.id is null then return null; end if;
  select * into r from private.deleted_media_key_retirements where stage_id=s.id and status='retained'
    and deletion_id=d.id and deleted_at=d.deleted_at and expires_at=d.expires_at
    and target_type=p_type and target_id=p_target::text and author=d.author
    and provider=s.provider and bucket=s.bucket and object_key=s.object_key and reservation_id=s.reservation_id;
  if r.id is null or r.inspection_proof is null or r.inspection_proof_fingerprint is distinct from md5(r.inspection_proof::text) then return null; end if;
  retirement:=private.deleted_media_retirement_binding(s.id);
  if retirement->>'supported' is distinct from 'true' or private.deleted_media_has_live_reference(s.id) then return null; end if;
  proof:=r.inspection_proof;
  mime:=proof->>'mimeType'; size:=(proof->>'sizeBytes')::bigint;
  if r.provider<>'cloudflare_r2' or r.bucket<>'chillywood-media-origin'
    or proof->>'provider' is distinct from r.provider or proof->>'bucket' is distinct from r.bucket
    or proof->>'objectKey' is distinct from r.object_key or proof->>'author' is distinct from d.author
    or proof->>'targetType' is distinct from p_type or proof->>'targetId' is distinct from p_target::text
    or proof->>'reservationId' is distinct from r.reservation_id::text
    or coalesce(proof->>'scanId','')='' or coalesce(r.object_key,'')='' or r.object_key like '/%' or r.object_key like '%..%'
    or mime is null or mime not in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime','audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/x-wav','audio/webm')
    or size is null or size<=0 or size>(case when p_type='creator_video' then 5368709120 else 262144000 end)
    or proof->>'storedVersion' is distinct from md5((proof-array['storedVersion','mediaKind'])::text)
    then return null; end if;
  -- Durable proof survives account-cascade cleanup, but a remaining scanner
  -- receipt that was changed/revoked cannot silently retain its old clean state.
  if exists(select 1 from public.media_scan_jobs j where j.id::text=proof->>'scanId'
      and (j.status is distinct from 'clean' or j.updated_at is distinct from (proof->>'scanUpdatedAt')::timestamptz))
    or exists(select 1 from public.media_scan_jobs j where j.storage_provider=r.provider and j.storage_bucket=r.bucket
      and j.storage_object_key=r.object_key and j.status not in ('clean')) then return null; end if;
  v:=proof||jsonb_build_object('deletionId',d.id,'retirementId',r.id,'retentionExpiresAt',d.expires_at,
    'ownerProtected',d.owner_protected,'retainedOriginal',true);
  -- Fences may wait. Expiry and source recreation are rechecked afterwards.
  if d.expires_at<=clock_timestamp() or private.content_inspection_current_source(p_type,p_target) is not null then return null; end if;
  return v||jsonb_build_object('storedVersion',md5(v::text));
end;
$$;
create or replace function public.admin_prepare_content_inspection_media(p_context_id uuid,p_target_type text,p_target_id text,p_reason text,p_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_role text; v_target uuid:=p_target_id::uuid; v_grant private.content_inspection_grants;
  v_binding jsonb; v_receipt private.content_inspection_media_receipts;
begin
  perform 1 from private.content_inspection_contexts where id=p_context_id and status='open' for update;
  if not found then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  v_role:=private.content_inspection_actor(p_reason,p_request_id);
  if p_target_type not in ('creator_video','social_attachment') then raise exception 'content_inspection_unsupported_target' using errcode='22023'; end if;
  if not exists(select 1 from private.content_inspection_context_targets where context_id=p_context_id and target_type=p_target_type and target_id=v_target) then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  if not private.content_inspection_context_owned(p_context_id,v_role) then
    select g.* into v_grant from private.content_inspection_grants g where g.context_id=p_context_id and g.target_type=p_target_type
      and g.target_id=v_target and private.content_inspection_grant_valid(g);
    if not found then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  end if;
  if v_role<>'owner' and private.content_inspection_owner_target(p_target_type,v_target) then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  v_binding:=private.content_inspection_media_binding(p_target_type,v_target);
  if v_binding is null then
    perform private.content_inspection_audit(v_role,p_request_id,'prepare_media',p_context_id,p_target_type,v_target,v_grant.id,v_grant.revision,p_reason,'unsupported_media_inspection');
    return jsonb_build_object('availability','unsupported_media_inspection');
  end if;
  insert into private.content_inspection_media_receipts(actor,session_id,actor_role,context_id,target_type,target_id,grant_id,grant_revision,stored_version,reason,expires_at)
    values(auth.uid(),auth.jwt()->>'session_id',v_role,p_context_id,p_target_type,v_target,v_grant.id,v_grant.revision,v_binding->>'storedVersion',p_reason,
      least(clock_timestamp()+interval '2 minutes',coalesce((v_binding->>'retentionExpiresAt')::timestamptz,'infinity'::timestamptz),
        coalesce(v_grant.expires_at,'infinity'::timestamptz)))
    returning * into v_receipt;
  perform private.content_inspection_audit(v_role,p_request_id,'prepare_media',p_context_id,p_target_type,v_target,v_grant.id,v_grant.revision,p_reason,'prepared',v_receipt.stored_version);
  if not private.content_inspection_media_receipt_valid(v_receipt) then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  if (private.content_inspection_media_binding(p_target_type,v_target)->>'storedVersion') is distinct from v_receipt.stored_version then
    raise exception 'content_inspection_stale_version' using errcode='42501'; end if;
  if private.content_inspection_actor(p_reason,p_request_id,false) is distinct from v_role
    or not private.content_inspection_media_receipt_valid(v_receipt) then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  return jsonb_build_object('availability','ready','receiptId',v_receipt.id,'storedVersion',v_receipt.stored_version,
    'mediaKind',v_binding->>'mediaKind','mimeType',v_binding->>'mimeType','sizeBytes',v_binding->'sizeBytes','expiresAt',v_receipt.expires_at);
end;
$$;
create or replace function public.admin_read_content_inspection(p_context_id uuid,p_target_type text,p_target_id text,p_reason text,p_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_role text; v_target uuid:=p_target_id::uuid; v_grant private.content_inspection_grants; v_source jsonb; v_version text; v_result text; v_media jsonb;
begin
  -- All grant/read/revoke/close decisions serialize here. Authority checks are
  -- deliberately AFTER waiting for this lock, using fresh volatile statements.
  perform 1 from private.content_inspection_contexts where id=p_context_id and status='open' for update;
  if not found then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  v_role:=private.content_inspection_actor(p_reason,p_request_id);
  if not exists(select 1 from private.content_inspection_context_targets where context_id=p_context_id and target_type=p_target_type and target_id=v_target) then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  if not private.content_inspection_context_owned(p_context_id,v_role) then
    select g.* into v_grant from private.content_inspection_grants g where g.context_id=p_context_id
      and g.target_type=p_target_type and g.target_id=v_target and private.content_inspection_grant_valid(g);
    if not found then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  end if;
  v_source:=private.content_inspection_source(p_target_type,v_target);
  if v_role<>'owner' and private.content_inspection_owner_target(p_target_type,v_target) then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  v_result:=case when v_source is null then 'unavailable_current' when coalesce((v_source->>'isRetainedDeletion')::boolean,false) then 'available_deleted' when p_target_type='social_attachment' then 'media_only' else 'available' end;
  if v_result='available_deleted' then v_media:=private.content_inspection_media_binding(p_target_type,v_target); end if;
  v_version:=case when v_source is not null then md5(v_source::text) end;
  perform private.content_inspection_audit(v_role,p_request_id,'read',p_context_id,p_target_type,v_target,v_grant.id,v_grant.revision,p_reason,v_result,v_version);
  -- Audit insertion can wait. Recheck current session/role and wall-clock grant
  -- expiry afterwards; failure rolls back the event and releases no content.
  if private.content_inspection_actor(p_reason,p_request_id,false) is distinct from v_role
    or (v_grant.id is not null and not private.content_inspection_grant_valid(v_grant)) then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  if v_role<>'owner' and private.content_inspection_owner_target(p_target_type,v_target) then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  if md5(private.content_inspection_source(p_target_type,v_target)::text) is distinct from v_version then
    raise exception 'content_inspection_stale_version' using errcode='42501'; end if;
  if private.content_inspection_actor(p_reason,p_request_id,false) is distinct from v_role then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  if v_media is not null and (private.content_inspection_media_binding(p_target_type,v_target)->>'storedVersion') is distinct from v_media->>'storedVersion' then
    raise exception 'content_inspection_stale_version' using errcode='42501'; end if;
  if private.content_inspection_actor(p_reason,p_request_id,false) is distinct from v_role
    or (v_grant.id is not null and not private.content_inspection_grant_valid(v_grant))
    or (v_role<>'owner' and private.content_inspection_owner_target(p_target_type,v_target)) then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  return jsonb_build_object('contextId',p_context_id,'targetType',p_target_type,'targetId',v_target,
    'availability',v_result,'storedVersion',v_version,'sourceUpdatedAt',v_source->'sourceUpdatedAt',
    'content',v_source->'content','restrictionLabels',coalesce(v_source->'restrictionLabels','[]'::jsonb),
    'deletedRetentionAvailability',case when coalesce((v_source->>'isRetainedDeletion')::boolean,false) then 'available' else 'unavailable' end,
    'deletedAt',v_source->'deletedAt','retentionExpiresAt',v_source->'retentionExpiresAt',
    'mediaAvailability',case when v_media is not null then 'prepare_required' else 'unsupported_media_inspection' end,
    'retainedMediaAvailability',case when v_media is not null then 'prepare_required' else 'unsupported' end);
end;
$$;

revoke all on function private.content_inspection_live_media_binding(text,uuid,uuid),
  private.finalize_deleted_media_inspection_proof(uuid,jsonb),private.content_inspection_media_binding(text,uuid)
  from public,anon,authenticated,service_role;
commit;
