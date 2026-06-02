create table if not exists public.username_reserved_names (
  "username" text primary key,
  "reason" text not null default 'reserved',
  "is_official_only" boolean not null default false,
  "created_at" timestamp with time zone not null default now(),
  "created_by" text
);

alter table public.username_reserved_names enable row level security;

drop policy if exists "username_reserved_names_public_read" on public.username_reserved_names;
create policy "username_reserved_names_public_read"
  on public.username_reserved_names
  for select
  to anon, authenticated
  using (true);

drop policy if exists "username_reserved_names_admin_insert" on public.username_reserved_names;
create policy "username_reserved_names_admin_insert"
  on public.username_reserved_names
  for insert
  to authenticated
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "username_reserved_names_admin_update" on public.username_reserved_names;
create policy "username_reserved_names_admin_update"
  on public.username_reserved_names
  for update
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "username_reserved_names_admin_delete" on public.username_reserved_names;
create policy "username_reserved_names_admin_delete"
  on public.username_reserved_names
  for delete
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

grant select on table public.username_reserved_names to anon;
grant select on table public.username_reserved_names to authenticated;
grant select, insert, update, delete on table public.username_reserved_names to service_role;

insert into public.username_reserved_names ("username", "reason", "is_official_only")
values
  ('admin', 'platform_role_reserved', true),
  ('administrator', 'platform_role_reserved', true),
  ('owner', 'platform_role_reserved', true),
  ('system', 'platform_role_reserved', true),
  ('support', 'support_reserved', true),
  ('help', 'support_reserved', true),
  ('legal', 'legal_reserved', true),
  ('dmca', 'legal_reserved', true),
  ('privacy', 'legal_reserved', true),
  ('copyright', 'legal_reserved', true),
  ('security', 'security_reserved', true),
  ('api', 'platform_system_reserved', true),
  ('root', 'platform_system_reserved', true),
  ('moderator', 'platform_role_reserved', true),
  ('mod', 'platform_role_reserved', true),
  ('staff', 'platform_role_reserved', true),
  ('official', 'official_reserved', true),
  ('verified', 'official_reserved', true),
  ('chillywood', 'brand_reserved', true),
  ('chiwood', 'brand_reserved', true),
  ('rachi', 'rachi_official_reserved', true),
  ('rachi_official', 'rachi_official_reserved', true),
  ('chillywood.rachi', 'rachi_official_reserved', true),
  ('money', 'platform_feature_reserved', true),
  ('payments', 'platform_feature_reserved', true),
  ('premium', 'platform_feature_reserved', true),
  ('live', 'platform_feature_reserved', true),
  ('watchparty', 'platform_feature_reserved', true),
  ('watch_party', 'platform_feature_reserved', true),
  ('platform', 'platform_feature_reserved', true),
  ('studio', 'platform_feature_reserved', true)
on conflict ("username") do update
set
  "reason" = excluded."reason",
  "is_official_only" = excluded."is_official_only";

create table if not exists public.username_change_audit (
  "id" uuid primary key default gen_random_uuid(),
  "target_user_id" text not null,
  "actor_user_id" text,
  "old_username" text,
  "new_username" text,
  "action" text not null,
  "reason" text,
  "created_at" timestamp with time zone not null default now()
);

alter table public.username_change_audit enable row level security;

drop policy if exists "username_change_audit_owner_operator_read" on public.username_change_audit;
create policy "username_change_audit_owner_operator_read"
  on public.username_change_audit
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "username_change_audit_owner_operator_insert" on public.username_change_audit;
create policy "username_change_audit_owner_operator_insert"
  on public.username_change_audit
  for insert
  to authenticated
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

grant select on table public.username_change_audit to authenticated;
grant select, insert on table public.username_change_audit to service_role;

create index if not exists "username_change_audit_target_created_idx"
  on public.username_change_audit ("target_user_id", "created_at" desc);

