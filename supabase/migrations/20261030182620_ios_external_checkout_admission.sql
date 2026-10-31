-- No approval/configuration seeds. StoreKit observations are explicitly not
-- Apple attestation, payment evidence, or provider/store approval.
create table private.ios_external_storefront_observations (
  id uuid primary key default gen_random_uuid(),
  eligibility_id uuid not null unique references private.creator_external_payment_eligibility(id),
  capability_id uuid not null references private.creator_external_payment_capabilities(id),
  buyer_id uuid not null, session_id uuid not null, creator_id uuid not null,
  feature text not null check(feature in('creator_tip','event_auction','room_seat_auction')),
  source_id uuid not null, amount_minor integer not null check(amount_minor>0),
  -- This is the server's qualified distribution label, not a native numeric ID.
  storefront text not null default 'apple_app_store' check(storefront='apple_app_store'),
  country_code text not null check(country_code='USA'),
  verification text not null default 'native_storefront_observation_unverified'
    check(verification='native_storefront_observation_unverified'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '2 minutes'
);
create index ios_external_observation_rate on private.ios_external_storefront_observations(buyer_id,session_id,created_at desc);
alter table private.ios_external_storefront_observations enable row level security;
alter table private.ios_external_storefront_observations force row level security;
revoke all on private.ios_external_storefront_observations from public,anon,authenticated,service_role;
create function private.guard_ios_external_observation()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'ios_external_observation_immutable'; end; $$;
revoke all on function private.guard_ios_external_observation() from public,anon,authenticated,service_role;
create trigger ios_external_observation_immutable before update or delete on private.ios_external_storefront_observations
for each row execute function private.guard_ios_external_observation();

create function public.admit_ios_external_session(p_feature text,p_creator_id uuid,p_amount_minor integer,
  p_source_id uuid,p_country_code text,p_api_version integer,p_capability_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare buyer uuid:=auth.uid(); session uuid; cap private.creator_external_payment_capabilities;
  observation uuid:=gen_random_uuid(); eligibility uuid:=gen_random_uuid(); expiry timestamptz;
begin
  if buyer is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
  then raise exception 'ios_external_buyer_authority_required'; end if;
  session:=(auth.jwt()->>'session_id')::uuid;
  if p_api_version is distinct from 1 or p_country_code is distinct from 'USA'
    or p_source_id is null
    or p_amount_minor is null or p_amount_minor<=0 or p_creator_id is null or buyer=p_creator_id
    or p_feature is null or p_feature not in('creator_tip','event_auction','room_seat_auction')
    or not public.wave1_creator_money_subject_authorized_internal(p_creator_id)
  then raise exception 'ios_external_storefront_observation_required'; end if;
  if p_feature='event_auction' and not exists(select 1 from private.creator_event_auctions
    where id=p_source_id and creator_id=p_creator_id and state in('open','awarded','payment_pending'))
  then raise exception 'ios_external_source_invalid'; end if;
  if p_feature='room_seat_auction' and not exists(select 1 from private.creator_room_seat_auctions
    where id=p_source_id and creator_id=p_creator_id and state in('open','awarded','payment_pending'))
  then raise exception 'ios_external_source_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ios-external-buyer:'||buyer||':'||session,0));
  if (select count(*) from private.ios_external_storefront_observations where buyer_id=buyer and session_id=session
    and created_at>clock_timestamp()-interval '1 minute')>=10
  then raise exception 'ios_external_observation_rate_limited'; end if;
  select * into cap from private.creator_external_payment_capabilities c
  where c.feature=p_feature and c.creator_id=p_creator_id and c.platform='ios'
    and (p_capability_id is null or c.id=p_capability_id)
    and c.storefront='apple_app_store' and c.storefront_country='US' and c.route_kind='external_browser_checkout'
    and c.currency='usd' and c.environment='test' and c.payment_method='card'
    and p_amount_minor between c.min_amount_minor and c.max_amount_minor
    and c.enabled and c.revoked_at is null and c.verified_at<=clock_timestamp()
    -- Admission also refreshes an already-bound checkout. The new-checkout
    -- path independently enforces Stripe's minimum creation lifetime.
    and c.expires_at>clock_timestamp()
  order by c.created_at desc,c.id limit 1 for share;
  if cap.id is null then raise exception 'ios_external_qualified_route_unavailable'; end if;
  expiry:=least(cap.expires_at,clock_timestamp()+interval '2 minutes');
  insert into private.creator_external_payment_eligibility(id,capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
    values(eligibility,cap.id,buyer,session,'native_storefront_observation_unverified:'||observation,clock_timestamp(),expiry);
  insert into private.ios_external_storefront_observations(id,eligibility_id,capability_id,buyer_id,session_id,
    creator_id,feature,source_id,amount_minor,storefront,country_code,expires_at)
  values(observation,eligibility,cap.id,buyer,session,p_creator_id,p_feature,p_source_id,p_amount_minor,'apple_app_store',p_country_code,expiry);
  -- Use the actual shared resolver: recipient readiness, current session and
  -- current qualified route remain mandatory, not merely a storefront string.
  perform private.resolve_creator_external_payment_capability(buyer,session,p_feature,p_creator_id,p_amount_minor,'usd','test',cap.id);
  return jsonb_build_object('admissionId',observation,'capabilityId',cap.id,'expiresAt',expiry,
    'verification','native_storefront_observation_unverified','financialAuthority',false,'accessGranted',false);
end; $$;
revoke all on function public.admit_ios_external_session(text,uuid,integer,uuid,text,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admit_ios_external_session(text,uuid,integer,uuid,text,integer,uuid) to authenticated;
-- Legacy/manual admission retains newest-qualified selection. Exact selection
-- is an optional binding, never an exemption from qualification.
create function public.admit_ios_external_session(p_feature text,p_creator_id uuid,p_amount_minor integer,
  p_source_id uuid,p_country_code text,p_api_version integer)
returns jsonb language sql security invoker set search_path='' as $$
 select public.admit_ios_external_session(p_feature,p_creator_id,p_amount_minor,p_source_id,p_country_code,p_api_version,null::uuid);
$$;
revoke all on function public.admit_ios_external_session(text,uuid,integer,uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.admit_ios_external_session(text,uuid,integer,uuid,text,integer) to authenticated;

-- Preserve previously service-qualified evidence; this automatic issuer's
-- explicitly unverified observations are exact-amount and short-lived.
do $ios_resolver$
declare body text; needle text;
begin
  body:=pg_get_functiondef('private.resolve_creator_external_payment_capability(uuid,uuid,text,uuid,integer,text,text,uuid)'::regprocedure);
  needle:='and eligibility.expires_at>clock_timestamp()';
  if position(needle in body)=0 then raise exception 'ios_external_resolver_source_changed'; end if;
  body:=replace(body,needle,needle||$check$
    and (eligibility.eligibility_evidence not like 'native_storefront_observation_unverified:%'
      or exists(select 1 from private.ios_external_storefront_observations observation
        where observation.eligibility_id=eligibility.id and observation.capability_id=capability.id
          and observation.buyer_id=p_buyer_id and observation.session_id=p_session_id
          and observation.creator_id=p_creator_id and observation.feature=p_feature
          and observation.amount_minor=p_amount_minor and observation.expires_at>clock_timestamp()))$check$);
  needle:='where capability_id=c.id and buyer_id=p_buyer_id and session_id=p_session_id';
  if position(needle in body)=0 then raise exception 'ios_external_eligibility_source_changed'; end if;
  body:=replace(body,needle,needle||$check$
      and (eligibility_evidence not like 'native_storefront_observation_unverified:%'
        or exists(select 1 from private.ios_external_storefront_observations observation
          where observation.eligibility_id=private.creator_external_payment_eligibility.id
            and observation.amount_minor=p_amount_minor and observation.expires_at>clock_timestamp()))$check$);
  execute body;
end; $ios_resolver$;
