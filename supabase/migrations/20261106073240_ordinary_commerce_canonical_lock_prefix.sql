begin;
-- Bounded commerce/identity membership protocol. All participants use the SAME
-- transaction-exclusive gate before existing identity, Premium, creator,
-- retention and source locks. No shared-to-exclusive upgrades. This is not a
-- promise about arbitrary SQL or managed Auth transactions with earlier tuple
-- prelocks. No admission predicate, role, evidence, money switch or ACL changes.
create function private.lock_ordinary_commerce_authority_gate() returns void
language plpgsql security definer set search_path='' as $$
begin
 if current_setting('transaction_isolation')<>'read committed'
 then raise exception 'ordinary_commerce_read_committed_required' using errcode='25000'; end if;
 perform pg_catalog.pg_advisory_xact_lock(176214,32);
end $$;
create function private.ordinary_commerce_authority_gate_held() returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from pg_catalog.pg_locks l
  where l.pid=pg_catalog.pg_backend_pid() and l.locktype='advisory'
   and l.database=(select oid from pg_catalog.pg_database where datname=current_database())
   and l.classid=176214 and l.objid=32 and l.objsubid=2
   and l.mode='ExclusiveLock' and l.granted)
$$;
create function private.assert_ordinary_commerce_authority_gate() returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.ordinary_commerce_authority_gate_held()
 then raise exception 'ordinary_commerce_authority_gate_required' using errcode='42501'; end if;
 -- The exact tag is already owned, so this cannot wait. Establish transaction
 -- lifetime even if a privileged caller supplied only a session advisory.
 perform private.lock_ordinary_commerce_authority_gate();
end $$;
create function private.ordinary_commerce_writer_gate() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_ordinary_commerce_authority_gate();
 return null;
end $$;
revoke all on function private.lock_ordinary_commerce_authority_gate(),
 private.ordinary_commerce_authority_gate_held(),private.assert_ordinary_commerce_authority_gate(),
 private.ordinary_commerce_writer_gate() from public,anon,authenticated,service_role;

-- Before STATEMENT, not after a row has already been locked. Covered readers
-- below do not take conflicting relation SHARE locks. Existing triggers and
-- RLS remain. Profile UPDATE has its exact media-only split separately below.
do $writers$
declare target text;
begin
 foreach target in array array[
  'auth.users','auth.sessions','public.account_deletion_requests',
  'public.wave1_legal_acceptances','public.wave1_legal_document_versions',
  'public.access_grants','public.user_entitlements','public.revenuecat_premium_transaction_authority',
  'public.wave1_creator_eligibility','private.creator_eligibility_declarations',
  'public.creator_payout_accounts','public.creator_payout_eligibility_records',
  'private.creator_connect_mode_bindings','public.platform_money_kill_switches',
  'public.creator_tip_transactions'
 ] loop
  execute format('create trigger aaa_ordinary_commerce_writer_gate before insert or update or delete on %s for each statement execute function private.ordinary_commerce_writer_gate()',target::regclass);
 end loop;
end $writers$;

-- Only these sixteen metadata fields are outside the current authority
-- closure. Complete JSON subtraction makes every unknown future field fail
-- closed. URL, identity, role and visibility are deliberately NOT exempt.
create function private.ordinary_profile_metadata_only_change(p_old jsonb,p_new jsonb) returns boolean
language sql immutable set search_path='' as $$
 select p_old is not null and p_new is not null and
  (p_old - array['profile_avatar_scan_status','profile_avatar_scan_provider','profile_avatar_scan_result','profile_avatar_scanned_at','profile_avatar_scan_error','profile_avatar_media_status','profile_avatar_media_flagged_at','profile_background_scan_status','profile_background_scan_provider','profile_background_scan_result','profile_background_scanned_at','profile_background_scan_error','profile_background_media_status','profile_background_media_flagged_at','profile_media_updated_at','updated_at']::text[]) is not distinct from
  (p_new - array['profile_avatar_scan_status','profile_avatar_scan_provider','profile_avatar_scan_result','profile_avatar_scanned_at','profile_avatar_scan_error','profile_avatar_media_status','profile_avatar_media_flagged_at','profile_background_scan_status','profile_background_scan_provider','profile_background_scan_result','profile_background_scanned_at','profile_background_scan_error','profile_background_media_status','profile_background_media_flagged_at','profile_media_updated_at','updated_at']::text[])
