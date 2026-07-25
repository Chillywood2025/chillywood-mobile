begin;

-- A capability can transition to revoked only once, and event uniqueness is
-- scoped by capability_id. Use a deterministic non-private event key instead
-- of a random UUID fragment that can accidentally resemble a phone number.
create or replace function public.cognitive_revoke_capability(
  p_capability_id text,
  p_reason text,
  p_event_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare capability public.cognitive_capabilities%rowtype;
begin
  perform public.cognitive_assert_service_actor(
    array['cognitive_control_plane'],
    null
  );
  if length(p_capability_id) not between 8 and 128
     or public.cognitive_text_has_secret(p_capability_id)
     or public.cognitive_text_has_private_identifier(p_capability_id)
     or public.cognitive_text_has_secret(p_reason)
     or public.cognitive_text_has_private_identifier(p_reason) then
    raise exception 'capability_revocation_rejected' using errcode='P0001';
  end if;
  select * into capability
  from public.cognitive_capabilities
  where capability_id = p_capability_id
  for update;
  if capability.id is null
     or capability.status = 'revoked'
     or length(p_reason) not between 3 and 256
     or p_event_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'capability_revocation_rejected' using errcode='P0001';
  end if;
  update public.cognitive_capabilities
  set
    status = 'revoked',
    revoked_at = transaction_timestamp(),
    next_usage_sequence = next_usage_sequence + 1
  where id = capability.id;
  insert into public.cognitive_capability_events(
    capability_id,
    task_id,
    project_id,
    platform,
    environment,
    call_id,
    usage_sequence,
    event_type,
    reason,
    request_hash
  ) values (
    capability.id,
    capability.task_id,
    capability.project_id,
    capability.platform,
    capability.environment,
    'revocation-event',
    capability.next_usage_sequence,
    'revoked',
    left(p_reason, 256),
    p_event_hash
  );
  return true;
end;
$$;

revoke all on function public.cognitive_revoke_capability(text,text,text)
  from public,anon,authenticated;
grant execute on function public.cognitive_revoke_capability(text,text,text)
  to service_role;

commit;
