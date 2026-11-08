-- Source-only disposable qualification bundle. No provider/deployment authority.
-- Install in ONE explicit transaction. No enabled configuration is seeded.
create role native_store_sandbox_v1_owner nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant native_store_sandbox_v1_owner to postgres with inherit true,set true;
create schema native_store_sandbox_v1 authorization native_store_sandbox_v1_owner;
revoke all on schema native_store_sandbox_v1 from public,anon,authenticated,service_role;
set local role native_store_sandbox_v1_owner;

create table native_store_sandbox_v1.control (
  singleton boolean primary key default true check(singleton), enabled boolean not null default false
);
insert into native_store_sandbox_v1.control values(true,false);
create table native_store_sandbox_v1.connections (
  id uuid not null, revision bigint not null check(revision>0),
  project_id text not null check(length(project_id) between 1 and 512),
  app_id text not null check(length(app_id) between 1 and 512),
  store text not null check(store in ('APP_STORE','PLAY_STORE')),
  environment text not null default 'SANDBOX' check(environment='SANDBOX'),
  auth_key_version text not null, storage_key_id text not null,
  primary key(id,revision)
);
create table native_store_sandbox_v1.revocations (
  connection_id uuid not null, connection_revision bigint not null,
  reason text not null check(length(reason)>0), recorded_at timestamptz not null default clock_timestamp(),
  primary key(connection_id,connection_revision),
  foreign key(connection_id,connection_revision) references native_store_sandbox_v1.connections(id,revision)
);
create table native_store_sandbox_v1.receipts (
  id uuid primary key default gen_random_uuid(), project_id text not null,
  raw_sha256 text not null check(raw_sha256~'^[a-f0-9]{64}$'), raw_byte_length integer not null check(raw_byte_length between 1 and 262144),
  connection_id uuid not null, connection_revision bigint not null,
  envelope jsonb not null, recorded_at timestamptz not null default clock_timestamp(),
  unique(project_id,raw_sha256),
  foreign key(connection_id,connection_revision) references native_store_sandbox_v1.connections(id,revision)
);
create table native_store_sandbox_v1.events (
  id uuid primary key default gen_random_uuid(), project_id text not null, event_key text not null,
  first_receipt_id uuid not null references native_store_sandbox_v1.receipts(id), unique(project_id,event_key)
);
create table native_store_sandbox_v1.conflicts (
  event_id uuid not null references native_store_sandbox_v1.events(id),
  receipt_id uuid not null references native_store_sandbox_v1.receipts(id), primary key(event_id,receipt_id)
);
create table native_store_sandbox_v1.deliveries (
  id uuid primary key default gen_random_uuid(), receipt_id uuid not null references native_store_sandbox_v1.receipts(id),
  event_id uuid not null references native_store_sandbox_v1.events(id),
  connection_id uuid not null, connection_revision bigint not null,
  recorded_at timestamptz not null default clock_timestamp(),
  foreign key(connection_id,connection_revision) references native_store_sandbox_v1.connections(id,revision)
);
create table native_store_sandbox_v1.consumer_dispositions (
  receipt_id uuid not null references native_store_sandbox_v1.receipts(id),
  consumer text not null check(consumer='native-store-sandbox-v1'),
  disposition text not null check(disposition='correlation_unsupported'),
  recorded_at timestamptz not null default clock_timestamp(), primary key(receipt_id,consumer)
);

create function native_store_sandbox_v1.immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'native_store_journal_immutable' using errcode='55000'; end $$;
do $$declare t text; begin
  foreach t in array array['control','connections','revocations','receipts','events','conflicts','deliveries','consumer_dispositions'] loop
    execute format('alter table native_store_sandbox_v1.%I enable row level security',t);
    execute format('alter table native_store_sandbox_v1.%I force row level security',t);
    execute format('create policy owner_only on native_store_sandbox_v1.%I for all to native_store_sandbox_v1_owner using(true) with check(true)',t);
    if t<>'control' then
      execute format('create trigger immutable before update or delete on native_store_sandbox_v1.%I for each row execute function native_store_sandbox_v1.immutable()',t);
      execute format('create trigger immutable_truncate before truncate on native_store_sandbox_v1.%I for each statement execute function native_store_sandbox_v1.immutable()',t);
    end if;
  end loop;
end $$;

