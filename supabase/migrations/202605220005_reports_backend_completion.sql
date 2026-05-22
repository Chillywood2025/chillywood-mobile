-- Reports Backend Completion Full Closeout.
-- Adds backed severity/status/resolution state, status/action RPCs, immutable
-- moderation audit writes, and supported non-creator-video target moderation.

alter table public."safety_reports"
  add column if not exists "severity" text default 'unknown'::text not null,
  add column if not exists "status" text default 'needs_review'::text not null,
  add column if not exists "resolution_type" text,
  add column if not exists "resolution_reason" text,
  add column if not exists "resolved_by" uuid,
  add column if not exists "resolved_at" timestamptz,
  add column if not exists "escalated_at" timestamptz,
  add column if not exists "actioned_at" timestamptz,
  add column if not exists "updated_at" timestamptz default timezone('utc'::text, now()) not null;

update public."safety_reports"
set
  "severity" = case
    when "category" = 'safety'
      and coalesce("note", '') ~* '(child|minor|self[- ]?harm|suicide|violence|violent|threat|weapon)'
      then 'critical'
    when "category" in ('abuse', 'harassment')
      then 'high'
    when "category" = 'safety'
      and coalesce("note", '') ~* '(scam|fraud|malware|illegal|spam)'
      then 'medium'
    when "category" in ('copyright', 'impersonation')
      then 'medium'
    else 'unknown'
  end
where coalesce(nullif(trim("severity"), ''), 'unknown') = 'unknown';

update public."safety_reports"
set "status" = 'needs_review'
where coalesce(nullif(trim("status"), ''), 'needs_review') = 'needs_review';

alter table public."safety_reports"
  alter column "severity" set default 'unknown',
  alter column "severity" set not null,
  alter column "status" set default 'needs_review',
  alter column "status" set not null,
  alter column "updated_at" set default timezone('utc'::text, now()),
  alter column "updated_at" set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'safety_reports_severity_check'
  ) then
    alter table public."safety_reports"
      add constraint "safety_reports_severity_check"
      check ("severity" in ('low', 'medium', 'high', 'critical', 'unknown'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'safety_reports_status_check'
  ) then
    alter table public."safety_reports"
      add constraint "safety_reports_status_check"
      check ("status" in ('needs_review', 'reviewing', 'actioned', 'dismissed', 'escalated'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'safety_reports_resolution_type_check'
  ) then
    alter table public."safety_reports"
      add constraint "safety_reports_resolution_type_check"
      check (
        "resolution_type" is null
        or "resolution_type" in (
          'marked_reviewed',
          'dismissed',
          'escalated',
          'target_hidden',
          'target_removed',
          'target_restored',
          'no_action_needed',
          'duplicate',
          'unsupported_target'
        )
      );
  end if;
end $$;

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
      'creator_video_comment',
      'social_attachment'
    )
  );

create index if not exists "safety_reports_status_created_idx"
  on public."safety_reports" using btree ("status", "created_at" desc);

create index if not exists "safety_reports_severity_created_idx"
  on public."safety_reports" using btree ("severity", "created_at" desc);

create index if not exists "safety_reports_target_status_idx"
  on public."safety_reports" using btree ("target_type", "target_id", "status", "created_at" desc);

create index if not exists "safety_reports_resolved_at_idx"
  on public."safety_reports" using btree ("resolved_at" desc)
  where "resolved_at" is not null;

create index if not exists "safety_reports_actioned_at_idx"
  on public."safety_reports" using btree ("actioned_at" desc)
  where "actioned_at" is not null;

create or replace function public."set_safety_reports_updated_at"()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new."updated_at" = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists "set_safety_reports_updated_at" on public."safety_reports";
create trigger "set_safety_reports_updated_at"
  before update on public."safety_reports"
  for each row execute function public."set_safety_reports_updated_at"();

drop policy if exists "safety_reports_select_review_queue" on public."safety_reports";
create policy "safety_reports_select_review_queue"
  on public."safety_reports"
  for select
  to authenticated
  using (
    public.has_platform_role(array['owner'::text])
    or public.has_platform_role(array['moderator'::text])
    or public.has_platform_permission('reports_review')
    or public.has_platform_permission('content_moderation')
  );

