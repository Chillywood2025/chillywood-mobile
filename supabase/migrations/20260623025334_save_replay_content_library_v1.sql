-- Creator Save Replay V1.
-- Replays are saved to the creator-owned Content Library first. This table
-- stores durable replay state and safe playback references only; raw HLS URLs,
-- storage paths, room tokens, and LiveKit publish authority stay out of the
-- mobile-readable replay library.

create table if not exists public."creator_replay_library_items" (
  "id" uuid primary key default gen_random_uuid(),
  "owner_user_id" text not null,
  "source_type" text not null,
  "source_room_id" text,
  "party_id" text,
  "broadcast_session_id" uuid,
  "title" text not null,
  "description" text,
  "thumbnail_url" text,
  "duration_seconds" integer,
  "visibility" text not null default 'draft'::text,
  "rights_status" text not null default 'unknown_block_replay'::text,
  "save_status" text not null default 'requested'::text,
  "playback_record_id" uuid,
  "moderation_status" text not null default 'clean'::text,
  "money_status" text not null default 'free'::text,
  "error_code" text,
  "metadata" jsonb not null default '{}'::jsonb,
  "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
  "updated_at" timestamp with time zone not null default timezone('utc'::text, now()),
  constraint "creator_replay_library_items_broadcast_session_fkey"
    foreign key ("broadcast_session_id") references public."room_broadcast_sessions"("id") on delete set null,
  constraint "creator_replay_library_items_playback_record_fkey"
    foreign key ("playback_record_id") references public."spectator_hls_playback_records"("id") on delete set null,
  constraint "creator_replay_library_items_source_type_check"
    check ("source_type" in ('live_stage'::text, 'watch_party_live'::text)),
  constraint "creator_replay_library_items_visibility_check"
    check ("visibility" in ('draft'::text, 'circle'::text, 'public'::text)),
  constraint "creator_replay_library_items_rights_status_check"
    check ("rights_status" in (
      'creator_owned'::text,
      'chillywood_original'::text,
      'licensed_for_public_stream'::text,
      'private_use_only'::text,
      'protected_title_block_replay'::text,
      'unknown_block_replay'::text
    )),
  constraint "creator_replay_library_items_save_status_check"
    check ("save_status" in (
      'recording_not_started'::text,
      'recording_active'::text,
      'recording_stopping'::text,
      'requested'::text,
      'processing_replay'::text,
      'ready'::text,
      'failed'::text,
      'deleted'::text
    )),
  constraint "creator_replay_library_items_moderation_status_check"
    check ("moderation_status" in ('clean'::text, 'reported'::text, 'under_review'::text, 'hidden'::text, 'removed'::text, 'banned'::text, 'blocked'::text)),
  constraint "creator_replay_library_items_money_status_check"
    check ("money_status" in ('free'::text, 'paid'::text, 'paid_unavailable'::text)),
  constraint "creator_replay_library_items_duration_check"
    check ("duration_seconds" is null or "duration_seconds" >= 0),
  constraint "creator_replay_library_items_no_raw_media_metadata_check"
    check (
      coalesce("metadata" ->> 'raw_hls_url', '') = ''
      and coalesce("metadata" ->> 'hls_playback_url', '') = ''
      and coalesce("metadata" ->> 'storage_path', '') = ''
      and coalesce("metadata" ->> 'storage_key', '') = ''
      and coalesce("metadata" ->> 'bucket', '') = ''
      and coalesce("metadata" ->> 'object_key', '') = ''
      and coalesce("metadata" ->> 'livekit_token', '') = ''
      and coalesce("metadata" ->> 'room_token', '') = ''
      and coalesce("metadata" ->> 'publish_authority', '') = ''
    )
);

create unique index if not exists "creator_replay_library_items_broadcast_unique"
  on public."creator_replay_library_items" ("broadcast_session_id")
  where "broadcast_session_id" is not null;

create index if not exists "creator_replay_library_items_owner_status_idx"
  on public."creator_replay_library_items" ("owner_user_id", "save_status", "created_at" desc);

create index if not exists "creator_replay_library_items_visibility_status_idx"
  on public."creator_replay_library_items" ("visibility", "save_status", "created_at" desc);

alter table public."creator_replay_library_items" enable row level security;

