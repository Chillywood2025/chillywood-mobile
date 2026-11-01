-- A provider fee observed after exact bank-paid evidence is a future-only adjustment
-- even when the bank subsequently fails. The return phase must not change its
-- economic treatment or retroactively consume the original returned earning.
-- No fee policy, provider authority, switch, acceptance or payout is created.
do $$ declare definition text;anchor text; begin
 definition:=pg_get_functiondef('public.record_creator_cashout_fee_report_adjusted(uuid,jsonb)'::regprocedure);
 anchor:='if (e.phase=''paid'' or (e.phase=''returned'' and e.returned_accounted_at is not null))';
 if position(anchor in definition)=0 then raise exception 'cashout_returning_fee_adjustment_anchor_missing'; end if;
 execute replace(definition,anchor,'if (e.finalized_at is not null or e.phase=''paid''
  or exists(select 1 from private.creator_cashout_observations paid where paid.execution_id=e.id
   and paid.facts->>''kind''=''payout'' and paid.facts->>''objectId''=e.payout_id and paid.facts->>''status''=''paid'')
  or (e.phase=''returned'' and e.returned_accounted_at is not null))');
end $$;