revoke update, delete, truncate on table public."safety_reports" from anon, authenticated;
grant select, insert on table public."safety_reports" to authenticated;
grant all on table public."safety_reports" to service_role;

create or replace function public."admin_reports_actor_can_review"()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and (
      public.has_platform_role(array['owner'::text])
      or public.has_platform_role(array['moderator'::text])
      or public.has_platform_permission('reports_review')
      or public.has_platform_permission('content_moderation')
    );
$$;

create or replace function public."admin_reports_actor_can_target_action"()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and (
      public.has_platform_role(array['owner'::text])
      or public.has_platform_permission('content_moderation')
    );
$$;

create or replace function public."admin_reports_assert_reviewer"()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public."admin_reports_actor_can_review"() then
    raise exception 'admin_reports_permission_denied';
  end if;
end;
$$;

create or replace function public."admin_reports_assert_target_operator"()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public."admin_reports_actor_can_target_action"() then
    raise exception 'admin_reports_target_permission_denied';
  end if;
end;
$$;

create or replace function public."admin_reports_safe_uuid"(p_value text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  if nullif(trim(coalesce(p_value, '')), '') is null then
    return null;
  end if;

  if p_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;

  return p_value::uuid;
exception
  when others then
    return null;
end;
$$;

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
  if v_target_type in ('creator_video', 'profile_post', 'profile_post_comment', 'creator_video_comment', 'social_attachment')
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

create or replace function public."admin_reports_write_audit"(
  p_report_id bigint,
  p_target_type text,
  p_target_id text,
  p_action_type text,
  p_reason text,
  p_old_status text,
  p_new_status text,
  p_old_severity text,
  p_new_severity text,
  p_before_state jsonb,
  p_after_state jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_audit_id uuid;
  v_action text := lower(trim(coalesce(p_action_type, 'unknown')));
  v_actor_role text := coalesce(nullif(public.platform_staff_actor_role(), ''), 'member');
begin
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
    "before_state",
    "after_state",
    "metadata"
  )
  values (
    auth.uid()::text,
    nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''),
    v_actor_role,
    concat('reports_', v_action),
    'moderation',
    nullif(trim(coalesce(p_target_type, '')), ''),
    nullif(trim(coalesce(p_target_id, '')), ''),
    nullif(trim(coalesce(p_reason, '')), ''),
    case
      when v_action in ('target_removed', 'escalated') then 'warning'
      when v_action in ('target_hidden', 'dismissed') then 'notice'
      else 'info'
    end,
    coalesce(p_before_state, '{}'::jsonb),
    coalesce(p_after_state, '{}'::jsonb),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'report_id', p_report_id,
      'target_type', p_target_type,
      'target_id', p_target_id,
      'action_type', v_action,
      'old_status', p_old_status,
      'new_status', p_new_status,
      'old_severity', p_old_severity,
      'new_severity', p_new_severity,
      'ui_surface', 'admin_reports_triage'
    )
  )
  returning "id" into v_audit_id;

  return v_audit_id;
end;
$$;

create or replace function public."get_admin_reports_overview"()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_needs_review bigint;
  v_critical_high bigint;
  v_actioned_today bigint;
  v_total bigint;
  v_sources jsonb;
begin
  perform public."admin_reports_assert_reviewer"();

  select count(*) into v_total from public."safety_reports";
  select count(*) into v_needs_review from public."safety_reports" where "status" in ('needs_review', 'reviewing');
  select count(*) into v_critical_high from public."safety_reports" where "severity" in ('critical', 'high') and "status" not in ('actioned', 'dismissed');
  select count(*) into v_actioned_today
  from public."safety_reports"
  where "status" in ('actioned', 'dismissed', 'escalated')
    and coalesce("resolved_at", "actioned_at", "escalated_at", "updated_at") >= date_trunc('day', now());

  select coalesce(jsonb_agg(distinct coalesce("context"->>'sourceSurface', 'unknown')), '[]'::jsonb)
    into v_sources
  from public."safety_reports";

  return jsonb_build_object(
    'connected', true,
    'generatedAt', timezone('utc'::text, now()),
    'totalReports', v_total,
    'needsReviewCount', v_needs_review,
    'criticalHighRiskCount', v_critical_high,
    'actionedTodayCount', v_actioned_today,
    'queueHealth', 'connected',
    'sourceSurfaces', v_sources
  );
