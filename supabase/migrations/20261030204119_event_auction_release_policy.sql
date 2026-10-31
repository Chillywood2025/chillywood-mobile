-- Approved transfer maturity uses exact original promises and explicit buyer
-- accepted schedule revisions. D1-D4 protections are derived even if the buyer
-- has not opened the screen which materializes a refund-review remedy.
create function private.auction_event_agreed_policy(p_contract_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c private.auction_platform_settlement_contracts;e public.creator_events;i public.money_purchase_intents;
 terms jsonb;decision record;prior record;start_at timestamptz;end_at timestamptz;zone_name text;
 begin_at timestamptz;observed_from timestamptz;baseline integer:=0;accepted_id uuid;
begin
 select * into strict c from private.auction_platform_settlement_contracts where id=p_contract_id;
 if c.lane<>'event' then return jsonb_build_object('qualified',false,'reason','event_contract_required');end if;
 select * into strict i from public.money_purchase_intents where id=c.purchase_intent_id;
 select event.* into e from private.creator_event_auction_quotes q join private.creator_event_auctions a on a.id=q.auction_id
  join public.creator_events event on event.id=a.event_id where q.id=c.quote_id;
 terms:=private.auction_original_promise(c.id);
 if e.id is null or terms is null or e.status not in('ended','replay_available') or e.management_status='no_show'
  then return jsonb_build_object('qualified',false,'reason','event_not_fulfilled');end if;
 begin start_at:=(terms->>'startsAt')::timestamptz;end_at:=(terms->>'endsAt')::timestamptz;zone_name:=terms->>'timeZone';
 exception when invalid_datetime_format or datetime_field_overflow then return jsonb_build_object('qualified',false,'reason','original_schedule_unknown');end;
 if start_at is null or end_at is null or not isfinite(start_at) or not isfinite(end_at) or end_at<=start_at
  or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone_name)
 then return jsonb_build_object('qualified',false,'reason','original_schedule_unknown');end if;
 begin_at:=i.created_at;
 select started_at into strict observed_from from private.creator_event_ticket_policy_observation where singleton;
 if start_at<observed_from then return jsonb_build_object('qualified',false,'reason','historical_schedule_coverage_unknown');end if;
 for decision in select choice.created_at as choice_at,revision.* from private.creator_event_schedule_choices choice
  join private.creator_event_schedule_revisions revision on revision.id=choice.revision_id
  where choice.event_id=e.id and choice.buyer_id=c.buyer_id and choice.purchase_intent_id=i.id and choice.choice='keep_ticket'
  order by choice.created_at,choice.id
 loop
  if private.creator_event_no_show_due(start_at,private.creator_event_verified_start_at(e.id,start_at),decision.choice_at)
  then return jsonb_build_object('qualified',false,'reason','retained_no_show_review');end if;
  start_at:=decision.starts_at;end_at:=decision.ends_at;zone_name:=decision.time_zone;begin_at:=decision.choice_at;
  baseline:=decision.revision;accepted_id:=decision.id;
 end loop;
 if private.creator_event_no_show_due(start_at,private.creator_event_verified_start_at(e.id,start_at),clock_timestamp())
 then return jsonb_build_object('qualified',false,'reason','no_show_review');end if;
 for prior in select r.*,lag(r.starts_at) over(order by r.revision) previous_start,
  lag(r.time_zone) over(order by r.revision) previous_zone from private.creator_event_schedule_revisions r where r.event_id=e.id
 loop
  if prior.revision>baseline and prior.created_at>=begin_at and (
   private.creator_event_schedule_is_material(start_at,zone_name,prior.starts_at,prior.time_zone)
   or private.creator_event_schedule_is_material(prior.previous_start,prior.previous_zone,prior.starts_at,prior.time_zone))
  then return jsonb_build_object('qualified',false,'reason','unresolved_schedule_choice');end if;
 end loop;
 if private.creator_event_schedule_is_material(start_at,zone_name,e.starts_at,e.time_zone)
  or exists(select 1 from private.creator_event_schedule_choices choice where choice.purchase_intent_id=i.id and choice.choice='request_refund_review')
  or exists(select 1 from public.creator_event_purchase_remedies r where r.purchase_intent_id=i.id
    and (r.reason<>'material_schedule_change' or accepted_id is null))
 then return jsonb_build_object('qualified',false,'reason','unresolved_event_remedy');end if;
 return jsonb_build_object('qualified',true,'eventId',e.id,'acceptedRevisionId',accepted_id,
  'terms',terms||jsonb_build_object('startsAt',start_at,'endsAt',end_at,'timeZone',zone_name));
