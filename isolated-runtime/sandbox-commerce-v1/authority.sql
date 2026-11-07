-- INACTIVE INSTALL SOURCE. Install in the same transaction as core.sql, after
-- core creates the fresh schema/roles/tables and premium-authority.sql helpers.
-- No existing function, policy, trigger or authority row is changed here.
-- The existing postgres owner must be independently attested before deployment.
-- row_security=off is intentionally an ERROR when unfiltered reads are unavailable.
-- Creating as the fresh role before changing ownership avoids applying postgres
-- default function ACLs. Native ACL/ownership validation is required at install.
set local role sbx_v1_authority_owner;

create function sandbox_commerce_v1.legal_current(
  p_user uuid, p_session uuid, p_creator boolean, p_at timestamptz
) returns boolean
language plpgsql stable security invoker set search_path = '' set row_security = off
as $$
begin
  -- Source: 20260824034109 integrity closeout, configuration at 101,
  -- all-active-session creator acceptance at 168, exact buyer session at 540.
  return (with canonical(document_key, capability) as (
    values ('terms'::text, 'account'::text), ('privacy', 'account'),
      ('community_guidelines', 'account'), ('creator_terms', 'creator'),
      ('money_terms', 'creator_money')
  ), required as (
    select * from canonical where p_creator or capability = 'account'
  ), configured as (
    select d.document_key, d.capability
    from public.wave1_legal_document_versions d
    where d.active and d.market = 'UNITED_STATES'
      and nullif(btrim(d.version), '') is not null and d.effective_at <= p_at
      and (d.capability = 'account' or (p_creator and d.capability in ('creator', 'creator_money')))
  ), subject_role as (
    select coalesce((select nullif(lower(btrim(p.channel_role)), '')
      from public.user_profiles p where p.user_id = p_user::text), 'member') as role_key
  ), sessions as (
    select s.id from auth.sessions s where s.user_id = p_user
      and (s.not_after is null or s.not_after > p_at)
      and (p_creator or s.id = p_session)
  )
  select coalesce(p_user is not null and p_session is not null
    and p_creator is not null and p_at is not null
    and exists (select 1 from sessions)
    and not exists (select 1 from required r where not exists
      (select 1 from configured c where c.document_key = r.document_key and c.capability = r.capability))
    and not exists (select 1 from configured c where not exists
      (select 1 from required r where r.document_key = c.document_key and r.capability = c.capability))
    and not exists (
      select 1 from sessions s cross join public.wave1_legal_document_versions d
      cross join subject_role r
      -- Preserve the source's stronger acceptance loop: even a future active
      -- document requires acceptance; effective_at only gates configuration.
      where d.active and d.market = 'UNITED_STATES'
        and (d.capability = 'account' or (p_creator and d.capability in ('creator', 'creator_money')))
        and not exists (select 1 from public.wave1_legal_acceptances a
          where a.user_id = p_user and a.session_generation = s.id::text
            and a.document_key = d.document_key and a.document_version = d.version
            and a.market = d.market and a.capability = d.capability
            and a.role_key = r.role_key and a.invalidated_at is null)
    ), false));
end;
$$;

