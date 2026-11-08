-- Separate inactive protocol3 paid-video profile. No provider, credential or
-- activation is seeded. Install after frozen v2/qualification/resource/media
-- source and before protocol3 functions, access and the finalizer.
set local role sbx_v1_core_owner;

create table sandbox_commerce_v1.test_store_v3_connections (
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
   check(refund_contract in ('unavailable','cancellation_customer_support_full_paid_video_v1')),
 primary key(id,revision),
 check(scope_key::jsonb=jsonb_build_array('revenuecat',project_id,app_id,'TEST_STORE','SANDBOX')),
 check(economic_application_id='rc_test_store:'||project_id||':'||app_id),
 check(not qualified or (webhook_offering_representation<>'unavailable' and qualified_offering_state is not null
   and ownership_evidence_sha256 is not null and ownership_evidence_sha256 ~ '^[a-f0-9]{64}$'
   and delivery_evidence_sha256 is not null and delivery_evidence_sha256 ~ '^[a-f0-9]{64}$'
   and lifecycle_evidence_sha256 is not null and lifecycle_evidence_sha256 ~ '^[a-f0-9]{64}$'
   and provisioning_evidence_sha256 is not null and provisioning_evidence_sha256 ~ '^[a-f0-9]{64}$'))
);
create table sandbox_commerce_v1.test_store_v3_native_profiles (
 configuration_digest text primary key check(configuration_digest ~ '^[a-f0-9]{64}$'),
 connection_id uuid not null, connection_revision integer not null,
 platform text not null check(platform in ('ios','android')), application_id text not null,
 public_sdk_key_sha256 text not null check(public_sdk_key_sha256 ~ '^[a-f0-9]{64}$'),
 storage_namespace text not null, qualified boolean not null default false,
 native_evidence_sha256 text, lifetime_evidence_sha256 text,
 foreign key(connection_id,connection_revision) references sandbox_commerce_v1.test_store_v3_connections(id,revision),
 check(not qualified or (native_evidence_sha256 is not null and native_evidence_sha256 ~ '^[a-f0-9]{64}$'
   and lifetime_evidence_sha256 is not null and lifetime_evidence_sha256 ~ '^[a-f0-9]{64}$'))
);
create table sandbox_commerce_v1.test_store_v3_products (
 catalog_id uuid primary key references sandbox_commerce_v1.catalog(id),
 connection_id uuid not null, connection_revision integer not null,
 provider_product_id text not null, store_identifier text not null,
 qualified_product_type text not null check(qualified_product_type in ('consumable','one_time')),
 qualified_one_time_consumable boolean, qualified_product_state text not null,
 amount_minor bigint not null check(amount_minor>0), currency text not null check(currency='usd'),
 qualified boolean not null default false, source_evidence_sha256 text,
 foreign key(connection_id,connection_revision) references sandbox_commerce_v1.test_store_v3_connections(id,revision),
 unique(connection_id,connection_revision,provider_product_id),
 check(qualified_product_type<>'one_time' or qualified_one_time_consumable is true),
 check(not qualified or (source_evidence_sha256 is not null and source_evidence_sha256 ~ '^[a-f0-9]{64}$'))
);
create table sandbox_commerce_v1.test_store_v3_controls (
 singleton boolean primary key default true check(singleton), connection_id uuid, connection_revision integer,
 ingress_enabled boolean not null default false, provisioning_enabled boolean not null default false,
 initiation_enabled boolean not null default false,
 max_active_plans integer not null default 0 check(max_active_plans between 0 and 32),
 requests_per_minute integer not null default 0 check(requests_per_minute between 0 and 60),
 max_pages integer not null default 0 check(max_pages between 0 and 10),
 max_response_bytes integer not null default 262144 check(max_response_bytes between 1 and 1048576),
 foreign key(connection_id,connection_revision) references sandbox_commerce_v1.test_store_v3_connections(id,revision),
 check((connection_id is null)=(connection_revision is null)),
 check(not(ingress_enabled or provisioning_enabled or initiation_enabled) or connection_id is not null),
 check(not initiation_enabled or (ingress_enabled and provisioning_enabled and max_active_plans>0))
);
insert into sandbox_commerce_v1.test_store_v3_controls(singleton) values(true);

