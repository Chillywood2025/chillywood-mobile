update public."monetization_products"
set
  "provider_product_id" = 'channel_subscription_sandbox_monthly_499',
  "updated_at" = now(),
  "metadata" = coalesce("metadata", '{}'::jsonb)
    || jsonb_build_object(
      'play_product_id_shortened_for_google_limit', true,
      'old_provider_product_id', 'cw_channel_subscription_sandbox_monthly_499',
      'base_plan_candidates', jsonb_build_array('monthly')
    )
where "product_key" = 'channel_subscription_sandbox_monthly_499'
  and "product_type" = 'channel_subscription';

update public."creator_channel_subscription_offers"
set
  "provider_product_id" = 'channel_subscription_sandbox_monthly_499',
  "updated_at" = now(),
  "metadata" = coalesce("metadata", '{}'::jsonb)
    || jsonb_build_object(
      'play_product_id_shortened_for_google_limit', true,
      'old_provider_product_id', 'cw_channel_subscription_sandbox_monthly_499'
    )
where "provider_product_key" = 'channel_subscription_sandbox_monthly_499'
  and "provider_product_id" = 'cw_channel_subscription_sandbox_monthly_499';
