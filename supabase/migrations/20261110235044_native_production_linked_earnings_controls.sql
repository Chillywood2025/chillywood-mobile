-- Implemented first-release adapter, OFF by default. No API can enable it or
-- issue the independent source/report/funding qualifications. No provider I/O.
create table private.native_production_earning_controls (
 singleton boolean primary key default true check(singleton),
 materialize_held boolean not null default false, release_earnings boolean not null default false,
 check(not release_earnings or materialize_held)
);
insert into private.native_production_earning_controls values(true,false,false);
alter table private.native_production_earning_sources add column canonical_receipt_id uuid not null unique
 references private.native_production_sale_bindings(canonical_receipt_id);
create table private.native_production_funding_proofs (
 id uuid primary key default gen_random_uuid(), canonical_receipt_id uuid not null references private.native_production_sale_bindings(canonical_receipt_id),
 snapshot_id uuid not null references private.native_production_economic_snapshots(id),
 platform_account_id text not null check(platform_account_id ~ '^acct_[A-Za-z0-9]+$'),
 recipient_account_id text not null check(recipient_account_id ~ '^acct_[A-Za-z0-9]+$'),
 available_proceeds_minor bigint not null check(available_proceeds_minor>=0), currency text not null check(currency='usd'),
 funds_available_at timestamptz not null, verified_at timestamptz not null, expires_at timestamptz not null,
 basis text not null check(basis='authenticated_transaction_available_proceeds_and_delivery_v1'),
 evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 delivery_receipt_sha256 text not null check(delivery_receipt_sha256 ~ '^[0-9a-f]{64}$'),
 recovery_acceptance_id uuid not null references private.commerce_creator_fee_acceptances(id),
 check(platform_account_id<>recipient_account_id),
 check(isfinite(funds_available_at) and isfinite(verified_at) and isfinite(expires_at) and funds_available_at<=verified_at and expires_at>verified_at)
);
create table private.native_production_funding_revocations (
 proof_id uuid primary key references private.native_production_funding_proofs(id), revoked_at timestamptz not null default clock_timestamp()
);
create table private.native_production_earning_releases (
 earnings_ledger_id uuid primary key references private.native_production_earning_sources(earnings_ledger_id),
 funding_proof_id uuid not null references private.native_production_funding_proofs(id),
 created_at timestamptz not null default clock_timestamp()
);
create table private.native_production_accounting_jobs (
 snapshot_id uuid primary key references private.native_production_economic_snapshots(id),
 canonical_receipt_id uuid not null references private.native_production_sale_bindings(canonical_receipt_id),
 created_at timestamptz not null default clock_timestamp()
);
create table private.native_production_accounting_attempts (
 id bigint generated always as identity primary key,
 canonical_receipt_id uuid not null references private.native_production_sale_bindings(canonical_receipt_id),
 attempted_at timestamptz not null default clock_timestamp(), result jsonb not null
);
create index native_production_accounting_job_receipt on private.native_production_accounting_jobs(canonical_receipt_id);
create index native_production_accounting_attempt_latest on private.native_production_accounting_attempts(canonical_receipt_id,attempted_at desc,id desc);
do $$ declare t text; begin
 foreach t in array array['native_production_earning_controls','native_production_funding_proofs','native_production_funding_revocations',
  'native_production_earning_releases','native_production_accounting_jobs','native_production_accounting_attempts'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  if t<>'native_production_earning_controls' then
   execute format('create trigger %I before update or delete on private.%I for each row execute function public.block_revenuecat_webhook_ingress_mutation_internal()',t||'_immutable',t);
  end if;
 end loop;
end $$;
create function private.enqueue_native_production_accounting() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into private.native_production_accounting_jobs(snapshot_id,canonical_receipt_id) values(new.id,new.canonical_receipt_id);
 return new;
end $$;
create trigger native_production_accounting_job after insert on private.native_production_economic_snapshots
 for each row execute function private.enqueue_native_production_accounting();

-- All positive native operations take NONBLOCKING fences, then reload facts.
-- EXCLUSIVE (not ACCESS EXCLUSIVE) also excludes existing SELECT FOR UPDATE/SHARE
-- holders and implicit FK lockers, while allowing ordinary read-only SELECTs.
-- Any contention aborts this whole operation; no caught lock error continues to
-- a dispatch marker. Existing provider writers need no new lock ordering.
create function private.lock_native_production_accounting_facts(p_creator uuid) returns void
language plpgsql set search_path='' as $$
declare relation record;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'native_production_read_committed_required' using errcode='25000'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('native-production-accounting',0)) then
  raise exception 'native_production_accounting_busy' using errcode='55P03'; end if;
 for relation in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind='r' and ((n.nspname='private' and c.relname like 'native_production_%')
   or (n.nspname='auth' and c.relname=any(array['users','sessions']))
   or (n.nspname='public' and c.relname=any(array['videos','user_profiles','provider_events','revenuecat_unbound_terminal_authority',
    'account_deletion_requests','wave1_creator_eligibility','revenuecat_terminal_authority_quarantines',
    'revenuecat_terminal_authority_quarantine_resolutions','creator_money_recovery_obligations',
    'monetization_products','monetization_product_store_mappings','creator_content_prices','wave1_legal_document_versions','wave1_legal_acceptances',
    'money_access_ledger_events','creator_earnings_ledger','creator_earnings_lifecycle_events','creator_money_settlement_policies',
    'creator_payout_accounts','creator_payout_requests','creator_payout_allocations','platform_money_kill_switches']))
   or (n.nspname='private' and c.relname=any(array['commerce_creator_fee_acceptances','commerce_creator_fee_adjustments','commerce_creator_fee_offsets',
    'commerce_payable_releases','commerce_earnings_qualifications','creator_fee_credit_sources','creator_cashout_executions',
    'creator_cashout_provider_qualifications','creator_cashout_qualification_revocations','creator_cashout_dispatch_provenance',
    'creator_cashout_funding_cancellations']))) order by n.nspname,c.relname
 loop execute format('lock table %I.%I in exclusive mode nowait',relation.nspname,relation.relname); end loop;
 if p_creator is null or not pg_try_advisory_xact_lock(hashtextextended('creator-payout:'||p_creator::text,0)) then
  raise exception 'native_production_creator_busy' using errcode='55P03'; end if;
