-- Inactive source extension. Install after receipts.sql, before permissions-finalize.sql.
-- These are independent resources; no legacy IDs, buckets, policies or grants change.
-- No ordinary runtime role can populate provider/media/scan facts or issue grants.
set local role sbx_v1_core_owner;

create table sandbox_commerce_v1.resource_versions (
 resource_id uuid not null references sandbox_commerce_v1.resources(id), revision bigint not null check(revision>0),
 creator_id uuid not null, kind text not null check(kind in ('creator_tip','paid_content','watch_party_live',
 'live_watch_party_access','live_watch_party_seat','event','channel_subscription','vip_pass','physical_merch',
 'event_auction','room_seat_auction:party_admission','room_seat_auction:stage_reserved_seat')),
 title text not null check(length(title) between 1 and 200), price_minor bigint not null check(price_minor>0),
 currency text not null check(currency ~ '^[a-z]{3}$'), created_at timestamptz not null default clock_timestamp(),
 primary key(resource_id,revision)
);
create table sandbox_commerce_v1.delivery_assets (
 id uuid primary key default gen_random_uuid(), resource_id uuid not null, resource_revision bigint not null,
 owner_id uuid not null, purpose text not null check(purpose in ('video','event_replay','merch_photo')),
 provider text not null check(provider in ('s3','cloudflare_r2','supabase_storage')), bucket text not null check(length(bucket)>0),
 object_key text not null, object_version text not null check(length(object_version)>0), incarnation uuid not null,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), byte_length bigint not null check(byte_length>0),
 state text not null default 'quarantined' check(state in ('quarantined','retained','deleted')),
 moderation text not null default 'held' check(moderation in ('clear','held','removed')),
 foreign key(resource_id,resource_revision) references sandbox_commerce_v1.resource_versions,
 unique(provider,bucket,object_key,object_version), unique(id,incarnation),
 check(starts_with(object_key,'sandbox-commerce-v1/'||owner_id||'/'||'scv1_resource_'||resource_id||'/'||'scv1_asset_'||id||'/')),
 check(object_key !~ '[\\%?#]' and object_key !~ '(^|/)(\.|\.\.|)(/|$)')
);
create table sandbox_commerce_v1.delivery_asset_scans (
 asset_id uuid not null, incarnation uuid not null, provider text not null, bucket text not null,
 object_key text not null, object_version text not null, sha256 text not null, byte_length bigint not null,
 state text not null check(state in ('clean','rejected')), scanner_version text not null check(length(scanner_version)>0),
 completed_at timestamptz not null, primary key(asset_id,incarnation),
 foreign key(asset_id,incarnation) references sandbox_commerce_v1.delivery_assets(id,incarnation)
);
create table sandbox_commerce_v1.video_terms (
 resource_id uuid not null, revision bigint not null, asset_id uuid not null references sandbox_commerce_v1.delivery_assets,
 audience text not null check(audience in ('paid','subscriber','vip')), primary key(resource_id,revision),
 foreign key(resource_id,revision) references sandbox_commerce_v1.resource_versions
);
create table sandbox_commerce_v1.room_terms (
 resource_id uuid not null, revision bigint not null, generation uuid not null unique, creator_id uuid not null,
 starts_at timestamptz not null, ends_at timestamptz not null, capacity integer not null check(capacity>0),
 seat_capacity integer not null check(seat_capacity>=0 and seat_capacity<=capacity),
 state text not null check(state in ('open','ended','canceled')),
 source_resource_id uuid, source_revision bigint,
 primary key(resource_id,revision), unique(resource_id,revision,generation),
 foreign key(resource_id,revision) references sandbox_commerce_v1.resource_versions,
 foreign key(source_resource_id,source_revision) references sandbox_commerce_v1.video_terms,
 check(isfinite(starts_at) and isfinite(ends_at) and ends_at>starts_at),
 check((source_resource_id is null)=(source_revision is null))
);
create table sandbox_commerce_v1.room_seat_terms (
 resource_id uuid not null, revision bigint not null, room_id uuid not null, room_revision bigint not null,
 room_generation uuid not null, primary key(resource_id,revision),
 foreign key(resource_id,revision) references sandbox_commerce_v1.resource_versions,
 foreign key(room_id,room_revision,room_generation) references sandbox_commerce_v1.room_terms(resource_id,revision,generation)
);
create table sandbox_commerce_v1.event_terms (
 resource_id uuid not null, revision bigint not null, generation uuid not null unique, creator_id uuid not null,
 starts_at timestamptz not null, ends_at timestamptz not null, replay_allowed boolean not null,
 replay_starts_at timestamptz, replay_ends_at timestamptz,
 state text not null check(state in ('scheduled','live','replay','ended','canceled')),
 primary key(resource_id,revision), unique(resource_id,revision,generation),
 foreign key(resource_id,revision) references sandbox_commerce_v1.resource_versions,
 check(isfinite(starts_at) and isfinite(ends_at) and ends_at>starts_at),
 check((replay_allowed and replay_starts_at is not null and replay_ends_at is not null
 and isfinite(replay_starts_at) and isfinite(replay_ends_at) and replay_ends_at>replay_starts_at)
 or (not replay_allowed and replay_starts_at is null and replay_ends_at is null))
);
create table sandbox_commerce_v1.event_outputs (
 resource_id uuid not null, revision bigint not null, generation uuid not null, output_id uuid not null unique,
 provider_namespace text not null check(provider_namespace='sandbox-commerce-v1'), provider_room_name text not null,
 state text not null check(state in ('active','ended')), replay_asset_id uuid references sandbox_commerce_v1.delivery_assets,
 primary key(resource_id,revision),
 foreign key(resource_id,revision,generation) references sandbox_commerce_v1.event_terms(resource_id,revision,generation),
 check(provider_room_name='scv1-event-scv1_resource_'||resource_id||'-'||generation)
);
create table sandbox_commerce_v1.membership_terms (
 resource_id uuid not null, revision bigint not null, duration_seconds integer not null check(duration_seconds>0 and duration_seconds<=366*86400),
 primary key(resource_id,revision), foreign key(resource_id,revision) references sandbox_commerce_v1.resource_versions
);
create table sandbox_commerce_v1.membership_inclusions (
 product_id uuid not null, product_revision bigint not null, target_id uuid not null, target_revision bigint not null,
 audience text not null check(audience in ('subscriber','vip')), active boolean not null default true,
 primary key(product_id,product_revision,target_id,target_revision),
 foreign key(product_id,product_revision) references sandbox_commerce_v1.membership_terms,
 foreign key(target_id,target_revision) references sandbox_commerce_v1.video_terms
);
create table sandbox_commerce_v1.auction_terms (
 resource_id uuid not null, revision bigint not null, lot_id uuid not null unique, target_id uuid not null,
 target_revision bigint not null, target_generation uuid not null, winner_id uuid not null,
 claim_deadline timestamptz not null, state text not null check(state in ('awarded','canceled')),
 primary key(resource_id,revision), foreign key(resource_id,revision) references sandbox_commerce_v1.resource_versions,
 foreign key(target_id,target_revision) references sandbox_commerce_v1.resource_versions
);
create table sandbox_commerce_v1.merch_variants (
 id uuid primary key default gen_random_uuid(), resource_id uuid not null, revision bigint not null,
 sku text not null check(length(sku)>0), photo_asset_id uuid not null references sandbox_commerce_v1.delivery_assets,
 stock integer not null check(stock>=0), reserved integer not null default 0 check(reserved>=0 and reserved<=stock),
 state text not null check(state in ('active','retired')), unique(resource_id,revision),
 foreign key(resource_id,revision) references sandbox_commerce_v1.resource_versions
);
create table sandbox_commerce_v1.resource_grants (
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null, product_id uuid not null, product_revision bigint not null,
 receipt_id uuid not null unique references sandbox_commerce_v1.receipts, starts_at timestamptz not null, expires_at timestamptz,
 revoked_at timestamptz, foreign key(product_id,product_revision) references sandbox_commerce_v1.resource_versions,
 check(expires_at is null or expires_at>starts_at)
);
create index resource_grants_buyer on sandbox_commerce_v1.resource_grants(buyer_id,product_id,product_revision);
create table sandbox_commerce_v1.auction_claims (
 id uuid primary key default gen_random_uuid(), lot_id uuid not null unique references sandbox_commerce_v1.auction_terms(lot_id),
 grant_id uuid not null unique references sandbox_commerce_v1.resource_grants, receipt_id uuid not null unique references sandbox_commerce_v1.receipts,
 buyer_id uuid not null, product_id uuid not null, product_revision bigint not null, target_id uuid not null, target_revision bigint not null,
 generation uuid not null, consumed_at timestamptz not null, deadline timestamptz not null,
 foreign key(product_id,product_revision) references sandbox_commerce_v1.auction_terms,
 check(consumed_at<=deadline)
);
create table sandbox_commerce_v1.room_admissions (
 id uuid primary key default gen_random_uuid(), room_id uuid not null, room_revision bigint not null, room_generation uuid not null,
 buyer_id uuid not null, session_id uuid not null, grant_id uuid not null references sandbox_commerce_v1.resource_grants,
 expires_at timestamptz not null, revoked_at timestamptz,
 foreign key(room_id,room_revision,room_generation) references sandbox_commerce_v1.room_terms(resource_id,revision,generation),
 unique(room_id,room_generation,buyer_id)
);
create table sandbox_commerce_v1.room_seats (
 id uuid primary key default gen_random_uuid(), room_id uuid not null, room_revision bigint not null, room_generation uuid not null,
 buyer_id uuid not null, grant_id uuid not null unique references sandbox_commerce_v1.resource_grants,
 state text not null check(state in ('reserved','released')), host_approved boolean not null default false,
 foreign key(room_id,room_revision,room_generation) references sandbox_commerce_v1.room_terms(resource_id,revision,generation),
 unique(room_id,room_generation,buyer_id)
);
create table sandbox_commerce_v1.merch_orders (
 id uuid primary key default gen_random_uuid(), receipt_id uuid not null unique references sandbox_commerce_v1.receipts,
 buyer_id uuid not null, product_id uuid not null, product_revision bigint not null, variant_id uuid not null references sandbox_commerce_v1.merch_variants,
 reservation_id uuid not null unique default gen_random_uuid(), quantity integer not null default 1 check(quantity=1),
 state text not null check(state in ('reserved','test_fulfilled','released','quarantined')),
 fulfillment_mode text not null default 'test_only' check(fulfillment_mode='test_only'), shipment_dispatched boolean not null default false check(not shipment_dispatched),
 foreign key(product_id,product_revision) references sandbox_commerce_v1.resource_versions
);
-- Router must commit an applicable hold before acknowledging a removal/transfer.
-- There is no caller-supplied readiness flag and no runtime generic hold setter.
create table sandbox_commerce_v1.resource_delivery_holds (
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null, receipt_id uuid references sandbox_commerce_v1.receipts,
 reason text not null, created_at timestamptz not null default clock_timestamp(), resolved_at timestamptz
);