$$;
create function private.ordinary_profile_retention_prefix() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform private.platform_brand_retention_lock();
 return null;
end $$;
create function private.assert_ordinary_profile_authority_final() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Immediate AFTER sees actual NEW after EVERY BEFORE trigger. Never acquire
 -- a missing gate here: a tuple is already owned. Later trigger normalization
 -- of a URL or a future authority column must roll the statement back.
 if tg_op<>'UPDATE' or not private.ordinary_profile_metadata_only_change(to_jsonb(old),to_jsonb(new))
 then perform private.assert_ordinary_commerce_authority_gate(); end if;
 return null;
end $$;
revoke all on function private.ordinary_profile_metadata_only_change(jsonb,jsonb),
 private.ordinary_profile_retention_prefix(),private.assert_ordinary_profile_authority_final()
 from public,anon,authenticated,service_role;
create trigger aaa_ordinary_profile_membership_gate before insert or delete on public.user_profiles
 for each statement execute function private.ordinary_commerce_writer_gate();
create trigger aaa_ordinary_profile_protected_update_gate before update of
 user_id,
 username,
 avatar_index,
 display_name,
 avatar_url,
 tagline,
 channel_role,
 likes_visibility,
 shares_visibility,
 default_watch_party_join_policy,
 default_watch_party_reactions_policy,
 default_watch_party_content_access_rule,
 default_watch_party_capture_policy,
 default_communication_content_access_rule,
 default_communication_capture_policy,
 public_activity_visibility,
 follower_surface_enabled,
 subscriber_surface_enabled,
 channel_layout_preset,
 profile_visibility,
 profile_avatar_fit_mode,
 profile_avatar_focal_x,
 profile_avatar_focal_y,
 profile_background_url,
 profile_background_fit_mode,
 profile_background_focal_x,
 profile_background_focal_y,
 profile_background_overlay_strength,
 profile_access_visibility,
 platform_access_visibility
 on public.user_profiles for each statement execute function private.ordinary_commerce_writer_gate();
-- Statement names put the gate before full Brand; both precede profile tuples.
-- Metadata-only callbacks/recovery retain Brand but never join the new gate.
create trigger aab_ordinary_profile_retention_prefix before insert or update on public.user_profiles
 for each statement execute function private.ordinary_profile_retention_prefix();
create trigger aaa_ordinary_profile_authority_final after insert or update or delete on public.user_profiles
 for each row execute function private.assert_ordinary_profile_authority_final();

-- Existing identity row fences assert the entry protocol; only the positively
-- proven profile transition can skip them. A protected SET column, including
-- SET role=role, already owns the gate and retains the original user fence.
do $identity$
declare definition text; needle text:=E'begin\n';
begin
 definition:=pg_get_functiondef('public.serialize_stripe_tip_buyer_authority_user_internal()'::regprocedure);
 if position(needle in definition)=0 then raise exception 'ordinary_identity_anchor_missing'; end if;
 execute overlay(definition placing needle||$prefix$
 if tg_table_schema='public' and tg_table_name='user_profiles' and tg_op='UPDATE'
  and not private.ordinary_commerce_authority_gate_held()
  and private.ordinary_profile_metadata_only_change(to_jsonb(old),to_jsonb(new))
 then return new; end if;
 perform private.assert_ordinary_commerce_authority_gate();
$prefix$ from position(needle in definition) for length(needle));
 definition:=pg_get_functiondef('public.serialize_stripe_tip_buyer_authority_global_internal()'::regprocedure);
 if position(needle in definition)=0 then raise exception 'ordinary_global_anchor_missing'; end if;
 execute overlay(definition placing needle||' perform private.assert_ordinary_commerce_authority_gate();'||chr(10)
  from position(needle in definition) for length(needle));
end $identity$;

