-- Watch-Party Live / Live Stage money authority closure.
--
-- This is source/deployment readiness only. It does not enable live money,
-- payouts, public sale controls, or any production provider switch. Payment
-- grants exact room access or exact seat eligibility; host-approved membership
-- remains the only path to LiveKit publish authority.

create table public."paid_live_watch_party_offers" (
  "id" uuid primary key default gen_random_uuid(),
  "party_id" text not null references public."watch_party_rooms"("party_id") on delete cascade,
  "creator_id" uuid not null references auth.users("id") on delete restrict,
  "host_user_id" uuid not null references auth.users("id") on delete restrict,
  "pass_type" text not null,
  "product_id" uuid not null references public."monetization_products"("id") on delete restrict,
  "provider" text not null,
  "provider_product_id" text not null,
  "price_cents" integer not null,
  "currency" text not null default 'usd',
  "environment" text not null default 'sandbox',
  "status" text not null default 'sandbox',
  "starts_at" timestamptz,
  "ends_at" timestamptz,
  "created_at" timestamptz not null default timezone('utc'::text,now()),
  "updated_at" timestamptz not null default timezone('utc'::text,now()),
  constraint "paid_live_watch_party_offers_pass_type_check"
    check ("pass_type" in ('live_watch_party_access_pass','live_watch_party_seat_pass')),
  constraint "paid_live_watch_party_offers_provider_check"
    check ("provider" in ('revenuecat_app_store','revenuecat_google_play')),
  constraint "paid_live_watch_party_offers_amount_check" check ("price_cents">0),
  constraint "paid_live_watch_party_offers_currency_check" check ("currency"~'^[a-z]{3}$'),
  constraint "paid_live_watch_party_offers_environment_check" check ("environment" in ('sandbox','production')),
  constraint "paid_live_watch_party_offers_status_check"
    check ("status" in ('sandbox','active','paused','canceled','ended','blocked')),
  constraint "paid_live_watch_party_offers_window_check"
    check ("ends_at" is null or "starts_at" is null or "ends_at">"starts_at"),
  constraint "paid_live_watch_party_offers_exact_type_unique" unique ("party_id","pass_type")
);

create index "paid_live_watch_party_offers_creator_idx"
  on public."paid_live_watch_party_offers"("creator_id","status","updated_at" desc);
alter table public."paid_live_watch_party_offers" enable row level security;
alter table public."paid_live_watch_party_offers" force row level security;
revoke all on public."paid_live_watch_party_offers" from public,anon,authenticated,service_role;
grant select on public."paid_live_watch_party_offers" to authenticated;
grant select,insert,update,delete on public."paid_live_watch_party_offers" to service_role;
create policy "paid_live_watch_party_offers_read_exact_room"
  on public."paid_live_watch_party_offers" for select to authenticated
  using (
    auth.uid() is not null
    and public."wave1_current_caller_authority_internal"()
    and not public."is_account_access_restricted"(auth.uid()::text)
    and ("creator_id"=auth.uid() or "host_user_id"=auth.uid())
  );

create table public."paid_live_watch_party_passes" (
  "id" uuid primary key default gen_random_uuid(),
  "offer_id" uuid not null references public."paid_live_watch_party_offers"("id") on delete restrict,
  "party_id" text not null references public."watch_party_rooms"("party_id") on delete restrict,
  "buyer_id" uuid not null references auth.users("id") on delete restrict,
  "creator_id" uuid not null references auth.users("id") on delete restrict,
  "pass_type" text not null,
  "access_grant_id" uuid not null unique references public."access_grants"("id") on delete restrict,
  "provider_event_id" uuid not null references public."provider_events"("id") on delete restrict,
  "status" text not null default 'active',
  "reviewed_at" timestamptz,
  "approved_at" timestamptz,
  "rejected_at" timestamptz,
  "meaningful_entry_at" timestamptz,
  "revoked_at" timestamptz,
  "refunded_at" timestamptz,
  "created_at" timestamptz not null default timezone('utc'::text,now()),
  "updated_at" timestamptz not null default timezone('utc'::text,now()),
  constraint "paid_live_watch_party_passes_type_check"
    check ("pass_type" in ('live_watch_party_access_pass','live_watch_party_seat_pass')),
  constraint "paid_live_watch_party_passes_status_check"
    check ("status" in ('active','revoked','refunded','expired','blocked')),
  constraint "paid_live_watch_party_passes_review_check" check (
    "pass_type"='live_watch_party_seat_pass'
    or ("reviewed_at" is null and "approved_at" is null and "rejected_at" is null)
  ),
  constraint "paid_live_watch_party_passes_outcome_check"
    check ("approved_at" is null or "rejected_at" is null),
  constraint "paid_live_watch_party_passes_provider_event_unique" unique ("provider_event_id")
);

create index "paid_live_watch_party_passes_room_buyer_idx"
  on public."paid_live_watch_party_passes"("party_id","buyer_id","status");
create unique index "paid_live_watch_party_passes_active_exact_unique"
  on public."paid_live_watch_party_passes"("offer_id","buyer_id") where "status"='active';
alter table public."paid_live_watch_party_passes" enable row level security;
alter table public."paid_live_watch_party_passes" force row level security;
revoke all on public."paid_live_watch_party_passes" from public,anon,authenticated,service_role;
grant select on public."paid_live_watch_party_passes" to authenticated;
grant select,insert,update,delete on public."paid_live_watch_party_passes" to service_role;
create policy "paid_live_watch_party_passes_read_self_or_creator"
  on public."paid_live_watch_party_passes" for select to authenticated
  using (
    auth.uid() is not null
    and public."wave1_current_caller_authority_internal"()
    and not public."is_account_access_restricted"(auth.uid()::text)
    and ("buyer_id"=auth.uid() or "creator_id"=auth.uid())
  );

create or replace function public."assert_live_watch_party_sandbox_rail_internal"(p_pass_type text)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_feature_state text;
  v_store_state text;
  v_webhook_state text;
  v_creator_money_state text;
  v_live_money_state text;
begin
  if p_pass_type not in ('live_watch_party_access_pass','live_watch_party_seat_pass')
  then raise exception 'live_pass_type_invalid'; end if;
  select "state" into v_feature_state from public."platform_money_kill_switches"
  where "key"=case when p_pass_type='live_watch_party_access_pass'
    then 'live_watch_party_access_enabled' else 'live_watch_party_seats_enabled' end for share;
  select "state" into v_store_state from public."platform_money_kill_switches"
  where "key"='revenuecat_google_play_enabled' for share;
  select "state" into v_webhook_state from public."platform_money_kill_switches"
  where "key"='provider_webhooks_enabled' for share;
  select "state" into v_creator_money_state from public."platform_money_kill_switches"
  where "key"='creator_monetization_enabled' for share;
  select "state" into v_live_money_state from public."platform_money_kill_switches"
  where "key"='live_money_enabled' for share;
  if coalesce(v_feature_state,'off') not in ('sandbox_only','on')
    or coalesce(v_store_state,'off')<>'sandbox_only'
    or coalesce(v_webhook_state,'off')<>'sandbox_only'
    or coalesce(v_creator_money_state,'off') not in ('sandbox_only','on')
    or coalesce(v_live_money_state,'off')<>'off'
  then raise exception 'live_watch_party_sandbox_rail_not_ready'; end if;
end; $$;
revoke all on function public."assert_live_watch_party_sandbox_rail_internal"(text)
  from public,anon,authenticated,service_role;

