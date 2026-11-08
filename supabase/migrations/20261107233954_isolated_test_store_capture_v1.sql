begin;set local lock_timeout='250ms';set local statement_timeout='5s';set local transaction_timeout='5s';
-- Source-only independent receiver; no deployment authority or configuration.
-- Reused observation/evidence algorithms are pinned in source-manifest.json.
-- Fresh names only: CREATE fails on collisions and the installer rolls back.
create role rcq_v1_owner nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
create role rcq_v1_operator nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
create role rcq_v1_consumer nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant rcq_v1_owner to postgres with inherit true, set true;
grant rcq_v1_operator to postgres with inherit false, set true;
create schema rc_qualification_capture_v1 authorization rcq_v1_owner;
revoke all on schema rc_qualification_capture_v1 from public,anon,authenticated,service_role;
grant usage on schema rc_qualification_capture_v1 to rcq_v1_operator,rcq_v1_consumer;
set local role rcq_v1_owner;
alter default privileges revoke execute on functions from public;
create function rc_qualification_capture_v1.immutable_evidence() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'capture_evidence_immutable' using errcode='42501'; end; $$;
create function rc_qualification_capture_v1.arm_transaction_timeout() returns void
language plpgsql volatile security invoker set search_path='' as $$
declare remaining_ms integer;
begin
 if current_setting('transaction_timeout') is distinct from '0'
   or current_setting('transaction_isolation') is distinct from 'read committed'
 then raise exception 'capture_timeout_context_invalid' using errcode='42501'; end if;
 remaining_ms:=floor(extract(epoch from
   (transaction_timestamp()+interval '5 seconds'-clock_timestamp()))*1000);
 if remaining_ms<1 or remaining_ms>5000 then
   raise exception 'capture_transaction_context_invalid' using errcode='42501'; end if;
 perform set_config('transaction_timeout',remaining_ms::text,true);
end; $$;
create function rc_qualification_capture_v1.assert_provider_service() returns void
language plpgsql volatile security invoker set search_path='' as $$
begin
 if (nullif(current_setting('request.jwt.claims',true),'')::jsonb)->>'role' is distinct from 'service_role'
 then raise exception 'capture_service_required' using errcode='42501'; end if;
end; $$;
-- Cross-module helpers run inside the future caller's already bounded RPC.
create function rc_qualification_capture_v1.assert_consumer_context() returns void
language plpgsql volatile security invoker set search_path='' as $$
begin
 if current_setting('transaction_isolation') is distinct from 'read committed'
   or current_setting('transaction_timeout')::interval<=interval '0'
   or current_setting('transaction_timeout')::interval>interval '5 seconds'
   or clock_timestamp()>=transaction_timestamp()+interval '5 seconds'
 then raise exception 'capture_consumer_context_invalid' using errcode='42501'; end if;
