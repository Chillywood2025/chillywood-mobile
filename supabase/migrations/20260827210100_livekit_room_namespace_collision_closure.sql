-- communication_rooms and watch_party_rooms both project their primary ID into
-- the same LiveKit room-name namespace. A shared unique reservation table is
-- required here: a trigger that only checks the neighboring table remains
-- vulnerable when two INSERT statements begin with the same MVCC snapshot.

begin;

create table public."livekit_room_namespace_reservations" (
  "room_name" text primary key,
  "room_kind" text not null check ("room_kind" in ('communication','watch_party')),
  "room_id" text not null,
  "created_at" timestamptz not null default timezone('utc'::text,now()),
  unique ("room_kind","room_id"),
  check ("room_name"=pg_catalog.upper(pg_catalog.btrim("room_name")) and "room_name"<>'')
);

alter table public."livekit_room_namespace_reservations" enable row level security;
revoke all on table public."livekit_room_namespace_reservations"
  from public,anon,authenticated,service_role;

-- Hold both source authorities stable until their existing rows are reserved
-- and their triggers are installed. Otherwise an INSERT committed between the
-- backfill and trigger creation could escape the shared namespace registry.
lock table public."communication_rooms", public."watch_party_rooms"
  in share row exclusive mode;

do $$
begin
  if exists (
    select 1
    from (
      select
        pg_catalog.upper(pg_catalog.btrim(room."room_id")) room_name,
        'communication'::text room_kind
      from public."communication_rooms" room
      union all
      select
        pg_catalog.upper(pg_catalog.btrim(room."party_id")) room_name,
        'watch_party'::text room_kind
      from public."watch_party_rooms" room
    ) names
    group by names.room_name
    having count(distinct names.room_kind)>1
  ) then
    raise exception 'existing_livekit_room_namespace_collision';
  end if;
end;
$$;

insert into public."livekit_room_namespace_reservations"(
  "room_name","room_kind","room_id"
)
select distinct on (existing_room."room_name")
  existing_room."room_name",
  existing_room."room_kind",
  existing_room."room_id"
from (
  select
    pg_catalog.upper(pg_catalog.btrim(room."room_id")) "room_name",
    'communication'::text "room_kind",
    room."room_id"
  from public."communication_rooms" room
  union all
  select
    pg_catalog.upper(pg_catalog.btrim(room."party_id")) "room_name",
    'watch_party'::text "room_kind",
    room."party_id"
  from public."watch_party_rooms" room
) existing_room
order by
  existing_room."room_name",
  case when existing_room."room_id"=existing_room."room_name" then 0 else 1 end,
  existing_room."room_id";

create or replace function public."reserve_livekit_room_namespace"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_kind text:=case tg_table_name
    when 'communication_rooms' then 'communication'
    when 'watch_party_rooms' then 'watch_party'
    else null
  end;
  v_room_id text:=case tg_table_name
    when 'communication_rooms' then pg_catalog.to_jsonb(new)->>'room_id'
    when 'watch_party_rooms' then pg_catalog.to_jsonb(new)->>'party_id'
    else null
  end;
  v_room_name text:=pg_catalog.upper(pg_catalog.btrim(coalesce(v_room_id,'')));
  v_old_room_id text;
  v_old_room_name text;
  v_replacement_room_id text;
begin
  if v_room_kind is null or v_room_name='' then
    raise exception 'livekit_room_namespace_invalid';
  end if;

  if tg_op='UPDATE' then
    v_old_room_id:=case tg_table_name
      when 'communication_rooms' then pg_catalog.to_jsonb(old)->>'room_id'
      when 'watch_party_rooms' then pg_catalog.to_jsonb(old)->>'party_id'
      else null
    end;
    v_old_room_name:=pg_catalog.upper(pg_catalog.btrim(coalesce(v_old_room_id,'')));

    if v_room_name=v_old_room_name then
      update public."livekit_room_namespace_reservations" reservation
      set "room_id"=v_room_id
      where reservation."room_name"=v_old_room_name
        and reservation."room_kind"=v_room_kind
        and reservation."room_id"=v_old_room_id;
      if not found then
        perform 1
        from public."livekit_room_namespace_reservations" reservation
        where reservation."room_name"=v_old_room_name
          and reservation."room_kind"=v_room_kind
        for update;
        if not found then
          raise exception 'livekit_room_namespace_reservation_missing';
        end if;
      end if;
      return new;
    end if;
  end if;

  begin
    insert into public."livekit_room_namespace_reservations"(
      "room_name","room_kind","room_id"
    ) values (v_room_name,v_room_kind,v_room_id);
  exception when unique_violation then
    raise exception 'livekit_room_namespace_collision';
  end;

  if tg_op='UPDATE' then
    perform 1
    from public."livekit_room_namespace_reservations" reservation
    where reservation."room_name"=v_old_room_name
      and reservation."room_kind"=v_room_kind
    for update;
    if not found then
      raise exception 'livekit_room_namespace_reservation_missing';
    end if;

    if v_room_kind='communication' then
      select room."room_id"
      into v_replacement_room_id
      from public."communication_rooms" room
      where room."room_id"<>v_old_room_id
        and pg_catalog.upper(pg_catalog.btrim(room."room_id"))=v_old_room_name
      order by
        case when room."room_id"=v_old_room_name then 0 else 1 end,
        room."room_id"
      limit 1;
    else
      select room."party_id"
      into v_replacement_room_id
      from public."watch_party_rooms" room
      where room."party_id"<>v_old_room_id
        and pg_catalog.upper(pg_catalog.btrim(room."party_id"))=v_old_room_name
      order by
        case when room."party_id"=v_old_room_name then 0 else 1 end,
        room."party_id"
      limit 1;
    end if;

    if v_replacement_room_id is null then
      delete from public."livekit_room_namespace_reservations" reservation
      where reservation."room_name"=v_old_room_name
        and reservation."room_kind"=v_room_kind;
    else
      update public."livekit_room_namespace_reservations" reservation
      set "room_id"=v_replacement_room_id
      where reservation."room_name"=v_old_room_name
        and reservation."room_kind"=v_room_kind;
    end if;
    if not found then
      raise exception 'livekit_room_namespace_reservation_missing';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public."release_livekit_room_namespace"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_kind text:=case tg_table_name
    when 'communication_rooms' then 'communication'
    when 'watch_party_rooms' then 'watch_party'
    else null
  end;
  v_room_id text:=case tg_table_name
    when 'communication_rooms' then pg_catalog.to_jsonb(old)->>'room_id'
    when 'watch_party_rooms' then pg_catalog.to_jsonb(old)->>'party_id'
    else null
  end;
  v_room_name text:=pg_catalog.upper(pg_catalog.btrim(coalesce(v_room_id,'')));
  v_replacement_room_id text;
