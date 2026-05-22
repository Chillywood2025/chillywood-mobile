create or replace function public."list_admin_content_audit_events"(p_limit integer default 12)
returns setof public."platform_admin_audit_logs"
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public."admin_content_assert_operator"();

  return query
    select audit.*
    from public."platform_admin_audit_logs" audit
    where audit."action_category" = 'content'
      and (
        audit."metadata" ->> 'admin_content_programming_center' = 'true'
        or audit."target_type" in ('app_configurations', 'title', 'creator_permissions')
        or audit."action" like 'content_%'
        or audit."action" like 'title_%'
        or audit."action" = 'creator_grants_saved'
      )
    order by audit."created_at" desc
    limit greatest(1, least(coalesce(p_limit, 12), 50));
end;
$$;

revoke all on function public."list_admin_content_audit_events"(integer) from public;
grant execute on function public."list_admin_content_audit_events"(integer) to authenticated;
