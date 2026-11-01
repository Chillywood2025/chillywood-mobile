-- Observations only. No schedule, enable switch, qualification or financial release.
create table private.merch_reconciliation_run_observations (
 run_id uuid primary key, started_at timestamptz not null,
 claimed integer not null default 0 check(claimed between 0 and 30),
 completed integer not null default 0 check(completed between 0 and 30),
 incomplete integer not null default 0 check(incomplete between 0 and 30),
 last_completion_at timestamptz,
 check(completed+incomplete<=claimed)
);
alter table private.merch_reconciliation_run_observations enable row level security;
alter table private.merch_reconciliation_run_observations force row level security;
revoke all on private.merch_reconciliation_run_observations from public,anon,authenticated,service_role;

create function private.observe_merch_reconciliation_run() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.run_id is not null then
  insert into private.merch_reconciliation_run_observations(run_id,started_at,claimed)
  values(new.run_id,clock_timestamp(),new.run_claimed)
  on conflict(run_id) do update set claimed=excluded.claimed;
 end if;
 return new;
end $$;
create trigger observe_merch_reconciliation_run after update of run_id,run_claimed
 on private.merch_reconciliation_driver for each row execute function private.observe_merch_reconciliation_run();

create function private.observe_merch_reconciliation_completion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Count the actual first terminal acknowledgement of an exact lease, not
 -- caller-supplied statistics. Replays and stale acknowledgements do not update.
 if old.run_id is not null and old.lease is not null and new.lease is null
  and new.checked_at is distinct from old.checked_at then
  update private.merch_reconciliation_run_observations set
   completed=completed+case when new.last_result='complete' then 1 else 0 end,
   incomplete=incomplete+case when new.last_result='incomplete' then 1 else 0 end,
   last_completion_at=clock_timestamp() where run_id=old.run_id;
 end if;
 return new;
end $$;
create trigger observe_merch_reconciliation_completion after update
 on private.merch_cost_refresh_jobs for each row execute function private.observe_merch_reconciliation_completion();
revoke all on function private.observe_merch_reconciliation_run(),private.observe_merch_reconciliation_completion()
 from public,anon,authenticated,service_role;

create function public.get_owner_merch_reconciliation_health() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c private.merch_reconciliation_driver; h jsonb; t jsonb; metrics jsonb;
 alerts jsonb:='[]'; last_start timestamptz; successes bigint; failures bigint; runs bigint;
begin
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
  or public.has_platform_role(array['owner']) is distinct from true then
  raise exception 'owner_current_session_required';
 end if;
 select * into strict c from private.merch_reconciliation_driver where singleton;
 h:=private.merch_reconciliation_backlog_health();
 select max(started_at),count(*) filter(where started_at>=now()-interval '6 hours'),
  coalesce(sum(completed) filter(where started_at>=now()-interval '6 hours'),0),
  coalesce(sum(incomplete) filter(where started_at>=now()-interval '6 hours'),0)
 into last_start,runs,successes,failures from private.merch_reconciliation_run_observations;
 select jsonb_build_object('assigned',count(*),
  'unqualified',count(*) filter(where not private.merch_tracking_configured(a.creator_id)),
  'overdue12h',count(*) filter(where j.checked_at is null or j.checked_at<now()-interval '12 hours'),
  'reviewRequired',count(*) filter(where j.review_reason is not null)) into t
 from private.merch_tracking_assignments a join private.merch_tracking_jobs j on j.assignment_id=a.id
 where a.id=private.merch_active_tracking_assignment(a.order_id);
 if not c.enabled then alerts:=alerts||'"driver_disabled"'::jsonb;
 elsif last_start is null or last_start<now()-interval '30 minutes' then alerts:=alerts||'"driver_heartbeat_missing"'::jsonb;end if;
 if (h->>'refreshOverdue12h')::bigint>0 then alerts:=alerts||'"cost_refresh_overdue"'::jsonb;end if;
 if failures>0 then alerts:=alerts||'"provider_refresh_failures"'::jsonb;end if;
 if (h->>'eligible')::bigint>0 and runs>=24 and successes<(h->>'eligible')::bigint
 then alerts:=alerts||'"observed_capacity_shortfall"'::jsonb;end if;
 if (t->>'unqualified')::bigint>0 then alerts:=alerts||'"tracking_unqualified"'::jsonb;end if;
 if (t->>'overdue12h')::bigint>0 then alerts:=alerts||'"tracking_refresh_overdue"'::jsonb;end if;
 if (t->>'reviewRequired')::bigint>0 then alerts:=alerts||'"tracking_review_required"'::jsonb;end if;
 metrics:=jsonb_build_object('windowHours',6,'runs',runs,'completed',successes,'incomplete',failures,
  'lastRunAt',last_start,'capacityGuaranteed',false);
 return jsonb_build_object('schemaVersion',1,'observedAt',now(),'environment','sandbox',
  'driverEnabled',c.enabled,'cost',h,'tracking',t,'measured',metrics,'alerts',alerts,
  'financialAuthority',false,'liveActivationAllowed',false);
end $$;
revoke all on function public.get_owner_merch_reconciliation_health() from public,anon,authenticated,service_role;
grant execute on function public.get_owner_merch_reconciliation_health() to authenticated;
