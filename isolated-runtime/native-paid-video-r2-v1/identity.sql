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
