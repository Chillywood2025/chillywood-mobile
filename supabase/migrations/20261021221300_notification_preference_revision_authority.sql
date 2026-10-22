begin;

-- Existing preferences are the revision-zero baseline, not a new user intent.
alter table public.notification_preferences
  add column revision bigint not null default 0 check (revision >= 0),
  add column incarnation uuid not null default gen_random_uuid();

create table private.notification_preference_operation_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  request_payload jsonb not null,
  result_payload jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (actor_user_id, operation_id)
);
alter table private.notification_preference_operation_receipts enable row level security;
alter table private.notification_preference_operation_receipts force row level security;
revoke all on private.notification_preference_operation_receipts
  from public, anon, authenticated, service_role;

-- All ordinary SQL writers, including trusted service writers, advance the
-- server-owned revision. A supplied revision can never suppress that advance.
create function private.advance_notification_preference_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 0;
    new.incarnation := gen_random_uuid();
  else
    if new.user_id is distinct from old.user_id then
      raise exception 'notification_preference_subject_immutable' using errcode = '22023';
    end if;
    if old.revision = 9223372036854775807 then
      raise exception 'notification_preference_revision_exhausted' using errcode = '22003';
    end if;
    new.revision := old.revision + 1;
    new.incarnation := old.incarnation;
  end if;
  return new;
end $$;
revoke all on function private.advance_notification_preference_revision()
  from public, anon, authenticated, service_role;
create trigger notification_preferences_server_revision
  before insert or update on public.notification_preferences
  for each row execute function private.advance_notification_preference_revision();

create function private.assert_notification_preference_session() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(public.whole_app_exact_current_session_authority_internal(), false)
    or not exists (
      select 1 from auth.sessions s
      where s.id::text = auth.jwt()->>'session_id' and s.user_id = auth.uid()
        and (s.not_after is null or s.not_after > clock_timestamp())
    ) then
    raise exception 'notification_preference_current_session_required' using errcode = '42501';
  end if;
  -- A retained snapshot cannot recheck authority revoked during a lock wait.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'notification_preference_requires_read_committed' using errcode = '25000';
  end if;
end $$;
revoke all on function private.assert_notification_preference_session()
  from public, anon, authenticated, service_role;

create function public.read_my_notification_preferences() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); preferences public.notification_preferences;
begin
  perform private.assert_notification_preference_session();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'notification-preference-user:' || actor::text, 0));
  perform private.assert_notification_preference_session();
  -- Never replace an existing row with client/manufactured defaults.
  insert into public.notification_preferences(user_id) values(actor)
    on conflict(user_id) do nothing;
  select p.* into strict preferences from public.notification_preferences p
    where p.user_id = actor for update;
  perform private.assert_notification_preference_session();
  return jsonb_build_object('incarnation', preferences.incarnation::text, 'revision', preferences.revision::text,
    'preferences', to_jsonb(preferences) || jsonb_build_object('revision', preferences.revision::text));
end $$;

create function public.mutate_my_notification_preferences(
  p_operation_id uuid, p_expected_incarnation uuid, p_expected_revision text, p_patch jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); expected bigint; preferences public.notification_preferences;
  next_preferences public.notification_preferences; prior_request jsonb; prior_result jsonb;
  request jsonb; result jsonb; outcome text;
