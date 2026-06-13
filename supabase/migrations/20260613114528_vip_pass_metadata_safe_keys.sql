-- VIP metadata includes an explicit negative policy marker:
--   livekit_authority = false
-- The first VIP migration rejected any metadata text containing "livekit",
-- which blocked creator setup before checkout. Keep the validator tight by
-- allowing only that top-level false marker while continuing to reject secrets,
-- token/auth material, publish markers, host controls, admin power, and any
-- other LiveKit metadata text.

alter table public."creator_vip_pass_offers"
  drop constraint if exists "creator_vip_pass_offers_metadata_safe_check";
alter table public."creator_vip_pass_offers"
  add constraint "creator_vip_pass_offers_metadata_safe_check"
  check (
    (
      not ("metadata" ? 'livekit_authority')
      or coalesce(("metadata"->>'livekit_authority')::boolean, true) = false
    )
    and ("metadata" - 'livekit_authority')::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization|livekit|publish|host_controls|admin_power)'
  );

alter table public."creator_vip_passes"
  drop constraint if exists "creator_vip_passes_metadata_safe_check";
alter table public."creator_vip_passes"
  add constraint "creator_vip_passes_metadata_safe_check"
  check (
    (
      not ("metadata" ? 'livekit_authority')
      or coalesce(("metadata"->>'livekit_authority')::boolean, true) = false
    )
    and ("metadata" - 'livekit_authority')::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization|livekit|publish|host_controls|admin_power)'
  );

alter table public."creator_vip_transactions"
  drop constraint if exists "creator_vip_transactions_metadata_safe_check";
alter table public."creator_vip_transactions"
  add constraint "creator_vip_transactions_metadata_safe_check"
  check (
    (
      not ("metadata" ? 'livekit_authority')
      or coalesce(("metadata"->>'livekit_authority')::boolean, true) = false
    )
    and ("metadata" - 'livekit_authority')::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization|livekit|publish|host_controls|admin_power)'
  );

alter table public."creator_vip_events"
  drop constraint if exists "creator_vip_events_metadata_safe_check";
alter table public."creator_vip_events"
  add constraint "creator_vip_events_metadata_safe_check"
  check (
    (
      not ("metadata" ? 'livekit_authority')
      or coalesce(("metadata"->>'livekit_authority')::boolean, true) = false
    )
    and ("metadata" - 'livekit_authority')::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|authorization|livekit|publish|host_controls|admin_power)'
  );