end; $$;
create table rc_qualification_capture_v1.project_reservations (
 project_id text primary key check(project_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 purpose text not null check(purpose in ('capture','economic')),
 binding text not null check(length(binding) between 1 and 128 and binding=trim(binding)
   and binding !~ '[[:cntrl:]]'),
 created_at timestamptz not null default clock_timestamp(),
 unique(project_id,purpose,binding)
);
alter table rc_qualification_capture_v1.project_reservations enable row level security;
alter table rc_qualification_capture_v1.project_reservations force row level security;
create policy owner on rc_qualification_capture_v1.project_reservations to rcq_v1_owner using(true) with check(true);
revoke all on rc_qualification_capture_v1.project_reservations from public,anon,authenticated,service_role,rcq_v1_operator,rcq_v1_consumer;
create trigger immutable before update or delete on rc_qualification_capture_v1.project_reservations
 for each row execute function rc_qualification_capture_v1.immutable_evidence();
create trigger no_truncate before truncate on rc_qualification_capture_v1.project_reservations
 for each statement execute function rc_qualification_capture_v1.immutable_evidence();
set local role rcq_v1_owner;

create table rc_qualification_capture_v1.test_store_qualification_connections (
 id uuid not null, revision integer not null check(revision>0),
 project_id text not null unique check(project_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 app_id text not null check(app_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 auth_key_version text not null check(length(auth_key_version) between 1 and 512),
 storage_key_id text not null check(length(storage_key_id) between 1 and 512),
 reservation_purpose text not null default 'capture' check(reservation_purpose='capture'),
 reservation_binding text generated always as(id::text) stored,
 primary key(id,revision),
 foreign key(project_id,reservation_purpose,reservation_binding)
   references rc_qualification_capture_v1.project_reservations(project_id,purpose,binding)
);
create table rc_qualification_capture_v1.test_store_qualification_controls (
 singleton boolean primary key default true check(singleton),
 phase text not null default 'disabled' check(phase in ('disabled','capturing','sealed')),
 connection_id uuid, connection_revision integer,
 max_entries integer not null default 0 check(max_entries between 0 and 256),
 max_deliveries integer not null default 0 check(max_deliveries between 0 and 1024),
 max_total_bytes bigint not null default 0 check(max_total_bytes between 0 and 67108864),
 started_at timestamptz, sealed_at timestamptz, seal_sha256 text,
 foreign key(connection_id,connection_revision) references rc_qualification_capture_v1.test_store_qualification_connections(id,revision),
 check((connection_id is null)=(connection_revision is null)),
 check((phase='disabled' and connection_id is null and started_at is null and sealed_at is null and seal_sha256 is null)
   or(phase='capturing' and connection_id is not null and started_at is not null and sealed_at is null and seal_sha256 is null)
   or(phase='sealed' and connection_id is not null and started_at is not null and sealed_at is not null and seal_sha256 ~ '^[a-f0-9]{64}$' and seal_sha256 is not null)),
 check(phase='disabled' or(max_entries>0 and max_deliveries>0 and max_total_bytes>0))
);
insert into rc_qualification_capture_v1.test_store_qualification_controls(singleton) values(true);
create table rc_qualification_capture_v1.test_store_qualification_entries (
 id uuid primary key default gen_random_uuid(), connection_id uuid not null, connection_revision integer not null,
 project_id text not null, raw_sha256 text not null check(raw_sha256 ~ '^[a-f0-9]{64}$'), provider_event_id text,
 envelope jsonb not null, observation jsonb not null, lineage_unknown boolean not null,
 received_at timestamptz not null default clock_timestamp(),
 foreign key(connection_id,connection_revision) references rc_qualification_capture_v1.test_store_qualification_connections(id,revision),
 unique(project_id,raw_sha256)
);
create table rc_qualification_capture_v1.test_store_qualification_deliveries (
 id uuid primary key default gen_random_uuid(), entry_id uuid not null references rc_qualification_capture_v1.test_store_qualification_entries(id),
 envelope jsonb not null, observation jsonb not null, stored_bytes integer not null check(stored_bytes>0),
 received_at timestamptz not null default clock_timestamp()
);
create table rc_qualification_capture_v1.test_store_qualification_exclusions (
 project_id text not null, kind text not null check(kind in ('raw','event','original','transaction','customer')), key text not null,
 entry_id uuid not null references rc_qualification_capture_v1.test_store_qualification_entries(id),
 delivery_id uuid not null references rc_qualification_capture_v1.test_store_qualification_deliveries(id),
 primary key(project_id,kind,key)
);
create table rc_qualification_capture_v1.test_store_qualification_conflicts (
 id uuid primary key default gen_random_uuid(), project_id text not null,
 entry_id uuid not null references rc_qualification_capture_v1.test_store_qualification_entries(id),
 delivery_id uuid not null references rc_qualification_capture_v1.test_store_qualification_deliveries(id),
 reason text not null, received_at timestamptz not null default clock_timestamp()
);

create function rc_qualification_capture_v1.test_store_qualification_control_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op<>'UPDATE' then raise exception 'qualification_control_immutable'; end if;
 if old.phase='disabled' and new.phase='capturing' then return new; end if;
 if old.phase='capturing' and new.phase='sealed'
   and (to_jsonb(old)-array['phase','sealed_at','seal_sha256'])=(to_jsonb(new)-array['phase','sealed_at','seal_sha256']) then return new; end if;
 raise exception 'qualification_transition_forbidden';
end; $$;
create trigger monotonic before update or delete on rc_qualification_capture_v1.test_store_qualification_controls
 for each row execute function rc_qualification_capture_v1.test_store_qualification_control_guard();
create trigger no_truncate before truncate on rc_qualification_capture_v1.test_store_qualification_controls
 for each statement execute function rc_qualification_capture_v1.immutable_evidence();
do $install$
declare t text;
begin
 foreach t in array array['connections','controls','entries','deliveries','exclusions','conflicts'] loop
   execute format('alter table rc_qualification_capture_v1.test_store_qualification_%I enable row level security',t);
   execute format('alter table rc_qualification_capture_v1.test_store_qualification_%I force row level security',t);
   execute format('create policy core_owner on rc_qualification_capture_v1.test_store_qualification_%I for all to rcq_v1_owner using(true) with check(true)',t);
   execute format('revoke all on table rc_qualification_capture_v1.test_store_qualification_%I from public,anon,authenticated,service_role,rcq_v1_operator',t);
   if t<>'controls' then
     execute format('create trigger immutable before update or delete on rc_qualification_capture_v1.test_store_qualification_%I for each row execute function rc_qualification_capture_v1.immutable_evidence()',t);
     execute format('create trigger no_truncate before truncate on rc_qualification_capture_v1.test_store_qualification_%I for each statement execute function rc_qualification_capture_v1.immutable_evidence()',t);
   end if;
 end loop;
end; $install$;

create function rc_qualification_capture_v1.test_store_qualification_text(p_value jsonb)
returns boolean language sql immutable security invoker set search_path='' as $$
 select jsonb_typeof(p_value)='string' and length(p_value#>>'{}') between 1 and 512
   and (p_value#>>'{}')=btrim(p_value#>>'{}') and (p_value#>>'{}')!~ '[[:cntrl:]]';
$$;
-- JSON (unlike JSONB) retains escaped unpaired surrogates. Decode each scalar
-- independently so valid sibling identities survive; preserve original bytes
-- in ASCII base64 for exact authenticated AES/AAD reconstruction by the Edge.
create function rc_qualification_capture_v1.test_store_qualification_safe_common(p_encoded text,p_sha256 text)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare encoded_bytes bytea; original json; original_text text; safe_text text;
 token text[]; pieces text[]:=array[]::text[]; item record; element jsonb; converted jsonb; items jsonb;
 sentinel constant jsonb:='{"qualificationInvalidUnicode":true}'::jsonb;
 result jsonb:='{}'::jsonb; changed boolean:=false;
begin
 if p_encoded is null or length(p_encoded)>1398104 or p_encoded !~ '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
   or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'qualification_original_observation_invalid'; end if;
 encoded_bytes:=decode(p_encoded,'base64');
 if octet_length(encoded_bytes)>1048576 or replace(encode(encoded_bytes,'base64'),E'\n','')<>p_encoded
   or encode(sha256(encoded_bytes),'hex')<>p_sha256 then raise exception 'qualification_original_observation_invalid'; end if;
 original_text:=convert_from(encoded_bytes,'UTF8');
 -- JSON input validation accepts escaped surrogate code units, but json_each
 -- eagerly decodes ALL values. First lex whole JSON strings with escape-aware
 -- tokens. A token is converted independently; punctuation never participates
 -- in replacement, so an escaped lookalike inside a valid string is preserved.
 original:=original_text::json;
 for token in select regexp_matches(original_text,$token$("(?:[^"\\]|\\.)*"|[^"]+)$token$,'g') loop
   if left(token[1],1)='"' then
     begin converted:=token[1]::jsonb;
     exception when sqlstate '22P05' or sqlstate '22021' or sqlstate '22P02' then
       pieces:=array_append(pieces,sentinel::text); changed:=true; continue; end;
   end if;
   pieces:=array_append(pieces,token[1]);
 end loop;
 safe_text:=array_to_string(pieces,'');
 original:=safe_text::json;
 if json_typeof(original) is distinct from 'object'
   or(select count(*) from json_each(original))<>(select count(distinct key) from json_each(original))
 then raise exception 'qualification_original_observation_invalid'; end if;
 for item in select * from json_each(original) loop
   if item.key in ('issues','aliases','transferredFrom','transferredTo','conflictingUserIds') then
     if json_typeof(item.value)<>'array' then raise exception 'qualification_original_array_invalid'; end if;
     items:='[]'::jsonb;
     for element in select * from jsonb_array_elements(item.value::jsonb) loop
       if element=sentinel then continue; end if;
       items:=items||jsonb_build_array(element);
     end loop;
     result:=result||jsonb_build_object(item.key,items);
   else
     converted:=item.value::jsonb;
     if converted=sentinel then converted:='null'::jsonb; end if;
     result:=result||jsonb_build_object(item.key,converted);
   end if;
 end loop;
 if changed then result:=result||jsonb_build_object('parseStatus','invalid','issues',coalesce(result->'issues','[]'::jsonb)||jsonb_build_array('invalid_unicode_observation')); end if;
 return result;
end; $$;
create function rc_qualification_capture_v1.test_store_qualification_observation(p_common jsonb,p_project text,p_app text)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare k text; customers jsonb; original_id text; transaction_id text; scoped boolean; no_economic_test boolean; complete_lineage boolean;
begin
 if jsonb_typeof(p_common) is distinct from 'object'
   or (p_common ?& array['parseStatus','issues','eventId','eventType','appId','store','environment','eventAt','userId','originalUserId',
      'aliases','productId','transactionId','originalTransactionId','transferredFrom','transferredTo','conflictingUserIds']) is not true
   or (p_common-array['parseStatus','issues','eventId','eventType','appId','store','environment','eventAt','userId','originalUserId',
      'aliases','productId','transactionId','originalTransactionId','transferredFrom','transferredTo','conflictingUserIds'])<>'{}'::jsonb
   or jsonb_typeof(p_common->'parseStatus') is distinct from 'string' or (p_common->>'parseStatus' in ('valid','invalid')) is not true
 then raise exception 'qualification_common_invalid'; end if;
 foreach k in array array['issues','aliases','transferredFrom','transferredTo','conflictingUserIds'] loop
   if jsonb_typeof(p_common->k) is distinct from 'array' then raise exception 'qualification_array_invalid'; end if;
   if exists(select 1 from jsonb_array_elements(p_common->k) x where rc_qualification_capture_v1.test_store_qualification_text(x) is not true)
   then raise exception 'qualification_array_identity_invalid'; end if;
 end loop;
 foreach k in array array['eventId','eventType','appId','store','environment','eventAt','userId','originalUserId','productId','transactionId','originalTransactionId'] loop
   if p_common->k<>'null'::jsonb and rc_qualification_capture_v1.test_store_qualification_text(p_common->k) is not true
   then raise exception 'qualification_identity_invalid'; end if;
 end loop;
 if p_common->>'parseStatus'='valid' and p_common->'issues'<>'[]'::jsonb then raise exception 'qualification_parse_invalid'; end if;
 select coalesce(jsonb_agg(value order by value collate "C"),'[]'::jsonb) into customers from (
   select distinct value from (
     select p_common->>'userId' value union all select p_common->>'originalUserId'
     union all select jsonb_array_elements_text(p_common->'aliases') union all select jsonb_array_elements_text(p_common->'transferredFrom')
     union all select jsonb_array_elements_text(p_common->'transferredTo') union all select jsonb_array_elements_text(p_common->'conflictingUserIds')
   ) ids where value is not null
 ) unique_ids;
 scoped:=p_common->>'parseStatus'='valid' and p_common->>'appId'=p_app and p_common->>'store'='TEST_STORE' and p_common->>'environment'='SANDBOX';
 if scoped is true then original_id:=p_common->>'originalTransactionId'; transaction_id:=p_common->>'transactionId'; end if;
 no_economic_test:=p_common->>'parseStatus'='valid' and p_common->>'eventType'='TEST'
   and p_common->'originalTransactionId'='null'::jsonb and p_common->'transactionId'='null'::jsonb and p_common->'productId'='null'::jsonb
   and p_common->'transferredFrom'='[]'::jsonb and p_common->'transferredTo'='[]'::jsonb and p_common->'conflictingUserIds'='[]'::jsonb
   and(p_common->>'appId' is null or p_common->>'appId'=p_app) and(p_common->>'store' is null or p_common->>'store'='TEST_STORE')
   and(p_common->>'environment' is null or p_common->>'environment'='SANDBOX');
 complete_lineage:=scoped and original_id is not null and transaction_id is not null
   and p_common->>'eventType' in ('NON_RENEWING_PURCHASE','CANCELLATION','EXPIRATION','BILLING_ISSUE','REFUND','REVOCATION')
   and p_common->>'userId' is not null and p_common->>'originalUserId'=p_common->>'userId'
   and not exists(select 1 from jsonb_array_elements_text(p_common->'aliases') a where a<>p_common->>'userId')
   and p_common->'transferredFrom'='[]'::jsonb and p_common->'transferredTo'='[]'::jsonb and p_common->'conflictingUserIds'='[]'::jsonb;
 return p_common||jsonb_build_object('protocol','test-store-qualification-observation-v1','projectId',p_project,'configuredAppId',p_app,
   'scopedOriginalTransactionId',original_id,'scopedTransactionId',transaction_id,'customerIds',customers,
   'economicLineageUnknown',not(coalesce(no_economic_test,false) or coalesce(complete_lineage,false)),
   'qualificationOnly',true,'authorityGranted',false);
end; $$;

create function rc_qualification_capture_v1.test_store_qualification_transition(p_phase text,p_connection uuid default null,p_revision integer default null,
 p_max_entries integer default 0,p_max_deliveries integer default 0,p_max_total_bytes bigint default 0)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare ctl rc_qualification_capture_v1.test_store_qualification_controls; c rc_qualification_capture_v1.test_store_qualification_connections; seal text;
begin
 perform rc_qualification_capture_v1.arm_transaction_timeout();
 select * into strict ctl from rc_qualification_capture_v1.test_store_qualification_controls where singleton for update nowait;
 if ctl.phase='disabled' and p_phase='capturing' then
   select * into strict c from rc_qualification_capture_v1.test_store_qualification_connections where id=p_connection and revision=p_revision;
   -- Independent capture owns this reservation before intake starts. Future
   -- commerce must reserve through the same registry and cannot reuse capture.
   if not exists(select 1 from rc_qualification_capture_v1.project_reservations
     where project_id=c.project_id and purpose='capture' and binding=c.id::text)
   then raise exception 'capture_project_reservation_missing'; end if;
   update rc_qualification_capture_v1.test_store_qualification_controls set phase='capturing',connection_id=c.id,connection_revision=c.revision,
     max_entries=p_max_entries,max_deliveries=p_max_deliveries,max_total_bytes=p_max_total_bytes,started_at=clock_timestamp() where singleton;
 elsif ctl.phase='capturing' and p_phase='sealed' and p_connection is null and p_revision is null
   and p_max_entries=0 and p_max_deliveries=0 and p_max_total_bytes=0 then
   select encode(sha256(convert_to(jsonb_build_object(
     'connection',to_jsonb(cn),'controls',to_jsonb(ctl),
     'entries',coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from rc_qualification_capture_v1.test_store_qualification_entries e),'[]'::jsonb),
     'deliveries',coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from rc_qualification_capture_v1.test_store_qualification_deliveries d),'[]'::jsonb),
     'exclusions',coalesce((select jsonb_agg(to_jsonb(k) order by k.project_id,k.kind,k.key) from rc_qualification_capture_v1.test_store_qualification_exclusions k),'[]'::jsonb),
     'conflicts',coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from rc_qualification_capture_v1.test_store_qualification_conflicts f),'[]'::jsonb)
   )::text,'UTF8')),'hex') into seal from rc_qualification_capture_v1.test_store_qualification_connections cn
     where cn.id=ctl.connection_id and cn.revision=ctl.connection_revision;
   update rc_qualification_capture_v1.test_store_qualification_controls set phase='sealed',sealed_at=clock_timestamp(),seal_sha256=seal where singleton;
 else raise exception 'qualification_transition_forbidden'; end if;
 return jsonb_build_object('phase',p_phase,'sealSha256',seal,'behavioralQualificationGranted',false,'economicProjectionAllowed',false);
