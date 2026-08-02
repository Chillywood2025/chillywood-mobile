-- A verified RevenueCat transfer may supersede an expired, ineffective
-- non-provider entitlement residue. A currently effective non-provider
-- entitlement remains a hard conflict.
--
-- Keep the already-deployed transfer function history intact and patch only
-- the exact target-conflict predicate in its canonical definition.

do $migration$
declare
  v_function_definition text;
  v_original_predicate text := $original$
      and entitlement."entitlement_key" = 'premium'
      and entitlement."source" <> 'revenuecat'
$original$;
  v_replacement_predicate text := $replacement$
      and entitlement."entitlement_key" = 'premium'
      and entitlement."source" <> 'revenuecat'
      and entitlement."status" in ('active', 'trialing', 'grace_period')
      and (entitlement."expires_at" is null or entitlement."expires_at" > v_now)
$replacement$;
begin
  select pg_get_functiondef(
    'public.process_revenuecat_premium_transfer_atomic_internal(text,uuid,uuid,text,timestamptz,text,text)'::regprocedure
  )
  into v_function_definition;

  if position(v_original_predicate in v_function_definition) = 0 then
    raise exception 'revenuecat_transfer_target_predicate_not_found';
  end if;
  if position(v_replacement_predicate in v_function_definition) > 0 then
    raise exception 'revenuecat_transfer_target_predicate_already_updated';
  end if;

  execute replace(v_function_definition, v_original_predicate, v_replacement_predicate);
end;
$migration$;

comment on function public."process_revenuecat_premium_transfer_atomic"(
  text, uuid, uuid, text, timestamptz, text
) is 'Service-only atomic reconciliation for a verified RevenueCat App Store sandbox TRANSFER. It may supersede expired non-provider test residue, but it rejects any effective non-provider entitlement, stores no raw payload, and creates no payable balance or LiveKit authority.';
