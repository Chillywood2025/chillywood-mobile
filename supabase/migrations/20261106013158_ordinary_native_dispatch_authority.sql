begin;
-- Serialize the new ordinary-commerce authority inputs before acquiring any
-- checkout/source rows. The existing account/legal writer triggers lock their
-- advisory identity after an UPDATE has acquired a row lock. Therefore these
-- readers use their advisory fences, NOT auth/profile/legal row locks after
-- taking those fences. They cover absent deletion requests, newly added login
-- sessions, role changes and newly required legal documents as well as UPDATE.
create function private.lock_ordinary_commerce_dispatch_subjects(
 p_buyer uuid,p_session uuid,p_creator uuid,p_environment text,p_native_provider text default null
) returns void language plpgsql security definer set search_path='' as $$
declare subject uuid;
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'ordinary_dispatch_read_committed_required' using errcode='25000'; end if;
 -- p_session is descriptive only: the user fence covers all of that user's
 -- sessions. Lock-only historical recovery may pass NULL; dispatch eligibility
 -- checks still require the exact non-null originating session separately.
 -- A retained intent may outlive a deleted seller. Locks do not reject that
 -- historical replay; only the fresh-dispatch assertion requires a seller.
 if p_buyer is null
  or p_environment not in ('sandbox','production') or p_environment is null then
  raise exception 'ordinary_dispatch_identity_required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('stripe-tip-buyer-authority-global',0));
 for subject in select distinct value from unnest(array[p_buyer,p_creator]) value order by value loop
  perform pg_advisory_xact_lock_shared(hashtextextended('stripe-tip-buyer-authority-user:'||subject::text,0));
 end loop;
 -- Canonical Premium producers use owner -> quarantine -> transaction binding
 -- -> entitlement -> grant. Only the seller needs Premium; a free buyer does
 -- not acquire or require a Premium entitlement.
 perform private.lock_ordinary_commerce_premium_subjects(array[p_creator]);
 if p_native_provider is not null then
  perform public.lock_revenuecat_premium_quarantine_scopes_internal(p_native_provider,p_buyer,p_environment);
 end if;
 -- SHARE deliberately freezes table membership, including a first restricted
 -- account/hold. Account -> eligibility -> observation follows the provider
 -- projector, and all are before its final creator-refresh mutex. There are
 -- no row locks on these tables after SHARE. This conservative, short-lived
 -- fence serializes authority writers across creators for the dispatch txn;
 -- it does not change writer triggers or receipt/refund transaction ordering.
 lock table public.creator_payout_accounts,public.creator_payout_eligibility_records,
  private.creator_connect_mode_bindings,private.creator_provider_observation_jobs,
  public.platform_money_kill_switches in share mode;
 if p_creator is not null then
  perform pg_advisory_xact_lock(hashtextextended('wave1-creator:'||p_creator::text,0));
  perform 1 from public.wave1_creator_eligibility where creator_user_id=p_creator for share;
 end if;
end $$;
revoke all on function private.lock_ordinary_commerce_dispatch_subjects(uuid,uuid,uuid,text,text)
 from public,anon,authenticated,service_role;

