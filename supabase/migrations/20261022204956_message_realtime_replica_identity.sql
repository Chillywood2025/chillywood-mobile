-- Preserve the deployed message-table identity in fresh source replays.
-- Realtime DELETE routing uses old-row thread_id / party_id before RLS reduces
-- the delivered old record to its primary key. Those filters are not message
-- primary keys. FULL also preserves unchanged TOAST values for message updates.
-- These tables already use FULL in production. Do not normalize the six other
-- preserved identity differences or change publication membership, RLS or ACLs.
-- See docs/REALTIME_REPLICA_IDENTITY_RECONCILIATION_2026_10_22.md.
alter table public.chat_messages replica identity full;
alter table public.watch_party_room_messages replica identity full;
