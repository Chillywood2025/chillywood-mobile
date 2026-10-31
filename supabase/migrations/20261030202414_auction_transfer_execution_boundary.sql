-- TEST-ONLY downstream execution boundary. No release evidence is seeded and
-- no API can mint it. Approved timing: fulfilled, included replay expired,
-- Stripe funds available and no unresolved refund/dispute/non-delivery issue.
-- This is not an operational release issuer or a payout API.
create table private.auction_release_evidence (
 id uuid primary key default gen_random_uuid(),
 contract_id uuid not null references private.auction_platform_settlement_contracts(id),
 allocation_id bigint not null references private.auction_held_net_allocations(id),
 policy_version text not null, issuer_evidence_reference text not null,
 domain_facts_hash text not null check(domain_facts_hash ~ '^[0-9a-f]{64}$'),
 promise_hash text not null check(promise_hash ~ '^[0-9a-f]{64}$'),
 fulfilled_at timestamptz not null check(isfinite(fulfilled_at)),
 qualified_at timestamptz not null, expires_at timestamptz not null,
 revoked_at timestamptz, environment text not null check(environment='test'),
 check(length(btrim(policy_version))>0 and length(btrim(issuer_evidence_reference))>0),
 check(isfinite(qualified_at) and isfinite(expires_at) and expires_at>qualified_at and qualified_at>=fulfilled_at)
);
create table private.auction_release_observation_epoch (
 singleton boolean primary key default true check(singleton),started_at timestamptz not null default clock_timestamp()
);
insert into private.auction_release_observation_epoch(singleton) values(true);
create table private.auction_room_delivery_issues (
 id bigint generated always as identity primary key,claim_id uuid not null references private.creator_room_seat_claims(id),
 reason text not null check(reason='membership_removed'),observed_at timestamptz not null default clock_timestamp()
);
create table private.auction_transfer_operations (
 id uuid primary key default gen_random_uuid(),
 contract_id uuid not null references private.auction_platform_settlement_contracts(id),
 allocation_id bigint not null references private.auction_held_net_allocations(id),
 release_evidence_id uuid not null references private.auction_release_evidence(id),
 kind text not null check(kind='transfer'),
 platform_account_id text not null, destination text not null, source_charge_id text not null,
 amount_minor bigint not null check(amount_minor>0),currency text not null check(currency='usd'),
 transfer_group text not null unique,idempotency_key text not null unique,
 state text not null default 'reserved' check(state in('reserved','unknown','confirmed','canceled','reconciliation_required')),
 provider_transfer_id text,dispatch_token uuid,dispatched_at timestamptz,
 recovery_required boolean not null default false,
 environment text not null default 'test' check(environment='test'),
 created_at timestamptz not null default clock_timestamp(),unique(contract_id),
 unique(platform_account_id,provider_transfer_id)
);
create table private.auction_transfer_result_observations (
 id bigint generated always as identity primary key,
 operation_id uuid not null references private.auction_transfer_operations(id),
 evidence jsonb not null,observed_at timestamptz not null default clock_timestamp(),
 unique(operation_id,evidence)
);
do $ddl$ declare t text;begin
 foreach t in array array['auction_release_evidence','auction_transfer_operations','auction_transfer_result_observations','auction_release_observation_epoch','auction_room_delivery_issues'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end;$ddl$;
create trigger auction_release_evidence_immutable before update on private.auction_release_evidence
 for each row execute function private.guard_creator_external_payment_evidence();
create trigger auction_transfer_result_immutable before update or delete on private.auction_transfer_result_observations
 for each row execute function private.guard_event_ticket_terms_immutable();
create trigger auction_release_evidence_no_delete before delete on private.auction_release_evidence
 for each row execute function private.guard_event_ticket_terms_immutable();
create function private.guard_auction_transfer_operation() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'auction_transfer_operation_immutable';end if;
 if (to_jsonb(new)-array['state','provider_transfer_id','dispatch_token','dispatched_at','recovery_required'])
   is distinct from (to_jsonb(old)-array['state','provider_transfer_id','dispatch_token','dispatched_at','recovery_required'])
  or (old.recovery_required and not new.recovery_required)
  or (old.provider_transfer_id is not null and old.provider_transfer_id is distinct from new.provider_transfer_id)
  or (old.dispatch_token is not null and row(new.dispatch_token,new.dispatched_at) is distinct from row(old.dispatch_token,old.dispatched_at))
  or (old.state<>'reserved' and new.state='reserved') or (old.state='canceled' and new.state<>'canceled')
 then raise exception 'auction_transfer_operation_immutable';end if;return new;
end;$$;
revoke all on function private.guard_auction_transfer_operation() from public,anon,authenticated,service_role;
create trigger auction_transfer_operation_immutable before update or delete on private.auction_transfer_operations
 for each row execute function private.guard_auction_transfer_operation();
create trigger auction_release_epoch_immutable before update or delete on private.auction_release_observation_epoch
 for each row execute function private.guard_event_ticket_terms_immutable();
create trigger auction_room_delivery_issue_immutable before update or delete on private.auction_room_delivery_issues
 for each row execute function private.guard_event_ticket_terms_immutable();
create function private.observe_auction_room_delivery_issue() returns trigger
language plpgsql security definer set search_path='' as $$
declare party text;buyer text;
begin
 party:=coalesce(new.party_id,old.party_id);buyer:=coalesce(new.user_id,old.user_id);
 if tg_op='DELETE' or new.membership_state='removed' then
  insert into private.auction_room_delivery_issues(claim_id,reason)
   select c.id,'membership_removed' from private.creator_room_seat_claims c join private.creator_room_sessions s on s.id=c.room_session_id
   where c.party_id=party and c.buyer_id::text=buyer and c.paid_at is not null and s.ended_at is null;
 end if;return coalesce(new,old);
end;$$;
revoke all on function private.observe_auction_room_delivery_issue() from public,anon,authenticated,service_role;
create trigger observe_auction_room_delivery_issue after insert or update of membership_state or delete on public.watch_party_room_memberships
 for each row execute function private.observe_auction_room_delivery_issue();

-- Snapshot only authoritative domain facts. A future issuer must understand
-- original/accepted schedule terms and durable remedies; status alone is not
-- delivery. Exact evidence is invalidated by changed domain facts.
create function private.auction_release_domain_facts(p_contract_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c private.auction_platform_settlement_contracts;i public.money_purchase_intents;facts jsonb;
begin
 select * into strict c from private.auction_platform_settlement_contracts where id=p_contract_id;
 select * into strict i from public.money_purchase_intents where id=c.purchase_intent_id;
 if c.lane='event' then
  select jsonb_build_object('event',to_jsonb(e),'quote',to_jsonb(q),
   'scheduleRevisions',coalesce((select jsonb_agg(to_jsonb(r) order by r.revision) from private.creator_event_schedule_revisions r where r.event_id=e.id),'[]'::jsonb),
   'scheduleChoices',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at,r.id) from private.creator_event_schedule_choices r where r.purchase_intent_id=c.purchase_intent_id),'[]'::jsonb),
   'verifiedStarts',coalesce((select jsonb_agg(to_jsonb(r) order by r.verified_at,r.attempt_id) from private.creator_event_verified_start_facts r where r.event_id=e.id),'[]'::jsonb),
   'remedies',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.creator_event_purchase_remedies r
    where r.purchase_intent_id=c.purchase_intent_id),'[]'::jsonb),
   'replayFacts',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from private.creator_event_replay_availability_facts r
    where r.event_id=e.id),'[]'::jsonb)) into facts
  from private.creator_event_auction_quotes q join private.creator_event_auctions auction on auction.id=q.auction_id
   join public.creator_events e on e.id=auction.event_id where q.id=c.quote_id;
 else
  select jsonb_build_object('claim',to_jsonb(s),'session',to_jsonb(r),
   'deliveryIssues',coalesce((select jsonb_agg(to_jsonb(issue) order by issue.id) from private.auction_room_delivery_issues issue where issue.claim_id=s.id),'[]'::jsonb)) into facts
  from private.creator_room_seat_claims s join private.creator_room_sessions r on r.id=s.room_session_id
  where s.purchase_intent_id=c.purchase_intent_id;
 end if;
 return jsonb_build_object('intentStatus',i.status,'domain',facts);
