create table if not exists public.communication_rooms (
  room_id text primary key,
  room_code text not null unique,
  host_user_id text not null,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists communication_rooms_status_idx
  on public.communication_rooms (status);

create index if not exists communication_rooms_host_user_id_idx
  on public.communication_rooms (host_user_id);