-- Lease-only claiming/failure must remain outside the gate and SKIP LOCKED.
-- Matching freshness never changes through these exceptions. Mismatch repair
-- needs the immutable exact DB binding, never a fabricated/rebound account.
create function private.guard_creator_observation_authority_write() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' and new.observed_at is null then return new; end if;
 if tg_op='UPDATE' then
  if row(new.account_id,new.creator_id,new.environment,new.provider_account_id,new.observed_at)
   is not distinct from row(old.account_id,old.creator_id,old.environment,old.provider_account_id,old.observed_at)
  then return new; end if;
  if new.account_id=old.account_id and new.creator_id=old.creator_id and new.observed_at is null
   and exists(select 1 from public.creator_payout_accounts a
    join private.creator_connect_mode_bindings b on b.payout_account_id=a.id
     and b.creator_id=a.creator_user_id and b.environment=a.provider_environment
     and b.provider_account_id=a.provider_account_id
    where a.id=old.account_id and a.creator_user_id=old.creator_id::text and a.provider='stripe_connect'
     and (old.environment is distinct from a.provider_environment or old.provider_account_id is distinct from a.provider_account_id)
     and new.environment=a.provider_environment and new.provider_account_id=a.provider_account_id)
  then return new; end if;
 end if;
 perform private.assert_ordinary_commerce_authority_gate();
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function private.guard_creator_observation_authority_write() from public,anon,authenticated,service_role;
create trigger guard_creator_observation_authority_write
 before insert or update or delete on private.creator_provider_observation_jobs
 for each row execute function private.guard_creator_observation_authority_write();