create function sandbox_commerce_v1.protect_resource_identity() returns trigger
language plpgsql security invoker set search_path='' as $$
declare prior jsonb:=to_jsonb(old); next_row jsonb:=to_jsonb(new);
begin
 if tg_op='DELETE' or (to_jsonb(new)-coalesce(tg_argv,array[]::text[])) is distinct from (to_jsonb(old)-coalesce(tg_argv,array[]::text[]))
 then raise exception 'sandbox_resource_identity_immutable' using errcode='42501'; end if;
 if (tg_table_name='delivery_assets' and (((prior->>'state')='deleted' and (next_row->>'state')<>'deleted') or ((prior->>'moderation')='removed' and (next_row->>'moderation')<>'removed')))
 or (tg_table_name='room_terms' and (prior->>'state') in ('ended','canceled') and (next_row->>'state')<>(prior->>'state'))
 or (tg_table_name='event_terms' and (next_row->>'state')<>(prior->>'state') and not
   (((prior->>'state')='scheduled' and (next_row->>'state') in ('live','canceled')) or ((prior->>'state')='live' and (next_row->>'state') in ('replay','ended','canceled'))
    or ((prior->>'state')='replay' and (next_row->>'state') in ('ended','canceled'))))
 or (tg_table_name='event_outputs' and (prior->>'state')='ended' and (next_row->>'state')<>'ended')
 or (tg_table_name='membership_inclusions' and (prior->>'active')='false' and (next_row->>'active')='true')
 or (tg_table_name='auction_terms' and (prior->>'state')='canceled' and (next_row->>'state')<>'canceled')
 or (tg_table_name='merch_variants' and (prior->>'state')='retired' and (next_row->>'state')<>'retired')
 or (tg_table_name in ('resource_grants','room_admissions') and (to_jsonb(old)->>'revoked_at') is not null
     and (to_jsonb(new)->>'revoked_at') is distinct from (to_jsonb(old)->>'revoked_at'))
 or (tg_table_name='room_seats' and (prior->>'state')='released' and (next_row->>'state')<>'released')
 or (tg_table_name='merch_orders' and (prior->>'state')<>'reserved' and (next_row->>'state')<>(prior->>'state'))
 or (tg_table_name='resource_delivery_holds' and (to_jsonb(old)->>'resolved_at') is not null
     and (to_jsonb(new)->>'resolved_at') is distinct from (to_jsonb(old)->>'resolved_at'))
 then raise exception 'sandbox_resource_lifecycle_reversal' using errcode='42501'; end if;
 return new;