end;
$$;

create or replace function public."list_admin_reports"(
  p_filter text default 'needs_review',
  p_severity text default null,
  p_status text default null,
  p_target_type text default null,
  p_cursor timestamptz default null,
  p_limit integer default 25
)
returns setof public."safety_reports"
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_filter text := lower(trim(coalesce(p_filter, 'needs_review')));
  v_limit integer := greatest(1, least(50, coalesce(p_limit, 25)));
begin
  perform public."admin_reports_assert_reviewer"();

  return query
  select report.*
  from public."safety_reports" report
  where (p_cursor is null or report."created_at" < p_cursor)
    and (p_severity is null or report."severity" = lower(trim(p_severity)))
    and (p_status is null or report."status" = lower(trim(p_status)))
    and (p_target_type is null or report."target_type" = lower(trim(p_target_type)))
    and (
      v_filter = 'all'
      or (v_filter = 'needs_review' and report."status" in ('needs_review', 'reviewing'))
      or (v_filter = 'critical' and report."severity" in ('critical', 'high') and report."status" not in ('actioned', 'dismissed'))
      or (v_filter = 'creator_video' and report."target_type" in ('creator_video', 'creator_video_comment'))
      or (v_filter = 'profile_post' and report."target_type" in ('profile_post', 'profile_post_comment'))
      or (v_filter = 'player' and coalesce(report."context"->>'sourceSurface', '') = 'player')
      or (v_filter = 'actioned' and report."status" in ('actioned', 'dismissed', 'escalated'))
    )
  order by report."created_at" desc
  limit v_limit;
end;
$$;

