-- Studio predecessor; all money and provider controls remain unchanged.
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.paid_video_gateway_ready(text,uuid)'::regprocedure) is distinct from 'b5580c7c47a11a89ca5d8440c36decec0083db34ef54a9d28a3dfacaf1c8bc84' then raise exception 'r2_predecessor_function_drift:paid_video_gateway_ready';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.paid_video_native_command(text,jsonb,uuid,uuid)'::regprocedure) is distinct from 'd021df5ade1099e190bc70bad2e1a6de40bb8c8128287d73df8f9d7ad79135fb' then raise exception 'r2_predecessor_function_drift:paid_video_native_command';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.paid_video_command_v2(text,jsonb,uuid,uuid,text)'::regprocedure) is distinct from '9b89ea4978563b1042ad4823fec4984c192a363b819d1ea6167457b439e568f3' then raise exception 'r2_predecessor_function_drift:paid_video_command_v2';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.clean_resource_asset(uuid,uuid,bigint,uuid,text)'::regprocedure) is distinct from 'a170b9599a336fc4026274361d22586134f81ccc7ab0a85a0f22efbb1651a448' then raise exception 'r2_predecessor_function_drift:clean_resource_asset';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.native_store_quote_command_armed(uuid,uuid,text,uuid,jsonb)'::regprocedure) is distinct from 'd9fc3c605cbb0034f892014cf6b277501a687aae3906ca169ac567b8ef3f0006' then raise exception 'r2_predecessor_function_drift:native_store_quote_command_armed';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.native_store_apply_effect_pre_play_handoff(uuid,uuid,uuid,bigint,jsonb)'::regprocedure) is distinct from 'c8a02d7e8038b488ef1d7c9e86f109adb16838f0c6edebbfa4ce8147a9f74e39' then raise exception 'r2_predecessor_function_drift:native_store_apply_effect_pre_play_handoff';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.native_store_play_apply_effect(uuid,uuid,uuid,bigint,jsonb)'::regprocedure) is distinct from 'f0c1787021d744bb1aa088c133efdaf3671c268774a85d810dc5182d20ab495b' then raise exception 'r2_predecessor_function_drift:native_store_play_apply_effect';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.native_store_paid_video_access(uuid,uuid,uuid,uuid)'::regprocedure) is distinct from '90d62544e634ced0a777611f9bd05ae56a9b4f5df10ae71ecc508b109b814f8e' then raise exception 'r2_predecessor_function_drift:native_store_paid_video_access';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.paid_video_review_snapshot(uuid)'::regprocedure) is distinct from 'dd5437954e87fb3a510dec602c004443bf3f887a5bddeea5dc4c103f4d4ff330' then raise exception 'r2_predecessor_function_drift:paid_video_review_snapshot';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.paid_video_review(text,text)'::regprocedure) is distinct from '9ff49cde24ed835bc0801e771ad89993ee9e2738c940921eb72bbca47535606c' then raise exception 'r2_predecessor_function_drift:paid_video_review';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.native_store_apply_effect(uuid,uuid,uuid,bigint,jsonb)'::regprocedure) is distinct from '555264ae01c5e07a56d772b0f41b04cfd4c8327ce5a1ad3e55e125aa54feab88' then raise exception 'r2_predecessor_function_drift:native_store_apply_effect';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.native_store_assert_current_allocation(uuid,uuid)'::regprocedure) is distinct from '2c370f63c15c503f3f7a5fe9c94e1f1f4e7a0e7b1470e2827518e0c201a3a823' then raise exception 'r2_predecessor_function_drift:native_store_assert_current_allocation';end if;end $guard$;
do $guard$ begin if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='sandbox_commerce_v1.native_store_settlement_protocol(uuid,bigint)'::regprocedure) is distinct from '44fdfd7860638e6e2ca861708277eb39a289ff339fa025bfcb4fab6bdfd890d3' then raise exception 'r2_predecessor_function_drift:native_store_settlement_protocol';end if;end $guard$;
-- Forward-only typed R2 extension. Source/local proof only. No seeds, activation,
-- credentials, provider installation, or changes to frozen predecessor sources.
create role sbx_v1_r2_gateway nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
create role sbx_v1_r2_scanner nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
set local role sbx_v1_core_owner;
create function sandbox_commerce_v1.r2_identity_valid(v jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='object' and v ?& array['kind','nativeVersion','etag']
  and (v-array['kind','nativeVersion','etag'])='{}'::jsonb and v->>'kind'='r2-native-upload-v1'
  and jsonb_typeof(v->'nativeVersion')='string' and v->>'nativeVersion' ~ '^[!-~]+$' and octet_length(v->>'nativeVersion') between 1 and 1024
  and jsonb_typeof(v->'etag')='string' and v->>'etag' ~ '^[a-f0-9]{32}(-[1-9][0-9]*)?$',false)
$$;
alter table sandbox_commerce_v1.paid_video_uploads add column r2_identity jsonb
 check(r2_identity is null or (object_version is null and sandbox_commerce_v1.r2_identity_valid(r2_identity)));
alter table sandbox_commerce_v1.delivery_assets alter column object_version drop not null;
alter table sandbox_commerce_v1.delivery_assets add column r2_identity jsonb;
alter table sandbox_commerce_v1.delivery_assets add constraint typed_object_identity check(
 (provider='cloudflare_r2' and object_version is null and sandbox_commerce_v1.r2_identity_valid(r2_identity))
 or (provider<>'cloudflare_r2' and object_version is not null and r2_identity is null));
create unique index delivery_assets_r2_identity on sandbox_commerce_v1.delivery_assets(provider,bucket,object_key,(r2_identity->>'nativeVersion')) where provider='cloudflare_r2';
alter table sandbox_commerce_v1.delivery_asset_scans alter column object_version drop not null;
alter table sandbox_commerce_v1.delivery_asset_scans add column r2_identity jsonb;
alter table sandbox_commerce_v1.delivery_asset_scans add constraint typed_object_identity check(
 (provider='cloudflare_r2' and object_version is null and sandbox_commerce_v1.r2_identity_valid(r2_identity))
 or (provider<>'cloudflare_r2' and object_version is not null and r2_identity is null));

