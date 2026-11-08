-- Record-only qualification bootstrap. Install after v2 core, before its
-- command/provisioning/receipt functions. No configuration or activation rows.
-- Sealing stops capture; it does not qualify behavior or enable commerce.
set local role sbx_v1_core_owner;

create table sandbox_commerce_v1.test_store_qualification_connections (
 id uuid not null, revision integer not null check(revision>0),
 project_id text not null unique check(project_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 app_id text not null check(app_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 auth_key_version text not null check(length(auth_key_version) between 1 and 512),
 storage_key_id text not null check(length(storage_key_id) between 1 and 512),
 primary key(id,revision)
);
create table sandbox_commerce_v1.test_store_qualification_controls (
 singleton boolean primary key default true check(singleton),
 phase text not null default 'disabled' check(phase in ('disabled','capturing','sealed')),
 connection_id uuid, connection_revision integer,
 max_entries integer not null default 0 check(max_entries between 0 and 256),
 max_deliveries integer not null default 0 check(max_deliveries between 0 and 1024),
 max_total_bytes bigint not null default 0 check(max_total_bytes between 0 and 67108864),
 started_at timestamptz, sealed_at timestamptz, seal_sha256 text,
 foreign key(connection_id,connection_revision) references sandbox_commerce_v1.test_store_qualification_connections(id,revision),
 check((connection_id is null)=(connection_revision is null)),
 check((phase='disabled' and connection_id is null and started_at is null and sealed_at is null and seal_sha256 is null)
   or(phase='capturing' and connection_id is not null and started_at is not null and sealed_at is null and seal_sha256 is null)
   or(phase='sealed' and connection_id is not null and started_at is not null and sealed_at is not null and seal_sha256 ~ '^[a-f0-9]{64}$' and seal_sha256 is not null)),
 check(phase='disabled' or(max_entries>0 and max_deliveries>0 and max_total_bytes>0))
);
insert into sandbox_commerce_v1.test_store_qualification_controls(singleton) values(true);
create table sandbox_commerce_v1.test_store_qualification_entries (
 id uuid primary key default gen_random_uuid(), connection_id uuid not null, connection_revision integer not null,
 project_id text not null, raw_sha256 text not null check(raw_sha256 ~ '^[a-f0-9]{64}$'), provider_event_id text,
 envelope jsonb not null, observation jsonb not null, lineage_unknown boolean not null,
 received_at timestamptz not null default clock_timestamp(),
 foreign key(connection_id,connection_revision) references sandbox_commerce_v1.test_store_qualification_connections(id,revision),
 unique(project_id,raw_sha256)
);
create table sandbox_commerce_v1.test_store_qualification_deliveries (
 id uuid primary key default gen_random_uuid(), entry_id uuid not null references sandbox_commerce_v1.test_store_qualification_entries(id),
 envelope jsonb not null, observation jsonb not null, stored_bytes integer not null check(stored_bytes>0),
 received_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.test_store_qualification_exclusions (
 project_id text not null, kind text not null check(kind in ('raw','event','original','transaction','customer')), key text not null,
 entry_id uuid not null references sandbox_commerce_v1.test_store_qualification_entries(id),
 delivery_id uuid not null references sandbox_commerce_v1.test_store_qualification_deliveries(id),
 primary key(project_id,kind,key)
);
create table sandbox_commerce_v1.test_store_qualification_conflicts (
 id uuid primary key default gen_random_uuid(), project_id text not null,
 entry_id uuid not null references sandbox_commerce_v1.test_store_qualification_entries(id),
 delivery_id uuid not null references sandbox_commerce_v1.test_store_qualification_deliveries(id),
 reason text not null, received_at timestamptz not null default clock_timestamp()
);

create function sandbox_commerce_v1.test_store_qualification_control_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op<>'UPDATE' then raise exception 'qualification_control_immutable'; end if;
 if old.phase='disabled' and new.phase='capturing' then return new; end if;
 if old.phase='capturing' and new.phase='sealed'
   and (to_jsonb(old)-array['phase','sealed_at','seal_sha256'])=(to_jsonb(new)-array['phase','sealed_at','seal_sha256']) then return new; end if;
 raise exception 'qualification_transition_forbidden';
end; $$;
create trigger monotonic before update or delete on sandbox_commerce_v1.test_store_qualification_controls
 for each row execute function sandbox_commerce_v1.test_store_qualification_control_guard();
create trigger no_truncate before truncate on sandbox_commerce_v1.test_store_qualification_controls
 for each statement execute function sandbox_commerce_v1.test_store_v2_immutable();
do $install$
declare t text;
begin
 foreach t in array array['connections','controls','entries','deliveries','exclusions','conflicts'] loop
   execute format('alter table sandbox_commerce_v1.test_store_qualification_%I enable row level security',t);
   execute format('alter table sandbox_commerce_v1.test_store_qualification_%I force row level security',t);
   execute format('create policy core_owner on sandbox_commerce_v1.test_store_qualification_%I for all to sbx_v1_core_owner using(true) with check(true)',t);
   execute format('revoke all on table sandbox_commerce_v1.test_store_qualification_%I from public,anon,authenticated,service_role,sbx_v1_operator',t);
   if t<>'controls' then
     execute format('create trigger immutable before update or delete on sandbox_commerce_v1.test_store_qualification_%I for each row execute function sandbox_commerce_v1.test_store_v2_immutable()',t);
     execute format('create trigger no_truncate before truncate on sandbox_commerce_v1.test_store_qualification_%I for each statement execute function sandbox_commerce_v1.test_store_v2_immutable()',t);
   end if;
 end loop;
end; $install$;

create function sandbox_commerce_v1.test_store_qualification_text(p_value jsonb)
returns boolean language sql immutable security invoker set search_path='' as $$
 select jsonb_typeof(p_value)='string' and length(p_value#>>'{}') between 1 and 512
   and (p_value#>>'{}')=btrim(p_value#>>'{}') and (p_value#>>'{}')!~ '[[:cntrl:]]';
$$;
-- JSON (unlike JSONB) retains escaped unpaired surrogates. Decode each scalar
-- independently so valid sibling identities survive; preserve original bytes
-- in ASCII base64 for exact authenticated AES/AAD reconstruction by the Edge.
create function sandbox_commerce_v1.test_store_qualification_safe_common(p_encoded text,p_sha256 text)
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
create function sandbox_commerce_v1.test_store_qualification_observation(p_common jsonb,p_project text,p_app text)
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
   if exists(select 1 from jsonb_array_elements(p_common->k) x where sandbox_commerce_v1.test_store_qualification_text(x) is not true)
   then raise exception 'qualification_array_identity_invalid'; end if;
 end loop;
 foreach k in array array['eventId','eventType','appId','store','environment','eventAt','userId','originalUserId','productId','transactionId','originalTransactionId'] loop
   if p_common->k<>'null'::jsonb and sandbox_commerce_v1.test_store_qualification_text(p_common->k) is not true
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

create function sandbox_commerce_v1.test_store_qualification_transition(p_phase text,p_connection uuid default null,p_revision integer default null,
 p_max_entries integer default 0,p_max_deliveries integer default 0,p_max_total_bytes bigint default 0)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare ctl sandbox_commerce_v1.test_store_qualification_controls; c sandbox_commerce_v1.test_store_qualification_connections; seal text;
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 select * into strict ctl from sandbox_commerce_v1.test_store_qualification_controls where singleton for update nowait;
 if ctl.phase='disabled' and p_phase='capturing' then
   select * into strict c from sandbox_commerce_v1.test_store_qualification_connections where id=p_connection and revision=p_revision;
   -- Freeze insertions as well as existing rows, including an absent project.
   lock table sandbox_commerce_v1.test_store_connections,sandbox_commerce_v1.test_store_v2_connections in share mode nowait;
   if exists(select 1 from sandbox_commerce_v1.test_store_connections where project_id=c.project_id)
     or exists(select 1 from sandbox_commerce_v1.test_store_v2_connections where project_id=c.project_id)
   then raise exception 'qualification_economic_project_already_configured'; end if;
   update sandbox_commerce_v1.test_store_qualification_controls set phase='capturing',connection_id=c.id,connection_revision=c.revision,
     max_entries=p_max_entries,max_deliveries=p_max_deliveries,max_total_bytes=p_max_total_bytes,started_at=clock_timestamp() where singleton;
 elsif ctl.phase='capturing' and p_phase='sealed' and p_connection is null and p_revision is null
   and p_max_entries=0 and p_max_deliveries=0 and p_max_total_bytes=0 then
   select encode(sha256(convert_to(jsonb_build_object(
     'connection',to_jsonb(cn),'controls',to_jsonb(ctl),
     'entries',coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from sandbox_commerce_v1.test_store_qualification_entries e),'[]'::jsonb),
     'deliveries',coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from sandbox_commerce_v1.test_store_qualification_deliveries d),'[]'::jsonb),
     'exclusions',coalesce((select jsonb_agg(to_jsonb(k) order by k.project_id,k.kind,k.key) from sandbox_commerce_v1.test_store_qualification_exclusions k),'[]'::jsonb),
     'conflicts',coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from sandbox_commerce_v1.test_store_qualification_conflicts f),'[]'::jsonb)
   )::text,'UTF8')),'hex') into seal from sandbox_commerce_v1.test_store_qualification_connections cn
     where cn.id=ctl.connection_id and cn.revision=ctl.connection_revision;
   update sandbox_commerce_v1.test_store_qualification_controls set phase='sealed',sealed_at=clock_timestamp(),seal_sha256=seal where singleton;
 else raise exception 'qualification_transition_forbidden'; end if;
 return jsonb_build_object('phase',p_phase,'sealSha256',seal,'behavioralQualificationGranted',false,'economicProjectionAllowed',false);