-- Explicit supported ancestry, before each first lock. CREATE OR REPLACE
-- retains owner, attributes and ACL. The lock-free SQL consumable wrapper
-- immediately delegates to its gated App Store root. No compatibility API is
-- exposed. Refund/receipt roots receive no fresh admission requirement.
do $roots$
declare signature text; definition text; at integer; needle text:=E'begin\n';
begin
 foreach signature in array array[
 'public.admin_revoke_money_access_grant_for_proof(uuid,text)',
  'public.complete_revenuecat_nonpurchase_snapshot(text,uuid,jsonb,text)',
  'public.process_revenuecat_app_store_event_atomic(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text)',
  'public.process_revenuecat_app_store_event_atomic(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,timestamptz)',
  'public.process_revenuecat_google_play_event_atomic(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text)',
  'public.process_revenuecat_google_play_event_atomic(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,timestamptz)',
  'public.process_revenuecat_live_watch_party_event_atomic(text,text,text,uuid,text,text,timestamptz,integer,text,text,text)',
  'public.process_revenuecat_nonpurchase_lifecycle_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text)',
  'public.process_revenuecat_premium_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)',
  'public.process_revenuecat_premium_transfer_atomic(text,uuid,uuid,text,timestamptz,text)',
  'public.process_revenuecat_terminal_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,text,text)',
  'public.process_stripe_event_auction_receipt(jsonb,text)',
  'public.process_stripe_room_auction_receipt(jsonb,text)',
  'public.quarantine_revenuecat_terminal_authority(text,text,text,uuid,text,text,text)',
  'public.reconcile_revenuecat_google_premium_snapshot_atomic(text,uuid,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text)',
  'public.reconcile_revenuecat_premium_current_owner_snapshot_atomic(text,uuid,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text)',
  'public.reconcile_revenuecat_premium_snapshot_atomic(text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text)',
  'public.approve_creator_merch_photo(uuid,uuid,timestamptz)',
  'public.assign_merch_product_photo(uuid,uuid,timestamptz)',
  'public.begin_creator_event_checkout(uuid,uuid)',
  'public.begin_creator_money_checkout(uuid,uuid)',
  'public.cancel_undispatched_sandbox_creator_cashout(uuid)',
  'public.claim_creator_connect_account_creation(uuid,uuid,uuid)',
  'public.claim_creator_connect_hosted_link(uuid,uuid)',
  'public.claim_sandbox_creator_cashout_dispatch(uuid,text)',
  'public.complete_creator_connect_hosted_link(uuid,uuid,uuid,timestamptz)',
  'public.configure_creator_merch_variants(uuid,text,jsonb,timestamptz)',
  'public.configure_paid_creator_event_sale(uuid,text,integer,integer,text,text,timestamptz,timestamptz,timestamptz)',
  'public.confirm_creator_connect_live_setup(uuid,uuid,text)',
  'public.confirm_creator_merch_live_publication(uuid)',
  'public.copy_creator_merch_live_draft(uuid,timestamptz)',
  'public.create_creator_channel_subscription_purchase_intent(uuid)',
  'public.create_creator_event_auction(uuid,uuid,integer,integer,timestamptz,timestamptz,text)',
  'public.create_creator_room_seat_auction(text,text,integer,integer,timestamptz,timestamptz,text,uuid,uuid)',
  'public.create_creator_vip_pass_purchase_intent(uuid)',
  'public.create_ios_app_store_purchase_intent(text,text,uuid,jsonb)',
  'public.create_ios_creator_money_purchase_intent(text,uuid,integer,jsonb)',
  'public.create_live_watch_party_purchase_intent(uuid)',
  'public.create_money_purchase_intent(text,text,uuid,jsonb)',
  'public.create_paid_creator_event_pass_purchase_intent(uuid)',
  'public.create_paid_watch_party_ticket_purchase_intent(uuid)',
  'public.create_reserved_creator_event_purchase_intent(uuid,uuid)',
  'public.declare_creator_money_eligibility(boolean,text,text,text)',
  'public.get_creator_connect_onboarding_route(uuid,uuid)',
  'public.prepare_creator_room_seat_auction(text)',
  'public.read_creator_auction_creation_mode(text)',
  'public.record_creator_connect_created_account(uuid,uuid,uuid,text,jsonb)',
  'public.record_sandbox_creator_cashout_observation(uuid,uuid,jsonb)',
  'public.request_creator_channel_subscription_price(integer,text)',
  'public.request_sandbox_creator_cashout(integer,text,uuid,uuid,integer,integer,integer)',
  'public.reserve_creator_connect_account_creation(uuid,uuid)',
  'public.reserve_merch_checkout_dispatch(uuid,uuid,uuid,integer,uuid,uuid,text,integer,text)',
  'public.review_creator_merch_live_publication(uuid,timestamptz)',
  'public.save_creator_merch_product(uuid,text,text,text,integer,integer,text,timestamptz)',
  'public.save_creator_merch_product_with_tracking(uuid,text,text,text,integer,integer,text,timestamptz,text)',
  'public.select_creator_merch_tax_category(uuid,uuid,timestamptz,text)',
  'public.set_creator_channel_subscription_offer(text,text,text)',
  'public.set_creator_channel_subscription_offer_at_price(text,text,text,uuid)',
  'public.set_creator_content_price(text,uuid,boolean,integer,text)',
  'public.set_creator_video_vip_access(uuid,boolean)',
  'public.set_creator_vip_pass_offer(text,text,text)',
  'public.set_creator_vip_pass_offer_at_price(text,text,text,uuid)',
  'public.set_my_live_watch_party_offer(text,text,boolean,text)',
  'public.set_paid_creator_event_offer(uuid,text,integer,integer,text)',
  'public.set_paid_watch_party_offer(text,text,integer,integer,text)',
  'public.transition_merch_checkout_dispatch(uuid,uuid,uuid,text,jsonb)',
  'public.upsert_my_creator_tip_settings(boolean,integer[],integer,integer,integer,text)',
  'private.lock_ordinary_commerce_dispatch_subjects(uuid,uuid,uuid,text,text)',
  'private.lock_ordinary_creator_subject(uuid,uuid,text)',
  'private.lock_ordinary_commerce_premium_subjects(uuid[])',
  'private.refresh_ordinary_creator_eligibility(uuid)',
  'private.lock_sandbox_cashout_creator(uuid)',
  'private.merch_live_publication_authority(public.merch_products)',
  'public.process_stripe_tip_webhook_lifecycle(text,uuid,uuid,jsonb,jsonb,jsonb)',
  'public.record_creator_connect_live_observation(jsonb,jsonb)',
  'public.complete_creator_provider_observation(uuid,uuid)',
  'public.wave1_evaluate_creator_eligibility(uuid,jsonb,text,text)',
  'public.set_platform_money_kill_switch_state(text,text,text,text,jsonb)',
  'public.bind_commerce_tax_checkout_policy(text,uuid,text,text,text,text)',
  'public.record_merch_tax_category_context(uuid,uuid,uuid,text,timestamptz)',
  'public.admin_run_account_purge_batch(boolean,integer,boolean)',
  'public.update_my_username(text)',
  'public.admin_force_update_username(text,text,text)',
  'public.reserve_merch_checkout_for_actor(uuid,uuid,uuid,integer,uuid)',
  'public.reserve_merch_checkout_for_actor(uuid,uuid,uuid,integer,uuid,uuid)',
  'public.reserve_merch_checkout_for_actor_with_tracking(uuid,uuid,uuid,integer,uuid,uuid,text,integer,text)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  at:=position(needle in definition);
  if at=0 then raise exception 'ordinary_gate_root_anchor_missing: %',signature; end if;
  execute overlay(definition placing needle||' perform private.lock_ordinary_commerce_authority_gate();'||chr(10) from at for length(needle));
 end loop;
end $roots$;

-- Exact guarded replacements: remove only covered membership/tuple waits,
-- refresh DECLARE authority after entry, and retain independent tax fences.
do $covered_reads$
declare patch record; definition text;
begin
 for patch in select * from (values
  ('private.lock_ordinary_creator_subject(uuid,uuid,text)',$old$ perform 1 from auth.users where id=p_creator for share;
 perform 1 from auth.sessions where id=p_session and user_id=p_creator for share;$old$,$new$ -- Exact current identity is rechecked below after the gate, without Auth tuple waits.$new$),
  ('private.lock_ordinary_creator_subject(uuid,uuid,text)',$old$ from public.platform_money_kill_switches where key='live_money_enabled' for share;$old$,$new$ from public.platform_money_kill_switches where key='live_money_enabled';$new$),
  ('private.lock_ordinary_commerce_premium_subjects(uuid[])',$old$ perform 1 from public.revenuecat_premium_transaction_authority where user_id=any(p_users)
  order by provider,original_transaction_id for share;
 perform 1 from public.user_entitlements where user_id in(select x::text from unnest(p_users) x)
  and entitlement_key='premium' order by user_id,entitlement_key for share;
 perform 1 from public.access_grants where user_id=any(p_users) and grant_type='premium' order by user_id,id for share;$old$,$new$ -- Gate-covered Premium membership is read fresh by the admission predicates.
 -- Producers retain their existing row locks after this same gate.$new$),
  ('private.lock_ordinary_commerce_dispatch_subjects(uuid,uuid,uuid,text,text)',$old$ -- SHARE deliberately freezes table membership, including a first restricted
 -- account/hold. Account -> eligibility -> observation follows the provider
 -- projector, and all are before its final creator-refresh mutex. There are
 -- no row locks on these tables after SHARE. This conservative, short-lived
 -- fence serializes authority writers across creators for the dispatch txn;
 -- it does not change writer triggers or receipt/refund transaction ordering.
 lock table public.creator_payout_accounts,public.creator_payout_eligibility_records,
  private.creator_connect_mode_bindings,private.creator_provider_observation_jobs,
  public.platform_money_kill_switches in share mode;$old$,$new$ -- The entry gate covers absent/current authority membership, including the
 -- first restriction. Never gate -> relation SHARE against a writer that
 -- already holds RowExclusive before its statement gate.$new$),
  ('private.lock_ordinary_commerce_dispatch_subjects(uuid,uuid,uuid,text,text)',$old$  perform 1 from public.wave1_creator_eligibility where creator_user_id=p_creator for share;$old$,$new$  -- Creator projection membership is gate-covered, without authority tuple waits.$new$),
  ('private.merch_live_publication_authority(public.merch_products)',$old$lock table public.wave1_creator_eligibility,public.wave1_legal_acceptances,public.wave1_legal_document_versions in share mode;$old$,$new$-- Creator and legal membership are frozen by the entry gate.$new$),
  ('private.merch_live_publication_authority(public.merch_products)',$old$lock table private.merch_tax_categories,private.merch_tax_category_contexts,public.creator_payout_accounts,public.creator_payout_eligibility_records,public.platform_money_kill_switches,
 public.provider_readiness_status,private.merch_live_checkout_qualifications,private.commerce_tax_qualifications in share mode;$old$,$new$lock table private.merch_tax_categories,private.merch_tax_category_contexts,
 public.provider_readiness_status,private.merch_live_checkout_qualifications,private.commerce_tax_qualifications in share mode;$new$),
  ('public.bind_commerce_tax_checkout_policy(text,uuid,text,text,text,text)',$old$lock table private.merch_tax_categories,private.merch_tax_category_contexts,public.creator_payout_accounts,private.commerce_tax_qualifications in share mode;$old$,$new$lock table private.merch_tax_categories,private.merch_tax_category_contexts,private.commerce_tax_qualifications in share mode;$new$),
  ('public.record_merch_tax_category_context(uuid,uuid,uuid,text,timestamptz)',$old$lock table private.merch_tax_categories,private.commerce_tax_qualifications,public.creator_payout_accounts in share mode;$old$,$new$lock table private.merch_tax_categories,private.commerce_tax_qualifications in share mode;$new$),
  ('public.select_creator_merch_tax_category(uuid,uuid,timestamptz,text)',$old$lock table private.merch_tax_categories,private.merch_tax_category_contexts,private.commerce_tax_qualifications,public.creator_payout_accounts in share mode;$old$,$new$lock table private.merch_tax_categories,private.merch_tax_category_contexts,private.commerce_tax_qualifications in share mode;$new$),
  ('public.create_creator_channel_subscription_purchase_intent(uuid)',$old$  perform 1 from public.platform_money_kill_switches order by key for share;$old$,$new$ -- Current switch membership is frozen by the entry gate.$new$),
  ('public.claim_sandbox_creator_cashout_dispatch(uuid,text)',$old$ perform 1 from public.platform_money_kill_switches where key in
  ('live_money_enabled','payouts_enabled','cashout_enabled','stripe_connect_enabled','creator_monetization_enabled','provider_webhooks_enabled')
  order by key for share;$old$,$new$ -- Current switch membership is frozen by the entry gate.$new$),
  ('public.confirm_creator_connect_live_setup(uuid,uuid,text)',$old$ select * into t from public.creator_payout_accounts where creator_user_id=p_creator::text and provider='stripe_connect' and provider_environment='test' for share;$old$,$new$ select * into t from public.creator_payout_accounts where creator_user_id=p_creator::text and provider='stripe_connect' and provider_environment='test';$new$),
  ('public.create_creator_channel_subscription_purchase_intent(uuid)',$old$v_session jsonb:=public.wave1_session_authority_readback();$old$,$new$v_session jsonb;$new$),
  ('public.create_creator_channel_subscription_purchase_intent(uuid)',$old$  perform private.lock_ordinary_purchase_source_subjects('channel_subscription',p_offer_id);$old$,$new$  perform private.lock_ordinary_purchase_source_subjects('channel_subscription',p_offer_id);
  v_session:=public.wave1_session_authority_readback();$new$),
  ('public.cancel_undispatched_sandbox_creator_cashout(uuid)',$old$u uuid:=private.sandbox_cashout_current_user();$old$,$new$u uuid;$new$),
  ('public.cancel_undispatched_sandbox_creator_cashout(uuid)',$old$ perform private.lock_ordinary_commerce_authority_gate();$old$,$new$ perform private.lock_ordinary_commerce_authority_gate();
 u:=private.sandbox_cashout_current_user();$new$),
  ('public.request_sandbox_creator_cashout(integer,text,uuid,uuid,integer,integer,integer)',$old$u uuid:=private.sandbox_cashout_current_user();$old$,$new$u uuid;$new$),
  ('public.request_sandbox_creator_cashout(integer,text,uuid,uuid,integer,integer,integer)',$old$ perform private.lock_ordinary_commerce_authority_gate();$old$,$new$ perform private.lock_ordinary_commerce_authority_gate();
 u:=private.sandbox_cashout_current_user();$new$),
  ('public.reconcile_revenuecat_google_premium_snapshot_atomic(text,uuid,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text)',$old$v_now timestamptz := clock_timestamp();$old$,$new$v_now timestamptz;$new$),
  ('public.reconcile_revenuecat_google_premium_snapshot_atomic(text,uuid,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text)',$old$ perform private.lock_ordinary_commerce_authority_gate();$old$,$new$ perform private.lock_ordinary_commerce_authority_gate();
 v_now:=clock_timestamp();$new$),
  ('public.reconcile_revenuecat_premium_current_owner_snapshot_atomic(text,uuid,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text)',$old$v_now timestamptz := clock_timestamp();$old$,$new$v_now timestamptz;$new$),
  ('public.reconcile_revenuecat_premium_current_owner_snapshot_atomic(text,uuid,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text)',$old$ perform private.lock_ordinary_commerce_authority_gate();$old$,$new$ perform private.lock_ordinary_commerce_authority_gate();
 v_now:=clock_timestamp();$new$),
  ('public.create_live_watch_party_purchase_intent(uuid)',$old$  v_now timestamptz:=timezone('utc'::text,now());$old$,$new$  v_now timestamptz;$new$),
  ('public.create_live_watch_party_purchase_intent(uuid)',$old$    'live-watch-party-intent:'||v_user::text||':'||v_offer."id"::text,0));$old$,$new$    'live-watch-party-intent:'||v_user::text||':'||v_offer."id"::text,0));
  v_now:=clock_timestamp();$new$),
  ('public.update_my_username(text)',$old$  select "username" into previous_username$old$,$new$  perform private.platform_brand_retention_lock();
  select "username" into previous_username$new$),
  ('public.admin_force_update_username(text,text,text)',$old$  select "username" into previous_username$old$,$new$  perform private.platform_brand_retention_lock();
  select "username" into previous_username$new$),
  ('public.apply_admin_report_target_action(bigint,text,text,text,text)',$old$      select to_jsonb(profile) into v_target_before
      from public."user_profiles" profile$old$,$new$      perform private.platform_brand_retention_lock();
      select to_jsonb(profile) into v_target_before
      from public."user_profiles" profile$new$),
  ('public.record_creator_connect_live_observation(jsonb,jsonb)',$old$observed timestamptz:=clock_timestamp(); v_status$old$,$new$observed timestamptz:=clock_timestamp(); checked timestamptz; v_status$new$),
  ('public.record_creator_connect_live_observation(jsonb,jsonb)',$old$  update public.creator_payout_accounts set
    provider_live_observation=proof,$old$,$new$  perform private.platform_brand_retention_lock();
  checked:=clock_timestamp();
  if (p_facts->>'readStartedAt')::timestamptz is null
    or (p_facts->>'readStartedAt')::timestamptz not between checked-interval '60 seconds' and checked
  then raise exception 'live_observation_binding_invalid'; end if;
  update public.creator_payout_accounts set
    provider_live_observation=proof,$new$)
 ) p(signature,needle,replacement) loop
  definition:=pg_get_functiondef(patch.signature::regprocedure);
  if position(patch.needle in definition)=0 then raise exception 'ordinary_gate_replacement_anchor_missing: %',patch.signature; end if;
  execute replace(definition,patch.needle,patch.replacement);
 end loop;
end $covered_reads$;

-- Queue only already-bound immutable accounts. Invalid legacy rows must not
-- abort a healthy lease batch or obtain a fabricated identity through repair.
do $observation_binding$
declare definition text; needle text:=E' join public.wave1_creator_eligibility e on e.creator_user_id=u.id\n';
begin
 definition:=pg_get_functiondef('public.claim_creator_provider_observations()'::regprocedure);
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>2
 then raise exception 'ordinary_observer_binding_anchor_missing'; end if;
 execute replace(definition,needle,needle||$binding$
 join private.creator_connect_mode_bindings binding on binding.payout_account_id=a.id
  and binding.creator_id=a.creator_user_id and binding.environment=a.provider_environment
  and binding.provider_account_id=a.provider_account_id
$binding$);
end $observation_binding$;
commit;
