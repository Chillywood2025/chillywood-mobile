-- Private upload admission, after paid-video-media.sql, before finalization.
-- An authenticated gateway must resolve user/session itself, never from a body.
-- A transfer lease authorizes one immutable conditional PUT attempt; it is not
-- evidence of storage, malware clearance, publication or delivery entitlement.
set local role sbx_v1_core_owner;
create table sandbox_commerce_v1.paid_video_transfers (
 id uuid primary key default gen_random_uuid(), upload_id uuid not null references sandbox_commerce_v1.paid_video_uploads,
 user_id uuid not null, session_id uuid not null, request_id uuid not null,
 issued_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null default clock_timestamp()+interval '15 seconds',
 unique(user_id,request_id)
);
alter table sandbox_commerce_v1.paid_video_transfers enable row level security;
alter table sandbox_commerce_v1.paid_video_transfers force row level security;
create policy core_owner on sandbox_commerce_v1.paid_video_transfers for all to sbx_v1_core_owner using(true) with check(true);
revoke all on sandbox_commerce_v1.paid_video_transfers from public,anon,authenticated,service_role;
create trigger identity_immutable before update or delete on sandbox_commerce_v1.paid_video_transfers
 for each row execute function sandbox_commerce_v1.protect_resource_identity();
create function sandbox_commerce_v1.paid_video_upload_admit(p_action text,p_upload_id uuid,p_user_id uuid,p_session_id uuid,p_request_id uuid,p_transfer_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare u sandbox_commerce_v1.paid_video_uploads; route sandbox_commerce_v1.paid_video_routes;
 t sandbox_commerce_v1.paid_video_transfers; authority jsonb; valid_until timestamptz;
begin
 if p_action is null or p_action not in ('issue','check') or p_upload_id is null or p_user_id is null or p_session_id is null or p_request_id is null
  or (p_action='issue' and p_transfer_id is not null) or (p_action='check' and p_transfer_id is null) then raise exception 'paid_video_transfer_context_invalid'; end if;
 perform sandbox_commerce_v1.assert_generation(false);
 authority:=sandbox_commerce_v1.assert_authority(p_user_id,p_session_id,'delivery');
 select * into t from sandbox_commerce_v1.paid_video_transfers where user_id=p_user_id and request_id=p_request_id;
 if found and (t.upload_id<>p_upload_id or t.session_id<>p_session_id) then raise exception 'paid_video_transfer_idempotency_conflict'; end if;
 if found and p_action='issue' then
  perform sandbox_commerce_v1.assert_fresh(authority);
  return jsonb_build_object('protocol','scpv-upload-admission-v1','state','unknown','dispatchAllowed',false,'transferId',t.id);
 end if;
 perform sandbox_commerce_v1.assert_generation(true);
 authority:=sandbox_commerce_v1.assert_authority(p_user_id,p_session_id,'creator');
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=p_upload_id and creator_id=p_user_id for update nowait;
 select * into strict route from sandbox_commerce_v1.paid_video_routes where id=u.route_id and active and provider='s3' for share nowait;
 if u.state<>'reserved' or u.expires_at<=clock_timestamp() then raise exception 'paid_video_upload_unavailable'; end if;
 if p_action='issue' then
  if exists(select 1 from sandbox_commerce_v1.paid_video_transfers where upload_id=u.id and expires_at>clock_timestamp())
   then raise exception 'paid_video_transfer_busy'; end if;
  insert into sandbox_commerce_v1.paid_video_transfers(upload_id,user_id,session_id,request_id)
   values(u.id,p_user_id,p_session_id,p_request_id) returning * into t;
 elsif t.id is null or t.id<>p_transfer_id or t.expires_at<=clock_timestamp()
  then raise exception 'paid_video_transfer_stale';
 end if;
 valid_until:=least((authority->>'valid_until')::timestamptz,t.expires_at,clock_timestamp()+interval '5 seconds');
 perform sandbox_commerce_v1.assert_fresh(authority);
 return jsonb_build_object('protocol','scpv-upload-admission-v1','state','leased','dispatchAllowed',true,'transferId',t.id,
  'actor',jsonb_build_object('userId',p_user_id,'sessionGeneration',p_session_id),'uploadId','scpv_upload_'||u.id,'requestId',p_request_id,
  'validUntilMs',floor(extract(epoch from valid_until)*1000),'object',jsonb_build_object('provider',route.provider,'bucket',route.bucket,'routeId',route.id,
  'objectKey',u.object_key,'incarnation',u.incarnation,'expectedSha256',u.expected_sha256,'expectedByteLength',u.expected_byte_length));
end $$;
revoke all on function sandbox_commerce_v1.paid_video_upload_admit(text,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
reset role;
create function public.isolated_paid_video_upload_v1(p_action text,p_upload_id uuid,p_user_id uuid,p_session_id uuid,p_request_id uuid,p_transfer_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 return sandbox_commerce_v1.paid_video_upload_admit(p_action,p_upload_id,p_user_id,p_session_id,p_request_id,p_transfer_id);
end $$;
alter function public.isolated_paid_video_upload_v1(text,uuid,uuid,uuid,uuid,uuid) owner to sbx_v1_core_owner;
revoke all on function public.isolated_paid_video_upload_v1(text,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.isolated_paid_video_upload_v1(text,uuid,uuid,uuid,uuid,uuid) to service_role;