end;$$;
revoke all on function private.auction_event_agreed_policy(uuid) from public,anon,authenticated,service_role;

-- Preserve all original negative holds, but use the exact accepted-schedule
-- policy rather than permanently treating a subsequently accepted material
-- revision as unresolved. Historical no-show/cancellation/replay remedies stay.
do $patch$
declare definition text;needle text;replacement text;
begin
 definition:=pg_get_functiondef('private.auction_release_negative_holds(uuid)'::regprocedure);
 needle:='or exists(select 1 from public.creator_event_purchase_remedies r where r.purchase_intent_id=c.purchase_intent_id)';
 replacement:='or not coalesce((private.auction_event_agreed_policy(c.id)->>''qualified'')::boolean,false)';
 if position(needle in definition)=0 then raise exception 'auction_event_policy_patch_missing';end if;
 definition:=replace(definition,needle,replacement);
 needle:='or exists(select 1 from private.creator_event_ticket_notices n where n.event_id=v_event_id and n.buyer_id=c.buyer_id and n.kind=''schedule_changed''
    and not exists(select 1 from private.creator_event_schedule_choices choice where choice.purchase_intent_id=c.purchase_intent_id and choice.revision_id=n.revision_id and choice.choice=''keep_ticket''))';
 if position(needle in definition)=0 then raise exception 'auction_event_notice_policy_patch_missing';end if;
 execute replace(definition,needle,'');
 definition:=pg_get_functiondef('private.auction_release_mature(uuid,uuid)'::regprocedure);
 needle:='if c.lane=''room'' then';
 replacement:='if c.lane=''event'' then
  if not coalesce((private.auction_event_agreed_policy(c.id)->>''qualified'')::boolean,false) then return false;end if;
  terms:=private.auction_event_agreed_policy(c.id)->''terms'';
  if not coalesce((private.creator_event_verified_coverage((private.auction_event_agreed_policy(c.id)->>''eventId'')::uuid,terms)->>''full_original_interval'')::boolean,false)
  then return false;end if;
 end if;
 if c.lane=''room'' then';
 if position(needle in definition)=0 then raise exception 'auction_event_maturity_patch_missing';end if;
 execute replace(definition,needle,replacement);
end;$patch$;
alter function private.auction_release_mature(uuid,uuid) volatile;

