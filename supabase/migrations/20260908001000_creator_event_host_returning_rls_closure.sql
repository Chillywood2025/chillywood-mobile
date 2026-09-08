-- Physical Event creation exposed a PostgreSQL command-visibility boundary:
-- INSERT ... RETURNING evaluates the SELECT policy before a SECURITY DEFINER
-- lookup by the new row id can observe that row. The insert itself succeeds,
-- but the returning projection is rejected. Preserve the existing audience
-- resolver and make the already-authorized owning-host read path explicit on
-- the row being evaluated.

drop policy if exists "creator_events_visibility_select_policy"
  on public."creator_events";

create policy "creator_events_visibility_select_policy"
  on public."creator_events"
  for select
  to anon, authenticated
  using (
    (
      auth.uid() is not null
      and "host_user_id" = auth.uid()
    )
    or public."can_read_creator_event"("id", auth.uid())
  );

comment on policy "creator_events_visibility_select_policy"
  on public."creator_events" is
  'Owning hosts can read their row directly, including the INSERT ... RETURNING command boundary. Every other reader remains governed by canonical public, Circle, draft, private, block, and exact Event Pass authority.';