begin
  perform private.assert_notification_preference_session();
  if p_operation_id is null or p_expected_incarnation is null or p_expected_revision is null
    or p_expected_revision !~ '^(0|[1-9][0-9]{0,18})$' then
    raise exception 'notification_preference_request_invalid' using errcode = '22023';
  end if;
  if p_expected_revision::numeric > 9223372036854775807 then
    raise exception 'notification_preference_revision_invalid' using errcode = '22023';
  end if;
  expected := p_expected_revision::bigint;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or pg_column_size(p_patch) > 8192 then
    raise exception 'notification_preference_patch_invalid' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_patch) entry where
    case
      when entry.key in (
        'followed_creator_live_enabled','circle_friend_live_enabled','event_starts_soon_enabled',
        'public_upload_enabled','replay_later_enabled','push_enabled','in_app_enabled',
        'chilly_chat_calls_enabled','chilly_chat_call_vibrate_enabled',
        'creator_money_purchases_enabled','creator_money_sales_enabled',
        'social_activity_enabled','circle_activity_enabled','messages_enabled','view_summary_enabled',
        'view_summary_push_enabled','event_updates_enabled','seat_activity_enabled','account_activity_enabled'
      ) then jsonb_typeof(entry.value) <> 'boolean'
      when entry.key = 'chilly_chat_call_sound_key' then
        jsonb_typeof(entry.value) <> 'string' or entry.value #>> '{}' not in (
          'chilly_ring','skyline_pulse','theater_bell','velvet_knock','quiet_buzz','classic_phone','silent_vibrate')
      when entry.key = 'chilly_chat_call_custom_in_app_sound_uri' then
        jsonb_typeof(entry.value) not in ('string','null')
        or length(entry.value #>> '{}') > 2048
      else true
    end) then
    raise exception 'notification_preference_patch_invalid' using errcode = '22023';
  end if;
  request := jsonb_build_object('expectedIncarnation', p_expected_incarnation::text,
    'expectedRevision', p_expected_revision, 'patch', p_patch);
  -- Consistent operation-before-user lock order prevents duplicate intents
  -- from applying twice, including a lost acknowledgment and concurrent retry.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'notification-preference-operation:' || actor::text || ':' || p_operation_id::text, 0));
  perform private.assert_notification_preference_session();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'notification-preference-user:' || actor::text, 0));
  perform private.assert_notification_preference_session();
  insert into public.notification_preferences(user_id) values(actor)
    on conflict(user_id) do nothing;
  select p.* into strict preferences from public.notification_preferences p
    where p.user_id = actor for update;
  -- Direct service updates take the row lock, not necessarily our advisory lock.
  perform private.assert_notification_preference_session();
  select r.request_payload, r.result_payload into prior_request, prior_result
    from private.notification_preference_operation_receipts r
    where r.actor_user_id = actor and r.operation_id = p_operation_id;
  if found then
    if prior_request is distinct from request then
      raise exception 'notification_preference_operation_key_conflict' using errcode = '22023';
    end if;
    if prior_result->>'incarnation' = preferences.incarnation::text
      and prior_result->>'revision' = preferences.revision::text then
      return prior_result;
    end if;
    -- A lost-ack retry must not restore stale state to a client after a newer
    -- intent, service update, or trusted delete/truncate and recreation.
    return jsonb_build_object('status', 'conflict', 'operationId', p_operation_id::text,
      'expectedIncarnation', p_expected_incarnation::text, 'expectedRevision', p_expected_revision,
      'incarnation', preferences.incarnation::text, 'revision', preferences.revision::text,
      'preferences', to_jsonb(preferences) || jsonb_build_object('revision', preferences.revision::text));
  end if;
  if expected <> preferences.revision or p_expected_incarnation <> preferences.incarnation then
    outcome := 'conflict';
  else
    next_preferences := jsonb_populate_record(preferences, p_patch);
    update public.notification_preferences p set
      followed_creator_live_enabled = next_preferences.followed_creator_live_enabled,
      circle_friend_live_enabled = next_preferences.circle_friend_live_enabled,
      event_starts_soon_enabled = next_preferences.event_starts_soon_enabled,
      public_upload_enabled = next_preferences.public_upload_enabled,
      replay_later_enabled = next_preferences.replay_later_enabled,
      push_enabled = next_preferences.push_enabled,
      in_app_enabled = next_preferences.in_app_enabled,
      chilly_chat_calls_enabled = next_preferences.chilly_chat_calls_enabled,
      chilly_chat_call_vibrate_enabled = next_preferences.chilly_chat_call_vibrate_enabled,
      chilly_chat_call_sound_key = next_preferences.chilly_chat_call_sound_key,
      chilly_chat_call_custom_in_app_sound_uri = next_preferences.chilly_chat_call_custom_in_app_sound_uri,
      creator_money_purchases_enabled = next_preferences.creator_money_purchases_enabled,
      creator_money_sales_enabled = next_preferences.creator_money_sales_enabled,
      social_activity_enabled = next_preferences.social_activity_enabled,
      circle_activity_enabled = next_preferences.circle_activity_enabled,
      messages_enabled = next_preferences.messages_enabled,
      view_summary_enabled = next_preferences.view_summary_enabled,
      view_summary_push_enabled = next_preferences.view_summary_push_enabled,
      event_updates_enabled = next_preferences.event_updates_enabled,
      seat_activity_enabled = next_preferences.seat_activity_enabled,
      account_activity_enabled = next_preferences.account_activity_enabled
    where p.user_id = actor returning p.* into strict preferences;
    outcome := 'applied';
  end if;
  result := jsonb_build_object('status', outcome, 'operationId', p_operation_id::text,
    'expectedIncarnation', p_expected_incarnation::text, 'expectedRevision', p_expected_revision,
    'incarnation', preferences.incarnation::text, 'revision', preferences.revision::text,
    'preferences', to_jsonb(preferences) || jsonb_build_object('revision', preferences.revision::text));
  insert into private.notification_preference_operation_receipts(
    actor_user_id,operation_id,request_payload,result_payload)
    values(actor,p_operation_id,request,result);
  perform private.assert_notification_preference_session();
  return result;
end $$;

revoke all on function public.read_my_notification_preferences(),
  public.mutate_my_notification_preferences(uuid,uuid,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.read_my_notification_preferences(),
  public.mutate_my_notification_preferences(uuid,uuid,text,jsonb) to authenticated;

-- Cutover: older clients cannot safely write without their captured revision.
-- Existing own-row SELECT policies and privileges are deliberately unchanged.
revoke insert, update, delete, truncate, references, trigger
  on public.notification_preferences from public, anon, authenticated;
-- A table-level REVOKE does not remove prior per-column grants. Close both
-- paths without touching service-role privileges or the own-row read policy.
do $$
declare columns_sql text;
begin
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into columns_sql
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.notification_preferences'::regclass
    and a.attnum > 0 and not a.attisdropped;
  execute format('revoke insert (%s), update (%s) on public.notification_preferences from public, anon, authenticated',
    columns_sql, columns_sql);
end $$;
-- Service maintenance privileges remain unchanged. A fresh server-owned
-- incarnation fences stale clients even across DELETE/TRUNCATE + recreation.

commit;
