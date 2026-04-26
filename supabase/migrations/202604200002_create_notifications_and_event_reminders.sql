create table public."notifications" (
    "id" uuid default gen_random_uuid() not null,
    "user_id" uuid not null,
    "category" text not null,
    "title" text not null,
    "body" text,
    "target_route" text not null,
    "target_entity_id" text,
    "target_context" jsonb default '{}'::jsonb not null,
    "read_at" timestamp with time zone,
    "dismissed_at" timestamp with time zone,
    "created_at" timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table only public."notifications"
  add constraint "notifications_pkey" PRIMARY KEY (id);

alter table only public."notifications"
  add constraint "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table only public."notifications"
  add constraint "notifications_category_check" CHECK (category = ANY (ARRAY[
    'creator_went_live'::text,
    'upcoming_event_reminder'::text,
    'new_message'::text,
    'access_granted'::text,
    'content_dropped'::text,
    'reply_comment'::text,
    'moderation_notice'::text,
    'payment_access_confirmation'::text
  ]));

alter table only public."notifications"
  add constraint "notifications_title_check" CHECK (NULLIF(BTRIM(title), ''::text) IS NOT NULL);

alter table only public."notifications"
  add constraint "notifications_target_route_check" CHECK (NULLIF(BTRIM(target_route), ''::text) IS NOT NULL);

create index "notifications_user_created_idx"
  on public."notifications" using btree (user_id, created_at desc);

create index "notifications_user_unread_idx"
  on public."notifications" using btree (user_id, read_at, dismissed_at, created_at desc);

create index "notifications_category_created_idx"
  on public."notifications" using btree (category, created_at desc);

alter table public."notifications" enable row level security;

create policy "notifications_select_policy"
  on public."notifications"
  for select
  to PUBLIC
  using (((auth.uid() IS NOT NULL) AND (user_id = auth.uid())));

create policy "notifications_update_policy"
  on public."notifications"
  for update
  to PUBLIC
  using (((auth.uid() IS NOT NULL) AND (user_id = auth.uid())))
  with check (((auth.uid() IS NOT NULL) AND (user_id = auth.uid())));

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table public."notifications" to "anon";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table public."notifications" to "authenticated";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table public."notifications" to "postgres";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table public."notifications" to "service_role";

create table public."event_reminders" (
    "id" uuid default gen_random_uuid() not null,
    "event_id" uuid not null,
    "user_id" uuid not null,
    "status" text default 'active'::text not null,
    "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
    "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table only public."event_reminders"
  add constraint "event_reminders_pkey" PRIMARY KEY (id);

alter table only public."event_reminders"
  add constraint "event_reminders_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public."creator_events"(id) ON DELETE CASCADE;

alter table only public."event_reminders"
  add constraint "event_reminders_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table only public."event_reminders"
  add constraint "event_reminders_status_check" CHECK (status = ANY (ARRAY['active'::text, 'canceled'::text]));

alter table only public."event_reminders"
  add constraint "event_reminders_event_user_unique" UNIQUE (event_id, user_id);

create index "event_reminders_user_status_idx"
  on public."event_reminders" using btree (user_id, status, updated_at desc);

create index "event_reminders_event_status_idx"
  on public."event_reminders" using btree (event_id, status, updated_at desc);

alter table public."event_reminders" enable row level security;

create policy "event_reminders_select_policy"
  on public."event_reminders"
  for select
  to PUBLIC
  using (
    ((auth.uid() IS NOT NULL) AND (user_id = auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM public."creator_events"
      WHERE creator_events.id = event_reminders.event_id
        AND creator_events.host_user_id = auth.uid()
    )
  );

create policy "event_reminders_insert_policy"
  on public."event_reminders"
  for insert
  to PUBLIC
  with check (((auth.uid() IS NOT NULL) AND (user_id = auth.uid())));

create policy "event_reminders_update_policy"
  on public."event_reminders"
  for update
  to PUBLIC
  using (((auth.uid() IS NOT NULL) AND (user_id = auth.uid())))
  with check (((auth.uid() IS NOT NULL) AND (user_id = auth.uid())));

grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table public."event_reminders" to "anon";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table public."event_reminders" to "authenticated";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table public."event_reminders" to "postgres";
grant SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table public."event_reminders" to "service_role";
