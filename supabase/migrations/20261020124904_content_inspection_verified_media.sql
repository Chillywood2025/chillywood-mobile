-- Disabled-by-default inspection only. Existing consumer/media gates unchanged.
-- Exact clean stored originals only; no rendition substitution or deleted-byte
-- retention. Operational receipts are not anonymous bearer capabilities.
begin;
create table private.content_inspection_media_receipts (
  id uuid primary key default gen_random_uuid(), actor uuid not null,
  session_id text not null, actor_role text not null, context_id uuid not null,
  target_type text not null, target_id uuid not null,
  grant_id uuid, grant_revision bigint, stored_version text not null,
  reason text not null, expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(context_id,target_type,target_id) references private.content_inspection_context_targets
);
create table private.content_inspection_media_authorizations (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references private.content_inspection_media_receipts(id),
  expires_at timestamptz not null, consumed_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
alter table private.content_inspection_media_receipts enable row level security;
alter table private.content_inspection_media_receipts force row level security;
alter table private.content_inspection_media_authorizations enable row level security;
alter table private.content_inspection_media_authorizations force row level security;
revoke all on private.content_inspection_media_receipts,private.content_inspection_media_authorizations from public,anon,authenticated,service_role;

create function private.content_inspection_media_binding(p_type text,p_target uuid) returns jsonb
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
    and r.status='verified' and r.verified_at is not null and r.verified_at<=r.expires_at
    and r.attached_at is not null and r.attached_record_id=p_target::text and r.deleted_at is null
    and lower(split_part(r.observed_mime_type,';',1))=v_mime and r.observed_size_bytes=v_size
    and lower(split_part(r.expected_mime_type,';',1))=v_mime and r.expected_size_bytes=v_size;
  if not found and not public.has_verified_legacy_media_object_provenance(v_table,p_target::text,v_provider,v_bucket,v_key) then return null; end if;
  v_binding:=jsonb_build_object('provider',v_provider,'bucket',v_bucket,'objectKey',v_key,'mimeType',v_mime,'sizeBytes',v_size,
    'author',v_author,'targetType',p_type,'targetId',p_target,'parentType',v_row->>'surface_type','parentId',v_row->>'surface_id',
    'sourceUpdatedAt',v_row->>'updated_at','scanId',v_scan.id,'scanUpdatedAt',v_scan.updated_at,
    'reservationId',v_reservation.id,'reservationUpdatedAt',v_reservation.updated_at,
    'parentVersion',case when v_parent is not null then md5(v_parent::text) end);
  return v_binding||jsonb_build_object('storedVersion',md5(v_binding::text),'mediaKind',split_part(v_mime,'/',1));
end;
$$;

create function private.content_inspection_media_receipt_valid(r private.content_inspection_media_receipts) returns boolean
language sql volatile security definer set search_path='' as $$
  select r.expires_at>clock_timestamp()
    and exists(select 1 from private.content_inspection_settings where singleton and enabled)
    and exists(select 1 from auth.users u where u.id=r.actor and u.email_confirmed_at is not null and u.deleted_at is null)
    and exists(select 1 from auth.sessions s where s.id::text=r.session_id and s.user_id=r.actor
      and (s.not_after is null or s.not_after>clock_timestamp()))
    and not public.is_account_access_restricted(r.actor::text)
    and not public.is_account_deletion_scheduled(r.actor::text)
    and public.money_purchase_intent_session_authorized_internal(r.actor,r.session_id)
    and public.platform_subject_has_role_internal(r.actor::text,array[r.actor_role])
    and exists(select 1 from public.platform_role_memberships m where m.user_id=r.actor::text and m.role=r.actor_role
      and m.status='active' and (m.expires_at is null or m.expires_at>clock_timestamp()))
    and (r.actor_role='owner' or not private.content_inspection_owner_target(r.target_type,r.target_id))
    and exists(select 1 from private.content_inspection_contexts c where c.id=r.context_id and c.status='open'
      and ((r.actor_role='owner' or (r.actor_role='super_admin' and c.creator=r.actor)) and r.grant_id is null
        or exists(select 1 from private.content_inspection_grants g where g.id=r.grant_id and g.revision=r.grant_revision
          and g.context_id=r.context_id and g.target_type=r.target_type and g.target_id=r.target_id and g.grantee=r.actor
          and g.revoked_at is null and g.expires_at>clock_timestamp()
          and public.platform_subject_has_role_internal(g.grantor::text,array['owner'])
          and exists(select 1 from public.platform_role_memberships m where m.user_id=g.grantor::text and m.role='owner'
            and m.status='active' and (m.expires_at is null or m.expires_at>clock_timestamp())))));
$$;

create function public.admin_prepare_content_inspection_media(p_context_id uuid,p_target_type text,p_target_id text,p_reason text,p_request_id uuid) returns jsonb
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
    values(auth.uid(),auth.jwt()->>'session_id',v_role,p_context_id,p_target_type,v_target,v_grant.id,v_grant.revision,v_binding->>'storedVersion',p_reason,clock_timestamp()+interval '2 minutes')
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

create function public.admin_authorize_content_inspection_media(p_receipt_id uuid,p_request_id uuid,p_expected_version text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r private.content_inspection_media_receipts; v_role text; v_binding jsonb; v_id uuid;
begin
  select * into r from private.content_inspection_media_receipts where id=p_receipt_id and actor=auth.uid() and session_id=auth.jwt()->>'session_id';
  if not found then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  perform 1 from private.content_inspection_contexts where id=r.context_id for update;
  v_role:=private.content_inspection_actor(r.reason,p_request_id);
  if v_role is distinct from r.actor_role or not private.content_inspection_media_receipt_valid(r) then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  v_binding:=private.content_inspection_media_binding(r.target_type,r.target_id);
  if v_binding is null or p_expected_version is distinct from r.stored_version or v_binding->>'storedVersion' is distinct from r.stored_version then
    raise exception 'content_inspection_stale_version' using errcode='42501'; end if;
  insert into private.content_inspection_media_authorizations(receipt_id,expires_at) values(r.id,least(r.expires_at,clock_timestamp()+interval '5 seconds')) returning id into v_id;
  perform private.content_inspection_audit(v_role,p_request_id,'authorize_media',r.context_id,r.target_type,r.target_id,r.grant_id,r.grant_revision,r.reason,'authorized',r.stored_version);
  if not private.content_inspection_media_receipt_valid(r) then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  if (private.content_inspection_media_binding(r.target_type,r.target_id)->>'storedVersion') is distinct from r.stored_version then
    raise exception 'content_inspection_stale_version' using errcode='42501'; end if;
  if private.content_inspection_actor(r.reason,p_request_id,false) is distinct from v_role
    or not private.content_inspection_media_receipt_valid(r) then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  return jsonb_build_object('allowed',true,'authorizationId',v_id,'receiptId',r.id,'storedVersion',r.stored_version);
end;
$$;

create function public.admin_resolve_content_inspection_media(p_authorization_id uuid,p_actor_id uuid,p_session_generation text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r private.content_inspection_media_receipts; a private.content_inspection_media_authorizations; v_binding jsonb;
begin
  select r0.* into r from private.content_inspection_media_receipts r0 join private.content_inspection_media_authorizations a0 on a0.receipt_id=r0.id
    where a0.id=p_authorization_id and r0.actor=p_actor_id and r0.session_id=p_session_generation;
  if not found then raise exception 'content_inspection_denied' using errcode='42501'; end if;
  -- Same order as actor operations: context, settings, authorization row.
  perform 1 from private.content_inspection_contexts where id=r.context_id for update;
  perform 1 from private.content_inspection_settings where singleton and enabled for share;
  select * into a from private.content_inspection_media_authorizations where id=p_authorization_id for update;
  if a.consumed_at is not null or a.expires_at<=clock_timestamp() or not private.content_inspection_media_receipt_valid(r) then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  v_binding:=private.content_inspection_media_binding(r.target_type,r.target_id);
  if v_binding is null or v_binding->>'storedVersion' is distinct from r.stored_version then raise exception 'content_inspection_stale_version' using errcode='42501'; end if;
  update private.content_inspection_media_authorizations set consumed_at=clock_timestamp() where id=a.id;
  if a.expires_at<=clock_timestamp() or not private.content_inspection_media_receipt_valid(r) then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  if (private.content_inspection_media_binding(r.target_type,r.target_id)->>'storedVersion') is distinct from r.stored_version then
    raise exception 'content_inspection_stale_version' using errcode='42501'; end if;
  if a.expires_at<=clock_timestamp() or not private.content_inspection_media_receipt_valid(r) then
    raise exception 'content_inspection_denied' using errcode='42501'; end if;
  return jsonb_build_object('provider',v_binding->>'provider','bucket',v_binding->>'bucket','objectKey',v_binding->>'objectKey',
    'mimeType',v_binding->>'mimeType','sizeBytes',v_binding->'sizeBytes','storedVersion',r.stored_version);
end;
$$;

revoke all on function private.content_inspection_media_binding(text,uuid),
  private.content_inspection_media_receipt_valid(private.content_inspection_media_receipts) from public,anon,authenticated,service_role;
revoke all on function public.admin_prepare_content_inspection_media(uuid,text,text,text,uuid),
  public.admin_authorize_content_inspection_media(uuid,uuid,text),
  public.admin_resolve_content_inspection_media(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_prepare_content_inspection_media(uuid,text,text,text,uuid),
  public.admin_authorize_content_inspection_media(uuid,uuid,text) to authenticated;
grant execute on function public.admin_resolve_content_inspection_media(uuid,uuid,text) to service_role;
commit;
