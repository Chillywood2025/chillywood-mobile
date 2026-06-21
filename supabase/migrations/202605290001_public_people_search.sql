drop function if exists public.search_public_people(text, integer);

create function public.search_public_people(
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
  public_candidates as (
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
      and lower(profile."user_id") not like 'system_%'
      and lower(profile."user_id") not like 'service_%'
      and lower(profile."user_id") not like 'security_%'
      and lower(profile."user_id") not like 'support_%'
      and lower(profile."user_id") not like 'admin_%'
      and lower(profile."user_id") not like 'owner_%'
      and lower(profile."user_id") not like 'operator_%'
      and lower(profile."user_id") not like 'proof_%'
      and lower(profile."user_id") not like 'test_%'
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

comment on function public.search_public_people(text, integer) is
  'Public-safe Explore people search. Searches username/display name only, excludes active staff/operator/system accounts except explicit public official Rachi, respects profile privacy/block policy, masks non-active media, and never returns email or private role fields.';
