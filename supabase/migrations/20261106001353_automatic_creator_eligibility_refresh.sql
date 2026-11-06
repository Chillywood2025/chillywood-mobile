begin;
-- Declarations are self-attestations, never verified identity or provider/tax proof.
create table private.creator_eligibility_declarations (
 id bigint generated always as identity primary key,
 creator_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 declared_18_plus boolean not null check(declared_18_plus),
 country_code text not null check(country_code='US'),
 region_code text not null check(region_code in ('AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY')),
 declaration_version text not null check(declaration_version='adult-us-creator-v1'),
 declared_at timestamptz not null default clock_timestamp()
);
create index creator_eligibility_declarations_latest_idx on private.creator_eligibility_declarations(creator_id,id desc);
create index creator_eligibility_declarations_recent_idx on private.creator_eligibility_declarations(creator_id,declared_at desc);
alter table private.creator_eligibility_declarations enable row level security;
alter table private.creator_eligibility_declarations force row level security;
revoke all on private.creator_eligibility_declarations from public,anon,authenticated,service_role;
revoke all on sequence private.creator_eligibility_declarations_id_seq from public,anon,authenticated,service_role;
create function private.guard_creator_eligibility_declaration_history() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Only the real auth-user FK cascade can remove history. A caller-set flag
 -- or service-role status is not purge authority.
 if tg_op='DELETE' and not exists(select 1 from auth.users where id=old.creator_id) then return old; end if;
 raise exception 'creator_declaration_history_immutable';
end $$;
revoke all on function private.guard_creator_eligibility_declaration_history() from public,anon,authenticated,service_role;
create trigger creator_declaration_history_immutable before update or delete on private.creator_eligibility_declarations
for each row execute function private.guard_creator_eligibility_declaration_history();