create or replace function public."set_my_live_watch_party_offer"(
  p_party_id text,
  p_pass_type text,
  p_enabled boolean,
  p_product_key text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_party text:=trim(coalesce(p_party_id,''));
  v_room public."watch_party_rooms"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_offer public."paid_live_watch_party_offers"%rowtype;
  v_price integer;
begin
  if v_user is null or not public."wave1_current_caller_authority_internal"()
    or public."is_account_access_restricted"(v_user::text)
  then raise exception 'creator_session_authority_required'; end if;
  if p_pass_type not in ('live_watch_party_access_pass','live_watch_party_seat_pass')
  then raise exception 'live_pass_type_invalid'; end if;
  select room.* into v_room from public."watch_party_rooms" room
  where room."party_id"=v_party for update;
  if v_room."party_id" is null or v_room."room_type"<>'live'
    or v_room."host_user_id" is distinct from v_user
  then raise exception 'exact_live_room_host_required'; end if;
  if not coalesce(p_enabled,false) then
    update public."paid_live_watch_party_offers"
    set "status"='canceled',"updated_at"=timezone('utc'::text,now())
    where "party_id"=v_party and "pass_type"=p_pass_type and "creator_id"=v_user
    returning * into v_offer;
    return jsonb_build_object('status','disabled','offerId',v_offer."id",'partyId',v_party,'passType',p_pass_type);
  end if;
  perform public."assert_live_watch_party_sandbox_rail_internal"(p_pass_type);
  perform public."wave1_assert_current_creator_money_authority_internal"();
  if not coalesce(v_room."is_active",false) then raise exception 'live_room_not_active'; end if;
  if exists (
    select 1 from public."watch_party_room_memberships" membership
    where membership."party_id"=v_party
      and membership."user_id"<>v_user::text
      and membership."membership_state" in ('active','reconnecting')
  ) then raise exception 'live_pass_offer_requires_empty_room'; end if;
  select product.* into v_product from public."monetization_products" product
  where product."product_key"=trim(coalesce(p_product_key,''))
    and product."product_type"=p_pass_type
    and product."environment"='sandbox' and product."status"='sandbox'
    and product."provider"='revenuecat_google_play'
    and nullif(trim(coalesce(product."provider_product_id",'')),'') is not null;
  if v_product."id" is null then raise exception 'exact_live_pass_product_required'; end if;
  if not coalesce((v_product."metadata"->>'sandbox_purchase_intents_enabled')::boolean,false)
  then raise exception 'live_pass_product_not_purchase_ready'; end if;
  if coalesce(v_product."metadata"->>'price_tier','') !~ '^[0-9]+$'
  then raise exception 'live_pass_catalog_price_missing'; end if;
  v_price:=(v_product."metadata"->>'price_tier')::integer;
  insert into public."paid_live_watch_party_offers"(
    "party_id","creator_id","host_user_id","pass_type","product_id","provider",
    "provider_product_id","price_cents","currency","environment","status"
  ) values (
    v_party,v_user,v_user,p_pass_type,v_product."id",v_product."provider",
    v_product."provider_product_id",v_price,'usd','sandbox','sandbox'
  ) on conflict ("party_id","pass_type") do update set
    "creator_id"=excluded."creator_id","host_user_id"=excluded."host_user_id",
    "product_id"=excluded."product_id","provider"=excluded."provider",
    "provider_product_id"=excluded."provider_product_id","price_cents"=excluded."price_cents",
    "currency"=excluded."currency","environment"=excluded."environment","status"='sandbox',
    "updated_at"=timezone('utc'::text,now())
  returning * into v_offer;
  return jsonb_build_object(
    'status',v_offer."status",'offerId',v_offer."id",'partyId',v_offer."party_id",
    'creatorId',v_offer."creator_id",'hostUserId',v_offer."host_user_id",
    'passType',v_offer."pass_type",'productKey',v_product."product_key",
    'provider',v_offer."provider",'providerProductId',v_offer."provider_product_id",
    'priceCents',v_offer."price_cents",'currency',v_offer."currency",
    'environment',v_offer."environment",'grantsPublish',false,'requiresHostApproval',p_pass_type='live_watch_party_seat_pass'
  );
end;
$$;
revoke all on function public."set_my_live_watch_party_offer"(text,text,boolean,text) from public,anon;
grant execute on function public."set_my_live_watch_party_offer"(text,text,boolean,text) to authenticated,service_role;

create or replace function public."resolve_live_watch_party_money_access"(p_party_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_party text:=trim(coalesce(p_party_id,''));
  v_room public."watch_party_rooms"%rowtype;
  v_access public."paid_live_watch_party_offers"%rowtype;
  v_seat public."paid_live_watch_party_offers"%rowtype;
  v_access_granted boolean:=false;
  v_seat_granted boolean:=false;
  v_approved boolean:=false;
begin
  if v_user is null or not public."wave1_current_caller_authority_internal"()
    or public."is_account_access_restricted"(v_user::text)
  then return jsonb_build_object('allowed',false,'reason','subject_authority_required','viewerOnly',true,'seatEligible',false,'seatApproved',false); end if;
  select room.* into v_room from public."watch_party_rooms" room where room."party_id"=v_party;
  if v_room."party_id" is null or v_room."room_type"<>'live'
  then return jsonb_build_object('allowed',false,'reason','live_target_unavailable','viewerOnly',true,'seatEligible',false,'seatApproved',false); end if;
  if not coalesce(v_room."is_active",false)
  then return jsonb_build_object('allowed',false,'reason','live_target_ended','viewerOnly',true,'seatEligible',false,'seatApproved',false); end if;
  if v_room."host_user_id"=v_user then
    return jsonb_build_object('allowed',true,'reason','exact_live_host','viewerOnly',false,'seatEligible',true,'seatApproved',true,'hostAuthority',true);
  end if;
  select offer.* into v_access from public."paid_live_watch_party_offers" offer
  where offer."party_id"=v_party and offer."pass_type"='live_watch_party_access_pass'
    and offer."status" in ('sandbox','active')
    and (offer."starts_at" is null or offer."starts_at"<=timezone('utc'::text,now()))
    and (offer."ends_at" is null or offer."ends_at">timezone('utc'::text,now()));
  select offer.* into v_seat from public."paid_live_watch_party_offers" offer
  where offer."party_id"=v_party and offer."pass_type"='live_watch_party_seat_pass'
    and offer."status" in ('sandbox','active')
    and (offer."starts_at" is null or offer."starts_at"<=timezone('utc'::text,now()))
    and (offer."ends_at" is null or offer."ends_at">timezone('utc'::text,now()));
  select exists(
    select 1 from public."paid_live_watch_party_passes" pass_row
    join public."access_grants" grant_row on grant_row."id"=pass_row."access_grant_id"
    join public."provider_events" provider_event on provider_event."id"=pass_row."provider_event_id"
    where pass_row."offer_id"=v_access."id" and pass_row."party_id"=v_party
      and pass_row."buyer_id"=v_user and pass_row."creator_id"=v_access."creator_id"
      and pass_row."pass_type"='live_watch_party_access_pass' and pass_row."status"='active'
      and grant_row."user_id"=v_user and grant_row."source_id"=v_access."id"
      and grant_row."grant_type"='live_watch_party_access_pass'
      and grant_row."status" in ('active','sandbox_only') and grant_row."revoked_at" is null
      and grant_row."refunded_at" is null and grant_row."starts_at"<=timezone('utc'::text,now())
      and (grant_row."expires_at" is null or grant_row."expires_at">timezone('utc'::text,now()))
      and provider_event."status"='processed' and provider_event."user_id"=v_user
      and provider_event."environment"=grant_row."environment"
      and not public."revenuecat_authority_quarantined_internal"(provider_event."provider",v_user,provider_event."environment")
  ) into v_access_granted;
  select exists(
    select 1 from public."paid_live_watch_party_passes" pass_row
    join public."access_grants" grant_row on grant_row."id"=pass_row."access_grant_id"
    join public."provider_events" provider_event on provider_event."id"=pass_row."provider_event_id"
    where pass_row."offer_id"=v_seat."id" and pass_row."party_id"=v_party
      and pass_row."buyer_id"=v_user and pass_row."creator_id"=v_seat."creator_id"
      and pass_row."pass_type"='live_watch_party_seat_pass' and pass_row."status"='active'
      and grant_row."user_id"=v_user and grant_row."source_id"=v_seat."id"
      and grant_row."grant_type"='live_watch_party_seat_pass'
      and grant_row."status" in ('active','sandbox_only') and grant_row."revoked_at" is null
      and grant_row."refunded_at" is null and grant_row."starts_at"<=timezone('utc'::text,now())
      and (grant_row."expires_at" is null or grant_row."expires_at">timezone('utc'::text,now()))
      and provider_event."status"='processed' and provider_event."user_id"=v_user
      and provider_event."environment"=grant_row."environment"
      and not public."revenuecat_authority_quarantined_internal"(provider_event."provider",v_user,provider_event."environment")
  ) into v_seat_granted;
  select exists(
    select 1 from public."paid_live_watch_party_passes" pass_row
    join public."watch_party_room_memberships" membership
      on membership."party_id"=pass_row."party_id" and membership."user_id"=pass_row."buyer_id"::text
    where pass_row."offer_id"=v_seat."id" and pass_row."buyer_id"=v_user
      and pass_row."status"='active' and pass_row."approved_at" is not null
      and membership."membership_state" in ('active','reconnecting')
      and membership."stage_role"='speaker' and membership."can_speak"
  ) into v_approved;
  if v_access."id" is null and v_seat."id" is null then
    return jsonb_build_object('allowed',true,'reason','no_creator_live_pass_required','viewerOnly',true,'seatEligible',true,'seatApproved',false,'hostAuthority',false,'grantsPublish',false,'requiresHostApproval',true);
  end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'allowed',v_access."id" is null or v_access_granted,
    'reason',case
      when v_access."id" is not null and not v_access_granted then 'exact_live_access_pass_required'
      when v_seat_granted then 'exact_live_seat_pass'
      when v_access_granted then 'exact_live_access_pass'
      when v_seat."id" is not null then 'exact_live_seat_pass_optional'
      else 'no_creator_live_pass_required' end,
    'viewerOnly',not v_approved,
    'seatEligible',v_seat."id" is null or v_seat_granted,'seatApproved',v_approved,
    'hostAuthority',false,'accessOfferId',v_access."id",'seatOfferId',v_seat."id",
    'accessPriceCents',v_access."price_cents",'seatPriceCents',v_seat."price_cents",
    'currency',coalesce(v_access."currency",v_seat."currency"),'grantsPublish',false,
    'requiresHostApproval',true
  ));
end;
$$;
revoke all on function public."resolve_live_watch_party_money_access"(text) from public,anon;
grant execute on function public."resolve_live_watch_party_money_access"(text) to authenticated,service_role;

