-- Final table-boundary liveness recheck for immutable product-sentinel
-- evaluator proofs. The evaluator independently derives and hashes an
-- assessment before this write; the trigger locks the exact task and
-- emergency-state rows immediately before INSERT so cancellation, deadman,
-- quarantine, or emergency stop cannot race durable proof creation.

create function
  public.product_quality_evaluator_proof_require_live_task()
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
      'product_quality_evaluator_proof_task_not_live'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function
  public.product_quality_evaluator_proof_require_live_task()
  from public,anon,authenticated,service_role;

create trigger product_quality_evaluator_proofs_current_task_live
before insert on public.product_experience_sentinel_evaluator_proofs
for each row
execute function public.product_quality_evaluator_proof_require_live_task();

comment on function
  public.product_quality_evaluator_proof_require_live_task()
is
  'Locks and rechecks the exact task and emergency-state rows at the immutable evaluator-proof table boundary.';
