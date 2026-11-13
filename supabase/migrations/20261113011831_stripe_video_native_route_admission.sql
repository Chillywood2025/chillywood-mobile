-- Source-only. No route/evidence seeds, enrollment, provider changes or enablement.
-- Platform-account held sandbox payments do not use creator Connect live authority.
create table private.stripe_video_native_routes (
 id uuid primary key default gen_random_uuid(), platform text not null check(platform in ('ios','android')),
 stripe_account_id text not null check(stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
 stripe_product_id text not null check(stripe_product_id ~ '^prod_[A-Za-z0-9]+$'),
 environment text not null default 'test' check(environment='test'),
 country text not null default 'US' check(country='US'),
 qualification_reference text not null check(length(btrim(qualification_reference)) between 1 and 300),
 native_build_reference text not null check(length(btrim(native_build_reference)) between 1 and 300),
 google_program_id uuid references private.google_play_external_program_config(id),
 verified_at timestamptz not null, expires_at timestamptz not null,
 enabled boolean not null default false, revoked_at timestamptz,
 check(expires_at>verified_at and expires_at<=verified_at+interval '24 hours'),
 check((platform='android' and google_program_id is not null) or (platform='ios' and google_program_id is null))
);
alter table private.stripe_video_native_routes enable row level security;
alter table private.stripe_video_native_routes force row level security;
revoke all on private.stripe_video_native_routes from public,anon,authenticated,service_role;
create trigger stripe_video_native_route_immutable before update on private.stripe_video_native_routes
 for each row execute function private.guard_creator_external_payment_evidence();

create table private.stripe_video_native_admissions (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references private.stripe_paid_video_orders(id),
 route_id uuid not null references private.stripe_video_native_routes(id),
 buyer_id uuid not null, session_id uuid not null, video_id uuid not null, creator_id uuid not null,
 price_id uuid not null, price_revision bigint not null, amount_minor integer not null, currency text not null check(currency='usd'),
 platform text not null check(platform in('ios','android')),
 token_hash text unique, external_transaction_token text,
 verification text not null check(verification in('native_sdk_observation_unverified','native_storefront_observation_unverified')),
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null,
 check((platform='android' and token_hash is not null and external_transaction_token is not null and token_hash ~ '^[0-9a-f]{64}$' and length(external_transaction_token) between 1 and 16384 and verification='native_sdk_observation_unverified')
   or (platform='ios' and token_hash is null and external_transaction_token is null and verification='native_storefront_observation_unverified'))
);
alter table private.stripe_video_native_admissions enable row level security;
alter table private.stripe_video_native_admissions force row level security;
revoke all on private.stripe_video_native_admissions from public,anon,authenticated,service_role;
create trigger stripe_video_native_admission_immutable before update or delete on private.stripe_video_native_admissions
 for each row execute function private.guard_event_ticket_terms_immutable();
alter table private.stripe_paid_video_orders add column checkout_platform text not null default 'web' check(checkout_platform in('web','ios','android'));
alter table private.stripe_paid_video_orders add column native_admission_id uuid references private.stripe_video_native_admissions(id);
alter table private.stripe_paid_video_orders add constraint stripe_video_transport_binding check(
 (checkout_platform='web' and native_admission_id is null) or (checkout_platform in('ios','android') and native_admission_id is not null));

create function private.stripe_video_native_route_current(p_route uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.stripe_video_native_routes r where r.id=p_route and r.enabled and r.revoked_at is null
 and r.verified_at<=clock_timestamp() and r.expires_at>clock_timestamp() and
 (r.platform='ios' or exists(select 1 from private.google_play_external_program_config g where g.id=r.google_program_id
 and g.package_name='com.chillywood.mobile' and g.environment='test' and g.enabled and g.revoked_at is null
 and g.verified_at<=clock_timestamp() and g.expires_at>clock_timestamp())));
$$;
revoke all on function private.stripe_video_native_route_current(uuid) from public,anon,authenticated,service_role;

create function private.stripe_video_native_admission_current(p_order uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.stripe_paid_video_orders o join private.stripe_video_native_admissions a on a.id=o.native_admission_id
 join private.stripe_video_native_routes r on r.id=a.route_id join private.stripe_paid_video_prices p on p.id=o.price_id
 where o.id=p_order and a.order_id=o.id and a.platform=o.checkout_platform
 and a.buyer_id=o.buyer_id and a.session_id=o.session_id and a.video_id=o.video_id and a.creator_id=o.creator_id
 and a.price_id=o.price_id and a.price_revision=o.price_revision and a.amount_minor=o.amount_minor and a.currency=o.currency
 and r.platform=o.checkout_platform and r.stripe_account_id=o.stripe_account_id and r.stripe_product_id=o.stripe_product_id
 and p.video_id=o.video_id and p.creator_id=o.creator_id and p.revision=o.price_revision and p.amount_minor=o.amount_minor and p.currency=o.currency and p.status='sandbox'
 and a.created_at<=clock_timestamp() and a.expires_at>clock_timestamp() and private.stripe_video_native_route_current(r.id)
 and public.creator_tip_buyer_session_authority_internal(o.buyer_id,o.session_id)
 and private.stripe_video_source_current(o.video_id,o.creator_id));
$$;
revoke all on function private.stripe_video_native_admission_current(uuid) from public,anon,authenticated,service_role;

create function public.admit_stripe_video_native_order(p_order uuid,p_buyer uuid,p_session uuid,p_route uuid,p_platform text,
 p_api_version integer,p_country text default null,p_external_transaction_token text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o private.stripe_paid_video_orders;r private.stripe_video_native_routes;a private.stripe_video_native_admissions;h text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 if p_order is null or p_buyer is null or p_session is null or p_route is null then raise exception 'native_order_authority_required';end if;
 if p_platform is null or p_platform not in('ios','android') or p_api_version is distinct from 1
 or (p_platform='ios' and (p_country is distinct from 'USA' or p_external_transaction_token is not null))
 or (p_platform='android' and (p_country is not null or p_external_transaction_token is null or length(p_external_transaction_token) not between 1 and 16384))
 then raise exception 'native_observation_invalid';end if;
 select * into o from private.stripe_paid_video_orders where id=p_order for update;
 if o.id is null or o.buyer_id<>p_buyer or o.session_id<>p_session or o.status<>'prepared' or o.expires_at<=clock_timestamp()
 or not public.creator_tip_buyer_session_authority_internal(p_buyer,p_session)
 or not private.stripe_video_source_current(o.video_id,o.creator_id)
 then raise exception 'native_order_authority_required';end if;
 select * into r from private.stripe_video_native_routes where id=p_route for share;
 if r.google_program_id is not null then
  perform 1 from private.google_play_external_program_config where id=r.google_program_id for share;
 end if;
 if r.id is null or r.platform<>p_platform or r.stripe_account_id<>o.stripe_account_id or r.stripe_product_id<>o.stripe_product_id
 or not private.stripe_video_native_route_current(r.id) then raise exception 'native_route_unqualified';end if;
 if p_platform='android' then
  h:=encode(extensions.digest(p_external_transaction_token,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('stripe-video-native-token:'||h,0));
  if exists(select 1 from private.google_play_external_admissions where token_hash=h)
   or exists(select 1 from private.google_play_external_launch_bindings where token_hash=h)
  then raise exception 'native_token_already_used';end if;
 end if;
 select * into a from private.stripe_video_native_admissions where id=o.native_admission_id;
 if a.id is not null and a.expires_at>clock_timestamp() then
  if a.route_id<>r.id or a.platform<>p_platform or a.token_hash is distinct from h or not private.stripe_video_native_admission_current(o.id)
  then raise exception 'native_admission_changed';end if;
 else
  -- Only an undispatched order can renew an expired observation. Historical
  -- admissions remain immutable; Android must supply a fresh unused SDK token.
  if o.checkout_platform<>'web' and o.checkout_platform<>p_platform then raise exception 'native_admission_changed';end if;
  insert into private.stripe_video_native_admissions(order_id,route_id,buyer_id,session_id,video_id,creator_id,price_id,price_revision,
   amount_minor,currency,platform,token_hash,external_transaction_token,verification,expires_at)
  values(o.id,r.id,o.buyer_id,o.session_id,o.video_id,o.creator_id,o.price_id,o.price_revision,o.amount_minor,o.currency,p_platform,h,p_external_transaction_token,
   case p_platform when 'ios' then 'native_storefront_observation_unverified' else 'native_sdk_observation_unverified' end,
   least(clock_timestamp()+interval '2 minutes',r.expires_at,o.expires_at)) returning * into a;
  update private.stripe_paid_video_orders set checkout_platform=p_platform,native_admission_id=a.id where id=o.id;
  if not private.stripe_video_native_admission_current(o.id) then raise exception 'native_admission_changed';end if;
 end if;
 return jsonb_build_object('admissionId',a.id,'orderId',o.id,'platform',a.platform,'expiresAt',a.expires_at,
  'verification',a.verification,'financialAuthority',false,'accessGranted',false);
end $$;
revoke all on function public.admit_stripe_video_native_order(uuid,uuid,uuid,uuid,text,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function public.admit_stripe_video_native_order(uuid,uuid,uuid,uuid,text,integer,text,text) to service_role;

-- The original dispatch function is not an alternate native bypass.
alter function public.dispatch_stripe_sandbox_video_order(uuid,uuid,uuid) rename to dispatch_stripe_sandbox_video_order_before_native;
revoke all on function public.dispatch_stripe_sandbox_video_order_before_native(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function public.dispatch_stripe_sandbox_video_order(p_order_id uuid,p_buyer_id uuid,p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o private.stripe_paid_video_orders;program uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into o from private.stripe_paid_video_orders where id=p_order_id for update;
 if o.checkout_platform in('ios','android') then
  -- Hold the exact route/program through dispatch so revocation either wins
  -- before validation or waits until this durable claim has committed.
  select r.google_program_id into program from private.stripe_video_native_admissions a
   join private.stripe_video_native_routes r on r.id=a.route_id where a.id=o.native_admission_id for share of a,r;
  if program is not null then perform 1 from private.google_play_external_program_config where id=program for share;end if;
  perform 1 from private.stripe_paid_video_prices where id=o.price_id for share;
 end if;
 if o.checkout_platform in('ios','android') and not private.stripe_video_native_admission_current(o.id)
 then raise exception 'native_admission_required';end if;
 -- Android cannot charge until the existing reporting queue has an exact
 -- paid-video launch binding. The separate reporting integration must supply it;
 -- this admission migration neither fabricates one nor permits auction fallback.
 if o.checkout_platform='android' and not exists(
  select 1 from private.stripe_video_native_admissions a
  join private.stripe_video_native_routes r on r.id=a.route_id
  join private.google_play_external_launch_bindings b on b.feature='paid_video' and b.quote_id=o.id
   and b.program_id=r.google_program_id and b.token_hash=a.token_hash
   and b.buyer_id=o.buyer_id and b.session_id=o.session_id and b.amount_minor=o.amount_minor and b.currency=o.currency
  where a.id=o.native_admission_id)
 then raise exception 'native_reporting_binding_required';end if;
 return public.dispatch_stripe_sandbox_video_order_before_native(p_order_id,p_buyer_id,p_session_id);
end $$;
revoke all on function public.dispatch_stripe_sandbox_video_order(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.dispatch_stripe_sandbox_video_order(uuid,uuid,uuid) to service_role;
