-- Inactive additive profile, after all paid-video-v1 and test-store-v3 modules,
-- before permissions-finalize.sql. Frozen v1 implementation remains private.
-- No route, verifier secret, scanner, native profile or provider is provisioned.
set local role sbx_v1_core_owner;
create table sandbox_commerce_v1.paid_video_verifiers (
 id uuid primary key, hmac_key bytea not null check(octet_length(hmac_key)=32),
 evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'), active boolean not null default false
);
create table sandbox_commerce_v1.paid_video_gateway_controls (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false,
 route_id uuid references sandbox_commerce_v1.paid_video_routes,
 verifier_id uuid references sandbox_commerce_v1.paid_video_verifiers,
 worker_id uuid references sandbox_commerce_v1.paid_video_workers,
 qualification_sha256 text check(qualification_sha256 ~ '^[a-f0-9]{64}$'),
 check(not enabled or (route_id is not null and verifier_id is not null and worker_id is not null and qualification_sha256 is not null))
);
insert into sandbox_commerce_v1.paid_video_gateway_controls(singleton) values(true);
create table sandbox_commerce_v1.paid_video_object_receipts (
 upload_id uuid primary key references sandbox_commerce_v1.paid_video_uploads,
 transfer_id uuid not null unique references sandbox_commerce_v1.paid_video_transfers,
 verifier_id uuid not null references sandbox_commerce_v1.paid_video_verifiers,
 object_version text not null, observation_raw text not null, signature text not null,
 recorded_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.paid_video_gateway_requests (
 user_id uuid not null, request_id uuid not null, session_id uuid not null,
 configuration_digest text not null check(configuration_digest ~ '^[a-f0-9]{64}$'),
 command text not null, payload jsonb not null, primary key(user_id,request_id),
 foreign key(user_id,request_id) references sandbox_commerce_v1.paid_video_requests(user_id,request_id)
);
create table sandbox_commerce_v1.paid_video_gateway_transfers (
 transfer_id uuid primary key references sandbox_commerce_v1.paid_video_transfers,
 configuration_digest text not null check(configuration_digest ~ '^[a-f0-9]{64}$')
);
do $$ declare t text; begin
 foreach t in array array['paid_video_verifiers','paid_video_gateway_controls','paid_video_object_receipts','paid_video_gateway_requests','paid_video_gateway_transfers'] loop
  execute format('alter table sandbox_commerce_v1.%I enable row level security',t);
  execute format('alter table sandbox_commerce_v1.%I force row level security',t);
  execute format('create policy core_owner on sandbox_commerce_v1.%I for all to sbx_v1_core_owner using(true) with check(true)',t);
  execute format('revoke all on sandbox_commerce_v1.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
create trigger immutable before update or delete on sandbox_commerce_v1.paid_video_verifiers
 for each row execute function sandbox_commerce_v1.protect_resource_identity('active');
create trigger immutable before update or delete on sandbox_commerce_v1.paid_video_object_receipts
 for each row execute function sandbox_commerce_v1.protect_resource_identity();
create trigger immutable before update or delete on sandbox_commerce_v1.paid_video_gateway_requests
 for each row execute function sandbox_commerce_v1.protect_resource_identity();
create trigger immutable before update or delete on sandbox_commerce_v1.paid_video_gateway_transfers
 for each row execute function sandbox_commerce_v1.protect_resource_identity();

create function sandbox_commerce_v1.paid_video_gateway_ready(p_configuration text,p_route uuid default null)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
declare ctl sandbox_commerce_v1.paid_video_gateway_controls; native sandbox_commerce_v1.test_store_v3_native_profiles;
 conn sandbox_commerce_v1.test_store_v3_connections; checkout sandbox_commerce_v1.test_store_v3_controls;
begin
 perform 1 from sandbox_commerce_v1.lifecycle where singleton and state='active' for share nowait;
 if not found then return false; end if;
 select * into strict ctl from sandbox_commerce_v1.paid_video_gateway_controls where singleton for share nowait;
 select * into native from sandbox_commerce_v1.test_store_v3_native_profiles where configuration_digest=p_configuration and qualified for share nowait;
 if not found or not ctl.enabled or (p_route is not null and ctl.route_id<>p_route) then return false; end if;
 select * into strict conn from sandbox_commerce_v1.test_store_v3_connections where id=native.connection_id and revision=native.connection_revision for share nowait;
 select * into strict checkout from sandbox_commerce_v1.test_store_v3_controls where singleton for share nowait;
 if not conn.qualified or not checkout.ingress_enabled or not checkout.provisioning_enabled or not checkout.initiation_enabled
  or row(checkout.connection_id,checkout.connection_revision) is distinct from row(conn.id,conn.revision) then return false; end if;
 perform sandbox_commerce_v1.test_store_v3_scope_exclusive(conn.project_id);
 perform 1 from sandbox_commerce_v1.paid_video_routes where id=ctl.route_id and active and provider='s3' for share nowait;
 if not found then return false; end if;
 perform 1 from sandbox_commerce_v1.paid_video_workers where id=ctl.worker_id and active for share nowait;
 if not found then return false; end if;
 perform 1 from sandbox_commerce_v1.paid_video_verifiers v where v.id=ctl.verifier_id and v.active
  and not exists(select 1 from sandbox_commerce_v1.paid_video_workers w where w.hmac_key=v.hmac_key) for share of v nowait;
 return found;
end $$;

-- The only create lease is permanent. Unknown outcomes cannot create another
-- transfer or key after a timeout; recovery reads the exact original key.
create function sandbox_commerce_v1.paid_video_gateway_upload(p_action text,p_upload uuid,p_user uuid,p_session uuid,p_request uuid,p_transfer uuid,p_configuration text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare u sandbox_commerce_v1.paid_video_uploads; result jsonb; transfer uuid; configuration text;
begin
 perform sandbox_commerce_v1.assert_provider_service();
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=p_upload and creator_id=p_user for update nowait;
 if not sandbox_commerce_v1.paid_video_gateway_ready(p_configuration,u.route_id) then raise exception 'paid_video_gateway_unavailable'; end if;
 if p_action='issue' and exists(select 1 from sandbox_commerce_v1.paid_video_transfers where upload_id=u.id and request_id<>p_request)
 then raise exception 'paid_video_original_transfer_required'; end if;
 select id into transfer from sandbox_commerce_v1.paid_video_transfers where upload_id=u.id and user_id=p_user and request_id=p_request;
 if found then
  select configuration_digest into strict configuration from sandbox_commerce_v1.paid_video_gateway_transfers where transfer_id=transfer;
  if configuration<>p_configuration then raise exception 'paid_video_transfer_configuration_conflict'; end if;
 end if;
 result:=sandbox_commerce_v1.paid_video_upload_admit(p_action,p_upload,p_user,p_session,p_request,p_transfer);
 if transfer is null and result->>'state'='leased' then
  insert into sandbox_commerce_v1.paid_video_gateway_transfers values((result->>'transferId')::uuid,p_configuration);
 end if;
 return result;
end $$;

create function sandbox_commerce_v1.paid_video_probe_admit(p_upload uuid,p_user uuid,p_session uuid,p_request uuid,p_configuration text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare u sandbox_commerce_v1.paid_video_uploads; t sandbox_commerce_v1.paid_video_transfers;
 ctl sandbox_commerce_v1.paid_video_gateway_controls; route sandbox_commerce_v1.paid_video_routes; authority jsonb; deadline timestamptz;
 receipt sandbox_commerce_v1.paid_video_object_receipts;
 original_configuration text;
begin
 perform sandbox_commerce_v1.assert_provider_service(); perform sandbox_commerce_v1.assert_generation(false);
 authority:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=p_upload and creator_id=p_user for share nowait;
 select * into strict t from sandbox_commerce_v1.paid_video_transfers where upload_id=u.id and user_id=p_user and request_id=p_request;
 select configuration_digest into strict original_configuration from sandbox_commerce_v1.paid_video_gateway_transfers where transfer_id=t.id;
 select * into receipt from sandbox_commerce_v1.paid_video_object_receipts where upload_id=u.id and transfer_id=t.id;
 if found then
  perform sandbox_commerce_v1.assert_fresh(authority);
  return jsonb_build_object('protocol','scpv-object-receipt-v2','state','recorded','uploadId','scpv_upload_'||u.id,
   'userId',p_user,'originalSessionId',t.session_id,'originalConfigurationDigest',original_configuration,'requestId',t.request_id,'transferId',t.id,'incarnation',u.incarnation,'sha256',u.expected_sha256,'byteLength',u.expected_byte_length,
   'objectVersion',receipt.object_version);
 end if;
 perform sandbox_commerce_v1.assert_generation(true);
 authority:=sandbox_commerce_v1.assert_authority(p_user,p_session,'creator');
 if u.state<>'reserved' or u.expires_at<=clock_timestamp() or not sandbox_commerce_v1.paid_video_gateway_ready(p_configuration,u.route_id)
 then raise exception 'paid_video_probe_unavailable'; end if;
 select * into strict ctl from sandbox_commerce_v1.paid_video_gateway_controls where singleton;
 select * into strict route from sandbox_commerce_v1.paid_video_routes where id=u.route_id;
 deadline:=least(clock_timestamp()+interval '5 seconds',(authority->>'valid_until')::timestamptz,u.expires_at);
 perform sandbox_commerce_v1.assert_fresh(authority);
 return jsonb_build_object('protocol','scpv-probe-admission-v2','actor',jsonb_build_object('userId',p_user,'sessionGeneration',p_session),
  'uploadId','scpv_upload_'||u.id,'requestId',p_request,'transferId',t.id,'originalSessionId',t.session_id,
  'configurationDigest',p_configuration,'originalConfigurationDigest',original_configuration,'verifierId',ctl.verifier_id,'validUntilMs',floor(extract(epoch from deadline)*1000),
  'object',jsonb_build_object('provider','s3','bucket',route.bucket,'routeId',route.id,'objectKey',u.object_key,'incarnation',u.incarnation,
   'expectedSha256',u.expected_sha256,'expectedByteLength',u.expected_byte_length));
end $$;

create function sandbox_commerce_v1.paid_video_reconcile(p_raw text,p_signature text,p_user uuid,p_session uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare b jsonb; v sandbox_commerce_v1.paid_video_verifiers; u sandbox_commerce_v1.paid_video_uploads;
 t sandbox_commerce_v1.paid_video_transfers; existing sandbox_commerce_v1.paid_video_object_receipts; admission jsonb;
 original_configuration text;
begin
 perform sandbox_commerce_v1.assert_provider_service();
 if p_raw is null or octet_length(p_raw)>4096 then raise exception 'paid_video_probe_invalid'; end if;
 b:=p_raw::jsonb;
 if jsonb_typeof(b)<>'object' or not(b ?& array['protocol','userId','sessionId','uploadId','requestId','transferId','originalSessionId','configurationDigest','originalConfigurationDigest','verifierId','incarnation','sha256','byteLength','objectVersion','checkedAtMs','expiresAtMs'])
  or (b-array['protocol','userId','sessionId','uploadId','requestId','transferId','originalSessionId','configurationDigest','originalConfigurationDigest','verifierId','incarnation','sha256','byteLength','objectVersion','checkedAtMs','expiresAtMs'])<>'{}'::jsonb
  or b->>'protocol' is distinct from 'scpv-object-observation-v2' or b->>'userId' is distinct from p_user::text
  or b->>'sessionId' is distinct from p_session::text or jsonb_typeof(b->'objectVersion') is distinct from 'string'
  or coalesce(b->>'objectVersion','')='' or b->>'objectVersion'='null'
  or octet_length(convert_to(b->>'objectVersion','UTF8'))>1024
  or b->>'objectVersion' ~ U&'[\0001-\001F\007F]'
  or jsonb_typeof(b->'byteLength') is distinct from 'number' or jsonb_typeof(b->'checkedAtMs') is distinct from 'number'
  or jsonb_typeof(b->'expiresAtMs') is distinct from 'number'
 then raise exception 'paid_video_probe_invalid'; end if;
 select * into strict v from sandbox_commerce_v1.paid_video_verifiers where id=(b->>'verifierId')::uuid;
 if not sandbox_commerce_v1.paid_video_signature_matches(sandbox_commerce_v1.paid_video_hmac(v.hmac_key,p_raw),p_signature)
 then raise exception 'paid_video_probe_signature_invalid'; end if;
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=sandbox_commerce_v1.paid_video_id(b->>'uploadId') and creator_id=p_user for update nowait;
 select * into strict t from sandbox_commerce_v1.paid_video_transfers where id=(b->>'transferId')::uuid and upload_id=u.id and user_id=p_user;
 select configuration_digest into strict original_configuration from sandbox_commerce_v1.paid_video_gateway_transfers where transfer_id=t.id;
 if row(b->>'requestId',b->>'originalSessionId',b->>'incarnation',b->>'sha256',(b->>'byteLength')::bigint)
  is distinct from row(t.request_id::text,t.session_id::text,u.incarnation::text,u.expected_sha256,u.expected_byte_length::bigint)
  or b->>'originalConfigurationDigest' is distinct from original_configuration
 then raise exception 'paid_video_probe_binding_invalid'; end if;
 select * into existing from sandbox_commerce_v1.paid_video_object_receipts where upload_id=u.id;
 if found then
  perform sandbox_commerce_v1.assert_generation(false);
  perform sandbox_commerce_v1.assert_fresh(sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery'));
  if existing.observation_raw<>p_raw or existing.signature<>p_signature then raise exception 'paid_video_probe_receipt_conflict'; end if;
 else
  admission:=sandbox_commerce_v1.paid_video_probe_admit(u.id,p_user,p_session,t.request_id,b->>'configurationDigest');
  if admission->>'verifierId'<>v.id::text or not v.active
   or (b->>'checkedAtMs')::numeric>floor(extract(epoch from clock_timestamp())*1000)
   or (b->>'expiresAtMs')::numeric<=floor(extract(epoch from clock_timestamp())*1000)
   or (b->>'expiresAtMs')::numeric>(b->>'checkedAtMs')::numeric+30000
   or (b->>'checkedAtMs')::numeric<floor(extract(epoch from clock_timestamp())*1000)-30000
  then raise exception 'paid_video_probe_expired'; end if;
  insert into sandbox_commerce_v1.paid_video_object_receipts(upload_id,transfer_id,verifier_id,object_version,observation_raw,signature)
   values(u.id,t.id,v.id,b->>'objectVersion',p_raw,p_signature);
  update sandbox_commerce_v1.paid_video_uploads set object_version=b->>'objectVersion' where id=u.id;
 end if;
 return jsonb_build_object('protocol','scpv-object-receipt-v2','state','recorded','uploadId','scpv_upload_'||u.id,
  'userId',p_user,'originalSessionId',t.session_id,'originalConfigurationDigest',original_configuration,'requestId',t.request_id,'transferId',t.id,'incarnation',u.incarnation,'sha256',u.expected_sha256,'byteLength',u.expected_byte_length,
  'objectVersion',b->>'objectVersion');
end $$;

-- Reuse the immutable v1 command implementation, with additional prerequisites
-- and an explicitly different public response protocol. No old flags are changed.
create function sandbox_commerce_v1.paid_video_command_v2(p_command text,p_payload jsonb,p_user uuid,p_session uuid,p_configuration text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare result jsonb; u sandbox_commerce_v1.paid_video_uploads; ready boolean; transfer boolean; body jsonb; authority jsonb; creator boolean:=false;
 claims jsonb:=nullif(current_setting('request.jwt.claims',true),'')::jsonb; o sandbox_commerce_v1.offers;
 context sandbox_commerce_v1.paid_video_gateway_requests; mutation boolean; req uuid; transfer_descriptor jsonb;
begin
 if claims->>'role' is distinct from 'authenticated' or p_user is null or p_session is null
  or claims->>'sub' is distinct from p_user::text or claims->>'session_id' is distinct from p_session::text
 then raise exception 'paid_video_actor_binding_invalid' using errcode='42501'; end if;
 authority:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 if p_configuration is null or p_configuration !~ '^[a-f0-9]{64}$' then raise exception 'paid_video_configuration_invalid'; end if;
 mutation:=p_command in ('upload.reserve','upload.finalize','offer.publish','offer.retire');
 if mutation then
  req:=(p_payload->>'requestId')::uuid;
  if req is null then raise exception 'paid_video_request_invalid'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('isolated-paid-video-v1:'||p_user||':'||req,687))
  then raise exception 'paid_video_request_busy' using errcode='55P03'; end if;
  select * into context from sandbox_commerce_v1.paid_video_gateway_requests where user_id=p_user and request_id=req;
  if found then
   if row(context.session_id,context.configuration_digest,context.command,context.payload)
    is distinct from row(p_session,p_configuration,p_command,p_payload) then raise exception 'paid_video_v2_context_conflict'; end if;
  elsif exists(select 1 from sandbox_commerce_v1.paid_video_requests where user_id=p_user and request_id=req)
   then raise exception 'paid_video_v2_context_required';
  end if;
 end if;
 ready:=sandbox_commerce_v1.paid_video_gateway_ready(p_configuration);
 if p_command='upload.reserve' then
  if not ready or (select id from sandbox_commerce_v1.paid_video_routes where active order by id limit 1)
    is distinct from (select route_id from sandbox_commerce_v1.paid_video_gateway_controls where singleton)
  then raise exception 'paid_video_gateway_unavailable'; end if;
 elsif p_command in ('upload.finalize','offer.publish') then
  select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=sandbox_commerce_v1.paid_video_id(p_payload->>'uploadId') and creator_id=p_user for update nowait;
  if not ready or not sandbox_commerce_v1.paid_video_gateway_ready(p_configuration,u.route_id)
   or not exists(select 1 from sandbox_commerce_v1.paid_video_object_receipts r where r.upload_id=u.id and r.object_version=u.object_version)
  then raise exception 'paid_video_object_receipt_required'; end if;
 end if;
 result:=sandbox_commerce_v1.paid_video_command(p_command,p_payload,p_user,p_session);
 body:=result->'data';
 if mutation and result->>'status'='ok' and context.request_id is null then
  insert into sandbox_commerce_v1.paid_video_gateway_requests values(p_user,req,p_session,p_configuration,p_command,p_payload);
 end if;
 if p_command='upload.recover' and result->>'status'='ok' then
  select * into strict context from sandbox_commerce_v1.paid_video_gateway_requests
   where user_id=p_user and request_id=(p_payload->>'originalRequestId')::uuid;
  body:=jsonb_set(body,'{recovery}',(body->'recovery')||jsonb_build_object('originalConfigurationDigest',context.configuration_digest));
 end if;
 if p_command='resource.read' then
  select * into o from sandbox_commerce_v1.offers where resource_id=sandbox_commerce_v1.identifier(p_payload->>'resourceId','resource');
  if found then body:=body||jsonb_build_object('offer',sandbox_commerce_v1.paid_video_offer_json(o)); end if;
 end if;
 if p_command='capability.read' then
  body:=body||jsonb_build_object('uploadRouteAvailable',ready,'transferAvailable',ready and (body->>'creatorEligible')::boolean,
   'checkoutAvailable',ready);
 end if;
 if body ? 'upload' then
  select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=sandbox_commerce_v1.paid_video_id(body#>>'{upload,id}');
  if ready then
   begin
    perform sandbox_commerce_v1.assert_fresh(sandbox_commerce_v1.assert_authority(p_user,p_session,'creator')); creator:=true;
   exception when insufficient_privilege then creator:=false;
   end;
  end if;
  transfer:=ready and creator and u.creator_id=p_user and u.state='reserved' and u.expires_at>clock_timestamp()
   and sandbox_commerce_v1.paid_video_gateway_ready(p_configuration,u.route_id)
   and not exists(select 1 from sandbox_commerce_v1.paid_video_transfers where upload_id=u.id);
  body:=jsonb_set(body,'{upload}',(body->'upload')||jsonb_build_object('transferAvailable',transfer,'checkoutAvailable',false));
  if p_command='upload.read' then
   select jsonb_build_object('requestId',t.request_id,'originalSessionId',t.session_id,'configurationDigest',ct.configuration_digest)
    into transfer_descriptor from sandbox_commerce_v1.paid_video_transfers t
    join sandbox_commerce_v1.paid_video_gateway_transfers ct on ct.transfer_id=t.id where t.upload_id=u.id and t.user_id=p_user;
   if transfer_descriptor is null and exists(select 1 from sandbox_commerce_v1.paid_video_transfers where upload_id=u.id)
   then raise exception 'paid_video_v2_transfer_context_required'; end if;
   body:=body||jsonb_build_object('transfer',transfer_descriptor);
  end if;
 end if;
 if body ? 'offer' then
  body:=jsonb_set(body,'{offer}',(body->'offer')||jsonb_build_object('checkoutAvailable',ready and body#>>'{offer,status}'='published'
   and exists(select 1 from sandbox_commerce_v1.offers offer_row join sandbox_commerce_v1.test_store_v3_products p on p.catalog_id=offer_row.catalog_id
    join sandbox_commerce_v1.test_store_v3_native_profiles n on n.configuration_digest=p_configuration
    where offer_row.id=sandbox_commerce_v1.identifier(body#>>'{offer,id}','offer') and p.qualified
     and row(p.connection_id,p.connection_revision)=row(n.connection_id,n.connection_revision))));
 end if;
 -- Studio entries are status/history; transfer still requires upload.read and
 -- a fresh bounded gateway admission. They never advertise reusable authority.
 authority:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 perform sandbox_commerce_v1.assert_fresh(authority);
 return result||jsonb_build_object('protocol','isolated-paid-video-v2','configurationDigest',p_configuration,
  'capabilityExpiresAtMs',floor(extract(epoch from least(clock_timestamp()+interval '5 seconds',(authority->>'valid_until')::timestamptz))*1000),'data',body);
end $$;
create function sandbox_commerce_v1.paid_video_gateway_access_v2(p_user uuid,p_session uuid,p_resource uuid,p_grant uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare result jsonb; u sandbox_commerce_v1.paid_video_uploads; ctl sandbox_commerce_v1.paid_video_gateway_controls;
 asset sandbox_commerce_v1.delivery_assets;
begin
 result:=sandbox_commerce_v1.paid_video_current_access_v3(p_user,p_session,p_resource,p_grant);
 select * into strict ctl from sandbox_commerce_v1.paid_video_gateway_controls where singleton for share nowait;
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where resource_id=p_resource for share nowait;
 select * into strict asset from sandbox_commerce_v1.delivery_assets where id=u.asset_id and resource_id=p_resource for share nowait;
 if not ctl.enabled or ctl.route_id<>u.route_id or not exists(select 1 from sandbox_commerce_v1.paid_video_object_receipts r
  join sandbox_commerce_v1.paid_video_transfers t on t.id=r.transfer_id
  where r.upload_id=u.id and r.object_version=u.object_version and t.upload_id=u.id and t.user_id=u.creator_id
   and r.observation_raw::jsonb->>'incarnation'=u.incarnation::text and r.observation_raw::jsonb->>'sha256'=u.expected_sha256
   and (r.observation_raw::jsonb->>'byteLength')::bigint=u.expected_byte_length
   and result#>>'{object,objectVersion}'=r.object_version)
 then raise exception 'paid_video_current_object_receipt_required'; end if;
 return result||jsonb_build_object('protocol','scpv-current-access-gateway-v2','media',jsonb_build_object(
  'assetId','scv1_asset_'||asset.id,'incarnation',asset.incarnation,'sha256',asset.sha256,'byteLength',asset.byte_length,
  'resourceRevision',asset.resource_revision,'profile','scpv-mp4-h264-aac-v1'));
end $$;
revoke all on function sandbox_commerce_v1.paid_video_gateway_ready(text,uuid),
 sandbox_commerce_v1.paid_video_gateway_upload(text,uuid,uuid,uuid,uuid,uuid,text),
 sandbox_commerce_v1.paid_video_probe_admit(uuid,uuid,uuid,uuid,text),
 sandbox_commerce_v1.paid_video_reconcile(text,text,uuid,uuid),
 sandbox_commerce_v1.paid_video_command_v2(text,jsonb,uuid,uuid,text),
 sandbox_commerce_v1.paid_video_gateway_access_v2(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
-- The frozen generic graph is already private and has no public RPC. Reassert
-- that boundary for this combined fresh profile; preserve core-owner reuse for
-- other products and for protocol3's stricter current-access implementation.
revoke all on function sandbox_commerce_v1.authorize_resource_delivery(uuid,uuid,uuid,bigint,uuid,bigint,text)
 from public,anon,authenticated,service_role;
reset role;

create function public.isolated_paid_video_v2(p_command text,p_payload jsonb,p_expected_account_id uuid,p_expected_session_generation uuid,p_configuration_digest text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$ begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 return sandbox_commerce_v1.paid_video_command_v2(p_command,p_payload,p_expected_account_id,p_expected_session_generation,p_configuration_digest); end $$;
create function public.isolated_paid_video_upload_v2(p_action text,p_upload_id uuid,p_user_id uuid,p_session_id uuid,p_request_id uuid,p_transfer_id uuid,p_configuration_digest text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$ begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 return sandbox_commerce_v1.paid_video_gateway_upload(p_action,p_upload_id,p_user_id,p_session_id,p_request_id,p_transfer_id,p_configuration_digest); end $$;
create function public.isolated_paid_video_probe_v2(p_upload_id uuid,p_user_id uuid,p_session_id uuid,p_request_id uuid,p_configuration_digest text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$ begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 return sandbox_commerce_v1.paid_video_probe_admit(p_upload_id,p_user_id,p_session_id,p_request_id,p_configuration_digest); end $$;
create function public.isolated_paid_video_reconcile_v2(p_raw_body text,p_signature text,p_user_id uuid,p_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$ begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 return sandbox_commerce_v1.paid_video_reconcile(p_raw_body,p_signature,p_user_id,p_session_id); end $$;
create function public.isolated_paid_video_gateway_access_v2(p_user_id uuid,p_session_id uuid,p_resource_id uuid,p_grant_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$ begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 return sandbox_commerce_v1.paid_video_gateway_access_v2(p_user_id,p_session_id,p_resource_id,p_grant_id); end $$;
alter function public.isolated_paid_video_v2(text,jsonb,uuid,uuid,text) owner to sbx_v1_core_owner;
alter function public.isolated_paid_video_upload_v2(text,uuid,uuid,uuid,uuid,uuid,text) owner to sbx_v1_core_owner;
alter function public.isolated_paid_video_probe_v2(uuid,uuid,uuid,uuid,text) owner to sbx_v1_core_owner;
alter function public.isolated_paid_video_reconcile_v2(text,text,uuid,uuid) owner to sbx_v1_core_owner;
alter function public.isolated_paid_video_gateway_access_v2(uuid,uuid,uuid,uuid) owner to sbx_v1_core_owner;
revoke all on function public.isolated_paid_video_v1(text,jsonb,uuid,uuid),
 public.isolated_paid_video_upload_v1(text,uuid,uuid,uuid,uuid,uuid),
 public.isolated_paid_video_v2(text,jsonb,uuid,uuid,text),public.isolated_paid_video_upload_v2(text,uuid,uuid,uuid,uuid,uuid,text),
 public.isolated_paid_video_probe_v2(uuid,uuid,uuid,uuid,text),public.isolated_paid_video_reconcile_v2(text,text,uuid,uuid),
 public.isolated_paid_video_access_v3(uuid,uuid,uuid,uuid),public.isolated_paid_video_gateway_access_v2(uuid,uuid,uuid,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.isolated_paid_video_v2(text,jsonb,uuid,uuid,text) to authenticated;
grant execute on function public.isolated_paid_video_upload_v2(text,uuid,uuid,uuid,uuid,uuid,text),
 public.isolated_paid_video_probe_v2(uuid,uuid,uuid,uuid,text),public.isolated_paid_video_reconcile_v2(text,text,uuid,uuid),
 public.isolated_paid_video_gateway_access_v2(uuid,uuid,uuid,uuid) to service_role;
