create table private.commerce_fee_accounting_jobs (
 source_type text not null check(source_type in ('physical_merch','event_auction','room_auction')),source_id uuid not null,
 state text not null default 'pending' check(state in ('pending','blocked','retry','completed')),
 revision bigint not null default 1, attempts bigint not null default 0,
 reason text, next_attempt_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 primary key(source_type,source_id)
);
alter table private.commerce_fee_accounting_jobs enable row level security;
alter table private.commerce_fee_accounting_jobs force row level security;
revoke all on private.commerce_fee_accounting_jobs from public,anon,authenticated,service_role;
create function private.queue_commerce_fee_accounting() returns trigger language plpgsql set search_path='' as $$
declare feature text; source uuid;
begin
 if tg_table_name='merch_provider_cost_observations' then feature:='physical_merch';source:=new.order_id;
 elsif tg_table_name='commerce_cost_verification_reads' then feature:=new.source_type;source:=new.source_id;
 elsif tg_table_name='auction_settlement_observations' then
  source:=new.contract_id;select lane||'_auction' into feature from private.auction_platform_settlement_contracts where id=source;
 elsif new.order_id is not null then feature:='physical_merch';source:=new.order_id;
 else source:=new.contract_id;select lane||'_auction' into feature from private.auction_platform_settlement_contracts where id=source;
 end if;
 insert into private.commerce_fee_accounting_jobs(source_type,source_id) values(feature,source)
 on conflict(source_type,source_id) do update set revision=commerce_fee_accounting_jobs.revision+1,
  state='pending',reason=null,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp();
 return new;
end; $$;
revoke all on function private.queue_commerce_fee_accounting() from public,anon,authenticated,service_role;
create trigger fee_accounting_queued after insert on private.merch_provider_cost_observations for each row execute function private.queue_commerce_fee_accounting();
create trigger fee_accounting_queued after insert on private.auction_settlement_observations for each row execute function private.queue_commerce_fee_accounting();
create trigger fee_accounting_queued after insert on private.commerce_fee_report_observations for each row execute function private.queue_commerce_fee_accounting();
create trigger fee_accounting_queued after insert on private.commerce_cost_verification_reads for each row execute function private.queue_commerce_fee_accounting();

create function public.process_commerce_fee_accounting_jobs(p_limit integer default 5,p_source_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='500ms' as $$
declare candidate record; job private.commerce_fee_accounting_jobs; result jsonb; outcomes jsonb:='[]'; message text; job_state text;
 started timestamptz:=clock_timestamp();
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if p_limit is null or p_limit<1 or p_limit>10 then raise exception 'fee_accounting_batch_invalid'; end if;
 -- No recursive/nested drain. Bound both candidate count and local work time.
 for candidate in select source_type,source_id from private.commerce_fee_accounting_jobs
  where state<>'completed' and next_attempt_at<=clock_timestamp() and (p_source_id is null or source_id=p_source_id)
  order by next_attempt_at,source_type,source_id limit p_limit
 loop
  exit when clock_timestamp()>started+interval '3 seconds';
  begin
   if candidate.source_type='physical_merch' then
    perform 1 from public.merch_orders where id=candidate.source_id for update nowait;
   else
    -- Preserve domain -> qualification -> sale -> job -> component -> creator.
    perform private.lock_auction_release_domain(candidate.source_id);
    perform private.lock_auction_release_qualification(candidate.source_id);
    perform 1 from private.auction_platform_settlement_contracts where id=candidate.source_id for update nowait;
   end if;
   select * into job from private.commerce_fee_accounting_jobs where source_type=candidate.source_type and source_id=candidate.source_id for update nowait;
   if job.state='completed' or job.next_attempt_at>clock_timestamp() then continue; end if;
   begin
    result:=public.release_commerce_known_earnings(job.source_type,job.source_id);
    perform private.consume_creator_fee_recovery((result->>'creator_id')::uuid,'usd');
    -- A release is accounting only, never an instruction to send a payout.
    update private.commerce_fee_accounting_jobs set state='completed',reason=null,attempts=attempts+1,updated_at=clock_timestamp()
     where source_type=job.source_type and source_id=job.source_id;
    outcomes:=outcomes||jsonb_build_array(jsonb_build_object('sourceType',job.source_type,'sourceId',job.source_id,'status','completed','releaseId',result->>'id'));
   exception when others then
    get stacked diagnostics message=message_text;
    job_state:=case when sqlstate in ('40001','40P01','55P03','57014') then 'retry' else 'blocked' end;
    if message !~ '^[a-z0-9_:]{1,140}$' then message:='accounting_error_'||sqlstate; end if;
    update private.commerce_fee_accounting_jobs set state=job_state,reason=message,attempts=attempts+1,
     next_attempt_at=clock_timestamp()+interval '15 minutes',updated_at=clock_timestamp() where source_type=job.source_type and source_id=job.source_id;
    outcomes:=outcomes||jsonb_build_array(jsonb_build_object('sourceType',job.source_type,'sourceId',job.source_id,'status',job_state,'reason',message));
   end;
  exception when lock_not_available then
   outcomes:=outcomes||jsonb_build_array(jsonb_build_object('sourceType',candidate.source_type,'sourceId',candidate.source_id,'status','retry','reason','accounting_source_busy'));
  end;
 end loop;
 return jsonb_build_object('outcomes',outcomes,'providerMutationPerformed',false,'payoutCreated',false);
end; $$;
revoke all on function public.process_commerce_fee_accounting_jobs(integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.process_commerce_fee_accounting_jobs(integer,uuid) to service_role;

create function public.get_owner_commerce_fee_accounting_health() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare jobs jsonb;
begin
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
  or public.has_platform_role(array['owner']) is distinct from true then raise exception 'owner_current_session_required'; end if;
 select coalesce(jsonb_agg(to_jsonb(j) order by j.updated_at desc,j.source_id),'[]'::jsonb) into jobs from
  (select source_type,source_id,state,reason,attempts,next_attempt_at,updated_at from private.commerce_fee_accounting_jobs
   where state<>'completed' order by updated_at desc,source_id limit 100) j;
 return jsonb_build_object('jobs',jobs,'pendingCount',(select count(*) from private.commerce_fee_accounting_jobs where state='pending'),
  'retryCount',(select count(*) from private.commerce_fee_accounting_jobs where state='retry'),
  'blockedCount',(select count(*) from private.commerce_fee_accounting_jobs where state='blocked'),'newScheduleCreated',false);
end; $$;
revoke all on function public.get_owner_commerce_fee_accounting_health() from public,anon,authenticated,service_role;
grant execute on function public.get_owner_commerce_fee_accounting_health() to authenticated;
