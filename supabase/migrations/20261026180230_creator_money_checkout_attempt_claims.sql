-- Store checkout starts are durable attempts, not proof of payment or failure.
-- Events use their separate capacity-reservation claim. No provider is called.
alter table public.money_purchase_intents
  add column checkout_attempt_id uuid,
  add column checkout_started_at timestamptz,
  add constraint creator_money_checkout_marker_complete check (
    (checkout_attempt_id is null)=(checkout_started_at is null));
create unique index creator_money_checkout_attempt_unique
  on public.money_purchase_intents(checkout_attempt_id) where checkout_attempt_id is not null;

create function private.guard_creator_money_checkout_attempt()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if old.checkout_attempt_id is not null and row(new.checkout_attempt_id,new.checkout_started_at)
      is distinct from row(old.checkout_attempt_id,old.checkout_started_at)
    then raise exception 'creator_money_checkout_attempt_immutable'; end if;
  elsif new.source_type in ('creator_tip','paid_content','watch_party_live','vip_pass','channel_subscription','live_watch_party_access','live_watch_party_seat') then
    -- Separate from issuance/source locks; no source rows are acquired after
    -- this lock, preserving existing Stage and ordinary issuance lock orders.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'creator-money-checkout-attempt:'||new.user_id::text||':'||new.source_type||':'||new.source_id::text,0));
    if exists(select 1 from public.money_purchase_intents i where i.user_id=new.user_id
      and i.source_type=new.source_type and i.source_id=new.source_id
      and i.checkout_attempt_id is not null and i.status in ('pending','expired'))
    then raise exception 'creator_money_checkout_resolution_required'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_creator_money_checkout_attempt() from public,anon,authenticated,service_role;
create trigger guard_creator_money_checkout_attempt before insert or update on public.money_purchase_intents
for each row execute function private.guard_creator_money_checkout_attempt();

