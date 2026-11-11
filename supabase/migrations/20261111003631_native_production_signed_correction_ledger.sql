-- Source-only signed correction adapter. Independent issuers remain absent and
-- controls remain OFF. No provider request, bank debit or paid-allocation rewrite.
alter table private.native_production_earning_controls
 add column account_corrections boolean not null default false,
 add column release_correction_credits boolean not null default false,
 add check(not release_correction_credits or (account_corrections and release_earnings));

create table private.native_production_correction_qualifications (
 id uuid primary key default gen_random_uuid(),
 scope_id uuid not null references private.native_production_scope_qualifications(id),
 report_schema text not null check(length(btrim(report_schema)) between 1 and 128),
 basis text not null check(basis='authenticated_transaction_signed_deltas_and_cumulative_proceeds_v1'),
 evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 verified_at timestamptz not null, expires_at timestamptz not null,
 check(isfinite(verified_at) and isfinite(expires_at) and expires_at>verified_at)
);
create table private.native_production_correction_revocations (
 qualification_id uuid primary key references private.native_production_correction_qualifications(id),
 revoked_at timestamptz not null default clock_timestamp()
);
create table private.native_production_correction_reports (
 id uuid primary key default gen_random_uuid(),
 canonical_receipt_id uuid not null references private.native_production_sale_bindings(canonical_receipt_id),
 baseline_snapshot_id uuid not null references private.native_production_economic_snapshots(id),
 observation_id text not null check(length(btrim(observation_id)) between 1 and 512),
 revision bigint not null check(revision between 1 and 2147483647),
 qualification_id uuid not null references private.native_production_correction_qualifications(id),
 evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 semantic_sha256 text not null check(semantic_sha256 ~ '^[0-9a-f]{64}$'),
 facts jsonb not null check(jsonb_typeof(facts)='object'), observed_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp(),unique(canonical_receipt_id,observation_id)
);
create index native_production_correction_latest on private.native_production_correction_reports(canonical_receipt_id,revision desc,observed_at desc);
create table private.native_production_correction_components (
 canonical_receipt_id uuid not null references private.native_production_sale_bindings(canonical_receipt_id),
 component_id text not null, facts_sha256 text not null check(facts_sha256 ~ '^[0-9a-f]{64}$'),
 facts jsonb not null check(jsonb_typeof(facts)='object'),
 first_report_id uuid not null references private.native_production_correction_reports(id),
 primary key(canonical_receipt_id,component_id,facts_sha256)
);
create table private.native_production_corrected_openings (
 earnings_ledger_id uuid primary key references private.native_production_earning_sources(earnings_ledger_id),
 report_id uuid not null unique references private.native_production_correction_reports(id),
 original_gross_minor bigint not null check(original_gross_minor>0), refunded_minor bigint not null check(refunded_minor>=0),
 retained_gross_minor bigint not null check(retained_gross_minor>0), provider_fee_minor bigint not null check(provider_fee_minor>=0),
 tax_minor bigint not null check(tax_minor>=0), platform_minor bigint not null check(platform_minor>=0), creator_minor bigint not null check(creator_minor>0),
 acceptance_id uuid not null references private.commerce_creator_fee_acceptances(id),
 created_at timestamptz not null default clock_timestamp(),
 check(original_gross_minor-refunded_minor=retained_gross_minor),
 check(retained_gross_minor=provider_fee_minor+tax_minor+platform_minor+creator_minor)
);
create table private.native_production_correction_checkpoints (
 id bigint generated always as identity primary key,
 canonical_receipt_id uuid not null references private.native_production_sale_bindings(canonical_receipt_id),
 report_id uuid not null unique references private.native_production_correction_reports(id),
 original_earnings_id uuid not null references private.native_production_earning_sources(earnings_ledger_id),
 prior_target_minor bigint not null, target_minor bigint not null, delta_minor bigint not null,
 adjustment_id uuid references private.commerce_creator_fee_adjustments(id),
 credit_earnings_id uuid references public.creator_earnings_ledger(id),
 created_at timestamptz not null default clock_timestamp(),check(delta_minor=target_minor-prior_target_minor),
 check((delta_minor<0 and adjustment_id is not null and credit_earnings_id is null)
  or(delta_minor>0 and adjustment_id is null and credit_earnings_id is not null)
  or(delta_minor=0 and adjustment_id is null and credit_earnings_id is null))
);
create table private.native_production_credit_sources (
 earnings_ledger_id uuid primary key references public.creator_earnings_ledger(id),
 original_earnings_id uuid not null references private.native_production_earning_sources(earnings_ledger_id),
 report_id uuid not null unique references private.native_production_correction_reports(id),
 creator_id uuid not null, currency text not null check(currency='usd'),
 amount_minor bigint not null check(amount_minor between 1 and 2147483647),
 acceptance_id uuid not null references private.commerce_creator_fee_acceptances(id),
 created_at timestamptz not null default clock_timestamp()
);
create table private.native_production_corrected_funding_proofs (
 id uuid primary key default gen_random_uuid(),
 checkpoint_id bigint not null references private.native_production_correction_checkpoints(id),
 liability_generation bigint not null,
 liability_sha256 text not null check(liability_sha256 ~ '^[0-9a-f]{64}$'),
 actual_available_minor bigint not null check(actual_available_minor>=0), currency text not null check(currency='usd'),
 platform_account_id text not null check(platform_account_id ~ '^acct_[A-Za-z0-9]+$'),
 recipient_account_id text not null check(recipient_account_id ~ '^acct_[A-Za-z0-9]+$'),
 basis text not null check(basis='authenticated_single_platform_usd_global_creator_liability_v1'),
 evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 delivery_receipt_sha256 text not null check(delivery_receipt_sha256 ~ '^[0-9a-f]{64}$'),
 verified_at timestamptz not null, expires_at timestamptz not null,
 check(platform_account_id<>recipient_account_id),
 check(isfinite(verified_at) and isfinite(expires_at) and expires_at>verified_at)
);
create table private.native_production_corrected_funding_revocations (
 proof_id uuid primary key references private.native_production_corrected_funding_proofs(id),
 revoked_at timestamptz not null default clock_timestamp()
);
create table private.native_production_corrected_releases (
 earnings_ledger_id uuid primary key references public.creator_earnings_ledger(id),
 proof_id uuid not null references private.native_production_corrected_funding_proofs(id),
 created_at timestamptz not null default clock_timestamp()
);
create table private.native_production_liability_history (
 id bigint generated always as identity primary key,
 allocation_id uuid not null, earnings_ledger_id uuid not null,
 before_facts jsonb, after_facts jsonb, recorded_at timestamptz not null default clock_timestamp()
);
create table private.native_production_liability_generation (
 singleton boolean primary key default true check(singleton), generation bigint not null check(generation>=0),
 chain_sha256 text not null check(chain_sha256 ~ '^[0-9a-f]{64}$'), recorded_at timestamptz not null
);
insert into private.native_production_liability_generation values(true,0,repeat('0',64),clock_timestamp());
alter table private.native_production_liability_generation enable row level security;
alter table private.native_production_liability_generation force row level security;
revoke all on private.native_production_liability_generation from public,anon,authenticated,service_role;
create table private.native_production_liability_snapshots (
 generation bigint primary key, generation_sha256 text not null, amount_minor bigint not null check(amount_minor>=0),
 liability_sha256 text not null check(liability_sha256 ~ '^[0-9a-f]{64}$'), captured_at timestamptz not null default clock_timestamp(),
 earning_count integer not null check(earning_count>=0), examined_count integer not null check(examined_count>=earning_count),
 construction_ms integer not null check(construction_ms>=0), digest_version text not null check(digest_version='ordered_current_liabilities_v2')
);
create table private.native_production_liability_capture_failures (
 id bigint generated always as identity primary key, generation bigint not null, reason text not null,
 examined_count integer not null, active_count integer not null, construction_ms integer not null,
 recorded_at timestamptz not null default clock_timestamp(), unique(generation,reason),
 check(reason in ('examined_budget_exceeded','duration_budget_exceeded','allocation_budget_exceeded','offset_budget_exceeded',
  'negative_residual','unknown_provenance','unsupported_currency','amount_overflow'))
);
alter table private.native_production_corrected_funding_proofs add foreign key(liability_generation)
 references private.native_production_liability_snapshots(generation);
do $$ declare t text; begin
 foreach t in array array['native_production_correction_qualifications','native_production_correction_revocations','native_production_correction_reports',
  'native_production_correction_components','native_production_corrected_openings','native_production_correction_checkpoints','native_production_credit_sources',
  'native_production_corrected_funding_proofs','native_production_corrected_funding_revocations','native_production_corrected_releases','native_production_liability_history','native_production_liability_snapshots','native_production_liability_capture_failures'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before update or delete on private.%I for each row execute function public.block_revenuecat_webhook_ingress_mutation_internal()',t||'_immutable',t);
 end loop;
end $$;

-- Historical production identity, independent of CURRENT qualification or
-- release eligibility. Revocation/expiry never extinguishes an issued debt.
create function private.native_production_liability_original_identity(p_earning public.creator_earnings_ledger) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from private.native_production_earning_sources link
  join private.native_production_economic_snapshots snap on snap.id=link.snapshot_id and snap.canonical_receipt_id=link.canonical_receipt_id
  join private.native_production_sale_bindings binding on binding.canonical_receipt_id=link.canonical_receipt_id
  join private.native_production_purchase_correlations correlation on correlation.canonical_receipt_id=binding.canonical_receipt_id and correlation.admission_id=binding.admission_id
  join private.native_production_video_admissions admission on admission.id=binding.admission_id
  join private.native_production_video_versions version on version.id=admission.source_version_id and version.creator_id=admission.creator_id
  join private.native_production_source_proofs proof on proof.id=admission.source_proof_id and proof.version_id=version.id
  left join private.native_production_corrected_openings opening on opening.earnings_ledger_id=link.earnings_ledger_id
  join public.money_access_ledger_events money on money.id=p_earning.money_ledger_event_id
  where link.earnings_ledger_id=p_earning.id and link.canonical_receipt_id=p_earning.provider_event_id
   and private.native_production_canonical_receipt_current(link.canonical_receipt_id)
   and row(p_earning.creator_id,p_earning.source_type,p_earning.source_id,p_earning.currency,p_earning.gross_amount_cents)
    is not distinct from row(admission.creator_id,'paid_content',version.source_id,admission.currency,coalesce(opening.retained_gross_minor,correlation.actual_gross_minor))
   and row(money.user_id,money.product_id) is not distinct from row(admission.buyer_id,admission.catalog_product_id));
$$;