end; $$;

create function rc_qualification_capture_v1.test_store_qualification_gate(p_project text,p_raw_sha256 text default null,p_event_id text default null,
 p_original_id text default null,p_transaction_id text default null,p_customer_id text default null)
returns text language plpgsql volatile security invoker set search_path='' as $$
declare ctl rc_qualification_capture_v1.test_store_qualification_controls; c rc_qualification_capture_v1.test_store_qualification_connections; owner_hash text;
begin
 select * into strict ctl from rc_qualification_capture_v1.test_store_qualification_controls where singleton for share nowait;
 select * into c from rc_qualification_capture_v1.test_store_qualification_connections where id=ctl.connection_id and revision=ctl.connection_revision;
 if c.project_id is distinct from p_project then return 'not_qualification'; end if;
 if ctl.phase='capturing' then return 'capture_active'; end if;
 if exists(select 1 from rc_qualification_capture_v1.test_store_qualification_entries where project_id=p_project and lineage_unknown)
   or exists(select 1 from rc_qualification_capture_v1.test_store_qualification_conflicts where project_id=p_project)
 then return 'qualification_unresolved'; end if;
 if exists(select 1 from rc_qualification_capture_v1.test_store_qualification_exclusions where project_id=p_project and kind='raw' and key=p_raw_sha256)
 then return 'qualification_replay'; end if;
 select e.raw_sha256 into owner_hash from rc_qualification_capture_v1.test_store_qualification_exclusions k
   join rc_qualification_capture_v1.test_store_qualification_entries e on e.id=k.entry_id where k.project_id=p_project and k.kind='event' and k.key=p_event_id;
 if found then
   if owner_hash is distinct from p_raw_sha256 then return 'qualification_event_conflict'; else return 'qualification_replay'; end if;
 end if;
 if exists(select 1 from rc_qualification_capture_v1.test_store_qualification_exclusions where project_id=p_project
   and((kind='original' and key=p_original_id) or(kind='transaction' and key=p_transaction_id) or(kind='customer' and key=p_customer_id)))
 then return 'qualification_economic_history'; end if;
 return 'not_qualification';
