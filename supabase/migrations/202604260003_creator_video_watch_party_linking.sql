alter table public."watch_party_rooms"
  add column if not exists "source_type" text,
  add column if not exists "source_id" text;

update public."watch_party_rooms"
set
  "source_type" = 'platform_title',
  "source_id" = coalesce(nullif("source_id", ''), "title_id")
where "room_type" = 'title'
  and nullif("title_id", '') is not null
  and "source_type" is null;

alter table public."watch_party_rooms"
  drop constraint if exists "watch_party_rooms_source_type_check";

alter table public."watch_party_rooms"
  add constraint "watch_party_rooms_source_type_check"
  check ("source_type" is null or "source_type" in ('platform_title', 'creator_video'));

create index if not exists "watch_party_rooms_source_idx"
  on public."watch_party_rooms" using btree ("source_type", "source_id", "updated_at" desc);

create or replace function public.validate_watch_party_room_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_source_type text;
  normalized_source_id text;
begin
  normalized_source_type := nullif(trim(both from coalesce(new."source_type", '')), '');
  normalized_source_id := nullif(trim(both from coalesce(new."source_id", '')), '');

  if normalized_source_type is null and new."room_type" = 'title' and nullif(trim(both from coalesce(new."title_id", '')), '') is not null then
    normalized_source_type := 'platform_title';
    normalized_source_id := coalesce(normalized_source_id, nullif(trim(both from new."title_id"), ''));
  end if;

  if normalized_source_type = 'creator_video' then
    if normalized_source_id is null or normalized_source_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'creator_video_watch_party_source_required';
    end if;

    if not exists (
      select 1
      from public."videos" video
      where video."id" = normalized_source_id::uuid
        and video."visibility" = 'public'
        and video."moderation_status" in ('clean', 'reported')
        and nullif(coalesce(video."storage_path", video."playback_url", ''), '') is not null
    ) then
      raise exception 'creator_video_watch_party_source_unavailable';
    end if;

    new."room_type" := 'title';
    new."title_id" := null;
    new."source_type" := 'creator_video';
    new."source_id" := normalized_source_id;
  elsif normalized_source_type = 'platform_title' then
    if normalized_source_id is null and nullif(trim(both from coalesce(new."title_id", '')), '') is not null then
      normalized_source_id := nullif(trim(both from new."title_id"), '');
    end if;

    if normalized_source_id is not null and nullif(trim(both from coalesce(new."title_id", '')), '') is null then
      new."title_id" := normalized_source_id;
    end if;

    new."source_type" := 'platform_title';
    new."source_id" := normalized_source_id;
  elsif new."room_type" = 'title' then
    raise exception 'watch_party_room_source_required';
  else
    new."source_type" := null;
    new."source_id" := null;
  end if;

  return new;
end;
$$;

drop trigger if exists "validate_watch_party_room_source_trigger" on public."watch_party_rooms";
create trigger "validate_watch_party_room_source_trigger"
  before insert or update of "room_type", "title_id", "source_type", "source_id" on public."watch_party_rooms"
  for each row
  execute function public.validate_watch_party_room_source();
