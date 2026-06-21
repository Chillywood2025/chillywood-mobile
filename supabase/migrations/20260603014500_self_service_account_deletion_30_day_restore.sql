set check_function_bodies = false;

alter table public."account_deletion_requests"
  drop constraint if exists "account_deletion_requests_status_check";

alter table public."account_deletion_requests"
  add column if not exists "delete_after" timestamptz,
  add column if not exists "restore_deadline" timestamptz,
  add column if not exists "restored_at" timestamptz;

update public."account_deletion_requests"
set
  "status" = 'scheduled',
  "delete_after" = coalesce("delete_after", "requested_at" + interval '30 days'),
  "restore_deadline" = coalesce("restore_deadline", "requested_at" + interval '30 days'),
  "metadata" = coalesce("metadata", '{}'::jsonb)
    || jsonb_build_object('convertedFromRequest', true, 'restoreWindowDays', 30),
  "updated_at" = timezone('utc'::text, now())
where "status" in ('requested', 'reviewing', 'verified', 'processing');

alter table public."account_deletion_requests"
  add constraint "account_deletion_requests_status_check"
    check ("status" in ('scheduled', 'completed', 'restored', 'canceled', 'rejected'));

drop index if exists "account_deletion_requests_one_active_per_user_idx";
create unique index if not exists "account_deletion_requests_one_active_per_user_idx"
  on public."account_deletion_requests" ("user_id")
  where "status" = 'scheduled';

create index if not exists "account_deletion_requests_delete_after_idx"
  on public."account_deletion_requests" ("delete_after")
  where "status" = 'scheduled';

create or replace function public.is_account_deletion_scheduled(p_user_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public."account_deletion_requests" deletion
    where deletion."user_id"::text = nullif(btrim(coalesce(p_user_id, '')), '')
      and deletion."status" = 'scheduled'
      and coalesce(deletion."restore_deadline", deletion."delete_after") > timezone('utc'::text, now())
    limit 1
  );
$$;

revoke all on function public.is_account_deletion_scheduled(text) from public;
grant execute on function public.is_account_deletion_scheduled(text) to anon;
grant execute on function public.is_account_deletion_scheduled(text) to authenticated;
grant execute on function public.is_account_deletion_scheduled(text) to service_role;

create or replace function public.get_my_account_deletion_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  active_deletion public."account_deletion_requests"%rowtype;
begin
  if requesting_user_id is null then
    raise exception 'sign_in_required' using errcode = '28000';
  end if;

  select *
    into active_deletion
    from public."account_deletion_requests"
    where "user_id" = requesting_user_id
      and "status" = 'scheduled'
    order by "requested_at" desc
    limit 1;

  if active_deletion."id" is null then
    return jsonb_build_object(
      'status', 'active',
      'scheduled', false,
      'message', 'Account is active.'
    );
  end if;

  return jsonb_build_object(
    'id', active_deletion."id",
    'status', active_deletion."status",
    'scheduled', true,
    'scheduledAt', active_deletion."requested_at",
    'deleteAfter', active_deletion."delete_after",
    'restoreDeadline', active_deletion."restore_deadline",
    'message', 'Account deletion scheduled.'
  );
end;
$$;

revoke all on function public.get_my_account_deletion_status() from public;
grant execute on function public.get_my_account_deletion_status() to authenticated;