end; $$;

create function sandbox_commerce_v1.test_store_qualification_gate(p_project text,p_raw_sha256 text default null,p_event_id text default null,
 p_original_id text default null,p_transaction_id text default null,p_customer_id text default null)
returns text language plpgsql volatile security invoker set search_path='' as $$
declare ctl sandbox_commerce_v1.test_store_qualification_controls; c sandbox_commerce_v1.test_store_qualification_connections; owner_hash text;
begin
 select * into strict ctl from sandbox_commerce_v1.test_store_qualification_controls where singleton for share nowait;
 select * into c from sandbox_commerce_v1.test_store_qualification_connections where id=ctl.connection_id and revision=ctl.connection_revision;
 if c.project_id is distinct from p_project then return 'not_qualification'; end if;
 if ctl.phase='capturing' then return 'capture_active'; end if;
 if exists(select 1 from sandbox_commerce_v1.test_store_qualification_entries where project_id=p_project and lineage_unknown)
   or exists(select 1 from sandbox_commerce_v1.test_store_qualification_conflicts where project_id=p_project)
 then return 'qualification_unresolved'; end if;
 if exists(select 1 from sandbox_commerce_v1.test_store_qualification_exclusions where project_id=p_project and kind='raw' and key=p_raw_sha256)
 then return 'qualification_replay'; end if;
 select e.raw_sha256 into owner_hash from sandbox_commerce_v1.test_store_qualification_exclusions k
   join sandbox_commerce_v1.test_store_qualification_entries e on e.id=k.entry_id where k.project_id=p_project and k.kind='event' and k.key=p_event_id;
 if found then
   if owner_hash is distinct from p_raw_sha256 then return 'qualification_event_conflict'; else return 'qualification_replay'; end if;
 end if;
 if exists(select 1 from sandbox_commerce_v1.test_store_qualification_exclusions where project_id=p_project
   and((kind='original' and key=p_original_id) or(kind='transaction' and key=p_transaction_id) or(kind='customer' and key=p_customer_id)))
 then return 'qualification_economic_history'; end if;
 return 'not_qualification';