-- Reserve the generated provider identity before admission. A rejected candidate
-- remains attached to this installation; retries cannot silently generate another.
create table sandbox_commerce_v1.test_store_v3_customer_candidates (
 project_id text not null, installation_id uuid not null, buyer_id uuid not null,
 configuration_digest text not null references sandbox_commerce_v1.test_store_v3_native_profiles(configuration_digest),
 connection_id uuid not null, connection_revision integer not null,
 provider_app_user_id text not null unique check(provider_app_user_id ~ '^scv3_teststore_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(project_id,installation_id),
 foreign key(connection_id,connection_revision) references sandbox_commerce_v1.test_store_v3_connections(id,revision)
);
create table sandbox_commerce_v1.test_store_v3_customers (
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null, installation_id uuid not null,
 configuration_digest text not null references sandbox_commerce_v1.test_store_v3_native_profiles(configuration_digest),
 connection_id uuid not null, connection_revision integer not null, project_id text not null,
 provider_app_user_id text not null unique check(provider_app_user_id ~ '^scv3_teststore_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(connection_id,connection_revision) references sandbox_commerce_v1.test_store_v3_connections(id,revision),
 unique(project_id,installation_id)
);
create table sandbox_commerce_v1.test_store_v3_plans (
 id uuid primary key default gen_random_uuid(), intent_id uuid not null unique references sandbox_commerce_v1.intents(id),
 customer_id uuid not null references sandbox_commerce_v1.test_store_v3_customers(id),
 catalog_id uuid not null references sandbox_commerce_v1.test_store_v3_products(catalog_id),
 offering_lookup_key text not null unique, package_lookup_key text not null,
 offering_display_name text not null, package_display_name text not null,
 quote jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.test_store_v3_allocations (
 id uuid primary key default gen_random_uuid(), intent_id uuid not null unique references sandbox_commerce_v1.intents(id),
 dispatch_id uuid not null unique, customer_id uuid not null references sandbox_commerce_v1.test_store_v3_customers(id),
 plan_id uuid not null unique references sandbox_commerce_v1.test_store_v3_plans(id),
 buyer_session_id uuid not null, quote jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.test_store_v3_reservations (
 customer_id uuid primary key references sandbox_commerce_v1.test_store_v3_customers(id),
 revision bigint not null default 1 check(revision between 1 and 9007199254740991),
 active_allocation_id uuid unique references sandbox_commerce_v1.test_store_v3_allocations(id)
);
create table sandbox_commerce_v1.test_store_v3_requests (
 buyer_id uuid not null, request_id uuid not null, buyer_session_id uuid not null,
 command text not null, configuration_digest text not null, payload jsonb not null,
 primary key(buyer_id,request_id)
);
create table sandbox_commerce_v1.test_store_v3_preparations (
 buyer_id uuid not null, request_id uuid not null, buyer_session_id uuid not null,
 configuration_digest text not null references sandbox_commerce_v1.test_store_v3_native_profiles(configuration_digest),
 payload jsonb not null, intent_id uuid not null unique references sandbox_commerce_v1.intents(id),
 created_at timestamptz not null default clock_timestamp(), primary key(buyer_id,request_id)
);
create table sandbox_commerce_v1.test_store_v3_releases (
 allocation_id uuid primary key references sandbox_commerce_v1.test_store_v3_allocations(id),
 buyer_id uuid not null, request_id uuid not null, session_id uuid not null,
 reservation_revision bigint not null, disposition text not null check(disposition in ('receipt_recorded','retain_unknown')),
 receipt_id uuid references sandbox_commerce_v1.receipts(id), released_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.test_store_v3_reports (
 buyer_id uuid not null, request_id uuid not null, allocation_id uuid not null references sandbox_commerce_v1.test_store_v3_allocations(id),
 outcome text not null check(outcome in ('sdk_success','sdk_cancelled','sdk_failed','sdk_unknown')),
 transaction_hint text, reported_at timestamptz not null default clock_timestamp(), primary key(buyer_id,request_id)
);

-- A consumed send ticket is permanent. Worker lease expiry cannot recreate a POST.
create table sandbox_commerce_v1.test_store_v3_tickets (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
 plan_id uuid not null references sandbox_commerce_v1.test_store_v3_plans(id),
 operation text not null check(operation in ('create_offering','create_package','attach_product','read_offering','list_offerings','read_package','list_packages','read_product','list_package_products')),
 cursor text, ticket jsonb not null, credential_ref text not null, project_id text not null,
 previous_ticket_id uuid references sandbox_commerce_v1.test_store_v3_tickets(id),
 scan_root_ticket_id uuid not null references sandbox_commerce_v1.test_store_v3_tickets(id),
 consumed_at timestamptz not null default clock_timestamp(), valid_until timestamptz not null
);
create unique index test_store_v3_one_mutation on sandbox_commerce_v1.test_store_v3_tickets(plan_id,operation)
 where operation in ('create_offering','create_package','attach_product');
create index test_store_v3_rate on sandbox_commerce_v1.test_store_v3_tickets(credential_ref,consumed_at);
create table sandbox_commerce_v1.test_store_v3_work_leases (
 plan_id uuid primary key references sandbox_commerce_v1.test_store_v3_plans(id),
 ticket_id uuid not null references sandbox_commerce_v1.test_store_v3_tickets(id), expires_at timestamptz not null
);
create table sandbox_commerce_v1.test_store_v3_transport_evidence (
 ticket_id uuid primary key references sandbox_commerce_v1.test_store_v3_tickets(id),
 evidence jsonb not null, observation jsonb not null, evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.test_store_v3_transport_deliveries (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references sandbox_commerce_v1.test_store_v3_tickets(id),
 evidence jsonb not null, observation jsonb not null, evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.test_store_v3_object_bindings (
 plan_id uuid not null references sandbox_commerce_v1.test_store_v3_plans(id),
 kind text not null check(kind in ('offering','package')), provider_id text not null,
 ticket_id uuid not null references sandbox_commerce_v1.test_store_v3_transport_evidence(ticket_id),
 primary key(plan_id,kind), unique(kind,provider_id)
);
create table sandbox_commerce_v1.test_store_v3_registrations (
 id uuid primary key default gen_random_uuid(), plan_id uuid not null unique references sandbox_commerce_v1.test_store_v3_plans(id),
 provider_offering_id text not null unique, offering_identifier text not null unique,
 provider_package_id text not null unique, package_identifier text not null,
 provider_product_id text not null, product_id text not null, webhook_offering_key text not null unique,
 offering_evidence uuid not null references sandbox_commerce_v1.test_store_v3_transport_evidence(ticket_id),
 package_evidence uuid not null references sandbox_commerce_v1.test_store_v3_transport_evidence(ticket_id),
 attachment_evidence uuid not null references sandbox_commerce_v1.test_store_v3_transport_evidence(ticket_id),
 product_evidence uuid not null references sandbox_commerce_v1.test_store_v3_transport_evidence(ticket_id),
 registered_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.test_store_v3_ingress (
 id uuid primary key default gen_random_uuid(), connection_id uuid not null, connection_revision integer not null,
 project_id text not null, provider_event_id text, raw_sha256 text not null check(raw_sha256 ~ '^[a-f0-9]{64}$'),
 envelope jsonb not null, observation jsonb not null, received_at timestamptz not null default clock_timestamp(),
 foreign key(connection_id,connection_revision) references sandbox_commerce_v1.test_store_v3_connections(id,revision),
 unique(project_id,raw_sha256)
);
create table sandbox_commerce_v1.test_store_v3_deliveries (
 id uuid primary key default gen_random_uuid(), ingress_id uuid not null references sandbox_commerce_v1.test_store_v3_ingress(id),
 envelope jsonb not null, received_at timestamptz not null default clock_timestamp()
);
create table sandbox_commerce_v1.test_store_v3_event_keys (
 project_id text not null, provider_event_id text not null, ingress_id uuid not null references sandbox_commerce_v1.test_store_v3_ingress(id),
 primary key(project_id,provider_event_id)
);
create table sandbox_commerce_v1.test_store_v3_effects (
 ingress_id uuid primary key references sandbox_commerce_v1.test_store_v3_ingress(id),
 status text not null check(status in ('processed','held','ignored')), result jsonb not null
);
create table sandbox_commerce_v1.test_store_v3_original_bindings (
 project_id text not null, app_id text not null, original_transaction_id text not null, transaction_id text not null,
 allocation_id uuid not null unique references sandbox_commerce_v1.test_store_v3_allocations(id),
 first_ingress_id uuid not null references sandbox_commerce_v1.test_store_v3_ingress(id),
 primary key(project_id,app_id,original_transaction_id), unique(project_id,app_id,transaction_id)
);
create table sandbox_commerce_v1.test_store_v3_holds (
 id uuid primary key default gen_random_uuid(), project_id text not null,
 scope text not null check(scope in ('project','customer','original','plan')),
 customer_id uuid references sandbox_commerce_v1.test_store_v3_customers(id),
 allocation_id uuid references sandbox_commerce_v1.test_store_v3_allocations(id),
 plan_id uuid references sandbox_commerce_v1.test_store_v3_plans(id),
 ingress_id uuid references sandbox_commerce_v1.test_store_v3_ingress(id),
 ticket_id uuid references sandbox_commerce_v1.test_store_v3_tickets(id), reason text not null,
 created_at timestamptz not null default clock_timestamp(),
 check((ingress_id is null)<>(ticket_id is null)),
 check((scope='project' and customer_id is null and allocation_id is null and plan_id is null)
   or(scope='customer' and customer_id is not null and allocation_id is null and plan_id is null)
   or(scope='original' and allocation_id is not null and customer_id is null and plan_id is null)
   or(scope='plan' and plan_id is not null and customer_id is null and allocation_id is null))
);

create function sandbox_commerce_v1.test_store_v3_immutable()
returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'test_store_v3_evidence_immutable' using errcode='42501'; end; $$;
do $install$
declare t text;
begin
 foreach t in array array['connections','native_profiles','products','controls','customer_candidates','customers','plans','allocations','reservations',
   'requests','preparations','releases','reports','tickets','work_leases','transport_evidence','transport_deliveries','object_bindings','registrations','ingress','deliveries','event_keys',
   'effects','original_bindings','holds'] loop
   execute format('alter table sandbox_commerce_v1.test_store_v3_%I enable row level security',t);
   execute format('alter table sandbox_commerce_v1.test_store_v3_%I force row level security',t);
   execute format('create policy core_owner on sandbox_commerce_v1.test_store_v3_%I for all to sbx_v1_core_owner using(true) with check(true)',t);
   execute format('revoke all on table sandbox_commerce_v1.test_store_v3_%I from public,anon,authenticated,service_role',t);
   if t not in ('controls','reservations','work_leases') then
     execute format('create trigger immutable before update or delete on sandbox_commerce_v1.test_store_v3_%I for each row execute function sandbox_commerce_v1.test_store_v3_immutable()',t);
     execute format('create trigger no_truncate before truncate on sandbox_commerce_v1.test_store_v3_%I for each statement execute function sandbox_commerce_v1.test_store_v3_immutable()',t);
   end if;
 end loop;
end; $install$;

create function sandbox_commerce_v1.test_store_v3_id(p_value text,p_kind text)
returns uuid language plpgsql immutable security invoker set search_path='' as $$
begin
 if p_value is null or p_kind not in ('customer','allocation','registration')
   or p_value !~ ('^scv3_'||p_kind||'_[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
 then raise exception 'test_store_v3_identifier_invalid'; end if;
 return substring(p_value from length('scv3_'||p_kind||'_')+1)::uuid;
end; $$;
create function sandbox_commerce_v1.test_store_v3_scope_exclusive(p_project text)
returns void language plpgsql volatile security invoker set search_path='' as $$
begin
 -- Private owned data only. Every protocol registration and capture uses the
 -- same immutable registry; no table-lock upgrade or provider call occurs here.
 if sandbox_commerce_v1.test_store_qualification_gate(p_project) in ('capture_active','qualification_unresolved')
 then raise exception 'test_store_v3_qualification_not_ready'; end if;
 if not exists(select 1 from sandbox_commerce_v1.test_store_v3_scope_owners where project_id=p_project and protocol=3)
 then raise exception 'test_store_v3_project_not_exclusive'; end if;
end; $$;
create function sandbox_commerce_v1.test_store_v3_is_held(p_customer uuid,p_allocation uuid default null)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
declare c sandbox_commerce_v1.test_store_v3_customers; a sandbox_commerce_v1.test_store_v3_allocations;
begin
 lock table sandbox_commerce_v1.test_store_v3_holds in share mode nowait;
 select * into strict c from sandbox_commerce_v1.test_store_v3_customers where id=p_customer;
 select * into a from sandbox_commerce_v1.test_store_v3_allocations where id=p_allocation and customer_id=c.id;
 return exists(select 1 from sandbox_commerce_v1.test_store_v3_holds h where h.project_id=c.project_id
   and(h.scope='project' or (h.scope='customer' and h.customer_id=c.id)
     or(h.scope='original' and h.allocation_id=a.id) or(h.scope='plan' and h.plan_id=a.plan_id)));
end; $$;
revoke all on function sandbox_commerce_v1.test_store_v3_immutable(),sandbox_commerce_v1.test_store_v3_id(text,text),
 sandbox_commerce_v1.test_store_v3_scope_exclusive(text),sandbox_commerce_v1.test_store_v3_is_held(uuid,uuid)
 from public,anon,authenticated,service_role;

-- Monotonic ownership is shared only by these new isolated source generations.
-- A project can never be reassigned to another economic protocol, even after
-- retirement. Both registration directions and capture transitions serialize
-- using a nonblocking per-project advisory fence.
create table sandbox_commerce_v1.test_store_v3_scope_owners (
 project_id text primary key, protocol integer not null check(protocol in (1,2,3))
);
alter table sandbox_commerce_v1.test_store_v3_scope_owners enable row level security;
alter table sandbox_commerce_v1.test_store_v3_scope_owners force row level security;
create policy core_owner on sandbox_commerce_v1.test_store_v3_scope_owners
 for all to sbx_v1_core_owner using(true) with check(true);
revoke all on sandbox_commerce_v1.test_store_v3_scope_owners from public,anon,authenticated,service_role;
insert into sandbox_commerce_v1.test_store_v3_scope_owners
 select distinct project_id,1 from sandbox_commerce_v1.test_store_connections
 union select distinct project_id,2 from sandbox_commerce_v1.test_store_v2_connections;
create trigger immutable before update or delete on sandbox_commerce_v1.test_store_v3_scope_owners
 for each row execute function sandbox_commerce_v1.test_store_v3_immutable();
create trigger no_truncate before truncate on sandbox_commerce_v1.test_store_v3_scope_owners
 for each statement execute function sandbox_commerce_v1.test_store_v3_immutable();

create function sandbox_commerce_v1.test_store_v3_register_scope()
returns trigger language plpgsql security definer set search_path='' as $$
declare owner_protocol integer; desired integer; project text;
begin
 desired:=case tg_table_name when 'test_store_connections' then 1 when 'test_store_v2_connections' then 2
  when 'test_store_v3_connections' then 3 end;
 project:=new.project_id;
 if desired is null or project is null or not pg_try_advisory_xact_lock(hashtextextended('isolated-test-store-project:'||project,687))
 then raise exception 'test_store_v3_scope_busy' using errcode='55P03'; end if;
 if exists(select 1 from sandbox_commerce_v1.test_store_qualification_controls ctl
  join sandbox_commerce_v1.test_store_qualification_connections c on c.id=ctl.connection_id and c.revision=ctl.connection_revision
  where ctl.phase='capturing' and c.project_id=project)
 then raise exception 'test_store_v3_capture_active'; end if;
 insert into sandbox_commerce_v1.test_store_v3_scope_owners values(project,desired) on conflict do nothing;
 select protocol into strict owner_protocol from sandbox_commerce_v1.test_store_v3_scope_owners where project_id=project;
 if owner_protocol<>desired then raise exception 'test_store_v3_project_already_owned'; end if;
 return new;
end; $$;
create trigger protocol3_scope_registration before insert on sandbox_commerce_v1.test_store_connections
 for each row execute function sandbox_commerce_v1.test_store_v3_register_scope();
create trigger protocol3_scope_registration before insert on sandbox_commerce_v1.test_store_v2_connections
 for each row execute function sandbox_commerce_v1.test_store_v3_register_scope();
create trigger protocol3_scope_registration before insert on sandbox_commerce_v1.test_store_v3_connections
 for each row execute function sandbox_commerce_v1.test_store_v3_register_scope();

create function sandbox_commerce_v1.test_store_v3_capture_scope()
returns trigger language plpgsql security definer set search_path='' as $$
declare project text;
begin
 if new.phase='capturing' then
  select project_id into strict project from sandbox_commerce_v1.test_store_qualification_connections
   where id=new.connection_id and revision=new.connection_revision;
  if not pg_try_advisory_xact_lock(hashtextextended('isolated-test-store-project:'||project,687))
  then raise exception 'test_store_v3_scope_busy' using errcode='55P03'; end if;
  if exists(select 1 from sandbox_commerce_v1.test_store_v3_scope_owners where project_id=project)
  then raise exception 'test_store_v3_economic_project_cannot_capture'; end if;
 end if;
 return new;
end; $$;
create trigger protocol3_capture_scope before update on sandbox_commerce_v1.test_store_qualification_controls
 for each row execute function sandbox_commerce_v1.test_store_v3_capture_scope();

-- Stable history projection; current clean/published authority is checked by
-- preparation/claim separately. Retirement never substitutes different media.
create function sandbox_commerce_v1.test_store_v3_quote(i sandbox_commerce_v1.intents)
returns jsonb language sql stable security invoker set search_path='' as $$
 select sandbox_commerce_v1.test_store_quote(i)||jsonb_build_object('asset',jsonb_build_object(
  'id','scv1_asset_'||a.id,'incarnation',a.incarnation,'sha256',a.sha256,'byteLength',a.byte_length,
  'resourceRevision',a.resource_revision,'profile','scpv-mp4-h264-aac-v1'))
 from sandbox_commerce_v1.video_terms v join sandbox_commerce_v1.delivery_assets a on a.id=v.asset_id
 where v.resource_id=i.resource_id and v.revision=i.resource_revision and v.audience='paid';
$$;
create function sandbox_commerce_v1.test_store_v3_assert_media(i sandbox_commerce_v1.intents)
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
  or not route.active or route.provider<>'s3'
  or row(route.provider,route.bucket,upload.object_key,upload.object_version,upload.incarnation,upload.expected_sha256,upload.expected_byte_length)
   is distinct from row(asset.provider,asset.bucket,asset.object_key,asset.object_version,asset.incarnation,asset.sha256,asset.byte_length)
 then raise exception 'test_store_v3_current_media_required'; end if;
end; $$;
revoke all on function sandbox_commerce_v1.test_store_v3_register_scope(),sandbox_commerce_v1.test_store_v3_capture_scope(),
 sandbox_commerce_v1.test_store_v3_quote(sandbox_commerce_v1.intents),sandbox_commerce_v1.test_store_v3_assert_media(sandbox_commerce_v1.intents)
 from public,anon,authenticated,service_role;
reset role;
