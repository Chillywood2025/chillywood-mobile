create or replace function public.get_or_create_direct_chat_thread(
  p_target_user_id text,
  p_target_display_name text default null,
  p_target_avatar_url text default null,
  p_target_tagline text default null
)
returns table(thread_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id text := auth.uid()::text;
  normalized_target_user_id text := nullif(btrim(coalesce(p_target_user_id, '')), '');
  v_participant_pair_key text;
  resolved_thread_id uuid;
  current_profile public."user_profiles"%rowtype;
  target_profile public."user_profiles"%rowtype;
begin
  if actor_user_id is null then
    raise exception using errcode = '28000', message = 'sign_in_required';
  end if;

  if normalized_target_user_id is null then
    raise exception using errcode = '23514', message = 'target_required';
  end if;

  if normalized_target_user_id = actor_user_id then
    raise exception using errcode = '23514', message = 'self_chat_unavailable';
  end if;

  perform public."assert_account_private_feature_allowed"(actor_user_id, 'chat_direct_thread_open');
  perform public."assert_account_private_feature_allowed"(normalized_target_user_id, 'chat_direct_thread_target');

  if public."has_channel_audience_block_between"(actor_user_id, normalized_target_user_id) then
    raise exception using errcode = '42501', message = 'blocked_relationship';
  end if;

  if public.is_platform_owner_user(normalized_target_user_id) and not public.is_current_platform_owner() then
    raise exception using errcode = '42501', message = 'owner_chat_unavailable';
  end if;

  select *
  into current_profile
  from public."user_profiles"
  where "user_id" = actor_user_id;

  select *
  into target_profile
  from public."user_profiles"
  where "user_id" = normalized_target_user_id;

  if target_profile."user_id" is null then
    raise exception using errcode = '42501', message = 'target_unavailable';
  end if;

  select array_to_string(array_agg(participant_id order by participant_id), '::')
  into v_participant_pair_key
  from unnest(array[actor_user_id, normalized_target_user_id]) as participant_id;

  select thread."id"
  into resolved_thread_id
  from public."chat_threads" thread
  where thread."participant_pair_key" = v_participant_pair_key
  limit 1;

  if resolved_thread_id is null then
    insert into public."chat_threads" ("thread_kind", "participant_pair_key", "created_by")
    values ('direct', v_participant_pair_key, actor_user_id)
    returning "id" into resolved_thread_id;
  elsif public.chat_thread_has_platform_owner(resolved_thread_id) and not public.is_current_platform_owner() then
    raise exception using errcode = '42501', message = 'owner_chat_unavailable';
  end if;

  insert into public."chat_thread_members" (
    "thread_id",
    "user_id",
    "display_name",
    "avatar_url",
    "tagline"
  )
  values
    (
      resolved_thread_id,
      actor_user_id,
      coalesce(nullif(current_profile."display_name", ''), nullif(current_profile."username", ''), 'You'),
      nullif(current_profile."avatar_url", ''),
      nullif(current_profile."tagline", '')
    ),
    (
      resolved_thread_id,
      normalized_target_user_id,
      coalesce(
        nullif(target_profile."display_name", ''),
        nullif(target_profile."username", ''),
        nullif(btrim(coalesce(p_target_display_name, '')), ''),
        'Member'
      ),
      coalesce(nullif(target_profile."avatar_url", ''), nullif(btrim(coalesce(p_target_avatar_url, '')), '')),
      coalesce(nullif(target_profile."tagline", ''), nullif(btrim(coalesce(p_target_tagline, '')), ''))
    )
  on conflict ("thread_id", "user_id") do update
    set "display_name" = excluded."display_name",
        "avatar_url" = excluded."avatar_url",
        "tagline" = excluded."tagline";

  return query select resolved_thread_id;
end;
$$;

revoke all on function public.get_or_create_direct_chat_thread(text, text, text, text) from public;
revoke all on function public.get_or_create_direct_chat_thread(text, text, text, text) from anon;
revoke all on function public.get_or_create_direct_chat_thread(text, text, text, text) from service_role;
grant execute on function public.get_or_create_direct_chat_thread(text, text, text, text) to authenticated;

comment on function public.get_or_create_direct_chat_thread(text, text, text, text) is
  'Authenticated direct Chi''lly Chat open/create repair. It only operates on the caller and requested target pair, avoids ambiguous pair-key resolution, denies account-restricted, unavailable, blocked, and unauthorized targets before thread creation, preserves platform-owner chat restrictions, repairs missing direct-thread memberships, and returns only the thread id for normal RLS readback.';