end $$;

-- Reuse the established settlement subject authority. The global quarantine
-- check is the existing final-cashout rule and deliberately grants no Premium
-- generation exception to paid video. Call only after the native fences for a
-- positive mutation; read-only balances may use it without acquiring locks.
create function private.native_production_release_subject_current(p_creator uuid) returns boolean
language sql volatile set search_path='' as $$
 select not public.is_account_access_restricted(p_creator::text)
  and public.wave1_user_has_active_legal_requirements_internal(p_creator,'creator_money') is true
  and exists(select 1 from public.wave1_creator_eligibility eligibility
   where eligibility.creator_user_id=p_creator and eligibility.state='VERIFIED' and eligibility.account_status='ACTIVE'
    and eligibility.age_18_plus and eligibility.legal_accepted and eligibility.creator_role
    and eligibility.moderation_state='CLEAR' and eligibility.market='UNITED_STATES'
    and eligibility.rollout_eligible and eligibility.platform_capability and eligibility.provider_eligible
    and eligibility.kyc_complete and eligibility.tax_complete and eligibility.sanctions_clear and eligibility.payout_eligible)
  and exists(select 1 from auth.users where id=p_creator)
  and exists(select 1 from auth.sessions where user_id=p_creator and (not_after is null or not_after>clock_timestamp()))
  and not public.revenuecat_authority_quarantined_internal(null,null,null);
$$;

create function private.native_production_canonical_receipt_current(p_receipt uuid) returns boolean
language sql volatile set search_path='' as $$
 select exists(select 1 from private.native_production_paid_video_observations observation
  join private.native_production_sale_bindings binding on binding.canonical_receipt_id=observation.canonical_receipt_id
  join private.native_production_video_admissions admission on admission.id=binding.admission_id
  join public.provider_events receipt on receipt.id=observation.canonical_receipt_id
  where receipt.id=p_receipt and receipt.product_id=admission.catalog_product_id and receipt.product_key=admission.product_key
   and row(receipt.provider_event_id,receipt.raw_payload_hash,receipt.provider,receipt.environment,receipt.event_type,
    receipt.user_id,receipt.app_user_id,receipt.metadata->>'provider_product_id',receipt.metadata->>'original_transaction_id')
   is not distinct from row(observation.provider_event_id,observation.raw_payload_hash,observation.provider,'production',
    observation.event_type,observation.buyer_id,observation.buyer_id::text,observation.canonical_provider_product_id,observation.original_transaction_id)
   and receipt.event_type='NON_RENEWING_PURCHASE' and receipt.status in ('ignored','processed'));
