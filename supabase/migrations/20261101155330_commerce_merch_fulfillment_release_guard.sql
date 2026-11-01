-- A purchase-based untracked return window does not silently mark an explicitly
-- unfulfilled order as shipped. Keep the agreed 30-day start rule unchanged.
do $$ declare definition text; needle text:='if o.environment<>''production'' or o.payment_status<>''paid'' or o.provider<>''stripe_physical_goods'' then return false; end if;'; begin
 definition:=pg_get_functiondef('private.commerce_positive_release_ready(private.commerce_known_cost_snapshots)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'merch_release_fulfillment_source_changed'; end if;
 execute replace(definition,needle,replace(needle,'then return false;',
  'or o.fulfillment_status not in (''shipped'',''delivered'') then return false;'));
end $$;