create or replace function public."is_creator_replay_viewer_blocked"(
  p_owner_user_id text,
  p_viewer_user_id text default (auth.uid())::text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when nullif(btrim(coalesce(p_owner_user_id, '')), '') is null
      or nullif(btrim(coalesce(p_viewer_user_id, '')), '') is null
      or nullif(btrim(coalesce(p_owner_user_id, '')), '') = nullif(btrim(coalesce(p_viewer_user_id, '')), '')
      then false
    else exists (
      select 1
      from public."channel_audience_blocks" block_row
      where (
        block_row."channel_user_id" = nullif(btrim(coalesce(p_owner_user_id, '')), '')
        and block_row."blocked_user_id" = nullif(btrim(coalesce(p_viewer_user_id, '')), '')
      ) or (
        block_row."channel_user_id" = nullif(btrim(coalesce(p_viewer_user_id, '')), '')
        and block_row."blocked_user_id" = nullif(btrim(coalesce(p_owner_user_id, '')), '')
      )
      limit 1
    )
  end;
$$;

revoke all on function public."is_creator_replay_viewer_blocked"(text, text) from public;
grant execute on function public."is_creator_replay_viewer_blocked"(text, text) to anon, authenticated, postgres, service_role;

create or replace function public."can_read_creator_replay_library_item"(
  p_replay_id uuid,
  p_viewer_user_id text default (auth.uid())::text
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_item public."creator_replay_library_items"%rowtype;
  v_viewer_user_id text := nullif(btrim(coalesce(p_viewer_user_id, '')), '');
begin
  select *
  into v_item
  from public."creator_replay_library_items"
  where "id" = p_replay_id;

  if not found then
    return false;
  end if;

  if v_viewer_user_id is not null and v_viewer_user_id = v_item."owner_user_id" then
    return true;
  end if;

  if v_item."save_status" <> 'ready'
    or v_item."moderation_status" not in ('clean'::text, 'reported'::text)
    or v_item."rights_status" not in ('creator_owned'::text, 'chillywood_original'::text, 'licensed_for_public_stream'::text)
    or v_item."playback_record_id" is null
  then
    return false;
  end if;

  if v_viewer_user_id is null then
    return v_item."visibility" = 'public'::text;
  end if;

  if public."is_creator_replay_viewer_blocked"(v_item."owner_user_id", v_viewer_user_id) then
    return false;
  end if;

  if v_item."visibility" = 'public'::text then
    return true;
  end if;

  if v_item."visibility" = 'circle'::text then
    return public."is_active_chilly_circle_member"(v_item."owner_user_id", v_viewer_user_id);
  end if;

  return false;
end;
$$;

revoke all on function public."can_read_creator_replay_library_item"(uuid, text) from public;
grant execute on function public."can_read_creator_replay_library_item"(uuid, text) to anon, authenticated, postgres, service_role;

drop policy if exists "creator_replay_library_items_select_access_gated"
  on public."creator_replay_library_items";
create policy "creator_replay_library_items_select_access_gated"
  on public."creator_replay_library_items"
  for select
  to anon, authenticated
  using (public."can_read_creator_replay_library_item"("id", (auth.uid())::text));

drop policy if exists "creator_replay_library_items_insert_owner"
  on public."creator_replay_library_items";
create policy "creator_replay_library_items_insert_owner"
  on public."creator_replay_library_items"
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and "owner_user_id" = (auth.uid())::text
    and "visibility" = 'draft'::text
    and "save_status" in ('requested'::text, 'processing_replay'::text, 'recording_active'::text, 'recording_stopping'::text, 'ready'::text, 'failed'::text, 'recording_not_started'::text)
  );

drop policy if exists "creator_replay_library_items_update_owner"
  on public."creator_replay_library_items";
create policy "creator_replay_library_items_update_owner"
  on public."creator_replay_library_items"
  for update
  to authenticated
  using (auth.uid() is not null and "owner_user_id" = (auth.uid())::text)
  with check (auth.uid() is not null and "owner_user_id" = (auth.uid())::text);

drop policy if exists "creator_replay_library_items_delete_owner"
  on public."creator_replay_library_items";
create policy "creator_replay_library_items_delete_owner"
  on public."creator_replay_library_items"
  for delete
  to authenticated
  using (auth.uid() is not null and "owner_user_id" = (auth.uid())::text);

revoke all on table public."creator_replay_library_items" from anon;
revoke all on table public."creator_replay_library_items" from authenticated;
grant select on table public."creator_replay_library_items" to anon;
grant select, insert, update, delete on table public."creator_replay_library_items" to authenticated;
grant all on table public."creator_replay_library_items" to postgres, service_role;

comment on table public."creator_replay_library_items" is
  'Creator-owned replay Content Library. Save Replay writes draft/processing/ready replay state here first; public/Circle reads are RLS-gated and never expose raw HLS or LiveKit tokens.';
comment on column public."creator_replay_library_items"."playback_record_id" is
  'Reference to a controlled spectator playback record. Mobile clients must resolve playback through Edge Functions, not raw HLS.';
comment on function public."can_read_creator_replay_library_item"(uuid, text) is
  'RLS helper for creator replay library rows: owner can manage, public can read ready public safe rows, and active Chi''lly Circle members can read ready Circle rows.';
