begin;

-- Host-side offers do not carry an environment column. Resolve their exact
-- catalog identity instead of interpreting sold_out as a money mode.
-- An absent, mismatched, or ambiguous catalog identity has no authority.
create function private.paid_access_catalog_environment(
  p_product_type text,p_product_key text,p_provider text,p_provider_product_id text,p_offer_status text
) returns text language sql stable security definer set search_path='' as $$
  select case when count(*)=1 then min(p.environment) end
  from public.monetization_products p
  where p.product_key=p_product_key
    and p.provider=p_provider and p.provider_product_id=p_provider_product_id
    and ((p.product_type=p_product_type and p.provider in ('revenuecat_app_store','revenuecat_google_play'))
      -- Keep already-qualified live auction sources on their original rail.
      -- This does not grant an auction capability or change its checkout gate.
      or (p.environment='production' and p_product_type='event_pass'
        and p.product_type='event_pass' and p.provider='stripe_event_auction')
      or (p.environment='production' and p_product_type='watch_party_live_ticket'
        and p.product_type='room_seat_pass' and p.provider='stripe_room_auction'))
    and ((p.environment='sandbox' and p.status='sandbox' and p_offer_status in ('sandbox','sold_out','paused','blocked'))
      or (p.environment='production' and p.status='active' and p_offer_status in ('active','sold_out','paused','blocked')));
$$;
revoke all on function private.paid_access_catalog_environment(text,text,text,text,text)
  from public,anon,authenticated,service_role;

-- A historical ticket supplies its own verified purchase mode. Keep captured
-- replay terms, exact grant identity, refund handling, and source checks intact.
do $patch$ declare d text; n text; begin
  d:=pg_get_functiondef('public.creator_event_destination_internal(uuid)'::regprocedure);
  n:=$needle$    if not public.wave1_creator_money_subject_authorized_internal(e.host_user_id) then return denied; end if;$needle$;
  if position(n in d)=0 then raise exception 'paid_access_mode_patch_missing: event old host check'; end if;
  d:=replace(d,n,'');
  n:=$needle$    if identity is null then return denied||jsonb_build_object('reason','event_pass_required'); end if;$needle$;
  if position(n in d)=0 then raise exception 'paid_access_mode_patch_missing: event verified identity'; end if;
  d:=replace(d,n,n||$replacement$
    if private.ordinary_creator_subject_for_mode(e.host_user_id,identity->>'environment') is not true
    then return denied; end if;$replacement$);
  execute d;
end $patch$;

-- The paid host and the exact offer must agree before a catalog mode can be
-- used. Ordinary unpaid rooms keep their existing Premium and account rules.
do $patch$ declare d text; n text; begin
  d:=pg_get_functiondef('private.party_room_host_authority_current(public.watch_party_rooms)'::regprocedure);
  n:=$needle$      public.wave1_creator_money_subject_authorized_internal(r.host_user_id)
      and not public.revenuecat_authority_quarantined_internal(null,r.host_user_id,null)$needle$;
  if position(n in d)=0 then raise exception 'paid_access_mode_patch_missing: party host old check'; end if;
  d:=replace(d,n,$replacement$      not public.revenuecat_authority_quarantined_internal(null,r.host_user_id,null)$replacement$);
  n:=$needle$        and o.creator_id=r.host_user_id and o.host_id=r.host_user_id and o.status in ('sandbox','active','sold_out')$needle$;
  if position(n in d)=0 then raise exception 'paid_access_mode_patch_missing: party exact offer'; end if;
  d:=replace(d,n,n||$replacement$
        and private.ordinary_creator_subject_for_mode(r.host_user_id,
          private.paid_access_catalog_environment('watch_party_live_ticket',o.provider_product_key,
            o.provider,o.provider_product_id,o.status))$replacement$);
  execute d;
end $patch$;

