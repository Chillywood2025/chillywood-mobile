begin;
-- Separate dormant provider-onboarding authority; never a payments/payouts switch.
create table private.creator_connect_onboarding_policy (
 id uuid primary key default gen_random_uuid(), singleton boolean unique not null default true check(singleton),
 environment text not null check(environment='live'), enabled boolean not null default false,
 platform_account_id text not null check(platform_account_id ~ '^acct_[A-Za-z0-9]+$'),
 configuration_key text not null check(configuration_key='stripe_connect_live_express_recipient_controller_v1'),
 country text not null check(country='US'), currency text not null check(currency='usd'),
 return_url text not null check(return_url ~ '^https://[^/?#]+/[^#]*$'),
 refresh_url text not null check(refresh_url ~ '^https://[^/?#]+/[^#]*$'),
 controller_pricing_evidence_hash text not null check(controller_pricing_evidence_hash ~ '^[0-9a-f]{64}$'),
 hosted_onboarding_evidence_hash text not null check(hosted_onboarding_evidence_hash ~ '^[0-9a-f]{64}$'),
 verified_at timestamptz not null, expires_at timestamptz not null check(expires_at>verified_at and expires_at<=verified_at+interval '30 days')
);
create table private.creator_connect_account_creation (
 id uuid primary key default gen_random_uuid(),creator_id uuid not null unique,
 policy_id uuid not null references private.creator_connect_onboarding_policy(id), policy_snapshot jsonb not null,
 session_id uuid not null, environment text not null default 'live' check(environment='live'),
 state text not null default 'reserved' check(state in ('reserved','dispatched','observed','bound','review_required')),
 dispatch_token uuid, dispatched_at timestamptz, account_id text check(account_id ~ '^acct_[A-Za-z0-9]+$'),
 observed_facts jsonb, recovery_cursor text, recovery_match text, recovery_pages integer not null default 0,
 created_at timestamptz not null default clock_timestamp(), observed_at timestamptz, bound_at timestamptz,
 check((state='reserved')=(dispatched_at is null)), check((state='reserved')=(dispatch_token is null))
);
create table private.creator_connect_hosted_link_requests (
 id uuid primary key default gen_random_uuid(),creator_id uuid not null,session_id uuid not null,account_id text not null,
 policy_id uuid not null references private.creator_connect_onboarding_policy(id),
 state text not null default 'dispatched' check(state in ('dispatched','observed')),
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz,
 -- Only the receipt is persisted. Never persist the secret single-use URL.
 url_returned boolean not null default false
);
alter table private.creator_connect_onboarding_policy enable row level security;
alter table private.creator_connect_onboarding_policy force row level security;
alter table private.creator_connect_account_creation enable row level security;
alter table private.creator_connect_account_creation force row level security;
alter table private.creator_connect_hosted_link_requests enable row level security;
alter table private.creator_connect_hosted_link_requests force row level security;
revoke all on private.creator_connect_onboarding_policy,private.creator_connect_account_creation,private.creator_connect_hosted_link_requests from public,anon,authenticated,service_role;