create or replace function public."create_live_watch_party_purchase_intent"(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_offer public."paid_live_watch_party_offers"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_room public."watch_party_rooms"%rowtype;
  v_intent public."money_purchase_intents"%rowtype;
  v_now timestamptz:=timezone('utc'::text,now());
begin
  if v_user is null or not public."wave1_current_caller_authority_internal"()
    or public."is_account_access_restricted"(v_user::text)
  then raise exception 'buyer_session_authority_required'; end if;
  select offer.* into v_offer from public."paid_live_watch_party_offers" offer
  where offer."id"=p_offer_id for update;
  select room.* into v_room from public."watch_party_rooms" room where room."party_id"=v_offer."party_id";
  select product.* into v_product from public."monetization_products" product where product."id"=v_offer."product_id";
  if v_offer."id" is null or v_room."party_id" is null or v_room."room_type"<>'live'
    or not coalesce(v_room."is_active",false) or v_room."host_user_id" is distinct from v_offer."host_user_id"
    or v_offer."creator_id" is distinct from v_offer."host_user_id"
    or v_offer."status"<>'sandbox' or v_offer."environment"<>'sandbox'
    or v_product."product_type" is distinct from v_offer."pass_type"
    or v_product."provider" is distinct from v_offer."provider"
    or v_product."provider_product_id" is distinct from v_offer."provider_product_id"
  then raise exception 'exact_live_offer_not_available'; end if;
  perform public."assert_live_watch_party_sandbox_rail_internal"(v_offer."pass_type");
  if v_offer."creator_id"=v_user then raise exception 'creator_cannot_purchase_own_offer'; end if;
  if exists (select 1 from public."channel_audience_blocks" block_row
    where (block_row."channel_user_id"=v_offer."creator_id"::text and block_row."blocked_user_id"=v_user::text)
       or (block_row."channel_user_id"=v_user::text and block_row."blocked_user_id"=v_offer."creator_id"::text))
  then raise exception 'creator_money_blocked_by_audience_policy'; end if;
  if exists (select 1 from public."paid_live_watch_party_passes" pass_row
    where pass_row."offer_id"=v_offer."id" and pass_row."buyer_id"=v_user and pass_row."status"='active')
  then return jsonb_build_object('alreadyPurchased',true,'offerId',v_offer."id",'partyId',v_offer."party_id",'passType',v_offer."pass_type"); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'live-watch-party-intent:'||v_user::text||':'||v_offer."id"::text,0));
  if exists (select 1 from public."money_purchase_intents" intent
    where intent."user_id"=v_user and intent."source_id"=v_offer."id"
      and intent."source_type"=case when v_offer."pass_type"='live_watch_party_access_pass'
        then 'live_watch_party_access' else 'live_watch_party_seat' end
      and intent."status"='pending' and intent."expires_at">v_now)
  then raise exception 'live_offer_intent_already_pending'; end if;
  insert into public."money_purchase_intents"(
    "user_id","product_id","product_key","product_type","provider","provider_product_id",
    "source_type","source_id","creator_id","environment","status","amount_minor","currency",
    "idempotency_key","expires_at","metadata"
  ) values (
    v_user,v_product."id",v_product."product_key",v_offer."pass_type",v_offer."provider",v_offer."provider_product_id",
    case when v_offer."pass_type"='live_watch_party_access_pass' then 'live_watch_party_access' else 'live_watch_party_seat' end,
    v_offer."id",v_offer."creator_id",'sandbox','pending',v_offer."price_cents",v_offer."currency",
    'live_watch_party_intent:'||v_user::text||':'||gen_random_uuid()::text,v_now+interval '15 minutes',
    jsonb_build_object('party_id',v_offer."party_id",'host_user_id',v_offer."host_user_id",
      'exact_live_target',true,'viewer_access_only',v_offer."pass_type"='live_watch_party_access_pass',
      'seat_eligibility_only',v_offer."pass_type"='live_watch_party_seat_pass',
      'host_approval_required',v_offer."pass_type"='live_watch_party_seat_pass',
      'grants_livekit_authority',false,'grants_host_authority',false,'grants_moderator_authority',false,
      'sandbox_only',true,'not_payable',true,'payout_ready',false)
  ) returning * into v_intent;
  return public."money_purchase_intent_safe_row"(v_intent)||jsonb_build_object(
    'offerId',v_offer."id",'partyId',v_offer."party_id",'passType',v_offer."pass_type",
    'grantsPublish',false,'requiresHostApproval',v_offer."pass_type"='live_watch_party_seat_pass'
  );
end;
$$;
revoke all on function public."create_live_watch_party_purchase_intent"(uuid) from public,anon;
grant execute on function public."create_live_watch_party_purchase_intent"(uuid) to authenticated,service_role;