create function public.begin_creator_money_checkout(p_purchase_intent_id uuid,p_checkout_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.money_purchase_intents; q public.creator_money_purchase_quotes; source jsonb;
  expected_status text; feature_key text; switch_key text; switch_state text; source_valid boolean:=false;
begin
  if auth.uid() is null or not public.wave1_current_caller_authority_internal()
    or public.is_account_access_restricted(auth.uid()::text)
  then raise exception 'buyer_session_authority_required'; end if;
  if p_checkout_attempt_id is null then raise exception 'creator_money_checkout_attempt_required'; end if;
  select * into i from public.money_purchase_intents where id=p_purchase_intent_id and user_id=auth.uid();
  if i.id is null or (i.source_type,i.product_type) not in (
    ('creator_tip','creator_tip'),('paid_content','paid_content_access'),('watch_party_live','watch_party_live_ticket'),
    ('vip_pass','vip_pass'),('channel_subscription','channel_subscription'),
    ('live_watch_party_access','live_watch_party_access_pass'),('live_watch_party_seat','live_watch_party_seat_pass'))
  then raise exception 'creator_money_checkout_intent_unavailable'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'creator-money-checkout-attempt:'||auth.uid()::text||':'||i.source_type||':'||i.source_id::text,0));
  select * into i from public.money_purchase_intents where id=p_purchase_intent_id and user_id=auth.uid() for update;
  if i.session_generation is distinct from nullif(auth.jwt()->>'session_id','')
    or not public.money_purchase_intent_session_authorized_internal(i.user_id,i.session_generation)
  then raise exception 'creator_money_checkout_session_changed'; end if;
  if i.checkout_attempt_id is not null then
    return public.money_purchase_intent_safe_row(i)||jsonb_build_object(
      'checkoutAttemptId',i.checkout_attempt_id,'checkoutStartedAt',i.checkout_started_at,'startAuthorized',false);
  end if;
  if i.status<>'pending' or i.expires_at<=clock_timestamp() or i.consumed_at is not null or i.revoked_at is not null
    or i.creator_id=auth.uid() or not public.wave1_creator_money_subject_authorized_internal(i.creator_id)
    or public.revenuecat_authority_quarantined_internal(i.provider,i.user_id,i.environment)
  then raise exception 'creator_money_checkout_intent_unavailable'; end if;
  if exists(select 1 from public.money_purchase_intents prior where prior.id<>i.id
    and prior.user_id=i.user_id and prior.source_type=i.source_type and prior.source_id=i.source_id
    and prior.checkout_attempt_id is not null and prior.status in ('pending','expired'))
  then raise exception 'creator_money_checkout_resolution_required'; end if;
  if exists(select 1 from public.channel_audience_blocks b
    where (b.channel_user_id=i.creator_id::text and b.blocked_user_id=i.user_id::text)
      or (b.channel_user_id=i.user_id::text and b.blocked_user_id=i.creator_id::text))
  then raise exception 'creator_money_blocked_by_audience_policy'; end if;
  select * into q from public.creator_money_purchase_quotes where purchase_intent_id=i.id;
  if q.purchase_intent_id is null or row(q.user_id,q.creator_id,q.source_type,q.source_id,q.amount_minor,q.currency,
      q.provider,q.provider_product_id,q.environment,q.created_at,q.expires_at)
    is distinct from row(i.user_id,i.creator_id,i.source_type,i.source_id,i.amount_minor,i.currency,
      i.provider,i.provider_product_id,i.environment,i.created_at,i.expires_at)
  then raise exception 'creator_money_checkout_quote_mismatch'; end if;
  if not exists(select 1 from jsonb_array_elements(public.list_creator_supported_prices(i.source_type,
      case i.provider when 'revenuecat_app_store' then 'ios' when 'revenuecat_google_play' then 'android' end,
      i.environment,i.source_id)) price
    where price->>'provider'=i.provider and price->>'providerProductId'=i.provider_product_id
      and price->>'productKey'=i.product_key and (price->>'amountMinor')::integer=i.amount_minor
      and price->>'currency'=i.currency)
  then raise exception 'creator_money_checkout_price_changed'; end if;
  expected_status:=case i.environment when 'production' then 'active' else 'sandbox' end;
  case i.source_type
    when 'creator_tip' then
      select tips_enabled and status='active' into source_valid from public.creator_tip_settings
        where creator_id=i.source_id and creator_id=i.creator_id;
    when 'paid_content' then
      select v.visibility='public' and coalesce(v.moderation_status,'clean') in ('clean','reported')
        and v.quarantined_at is null and public.media_scan_public_safe(v.scan_status)
        and not coalesce(v.vip_access_required,false) and p.is_paid and p.status=expected_status
        and public.creator_video_playable_source_after_authority_internal(v.id)
      into source_valid from public.videos v join public.creator_content_prices p
        on p.content_id=v.id and p.content_type='creator_video' and p.creator_id=v.owner_id
      where v.id=i.source_id and v.owner_id=i.creator_id;
    when 'watch_party_live' then
      select o.status=expected_status and r.is_active and r.room_type='title'
        and r.host_user_id=o.creator_id into source_valid
      from public.paid_watch_party_offers o join public.watch_party_rooms r on r.party_id=o.party_id
      where o.id=i.source_id and o.creator_id=i.creator_id;
    when 'vip_pass' then
      select status=expected_status into source_valid from public.creator_vip_pass_offers where id=i.source_id and creator_id=i.creator_id;
    when 'channel_subscription' then
      select status=expected_status into source_valid from public.creator_channel_subscription_offers where id=i.source_id and creator_id=i.creator_id;
    else
      perform public.assert_live_watch_party_sandbox_rail_internal(i.product_type);
      select o.status=expected_status and o.environment=i.environment and o.pass_type=i.product_type
        and o.product_id=i.product_id and r.is_active and r.room_type='live' and r.host_user_id=o.host_user_id
        and o.creator_id=o.host_user_id into source_valid
      from public.paid_live_watch_party_offers o join public.watch_party_rooms r on r.party_id=o.party_id
      where o.id=i.source_id and o.creator_id=i.creator_id;
  end case;
  if not coalesce(source_valid,false) then raise exception 'creator_money_checkout_source_unavailable'; end if;
  feature_key:=case i.source_type when 'creator_tip' then 'tips_enabled' when 'paid_content' then 'paid_content_enabled'
    when 'watch_party_live' then 'watch_party_tickets_enabled' when 'live_watch_party_access' then 'live_watch_party_access_enabled'
    when 'live_watch_party_seat' then 'live_watch_party_seats_enabled' else 'digital_sales_enabled' end;
  foreach switch_key in array array[feature_key,'creator_monetization_enabled','provider_webhooks_enabled',
    case i.provider when 'revenuecat_app_store' then 'revenuecat_app_store_enabled' else 'revenuecat_google_play_enabled' end]
  loop
    select state into switch_state from public.platform_money_kill_switches where key=switch_key;
    if coalesce(switch_state,'off') not in ('on','sandbox_only')
      or (i.environment='production' and switch_state<>'on')
    then raise exception 'creator_money_checkout_rail_unavailable'; end if;
  end loop;
  if i.environment='sandbox' and coalesce((select state from public.platform_money_kill_switches where key='live_money_enabled'),'off')<>'off'
  then raise exception 'creator_money_checkout_rail_unavailable'; end if;
  update public.money_purchase_intents set checkout_attempt_id=p_checkout_attempt_id,
    checkout_started_at=clock_timestamp(),updated_at=clock_timestamp() where id=i.id returning * into i;
  return public.money_purchase_intent_safe_row(i)||jsonb_build_object(
    'checkoutAttemptId',i.checkout_attempt_id,'checkoutStartedAt',i.checkout_started_at,'startAuthorized',true);
end;
$$;
revoke all on function public.begin_creator_money_checkout(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.begin_creator_money_checkout(uuid,uuid) to authenticated;

comment on function public.begin_creator_money_checkout(uuid,uuid) is
  'Authorizes one native Store call for an exact current non-event creator purchase quote. Replays never reauthorize. A started unresolved attempt blocks replacement intents after expiry; verified provider reconciliation remains authoritative.';
