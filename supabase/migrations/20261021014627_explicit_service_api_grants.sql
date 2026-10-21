-- Fresh-schema readiness for Supabase's 2026-10-30 opt-in Data API defaults.
-- Existing tables retain their grants; do not restore legacy blanket defaults.
-- These are the minimum table operations used by existing service-role Edge
-- consumers (reviewed in tests/fixtures/explicit-api-service-grants.json).
-- This migration is source-only until separately authorized for deployment.
-- It does not activate provider, money, canary, inspection or release actions.
-- No anon/authenticated, private-schema, RLS, role or function changes.
-- The insert targets have no serial/identity sequences; no sequence grant needed.
begin;

grant insert, select on table public.admin_live_cost_guard_actions to service_role;
grant insert, select on table public.admin_live_cost_guard_events to service_role;
grant select on table public.admin_live_cost_guard_settings to service_role;
grant insert, select, update on table public.creator_payout_accounts to service_role;
grant insert, select, update on table public.creator_payout_eligibility_records to service_role;
grant insert on table public.creator_payout_onboarding_sessions to service_role;
grant select, update on table public.creator_payout_provider_transfers to service_role;
grant insert, select, update on table public.creator_payout_provider_webhook_events to service_role;
grant select on table public.discovery_feed_item_blocks to service_role;
grant delete, select on table public.dmca_attachments to service_role;
grant delete, select on table public.dmca_audit_log to service_role;
grant delete, select, update on table public.dmca_cases to service_role;
grant delete, select on table public.dmca_content_actions to service_role;
grant delete, select on table public.dmca_counter_notices to service_role;
grant delete, select on table public.dmca_strikes to service_role;
grant insert, select on table public.livekit_room_assignments to service_role;
grant insert, select on table public.livekit_routing_audit to service_role;
grant insert on table public.livekit_server_heartbeats to service_role;
grant insert, select, update on table public.livekit_servers to service_role;
grant select on table public.platform_staff_role_audit to service_role;
grant insert, select on table public.provider_access_audit_events to service_role;
grant insert, select, update on table public.provider_access_capabilities to service_role;
grant insert, select, update on table public.provider_accounts to service_role;
grant insert, select on table public.provider_dashboard_repair_requests to service_role;
grant insert, select, update on table public.provider_usage_daily to service_role;
grant insert, select, update on table public.provider_usage_imports to service_role;
grant insert, select, update on table public.provider_usage_reconciliation to service_role;
grant insert, select, update on table public.room_broadcast_sessions to service_role;
grant insert, select, update on table public.spectator_hls_playback_records to service_role;
grant select on table public.usage_daily_summaries to service_role;

commit;