create function sandbox_commerce_v1.creator_facts_current(p_user uuid)
returns boolean
language plpgsql stable security invoker set search_path = '' set row_security = off
as $$
begin
  -- Defer relation query planning until execution under assert_authority's
  -- final protected owner. The fresh installer role has no RLS bypass or
  -- table SELECT authority; forced RLS is already enabled during creation.
  -- Pure admission equivalent of 20261106001353 refresh + 20261106005532
  -- sandbox predicate. Never updates wave1 eligibility or claims VERIFIED.
  -- Provider readiness can only move null to true (explicit false is sticky),
  -- and BOTH pending and verified qualify: those provider joins are unnecessary
  -- for this boolean. Exact provider-readiness display is not implemented here.
  return (select coalesce(
    (e.state is null or e.state in ('INELIGIBLE', 'PENDING_VERIFICATION', 'VERIFIED'))
    and (e.account_status is null or e.account_status in ('ACTIVE', 'UNKNOWN'))
    and coalesce(e.age_18_plus, d.user_id is not null) is true
    and case when coalesce(e.market, 'UNKNOWN') = 'UNKNOWN' and d.user_id is not null
      then 'UNITED_STATES' else coalesce(e.market, 'UNKNOWN') end = 'UNITED_STATES'
    and coalesce(e.moderation_state, 'CLEAR') = 'CLEAR'
    and coalesce(e.creator_role, true) is true
    and coalesce(e.platform_capability, true) is true
    and e.provider_eligible is not false and e.kyc_complete is not false
    and e.tax_complete is not false and e.sanctions_clear is not false
    and e.payout_eligible is not false
    -- V1 keeps explicit negative declarations (the original append-only API
    -- admitted positive declarations only). A later negative never borrows
    -- an older positive legacy fact. Declarations are not session credentials.
    and not exists (select 1 from sandbox_commerce_v1.declarations negative
      where negative.user_id = p_user and (negative.session_id is null or negative.declared_18_plus is not true
        or negative.country_code is distinct from 'US'
        or negative.declaration_version is distinct from 'adult-us-creator-v1'
        or negative.region_code is null or negative.region_code not in
          ('AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY')))
    and not exists (select 1 from public.creator_payout_eligibility_records h
      where h.creator_user_id = p_user::text and (h.fraud_hold_active
        or h.admin_review_status in ('pending_review', 'rejected', 'on_hold')
        or h.eligibility_status = 'on_hold'))
    and not exists (select 1 from public.creator_payout_accounts a
      where a.creator_user_id = p_user::text and a.provider_environment = 'test'
        and (nullif(btrim(a.disabled_reason), '') is not null
          or a.status in ('restricted', 'rejected', 'disabled'))), false)
  from (values (p_user)) subject(user_id)
  left join public.wave1_creator_eligibility e on e.creator_user_id = subject.user_id
  left join sandbox_commerce_v1.declarations d on d.user_id = subject.user_id
    and d.session_id is not null and d.declared_18_plus is true
    and d.country_code = 'US' and d.declaration_version = 'adult-us-creator-v1'
    and d.region_code in ('AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'));
end;
$$;

create function sandbox_commerce_v1.assert_authority(
  p_user uuid, p_session uuid, p_operation text
) returns jsonb
language plpgsql volatile security definer set search_path = '' set row_security = off
as $$
declare
  decision_at timestamptz;
  valid_until timestamptz;
  session_until timestamptz;
  premium_until timestamptz;
  legal_until timestamptz;
  effective_session uuid := p_session;
  is_creator boolean := p_operation in ('creator', 'creator_subject');
