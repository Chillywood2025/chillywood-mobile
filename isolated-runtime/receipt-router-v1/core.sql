-- Inactive source bundle. NOT a production migration or execution authority.
-- Install core, holds, ownership, worker, optional source bridges and finalizer
-- in ONE local transaction. Bridges have additional explicit source dependencies.
create role receipt_router_v1_owner nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant receipt_router_v1_owner to postgres with inherit true,set true;
create schema receipt_router_v1 authorization receipt_router_v1_owner;
grant usage,create on schema receipt_router_v1 to postgres;
revoke all on schema receipt_router_v1 from public,anon,authenticated,service_role;
set local role receipt_router_v1_owner;

create table receipt_router_v1.configuration (
  singleton boolean primary key default true check(singleton),
  ingress_enabled boolean not null default false,
  worker_enabled boolean not null default false,
  catalog_revision bigint not null default 1 check(catalog_revision>0),
  ownership_coverage text not null default 'incomplete' check(ownership_coverage in ('incomplete','complete'))
);
insert into receipt_router_v1.configuration(singleton) values(true);
create table receipt_router_v1.connections (
  id uuid not null,revision bigint not null check(revision>0),project_id text not null,
  auth_method text not null check(auth_method='shared_secret'),
  auth_key_version text not null,storage_key_id text not null,
  ingress_enabled boolean not null default false,
  primary key(id,revision)
);
create table receipt_router_v1.connection_revocations (
  id uuid not null,revision bigint not null,reason text not null,
  revoked_at timestamptz not null default clock_timestamp(),primary key(id,revision),
  foreign key(id,revision) references receipt_router_v1.connections(id,revision)
);
create table receipt_router_v1.receipts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null,connection_revision bigint not null,
  project_id text not null,raw_sha256 text not null check(raw_sha256~'^[a-f0-9]{64}$'),
  raw_byte_length integer not null check(raw_byte_length between 1 and 262144),
  envelope jsonb not null,received_at timestamptz not null default clock_timestamp(),
  foreign key(connection_id,connection_revision) references receipt_router_v1.connections(id,revision),
  unique(project_id,raw_sha256)
);
create table receipt_router_v1.events (
  id uuid primary key default gen_random_uuid(),project_id text not null,event_key text not null,
  provider_event_id text,first_receipt_id uuid not null references receipt_router_v1.receipts(id),
  unique(project_id,event_key)
);
create table receipt_router_v1.conflicts (
  event_id uuid not null references receipt_router_v1.events(id),
  receipt_id uuid not null references receipt_router_v1.receipts(id),
  primary key(event_id,receipt_id)
);
create table receipt_router_v1.deliveries (
  id bigint generated always as identity primary key,event_id uuid not null references receipt_router_v1.events(id),
  receipt_id uuid not null references receipt_router_v1.receipts(id),
  connection_id uuid not null,connection_revision bigint not null,
  received_at timestamptz not null default clock_timestamp(),
  foreign key(connection_id,connection_revision) references receipt_router_v1.connections(id,revision)
);
create table receipt_router_v1.subjects (
  receipt_id uuid not null references receipt_router_v1.receipts(id),
  provider_subject text not null,canonical_subject uuid,
  evidence_role text not null check(evidence_role in ('reported','original','alias','source','target','conflicting')),
  primary key(receipt_id,evidence_role,provider_subject)
);
create table receipt_router_v1.scopes (
  id uuid primary key,project_id text not null,app_id text not null,
  store text not null check(store in ('APP_STORE','PLAY_STORE')),
  environment text not null check(environment in ('SANDBOX','PRODUCTION')),
  store_app_identity text not null,
  unique(project_id,app_id,store,environment),unique(id,store_app_identity,store,environment)
);
create table receipt_router_v1.catalog (
  scope_id uuid not null references receipt_router_v1.scopes(id),product_id text not null,
  owner_domain text not null check(owner_domain in ('legacy_premium','legacy_creator','isolated_sandbox')),
  owner_generation bigint not null check(owner_generation>0),
  primary key(scope_id,product_id),unique(scope_id,product_id,owner_domain,owner_generation)
);
-- Original identity is immutable and cannot be duplicated for another buyer or
-- project. No generic runtime setter can invent historical ownership.
create table receipt_router_v1.originals (
  scope_id uuid not null,store_app_identity text not null,store text not null,environment text not null,
  original_transaction_id text not null,product_id text not null,
  owner_domain text not null,owner_generation bigint not null,
  original_buyer_id uuid not null,intent_id uuid,revision bigint not null check(revision>0),
  first_evidence_receipt_id uuid not null references receipt_router_v1.receipts(id),
  foreign key(scope_id,store_app_identity,store,environment) references receipt_router_v1.scopes(id,store_app_identity,store,environment),
  foreign key(scope_id,product_id,owner_domain,owner_generation) references receipt_router_v1.catalog(scope_id,product_id,owner_domain,owner_generation),
  primary key(store_app_identity,store,environment,original_transaction_id),
  unique(scope_id,original_transaction_id)
);
create table receipt_router_v1.jobs (
  event_id uuid primary key references receipt_router_v1.events(id),
  state text not null default 'queued' check(state in ('queued','leased','planned','reconciliation_pending')),
  lease uuid,lease_generation bigint not null default 0,lease_until timestamptz,worker_id uuid,
  snapshot_revision bigint,
  attempts integer not null default 0,next_attempt_at timestamptz not null default clock_timestamp(),
  last_reason text
);
create table receipt_router_v1.plans (
  event_id uuid not null references receipt_router_v1.events(id),lease_generation bigint not null,
  plan jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(event_id,lease_generation)
);