create table sandbox_commerce_v1.r2_profiles(
 id uuid primary key, configuration_digest text not null unique
 check(configuration_digest='8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0'),
 route_id uuid not null unique references sandbox_commerce_v1.paid_video_routes,
 worker_id uuid not null references sandbox_commerce_v1.paid_video_workers,
 verifier_id uuid not null references sandbox_commerce_v1.paid_video_verifiers,
 key_id uuid not null unique, gateway_key bytea not null check(octet_length(gateway_key)=32),
 qualification_sha256 text not null check(qualification_sha256 ~ '^[a-f0-9]{64}$'),
 capacity_evidence_sha256 text not null check(capacity_evidence_sha256 ~ '^[a-f0-9]{64}$'),
 qualified_max_bytes integer not null check(qualified_max_bytes=16777216),
 enabled boolean not null default false
);
create table sandbox_commerce_v1.r2_bindings(
 id uuid primary key, profile_id uuid not null references sandbox_commerce_v1.r2_profiles,
 upload_id uuid not null references sandbox_commerce_v1.paid_video_uploads,
 request_id uuid not null, user_id uuid, session_id uuid, grant_id uuid,
 operation text not null check(operation in ('upload','probe','scan','range')),
 token jsonb not null, issued_at timestamptz not null, expires_at timestamptz not null,
 check(expires_at>issued_at and expires_at<=issued_at+interval '5 seconds')
);
create unique index r2_one_upload_binding on sandbox_commerce_v1.r2_bindings(upload_id) where operation='upload';
-- INSERT claim is the durable irreversible dispatch boundary. No UPDATE retry
-- can turn started, unknown, or conflicting writes into an admitted upload.
create table sandbox_commerce_v1.r2_dispatches(
 upload_id uuid primary key references sandbox_commerce_v1.paid_video_uploads,
 binding_id uuid not null unique references sandbox_commerce_v1.r2_bindings,
 started_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.r2_commits(
 upload_id uuid primary key references sandbox_commerce_v1.r2_dispatches,
 state text not null check(state in ('acknowledged','unknown','exists_unverified')),
 identity jsonb, committed_at timestamptz not null default clock_timestamp(),
 check((state='acknowledged' and sandbox_commerce_v1.r2_identity_valid(identity)) or (state<>'acknowledged' and identity is null))
);
create table sandbox_commerce_v1.r2_receipts(
 upload_id uuid primary key references sandbox_commerce_v1.r2_commits,
 binding_id uuid not null references sandbox_commerce_v1.r2_bindings,
 verifier_id uuid not null references sandbox_commerce_v1.paid_video_verifiers,
 identity jsonb not null check(sandbox_commerce_v1.r2_identity_valid(identity)),
 raw_body text not null check(octet_length(raw_body)<=16384), signature text not null,
 recorded_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.r2_tickets(
 ticket_id uuid primary key references sandbox_commerce_v1.paid_video_tickets,
 profile_id uuid not null references sandbox_commerce_v1.r2_profiles,
 object jsonb not null
);
do $$ declare t text; begin
 foreach t in array array['r2_profiles','r2_bindings','r2_dispatches','r2_commits','r2_receipts','r2_tickets'] loop
  execute format('alter table sandbox_commerce_v1.%I enable row level security',t);
  execute format('alter table sandbox_commerce_v1.%I force row level security',t);
  execute format('create policy core_owner on sandbox_commerce_v1.%I for all to sbx_v1_core_owner using(true) with check(true)',t);
  execute format('revoke all on sandbox_commerce_v1.%I from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway',t);
  execute format('create trigger immutable before update or delete on sandbox_commerce_v1.%I for each row execute function sandbox_commerce_v1.protect_resource_identity(%s)',t,case when t='r2_profiles' then '''enabled''' else '' end);
  execute format('create trigger immutable_truncate before truncate on sandbox_commerce_v1.%I for each statement execute function sandbox_commerce_v1.native_store_quote_immutable()',t);
 end loop;
end $$;
-- Profile provider and key separation are checked both on provisioning and on
-- every use. A later worker/verifier key insertion cannot silently weaken it.
create function sandbox_commerce_v1.r2_ready(p_configuration text,p_route uuid default null) returns boolean
language plpgsql volatile set search_path='' as $$
declare p sandbox_commerce_v1.r2_profiles;
begin
 perform sandbox_commerce_v1.assert_generation(true);
 select * into p from sandbox_commerce_v1.r2_profiles where configuration_digest=p_configuration and enabled for share nowait;
 if not found or (p_route is not null and p.route_id<>p_route)
  or exists(select 1 from sandbox_commerce_v1.test_store_v3_native_profiles where configuration_digest=p_configuration)
 then return false; end if;
 perform 1 from sandbox_commerce_v1.paid_video_routes where id=p.route_id and active and provider='cloudflare_r2'
  and bucket ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' for share nowait;
 if not found then return false; end if;
 lock table sandbox_commerce_v1.paid_video_workers,sandbox_commerce_v1.paid_video_verifiers in share mode nowait;
 perform 1 from sandbox_commerce_v1.paid_video_workers w join sandbox_commerce_v1.paid_video_verifiers v on v.id=p.verifier_id
  where w.id=p.worker_id and w.active and v.active and w.hmac_key<>v.hmac_key and w.hmac_key<>p.gateway_key and v.hmac_key<>p.gateway_key
  and not exists(select 1 from sandbox_commerce_v1.paid_video_workers x where x.hmac_key in(v.hmac_key,p.gateway_key))
  and not exists(select 1 from sandbox_commerce_v1.paid_video_verifiers x where x.hmac_key=p.gateway_key);
 return found;
end $$;
create function sandbox_commerce_v1.r2_object(p_upload uuid,p_identity boolean default true) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('provider','cloudflare_r2','bucket',r.bucket,'routeId',r.id,'objectKey',u.object_key,
  'incarnation',u.incarnation,'expectedSha256',u.expected_sha256,'expectedByteLength',u.expected_byte_length)
  ||case when p_identity then jsonb_build_object('identity',c.identity) else '{}'::jsonb end
 from sandbox_commerce_v1.paid_video_uploads u join sandbox_commerce_v1.paid_video_routes r on r.id=u.route_id and r.provider='cloudflare_r2'
 left join sandbox_commerce_v1.r2_commits c on c.upload_id=u.id and c.state='acknowledged' where u.id=p_upload
$$;
create function sandbox_commerce_v1.r2_upload_identity_guard() returns trigger language plpgsql set search_path='' as $$
declare provider text; begin
 select r.provider into strict provider from sandbox_commerce_v1.paid_video_routes r where r.id=new.route_id;
 if (provider='cloudflare_r2' and new.object_version is not null) or (provider<>'cloudflare_r2' and new.r2_identity is not null)
  or (tg_op='UPDATE' and old.r2_identity is not null and old.r2_identity is distinct from new.r2_identity)
 then raise exception 'paid_video_typed_identity_required'; end if;
 if new.r2_identity is not null and not exists(select 1 from sandbox_commerce_v1.r2_receipts r where r.upload_id=new.id and r.identity=new.r2_identity)
 then raise exception 'paid_video_r2_receipt_required'; end if;
 return new;
end $$;
drop trigger identity_immutable on sandbox_commerce_v1.paid_video_uploads;
create trigger identity_immutable before update or delete on sandbox_commerce_v1.paid_video_uploads for each row
 execute function sandbox_commerce_v1.protect_resource_identity('state','object_version','r2_identity','clean_result_sha256','daily_definitions_at','moderation');
create trigger typed_identity before insert or update on sandbox_commerce_v1.paid_video_uploads for each row execute function sandbox_commerce_v1.r2_upload_identity_guard();
revoke all on function sandbox_commerce_v1.r2_identity_valid(jsonb),sandbox_commerce_v1.r2_ready(text,uuid),sandbox_commerce_v1.r2_object(uuid,boolean),sandbox_commerce_v1.r2_upload_identity_guard()
 from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway;
reset role;

set local role sbx_v1_core_owner;
create function sandbox_commerce_v1.native_r2_assert_media(i sandbox_commerce_v1.intents)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare v sandbox_commerce_v1.video_terms; asset sandbox_commerce_v1.delivery_assets;
 upload sandbox_commerce_v1.paid_video_uploads; route sandbox_commerce_v1.paid_video_routes;
 version sandbox_commerce_v1.resource_versions;
begin
 select * into strict version from sandbox_commerce_v1.resource_versions where resource_id=i.resource_id and revision=i.resource_revision for share nowait;
 select * into strict v from sandbox_commerce_v1.video_terms where resource_id=i.resource_id and revision=i.resource_revision for share nowait;
 asset:=sandbox_commerce_v1.clean_resource_asset(v.asset_id,i.resource_id,i.resource_revision,i.creator_id,'video');
 select * into strict upload from sandbox_commerce_v1.paid_video_uploads where resource_id=i.resource_id and asset_id=asset.id for share nowait;
 select * into strict route from sandbox_commerce_v1.paid_video_routes where id=upload.route_id for share nowait;
 if row(version.kind,version.creator_id,version.price_minor,version.currency) is distinct from row(i.kind,i.creator_id,i.amount_minor,i.currency)
  or i.kind<>'paid_content' or v.audience<>'paid' or upload.state<>'clean' or upload.moderation<>'clear'
  or not route.active or route.provider<>'cloudflare_r2'
  or not sandbox_commerce_v1.r2_ready('8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0',route.id)
  or not exists(select 1 from sandbox_commerce_v1.r2_receipts rr where rr.upload_id=upload.id and rr.identity=upload.r2_identity)
  or row(route.provider,route.bucket,upload.object_key,upload.object_version,upload.r2_identity,upload.incarnation,upload.expected_sha256,upload.expected_byte_length)
   is distinct from row(asset.provider,asset.bucket,asset.object_key,asset.object_version,asset.r2_identity,asset.incarnation,asset.sha256,asset.byte_length)
 then raise exception 'test_store_v3_current_media_required'; end if;
end; $$;
create function sandbox_commerce_v1.native_typed_assert_media(i sandbox_commerce_v1.intents) returns void language plpgsql volatile set search_path='' as $$begin
 if exists(select 1 from sandbox_commerce_v1.paid_video_uploads u join sandbox_commerce_v1.paid_video_routes r on r.id=u.route_id where u.resource_id=i.resource_id and r.provider='cloudflare_r2')
 then perform sandbox_commerce_v1.native_r2_assert_media(i);else perform sandbox_commerce_v1.test_store_v3_assert_media(i);end if;end $$;
create function sandbox_commerce_v1.native_store_paid_video_r2_access(p_user uuid,p_session uuid,p_resource uuid,p_grant uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare g sandbox_commerce_v1.resource_grants;r sandbox_commerce_v1.receipts;i sandbox_commerce_v1.intents;
 asset sandbox_commerce_v1.delivery_assets;video sandbox_commerce_v1.video_terms;
 upload sandbox_commerce_v1.paid_video_uploads;route sandbox_commerce_v1.paid_video_routes;
 ctl sandbox_commerce_v1.r2_profiles;authority jsonb;evidence jsonb;delivery jsonb;deadline timestamptz;
begin
 perform sandbox_commerce_v1.assert_generation(true);
 if p_user is null or p_session is null or p_resource is null or p_grant is null then raise exception 'native_video_binding_required';end if;
 authority:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 -- Same generic hold/grant graph as existing private delivery. NOWAIT prevents
 -- acknowledging access while intake or negative application changes it.
 lock table sandbox_commerce_v1.resource_grants,sandbox_commerce_v1.resource_delivery_holds in share mode nowait;
 select * into strict g from sandbox_commerce_v1.resource_grants where id=p_grant and buyer_id=p_user and product_id=p_resource for share nowait;
 select * into strict r from sandbox_commerce_v1.receipts where id=g.receipt_id for share nowait;
 select * into strict i from sandbox_commerce_v1.intents where id=r.intent_id for share nowait;
 if i.kind<>'paid_content' or i.state<>'verified' or r.state<>'verified' or g.revoked_at is not null
  or i.provider<>'revenuecat' or i.store not in('APP_STORE','PLAY_STORE') or i.currency<>'usd' or i.buyer_id<>p_user
  or row(g.product_id,g.product_revision) is distinct from row(i.resource_id,i.resource_revision)
  or row(r.provider,r.scope_key,r.store,r.product_id) is distinct from row(i.provider,i.scope_key,i.store,i.product_id)
 then raise exception 'native_video_exact_receipt_required';end if;
 -- This owner-private helper re-reads allocation, original journal/effect and
 -- mapping/dispatch/connection revocations under the common project lock. A
 -- generic verified receipt or caller-supplied boolean is never sufficient.
 evidence:=sandbox_commerce_v1.native_store_assert_current_allocation(r.id,p_user);
 if evidence->>'allocationId' is null or evidence->>'projectId' is null
  or evidence->>'originalTransactionId' is distinct from r.original_transaction_id
 then raise exception 'native_video_current_allocation_required';end if;
 if (sandbox_commerce_v1.current_resource_grant(p_user,p_resource,g.product_revision)).id is distinct from g.id
 then raise exception 'native_video_exact_current_grant_required';end if;
 delivery:=sandbox_commerce_v1.authorize_resource_delivery(p_user,p_session,p_resource,g.product_revision,p_resource,g.product_revision,'play_video');
 if delivery->>'issuer' is distinct from 'media_signer' or delivery->>'eligibleForIssuer' is distinct from 'true'
 then raise exception 'native_video_media_authority_required';end if;
 select * into strict video from sandbox_commerce_v1.video_terms where resource_id=p_resource and revision=g.product_revision;
 asset:=sandbox_commerce_v1.clean_resource_asset(video.asset_id,p_resource,g.product_revision,i.creator_id,'video');
 select * into strict upload from sandbox_commerce_v1.paid_video_uploads where resource_id=p_resource and asset_id=asset.id for share nowait;
 select * into strict route from sandbox_commerce_v1.paid_video_routes where id=upload.route_id for share nowait;
 select * into strict ctl from sandbox_commerce_v1.r2_profiles where route_id=route.id for share nowait;
 if not sandbox_commerce_v1.r2_ready(ctl.configuration_digest,route.id) then raise exception 'native_video_r2_profile_unavailable';end if;
 perform 1 from sandbox_commerce_v1.paid_video_workers where id=ctl.worker_id and active for share nowait;
 if not found then raise exception 'native_video_worker_unavailable';end if;
 perform 1 from sandbox_commerce_v1.paid_video_verifiers v where v.id=ctl.verifier_id and v.active
  and not exists(select 1 from sandbox_commerce_v1.paid_video_workers w where w.hmac_key=v.hmac_key) for share of v nowait;
 if not found then raise exception 'native_video_verifier_unavailable';end if;
 if not ctl.enabled or ctl.route_id is distinct from route.id or not route.active or route.provider<>'cloudflare_r2' or upload.state<>'clean' or upload.moderation<>'clear'
  or row(route.provider,route.bucket,upload.object_key,upload.object_version,upload.r2_identity,upload.incarnation,upload.expected_sha256,upload.expected_byte_length)
   is distinct from row(asset.provider,asset.bucket,asset.object_key,asset.object_version,asset.r2_identity,asset.incarnation,asset.sha256,asset.byte_length)
  or not exists(select 1 from sandbox_commerce_v1.r2_receipts rr join sandbox_commerce_v1.r2_commits c on c.upload_id=rr.upload_id
    where rr.upload_id=upload.id and rr.verifier_id=ctl.verifier_id and rr.identity=upload.r2_identity and c.state='acknowledged' and c.identity=rr.identity)
 then raise exception 'native_video_current_object_required';end if;
 deadline:=least(transaction_timestamp()+interval '5 seconds',(authority->>'valid_until')::timestamptz,to_timestamp((delivery#>>'{binding,expiresAtMs}')::numeric/1000));
 perform sandbox_commerce_v1.assert_fresh(authority);
 if deadline is null or not isfinite(deadline) or clock_timestamp()>=deadline then raise exception 'native_video_access_expired';end if;
 return jsonb_build_object('protocol','nssv1-current-access-gateway-r2-v1','actor',jsonb_build_object('userId',p_user,'sessionGeneration',p_session),
  'resourceId','scv1_resource_'||p_resource,'grantId','scv1_grant_'||g.id,'receiptId','scv1_receipt_'||r.id,
  'originalTransactionId',r.original_transaction_id,'allocationId',evidence->>'allocationId','projectId',evidence->>'projectId',
  'validUntilMs',floor(extract(epoch from deadline)*1000),
  'object',jsonb_build_object('provider',asset.provider,'bucket',asset.bucket,'routeId',route.id,'objectKey',asset.object_key,'incarnation',asset.incarnation,'expectedSha256',asset.sha256,'expectedByteLength',asset.byte_length,'identity',asset.r2_identity),
  'media',jsonb_build_object('assetId','scv1_asset_'||asset.id,'incarnation',asset.incarnation,'sha256',asset.sha256,'byteLength',asset.byte_length,'resourceRevision',asset.resource_revision,'profile','scpv-mp4-h264-aac-v1'));
end $$;
create function sandbox_commerce_v1.r2_scan_ingest(p_raw_body text,p_signature text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare body jsonb; result jsonb; media jsonb; t sandbox_commerce_v1.paid_video_tickets;
 u sandbox_commerce_v1.paid_video_uploads; w sandbox_commerce_v1.paid_video_workers;
 hash text; is_clean boolean; daily_at timestamptz; checked_at timestamptz; authority jsonb;
begin
 if p_raw_body is null or octet_length(p_raw_body)>16384 then raise exception 'paid_video_result_invalid'; end if;
 body:=p_raw_body::jsonb; result:=body->'result'; media:=result->'media';
 if body->>'protocol' is distinct from 'scpv-worker-result-r2-v1' or jsonb_typeof(body)<>'object'
  or not(body ?& array['protocol','ticketId','uploadId','workerId','qualificationSha256','object','result'])
  or (body-array['protocol','ticketId','uploadId','workerId','qualificationSha256','object','result'])<>'{}'::jsonb
  or result->>'protocol' is distinct from 'scpv-byte-scan-v1' or result->>'profile' is distinct from 'scpv-mp4-h264-aac-v1'
  or result->>'moderation' is distinct from 'unreviewed' or result->>'verdict' not in('clean','rejected') or result->>'verdict' is null
 then raise exception 'paid_video_r2_result_invalid'; end if;
 -- Lifecycle shared fence also covers retired negative/replay reconciliation.
 perform sandbox_commerce_v1.assert_generation(false);
 select * into strict t from sandbox_commerce_v1.paid_video_tickets where id=(body->>'ticketId')::uuid for update nowait;
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=t.upload_id for update nowait;
 select * into strict w from sandbox_commerce_v1.paid_video_workers where id=t.worker_id for share nowait;
 if not sandbox_commerce_v1.paid_video_signature_matches(sandbox_commerce_v1.paid_video_hmac(w.hmac_key,p_raw_body),p_signature)
  then raise exception 'paid_video_worker_signature_invalid' using errcode='42501'; end if;
 if body->>'uploadId' is distinct from 'scpv_upload_'||u.id or body->>'workerId' is distinct from w.id::text
  or not exists(select 1 from sandbox_commerce_v1.r2_tickets rt join sandbox_commerce_v1.r2_profiles p on p.id=rt.profile_id
   where rt.ticket_id=t.id and rt.object=body->'object' and p.worker_id=w.id and p.qualification_sha256=body->>'qualificationSha256')
  or body->'object' is distinct from sandbox_commerce_v1.r2_object(u.id)
  or not exists(select 1 from sandbox_commerce_v1.r2_receipts rr where rr.upload_id=u.id and rr.identity=body#>'{object,identity}')
  or result->>'sha256' is distinct from u.expected_sha256
  or jsonb_typeof(result->'byteLength') is distinct from 'number' or (result->>'byteLength')::bigint<>u.expected_byte_length
 then raise exception 'paid_video_result_binding_invalid'; end if;
 hash:=encode(sha256(convert_to(p_raw_body,'UTF8')),'hex');
 if exists(select 1 from sandbox_commerce_v1.paid_video_scan_results where sha256=hash)
  then return jsonb_build_object('accepted',true,'upload',sandbox_commerce_v1.paid_video_upload_json(u)); end if;
 is_clean:=result->>'verdict'='clean';
 if is_clean then
  perform sandbox_commerce_v1.assert_generation(true);
  if not sandbox_commerce_v1.r2_ready('8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0',u.route_id) then raise exception 'paid_video_r2_profile_unavailable';end if;
  authority:=sandbox_commerce_v1.assert_authority(u.creator_id,null,'creator_subject');
  perform 1 from sandbox_commerce_v1.paid_video_routes where id=u.route_id and active for share nowait;
  if not found or not w.active or t.positive_consumed_at is not null or t.expires_at<=clock_timestamp()
   or u.state<>'scan_pending' or u.expires_at<=clock_timestamp() then raise exception 'paid_video_positive_stale'; end if;
  checked_at:=(result->>'checkedAt')::timestamptz;
  select (f->>'createdAt')::timestamptz into strict daily_at from jsonb_array_elements(result#>'{definitions,files}') f where f->>'filename'='daily.cvd';
  if not isfinite(checked_at) or checked_at<t.issued_at-interval '5 seconds' or checked_at>clock_timestamp()+interval '5 seconds'
   or not isfinite(daily_at) or daily_at<clock_timestamp()-interval '48 hours' or daily_at>clock_timestamp()+interval '5 minutes'
   or coalesce(result#>>'{definitions,manifestSha256}','') !~ '^[a-f0-9]{64}$'
   or result->>'reason' is distinct from 'exact_bytes_scanned' or media->>'videoCodec' is distinct from 'h264'
   or media->>'pixelFormat' is distinct from 'yuv420p' or (media->>'durationMs')::integer not between 1 and 60000
   or (media->>'width')::integer not between 1 and 1920 or (media->>'height')::integer not between 1 and 1080
   or (media->>'framesPerSecond')::numeric<=0 or (media->>'framesPerSecond')::numeric>60
   or (media->>'audioCodec' is not null and media->>'audioCodec'<>'aac')
   or media is null or media='null'::jsonb or not(media ?& array['durationMs','width','height','framesPerSecond','videoCodec','pixelFormat','audioCodec'])
   or jsonb_typeof(media->'durationMs') is distinct from 'number' or jsonb_typeof(media->'width') is distinct from 'number'
   or jsonb_typeof(media->'height') is distinct from 'number' or jsonb_typeof(media->'framesPerSecond') is distinct from 'number'
  then raise exception 'paid_video_scan_evidence_invalid'; end if;
  update sandbox_commerce_v1.paid_video_uploads set state='clean',
   clean_result_sha256=hash,daily_definitions_at=daily_at where id=u.id returning * into u;
  update sandbox_commerce_v1.paid_video_tickets set positive_consumed_at=clock_timestamp() where id=t.id;
 else
  -- Authenticated late negatives are monotonic, including after lease/lifecycle
  -- retirement or key deactivation. They never create positive authority.
  update sandbox_commerce_v1.paid_video_uploads set state='rejected',moderation='removed' where id=u.id returning * into u;
  update sandbox_commerce_v1.resources set status='quarantined' where id=u.resource_id;
  update sandbox_commerce_v1.offers set status='retired' where resource_id=u.resource_id;
  update sandbox_commerce_v1.delivery_assets set moderation='removed' where id=u.asset_id;
 end if;
 insert into sandbox_commerce_v1.paid_video_scan_results values(hash,t.id,p_raw_body,p_signature,is_clean,clock_timestamp());
 if is_clean then perform sandbox_commerce_v1.assert_fresh(authority); end if;
 return jsonb_build_object('accepted',true,'upload',sandbox_commerce_v1.paid_video_upload_json(u));
end $$;
create or replace function sandbox_commerce_v1.paid_video_gateway_ready(p_configuration text,p_route uuid default null)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
declare ctl sandbox_commerce_v1.paid_video_gateway_controls; native sandbox_commerce_v1.test_store_v3_native_profiles;
 profile sandbox_commerce_v1.paid_video_native_authoring_profiles;
 conn sandbox_commerce_v1.test_store_v3_connections; checkout sandbox_commerce_v1.test_store_v3_controls;
begin
 if exists(select 1 from sandbox_commerce_v1.r2_profiles where configuration_digest=p_configuration and (route_id=p_route or (p_route is null and enabled)))
 then return sandbox_commerce_v1.r2_ready(p_configuration,p_route); end if;
 perform 1 from sandbox_commerce_v1.lifecycle where singleton and state='active' for share nowait;
 if not found then return false; end if;
 select * into strict ctl from sandbox_commerce_v1.paid_video_gateway_controls where singleton for share nowait;
 if p_configuration='8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0' then
  lock table sandbox_commerce_v1.test_store_v3_native_profiles in share mode nowait;
  if exists(select 1 from sandbox_commerce_v1.test_store_v3_native_profiles where configuration_digest=p_configuration) then return false; end if;
  select * into profile from sandbox_commerce_v1.paid_video_native_authoring_profiles where configuration_digest=p_configuration and enabled for share nowait;
  if not found or not ctl.enabled or (p_route is not null and ctl.route_id<>p_route)
   or row(profile.route_id,profile.worker_id,profile.verifier_id,profile.qualification_sha256)
    is distinct from row(ctl.route_id,ctl.worker_id,ctl.verifier_id,ctl.qualification_sha256) then return false; end if;
 else
 select * into native from sandbox_commerce_v1.test_store_v3_native_profiles where configuration_digest=p_configuration and qualified for share nowait;
 if not found or not ctl.enabled or (p_route is not null and ctl.route_id<>p_route) then return false; end if;
 select * into strict conn from sandbox_commerce_v1.test_store_v3_connections where id=native.connection_id and revision=native.connection_revision for share nowait;
 select * into strict checkout from sandbox_commerce_v1.test_store_v3_controls where singleton for share nowait;
 if not conn.qualified or not checkout.ingress_enabled or not checkout.provisioning_enabled or not checkout.initiation_enabled
  or row(checkout.connection_id,checkout.connection_revision) is distinct from row(conn.id,conn.revision) then return false; end if;
 perform sandbox_commerce_v1.test_store_v3_scope_exclusive(conn.project_id);
 end if;
 perform 1 from sandbox_commerce_v1.paid_video_routes where id=ctl.route_id and active and provider='s3' for share nowait;
 if not found then return false; end if;
 perform 1 from sandbox_commerce_v1.paid_video_workers where id=ctl.worker_id and active for share nowait;
 if not found then return false; end if;
 perform 1 from sandbox_commerce_v1.paid_video_verifiers v where v.id=ctl.verifier_id and v.active
  and not exists(select 1 from sandbox_commerce_v1.paid_video_workers w where w.hmac_key=v.hmac_key) for share of v nowait;
 return found;
end $$;
create or replace function sandbox_commerce_v1.paid_video_native_command(p_command text,p_payload jsonb,p_expected_account_id uuid,p_expected_session_generation uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare claims jsonb:=nullif(current_setting('request.jwt.claims',true),'')::jsonb; uid uuid; sid uuid; req uuid;
 allowed text[]; authority jsonb; creator_authority jsonb; prior sandbox_commerce_v1.paid_video_requests;
 u sandbox_commerce_v1.paid_video_uploads; r sandbox_commerce_v1.resources; route sandbox_commerce_v1.paid_video_routes;
 o sandbox_commerce_v1.offers; c sandbox_commerce_v1.catalog; result jsonb; body jsonb; state text:='ok';
 upload uuid; rid uuid; asset uuid; incarnation uuid; page jsonb; next_cursor text; cursor_row sandbox_commerce_v1.paid_video_uploads;
 mutation boolean; replay boolean:=false;
begin
 if claims->>'role' is distinct from 'authenticated' or claims->>'sub' is null or claims->>'session_id' is null
  or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>8192
  or p_payload->>'protocol' is distinct from 'isolated-paid-video-v1' or p_expected_account_id is null or p_expected_session_generation is null
 then raise exception 'paid_video_request_invalid' using errcode='42501'; end if;
 uid:=(claims->>'sub')::uuid; sid:=(claims->>'session_id')::uuid; req:=(p_payload->>'requestId')::uuid;
 if uid is distinct from p_expected_account_id or sid is distinct from p_expected_session_generation or req is null
 then raise exception 'paid_video_actor_binding_invalid' using errcode='42501'; end if;
 allowed:=array['protocol','requestId']||case p_command
  when 'capability.read' then array[]::text[] when 'studio.read' then array['limit','cursor']
  when 'upload.reserve' then array['title','expectedSha256','expectedByteLength']
  when 'upload.read' then array['uploadId'] when 'upload.finalize' then array['uploadId']
  when 'upload.recover' then array['originalRequestId'] when 'resource.read' then array['resourceId']
  when 'offer.publish' then array['uploadId','expectedRevision','amountMinor','currency']
  when 'offer.retire' then array['offerId','expectedRevision'] when 'offer.read' then array['offerId'] else null end;
 if allowed is null or not(p_payload ?& allowed) or (p_payload-allowed)<>'{}'::jsonb
  or jsonb_typeof(p_payload->'requestId') is distinct from 'string'
  or (p_payload ? 'expectedRevision' and (jsonb_typeof(p_payload->'expectedRevision') is distinct from 'number' or p_payload->>'expectedRevision' !~ '^[1-9][0-9]{0,14}$'))
  or (p_payload ? 'amountMinor' and (jsonb_typeof(p_payload->'amountMinor') is distinct from 'number' or p_payload->>'amountMinor' !~ '^[1-9][0-9]{0,8}$'))
  or (p_payload ? 'currency' and (jsonb_typeof(p_payload->'currency') is distinct from 'string' or p_payload->>'currency' !~ '^[a-z]{3}$'))
 then raise exception 'paid_video_payload_invalid'; end if;
 perform sandbox_commerce_v1.assert_generation(false);
 authority:=sandbox_commerce_v1.assert_authority(uid,sid,'delivery');
 mutation:=p_command in ('upload.reserve','upload.finalize','offer.publish','offer.retire');
 if mutation then
  if not pg_try_advisory_xact_lock(hashtextextended('isolated-paid-video-v1:'||uid||':'||req,687)) then raise exception 'paid_video_request_busy' using errcode='55P03'; end if;
  select * into prior from sandbox_commerce_v1.paid_video_requests where user_id=uid and request_id=req;
  if found then
   if prior.command is distinct from p_command or prior.payload is distinct from p_payload or prior.session_id is distinct from sid
    then raise exception 'paid_video_idempotency_conflict'; end if;
   replay:=true; select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=prior.upload_id and creator_id=uid;
  end if;
 end if;
 if replay then
  body:=jsonb_build_object('upload',sandbox_commerce_v1.paid_video_upload_json(u));
  if p_command in ('offer.publish','offer.retire') then
   select * into strict o from sandbox_commerce_v1.offers where resource_id=u.resource_id;
   body:=body||jsonb_build_object('offer',sandbox_commerce_v1.paid_video_offer_json(o));
  end if;
 elsif p_command='upload.recover' then
  if jsonb_typeof(p_payload->'originalRequestId') is distinct from 'string' then raise exception 'paid_video_payload_invalid'; end if;
  select * into prior from sandbox_commerce_v1.paid_video_requests where user_id=uid and request_id=(p_payload->>'originalRequestId')::uuid;
  if not found then state:='unknown'; body:=jsonb_build_object('recovery',jsonb_build_object('state','unknown','originalRequestId',p_payload->>'originalRequestId'));
  else
   select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=prior.upload_id and creator_id=uid;
   body:=jsonb_build_object('recovery',jsonb_build_object('state','recorded','originalRequestId',prior.request_id,
    'originalCommand',prior.command,'originalSessionGeneration',prior.session_id,'originalPayload',prior.payload),
    'upload',sandbox_commerce_v1.paid_video_upload_json(u));
   if prior.command in ('offer.publish','offer.retire') then
    select * into strict o from sandbox_commerce_v1.offers where resource_id=u.resource_id;
    body:=body||jsonb_build_object('offer',sandbox_commerce_v1.paid_video_offer_json(o));
   end if;
  end if;
 elsif p_command='capability.read' then
  begin
   perform sandbox_commerce_v1.assert_generation(true);
   creator_authority:=sandbox_commerce_v1.assert_authority(uid,sid,'creator');
  exception when insufficient_privilege then creator_authority:=null;
  end;
  body:=jsonb_build_object('creatorEligible',creator_authority is not null,'uploadRouteAvailable',
   exists(select 1 from sandbox_commerce_v1.paid_video_routes where active),'transferAvailable',false,'checkoutAvailable',false,
   'profile',jsonb_build_object('id','scpv-mp4-h264-aac-v1','maxBytes',16777216,'maxDurationMs',60000,'maxWidth',1920,'maxHeight',1080,
    'maxFramesPerSecond',60,'videoCodec','h264','pixelFormat','yuv420p','optionalAudioCodec','aac','maxAudioChannels',2,'maxAudioSampleRate',48000));
 elsif p_command='studio.read' then
  if jsonb_typeof(p_payload->'limit') is distinct from 'number' or p_payload->>'limit' !~ '^([1-9]|[1-4][0-9]|50)$'
   or jsonb_typeof(p_payload->'cursor') not in ('null','string') then raise exception 'paid_video_pagination_invalid'; end if;
  if p_payload->>'cursor' is not null then
   select * into strict cursor_row from sandbox_commerce_v1.paid_video_uploads where id=sandbox_commerce_v1.paid_video_id(p_payload->>'cursor') and creator_id=uid;
  end if;
  select coalesce(jsonb_agg(sandbox_commerce_v1.paid_video_upload_json(x) order by x.created_at desc,x.id desc),'[]'::jsonb) into page
   from (select * from sandbox_commerce_v1.paid_video_uploads where creator_id=uid
    and (cursor_row.id is null or (created_at,id)<(cursor_row.created_at,cursor_row.id))
    order by created_at desc,id desc limit (p_payload->>'limit')::integer+1) x;
  if jsonb_array_length(page)>(p_payload->>'limit')::integer then
   page:=page-(p_payload->>'limit')::integer; next_cursor:=page->(jsonb_array_length(page)-1)->>'id';
  end if;
  body:=jsonb_build_object('uploads',page,'nextCursor',next_cursor);
 elsif p_command='upload.reserve' then
  perform sandbox_commerce_v1.assert_generation(true); creator_authority:=sandbox_commerce_v1.assert_authority(uid,sid,'creator');
  if jsonb_typeof(p_payload->'title') is distinct from 'string' or length(btrim(p_payload->>'title')) not between 1 and 200
   or jsonb_typeof(p_payload->'expectedSha256') is distinct from 'string' or p_payload->>'expectedSha256' !~ '^[a-f0-9]{64}$'
   or jsonb_typeof(p_payload->'expectedByteLength') is distinct from 'number' or p_payload->>'expectedByteLength' !~ '^[1-9][0-9]{0,7}$'
   or (p_payload->>'expectedByteLength')::integer>16777216 then raise exception 'paid_video_expectation_invalid'; end if;
  select rr.* into route from sandbox_commerce_v1.paid_video_routes rr where rr.active and
   (rr.id=(select p.route_id from sandbox_commerce_v1.r2_profiles p where p.configuration_digest='8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0' and p.enabled)
    or (not exists(select 1 from sandbox_commerce_v1.r2_profiles where enabled) and rr.provider='s3'
     and rr.id=(select route_id from sandbox_commerce_v1.paid_video_native_authoring_profiles where enabled))) for share nowait;
  if not found then state:='held'; body:=jsonb_build_object('reason','immutable_upload_route_unavailable');
  else
   if not pg_try_advisory_xact_lock(hashtextextended('paid-video-reservation:'||uid,687)) then raise exception 'paid_video_reservation_busy' using errcode='55P03'; end if;
   if (select count(*) from sandbox_commerce_v1.paid_video_uploads where creator_id=uid and created_at>clock_timestamp()-interval '1 day')>=20
    then raise exception 'paid_video_reservation_limit'; end if;
   rid:=gen_random_uuid(); asset:=gen_random_uuid(); incarnation:=gen_random_uuid();
   insert into sandbox_commerce_v1.resources(id,creator_id,kind,title) values(rid,uid,'paid_content',btrim(p_payload->>'title'));
   insert into sandbox_commerce_v1.paid_video_uploads(creator_id,resource_id,asset_id,incarnation,route_id,object_key,expected_sha256,expected_byte_length)
    values(uid,rid,asset,incarnation,route.id,'sandbox-commerce-v1/'||uid||'/scv1_resource_'||rid||'/scv1_asset_'||asset||'/'||incarnation||'.mp4',
    p_payload->>'expectedSha256',(p_payload->>'expectedByteLength')::integer) returning * into u;
   body:=jsonb_build_object('upload',sandbox_commerce_v1.paid_video_upload_json(u));
  end if;
 elsif p_command in ('upload.read','upload.finalize','offer.publish') then
  select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=sandbox_commerce_v1.paid_video_id(p_payload->>'uploadId') and creator_id=uid for update nowait;
  select * into strict r from sandbox_commerce_v1.resources where id=u.resource_id for update nowait;
  if p_command<>'upload.read' then
   perform sandbox_commerce_v1.assert_generation(true); creator_authority:=sandbox_commerce_v1.assert_authority(uid,sid,'creator');
  end if;
  if p_command='upload.finalize' then
   if u.state<>'reserved' or u.expires_at<=clock_timestamp() or r.status<>'draft' then raise exception 'paid_video_finalize_unavailable'; end if;
   update sandbox_commerce_v1.paid_video_uploads set state='scan_pending' where id=u.id returning * into u;
  elsif p_command='offer.publish' then
   select * into strict route from sandbox_commerce_v1.paid_video_routes where id=u.route_id and active for share nowait;
   if r.revision<>(p_payload->>'expectedRevision')::bigint or r.status<>'draft' or u.state<>'clean' or u.moderation<>'clear'
    or u.clean_result_sha256 is null or (route.provider='s3' and u.object_version is null) or (route.provider='cloudflare_r2' and not sandbox_commerce_v1.r2_identity_valid(u.r2_identity)) or u.daily_definitions_at<clock_timestamp()-interval '48 hours'
    or not exists(select 1 from sandbox_commerce_v1.paid_video_scan_results where sha256=u.clean_result_sha256 and accepted_positive)
    then raise exception 'paid_video_publication_evidence_unavailable'; end if;
   c:=sandbox_commerce_v1.paid_video_native_catalog((p_payload->>'amountMinor')::bigint,p_payload->>'currency');
   if c.id is null then state:='held'; body:=jsonb_build_object('reason','native_catalog_unavailable');
   else
    insert into sandbox_commerce_v1.resource_versions(resource_id,revision,creator_id,kind,title,price_minor,currency)
     values(r.id,r.revision,r.creator_id,'paid_content',r.title,c.amount_minor,c.currency);
    insert into sandbox_commerce_v1.delivery_assets(id,resource_id,resource_revision,owner_id,purpose,provider,bucket,object_key,object_version,r2_identity,
     incarnation,sha256,byte_length,state,moderation) values(u.asset_id,r.id,r.revision,uid,'video',route.provider,route.bucket,u.object_key,
     u.object_version,u.r2_identity,u.incarnation,u.expected_sha256,u.expected_byte_length,'retained','clear');
    insert into sandbox_commerce_v1.delivery_asset_scans(asset_id,incarnation,provider,bucket,object_key,object_version,r2_identity,sha256,byte_length,state,scanner_version,completed_at)
     select u.asset_id,u.incarnation,route.provider,route.bucket,u.object_key,u.object_version,u.r2_identity,u.expected_sha256,u.expected_byte_length,'clean',
      'scpv-byte-scan-v1:'||u.clean_result_sha256,(raw_body::jsonb#>>'{result,checkedAt}')::timestamptz
      from sandbox_commerce_v1.paid_video_scan_results where sha256=u.clean_result_sha256;
    insert into sandbox_commerce_v1.video_terms values(r.id,r.revision,u.asset_id,'paid');
    insert into sandbox_commerce_v1.offers(resource_id,resource_revision,catalog_id) values(r.id,r.revision,c.id) returning * into o;
    perform sandbox_commerce_v1.paid_video_native_bind_offer(o);
    update sandbox_commerce_v1.resources set status='published' where id=r.id;
    body:=jsonb_build_object('offer',sandbox_commerce_v1.paid_video_offer_json(o),'upload',sandbox_commerce_v1.paid_video_upload_json(u));
   end if;
  end if;
  if p_command<>'offer.publish' then body:=jsonb_build_object('upload',sandbox_commerce_v1.paid_video_upload_json(u)); end if;
 elsif p_command='resource.read' then
  select * into strict r from sandbox_commerce_v1.resources where id=sandbox_commerce_v1.identifier(p_payload->>'resourceId','resource') and creator_id=uid;
  select * into strict u from sandbox_commerce_v1.paid_video_uploads where resource_id=r.id and creator_id=uid;
  body:=jsonb_build_object('resource',sandbox_commerce_v1.resource_json(r)||jsonb_build_object('title',r.title),'upload',sandbox_commerce_v1.paid_video_upload_json(u));
 elsif p_command in ('offer.read','offer.retire') then
  select * into strict o from sandbox_commerce_v1.offers where id=sandbox_commerce_v1.identifier(p_payload->>'offerId','offer') for update nowait;
  select * into strict r from sandbox_commerce_v1.resources where id=o.resource_id for update nowait;
  select * into strict u from sandbox_commerce_v1.paid_video_uploads where resource_id=r.id for update nowait;
  if p_command='offer.retire' then
   if r.creator_id<>uid or o.revision<>(p_payload->>'expectedRevision')::bigint then raise exception 'paid_video_offer_unavailable'; end if;
   update sandbox_commerce_v1.offers set status='retired' where id=o.id returning * into o;
   update sandbox_commerce_v1.resources set status='retired' where id=r.id;
   update sandbox_commerce_v1.paid_video_uploads x set state=case when x.state='rejected' then x.state else 'retired' end where id=u.id returning * into u;
   update sandbox_commerce_v1.delivery_assets set moderation=case when moderation='removed' then moderation else 'held' end where id=u.asset_id;
  elsif r.creator_id<>uid and (o.status<>'published' or r.status<>'published' or u.state<>'clean' or u.moderation<>'clear')
   then raise exception 'paid_video_offer_unavailable'; end if;
  body:=jsonb_build_object('offer',sandbox_commerce_v1.paid_video_offer_json(o));
  if r.creator_id=uid then body:=body||jsonb_build_object('upload',sandbox_commerce_v1.paid_video_upload_json(u)); end if;
 end if;
 if mutation and not replay and state='ok' then
  insert into sandbox_commerce_v1.paid_video_requests(user_id,request_id,session_id,command,payload,upload_id) values(uid,req,sid,p_command,p_payload,u.id);
 end if;
 perform sandbox_commerce_v1.assert_fresh(authority);
 if creator_authority is not null then perform sandbox_commerce_v1.assert_fresh(creator_authority); end if;
 result:=jsonb_build_object('protocol','isolated-paid-video-v1','command',p_command,'requestId',req,'status',state,
  'actor',jsonb_build_object('userId',uid,'accountId',uid,'sessionGeneration',sid),'data',body);
 return result;
end $$;
create or replace function sandbox_commerce_v1.paid_video_command_v2(p_command text,p_payload jsonb,p_user uuid,p_session uuid,p_configuration text)
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
 if p_configuration='8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0' and exists(select 1 from sandbox_commerce_v1.test_store_v3_native_profiles where configuration_digest=p_configuration)
 then raise exception 'paid_video_authoring_mode_conflict'; end if;
 ready:=sandbox_commerce_v1.paid_video_gateway_ready(p_configuration);
 if p_command='upload.reserve' then
  if not ready or (p_configuration<>'8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0' and
    (select id from sandbox_commerce_v1.paid_video_routes where active order by id limit 1)
    is distinct from (select route_id from sandbox_commerce_v1.paid_video_gateway_controls where singleton))
  then raise exception 'paid_video_gateway_unavailable'; end if;
 elsif p_command in ('upload.finalize','offer.publish') then
  select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=sandbox_commerce_v1.paid_video_id(p_payload->>'uploadId') and creator_id=p_user for update nowait;
  if not ready or not sandbox_commerce_v1.paid_video_gateway_ready(p_configuration,u.route_id)
   or not (exists(select 1 from sandbox_commerce_v1.paid_video_object_receipts r where r.upload_id=u.id and r.object_version=u.object_version)
    or exists(select 1 from sandbox_commerce_v1.r2_receipts r where r.upload_id=u.id and r.identity=u.r2_identity))
  then raise exception 'paid_video_object_receipt_required'; end if;
 end if;
 if p_configuration='8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0' then
  result:=sandbox_commerce_v1.paid_video_native_command(p_command,p_payload,p_user,p_session);
 else
 result:=sandbox_commerce_v1.paid_video_command(p_command,p_payload,p_user,p_session);
 end if;
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
   'checkoutAvailable',ready and p_configuration<>'8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0');
 end if;
 if body ? 'upload' then
  select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=sandbox_commerce_v1.paid_video_id(body#>>'{upload,id}');
  perform sandbox_commerce_v1.paid_video_assert_authoring_mode(u.id,p_configuration);
  if ready then
   begin
    perform sandbox_commerce_v1.assert_fresh(sandbox_commerce_v1.assert_authority(p_user,p_session,'creator')); creator:=true;
   exception when insufficient_privilege then creator:=false;
   end;
  end if;
  transfer:=ready and creator and u.creator_id=p_user and u.state='reserved' and u.expires_at>clock_timestamp()
   and sandbox_commerce_v1.paid_video_gateway_ready(p_configuration,u.route_id)
   and not exists(select 1 from sandbox_commerce_v1.paid_video_transfers where upload_id=u.id)
   and not exists(select 1 from sandbox_commerce_v1.r2_bindings where upload_id=u.id and operation='upload');
  body:=jsonb_set(body,'{upload}',(body->'upload')||jsonb_build_object('transferAvailable',transfer,'checkoutAvailable',false));
  if p_command='upload.read' then
   select jsonb_build_object('requestId',t.request_id,'originalSessionId',t.session_id,'configurationDigest',ct.configuration_digest)
    into transfer_descriptor from sandbox_commerce_v1.paid_video_transfers t
    join sandbox_commerce_v1.paid_video_gateway_transfers ct on ct.transfer_id=t.id where t.upload_id=u.id and t.user_id=p_user;
   if transfer_descriptor is null and exists(select 1 from sandbox_commerce_v1.paid_video_transfers where upload_id=u.id)
   then raise exception 'paid_video_v2_transfer_context_required'; end if;
   if transfer_descriptor is null then
    select jsonb_build_object('requestId',b.request_id,'originalSessionId',b.session_id,'configurationDigest',p.configuration_digest)
     into transfer_descriptor from sandbox_commerce_v1.r2_bindings b join sandbox_commerce_v1.r2_profiles p on p.id=b.profile_id
     where b.upload_id=u.id and b.operation='upload';
   end if;
   body:=body||jsonb_build_object('transfer',transfer_descriptor);
  end if;
 end if;
 if body ? 'offer' then
  select * into strict u from sandbox_commerce_v1.paid_video_uploads where resource_id=sandbox_commerce_v1.identifier(body#>>'{offer,resourceId}','resource');
  perform sandbox_commerce_v1.paid_video_assert_authoring_mode(u.id,p_configuration);
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
create or replace function sandbox_commerce_v1.clean_resource_asset(p_id uuid,p_resource uuid,p_revision bigint,p_owner uuid,p_purpose text)
returns sandbox_commerce_v1.delivery_assets language plpgsql volatile security invoker set search_path='' as $$
declare a sandbox_commerce_v1.delivery_assets; s sandbox_commerce_v1.delivery_asset_scans;
begin
 select * into strict a from sandbox_commerce_v1.delivery_assets where id=p_id for share nowait;
 select * into strict s from sandbox_commerce_v1.delivery_asset_scans where asset_id=a.id and incarnation=a.incarnation for share nowait;
 if a.resource_id<>p_resource or a.resource_revision<>p_revision or a.owner_id<>p_owner or a.purpose<>p_purpose
 or a.state<>'retained' or a.moderation<>'clear' or s.state<>'clean' or s.completed_at>clock_timestamp()
 or row(s.provider,s.bucket,s.object_key,s.object_version,s.r2_identity,s.sha256,s.byte_length)
 is distinct from row(a.provider,a.bucket,a.object_key,a.object_version,a.r2_identity,a.sha256,a.byte_length)
 then raise exception 'sandbox_immutable_clean_asset_required' using errcode='42501'; end if;
 return a;
end; $$;
create or replace function sandbox_commerce_v1.native_store_quote_command_armed(p_user uuid,p_session uuid,p_command text,p_request uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare allowed text[];buyer jsonb;seller jsonb;prior sandbox_commerce_v1.native_store_selections;
 o sandbox_commerce_v1.offers;r sandbox_commerce_v1.resources;v sandbox_commerce_v1.resource_versions;
 terms sandbox_commerce_v1.video_terms;a sandbox_commerce_v1.delivery_assets;b sandbox_commerce_v1.native_store_catalog_bindings;
 cat jsonb;quote jsonb;body jsonb;status text:='ok';matches integer;enabled boolean;owner_until timestamptz;
begin
 if current_setting('transaction_timeout')::interval<=interval '0 seconds'
  or current_setting('transaction_timeout')::interval>interval '5 seconds'
 then raise exception 'native_store_quote_unarmed' using errcode='42501';end if;
 perform sandbox_commerce_v1.assert_provider_service();perform sandbox_commerce_v1.assert_generation(false);
 if p_user is null or p_session is null or p_request is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>8192
 then raise exception 'native_store_quote_request_invalid';end if;
 allowed:=case p_command when 'offer' then array['offerId','store'] when 'prepare' then array['offerId','store','expectedQuote'] when 'recover' then array['originalRequestId'] end;
 if allowed is null or not(p_payload ?& allowed) or p_payload-allowed<>'{}'::jsonb then raise exception 'native_store_quote_shape_invalid';end if;
 buyer:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 if p_command='recover' then
  if jsonb_typeof(p_payload->'originalRequestId') is distinct from 'string' or p_payload->>'originalRequestId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][0-9a-f]{3}-[a-f0-9]{12}$'
  then raise exception 'native_store_quote_shape_invalid';end if;
  select * into prior from sandbox_commerce_v1.native_store_selections where buyer_id=p_user and request_id=(p_payload->>'originalRequestId')::uuid;
  if found then body:=jsonb_build_object('selection',sandbox_commerce_v1.native_store_selection_json(prior),'reason',null);
  else status:='unknown';body:=jsonb_build_object('selection',null,'reason','preparation_unknown');end if;
 else
  if jsonb_typeof(p_payload->'offerId') is distinct from 'string' or jsonb_typeof(p_payload->'store') is distinct from 'string'
   or p_payload->>'store' not in ('APP_STORE','PLAY_STORE') then raise exception 'native_store_quote_shape_invalid';end if;
  if p_command='prepare' then
   if jsonb_typeof(p_payload->'expectedQuote') is distinct from 'object' then raise exception 'native_store_quote_shape_invalid';end if;
   if not pg_try_advisory_xact_lock(hashtextextended('native-store-prepare:'||p_user,691)) then raise exception 'native_store_quote_busy' using errcode='55P03';end if;
   select * into prior from sandbox_commerce_v1.native_store_selections where buyer_id=p_user and request_id=p_request;
   if found and row(prior.session_id,prior.payload) is distinct from row(p_session,p_payload) then raise exception 'native_store_quote_idempotency_conflict';end if;
  end if;
  if prior.id is not null then
   -- Replayed evidence cannot dispatch; later media withdrawal does not erase it.
   body:=jsonb_build_object('selection',sandbox_commerce_v1.native_store_selection_json(prior),'reason',null);
  else
   select * into strict o from sandbox_commerce_v1.offers where id=sandbox_commerce_v1.identifier(p_payload->>'offerId','offer') for share nowait;
   select * into strict r from sandbox_commerce_v1.resources where id=o.resource_id for share nowait;
   select * into strict v from sandbox_commerce_v1.resource_versions where resource_id=r.id and revision=o.resource_revision for share nowait;
   if r.kind<>'paid_content' or v.kind<>'paid_content' or r.status<>'published' or o.status<>'published' or r.revision<>o.resource_revision
     or r.creator_id<>v.creator_id or r.creator_id=p_user or v.currency<>'usd'
     or o.revision>9007199254740991 or v.revision>9007199254740991 or v.price_minor>9007199254740991
     then raise exception 'native_store_offer_unavailable';end if;
   select * into strict terms from sandbox_commerce_v1.video_terms where resource_id=r.id and revision=o.resource_revision for share nowait;
   if terms.audience<>'paid' then raise exception 'native_store_offer_unavailable';end if;
   a:=sandbox_commerce_v1.clean_resource_asset(terms.asset_id,r.id,o.resource_revision,r.creator_id,'video');
   -- Existing helper is provider-neutral despite its historical name: it checks
   -- exact retained media/upload/route, not any Test Store checkout permission.
   perform sandbox_commerce_v1.native_typed_assert_media(jsonb_populate_record(null::sandbox_commerce_v1.intents,
     jsonb_build_object('resource_id',r.id,'resource_revision',v.revision,'creator_id',r.creator_id,'kind','paid_content','amount_minor',v.price_minor,'currency',v.currency)));
   if a.byte_length>16777216 then raise exception 'native_store_offer_unavailable';end if;
   owner_until:=sandbox_commerce_v1.resource_owner_delivery_deadline(r.creator_id,p_user);
   lock table sandbox_commerce_v1.native_store_catalog_bindings,sandbox_commerce_v1.native_store_catalog_retirements in share mode nowait;
   select count(*) into matches from sandbox_commerce_v1.native_store_catalog_bindings x where x.offer_id=o.id and x.offer_revision=o.revision and x.store=p_payload->>'store'
    and not exists(select 1 from sandbox_commerce_v1.native_store_catalog_retirements z where z.binding_id=x.id and z.binding_revision=x.revision);
   if matches<>1 then
    status:='held';body:=case when p_command='offer' then jsonb_build_object('quote',null,'reason','native_store_catalog_unavailable') else jsonb_build_object('selection',null,'reason','native_store_catalog_unavailable') end;
   else
    select * into strict b from sandbox_commerce_v1.native_store_catalog_bindings x where x.offer_id=o.id and x.offer_revision=o.revision and x.store=p_payload->>'store'
     and not exists(select 1 from sandbox_commerce_v1.native_store_catalog_retirements z where z.binding_id=x.id and z.binding_revision=x.revision);
    cat:=b.catalog;
    if cat is distinct from jsonb_build_object('protocol','native-store-sandbox-catalog-v1','bindingId','nssv1_catalog_'||b.id,'revision',b.revision,
      'projectId',cat->>'projectId','appId',cat->>'appId','store',b.store,'environment','SANDBOX','wireProductId',cat->>'wireProductId',
      'productType','one_time','basePlanId',null,'resourceId','scv1_resource_'||r.id,'resourceRevision',v.revision,'creatorId',r.creator_id,
      'amountMinor',v.price_minor,'currency','usd','quantity',1,'asset',jsonb_build_object('id','scv1_asset_'||a.id,'incarnation',a.incarnation,
      'sha256',a.sha256,'byteLength',a.byte_length,'resourceRevision',a.resource_revision,'profile','scpv-mp4-h264-aac-v1'))
      or b.revision>9007199254740991
      or exists(select 1 from (values(cat->>'projectId'),(cat->>'appId'),(cat->>'wireProductId')) field(value)
        where coalesce(octet_length(value),0) not between 1 and 512 or value~'[[:cntrl:]]'
        or value is distinct from btrim(value,E' \t\n\r\f'||chr(11)||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))
    then raise exception 'native_store_catalog_mismatch';end if;
    quote:=jsonb_build_object('offerId','scv1_offer_'||o.id,'offerRevision',o.revision,'resourceId','scv1_resource_'||r.id,'resourceRevision',v.revision,
      'creatorId',r.creator_id,'kind','paid_content','amountMinor',v.price_minor,'currency','usd','asset',cat->'asset',
      'catalog',jsonb_build_object('bindingId',cat->>'bindingId','revision',b.revision,'projectId',cat->>'projectId','appId',cat->>'appId',
      'store',b.store,'environment','SANDBOX','wireProductId',cat->>'wireProductId'));
    quote:=quote||jsonb_build_object('quoteDigest',encode(sha256(convert_to(quote::text,'UTF8')),'hex'));
    if p_command='offer' then body:=jsonb_build_object('quote',quote,'reason',null);
    else
     select preparation_enabled into strict enabled from sandbox_commerce_v1.native_store_quote_controls where singleton for share nowait;
     if not enabled then status:='held';body:=jsonb_build_object('selection',null,'reason','native_store_preparation_disabled');
     else
      perform sandbox_commerce_v1.assert_generation(true);
      buyer:=sandbox_commerce_v1.assert_authority(p_user,p_session,'buyer');seller:=sandbox_commerce_v1.assert_authority(r.creator_id,null,'creator_subject');
      if p_payload->'expectedQuote' is distinct from quote then raise exception 'native_store_quote_changed';end if;
      if (select count(*) from sandbox_commerce_v1.native_store_selections where buyer_id=p_user and created_at>clock_timestamp()-interval '1 day')>=100 then raise exception 'native_store_preparation_limit';end if;
      perform sandbox_commerce_v1.assert_fresh(buyer);perform sandbox_commerce_v1.assert_fresh(seller);
      if clock_timestamp()>=owner_until then raise exception 'native_store_owner_expired';end if;
      insert into sandbox_commerce_v1.native_store_selections(buyer_id,session_id,request_id,payload,quote) values(p_user,p_session,p_request,p_payload,quote) returning * into prior;
      body:=jsonb_build_object('selection',sandbox_commerce_v1.native_store_selection_json(prior),'reason',null);
     end if;
    end if;
   end if;
  end if;
 end if;
 perform sandbox_commerce_v1.assert_fresh(buyer);
 if seller is not null then perform sandbox_commerce_v1.assert_fresh(seller);end if;
 if owner_until is not null and clock_timestamp()>=owner_until then raise exception 'native_store_owner_expired';end if;
 return jsonb_build_object('protocol','native-store-sandbox-command-v1','command',p_command,'requestId',p_request,
  'actor',jsonb_build_object('userId',p_user,'accountId',p_user,'sessionGeneration',p_session),'status',status,'data',body,
  'dispatchAllowed',false,'correlation','unsupported');
end $$;
create or replace function sandbox_commerce_v1.native_store_apply_effect_pre_play_handoff(p_raw_receipt_id uuid,p_claim_id uuid,p_protocol_id uuid,p_protocol_revision bigint,p_projection jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare raw jsonb;o jsonb;mapping jsonb;prior sandbox_commerce_v1.native_store_raw_effects;
 c sandbox_commerce_v1.native_store_claims;s sandbox_commerce_v1.native_store_selections;
 r sandbox_commerce_v1.native_store_reservations;attempt sandbox_commerce_v1.native_store_dispatch_attempts;
 q sandbox_commerce_v1.native_store_protocol_qualifications;allocation sandbox_commerce_v1.native_store_allocations;
 tomb sandbox_commerce_v1.native_store_negative_tombstones;intent sandbox_commerce_v1.intents;
 receipt sandbox_commerce_v1.receipts;grantrow sandbox_commerce_v1.resource_grants;
 resource sandbox_commerce_v1.resources;version sandbox_commerce_v1.resource_versions;offer sandbox_commerce_v1.offers;
 video sandbox_commerce_v1.video_terms;asset sandbox_commerce_v1.delivery_assets;
 buyer uuid;project text;scope text;txn text;chain text;product text;event_id text;kind text;effect_kind text;
 event_at timestamptz;purchased_at timestamptz;amount bigint;owner_until timestamptz;result jsonb;
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.assert_provider_service();
 perform sandbox_commerce_v1.assert_generation(false);
 if jsonb_typeof(p_projection) is distinct from 'object' or
 (select array_agg(key order by key) from jsonb_object_keys(p_projection) key) is distinct from
 array['amountMinor','cancelReason','currency','eventAt','kind','protocol','purchasedAt','quantity','rawSha256']::text[]
 or p_projection->>'protocol' is distinct from 'native-store-authenticated-effect-v1'
 or not coalesce(p_projection->>'kind' in('purchase','refund'),false) then raise exception 'native_store_effect_projection_shape';end if;
 raw:=native_store_sandbox_v1.settlement_source(p_raw_receipt_id);o:=raw->'observation';
 mapping:=sandbox_commerce_v1.native_store_settlement_protocol(p_protocol_id,p_protocol_revision);
 if raw is null or raw->>'rawSha256' is distinct from p_projection->>'rawSha256'
 or raw->>'projectId' is distinct from mapping->>'projectId' or raw->>'appId' is distinct from mapping->>'appId'
 or raw->>'store' is distinct from mapping->>'store' or raw->>'environment' is distinct from 'SANDBOX'
 or raw->>'connectionId' is distinct from mapping->>'connectionId' or raw->>'connectionRevision' is distinct from mapping->>'connectionRevision'
 or raw->'conflicted' is distinct from 'false'::jsonb or jsonb_array_length(raw->'eventIds')<>1
 or o->>'parseStatus' is distinct from 'valid' or o->'issues' is distinct from '[]'::jsonb
 or o->'conflictingUserIds' is distinct from '[]'::jsonb or o->'transferredFrom' is distinct from '[]'::jsonb or o->'transferredTo' is distinct from '[]'::jsonb
 or o->>'productId' is distinct from mapping->>'productId'
 or o->>'userId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or coalesce(length(o->>'transactionId'),0)=0 or coalesce(length(o->>'originalTransactionId'),0)=0
 or coalesce(length(o->>'eventId'),0)=0
 then raise exception 'native_store_authenticated_original_required' using errcode='42501';end if;
 project:=raw->>'projectId';scope:=mapping->>'scopeKey';buyer:=(o->>'userId')::uuid;
 txn:=o->>'transactionId';chain:=o->>'originalTransactionId';product:=o->>'productId';event_id:=o->>'eventId';kind:=p_projection->>'kind';
 event_at:=(p_projection->>'eventAt')::timestamptz;
 if event_at is null or not isfinite(event_at) or event_at>clock_timestamp() or event_at is distinct from (o->>'eventAt')::timestamptz
 then raise exception 'native_store_effect_time_invalid';end if;
 if not exists(select 1 from sandbox_commerce_v1.native_store_pending_raw p where p.raw_receipt_id=p_raw_receipt_id and p.project_id=project and p.raw_sha256=raw->>'rawSha256')
 then raise exception 'native_store_effect_pending_parent_required';end if;
 select * into prior from sandbox_commerce_v1.native_store_raw_effects where raw_receipt_id=p_raw_receipt_id;
 if prior.raw_receipt_id is not null then
  if row(prior.raw_sha256,prior.connection_id,prior.connection_revision,prior.protocol_id,prior.protocol_revision,prior.claim_id,prior.projection)
  is distinct from row(raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,p_claim_id,p_projection)
  then raise exception 'native_store_effect_idempotency_conflict';end if;
  if prior.kind='positive_applied' then
   select * into strict allocation from sandbox_commerce_v1.native_store_allocations where raw_receipt_id=p_raw_receipt_id;
   select * into strict grantrow from sandbox_commerce_v1.resource_grants where receipt_id=allocation.core_receipt_id;
  end if;
  return jsonb_build_object('protocol','native-store-effect-result-v1','consumer','native-store-sandbox-v1','rawReceiptId',p_raw_receipt_id,
   'status','already_processed','effectKind',prior.kind,'allocationId',case when allocation.id is null then null else 'nssv1_allocation_'||allocation.id end,
   'grantId',case when grantrow.id is null then null else 'scv1_grant_'||grantrow.id end,'durable',true,'acknowledgementAllowed',true,'grantsAccess',false,'financialAuthority',false,'payable',false);
 end if;
 lock table sandbox_commerce_v1.resource_delivery_holds in row exclusive mode nowait;
 if kind='refund' then
  if p_claim_id is not null or o->>'eventType' is distinct from 'CANCELLATION' or p_projection->>'cancelReason' is distinct from 'CUSTOMER_SUPPORT'
  or p_projection->'amountMinor' is distinct from 'null'::jsonb or p_projection->'currency' is distinct from 'null'::jsonb
  or p_projection->'purchasedAt' is distinct from 'null'::jsonb or p_projection->'quantity' is distinct from 'null'::jsonb
  then raise exception 'native_store_exact_refund_required';end if;
  select * into tomb from sandbox_commerce_v1.native_store_negative_tombstones where scope_key=scope and original_transaction_id=chain;
  if tomb.id is null then
   insert into sandbox_commerce_v1.native_store_negative_tombstones(scope_key,transaction_id,original_transaction_id,product_id,buyer_id,raw_receipt_id)
   values(scope,txn,chain,product,buyer,p_raw_receipt_id) returning * into tomb;
  elsif row(tomb.buyer_id,tomb.product_id,tomb.transaction_id) is distinct from row(buyer,product,txn)
   then raise exception 'native_store_negative_identity_conflict';end if;
  for allocation in select * from sandbox_commerce_v1.native_store_allocations where scope_key=scope and (transaction_id=txn or original_transaction_id=chain) loop
   if allocation.buyer_id<>buyer then raise exception 'native_store_negative_buyer_conflict';end if;
   select * into strict receipt from sandbox_commerce_v1.receipts where id=allocation.core_receipt_id for update nowait;
   if receipt.product_id<>product then raise exception 'native_store_negative_product_conflict';end if;
   insert into sandbox_commerce_v1.resource_delivery_holds(buyer_id,receipt_id,reason)
   values(buyer,receipt.id,'native_store_refund:'||tomb.id);
   update sandbox_commerce_v1.resource_grants set revoked_at=clock_timestamp() where receipt_id=receipt.id and revoked_at is null;
   update sandbox_commerce_v1.receipts set state='refunded',last_event_at=greatest(last_event_at,event_at) where id=receipt.id;
  end loop;
  allocation:=null;grantrow:=null;effect_kind:='negative_applied';
  insert into sandbox_commerce_v1.native_store_raw_effects(raw_receipt_id,raw_sha256,connection_id,connection_revision,protocol_id,protocol_revision,event_id,kind,tombstone_id,claim_id,projection)
  values(p_raw_receipt_id,raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,event_id,effect_kind,tomb.id,null,p_projection);
 else
  if p_claim_id is null or o->>'eventType' is distinct from 'NON_RENEWING_PURCHASE'
   or p_projection->'cancelReason' is distinct from 'null'::jsonb or p_projection->'quantity' is distinct from '1'::jsonb
   or p_projection->>'currency' is distinct from 'usd' or jsonb_typeof(p_projection->'amountMinor') is distinct from 'number'
   or p_projection->>'amountMinor' !~ '^[1-9][0-9]*$'
   or raw->'originalRevisionRevoked' is distinct from 'false'::jsonb or raw->'intakeEnabled' is distinct from 'true'::jsonb
  then raise exception 'native_store_exact_purchase_required';end if;
  amount:=(p_projection->>'amountMinor')::bigint;purchased_at:=(p_projection->>'purchasedAt')::timestamptz;
  if amount>9007199254740991 or not isfinite(purchased_at) or purchased_at>event_at then raise exception 'native_store_purchase_amount_time';end if;
  select * into strict c from sandbox_commerce_v1.native_store_claims where id=p_claim_id and buyer_id=buyer;
  select * into strict s from sandbox_commerce_v1.native_store_selections where id=c.selection_id and buyer_id=buyer;
  select * into strict r from sandbox_commerce_v1.native_store_reservations where selection_id=s.id and buyer_id=buyer;
  select * into strict attempt from sandbox_commerce_v1.native_store_dispatch_attempts where reservation_id=r.id and buyer_id=buyer;
  lock table sandbox_commerce_v1.native_store_protocol_revocations in share mode nowait;
  select qualification.* into strict q from sandbox_commerce_v1.native_store_qualified_attempts qa
  join sandbox_commerce_v1.native_store_protocol_qualifications qualification on qualification.id=qa.qualification_id and qualification.revision=qa.qualification_revision where qa.attempt_id=attempt.id;
  if c.transaction_identifier<>txn or c.product_identifier<>product or r.quote is distinct from s.quote
   or s.quote#>>'{catalog,projectId}' is distinct from project or s.quote#>>'{catalog,appId}' is distinct from raw->>'appId'
   or s.quote#>>'{catalog,store}' is distinct from raw->>'store' or s.quote#>>'{catalog,wireProductId}' is distinct from product
   or q.connection_id::text<>raw->>'connectionId' or q.connection_revision<>(raw->>'connectionRevision')::bigint
   or q.quote_digest is distinct from s.quote->>'quoteDigest' or (s.quote->>'amountMinor')::bigint<>amount or s.quote->>'currency'<>'usd'
   or row(q.platform,q.native_build,q.native_version,q.signed_app_version,q.sdk_version) is distinct from row(mapping->>'platform',mapping->>'nativeBuild',mapping->>'nativeVersion',mapping->>'signedAppVersion',mapping->>'sdkVersion')
   or purchased_at<date_trunc('milliseconds',attempt.created_at)
   or exists(select 1 from sandbox_commerce_v1.native_store_protocol_revocations v where v.qualification_id=q.id and v.qualification_revision=q.revision)
  then raise exception 'native_store_exact_qualified_allocation_required';end if;
  select * into tomb from sandbox_commerce_v1.native_store_negative_tombstones where scope_key=scope and (transaction_id=txn or original_transaction_id=chain);
  if tomb.id is not null then
   if row(tomb.buyer_id,tomb.product_id) is distinct from row(buyer,product) then raise exception 'native_store_tombstone_identity_conflict';end if;
   effect_kind:='purchase_tombstoned';
   insert into sandbox_commerce_v1.native_store_raw_effects(raw_receipt_id,raw_sha256,connection_id,connection_revision,protocol_id,protocol_revision,event_id,kind,tombstone_id,claim_id,projection)
   values(p_raw_receipt_id,raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,event_id,effect_kind,tomb.id,c.id,p_projection);
   perform sandbox_commerce_v1.native_store_record_refunded_terminal(r.id,tomb.id);
  else
   perform sandbox_commerce_v1.assert_generation(true);
   select * into strict offer from sandbox_commerce_v1.offers where id=sandbox_commerce_v1.identifier(s.quote->>'offerId','offer') for share nowait;
   select * into strict resource from sandbox_commerce_v1.resources where id=offer.resource_id for share nowait;
   select * into strict version from sandbox_commerce_v1.resource_versions where resource_id=resource.id and revision=offer.resource_revision for share nowait;
   if resource.kind<>'paid_content' or version.kind<>'paid_content' or resource.status<>'published' or offer.status<>'published'
    or resource.revision<>version.revision or resource.creator_id<>version.creator_id or resource.creator_id=buyer
    or s.quote->>'resourceId' is distinct from 'scv1_resource_'||resource.id or (s.quote->>'resourceRevision')::bigint<>version.revision
    or (s.quote->>'offerRevision')::bigint<>offer.revision or s.quote->>'creatorId' is distinct from resource.creator_id::text
    or version.price_minor<>amount or version.currency<>'usd'
   then raise exception 'native_store_current_resource_required';end if;
   select * into strict video from sandbox_commerce_v1.video_terms where resource_id=resource.id and revision=version.revision for share nowait;
   if video.audience<>'paid' then raise exception 'native_store_paid_media_required';end if;
   asset:=sandbox_commerce_v1.clean_resource_asset(video.asset_id,resource.id,version.revision,resource.creator_id,'video');
   if s.quote->'asset' is distinct from jsonb_build_object('id','scv1_asset_'||asset.id,'incarnation',asset.incarnation,
    'sha256',asset.sha256,'byteLength',asset.byte_length,'resourceRevision',asset.resource_revision,'profile','scpv-mp4-h264-aac-v1')
   then raise exception 'native_store_exact_asset_required';end if;
   owner_until:=sandbox_commerce_v1.resource_owner_delivery_deadline(resource.creator_id,buyer);
   insert into sandbox_commerce_v1.intents(buyer_id,buyer_session_id,offer_id,offer_revision,resource_id,resource_revision,creator_id,
    kind,provider,scope_key,store,product_id,amount_minor,currency,state,dispatch_id,dispatched_at)
   values(buyer,attempt.session_id,offer.id,offer.revision,resource.id,version.revision,resource.creator_id,
    'paid_content','revenuecat',scope,raw->>'store',product,amount,'usd','verified',attempt.id,attempt.created_at) returning * into intent;
   perform sandbox_commerce_v1.native_typed_assert_media(intent);
   if exists(select 1 from sandbox_commerce_v1.transaction_owners x where x.provider='revenuecat' and x.scope_key=scope and x.store=raw->>'store' and x.original_transaction_id=chain)
   then raise exception 'native_store_transaction_already_owned';end if;
   insert into sandbox_commerce_v1.transaction_owners(provider,scope_key,store,original_transaction_id,buyer_id,product_id)
   values('revenuecat',scope,raw->>'store',chain,buyer,product);
   insert into sandbox_commerce_v1.receipts(intent_id,provider,scope_key,store,product_id,transaction_id,original_transaction_id,state,purchased_at,expires_at,last_event_at)
   values(intent.id,'revenuecat',scope,raw->>'store',product,txn,chain,'verified',purchased_at,null,event_at) returning * into receipt;
   insert into sandbox_commerce_v1.native_store_allocations(raw_receipt_id,claim_id,selection_id,reservation_id,attempt_id,protocol_id,protocol_revision,
    core_receipt_id,buyer_id,scope_key,transaction_id,original_transaction_id)
   values(p_raw_receipt_id,c.id,s.id,r.id,attempt.id,p_protocol_id,p_protocol_revision,receipt.id,buyer,scope,txn,chain) returning * into allocation;
   effect_kind:='positive_applied';
   insert into sandbox_commerce_v1.native_store_raw_effects(raw_receipt_id,raw_sha256,connection_id,connection_revision,protocol_id,protocol_revision,event_id,kind,core_receipt_id,claim_id,projection)
   values(p_raw_receipt_id,raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,event_id,effect_kind,receipt.id,c.id,p_projection);
   -- The positive completion and exact link are in the SAME transaction as the
   -- grant. Other unresolved project evidence aborts this whole allocation.
   insert into sandbox_commerce_v1.native_store_core_links(core_receipt_id,project_id,buyer_id) values(receipt.id,project,buyer);
   result:=sandbox_commerce_v1.settle_resource_receipt(receipt.id);
   select * into strict grantrow from sandbox_commerce_v1.resource_grants where receipt_id=receipt.id and buyer_id=buyer;
   if grantrow.revoked_at is not null or result->>'status'<>'settled' or result->>'grantId'<>grantrow.id::text
   then raise exception 'native_store_exact_grant_required';end if;
   perform sandbox_commerce_v1.native_store_record_allocated_terminal(r.id,allocation.id);
   if clock_timestamp()>=owner_until then raise exception 'native_store_owner_deadline';end if;
  end if;
 end if;
 perform sandbox_commerce_v1.native_store_resolve_completed_pending(p_raw_receipt_id);
 perform sandbox_commerce_v1.assert_generation(false);
 return jsonb_build_object('protocol','native-store-effect-result-v1','consumer','native-store-sandbox-v1','rawReceiptId',p_raw_receipt_id,
  'status',case when effect_kind='purchase_tombstoned' then 'purchase_tombstoned' else 'processed' end,'effectKind',effect_kind,
  'allocationId',case when allocation.id is null then null else 'nssv1_allocation_'||allocation.id end,
  'grantId',case when grantrow.id is null then null else 'scv1_grant_'||grantrow.id end,
  'durable',true,'acknowledgementAllowed',true,'grantsAccess',false,'financialAuthority',false,'payable',false);
end $$;
create or replace function sandbox_commerce_v1.native_store_play_apply_effect(p_raw_receipt_id uuid,p_claim_id uuid,p_protocol_id uuid,p_protocol_revision bigint,p_projection jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare raw jsonb;o jsonb;mapping jsonb;prior sandbox_commerce_v1.native_store_play_raw_effects;
 c sandbox_commerce_v1.native_store_claims;s sandbox_commerce_v1.native_store_selections;
 r sandbox_commerce_v1.native_store_reservations;attempt sandbox_commerce_v1.native_store_dispatch_attempts;
 q sandbox_commerce_v1.native_store_play_handoff_setups;allocation sandbox_commerce_v1.native_store_play_allocations;
 tomb sandbox_commerce_v1.native_store_negative_tombstones;intent sandbox_commerce_v1.intents;
 receipt sandbox_commerce_v1.receipts;grantrow sandbox_commerce_v1.resource_grants;
 resource sandbox_commerce_v1.resources;version sandbox_commerce_v1.resource_versions;offer sandbox_commerce_v1.offers;
 video sandbox_commerce_v1.video_terms;asset sandbox_commerce_v1.delivery_assets;
 buyer uuid;project text;scope text;txn text;chain text;product text;event_id text;kind text;effect_kind text;
 event_at timestamptz;purchased_at timestamptz;amount bigint;owner_until timestamptz;result jsonb;buyer_authority jsonb;enrollment_until timestamptz;
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.assert_provider_service();
 perform sandbox_commerce_v1.assert_generation(false);
 if jsonb_typeof(p_projection) is distinct from 'object' or
 (select array_agg(key order by key) from jsonb_object_keys(p_projection) key) is distinct from
 array['amountMinor','cancelReason','currency','eventAt','kind','protocol','purchasedAt','quantity','rawSha256']::text[]
 or p_projection->>'protocol' is distinct from 'native-store-authenticated-effect-v1'
 or not coalesce(p_projection->>'kind' in('purchase','refund'),false) then raise exception 'native_store_effect_projection_shape';end if;
 raw:=native_store_sandbox_v1.settlement_source(p_raw_receipt_id);o:=raw->'observation';
 mapping:=sandbox_commerce_v1.native_store_play_settlement_protocol(p_protocol_id,p_protocol_revision);
 if raw is null or raw->>'rawSha256' is distinct from p_projection->>'rawSha256'
 or raw->>'projectId' is distinct from mapping->>'projectId' or raw->>'appId' is distinct from mapping->>'appId'
 or raw->>'store' is distinct from mapping->>'store' or raw->>'environment' is distinct from 'SANDBOX'
 or raw->>'connectionId' is distinct from mapping->>'connectionId' or raw->>'connectionRevision' is distinct from mapping->>'connectionRevision'
 or raw->'conflicted' is distinct from 'false'::jsonb or jsonb_array_length(raw->'eventIds')<>1
 or o->>'appId' is distinct from raw->>'appId' or o->>'store' is distinct from 'PLAY_STORE' or o->>'environment' is distinct from 'SANDBOX'
  or o->>'parseStatus' is distinct from 'valid' or o->'issues' is distinct from '[]'::jsonb
 or o->'conflictingUserIds' is distinct from '[]'::jsonb or o->'transferredFrom' is distinct from '[]'::jsonb or o->'transferredTo' is distinct from '[]'::jsonb
 or o->>'productId' is distinct from mapping->>'productId'
 or o->>'userId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or coalesce(length(o->>'transactionId'),0)=0 or coalesce(length(o->>'originalTransactionId'),0)=0
 or coalesce(length(o->>'eventId'),0)=0
 then raise exception 'native_store_authenticated_original_required' using errcode='42501';end if;
 project:=raw->>'projectId';scope:=mapping->>'scopeKey';buyer:=(o->>'userId')::uuid;
 txn:=o->>'transactionId';chain:=o->>'originalTransactionId';product:=o->>'productId';event_id:=o->>'eventId';kind:=p_projection->>'kind';
 event_at:=(p_projection->>'eventAt')::timestamptz;
 if event_at is null or not isfinite(event_at) or event_at>clock_timestamp() or event_at is distinct from (o->>'eventAt')::timestamptz
 then raise exception 'native_store_effect_time_invalid';end if;
 if not exists(select 1 from sandbox_commerce_v1.native_store_pending_raw p where p.raw_receipt_id=p_raw_receipt_id and p.project_id=project and p.raw_sha256=raw->>'rawSha256')
 then raise exception 'native_store_effect_pending_parent_required';end if;
 if exists(select 1 from sandbox_commerce_v1.native_store_raw_effects where raw_receipt_id=p_raw_receipt_id) then raise exception 'native_store_effect_source_conflict';end if;
 select * into prior from sandbox_commerce_v1.native_store_play_raw_effects where raw_receipt_id=p_raw_receipt_id;
 if prior.raw_receipt_id is not null then
  if row(prior.raw_sha256,prior.connection_id,prior.connection_revision,prior.protocol_id,prior.protocol_revision,prior.claim_id,prior.projection)
  is distinct from row(raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,p_claim_id,p_projection)
  then raise exception 'native_store_effect_idempotency_conflict';end if;
  if prior.kind='positive_applied' then
   select * into strict allocation from sandbox_commerce_v1.native_store_play_allocations where raw_receipt_id=p_raw_receipt_id;
   select * into strict grantrow from sandbox_commerce_v1.resource_grants where receipt_id=allocation.core_receipt_id;
  end if;
  return jsonb_build_object('protocol','native-store-effect-result-v1','consumer','native-store-sandbox-v1','rawReceiptId',p_raw_receipt_id,
   'status','already_processed','effectKind',prior.kind,'allocationId',case when allocation.id is null then null else 'nssv1_allocation_'||allocation.id end,
   'grantId',case when grantrow.id is null then null else 'scv1_grant_'||grantrow.id end,'durable',true,'acknowledgementAllowed',true,'grantsAccess',false,'financialAuthority',false,'payable',false);
 end if;
 lock table sandbox_commerce_v1.resource_delivery_holds in row exclusive mode nowait;
 if kind='refund' then
  if p_claim_id is not null or o->>'eventType' is distinct from 'CANCELLATION' or p_projection->>'cancelReason' is distinct from 'CUSTOMER_SUPPORT'
  or p_projection->'amountMinor' is distinct from 'null'::jsonb or p_projection->'currency' is distinct from 'null'::jsonb
  or p_projection->'purchasedAt' is distinct from 'null'::jsonb or p_projection->'quantity' is distinct from 'null'::jsonb
  then raise exception 'native_store_exact_refund_required';end if;
  select * into tomb from sandbox_commerce_v1.native_store_negative_tombstones where scope_key=scope and original_transaction_id=chain;
  if tomb.id is null then
   insert into sandbox_commerce_v1.native_store_negative_tombstones(scope_key,transaction_id,original_transaction_id,product_id,buyer_id,raw_receipt_id)
   values(scope,txn,chain,product,buyer,p_raw_receipt_id) returning * into tomb;
  elsif row(tomb.buyer_id,tomb.product_id,tomb.transaction_id) is distinct from row(buyer,product,txn)
   then raise exception 'native_store_negative_identity_conflict';end if;
  for allocation in select * from sandbox_commerce_v1.native_store_play_allocations where scope_key=scope and (transaction_id=txn or original_transaction_id=chain) loop
   if allocation.buyer_id<>buyer then raise exception 'native_store_negative_buyer_conflict';end if;
   select * into strict receipt from sandbox_commerce_v1.receipts where id=allocation.core_receipt_id for update nowait;
   if receipt.product_id<>product then raise exception 'native_store_negative_product_conflict';end if;
   insert into sandbox_commerce_v1.resource_delivery_holds(buyer_id,receipt_id,reason)
   values(buyer,receipt.id,'native_store_refund:'||tomb.id);
   update sandbox_commerce_v1.resource_grants set revoked_at=clock_timestamp() where receipt_id=receipt.id and revoked_at is null;
   update sandbox_commerce_v1.receipts set state='refunded',last_event_at=greatest(last_event_at,event_at) where id=receipt.id;
  end loop;
  allocation:=null;grantrow:=null;effect_kind:='negative_applied';
  insert into sandbox_commerce_v1.native_store_play_raw_effects(raw_receipt_id,raw_sha256,connection_id,connection_revision,protocol_id,protocol_revision,event_id,kind,tombstone_id,claim_id,projection)
  values(p_raw_receipt_id,raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,event_id,effect_kind,tomb.id,null,p_projection);
 else
  if p_claim_id is null or o->>'eventType' is distinct from 'NON_RENEWING_PURCHASE'
   or p_projection->'cancelReason' is distinct from 'null'::jsonb or p_projection->'quantity' is distinct from '1'::jsonb
   or p_projection->>'currency' is distinct from 'usd' or jsonb_typeof(p_projection->'amountMinor') is distinct from 'number'
   or p_projection->>'amountMinor' !~ '^[1-9][0-9]*$'
   or raw->'originalRevisionRevoked' is distinct from 'false'::jsonb or raw->'intakeEnabled' is distinct from 'true'::jsonb
  then raise exception 'native_store_exact_purchase_required';end if;
  amount:=(p_projection->>'amountMinor')::bigint;purchased_at:=(p_projection->>'purchasedAt')::timestamptz;
  if amount>9007199254740991 or not isfinite(purchased_at) or purchased_at>event_at then raise exception 'native_store_purchase_amount_time';end if;
  select * into strict c from sandbox_commerce_v1.native_store_claims where id=p_claim_id and buyer_id=buyer;
  select * into strict s from sandbox_commerce_v1.native_store_selections where id=c.selection_id and buyer_id=buyer;
  select * into strict r from sandbox_commerce_v1.native_store_reservations where selection_id=s.id and buyer_id=buyer;
  select * into strict attempt from sandbox_commerce_v1.native_store_dispatch_attempts where reservation_id=r.id and buyer_id=buyer;
  q:=sandbox_commerce_v1.native_store_play_attempt_setup(attempt.id);
  select e.expires_at into strict enrollment_until from sandbox_commerce_v1.native_store_play_handoff_attempts h
   join sandbox_commerce_v1.native_store_play_enrollments e on e.id=h.enrollment_id and e.revision=h.enrollment_revision where h.attempt_id=attempt.id;
  if c.transaction_identifier<>txn or c.product_identifier<>product or r.quote is distinct from s.quote
   or s.quote#>>'{catalog,projectId}' is distinct from project or s.quote#>>'{catalog,appId}' is distinct from raw->>'appId'
   or s.quote#>>'{catalog,store}' is distinct from raw->>'store' or s.quote#>>'{catalog,wireProductId}' is distinct from product
   or q.connection_id::text<>raw->>'connectionId' or q.connection_revision<>(raw->>'connectionRevision')::bigint
   or q.quote_digest is distinct from s.quote->>'quoteDigest' or (s.quote->>'amountMinor')::bigint<>amount or s.quote->>'currency'<>'usd'
   or row(q.platform,q.native_build,q.native_version,q.sdk_version) is distinct from row(mapping->>'platform',mapping->>'nativeBuild',mapping->>'nativeVersion',mapping->>'sdkVersion')
   or purchased_at<date_trunc('milliseconds',attempt.created_at)
   or purchased_at>=enrollment_until
  then raise exception 'native_store_exact_qualified_allocation_required';end if;
  select * into tomb from sandbox_commerce_v1.native_store_negative_tombstones where scope_key=scope and (transaction_id=txn or original_transaction_id=chain);
  if tomb.id is not null then
   if row(tomb.buyer_id,tomb.product_id) is distinct from row(buyer,product) then raise exception 'native_store_tombstone_identity_conflict';end if;
   effect_kind:='purchase_tombstoned';
   insert into sandbox_commerce_v1.native_store_play_raw_effects(raw_receipt_id,raw_sha256,connection_id,connection_revision,protocol_id,protocol_revision,event_id,kind,tombstone_id,claim_id,projection)
   values(p_raw_receipt_id,raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,event_id,effect_kind,tomb.id,c.id,p_projection);
   perform sandbox_commerce_v1.native_store_play_record_refunded_terminal(r.id,tomb.id);
  else
   perform sandbox_commerce_v1.assert_generation(true);
   buyer_authority:=sandbox_commerce_v1.assert_authority(buyer,attempt.session_id,'buyer');
   select * into strict offer from sandbox_commerce_v1.offers where id=sandbox_commerce_v1.identifier(s.quote->>'offerId','offer') for share nowait;
   select * into strict resource from sandbox_commerce_v1.resources where id=offer.resource_id for share nowait;
   select * into strict version from sandbox_commerce_v1.resource_versions where resource_id=resource.id and revision=offer.resource_revision for share nowait;
   if resource.kind<>'paid_content' or version.kind<>'paid_content' or resource.status<>'published' or offer.status<>'published'
    or resource.revision<>version.revision or resource.creator_id<>version.creator_id or resource.creator_id=buyer
    or s.quote->>'resourceId' is distinct from 'scv1_resource_'||resource.id or (s.quote->>'resourceRevision')::bigint<>version.revision
    or (s.quote->>'offerRevision')::bigint<>offer.revision or s.quote->>'creatorId' is distinct from resource.creator_id::text
    or version.price_minor<>amount or version.currency<>'usd'
   then raise exception 'native_store_current_resource_required';end if;
   select * into strict video from sandbox_commerce_v1.video_terms where resource_id=resource.id and revision=version.revision for share nowait;
   if video.audience<>'paid' then raise exception 'native_store_paid_media_required';end if;
   asset:=sandbox_commerce_v1.clean_resource_asset(video.asset_id,resource.id,version.revision,resource.creator_id,'video');
   if s.quote->'asset' is distinct from jsonb_build_object('id','scv1_asset_'||asset.id,'incarnation',asset.incarnation,
    'sha256',asset.sha256,'byteLength',asset.byte_length,'resourceRevision',asset.resource_revision,'profile','scpv-mp4-h264-aac-v1')
   then raise exception 'native_store_exact_asset_required';end if;
   owner_until:=sandbox_commerce_v1.resource_owner_delivery_deadline(resource.creator_id,buyer);
   insert into sandbox_commerce_v1.intents(buyer_id,buyer_session_id,offer_id,offer_revision,resource_id,resource_revision,creator_id,
    kind,provider,scope_key,store,product_id,amount_minor,currency,state,dispatch_id,dispatched_at)
   values(buyer,attempt.session_id,offer.id,offer.revision,resource.id,version.revision,resource.creator_id,
    'paid_content','revenuecat',scope,raw->>'store',product,amount,'usd','verified',attempt.id,attempt.created_at) returning * into intent;
   perform sandbox_commerce_v1.native_typed_assert_media(intent);
   if exists(select 1 from sandbox_commerce_v1.transaction_owners x where x.provider='revenuecat' and x.scope_key=scope and x.store=raw->>'store' and x.original_transaction_id=chain)
   then raise exception 'native_store_transaction_already_owned';end if;
   insert into sandbox_commerce_v1.transaction_owners(provider,scope_key,store,original_transaction_id,buyer_id,product_id)
   values('revenuecat',scope,raw->>'store',chain,buyer,product);
   insert into sandbox_commerce_v1.receipts(intent_id,provider,scope_key,store,product_id,transaction_id,original_transaction_id,state,purchased_at,expires_at,last_event_at)
   values(intent.id,'revenuecat',scope,raw->>'store',product,txn,chain,'verified',purchased_at,null,event_at) returning * into receipt;
   insert into sandbox_commerce_v1.native_store_play_allocations(raw_receipt_id,claim_id,selection_id,reservation_id,attempt_id,protocol_id,protocol_revision,
    core_receipt_id,buyer_id,scope_key,transaction_id,original_transaction_id)
   values(p_raw_receipt_id,c.id,s.id,r.id,attempt.id,p_protocol_id,p_protocol_revision,receipt.id,buyer,scope,txn,chain) returning * into allocation;
   effect_kind:='positive_applied';
   insert into sandbox_commerce_v1.native_store_play_raw_effects(raw_receipt_id,raw_sha256,connection_id,connection_revision,protocol_id,protocol_revision,event_id,kind,core_receipt_id,claim_id,projection)
   values(p_raw_receipt_id,raw->>'rawSha256',(raw->>'connectionId')::uuid,(raw->>'connectionRevision')::bigint,p_protocol_id,p_protocol_revision,event_id,effect_kind,receipt.id,c.id,p_projection);
   -- The positive completion and exact link are in the SAME transaction as the
   -- grant. Other unresolved project evidence aborts this whole allocation.
   insert into sandbox_commerce_v1.native_store_core_links(core_receipt_id,project_id,buyer_id) values(receipt.id,project,buyer);
   result:=sandbox_commerce_v1.settle_resource_receipt(receipt.id);
   select * into strict grantrow from sandbox_commerce_v1.resource_grants where receipt_id=receipt.id and buyer_id=buyer;
   if grantrow.revoked_at is not null or result->>'status'<>'settled' or result->>'grantId'<>grantrow.id::text
   then raise exception 'native_store_exact_grant_required';end if;
   perform sandbox_commerce_v1.native_store_play_record_allocated_terminal(r.id,allocation.id);
   perform sandbox_commerce_v1.assert_fresh(buyer_authority);
   if clock_timestamp()>=owner_until then raise exception 'native_store_owner_deadline';end if;
  end if;
 end if;
 perform sandbox_commerce_v1.native_store_resolve_completed_pending(p_raw_receipt_id);
 perform sandbox_commerce_v1.assert_generation(false);
 return jsonb_build_object('protocol','native-store-effect-result-v1','consumer','native-store-sandbox-v1','rawReceiptId',p_raw_receipt_id,
  'status',case when effect_kind='purchase_tombstoned' then 'purchase_tombstoned' else 'processed' end,'effectKind',effect_kind,
  'allocationId',case when allocation.id is null then null else 'nssv1_allocation_'||allocation.id end,
  'grantId',case when grantrow.id is null then null else 'scv1_grant_'||grantrow.id end,
  'durable',true,'acknowledgementAllowed',true,'grantsAccess',false,'financialAuthority',false,'payable',false);
end $$;
create or replace function sandbox_commerce_v1.native_store_paid_video_access(p_user uuid,p_session uuid,p_resource uuid,p_grant uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare g sandbox_commerce_v1.resource_grants;r sandbox_commerce_v1.receipts;i sandbox_commerce_v1.intents;
 asset sandbox_commerce_v1.delivery_assets;video sandbox_commerce_v1.video_terms;
 upload sandbox_commerce_v1.paid_video_uploads;route sandbox_commerce_v1.paid_video_routes;
 ctl sandbox_commerce_v1.paid_video_gateway_controls;authority jsonb;evidence jsonb;delivery jsonb;deadline timestamptz;
begin
 if exists(select 1 from sandbox_commerce_v1.paid_video_uploads u join sandbox_commerce_v1.paid_video_routes rr on rr.id=u.route_id
   where u.resource_id=p_resource and rr.provider='cloudflare_r2')
 then perform sandbox_commerce_v1.assert_provider_service();return sandbox_commerce_v1.native_store_paid_video_r2_access(p_user,p_session,p_resource,p_grant);end if;
 perform sandbox_commerce_v1.assert_provider_service();perform sandbox_commerce_v1.assert_generation(true);
 if p_user is null or p_session is null or p_resource is null or p_grant is null then raise exception 'native_video_binding_required';end if;
 authority:=sandbox_commerce_v1.assert_authority(p_user,p_session,'delivery');
 -- Same generic hold/grant graph as existing private delivery. NOWAIT prevents
 -- acknowledging access while intake or negative application changes it.
 lock table sandbox_commerce_v1.resource_grants,sandbox_commerce_v1.resource_delivery_holds in share mode nowait;
 select * into strict g from sandbox_commerce_v1.resource_grants where id=p_grant and buyer_id=p_user and product_id=p_resource for share nowait;
 select * into strict r from sandbox_commerce_v1.receipts where id=g.receipt_id for share nowait;
 select * into strict i from sandbox_commerce_v1.intents where id=r.intent_id for share nowait;
 if i.kind<>'paid_content' or i.state<>'verified' or r.state<>'verified' or g.revoked_at is not null
  or i.provider<>'revenuecat' or i.store not in('APP_STORE','PLAY_STORE') or i.currency<>'usd' or i.buyer_id<>p_user
  or row(g.product_id,g.product_revision) is distinct from row(i.resource_id,i.resource_revision)
  or row(r.provider,r.scope_key,r.store,r.product_id) is distinct from row(i.provider,i.scope_key,i.store,i.product_id)
 then raise exception 'native_video_exact_receipt_required';end if;
 -- This owner-private helper re-reads allocation, original journal/effect and
 -- mapping/dispatch/connection revocations under the common project lock. A
 -- generic verified receipt or caller-supplied boolean is never sufficient.
 evidence:=sandbox_commerce_v1.native_store_assert_current_allocation(r.id,p_user);
 if evidence->>'allocationId' is null or evidence->>'projectId' is null
  or evidence->>'originalTransactionId' is distinct from r.original_transaction_id
 then raise exception 'native_video_current_allocation_required';end if;
 if (sandbox_commerce_v1.current_resource_grant(p_user,p_resource,g.product_revision)).id is distinct from g.id
 then raise exception 'native_video_exact_current_grant_required';end if;
 delivery:=sandbox_commerce_v1.authorize_resource_delivery(p_user,p_session,p_resource,g.product_revision,p_resource,g.product_revision,'play_video');
 if delivery->>'issuer' is distinct from 'media_signer' or delivery->>'eligibleForIssuer' is distinct from 'true'
 then raise exception 'native_video_media_authority_required';end if;
 select * into strict video from sandbox_commerce_v1.video_terms where resource_id=p_resource and revision=g.product_revision;
 asset:=sandbox_commerce_v1.clean_resource_asset(video.asset_id,p_resource,g.product_revision,i.creator_id,'video');
 select * into strict upload from sandbox_commerce_v1.paid_video_uploads where resource_id=p_resource and asset_id=asset.id for share nowait;
 select * into strict route from sandbox_commerce_v1.paid_video_routes where id=upload.route_id for share nowait;
 select * into strict ctl from sandbox_commerce_v1.paid_video_gateway_controls where singleton for share nowait;
 perform 1 from sandbox_commerce_v1.paid_video_workers where id=ctl.worker_id and active for share nowait;
 if not found then raise exception 'native_video_worker_unavailable';end if;
 perform 1 from sandbox_commerce_v1.paid_video_verifiers v where v.id=ctl.verifier_id and v.active
  and not exists(select 1 from sandbox_commerce_v1.paid_video_workers w where w.hmac_key=v.hmac_key) for share of v nowait;
 if not found then raise exception 'native_video_verifier_unavailable';end if;
 if not ctl.enabled or ctl.route_id is distinct from route.id or not route.active or route.provider<>'s3' or upload.state<>'clean' or upload.moderation<>'clear'
  or row(route.provider,route.bucket,upload.object_key,upload.object_version,upload.incarnation,upload.expected_sha256,upload.expected_byte_length)
   is distinct from row(asset.provider,asset.bucket,asset.object_key,asset.object_version,asset.incarnation,asset.sha256,asset.byte_length)
  or not exists(select 1 from sandbox_commerce_v1.paid_video_object_receipts o join sandbox_commerce_v1.paid_video_transfers t on t.id=o.transfer_id
   where o.upload_id=upload.id and o.verifier_id=ctl.verifier_id and o.object_version=upload.object_version and t.upload_id=upload.id and t.user_id=upload.creator_id
    and o.observation_raw::jsonb->>'incarnation'=upload.incarnation::text and o.observation_raw::jsonb->>'sha256'=upload.expected_sha256
    and (o.observation_raw::jsonb->>'byteLength')::bigint=upload.expected_byte_length)
 then raise exception 'native_video_current_object_required';end if;
 deadline:=least(transaction_timestamp()+interval '5 seconds',(authority->>'valid_until')::timestamptz,to_timestamp((delivery#>>'{binding,expiresAtMs}')::numeric/1000));
 perform sandbox_commerce_v1.assert_fresh(authority);
 if deadline is null or not isfinite(deadline) or clock_timestamp()>=deadline then raise exception 'native_video_access_expired';end if;
 return jsonb_build_object('protocol','nssv1-current-access-gateway-v1','actor',jsonb_build_object('userId',p_user,'sessionGeneration',p_session),
  'resourceId','scv1_resource_'||p_resource,'grantId','scv1_grant_'||g.id,'receiptId','scv1_receipt_'||r.id,
  'originalTransactionId',r.original_transaction_id,'allocationId',evidence->>'allocationId','projectId',evidence->>'projectId',
  'validUntilMs',floor(extract(epoch from deadline)*1000),
  'object',jsonb_build_object('provider',asset.provider,'bucket',asset.bucket,'routeId',route.id,'objectKey',asset.object_key,'incarnation',asset.incarnation,'expectedSha256',asset.sha256,'expectedByteLength',asset.byte_length,'objectVersion',asset.object_version),
  'media',jsonb_build_object('assetId','scv1_asset_'||asset.id,'incarnation',asset.incarnation,'sha256',asset.sha256,'byteLength',asset.byte_length,'resourceRevision',asset.resource_revision,'profile','scpv-mp4-h264-aac-v1'));
end $$;
create or replace function sandbox_commerce_v1.paid_video_review_snapshot(p_upload uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select jsonb_build_object('uploadId','scpv_upload_'||u.id,'creatorId',u.creator_id,'incarnation',u.incarnation,
  'sha256',u.expected_sha256,'byteLength',u.expected_byte_length,'objectVersion',u.object_version,
  'cleanResultSha256',u.clean_result_sha256,'state',u.state,'moderation',u.moderation,
  'object',case when r.provider='cloudflare_r2' then sandbox_commerce_v1.r2_object(u.id) else jsonb_build_object('provider',r.provider,'bucket',r.bucket,'routeId',r.id,'objectKey',u.object_key,
   'incarnation',u.incarnation,'expectedSha256',u.expected_sha256,'expectedByteLength',u.expected_byte_length,'objectVersion',u.object_version) end,
  'lastReview', (select m.id::text from sandbox_commerce_v1.paid_video_moderation m where m.upload_id=u.id order by recorded_at desc,id desc limit 1))
 from sandbox_commerce_v1.paid_video_uploads u join sandbox_commerce_v1.paid_video_routes r on r.id=u.route_id where u.id=p_upload;
$$;
create or replace function sandbox_commerce_v1.paid_video_review(p_action text,p_raw text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare body jsonb; claims jsonb:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
 uid uuid; sid uuid; upload uuid; authority jsonb; reviewer sandbox_commerce_v1.paid_video_reviewers;
 prior sandbox_commerce_v1.paid_video_reviews; snapshot jsonb; req uuid;
begin
 if p_action is null or p_action not in ('inspect','decide','recover') or p_raw is null or octet_length(p_raw)>16384
  or claims->>'role' is distinct from 'authenticated' then raise exception 'paid_video_review_context_invalid'; end if;
 perform sandbox_commerce_v1.arm_transaction_timeout();
 perform sandbox_commerce_v1.assert_generation(false);
 body:=p_raw::jsonb; uid:=(claims->>'sub')::uuid; sid:=(claims->>'session_id')::uuid; req:=(body->>'requestId')::uuid;
 if uid is null or sid is null or req is null or body->>'protocol' is distinct from 'scpv-review-request-v1'
  or row(body->>'reviewerId',body->>'sessionId') is distinct from row(uid::text,sid::text)
  or body-(case when p_action='inspect' then array['protocol','requestId','reviewerId','sessionId','uploadId']
    else array['protocol','requestId','reviewerId','sessionId','uploadId','snapshot','decision','evidenceSha256','reviewedAt','humanReviewConfirmed'] end)<>'{}'::jsonb
 then raise exception 'paid_video_review_context_invalid'; end if;
 authority:=sandbox_commerce_v1.assert_authority(uid,sid,'delivery');
 select * into strict reviewer from sandbox_commerce_v1.paid_video_reviewers where user_id=uid and active for share nowait;
 upload:=sandbox_commerce_v1.paid_video_id(body->>'uploadId');
 perform 1 from sandbox_commerce_v1.paid_video_uploads where id=upload and creator_id<>uid for update nowait;
 if not found then raise exception 'paid_video_independent_reviewer_required'; end if;
 snapshot:=sandbox_commerce_v1.paid_video_review_snapshot(upload);
 if p_action='inspect' then
  perform sandbox_commerce_v1.assert_fresh(authority); return snapshot;
 end if;
 if not pg_try_advisory_xact_lock(hashtextextended('paid-video-review:'||req,687)) then raise exception 'paid_video_review_busy'; end if;
 select * into prior from sandbox_commerce_v1.paid_video_reviews where request_id=req;
 if found then
  if prior.raw<>p_raw or prior.user_id<>uid then raise exception 'paid_video_review_request_conflict'; end if;
  perform sandbox_commerce_v1.assert_fresh(authority);
  return jsonb_build_object('state','acknowledged','requestId',req,'decision',prior.decision,'snapshot',prior.snapshot);
 end if;
 if p_action='recover' then perform sandbox_commerce_v1.assert_fresh(authority); return jsonb_build_object('state','unknown','requestId',req); end if;
 if body->'snapshot' is distinct from snapshot or body->'humanReviewConfirmed' is distinct from 'true'::jsonb
  or body->>'evidenceSha256' is null or body->>'evidenceSha256' !~ '^[a-f0-9]{64}$'
  or (body->>'reviewedAt')::timestamptz is null or not isfinite((body->>'reviewedAt')::timestamptz)
  or (body->>'reviewedAt')::timestamptz not between clock_timestamp()-interval '10 minutes' and clock_timestamp()+interval '5 seconds'
 then raise exception 'paid_video_review_evidence_invalid'; end if;
 if body->>'decision'='clear' then
  if exists(select 1 from sandbox_commerce_v1.paid_video_uploads x join sandbox_commerce_v1.paid_video_routes rr on rr.id=x.route_id where x.id=upload and rr.provider='cloudflare_r2')
  then perform sandbox_commerce_v1.r2_review_object(upload);
  else
   perform sandbox_commerce_v1.paid_video_operations_binding((select binding from sandbox_commerce_v1.paid_video_operations_config where singleton),true);
   perform sandbox_commerce_v1.paid_video_operations_object(upload,(select binding from sandbox_commerce_v1.paid_video_operations_config where singleton));
  end if;
 end if;
 -- Same monotonic moderation effect as the private operator API, in this
 -- already-armed transaction. Calling that API would try to rearm its timer.
 if body->>'decision' is null or body->>'decision' not in ('clear','held','removed')
  or (body->>'decision'='clear' and (snapshot->>'state'<>'clean' or snapshot->>'moderation'='removed'))
 then raise exception 'paid_video_moderation_invalid'; end if;
 insert into sandbox_commerce_v1.paid_video_moderation(upload_id,decision,evidence_sha256) values(upload,body->>'decision',body->>'evidenceSha256');
 update sandbox_commerce_v1.paid_video_uploads set moderation=body->>'decision' where id=upload;
 update sandbox_commerce_v1.delivery_assets set moderation=body->>'decision' where id=(select asset_id from sandbox_commerce_v1.paid_video_uploads where id=upload);
 insert into sandbox_commerce_v1.paid_video_reviews values(req,uid,sid,p_raw,snapshot,body->>'decision',body->>'evidenceSha256',reviewer.authorization_sha256,clock_timestamp());
 perform sandbox_commerce_v1.assert_fresh(authority);
 return jsonb_build_object('state','acknowledged','requestId',req,'decision',body->>'decision','snapshot',snapshot);
end $$;
reset role;
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

set local role sbx_v1_core_owner;
create function sandbox_commerce_v1.r2_assert_scanner(p_profile uuid default null,p_worker uuid default null) returns void language plpgsql set search_path='' as $$
declare claims jsonb:=current_setting('request.jwt.claims',true)::jsonb;begin
 if current_setting('request.jwt.claims',true)::jsonb->>'role' is distinct from 'sbx_v1_r2_scanner'
  or current_setting('role',true) is distinct from 'sbx_v1_r2_scanner'
  or coalesce(claims->>'profile_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  or coalesce(claims->>'worker_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  or (p_profile is not null and claims->>'profile_id' is distinct from p_profile::text)
  or (p_worker is not null and claims->>'worker_id' is distinct from p_worker::text)
 then raise exception 'paid_video_r2_scanner_role_required' using errcode='42501';end if;
end $$;
create function sandbox_commerce_v1.r2_lease(p_upload uuid,p_worker uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare u sandbox_commerce_v1.paid_video_uploads;p sandbox_commerce_v1.r2_profiles;t sandbox_commerce_v1.paid_video_tickets;a jsonb;o jsonb;
begin
 perform sandbox_commerce_v1.r2_assert_scanner();perform sandbox_commerce_v1.assert_generation(true);
 if p_worker is null or not pg_try_advisory_xact_lock(hashtextextended('paid-video-r2-worker:'||p_worker,692))
 then raise exception 'paid_video_r2_worker_busy';end if;
 if exists(select 1 from sandbox_commerce_v1.paid_video_tickets tt join sandbox_commerce_v1.paid_video_uploads x on x.id=tt.upload_id
  where tt.worker_id=p_worker and tt.expires_at>clock_timestamp() and tt.positive_consumed_at is null and x.state='scan_pending')
 then raise exception 'paid_video_r2_worker_already_leased';end if;
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=p_upload for update nowait;
 select * into strict p from sandbox_commerce_v1.r2_profiles where route_id=u.route_id and worker_id=p_worker for share nowait;
 perform sandbox_commerce_v1.r2_assert_scanner(p.id,p.worker_id);
 if not sandbox_commerce_v1.r2_ready(p.configuration_digest,u.route_id) or u.state<>'scan_pending'
  or u.moderation='removed' or u.expires_at<=clock_timestamp()
  or not exists(select 1 from sandbox_commerce_v1.r2_receipts rr where rr.upload_id=u.id and rr.identity=u.r2_identity)
  or exists(select 1 from sandbox_commerce_v1.paid_video_tickets where upload_id=u.id and expires_at>clock_timestamp())
 then raise exception 'paid_video_r2_scan_unavailable';end if;
 a:=sandbox_commerce_v1.assert_authority(u.creator_id,null,'creator_subject');o:=sandbox_commerce_v1.r2_object(u.id);
 insert into sandbox_commerce_v1.paid_video_tickets(upload_id,worker_id) values(u.id,p.worker_id) returning * into t;
 insert into sandbox_commerce_v1.r2_tickets values(t.id,p.id,o);
 perform sandbox_commerce_v1.assert_fresh(a);
 return jsonb_build_object('protocol','scpv-worker-ticket-r2-v1','ticketId',t.id,'uploadId','scpv_upload_'||u.id,
  'workerId',p.worker_id,'qualificationSha256',p.qualification_sha256,'profile','scpv-mp4-h264-aac-v1',
  'issuedAt',t.issued_at,'expiresAt',t.expires_at,'object',o);
end $$;
revoke all on function sandbox_commerce_v1.r2_assert_scanner(uuid,uuid),sandbox_commerce_v1.r2_lease(uuid,uuid)
 from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway,sbx_v1_r2_scanner;
create function sandbox_commerce_v1.r2_review_object(p_upload uuid) returns void
language plpgsql volatile set search_path='' as $$
declare u sandbox_commerce_v1.paid_video_uploads;p sandbox_commerce_v1.r2_profiles;r sandbox_commerce_v1.r2_receipts;
 s sandbox_commerce_v1.paid_video_scan_results;w sandbox_commerce_v1.paid_video_workers;v sandbox_commerce_v1.paid_video_verifiers;a jsonb;
begin
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=p_upload for share nowait;
 select * into strict p from sandbox_commerce_v1.r2_profiles where route_id=u.route_id for share nowait;
 if not sandbox_commerce_v1.r2_ready(p.configuration_digest,u.route_id) or u.state<>'clean' or u.moderation='removed'
  or u.daily_definitions_at<clock_timestamp()-interval '48 hours' then raise exception 'paid_video_r2_review_unavailable';end if;
 a:=sandbox_commerce_v1.assert_authority(u.creator_id,null,'creator_subject');
 select * into strict r from sandbox_commerce_v1.r2_receipts where upload_id=u.id and identity=u.r2_identity and verifier_id=p.verifier_id;
 select * into strict v from sandbox_commerce_v1.paid_video_verifiers where id=p.verifier_id;
 select * into strict w from sandbox_commerce_v1.paid_video_workers where id=p.worker_id;
 select * into strict s from sandbox_commerce_v1.paid_video_scan_results where sha256=u.clean_result_sha256 and accepted_positive;
 if not sandbox_commerce_v1.paid_video_signature_matches(sandbox_commerce_v1.paid_video_hmac(v.hmac_key,r.raw_body),r.signature)
  or not sandbox_commerce_v1.paid_video_signature_matches(sandbox_commerce_v1.paid_video_hmac(w.hmac_key,s.raw_body),s.signature)
  or s.raw_body::jsonb->'object' is distinct from sandbox_commerce_v1.r2_object(u.id)
  or not exists(select 1 from sandbox_commerce_v1.r2_tickets rt join sandbox_commerce_v1.paid_video_tickets tt on tt.id=rt.ticket_id
   where rt.ticket_id=s.ticket_id and rt.profile_id=p.id and tt.worker_id=p.worker_id and tt.upload_id=u.id and rt.object=s.raw_body::jsonb->'object')
 then raise exception 'paid_video_r2_review_evidence_invalid';end if;
 perform sandbox_commerce_v1.assert_fresh(a);
end $$;
revoke all on function sandbox_commerce_v1.r2_review_object(uuid) from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway,sbx_v1_r2_scanner;
reset role;
create function public.native_paid_video_r2_worker_v1(p_action text,p_upload_id uuid default null,p_worker_id uuid default null,p_raw_body text default null,p_signature text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.r2_assert_scanner();
 if p_action='lease' and p_upload_id is not null and p_worker_id is not null and p_raw_body is null and p_signature is null
 then return sandbox_commerce_v1.r2_lease(p_upload_id,p_worker_id);
 elsif p_action='complete' and p_upload_id is null and p_worker_id is null and p_raw_body is not null and p_signature is not null
 then
  perform sandbox_commerce_v1.r2_assert_scanner(
   (select rt.profile_id from sandbox_commerce_v1.r2_tickets rt where rt.ticket_id=(p_raw_body::jsonb->>'ticketId')::uuid),
   (p_raw_body::jsonb->>'workerId')::uuid);
  perform sandbox_commerce_v1.r2_scan_ingest(p_raw_body,p_signature);
  return jsonb_build_object('protocol','scpv-r2-worker-completion-v1','state','recorded',
   'resultSha256',encode(sha256(convert_to(p_raw_body,'UTF8')),'hex'));
 end if;
 raise exception 'paid_video_r2_worker_action_invalid';
end $$;
create function public.native_paid_video_r2_scan_admit_v1(p_upload_id uuid,p_ticket_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare p sandbox_commerce_v1.r2_profiles;t sandbox_commerce_v1.paid_video_tickets;begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.r2_assert_scanner();
 select x.* into strict t from sandbox_commerce_v1.paid_video_tickets x where x.id=p_ticket_id and x.upload_id=p_upload_id;
 select x.* into strict p from sandbox_commerce_v1.r2_profiles x join sandbox_commerce_v1.r2_tickets rt on rt.profile_id=x.id where rt.ticket_id=t.id;
 perform sandbox_commerce_v1.r2_assert_scanner(p.id,t.worker_id);
 return sandbox_commerce_v1.r2_admit('scan',t.worker_id,null,t.upload_id,t.id,p.configuration_digest,null,null);
end $$;
alter function public.native_paid_video_r2_worker_v1(text,uuid,uuid,text,text) owner to sbx_v1_core_owner;
alter function public.native_paid_video_r2_scan_admit_v1(uuid,uuid) owner to sbx_v1_core_owner;
revoke all on function public.native_paid_video_r2_worker_v1(text,uuid,uuid,text,text),public.native_paid_video_r2_scan_admit_v1(uuid,uuid)
 from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway,sbx_v1_r2_scanner;
grant usage on schema public to sbx_v1_r2_scanner;
grant execute on function public.native_paid_video_r2_worker_v1(text,uuid,uuid,text,text),public.native_paid_video_r2_scan_admit_v1(uuid,uuid) to sbx_v1_r2_scanner;
create function public.native_paid_video_r2_next_v1(p_worker_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare candidate record;begin
 perform sandbox_commerce_v1.arm_transaction_timeout();perform sandbox_commerce_v1.r2_assert_scanner();
 perform sandbox_commerce_v1.r2_assert_scanner(null,p_worker_id);
 perform sandbox_commerce_v1.assert_generation(true);
 if p_worker_id is null or not pg_try_advisory_xact_lock(hashtextextended('paid-video-r2-worker:'||p_worker_id,692))
 then raise exception 'paid_video_r2_worker_busy';end if;
 if exists(select 1 from sandbox_commerce_v1.paid_video_tickets t join sandbox_commerce_v1.paid_video_uploads u on u.id=t.upload_id
  where t.worker_id=p_worker_id and t.expires_at>clock_timestamp() and t.positive_consumed_at is null and u.state='scan_pending')
 then return null;end if;
 for candidate in select u.id from sandbox_commerce_v1.paid_video_uploads u
  join sandbox_commerce_v1.r2_profiles p on p.route_id=u.route_id and p.worker_id=p_worker_id and p.enabled
   and p.id=(current_setting('request.jwt.claims',true)::jsonb->>'profile_id')::uuid
  join sandbox_commerce_v1.r2_receipts r on r.upload_id=u.id and r.identity=u.r2_identity
  join sandbox_commerce_v1.r2_commits c on c.upload_id=u.id and c.state='acknowledged' and c.identity=r.identity
  where u.state='scan_pending' and u.moderation<>'removed' and u.expires_at>clock_timestamp()
   and not exists(select 1 from sandbox_commerce_v1.paid_video_tickets t where t.upload_id=u.id and t.expires_at>clock_timestamp())
  order by u.created_at,u.id limit 20 for update of u skip locked
 loop
  begin return sandbox_commerce_v1.r2_lease(candidate.id,p_worker_id);
  exception when insufficient_privilege then null;end;
 end loop;
 return null;
end $$;
alter function public.native_paid_video_r2_next_v1(uuid) owner to sbx_v1_core_owner;
revoke all on function public.native_paid_video_r2_next_v1(uuid) from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway,sbx_v1_r2_scanner;
grant execute on function public.native_paid_video_r2_next_v1(uuid) to sbx_v1_r2_scanner;

set local role sbx_v1_core_owner;
do $lock$ declare f record;begin for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='sandbox_commerce_v1' and p.proname in ('native_r2_assert_media','native_typed_assert_media','native_store_paid_video_r2_access','r2_scan_ingest') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role,sbx_v1_operator,sbx_v1_r2_gateway,sbx_v1_r2_scanner',f.signature);end loop;end $lock$;
reset role;