end; $$;

create function sandbox_commerce_v1.test_store_qualification_ingest(p_connection uuid,p_revision integer,p_envelope jsonb,p_observation jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare ctl sandbox_commerce_v1.test_store_qualification_controls; c sandbox_commerce_v1.test_store_qualification_connections;
 evidence sandbox_commerce_v1.test_store_qualification_entries; normalized jsonb; delivery uuid; raw_hash text; event_id text;
 outcome text:='captured'; conflict boolean:=false; added_bytes integer; k text; v text;
begin
 perform sandbox_commerce_v1.assert_provider_service();
 select * into strict ctl from sandbox_commerce_v1.test_store_qualification_controls where singleton for share nowait;
 if ctl.phase='disabled' or ctl.connection_id is distinct from p_connection or ctl.connection_revision is distinct from p_revision
 then raise exception 'qualification_capture_unavailable'; end if;
 select * into strict c from sandbox_commerce_v1.test_store_qualification_connections where id=p_connection and revision=p_revision;
 if not pg_try_advisory_xact_lock(hashtextextended('test-store-qualification:'||c.project_id,683)) then raise exception 'qualification_capture_busy'; end if;
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
 if p_envelope->'observation' is distinct from sandbox_commerce_v1.test_store_qualification_safe_common(
   p_envelope->>'originalObservationBase64',p_envelope->>'originalObservationSha256')
 then raise exception 'qualification_original_normalization_mismatch'; end if;
 normalized:=sandbox_commerce_v1.test_store_qualification_observation(p_envelope->'observation',c.project_id,c.app_id);
 if normalized is distinct from p_observation then raise exception 'qualification_normalization_mismatch'; end if;
 raw_hash:=p_envelope->>'rawSha256'; event_id:=normalized->>'eventId';
 select * into evidence from sandbox_commerce_v1.test_store_qualification_entries where project_id=c.project_id and raw_sha256=raw_hash;
 if ctl.phase='sealed' then
   if evidence.id is null or evidence.observation is distinct from normalized then raise exception 'qualification_capture_sealed'; end if;
   outcome:='sealed_duplicate';
 else
   added_bytes:=octet_length(p_envelope::text)+octet_length(normalized::text);
   if (evidence.id is null and (select count(*) from sandbox_commerce_v1.test_store_qualification_entries)>=ctl.max_entries)
     or(select count(*) from sandbox_commerce_v1.test_store_qualification_deliveries)>=ctl.max_deliveries
     or coalesce((select sum(stored_bytes) from sandbox_commerce_v1.test_store_qualification_deliveries),0)+added_bytes>ctl.max_total_bytes
   then raise exception 'qualification_capacity_exhausted'; end if;
   if evidence.id is null then
     insert into sandbox_commerce_v1.test_store_qualification_entries(connection_id,connection_revision,project_id,raw_sha256,provider_event_id,envelope,observation,lineage_unknown)
       values(c.id,c.revision,c.project_id,raw_hash,event_id,p_envelope,normalized,(normalized->>'economicLineageUnknown')::boolean) returning * into evidence;
   else outcome:='duplicate'; conflict:=evidence.observation is distinct from normalized; end if;
   insert into sandbox_commerce_v1.test_store_qualification_deliveries(entry_id,envelope,observation,stored_bytes)
     values(evidence.id,p_envelope,normalized,added_bytes) returning id into delivery;
   if exists(select 1 from sandbox_commerce_v1.test_store_qualification_exclusions x
     join sandbox_commerce_v1.test_store_qualification_entries e on e.id=x.entry_id
     where x.project_id=c.project_id and x.kind='event' and x.key=event_id and e.raw_sha256<>raw_hash)
   then conflict:=true; end if;
   if conflict then
     outcome:='conflict';
     insert into sandbox_commerce_v1.test_store_qualification_conflicts(project_id,entry_id,delivery_id,reason)
       values(c.project_id,evidence.id,delivery,'raw_or_event_identity_conflict');
   end if;
   for k,v in select 'raw',raw_hash union all select 'event',event_id
     union all select 'original',normalized->>'scopedOriginalTransactionId' union all select 'transaction',normalized->>'scopedTransactionId'
     union all select 'customer',jsonb_array_elements_text(normalized->'customerIds') loop
     if v is not null then
       insert into sandbox_commerce_v1.test_store_qualification_exclusions(project_id,kind,key,entry_id,delivery_id)
         values(c.project_id,k,v,evidence.id,delivery) on conflict do nothing;
     end if;
   end loop;
 end if;
 return jsonb_build_object('protocol','test-store-qualification-result-v1','entryId',evidence.id,'status',outcome,'phase',ctl.phase,
   'durable',true,'acknowledgementAllowed',true,'behavioralQualificationGranted',false,'authorityGranted',false);
end; $$;

revoke all on function sandbox_commerce_v1.test_store_qualification_control_guard(),sandbox_commerce_v1.test_store_qualification_text(jsonb),
 sandbox_commerce_v1.test_store_qualification_safe_common(text,text),
 sandbox_commerce_v1.test_store_qualification_observation(jsonb,text,text),sandbox_commerce_v1.test_store_qualification_transition(text,uuid,integer,integer,integer,bigint),
 sandbox_commerce_v1.test_store_qualification_gate(text,text,text,text,text,text),sandbox_commerce_v1.test_store_qualification_ingest(uuid,integer,jsonb,jsonb)
 from public,anon,authenticated,service_role,sbx_v1_operator;
grant execute on function sandbox_commerce_v1.test_store_qualification_transition(text,uuid,integer,integer,integer,bigint) to sbx_v1_operator;
reset role;
grant usage,create on schema public to sbx_v1_core_owner;
set local role sbx_v1_core_owner;
create function public.isolated_test_store_qualification_ingest_v1(p_connection_id uuid,p_connection_revision integer,p_envelope jsonb,p_observation jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin perform sandbox_commerce_v1.arm_transaction_timeout();
 return sandbox_commerce_v1.test_store_qualification_ingest(p_connection_id,p_connection_revision,p_envelope,p_observation); end; $$;
revoke all on function public.isolated_test_store_qualification_ingest_v1(uuid,integer,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.isolated_test_store_qualification_ingest_v1(uuid,integer,jsonb,jsonb) to service_role;
reset role;
revoke create on schema public from sbx_v1_core_owner;
