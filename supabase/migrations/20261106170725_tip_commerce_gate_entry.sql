begin;
set local search_path=pg_catalog,public;

-- Receipt recording and a new Stripe reservation can lock existing attempt,
-- tip, payout-account or eligibility rows before their eventual tip write.
-- The statement trigger cannot establish order retroactively. Join the same
-- commerce gate at entry, before those locks or any nested capability query.
-- This changes only lock order. In particular, an exact provider receipt may
-- still be recorded after its original buyer session has retired; no new
-- checkout permission, paid state, grant, payout or live switch is introduced.
do $tip_gate_entry$
declare target record; definition text; needle text:=chr(10)||'begin'||chr(10);
begin
  for target in select * from (values
    ('public.record_creator_tip_checkout_session(uuid,uuid,uuid,text,text)',
     'a74a2b1792a6b18db3e6c0d61d0df324af25f0f7ca0c7ca79bae80c9744b96fa'),
    ('public.reserve_creator_tip_checkout_attempt(uuid,uuid,uuid,jsonb)',
     'b52fd6d3075f0c51e7f49520ed04a654a16bd64a90f859b2360e0cd8375a5bc8')
  ) as roots(signature,expected_sha256) loop
    definition:=pg_get_functiondef(target.signature::regprocedure);
    if encode(sha256(convert_to(definition,'UTF8')),'hex')<>target.expected_sha256
      or (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1
    then raise exception 'tip_gate_entry_predecessor_changed: %',target.signature; end if;
    execute replace(definition,needle,needle||
      '  perform private.lock_ordinary_commerce_authority_gate();'||chr(10));
  end loop;
end $tip_gate_entry$;
commit;
