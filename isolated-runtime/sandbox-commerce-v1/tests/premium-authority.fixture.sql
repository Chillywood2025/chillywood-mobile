-- Disposable native-test fixture ONLY. Not a deployment/bootstrap schema.
-- Explicit projections of all ten Premium fact tables; no Auth/RLS/provider
-- implementation claims. Runtime must supply its own account/session boundary.
create table public.user_entitlements (
  user_id text not null, entitlement_key text not null, source text, status text,
  revoked_at timestamptz, starts_at timestamptz, expires_at timestamptz, metadata jsonb,
  primary key (user_id, entitlement_key)
);
create table public.access_grants (
  id uuid primary key, user_id uuid, grant_type text, provider_event_id uuid,
  product_id uuid, provider text, environment text, status text,
  starts_at timestamptz, expires_at timestamptz, revoked_at timestamptz, refunded_at timestamptz
);
create table public.provider_events (
  id uuid primary key, provider_event_id text, provider text, product_id uuid,
  user_id uuid, environment text, status text, event_type text, occurred_at timestamptz,
  created_at timestamptz, raw_payload_hash text, metadata jsonb
);
create table public.revenuecat_premium_transaction_authority (
  id uuid primary key, provider text, original_transaction_id text, user_id uuid,
  environment text, current_product_id uuid, current_provider_product_id text,
  current_provider_base_plan_id text, latest_event_id text, latest_event_hash text,
  authority_state text, first_event_id text, first_event_hash text, latest_event_type text,
  latest_occurred_at timestamptz, created_at timestamptz, product_change_projection_event_id text
);
create table public.monetization_products (id uuid primary key, product_type text);
create table public.revenuecat_terminal_authority_quarantines (
  id uuid primary key, provider_scope text, user_id uuid, environment_scope text,
  event_type text, reason text, created_at timestamptz
);
create table public.revenuecat_terminal_authority_quarantine_resolutions (quarantine_id uuid);
create table public.revenuecat_consumable_transaction_intents (provider text, original_transaction_id text);
create table public.revenuecat_unbound_initial_authority (provider text, original_transaction_id text);
create table public.revenuecat_unbound_terminal_authority (provider text, original_transaction_id text);

create schema premium_fixture;
create function premium_fixture.reset(p_user uuid default '11111111-1111-4111-8111-111111111111')
returns void language plpgsql as $$
begin
  truncate public.user_entitlements, public.access_grants, public.provider_events,
    public.revenuecat_premium_transaction_authority, public.monetization_products,
    public.revenuecat_terminal_authority_quarantines,
    public.revenuecat_terminal_authority_quarantine_resolutions,
    public.revenuecat_consumable_transaction_intents, public.revenuecat_unbound_initial_authority,
    public.revenuecat_unbound_terminal_authority;
  insert into public.monetization_products values ('22222222-2222-4222-8222-222222222222','premium_subscription');
  insert into public.user_entitlements values (p_user::text,'premium','revenuecat','active',null,
    transaction_timestamp()-interval '1 day',transaction_timestamp()+interval '10 days',
    jsonb_build_object('environment','sandbox','revenuecat_event_id','premium-fixture-first','revenuecat_event_hash',repeat('a',64)));
  insert into public.provider_events values ('33333333-3333-4333-8333-333333333333','premium-fixture-first',
    'revenuecat_google_play','22222222-2222-4222-8222-222222222222',p_user,'sandbox','processed','INITIAL_PURCHASE',
    transaction_timestamp()-interval '1 day',transaction_timestamp()-interval '1 day',repeat('a',64),
    jsonb_build_object('entitlement_key','premium','original_transaction_id','premium-fixture-original',
      'provider_product_id','premium-fixture-product','provider_base_plan_id','premium-fixture-base',
      'premium_transaction_binding_id','44444444-4444-4444-8444-444444444444',
      'premium_fresh_authority_after_transfer_quarantine','true',
      'unresolved_non_premium_quarantine_preserved','true','premium_fresh_authority_event_type','INITIAL_PURCHASE'));
  insert into public.revenuecat_premium_transaction_authority values ('44444444-4444-4444-8444-444444444444',
    'revenuecat_google_play','premium-fixture-original',p_user,'sandbox','22222222-2222-4222-8222-222222222222',
    'premium-fixture-product','premium-fixture-base','premium-fixture-first',repeat('a',64),'active',
    'premium-fixture-first',repeat('a',64),'INITIAL_PURCHASE',transaction_timestamp()-interval '1 day',
    transaction_timestamp()-interval '1 day',null);
  insert into public.access_grants values ('55555555-5555-4555-8555-555555555555',p_user,'premium',
    '33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','revenuecat_google_play',
    'sandbox','sandbox_only',transaction_timestamp()-interval '1 day',transaction_timestamp()+interval '10 days',null,null);
end;
$$;