$$;

create function private.native_production_funding_current(p_receipt uuid,p_snapshot uuid) returns uuid
language plpgsql volatile set search_path='' as $$
declare proof private.native_production_funding_proofs; a private.native_production_video_admissions; projection jsonb;
 purchased timestamptz; snapshot_created timestamptz;
begin
 select admission.* into a from private.native_production_sale_bindings binding join private.native_production_video_admissions admission
  on admission.id=binding.admission_id where binding.canonical_receipt_id=p_receipt;
 select * into proof from private.native_production_funding_proofs where canonical_receipt_id=p_receipt order by verified_at desc,id desc limit 1;
 select purchased_at into purchased from private.native_production_purchase_correlations where canonical_receipt_id=p_receipt;
 select snapshot.projection,snapshot.created_at into projection,snapshot_created from private.native_production_economic_snapshots snapshot where snapshot.id=p_snapshot and snapshot.canonical_receipt_id=p_receipt;
 if proof.id is null or proof.snapshot_id<>p_snapshot or proof.currency<>a.currency
  -- Issuer protocol: read the persisted immutable snapshot, then verify its
  -- exact transaction's available proceeds and delivered source. A read from
  -- before purchase or before that snapshot cannot qualify this release.
  or purchased is null or snapshot_created is null or proof.funds_available_at<purchased
  or proof.verified_at<purchased or proof.verified_at<snapshot_created
  or proof.verified_at>clock_timestamp() or proof.expires_at<=clock_timestamp() or proof.funds_available_at>clock_timestamp()
  or exists(select 1 from private.native_production_funding_revocations where proof_id=proof.id)
  or projection->'economicCoverageComplete' is distinct from 'true'::jsonb
  or proof.available_proceeds_minor<>(projection->>'creatorCandidateMinor')::bigint+(projection->>'platformCandidateMinor')::bigint
  or not exists(select 1 from private.commerce_creator_fee_acceptances acceptance where acceptance.id=proof.recovery_acceptance_id
   and acceptance.creator_id=a.creator_id and acceptance.accepted_at<=proof.verified_at
   and acceptance.policy_version='known_costs_future_unpaid_adjustments_v1'
   and acceptance.terms_sha256=encode(extensions.digest(private.commerce_known_cost_terms(),'sha256'),'hex'))
  or not exists(select 1 from public.creator_payout_accounts account where account.creator_user_id=a.creator_id::text
   and account.provider='stripe_connect' and account.provider_environment='live' and account.provider_account_id=proof.recipient_account_id
   and account.status='eligible' and account.kyc_status='verified' and account.tax_status='verified')
 then return null; end if;
 return proof.id;
end $$;