-- Environment text alone cannot exclude a liability. Immutable production
-- lineage takes precedence over BOTH public sandbox labels. Unknown or
-- contradictory lineage holds the WHOLE pool rather than reducing coverage.
create function private.native_production_liability_provenance(p_earning public.creator_earnings_ledger) returns text
language plpgsql stable set search_path='' as $$
declare money public.money_access_ledger_events; receipt public.provider_events; native boolean; commerce boolean;
begin
 select * into money from public.money_access_ledger_events where id=p_earning.money_ledger_event_id;
 select * into receipt from public.provider_events where id=p_earning.provider_event_id;
 if money.id is null or receipt.id is null or money.provider_event_id is distinct from receipt.id
  or row(money.creator_id,money.currency,money.source_type,money.source_id,money.amount_minor,money.user_id)
   is distinct from row(p_earning.creator_id,p_earning.currency,p_earning.source_type,p_earning.source_id,p_earning.gross_amount_cents,receipt.user_id)
  or receipt.provider not in ('stripe_connect','stripe_physical_goods','revenuecat_google_play','revenuecat_app_store','google_play','revenuecat')
 then return 'unknown';end if;
 native:=exists(select 1 from private.native_production_earning_sources where earnings_ledger_id=p_earning.id)
  or exists(select 1 from private.native_production_credit_sources where earnings_ledger_id=p_earning.id)
  or exists(select 1 from private.native_production_paid_video_observations where canonical_receipt_id=receipt.id)
  or receipt.event_type='native_verified_correction_credit' or money.event_type='native_verified_correction_credit'
  or p_earning.metadata ?| array['native_snapshot_id','native_correction_report_id','native_opening_report_id']
  or money.metadata ?| array['native_snapshot_id','native_correction_report_id','native_opening_report_id']
  or (p_earning.source_type='paid_content' and receipt.provider in ('revenuecat_google_play','revenuecat_app_store'));
 commerce:=exists(select 1 from private.commerce_payable_releases where earnings_ledger_id=p_earning.id)
  or exists(select 1 from private.creator_fee_credit_sources where earnings_ledger_id=p_earning.id)
  or receipt.event_type in ('commerce_verified_cost_release','verified_provider_fee_credit')
  or p_earning.metadata ?| array['commerce_snapshot_id','fee_credit'];
 if native or commerce then
  if money.environment<>'production' or receipt.environment<>'production' then return 'unknown';end if;
  if native then
   if private.native_production_liability_original_identity(p_earning) then return 'production';end if;
   if exists(select 1 from private.native_production_credit_sources credit
    join public.creator_earnings_ledger original on original.id=credit.original_earnings_id
    join private.native_production_earning_sources source on source.earnings_ledger_id=original.id
    join private.native_production_paid_video_observations original_observation on original_observation.canonical_receipt_id=source.canonical_receipt_id
    join private.native_production_correction_reports report on report.id=credit.report_id and report.canonical_receipt_id=source.canonical_receipt_id
    join private.native_production_sale_bindings binding on binding.canonical_receipt_id=source.canonical_receipt_id
    join private.native_production_video_admissions admission on admission.id=binding.admission_id
    where credit.earnings_ledger_id=p_earning.id and private.native_production_liability_original_identity(original)
     and receipt.provider=original_observation.provider
     and row(credit.creator_id,credit.currency,credit.amount_minor,p_earning.source_type,p_earning.source_id,p_earning.net_creator_amount_cents,money.product_id,money.user_id)
      is not distinct from row(p_earning.creator_id,p_earning.currency,p_earning.gross_amount_cents,'paid_content',original.source_id,credit.amount_minor,admission.catalog_product_id,admission.buyer_id)
     and row(receipt.provider_event_id,receipt.event_type,receipt.status,receipt.idempotency_key,receipt.metadata->>'native_correction_report_id',receipt.metadata->>'native_original_receipt_id')
      is not distinct from row('native-correction:'||report.id::text,'native_verified_correction_credit','processed','native-correction:'||report.id::text,report.id::text,source.canonical_receipt_id::text))
   then return 'production';end if;
   return 'unknown';
  end if;
  if not exists(select 1 from private.commerce_payable_releases release join private.commerce_earnings_qualifications q on q.id=release.qualification_id
    join private.commerce_known_cost_snapshots snap on snap.id=release.snapshot_id
    where release.earnings_ledger_id=p_earning.id and q.environment='live' and q.currency=p_earning.currency
     and q.creator_id=p_earning.creator_id and release.creator_id=p_earning.creator_id and snap.creator_id=p_earning.creator_id
     and snap.environment='live' and snap.currency=p_earning.currency and snap.source_type=release.source_type
     and release.delta_minor=p_earning.net_creator_amount_cents and release.delta_minor=p_earning.gross_amount_cents
     and p_earning.source_type='product' and p_earning.source_id=release.source_id and snap.source_id=release.source_id)
   and not exists(select 1 from private.creator_fee_credit_sources credit
    join public.creator_earnings_ledger original on original.id=credit.original_earnings_ledger_id and original.creator_id=credit.creator_id
    join private.commerce_creator_fee_acceptances accepted on accepted.id=credit.acceptance_id and accepted.creator_id=credit.creator_id
    where credit.earnings_ledger_id=p_earning.id
    and credit.creator_id=p_earning.creator_id and credit.amount_minor=p_earning.gross_amount_cents and credit.amount_minor=p_earning.net_creator_amount_cents
    and p_earning.source_type='adjustment' and p_earning.source_id=credit.source_id)
  then return 'unknown';end if;
 end if;
 if money.environment=receipt.environment and money.environment in ('production','sandbox')
  and receipt.status in ('processed','refunded','reversed') and p_earning.source_type in
   ('tip','paid_content','product','adjustment','watch_party_ticket','live_watch_party_access','live_watch_party_seat','event_pass','vip_pass','channel_subscription')
 then return money.environment;end if;
 return 'unknown';
end
$$;

create function private.advance_native_production_liability_generation(p_kind text,p_before jsonb,p_after jsonb) returns void
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare stamp timestamptz:=clock_timestamp();
begin
 -- Ordinary writers may already hold creator/business locks. Never wait for
 -- this shared row and invert their lock order. 55P03 aborts the entire mutation
 -- (including any preceding audit insert), for the caller's normal retry path.
 lock table private.native_production_liability_generation in row exclusive mode nowait;
 perform 1 from private.native_production_liability_generation where singleton for update nowait;
 if not found then raise exception 'native_liability_generation_missing';end if;
 update private.native_production_liability_generation set generation=generation+1,recorded_at=stamp,
  chain_sha256=encode(extensions.digest(convert_to(jsonb_build_object('previous',chain_sha256,'generation',generation+1,
   'observedEpoch',extract(epoch from stamp),'kind',p_kind,'before',p_before,'after',p_after)::text,'UTF8'),'sha256'),'hex') where singleton;
 if not found then raise exception 'native_liability_generation_missing';end if;
end $$;

-- A later immutable production link must invalidate any earlier sandbox or
-- unknown classification. These tables are append-only; no UPDATE/DELETE path
-- can silently change lineage. Source proof expiry is deliberately not a debt
-- mutation and does not remove already issued liability.
create function private.capture_native_production_liability_lineage() returns trigger
language plpgsql security definer set search_path='' set timezone='UTC' as $$
begin
 if (to_jsonb(new)->>'earnings_ledger_id') is not null and exists(select 1 from private.native_production_earning_controls where singleton and account_corrections) then
  perform private.advance_native_production_liability_generation('lineage:'||tg_table_name,null,to_jsonb(new));
 end if;
 return new;
end $$;
-- Normal ingress may append evidence after a legacy generic earning. The
-- observation is not settlement authority, but it can contradict that earning's
-- previous generic provenance. Invalidate before returning an old cached answer.
create function private.capture_native_production_observation_lineage() returns trigger
language plpgsql security definer set search_path='' set timezone='UTC' as $$
begin
 if not exists(select 1 from private.native_production_earning_controls where singleton and account_corrections) then return new;end if;
 if exists(select 1 from public.creator_earnings_ledger e where e.provider_event_id=new.canonical_receipt_id
  and e.source_type<>'payout' and e.net_creator_amount_cents>0) then
  perform private.advance_native_production_liability_generation('paid_video_observation',null,
   jsonb_build_array(new.canonical_receipt_id,new.provider_event_id,new.raw_payload_hash));
 end if;
 return new;
end $$;
create trigger native_production_observation_generation after insert on private.native_production_paid_video_observations
 for each row execute function private.capture_native_production_observation_lineage();
do $$ declare relation text; begin
 foreach relation in array array['native_production_earning_sources','native_production_credit_sources','native_production_corrected_openings','commerce_payable_releases','creator_fee_credit_sources'] loop
  execute format('create trigger native_production_lineage_generation after insert on private.%I for each row execute function private.capture_native_production_liability_lineage()',relation);
 end loop;
end $$;

-- Business created_at is never read freshness authority. These triggers record
-- every change to an earning's amount/pool membership and its actual offsets,
-- even when a writer preserves a historical date or began its transaction long
-- before the insert. Money provenance transitions are independently captured.
create function private.capture_native_production_pool_change() returns trigger
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare before_row jsonb; after_row jsonb; affected boolean:=false;
begin
 if not exists(select 1 from private.native_production_earning_controls where singleton and account_corrections) then
  if tg_op='DELETE' then return old;end if;return new;end if;
 if tg_table_name='creator_earnings_ledger' then
  if tg_op<>'INSERT' then before_row:=jsonb_build_object('id',old.id,'creator',old.creator_id,'source',old.source_type,'sourceId',old.source_id,'currency',old.currency,'gross',old.gross_amount_cents,'net',old.net_creator_amount_cents,'money',old.money_ledger_event_id,'receipt',old.provider_event_id,
   'provenance',private.native_production_liability_provenance(old));end if;
  if tg_op<>'DELETE' then after_row:=jsonb_build_object('id',new.id,'creator',new.creator_id,'source',new.source_type,'sourceId',new.source_id,'currency',new.currency,'gross',new.gross_amount_cents,'net',new.net_creator_amount_cents,'money',new.money_ledger_event_id,'receipt',new.provider_event_id,
   'provenance',private.native_production_liability_provenance(new));end if;
  affected:=exists(select 1 from jsonb_array_elements(jsonb_build_array(before_row,after_row)) facts
   where facts is not null and facts->>'source'<>'payout' and (facts->>'net')::numeric>0
    and facts->>'provenance' is distinct from 'sandbox');
 elsif tg_table_name='money_access_ledger_events' then
  if tg_op<>'INSERT' then before_row:=jsonb_build_array(old.id,old.environment,old.creator_id,old.currency,old.source_type,old.source_id,old.amount_minor,old.provider_event_id,old.user_id,old.product_id,old.event_type,
   old.metadata ? 'native_snapshot_id',old.metadata->'native_snapshot_id',old.metadata ? 'native_correction_report_id',old.metadata->'native_correction_report_id',
   old.metadata ? 'native_opening_report_id',old.metadata->'native_opening_report_id');end if;
  if tg_op<>'DELETE' then after_row:=jsonb_build_array(new.id,new.environment,new.creator_id,new.currency,new.source_type,new.source_id,new.amount_minor,new.provider_event_id,new.user_id,new.product_id,new.event_type,
   new.metadata ? 'native_snapshot_id',new.metadata->'native_snapshot_id',new.metadata ? 'native_correction_report_id',new.metadata->'native_correction_report_id',
   new.metadata ? 'native_opening_report_id',new.metadata->'native_opening_report_id');end if;
  affected:=exists(select 1 from public.creator_earnings_ledger e where e.money_ledger_event_id in ((before_row->>0)::uuid,(after_row->>0)::uuid)
   and e.source_type<>'payout' and e.net_creator_amount_cents>0 and (tg_op<>'INSERT' or private.native_production_liability_provenance(e) is distinct from 'sandbox'));
 elsif tg_table_name='provider_events' then
  if tg_op<>'INSERT' then before_row:=jsonb_build_array(old.id,old.environment,old.provider,old.status,old.user_id,old.provider_event_id,old.raw_payload_hash,old.product_id,old.product_key,old.app_user_id,old.event_type,old.idempotency_key,
   old.metadata->'provider_product_id',old.metadata->'original_transaction_id',old.metadata->'native_correction_report_id',old.metadata->'native_original_receipt_id');end if;
  if tg_op<>'DELETE' then after_row:=jsonb_build_array(new.id,new.environment,new.provider,new.status,new.user_id,new.provider_event_id,new.raw_payload_hash,new.product_id,new.product_key,new.app_user_id,new.event_type,new.idempotency_key,
   new.metadata->'provider_product_id',new.metadata->'original_transaction_id',new.metadata->'native_correction_report_id',new.metadata->'native_original_receipt_id');end if;
  affected:=exists(select 1 from public.creator_earnings_ledger e where e.provider_event_id in ((before_row->>0)::uuid,(after_row->>0)::uuid)
   and e.source_type<>'payout' and e.net_creator_amount_cents>0 and (tg_op<>'INSERT' or private.native_production_liability_provenance(e) is distinct from 'sandbox'));
 else
  if tg_op<>'INSERT' then before_row:=jsonb_build_object('id',old.id,'earning',old.earnings_ledger_id,'adjustment',old.adjustment_id,'amount',old.amount_minor);end if;
  if tg_op<>'DELETE' then after_row:=jsonb_build_object('id',new.id,'earning',new.earnings_ledger_id,'adjustment',new.adjustment_id,'amount',new.amount_minor);end if;
  affected:=exists(select 1 from public.creator_earnings_ledger e
   where e.id in ((before_row->>'earning')::uuid,(after_row->>'earning')::uuid) and private.native_production_liability_provenance(e) is distinct from 'sandbox');
 end if;
 if affected and before_row is distinct from after_row then
  perform private.advance_native_production_liability_generation(tg_table_name,before_row,after_row);end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger native_production_earning_generation after insert or update or delete on public.creator_earnings_ledger
 for each row execute function private.capture_native_production_pool_change();
create trigger native_production_provenance_generation after insert or update or delete on public.money_access_ledger_events
 for each row execute function private.capture_native_production_pool_change();
create trigger native_production_receipt_generation after insert or update or delete on public.provider_events
 for each row execute function private.capture_native_production_pool_change();
create trigger native_production_offset_generation after insert or update or delete on private.commerce_creator_fee_offsets
 for each row execute function private.capture_native_production_pool_change();

