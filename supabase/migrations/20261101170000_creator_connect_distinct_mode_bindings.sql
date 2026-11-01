begin;
-- Separate accounts, not conversion or replacement. Existing row IDs and all
-- references remain unchanged. No provider operation or policy is enabled.
alter table public.creator_payout_accounts drop constraint creator_payout_accounts_creator_user_id_key;
alter table public.creator_payout_accounts add constraint creator_payout_accounts_creator_provider_mode_key unique(creator_user_id,provider,provider_environment);
create table private.creator_connect_mode_bindings (
 creator_id text not null, environment text not null check(environment in ('test','live')),
 payout_account_id uuid not null unique references public.creator_payout_accounts(id),
 provider_account_id text not null, recorded_at timestamptz not null default clock_timestamp(),
 primary key(creator_id,environment), unique(environment,provider_account_id)
);
create table private.creator_connect_live_setup_consents (
 id uuid primary key default gen_random_uuid(),
 creator_id uuid not null, session_id uuid not null, policy_id uuid not null references private.creator_connect_onboarding_policy(id),
 policy_snapshot jsonb not null,
 test_payout_account_id uuid not null references public.creator_payout_accounts(id),
 test_provider_account_id text, disclosure_version text not null check(disclosure_version='distinct-live-account-v1'),
 confirmed_at timestamptz not null default clock_timestamp()
);
create index creator_connect_live_setup_consents_subject_idx on private.creator_connect_live_setup_consents(creator_id,session_id,policy_id);
alter table private.creator_connect_mode_bindings enable row level security;
alter table private.creator_connect_mode_bindings force row level security;
alter table private.creator_connect_live_setup_consents enable row level security;
alter table private.creator_connect_live_setup_consents force row level security;
revoke all on private.creator_connect_mode_bindings,private.creator_connect_live_setup_consents from public,anon,authenticated,service_role;
insert into private.creator_connect_mode_bindings(creator_id,environment,payout_account_id,provider_account_id)
 select creator_user_id,provider_environment,id,provider_account_id from public.creator_payout_accounts
 where provider='stripe_connect' and provider_environment in ('test','live') and nullif(provider_account_id,'') is not null;
create function private.retain_creator_connect_mode_binding() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and exists(select 1 from private.creator_connect_mode_bindings b where b.payout_account_id=old.id)
  and row(new.id,new.creator_user_id,new.provider,new.provider_environment,new.provider_account_id)
   is distinct from row(old.id,old.creator_user_id,old.provider,old.provider_environment,old.provider_account_id)
 then raise exception 'connect_account_binding_immutable'; end if;
 if new.provider='stripe_connect' and new.provider_environment in ('test','live') and nullif(new.provider_account_id,'') is not null then
  insert into private.creator_connect_mode_bindings(creator_id,environment,payout_account_id,provider_account_id)
   values(new.creator_user_id,new.provider_environment,new.id,new.provider_account_id) on conflict do nothing;
  if not exists(select 1 from private.creator_connect_mode_bindings b where b.creator_id=new.creator_user_id
   and b.environment=new.provider_environment and b.payout_account_id=new.id and b.provider_account_id=new.provider_account_id)
  then raise exception 'connect_account_binding_conflict'; end if;
 end if;
 return new;
end $$;
revoke all on function private.retain_creator_connect_mode_binding() from public,anon,authenticated,service_role;
create trigger creator_connect_retain_mode_binding after insert or update on public.creator_payout_accounts
 for each row execute function private.retain_creator_connect_mode_binding();