-- The provider projector is deliberately separate from the ordinary Party Room
-- ticket projector so no concept alias can turn a Live Stage pass into an
-- ordinary ticket. It consumes only one exact, unexpired intent and binds every
-- later terminal delivery to the original transaction.
create or replace function public."process_revenuecat_live_watch_party_event_atomic"(
  p_provider text,p_provider_event_id text,p_event_type text,p_user_id uuid,
  p_provider_product_id text,p_environment text,p_occurred_at timestamptz,
  p_amount_minor integer,p_currency text,p_raw_payload_hash text,p_original_transaction_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_event_id text:=trim(coalesce(p_provider_event_id,''));
  v_event_type text:=upper(trim(coalesce(p_event_type,'')));
  v_environment text:=lower(trim(coalesce(p_environment,'')));
  v_original text:=trim(coalesce(p_original_transaction_id,''));
  v_product_ref text:=trim(coalesce(p_provider_product_id,''));
  v_currency text:=lower(trim(coalesce(p_currency,'')));
  v_now timestamptz:=timezone('utc'::text,now());
  v_occurred timestamptz:=least(coalesce(p_occurred_at,v_now),v_now);
  v_active boolean;
  v_terminal boolean;
  v_rank smallint;
  v_existing public."provider_events"%rowtype;
  v_link public."revenuecat_consumable_transaction_intents"%rowtype;
  v_intent public."money_purchase_intents"%rowtype;
  v_offer public."paid_live_watch_party_offers"%rowtype;
  v_original_pass public."paid_live_watch_party_passes"%rowtype;
  v_original_provider public."provider_events"%rowtype;
  v_room public."watch_party_rooms"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_event public."provider_events"%rowtype;
  v_grant public."access_grants"%rowtype;
  v_ledger public."money_access_ledger_events"%rowtype;
  v_original_ledger public."money_access_ledger_events"%rowtype;
  v_remaining_access boolean:=false;
  v_remaining_seat boolean:=false;
  v_status text;
  v_payable text;
begin
  v_active:=v_event_type in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE');
  v_terminal:=v_event_type in ('REFUND','REVOCATION','EXPIRATION','CANCELLATION','BILLING_ISSUE','SUBSCRIPTION_PAUSED');
  v_rank:=public."revenuecat_premium_authority_rank_internal"(v_event_type,false);
  if v_provider not in ('revenuecat_app_store','revenuecat_google_play')
    or v_event_id='' or length(v_event_id)>512 or v_event_id is distinct from coalesce(p_provider_event_id,'')
    or v_event_id~'[[:cntrl:]]' or p_user_id is null or (not v_active and not v_terminal)
    or v_environment not in ('sandbox','production')
    or v_original='' or length(v_original)>512 or v_original is distinct from coalesce(p_original_transaction_id,'')
    or v_original~'[[:cntrl:]]' or v_product_ref='' or length(v_product_ref)>512 or v_product_ref~'[[:cntrl:]]'
    or coalesce(p_raw_payload_hash,'')!~'^[0-9a-f]{64}$'
  then raise exception 'live_watch_party_provider_identity_invalid'; end if;
  if v_active and (coalesce(p_amount_minor,0)<=0 or v_currency!~'^[a-z]{3}$')
  then raise exception 'live_watch_party_provider_financials_invalid'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('revenuecat-live-event:'||v_event_id,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('revenuecat-original:'||v_provider||':'||v_original,0));
  select event.* into v_existing from public."provider_events" event
  where event."provider"=v_provider and event."provider_event_id"=v_event_id for update;
  if v_existing."id" is not null then
    if v_existing."raw_payload_hash" is distinct from p_raw_payload_hash
      or v_existing."user_id" is distinct from p_user_id
      or v_existing."event_type" is distinct from v_event_type
      or v_existing."environment" is distinct from v_environment
      or v_existing."metadata"->>'original_transaction_id' is distinct from v_original
      or v_existing."metadata"->>'provider_product_id' is distinct from v_product_ref
    then raise exception 'live_watch_party_provider_event_replay_mismatch'; end if;
    return jsonb_build_object('status',v_existing."status",'reason','duplicate_provider_event',
      'providerEventId',v_existing."id",'duplicateProviderEvent',true,'authorityGranted',false);
  end if;
  select link.* into v_link from public."revenuecat_consumable_transaction_intents" link
  where link."provider"=v_provider and link."original_transaction_id"=v_original
    and link."binding_state"='exact' for update;
  if v_link."purchase_intent_id" is not null then
    select intent.* into v_intent from public."money_purchase_intents" intent
    where intent."id"=v_link."purchase_intent_id" for update;
  elsif v_active then
    select intent.* into v_intent from public."money_purchase_intents" intent
    where intent."user_id"=p_user_id and intent."provider"=v_provider
      and intent."provider_product_id"=v_product_ref and intent."environment"=v_environment
      and intent."source_type" in ('live_watch_party_access','live_watch_party_seat')
      and intent."status"='pending' and intent."expires_at">v_now
      and intent."amount_minor"=p_amount_minor and lower(intent."currency")=v_currency
    order by intent."created_at",intent."id" limit 1 for update;
    if v_intent."id" is null or exists (
      select 1 from public."money_purchase_intents" other
      where other."user_id"=p_user_id and other."provider"=v_provider
        and other."provider_product_id"=v_product_ref and other."environment"=v_environment
        and other."source_type" in ('live_watch_party_access','live_watch_party_seat')
        and other."status"='pending' and other."expires_at">v_now
        and other."amount_minor"=p_amount_minor and lower(other."currency")=v_currency
        and other."id"<>v_intent."id")
    then raise exception 'live_watch_party_purchase_intent_missing_or_ambiguous'; end if;
  else
    raise exception 'live_watch_party_original_transaction_binding_required';
  end if;
  if v_intent."user_id" is distinct from p_user_id or v_intent."provider" is distinct from v_provider
    or v_intent."provider_product_id" is distinct from v_product_ref
    or v_intent."environment" is distinct from v_environment
    or v_intent."source_type" not in ('live_watch_party_access','live_watch_party_seat')
  then raise exception 'live_watch_party_bound_intent_mismatch'; end if;
  select offer.* into v_offer from public."paid_live_watch_party_offers" offer
  where offer."id"=v_intent."source_id" for update;
  select room.* into v_room from public."watch_party_rooms" room where room."party_id"=v_offer."party_id";
  select product.* into v_product from public."monetization_products" product where product."id"=v_intent."product_id";
  if v_link."purchase_intent_id" is not null then
    select pass_row.* into v_original_pass from public."paid_live_watch_party_passes" pass_row
    where pass_row."provider_event_id"=v_link."provider_event_id"
      and pass_row."offer_id"=v_intent."source_id" and pass_row."buyer_id"=p_user_id
      and pass_row."creator_id"=v_intent."creator_id" and pass_row."pass_type"=v_intent."product_type";
    select provider_event.* into v_original_provider from public."provider_events" provider_event
    where provider_event."id"=v_link."provider_event_id";
    if v_original_pass."id" is null or v_original_provider."id" is null
      or v_original_provider."user_id" is distinct from p_user_id
      or v_original_provider."product_id" is distinct from v_intent."product_id"
      or v_original_provider."environment" is distinct from v_environment
      or v_original_provider."metadata"->>'purchase_intent_id' is distinct from v_intent."id"::text
      or v_original_provider."metadata"->>'original_transaction_id' is distinct from v_original
    then raise exception 'live_watch_party_original_transaction_pass_binding_invalid'; end if;
  else
    if v_offer."id" is null or v_room."party_id" is null or v_room."room_type"<>'live'
      or v_offer."creator_id" is distinct from v_intent."creator_id"
      or v_offer."host_user_id" is distinct from v_intent."creator_id"
      or v_room."host_user_id" is distinct from v_offer."host_user_id"
      or v_offer."pass_type" is distinct from v_product."product_type"
      or v_offer."pass_type" is distinct from v_intent."product_type"
      or v_offer."pass_type" not in ('live_watch_party_access_pass','live_watch_party_seat_pass')
    then raise exception 'live_watch_party_exact_target_binding_invalid'; end if;
    if v_offer."product_id" is distinct from v_intent."product_id"
      or v_offer."provider" is distinct from v_provider
      or v_offer."provider_product_id" is distinct from v_product_ref
      or v_offer."environment" is distinct from v_environment
      or v_offer."price_cents" is distinct from p_amount_minor
      or lower(v_offer."currency") is distinct from v_currency
      or v_product."product_key" is distinct from v_intent."product_key"
      or v_product."provider" is distinct from v_provider
      or v_product."provider_product_id" is distinct from v_product_ref
      or v_product."environment" is distinct from v_environment
      or v_intent."amount_minor" is distinct from p_amount_minor
      or lower(v_intent."currency") is distinct from v_currency
    then raise exception 'live_watch_party_active_offer_binding_stale'; end if;
    if not coalesce(v_room."is_active",false) or v_offer."status" not in ('sandbox','active')
    then raise exception 'live_watch_party_target_no_longer_available'; end if;
  end if;
  if v_active then
    if v_environment<>'sandbox' then raise exception 'live_watch_party_production_activation_not_authorized'; end if;
    perform public."assert_live_watch_party_sandbox_rail_internal"(v_intent."product_type");
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'live-watch-party-authority:'||coalesce(v_original_pass."party_id",v_offer."party_id")||':'||p_user_id::text,0
  ));
  v_status:=case when v_active then 'processed' when v_event_type='REFUND' then 'refunded'
    when v_event_type in ('REVOCATION','SUBSCRIPTION_PAUSED') then 'reversed' else 'processed' end;
  insert into public."provider_events"(
    "provider_event_id","provider","product_id","product_key","user_id","app_user_id",
    "environment","event_type","status","occurred_at","idempotency_key","raw_payload_hash","metadata"
  ) values (
    v_event_id,v_provider,v_product."id",v_product."product_key",p_user_id,p_user_id::text,
    v_environment,v_event_type,v_status,v_occurred,v_event_type||':'||v_event_id,p_raw_payload_hash,
    jsonb_build_object('provider_payload_stored',false,'provider_product_id',v_product_ref,
      'original_transaction_id',v_original,'purchase_intent_id',v_intent."id",
      'live_watch_party_offer_id',v_intent."source_id",
      'party_id',case when v_original_pass."id" is null then v_offer."party_id" else v_original_pass."party_id" end,
      'creator_id',case when v_original_pass."id" is null then v_offer."creator_id" else v_original_pass."creator_id" end,
      'host_user_id',case when v_original_pass."id" is null then v_offer."host_user_id"::text else v_original_provider."metadata"->>'host_user_id' end,
      'pass_type',case when v_original_pass."id" is null then v_offer."pass_type" else v_original_pass."pass_type" end,
      'authority_granted',false,'grants_publish',false,'payout_ready',false)
  ) returning * into v_event;
  if v_active and v_link."purchase_intent_id" is not null then
    update public."provider_events" set "status"='ignored',
      "metadata"="metadata"||jsonb_build_object(
        'final_reason','duplicate_original_transaction','provider_reconciliation_required',true,
        'provider_reconciliation_disposition','refund_or_authoritative_provider_reconciliation_required'
      ) where "id"=v_event."id" returning * into v_event;
    return jsonb_build_object('status','ignored','reason','duplicate_original_transaction',
      'providerEventId',v_event."id",'purchaseIntentId',v_intent."id",
      'environment',v_environment,'duplicateProviderEvent',false,'authorityGranted',false);
  end if;
  if v_active then
    update public."money_purchase_intents" set "status"='consumed',"consumed_at"=v_now,"updated_at"=v_now
    where "id"=v_intent."id" and "status"='pending';
    insert into public."revenuecat_consumable_transaction_intents"(
      "provider","original_transaction_id","user_id","product_id","purchase_intent_id","provider_event_id",
      "last_provider_event_id","last_occurred_at","last_event_type","last_event_rank","terminal","binding_state"
    ) values (
      v_provider,v_original,p_user_id,v_product."id",v_intent."id",v_event."id",
      v_event."id",v_occurred,v_event_type,v_rank,false,'exact'
    ) returning * into v_link;
    insert into public."access_grants"(
      "user_id","grant_type","source_type","source_id","product_id","provider","provider_event_id",
      "environment","status","starts_at","metadata"
    ) values (
      p_user_id,v_offer."pass_type",'provider_event',v_offer."id",v_product."id",v_provider,v_event."id",
      v_environment,case when v_environment='sandbox' then 'sandbox_only' else 'active' end,v_occurred,
      jsonb_build_object('purchase_intent_id',v_intent."id",'original_transaction_id',v_original,
        'party_id',v_offer."party_id",'creator_id',v_offer."creator_id",'host_user_id',v_offer."host_user_id",
        'viewer_access_only',v_offer."pass_type"='live_watch_party_access_pass',
        'seat_eligibility_only',v_offer."pass_type"='live_watch_party_seat_pass',
        'host_approval_required',v_offer."pass_type"='live_watch_party_seat_pass',
        'authority_granted',false,'payment_role_authority',false,'payment_media_authority',false)
    ) returning * into v_grant;
    insert into public."paid_live_watch_party_passes"(
      "offer_id","party_id","buyer_id","creator_id","pass_type","access_grant_id","provider_event_id","status"
    ) values (v_offer."id",v_offer."party_id",p_user_id,v_offer."creator_id",v_offer."pass_type",v_grant."id",v_event."id",'active');
    v_payable:=case when v_environment='sandbox' then 'not_payable' else 'pending_verification' end;
    insert into public."money_access_ledger_events"(
      "user_id","creator_id","product_id","provider_event_id","event_type","amount_minor","currency",
      "environment","payable_state","status","source_type","source_id","metadata"
    ) values (
      p_user_id,v_offer."creator_id",v_product."id",v_event."id",v_event_type,p_amount_minor,v_currency,
      v_environment,v_payable,case when v_environment='sandbox' then 'sandbox_only' else 'verified' end,
      v_intent."source_type",v_offer."id",jsonb_build_object('purchase_intent_id',v_intent."id",
        'original_transaction_id',v_original,'party_id',v_offer."party_id",'pass_type',v_offer."pass_type",
        'completion_required',true,'post_completion_hold_hours',48,'reserve_basis_points',1000,
        'payout_readiness_proved',false,'grants_livekit_authority',false)
    ) returning * into v_ledger;
    return jsonb_build_object('status','processed','reason','exact_live_watch_party_purchase_applied',
      'productKey',v_product."product_key",'productType',v_product."product_type",
      'providerEventId',v_event."id",'purchaseIntentId',v_intent."id",'accessGrantId',v_grant."id",
      'ledgerEventId',v_ledger."id",'grantStatus',v_grant."status",'payableState',v_ledger."payable_state",
      'environment',v_environment,'duplicateProviderEvent',false,'authorityGranted',false);
  end if;
  if v_link."last_occurred_at">v_occurred
    or (v_link."last_occurred_at"=v_occurred and v_link."last_event_rank">=v_rank)
  then
    update public."provider_events" set "status"='ignored',"metadata"="metadata"||jsonb_build_object('final_reason','stale_terminal_event') where "id"=v_event."id";
    return jsonb_build_object('status','ignored','reason','stale_terminal_event','providerEventId',v_event."id",'authorityGranted',false);
  end if;
  update public."revenuecat_consumable_transaction_intents"
  set "last_provider_event_id"=v_event."id","last_occurred_at"=v_occurred,"last_event_type"=v_event_type,
      "last_event_rank"=v_rank,"terminal"=v_event_type in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED')
  where "provider"=v_provider and "original_transaction_id"=v_original and "binding_state"='exact';
  update public."access_grants" set
    "status"=case when v_event_type='REFUND' then 'refunded' when v_event_type='EXPIRATION' then 'expired' else 'revoked' end,
    "refunded_at"=case when v_event_type='REFUND' then v_occurred else "refunded_at" end,
    "revoked_at"=case when v_event_type<>'REFUND' then v_occurred else "revoked_at" end,
    "revoke_reason"=lower(v_event_type),"updated_at"=v_now
  where "user_id"=p_user_id and "source_id"=v_original_pass."offer_id" and "grant_type"=v_original_pass."pass_type"
    and "metadata"->>'original_transaction_id'=v_original;
  update public."paid_live_watch_party_passes" set
    "status"=case when v_event_type='REFUND' then 'refunded' when v_event_type='EXPIRATION' then 'expired' else 'revoked' end,
    "refunded_at"=case when v_event_type='REFUND' then v_occurred else "refunded_at" end,
    "revoked_at"=case when v_event_type<>'REFUND' then v_occurred else "revoked_at" end,
    "updated_at"=v_now
  where "provider_event_id"=v_link."provider_event_id" and "offer_id"=v_original_pass."offer_id" and "buyer_id"=p_user_id;
  select ledger.* into v_original_ledger from public."money_access_ledger_events" ledger
  where ledger."user_id"=p_user_id and ledger."source_id"=v_original_pass."offer_id"
    and ledger."metadata"->>'original_transaction_id'=v_original
    and ledger."event_type" in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE')
  order by ledger."created_at" limit 1 for update;
  insert into public."money_access_ledger_events"(
    "user_id","creator_id","product_id","provider_event_id","event_type","amount_minor","currency",
    "environment","payable_state","status","source_type","source_id","metadata"
  ) values (
    p_user_id,v_original_pass."creator_id",v_product."id",v_event."id",v_event_type,
    coalesce(v_original_ledger."amount_minor",v_intent."amount_minor"),
    coalesce(v_original_ledger."currency",v_intent."currency"),v_environment,
    case when v_event_type='REFUND' then 'refunded' when v_event_type='REVOCATION' then 'reversed' else 'not_payable' end,
    case when v_event_type='REFUND' then 'refunded' when v_event_type='REVOCATION' then 'reversed' else 'ignored' end,
    v_intent."source_type",v_original_pass."offer_id",jsonb_build_object(
      'purchase_intent_id',v_intent."id",'original_transaction_id',v_original,
      'party_id',v_original_pass."party_id",'pass_type',v_original_pass."pass_type",
      'reverses_provider_event_id',v_link."provider_event_id",'authority_granted',false,
      'immutable_terminal_evidence',true,'payout_readiness_proved',false
    )
  ) returning * into v_ledger;
  select exists(
    select 1 from public."paid_live_watch_party_passes" pass_row
    join public."paid_live_watch_party_offers" offer on offer."id"=pass_row."offer_id"
    join public."access_grants" grant_row on grant_row."id"=pass_row."access_grant_id"
    where pass_row."party_id"=v_original_pass."party_id" and pass_row."buyer_id"=p_user_id
      and pass_row."status"='active' and offer."status" in ('sandbox','active')
      and pass_row."pass_type"='live_watch_party_access_pass'
      and grant_row."status" in ('active','sandbox_only') and grant_row."revoked_at" is null
      and grant_row."refunded_at" is null
      and (grant_row."expires_at" is null or grant_row."expires_at">v_now)
  ) into v_remaining_access;
  select exists(
    select 1 from public."paid_live_watch_party_passes" pass_row
    join public."paid_live_watch_party_offers" offer on offer."id"=pass_row."offer_id"
    join public."access_grants" grant_row on grant_row."id"=pass_row."access_grant_id"
    where pass_row."party_id"=v_original_pass."party_id" and pass_row."buyer_id"=p_user_id
      and pass_row."status"='active' and offer."status" in ('sandbox','active')
      and pass_row."pass_type"='live_watch_party_seat_pass'
      and grant_row."status" in ('active','sandbox_only') and grant_row."revoked_at" is null
      and grant_row."refunded_at" is null
      and (grant_row."expires_at" is null or grant_row."expires_at">v_now)
  ) into v_remaining_seat;
  if not v_remaining_access and exists (select 1 from public."paid_live_watch_party_offers" offer
    where offer."party_id"=v_original_pass."party_id" and offer."pass_type"='live_watch_party_access_pass'
      and offer."status" in ('sandbox','active')) then
    update public."watch_party_room_memberships" set "role"='viewer',"stage_role"='listener',
      "can_speak"=false,"camera_enabled"=false,"mic_enabled"=false,"membership_state"='removed',
      "left_at"=coalesce("left_at",v_now),"updated_at"=v_now
    where "party_id"=v_original_pass."party_id" and "user_id"=p_user_id::text
      and "membership_state" in ('active','reconnecting');
  elsif not v_remaining_seat and exists (select 1 from public."paid_live_watch_party_offers" offer
    where offer."party_id"=v_original_pass."party_id" and offer."pass_type"='live_watch_party_seat_pass'
      and offer."status" in ('sandbox','active')) then
    update public."watch_party_room_memberships" set "role"='viewer',"stage_role"='listener',
      "can_speak"=false,"camera_enabled"=false,"mic_enabled"=false,"updated_at"=v_now
    where "party_id"=v_original_pass."party_id" and "user_id"=p_user_id::text
      and "membership_state" in ('active','reconnecting');
  end if;
  return jsonb_build_object('status',v_status,'reason','exact_live_watch_party_terminal_applied',
    'productKey',v_product."product_key",'productType',v_product."product_type",
    'providerEventId',v_event."id",'purchaseIntentId',v_intent."id",'ledgerEventId',v_ledger."id",
    'grantStatus',case when v_event_type='REFUND' then 'refunded' else 'revoked' end,
    'environment',v_environment,'duplicateProviderEvent',false,'authorityGranted',false);