-- OFF has no new bookkeeping writes or global writer serialization. Every
-- transition advances the monotonic generation, so mutations while OFF can
-- never revive an old cached snapshot/proof after a later explicit activation.
create function private.capture_native_production_generation_control() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.account_corrections is distinct from new.account_corrections then
  perform private.advance_native_production_liability_generation('correction_accounting_control',to_jsonb(old.account_corrections),to_jsonb(new.account_corrections));end if;
 return new;
end $$;
create trigger native_production_generation_control after update of account_corrections on private.native_production_earning_controls
 for each row execute function private.capture_native_production_generation_control();

-- Append payment/return history for every creator liability competing with the
-- single platform USD funding pool. Mere reserved/processing movements do not
-- change the generation. A paid->returned->paid sequence never restores an old
-- proof, even if its current sum happens to equal a prior sum.
create function private.capture_native_production_liability_history() returns trigger
language plpgsql security definer set search_path='' as $$
declare before_row jsonb; after_row jsonb;
begin
 if not exists(select 1 from private.native_production_earning_controls where singleton and account_corrections) then
  if tg_op='DELETE' then return old;end if;return new;end if;
 if tg_op<>'INSERT' then before_row:=jsonb_build_object('id',old.id,'earning',old.earnings_ledger_id,'request',old.payout_request_id,'amount',old.amount_cents,'state',old.state); end if;
 if tg_op<>'DELETE' then after_row:=jsonb_build_object('id',new.id,'earning',new.earnings_ledger_id,'request',new.payout_request_id,'amount',new.amount_cents,'state',new.state); end if;
 if (before_row->>'state'='paid' or after_row->>'state'='paid') and before_row is distinct from after_row
  and exists(select 1 from public.creator_earnings_ledger e
   where e.id in ((before_row->>'earning')::uuid,(after_row->>'earning')::uuid) and private.native_production_liability_provenance(e) is distinct from 'sandbox') then
  lock table private.native_production_liability_history in row exclusive mode nowait;
  insert into private.native_production_liability_history(allocation_id,earnings_ledger_id,before_facts,after_facts)
   values(coalesce((after_row->>'id')::uuid,(before_row->>'id')::uuid),coalesce((after_row->>'earning')::uuid,(before_row->>'earning')::uuid),before_row,after_row);
  perform private.advance_native_production_liability_generation('paid_allocation',before_row,after_row);
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger native_production_liability_history after insert or update or delete on public.creator_payout_allocations
 for each row execute function private.capture_native_production_liability_history();

-- This is intentionally conservative ONE-account coverage, not pooled balances.
-- A proof's independently verified account must itself hold enough available USD
-- for every outstanding creator liability. Unmapped/other-account liabilities
-- increase required coverage; their bank/provider balances never enter this sum.
-- Multi-account/currency partitioning is unqualified, rather than inferred.
create function private.native_production_global_usd_liability() returns jsonb
language sql volatile set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('amountMinor',s.amount_minor::text,'changedAt',s.captured_at,'generation',g.generation::text,
  'sha256',s.liability_sha256) from private.native_production_liability_generation g
  join private.native_production_liability_snapshots s on s.generation=g.generation and s.generation_sha256=g.chain_sha256 where g.singleton
   and exists(select 1 from private.native_production_earning_controls where singleton and account_corrections);
$$;

-- Resource bounds are construction limits, not a count of payable customers.
-- Stream 256-key batches and compact typed financial rows instead of a global
-- JSON document. Paid history and trusted sandbox rows consume no ACTIVE row
-- capacity; examined history is still bounded. Limits may only be narrowed by
-- the private implementation entry point (including deterministic cap tests).
-- Five seconds / 250000 examined rows / 4096 children per earning are an
-- UNQUALIFIED local resource envelope until measured on realistic retained data.
-- A named diagnostic and NULL replace any partial snapshot on exhaustion.
create function private.capture_native_production_global_liability_bounded(p_creator uuid,p_max_examined integer,p_max_milliseconds integer) returns jsonb
language plpgsql set search_path='' set timezone='UTC' as $$
declare v_generation private.native_production_liability_generation; started timestamptz:=clock_timestamp(); elapsed integer;
 earning public.creator_earnings_ledger; last_id uuid; batch_count integer; examined integer:=0; active integer:=0;
 amount numeric:=0; paid numeric; offsets numeric; residual numeric; child_count integer; provenance text;
 digest text; failure text;
begin
 if p_max_examined is null or p_max_examined not between 1 and 250000 or p_max_milliseconds is null or p_max_milliseconds not between 1 and 5000
 then raise exception 'native_liability_capture_budget_invalid';end if;
 if not exists(select 1 from private.native_production_earning_controls where singleton and account_corrections) then return null;end if;
 perform private.lock_native_production_accounting_facts(p_creator);
 select * into strict v_generation from private.native_production_liability_generation where singleton;
 if exists(select 1 from private.native_production_liability_snapshots s where s.generation=v_generation.generation and s.generation_sha256=v_generation.chain_sha256)
  then return private.native_production_global_usd_liability();end if;
 digest:=encode(extensions.digest(convert_to(jsonb_build_array('ordered_current_liabilities_v2',v_generation.generation,v_generation.chain_sha256,
  'single_platform_available_usd_covering_all_creator_liabilities_v1')::text,'UTF8'),'sha256'),'hex');
 <<scan>> loop
  batch_count:=0;
  for earning in select e.* from public.creator_earnings_ledger e where e.source_type<>'payout' and e.net_creator_amount_cents>0
   and (last_id is null or e.id>last_id) order by e.id limit 256 loop
   last_id:=earning.id;batch_count:=batch_count+1;examined:=examined+1;
   if examined>p_max_examined then failure:='examined_budget_exceeded';exit scan;end if;
   if clock_timestamp()-started>make_interval(secs=>p_max_milliseconds::double precision/1000) then failure:='duration_budget_exceeded';exit scan;end if;
   provenance:=private.native_production_liability_provenance(earning);
   if provenance='sandbox' then continue;end if;
   select count(*),coalesce(sum(amount_cents),0) into child_count,paid from
    (select a.amount_cents from public.creator_payout_allocations a where a.earnings_ledger_id=earning.id and a.state='paid' order by a.id limit 4097) bounded;
   if child_count>4096 then failure:='allocation_budget_exceeded';exit scan;end if;
   select count(*),coalesce(sum(amount_minor),0) into child_count,offsets from
    (select o.amount_minor from private.commerce_creator_fee_offsets o where o.earnings_ledger_id=earning.id order by o.id limit 4097) bounded;
   if child_count>4096 then failure:='offset_budget_exceeded';exit scan;end if;
   residual:=earning.net_creator_amount_cents-paid-offsets;
   if residual<0 then failure:='negative_residual';exit scan;end if;
   -- Zero current residual does not require historical source to be promoted or
   -- requalified. A later return/offset mutation invalidates this generation.
   if residual=0 then continue;end if;
   if provenance is distinct from 'production' then failure:='unknown_provenance';exit scan;end if;
   if earning.currency<>'usd' then failure:='unsupported_currency';exit scan;end if;
   amount:=amount+residual;active:=active+1;
   if amount>9223372036854775807 then failure:='amount_overflow';exit scan;end if;
   digest:=encode(extensions.digest(convert_to(jsonb_build_array(digest,earning.id,earning.creator_id,earning.source_type,earning.source_id,
    earning.money_ledger_event_id,earning.provider_event_id,earning.currency,earning.net_creator_amount_cents,paid,offsets,residual)::text,'UTF8'),'sha256'),'hex');
  end loop;
  exit when batch_count<256;
 end loop scan;
 elapsed:=greatest(0,ceil(extract(epoch from clock_timestamp()-started)*1000)::integer);
 if elapsed>p_max_milliseconds and failure is null then failure:='duration_budget_exceeded';end if;
 if failure is not null then
  insert into private.native_production_liability_capture_failures(generation,reason,examined_count,active_count,construction_ms)
   values(v_generation.generation,failure,examined,active,elapsed) on conflict(generation,reason) do nothing;
  return null;
 end if;
 digest:=encode(extensions.digest(convert_to(jsonb_build_array(digest,amount,active,examined)::text,'UTF8'),'sha256'),'hex');
 insert into private.native_production_liability_snapshots(generation,generation_sha256,amount_minor,liability_sha256,earning_count,examined_count,construction_ms,digest_version)
  values(v_generation.generation,v_generation.chain_sha256,amount::bigint,digest,active,examined,elapsed,'ordered_current_liabilities_v2');
 return private.native_production_global_usd_liability();
end $$;
create function private.capture_native_production_global_liability(p_creator uuid) returns jsonb
language sql volatile set search_path='' as $$select private.capture_native_production_global_liability_bounded(p_creator,250000,5000)$$;
create index native_production_positive_earning_bound on public.creator_earnings_ledger(id) where source_type<>'payout' and net_creator_amount_cents>0;
create index native_production_paid_allocation_bound on public.creator_payout_allocations(earnings_ledger_id,id) include(amount_cents) where state='paid';
create index native_production_offset_bound on private.commerce_creator_fee_offsets(earnings_ledger_id,id) include(amount_minor);
-- Existing unique earning money/provider indexes serve provenance triggers;
-- do not duplicate the established cashout identity indexes.

-- No call to withdrawable/current-domain here: funding arithmetic must not
-- recurse through itself. Reserved/processing allocations remain liabilities.
-- Outstanding recovery is NOT a deduction from an older recorded earning.
create function private.native_production_unpaid_liability(p_receipt uuid) returns jsonb
language plpgsql volatile set search_path='' as $$
declare rows jsonb; amount numeric;
begin
 with source as (
  select earnings_ledger_id from private.native_production_earning_sources where canonical_receipt_id=p_receipt
  union all select credit.earnings_ledger_id from private.native_production_credit_sources credit
   join private.native_production_earning_sources original on original.earnings_ledger_id=credit.original_earnings_id
   where original.canonical_receipt_id=p_receipt
 ), amounts as (
  select e.id,e.creator_id,e.currency,e.net_creator_amount_cents,
   coalesce((select sum(a.amount_cents) from public.creator_payout_allocations a where a.earnings_ledger_id=e.id and a.state='paid'),0) paid,
   coalesce((select sum(o.amount_minor) from private.commerce_creator_fee_offsets o where o.earnings_ledger_id=e.id),0) offsets
  from source join public.creator_earnings_ledger e on e.id=source.earnings_ledger_id
 ) select jsonb_agg(to_jsonb(amounts) order by id),sum(net_creator_amount_cents-paid-offsets) into rows,amount from amounts;
 if rows is null or exists(select 1 from jsonb_array_elements(rows) r
  where (r->>'paid')::numeric+(r->>'offsets')::numeric>(r->>'net_creator_amount_cents')::numeric)
  or amount<0 or amount>9223372036854775807 then return null; end if;
 return jsonb_build_object('amountMinor',amount::bigint::text,'sha256',encode(extensions.digest(convert_to(rows::text,'UTF8'),'sha256'),'hex'));
end $$;