begin
  -- Only the closed core definer may call this API with authenticated transport
  -- identity. User-supplied claims/GUCs are never identity or admission proof.
  -- Core first takes its immutable generation gate, and rechecks valid_until
  -- with clock_timestamp() immediately before every local authority-dependent
  -- effect. The result must never be cached or used in another transaction.
  if p_user is null
    or p_operation is null or p_operation not in ('creator', 'creator_subject', 'buyer', 'delivery')
    or (p_operation = 'creator_subject' and p_session is not null)
    or (p_operation <> 'creator_subject' and p_session is null)
    or current_setting('transaction_isolation') is distinct from 'read committed'
  then raise exception 'sandbox_authority_context_invalid' using errcode = '42501'; end if;

  -- Table fences protect absent rows and legacy writers without calling their
  -- helpers. NO tuple locks/shared-table FKs: ROW SHARE is compatible and an
  -- old tuple lock followed by DML can otherwise form a deadlock cycle.
  -- NOWAIT error aborts the operation; never catch it and continue partially.
  lock table auth.sessions, auth.users, public.account_deletion_requests,
    public.user_profiles, public.wave1_legal_acceptances,
    public.wave1_legal_document_versions in share mode nowait;
  if p_operation <> 'delivery' then
    lock table public.platform_money_kill_switches in share mode nowait;
  end if;
  if is_creator then
    lock table public.access_grants, public.creator_payout_accounts,
      public.creator_payout_eligibility_records, public.monetization_products,
      public.provider_events, public.revenuecat_consumable_transaction_intents,
      public.revenuecat_premium_transaction_authority,
      public.revenuecat_terminal_authority_quarantine_resolutions,
      public.revenuecat_terminal_authority_quarantines,
      public.revenuecat_unbound_initial_authority,
      public.revenuecat_unbound_terminal_authority, public.user_entitlements,
      public.wave1_creator_eligibility,
      sandbox_commerce_v1.declarations in share mode nowait;
  end if;
  decision_at := clock_timestamp();
  valid_until := transaction_timestamp() + interval '5 seconds';
  if decision_at < transaction_timestamp() or decision_at >= valid_until then
    raise exception 'sandbox_authority_transaction_expired' using errcode = '42501';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user
      and u.deleted_at is null and u.email_confirmed_at is not null
      and coalesce(u.raw_app_meta_data ->> 'accountDeidentified', 'false') <> 'true'
      and (u.banned_until is null or u.banned_until <= decision_at)
      and (not is_creator or u.is_anonymous is false))
    or exists (select 1 from public.account_deletion_requests r
      where r.user_id = p_user and r.status in ('scheduled', 'completed'))
  then raise exception 'sandbox_current_account_required' using errcode = '42501'; end if;
  if p_operation = 'creator_subject' then
    -- Seller admission is independent of the buyer and the historic authoring
    -- session. Source permits any active seller session; creator legal below
    -- still checks EVERY active seller session, not just the selected one.
    select s.id into effective_session from auth.sessions s where s.user_id = p_user
      and (s.not_after is null or s.not_after > decision_at)
      order by s.not_after desc nulls first, s.id limit 1;
  end if;
  select s.not_after into session_until from auth.sessions s
    where s.id = effective_session and s.user_id = p_user
      and (s.not_after is null or s.not_after > decision_at);
  if not found then raise exception 'sandbox_current_session_required' using errcode = '42501'; end if;
  valid_until := least(valid_until, session_until);

  if sandbox_commerce_v1.legal_current(p_user, effective_session, is_creator, decision_at) is not true
  then raise exception 'sandbox_current_legal_required' using errcode = '42501'; end if;
  -- A future effective configuration can change completeness without DML.
  -- Table locks alone cannot freeze that transition; expire this decision first.
  select min(d.effective_at) into legal_until from public.wave1_legal_document_versions d
    where d.active and d.market = 'UNITED_STATES' and d.effective_at > decision_at
      and (d.capability = 'account' or (is_creator and d.capability in ('creator', 'creator_money')));
  valid_until := least(valid_until, legal_until);
  -- Initiation is exclusively sandbox. Historical delivery retains current
  -- buyer/account/session/legal checks without requiring today's money mode.
  if p_operation <> 'delivery' and exists (
      select 1 from (values ('live_money_enabled'), ('payouts_enabled'), ('cashout_enabled')) required(key)
      where not exists (select 1 from public.platform_money_kill_switches k
        where k.key = required.key and k.state = 'off'))
  then raise exception 'sandbox_financial_controls_required' using errcode = '42501'; end if;
  if is_creator then
    premium_until := sandbox_commerce_v1.premium_valid_until(p_user, decision_at);
    if premium_until is null or premium_until <= decision_at
      or sandbox_commerce_v1.creator_facts_current(p_user) is not true
    then raise exception 'sandbox_creator_authority_required' using errcode = '42501'; end if;
    valid_until := least(valid_until, premium_until);
  end if;
  if clock_timestamp() >= valid_until then
    raise exception 'sandbox_authority_expired' using errcode = '42501';
  end if;
  return jsonb_build_object('user_id', p_user, 'session_id', effective_session,
    'operation', p_operation, 'valid_until', valid_until,
    'creator', is_creator);
end;
$$;

revoke all on function sandbox_commerce_v1.legal_current(uuid,uuid,boolean,timestamptz),
  sandbox_commerce_v1.creator_facts_current(uuid),
  sandbox_commerce_v1.assert_authority(uuid,uuid,text)
  from public, anon, authenticated, service_role, sbx_v1_core_owner;
reset role;
alter function sandbox_commerce_v1.legal_current(uuid,uuid,boolean,timestamptz) owner to postgres;
alter function sandbox_commerce_v1.creator_facts_current(uuid) owner to postgres;
alter function sandbox_commerce_v1.assert_authority(uuid,uuid,text) owner to postgres;
grant execute on function sandbox_commerce_v1.assert_authority(uuid,uuid,text) to sbx_v1_core_owner;

-- No SELECT/MAINTAIN/table-write grant or policy is added on any shared table.
-- Native PG17 proof must verify the final owner/ACL and forced-RLS failures.
-- Operational deployment additionally requires known safe schema/search-path,
-- owner/default-ACL/event-trigger facts via an expressly permitted process.
-- This file does not obtain those facts or authorize a metadata query.
