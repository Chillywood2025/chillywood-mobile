-- Explicit v2 Test Store profile; no configuration, credential or activation.
-- Install after receipts.sql and before the v2 functions and finalizer.
set local role sbx_v1_core_owner;

create table sandbox_commerce_v1.test_store_v2_connections (
 id uuid not null, revision integer not null check(revision>0),
 project_id text not null check(project_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 app_id text not null check(app_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 scope_key text not null, economic_application_id text not null,
 provider_configuration_digest text not null check(provider_configuration_digest ~ '^[a-f0-9]{64}$'),
 auth_key_version text not null, storage_key_id text not null,
 credential_ref text not null, credential_version text not null,
 qualified boolean not null default false,
 ownership_evidence_sha256 text, delivery_evidence_sha256 text, lifecycle_evidence_sha256 text,
 provisioning_evidence_sha256 text,
 qualified_offering_state text,
 webhook_offering_representation text not null default 'unavailable'
   check(webhook_offering_representation in ('unavailable','lookup_key','provider_id')),
 refund_contract text not null default 'unavailable'
   check(refund_contract in ('unavailable','cancellation_customer_support_full_tip_v1')),
 primary key(id,revision),
 check(scope_key::jsonb=jsonb_build_array('revenuecat',project_id,app_id,'TEST_STORE','SANDBOX')),
 check(economic_application_id='rc_test_store:'||project_id||':'||app_id),
 check(not qualified or (webhook_offering_representation<>'unavailable' and qualified_offering_state is not null
   and ownership_evidence_sha256 is not null and ownership_evidence_sha256 ~ '^[a-f0-9]{64}$'
   and delivery_evidence_sha256 is not null and delivery_evidence_sha256 ~ '^[a-f0-9]{64}$'
   and lifecycle_evidence_sha256 is not null and lifecycle_evidence_sha256 ~ '^[a-f0-9]{64}$'
   and provisioning_evidence_sha256 is not null and provisioning_evidence_sha256 ~ '^[a-f0-9]{64}$'))
);
create table sandbox_commerce_v1.test_store_v2_native_profiles (
 configuration_digest text primary key check(configuration_digest ~ '^[a-f0-9]{64}$'),
 connection_id uuid not null, connection_revision integer not null,
 platform text not null check(platform in ('ios','android')), application_id text not null,
 public_sdk_key_sha256 text not null check(public_sdk_key_sha256 ~ '^[a-f0-9]{64}$'),
 storage_namespace text not null, qualified boolean not null default false,
 native_evidence_sha256 text, lifetime_evidence_sha256 text,
 foreign key(connection_id,connection_revision) references sandbox_commerce_v1.test_store_v2_connections(id,revision),
 check(not qualified or (native_evidence_sha256 is not null and native_evidence_sha256 ~ '^[a-f0-9]{64}$'
   and lifetime_evidence_sha256 is not null and lifetime_evidence_sha256 ~ '^[a-f0-9]{64}$'))
);
create table sandbox_commerce_v1.test_store_v2_products (
 catalog_id uuid primary key references sandbox_commerce_v1.catalog(id),
 connection_id uuid not null, connection_revision integer not null,
 provider_product_id text not null, store_identifier text not null,
 qualified_product_type text not null check(qualified_product_type in ('consumable','one_time')),
 qualified_one_time_consumable boolean, qualified_product_state text not null,
 amount_minor bigint not null check(amount_minor>0), currency text not null check(currency='usd'),
 qualified boolean not null default false, source_evidence_sha256 text,
 foreign key(connection_id,connection_revision) references sandbox_commerce_v1.test_store_v2_connections(id,revision),
 unique(connection_id,connection_revision,provider_product_id),
 check(qualified_product_type<>'one_time' or qualified_one_time_consumable is true),
 check(not qualified or (source_evidence_sha256 is not null and source_evidence_sha256 ~ '^[a-f0-9]{64}$'))
);
create table sandbox_commerce_v1.test_store_v2_controls (
 singleton boolean primary key default true check(singleton), connection_id uuid, connection_revision integer,
 ingress_enabled boolean not null default false, provisioning_enabled boolean not null default false,
 initiation_enabled boolean not null default false,
 max_active_plans integer not null default 0 check(max_active_plans between 0 and 32),
 requests_per_minute integer not null default 0 check(requests_per_minute between 0 and 60),
 max_pages integer not null default 0 check(max_pages between 0 and 10),
 max_response_bytes integer not null default 262144 check(max_response_bytes between 1 and 1048576),
 foreign key(connection_id,connection_revision) references sandbox_commerce_v1.test_store_v2_connections(id,revision),
 check((connection_id is null)=(connection_revision is null)),
 check(not(ingress_enabled or provisioning_enabled or initiation_enabled) or connection_id is not null),
 check(not initiation_enabled or (ingress_enabled and provisioning_enabled and max_active_plans>0))
);
insert into sandbox_commerce_v1.test_store_v2_controls(singleton) values(true);

-- Reserve the generated provider identity before admission. A rejected candidate
-- remains attached to this installation; retries cannot silently generate another.
create table sandbox_commerce_v1.test_store_v2_customer_candidates (
 project_id text not null, installation_id uuid not null, buyer_id uuid not null,
 configuration_digest text not null references sandbox_commerce_v1.test_store_v2_native_profiles(configuration_digest),
 connection_id uuid not null, connection_revision integer not null,
 provider_app_user_id text not null unique check(provider_app_user_id ~ '^scv2_teststore_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(project_id,installation_id),
 foreign key(connection_id,connection_revision) references sandbox_commerce_v1.test_store_v2_connections(id,revision)
);
create table sandbox_commerce_v1.test_store_v2_customers (
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null, installation_id uuid not null,
 configuration_digest text not null references sandbox_commerce_v1.test_store_v2_native_profiles(configuration_digest),
 connection_id uuid not null, connection_revision integer not null, project_id text not null,
 provider_app_user_id text not null unique check(provider_app_user_id ~ '^scv2_teststore_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(connection_id,connection_revision) references sandbox_commerce_v1.test_store_v2_connections(id,revision),
 unique(project_id,installation_id)
);
create table sandbox_commerce_v1.test_store_v2_plans (
 id uuid primary key default gen_random_uuid(), intent_id uuid not null unique references sandbox_commerce_v1.intents(id),
 customer_id uuid not null references sandbox_commerce_v1.test_store_v2_customers(id),
 catalog_id uuid not null references sandbox_commerce_v1.test_store_v2_products(catalog_id),
 offering_lookup_key text not null unique, package_lookup_key text not null,
 offering_display_name text not null, package_display_name text not null,
 quote jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.test_store_v2_allocations (
 id uuid primary key default gen_random_uuid(), intent_id uuid not null unique references sandbox_commerce_v1.intents(id),
 dispatch_id uuid not null unique, customer_id uuid not null references sandbox_commerce_v1.test_store_v2_customers(id),
 plan_id uuid not null unique references sandbox_commerce_v1.test_store_v2_plans(id),
 buyer_session_id uuid not null, quote jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.test_store_v2_reservations (
 customer_id uuid primary key references sandbox_commerce_v1.test_store_v2_customers(id),
 revision bigint not null default 1 check(revision between 1 and 9007199254740991),
 active_allocation_id uuid unique references sandbox_commerce_v1.test_store_v2_allocations(id)
);
create table sandbox_commerce_v1.test_store_v2_requests (
 buyer_id uuid not null, request_id uuid not null, buyer_session_id uuid not null,
 command text not null, configuration_digest text not null, payload jsonb not null,
 primary key(buyer_id,request_id)
);
create table sandbox_commerce_v1.test_store_v2_releases (
 allocation_id uuid primary key references sandbox_commerce_v1.test_store_v2_allocations(id),
 buyer_id uuid not null, request_id uuid not null, session_id uuid not null,
 reservation_revision bigint not null, disposition text not null check(disposition in ('receipt_recorded','retain_unknown')),
 receipt_id uuid references sandbox_commerce_v1.receipts(id), released_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.test_store_v2_reports (
 buyer_id uuid not null, request_id uuid not null, allocation_id uuid not null references sandbox_commerce_v1.test_store_v2_allocations(id),
 outcome text not null check(outcome in ('sdk_success','sdk_cancelled','sdk_failed','sdk_unknown')),
 transaction_hint text, reported_at timestamptz not null default clock_timestamp(), primary key(buyer_id,request_id)
);

-- A consumed send ticket is permanent. Worker lease expiry cannot recreate a POST.
create table sandbox_commerce_v1.test_store_v2_tickets (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
 plan_id uuid not null references sandbox_commerce_v1.test_store_v2_plans(id),
 operation text not null check(operation in ('create_offering','create_package','attach_product','read_offering','list_offerings','read_package','list_packages','read_product','list_package_products')),
 cursor text, ticket jsonb not null, credential_ref text not null, project_id text not null,
 previous_ticket_id uuid references sandbox_commerce_v1.test_store_v2_tickets(id),
 scan_root_ticket_id uuid not null references sandbox_commerce_v1.test_store_v2_tickets(id),
 consumed_at timestamptz not null default clock_timestamp(), valid_until timestamptz not null
);
create unique index test_store_v2_one_mutation on sandbox_commerce_v1.test_store_v2_tickets(plan_id,operation)
 where operation in ('create_offering','create_package','attach_product');
create index test_store_v2_rate on sandbox_commerce_v1.test_store_v2_tickets(credential_ref,consumed_at);
create table sandbox_commerce_v1.test_store_v2_work_leases (
 plan_id uuid primary key references sandbox_commerce_v1.test_store_v2_plans(id),
 ticket_id uuid not null references sandbox_commerce_v1.test_store_v2_tickets(id), expires_at timestamptz not null
);
create table sandbox_commerce_v1.test_store_v2_transport_evidence (
 ticket_id uuid primary key references sandbox_commerce_v1.test_store_v2_tickets(id),
 evidence jsonb not null, observation jsonb not null, evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.test_store_v2_transport_deliveries (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references sandbox_commerce_v1.test_store_v2_tickets(id),
 evidence jsonb not null, observation jsonb not null, evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.test_store_v2_object_bindings (
 plan_id uuid not null references sandbox_commerce_v1.test_store_v2_plans(id),
 kind text not null check(kind in ('offering','package')), provider_id text not null,
 ticket_id uuid not null references sandbox_commerce_v1.test_store_v2_transport_evidence(ticket_id),
 primary key(plan_id,kind), unique(kind,provider_id)
);
create table sandbox_commerce_v1.test_store_v2_registrations (
 id uuid primary key default gen_random_uuid(), plan_id uuid not null unique references sandbox_commerce_v1.test_store_v2_plans(id),
 provider_offering_id text not null unique, offering_identifier text not null unique,
 provider_package_id text not null unique, package_identifier text not null,
 provider_product_id text not null, product_id text not null, webhook_offering_key text not null unique,
 offering_evidence uuid not null references sandbox_commerce_v1.test_store_v2_transport_evidence(ticket_id),
 package_evidence uuid not null references sandbox_commerce_v1.test_store_v2_transport_evidence(ticket_id),
 attachment_evidence uuid not null references sandbox_commerce_v1.test_store_v2_transport_evidence(ticket_id),
 product_evidence uuid not null references sandbox_commerce_v1.test_store_v2_transport_evidence(ticket_id),
 registered_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.test_store_v2_ingress (
 id uuid primary key default gen_random_uuid(), connection_id uuid not null, connection_revision integer not null,
 project_id text not null, provider_event_id text, raw_sha256 text not null check(raw_sha256 ~ '^[a-f0-9]{64}$'),
 envelope jsonb not null, observation jsonb not null, received_at timestamptz not null default clock_timestamp(),
 foreign key(connection_id,connection_revision) references sandbox_commerce_v1.test_store_v2_connections(id,revision),
 unique(project_id,raw_sha256)
);
create table sandbox_commerce_v1.test_store_v2_deliveries (
 id uuid primary key default gen_random_uuid(), ingress_id uuid not null references sandbox_commerce_v1.test_store_v2_ingress(id),
 envelope jsonb not null, received_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.test_store_v2_event_keys (
 project_id text not null, provider_event_id text not null, ingress_id uuid not null references sandbox_commerce_v1.test_store_v2_ingress(id),
 primary key(project_id,provider_event_id)
);
create table sandbox_commerce_v1.test_store_v2_effects (
 ingress_id uuid primary key references sandbox_commerce_v1.test_store_v2_ingress(id),
 status text not null check(status in ('processed','held','ignored')), result jsonb not null
);
create table sandbox_commerce_v1.test_store_v2_original_bindings (
 project_id text not null, app_id text not null, original_transaction_id text not null, transaction_id text not null,
 allocation_id uuid not null unique references sandbox_commerce_v1.test_store_v2_allocations(id),
 first_ingress_id uuid not null references sandbox_commerce_v1.test_store_v2_ingress(id),
 primary key(project_id,app_id,original_transaction_id), unique(project_id,app_id,transaction_id)
);
create table sandbox_commerce_v1.test_store_v2_holds (
 id uuid primary key default gen_random_uuid(), project_id text not null,
 scope text not null check(scope in ('project','customer','original','plan')),
 customer_id uuid references sandbox_commerce_v1.test_store_v2_customers(id),
 allocation_id uuid references sandbox_commerce_v1.test_store_v2_allocations(id),
 plan_id uuid references sandbox_commerce_v1.test_store_v2_plans(id),
 ingress_id uuid references sandbox_commerce_v1.test_store_v2_ingress(id),
 ticket_id uuid references sandbox_commerce_v1.test_store_v2_tickets(id), reason text not null,
 created_at timestamptz not null default clock_timestamp(),
 check((ingress_id is null)<>(ticket_id is null)),
 check((scope='project' and customer_id is null and allocation_id is null and plan_id is null)
   or(scope='customer' and customer_id is not null and allocation_id is null and plan_id is null)
   or(scope='original' and allocation_id is not null and customer_id is null and plan_id is null)
   or(scope='plan' and plan_id is not null and customer_id is null and allocation_id is null))
);

create function sandbox_commerce_v1.test_store_v2_immutable()
returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'test_store_v2_evidence_immutable' using errcode='42501'; end; $$;
do $install$
declare t text;
begin
 foreach t in array array['connections','native_profiles','products','controls','customer_candidates','customers','plans','allocations','reservations',
   'requests','releases','reports','tickets','work_leases','transport_evidence','transport_deliveries','object_bindings','registrations','ingress','deliveries','event_keys',
   'effects','original_bindings','holds'] loop
   execute format('alter table sandbox_commerce_v1.test_store_v2_%I enable row level security',t);
   execute format('alter table sandbox_commerce_v1.test_store_v2_%I force row level security',t);
   execute format('create policy core_owner on sandbox_commerce_v1.test_store_v2_%I for all to sbx_v1_core_owner using(true) with check(true)',t);
   execute format('revoke all on table sandbox_commerce_v1.test_store_v2_%I from public,anon,authenticated,service_role',t);
   if t not in ('controls','reservations','work_leases') then
     execute format('create trigger immutable before update or delete on sandbox_commerce_v1.test_store_v2_%I for each row execute function sandbox_commerce_v1.test_store_v2_immutable()',t);
     execute format('create trigger no_truncate before truncate on sandbox_commerce_v1.test_store_v2_%I for each statement execute function sandbox_commerce_v1.test_store_v2_immutable()',t);
   end if;
 end loop;
end; $install$;

create function sandbox_commerce_v1.test_store_v2_id(p_value text,p_kind text)
returns uuid language plpgsql immutable security invoker set search_path='' as $$
begin
 if p_value is null or p_kind not in ('customer','allocation','registration')
   or p_value !~ ('^scv2_'||p_kind||'_[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
 then raise exception 'test_store_v2_identifier_invalid'; end if;
 return substring(p_value from length('scv2_'||p_kind||'_')+1)::uuid;
end; $$;
create function sandbox_commerce_v1.test_store_v2_scope_exclusive(p_project text)
returns void language plpgsql volatile security invoker set search_path='' as $$
begin
 -- Private owned data only, not deployed-body/metadata introspection. V2 cannot
 -- presume dual webhooks isolate v1 history or productless transfers.
 if sandbox_commerce_v1.test_store_qualification_gate(p_project) in ('capture_active','qualification_unresolved')
 then raise exception 'test_store_v2_qualification_not_ready'; end if;
 lock table sandbox_commerce_v1.test_store_connections in share mode nowait;
 if exists(select 1 from sandbox_commerce_v1.test_store_connections where project_id=p_project)
 then raise exception 'test_store_v2_project_has_v1_owner'; end if;
end; $$;
create function sandbox_commerce_v1.test_store_v2_is_held(p_customer uuid,p_allocation uuid default null)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
declare c sandbox_commerce_v1.test_store_v2_customers; a sandbox_commerce_v1.test_store_v2_allocations;
begin
 lock table sandbox_commerce_v1.test_store_v2_holds in share mode nowait;
 select * into strict c from sandbox_commerce_v1.test_store_v2_customers where id=p_customer;
 select * into a from sandbox_commerce_v1.test_store_v2_allocations where id=p_allocation and customer_id=c.id;
 return exists(select 1 from sandbox_commerce_v1.test_store_v2_holds h where h.project_id=c.project_id
   and(h.scope='project' or (h.scope='customer' and h.customer_id=c.id)
     or(h.scope='original' and h.allocation_id=a.id) or(h.scope='plan' and h.plan_id=a.plan_id)));
end; $$;
revoke all on function sandbox_commerce_v1.test_store_v2_immutable(),sandbox_commerce_v1.test_store_v2_id(text,text),
 sandbox_commerce_v1.test_store_v2_scope_exclusive(text),sandbox_commerce_v1.test_store_v2_is_held(uuid,uuid)
 from public,anon,authenticated,service_role;
reset role;