-- Hash exact evidence, including terminal history and the mutable unbound
-- watermark. A transaction string alone cannot claim that a refund was covered.
create function private.native_production_negative_manifest(p_receipt uuid) returns jsonb
language sql volatile set search_path='' set timezone='UTC' as $$
 with anchor as (select * from private.native_production_paid_video_observations where canonical_receipt_id=p_receipt), evidence as (
  select 'canonical:'||receipt.id::text key,receipt.event_type kind,jsonb_build_object('id',receipt.id,'providerEventId',receipt.provider_event_id,
   'hash',receipt.raw_payload_hash,'type',receipt.event_type,'provider',receipt.provider,'buyer',receipt.user_id,'appUserId',receipt.app_user_id,
   'environment',receipt.environment,'productId',receipt.product_id,'productKey',receipt.product_key,'occurredAt',receipt.occurred_at,'metadata',receipt.metadata) facts
  from public.provider_events receipt,anchor where receipt.provider=anchor.provider and receipt.user_id=anchor.buyer_id and receipt.environment='production'
   and receipt.metadata->>'original_transaction_id'=anchor.original_transaction_id
   and receipt.event_type in ('REFUND','REVOCATION','CANCELLATION','EXPIRATION','BILLING_ISSUE','SUBSCRIPTION_PAUSED','TRANSFER','UNKNOWN')
  union all
  select 'observed:'||terminal.canonical_receipt_id::text,terminal.event_type,to_jsonb(terminal) from private.native_production_paid_video_observations terminal
   join private.native_production_paid_video_ledger_holds held on held.observation_id=terminal.canonical_receipt_id,anchor
   where terminal.provider=anchor.provider and terminal.buyer_id=anchor.buyer_id and terminal.original_transaction_id=anchor.original_transaction_id and held.negative_lifecycle
  union all
  select 'report:'||report.canonical_receipt_id::text||':'||report.observation_id,upper(report.facts->>'kind'),report.facts
   from private.native_production_report_observations report join private.native_production_paid_video_observations original
    on original.canonical_receipt_id=report.canonical_receipt_id,anchor
   where original.provider=anchor.provider and original.buyer_id=anchor.buyer_id and original.original_transaction_id=anchor.original_transaction_id
    and report.facts->>'kind' in ('refund','revocation','chargeback')
  union all
  select 'watermark:'||terminal.last_provider_event_id::text,terminal.last_event_type,to_jsonb(terminal)
   from public.revenuecat_unbound_terminal_authority terminal,anchor where terminal.provider=anchor.provider
    and terminal.user_id=anchor.buyer_id and terminal.original_transaction_id=anchor.original_transaction_id and terminal.environment='production'
 ) select coalesce(jsonb_agg(jsonb_build_object('key',key,'kind',kind,'sha256',encode(extensions.digest(convert_to(facts::text,'UTF8'),'sha256'),'hex')) order by key),'[]'::jsonb) from evidence;
$$;