create or replace function public.get_creator_connect_onboarding_route(p_creator uuid,p_session uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.creator_connect_onboarding_policy; a public.creator_payout_accounts; t public.creator_payout_accounts;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into p from private.creator_connect_onboarding_policy;
 select * into a from public.creator_payout_accounts where creator_user_id=p_creator::text and provider='stripe_connect' and provider_environment='live';
 select * into t from public.creator_payout_accounts where creator_user_id=p_creator::text and provider='stripe_connect' and provider_environment='test';
 if p.id is null and a.id is null then return jsonb_build_object('mode','test'); end if;
 if p.id is null or not p.enabled or p.verified_at>clock_timestamp() or p.expires_at<=clock_timestamp()
 then return jsonb_build_object('mode','live','status','not_configured'); end if;
 if not private.creator_connect_onboarding_subject(p_creator,p_session)
 then return jsonb_build_object('mode','live','status','creator_onboarding_eligibility_required'); end if;
 if a.id is not null and nullif(a.provider_account_id,'') is null
 then return jsonb_build_object('mode','live','status','account_migration_review_required'); end if;
 if a.id is null and t.id is not null and not exists(select 1 from private.creator_connect_live_setup_consents c
  where c.creator_id=p_creator and c.session_id=p_session and c.policy_id=p.id
   and c.policy_snapshot=to_jsonb(p)
   and c.test_payout_account_id=t.id and c.test_provider_account_id is not distinct from t.provider_account_id)
 then return jsonb_build_object('mode','live','status','live_setup_confirmation_required','disclosureVersion','distinct-live-account-v1'); end if;
 return jsonb_build_object('mode','live','status','available','policyId',p.id,'platformAccountId',p.platform_account_id,
   'configurationKey',p.configuration_key,'country',p.country,'currency',p.currency,'returnUrl',p.return_url,'refreshUrl',p.refresh_url,
   'creatorId',p_creator,'sessionId',p_session,'accountId',a.provider_account_id);
end $$;
create function public.confirm_creator_connect_live_setup(p_creator uuid,p_session uuid,p_disclosure text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;p private.creator_connect_onboarding_policy;t public.creator_payout_accounts;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('connect-creator:'||p_creator::text,0));
 r:=public.get_creator_connect_onboarding_route(p_creator,p_session);
 if p_disclosure is distinct from 'distinct-live-account-v1' then raise exception 'live_setup_disclosure_required'; end if;
 if r->>'status'='available' then return r; end if;
 if r->>'status' is distinct from 'live_setup_confirmation_required' then return r; end if;
 select * into p from private.creator_connect_onboarding_policy where enabled for share;
 select * into t from public.creator_payout_accounts where creator_user_id=p_creator::text and provider='stripe_connect' and provider_environment='test' for share;
 if t.id is null then raise exception 'test_account_binding_required'; end if;
 insert into private.creator_connect_live_setup_consents(creator_id,session_id,policy_id,policy_snapshot,test_payout_account_id,test_provider_account_id,disclosure_version)
 values(p_creator,p_session,p.id,to_jsonb(p),t.id,t.provider_account_id,p_disclosure);
 return public.get_creator_connect_onboarding_route(p_creator,p_session);
end $$;
revoke all on function public.confirm_creator_connect_live_setup(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.confirm_creator_connect_live_setup(uuid,uuid,text) to service_role;

do $patch$
declare d text;old text;new text;
begin
 d:=pg_get_functiondef('public.record_creator_connect_created_account(uuid,uuid,uuid,text,jsonb)'::regprocedure);
 old:='select * into existing from public.creator_payout_accounts where creator_user_id=p_creator::text for update;';
 new:='select * into existing from public.creator_payout_accounts where creator_user_id=p_creator::text and provider=''stripe_connect'' and provider_environment=''live'' for update;';
 if position(old in d)=0 then raise exception 'connect_creation_binding_patch_missing'; end if;
 execute replace(d,old,new);
 d:=pg_get_functiondef('private.project_creator_connect_observed_eligibility()'::regprocedure);
 old:='begin';
 new:='begin
  perform pg_advisory_xact_lock(hashtextextended(''connect-creator:''||new.creator_user_id,0));
  -- A delayed test callback may refresh its own historical account only. Once
  -- a distinct live row exists it must never replace current live readiness.
  if new.provider_environment=''test'' and exists(select 1 from public.creator_payout_accounts a
   where a.creator_user_id=new.creator_user_id and a.provider=''stripe_connect'' and a.provider_environment=''live'')
  then return new; end if;';
 if position(old in d)=0 then raise exception 'connect_projection_binding_patch_missing'; end if;
 execute replace(d,old,new);
end $patch$;
commit;
