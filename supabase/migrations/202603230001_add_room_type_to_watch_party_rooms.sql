alter table if exists public.watch_party_rooms
  add column if not exists room_type text;

update public.watch_party_rooms
set room_type = 'title'
where room_type is null;

alter table public.watch_party_rooms
  alter column room_type set default 'title';

alter table public.watch_party_rooms
  alter column room_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'watch_party_rooms_room_type_check'
      and conrelid = 'public.watch_party_rooms'::regclass
  ) then
    alter table public.watch_party_rooms
      add constraint watch_party_rooms_room_type_check
      check (room_type in ('title', 'live'));
  end if;
end $$;