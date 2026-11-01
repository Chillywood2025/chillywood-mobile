-- Consume existing carrier facts only. Historical registration evidence is retained,
-- never promoted or manufactured by polling. Keep the legacy RPC argument for
-- rolling compatibility; it no longer grants registration evidence authority.
do $migration$
declare definition text; old_fragment text;
begin
 definition:=pg_get_functiondef('public.claim_merch_tracking_jobs(integer,text)'::regprocedure);
 old_fragment:='environment=j.order_environment, provider_account=coalesce(provider_account,j.account), attempts=attempts+1,
   registration_state=case when registration_state=''pending'' then ''attempted'' when registration_state=''attempted'' then ''unknown'' else registration_state end';
 if strpos(definition,old_fragment)=0 then raise exception 'tracking_claim_consume_only_predecessor_mismatch'; end if;
 definition:=replace(definition,old_fragment,'environment=j.order_environment, provider_account=coalesce(provider_account,j.account), attempts=attempts+1');
 definition:=replace(definition,'-- An expired attempted POST is unknown: never automatically POST twice.',
  '-- Consume existing tracking; do not change historical registration evidence.');
 execute definition;
 definition:=pg_get_functiondef('public.complete_merch_tracking_job(uuid,uuid,jsonb,boolean)'::regprocedure);
 old_fragment:='registration_state=case when p_registered then ''registered'' when registration_state=''attempted'' then ''unknown'' else registration_state end,';
 if strpos(definition,old_fragment)=0 then raise exception 'tracking_complete_consume_only_predecessor_mismatch'; end if;
 definition:=replace(definition,old_fragment,'-- p_registered is ignored: GET cannot prove registration.');
 execute definition;
end $migration$;
