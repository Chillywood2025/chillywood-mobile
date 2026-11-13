-- Source-only: IP-country observation is not residence or platform eligibility.
-- No route/qualification seeds or enablement. Old read/reconcile/refund paths stay intact.
create table private.stripe_video_market_nonces (
 nonce uuid primary key, order_id uuid not null references private.stripe_paid_video_orders(id),
 buyer_id uuid not null, session_id uuid not null,
 purpose text not null check(purpose in('dispatch','resume_url')),
 consumed_at timestamptz not null default clock_timestamp()
);
alter table private.stripe_video_market_nonces enable row level security;
alter table private.stripe_video_market_nonces force row level security;
revoke all on private.stripe_video_market_nonces from public,anon,authenticated,service_role;
create trigger stripe_video_market_nonce_immutable before update or delete on private.stripe_video_market_nonces
 for each row execute function private.guard_event_ticket_terms_immutable();
create table private.stripe_video_market_admissions (
 nonce uuid primary key, order_id uuid not null unique references private.stripe_paid_video_orders(id),
 buyer_id uuid not null, session_id uuid not null, request_id uuid not null, video_id uuid not null,
 price_id uuid not null, price_revision bigint not null, amount_minor integer not null,
 currency text not null check(currency='usd'), platform text not null check(platform in('web','ios','android')),
 stripe_account_id text not null, country text not null check(country='US'),
 body_sha256 text not null check(body_sha256 ~ '^[0-9a-f]{64}$'),
 authorization_sha256 text not null check(authorization_sha256 ~ '^[0-9a-f]{64}$'),
 observed_at timestamptz not null, expires_at timestamptz not null,
 consumed_at timestamptz not null default clock_timestamp(),
 verification text not null check(verification='trusted_ip_country_observation'),
 check(expires_at=observed_at+interval '5 minutes')
);
alter table private.stripe_video_market_admissions enable row level security;
alter table private.stripe_video_market_admissions force row level security;
revoke all on private.stripe_video_market_admissions from public,anon,authenticated,service_role;
create trigger stripe_video_market_admission_immutable before update or delete on private.stripe_video_market_admissions
 for each row execute function private.guard_event_ticket_terms_immutable();

