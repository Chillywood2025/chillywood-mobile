create or replace function public.resolve_signup_profile_username(
  p_user_id text,
  p_metadata jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate_username text := public.normalize_username_handle(p_metadata ->> 'username');
  fallback_username text := 'user' || substr(md5(coalesce(p_user_id, '') || ':signup'), 1, 12);
  resolved_username text;
  suffix_index integer := 0;
begin
  if public.is_username_available_for_user(candidate_username, p_user_id) then
    return candidate_username;
  end if;

  resolved_username := fallback_username;

  while exists (
    select 1
    from public.user_profiles profile
    where lower(profile."username") = resolved_username
      and profile."user_id" <> p_user_id
  ) loop
    suffix_index := suffix_index + 1;
    resolved_username := left(fallback_username, 20) || suffix_index::text;
  end loop;

  return resolved_username;
end;
$$;

revoke all on function public.resolve_signup_profile_username(text, jsonb) from public;
grant execute on function public.resolve_signup_profile_username(text, jsonb) to service_role;

create or replace function public.ensure_user_profile_after_auth_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_user_id text := new.id::text;
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  resolved_username text;
  resolved_display_name text := nullif(btrim(coalesce(metadata ->> 'display_name', '')), '');
begin
  if normalized_user_id = '' then
    return new;
  end if;

  if exists (
    select 1
    from public.user_profiles profile
    where profile."user_id" = normalized_user_id
  ) then
    return new;
  end if;

  resolved_username := public.resolve_signup_profile_username(normalized_user_id, metadata);

  insert into public.user_profiles (
    "user_id",
    "username",
    "avatar_index",
    "display_name"
  )
  values (
    normalized_user_id,
    resolved_username,
    0,
    left(resolved_display_name, 80)
  )
  on conflict ("user_id") do nothing;

  insert into public.username_change_audit (
    "target_user_id",
    "actor_user_id",
    "old_username",
    "new_username",
    "action",
    "reason"
  )
  values (
    normalized_user_id,
    null,
    null,
    resolved_username,
    'signup_username_created',
    case
      when public.normalize_username_handle(metadata ->> 'username') = resolved_username
        then 'Auth signup metadata username assigned'
      else 'Auth signup fallback username assigned'
    end
  );

  return new;
end;
$$;

drop trigger if exists "ensure_user_profile_after_auth_signup_trigger" on auth.users;
create trigger "ensure_user_profile_after_auth_signup_trigger"
  after insert
  on auth.users
  for each row
  execute function public.ensure_user_profile_after_auth_signup();

with missing_profiles as (
  select
    auth_user.id::text as user_id,
    coalesce(auth_user.raw_user_meta_data, '{}'::jsonb) as metadata
  from auth.users auth_user
  left join public.user_profiles profile
    on profile."user_id" = auth_user.id::text
  where profile."user_id" is null
),
prepared as (
  select
    missing_profiles.user_id,
    public.resolve_signup_profile_username(missing_profiles.user_id, missing_profiles.metadata) as username,
    left(nullif(btrim(coalesce(missing_profiles.metadata ->> 'display_name', '')), ''), 80) as display_name
  from missing_profiles
)
insert into public.user_profiles (
  "user_id",
  "username",
  "avatar_index",
  "display_name"
)
select
  prepared.user_id,
  prepared.username,
  0,
  prepared.display_name
from prepared
on conflict ("user_id") do nothing;

insert into public.username_change_audit (
  "target_user_id",
  "actor_user_id",
  "old_username",
  "new_username",
  "action",
  "reason"
)
select
  profile."user_id",
  null,
  null,
  profile."username",
  'signup_profile_backfill',
  'Backfilled missing auth signup profile username'
from public.user_profiles profile
join auth.users auth_user
  on auth_user.id::text = profile."user_id"
where auth_user.created_at >= now() - interval '30 days'
  and not exists (
    select 1
    from public.username_change_audit audit
    where audit."target_user_id" = profile."user_id"
      and audit."new_username" = profile."username"
      and audit."action" in ('signup_username_created', 'signup_profile_backfill')
  );

comment on function public.ensure_user_profile_after_auth_signup() is
  'Auth signup backstop that creates a public-safe profile username from signup metadata, or a deterministic safe fallback, so confirmed users cannot be left without a profile.';