end; $$;
do $$ declare t text; begin
 foreach t in array array['resource_versions','delivery_assets','delivery_asset_scans','video_terms','room_terms','room_seat_terms',
 'event_terms','event_outputs','membership_terms','membership_inclusions','auction_terms','merch_variants','resource_grants',
 'auction_claims','room_admissions','room_seats','merch_orders','resource_delivery_holds'] loop
 execute format('alter table sandbox_commerce_v1.%I enable row level security',t);
 execute format('alter table sandbox_commerce_v1.%I force row level security',t);
 execute format('create policy core_owner on sandbox_commerce_v1.%I for all to sbx_v1_core_owner using(true) with check(true)',t);
 execute format('revoke all on sandbox_commerce_v1.%I from public,anon,authenticated,service_role',t);
 end loop;
end; $$;
create trigger immutable before update or delete on sandbox_commerce_v1.resource_versions for each row execute function sandbox_commerce_v1.protect_resource_identity();
create trigger immutable before update or delete on sandbox_commerce_v1.delivery_assets for each row execute function sandbox_commerce_v1.protect_resource_identity('state','moderation');
create trigger immutable before update or delete on sandbox_commerce_v1.delivery_asset_scans for each row execute function sandbox_commerce_v1.protect_resource_identity();
create trigger immutable before update or delete on sandbox_commerce_v1.video_terms for each row execute function sandbox_commerce_v1.protect_resource_identity();
create trigger immutable before update or delete on sandbox_commerce_v1.room_terms for each row execute function sandbox_commerce_v1.protect_resource_identity('state');
create trigger immutable before update or delete on sandbox_commerce_v1.room_seat_terms for each row execute function sandbox_commerce_v1.protect_resource_identity();
create trigger immutable before update or delete on sandbox_commerce_v1.event_terms for each row execute function sandbox_commerce_v1.protect_resource_identity('state');
create trigger immutable before update or delete on sandbox_commerce_v1.event_outputs for each row execute function sandbox_commerce_v1.protect_resource_identity('state');
create trigger immutable before update or delete on sandbox_commerce_v1.membership_terms for each row execute function sandbox_commerce_v1.protect_resource_identity();
create trigger immutable before update or delete on sandbox_commerce_v1.membership_inclusions for each row execute function sandbox_commerce_v1.protect_resource_identity('active');
create trigger immutable before update or delete on sandbox_commerce_v1.auction_terms for each row execute function sandbox_commerce_v1.protect_resource_identity('state');
create trigger immutable before update or delete on sandbox_commerce_v1.merch_variants for each row execute function sandbox_commerce_v1.protect_resource_identity('reserved','state');
create trigger immutable before update or delete on sandbox_commerce_v1.resource_grants for each row execute function sandbox_commerce_v1.protect_resource_identity('revoked_at');
create trigger immutable before update or delete on sandbox_commerce_v1.auction_claims for each row execute function sandbox_commerce_v1.protect_resource_identity();
create trigger immutable before update or delete on sandbox_commerce_v1.room_admissions for each row execute function sandbox_commerce_v1.protect_resource_identity('session_id','expires_at','revoked_at');
create trigger immutable before update or delete on sandbox_commerce_v1.room_seats for each row execute function sandbox_commerce_v1.protect_resource_identity('state','host_approved');
create trigger immutable before update or delete on sandbox_commerce_v1.merch_orders for each row execute function sandbox_commerce_v1.protect_resource_identity('state');
create trigger immutable before update or delete on sandbox_commerce_v1.resource_delivery_holds for each row execute function sandbox_commerce_v1.protect_resource_identity('resolved_at');
revoke all on function sandbox_commerce_v1.protect_resource_identity() from public,anon,authenticated,service_role;
reset role;