create function public.qualify_auction_event_release_from_domain(p_contract_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.auction_platform_settlement_contracts;a private.auction_held_net_allocations;
 v private.auction_platform_qualifications;e private.auction_release_evidence;policy jsonb;coverage jsonb;fulfilled timestamptz;
 original jsonb;h text;expiry timestamptz;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into strict c from private.auction_platform_settlement_contracts where id=p_contract_id for update;
 if c.lane<>'event' or private.auction_release_negative_holds(c.id)
  or not exists(select 1 from public.money_purchase_intents where id=c.purchase_intent_id and status='consumed')
 then return jsonb_build_object('status','held','reason','objective_fulfillment_unproved');end if;
 policy:=private.auction_event_agreed_policy(c.id);original:=private.auction_original_promise(c.id);
 coverage:=private.creator_event_verified_coverage((policy->>'eventId')::uuid,policy->'terms');
 if not coalesce((coverage->>'evidence_available')::boolean,false)
  or not coalesce((coverage->>'full_original_interval')::boolean,false)
  or coverage->>'coverage_kind' is distinct from 'provider_recorded_output_interval'
 then return jsonb_build_object('status','held','reason','provider_coverage_unproved');end if;
 fulfilled:=(coverage->>'provider_ended_at')::timestamptz;
 if original->>'replayPolicy'='until_expiration' then
  expiry:=(original->>'replayExpiresAt')::timestamptz;
  if expiry is null or not isfinite(expiry) or expiry>clock_timestamp() then return jsonb_build_object('status','held','reason','replay_period_open');end if;
  fulfilled:=greatest(fulfilled,expiry);
 elsif original->>'replayPolicy' is distinct from 'none' then return jsonb_build_object('status','held','reason','replay_expiry_unknown');end if;
 if fulfilled is null or not isfinite(fulfilled) or fulfilled>clock_timestamp()
 then return jsonb_build_object('status','held','reason','fulfillment_time_unproved');end if;
 select * into a from private.auction_held_net_allocations where contract_id=c.id order by id desc limit 1;
 if a.id is null or a.creator_minor is null or a.creator_minor<=0
  or a.hold_reasons && array['tax_unverified','store_obligation_unverified','refund_adjustment_unverified','provider_balance_pending','payment_or_dispute_reconciliation']
 then return jsonb_build_object('status','held','reason','verified_available_net_required');end if;
 select * into v from private.auction_platform_qualifications where capability_id=c.capability_id order by verified_at desc,id desc limit 1;
 h:=encode(extensions.digest(private.auction_release_domain_facts(c.id)::text,'sha256'),'hex');
 insert into private.auction_release_evidence(contract_id,allocation_id,policy_version,issuer_evidence_reference,domain_facts_hash,promise_hash,
  fulfilled_at,qualified_at,expires_at,environment)
 values(c.id,a.id,'auction_fulfilled_replay_expired_available_no_open_issue_v1',coverage->>'evidence_reference',h,
  encode(extensions.digest(original::text,'sha256'),'hex'),fulfilled,clock_timestamp(),v.expires_at,'test') returning * into e;
 -- Atomic rollback of provisional evidence if replay coverage or exact agreed
 -- maturity is not proved. Never return qualified evidence with an open hold.
 if not private.auction_release_mature(c.id,e.id) then raise exception 'event_replay_or_maturity_unproved';end if;
 return jsonb_build_object('status','qualified_test_only','releaseEvidenceId',e.id,'financialAuthority',false);
end;$$;
revoke all on function public.qualify_auction_event_release_from_domain(uuid) from public,anon,authenticated,service_role;
grant execute on function public.qualify_auction_event_release_from_domain(uuid) to service_role;

-- Late UNKNOWN/FAILED/contradictory provider evidence cannot remain invisible
-- to a previously qualified outbox. The source provider writer locks event
-- before this operation lock, matching dispatch's domain-first lock order.
create function private.hold_auction_transfer_on_event_coverage_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_event_id uuid;
begin
 if tg_table_name='creator_event_provider_coverage_receipts' then v_event_id:=new.event_id;
 else select creator_event_id into v_event_id from private.creator_event_broadcast_attempts where id=new.attempt_id;end if;
 update private.auction_transfer_operations o set recovery_required=true,
  state=case when o.state in('reserved','canceled') then 'canceled' else 'reconciliation_required' end
 from private.auction_platform_settlement_contracts c,private.creator_event_auction_quotes q,private.creator_event_auctions a
 where o.contract_id=c.id and c.lane='event' and c.quote_id=q.id and q.auction_id=a.id and a.event_id=v_event_id
  and not private.auction_release_mature(c.id,o.release_evidence_id);
 return new;
end;$$;
revoke all on function private.hold_auction_transfer_on_event_coverage_change() from public,anon,authenticated,service_role;
create trigger hold_auction_transfer_on_event_coverage_change after insert on private.creator_event_provider_coverage_receipts
 for each row execute function private.hold_auction_transfer_on_event_coverage_change();
create trigger hold_auction_transfer_on_event_raw_receipt_change after insert on private.creator_event_broadcast_provider_receipts
 for each row execute function private.hold_auction_transfer_on_event_coverage_change();
