set local role sbx_v1_core_owner;
create function sandbox_commerce_v1.r2_receipt_json(p_upload uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('protocol','scpv-object-receipt-r2-v1','state','recorded','uploadId','scpv_upload_'||u.id,
  'userId',b.user_id,'originalSessionId',b.session_id,'originalConfigurationDigest',p.configuration_digest,
  'requestId',b.request_id,'transferId',b.id,'incarnation',u.incarnation,'sha256',u.expected_sha256,
  'byteLength',u.expected_byte_length,'identity',r.identity,'profileId',p.id,'qualificationSha256',p.qualification_sha256)
 from sandbox_commerce_v1.r2_receipts r join sandbox_commerce_v1.paid_video_uploads u on u.id=r.upload_id
 join sandbox_commerce_v1.r2_dispatches d on d.upload_id=u.id join sandbox_commerce_v1.r2_bindings b on b.id=d.binding_id
 join sandbox_commerce_v1.r2_profiles p on p.id=b.profile_id where u.id=p_upload
$$;
-- All phases re-evaluate current authority, not a cached capability. The token
-- itself is an immutable exact-row binding and is never reusable as a grant.
create function sandbox_commerce_v1.r2_current(p_token jsonb) returns jsonb
language plpgsql volatile set search_path='' as $$
declare b sandbox_commerce_v1.r2_bindings; p sandbox_commerce_v1.r2_profiles;
 u sandbox_commerce_v1.paid_video_uploads; r sandbox_commerce_v1.resources;
 a jsonb; creator jsonb; access jsonb; obj jsonb; deadline timestamptz; digest text;
begin
 perform sandbox_commerce_v1.assert_generation(true);
 select * into strict b from sandbox_commerce_v1.r2_bindings where id=(p_token->>'bindingId')::uuid for share nowait;
 select * into strict p from sandbox_commerce_v1.r2_profiles where id=b.profile_id for share nowait;
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=b.upload_id for share nowait;
 select * into strict r from sandbox_commerce_v1.resources where id=u.resource_id for share nowait;
 if p_token is distinct from b.token or b.expires_at<=clock_timestamp()
  or not sandbox_commerce_v1.r2_ready(p.configuration_digest,u.route_id)
  or exists(select 1 from sandbox_commerce_v1.paid_video_removals where resource_id=r.id)
  or u.state in('rejected','retired') or u.moderation='removed'
 then raise exception 'paid_video_r2_current_binding_required'; end if;
 creator:=sandbox_commerce_v1.assert_authority(u.creator_id,null,'creator_subject');
 if b.operation='range' then
  access:=sandbox_commerce_v1.native_store_paid_video_r2_access(b.user_id,b.session_id,r.id,b.grant_id);
  a:=sandbox_commerce_v1.assert_authority(b.user_id,b.session_id,'delivery');
 elsif b.operation='scan' then
  a:=creator;
  perform 1 from sandbox_commerce_v1.paid_video_tickets t join sandbox_commerce_v1.r2_tickets rt on rt.ticket_id=t.id
   where t.id=b.request_id and t.upload_id=u.id and t.worker_id=p.worker_id and rt.profile_id=p.id
    and rt.object=b.token->'object' and t.positive_consumed_at is null and t.expires_at>clock_timestamp() for share of t,rt nowait;
  if not found or u.state<>'scan_pending' then raise exception 'paid_video_r2_ticket_required'; end if;
 else
  a:=sandbox_commerce_v1.assert_authority(b.user_id,b.session_id,'creator');
  if u.creator_id<>b.user_id or u.state<>'reserved' or u.expires_at<=clock_timestamp() or r.status<>'draft'
  then raise exception 'paid_video_r2_upload_unavailable'; end if;
 end if;
 obj:=sandbox_commerce_v1.r2_object(u.id,b.operation<>'upload');
 if obj is distinct from b.token->'object' or (b.operation<>'upload' and not sandbox_commerce_v1.r2_identity_valid(obj->'identity'))
 then raise exception 'paid_video_r2_identity_changed'; end if;
 deadline:=least(b.expires_at,(a->>'valid_until')::timestamptz,(creator->>'valid_until')::timestamptz);
 if access is not null then deadline:=least(deadline,to_timestamp((access->>'validUntilMs')::numeric/1000)); end if;
 -- Moving five-second lease timestamps are excluded; all actual authority and
 -- immutable allocation/object identity is retained in the before/after digest.
 digest:=encode(sha256(convert_to(jsonb_build_object('profile',to_jsonb(p)-'gateway_key',
  'upload',to_jsonb(u),'resource',to_jsonb(r),'actor',a-'valid_until','creator',creator-'valid_until',
  'access',access-'validUntilMs','object',obj)::text,'UTF8')),'hex');
 perform sandbox_commerce_v1.assert_fresh(a); perform sandbox_commerce_v1.assert_fresh(creator);
 return jsonb_build_object('protocol','scpv-r2-authority-v1','bindingId',b.id,'profileId',p.id,
  'qualificationSha256',p.qualification_sha256,'authorityDigest',digest,'object',obj,
  'validUntilMs',floor(extract(epoch from deadline)*1000),'dispatchAllowed',b.operation='upload');
end $$;
create function sandbox_commerce_v1.r2_admit(p_action text,p_user uuid,p_session uuid,p_upload uuid,p_request uuid,p_configuration text,p_range jsonb,p_grant uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare p sandbox_commerce_v1.r2_profiles;u sandbox_commerce_v1.paid_video_uploads;
 b sandbox_commerce_v1.r2_bindings;a jsonb; subject jsonb;token jsonb;raw text;receipt jsonb;at timestamptz;deadline timestamptz;
begin
 if p_action='scan' and current_setting('role',true)='sbx_v1_r2_scanner' then
  perform sandbox_commerce_v1.r2_assert_scanner();
 else perform sandbox_commerce_v1.assert_provider_service();end if;
 perform sandbox_commerce_v1.assert_generation(false);
 if p_action not in('upload','probe','scan','range') or p_action is null or p_request is null
 then raise exception 'paid_video_r2_action_invalid'; end if;
 if p_action='range' and p_upload is null then
  select x.* into strict u from sandbox_commerce_v1.paid_video_uploads x join sandbox_commerce_v1.resource_grants g on g.product_id=x.resource_id
   where g.id=p_grant and g.buyer_id=p_user for share of x,g nowait;
 else select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=p_upload for share nowait;end if;
 perform sandbox_commerce_v1.paid_video_assert_authoring_mode(u.id,p_configuration);
 -- Recovery is immutable history, not renewed object/access authority. Match
 -- the original dispatch and actor before returning a receipt while disabled.
 if p_action='probe' then
  a:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
  select x.* into strict b from sandbox_commerce_v1.r2_bindings x where x.upload_id=u.id and x.operation='upload';
  if u.creator_id<>p_user or b.request_id<>p_request or not exists(select 1 from sandbox_commerce_v1.r2_profiles x
   where x.id=b.profile_id and x.configuration_digest=p_configuration and x.route_id=u.route_id)
  then raise exception 'paid_video_r2_request_conflict';end if;
  receipt:=sandbox_commerce_v1.r2_receipt_json(u.id);
  if receipt is not null then perform sandbox_commerce_v1.assert_fresh(a);return receipt;end if;
 end if;
 if not sandbox_commerce_v1.r2_ready(p_configuration,u.route_id) then raise exception 'paid_video_r2_profile_unavailable'; end if;
 select * into strict p from sandbox_commerce_v1.r2_profiles where configuration_digest=p_configuration;
 if p_action='scan' then
  if current_setting('role',true)='sbx_v1_r2_scanner' then perform sandbox_commerce_v1.r2_assert_scanner(p.id,p_user);end if;
  if p_user<>p.worker_id or p_session is not null then raise exception 'paid_video_r2_worker_invalid'; end if;
  a:=sandbox_commerce_v1.assert_authority(u.creator_id,null,'creator_subject');
  subject:=jsonb_build_object('kind','worker','workerId',p.worker_id);
 else
  a:=sandbox_commerce_v1.assert_authority(p_user,p_session,case when p_action='range' then 'delivery' else 'creator' end);
  subject:=jsonb_build_object('kind','session','userId',p_user,'sessionGeneration',p_session);
  if p_action<>'range' and u.creator_id<>p_user then raise exception 'paid_video_r2_owner_required'; end if;
 end if;
 if p_action='range' then
  if p_grant is null or jsonb_typeof(p_range) is distinct from 'object' or not(p_range ?& array['start','end'])
   or (p_range-array['start','end'])<>'{}'::jsonb
   or jsonb_typeof(p_range->'start') is distinct from 'number' or jsonb_typeof(p_range->'end') is distinct from 'number'
   or p_range->>'start' !~ '^(0|[1-9][0-9]*)$' or p_range->>'end' !~ '^(0|[1-9][0-9]*)$'
   or (p_range->>'start')::bigint<0 or (p_range->>'end')::bigint<(p_range->>'start')::bigint
   or (p_range->>'end')::bigint>=u.expected_byte_length or (p_range->>'end')::bigint-(p_range->>'start')::bigint+1>524288
  then raise exception 'paid_video_r2_range_invalid'; end if;
 elsif p_range is not null or p_grant is not null then raise exception 'paid_video_r2_parameters_invalid'; end if;
 if p_action='probe' then
  select * into strict b from sandbox_commerce_v1.r2_bindings where upload_id=u.id and operation='upload';
  if b.request_id<>p_request then raise exception 'paid_video_r2_request_conflict'; end if;
  receipt:=sandbox_commerce_v1.r2_receipt_json(u.id);
  if receipt is not null then perform sandbox_commerce_v1.assert_fresh(a);return receipt; end if;
 end if;
 if p_action='upload' then
  if not pg_try_advisory_xact_lock(hashtextextended('paid-video-r2-upload:'||u.id,692))
  then raise exception 'paid_video_r2_dispatch_busy' using errcode='55P03';end if;
  if exists(select 1 from sandbox_commerce_v1.r2_bindings where upload_id=u.id and operation='upload')
  then raise exception 'paid_video_r2_dispatch_non_retriable'; end if;
 elsif not exists(select 1 from sandbox_commerce_v1.r2_commits where upload_id=u.id and state='acknowledged')
 then raise exception 'paid_video_r2_acknowledged_identity_required'; end if;
 at:=clock_timestamp();deadline:=least(at+interval '5 seconds',(a->>'valid_until')::timestamptz);
 token:=jsonb_build_object('protocol','scpv-r2-gateway-token-v1','operation',p_action,'keyId',p.key_id,'profileId',p.id,
  'qualificationSha256',p.qualification_sha256,'bindingId',gen_random_uuid(),'uploadId','scpv_upload_'||u.id,
  'resourceId','scv1_resource_'||u.resource_id,'requestId',p_request,'configurationDigest',p_configuration,
  'subject',subject,'object',sandbox_commerce_v1.r2_object(u.id,p_action<>'upload'),'range',p_range,'grantId',p_grant,
  'issuedAtMs',floor(extract(epoch from at)*1000),'expiresAtMs',floor(extract(epoch from deadline)*1000));
 insert into sandbox_commerce_v1.r2_bindings values((token->>'bindingId')::uuid,p.id,u.id,p_request,p_user,p_session,p_grant,p_action,token,at,deadline);
 perform sandbox_commerce_v1.r2_current(token);
 raw:=token::text;return jsonb_build_object('raw',raw,'signature',sandbox_commerce_v1.paid_video_hmac(p.gateway_key,raw));
end $$;
create function sandbox_commerce_v1.r2_gateway(p_token jsonb,p_phase text,p_outcome jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare b sandbox_commerce_v1.r2_bindings;a jsonb;
begin
 if current_setting('request.jwt.claims',true)::jsonb->>'role' is distinct from 'sbx_v1_r2_gateway'
  or current_setting('role',true) is distinct from 'sbx_v1_r2_gateway'
  or current_setting('request.jwt.claims',true)::jsonb->>'profile_id' is distinct from p_token->>'profileId'
  or p_token->>'profileId' is null
 then raise exception 'paid_video_r2_gateway_role_required' using errcode='42501'; end if;
 a:=sandbox_commerce_v1.r2_current(p_token);
 select * into strict b from sandbox_commerce_v1.r2_bindings where id=(p_token->>'bindingId')::uuid;
 if p_phase='before' and p_outcome is null then
  if b.operation='upload' then
   if not pg_try_advisory_xact_lock(hashtextextended('paid-video-r2-upload:'||b.upload_id,692))
   then raise exception 'paid_video_r2_dispatch_busy' using errcode='55P03';end if;
   insert into sandbox_commerce_v1.r2_dispatches(upload_id,binding_id) values(b.upload_id,b.id);
  end if;
  return a;
 elsif p_phase='after' and b.operation<>'upload' and p_outcome is null then return a;
 elsif p_phase='commit' and b.operation='upload' then
  perform 1 from sandbox_commerce_v1.r2_dispatches where upload_id=b.upload_id and binding_id=b.id for share nowait;
  if not found or jsonb_typeof(p_outcome) is distinct from 'object' or p_outcome->>'state' not in('acknowledged','unknown','exists_unverified')
   or p_outcome->>'state' is null
   or (p_outcome->>'state'='acknowledged' and ((p_outcome-array['state','identity'])<>'{}'::jsonb or not sandbox_commerce_v1.r2_identity_valid(p_outcome->'identity')))
   or (p_outcome->>'state'<>'acknowledged' and p_outcome-array['state']<>'{}'::jsonb)
  then raise exception 'paid_video_r2_commit_invalid'; end if;
  insert into sandbox_commerce_v1.r2_commits(upload_id,state,identity) values(b.upload_id,p_outcome->>'state',p_outcome->'identity');
  return jsonb_build_object('protocol','scpv-r2-commit-v1','state',p_outcome->>'state','bindingId',b.id);
 end if;
 raise exception 'paid_video_r2_phase_invalid';
end $$;
create function sandbox_commerce_v1.r2_reconcile(p_raw text,p_signature text,p_user uuid,p_session uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v sandbox_commerce_v1.paid_video_verifiers;p sandbox_commerce_v1.r2_profiles;
 b sandbox_commerce_v1.r2_bindings;u sandbox_commerce_v1.paid_video_uploads;o jsonb;token jsonb;a jsonb;
begin
 perform sandbox_commerce_v1.assert_provider_service();
 if p_raw is null or octet_length(p_raw)>16384 then raise exception 'paid_video_r2_observation_invalid'; end if;
 o:=p_raw::jsonb;token:=o->'token';
 if jsonb_typeof(o) is distinct from 'object' or not(o ?& array['protocol','verifierId','token','identity','sha256','byteLength','checkedAtMs','expiresAtMs'])
  or (o-array['protocol','verifierId','token','identity','sha256','byteLength','checkedAtMs','expiresAtMs'])<>'{}'::jsonb
  or o->>'protocol' is distinct from 'scpv-object-observation-r2-v1' then raise exception 'paid_video_r2_observation_invalid'; end if;
 select * into strict b from sandbox_commerce_v1.r2_bindings where id=(o#>>'{token,bindingId}')::uuid;
 select * into strict p from sandbox_commerce_v1.r2_profiles where id=b.profile_id;
 select * into strict v from sandbox_commerce_v1.paid_video_verifiers where id=p.verifier_id and active for share nowait;
 if not sandbox_commerce_v1.paid_video_signature_matches(sandbox_commerce_v1.paid_video_hmac(v.hmac_key,p_raw),p_signature)
 then raise exception 'paid_video_r2_verifier_signature_invalid'; end if;
 a:=sandbox_commerce_v1.r2_current(token);
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=b.upload_id for update nowait;
 if b.operation<>'probe' or b.user_id is distinct from p_user or b.session_id is distinct from p_session
  or o->>'verifierId' is distinct from v.id::text or o->'identity' is distinct from token#>'{object,identity}'
  or o->>'sha256' is distinct from u.expected_sha256 or o->'byteLength' is distinct from to_jsonb(u.expected_byte_length)
  or jsonb_typeof(o->'checkedAtMs') is distinct from 'number' or jsonb_typeof(o->'expiresAtMs') is distinct from 'number'
  or (o->>'checkedAtMs')::numeric<(token->>'issuedAtMs')::numeric or (o->>'checkedAtMs')::numeric>extract(epoch from clock_timestamp())*1000
  or (o->>'expiresAtMs')::numeric>(token->>'expiresAtMs')::numeric or (o->>'expiresAtMs')::numeric<=extract(epoch from clock_timestamp())*1000
 then raise exception 'paid_video_r2_observation_binding_invalid'; end if;
 if not exists(select 1 from sandbox_commerce_v1.r2_receipts where upload_id=u.id) then
  insert into sandbox_commerce_v1.r2_receipts(upload_id,binding_id,verifier_id,identity,raw_body,signature)
   values(u.id,b.id,v.id,o->'identity',p_raw,p_signature);
  update sandbox_commerce_v1.paid_video_uploads set r2_identity=o->'identity' where id=u.id;
 end if;
 return sandbox_commerce_v1.r2_receipt_json(u.id);
end $$;
revoke all on function sandbox_commerce_v1.r2_receipt_json(uuid),sandbox_commerce_v1.r2_current(jsonb),
 sandbox_commerce_v1.r2_admit(text,uuid,uuid,uuid,uuid,text,jsonb,uuid),sandbox_commerce_v1.r2_gateway(jsonb,text,jsonb),sandbox_commerce_v1.r2_reconcile(text,text,uuid,uuid)
 from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway;
reset role;
create function public.native_paid_video_r2_admit_v1(p_action text,p_user_id uuid,p_session_id uuid,p_upload_id uuid,p_request_id uuid,p_configuration_digest text,p_range jsonb,p_grant_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 return sandbox_commerce_v1.r2_admit(p_action,p_user_id,p_session_id,p_upload_id,p_request_id,p_configuration_digest,p_range,p_grant_id);end $$;
create function public.native_paid_video_r2_gateway_v1(p_token jsonb,p_phase text,p_outcome jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$begin
 perform sandbox_commerce_v1.arm_transaction_timeout();return sandbox_commerce_v1.r2_gateway(p_token,p_phase,p_outcome);end $$;
create function public.native_paid_video_r2_reconcile_v1(p_raw_body text,p_signature text,p_user_id uuid,p_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$begin
 perform sandbox_commerce_v1.arm_transaction_timeout();return sandbox_commerce_v1.r2_reconcile(p_raw_body,p_signature,p_user_id,p_session_id);end $$;
alter function public.native_paid_video_r2_admit_v1(text,uuid,uuid,uuid,uuid,text,jsonb,uuid) owner to sbx_v1_core_owner;
alter function public.native_paid_video_r2_gateway_v1(jsonb,text,jsonb) owner to sbx_v1_core_owner;
alter function public.native_paid_video_r2_reconcile_v1(text,text,uuid,uuid) owner to sbx_v1_core_owner;
revoke all on function public.native_paid_video_r2_admit_v1(text,uuid,uuid,uuid,uuid,text,jsonb,uuid),public.native_paid_video_r2_gateway_v1(jsonb,text,jsonb),public.native_paid_video_r2_reconcile_v1(text,text,uuid,uuid)
 from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway;
grant execute on function public.native_paid_video_r2_admit_v1(text,uuid,uuid,uuid,uuid,text,jsonb,uuid),public.native_paid_video_r2_reconcile_v1(text,text,uuid,uuid) to service_role;
grant usage on schema public to sbx_v1_r2_gateway;
grant execute on function public.native_paid_video_r2_gateway_v1(jsonb,text,jsonb) to sbx_v1_r2_gateway;
create function public.native_paid_video_r2_route_v1(p_user_id uuid,p_session_id uuid,p_upload_id uuid,p_configuration_digest text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare u sandbox_commerce_v1.paid_video_uploads;r sandbox_commerce_v1.paid_video_routes;a jsonb;begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.assert_provider_service();
 perform sandbox_commerce_v1.assert_generation(false);
 a:=sandbox_commerce_v1.assert_authority(p_user_id,p_session_id,'delivery');
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=p_upload_id and creator_id=p_user_id for share nowait;
 select * into strict r from sandbox_commerce_v1.paid_video_routes where id=u.route_id for share nowait;
 perform sandbox_commerce_v1.paid_video_assert_authoring_mode(u.id,p_configuration_digest);
 if (r.provider='cloudflare_r2' and not exists(select 1 from sandbox_commerce_v1.r2_profiles x where x.configuration_digest=p_configuration_digest and x.route_id=r.id))
  or (r.provider='s3' and not (
   exists(select 1 from sandbox_commerce_v1.paid_video_native_authoring_profiles x where x.configuration_digest=p_configuration_digest and x.route_id=r.id)
   or exists(select 1 from sandbox_commerce_v1.test_store_v3_native_profiles x join sandbox_commerce_v1.paid_video_gateway_controls ctl on ctl.singleton and ctl.route_id=r.id where x.configuration_digest=p_configuration_digest)))
  or r.provider not in('s3','cloudflare_r2') then raise exception 'paid_video_storage_route_unavailable';end if;
 perform sandbox_commerce_v1.assert_fresh(a);
 return jsonb_build_object('protocol','scpv-storage-route-v1','mode',case when r.provider='s3' then 's3' else 'r2-native-v1' end);
end $$;
alter function public.native_paid_video_r2_route_v1(uuid,uuid,uuid,text) owner to sbx_v1_core_owner;
revoke all on function public.native_paid_video_r2_route_v1(uuid,uuid,uuid,text) from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway,sbx_v1_r2_scanner;
grant execute on function public.native_paid_video_r2_route_v1(uuid,uuid,uuid,text) to service_role;
