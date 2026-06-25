-- Sanitized owner/operator readback for controlled account purge audit rows.

set check_function_bodies = false;

create or replace function public."list_account_purge_action_audit"(
  p_target_user_id text,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor text := nullif((auth.uid())::text, '');
  v_target text := nullif(btrim(coalesce(p_target_user_id, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_items jsonb := '[]'::jsonb;
begin
  if auth.role() <> 'service_role'
    and (v_actor is null or not public.has_platform_role(array['owner'::text, 'operator'::text]))
  then
    raise exception 'owner_or_operator_required';
  end if;

  if v_target is null then
    raise exception 'target_user_required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'idSuffix', right(audit."id"::text, 8),
    'action', audit."action",
    'targetUserIdSuffix', right(coalesce(audit."target_user_id", ''), 8),
    'createdAt', audit."created_at",
    'severity', audit."severity",
    'reasonPresent', nullif(btrim(coalesce(audit."reason", '')), '') is not null,
    'source', audit."metadata" ->> 'source',
    'mode', audit."metadata" ->> 'mode',
    'providerRefundExecuted', coalesce((audit."metadata" ->> 'providerRefundExecuted')::boolean, false),
    'liveMoneyAction', coalesce((audit."metadata" ->> 'liveMoneyAction')::boolean, false),
    'legalAuditRecordsRetained', coalesce((audit."metadata" ->> 'legalAuditRecordsRetained')::boolean, false)
  ) order by audit."created_at" desc), '[]'::jsonb)
    into v_items
    from (
      select *
      from public."platform_admin_audit_logs" audit
      where audit."target_user_id" = v_target
        and audit."action" in (
          'admin_deidentify_deleted_account',
          'admin_deidentify_deleted_account_for_proof'
        )
      order by audit."created_at" desc
      limit v_limit
    ) audit;

  return jsonb_build_object(
    'targetUserIdSuffix', right(v_target, 8),
    'items', v_items,
    'count', jsonb_array_length(v_items)
  );
end;
$$;

revoke all on function public."list_account_purge_action_audit"(text, integer) from public;
grant execute on function public."list_account_purge_action_audit"(text, integer) to authenticated, service_role;

comment on function public."list_account_purge_action_audit"(text, integer) is
  'Owner/operator sanitized readback for account purge/de-identification audit rows. Does not expose private audit notes, secrets, provider credentials, or payment data.';
