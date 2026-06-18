create or replace function public.can_view_profile_content(profile_user_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  access_result jsonb;
begin
  access_result := public."resolve_profile_visibility_access"(profile_user_id, (auth.uid())::text);
  return coalesce((access_result->>'allowed')::boolean, false);
exception
  when others then
    return false;
end;
$$;

revoke all on function public.can_view_profile_content(text) from public;
grant execute on function public.can_view_profile_content(text) to anon, authenticated, postgres, service_role;

comment on function public.can_view_profile_content(text) is
  'Profile content RLS bridge for hard Profile access visibility. Uses resolve_profile_visibility_access, so public/private/subscriber_only gates are server-enforced and followers do not unlock private content.';