create or replace function public."get_admin_report_detail"(p_report_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_report public."safety_reports";
begin
  perform public."admin_reports_assert_reviewer"();

  select * into v_report
  from public."safety_reports"
  where "id" = p_report_id;

  if v_report."id" is null then
    raise exception 'admin_report_not_found';
  end if;

  return jsonb_build_object(
    'report', to_jsonb(v_report),
    'targetState', public."admin_reports_target_state"(v_report."target_type", v_report."target_id")
  );
end;
$$;

create or replace function public."update_admin_report_status"(
  p_report_id bigint,
  p_status_action text,
  p_reason text
)
returns public."safety_reports"
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := lower(trim(coalesce(p_status_action, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_actor uuid := auth.uid();
  v_old public."safety_reports";
  v_new public."safety_reports";
  v_new_status text;
  v_resolution text;
  v_now timestamptz := timezone('utc'::text, now());
begin
  perform public."admin_reports_assert_reviewer"();

  if v_actor is null then
    raise exception 'admin_reports_auth_required';
  end if;
  if v_reason is null then
    raise exception 'admin_report_reason_required';
  end if;

  select * into v_old
  from public."safety_reports"
  where "id" = p_report_id
  for update;

  if v_old."id" is null then
    raise exception 'admin_report_not_found';
  end if;

  if v_old."status" in ('actioned', 'dismissed') then
    raise exception 'admin_report_closed_state';
  end if;

  if v_action in ('mark_reviewed', 'marked_reviewed', 'reviewed') then
    if v_old."status" not in ('needs_review', 'reviewing', 'escalated') then
      raise exception 'admin_report_invalid_transition';
    end if;
    v_new_status := 'actioned';
    v_resolution := 'marked_reviewed';
  elsif v_action in ('dismiss', 'dismissed', 'no_action_needed') then
    if v_old."status" not in ('needs_review', 'reviewing', 'escalated') then
      raise exception 'admin_report_invalid_transition';
    end if;
    v_new_status := 'dismissed';
    v_resolution := case when v_action = 'no_action_needed' then 'no_action_needed' else 'dismissed' end;
  elsif v_action in ('escalate', 'escalated') then
    if v_old."status" not in ('needs_review', 'reviewing') then
      raise exception 'admin_report_invalid_transition';
    end if;
    v_new_status := 'escalated';
    v_resolution := 'escalated';
  elsif v_action in ('start_review', 'reviewing') then
    if v_old."status" <> 'needs_review' then
      raise exception 'admin_report_invalid_transition';
    end if;
    v_new_status := 'reviewing';
    v_resolution := null;
  else
    raise exception 'admin_report_status_action_invalid';
  end if;

  update public."safety_reports"
  set
    "status" = v_new_status,
    "resolution_type" = v_resolution,
    "resolution_reason" = v_reason,
    "resolved_by" = case when v_new_status in ('actioned', 'dismissed') then v_actor else "resolved_by" end,
    "resolved_at" = case when v_new_status in ('actioned', 'dismissed') then v_now else "resolved_at" end,
    "escalated_at" = case when v_new_status = 'escalated' then v_now else "escalated_at" end,
    "actioned_at" = case when v_new_status in ('actioned', 'dismissed', 'escalated') then v_now else "actioned_at" end,
    "updated_at" = v_now
  where "id" = p_report_id
  returning * into v_new;

  perform public."admin_reports_write_audit"(
    p_report_id,
    v_new."target_type",
    v_new."target_id",
    coalesce(v_resolution, v_new_status),
    v_reason,
    v_old."status",
    v_new."status",
    v_old."severity",
    v_new."severity",
    to_jsonb(v_old),
    to_jsonb(v_new),
    jsonb_build_object('status_action', v_action)
  );

  return v_new;
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
    v_resolution := 'target_hidden';
  elsif v_action in ('remove_from_public', 'removed', 'remove') then
    v_next_status := 'removed';
    v_resolution := 'target_removed';
  elsif v_action in ('restore_clean', 'clean', 'restore') then
    v_next_status := 'clean';
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
    jsonb_build_object('target_action', v_action, 'moderation_status', v_next_status)
  );

  return v_new_report;
end;
$$;

create or replace function public."list_admin_report_audit_events"(p_report_id bigint)
returns setof public."platform_admin_audit_logs"
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_report public."safety_reports";
begin
  perform public."admin_reports_assert_reviewer"();

  select * into v_report from public."safety_reports" where "id" = p_report_id;
  if v_report."id" is null then
    raise exception 'admin_report_not_found';
  end if;

  return query
  select audit.*
  from public."platform_admin_audit_logs" audit
  where audit."metadata"->>'report_id' = p_report_id::text
    or (
      audit."target_type" = v_report."target_type"
      and audit."target_id" = v_report."target_id"
      and audit."action_category" = 'moderation'
    )
  order by audit."created_at" desc
  limit 25;
end;
$$;

revoke all on function public."admin_reports_actor_can_review"() from public;
revoke all on function public."admin_reports_actor_can_target_action"() from public;
revoke all on function public."admin_reports_assert_reviewer"() from public;
revoke all on function public."admin_reports_assert_target_operator"() from public;
revoke all on function public."admin_reports_safe_uuid"(text) from public;
revoke all on function public."admin_reports_target_state"(text, text) from public;
revoke all on function public."admin_reports_write_audit"(bigint, text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb) from public;

grant execute on function public."get_admin_reports_overview"() to authenticated;
grant execute on function public."list_admin_reports"(text, text, text, text, timestamptz, integer) to authenticated;
grant execute on function public."get_admin_report_detail"(bigint) to authenticated;
grant execute on function public."update_admin_report_status"(bigint, text, text) to authenticated;
grant execute on function public."apply_admin_report_target_action"(bigint, text, text, text, text) to authenticated;
grant execute on function public."list_admin_report_audit_events"(bigint) to authenticated;

comment on column public."safety_reports"."severity" is
  'Backed report severity. Unknown stays unknown unless the report source/reason supports conservative classification.';
comment on column public."safety_reports"."status" is
  'Backed Reports Triage workflow status.';
comment on function public."apply_admin_report_target_action"(bigint, text, text, text, text) is
  'Applies non-destructive public visibility moderation for supported report targets and writes immutable moderation audit.';
