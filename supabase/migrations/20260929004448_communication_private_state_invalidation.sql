-- Communication snapshots use the already-authorized private room channel.
-- Do not publish either table through Postgres Changes: DELETE records cannot
-- be authorized with the original row's RLS and include membership identities.
-- The hint contains no row data, and its receiver must reread current RLS truth.
create or replace function private.broadcast_communication_state_invalidation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id text;
begin
  if tg_table_schema <> 'public'
    or tg_table_name not in ('communication_rooms', 'communication_room_memberships')
  then
    raise exception 'communication_state_trigger_scope_invalid';
  end if;

  v_room_id := case when tg_op = 'DELETE' then old.room_id else new.room_id end;
  -- In particular, do not require the new row to remain active/readable here.
  -- Terminal changes must invalidate clients that joined before access closed.
  perform realtime.send(
    '{}'::jsonb,
    'state:update',
    'comm-room-' || v_room_id,
    true
  );
  return null;
end;
$$;

revoke all on function private.broadcast_communication_state_invalidation()
  from public, anon, authenticated, service_role;

create trigger broadcast_communication_room_state_invalidation
after insert or update or delete on public.communication_rooms
for each row execute function private.broadcast_communication_state_invalidation();

create trigger broadcast_communication_membership_state_invalidation
after insert or update or delete on public.communication_room_memberships
for each row execute function private.broadcast_communication_state_invalidation();

comment on function private.broadcast_communication_state_invalidation() is
  'Internal transaction-bound empty snapshot invalidation on the existing private room topic; never publishes row contents or grants client Broadcast authority.';
