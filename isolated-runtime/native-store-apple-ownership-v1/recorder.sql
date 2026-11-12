-- SOURCE CANDIDATE. Compose inside ownership.sql's installation transaction,
-- before its deliberate abort. This file alone is not an installation packet.
create table private.native_apple_handover_receipts(
 provider_event_id uuid primary key references public.provider_events(id),
 owner_id uuid not null references private.native_apple_sandbox_owners(id),
 event_id text not null unique, raw_sha256 text not null check(raw_sha256~'^[a-f0-9]{64}$'),
 user_id uuid not null,product_id text not null,original_transaction_id text not null,
 event_type text not null check(event_type in('NON_RENEWING_PURCHASE','CANCELLATION')),
 occurred_at timestamptz not null,created_at timestamptz not null default clock_timestamp()
);
alter table private.native_apple_handover_receipts enable row level security;
alter table private.native_apple_handover_receipts force row level security;
revoke all on private.native_apple_handover_receipts from public,anon,authenticated,service_role;
create trigger immutable before update or delete on private.native_apple_handover_receipts
 for each row execute function private.native_apple_owner_immutable();
create trigger immutable_truncate before truncate on private.native_apple_handover_receipts
 for each statement execute function private.native_apple_owner_immutable();

create function public.native_apple_sandbox_handover_v1(p_scope jsonb,p_event jsonb)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='500ms' as $$
declare o private.native_apple_sandbox_owners;r private.native_apple_handover_receipts;
 e public.provider_events;i public.revenuecat_unbound_initial_authority;
 t public.revenuecat_unbound_terminal_authority;
 v_event_id text;kind text;product text;original text;subject uuid;occurred timestamptz;
 raw_hash text;key text;metadata jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 if p_event is null or jsonb_typeof(p_event)<>'object'
  or p_event-array['eventId','eventType','userId','productId','originalTransactionId','occurredAt']<>'{}'::jsonb
  or not(p_event ?& array['eventId','eventType','userId','productId','originalTransactionId','occurredAt'])
  or exists(select 1 from jsonb_each(p_event) x where jsonb_typeof(x.value)<>'string')
 then raise exception 'native_apple_event_invalid';end if;
 v_event_id:=p_event->>'eventId';kind:=p_event->>'eventType';product:=p_event->>'productId';
 original:=p_event->>'originalTransactionId';
 if coalesce(v_event_id,'')='' or length(v_event_id)>512 or v_event_id<>btrim(v_event_id) or v_event_id~'[[:cntrl:]]'
  or coalesce(original,'')='' or length(original)>512 or original<>btrim(original) or original~'[[:cntrl:]]'
  or kind not in('NON_RENEWING_PURCHASE','CANCELLATION')
  or coalesce(p_event->>'userId','')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 then raise exception 'native_apple_event_invalid';end if;
 subject:=(p_event->>'userId')::uuid;occurred:=(p_event->>'occurredAt')::timestamptz;
 if occurred is null or not isfinite(occurred) or occurred>clock_timestamp()+interval '5 minutes'
 then raise exception 'native_apple_event_time_invalid';end if;
 -- Default-empty/unowned products retain existing dispatch. A candidate SKU
 -- takes the same lock as qualification even before its owner row exists.
 if product not in('com.chillywood.paidvideo.tier1','com.chillywood.paidvideo.tier2',
  'com.chillywood.paidvideo.tier3','com.chillywood.paidvideo.tier4') then return null;end if;
 perform private.native_apple_owner_lock();
 if not exists(select 1 from private.native_apple_sandbox_owners where product_id=product) then return null;end if;
 o:=private.native_apple_owner_scope(p_scope,product,false);raw_hash:=p_scope->>'rawSha256';
 -- Use the existing event/original lock keys. Nonblocking acquisition avoids
 -- introducing a wait cycle against legacy dispatch's retained lock order.
 if not pg_try_advisory_xact_lock(hashtextextended('revenuecat-premium-event-id:'||v_event_id,0))
  or not pg_try_advisory_xact_lock(hashtextextended('creator-money-provider-event:'||v_event_id,0))
  or not pg_try_advisory_xact_lock(hashtextextended('revenuecat-original:revenuecat_app_store:'||original,0))
  or not pg_try_advisory_xact_lock(hashtextextended('revenuecat-original:revenuecat_google_play:'||original,0))
  or not pg_try_advisory_xact_lock(hashtextextended('creator-money-original-transaction:'||original,0))
 then raise exception 'native_apple_original_busy' using errcode='55P03';end if;
 -- The immutable ingress is exact-row locked. Existing canonical authority
 -- writers use the retained original/event keys above; do not replace them
 -- with global table locks that stall unrelated Google/production purchases.
 perform 1 from public.revenuecat_webhook_ingress_events x
  where x.provider_event_id=v_event_id for share nowait;
 perform 1 from public.provider_events x where x.provider_event_id=v_event_id for update nowait;
 perform 1 from public.revenuecat_premium_transaction_authority x
  where x.original_transaction_id=original for share nowait;
 perform 1 from public.revenuecat_consumable_transaction_intents x
  where x.original_transaction_id=original for share nowait;
 if not exists(select 1 from public.revenuecat_webhook_ingress_events x
  where x.provider_event_id=v_event_id and x.raw_payload_hash=raw_hash)
 then raise exception 'native_apple_ingress_unbound';end if;
 -- Existing legacy originals remain owned by their lifecycle handler. No new
 -- native exclusion is issued for them, even when a terminal event is valid.
 if exists(select 1 from public.revenuecat_premium_transaction_authority x where x.original_transaction_id=original)
  or exists(select 1 from public.revenuecat_consumable_transaction_intents x where x.original_transaction_id=original)
 then return null;end if;
 select * into i from public.revenuecat_unbound_initial_authority x
  where x.provider='revenuecat_app_store' and x.original_transaction_id=original;
 select * into t from public.revenuecat_unbound_terminal_authority x
  where x.provider='revenuecat_app_store' and x.original_transaction_id=original;
 if exists(select 1 from public.revenuecat_unbound_initial_authority x where x.original_transaction_id=original
    and row(x.provider,x.user_id,x.provider_product_id,x.environment)
      is distinct from row('revenuecat_app_store'::text,subject,product,'sandbox'::text))
  or exists(select 1 from public.revenuecat_unbound_terminal_authority x where x.original_transaction_id=original
    and row(x.provider,x.user_id,x.provider_product_id,x.environment)
      is distinct from row('revenuecat_app_store'::text,subject,product,'sandbox'::text))
 then raise exception 'native_apple_original_identity_conflict';end if;
 -- A pre-handover ignored original is not ours to reinterpret.
 if i.provider is not null and not exists(select 1 from private.native_apple_handover_receipts x
   where x.provider_event_id=i.first_provider_event_id and x.owner_id=o.id)
  or t.provider is not null and not exists(select 1 from private.native_apple_handover_receipts x
   where x.provider_event_id=t.last_provider_event_id and x.owner_id=o.id)
 then return null;end if;
 select * into r from private.native_apple_handover_receipts x where x.event_id=v_event_id;
 if r.provider_event_id is not null then
  if row(r.owner_id,r.raw_sha256,r.user_id,r.product_id,r.original_transaction_id,r.event_type,r.occurred_at)
   is distinct from row(o.id,raw_hash,subject,product,original,kind,occurred)
  then raise exception 'native_apple_replay_conflict';end if;
  select * into strict e from public.provider_events where id=r.provider_event_id;
 else
  if exists(select 1 from public.provider_events x where x.provider_event_id=v_event_id)
  then raise exception 'native_apple_existing_event_unowned';end if;
  key:='creator_money:native_apple_handover:'||v_event_id;
  metadata:=jsonb_build_object('final_reason','native_sandbox_ownership_handover',
   'provider_product_id',product,'reported_provider_product_id',product,
   'original_transaction_id',original,'authority_granted',false,
   'provider_reconciliation_required',true,
   'provider_reconciliation_disposition','refund_or_authoritative_provider_reconciliation_required');
  insert into public.provider_events(provider_event_id,provider,user_id,app_user_id,environment,
   event_type,status,occurred_at,idempotency_key,raw_payload_hash,metadata)
  values(v_event_id,'revenuecat_app_store',subject,subject::text,'sandbox',kind,'ignored',occurred,key,raw_hash,metadata)
  returning * into e;
  insert into private.native_apple_handover_receipts(provider_event_id,owner_id,event_id,raw_sha256,
   user_id,product_id,original_transaction_id,event_type,occurred_at)
  values(e.id,o.id,v_event_id,raw_hash,subject,product,original,kind,occurred);
  if kind='NON_RENEWING_PURCHASE' then
   insert into public.revenuecat_unbound_initial_authority(provider,original_transaction_id,user_id,
    provider_product_id,environment,first_provider_event_id,first_ignore_reason)
   values('revenuecat_app_store',original,subject,product,'sandbox',e.id,'native_sandbox_ownership_handover')
   on conflict(provider,original_transaction_id) do nothing;
  else
   insert into public.revenuecat_unbound_terminal_authority(provider,original_transaction_id,user_id,
    provider_product_id,environment,last_provider_event_id,last_occurred_at,last_event_type,last_event_rank)
   values('revenuecat_app_store',original,subject,product,'sandbox',e.id,occurred,'CANCELLATION',
    public.revenuecat_creator_money_authority_rank_internal('CANCELLATION'))
   on conflict(provider,original_transaction_id) do nothing;
  end if;
 end if;
 if row(e.provider,e.provider_event_id,e.user_id,e.environment,e.event_type,e.status,e.raw_payload_hash)
  is distinct from row('revenuecat_app_store'::text,v_event_id,subject,'sandbox'::text,kind,'ignored'::text,raw_hash)
  or e.product_id is not null or e.product_key is not null
  or e.occurred_at is distinct from occurred
  or e.metadata->>'provider_product_id' is distinct from product
  or e.metadata->>'original_transaction_id' is distinct from original
  or coalesce(e.metadata->>'purchase_intent_id','')<>''
  or coalesce(e.metadata->>'access_grant_id','')<>'' or coalesce(e.metadata->>'ledger_event_id','')<>''
  or e.metadata->>'final_reason' is distinct from 'native_sandbox_ownership_handover'
  or e.metadata->'authority_granted' is distinct from 'false'::jsonb
  or exists(select 1 from public.access_grants x where x.provider_event_id=e.id)
  or exists(select 1 from public.money_access_ledger_events x where x.provider_event_id=e.id)
  or exists(select 1 from public.creator_earnings_ledger x where x.metadata->>'provider_event_id'=e.id::text)
 then raise exception 'native_apple_no_effect_proof_failed';end if;
 if kind='NON_RENEWING_PURCHASE' and not exists(select 1 from public.revenuecat_unbound_initial_authority x
   join private.native_apple_handover_receipts h on h.provider_event_id=x.first_provider_event_id
   where x.provider='revenuecat_app_store' and x.original_transaction_id=original
    and x.user_id=subject and x.provider_product_id=product and x.environment='sandbox' and h.owner_id=o.id)
  or kind='CANCELLATION' and not exists(select 1 from public.revenuecat_unbound_terminal_authority x
   join private.native_apple_handover_receipts h on h.provider_event_id=x.last_provider_event_id
   where x.provider='revenuecat_app_store' and x.original_transaction_id=original
    and x.user_id=subject and x.provider_product_id=product and x.environment='sandbox' and h.owner_id=o.id)
 then raise exception 'native_apple_original_reservation_unproven';end if;
 if kind='NON_RENEWING_PURCHASE' and not exists(select 1 from public.revenuecat_provider_reconciliation_obligations x
   where x.provider_event_id=e.id and x.provider='revenuecat_app_store' and x.user_id=subject
    and x.provider_product_id=product and x.original_transaction_id=original and x.environment='sandbox'
    and x.purchase_intent_id is null and x.state='pending_reconciliation' and x.resolved_at is null
    and x.resolution_reference_hash is null)
 then raise exception 'native_apple_obligation_unproven';end if;
 return jsonb_build_object('protocol','native-apple-sandbox-handover-v1','providerEventId',e.id,
  'rawSha256',raw_hash,'status','excluded','financialAuthority',false,'obligationResolved',false);
