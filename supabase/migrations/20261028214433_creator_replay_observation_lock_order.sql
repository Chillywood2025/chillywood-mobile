-- Availability capture holds the event's observation advisory lock. Referencing
-- creator_events directly then took a KEY SHARE lock opposite to policy and
-- lifecycle paths, which already held the event FOR UPDATE before capture.
-- Keep referential integrity through an identity row that those paths do not
-- update. Do not change observation history, its serialization, or API rights.
-- The entire bootstrap is atomic, including in statement-based schema replay.
do $migration$
begin
  -- Drain event readers as well as writers before backfill and the FK swap:
  -- a row-locking reader must not retain an event lock while waiting for DDL.
  lock table public.creator_events in access exclusive mode;

  create table private.creator_event_replay_observation_anchors (
    event_id uuid primary key,
    constraint creator_replay_observation_anchor_event_fk
      foreign key (event_id) references public.creator_events(id)
      on update cascade on delete cascade
  );
  alter table private.creator_event_replay_observation_anchors enable row level security;
  alter table private.creator_event_replay_observation_anchors force row level security;
  revoke all on private.creator_event_replay_observation_anchors
    from public,anon,authenticated,service_role;

  create function private.seed_creator_event_replay_observation_anchor()
  returns trigger language plpgsql security definer set search_path='' as $function$
  begin
    insert into private.creator_event_replay_observation_anchors(event_id)
      values (new.id);
    return new;
  end;
  $function$;
  revoke all on function private.seed_creator_event_replay_observation_anchor()
    from public,anon,authenticated,service_role;

  -- Same-kind triggers run alphabetically: seed before availability capture.
  create trigger creator_event_replay_observation_anchor_after_insert
    after insert on public.creator_events for each row
    execute function private.seed_creator_event_replay_observation_anchor();

  insert into private.creator_event_replay_observation_anchors(event_id)
    select id from public.creator_events;

  -- A cascade into an anchor is rejected when immutable facts reference it.
  -- Events without facts retain their previous key-change/delete behavior.
  alter table private.creator_event_replay_availability_facts
    drop constraint creator_event_replay_availability_facts_event_id_fkey,
    add constraint creator_event_replay_availability_facts_event_id_fkey
      foreign key (event_id)
      references private.creator_event_replay_observation_anchors(event_id)
      on update no action on delete restrict;
end;
$migration$;