end; $$;

create function rc_qualification_capture_v1.test_store_qualification_ingest(p_connection uuid,p_revision integer,p_envelope jsonb,p_observation jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare ctl rc_qualification_capture_v1.test_store_qualification_controls; c rc_qualification_capture_v1.test_store_qualification_connections;
 evidence rc_qualification_capture_v1.test_store_qualification_entries; normalized jsonb; delivery uuid; raw_hash text; event_id text;
 outcome text:='captured'; conflict boolean:=false; added_bytes integer; k text; v text;
begin
 perform rc_qualification_capture_v1.assert_provider_service();
 select * into strict ctl from rc_qualification_capture_v1.test_store_qualification_controls where singleton for share nowait;
 if ctl.phase='disabled' or ctl.connection_id is distinct from p_connection or ctl.connection_revision is distinct from p_revision
 then raise exception 'qualification_capture_unavailable'; end if;
 select * into strict c from rc_qualification_capture_v1.test_store_qualification_connections where id=p_connection and revision=p_revision;
 if not pg_try_advisory_xact_lock(hashtextextended('rcq-capture-v1:'||c.project_id,683)) then raise exception 'qualification_capture_busy'; end if;
 if jsonb_typeof(p_envelope) is distinct from 'object' or octet_length(p_envelope::text)>4194304
   or p_envelope->>'protocol' is distinct from 'rc-router-ingress-v1'
   or p_envelope->>'storageProtocol' is distinct from 'test-store-qualification-envelope-v1'
   or jsonb_typeof(p_envelope->'originalObservationBase64') is distinct from 'string'
   or jsonb_typeof(p_envelope->'originalObservationSha256') is distinct from 'string'
   or(p_envelope-array['protocol','storageProtocol','originalObservationBase64','originalObservationSha256','rawSha256','rawByteLength','encryption','authentication','observation'])<>'{}'::jsonb
   or jsonb_typeof(p_envelope->'rawSha256') is distinct from 'string' or coalesce(p_envelope->>'rawSha256','') !~ '^[a-f0-9]{64}$'
   or jsonb_typeof(p_envelope->'rawByteLength') is distinct from 'number' or coalesce(p_envelope->>'rawByteLength','') !~ '^[1-9][0-9]{0,5}$'
   or (p_envelope->>'rawByteLength')::integer not between 1 and 262144
   or p_envelope->'authentication' is distinct from jsonb_build_object('method','shared_secret','keyVersion',c.auth_key_version)
   or p_envelope->'encryption'->>'algorithm' is distinct from 'AES-256-GCM'
   or p_envelope->'encryption'->>'keyId' is distinct from c.storage_key_id
   or jsonb_typeof(p_envelope->'encryption'->'nonce') is distinct from 'string' or coalesce(p_envelope->'encryption'->>'nonce','') !~ '^[A-Za-z0-9+/]{16}$'
   or jsonb_typeof(p_envelope->'encryption'->'ciphertext') is distinct from 'string'
   or coalesce(p_envelope->'encryption'->>'ciphertext','') !~ '^[A-Za-z0-9+/]+={0,2}$'
   or octet_length(decode(p_envelope->'encryption'->>'ciphertext','base64'))<>(p_envelope->>'rawByteLength')::integer+16
 then raise exception 'qualification_envelope_invalid'; end if;
 if p_envelope->'observation' is distinct from rc_qualification_capture_v1.test_store_qualification_safe_common(
   p_envelope->>'originalObservationBase64',p_envelope->>'originalObservationSha256')
 then raise exception 'qualification_original_normalization_mismatch'; end if;
 normalized:=rc_qualification_capture_v1.test_store_qualification_observation(p_envelope->'observation',c.project_id,c.app_id);
 if normalized is distinct from p_observation then raise exception 'qualification_normalization_mismatch'; end if;
 raw_hash:=p_envelope->>'rawSha256'; event_id:=normalized->>'eventId';
 select * into evidence from rc_qualification_capture_v1.test_store_qualification_entries where project_id=c.project_id and raw_sha256=raw_hash;
 if ctl.phase='sealed' then
   if evidence.id is null or evidence.observation is distinct from normalized then raise exception 'qualification_capture_sealed'; end if;
   outcome:='sealed_duplicate';
 else
   added_bytes:=octet_length(p_envelope::text)+octet_length(normalized::text);
   if (evidence.id is null and (select count(*) from rc_qualification_capture_v1.test_store_qualification_entries)>=ctl.max_entries)
     or(select count(*) from rc_qualification_capture_v1.test_store_qualification_deliveries)>=ctl.max_deliveries
     or coalesce((select sum(stored_bytes) from rc_qualification_capture_v1.test_store_qualification_deliveries),0)+added_bytes>ctl.max_total_bytes
   then raise exception 'qualification_capacity_exhausted'; end if;
   if evidence.id is null then
     insert into rc_qualification_capture_v1.test_store_qualification_entries(connection_id,connection_revision,project_id,raw_sha256,provider_event_id,envelope,observation,lineage_unknown)
       values(c.id,c.revision,c.project_id,raw_hash,event_id,p_envelope,normalized,(normalized->>'economicLineageUnknown')::boolean) returning * into evidence;
   else outcome:='duplicate'; conflict:=evidence.observation is distinct from normalized; end if;
   insert into rc_qualification_capture_v1.test_store_qualification_deliveries(entry_id,envelope,observation,stored_bytes)
     values(evidence.id,p_envelope,normalized,added_bytes) returning id into delivery;
   if exists(select 1 from rc_qualification_capture_v1.test_store_qualification_exclusions x
     join rc_qualification_capture_v1.test_store_qualification_entries e on e.id=x.entry_id
     where x.project_id=c.project_id and x.kind='event' and x.key=event_id and e.raw_sha256<>raw_hash)
   then conflict:=true; end if;
   if conflict then
     outcome:='conflict';
     insert into rc_qualification_capture_v1.test_store_qualification_conflicts(project_id,entry_id,delivery_id,reason)
       values(c.project_id,evidence.id,delivery,'raw_or_event_identity_conflict');
   end if;
   for k,v in select 'raw',raw_hash union all select 'event',event_id
     union all select 'original',normalized->>'scopedOriginalTransactionId' union all select 'transaction',normalized->>'scopedTransactionId'
     union all select 'customer',jsonb_array_elements_text(normalized->'customerIds') loop
     if v is not null then
       insert into rc_qualification_capture_v1.test_store_qualification_exclusions(project_id,kind,key,entry_id,delivery_id)
         values(c.project_id,k,v,evidence.id,delivery) on conflict do nothing;
     end if;
   end loop;
 end if;
 return jsonb_build_object('protocol','test-store-qualification-result-v1','entryId',evidence.id,'status',outcome,'phase',ctl.phase,
   'durable',true,'acknowledgementAllowed',true,'behavioralQualificationGranted',false,'authorityGranted',false);
end; $$;

revoke all on function rc_qualification_capture_v1.test_store_qualification_control_guard(),rc_qualification_capture_v1.test_store_qualification_text(jsonb),
 rc_qualification_capture_v1.test_store_qualification_safe_common(text,text),
 rc_qualification_capture_v1.test_store_qualification_observation(jsonb,text,text),rc_qualification_capture_v1.test_store_qualification_transition(text,uuid,integer,integer,integer,bigint),
 rc_qualification_capture_v1.test_store_qualification_gate(text,text,text,text,text,text),rc_qualification_capture_v1.test_store_qualification_ingest(uuid,integer,jsonb,jsonb)
 from public,anon,authenticated,service_role,rcq_v1_operator;
grant execute on function rc_qualification_capture_v1.test_store_qualification_transition(text,uuid,integer,integer,integer,bigint) to rcq_v1_operator;

-- Reservation is a separate deliberate operation. No real project is seeded.
-- The capture reservation is permanent even if intake never starts or is sealed.
create function rc_qualification_capture_v1.configure_capture(p_id uuid,p_revision integer,p_project text,
 p_app text,p_auth_version text,p_storage_id text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare ctl rc_qualification_capture_v1.test_store_qualification_controls;
begin
 perform rc_qualification_capture_v1.arm_transaction_timeout();
 select * into strict ctl from rc_qualification_capture_v1.test_store_qualification_controls where singleton for update nowait;
 if ctl.phase<>'disabled' or exists(select 1 from rc_qualification_capture_v1.test_store_qualification_connections)
 then raise exception 'capture_configuration_immutable'; end if;
 insert into rc_qualification_capture_v1.project_reservations(project_id,purpose,binding) values(p_project,'capture',p_id::text);
 insert into rc_qualification_capture_v1.test_store_qualification_connections(id,revision,project_id,app_id,auth_key_version,storage_key_id)
   values(p_id,p_revision,p_project,p_app,p_auth_version,p_storage_id);
 return jsonb_build_object('protocol','rcq-project-reservation-v1','purpose','capture',
   'projectId',p_project,'binding',p_id::text,'permanent',true,'authorityGranted',false);
end; $$;
-- Future installation explicitly reserves its project. Not qualification or activation.
create function rc_qualification_capture_v1.reserve_economic_project(p_project text,p_binding text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare ctl rc_qualification_capture_v1.test_store_qualification_controls;
begin
 perform rc_qualification_capture_v1.arm_transaction_timeout();
 select * into strict ctl from rc_qualification_capture_v1.test_store_qualification_controls where singleton for update nowait;
 insert into rc_qualification_capture_v1.project_reservations(project_id,purpose,binding) values(p_project,'economic',p_binding);
 return jsonb_build_object('protocol','rcq-project-reservation-v1','purpose','economic',
   'projectId',p_project,'binding',p_binding,'authorityGranted',false,'economicProjectionAllowed',false);
end; $$;
-- Only an explicitly composed future runtime gets rcq_v1_consumer membership.
-- Missing registration is unavailable, never an implicit not-capture verdict.
create function rc_qualification_capture_v1.commerce_admission(p_project text,p_binding text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare claim rc_qualification_capture_v1.project_reservations; status text; reason text;
begin
 perform rc_qualification_capture_v1.assert_consumer_context();
 -- A committed economic reservation is immutable, and the capture connection
 -- FK requires purpose=capture plus its exact UUID binding. Unrelated capture
 -- controls cannot change this project's exclusion identity and are not locked.
 select * into claim from rc_qualification_capture_v1.project_reservations where project_id=p_project for share nowait;
 status:='unavailable';
 if claim.project_id is null then reason:='project_unreserved';
 elsif claim.purpose='capture' then reason:='capture_reserved';
 elsif claim.binding is distinct from p_binding then reason:='consumer_binding_mismatch';
 else status:='not_capture'; reason:=null; end if;
 return jsonb_build_object('protocol','rcq-commerce-admission-v1','projectId',p_project,
   'consumerBinding',p_binding,'status',status,'reason',reason,'authorityGranted',false,
   'economicProjectionAllowed',false);
end; $$;
-- Retain authenticated negatives before classification; not_qualification is not
-- positive admission. commerce_admission is independently required.
create function rc_qualification_capture_v1.history_gate(p_project text,p_raw_sha256 text default null,p_event_id text default null,
 p_original_id text default null,p_transaction_id text default null,p_customer_id text default null) returns text
language plpgsql volatile security definer set search_path='' as $$
declare claim rc_qualification_capture_v1.project_reservations;
begin
 perform rc_qualification_capture_v1.assert_consumer_context();
 select * into claim from rc_qualification_capture_v1.project_reservations where project_id=p_project for share nowait;
 if claim.project_id is null then return 'project_unreserved'; end if;
 if claim.purpose='economic' then return 'not_qualification'; end if;
 return rc_qualification_capture_v1.test_store_qualification_gate(p_project,p_raw_sha256,p_event_id,p_original_id,p_transaction_id,p_customer_id);
end; $$;
revoke all on all functions in schema rc_qualification_capture_v1 from public,anon,authenticated,service_role,rcq_v1_operator,rcq_v1_consumer;
grant execute on function rc_qualification_capture_v1.configure_capture(uuid,integer,text,text,text,text),
 rc_qualification_capture_v1.test_store_qualification_transition(text,uuid,integer,integer,integer,bigint) to rcq_v1_operator;
-- Economic reservation has no runtime/operator grant in this capture package.
-- A future reviewed composition must grant exactly this function separately.
grant execute on function rc_qualification_capture_v1.commerce_admission(text,text),
 rc_qualification_capture_v1.history_gate(text,text,text,text,text,text) to rcq_v1_consumer;

reset role;
grant usage,create on schema public to rcq_v1_owner;
set local role rcq_v1_owner;
create function public.isolated_test_store_capture_ingest_v1(p_connection_id uuid,p_connection_revision integer,p_envelope jsonb,p_observation jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin perform rc_qualification_capture_v1.arm_transaction_timeout();
 return rc_qualification_capture_v1.test_store_qualification_ingest(p_connection_id,p_connection_revision,p_envelope,p_observation); end; $$;
revoke all on function public.isolated_test_store_capture_ingest_v1(uuid,integer,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.isolated_test_store_capture_ingest_v1(uuid,integer,jsonb,jsonb) to service_role;
reset role;
revoke create on schema public from rcq_v1_owner;
-- Retain only administration of the fresh roles. Runtime/operator SET access
-- requires a later explicit bounded grant; the installer is not a capture user.
grant rcq_v1_owner,rcq_v1_operator to postgres with inherit false, set false;

commit;