end;
$$;
revoke all on function public."process_revenuecat_live_watch_party_event_atomic"(text,text,text,uuid,text,text,timestamptz,integer,text,text,text) from public,anon,authenticated;
grant execute on function public."process_revenuecat_live_watch_party_event_atomic"(text,text,text,uuid,text,text,timestamptz,integer,text,text,text) to service_role;

alter function public."process_revenuecat_terminal_event_atomic"(
  text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,text,text
) rename to "process_revenuecat_terminal_event_atomic_pre_live_money_rfgc";
create or replace function public."process_revenuecat_terminal_event_atomic"(
  p_provider text,p_provider_event_id text,p_event_type text,p_user_id uuid,
  p_reported_provider_product_id text,p_reported_provider_base_plan_id text,p_environment text,
  p_entitlement_status text,p_starts_at timestamptz,p_expires_at timestamptz,p_occurred_at timestamptz,
  p_raw_payload_hash text,p_period_type text,p_store text,p_platform text,p_original_transaction_id text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_intent public."money_purchase_intents"%rowtype; v_result jsonb;
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_reported_product text:=nullif(trim(coalesce(p_reported_provider_product_id,'')),'');
  v_reported_base_plan text:=nullif(trim(coalesce(p_reported_provider_base_plan_id,'')),'');
begin
  select intent.* into v_intent
  from public."revenuecat_consumable_transaction_intents" link
  join public."money_purchase_intents" intent on intent."id"=link."purchase_intent_id"
  where link."provider"=lower(trim(coalesce(p_provider,'')))
    and link."original_transaction_id"=trim(coalesce(p_original_transaction_id,''))
    and link."binding_state"='exact';
  if v_intent."source_type" in ('live_watch_party_access','live_watch_party_seat') then
    if not (
      (v_provider='revenuecat_app_store' and lower(trim(coalesce(p_store,'')))='app_store' and lower(trim(coalesce(p_platform,'')))='ios')
      or (v_provider='revenuecat_google_play' and lower(trim(coalesce(p_store,'')))='google_play' and lower(trim(coalesce(p_platform,'')))='android')
    ) or length(trim(coalesce(p_provider_event_id,'')))>512
      or trim(coalesce(p_provider_event_id,''))~'[[:cntrl:]]'
      or length(trim(coalesce(p_original_transaction_id,'')))>512
      or trim(coalesce(p_original_transaction_id,''))~'[[:cntrl:]]'
      or (v_reported_product is not null and (length(v_reported_product)>512 or v_reported_product~'[[:cntrl:]]'))
      or (v_reported_base_plan is not null and (length(v_reported_base_plan)>512 or v_reported_base_plan~'[[:cntrl:]]'))
    then raise exception 'revenuecat_terminal_dispatch_identity_invalid'; end if;
    v_result:=public."process_revenuecat_live_watch_party_event_atomic"(
      p_provider,p_provider_event_id,p_event_type,p_user_id,v_intent."provider_product_id",
      p_environment,p_occurred_at,v_intent."amount_minor",v_intent."currency",
      p_raw_payload_hash,p_original_transaction_id
    );
    update public."provider_events" provider_event set
      "metadata"=coalesce(provider_event."metadata",'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(
        'terminal_dispatch_domain','creator_money',
        'reported_provider_product_id',v_reported_product,
        'reported_provider_base_plan_id',v_reported_base_plan,
        'reported_product_mismatch',v_reported_product is distinct from v_intent."provider_product_id"
      ))
    where provider_event."provider"=v_provider
      and provider_event."provider_event_id"=trim(coalesce(p_provider_event_id,''));
    return v_result||jsonb_build_object(
      'domain','creator_money','originalTransactionId',p_original_transaction_id,
      'duplicateEvent',coalesce((v_result->>'duplicateProviderEvent')::boolean,false),
      'authorityGranted',false
    );
  end if;
  return public."process_revenuecat_terminal_event_atomic_pre_live_money_rfgc"(
    p_provider,p_provider_event_id,p_event_type,p_user_id,p_reported_provider_product_id,
    p_reported_provider_base_plan_id,p_environment,p_entitlement_status,p_starts_at,p_expires_at,
    p_occurred_at,p_raw_payload_hash,p_period_type,p_store,p_platform,p_original_transaction_id
  );
