-- Native tips use exact existing store prices, not legacy creator presets.
-- No catalog, provider, capability, money-switch or historical settings writes.
-- Patch the effective internal bodies while preserving their current wrappers,
-- grants and all independent authority/checkout/fee checks. Fail on source drift.
do $migration$
declare target regprocedure; body text; old_text text; new_text text; changed text;
begin
  for target,old_text,new_text in select * from (values
    ('public.list_creator_supported_prices_pre_subscription_binding(text,text,text,uuid)'::regprocedure,
      '(p_source_type=''creator_tip'' and (price->>''amountMinor'')::integer between v_min and v_max)',
      '(p_source_type=''creator_tip'')'),
    ('public.create_money_purchase_intent_pre_protected_video_closeout(text,text,uuid,jsonb)'::regprocedure,
      'and v_catalog_amount between settings."min_amount_cents" and settings."max_amount_cents"',
      '-- Exact positive catalog amount is authoritative; legacy presets are not limits.'),
    ('private.read_creator_tip_route_costs_for_subject(uuid,uuid,uuid,integer,text)'::regprocedure,
      'and p_amount_minor between settings.min_amount_cents and settings.max_amount_cents',
      '-- Exact catalog amount, independent of legacy creator preset bounds.')
  ) changes(target,old_text,new_text)
  loop
    body:=pg_get_functiondef(target);
    if (length(body)-length(replace(body,old_text,'')))/length(old_text)<>1 then
      raise exception 'native_tip_catalog_policy_source_drift: %',target;
    end if;
    changed:=replace(body,old_text,new_text);
    execute changed;
  end loop;
end;
$migration$;