do $patch$ declare d text; n text; begin
  d:=pg_get_functiondef('public.watch_party_room_access_pre_live_decouple(text,text)'::regprocedure);
  n:=$needle$      and public."wave1_creator_money_subject_authorized_internal"(v_room."host_user_id")$needle$;
  if position(n in d)=0 then raise exception 'paid_access_mode_patch_missing: room old host check'; end if;
  d:=replace(d,n,'');
  n:=$needle$          and offer."host_id"=v_room."host_user_id"$needle$;
  if position(n in d)=0 then raise exception 'paid_access_mode_patch_missing: room exact host offer'; end if;
  d:=replace(d,n,n||$replacement$
          and private.ordinary_creator_subject_for_mode(v_room."host_user_id",
            private.paid_access_catalog_environment('watch_party_live_ticket',offer.provider_product_key,
              offer.provider,offer.provider_product_id,offer.status))$replacement$);
  n:=$needle$public."wave1_creator_money_subject_authorized_internal"(offer."creator_id")$needle$;
  if position(n in d)=0 then raise exception 'paid_access_mode_patch_missing: room verified viewer intent'; end if;
  d:=replace(d,n,$replacement$private.ordinary_creator_subject_for_mode(offer."creator_id",intent."environment")$replacement$);
  execute d;
end $patch$;

do $patch$ declare d text; n text; begin
  d:=pg_get_functiondef('public.resolve_watch_party_livekit_authority_pre_service_fix(text,uuid,uuid)'::regprocedure);
  n:=$needle$    or not public."wave1_creator_money_subject_authorized_internal"(p_user_id)$needle$;
  if position(n in d)=0 then raise exception 'paid_access_mode_patch_missing: LiveKit old host check'; end if;
  d:=replace(d,n,'');
  n:=$needle$      where offer."party_id"=p_party_id and offer."creator_id"=p_user_id$needle$;
  if position(n in d)=0 then raise exception 'paid_access_mode_patch_missing: LiveKit exact host offer'; end if;
  d:=replace(d,n,n||$replacement$
        and offer.host_id=p_user_id
        and private.ordinary_creator_subject_for_mode(p_user_id,
          private.paid_access_catalog_environment('watch_party_live_ticket',offer.provider_product_key,
            offer.provider,offer.provider_product_id,offer.status))$replacement$);
  n:=$needle$        and offer."creator_id"=p_user_id$needle$;
  if position(n in d)=0 then raise exception 'paid_access_mode_patch_missing: LiveKit exact host expiry'; end if;
  d:=replace(d,n,n||$replacement$
        and offer.host_id=p_user_id
        and private.ordinary_creator_subject_for_mode(p_user_id,
          private.paid_access_catalog_environment('watch_party_live_ticket',offer.provider_product_key,
            offer.provider,offer.provider_product_id,offer.status))$replacement$);
  n:=$needle$public."wave1_creator_money_subject_authorized_internal"(offer."creator_id")$needle$;
  if position(n in d)=0 then raise exception 'paid_access_mode_patch_missing: LiveKit verified viewer intent'; end if;
  d:=replace(d,n,$replacement$private.ordinary_creator_subject_for_mode(offer."creator_id",intent."environment")$replacement$);
  execute d;
end $patch$;

do $patch$ declare d text; n text; begin
  d:=pg_get_functiondef('private.room_attendance_source_access_pre_paid_stage(public.watch_party_rooms,uuid)'::regprocedure);
  n:=$needle$public.wave1_creator_money_subject_authorized_internal(o.creator_id)$needle$;
  if position(n in d)=0 then raise exception 'paid_access_mode_patch_missing: attendance verified viewer intent'; end if;
  execute replace(d,n,$replacement$private.ordinary_creator_subject_for_mode(o.creator_id,i.environment)$replacement$);
end $patch$;

create function private.creator_vip_current_catalog_environment(p_creator uuid) returns text
language sql stable security definer set search_path='' as $$
  select case when count(*)=1 then min(case when o.status in ('sandbox','active') then
    private.paid_access_catalog_environment('vip_pass',o.provider_product_key,o.provider,o.provider_product_id,o.status) end) end
  from public.creator_vip_pass_offers o where o.creator_id=p_creator
    and o.status in ('sandbox','active','paused','blocked');
