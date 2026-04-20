create table public."creator_events" (
    "id" uuid default gen_random_uuid() not null,
    "host_user_id" text not null,
    "event_title" text not null,
    "event_type" text not null,
    "status" text default 'draft'::text not null,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "linked_title_id" uuid,
    "replay_policy" text default 'none'::text not null,
    "replay_available_at" timestamp with time zone,
    "replay_expires_at" timestamp with time zone,
    "reminder_ready" boolean default false not null,
    "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
    "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table only public."creator_events"
  add constraint "creator_events_pkey" PRIMARY KEY (id);

alter table only public."creator_events"
  add constraint "creator_events_host_user_id_fkey" FOREIGN KEY (host_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table only public."creator_events"
  add constraint "creator_events_linked_title_id_fkey" FOREIGN KEY (linked_title_id) REFERENCES public."titles"(id) ON DELETE SET NULL;

alter table only public."creator_events"
  add constraint "creator_events_event_title_check" CHECK (NULLIF(BTRIM(event_title), ''::text) IS NOT NULL);

alter table only public."creator_events"
  add constraint "creator_events_event_type_check" CHECK (event_type = ANY (ARRAY['live_first'::text, 'live_watch_party'::text, 'watch_party_live'::text]));

alter table only public."creator_events"
  add constraint "creator_events_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'live_now'::text, 'ended'::text, 'replay_available'::text, 'expired'::text, 'canceled'::text]));

alter table only public."creator_events"
  add constraint "creator_events_status_requires_start_check" CHECK (status = ANY (ARRAY['draft'::text, 'canceled'::text]) OR starts_at IS NOT NULL);

alter table only public."creator_events"
  add constraint "creator_events_ends_after_start_check" CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at);

alter table only public."creator_events"
  add constraint "creator_events_replay_policy_check" CHECK (replay_policy = ANY (ARRAY['none'::text, 'indefinite'::text, 'until_expiration'::text]));

alter table only public."creator_events"
  add constraint "creator_events_replay_none_fields_check" CHECK (
    replay_policy <> 'none'::text
    OR (replay_available_at IS NULL AND replay_expires_at IS NULL)
  );

alter table only public."creator_events"
  add constraint "creator_events_replay_expiration_required_check" CHECK (
    replay_policy <> 'until_expiration'::text
    OR replay_expires_at IS NOT NULL
  );

alter table only public."creator_events"
  add constraint "creator_events_replay_window_order_check" CHECK (
    replay_expires_at IS NULL
    OR replay_available_at IS NULL
    OR replay_expires_at >= replay_available_at
  );

create index "creator_events_host_starts_idx"
  on public."creator_events" using btree (host_user_id, starts_at desc nulls last);

create index "creator_events_status_starts_idx"
  on public."creator_events" using btree (status, starts_at asc nulls last);

create index "creator_events_event_type_starts_idx"
  on public."creator_events" using btree (event_type, starts_at asc nulls last);

alter table public."creator_events" enable row level security;

create policy "creator_events_host_insert_policy"
  on public."creator_events"
  for insert
  to PUBLIC
  with check (((auth.uid() IS NOT NULL) AND (host_user_id = (auth.uid())::text)));

create policy "creator_events_host_update_policy"
  on public."creator_events"
  for update
  to PUBLIC
  using (((auth.uid() IS NOT NULL) AND (host_user_id = (auth.uid())::text)))
  with check (((auth.uid() IS NOT NULL) AND (host_user_id = (auth.uid())::text)));

create policy "creator_events_host_delete_policy"
  on public."creator_events"
  for delete
  to PUBLIC
  using (((auth.uid() IS NOT NULL) AND (host_user_id = (auth.uid())::text)));

create policy "creator_events_select_policy"
  on public."creator_events"
  for select
  to PUBLIC
  using ((((auth.uid() IS NOT NULL) AND (host_user_id = (auth.uid())::text))) OR (status <> 'draft'::text));

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table public."creator_events" to "anon";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table public."creator_events" to "authenticated";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table public."creator_events" to "postgres";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table public."creator_events" to "service_role";
