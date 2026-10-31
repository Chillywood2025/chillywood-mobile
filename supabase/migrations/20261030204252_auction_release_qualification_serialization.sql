-- Serialize qualification renewal/revocation and current recipient readiness
-- with the one-shot dispatch permit. No rows, accounts or live flags enabled.
create function private.lock_auction_release_domain(p_contract_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c private.auction_platform_settlement_contracts;
begin
 select * into strict c from private.auction_platform_settlement_contracts where id=p_contract_id;
 if c.lane='event' then
  perform 1 from public.creator_events event join private.creator_event_auctions a on a.event_id=event.id
   join private.creator_event_auction_quotes q on q.auction_id=a.id where q.id=c.quote_id for update of event;
 else
  perform 1 from public.watch_party_rooms room join private.creator_room_seat_claims claim on claim.party_id=room.party_id
   where claim.purchase_intent_id=c.purchase_intent_id for share of room;
  perform 1 from private.creator_room_sessions session join private.creator_room_seat_claims claim on claim.room_session_id=session.id
   where claim.purchase_intent_id=c.purchase_intent_id for share of session;
 end if;
end;$$;
revoke all on function private.lock_auction_release_domain(uuid) from public,anon,authenticated,service_role;
create function private.lock_auction_release_qualification(p_contract_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c private.auction_platform_settlement_contracts;
begin
 select * into strict c from private.auction_platform_settlement_contracts where id=p_contract_id;
 perform pg_advisory_xact_lock(hashtextextended('auction-release-qualification:'||c.capability_id,0));
 perform 1 from private.auction_platform_qualifications where capability_id=c.capability_id order by verified_at desc,id desc limit 1 for share;
 perform 1 from public.creator_payout_accounts account where account.creator_user_id=c.creator_id::text
  and account.provider='stripe_connect' and account.provider_environment='test' and account.provider_account_id=c.recipient_account_id for share;
 perform 1 from public.creator_payout_eligibility_records eligibility join public.creator_payout_accounts account on account.id=eligibility.payout_account_id
  where account.creator_user_id=c.creator_id::text and account.provider_account_id=c.recipient_account_id
   and account.provider='stripe_connect' and account.provider_environment='test' for share of eligibility;
end;$$;
revoke all on function private.lock_auction_release_qualification(uuid) from public,anon,authenticated,service_role;

create function private.serialize_auction_qualification_insert() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('auction-release-qualification:'||new.capability_id,0));return new;
end;$$;
revoke all on function private.serialize_auction_qualification_insert() from public,anon,authenticated,service_role;
create trigger serialize_auction_qualification_insert before insert on private.auction_platform_qualifications
 for each row execute function private.serialize_auction_qualification_insert();

-- A change after the permit commits is an in-flight recovery obligation, not
-- evidence the external request was canceled. Canceled operations stay canceled
-- through repeated payment/cost/account changes and never block those updates.
create function private.hold_auction_transfer_on_recipient_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare creator text;cap uuid;
begin
 if tg_table_name='auction_platform_qualifications' then cap:=coalesce(new.capability_id,old.capability_id);
 else creator:=coalesce(new.creator_user_id,old.creator_user_id);end if;
 update private.auction_transfer_operations o set recovery_required=true,
  state=case when o.state in('reserved','canceled') then 'canceled' else 'reconciliation_required' end
 from private.auction_platform_settlement_contracts c where c.id=o.contract_id
  and ((cap is not null and c.capability_id=cap) or (creator is not null and c.creator_id::text=creator))
  and private.auction_release_negative_holds(c.id);
 return coalesce(new,old);
end;$$;
revoke all on function private.hold_auction_transfer_on_recipient_change() from public,anon,authenticated,service_role;
create trigger hold_auction_transfer_on_qualification_change after insert or update or delete on private.auction_platform_qualifications
 for each row execute function private.hold_auction_transfer_on_recipient_change();
create trigger hold_auction_transfer_on_account_change after update or delete on public.creator_payout_accounts
 for each row execute function private.hold_auction_transfer_on_recipient_change();
create trigger hold_auction_transfer_on_eligibility_change after update or delete on public.creator_payout_eligibility_records
 for each row execute function private.hold_auction_transfer_on_recipient_change();

create function private.hold_auction_transfer_on_release_revocation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.revoked_at is not null then
  update private.auction_transfer_operations set recovery_required=true,
   state=case when state in('reserved','canceled') then 'canceled' else 'reconciliation_required' end
  where release_evidence_id=new.id;
 end if;return new;
end;$$;
revoke all on function private.hold_auction_transfer_on_release_revocation() from public,anon,authenticated,service_role;
create trigger hold_auction_transfer_on_release_revocation after update of revoked_at on private.auction_release_evidence
 for each row execute function private.hold_auction_transfer_on_release_revocation();

do $patch$
declare definition text;needle text;replacement text;
begin
 definition:=pg_get_functiondef('public.reserve_auction_test_transfer(uuid)'::regprocedure);
 needle:='select i.status into status from public.money_purchase_intents i where id=c.purchase_intent_id for update;';
 if position(needle in definition)=0 then raise exception 'auction_reservation_domain_lock_missing';end if;
 definition:=replace(definition,needle,'perform private.lock_auction_release_domain(c.id);'||chr(10)||needle);
 needle:='select * into a from private.auction_held_net_allocations where contract_id=c.id order by id desc limit 1;';
 if position(needle in definition)=0 then raise exception 'auction_reservation_qualification_lock_missing';end if;
 execute replace(definition,needle,'perform private.lock_auction_release_qualification(c.id);'||chr(10)||needle);
 definition:=pg_get_functiondef('public.claim_auction_test_transfer_dispatch(uuid)'::regprocedure);
 needle:='perform 1 from public.money_purchase_intents where id=c.purchase_intent_id for update;';
 replacement:='perform private.lock_auction_release_domain(c.id);'||chr(10)||needle||chr(10)||' perform private.lock_auction_release_qualification(c.id);';
 if position(needle in definition)=0 then raise exception 'auction_dispatch_qualification_lock_missing';end if;
 definition:=replace(definition,needle,replacement);
 needle:='select * into strict o from private.auction_transfer_operations where id=p_operation_id for update;
 select * into strict e from private.auction_release_evidence where id=o.release_evidence_id for share;';
 if position(needle in definition)=0 then raise exception 'auction_dispatch_release_evidence_lock_missing';end if;
 execute replace(definition,needle,'select * into strict e from private.auction_release_evidence where id=o.release_evidence_id for share;
 select * into strict o from private.auction_transfer_operations where id=p_operation_id for update;');
 definition:=pg_get_functiondef('public.record_auction_test_transfer_result(uuid,jsonb)'::regprocedure);
 needle:='state=case when recovery_required or';
 if position(needle in definition)=0 then raise exception 'auction_result_state_patch_missing';end if;
 execute replace(definition,needle,'state=case when o.recovery_required or');
 definition:=pg_get_functiondef('private.observe_auction_room_delivery_issue()'::regprocedure);
 needle:='if tg_op=''DELETE'' or new.membership_state=''removed'' then';
 if position(needle in definition)=0 then raise exception 'auction_voluntary_leave_patch_missing';end if;
 execute replace(definition,needle,'if (tg_op=''DELETE'' and old.membership_state is distinct from ''left'') or new.membership_state=''removed'' then');
end;$patch$;
