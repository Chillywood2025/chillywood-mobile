-- Explicitly document and index the server-only terminal-delivery boundary.

create index if not exists "chat_call_transition_deliveries_actor_idx"
  on public."chat_call_transition_deliveries" ("actor_user_id", "created_at" desc);

drop policy if exists "chat_call_transition_deliveries_deny_client_access"
  on public."chat_call_transition_deliveries";
create policy "chat_call_transition_deliveries_deny_client_access"
  on public."chat_call_transition_deliveries"
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on table public."chat_call_transition_deliveries"
  from public, anon, authenticated;
grant all on table public."chat_call_transition_deliveries"
  to postgres, service_role;

comment on policy "chat_call_transition_deliveries_deny_client_access"
  on public."chat_call_transition_deliveries" is
  'Explicit defense in depth: terminal-delivery state is server-only and is never client-readable or client-writable.';
