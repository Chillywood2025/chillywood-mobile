create table if not exists public.watch_party_room_messages (
  id uuid primary key default gen_random_uuid(),
  party_id text not null,
  user_id text not null,
  username text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists watch_party_room_messages_party_created_idx
  on public.watch_party_room_messages (party_id, created_at desc);

alter table public.watch_party_room_messages replica identity full;
