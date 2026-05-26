create or replace function public."admin_create_official_rachi_post"(
  p_body text,
  p_visibility text default 'public',
  p_reason text default 'Official Rachi update'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  safe_body text := nullif(trim(coalesce(p_body, '')), '');
  safe_visibility text := lower(trim(coalesce(p_visibility, 'public')));
  safe_reason text := nullif(trim(coalesce(p_reason, '')), '');
  created_post public."profile_posts"%rowtype;
  audit_id uuid;
begin
  actor_role := public."admin_content_assert_operator"();

  if safe_body is null then
    raise exception 'rachi_post_body_required';
  end if;

  if char_length(safe_body) > 500 then
    raise exception 'rachi_post_body_too_long';
  end if;

  if safe_visibility not in ('public', 'draft') then
    raise exception 'rachi_post_visibility_invalid';
  end if;

  safe_reason := coalesce(safe_reason, 'Official Rachi update');

  insert into public."profile_posts" (
    "user_id",
    "body",
    "visibility",
    "moderation_status",
    "updated_at"
  )
  values (
    'platform_rachi_official',
    safe_body,
    safe_visibility,
    'clean',
    timezone('utc'::text, now())
  )
  returning * into created_post;

  audit_id := public."admin_content_write_audit"(
    'official_rachi_post_created',
    'profile_post',
    created_post."id"::text,
    safe_reason,
    null,
    to_jsonb(created_post),
    jsonb_build_object(
      'official_account_id', 'platform_rachi_official',
      'rachi_official_account', true,
      'surface', 'admin_rachi_tab',
      'visibility', safe_visibility
    ),
    'platform_rachi_official',
    'notice'
  );

  return jsonb_build_object(
    'id', created_post."id",
    'userId', created_post."user_id",
    'body', created_post."body",
    'visibility', created_post."visibility",
    'moderationStatus', created_post."moderation_status",
    'moderationReason', created_post."moderation_reason",
    'moderatedAt', created_post."moderated_at",
    'moderatedBy', created_post."moderated_by",
    'createdAt', created_post."created_at",
    'updatedAt', created_post."updated_at",
    'auditId', audit_id,
    'actorRole', actor_role
  );
end;
$$;

revoke all on function public."admin_create_official_rachi_post"(text, text, text) from public;
grant execute on function public."admin_create_official_rachi_post"(text, text, text) to authenticated;