create function native_store_sandbox_v1.persist(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
<<journal>>
declare c native_store_sandbox_v1.connections; r native_store_sandbox_v1.receipts; e native_store_sandbox_v1.events;
  envelope jsonb; observation jsonb; event_key text; new_receipt boolean:=false; conflicted boolean;
begin
  -- Bound every entry, including misconfigured workers. No provider/network I/O
  -- occurs inside this transaction. Lock contention fails rather than retrying.
  if current_setting('transaction_timeout')<>'0' then raise exception 'native_store_budget_already_armed'; end if;
  perform set_config('transaction_timeout','5s',true);
  perform set_config('lock_timeout','500ms',true);
  if jsonb_typeof(p) is distinct from 'object' or p->>'protocol' is distinct from 'native-store-sandbox-intake-v1'
    or p->>'correlation' is distinct from 'unsupported' or p->>'reconciliationScope' is distinct from 'project'
    or p->'durable' is distinct from 'false'::jsonb or p->'acknowledgementAllowed' is distinct from 'false'::jsonb
    or p->'dispatchAllowed' is distinct from 'false'::jsonb or p->'grantsAccess' is distinct from 'false'::jsonb
    or p->'financialAuthority' is distinct from 'false'::jsonb
    or coalesce(p->>'disposition','') not in ('purchase_unqualified','reconciliation_required')
  then raise exception 'native_store_intake_invalid' using errcode='22023'; end if;
  perform 1 from native_store_sandbox_v1.control where singleton and enabled for share nowait;
  if not found then raise exception 'native_store_journal_disabled' using errcode='42501'; end if;
  lock table native_store_sandbox_v1.revocations in share mode nowait;
  select * into c from native_store_sandbox_v1.connections where id=(p->>'connectionId')::uuid
    and revision=(p->>'connectionRevision')::bigint for share nowait;
  if not found or exists(select 1 from native_store_sandbox_v1.revocations where connection_id=c.id and connection_revision=c.revision)
    or p->>'projectId' is distinct from c.project_id
    or (p->>'scopeKey')::jsonb is distinct from jsonb_build_array('native-store-sandbox-v1','revenuecat',c.project_id,c.app_id,c.store,'SANDBOX')
  then raise exception 'native_store_connection_unavailable' using errcode='42501'; end if;
  envelope:=p->'envelope'; observation:=envelope->'observation';
  if jsonb_typeof(envelope) is distinct from 'object' or envelope->>'protocol' is distinct from 'rc-router-ingress-v1'
    or envelope->>'storageProtocol' is distinct from 'rc-router-lossless-envelope-v1'
    or envelope#>>'{authentication,method}' is distinct from 'shared_secret'
    or envelope#>>'{authentication,keyVersion}' is distinct from c.auth_key_version
    or envelope#>>'{encryption,keyId}' is distinct from c.storage_key_id
    or envelope#>>'{encryption,algorithm}' is distinct from 'AES-256-GCM'
    or coalesce(envelope#>>'{encryption,nonce}','') !~ '^[A-Za-z0-9+/]{16}$'
    or length(coalesce(envelope#>>'{encryption,ciphertext}','')) not between 24 and 349548
    or coalesce(envelope#>>'{encryption,ciphertext}','') !~ '^[A-Za-z0-9+/]+={0,2}$'
    or coalesce(envelope->>'rawSha256','') !~ '^[a-f0-9]{64}$'
    or coalesce(envelope->>'originalObservationSha256','') !~ '^[a-f0-9]{64}$'
    or length(coalesce(envelope->>'originalObservationBase64','')) not between 4 and 1398104
    or coalesce(envelope->>'originalObservationBase64','') !~ '^[A-Za-z0-9+/]+={0,2}$'
    or coalesce(envelope->>'rawByteLength','') !~ '^[1-9][0-9]{0,5}$'
    or (envelope->>'rawByteLength')::integer>262144
    or jsonb_typeof(observation) is distinct from 'object'
  then raise exception 'native_store_envelope_invalid' using errcode='22023'; end if;
  -- The service preserves bytes authenticated by the Edge boundary. Database
  -- storage is not cryptographic replay qualification; workers must decrypt and
  -- reparse before future correlation. No grant/projector exists in this bundle.
  event_key:=case when jsonb_typeof(observation->'eventId')='string' and length(observation->>'eventId') between 1 and 512
    then 'id:'||(observation->>'eventId') else 'hash:'||(envelope->>'rawSha256') end;
  if not pg_try_advisory_xact_lock(hashtextextended(jsonb_build_array('native-store-raw',c.project_id,envelope->>'rawSha256')::text,991))
    or not pg_try_advisory_xact_lock(hashtextextended(jsonb_build_array('native-store-event',c.project_id,event_key)::text,991))
  then raise exception 'native_store_journal_busy' using errcode='55P03'; end if;
  select * into r from native_store_sandbox_v1.receipts where project_id=c.project_id and raw_sha256=journal.envelope->>'rawSha256';
  if found then
    if r.raw_byte_length<>(envelope->>'rawByteLength')::integer or r.envelope->'observation' is distinct from observation
      or r.envelope->'originalObservationSha256' is distinct from envelope->'originalObservationSha256'
      or r.envelope->'originalObservationBase64' is distinct from envelope->'originalObservationBase64'
    then raise exception 'native_store_hash_observation_conflict' using errcode='22023'; end if;
  else
    insert into native_store_sandbox_v1.receipts(project_id,raw_sha256,raw_byte_length,connection_id,connection_revision,envelope)
      values(c.project_id,journal.envelope->>'rawSha256',(journal.envelope->>'rawByteLength')::integer,c.id,c.revision,journal.envelope) returning * into r;
    new_receipt:=true;
  end if;
  select * into e from native_store_sandbox_v1.events where project_id=c.project_id and events.event_key=journal.event_key;
  if not found then
    insert into native_store_sandbox_v1.events(project_id,event_key,first_receipt_id) values(c.project_id,journal.event_key,r.id) returning * into e;
  elsif e.first_receipt_id<>r.id then
    insert into native_store_sandbox_v1.conflicts values(e.id,r.id) on conflict do nothing;
  end if;
  insert into native_store_sandbox_v1.deliveries(receipt_id,event_id,connection_id,connection_revision) values(r.id,e.id,c.id,c.revision);
  insert into native_store_sandbox_v1.consumer_dispositions(receipt_id,consumer,disposition)
    values(r.id,'native-store-sandbox-v1','correlation_unsupported') on conflict do nothing;
  conflicted:=exists(select 1 from native_store_sandbox_v1.conflicts where event_id=e.id);
  return jsonb_build_object('protocol','native-store-sandbox-journal-result-v1','receiptId',r.id,
    'connectionId',c.id,'connectionRevision',c.revision,'projectId',c.project_id,'rawSha256',r.raw_sha256,
    'status',case when conflicted then 'conflict' when new_receipt then 'recorded' else 'duplicate' end,
    'durable',true,'correlation','unsupported','acknowledgementAllowed',false,'dispatchAllowed',false,'grantsAccess',false,'financialAuthority',false);
end $$;
revoke all on all tables in schema native_store_sandbox_v1 from public,anon,authenticated,service_role;
revoke all on all functions in schema native_store_sandbox_v1 from public,anon,authenticated,service_role;
reset role;

create function public.native_store_sandbox_journal_v1(p_intake jsonb) returns jsonb
language sql security definer set search_path='' as $$select native_store_sandbox_v1.persist(p_intake)$$;
alter function public.native_store_sandbox_journal_v1(jsonb) owner to native_store_sandbox_v1_owner;
revoke all on function public.native_store_sandbox_journal_v1(jsonb) from public,anon,authenticated;
grant execute on function public.native_store_sandbox_journal_v1(jsonb) to service_role;
-- Historical read-only replay is independent of the intake switch/revocation.
-- It returns ORIGINAL parent/registry evidence, never keys or purchase authority.
create function public.native_store_sandbox_journal_read_v1(p_receipt_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  select jsonb_build_object('protocol','native-store-sandbox-journal-read-v1',
    'receipt',to_jsonb(r),'registry',to_jsonb(c),
    'revoked',exists(select 1 from native_store_sandbox_v1.revocations v where v.connection_id=c.id and v.connection_revision=c.revision))
    into result from native_store_sandbox_v1.receipts r join native_store_sandbox_v1.connections c
      on c.id=r.connection_id and c.revision=r.connection_revision where r.id=p_receipt_id;
  if result is null then raise exception 'native_store_receipt_unavailable' using errcode='22023'; end if;
  return result;
end $$;
alter function public.native_store_sandbox_journal_read_v1(uuid) owner to native_store_sandbox_v1_owner;
revoke all on function public.native_store_sandbox_journal_read_v1(uuid) from public,anon,authenticated;
grant execute on function public.native_store_sandbox_journal_read_v1(uuid) to service_role;
grant native_store_sandbox_v1_owner to postgres with inherit false,set false;