create function private.creator_connect_onboarding_subject(p_creator uuid,p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_creator is not null and p_session is not null
  and public.creator_tip_buyer_session_authority_internal(p_creator,p_session)
  and public.wave1_user_has_active_legal_requirements_internal(p_creator,'payout')
  and exists(select 1 from public.wave1_creator_eligibility e where e.creator_user_id=p_creator
   and e.state in ('PENDING_VERIFICATION','VERIFIED') and e.account_status='ACTIVE'
   and e.age_18_plus is true and e.legal_accepted is true and e.creator_role is true
   and e.moderation_state='CLEAR' and e.market='UNITED_STATES'
   and e.rollout_eligible is true and e.platform_capability is true)
 -- Provider KYC/tax/payout completion is NOT a prerequisite to starting the
 -- hosted workflow that collects it. It remains mandatory for money authority.
$$;
revoke all on function private.creator_connect_onboarding_subject(uuid,uuid) from public,anon,authenticated,service_role;
create function public.get_creator_connect_onboarding_route(p_creator uuid,p_session uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.creator_connect_onboarding_policy; a public.creator_payout_accounts;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into p from private.creator_connect_onboarding_policy;
 select * into a from public.creator_payout_accounts where creator_user_id=p_creator::text;
 if p.id is null and coalesce(a.provider_environment,'test')<>'live' then return jsonb_build_object('mode','test'); end if;
 if p.id is null or not p.enabled or p.verified_at>clock_timestamp() or p.expires_at<=clock_timestamp()
 then return jsonb_build_object('mode','live','status','not_configured'); end if;
 if not private.creator_connect_onboarding_subject(p_creator,p_session)
 then return jsonb_build_object('mode','live','status','creator_onboarding_eligibility_required'); end if;
 if a.id is not null and (a.provider<>'stripe_connect' or a.provider_environment<>'live' or nullif(a.provider_account_id,'') is null)
 then return jsonb_build_object('mode','live','status','account_migration_review_required'); end if;
 return jsonb_build_object('mode','live','status','available','policyId',p.id,'platformAccountId',p.platform_account_id,
   'configurationKey',p.configuration_key,'country',p.country,'currency',p.currency,'returnUrl',p.return_url,'refreshUrl',p.refresh_url,
   'creatorId',p_creator,'sessionId',p_session,'accountId',a.provider_account_id);
end $$;
create function public.reserve_creator_connect_account_creation(p_creator uuid,p_session uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare route jsonb; a private.creator_connect_account_creation;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('connect-creator:'||p_creator::text,0));
 route:=public.get_creator_connect_onboarding_route(p_creator,p_session);
 if route->>'status' is distinct from 'available' then return route; end if;
 if route->>'accountId' is not null then return route||jsonb_build_object('status','account_reused'); end if;
 select * into a from private.creator_connect_account_creation where creator_id=p_creator for update;
 if a.id is null then
  insert into private.creator_connect_account_creation(creator_id,session_id,policy_id,policy_snapshot)
   values(p_creator,p_session,(route->>'policyId')::uuid,route-'sessionId'-'status'-'accountId') returning * into a;
 elsif a.policy_id is distinct from (route->>'policyId')::uuid
   or a.policy_snapshot is distinct from route-'sessionId'-'status'-'accountId'
 then return route||jsonb_build_object('status','account_migration_review_required'); end if;
 return route||jsonb_build_object('status',a.state,'attemptId',a.id,'accountId',a.account_id,
   'dispatchedAt',a.dispatched_at,'recoveryCursor',a.recovery_cursor,'recoveryMatch',a.recovery_match,
   'dispatchKey','cw-connect-live-create-'||a.id::text);
end $$;
create function public.claim_creator_connect_account_creation(p_creator uuid,p_session uuid,p_attempt uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare route jsonb;a private.creator_connect_account_creation;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 route:=public.get_creator_connect_onboarding_route(p_creator,p_session);
 if route->>'status' is distinct from 'available' or route->>'accountId' is not null then raise exception 'onboarding_route_unavailable'; end if;
 update private.creator_connect_account_creation set state='dispatched',dispatch_token=gen_random_uuid(),dispatched_at=clock_timestamp()
 where id=p_attempt and creator_id=p_creator and policy_id=(route->>'policyId')::uuid and state='reserved' and policy_snapshot=route-'sessionId'-'status'-'accountId'
 returning * into a;
 return jsonb_build_object('claimed',a.id is not null,'token',a.dispatch_token);
end $$;
create function public.checkpoint_creator_connect_account_recovery(p_attempt uuid,p_cursor text,p_next text,p_match text,p_complete boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.creator_connect_account_creation;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into a from private.creator_connect_account_creation where id=p_attempt for update;
 if a.id is null or a.state<>'dispatched' or a.recovery_cursor is distinct from p_cursor then return jsonb_build_object('stale',true); end if;
 if (p_match is not null and p_match !~ '^acct_[A-Za-z0-9]+$') or (p_next is not null and p_next !~ '^acct_[A-Za-z0-9]+$')
   or (p_complete is true and p_next is not null) or (p_complete is not true and p_next is null)
 then raise exception 'recovery_checkpoint_invalid'; end if;
 if a.recovery_match is not null and p_match is not null and a.recovery_match<>p_match then
  update private.creator_connect_account_creation set state='review_required' where id=a.id;
  return jsonb_build_object('reviewRequired',true);
 end if;
 update private.creator_connect_account_creation set recovery_cursor=p_next,recovery_match=coalesce(a.recovery_match,p_match),recovery_pages=recovery_pages+1 where id=a.id;
 return jsonb_build_object('stale',false,'complete',p_complete,'accountId',coalesce(a.recovery_match,p_match));
end $$;
create function public.quarantine_creator_connect_account_creation(p_attempt uuid,p_first text,p_second text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if p_first is null or p_second is null or p_first=p_second or p_first !~ '^acct_[A-Za-z0-9]+$' or p_second !~ '^acct_[A-Za-z0-9]+$'
 then raise exception 'creation_conflict_invalid'; end if;
 update private.creator_connect_account_creation set state='review_required' where id=p_attempt and state='dispatched';
end $$;
revoke all on function public.quarantine_creator_connect_account_creation(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.quarantine_creator_connect_account_creation(uuid,text,text) to service_role;
create function public.record_creator_connect_created_account(p_creator uuid,p_session uuid,p_attempt uuid,p_account text,p_facts jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.creator_connect_account_creation;route jsonb;existing public.creator_payout_accounts;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('connect-creator:'||p_creator::text,0));
 select * into a from private.creator_connect_account_creation where id=p_attempt and creator_id=p_creator for update;
 if a.id is null or a.state not in ('dispatched','observed','bound') or p_account is null or p_account !~ '^acct_[A-Za-z0-9]+$'
   or p_facts->>'attemptId' is distinct from a.id::text or p_facts->>'creatorId' is distinct from p_creator::text
   or p_facts->>'platformAccountId' is distinct from a.policy_snapshot->>'platformAccountId'
   or p_facts->>'accountId' is distinct from p_account or p_facts->>'environment' is distinct from 'live'
   or p_facts->'modeVerified' is distinct from 'true'::jsonb
   or p_facts->>'configurationKey' is distinct from 'stripe_connect_live_express_recipient_controller_v1'
   or p_facts->>'country' is distinct from 'US' or p_facts->>'currency' is distinct from 'usd'
   or p_facts->>'payoutSchedule' is distinct from 'manual' or p_facts->>'controllerStatus' is distinct from 'match'
   or (a.account_id is not null and a.account_id<>p_account)
 then raise exception 'created_account_proof_invalid'; end if;
 -- Preserve operational provenance even if session or policy expired during I/O.
 update private.creator_connect_account_creation set account_id=p_account,observed_facts=p_facts,observed_at=clock_timestamp(),
  state=case when state='bound' then 'bound' else 'observed' end where id=a.id;
 route:=public.get_creator_connect_onboarding_route(p_creator,p_session);
 if route->>'status' is distinct from 'available' or route->>'policyId' is distinct from a.policy_id::text
 then return jsonb_build_object('recorded',true,'bound',false,'status','onboarding_authority_changed'); end if;
 select * into existing from public.creator_payout_accounts where creator_user_id=p_creator::text for update;
 if existing.id is not null and (existing.provider<>'stripe_connect' or existing.provider_environment<>'live' or existing.provider_account_id<>p_account)
 then return jsonb_build_object('recorded',true,'bound',false,'status','account_migration_review_required'); end if;
 if existing.id is null then
  insert into public.creator_payout_accounts(creator_user_id,provider,provider_environment,provider_account_id,country,default_currency,metadata)
   values(p_creator::text,'stripe_connect','live',p_account,'US','usd',jsonb_build_object('creation_attempt_id',a.id,'provider_status_only',true,'payout_execution',false));
 end if;
 update private.creator_connect_account_creation set state='bound',bound_at=coalesce(bound_at,clock_timestamp()) where id=a.id;
 return jsonb_build_object('recorded',true,'bound',true,'status','account_created','accountId',p_account,'financialAuthority',false);
end $$;
create function public.claim_creator_connect_hosted_link(p_creator uuid,p_session uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare route jsonb;r private.creator_connect_hosted_link_requests;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 route:=public.get_creator_connect_onboarding_route(p_creator,p_session);
 if route->>'status' is distinct from 'available' or route->>'accountId' is null then raise exception 'onboarding_route_unavailable'; end if;
 if not exists(select 1 from private.creator_connect_account_creation a where a.creator_id=p_creator and a.account_id=route->>'accountId'
  and a.state='bound' and a.policy_id=(route->>'policyId')::uuid)
 then raise exception 'onboarding_creation_provenance_required'; end if;
 insert into private.creator_connect_hosted_link_requests(creator_id,session_id,account_id,policy_id)
 values(p_creator,p_session,route->>'accountId',(route->>'policyId')::uuid) returning * into r;
 return route||jsonb_build_object('attemptId',(select id from private.creator_connect_account_creation where creator_id=p_creator and account_id=r.account_id and state='bound'),'linkRequestId',r.id,'dispatchKey','cw-connect-live-link-'||r.id::text);
end $$;
create function public.complete_creator_connect_hosted_link(p_creator uuid,p_session uuid,p_request uuid,p_expires timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.creator_connect_hosted_link_requests;route jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into r from private.creator_connect_hosted_link_requests where id=p_request and creator_id=p_creator and session_id=p_session for update;
 if r.id is null or r.state<>'dispatched' or p_expires is null or p_expires<=clock_timestamp() or p_expires>clock_timestamp()+interval '1 hour' then raise exception 'onboarding_link_receipt_invalid'; end if;
 route:=public.get_creator_connect_onboarding_route(p_creator,p_session);
 if route->>'status' is distinct from 'available' or route->>'accountId' is distinct from r.account_id or route->>'policyId' is distinct from r.policy_id::text
 then return jsonb_build_object('returnAllowed',false); end if;
 update private.creator_connect_hosted_link_requests set state='observed',expires_at=p_expires,url_returned=true where id=r.id;
 return jsonb_build_object('returnAllowed',true,'financialAuthority',false);
end $$;
revoke all on function public.get_creator_connect_onboarding_route(uuid,uuid),public.reserve_creator_connect_account_creation(uuid,uuid),
 public.claim_creator_connect_account_creation(uuid,uuid,uuid),public.checkpoint_creator_connect_account_recovery(uuid,text,text,text,boolean),
 public.record_creator_connect_created_account(uuid,uuid,uuid,text,jsonb),public.claim_creator_connect_hosted_link(uuid,uuid),
 public.complete_creator_connect_hosted_link(uuid,uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.get_creator_connect_onboarding_route(uuid,uuid),public.reserve_creator_connect_account_creation(uuid,uuid),
 public.claim_creator_connect_account_creation(uuid,uuid,uuid),public.checkpoint_creator_connect_account_recovery(uuid,text,text,text,boolean),
 public.record_creator_connect_created_account(uuid,uuid,uuid,text,jsonb),public.claim_creator_connect_hosted_link(uuid,uuid),
 public.complete_creator_connect_hosted_link(uuid,uuid,uuid,timestamptz) to service_role;
commit;
