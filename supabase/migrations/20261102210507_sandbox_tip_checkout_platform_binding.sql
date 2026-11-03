-- Future checkout identity only. No source becomes payable and no provider
-- qualification, sandbox access, money switch or historical binding is seeded.
create table private.sandbox_tip_checkout_platform_bindings (
 tip_id uuid primary key references public.creator_tip_transactions(id),
 buyer_id uuid not null, request_id uuid not null, session_id uuid not null,
 platform_account_id text not null check(platform_account_id ~ '^acct_[A-Za-z0-9]+$'),
 recipient_account_id text not null check(recipient_account_id ~ '^acct_[A-Za-z0-9]+$'),
 environment text not null default 'test' check(environment='test'),
 request_body_sha256 text not null check(request_body_sha256 ~ '^[a-f0-9]{64}$'),
 bound_at timestamptz not null default clock_timestamp(),
 unique(buyer_id,request_id),
 foreign key(buyer_id,request_id) references private.creator_tip_checkout_attempts(buyer_id,request_id),
 check(platform_account_id<>recipient_account_id)
);
alter table private.sandbox_tip_checkout_platform_bindings enable row level security;
alter table private.sandbox_tip_checkout_platform_bindings force row level security;
revoke all on private.sandbox_tip_checkout_platform_bindings from public,anon,authenticated,service_role;
create function private.guard_sandbox_tip_checkout_platform_binding() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'tip_platform_binding_immutable'; end; $$;
revoke all on function private.guard_sandbox_tip_checkout_platform_binding() from public,anon,authenticated,service_role;
create trigger guard_sandbox_tip_checkout_platform_binding before update or delete
 on private.sandbox_tip_checkout_platform_bindings for each row
 execute function private.guard_sandbox_tip_checkout_platform_binding();

-- The adapter supplies the authenticated test-key /account observation, never
-- a client-selected platform. Existing unbound attempts, including unknown
-- dispatches, must stay unbound: current identity is not historical evidence.
create function public.reserve_platform_bound_test_tip_checkout(
 p_buyer_id uuid,p_session_id uuid,p_request_id uuid,p_quote jsonb,p_platform_account_id text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.creator_tip_checkout_attempts;
 b private.sandbox_tip_checkout_platform_bindings; result jsonb;
 creator uuid:=(p_quote->>'creatorId')::uuid; existed boolean;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if not public.creator_tip_buyer_session_authority_internal(p_buyer_id,p_session_id)
 then raise exception 'tip_buyer_authority_required'; end if;
 if p_platform_account_id is null or p_platform_account_id !~ '^acct_[A-Za-z0-9]+$'
 or creator is null or p_request_id is null then raise exception 'tip_platform_binding_invalid'; end if;
 -- Same lock/order as the canonical reservation; no independent quote engine.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('stripe-tip-checkout:'||p_buyer_id::text||':'||creator::text,0));
 select * into a from private.creator_tip_checkout_attempts where buyer_id=p_buyer_id and request_id=p_request_id for update;
 existed:=a.tip_id is not null;
 if existed then
  select * into b from private.sandbox_tip_checkout_platform_bindings where tip_id=a.tip_id;
  if b.tip_id is null then raise exception 'tip_historical_platform_unbound'; end if;
  if b.platform_account_id is distinct from p_platform_account_id or b.session_id is distinct from p_session_id
  then raise exception 'tip_platform_binding_conflict'; end if;
 end if;
 result:=public.reserve_creator_tip_checkout_attempt(p_buyer_id,p_session_id,p_request_id,p_quote);
 select * into strict a from private.creator_tip_checkout_attempts where buyer_id=p_buyer_id and request_id=p_request_id;
 if not existed then
  if a.session_id is distinct from p_session_id
    or a.tip_id::text is distinct from result->>'tipId'
    or not exists(select 1 from public.creator_tip_transactions t where t.id=a.tip_id
      and t.sender_id=p_buyer_id and t.creator_id=creator and t.provider='stripe_connect'
      and t.provider_environment='test' and t.status='pending'
      and t.provider_checkout_session_id is null and t.provider_payment_intent_id is null
      and t.provider_account_id=a.request_body->>'payment_intent_data[transfer_data][destination]')
  then raise exception 'tip_platform_binding_invalid'; end if;
  insert into private.sandbox_tip_checkout_platform_bindings(tip_id,buyer_id,request_id,session_id,
   platform_account_id,recipient_account_id,request_body_sha256)
  values(a.tip_id,a.buyer_id,a.request_id,a.session_id,p_platform_account_id,
   a.request_body->>'payment_intent_data[transfer_data][destination]',
   encode(extensions.digest(a.request_body::text,'sha256'),'hex')) returning * into b;
 end if;
 if b.buyer_id is distinct from a.buyer_id or b.request_id is distinct from a.request_id
 or b.recipient_account_id is distinct from a.request_body->>'payment_intent_data[transfer_data][destination]'
 or b.request_body_sha256 is distinct from encode(extensions.digest(a.request_body::text,'sha256'),'hex')
 then raise exception 'tip_platform_binding_conflict'; end if;
 return result||jsonb_build_object('platformAccountId',b.platform_account_id,'platformBound',true);
end; $$;
revoke all on function public.reserve_platform_bound_test_tip_checkout(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.reserve_platform_bound_test_tip_checkout(uuid,uuid,uuid,jsonb,text) to service_role;
