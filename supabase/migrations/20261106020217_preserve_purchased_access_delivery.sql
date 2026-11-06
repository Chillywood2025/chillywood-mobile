begin;

-- Purchased delivery uses retained legal acceptance, not the presence of a
-- logged-in seller. The ordinary legal helper intentionally requires every
-- active seller session and is therefore unsuitable for a buyer's paid rights.
-- Current document versions, role, market, and explicit invalidation still bind.
create function private.creator_paid_delivery_legal_current(p_creator uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select p_creator is not null
    and public.wave1_legal_document_configuration_complete_internal('creator_money')
    and not exists (
      select 1 from public.wave1_legal_document_versions document
      where document.active and document.market='UNITED_STATES'
        and document.capability in ('account','creator','creator_money')
        and not exists (
          select 1 from public.wave1_legal_acceptances acceptance
          where acceptance.user_id=p_creator and acceptance.document_key=document.document_key
            and acceptance.document_version=document.version and acceptance.market=document.market
            and acceptance.capability=document.capability and acceptance.invalidated_at is null
            and acceptance.role_key=coalesce((select nullif(lower(btrim(profile.channel_role)),'')
              from public.user_profiles profile where profile.user_id=p_creator::text),'member')));
$$;
revoke all on function private.creator_paid_delivery_legal_current(uuid)
  from public,anon,authenticated,service_role;

-- Safety for an already-proved purchase, never permission to create or charge
-- a new sale. The caller must still prove the exact buyer/receipt/mode/grant and
-- its nonrefunded finite terms. No seller Premium, session, money-switch,
-- rollout, or provider/KYC/tax/payout readiness or freshness is required here.
-- Those financial prerequisites can lapse without revoking purchased rights.
-- Account, age, market, creator-role, moderation, platform suspension, sanctions,
-- current retained legal acceptance, and explicit fraud/admin holds still deny.
create function private.creator_paid_delivery_subject_safe(p_creator uuid,p_environment text) returns boolean
language sql stable security definer set search_path='' as $$
  select p_creator is not null and p_environment is not null and p_environment in ('sandbox','production')
    and exists(select 1 from auth.users subject where subject.id=p_creator and subject.deleted_at is null
      and subject.email_confirmed_at is not null
      and coalesce(subject.raw_app_meta_data->>'accountDeidentified','false')<>'true')
    and not public.is_account_access_restricted(p_creator::text)
    and private.creator_paid_delivery_legal_current(p_creator)
    and exists(select 1 from public.wave1_creator_eligibility eligibility
      where eligibility.creator_user_id=p_creator and eligibility.state not in ('SUSPENDED','REVOKED')
        and eligibility.account_status='ACTIVE' and eligibility.age_18_plus is true
        and eligibility.market='UNITED_STATES' and eligibility.creator_role is true
        and eligibility.moderation_state='CLEAR' and eligibility.platform_capability is true
        and eligibility.sanctions_clear is not false)
    and not exists(select 1 from public.creator_payout_eligibility_records eligibility
      where eligibility.creator_user_id=p_creator::text
        and (eligibility.fraud_hold_active or eligibility.admin_review_status in ('pending_review','rejected','on_hold')
          or eligibility.eligibility_status='on_hold'));
$$;
revoke all on function private.creator_paid_delivery_subject_safe(uuid,text)
  from public,anon,authenticated,service_role;

-- Change only the purchased viewer branches. Host authoring/publication,
-- checkout, provider receipt processing, and settlement remain on their
-- existing new-sale authority predicates.
do $patch$
declare item record; definition text;
begin
  for item in select * from (values
    ('public.creator_event_destination_internal(uuid)',
      'private.ordinary_creator_subject_for_mode(e.host_user_id,identity->>''environment'')',
      'private.creator_paid_delivery_subject_safe(e.host_user_id,identity->>''environment'')'),
    ('public.watch_party_room_access_pre_live_decouple(text,text)',
      'private.ordinary_creator_subject_for_mode(offer."creator_id",intent."environment")',
      'private.creator_paid_delivery_subject_safe(offer."creator_id",intent."environment")'),
    ('public.resolve_watch_party_livekit_authority_pre_service_fix(text,uuid,uuid)',
      'private.ordinary_creator_subject_for_mode(offer."creator_id",intent."environment")',
      'private.creator_paid_delivery_subject_safe(offer."creator_id",intent."environment")'),
    ('private.room_attendance_source_access_pre_paid_stage(public.watch_party_rooms,uuid)',
      'private.ordinary_creator_subject_for_mode(o.creator_id,i.environment)',
      'private.creator_paid_delivery_subject_safe(o.creator_id,i.environment)'),
    ('private.creator_event_auction_grant_identity(uuid,uuid,uuid)',
      'private.ordinary_creator_subject_for_mode(i.creator_id,i.environment)',
      'private.creator_paid_delivery_subject_safe(i.creator_id,i.environment)')
  ) as changes(signature,needle,replacement)
  loop
    definition:=pg_get_functiondef(item.signature::regprocedure);
    if length(definition)-length(replace(definition,item.needle,''))<>length(item.needle)
    then raise exception 'paid_delivery_patch_changed: %',item.signature; end if;
    execute replace(definition,item.needle,item.replacement);
  end loop;
end $patch$;

-- A separate room predicate preserves all current room/source/block checks.
-- Only an exact paid claim may use it; auction creation, bids, checkout, and
-- provider receipt reconciliation continue to use their new-sale predicate.
do $patch$
declare definition text; needle text;
begin
  definition:=pg_get_functiondef('private.creator_room_seat_subject_allowed(text,uuid,text)'::regprocedure);
  needle:='private.creator_room_seat_subject_allowed(';
  if position(needle in definition)=0 then raise exception 'paid_delivery_room_signature_changed'; end if;
  definition:=replace(definition,needle,'private.creator_room_paid_delivery_subject_allowed(');
  needle:='private.ordinary_creator_subject_for_mode(r.host_user_id,p_environment)';
  if position(needle in definition)=0 then raise exception 'paid_delivery_room_subject_changed'; end if;
  execute replace(definition,needle,'private.creator_paid_delivery_subject_safe(r.host_user_id,p_environment)');

  definition:=pg_get_functiondef('private.creator_room_paid_seat_claim(text,uuid)'::regprocedure);
  needle:='private.creator_room_seat_subject_allowed(p_party_id,p_user_id,';
  if position(needle in definition)=0 then raise exception 'paid_delivery_room_claim_changed'; end if;
  execute replace(definition,needle,'private.creator_room_paid_delivery_subject_allowed(p_party_id,p_user_id,');
end $patch$;
revoke all on function private.creator_room_paid_delivery_subject_allowed(text,uuid,text)
  from public,anon,authenticated,service_role;

commit;
