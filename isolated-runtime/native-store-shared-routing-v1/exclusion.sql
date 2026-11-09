-- Forward-only SOURCE extension, not part of or a replacement for the installed
-- native 48-module bundle. Apply only through a separately authorized, verified
-- deployment. No provider/control activation, table write or obligation closure.
create function public.revenuecat_native_legacy_exclusion_v1(
 p_provider_event_row_id uuid,p_provider_event_id text,p_raw_sha256 text
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='500ms' as $$
declare e public.provider_events;initial public.revenuecat_unbound_initial_authority;
 terminal public.revenuecat_unbound_terminal_authority;product text;original text;
 result jsonb:=jsonb_build_object('protocol','revenuecat-native-legacy-exclusion-v1','providerEventId',p_provider_event_id,
  'rawSha256',p_raw_sha256,'status','held','financialAuthority',false,'obligationResolved',false);
begin
 if p_provider_event_row_id is null or coalesce(p_provider_event_id,'')='' or length(p_provider_event_id)>512
  or p_provider_event_id<>btrim(p_provider_event_id) or coalesce(p_raw_sha256,'')!~'^[a-f0-9]{64}$'
 then return result;end if;
 -- No lookup ordering/"newest" rule and no waiting behind mutable provider
 -- projectors. A busy proof stays held. SHARE prevents insertion/deletion while
 -- these independent inventories are read, including late catalog additions.
 lock table public.provider_events,public.revenuecat_webhook_ingress_events,
  public.revenuecat_premium_transaction_authority,public.revenuecat_consumable_transaction_intents,
  public.revenuecat_unbound_initial_authority,public.revenuecat_unbound_terminal_authority,
  public.money_purchase_intents,public.monetization_product_store_mappings,public.monetization_products,
  public.revenuecat_provider_reconciliation_obligations in share mode nowait;
 select * into e from public.provider_events where id=p_provider_event_row_id;
 if e.id is null or e.provider_event_id is distinct from p_provider_event_id or e.raw_payload_hash is distinct from p_raw_sha256
  or e.provider not in('revenuecat_app_store','revenuecat_google_play') or e.environment is distinct from 'sandbox'
  or e.status is distinct from 'ignored' or e.event_type not in('NON_RENEWING_PURCHASE','CANCELLATION')
  or e.user_id is null or e.product_id is not null or e.product_key is not null
  or not exists(select 1 from public.revenuecat_webhook_ingress_events i where i.provider_event_id=p_provider_event_id and i.raw_payload_hash=p_raw_sha256)
  or coalesce(e.metadata->>'purchase_intent_id','')<>'' or coalesce(e.metadata->>'access_grant_id','')<>''
  or coalesce(e.metadata->>'ledger_event_id','')<>'' or e.metadata->'authority_granted' is distinct from 'false'::jsonb
 then return result;end if;
 product:=case when e.event_type='NON_RENEWING_PURCHASE' then e.metadata->>'provider_product_id' else e.metadata->>'reported_provider_product_id' end;
 original:=e.metadata->>'original_transaction_id';
 if coalesce(product,'')='' or coalesce(original,'')='' or product='<missing-or-ambiguous>'
  or (e.event_type='CANCELLATION' and coalesce(e.metadata->>'reported_provider_base_plan_id','')<>'')
  or exists(select 1 from public.revenuecat_premium_transaction_authority a where a.original_transaction_id=original)
  or exists(select 1 from public.revenuecat_consumable_transaction_intents a where a.original_transaction_id=original)
  -- Treat all legacy catalog history and every environment as possible overlap.
  -- A native SKU must be exclusive, not an alias of an old/retired legacy SKU.
  or exists(select 1 from public.monetization_product_store_mappings m where m.provider_product_id=product)
  or exists(select 1 from public.monetization_products p where p.provider_product_id in(product,split_part(product,':',1)))
  or exists(select 1 from public.money_purchase_intents i where i.provider_product_id=product)
  or exists(select 1 from public.revenuecat_unbound_initial_authority a where a.original_transaction_id=original
    and (a.provider<>e.provider or a.user_id<>e.user_id or a.provider_product_id<>product or a.environment<>'sandbox'))
  or exists(select 1 from public.revenuecat_unbound_terminal_authority a where a.original_transaction_id=original
    and (a.provider<>e.provider or a.user_id<>e.user_id or a.provider_product_id<>product or a.environment<>'sandbox'))
 then return result;end if;
 if e.event_type='NON_RENEWING_PURCHASE' then
  if coalesce(e.metadata->>'final_reason','') not in('product_mapping_missing','provider_source_lock_unresolved') then return result;end if;
  select * into initial from public.revenuecat_unbound_initial_authority a where a.provider=e.provider and a.original_transaction_id=original;
  -- This permanent original-transaction reservation prevents a future legacy
  -- intent from adopting this already-finalized ignored purchase after return.
  if initial.first_provider_event_id is distinct from e.id or initial.user_id is distinct from e.user_id
   or initial.provider_product_id is distinct from product or initial.environment is distinct from 'sandbox'
   or not exists(select 1 from public.revenuecat_provider_reconciliation_obligations o where o.provider_event_id=e.id
    and o.provider=e.provider and o.user_id=e.user_id and o.provider_product_id=product and o.original_transaction_id=original
    and o.environment='sandbox' and o.purchase_intent_id is null and o.state='pending_reconciliation'
    and o.resolved_at is null and o.resolution_reference_hash is null)
  then return result;end if;
 else
  if e.metadata->>'final_reason' is distinct from 'terminal_dispatch_binding_missing' then return result;end if;
  select * into terminal from public.revenuecat_unbound_terminal_authority a where a.provider=e.provider and a.original_transaction_id=original;
  if terminal.last_provider_event_id is distinct from e.id or terminal.user_id is distinct from e.user_id
   or terminal.provider_product_id is distinct from product or terminal.environment is distinct from 'sandbox'
  then return result;end if;
 end if;
 return result||jsonb_build_object('status','excluded');
end $$;
revoke all on function public.revenuecat_native_legacy_exclusion_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.revenuecat_native_legacy_exclusion_v1(uuid,text,text) to service_role;
comment on function public.revenuecat_native_legacy_exclusion_v1(uuid,text,text) is
 'Read-only exact native-sandbox versus legacy consumer exclusion proof. Preserves pending reconciliation obligations and all authority guards; never activates purchases or acknowledges transport by itself.';
