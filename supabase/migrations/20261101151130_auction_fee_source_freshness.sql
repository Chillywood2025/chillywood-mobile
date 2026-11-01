-- Match merchandise's locked current-source rule. A report collected against
-- an old refund chain cannot race a newer provider observation and bind itself
-- to stale amounts. Every original report validation remains unchanged.
do $$ declare definition text; needle text:='select * into strict o from private.auction_settlement_observations where id=p_source_observation_id and contract_id=c.id;'; begin
 definition:=pg_get_functiondef('public.record_commerce_fee_report_observation(uuid,uuid,jsonb)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'auction_fee_source_definition_changed'; end if;
 definition:=replace(definition,needle,needle||$guard$
 if o.id is distinct from (select latest.id from private.auction_settlement_observations latest
  where latest.contract_id=c.id order by latest.created_at desc,latest.id desc limit 1)
 then raise exception 'fee_source_observation_stale'; end if;
$guard$);
 execute definition;
end $$;
