-- Creator-money production-readiness hardening and iOS parity.
-- Source-only until this PR is intentionally admitted and deployed. All live-money,
-- payout, provider mutation, store submission, and public-release switches stay off.

alter table public."platform_role_memberships"
  add column if not exists "expires_at" timestamptz;
create index if not exists "platform_role_memberships_active_expiry_idx"
  on public."platform_role_memberships" ("role", "status", "expires_at");

create or replace function public."has_platform_role"(required_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and coalesce(array_length(required_roles, 1), 0) > 0
    and exists (
      select 1 from public."platform_role_memberships" membership
      where membership."status" = 'active'
        and membership."role" = any(required_roles)
        and (membership."expires_at" is null or membership."expires_at" > timezone('utc'::text, now()))
        and (
          membership."user_id" = auth.uid()::text
          or (nullif(trim(coalesce(auth.jwt() ->> 'email', '')), '') is not null
            and lower(membership."email") = lower(trim(coalesce(auth.jwt() ->> 'email', ''))))
        )
    );
$$;

update public."platform_role_memberships"
set "status" = 'revoked', "revoked_at" = coalesce("revoked_at", timezone('utc'::text, now())),
    "revoked_by" = coalesce("revoked_by", 'creator_money_production_readiness_v1'),
    "expires_at" = coalesce("expires_at", timezone('utc'::text, now())),
    "updated_at" = timezone('utc'::text, now())
where "status" = 'active' and "role" in ('owner', 'operator')
  and coalesce("notes", '') ~* '(^|[^a-z])(proof|test|temp|temporary)([^a-z]|$)';

create or replace function public."enforce_owner_only_high_risk_money_activation"()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_request_role text := nullif(current_setting('request.jwt.claim.role', true), '');
begin
  if new."state" = 'on' and old."state" is distinct from 'on'
    and new."key" in (
      'live_money_enabled','payouts_enabled','digital_sales_enabled','tips_enabled',
      'watch_party_tickets_enabled','watch_party_seats_enabled','live_watch_party_access_enabled',
      'live_watch_party_seats_enabled','paid_content_enabled','stripe_connect_enabled',
      'revenuecat_google_play_enabled','revenuecat_app_store_enabled','provider_webhooks_enabled',
      'creator_monetization_enabled'
    )
    and coalesce(v_request_role, '') <> 'service_role'
    and not public."has_platform_role"(array['owner'::text])
  then raise exception 'owner_required_for_high_risk_money_activation'; end if;
  return new;
end;
$$;
revoke all on function public."enforce_owner_only_high_risk_money_activation"() from public, anon, authenticated, service_role;
drop trigger if exists "enforce_owner_only_high_risk_money_activation" on public."platform_money_kill_switches";
create trigger "enforce_owner_only_high_risk_money_activation"
before update of "state" on public."platform_money_kill_switches"
for each row execute function public."enforce_owner_only_high_risk_money_activation"();

revoke all on function public."monetization_write_audit"(uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public."monetization_write_audit"(uuid,text,text,text,jsonb) to service_role;
revoke all on function public."expire_money_purchase_intents"() from public, anon, authenticated;
grant execute on function public."expire_money_purchase_intents"() to service_role;

update public."money_purchase_intents"
set "status" = 'expired', "updated_at" = timezone('utc'::text, now()),
    "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object('expired_by','trusted_server_maintenance','expired_cleanup_v1',true)
where "status" = 'pending' and "expires_at" <= timezone('utc'::text, now());

-- Recurring expiry remains a privileged maintenance action owned by the existing
-- registered money/operator control plane. This feature migration deliberately
-- does not create an unregistered database scheduler.

alter table public."monetization_product_store_mappings" drop constraint if exists "monetization_store_mappings_concept_check";
alter table public."monetization_product_store_mappings" add constraint "monetization_store_mappings_concept_check"
  check ("concept" in ('premium','creator_tip','seat_pass','paid_video','event_pass','vip_pass','channel_subscription'));
alter table public."monetization_product_store_mappings" drop constraint if exists "monetization_store_mappings_subscription_shape_check";
alter table public."monetization_product_store_mappings" add constraint "monetization_store_mappings_subscription_shape_check"
  check ("store_product_type" <> 'auto_renewable_subscription' or (
    "platform"='ios' and "store"='app_store' and nullif(trim(coalesce("apple_subscription_group",'')),'') is not null
    and (("concept"='premium' and nullif(trim(coalesce("revenuecat_entitlement",'')),'') is not null)
      or ("concept"='channel_subscription' and "revenuecat_entitlement" is null))
  ));

insert into public."monetization_products" (
  "product_key","product_type","display_name","description","provider","environment","status",
  "is_android_digital","is_physical_good","metadata"
) values
  ('paid_video_store_catalog','paid_content_access','Paid Video','Conceptual App Store Paid Video access. Exact video authority comes from a server-bound purchase intent.','internal_setup','setup','setup',false,false,jsonb_build_object('conceptual_store_catalog',true,'live_money_enabled',false,'source_bound',true)),
  ('event_pass_store_catalog','event_pass','Event Pass','Conceptual App Store Event Pass. Exact event authority comes from a server-bound purchase intent.','internal_setup','setup','setup',false,false,jsonb_build_object('conceptual_store_catalog',true,'live_money_enabled',false,'source_bound',true)),
  ('vip_pass_store_catalog','vip_pass','VIP Pass','Conceptual App Store creator-specific VIP Pass.','internal_setup','setup','setup',false,false,jsonb_build_object('conceptual_store_catalog',true,'live_money_enabled',false,'creator_bound',true)),
  ('channel_subscription_store_catalog','channel_subscription','Channel Subscription','Conceptual App Store creator-specific monthly subscription using independently reusable subscription slots.','internal_setup','setup','setup',false,false,jsonb_build_object('conceptual_store_catalog',true,'live_money_enabled',false,'slot_bound',true))
on conflict ("product_key") do update set "display_name"=excluded."display_name", "description"=excluded."description",
  "metadata"=public."monetization_products"."metadata"||excluded."metadata", "updated_at"=timezone('utc'::text,now());

with finite_catalog(product_key,concept,provider_product_id,tier,offering,package_key,price_minor) as (values
  ('paid_video_store_catalog','paid_video','com.chillywood.paidvideo.tier1','tier1','paid_video','paidvideo_tier_1',99),
  ('paid_video_store_catalog','paid_video','com.chillywood.paidvideo.tier2','tier2','paid_video','paidvideo_tier_2',299),
  ('paid_video_store_catalog','paid_video','com.chillywood.paidvideo.tier3','tier3','paid_video','paidvideo_tier_3',499),
  ('paid_video_store_catalog','paid_video','com.chillywood.paidvideo.tier4','tier4','paid_video','paidvideo_tier_4',999),
  ('event_pass_store_catalog','event_pass','com.chillywood.eventpass.tier1','tier1','event_passes','eventpass_tier_1',99),
  ('event_pass_store_catalog','event_pass','com.chillywood.eventpass.tier2','tier2','event_passes','eventpass_tier_2',299),
  ('event_pass_store_catalog','event_pass','com.chillywood.eventpass.tier3','tier3','event_passes','eventpass_tier_3',499),
  ('event_pass_store_catalog','event_pass','com.chillywood.eventpass.tier4','tier4','event_passes','eventpass_tier_4',999),
  ('vip_pass_store_catalog','vip_pass','com.chillywood.vip.tier1','tier1','vip_passes','vip_tier_1',99),
  ('vip_pass_store_catalog','vip_pass','com.chillywood.vip.tier2','tier2','vip_passes','vip_tier_2',299),
  ('vip_pass_store_catalog','vip_pass','com.chillywood.vip.tier3','tier3','vip_passes','vip_tier_3',499),
  ('vip_pass_store_catalog','vip_pass','com.chillywood.vip.tier4','tier4','vip_passes','vip_tier_4',999)
)
insert into public."monetization_product_store_mappings" (
  "product_id","concept","platform","store","provider","provider_product_id","provider_base_plan_id",
  "apple_subscription_group","store_product_type","tier","revenuecat_entitlement","revenuecat_offering",
  "revenuecat_package","reference_price_minor","reference_currency","environment","status",
  "unlocks_digital_access","grants_livekit_authority","creates_payable_balance","metadata"
)
select product."id",c.concept,'ios','app_store','revenuecat_app_store',c.provider_product_id,null,null,'consumable',c.tier,
  null,c.offering,c.package_key,c.price_minor,'usd','sandbox','sandbox',true,false,false,
  jsonb_build_object('provider_proof',false,'owner_release_approved',false,'physical_device_proof',false,'source_bound',true,'live_money_action',false)
from finite_catalog c join public."monetization_products" product on product."product_key"=c.product_key
on conflict ("platform","store","provider","provider_product_id",(coalesce("provider_base_plan_id",''))) do update set
  "product_id"=excluded."product_id", "concept"=excluded."concept", "reference_price_minor"=excluded."reference_price_minor",
  "metadata"=public."monetization_product_store_mappings"."metadata"||excluded."metadata", "updated_at"=timezone('utc'::text,now());

with subscription_slots(slot_number,provider_product_id,group_id,package_key) as (values
  (1,'com.chillywood.channel.subscription.slot1','chillywood_channel_slot_1','channel_slot_1'),
  (2,'com.chillywood.channel.subscription.slot2','chillywood_channel_slot_2','channel_slot_2'),
  (3,'com.chillywood.channel.subscription.slot3','chillywood_channel_slot_3','channel_slot_3'),
  (4,'com.chillywood.channel.subscription.slot4','chillywood_channel_slot_4','channel_slot_4'),
  (5,'com.chillywood.channel.subscription.slot5','chillywood_channel_slot_5','channel_slot_5'),
  (6,'com.chillywood.channel.subscription.slot6','chillywood_channel_slot_6','channel_slot_6'),
  (7,'com.chillywood.channel.subscription.slot7','chillywood_channel_slot_7','channel_slot_7'),
  (8,'com.chillywood.channel.subscription.slot8','chillywood_channel_slot_8','channel_slot_8')
)
insert into public."monetization_product_store_mappings" (
  "product_id","concept","platform","store","provider","provider_product_id","provider_base_plan_id",
  "apple_subscription_group","store_product_type","tier","revenuecat_entitlement","revenuecat_offering",
  "revenuecat_package","reference_price_minor","reference_currency","environment","status",
  "unlocks_digital_access","grants_livekit_authority","creates_payable_balance","metadata"
)
select product."id",'channel_subscription','ios','app_store','revenuecat_app_store',s.provider_product_id,null,s.group_id,
  'auto_renewable_subscription','slot'||s.slot_number::text,null,'channel_subscriptions',s.package_key,499,'usd','sandbox','sandbox',
  true,false,false,jsonb_build_object('slot_number',s.slot_number,'provider_proof',false,'owner_release_approved',false,'physical_device_proof',false,'creator_bound',true,'live_money_action',false)
from subscription_slots s join public."monetization_products" product on product."product_key"='channel_subscription_store_catalog'
on conflict ("platform","store","provider","provider_product_id",(coalesce("provider_base_plan_id",''))) do update set
  "product_id"=excluded."product_id", "concept"=excluded."concept", "apple_subscription_group"=excluded."apple_subscription_group",
  "metadata"=public."monetization_product_store_mappings"."metadata"||excluded."metadata", "updated_at"=timezone('utc'::text,now());

create or replace function public."create_ios_creator_money_purchase_intent"(
  p_concept text, p_source_id uuid, p_amount_minor integer, p_metadata jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid:=auth.uid(); v_email text:=nullif(lower(trim(coalesce(auth.jwt()->>'email',''))),'');
  v_concept text:=lower(trim(coalesce(p_concept,''))); v_now timestamptz:=timezone('utc'::text,now());
  v_mapping public."monetization_product_store_mappings"%rowtype; v_product public."monetization_products"%rowtype;
  v_intent public."money_purchase_intents"%rowtype; v_creator uuid; v_source_type text; v_price integer;
  v_currency text:='usd'; v_feature_key text; v_app_store_state text; v_webhook_state text; v_feature_state text;
  v_creator_money_state text; v_live_state text; v_payout_state text; v_environment text; v_legal jsonb;
begin
  if v_user is null then raise exception 'auth_required'; end if;
  if p_source_id is null then raise exception 'source_id_required'; end if;
  if coalesce(p_amount_minor,0)<=0 then raise exception 'amount_required'; end if;
  if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))<>'object' or coalesce(p_metadata,'{}'::jsonb)::text ~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization)' then raise exception 'unsafe_metadata'; end if;
  if v_concept not in ('paid_video','event_pass','vip_pass','channel_subscription') then raise exception 'ios_creator_money_concept_invalid'; end if;

  select "state" into v_app_store_state from public."platform_money_kill_switches" where "key"='revenuecat_app_store_enabled';
  select "state" into v_webhook_state from public."platform_money_kill_switches" where "key"='provider_webhooks_enabled';
  select "state" into v_creator_money_state from public."platform_money_kill_switches" where "key"='creator_monetization_enabled';
  select "state" into v_live_state from public."platform_money_kill_switches" where "key"='live_money_enabled';
  select "state" into v_payout_state from public."platform_money_kill_switches" where "key"='payouts_enabled';
  v_feature_key:=case when v_concept='paid_video' then 'paid_content_enabled' else 'digital_sales_enabled' end;
  select "state" into v_feature_state from public."platform_money_kill_switches" where "key"=v_feature_key;

  if v_app_store_state='sandbox_only' and v_webhook_state='sandbox_only' and v_feature_state='sandbox_only'
    and v_creator_money_state in ('sandbox_only','on') and coalesce(v_live_state,'off')='off' and coalesce(v_payout_state,'off')='off' then
    v_environment:='sandbox';
    if not (public."has_platform_role"(array['owner'::text,'operator'::text]) or public."has_active_beta_access"()
      or public."resolve_sandbox_monetization_tester"(v_user::text,v_email)) then raise exception 'sandbox_monetization_tester_required'; end if;
  elsif v_app_store_state='on' and v_webhook_state='on' and v_feature_state='on' and v_creator_money_state='on' and v_live_state='on' then
    v_environment:='production'; v_legal:=public."wave1_legal_requirements_readback"('creator_money');
    if coalesce((v_legal->>'allAccepted')::boolean,false) is not true or v_legal->>'market'<>'UNITED_STATES' then raise exception 'buyer_creator_money_legal_not_current'; end if;
  else raise exception 'ios_creator_money_disabled'; end if;

  if v_concept='paid_video' then
    select "creator_id","price_cents",lower("currency") into v_creator,v_price,v_currency
    from public."creator_content_prices" where "content_id"=p_source_id and "content_type"='video' and "is_paid" and "status" in ('sandbox','active') order by "updated_at" desc limit 1;
    v_source_type:='paid_content'; if v_creator is null then raise exception 'paid_video_offer_not_available'; end if;
    if coalesce((public."has_paid_content_access"(v_user,p_source_id)->>'allowed')::boolean,false) then return jsonb_build_object('alreadyPurchased',true,'providerProductId',null); end if;
  elsif v_concept='event_pass' then
    select paid."creator_id",paid."price_cents",lower(paid."currency") into v_creator,v_price,v_currency
    from public."paid_creator_events" paid join public."creator_events" event on event."id"=paid."creator_event_id"
    where paid."creator_event_id"=p_source_id and paid."status" in ('sandbox','active') and event."status" not in ('ended','expired','canceled','removed','unsafe','blocked') order by paid."updated_at" desc limit 1;
    v_source_type:='event'; if v_creator is null then raise exception 'event_pass_not_available'; end if;
  elsif v_concept='vip_pass' then
    select "creator_id","price_cents",lower("currency") into v_creator,v_price,v_currency from public."creator_vip_pass_offers" where "id"=p_source_id and "status" in ('sandbox','active') limit 1;
    v_source_type:='vip_pass'; if v_creator is null then raise exception 'vip_pass_not_available'; end if;
    if coalesce((public."resolve_creator_vip_pass_access"(v_creator)->>'allowed')::boolean,false) then return jsonb_build_object('alreadyPurchased',true,'providerProductId',null); end if;
  else
    select "creator_id","price_cents",lower("currency") into v_creator,v_price,v_currency from public."creator_channel_subscription_offers" where "id"=p_source_id and "status" in ('sandbox','active') limit 1;
    v_source_type:='channel_subscription'; if v_creator is null then raise exception 'channel_subscription_not_available'; end if;
    if coalesce((public."resolve_creator_channel_subscription_access"(v_creator)->>'allowed')::boolean,false) then return jsonb_build_object('alreadySubscribed',true,'providerProductId',null); end if;
  end if;

  if v_creator=v_user then raise exception 'creator_cannot_purchase_own_offer'; end if;
  if v_currency<>'usd' then raise exception 'ios_creator_money_usd_catalog_required'; end if;
  if p_amount_minor<>v_price then raise exception 'ios_creator_money_exact_store_price_required'; end if;
  if exists (select 1 from public."channel_audience_blocks" where ("channel_user_id"=v_creator::text and "blocked_user_id"=v_user::text) or ("channel_user_id"=v_user::text and "blocked_user_id"=v_creator::text)) then raise exception 'creator_money_blocked_by_audience_policy'; end if;

  if v_environment='production' and not exists (
    select 1 from public."wave1_creator_eligibility" e where e."creator_user_id"=v_creator and e."state"='VERIFIED'
      and e."account_status"='ACTIVE' and e."age_18_plus" and e."legal_accepted" and e."creator_role"
      and e."moderation_state"='CLEAR' and e."market"='UNITED_STATES' and e."rollout_eligible" and e."platform_capability"
      and e."provider_eligible" and e."kyc_complete" and e."tax_complete" and e."sanctions_clear" and e."payout_eligible"
  ) then raise exception 'creator_not_verified_for_production_money'; end if;

  if v_concept='channel_subscription' then
    select mapping.* into v_mapping from public."monetization_product_store_mappings" mapping
    where mapping."concept"='channel_subscription' and mapping."platform"='ios' and mapping."store"='app_store' and mapping."provider"='revenuecat_app_store'
      and mapping."reference_price_minor"=v_price and mapping."environment"=v_environment
      and mapping."status"=case when v_environment='production' then 'active' else 'sandbox' end
      and not mapping."grants_livekit_authority" and not mapping."creates_payable_balance"
      and not exists (select 1 from public."money_purchase_intents" pending where pending."user_id"=v_user and pending."provider"='revenuecat_app_store' and pending."provider_product_id"=mapping."provider_product_id" and pending."status"='pending' and pending."expires_at">v_now)
      and not exists (select 1 from public."creator_channel_subscription_transactions" tx join public."creator_channel_subscriptions" sub on sub."id"=tx."subscription_id" where tx."subscriber_id"=v_user and tx."provider_product_id"=mapping."provider_product_id" and sub."status" in ('active','trialing','grace_period','cancel_pending') and (sub."current_period_end" is null or sub."current_period_end">v_now) and sub."revoked_at" is null and sub."expired_at" is null)
    order by coalesce((mapping."metadata"->>'slot_number')::integer,999) limit 1 for update;
    if v_mapping."id" is null then raise exception 'ios_channel_subscription_slots_exhausted'; end if;
  else
    select mapping.* into v_mapping from public."monetization_product_store_mappings" mapping
    where mapping."concept"=v_concept and mapping."platform"='ios' and mapping."store"='app_store' and mapping."provider"='revenuecat_app_store'
      and mapping."reference_price_minor"=v_price and mapping."environment"=v_environment
      and mapping."status"=case when v_environment='production' then 'active' else 'sandbox' end and mapping."store_product_type"='consumable'
      and not mapping."grants_livekit_authority" and not mapping."creates_payable_balance" order by mapping."tier" limit 1;
    if v_mapping."id" is null then raise exception 'ios_store_tier_mapping_missing'; end if;
  end if;

  if v_environment='production' and (coalesce((v_mapping."metadata"->>'provider_proof')::boolean,false) is not true
    or coalesce((v_mapping."metadata"->>'owner_release_approved')::boolean,false) is not true
    or coalesce((v_mapping."metadata"->>'physical_device_proof')::boolean,false) is not true) then raise exception 'ios_production_mapping_proof_incomplete'; end if;
  select * into v_product from public."monetization_products" where "id"=v_mapping."product_id";
  if v_product."id" is null then raise exception 'ios_conceptual_product_missing'; end if;
  if (select count(*) from public."money_purchase_intents" where "user_id"=v_user and "provider"='revenuecat_app_store' and "status"='pending' and "expires_at">v_now and "created_at">v_now-interval '1 minute')>=6 then raise exception 'ios_purchase_intent_rate_limited'; end if;

  insert into public."money_purchase_intents" ("user_id","product_id","product_key","product_type","provider","provider_product_id","source_type","source_id","creator_id","environment","status","amount_minor","currency","idempotency_key","expires_at","metadata")
  values (v_user,v_product."id",v_product."product_key",v_product."product_type",'revenuecat_app_store',v_mapping."provider_product_id",v_source_type,p_source_id,v_creator,v_environment,'pending',v_price,v_currency,
    'ios_creator_money:'||v_user::text||':'||gen_random_uuid()::text,v_now+interval '15 minutes',
    jsonb_build_object('store_mapping_id',v_mapping."id",'concept',v_concept,'sandbox_only',v_environment='sandbox','production_intent',v_environment='production','not_payable',true,'viewer_access_only',true,'grants_livekit_authority',false,'grants_host_authority',false,'premium_unlock',false,'payout_ready',false,'creator_eligibility_required',v_environment='production','channel_subscription_slot',case when v_concept='channel_subscription' then v_mapping."metadata"->'slot_number' else null end)||coalesce(p_metadata,'{}'::jsonb)) returning * into v_intent;

  return public."money_purchase_intent_safe_row"(v_intent)||jsonb_build_object('providerProductId',v_mapping."provider_product_id",'concept',v_concept,'environment',v_environment,'storeMappingId',v_mapping."id");
end;
$$;
revoke all on function public."create_ios_creator_money_purchase_intent"(text,uuid,integer,jsonb) from public, anon;
grant execute on function public."create_ios_creator_money_purchase_intent"(text,uuid,integer,jsonb) to authenticated, service_role;
comment on function public."create_ios_creator_money_purchase_intent"(text,uuid,integer,jsonb) is 'Server-authoritative finite App Store creator-money intent. Production exists but is unreachable until provider/physical proof and Owner-controlled switches are activated.';

update public."platform_money_kill_switches"
set "state"='off', "reason"='Creator-money production-readiness source exists; production activation remains intentionally off.', "updated_at"=timezone('utc'::text,now())
where "key" in ('live_money_enabled','payouts_enabled') and "state"<>'off';