end; $$;
revoke all on function public."process_revenuecat_terminal_event_atomic_pre_live_money_rfgc"(
  text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,text,text
) from public,anon,authenticated,service_role;
revoke all on function public."process_revenuecat_terminal_event_atomic"(
  text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,text,text
) from public,anon,authenticated;
grant execute on function public."process_revenuecat_terminal_event_atomic"(
  text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,text,text
) to service_role;

-- Membership lifecycle records exact buyer use for both distinct money paths.
-- Live Seat payment is only eligibility: a host-approved persisted speaker
-- membership records the separate approval fact, but this trigger grants no role.
create or replace function public."record_watch_party_money_pass_use_internal"()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if coalesce(new."user_id",'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return new;
  end if;
  update public."paid_watch_party_tickets" ticket set
    "used_at"=coalesce(ticket."used_at",timezone('utc'::text,now()))
  where ticket."party_id"=new."party_id" and ticket."buyer_id"=new."user_id"::uuid
    and ticket."status"='active' and ticket."refunded_at" is null and ticket."revoked_at" is null;
  update public."paid_live_watch_party_passes" pass_row set
    "meaningful_entry_at"=coalesce(pass_row."meaningful_entry_at",timezone('utc'::text,now())),
    "reviewed_at"=case when pass_row."pass_type"='live_watch_party_seat_pass' and new."stage_role"='speaker'
      then coalesce(pass_row."reviewed_at",timezone('utc'::text,now())) else pass_row."reviewed_at" end,
    "approved_at"=case when pass_row."pass_type"='live_watch_party_seat_pass' and new."stage_role"='speaker'
      then coalesce(pass_row."approved_at",timezone('utc'::text,now())) else pass_row."approved_at" end,
    "updated_at"=timezone('utc'::text,now())
  where pass_row."party_id"=new."party_id" and pass_row."buyer_id"=new."user_id"::uuid
    and pass_row."status"='active';
  return new;
end; $$;
revoke all on function public."record_watch_party_money_pass_use_internal"() from public,anon,authenticated,service_role;
create trigger "record_live_watch_party_pass_use"
after insert or update of "membership_state","stage_role" on public."watch_party_room_memberships"
for each row when (new."membership_state" in ('active','reconnecting'))
execute function public."record_watch_party_money_pass_use_internal"();

-- #327 completion is strengthened at the receipt boundary: an ordinary Party
-- Room obligation cannot complete until the exact buyer's exact provider-backed
-- ticket recorded meaningful room use. A room ending alone is insufficient.
create or replace function public."enforce_exact_watch_party_ticket_completion_internal"()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new."source_type"<>'watch_party_ticket' then return new; end if;
  if not exists (
    select 1 from public."creator_earnings_ledger" earning
    join public."money_access_ledger_events" money
      on money."id"=earning."money_ledger_event_id"
     and money."creator_id"=earning."creator_id"
     and money."source_type"='watch_party_live'
     and money."source_id"=earning."source_id"
    join public."paid_watch_party_tickets" ticket
      on ticket."offer_id"=earning."source_id"
     and ticket."creator_id"=earning."creator_id"
     and ticket."buyer_id"=money."user_id"
     and ticket."status"='active' and ticket."used_at" is not null
     and ticket."refunded_at" is null and ticket."revoked_at" is null
    join public."access_grants" grant_row
      on grant_row."id"=ticket."access_grant_id"
     and grant_row."user_id"=money."user_id" and grant_row."source_id"=ticket."offer_id"
     and grant_row."provider_event_id"=money."provider_event_id"
     and grant_row."status" in ('active','sandbox_only')
     and grant_row."refunded_at" is null and grant_row."revoked_at" is null
    join public."provider_events" provider_event
      on provider_event."id"=money."provider_event_id"
     and provider_event."user_id"=money."user_id" and provider_event."status"='processed'
     and provider_event."provider_event_id"=ticket."provider_transaction_id"
    join public."paid_watch_party_offers" offer
      on offer."id"=earning."source_id" and offer."party_id"=ticket."party_id"
     and offer."creator_id"=earning."creator_id"
     and offer."status" not in ('canceled','blocked','archived')
     and offer."ends_at" is not null and offer."ends_at"<=timezone('utc'::text,now())
    join public."watch_party_rooms" room
      on room."party_id"=offer."party_id" and room."room_type"='title'
     and not coalesce(room."is_active",true)
    where earning."id"=new."earnings_ledger_id"
      and earning."creator_id"=new."creator_id"
      and earning."source_type"=new."source_type"
      and earning."source_id"=new."source_id"
  ) then raise exception 'exact_watch_party_ticket_meaningful_use_required'; end if;
  return new;
end; $$;
revoke all on function public."enforce_exact_watch_party_ticket_completion_internal"()
  from public,anon,authenticated,service_role;
create trigger "enforce_exact_watch_party_ticket_completion"
before insert on public."creator_money_obligation_completion_receipts"
for each row execute function public."enforce_exact_watch_party_ticket_completion_internal"();

-- Extend LiveKit route authority without conflating an ordinary ticket or a
-- Live Access Pass with seat eligibility. Speaker publication still requires a
-- fresh host-approved membership in the Edge Function.
create or replace function public."resolve_live_watch_party_money_access_as_service_internal"(p_party_id text,p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_access_offer public."paid_live_watch_party_offers"%rowtype;
  v_seat_offer public."paid_live_watch_party_offers"%rowtype;
  v_access_pass public."paid_live_watch_party_passes"%rowtype;
  v_seat_pass public."paid_live_watch_party_passes"%rowtype;
  v_access_grant public."access_grants"%rowtype;
  v_seat_grant public."access_grants"%rowtype;
  v_allowed boolean;
  v_speaker_eligible boolean;
  v_expiry timestamptz;
begin
  select offer.* into v_access_offer from public."paid_live_watch_party_offers" offer
  where offer."party_id"=p_party_id and offer."pass_type"='live_watch_party_access_pass'
    and offer."status" in ('sandbox','active')
    and (offer."starts_at" is null or offer."starts_at"<=timezone('utc'::text,now()))
    and (offer."ends_at" is null or offer."ends_at">timezone('utc'::text,now()));
  select offer.* into v_seat_offer from public."paid_live_watch_party_offers" offer
  where offer."party_id"=p_party_id and offer."pass_type"='live_watch_party_seat_pass'
    and offer."status" in ('sandbox','active')
    and (offer."starts_at" is null or offer."starts_at"<=timezone('utc'::text,now()))
    and (offer."ends_at" is null or offer."ends_at">timezone('utc'::text,now()));
  select pass_row.* into v_access_pass from public."paid_live_watch_party_passes" pass_row
  where pass_row."offer_id"=v_access_offer."id" and pass_row."party_id"=p_party_id
    and pass_row."buyer_id"=p_user_id and pass_row."pass_type"='live_watch_party_access_pass'
    and pass_row."status"='active' order by pass_row."created_at" desc limit 1;
  select pass_row.* into v_seat_pass from public."paid_live_watch_party_passes" pass_row
  where pass_row."offer_id"=v_seat_offer."id" and pass_row."party_id"=p_party_id
    and pass_row."buyer_id"=p_user_id and pass_row."pass_type"='live_watch_party_seat_pass'
    and pass_row."status"='active' order by pass_row."created_at" desc limit 1;
  select grant_row.* into v_access_grant from public."access_grants" grant_row
  join public."provider_events" provider_event on provider_event."id"=v_access_pass."provider_event_id"
  where grant_row."id"=v_access_pass."access_grant_id" and grant_row."user_id"=p_user_id
    and grant_row."source_id"=v_access_offer."id" and grant_row."grant_type"='live_watch_party_access_pass'
    and grant_row."status" in ('active','sandbox_only') and grant_row."revoked_at" is null
    and grant_row."refunded_at" is null and grant_row."starts_at"<=timezone('utc'::text,now())
    and (grant_row."expires_at" is null or grant_row."expires_at">timezone('utc'::text,now()))
    and provider_event."status"='processed' and provider_event."user_id"=p_user_id
    and provider_event."environment"=grant_row."environment"
    and not public."revenuecat_authority_quarantined_internal"(provider_event."provider",p_user_id,provider_event."environment");
  select grant_row.* into v_seat_grant from public."access_grants" grant_row
  join public."provider_events" provider_event on provider_event."id"=v_seat_pass."provider_event_id"
  where grant_row."id"=v_seat_pass."access_grant_id" and grant_row."user_id"=p_user_id
    and grant_row."source_id"=v_seat_offer."id" and grant_row."grant_type"='live_watch_party_seat_pass'
    and grant_row."status" in ('active','sandbox_only') and grant_row."revoked_at" is null
    and grant_row."refunded_at" is null and grant_row."starts_at"<=timezone('utc'::text,now())
    and (grant_row."expires_at" is null or grant_row."expires_at">timezone('utc'::text,now()))
    and provider_event."status"='processed' and provider_event."user_id"=p_user_id
    and provider_event."environment"=grant_row."environment"
    and not public."revenuecat_authority_quarantined_internal"(provider_event."provider",p_user_id,provider_event."environment");
  v_allowed:=v_access_offer."id" is null or v_access_grant."id" is not null;
  v_speaker_eligible:=v_seat_offer."id" is null or v_seat_grant."id" is not null;
  v_expiry:=least(
    coalesce(v_access_grant."expires_at",timezone('utc'::text,now())+interval '30 seconds'),
    coalesce(v_seat_grant."expires_at",timezone('utc'::text,now())+interval '30 seconds'),
    timezone('utc'::text,now())+interval '30 seconds'
  );
  return jsonb_build_object('allowed',v_allowed,
    'paidSeatRequired',v_access_offer."id" is not null or v_seat_offer."id" is not null,
    'speakerEligible',v_allowed and v_speaker_eligible,'hostAuthority',false,
    'expiresAt',case when v_access_offer."id" is null and v_seat_offer."id" is null then null else v_expiry end,
    'reason',case
      when not v_allowed then 'exact_live_access_authority_required'
      when not v_speaker_eligible then 'exact_live_seat_eligibility_authority_required'
      when v_seat_grant."id" is not null then 'exact_live_seat_eligibility_authority'
      when v_access_grant."id" is not null then 'exact_live_access_viewer_authority'
      else 'non_seat_room_authority' end);
end; $$;

-- The shared host participant RPC is also a media-authority producer. For Live
-- Stage rooms it must consume the exact seat-eligibility decision before it can
-- persist speaker state; the LiveKit Edge fallback is defense in depth, not the
-- first authority boundary.
alter function public."set_watch_party_participant_authority"(text,text,text,boolean,text)
  rename to "set_watch_party_participant_authority_pre_live_money_rfgc";
create or replace function public."set_watch_party_participant_authority"(
  p_party_id text,p_target_user_id text,p_stage_role text default 'listener',
  p_host_muted boolean default false,p_membership_state text default 'active'
)
returns setof public."watch_party_room_memberships"
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_target uuid;
  v_room public."watch_party_rooms"%rowtype;
  v_authority jsonb;
begin
  if lower(trim(coalesce(p_stage_role,'listener')))='speaker' then
    select room.* into v_room from public."watch_party_rooms" room
    where room."party_id"=upper(trim(coalesce(p_party_id,'')));
    if v_room."room_type"='live' then
      if v_actor is null or v_room."host_user_id" is distinct from v_actor
      then raise exception 'watch_party_host_authority_required'; end if;
      if trim(coalesce(p_target_user_id,''))!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then raise exception 'exact_live_seat_eligibility_authority_required'; end if;
      v_target:=trim(p_target_user_id)::uuid;
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        'live-watch-party-authority:'||v_room."party_id"||':'||v_target::text,0
      ));
      v_authority:=public."resolve_live_watch_party_money_access_as_service_internal"(
        v_room."party_id",v_target
      );
      if coalesce((v_authority->>'allowed')::boolean,false) is not true
        or coalesce((v_authority->>'speakerEligible')::boolean,false) is not true
      then raise exception 'exact_live_seat_eligibility_authority_required'; end if;
    end if;
  end if;
  return query select * from public."set_watch_party_participant_authority_pre_live_money_rfgc"(
    p_party_id,p_target_user_id,p_stage_role,p_host_muted,p_membership_state
  );
