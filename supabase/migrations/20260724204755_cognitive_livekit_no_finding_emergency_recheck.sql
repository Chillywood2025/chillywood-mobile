-- Final table-boundary liveness recheck for immutable LiveKit synthetic-fixture
-- no-finding attestations. The reviewed evaluator wrapper validates and locks
-- the sentinel run; this trigger then locks the exact task and emergency-state
-- rows immediately before INSERT so cancellation or emergency stop cannot race
-- the durable attestation.

create function
  public.product_experience_livekit_no_finding_require_live_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.cognitive_lock_task_writes_allowed(
    new.task_id,
    new.project_id,
    new.platform,
    new.environment
  ) then
    raise exception
      'livekit_bounded_failure_no_finding_attestation_task_not_live'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function
  public.product_experience_livekit_no_finding_require_live_task()
  from public,anon,authenticated,service_role;

create trigger
  product_experience_livekit_no_finding_current_task_live
before insert on
  public.product_experience_livekit_no_finding_attestations
for each row
execute function
  public.product_experience_livekit_no_finding_require_live_task();

comment on function
  public.product_experience_livekit_no_finding_require_live_task()
is
  'Locks and rechecks the exact task and emergency-state rows at the immutable no-finding attestation table boundary.';