end $$;
revoke all on function public.native_apple_sandbox_handover_v1(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.native_apple_sandbox_handover_v1(jsonb,jsonb) to service_role;

-- Owned sandbox products must never regain positive legacy projection merely
-- because the shared webhook route was disabled. Keep terminal cleanup intact.
create function private.native_apple_legacy_positive_fence() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.provider<>'revenuecat_app_store' or new.environment<>'sandbox' or new.status<>'processed'
  or new.event_type not in('INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL','UNCANCELLATION','PRODUCT_CHANGE')
 then return new;end if;
 if not exists(select 1 from (values('com.chillywood.paidvideo.tier1'),('com.chillywood.paidvideo.tier2'),
  ('com.chillywood.paidvideo.tier3'),('com.chillywood.paidvideo.tier4')) candidate(product) where
  candidate.product in(new.metadata->>'provider_product_id',new.metadata->>'reported_provider_product_id')
  or exists(select 1 from public.monetization_products p where p.id=new.product_id and p.provider_product_id=candidate.product)
  or exists(select 1 from public.monetization_product_store_mappings m where m.product_id=new.product_id and m.provider_product_id=candidate.product))
 then return new;end if;
 -- Share the qualification fence and prohibit old-snapshot transactions from
 -- observing no owner after a concurrent handover committed.
 perform private.native_apple_owner_lock();
 if exists(select 1 from private.native_apple_sandbox_owners o where
   o.product_id in(new.metadata->>'provider_product_id',new.metadata->>'reported_provider_product_id')
   or exists(select 1 from public.monetization_products p where p.id=new.product_id and p.provider_product_id=o.product_id)
   or exists(select 1 from public.monetization_product_store_mappings m where m.product_id=new.product_id and m.provider_product_id=o.product_id))
 then raise exception 'native_apple_legacy_positive_owned';end if;
 return new;
end $$;
revoke all on function private.native_apple_legacy_positive_fence() from public,anon,authenticated,service_role;
create trigger native_apple_legacy_positive before insert or update on public.provider_events
 for each row execute function private.native_apple_legacy_positive_fence();
