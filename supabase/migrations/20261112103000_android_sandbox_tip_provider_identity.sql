-- Correct only the observed sandbox catalog identity. This is not provider
-- qualification or purchase activation: metadata, status and flags stay intact.
-- Existing intent snapshots must never be rewritten to a different store SKU.
do $$
declare p public.monetization_products;
begin
  -- Serialize catalog writers and intent admission while checking old history.
  lock table public.monetization_products in share row exclusive mode;
  lock table public.money_purchase_intents in share row exclusive mode;
  lock table public.provider_events in share row exclusive mode;
  select * into p from public.monetization_products
    where product_key='creator_tip_sandbox_099';
  if p.id is null then return; end if;
  if p.product_type is distinct from 'creator_tip'
    or p.provider is distinct from 'revenuecat_google_play'
    or p.environment is distinct from 'sandbox'
    or p.status is distinct from 'sandbox'
    or p.provider_base_plan_id is not null
    or p.revenuecat_entitlement is not null then
    raise exception 'android_tip_catalog_identity_unexpected';
  end if;
  if p.provider_product_id='cw_creator_tip_sandbox_099' then return; end if;
  if p.provider_product_id is distinct from 'creator_tip_sandbox_099' then
    raise exception 'android_tip_catalog_identity_unexpected';
  end if;
  if exists(select 1 from public.money_purchase_intents
    where provider='revenuecat_google_play' and environment='sandbox'
      and provider_product_id=p.provider_product_id)
    or exists(select 1 from public.provider_events where product_id=p.id
      and metadata->>'provider_product_id' is distinct from 'cw_creator_tip_sandbox_099') then
    raise exception 'android_tip_catalog_history_requires_review';
  end if;
  if exists(select 1 from public.monetization_products
    where id<>p.id and provider=p.provider and environment=p.environment
      and provider_product_id='cw_creator_tip_sandbox_099') then
    raise exception 'android_tip_catalog_target_ambiguous';
  end if;
  update public.monetization_products set provider_product_id='cw_creator_tip_sandbox_099'
    where id=p.id;
end;
$$;
