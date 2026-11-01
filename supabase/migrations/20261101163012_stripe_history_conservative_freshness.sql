-- Completion is not a fresh reread of every mutable balance. Preserve the
-- oldest independently verified fact time; existing 15-minute money holds stay.
create function private.stripe_history_verified_at(p_domain text,p_source_id uuid,p_facts jsonb) returns timestamptz
language plpgsql volatile set search_path='' as $$
declare s private.stripe_cost_history_checkpoints; oldest timestamptz; newest timestamptz;
begin
 if not(p_facts ? 'history_generation') then return clock_timestamp();end if;
 select * into s from private.stripe_cost_history_checkpoints where domain=p_domain and source_id=p_source_id;
 if s.source_id is null or s.completed or s.lease is null or s.lease_until is null or s.lease_until<=clock_timestamp()
  or s.generation::text is distinct from p_facts->>'history_generation'
  or s.account_id is distinct from p_facts->>'account_id'
  or s.source_binding is distinct from private.stripe_cost_history_context(p_domain,p_source_id)
  or s.checkpoint->>'verificationStartedAt' is null
  or s.checkpoint->>'version' is distinct from '1'
  or s.checkpoint->>'phase' is distinct from 'verify'
  or jsonb_typeof(s.checkpoint->'entries') is distinct from 'array'
  or coalesce((s.checkpoint->>'cursor')::integer,-1)<>jsonb_array_length(s.checkpoint->'entries')
 then raise exception 'history_freshness_proof_required';end if;
 select min(to_timestamp((e->>'observedAt')::numeric/1000)),max(to_timestamp((e->>'observedAt')::numeric/1000)) into oldest,newest
 from jsonb_array_elements(s.checkpoint->'entries') e;
 if exists(select 1 from jsonb_array_elements(s.checkpoint->'entries') e where e->>'observedAt' is null)
  or oldest is null or newest>clock_timestamp() or oldest<to_timestamp((s.checkpoint->>'verificationStartedAt')::numeric/1000)
  or oldest<clock_timestamp()-interval '6 hours' then raise exception 'history_freshness_invalid';end if;
 return oldest;
end $$;
revoke all on function private.stripe_history_verified_at(text,uuid,jsonb) from public,anon,authenticated,service_role;
-- Preserve all current outer queue/fee wrappers. Alter only exact read receipt
-- INSERTs, never mutate an already immutable receipt after insertion.
do $$ declare definition text; needle text; replacement text; signature text; begin
 foreach signature in array array['public.record_merch_provider_cost_observation(uuid,jsonb)','public.record_auction_platform_cost_observation(uuid,jsonb)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if signature like '%merch%' then
   needle:='insert into private.commerce_cost_verification_reads(source_type,source_id,source_observation_id) values(''physical_merch'',p_order_id,obs);';
   replacement:='insert into private.commerce_cost_verification_reads(source_type,source_id,source_observation_id,verified_at) values(''physical_merch'',p_order_id,obs,private.stripe_history_verified_at(''merch'',p_order_id,p_facts));';
  else
   needle:='insert into private.commerce_cost_verification_reads(source_type,source_id,source_observation_id) values(lane||''_auction'',p_contract_id,obs);';
   replacement:='insert into private.commerce_cost_verification_reads(source_type,source_id,source_observation_id,verified_at) values(lane||''_auction'',p_contract_id,obs,private.stripe_history_verified_at(''auction'',p_contract_id,p_facts));';
  end if;
  if position(needle in definition)=0 then raise exception 'history_recorder_definition_changed: %',signature;end if;
  execute replace(definition,needle,replacement);
 end loop;
 definition:=pg_get_functiondef('public.save_stripe_cost_history(text,uuid,uuid,uuid,jsonb,jsonb)'::regprocedure);
 needle:='if p_domain=''merch'' then v_result:=';
 if position(needle in definition)=0 then raise exception 'history_save_definition_changed';end if;
 definition:=replace(definition,needle,'update private.stripe_cost_history_checkpoints set checkpoint=p_checkpoint where domain=p_domain and source_id=p_source_id;'||chr(10)||needle);
 needle:='insert into private.stripe_cost_history_receipts(generation';
 if position(needle in definition)=0 then raise exception 'history_result_definition_changed';end if;
 definition:=replace(definition,needle,$patch$
 v_result:=v_result||jsonb_build_object('verifiedAsOf',private.stripe_history_verified_at(p_domain,p_source_id,p_facts),
  'historyFreshForMoney',private.stripe_history_verified_at(p_domain,p_source_id,p_facts)>=clock_timestamp()-interval '15 minutes',
  'historyHoldReason',case when private.stripe_history_verified_at(p_domain,p_source_id,p_facts)<clock_timestamp()-interval '15 minutes'
   then 'history_facts_stale_collect_fresh_provider_evidence_before_release' else null end);
 insert into private.stripe_cost_history_receipts(generation$patch$);
 execute definition;
end $$;
-- Status freshness also uses the conservative receipt, not job completion.
create function private.latest_cost_verification_at(p_domain text,p_source_id uuid) returns timestamptz
language sql stable set search_path='' as $$
 select verified_at from private.commerce_cost_verification_reads
 where source_id=p_source_id and case when p_domain='merch' then source_type='physical_merch' else source_type in('event_auction','room_auction') end
 order by id desc limit 1
$$;
revoke all on function private.latest_cost_verification_at(text,uuid) from public,anon,authenticated,service_role;
do $$ declare definition text; signature text; replacement text; needle text:='last_success_at=case when p_complete is true then clock_timestamp() else last_success_at end'; begin
 foreach signature in array array['public.complete_merch_cost_refresh(uuid,uuid,boolean)','public.complete_auction_observation(uuid,uuid,boolean,text)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position(needle in definition)=0 then raise exception 'history_completion_definition_changed';end if;
  replacement:=case when signature like '%merch%' then 'private.latest_cost_verification_at(''merch'',p_order_id)' else 'private.latest_cost_verification_at(''auction'',p_contract_id)' end;
  execute replace(definition,needle,'last_success_at=case when p_complete is true then '||replacement||' else last_success_at end');
 end loop;
end $$;
alter table private.stripe_cost_history_receipts add column oldest_verified_at timestamptz;
create function private.stripe_history_receipt_time() returns trigger language plpgsql set search_path='' as $$
begin
 new.oldest_verified_at:=private.stripe_history_verified_at(new.domain,new.source_id,jsonb_build_object('history_generation',new.generation,'account_id',new.account_id));
 return new;
end $$;
revoke all on function private.stripe_history_receipt_time() from public,anon,authenticated,service_role;
create trigger stripe_history_receipt_time before insert on private.stripe_cost_history_receipts for each row execute function private.stripe_history_receipt_time();
