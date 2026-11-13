-- Test-mode evidence joins the existing cost snapshot and earnings ledgers.
-- This does not modify live release dispatch, payout switches or qualifications.
alter table private.commerce_known_cost_snapshots drop constraint commerce_known_cost_snapshots_source_type_check;
alter table private.commerce_known_cost_snapshots add constraint commerce_known_cost_snapshots_source_type_check
 check(source_type in ('physical_merch','event_auction','room_auction','paid_video'));
-- The old trigger's ELSE is an auction-only materializer. Video allocations
-- are appended below in the same transaction, never mislabelled as auctions.
do $$ declare definition text; needle text:=E'begin\n';begin
 definition:=pg_get_functiondef('private.append_known_cost_allocation()'::regprocedure);
 if position(needle in definition)=0 then raise exception 'known_cost_allocation_definition_changed'; end if;
 definition:=overlay(definition placing needle||$guard$
 if new.source_type='paid_video' then
  if new.environment<>'test' then raise exception 'video_cost_live_allocation_forbidden'; end if;
  return new;
 end if;
$guard$ from position(needle in definition) for length(needle));
 execute definition;
end $$;
create table private.stripe_video_cost_evidence (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references private.stripe_paid_video_orders(id),
 receipt_id uuid not null references private.stripe_paid_video_observations(id),
 input jsonb not null, reports jsonb not null, evidence_sha256 text not null,
 created_at timestamptz not null default clock_timestamp(),unique(order_id,evidence_sha256)
);
create table private.stripe_video_held_cost_links (
 snapshot_id uuid primary key references private.commerce_known_cost_snapshots(id),
 order_id uuid not null references private.stripe_paid_video_orders(id),
 evidence_id uuid not null unique references private.stripe_video_cost_evidence(id),
 earnings_id uuid not null unique references public.creator_earnings_ledger(id),
 target_minor bigint not null, created_at timestamptz not null default clock_timestamp()
);
do $$ declare t text;begin
 foreach t in array array['stripe_video_cost_evidence','stripe_video_held_cost_links'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before update or delete on private.%I for each row execute function private.guard_event_ticket_terms_immutable()',t||'_immutable',t);
 end loop;
end $$;

create function public.get_stripe_video_cost_context(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o private.stripe_paid_video_orders; reports jsonb; tax private.commerce_tax_qualifications;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into strict o from private.stripe_paid_video_orders where id=p_order_id and environment='sandbox'
  and status in ('paid','refunded','held') and charge_id is not null;
 select e.reports into reports from private.stripe_video_cost_evidence e where e.order_id=o.id order by e.created_at desc,e.id desc limit 1;
 select * into tax from private.commerce_tax_qualifications q where q.id=o.tax_policy_id and q.feature='paid_video'
  and q.account_id=o.stripe_account_id and q.product_id=o.stripe_product_id and q.environment='test'
  and q.enabled and q.revoked_at is null and q.verified_at<=clock_timestamp() and q.expires_at>clock_timestamp()
  and q.provider_verified_at<=clock_timestamp() and q.provider_expires_at>clock_timestamp()
  and (q.collection_mode='automatic' or (q.collection_mode='verified_no_collection' and nullif(btrim(q.no_collection_basis_reference),'') is not null));
 if tax.id is null then raise exception 'video_cost_tax_policy_required'; end if;
 return to_jsonb(o)||jsonb_build_object('previousReports',coalesce(reports,'[]'::jsonb),'taxCollectionMode',tax.collection_mode);
end $$;
revoke all on function public.get_stripe_video_cost_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_stripe_video_cost_context(uuid) to service_role;

create function public.record_stripe_video_known_costs(p_order_id uuid,p_input jsonb,p_reports jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o private.stripe_paid_video_orders; receipt private.stripe_paid_video_observations;
 accepted private.commerce_creator_fee_acceptances; qualified private.commerce_fee_semantic_qualifications;
 prior private.stripe_video_held_cost_links; previous_snapshot private.commerce_known_cost_snapshots; evidence private.stripe_video_cost_evidence;
 report jsonb; component jsonb; b jsonb; components jsonb:='{}'; balance_rows jsonb:='{}'; component_key text;
 previous_component jsonb; source text; balance_id text; report_refunds jsonb;
 tax bigint; refunded bigint; reversal bigint; fee bigint:=0; net bigint; platform_amount bigint; creator_amount bigint; target bigint; difference bigint;
 inline_fee bigint; component_fee bigint; snapshot uuid; provider_id uuid; money_id uuid; earning uuid; digest text; x record;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into strict o from private.stripe_paid_video_orders where id=p_order_id for update;
 if o.environment<>'sandbox' or o.currency<>'usd' or o.status not in ('paid','refunded','held') then raise exception 'sandbox_paid_order_required'; end if;
 select * into receipt from private.stripe_paid_video_observations where order_id=o.id order by received_at desc,id desc limit 1;
 if receipt.id is null then raise exception 'verified_receipt_required'; end if;
 if p_input->>'policyVersion' is distinct from 'known_costs_future_unpaid_adjustments_v1'
  or p_input->>'feeSemantics' is distinct from 'all_fees.incurred_at.itemized.2:amount_excludes_tax_v1'
  or p_input->>'accountId' is distinct from o.stripe_account_id or p_input->>'chargeId' is distinct from o.charge_id
  or p_input->>'environment' is distinct from 'test' or p_input->>'currency' is distinct from 'usd'
  or (p_input->>'grossMinor')::bigint is distinct from o.amount_minor
  or (p_input->>'platformBps')::integer is distinct from 2000 then raise exception 'video_cost_identity_mismatch'; end if;
 tax:=(p_input->>'taxMinor')::bigint;refunded:=(p_input->>'refundedMinor')::bigint;reversal:=(p_input->>'taxReversalMinor')::bigint;
 if tax is null or refunded is null or reversal is null or tax<0 or tax>o.amount_minor or refunded<0 or refunded>o.amount_minor
  or reversal<0 or reversal>tax or reversal>refunded or refunded is distinct from receipt.refund_amount_minor then raise exception 'video_cost_amount_unknown_or_stale'; end if;
 if jsonb_typeof(p_input->'balances') is distinct from 'array' or jsonb_array_length(p_input->'balances') not between 1 and 2001
  or jsonb_typeof(p_input->'reports') is distinct from 'array' or jsonb_array_length(p_input->'reports') not between 1 and 16
  or jsonb_typeof(p_reports) is distinct from 'array' or jsonb_array_length(p_reports)<>jsonb_array_length(p_input->'reports') then raise exception 'video_cost_evidence_bounds'; end if;
 perform pg_advisory_xact_lock(hashtextextended('fee-components:'||o.stripe_account_id||':test',0));
 perform pg_advisory_xact_lock(hashtextextended('creator-payout:'||o.creator_id::text,0));
 select * into accepted from private.commerce_creator_fee_acceptances where creator_id=o.creator_id
  and policy_version='known_costs_future_unpaid_adjustments_v1' and terms_sha256=encode(extensions.digest(private.commerce_known_cost_terms(),'sha256'),'hex');
 if accepted.id is null then raise exception 'creator_fee_policy_acceptance_required'; end if;
 select * into qualified from private.commerce_fee_semantic_qualifications q where q.account_id=o.stripe_account_id and q.environment='test'
  and q.verified_at<=clock_timestamp() and q.expires_at>clock_timestamp()
  and not exists(select 1 from private.commerce_fee_qualification_revocations r where r.qualification_kind='semantics' and r.qualification_id=q.id)
  order by q.verified_at desc,q.id desc limit 1;
 if qualified.id is null then raise exception 'fee_semantics_qualification_required'; end if;
 for b in select value from jsonb_array_elements(p_input->'balances') loop
  if coalesce(b->>'id','') !~ '^txn_[A-Za-z0-9]+$' or balance_rows ? (b->>'id')
   or (b->>'objectId' is distinct from o.charge_id and coalesce(b->>'objectId','') !~ '^re_[A-Za-z0-9]+$')
   or coalesce(b->>'feeMinor','') !~ '^-?[0-9]+$' then raise exception 'video_cost_balance_invalid'; end if;
  balance_rows:=balance_rows||jsonb_build_object(b->>'id',b);fee:=fee+(b->>'feeMinor')::bigint;
 end loop;
 if (select count(*) from jsonb_each(balance_rows) where value->>'objectId'=o.charge_id)<>1
  or (select count(*) from jsonb_each(balance_rows))<>(select count(distinct value->>'objectId') from jsonb_each(balance_rows)) then raise exception 'video_cost_balance_identity_invalid'; end if;
 select coalesce(jsonb_agg(value->>'objectId' order by value->>'objectId'),'[]'::jsonb) into report_refunds from jsonb_each(balance_rows) where value->>'objectId'<>o.charge_id;
 for report in select value from jsonb_array_elements(p_input->'reports') loop
  if report->>'accountId' is distinct from o.stripe_account_id or report->>'environment' is distinct from 'test'
   or report->>'chargeId' is distinct from o.charge_id or report->'refundIds' is distinct from report_refunds
   or report->>'providerBinding' is distinct from 'authenticated_report' or report->>'reportType' is distinct from 'all_fees.incurred_at.itemized.2'
   or coalesce(report->>'contentSha256','') !~ '^[a-f0-9]{64}$' or coalesce(report->>'reportRunId','') !~ '^frr_[A-Za-z0-9]+$'
   or coalesce(report->>'reportSucceededAt','') !~ '^[1-9][0-9]*$'
   or coalesce(report->>'intervalStart','') !~ '^[0-9]+$' or coalesce(report->>'intervalEnd','') !~ '^[0-9]+$'
   or (report->>'intervalEnd')::bigint<=(report->>'intervalStart')::bigint
   or jsonb_typeof(report->'rows') is distinct from 'array' or jsonb_array_length(report->'rows')>10000 then raise exception 'video_cost_report_binding_invalid'; end if;
  if not exists(select 1 from jsonb_array_elements(p_reports) r where r->>'reportRunId'=report->>'reportRunId'
   and r->>'fileId'=report->>'fileId' and r->'intervalStart'=report->'intervalStart' and r->'intervalEnd'=report->'intervalEnd') then raise exception 'video_cost_report_descriptor_mismatch'; end if;
  for component in select value from jsonb_array_elements(report->'rows') loop
   if component->>'currency' is distinct from 'usd' or component->>'settledVia' is distinct from 'balance'
    or nullif(component->>'feeTransactionId','') is null or nullif(component->>'product','') is null
    or nullif(component->>'suite','') is null or nullif(component->>'featureName','') is null or component->>'pricingTier' is null
    or coalesce(component->>'balanceTransactionId','') !~ '^txn_[A-Za-z0-9]+$'
    or coalesce(component->>'amountMinor','') !~ '^-?[0-9]+$' or coalesce(component->>'taxMinor','') !~ '^-?[0-9]+$'
    or not ((component->>'incurredBy'=o.charge_id and component->>'incurredByType'='charge')
      or (report_refunds ? (component->>'incurredBy') and component->>'incurredByType'='refund')) then raise exception 'video_cost_component_invalid'; end if;
   component_key:=jsonb_build_array(component->>'feeTransactionId',component->>'incurredBy',component->>'incurredByType',
    component->>'currency',component->>'product',component->>'suite',component->>'featureName',component->>'pricingTier')::text;
   if components ? component_key and components->component_key is distinct from component then raise exception 'video_cost_component_conflict'; end if;
   components:=components||jsonb_build_object(component_key,component);
  end loop;
 end loop;
 if exists(select 1 from private.stripe_video_cost_evidence e,lateral jsonb_array_elements(e.reports) old
  where e.order_id=o.id and not p_reports @> jsonb_build_array(old.value)) then raise exception 'video_cost_historical_report_missing'; end if;
 -- Historical observed components cannot disappear or be silently rewritten by
 -- a later report. Distinct verified correction components remain additive.
 for previous_component in select distinct c.value from private.stripe_video_cost_evidence e,
  lateral jsonb_array_elements(e.input->'reports') r,lateral jsonb_array_elements(r->'rows') c where e.order_id=o.id loop
  component_key:=jsonb_build_array(previous_component->>'feeTransactionId',previous_component->>'incurredBy',previous_component->>'incurredByType',
   previous_component->>'currency',previous_component->>'product',previous_component->>'suite',previous_component->>'featureName',previous_component->>'pricingTier')::text;
  if components->component_key is distinct from previous_component then raise exception 'video_cost_historical_component_missing_or_changed'; end if;
 end loop;
 for x in select value->>'balanceTransactionId' id,min(value->>'incurredBy') source,count(distinct value->>'incurredBy') n,
  sum((value->>'amountMinor')::bigint+(value->>'taxMinor')::bigint)::bigint fee from jsonb_each(components) group by value->>'balanceTransactionId' loop
  if x.n<>1 then raise exception 'video_cost_balance_cross_source'; end if;
  if balance_rows ? x.id then
   if balance_rows->x.id->>'objectId' is distinct from x.source or (balance_rows->x.id->>'feeMinor')::bigint is distinct from x.fee then raise exception 'video_cost_overlap_unreconciled'; end if;
  else fee:=fee+x.fee; end if;
 end loop;
 if fee<0 then raise exception 'video_cost_overcredit_review_required'; end if;
 net:=o.amount_minor-tax-refunded+reversal-fee;platform_amount:=floor(greatest(net,0)::numeric*2000/10000)::bigint;
 creator_amount:=greatest(net,0)-platform_amount;target:=creator_amount-greatest(-net,0);
 digest:=encode(extensions.digest(p_input::text,'sha256'),'hex');
 select * into evidence from private.stripe_video_cost_evidence where order_id=o.id and evidence_sha256=digest;
 if evidence.id is not null then return jsonb_build_object('status','held','evidenceId',evidence.id,'replayed',true,'financialAuthority',false); end if;
 insert into private.stripe_video_cost_evidence(order_id,receipt_id,input,reports,evidence_sha256) values(o.id,receipt.id,p_input,p_reports,digest) returning * into evidence;
 insert into private.commerce_known_cost_snapshots(source_type,source_id,source_observation_id,creator_id,acceptance_id,qualification_id,
  account_id,environment,currency,manifest_sha256,gross_minor,tax_minor,refunded_minor,tax_reversal_minor,fee_minor,net_minor,platform_minor,creator_minor,recovery_minor)
 values('paid_video',o.id,evidence.id,o.creator_id,accepted.id,qualified.id,o.stripe_account_id,'test','usd',digest,o.amount_minor,tax,refunded,reversal,fee,net,platform_amount,creator_amount,greatest(-net,0)) returning id into snapshot;
 select * into prior from private.stripe_video_held_cost_links where order_id=o.id order by created_at desc,snapshot_id desc limit 1;
 select * into previous_snapshot from private.commerce_known_cost_snapshots where id=prior.snapshot_id;
 difference:=target-coalesce(prior.target_minor,0);
 if abs(difference)>2147483647 then raise exception 'video_cost_ledger_amount_overflow'; end if;
 insert into public.provider_events(provider,provider_event_id,user_id,environment,event_type,status,idempotency_key,metadata)
 values('stripe_connect','stripe-video-cost:'||evidence.id,o.buyer_id,'sandbox','stripe_video_known_cost','processed','stripe-video-cost:'||evidence.id,
  jsonb_build_object('stripe_video_order_id',o.id,'cost_snapshot_id',snapshot)) returning id into provider_id;
 insert into public.money_access_ledger_events(user_id,creator_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type,source_id,metadata)
 values(o.buyer_id,o.creator_id,provider_id,'stripe_video_known_cost',abs(difference)::integer,'usd','sandbox','not_payable','sandbox_only','paid_content',o.video_id,
  jsonb_build_object('stripe_video_order_id',o.id,'cost_snapshot_id',snapshot,'signed_delta_minor',difference,'financial_authority',false)) returning id into money_id;
 insert into public.creator_earnings_ledger(creator_id,source_type,source_id,gross_amount_cents,platform_fee_cents,provider_fee_cents,tax_cents,
  net_creator_amount_cents,currency,ledger_status,money_ledger_event_id,provider_event_id,settlement_reference_hash,settlement_policy_version,metadata)
 values(o.creator_id,case when prior.snapshot_id is null then 'paid_content' else 'adjustment' end,o.video_id,
  case when prior.snapshot_id is null then o.amount_minor else 0 end,
  (platform_amount-coalesce(previous_snapshot.platform_minor,0))::integer,
  (fee-coalesce(previous_snapshot.fee_minor,0))::integer,
  (tax-reversal-coalesce(previous_snapshot.tax_minor-previous_snapshot.tax_reversal_minor,0))::integer,
  difference::integer,'usd','held',money_id,provider_id,digest,'known_costs_future_unpaid_adjustments_v1',
  jsonb_build_object('stripe_video_order_id',o.id,'cost_snapshot_id',snapshot,'exact_costs_in_snapshot',true,'future_adjustments_possible',true,'final_fees',false,'sandbox_only',true)) returning id into earning;
 insert into private.stripe_video_held_cost_links(snapshot_id,order_id,evidence_id,earnings_id,target_minor) values(snapshot,o.id,evidence.id,earning,target);
 return jsonb_build_object('status','held','snapshotId',snapshot,'earningsId',earning,'creatorTargetMinor',target,'deltaMinor',difference,'financialAuthority',false,'payoutCreated',false);
end $$;
revoke all on function public.record_stripe_video_known_costs(uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_stripe_video_known_costs(uuid,jsonb,jsonb) to service_role;
