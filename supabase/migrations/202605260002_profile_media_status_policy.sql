alter table public."user_profiles"
  add column if not exists "profile_avatar_media_status" text default 'active'::text not null,
  add column if not exists "profile_avatar_media_flagged_at" timestamp with time zone,
  add column if not exists "profile_background_media_status" text default 'active'::text not null,
  add column if not exists "profile_background_media_flagged_at" timestamp with time zone;

alter table public."user_profiles"
  drop constraint if exists "user_profiles_profile_avatar_media_status_check";
alter table public."user_profiles"
  add constraint "user_profiles_profile_avatar_media_status_check"
  check ("profile_avatar_media_status" in ('active'::text, 'user_removed'::text, 'flagged'::text, 'admin_removed'::text));

alter table public."user_profiles"
  drop constraint if exists "user_profiles_profile_background_media_status_check";
alter table public."user_profiles"
  add constraint "user_profiles_profile_background_media_status_check"
  check ("profile_background_media_status" in ('active'::text, 'user_removed'::text, 'flagged'::text, 'admin_removed'::text));

alter table public."safety_reports"
  drop constraint if exists "safety_reports_target_type_check";

alter table public."safety_reports"
  add constraint "safety_reports_target_type_check"
  check (
    "target_type" in (
      'participant',
      'room',
      'title',
      'creator_video',
      'profile_post',
      'profile_post_comment',
      'profile_media',
      'creator_video_comment',
      'social_attachment'
    )
  );