-- Keep native reporting/admission and all prior financial validation as the
-- inner function. Neither the old API signature nor helper is service-callable.
alter function public.dispatch_stripe_sandbox_video_order(uuid,uuid,uuid) rename to dispatch_stripe_sandbox_video_order_before_market;
revoke all on function public.dispatch_stripe_sandbox_video_order_before_market(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function public.dispatch_stripe_sandbox_video_order(p_order_id uuid,p_buyer_id uuid,p_session_id uuid,p_market jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o private.stripe_paid_video_orders;n uuid;seen timestamptz;expiry timestamptz;result jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 if p_order_id is null or p_buyer_id is null or p_session_id is null or p_market is null
   or jsonb_typeof(p_market) is distinct from 'object'
   or p_market->>'verification' is distinct from 'trusted_ip_country_observation'
   or p_market->>'country' is distinct from 'US'
   or coalesce(p_market->>'nonce','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   or coalesce(p_market->>'bodySha256','') !~ '^[0-9a-f]{64}$'
   or coalesce(p_market->>'authorizationSha256','') !~ '^[0-9a-f]{64}$'
 then raise exception 'checkout_market_observation_required';end if;
 n:=(p_market->>'nonce')::uuid;seen:=(p_market->>'observedAt')::timestamptz;expiry:=(p_market->>'expiresAt')::timestamptz;
 if seen is null or expiry is null or not isfinite(seen) or not isfinite(expiry)
   or seen>clock_timestamp()+interval '30 seconds' or expiry<=clock_timestamp()
   or expiry<>seen+interval '5 minutes'
 then raise exception 'checkout_market_observation_expired';end if;
 select * into o from private.stripe_paid_video_orders where id=p_order_id for update;
 if o.id is null or o.status<>'prepared' or o.buyer_id<>p_buyer_id or o.session_id<>p_session_id
   or o.request_id::text is distinct from lower(p_market->>'requestId')
   or o.video_id::text is distinct from lower(p_market->>'videoId')
   or o.checkout_platform is distinct from p_market->>'platform'
   or o.environment is distinct from 'sandbox' or o.expires_at<=clock_timestamp()
   or not public.creator_tip_buyer_session_authority_internal(p_buyer_id,p_session_id)
 then raise exception 'checkout_market_order_mismatch';end if;
 -- A unique nonce is consumed in the SAME transaction as the old dispatch.
 -- Any validation failure rolls consumption back. A second order cannot reuse it.
 insert into private.stripe_video_market_nonces(nonce,order_id,buyer_id,session_id,purpose)
 values(n,o.id,p_buyer_id,p_session_id,'dispatch');
 insert into private.stripe_video_market_admissions(nonce,order_id,buyer_id,session_id,request_id,video_id,
   price_id,price_revision,amount_minor,currency,platform,stripe_account_id,country,body_sha256,authorization_sha256,
   observed_at,expires_at,verification)
 values(n,o.id,o.buyer_id,o.session_id,o.request_id,o.video_id,o.price_id,o.price_revision,o.amount_minor,o.currency,
   o.checkout_platform,o.stripe_account_id,'US',p_market->>'bodySha256',p_market->>'authorizationSha256',seen,expiry,
   'trusted_ip_country_observation');
 result:=public.dispatch_stripe_sandbox_video_order_before_market(p_order_id,p_buyer_id,p_session_id);
 return result;
end $$;
revoke all on function public.dispatch_stripe_sandbox_video_order(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.dispatch_stripe_sandbox_video_order(uuid,uuid,uuid,jsonb) to service_role;

-- Re-exposing an existing unpaid web URL is not a new dispatch. Bind the fresh
-- observation to the CURRENT login, retaining the original order/session.
create function public.consume_stripe_video_resume_market(p_order_id uuid,p_buyer_id uuid,p_session_id uuid,p_checkout_session_id text,p_market jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o private.stripe_paid_video_orders;n uuid;seen timestamptz;expiry timestamptz;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 if p_market is null or jsonb_typeof(p_market) is distinct from 'object'
  or p_market->>'verification' is distinct from 'trusted_ip_country_observation'
  or p_market->>'country' is distinct from 'US' or p_market->>'platform' is distinct from 'web'
  or coalesce(p_market->>'nonce','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  or coalesce(p_market->>'bodySha256','') !~ '^[0-9a-f]{64}$'
  or coalesce(p_market->>'authorizationSha256','') !~ '^[0-9a-f]{64}$'
 then raise exception 'checkout_market_observation_required';end if;
 n:=(p_market->>'nonce')::uuid;seen:=(p_market->>'observedAt')::timestamptz;expiry:=(p_market->>'expiresAt')::timestamptz;
 if seen is null or expiry is null or not isfinite(seen) or not isfinite(expiry)
  or seen>clock_timestamp()+interval '30 seconds' or expiry<=clock_timestamp() or expiry<>seen+interval '5 minutes'
 then raise exception 'checkout_market_observation_expired';end if;
 select * into o from private.stripe_paid_video_orders where id=p_order_id for update;
 if o.id is null or p_buyer_id is null or p_session_id is null or o.buyer_id<>p_buyer_id
  or o.checkout_platform is distinct from 'web' or o.environment is distinct from 'sandbox'
  or o.status not in('dispatched','checkout_ready') or o.expires_at<=clock_timestamp()
  or p_checkout_session_id is null or o.checkout_session_id is distinct from p_checkout_session_id
  or o.request_id::text is distinct from lower(p_market->>'requestId')
  or o.video_id::text is distinct from lower(p_market->>'videoId')
  or not public.creator_tip_buyer_session_authority_internal(p_buyer_id,p_session_id)
 then raise exception 'checkout_market_order_mismatch';end if;
 insert into private.stripe_video_market_nonces(nonce,order_id,buyer_id,session_id,purpose)
 values(n,o.id,p_buyer_id,p_session_id,'resume_url');
 return jsonb_build_object('orderId',o.id,'checkoutSessionId',o.checkout_session_id,'purpose','resume_url','consumed',true);
end $$;
revoke all on function public.consume_stripe_video_resume_market(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.consume_stripe_video_resume_market(uuid,uuid,uuid,text,jsonb) to service_role;
