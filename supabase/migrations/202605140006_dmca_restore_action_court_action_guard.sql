-- Prevent the content restore action itself from bypassing a court-action block.

create or replace function public."admin_dmca_record_content_action"(
  p_case_id uuid,
  p_content_type text,
  p_content_id text,
  p_action text,
  p_reason text
)
returns public."dmca_content_actions"
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := nullif(auth.uid()::text, '');
  v_target_uuid uuid := public."dmca_safe_uuid"(p_content_id);
  v_previous jsonb;
  v_new jsonb;
  v_row public."dmca_content_actions";
  v_next_status text;
  v_event_type text;
begin
  perform public."dmca_assert_owner_operator"();

  if v_actor is null then
    raise exception 'admin_actor_required';
  end if;
  if p_action not in ('disabled', 'hidden', 'restored', 'rejected_no_action', 'preserved_evidence') then
    raise exception 'invalid_dmca_content_action';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'dmca_action_reason_required';
  end if;

  if p_action = 'restored' and exists (
    select 1
    from public."dmca_counter_notices" counter_notice
    where counter_notice."dmca_case_id" = p_case_id
      and (
        counter_notice."status" = 'blocked_by_court_action'
        or counter_notice."court_action_notice_received_at" is not null
      )
  ) then
    raise exception 'dmca_restore_blocked_by_court_action';
  end if;

  if p_action in ('disabled', 'hidden', 'restored') then
    if v_target_uuid is null then
      raise exception 'dmca_content_uuid_required';
    end if;

    v_next_status := case
      when p_action = 'restored' then 'clean'
      when p_action = 'disabled' then 'removed'
      else 'hidden'
    end;

    case p_content_type
      when 'creator_video' then
        select to_jsonb(row) into v_previous from public."videos" row where row."id" = v_target_uuid;
        update public."videos"
          set "moderation_status" = v_next_status,
              "moderation_reason" = p_reason,
              "moderated_at" = timezone('utc'::text, now()),
              "moderated_by" = v_actor,
              "updated_at" = timezone('utc'::text, now())
          where "id" = v_target_uuid;
        select to_jsonb(row) into v_new from public."videos" row where row."id" = v_target_uuid;
      when 'profile_post' then
        select to_jsonb(row) into v_previous from public."profile_posts" row where row."id" = v_target_uuid;
        update public."profile_posts"
          set "moderation_status" = v_next_status,
              "moderation_reason" = p_reason,
              "moderated_at" = timezone('utc'::text, now()),
              "moderated_by" = v_actor,
              "updated_at" = timezone('utc'::text, now())
          where "id" = v_target_uuid;
        select to_jsonb(row) into v_new from public."profile_posts" row where row."id" = v_target_uuid;
      when 'profile_post_comment' then
        select to_jsonb(row) into v_previous from public."profile_post_comments" row where row."id" = v_target_uuid;
        update public."profile_post_comments"
          set "moderation_status" = v_next_status,
              "moderation_reason" = p_reason,
              "moderated_at" = timezone('utc'::text, now()),
              "moderated_by" = v_actor,
              "updated_at" = timezone('utc'::text, now())
          where "id" = v_target_uuid;
        select to_jsonb(row) into v_new from public."profile_post_comments" row where row."id" = v_target_uuid;
      when 'comment' then
        select to_jsonb(row) into v_previous from public."profile_post_comments" row where row."id" = v_target_uuid;
        update public."profile_post_comments"
          set "moderation_status" = v_next_status,
              "moderation_reason" = p_reason,
              "moderated_at" = timezone('utc'::text, now()),
              "moderated_by" = v_actor,
              "updated_at" = timezone('utc'::text, now())
          where "id" = v_target_uuid;
        select to_jsonb(row) into v_new from public."profile_post_comments" row where row."id" = v_target_uuid;
      when 'creator_video_comment' then
        select to_jsonb(row) into v_previous from public."creator_video_comments" row where row."id" = v_target_uuid;
        update public."creator_video_comments"
          set "moderation_status" = v_next_status,
              "moderation_reason" = p_reason,
              "moderated_at" = timezone('utc'::text, now()),
              "moderated_by" = v_actor,
              "updated_at" = timezone('utc'::text, now())
          where "id" = v_target_uuid;
        select to_jsonb(row) into v_new from public."creator_video_comments" row where row."id" = v_target_uuid;
      when 'reply' then
        select to_jsonb(row) into v_previous from public."creator_video_comments" row where row."id" = v_target_uuid;
        update public."creator_video_comments"
          set "moderation_status" = v_next_status,
              "moderation_reason" = p_reason,
              "moderated_at" = timezone('utc'::text, now()),
              "moderated_by" = v_actor,
              "updated_at" = timezone('utc'::text, now())
          where "id" = v_target_uuid;
        select to_jsonb(row) into v_new from public."creator_video_comments" row where row."id" = v_target_uuid;
      when 'attachment' then
        select to_jsonb(row) into v_previous from public."social_attachments" row where row."id" = v_target_uuid;
        update public."social_attachments"
          set "moderation_status" = v_next_status
          where "id" = v_target_uuid;
        select to_jsonb(row) into v_new from public."social_attachments" row where row."id" = v_target_uuid;
      when 'social_attachment' then
        select to_jsonb(row) into v_previous from public."social_attachments" row where row."id" = v_target_uuid;
        update public."social_attachments"
          set "moderation_status" = v_next_status
          where "id" = v_target_uuid;
        select to_jsonb(row) into v_new from public."social_attachments" row where row."id" = v_target_uuid;
      else
        raise exception 'dmca_content_type_not_supported_for_disable_restore';
    end case;

    if v_previous is null or v_new is null then
      raise exception 'dmca_content_not_found';
    end if;
  end if;

  insert into public."dmca_content_actions" (
    "dmca_case_id",
    "content_type",
    "content_id",
    "action",
    "previous_state",
    "new_state",
    "actor_admin_id",
    "reason"
  ) values (
    p_case_id,
    p_content_type,
    p_content_id,
    p_action,
    v_previous,
    v_new,
    v_actor,
    p_reason
  )
  returning * into v_row;

  if p_action in ('disabled', 'hidden') then
    update public."dmca_cases"
      set "status" = 'content_disabled',
          "updated_at" = timezone('utc'::text, now())
      where "id" = p_case_id;
    v_event_type := 'content_disabled';
  elsif p_action = 'restored' then
    update public."dmca_cases"
      set "status" = 'restored',
          "closed_at" = timezone('utc'::text, now()),
          "updated_at" = timezone('utc'::text, now())
      where "id" = p_case_id;
    v_event_type := 'content_restored';
  else
    v_event_type := 'case_updated';
  end if;

  perform public."dmca_write_audit"(
    p_case_id,
    v_event_type,
    'admin',
    p_reason,
    jsonb_build_object(
      'content_type', p_content_type,
      'content_id', p_content_id,
      'action', p_action
    )
  );

  return v_row;
end;
$$;

grant execute on function public."admin_dmca_record_content_action"(uuid, text, text, text, text) to "authenticated";
