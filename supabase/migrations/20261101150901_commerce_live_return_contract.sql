-- Mode-compatible lifecycle evidence only; no refund or payout operation.
-- Canonical live events can be stored by the separately authenticated webhook
-- adapter. Existing rows are never relabeled or treated as live proof.
alter table public.stripe_merch_events drop constraint stripe_merch_events_environment_check;
alter table public.stripe_merch_events add constraint stripe_merch_events_environment_check check(environment in('sandbox','test','production'));
create or replace function private.guard_merch_return_evidence() returns trigger language plpgsql set search_path='' as $$
declare o public.merch_orders; prior private.merch_return_evidence;
begin
 if tg_op<>'INSERT' then raise exception 'merch_return_evidence_append_only'; end if;
 select * into strict o from public.merch_orders where id=new.order_id for update;
 if o.return_policy_version is null or o.return_policy_version not in ('physical_merch_verified_delivery_30d_v1','physical_merch_declared_tracked_30d_v2','physical_merch_declared_untracked_30d_v2')
  or o.environment not in ('sandbox','production') or o.provider<>'stripe_physical_goods' or new.observed_at>clock_timestamp()
  or (o.shipping_tracking_mode='untracked' and (new.delivered_at is not null or new.delivery_state<>'not_applicable'))
  or (o.shipping_tracking_mode is distinct from 'untracked' and (new.delivered_at is null or new.delivery_state='not_applicable'
   or new.delivered_at<o.created_at or new.delivered_at>new.observed_at))
 then raise exception 'merch_return_evidence_invalid'; end if;
 if o.environment='production' and (private.merch_verified_purchase_at(o.id) is null or not exists(
  select 1 from private.commerce_tax_checkout_bindings b where b.feature='physical_merch' and b.identity_id=o.id
   and b.environment=o.environment and b.product_id=o.product_id::text))
 then raise exception 'merch_live_purchase_evidence_required'; end if;
 select * into prior from private.merch_return_evidence where order_id=o.id order by id desc limit 1;
 if prior.id is not null and (new.delivered_at is distinct from prior.delivered_at or new.observed_at<prior.observed_at)
 then raise exception 'merch_return_evidence_identity_or_order_invalid'; end if;
 return new;
end;
$$;

create or replace function private.freeze_merch_return_case_protocol() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.return_case_protocol is distinct from old.return_case_protocol then raise exception 'merch_case_protocol_immutable'; end if;
 elsif new.provider='stripe_physical_goods' and new.environment in ('sandbox','production') then
  new.return_case_protocol:='app_merch_cases_v1';
 else new.return_case_protocol:=null;
 end if;
 return new;
end $$;

do $patch$ declare definition text; needle text; begin
 definition:=pg_get_functiondef('public.submit_merch_return_case(uuid,uuid,text,text)'::regprocedure);
 needle:='o.environment is distinct from ''sandbox''';
 if position(needle in definition)=0 then raise exception 'merch_case_mode_source_changed'; end if;
 execute replace(definition,needle,'coalesce(o.environment,'''') not in (''sandbox'',''production'')');
end; $patch$;