begin
  perform 1
  from public."livekit_room_namespace_reservations" reservation
  where reservation."room_name"=v_room_name
    and reservation."room_kind"=v_room_kind
  for update;
  if not found then
    raise exception 'livekit_room_namespace_reservation_missing';
  end if;

  if v_room_kind='communication' then
    select room."room_id"
    into v_replacement_room_id
    from public."communication_rooms" room
    where pg_catalog.upper(pg_catalog.btrim(room."room_id"))=v_room_name
    order by
      case when room."room_id"=v_room_name then 0 else 1 end,
      room."room_id"
    limit 1;
  elsif v_room_kind='watch_party' then
    select room."party_id"
    into v_replacement_room_id
    from public."watch_party_rooms" room
    where pg_catalog.upper(pg_catalog.btrim(room."party_id"))=v_room_name
    order by
      case when room."party_id"=v_room_name then 0 else 1 end,
      room."party_id"
    limit 1;
  end if;

  if v_replacement_room_id is null then
    delete from public."livekit_room_namespace_reservations" reservation
    where reservation."room_name"=v_room_name
      and reservation."room_kind"=v_room_kind;
  else
    update public."livekit_room_namespace_reservations" reservation
    set "room_id"=v_replacement_room_id
    where reservation."room_name"=v_room_name
      and reservation."room_kind"=v_room_kind;
  end if;
  if not found then
    raise exception 'livekit_room_namespace_reservation_missing';
  end if;
  return old;
end;
$$;

drop trigger if exists "enforce_livekit_room_namespace_unique_trigger"
  on public."communication_rooms";
create trigger "enforce_livekit_room_namespace_unique_trigger"
  before insert or update of "room_id"
  on public."communication_rooms"
  for each row execute function public."reserve_livekit_room_namespace"();

drop trigger if exists "release_livekit_room_namespace_trigger"
  on public."communication_rooms";
create trigger "release_livekit_room_namespace_trigger"
  after delete on public."communication_rooms"
  for each row execute function public."release_livekit_room_namespace"();

drop trigger if exists "enforce_livekit_room_namespace_unique_trigger"
  on public."watch_party_rooms";
create trigger "enforce_livekit_room_namespace_unique_trigger"
  before insert or update of "party_id"
  on public."watch_party_rooms"
  for each row execute function public."reserve_livekit_room_namespace"();

drop trigger if exists "release_livekit_room_namespace_trigger"
  on public."watch_party_rooms";
create trigger "release_livekit_room_namespace_trigger"
  after delete on public."watch_party_rooms"
  for each row execute function public."release_livekit_room_namespace"();

revoke all on function public."reserve_livekit_room_namespace"(),
  public."release_livekit_room_namespace"()
  from public,anon,authenticated,service_role;

comment on table public."livekit_room_namespace_reservations" is
  'Internal unique-key authority for the shared ordinary-Live and Watch-Party LiveKit room namespace. A pre-migration same-authority casing alias shares one canonical reservation; new aliases remain denied.';
comment on function public."reserve_livekit_room_namespace"() is
  'Atomically reserves a normalized LiveKit room name through a unique index; concurrent cross-table claims cannot share a stale MVCC snapshot.';
comment on function public."release_livekit_room_namespace"() is
  'Releases the exact internal LiveKit namespace reservation after its owning room is deleted.';

commit;