create function private.native_production_initial_journal_hash(p_receipt uuid) returns text
language sql volatile set search_path='' as $$
 select encode(extensions.digest(convert_to(coalesce(jsonb_agg(facts order by observation_id),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex')
 from private.native_production_report_observations where canonical_receipt_id=p_receipt;
$$;

-- Known negative financial facts are compared, not merely hashed. Unknown
-- webhook amounts are supplied by the qualified actual report; a known amount,
-- effective time or provider negative identity can never be contradicted.
create function private.native_production_negative_financial_facts(p_receipt uuid)
returns table(evidence_key text,amount_minor text,effective_at timestamptz,provider_negative_id text,known_through timestamptz)
language sql volatile set search_path='' as $$
 with anchor as(select * from private.native_production_paid_video_observations where canonical_receipt_id=p_receipt)
 select 'report:'||r.canonical_receipt_id::text||':'||r.observation_id,r.facts->>'amountMinor',
  (r.facts->>'effectiveAt')::timestamptz,r.facts->>'negativeId',(r.facts->>'effectiveAt')::timestamptz
 from private.native_production_report_observations r join private.native_production_paid_video_observations original on original.canonical_receipt_id=r.canonical_receipt_id,anchor
 where original.provider=anchor.provider and original.buyer_id=anchor.buyer_id and original.original_transaction_id=anchor.original_transaction_id
  and r.facts->>'kind' in ('refund','revocation','chargeback')
 union all select 'canonical:'||r.id::text,r.metadata->>'refund_amount_minor',null,r.metadata->>'provider_refund_id',r.occurred_at
 from public.provider_events r,anchor where r.provider=anchor.provider and r.user_id=anchor.buyer_id and r.environment='production'
  and r.metadata->>'original_transaction_id'=anchor.original_transaction_id
  and r.event_type in ('REFUND','REVOCATION','CANCELLATION','EXPIRATION','BILLING_ISSUE','SUBSCRIPTION_PAUSED','TRANSFER','UNKNOWN')
 union all select 'observed:'||r.canonical_receipt_id::text,null,null,null,r.observed_at
 from private.native_production_paid_video_observations r join private.native_production_paid_video_ledger_holds held on held.observation_id=r.canonical_receipt_id,anchor
 where r.provider=anchor.provider and r.buyer_id=anchor.buyer_id and r.original_transaction_id=anchor.original_transaction_id and held.negative_lifecycle
 union all select 'watermark:'||r.last_provider_event_id::text,null,null,null,r.last_occurred_at
 from public.revenuecat_unbound_terminal_authority r,anchor where r.provider=anchor.provider and r.user_id=anchor.buyer_id
  and r.original_transaction_id=anchor.original_transaction_id and r.environment='production';
$$;

-- Recover the immutable historical component set only if its exact existing
-- snapshot digest matches. Recorded-at is a search boundary, not authority. A
-- missing/changed/ambiguous reconstruction holds; no current-row adoption.
create function private.native_production_frozen_baseline(p_snapshot uuid) returns jsonb
language plpgsql volatile set search_path='' as $$
declare snapshot private.native_production_economic_snapshots; observations jsonb; digest text; components jsonb;
begin
 select * into snapshot from private.native_production_economic_snapshots where id=p_snapshot;
 if snapshot.id is null or snapshot.projection->'economicCoverageComplete' is distinct from 'true'::jsonb then return null; end if;
 select coalesce(jsonb_agg(facts order by observation_id),'[]'::jsonb) into observations
  from private.native_production_report_observations where canonical_receipt_id=snapshot.canonical_receipt_id and recorded_at<=snapshot.created_at;
 digest:=encode(extensions.digest(convert_to(jsonb_build_object('projection',snapshot.projection,'observations',observations)::text,'UTF8'),'sha256'),'hex');
 if digest<>snapshot.evaluation_sha256 then return null; end if;
 select jsonb_agg(jsonb_build_object('componentId','initial:'||(facts->>'componentId'),'category',facts->>'category','amountMinor',facts->>'amountMinor') order by facts->>'componentId')
  into components from (select distinct on(value->>'componentId') value facts from jsonb_array_elements(observations) value
   where value->>'kind'='component' order by value->>'componentId',value->>'observedAt',value->>'id') original;
 return jsonb_build_object('components',components,'projection',snapshot.projection,'sha256',digest);
end $$;

create function private.native_production_correction_qualification_current(p_scope uuid,p_issuer uuid,p_observed timestamptz,p_schema text) returns boolean
language plpgsql volatile set search_path='' as $$
declare original private.native_production_scope_qualifications; issuer private.native_production_correction_qualifications;
 latest private.native_production_correction_qualifications; tied integer;
begin
 select * into original from private.native_production_scope_qualifications where id=p_scope;
 select * into issuer from private.native_production_correction_qualifications where id=p_issuer;
 if original.id is null or issuer.id is null then return false; end if;
 select correction.* into latest from private.native_production_correction_qualifications correction
  join private.native_production_scope_qualifications scope on scope.id=correction.scope_id
  where scope.id in (original.id,coalesce(original.renewal_root_scope_id,original.id))
   or scope.renewal_root_scope_id=coalesce(original.renewal_root_scope_id,original.id)
  order by correction.verified_at desc,correction.id desc limit 1;
 select count(*) into tied from private.native_production_correction_qualifications correction
  join private.native_production_scope_qualifications scope on scope.id=correction.scope_id
  where correction.verified_at=latest.verified_at and (scope.id in (original.id,coalesce(original.renewal_root_scope_id,original.id))
   or scope.renewal_root_scope_id=coalesce(original.renewal_root_scope_id,original.id));
 return tied=1 and private.native_production_scope_current(original.id)
  and private.native_production_scope_equivalent(original.id,issuer.scope_id)
  and private.native_production_scope_equivalent(original.id,latest.scope_id)
  and issuer.report_schema=p_schema and latest.report_schema=p_schema and issuer.basis=latest.basis
  and issuer.verified_at<=p_observed and issuer.expires_at>p_observed
  and latest.verified_at<=clock_timestamp() and latest.expires_at>clock_timestamp()
  and not exists(select 1 from private.native_production_correction_revocations where qualification_id in (issuer.id,latest.id));
end $$;

-- Trusted authenticated report adapter only. No EXECUTE grant and no HTTP/CSV
-- importer can claim actual economics by supplying this JSON contract.
create function private.append_native_production_correction(p_receipt uuid,p_facts jsonb) returns uuid
language plpgsql set search_path='' as $$
declare a private.native_production_video_admissions; q private.native_production_scope_qualifications;
 c private.native_production_purchase_correlations; issuer private.native_production_correction_qualifications;
 snapshot private.native_production_economic_snapshots; existing private.native_production_correction_reports;
 k text; component jsonb; binding jsonb; report_id uuid; semantic jsonb; digest text; keys text[];
begin
 perform pg_advisory_xact_lock(hashtextextended('native-production-accounting',0));
 if not private.bind_native_production_sale(p_receipt) then raise exception 'native_correction_sale_unbound'; end if;
 select admission.* into strict a from private.native_production_sale_bindings sale join private.native_production_video_admissions admission
  on admission.id=sale.admission_id where sale.canonical_receipt_id=p_receipt;
 select * into strict q from private.native_production_scope_qualifications where id=a.scope_id;
 select * into strict c from private.native_production_purchase_correlations where canonical_receipt_id=p_receipt;
 keys:=array['protocol','id','revision','baselineSnapshotId','initialJournalSha256','qualificationId','reportSchema','evidenceSha256','observedAt','through',
  'provider','environment','projectId','appId','storeAccountId','productId','currency','buyerId','creatorId','admissionId','sourceVersionId','sourceProofId',
  'transactionId','originalTransactionId','reportedProceedsMinor','components','negativeBindings'];
 if jsonb_typeof(p_facts) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_facts))<>cardinality(keys)
  or exists(select 1 from jsonb_object_keys(p_facts) field where not field=any(keys)) then raise exception 'native_correction_schema_invalid'; end if;
 foreach k in array keys loop
  if k in ('revision','components','negativeBindings') then continue; end if;
  if jsonb_typeof(p_facts->k) is distinct from 'string' or length(p_facts->>k) not between 1 and 512
   or p_facts->>k<>btrim(p_facts->>k) or p_facts->>k ~ '[[:cntrl:]]' then raise exception 'native_correction_schema_invalid'; end if;
 end loop;
 if p_facts->>'protocol'<>'native-production-signed-correction-v1'
  or row(p_facts->>'provider',p_facts->>'environment',p_facts->>'projectId',p_facts->>'appId',p_facts->>'storeAccountId',p_facts->>'productId',p_facts->>'currency',
   p_facts->>'buyerId',p_facts->>'creatorId',p_facts->>'admissionId',p_facts->>'sourceVersionId',p_facts->>'sourceProofId',p_facts->>'transactionId',p_facts->>'originalTransactionId')
  is distinct from row(q.provider,'production',q.project_id,q.app_id,q.store_account_id,q.provider_product_id,a.currency,
   a.buyer_id::text,a.creator_id::text,a.id::text,a.source_version_id::text,a.source_proof_id::text,c.transaction_id,c.original_transaction_id)
 then raise exception 'native_correction_identity_mismatch'; end if;
 if jsonb_typeof(p_facts->'revision')<>'number' or p_facts->>'revision' !~ '^[1-9][0-9]{0,9}$' or (p_facts->>'revision')::numeric>2147483647
  or p_facts->>'reportedProceedsMinor' !~ '^(0|-?[1-9][0-9]{0,18})$' or abs((p_facts->>'reportedProceedsMinor')::numeric)>9223372036854775807
  or p_facts->>'evidenceSha256' !~ '^[0-9a-f]{64}$' or p_facts->>'initialJournalSha256' !~ '^[0-9a-f]{64}$'
  or p_facts->>'observedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$' or p_facts->>'through' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$'
  or not isfinite((p_facts->>'observedAt')::timestamptz) or not isfinite((p_facts->>'through')::timestamptz)
  or (p_facts->>'observedAt')::timestamptz>clock_timestamp() or (p_facts->>'through')::timestamptz>(p_facts->>'observedAt')::timestamptz
  or (p_facts->>'through')::timestamptz<c.purchased_at then raise exception 'native_correction_values_invalid'; end if;
 select * into snapshot from private.native_production_economic_snapshots where id::text=p_facts->>'baselineSnapshotId' and canonical_receipt_id=p_receipt;
 select * into issuer from private.native_production_correction_qualifications where id::text=p_facts->>'qualificationId';
 if snapshot.id is null or issuer.id is null or issuer.report_schema<>p_facts->>'reportSchema'
  or private.native_production_scope_equivalent(q.id,issuer.scope_id) is distinct from true then raise exception 'native_correction_proof_unbound'; end if;
 if jsonb_typeof(p_facts->'components')<>'array' or jsonb_array_length(p_facts->'components')>2048
  or jsonb_typeof(p_facts->'negativeBindings')<>'array' or jsonb_array_length(p_facts->'negativeBindings')>2048
  then raise exception 'native_correction_manifest_invalid'; end if;
 for component in select value from jsonb_array_elements(p_facts->'components') loop
  if jsonb_typeof(component)<>'object' or (select count(*) from jsonb_object_keys(component))<>6
   or not component ?& array['componentId','economicEventId','category','amountMinor','occurredAt','reversesComponentId']
   then raise exception 'native_correction_component_invalid'; end if;
  foreach k in array array['componentId','economicEventId','category','amountMinor','occurredAt'] loop
   if jsonb_typeof(component->k) is distinct from 'string' or length(component->>k) not between 1 and 512
    or component->>k<>btrim(component->>k) or component->>k ~ '[[:cntrl:]]' then raise exception 'native_correction_component_invalid'; end if;
  end loop;
  if component->>'componentId' like 'initial:%' or component->>'category' not in ('store_fee','fee_tax','sales_tax','refund_gross')
   or component->>'amountMinor' !~ '^(0|-?[1-9][0-9]{0,18})$' or abs((component->>'amountMinor')::numeric)>9223372036854775807
   or jsonb_typeof(component->'reversesComponentId') not in ('null','string')
   or (jsonb_typeof(component->'reversesComponentId')='string' and (length(component->>'reversesComponentId') not between 1 and 512 or component->>'reversesComponentId' ~ '[[:cntrl:]]'))
   or component->>'occurredAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$' or not isfinite((component->>'occurredAt')::timestamptz)
   or (component->>'occurredAt')::timestamptz<c.purchased_at or (component->>'occurredAt')::timestamptz>(p_facts->>'through')::timestamptz
   then raise exception 'native_correction_component_invalid'; end if;
 end loop;
 if (select count(*) from jsonb_array_elements(p_facts->'components'))<>(select count(distinct value->>'componentId') from jsonb_array_elements(p_facts->'components'))
  then raise exception 'native_correction_component_duplicate'; end if;
 for binding in select value from jsonb_array_elements(p_facts->'negativeBindings') loop
  if jsonb_typeof(binding)<>'object' or (select count(*) from jsonb_object_keys(binding))<>6
   or not binding ?& array['key','kind','sha256','economicEventId','amountMinor','effectiveAt'] then raise exception 'native_correction_negative_binding_invalid'; end if;
  foreach k in array array['key','kind','sha256','economicEventId','amountMinor','effectiveAt'] loop
   if jsonb_typeof(binding->k) is distinct from 'string' or length(binding->>k) not between 1 and 1024
    or binding->>k<>btrim(binding->>k) or binding->>k ~ '[[:cntrl:]]' then raise exception 'native_correction_negative_binding_invalid'; end if;
  end loop;
  if binding->>'sha256' !~ '^[0-9a-f]{64}$' or binding->>'amountMinor' !~ '^[1-9][0-9]{0,18}$'
   or (binding->>'amountMinor')::numeric>9223372036854775807
   or binding->>'effectiveAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$' or not isfinite((binding->>'effectiveAt')::timestamptz)
   or (binding->>'effectiveAt')::timestamptz<c.purchased_at or (binding->>'effectiveAt')::timestamptz>(p_facts->>'through')::timestamptz
   then raise exception 'native_correction_negative_binding_invalid'; end if;
 end loop;
 if (select count(*) from jsonb_array_elements(p_facts->'negativeBindings'))<>(select count(distinct value->>'key') from jsonb_array_elements(p_facts->'negativeBindings'))
  then raise exception 'native_correction_negative_duplicate'; end if;
 select * into existing from private.native_production_correction_reports where canonical_receipt_id=p_receipt and observation_id=p_facts->>'id';
 if existing.id is not null then
  if existing.facts<>p_facts then raise exception 'native_correction_observation_conflict'; end if;return existing.id;
 end if;
 if (select count(*) from private.native_production_correction_reports where canonical_receipt_id=p_receipt)>=128 then raise exception 'native_correction_history_bound'; end if;
 semantic:=(p_facts-array['id','evidenceSha256','observedAt','qualificationId'])||jsonb_build_object(
  'components',(select coalesce(jsonb_agg(value order by value->>'componentId'),'[]'::jsonb) from jsonb_array_elements(p_facts->'components')),
  'negativeBindings',(select coalesce(jsonb_agg(value order by value->>'key'),'[]'::jsonb) from jsonb_array_elements(p_facts->'negativeBindings')));
 digest:=encode(extensions.digest(convert_to(semantic::text,'UTF8'),'sha256'),'hex');
 insert into private.native_production_correction_reports(canonical_receipt_id,baseline_snapshot_id,observation_id,revision,qualification_id,evidence_sha256,semantic_sha256,facts,observed_at)
 values(p_receipt,snapshot.id,p_facts->>'id',(p_facts->>'revision')::bigint,issuer.id,p_facts->>'evidenceSha256',digest,p_facts,(p_facts->>'observedAt')::timestamptz) returning id into report_id;
 for component in select value from jsonb_array_elements(p_facts->'components') loop
  insert into private.native_production_correction_components(canonical_receipt_id,component_id,facts_sha256,facts,first_report_id)
  values(p_receipt,component->>'componentId',encode(extensions.digest(convert_to(component::text,'UTF8'),'sha256'),'hex'),component,report_id) on conflict do nothing;
 end loop;
 insert into private.native_production_accounting_jobs(snapshot_id,canonical_receipt_id)
  values(snapshot.id,p_receipt) on conflict do nothing;
 return report_id;
end $$;

create function private.evaluate_native_production_correction(p_receipt uuid) returns jsonb
language plpgsql volatile set search_path='' as $$
declare report private.native_production_correction_reports; link private.native_production_earning_sources;
 opening private.native_production_corrected_openings;
 a private.native_production_video_admissions; q private.native_production_scope_qualifications; c private.native_production_purchase_correlations;
 earning public.creator_earnings_ledger; baseline jsonb; initial jsonb; expected jsonb; supplied jsonb; components jsonb;
 v_component jsonb; parent jsonb; issuer_report record; reasons text[]:=array[]::text[]; fee numeric:=0; fee_tax numeric:=0; tax numeric:=0;
 refunded numeric:=0; proceeds numeric; platform numeric; target numeric; delta numeric; ids jsonb;
begin
 select * into report from private.native_production_correction_reports where canonical_receipt_id=p_receipt order by revision desc,observed_at desc,id desc limit 1;
 if report.id is null then return jsonb_build_object('status','HELD','complete',false,'reasons',jsonb_build_array('correction_missing')); end if;
 select * into link from private.native_production_earning_sources where canonical_receipt_id=p_receipt;
 select * into earning from public.creator_earnings_ledger where id=link.earnings_ledger_id;
 select * into opening from private.native_production_corrected_openings where earnings_ledger_id=link.earnings_ledger_id;
 select admission.* into strict a from private.native_production_sale_bindings sale join private.native_production_video_admissions admission on admission.id=sale.admission_id where sale.canonical_receipt_id=p_receipt;
 select * into strict q from private.native_production_scope_qualifications where id=a.scope_id;
 select * into strict c from private.native_production_purchase_correlations where canonical_receipt_id=p_receipt;
 if link.earnings_ledger_id is not null and report.baseline_snapshot_id<>link.snapshot_id then reasons:=array_append(reasons,'correction_baseline_mismatch'); end if;
 baseline:=private.native_production_frozen_baseline(report.baseline_snapshot_id);
 if baseline is null then reasons:=array_append(reasons,'historical_components_unavailable'); end if;
 if link.earnings_ledger_id is not null and (
  coalesce(opening.creator_minor,(baseline#>>'{projection,creatorCandidateMinor}')::bigint) is distinct from earning.net_creator_amount_cents::bigint
  or coalesce(opening.platform_minor,(baseline#>>'{projection,platformCandidateMinor}')::bigint) is distinct from earning.platform_fee_cents::bigint
  or earning.creator_id<>a.creator_id or earning.currency<>a.currency or earning.source_type<>'paid_content'
  or earning.provider_event_id<>p_receipt or earning.gross_amount_cents<>coalesce(opening.retained_gross_minor,c.actual_gross_minor)
  or earning.gross_amount_cents::bigint<>earning.net_creator_amount_cents::bigint+earning.platform_fee_cents+earning.provider_fee_cents+earning.tax_cents
  ) then reasons:=array_append(reasons,'issued_baseline_invalid'); end if;
 if public.creator_earnings_current_state_internal(earning.id)='reversed'
  or exists(select 1 from public.creator_money_recovery_obligations where earnings_ledger_id=earning.id)
  or exists(select 1 from public.creator_money_reversal_links where original_money_ledger_event_id=earning.money_ledger_event_id)
  then reasons:=array_append(reasons,'legacy_reversal_or_recovery_overlap'); end if;
 if private.native_production_canonical_receipt_current(p_receipt) is distinct from true then reasons:=array_append(reasons,'canonical_receipt_changed'); end if;
 initial:=private.evaluate_native_production_economics(p_receipt);
 -- Dedicated corrections may settle exact negative financial evidence. They
 -- never reinterpret an invalid initial report or waive source/catalog/legal
 -- authority. New economic errors outside this explicit set remain held.
 if exists(select 1 from jsonb_array_elements_text(initial->'reasons') reason
  where reason not in ('negative_lifecycle_hold','production_ledger_adapter_unqualified')) then reasons:=array_append(reasons,'current_original_contract_unqualified'); end if;
 if (select count(distinct semantic_sha256) from private.native_production_correction_reports where canonical_receipt_id=p_receipt and revision=report.revision)>1
  then reasons:=array_append(reasons,'correction_revision_conflict'); end if;
 if (select count(*) from private.native_production_correction_reports where canonical_receipt_id=p_receipt and revision=report.revision and observed_at=report.observed_at)>1
  then reasons:=array_append(reasons,'correction_current_tie'); end if;
 if report.facts->>'initialJournalSha256'<>private.native_production_initial_journal_hash(p_receipt) then reasons:=array_append(reasons,'initial_journal_coverage_stale'); end if;
 if private.native_production_correction_qualification_current(a.scope_id,report.qualification_id,report.observed_at,report.facts->>'reportSchema') is distinct from true
  then reasons:=array_append(reasons,'correction_qualification_unavailable'); end if;
 if exists(select 1 from private.native_production_correction_components where canonical_receipt_id=p_receipt group by component_id having count(*)>1)
  then reasons:=array_append(reasons,'signed_component_conflict'); end if;
 select coalesce(jsonb_agg(component_id order by component_id),'[]'::jsonb) into ids from (select distinct component_id from private.native_production_correction_components where canonical_receipt_id=p_receipt) all_components;
 if ids is distinct from (select coalesce(jsonb_agg(value->>'componentId' order by value->>'componentId'),'[]'::jsonb) from jsonb_array_elements(report.facts->'components'))
  then reasons:=array_append(reasons,'signed_component_coverage_incomplete'); end if;
 for issuer_report in select distinct first_report.* from private.native_production_correction_components component
  join private.native_production_correction_reports first_report on first_report.id=component.first_report_id where component.canonical_receipt_id=p_receipt loop
  if private.native_production_correction_qualification_current(a.scope_id,issuer_report.qualification_id,issuer_report.observed_at,issuer_report.facts->>'reportSchema') is distinct from true
   then reasons:=array_append(reasons,'signed_component_unqualified_when_observed'); end if;
 end loop;
 expected:=private.native_production_negative_manifest(p_receipt);
 select coalesce(jsonb_agg(value-array['economicEventId','amountMinor','effectiveAt'] order by value->>'key'),'[]'::jsonb) into supplied from jsonb_array_elements(report.facts->'negativeBindings');
 if expected<>supplied then reasons:=array_append(reasons,'negative_identity_coverage_incomplete'); end if;
 if exists(select 1 from jsonb_array_elements(expected) negative where negative->>'kind' not in ('REFUND','REVOCATION','CANCELLATION','CHARGEBACK'))
  then reasons:=array_append(reasons,'negative_semantics_unsupported'); end if;
 -- Multiple receipt/report aliases may name one economic refund. Amounts are
 -- summed only from unique components, never from the list of negative aliases.
 if exists(select 1 from jsonb_array_elements(report.facts->'negativeBindings') negative where not exists(
  select 1 from jsonb_array_elements(report.facts->'components') component where component->>'economicEventId'=negative->>'economicEventId'
   and component->>'category'='refund_gross' and (component->>'amountMinor')::numeric=(negative->>'amountMinor')::numeric
   and (component->>'occurredAt')::timestamptz=(negative->>'effectiveAt')::timestamptz))
  then reasons:=array_append(reasons,'refund_attribution_missing'); end if;
 if exists(select 1 from private.native_production_negative_financial_facts(p_receipt) known
  join jsonb_array_elements(report.facts->'negativeBindings') binding on binding->>'key'=known.evidence_key
  where (known.amount_minor is not null and known.amount_minor<>binding->>'amountMinor')
   or (known.effective_at is not null and known.effective_at<>(binding->>'effectiveAt')::timestamptz)
   or (known.provider_negative_id is not null and known.provider_negative_id<>binding->>'economicEventId')
   or known.known_through>(report.facts->>'through')::timestamptz)
  then reasons:=array_append(reasons,'negative_financial_facts_mismatch'); end if;
 if exists(select 1 from jsonb_array_elements(report.facts->'components') component
  where component->>'category'='refund_gross' and (component->>'amountMinor')::numeric>0
  group by component->>'economicEventId' having count(*)>1)
  then reasons:=array_append(reasons,'refund_economic_identity_duplicate'); end if;
 -- Parenthesize JSON extraction: PostgreSQL's generic operator precedence
 -- otherwise applies -> to the concatenated array and silently returns NULL.
 components:=coalesce(baseline->'components','[]'::jsonb)||(report.facts->'components');
 for v_component in select value from jsonb_array_elements(report.facts->'components') loop
  delta:=(v_component->>'amountMinor')::numeric;
  if delta<0 then
   select value into parent from jsonb_array_elements(components) where value->>'componentId'=v_component->>'reversesComponentId';
   if parent is null or parent->>'category'<>v_component->>'category' or (parent->>'amountMinor')::numeric<=0
    or (parent->>'occurredAt' is not null and (parent->>'occurredAt')::timestamptz>(v_component->>'occurredAt')::timestamptz)
    or abs((select sum((value->>'amountMinor')::numeric) from jsonb_array_elements(report.facts->'components') value
      where value->>'reversesComponentId'=parent->>'componentId'))>(parent->>'amountMinor')::numeric
    then reasons:=array_append(reasons,'signed_reversal_unbound_or_excess'); end if;
  elsif v_component->>'reversesComponentId' is not null then reasons:=array_append(reasons,'positive_component_claims_reversal'); end if;
 end loop;
 for v_component in select value from jsonb_array_elements(components) loop
  delta:=(v_component->>'amountMinor')::numeric;
  case v_component->>'category' when 'store_fee' then fee:=fee+delta; when 'fee_tax' then fee_tax:=fee_tax+delta;
   when 'sales_tax' then tax:=tax+delta; when 'refund_gross' then refunded:=refunded+delta; else null; end case;
 end loop;
 if least(fee,fee_tax,tax,refunded)<0 or refunded>c.actual_gross_minor or tax>c.actual_gross_minor-refunded
  or greatest(fee,fee_tax,tax,refunded)>9223372036854775807 then reasons:=array_append(reasons,'signed_totals_invalid'); end if;
 proceeds:=c.actual_gross_minor-refunded-tax-fee-fee_tax;
 if proceeds is distinct from (report.facts->>'reportedProceedsMinor')::numeric then reasons:=array_append(reasons,'actual_proceeds_mismatch'); end if;
 platform:=floor(greatest(proceeds,0)*q.platform_share_bps/10000);
 target:=greatest(proceeds-platform,0)-greatest(-proceeds,0);
 if abs(target)>9223372036854775807 then reasons:=array_append(reasons,'signed_target_overflow'); end if;
 return jsonb_build_object('status','HELD','complete',cardinality(reasons)=0,'reportId',report.id,'baselineEarningId',earning.id,
  'targetMinor',case when cardinality(reasons)=0 then target::bigint::text end,
  'retainedGrossMinor',(c.actual_gross_minor-refunded)::text,'refundedMinor',refunded::text,
  'providerFeeMinor',(fee+fee_tax)::text,'taxMinor',tax::text,'platformMinor',platform::text,
  'reasons',to_jsonb(reasons),'providerWrite',false);
end $$;

-- Immutable original provenance remains mandatory after a correction. Only the
-- signed financial target changes; source, settlement and recipient never do.
-- Restrict UTC to native policy arithmetic. Do not change the caller's timezone
-- across the public reconciler or its mixed-domain recovery/current checks.
create function private.native_production_policy_deadline(p_origin timestamptz,p_duration interval) returns timestamptz
language sql immutable strict set search_path='' set timezone='UTC' as $$ select p_origin+p_duration $$;
create function private.native_production_original_integrity(p_receipt uuid) returns boolean
language sql volatile set search_path='' as $$
 select exists(select 1 from private.native_production_earning_sources link
  join public.creator_earnings_ledger e on e.id=link.earnings_ledger_id
  join public.money_access_ledger_events m on m.id=e.money_ledger_event_id
  join private.native_production_economic_snapshots snapshot on snapshot.id=link.snapshot_id
  join private.native_production_sale_bindings binding on binding.canonical_receipt_id=link.canonical_receipt_id
  join private.native_production_video_admissions a on a.id=binding.admission_id
  join private.native_production_video_versions source on source.id=a.source_version_id
  join private.native_production_purchase_correlations c on c.canonical_receipt_id=link.canonical_receipt_id
  left join private.native_production_corrected_openings opening on opening.earnings_ledger_id=e.id
  join public.creator_money_settlement_policies policy on policy.source_type='paid_content'
  where link.canonical_receipt_id=p_receipt and not policy.requires_obligation_completion
   and row(e.creator_id,e.source_type,e.source_id,e.provider_event_id,e.currency,e.gross_amount_cents,
    e.settlement_started_at,e.normal_eligible_at,e.reserve_release_at,e.settlement_policy_version,e.settlement_reference_hash,e.reserve_amount_cents)
    is not distinct from row(a.creator_id,'paid_content',source.source_id,p_receipt,a.currency,coalesce(opening.retained_gross_minor,c.actual_gross_minor),
     c.purchased_at,private.native_production_policy_deadline(c.purchased_at,policy.normal_hold),private.native_production_policy_deadline(c.purchased_at,policy.normal_hold+policy.reserve_duration),policy.policy_version,
     snapshot.evaluation_sha256,ceil(e.net_creator_amount_cents::numeric*policy.reserve_basis_points/10000))
   and row(m.user_id,m.creator_id,m.product_id,m.provider_event_id,m.environment,m.source_type,m.source_id,m.currency,m.amount_minor)
    is not distinct from row(a.buyer_id,a.creator_id,a.catalog_product_id,p_receipt,'production','paid_content',source.source_id,a.currency,coalesce(opening.retained_gross_minor,c.actual_gross_minor))
   and (opening.earnings_ledger_id is null or (opening.original_gross_minor=c.actual_gross_minor
    and row(e.provider_fee_cents,e.tax_cents,e.platform_fee_cents,e.net_creator_amount_cents)
     is not distinct from row(opening.provider_fee_minor,opening.tax_minor,opening.platform_minor,opening.creator_minor)))
   and ((m.status='pending' and m.payable_state='pending_verification') or (m.status='verified' and m.payable_state in ('payable','paid')))
   and public.creator_earnings_current_state_internal(e.id) in ('held','available','paid'));
$$;

create function private.native_production_corrected_funding_current(p_receipt uuid,p_checkpoint bigint) returns uuid
language plpgsql volatile set search_path='' as $$
declare proof private.native_production_corrected_funding_proofs; checkpoint private.native_production_correction_checkpoints;
 liability jsonb; creator uuid; platform text; recipient text; tied integer;
begin
 select * into checkpoint from private.native_production_correction_checkpoints where id=p_checkpoint and canonical_receipt_id=p_receipt;
 select funding.* into proof from private.native_production_corrected_funding_proofs funding
  join private.native_production_correction_checkpoints point on point.id=funding.checkpoint_id
  where point.canonical_receipt_id=p_receipt order by funding.verified_at desc,funding.id desc limit 1;
 select count(*) into tied from private.native_production_corrected_funding_proofs funding
  join private.native_production_correction_checkpoints point on point.id=funding.checkpoint_id
  where point.canonical_receipt_id=p_receipt and funding.verified_at=proof.verified_at;
 select e.creator_id into creator from public.creator_earnings_ledger e where e.id=checkpoint.original_earnings_id;
 liability:=private.native_production_global_usd_liability();
 if checkpoint.id is null or proof.id is null or tied<>1 or proof.checkpoint_id<>checkpoint.id or liability is null
  or proof.liability_generation<>(liability->>'generation')::bigint
  or proof.liability_sha256<>liability->>'sha256' or proof.actual_available_minor<(liability->>'amountMinor')::bigint
  or proof.verified_at<checkpoint.created_at or proof.verified_at<(liability->>'changedAt')::timestamptz
  or proof.verified_at>clock_timestamp() or proof.expires_at<=clock_timestamp()
  or exists(select 1 from private.native_production_corrected_funding_revocations where proof_id=proof.id)
  or not exists(select 1 from public.creator_payout_accounts account where account.creator_user_id=creator::text
   and account.provider='stripe_connect' and account.provider_environment='live' and account.provider_account_id=proof.recipient_account_id
   and account.status='eligible' and account.kyc_status='verified' and account.tax_status='verified'
   and account.provider_configuration_status='match'
   and account.provider_live_observation->>'platformAccountId'=proof.platform_account_id
   and account.provider_live_observation->>'source'='authenticated_stripe_get_v1_v2') then return null; end if;
 -- An original release, if present, binds the recipient forever. Otherwise the
 -- first corrected release binds it. A fresh proof cannot reroute later credit.
 select funding.platform_account_id,funding.recipient_account_id into platform,recipient
  from private.native_production_earning_releases release join private.native_production_funding_proofs funding on funding.id=release.funding_proof_id
  where release.earnings_ledger_id=checkpoint.original_earnings_id;
 if platform is null then
  select funding.platform_account_id,funding.recipient_account_id into platform,recipient from private.native_production_corrected_releases release
   join private.native_production_corrected_funding_proofs funding on funding.id=release.proof_id
   join private.native_production_correction_checkpoints point on point.id=funding.checkpoint_id
   where point.canonical_receipt_id=p_receipt order by release.created_at,release.earnings_ledger_id limit 1;
 end if;
 if platform is not null and row(platform,recipient) is distinct from row(proof.platform_account_id,proof.recipient_account_id) then return null; end if;
 return proof.id;
end $$;

-- Canonical paid_content/provider provenance also catches missing private credit
-- links. No malformed native adjustment may reach the generic non-commerce true.
alter function private.native_production_earning_in_domain(uuid) rename to native_production_earning_before_corrections;
create function private.native_production_earning_in_domain(p_earning uuid) returns boolean
language sql stable set search_path='' as $$
 select private.native_production_earning_before_corrections(p_earning)
  or exists(select 1 from private.native_production_credit_sources where earnings_ledger_id=p_earning)
  or exists(select 1 from public.creator_earnings_ledger e left join public.money_access_ledger_events m on m.id=e.money_ledger_event_id
   left join public.provider_events receipt on receipt.id=e.provider_event_id or receipt.id=m.provider_event_id where e.id=p_earning
   and (receipt.event_type='native_verified_correction_credit' or m.event_type='native_verified_correction_credit'
    or e.metadata ? 'native_correction_report_id' or m.metadata ? 'native_correction_report_id'));
$$;

create function private.native_production_credit_integrity(p_earning uuid) returns boolean
language sql volatile set search_path='' as $$
 select exists(select 1 from private.native_production_credit_sources credit
  join public.creator_earnings_ledger e on e.id=credit.earnings_ledger_id
  join public.creator_earnings_ledger original on original.id=credit.original_earnings_id
  join private.native_production_earning_sources source on source.earnings_ledger_id=original.id
  join private.native_production_correction_reports report on report.id=credit.report_id and report.canonical_receipt_id=source.canonical_receipt_id
  join private.native_production_correction_checkpoints point on point.report_id=report.id and point.credit_earnings_id=e.id
  join private.native_production_sale_bindings binding on binding.canonical_receipt_id=source.canonical_receipt_id
  join private.native_production_video_admissions a on a.id=binding.admission_id
  join public.money_access_ledger_events m on m.id=e.money_ledger_event_id
  join public.provider_events receipt on receipt.id=e.provider_event_id
  join public.provider_events original_receipt on original_receipt.id=source.canonical_receipt_id
  join public.creator_money_settlement_policies policy on policy.source_type='paid_content'
  join private.commerce_creator_fee_acceptances acceptance on acceptance.id=credit.acceptance_id
  where credit.earnings_ledger_id=p_earning and credit.creator_id=a.creator_id and credit.currency=a.currency
   and credit.amount_minor=point.delta_minor and acceptance.creator_id=a.creator_id and acceptance.accepted_at<=report.observed_at
   and acceptance.policy_version='known_costs_future_unpaid_adjustments_v1'
   and acceptance.terms_sha256=encode(extensions.digest(private.commerce_known_cost_terms(),'sha256'),'hex')
   and row(e.creator_id,e.source_type,e.source_id,e.currency,e.gross_amount_cents,e.net_creator_amount_cents,e.platform_fee_cents,e.provider_fee_cents,e.tax_cents,
    e.settlement_started_at,e.normal_eligible_at,e.reserve_release_at,e.settlement_policy_version,e.settlement_reference_hash,e.reserve_amount_cents)
    is not distinct from row(a.creator_id,'paid_content',original.source_id,a.currency,credit.amount_minor,credit.amount_minor,0,0,0,
     original.settlement_started_at,original.normal_eligible_at,original.reserve_release_at,policy.policy_version,report.semantic_sha256,
     ceil(credit.amount_minor::numeric*policy.reserve_basis_points/10000))
   and e.created_at>=report.created_at and e.created_at<=credit.created_at
   and row(m.user_id,m.creator_id,m.product_id,m.provider_event_id,m.environment,m.source_type,m.source_id,m.currency,m.amount_minor,m.event_type)
    is not distinct from row(a.buyer_id,a.creator_id,a.catalog_product_id,receipt.id,'production','paid_content',original.source_id,a.currency,credit.amount_minor,'native_verified_correction_credit')
   and row(receipt.provider,receipt.provider_event_id,receipt.user_id,receipt.environment,receipt.event_type,receipt.status,receipt.idempotency_key)
    is not distinct from row(original_receipt.provider,'native-correction:'||report.id::text,a.buyer_id,'production','native_verified_correction_credit','processed','native-correction:'||report.id::text)
   and ((m.status='pending' and m.payable_state='pending_verification') or (m.status='verified' and m.payable_state in ('payable','paid')))
   and public.creator_earnings_current_state_internal(e.id) in ('held','available','paid')
   and not exists(select 1 from public.creator_money_recovery_obligations where earnings_ledger_id=e.id)
   and not exists(select 1 from public.creator_money_reversal_links where original_money_ledger_event_id=e.money_ledger_event_id));
$$;

alter function private.native_production_current_earning_domain_ready(uuid) rename to native_production_current_before_corrections;
-- Settlement days are the retained UTC policy duration, not the caller's
-- calendar. Crossing DST must neither shift release time nor invalidate proof.
do $$ declare definition text; normal text:='correlation.purchased_at+policy.normal_hold'; reserve text:=normal||'+policy.reserve_duration'; begin
 definition:=pg_get_functiondef('private.native_production_current_before_corrections(uuid)'::regprocedure);
 if position(reserve in definition)=0 then raise exception 'native_current_policy_deadline_anchor_changed';end if;
 definition:=replace(definition,reserve,'private.native_production_policy_deadline(correlation.purchased_at,policy.normal_hold+policy.reserve_duration)');
 definition:=replace(definition,normal,'private.native_production_policy_deadline(correlation.purchased_at,policy.normal_hold)');
 execute definition;
end $$;
create function private.native_production_current_earning_domain_ready(p_earning uuid) returns boolean
language plpgsql volatile set search_path='' as $$
declare receipt uuid; original uuid; point private.native_production_correction_checkpoints; evaluation jsonb; funding uuid; e public.creator_earnings_ledger;
begin
 if not private.native_production_earning_in_domain(p_earning) then return true; end if;
 select source.canonical_receipt_id,source.earnings_ledger_id into receipt,original from private.native_production_earning_sources source
  where source.earnings_ledger_id=p_earning or exists(select 1 from private.native_production_credit_sources credit where credit.earnings_ledger_id=p_earning and credit.original_earnings_id=source.earnings_ledger_id);
 if receipt is null then return false; end if;
 if not exists(select 1 from private.native_production_correction_reports where canonical_receipt_id=receipt) then
  return private.native_production_current_before_corrections(p_earning); end if;
 if not exists(select 1 from private.native_production_earning_controls where singleton and materialize_held and release_earnings and account_corrections
  and (p_earning=original or release_correction_credits)) then return false; end if;
 evaluation:=private.evaluate_native_production_correction(receipt);
 select * into point from private.native_production_correction_checkpoints where canonical_receipt_id=receipt order by id desc limit 1;
 if evaluation->'complete' is distinct from 'true'::jsonb or point.report_id::text is distinct from evaluation->>'reportId'
  or point.target_minor is distinct from (evaluation->>'targetMinor')::bigint
  or private.native_production_original_integrity(receipt) is distinct from true
  or (p_earning<>original and private.native_production_credit_integrity(p_earning) is distinct from true) then return false; end if;
 select * into e from public.creator_earnings_ledger where id=p_earning;
 if private.native_production_release_subject_current(e.creator_id) is distinct from true or e.normal_eligible_at>clock_timestamp()
  or not exists(select 1 from public.money_access_ledger_events m where m.id=e.money_ledger_event_id and m.status='verified' and m.payable_state in ('payable','paid'))
  or not exists(select 1 from private.native_production_corrected_releases where earnings_ledger_id=p_earning)
  or exists(select 1 from (values('live_money_enabled'),('payouts_enabled'),('stripe_connect_enabled')) required(key)
   where not exists(select 1 from public.platform_money_kill_switches switch where switch.key=required.key and switch.state='on')) then return false; end if;
 funding:=private.native_production_corrected_funding_current(receipt,point.id);
 -- Do not require recovery debt to be zero here: the future-only consumer must
 -- be able to consume this credit. Final bank-dispatch admission checks debt.
 return funding is not null;
end $$;

alter function public.reconcile_native_production_earning(uuid) rename to reconcile_native_production_before_corrections;
alter function public.reconcile_native_production_before_corrections(uuid) set schema private;
do $$ declare definition text; normal text:='correlation.purchased_at+policy.normal_hold'; reserve text:=normal||'+policy.reserve_duration'; begin
 definition:=pg_get_functiondef('private.reconcile_native_production_before_corrections(uuid)'::regprocedure);
 if position(reserve in definition)=0 then raise exception 'native_initial_policy_deadline_anchor_changed';end if;
 definition:=replace(definition,reserve,'private.native_production_policy_deadline(correlation.purchased_at,policy.normal_hold+policy.reserve_duration)');
 definition:=replace(definition,normal,'private.native_production_policy_deadline(correlation.purchased_at,policy.normal_hold)');
 execute definition;
end $$;
revoke all on function private.reconcile_native_production_before_corrections(uuid) from public,anon,authenticated,service_role;
create function public.reconcile_native_production_earning(p_canonical_receipt_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare controls private.native_production_earning_controls; evaluation jsonb; report private.native_production_correction_reports;
 original public.creator_earnings_ledger; link private.native_production_earning_sources; a private.native_production_video_admissions;
 correlation private.native_production_purchase_correlations; source private.native_production_video_versions; snapshot private.native_production_economic_snapshots;
 point private.native_production_correction_checkpoints; previous private.native_production_correction_checkpoints;
 acceptance private.commerce_creator_fee_acceptances; policy public.creator_money_settlement_policies;
 target bigint; prior_target bigint; delta numeric; adjustment uuid; credit uuid; money uuid; provider_id uuid;
 funding uuid; item record; consumed bigint:=0;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into controls from private.native_production_earning_controls where singleton;
 if controls.materialize_held is distinct from true then return jsonb_build_object('status','disabled','dispatchAllowed',false); end if;
 select admission.* into a from private.native_production_sale_bindings binding join private.native_production_video_admissions admission
  on admission.id=binding.admission_id where binding.canonical_receipt_id=p_canonical_receipt_id;
 if a.id is null then return jsonb_build_object('status','HELD','reason','production_admission_unbound','dispatchAllowed',false); end if;
 perform private.lock_native_production_accounting_facts(a.creator_id);
 -- The dispatch decision is made only after fencing correction INSERTs. A
 -- report arriving between an optimistic read and the predecessor is not lost.
 if not exists(select 1 from private.native_production_correction_reports where canonical_receipt_id=p_canonical_receipt_id) then
  return private.reconcile_native_production_before_corrections(p_canonical_receipt_id); end if;
 select * into controls from private.native_production_earning_controls where singleton;
 if controls.materialize_held is distinct from true or controls.account_corrections is distinct from true then
  return jsonb_build_object('status','HELD','reason','native_correction_accounting_disabled','dispatchAllowed',false); end if;
 evaluation:=private.evaluate_native_production_correction(p_canonical_receipt_id);
 if evaluation->'complete' is distinct from 'true'::jsonb then return evaluation||jsonb_build_object('dispatchAllowed',false); end if;
 select * into strict report from private.native_production_correction_reports where id=(evaluation->>'reportId')::uuid;
 select * into acceptance from private.commerce_creator_fee_acceptances where creator_id=a.creator_id
  and policy_version='known_costs_future_unpaid_adjustments_v1'
  and terms_sha256=encode(extensions.digest(private.commerce_known_cost_terms(),'sha256'),'hex') and accepted_at<=report.observed_at;
 if acceptance.id is null then return jsonb_build_object('status','HELD','reason','accepted_future_unpaid_policy_missing','dispatchAllowed',false); end if;
 select * into link from private.native_production_earning_sources where canonical_receipt_id=p_canonical_receipt_id;
 if link.earnings_ledger_id is null then
  -- There is no debt against an unissued diagnostic candidate. A fully covered
  -- positive corrected opening starts at its actual current target, held until
  -- a new checkpoint/liability/delivery/funding proof exists. Zero/negative
  -- initial economics do not create any earning, recovery debt or checkpoint.
  target:=(evaluation->>'targetMinor')::bigint;
  if target<=0 or greatest(target,(evaluation->>'retainedGrossMinor')::numeric,(evaluation->>'providerFeeMinor')::numeric,
   (evaluation->>'taxMinor')::numeric,(evaluation->>'platformMinor')::numeric)>2147483647 then
   return jsonb_build_object('status','HELD','reason','corrected_opening_positive_representable_target_required','dispatchAllowed',false); end if;
  if exists(select 1 from public.money_access_ledger_events where provider_event_id=p_canonical_receipt_id)
   or exists(select 1 from public.creator_earnings_ledger where provider_event_id=p_canonical_receipt_id) then
   return jsonb_build_object('status','HELD','reason','another_canonical_money_lane_exists','dispatchAllowed',false); end if;
  select * into strict policy from public.creator_money_settlement_policies where source_type='paid_content';
  if policy.requires_obligation_completion or policy.normal_hold is null then
   return jsonb_build_object('status','HELD','reason','native_settlement_policy_unavailable','dispatchAllowed',false); end if;
  select * into strict source from private.native_production_video_versions where id=a.source_version_id;
  select * into strict correlation from private.native_production_purchase_correlations where canonical_receipt_id=p_canonical_receipt_id;
  select * into strict snapshot from private.native_production_economic_snapshots where id=report.baseline_snapshot_id;
  insert into public.money_access_ledger_events(user_id,creator_id,product_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type,source_id,metadata)
   values(a.buyer_id,a.creator_id,a.catalog_product_id,p_canonical_receipt_id,'native_verified_corrected_opening',(evaluation->>'retainedGrossMinor')::integer,a.currency,
    'production','pending_verification','pending','paid_content',source.source_id,jsonb_build_object('native_opening_report_id',report.id,'native_snapshot_id',snapshot.id)) returning id into money;
  insert into public.creator_earnings_ledger(creator_id,source_type,source_id,gross_amount_cents,platform_fee_cents,provider_fee_cents,tax_cents,net_creator_amount_cents,
   currency,ledger_status,money_ledger_event_id,provider_event_id,settlement_reference_hash,settlement_started_at,normal_eligible_at,reserve_amount_cents,
   reserve_release_at,settlement_policy_version,metadata,created_at)
   values(a.creator_id,'paid_content',source.source_id,(evaluation->>'retainedGrossMinor')::integer,(evaluation->>'platformMinor')::integer,
    (evaluation->>'providerFeeMinor')::integer,(evaluation->>'taxMinor')::integer,target::integer,a.currency,'held',money,p_canonical_receipt_id,snapshot.evaluation_sha256,
    correlation.purchased_at,private.native_production_policy_deadline(correlation.purchased_at,policy.normal_hold),ceil(target::numeric*policy.reserve_basis_points/10000)::integer,
    private.native_production_policy_deadline(correlation.purchased_at,policy.normal_hold+policy.reserve_duration),policy.policy_version,
    jsonb_build_object('native_opening_report_id',report.id,'native_snapshot_id',snapshot.id),clock_timestamp()) returning * into original;
  insert into private.native_production_earning_sources(earnings_ledger_id,snapshot_id,canonical_receipt_id)
   values(original.id,snapshot.id,p_canonical_receipt_id) returning * into link;
  insert into private.native_production_corrected_openings(earnings_ledger_id,report_id,original_gross_minor,refunded_minor,retained_gross_minor,provider_fee_minor,tax_minor,platform_minor,creator_minor,acceptance_id)
   values(original.id,report.id,correlation.actual_gross_minor,(evaluation->>'refundedMinor')::bigint,(evaluation->>'retainedGrossMinor')::bigint,
    (evaluation->>'providerFeeMinor')::bigint,(evaluation->>'taxMinor')::bigint,(evaluation->>'platformMinor')::bigint,target,acceptance.id);
  insert into private.native_production_correction_checkpoints(canonical_receipt_id,report_id,original_earnings_id,prior_target_minor,target_minor,delta_minor)
   values(p_canonical_receipt_id,report.id,original.id,target,target,0);
 end if;
 select * into strict original from public.creator_earnings_ledger where id=link.earnings_ledger_id;
 if private.native_production_original_integrity(p_canonical_receipt_id) is distinct from true then
  raise exception 'original_earning_integrity_failed'; end if;
 select * into point from private.native_production_correction_checkpoints where report_id=report.id;
 if point.id is null then
  select * into previous from private.native_production_correction_checkpoints where canonical_receipt_id=p_canonical_receipt_id order by id desc limit 1;
  prior_target:=coalesce(previous.target_minor,original.net_creator_amount_cents); target:=(evaluation->>'targetMinor')::bigint;
  delta:=target::numeric-prior_target;
  if abs(delta)>2147483647 then return jsonb_build_object('status','HELD','reason','native_correction_delta_overflow','dispatchAllowed',false); end if;
  if delta<0 then
   insert into private.commerce_creator_fee_adjustments(creator_id,acceptance_id,currency,amount_minor,reason,source_type,source_id,evidence_hash)
    values(a.creator_id,acceptance.id,a.currency,-delta::bigint,
     case when exists(select 1 from jsonb_array_elements(report.facts->'components') component where component->>'category'='refund_gross')
      then 'later_verified_refund' else 'later_verified_fee' end,'native_paid_video',p_canonical_receipt_id,report.semantic_sha256) returning id into adjustment;
  elsif delta>0 then
   select * into strict policy from public.creator_money_settlement_policies where source_type='paid_content';
   insert into public.provider_events(provider,provider_event_id,user_id,environment,event_type,status,idempotency_key,metadata)
    values((select provider from public.provider_events where id=p_canonical_receipt_id),'native-correction:'||report.id::text,a.buyer_id,'production',
     'native_verified_correction_credit','processed','native-correction:'||report.id::text,
     jsonb_build_object('native_correction_report_id',report.id,'native_original_receipt_id',p_canonical_receipt_id)) returning id into provider_id;
   insert into public.money_access_ledger_events(user_id,creator_id,product_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type,source_id,metadata)
    values(a.buyer_id,a.creator_id,a.catalog_product_id,provider_id,'native_verified_correction_credit',delta::integer,a.currency,'production',
     'pending_verification','pending','paid_content',original.source_id,jsonb_build_object('native_correction_report_id',report.id)) returning id into money;
   insert into public.creator_earnings_ledger(creator_id,source_type,source_id,gross_amount_cents,platform_fee_cents,provider_fee_cents,tax_cents,net_creator_amount_cents,
    currency,ledger_status,money_ledger_event_id,provider_event_id,settlement_reference_hash,settlement_started_at,normal_eligible_at,reserve_amount_cents,
    reserve_release_at,settlement_policy_version,metadata,created_at)
    values(a.creator_id,'paid_content',original.source_id,delta::integer,0,0,0,delta::integer,a.currency,'held',money,provider_id,report.semantic_sha256,
     original.settlement_started_at,original.normal_eligible_at,ceil(delta*policy.reserve_basis_points/10000)::integer,
     original.reserve_release_at,policy.policy_version,jsonb_build_object('native_correction_report_id',report.id),clock_timestamp()) returning id into credit;
   insert into private.native_production_credit_sources(earnings_ledger_id,original_earnings_id,report_id,creator_id,currency,amount_minor,acceptance_id)
    values(credit,original.id,report.id,a.creator_id,a.currency,delta::bigint,acceptance.id);
  end if;
  insert into private.native_production_correction_checkpoints(canonical_receipt_id,report_id,original_earnings_id,prior_target_minor,target_minor,delta_minor,adjustment_id,credit_earnings_id)
   values(p_canonical_receipt_id,report.id,original.id,prior_target,target,delta::bigint,adjustment,credit) returning * into point;
 end if;
 -- Negative accounting is allowed with payout switches OFF; positive release
 -- is independently controlled and cannot reuse stale transaction funding.
 if controls.release_earnings is distinct from true or private.native_production_release_subject_current(a.creator_id) is distinct from true
  or exists(select 1 from (values('live_money_enabled'),('payouts_enabled'),('stripe_connect_enabled')) required(key)
   where not exists(select 1 from public.platform_money_kill_switches switch where switch.key=required.key and switch.state='on')) then
  return jsonb_build_object('status','HELD','reason','corrected_release_disabled_or_subject_unqualified','checkpointId',point.id,'dispatchAllowed',false); end if;
 funding:=private.native_production_corrected_funding_current(p_canonical_receipt_id,point.id);
 if funding is null then return jsonb_build_object('status','HELD','reason','corrected_funding_required','checkpointId',point.id,'dispatchAllowed',false); end if;
 for item in select e.* from public.creator_earnings_ledger e where e.id=original.id or exists(select 1 from private.native_production_credit_sources credits
  where credits.original_earnings_id=original.id and credits.earnings_ledger_id=e.id) order by e.created_at,e.id loop
  if item.id<>original.id and (controls.release_correction_credits is distinct from true or private.native_production_credit_integrity(item.id) is distinct from true)
   then continue; end if;
  if item.normal_eligible_at>clock_timestamp() then continue; end if;
  insert into private.native_production_corrected_releases(earnings_ledger_id,proof_id) values(item.id,funding) on conflict do nothing;
  update public.money_access_ledger_events set status='verified',payable_state='payable',metadata=metadata||
   jsonb_build_object('payout_readiness_proved',true,'live_money_enabled_at_verification',true) where id=item.money_ledger_event_id
    and status='pending' and payable_state='pending_verification';
  if public.creator_earnings_current_state_internal(item.id)='held' then
   perform public.record_creator_earnings_lifecycle_internal(item.id,'available','settlement_released','native-corrected-release:'||item.id::text,
    null,item.money_ledger_event_id,jsonb_build_object('native_corrected_funding_proof_id',funding)); end if;
 end loop;
 consumed:=private.consume_creator_fee_recovery(a.creator_id,a.currency);
 return jsonb_build_object('status','accounted','checkpointId',point.id,'recoveryConsumedMinor',consumed::text,
  'fundingRefreshRequired',private.native_production_corrected_funding_current(p_canonical_receipt_id,point.id) is null,'dispatchAllowed',false);
end $$;
revoke all on function public.reconcile_native_production_earning(uuid) from public,anon,authenticated,service_role;
grant execute on function public.reconcile_native_production_earning(uuid) to service_role;

create or replace function private.assert_native_production_cashout_recipient(p_request uuid,p_platform text,p_recipient text) returns void
language plpgsql set search_path='' as $$
declare allocation record; receipt uuid; point bigint; funding uuid;
begin
 for allocation in select earnings_ledger_id from public.creator_payout_allocations where payout_request_id=p_request
  and private.native_production_earning_in_domain(earnings_ledger_id) loop
  select source.canonical_receipt_id into receipt from private.native_production_earning_sources source where source.earnings_ledger_id=allocation.earnings_ledger_id
   or exists(select 1 from private.native_production_credit_sources credit where credit.earnings_ledger_id=allocation.earnings_ledger_id and credit.original_earnings_id=source.earnings_ledger_id);
  if receipt is null then raise exception 'native_production_cashout_recipient_mismatch'; end if;
  if exists(select 1 from private.native_production_correction_reports where canonical_receipt_id=receipt) then
   select id into point from private.native_production_correction_checkpoints where canonical_receipt_id=receipt order by id desc limit 1;
   funding:=private.native_production_corrected_funding_current(receipt,point);
   if funding is null or not exists(select 1 from private.native_production_corrected_funding_proofs proof where proof.id=funding
    and row(proof.platform_account_id,proof.recipient_account_id) is not distinct from row(p_platform,p_recipient))
    then raise exception 'native_production_cashout_recipient_mismatch'; end if;
  elsif not exists(select 1 from private.native_production_earning_releases release join private.native_production_funding_proofs proof on proof.id=release.funding_proof_id
   where release.earnings_ledger_id=allocation.earnings_ledger_id and row(proof.platform_account_id,proof.recipient_account_id) is not distinct from row(p_platform,p_recipient))
   then raise exception 'native_production_cashout_recipient_mismatch'; end if;
 end loop;
end $$;

-- Recovery is itself a native ledger mutation. The public entrypoints fence
-- native facts before their retained creator lock. Other creator domains retain
-- their existing behavior. The internal consumer repeats this nonblocking check.
create function private.lock_native_production_creator_recovery(p_creator uuid) returns void
language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.creator_earnings_ledger e where e.creator_id=p_creator and private.native_production_earning_in_domain(e.id)) then
  perform private.lock_native_production_accounting_facts(p_creator); end if;
end $$;
alter function private.consume_creator_fee_recovery(uuid,text) rename to consume_creator_fee_recovery_before_native_corrections;
create function private.consume_creator_fee_recovery(p_creator uuid,p_currency text) returns bigint
language plpgsql set search_path='' as $$
begin
 perform private.lock_native_production_creator_recovery(p_creator);
 return private.consume_creator_fee_recovery_before_native_corrections(p_creator,p_currency);
end $$;
do $$ declare signature regprocedure; definition text; marker text:=E'begin\n'; begin
 foreach signature in array array[
  'public.create_creator_payout_request_safe(integer,text)'::regprocedure,
  'public.request_qualified_creator_cashout(integer,text,uuid,uuid,integer,integer,integer)'::regprocedure] loop
  definition:=pg_get_functiondef(signature);
  if position(marker in definition)=0 then raise exception 'native_recovery_entrypoint_anchor_changed'; end if;
  execute overlay(definition placing marker||' perform private.lock_native_production_creator_recovery(auth.uid());'||E'\n'
   from position(marker in definition) for length(marker));
 end loop;
end $$;
revoke all on function private.consume_creator_fee_recovery(uuid,text),private.consume_creator_fee_recovery_before_native_corrections(uuid,text)
 from public,anon,authenticated,service_role;

-- Native recovery may consume future commerce earnings. Fence the complete
-- current commerce report/return/auction namespaces (including INSERT phantoms)
-- before the creator lock, not merely their earning rows. These EXCLUSIVE NOWAIT
-- locks are additional native-operation guards; existing commerce writers and
-- their lock order are unchanged. Unknown future domains require review.
do $$ declare definition text; old text:='''creator_money_recovery_obligations'''; native text:='c.relname like ''native_production_%'''; begin
 definition:=pg_get_functiondef('private.lock_native_production_accounting_facts(uuid)'::regprocedure);
 if position(old in definition)=0 or position(native in definition)=0 then raise exception 'native_reversal_fence_anchor_changed'; end if;
 definition:=replace(definition,native,'(c.relname like any(array[''native_production_%'',''commerce_%'',''merch_%'',''auction_%'',''creator_event_%'',''creator_room_%'']))');
 definition:=replace(definition,old,old||',''creator_money_reversal_links'',''merch_orders'',''merch_products'',''creator_events'',''creator_event_purchase_remedies'',
  ''creator_event_offer_revisions'',''money_purchase_intents'',''watch_party_rooms'',''creator_payout_eligibility_records''');
 execute definition;
end $$;

do $$ declare f record; begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='private'::regnamespace and proname like '%native_production%' loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
