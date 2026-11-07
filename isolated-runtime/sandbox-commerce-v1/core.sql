-- Reviewable install source, NOT a migration or an authorized deployment.
-- Apply the entire ordered source bundle in ONE transaction, initially disabled.
-- Every name must be fresh. No legacy function/data/policy is replaced.
create role sbx_v1_core_owner nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
create role sbx_v1_authority_owner nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
create role sbx_v1_operator nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
-- Managed postgres is not a superuser. CREATEROLE alone does not establish
-- usable membership of the new owners. These are only fresh module roles.
grant sbx_v1_core_owner,sbx_v1_authority_owner to postgres with inherit true, set true;
create schema sandbox_commerce_v1 authorization sbx_v1_core_owner;
grant usage,create on schema sandbox_commerce_v1 to postgres;
revoke all on schema sandbox_commerce_v1 from public, anon, authenticated, service_role;
grant usage, create on schema sandbox_commerce_v1 to sbx_v1_authority_owner;
set local role sbx_v1_core_owner;

create table sandbox_commerce_v1.lifecycle (
  singleton boolean primary key default true check(singleton),
  state text not null default 'disabled' check(state in ('disabled','active','retired')),
  changed_at timestamptz not null default clock_timestamp()
);
insert into sandbox_commerce_v1.lifecycle(singleton) values(true);

-- No cross-schema foreign keys: implicit legacy tuple locks would invalidate
-- the SHARE/NOWAIT authority protocol. Identity is checked by the authority API.
create table sandbox_commerce_v1.declarations (
  user_id uuid primary key, session_id uuid not null,
  declared_18_plus boolean not null, country_code text not null,
  region_code text, declaration_version text not null,
  updated_at timestamptz not null default clock_timestamp()
);
-- Accepted semantic changes, separate from request-level idempotency records.
-- Negative evidence is retained even when positive changes exhaust their quota.
-- No Auth FK/cascade or generic runtime purge can rewrite this history.
create table sandbox_commerce_v1.declaration_history (
  id bigint generated always as identity primary key,
  user_id uuid not null, session_id uuid not null, request_id uuid not null,
  declared_18_plus boolean not null, country_code text not null,
  region_code text, declaration_version text not null,
  positive_declaration boolean generated always as
    (declared_18_plus and country_code='US' and declaration_version='adult-us-creator-v1'
      and coalesce(region_code in
        ('AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'),false)) stored,
  declared_at timestamptz not null default clock_timestamp(),
  unique(user_id,request_id)
);
create index declaration_history_recent_positive on sandbox_commerce_v1.declaration_history(user_id,declared_at desc)
  where positive_declaration;
create function sandbox_commerce_v1.guard_declaration_history()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  raise exception 'sandbox_declaration_history_immutable' using errcode='42501';
end; $$;
create trigger declaration_history_immutable before update or delete on sandbox_commerce_v1.declaration_history
  for each row execute function sandbox_commerce_v1.guard_declaration_history();
revoke all on sequence sandbox_commerce_v1.declaration_history_id_seq from public,anon,authenticated,service_role;
create table sandbox_commerce_v1.resources (
  id uuid primary key default gen_random_uuid(), creator_id uuid not null,
  kind text not null check(kind in ('creator_tip','paid_content','event','watch_party_live',
    'live_watch_party_access','live_watch_party_seat','channel_subscription','vip_pass',
    'physical_merch','event_auction','room_seat_auction:party_admission','room_seat_auction:stage_reserved_seat')),
  title text not null check(length(title) between 1 and 200),
  revision bigint not null default 1 check(revision>0),
  status text not null default 'draft' check(status in ('draft','quarantined','published','retired')),
  created_at timestamptz not null default clock_timestamp()
);
create index resources_creator on sandbox_commerce_v1.resources(creator_id,id);

