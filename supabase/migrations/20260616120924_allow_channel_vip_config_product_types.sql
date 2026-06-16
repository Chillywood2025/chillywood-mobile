-- Extend creator sandbox config constraints for channel subscription and VIP.
-- These rows are still constrained to environment='sandbox', payable_state='not_payable',
-- production_enabled=false, payout_enabled=false, and no LiveKit publish authority.

alter table public."creator_monetization_configs"
  drop constraint if exists "creator_monetization_configs_source_type_check";

alter table public."creator_monetization_configs"
  add constraint "creator_monetization_configs_source_type_check"
  check ("source_type" in (
    'paid_content',
    'watch_party_live',
    'live_watch_party_access',
    'live_watch_party_seat',
    'creator_tip',
    'channel_subscription',
    'vip_pass',
    'event',
    'merch_physical_good'
  ));

alter table public."creator_monetization_configs"
  drop constraint if exists "creator_monetization_configs_product_type_check";

alter table public."creator_monetization_configs"
  add constraint "creator_monetization_configs_product_type_check"
  check ("product_type" in (
    'paid_content_access',
    'watch_party_live_ticket',
    'live_watch_party_access_pass',
    'live_watch_party_seat_pass',
    'creator_tip',
    'channel_subscription',
    'vip_pass',
    'event_pass',
    'merch_physical_good'
  ));
