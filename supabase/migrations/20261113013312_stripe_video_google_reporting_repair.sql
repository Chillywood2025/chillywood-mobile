-- Source-only reporting repair, called AFTER the financial observer commits.
-- This function cannot grant access, create money events or acknowledge Google.
create function public.repair_stripe_video_google_reporting(
 p_order_id uuid,p_payment_intent_id text,p_charge_id text,p_refund_amount_minor integer,
 p_original_occurred_at timestamptz default null,p_refund_occurred_at timestamptz default null,p_tax jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o private.stripe_paid_video_orders; b private.google_play_external_launch_bindings;
 paid private.stripe_paid_video_observations; observed private.stripe_paid_video_observations;
 t private.google_play_external_transactions; refund_job private.google_play_external_report_outbox;
 tax_minor integer; pre_tax integer; target_pre_tax integer; target_tax integer;
 job_state text; job_reason text; verified_refund_time timestamptz; source_hash text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into o from private.stripe_paid_video_orders where id=p_order_id for update;
 if o.id is null or o.environment<>'sandbox' or o.checkout_platform<>'android' or o.status not in('paid','refunded','held')
 or o.payment_intent_id is distinct from p_payment_intent_id or o.charge_id is distinct from p_charge_id
 or p_refund_amount_minor is null or p_refund_amount_minor<0 or p_refund_amount_minor>o.amount_minor
 then raise exception 'video_reporting_observation_required';end if;
 select * into paid from private.stripe_paid_video_observations s where s.order_id=o.id and s.kind='paid'
 and s.refund_amount_minor=0 and s.checkout_session_id=o.checkout_session_id and s.payment_intent_id=o.payment_intent_id
 and s.charge_id=o.charge_id and s.amount_minor=o.amount_minor and s.currency=o.currency and s.stripe_account_id=o.stripe_account_id
 order by s.received_at,s.id limit 1;
 select * into observed from private.stripe_paid_video_observations s where s.order_id=o.id
 and s.kind=case when p_refund_amount_minor=0 then 'paid' else 'refund' end and s.refund_amount_minor=p_refund_amount_minor
 and s.checkout_session_id=o.checkout_session_id and s.payment_intent_id=o.payment_intent_id
 and s.charge_id=o.charge_id and s.amount_minor=o.amount_minor and s.currency=o.currency and s.stripe_account_id=o.stripe_account_id
 order by s.received_at,s.id limit 1;
 if paid.id is null or observed.id is null then raise exception 'video_reporting_observation_required';end if;
 -- Bind historical identity, not current sales permission. Revocation must not
 -- prevent reporting a charge/refund that already happened.
 select launch.* into b from private.google_play_external_launch_bindings launch
 join private.stripe_video_native_admissions a on a.id=launch.paid_video_admission_id and a.id=o.native_admission_id
 join private.stripe_video_native_routes r on r.id=a.route_id
 join private.google_play_external_program_config g on g.id=launch.program_id and g.id=r.google_program_id
 where launch.feature='paid_video' and launch.quote_id=o.id and launch.capability_id is null
 and launch.buyer_id=o.buyer_id and launch.session_id=o.session_id and launch.amount_minor=o.amount_minor and launch.currency=o.currency
 and a.order_id=o.id and a.buyer_id=o.buyer_id and a.session_id=o.session_id and a.creator_id=o.creator_id and a.video_id=o.video_id
 and a.price_id=o.price_id and a.price_revision=o.price_revision and a.amount_minor=o.amount_minor and a.currency=o.currency
 and a.platform='android' and a.token_hash=launch.token_hash and a.external_transaction_token=launch.external_transaction_token
 and r.platform='android' and r.environment='test' and r.country='US'
 and r.stripe_account_id=o.stripe_account_id and r.stripe_product_id=o.stripe_product_id
 and g.package_name='com.chillywood.mobile' and g.environment='test'
 order by launch.created_at,launch.id limit 1;
 if b.id is null then raise exception 'video_reporting_binding_required';end if;
 if (p_original_occurred_at is not null and (not isfinite(p_original_occurred_at) or p_original_occurred_at<'1970-01-01'::timestamptz or p_original_occurred_at>clock_timestamp()))
 or (p_refund_occurred_at is not null and (p_refund_amount_minor=0 or not isfinite(p_refund_occurred_at) or p_refund_occurred_at<'1970-01-01'::timestamptz or p_refund_occurred_at>clock_timestamp()))
 or (p_original_occurred_at is not null and p_refund_occurred_at<p_original_occurred_at)
 then raise exception 'video_reporting_time_invalid';end if;
 if p_tax is not null then
  if p_tax->>'provenance' is distinct from 'stripe_checkout_automatic_tax_complete' or p_tax->>'countryCode' is distinct from 'US'
  or coalesce(p_tax->>'taxAmountMinor','')!~'^(0|[1-9][0-9]{0,9})$' or coalesce(p_tax->>'preTaxAmountMinor','')!~'^(0|[1-9][0-9]{0,9})$'
  then raise exception 'video_reporting_tax_invalid';end if;
  if (p_tax->>'taxAmountMinor')::bigint+(p_tax->>'preTaxAmountMinor')::bigint<>o.amount_minor then raise exception 'video_reporting_tax_invalid';end if;
  tax_minor:=(p_tax->>'taxAmountMinor')::integer;pre_tax:=(p_tax->>'preTaxAmountMinor')::integer;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('google-external:paid_video:'||o.id,0));
 insert into private.google_play_external_transactions(binding_id,feature,quote_id) values(b.id,'paid_video',o.id)
 on conflict(feature,quote_id) do nothing;
 select * into t from private.google_play_external_transactions where feature='paid_video' and quote_id=o.id for update;
 if t.binding_id<>b.id or (t.transaction_time is not null and p_original_occurred_at is not null and t.transaction_time<>p_original_occurred_at)
 or (t.original_tax_minor is not null and tax_minor is not null and (t.original_tax_minor<>tax_minor or t.original_pre_tax_minor<>pre_tax))
 then raise exception 'video_reporting_history_conflict';end if;
 if p_refund_occurred_at<coalesce(t.transaction_time,p_original_occurred_at) then raise exception 'video_reporting_time_invalid';end if;
 update private.google_play_external_transactions set
  transaction_time=coalesce(transaction_time,p_original_occurred_at),
  original_tax_minor=coalesce(original_tax_minor,tax_minor),original_pre_tax_minor=coalesce(original_pre_tax_minor,pre_tax),
  remaining_tax_minor=case when original_tax_minor is null then tax_minor else remaining_tax_minor end,
  remaining_pre_tax_minor=case when original_pre_tax_minor is null then pre_tax else remaining_pre_tax_minor end
 where id=t.id returning * into t;
 -- Internal immutable observation keys are not forged Stripe webhook IDs.
 source_hash:=encode(extensions.digest(to_jsonb(paid)::text,'sha256'),'hex');
 insert into private.google_play_external_report_events(feature,quote_id,provider_event_id,payload_hash)
 values('paid_video',o.id,'stripe_video_observation:'||paid.id,source_hash) on conflict do nothing;
 job_state:=case when t.transaction_time is null then 'needs_review' when t.original_tax_minor is null then 'blocked_tax' else 'pending' end;
 job_reason:=case when t.transaction_time is null then 'verified_transaction_time_required' when t.original_tax_minor is null then 'verified_tax_provenance_required' end;
 insert into private.google_play_external_report_outbox(transaction_id,operation,occurred_at,state,reason)
 values(t.id,'create',coalesce(t.transaction_time,paid.received_at),job_state,job_reason)
 on conflict(transaction_id,operation,cumulative_refund_minor) do update set
  occurred_at=excluded.occurred_at,state=excluded.state,reason=excluded.reason,next_attempt_at=clock_timestamp()
 where private.google_play_external_report_outbox.state in('blocked_tax','needs_review')
 and private.google_play_external_report_outbox.lease_id is null;
 if p_refund_amount_minor>0 then
  select * into refund_job from private.google_play_external_report_outbox where transaction_id=t.id and operation='refund'
   and cumulative_refund_minor=p_refund_amount_minor for update;
  if refund_job.id is not null and refund_job.reason is distinct from 'verified_refund_time_required'
   and p_refund_occurred_at is not null and refund_job.occurred_at<>p_refund_occurred_at
  then raise exception 'video_reporting_history_conflict';end if;
  verified_refund_time:=case when refund_job.id is not null and refund_job.reason is distinct from 'verified_refund_time_required'
   then refund_job.occurred_at else p_refund_occurred_at end;
  if p_refund_amount_minor=o.amount_minor then target_pre_tax:=0;target_tax:=0;
  elsif t.original_tax_minor=0 then target_pre_tax:=o.amount_minor-p_refund_amount_minor;target_tax:=0;end if;
  job_state:=case when verified_refund_time is null then 'needs_review' when target_pre_tax is null then 'blocked_tax' else 'pending' end;
  job_reason:=case when verified_refund_time is null then 'verified_refund_time_required' when target_pre_tax is null then 'verified_refund_tax_provenance_required' end;
  insert into private.google_play_external_report_events(feature,quote_id,provider_event_id,payload_hash)
  values('paid_video',o.id,'stripe_video_observation:'||observed.id,encode(extensions.digest(to_jsonb(observed)::text,'sha256'),'hex')) on conflict do nothing;
  insert into private.google_play_external_report_outbox(transaction_id,operation,cumulative_refund_minor,occurred_at,target_pre_tax_minor,target_tax_minor,state,reason)
  values(t.id,'refund',p_refund_amount_minor,coalesce(verified_refund_time,observed.received_at),target_pre_tax,target_tax,job_state,job_reason)
  on conflict(transaction_id,operation,cumulative_refund_minor) do update set
   occurred_at=excluded.occurred_at,state=excluded.state,reason=excluded.reason,
   target_pre_tax_minor=excluded.target_pre_tax_minor,target_tax_minor=excluded.target_tax_minor,next_attempt_at=clock_timestamp()
  where private.google_play_external_report_outbox.state in('blocked_tax','needs_review')
  and private.google_play_external_report_outbox.lease_id is null;
 end if;
 -- reportingReady means evidence permits scheduling, NOT provider delivery.
 -- pending/leased/retry/unknown rows still need the reporter and verified
 -- Google acknowledgement; this RPC never marks an obligation reported.
 return jsonb_build_object('recorded',true,'transactionId',t.id,'observationId',observed.id,'financialAuthority',false,
  'reportingReady',not exists(select 1 from private.google_play_external_report_outbox where transaction_id=t.id and state in('blocked_tax','needs_review')));
end $$;
revoke all on function public.repair_stripe_video_google_reporting(uuid,text,text,integer,timestamptz,timestamptz,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.repair_stripe_video_google_reporting(uuid,text,text,integer,timestamptz,timestamptz,jsonb) to service_role;