create or replace function public.schedule_account_deletion(
  p_reason text default null,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  requester_email text := nullif(trim(coalesce(auth.jwt() ->> 'email', '')), '');
  normalized_reason text := nullif(trim(coalesce(p_reason, '')), '');
  normalized_details text := nullif(trim(coalesce(p_details, '')), '');
  existing_deletion public."account_deletion_requests"%rowtype;
  created_deletion public."account_deletion_requests"%rowtype;
  now_utc timestamptz := timezone('utc'::text, now());
begin
  if requesting_user_id is null then
    raise exception 'sign_in_required' using errcode = '28000';
  end if;

  select *
    into existing_deletion
    from public."account_deletion_requests"
    where "user_id" = requesting_user_id
      and "status" = 'scheduled'
    order by "requested_at" desc
    limit 1;

  if existing_deletion."id" is not null then
    return jsonb_build_object(
      'id', existing_deletion."id",
      'status', existing_deletion."status",
      'scheduled', true,
      'alreadyExists', true,
      'scheduledAt', existing_deletion."requested_at",
      'deleteAfter', existing_deletion."delete_after",
      'restoreDeadline', existing_deletion."restore_deadline",
      'message', 'Account deletion already scheduled.'
    );
  end if;

  insert into public."account_deletion_requests" (
    "user_id",
    "requester_email",
    "status",
    "reason",
    "details",
    "metadata",
    "requested_at",
    "updated_at",
    "delete_after",
    "restore_deadline"
  )
  values (
    requesting_user_id,
    requester_email,
    'scheduled',
    coalesce(normalized_reason, 'User scheduled account deletion from Settings.'),
    normalized_details,
    jsonb_build_object('source', 'settings', 'restoreWindowDays', 30),
    now_utc,
    now_utc,
    now_utc + interval '30 days',
    now_utc + interval '30 days'
  )
  returning * into created_deletion;

  return jsonb_build_object(
    'id', created_deletion."id",
    'status', created_deletion."status",
    'scheduled', true,
    'alreadyExists', false,
    'scheduledAt', created_deletion."requested_at",
    'deleteAfter', created_deletion."delete_after",
    'restoreDeadline', created_deletion."restore_deadline",
    'message', 'Account deletion scheduled.'
  );
exception
  when unique_violation then
    select *
      into existing_deletion
      from public."account_deletion_requests"
      where "user_id" = requesting_user_id
        and "status" = 'scheduled'
      order by "requested_at" desc
      limit 1;

    return jsonb_build_object(
      'id', existing_deletion."id",
      'status', existing_deletion."status",
      'scheduled', true,
      'alreadyExists', true,
      'scheduledAt', existing_deletion."requested_at",
      'deleteAfter', existing_deletion."delete_after",
      'restoreDeadline', existing_deletion."restore_deadline",
      'message', 'Account deletion already scheduled.'
    );
end;
$$;

revoke all on function public.schedule_account_deletion(text, text) from public;
grant execute on function public.schedule_account_deletion(text, text) to authenticated;

create or replace function public.restore_scheduled_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  restored_deletion public."account_deletion_requests"%rowtype;
  now_utc timestamptz := timezone('utc'::text, now());
begin
  if requesting_user_id is null then
    raise exception 'sign_in_required' using errcode = '28000';
  end if;

  update public."account_deletion_requests"
  set
    "status" = 'restored',
    "restored_at" = now_utc,
    "updated_at" = now_utc,
    "metadata" = coalesce("metadata", '{}'::jsonb)
      || jsonb_build_object('restoredFromSettings', true)
  where "id" = (
    select "id"
    from public."account_deletion_requests"
    where "user_id" = requesting_user_id
      and "status" = 'scheduled'
      and coalesce("restore_deadline", "delete_after") > now_utc
    order by "requested_at" desc
    limit 1
  )
  returning * into restored_deletion;

  if restored_deletion."id" is null then
    return jsonb_build_object(
      'status', 'active',
      'restored', false,
      'message', 'No scheduled deletion found.'
    );
  end if;

  return jsonb_build_object(
    'id', restored_deletion."id",
    'status', restored_deletion."status",
    'restored', true,
    'message', 'Account deletion canceled.'
  );
end;
$$;

revoke all on function public.restore_scheduled_account_deletion() from public;
grant execute on function public.restore_scheduled_account_deletion() to authenticated;

create or replace function public.submit_account_deletion_request(
  p_reason text default null,
  p_details text default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.schedule_account_deletion(p_reason, p_details);
$$;

revoke all on function public.submit_account_deletion_request(text, text) from public;
grant execute on function public.submit_account_deletion_request(text, text) to authenticated;

create or replace function public.can_view_profile_content(profile_user_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor_user_id text := (auth.uid())::text;
  owner_user_id text := nullif(btrim(coalesce(profile_user_id, '')), '');
  owner_profile_visibility text := 'everyone';
  pair_low_id text;
  pair_high_id text;
begin
  if owner_user_id is null then
    return false;
  end if;

  if actor_user_id is not null and actor_user_id = owner_user_id then
    return true;
  end if;

  if public.is_account_deletion_scheduled(owner_user_id) then
    return false;
  end if;

  if public.is_platform_owner_user(owner_user_id) then
    return false;
  end if;

  if actor_user_id is not null and exists (
    select 1
    from public."channel_audience_blocks"
    where (
      "channel_user_id" = actor_user_id
      and "blocked_user_id" = owner_user_id
    ) or (
      "channel_user_id" = owner_user_id
      and "blocked_user_id" = actor_user_id
    )
    limit 1
  ) then
    return false;
  end if;

  select coalesce(nullif("profile_visibility", ''), 'everyone'::text)
  into owner_profile_visibility
  from public."user_profiles"
  where "user_id" = owner_user_id
  limit 1;

  owner_profile_visibility := coalesce(owner_profile_visibility, 'everyone'::text);

  if owner_profile_visibility = 'everyone'::text then
    return true;
  end if;

  if actor_user_id is null or owner_profile_visibility = 'private'::text then
    return false;
  end if;

  pair_low_id := least(actor_user_id, owner_user_id);
  pair_high_id := greatest(actor_user_id, owner_user_id);

  return exists (
    select 1
    from public."user_friendships"
    where "user_low_id" = pair_low_id
      and "user_high_id" = pair_high_id
      and "status" = 'active'::text
    limit 1
  );
end;
$$;

create or replace function public.search_public_people(
  p_query text,
  p_limit integer default 12
)
returns table (
  user_id text,
  display_name text,
  username text,
  avatar_url text,
  is_official boolean,
  official_label text,
  has_public_platform boolean,
  public_platform_id text,
  short_bio text
)
language sql
stable
security definer
set search_path = public
as $$
  with input as (
    select
      nullif(regexp_replace(lower(btrim(coalesce(p_query, ''))), '^@+', ''), '') as query_text,
      least(25, greatest(1, coalesce(p_limit, 12))) as limit_count
  ),
  public_profile_candidates as (
    select
      profile."user_id",
      profile."username",
      profile."display_name",
      profile."avatar_url",
      profile."profile_avatar_media_status",
      profile."tagline",
      profile."channel_role",
      profile."updated_at",
      exists (
        select 1
        from public."platform_brand_profiles" brand
        where brand."owner_user_id" = profile."user_id"
          and brand."published_at" is not null
        limit 1
      ) as has_published_platform_brand,
      exists (
        select 1
        from public."videos" video
        where video."owner_id"::text = profile."user_id"
          and video."visibility" = 'public'
          and video."moderation_status" in ('clean', 'reported')
        limit 1
      ) as has_public_creator_video,
      exists (
        select 1
        from public."creator_events" event
        where event."host_user_id"::text = profile."user_id"
          and event."status" in ('scheduled', 'live_now', 'ended', 'replay_available')
        limit 1
      ) as has_public_creator_event
    from public."user_profiles" profile
    cross join input
    where input.query_text is not null
      and length(input.query_text) >= 2
      and input.query_text not like '%@%'
      and not public.is_account_deletion_scheduled(profile."user_id")
      and public.can_view_profile_content(profile."user_id")
      and (
        lower(coalesce(profile."username", '')) like '%' || input.query_text || '%'
        or lower(coalesce(profile."display_name", '')) like '%' || input.query_text || '%'
      )
      and (
        profile."user_id" = 'platform_rachi_official'
        or not exists (
          select 1
          from public."platform_role_memberships" membership
          where membership."status" = 'active'
            and membership."user_id" = profile."user_id"
            and lower(membership."role") in ('owner', 'operator', 'moderator', 'security', 'support', 'system')
          limit 1
        )
      )
      and (
        profile."user_id" = 'platform_rachi_official'
        or not public.public_people_search_is_internal_account_candidate(
          profile."user_id",
          profile."username",
          profile."display_name"
        )
      )
  ),
  explicit_official_candidates as (
    select
      'platform_rachi_official'::text as "user_id",
      'chillywood.rachi'::text as "username",
      'Rachi'::text as "display_name",
      null::text as "avatar_url",
      'active'::text as "profile_avatar_media_status",
      'Official Chi''llywood guide for updates, tips, and Chi''llywood Originals.'::text as "tagline",
      'creator'::text as "channel_role",
      now() as "updated_at",
      true as has_published_platform_brand,
      true as has_public_creator_video,
      false as has_public_creator_event
    from input
    where input.query_text is not null
      and length(input.query_text) >= 2
      and input.query_text not like '%@%'
      and (
        'rachi' like '%' || input.query_text || '%'
        or 'chillywood.rachi' like '%' || input.query_text || '%'
        or 'official chillywood' like '%' || input.query_text || '%'
      )
      and not exists (
        select 1
        from public_profile_candidates profile_candidate
        where profile_candidate."user_id" = 'platform_rachi_official'
      )
  ),
  public_candidates as (
    select
      "user_id",
      "username",
      "display_name",
      "avatar_url",
      "profile_avatar_media_status",
      "tagline",
      "channel_role",
      "updated_at",
      has_published_platform_brand,
      has_public_creator_video,
      has_public_creator_event
    from public_profile_candidates
    union all
    select
      "user_id",
      "username",
      "display_name",
      "avatar_url",
      "profile_avatar_media_status",
      "tagline",
      "channel_role",
      "updated_at",
      has_published_platform_brand,
      has_public_creator_video,
      has_public_creator_event
    from explicit_official_candidates
  )
  select
    candidate."user_id",
    coalesce(nullif(candidate."display_name", ''), nullif(candidate."username", ''), 'Member') as display_name,
    coalesce(nullif(candidate."username", ''), '') as username,
    case
      when coalesce(candidate."profile_avatar_media_status", 'active') = 'active'
        then candidate."avatar_url"
      else null::text
    end as avatar_url,
    candidate."user_id" = 'platform_rachi_official' as is_official,
    case
      when candidate."user_id" = 'platform_rachi_official' then 'Official Chi''llywood'
      else null::text
    end as official_label,
    (
      candidate."user_id" = 'platform_rachi_official'
      or lower(coalesce(candidate."channel_role", '')) in ('creator', 'host')
      or candidate.has_published_platform_brand
      or candidate.has_public_creator_video
      or candidate.has_public_creator_event
    ) as has_public_platform,
    case
      when (
        candidate."user_id" = 'platform_rachi_official'
        or lower(coalesce(candidate."channel_role", '')) in ('creator', 'host')
        or candidate.has_published_platform_brand
        or candidate.has_public_creator_video
        or candidate.has_public_creator_event
      ) then candidate."user_id"
      else null::text
    end as public_platform_id,
    nullif(candidate."tagline", '') as short_bio
  from public_candidates candidate
  cross join input
  order by
    case
      when lower(coalesce(candidate."username", '')) = input.query_text then 0
      when lower(coalesce(candidate."display_name", '')) = input.query_text then 1
      when lower(coalesce(candidate."username", '')) like input.query_text || '%' then 2
      when lower(coalesce(candidate."display_name", '')) like input.query_text || '%' then 3
      else 4
    end,
    case when candidate."user_id" = 'platform_rachi_official' then 0 else 1 end,
    case
      when (
        lower(coalesce(candidate."channel_role", '')) in ('creator', 'host')
        or candidate.has_published_platform_brand
        or candidate.has_public_creator_video
        or candidate.has_public_creator_event
      ) then 0
      else 1
    end,
    candidate."updated_at" desc
  limit (select limit_count from input);
$$;

revoke all on function public.search_public_people(text, integer) from public;
grant execute on function public.search_public_people(text, integer) to anon;
grant execute on function public.search_public_people(text, integer) to authenticated;
grant execute on function public.search_public_people(text, integer) to service_role;

comment on table public."account_deletion_requests" is
  'Self-service account deletion schedule and audit. Users can schedule deletion, restore within 30 days, and Owner/Admin processing can permanently purge after delete_after.';

comment on function public.schedule_account_deletion(text, text) is
  'Schedules the signed-in user account for deletion with a 30-day restore window.';

comment on function public.restore_scheduled_account_deletion() is
  'Restores the signed-in user account when deletion is still inside the restore window.';

comment on function public.search_public_people(text, integer) is
  'Public-safe Explore people search. Searches username/display name only, includes explicit public official Rachi when matched, excludes deletion-scheduled accounts, active staff/operator/system accounts and proof/operator markers, respects profile privacy/block policy, masks non-active media, and never returns email or private role fields.';