drop function if exists public.read_public_channel_profile(text);
create function public.read_public_channel_profile(profile_user_id text)
returns table (
  user_id text,
  username text,
  avatar_index integer,
  display_name text,
  avatar_url text,
  profile_avatar_media_status text,
  profile_avatar_media_flagged_at timestamp with time zone,
  tagline text,
  channel_layout_preset text,
  channel_role text,
  profile_visibility text,
  public_activity_visibility text,
  follower_surface_enabled boolean,
  subscriber_surface_enabled boolean,
  default_watch_party_join_policy text,
  default_watch_party_reactions_policy text,
  default_watch_party_content_access_rule text,
  default_watch_party_capture_policy text,
  default_communication_content_access_rule text,
  default_communication_capture_policy text,
  profile_avatar_fit_mode text,
  profile_avatar_focal_x numeric,
  profile_avatar_focal_y numeric,
  profile_background_url text,
  profile_background_media_status text,
  profile_background_media_flagged_at timestamp with time zone,
  profile_background_fit_mode text,
  profile_background_focal_x numeric,
  profile_background_focal_y numeric,
  profile_background_overlay_strength numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    profile.user_id,
    profile.username,
    profile.avatar_index,
    profile.display_name,
    case
      when coalesce(profile.profile_avatar_media_status, 'active') = 'active' then profile.avatar_url
      else null::text
    end as avatar_url,
    coalesce(profile.profile_avatar_media_status, 'active') as profile_avatar_media_status,
    profile.profile_avatar_media_flagged_at,
    profile.tagline,
    profile.channel_layout_preset,
    profile.channel_role,
    profile.profile_visibility,
    profile.public_activity_visibility,
    profile.follower_surface_enabled,
    profile.subscriber_surface_enabled,
    null::text as default_watch_party_join_policy,
    null::text as default_watch_party_reactions_policy,
    null::text as default_watch_party_content_access_rule,
    null::text as default_watch_party_capture_policy,
    null::text as default_communication_content_access_rule,
    null::text as default_communication_capture_policy,
    profile.profile_avatar_fit_mode,
    profile.profile_avatar_focal_x,
    profile.profile_avatar_focal_y,
    case
      when coalesce(profile.profile_background_media_status, 'active') = 'active' then profile.profile_background_url
      else null::text
    end as profile_background_url,
    coalesce(profile.profile_background_media_status, 'active') as profile_background_media_status,
    profile.profile_background_media_flagged_at,
    profile.profile_background_fit_mode,
    profile.profile_background_focal_x,
    profile.profile_background_focal_y,
    profile.profile_background_overlay_strength
  from public.user_profiles profile
  where profile.user_id = nullif(btrim(coalesce(profile_user_id, '')), '')
    and public.can_view_profile_content(profile.user_id)
  limit 1;
$$;

revoke all on function public.read_public_channel_profile(text) from public;
grant execute on function public.read_public_channel_profile(text) to "anon";
grant execute on function public.read_public_channel_profile(text) to "authenticated";
grant execute on function public.read_public_channel_profile(text) to "postgres";
grant execute on function public.read_public_channel_profile(text) to "service_role";

create or replace function public."admin_reports_target_state"(
  p_target_type text,
  p_target_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_type text := lower(trim(coalesce(p_target_type, '')));
  v_target_uuid uuid := public."admin_reports_safe_uuid"(p_target_id);
  v_state jsonb;
begin
  if v_target_type in ('creator_video', 'profile_post', 'profile_post_comment', 'profile_media', 'creator_video_comment', 'social_attachment')
    and v_target_uuid is null then
    return jsonb_build_object(
      'found', false,
      'targetActionSupported', false,
      'disabledReason', 'Target action requires a UUID-backed content id.'
    );
  end if;

  case v_target_type
    when 'creator_video' then
      select jsonb_build_object(
        'found', true,
        'targetActionSupported', true,
        'backend', 'videos',
        'ownerUserId', video."owner_id",
        'moderationStatus', video."moderation_status",
        'moderationReason', video."moderation_reason",
        'moderatedAt', video."moderated_at",
        'publicAvailability', case when video."visibility" = 'public' and video."moderation_status" in ('clean', 'reported') then 'public' else 'restricted' end
      )
      into v_state
      from public."videos" video
      where video."id" = v_target_uuid;
    when 'profile_post' then
      select jsonb_build_object(
        'found', true,
        'targetActionSupported', true,
        'backend', 'profile_posts',
        'ownerUserId', post."user_id",
        'moderationStatus', post."moderation_status",
        'moderationReason', post."moderation_reason",
        'moderatedAt', post."moderated_at",
        'publicAvailability', case when post."deleted_at" is null and post."visibility" = 'public' and post."moderation_status" in ('clean', 'reported') then 'public' else 'restricted' end
      )
      into v_state
      from public."profile_posts" post
      where post."id" = v_target_uuid;
    when 'profile_post_comment' then
      select jsonb_build_object(
        'found', true,
        'targetActionSupported', true,
        'backend', 'profile_post_comments',
        'ownerUserId', comment."user_id",
        'moderationStatus', comment."moderation_status",
        'moderationReason', comment."moderation_reason",
        'moderatedAt', comment."moderated_at",
        'publicAvailability', case when comment."deleted_at" is null and comment."moderation_status" in ('clean', 'reported') then 'public_if_parent_public' else 'restricted' end
      )
      into v_state
      from public."profile_post_comments" comment
      where comment."id" = v_target_uuid;
    when 'profile_media' then
      select jsonb_build_object(
        'found', true,
        'targetActionSupported', true,
        'backend', 'user_profiles',
        'ownerUserId', profile."user_id",
        'avatarStatus', coalesce(profile."profile_avatar_media_status", 'active'),
        'avatarFlaggedAt', profile."profile_avatar_media_flagged_at",
        'backgroundStatus', coalesce(profile."profile_background_media_status", 'active'),
        'backgroundFlaggedAt', profile."profile_background_media_flagged_at",
        'publicAvailability', case
          when coalesce(profile."profile_avatar_media_status", 'active') = 'active'
            or coalesce(profile."profile_background_media_status", 'active') = 'active'
          then 'public'
          else 'restricted'
        end
      )
      into v_state
      from public."user_profiles" profile
      where profile."user_id" = v_target_uuid::text;
    when 'creator_video_comment' then
      select jsonb_build_object(
        'found', true,
        'targetActionSupported', true,
        'backend', 'creator_video_comments',
        'ownerUserId', comment."user_id",
        'moderationStatus', comment."moderation_status",
        'moderationReason', comment."moderation_reason",
        'moderatedAt', comment."moderated_at",
        'publicAvailability', case when comment."deleted_at" is null and comment."moderation_status" in ('clean', 'reported') then 'public_if_parent_public' else 'restricted' end
      )
      into v_state
      from public."creator_video_comments" comment
      where comment."id" = v_target_uuid;
    when 'social_attachment' then
      select jsonb_build_object(
        'found', true,
        'targetActionSupported', true,
        'backend', 'social_attachments',
        'ownerUserId', attachment."owner_user_id",
        'moderationStatus', attachment."moderation_status",
        'moderationReason', attachment."moderation_reason",
        'moderatedAt', attachment."moderated_at",
        'publicAvailability', case when attachment."deleted_at" is null and attachment."moderation_status" in ('clean', 'reported') then 'public_if_surface_public' else 'restricted' end
      )
      into v_state
      from public."social_attachments" attachment
      where attachment."id" = v_target_uuid;
    else
      return jsonb_build_object(
        'found', false,
        'targetActionSupported', false,
        'disabledReason', concat('Target moderation is not backed for ', coalesce(nullif(v_target_type, ''), 'unknown'), ' reports. Mark Reviewed, Dismiss, or Escalate remain backed.')
      );
  end case;

  return coalesce(v_state, jsonb_build_object(
    'found', false,
    'targetActionSupported', false,
    'disabledReason', 'Target content was not found in the backed moderation table.'
  ));
end;
$$;

create or replace function public."apply_admin_report_target_action"(
  p_report_id bigint,
  p_target_type text,
  p_target_id text,
  p_action_type text,
  p_reason text
)
returns public."safety_reports"
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_type text := lower(trim(coalesce(p_target_type, '')));
  v_action text := lower(trim(coalesce(p_action_type, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_actor uuid := auth.uid();
  v_target_uuid uuid := public."admin_reports_safe_uuid"(p_target_id);
  v_old_report public."safety_reports";
  v_new_report public."safety_reports";
  v_target_before jsonb;
  v_target_after jsonb;
  v_next_status text;
  v_next_profile_media_status text;
  v_profile_media_kind text;
  v_resolution text;
  v_now timestamptz := timezone('utc'::text, now());
begin
  perform public."admin_reports_assert_target_operator"();

  if v_actor is null then
    raise exception 'admin_reports_auth_required';
  end if;
  if v_reason is null then
    raise exception 'admin_report_reason_required';
  end if;
  if v_target_uuid is null then
    raise exception 'admin_report_target_uuid_required';
  end if;

  select * into v_old_report
  from public."safety_reports"
  where "id" = p_report_id
  for update;

  if v_old_report."id" is null then
    raise exception 'admin_report_not_found';
  end if;
  if v_old_report."target_type" <> v_target_type or v_old_report."target_id" <> trim(coalesce(p_target_id, '')) then
    raise exception 'admin_report_target_mismatch';
  end if;
  if v_old_report."status" in ('actioned', 'dismissed') then
    raise exception 'admin_report_closed_state';
  end if;

  if v_action in ('hide_from_public', 'hidden', 'hide') then
    v_next_status := 'hidden';
    v_next_profile_media_status := 'flagged';
    v_resolution := 'target_hidden';
  elsif v_action in ('remove_from_public', 'removed', 'remove') then
    v_next_status := 'removed';
    v_next_profile_media_status := 'admin_removed';
    v_resolution := 'target_removed';
  elsif v_action in ('restore_clean', 'clean', 'restore') then
    v_next_status := 'clean';
    v_next_profile_media_status := 'active';
    v_resolution := 'target_restored';
  else
    raise exception 'admin_report_target_action_invalid';
  end if;

  case v_target_type
    when 'creator_video' then
      select to_jsonb(video) into v_target_before from public."videos" video where video."id" = v_target_uuid;
      update public."videos"
        set "moderation_status" = v_next_status,
            "moderation_reason" = v_reason,
            "moderated_at" = v_now,
            "moderated_by" = v_actor::text,
            "updated_at" = v_now
        where "id" = v_target_uuid;
      select to_jsonb(video) into v_target_after from public."videos" video where video."id" = v_target_uuid;
    when 'profile_post' then
      select to_jsonb(post) into v_target_before from public."profile_posts" post where post."id" = v_target_uuid;
      update public."profile_posts"
        set "moderation_status" = v_next_status,
            "moderation_reason" = v_reason,
            "moderated_at" = v_now,
            "moderated_by" = v_actor::text,
            "updated_at" = v_now
        where "id" = v_target_uuid;
      select to_jsonb(post) into v_target_after from public."profile_posts" post where post."id" = v_target_uuid;
    when 'profile_post_comment' then
      select to_jsonb(comment) into v_target_before from public."profile_post_comments" comment where comment."id" = v_target_uuid;
      update public."profile_post_comments"
        set "moderation_status" = v_next_status,
            "moderation_reason" = v_reason,
            "moderated_at" = v_now,
            "moderated_by" = v_actor::text,
            "updated_at" = v_now
        where "id" = v_target_uuid;
      select to_jsonb(comment) into v_target_after from public."profile_post_comments" comment where comment."id" = v_target_uuid;
    when 'profile_media' then
      v_profile_media_kind := lower(trim(coalesce(
        v_old_report."context"->>'profileMediaKind',
        v_old_report."context"->>'profile_media_kind',
        ''
      )));

      if v_profile_media_kind not in ('avatar', 'background') then
        raise exception 'admin_report_profile_media_kind_required';
      end if;

      select to_jsonb(profile) into v_target_before
      from public."user_profiles" profile
      where profile."user_id" = v_target_uuid::text;

      if v_profile_media_kind = 'avatar' then
        update public."user_profiles"
          set "profile_avatar_media_status" = v_next_profile_media_status,
              "profile_avatar_media_flagged_at" = case when v_next_profile_media_status = 'active' then null else v_now end,
              "profile_media_updated_at" = v_now,
              "updated_at" = v_now
          where "user_id" = v_target_uuid::text;
      else
        update public."user_profiles"
          set "profile_background_media_status" = v_next_profile_media_status,
              "profile_background_media_flagged_at" = case when v_next_profile_media_status = 'active' then null else v_now end,
              "profile_media_updated_at" = v_now,
              "updated_at" = v_now
          where "user_id" = v_target_uuid::text;
      end if;

      select to_jsonb(profile) into v_target_after
      from public."user_profiles" profile
      where profile."user_id" = v_target_uuid::text;
    when 'creator_video_comment' then
      select to_jsonb(comment) into v_target_before from public."creator_video_comments" comment where comment."id" = v_target_uuid;
      update public."creator_video_comments"
        set "moderation_status" = v_next_status,
            "moderation_reason" = v_reason,
            "moderated_at" = v_now,
            "moderated_by" = v_actor::text,
            "updated_at" = v_now
        where "id" = v_target_uuid;
      select to_jsonb(comment) into v_target_after from public."creator_video_comments" comment where comment."id" = v_target_uuid;
    when 'social_attachment' then
      select to_jsonb(attachment) into v_target_before from public."social_attachments" attachment where attachment."id" = v_target_uuid;
      update public."social_attachments"
        set "moderation_status" = v_next_status,
            "moderation_reason" = v_reason,
            "moderated_at" = v_now,
            "moderated_by" = v_actor::text,
            "updated_at" = v_now
        where "id" = v_target_uuid;
      select to_jsonb(attachment) into v_target_after from public."social_attachments" attachment where attachment."id" = v_target_uuid;
    else
      raise exception 'admin_report_target_action_unsupported';
  end case;

  if v_target_before is null or v_target_after is null then
    raise exception 'admin_report_target_not_found';
  end if;

  update public."safety_reports"
  set
    "status" = 'actioned',
    "resolution_type" = v_resolution,
    "resolution_reason" = v_reason,
    "resolved_by" = v_actor,
    "resolved_at" = v_now,
    "actioned_at" = v_now,
    "updated_at" = v_now
  where "id" = p_report_id
  returning * into v_new_report;

  perform public."admin_reports_write_audit"(
    p_report_id,
    v_new_report."target_type",
    v_new_report."target_id",
    v_resolution,
    v_reason,
    v_old_report."status",
    v_new_report."status",
    v_old_report."severity",
    v_new_report."severity",
    jsonb_build_object('report', to_jsonb(v_old_report), 'target', v_target_before),
    jsonb_build_object('report', to_jsonb(v_new_report), 'target', v_target_after),
    jsonb_build_object(
      'target_action', v_action,
      'moderation_status', v_next_status,
      'profile_media_status', case when v_target_type = 'profile_media' then v_next_profile_media_status else null end,
      'profile_media_kind', case when v_target_type = 'profile_media' then v_profile_media_kind else null end
    )
  );

  return v_new_report;
end;
$$;

grant execute on function public."apply_admin_report_target_action"(bigint, text, text, text, text) to authenticated;

comment on column public."user_profiles"."profile_avatar_media_status" is
  'Owner-controlled Profile photo status. Valid uploads publish as active; flagged/admin_removed statuses hide public rendering without manual approval by default.';
comment on column public."user_profiles"."profile_background_media_status" is
  'Owner-controlled Profile background status. Valid uploads publish as active; flagged/admin_removed statuses hide public rendering without manual approval by default.';
comment on function public.read_public_channel_profile(text) is
  'Reads public-safe Profile identity and appearance. Profile media URLs are masked unless owner-controlled media status is active.';
