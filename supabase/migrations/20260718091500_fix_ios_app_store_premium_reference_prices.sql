-- Align seeded App Store mapping prices with the locked premium catalog:
-- monthly 9.99 and yearly 99.99.
-- This is an additive, backward-compatible correction after the 4.99 / 49.99
-- temporary drift was normalized at repository level.

update public."monetization_product_store_mappings"
set
  "reference_price_minor" = case
    when "provider_product_id" = 'com.chillywood.premium.monthly' then 999
    when "provider_product_id" = 'com.chillywood.premium.yearly' then 9999
    else "reference_price_minor"
  end,
  "updated_at" = timezone('utc'::text, now())
where "platform" = 'ios'
  and "store" = 'app_store'
  and "provider" = 'revenuecat_app_store'
  and "provider_product_id" in ('com.chillywood.premium.monthly', 'com.chillywood.premium.yearly')
  and (
    ("provider_product_id" = 'com.chillywood.premium.monthly' and "reference_price_minor" <> 999)
    or ("provider_product_id" = 'com.chillywood.premium.yearly' and "reference_price_minor" <> 9999)
  );
