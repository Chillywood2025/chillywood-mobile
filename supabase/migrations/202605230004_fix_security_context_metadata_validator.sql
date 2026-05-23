-- Fix security context metadata validator after remote lint caught a uuid/text
-- comparison. security_request_context.user_id is uuid, so authenticated
-- callers must match auth.uid() directly.

create or replace function public."security_context_id_from_metadata"(p_metadata jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_context_text text := nullif(trim(coalesce(p_metadata->>'security_context_id', '')), '');
  v_context_id uuid;
  v_request_role text := nullif(current_setting('request.jwt.claim.role', true), '');
begin
  if v_context_text is null then
    return null;
  end if;

  begin
    v_context_id := v_context_text::uuid;
  exception when invalid_text_representation then
    return null;
  end;

  if v_request_role = 'service_role' then
    if exists (
      select 1
      from public."security_request_context" context
      where context."id" = v_context_id
    ) then
      return v_context_id;
    end if;
    return null;
  end if;

  if auth.uid() is not null and exists (
    select 1
    from public."security_request_context" context
    where context."id" = v_context_id
      and context."user_id" = auth.uid()
  ) then
    return v_context_id;
  end if;

  return null;
end;
$$;

revoke all on function public."security_context_id_from_metadata"(jsonb) from public;
grant execute on function public."security_context_id_from_metadata"(jsonb) to authenticated, service_role;

comment on function public."security_context_id_from_metadata"(jsonb) is
  'Safely resolves a security_context_id from trusted audit metadata. Service-role callers may reference any existing context; authenticated callers may reference only their own uuid-owned context.';