create function public.reconcile_native_production_earning(p_canonical_receipt_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.native_production_video_admissions; source private.native_production_video_versions;
 correlation private.native_production_purchase_correlations; controls private.native_production_earning_controls;
 link private.native_production_earning_sources; policy public.creator_money_settlement_policies;
 evaluation jsonb; snapshot uuid; money_id uuid; earning_id uuid; funding_id uuid; original_funding uuid;
 net bigint; platform bigint; fee numeric; tax numeric; fee_tax numeric; component record; switch text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into controls from private.native_production_earning_controls where singleton;
 if controls.materialize_held is distinct from true then return jsonb_build_object('status','disabled','dispatchAllowed',false); end if;
 select admission.* into a from private.native_production_sale_bindings binding join private.native_production_video_admissions admission
  on admission.id=binding.admission_id where binding.canonical_receipt_id=p_canonical_receipt_id;
 if a.id is null then return jsonb_build_object('status','HELD','reason','production_admission_unbound','dispatchAllowed',false); end if;
 perform private.lock_native_production_accounting_facts(a.creator_id);
 -- Every mutable input is loaded again after the nonblocking fences.
 select * into controls from private.native_production_earning_controls where singleton;
 if controls.materialize_held is distinct from true then return jsonb_build_object('status','disabled','dispatchAllowed',false); end if;
 if private.native_production_canonical_receipt_current(p_canonical_receipt_id) is distinct from true then
  return jsonb_build_object('status','HELD','reason','native_canonical_receipt_changed','dispatchAllowed',false); end if;
 evaluation:=private.evaluate_native_production_economics(p_canonical_receipt_id);
 if evaluation->'economicCoverageComplete' is distinct from 'true'::jsonb then
  return jsonb_build_object('status','HELD','reason','actual_economics_or_current_source_unavailable','dispatchAllowed',false); end if;
 net:=(evaluation->>'creatorCandidateMinor')::bigint;platform:=(evaluation->>'platformCandidateMinor')::bigint;
 if net<=0 or net>2147483647 or platform>2147483647 then
  return jsonb_build_object('status','HELD','reason','creator_amount_not_representable','dispatchAllowed',false); end if;
 select * into strict source from private.native_production_video_versions where id=a.source_version_id;
 select * into strict correlation from private.native_production_purchase_correlations where canonical_receipt_id=p_canonical_receipt_id;
 select * into policy from public.creator_money_settlement_policies where source_type='paid_content';
 if policy.source_type is null or policy.requires_obligation_completion or policy.normal_hold is null
  or correlation.actual_gross_minor>2147483647 then
  return jsonb_build_object('status','HELD','reason','native_settlement_policy_unavailable','dispatchAllowed',false); end if;
 perform private.snapshot_native_production_economics(p_canonical_receipt_id);
 select id into strict snapshot from private.native_production_economic_snapshots where canonical_receipt_id=p_canonical_receipt_id and native_production_economic_snapshots.projection=evaluation order by created_at desc,id desc limit 1;
 select * into link from private.native_production_earning_sources where canonical_receipt_id=p_canonical_receipt_id;
 if link.earnings_ledger_id is null then
  if exists(select 1 from public.money_access_ledger_events where provider_event_id=p_canonical_receipt_id)
   or exists(select 1 from public.creator_earnings_ledger where provider_event_id=p_canonical_receipt_id) then
   return jsonb_build_object('status','HELD','reason','another_canonical_money_lane_exists','dispatchAllowed',false); end if;
  select coalesce(sum((facts->>'amountMinor')::numeric) filter(where facts->>'category'='store_fee'),0),
   coalesce(sum((facts->>'amountMinor')::numeric) filter(where facts->>'category'='fee_tax'),0),
   coalesce(sum((facts->>'amountMinor')::numeric) filter(where facts->>'category'='sales_tax'),0)
   into fee,fee_tax,tax from (select distinct on(facts->>'componentId') facts from private.native_production_report_observations
    where canonical_receipt_id=p_canonical_receipt_id and facts->>'kind'='component' order by facts->>'componentId',observed_at,observation_id) components;
  -- evaluate_native_production_economics already proved all categories explicit,
  -- attribution exact, conflicts absent and totals balanced. These zeros are sum
  -- identities after that proof, never substitutes for a missing component.
  if greatest(fee+fee_tax,tax)>2147483647 then return jsonb_build_object('status','HELD','reason','ledger_amount_overflow','dispatchAllowed',false); end if;
  insert into public.money_access_ledger_events(user_id,creator_id,product_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type,source_id,metadata)
   values(a.buyer_id,a.creator_id,a.catalog_product_id,p_canonical_receipt_id,'native_verified_actual_economics',correlation.actual_gross_minor::integer,a.currency,
    'production','pending_verification','pending','paid_content',source.source_id,jsonb_build_object('native_snapshot_id',snapshot)) returning id into money_id;
  insert into public.creator_earnings_ledger(creator_id,source_type,source_id,gross_amount_cents,platform_fee_cents,provider_fee_cents,tax_cents,net_creator_amount_cents,
   currency,ledger_status,money_ledger_event_id,provider_event_id,settlement_reference_hash,settlement_started_at,normal_eligible_at,reserve_amount_cents,reserve_release_at,settlement_policy_version,metadata)
   values(a.creator_id,'paid_content',source.source_id,correlation.actual_gross_minor::integer,platform::integer,(fee+fee_tax)::integer,tax::integer,net::integer,
    a.currency,'held',money_id,p_canonical_receipt_id,(select evaluation_sha256 from private.native_production_economic_snapshots where id=snapshot),
    correlation.purchased_at,correlation.purchased_at+policy.normal_hold,ceil(net::numeric*policy.reserve_basis_points/10000)::integer,
    correlation.purchased_at+policy.normal_hold+policy.reserve_duration,policy.policy_version,jsonb_build_object('native_snapshot_id',snapshot)) returning id into earning_id;
  insert into private.native_production_earning_sources(earnings_ledger_id,snapshot_id,canonical_receipt_id) values(earning_id,snapshot,p_canonical_receipt_id) returning * into link;
 else
  select money_ledger_event_id into money_id from public.creator_earnings_ledger where id=link.earnings_ledger_id;
  earning_id:=link.earnings_ledger_id;
  if not exists(select 1 from private.native_production_economic_snapshots old where old.id=link.snapshot_id and old.projection=evaluation) then
   return jsonb_build_object('status','HELD','reason','native_adjustment_reconciliation_required','earningsLedgerId',earning_id,'dispatchAllowed',false); end if;
 end if;
 if controls.release_earnings is distinct from true then
  return jsonb_build_object('status','HELD','reason','native_release_disabled','earningsLedgerId',earning_id,'dispatchAllowed',false); end if;
 foreach switch in array array['live_money_enabled','payouts_enabled','stripe_connect_enabled'] loop
  if not exists(select 1 from public.platform_money_kill_switches where key=switch and state='on') then
   return jsonb_build_object('status','HELD','reason','global_money_disabled','earningsLedgerId',earning_id,'dispatchAllowed',false); end if;
 end loop;
 if private.native_production_release_subject_current(a.creator_id) is distinct from true then
  return jsonb_build_object('status','HELD','reason','native_release_subject_unqualified','earningsLedgerId',earning_id,'dispatchAllowed',false); end if;
 funding_id:=private.native_production_funding_current(p_canonical_receipt_id,link.snapshot_id);
 if funding_id is null or correlation.purchased_at+policy.normal_hold>clock_timestamp() then
  return jsonb_build_object('status','HELD','reason','native_funding_or_maturity_unqualified','earningsLedgerId',earning_id,'dispatchAllowed',false); end if;
 select funding_proof_id into original_funding from private.native_production_earning_releases where earnings_ledger_id=earning_id;
 if original_funding is not null and exists(select 1 from private.native_production_funding_proofs original join private.native_production_funding_proofs current_funding
  on current_funding.id=funding_id where original.id=original_funding and row(original.platform_account_id,original.recipient_account_id)
   is distinct from row(current_funding.platform_account_id,current_funding.recipient_account_id)) then
  return jsonb_build_object('status','HELD','reason','native_recipient_changed','earningsLedgerId',earning_id,'dispatchAllowed',false); end if;
 insert into private.native_production_earning_releases(earnings_ledger_id,funding_proof_id) values(earning_id,funding_id) on conflict do nothing;
 update public.money_access_ledger_events set status='verified',payable_state='payable',metadata=metadata||
  jsonb_build_object('payout_readiness_proved',true,'live_money_enabled_at_verification',true)
  where id=money_id and status='pending' and payable_state='pending_verification';
 perform public.record_creator_earnings_lifecycle_internal(earning_id,'available','settlement_released','native-production-release:'||earning_id::text,null,money_id,
  jsonb_build_object('native_funding_proof_id',funding_id));
 return jsonb_build_object('status',public.creator_earnings_current_state_internal(earning_id),'earningsLedgerId',earning_id,'dispatchAllowed',false);
end $$;
revoke all on function public.reconcile_native_production_earning(uuid) from public,anon,authenticated,service_role;
grant execute on function public.reconcile_native_production_earning(uuid) to service_role;

-- Normal snapshot triggers enqueue work. This bounded service worker consumes
-- it without accepting caller-supplied economics/proofs. Old held work cannot
-- starve new receipts: least-recently-attempted receipts are visited first.
create function public.process_native_production_accounting_jobs(p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job record; result jsonb; processed integer:=0;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if p_limit is null or p_limit not between 1 and 20 then raise exception 'native_accounting_batch_invalid'; end if;
 if not exists(select 1 from private.native_production_earning_controls where singleton and materialize_held) then
  return jsonb_build_object('status','disabled','processed',0,'providerWrite',false); end if;
 for job in select jobs.canonical_receipt_id,attempt.attempted_at last_attempt
  from (select distinct canonical_receipt_id from private.native_production_accounting_jobs) jobs
  left join lateral (select attempted_at from private.native_production_accounting_attempts
   where canonical_receipt_id=jobs.canonical_receipt_id order by attempted_at desc,id desc limit 1) attempt on true
  order by last_attempt nulls first,jobs.canonical_receipt_id limit p_limit
 loop
  begin
   result:=public.reconcile_native_production_earning(job.canonical_receipt_id);
  exception when others then
   -- A PL/pgSQL exception block is a database subtransaction: every write and
   -- lock taken by this receipt is rolled back before recording failure. Do not
   -- pretend that failed accounting succeeded, or lose other receipts forever.
   result:=jsonb_build_object('status','HELD','reason','accounting_attempt_failed','sqlstate',sqlstate,'dispatchAllowed',false);
  end;
  -- Failure bookkeeping cannot turn a failed NOWAIT accounting attempt into an
  -- unbounded wait on the same holder's fence or its FK relation. If these are
  -- busy, the whole bounded batch fails and is safely retried later.
  lock table private.native_production_accounting_attempts in row exclusive mode nowait;
  lock table private.native_production_sale_bindings in row share mode nowait;
  insert into private.native_production_accounting_attempts(canonical_receipt_id,result) values(job.canonical_receipt_id,result);
  processed:=processed+1;
 end loop;
 return jsonb_build_object('status','complete','processed',processed,'providerWrite',false);
end $$;
revoke all on function public.process_native_production_accounting_jobs(integer) from public,anon,authenticated,service_role;
grant execute on function public.process_native_production_accounting_jobs(integer) to service_role;

create or replace function private.native_production_current_earning_domain_ready(p_earning uuid) returns boolean
language plpgsql volatile set search_path='' as $$
declare link private.native_production_earning_sources; earning public.creator_earnings_ledger; money public.money_access_ledger_events;
 a private.native_production_video_admissions; snapshot private.native_production_economic_snapshots;
 release private.native_production_earning_releases; current_funding uuid; projection jsonb;
 source private.native_production_video_versions; correlation private.native_production_purchase_correlations;
 policy public.creator_money_settlement_policies; fee numeric; tax numeric;
begin
 if not private.native_production_earning_in_domain(p_earning) then return true; end if;
 if not exists(select 1 from private.native_production_earning_controls where singleton and materialize_held and release_earnings) then return false; end if;
 select * into link from private.native_production_earning_sources where earnings_ledger_id=p_earning;
 if link.earnings_ledger_id is null then return false; end if;
 select * into strict snapshot from private.native_production_economic_snapshots where id=link.snapshot_id;
 select * into earning from public.creator_earnings_ledger where id=p_earning;
 select * into money from public.money_access_ledger_events where id=earning.money_ledger_event_id;
 select admission.* into a from private.native_production_sale_bindings binding join private.native_production_video_admissions admission
  on admission.id=binding.admission_id where binding.canonical_receipt_id=link.canonical_receipt_id;
 select * into release from private.native_production_earning_releases where earnings_ledger_id=p_earning;
 select * into source from private.native_production_video_versions where id=a.source_version_id;
 select * into correlation from private.native_production_purchase_correlations where canonical_receipt_id=link.canonical_receipt_id;
 select * into policy from public.creator_money_settlement_policies where source_type='paid_content';
 if release.earnings_ledger_id is null or money.id is null or a.id is null
  or private.native_production_canonical_receipt_current(link.canonical_receipt_id) is distinct from true
  or source.id is null or correlation.canonical_receipt_id is null or policy.source_type is null
  or private.native_production_release_subject_current(a.creator_id) is distinct from true
  or row(earning.creator_id,earning.source_type,earning.source_id,earning.provider_event_id,earning.currency,earning.gross_amount_cents,
   earning.settlement_started_at,earning.normal_eligible_at,earning.reserve_release_at,earning.settlement_policy_version,earning.settlement_reference_hash)
   is distinct from row(a.creator_id,'paid_content',source.source_id,link.canonical_receipt_id,a.currency,correlation.actual_gross_minor,
    correlation.purchased_at,correlation.purchased_at+policy.normal_hold,correlation.purchased_at+policy.normal_hold+policy.reserve_duration,policy.policy_version,snapshot.evaluation_sha256)
  or row(money.user_id,money.creator_id,money.product_id,money.provider_event_id,money.environment,money.source_type,money.source_id,money.currency,money.amount_minor)
   is distinct from row(a.buyer_id,a.creator_id,a.catalog_product_id,link.canonical_receipt_id,'production','paid_content',source.source_id,a.currency,a.gross_minor)
  or money.status<>'verified' or money.payable_state not in ('payable','paid') then return false; end if;
 projection:=private.evaluate_native_production_economics(link.canonical_receipt_id);
 if projection->'economicCoverageComplete' is distinct from 'true'::jsonb or projection<>snapshot.projection
  or (projection->>'creatorCandidateMinor')::bigint<>earning.net_creator_amount_cents
  or (projection->>'platformCandidateMinor')::bigint<>earning.platform_fee_cents then return false; end if;
 select coalesce(sum((facts->>'amountMinor')::numeric) filter(where facts->>'category' in ('store_fee','fee_tax')),0),
  coalesce(sum((facts->>'amountMinor')::numeric) filter(where facts->>'category'='sales_tax'),0) into fee,tax
  from (select distinct on(facts->>'componentId') facts from private.native_production_report_observations
   where canonical_receipt_id=link.canonical_receipt_id and facts->>'kind'='component' order by facts->>'componentId',observed_at,observation_id) components;
 if row(earning.provider_fee_cents,earning.tax_cents,earning.reserve_amount_cents)
   is distinct from row(fee,tax,ceil(earning.net_creator_amount_cents::numeric*policy.reserve_basis_points/10000)) then return false; end if;
 current_funding:=private.native_production_funding_current(link.canonical_receipt_id,link.snapshot_id);
 return current_funding is not null and exists(select 1 from private.native_production_funding_proofs original
  join private.native_production_funding_proofs current_proof on current_proof.id=current_funding
  where original.id=release.funding_proof_id and row(original.platform_account_id,original.recipient_account_id)
   is not distinct from row(current_proof.platform_account_id,current_proof.recipient_account_id));
end $$;
alter function private.commerce_current_earning_domain_ready(uuid) volatile;

-- Existing commerce domain locks remain first. Native additions never wait and
-- may be reacquired by the retained dispatch predecessor. An input/table/creator
-- conflict fails before any new dispatch provenance or external provider call.
alter function private.lock_commerce_cashout_domains(uuid) rename to lock_commerce_cashout_domains_before_native_release;
create function private.lock_commerce_cashout_domains(p_request uuid) returns void
language plpgsql set search_path='' as $$
declare creator uuid;
begin
 perform private.lock_commerce_cashout_domains_before_native_release(p_request);
 if exists(select 1 from public.creator_payout_allocations allocation where allocation.payout_request_id=p_request
  and private.native_production_earning_in_domain(allocation.earnings_ledger_id)) then
  select creator_id into strict creator from public.creator_payout_requests where id=p_request;
  perform private.lock_native_production_accounting_facts(creator);
 end if;
end $$;
-- A changed current cashout account must never reroute an already-bound native
-- sale. This assertion is used only for funding/payout, not corrective returns.
create function private.assert_native_production_cashout_recipient(p_request uuid,p_platform text,p_recipient text) returns void
language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.creator_payout_allocations allocation
  join private.native_production_earning_sources source on source.earnings_ledger_id=allocation.earnings_ledger_id
  left join private.native_production_earning_releases release on release.earnings_ledger_id=source.earnings_ledger_id
  left join private.native_production_funding_proofs funding on funding.id=release.funding_proof_id
  where allocation.payout_request_id=p_request and (funding.id is null
   or row(funding.platform_account_id,funding.recipient_account_id) is distinct from row(p_platform,p_recipient)))
 then raise exception 'native_production_cashout_recipient_mismatch'; end if;
end $$;
do $$ declare definition text; marker text:=E'begin\n'; begin
 definition:=pg_get_functiondef('private.assert_cashout_dispatch_admission(public.creator_payout_requests,private.creator_cashout_provider_qualifications)'::regprocedure);
 if position(marker in definition)=0 then raise exception 'native_cashout_admission_anchor_changed'; end if;
 execute overlay(definition placing marker||' perform private.assert_native_production_cashout_recipient(p_request.id,p_qualification.platform_account_id,p_qualification.account_id);'||E'\n'
  from position(marker in definition) for length(marker));
end $$;
do $$ declare f record; begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='private'::regnamespace and
 (proname like '%native_production%' or proname in ('lock_commerce_cashout_domains','lock_commerce_cashout_domains_before_native_release')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
