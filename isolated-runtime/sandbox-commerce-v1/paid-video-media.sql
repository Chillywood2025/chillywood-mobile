-- Additive, inactive source: after resource-graphs.sql, before finalization.
-- NOT wired into the installer. No provider route, worker key, catalog or media
-- authority is provisioned by this file. No legacy object is touched.
set local role sbx_v1_core_owner;

create table sandbox_commerce_v1.paid_video_routes (
 id uuid primary key, provider text not null check(provider in ('s3','cloudflare_r2')),
 bucket text not null check(bucket ~ '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$'),
 route_evidence_sha256 text not null check(route_evidence_sha256 ~ '^[a-f0-9]{64}$'),
 active boolean not null default false, unique(provider,bucket)
);
create table sandbox_commerce_v1.paid_video_workers (
 id uuid primary key, hmac_key bytea not null check(octet_length(hmac_key)=32),
 qualified_binary_sha256 text not null check(qualified_binary_sha256 ~ '^[a-f0-9]{64}$'),
 active boolean not null default false
);
create table sandbox_commerce_v1.paid_video_uploads (
 id uuid primary key default gen_random_uuid(), creator_id uuid not null,
 resource_id uuid not null unique references sandbox_commerce_v1.resources,
 asset_id uuid not null unique default gen_random_uuid(), incarnation uuid not null default gen_random_uuid(),
 route_id uuid not null references sandbox_commerce_v1.paid_video_routes,
 object_key text not null unique, expected_sha256 text not null check(expected_sha256 ~ '^[a-f0-9]{64}$'),
 expected_byte_length integer not null check(expected_byte_length between 1 and 16777216),
 state text not null default 'reserved' check(state in ('reserved','scan_pending','clean','rejected','retired')),
 object_version text, clean_result_sha256 text, daily_definitions_at timestamptz,
 moderation text not null default 'unreviewed' check(moderation in ('unreviewed','clear','held','removed')),
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null default clock_timestamp()+interval '24 hours',
 check(object_key='sandbox-commerce-v1/'||creator_id||'/scv1_resource_'||resource_id||'/scv1_asset_'||asset_id||'/'||incarnation||'.mp4')
);
create table sandbox_commerce_v1.paid_video_tickets (
 id uuid primary key default gen_random_uuid(), upload_id uuid not null references sandbox_commerce_v1.paid_video_uploads,
 worker_id uuid not null references sandbox_commerce_v1.paid_video_workers,
 issued_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null default clock_timestamp()+interval '10 minutes',
 positive_consumed_at timestamptz
);
create index paid_video_tickets_upload on sandbox_commerce_v1.paid_video_tickets(upload_id,expires_at);
create table sandbox_commerce_v1.paid_video_scan_results (
 sha256 text primary key check(sha256 ~ '^[a-f0-9]{64}$'), ticket_id uuid not null references sandbox_commerce_v1.paid_video_tickets,
 raw_body text not null check(octet_length(raw_body)<=16384), signature text not null,
 accepted_positive boolean not null, received_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.paid_video_moderation (
 id uuid primary key default gen_random_uuid(), upload_id uuid not null references sandbox_commerce_v1.paid_video_uploads,
 decision text not null check(decision in ('clear','held','removed')), evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.paid_video_requests (
 user_id uuid not null, request_id uuid not null, session_id uuid not null,
 command text not null, payload jsonb not null, upload_id uuid references sandbox_commerce_v1.paid_video_uploads,
 created_at timestamptz not null default clock_timestamp(), primary key(user_id,request_id)
);
-- Only a separately qualified protocol-3 catalog admission may populate this
-- immutable relation. A generic catalog row alone cannot publish paid video.
create table sandbox_commerce_v1.paid_video_catalog (
 catalog_id uuid primary key references sandbox_commerce_v1.catalog,
 protocol integer not null check(protocol=3), evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$')
);
do $$ declare t text; begin
 foreach t in array array['paid_video_routes','paid_video_workers','paid_video_uploads','paid_video_tickets',
 'paid_video_scan_results','paid_video_moderation','paid_video_requests','paid_video_catalog'] loop
  execute format('alter table sandbox_commerce_v1.%I enable row level security',t);
  execute format('alter table sandbox_commerce_v1.%I force row level security',t);
  execute format('create policy core_owner on sandbox_commerce_v1.%I for all to sbx_v1_core_owner using(true) with check(true)',t);
  execute format('revoke all on sandbox_commerce_v1.%I from public,anon,authenticated,service_role',t);
 end loop;
 foreach t in array array['paid_video_scan_results','paid_video_moderation','paid_video_requests','paid_video_catalog'] loop
  execute format('create trigger identity_immutable before update or delete on sandbox_commerce_v1.%I for each row execute function sandbox_commerce_v1.protect_resource_identity()',t);
 end loop;
end $$;
create trigger identity_immutable before update or delete on sandbox_commerce_v1.paid_video_routes
 for each row execute function sandbox_commerce_v1.protect_resource_identity('active');
create trigger identity_immutable before update or delete on sandbox_commerce_v1.paid_video_workers
 for each row execute function sandbox_commerce_v1.protect_resource_identity('active');
create trigger identity_immutable before update or delete on sandbox_commerce_v1.paid_video_uploads
 for each row execute function sandbox_commerce_v1.protect_resource_identity('state','object_version','clean_result_sha256','daily_definitions_at','moderation');
create trigger identity_immutable before update or delete on sandbox_commerce_v1.paid_video_tickets
 for each row execute function sandbox_commerce_v1.protect_resource_identity('positive_consumed_at');

-- Built-in SHA256, no additional extension or shared schema required.
create function sandbox_commerce_v1.paid_video_hmac(p_key bytea,p_body text)
returns text language plpgsql immutable security invoker set search_path='' as $$
declare inner_pad bytea:=decode(repeat('36',64),'hex'); outer_pad bytea:=decode(repeat('5c',64),'hex'); n integer;
begin
 if octet_length(p_key)<>32 then raise exception 'paid_video_key_invalid'; end if;
 for n in 0..31 loop
  inner_pad:=set_byte(inner_pad,n,get_byte(inner_pad,n)#get_byte(p_key,n));
  outer_pad:=set_byte(outer_pad,n,get_byte(outer_pad,n)#get_byte(p_key,n));
 end loop;
 return encode(sha256(outer_pad||sha256(inner_pad||convert_to(p_body,'UTF8'))),'hex');
end $$;
create function sandbox_commerce_v1.paid_video_signature_matches(p_expected text,p_actual text)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare a bytea; b bytea; diff integer:=0; n integer;
begin
 if p_expected is null or p_actual is null or p_expected !~ '^[a-f0-9]{64}$' or p_actual !~ '^[a-f0-9]{64}$' then return false; end if;
 a:=decode(p_expected,'hex'); b:=decode(p_actual,'hex');
 for n in 0..31 loop diff:=diff|(get_byte(a,n)#get_byte(b,n)); end loop;
 return diff=0;
end $$;
create function sandbox_commerce_v1.paid_video_upload_json(u sandbox_commerce_v1.paid_video_uploads)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id','scpv_upload_'||u.id,'title',r.title,'resourceId','scv1_resource_'||u.resource_id,
 'assetId','scv1_asset_'||u.asset_id,'incarnation',u.incarnation,'state',u.state,
 'expectedSha256',u.expected_sha256,'expectedByteLength',u.expected_byte_length,
 'bytesClean',u.state='clean','moderation',u.moderation,'profile','scpv-mp4-h264-aac-v1',
 'expiresAt',u.expires_at,'transferAvailable',false,'checkoutAvailable',false)
 from sandbox_commerce_v1.resources r where r.id=u.resource_id;
$$;

create function sandbox_commerce_v1.paid_video_lease(p_upload_id uuid,p_worker_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare u sandbox_commerce_v1.paid_video_uploads; r sandbox_commerce_v1.paid_video_routes;
 t sandbox_commerce_v1.paid_video_tickets; authority jsonb;
begin
 perform sandbox_commerce_v1.assert_generation(true);
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=p_upload_id for update nowait;
 select * into strict r from sandbox_commerce_v1.paid_video_routes where id=u.route_id and active for share nowait;
 perform 1 from sandbox_commerce_v1.paid_video_workers where id=p_worker_id and active for share nowait;
 if not found then raise exception 'paid_video_worker_unavailable'; end if;
 authority:=sandbox_commerce_v1.assert_authority(u.creator_id,null,'creator_subject');
 if u.state<>'scan_pending' or u.expires_at<=clock_timestamp() or exists(select 1 from sandbox_commerce_v1.paid_video_tickets
  where upload_id=u.id and expires_at>clock_timestamp()) then raise exception 'paid_video_scan_unavailable'; end if;
 insert into sandbox_commerce_v1.paid_video_tickets(upload_id,worker_id) values(u.id,p_worker_id) returning * into t;
 perform sandbox_commerce_v1.assert_fresh(authority);
 return jsonb_build_object('protocol','scpv-worker-ticket-v1','ticketId',t.id,'uploadId','scpv_upload_'||u.id,
  'incarnation',u.incarnation,'expiresAt',t.expires_at,'provider',r.provider,'bucket',r.bucket,'routeId',r.id,'objectKey',u.object_key,
  'expectedSha256',u.expected_sha256,'expectedByteLength',u.expected_byte_length,'profile','scpv-mp4-h264-aac-v1');
end $$;

create function sandbox_commerce_v1.paid_video_scan_ingest(p_raw_body text,p_signature text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare body jsonb; result jsonb; media jsonb; t sandbox_commerce_v1.paid_video_tickets;
 u sandbox_commerce_v1.paid_video_uploads; w sandbox_commerce_v1.paid_video_workers;
 hash text; is_clean boolean; daily_at timestamptz; checked_at timestamptz; authority jsonb;
begin
 if p_raw_body is null or octet_length(p_raw_body)>16384 then raise exception 'paid_video_result_invalid'; end if;
 body:=p_raw_body::jsonb; result:=body->'result'; media:=result->'media';
 if body->>'protocol' is distinct from 'scpv-worker-result-v1' or jsonb_typeof(body)<>'object'
  or not(body ?& array['protocol','ticketId','uploadId','incarnation','objectVersion','result'])
  or (body-array['protocol','ticketId','uploadId','incarnation','objectVersion','result'])<>'{}'::jsonb
  or result->>'protocol' is distinct from 'scpv-byte-scan-v1' or result->>'profile' is distinct from 'scpv-mp4-h264-aac-v1'
  or result->>'moderation' is distinct from 'unreviewed' or result->>'verdict' not in ('clean','rejected')
  or jsonb_typeof(body->'objectVersion') is distinct from 'string'
  or coalesce(body->>'objectVersion','')='' or body->>'objectVersion'='null'
  or octet_length(convert_to(body->>'objectVersion','UTF8'))>1024
  or body->>'objectVersion' ~ U&'[\0001-\001F\007F]'
 then raise exception 'paid_video_result_invalid'; end if;
 -- Lifecycle shared fence also covers retired negative/replay reconciliation.
 perform sandbox_commerce_v1.assert_generation(false);
 select * into strict t from sandbox_commerce_v1.paid_video_tickets where id=(body->>'ticketId')::uuid for update nowait;
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=t.upload_id for update nowait;
 select * into strict w from sandbox_commerce_v1.paid_video_workers where id=t.worker_id for share nowait;
 if not sandbox_commerce_v1.paid_video_signature_matches(sandbox_commerce_v1.paid_video_hmac(w.hmac_key,p_raw_body),p_signature)
  then raise exception 'paid_video_worker_signature_invalid' using errcode='42501'; end if;
 if body->>'uploadId' is distinct from 'scpv_upload_'||u.id or body->>'incarnation' is distinct from u.incarnation::text
  or result->>'sha256' is distinct from u.expected_sha256
  or jsonb_typeof(result->'byteLength') is distinct from 'number' or (result->>'byteLength')::bigint<>u.expected_byte_length
 then raise exception 'paid_video_result_binding_invalid'; end if;
 hash:=encode(sha256(convert_to(p_raw_body,'UTF8')),'hex');
 if exists(select 1 from sandbox_commerce_v1.paid_video_scan_results where sha256=hash)
  then return jsonb_build_object('accepted',true,'upload',sandbox_commerce_v1.paid_video_upload_json(u)); end if;
 is_clean:=result->>'verdict'='clean';
 if is_clean then
  perform sandbox_commerce_v1.assert_generation(true);
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
  update sandbox_commerce_v1.paid_video_uploads set state='clean',object_version=body->>'objectVersion',
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

create function sandbox_commerce_v1.paid_video_moderate(p_upload_id uuid,p_decision text,p_evidence_sha256 text)
returns void language plpgsql volatile security definer set search_path='' as $$
declare u sandbox_commerce_v1.paid_video_uploads;
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 perform sandbox_commerce_v1.assert_generation(false);
 select * into strict u from sandbox_commerce_v1.paid_video_uploads where id=p_upload_id for update nowait;
 if p_decision is null or p_decision not in ('clear','held','removed') or p_evidence_sha256 is null
  or p_evidence_sha256 !~ '^[a-f0-9]{64}$' or (p_decision='clear' and (u.state<>'clean' or u.moderation='removed'))
 then raise exception 'paid_video_moderation_invalid'; end if;
 if p_decision='clear' then perform sandbox_commerce_v1.assert_generation(true); end if;
 insert into sandbox_commerce_v1.paid_video_moderation(upload_id,decision,evidence_sha256) values(u.id,p_decision,p_evidence_sha256);
 update sandbox_commerce_v1.paid_video_uploads set moderation=p_decision where id=u.id;
 update sandbox_commerce_v1.delivery_assets set moderation=case when p_decision='clear' then 'clear' else p_decision end where id=u.asset_id;
end $$;

revoke all on function sandbox_commerce_v1.paid_video_hmac(bytea,text),sandbox_commerce_v1.paid_video_signature_matches(text,text),
 sandbox_commerce_v1.paid_video_upload_json(sandbox_commerce_v1.paid_video_uploads),sandbox_commerce_v1.paid_video_lease(uuid,uuid),
 sandbox_commerce_v1.paid_video_scan_ingest(text,text),sandbox_commerce_v1.paid_video_moderate(uuid,text,text)
 from public,anon,authenticated,service_role;
grant execute on function sandbox_commerce_v1.paid_video_moderate(uuid,text,text) to sbx_v1_operator;
reset role;
create function public.isolated_paid_video_worker_v1(p_action text,p_upload_id uuid default null,p_worker_id uuid default null,p_raw_body text default null,p_signature text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 if p_action='lease' and p_upload_id is not null and p_worker_id is not null and p_raw_body is null and p_signature is null
  then return sandbox_commerce_v1.paid_video_lease(p_upload_id,p_worker_id);
 elsif p_action='result' and p_upload_id is null and p_worker_id is null and p_raw_body is not null and p_signature is not null
  then return sandbox_commerce_v1.paid_video_scan_ingest(p_raw_body,p_signature);
 else raise exception 'paid_video_worker_action_invalid'; end if;
end $$;
alter function public.isolated_paid_video_worker_v1(text,uuid,uuid,text,text) owner to sbx_v1_core_owner;
revoke all on function public.isolated_paid_video_worker_v1(text,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.isolated_paid_video_worker_v1(text,uuid,uuid,text,text) to service_role;