$$;
revoke all on function private.creator_vip_current_catalog_environment(uuid)
  from public,anon,authenticated,service_role;

-- Enabling VIP protection requires the creator's exact current offer. Disabling
-- it remains a recovery action and does not gain a new eligibility prerequisite.
do $patch$ declare d text; n text; begin
  d:=pg_get_functiondef('public.set_creator_video_vip_access(uuid,boolean)'::regprocedure);
  n:=$needle$  v_video public."videos"%rowtype;$needle$;
  if position(n in d)=0 then raise exception 'paid_access_mode_patch_missing: VIP video declaration'; end if;
  d:=replace(d,n,n||E'\n  authority_environment text;');
  n:=$needle$    perform public."wave1_assert_current_creator_money_authority_internal"();$needle$;
  if position(n in d)=0 then raise exception 'paid_access_mode_patch_missing: VIP video current creator'; end if;
  d:=replace(d,n,$replacement$    authority_environment:=private.creator_vip_current_catalog_environment(v_actor_id);
    if authority_environment is null then
      raise exception 'vip_offer_catalog_required' using errcode='42501'; end if;
    perform private.assert_current_creator_for_mode(authority_environment);
    -- Keep the current offer and its exact catalog binding stable through the
    -- video mutation, after acquiring the existing creator-subject locks.
    perform 1 from public.creator_vip_pass_offers offer
      join public.monetization_products product on product.product_key=offer.provider_product_key
        and product.provider=offer.provider and product.provider_product_id=offer.provider_product_id
      where offer.creator_id=v_actor_id and offer.status in ('sandbox','active','paused','blocked')
      for share of offer,product;
    if private.creator_vip_current_catalog_environment(v_actor_id) is distinct from authority_environment then
      raise exception 'vip_offer_mode_changed_reload' using errcode='40001'; end if;$replacement$);
  execute d;
end $patch$;

-- Producer authority is still tied to the exact prepared event, private room,
-- host session, active membership, and its short heartbeat. Only the creator
-- eligibility mode changes here. Provider approval and dispatch caps elsewhere
-- are deliberately untouched, as are stop/recovery actions (p_require_host=false).
-- Pausing ticket sales must not prevent the host from delivering a purchased
-- event; neutral offer states still derive their mode from the exact catalog.
do $patch$ declare d text; n text; begin
  d:=pg_get_functiondef('private.creator_event_broadcast_actor_current(uuid,uuid,text,boolean)'::regprocedure);
  n:=$needle$      and public.wave1_creator_money_subject_authorized_internal(p_user_id)$needle$;
  if position(n in d)=0 then raise exception 'paid_access_mode_patch_missing: broadcast host mode'; end if;
  d:=replace(d,n,$replacement$      and exists (
        select 1 from private.creator_event_broadcast_preparations preparation
        join public.creator_events event on event.id=preparation.creator_event_id
          and event.host_user_id=preparation.host_user_id
        where preparation.party_id=p_party_id and preparation.host_user_id=p_user_id
          and case when exists(select 1 from public.paid_creator_events paid
              where paid.creator_event_id=event.id and paid.status in ('sandbox','active','sold_out','paused','blocked'))
            or exists(select 1 from public.paid_creator_event_passes pass where pass.creator_event_id=event.id)
          then exists(select 1 from public.paid_creator_events offer
            where offer.creator_event_id=event.id and offer.creator_id=p_user_id
              and private.ordinary_creator_subject_for_mode(p_user_id,
                private.paid_access_catalog_environment('event_pass',offer.provider_product_key,
                  offer.provider,offer.provider_product_id,offer.status)))
          else public.wave1_creator_money_subject_authorized_internal(p_user_id) end)$replacement$);
  execute d;
end $patch$;

commit;
