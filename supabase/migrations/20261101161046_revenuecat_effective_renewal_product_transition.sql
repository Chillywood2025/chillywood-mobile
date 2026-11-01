begin;
-- PRODUCT_CHANGE remains a no-authority scheduled notice. A real signed
-- RENEWAL may establish its effective SKU only inside the existing exact
-- original-transaction lock, finite generation and normal purchase validators.
create function private.revenuecat_effective_renewal_scope(
 p_provider text,p_event text,p_user uuid,p_environment text
) returns boolean language sql stable security definer set search_path='' as $$
 select count(*)=1 from public.revenuecat_premium_transaction_authority a
 where a.provider=p_provider and a.user_id=p_user and a.environment=p_environment
   and a.product_change_projection_event_id=p_event and a.authority_state in ('active','retained')
$$;
revoke all on function private.revenuecat_effective_renewal_scope(text,text,uuid,text) from public,anon,authenticated,service_role;

do $patch$
declare r record; definition text; needle text; replacement text; patched integer:=0;
begin
 -- The retained 19-argument catalog/prior-purchase validator and 20-argument
 -- original-transaction validator keep their genuine event type and all other
 -- validation. An unscoped RENEWAL still cannot change catalog identity.
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prokind='f' and (
     p.prosrc like '%raise exception ''revenuecat_premium_original_transaction_product_mismatch''%'
     or (p.prosrc like '%v_reason := ''premium_prior_purchase_authority_missing''%'
       and p.prosrc like '%Superseded by exact Premium product change.%'))
 loop
  definition:=pg_get_functiondef(r.oid);
  if position('v_event_type=''PRODUCT_CHANGE''' in definition)=0 then raise exception 'effective_renewal_validator_shape_changed'; end if;
  definition:=replace(definition,'v_event_type=''PRODUCT_CHANGE''',
    '(v_event_type=''PRODUCT_CHANGE'' or (v_event_type=''RENEWAL'' and private.revenuecat_effective_renewal_scope(v_provider,v_event_id,p_user_id,v_environment)))');
  execute definition;patched:=patched+1;
 end loop;
 if patched<>2 then raise exception 'effective_renewal_validator_count_mismatch:%',patched; end if;
 select pg_get_functiondef('public.process_revenuecat_premium_event_pre_owner_serialization(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)'::regprocedure) into definition;
 needle:='  if v_binding."id" is not null and v_event_type in (''RENEWAL'',''UNCANCELLATION'',''PRODUCT_CHANGE'') and p_occurred_at is not null and v_existing_event."id" is null';
 if position(needle in definition)=0 then raise exception 'effective_renewal_generation_shape_changed'; end if;
 replacement:=$stage$
  -- Stage only a fresh effective paid renewal of the currently authoritative
  -- existing generation. Neither a scheduled change, new original, stale SKU,
  -- terminal binding, duplicate, or unsigned/non-finite period may stage it.
  if v_event_type='RENEWAL' and v_binding.id is not null and v_existing_event.id is null
    and v_binding.user_id=p_user_id and v_binding.environment=v_environment
    and v_binding.authority_state in ('active','retained') and v_binding.product_change_projection_event_id is null
    and (v_binding.current_product_id is distinct from p_product_id
      or v_binding.current_provider_product_id is distinct from p_provider_product_id
      or v_binding.current_provider_base_plan_id is distinct from nullif(p_provider_base_plan_id,''))
    and public.premium_subject_has_finite_authority_internal(p_user_id::text)
    and p_product_id is not null and nullif(trim(p_provider_product_id),'') is not null
    and p_raw_payload_hash ~ '^[0-9a-f]{64}$' and p_amount_minor>0
    and p_entitlement_status in ('active','trialing')
    and p_starts_at is not null and p_starts_at>=v_binding.latest_occurred_at
    and p_starts_at<=v_now and p_expires_at>v_now and p_expires_at>p_starts_at
    and p_occurred_at>=p_starts_at and p_occurred_at<=v_now+interval '5 minutes'
    and (v_candidate_at,public.revenuecat_premium_authority_rank_internal(v_event_type,false),v_event_id collate "C")>
      (v_binding.latest_occurred_at,v_binding.latest_event_rank,v_binding.latest_event_id collate "C")
  then
    update public.revenuecat_premium_transaction_authority set product_change_projection_event_id=v_event_id,updated_at=v_now
      where id=v_binding.id and product_change_projection_event_id is null;
    if not found then raise exception 'premium_effective_renewal_scope_not_staged'; end if;
    v_stage_product_change:=true;v_stage_generation:=true;
  end if;
$stage$||needle;
 definition:=replace(definition,needle,replacement);
 -- The earlier local row snapshot still has a null marker. Prevent the normal
 -- renewal path from overwriting this effective-transition scope as pending.
 definition:=replace(definition,'and v_binding."product_change_projection_event_id" is null and v_environment=''sandbox''',
   'and not v_stage_product_change and v_binding."product_change_projection_event_id" is null and v_environment=''sandbox''');
 execute definition;
end $patch$;
commit;