-- Issuance must enter the same seller stream before its source/attempt locks.
-- This is deliberately lock-only so an existing paid-history response does not
-- acquire a new Premium eligibility condition. Original exact checks still run.
create function private.lock_ordinary_purchase_source_subjects(p_source_type text,p_source_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare creator uuid; sid uuid;
begin
 if auth.uid() is null or p_source_id is null then return; end if;
 case p_source_type
  when 'creator_tip' then creator:=p_source_id;
  when 'paid_content' then select owner_id into creator from public.videos where id=p_source_id;
  when 'event' then select host_user_id into creator from public.creator_events where id=p_source_id;
  when 'watch_party_live' then select creator_id into creator from public.paid_watch_party_offers where id=p_source_id;
  when 'vip_pass' then select creator_id into creator from public.creator_vip_pass_offers where id=p_source_id;
  when 'channel_subscription' then select creator_id into creator from public.creator_channel_subscription_offers where id=p_source_id;
  when 'live_watch_party' then select creator_id into creator from public.paid_live_watch_party_offers where id=p_source_id;
  else return;
 end case;
 if creator is null then return; end if;
 if coalesce(auth.jwt()->>'session_id','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
  sid:=(auth.jwt()->>'session_id')::uuid; end if;
 -- The common fence locks both seller Premium environments, not admission.
 perform private.lock_ordinary_commerce_dispatch_subjects(auth.uid(),sid,creator,'sandbox');
end $$;
revoke all on function private.lock_ordinary_purchase_source_subjects(text,uuid) from public,anon,authenticated,service_role;

do $patch$
declare definition text; patch record; needle text:=E'begin\n'; at integer;
begin
 for patch in select * from (values
  ('public.create_money_purchase_intent(text,text,uuid,jsonb)', 'p_source_type,p_source_id'),
  ('public.create_ios_app_store_purchase_intent(text,text,uuid,jsonb)', 'p_source_type,p_source_id'),
  ('public.create_ios_creator_money_purchase_intent(text,uuid,integer,jsonb)',
   'case lower(btrim(p_concept)) when ''paid_video'' then ''paid_content'' when ''event_pass'' then ''event'' else lower(btrim(p_concept)) end,p_source_id'),
  ('public.create_paid_watch_party_ticket_purchase_intent(uuid)', '''watch_party_live'',p_offer_id'),
  ('public.create_paid_creator_event_pass_purchase_intent(uuid)', '''event'',(select creator_event_id from public.paid_creator_events where id=p_event_id)'),
  ('public.create_reserved_creator_event_purchase_intent(uuid,uuid)', '''event'',(select creator_event_id from public.paid_creator_events where id=p_event_id)'),
  ('public.create_creator_vip_pass_purchase_intent(uuid)', '''vip_pass'',p_offer_id'),
  ('public.create_creator_channel_subscription_purchase_intent(uuid)', '''channel_subscription'',p_offer_id'),
  ('public.create_live_watch_party_purchase_intent(uuid)', '''live_watch_party'',p_offer_id')
 ) entry(signature,arguments) loop
  definition:=pg_get_functiondef(patch.signature::regprocedure);at:=position(needle in definition);
  if at=0 then raise exception 'ordinary_purchase_prelock_anchor_missing: %',patch.signature; end if;
  execute overlay(definition placing needle||'  perform private.lock_ordinary_purchase_source_subjects('||patch.arguments||');'||chr(10) from at for length(needle));
 end loop;
end $patch$;

-- The configuration wrapper previously owned the event row before invoking
-- the creator assertion in its setter. Establish that SAME creator assertion
-- before the event row so it cannot invert a simultaneous buyer dispatch.
-- Paused edits retain the existing offer's mode; the locked checks stay below.
do $patch$
declare definition text; needle text;
begin
 definition:=pg_get_functiondef('public.configure_paid_creator_event_sale(uuid,text,integer,integer,text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone)'::regprocedure);
 needle:='  select * into e from public.creator_events where id=p_creator_event_id for update;';
 if position(needle in definition)=0 then raise exception 'ordinary_event_config_prelock_anchor_missing'; end if;
 execute replace(definition,needle,$insert$
  v_status:=lower(coalesce(p_status,''));
  if v_status='paused' then
   select status into v_status from public.paid_creator_events where creator_event_id=p_creator_event_id and status in ('active','sandbox');
  end if;
  if v_status in ('draft','sandbox','active') then
   perform private.assert_current_creator_for_mode(case when v_status='active' then 'production' else 'sandbox' end);
  end if;
$insert$||needle);
end $patch$;

-- This assertion is only for a NEW native dispatch, never receipt admission,
-- refunds, historical status, or replay of a durable one-use attempt marker.
create function private.assert_ordinary_native_dispatch_current(i public.money_purchase_intents)
returns void language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if coalesce(i.session_generation,'') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
 then raise exception 'ordinary_native_dispatch_authority_unavailable' using errcode='42501'; end if;
 sid:=i.session_generation::uuid;
 -- clock_timestamp predicates run after every source/intent/reservation wait.
 if i.user_id is distinct from auth.uid() or i.session_generation is distinct from auth.jwt()->>'session_id'
  or private.ordinary_commerce_buyer_current(i.user_id,sid,i.environment) is not true
  or private.ordinary_creator_subject_for_mode(i.creator_id,i.environment) is not true
  or public.revenuecat_authority_quarantined_internal(i.provider,i.user_id,i.environment)
  or i.status<>'pending' or i.expires_at<=clock_timestamp() or i.consumed_at is not null or i.revoked_at is not null
 then raise exception 'ordinary_native_dispatch_authority_unavailable' using errcode='42501'; end if;
 perform private.assert_creator_native_dispatch_environment(i.environment);
end $$;
revoke all on function private.assert_ordinary_native_dispatch_current(public.money_purchase_intents)
 from public,anon,authenticated,service_role;

do $patch$
declare definition text; signature text; needle text;
begin
 foreach signature in array array['public.begin_creator_money_checkout(uuid,uuid)','public.begin_creator_event_checkout(uuid,uuid)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  -- The first unprotected read only identifies the immutable intent subjects.
  -- The existing locked reread and all exact source/quote checks stay intact.
  needle:='  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(';
  if position(needle in definition)=0 then raise exception 'ordinary_native_prelock_anchor_missing: %',signature; end if;
  definition:=replace(definition,needle,$insert$
  perform private.lock_ordinary_commerce_dispatch_subjects(i.user_id,
    case when coalesce(i.session_generation,'') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then i.session_generation::uuid end,i.creator_id,i.environment,i.provider);
$insert$||needle);
  if signature like '%begin_creator_money_checkout%' then
   needle:='  update public.money_purchase_intents set checkout_attempt_id=p_checkout_attempt_id,';
  else
   needle:='  update public.event_ticket_reservations set checkout_attempt_id=p_checkout_attempt_id,';
  end if;
  if position(needle in definition)=0 then raise exception 'ordinary_native_finalcheck_anchor_missing: %',signature; end if;
  execute replace(definition,needle,'  perform private.assert_ordinary_native_dispatch_current(i);'||chr(10)||needle);
 end loop;
end $patch$;

-- Merch already enters its retained global retention latch before this block.
-- Replace only the dispatch authority locks. Keep current buyer/seller/mode,
-- bound live platform account, inventory and historical-abort checks intact.
do $patch$
declare definition text; needle text:=$old$
  perform 1 from auth.users where id in (p_buyer_id,o.creator_id) order by id for share;
  perform 1 from auth.sessions where id=p_session_id and user_id=p_buyer_id for share;
  perform private.lock_ordinary_commerce_premium_subjects(array[o.creator_id]);
  perform 1 from public.creator_payout_accounts where creator_user_id=o.creator_id::text order by id for share;
  perform pg_advisory_xact_lock_shared(hashtextextended('ordinary-creator-hold:'||o.creator_id::text,0));
  perform 1 from public.creator_payout_eligibility_records where creator_user_id=o.creator_id::text order by id for share;
  perform pg_advisory_xact_lock(hashtextextended('wave1-creator:'||o.creator_id::text,0));
  perform 1 from public.wave1_creator_eligibility where creator_user_id=o.creator_id for share;
  perform 1 from public.wave1_legal_document_versions where market='UNITED_STATES' order by document_key,version,capability for share;
  perform 1 from public.wave1_legal_acceptances where user_id in(p_buyer_id,o.creator_id) order by user_id,id for share;
  perform 1 from public.platform_money_kill_switches order by key for share;$old$;
begin
 definition:=pg_get_functiondef('public.transition_merch_checkout_dispatch(uuid,uuid,uuid,text,jsonb)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'ordinary_merch_dispatch_prelock_anchor_missing'; end if;
 execute replace(definition,needle,chr(10)||'  perform private.lock_ordinary_commerce_dispatch_subjects(p_buyer_id,p_session_id,o.creator_id,o.environment);');
end $patch$;

-- All retained callers enter this lock helper before any account/eligibility/
-- control write: request, cancellation, observation, dispatch, qualification
-- revocation, and recovery-authority insert/revocation. Source-change triggers
-- do NOT call this helper: they retain source -> cashout mutex order directly.
-- This is serialization only, including historical recovery after Premium loss.
do $patch$
declare definition text; needle text;
begin
 definition:=pg_get_functiondef('private.lock_sandbox_cashout_creator(uuid)'::regprocedure);
 needle:=$old$ perform 1 from auth.users where id=p_creator for share;
 perform 1 from auth.sessions where user_id=p_creator order by id for share;
 perform private.lock_ordinary_commerce_premium_subjects(array[p_creator]);$old$;
 if position(needle in definition)=0 then raise exception 'ordinary_cashout_subject_prelock_anchor_missing'; end if;
 execute replace(definition,needle,' perform private.lock_ordinary_commerce_dispatch_subjects(p_creator,null,p_creator,''sandbox'');');
 definition:=pg_get_functiondef('public.claim_sandbox_creator_cashout_dispatch(uuid,text)'::regprocedure);
 needle:=$old$  perform 1 from auth.users where id=e.creator_id for share;
  perform 1 from auth.sessions where id=e.originating_session_id and user_id=e.creator_id for share;
  perform private.lock_ordinary_commerce_premium_subjects(array[e.creator_id]);
  perform pg_advisory_xact_lock_shared(hashtextextended('ordinary-creator-hold:'||e.creator_id::text,0));
  perform 1 from public.creator_payout_eligibility_records where creator_user_id=e.creator_id::text order by id for share;
  perform pg_advisory_xact_lock(hashtextextended('wave1-creator:'||e.creator_id::text,0));
  perform 1 from public.wave1_creator_eligibility where creator_user_id=e.creator_id for share;
  perform 1 from public.wave1_legal_document_versions where market='UNITED_STATES' order by document_key,version,capability for share;
  perform 1 from public.wave1_legal_acceptances where user_id=e.creator_id order by id for share;$old$;
 if position(needle in definition)=0 then raise exception 'ordinary_cashout_late_rowlock_anchor_missing'; end if;
 execute replace(definition,needle,'  -- Account, legal, Premium and hold fences are already held before source rows.');
end $patch$;
commit;