-- These immutable bindings require a separately qualified provider/media path.
-- There is deliberately NO user-facing or generic service setter for them.
-- A claimed readiness hash or a client URL must never populate these tables.
create table sandbox_commerce_v1.catalog (
  id uuid primary key, kind text not null,
  provider text not null check(provider in ('revenuecat','stripe')),
  scope_key text not null, store text not null, product_id text not null,
  amount_minor bigint not null check(amount_minor>0),
  currency text not null check(currency ~ '^[a-z]{3}$'),
  unique(provider,scope_key,store,product_id),
  unique(kind,amount_minor,currency)
);
create table sandbox_commerce_v1.resource_bindings (
  resource_id uuid primary key references sandbox_commerce_v1.resources(id),
  resource_revision bigint not null,
  binding_version text not null,
  -- Destination issuance also needs a mode-specific Edge authorization adapter.
  provider_namespace text not null,
  immutable_asset_key text not null,
  quarantined boolean not null default true
);
create table sandbox_commerce_v1.offers (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references sandbox_commerce_v1.resources(id),
  resource_revision bigint not null,
  catalog_id uuid not null references sandbox_commerce_v1.catalog(id),
  revision bigint not null default 1 check(revision>0),
  status text not null default 'published' check(status in ('draft','published','retired')),
  created_at timestamptz not null default clock_timestamp()
);
create index offers_resource on sandbox_commerce_v1.offers(resource_id,id);
create table sandbox_commerce_v1.intents (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null, buyer_session_id uuid not null,
  offer_id uuid not null references sandbox_commerce_v1.offers(id),
  offer_revision bigint not null, resource_id uuid not null,
  resource_revision bigint not null, creator_id uuid not null,
  kind text not null, provider text not null, scope_key text not null,
  store text not null, product_id text not null,
  amount_minor bigint not null, currency text not null,
  state text not null default 'prepared' check(state in
    ('prepared','provider_pending','verified','failed','expired')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '15 minutes',
  -- Neither preparation nor a cached provider_pending status authorizes dispatch.
  dispatch_id uuid unique, dispatched_at timestamptz,
  unique(buyer_id,id)
);
create index intents_subject on sandbox_commerce_v1.intents(buyer_id,id);
create table sandbox_commerce_v1.requests (
  user_id uuid not null, request_id uuid not null, session_id uuid not null,
  command text not null, payload jsonb not null,
  result jsonb not null, created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,request_id)
);
create table sandbox_commerce_v1.receipts (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null references sandbox_commerce_v1.intents(id),
  provider text not null, scope_key text not null, store text not null,
  product_id text not null, transaction_id text not null, original_transaction_id text not null,
  state text not null check(state in ('verified','refunded','revoked','quarantined')),
  purchased_at timestamptz not null, expires_at timestamptz,
  last_event_at timestamptz not null,
  unique(provider,scope_key,store,transaction_id)
);
create table sandbox_commerce_v1.transaction_owners (
  provider text not null, scope_key text not null, store text not null,
  original_transaction_id text not null,
  buyer_id uuid not null, product_id text not null,
  primary key(provider,scope_key,store,original_transaction_id)
);
create table sandbox_commerce_v1.receipt_events (
  provider text not null, scope_key text not null, event_id text not null,
  payload jsonb not null, receipt_id uuid not null,
  primary key(provider,scope_key,event_id)
);
create table sandbox_commerce_v1.grants (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null, resource_id uuid not null, resource_revision bigint not null,
  receipt_id uuid not null unique references sandbox_commerce_v1.receipts(id),
  starts_at timestamptz not null, expires_at timestamptz,
  revoked_at timestamptz
);
create index grants_delivery on sandbox_commerce_v1.grants(buyer_id,resource_id,resource_revision);

-- Each own table is protected even if the schema is accidentally exposed.
-- Runtime roles have NO direct table privileges, including the service role.
do $install$
declare t text;
begin
  foreach t in array array['lifecycle','declarations','declaration_history','resources','catalog','resource_bindings',
    'offers','intents','requests','receipts','transaction_owners','receipt_events','grants'] loop
    execute format('alter table sandbox_commerce_v1.%I enable row level security',t);
    execute format('alter table sandbox_commerce_v1.%I force row level security',t);
    execute format('create policy core_owner on sandbox_commerce_v1.%I for all to sbx_v1_core_owner using (true) with check (true)',t);
    execute format('revoke all on table sandbox_commerce_v1.%I from public,anon,authenticated,service_role',t);
  end loop;
end;
$install$;