create function receipt_router_v1.immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'receipt_router_evidence_immutable' using errcode='42501'; end; $$;
create function receipt_router_v1.catalog_exclusive() returns trigger language plpgsql set search_path='' as $$
declare s receipt_router_v1.scopes;
begin
  select * into strict s from receipt_router_v1.scopes where id=new.scope_id;
  if not pg_try_advisory_xact_lock(hashtextextended(jsonb_build_array('receipt-router-product',s.store_app_identity,s.store,s.environment,new.product_id)::text,683))
  then raise exception 'receipt_router_catalog_busy' using errcode='55P03'; end if;
  -- The same store product cannot gain another owner by changing the RC app
  -- or project that reports it. Administrative seed data is still constrained.
  if exists(select 1 from receipt_router_v1.catalog c join receipt_router_v1.scopes x on x.id=c.scope_id
    where x.store_app_identity=s.store_app_identity and x.store=s.store and x.environment=s.environment
      and c.product_id=new.product_id and (c.owner_domain<>new.owner_domain or c.owner_generation<>new.owner_generation))
  then raise exception 'receipt_router_catalog_owner_conflict' using errcode='22023'; end if;
  return new;
end; $$;
create trigger exclusive_owner before insert on receipt_router_v1.catalog for each row execute function receipt_router_v1.catalog_exclusive();
do $install$ declare t text; begin
  foreach t in array array['configuration','connections','connection_revocations','receipts','events','conflicts','deliveries','subjects','scopes','catalog','originals','jobs','plans'] loop
    execute format('alter table receipt_router_v1.%I enable row level security',t);
    execute format('alter table receipt_router_v1.%I force row level security',t);
    execute format('create policy router_owner on receipt_router_v1.%I for all to receipt_router_v1_owner using(true) with check(true)',t);
    execute format('revoke all on receipt_router_v1.%I from public,anon,authenticated,service_role',t);
    if t not in ('configuration','jobs') then
      execute format('create trigger immutable before update or delete on receipt_router_v1.%I for each row execute function receipt_router_v1.immutable()',t);
    end if;
  end loop;
end; $install$;
revoke all on sequence receipt_router_v1.deliveries_id_seq from public,anon,authenticated,service_role;

create function receipt_router_v1.service_context() returns void language plpgsql set search_path='' as $$
declare remaining integer;
begin
  if (nullif(current_setting('request.jwt.claims',true),'')::jsonb)->>'role' is distinct from 'service_role'
    or current_setting('transaction_isolation')<>'read committed' or current_setting('transaction_timeout')<>'0'
  then raise exception 'receipt_router_service_context_invalid' using errcode='42501'; end if;
  remaining:=floor(extract(epoch from (transaction_timestamp()+interval '5 seconds'-clock_timestamp()))*1000);
  if remaining<1 or remaining>5000 then raise exception 'receipt_router_transaction_expired' using errcode='42501'; end if;
  perform set_config('transaction_timeout',remaining::text,true);
end; $$;
create function receipt_router_v1.exact_text(p text) returns boolean language sql immutable set search_path='' as $$
  select coalesce(p<>'' and p=btrim(p) and length(p)<=512 and p!~'[[:cntrl:]]',false)
