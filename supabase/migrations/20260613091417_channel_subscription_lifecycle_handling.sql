-- Channel Subscription lifecycle handling support.
-- Adds a cancel-pending state so RevenueCat cancellations can stop renewal
-- without prematurely removing subscriber access before the paid period ends.

alter table public."creator_channel_subscriptions"
  drop constraint if exists "creator_channel_subscriptions_status_check";
alter table public."creator_channel_subscriptions"
  add constraint "creator_channel_subscriptions_status_check"
  check ("status" in (
    'active',
    'trialing',
    'grace_period',
    'cancel_pending',
    'paused',
    'canceled',
    'expired',
    'refunded',
    'revoked'
  ));

create or replace function public."resolve_creator_channel_subscription_access"(p_creator_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_offer public."creator_channel_subscription_offers"%rowtype;
  v_subscription public."creator_channel_subscriptions"%rowtype;
  v_blocked boolean := false;
begin
  if p_creator_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'creator_id_required', 'requiresPurchase', false);
  end if;

  select * into v_offer
  from public."creator_channel_subscription_offers"
  where "creator_id" = p_creator_id
    and "status" in ('sandbox', 'active', 'paused', 'blocked')
  order by "updated_at" desc
  limit 1;

  if v_offer."id" is null then
    return jsonb_build_object('allowed', false, 'reason', 'subscription_not_available', 'requiresPurchase', false);
  end if;

  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'auth_required', 'requiresPurchase', true, 'offer', public."channel_subscription_offer_safe_row"(v_offer));
  end if;

  if v_user_id = p_creator_id or public.has_platform_role(array['owner'::text, 'operator'::text]) then
    return jsonb_build_object('allowed', true, 'reason', 'creator_or_admin', 'requiresPurchase', false, 'offer', public."channel_subscription_offer_safe_row"(v_offer));
  end if;

  select exists (
    select 1
    from public."channel_audience_blocks" block_row
    where block_row."channel_user_id" = p_creator_id::text
      and block_row."blocked_user_id" = v_user_id::text
  ) into v_blocked;
  if v_blocked then
    return jsonb_build_object('allowed', false, 'reason', 'blocked_by_creator', 'requiresPurchase', false, 'offer', public."channel_subscription_offer_safe_row"(v_offer));
  end if;

  select * into v_subscription
  from public."creator_channel_subscriptions"
  where "offer_id" = v_offer."id"
    and "subscriber_id" = v_user_id
    and "status" in ('active', 'trialing', 'grace_period', 'cancel_pending')
    and ("current_period_end" is null or "current_period_end" > timezone('utc'::text, now()))
    and "revoked_at" is null
    and "expired_at" is null
  order by "updated_at" desc
  limit 1;

  if v_subscription."id" is not null then
    return jsonb_build_object(
      'allowed', true,
      'reason', case when v_subscription."status" = 'cancel_pending' then 'subscription_cancel_pending' else 'subscription_active' end,
      'requiresPurchase', false,
      'subscriptionId', v_subscription."id",
      'subscriptionStatus', v_subscription."status",
      'currentPeriodEnd', v_subscription."current_period_end",
      'offer', public."channel_subscription_offer_safe_row"(v_offer)
    );
  end if;

  if v_offer."status" = 'paused' then
    return jsonb_build_object('allowed', false, 'reason', 'offer_paused', 'requiresPurchase', false, 'offer', public."channel_subscription_offer_safe_row"(v_offer));
  end if;
  if v_offer."status" in ('blocked', 'archived') then
    return jsonb_build_object('allowed', false, 'reason', 'offer_blocked', 'requiresPurchase', false, 'offer', public."channel_subscription_offer_safe_row"(v_offer));
  end if;

  return jsonb_build_object(
    'allowed', false,
    'reason', 'subscription_required',
    'requiresPurchase', true,
    'priceCents', v_offer."price_cents",
    'currency', v_offer."currency",
    'creatorId', v_offer."creator_id",
    'provider', v_offer."provider",
    'providerProductId', v_offer."provider_product_id",
    'providerProductKey', v_offer."provider_product_key",
    'providerEntitlementId', v_offer."provider_entitlement_id",
    'offer', public."channel_subscription_offer_safe_row"(v_offer)
  );
end;
$$;

comment on function public."resolve_creator_channel_subscription_access"(uuid) is
  'Resolves creator channel subscription access. Cancel-pending subscriptions remain accessible only until their current paid period ends; Premium/VIP/other creator purchases do not bypass this gate.';
