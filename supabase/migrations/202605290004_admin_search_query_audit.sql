create or replace function public."admin_search_query_type"(p_query text)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when position('@' in coalesce(p_query, '')) > 0 then 'email'
    when trim(coalesce(p_query, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then 'id'
    when trim(coalesce(p_query, '')) ~* '^[0-9a-f]{12,}$' then 'id'
    else 'text'
  end;
$$;

create or replace function public."admin_search_mask_query"(p_query text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_query text := lower(regexp_replace(trim(coalesce(p_query, '')), '\s+', ' ', 'g'));
  v_query_type text := public.admin_search_query_type(v_query);
  v_local text;
  v_domain text;
  v_length integer;
begin
  if v_query = '' then
    return null;
  end if;

  v_length := char_length(v_query);

  if v_query_type = 'email' then
    v_local := split_part(v_query, '@', 1);
    v_domain := split_part(v_query, '@', 2);

    return concat(
      left(v_local, least(2, greatest(char_length(v_local), 1))),
      repeat('*', greatest(char_length(v_local) - 2, 1)),
      '@',
      left(v_domain, 64)
    );
  end if;

  if v_query_type = 'id' then
    return concat(left(v_query, least(8, v_length)), '...', right(v_query, least(4, v_length)));
  end if;

  if v_length <= 3 then
    return concat(left(v_query, 1), repeat('*', greatest(v_length - 1, 1)), ' (', v_length::text, ')');
  end if;

  return concat(left(v_query, 3), '...', right(v_query, least(2, v_length)), ' (', v_length::text, ')');
end;
$$;

create or replace function public."write_admin_search_audit"(
  p_search_scope text,
  p_query text,
  p_result_count integer default null,
  p_status text default 'searched',
  p_event_name text default null,
  p_reason text default null,
  p_result_ref text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id text := auth.uid()::text;
  v_actor_email text := public.platform_staff_normalize_email(auth.jwt() ->> 'email');
  v_actor_role text := null;
  v_authorized boolean := false;
  v_query text := trim(coalesce(p_query, ''));
  v_query_type text := public.admin_search_query_type(p_query);
  v_query_preview text := public.admin_search_mask_query(p_query);
  v_scope text := lower(trim(coalesce(p_search_scope, 'all')));
  v_status text := lower(trim(coalesce(p_status, 'searched')));
  v_event_name text;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_security_context_id uuid := public.security_context_id_from_metadata(v_metadata);
  v_audit_id uuid;
  v_result_count integer := case
    when p_result_count is null then null
    else greatest(0, least(p_result_count, 1000))
  end;
begin
  if v_actor_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'status', 'denied',
      'error', 'admin_search_sign_in_required'
    );
  end if;

  if v_scope not in ('all', 'users', 'reports', 'money', 'provider', 'rachi', 'live_ops', 'legal', 'audit') then
    v_scope := 'all';
  end if;

  if v_status not in ('searched', 'blocked', 'denied', 'failed') then
    v_status := 'searched';
  end if;

  select role
    into v_actor_role
    from public."platform_role_memberships" role_row
    where role_row."status" = 'active'
      and role_row."role" in ('owner', 'operator', 'moderator')
      and (
        role_row."user_id" = v_actor_user_id
        or lower(role_row."email") = v_actor_email
      )
    order by case role_row."role"
      when 'owner' then 1
      when 'operator' then 2
      when 'moderator' then 3
      else 4
    end
    limit 1;

  v_authorized :=
    public.has_platform_role(array['owner'::text])
    or public.has_platform_permission('admin_grants')
    or public.has_platform_permission('manage_moderators')
    or public.has_platform_permission('content_moderation')
    or public.has_platform_permission('reports_review')
    or public.has_platform_permission('live_ops')
    or public.has_platform_permission('legal_review')
    or public.has_platform_permission('evidence_export')
    or public.has_platform_permission('emergency_break_glass')
    or public.has_platform_permission('audit_review')
    or public.has_platform_permission('security_review')
    or public.has_platform_permission('legal_request_intake')
    or public.has_platform_permission('staff_permission_templates');

  if not v_authorized then
    insert into public."platform_admin_audit_logs" (
      "actor_user_id",
      "actor_email",
      "actor_role",
      "action",
      "action_category",
      "target_type",
      "reason",
      "severity",
      "metadata",
      "security_context_id"
    )
    values (
      v_actor_user_id,
      v_actor_email,
      coalesce(v_actor_role, 'member'),
      'admin_search_denied',
      'admin_access',
      'admin_search',
      nullif(trim(coalesce(p_reason, '')), ''),
      'warning',
      jsonb_build_object(
        'surface', 'admin_search',
        'event_name', 'admin_search_denied',
        'search_scope', v_scope,
        'query_type', v_query_type,
        'query_preview', v_query_preview,
        'query_length', char_length(v_query),
        'result_count', null,
        'status', 'denied',
        'raw_query_stored', false,
        'email_plaintext_stored', false
      ) || v_metadata,
      v_security_context_id
    )
    returning "id" into v_audit_id;

    return jsonb_build_object(
      'ok', false,
      'auditLogId', v_audit_id,
      'status', 'denied',
      'eventName', 'admin_search_denied',
      'searchScope', v_scope,
      'queryType', v_query_type,
      'queryPreview', v_query_preview,
      'resultCount', null,
      'createdAt', timezone('utc'::text, now())
    );
  end if;

  if v_query = '' then
    return jsonb_build_object(
      'ok', false,
      'status', 'blocked',
      'error', 'admin_search_empty_query'
    );
  end if;

  v_event_name := coalesce(
    nullif(trim(coalesce(p_event_name, '')), ''),
    case when v_query_type = 'email' then 'admin_search_email_lookup' else 'admin_search_query' end
  );

  if v_event_name not in ('admin_search_query', 'admin_search_email_lookup', 'admin_search_denied', 'admin_search_result_opened') then
    v_event_name := case when v_query_type = 'email' then 'admin_search_email_lookup' else 'admin_search_query' end;
  end if;

  insert into public."platform_admin_audit_logs" (
    "actor_user_id",
    "actor_email",
    "actor_role",
    "action",
    "action_category",
    "target_type",
    "target_id",
    "reason",
    "severity",
    "metadata",
    "security_context_id"
  )
  values (
    v_actor_user_id,
    v_actor_email,
    coalesce(v_actor_role, 'operator'),
    v_event_name,
    'admin_access',
    'admin_search',
    left(nullif(trim(coalesce(p_result_ref, '')), ''), 128),
    nullif(trim(coalesce(p_reason, '')), ''),
    case
      when v_status in ('denied', 'failed') then 'warning'
      when v_event_name = 'admin_search_result_opened' then 'notice'
      else 'info'
    end,
    jsonb_build_object(
      'surface', 'admin_search',
      'event_name', v_event_name,
      'search_scope', v_scope,
      'query_type', v_query_type,
      'query_preview', v_query_preview,
      'query_length', char_length(v_query),
      'result_count', v_result_count,
      'status', v_status,
      'raw_query_stored', false,
      'email_plaintext_stored', false
    ) || v_metadata,
    v_security_context_id
  )
  returning "id" into v_audit_id;

  return jsonb_build_object(
    'ok', true,
    'auditLogId', v_audit_id,
    'status', v_status,
    'eventName', v_event_name,
    'searchScope', v_scope,
    'queryType', v_query_type,
    'queryPreview', v_query_preview,
    'resultCount', v_result_count,
    'createdAt', timezone('utc'::text, now())
  );
end;
$$;

revoke all on function public."admin_search_query_type"(text) from public;
revoke all on function public."admin_search_mask_query"(text) from public;
revoke all on function public."write_admin_search_audit"(text, text, integer, text, text, text, text, jsonb) from public;

grant execute on function public."admin_search_query_type"(text) to authenticated, service_role;
grant execute on function public."admin_search_mask_query"(text) to authenticated, service_role;
grant execute on function public."write_admin_search_audit"(text, text, integer, text, text, text, text, jsonb) to authenticated, service_role;