$$;
create function receipt_router_v1.validate_envelope(p jsonb) returns void language plpgsql set search_path='' as $$
declare o jsonb; e jsonb; a jsonb;k text;v jsonb;
begin
  if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>1048576
    or not p ?& array['protocol','rawSha256','rawByteLength','encryption','authentication','observation']
    or p-array['protocol','rawSha256','rawByteLength','encryption','authentication','observation']<>'{}'::jsonb
    or p->>'protocol' is distinct from 'rc-router-ingress-v1'
    or jsonb_typeof(p->'rawSha256') is distinct from 'string' or p->>'rawSha256'!~'^[a-f0-9]{64}$'
    or jsonb_typeof(p->'rawByteLength') is distinct from 'number' or p->>'rawByteLength'!~'^[1-9][0-9]{0,5}$'
    or (p->>'rawByteLength')::integer>262144
  then raise exception 'receipt_router_envelope_invalid' using errcode='22023'; end if;
  e:=p->'encryption';a:=p->'authentication';o:=p->'observation';
  if jsonb_typeof(e) is distinct from 'object' or not e ?& array['algorithm','keyId','nonce','ciphertext']
    or e-array['algorithm','keyId','nonce','ciphertext']<>'{}'::jsonb or e->>'algorithm' is distinct from 'AES-256-GCM'
    or jsonb_typeof(e->'keyId') is distinct from 'string' or not receipt_router_v1.exact_text(e->>'keyId')
    or jsonb_typeof(e->'nonce') is distinct from 'string' or e->>'nonce'!~'^[A-Za-z0-9+/]{16}$'
    or jsonb_typeof(e->'ciphertext') is distinct from 'string'
    or e->>'ciphertext'!~'^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
    or octet_length(decode(e->>'nonce','base64'))<>12
    or octet_length(decode(e->>'ciphertext','base64'))<>(p->>'rawByteLength')::integer+16
    or jsonb_typeof(a) is distinct from 'object' or not a ?& array['method','keyVersion']
    or a-array['method','keyVersion']<>'{}'::jsonb or jsonb_typeof(a->'method') is distinct from 'string'
    or a->>'method' is distinct from 'shared_secret'
    or jsonb_typeof(a->'keyVersion') is distinct from 'string' or not receipt_router_v1.exact_text(a->>'keyVersion')
    or jsonb_typeof(o) is distinct from 'object'
    or not o ?& array['parseStatus','issues','eventId','eventType','appId','store','environment','eventAt','userId','originalUserId','aliases','productId','transactionId','originalTransactionId','transferredFrom','transferredTo','conflictingUserIds']
    or o-array['parseStatus','issues','eventId','eventType','appId','store','environment','eventAt','userId','originalUserId','aliases','productId','transactionId','originalTransactionId','transferredFrom','transferredTo','conflictingUserIds']<>'{}'::jsonb
    or jsonb_typeof(o->'parseStatus') is distinct from 'string' or o->>'parseStatus' not in ('valid','invalid')
  then raise exception 'receipt_router_envelope_invalid' using errcode='22023'; end if;
  foreach k in array array['eventId','eventType','appId','store','environment','eventAt','userId','originalUserId','productId','transactionId','originalTransactionId'] loop
    if jsonb_typeof(o->k)<>'null' and (jsonb_typeof(o->k)<>'string' or not receipt_router_v1.exact_text(o->>k))
    then raise exception 'receipt_router_observation_invalid' using errcode='22023'; end if;
  end loop;
  foreach k in array array['issues','aliases','transferredFrom','transferredTo','conflictingUserIds'] loop
    if jsonb_typeof(o->k)<>'array' or jsonb_array_length(o->k)>(case when k='issues' then 100 else 10000 end)
    then raise exception 'receipt_router_observation_invalid' using errcode='22023'; end if;
    for v in select value from jsonb_array_elements(o->k) loop
      if jsonb_typeof(v)<>'string' or not receipt_router_v1.exact_text(v#>>'{}')
      then raise exception 'receipt_router_observation_invalid' using errcode='22023'; end if;
    end loop;
  end loop;
  if o->>'parseStatus'='valid' and (jsonb_array_length(o->'issues')<>0 or o->>'eventId' is null or o->>'eventType' is null)
  then raise exception 'receipt_router_observation_invalid' using errcode='22023'; end if;
end; $$;

create function receipt_router_v1.ingest(p_connection_id uuid,p_connection_revision bigint,p_envelope jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c receipt_router_v1.connections;r receipt_router_v1.receipts;e receipt_router_v1.events;
  o jsonb;k text;s text;canonical uuid;v_role text;new_receipt boolean:=false;conflicted boolean;status text;
begin
  perform receipt_router_v1.validate_envelope(p_envelope);
  perform 1 from receipt_router_v1.configuration where ingress_enabled for share nowait;
  if not found then raise exception 'receipt_router_ingress_disabled' using errcode='42501'; end if;
  -- Immutable connection identity, append-only revocations and a global switch
  -- provide an off path. Reads fence concurrent revocation until this tx ends.
  lock table receipt_router_v1.connection_revocations in share mode nowait;
  select * into c from receipt_router_v1.connections where id=p_connection_id and revision=p_connection_revision for share nowait;
  if not found or not c.ingress_enabled or c.auth_method is distinct from p_envelope#>>'{authentication,method}'
    or c.auth_key_version is distinct from p_envelope#>>'{authentication,keyVersion}'
    or c.storage_key_id is distinct from p_envelope#>>'{encryption,keyId}'
    or exists(select 1 from receipt_router_v1.connection_revocations where id=c.id and revision=c.revision)
  then raise exception 'receipt_router_connection_unavailable' using errcode='42501'; end if;
  o:=p_envelope->'observation';k:=case when o->>'eventId' is null then 'hash:'||(p_envelope->>'rawSha256') else 'id:'||(o->>'eventId') end;
  if not pg_try_advisory_xact_lock(hashtextextended('receipt-router-event:'||c.project_id||':'||k,683))
  then raise exception 'receipt_router_event_busy' using errcode='55P03'; end if;
  select * into r from receipt_router_v1.receipts where project_id=c.project_id and raw_sha256=p_envelope->>'rawSha256';
  if found then
    if r.envelope->'observation' is distinct from o or r.raw_byte_length<>(p_envelope->>'rawByteLength')::integer
    then raise exception 'receipt_router_hash_observation_conflict' using errcode='22023'; end if;
  else
    insert into receipt_router_v1.receipts(connection_id,connection_revision,project_id,raw_sha256,raw_byte_length,envelope)
      values(c.id,c.revision,c.project_id,p_envelope->>'rawSha256',(p_envelope->>'rawByteLength')::integer,p_envelope) returning * into r;
    new_receipt:=true;
  end if;
  select * into e from receipt_router_v1.events where project_id=c.project_id and event_key=k;
  if not found then
    insert into receipt_router_v1.events(project_id,event_key,provider_event_id,first_receipt_id)
      values(c.project_id,k,o->>'eventId',r.id) returning * into e;
  elsif e.first_receipt_id<>r.id then
    insert into receipt_router_v1.conflicts values(e.id,r.id) on conflict do nothing;
  end if;
  insert into receipt_router_v1.deliveries(event_id,receipt_id,connection_id,connection_revision) values(e.id,r.id,c.id,c.revision);
  if new_receipt then
    for v_role,k in select * from (values('reported','userId'),('original','originalUserId'),('alias','aliases'),('source','transferredFrom'),('target','transferredTo'),('conflicting','conflictingUserIds')) f(role,key) loop
      for s in select value#>>'{}' from jsonb_array_elements(case when k in ('userId','originalUserId') then
        case when o->>k is null then '[]'::jsonb else jsonb_build_array(o->>k) end else o->k end) loop
        canonical:=case when s~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then s::uuid else null end;
        insert into receipt_router_v1.subjects values(r.id,s,canonical,v_role) on conflict do nothing;
      end loop;
    end loop;
  end if;
  insert into receipt_router_v1.jobs(event_id) values(e.id) on conflict do nothing;
  -- Holds are only honest pending evidence. No legacy enforcement is claimed.
  perform receipt_router_v1.record_pending_holds(e.id,r.id);
  conflicted:=exists(select 1 from receipt_router_v1.conflicts where event_id=e.id);
  if conflicted then
    perform receipt_router_v1.record_pending_holds(e.id,e.first_receipt_id);
    update receipt_router_v1.jobs set state='queued',lease=null,lease_until=null,worker_id=null,
      lease_generation=lease_generation+1,next_attempt_at=clock_timestamp(),last_reason='event_bytes_conflict' where event_id=e.id;
  end if;
  status:=case when conflicted then 'conflict' when new_receipt then 'recorded' else 'duplicate' end;
  return jsonb_build_object('protocol','rc-router-ingress-result-v1','receiptId',r.id,'status',status,
    'acknowledgementAllowed',not conflicted and o->>'parseStatus'='valid' and o->>'eventType'='TEST',
    'authorityGranted',false,'legacyEffectsEnforced',false);
end; $$;
revoke all on all functions in schema receipt_router_v1 from public,anon,authenticated,service_role;
reset role;