create or replace function public.normalize_username_handle(p_username text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(btrim(regexp_replace(coalesce(p_username, ''), '^@+', '')));
$$;

create or replace function public.is_username_format_valid(p_username text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_username, '') ~ '^[a-z0-9](?:[a-z0-9._]{1,22}[a-z0-9])?$'
    and coalesce(p_username, '') not like '%.%'
    or false;
$$;

create or replace function public.is_username_handle_format_valid(p_username text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    length(coalesce(p_username, '')) between 3 and 24
    and coalesce(p_username, '') ~ '^[a-z0-9]([a-z0-9._]*[a-z0-9])$'
    and coalesce(p_username, '') not like '%..%'
    and coalesce(p_username, '') not like '%\_\_%' escape '\'
    and coalesce(p_username, '') not like '%.\_%' escape '\'
    and coalesce(p_username, '') not like '%\_.%' escape '\';
$$;

drop function if exists public.is_username_format_valid(text);

create or replace function public.is_username_format_valid(p_username text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select public.is_username_handle_format_valid(p_username);
$$;

create or replace function public.is_username_blocked_word(p_username text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(coalesce(p_username, '')) ~ '(slur|nazi|terror|kill|abuse|chillywoodofficial|officialchillywood|supportchillywood|legalchillywood|adminchillywood|ownerchillywood|rachiofficial)';
$$;

create or replace function public.is_username_reserved(p_username text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.username_reserved_names reserved
    where reserved."username" = public.normalize_username_handle(p_username)
  );
$$;

create or replace function public.is_username_available_for_user(p_username text, p_user_id text default null)
returns boolean
language sql
stable
set search_path = public
as $$
  with input as (
    select public.normalize_username_handle(p_username) as username
  )
  select
    public.is_username_format_valid(input.username)
    and not public.is_username_blocked_word(input.username)
    and not public.is_username_reserved(input.username)
    and not exists (
      select 1
      from public.user_profiles profile
      where lower(profile."username") = input.username
        and (p_user_id is null or profile."user_id" <> p_user_id)
    )
  from input;
$$;

create or replace function public.build_safe_username_seed(p_username text, p_user_id text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(
    nullif(btrim(regexp_replace(regexp_replace(lower(coalesce(p_username, '')), '[^a-z0-9._]+', '_', 'g'), '(^[._]+|[._]+$)', '', 'g')), ''),
    'user'
  ) || substr(md5(coalesce(p_user_id, 'user')), 1, 8);
$$;

with prepared as (
  select
    profile."user_id",
    profile."username" as old_username,
    public.normalize_username_handle(profile."username") as normalized_username,
    row_number() over (
      partition by public.normalize_username_handle(profile."username")
      order by profile."updated_at" nulls last, profile."user_id"
    ) as duplicate_rank,
    count(*) over (partition by public.normalize_username_handle(profile."username")) as duplicate_count
  from public.user_profiles profile
),
resolved as (
  select
    prepared."user_id",
    prepared.old_username,
    case
      when public.is_username_format_valid(prepared.normalized_username)
        and not public.is_username_blocked_word(prepared.normalized_username)
        and not public.is_username_reserved(prepared.normalized_username)
        and prepared.duplicate_count = 1
        then prepared.normalized_username
      when public.is_username_format_valid(prepared.normalized_username)
        and not public.is_username_blocked_word(prepared.normalized_username)
        and not public.is_username_reserved(prepared.normalized_username)
        and prepared.duplicate_rank = 1
        then prepared.normalized_username
      else 'user' || substr(md5(prepared."user_id"), 1, 12)
    end as new_username
  from prepared
),
deduped as (
  select
    resolved."user_id",
    resolved.old_username,
    case
      when exists (
        select 1
        from resolved other
        where other.new_username = resolved.new_username
          and other."user_id" <> resolved."user_id"
      )
      then left(regexp_replace(resolved.new_username, '[._]+$', '', 'g'), 15) || substr(md5(resolved."user_id"), 1, 8)
      else resolved.new_username
    end as new_username
  from resolved
)
update public.user_profiles profile
set
  "username" = deduped.new_username,
  "updated_at" = now()
from deduped
where profile."user_id" = deduped."user_id"
  and profile."username" is distinct from deduped.new_username;

insert into public.username_change_audit ("target_user_id", "actor_user_id", "old_username", "new_username", "action", "reason")
select
  profile."user_id",
  null,
  null,
  profile."username",
  'backfill_canonicalized',
  'Modern username handle system canonical backfill'
from public.user_profiles profile
where public.is_username_format_valid(profile."username");

alter table public.user_profiles
  drop constraint if exists "user_profiles_username_format_check";

alter table public.user_profiles
  add constraint "user_profiles_username_format_check"
  check (public.is_username_format_valid("username"));

drop index if exists "user_profiles_username_unique_ci_idx";
create unique index "user_profiles_username_unique_ci_idx"
  on public.user_profiles (lower("username"));

create or replace function public.enforce_user_profile_username()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  normalized_username text;
begin
  normalized_username := public.normalize_username_handle(new."username");

  if not public.is_username_format_valid(normalized_username) then
    raise exception using errcode = '23514', message = 'username_invalid';
  end if;

  if public.is_username_blocked_word(normalized_username) then
    raise exception using errcode = '23514', message = 'username_not_allowed';
  end if;

  if public.is_username_reserved(normalized_username)
    and not (
      new."user_id" = 'platform_rachi_official'
      and normalized_username = 'chillywood.rachi'
    )
    and not public.has_platform_role(array['owner'::text, 'operator'::text])
  then
    raise exception using errcode = '23514', message = 'username_reserved';
  end if;

  new."username" := normalized_username;
  return new;
end;
$$;

drop trigger if exists "enforce_user_profile_username_before" on public.user_profiles;
create trigger "enforce_user_profile_username_before"
  before insert or update of "username"
  on public.user_profiles
  for each row
  execute function public.enforce_user_profile_username();

create or replace function public.check_username_availability(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_username text := public.normalize_username_handle(p_username);
  status text := 'available';
  message text := 'Available';
begin
  if length(normalized_username) < 3 then
    status := 'too_short';
    message := 'Too short';
  elsif length(normalized_username) > 24 then
    status := 'invalid';
    message := 'Use 24 characters or fewer';
  elsif not public.is_username_format_valid(normalized_username) then
    status := 'invalid';
    message := 'Use letters, numbers, underscores, or dots';
  elsif public.is_username_blocked_word(normalized_username) then
    status := 'not_allowed';
    message := 'Not allowed';
  elsif public.is_username_reserved(normalized_username) then
    status := 'reserved';
    message := 'This username is reserved';
  elsif exists (
    select 1
    from public.user_profiles profile
    where lower(profile."username") = normalized_username
      and profile."user_id" <> coalesce(auth.uid()::text, '')
  ) then
    status := 'taken';
    message := 'Already taken';
  end if;

  return jsonb_build_object(
    'username', normalized_username,
    'available', status = 'available',
    'status', status,
    'message', message
  );
end;
$$;

revoke all on function public.check_username_availability(text) from public;
grant execute on function public.check_username_availability(text) to anon;
grant execute on function public.check_username_availability(text) to authenticated;
grant execute on function public.check_username_availability(text) to service_role;

create or replace function public.update_my_username(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id text := auth.uid()::text;
  normalized_username text := public.normalize_username_handle(p_username);
  previous_username text;
begin
  if actor_user_id is null then
    raise exception using errcode = '28000', message = 'sign_in_required';
  end if;

  if not public.is_username_format_valid(normalized_username) then
    raise exception using errcode = '23514', message = 'username_invalid';
  end if;

  if public.is_username_blocked_word(normalized_username) then
    raise exception using errcode = '23514', message = 'username_not_allowed';
  end if;

  if public.is_username_reserved(normalized_username) then
    raise exception using errcode = '23514', message = 'username_reserved';
  end if;

  select "username" into previous_username
  from public.user_profiles
  where "user_id" = actor_user_id
  for update;

  if previous_username is null then
    insert into public.user_profiles ("user_id", "username", "avatar_index", "display_name")
    values (actor_user_id, normalized_username, 0, null);
  elsif lower(previous_username) <> normalized_username then
    update public.user_profiles
    set "username" = normalized_username, "updated_at" = now()
    where "user_id" = actor_user_id;
  end if;

  if previous_username is distinct from normalized_username then
    insert into public.username_change_audit ("target_user_id", "actor_user_id", "old_username", "new_username", "action", "reason")
    values (actor_user_id, actor_user_id, previous_username, normalized_username, 'user_changed_username', 'User updated username');
  end if;

  return jsonb_build_object(
    'username', normalized_username,
    'status', 'updated',
    'message', 'Username updated'
  );
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'username_taken';
end;
$$;

revoke all on function public.update_my_username(text) from public;
grant execute on function public.update_my_username(text) to authenticated;
grant execute on function public.update_my_username(text) to service_role;

create or replace function public.admin_force_update_username(
  p_target_user_id text,
  p_username text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id text := auth.uid()::text;
  normalized_target_user_id text := btrim(coalesce(p_target_user_id, ''));
  normalized_username text := public.normalize_username_handle(p_username);
  previous_username text;
begin
  if actor_user_id is null or not public.has_platform_role(array['owner'::text, 'operator'::text]) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  if normalized_target_user_id = '' then
    raise exception using errcode = '23514', message = 'target_required';
  end if;

  if not public.is_username_format_valid(normalized_username) then
    raise exception using errcode = '23514', message = 'username_invalid';
  end if;

  if public.is_username_blocked_word(normalized_username) then
    raise exception using errcode = '23514', message = 'username_not_allowed';
  end if;

  select "username" into previous_username
  from public.user_profiles
  where "user_id" = normalized_target_user_id
  for update;

  if previous_username is null then
    raise exception using errcode = '23503', message = 'target_not_found';
  end if;

  update public.user_profiles
  set "username" = normalized_username, "updated_at" = now()
  where "user_id" = normalized_target_user_id;

  insert into public.username_change_audit ("target_user_id", "actor_user_id", "old_username", "new_username", "action", "reason")
  values (
    normalized_target_user_id,
    actor_user_id,
    previous_username,
    normalized_username,
    'admin_forced_username_change',
    nullif(btrim(coalesce(p_reason, '')), '')
  );

  return jsonb_build_object(
    'username', normalized_username,
    'status', 'updated',
    'message', 'Username updated'
  );
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'username_taken';
end;
$$;

revoke all on function public.admin_force_update_username(text, text, text) from public;
grant execute on function public.admin_force_update_username(text, text, text) to authenticated;
grant execute on function public.admin_force_update_username(text, text, text) to service_role;

comment on table public.username_reserved_names is
  'Protected public username handles. Normal users cannot claim these handles; Owner/Admin can manage reservations with audit in future operations.';

comment on table public.username_change_audit is
  'Private username change audit for account creation, user changes, admin forced changes, official assignments, and migration backfill.';

comment on function public.check_username_availability(text) is
  'Public-safe username availability check. Returns only availability states and never exposes account emails or private account data.';

comment on function public.update_my_username(text) is
  'Authenticated user self-service username update. Enforces canonical lowercase, safe format, reserved names, blocked words, and case-insensitive uniqueness.';