end;$$;
revoke all on function private.auction_release_domain_facts(uuid) from public,anon,authenticated,service_role;

create function private.auction_release_negative_holds(p_contract_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare c private.auction_platform_settlement_contracts;v private.auction_platform_qualifications;v_event_id uuid;
begin
 select * into strict c from private.auction_platform_settlement_contracts where id=p_contract_id;
 select * into v from private.auction_platform_qualifications where capability_id=c.capability_id order by verified_at desc,id desc limit 1;
 if v.id is null or not v.enabled or v.revoked_at is not null or v.verified_at>clock_timestamp() or v.expires_at<=clock_timestamp()
  or row(v.platform_account_id,v.recipient_account_id,v.platform_product_id) is distinct from row(c.platform_account_id,c.recipient_account_id,c.platform_product_id)
  or not exists(select 1 from public.creator_payout_accounts account join public.creator_payout_eligibility_records r on r.payout_account_id=account.id
   where account.creator_user_id=c.creator_id::text and account.provider='stripe_connect' and account.provider_environment='test'
    and account.provider_account_id=c.recipient_account_id and account.provider_configuration_status='match'
    and account.provider_configuration_account_id=c.recipient_account_id and account.payouts_enabled
    and r.provider_ready and r.kyc_ready and r.payout_account_ready and not r.fraud_hold_active
    and r.admin_review_status not in('pending_review','rejected','on_hold') and r.eligibility_status<>'on_hold')
 then return true;end if;
 if c.lane='event' then
  select a.event_id into v_event_id from private.creator_event_auction_quotes q join private.creator_event_auctions a on a.id=q.auction_id where q.id=c.quote_id;
  return not exists(select 1 from public.creator_events e where e.id=v_event_id and e.status in('ended','replay_available') and e.management_status is distinct from 'no_show')
   or not exists(select 1 from private.creator_event_verified_start_facts f where f.event_id=v_event_id)
   or exists(select 1 from public.creator_event_purchase_remedies r where r.purchase_intent_id=c.purchase_intent_id)
   or exists(select 1 from private.creator_event_ticket_notices n where n.event_id=v_event_id and n.buyer_id=c.buyer_id and n.kind='schedule_changed'
    and not exists(select 1 from private.creator_event_schedule_choices choice where choice.purchase_intent_id=c.purchase_intent_id and choice.revision_id=n.revision_id and choice.choice='keep_ticket'))
   or exists(select 1 from private.creator_event_schedule_choices s where s.purchase_intent_id=c.purchase_intent_id and s.choice='request_refund_review');
 end if;
 return not exists(select 1 from private.creator_room_seat_claims s join private.creator_room_sessions r on r.id=s.room_session_id
  where s.purchase_intent_id=c.purchase_intent_id and s.availability_confirmed_at is not null and s.state='ended'
   and r.ended_at is not null and r.end_reason='creator_ended_room' and not s.refund_review_eligible
   and s.paid_at>=(select started_at from private.auction_release_observation_epoch where singleton)
   and not exists(select 1 from private.auction_room_delivery_issues issue where issue.claim_id=s.id));
end;$$;
revoke all on function private.auction_release_negative_holds(uuid) from public,anon,authenticated,service_role;

create function private.auction_original_promise(p_contract_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c private.auction_platform_settlement_contracts;terms jsonb;
begin
 select * into strict c from private.auction_platform_settlement_contracts where id=p_contract_id;
 if c.lane='event' then
  select v.terms into terms from public.money_purchase_intents i
   join public.creator_event_offer_revisions v on v.id=i.event_terms_revision_id where i.id=c.purchase_intent_id;
 else
  select jsonb_build_object('roomSessionId',s.room_session_id,'partyId',s.party_id,'sourceKind',s.source_kind,
   'auctionId',s.auction_id,'buyerId',s.buyer_id,'purchaseIntentId',s.purchase_intent_id,'replayPolicy','none') into terms
  from private.creator_room_seat_claims s where s.purchase_intent_id=c.purchase_intent_id;
 end if;
 return terms;
end;$$;
revoke all on function private.auction_original_promise(uuid) from public,anon,authenticated,service_role;

create function private.auction_release_mature(p_contract_id uuid,p_evidence_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare c private.auction_platform_settlement_contracts;e private.auction_release_evidence;
 terms jsonb;ends_at timestamptz;deadline timestamptz;expiry timestamptz;v_event_id uuid;
begin
 select * into strict c from private.auction_platform_settlement_contracts where id=p_contract_id;
 select * into e from private.auction_release_evidence where id=p_evidence_id and contract_id=c.id;
 terms:=private.auction_original_promise(c.id);
 if terms is null or e.id is null or e.fulfilled_at>clock_timestamp()
  or e.policy_version<>'auction_fulfilled_replay_expired_available_no_open_issue_v1'
  or e.promise_hash<>encode(extensions.digest(terms::text,'sha256'),'hex') then return false;end if;
 if c.lane='room' then
  return exists(select 1 from private.creator_room_seat_claims s join private.creator_room_sessions r on r.id=s.room_session_id
   where s.purchase_intent_id=c.purchase_intent_id and r.ended_at<=e.fulfilled_at and s.availability_confirmed_at<=e.fulfilled_at);
 end if;
 begin ends_at:=(terms->>'endsAt')::timestamptz;
 exception when invalid_datetime_format or datetime_field_overflow then return false;end;
 if ends_at is null or not isfinite(ends_at) or ends_at>clock_timestamp() or e.fulfilled_at<ends_at then return false;end if;
 if terms->>'replayPolicy'='none' then return true;end if;
 -- Indefinite or historical ambiguous replay cannot acquire an invented end.
 if terms->>'replayPolicy' is distinct from 'until_expiration' then return false;end if;
 begin deadline:=(terms->>'replayAvailableAt')::timestamptz;expiry:=(terms->>'replayExpiresAt')::timestamptz;
 exception when invalid_datetime_format or datetime_field_overflow then return false;end;
 if deadline is null or expiry is null or not isfinite(deadline) or not isfinite(expiry)
  or deadline<ends_at or expiry<=deadline or expiry>clock_timestamp() or e.fulfilled_at<expiry then return false;end if;
 select a.event_id into v_event_id from private.creator_event_auction_quotes q join private.creator_event_auctions a on a.id=q.auction_id where q.id=c.quote_id;
 if not coalesce((select f.available from private.creator_event_replay_availability_facts f
   where f.event_id=v_event_id and f.observed_at<=deadline order by f.observed_at desc,f.id desc limit 1),false)
  or exists(select 1 from private.creator_event_replay_availability_facts f where f.event_id=v_event_id and f.observed_at>=deadline and f.observed_at<expiry and not f.available)
 then return false;end if;
 return true;
end;$$;
revoke all on function private.auction_release_mature(uuid,uuid) from public,anon,authenticated,service_role;

-- Narrow objective room issuer: caller supplies only contract identity. No
-- caller-provided completion boolean, timestamp, amount or cleared issue.
-- The paid spot was independently made available by the original buyer's
-- authenticated action; session-specific rejoin rights persisted until normal
-- creator closure with no observed removal/nondelivery. Media use/satisfaction
-- is not promised and is not a new criterion here.
create function public.qualify_auction_room_release_from_domain(p_contract_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.auction_platform_settlement_contracts;a private.auction_held_net_allocations;
 v private.auction_platform_qualifications;e private.auction_release_evidence;fulfilled timestamptz;h text;promise jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into strict c from private.auction_platform_settlement_contracts where id=p_contract_id for update;
 if c.lane<>'room' or private.auction_release_negative_holds(c.id)
  or not exists(select 1 from public.money_purchase_intents where id=c.purchase_intent_id and status='consumed')
 then return jsonb_build_object('status','held','reason','objective_fulfillment_unproved');end if;
 select * into a from private.auction_held_net_allocations where contract_id=c.id order by id desc limit 1;
 if a.id is null or a.creator_minor is null or a.creator_minor<=0
  or a.hold_reasons && array['tax_unverified','store_obligation_unverified','refund_adjustment_unverified','provider_balance_pending','payment_or_dispute_reconciliation']
 then return jsonb_build_object('status','held','reason','verified_available_net_required');end if;
 select * into v from private.auction_platform_qualifications where capability_id=c.capability_id order by verified_at desc,id desc limit 1;
 select r.ended_at into fulfilled from private.creator_room_seat_claims s join private.creator_room_sessions r on r.id=s.room_session_id where s.purchase_intent_id=c.purchase_intent_id;
 h:=encode(extensions.digest(private.auction_release_domain_facts(c.id)::text,'sha256'),'hex');promise:=private.auction_original_promise(c.id);
 select * into e from private.auction_release_evidence where contract_id=c.id and allocation_id=a.id and domain_facts_hash=h
  and policy_version='auction_fulfilled_replay_expired_available_no_open_issue_v1' and revoked_at is null and expires_at>clock_timestamp() order by qualified_at desc,id desc limit 1;
 if e.id is null then
  insert into private.auction_release_evidence(contract_id,allocation_id,policy_version,issuer_evidence_reference,domain_facts_hash,promise_hash,
   fulfilled_at,qualified_at,expires_at,environment)
  values(c.id,a.id,'auction_fulfilled_replay_expired_available_no_open_issue_v1','room_domain_v1:'||c.purchase_intent_id,h,
   encode(extensions.digest(promise::text,'sha256'),'hex'),fulfilled,clock_timestamp(),v.expires_at,'test') returning * into e;
 end if;
 return jsonb_build_object('status','qualified_test_only','releaseEvidenceId',e.id,'financialAuthority',false);
end;$$;
revoke all on function public.qualify_auction_room_release_from_domain(uuid) from public,anon,authenticated,service_role;
grant execute on function public.qualify_auction_room_release_from_domain(uuid) to service_role;

create function public.reserve_auction_test_transfer(p_contract_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.auction_platform_settlement_contracts;a private.auction_held_net_allocations;
 e private.auction_release_evidence;v private.auction_platform_qualifications;o private.auction_transfer_operations;
 facts jsonb;domain jsonb;status text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into strict c from private.auction_platform_settlement_contracts where id=p_contract_id for update;
 select i.status into status from public.money_purchase_intents i where id=c.purchase_intent_id for update;
 select * into o from private.auction_transfer_operations where contract_id=c.id;
 if o.id is not null then return jsonb_build_object('status',o.state,'operationId',o.id,'dispatchAuthorized',false);end if;
 select * into a from private.auction_held_net_allocations where contract_id=c.id order by id desc limit 1;
 select * into e from private.auction_release_evidence where contract_id=c.id order by qualified_at desc,id desc limit 1 for share;
 domain:=private.auction_release_domain_facts(c.id);
 if status<>'consumed' or private.auction_release_negative_holds(c.id) or a.id is null or a.creator_minor is null or a.creator_minor<=0
  or a.hold_reasons && array['tax_unverified','store_obligation_unverified','refund_adjustment_unverified','provider_balance_pending','payment_or_dispute_reconciliation']
  or e.id is null or e.allocation_id<>a.id or e.revoked_at is not null or e.qualified_at>clock_timestamp() or e.expires_at<=clock_timestamp()
  or e.domain_facts_hash<>encode(extensions.digest(domain::text,'sha256'),'hex')
  or not private.auction_release_mature(c.id,e.id)
 then return jsonb_build_object('status','held','reason','qualified_release_evidence_required','dispatchAuthorized',false);end if;
 -- Positive fulfillment evidence still requires a qualified issuer: no API
 -- lets a service caller declare fulfillment or clear all open issues.
 select * into v from private.auction_platform_qualifications where capability_id=c.capability_id order by verified_at desc,id desc limit 1 for share;
 if v.id is null or not v.enabled or v.revoked_at is not null or v.expires_at<=clock_timestamp() or v.verified_at>clock_timestamp()
  or row(v.platform_account_id,v.recipient_account_id,v.platform_product_id) is distinct from row(c.platform_account_id,c.recipient_account_id,c.platform_product_id)
 then return jsonb_build_object('status','held','reason','recipient_requalification_required','dispatchAuthorized',false);end if;
 select f.facts into facts from private.auction_settlement_observations f where id=a.observation_id;
 insert into private.auction_transfer_operations(contract_id,allocation_id,release_evidence_id,kind,platform_account_id,destination,
  source_charge_id,amount_minor,currency,transfer_group,idempotency_key)
 values(c.id,a.id,e.id,'transfer',c.platform_account_id,c.recipient_account_id,facts->>'charge_id',a.creator_minor,c.currency,
  'auction-contract-'||c.id,'auction-transfer-v1-'||c.id) returning * into o;
 return jsonb_build_object('status','reserved','operationId',o.id,'dispatchAuthorized',false);
end;$$;
revoke all on function public.reserve_auction_test_transfer(uuid) from public,anon,authenticated,service_role;
grant execute on function public.reserve_auction_test_transfer(uuid) to service_role;

-- Before network dispatch, consume the sole permit durably. A crash/timeout
-- stays unknown forever until exact GET evidence is found; never POST again.
create function public.claim_auction_test_transfer_dispatch(p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o private.auction_transfer_operations;c private.auction_platform_settlement_contracts;e private.auction_release_evidence;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into strict o from private.auction_transfer_operations where id=p_operation_id;
 select * into strict c from private.auction_platform_settlement_contracts where id=o.contract_id;
 perform 1 from public.money_purchase_intents where id=c.purchase_intent_id for update;
 select * into strict o from private.auction_transfer_operations where id=p_operation_id for update;
 select * into strict e from private.auction_release_evidence where id=o.release_evidence_id for share;
 if o.state<>'reserved' then return jsonb_build_object('status',o.state,'dispatchAuthorized',false);end if;
 if not exists(select 1 from public.money_purchase_intents where id=c.purchase_intent_id and status='consumed')
  or private.auction_release_negative_holds(c.id)
  or not private.auction_release_mature(c.id,e.id)
  or e.revoked_at is not null or e.expires_at<=clock_timestamp()
  or e.domain_facts_hash<>encode(extensions.digest(private.auction_release_domain_facts(c.id)::text,'sha256'),'hex')
  or o.allocation_id is distinct from (select id from private.auction_held_net_allocations where contract_id=c.id order by id desc limit 1)
 then update private.auction_transfer_operations set state='canceled' where id=o.id;
  return jsonb_build_object('status','canceled','dispatchAuthorized',false);end if;
 update private.auction_transfer_operations set state='unknown',dispatch_token=gen_random_uuid(),dispatched_at=clock_timestamp()
  where id=o.id returning * into o;
 return to_jsonb(o)||jsonb_build_object('dispatchAuthorized',true,'financialAuthority',false);
end;$$;
revoke all on function public.claim_auction_test_transfer_dispatch(uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_auction_test_transfer_dispatch(uuid) to service_role;

create function public.read_auction_test_transfer_operation(p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 return (select to_jsonb(o)||jsonb_build_object('dispatchAuthorized',false,'financialAuthority',false)
  from private.auction_transfer_operations o where id=p_operation_id);
end;$$;
revoke all on function public.read_auction_test_transfer_operation(uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_auction_test_transfer_operation(uuid) to service_role;

create function public.record_auction_test_transfer_result(p_operation_id uuid,p_evidence jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o private.auction_transfer_operations;v_id text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into strict o from private.auction_transfer_operations where id=p_operation_id for update;
 if o.state not in('unknown','confirmed','reconciliation_required') then raise exception 'transfer_not_dispatched';end if;
 if not coalesce(p_evidence->>'object'='transfer' and p_evidence->>'id' ~ '^tr_[A-Za-z0-9]+$'
  and p_evidence->'livemode'='false'::jsonb and p_evidence->>'platform_account_id'=o.platform_account_id
  and p_evidence->>'destination'=o.destination and p_evidence->>'source_transaction'=o.source_charge_id
  and p_evidence->'amount'=to_jsonb(o.amount_minor) and p_evidence->>'currency'=o.currency
  and p_evidence->>'transfer_group'=o.transfer_group and p_evidence->'metadata'->>'auction_operation_id'=o.id::text
  and p_evidence->'metadata'->>'auction_contract_id'=o.contract_id::text
  and jsonb_typeof(p_evidence->'amount_reversed')='number'
  and p_evidence->>'amount_reversed' ~ '^[0-9]{1,10}$',false)
 then raise exception 'transfer_evidence_mismatch';end if;
 v_id:=p_evidence->>'id';
 if private.auction_release_negative_holds(o.contract_id)
  or o.allocation_id is distinct from (select id from private.auction_held_net_allocations where contract_id=o.contract_id order by id desc limit 1)
  or exists(select 1 from private.auction_release_evidence e where e.id=o.release_evidence_id and
   (e.revoked_at is not null or e.domain_facts_hash<>encode(extensions.digest(private.auction_release_domain_facts(o.contract_id)::text,'sha256'),'hex')))
 then o.recovery_required:=true;end if;
 if o.provider_transfer_id is not null and o.provider_transfer_id<>v_id then raise exception 'transfer_identity_changed';end if;
 if (p_evidence->>'amount_reversed')::bigint>o.amount_minor then raise exception 'transfer_reversal_amount_invalid';end if;
 if (p_evidence->>'amount_reversed')::bigint<coalesce((select max((r.evidence->>'amount_reversed')::bigint)
  from private.auction_transfer_result_observations r where r.operation_id=o.id and r.evidence->>'object'='transfer'),0)
 then raise exception 'transfer_reversal_observation_stale';end if;
 insert into private.auction_transfer_result_observations(operation_id,evidence) values(o.id,p_evidence) on conflict do nothing;
 update private.auction_transfer_operations set provider_transfer_id=v_id,recovery_required=o.recovery_required,
  state=case when recovery_required or (p_evidence->>'amount_reversed')::bigint>0 then 'reconciliation_required' else 'confirmed' end where id=o.id;
 return jsonb_build_object('status',case when o.recovery_required or (p_evidence->>'amount_reversed')::bigint>0 then 'reconciliation_required' else 'confirmed' end,
  'operationId',o.id,'financialAuthority',false);
end;$$;
revoke all on function public.record_auction_test_transfer_result(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_auction_test_transfer_result(uuid,jsonb) to service_role;

-- Payment-terminal races never discard the already-dispatched obligation.
create function private.hold_auction_transfer_on_payment_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from 'consumed' then
  update private.auction_transfer_operations o set recovery_required=true,
   state=case when o.state in('reserved','canceled') then 'canceled' else 'reconciliation_required' end
  from private.auction_platform_settlement_contracts c where c.purchase_intent_id=new.id and o.contract_id=c.id;
 end if;return new;
end;$$;
revoke all on function private.hold_auction_transfer_on_payment_change() from public,anon,authenticated,service_role;
create trigger hold_auction_transfer_on_payment_change after update of status on public.money_purchase_intents
 for each row execute function private.hold_auction_transfer_on_payment_change();

create function private.hold_auction_transfer_on_cost_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update private.auction_transfer_operations set recovery_required=true,
  state=case when state in('reserved','canceled') then 'canceled' else 'reconciliation_required' end
 where contract_id=new.contract_id and allocation_id<>new.id;
 return new;
end;$$;
revoke all on function private.hold_auction_transfer_on_cost_change() from public,anon,authenticated,service_role;
create trigger hold_auction_transfer_on_cost_change after insert on private.auction_held_net_allocations
 for each row execute function private.hold_auction_transfer_on_cost_change();

-- Independently qualified recovery evidence specifies NET recovery amount,
-- never a guessed percentage of buyer gross refund. No operational issuer is
-- installed. Multiple refund/reversal outcomes remain separately traceable.
create table private.auction_reversal_evidence (
 id uuid primary key default gen_random_uuid(),operation_id uuid not null references private.auction_transfer_operations(id),
 amount_minor bigint not null check(amount_minor>0),evidence_reference text not null check(length(btrim(evidence_reference))>0),
 policy_version text not null check(policy_version='synthetic_auction_reversal_test_v1'),
 qualified_at timestamptz not null,expires_at timestamptz not null,revoked_at timestamptz,
 check(isfinite(qualified_at) and isfinite(expires_at) and expires_at>qualified_at)
);
create table private.auction_reversal_operations (
 id uuid primary key default gen_random_uuid(),transfer_operation_id uuid not null references private.auction_transfer_operations(id),
 evidence_id uuid not null unique references private.auction_reversal_evidence(id),amount_minor bigint not null check(amount_minor>0),
 state text not null default 'reserved' check(state in('reserved','unknown','confirmed','canceled')),
 provider_reversal_id text unique,created_at timestamptz not null default clock_timestamp(),dispatched_at timestamptz
);
do $ddl$ declare t text;begin
 foreach t in array array['auction_reversal_evidence','auction_reversal_operations'] loop
  execute format('alter table private.%I enable row level security',t);execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end;$ddl$;
create trigger auction_reversal_evidence_immutable before update on private.auction_reversal_evidence
 for each row execute function private.guard_creator_external_payment_evidence();
create trigger auction_reversal_evidence_no_delete before delete on private.auction_reversal_evidence
 for each row execute function private.guard_event_ticket_terms_immutable();
create function private.guard_auction_reversal_operation() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'auction_reversal_operation_immutable';end if;
 if (to_jsonb(new)-array['state','provider_reversal_id','dispatched_at'])
   is distinct from (to_jsonb(old)-array['state','provider_reversal_id','dispatched_at'])
  or (old.provider_reversal_id is not null and old.provider_reversal_id is distinct from new.provider_reversal_id)
  or (old.dispatched_at is not null and old.dispatched_at is distinct from new.dispatched_at)
  or (old.state<>'reserved' and new.state='reserved') or (old.state='canceled' and new.state<>'canceled')
 then raise exception 'auction_reversal_operation_immutable';end if;return new;
end;$$;
revoke all on function private.guard_auction_reversal_operation() from public,anon,authenticated,service_role;
create trigger auction_reversal_operation_immutable before update or delete on private.auction_reversal_operations
 for each row execute function private.guard_auction_reversal_operation();

create function public.reserve_auction_test_reversal(p_evidence_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.auction_reversal_evidence;o private.auction_transfer_operations;r private.auction_reversal_operations;reserved bigint;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into strict e from private.auction_reversal_evidence where id=p_evidence_id for share;
 select * into strict o from private.auction_transfer_operations where id=e.operation_id for update;
 select * into r from private.auction_reversal_operations where evidence_id=e.id;
 if r.id is not null then return jsonb_build_object('operationId',r.id,'status',r.state,'dispatchAuthorized',false);end if;
 select coalesce(sum(amount_minor),0) into reserved from private.auction_reversal_operations where transfer_operation_id=o.id and state<>'canceled';
 if e.qualified_at>clock_timestamp() or e.expires_at<=clock_timestamp() or e.revoked_at is not null
  or o.provider_transfer_id is null or not o.recovery_required or reserved+e.amount_minor>o.amount_minor
 then return jsonb_build_object('status','held','reason','qualified_recovery_required','dispatchAuthorized',false);end if;
 insert into private.auction_reversal_operations(transfer_operation_id,evidence_id,amount_minor) values(o.id,e.id,e.amount_minor) returning * into r;
 return jsonb_build_object('operationId',r.id,'status',r.state,'dispatchAuthorized',false);
end;$$;
revoke all on function public.reserve_auction_test_reversal(uuid) from public,anon,authenticated,service_role;
grant execute on function public.reserve_auction_test_reversal(uuid) to service_role;

create function public.read_auction_test_reversal_operation(p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 return (select to_jsonb(r)||jsonb_build_object('idempotency_key','auction-reversal-v1-'||r.id,
  'transfer',to_jsonb(o),'dispatchAuthorized',false,'financialAuthority',false)
  from private.auction_reversal_operations r join private.auction_transfer_operations o on o.id=r.transfer_operation_id where r.id=p_operation_id);
end;$$;
revoke all on function public.read_auction_test_reversal_operation(uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_auction_test_reversal_operation(uuid) to service_role;

create function public.claim_auction_test_reversal_dispatch(p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.auction_reversal_operations;e private.auction_reversal_evidence;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into strict r from private.auction_reversal_operations where id=p_operation_id for update;
 select * into strict e from private.auction_reversal_evidence where id=r.evidence_id for share;
 if r.state<>'reserved' then return jsonb_build_object('status',r.state,'dispatchAuthorized',false);end if;
 if e.revoked_at is not null or e.expires_at<=clock_timestamp() then
  update private.auction_reversal_operations set state='canceled' where id=r.id;
  return jsonb_build_object('status','canceled','dispatchAuthorized',false);end if;
 update private.auction_reversal_operations set state='unknown',dispatched_at=clock_timestamp() where id=r.id;
 return public.read_auction_test_reversal_operation(r.id)||jsonb_build_object('dispatchAuthorized',true);
end;$$;
revoke all on function public.claim_auction_test_reversal_dispatch(uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_auction_test_reversal_dispatch(uuid) to service_role;

create function public.record_auction_test_reversal_result(p_operation_id uuid,p_evidence jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.auction_reversal_operations;o private.auction_transfer_operations;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 select * into strict r from private.auction_reversal_operations where id=p_operation_id for update;
 select * into strict o from private.auction_transfer_operations where id=r.transfer_operation_id;
 if r.state not in('unknown','confirmed') then raise exception 'reversal_not_dispatched';end if;
 if not coalesce(p_evidence->>'object'='transfer_reversal' and p_evidence->>'id' ~ '^trr_[A-Za-z0-9]+$'
  and p_evidence->>'platform_account_id'=o.platform_account_id and p_evidence->>'transfer'=o.provider_transfer_id
  and p_evidence->'amount'=to_jsonb(r.amount_minor) and p_evidence->>'currency'=o.currency
  and p_evidence->'metadata'->>'auction_reversal_id'=r.id::text and p_evidence->'metadata'->>'auction_operation_id'=o.id::text,false)
 then raise exception 'reversal_evidence_mismatch';end if;
 if r.provider_reversal_id is not null and r.provider_reversal_id<>p_evidence->>'id' then raise exception 'reversal_identity_changed';end if;
 insert into private.auction_transfer_result_observations(operation_id,evidence) values(o.id,p_evidence) on conflict do nothing;
 update private.auction_reversal_operations set state='confirmed',provider_reversal_id=p_evidence->>'id' where id=r.id;
 -- Reversal success does NOT mark the buyer refund complete or clear recovery.
 return jsonb_build_object('status','confirmed','operationId',r.id,'financialAuthority',false,'buyerRefundCompleted',false);
end;$$;
revoke all on function public.record_auction_test_reversal_result(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_auction_test_reversal_result(uuid,jsonb) to service_role;