-- Called ONCE by each public RPC wrapper before any lifecycle/authority lock.
-- A function SET clause for this parameter would undo the timer at return.
-- Reject positive contexts: their active alarm may disagree with the visible
-- value, so resetting/re-arming could weaken a pre-existing stricter timeout.
create function sandbox_commerce_v1.arm_transaction_timeout()
returns void language plpgsql volatile security invoker set search_path='' as $$
declare remaining_ms integer;
begin
  if current_setting('transaction_timeout') is distinct from '0'
    or current_setting('transaction_isolation') is distinct from 'read committed'
  then raise exception 'sandbox_timeout_context_invalid' using errcode='42501'; end if;
  remaining_ms:=floor(extract(epoch from
    (transaction_timestamp()+interval '5 seconds'-clock_timestamp()))*1000);
  if remaining_ms<1 or remaining_ms>5000 then
    raise exception 'sandbox_transaction_context_invalid' using errcode='42501'; end if;
  perform set_config('transaction_timeout',remaining_ms::text,true);
end; $$;

create function sandbox_commerce_v1.assert_generation(p_initiation boolean)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare s text;
begin
  if current_setting('transaction_isolation') <> 'read committed'
    or clock_timestamp() >= transaction_timestamp()+interval '5 seconds'
  then raise exception 'sandbox_transaction_context_invalid' using errcode='42501'; end if;
  select state into strict s from sandbox_commerce_v1.lifecycle where singleton for share nowait;
  if p_initiation and s <> 'active' then
    raise exception 'sandbox_generation_inactive' using errcode='42501';
  end if;
end; $$;

create function sandbox_commerce_v1.assert_fresh(p_authority jsonb)
returns void language plpgsql volatile security invoker set search_path='' as $$
begin
  if p_authority is null or (p_authority->>'valid_until')::timestamptz is null
    or clock_timestamp() >= (p_authority->>'valid_until')::timestamptz
  then raise exception 'sandbox_authority_expired' using errcode='42501'; end if;
end; $$;

create function sandbox_commerce_v1.identifier(p_value text,p_type text)
returns uuid language plpgsql immutable security invoker set search_path='' as $$
begin
  if p_type not in ('resource','offer','intent','receipt','grant')
    or p_value is null or p_value !~ ('^scv1_'||p_type||'_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  then raise exception 'sandbox_versioned_identifier_required' using errcode='22023'; end if;
  return substring(p_value from length('scv1_'||p_type||'_')+1)::uuid;
end; $$;

create function sandbox_commerce_v1.resource_json(r sandbox_commerce_v1.resources)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id','scv1_resource_'||r.id,'creatorId',r.creator_id,
    'kind',r.kind,'revision',r.revision,'status',r.status);
$$;
create function sandbox_commerce_v1.offer_json(o sandbox_commerce_v1.offers)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id','scv1_offer_'||o.id,'resourceId','scv1_resource_'||o.resource_id,
    'kind',r.kind,'revision',o.revision,'status',o.status,
    'amountMinor',c.amount_minor,'currency',c.currency)
  from sandbox_commerce_v1.resources r,sandbox_commerce_v1.catalog c
  where r.id=o.resource_id and c.id=o.catalog_id;
$$;
create function sandbox_commerce_v1.intent_json(i sandbox_commerce_v1.intents)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id','scv1_intent_'||i.id,'offerId','scv1_offer_'||i.offer_id,
    'resourceId','scv1_resource_'||i.resource_id,'kind',i.kind,'status',i.state,
    'providerDispatchAllowed',false);
$$;

-- Forward-only lifecycle. A retired generation can never be reactivated.
-- Finalization removes inherited/SET access. Installer ADMIN-only membership
-- allows separately authorized future provisioning; it is not runtime access.
create function sandbox_commerce_v1.transition(p_expected text,p_next text)
returns text language plpgsql volatile security definer set search_path='' as $$
declare s text;
begin
  perform sandbox_commerce_v1.arm_transaction_timeout();
  select state into strict s from sandbox_commerce_v1.lifecycle where singleton for update nowait;
  if s is distinct from p_expected or not
    ((s='disabled' and p_next in ('active','retired')) or (s='active' and p_next='retired'))
  then raise exception 'sandbox_generation_transition_rejected' using errcode='42501'; end if;
  update sandbox_commerce_v1.lifecycle set state=p_next,changed_at=clock_timestamp() where singleton;
  return p_next;
end; $$;
revoke all on all functions in schema sandbox_commerce_v1 from public,anon,authenticated,service_role,sbx_v1_operator;
grant usage on schema sandbox_commerce_v1 to sbx_v1_operator;
grant execute on function sandbox_commerce_v1.transition(text,text) to sbx_v1_operator;
reset role;
