-- Creator-money authority integrity closeout.
--
-- Forward-only and source-only: this migration performs no provider call, payout,
-- production deployment, product activation, store submission, or release action.
-- Historical earnings rows remain immutable. Mutable lifecycle truth is projected
-- exclusively from a separate append-only, service-owned event stream.

-- Provider localized prices are accepted only for an explicit ISO-4217 currency
-- and its canonical minor-unit exponent. The webhook performs the decimal-to-minor
-- conversion with the same map; this database check is the independent authority
-- boundary which rejects invented codes such as ZZZ. Creator payout remains USD
-- only even though access and earnings evidence may retain an exact non-USD value.
create or replace function public."money_currency_minor_unit_exponent_internal"(
  p_currency text
)
returns smallint
language sql
immutable
security definer
set search_path = ''
as $$
  select case lower(trim(coalesce(p_currency, '')))
    when 'bif' then 0 when 'clp' then 0 when 'djf' then 0 when 'gnf' then 0
    when 'isk' then 0 when 'jpy' then 0 when 'kmf' then 0 when 'krw' then 0
    when 'pyg' then 0 when 'rwf' then 0 when 'ugx' then 0
    when 'vnd' then 0 when 'vuv' then 0 when 'xaf' then 0 when 'xof' then 0
    when 'xpf' then 0
    when 'bhd' then 3 when 'iqd' then 3 when 'jod' then 3 when 'kwd' then 3
    when 'lyd' then 3 when 'omr' then 3 when 'tnd' then 3
    when 'aed' then 2 when 'afn' then 2 when 'all' then 2 when 'amd' then 2
    when 'aoa' then 2 when 'ars' then 2 when 'aud' then 2
    when 'awg' then 2 when 'azn' then 2 when 'bam' then 2 when 'bbd' then 2
    when 'bdt' then 2 when 'bmd' then 2 when 'bnd' then 2
    when 'bob' then 2 when 'brl' then 2 when 'bsd' then 2 when 'btn' then 2
    when 'bwp' then 2 when 'byn' then 2 when 'bzd' then 2 when 'cad' then 2
    when 'cdf' then 2 when 'chf' then 2 when 'cny' then 2 when 'cop' then 2
    when 'crc' then 2 when 'cve' then 2 when 'czk' then 2 when 'dkk' then 2
    when 'dop' then 2 when 'dzd' then 2 when 'egp' then 2 when 'ern' then 2
    when 'etb' then 2 when 'eur' then 2 when 'fjd' then 2 when 'fkp' then 2
    when 'gbp' then 2 when 'gel' then 2 when 'ghs' then 2 when 'gip' then 2
    when 'gmd' then 2 when 'gtq' then 2 when 'gyd' then 2 when 'hkd' then 2
    when 'hnl' then 2 when 'htg' then 2 when 'huf' then 2 when 'idr' then 2
    when 'ils' then 2 when 'inr' then 2 when 'irr' then 2 when 'jmd' then 2
    when 'kes' then 2 when 'kgs' then 2 when 'khr' then 2 when 'kyd' then 2
    when 'kzt' then 2 when 'lak' then 2 when 'lbp' then 2 when 'lkr' then 2
    when 'lrd' then 2 when 'lsl' then 2 when 'mad' then 2 when 'mdl' then 2
    when 'mga' then 2
    when 'mkd' then 2 when 'mmk' then 2 when 'mnt' then 2 when 'mop' then 2
    when 'mru' then 2 when 'mur' then 2 when 'mvr' then 2 when 'mwk' then 2
    when 'mxn' then 2 when 'myr' then 2 when 'mzn' then 2 when 'nad' then 2
    when 'ngn' then 2 when 'nio' then 2 when 'nok' then 2 when 'npr' then 2
    when 'nzd' then 2 when 'pab' then 2 when 'pen' then 2 when 'pgk' then 2
    when 'php' then 2 when 'pkr' then 2 when 'pln' then 2 when 'qar' then 2
    when 'ron' then 2 when 'rsd' then 2 when 'rub' then 2 when 'sar' then 2
    when 'sbd' then 2 when 'scr' then 2 when 'sdg' then 2 when 'sek' then 2
    when 'sgd' then 2 when 'shp' then 2 when 'sle' then 2 when 'sos' then 2
    when 'srd' then 2 when 'ssp' then 2 when 'stn' then 2 when 'svc' then 2
    when 'szl' then 2 when 'thb' then 2 when 'tjs' then 2 when 'tmt' then 2
    when 'top' then 2 when 'try' then 2 when 'ttd' then 2 when 'twd' then 2
    when 'tzs' then 2 when 'uah' then 2 when 'usd' then 2 when 'uyu' then 2
    when 'uzs' then 2 when 'ves' then 2 when 'wst' then 2 when 'xcd' then 2
    when 'xcg' then 2
    when 'yer' then 2 when 'zar' then 2 when 'zmw' then 2 when 'zwg' then 2
    else null
  end::smallint;
$$;
revoke all on function public."money_currency_minor_unit_exponent_internal"(text)
  from public, anon, authenticated, service_role;

-- Legal authority is scoped to the exact authenticated session which accepted it.
alter table public."wave1_legal_document_versions"
  drop constraint if exists "wave1_legal_document_key_check";
alter table public."wave1_legal_document_versions"
  add constraint "wave1_legal_document_key_check" check (
    "document_key" in (
      'terms','privacy','community_guidelines','creator_terms','money_terms',
      'payout_terms'
    )
  );
alter table public."wave1_legal_document_versions"
  drop constraint if exists "wave1_legal_document_capability_check";
alter table public."wave1_legal_document_versions"
  add constraint "wave1_legal_document_capability_check" check (
    "capability" in ('account','creator','creator_money','payout')
  );
drop index if exists public."wave1_legal_acceptance_exact_unique";
create unique index "wave1_legal_acceptance_exact_session_unique"
  on public."wave1_legal_acceptances" (
    "user_id", "document_key", "document_version", "market", "role_key",
    "capability", "session_generation"
  )
  where "user_id" is not null and "invalidated_at" is null;
create index if not exists "wave1_legal_acceptance_session_lookup_idx"
  on public."wave1_legal_acceptances" ("user_id", "session_generation", "capability")
  where "user_id" is not null and "invalidated_at" is null;

-- Legal acceptance is meaningful only when the active configuration contains
-- the complete canonical document set for the requested authority tier. This
-- makes an empty, partial, cross-capability, blank-version, or future-only
-- configuration fail closed instead of vacuously reporting all accepted.
create or replace function public."wave1_legal_document_configuration_complete_internal"(
  p_capability text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with requested as (
    select case lower(trim(coalesce(p_capability, '')))
      when 'account' then 1
      when 'creator' then 2
      when 'creator_money' then 3
      when 'payout' then 4
      else 0
    end as tier
  ), canonical("document_key", "capability", "tier") as (
    values
      ('terms'::text, 'account'::text, 1),
      ('privacy'::text, 'account'::text, 1),
      ('community_guidelines'::text, 'account'::text, 1),
      ('creator_terms'::text, 'creator'::text, 2),
      ('money_terms'::text, 'creator_money'::text, 3),
      ('payout_terms'::text, 'payout'::text, 4)
  ), applicable_documents as (
    select document."document_key", document."capability"
    from public."wave1_legal_document_versions" document
    cross join requested
    where requested.tier > 0
      and document."active"
      and document."market" = 'UNITED_STATES'
      and nullif(trim(document."version"), '') is not null
      and document."effective_at" <= timezone('utc'::text, now())
      and document."capability" in (
        'account',
        case when requested.tier >= 2 then 'creator' else 'account' end,
        case when requested.tier >= 3 then 'creator_money' else 'account' end,
        case when requested.tier >= 4 then 'payout' else 'account' end
      )
  )
  select requested.tier > 0
    and not exists (
      select 1
      from canonical required
      where required.tier <= requested.tier
        and not exists (
          select 1
          from applicable_documents configured
          where configured."document_key" = required."document_key"
            and configured."capability" = required."capability"
        )
    )
    and not exists (
      select 1
      from applicable_documents configured
      where not exists (
        select 1
        from canonical required
        where required.tier <= requested.tier
          and required."document_key" = configured."document_key"
          and required."capability" = configured."capability"
      )
    )
  from requested;
$$;

create or replace function public."wave1_user_has_active_legal_requirements_internal"(
  p_user_id uuid,
  p_capability text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_capability text := lower(trim(coalesce(p_capability, 'account')));
  v_role text;
begin
  if p_user_id is null or v_capability not in ('account', 'creator', 'creator_money', 'payout') then
    return false;
  end if;
  if not public."wave1_legal_document_configuration_complete_internal"(v_capability) then
    return false;
  end if;

  select coalesce(nullif(lower(trim(profile."channel_role")), ''), 'member')
    into v_role
  from public."user_profiles" profile
  where profile."user_id" = p_user_id::text;
  v_role := coalesce(v_role, 'member');

  return exists (
    select 1
    from auth.sessions session_presence
    where session_presence."user_id" = p_user_id
      and (session_presence."not_after" is null or session_presence."not_after" > timezone('utc'::text, now()))
  ) and not exists (
    select 1
    from auth.sessions session_row
    where session_row."user_id" = p_user_id
      and (session_row."not_after" is null or session_row."not_after" > timezone('utc'::text, now()))
      and exists (
        select 1
        from public."wave1_legal_document_versions" document
        where document."active"
          and document."market" = 'UNITED_STATES'
          and (
            document."capability" = 'account'
            or (v_capability in ('creator', 'creator_money', 'payout') and document."capability" = 'creator')
            or (v_capability in ('creator_money', 'payout') and document."capability" = 'creator_money')
            or (v_capability = 'payout' and document."capability" = 'payout')
          )
          and not exists (
            select 1
            from public."wave1_legal_acceptances" acceptance
            where acceptance."user_id" = p_user_id
              and acceptance."session_generation" = session_row."id"::text
              and acceptance."document_key" = document."document_key"
              and acceptance."document_version" = document."version"
              and acceptance."market" = document."market"
              and acceptance."capability" = document."capability"
              and acceptance."role_key" = v_role
              and acceptance."invalidated_at" is null
          )
      )
  );
end;
$$;

create or replace function public."wave1_creator_money_subject_authorized_internal"(p_creator_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_creator_id is not null
    and not public."is_account_access_restricted"(p_creator_id::text)
    and public."wave1_user_has_active_legal_requirements_internal"(p_creator_id, 'creator_money')
    and exists (
      select 1
      from public."wave1_creator_eligibility" eligibility
      where eligibility."creator_user_id" = p_creator_id
        and eligibility."state" = 'VERIFIED'
        and eligibility."account_status" = 'ACTIVE'
        and eligibility."age_18_plus"
        and eligibility."legal_accepted"
        and eligibility."creator_role"
        and eligibility."moderation_state" = 'CLEAR'
        and eligibility."market" = 'UNITED_STATES'
        and eligibility."rollout_eligible"
        and eligibility."platform_capability"
        and eligibility."provider_eligible"
        and eligibility."kyc_complete"
        and eligibility."tax_complete"
        and eligibility."sanctions_clear"
        and eligibility."payout_eligible"
    );
$$;

alter function public."wave1_accept_legal_documents"(jsonb,text,uuid,uuid,text,text)
  rename to "wave1_accept_legal_documents_pre_integrity_closeout";
create or replace function public."wave1_accept_legal_documents"(
  p_acceptances jsonb,
  p_market text,
  p_expected_user_id uuid,
  p_expected_account_id uuid,
  p_session_generation text,
  p_capability text default 'account'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session jsonb := public."wave1_session_authority_readback"();
  v_user uuid := (v_session->>'userId')::uuid;
  v_generation text := v_session->>'sessionGeneration';
  v_capability text := lower(trim(coalesce(p_capability,'account')));
  v_role text;
  v_requirement record;
  v_expected_count integer := 0;
  v_operation_key text;
  v_acceptance_ids text := '';
  v_acceptance_id uuid;
begin
  if v_session->>'state'<>'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean,false)
    or public."is_account_access_restricted"(v_user::text)
  then
    raise exception 'account_access_restricted';
  end if;
  if p_expected_user_id is null
    or p_expected_account_id is distinct from p_expected_user_id
    or v_user is distinct from p_expected_user_id
    or (v_session->>'accountId')::uuid is distinct from p_expected_account_id
    or v_generation is distinct from nullif(trim(coalesce(p_session_generation,'')),'')
  then
    raise exception 'legal_session_binding_mismatch';
  end if;
  if p_market<>'UNITED_STATES' then raise exception 'legal_market_invalid'; end if;
  if jsonb_typeof(p_acceptances)<>'object' then raise exception 'legal_acceptances_invalid'; end if;
  if v_capability not in ('account','creator','creator_money','payout') then
    raise exception 'legal_capability_invalid';
  end if;
  if not public."wave1_legal_document_configuration_complete_internal"(v_capability) then
    raise exception 'legal_document_configuration_incomplete';
  end if;

  select coalesce(nullif(lower(trim(profile."channel_role")),''),'member')
  into v_role
  from public."user_profiles" profile
  where profile."user_id"=v_user::text;
  v_role:=coalesce(v_role,'member');

  for v_requirement in
    select document.*
    from public."wave1_legal_document_versions" document
    where document."active"
      and document."market"='UNITED_STATES'
      and document."effective_at"<=timezone('utc'::text,now())
      and (
        document."capability"='account'
        or (v_capability in ('creator','creator_money','payout') and document."capability"='creator')
        or (v_capability in ('creator_money','payout') and document."capability"='creator_money')
        or (v_capability='payout' and document."capability"='payout')
      )
  loop
    v_expected_count:=v_expected_count+1;
    if p_acceptances->>v_requirement."document_key" is distinct from v_requirement."version" then
      raise exception 'legal_version_mismatch:%',v_requirement."document_key";
    end if;
    insert into public."wave1_legal_acceptances" (
      "user_id","subject_hash","document_key","document_version","market","role_key",
      "capability","session_generation","authority_source"
    ) values (
      v_user,public."wave1_sha256"(v_user::text),v_requirement."document_key",
      v_requirement."version",'UNITED_STATES',v_role,v_requirement."capability",
      v_generation,'authenticated_rpc'
    ) on conflict do nothing returning "id" into v_acceptance_id;
    if found then v_acceptance_ids:=v_acceptance_ids||':'||v_acceptance_id::text; end if;
  end loop;
  if (select count(*) from jsonb_object_keys(p_acceptances))<>v_expected_count then
    raise exception 'legal_acceptance_set_mismatch';
  end if;
  if v_acceptance_ids<>'' then
    v_operation_key:=public."wave1_sha256"(
      v_user::text||':'||v_generation||':'||v_capability||':'||v_role||':'||
      p_acceptances::text||v_acceptance_ids
    );
    insert into public."wave1_authority_audit_events" (
      "domain","subject_hash","to_state","reason","authority_source","operation_key"
    ) values (
      'LEGAL_ACCEPTANCE',public."wave1_sha256"(v_user::text),'CURRENT_ACCEPTED',
      'exact_versions_accepted','authenticated_rpc',v_operation_key
    ) on conflict do nothing;
  end if;
  return public."wave1_legal_requirements_readback"(v_capability);
end;
$$;

create or replace function public."wave1_legal_requirements_readback"(p_capability text default 'account')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session jsonb := public."wave1_session_authority_readback"();
  v_user uuid := (v_session->>'userId')::uuid;
  v_generation text := v_session->>'sessionGeneration';
  v_capability text := lower(trim(coalesce(p_capability, 'account')));
  v_role text;
  v_requirements jsonb;
begin
  if v_session->>'state' <> 'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean, false)
    or public."is_account_access_restricted"(v_user::text)
  then
    raise exception 'account_access_restricted';
  end if;
  if v_capability not in ('account', 'creator', 'creator_money', 'payout') then
    raise exception 'legal_capability_invalid';
  end if;
  if not public."wave1_legal_document_configuration_complete_internal"(v_capability) then
    raise exception 'legal_document_configuration_incomplete';
  end if;

  select coalesce(nullif(lower(trim(profile."channel_role")), ''), 'member')
    into v_role
  from public."user_profiles" profile
  where profile."user_id" = v_user::text;
  v_role := coalesce(v_role, 'member');

  select coalesce(jsonb_agg(jsonb_build_object(
    'documentKey', document."document_key",
    'version', document."version",
    'state', case when accepted."id" is null then 'REQUIRED_UNACCEPTED' else 'CURRENT_ACCEPTED' end,
    'accepted', accepted."id" is not null,
    'acceptedAt', accepted."accepted_at"
  ) order by document."document_key"), '[]'::jsonb)
  into v_requirements
  from public."wave1_legal_document_versions" document
  left join lateral (
    select acceptance."id", acceptance."accepted_at"
    from public."wave1_legal_acceptances" acceptance
    where acceptance."user_id" = v_user
      and acceptance."session_generation" = v_generation
      and acceptance."document_key" = document."document_key"
      and acceptance."document_version" = document."version"
      and acceptance."market" = document."market"
      and acceptance."capability" = document."capability"
      and acceptance."role_key" = v_role
      and acceptance."invalidated_at" is null
    order by acceptance."accepted_at" desc
    limit 1
  ) accepted on true
  where document."active"
    and document."market" = 'UNITED_STATES'
    and (
      document."capability" = 'account'
      or (v_capability in ('creator', 'creator_money', 'payout') and document."capability" = 'creator')
      or (v_capability in ('creator_money', 'payout') and document."capability" = 'creator_money')
      or (v_capability = 'payout' and document."capability" = 'payout')
    );

  return v_session || jsonb_build_object(
    'market', 'UNITED_STATES',
    'roleKey', v_role,
    'capability', v_capability,
    'requirements', v_requirements,
    'allAccepted', not jsonb_path_exists(v_requirements, '$[*] ? (@.accepted == false)')
  );
end;
$$;

create or replace function public."wave1_enforce_creator_money_exposure"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'UPDATE' and tg_table_name = 'creator_monetization_configs' and new."status" in ('disabled', 'revoked'))
    or (tg_table_name = 'money_purchase_intents' and new."creator_id" is null)
  then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('wave1-creator:' || new."creator_id"::text, 0));
  if not public."wave1_creator_money_subject_authorized_internal"(new."creator_id")
  then
    raise exception 'creator_eligibility_required' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public."wave1_legal_document_configuration_complete_internal"(text) from public, anon, authenticated, service_role;
revoke all on function public."wave1_user_has_active_legal_requirements_internal"(uuid,text) from public, anon, authenticated, service_role;
revoke all on function public."wave1_creator_money_subject_authorized_internal"(uuid) from public, anon, authenticated, service_role;
revoke all on function public."wave1_accept_legal_documents_pre_integrity_closeout"(jsonb,text,uuid,uuid,text,text) from public, anon, authenticated, service_role;
revoke all on function public."wave1_accept_legal_documents"(jsonb,text,uuid,uuid,text,text) from public, anon;
grant execute on function public."wave1_accept_legal_documents"(jsonb,text,uuid,uuid,text,text) to authenticated, service_role;
revoke all on function public."wave1_legal_requirements_readback"(text) from public, anon;
grant execute on function public."wave1_legal_requirements_readback"(text) to authenticated, service_role;
revoke all on function public."wave1_enforce_creator_money_exposure"() from public, anon, authenticated, service_role;

-- Purchase authority is issued by one exact authenticated session. Pending
-- legacy rows predate that binding and are expired rather than guessed.
alter table public."money_purchase_intents"
  add column if not exists "session_generation" text;
update public."money_purchase_intents" intent
set "status"='expired',
    "expires_at"=least(intent."expires_at",timezone('utc'::text,now())),
    "revoked_at"=coalesce(intent."revoked_at",timezone('utc'::text,now())),
    "metadata"=coalesce(intent."metadata",'{}'::jsonb)||jsonb_build_object(
      'authority_granted',false,
      'integrity_closeout_reason','purchase_intent_session_generation_missing'
    ),
    "updated_at"=timezone('utc'::text,now())
where intent."status"='pending'
  and nullif(trim(coalesce(intent."session_generation",'')),'') is null;
alter table public."money_purchase_intents"
  drop constraint if exists "money_purchase_intents_session_generation_check";
alter table public."money_purchase_intents"
  add constraint "money_purchase_intents_session_generation_check" check (
    "status"<>'pending'
    or (
      "session_generation" is not null
      and "session_generation"=trim("session_generation")
      and length("session_generation") between 1 and 512
      and "session_generation" !~ '[[:cntrl:]]'
    )
  );
create index if not exists "money_purchase_intents_session_generation_idx"
  on public."money_purchase_intents"("user_id","session_generation","status","expires_at");

create or replace function public."bind_money_purchase_intent_session_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=auth.uid();
  v_generation text:=nullif(trim(coalesce(auth.jwt()->>'session_id','')),'');
begin
  if new."status"<>'pending' then return new; end if;
  if v_actor is not null then
    if new."user_id" is distinct from v_actor or v_generation is null then
      raise exception 'purchase_intent_session_identity_invalid';
    end if;
    new."session_generation":=v_generation;
  end if;
  if nullif(trim(coalesce(new."session_generation",'')),'') is null
    or not exists (
      select 1 from auth.sessions session_row
      where session_row."id"::text=new."session_generation"
        and session_row."user_id"=new."user_id"
        and (session_row."not_after" is null
          or session_row."not_after">timezone('utc'::text,now()))
    )
  then
    raise exception 'purchase_intent_current_session_required';
  end if;
  return new;
end;
$$;
drop trigger if exists "bind_money_purchase_intent_session" on public."money_purchase_intents";
create trigger "bind_money_purchase_intent_session"
before insert or update of "user_id","session_generation","status" on public."money_purchase_intents"
for each row execute function public."bind_money_purchase_intent_session_internal"();

create or replace function public."money_purchase_intent_session_authorized_internal"(
  p_user_id uuid,
  p_session_generation text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_generation text:=nullif(trim(coalesce(p_session_generation,'')),'');
  v_role text;
begin
  if p_user_id is null or v_generation is null
    or not public."wave1_legal_document_configuration_complete_internal"('account')
    or not exists (
      select 1 from auth.sessions session_row
      where session_row."id"::text=v_generation
        and session_row."user_id"=p_user_id
        and (session_row."not_after" is null
          or session_row."not_after">timezone('utc'::text,now()))
    )
  then
    return false;
  end if;
  select coalesce(nullif(lower(trim(profile."channel_role")),''),'member')
  into v_role
  from public."user_profiles" profile
  where profile."user_id"=p_user_id::text;
  v_role:=coalesce(v_role,'member');
  return not exists (
    select 1
    from public."wave1_legal_document_versions" document
    where document."active"
      and document."market"='UNITED_STATES'
      and document."capability"='account'
      and not exists (
        select 1 from public."wave1_legal_acceptances" acceptance
        where acceptance."user_id"=p_user_id
          and acceptance."session_generation"=v_generation
          and acceptance."document_key"=document."document_key"
          and acceptance."document_version"=document."version"
          and acceptance."market"=document."market"
          and acceptance."capability"='account'
          and acceptance."role_key"=v_role
          and acceptance."invalidated_at" is null
      )
  );
end;
$$;

-- A recurring store subscription is durable provider authority, not authority
-- borrowed forever from the client session that created its original intent.
-- Later renewals may proceed after ordinary session rotation only when the
-- account has at least one extant session and every extant generation has the
-- complete current account legal set. Initial/non-recurring purchases remain
-- bound to their one exact initiating session below.
create or replace function public."wave1_user_account_provider_authorized_internal"(
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and not public."is_account_access_restricted"(p_user_id::text)
    and not public."is_account_deletion_scheduled"(p_user_id::text)
    and public."wave1_legal_document_configuration_complete_internal"('account')
    and public."wave1_user_has_active_legal_requirements_internal"(p_user_id,'account');
$$;
revoke all on function public."bind_money_purchase_intent_session_internal"()
  from public,anon,authenticated,service_role;
revoke all on function public."money_purchase_intent_session_authorized_internal"(uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function public."wave1_user_account_provider_authorized_internal"(uuid)
  from public,anon,authenticated,service_role;

-- Stripe Tip checkout authority is also bound to the exact buyer account and
-- Supabase session generation that initiated the charge. Historical unfinished
-- rows without that proof are failed closed; completed provider facts remain
-- immutable and non-payable unless the service projector re-proves authority.
alter table public."creator_tip_transactions"
  add column if not exists "buyer_account_id" uuid,
  add column if not exists "buyer_session_generation" uuid;
update public."creator_tip_transactions" tip
set "status"='failed',
    "failed_at"=coalesce(tip."failed_at",timezone('utc'::text,now())),
    "payout_status"='not_payable',
    "metadata"=coalesce(tip."metadata",'{}'::jsonb)||jsonb_build_object(
      'authority_granted',false,
      'compensation_required',false,
      'integrity_closeout_reason','tip_buyer_session_generation_missing'
    ),
    "updated_at"=timezone('utc'::text,now())
where tip."status" in ('pending','checkout_started')
  and (tip."buyer_account_id" is null or tip."buyer_session_generation" is null);
alter table public."creator_tip_transactions"
  drop constraint if exists "creator_tip_transactions_buyer_session_check";
alter table public."creator_tip_transactions"
  add constraint "creator_tip_transactions_buyer_session_check" check (
    "status" not in ('pending','checkout_started')
    or (
      "buyer_account_id"="sender_id"
      and "buyer_session_generation" is not null
    )
  );
create index if not exists "creator_tip_transactions_buyer_session_idx"
  on public."creator_tip_transactions"(
    "sender_id","buyer_session_generation","status","created_at" desc
  );

create or replace function public."creator_tip_buyer_session_authority_internal"(
  p_user_id uuid,
  p_session_generation uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and p_session_generation is not null
    and not public."is_account_access_restricted"(p_user_id::text)
    and public."money_purchase_intent_session_authorized_internal"(
      p_user_id,p_session_generation::text
    );
$$;

create or replace function public."creator_tip_buyer_session_authority"(
  p_user_id uuid,
  p_session_generation uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_authorized boolean:=public."creator_tip_buyer_session_authority_internal"(
    p_user_id,p_session_generation
  );
begin
  return jsonb_build_object(
    'authorized',v_authorized,
    'state',case when v_authorized then 'ACTIVE' else 'BLOCKED' end,
    'reason',case when v_authorized then 'exact_buyer_session_current'
      else 'buyer_session_authority_not_current' end,
    'userId',p_user_id,
    'accountId',p_user_id,
    'sessionGeneration',p_session_generation
  );
end;
$$;

create or replace function public."enforce_creator_tip_buyer_session_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new."status" in ('pending','checkout_started') and (
    new."buyer_account_id" is distinct from new."sender_id"
    or not public."creator_tip_buyer_session_authority_internal"(
      new."sender_id",new."buyer_session_generation"
    )
  ) then
    raise exception 'tip_buyer_session_authority_not_current' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists "enforce_creator_tip_buyer_session" on public."creator_tip_transactions";
create trigger "enforce_creator_tip_buyer_session"
before insert or update of "sender_id","buyer_account_id","buyer_session_generation","status"
on public."creator_tip_transactions"
for each row execute function public."enforce_creator_tip_buyer_session_internal"();

revoke all on function public."creator_tip_buyer_session_authority_internal"(uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public."creator_tip_buyer_session_authority"(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public."creator_tip_buyer_session_authority"(uuid,uuid)
  to service_role;
revoke all on function public."enforce_creator_tip_buyer_session_internal"()
  from public,anon,authenticated,service_role;

create or replace function public."wave1_current_caller_authority_internal"()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_generation text:=nullif(trim(coalesce(auth.jwt()->>'session_id','')),'');
  v_session jsonb;
begin
  if v_user is null or v_generation is null then return false; end if;
  begin
    v_session:=public."wave1_session_authority_readback"();
  exception when others then
    return false;
  end;
  return v_session->>'state'='ACTIVE'
    and coalesce((v_session->>'restoreOnly')::boolean,false) is false
    and nullif(v_session->>'userId','') is not distinct from v_user::text
    and nullif(v_session->>'sessionGeneration','') is not distinct from v_generation
    and public."money_purchase_intent_session_authorized_internal"(v_user,v_generation);
end;
$$;
revoke all on function public."wave1_current_caller_authority_internal"()
  from public,anon,authenticated,service_role;

drop trigger if exists "wave1_money_purchase_intent_creator_authority" on public."money_purchase_intents";
create trigger "wave1_money_purchase_intent_creator_authority"
before insert on public."money_purchase_intents"
for each row execute function public."wave1_enforce_creator_money_exposure"();
drop trigger if exists "wave1_creator_tip_checkout_authority" on public."creator_tip_transactions";
create trigger "wave1_creator_tip_checkout_authority"
before insert on public."creator_tip_transactions"
for each row execute function public."wave1_enforce_creator_money_exposure"();

-- Email possession is not role authority and cannot prove which historical
-- subject an invitation intended after an address is reassigned. Preserve
-- legacy rows for audit but revoke every active unbound row. A fresh Owner or
-- service grant must name an existing confirmed auth.users.id explicitly.
update public."platform_role_memberships" membership
set "status"='revoked',
    "revoked_at"=coalesce(membership."revoked_at",timezone('utc'::text,now())),
    "revoked_by"=coalesce(membership."revoked_by",'immutable-subject-integrity-closeout'),
    "expires_at"=coalesce(membership."expires_at",timezone('utc'::text,now())),
    "updated_at"=timezone('utc'::text,now())
where membership."status"='active'
  and (
    nullif(trim(coalesce(membership."user_id",'')),'') is null
    or not exists (
      select 1 from auth.users subject
      where subject."id"::text=trim(membership."user_id")
        and subject."email_confirmed_at" is not null
    )
  );

create or replace function public."bind_platform_role_membership_identity_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new."status"='active' and (
    nullif(trim(coalesce(new."user_id",'')),'') is null
    or not exists (
      select 1 from auth.users subject
      where subject."id"::text=trim(new."user_id")
        and subject."email_confirmed_at" is not null
    )
  ) then
    raise exception 'platform_role_exact_confirmed_subject_required';
  end if;
  if nullif(trim(coalesce(new."user_id",'')),'') is not null then
    new."user_id":=trim(new."user_id");
  end if;
  return new;
end;
$$;

drop trigger if exists "bind_platform_role_membership_identity" on public."platform_role_memberships";
create trigger "bind_platform_role_membership_identity"
before insert or update of "email", "user_id", "role", "status" on public."platform_role_memberships"
for each row execute function public."bind_platform_role_membership_identity_internal"();

create or replace function public."bind_platform_role_invitation_on_auth_user_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Historical compatibility stub only. Email changes never bind role truth.
  return new;
end;
$$;

drop trigger if exists "bind_platform_role_invitation_on_auth_user" on auth.users;

create or replace function public."has_platform_role"(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and public."wave1_current_caller_authority_internal"()
    and coalesce(array_length(required_roles, 1), 0) > 0
    and exists (
      select 1 from auth.users subject
      where subject."id"=auth.uid() and subject."email_confirmed_at" is not null
    )
    and exists (
      select 1
      from public."platform_role_memberships" membership
      where membership."status" = 'active'
        and membership."role" = any(required_roles)
        and (membership."expires_at" is null or membership."expires_at" > timezone('utc'::text, now()))
        and membership."user_id" = auth.uid()::text
    )
$$;

create or replace function public."is_account_access_restricted"(p_user_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  begin
    v_user_id:=nullif(trim(coalesce(p_user_id,'')),'')::uuid;
  exception when others then
    return true;
  end;
  if v_user_id is null then return true; end if;
  return exists (
    select 1 from public."account_deletion_requests" deletion
    where deletion."user_id"=v_user_id
      and deletion."status" in ('scheduled','completed')
  ) or exists (
    select 1 from auth.users auth_user
    where auth_user."id"=v_user_id
      and auth_user."banned_until" is not null
      and auth_user."banned_until">timezone('utc'::text,now())
  );
end;
$$;
revoke all on function public."is_account_access_restricted"(text)
  from public,anon,authenticated,service_role;
grant execute on function public."is_account_access_restricted"(text)
  to anon,authenticated,service_role;

-- Authorization follows the immutable subject bound above. Email is retained
-- only as historical/audit data and never locates, binds, or authorizes a role.
update public."platform_staff_permission_grants" grant_row
set "target_user_id"=membership."user_id",
    "updated_at"=timezone('utc'::text,now())
from public."platform_role_memberships" membership
where nullif(trim(coalesce(grant_row."target_user_id",'')),'') is null
  and nullif(trim(coalesce(membership."user_id",'')),'') is not null
  and lower(trim(grant_row."target_email"))=lower(trim(membership."email"))
  and 1=(
    select count(distinct candidate."user_id")
    from public."platform_role_memberships" candidate
    where nullif(trim(coalesce(candidate."user_id",'')),'') is not null
      and lower(trim(candidate."email"))=lower(trim(grant_row."target_email"))
  );

create or replace function public."is_platform_owner_user"(target_user_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(trim(coalesce(target_user_id,'')),'') is not null
    and exists (
      select 1 from auth.users subject
      where subject."id"::text=nullif(trim(coalesce(target_user_id,'')),'')
        and subject."email_confirmed_at" is not null
    )
    and exists (
      select 1 from public."platform_role_memberships" membership
      where membership."status"='active' and membership."role"='owner'
        and membership."user_id"=nullif(trim(coalesce(target_user_id,'')),'')
        and (membership."expires_at" is null
          or membership."expires_at">timezone('utc'::text,now()))
    );
$$;

create or replace function public."has_platform_permission"(p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    public."has_platform_role"(array['owner'::text])
    or (
      public."has_platform_role"(array['operator'::text,'moderator'::text])
      and exists (
        select 1 from public."platform_staff_permission_grants" grant_row
        where grant_row."status"='active'
          and grant_row."target_user_id"=auth.uid()::text
          and grant_row."permission_key"=any(
            public."platform_admin_scope_legacy_aliases"(p_permission_key)
          )
          and (grant_row."expires_at" is null
            or grant_row."expires_at">timezone('utc'::text,now()))
      )
    )
  );
$$;

create or replace function public."autonomous_actor_authority_role"(
  p_actor_user_id text,
  p_actor_email text default null
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select membership."role"
  from public."platform_role_memberships" membership
  join auth.users subject on subject."id"::text=membership."user_id"
    and subject."email_confirmed_at" is not null
  where nullif(trim(coalesce(p_actor_user_id,'')),'') is not null
    and membership."user_id"=nullif(trim(coalesce(p_actor_user_id,'')),'')
    and membership."status"='active'
    and membership."role" in ('owner','super_admin')
    and (membership."expires_at" is null
      or membership."expires_at">timezone('utc'::text,now()))
  order by case membership."role" when 'owner' then 0 else 1 end
  limit 1;
$$;

drop policy if exists "platform_role_memberships_select_own"
  on public."platform_role_memberships";
create policy "platform_role_memberships_select_own"
  on public."platform_role_memberships"
  for select to authenticated
  using (auth.uid() is not null and "user_id"=auth.uid()::text);
drop policy if exists "platform_staff_permission_grants_select_owner_or_self"
  on public."platform_staff_permission_grants";
create policy "platform_staff_permission_grants_select_owner_or_self"
  on public."platform_staff_permission_grants"
  for select to authenticated
  using (
    public."has_platform_role"(array['owner'::text])
    or (auth.uid() is not null and "target_user_id"=auth.uid()::text)
  );

-- Email is only a fresh, authorized locator at grant issuance. The resulting
-- role is always bound to exactly one already-confirmed immutable auth user.
-- A recycled address that conflicts with historical subject truth is rejected.
alter function public."admin_grant_platform_role_by_email"(text,text,text)
  rename to "admin_grant_platform_role_by_email_pre_subject_closeout";
alter function public."admin_grant_platform_role_by_email_pre_subject_closeout"(text,text,text)
  set search_path = '';
create or replace function public."admin_grant_platform_role_by_email"(
  p_target_email text,
  p_role text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_email text:=public."platform_staff_normalize_email"(p_target_email);
  v_target_role text:=public."platform_staff_normalize_role"(p_role);
  v_target_ids uuid[];
  v_target_user_id uuid;
  v_membership_ids bigint[];
  v_membership_id bigint;
  v_result jsonb;
begin
  if not public."wave1_current_caller_authority_internal"()
    or not public."has_platform_role"(array['owner'::text,'operator'::text])
  then
    raise exception 'platform_staff_permission_denied';
  end if;
  if v_target_email is null then raise exception 'platform_staff_email_required'; end if;
  if v_target_role is null then raise exception 'platform_staff_role_invalid'; end if;

  select array_agg(subject."id" order by subject."id") into v_target_ids
  from auth.users subject
  where lower(trim(subject."email"))=v_target_email
    and subject."email_confirmed_at" is not null;
  if coalesce(cardinality(v_target_ids),0)<>1 then
    raise exception 'platform_role_exact_confirmed_subject_required';
  end if;
  v_target_user_id:=v_target_ids[1];

  select array_agg(membership."id" order by membership."id") into v_membership_ids
  from public."platform_role_memberships" membership
  where membership."role"=v_target_role
    and (
      lower(trim(coalesce(membership."email",'')))=v_target_email
      or membership."user_id"=v_target_user_id::text
    );
  if coalesce(cardinality(v_membership_ids),0)>1 then
    raise exception 'platform_role_membership_subject_ambiguous';
  end if;
  v_membership_id:=v_membership_ids[1];
  if v_membership_id is not null and exists (
    select 1 from public."platform_role_memberships" membership
    where membership."id"=v_membership_id
      and nullif(trim(coalesce(membership."user_id",'')),'') is not null
      and membership."user_id"<>v_target_user_id::text
  ) then
    raise exception 'platform_role_membership_subject_conflict';
  end if;

  if v_membership_id is null then
    insert into public."platform_role_memberships"(
      "role","user_id","email","status","notes","granted_by",
      "revoked_by","revoked_at"
    ) values (
      v_target_role,v_target_user_id::text,v_target_email,'revoked',
      'Exact confirmed subject staged for fresh staff grant.',auth.uid()::text,
      'subject-binding-staging',timezone('utc'::text,now())
    ) returning "id" into v_membership_id;
  else
    update public."platform_role_memberships"
    set "user_id"=v_target_user_id::text,"email"=v_target_email,
        "expires_at"=null,
        "updated_at"=timezone('utc'::text,now())
    where "id"=v_membership_id;
  end if;

  v_result:=public."admin_grant_platform_role_by_email_pre_subject_closeout"(
    v_target_email,v_target_role,p_reason
  );
  if not exists (
    select 1 from public."platform_role_memberships" membership
    where membership."id"=v_membership_id and membership."status"='active'
      and membership."user_id"=v_target_user_id::text
      and lower(trim(membership."email"))=v_target_email
  ) then
    raise exception 'platform_role_exact_subject_projection_failed';
  end if;
  return v_result||jsonb_build_object('userId',v_target_user_id);
end;
$$;
revoke all on function public."admin_grant_platform_role_by_email_pre_subject_closeout"(text,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public."admin_grant_platform_role_by_email"(text,text,text)
  from public,anon;
grant execute on function public."admin_grant_platform_role_by_email"(text,text,text)
  to authenticated,service_role;

revoke all on function public."bind_platform_role_membership_identity_internal"() from public, anon, authenticated, service_role;
revoke all on function public."bind_platform_role_invitation_on_auth_user_internal"() from public, anon, authenticated, service_role;
revoke all on function public."has_platform_role"(text[]) from public, anon, authenticated, service_role;
grant execute on function public."has_platform_role"(text[]) to authenticated, service_role;
revoke all on function public."is_platform_owner_user"(text) from public,anon,authenticated,service_role;
grant execute on function public."is_platform_owner_user"(text) to anon,authenticated,service_role;
revoke all on function public."has_platform_permission"(text) from public,anon,authenticated,service_role;
grant execute on function public."has_platform_permission"(text) to authenticated,service_role;
revoke all on function public."autonomous_actor_authority_role"(text,text) from public,anon,authenticated,service_role;
grant execute on function public."autonomous_actor_authority_role"(text,text) to service_role;

-- Append-only earnings lifecycle. creator_earnings_ledger keeps its original
-- UPDATE/DELETE blocker; no bypass or trigger weakening is introduced here.
create table public."creator_earnings_lifecycle_events" (
  "id" bigint generated always as identity primary key,
  "earnings_ledger_id" uuid not null references public."creator_earnings_ledger"("id") on delete restrict,
  "lifecycle_state" text not null,
  "reason" text not null,
  "operation_key" text not null unique,
  "payout_request_id" uuid references public."creator_payout_requests"("id") on delete restrict,
  "money_ledger_event_id" uuid references public."money_access_ledger_events"("id") on delete restrict,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "creator_earnings_lifecycle_state_check"
    check ("lifecycle_state" in ('pending','held','available','paid','reversed')),
  constraint "creator_earnings_lifecycle_reason_check"
    check ("reason" in ('settlement_released','provider_payout_paid','provider_terminal_reversal','historical_projection')),
  constraint "creator_earnings_lifecycle_operation_key_check"
    check (length(trim("operation_key")) between 1 and 240),
  constraint "creator_earnings_lifecycle_metadata_safe_check"
    check ("metadata"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload)')
);
create index "creator_earnings_lifecycle_latest_idx"
  on public."creator_earnings_lifecycle_events" ("earnings_ledger_id", "id" desc);
alter table public."creator_earnings_lifecycle_events" enable row level security;
alter table public."creator_earnings_lifecycle_events" force row level security;
revoke all on table public."creator_earnings_lifecycle_events" from public, anon, authenticated, service_role;
grant select on table public."creator_earnings_lifecycle_events" to service_role;

create or replace function public."block_creator_earnings_lifecycle_mutation_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'creator_earnings_lifecycle_events_are_append_only';
end;
$$;
drop trigger if exists "block_creator_earnings_lifecycle_mutation" on public."creator_earnings_lifecycle_events";
create trigger "block_creator_earnings_lifecycle_mutation"
before update or delete on public."creator_earnings_lifecycle_events"
for each row execute function public."block_creator_earnings_lifecycle_mutation_internal"();

create or replace function public."creator_earnings_current_state_internal"(p_earnings_ledger_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select lifecycle."lifecycle_state"
      from public."creator_earnings_lifecycle_events" lifecycle
      where lifecycle."earnings_ledger_id" = p_earnings_ledger_id
      order by lifecycle."id" desc
      limit 1
    ),
    (
      select earnings."ledger_status"
      from public."creator_earnings_ledger" earnings
      where earnings."id" = p_earnings_ledger_id
    )
  )
$$;

create or replace function public."record_creator_earnings_lifecycle_internal"(
  p_earnings_ledger_id uuid,
  p_lifecycle_state text,
  p_reason text,
  p_operation_key text,
  p_payout_request_id uuid default null,
  p_money_ledger_event_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_earnings public."creator_earnings_ledger"%rowtype;
  v_existing public."creator_earnings_lifecycle_events"%rowtype;
  v_current text;
  v_next text := lower(trim(coalesce(p_lifecycle_state, '')));
begin
  if p_earnings_ledger_id is null
    or v_next not in ('pending','held','available','paid','reversed')
    or p_reason not in ('settlement_released','provider_payout_paid','provider_terminal_reversal','historical_projection')
    or nullif(trim(coalesce(p_operation_key, '')), '') is null
    or length(p_operation_key) > 240
    or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
  then
    raise exception 'creator_earnings_lifecycle_event_invalid';
  end if;

  select * into v_existing
  from public."creator_earnings_lifecycle_events"
  where "operation_key" = p_operation_key;
  if v_existing."id" is not null then
    if v_existing."earnings_ledger_id" is distinct from p_earnings_ledger_id
      or v_existing."lifecycle_state" is distinct from v_next
      or v_existing."reason" is distinct from p_reason
      or v_existing."payout_request_id" is distinct from p_payout_request_id
      or v_existing."money_ledger_event_id" is distinct from p_money_ledger_event_id
    then
      raise exception 'creator_earnings_lifecycle_replay_mismatch';
    end if;
    return v_existing."lifecycle_state";
  end if;

  select * into v_earnings
  from public."creator_earnings_ledger"
  where "id" = p_earnings_ledger_id
  for update;
  if v_earnings."id" is null then
    raise exception 'creator_earnings_ledger_not_found';
  end if;
  v_current := public."creator_earnings_current_state_internal"(p_earnings_ledger_id);

  if v_current = v_next then
    return v_current;
  end if;
  if not (
    (v_current in ('pending','held') and v_next in ('available','reversed'))
    or (v_current = 'available' and v_next in ('paid','reversed'))
    or (v_current = 'paid' and v_next = 'reversed')
  ) then
    raise exception 'creator_earnings_lifecycle_transition_invalid:%:%', v_current, v_next;
  end if;

  insert into public."creator_earnings_lifecycle_events" (
    "earnings_ledger_id", "lifecycle_state", "reason", "operation_key",
    "payout_request_id", "money_ledger_event_id", "metadata"
  ) values (
    p_earnings_ledger_id, v_next, p_reason, trim(p_operation_key),
    p_payout_request_id, p_money_ledger_event_id, coalesce(p_metadata, '{}'::jsonb)
  );
  return v_next;
end;
$$;

revoke all on function public."block_creator_earnings_lifecycle_mutation_internal"() from public, anon, authenticated, service_role;
revoke all on function public."creator_earnings_current_state_internal"(uuid) from public, anon, authenticated;
grant execute on function public."creator_earnings_current_state_internal"(uuid) to service_role;
revoke all on function public."record_creator_earnings_lifecycle_internal"(uuid,text,text,text,uuid,uuid,jsonb) from public, anon, authenticated, service_role;

-- Exact provider identities and finite subscription access are database invariants.
alter table public."creator_payout_requests"
  drop constraint if exists "creator_payout_requests_provider_payout_id_shape_check";
alter table public."creator_payout_requests"
  add constraint "creator_payout_requests_provider_payout_id_shape_check"
  check ("provider_payout_id" is null or (
    "provider_payout_id" = trim("provider_payout_id")
    and length("provider_payout_id") between 1 and 255
  ));
create unique index if not exists "creator_payout_requests_provider_payout_id_unique"
  on public."creator_payout_requests" ("provider_payout_id")
  where "provider_payout_id" is not null;

alter table public."access_grants"
  drop constraint if exists "access_grants_channel_subscription_finite_check";
update public."access_grants"
set "status" = 'blocked',
    "revoked_at" = coalesce("revoked_at", timezone('utc'::text, now())),
    "revoke_reason" = coalesce("revoke_reason", 'Finite subscription period evidence was missing during authority closeout.'),
    "updated_at" = timezone('utc'::text, now())
where "grant_type" = 'channel_subscription'
  and "status" in ('active','sandbox_only')
  and "expires_at" is null;
alter table public."access_grants"
  add constraint "access_grants_channel_subscription_finite_check"
  check (
    "grant_type" <> 'channel_subscription'
    or "status" not in ('active','sandbox_only')
    or "expires_at" is not null
  );
alter table public."creator_channel_subscriptions"
  drop constraint if exists "creator_channel_subscriptions_finite_period_check";
update public."creator_channel_subscriptions"
set "status" = 'expired',
    "expired_at" = coalesce("expired_at", timezone('utc'::text, now())),
    "updated_at" = timezone('utc'::text, now())
where "status" in ('active','trialing','grace_period','cancel_pending')
  and (
    "current_period_end" is null
    or "current_period_end" <= coalesce("current_period_start", "created_at")
  );
alter table public."creator_channel_subscriptions"
  add constraint "creator_channel_subscriptions_finite_period_check"
  check (
    "status" not in ('active','trialing','grace_period','cancel_pending')
    or (
      "current_period_end" is not null
      and "current_period_end" > coalesce("current_period_start", "created_at")
    )
  );

alter table public."revenuecat_consumable_transaction_intents"
  add column if not exists "last_provider_event_id" uuid references public."provider_events"("id") on delete restrict,
  add column if not exists "last_occurred_at" timestamptz,
  add column if not exists "last_event_type" text,
  add column if not exists "last_event_rank" smallint,
  add column if not exists "terminal" boolean not null default false,
  add column if not exists "binding_state" text not null default 'exact';
alter table public."revenuecat_consumable_transaction_intents"
  drop constraint if exists "revenuecat_consumable_transaction_intents_provider_check";
alter table public."revenuecat_consumable_transaction_intents"
  add constraint "revenuecat_consumable_transaction_intents_provider_check"
  check ("provider" in ('revenuecat_app_store','revenuecat_google_play'));
alter table public."revenuecat_consumable_transaction_intents"
  drop constraint if exists "revenuecat_transaction_intents_binding_state_check";
alter table public."revenuecat_consumable_transaction_intents"
  add constraint "revenuecat_transaction_intents_binding_state_check"
  check ("binding_state" in ('exact','ambiguous_legacy'));
with ambiguous_original_transactions as (
  select "provider", "original_transaction_id"
  from public."revenuecat_consumable_transaction_intents"
  group by "provider", "original_transaction_id"
  having count(*) > 1
)
update public."revenuecat_consumable_transaction_intents" link
set "binding_state" = 'ambiguous_legacy'
from ambiguous_original_transactions ambiguous
where ambiguous."provider" = link."provider"
  and ambiguous."original_transaction_id" = link."original_transaction_id";
drop index if exists public."revenuecat_transaction_intents_original_global_unique";
create unique index "revenuecat_transaction_intents_original_global_unique"
  on public."revenuecat_consumable_transaction_intents" ("provider", "original_transaction_id")
  where "binding_state" = 'exact';
with ambiguous_purchase_intents as (
  select "purchase_intent_id"
  from public."revenuecat_consumable_transaction_intents"
  where "binding_state"='exact'
  group by "purchase_intent_id"
  having count(*)>1
)
update public."revenuecat_consumable_transaction_intents" link
set "binding_state"='ambiguous_legacy'
from ambiguous_purchase_intents ambiguous
where ambiguous."purchase_intent_id"=link."purchase_intent_id";
drop index if exists public."revenuecat_transaction_intents_purchase_intent_idx";
create unique index "revenuecat_transaction_intents_purchase_intent_idx"
  on public."revenuecat_consumable_transaction_intents" ("purchase_intent_id")
  where "binding_state"='exact';
alter table public."revenuecat_consumable_transaction_intents" enable row level security;
alter table public."revenuecat_consumable_transaction_intents" force row level security;
revoke all on table public."revenuecat_consumable_transaction_intents" from public, anon, authenticated, service_role;
grant select on table public."revenuecat_consumable_transaction_intents" to service_role;

-- Reserve RevenueCat webhook identity immediately after signature validation,
-- before any store/product/domain routing.  Identical delivery retries remain
-- lawful; the same provider event id can never be rebound to changed bytes.
create table public."revenuecat_webhook_ingress_events" (
  "provider_event_id" text primary key,
  "raw_payload_hash" text not null,
  "received_at" timestamptz not null default timezone('utc'::text,now()),
  constraint "revenuecat_webhook_ingress_event_id_shape_check" check (
    "provider_event_id"=trim("provider_event_id")
    and length("provider_event_id") between 1 and 512
    and "provider_event_id" !~ '[[:cntrl:]]'
  ),
  constraint "revenuecat_webhook_ingress_hash_check"
    check ("raw_payload_hash" ~ '^[0-9a-f]{64}$')
);
alter table public."revenuecat_webhook_ingress_events" enable row level security;
alter table public."revenuecat_webhook_ingress_events" force row level security;
revoke all on table public."revenuecat_webhook_ingress_events"
  from public,anon,authenticated,service_role;
grant select on table public."revenuecat_webhook_ingress_events" to service_role;

create or replace function public."block_revenuecat_webhook_ingress_mutation_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'revenuecat_webhook_ingress_events_are_append_only';
end;
$$;
drop trigger if exists "block_revenuecat_webhook_ingress_mutation"
  on public."revenuecat_webhook_ingress_events";
create trigger "block_revenuecat_webhook_ingress_mutation"
before update or delete on public."revenuecat_webhook_ingress_events"
for each row execute function public."block_revenuecat_webhook_ingress_mutation_internal"();

create or replace function public."reserve_revenuecat_webhook_ingress_event"(
  p_provider_event_id text,
  p_raw_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id text:=trim(coalesce(p_provider_event_id,''));
  v_existing public."revenuecat_webhook_ingress_events"%rowtype;
begin
  if v_event_id='' or v_event_id is distinct from coalesce(p_provider_event_id,'')
    or length(v_event_id)>512 or v_event_id ~ '[[:cntrl:]]'
    or coalesce(p_raw_payload_hash,'') !~ '^[0-9a-f]{64}$'
  then
    raise exception 'revenuecat_webhook_ingress_identity_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-webhook-event:'||v_event_id,0
  ));
  select ingress.* into v_existing
  from public."revenuecat_webhook_ingress_events" ingress
  where ingress."provider_event_id"=v_event_id;
  if v_existing."provider_event_id" is not null then
    if v_existing."raw_payload_hash" is distinct from p_raw_payload_hash then
      raise exception 'revenuecat_webhook_ingress_identity_mismatch';
    end if;
    return jsonb_build_object(
      'status','duplicate','providerEventId',v_event_id,
      'duplicateEvent',true,'authorityGranted',false
    );
  end if;
  insert into public."revenuecat_webhook_ingress_events"(
    "provider_event_id","raw_payload_hash"
  ) values (v_event_id,p_raw_payload_hash);
  return jsonb_build_object(
    'status','reserved','providerEventId',v_event_id,
    'duplicateEvent',false,'authorityGranted',false
  );
end;
$$;
revoke all on function public."block_revenuecat_webhook_ingress_mutation_internal"()
  from public,anon,authenticated,service_role;
revoke all on function public."reserve_revenuecat_webhook_ingress_event"(text,text)
  from public,anon,authenticated;
grant execute on function public."reserve_revenuecat_webhook_ingress_event"(text,text)
  to service_role;
comment on function public."reserve_revenuecat_webhook_ingress_event"(text,text) is
  'Service-only append-only RevenueCat ingress identity reservation. Call immediately after signature and exact event-id parsing, before store/product/domain routing.';

-- A signed access-removing event whose subject/store/original identity is not
-- exact cannot be projected to a guessed transaction.  Quarantine the narrowest
-- provable scope (or RevenueCat globally when none is provable) so stale access
-- and payout paths fail closed until an exact terminal event resolves that same
-- subject/provider/environment.  Both quarantine and resolution are append-only.
create table public."revenuecat_terminal_authority_quarantines" (
  "id" uuid primary key default gen_random_uuid(),
  "provider_scope" text not null,
  "environment_scope" text,
  "user_id" uuid,
  "reported_provider_event_id" text,
  "event_type" text not null,
  "raw_payload_hash" text not null unique,
  "reason" text not null,
  "created_at" timestamptz not null default timezone('utc'::text,now()),
  constraint "revenuecat_terminal_quarantine_provider_check" check (
    "provider_scope" in ('revenuecat_global','revenuecat_app_store','revenuecat_google_play')
  ),
  constraint "revenuecat_terminal_quarantine_environment_check"
    check ("environment_scope" is null or "environment_scope" in ('sandbox','production')),
  constraint "revenuecat_terminal_quarantine_event_check" check (
    "event_type" in ('CANCELLATION','BILLING_ISSUE','EXPIRATION','REFUND','REVOCATION','SUBSCRIPTION_PAUSED','TRANSFER','UNKNOWN')
  ),
  constraint "revenuecat_terminal_quarantine_event_id_shape_check" check (
    "reported_provider_event_id" is null or (
      "reported_provider_event_id"=trim("reported_provider_event_id")
      and length("reported_provider_event_id") between 1 and 512
      and "reported_provider_event_id" !~ '[[:cntrl:]]'
    )
  ),
  constraint "revenuecat_terminal_quarantine_hash_check"
    check ("raw_payload_hash" ~ '^[0-9a-f]{64}$'),
  constraint "revenuecat_terminal_quarantine_reason_check" check (
    "reason"=trim("reason") and length("reason") between 1 and 160
    and "reason" ~ '^[a-z0-9_:-]+$'
  )
);
create table public."revenuecat_terminal_authority_quarantine_resolutions" (
  "id" uuid primary key default gen_random_uuid(),
  "quarantine_id" uuid not null unique references public."revenuecat_terminal_authority_quarantines"("id") on delete restrict,
  "provider_event_id" uuid not null references public."provider_events"("id") on delete restrict,
  "raw_payload_hash" text not null,
  "created_at" timestamptz not null default timezone('utc'::text,now()),
  constraint "revenuecat_terminal_quarantine_resolution_hash_check"
    check ("raw_payload_hash" ~ '^[0-9a-f]{64}$')
);
alter table public."revenuecat_terminal_authority_quarantines" enable row level security;
alter table public."revenuecat_terminal_authority_quarantines" force row level security;
alter table public."revenuecat_terminal_authority_quarantine_resolutions" enable row level security;
alter table public."revenuecat_terminal_authority_quarantine_resolutions" force row level security;
revoke all on table public."revenuecat_terminal_authority_quarantines" from public,anon,authenticated,service_role;
revoke all on table public."revenuecat_terminal_authority_quarantine_resolutions" from public,anon,authenticated,service_role;
grant select on table public."revenuecat_terminal_authority_quarantines" to service_role;
grant select on table public."revenuecat_terminal_authority_quarantine_resolutions" to service_role;

create or replace function public."block_revenuecat_terminal_quarantine_mutation_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'revenuecat_terminal_quarantine_evidence_is_append_only';
end;
$$;
drop trigger if exists "block_revenuecat_terminal_quarantine_mutation"
  on public."revenuecat_terminal_authority_quarantines";
create trigger "block_revenuecat_terminal_quarantine_mutation"
before update or delete on public."revenuecat_terminal_authority_quarantines"
for each row execute function public."block_revenuecat_terminal_quarantine_mutation_internal"();
drop trigger if exists "block_revenuecat_terminal_quarantine_resolution_mutation"
  on public."revenuecat_terminal_authority_quarantine_resolutions";
create trigger "block_revenuecat_terminal_quarantine_resolution_mutation"
before update or delete on public."revenuecat_terminal_authority_quarantine_resolutions"
for each row execute function public."block_revenuecat_terminal_quarantine_mutation_internal"();

create or replace function public."apply_revenuecat_terminal_quarantine_projection_internal"(
  p_quarantine_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quarantine public."revenuecat_terminal_authority_quarantines"%rowtype;
begin
  select quarantine.* into v_quarantine
  from public."revenuecat_terminal_authority_quarantines" quarantine
  where quarantine."id"=p_quarantine_id;
  if v_quarantine."id" is null then
    raise exception 'revenuecat_terminal_quarantine_missing';
  end if;

  -- Mutable grant rows are projections, not immutable provider evidence. Close
  -- every grant inside the narrowest provable scope; never choose a transaction.
  update public."access_grants" grant_row
  set "status"='blocked',
      "revoked_at"=coalesce(grant_row."revoked_at",v_quarantine."created_at"),
      "revoke_reason"='RevenueCat terminal authority quarantine.',
      "metadata"=coalesce(grant_row."metadata",'{}'::jsonb)||jsonb_build_object(
        'authority_granted',false,
        'terminal_quarantine_id',v_quarantine."id",
        'terminal_quarantine_reason',v_quarantine."reason"
      ),
      "updated_at"=timezone('utc'::text,now())
  where grant_row."provider" in ('revenuecat_app_store','revenuecat_google_play')
    and grant_row."status" in ('active','sandbox_only')
    and (v_quarantine."provider_scope"='revenuecat_global'
      or grant_row."provider"=v_quarantine."provider_scope")
    and (v_quarantine."user_id" is null
      or grant_row."user_id"=v_quarantine."user_id")
    and (v_quarantine."environment_scope" is null
      or grant_row."environment"=v_quarantine."environment_scope");

  -- Already-admitted realtime membership is another mutable projection. Remove
  -- it for paid/Premium rooms immediately; a later token/heartbeat may not be
  -- required before chat/realtime membership is consulted.
  update public."watch_party_room_memberships" membership
  set "role"='viewer',"stage_role"='listener',"can_speak"=false,
      "camera_enabled"=false,"mic_enabled"=false,"membership_state"='removed',
      "left_at"=coalesce(membership."left_at",v_quarantine."created_at"),
      "updated_at"=timezone('utc'::text,now())
  where membership."membership_state" in ('active','reconnecting')
    and (v_quarantine."user_id" is null
      or membership."user_id"=v_quarantine."user_id"::text)
    and exists (
      select 1 from public."watch_party_rooms" room
      where room."party_id"=membership."party_id"
        and (
          room."content_access_rule" in ('premium','party_pass')
          or exists (
            select 1 from public."paid_watch_party_offers" offer
            where offer."party_id"=room."party_id"
              and offer."status" in ('sandbox','active','paused','sold_out','blocked')
          )
        )
    );
end;
$$;

create or replace function public."quarantine_revenuecat_terminal_authority"(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_environment text,
  p_raw_payload_hash text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_provider_scope text;
  v_event_id text:=nullif(trim(coalesce(p_provider_event_id,'')),'');
  v_event_type text:=upper(trim(coalesce(p_event_type,'')));
  v_environment text:=lower(trim(coalesce(p_environment,'')));
  v_reason text:=lower(trim(coalesce(p_reason,'')));
  v_existing public."revenuecat_terminal_authority_quarantines"%rowtype;
begin
  v_provider_scope:=case when v_provider in ('revenuecat_app_store','revenuecat_google_play')
    then v_provider else 'revenuecat_global' end;
  if v_event_type not in ('CANCELLATION','BILLING_ISSUE','EXPIRATION','REFUND','REVOCATION','SUBSCRIPTION_PAUSED','TRANSFER','UNKNOWN')
    or coalesce(p_raw_payload_hash,'') !~ '^[0-9a-f]{64}$'
    or v_reason='' or length(v_reason)>160 or v_reason !~ '^[a-z0-9_:-]+$'
    or (v_event_id is not null and (length(v_event_id)>512 or v_event_id ~ '[[:cntrl:]]'))
  then
    raise exception 'revenuecat_terminal_quarantine_identity_invalid';
  end if;
  if v_environment not in ('sandbox','production') then v_environment:=null; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-terminal-quarantine:'||p_raw_payload_hash,0
  ));
  select quarantine.* into v_existing
  from public."revenuecat_terminal_authority_quarantines" quarantine
  where quarantine."raw_payload_hash"=p_raw_payload_hash;
  if v_existing."id" is not null then
    if v_existing."provider_scope" is distinct from v_provider_scope
      or v_existing."environment_scope" is distinct from v_environment
      or v_existing."user_id" is distinct from p_user_id
      or v_existing."reported_provider_event_id" is distinct from v_event_id
      or v_existing."event_type" is distinct from v_event_type
      or v_existing."reason" is distinct from v_reason
    then
      raise exception 'revenuecat_terminal_quarantine_identity_mismatch';
    end if;
    perform public."apply_revenuecat_terminal_quarantine_projection_internal"(v_existing."id");
    return jsonb_build_object('status','quarantined','quarantineId',v_existing."id",
      'duplicateEvent',true,'authorityGranted',false,'scope',v_provider_scope);
  end if;
  insert into public."revenuecat_terminal_authority_quarantines"(
    "provider_scope","environment_scope","user_id","reported_provider_event_id",
    "event_type","raw_payload_hash","reason"
  ) values (
    v_provider_scope,v_environment,p_user_id,v_event_id,v_event_type,p_raw_payload_hash,v_reason
  ) returning * into v_existing;
  perform public."apply_revenuecat_terminal_quarantine_projection_internal"(v_existing."id");
  return jsonb_build_object('status','quarantined','quarantineId',v_existing."id",
    'duplicateEvent',false,'authorityGranted',false,'scope',v_provider_scope);
end;
$$;

create or replace function public."revenuecat_authority_quarantined_internal"(
  p_provider text,
  p_user_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public."revenuecat_terminal_authority_quarantines" quarantine
    where not exists (
      select 1 from public."revenuecat_terminal_authority_quarantine_resolutions" resolution
      where resolution."quarantine_id"=quarantine."id"
    )
      and (quarantine."provider_scope"='revenuecat_global'
        or p_provider is null or quarantine."provider_scope"=p_provider)
      and (quarantine."user_id" is null or p_user_id is null or quarantine."user_id"=p_user_id)
      and (quarantine."environment_scope" is null
        or p_environment is null or quarantine."environment_scope"=p_environment)
  );
$$;

create or replace function public."resolve_revenuecat_terminal_quarantine_internal"(
  p_provider text,
  p_user_id uuid,
  p_environment text,
  p_provider_event_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public."provider_events"%rowtype;
  v_count integer:=0;
begin
  select event.* into v_event from public."provider_events" event
  where event."id"=p_provider_event_id
    and event."provider"=p_provider
    and event."user_id"=p_user_id
    and event."environment"=p_environment
    and event."event_type" in ('CANCELLATION','BILLING_ISSUE','EXPIRATION','REFUND','REVOCATION','SUBSCRIPTION_PAUSED')
    and event."status" in ('processed','refunded','reversed');
  if v_event."id" is null then return 0; end if;
  insert into public."revenuecat_terminal_authority_quarantine_resolutions"(
    "quarantine_id","provider_event_id","raw_payload_hash"
  )
  select quarantine."id",v_event."id",v_event."raw_payload_hash"
  from public."revenuecat_terminal_authority_quarantines" quarantine
  where quarantine."provider_scope"=p_provider
    and quarantine."user_id"=p_user_id
    and quarantine."environment_scope"=p_environment
    and quarantine."reported_provider_event_id"=v_event."provider_event_id"
    and quarantine."raw_payload_hash"=v_event."raw_payload_hash"
    and not exists (
      select 1 from public."revenuecat_terminal_authority_quarantine_resolutions" resolution
      where resolution."quarantine_id"=quarantine."id"
    )
  on conflict ("quarantine_id") do nothing;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
revoke all on function public."quarantine_revenuecat_terminal_authority"(text,text,text,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public."quarantine_revenuecat_terminal_authority"(text,text,text,uuid,text,text,text)
  to service_role;
revoke all on function public."revenuecat_authority_quarantined_internal"(text,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function public."apply_revenuecat_terminal_quarantine_projection_internal"(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public."resolve_revenuecat_terminal_quarantine_internal"(text,uuid,text,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public."block_revenuecat_terminal_quarantine_mutation_internal"()
  from public,anon,authenticated,service_role;
comment on function public."resolve_revenuecat_terminal_quarantine_internal"(text,uuid,text,uuid) is
  'Internal append-only reconciliation. Only the same exact provider event id and payload hash may resolve a subject/provider/environment quarantine. Global, missing-event-id, or otherwise unlinked evidence remains fail-closed pending separately authorized external reconciliation.';

create or replace function public."bind_money_purchase_intent_session_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=auth.uid();
  v_generation text:=nullif(trim(coalesce(auth.jwt()->>'session_id','')),'');
begin
  if new."status"<>'pending' then return new; end if;
  if v_actor is not null then
    if new."user_id" is distinct from v_actor or v_generation is null then
      raise exception 'purchase_intent_session_identity_invalid';
    end if;
    new."session_generation":=v_generation;
  end if;
  if nullif(trim(coalesce(new."session_generation",'')),'') is null
    or not exists (
      select 1 from auth.sessions session_row
      where session_row."id"::text=new."session_generation"
        and session_row."user_id"=new."user_id"
        and (session_row."not_after" is null
          or session_row."not_after">timezone('utc'::text,now()))
    )
  then
    raise exception 'purchase_intent_current_session_required';
  end if;
  if public."revenuecat_authority_quarantined_internal"(
    new."provider",new."user_id",new."environment"
  ) then
    raise exception 'revenuecat_terminal_authority_quarantined';
  end if;
  return new;
end;
$$;

create table public."revenuecat_unbound_terminal_authority" (
  "provider" text not null,
  "original_transaction_id" text not null,
  "user_id" uuid not null,
  "provider_product_id" text not null,
  "environment" text not null,
  "last_provider_event_id" uuid not null references public."provider_events"("id") on delete restrict,
  "last_occurred_at" timestamptz not null,
  "last_event_type" text not null,
  "last_event_rank" smallint not null,
  "created_at" timestamptz not null default timezone('utc'::text,now()),
  "updated_at" timestamptz not null default timezone('utc'::text,now()),
  primary key ("provider","original_transaction_id"),
  constraint "revenuecat_unbound_terminal_provider_check"
    check ("provider" in ('revenuecat_app_store','revenuecat_google_play')),
  constraint "revenuecat_unbound_terminal_environment_check"
    check ("environment" in ('sandbox','production')),
  constraint "revenuecat_unbound_terminal_event_check"
    check ("last_event_type" in (
      'CANCELLATION','BILLING_ISSUE','EXPIRATION','REFUND','REVOCATION','SUBSCRIPTION_PAUSED'
    ) and "last_event_rank" between 1 and 7),
  constraint "revenuecat_unbound_terminal_identity_shape_check"
    check (length(trim("original_transaction_id")) between 1 and 512 and length(trim("provider_product_id")) between 1 and 512)
);
alter table public."revenuecat_unbound_terminal_authority" enable row level security;
alter table public."revenuecat_unbound_terminal_authority" force row level security;
revoke all on table public."revenuecat_unbound_terminal_authority" from public,anon,authenticated,service_role;
grant select on table public."revenuecat_unbound_terminal_authority" to service_role;
comment on table public."revenuecat_unbound_terminal_authority" is
  'Durable fail-closed watermark for an access-removing lifecycle event received before any purchase-intent binding. Sticky terminal states remain closed; a genuinely newer canonical initial may advance a nonsticky expiry/cancel/billing watermark. It never assigns an intent or grants authority.';

create table public."revenuecat_unbound_initial_authority" (
  "provider" text not null,
  "original_transaction_id" text not null,
  "user_id" uuid not null,
  "provider_product_id" text not null,
  "environment" text not null,
  "first_provider_event_id" uuid not null references public."provider_events"("id") on delete restrict,
  "first_ignore_reason" text not null,
  "created_at" timestamptz not null default timezone('utc'::text,now()),
  primary key ("provider","original_transaction_id"),
  constraint "revenuecat_unbound_initial_provider_check"
    check ("provider" in ('revenuecat_app_store','revenuecat_google_play')),
  constraint "revenuecat_unbound_initial_environment_check" check ("environment" in ('sandbox','production')),
  constraint "revenuecat_unbound_initial_identity_shape_check" check (
    length(trim("original_transaction_id")) between 1 and 512
    and length(trim("provider_product_id")) between 1 and 512
    and length(trim("first_ignore_reason")) between 1 and 160
  )
);
alter table public."revenuecat_unbound_initial_authority" enable row level security;
alter table public."revenuecat_unbound_initial_authority" force row level security;
revoke all on table public."revenuecat_unbound_initial_authority" from public,anon,authenticated,service_role;
grant select on table public."revenuecat_unbound_initial_authority" to service_role;
comment on table public."revenuecat_unbound_initial_authority" is
  'Permanent fail-closed reservation for a provider original transaction whose first INITIAL/NON_RENEWING delivery could not bind and finalize authority. A different event id can never rebind that store transaction to a later intent/source.';

comment on table public."creator_earnings_lifecycle_events" is
  'Append-only service-owned projection events for immutable creator earnings. The source earnings ledger remains update/delete blocked.';
comment on function public."wave1_legal_requirements_readback"(text) is
  'Returns legal authority only for exact active Auth user/session/document/market/role/capability bindings.';
comment on function public."has_platform_role"(text[]) is
  'Backed staff authority requires an active, unexpired membership bound to the exact immutable Auth user_id. Email is invitation/bootstrap input only and never authorizes a request.';

create or replace function public."block_creator_money_reversal_link_mutation_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'creator_money_reversal_links_are_append_only';
end;
$$;
revoke all on function public."block_creator_money_reversal_link_mutation_internal"() from public, anon, authenticated, service_role;
drop trigger if exists "block_creator_money_reversal_link_mutation" on public."creator_money_reversal_links";
create trigger "block_creator_money_reversal_link_mutation"
before update or delete on public."creator_money_reversal_links"
for each row execute function public."block_creator_money_reversal_link_mutation_internal"();
revoke insert, update, delete on table public."creator_money_reversal_links" from service_role;

create or replace function public."revenuecat_creator_money_authority_rank_internal"(p_event_type text)
returns smallint
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case upper(trim(coalesce(p_event_type, '')))
    when 'CANCELLATION' then 1::smallint
    when 'INITIAL_PURCHASE' then 2::smallint
    when 'NON_RENEWING_PURCHASE' then 2::smallint
    when 'PRODUCT_CHANGE' then 3::smallint
    when 'RENEWAL' then 3::smallint
    when 'UNCANCELLATION' then 3::smallint
    when 'BILLING_ISSUE' then 3::smallint
    when 'EXPIRATION' then 5::smallint
    when 'REFUND' then 6::smallint
    when 'REVOCATION' then 7::smallint
    when 'SUBSCRIPTION_PAUSED' then 7::smallint
    else 0::smallint
  end
$$;
revoke all on function public."revenuecat_creator_money_authority_rank_internal"(text) from public, anon, authenticated;
grant execute on function public."revenuecat_creator_money_authority_rank_internal"(text) to service_role;

with ranked_provider_authority as (
  select
    link."provider",
    link."original_transaction_id",
    provider_event."id" as last_provider_event_id,
    least(provider_event."occurred_at", timezone('utc'::text, now())) as last_occurred_at,
    provider_event."event_type" as last_event_type,
    public."revenuecat_creator_money_authority_rank_internal"(provider_event."event_type") as last_event_rank,
    bool_or(provider_event."event_type" in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED')) over (
      partition by link."provider", link."original_transaction_id"
    ) as terminal,
    row_number() over (
      partition by link."provider", link."original_transaction_id"
      order by
        (provider_event."event_type" in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED')) desc,
        least(provider_event."occurred_at", timezone('utc'::text, now())) desc,
        public."revenuecat_creator_money_authority_rank_internal"(provider_event."event_type") desc,
        provider_event."provider_event_id" collate "C" desc
    ) as authority_order
  from public."revenuecat_consumable_transaction_intents" link
  join public."provider_events" provider_event
    on provider_event."provider" = link."provider"
   and provider_event."user_id" = link."user_id"
   and provider_event."product_id" = link."product_id"
   and provider_event."metadata"->>'original_transaction_id' = link."original_transaction_id"
  where provider_event."status" in ('processed','refunded','reversed')
)
update public."revenuecat_consumable_transaction_intents" link
set "last_provider_event_id" = ranked.last_provider_event_id,
    "last_occurred_at" = ranked.last_occurred_at,
    "last_event_type" = ranked.last_event_type,
    "last_event_rank" = ranked.last_event_rank,
    "terminal" = ranked.terminal
from ranked_provider_authority ranked
where ranked.authority_order = 1
  and ranked."provider" = link."provider"
  and ranked."original_transaction_id" = link."original_transaction_id";

-- A historical financial/access terminal is sticky even if a delayed active
-- delivery was recorded later.  Project surviving mutable authority closed;
-- provider events and creator earnings remain immutable evidence.
update public."access_grants" grant_row
set "status"=case when link."last_event_type"='REFUND' then 'refunded' else 'revoked' end,
    "provider_event_id"=link."last_provider_event_id",
    "refunded_at"=case when link."last_event_type"='REFUND'
      then coalesce(grant_row."refunded_at",link."last_occurred_at") else grant_row."refunded_at" end,
    "revoked_at"=case when link."last_event_type"<>'REFUND'
      then coalesce(grant_row."revoked_at",link."last_occurred_at") else grant_row."revoked_at" end,
    "revoke_reason"=coalesce(grant_row."revoke_reason",'Historical exact-bound provider terminal authority closeout.'),
    "updated_at"=timezone('utc'::text,now()),
    "metadata"=coalesce(grant_row."metadata",'{}'::jsonb)||jsonb_build_object(
      'historical_terminal_projection',true,'authority_granted',false,
      'original_transaction_id',link."original_transaction_id"
    )
from public."revenuecat_consumable_transaction_intents" link
where link."terminal" and link."binding_state"='exact'
  and grant_row."user_id"=link."user_id" and grant_row."product_id"=link."product_id"
  and grant_row."metadata"->>'purchase_intent_id'=link."purchase_intent_id"::text
  and grant_row."status" not in ('refunded','revoked','expired','blocked');

update public."money_purchase_intents" intent
set "status"='revoked',"revoked_at"=coalesce(intent."revoked_at",link."last_occurred_at"),
    "updated_at"=timezone('utc'::text,now()),
    "metadata"=coalesce(intent."metadata",'{}'::jsonb)||jsonb_build_object(
      'historical_terminal_projection',true,'original_transaction_id',link."original_transaction_id"
    )
from public."revenuecat_consumable_transaction_intents" link
where link."terminal" and link."binding_state"='exact' and intent."id"=link."purchase_intent_id"
  and intent."status"<>'revoked';

insert into public."money_access_ledger_events" (
  "user_id","creator_id","platform_id","product_id","provider_event_id","event_type",
  "amount_minor","currency","environment","payable_state","status","source_type","source_id","metadata"
)
select
  link."user_id",intent."creator_id",intent."platform_id",link."product_id",link."last_provider_event_id",
  link."last_event_type",coalesce(parent_ledger."amount_minor",intent."amount_minor",0),
  coalesce(lower(parent_ledger."currency"),lower(intent."currency"),'usd'),intent."environment",
  case when link."last_event_type"='REFUND' then 'refunded' else 'reversed' end,
  case when link."last_event_type"='REFUND' then 'refunded' else 'reversed' end,
  intent."source_type",intent."source_id",jsonb_build_object(
    'purchase_intent_id',intent."id",'original_transaction_id',link."original_transaction_id",
    'historical_terminal_projection',true,'provider_payload_stored',false,
    'authority_granted',false,'money_action',false
  )
from public."revenuecat_consumable_transaction_intents" link
join public."money_purchase_intents" intent on intent."id"=link."purchase_intent_id"
left join lateral (
  select ledger."amount_minor",ledger."currency"
  from public."money_access_ledger_events" ledger
  where ledger."user_id"=link."user_id" and ledger."product_id"=link."product_id"
    and ledger."metadata"->>'purchase_intent_id'=link."purchase_intent_id"::text
    and ledger."event_type" not in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED')
  order by ledger."created_at" desc,ledger."id" desc limit 1
) parent_ledger on true
where link."terminal" and link."binding_state"='exact'
  and not exists (
    select 1 from public."money_access_ledger_events" terminal_ledger
    where terminal_ledger."provider_event_id"=link."last_provider_event_id"
      and terminal_ledger."metadata"->>'purchase_intent_id'=link."purchase_intent_id"::text
      and terminal_ledger."event_type"=link."last_event_type"
  );

update public."watch_party_room_memberships" membership
set "role"='viewer',"stage_role"='listener',"can_speak"=false,
    "camera_enabled"=false,"mic_enabled"=false,"membership_state"='removed',
    "left_at"=coalesce(membership."left_at",timezone('utc'::text,now())),
    "updated_at"=timezone('utc'::text,now())
from public."access_grants" grant_row
join public."paid_watch_party_offers" offer on offer."id"=grant_row."source_id"
where grant_row."grant_type" in ('live_watch_party_seat_pass','watch_party_live_ticket')
  and grant_row."status" in ('refunded','revoked','expired','blocked')
  and membership."user_id"=grant_row."user_id"::text and membership."party_id"=offer."party_id"
  and membership."membership_state" in ('active','reconnecting');

alter table public."revenuecat_consumable_transaction_intents"
  drop constraint if exists "revenuecat_transaction_intents_authority_tuple_check";
alter table public."revenuecat_consumable_transaction_intents"
  add constraint "revenuecat_transaction_intents_authority_tuple_check"
  check (
    ("last_provider_event_id" is null and "last_occurred_at" is null and "last_event_type" is null and "last_event_rank" is null and not "terminal")
    or ("last_provider_event_id" is not null and "last_occurred_at" is not null and nullif(trim("last_event_type"), '') is not null and "last_event_rank" between 1 and 7)
  );

-- The terminal ledger row must exist before its reversal link can satisfy the FK.
-- Exact original-transaction identity is mandatory; permissive null matching is gone.
create or replace function public."link_creator_money_terminal_event"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public."money_access_ledger_events"%rowtype;
  v_terminal_state text;
  v_reason text;
  v_original_transaction text := nullif(new."metadata"->>'original_transaction_id', '');
  v_purchase_intent_id text := nullif(new."metadata"->>'purchase_intent_id', '');
begin
  if new."environment" <> 'production'
    or new."payable_state" not in ('refunded','reversed','chargeback')
    or v_original_transaction is null
    or new."creator_id" is null
  then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('creator-payout:' || new."creator_id"::text,0));

  select prior.* into v_original
  from public."money_access_ledger_events" prior
  where prior."id" <> new."id"
    and prior."environment" = 'production'
    and prior."status" = 'verified'
    and prior."user_id" is not distinct from new."user_id"
    and prior."creator_id" is not distinct from new."creator_id"
    and prior."product_id" is not distinct from new."product_id"
    and prior."source_id" is not distinct from new."source_id"
    and prior."payable_state" in ('pending_verification','payable','paid')
    and prior."metadata"->>'original_transaction_id' = v_original_transaction
    and v_purchase_intent_id is not null
    and prior."metadata"->>'purchase_intent_id' = v_purchase_intent_id
  order by prior."created_at" desc, prior."id" desc
  limit 1
  for update;
  if v_original."id" is null then
    return new;
  end if;

  v_terminal_state := case
    when new."payable_state" = 'refunded' then 'refunded'
    when new."payable_state" = 'chargeback' then 'chargeback'
    else 'reversed'
  end;
  v_reason := case
    when v_terminal_state = 'refunded' then 'refund'
    when v_terminal_state = 'chargeback' then 'chargeback'
    else 'revocation'
  end;

  insert into public."creator_money_reversal_links" (
    "terminal_money_ledger_event_id", "original_money_ledger_event_id",
    "amount_cents", "currency", "reason"
  ) values (
    new."id", v_original."id", v_original."amount_minor", v_original."currency", v_reason
  ) on conflict do nothing;

  update public."money_access_ledger_events"
  set "payable_state" = v_terminal_state,
      "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
        'terminal_money_ledger_event_id', new."id",
        'terminal_reason', v_reason
      )
  where "id" = v_original."id";

  update public."money_access_ledger_events"
  set "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
    'reverses_money_ledger_event_id', v_original."id"
  )
  where "id" = new."id";
  return new;
end;
$$;
revoke all on function public."link_creator_money_terminal_event"() from public, anon, authenticated, service_role;
drop trigger if exists "link_creator_money_terminal_event" on public."money_access_ledger_events";
create trigger "link_creator_money_terminal_event"
after insert on public."money_access_ledger_events"
for each row execute function public."link_creator_money_terminal_event"();

-- Creator-authored Seat Pass offers require the creator's exact current session,
-- current legal documents, unrestricted account, and complete Wave 1 eligibility.
alter function public."set_paid_watch_party_offer"(text,text,integer,integer,text)
  rename to "set_paid_watch_party_offer_pre_integrity_closeout";
create or replace function public."set_paid_watch_party_offer"(
  p_party_id text,
  p_title text default 'Watch-Party Seat Pass',
  p_price_cents integer default 99,
  p_seat_limit integer default null,
  p_status text default 'sandbox'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session jsonb := public."wave1_session_authority_readback"();
  v_legal jsonb;
begin
  if v_user is null
    or v_session->>'state' <> 'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean, false)
    or (v_session->>'userId')::uuid is distinct from v_user
    or nullif(v_session->>'sessionGeneration', '') is null
    or nullif(auth.jwt()->>'session_id', '') is null
    or nullif(v_session->>'sessionGeneration', '') is distinct from nullif(auth.jwt()->>'session_id', '')
    or public."is_account_access_restricted"(v_user::text)
  then
    raise exception 'creator_session_authority_required';
  end if;
  v_legal := public."wave1_legal_requirements_readback"('creator_money');
  if coalesce((v_legal->>'allAccepted')::boolean, false) is not true
    or v_legal->>'market' <> 'UNITED_STATES'
  then
    raise exception 'creator_money_legal_not_current';
  end if;
  if not exists (
    select 1
    from public."wave1_creator_eligibility" eligibility
    where eligibility."creator_user_id" = v_user
      and eligibility."state" = 'VERIFIED'
      and eligibility."account_status" = 'ACTIVE'
      and eligibility."age_18_plus"
      and eligibility."legal_accepted"
      and eligibility."creator_role"
      and eligibility."moderation_state" = 'CLEAR'
      and eligibility."market" = 'UNITED_STATES'
      and eligibility."rollout_eligible"
      and eligibility."platform_capability"
      and eligibility."provider_eligible"
      and eligibility."kyc_complete"
      and eligibility."tax_complete"
      and eligibility."sanctions_clear"
      and eligibility."payout_eligible"
  ) then
    raise exception 'creator_eligibility_required' using errcode = '42501';
  end if;
  return public."set_paid_watch_party_offer_pre_integrity_closeout"(
    p_party_id, p_title, p_price_cents, p_seat_limit, p_status
  );
end;
$$;
revoke all on function public."set_paid_watch_party_offer_pre_integrity_closeout"(text,text,integer,integer,text) from public, anon, authenticated, service_role;
revoke all on function public."set_paid_watch_party_offer"(text,text,integer,integer,text) from public, anon;
grant execute on function public."set_paid_watch_party_offer"(text,text,integer,integer,text) to authenticated, service_role;

-- Client metadata is descriptive only. Identity, amount, currency, entitlement,
-- payout and room-authority markers are always derived by the server functions.
create or replace function public."creator_money_client_metadata_internal"(p_metadata jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_surface text;
begin
  if jsonb_typeof(v_metadata) <> 'object'
    or octet_length(v_metadata::text) > 4096
    or v_metadata::text ~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization)'
  then
    raise exception 'unsafe_metadata';
  end if;
  v_surface := nullif(trim(coalesce(v_metadata->>'source_surface', '')), '');
  if v_surface is not null and (length(v_surface) > 80 or v_surface !~ '^[A-Za-z0-9_.:-]+$') then
    v_surface := null;
  end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'source_surface', v_surface,
    'private_note_present', case
      when lower(coalesce(v_metadata->>'private_note_present', 'false')) = 'true' then true
      else null end
  ));
end;
$$;
revoke all on function public."creator_money_client_metadata_internal"(jsonb) from public, anon, authenticated, service_role;

-- A client may skip a second charge only when the currently allowed access can
-- be traced to exactly one consumed intent and its exact nonterminal original
-- transaction.  Never fabricate an intent id for an already-owned response.
create or replace function public."creator_money_existing_purchase_identity_internal"(
  p_user_id uuid,
  p_grant_type text,
  p_source_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_intent_id uuid;
  v_access_grant_id uuid;
  v_provider_product_id text;
begin
  if p_user_id is null
    or nullif(trim(coalesce(p_grant_type,'')),'') is null
    or p_source_id is null
  then
    raise exception 'existing_purchase_identity_invalid';
  end if;

  with candidates as (
    select distinct intent."id",grant_row."id" as access_grant_id,intent."provider_product_id"
    from public."access_grants" grant_row
    join public."provider_events" provider_event
      on provider_event."id"=grant_row."provider_event_id"
     and provider_event."provider"=grant_row."provider"
     and provider_event."provider" in ('revenuecat_app_store','revenuecat_google_play')
     and provider_event."user_id"=p_user_id
     and provider_event."product_id"=grant_row."product_id"
     and provider_event."product_key"=grant_row."metadata"->>'product_key'
     and provider_event."environment"=grant_row."environment"
     and provider_event."status"='processed'
    join public."money_purchase_intents" intent
      on intent."id"::text=grant_row."metadata"->>'purchase_intent_id'
     and intent."user_id"=p_user_id
     and intent."product_id"=grant_row."product_id"
     and intent."product_key"=provider_event."product_key"
     and intent."source_id"=p_source_id
     and intent."provider"=provider_event."provider"
     and intent."provider_product_id"=provider_event."metadata"->>'provider_product_id'
     and intent."provider_product_id"=grant_row."metadata"->>'provider_product_id'
     and intent."environment"=provider_event."environment"
     and intent."environment"=grant_row."environment"
     and intent."status"='consumed'
    join public."revenuecat_consumable_transaction_intents" transaction_link
      on transaction_link."purchase_intent_id"=intent."id"
     and transaction_link."provider"=provider_event."provider"
     and transaction_link."user_id"=p_user_id
     and transaction_link."product_id"=intent."product_id"
     and transaction_link."original_transaction_id"=grant_row."metadata"->>'original_transaction_id'
     and transaction_link."original_transaction_id"=provider_event."metadata"->>'original_transaction_id'
     and transaction_link."last_provider_event_id"=provider_event."id"
     and transaction_link."last_event_type"=provider_event."event_type"
     and transaction_link."last_occurred_at"=provider_event."occurred_at"
     and transaction_link."binding_state"='exact'
     and not transaction_link."terminal"
    where grant_row."user_id"=p_user_id
      and grant_row."grant_type"=p_grant_type
      and grant_row."source_type"='provider_event'
      and grant_row."source_id"=p_source_id
      and ((grant_row."status"='active' and grant_row."environment"='production')
        or (grant_row."status"='sandbox_only' and grant_row."environment"='sandbox'))
      and grant_row."starts_at"<=timezone('utc'::text,now())
      and (grant_row."expires_at" is null or grant_row."expires_at">timezone('utc'::text,now()))
      and grant_row."refunded_at" is null
      and grant_row."revoked_at" is null
      and provider_event."metadata"->>'purchase_intent_id'=intent."id"::text
      and provider_event."metadata"->>'access_grant_id'=grant_row."id"::text
      and nullif(trim(coalesce(provider_event."metadata"->>'original_transaction_id','')),'') is not null
      and intent."source_type"=case p_grant_type
        when 'watch_party_live_ticket' then 'watch_party_live'
        when 'paid_content_access' then 'paid_content'
        when 'event_pass' then 'event'
        when 'vip_pass' then 'vip_pass'
        when 'channel_subscription' then 'channel_subscription'
        else '__unsupported__' end
      and intent."product_type"=p_grant_type
      and (
        (p_grant_type='watch_party_live_ticket' and exists (
          select 1 from public."paid_watch_party_offers" offer
          where offer."id"=p_source_id and offer."creator_id"=intent."creator_id"
            and offer."provider_product_id"=intent."provider_product_id"
            and offer."price_cents"=intent."amount_minor"
            and lower(offer."currency")=lower(intent."currency")
            and ((intent."environment"='sandbox' and offer."status" in ('sandbox','sold_out'))
              or (intent."environment"='production' and offer."status" in ('active','sold_out')))
        ))
        or (p_grant_type='event_pass' and exists (
          select 1 from public."paid_creator_events" offer
          where offer."creator_event_id"=p_source_id and offer."creator_id"=intent."creator_id"
            and offer."provider_product_id"=intent."provider_product_id"
            and offer."price_cents"=intent."amount_minor"
            and lower(offer."currency")=lower(intent."currency")
            and ((intent."environment"='sandbox' and offer."status" in ('sandbox','sold_out'))
              or (intent."environment"='production' and offer."status" in ('active','sold_out')))
        ))
        or (p_grant_type='vip_pass' and exists (
          select 1 from public."creator_vip_pass_offers" offer
          where offer."id"=p_source_id and offer."creator_id"=intent."creator_id"
            and offer."provider_product_id"=intent."provider_product_id"
            and offer."price_cents"=intent."amount_minor"
            and lower(offer."currency")=lower(intent."currency")
            and ((intent."environment"='sandbox' and offer."status"='sandbox')
              or (intent."environment"='production' and offer."status"='active'))
        ))
        or (p_grant_type='channel_subscription' and exists (
          select 1 from public."creator_channel_subscription_offers" offer
          where offer."id"=p_source_id and offer."creator_id"=intent."creator_id"
            and offer."provider_product_id"=intent."provider_product_id"
            and offer."price_cents"=intent."amount_minor"
            and lower(offer."currency")=lower(intent."currency")
            and ((intent."environment"='sandbox' and offer."status"='sandbox')
              or (intent."environment"='production' and offer."status"='active'))
        ))
        or (p_grant_type='paid_content_access' and exists (
          select 1 from public."creator_content_prices" price
          where price."content_id"=p_source_id and price."content_type"='creator_video'
            and price."creator_id"=intent."creator_id" and price."is_paid"
            and price."provider_product_id"=intent."provider_product_id"
            and price."price_cents"=intent."amount_minor"
            and lower(price."currency")=lower(intent."currency")
            and ((intent."environment"='sandbox' and price."status"='sandbox')
              or (intent."environment"='production' and price."status"='active'))
        ))
      )
      and not public."revenuecat_authority_quarantined_internal"(
        provider_event."provider",p_user_id,provider_event."environment"
      )
  )
  select count(*),min(candidate."id"::text)::uuid,
    min(candidate.access_grant_id::text)::uuid,min(candidate."provider_product_id")
  into v_count,v_intent_id,v_access_grant_id,v_provider_product_id
  from candidates candidate;

  if v_count=0 then raise exception 'existing_purchase_identity_missing'; end if;
  if v_count<>1 then raise exception 'existing_purchase_identity_ambiguous'; end if;
  if v_intent_id is null
    or nullif(trim(coalesce(v_provider_product_id,'')),'') is null
  then
    raise exception 'existing_purchase_identity_invalid';
  end if;
  return jsonb_build_object(
    'id',v_intent_id,
    'accessGrantId',v_access_grant_id,
    'providerProductId',v_provider_product_id
  );
end;
$$;
revoke all on function public."creator_money_existing_purchase_identity_internal"(uuid,text,uuid)
  from public,anon,authenticated,service_role;

-- The bounded Tip/Seat App Store lane also validates the buyer session and the
-- Seat creator's current restriction, legal, and eligibility authority before it
-- delegates to the existing exact-mapping implementation.
alter function public."create_ios_app_store_purchase_intent"(text,text,uuid,jsonb)
  rename to "create_ios_app_store_purchase_intent_pre_integrity_closeout";
create or replace function public."create_ios_app_store_purchase_intent"(
  p_provider_product_id text,
  p_source_type text,
  p_source_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session jsonb := public."wave1_session_authority_readback"();
  v_legal jsonb;
  v_mapping public."monetization_product_store_mappings"%rowtype;
  v_offer public."paid_watch_party_offers"%rowtype;
  v_pending public."money_purchase_intents"%rowtype;
  v_creator uuid;
  v_access jsonb;
  v_result jsonb;
begin
  if v_user is null
    or v_session->>'state' <> 'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean, false)
    or (v_session->>'userId')::uuid is distinct from v_user
    or nullif(v_session->>'sessionGeneration', '') is null
    or nullif(auth.jwt()->>'session_id', '') is null
    or public."is_account_access_restricted"(v_user::text)
  then
    raise exception 'buyer_session_authority_required';
  end if;
  v_legal := public."wave1_legal_requirements_readback"('account');
  if coalesce((v_legal->>'allAccepted')::boolean, false) is not true then
    raise exception 'buyer_account_legal_not_current';
  end if;

  select mapping.* into v_mapping
  from public."monetization_product_store_mappings" mapping
  where mapping."platform" = 'ios'
    and mapping."store" = 'app_store'
    and mapping."provider" = 'revenuecat_app_store'
    and mapping."provider_product_id" = trim(coalesce(p_provider_product_id, ''))
  limit 1;

  if v_mapping."concept" = 'creator_tip' then
    v_creator := p_source_id;
  elsif v_mapping."concept" = 'seat_pass' then
    select offer.* into v_offer
    from public."paid_watch_party_offers" offer
    where offer."id" = p_source_id
      and offer."status" = 'sandbox'
    limit 1;
    if v_offer."id" is null then raise exception 'sandbox_watch_party_offer_required'; end if;
    v_creator := v_offer."creator_id";
    v_access:=public."resolve_paid_watch_party_ticket_access"(v_offer."party_id");
    if coalesce((v_access->>'allowed')::boolean,false) then
      v_result:=public."creator_money_existing_purchase_identity_internal"(
        v_user,'watch_party_live_ticket',v_offer."id"
      );
      if v_result->>'providerProductId' is distinct from v_mapping."provider_product_id" then
        raise exception 'existing_purchase_provider_product_mismatch';
      end if;
      return v_result||jsonb_build_object('alreadyPurchased',true);
    end if;
  else
    raise exception 'ios_app_store_concept_not_purchase_intent_enabled';
  end if;
  if not public."wave1_creator_money_subject_authorized_internal"(v_creator) then
    raise exception 'creator_money_source_authority_required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'ios-pending-intent:' || v_user::text || ':revenuecat_app_store:' || v_mapping."provider_product_id",0
  ));
  select pending.* into v_pending
  from public."money_purchase_intents" pending
  where pending."user_id"=v_user
    and pending."provider"='revenuecat_app_store'
    and pending."provider_product_id"=v_mapping."provider_product_id"
    and pending."environment"=v_mapping."environment"
    and pending."status"='pending'
    and pending."expires_at">timezone('utc'::text,now())
  order by pending."created_at",pending."id"
  limit 1 for update;
  if v_pending."id" is not null then
    if v_pending."source_type"=p_source_type
      and v_pending."source_id"=p_source_id
      and v_pending."creator_id"=v_creator
      and v_pending."product_id"=v_mapping."product_id"
      and v_pending."amount_minor"=v_mapping."reference_price_minor"
      and v_pending."currency"=v_mapping."reference_currency"
    then
      v_result:=public."money_purchase_intent_safe_row"(v_pending);
      if v_mapping."concept"='seat_pass' then
        v_result:=v_result||jsonb_build_object('alreadyPurchased',false);
      end if;
      return v_result;
    end if;
    raise exception 'pooled_provider_product_intent_already_pending';
  end if;

  v_result:=public."create_ios_app_store_purchase_intent_pre_integrity_closeout"(
    p_provider_product_id, p_source_type, p_source_id,
    public."creator_money_client_metadata_internal"(p_metadata)
  );
  if coalesce(v_result->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or v_result->>'providerProductId' is distinct from v_mapping."provider_product_id"
  then
    raise exception 'purchase_intent_response_identity_invalid';
  end if;
  if v_mapping."concept"='seat_pass' then
    v_result:=v_result||jsonb_build_object('alreadyPurchased',false);
  end if;
  return v_result;
end;
$$;
revoke all on function public."create_ios_app_store_purchase_intent_pre_integrity_closeout"(text,text,uuid,jsonb) from public, anon, authenticated, service_role;
revoke all on function public."create_ios_app_store_purchase_intent"(text,text,uuid,jsonb) from public, anon;
grant execute on function public."create_ios_app_store_purchase_intent"(text,text,uuid,jsonb) to authenticated, service_role;

-- Production creator-money intents may resolve only an active source offer;
-- sandbox intents may resolve only sandbox offers. A mixed-status source can no
-- longer be selected merely because the shared query accepted both values.
alter function public."create_ios_creator_money_purchase_intent"(text,uuid,integer,jsonb)
  rename to "create_ios_creator_money_purchase_intent_pre_integrity_closeout";
create or replace function public."create_ios_creator_money_purchase_intent"(
  p_concept text,
  p_source_id uuid,
  p_amount_minor integer,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session jsonb := public."wave1_session_authority_readback"();
  v_account_legal jsonb;
  v_concept text := lower(trim(coalesce(p_concept, '')));
  v_required_status text;
  v_price integer;
  v_currency text;
  v_creator uuid;
  v_environment text;
  v_source_type text;
  v_mapping public."monetization_product_store_mappings"%rowtype;
  v_pending public."money_purchase_intents"%rowtype;
  v_access jsonb;
  v_result jsonb;
begin
  if v_user is null
    or v_session->>'state' <> 'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean, false)
    or (v_session->>'userId')::uuid is distinct from v_user
    or nullif(v_session->>'sessionGeneration', '') is null
    or nullif(auth.jwt()->>'session_id', '') is null
    or public."is_account_access_restricted"(v_user::text)
  then
    raise exception 'buyer_session_authority_required';
  end if;
  v_account_legal := public."wave1_legal_requirements_readback"('account');
  if coalesce((v_account_legal->>'allAccepted')::boolean, false) is not true then
    raise exception 'buyer_account_legal_not_current';
  end if;

  v_required_status := case when
    coalesce((select "state" from public."platform_money_kill_switches" where "key"='revenuecat_app_store_enabled'),'off') = 'on'
    and coalesce((select "state" from public."platform_money_kill_switches" where "key"='provider_webhooks_enabled'),'off') = 'on'
    and coalesce((select "state" from public."platform_money_kill_switches" where "key"='creator_monetization_enabled'),'off') = 'on'
    and coalesce((select "state" from public."platform_money_kill_switches" where "key"='live_money_enabled'),'off') = 'on'
  then 'active' else 'sandbox' end;

  if v_concept = 'paid_video' then
    select price."price_cents", lower(price."currency"), price."creator_id" into v_price, v_currency, v_creator
    from public."creator_content_prices" price
    where price."content_id" = p_source_id
      and price."content_type" = 'creator_video'
      and price."is_paid"
      and price."status" = v_required_status
    order by price."updated_at" desc
    limit 1;
  elsif v_concept = 'event_pass' then
    select paid."price_cents", lower(paid."currency"), paid."creator_id" into v_price, v_currency, v_creator
    from public."paid_creator_events" paid
    join public."creator_events" event on event."id" = paid."creator_event_id"
    where paid."creator_event_id" = p_source_id
      and paid."status" = v_required_status
      and event."status" not in ('ended','expired','canceled','removed','unsafe','blocked')
    limit 1;
  elsif v_concept = 'vip_pass' then
    select offer."price_cents", lower(offer."currency"), offer."creator_id" into v_price, v_currency, v_creator
    from public."creator_vip_pass_offers" offer
    where offer."id" = p_source_id and offer."status" = v_required_status;
  elsif v_concept = 'channel_subscription' then
    select offer."price_cents", lower(offer."currency"), offer."creator_id" into v_price, v_currency, v_creator
    from public."creator_channel_subscription_offers" offer
    where offer."id" = p_source_id and offer."status" = v_required_status;
  else
    raise exception 'ios_creator_money_concept_invalid';
  end if;

  if v_price is null then
    raise exception 'ios_creator_money_source_offer_not_available';
  end if;
  if not public."wave1_creator_money_subject_authorized_internal"(v_creator) then
    raise exception 'creator_money_source_authority_required' using errcode = '42501';
  end if;
  if v_currency <> 'usd' or v_price is distinct from p_amount_minor then
    raise exception 'ios_creator_money_source_price_mismatch';
  end if;

  if v_concept='paid_video' and public."has_paid_content_access"(v_user,p_source_id) then
    raise exception 'paid_video_already_purchased';
  elsif v_concept='event_pass' then
    v_access:=public."resolve_paid_creator_event_pass_access"(p_source_id);
    if coalesce((v_access->>'allowed')::boolean,false) then
      return public."creator_money_existing_purchase_identity_internal"(
        v_user,'event_pass',p_source_id
      )||jsonb_build_object('alreadyPurchased',true);
    end if;
  elsif v_concept='vip_pass' then
    v_access:=public."resolve_creator_vip_pass_access"(v_creator);
    if coalesce((v_access->>'allowed')::boolean,false) then
      return public."creator_money_existing_purchase_identity_internal"(
        v_user,'vip_pass',p_source_id
      )||jsonb_build_object('alreadyPurchased',true);
    end if;
  elsif v_concept='channel_subscription' then
    v_access:=public."resolve_creator_channel_subscription_access"(v_creator);
    if coalesce((v_access->>'allowed')::boolean,false) then
      return public."creator_money_existing_purchase_identity_internal"(
        v_user,'channel_subscription',p_source_id
      )||jsonb_build_object('alreadySubscribed',true);
    end if;
  end if;

  v_environment := case when v_required_status='active' then 'production' else 'sandbox' end;
  v_source_type := case v_concept
    when 'paid_video' then 'paid_content'
    when 'event_pass' then 'event'
    when 'vip_pass' then 'vip_pass'
    when 'channel_subscription' then 'channel_subscription'
  end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'ios-pending-intent:' || v_user::text || ':revenuecat_app_store:' || v_concept || ':' || p_amount_minor::text,0
  ));
  select pending.* into v_pending
  from public."money_purchase_intents" pending
  where pending."user_id"=v_user and pending."provider"='revenuecat_app_store'
    and pending."environment"=v_environment and pending."status"='pending'
    and pending."expires_at">timezone('utc'::text,now())
    and pending."source_type"=v_source_type and pending."source_id"=p_source_id
    and pending."creator_id"=v_creator and pending."amount_minor"=v_price and pending."currency"=v_currency
  order by pending."created_at",pending."id" limit 1 for update;
  if v_pending."id" is not null then
    v_result:=public."money_purchase_intent_safe_row"(v_pending)
      || jsonb_build_object('providerProductId',v_pending."provider_product_id",'concept',v_concept,'environment',v_environment);
    if v_concept in ('event_pass','vip_pass') then
      v_result:=v_result||jsonb_build_object('alreadyPurchased',false);
    elsif v_concept='channel_subscription' then
      v_result:=v_result||jsonb_build_object('alreadySubscribed',false);
    end if;
    return v_result;
  end if;
  if v_concept<>'channel_subscription' then
    select mapping.* into v_mapping
    from public."monetization_product_store_mappings" mapping
    where mapping."concept"=v_concept and mapping."platform"='ios' and mapping."store"='app_store'
      and mapping."provider"='revenuecat_app_store' and mapping."reference_price_minor"=v_price
      and mapping."reference_currency"=v_currency and mapping."environment"=v_environment
      and mapping."status"=v_required_status and mapping."store_product_type"='consumable'
      and not mapping."grants_livekit_authority" and not mapping."creates_payable_balance"
    order by mapping."tier" limit 1;
    if v_mapping."id" is null then raise exception 'ios_store_tier_mapping_missing'; end if;
    if exists (
      select 1 from public."money_purchase_intents" pending
      where pending."user_id"=v_user and pending."provider"='revenuecat_app_store'
        and pending."provider_product_id"=v_mapping."provider_product_id"
        and pending."environment"=v_environment and pending."status"='pending'
        and pending."expires_at">timezone('utc'::text,now())
    ) then
      raise exception 'pooled_provider_product_intent_already_pending';
    end if;
  end if;

  v_result:=public."create_ios_creator_money_purchase_intent_pre_integrity_closeout"(
    p_concept, p_source_id, p_amount_minor,
    public."creator_money_client_metadata_internal"(p_metadata)
  );
  if coalesce(v_result->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or nullif(trim(coalesce(v_result->>'providerProductId','')),'') is null
  then
    raise exception 'purchase_intent_response_identity_invalid';
  end if;
  if v_concept in ('event_pass','vip_pass') then
    v_result:=v_result||jsonb_build_object('alreadyPurchased',false);
  elsif v_concept='channel_subscription' then
    v_result:=v_result||jsonb_build_object('alreadySubscribed',false);
  end if;
  return v_result;
end;
$$;
revoke all on function public."create_ios_creator_money_purchase_intent_pre_integrity_closeout"(text,uuid,integer,jsonb) from public, anon, authenticated, service_role;
revoke all on function public."create_ios_creator_money_purchase_intent_v1"(text,uuid,integer,jsonb) from public, anon, authenticated, service_role;
revoke all on function public."create_ios_creator_money_purchase_intent"(text,uuid,integer,jsonb) from public, anon;
grant execute on function public."create_ios_creator_money_purchase_intent"(text,uuid,integer,jsonb) to authenticated, service_role;

comment on function public."set_paid_watch_party_offer"(text,text,integer,integer,text) is
  'Creator-authored Seat Pass offer mutation bound to exact active session, current legal documents, restriction state, and complete Wave 1 creator eligibility.';
comment on function public."create_ios_creator_money_purchase_intent"(text,uuid,integer,jsonb) is
  'Exact-session App Store creator-money intent; production requires an active source offer and sandbox requires a sandbox source offer.';

create or replace function public."wave1_assert_current_creator_money_authority_internal"()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session jsonb := public."wave1_session_authority_readback"();
  v_legal jsonb;
begin
  if v_user is null
    or v_session->>'state' <> 'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean, false)
    or (v_session->>'userId')::uuid is distinct from v_user
    or nullif(v_session->>'sessionGeneration', '') is null
    or nullif(auth.jwt()->>'session_id', '') is null
    or nullif(v_session->>'sessionGeneration', '') is distinct from nullif(auth.jwt()->>'session_id', '')
    or public."is_account_access_restricted"(v_user::text)
  then
    raise exception 'creator_session_authority_required';
  end if;
  v_legal := public."wave1_legal_requirements_readback"('creator_money');
  if coalesce((v_legal->>'allAccepted')::boolean, false) is not true
    or v_legal->>'market' <> 'UNITED_STATES'
  then
    raise exception 'creator_money_legal_not_current';
  end if;
  if not exists (
    select 1
    from public."wave1_creator_eligibility" eligibility
    where eligibility."creator_user_id" = v_user
      and eligibility."state" = 'VERIFIED'
      and eligibility."account_status" = 'ACTIVE'
      and eligibility."age_18_plus"
      and eligibility."legal_accepted"
      and eligibility."creator_role"
      and eligibility."moderation_state" = 'CLEAR'
      and eligibility."market" = 'UNITED_STATES'
      and eligibility."rollout_eligible"
      and eligibility."platform_capability"
      and eligibility."provider_eligible"
      and eligibility."kyc_complete"
      and eligibility."tax_complete"
      and eligibility."sanctions_clear"
      and eligibility."payout_eligible"
  ) then
    raise exception 'creator_eligibility_required' using errcode = '42501';
  end if;
  return v_user;
end;
$$;
revoke all on function public."wave1_assert_current_creator_money_authority_internal"() from public, anon, authenticated, service_role;

-- Safe disable/archive operations remain possible, but any operation that exposes
-- a purchasable creator offer must be authored by that exact current creator
-- session. Owner/operator identity does not substitute for creator eligibility.
create or replace function public."set_paid_watch_party_offer"(
  p_party_id text,
  p_title text default 'Watch-Party Seat Pass',
  p_price_cents integer default 99,
  p_seat_limit integer default null,
  p_status text default 'sandbox'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_status text := lower(trim(coalesce(p_status,'sandbox')));
  v_prior_rule text;
begin
  if v_status in ('sandbox','active') then
    perform public."wave1_assert_current_creator_money_authority_internal"();
  end if;
  select coalesce(
    nullif(offer."metadata"->>'pre_paid_content_access_rule',''),
    room."content_access_rule"
  ) into v_prior_rule
  from public."watch_party_rooms" room
  left join lateral (
    select current_offer."metadata"
    from public."paid_watch_party_offers" current_offer
    where upper(coalesce(current_offer."party_id",''))=upper(trim(p_party_id))
      and current_offer."status" in ('sandbox','active','paused','sold_out','blocked')
    order by current_offer."updated_at" desc,current_offer."id" desc
    limit 1
  ) offer on true
  where upper(room."party_id")=upper(trim(p_party_id));
  v_result := public."set_paid_watch_party_offer_pre_integrity_closeout"(
    p_party_id,p_title,p_price_cents,p_seat_limit,p_status
  );
  if v_status in ('sandbox','active','paused','sold_out','blocked') then
    update public."paid_watch_party_offers" offer
    set "metadata"=coalesce(offer."metadata",'{}'::jsonb) || jsonb_build_object(
          'pre_paid_content_access_rule',coalesce(nullif(v_prior_rule,'party_pass'),'party_pass')
        ),
        "updated_at"=timezone('utc'::text,now())
    where upper(coalesce(offer."party_id",''))=upper(trim(p_party_id))
      and offer."status" in ('sandbox','active','paused','sold_out','blocked');
    update public."watch_party_rooms" room
    set "content_access_rule"='party_pass',"updated_at"=timezone('utc'::text,now())
    where upper(room."party_id")=upper(trim(p_party_id));
    update public."watch_party_room_memberships" membership
    set "role"='viewer',"stage_role"='listener',"can_speak"=false,
        "camera_enabled"=false,"mic_enabled"=false,"membership_state"='removed',
        "left_at"=coalesce(membership."left_at",timezone('utc'::text,now())),
        "updated_at"=timezone('utc'::text,now())
    from public."watch_party_rooms" room
    where room."party_id"=membership."party_id"
      and upper(room."party_id")=upper(trim(p_party_id))
      and room."host_user_id"::text<>membership."user_id"
      and membership."membership_state" in ('active','reconnecting');
  elsif v_status in ('draft','canceled','archived') then
    update public."paid_watch_party_offers" offer
    set "status"=v_status,"updated_at"=timezone('utc'::text,now())
    where upper(coalesce(offer."party_id",''))=upper(trim(p_party_id))
      and offer."status" in ('sandbox','active','paused','sold_out','blocked');
    if v_prior_rule in ('open','premium') then
      update public."watch_party_rooms" room
      set "content_access_rule"=v_prior_rule,"updated_at"=timezone('utc'::text,now())
      where upper(room."party_id")=upper(trim(p_party_id))
        and room."content_access_rule"='party_pass';
    end if;
  end if;
  return v_result;
end;
$$;

alter function public."set_paid_creator_event_offer"(uuid,text,integer,integer,text)
  rename to "set_paid_creator_event_offer_pre_integrity_closeout";
create or replace function public."set_paid_creator_event_offer"(
  p_creator_event_id uuid,
  p_description text default null,
  p_price_cents integer default 99,
  p_capacity_limit integer default null,
  p_status text default 'sandbox'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_host uuid;
begin
  if lower(trim(coalesce(p_status, 'sandbox'))) in ('draft','sandbox','active') then
    v_user := public."wave1_assert_current_creator_money_authority_internal"();
    select event."host_user_id" into v_host
    from public."creator_events" event
    where event."id" = p_creator_event_id;
    if v_host is null or v_host is distinct from v_user then
      raise exception 'event_creator_required';
    end if;
  end if;
  return public."set_paid_creator_event_offer_pre_integrity_closeout"(
    p_creator_event_id,p_description,p_price_cents,p_capacity_limit,p_status
  );
end;
$$;

alter function public."set_creator_vip_pass_offer"(text,text,text)
  rename to "set_creator_vip_pass_offer_pre_integrity_closeout";
create or replace function public."set_creator_vip_pass_offer"(
  p_title text default 'VIP Pass',
  p_description text default null,
  p_status text default 'sandbox'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(trim(coalesce(p_status, 'sandbox'))) in ('draft','sandbox','active') then
    perform public."wave1_assert_current_creator_money_authority_internal"();
  end if;
  return public."set_creator_vip_pass_offer_pre_integrity_closeout"(p_title,p_description,p_status);
end;
$$;

alter function public."set_creator_channel_subscription_offer"(text,text,text)
  rename to "set_creator_channel_subscription_offer_pre_integrity_closeout";
create or replace function public."set_creator_channel_subscription_offer"(
  p_title text default 'Channel subscription',
  p_description text default null,
  p_status text default 'sandbox'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(trim(coalesce(p_status, 'sandbox'))) in ('draft','sandbox','active') then
    perform public."wave1_assert_current_creator_money_authority_internal"();
  end if;
  return public."set_creator_channel_subscription_offer_pre_integrity_closeout"(p_title,p_description,p_status);
end;
$$;

revoke all on function public."set_paid_creator_event_offer_pre_integrity_closeout"(uuid,text,integer,integer,text) from public, anon, authenticated, service_role;
revoke all on function public."set_creator_vip_pass_offer_pre_integrity_closeout"(text,text,text) from public, anon, authenticated, service_role;
revoke all on function public."set_creator_channel_subscription_offer_pre_integrity_closeout"(text,text,text) from public, anon, authenticated, service_role;
revoke all on function public."set_paid_creator_event_offer"(uuid,text,integer,integer,text) from public, anon;
revoke all on function public."set_creator_vip_pass_offer"(text,text,text) from public, anon;
revoke all on function public."set_creator_channel_subscription_offer"(text,text,text) from public, anon;
grant execute on function public."set_paid_creator_event_offer"(uuid,text,integer,integer,text) to authenticated, service_role;
grant execute on function public."set_creator_vip_pass_offer"(text,text,text) to authenticated, service_role;
grant execute on function public."set_creator_channel_subscription_offer"(text,text,text) to authenticated, service_role;

comment on function public."set_paid_creator_event_offer"(uuid,text,integer,integer,text) is
  'Paid event exposure requires the exact creator session plus current legal, restriction, U.S.-18+, rollout, moderation, provider and payout eligibility authority.';
comment on function public."set_creator_vip_pass_offer"(text,text,text) is
  'VIP offer exposure requires the exact creator session plus current legal, restriction, U.S.-18+, rollout, moderation, provider and payout eligibility authority.';
comment on function public."set_creator_channel_subscription_offer"(text,text,text) is
  'Channel subscription exposure requires the exact creator session plus current legal, restriction, U.S.-18+, rollout, moderation, provider and payout eligibility authority.';

-- Tips and Paid Video are creator-authored money offers too. Exposure requires
-- the same exact current creator authority as every other sale surface; a safe
-- disable remains available to an authenticated owner of the underlying row.
alter function public."upsert_my_creator_tip_settings"(boolean,integer[],integer,integer,integer,text)
  rename to "upsert_my_creator_tip_settings_pre_integrity_closeout";
create or replace function public."upsert_my_creator_tip_settings"(
  p_tips_enabled boolean,
  p_suggested_amounts_cents integer[] default array[100,300,500,1000],
  p_default_amount_cents integer default null,
  p_min_amount_cents integer default 100,
  p_max_amount_cents integer default 50000,
  p_currency text default 'usd'
)
returns public."creator_tip_settings"
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(p_tips_enabled, false) then
    perform public."wave1_assert_current_creator_money_authority_internal"();
  end if;
  return public."upsert_my_creator_tip_settings_pre_integrity_closeout"(
    p_tips_enabled,p_suggested_amounts_cents,p_default_amount_cents,
    p_min_amount_cents,p_max_amount_cents,p_currency
  );
end;
$$;

alter function public."set_creator_content_price"(text,uuid,boolean,integer,text)
  rename to "set_creator_content_price_pre_integrity_closeout";
create or replace function public."set_creator_content_price"(
  p_content_type text,
  p_content_id uuid,
  p_is_paid boolean,
  p_price_cents integer,
  p_currency text default 'usd'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(p_is_paid, false) then
    perform public."wave1_assert_current_creator_money_authority_internal"();
  end if;
  return public."set_creator_content_price_pre_integrity_closeout"(
    p_content_type,p_content_id,p_is_paid,p_price_cents,p_currency
  );
end;
$$;

revoke all on function public."upsert_my_creator_tip_settings_pre_integrity_closeout"(boolean,integer[],integer,integer,integer,text) from public, anon, authenticated, service_role;
revoke all on function public."set_creator_content_price_pre_integrity_closeout"(text,uuid,boolean,integer,text) from public, anon, authenticated, service_role;
revoke all on function public."upsert_my_creator_tip_settings"(boolean,integer[],integer,integer,integer,text) from public, anon;
revoke all on function public."set_creator_content_price"(text,uuid,boolean,integer,text) from public, anon;
grant execute on function public."upsert_my_creator_tip_settings"(boolean,integer[],integer,integer,integer,text) to authenticated, service_role;
grant execute on function public."set_creator_content_price"(text,uuid,boolean,integer,text) to authenticated, service_role;

-- The generic Google/RevenueCat sandbox RPC previously copied creator, amount,
-- currency and marker metadata from the client. Resolve the exact source offer,
-- cross-bind it to the fixed provider tier, and permit only one live pooled-tier
-- intent per buyer/product so a webhook cannot select a different creator/source.
alter function public."create_money_purchase_intent"(text,text,uuid,jsonb)
  rename to "create_money_purchase_intent_pre_integrity_closeout";
create or replace function public."create_money_purchase_intent"(
  p_product_key text,
  p_source_type text,
  p_source_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_actor_email text := nullif(lower(trim(coalesce(auth.jwt()->>'email',''))), '');
  v_session jsonb := public."wave1_session_authority_readback"();
  v_account_legal jsonb;
  v_headers jsonb := case
    when nullif(current_setting('request.headers', true), '') is null then '{}'::jsonb
    else current_setting('request.headers', true)::jsonb end;
  v_client_platform text;
  v_ios_concept text;
  v_ios_amount integer;
  v_product public."monetization_products"%rowtype;
  v_expected_source_type text;
  v_creator uuid;
  v_amount integer;
  v_currency text;
  v_catalog_amount integer;
  v_catalog_digits text;
  v_safe_metadata jsonb := public."creator_money_client_metadata_internal"(p_metadata);
  v_intent public."money_purchase_intents"%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_user is null
    or v_session->>'state' <> 'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean, false)
    or (v_session->>'userId')::uuid is distinct from v_user
    or nullif(v_session->>'sessionGeneration', '') is null
    or nullif(auth.jwt()->>'session_id', '') is null
    or nullif(v_session->>'sessionGeneration', '') is distinct from nullif(auth.jwt()->>'session_id', '')
    or public."is_account_access_restricted"(v_user::text)
  then
    raise exception 'buyer_session_authority_required';
  end if;
  if p_source_id is null then raise exception 'source_id_required'; end if;
  v_account_legal := public."wave1_legal_requirements_readback"('account');
  if coalesce((v_account_legal->>'allAccepted')::boolean, false) is not true then
    raise exception 'buyer_account_legal_not_current';
  end if;

  v_client_platform := lower(trim(coalesce(v_headers->>'x-chillywood-platform', '')));
  v_ios_concept := case p_product_key
    when 'paid_content_access_sandbox_099' then 'paid_video'
    when 'event_pass_sandbox_099' then 'event_pass'
    when 'vip_pass_sandbox_499' then 'vip_pass'
    when 'channel_subscription_sandbox_monthly_499' then 'channel_subscription'
    else null end;
  if v_client_platform = 'ios' and v_ios_concept is not null then
    if coalesce(p_metadata->>'amount_minor','') !~ '^[0-9]+$' then
      raise exception 'amount_minor_invalid';
    end if;
    v_ios_amount := (p_metadata->>'amount_minor')::integer;
    return public."create_ios_creator_money_purchase_intent"(
      v_ios_concept,p_source_id,v_ios_amount,
      v_safe_metadata || jsonb_build_object(
        'client_platform_hint','ios',
        'legacy_product_key',p_product_key,
        'legacy_source_type',p_source_type
      )
    );
  end if;

  select product.* into v_product
  from public."monetization_products" product
  where product."product_key" = p_product_key
  limit 1;
  if v_product."id" is null then raise exception 'product_not_found'; end if;
  if v_product."status" <> 'sandbox' or v_product."environment" <> 'sandbox' then raise exception 'sandbox_provider_mapping_required'; end if;
  if v_product."product_type" = 'premium_subscription' then raise exception 'premium_uses_existing_revenuecat_shell'; end if;
  if v_product."product_type" = 'merch_physical_good' or coalesce(v_product."is_physical_good", false) then raise exception 'merch_is_physical_goods_only'; end if;
  if not coalesce(v_product."is_android_digital", false)
    or v_product."provider" <> 'revenuecat_google_play'
    or nullif(trim(coalesce(v_product."provider_product_id", '')), '') is null
    or coalesce((v_product."metadata"->>'sandbox_purchase_intents_enabled')::boolean, false) is not true
  then
    raise exception 'android_digital_product_not_authorized';
  end if;
  if not (
    public."has_platform_role"(array['owner'::text,'operator'::text])
    or public."has_active_beta_access"()
    or public."resolve_sandbox_monetization_tester"(v_user::text,v_actor_email)
  ) then
    raise exception 'sandbox_monetization_tester_required';
  end if;

  v_expected_source_type := case v_product."product_type"
    when 'paid_content_access' then 'paid_content'
    when 'watch_party_live_ticket' then 'watch_party_live'
    when 'creator_tip' then 'creator_tip'
    when 'event_pass' then 'event'
    when 'channel_subscription' then 'channel_subscription'
    when 'vip_pass' then 'vip_pass'
    else null end;
  if v_expected_source_type is null then raise exception 'unsupported_purchase_intent_product'; end if;
  if p_source_type is distinct from v_expected_source_type then raise exception 'source_type_mismatch'; end if;

  v_catalog_digits := coalesce(nullif(v_product."metadata"->>'price_tier',''), substring(v_product."product_key" from '([0-9]+)$'));
  if coalesce(v_catalog_digits, '') !~ '^[0-9]+$' then raise exception 'provider_catalog_price_missing'; end if;
  v_catalog_amount := v_catalog_digits::integer;
  if v_catalog_amount <= 0 then raise exception 'provider_catalog_price_invalid'; end if;

  if v_product."product_type" = 'paid_content_access' then
    select price."creator_id",price."price_cents",lower(price."currency")
      into v_creator,v_amount,v_currency
    from public."creator_content_prices" price
    where price."content_id" = p_source_id
      and price."content_type" = 'creator_video'
      and price."is_paid"
      and price."status" = 'sandbox'
      and price."provider" = v_product."provider"
      and price."provider_product_id" = v_product."provider_product_id"
    limit 1;
  elsif v_product."product_type" = 'watch_party_live_ticket' then
    select offer."creator_id",offer."price_cents",lower(offer."currency")
      into v_creator,v_amount,v_currency
    from public."paid_watch_party_offers" offer
    join public."watch_party_rooms" room on room."party_id" = offer."party_id"
    where offer."id" = p_source_id
      and offer."status" = 'sandbox'
      and offer."provider" = v_product."provider"
      and offer."provider_product_id" = v_product."provider_product_id"
      and (offer."seat_limit" is null or offer."seats_sold" < offer."seat_limit")
      and coalesce(room."is_active",false)
      and room."room_type" = 'title'
    limit 1;
  elsif v_product."product_type" = 'creator_tip' then
    select settings."creator_id",v_catalog_amount,lower(settings."currency")
      into v_creator,v_amount,v_currency
    from public."creator_tip_settings" settings
    where settings."creator_id" = p_source_id
      and settings."tips_enabled"
      and settings."status" = 'active'
      and settings."provider_environment" = 'test'
      and v_catalog_amount between settings."min_amount_cents" and settings."max_amount_cents"
    limit 1;
  elsif v_product."product_type" = 'event_pass' then
    select offer."creator_id",offer."price_cents",lower(offer."currency")
      into v_creator,v_amount,v_currency
    from public."paid_creator_events" offer
    join public."creator_events" event on event."id" = offer."creator_event_id"
    where offer."creator_event_id" = p_source_id
      and offer."status" = 'sandbox'
      and offer."provider" = v_product."provider"
      and offer."provider_product_id" = v_product."provider_product_id"
      and event."status" not in ('ended','expired','canceled','removed','unsafe','blocked')
    limit 1;
  elsif v_product."product_type" = 'channel_subscription' then
    select offer."creator_id",offer."price_cents",lower(offer."currency")
      into v_creator,v_amount,v_currency
    from public."creator_channel_subscription_offers" offer
    where offer."id" = p_source_id
      and offer."status" = 'sandbox'
      and offer."interval" = 'monthly'
      and offer."provider" = v_product."provider"
      and offer."provider_product_id" = v_product."provider_product_id"
    limit 1;
  elsif v_product."product_type" = 'vip_pass' then
    select offer."creator_id",offer."price_cents",lower(offer."currency")
      into v_creator,v_amount,v_currency
    from public."creator_vip_pass_offers" offer
    where offer."id" = p_source_id
      and offer."status" = 'sandbox'
      and offer."provider" = v_product."provider"
      and offer."provider_product_id" = v_product."provider_product_id"
    limit 1;
  end if;

  if v_creator is null or v_amount is null then raise exception 'exact_source_offer_not_available'; end if;
  if v_amount is distinct from v_catalog_amount or v_currency is distinct from 'usd' then raise exception 'source_offer_catalog_price_mismatch'; end if;
  if v_creator = v_user then raise exception 'creator_cannot_purchase_own_offer'; end if;
  if exists (
    select 1 from public."channel_audience_blocks" block_row
    where (block_row."channel_user_id" = v_creator::text and block_row."blocked_user_id" = v_user::text)
       or (block_row."channel_user_id" = v_user::text and block_row."blocked_user_id" = v_creator::text)
  ) then
    raise exception 'creator_money_blocked_by_audience_policy';
  end if;
  if public."is_account_access_restricted"(v_creator::text)
    or not public."wave1_user_has_active_legal_requirements_internal"(v_creator,'creator_money')
    or not exists (
      select 1 from public."wave1_creator_eligibility" eligibility
      where eligibility."creator_user_id" = v_creator
        and eligibility."state" = 'VERIFIED'
        and eligibility."account_status" = 'ACTIVE'
        and eligibility."age_18_plus" and eligibility."legal_accepted" and eligibility."creator_role"
        and eligibility."moderation_state" = 'CLEAR' and eligibility."market" = 'UNITED_STATES'
        and eligibility."rollout_eligible" and eligibility."platform_capability"
        and eligibility."provider_eligible" and eligibility."kyc_complete" and eligibility."tax_complete"
        and eligibility."sanctions_clear" and eligibility."payout_eligible"
    )
  then
    raise exception 'creator_authority_required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'google-money-intent:' || v_user::text || ':' || v_product."provider" || ':' || v_product."provider_product_id", 0
  ));
  if exists (
    select 1 from public."money_purchase_intents" pending
    where pending."user_id" = v_user
      and pending."provider" = v_product."provider"
      and pending."provider_product_id" = v_product."provider_product_id"
      and pending."environment" = 'sandbox'
      and pending."status" = 'pending'
      and pending."expires_at" > v_now
  ) then
    raise exception 'pooled_provider_product_intent_already_pending';
  end if;

  insert into public."money_purchase_intents" (
    "user_id","product_id","product_key","product_type","provider","provider_product_id",
    "source_type","source_id","creator_id","platform_id","environment","status","amount_minor",
    "currency","idempotency_key","expires_at","metadata"
  ) values (
    v_user,v_product."id",v_product."product_key",v_product."product_type",v_product."provider",v_product."provider_product_id",
    v_expected_source_type,p_source_id,v_creator,null,'sandbox','pending',v_amount,'usd',
    'money_intent:' || v_user::text || ':' || gen_random_uuid()::text,v_now + interval '15 minutes',
    jsonb_build_object(
      'sandbox_only',true,'not_payable',true,'client_selected_payable_state',false,
      'sandbox_tester_checked',true,'source_offer_authority_checked',true,
      'creator_id_server_derived',true,'amount_currency_server_derived',true,
      'grants_livekit_authority',false,'grants_host_authority',false,'payout_ready',false
    ) || v_safe_metadata
  ) returning * into v_intent;
  return public."money_purchase_intent_safe_row"(v_intent);
end;
$$;
revoke all on function public."create_money_purchase_intent_pre_integrity_closeout"(text,text,uuid,jsonb) from public, anon, authenticated, service_role;
revoke all on function public."create_money_purchase_intent"(text,text,uuid,jsonb) from public, anon;
grant execute on function public."create_money_purchase_intent"(text,text,uuid,jsonb) to authenticated, service_role;

comment on function public."upsert_my_creator_tip_settings"(boolean,integer[],integer,integer,integer,text) is
  'Tip exposure requires exact current creator session/legal/restriction and complete Wave 1 U.S.-18+/rollout/provider authority; disabling remains available.';
comment on function public."set_creator_content_price"(text,uuid,boolean,integer,text) is
  'Paid Video exposure requires exact current creator session/legal/restriction and complete Wave 1 U.S.-18+/rollout/provider authority; disabling remains available.';
comment on function public."create_money_purchase_intent"(text,text,uuid,jsonb) is
  'Creates one exact source-bound Google/RevenueCat sandbox intent from server-derived creator/price/currency and non-authoritative allowlisted client metadata.';

-- Specialized checkout RPCs expose a structurally exact pre-charge contract.
-- An already-owned result carries the unique real consumed intent identity;
-- a new result carries the newly created/pending intent and an explicit false
-- flag.  Missing, ambiguous or mismatched provider identity never reaches the
-- client purchase API.
alter function public."create_paid_watch_party_ticket_purchase_intent"(uuid)
  rename to "create_paid_watch_party_ticket_purchase_intent_pre_integrity_closeout";
create or replace function public."create_paid_watch_party_ticket_purchase_intent"(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_offer public."paid_watch_party_offers"%rowtype;
  v_access jsonb;
  v_result jsonb;
begin
  if v_user is null then raise exception 'auth_required'; end if;
  select offer.* into v_offer from public."paid_watch_party_offers" offer
  where offer."id"=p_offer_id;
  if v_offer."id" is null then raise exception 'offer_not_found'; end if;
  v_access:=public."resolve_paid_watch_party_ticket_access"(v_offer."party_id");
  if coalesce((v_access->>'allowed')::boolean,false) then
    v_result:=public."creator_money_existing_purchase_identity_internal"(
      v_user,'watch_party_live_ticket',v_offer."id"
    );
    if v_result->>'providerProductId' is distinct from v_offer."provider_product_id" then
      raise exception 'existing_purchase_provider_product_mismatch';
    end if;
    return v_result||jsonb_build_object('alreadyPurchased',true);
  end if;
  v_result:=public."create_paid_watch_party_ticket_purchase_intent_pre_integrity_closeout"(p_offer_id);
  if coalesce(v_result->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or v_result->>'providerProductId' is distinct from v_offer."provider_product_id"
  then raise exception 'purchase_intent_response_identity_invalid'; end if;
  return v_result||jsonb_build_object('alreadyPurchased',false);
end;
$$;

alter function public."create_paid_creator_event_pass_purchase_intent"(uuid)
  rename to "create_paid_creator_event_pass_purchase_intent_pre_integrity_closeout";
create or replace function public."create_paid_creator_event_pass_purchase_intent"(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_offer public."paid_creator_events"%rowtype;
  v_access jsonb;
  v_result jsonb;
begin
  if v_user is null then raise exception 'auth_required'; end if;
  select offer.* into v_offer from public."paid_creator_events" offer
  where offer."id"=p_event_id;
  if v_offer."id" is null then raise exception 'offer_not_found'; end if;
  v_access:=public."resolve_paid_creator_event_pass_access"(v_offer."creator_event_id");
  if coalesce((v_access->>'allowed')::boolean,false) then
    v_result:=public."creator_money_existing_purchase_identity_internal"(
      v_user,'event_pass',v_offer."creator_event_id"
    );
    if v_result->>'providerProductId' is distinct from v_offer."provider_product_id" then
      raise exception 'existing_purchase_provider_product_mismatch';
    end if;
    return v_result||jsonb_build_object('alreadyPurchased',true);
  end if;
  v_result:=public."create_paid_creator_event_pass_purchase_intent_pre_integrity_closeout"(p_event_id);
  if coalesce(v_result->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or v_result->>'providerProductId' is distinct from v_offer."provider_product_id"
  then raise exception 'purchase_intent_response_identity_invalid'; end if;
  return v_result||jsonb_build_object('alreadyPurchased',false);
end;
$$;

alter function public."create_creator_vip_pass_purchase_intent"(uuid)
  rename to "create_creator_vip_pass_purchase_intent_pre_integrity_closeout";
create or replace function public."create_creator_vip_pass_purchase_intent"(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_offer public."creator_vip_pass_offers"%rowtype;
  v_access jsonb;
  v_result jsonb;
begin
  if v_user is null then raise exception 'auth_required'; end if;
  select offer.* into v_offer from public."creator_vip_pass_offers" offer
  where offer."id"=p_offer_id;
  if v_offer."id" is null then raise exception 'offer_not_found'; end if;
  v_access:=public."resolve_creator_vip_pass_access"(v_offer."creator_id");
  if coalesce((v_access->>'allowed')::boolean,false) then
    v_result:=public."creator_money_existing_purchase_identity_internal"(
      v_user,'vip_pass',v_offer."id"
    );
    if v_result->>'providerProductId' is distinct from v_offer."provider_product_id" then
      raise exception 'existing_purchase_provider_product_mismatch';
    end if;
    return v_result||jsonb_build_object('alreadyPurchased',true);
  end if;
  v_result:=public."create_creator_vip_pass_purchase_intent_pre_integrity_closeout"(p_offer_id);
  if coalesce(v_result->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or v_result->>'providerProductId' is distinct from v_offer."provider_product_id"
  then raise exception 'purchase_intent_response_identity_invalid'; end if;
  return v_result||jsonb_build_object('alreadyPurchased',false);
end;
$$;

alter function public."create_creator_channel_subscription_purchase_intent"(uuid)
  rename to "create_creator_channel_subscription_purchase_intent_pre_integrity_closeout";
create or replace function public."create_creator_channel_subscription_purchase_intent"(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_offer public."creator_channel_subscription_offers"%rowtype;
  v_access jsonb;
  v_result jsonb;
begin
  if v_user is null then raise exception 'auth_required'; end if;
  select offer.* into v_offer from public."creator_channel_subscription_offers" offer
  where offer."id"=p_offer_id;
  if v_offer."id" is null then raise exception 'offer_not_found'; end if;
  v_access:=public."resolve_creator_channel_subscription_access"(v_offer."creator_id");
  if coalesce((v_access->>'allowed')::boolean,false) then
    v_result:=public."creator_money_existing_purchase_identity_internal"(
      v_user,'channel_subscription',v_offer."id"
    );
    if v_result->>'providerProductId' is distinct from v_offer."provider_product_id" then
      raise exception 'existing_purchase_provider_product_mismatch';
    end if;
    return v_result||jsonb_build_object('alreadySubscribed',true);
  end if;
  v_result:=public."create_creator_channel_subscription_purchase_intent_pre_integrity_closeout"(p_offer_id);
  if coalesce(v_result->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or v_result->>'providerProductId' is distinct from v_offer."provider_product_id"
  then raise exception 'purchase_intent_response_identity_invalid'; end if;
  return v_result||jsonb_build_object('alreadySubscribed',false);
end;
$$;

revoke all on function public."create_paid_watch_party_ticket_purchase_intent_pre_integrity_closeout"(uuid) from public,anon,authenticated,service_role;
revoke all on function public."create_paid_creator_event_pass_purchase_intent_pre_integrity_closeout"(uuid) from public,anon,authenticated,service_role;
revoke all on function public."create_creator_vip_pass_purchase_intent_pre_integrity_closeout"(uuid) from public,anon,authenticated,service_role;
revoke all on function public."create_creator_channel_subscription_purchase_intent_pre_integrity_closeout"(uuid) from public,anon,authenticated,service_role;
revoke all on function public."create_paid_watch_party_ticket_purchase_intent"(uuid) from public,anon;
revoke all on function public."create_paid_creator_event_pass_purchase_intent"(uuid) from public,anon;
revoke all on function public."create_creator_vip_pass_purchase_intent"(uuid) from public,anon;
revoke all on function public."create_creator_channel_subscription_purchase_intent"(uuid) from public,anon;
grant execute on function public."create_paid_watch_party_ticket_purchase_intent"(uuid) to authenticated,service_role;
grant execute on function public."create_paid_creator_event_pass_purchase_intent"(uuid) to authenticated,service_role;
grant execute on function public."create_creator_vip_pass_purchase_intent"(uuid) to authenticated,service_role;
grant execute on function public."create_creator_channel_subscription_purchase_intent"(uuid) to authenticated,service_role;

-- The public Tip surface is also fail-closed on current creator authority. The
-- checkout Edge function writes creator_tip_transactions with service authority;
-- the INSERT trigger above independently rechecks the same condition before any
-- provider checkout row can be created.
create or replace function public."get_creator_tip_public_status"(p_creator_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public."creator_tip_settings"%rowtype;
  v_tips_flag text := 'off';
  v_live_flag text := 'off';
begin
  if p_creator_id is null then
    return jsonb_build_object('canTip',false,'reason','creator_missing');
  end if;
  if not public."wave1_creator_money_subject_authorized_internal"(p_creator_id) then
    return jsonb_build_object('canTip',false,'reason','creator_authority_not_current','creatorId',p_creator_id);
  end if;
  select "state" into v_tips_flag from public."platform_money_kill_switches" where "key"='tips_enabled';
  select "state" into v_live_flag from public."platform_money_kill_switches" where "key"='live_money_enabled';
  select settings.* into v_settings from public."creator_tip_settings" settings where settings."creator_id"=p_creator_id;
  if v_settings."id" is null then
    return jsonb_build_object('canTip',false,'reason','tips_not_enabled','creatorId',p_creator_id);
  end if;
  return jsonb_build_object(
    'canTip',coalesce(v_settings."tips_enabled",false)
      and v_settings."status"='active'
      and coalesce(v_settings."provider_charges_enabled",false)
      and coalesce(v_settings."provider_payouts_enabled",false)
      and coalesce(v_tips_flag,'off') in ('on','sandbox_only'),
    'status',v_settings."status",
    'reason',case
      when coalesce(v_tips_flag,'off') not in ('on','sandbox_only') then 'tips_disabled_by_platform'
      when not coalesce(v_settings."tips_enabled",false) then 'tips_paused'
      when v_settings."status"<>'active' then v_settings."status"
      when not coalesce(v_settings."provider_charges_enabled",false) then 'provider_charges_not_ready'
      when not coalesce(v_settings."provider_payouts_enabled",false) then 'provider_payouts_not_ready'
      else 'ready' end,
    'creatorId',p_creator_id,'currency',v_settings."currency",
    'suggestedAmountsCents',v_settings."suggested_amounts_cents",
    'defaultAmountCents',v_settings."default_amount_cents",
    'minAmountCents',v_settings."min_amount_cents",'maxAmountCents',v_settings."max_amount_cents",
    'providerEnvironment',v_settings."provider_environment",
    'testMode',v_settings."provider_environment"='test' or coalesce(v_live_flag,'off')<>'on',
    'liveMoneyEnabled',coalesce(v_live_flag,'off')='on',
    'policyCopy','Tips support the creator and do not unlock content, badges, room access, VIP, or perks.'
  );
end;
$$;
revoke all on function public."get_creator_tip_public_status"(uuid) from public, anon, authenticated, service_role;
grant execute on function public."get_creator_tip_public_status"(uuid) to anon, authenticated;

-- Premium provider authority must be finite and structurally exact. Historical
-- null-period rows are downgraded before the invariant is validated; they are
-- not rewritten into a fabricated paid period.
update public."user_entitlements" entitlement
set "status" = 'pending',
    "revoked_at" = null,
    "updated_at" = timezone('utc'::text, now()),
    "metadata" = coalesce(entitlement."metadata", '{}'::jsonb) || jsonb_build_object(
      'authority_closeout_reason','premium_finite_period_evidence_missing',
      'authority_granted',false
    )
where entitlement."entitlement_key" = 'premium'
  and entitlement."status" in ('active','trialing','grace_period')
  and (
    entitlement."starts_at" is null
    or entitlement."expires_at" is null
    or entitlement."expires_at" <= entitlement."starts_at"
  );
update public."access_grants" grant_row
set "status" = 'blocked',
    "revoked_at" = coalesce(grant_row."revoked_at", timezone('utc'::text, now())),
    "revoke_reason" = coalesce(grant_row."revoke_reason", 'Finite Premium period evidence was missing during authority closeout.'),
    "updated_at" = timezone('utc'::text, now()),
    "metadata" = coalesce(grant_row."metadata", '{}'::jsonb) || jsonb_build_object(
      'authority_closeout_reason','premium_finite_period_evidence_missing',
      'authority_granted',false
    )
where grant_row."grant_type" = 'premium'
  and grant_row."status" in ('active','sandbox_only')
  and (
    grant_row."starts_at" is null
    or grant_row."expires_at" is null
    or grant_row."expires_at" <= grant_row."starts_at"
  );
alter table public."user_entitlements"
  drop constraint if exists "user_entitlements_premium_finite_authority_check";
alter table public."user_entitlements"
  add constraint "user_entitlements_premium_finite_authority_check" check (
    "entitlement_key" <> 'premium'
    or "status" not in ('active','trialing','grace_period')
    or ("starts_at" is not null and "expires_at" is not null and "expires_at" > "starts_at")
  );
alter table public."access_grants"
  drop constraint if exists "access_grants_premium_finite_authority_check";
alter table public."access_grants"
  add constraint "access_grants_premium_finite_authority_check" check (
    "grant_type" <> 'premium'
    or "status" not in ('active','sandbox_only')
    or ("starts_at" is not null and "expires_at" is not null and "expires_at" > "starts_at")
  );

-- No provider projector writes the legacy premium_watch_party/premium_live or
-- global paid_content aliases; RevenueCat authority is projected only as the
-- canonical `premium` entitlement, while paid items use exact access_grants.
-- Retaining manually seeded aliases as independent authority would bypass exact
-- transaction/source provenance. Preserve rows as historical projections, but
-- close active authority and prohibit future active aliases.
update public."user_entitlements" entitlement
set "status"='revoked',
    "revoked_at"=coalesce(entitlement."revoked_at",timezone('utc'::text,now())),
    "updated_at"=timezone('utc'::text,now()),
    "metadata"=coalesce(entitlement."metadata",'{}'::jsonb)||jsonb_build_object(
      'authority_granted',false,
      'integrity_closeout_reason','unsupported_premium_family_alias'
    )
where entitlement."entitlement_key" in ('premium_watch_party','premium_live','paid_content')
  and entitlement."status" in ('active','trialing','grace_period');
alter table public."user_entitlements"
  drop constraint if exists "user_entitlements_supported_premium_authority_check";
alter table public."user_entitlements"
  add constraint "user_entitlements_supported_premium_authority_check" check (
    "entitlement_key" not in ('premium_watch_party','premium_live','paid_content')
    or "status" not in ('active','trialing','grace_period')
  );

-- RevenueCat event identity is not a store-transaction identity.  Preserve the
-- exact original transaction separately so a refunded/revoked purchase cannot
-- be replayed under a fresh webhook event id or rebound to another subject.
create table public."revenuecat_premium_transaction_authority" (
  "id" uuid primary key default gen_random_uuid(),
  "provider" text not null,
  "original_transaction_id" text not null,
  "user_id" uuid not null references auth."users"("id") on delete restrict,
  "environment" text not null,
  "current_product_id" uuid references public."monetization_products"("id") on delete restrict,
  "current_provider_product_id" text not null,
  "current_provider_base_plan_id" text,
  "first_event_id" text not null,
  "first_event_hash" text not null,
  "latest_event_id" text not null,
  "latest_event_hash" text not null,
  "latest_event_type" text not null,
  "latest_occurred_at" timestamptz not null,
  "latest_event_rank" smallint not null,
  "authority_state" text not null,
  "created_at" timestamptz not null default timezone('utc'::text,now()),
  "updated_at" timestamptz not null default timezone('utc'::text,now()),
  constraint "revenuecat_premium_transaction_provider_check"
    check ("provider" in ('revenuecat_app_store','revenuecat_google_play')),
  constraint "revenuecat_premium_transaction_environment_check"
    check ("environment" in ('sandbox','production')),
  constraint "revenuecat_premium_transaction_original_shape_check" check (
    "original_transaction_id"=trim("original_transaction_id")
    and length("original_transaction_id") between 1 and 512
    and "original_transaction_id" !~ '[[:cntrl:]]'
  ),
  constraint "revenuecat_premium_transaction_product_shape_check" check (
    "current_provider_product_id"=trim("current_provider_product_id")
    and length("current_provider_product_id") between 1 and 512
  ),
  constraint "revenuecat_premium_transaction_hash_check" check (
    "first_event_hash" ~ '^[0-9a-f]{64}$' and "latest_event_hash" ~ '^[0-9a-f]{64}$'
  ),
  constraint "revenuecat_premium_transaction_state_check" check (
    "authority_state" in ('pending','active','retained','expired','financial_terminal','blocked')
  ),
  constraint "revenuecat_premium_transaction_resolved_product_check" check (
    "current_product_id" is not null or "authority_state"='blocked'
  ),
  unique ("provider","original_transaction_id")
);
create index "revenuecat_premium_transaction_subject_idx"
  on public."revenuecat_premium_transaction_authority"("user_id","environment","updated_at" desc);
alter table public."revenuecat_premium_transaction_authority" enable row level security;
alter table public."revenuecat_premium_transaction_authority" force row level security;
revoke all on table public."revenuecat_premium_transaction_authority" from public,anon,authenticated,service_role;
grant select on table public."revenuecat_premium_transaction_authority" to service_role;
comment on table public."revenuecat_premium_transaction_authority" is
  'Internal exact RevenueCat Premium store-transaction binding. Provider projectors own writes; service callers may inspect but cannot mutate transaction authority.';

create or replace function public."premium_subject_has_finite_authority_internal"(p_user_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(trim(coalesce(p_user_id,'')),'') is not null
    and not public."is_account_access_restricted"(p_user_id)
    and not public."revenuecat_authority_quarantined_internal"(
      null,p_user_id::uuid,null
    )
    and exists (
      select 1
      from public."user_entitlements" entitlement
      join public."access_grants" grant_row
        on grant_row."user_id"::text=entitlement."user_id"
       and grant_row."grant_type"='premium'
       and grant_row."provider_event_id" is not null
       and grant_row."starts_at"=entitlement."starts_at"
       and grant_row."expires_at"=entitlement."expires_at"
      join public."provider_events" provider_event
        on provider_event."id"=grant_row."provider_event_id"
       and provider_event."user_id"::text=entitlement."user_id"
       and provider_event."product_id"=grant_row."product_id"
       and provider_event."provider"=grant_row."provider"
       and provider_event."environment"=grant_row."environment"
       and provider_event."status"='processed'
       and provider_event."provider_event_id"=entitlement."metadata"->>'revenuecat_event_id'
       and provider_event."raw_payload_hash"=entitlement."metadata"->>'revenuecat_event_hash'
       and provider_event."metadata"->>'entitlement_key'='premium'
      join public."revenuecat_premium_transaction_authority" transaction_authority
        on transaction_authority."provider"=provider_event."provider"
       and transaction_authority."original_transaction_id"=provider_event."metadata"->>'original_transaction_id'
       and transaction_authority."user_id"=provider_event."user_id"
       and transaction_authority."environment"=provider_event."environment"
       and transaction_authority."current_product_id"=provider_event."product_id"
       and transaction_authority."current_provider_product_id"=provider_event."metadata"->>'provider_product_id'
       and transaction_authority."current_provider_base_plan_id" is not distinct from provider_event."metadata"->>'provider_base_plan_id'
       and transaction_authority."latest_event_id"=provider_event."provider_event_id"
       and transaction_authority."latest_event_hash"=provider_event."raw_payload_hash"
       and transaction_authority."authority_state" in ('active','retained')
      where entitlement."user_id"=p_user_id
        and entitlement."entitlement_key"='premium'
        and entitlement."source"='revenuecat'
        and entitlement."status" in ('active','trialing','grace_period')
        and entitlement."revoked_at" is null
        and entitlement."starts_at" is not null
        and entitlement."starts_at"<=timezone('utc'::text,now())
        and entitlement."expires_at" is not null
        and entitlement."expires_at">timezone('utc'::text,now())
        and entitlement."metadata"->>'environment' in ('sandbox','production')
        and coalesce(entitlement."metadata"->>'revenuecat_event_hash','') ~ '^[0-9a-f]{64}$'
        and ((entitlement."metadata"->>'environment'='sandbox' and grant_row."status"='sandbox_only')
          or (entitlement."metadata"->>'environment'='production' and grant_row."status"='active'))
        and grant_row."environment"=entitlement."metadata"->>'environment'
        and grant_row."revoked_at" is null and grant_row."refunded_at" is null
        and grant_row."starts_at"<=timezone('utc'::text,now())
        and grant_row."expires_at">timezone('utc'::text,now())
        and not exists (
          select 1
          from public."provider_events" later_authority
          join public."monetization_products" later_product
            on later_product."id"=later_authority."product_id"
           and later_product."product_type"='premium_subscription'
          where later_authority."user_id"::text=entitlement."user_id"
            and later_authority."id"<>provider_event."id"
            and (
              later_authority."status" in ('processed','refunded','reversed')
              or (later_authority."status"='ignored'
                and later_authority."metadata"->>'premium_authority_watermark'='true')
            )
            and (
              (provider_event."environment"<>'production' and later_authority."environment"='production')
              or (
                later_authority."environment"=provider_event."environment"
                and later_authority."metadata"->>'original_transaction_id'
                  is not distinct from provider_event."metadata"->>'original_transaction_id'
                and public."revenuecat_premium_authority_is_newer_internal"(
                  later_authority."occurred_at",later_authority."event_type",later_authority."provider_event_id",false,
                  provider_event."occurred_at",provider_event."event_type",provider_event."provider_event_id",false
                )
              )
            )
        )
    );
$$;
revoke all on function public."premium_subject_has_finite_authority_internal"(text) from public,anon,authenticated,service_role;

create or replace function public."record_revenuecat_premium_ignored_internal"(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_provider_product_id text,
  p_provider_base_plan_id text,
  p_environment text,
  p_occurred_at timestamptz,
  p_raw_payload_hash text,
  p_product_id uuid,
  p_reason text,
  p_authority_watermark boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text := upper(trim(coalesce(p_event_type,'')));
  v_event_id text := trim(coalesce(p_provider_event_id,''));
  v_environment text := lower(trim(coalesce(p_environment,'')));
  v_now timestamptz := timezone('utc'::text,now());
  v_idempotency_key text := v_event_type || ':' || v_event_id;
  v_product public."monetization_products"%rowtype;
  v_event public."provider_events"%rowtype;
begin
  if p_product_id is not null then
    select product.* into v_product
    from public."monetization_products" product
    where product."id"=p_product_id and product."product_type"='premium_subscription';
    if v_product."id" is null then raise exception 'premium_product_not_found'; end if;
  end if;

  select event.* into v_event
  from public."provider_events" event
  where event."provider" in ('revenuecat','revenuecat_app_store','revenuecat_google_play')
    and event."provider_event_id"=v_event_id
  order by event."created_at",event."id"
  limit 1
  for update;
  if v_event."id" is not null then
    if v_event."provider" is distinct from p_provider
      or v_event."event_type" is distinct from v_event_type
      or v_event."user_id" is distinct from p_user_id
      or v_event."product_id" is distinct from p_product_id
      or v_event."environment" is distinct from v_environment
      or v_event."raw_payload_hash" is distinct from p_raw_payload_hash
      or v_event."metadata"->>'provider_product_id' is distinct from nullif(trim(coalesce(p_provider_product_id,'')),'')
      or v_event."metadata"->>'provider_base_plan_id' is distinct from nullif(trim(coalesce(p_provider_base_plan_id,'')),'')
    then
      raise exception 'revenuecat_premium_event_id_identity_mismatch';
    end if;
    return jsonb_build_object(
      'status','ignored','reason',coalesce(v_event."metadata"->>'final_reason',p_reason),
      'eventType',v_event_type,'eventId',v_event_id,'userId',p_user_id,
      'productKey',v_product."product_key",'providerEventId',v_event."id",
      'accessGrantId',null,'ledgerEventId',null,'environment',v_environment,
      'entitlementStatus','unknown','entitlementActive',false,'grantStatus','blocked',
      'payableState','not_payable','duplicateEvent',true,
      'duplicateAccessGrant',false,'duplicateLedgerEvent',false
    );
  end if;

  insert into public."provider_events" (
    "provider_event_id","provider","product_id","product_key","user_id","app_user_id",
    "environment","event_type","status","occurred_at","idempotency_key","raw_payload_hash","metadata"
  ) values (
    v_event_id,p_provider,p_product_id,v_product."product_key",p_user_id,p_user_id::text,
    v_environment,v_event_type,'ignored',least(coalesce(p_occurred_at,v_now),v_now),
    v_idempotency_key,p_raw_payload_hash,jsonb_build_object(
      'provider_payload_stored',false,
      'provider_product_id',nullif(trim(coalesce(p_provider_product_id,'')),''),
      'provider_base_plan_id',nullif(trim(coalesce(p_provider_base_plan_id,'')),''),
      'entitlement_key','premium','final_reason',p_reason,
      'premium_authority_watermark',coalesce(p_authority_watermark,false),
      'authority_granted',false,'money_action',false,'payout_ready',false
    )
  ) returning * into v_event;
  return jsonb_build_object(
    'status','ignored','reason',p_reason,'eventType',v_event_type,'eventId',v_event_id,
    'userId',p_user_id,'productKey',v_product."product_key",'providerEventId',v_event."id",
    'accessGrantId',null,'ledgerEventId',null,'environment',v_environment,
    'entitlementStatus','unknown','entitlementActive',false,'grantStatus','blocked',
    'payableState','not_payable','duplicateEvent',false,
    'duplicateAccessGrant',false,'duplicateLedgerEvent',false
  );
end;
$$;

alter function public."process_revenuecat_premium_event_atomic"(
  text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,
  integer,text,text,text,text,text,uuid,uuid
) rename to "process_revenuecat_premium_event_atomic_pre_integrity_closeout";

create or replace function public."process_revenuecat_premium_event_atomic"(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_provider_product_id text,
  p_provider_base_plan_id text,
  p_environment text,
  p_entitlement_status text,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_occurred_at timestamptz,
  p_amount_minor integer,
  p_currency text,
  p_raw_payload_hash text,
  p_period_type text,
  p_store text,
  p_platform text,
  p_store_mapping_id uuid,
  p_product_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc'::text,now());
  v_provider text := lower(trim(coalesce(p_provider,'')));
  v_event_id text := trim(coalesce(p_provider_event_id,''));
  v_event_type text := upper(trim(coalesce(p_event_type,'')));
  v_environment text := lower(trim(coalesce(p_environment,'')));
  v_status text := lower(trim(coalesce(p_entitlement_status,'')));
  v_currency text := trim(coalesce(p_currency,''));
  v_store text := lower(trim(coalesce(p_store,'')));
  v_platform text := lower(trim(coalesce(p_platform,'')));
  v_active_authority boolean;
  v_grant_capable_event boolean;
  v_terminal_event boolean;
  v_reason text;
  v_switch text;
  v_webhook_switch text;
  v_latest public."provider_events"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_result jsonb;
begin
  if v_provider not in ('revenuecat_app_store','revenuecat_google_play')
    or v_event_id=''
    or v_event_type not in (
      'INITIAL_PURCHASE','NON_RENEWING_PURCHASE','PRODUCT_CHANGE','RENEWAL','UNCANCELLATION',
      'CANCELLATION','EXPIRATION','BILLING_ISSUE','REFUND','REVOCATION','SUBSCRIPTION_PAUSED'
    )
    or p_user_id is null or p_product_id is null
    or v_environment not in ('setup','sandbox','production')
    or coalesce(p_raw_payload_hash,'') !~ '^[0-9a-f]{64}$'
  then
    raise exception 'revenuecat_premium_event_identity_invalid';
  end if;
  if not (
    (v_provider='revenuecat_app_store' and v_store='app_store' and v_platform='ios')
    or (v_provider='revenuecat_google_play' and v_store='google_play' and v_platform='android')
  ) then
    raise exception 'revenuecat_premium_provider_store_tuple_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium-event-id:' || v_event_id,0
  ));
  if exists (
    select 1 from public."provider_events" event
    where event."provider" in ('revenuecat','revenuecat_app_store','revenuecat_google_play')
      and event."provider_event_id"=v_event_id
      and (
        event."provider" is distinct from v_provider
        or event."event_type" is distinct from v_event_type
        or event."user_id" is distinct from p_user_id
        or event."product_id" is distinct from p_product_id
        or event."environment" is distinct from v_environment
        or event."raw_payload_hash" is distinct from p_raw_payload_hash
        or event."metadata"->>'provider_product_id' is distinct from nullif(trim(coalesce(p_provider_product_id,'')),'')
        or event."metadata"->>'provider_base_plan_id' is distinct from nullif(trim(coalesce(p_provider_base_plan_id,'')),'')
      )
  ) then
    raise exception 'revenuecat_premium_event_id_identity_mismatch';
  end if;

  select product.* into v_product
  from public."monetization_products" product
  where product."id"=p_product_id and product."product_type"='premium_subscription';
  if v_product."id" is null then raise exception 'premium_product_not_found'; end if;

  v_active_authority := v_status in ('active','trialing','grace_period');
  v_grant_capable_event := v_event_type in (
    'INITIAL_PURCHASE','NON_RENEWING_PURCHASE','PRODUCT_CHANGE','RENEWAL','UNCANCELLATION'
  );
  v_terminal_event := v_event_type in (
    'CANCELLATION','BILLING_ISSUE','EXPIRATION','REFUND','REVOCATION','SUBSCRIPTION_PAUSED'
  );
  if p_occurred_at is null then v_reason := 'premium_occurred_at_required';
  elsif p_occurred_at > v_now + interval '5 minutes' then v_reason := 'premium_occurred_at_future_skew';
  elsif v_event_type in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED') and v_status<>'revoked' then
    v_reason := 'premium_terminal_status_incoherent';
  elsif v_event_type='EXPIRATION' and v_status<>'expired' then
    v_reason := 'premium_expiration_status_incoherent';
  elsif v_event_type='CANCELLATION' and v_status not in ('active','canceled') then
    v_reason := 'premium_cancellation_status_incoherent';
  elsif v_event_type='BILLING_ISSUE' and v_status not in ('grace_period','pending') then
    v_reason := 'premium_billing_status_incoherent';
  elsif v_event_type in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE','PRODUCT_CHANGE','RENEWAL','UNCANCELLATION')
    and v_status not in ('active','trialing') then
    v_reason := 'premium_active_status_incoherent';
  elsif v_active_authority and v_environment not in ('sandbox','production') then
    v_reason := 'premium_active_environment_invalid';
  elsif v_active_authority and (
    p_starts_at is null or p_starts_at > v_now + interval '5 minutes'
    or p_expires_at is null or p_expires_at <= v_now or p_expires_at <= p_starts_at
  ) then
    v_reason := 'premium_finite_period_invalid';
  elsif v_grant_capable_event and (p_amount_minor is null or p_amount_minor<=0) then
    v_reason := 'premium_positive_amount_required';
  elsif v_grant_capable_event and (
    v_currency !~ '^[a-z]{3}$'
    or p_currency is distinct from v_currency
    or public."money_currency_minor_unit_exponent_internal"(v_currency) is null
  ) then
    v_reason := 'premium_currency_invalid';
  end if;

  if v_reason is null and v_event_type<>'INITIAL_PURCHASE' and not exists (
    select 1
    from public."provider_events" prior
    where prior."user_id"=p_user_id and prior."product_id"=p_product_id
      and prior."provider" in (v_provider,'revenuecat') and prior."environment"=v_environment
      and prior."provider_event_id"<>v_event_id
      and prior."status" in ('processed','refunded','reversed')
      and prior."metadata"->>'provider_product_id'=p_provider_product_id
      and prior."metadata"->>'provider_base_plan_id' is not distinct from nullif(trim(coalesce(p_provider_base_plan_id,'')),'')
  ) and not (
    v_event_type='PRODUCT_CHANGE'
    and public."premium_subject_has_finite_authority_internal"(p_user_id::text)
    and exists (
      select 1
      from public."provider_events" prior
      join public."monetization_products" prior_product
        on prior_product."id"=prior."product_id" and prior_product."product_type"='premium_subscription'
      join public."user_entitlements" entitlement
        on entitlement."user_id"=p_user_id::text and entitlement."entitlement_key"='premium'
       and entitlement."metadata"->>'revenuecat_event_id'=prior."provider_event_id"
      where prior."user_id"=p_user_id and prior."provider" in (v_provider,'revenuecat')
        and prior."environment"=v_environment and prior."status"='processed'
    )
  ) then
    v_reason := 'premium_prior_purchase_authority_missing';
  end if;
  if v_reason is null and v_active_authority
    and v_event_type in ('CANCELLATION','BILLING_ISSUE')
    and not exists (
      select 1 from public."user_entitlements" entitlement
      where entitlement."user_id"=p_user_id::text and entitlement."entitlement_key"='premium'
        and entitlement."starts_at"=p_starts_at and entitlement."expires_at"=p_expires_at
        and public."premium_subject_has_finite_authority_internal"(p_user_id::text)
    )
  then
    v_reason := 'premium_retain_only_period_binding_missing';
  end if;

  if v_reason is null and v_grant_capable_event
    and public."is_account_access_restricted"(p_user_id::text)
  then
    v_reason := 'premium_buyer_account_restricted';
  end if;

  if v_reason is null and v_grant_capable_event then
    if nullif(trim(coalesce(p_provider_product_id,'')),'') is null then
      v_reason := 'premium_provider_product_id_required';
    elsif v_provider='revenuecat_app_store' and not exists (
      select 1 from public."monetization_product_store_mappings" mapping
      where mapping."id"=p_store_mapping_id and mapping."product_id"=p_product_id
        and mapping."concept"='premium' and mapping."platform"='ios' and mapping."store"='app_store'
        and mapping."provider"=v_provider and mapping."provider_product_id"=p_provider_product_id
        and mapping."provider_base_plan_id" is not distinct from nullif(trim(coalesce(p_provider_base_plan_id,'')),'')
        and mapping."environment"=v_environment
        and mapping."status"=case when v_environment='production' then 'active' else 'sandbox' end
        and mapping."store_product_type"='auto_renewable_subscription'
        and mapping."unlocks_digital_access" and not mapping."grants_livekit_authority"
        and not mapping."creates_payable_balance"
    ) then
      v_reason := 'premium_app_store_mapping_not_active';
    elsif v_provider='revenuecat_google_play' and not (
      v_product."provider" in ('revenuecat_google_play','google_play','revenuecat')
      and v_product."provider_product_id"=p_provider_product_id
      and v_product."provider_base_plan_id" is not distinct from nullif(trim(coalesce(p_provider_base_plan_id,'')),'')
      and v_product."environment"=v_environment
      and v_product."status"=case when v_environment='production' then 'active' else 'sandbox' end
    ) then
      v_reason := 'premium_google_product_not_active';
    end if;
    select "state" into v_switch from public."platform_money_kill_switches"
    where "key"=case when v_provider='revenuecat_app_store' then 'revenuecat_app_store_enabled' else 'revenuecat_google_play_enabled' end;
    select "state" into v_webhook_switch from public."platform_money_kill_switches" where "key"='provider_webhooks_enabled';
    if v_reason is null and (
      (v_environment='sandbox' and (coalesce(v_switch,'off') not in ('sandbox_only','on') or coalesce(v_webhook_switch,'off') not in ('sandbox_only','on')))
      or (v_environment='production' and (coalesce(v_switch,'off')<>'on' or coalesce(v_webhook_switch,'off')<>'on'))
    ) then
      v_reason := 'premium_provider_rail_disabled';
    end if;
  end if;

  if v_reason is null and v_grant_capable_event and v_environment<>'production' and (
    exists (
      select 1 from public."provider_events" event
      join public."monetization_products" product on product."id"=event."product_id" and product."product_type"='premium_subscription'
      where event."user_id"=p_user_id and event."environment"='production'
        and event."status" in ('processed','refunded','reversed')
    ) or exists (
      select 1 from public."user_entitlements" entitlement
      where entitlement."user_id"=p_user_id::text and entitlement."entitlement_key"='premium'
        and entitlement."source"='revenuecat' and entitlement."metadata"->>'environment'='production'
    )
  ) then
    v_reason := 'premium_lower_environment_cannot_override_production';
  end if;

  select event.* into v_latest
  from public."provider_events" event
  join public."monetization_products" product on product."id"=event."product_id" and product."product_type"='premium_subscription'
  where event."user_id"=p_user_id and event."environment"=v_environment
    and (
      event."status" in ('processed','refunded','reversed')
      or (event."status"='ignored' and event."metadata"->>'premium_authority_watermark'='true')
    )
  order by event."occurred_at" desc,
    public."revenuecat_premium_authority_rank_internal"(event."event_type",false) desc,
    event."provider_event_id" collate "C" desc
  limit 1;
  if v_reason is null and v_latest."id" is not null and public."revenuecat_premium_authority_is_newer_internal"(
    v_latest."occurred_at",v_latest."event_type",v_latest."provider_event_id",false,
    p_occurred_at,v_event_type,v_event_id,false
  ) then
    v_reason := 'premium_provider_authority_event_stale';
  end if;
  if v_reason is null and v_grant_capable_event
    and v_latest."event_type" in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED')
    and v_event_type<>'INITIAL_PURCHASE'
  then
    v_reason := 'premium_terminal_requires_fresh_initial';
  end if;

  -- Access-removing events require exact durable subject/product/provider
  -- provenance, but never depend on current activation switches.
  if v_reason is null and v_terminal_event
    and not exists (
      select 1 from public."provider_events" prior
      where prior."user_id"=p_user_id and prior."product_id"=p_product_id
        and prior."provider" in (v_provider,'revenuecat') and prior."environment"=v_environment
        and prior."status" in ('processed','refunded','reversed')
        and prior."metadata"->>'provider_product_id'=p_provider_product_id
        and prior."metadata"->>'provider_base_plan_id' is not distinct from nullif(trim(coalesce(p_provider_base_plan_id,'')),'')
    )
  then
    v_reason := 'premium_terminal_binding_missing';
  end if;

  if v_reason is not null then
    return public."record_revenuecat_premium_ignored_internal"(
      v_provider,v_event_id,v_event_type,p_user_id,p_provider_product_id,p_provider_base_plan_id,v_environment,
      p_occurred_at,p_raw_payload_hash,p_product_id,v_reason,
      v_event_type in ('CANCELLATION','BILLING_ISSUE','EXPIRATION','REFUND','REVOCATION','SUBSCRIPTION_PAUSED')
    );
  end if;
  v_result:=public."process_revenuecat_premium_event_atomic_pre_integrity_closeout"(
    v_provider,v_event_id,v_event_type,p_user_id,p_provider_product_id,p_provider_base_plan_id,
    v_environment,v_status,p_starts_at,p_expires_at,p_occurred_at,p_amount_minor,p_currency,
    p_raw_payload_hash,p_period_type,p_store,p_platform,p_store_mapping_id,p_product_id
  );
  if v_event_type='PRODUCT_CHANGE' and coalesce(v_result->>'status','')<>'ignored' then
    update public."access_grants" grant_row
    set "status"='blocked',"revoked_at"=coalesce(grant_row."revoked_at",p_occurred_at),
        "revoke_reason"=coalesce(grant_row."revoke_reason",'Superseded by exact Premium product change.'),
        "updated_at"=v_now,
        "metadata"=coalesce(grant_row."metadata",'{}'::jsonb)||jsonb_build_object(
          'superseded_by_product_id',p_product_id,'superseded_by_event_id',v_event_id,'authority_granted',false
        )
    where grant_row."user_id"=p_user_id and grant_row."grant_type"='premium'
      and grant_row."product_id" is distinct from p_product_id
      and grant_row."status" in ('active','sandbox_only');
  end if;
  return v_result;
end;
$$;
revoke all on function public."record_revenuecat_premium_ignored_internal"(
  text,text,text,uuid,text,text,text,timestamptz,text,uuid,text,boolean
) from public,anon,authenticated,service_role;
revoke all on function public."process_revenuecat_premium_event_atomic_pre_integrity_closeout"(
  text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,
  integer,text,text,text,text,text,uuid,uuid
) from public,anon,authenticated,service_role;
revoke all on function public."process_revenuecat_premium_event_atomic"(
  text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,
  integer,text,text,text,text,text,uuid,uuid
) from public,anon,authenticated;
grant execute on function public."process_revenuecat_premium_event_atomic"(
  text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,
  integer,text,text,text,text,text,uuid,uuid
) to service_role;
comment on function public."process_revenuecat_premium_event_atomic"(
  text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,
  integer,text,text,text,text,text,uuid,uuid
) is 'Service-only exact Premium authority wrapper: finite periods, exact store/catalog/switch proof, cross-environment precedence, sticky financial terminal ordering, and immutable event identity are enforced before the deployed atomic projector.';

create or replace function public."process_revenuecat_premium_event_atomic"(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_provider_product_id text,
  p_provider_base_plan_id text,
  p_environment text,
  p_entitlement_status text,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_occurred_at timestamptz,
  p_amount_minor integer,
  p_currency text,
  p_raw_payload_hash text,
  p_period_type text,
  p_store text,
  p_platform text,
  p_store_mapping_id uuid,
  p_product_id uuid,
  p_original_transaction_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc'::text,now());
  v_provider text := lower(trim(coalesce(p_provider,'')));
  v_event_id text := trim(coalesce(p_provider_event_id,''));
  v_event_type text := upper(trim(coalesce(p_event_type,'')));
  v_environment text := lower(trim(coalesce(p_environment,'')));
  v_original_transaction_id text := trim(coalesce(p_original_transaction_id,''));
  v_provider_product_id text := trim(coalesce(p_provider_product_id,''));
  v_provider_base_plan_id text := nullif(trim(coalesce(p_provider_base_plan_id,'')),'');
  v_effective_product_id uuid := p_product_id;
  v_effective_provider_product_id text := trim(coalesce(p_provider_product_id,''));
  v_effective_provider_base_plan_id text := nullif(trim(coalesce(p_provider_base_plan_id,'')),'');
  v_effective_store_mapping_id uuid := p_store_mapping_id;
  v_reported_product_mismatch boolean := false;
  v_effective_occurred_at timestamptz := least(coalesce(p_occurred_at,v_now),v_now);
  v_binding public."revenuecat_premium_transaction_authority"%rowtype;
  v_existing_event public."provider_events"%rowtype;
  v_result jsonb;
  v_force_reason text;
  v_current_original_transaction_id text;
  v_original_valid boolean := v_original_transaction_id<>''
    and length(v_original_transaction_id)<=512
    and v_original_transaction_id=coalesce(p_original_transaction_id,'')
    and v_original_transaction_id !~ '[[:cntrl:]]';
  v_new_binding boolean := false;
  v_candidate_newer boolean := false;
  v_terminal_event boolean := v_event_type in (
    'CANCELLATION','BILLING_ISSUE','EXPIRATION','REFUND','REVOCATION','SUBSCRIPTION_PAUSED'
  );
  v_force_watermark boolean := v_terminal_event;
begin
  if v_provider not in ('revenuecat_app_store','revenuecat_google_play')
    or v_event_id='' or p_user_id is null
    or v_environment not in ('sandbox','production')
    or v_event_type not in (
      'INITIAL_PURCHASE','NON_RENEWING_PURCHASE','PRODUCT_CHANGE','RENEWAL','UNCANCELLATION',
      'CANCELLATION','EXPIRATION','BILLING_ISSUE','REFUND','REVOCATION','SUBSCRIPTION_PAUSED'
    )
    or not (
      (v_provider='revenuecat_app_store' and lower(trim(coalesce(p_store,'')))='app_store'
        and lower(trim(coalesce(p_platform,'')))='ios')
      or (v_provider='revenuecat_google_play' and lower(trim(coalesce(p_store,'')))='google_play'
        and lower(trim(coalesce(p_platform,'')))='android')
    )
    or coalesce(p_raw_payload_hash,'') !~ '^[0-9a-f]{64}$'
  then
    raise exception 'revenuecat_premium_transaction_identity_invalid';
  end if;
  if p_product_id is not null and not exists (
    select 1 from public."monetization_products" product
    where product."id"=p_product_id and product."product_type"='premium_subscription'
  ) then
    raise exception 'premium_product_not_found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium-event-id:'||v_event_id,0
  ));
  select event.* into v_existing_event
  from public."provider_events" event
  where event."provider" in ('revenuecat','revenuecat_app_store','revenuecat_google_play')
    and event."provider_event_id"=v_event_id
  order by event."created_at",event."id"
  limit 1
  for update;
  if not v_original_valid then
    if v_existing_event."id" is not null
      and v_existing_event."metadata"->>'original_transaction_id' is not null
    then
      raise exception 'revenuecat_premium_event_original_transaction_mismatch';
    end if;
    v_result:=public."record_revenuecat_premium_ignored_internal"(
      v_provider,v_event_id,v_event_type,p_user_id,v_provider_product_id,v_provider_base_plan_id,
      v_environment,p_occurred_at,p_raw_payload_hash,p_product_id,
      'premium_original_transaction_id_required',v_terminal_event
    );
    return v_result||jsonb_build_object('originalTransactionId',null,'transactionBindingId',null);
  end if;
  if v_terminal_event then
    return public."process_revenuecat_terminal_event_atomic"(
      v_provider,v_event_id,v_event_type,p_user_id,p_provider_product_id,p_provider_base_plan_id,
      v_environment,p_entitlement_status,p_starts_at,p_expires_at,p_occurred_at,
      p_raw_payload_hash,p_period_type,p_store,p_platform,v_original_transaction_id
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-original:'||v_provider||':'||v_original_transaction_id,0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium-original:'||v_provider||':'||v_original_transaction_id,0
  ));
  -- Original transaction identity is global across the two RevenueCat product
  -- domains. A consumable reservation/binding (or an access-removing delivery
  -- received before either domain could bind) permanently prevents the same
  -- store transaction from being rebound as Premium under a new event id.
  if v_event_type in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE') and (
    exists (
      select 1
      from public."revenuecat_consumable_transaction_intents" creator_binding
      where creator_binding."provider"=v_provider
        and creator_binding."original_transaction_id"=v_original_transaction_id
    )
    or exists (
      select 1
      from public."revenuecat_unbound_initial_authority" creator_reservation
      where creator_reservation."provider"=v_provider
        and creator_reservation."original_transaction_id"=v_original_transaction_id
    )
    or exists (
      select 1
      from public."revenuecat_unbound_terminal_authority" terminal_reservation
      where terminal_reservation."provider"=v_provider
        and terminal_reservation."original_transaction_id"=v_original_transaction_id
    )
  ) then
    v_result:=public."record_revenuecat_premium_ignored_internal"(
      v_provider,v_event_id,v_event_type,p_user_id,v_provider_product_id,v_provider_base_plan_id,
      v_environment,p_occurred_at,p_raw_payload_hash,p_product_id,
      'revenuecat_original_transaction_cross_domain_reserved',false
    );
    update public."provider_events" event
    set "metadata"=coalesce(event."metadata",'{}'::jsonb)||jsonb_build_object(
      'original_transaction_id',v_original_transaction_id,
      'cross_domain_original_transaction_reserved',true
    )
    where event."provider" in ('revenuecat','revenuecat_app_store','revenuecat_google_play')
      and event."provider_event_id"=v_event_id;
    return v_result||jsonb_build_object(
      'originalTransactionId',v_original_transaction_id,'transactionBindingId',null
    );
  end if;
  if v_provider_product_id='' or length(v_provider_product_id)>512 then
    insert into public."revenuecat_premium_transaction_authority" (
      "provider","original_transaction_id","user_id","environment",
      "current_product_id","current_provider_product_id","current_provider_base_plan_id",
      "first_event_id","first_event_hash","latest_event_id","latest_event_hash",
      "latest_event_type","latest_occurred_at","latest_event_rank","authority_state"
    ) values (
      v_provider,v_original_transaction_id,p_user_id,v_environment,p_product_id,'<missing>',null,
      v_event_id,p_raw_payload_hash,v_event_id,p_raw_payload_hash,v_event_type,
      v_effective_occurred_at,public."revenuecat_premium_authority_rank_internal"(v_event_type,false),'blocked'
    ) on conflict ("provider","original_transaction_id") do nothing;
    if exists (
      select 1 from public."revenuecat_premium_transaction_authority" transaction_authority
      where transaction_authority."provider"=v_provider
        and transaction_authority."original_transaction_id"=v_original_transaction_id
        and (transaction_authority."user_id"<>p_user_id or transaction_authority."environment"<>v_environment)
    ) then raise exception 'revenuecat_premium_original_transaction_subject_mismatch'; end if;
    v_result:=public."record_revenuecat_premium_ignored_internal"(
      v_provider,v_event_id,v_event_type,p_user_id,v_provider_product_id,v_provider_base_plan_id,
      v_environment,p_occurred_at,p_raw_payload_hash,p_product_id,
      'premium_provider_product_id_required',v_terminal_event
    );
    select transaction_authority.* into v_binding
    from public."revenuecat_premium_transaction_authority" transaction_authority
    where transaction_authority."provider"=v_provider
      and transaction_authority."original_transaction_id"=v_original_transaction_id;
    update public."provider_events" event
    set "metadata"=coalesce(event."metadata",'{}'::jsonb)||jsonb_build_object(
      'original_transaction_id',v_original_transaction_id,
      'premium_transaction_binding_id',v_binding."id"
    )
    where event."provider" in ('revenuecat','revenuecat_app_store','revenuecat_google_play')
      and event."provider_event_id"=v_event_id;
    return v_result||jsonb_build_object(
      'originalTransactionId',v_original_transaction_id,'transactionBindingId',v_binding."id"
    );
  end if;
  if v_existing_event."id" is not null
    and v_existing_event."metadata"->>'original_transaction_id' is distinct from v_original_transaction_id
  then
    raise exception 'revenuecat_premium_event_original_transaction_mismatch';
  end if;

  select transaction_authority.* into v_binding
  from public."revenuecat_premium_transaction_authority" transaction_authority
  where transaction_authority."provider"=v_provider
    and transaction_authority."original_transaction_id"=v_original_transaction_id
  for update;
  if p_product_id is null then
    -- A signed event can carry exact immutable store identity while the local
    -- catalog resolution is missing or ambiguous. Consume both its global
    -- RevenueCat event id and original transaction before returning. A later
    -- catalog mutation must never turn the same delivery into authority.
    v_new_binding:=v_binding."id" is null;
    if v_new_binding then
      insert into public."revenuecat_premium_transaction_authority" (
        "provider","original_transaction_id","user_id","environment",
        "current_product_id","current_provider_product_id","current_provider_base_plan_id",
        "first_event_id","first_event_hash","latest_event_id","latest_event_hash",
        "latest_event_type","latest_occurred_at","latest_event_rank","authority_state"
      ) values (
        v_provider,v_original_transaction_id,p_user_id,v_environment,
        null,v_provider_product_id,v_provider_base_plan_id,
        v_event_id,p_raw_payload_hash,v_event_id,p_raw_payload_hash,
        v_event_type,v_effective_occurred_at,
        public."revenuecat_premium_authority_rank_internal"(v_event_type,false),'blocked'
      ) returning * into v_binding;
    elsif v_binding."user_id"<>p_user_id or v_binding."environment"<>v_environment then
      raise exception 'revenuecat_premium_original_transaction_subject_mismatch';
    end if;
    v_candidate_newer:=v_new_binding or (
      v_effective_occurred_at,
      public."revenuecat_premium_authority_rank_internal"(v_event_type,false),
      v_event_id collate "C"
    )>(
      v_binding."latest_occurred_at",v_binding."latest_event_rank",
      v_binding."latest_event_id" collate "C"
    );
    v_result:=public."record_revenuecat_premium_ignored_internal"(
      v_provider,v_event_id,v_event_type,p_user_id,v_provider_product_id,v_provider_base_plan_id,
      v_environment,p_occurred_at,p_raw_payload_hash,null,
      'premium_store_product_resolution_missing_or_ambiguous',v_terminal_event
    );
    update public."provider_events" event
    set "metadata"=coalesce(event."metadata",'{}'::jsonb)||jsonb_build_object(
      'original_transaction_id',v_original_transaction_id,
      'premium_transaction_binding_id',v_binding."id",
      'reported_product_id',null,
      'reported_provider_product_id',v_provider_product_id,
      'reported_provider_base_plan_id',v_provider_base_plan_id,
      'store',lower(trim(coalesce(p_store,''))),
      'platform',lower(trim(coalesce(p_platform,'')))
    )
    where event."provider" in ('revenuecat','revenuecat_app_store','revenuecat_google_play')
      and event."provider_event_id"=v_event_id;
    if not found then raise exception 'revenuecat_premium_event_finalization_missing'; end if;
    if v_candidate_newer and not v_new_binding then
      update public."revenuecat_premium_transaction_authority" transaction_authority
      set "latest_event_id"=v_event_id,"latest_event_hash"=p_raw_payload_hash,
          "latest_event_type"=v_event_type,"latest_occurred_at"=v_effective_occurred_at,
          "latest_event_rank"=public."revenuecat_premium_authority_rank_internal"(v_event_type,false),
          "authority_state"=case when transaction_authority."authority_state"='financial_terminal'
            then 'financial_terminal' else 'blocked' end,
          "updated_at"=v_now
      where transaction_authority."id"=v_binding."id";
    end if;
    return v_result||jsonb_build_object(
      'originalTransactionId',v_original_transaction_id,'transactionBindingId',v_binding."id"
    );
  end if;
  if v_binding."id" is null then
    v_new_binding:=true;
    if v_event_type<>'INITIAL_PURCHASE' then
      v_force_reason:='premium_original_transaction_binding_missing';
    end if;
    insert into public."revenuecat_premium_transaction_authority" (
      "provider","original_transaction_id","user_id","environment",
      "current_product_id","current_provider_product_id","current_provider_base_plan_id",
      "first_event_id","first_event_hash","latest_event_id","latest_event_hash",
      "latest_event_type","latest_occurred_at","latest_event_rank","authority_state"
    ) values (
      v_provider,v_original_transaction_id,p_user_id,v_environment,
      p_product_id,v_provider_product_id,v_provider_base_plan_id,
      v_event_id,p_raw_payload_hash,v_event_id,p_raw_payload_hash,
      v_event_type,v_effective_occurred_at,
      public."revenuecat_premium_authority_rank_internal"(v_event_type,false),
      case when v_event_type in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED','EXPIRATION')
        then 'financial_terminal' when v_event_type='INITIAL_PURCHASE' then 'pending' else 'blocked' end
    ) returning * into v_binding;
  else
    if v_binding."user_id"<>p_user_id or v_binding."environment"<>v_environment then
      raise exception 'revenuecat_premium_original_transaction_subject_mismatch';
    end if;
    if v_event_type='PRODUCT_CHANGE' then
      if v_binding."authority_state" not in ('active','retained')
        or (
          v_binding."current_product_id"=p_product_id
          and v_binding."current_provider_product_id"=v_provider_product_id
          and v_binding."current_provider_base_plan_id" is not distinct from v_provider_base_plan_id
        )
      then
        v_force_reason:='premium_product_change_transaction_state_invalid';
      end if;
    elsif v_binding."current_product_id"<>p_product_id
      or v_binding."current_provider_product_id"<>v_provider_product_id
      or v_binding."current_provider_base_plan_id" is distinct from v_provider_base_plan_id
    then
      if v_terminal_event then
        -- A terminal webhook can report the pre-change SKU.  Exact original
        -- transaction + provider + subject + environment is authoritative for
        -- removal, so revoke the currently bound canonical product rather than
        -- strand access behind stale catalog identity.
        v_reported_product_mismatch:=true;
        v_effective_product_id:=v_binding."current_product_id";
        v_effective_provider_product_id:=v_binding."current_provider_product_id";
        v_effective_provider_base_plan_id:=v_binding."current_provider_base_plan_id";
        if v_provider='revenuecat_app_store' then
          select mapping."id" into v_effective_store_mapping_id
          from public."monetization_product_store_mappings" mapping
          where mapping."product_id"=v_binding."current_product_id"
            and mapping."provider"=v_provider and mapping."platform"='ios' and mapping."store"='app_store'
            and mapping."provider_product_id"=v_binding."current_provider_product_id"
            and mapping."provider_base_plan_id" is not distinct from v_binding."current_provider_base_plan_id"
            and mapping."environment"=v_environment
          order by mapping."created_at",mapping."id"
          limit 1;
          if v_effective_store_mapping_id is null then
            raise exception 'revenuecat_premium_bound_terminal_mapping_missing';
          end if;
        else
          v_effective_store_mapping_id:=null;
        end if;
      else
        raise exception 'revenuecat_premium_original_transaction_product_mismatch';
      end if;
    end if;
    if v_event_type='INITIAL_PURCHASE' and v_binding."first_event_id"<>v_event_id then
      v_force_reason:='premium_original_transaction_initial_replay';
    elsif v_binding."authority_state" in ('financial_terminal','blocked') then
      v_force_reason:='premium_original_transaction_terminal_or_blocked';
    end if;
  end if;

  select event."metadata"->>'original_transaction_id' into v_current_original_transaction_id
  from public."user_entitlements" entitlement
  join public."provider_events" event
    on event."provider_event_id"=entitlement."metadata"->>'revenuecat_event_id'
   and event."raw_payload_hash"=entitlement."metadata"->>'revenuecat_event_hash'
  where entitlement."user_id"=p_user_id::text and entitlement."entitlement_key"='premium'
    and entitlement."source"='revenuecat'
  limit 1;
  if v_current_original_transaction_id is not null
    and v_current_original_transaction_id<>v_original_transaction_id
    and v_event_type<>'INITIAL_PURCHASE'
  then
    v_force_reason:='premium_original_transaction_not_current';
    -- Retain the old transaction terminal for audit/replay closure, but it is
    -- not a watermark over the user's newer independent store transaction.
    v_force_watermark:=false;
  end if;

  v_candidate_newer:=v_new_binding or (
    v_effective_occurred_at,
    public."revenuecat_premium_authority_rank_internal"(v_event_type,false),
    v_event_id collate "C"
  )>(
    v_binding."latest_occurred_at",v_binding."latest_event_rank",
    v_binding."latest_event_id" collate "C"
  );
  if v_force_reason is null
    and v_event_type in (
      'INITIAL_PURCHASE','NON_RENEWING_PURCHASE','PRODUCT_CHANGE','RENEWAL','UNCANCELLATION'
    )
    and public."revenuecat_authority_quarantined_internal"(
      v_provider,p_user_id,v_environment
    )
  then
    v_force_reason:='revenuecat_terminal_authority_quarantined';
  end if;
  if v_force_reason is null
    and v_event_type in (
      'INITIAL_PURCHASE','NON_RENEWING_PURCHASE','PRODUCT_CHANGE','RENEWAL','UNCANCELLATION'
    )
    and public."is_account_access_restricted"(p_user_id::text)
  then
    v_force_reason:='premium_buyer_account_restricted';
  end if;
  if v_force_reason is not null then
    v_result:=public."record_revenuecat_premium_ignored_internal"(
      v_provider,v_event_id,v_event_type,p_user_id,v_effective_provider_product_id,v_effective_provider_base_plan_id,
      v_environment,p_occurred_at,p_raw_payload_hash,v_effective_product_id,v_force_reason,v_force_watermark
    );
  else
    v_result:=public."process_revenuecat_premium_event_atomic"(
      v_provider,v_event_id,v_event_type,p_user_id,v_effective_provider_product_id,v_effective_provider_base_plan_id,
      v_environment,p_entitlement_status,p_starts_at,p_expires_at,p_occurred_at,p_amount_minor,
      p_currency,p_raw_payload_hash,p_period_type,p_store,p_platform,v_effective_store_mapping_id,v_effective_product_id
    );
  end if;

  update public."provider_events" event
  set "metadata"=coalesce(event."metadata",'{}'::jsonb)||jsonb_build_object(
    'original_transaction_id',v_original_transaction_id,
    'premium_transaction_binding_id',v_binding."id",
    'reported_product_mismatch',v_reported_product_mismatch,
    'reported_product_id',p_product_id,
    'reported_provider_product_id',nullif(v_provider_product_id,''),
    'reported_provider_base_plan_id',v_provider_base_plan_id
  )
  where event."provider" in ('revenuecat','revenuecat_app_store','revenuecat_google_play')
    and event."provider_event_id"=v_event_id;
  if not found then raise exception 'revenuecat_premium_event_finalization_missing'; end if;

  if v_candidate_newer then
    update public."revenuecat_premium_transaction_authority" transaction_authority
    set "current_product_id"=case
          when v_event_type='PRODUCT_CHANGE' and coalesce(v_result->>'status','')<>'ignored'
            then p_product_id else transaction_authority."current_product_id" end,
        "current_provider_product_id"=case
          when v_event_type='PRODUCT_CHANGE' and coalesce(v_result->>'status','')<>'ignored'
            then v_provider_product_id else transaction_authority."current_provider_product_id" end,
        "current_provider_base_plan_id"=case
          when v_event_type='PRODUCT_CHANGE' and coalesce(v_result->>'status','')<>'ignored'
            then v_provider_base_plan_id else transaction_authority."current_provider_base_plan_id" end,
        "latest_event_id"=v_event_id,"latest_event_hash"=p_raw_payload_hash,
        "latest_event_type"=v_event_type,"latest_occurred_at"=v_effective_occurred_at,
        "latest_event_rank"=public."revenuecat_premium_authority_rank_internal"(v_event_type,false),
        "authority_state"=case
          when v_force_reason is not null and transaction_authority."authority_state"='financial_terminal'
            then 'financial_terminal'
          when v_event_type in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED') then 'financial_terminal'
          when v_event_type='EXPIRATION' then 'expired'
          when v_event_type in ('CANCELLATION','BILLING_ISSUE') then 'retained'
          when coalesce(v_result->>'status','')='ignored' then 'blocked'
          else 'active' end,
        "updated_at"=v_now
    where transaction_authority."id"=v_binding."id";
  end if;
  if v_event_type='INITIAL_PURCHASE' and coalesce(v_result->>'status','')<>'ignored' then
    update public."revenuecat_premium_transaction_authority" transaction_authority
    set "authority_state"='expired',"updated_at"=v_now
    where transaction_authority."provider"=v_provider
      and transaction_authority."user_id"=p_user_id
      and transaction_authority."environment"=v_environment
      and transaction_authority."id"<>v_binding."id"
      and transaction_authority."authority_state" in ('active','retained');
  end if;
  return v_result||jsonb_build_object(
    'originalTransactionId',v_original_transaction_id,'transactionBindingId',v_binding."id"
  );
end;
$$;
-- The historical 19-argument signature remains present for non-runtime fixture
-- compatibility, but no service principal may bypass original-transaction
-- provenance through it.  The 20-argument overload is the sole service API.
revoke all on function public."process_revenuecat_premium_event_atomic"(
  text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,
  integer,text,text,text,text,text,uuid,uuid
) from public,anon,authenticated,service_role;
revoke all on function public."process_revenuecat_premium_event_atomic"(
  text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,
  integer,text,text,text,text,text,uuid,uuid,text
) from public,anon,authenticated,service_role;
grant execute on function public."process_revenuecat_premium_event_atomic"(
  text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,
  integer,text,text,text,text,text,uuid,uuid,text
) to service_role;
comment on function public."process_revenuecat_premium_event_atomic"(
  text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,
  integer,text,text,text,text,text,uuid,uuid,text
) is 'Sole service-callable Premium projector. It durably binds exact provider original transaction, subject, environment, current canonical product/base plan, event hash/order, and sticky terminal state before granting finite authority.';

-- TRANSFER is a retain/move lifecycle action, never an activation bypass.  The
-- deployed reconciler already proves the exact finite source authority and
-- serializes source/target ordering.  This successor additionally consumes the
-- immutable transfer identity while either RevenueCat rail is disabled so the
-- same signed event cannot be replayed after a later switch transition.
alter function public."process_revenuecat_premium_transfer_atomic"(
  text,uuid,uuid,text,timestamptz,text
) rename to "process_premium_transfer_pre_closeout";

create or replace function public."process_revenuecat_premium_transfer_atomic"(
  p_provider_event_id text,
  p_source_user_id uuid,
  p_target_user_id uuid,
  p_environment text,
  p_occurred_at timestamptz,
  p_raw_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id text := trim(coalesce(p_provider_event_id,''));
  v_environment text := lower(trim(coalesce(p_environment,'')));
  v_now timestamptz := timezone('utc'::text,now());
  v_effective_occurred_at timestamptz := least(coalesce(p_occurred_at,v_now),v_now);
  v_time_valid boolean := p_occurred_at is not null and p_occurred_at<=v_now+interval '5 minutes';
  v_app_store_switch text := 'off';
  v_webhook_switch text := 'off';
  v_identity public."provider_events"%rowtype;
  v_transaction_authority public."revenuecat_premium_transaction_authority"%rowtype;
  v_product_id uuid;
  v_product_key text;
  v_result jsonb;
  v_applied boolean;
  v_transaction_candidate_count integer := 0;
begin
  if v_event_id='' or p_source_user_id is null or p_target_user_id is null
    or p_source_user_id=p_target_user_id or v_environment<>'sandbox'
    or coalesce(p_raw_payload_hash,'') !~ '^[0-9a-f]{64}$'
  then
    raise exception 'revenuecat_premium_transfer_identity_invalid';
  end if;
  if not exists (select 1 from auth."users" u where u."id"=p_source_user_id)
    or not exists (select 1 from auth."users" u where u."id"=p_target_user_id)
  then
    raise exception 'revenuecat_premium_transfer_user_missing';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium-event-id:'||v_event_id,0
  ));
  select event.* into v_identity
  from public."provider_events" event
  where event."provider" in ('revenuecat','revenuecat_app_store','revenuecat_google_play')
    and event."provider_event_id"=v_event_id
  order by event."created_at",event."id"
  limit 1
  for update;
  if v_identity."id" is not null then
    if exists (
      select 1 from public."provider_events" other
      where other."provider" in ('revenuecat','revenuecat_app_store','revenuecat_google_play')
        and other."provider_event_id"=v_event_id and other."id"<>v_identity."id"
    ) or v_identity."provider"<>'revenuecat_app_store'
      or v_identity."event_type"<>'TRANSFER'
      or v_identity."environment"<>v_environment
      or v_identity."raw_payload_hash" is distinct from p_raw_payload_hash
      or v_identity."metadata"->>'source_user_id' is distinct from p_source_user_id::text
      or v_identity."metadata"->>'target_user_id' is distinct from p_target_user_id::text
      or (p_occurred_at is null
        and v_identity."metadata"->>'reported_occurred_at' is not null)
      or (p_occurred_at is not null
        and (
          v_identity."metadata"->>'reported_occurred_at' is null
          or (v_identity."metadata"->>'reported_occurred_at')::timestamptz
            is distinct from p_occurred_at
        ))
    then
      raise exception 'revenuecat_premium_transfer_event_id_identity_mismatch';
    end if;
    v_applied := v_identity."metadata"->>'transfer_applied'='true';
    if v_applied and not exists (
      select 1 from public."revenuecat_premium_transaction_authority" transaction_authority
      where transaction_authority."id"::text=v_identity."metadata"->>'premium_transaction_binding_id'
        and transaction_authority."provider"='revenuecat_app_store'
        and transaction_authority."original_transaction_id"=v_identity."metadata"->>'original_transaction_id'
        and transaction_authority."user_id"=p_target_user_id
        and transaction_authority."environment"='sandbox'
        and transaction_authority."authority_state"='active'
    ) then
      raise exception 'revenuecat_premium_transfer_projection_mismatch';
    end if;
    return jsonb_build_object(
      'status',case when v_applied then 'duplicate_ignored' else 'ignored' end,
      'reason',v_identity."metadata"->>'final_reason',
      'duplicateEvent',true,'sourceRevoked',v_applied,'targetActive',v_applied,
      'environment','sandbox','liveMoneyAction',false
    );
  end if;

  if not v_time_valid then
    insert into public."provider_events" (
      "provider_event_id","provider","product_id","product_key","user_id","app_user_id",
      "environment","event_type","status","occurred_at","idempotency_key","raw_payload_hash","metadata"
    ) values (
      v_event_id,'revenuecat_app_store',null,null,p_target_user_id,p_target_user_id::text,
      'sandbox','TRANSFER','ignored',v_effective_occurred_at,'TRANSFER:'||v_event_id,p_raw_payload_hash,
      jsonb_build_object(
        'source_user_id',p_source_user_id,'target_user_id',p_target_user_id,
        'reported_occurred_at',p_occurred_at,'transfer_time_valid',false,
        'transfer_applied',false,'final_reason','premium_transfer_occurred_at_invalid',
        'premium_authority_watermark',false,'authority_granted',false,
        'provider_payload_stored',false,'money_action',false
      )
    );
    return jsonb_build_object(
      'status','ignored','reason','premium_transfer_occurred_at_invalid','duplicateEvent',false,
      'sourceRevoked',false,'targetActive',false,'environment','sandbox','liveMoneyAction',false
    );
  end if;

  select count(*)::integer into v_transaction_candidate_count
  from public."revenuecat_premium_transaction_authority" transaction_authority
  join public."provider_events" source_event
    on source_event."provider"=transaction_authority."provider"
   and source_event."provider_event_id"=transaction_authority."latest_event_id"
   and source_event."raw_payload_hash"=transaction_authority."latest_event_hash"
   and source_event."product_id"=transaction_authority."current_product_id"
   and source_event."metadata"->>'original_transaction_id'=transaction_authority."original_transaction_id"
  join public."user_entitlements" entitlement
    on entitlement."user_id"=transaction_authority."user_id"::text
   and entitlement."entitlement_key"='premium'
   and entitlement."metadata"->>'revenuecat_event_id'=source_event."provider_event_id"
  where transaction_authority."provider"='revenuecat_app_store'
    and transaction_authority."user_id"=p_source_user_id
    and transaction_authority."environment"='sandbox'
    and transaction_authority."authority_state" in ('active','retained')
    and public."premium_subject_has_finite_authority_internal"(p_source_user_id::text);
  if v_transaction_candidate_count<>1 then
    insert into public."provider_events" (
      "provider_event_id","provider","product_id","product_key","user_id","app_user_id",
      "environment","event_type","status","occurred_at","idempotency_key","raw_payload_hash","metadata"
    ) values (
      v_event_id,'revenuecat_app_store',null,null,p_target_user_id,p_target_user_id::text,
      'sandbox','TRANSFER','ignored',p_occurred_at,'TRANSFER:'||v_event_id,p_raw_payload_hash,
      jsonb_build_object(
        'source_user_id',p_source_user_id,'target_user_id',p_target_user_id,
        'reported_occurred_at',p_occurred_at,'transfer_time_valid',true,
        'transfer_applied',false,'final_reason',case when v_transaction_candidate_count=0
          then 'premium_transfer_source_transaction_authority_missing'
          else 'premium_transfer_source_transaction_authority_ambiguous' end,
        'premium_authority_watermark',false,'authority_granted',false,
        'provider_payload_stored',false,'money_action',false
      )
    );
    return jsonb_build_object(
      'status','ignored','reason',case when v_transaction_candidate_count=0
        then 'premium_transfer_source_transaction_authority_missing'
        else 'premium_transfer_source_transaction_authority_ambiguous' end,
      'duplicateEvent',false,'sourceRevoked',false,'targetActive',false,
      'environment','sandbox','liveMoneyAction',false
    );
  end if;
  select transaction_authority.* into strict v_transaction_authority
  from public."revenuecat_premium_transaction_authority" transaction_authority
  join public."provider_events" source_event
    on source_event."provider"=transaction_authority."provider"
   and source_event."provider_event_id"=transaction_authority."latest_event_id"
   and source_event."raw_payload_hash"=transaction_authority."latest_event_hash"
   and source_event."product_id"=transaction_authority."current_product_id"
   and source_event."metadata"->>'original_transaction_id'=transaction_authority."original_transaction_id"
  join public."user_entitlements" entitlement
    on entitlement."user_id"=transaction_authority."user_id"::text
   and entitlement."entitlement_key"='premium'
   and entitlement."metadata"->>'revenuecat_event_id'=source_event."provider_event_id"
  where transaction_authority."provider"='revenuecat_app_store'
    and transaction_authority."user_id"=p_source_user_id
    and transaction_authority."environment"='sandbox'
    and transaction_authority."authority_state" in ('active','retained')
    and public."premium_subject_has_finite_authority_internal"(p_source_user_id::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium-original:revenuecat_app_store:'||v_transaction_authority."original_transaction_id",0
  ));
  select transaction_authority.* into v_transaction_authority
  from public."revenuecat_premium_transaction_authority" transaction_authority
  where transaction_authority."id"=v_transaction_authority."id"
  for update;
  if v_transaction_authority."user_id"<>p_source_user_id
    or v_transaction_authority."authority_state" not in ('active','retained')
    or not public."premium_subject_has_finite_authority_internal"(p_source_user_id::text)
  then
    raise exception 'revenuecat_premium_transfer_source_transaction_authority_stale';
  end if;

  select coalesce(switch_row."state",'off') into v_app_store_switch
  from public."platform_money_kill_switches" switch_row
  where switch_row."key"='revenuecat_app_store_enabled';
  select coalesce(switch_row."state",'off') into v_webhook_switch
  from public."platform_money_kill_switches" switch_row
  where switch_row."key"='provider_webhooks_enabled';
  if coalesce(v_app_store_switch,'off') not in ('sandbox_only','on')
    or coalesce(v_webhook_switch,'off') not in ('sandbox_only','on')
  then
    select grant_row."product_id",product."product_key"
      into v_product_id,v_product_key
    from public."access_grants" grant_row
    left join public."monetization_products" product on product."id"=grant_row."product_id"
    where grant_row."user_id"=p_source_user_id and grant_row."grant_type"='premium'
      and grant_row."provider"='revenuecat_app_store' and grant_row."environment"='sandbox'
    order by grant_row."updated_at" desc,grant_row."id"
    limit 1;
    insert into public."provider_events" (
      "provider_event_id","provider","product_id","product_key","user_id","app_user_id",
      "environment","event_type","status","occurred_at","idempotency_key","raw_payload_hash","metadata"
    ) values (
      v_event_id,'revenuecat_app_store',v_product_id,v_product_key,p_target_user_id,p_target_user_id::text,
      'sandbox','TRANSFER','ignored',p_occurred_at,'TRANSFER:'||v_event_id,p_raw_payload_hash,
      jsonb_build_object(
        'source_user_id',p_source_user_id,'target_user_id',p_target_user_id,
        'reported_occurred_at',p_occurred_at,'transfer_time_valid',true,
        'original_transaction_id',v_transaction_authority."original_transaction_id",
        'premium_transaction_binding_id',v_transaction_authority."id",
        'transfer_applied',false,'final_reason','premium_provider_rail_disabled',
        'premium_authority_watermark',false,'authority_granted',false,
        'provider_payload_stored',false,'money_action',false
      )
    );
    return jsonb_build_object(
      'status','ignored','reason','premium_provider_rail_disabled','duplicateEvent',false,
      'sourceRevoked',false,'targetActive',false,'environment','sandbox','liveMoneyAction',false
    );
  end if;

  v_result:=public."process_premium_transfer_pre_closeout"(
    v_event_id,p_source_user_id,p_target_user_id,v_environment,p_occurred_at,p_raw_payload_hash
  );
  select event."product_id",event."product_key" into v_product_id,v_product_key
  from public."provider_events" event
  where event."provider"='revenuecat_app_store'
    and event."provider_event_id"='transfer:'||v_event_id||':target'
    and event."event_type"='RENEWAL'
  limit 1;
  if v_product_id is null then raise exception 'revenuecat_premium_transfer_projection_missing'; end if;
  update public."provider_events" event
  set "metadata"=coalesce(event."metadata",'{}'::jsonb)||jsonb_build_object(
    'original_transaction_id',v_transaction_authority."original_transaction_id",
    'premium_transaction_binding_id',v_transaction_authority."id"
  )
  where event."provider"='revenuecat_app_store'
    and event."provider_event_id" in (
      'transfer:'||v_event_id||':source','transfer:'||v_event_id||':target'
    );
  if not exists (
    select 1 from public."provider_events" event
    where event."provider"='revenuecat_app_store'
      and event."provider_event_id"='transfer:'||v_event_id||':source'
      and event."metadata"->>'original_transaction_id'=v_transaction_authority."original_transaction_id"
  ) then raise exception 'revenuecat_premium_transfer_source_projection_missing'; end if;
  update public."revenuecat_premium_transaction_authority" transaction_authority
  set "user_id"=p_target_user_id,"current_product_id"=v_product_id,
      "latest_event_id"='transfer:'||v_event_id||':target',
      "latest_event_hash"=p_raw_payload_hash,"latest_event_type"='RENEWAL',
      "latest_occurred_at"=p_occurred_at,
      "latest_event_rank"=public."revenuecat_premium_authority_rank_internal"('TRANSFER',true),
      "authority_state"='active',"updated_at"=v_now
  where transaction_authority."id"=v_transaction_authority."id"
    and transaction_authority."user_id"=p_source_user_id;
  if not found then raise exception 'revenuecat_premium_transfer_transaction_move_failed'; end if;
  insert into public."provider_events" (
    "provider_event_id","provider","product_id","product_key","user_id","app_user_id",
    "environment","event_type","status","occurred_at","idempotency_key","raw_payload_hash","metadata"
  ) values (
    v_event_id,'revenuecat_app_store',v_product_id,v_product_key,p_target_user_id,p_target_user_id::text,
    'sandbox','TRANSFER','ignored',p_occurred_at,'TRANSFER:'||v_event_id,p_raw_payload_hash,
    jsonb_build_object(
      'source_user_id',p_source_user_id,'target_user_id',p_target_user_id,
      'reported_occurred_at',p_occurred_at,'transfer_time_valid',true,
      'original_transaction_id',v_transaction_authority."original_transaction_id",
      'premium_transaction_binding_id',v_transaction_authority."id",
      'transfer_applied',true,'final_reason','premium_transfer_identity_consumed',
      'premium_authority_watermark',false,'authority_granted',false,
      'provider_payload_stored',false,'money_action',false
    )
  );
  return v_result;
end;
$$;
revoke all on function public."process_premium_transfer_pre_closeout"(
  text,uuid,uuid,text,timestamptz,text
) from public,anon,authenticated,service_role;
revoke all on function public."process_revenuecat_premium_transfer_atomic"(
  text,uuid,uuid,text,timestamptz,text
) from public,anon,authenticated,service_role;
grant execute on function public."process_revenuecat_premium_transfer_atomic"(
  text,uuid,uuid,text,timestamptz,text
) to service_role;
comment on function public."process_revenuecat_premium_transfer_atomic"(
  text,uuid,uuid,text,timestamptz,text
) is 'Service-only exact sandbox App Store Premium transfer. Disabled rails consume the immutable event identity without changing source or target authority; enabled transfers retain the deployed finite-source and ordered atomic reconciliation.';

create or replace function public."wave1_entitlement_authority_readback"(p_entitlement_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session jsonb := public."wave1_session_authority_readback"();
  v_row public."user_entitlements"%rowtype;
  v_state text := 'INACTIVE';
  v_key text := lower(trim(coalesce(p_entitlement_key,'')));
begin
  if v_session->>'state'<>'ACTIVE' or coalesce((v_session->>'restoreOnly')::boolean,false)
    or public."is_account_access_restricted"(v_session->>'userId') then raise exception 'account_access_restricted'; end if;
  if v_key not in ('premium','premium_watch_party','premium_live','paid_content') then raise exception 'entitlement_key_invalid'; end if;
  select entitlement.* into v_row from public."user_entitlements" entitlement
  where entitlement."user_id"=((v_session->>'userId')::uuid)::text and entitlement."entitlement_key"=v_key limit 1;
  if found then
    v_state := case
      when v_row."metadata"->>'revenuecat_event_type'='REFUND' then 'REFUNDED'
      when v_row."revoked_at" is not null or v_row."status"='revoked' then 'REVOKED'
      when v_row."status"='expired' or (v_row."expires_at" is not null and v_row."expires_at"<=timezone('utc'::text,now())) then 'EXPIRED'
      when v_key='premium' and v_row."status" in ('active','trialing','grace_period')
        and not public."premium_subject_has_finite_authority_internal"(v_row."user_id") then 'UNKNOWN'
      when v_key='premium' and v_row."status"='grace_period'
        and public."premium_subject_has_finite_authority_internal"(v_row."user_id") then 'GRACE'
      when v_key='premium' and v_row."status" in ('active','trialing')
        and public."premium_subject_has_finite_authority_internal"(v_row."user_id") then 'ACTIVE'
      when v_key<>'premium' and v_row."status"='grace_period'
        and (v_row."expires_at" is null or v_row."expires_at">timezone('utc'::text,now())) then 'GRACE'
      when v_key<>'premium' and v_row."status" in ('active','trialing')
        and (v_row."expires_at" is null or v_row."expires_at">timezone('utc'::text,now())) then 'ACTIVE'
      when v_row."status" in ('canceled','cancelled') then 'INACTIVE'
      else 'UNKNOWN' end;
  end if;
  return v_session || jsonb_build_object(
    'authoritative',true,'entitlementKey',v_key,'state',v_state,
    'grantsProtectedAccess',v_state in ('ACTIVE','GRACE'),
    'source',case when found then v_row."source" else 'server_absence' end,
    'startsAt',case when found then v_row."starts_at" else null end,
    'expiresAt',case when found then v_row."expires_at" else null end,
    'revokedAt',case when found then v_row."revoked_at" else null end,
    'authoritativeAt',case when found then v_row."updated_at" else (v_session->>'observedAt')::timestamptz end
  );
end;
$$;
revoke all on function public."wave1_entitlement_authority_readback"(text) from public,anon;
grant execute on function public."wave1_entitlement_authority_readback"(text) to authenticated,service_role;

-- RLS-bypassing entitlement lookups are internal subject lookups. Public RPCs
-- remain signature-compatible but may resolve only the exact authenticated user;
-- they cannot be used as cross-account entitlement or paid-room oracles.
create or replace function public."has_premium_access"(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and public."wave1_current_caller_authority_internal"()
    and coalesce(p_user_id, auth.uid()) = auth.uid()
    and not public."is_account_access_restricted"(auth.uid()::text)
    and public."premium_subject_has_finite_authority_internal"(auth.uid()::text);
$$;
revoke all on function public."has_premium_access"(uuid) from public, anon, authenticated, service_role;
grant execute on function public."has_premium_access"(uuid) to authenticated;

create or replace function public."is_current_platform_owner"()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public."has_platform_role"(array['owner'::text]);
$$;
revoke all on function public."is_current_platform_owner"() from public,anon,authenticated,service_role;
grant execute on function public."is_current_platform_owner"() to authenticated,service_role;

create or replace function public."user_has_active_entitlement"(
  target_user_id text,
  required_entitlement_keys text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(trim(coalesce(target_user_id,'')),'') is not null
    and public."wave1_current_caller_authority_internal"()
    and coalesce(array_length(required_entitlement_keys,1),0)>0
    and (target_user_id=auth.uid()::text
      or public."has_platform_role"(array['owner'::text,'operator'::text]))
    and not public."is_account_access_restricted"(target_user_id)
    and exists (
      select 1 from public."user_entitlements" entitlement
      where entitlement."user_id"=target_user_id
        and entitlement."entitlement_key"=any(required_entitlement_keys)
        and entitlement."entitlement_key"='premium'
        and public."premium_subject_has_finite_authority_internal"(target_user_id)
    );
$$;
revoke all on function public."user_has_active_entitlement"(text,text[]) from public,anon;
grant execute on function public."user_has_active_entitlement"(text,text[]) to authenticated,service_role;

create or replace function public."monetization_has_active_premium"(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and public."wave1_current_caller_authority_internal"()
    and p_user_id=auth.uid()
    and not public."is_account_access_restricted"(p_user_id::text)
    and public."premium_subject_has_finite_authority_internal"(p_user_id::text);
$$;
revoke all on function public."monetization_has_active_premium"(uuid) from public,anon,authenticated,service_role;
grant execute on function public."monetization_has_active_premium"(uuid) to authenticated;

create or replace function public."has_active_premium_creator_tool_access"(target_user_id text default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public."wave1_current_caller_authority_internal"() and (
    public."has_platform_role"(array['owner'::text,'operator'::text])
    or (
      auth.uid() is not null
      and coalesce(nullif(trim(target_user_id),''),auth.uid()::text)=auth.uid()::text
      and not public."is_account_access_restricted"(auth.uid()::text)
      and public."premium_subject_has_finite_authority_internal"(auth.uid()::text)
    ));
$$;
revoke all on function public."has_active_premium_creator_tool_access"(text) from public,anon;
grant execute on function public."has_active_premium_creator_tool_access"(text) to authenticated,service_role;

create or replace function public."access_grant_for_subject_internal"(
  p_grant_type text,
  p_source_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_environment text;
  v_identity jsonb;
  v_grant_id uuid;
begin
  if p_user_id is null or p_source_id is null
    or p_grant_type not in (
      'watch_party_live_ticket','paid_content_access','event_pass','vip_pass',
      'channel_subscription'
    )
  then
    return jsonb_build_object('allowed',false,'status','missing','reason','auth_required');
  end if;
  begin
    v_identity:=public."creator_money_existing_purchase_identity_internal"(
      p_user_id,p_grant_type,p_source_id
    );
    v_grant_id:=(v_identity->>'accessGrantId')::uuid;
  exception when others then
    return jsonb_build_object(
      'allowed',false,'status','blocked','reason','exact_provider_grant_required'
    );
  end;
  select grant_row."status",grant_row."environment" into v_status,v_environment
  from public."access_grants" grant_row
  where grant_row."id"=v_grant_id
    and grant_row."user_id" = p_user_id
    and grant_row."grant_type" = p_grant_type
    and grant_row."source_id" = p_source_id
    and ((grant_row."status" = 'active' and grant_row."environment" = 'production')
      or (grant_row."status" = 'sandbox_only' and grant_row."environment" = 'sandbox'))
    and grant_row."starts_at" <= timezone('utc'::text, now())
    and (grant_row."expires_at" is null or grant_row."expires_at" > timezone('utc'::text, now()))
    and grant_row."refunded_at" is null
    and grant_row."revoked_at" is null
    and grant_row."provider" in ('revenuecat_app_store','revenuecat_google_play')
    and not public."revenuecat_authority_quarantined_internal"(
      grant_row."provider",p_user_id,grant_row."environment"
    );
  return case when v_status in ('active','sandbox_only') then jsonb_build_object(
    'allowed',true,'status',v_status,'environment',v_environment,
    'reason',case when v_status='sandbox_only' then 'sandbox_grant' else 'active_grant' end
  ) else jsonb_build_object('allowed',false,'status',coalesce(v_status,'missing'),'reason','grant_required') end;
end;
$$;
revoke all on function public."access_grant_for_subject_internal"(text,uuid,uuid) from public, anon, authenticated, service_role;

create or replace function public."has_access_grant"(
  p_grant_type text,
  p_source_id uuid,
  p_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not public."wave1_current_caller_authority_internal"()
    or p_user_id is distinct from v_user
    or public."is_account_access_restricted"(v_user::text)
  then
    return jsonb_build_object('allowed',false,'status','blocked','reason','subject_authority_required');
  end if;
  return public."access_grant_for_subject_internal"(p_grant_type,p_source_id,v_user);
end;
$$;

create or replace function public."has_paid_content_access"(p_user_id uuid,p_content_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_video public."videos"%rowtype;
begin
  if v_user is null or not public."wave1_current_caller_authority_internal"()
    or p_user_id is distinct from v_user
    or public."is_account_access_restricted"(v_user::text)
  then
    return jsonb_build_object('allowed',false,'status','blocked','reason','subject_authority_required');
  end if;
  select video.* into v_video from public."videos" video where video."id" = p_content_id;
  if v_video."id" is null then return jsonb_build_object('allowed',false,'status','missing','reason','content_unavailable'); end if;
  if not public."wave1_creator_money_subject_authorized_internal"(v_video."owner_id") then
    return jsonb_build_object('allowed',false,'status','blocked','reason','creator_authority_not_current');
  end if;
  if v_video."owner_id" = v_user or public."has_platform_role"(array['owner'::text,'operator'::text]) then
    return jsonb_build_object('allowed',true,'status','owner_or_admin','reason','owner_or_admin_preview');
  end if;
  if v_video."visibility" <> 'public'
    or coalesce(v_video."moderation_status",'clean') not in ('clean','reported')
    or v_video."quarantined_at" is not null
    or coalesce(v_video."scan_status",'clean') in ('infected','malware_detected','blocked')
  then
    return jsonb_build_object('allowed',false,'status','blocked','reason','content_policy_blocked');
  end if;
  return public."access_grant_for_subject_internal"('paid_content_access',p_content_id,v_user);
end;
$$;

create or replace function public."has_watch_party_live_ticket"(p_user_id uuid,p_party_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public."has_access_grant"('watch_party_live_ticket',p_party_id,p_user_id)
$$;
create or replace function public."has_live_watch_party_access"(p_user_id uuid,p_party_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public."has_access_grant"('live_watch_party_access_pass',p_party_id,p_user_id)
$$;
create or replace function public."has_live_watch_party_seat_eligibility"(p_user_id uuid,p_party_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public."has_access_grant"('live_watch_party_seat_pass',p_party_id,p_user_id)
$$;

create or replace function public."resolve_money_access_room_entry"(
  p_user_id uuid,
  p_party_id uuid,
  p_required_grant_type text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_room public."watch_party_rooms"%rowtype;
  v_allowed boolean:=false;
  v_paid_required boolean:=false;
begin
  if v_user is null or not public."wave1_current_caller_authority_internal"()
    or p_user_id is distinct from v_user
    or public."is_account_access_restricted"(v_user::text)
  then
    return jsonb_build_object('allowed',false,'viewerOnly',true,'canPublish',false,'reason','subject_authority_required');
  end if;
  select room.* into v_room from public."watch_party_rooms" room where room."party_id" = p_party_id::text;
  if v_room."party_id" is null then return jsonb_build_object('allowed',false,'viewerOnly',true,'canPublish',false,'reason','room_unavailable'); end if;
  if not coalesce(v_room."is_active",false) then return jsonb_build_object('allowed',false,'viewerOnly',true,'canPublish',false,'reason','room_ended'); end if;
  select exists (
    select 1 from public."paid_watch_party_offers" offer
    where offer."party_id"=v_room."party_id"
      and offer."status" in ('sandbox','active','paused','sold_out','blocked')
  ) into v_paid_required;
  v_allowed:=public."watch_party_room_self_access_allowed_internal"(
    v_room."party_id",v_user::text
  );
  if v_room."host_user_id"=v_user::text and v_allowed then
    return jsonb_build_object(
      'allowed',true,'viewerOnly',false,'canPublish',false,
      'reason','host_route_policy_still_applies'
    );
  end if;
  return jsonb_build_object(
    'allowed',v_allowed,'viewerOnly',true,'canPublish',false,
    'speakerApprovalRequired',true,
    'reason',case
      when v_allowed and v_paid_required then 'exact_paid_seat_authority'
      when v_allowed then 'room_access_allowed'
      when v_paid_required then 'exact_paid_seat_authority_required'
      else 'room_access_required' end
  );
end;
$$;

revoke all on function public."has_access_grant"(text,uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public."has_paid_content_access"(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public."has_watch_party_live_ticket"(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public."has_live_watch_party_access"(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public."has_live_watch_party_seat_eligibility"(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public."resolve_money_access_room_entry"(uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public."has_access_grant"(text,uuid,uuid) to authenticated;
grant execute on function public."has_paid_content_access"(uuid,uuid) to authenticated;
grant execute on function public."has_watch_party_live_ticket"(uuid,uuid) to authenticated;
grant execute on function public."has_live_watch_party_access"(uuid,uuid) to authenticated;
grant execute on function public."has_live_watch_party_seat_eligibility"(uuid,uuid) to authenticated;
grant execute on function public."resolve_money_access_room_entry"(uuid,uuid,text) to authenticated;

-- RevenueCat creator-money authority is anchored to one exact, durable original
-- transaction -> purchase-intent binding. Every well-formed delivery is recorded
-- before a policy ignore is returned. Provider ordering is monotonic and a
-- refund/revocation/pause terminal cannot be reopened by a later stale active event.
create or replace function public."process_revenuecat_consumable_event_provider_internal"(
  p_provider_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_provider_product_id text,
  p_environment text,
  p_occurred_at timestamptz,
  p_expires_at timestamptz,
  p_amount_minor integer,
  p_currency text,
  p_raw_payload_hash text,
  p_original_transaction_id text,
  p_provider text,
  p_platform text,
  p_store text,
  p_store_switch_key text,
  p_input_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id text := trim(coalesce(p_provider_event_id, ''));
  v_event_type text := upper(trim(coalesce(p_event_type, '')));
  v_environment text := lower(trim(coalesce(p_environment, '')));
  v_provider_product_id text := trim(coalesce(p_provider_product_id, ''));
  v_original_transaction text := nullif(trim(coalesce(p_original_transaction_id, '')), '');
  v_provider_key text := lower(trim(coalesce(p_provider, '')));
  v_product_identity_unresolved boolean := v_provider_product_id = '<missing-or-ambiguous>';
  v_platform text := lower(trim(coalesce(p_platform, '')));
  v_store text := lower(trim(coalesce(p_store, '')));
  v_store_switch_key text := lower(trim(coalesce(p_store_switch_key, '')));
  v_reported_currency text := lower(trim(coalesce(p_currency, '')));
  v_currency text := case when lower(trim(coalesce(p_currency, ''))) ~ '^[a-z]{3}$'
    then lower(trim(p_currency)) else 'usd' end;
  v_event_amount integer := greatest(coalesce(p_amount_minor, 0), 0);
  v_now timestamptz := timezone('utc'::text, now());
  v_occurred_at timestamptz := p_occurred_at;
  v_authority_occurred_at timestamptz;
  v_mapping public."monetization_product_store_mappings"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_provider public."provider_events"%rowtype;
  v_intent public."money_purchase_intents"%rowtype;
  v_link public."revenuecat_consumable_transaction_intents"%rowtype;
  v_unbound_terminal public."revenuecat_unbound_terminal_authority"%rowtype;
  v_unbound_initial public."revenuecat_unbound_initial_authority"%rowtype;
  v_seat_offer public."paid_watch_party_offers"%rowtype;
  v_event_offer public."paid_creator_events"%rowtype;
  v_ledger public."money_access_ledger_events"%rowtype;
  v_grant public."access_grants"%rowtype;
  v_candidate_ids uuid[];
  v_provider_count integer := 0;
  v_catalog_count integer := 0;
  v_link_count integer := 0;
  v_expected_source_type text;
  v_expected_product_type text;
  v_required_offer_status text;
  v_grant_type text;
  v_feature_key text;
  v_feature_state text;
  v_store_state text;
  v_webhook_state text;
  v_creator_money_state text;
  v_live_state text;
  v_event_rank smallint := public."revenuecat_creator_money_authority_rank_internal"(v_event_type);
  v_is_initial boolean := v_event_type in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE');
  v_is_active boolean := v_event_type in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL','UNCANCELLATION','PRODUCT_CHANGE');
  v_is_financial_terminal boolean := v_event_type in ('REFUND','REVOCATION');
  v_is_access_terminal boolean := v_event_type in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED');
  v_is_subscription boolean := false;
  v_ignore_reason text := case when v_is_active
    then nullif(trim(coalesce(p_input_reason, '')), '') else null end;
  v_grant_status text;
  v_payable_state text;
  v_ledger_status text;
  v_provider_status text;
  v_retain_subscription_access boolean := false;
  v_duplicate_grant boolean := false;
  v_duplicate_ledger boolean := false;
  v_bound_amount integer;
  v_bound_currency text;
begin
  if p_user_id is null then raise exception 'revenuecat_user_required'; end if;
  if v_event_id = '' or length(v_event_id)>512
    or v_event_id is distinct from coalesce(p_provider_event_id,'')
    or v_event_id ~ '[[:cntrl:]]'
  then raise exception 'revenuecat_event_id_invalid'; end if;
  if v_provider_product_id = '' or length(v_provider_product_id)>512
    or v_provider_product_id is distinct from coalesce(p_provider_product_id,'')
    or v_provider_product_id ~ '[[:cntrl:]]'
  then raise exception 'revenuecat_product_id_invalid'; end if;
  if v_environment not in ('sandbox','production') then raise exception 'revenuecat_environment_invalid'; end if;
  if not (
    (v_provider_key = 'revenuecat_app_store' and v_platform = 'ios' and v_store = 'app_store'
      and v_store_switch_key = 'revenuecat_app_store_enabled')
    or (v_provider_key = 'revenuecat_google_play' and v_platform = 'android' and v_store = 'google_play'
      and v_store_switch_key = 'revenuecat_google_play_enabled')
  ) then raise exception 'revenuecat_provider_store_tuple_invalid'; end if;
  if coalesce(p_raw_payload_hash,'') !~ '^[0-9a-f]{64}$'
  then raise exception 'revenuecat_payload_hash_invalid'; end if;
  if v_original_transaction is not null and (
    length(v_original_transaction)>512
    or v_original_transaction is distinct from coalesce(p_original_transaction_id,'')
    or v_original_transaction ~ '[[:cntrl:]]'
  ) then raise exception 'revenuecat_original_transaction_id_invalid'; end if;
  if p_occurred_at is null then
    v_occurred_at := v_now;
    if v_is_active then
      v_ignore_reason := coalesce(v_ignore_reason,'active_provider_occurred_at_required');
    end if;
  end if;
  if v_is_active and (p_amount_minor is null or p_amount_minor <= 0) then
    v_ignore_reason := coalesce(v_ignore_reason, 'active_provider_amount_invalid');
  end if;
  if v_is_active and (
    v_reported_currency !~ '^[a-z]{3}$'
    or public."money_currency_minor_unit_exponent_internal"(v_reported_currency) is null
  ) then
    v_ignore_reason := coalesce(v_ignore_reason, 'active_provider_currency_invalid');
  end if;
  if v_is_active and v_occurred_at > v_now + interval '5 minutes' then
    v_ignore_reason := coalesce(v_ignore_reason, 'active_provider_occurred_at_future_skew');
  end if;
  -- Preserve the signed provider time on provider_events, but never let any
  -- future-skewed delivery move the ordering watermark beyond receipt time.
  v_authority_occurred_at := least(v_occurred_at, v_now);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium-event-id:'||v_event_id,0
  ));
  perform pg_advisory_xact_lock(hashtextextended('creator-money-provider-event:' || v_event_id, 0));
  if v_original_transaction is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'revenuecat-original:'||v_provider_key||':'||v_original_transaction,0
    ));
    perform pg_advisory_xact_lock(hashtextextended('creator-money-original-transaction:' || v_original_transaction, 0));
    select tombstone.* into v_unbound_initial
    from public."revenuecat_unbound_initial_authority" tombstone
    where tombstone."provider"=v_provider_key
      and tombstone."original_transaction_id"=v_original_transaction
    for update;
    if v_unbound_initial."provider" is not null and v_is_initial then
      if v_unbound_initial."user_id" is distinct from p_user_id
        or v_unbound_initial."provider_product_id" is distinct from v_provider_product_id
        or v_unbound_initial."environment" is distinct from v_environment
      then
        v_ignore_reason := coalesce(v_ignore_reason,'unbound_initial_authority_mismatch');
      else
        v_ignore_reason := coalesce(v_ignore_reason,'unbound_initial_original_transaction_reserved');
      end if;
    end if;
    if v_is_initial and exists (
      select 1
      from public."revenuecat_premium_transaction_authority" premium_binding
      where premium_binding."provider"=v_provider_key
        and premium_binding."original_transaction_id"=v_original_transaction
    ) then
      v_ignore_reason:=coalesce(v_ignore_reason,'revenuecat_original_transaction_cross_domain_reserved');
    end if;
  end if;

  select count(*)::integer into v_provider_count
  from public."provider_events" event
  where event."provider" = v_provider_key
    and event."provider_event_id" = v_event_id;
  if v_provider_count > 1 then
    raise exception 'revenuecat_provider_event_identity_ambiguous';
  end if;

  if v_provider_key = 'revenuecat_app_store' then
    select mapping.* into v_mapping
    from public."monetization_product_store_mappings" mapping
    where mapping."platform" = v_platform
      and mapping."store" = v_store
      and mapping."provider" = v_provider_key
      and mapping."provider_product_id" = v_provider_product_id
      and mapping."provider_base_plan_id" is null
      and mapping."environment" = v_environment
    order by mapping."updated_at" desc, mapping."id"
    limit 1;
    if v_mapping."id" is not null then
      select product.* into v_product
      from public."monetization_products" product
      where product."id" = v_mapping."product_id";
    end if;
  else
    select count(*)::integer into v_catalog_count
    from public."monetization_products" product
    where product."provider" = v_provider_key
      and product."provider_product_id" = v_provider_product_id
      and product."environment" = v_environment;
    if v_catalog_count = 1 then
      select product.* into v_product
      from public."monetization_products" product
      where product."provider" = v_provider_key
        and product."provider_product_id" = v_provider_product_id
        and product."environment" = v_environment;
      v_mapping."id" := v_product."id";
      v_mapping."product_id" := v_product."id";
      v_mapping."concept" := case v_product."product_type"
        when 'creator_tip' then 'creator_tip'
        when 'watch_party_live_ticket' then 'seat_pass'
        when 'paid_content_access' then 'paid_video'
        when 'event_pass' then 'event_pass'
        when 'vip_pass' then 'vip_pass'
        when 'channel_subscription' then 'channel_subscription'
        else null end;
      v_mapping."platform" := v_platform;
      v_mapping."store" := v_store;
      v_mapping."provider" := v_provider_key;
      v_mapping."provider_product_id" := v_provider_product_id;
      v_mapping."store_product_type" := case when v_product."product_type" = 'channel_subscription'
        then 'auto_renewable_subscription' else 'consumable' end;
      v_mapping."tier" := coalesce(v_product."metadata"->>'price_tier',substring(v_product."product_key" from '([0-9]+)$'));
      if coalesce(v_mapping."tier", '') ~ '^[0-9]+$' then
        v_mapping."reference_price_minor" := v_mapping."tier"::integer;
      end if;
      v_mapping."reference_currency" := 'usd';
      v_mapping."environment" := v_product."environment";
      v_mapping."status" := v_product."status";
      v_mapping."unlocks_digital_access" := v_mapping."concept" <> 'creator_tip';
      v_mapping."grants_livekit_authority" := false;
      v_mapping."creates_payable_balance" := false;
      v_mapping."metadata" := coalesce(v_product."metadata", '{}'::jsonb) || jsonb_build_object(
        'source_bound',true,'live_money_action',false,'google_product_catalog_binding',true
      );
    elsif v_catalog_count > 1 and v_is_active then
      v_ignore_reason := coalesce(v_ignore_reason, 'product_catalog_binding_ambiguous');
    end if;
  end if;

  if v_provider_count = 1 then
    select event.* into v_provider
    from public."provider_events" event
    where event."provider" = v_provider_key
      and event."provider_event_id" = v_event_id
    for update;
    if v_provider."user_id" is distinct from p_user_id
      or v_provider."environment" is distinct from v_environment
      or v_provider."event_type" is distinct from v_event_type
      or v_provider."raw_payload_hash" is distinct from p_raw_payload_hash
      or v_provider."metadata"->>'provider_product_id' is distinct from v_provider_product_id
      or v_provider."metadata"->>'original_transaction_id' is distinct from v_original_transaction
    then
      raise exception 'revenuecat_provider_event_replay_mismatch';
    end if;
    if v_provider."status" <> 'received' then
      if nullif(v_provider."metadata"->>'ledger_event_id', '') is not null then
        select ledger.* into v_ledger
        from public."money_access_ledger_events" ledger
        where ledger."id" = (v_provider."metadata"->>'ledger_event_id')::uuid;
      end if;
      if nullif(v_provider."metadata"->>'access_grant_id', '') is not null then
        select grant_row.* into v_grant
        from public."access_grants" grant_row
        where grant_row."id" = (v_provider."metadata"->>'access_grant_id')::uuid;
      end if;
      return jsonb_build_object(
        'status', case when v_provider."status" = 'ignored' then 'ignored' else 'processed' end,
        'reason', coalesce(v_provider."metadata"->>'final_reason', 'duplicate_provider_event_already_finalized'),
        'productKey', v_provider."product_key",
        'productType', v_product."product_type",
        'providerEventId', v_provider."id",
        'accessGrantId', v_grant."id",
        'ledgerEventId', v_ledger."id",
        'purchaseIntentId', nullif(v_provider."metadata"->>'purchase_intent_id', ''),
        'environment', v_environment,
        'payableState', coalesce(v_ledger."payable_state", 'not_payable'),
        'grantStatus', coalesce(v_grant."status", 'blocked'),
        'duplicateProviderEvent', true,
        'duplicateAccessGrant', v_grant."id" is not null,
        'duplicateLedgerEvent', v_ledger."id" is not null
      );
    end if;
  else
    insert into public."provider_events" (
      "provider_event_id","provider","product_id","product_key","user_id","app_user_id",
      "environment","event_type","status","occurred_at","idempotency_key","raw_payload_hash","metadata"
    ) values (
      v_event_id,v_provider_key,v_product."id",v_product."product_key",p_user_id,p_user_id::text,
      v_environment,v_event_type,'received',v_occurred_at,'creator_money:' || v_event_id,p_raw_payload_hash,
      jsonb_strip_nulls(jsonb_build_object(
        'provider_payload_stored',false,
        'provider_product_id',v_provider_product_id,
        'original_transaction_id',v_original_transaction,
        'store_mapping_id',v_mapping."id",
        'concept',v_mapping."concept",
        'reported_amount_minor',p_amount_minor,
        'reported_currency',nullif(v_reported_currency,''),
        'reported_expires_at',p_expires_at,
        'reference_price_minor',v_mapping."reference_price_minor",
        'reference_currency',v_mapping."reference_currency",
        'localized_storefront_price',v_mapping."id" is not null and (
          p_amount_minor is distinct from v_mapping."reference_price_minor"
          or v_currency is distinct from v_mapping."reference_currency"
        ),
        'production_money',v_environment = 'production',
        'live_money_action',false,
        'payout_ready',false
      ))
    ) returning * into v_provider;
  end if;

  if v_event_rank = 0 then v_ignore_reason := 'unsupported_event_type'; end if;
  if v_is_active and v_mapping."id" is null then v_ignore_reason := coalesce(v_ignore_reason, 'product_mapping_missing'); end if;
  if v_is_active and v_mapping."id" is not null and v_product."id" is null then v_ignore_reason := coalesce(v_ignore_reason, 'conceptual_product_missing'); end if;
  if v_original_transaction is null then v_ignore_reason := coalesce(v_ignore_reason, 'original_transaction_id_required'); end if;
  if v_is_active and v_mapping."id" is not null
    and (v_mapping."grants_livekit_authority" or v_mapping."creates_payable_balance") then
    v_ignore_reason := coalesce(v_ignore_reason, 'unsafe_store_mapping_authority');
  end if;
  if v_is_active and v_mapping."concept" = 'creator_tip' and v_mapping."unlocks_digital_access" then
    v_ignore_reason := coalesce(v_ignore_reason, 'tip_cannot_unlock_access');
  end if;
  if v_is_active and v_mapping."concept" not in ('creator_tip','seat_pass','paid_video','event_pass','vip_pass','channel_subscription') then
    v_ignore_reason := coalesce(v_ignore_reason, 'unsupported_creator_money_concept');
  end if;

  v_is_subscription := v_mapping."concept" = 'channel_subscription';
  if v_is_active and not v_is_subscription and v_event_type in (
    'RENEWAL','UNCANCELLATION','PRODUCT_CHANGE','CANCELLATION','BILLING_ISSUE','EXPIRATION','SUBSCRIPTION_PAUSED'
  ) then
    v_ignore_reason := coalesce(v_ignore_reason, 'lifecycle_event_requires_subscription');
  end if;
  if v_is_active and v_is_subscription and v_event_type = 'NON_RENEWING_PURCHASE' then
    v_ignore_reason := coalesce(v_ignore_reason, 'subscription_event_type_invalid');
  end if;
  if v_is_subscription and v_is_active and (p_expires_at is null or p_expires_at <= v_now) then
    v_ignore_reason := coalesce(v_ignore_reason, 'channel_subscription_finite_expiry_required');
  end if;

  v_expected_source_type := case v_mapping."concept"
    when 'creator_tip' then 'creator_tip'
    when 'seat_pass' then 'watch_party_live'
    when 'paid_video' then 'paid_content'
    when 'event_pass' then 'event'
    when 'vip_pass' then 'vip_pass'
    when 'channel_subscription' then 'channel_subscription'
    else null end;
  v_expected_product_type := case v_mapping."concept"
    when 'creator_tip' then 'creator_tip'
    when 'seat_pass' then 'watch_party_live_ticket'
    when 'paid_video' then 'paid_content_access'
    when 'event_pass' then 'event_pass'
    when 'vip_pass' then 'vip_pass'
    when 'channel_subscription' then 'channel_subscription'
    else null end;
  v_grant_type := case v_mapping."concept"
    when 'seat_pass' then 'watch_party_live_ticket'
    when 'paid_video' then 'paid_content_access'
    when 'event_pass' then 'event_pass'
    when 'vip_pass' then 'vip_pass'
    when 'channel_subscription' then 'channel_subscription'
    else null end;
  if v_is_active and v_product."id" is not null
    and v_product."product_type" is distinct from v_expected_product_type then
    v_ignore_reason := coalesce(v_ignore_reason, 'conceptual_product_type_mismatch');
  end if;

  v_feature_key := case
    when v_mapping."concept" = 'paid_video' then 'paid_content_enabled'
    when v_mapping."concept" = 'seat_pass' then 'watch_party_tickets_enabled'
    when v_mapping."concept" = 'creator_tip' then 'tips_enabled'
    else 'digital_sales_enabled' end;
  select "state" into v_store_state from public."platform_money_kill_switches" where "key" = v_store_switch_key;
  select "state" into v_webhook_state from public."platform_money_kill_switches" where "key" = 'provider_webhooks_enabled';
  select "state" into v_creator_money_state from public."platform_money_kill_switches" where "key" = 'creator_monetization_enabled';
  select "state" into v_live_state from public."platform_money_kill_switches" where "key" = 'live_money_enabled';
  select "state" into v_feature_state from public."platform_money_kill_switches" where "key" = v_feature_key;

  if v_is_active then
    if v_environment = 'sandbox' then
      if v_mapping."status" is distinct from 'sandbox'
        or coalesce(v_store_state, 'off') <> 'sandbox_only'
        or coalesce(v_webhook_state, 'off') <> 'sandbox_only'
        or coalesce(v_feature_state, 'off') not in ('sandbox_only','on')
        or coalesce(v_creator_money_state, 'off') not in ('sandbox_only','on')
        or coalesce(v_live_state, 'off') <> 'off'
      then
        v_ignore_reason := coalesce(v_ignore_reason, 'sandbox_switch_or_mapping_not_ready');
      end if;
    else
      if v_mapping."status" is distinct from 'active'
        or coalesce(v_store_state, 'off') <> 'on'
        or coalesce(v_webhook_state, 'off') <> 'on'
        or coalesce(v_feature_state, 'off') <> 'on'
        or coalesce(v_creator_money_state, 'off') <> 'on'
        or coalesce(v_live_state, 'off') <> 'on'
        or coalesce((v_mapping."metadata"->>'provider_proof')::boolean, false) is not true
        or coalesce((v_mapping."metadata"->>'owner_release_approved')::boolean, false) is not true
        or coalesce((v_mapping."metadata"->>'physical_device_proof')::boolean, false) is not true
      then
        v_ignore_reason := coalesce(v_ignore_reason, 'production_activation_proof_incomplete');
      end if;
    end if;
  end if;

  -- Every supported lifecycle event must recover the durable exact
  -- original-transaction binding. Only an INITIAL active event may create that
  -- binding from a unique pending intent; terminal events never fall back to a
  -- current/latest intent.
  if v_ignore_reason is null then
    select count(*)::integer into v_link_count
    from public."revenuecat_consumable_transaction_intents" link
    where link."provider" = v_provider_key
      and link."original_transaction_id" = v_original_transaction;
    if v_link_count > 1 or exists (
      select 1
      from public."revenuecat_consumable_transaction_intents" link
      where link."provider" = v_provider_key
        and link."original_transaction_id" = v_original_transaction
        and link."binding_state" <> 'exact'
    ) then
      v_ignore_reason := 'original_transaction_binding_ambiguous';
    elsif v_link_count = 1 then
      select link.* into v_link
      from public."revenuecat_consumable_transaction_intents" link
      where link."provider" = v_provider_key
        and link."original_transaction_id" = v_original_transaction
        and link."binding_state" = 'exact'
      for update;
      if v_link."user_id" is distinct from p_user_id then
        v_ignore_reason := 'original_transaction_authority_mismatch';
      elsif v_is_initial then
        v_ignore_reason := 'original_transaction_already_bound';
      else
        select intent.* into v_intent
        from public."money_purchase_intents" intent
        where intent."id" = v_link."purchase_intent_id"
        for update;
        if not v_is_active and v_intent."id" is not null then
          select product.* into v_product
          from public."monetization_products" product
          where product."id" = v_intent."product_id";
          v_mapping."id" := coalesce(v_mapping."id",v_product."id");
          v_mapping."product_id" := v_product."id";
          v_mapping."concept" := case v_intent."source_type"
            when 'creator_tip' then 'creator_tip'
            when 'watch_party_live' then 'seat_pass'
            when 'paid_content' then 'paid_video'
            when 'event' then 'event_pass'
            when 'vip_pass' then 'vip_pass'
            when 'channel_subscription' then 'channel_subscription'
            else null end;
          v_mapping."reference_price_minor" := v_intent."amount_minor";
          v_mapping."reference_currency" := lower(v_intent."currency");
          v_expected_source_type := v_intent."source_type";
          v_expected_product_type := v_intent."product_type";
          v_grant_type := case v_intent."source_type"
            when 'watch_party_live' then 'watch_party_live_ticket'
            when 'paid_content' then 'paid_content_access'
            when 'event' then 'event_pass'
            when 'vip_pass' then 'vip_pass'
            when 'channel_subscription' then 'channel_subscription'
            else null end;
          v_is_subscription := v_intent."source_type" = 'channel_subscription';
          update public."provider_events"
          set "product_id" = v_product."id", "product_key" = v_product."product_key",
              "metadata" = coalesce("metadata",'{}'::jsonb) || jsonb_build_object(
                'durable_bound_product_recovered',true,'concept',v_mapping."concept"
              )
          where "id" = v_provider."id"
          returning * into v_provider;
        end if;
        if v_intent."id" is null
          or v_intent."user_id" is distinct from p_user_id
          or v_intent."product_id" is distinct from v_product."id"
          or v_link."product_id" is distinct from v_intent."product_id"
          or v_intent."provider" is distinct from v_provider_key
          or (not v_product_identity_unresolved
            and v_intent."provider_product_id" is distinct from v_provider_product_id)
          or v_intent."environment" is distinct from v_environment
          or v_intent."source_type" is distinct from v_expected_source_type
        then
          v_ignore_reason := 'bound_purchase_intent_authority_mismatch';
        end if;
      end if;
    elsif not v_is_initial then
      if not v_is_active and v_event_rank > 0 then
        select tombstone.* into v_unbound_terminal
        from public."revenuecat_unbound_terminal_authority" tombstone
        where tombstone."provider"=v_provider_key
          and tombstone."original_transaction_id"=v_original_transaction
        for update;
        if v_unbound_terminal."provider" is null then
          insert into public."revenuecat_unbound_terminal_authority" (
            "provider","original_transaction_id","user_id","provider_product_id","environment",
            "last_provider_event_id","last_occurred_at","last_event_type","last_event_rank"
          ) values (
            v_provider_key,v_original_transaction,p_user_id,v_provider_product_id,v_environment,
            v_provider."id",v_authority_occurred_at,v_event_type,v_event_rank
          ) returning * into v_unbound_terminal;
          v_ignore_reason := 'unbound_terminal_authority_recorded';
        elsif v_unbound_terminal."user_id" is distinct from p_user_id
          or v_unbound_terminal."provider_product_id" is distinct from v_provider_product_id
          or v_unbound_terminal."environment" is distinct from v_environment
        then
          v_ignore_reason := 'unbound_terminal_authority_mismatch';
        else
          if v_unbound_terminal."last_occurred_at" < v_authority_occurred_at
            or (v_unbound_terminal."last_occurred_at"=v_authority_occurred_at
              and v_unbound_terminal."last_event_rank"<=v_event_rank)
          then
            update public."revenuecat_unbound_terminal_authority"
            set "last_provider_event_id"=v_provider."id",
                "last_occurred_at"=v_authority_occurred_at,
                "last_event_type"=v_event_type,
                "last_event_rank"=v_event_rank,
                "updated_at"=v_now
            where "provider"=v_provider_key and "original_transaction_id"=v_original_transaction
            returning * into v_unbound_terminal;
          end if;
          v_ignore_reason := 'unbound_terminal_authority_retained';
        end if;
      else
        v_ignore_reason := 'original_transaction_binding_missing';
      end if;
    else
      select tombstone.* into v_unbound_terminal
      from public."revenuecat_unbound_terminal_authority" tombstone
      where tombstone."provider"=v_provider_key
        and tombstone."original_transaction_id"=v_original_transaction
      for update;
      if v_unbound_terminal."provider" is not null then
        if v_unbound_terminal."user_id" is distinct from p_user_id
          or v_unbound_terminal."provider_product_id" is distinct from v_provider_product_id
          or v_unbound_terminal."environment" is distinct from v_environment
        then
          v_ignore_reason := 'unbound_terminal_authority_mismatch';
        elsif v_unbound_terminal."last_event_type" in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED') then
          v_ignore_reason := 'terminal_original_transaction_cannot_open';
        elsif v_unbound_terminal."last_occurred_at" > v_authority_occurred_at
          or (v_unbound_terminal."last_occurred_at"=v_authority_occurred_at
            and v_unbound_terminal."last_event_rank">=v_event_rank)
        then
          v_ignore_reason := 'prior_lifecycle_prevents_older_initial';
        end if;
      end if;
      if v_ignore_reason is null then
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
          'creator-money-pending-intent:'||p_user_id::text||':'||v_provider_key||':'
            ||v_product."id"::text||':'||coalesce(v_expected_source_type,''),0
        ));
        select array_agg(intent."id" order by intent."created_at", intent."id") into v_candidate_ids
        from public."money_purchase_intents" intent
        where intent."user_id" = p_user_id
          and intent."product_id" = v_product."id"
          and intent."provider" = v_provider_key
          and intent."provider_product_id" = v_provider_product_id
          and intent."environment" = v_environment
          and intent."source_type" = v_expected_source_type
          and intent."status" = 'pending'
          and intent."expires_at" > v_now
          and intent."amount_minor" = v_mapping."reference_price_minor"
          and lower(intent."currency") = v_mapping."reference_currency";
        if coalesce(cardinality(v_candidate_ids), 0) = 0 then
          v_ignore_reason := 'purchase_intent_missing_or_expired';
        elsif cardinality(v_candidate_ids) <> 1 then
          v_ignore_reason := 'purchase_intent_binding_ambiguous';
        else
          v_intent:=null;
          select intent.* into v_intent
          from public."money_purchase_intents" intent
          where intent."id" = v_candidate_ids[1]
            and intent."user_id"=p_user_id
            and intent."product_id"=v_product."id"
            and intent."provider"=v_provider_key
            and intent."provider_product_id"=v_provider_product_id
            and intent."environment"=v_environment
            and intent."source_type"=v_expected_source_type
            and intent."status"='pending'
            and intent."expires_at">v_now
            and intent."amount_minor"=v_mapping."reference_price_minor"
            and lower(intent."currency")=v_mapping."reference_currency"
          for update;
          if v_intent."id" is null then
            v_ignore_reason:='purchase_intent_no_longer_pending';
          end if;
        end if;
      end if;
    end if;
  end if;

  -- Active provider events must still resolve the exact source offer. Production
  -- can never consume a sandbox source merely because its price matches.
  if v_ignore_reason is null and v_is_active then
    v_required_offer_status := case when v_environment = 'production' then 'active' else 'sandbox' end;
    if v_mapping."concept" = 'creator_tip' then
      if not exists (
        select 1 from public."creator_tip_settings" settings
        where settings."creator_id" = v_intent."creator_id"
          and settings."tips_enabled"
          and settings."status" not in ('paused','blocked')
      ) then v_ignore_reason := 'creator_tip_source_not_available'; end if;
    elsif v_mapping."concept" = 'seat_pass' then
      select offer.* into v_seat_offer
      from public."paid_watch_party_offers" offer
      join public."watch_party_rooms" room on room."party_id"=offer."party_id"
      where offer."id" = v_intent."source_id"
        and offer."creator_id" = v_intent."creator_id"
        and offer."status" = v_required_offer_status
        and offer."price_cents" = v_mapping."reference_price_minor"
        and lower(offer."currency") = v_mapping."reference_currency"
        and coalesce(room."is_active",false)
        and room."room_type"='title'
      for update of offer;
      if v_seat_offer."id" is null then
        v_ignore_reason := 'seat_pass_source_not_available';
      elsif exists (
        select 1 from public."paid_watch_party_tickets" ticket
        where ticket."offer_id"=v_seat_offer."id"
          and ticket."buyer_id"=p_user_id
          and ticket."status"='active'
          and ticket."refunded_at" is null and ticket."revoked_at" is null
          and (ticket."expires_at" is null or ticket."expires_at">v_now)
      ) then
        v_ignore_reason := 'seat_pass_already_owned';
      elsif v_seat_offer."seat_limit" is not null and (
        select count(*)::integer from public."paid_watch_party_tickets" ticket
        where ticket."offer_id"=v_seat_offer."id"
          and ticket."status"='active'
          and ticket."refunded_at" is null and ticket."revoked_at" is null
          and (ticket."expires_at" is null or ticket."expires_at">v_now)
      ) >= v_seat_offer."seat_limit" then
        update public."paid_watch_party_offers"
        set "status"='sold_out',"updated_at"=v_now
        where "id"=v_seat_offer."id";
        v_ignore_reason := 'seat_pass_sold_out';
      end if;
    elsif v_mapping."concept" = 'paid_video' then
      if not exists (
        select 1 from public."creator_content_prices" offer
        where offer."content_id" = v_intent."source_id"
          and offer."content_type" = 'creator_video'
          and offer."creator_id" = v_intent."creator_id"
          and offer."is_paid"
          and offer."status" = v_required_offer_status
          and offer."price_cents" = v_mapping."reference_price_minor"
          and lower(offer."currency") = v_mapping."reference_currency"
      ) then v_ignore_reason := 'paid_video_source_not_available'; end if;
    elsif v_mapping."concept" = 'event_pass' then
      select offer.* into v_event_offer
      from public."paid_creator_events" offer
      join public."creator_events" event on event."id"=offer."creator_event_id"
      where offer."creator_event_id"=v_intent."source_id"
        and offer."creator_id"=v_intent."creator_id"
        and offer."status"=v_required_offer_status
        and offer."price_cents"=v_mapping."reference_price_minor"
        and lower(offer."currency")=v_mapping."reference_currency"
        and event."status" not in ('ended','expired','canceled','removed','unsafe','blocked')
        and (offer."starts_at" is null or offer."starts_at"<=v_now)
        and (offer."ends_at" is null or offer."ends_at">v_now)
      for update of offer;
      if v_event_offer."id" is null then
        v_ignore_reason:='event_pass_source_not_available';
      elsif exists (
        select 1 from public."paid_creator_event_passes" pass_row
        where pass_row."event_id"=v_event_offer."id" and pass_row."buyer_id"=p_user_id
          and pass_row."status"='active' and pass_row."refunded_at" is null
          and pass_row."revoked_at" is null
          and (pass_row."expires_at" is null or pass_row."expires_at">v_now)
      ) then
        v_ignore_reason:='event_pass_already_owned';
      elsif v_event_offer."capacity_limit" is not null and (
        select count(*)::integer from public."paid_creator_event_passes" pass_row
        where pass_row."event_id"=v_event_offer."id" and pass_row."status"='active'
          and pass_row."refunded_at" is null and pass_row."revoked_at" is null
          and (pass_row."expires_at" is null or pass_row."expires_at">v_now)
      )>=v_event_offer."capacity_limit" then
        update public."paid_creator_events"
        set "status"='sold_out',"updated_at"=v_now
        where "id"=v_event_offer."id";
        v_ignore_reason:='event_pass_sold_out';
      end if;
    elsif v_mapping."concept" = 'vip_pass' then
      if not exists (
        select 1 from public."creator_vip_pass_offers" offer
        where offer."id" = v_intent."source_id"
          and offer."creator_id" = v_intent."creator_id"
          and offer."status" = v_required_offer_status
          and offer."price_cents" = v_mapping."reference_price_minor"
          and lower(offer."currency") = v_mapping."reference_currency"
      ) then v_ignore_reason := 'vip_pass_source_not_available'; end if;
    elsif v_mapping."concept" = 'channel_subscription' then
      if not exists (
        select 1 from public."creator_channel_subscription_offers" offer
        where offer."id" = v_intent."source_id"
          and offer."creator_id" = v_intent."creator_id"
          and offer."status" = v_required_offer_status
          and offer."price_cents" = v_mapping."reference_price_minor"
          and lower(offer."currency") = v_mapping."reference_currency"
      ) then v_ignore_reason := 'channel_subscription_source_not_available'; end if;
    end if;
  end if;

  -- Lifecycle and terminal deliveries carry no authority over price. Recover
  -- the original exact-bound financial values so a provider's 0/default
  -- terminal payload cannot create a mismatched reversal or ledger entry.
  if v_ignore_reason is null and not v_is_active then
    select ledger."amount_minor", lower(ledger."currency")
    into v_bound_amount, v_bound_currency
    from public."money_access_ledger_events" ledger
    where ledger."user_id" = p_user_id
      and ledger."product_id" = v_intent."product_id"
      and ledger."source_type" = v_intent."source_type"
      and ledger."source_id" = v_intent."source_id"
      and ledger."metadata"->>'purchase_intent_id' = v_intent."id"::text
      and ledger."metadata"->>'original_transaction_id' = v_original_transaction
      and ledger."event_type" in (
        'INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL','UNCANCELLATION','PRODUCT_CHANGE'
      )
      and ledger."status" in ('verified','sandbox_only')
    order by ledger."created_at" desc, ledger."id" desc
    limit 1;
    v_event_amount := coalesce(v_bound_amount, v_intent."amount_minor");
    v_currency := coalesce(v_bound_currency, lower(v_intent."currency"));
    if v_event_amount is null or v_event_amount <= 0
      or v_currency is null or v_currency !~ '^[a-z]{3}$'
    then
      v_ignore_reason := 'bound_financial_authority_missing';
    end if;
  end if;

  if v_ignore_reason is null and v_is_active then
    if public."revenuecat_authority_quarantined_internal"(
      v_provider_key,p_user_id,v_environment
    ) then
      v_ignore_reason := 'revenuecat_terminal_authority_quarantined';
    elsif v_is_subscription and not v_is_initial
      and v_event_type in ('RENEWAL','UNCANCELLATION','PRODUCT_CHANGE')
      and not public."wave1_user_account_provider_authorized_internal"(v_intent."user_id")
    then
      v_ignore_reason := 'subscription_account_authority_not_current';
    elsif (not v_is_subscription or v_is_initial)
      and not public."money_purchase_intent_session_authorized_internal"(
        v_intent."user_id",v_intent."session_generation"
      )
    then
      v_ignore_reason := 'purchase_intent_session_authority_not_current';
    elsif public."is_account_access_restricted"(p_user_id::text) then
      v_ignore_reason := 'buyer_account_restricted';
    elsif v_intent."creator_id" is null
      or public."is_account_access_restricted"(v_intent."creator_id"::text)
      or not public."wave1_user_has_active_legal_requirements_internal"(v_intent."creator_id", 'creator_money')
      or not exists (
        select 1
        from public."wave1_creator_eligibility" eligibility
        where eligibility."creator_user_id" = v_intent."creator_id"
          and eligibility."state" = 'VERIFIED'
          and eligibility."account_status" = 'ACTIVE'
          and eligibility."age_18_plus"
          and eligibility."legal_accepted"
          and eligibility."creator_role"
          and eligibility."moderation_state" = 'CLEAR'
          and eligibility."market" = 'UNITED_STATES'
          and eligibility."rollout_eligible"
          and eligibility."platform_capability"
          and eligibility."provider_eligible"
          and eligibility."kyc_complete"
          and eligibility."tax_complete"
          and eligibility."sanctions_clear"
          and eligibility."payout_eligible"
      )
    then
      v_ignore_reason := case when v_mapping."concept" = 'seat_pass'
        then 'seat_pass_creator_authority_required'
        else 'creator_no_longer_verified_for_production_money' end;
    end if;
  end if;

  if v_ignore_reason is null and v_link."last_provider_event_id" is not null then
    if v_link."terminal" and not v_is_access_terminal then
      v_ignore_reason := 'terminal_original_transaction_cannot_reopen';
    elsif (
      v_link."last_occurred_at" > v_authority_occurred_at
      or (v_link."last_occurred_at" = v_authority_occurred_at and v_link."last_event_rank" > v_event_rank)
      or (v_link."last_occurred_at" = v_authority_occurred_at and v_link."last_event_rank" = v_event_rank
        and v_link."last_event_type" is not null
        and (select prior."provider_event_id" from public."provider_events" prior where prior."id" = v_link."last_provider_event_id") collate "C" > v_event_id collate "C")
    ) then
      v_ignore_reason := 'stale_provider_authority_event';
    end if;
  end if;

  if v_ignore_reason is not null then
    if v_is_initial and v_original_transaction is not null and v_link."provider" is null then
      insert into public."revenuecat_unbound_initial_authority" (
        "provider","original_transaction_id","user_id","provider_product_id","environment",
        "first_provider_event_id","first_ignore_reason"
      ) values (
        v_provider_key,v_original_transaction,p_user_id,v_provider_product_id,v_environment,
        v_provider."id",left(v_ignore_reason,160)
      )
      on conflict ("provider","original_transaction_id") do nothing;
    end if;
    update public."provider_events"
    set "status" = 'ignored',
        "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
          'final_reason',v_ignore_reason,
          'authority_granted',false,
          'payout_ready',false,
          'live_money_action',false,
          'provider_reconciliation_required',v_is_active and v_ignore_reason in (
            'purchase_intent_session_authority_not_current',
            'subscription_account_authority_not_current'
          ),
          'provider_reconciliation_disposition',case
            when v_is_active and v_ignore_reason in (
              'purchase_intent_session_authority_not_current',
              'subscription_account_authority_not_current'
            ) then 'refund_or_authoritative_provider_reconciliation_required'
            else 'not_required'
          end
        )
    where "id" = v_provider."id"
    returning * into v_provider;
    return jsonb_build_object(
      'status','ignored','reason',v_ignore_reason,'productKey',v_product."product_key",
      'productType',v_product."product_type",'providerEventId',v_provider."id",
      'accessGrantId',null,'ledgerEventId',null,'purchaseIntentId',v_intent."id",
      'environment',v_environment,'payableState','not_payable','grantStatus','blocked',
      'duplicateProviderEvent',v_provider_count = 1,'duplicateAccessGrant',false,'duplicateLedgerEvent',false
    );
  end if;

  v_retain_subscription_access := v_is_subscription
    and v_event_type in ('CANCELLATION','BILLING_ISSUE')
    and p_expires_at is not null
    and p_expires_at > v_now;
  v_grant_status := case
    when v_event_type = 'REFUND' then 'refunded'
    when v_event_type in ('REVOCATION','SUBSCRIPTION_PAUSED') then 'revoked'
    when v_event_type = 'EXPIRATION' then 'expired'
    when v_event_type = 'CANCELLATION' and not v_retain_subscription_access then 'expired'
    when v_event_type = 'BILLING_ISSUE' and not v_retain_subscription_access then 'blocked'
    when v_environment = 'production' then 'active'
    else 'sandbox_only' end;
  v_payable_state := case
    when v_event_type = 'REFUND' then 'refunded'
    when v_event_type = 'REVOCATION' then 'reversed'
    when v_environment = 'production' and v_is_active then 'pending_verification'
    else 'not_payable' end;
  v_ledger_status := case
    when v_event_type = 'REFUND' then 'refunded'
    when v_event_type = 'REVOCATION' then 'reversed'
    when v_environment = 'production' and v_is_active then 'verified'
    when v_event_type = 'BILLING_ISSUE' then 'pending'
    when v_event_type in ('EXPIRATION','CANCELLATION','SUBSCRIPTION_PAUSED') then 'ignored'
    else 'sandbox_only' end;
  v_provider_status := case
    when v_event_type = 'REFUND' then 'refunded'
    when v_event_type in ('REVOCATION','SUBSCRIPTION_PAUSED') then 'reversed'
    else 'processed' end;

  select ledger.* into v_ledger
  from public."money_access_ledger_events" ledger
  where ledger."provider_event_id" = v_provider."id"
  order by ledger."created_at", ledger."id"
  limit 1;
  if v_ledger."id" is null then
    insert into public."money_access_ledger_events" (
      "user_id","creator_id","platform_id","product_id","provider_event_id","event_type",
      "amount_minor","currency","environment","payable_state","status","source_type","source_id","metadata"
    ) values (
      p_user_id,v_intent."creator_id",v_intent."platform_id",v_product."id",v_provider."id",v_event_type,
      v_event_amount,v_currency,v_environment,v_payable_state,v_ledger_status,v_intent."source_type",v_intent."source_id",
      jsonb_build_object(
        'product_key',v_product."product_key",
        'purchase_intent_id',v_intent."id",
        'provider_product_id',v_provider_product_id,
        'original_transaction_id',v_original_transaction,
        'reported_amount_minor',p_amount_minor,
        'reported_currency',nullif(v_reported_currency,''),
        'reference_price_minor',v_mapping."reference_price_minor",
        'reference_currency',v_mapping."reference_currency",
        'localized_storefront_price',p_amount_minor is distinct from v_mapping."reference_price_minor" or v_reported_currency is distinct from v_mapping."reference_currency",
        'sandbox_only',v_environment = 'sandbox',
        'production_money',v_environment = 'production',
        'not_payable',v_payable_state = 'not_payable',
        'payout_readiness_proved',false,
        'live_money_enabled_at_verification',v_environment = 'production' and v_live_state = 'on',
        'requires_settlement_before_payable',true
      )
    ) returning * into v_ledger;
  else
    v_duplicate_ledger := true;
  end if;

  if v_grant_type is not null then
    select grant_row.* into v_grant
    from public."access_grants" grant_row
    where grant_row."user_id" = p_user_id
      and grant_row."product_id" = v_product."id"
      and grant_row."grant_type" = v_grant_type
      and grant_row."source_id" = v_intent."source_id"
      and grant_row."metadata"->>'purchase_intent_id' = v_intent."id"::text
    order by grant_row."created_at", grant_row."id"
    limit 1
    for update;
    if v_grant."id" is null and v_is_active then
      insert into public."access_grants" (
        "user_id","grant_type","source_type","source_id","product_id","provider","provider_event_id",
        "environment","status","starts_at","expires_at","metadata"
      ) values (
        p_user_id,v_grant_type,'provider_event',v_intent."source_id",v_product."id",v_provider_key,v_provider."id",
        v_environment,v_grant_status,v_occurred_at,p_expires_at,
        jsonb_build_object(
          'product_key',v_product."product_key",
          'purchase_intent_id',v_intent."id",
          'provider_product_id',v_provider_product_id,
          'original_transaction_id',v_original_transaction,
          'viewer_access_only',true,
          'authority_granted',false,
          'speaker_authority',false,
          'moderator_authority',false,
          'payout_access',false,
          'premium_unlock',false,
          'creator_specific_vip_only',v_mapping."concept" = 'vip_pass',
          'production_money',v_environment = 'production'
        )
      ) returning * into v_grant;
    elsif v_grant."id" is not null then
      v_duplicate_grant := true;
      update public."access_grants"
      set "provider_event_id" = v_provider."id",
          "status" = v_grant_status,
          "expires_at" = case
            when v_is_subscription and v_grant_status in ('active','sandbox_only') then p_expires_at
            when p_expires_at is not null then p_expires_at
            else "expires_at" end,
          "refunded_at" = case when v_event_type = 'REFUND' then v_occurred_at else null end,
          "revoked_at" = case when v_grant_status in ('refunded','revoked','expired','blocked') then v_occurred_at else null end,
          "revoke_reason" = case when v_grant_status in ('refunded','revoked','expired','blocked') then 'RevenueCat ' || lower(v_event_type) || ' event.' else null end,
          "metadata" = (((coalesce("metadata", '{}'::jsonb)
            - 'grants_livekit_publish' - 'grants_host_power' - 'grants_admin_power' - 'grants_payout_access')
            || jsonb_build_object(
              'latest_provider_event_id',v_provider."id",
              'original_transaction_id',v_original_transaction,
              'viewer_access_only',true,
              'authority_granted',false,
              'speaker_authority',false,
              'moderator_authority',false,
              'payout_access',false,
              'premium_unlock',false,
              'production_money',v_environment = 'production'
            ))),
          "updated_at" = v_now
      where "id" = v_grant."id"
      returning * into v_grant;
    end if;
  end if;

  if v_is_active and v_intent."status" = 'pending' then
    update public."money_purchase_intents"
    set "status" = 'consumed',
        "consumed_at" = v_now,
        "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
          'consumed_by_provider_event_id',v_provider."id",
          'original_transaction_id',v_original_transaction,
          'sandbox_only',v_environment = 'sandbox',
          'production_money',v_environment = 'production',
          'not_payable',true,
          'requires_settlement_before_payable',true
        ),
        "updated_at" = v_now
    where "id" = v_intent."id";
  elsif v_is_financial_terminal then
    update public."money_purchase_intents"
    set "status" = 'revoked',
        "revoked_at" = v_occurred_at,
        "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
          'revoked_by_provider_event_id',v_provider."id",
          'not_payable',true
        ),
        "updated_at" = v_now
    where "id" = v_intent."id"
      and "status" in ('consumed','revoked');
  end if;

  if v_is_initial then
    insert into public."revenuecat_consumable_transaction_intents" (
      "provider","original_transaction_id","user_id","product_id","purchase_intent_id","provider_event_id",
      "last_provider_event_id","last_occurred_at","last_event_type","last_event_rank","terminal","binding_state"
    ) values (
      v_provider_key,v_original_transaction,p_user_id,v_product."id",v_intent."id",v_provider."id",
      v_provider."id",v_authority_occurred_at,v_event_type,v_event_rank,v_is_access_terminal,'exact'
    ) returning * into v_link;
  else
    update public."revenuecat_consumable_transaction_intents"
    set "last_provider_event_id" = v_provider."id",
        "last_occurred_at" = v_authority_occurred_at,
        "last_event_type" = v_event_type,
        "last_event_rank" = v_event_rank,
        "terminal" = "terminal" or v_is_access_terminal
    where "provider" = v_provider_key
      and "original_transaction_id" = v_original_transaction
      and "binding_state" = 'exact'
    returning * into v_link;
  end if;

  update public."provider_events"
  set "status" = v_provider_status,
      "occurred_at" = v_occurred_at,
      "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'final_reason',case when v_grant_type is null then 'ledger_recorded_no_access_grant' else 'access_and_ledger_recorded' end,
        'purchase_intent_id',v_intent."id",
        'access_grant_id',v_grant."id",
        'ledger_event_id',v_ledger."id",
        'authority_granted',v_grant."id" is not null and v_grant."status" in ('active','sandbox_only'),
        'payout_ready',false,
        'live_money_action',false
      ))
  where "id" = v_provider."id"
  returning * into v_provider;

  -- Refresh after the ledger normalization and subscription projection triggers.
  select ledger.* into v_ledger from public."money_access_ledger_events" ledger where ledger."id" = v_ledger."id";
  return jsonb_build_object(
    'status','processed',
    'reason',case when v_grant_type is null then 'ledger_recorded_no_access_grant' else 'access_and_ledger_recorded' end,
    'productKey',v_product."product_key",'productType',v_product."product_type",
    'providerEventId',v_provider."id",'accessGrantId',v_grant."id",'ledgerEventId',v_ledger."id",
    'purchaseIntentId',v_intent."id",'environment',v_environment,'payableState',v_ledger."payable_state",
    'ledgerStatus',v_ledger."status",'grantStatus',coalesce(v_grant."status",'blocked'),
    'duplicateProviderEvent',v_provider_count = 1,'duplicateAccessGrant',v_duplicate_grant,'duplicateLedgerEvent',v_duplicate_ledger
  );
end;
$$;

create or replace function public."process_revenuecat_consumable_event_atomic"(
  p_provider_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_provider_product_id text,
  p_environment text,
  p_occurred_at timestamptz,
  p_expires_at timestamptz,
  p_amount_minor integer,
  p_currency text,
  p_raw_payload_hash text,
  p_original_transaction_id text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public."process_revenuecat_consumable_event_provider_internal"(
    p_provider_event_id,p_event_type,p_user_id,p_provider_product_id,p_environment,
    p_occurred_at,p_expires_at,p_amount_minor,p_currency,p_raw_payload_hash,
    p_original_transaction_id,'revenuecat_app_store','ios','app_store',
    'revenuecat_app_store_enabled',null
  );
$$;

create or replace function public."process_revenuecat_google_play_event_atomic"(
  p_provider_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_provider_product_id text,
  p_environment text,
  p_occurred_at timestamptz,
  p_expires_at timestamptz,
  p_amount_minor integer,
  p_currency text,
  p_raw_payload_hash text,
  p_original_transaction_id text,
  p_input_reason text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public."process_revenuecat_consumable_event_provider_internal"(
    p_provider_event_id,p_event_type,p_user_id,p_provider_product_id,p_environment,
    p_occurred_at,p_expires_at,p_amount_minor,p_currency,p_raw_payload_hash,
    p_original_transaction_id,'revenuecat_google_play','android','google_play',
    'revenuecat_google_play_enabled',p_input_reason
  );
$$;

create or replace function public."process_revenuecat_app_store_event_atomic"(
  p_provider_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_provider_product_id text,
  p_environment text,
  p_occurred_at timestamptz,
  p_expires_at timestamptz,
  p_amount_minor integer,
  p_currency text,
  p_raw_payload_hash text,
  p_original_transaction_id text,
  p_input_reason text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public."process_revenuecat_consumable_event_provider_internal"(
    p_provider_event_id,p_event_type,p_user_id,p_provider_product_id,p_environment,
    p_occurred_at,p_expires_at,p_amount_minor,p_currency,p_raw_payload_hash,
    p_original_transaction_id,'revenuecat_app_store','ios','app_store',
    'revenuecat_app_store_enabled',p_input_reason
  );
$$;

revoke all on function public."process_revenuecat_consumable_event_provider_internal"(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function public."process_revenuecat_consumable_event_atomic_v1"(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text) from public, anon, authenticated, service_role;
revoke all on function public."process_revenuecat_consumable_event_atomic"(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text) from public, anon, authenticated, service_role;
revoke all on function public."process_revenuecat_google_play_event_atomic"(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function public."process_revenuecat_app_store_event_atomic"(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public."process_revenuecat_consumable_event_atomic"(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text) to service_role;
grant execute on function public."process_revenuecat_google_play_event_atomic"(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text) to service_role;
grant execute on function public."process_revenuecat_app_store_event_atomic"(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text) to service_role;
comment on function public."process_revenuecat_consumable_event_atomic"(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text) is
  'Exact original-transaction-bound, monotonic creator-money processing. Every well-formed delivery is finalized; production grants remain proof/switch gated and earnings remain pending settlement.';
comment on function public."process_revenuecat_google_play_event_atomic"(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text) is
  'Service-only Google Play RevenueCat processing with exact original-transaction binding, provider finalization, monotonic lifecycle authority, and no webhook-side read/update race.';
comment on function public."process_revenuecat_app_store_event_atomic"(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text) is
  'Service-only App Store RevenueCat processing with explicit malformed-input reason support, exact original-transaction binding, provider finalization, and monotonic lifecycle authority. The historical 11-argument RPC remains a compatibility wrapper.';

-- A missing/conflicting product signal is not allowed to choose the authority
-- domain in the webhook.  Every access-removing RevenueCat lifecycle delivery
-- is serialized here by global event id and exact store original transaction,
-- then dispatched to exactly one durable Premium or creator-money binding.  A
-- missing or ambiguous binding is consumed as ignored and leaves a fail-closed
-- original-transaction watermark; it is never resolved by a latest-row guess.
create or replace function public."process_revenuecat_terminal_event_atomic"(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_reported_provider_product_id text,
  p_reported_provider_base_plan_id text,
  p_environment text,
  p_entitlement_status text,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_occurred_at timestamptz,
  p_raw_payload_hash text,
  p_period_type text,
  p_store text,
  p_platform text,
  p_original_transaction_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz:=timezone('utc'::text,now());
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_event_id text:=trim(coalesce(p_provider_event_id,''));
  v_event_type text:=upper(trim(coalesce(p_event_type,'')));
  v_environment text:=lower(trim(coalesce(p_environment,'')));
  v_status text:=lower(trim(coalesce(p_entitlement_status,'')));
  v_original text:=trim(coalesce(p_original_transaction_id,''));
  v_reported_product text:=nullif(trim(coalesce(p_reported_provider_product_id,'')),'');
  v_reported_base_plan text:=nullif(trim(coalesce(p_reported_provider_base_plan_id,'')),'');
  v_store text:=lower(trim(coalesce(p_store,'')));
  v_platform text:=lower(trim(coalesce(p_platform,'')));
  v_occurred_at timestamptz:=least(coalesce(p_occurred_at,v_now),v_now);
  v_event_rank smallint:=public."revenuecat_premium_authority_rank_internal"(v_event_type,false);
  v_premium_count integer:=0;
  v_creator_count integer:=0;
  v_cross_provider_count integer:=0;
  v_existing_count integer:=0;
  v_reason text;
  v_domain text;
  v_retain boolean:=false;
  v_current_original text;
  v_entitlement_status text;
  v_grant_status text;
  v_provider_status text;
  v_event public."provider_events"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_premium public."revenuecat_premium_transaction_authority"%rowtype;
  v_creator public."revenuecat_consumable_transaction_intents"%rowtype;
  v_intent public."money_purchase_intents"%rowtype;
  v_entitlement public."user_entitlements"%rowtype;
  v_grant public."access_grants"%rowtype;
  v_result jsonb;
begin
  if v_provider not in ('revenuecat_app_store','revenuecat_google_play')
    or v_event_id='' or length(v_event_id)>512
    or v_event_id is distinct from coalesce(p_provider_event_id,'')
    or v_event_id ~ '[[:cntrl:]]'
    or p_user_id is null
    or v_event_type not in (
      'CANCELLATION','BILLING_ISSUE','EXPIRATION','REFUND','REVOCATION','SUBSCRIPTION_PAUSED'
    )
    or v_environment not in ('sandbox','production')
    or v_original='' or length(v_original)>512
    or v_original is distinct from coalesce(p_original_transaction_id,'')
    or v_original ~ '[[:cntrl:]]'
    or coalesce(p_raw_payload_hash,'') !~ '^[0-9a-f]{64}$'
    or not (
      (v_provider='revenuecat_app_store' and v_store='app_store' and v_platform='ios')
      or (v_provider='revenuecat_google_play' and v_store='google_play' and v_platform='android')
    )
  then
    raise exception 'revenuecat_terminal_dispatch_identity_invalid';
  end if;
  if (v_reported_product is not null and (
      length(v_reported_product)>512 or v_reported_product ~ '[[:cntrl:]]'
    )) or (v_reported_base_plan is not null and (
      length(v_reported_base_plan)>512 or v_reported_base_plan ~ '[[:cntrl:]]'
    ))
  then
    raise exception 'revenuecat_terminal_dispatch_product_identity_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium-event-id:'||v_event_id,0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-original:'||v_provider||':'||v_original,0
  ));

  select count(*)::integer into v_existing_count
  from public."provider_events" event
  where event."provider" in ('revenuecat','revenuecat_app_store','revenuecat_google_play')
    and event."provider_event_id"=v_event_id;
  if v_existing_count>1 then
    raise exception 'revenuecat_terminal_dispatch_event_identity_ambiguous';
  elsif v_existing_count=1 then
    select event.* into v_event
    from public."provider_events" event
    where event."provider" in ('revenuecat','revenuecat_app_store','revenuecat_google_play')
      and event."provider_event_id"=v_event_id
    for update;
    if v_event."provider" is distinct from v_provider
      or v_event."event_type" is distinct from v_event_type
      or v_event."user_id" is distinct from p_user_id
      or v_event."environment" is distinct from v_environment
      or v_event."raw_payload_hash" is distinct from p_raw_payload_hash
      or v_event."metadata"->>'original_transaction_id' is distinct from v_original
    then
      raise exception 'revenuecat_terminal_dispatch_event_identity_mismatch';
    end if;
    perform public."resolve_revenuecat_terminal_quarantine_internal"(
      v_provider,p_user_id,v_environment,v_event."id"
    );
    return jsonb_build_object(
      'status',v_event."status",'reason',coalesce(v_event."metadata"->>'final_reason','duplicate_terminal_event'),
      'domain',coalesce(v_event."metadata"->>'terminal_dispatch_domain','ambiguous'),
      'providerEventId',v_event."id",'originalTransactionId',v_original,
      'duplicateEvent',true,'authorityGranted',false
    );
  end if;

  select count(*)::integer into v_premium_count
  from public."revenuecat_premium_transaction_authority" authority
  where authority."provider"=v_provider and authority."original_transaction_id"=v_original;
  select count(*)::integer into v_creator_count
  from public."revenuecat_consumable_transaction_intents" authority
  where authority."provider"=v_provider and authority."original_transaction_id"=v_original;

  select (
    (select count(*) from public."revenuecat_premium_transaction_authority" authority
      where authority."provider"<>v_provider and authority."original_transaction_id"=v_original)
    +
    (select count(*) from public."revenuecat_consumable_transaction_intents" authority
      where authority."provider"<>v_provider and authority."original_transaction_id"=v_original)
  )::integer into v_cross_provider_count;

  if v_premium_count+v_creator_count=0 and v_cross_provider_count>0 then
    v_reason:='terminal_dispatch_cross_provider_binding_mismatch';
  elsif v_premium_count+v_creator_count=0 then
    v_reason:='terminal_dispatch_binding_missing';
  elsif v_premium_count>1 or v_creator_count>1 or (v_premium_count=1 and v_creator_count=1) then
    v_reason:='terminal_dispatch_binding_ambiguous';
  elsif v_premium_count=1 then
    select authority.* into v_premium
    from public."revenuecat_premium_transaction_authority" authority
    where authority."provider"=v_provider and authority."original_transaction_id"=v_original
    for update;
    if v_premium."user_id" is distinct from p_user_id
      or v_premium."environment" is distinct from v_environment
    then
      v_reason:='terminal_dispatch_subject_or_environment_mismatch';
    elsif v_premium."current_product_id" is null then
      v_reason:='terminal_dispatch_premium_binding_non_authoritative';
    else
      v_domain:='premium';
    end if;
  else
    select authority.* into v_creator
    from public."revenuecat_consumable_transaction_intents" authority
    where authority."provider"=v_provider and authority."original_transaction_id"=v_original
    for update;
    if v_creator."binding_state"<>'exact' then
      v_reason:='terminal_dispatch_creator_binding_ambiguous';
    else
      select intent.* into v_intent
      from public."money_purchase_intents" intent
      where intent."id"=v_creator."purchase_intent_id"
      for update;
      if v_creator."user_id" is distinct from p_user_id
        or v_intent."id" is null
        or v_intent."user_id" is distinct from p_user_id
        or v_intent."environment" is distinct from v_environment
        or v_intent."provider" is distinct from v_provider
        or v_intent."product_id" is distinct from v_creator."product_id"
      then
        v_reason:='terminal_dispatch_subject_or_environment_mismatch';
      else
        v_domain:='creator_money';
      end if;
    end if;
  end if;

  if v_reason is not null then
    if v_reason='terminal_dispatch_cross_provider_binding_mismatch' then
      perform public."quarantine_revenuecat_terminal_authority"(
        'revenuecat',v_event_id,v_event_type,null,null,p_raw_payload_hash,
        'terminal_cross_provider_original_mismatch'
      );
    elsif v_reason='terminal_dispatch_subject_or_environment_mismatch' then
      if v_premium."id" is not null then
        perform public."quarantine_revenuecat_terminal_authority"(
          v_provider,v_event_id,v_event_type,v_premium."user_id",v_premium."environment",
          p_raw_payload_hash,'terminal_bound_subject_or_environment_mismatch'
        );
      elsif v_creator."provider" is not null and v_intent."id" is not null then
        perform public."quarantine_revenuecat_terminal_authority"(
          v_provider,v_event_id,v_event_type,v_creator."user_id",v_intent."environment",
          p_raw_payload_hash,'terminal_bound_subject_or_environment_mismatch'
        );
      end if;
    end if;
    insert into public."provider_events" (
      "provider_event_id","provider","product_id","product_key","user_id","app_user_id",
      "environment","event_type","status","occurred_at","idempotency_key","raw_payload_hash","metadata"
    ) values (
      v_event_id,v_provider,null,null,p_user_id,p_user_id::text,v_environment,v_event_type,'ignored',
      v_occurred_at,v_event_type||':'||v_event_id,p_raw_payload_hash,jsonb_strip_nulls(jsonb_build_object(
        'provider_payload_stored',false,'original_transaction_id',v_original,
        'reported_provider_product_id',v_reported_product,
        'reported_provider_base_plan_id',v_reported_base_plan,
        'terminal_dispatch_domain',case when v_reason like '%ambiguous%' then 'ambiguous' else 'missing' end,
        'final_reason',v_reason,'authority_granted',false,'money_action',false,'payout_ready',false
      ))
    ) returning * into v_event;
    if v_reason in ('terminal_dispatch_binding_missing','terminal_dispatch_binding_ambiguous') then
      insert into public."revenuecat_unbound_terminal_authority" (
        "provider","original_transaction_id","user_id","provider_product_id","environment",
        "last_provider_event_id","last_occurred_at","last_event_type","last_event_rank"
      ) values (
        v_provider,v_original,p_user_id,coalesce(v_reported_product,'<missing-or-ambiguous>'),v_environment,
        v_event."id",v_occurred_at,v_event_type,v_event_rank
      ) on conflict ("provider","original_transaction_id") do nothing;
    end if;
    if v_premium."id" is not null and v_reason='terminal_dispatch_premium_binding_non_authoritative'
      and (
        v_occurred_at,v_event_rank,v_event_id collate "C"
      )>(
        v_premium."latest_occurred_at",v_premium."latest_event_rank",v_premium."latest_event_id" collate "C"
      )
    then
      update public."revenuecat_premium_transaction_authority"
      set "latest_event_id"=v_event_id,"latest_event_hash"=p_raw_payload_hash,
          "latest_event_type"=v_event_type,"latest_occurred_at"=v_occurred_at,
          "latest_event_rank"=v_event_rank,"authority_state"=case
            when v_event_type in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED') then 'financial_terminal'
            when v_event_type='EXPIRATION' then 'expired' else 'blocked' end,
          "updated_at"=v_now
      where "id"=v_premium."id";
    end if;
    return jsonb_build_object(
      'status','ignored','reason',v_reason,'domain',coalesce(v_event."metadata"->>'terminal_dispatch_domain','missing'),
      'providerEventId',v_event."id",'originalTransactionId',v_original,
      'duplicateEvent',false,'authorityGranted',false
    );
  end if;

  if v_domain='creator_money' then
    select product.* into v_product
    from public."monetization_products" product
    where product."id"=v_intent."product_id";
    v_result:=public."process_revenuecat_consumable_event_provider_internal"(
      v_event_id,v_event_type,p_user_id,v_intent."provider_product_id",v_environment,
      p_occurred_at,p_expires_at,null,null,p_raw_payload_hash,v_original,
      v_provider,v_platform,v_store,
      case when v_provider='revenuecat_app_store' then 'revenuecat_app_store_enabled'
        else 'revenuecat_google_play_enabled' end,
      null
    );
    update public."provider_events" event
    set "metadata"=coalesce(event."metadata",'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(
      'terminal_dispatch_domain','creator_money',
      'reported_provider_product_id',v_reported_product,
      'reported_provider_base_plan_id',v_reported_base_plan,
      'reported_product_mismatch',v_reported_product is distinct from v_intent."provider_product_id"
    ))
    where event."provider"=v_provider and event."provider_event_id"=v_event_id;
    if nullif(v_result->>'providerEventId','') is not null then
      perform public."resolve_revenuecat_terminal_quarantine_internal"(
        v_provider,p_user_id,v_environment,(v_result->>'providerEventId')::uuid
      );
    end if;
    return v_result||jsonb_build_object(
      'domain','creator_money','originalTransactionId',v_original,'authorityGranted',false,
      'duplicateEvent',coalesce((v_result->>'duplicateProviderEvent')::boolean,false)
    );
  end if;

  -- Premium terminal projection deliberately uses only the durable bound
  -- product/original/subject. Current catalog status and money switches are
  -- activation controls and cannot prevent a refund/revocation/expiry from
  -- removing authority after the catalog changes.
  select product.* into v_product
  from public."monetization_products" product
  where product."id"=v_premium."current_product_id" and product."product_type"='premium_subscription';
  if v_product."id" is null then raise exception 'terminal_dispatch_bound_premium_product_missing'; end if;
  if (
    v_premium."latest_occurred_at",v_premium."latest_event_rank",v_premium."latest_event_id" collate "C"
  )>(v_occurred_at,v_event_rank,v_event_id collate "C") then
    v_reason:='terminal_dispatch_stale_premium_event';
  elsif v_premium."authority_state"='financial_terminal'
    and v_event_type not in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED')
  then
    v_reason:='terminal_dispatch_premium_financial_terminal_sticky';
  end if;

  select entitlement.* into v_entitlement
  from public."user_entitlements" entitlement
  where entitlement."user_id"=p_user_id::text and entitlement."entitlement_key"='premium'
  for update;
  if v_entitlement."user_id" is not null then
    select event."metadata"->>'original_transaction_id' into v_current_original
    from public."provider_events" event
    where event."provider_event_id"=v_entitlement."metadata"->>'revenuecat_event_id'
      and event."raw_payload_hash"=v_entitlement."metadata"->>'revenuecat_event_hash'
      and event."provider" in ('revenuecat','revenuecat_app_store','revenuecat_google_play')
    order by event."created_at",event."id" limit 1;
  end if;
  if v_reason is null and v_current_original is not null and v_current_original<>v_original then
    v_reason:='terminal_dispatch_prior_premium_transaction_not_current';
  end if;

  insert into public."provider_events" (
    "provider_event_id","provider","product_id","product_key","user_id","app_user_id",
    "environment","event_type","status","occurred_at","idempotency_key","raw_payload_hash","metadata"
  ) values (
    v_event_id,v_provider,v_product."id",v_product."product_key",p_user_id,p_user_id::text,
    v_environment,v_event_type,case when v_reason is null then case
      when v_event_type='REFUND' then 'refunded'
      when v_event_type in ('REVOCATION','SUBSCRIPTION_PAUSED') then 'reversed'
      else 'processed' end else 'ignored' end,
    v_occurred_at,v_event_type||':'||v_event_id,p_raw_payload_hash,jsonb_strip_nulls(jsonb_build_object(
      'provider_payload_stored',false,'original_transaction_id',v_original,
      'premium_transaction_binding_id',v_premium."id",
      'provider_product_id',v_premium."current_provider_product_id",
      'provider_base_plan_id',v_premium."current_provider_base_plan_id",
      'reported_provider_product_id',v_reported_product,
      'reported_provider_base_plan_id',v_reported_base_plan,
      'reported_product_mismatch',v_reported_product is distinct from v_premium."current_provider_product_id"
        or v_reported_base_plan is distinct from v_premium."current_provider_base_plan_id",
      'entitlement_key','premium','period_type',nullif(trim(coalesce(p_period_type,'')),''),
      'store',v_store,'platform',v_platform,'terminal_dispatch_domain','premium',
      'premium_authority_watermark',v_reason is null,
      'final_reason',coalesce(v_reason,'terminal_dispatch_premium_projected'),
      'authority_granted',false,'money_action',false,'payout_ready',false
    ))
  ) returning * into v_event;

  if v_reason is null then
    v_retain:=v_entitlement."user_id" is not null and v_current_original=v_original and (
      (v_event_type='CANCELLATION' and v_status='active')
      or (v_event_type='BILLING_ISSUE' and v_status='grace_period')
    ) and p_starts_at is not null and p_expires_at is not null
      and p_starts_at=v_entitlement."starts_at" and p_expires_at=v_entitlement."expires_at"
      and p_starts_at<=v_now and p_expires_at>v_now;
    v_entitlement_status:=case
      when v_event_type in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED') then 'revoked'
      when v_event_type='EXPIRATION' then 'expired'
      when v_event_type='CANCELLATION' and v_retain then 'active'
      when v_event_type='CANCELLATION' then 'canceled'
      when v_event_type='BILLING_ISSUE' and v_retain then 'grace_period'
      else 'pending' end;
    v_grant_status:=case
      when v_event_type='REFUND' then 'refunded'
      when v_event_type in ('REVOCATION','SUBSCRIPTION_PAUSED') then 'revoked'
      when v_event_type in ('EXPIRATION','CANCELLATION') and not v_retain then 'expired'
      when v_event_type='BILLING_ISSUE' and not v_retain then 'blocked'
      when v_environment='production' then 'active' else 'sandbox_only' end;
    if v_entitlement."user_id" is not null and v_current_original=v_original then
      update public."user_entitlements"
      set "status"=v_entitlement_status,
          "revoked_at"=case when v_entitlement_status='revoked' then v_occurred_at else null end,
          "updated_at"=v_now,
          "metadata"=coalesce("metadata",'{}'::jsonb)||jsonb_build_object(
            'revenuecat_event_id',v_event_id,'revenuecat_event_hash',p_raw_payload_hash,
            'revenuecat_event_type',v_event_type,'environment',v_environment,
            'original_transaction_id',v_original,'authority_granted',v_retain
          )
      where "user_id"=p_user_id::text and "entitlement_key"='premium';
      select grant_row.* into v_grant
      from public."access_grants" grant_row
      where grant_row."user_id"=p_user_id and grant_row."grant_type"='premium'
        and grant_row."product_id"=v_product."id"
      order by grant_row."updated_at" desc,grant_row."id" desc limit 1
      for update;
      if v_grant."id" is not null then
        update public."access_grants"
        set "provider_event_id"=v_event."id","status"=v_grant_status,
            "refunded_at"=case when v_event_type='REFUND' then v_occurred_at else null end,
            "revoked_at"=case when v_grant_status in ('refunded','revoked','expired','blocked') then v_occurred_at else null end,
            "revoke_reason"=case when v_grant_status in ('refunded','revoked','expired','blocked')
              then 'RevenueCat '||lower(v_event_type)||' terminal dispatch.' else null end,
            "updated_at"=v_now,
            "metadata"=coalesce("metadata",'{}'::jsonb)||jsonb_build_object(
              'latest_provider_event_id',v_event."id",'original_transaction_id',v_original,
              'terminal_dispatch_domain','premium','authority_granted',v_retain
            )
        where "id"=v_grant."id";
      end if;
    end if;
    update public."revenuecat_premium_transaction_authority"
    set "latest_event_id"=v_event_id,"latest_event_hash"=p_raw_payload_hash,
        "latest_event_type"=v_event_type,"latest_occurred_at"=v_occurred_at,
        "latest_event_rank"=v_event_rank,"authority_state"=case
          when v_event_type in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED') then 'financial_terminal'
          when v_event_type='EXPIRATION' then 'expired'
          when v_retain then 'retained' else 'blocked' end,
        "updated_at"=v_now
    where "id"=v_premium."id";
    perform public."resolve_revenuecat_terminal_quarantine_internal"(
      v_provider,p_user_id,v_environment,v_event."id"
    );
  end if;
  return jsonb_build_object(
    'status',case when v_reason is null then v_event."status" else 'ignored' end,
    'reason',coalesce(v_reason,'terminal_dispatch_premium_projected'),'domain','premium',
    'providerEventId',v_event."id",'originalTransactionId',v_original,
    'transactionBindingId',v_premium."id",'entitlementStatus',case
      when v_reason is null then v_entitlement_status else 'unknown' end,
    'entitlementActive',v_reason is null and v_retain,
    'grantStatus',case when v_reason is null then coalesce(v_grant_status,'blocked') else 'blocked' end,
    'duplicateEvent',false,'authorityGranted',v_reason is null and v_retain
  );
end;
$$;
revoke all on function public."process_revenuecat_terminal_event_atomic"(
  text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,text,text
) from public,anon,authenticated,service_role;
grant execute on function public."process_revenuecat_terminal_event_atomic"(
  text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,text,text
) to service_role;
comment on function public."process_revenuecat_terminal_event_atomic"(
  text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,text,text
) is 'Service-only cross-domain RevenueCat removal dispatcher. Exact provider, original transaction, subject, environment, event identity/hash and unique Premium-versus-creator binding are required; no current catalog signal or latest-row guess chooses the authority domain.';

-- Compatibility entry points also use the neutral terminal dispatcher. A
-- service caller cannot bypass cross-domain binding merely by choosing the old
-- creator-money RPC name for a refund/revocation/cancel/expiry delivery.
create or replace function public."process_revenuecat_google_play_event_atomic"(
  p_provider_event_id text,p_event_type text,p_user_id uuid,p_provider_product_id text,
  p_environment text,p_occurred_at timestamptz,p_expires_at timestamptz,
  p_amount_minor integer,p_currency text,p_raw_payload_hash text,
  p_original_transaction_id text,p_input_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if upper(trim(coalesce(p_event_type,''))) in (
    'CANCELLATION','BILLING_ISSUE','EXPIRATION','REFUND','REVOCATION','SUBSCRIPTION_PAUSED'
  ) then
    return public."process_revenuecat_terminal_event_atomic"(
      'revenuecat_google_play',p_provider_event_id,p_event_type,p_user_id,p_provider_product_id,null,
      p_environment,case upper(trim(coalesce(p_event_type,'')))
        when 'REFUND' then 'revoked' when 'REVOCATION' then 'revoked'
        when 'SUBSCRIPTION_PAUSED' then 'revoked' when 'EXPIRATION' then 'expired'
        when 'CANCELLATION' then 'canceled' else 'pending' end,
      null,p_expires_at,p_occurred_at,p_raw_payload_hash,null,'google_play','android',p_original_transaction_id
    );
  end if;
  return public."process_revenuecat_consumable_event_provider_internal"(
    p_provider_event_id,p_event_type,p_user_id,p_provider_product_id,p_environment,
    p_occurred_at,p_expires_at,p_amount_minor,p_currency,p_raw_payload_hash,
    p_original_transaction_id,'revenuecat_google_play','android','google_play',
    'revenuecat_google_play_enabled',p_input_reason
  );
end;
$$;

create or replace function public."process_revenuecat_app_store_event_atomic"(
  p_provider_event_id text,p_event_type text,p_user_id uuid,p_provider_product_id text,
  p_environment text,p_occurred_at timestamptz,p_expires_at timestamptz,
  p_amount_minor integer,p_currency text,p_raw_payload_hash text,
  p_original_transaction_id text,p_input_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if upper(trim(coalesce(p_event_type,''))) in (
    'CANCELLATION','BILLING_ISSUE','EXPIRATION','REFUND','REVOCATION','SUBSCRIPTION_PAUSED'
  ) then
    return public."process_revenuecat_terminal_event_atomic"(
      'revenuecat_app_store',p_provider_event_id,p_event_type,p_user_id,p_provider_product_id,null,
      p_environment,case upper(trim(coalesce(p_event_type,'')))
        when 'REFUND' then 'revoked' when 'REVOCATION' then 'revoked'
        when 'SUBSCRIPTION_PAUSED' then 'revoked' when 'EXPIRATION' then 'expired'
        when 'CANCELLATION' then 'canceled' else 'pending' end,
      null,p_expires_at,p_occurred_at,p_raw_payload_hash,null,'app_store','ios',p_original_transaction_id
    );
  end if;
  return public."process_revenuecat_consumable_event_provider_internal"(
    p_provider_event_id,p_event_type,p_user_id,p_provider_product_id,p_environment,
    p_occurred_at,p_expires_at,p_amount_minor,p_currency,p_raw_payload_hash,
    p_original_transaction_id,'revenuecat_app_store','ios','app_store',
    'revenuecat_app_store_enabled',p_input_reason
  );
end;
$$;

create or replace function public."process_revenuecat_consumable_event_atomic"(
  p_provider_event_id text,p_event_type text,p_user_id uuid,p_provider_product_id text,
  p_environment text,p_occurred_at timestamptz,p_expires_at timestamptz,
  p_amount_minor integer,p_currency text,p_raw_payload_hash text,p_original_transaction_id text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public."process_revenuecat_app_store_event_atomic"(
    p_provider_event_id,p_event_type,p_user_id,p_provider_product_id,p_environment,
    p_occurred_at,p_expires_at,p_amount_minor,p_currency,p_raw_payload_hash,
    p_original_transaction_id,null
  );
$$;

alter function public."finalize_creator_money_settlement"(uuid,integer,integer,text,integer)
  rename to "finalize_creator_money_settlement_pre_integrity_closeout";
create or replace function public."finalize_creator_money_settlement_provider_closeout_internal"(
  p_money_ledger_event_id uuid,
  p_creator_net_minor integer,
  p_provider_fee_minor integer,
  p_settlement_reference_hash text,
  p_hold_days integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_money public."money_access_ledger_events"%rowtype;
  v_provider public."provider_events"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_earning public."creator_earnings_ledger"%rowtype;
  v_now timestamptz:=timezone('utc'::text,now());
  v_hold_days integer;
  v_platform_fee integer;
  v_source_type text;
  v_live_state text;
begin
  if p_money_ledger_event_id is null then raise exception 'money_ledger_event_required'; end if;
  if p_creator_net_minor is null or p_creator_net_minor<0 then raise exception 'creator_net_invalid'; end if;
  if p_provider_fee_minor is null or p_provider_fee_minor<0 then raise exception 'provider_fee_invalid'; end if;
  if coalesce(p_settlement_reference_hash,'') !~ '^[0-9a-f]{64}$' then raise exception 'settlement_reference_hash_invalid'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('creator-money-settlement:'||p_money_ledger_event_id::text,0));
  select money.* into v_money from public."money_access_ledger_events" money
  where money."id"=p_money_ledger_event_id for update;
  if v_money."id" is null then raise exception 'money_ledger_event_not_found'; end if;
  if v_money."environment"<>'production' or v_money."status"<>'verified'
    or v_money."payable_state"<>'pending_verification' then raise exception 'money_ledger_event_not_settlement_eligible'; end if;
  if v_money."creator_id" is null or v_money."provider_event_id" is null or v_money."product_id" is null
    or nullif(v_money."metadata"->>'purchase_intent_id','') is null
    or nullif(v_money."metadata"->>'original_transaction_id','') is null
  then raise exception 'money_ledger_event_binding_incomplete'; end if;
  if p_creator_net_minor+p_provider_fee_minor>v_money."amount_minor" then raise exception 'settlement_amounts_exceed_gross'; end if;

  select provider_event.* into v_provider from public."provider_events" provider_event
  where provider_event."id"=v_money."provider_event_id" for update;
  if v_provider."id" is null
    or v_provider."provider" not in ('revenuecat_app_store','revenuecat_google_play')
    or v_provider."environment"<>'production' or v_provider."status"<>'processed'
    or v_provider."user_id" is distinct from v_money."user_id"
    or v_provider."product_id" is distinct from v_money."product_id"
    or v_provider."metadata"->>'purchase_intent_id' is distinct from v_money."metadata"->>'purchase_intent_id'
    or v_provider."metadata"->>'original_transaction_id' is distinct from v_money."metadata"->>'original_transaction_id'
  then raise exception 'provider_event_not_settlement_eligible'; end if;
  if public."revenuecat_authority_quarantined_internal"(
    v_provider."provider",v_provider."user_id",v_provider."environment"
  ) then
    raise exception 'revenuecat_terminal_authority_quarantined';
  end if;
  if not exists (
    select 1
    from public."revenuecat_consumable_transaction_intents" transaction_link
    join public."money_purchase_intents" intent on intent."id"=transaction_link."purchase_intent_id"
    where transaction_link."provider"=v_provider."provider"
      and transaction_link."original_transaction_id"=v_provider."metadata"->>'original_transaction_id'
      and transaction_link."binding_state"='exact' and not transaction_link."terminal"
      and intent."id"::text=v_provider."metadata"->>'purchase_intent_id'
      and intent."user_id"=v_money."user_id" and intent."creator_id"=v_money."creator_id"
      and intent."product_id"=v_money."product_id" and intent."source_type"=v_money."source_type"
      and intent."source_id"=v_money."source_id" and intent."provider"=v_provider."provider"
      and intent."provider_product_id"=v_provider."metadata"->>'provider_product_id'
      and intent."environment"='production' and intent."status"='consumed'
  ) then raise exception 'settlement_original_transaction_binding_invalid'; end if;
  select product.* into v_product from public."monetization_products" product where product."id"=v_money."product_id";
  if v_product."id" is null then raise exception 'settlement_product_missing'; end if;
  select "state" into v_live_state from public."platform_money_kill_switches" where "key"='live_money_enabled';
  if coalesce(v_live_state,'off')<>'on' then raise exception 'live_money_not_enabled_for_settlement'; end if;

  select coalesce(p_hold_days,"payout_hold_days_min") into v_hold_days
  from public."monetization_system_settings" where "id"=true;
  v_hold_days:=greatest(7,least(30,coalesce(v_hold_days,7)));
  v_platform_fee:=v_money."amount_minor"-p_provider_fee_minor-p_creator_net_minor;
  v_source_type:=public."creator_money_source_type_for_product"(v_product."product_type");
  if v_source_type='tip' and v_platform_fee<>0 then raise exception 'creator_tip_platform_fee_must_be_zero'; end if;

  select earning.* into v_earning from public."creator_earnings_ledger" earning
  where earning."money_ledger_event_id"=v_money."id" for update;
  if v_earning."id" is not null then
    if v_earning."settlement_reference_hash"<>p_settlement_reference_hash
      or v_earning."net_creator_amount_cents"<>p_creator_net_minor
      or v_earning."provider_fee_cents"<>p_provider_fee_minor
    then raise exception 'settlement_replay_mismatch'; end if;
    return jsonb_build_object('status','already_settled','earningsLedgerId',v_earning."id",
      'ledgerStatus',public."creator_earnings_current_state_internal"(v_earning."id"),'holdUntil',v_earning."hold_until");
  end if;
  insert into public."creator_earnings_ledger" (
    "creator_id","source_type","source_id","gross_amount_cents","platform_fee_cents","provider_fee_cents","tax_cents",
    "net_creator_amount_cents","currency","ledger_status","hold_until","metadata","provider_event_id","money_ledger_event_id",
    "settlement_reference_hash","updated_at"
  ) values (
    v_money."creator_id",v_source_type,v_money."source_id",v_money."amount_minor",v_platform_fee,p_provider_fee_minor,0,
    p_creator_net_minor,v_money."currency",'held',v_now+(v_hold_days||' days')::interval,
    jsonb_build_object('provider',v_provider."provider",'production_money',true,'provider_verified',true,
      'settlement_verified',true,'payout_ready',false,'hold_days',v_hold_days,
      'source_product_type',v_product."product_type",'original_transaction_bound',true),
    v_provider."id",v_money."id",p_settlement_reference_hash,v_now
  ) returning * into v_earning;
  update public."money_access_ledger_events"
  set "metadata"=coalesce("metadata",'{}'::jsonb)||jsonb_build_object(
    'settlement_verified',true,'settlement_reference_hash',p_settlement_reference_hash,
    'creator_earnings_ledger_id',v_earning."id",'creator_net_minor',p_creator_net_minor,
    'provider_fee_minor',p_provider_fee_minor,'platform_fee_minor',v_platform_fee,
    'settlement_provider',v_provider."provider",'payout_readiness_proved',false,
    'requires_settlement_before_payable',true
  ) where "id"=v_money."id";
  return jsonb_build_object('status','held','earningsLedgerId',v_earning."id",'holdUntil',v_earning."hold_until",
    'creatorNetMinor',p_creator_net_minor,'providerFeeMinor',p_provider_fee_minor,
    'platformFeeMinor',v_platform_fee,'provider',v_provider."provider");
end;
$$;
revoke all on function public."finalize_creator_money_settlement_provider_closeout_internal"(uuid,integer,integer,text,integer)
  from public,anon,authenticated,service_role;
create or replace function public."finalize_creator_money_settlement"(
  p_money_ledger_event_id uuid,
  p_creator_net_minor integer,
  p_provider_fee_minor integer,
  p_settlement_reference_hash text,
  p_hold_days integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator uuid;
  v_result jsonb;
  v_earnings_id uuid;
begin
  select money."creator_id" into v_creator
  from public."money_access_ledger_events" money
  where money."id" = p_money_ledger_event_id;
  if v_creator is null then raise exception 'money_ledger_event_binding_incomplete'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wave1-creator:' || v_creator::text, 0));
  if public."is_account_access_restricted"(v_creator::text)
    or not public."wave1_user_has_active_legal_requirements_internal"(v_creator, 'creator_money')
    or not exists (
      select 1
      from public."wave1_creator_eligibility" eligibility
      where eligibility."creator_user_id" = v_creator
        and eligibility."state" = 'VERIFIED'
        and eligibility."account_status" = 'ACTIVE'
        and eligibility."age_18_plus"
        and eligibility."legal_accepted"
        and eligibility."creator_role"
        and eligibility."moderation_state" = 'CLEAR'
        and eligibility."market" = 'UNITED_STATES'
        and eligibility."rollout_eligible"
        and eligibility."platform_capability"
        and eligibility."provider_eligible"
        and eligibility."kyc_complete"
        and eligibility."tax_complete"
        and eligibility."sanctions_clear"
        and eligibility."payout_eligible"
    )
  then
    raise exception 'creator_not_currently_settlement_eligible';
  end if;
  v_result := public."finalize_creator_money_settlement_provider_closeout_internal"(
    p_money_ledger_event_id,p_creator_net_minor,p_provider_fee_minor,
    p_settlement_reference_hash,p_hold_days
  );
  v_earnings_id := nullif(v_result->>'earningsLedgerId', '')::uuid;
  if v_earnings_id is not null then
    v_result := v_result || jsonb_build_object(
      'ledgerStatus',public."creator_earnings_current_state_internal"(v_earnings_id)
    );
  end if;
  return v_result;
end;
$$;
revoke all on function public."finalize_creator_money_settlement_pre_integrity_closeout"(uuid,integer,integer,text,integer) from public, anon, authenticated, service_role;
revoke all on function public."finalize_creator_money_settlement"(uuid,integer,integer,text,integer) from public, anon, authenticated;
grant execute on function public."finalize_creator_money_settlement"(uuid,integer,integer,text,integer) to service_role;
comment on function public."finalize_creator_money_settlement"(uuid,integer,integer,text,integer) is
  'Exact provider settlement plus current unrestricted, session-bound legal and complete Wave 1 creator eligibility checks. Creates immutable held earnings only; performs no payout.';

-- Settlement maturity projects AVAILABLE without mutating the immutable earnings
-- row. The money ledger remains the payable sink and is updated atomically with the
-- append-only projection event.
create or replace function public."release_mature_creator_money_settlements"(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc'::text, now());
  v_limit integer := greatest(1, least(500, coalesce(p_limit, 100)));
  v_live text;
  v_payouts text;
  v_connect text;
  v_row record;
  v_released integer := 0;
  v_blocked integer := 0;
begin
  select "state" into v_live from public."platform_money_kill_switches" where "key" = 'live_money_enabled';
  select "state" into v_payouts from public."platform_money_kill_switches" where "key" = 'payouts_enabled';
  select "state" into v_connect from public."platform_money_kill_switches" where "key" = 'stripe_connect_enabled';
  if coalesce(v_live, 'off') <> 'on'
    or coalesce(v_payouts, 'off') <> 'on'
    or coalesce(v_connect, 'off') <> 'on'
  then
    return jsonb_build_object('status','blocked','reason','payout_switches_not_enabled','released',0);
  end if;

  for v_row in
    select
      earnings."id" as earnings_id,
      earnings."creator_id",
      earnings."money_ledger_event_id" as money_id
    from public."creator_earnings_ledger" earnings
    join public."money_access_ledger_events" money
      on money."id" = earnings."money_ledger_event_id"
    join public."provider_events" provider_event
      on provider_event."id" = earnings."provider_event_id"
    where public."creator_earnings_current_state_internal"(earnings."id") = 'held'
      and earnings."hold_until" is not null
      and earnings."hold_until" <= v_now
      and money."environment" = 'production'
      and money."status" = 'verified'
      and money."payable_state" = 'pending_verification'
      and provider_event."provider" in ('revenuecat_app_store','revenuecat_google_play')
      and provider_event."status" = 'processed'
      and not public."revenuecat_authority_quarantined_internal"(
        provider_event."provider",provider_event."user_id",provider_event."environment"
      )
    order by earnings."hold_until", earnings."created_at", earnings."id"
    limit v_limit
    for update of earnings, money skip locked
  loop
    if not public."is_account_access_restricted"(v_row."creator_id"::text)
      and public."wave1_user_has_active_legal_requirements_internal"(v_row."creator_id", 'creator_money')
      and exists (
        select 1
        from public."wave1_creator_eligibility" eligibility
        where eligibility."creator_user_id" = v_row."creator_id"
          and eligibility."state" = 'VERIFIED'
          and eligibility."account_status" = 'ACTIVE'
          and eligibility."age_18_plus"
          and eligibility."legal_accepted"
          and eligibility."creator_role"
          and eligibility."moderation_state" = 'CLEAR'
          and eligibility."market" = 'UNITED_STATES'
          and eligibility."rollout_eligible"
          and eligibility."platform_capability"
          and eligibility."provider_eligible"
          and eligibility."kyc_complete"
          and eligibility."tax_complete"
          and eligibility."sanctions_clear"
          and eligibility."payout_eligible"
      )
    then
      perform public."record_creator_earnings_lifecycle_internal"(
        v_row."earnings_id",'available','settlement_released',
        'settlement-release:' || v_row."earnings_id"::text,
        null,v_row."money_id",jsonb_build_object('released_at',v_now)
      );
      update public."money_access_ledger_events"
      set "payable_state" = 'payable',
          "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
            'payout_readiness_proved',true,
            'released_to_available_at',v_now
          )
      where "id" = v_row."money_id"
        and "payable_state" = 'pending_verification';
      v_released := v_released + 1;
    else
      v_blocked := v_blocked + 1;
    end if;
  end loop;
  return jsonb_build_object('status','complete','released',v_released,'blockedEligibility',v_blocked);
end;
$$;
revoke all on function public."release_mature_creator_money_settlements"(integer) from public, anon, authenticated;
grant execute on function public."release_mature_creator_money_settlements"(integer) to service_role;

-- Provider/KYC state is backend-imported evidence, not an Owner/operator form.
-- The existing Edge provider adapters use the service role; authenticated staff
-- retain read-only audit visibility but cannot self-attest a live payout account.
drop policy if exists "creator_payout_accounts_insert_owner_operator" on public."creator_payout_accounts";
drop policy if exists "creator_payout_accounts_update_owner_operator" on public."creator_payout_accounts";
revoke insert, update, delete on table public."creator_payout_accounts" from authenticated;

-- Reserve exact USD obligations at request creation. Reserved, processing, and
-- already-paid allocations all reduce free balance, closing the processing-window
-- double-spend that existed in the predecessor implementation.
create or replace function public."create_creator_payout_request_safe"(
  p_amount_cents integer,
  p_payout_type text default 'scheduled'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_type text := lower(trim(coalesce(p_payout_type, 'scheduled')));
  v_session jsonb := public."wave1_session_authority_readback"();
  v_legal jsonb;
  v_available bigint := 0;
  v_fee integer;
  v_request public."creator_payout_requests"%rowtype;
  v_live text;
  v_payouts text;
  v_connect text;
  v_cashout text;
  v_now timestamptz := timezone('utc'::text, now());
  v_remaining integer;
  v_unallocated integer;
  v_row record;
begin
  if public."revenuecat_authority_quarantined_internal"(null,null,null) then
    raise exception 'revenuecat_terminal_authority_quarantined';
  end if;
  if v_user is null
    or v_session->>'state' <> 'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean, false)
    or (v_session->>'userId')::uuid is distinct from v_user
    or nullif(v_session->>'sessionGeneration', '') is null
    or nullif(auth.jwt()->>'session_id', '') is null
    or nullif(v_session->>'sessionGeneration', '') is distinct from nullif(auth.jwt()->>'session_id', '')
    or public."is_account_access_restricted"(v_user::text)
  then
    raise exception 'payout_session_authority_required';
  end if;
  if coalesce(p_amount_cents, 0) <= 0 then raise exception 'payout_amount_invalid'; end if;
  if v_type not in ('scheduled','instant') then raise exception 'payout_type_invalid'; end if;

  -- Serialize before reading any mutable admission evidence. Every predicate
  -- below is evaluated after the creator lock, so a caller that waited behind a
  -- reversal/recovery cannot reserve against a pre-wait snapshot.
  perform pg_advisory_xact_lock(hashtextextended('creator-payout:' || v_user::text, 0));
  v_now:=timezone('utc'::text,now());

  v_legal := public."wave1_legal_requirements_readback"('payout');
  if coalesce((v_legal->>'allAccepted')::boolean, false) is not true
    or v_legal->>'market' <> 'UNITED_STATES'
  then
    raise exception 'payout_legal_not_current';
  end if;
  if not exists (
    select 1
    from public."wave1_creator_eligibility" eligibility
    where eligibility."creator_user_id" = v_user
      and eligibility."state" = 'VERIFIED'
      and eligibility."account_status" = 'ACTIVE'
      and eligibility."age_18_plus"
      and eligibility."legal_accepted"
      and eligibility."creator_role"
      and eligibility."moderation_state" = 'CLEAR'
      and eligibility."market" = 'UNITED_STATES'
      and eligibility."rollout_eligible"
      and eligibility."platform_capability"
      and eligibility."provider_eligible"
      and eligibility."kyc_complete"
      and eligibility."tax_complete"
      and eligibility."sanctions_clear"
      and eligibility."payout_eligible"
  ) then
    raise exception 'creator_not_payout_eligible';
  end if;

  select "state" into v_live from public."platform_money_kill_switches" where "key" = 'live_money_enabled';
  select "state" into v_payouts from public."platform_money_kill_switches" where "key" = 'payouts_enabled';
  select "state" into v_connect from public."platform_money_kill_switches" where "key" = 'stripe_connect_enabled';
  select "state" into v_cashout from public."platform_money_kill_switches" where "key" = 'cashout_enabled';
  if coalesce(v_live, 'off') <> 'on'
    or coalesce(v_payouts, 'off') <> 'on'
    or coalesce(v_connect, 'off') <> 'on'
    or (v_type = 'instant' and coalesce(v_cashout, 'off') <> 'on')
  then
    raise exception 'payout_execution_disabled';
  end if;
  if not exists (
    select 1
    from public."creator_payout_accounts" account
    join public."platform_admin_audit_logs" audit
      on audit."id" = account."last_platform_admin_audit_log_id"
    where account."creator_user_id" = v_user::text
      and account."provider" = 'stripe_connect'
      and account."provider_environment" = 'live'
      and nullif(trim(account."provider_account_id"), '') is not null
      and lower(account."default_currency") = 'usd'
      and upper(coalesce(account."country", '')) = 'US'
      and account."status" = 'eligible'
      and account."payouts_enabled"
      and account."details_submitted"
      and account."transfers_capability_status" = 'active'
      and account."onboarding_status" = 'ready_for_payouts'
      and account."kyc_status" = 'verified'
      and account."tax_status" = 'verified'
      and nullif(trim(coalesce(account."disabled_reason", '')), '') is null
      and jsonb_typeof(account."requirements_currently_due") = 'array'
      and jsonb_array_length(account."requirements_currently_due") = 0
      and jsonb_typeof(account."requirements_eventually_due") = 'array'
      and jsonb_array_length(account."requirements_eventually_due") = 0
      and jsonb_typeof(account."requirements_past_due") = 'array'
      and jsonb_array_length(account."requirements_past_due") = 0
      and account."last_provider_sync_at" >= v_now - interval '15 minutes'
      and account."last_provider_sync_at" <= v_now + interval '2 minutes'
      and account."metadata"->>'last_provider_sync_source' in (
        'stripe-connect-account-sync',
        'stripe-connect-webhook'
      )
      and audit."action" in ('stripe_connect_account_synced','stripe_connect_webhook_processed')
      and audit."target_type" = 'creator_payout_account'
      and audit."target_id" = account."id"::text
      and audit."target_user_id" = v_user::text
      and audit."created_at" >= v_now - interval '15 minutes'
      and audit."created_at" <= v_now + interval '2 minutes'
  ) then
    raise exception 'fresh_live_payout_provider_proof_required';
  end if;
  if exists (
    select 1 from public."creator_money_recovery_obligations"
    where "creator_id" = v_user and "state" = 'pending_recovery'
  ) then
    raise exception 'creator_recovery_obligation_pending';
  end if;

  -- Re-read every mutable admission predicate immediately before balance and
  -- allocation. Lock the exact imported provider proof and switch rows so they
  -- cannot be downgraded between validation and request reservation.
  v_session:=public."wave1_session_authority_readback"();
  if public."revenuecat_authority_quarantined_internal"(null,null,null)
    or v_session->>'state'<>'ACTIVE'
    or coalesce((v_session->>'restoreOnly')::boolean,false)
    or (v_session->>'userId')::uuid is distinct from v_user
    or nullif(v_session->>'sessionGeneration','') is distinct from nullif(auth.jwt()->>'session_id','')
    or public."is_account_access_restricted"(v_user::text)
  then
    raise exception 'payout_session_authority_required';
  end if;
  v_legal:=public."wave1_legal_requirements_readback"('payout');
  if coalesce((v_legal->>'allAccepted')::boolean,false) is not true
    or v_legal->>'market'<>'UNITED_STATES'
  then
    raise exception 'payout_legal_not_current';
  end if;
  perform 1
  from public."wave1_creator_eligibility" eligibility
  where eligibility."creator_user_id"=v_user
    and eligibility."state"='VERIFIED' and eligibility."account_status"='ACTIVE'
    and eligibility."age_18_plus" and eligibility."legal_accepted"
    and eligibility."creator_role" and eligibility."moderation_state"='CLEAR'
    and eligibility."market"='UNITED_STATES' and eligibility."rollout_eligible"
    and eligibility."platform_capability" and eligibility."provider_eligible"
    and eligibility."kyc_complete" and eligibility."tax_complete"
    and eligibility."sanctions_clear" and eligibility."payout_eligible"
  for share;
  if not found then raise exception 'creator_not_payout_eligible'; end if;
  perform 1 from public."platform_money_kill_switches" switch_row
  where switch_row."key" in ('live_money_enabled','payouts_enabled','stripe_connect_enabled','cashout_enabled')
  for share;
  select "state" into v_live from public."platform_money_kill_switches" where "key"='live_money_enabled';
  select "state" into v_payouts from public."platform_money_kill_switches" where "key"='payouts_enabled';
  select "state" into v_connect from public."platform_money_kill_switches" where "key"='stripe_connect_enabled';
  select "state" into v_cashout from public."platform_money_kill_switches" where "key"='cashout_enabled';
  if coalesce(v_live,'off')<>'on' or coalesce(v_payouts,'off')<>'on'
    or coalesce(v_connect,'off')<>'on'
    or (v_type='instant' and coalesce(v_cashout,'off')<>'on')
  then raise exception 'payout_execution_disabled'; end if;
  perform account."id"
  from public."creator_payout_accounts" account
  join public."platform_admin_audit_logs" audit
    on audit."id"=account."last_platform_admin_audit_log_id"
  where account."creator_user_id"=v_user::text
    and account."provider"='stripe_connect' and account."provider_environment"='live'
    and nullif(trim(account."provider_account_id"),'') is not null
    and lower(account."default_currency")='usd' and upper(coalesce(account."country",''))='US'
    and account."status"='eligible' and account."payouts_enabled" and account."details_submitted"
    and account."transfers_capability_status"='active'
    and account."onboarding_status"='ready_for_payouts'
    and account."kyc_status"='verified' and account."tax_status"='verified'
    and nullif(trim(coalesce(account."disabled_reason",'')),'') is null
    and jsonb_typeof(account."requirements_currently_due")='array'
    and jsonb_array_length(account."requirements_currently_due")=0
    and jsonb_typeof(account."requirements_eventually_due")='array'
    and jsonb_array_length(account."requirements_eventually_due")=0
    and jsonb_typeof(account."requirements_past_due")='array'
    and jsonb_array_length(account."requirements_past_due")=0
    and account."last_provider_sync_at">=v_now-interval '15 minutes'
    and account."last_provider_sync_at"<=v_now+interval '2 minutes'
    and account."metadata"->>'last_provider_sync_source' in ('stripe-connect-account-sync','stripe-connect-webhook')
    and audit."action" in ('stripe_connect_account_synced','stripe_connect_webhook_processed')
    and audit."target_type"='creator_payout_account' and audit."target_id"=account."id"::text
    and audit."target_user_id"=v_user::text
    and audit."created_at">=v_now-interval '15 minutes' and audit."created_at"<=v_now+interval '2 minutes'
  for share of account,audit;
  if not found then raise exception 'fresh_live_payout_provider_proof_required'; end if;
  if exists (
    select 1 from public."creator_money_recovery_obligations"
    where "creator_id" = v_user and "state" = 'pending_recovery'
  ) then
    raise exception 'creator_recovery_obligation_pending';
  end if;
  select coalesce(sum(earnings."net_creator_amount_cents" - coalesce(allocated."amount_cents", 0)), 0)
    into v_available
  from public."creator_earnings_ledger" earnings
  join public."money_access_ledger_events" money
    on money."id" = earnings."money_ledger_event_id"
  left join (
    select allocation."earnings_ledger_id", sum(allocation."amount_cents") as amount_cents
    from public."creator_payout_allocations" allocation
    where allocation."state" in ('reserved','processing','paid')
    group by allocation."earnings_ledger_id"
  ) allocated on allocated."earnings_ledger_id" = earnings."id"
  where earnings."creator_id" = v_user
    and earnings."currency" = 'usd'
    and public."creator_earnings_current_state_internal"(earnings."id") = 'available'
    and money."environment" = 'production'
    and money."status" = 'verified'
    and money."payable_state" = 'payable';
  if v_available < p_amount_cents then raise exception 'insufficient_available_balance'; end if;

  v_fee := case when v_type = 'instant' then ceil(p_amount_cents * 0.015)::integer else 0 end;
  insert into public."creator_payout_requests" (
    "creator_id","amount_cents","currency","payout_type","instant_fee_cents","status"
  ) values (
    v_user,p_amount_cents,'usd',v_type,v_fee,'requested'
  ) returning * into v_request;

  v_remaining := p_amount_cents;
  for v_row in
    select
      earnings."id",
      earnings."net_creator_amount_cents" - coalesce(allocated."amount_cents", 0) as unallocated
    from public."creator_earnings_ledger" earnings
    join public."money_access_ledger_events" money
      on money."id" = earnings."money_ledger_event_id"
    left join (
      select allocation."earnings_ledger_id", sum(allocation."amount_cents") as amount_cents
      from public."creator_payout_allocations" allocation
      where allocation."state" in ('reserved','processing','paid')
      group by allocation."earnings_ledger_id"
    ) allocated on allocated."earnings_ledger_id" = earnings."id"
    where earnings."creator_id" = v_user
      and earnings."currency" = 'usd'
      and public."creator_earnings_current_state_internal"(earnings."id") = 'available'
      and money."environment" = 'production'
      and money."status" = 'verified'
      and money."payable_state" = 'payable'
      and earnings."net_creator_amount_cents" - coalesce(allocated."amount_cents", 0) > 0
    order by earnings."created_at", earnings."id"
    for update of earnings
  loop
    exit when v_remaining <= 0;
    v_unallocated := least(v_remaining, v_row."unallocated");
    insert into public."creator_payout_allocations" (
      "payout_request_id","earnings_ledger_id","amount_cents","state"
    ) values (
      v_request."id",v_row."id",v_unallocated,'reserved'
    );
    v_remaining := v_remaining - v_unallocated;
  end loop;
  if v_remaining <> 0 then raise exception 'payout_allocation_incomplete'; end if;

  return jsonb_build_object(
    'id',v_request."id",'status',v_request."status",'amountCents',v_request."amount_cents",
    'currency',v_request."currency",'instantFeeCents',v_request."instant_fee_cents",
    'providerMutationPerformed',false
  );
end;
$$;
revoke all on function public."create_creator_payout_request_safe"(integer,text) from public, anon;
grant execute on function public."create_creator_payout_request_safe"(integer,text) to authenticated, service_role;

alter table public."creator_money_recovery_obligations"
  drop constraint if exists "creator_money_recovery_reason_check";
alter table public."creator_money_recovery_obligations"
  add constraint "creator_money_recovery_reason_check" check (
    "reason" in (
      'refund_after_payout','reversal_after_payout','chargeback_after_payout',
      'terminal_quarantine_after_payout'
    )
  );
alter table public."creator_money_payout_incidents"
  drop constraint if exists "creator_money_payout_incident_type_check";
alter table public."creator_money_payout_incidents"
  add constraint "creator_money_payout_incident_type_check" check (
    "incident_type" in (
      'provider_processing_during_reversal','paid_after_reversal','allocation_mismatch',
      'paid_during_terminal_quarantine'
    )
  );

create or replace function public."mark_creator_payout_provider_result"(
  p_request_id uuid,
  p_provider_payout_id text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public."creator_payout_requests"%rowtype;
  v_status text := lower(trim(coalesce(p_status, '')));
  v_provider_payout_id text := nullif(trim(coalesce(p_provider_payout_id, '')), '');
  v_now timestamptz := timezone('utc'::text, now());
  v_request_allocation_total integer;
  v_total_paid integer;
  v_current_state text;
  v_reason text;
  v_allocation_quarantined boolean:=false;
  v_row record;
begin
  if p_request_id is null then raise exception 'payout_request_required'; end if;
  if v_status not in ('processing','paid','failed','canceled') then raise exception 'payout_provider_status_invalid'; end if;
  if v_status in ('processing','paid') and v_provider_payout_id is null then raise exception 'provider_payout_id_required'; end if;
  if v_provider_payout_id is not null and length(v_provider_payout_id) > 255 then raise exception 'provider_payout_id_invalid'; end if;

  perform pg_advisory_xact_lock(hashtextextended('creator-payout-result:' || p_request_id::text, 0));
  select request.* into v_request
  from public."creator_payout_requests" request
  where request."id" = p_request_id
  for update;
  if v_request."id" is null then raise exception 'payout_request_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('creator-payout:' || v_request."creator_id"::text, 0));

  if v_status='processing'
    and public."revenuecat_authority_quarantined_internal"(null,null,null)
  then
    raise exception 'revenuecat_terminal_authority_quarantined';
  end if;

  if v_request."currency" <> 'usd' then raise exception 'payout_request_currency_not_supported'; end if;
  if exists (
    select 1
    from public."creator_payout_allocations" allocation
    join public."creator_earnings_ledger" earnings on earnings."id" = allocation."earnings_ledger_id"
    where allocation."payout_request_id" = p_request_id
      and earnings."currency" <> v_request."currency"
  ) then
    raise exception 'payout_allocation_currency_mismatch';
  end if;
  if v_provider_payout_id is not null and exists (
    select 1
    from public."creator_payout_requests" other_request
    where other_request."provider_payout_id" = v_provider_payout_id
      and other_request."id" <> p_request_id
  ) then
    raise exception 'provider_payout_id_already_bound';
  end if;
  if v_request."provider_payout_id" is not null
    and v_provider_payout_id is not null
    and v_request."provider_payout_id" <> v_provider_payout_id
  then
    raise exception 'provider_payout_id_mismatch';
  end if;

  if v_request."status" = 'paid' and v_status <> 'paid' then raise exception 'paid_payout_terminal'; end if;
  if v_request."status" in ('failed','canceled') and v_status <> v_request."status" then raise exception 'closed_payout_cannot_transition'; end if;
  if v_request."status" = 'processing' and v_status = 'processing'
    and v_request."provider_payout_id" is distinct from v_provider_payout_id
  then
    raise exception 'processing_payout_replay_mismatch';
  end if;

  select coalesce(sum(allocation."amount_cents"), 0)::integer
    into v_request_allocation_total
  from public."creator_payout_allocations" allocation
  where allocation."payout_request_id" = p_request_id
    and allocation."state" in ('reserved','processing','paid');
  if v_status in ('processing','paid') and v_request_allocation_total <> v_request."amount_cents" then
    insert into public."creator_money_payout_incidents" (
      "payout_request_id","incident_type","metadata"
    ) values (
      p_request_id,'allocation_mismatch',jsonb_build_object(
        'expected_amount_cents',v_request."amount_cents",
        'active_allocation_cents',v_request_allocation_total
      )
    ) on conflict do nothing;
    raise exception 'payout_allocation_mismatch';
  end if;

  if v_status = 'processing' then
    update public."creator_payout_allocations"
    set "state" = 'processing', "updated_at" = v_now
    where "payout_request_id" = p_request_id and "state" = 'reserved';
  elsif v_status = 'paid' then
    update public."creator_payout_allocations"
    set "state" = 'paid', "updated_at" = v_now
    where "payout_request_id" = p_request_id and "state" in ('reserved','processing');
  elsif v_status in ('failed','canceled') then
    update public."creator_payout_allocations"
    set "state" = 'released', "updated_at" = v_now
    where "payout_request_id" = p_request_id and "state" in ('reserved','processing');
  end if;

  update public."creator_payout_requests"
  set "status" = v_status,
      "provider_payout_id" = coalesce(v_provider_payout_id, "provider_payout_id"),
      "updated_at" = v_now
  where "id" = p_request_id
  returning * into v_request;

  if v_status = 'paid' then
    select coalesce(sum("amount_cents"), 0)::integer into v_request_allocation_total
    from public."creator_payout_allocations"
    where "payout_request_id" = p_request_id and "state" = 'paid';
    if v_request_allocation_total <> v_request."amount_cents" then
      raise exception 'paid_payout_allocation_mismatch';
    end if;

    for v_row in
      select
        earnings."id" as earnings_id,
        earnings."creator_id",
        earnings."money_ledger_event_id",
        earnings."net_creator_amount_cents",
        earnings."currency",
        coalesce(sum(allocation."amount_cents") filter (where allocation."state" = 'paid'), 0)::integer as total_paid
      from public."creator_payout_allocations" request_allocation
      join public."creator_earnings_ledger" earnings
        on earnings."id" = request_allocation."earnings_ledger_id"
      left join public."creator_payout_allocations" allocation
        on allocation."earnings_ledger_id" = earnings."id"
      where request_allocation."payout_request_id" = p_request_id
      group by earnings."id", earnings."creator_id", earnings."money_ledger_event_id",
        earnings."net_creator_amount_cents", earnings."currency"
    loop
      perform 1 from public."creator_earnings_ledger" where "id" = v_row."earnings_id" for update;
      v_total_paid := v_row."total_paid";
      v_current_state := public."creator_earnings_current_state_internal"(v_row."earnings_id");
      select public."revenuecat_authority_quarantined_internal"(
        provider_event."provider",money."user_id",money."environment"
      ) into v_allocation_quarantined
      from public."money_access_ledger_events" money
      join public."provider_events" provider_event on provider_event."id"=money."provider_event_id"
      where money."id"=v_row."money_ledger_event_id";
      if v_current_state = 'reversed' then
        select case money."payable_state"
          when 'refunded' then 'refund_after_payout'
          when 'chargeback' then 'chargeback_after_payout'
          else 'reversal_after_payout' end
        into v_reason
        from public."money_access_ledger_events" money
        where money."id" = v_row."money_ledger_event_id";
        insert into public."creator_money_recovery_obligations" (
          "creator_id","money_ledger_event_id","earnings_ledger_id","amount_cents","currency","reason"
        ) values (
          v_row."creator_id",v_row."money_ledger_event_id",v_row."earnings_id",
          least(v_total_paid,v_row."net_creator_amount_cents"),v_row."currency",coalesce(v_reason,'reversal_after_payout')
        ) on conflict ("money_ledger_event_id","earnings_ledger_id") do update
          set "amount_cents" = greatest(public."creator_money_recovery_obligations"."amount_cents", excluded."amount_cents"),
              "updated_at" = v_now;
        insert into public."creator_money_payout_incidents" (
          "payout_request_id","earnings_ledger_id","incident_type","metadata"
        ) values (
          p_request_id,v_row."earnings_id",'paid_after_reversal',jsonb_build_object('paid_amount_cents',v_total_paid)
        ) on conflict do nothing;
      elsif coalesce(v_allocation_quarantined,false) then
        perform public."record_creator_earnings_lifecycle_internal"(
          v_row."earnings_id",'paid','provider_payout_paid',
          'provider-payout-quarantined-paid:' || p_request_id::text || ':' || v_row."earnings_id"::text,
          p_request_id,v_row."money_ledger_event_id",jsonb_build_object('paid_at',v_now)
        );
        insert into public."creator_money_recovery_obligations" (
          "creator_id","money_ledger_event_id","earnings_ledger_id","amount_cents","currency","reason"
        ) values (
          v_row."creator_id",v_row."money_ledger_event_id",v_row."earnings_id",
          least(v_total_paid,v_row."net_creator_amount_cents"),v_row."currency",
          'terminal_quarantine_after_payout'
        ) on conflict ("money_ledger_event_id","earnings_ledger_id") do update
          set "amount_cents"=greatest(public."creator_money_recovery_obligations"."amount_cents",excluded."amount_cents"),
              "updated_at"=v_now;
        insert into public."creator_money_payout_incidents" (
          "payout_request_id","earnings_ledger_id","incident_type","metadata"
        ) values (
          p_request_id,v_row."earnings_id",'paid_during_terminal_quarantine',
          jsonb_build_object('paid_amount_cents',v_total_paid,'authority_quarantined',true)
        ) on conflict do nothing;
        update public."money_access_ledger_events"
        set "metadata"=coalesce("metadata",'{}'::jsonb)||jsonb_build_object(
          'payout_completed_at',v_now,'payout_readiness_proved',false,
          'terminal_quarantine_after_payout',true
        )
        where "id"=v_row."money_ledger_event_id";
      elsif v_total_paid >= v_row."net_creator_amount_cents" then
        perform public."record_creator_earnings_lifecycle_internal"(
          v_row."earnings_id",'paid','provider_payout_paid',
          'provider-payout-paid:' || p_request_id::text || ':' || v_row."earnings_id"::text,
          p_request_id,v_row."money_ledger_event_id",jsonb_build_object('paid_at',v_now)
        );
        update public."money_access_ledger_events"
        set "payable_state" = 'paid',
            "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
              'payout_completed_at',v_now,
              'payout_readiness_proved',true
            )
        where "id" = v_row."money_ledger_event_id"
          and "payable_state" = 'payable';
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'id',v_request."id",'status',v_request."status",
    'providerPayoutIdPresent',v_request."provider_payout_id" is not null,
    'providerMutationPerformed',false
  );
end;
$$;
revoke all on function public."mark_creator_payout_provider_result"(uuid,text,text) from public, anon, authenticated;
grant execute on function public."mark_creator_payout_provider_result"(uuid,text,text) to service_role;

create or replace function public."reverse_creator_money_earnings_on_provider_terminal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_earning public."creator_earnings_ledger"%rowtype;
  v_paid integer := 0;
  v_processing integer := 0;
  v_reason text;
  v_request record;
begin
  if new."payable_state" not in ('refunded','reversed','chargeback')
    or old."payable_state" = new."payable_state"
  then
    return new;
  end if;
  select earnings.* into v_earning
  from public."creator_earnings_ledger" earnings
  where earnings."money_ledger_event_id" = new."id";
  if v_earning."id" is null then return new; end if;
  -- Match payout request lock order: creator advisory lock, then immutable
  -- earnings tuple lock. Reversal and reservation cannot both observe AVAILABLE.
  perform pg_advisory_xact_lock(hashtextextended('creator-payout:' || v_earning."creator_id"::text,0));
  select earnings.* into v_earning
  from public."creator_earnings_ledger" earnings
  where earnings."id"=v_earning."id"
  for update;

  select
    coalesce(sum("amount_cents") filter (where "state" = 'paid'), 0)::integer,
    coalesce(sum("amount_cents") filter (where "state" = 'processing'), 0)::integer
  into v_paid, v_processing
  from public."creator_payout_allocations"
  where "earnings_ledger_id" = v_earning."id";

  if v_paid > 0 then
    v_reason := case new."payable_state"
      when 'refunded' then 'refund_after_payout'
      when 'chargeback' then 'chargeback_after_payout'
      else 'reversal_after_payout' end;
    insert into public."creator_money_recovery_obligations" (
      "creator_id","money_ledger_event_id","earnings_ledger_id","amount_cents","currency","reason"
    ) values (
      v_earning."creator_id",new."id",v_earning."id",
      least(v_paid,v_earning."net_creator_amount_cents"),v_earning."currency",v_reason
    ) on conflict ("money_ledger_event_id","earnings_ledger_id") do update
      set "amount_cents" = greatest(public."creator_money_recovery_obligations"."amount_cents", excluded."amount_cents"),
          "updated_at" = timezone('utc'::text, now());
  end if;

  update public."creator_payout_allocations"
  set "state" = 'released', "updated_at" = timezone('utc'::text, now())
  where "earnings_ledger_id" = v_earning."id" and "state" = 'reserved';

  for v_request in
    select distinct request."id"
    from public."creator_payout_requests" request
    join public."creator_payout_allocations" allocation
      on allocation."payout_request_id" = request."id"
    where allocation."earnings_ledger_id" = v_earning."id"
      and allocation."state" = 'processing'
  loop
    insert into public."creator_money_payout_incidents" (
      "payout_request_id","earnings_ledger_id","incident_type","metadata"
    ) values (
      v_request."id",v_earning."id",'provider_processing_during_reversal',
      jsonb_build_object('terminal_payable_state',new."payable_state")
    ) on conflict do nothing;
  end loop;

  update public."creator_payout_requests" request
  set "status" = 'canceled', "updated_at" = timezone('utc'::text, now())
  where request."status" in ('requested','approved')
    and request."provider_payout_id" is null
    and exists (
      select 1 from public."creator_payout_allocations" allocation
      where allocation."payout_request_id" = request."id"
        and allocation."earnings_ledger_id" = v_earning."id"
        and allocation."state" = 'released'
    )
    and not exists (
      select 1 from public."creator_payout_allocations" allocation
      where allocation."payout_request_id" = request."id"
        and allocation."state" in ('reserved','processing','paid')
    );

  perform public."record_creator_earnings_lifecycle_internal"(
    v_earning."id",'reversed','provider_terminal_reversal',
    'provider-terminal-reversal:' || new."id"::text || ':' || v_earning."id"::text,
    null,new."id",jsonb_build_object(
      'terminal_payable_state',new."payable_state",
      'paid_amount_recovery_required',v_paid,
      'processing_amount_at_reversal',v_processing
    )
  );
  return new;
end;
$$;
revoke all on function public."reverse_creator_money_earnings_on_provider_terminal"() from public, anon, authenticated, service_role;

create or replace function public."calculate_creator_payout_balances"(p_creator_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_creator uuid := coalesce(p_creator_id, auth.uid());
  v_pending bigint := 0;
  v_held bigint := 0;
  v_available bigint := 0;
  v_paid bigint := 0;
  v_reversed bigint := 0;
  v_non_usd boolean := false;
begin
  if v_actor is null then raise exception 'monetization_auth_required'; end if;
  if not public."wave1_current_caller_authority_internal"()
    or public."is_account_access_restricted"(v_actor::text)
  then
    raise exception 'monetization_session_authority_required';
  end if;
  if v_creator <> v_actor and not public."has_platform_role"(array['owner'::text,'operator'::text]) then
    raise exception 'monetization_permission_denied';
  end if;
  if public."revenuecat_authority_quarantined_internal"(null,null,null) then
    return jsonb_build_object(
      'creatorId',v_creator,'currency','usd','pendingCents',0,'heldCents',0,
      'availableCents',0,'paidCents',0,'reversedCents',0,
      'nonUsdObligationsPresent',false,'authorityQuarantined',true
    );
  end if;

  select
    coalesce(sum(earnings."net_creator_amount_cents") filter (
      where public."creator_earnings_current_state_internal"(earnings."id") = 'pending'
    ), 0),
    coalesce(sum(earnings."net_creator_amount_cents") filter (
      where public."creator_earnings_current_state_internal"(earnings."id") = 'held'
    ), 0),
    coalesce(sum((earnings."net_creator_amount_cents" - coalesce(allocated."amount_cents", 0))) filter (
      where public."creator_earnings_current_state_internal"(earnings."id") = 'available'
    ), 0),
    coalesce(sum(coalesce(allocated."paid_amount_cents", 0)), 0),
    coalesce(sum(earnings."net_creator_amount_cents") filter (
      where public."creator_earnings_current_state_internal"(earnings."id") = 'reversed'
    ), 0)
  into v_pending,v_held,v_available,v_paid,v_reversed
  from public."creator_earnings_ledger" earnings
  left join (
    select allocation."earnings_ledger_id",
      sum(allocation."amount_cents") as amount_cents,
      coalesce(sum(allocation."amount_cents") filter (where allocation."state"='paid'),0) as paid_amount_cents
    from public."creator_payout_allocations" allocation
    where allocation."state" in ('reserved','processing','paid')
    group by allocation."earnings_ledger_id"
  ) allocated on allocated."earnings_ledger_id" = earnings."id"
  where earnings."creator_id" = v_creator and earnings."currency" = 'usd';

  select exists (
    select 1 from public."creator_earnings_ledger" earnings
    where earnings."creator_id" = v_creator and earnings."currency" <> 'usd'
  ) into v_non_usd;
  return jsonb_build_object(
    'creatorId',v_creator,'currency','usd','pendingCents',v_pending,'heldCents',v_held,
    'availableCents',greatest(v_available,0),'paidCents',v_paid,'reversedCents',v_reversed,
    'nonUsdObligationsPresent',v_non_usd
  );
end;
$$;
revoke all on function public."calculate_creator_payout_balances"(uuid) from public, anon;
grant execute on function public."calculate_creator_payout_balances"(uuid) to authenticated, service_role;

create or replace function public."request_creator_payout"(
  p_amount_cents integer,
  p_payout_type text default 'scheduled'
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public."create_creator_payout_request_safe"(p_amount_cents, p_payout_type)
$$;
revoke all on function public."request_creator_payout"(integer,text) from public, anon;
grant execute on function public."request_creator_payout"(integer,text) to authenticated, service_role;

comment on function public."release_mature_creator_money_settlements"(integer) is
  'Projects immutable held earnings to available after exact current eligibility/legal/switch checks; performs no provider call.';
comment on function public."create_creator_payout_request_safe"(integer,text) is
  'Reserves exact unallocated USD earnings only with fresh backend-imported live Stripe/KYC/tax/capability proof, including processing reservations in balance accounting; performs no provider call.';
comment on function public."mark_creator_payout_provider_result"(uuid,text,text) is
  'Service-only idempotent provider-result projection with globally unique provider payout identity and immutable earnings lifecycle events; performs no provider call.';

alter function public."resolve_creator_vip_pass_access"(uuid)
  rename to "resolve_creator_vip_pass_access_pre_integrity_closeout";
create or replace function public."resolve_creator_vip_pass_access"(p_creator_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and public."is_account_access_restricted"(auth.uid()::text) then
    return jsonb_build_object('allowed',false,'reason','account_restricted','requiresPurchase',false);
  end if;
  if p_creator_id is not null and not public."wave1_creator_money_subject_authorized_internal"(p_creator_id) then
    return jsonb_build_object('allowed',false,'reason','creator_authority_not_current','requiresPurchase',false);
  end if;
  return public."resolve_creator_vip_pass_access_pre_integrity_closeout"(p_creator_id);
end;
$$;
revoke all on function public."resolve_creator_vip_pass_access_pre_integrity_closeout"(uuid) from public,anon,authenticated,service_role;
revoke all on function public."resolve_creator_vip_pass_access"(uuid) from public,anon;
grant execute on function public."resolve_creator_vip_pass_access"(uuid) to authenticated,service_role;

alter function public."resolve_paid_creator_event_pass_access"(uuid)
  rename to "resolve_paid_creator_event_pass_access_pre_integrity_closeout";
create or replace function public."resolve_paid_creator_event_pass_access"(p_creator_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_creator uuid;
begin
  if auth.uid() is not null and public."is_account_access_restricted"(auth.uid()::text) then
    return jsonb_build_object('allowed',false,'reason','account_restricted','requiresPurchase',false);
  end if;
  select offer."creator_id" into v_creator
  from public."paid_creator_events" offer
  where offer."creator_event_id"=p_creator_event_id
    and offer."status" in ('sandbox','active','sold_out','paused','blocked')
  order by offer."updated_at" desc limit 1;
  if v_creator is not null and not public."wave1_creator_money_subject_authorized_internal"(v_creator) then
    return jsonb_build_object('allowed',false,'reason','creator_authority_not_current','requiresPurchase',false);
  end if;
  return public."resolve_paid_creator_event_pass_access_pre_integrity_closeout"(p_creator_event_id);
end;
$$;
revoke all on function public."resolve_paid_creator_event_pass_access_pre_integrity_closeout"(uuid) from public,anon,authenticated,service_role;
revoke all on function public."resolve_paid_creator_event_pass_access"(uuid) from public,anon;
grant execute on function public."resolve_paid_creator_event_pass_access"(uuid) to authenticated,service_role;

-- The legacy grant projector treated every still-finite lifecycle grant as a
-- new paid/active subscription. Correct the durable projection after that
-- projector runs so cancellation and billing state remain honest without
-- prematurely removing a finite paid period.
create or replace function public."project_channel_subscription_lifecycle_closeout_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text;
  v_retains_access boolean;
begin
  if new."grant_type"<>'channel_subscription' or new."provider_event_id" is null then return new; end if;
  select upper(trim(provider_event."event_type")) into v_event_type
  from public."provider_events" provider_event where provider_event."id"=new."provider_event_id";
  v_retains_access := new."status" in ('active','sandbox_only')
    and new."revoked_at" is null and new."refunded_at" is null
    and new."expires_at" is not null and new."expires_at">timezone('utc'::text,now());

  if v_event_type='CANCELLATION' and v_retains_access then
    update public."creator_channel_subscriptions" subscription
    set "status"='cancel_pending',"current_period_end"=new."expires_at",
        "updated_at"=timezone('utc'::text,now()),
        "metadata"=coalesce(subscription."metadata",'{}'::jsonb)||jsonb_build_object(
          'latest_provider_lifecycle','CANCELLATION','auto_renew_disabled',true
        )
    where subscription."access_grant_id"=new."id";
    update public."creator_channel_subscription_transactions" transaction_row
    set "status"='canceled',"payout_status"='not_payable',"paid_at"=null,
        "metadata"=coalesce(transaction_row."metadata",'{}'::jsonb)||jsonb_build_object(
          'lifecycle_only',true,'retains_access_until',new."expires_at"
        )
    where transaction_row."provider_event_id"=new."provider_event_id";
  elsif v_event_type='BILLING_ISSUE' and v_retains_access then
    update public."creator_channel_subscriptions" subscription
    set "status"='grace_period',"current_period_end"=new."expires_at",
        "updated_at"=timezone('utc'::text,now()),
        "metadata"=coalesce(subscription."metadata",'{}'::jsonb)||jsonb_build_object(
          'latest_provider_lifecycle','BILLING_ISSUE','billing_recovery_pending',true
        )
    where subscription."access_grant_id"=new."id";
    update public."creator_channel_subscription_transactions" transaction_row
    set "status"='pending',"payout_status"='not_payable',"paid_at"=null,
        "metadata"=coalesce(transaction_row."metadata",'{}'::jsonb)||jsonb_build_object(
          'lifecycle_only',true,'retains_access_until',new."expires_at"
        )
    where transaction_row."provider_event_id"=new."provider_event_id";
  elsif v_event_type='BILLING_ISSUE' and not v_retains_access then
    update public."creator_channel_subscriptions" subscription
    set "status"='paused',"updated_at"=timezone('utc'::text,now()),
        "metadata"=coalesce(subscription."metadata",'{}'::jsonb)||jsonb_build_object(
          'latest_provider_lifecycle','BILLING_ISSUE','billing_recovery_pending',true
        )
    where subscription."access_grant_id"=new."id";
    update public."creator_channel_subscription_transactions" transaction_row
    set "status"='pending',"payout_status"='not_payable',"paid_at"=null,
        "metadata"=coalesce(transaction_row."metadata",'{}'::jsonb)||jsonb_build_object('lifecycle_only',true)
    where transaction_row."provider_event_id"=new."provider_event_id";
  end if;
  return new;
end;
$$;
revoke all on function public."project_channel_subscription_lifecycle_closeout_internal"() from public,anon,authenticated,service_role;
drop trigger if exists "zz_project_creator_channel_subscription_lifecycle_closeout" on public."access_grants";
create trigger "zz_project_creator_channel_subscription_lifecycle_closeout"
after insert or update of "status","refunded_at","revoked_at","expires_at" on public."access_grants"
for each row execute function public."project_channel_subscription_lifecycle_closeout_internal"();

create or replace function public."resolve_creator_channel_subscription_access"(p_creator_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_offer public."creator_channel_subscription_offers"%rowtype;
  v_subscription public."creator_channel_subscriptions"%rowtype;
begin
  if p_creator_id is null then
    return jsonb_build_object('allowed',false,'reason','creator_id_required','requiresPurchase',false);
  end if;
  select offer.* into v_offer
  from public."creator_channel_subscription_offers" offer
  where offer."creator_id" = p_creator_id
    and offer."status" in ('sandbox','active','paused','blocked')
  order by offer."updated_at" desc
  limit 1;
  if v_offer."id" is null then
    return jsonb_build_object('allowed',false,'reason','subscription_not_available','requiresPurchase',false);
  end if;
  if v_user is null then
    return jsonb_build_object('allowed',false,'reason','auth_required','requiresPurchase',true,'offer',public."channel_subscription_offer_safe_row"(v_offer));
  end if;
  if public."is_account_access_restricted"(v_user::text) then
    return jsonb_build_object('allowed',false,'reason','account_restricted','requiresPurchase',false,'offer',public."channel_subscription_offer_safe_row"(v_offer));
  end if;
  if not public."wave1_creator_money_subject_authorized_internal"(p_creator_id) then
    return jsonb_build_object('allowed',false,'reason','creator_authority_not_current','requiresPurchase',false,'offer',public."channel_subscription_offer_safe_row"(v_offer));
  end if;
  if v_user = p_creator_id or public."has_platform_role"(array['owner'::text,'operator'::text]) then
    return jsonb_build_object('allowed',true,'reason','creator_or_admin','requiresPurchase',false,'offer',public."channel_subscription_offer_safe_row"(v_offer));
  end if;
  if exists (
    select 1 from public."channel_audience_blocks" block_row
    where block_row."channel_user_id" = p_creator_id::text
      and block_row."blocked_user_id" = v_user::text
  ) then
    return jsonb_build_object('allowed',false,'reason','blocked_by_creator','requiresPurchase',false,'offer',public."channel_subscription_offer_safe_row"(v_offer));
  end if;

  select subscription.* into v_subscription
  from public."creator_channel_subscriptions" subscription
  join public."access_grants" grant_row
    on grant_row."id" = subscription."access_grant_id"
   and grant_row."user_id" = subscription."subscriber_id"
   and grant_row."grant_type" = 'channel_subscription'
   and grant_row."source_id" = subscription."offer_id"
  where subscription."offer_id" = v_offer."id"
    and subscription."subscriber_id" = v_user
    and subscription."status" in ('active','trialing','grace_period','cancel_pending')
    and subscription."current_period_end" is not null
    and subscription."current_period_end" > timezone('utc'::text, now())
    and subscription."revoked_at" is null
    and subscription."expired_at" is null
    and grant_row."status" in ('active','sandbox_only')
    and grant_row."expires_at" is not null
    and grant_row."expires_at" > timezone('utc'::text, now())
    and grant_row."refunded_at" is null
    and grant_row."revoked_at" is null
  order by subscription."updated_at" desc
  limit 1;
  if v_subscription."id" is not null then
    return jsonb_build_object(
      'allowed',true,
      'reason',case when v_subscription."status" = 'cancel_pending' then 'subscription_cancel_pending' else 'subscription_active' end,
      'requiresPurchase',false,
      'subscriptionId',v_subscription."id",
      'subscriptionStatus',v_subscription."status",
      'currentPeriodEnd',v_subscription."current_period_end",
      'offer',public."channel_subscription_offer_safe_row"(v_offer)
    );
  end if;
  if v_offer."status" = 'paused' then
    return jsonb_build_object('allowed',false,'reason','offer_paused','requiresPurchase',false,'offer',public."channel_subscription_offer_safe_row"(v_offer));
  end if;
  if v_offer."status" in ('blocked','archived') then
    return jsonb_build_object('allowed',false,'reason','offer_blocked','requiresPurchase',false,'offer',public."channel_subscription_offer_safe_row"(v_offer));
  end if;
  return jsonb_build_object(
    'allowed',false,'reason','subscription_required','requiresPurchase',true,
    'priceCents',v_offer."price_cents",'currency',v_offer."currency",'creatorId',v_offer."creator_id",
    'provider',v_offer."provider",'providerProductId',v_offer."provider_product_id",
    'providerProductKey',v_offer."provider_product_key",'providerEntitlementId',v_offer."provider_entitlement_id",
    'offer',public."channel_subscription_offer_safe_row"(v_offer)
  );
end;
$$;
revoke all on function public."resolve_creator_channel_subscription_access"(uuid) from public, anon;
grant execute on function public."resolve_creator_channel_subscription_access"(uuid) to authenticated, service_role;
comment on function public."resolve_creator_channel_subscription_access"(uuid) is
  'Channel subscription access requires a finite, unrevoked subscription and its exact finite provider-backed access grant.';

-- Projection rows are read models, never purchase authority by themselves.
-- Re-prove every paid pass/subscription through the exact immutable provider
-- chain before returning an allowed buyer result. Creator/operator preview is
-- explicitly labelled and does not impersonate a confirmed purchase.
create or replace function public."resolve_paid_watch_party_ticket_access"(p_party_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_room public."watch_party_rooms"%rowtype;
  v_offer public."paid_watch_party_offers"%rowtype;
  v_ticket public."paid_watch_party_tickets"%rowtype;
  v_identity jsonb;
begin
  if nullif(trim(coalesce(p_party_id,'')),'') is null then
    return jsonb_build_object('allowed',false,'reason','party_id_required','requiresPurchase',false);
  end if;
  select room.* into v_room from public."watch_party_rooms" room
  where room."party_id"=p_party_id;
  if v_room."party_id" is null or not coalesce(v_room."is_active",false)
    or v_room."room_type"<>'title'
  then
    return jsonb_build_object('allowed',false,'reason','room_unavailable','requiresPurchase',false);
  end if;
  select offer.* into v_offer from public."paid_watch_party_offers" offer
  where offer."party_id"=p_party_id
    and offer."status" in ('sandbox','active','paused','sold_out','blocked')
  order by offer."updated_at" desc limit 1;
  if v_offer."id" is null then
    return jsonb_build_object('allowed',false,'reason','seat_pass_not_available','requiresPurchase',false);
  end if;
  if v_user is null then
    return jsonb_build_object('allowed',false,'reason','auth_required','requiresPurchase',true,
      'offer',public."paid_watch_party_offer_safe_row"(v_offer));
  end if;
  if not public."wave1_current_caller_authority_internal"() then
    return jsonb_build_object('allowed',false,'reason','session_authority_not_current','requiresPurchase',false);
  end if;
  if public."is_account_access_restricted"(v_user::text) then
    return jsonb_build_object('allowed',false,'reason','account_restricted','requiresPurchase',false);
  end if;
  if v_user=v_offer."creator_id" or v_user=v_room."host_user_id" then
    return jsonb_build_object('allowed',true,'reason','host_or_admin','requiresPurchase',false,
      'previewAuthority',true,'offer',public."paid_watch_party_offer_safe_row"(v_offer));
  end if;
  if public."has_platform_role"(array['owner'::text,'operator'::text]) then
    return jsonb_build_object('allowed',true,'reason','host_or_admin','requiresPurchase',false,
      'previewAuthority',true,'offer',public."paid_watch_party_offer_safe_row"(v_offer));
  end if;
  if not public."wave1_creator_money_subject_authorized_internal"(v_offer."creator_id") then
    return jsonb_build_object('allowed',false,'reason','creator_authority_not_current','requiresPurchase',false,
      'offer',public."paid_watch_party_offer_safe_row"(v_offer));
  end if;
  if public."watch_party_room_actor_blocked_by_host"(p_party_id,v_user::text) then
    return jsonb_build_object('allowed',false,'reason','blocked_by_host','requiresPurchase',false,
      'offer',public."paid_watch_party_offer_safe_row"(v_offer));
  end if;
  select ticket.* into v_ticket
  from public."paid_watch_party_tickets" ticket
  where ticket."offer_id"=v_offer."id" and ticket."party_id"=p_party_id
    and ticket."buyer_id"=v_user and ticket."status"='active'
    and ticket."refunded_at" is null and ticket."revoked_at" is null
    and (ticket."expires_at" is null or ticket."expires_at">timezone('utc'::text,now()))
  order by ticket."created_at" desc limit 1;
  if v_ticket."id" is not null then
    begin
      v_identity:=public."creator_money_existing_purchase_identity_internal"(
        v_user,'watch_party_live_ticket',v_offer."id"
      );
    exception when others then v_identity:=null;
    end;
    if v_identity is not null
      and (v_identity->>'accessGrantId')::uuid is not distinct from v_ticket."access_grant_id"
      and v_identity->>'providerProductId' is not distinct from v_offer."provider_product_id"
    then
      return jsonb_build_object('allowed',true,'reason','ticket_confirmed','requiresPurchase',false,
        'ticketId',v_ticket."id",'offer',public."paid_watch_party_offer_safe_row"(v_offer));
    end if;
  end if;
  if v_offer."status"='paused' then
    return jsonb_build_object('allowed',false,'reason','offer_paused','requiresPurchase',false,
      'offer',public."paid_watch_party_offer_safe_row"(v_offer));
  end if;
  if v_offer."status"='blocked' then
    return jsonb_build_object('allowed',false,'reason','offer_blocked','requiresPurchase',false,
      'offer',public."paid_watch_party_offer_safe_row"(v_offer));
  end if;
  if v_offer."status"='sold_out'
    or (v_offer."seat_limit" is not null and v_offer."seats_sold">=v_offer."seat_limit")
  then
    return jsonb_build_object('allowed',false,'reason','sold_out','requiresPurchase',false,
      'offer',public."paid_watch_party_offer_safe_row"(v_offer));
  end if;
  if (v_offer."starts_at" is not null and v_offer."starts_at">timezone('utc'::text,now()))
    or (v_offer."ends_at" is not null and v_offer."ends_at"<=timezone('utc'::text,now()))
  then
    return jsonb_build_object('allowed',false,'reason','offer_not_current','requiresPurchase',false,
      'offer',public."paid_watch_party_offer_safe_row"(v_offer));
  end if;
  return jsonb_build_object(
    'allowed',false,'reason','ticket_required','requiresPurchase',true,
    'priceCents',v_offer."price_cents",'currency',v_offer."currency",
    'creatorId',v_offer."creator_id",'provider',v_offer."provider",
    'providerProductId',v_offer."provider_product_id",
    'providerProductKey',v_offer."provider_product_key",
    'offer',public."paid_watch_party_offer_safe_row"(v_offer)
  );
end;
$$;

create or replace function public."resolve_paid_creator_event_pass_access"(p_creator_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_event public."creator_events"%rowtype;
  v_offer public."paid_creator_events"%rowtype;
  v_pass public."paid_creator_event_passes"%rowtype;
  v_identity jsonb;
begin
  if p_creator_event_id is null then
    return jsonb_build_object('allowed',false,'reason','event_id_required','requiresPurchase',false);
  end if;
  select event.* into v_event from public."creator_events" event
  where event."id"=p_creator_event_id;
  if v_event."id" is null then
    return jsonb_build_object('allowed',false,'reason','event_not_found','requiresPurchase',false);
  end if;
  if v_event."status" in ('ended','expired','canceled','removed','unsafe','blocked') then
    return jsonb_build_object('allowed',false,'reason','event_unavailable','requiresPurchase',false);
  end if;
  select offer.* into v_offer from public."paid_creator_events" offer
  where offer."creator_event_id"=p_creator_event_id
    and offer."status" in ('sandbox','active','sold_out','paused','blocked')
  order by offer."updated_at" desc limit 1;
  if v_offer."id" is null then
    return jsonb_build_object('allowed',true,'reason','free_event','requiresPurchase',false);
  end if;
  if v_user is null then
    return jsonb_build_object('allowed',false,'reason','auth_required','requiresPurchase',true,
      'offer',public."paid_creator_event_safe_row"(v_offer));
  end if;
  if not public."wave1_current_caller_authority_internal"() then
    return jsonb_build_object('allowed',false,'reason','session_authority_not_current','requiresPurchase',false);
  end if;
  if public."is_account_access_restricted"(v_user::text) then
    return jsonb_build_object('allowed',false,'reason','account_restricted','requiresPurchase',false);
  end if;
  if v_user=v_offer."creator_id" or v_user=v_event."host_user_id" then
    return jsonb_build_object('allowed',true,'reason','creator_or_admin','requiresPurchase',false,
      'previewAuthority',true,'offer',public."paid_creator_event_safe_row"(v_offer));
  end if;
  if public."has_platform_role"(array['owner'::text,'operator'::text]) then
    return jsonb_build_object('allowed',true,'reason','creator_or_admin','requiresPurchase',false,
      'previewAuthority',true,'offer',public."paid_creator_event_safe_row"(v_offer));
  end if;
  if not public."wave1_creator_money_subject_authorized_internal"(v_offer."creator_id") then
    return jsonb_build_object('allowed',false,'reason','creator_authority_not_current','requiresPurchase',false,
      'offer',public."paid_creator_event_safe_row"(v_offer));
  end if;
  if exists (
    select 1 from public."channel_audience_blocks" block_row
    where (block_row."channel_user_id"=v_offer."creator_id"::text and block_row."blocked_user_id"=v_user::text)
       or (block_row."channel_user_id"=v_user::text and block_row."blocked_user_id"=v_offer."creator_id"::text)
  ) then
    return jsonb_build_object('allowed',false,'reason','blocked_by_creator','requiresPurchase',false,
      'offer',public."paid_creator_event_safe_row"(v_offer));
  end if;
  select pass_row.* into v_pass from public."paid_creator_event_passes" pass_row
  where pass_row."event_id"=v_offer."id" and pass_row."buyer_id"=v_user
    and pass_row."status"='active' and pass_row."refunded_at" is null
    and pass_row."revoked_at" is null
    and (pass_row."expires_at" is null or pass_row."expires_at">timezone('utc'::text,now()))
  order by pass_row."created_at" desc limit 1;
  if v_pass."id" is not null then
    begin
      v_identity:=public."creator_money_existing_purchase_identity_internal"(
        v_user,'event_pass',v_offer."creator_event_id"
      );
    exception when others then v_identity:=null;
    end;
    if v_identity is not null
      and (v_identity->>'accessGrantId')::uuid is not distinct from v_pass."access_grant_id"
      and v_identity->>'providerProductId' is not distinct from v_offer."provider_product_id"
    then
      return jsonb_build_object('allowed',true,'reason','event_pass_confirmed','requiresPurchase',false,
        'passId',v_pass."id",'offer',public."paid_creator_event_safe_row"(v_offer));
    end if;
  end if;
  if v_offer."status"='paused' then
    return jsonb_build_object('allowed',false,'reason','offer_paused','requiresPurchase',false,
      'offer',public."paid_creator_event_safe_row"(v_offer));
  end if;
  if v_offer."status"='blocked' then
    return jsonb_build_object('allowed',false,'reason','offer_blocked','requiresPurchase',false,
      'offer',public."paid_creator_event_safe_row"(v_offer));
  end if;
  if v_offer."status"='sold_out'
    or (v_offer."capacity_limit" is not null and v_offer."passes_sold">=v_offer."capacity_limit")
  then
    return jsonb_build_object('allowed',false,'reason','sold_out','requiresPurchase',false,
      'offer',public."paid_creator_event_safe_row"(v_offer));
  end if;
  return jsonb_build_object(
    'allowed',false,'reason','event_pass_required','requiresPurchase',true,
    'priceCents',v_offer."price_cents",'currency',v_offer."currency",
    'creatorId',v_offer."creator_id",'provider',v_offer."provider",
    'providerProductId',v_offer."provider_product_id",
    'providerProductKey',v_offer."provider_product_key",
    'offer',public."paid_creator_event_safe_row"(v_offer)
  );
end;
$$;

create or replace function public."resolve_creator_vip_pass_access"(p_creator_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_offer public."creator_vip_pass_offers"%rowtype;
  v_pass public."creator_vip_passes"%rowtype;
  v_identity jsonb;
begin
  if p_creator_id is null then
    return jsonb_build_object('allowed',false,'reason','creator_id_required','requiresPurchase',false);
  end if;
  select offer.* into v_offer from public."creator_vip_pass_offers" offer
  where offer."creator_id"=p_creator_id
    and offer."status" in ('sandbox','active','paused','blocked')
  order by offer."updated_at" desc limit 1;
  if v_offer."id" is null then
    return jsonb_build_object('allowed',false,'reason','vip_not_available','requiresPurchase',false);
  end if;
  if v_user is null then
    return jsonb_build_object('allowed',false,'reason','auth_required','requiresPurchase',true,
      'offer',public."creator_vip_pass_offer_safe_row"(v_offer));
  end if;
  if not public."wave1_current_caller_authority_internal"() then
    return jsonb_build_object('allowed',false,'reason','session_authority_not_current','requiresPurchase',false);
  end if;
  if public."is_account_access_restricted"(v_user::text) then
    return jsonb_build_object('allowed',false,'reason','account_restricted','requiresPurchase',false);
  end if;
  if v_user=p_creator_id then
    return jsonb_build_object('allowed',true,'reason','creator_or_admin','requiresPurchase',false,
      'previewAuthority',true,'offer',public."creator_vip_pass_offer_safe_row"(v_offer));
  end if;
  if public."has_platform_role"(array['owner'::text,'operator'::text]) then
    return jsonb_build_object('allowed',true,'reason','creator_or_admin','requiresPurchase',false,
      'previewAuthority',true,'offer',public."creator_vip_pass_offer_safe_row"(v_offer));
  end if;
  if not public."wave1_creator_money_subject_authorized_internal"(p_creator_id) then
    return jsonb_build_object('allowed',false,'reason','creator_authority_not_current','requiresPurchase',false,
      'offer',public."creator_vip_pass_offer_safe_row"(v_offer));
  end if;
  if exists (
    select 1 from public."channel_audience_blocks" block_row
    where (block_row."channel_user_id"=p_creator_id::text and block_row."blocked_user_id"=v_user::text)
       or (block_row."channel_user_id"=v_user::text and block_row."blocked_user_id"=p_creator_id::text)
  ) then
    return jsonb_build_object('allowed',false,'reason','blocked_by_creator','requiresPurchase',false,
      'offer',public."creator_vip_pass_offer_safe_row"(v_offer));
  end if;
  select pass_row.* into v_pass from public."creator_vip_passes" pass_row
  where pass_row."offer_id"=v_offer."id" and pass_row."fan_id"=v_user
    and pass_row."status"='active' and pass_row."refunded_at" is null
    and pass_row."revoked_at" is null
    and (pass_row."expires_at" is null or pass_row."expires_at">timezone('utc'::text,now()))
  order by pass_row."created_at" desc limit 1;
  if v_pass."id" is not null then
    begin
      v_identity:=public."creator_money_existing_purchase_identity_internal"(
        v_user,'vip_pass',v_offer."id"
      );
    exception when others then v_identity:=null;
    end;
    if v_identity is not null
      and (v_identity->>'accessGrantId')::uuid is not distinct from v_pass."access_grant_id"
      and v_identity->>'providerProductId' is not distinct from v_offer."provider_product_id"
    then
      return jsonb_build_object('allowed',true,'reason','vip_active','requiresPurchase',false,
        'vipPassId',v_pass."id",'offer',public."creator_vip_pass_offer_safe_row"(v_offer));
    end if;
  end if;
  if v_offer."status"='paused' then
    return jsonb_build_object('allowed',false,'reason','offer_paused','requiresPurchase',false,
      'offer',public."creator_vip_pass_offer_safe_row"(v_offer));
  end if;
  if v_offer."status"='blocked' then
    return jsonb_build_object('allowed',false,'reason','offer_blocked','requiresPurchase',false,
      'offer',public."creator_vip_pass_offer_safe_row"(v_offer));
  end if;
  return jsonb_build_object(
    'allowed',false,'reason','vip_required','requiresPurchase',true,
    'priceCents',v_offer."price_cents",'currency',v_offer."currency",
    'creatorId',v_offer."creator_id",'provider',v_offer."provider",
    'providerProductId',v_offer."provider_product_id",
    'providerProductKey',v_offer."provider_product_key",
    'offer',public."creator_vip_pass_offer_safe_row"(v_offer)
  );
end;
$$;

create or replace function public."resolve_creator_channel_subscription_access"(p_creator_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_offer public."creator_channel_subscription_offers"%rowtype;
  v_subscription public."creator_channel_subscriptions"%rowtype;
  v_identity jsonb;
begin
  if p_creator_id is null then
    return jsonb_build_object('allowed',false,'reason','creator_id_required','requiresPurchase',false);
  end if;
  select offer.* into v_offer from public."creator_channel_subscription_offers" offer
  where offer."creator_id"=p_creator_id
    and offer."status" in ('sandbox','active','paused','blocked')
  order by offer."updated_at" desc limit 1;
  if v_offer."id" is null then
    return jsonb_build_object('allowed',false,'reason','subscription_not_available','requiresPurchase',false);
  end if;
  if v_user is null then
    return jsonb_build_object('allowed',false,'reason','auth_required','requiresPurchase',true,
      'offer',public."channel_subscription_offer_safe_row"(v_offer));
  end if;
  if not public."wave1_current_caller_authority_internal"() then
    return jsonb_build_object('allowed',false,'reason','session_authority_not_current','requiresPurchase',false);
  end if;
  if public."is_account_access_restricted"(v_user::text) then
    return jsonb_build_object('allowed',false,'reason','account_restricted','requiresPurchase',false);
  end if;
  if not public."wave1_creator_money_subject_authorized_internal"(p_creator_id) then
    return jsonb_build_object('allowed',false,'reason','creator_authority_not_current','requiresPurchase',false,
      'offer',public."channel_subscription_offer_safe_row"(v_offer));
  end if;
  if v_user=p_creator_id then
    return jsonb_build_object('allowed',true,'reason','creator_or_admin','requiresPurchase',false,
      'previewAuthority',true,'offer',public."channel_subscription_offer_safe_row"(v_offer));
  end if;
  if public."has_platform_role"(array['owner'::text,'operator'::text]) then
    return jsonb_build_object('allowed',true,'reason','creator_or_admin','requiresPurchase',false,
      'previewAuthority',true,'offer',public."channel_subscription_offer_safe_row"(v_offer));
  end if;
  if exists (
    select 1 from public."channel_audience_blocks" block_row
    where (block_row."channel_user_id"=p_creator_id::text and block_row."blocked_user_id"=v_user::text)
       or (block_row."channel_user_id"=v_user::text and block_row."blocked_user_id"=p_creator_id::text)
  ) then
    return jsonb_build_object('allowed',false,'reason','blocked_by_creator','requiresPurchase',false,
      'offer',public."channel_subscription_offer_safe_row"(v_offer));
  end if;
  select subscription.* into v_subscription
  from public."creator_channel_subscriptions" subscription
  where subscription."offer_id"=v_offer."id" and subscription."subscriber_id"=v_user
    and subscription."status" in ('active','trialing','grace_period','cancel_pending')
    and subscription."current_period_end" is not null
    and subscription."current_period_end">timezone('utc'::text,now())
    and subscription."revoked_at" is null and subscription."expired_at" is null
  order by subscription."updated_at" desc limit 1;
  if v_subscription."id" is not null then
    begin
      v_identity:=public."creator_money_existing_purchase_identity_internal"(
        v_user,'channel_subscription',v_offer."id"
      );
    exception when others then v_identity:=null;
    end;
    if v_identity is not null
      and (v_identity->>'accessGrantId')::uuid is not distinct from v_subscription."access_grant_id"
      and v_identity->>'providerProductId' is not distinct from v_offer."provider_product_id"
    then
      return jsonb_build_object(
        'allowed',true,
        'reason',case when v_subscription."status"='cancel_pending' then 'subscription_cancel_pending' else 'subscription_active' end,
        'requiresPurchase',false,'subscriptionId',v_subscription."id",
        'subscriptionStatus',v_subscription."status",
        'currentPeriodEnd',v_subscription."current_period_end",
        'offer',public."channel_subscription_offer_safe_row"(v_offer)
      );
    end if;
  end if;
  if v_offer."status"='paused' then
    return jsonb_build_object('allowed',false,'reason','offer_paused','requiresPurchase',false,
      'offer',public."channel_subscription_offer_safe_row"(v_offer));
  end if;
  if v_offer."status"='blocked' then
    return jsonb_build_object('allowed',false,'reason','offer_blocked','requiresPurchase',false,
      'offer',public."channel_subscription_offer_safe_row"(v_offer));
  end if;
  return jsonb_build_object(
    'allowed',false,'reason','subscription_required','requiresPurchase',true,
    'priceCents',v_offer."price_cents",'currency',v_offer."currency",
    'creatorId',v_offer."creator_id",'provider',v_offer."provider",
    'providerProductId',v_offer."provider_product_id",
    'providerProductKey',v_offer."provider_product_key",
    'providerEntitlementId',v_offer."provider_entitlement_id",
    'offer',public."channel_subscription_offer_safe_row"(v_offer)
  );
end;
$$;

revoke all on function public."resolve_paid_watch_party_ticket_access"(text) from public,anon;
revoke all on function public."resolve_paid_creator_event_pass_access"(uuid) from public,anon;
revoke all on function public."resolve_creator_vip_pass_access"(uuid) from public,anon;
revoke all on function public."resolve_creator_channel_subscription_access"(uuid) from public,anon;
grant execute on function public."resolve_paid_watch_party_ticket_access"(text) to authenticated,service_role;
grant execute on function public."resolve_paid_creator_event_pass_access"(uuid) to authenticated,service_role;
grant execute on function public."resolve_creator_vip_pass_access"(uuid) to authenticated,service_role;
grant execute on function public."resolve_creator_channel_subscription_access"(uuid) to authenticated,service_role;

-- Preserve the historical event-pass response shape, but remove its caller-
-- selected subject. The canonical event resolver performs the exact provider
-- chain, current-session, restriction, creator, and offer checks.
create or replace function public."has_event_pass_access"(
  p_user_id uuid,
  p_event_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_access jsonb;
  v_allowed boolean:=false;
begin
  if v_user is null then
    return jsonb_build_object(
      'allowed',false,'status','missing','reason','auth_required',
      'requiresPurchase',true,'canView',false,'canEnter',false,
      'canPublish',false,'approvalRequired',false
    );
  end if;
  if p_user_id is distinct from v_user
    or not public."wave1_current_caller_authority_internal"()
  then
    return jsonb_build_object(
      'allowed',false,'status','blocked','reason','subject_authority_required',
      'requiresPurchase',false,'canView',false,'canEnter',false,
      'canPublish',false,'approvalRequired',false
    );
  end if;
  v_access:=public."resolve_paid_creator_event_pass_access"(p_event_id);
  v_allowed:=coalesce((v_access->>'allowed')::boolean,false);
  return v_access||jsonb_build_object(
    'status',case when v_allowed then 'active' else coalesce(v_access->>'reason','missing') end,
    'canView',v_allowed,'canEnter',v_allowed,'canPublish',false,
    'approvalRequired',coalesce((v_access->>'previewAuthority')::boolean,false)
  );
end;
$$;
revoke all on function public."has_event_pass_access"(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public."has_event_pass_access"(uuid,uuid)
  to authenticated;

-- Converge every already-exposed Seat Pass room to ticket-gated truth and evict
-- non-host memberships admitted while the stale room policy still said open.
-- Ticket owners re-enter through the exact proof path below.
update public."paid_watch_party_offers" offer
set "metadata"=coalesce(offer."metadata",'{}'::jsonb) || jsonb_build_object(
      'pre_paid_content_access_rule',room."content_access_rule"
    ),
    "updated_at"=timezone('utc'::text,now())
from public."watch_party_rooms" room
where offer."party_id"=room."party_id"
  and offer."status" in ('sandbox','active','paused','sold_out','blocked')
  and nullif(offer."metadata"->>'pre_paid_content_access_rule','') is null;
update public."watch_party_rooms" room
set "content_access_rule"='party_pass',"updated_at"=timezone('utc'::text,now())
from public."paid_watch_party_offers" offer
where offer."party_id"=room."party_id"
  and offer."status" in ('sandbox','active','paused','sold_out','blocked')
  and room."content_access_rule"<>'party_pass';
update public."watch_party_room_memberships" membership
set "role"='viewer',"stage_role"='listener',"can_speak"=false,
    "camera_enabled"=false,"mic_enabled"=false,"membership_state"='removed',
    "left_at"=coalesce(membership."left_at",timezone('utc'::text,now())),
    "updated_at"=timezone('utc'::text,now())
from public."watch_party_rooms" room
where room."party_id"=membership."party_id"
  and room."content_access_rule"='party_pass'
  and room."host_user_id"::text<>membership."user_id"
  and membership."membership_state" in ('active','reconnecting')
  and exists (
    select 1 from public."paid_watch_party_offers" offer
    where offer."party_id"=room."party_id"
      and offer."status" in ('sandbox','active','paused','sold_out','blocked')
  );

-- Exact Seat Pass room admission. A ticket is untrusted unless its consumed
-- purchase intent, durable original transaction, provider event, grant, offer,
-- creator authority, and target party all agree.
create or replace function public."watch_party_room_self_access_allowed_internal"(
  p_party_id text,
  p_user_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_auth_user text := auth.uid()::text;
  v_request_role text := auth.role();
  v_room public."watch_party_rooms"%rowtype;
  v_paid_ticket_required boolean := false;
begin
  if nullif(trim(coalesce(p_party_id, '')), '') is null
    or nullif(trim(coalesce(p_user_id, '')), '') is null
  then
    return false;
  end if;
  select room.* into v_room
  from public."watch_party_rooms" room
  where room."party_id" = p_party_id;
  if v_room."party_id" is null then return false; end if;
  if v_request_role is distinct from 'service_role'
    and (
      v_auth_user is null
      or not public."wave1_current_caller_authority_internal"()
      or (v_auth_user<>p_user_id and v_auth_user<>v_room."host_user_id"::text)
    )
  then
    return false;
  end if;
  if coalesce(v_room."is_active",false) is not true then return false; end if;
  select exists (
    select 1
    from public."paid_watch_party_offers" offer
    where offer."party_id" = p_party_id
      and offer."status" in ('sandbox','active','paused','sold_out','blocked')
  ) into v_paid_ticket_required;
  if v_room."host_user_id"::text = p_user_id then
    if not v_paid_ticket_required then return true; end if;
    return not public."revenuecat_authority_quarantined_internal"(
        null,v_room."host_user_id",null
      )
      and public."wave1_creator_money_subject_authorized_internal"(v_room."host_user_id")
      and exists (
        select 1 from public."paid_watch_party_offers" offer
        where offer."party_id"=p_party_id
          and offer."creator_id"=v_room."host_user_id"
          and offer."status" in ('sandbox','active','sold_out')
          and (offer."starts_at" is null or offer."starts_at"<=timezone('utc'::text,now()))
          and (offer."ends_at" is null or offer."ends_at">timezone('utc'::text,now()))
      );
  end if;
  if v_room."join_policy" <> 'open'
    or coalesce(v_room."is_active", false) is not true
    or public."watch_party_room_actor_blocked_by_host"(p_party_id, p_user_id)
  then
    return false;
  end if;

  if not v_paid_ticket_required and v_room."content_access_rule" = 'open' then return true; end if;
  if not v_paid_ticket_required and v_room."content_access_rule" = 'party_pass' and exists (
    select 1 from public."user_entitlements" entitlement
    where entitlement."user_id" = p_user_id
      and entitlement."entitlement_key"='premium'
      and entitlement."status" in ('active','trialing','grace_period')
      and entitlement."revoked_at" is null
      and public."premium_subject_has_finite_authority_internal"(p_user_id)
  ) then return true; end if;
  if not v_paid_ticket_required and v_room."content_access_rule" = 'premium' and exists (
    select 1 from public."user_entitlements" entitlement
    where entitlement."user_id" = p_user_id
      and entitlement."entitlement_key" = any(case
        when v_room."room_type" = 'live' then array['premium'::text]
        when v_room."room_type" = 'title' then array['premium'::text]
        else array['premium'::text] end)
      and entitlement."status" in ('active','trialing','grace_period')
      and entitlement."revoked_at" is null
      and entitlement."entitlement_key"='premium'
      and public."premium_subject_has_finite_authority_internal"(p_user_id)
  ) then return true; end if;

  return exists (
    select 1
    from public."access_grants" grant_row
    join public."paid_watch_party_offers" offer
      on offer."id" = grant_row."source_id"
     and offer."party_id" = p_party_id
    join public."provider_events" provider_event
      on provider_event."id" = grant_row."provider_event_id"
     and provider_event."provider" in ('revenuecat_app_store','revenuecat_google_play')
     and provider_event."provider" = grant_row."provider"
     and provider_event."status" = 'processed'
     and provider_event."user_id"::text = p_user_id
     and not public."revenuecat_authority_quarantined_internal"(
       provider_event."provider",provider_event."user_id",provider_event."environment"
     )
    join public."money_purchase_intents" intent
      on intent."id"::text = grant_row."metadata"->>'purchase_intent_id'
     and intent."user_id"::text = p_user_id
     and intent."source_id" = offer."id"
     and intent."creator_id" = offer."creator_id"
     and intent."provider" = provider_event."provider"
     and intent."provider_product_id" = provider_event."metadata"->>'provider_product_id'
     and intent."status" = 'consumed'
    join public."revenuecat_consumable_transaction_intents" transaction_link
      on transaction_link."purchase_intent_id" = intent."id"
     and transaction_link."provider" = provider_event."provider"
     and transaction_link."original_transaction_id" = grant_row."metadata"->>'original_transaction_id'
     and transaction_link."binding_state" = 'exact'
     and not transaction_link."terminal"
    join public."paid_watch_party_tickets" ticket
      on ticket."access_grant_id"=grant_row."id"
     and ticket."offer_id"=offer."id"
     and ticket."party_id"=offer."party_id"
     and ticket."buyer_id"=grant_row."user_id"
     and ticket."status"='active'
     and ticket."refunded_at" is null
     and ticket."revoked_at" is null
     and (ticket."expires_at" is null or ticket."expires_at">timezone('utc'::text,now()))
    where grant_row."user_id"::text = p_user_id
      and grant_row."grant_type" = 'watch_party_live_ticket'
      and grant_row."source_type" = 'provider_event'
      and grant_row."status" in ('active','sandbox_only')
      and grant_row."starts_at" <= timezone('utc'::text, now())
      and (grant_row."expires_at" is null or grant_row."expires_at" > timezone('utc'::text, now()))
      and grant_row."refunded_at" is null
      and grant_row."revoked_at" is null
      and offer."status" in ('sandbox','active','sold_out')
      and (offer."starts_at" is null or offer."starts_at" <= timezone('utc'::text, now()))
      and (offer."ends_at" is null or offer."ends_at" > timezone('utc'::text, now()))
      and coalesce((grant_row."metadata"->>'viewer_access_only')::boolean, false)
      and not coalesce((grant_row."metadata"->>'authority_granted')::boolean, false)
      and not coalesce((grant_row."metadata"->>'speaker_authority')::boolean, false)
      and not coalesce((grant_row."metadata"->>'moderator_authority')::boolean, false)
      and not coalesce((grant_row."metadata"->>'payout_access')::boolean, false)
      and not coalesce((grant_row."metadata"->>'premium_unlock')::boolean, false)
      and public."wave1_creator_money_subject_authorized_internal"(offer."creator_id")
  );
end;
$$;
revoke all on function public."watch_party_room_self_access_allowed_internal"(text,text) from public, anon, authenticated, service_role;

create or replace function public."resolve_watch_party_livekit_viewer_authority"(
  p_party_id text,
  p_user_id uuid,
  p_session_generation uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz:=timezone('utc'::text,now());
  v_paid_required boolean := false;
  v_allowed boolean := false;
  v_is_host boolean := false;
  v_expires_at timestamptz;
begin
  if p_user_id is null or p_session_generation is null
    or nullif(trim(coalesce(p_party_id,'')),'') is null
    or public."is_account_access_restricted"(p_user_id::text)
    or not public."money_purchase_intent_session_authorized_internal"(
      p_user_id,p_session_generation::text
    )
  then
    return jsonb_build_object('allowed',false,'paidSeatRequired',false,'hostAuthority',false,'expiresAt',null,'reason','viewer_authority_invalid');
  end if;
  select exists (
    select 1 from public."paid_watch_party_offers" offer
    where offer."party_id"=p_party_id
      and offer."status" in ('sandbox','active','paused','sold_out','blocked')
  ) into v_paid_required;
  select exists (
    select 1 from public."watch_party_rooms" room
    where room."party_id"=p_party_id and room."host_user_id"=p_user_id
  ) into v_is_host;
  if v_is_host and v_paid_required and (
    public."revenuecat_authority_quarantined_internal"(null,p_user_id,null)
    or not public."wave1_creator_money_subject_authorized_internal"(p_user_id)
    or not exists (
      select 1 from public."paid_watch_party_offers" offer
      where offer."party_id"=p_party_id and offer."creator_id"=p_user_id
        and offer."status" in ('sandbox','active','sold_out')
        and (offer."starts_at" is null or offer."starts_at"<=v_now)
        and (offer."ends_at" is null or offer."ends_at">v_now)
    )
  ) then
    return jsonb_build_object(
      'allowed',false,'paidSeatRequired',true,'hostAuthority',true,
      'expiresAt',null,'reason','paid_room_host_creator_authority_required'
    );
  end if;
  v_allowed := public."watch_party_room_self_access_allowed_internal"(p_party_id,p_user_id::text);
  if not v_allowed then
    return jsonb_build_object(
      'allowed',false,'paidSeatRequired',v_paid_required,'hostAuthority',v_is_host,'expiresAt',null,
      'reason',case when v_paid_required then 'exact_paid_seat_authority_required' else 'room_viewer_authority_required' end
    );
  end if;
  if v_is_host then
    if v_paid_required then
      select least(coalesce(max(offer."ends_at"),v_now+interval '30 seconds'),v_now+interval '30 seconds')
      into v_expires_at
      from public."paid_watch_party_offers" offer
      where offer."party_id"=p_party_id
        and offer."creator_id"=p_user_id
        and offer."status" in ('sandbox','active','sold_out')
        and (offer."starts_at" is null or offer."starts_at"<=v_now)
        and (offer."ends_at" is null or offer."ends_at">v_now);
      return jsonb_build_object(
        'allowed',true,'paidSeatRequired',true,'hostAuthority',true,
        'expiresAt',v_expires_at,'reason','paid_room_host_authority'
      );
    end if;
    return jsonb_build_object(
      'allowed',true,'paidSeatRequired',false,'hostAuthority',true,
      'expiresAt',null,'reason','non_seat_room_host_authority'
    );
  end if;
  if not v_paid_required then
    return jsonb_build_object('allowed',true,'paidSeatRequired',false,'hostAuthority',false,'expiresAt',null,'reason','non_seat_room_authority');
  end if;

  select least(ticket."expires_at",grant_row."expires_at",offer."ends_at") into v_expires_at
  from public."access_grants" grant_row
  join public."paid_watch_party_offers" offer
    on offer."id"=grant_row."source_id" and offer."party_id"=p_party_id
   and offer."status" in ('sandbox','active','sold_out')
  join public."provider_events" provider_event
    on provider_event."id"=grant_row."provider_event_id"
   and provider_event."provider" in ('revenuecat_app_store','revenuecat_google_play')
   and provider_event."provider"=grant_row."provider" and provider_event."status"='processed'
   and provider_event."user_id"=p_user_id
   and not public."revenuecat_authority_quarantined_internal"(
     provider_event."provider",provider_event."user_id",provider_event."environment"
   )
  join public."money_purchase_intents" intent
    on intent."id"::text=grant_row."metadata"->>'purchase_intent_id'
   and intent."user_id"=p_user_id and intent."source_id"=offer."id"
   and intent."creator_id"=offer."creator_id" and intent."provider"=provider_event."provider"
   and intent."provider_product_id"=provider_event."metadata"->>'provider_product_id'
   and intent."status"='consumed'
  join public."revenuecat_consumable_transaction_intents" transaction_link
    on transaction_link."purchase_intent_id"=intent."id" and transaction_link."provider"=provider_event."provider"
   and transaction_link."original_transaction_id"=grant_row."metadata"->>'original_transaction_id'
   and transaction_link."binding_state"='exact' and not transaction_link."terminal"
  join public."paid_watch_party_tickets" ticket
    on ticket."access_grant_id"=grant_row."id" and ticket."offer_id"=offer."id"
   and ticket."party_id"=offer."party_id" and ticket."buyer_id"=p_user_id
   and ticket."status"='active' and ticket."refunded_at" is null and ticket."revoked_at" is null
   and (ticket."expires_at" is null or ticket."expires_at">timezone('utc'::text,now()))
  where grant_row."user_id"=p_user_id and grant_row."grant_type"='watch_party_live_ticket'
    and grant_row."source_type"='provider_event' and grant_row."status" in ('active','sandbox_only')
    and grant_row."starts_at"<=timezone('utc'::text,now())
    and (grant_row."expires_at" is null or grant_row."expires_at">timezone('utc'::text,now()))
    and grant_row."refunded_at" is null and grant_row."revoked_at" is null
    and (offer."ends_at" is null or offer."ends_at">timezone('utc'::text,now()))
    and coalesce((grant_row."metadata"->>'viewer_access_only')::boolean,false)
    and not coalesce((grant_row."metadata"->>'authority_granted')::boolean,false)
    and not coalesce((grant_row."metadata"->>'speaker_authority')::boolean,false)
    and not coalesce((grant_row."metadata"->>'moderator_authority')::boolean,false)
    and not coalesce((grant_row."metadata"->>'payout_access')::boolean,false)
    and not coalesce((grant_row."metadata"->>'premium_unlock')::boolean,false)
  order by grant_row."created_at" desc,grant_row."id" desc limit 1;
  v_expires_at:=least(coalesce(v_expires_at,v_now+interval '30 seconds'),v_now+interval '30 seconds');
  return jsonb_build_object(
    'allowed',true,'paidSeatRequired',true,'hostAuthority',false,'expiresAt',v_expires_at,
    'reason','exact_paid_seat_viewer_authority'
  );
end;
$$;
revoke all on function public."resolve_watch_party_livekit_viewer_authority"(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public."resolve_watch_party_livekit_viewer_authority"(text,uuid,uuid) to service_role;
comment on function public."resolve_watch_party_livekit_viewer_authority"(text,uuid,uuid) is
  'Service-only exact viewer authority and effective Seat expiry for short-lived LiveKit token minting; never grants publish, host, speaker, moderator, Premium, or payout authority.';

alter table public."watch_party_room_memberships" alter column "mic_enabled" set default false;
update public."watch_party_room_memberships" membership
set "role" = 'viewer',
    "stage_role" = 'listener',
    "can_speak" = false,
    "camera_enabled" = false,
    "mic_enabled" = false,
    "updated_at" = timezone('utc'::text, now())
from public."watch_party_rooms" room
where room."party_id" = membership."party_id"
  and room."host_user_id"::text <> membership."user_id"
  and membership."membership_state" in ('active','reconnecting')
  and (
    membership."role" <> 'viewer'
    or membership."stage_role" <> 'listener'
    or membership."can_speak"
    or membership."camera_enabled"
    or membership."mic_enabled"
  );

create or replace function public."enforce_watch_party_room_membership_authority_closeout_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_request_role text := auth.role();
  v_host uuid;
  v_paid_required boolean:=false;
begin
  if v_request_role = 'service_role' then
    return new;
  end if;
  select room."host_user_id" into v_host
  from public."watch_party_rooms" room
  where room."party_id" = new."party_id";
  if v_actor is null then raise exception 'room_membership_auth_required'; end if;
  if v_actor = v_host then
    if new."user_id"=v_actor::text then
      if new."membership_state" in ('active','reconnecting')
        and not public."watch_party_room_self_access_allowed_internal"(
          new."party_id",new."user_id"
        )
      then
        raise exception 'paid_room_host_creator_authority_required';
      end if;
      return new;
    end if;
    select exists (
      select 1 from public."paid_watch_party_offers" offer
      where offer."party_id"=new."party_id"
        and offer."status" in ('sandbox','active','paused','sold_out','blocked')
    ) into v_paid_required;
    if not v_paid_required then return new; end if;
    if new."membership_state" in ('active','reconnecting')
      and not public."watch_party_room_self_access_allowed_internal"(
        new."party_id",new."user_id"
      )
    then
      raise exception 'paid_room_host_membership_access_required';
    end if;
    if new."role"<>'viewer' or new."stage_role"<>'listener'
      or new."can_speak" or new."camera_enabled" or new."mic_enabled"
    then
      raise exception 'paid_room_host_membership_escalation_forbidden';
    end if;
    return new;
  end if;
  if new."user_id" <> v_actor::text then raise exception 'room_membership_identity_mismatch'; end if;

  if new."membership_state" in ('active','reconnecting')
    and not public."watch_party_room_self_access_allowed_internal"(new."party_id", new."user_id")
  then
    raise exception 'room_membership_access_required';
  end if;
  if new."role" <> 'viewer'
    or new."stage_role" <> 'listener'
    or new."can_speak"
    or new."camera_enabled"
    or new."mic_enabled"
  then
    raise exception 'room_membership_self_escalation_forbidden';
  end if;
  return new;
end;
$$;
revoke all on function public."enforce_watch_party_room_membership_authority_closeout_internal"() from public, anon, authenticated, service_role;
drop trigger if exists "enforce_watch_party_room_membership_authority_closeout" on public."watch_party_room_memberships";
create trigger "enforce_watch_party_room_membership_authority_closeout"
before insert or update on public."watch_party_room_memberships"
for each row execute function public."enforce_watch_party_room_membership_authority_closeout_internal"();

-- A Seat Pass terminal transition removes the exact same-party non-host
-- membership in the provider transaction. This prevents a refunded ticket from
-- leaving durable room presence or LiveKit-publish-shaped membership state.
create or replace function public."remove_terminal_seat_membership_internal"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_party_id text;
begin
  if new."grant_type" <> 'watch_party_live_ticket'
    or old."status" not in ('active','sandbox_only')
    or new."status" not in ('refunded','revoked','expired','blocked')
  then
    return new;
  end if;
  select offer."party_id" into v_party_id
  from public."paid_watch_party_offers" offer
  where offer."id" = new."source_id"
    and offer."creator_id" is not null;
  if v_party_id is null then return new; end if;

  update public."watch_party_room_memberships" membership
  set "role" = 'viewer',
      "stage_role" = 'listener',
      "can_speak" = false,
      "camera_enabled" = false,
      "mic_enabled" = false,
      "membership_state" = 'removed',
      "left_at" = coalesce(membership."left_at", timezone('utc'::text, now())),
      "updated_at" = timezone('utc'::text, now())
  from public."watch_party_rooms" room
  where membership."party_id" = v_party_id
    and membership."user_id" = new."user_id"::text
    and membership."membership_state" in ('active','reconnecting')
    and room."party_id" = membership."party_id"
    and room."host_user_id"::text <> membership."user_id";
  return new;
end;
$$;
revoke all on function public."remove_terminal_seat_membership_internal"() from public, anon, authenticated, service_role;
drop trigger if exists "remove_terminal_seat_membership" on public."access_grants";
create trigger "remove_terminal_seat_membership"
after update of "status" on public."access_grants"
for each row execute function public."remove_terminal_seat_membership_internal"();

-- RLS may expose only an exact-self predicate.  The subject-parameterized
-- proof remains trigger/service-internal so it cannot become a cross-user
-- Seat-entitlement oracle merely because a policy needs to invoke it.
create or replace function public."watch_party_room_current_user_access_allowed"(
  p_party_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and public."wave1_current_caller_authority_internal"()
    and public."watch_party_room_self_access_allowed_internal"(
      p_party_id,auth.uid()::text
    );
$$;
revoke all on function public."watch_party_room_current_user_access_allowed"(text)
  from public,anon,authenticated,service_role;
grant execute on function public."watch_party_room_current_user_access_allowed"(text)
  to authenticated;

drop policy if exists "watch_party_room_memberships_self_insert_policy" on public."watch_party_room_memberships";
create policy "watch_party_room_memberships_self_insert_policy"
on public."watch_party_room_memberships"
for insert to authenticated
with check (
  auth.uid() is not null
  and "user_id" = auth.uid()::text
  and exists (
    select 1 from public."watch_party_rooms" room
    where room."party_id" = watch_party_room_memberships."party_id"
      and (
        room."host_user_id" = auth.uid()
        or (
          watch_party_room_memberships."role" = 'viewer'
          and watch_party_room_memberships."stage_role" = 'listener'
          and not watch_party_room_memberships."can_speak"
          and not watch_party_room_memberships."camera_enabled"
          and not watch_party_room_memberships."mic_enabled"
          and public."watch_party_room_current_user_access_allowed"(
            watch_party_room_memberships."party_id"
          )
        )
      )
  )
);

drop policy if exists "watch_party_room_memberships_self_update_policy" on public."watch_party_room_memberships";
create policy "watch_party_room_memberships_self_update_policy"
on public."watch_party_room_memberships"
for update to authenticated
using (auth.uid() is not null and "user_id" = auth.uid()::text)
with check (
  auth.uid() is not null
  and "user_id" = auth.uid()::text
  and exists (
    select 1 from public."watch_party_rooms" room
    where room."party_id" = watch_party_room_memberships."party_id"
      and (
        room."host_user_id" = auth.uid()
        or (
          watch_party_room_memberships."role" = 'viewer'
          and watch_party_room_memberships."stage_role" = 'listener'
          and not watch_party_room_memberships."can_speak"
          and not watch_party_room_memberships."camera_enabled"
          and not watch_party_room_memberships."mic_enabled"
          and (
            watch_party_room_memberships."membership_state" in ('left','removed')
            or public."watch_party_room_current_user_access_allowed"(
              watch_party_room_memberships."party_id"
            )
          )
        )
      )
  )
);
revoke insert, update, delete on table public."watch_party_room_memberships" from anon;

comment on function public."watch_party_room_self_access_allowed_internal"(text,text) is
  'Exact current room-access proof: global entitlement or one same-party, provider-finalized, nonterminal viewer-only Seat Pass binding.';

-- Creator-video visibility is an authorization decision, not a caller-chosen
-- relationship oracle.  Both the RLS helper and public resolver derive the
-- viewer exclusively from auth.uid(); an explicit mismatching subject fails
-- closed without disclosing the target video's owner/block/circle state.
create or replace function public."can_read_creator_video_row"(
  p_owner_user_id text,
  p_visibility text,
  p_moderation_status text,
  p_scan_status text,
  p_storage_path text,
  p_storage_object_key text,
  p_playback_url text,
  p_viewer_user_id text default (auth.uid())::text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner text:=nullif(pg_catalog.btrim(coalesce(p_owner_user_id,'')),'');
  v_viewer text:=(auth.uid())::text;
  v_requested text:=nullif(pg_catalog.btrim(coalesce(p_viewer_user_id,'')),'');
  v_visibility text:=coalesce(nullif(pg_catalog.btrim(coalesce(p_visibility,'')),''),'draft');
  v_moderation text:=coalesce(nullif(pg_catalog.btrim(coalesce(p_moderation_status,'')),''),'clean');
  v_scan text:=coalesce(nullif(pg_catalog.btrim(coalesce(p_scan_status,'')),''),'pending_scan');
  v_video_ids uuid[];
  v_price public."creator_content_prices"%rowtype;
  v_access jsonb;
begin
  if (v_requested is not null and v_requested is distinct from v_viewer) or v_owner is null then return false; end if;
  if v_viewer is not null and not public."wave1_current_caller_authority_internal"() then return false; end if;
  if v_viewer is not null and v_viewer=v_owner then return true; end if;
  if public."is_account_access_restricted"(v_owner)
    or (v_viewer is not null and public."is_account_access_restricted"(v_viewer))
    or v_moderation not in ('clean','reported')
    or not public."media_scan_public_safe"(v_scan)
    or not public."is_creator_video_playable_source"(p_storage_path,p_storage_object_key,p_playback_url)
    or (v_viewer is not null and public."is_creator_video_viewer_blocked"(v_owner,v_viewer))
    or not (
      v_visibility='public'
      or (v_visibility='circle' and v_viewer is not null
        and public."is_active_chilly_circle_member"(v_owner,v_viewer))
    )
  then return false; end if;

  select array_agg(video."id" order by video."id") into v_video_ids
  from public."videos" video
  where video."owner_id"::text=v_owner
    and video."storage_path" is not distinct from p_storage_path
    and video."storage_object_key" is not distinct from p_storage_object_key
    and video."playback_url" is not distinct from p_playback_url;
  if coalesce(cardinality(v_video_ids),0)<>1 then return false; end if;
  if exists (
    select 1 from public."videos" video
    where video."id"=v_video_ids[1] and video."quarantined_at" is not null
  ) then return false; end if;
  select price.* into v_price
  from public."creator_content_prices" price
  where price."content_type"='creator_video' and price."content_id"=v_video_ids[1]
    and price."creator_id"::text=v_owner
  order by price."updated_at" desc,price."id" desc limit 1;
  if v_price."id" is null or not coalesce(v_price."is_paid",false) then return true; end if;
  v_access:=public."resolve_creator_content_access"('creator_video',v_video_ids[1]);
  return coalesce((v_access->>'allowed')::boolean,false);
end;
$$;
revoke all on function public."can_read_creator_video_row"(
  text,text,text,text,text,text,text,text
) from public,anon,authenticated,service_role;
grant execute on function public."can_read_creator_video_row"(
  text,text,text,text,text,text,text,text
) to anon,authenticated;
comment on function public."can_read_creator_video_row"(
  text,text,text,text,text,text,text,text
) is 'Exact-caller creator-video RLS/storage helper. Caller-supplied viewer identity cannot substitute for auth.uid(); a paid row is readable only through the canonical provider-backed content resolver.';

create or replace function public."resolve_creator_video_visibility_access"(
  p_video_id text,
  p_viewer_user_id text default (auth.uid())::text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_video_id uuid;
  v_viewer_user_id text := (auth.uid())::text;
  v_requested_viewer_user_id text := nullif(pg_catalog.btrim(coalesce(p_viewer_user_id,'')),'');
  v_video public."videos"%rowtype;
  v_owner_user_id text;
  v_visibility text := 'draft';
  v_is_owner boolean := false;
  v_is_blocked boolean := false;
  v_is_circle_member boolean := false;
  v_has_playable_source boolean := false;
  v_allowed boolean := false;
  v_reason text := 'unavailable';
begin
  if v_viewer_user_id is not null and not public."wave1_current_caller_authority_internal"() then
    return jsonb_build_object(
      'allowed',false,'visibility','draft','reason','session_authority_not_current',
      'is_owner',false,'is_blocked',false,'is_circle_member',false,
      'has_playable_source',false,'viewer_user_id',v_viewer_user_id,'owner_user_id',null
    );
  end if;
  if v_requested_viewer_user_id is not null
    and v_requested_viewer_user_id is distinct from v_viewer_user_id
  then
    return jsonb_build_object(
      'allowed',false,'visibility','draft','reason','viewer_identity_mismatch',
      'is_owner',false,'is_blocked',false,'is_circle_member',false,
      'has_playable_source',false,'viewer_user_id',v_viewer_user_id,'owner_user_id',null
    );
  end if;
  begin
    v_video_id:=nullif(pg_catalog.btrim(coalesce(p_video_id,'')),'')::uuid;
  exception when others then
    v_video_id:=null;
  end;
  if v_video_id is null then
    return jsonb_build_object(
      'allowed',false,'visibility',v_visibility,'reason','not_found',
      'is_owner',false,'is_blocked',false,'is_circle_member',false,
      'has_playable_source',false,'viewer_user_id',v_viewer_user_id,'owner_user_id',null
    );
  end if;
  select video.* into v_video
  from public."videos" video
  where video."id"=v_video_id
  limit 1;
  if v_video."id" is null then
    return jsonb_build_object(
      'allowed',false,'visibility',v_visibility,'reason','not_found',
      'is_owner',false,'is_blocked',false,'is_circle_member',false,
      'has_playable_source',false,'viewer_user_id',v_viewer_user_id,'owner_user_id',null
    );
  end if;
  v_owner_user_id:=v_video."owner_id"::text;
  v_visibility:=coalesce(nullif(v_video."visibility",''),'draft');
  if v_visibility not in ('draft','circle','public') then v_visibility:='draft'; end if;
  v_is_owner:=v_viewer_user_id is not null and v_viewer_user_id=v_owner_user_id;
  v_has_playable_source:=public."is_creator_video_playable_source"(
    v_video."storage_path",v_video."storage_object_key",v_video."playback_url"
  );
  if v_viewer_user_id is not null and not v_is_owner then
    v_is_blocked:=public."is_creator_video_viewer_blocked"(
      v_owner_user_id,v_viewer_user_id
    );
    v_is_circle_member:=public."is_active_chilly_circle_member"(
      v_owner_user_id,v_viewer_user_id
    );
  end if;
  if v_is_blocked then v_reason:='blocked';
  elsif v_is_owner then v_allowed:=true; v_reason:='owner_allowed';
  elsif v_video."moderation_status" not in ('clean','reported') then v_reason:='moderation_unavailable';
  elsif not public."media_scan_public_safe"(v_video."scan_status") then v_reason:='scan_unavailable';
  elsif not v_has_playable_source then v_reason:='media_unavailable';
  elsif v_visibility='public' then v_allowed:=true; v_reason:='public_allowed';
  elsif v_visibility='circle' and v_is_circle_member then
    v_allowed:=true; v_reason:='circle_member_allowed';
  elsif v_visibility='circle' then
    v_reason:=case when v_viewer_user_id is null
      then 'signed_out_requires_circle' else 'circle_member_required' end;
  elsif v_visibility='draft' then v_reason:='draft_owner_only';
  end if;
  return jsonb_build_object(
    'allowed',v_allowed,'visibility',v_visibility,'reason',v_reason,
    'is_owner',v_is_owner,'is_blocked',v_is_blocked,
    'is_circle_member',v_is_circle_member,'has_playable_source',v_has_playable_source,
    'viewer_user_id',v_viewer_user_id,'owner_user_id',v_owner_user_id
  );
end;
$$;
revoke all on function public."resolve_creator_video_visibility_access"(text,text)
  from public,anon,authenticated,service_role;
grant execute on function public."resolve_creator_video_visibility_access"(text,text)
  to anon,authenticated;
comment on function public."resolve_creator_video_visibility_access"(text,text) is
  'Exact-caller creator-video visibility resolver. Explicit viewer substitution is rejected before any relationship or video data is read.';

-- Canonical paid-video resolver. Legacy content_access_grants and generic grant
-- lookups are not authority: a purchaser must have one exact provider event ->
-- consumed intent -> original transaction -> nonterminal paid-content grant.
-- Owner/staff preview is explicit non-money authority; public free content does
-- not depend on creator-money eligibility, while every exposed paid offer does.
create or replace function public."resolve_creator_content_access"(
  p_content_type text,
  p_content_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid:=auth.uid();
  v_video public."videos"%rowtype;
  v_price public."creator_content_prices"%rowtype;
  v_is_staff boolean:=false;
  v_grant_status text;
  v_grant_environment text;
begin
  if p_content_type<>'creator_video' then
    return jsonb_build_object('allowed',false,'reason','unsupported_content_type','requiresPurchase',false);
  end if;
  if v_viewer is not null
    and public."is_account_access_restricted"(v_viewer::text)
  then
    return jsonb_build_object('allowed',false,'reason','content_unavailable','requiresPurchase',false);
  end if;
  if v_viewer is not null and not public."wave1_current_caller_authority_internal"() then
    return jsonb_build_object('allowed',false,'reason','session_authority_not_current','requiresPurchase',false);
  end if;
  select video.* into v_video
  from public."videos" video
  where video."id"=p_content_id;
  if v_video."id" is null then
    return jsonb_build_object('allowed',false,'reason','content_unavailable','requiresPurchase',false);
  end if;
  v_is_staff:=v_viewer is not null and public."has_platform_role"(array['owner'::text,'operator'::text]);
  if v_viewer is not null and (v_viewer=v_video."owner_id" or v_is_staff) then
    return jsonb_build_object('allowed',true,'reason','owner','requiresPurchase',false);
  end if;
  if (v_viewer is not null and public."is_account_access_restricted"(v_viewer::text))
    or public."is_account_access_restricted"(v_video."owner_id"::text)
    or (v_viewer is not null and public."is_creator_video_viewer_blocked"(
      v_video."owner_id"::text,v_viewer::text
    ))
    or v_video."visibility"<>'public'
    or coalesce(v_video."moderation_status",'clean') not in ('clean','reported')
    or v_video."quarantined_at" is not null
    or not public."media_scan_public_safe"(v_video."scan_status")
    or not public."is_creator_video_playable_source"(
      v_video."storage_path",v_video."storage_object_key",v_video."playback_url"
    )
  then
    return jsonb_build_object('allowed',false,'reason','content_unavailable','requiresPurchase',false);
  end if;

  select price.* into v_price
  from public."creator_content_prices" price
  where price."content_type"='creator_video' and price."content_id"=p_content_id
    and price."creator_id"=v_video."owner_id"
  order by price."updated_at" desc,price."id" desc
  limit 1;
  if v_price."id" is null or not coalesce(v_price."is_paid",false) then
    return jsonb_build_object('allowed',true,'reason','free_content','requiresPurchase',false);
  end if;
  if v_price."status" not in ('sandbox','active') then
    return jsonb_build_object('allowed',false,'reason','content_unavailable','requiresPurchase',false);
  end if;
  if not public."wave1_creator_money_subject_authorized_internal"(v_video."owner_id")
    or coalesce(v_price."price_cents",0)<=0
    or lower(trim(coalesce(v_price."currency",''))) !~ '^[a-z]{3}$'
    or v_price."provider" not in ('revenuecat_app_store','revenuecat_google_play')
    or nullif(trim(coalesce(v_price."provider_product_id",'')),'') is null
    or nullif(trim(coalesce(v_price."provider_product_key",'')),'') is null
  then
    return jsonb_build_object('allowed',false,'reason','content_unavailable','requiresPurchase',false);
  end if;

  if v_viewer is not null then
    select grant_row."status",grant_row."environment"
    into v_grant_status,v_grant_environment
    from public."access_grants" grant_row
    join public."provider_events" provider_event
      on provider_event."id"=grant_row."provider_event_id"
     and provider_event."provider"=grant_row."provider"
     and provider_event."provider" in ('revenuecat_app_store','revenuecat_google_play')
     and provider_event."user_id"=v_viewer and provider_event."status"='processed'
     and not public."revenuecat_authority_quarantined_internal"(
       provider_event."provider",provider_event."user_id",provider_event."environment"
     )
    join public."money_purchase_intents" intent
      on intent."id"::text=grant_row."metadata"->>'purchase_intent_id'
     and intent."user_id"=v_viewer and intent."creator_id"=v_video."owner_id"
     and intent."source_type"='paid_content' and intent."source_id"=p_content_id
     and intent."product_id"=grant_row."product_id" and intent."provider"=provider_event."provider"
     and intent."provider_product_id"=provider_event."metadata"->>'provider_product_id'
     and intent."environment"=grant_row."environment" and intent."status"='consumed'
    join public."revenuecat_consumable_transaction_intents" transaction_link
      on transaction_link."provider"=provider_event."provider"
     and transaction_link."purchase_intent_id"=intent."id"
     and transaction_link."original_transaction_id"=grant_row."metadata"->>'original_transaction_id'
     and transaction_link."user_id"=v_viewer and transaction_link."product_id"=grant_row."product_id"
     and transaction_link."binding_state"='exact' and not transaction_link."terminal"
    where grant_row."user_id"=v_viewer and grant_row."grant_type"='paid_content_access'
      and grant_row."source_type"='provider_event' and grant_row."source_id"=p_content_id
      and ((grant_row."status"='active' and grant_row."environment"='production')
        or (grant_row."status"='sandbox_only' and grant_row."environment"='sandbox'))
      and grant_row."starts_at"<=timezone('utc'::text,now())
      and (grant_row."expires_at" is null or grant_row."expires_at">timezone('utc'::text,now()))
      and grant_row."refunded_at" is null and grant_row."revoked_at" is null
    order by grant_row."created_at" desc,grant_row."id" desc
    limit 1;
  end if;
  if v_grant_status in ('active','sandbox_only') then
    return jsonb_build_object(
      'allowed',true,'reason',case when v_grant_status='active' then 'active_grant' else 'sandbox_grant' end,
      'requiresPurchase',false
    );
  end if;
  return jsonb_build_object(
    'allowed',false,'reason','purchase_required','requiresPurchase',true,
    'priceCents',v_price."price_cents",'currency',lower(v_price."currency"),
    'creatorId',v_video."owner_id",'provider',v_price."provider",
    'providerProductId',v_price."provider_product_id",
    'providerProductKey',v_price."provider_product_key",'offerStatus',v_price."status"
  );
end;
$$;
revoke all on function public."resolve_creator_content_access"(text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public."resolve_creator_content_access"(text,uuid)
  to anon,authenticated;
comment on function public."resolve_creator_content_access"(text,uuid) is
  'Exact paid-video source-to-grant resolver. Legacy content_access_grants never authorize playback; paid authority requires a current eligible creator and exact provider event, consumed intent, nonterminal original-transaction link, and active source-bound access grant.';

-- Preserve the mature rendition selection implementation behind a new exact
-- content gate. The predecessor is no longer directly callable, and therefore
-- cannot return legacy paths or manifests for an unpaid paid-video row.
alter function public."resolve_video_playback"(uuid)
  rename to "resolve_video_playback_pre_paid_authority_closeout";
alter function public."resolve_video_playback_pre_paid_authority_closeout"(uuid)
  set search_path = '';
revoke all on function public."resolve_video_playback_pre_paid_authority_closeout"(uuid)
  from public,anon,authenticated,service_role;

create or replace function public."resolve_video_playback"(target_video_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_access jsonb;
begin
  v_access:=public."resolve_creator_content_access"('creator_video',target_video_id);
  if not coalesce((v_access->>'allowed')::boolean,false) then
    return jsonb_build_object(
      'status','not_allowed','video_id',target_video_id,
      'allowed_qualities','[]'::jsonb,'default_quality',null,
      'is_premium_locked_available',false,'hd_available',false,
      'legacy_single_file_available',false,'legacy_playback_allowed',false,
      'requires_purchase',coalesce((v_access->>'requiresPurchase')::boolean,false),
      'access_reason',coalesce(v_access->>'reason','content_unavailable'),
      'message','Exact paid-content authority is required before playback sources are resolved.',
      'rendition_statuses','[]'::jsonb
    );
  end if;
  return public."resolve_video_playback_pre_paid_authority_closeout"(target_video_id);
end;
$$;
revoke all on function public."resolve_video_playback"(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public."resolve_video_playback"(uuid)
  to anon,authenticated,service_role;
comment on function public."resolve_video_playback"(uuid) is
  'Source-bearing playback resolver. It returns no legacy path, rendition path, or manifest until canonical free/owner/exact paid-content authority succeeds.';

-- Multiple permissive storage SELECT policies are ORed. Replace the historical
-- Premium-HD policy as well as the primary visibility policy so neither route
-- can expose a paid video object without the per-item grant.
drop policy if exists "creator_videos_storage_select_visibility_access" on storage."objects";
create policy "creator_videos_storage_select_visibility_access"
  on storage."objects" for select to public
  using (
    "bucket_id"='creator-videos' and (
      (auth.uid() is not null and (storage."foldername"("name"))[1]=auth.uid()::text)
      or exists (
        select 1 from public."videos" video
        where (
          video."storage_path"=storage."objects"."name"
          or video."storage_object_key"=storage."objects"."name"
          or video."thumb_storage_path"=storage."objects"."name"
          or video."playback_url"=storage."objects"."name"
        ) and public."can_read_creator_video_row"(
          video."owner_id"::text,video."visibility",video."moderation_status",video."scan_status",
          video."storage_path",video."storage_object_key",video."playback_url",auth.uid()::text
        )
      )
      or exists (
        select 1 from public."video_renditions" rendition
        join public."videos" video on video."id"=rendition."video_id"
        where rendition."storage_bucket"=storage."objects"."bucket_id"
          and (rendition."storage_path"=storage."objects"."name"
            or rendition."manifest_path"=storage."objects"."name")
          and rendition."status"='ready' and rendition."quality_label"<>'original'
          and public."media_scan_public_safe"(rendition."scan_status")
          and public."can_read_creator_video_row"(
            video."owner_id"::text,video."visibility",video."moderation_status",video."scan_status",
            video."storage_path",video."storage_object_key",video."playback_url",auth.uid()::text
          )
      )
      or public."has_platform_role"(array['owner'::text,'operator'::text])
    )
  );

drop policy if exists "creator_videos_storage_select_premium_renditions" on storage."objects";
create policy "creator_videos_storage_select_premium_renditions"
  on storage."objects" for select to authenticated
  using (
    "bucket_id"='creator-videos' and exists (
      select 1 from public."video_renditions" rendition
      join public."videos" video on video."id"=rendition."video_id"
      where rendition."storage_bucket"=storage."objects"."bucket_id"
        and (rendition."storage_path"=storage."objects"."name"
          or rendition."manifest_path"=storage."objects"."name")
        and rendition."status"='ready' and rendition."quality_label"<>'original'
        and rendition."access_tier"='premium'
        and public."media_scan_public_safe"(rendition."scan_status")
        and public."premium_subject_has_finite_authority_internal"(auth.uid()::text)
        and public."can_read_creator_video_row"(
          video."owner_id"::text,video."visibility",video."moderation_status",video."scan_status",
          video."storage_path",video."storage_object_key",video."playback_url",auth.uid()::text
        )
    )
  );
-- storage.objects is owned by Supabase's storage administration role, so the
-- migration role cannot attach COMMENT metadata to its policies. The policies
-- above remain the enforced source authority: paid rows require exact per-item
-- access, and finite Premium never substitutes for a paid-video purchase.

-- Sandbox access is authority-bearing even though it is nonpayable. Historical
-- beta/tester helpers accepted mutable email possession and caller-selected
-- subjects. Bind every decision to the current immutable caller and a live
-- exact session; email remains display/audit data only.
create or replace function public."has_active_beta_access"()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and public."wave1_current_caller_authority_internal"()
    and exists (
      select 1 from public."beta_access_memberships" membership
      where membership."access_status"='active'
        and membership."user_id"=auth.uid()::text
    );
$$;
revoke all on function public."has_active_beta_access"()
  from public,anon,authenticated,service_role;
grant execute on function public."has_active_beta_access"() to authenticated;

create or replace function public."resolve_sandbox_monetization_tester"(
  p_user_id text default null,
  p_email text default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and public."wave1_current_caller_authority_internal"()
    and (
      nullif(trim(coalesce(p_user_id,'')),'') is null
      or nullif(trim(coalesce(p_user_id,'')),'')=auth.uid()::text
    )
    and (
      nullif(lower(trim(coalesce(p_email,''))),'') is null
      or exists (
        select 1 from auth.users subject
        where subject."id"=auth.uid() and subject."email_confirmed_at" is not null
          and lower(trim(subject."email"))=lower(trim(p_email))
      )
    )
    and (
      public."has_platform_role"(array['owner'::text,'operator'::text])
      or public."has_active_beta_access"()
      or exists (
        select 1 from public."sandbox_monetization_testers" tester
        where tester."status"='active'
          and tester."user_id"=auth.uid()::text
          and (tester."expires_at" is null
            or tester."expires_at">timezone('utc'::text,now()))
      )
    );
$$;
revoke all on function public."resolve_sandbox_monetization_tester"(text,text)
  from public,anon,authenticated,service_role;
grant execute on function public."resolve_sandbox_monetization_tester"(text,text)
  to authenticated;

create or replace function public."grant_sandbox_monetization_tester"(
  p_email text default null,
  p_user_id text default null,
  p_expires_at timestamptz default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text:=nullif(lower(trim(coalesce(p_email,''))),'');
  v_user_id uuid;
  v_candidate_ids uuid[];
  v_note text:=nullif(trim(coalesce(p_note,'')),'');
  v_row public."sandbox_monetization_testers"%rowtype;
begin
  if not public."has_platform_role"(array['owner'::text,'operator'::text]) then
    raise exception 'owner_operator_required';
  end if;
  if nullif(trim(coalesce(p_user_id,'')),'') is not null then
    begin
      v_user_id:=trim(p_user_id)::uuid;
    exception when others then
      raise exception 'tester_exact_confirmed_subject_required';
    end;
    if not exists (
      select 1 from auth.users subject
      where subject."id"=v_user_id and subject."email_confirmed_at" is not null
        and (v_email is null or lower(trim(subject."email"))=v_email)
    ) then
      raise exception 'tester_exact_confirmed_subject_required';
    end if;
  else
    if v_email is null then raise exception 'tester_identity_required'; end if;
    select array_agg(subject."id" order by subject."id") into v_candidate_ids
    from auth.users subject
    where lower(trim(subject."email"))=v_email
      and subject."email_confirmed_at" is not null;
    if coalesce(cardinality(v_candidate_ids),0)<>1 then
      raise exception 'tester_exact_confirmed_subject_required';
    end if;
    v_user_id:=v_candidate_ids[1];
  end if;
  select lower(trim(subject."email")) into v_email
  from auth.users subject where subject."id"=v_user_id;
  if v_note is not null and v_note ~*
    '(secret|token|password|service_role|private_key|webhook_secret|api_key|authorization)'
  then
    raise exception 'unsafe_note';
  end if;
  if p_expires_at is not null and p_expires_at<=timezone('utc'::text,now()) then
    raise exception 'tester_expiry_must_be_future';
  end if;
  update public."sandbox_monetization_testers"
  set "status"='revoked',"revoked_at"=timezone('utc'::text,now()),
      "updated_at"=timezone('utc'::text,now())
  where "status"='active' and (
    "user_id"=v_user_id::text or lower(trim(coalesce("email",'')))=v_email
  );
  insert into public."sandbox_monetization_testers"(
    "user_id","email","status","note","expires_at","created_by"
  ) values (
    v_user_id::text,v_email,'active',v_note,p_expires_at,auth.uid()::text
  ) returning * into v_row;
  return jsonb_build_object(
    'id',v_row."id",'userId',v_row."user_id",'email',v_row."email",
    'status',v_row."status",'expiresAt',v_row."expires_at",
    'createdAt',v_row."created_at",'sandboxOnly',true,'notPayable',true,
    'ownerRoleGranted',false,'payoutAccessGranted',false
  );
end;
$$;
revoke all on function public."grant_sandbox_monetization_tester"(
  text,text,timestamptz,text
) from public,anon;
grant execute on function public."grant_sandbox_monetization_tester"(
  text,text,timestamptz,text
) to authenticated,service_role;

-- Private creator-money readbacks and setup writers may not outlive the JWT's
-- exact auth.sessions generation. Preserve historical visibility after creator
-- eligibility loss, but never after caller-session loss or restriction.
alter function public."list_my_creator_sandbox_monetization_configs"()
  rename to "list_my_creator_sandbox_monetization_configs_pre_integrity_closeout";
alter function public."list_my_creator_sandbox_monetization_configs_pre_integrity_closeout"()
  set search_path = '';
revoke all on function public."list_my_creator_sandbox_monetization_configs_pre_integrity_closeout"()
  from public,anon,authenticated,service_role;
create or replace function public."list_my_creator_sandbox_monetization_configs"()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public."wave1_current_caller_authority_internal"()
    or public."is_account_access_restricted"(auth.uid()::text)
  then raise exception 'monetization_session_authority_required'; end if;
  return public."list_my_creator_sandbox_monetization_configs_pre_integrity_closeout"();
end;
$$;
revoke all on function public."list_my_creator_sandbox_monetization_configs"()
  from public,anon;
grant execute on function public."list_my_creator_sandbox_monetization_configs"()
  to authenticated,service_role;

alter function public."list_my_paid_video_offers"()
  rename to "list_my_paid_video_offers_pre_integrity_closeout";
alter function public."list_my_paid_video_offers_pre_integrity_closeout"()
  set search_path = '';
revoke all on function public."list_my_paid_video_offers_pre_integrity_closeout"()
  from public,anon,authenticated,service_role;
create or replace function public."list_my_paid_video_offers"()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public."wave1_current_caller_authority_internal"()
    or public."is_account_access_restricted"(auth.uid()::text)
  then raise exception 'monetization_session_authority_required'; end if;
  return public."list_my_paid_video_offers_pre_integrity_closeout"();
end;
$$;
revoke all on function public."list_my_paid_video_offers"() from public,anon;
grant execute on function public."list_my_paid_video_offers"() to authenticated,service_role;

alter function public."list_my_paid_video_transactions"(integer)
  rename to "list_my_paid_video_transactions_pre_integrity_closeout";
alter function public."list_my_paid_video_transactions_pre_integrity_closeout"(integer)
  set search_path = '';
revoke all on function public."list_my_paid_video_transactions_pre_integrity_closeout"(integer)
  from public,anon,authenticated,service_role;
create or replace function public."list_my_paid_video_transactions"(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public."wave1_current_caller_authority_internal"()
    or public."is_account_access_restricted"(auth.uid()::text)
  then raise exception 'monetization_session_authority_required'; end if;
  return public."list_my_paid_video_transactions_pre_integrity_closeout"(p_limit);
end;
$$;
revoke all on function public."list_my_paid_video_transactions"(integer) from public,anon;
grant execute on function public."list_my_paid_video_transactions"(integer)
  to authenticated,service_role;

alter function public."save_creator_sandbox_monetization_config"(text,text,uuid,text,jsonb)
  rename to "save_creator_sandbox_monetization_config_pre_integrity_closeout";
alter function public."save_creator_sandbox_monetization_config_pre_integrity_closeout"(text,text,uuid,text,jsonb)
  set search_path = '';
revoke all on function public."save_creator_sandbox_monetization_config_pre_integrity_closeout"(text,text,uuid,text,jsonb)
  from public,anon,authenticated,service_role;
create or replace function public."save_creator_sandbox_monetization_config"(
  p_product_key text,p_source_type text,p_source_id uuid,
  p_display_name text default null,p_metadata jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public."wave1_current_caller_authority_internal"()
    or public."is_account_access_restricted"(auth.uid()::text)
    or not public."wave1_creator_money_subject_authorized_internal"(auth.uid())
  then raise exception 'creator_authority_not_current'; end if;
  return public."save_creator_sandbox_monetization_config_pre_integrity_closeout"(
    p_product_key,p_source_type,p_source_id,p_display_name,p_metadata
  );
end;
$$;
revoke all on function public."save_creator_sandbox_monetization_config"(text,text,uuid,text,jsonb)
  from public,anon;
grant execute on function public."save_creator_sandbox_monetization_config"(text,text,uuid,text,jsonb)
  to authenticated,service_role;

alter function public."creator_monetization_checkout_preflight"(text,uuid,integer)
  rename to "creator_monetization_checkout_preflight_pre_integrity_closeout";
alter function public."creator_monetization_checkout_preflight_pre_integrity_closeout"(text,uuid,integer)
  set search_path = '';
revoke all on function public."creator_monetization_checkout_preflight_pre_integrity_closeout"(text,uuid,integer)
  from public,anon,authenticated,service_role;
create or replace function public."creator_monetization_checkout_preflight"(
  p_checkout_type text,p_target_id uuid default null,p_amount_cents integer default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public."wave1_current_caller_authority_internal"()
    or public."is_account_access_restricted"(auth.uid()::text)
  then raise exception 'monetization_session_authority_required'; end if;
  return public."creator_monetization_checkout_preflight_pre_integrity_closeout"(
    p_checkout_type,p_target_id,p_amount_cents
  );
end;
$$;
revoke all on function public."creator_monetization_checkout_preflight"(text,uuid,integer)
  from public,anon;
grant execute on function public."creator_monetization_checkout_preflight"(text,uuid,integer)
  to authenticated,service_role;

-- These legacy bridge functions are transitively invoked by the canonical
-- access_grants projector. Their bodies already schema-qualify every relation;
-- remove public-schema lookup from the SECURITY DEFINER execution context and
-- keep them trigger-only.
alter function public."sync_paid_content_access_grant_bridge"() set search_path = '';
alter function public."sync_paid_watch_party_ticket_from_access_grant"() set search_path = '';
alter function public."sync_paid_creator_event_pass_from_access_grant"() set search_path = '';
alter function public."prevent_paid_creator_event_pass_oversell"() set search_path = '';
alter function public."sync_creator_channel_subscription_from_access_grant"() set search_path = '';
alter function public."sync_creator_vip_pass_from_access_grant"() set search_path = '';
alter function public."prevent_paid_watch_party_ticket_oversell"() set search_path = '';
alter function public."admin_list_creator_sandbox_monetization_configs"() set search_path = '';
alter function public."create_creator_product_listing"(text,text,integer,text,text) set search_path = '';
alter function public."create_ios_app_store_purchase_intent_pre_integrity_closeout"(text,text,uuid,jsonb) set search_path = '';
alter function public."is_creator_video_playable_source"(text,text,text) set search_path = '';
alter function public."is_creator_video_viewer_blocked"(text,text) set search_path = '';
alter function public."list_sandbox_monetization_testers"() set search_path = '';
alter function public."revoke_sandbox_monetization_tester"(uuid,text,text) set search_path = '';
alter function public."protect_creator_video_moderation_fields"() set search_path = '';
alter function public."monetization_settings_json"() set search_path = '';
alter function public."monetization_write_audit"(uuid,text,text,text,jsonb) set search_path = '';
alter function public."platform_staff_permission_prevent_mutation"() set search_path = '';
alter function public."get_provider_readiness_summary"() set search_path = '';
alter function public."account_access_status_readback"(text) set search_path = '';
alter function public."admin_get_money_purchase_intent"(uuid) set search_path = '';
alter function public."admin_list_money_purchase_intents"() set search_path = '';
alter function public."admin_grant_platform_role_by_email"(text,text,text) set search_path = '';
alter function public."admin_revoke_platform_role_by_email"(text,text,text) set search_path = '';
alter function public."admin_revoke_money_access_grant_for_proof"(uuid,text) set search_path = '';
alter function public."assert_money_feature_allowed"(text,boolean) set search_path = '';
alter function public."get_admin_money_access_readout"() set search_path = '';
alter function public."get_money_feature_flags_summary"() set search_path = '';
alter function public."get_my_money_purchase_intent"(uuid) set search_path = '';
alter function public."get_platform_money_kill_switches"() set search_path = '';
alter function public."is_money_feature_allowed"(text,boolean) set search_path = '';
alter function public."list_my_creator_channel_subscription_offers"() set search_path = '';
alter function public."list_my_creator_channel_subscription_transactions"(integer) set search_path = '';
alter function public."list_my_creator_vip_pass_offers"() set search_path = '';
alter function public."list_my_creator_vip_transactions"(integer) set search_path = '';
alter function public."list_my_paid_watch_party_offers"() set search_path = '';
alter function public."list_my_paid_watch_party_transactions"(integer) set search_path = '';
alter function public."list_platform_money_kill_switch_audit"(integer) set search_path = '';
alter function public."set_platform_money_kill_switch_state"(text,text,text,text,jsonb) set search_path = '';
alter function public."expire_money_purchase_intents"() set search_path = '';
alter function public."get_my_creator_tip_settings"() set search_path = '';
alter function public."get_my_tip_transaction_status"(uuid) set search_path = '';
alter function public."list_my_creator_tip_transactions"(integer) set search_path = '';
alter function public."list_my_paid_creator_event_offers"() set search_path = '';
alter function public."list_my_paid_creator_event_transactions"(integer) set search_path = '';
alter function public."money_purchase_intent_safe_row"(public."money_purchase_intents") set search_path = '';
alter function public."platform_staff_actor_role"() set search_path = '';
alter function public."platform_staff_target_has_role"(text,text[]) set search_path = '';
alter function public."platform_staff_write_audit"(text,text,text,text,text,text,text,jsonb) set search_path = '';
alter function public."platform_staff_write_permission_audit"(text,text,text,text,text,text,text,text,jsonb) set search_path = '';
alter function public."read_my_platform_staff_permission_keys"() set search_path = '';
alter function public."admin_grant_platform_staff_permission_by_email"(text,text,text,timestamptz) set search_path = '';
alter function public."admin_revoke_platform_staff_permission_by_email"(text,text,text) set search_path = '';
alter function public."admin_update_platform_staff_permissions_by_email"(text,text[],text,timestamptz) set search_path = '';
alter function public."create_money_purchase_intent_pre_integrity_closeout"(text,text,uuid,jsonb) set search_path = '';
alter function public."create_paid_watch_party_ticket_purchase_intent_pre_integrity_closeout"(uuid) set search_path = '';
alter function public."create_paid_creator_event_pass_purchase_intent_pre_integrity_closeout"(uuid) set search_path = '';
alter function public."create_creator_vip_pass_purchase_intent_pre_integrity_closeout"(uuid) set search_path = '';
alter function public."create_creator_channel_subscription_purchase_intent_pre_integrity_closeout"(uuid) set search_path = '';
alter function public."set_paid_watch_party_offer_pre_integrity_closeout"(text,text,integer,integer,text) set search_path = '';
alter function public."set_paid_creator_event_offer_pre_integrity_closeout"(uuid,text,integer,integer,text) set search_path = '';
alter function public."set_creator_vip_pass_offer_pre_integrity_closeout"(text,text,text) set search_path = '';
alter function public."set_creator_channel_subscription_offer_pre_integrity_closeout"(text,text,text) set search_path = '';
alter function public."set_creator_content_price_pre_integrity_closeout"(text,uuid,boolean,integer,text) set search_path = '';
alter function public."upsert_my_creator_tip_settings_pre_integrity_closeout"(boolean,integer[],integer,integer,integer,text) set search_path = '';
alter function public."resolve_creator_vip_pass_access_pre_integrity_closeout"(uuid) set search_path = '';
alter function public."resolve_paid_creator_event_pass_access_pre_integrity_closeout"(uuid) set search_path = '';
revoke all on function public."sync_paid_content_access_grant_bridge"()
  from public,anon,authenticated,service_role;
revoke all on function public."sync_paid_watch_party_ticket_from_access_grant"()
  from public,anon,authenticated,service_role;
revoke all on function public."sync_paid_creator_event_pass_from_access_grant"()
  from public,anon,authenticated,service_role;
revoke all on function public."prevent_paid_creator_event_pass_oversell"()
  from public,anon,authenticated,service_role;
revoke all on function public."sync_creator_channel_subscription_from_access_grant"()
  from public,anon,authenticated,service_role;
revoke all on function public."sync_creator_vip_pass_from_access_grant"()
  from public,anon,authenticated,service_role;
revoke all on function public."prevent_paid_watch_party_ticket_oversell"()
  from public,anon,authenticated,service_role;

-- Migration-time privilege assertions prevent a predecessor grant from silently
-- preserving a bypass around canonical wrappers and internal evidence writers.
do $$
begin
  if has_function_privilege('service_role',
      'public.process_revenuecat_consumable_event_atomic_v1(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text)',
      'EXECUTE')
    or has_function_privilege('service_role',
      'public.create_ios_creator_money_purchase_intent_v1(text,uuid,integer,jsonb)',
      'EXECUTE')
    or has_function_privilege('service_role',
      'public.process_revenuecat_consumable_event_provider_internal(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,text,text,text,text)',
      'EXECUTE')
    or has_function_privilege('service_role',
      'public.process_premium_transfer_pre_closeout(text,uuid,uuid,text,timestamptz,text)',
      'EXECUTE')
    or has_function_privilege('service_role',
      'public.process_revenuecat_premium_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid)',
      'EXECUTE')
  then
    raise exception 'creator_money_legacy_or_internal_function_privilege_leak';
  end if;
  if not has_function_privilege('service_role',
      'public.process_revenuecat_consumable_event_atomic(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text)',
      'EXECUTE')
    or not has_function_privilege('service_role',
      'public.process_revenuecat_google_play_event_atomic(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text)',
      'EXECUTE')
    or not has_function_privilege('service_role',
      'public.process_revenuecat_app_store_event_atomic(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text)',
      'EXECUTE')
    or not has_function_privilege('service_role',
      'public.process_revenuecat_premium_transfer_atomic(text,uuid,uuid,text,timestamptz,text)',
      'EXECUTE')
    or not has_function_privilege('service_role',
      'public.process_revenuecat_premium_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)',
      'EXECUTE')
    or not has_function_privilege('service_role',
      'public.process_revenuecat_terminal_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,text,text)',
      'EXECUTE')
    or not has_function_privilege('service_role',
      'public.reserve_revenuecat_webhook_ingress_event(text,text)','EXECUTE')
    or not has_function_privilege('service_role',
      'public.quarantine_revenuecat_terminal_authority(text,text,text,uuid,text,text,text)','EXECUTE')
  then
    raise exception 'creator_money_canonical_provider_wrapper_privilege_missing';
  end if;
  if has_table_privilege('service_role','public.revenuecat_consumable_transaction_intents','INSERT,UPDATE,DELETE')
    or has_table_privilege('service_role','public.revenuecat_unbound_terminal_authority','INSERT,UPDATE,DELETE')
    or has_table_privilege('service_role','public.revenuecat_unbound_initial_authority','INSERT,UPDATE,DELETE')
    or has_table_privilege('service_role','public.revenuecat_premium_transaction_authority','INSERT,UPDATE,DELETE')
    or has_table_privilege('service_role','public.creator_money_reversal_links','INSERT,UPDATE,DELETE')
    or has_table_privilege('service_role','public.creator_earnings_lifecycle_events','INSERT,UPDATE,DELETE')
    or has_table_privilege('service_role','public.revenuecat_webhook_ingress_events','INSERT,UPDATE,DELETE')
    or has_table_privilege('service_role','public.revenuecat_terminal_authority_quarantines','INSERT,UPDATE,DELETE')
    or has_table_privilege('service_role','public.revenuecat_terminal_authority_quarantine_resolutions','INSERT,UPDATE,DELETE')
  then
    raise exception 'creator_money_internal_evidence_table_mutation_privilege_leak';
  end if;
  if has_table_privilege('authenticated','public.creator_payout_accounts','INSERT,UPDATE,DELETE') then
    raise exception 'creator_payout_provider_proof_client_mutation_privilege_leak';
  end if;
  if has_function_privilege('service_role',
      'public.revenuecat_authority_quarantined_internal(text,uuid,text)','EXECUTE')
    or has_function_privilege('service_role',
      'public.resolve_revenuecat_terminal_quarantine_internal(text,uuid,text,uuid)','EXECUTE')
    or has_function_privilege('service_role',
      'public.block_revenuecat_terminal_quarantine_mutation_internal()','EXECUTE')
  then
    raise exception 'revenuecat_terminal_quarantine_internal_privilege_leak';
  end if;
end;
$$;