create function private.ordinary_creator_provider_ready(p_creator uuid,p_environment text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(p_environment in ('sandbox','production') and exists(
 select 1 from public.creator_payout_accounts a
 join public.creator_payout_eligibility_records e on e.payout_account_id=a.id and e.creator_user_id=a.creator_user_id
 join private.creator_connect_mode_bindings b on b.payout_account_id=a.id and b.creator_id=a.creator_user_id
  and b.environment=a.provider_environment and b.provider_account_id=a.provider_account_id
 where a.creator_user_id=p_creator::text and a.provider='stripe_connect'
  and a.provider_environment=case when p_environment='production' then 'live' else 'test' end
  and a.status='eligible' and a.kyc_status='verified' and a.tax_status='verified'
  and a.country='US' and a.default_currency='usd'
  and a.details_submitted and a.payouts_enabled and a.transfers_capability_status='active'
  and a.onboarding_status='ready_for_payouts'
  and nullif(btrim(a.disabled_reason),'') is null
  and a.requirements_currently_due='[]'::jsonb and a.requirements_past_due='[]'::jsonb
  and a.requirements_eventually_due='[]'::jsonb
  and a.last_provider_sync_at between now()-interval '15 minutes' and now()
  and a.provider_configuration_observed_at between now()-interval '15 minutes' and now()
  and a.provider_configuration_account_id=a.provider_account_id and a.provider_configuration_status='match'
  and a.provider_expected_configuration_key=case when p_environment='production'
    then 'stripe_connect_live_express_recipient_controller_v1' else 'stripe_connect_test_express_controller_v1' end
  and a.provider_configuration_key=a.provider_expected_configuration_key
  and a.provider_account_type in ('express','none') and a.provider_controller_type='application' and a.provider_is_controller
  and a.provider_dashboard_type='express' and a.provider_fees_payer='platform'
  and a.provider_fees_payer_raw in ('application','application_express')
  and a.provider_losses_collector='platform' and a.provider_requirements_collection='stripe'
  and (p_environment='sandbox' or private.creator_connect_live_proof_matches(a.provider_live_observation,a.provider_account_id))
  and not e.fraud_hold_active and e.admin_review_status not in ('pending_review','rejected','on_hold')
  and e.eligibility_status<>'on_hold' and e.provider_ready and e.kyc_ready and e.payout_account_ready
 ),false);
$$;
revoke all on function private.ordinary_creator_provider_ready(uuid,text) from public,anon,authenticated,service_role;

create function private.lock_ordinary_creator_subject(p_creator uuid,p_session uuid,p_environment text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from auth.users where id=p_creator for share;
 perform 1 from auth.sessions where id=p_session and user_id=p_creator for share;
 perform private.lock_ordinary_commerce_premium_subjects(array[p_creator]);
 perform pg_advisory_xact_lock(hashtextextended('wave1-creator:'||p_creator::text,0));
 if private.ordinary_commerce_subject_current(p_creator,p_session,p_environment) is not true
 then raise exception 'creator_session_premium_required' using errcode='42501'; end if;
end $$;
revoke all on function private.lock_ordinary_creator_subject(uuid,uuid,text) from public,anon,authenticated,service_role;

create function private.refresh_ordinary_creator_eligibility(p_creator uuid) returns void
language plpgsql security definer set search_path='' as $$
declare e public.wave1_creator_eligibility; d private.creator_eligibility_declarations;
 mode text; ready boolean; inputs jsonb; result jsonb; versions jsonb; reasons text[];
begin
 mode:=case when exists(select 1 from public.platform_money_kill_switches where key='live_money_enabled' and state='on') then 'production' else 'sandbox' end;
 -- Callers establish auth-user/session locks before the common creator mutex.
 perform pg_advisory_xact_lock(hashtextextended('wave1-creator:'||p_creator::text,0));
 if private.ordinary_commerce_premium_current(p_creator,mode) is not true
  or not exists(select 1 from auth.users where id=p_creator and deleted_at is null
   and (email_confirmed_at is not null or phone_confirmed_at is not null)
   and not is_anonymous and not public.is_account_access_restricted(id::text))
 then return; end if;
 select * into e from public.wave1_creator_eligibility where creator_user_id=p_creator for update;
 select * into d from private.creator_eligibility_declarations where creator_id=p_creator order by id desc limit 1;
 ready:=private.ordinary_creator_provider_ready(p_creator,mode);
 inputs:=jsonb_build_object(
 'accountStatus',case when public.is_account_access_restricted(p_creator::text) then 'RESTRICTED'
  when e.account_status in ('RESTRICTED','DELETED') then e.account_status else 'ACTIVE' end,
 'age18Plus',coalesce(e.age_18_plus,case when d.id is not null then true end),
 'market',case when coalesce(e.market,'UNKNOWN')='UNKNOWN' and d.id is not null then 'UNITED_STATES' else coalesce(e.market,'UNKNOWN') end,
 'moderationState',coalesce(e.moderation_state,'CLEAR'),
 'creatorRole',coalesce(e.creator_role,true),'rolloutEligible',true,
 'legalAccepted',public.wave1_user_has_active_legal_requirements_internal(p_creator,'creator_money'),
 'platformCapability',coalesce(e.platform_capability,true),
 'providerEligible',case when e.provider_eligible is false then false when ready then true end,
 'kycComplete',case when e.kyc_complete is false then false when ready then true end,
 'payoutEligible',case when e.payout_eligible is false then false when ready then true end,
 -- Independent wave1 tax and sanctions attestations are NOT provider status.
 'taxComplete',e.tax_complete,'sanctionsClear',e.sanctions_clear);
 result:=public.wave1_compute_creator_eligibility(inputs,coalesce(e.state,'INELIGIBLE'));
 -- Lazy enrollment is not an operator's suspension/revocation clearance.
 if e.state in ('SUSPENDED','REVOKED') then
  result:=result||jsonb_build_object('state',e.state,'canCreateMoneyExposure',false,
   'reasonCodes',to_jsonb(e.reason_codes));
 end if;
 reasons:=array(select jsonb_array_elements_text(result->'reasonCodes'));
 versions:=coalesce(e.input_versions,'{}'::jsonb)||jsonb_build_object('enrollment','automatic_premium',
  'ageMarketSource',case when d.id is not null then 'self_declaration' else 'existing_authority' end,
  'declarationOrdinal',d.id);
 -- No-op means no statement at all: publication fencing has AFTER STATEMENT
 -- triggers, so an UPSERT with WHERE false would still invalidate a review.
 if e.creator_user_id is not null and row(e.state,e.account_status,e.age_18_plus,e.market,e.moderation_state,
  e.creator_role,e.rollout_eligible,e.legal_accepted,e.platform_capability,e.provider_eligible,e.kyc_complete,
  e.payout_eligible,e.reason_codes,e.input_versions,e.authority_source,e.last_operation_key)
  is not distinct from row(result->>'state',inputs->>'accountStatus',(inputs->>'age18Plus')::boolean,
  inputs->>'market',inputs->>'moderationState',(inputs->>'creatorRole')::boolean,true,
  (inputs->>'legalAccepted')::boolean,(inputs->>'platformCapability')::boolean,(inputs->>'providerEligible')::boolean,
  (inputs->>'kycComplete')::boolean,(inputs->>'payoutEligible')::boolean,reasons,versions,
  'automatic_eligibility'::text,('automatic-eligibility:'||p_creator::text)) then return; end if;
 insert into public.wave1_creator_eligibility(creator_user_id,state,account_status,age_18_plus,market,moderation_state,
 creator_role,rollout_eligible,legal_accepted,platform_capability,provider_eligible,kyc_complete,payout_eligible,
 tax_complete,sanctions_clear,reason_codes,input_versions,authority_source,last_operation_key)
 values(p_creator,result->>'state',inputs->>'accountStatus',(inputs->>'age18Plus')::boolean,inputs->>'market',inputs->>'moderationState',
 (inputs->>'creatorRole')::boolean,true,(inputs->>'legalAccepted')::boolean,(inputs->>'platformCapability')::boolean,(inputs->>'providerEligible')::boolean,
 (inputs->>'kycComplete')::boolean,(inputs->>'payoutEligible')::boolean,e.tax_complete,e.sanctions_clear,
 reasons,versions,
 'automatic_eligibility','automatic-eligibility:'||p_creator::text)
 on conflict(creator_user_id) do update set state=excluded.state,account_status=excluded.account_status,
 age_18_plus=excluded.age_18_plus,market=excluded.market,moderation_state=excluded.moderation_state,
 creator_role=excluded.creator_role,rollout_eligible=excluded.rollout_eligible,legal_accepted=excluded.legal_accepted,
 platform_capability=excluded.platform_capability,provider_eligible=excluded.provider_eligible,kyc_complete=excluded.kyc_complete,
 payout_eligible=excluded.payout_eligible,reason_codes=excluded.reason_codes,input_versions=excluded.input_versions,
 authority_source=excluded.authority_source,last_operation_key=excluded.last_operation_key,
 version=public.wave1_creator_eligibility.version+1,evaluated_at=clock_timestamp();
end $$;
revoke all on function private.refresh_ordinary_creator_eligibility(uuid) from public,anon,authenticated,service_role;

create function public.declare_creator_money_eligibility(p_declared_18_plus boolean,p_country_code text,p_region_code text,
 p_declaration_version text default 'adult-us-creator-v1') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); s uuid; mode text; d private.creator_eligibility_declarations;
begin
 if auth.role() is distinct from 'authenticated' or u is null
  or coalesce(auth.jwt()->>'session_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
 then raise exception 'creator_session_premium_required' using errcode='42501'; end if;
 s:=(auth.jwt()->>'session_id')::uuid;
 mode:=case when exists(select 1 from public.platform_money_kill_switches where key='live_money_enabled' and state='on') then 'production' else 'sandbox' end;
 perform private.lock_ordinary_creator_subject(u,s,mode);
 if p_declared_18_plus is not true or p_country_code is distinct from 'US'
  or p_region_code is null or p_region_code not in ('AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY')
  or p_declaration_version is distinct from 'adult-us-creator-v1'
 then raise exception 'creator_declaration_invalid' using errcode='22023'; end if;
 select * into d from private.creator_eligibility_declarations where creator_id=u order by id desc limit 1;
 if d.id is null or row(d.declared_18_plus,d.country_code,d.region_code,d.declaration_version)
  is distinct from row(p_declared_18_plus,p_country_code,p_region_code,p_declaration_version) then
  if (select count(*) from private.creator_eligibility_declarations where creator_id=u and declared_at>clock_timestamp()-interval '24 hours')>=10
  then raise exception 'creator_declaration_rate_limited' using errcode='54000'; end if;
  insert into private.creator_eligibility_declarations(creator_id,session_id,declared_18_plus,country_code,region_code,declaration_version)
  values(u,s,p_declared_18_plus,p_country_code,p_region_code,p_declaration_version);
 end if;
 perform private.refresh_ordinary_creator_eligibility(u);
 return public.wave1_creator_eligibility_readback();
end $$;
revoke all on function public.declare_creator_money_eligibility(boolean,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.declare_creator_money_eligibility(boolean,text,text,text) to authenticated;

alter function public.wave1_creator_eligibility_readback() rename to wave1_creator_eligibility_readback_pre_automatic;
revoke all on function public.wave1_creator_eligibility_readback_pre_automatic() from public,anon,authenticated,service_role;
create function public.wave1_creator_eligibility_readback() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare session jsonb:=public.wave1_session_authority_readback(); u uuid:=auth.uid(); s uuid; mode text;
 r jsonb; d private.creator_eligibility_declarations;
begin
 mode:=case when exists(select 1 from public.platform_money_kill_switches where key='live_money_enabled' and state='on') then 'production' else 'sandbox' end;
 if u is null or session->>'state' is distinct from 'ACTIVE' or session->'restoreOnly' is distinct from 'false'::jsonb
  or session->>'userId' is distinct from u::text or session->>'accountId' is distinct from u::text
  or coalesce(auth.jwt()->>'session_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  or session->>'sessionGeneration' is distinct from auth.jwt()->>'session_id'
 then return session||jsonb_build_object('state','PENDING_VERIFICATION','canCreateMoneyExposure',false,
  'canProcessHistoricalObligations',true,'reasonCodes',jsonb_build_array('creator_session_authority_required')); end if;
 s:=(auth.jwt()->>'session_id')::uuid;
 if private.ordinary_commerce_subject_current(u,s,mode) is not true then
  return session||jsonb_build_object('state','PENDING_VERIFICATION','canCreateMoneyExposure',false,
   'canProcessHistoricalObligations',true,'reasonCodes',jsonb_build_array('current_mode_premium_required'));
 end if;
 perform private.lock_ordinary_creator_subject(u,s,mode);
 perform private.refresh_ordinary_creator_eligibility(u);
 r:=public.wave1_creator_eligibility_readback_pre_automatic();
 select * into d from private.creator_eligibility_declarations where creator_id=u order by id desc limit 1;
 return r||jsonb_build_object('rollout','AUTOMATIC_PREMIUM_UNITED_STATES','declaration',
 case when d.id is null then null else jsonb_build_object('version',d.declaration_version,
 'declared18Plus',d.declared_18_plus,'countryCode',d.country_code,'regionCode',d.region_code,
 'source','self_declaration','declaredAt',d.declared_at) end);
end $$;
revoke all on function public.wave1_creator_eligibility_readback() from public,anon,authenticated,service_role;
grant execute on function public.wave1_creator_eligibility_readback() to authenticated;

-- Extend source admission without adding writes to any buyer/RLS predicate.
do $patch$
declare definition text; needle text;
begin
 definition:=pg_get_functiondef('public.wave1_creator_money_subject_authorized_internal(uuid)'::regprocedure);
 needle:='select p_creator_id is not null';
 if position(needle in definition)=0 then raise exception 'creator_subject_patch_missing'; end if;
 execute replace(definition,needle,needle||' and private.ordinary_creator_provider_ready(p_creator_id,
 case when exists(select 1 from public.platform_money_kill_switches where key=''live_money_enabled'' and state=''on'') then ''production'' else ''sandbox'' end)');
 definition:=pg_get_functiondef('public.wave1_assert_current_creator_money_authority_internal()'::regprocedure);
 needle:='  v_legal := public."wave1_legal_requirements_readback"(''creator_money'');';
 if position(needle in definition)=0 then raise exception 'creator_assertion_patch_missing'; end if;
 execute replace(definition,needle,'  perform private.lock_ordinary_creator_subject(v_user,(auth.jwt()->>''session_id'')::uuid,
 case when exists(select 1 from public.platform_money_kill_switches where key=''live_money_enabled'' and state=''on'') then ''production'' else ''sandbox'' end);
 perform private.refresh_ordinary_creator_eligibility(v_user);
 if not public.wave1_creator_money_subject_authorized_internal(v_user) then raise exception ''creator_eligibility_required'' using errcode=''42501''; end if;
'||needle);
 definition:=pg_get_functiondef('public.get_creator_connect_onboarding_route(uuid,uuid)'::regprocedure);
 needle:=' select * into p from private.creator_connect_onboarding_policy;';
 if position(needle in definition)=0 then raise exception 'creator_connect_route_patch_missing'; end if;
 execute replace(definition,needle,' perform private.lock_ordinary_creator_subject(p_creator,p_session,
 case when exists(select 1 from public.platform_money_kill_switches where key=''live_money_enabled'' and state=''on'') then ''production'' else ''sandbox'' end);
 perform private.refresh_ordinary_creator_eligibility(p_creator);
'||needle);
end $patch$;
commit;