end; $$;
revoke all on function public."set_watch_party_participant_authority_pre_live_money_rfgc"(text,text,text,boolean,text)
  from public,anon,authenticated,service_role;
revoke all on function public."set_watch_party_participant_authority"(text,text,text,boolean,text)
  from public,anon,service_role;
grant execute on function public."set_watch_party_participant_authority"(text,text,text,boolean,text)
  to authenticated;

create or replace function public."resolve_live_watch_party_livekit_authority_internal"(
  p_party_id text,p_user_id uuid
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_access jsonb; v_room public."watch_party_rooms"%rowtype;
begin
  select room.* into v_room from public."watch_party_rooms" room where room."party_id"=p_party_id;
  if v_room."party_id" is null or v_room."room_type"<>'live' then return null; end if;
  if v_room."host_user_id"=p_user_id then return jsonb_build_object(
    'allowed',true,'paidSeatRequired',false,'speakerEligible',true,'hostAuthority',true,
    'expiresAt',null,'reason','non_seat_room_host_authority'); end if;
  select public."resolve_live_watch_party_money_access_as_service_internal"(p_party_id,p_user_id) into v_access;
  return v_access;
end; $$;

alter function public."resolve_watch_party_livekit_viewer_authority"(text,uuid,uuid)
  rename to "resolve_watch_party_livekit_authority_pre_live_rfgc";
create or replace function public."resolve_watch_party_livekit_viewer_authority"(
  p_party_id text,p_user_id uuid,p_session_generation uuid
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_room_type text; v_baseline jsonb; v_live jsonb;
begin
  v_baseline:=public."resolve_watch_party_livekit_authority_pre_live_rfgc"(
    p_party_id,p_user_id,p_session_generation
  );
  if coalesce((v_baseline->>'allowed')::boolean,false) is not true then return v_baseline; end if;
  select room."room_type" into v_room_type from public."watch_party_rooms" room
  where room."party_id"=p_party_id;
  if v_room_type='live' then
    v_live:=public."resolve_live_watch_party_livekit_authority_internal"(p_party_id,p_user_id);
    if v_live is null then return jsonb_build_object(
      'allowed',false,'paidSeatRequired',true,'speakerEligible',false,'hostAuthority',false,
      'expiresAt',null,'reason','exact_live_pass_authority_required'); end if;
    return v_live;
  end if;
  return v_baseline||jsonb_build_object(
    'speakerEligible',coalesce((v_baseline->>'hostAuthority')::boolean,false)
      or not coalesce((v_baseline->>'paidSeatRequired')::boolean,false)
  );
end; $$;
revoke all on function public."resolve_watch_party_livekit_authority_pre_live_rfgc"(text,uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public."resolve_watch_party_livekit_viewer_authority"(text,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public."resolve_watch_party_livekit_viewer_authority"(text,uuid,uuid) to service_role;
revoke all on function public."resolve_live_watch_party_money_access_as_service_internal"(text,uuid) from public,anon,authenticated,service_role;
revoke all on function public."resolve_live_watch_party_livekit_authority_internal"(text,uuid) from public,anon,authenticated,service_role;

-- Completion-based settlement: exact live access requires meaningful entry and
-- a canonical ended room. A seat pass additionally requires recorded host
-- approval; rejection/no-review stays remedy-reviewable and cannot mature.
alter table public."creator_earnings_ledger" drop constraint if exists "creator_earnings_ledger_source_type_check";
alter table public."creator_earnings_ledger" add constraint "creator_earnings_ledger_source_type_check" check ("source_type" in (
  'tip','paid_content','product','ad','sponsor','adjustment','refund','chargeback','payout',
  'watch_party_ticket','live_watch_party_access','live_watch_party_seat','event_pass','vip_pass','channel_subscription'
));
create or replace function public."creator_money_source_type_for_product"(p_product_type text)
returns text language sql immutable set search_path='' as $$ select case lower(trim(coalesce(p_product_type,'')))
  when 'creator_tip' then 'tip' when 'paid_content_access' then 'paid_content'
  when 'watch_party_live_ticket' then 'watch_party_ticket'
  when 'live_watch_party_access_pass' then 'live_watch_party_access'
  when 'live_watch_party_seat_pass' then 'live_watch_party_seat'
  when 'event_pass' then 'event_pass' when 'vip_pass' then 'vip_pass'
  when 'channel_subscription' then 'channel_subscription' else 'adjustment' end $$;
revoke all on function public."creator_money_source_type_for_product"(text) from public,anon,authenticated;
grant execute on function public."creator_money_source_type_for_product"(text) to service_role;

alter table public."creator_money_settlement_policies" drop constraint if exists "creator_money_settlement_policy_source_check";
alter table public."creator_money_settlement_policies" add constraint "creator_money_settlement_policy_source_check" check (
  "source_type" in ('tip','paid_content','channel_subscription','vip_pass','watch_party_ticket',
    'live_watch_party_access','live_watch_party_seat','event_pass'));
insert into public."creator_money_settlement_policies"(
  "source_type","normal_hold","requires_obligation_completion","post_completion_hold",
  "reserve_basis_points","reserve_duration","policy_version"
) values
  ('live_watch_party_access',null,true,interval '48 hours',1000,interval '30 days','2026-09-01-live-rfgc-v1'),
  ('live_watch_party_seat',null,true,interval '48 hours',1000,interval '30 days','2026-09-01-live-rfgc-v1')
on conflict ("source_type") do update set "normal_hold"=excluded."normal_hold",
  "requires_obligation_completion"=excluded."requires_obligation_completion",
  "post_completion_hold"=excluded."post_completion_hold","reserve_basis_points"=excluded."reserve_basis_points",
  "reserve_duration"=excluded."reserve_duration","policy_version"=excluded."policy_version";

alter table public."creator_money_obligation_completion_receipts"
  drop constraint if exists "creator_money_obligation_completion_source_check";
alter table public."creator_money_obligation_completion_receipts"
  add constraint "creator_money_obligation_completion_source_check" check (
    "source_type" in ('watch_party_ticket','live_watch_party_access','live_watch_party_seat','event_pass'));
alter table public."creator_money_obligation_completion_receipts"
  drop constraint if exists "creator_money_obligation_completion_evidence_source_check";
alter table public."creator_money_obligation_completion_receipts"
  add constraint "creator_money_obligation_completion_evidence_source_check" check (
    "evidence_source" in ('canonical_event_lifecycle','canonical_watch_party_lifecycle','canonical_live_watch_party_lifecycle'));

alter table public."notifications" drop constraint if exists "notifications_notification_type_check";
alter table public."notifications" add constraint "notifications_notification_type_check" check ("notification_type" in (
  'followed_creator_live','circle_friend_live','event_starts_soon','watch_party_starts_soon','public_upload',
  'replay_later','creator_went_live','upcoming_event_reminder','new_message','access_granted','content_dropped',
  'reply_comment','moderation_notice','payment_access_confirmation','chilly_chat_call','chilly_chat_missed_call',
  'paid_video_unlocked','watch_party_ticket_ready','live_watch_party_access_ready','live_watch_party_seat_eligible',
  'channel_subscription_active','vip_access_active','event_pass_active','tip_sent_receipt','paid_video_sold',
  'watch_party_ticket_sold','live_watch_party_access_sold','live_watch_party_seat_sold',
  'channel_subscription_started','vip_pass_sold','event_pass_sold','tip_received','creator_money_refunded',
  'creator_money_revoked','event_pass_event_starts_soon','watch_party_ticket_room_starts_soon','payout_readiness_updated'
));

create or replace function public."record_live_watch_party_money_obligation_completion"(
  p_earnings_ledger_id uuid,p_evidence_hash text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_earning public."creator_earnings_ledger"%rowtype; v_pass public."paid_live_watch_party_passes"%rowtype;
  v_money public."money_access_ledger_events"%rowtype; v_room public."watch_party_rooms"%rowtype;
  v_offer public."paid_live_watch_party_offers"%rowtype; v_grant public."access_grants"%rowtype;
  v_provider public."provider_events"%rowtype;
  v_receipt public."creator_money_obligation_completion_receipts"%rowtype;
begin
  if auth.role()<>'service_role' or coalesce(p_evidence_hash,'')!~'^[0-9a-f]{64}$'
  then raise exception 'trusted_live_completion_evidence_required'; end if;
  select earning.* into v_earning from public."creator_earnings_ledger" earning
  where earning."id"=p_earnings_ledger_id for update;
  if v_earning."source_type" not in ('live_watch_party_access','live_watch_party_seat')
    or v_earning."source_id" is null or v_earning."money_ledger_event_id" is null
  then raise exception 'live_completion_earning_invalid'; end if;
  select money.* into v_money from public."money_access_ledger_events" money
  where money."id"=v_earning."money_ledger_event_id" and money."creator_id"=v_earning."creator_id";
  select pass_row.* into v_pass from public."paid_live_watch_party_passes" pass_row
  where pass_row."offer_id"=v_earning."source_id" and pass_row."creator_id"=v_earning."creator_id"
    and pass_row."buyer_id"=v_money."user_id" and pass_row."provider_event_id"=v_money."provider_event_id"
    and pass_row."status"='active' order by pass_row."created_at" limit 1;
  select offer.* into v_offer from public."paid_live_watch_party_offers" offer where offer."id"=v_pass."offer_id";
  select grant_row.* into v_grant from public."access_grants" grant_row
  where grant_row."id"=v_pass."access_grant_id";
  select provider_event.* into v_provider from public."provider_events" provider_event
  where provider_event."id"=v_grant."provider_event_id";
  select room.* into v_room from public."watch_party_rooms" room where room."party_id"=v_pass."party_id";
  if v_money."id" is null or v_pass."id" is null or v_offer."id" is null
    or v_room."party_id" is null or v_room."room_type"<>'live' or coalesce(v_room."is_active",true)
    or v_offer."party_id" is distinct from v_pass."party_id"
    or v_offer."creator_id" is distinct from v_pass."creator_id"
    or v_offer."host_user_id" is distinct from v_room."host_user_id"
    or v_money."source_type" is distinct from v_earning."source_type"
    or v_money."source_id" is distinct from v_earning."source_id"
    or v_grant."id" is null or v_grant."user_id" is distinct from v_pass."buyer_id"
    or v_grant."source_id" is distinct from v_pass."offer_id"
    or v_grant."status" not in ('active','sandbox_only') or v_grant."revoked_at" is not null
    or v_grant."refunded_at" is not null or v_provider."status"<>'processed'
    or v_provider."user_id" is distinct from v_pass."buyer_id"
    or v_pass."meaningful_entry_at" is null
    or (v_earning."source_type"='live_watch_party_seat' and v_pass."approved_at" is null)
  then raise exception 'canonical_live_obligation_not_completed'; end if;
  insert into public."creator_money_obligation_completion_receipts"(
    "earnings_ledger_id","creator_id","source_type","source_id","evidence_source","evidence_hash"
  ) values (v_earning."id",v_earning."creator_id",v_earning."source_type",v_earning."source_id",
    'canonical_live_watch_party_lifecycle',p_evidence_hash)
  on conflict ("earnings_ledger_id") do nothing returning * into v_receipt;
  if v_receipt."id" is null then select receipt.* into v_receipt
    from public."creator_money_obligation_completion_receipts" receipt
    where receipt."earnings_ledger_id"=v_earning."id"; end if;
  if v_receipt."evidence_hash" is distinct from p_evidence_hash
  then raise exception 'live_completion_replay_mismatch'; end if;
  return jsonb_build_object('status','recorded','receiptId',v_receipt."id",'completedAt',v_receipt."completed_at");
end; $$;
revoke all on function public."record_live_watch_party_money_obligation_completion"(uuid,text) from public,anon,authenticated;
grant execute on function public."record_live_watch_party_money_obligation_completion"(uuid,text) to service_role;

comment on table public."paid_live_watch_party_offers" is
  'Exact Live Stage creator offers. Access and seat eligibility are distinct and bound to one live room/host/product.';
comment on table public."paid_live_watch_party_passes" is
  'Provider-backed exact Live Stage passes. Seat rows record host review/approval separately from payment.';
