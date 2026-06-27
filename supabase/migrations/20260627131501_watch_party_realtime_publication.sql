-- Watch-Party screens and realtime diagnostics subscribe to these tables for
-- room state, membership roster, room comments, and playback sync callbacks.
-- Keep this idempotent so existing environments do not fail on duplicate
-- publication entries.
do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    begin
      alter publication supabase_realtime add table public."watch_party_rooms";
    exception
      when duplicate_object then null;
    end;

    begin
      alter publication supabase_realtime add table public."watch_party_room_memberships";
    exception
      when duplicate_object then null;
    end;

    begin
      alter publication supabase_realtime add table public."watch_party_room_messages";
    exception
      when duplicate_object then null;
    end;

    begin
      alter publication supabase_realtime add table public."watch_party_sync_events";
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;

comment on table public."watch_party_sync_events" is
  'Watch-Party playback sync events included in Supabase Realtime publication for room clients; RLS remains the authority for visibility.';
