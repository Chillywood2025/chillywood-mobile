-- Context is independently bound to the actual order/account/mode. Keep report
-- identity locks, collision checks and persisted rows in that same exact mode.
do $$ declare definition text; old_fragments text[]:=array[
 'p_evidence->>''environment''=''test''',
 '''fee-report:''||(context->>''accountId'')||'':test:''',
 'stored.environment=''test''',
 'values(o.id,e.id,context->>''accountId'',''test'','
 ]; new_fragments text[]:=array[
 'p_evidence->>''environment''=context->>''environment''',
 '''fee-report:''||(context->>''accountId'')||'':''||(context->>''environment'')||'':''',
 'stored.environment=context->>''environment''',
 'values(o.id,e.id,context->>''accountId'',context->>''environment'','
 ]; i integer;
begin
 definition:=pg_get_functiondef('public.record_merch_fee_report_observation(uuid,uuid,jsonb)'::regprocedure);
 for i in 1..cardinality(old_fragments) loop
  if position(old_fragments[i] in definition)=0 then raise exception 'merch_fee_mode_definition_changed:%',i; end if;
  definition:=replace(definition,old_fragments[i],new_fragments[i]);
 end loop;
 execute definition;
end $$;
