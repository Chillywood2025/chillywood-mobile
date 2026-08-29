-- Align the legacy autonomous Owner/Super Admin gate with the canonical
-- exact-current-session authority boundary. Membership alone must never keep
-- privileged autonomous-governance authority alive after the bearer session is
-- revoked, restricted, restore-only, cross-user, missing, or past not_after.
create or replace function public.autonomous_actor_authority_role(
  p_actor_user_id text,
  p_actor_email text default null::text
)
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select membership."role"
  from public."platform_role_memberships" membership
  join auth.users subject
    on subject."id"::text = membership."user_id"
   and subject."email_confirmed_at" is not null
   and subject."deleted_at" is null
  where nullif(trim(coalesce(p_actor_user_id, '')), '') is not null
    and public."platform_exact_current_session_subject"(
      nullif(trim(coalesce(p_actor_user_id, '')), '')
    )
    and membership."user_id" = nullif(trim(coalesce(p_actor_user_id, '')), '')
    and membership."status" = 'active'
    and membership."role" in ('owner', 'super_admin')
    and (
      membership."expires_at" is null
      or membership."expires_at" > timezone('utc'::text, now())
    )
  order by case membership."role" when 'owner' then 0 else 1 end
  limit 1;
$function$;

comment on function public.autonomous_actor_authority_role(text, text) is
  'Returns Owner/Super Admin autonomous authority only for the exact currently authoritative authenticated session and immutable subject; email is never runtime authority.';
