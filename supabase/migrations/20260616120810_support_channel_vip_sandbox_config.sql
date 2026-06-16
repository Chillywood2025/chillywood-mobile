-- Allow owner Money Center sandbox setup to link channel subscription and VIP offers
-- into creator_monetization_configs. This keeps all existing sandbox/not-payable
-- constraints and does not enable live money or payouts.

create or replace function public."creator_monetization_expected_source_type"(p_product_type text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_product_type
    when 'paid_content_access' then 'paid_content'
    when 'watch_party_live_ticket' then 'watch_party_live'
    when 'live_watch_party_access_pass' then 'live_watch_party_access'
    when 'live_watch_party_seat_pass' then 'live_watch_party_seat'
    when 'creator_tip' then 'creator_tip'
    when 'channel_subscription' then 'channel_subscription'
    when 'vip_pass' then 'vip_pass'
    when 'event_pass' then 'event'
    when 'merch_physical_good' then 'merch_physical_good'
    else null
  end;
$$;

comment on function public."creator_monetization_expected_source_type"(text) is
  'Maps approved sandbox product types to the source type that creator_monetization_configs may reference. Channel subscription and VIP remain sandbox/not-payable only through existing table constraints.';
