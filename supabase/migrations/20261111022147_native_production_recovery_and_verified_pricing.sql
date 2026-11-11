-- A prelaunch dispatch may be retired only before the server's one-shot
-- checkout claim. Native entry now requires a direct server claim check, so an
-- old retained handle cannot invoke the SDK after its dispatch is retired.
create table private.native_production_unlaunched_retirements (
 dispatch_id uuid primary key references private.native_production_checkout_dispatches(id),
 retired_at timestamptz not null default clock_timestamp()
);
alter table private.native_production_unlaunched_retirements enable row level security;
alter table private.native_production_unlaunched_retirements force row level security;
revoke all on private.native_production_unlaunched_retirements from public,anon,authenticated,service_role;
create trigger native_retirement_immutable before update or delete on private.native_production_unlaunched_retirements
 for each row execute function public.block_revenuecat_webhook_ingress_mutation_internal();
create function private.guard_native_production_retirement() returns trigger language plpgsql set search_path='' as $$
declare intent public.money_purchase_intents;
begin
 perform pg_advisory_xact_lock(hashtextextended('native-production-checkout-authority',0));
 select i.* into strict intent from public.money_purchase_intents i
 join private.native_production_checkout_dispatches d on d.intent_id=i.id where d.id=new.dispatch_id for update of i;
 if intent.checkout_started_at is not null or intent.checkout_attempt_id is not null
  or exists(select 1 from private.native_production_verified_witnesses where dispatch_id=new.dispatch_id)
  or exists(select 1 from private.native_production_checkout_access_bindings where dispatch_id=new.dispatch_id)
 then raise exception 'native_claimed_dispatch_cannot_retire'; end if;
 return new;
end $$;

revoke all on function private.guard_native_production_retirement() from public,anon,authenticated,service_role;
create trigger native_retirement_guard before insert on private.native_production_unlaunched_retirements
 for each row execute function private.guard_native_production_retirement();

-- Retained immutable rows remain evidence, but cannot authorize a new handle,
-- claim, or SDK entry. The admission selector must not reuse a retired quote.
do $$ declare original text; changed text; signature text; begin
 signature:='public.creator_video_paid_precharge_before_production_admission(uuid,text,text,text,integer,text,text)';
 original:=pg_get_functiondef(signature::regprocedure);
 changed:=replace(original,'and pending."status"=''pending''',
  'and not exists(select 1 from private.native_production_checkout_dispatches retired_dispatch join private.native_production_unlaunched_retirements retirement on retirement.dispatch_id=retired_dispatch.id where retired_dispatch.intent_id=pending.id) and pending."status"=''pending''');
 if changed=original then raise exception 'native_retirement_precharge_anchor'; end if; execute changed;
 signature:='private.prepare_native_production_video_admission(uuid,text,text,text,integer)';
 original:=pg_get_functiondef(signature::regprocedure);
 changed:=replace(original,'and terms_acceptance_id=accepted',
  'and not exists(select 1 from private.native_production_checkout_dispatches d join private.native_production_unlaunched_retirements r on r.dispatch_id=d.id where d.admission_id=native_production_video_admissions.id) and terms_acceptance_id=accepted');
 if changed=original then raise exception 'native_retirement_admission_anchor'; end if; execute changed;
 signature:='public.create_native_production_paid_video_intent(uuid,text)';
 original:=pg_get_functiondef(signature::regprocedure);
 changed:=replace(original,'and original.admission_id<>a.id',
  'and not exists(select 1 from private.native_production_unlaunched_retirements r where r.dispatch_id=original.id) and original.admission_id<>a.id');
 changed:=replace(changed,'if a.id is null then',
  'if a.id is null or exists(select 1 from private.native_production_checkout_dispatches retired_dispatch join private.native_production_unlaunched_retirements retirement on retirement.dispatch_id=retired_dispatch.id where retired_dispatch.admission_id=a.id) then');
 if changed=original then raise exception 'native_retirement_intent_anchor'; end if; execute changed;
 signature:='public.begin_creator_money_checkout(uuid,uuid)';
 original:=pg_get_functiondef(signature::regprocedure);
 changed:=replace(original,'if not private.native_production_checkout_current(d.qualification_id)',
  'if exists(select 1 from private.native_production_unlaunched_retirements r where r.dispatch_id=d.id) or not private.native_production_checkout_current(d.qualification_id)');
 if changed=original then raise exception 'native_retirement_claim_anchor'; end if; execute changed;
 signature:='public.resolve_native_production_witness_context(uuid,uuid,uuid,boolean)';
 original:=pg_get_functiondef(signature::regprocedure);
 changed:=replace(original,'if not private.native_production_checkout_current(q.id,p_recovery)',
  'if exists(select 1 from private.native_production_unlaunched_retirements r where r.dispatch_id=d.id) or not private.native_production_checkout_current(q.id,p_recovery)');
 if changed=original then raise exception 'native_retirement_witness_anchor'; end if; execute changed;
end $$;

create or replace function public.prepare_native_production_paid_video(p_video_id uuid,p_provider text,p_product_key text,p_provider_product_id text,p_amount_minor integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.native_production_checkout_dispatches; a private.native_production_video_admissions; i public.money_purchase_intents;
begin
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true then raise exception 'current_session_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('native-production-checkout-authority',0));
 perform private.lock_ordinary_purchase_source_subjects('paid_content',p_video_id);
 -- The same fence serializes claim and retirement. A lost successful claim
 -- response is not a failed claim and is never eligible for this insertion.
 insert into private.native_production_unlaunched_retirements(dispatch_id)
 select dispatch.id from private.native_production_checkout_dispatches dispatch
 join public.money_purchase_intents intent on intent.id=dispatch.intent_id
 where intent.user_id=auth.uid() and intent.source_type='paid_content'
 and (intent.source_id=p_video_id or (intent.provider=p_provider and intent.provider_product_id=p_provider_product_id))
 and intent.checkout_started_at is null and intent.checkout_attempt_id is null
 and not exists(select 1 from private.native_production_unlaunched_retirements r where r.dispatch_id=dispatch.id);
 select intent.* into i from public.money_purchase_intents intent
 join private.native_production_checkout_dispatches dispatch on dispatch.intent_id=intent.id
 where intent.user_id=auth.uid() and intent.source_type='paid_content' and intent.source_id=p_video_id
 and not exists(select 1 from private.native_production_unlaunched_retirements r where r.dispatch_id=dispatch.id)
 order by intent.created_at limit 1;
 if i.id is not null then
  select * into strict d from private.native_production_checkout_dispatches where intent_id=i.id;
  select * into strict a from private.native_production_video_admissions where id=d.admission_id;
  if exists(select 1 from private.native_production_checkout_access_bindings where dispatch_id=d.id) then
   return jsonb_build_object('alreadyPurchased',true,'id',i.id,'dispatchAllowed',false);
  end if;
  return jsonb_build_object('nativeProductionPending',true,'id',i.id,'dispatchId',d.id,'originalSessionId',a.session_id,
   'providerProductId',i.provider_product_id,'dispatchAllowed',false);
 end if;
 return public.prepare_native_production_paid_video_before_checkout(p_video_id,p_provider,p_product_key,p_provider_product_id,p_amount_minor);
end $$;

create function public.authorize_native_production_sdk_entry(p_dispatch_id uuid,p_buyer_id uuid,p_session_id uuid,p_preparation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare context jsonb;
begin
 context:=public.resolve_native_production_witness_context(p_dispatch_id,p_buyer_id,p_session_id,false);
 if context->>'checkoutStartedAt' is null or context#>>'{launchReady,preparationId}' is distinct from p_preparation_id::text
  or not exists(select 1 from private.native_production_checkout_dispatches d join private.native_production_video_admissions a on a.id=d.admission_id
   where d.id=p_dispatch_id and private.native_production_source_current(a.source_version_id,a.source_proof_id)
   and exists(select 1 from private.native_production_checkout_delivery_preflights p where p.admission_id=a.id
    and p.qualification_id=d.qualification_id and p.expires_at>clock_timestamp()))
 then raise exception 'native_sdk_entry_unclaimed'; end if;
 return jsonb_build_object('status','INVOKE_READY','dispatchId',p_dispatch_id,'preparationId',p_preparation_id);
end $$;
revoke all on function public.authorize_native_production_sdk_entry(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.authorize_native_production_sdk_entry(uuid,uuid,uuid,uuid) to service_role;

-- Persist only independently verified, signed Store facts. Purchase tokens,
-- raw device assertions and credentials never enter this durable retry queue.
create table private.native_production_verified_store_facts (
 dispatch_id uuid primary key references private.native_production_checkout_dispatches(id),
 verifier_key_id uuid not null references private.native_production_checkout_verifier_keys(id),
 assertion jsonb not null, signed_text text not null, signature_sha256 text not null,
 received_at timestamptz not null default clock_timestamp(),
 check(assertion=signed_text::jsonb and octet_length(signed_text)<=8192 and signature_sha256 ~ '^[0-9a-f]{64}$')
);
alter table private.native_production_verified_store_facts enable row level security;
alter table private.native_production_verified_store_facts force row level security;
revoke all on private.native_production_verified_store_facts from public,anon,authenticated,service_role;
create trigger native_store_facts_immutable before update or delete on private.native_production_verified_store_facts
 for each row execute function public.block_revenuecat_webhook_ingress_mutation_internal();
create trigger native_store_facts_fence before insert on private.native_production_verified_store_facts
 for each row execute function private.fence_native_production_checkout_authority();

create function private.native_production_google_pricing_valid(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare name text;
begin
 if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p))<>9
  or not p ?& array['protocol','listingMinor','paidTotalMinor','taxMinor','taxInclusive','adjustmentMinor','pointsPresent','pointsCouponMinor','allocation']
  or p->>'protocol' is distinct from 'google-orders-usd-v1' or p->>'allocation' is distinct from 'unknown'
  or jsonb_typeof(p->'taxInclusive') is distinct from 'boolean' or jsonb_typeof(p->'pointsPresent') is distinct from 'boolean'
 then return false; end if;
 foreach name in array array['listingMinor','paidTotalMinor','taxMinor','adjustmentMinor'] loop
  if jsonb_typeof(p->name) is distinct from 'number' or p->>name !~ '^(0|[1-9][0-9]{0,8})$' then return false; end if;
 end loop;
 if p->'pointsCouponMinor'<>'null'::jsonb and (jsonb_typeof(p->'pointsCouponMinor') is distinct from 'number'
  or p->>'pointsCouponMinor' !~ '^(0|[1-9][0-9]{0,8})$') then return false; end if;
 return (p->>'listingMinor')::bigint>0 and (p->>'taxMinor')::bigint<=(p->>'paidTotalMinor')::bigint
  and (p->>'adjustmentMinor')::bigint=(p->>'listingMinor')::bigint
   +case when (p->>'taxInclusive')::boolean then 0 else (p->>'taxMinor')::bigint end-(p->>'paidTotalMinor')::bigint;
end $$;

create function private.native_production_checkout_price_current(p_dispatch uuid,p_actual bigint) returns boolean
language sql volatile set search_path='' as $$
 select exists(select 1 from private.native_production_verified_store_facts f
 join private.native_production_checkout_dispatches d on d.id=f.dispatch_id
 join private.native_production_video_admissions a on a.id=d.admission_id
 join private.native_production_scope_qualifications s on s.id=a.scope_id
 join private.native_production_checkout_qualifications q on q.id=d.qualification_id
 join private.native_production_checkout_verifier_keys k on k.id=f.verifier_key_id and k.qualification_id=q.id
 join private.native_production_verified_witnesses w on w.dispatch_id=d.id
 where d.id=p_dispatch and s.provider='revenuecat_google_play' and private.native_production_google_pricing_valid(f.assertion->'pricing')
 and row(f.assertion->>'provider',f.assertion->>'environment',f.assertion->>'projectId',f.assertion->>'appId',f.assertion->>'storeAccountId',
  f.assertion->>'productId',f.assertion->>'buyerId',f.assertion->>'transactionId',f.assertion->>'evidenceSha256',f.assertion->>'currency',f.assertion->>'adapterVersion')
 is not distinct from row(s.provider,'production',s.project_id,s.app_id,s.store_account_id,s.provider_product_id,a.buyer_id::text,w.transaction_id,w.witness_sha256,a.currency,q.receipt_adapter)
 and f.assertion->'quantity'='1'::jsonb and a.quantity=1
 and (f.assertion->>'grossMinor')::bigint=p_actual and (f.assertion#>>'{pricing,paidTotalMinor}')::bigint=p_actual
 and (f.assertion#>>'{pricing,listingMinor}')::bigint=a.gross_minor
 and (f.assertion->>'verifiedAt')::timestamptz>=k.verified_at and (f.assertion->>'verifiedAt')::timestamptz<k.expires_at
 and not exists(select 1 from private.native_production_checkout_verifier_revocations r where r.key_id=k.id));
$$;
create function private.native_production_receipt_amount_binding_current(p_receipt uuid) returns boolean
language sql volatile set search_path='' as $$
 select exists(select 1 from private.native_production_purchase_correlations c
 join private.native_production_checkout_receipt_proofs p on p.canonical_receipt_id=c.canonical_receipt_id
 join private.native_production_checkout_dispatches d on d.id=p.dispatch_id and d.admission_id=c.admission_id
 join private.native_production_verified_store_facts f on f.dispatch_id=d.id
 where c.canonical_receipt_id=p_receipt and private.native_production_checkout_price_current(d.id,c.actual_gross_minor)
 and row(c.transaction_id,c.original_transaction_id,c.purchased_at,c.actual_gross_minor,c.quantity,c.evidence_sha256)
 is not distinct from row(p.transaction_id,p.original_transaction_id,p.purchased_at,p.gross_minor::bigint,p.quantity,p.evidence_sha256)
 and row(p.original_transaction_id,p.purchased_at) is not distinct from
  row(f.assertion->>'originalTransactionId',(f.assertion->>'purchasedAt')::timestamptz));
$$;
revoke all on function private.native_production_google_pricing_valid(jsonb),private.native_production_checkout_price_current(uuid,bigint),
 private.native_production_receipt_amount_binding_current(uuid) from public,anon,authenticated,service_role;

-- Zero buyer cash can be a legitimate fully discounted/points purchase. Only
-- exact signed Google pricing may bind that zero; it creates no zero economics.
do $$ declare target record; matched text; matches integer; begin
 for target in select * from (values
  ('private.native_production_checkout_receipt_proofs'::regclass,'gross_minor','native_store_paid_total_nonnegative'),
  ('private.native_production_purchase_correlations'::regclass,'actual_gross_minor','native_correlation_paid_total_nonnegative'))
  as targets(relation,column_name,new_name) loop
  -- PostgreSQL shortens generated constraint names by balancing table/column
  -- components. Identify this exact single-column >0 check, never guess a name
  -- or drop every constraint mentioning the amount.
  select count(*),min(c.conname) into matches,matched from pg_constraint c
  join pg_attribute a on a.attrelid=c.conrelid and a.attname=target.column_name and not a.attisdropped
  where c.conrelid=target.relation and c.contype='c' and c.conkey=array[a.attnum]::smallint[]
  and regexp_replace(pg_get_expr(c.conbin,c.conrelid),'[[:space:]()]','','g')=target.column_name||'>0';
  if matches<>1 then raise exception 'native_pricing_positive_constraint_missing_or_ambiguous'; end if;
  execute format('alter table %s drop constraint %I, add constraint %I check(%I>=0)',target.relation,matched,target.new_name,target.column_name);
 end loop;
end $$;
do $$ declare original text; changed text; begin
 original:=pg_get_functiondef('private.bind_native_production_checkout_receipt(uuid)'::regprocedure);
 changed:=replace(original,'a.buyer_id,a.gross_minor,a.currency,a.quantity,q.receipt_adapter',
  'a.buyer_id,case when private.native_production_checkout_price_current(d.id,proof.gross_minor) then proof.gross_minor else a.gross_minor end,a.currency,a.quantity,q.receipt_adapter');
 if changed=original then raise exception 'native_pricing_checkout_anchor'; end if; execute changed;
 original:=pg_get_functiondef('private.bind_native_production_sale(uuid)'::regprocedure);
 changed:=replace(original,'or c.actual_gross_minor<>a.gross_minor',
  'or (c.actual_gross_minor<>a.gross_minor and private.native_production_receipt_amount_binding_current(p_receipt) is distinct from true)');
 if changed=original then raise exception 'native_pricing_correlation_anchor'; end if; execute changed;
 original:=pg_get_functiondef('public.accept_native_production_paid_video_receipt(uuid,text,text)'::regprocedure);
 changed:=replace(original,'''^[1-9][0-9]{0,8}$''','''^(0|[1-9][0-9]{0,8})$''');
 if changed=original then raise exception 'native_pricing_receipt_anchor'; end if; execute changed;
end $$;

-- Apply after either the standalone ledger base or its signed-correction
-- wrapper. Actual paid gross is the financial identity, listing is the quote.
do $$ declare signature regprocedure; original text; changed text; begin
 signature:=coalesce(to_regprocedure('private.native_production_current_before_corrections(uuid)'),
  to_regprocedure('private.native_production_current_earning_domain_ready(uuid)'));
 original:=pg_get_functiondef(signature);
 changed:=replace(original,'source.source_id,a.currency,a.gross_minor)',
  'source.source_id,a.currency,correlation.actual_gross_minor)');
 if changed=original then raise exception 'native_pricing_money_identity_anchor'; end if;
 original:=changed;
 changed:=replace(changed,'or money.status<>',
  'or (correlation.actual_gross_minor<>a.gross_minor and private.native_production_receipt_amount_binding_current(link.canonical_receipt_id) is distinct from true) or money.status<>');
 if changed=original then raise exception 'native_pricing_money_guard_anchor'; end if; execute changed;
 original:=pg_get_functiondef('private.evaluate_native_production_economics(uuid)'::regprocedure);
 changed:=replace(original,'if fees+fee_tax+sales_tax+proceeds<>c.actual_gross_minor then',
  E'if exists(select 1 from private.native_production_verified_store_facts f join private.native_production_checkout_receipt_proofs p on p.dispatch_id=f.dispatch_id where p.canonical_receipt_id=p_receipt and f.assertion->''pricing''<>''null''::jsonb and (private.native_production_receipt_amount_binding_current(p_receipt) is distinct from true or sales_tax is distinct from (f.assertion#>>''{pricing,taxMinor}'')::bigint)) then reasons:=array_append(reasons,''authenticated_store_pricing_tax_mismatch''); end if;\n if fees+fee_tax+sales_tax+proceeds<>c.actual_gross_minor then');
 if changed=original then raise exception 'native_pricing_economics_anchor'; end if; execute changed;
end $$;

create function private.reconcile_native_production_store_facts(p_dispatch uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare stored private.native_production_verified_store_facts; facts jsonb; proof private.native_production_checkout_receipt_proofs;
 observation_id uuid; observations integer; grant_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('native-production-checkout-authority',0));
 select * into stored from private.native_production_verified_store_facts where dispatch_id=p_dispatch;
 if stored.dispatch_id is null then return jsonb_build_object('status','HELD','accessGranted',false,'financialAuthority',false,'payable',false); end if;
 facts:=stored.assertion;
 select count(*),min(o.canonical_receipt_id::text)::uuid into observations,observation_id
 from private.native_production_paid_video_observations o
 where row(o.provider,o.configured_project_id,o.reported_app_id,o.canonical_provider_product_id,o.buyer_id::text,o.transaction_id,o.original_transaction_id)
 is not distinct from row(facts->>'provider',facts->>'projectId',facts->>'appId',facts->>'productId',facts->>'buyerId',facts->>'transactionId',facts->>'originalTransactionId')
 and o.event_type in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE');
 if observations=1 then
  begin
   select * into proof from private.native_production_checkout_receipt_proofs where dispatch_id=p_dispatch;
   if proof.id is null then
    insert into private.native_production_checkout_receipt_proofs(id,verifier_key_id,dispatch_id,canonical_receipt_id,provider,environment,
     project_id,app_id,store_account_id,product_id,buyer_id,transaction_id,original_transaction_id,gross_minor,currency,quantity,purchased_at,
     adapter_version,evidence_sha256,verified_at)
    values(gen_random_uuid(),stored.verifier_key_id,p_dispatch,observation_id,facts->>'provider',facts->>'environment',facts->>'projectId',facts->>'appId',
     facts->>'storeAccountId',facts->>'productId',(facts->>'buyerId')::uuid,facts->>'transactionId',facts->>'originalTransactionId',
     (facts->>'grossMinor')::integer,facts->>'currency',1,(facts->>'purchasedAt')::timestamptz,facts->>'adapterVersion',facts->>'evidenceSha256',
     (facts->>'verifiedAt')::timestamptz) returning * into proof;
   end if;
   if proof.canonical_receipt_id<>observation_id then raise exception 'native_canonical_conflict'; end if;
   grant_id:=private.bind_native_production_checkout_receipt(proof.id);
  exception when others then
   -- Retain verified facts across current delivery/canonical/qualification
   -- holds. Nothing from the failed bind subtransaction is partially granted.
   grant_id:=null;
  end;
 end if;
 return jsonb_build_object('status',case when grant_id is null then 'HELD' else 'ACCESS_VERIFIED' end,
  'accessGranted',grant_id is not null,'financialAuthority',false,'payable',false);
end $$;
revoke all on function private.reconcile_native_production_store_facts(uuid) from public,anon,authenticated,service_role;

create function public.accept_native_production_verified_store_facts(p_key_id uuid,p_assertion text,p_signature_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare k private.native_production_checkout_verifier_keys; facts jsonb; d private.native_production_checkout_dispatches;
 prior private.native_production_verified_store_facts; a private.native_production_video_admissions; s private.native_production_scope_qualifications;
 q private.native_production_checkout_qualifications; at_time timestamptz; purchased timestamptz;
 keys text[]:=array['dispatchId','canonicalReceiptId','provider','environment','projectId','appId','storeAccountId','productId','buyerId',
 'transactionId','originalTransactionId','grossMinor','currency','quantity','purchasedAt','adapterVersion','evidenceSha256','verifiedAt','pricing'];
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('native-production-checkout-authority',0));
 if p_assertion is null or octet_length(p_assertion)>8192 then raise exception 'native_store_facts_invalid'; end if;
 select * into strict k from private.native_production_checkout_verifier_keys where id=p_key_id;
 if k.verified_at>clock_timestamp() or k.expires_at<=clock_timestamp()
  or exists(select 1 from private.native_production_checkout_verifier_revocations where key_id=k.id)
  or encode(extensions.hmac(convert_to(p_assertion,'UTF8'),k.verification_key,'sha256'),'hex') is distinct from p_signature_sha256
 then raise exception 'native_store_signature_invalid'; end if;
 facts:=p_assertion::jsonb;
 if jsonb_typeof(facts) is distinct from 'object' or not facts ?& keys or (select count(*) from jsonb_object_keys(facts))<>19
  or facts->'canonicalReceiptId' is distinct from 'null'::jsonb or facts->'quantity' is distinct from '1'::jsonb
  or jsonb_typeof(facts->'grossMinor') is distinct from 'number' or facts->>'grossMinor' !~ '^(0|[1-9][0-9]{0,8})$'
  or exists(select 1 from jsonb_each(facts) item where item.key not in ('canonicalReceiptId','grossMinor','quantity','pricing')
   and (jsonb_typeof(item.value) is distinct from 'string' or length(item.value#>>'{}') not between 1 and 512))
 then raise exception 'native_store_facts_invalid'; end if;
 select * into strict d from private.native_production_checkout_dispatches where id=(facts->>'dispatchId')::uuid and qualification_id=k.qualification_id;
 select * into strict a from private.native_production_video_admissions where id=d.admission_id;
 select * into strict s from private.native_production_scope_qualifications where id=a.scope_id;
 select * into strict q from private.native_production_checkout_qualifications where id=d.qualification_id;
 at_time:=(facts->>'verifiedAt')::timestamptz; purchased:=(facts->>'purchasedAt')::timestamptz;
 if not isfinite(at_time) or not isfinite(purchased) or at_time>clock_timestamp() or at_time<purchased
  or at_time<k.verified_at or at_time>=k.expires_at
  or row(facts->>'provider',facts->>'environment',facts->>'projectId',facts->>'appId',facts->>'storeAccountId',facts->>'productId',facts->>'buyerId',facts->>'currency',facts->>'adapterVersion')
  is distinct from row(s.provider,'production',s.project_id,s.app_id,s.store_account_id,s.provider_product_id,a.buyer_id::text,a.currency,q.receipt_adapter)
  or not exists(select 1 from private.native_production_verified_witnesses w where w.dispatch_id=d.id
   and w.transaction_id=facts->>'transactionId' and w.witness_sha256=facts->>'evidenceSha256')
 then raise exception 'native_store_facts_mismatch'; end if;
 if s.provider='revenuecat_google_play' then
  if private.native_production_google_pricing_valid(facts->'pricing') is distinct from true
   or (facts#>>'{pricing,listingMinor}')::bigint<>a.gross_minor
   or (facts#>>'{pricing,paidTotalMinor}')::bigint<>(facts->>'grossMinor')::bigint then raise exception 'native_store_pricing_invalid'; end if;
 elsif facts->'pricing' is distinct from 'null'::jsonb or (facts->>'grossMinor')::bigint<>a.gross_minor then raise exception 'native_store_pricing_invalid'; end if;
 select * into prior from private.native_production_verified_store_facts where dispatch_id=d.id;
 if prior.dispatch_id is null then
  insert into private.native_production_verified_store_facts(dispatch_id,verifier_key_id,assertion,signed_text,signature_sha256)
  values(d.id,k.id,facts,p_assertion,p_signature_sha256);
 elsif prior.assertion-'verifiedAt' is distinct from facts-'verifiedAt' then raise exception 'native_store_facts_conflict'; end if;
 return private.reconcile_native_production_store_facts(d.id);
end $$;
revoke all on function public.accept_native_production_verified_store_facts(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.accept_native_production_verified_store_facts(uuid,text,text) to service_role;

alter function public.reconcile_native_production_paid_video_access(uuid) rename to reconcile_native_production_paid_video_access_before_durable;
revoke all on function public.reconcile_native_production_paid_video_access_before_durable(uuid) from public,anon,authenticated,service_role;
create function public.reconcile_native_production_paid_video_access(p_canonical_receipt_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare dispatch uuid; result jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select f.dispatch_id into dispatch from private.native_production_verified_store_facts f
 join private.native_production_paid_video_observations o on o.canonical_receipt_id=p_canonical_receipt_id
 where row(o.provider,o.buyer_id::text,o.transaction_id,o.original_transaction_id,o.configured_project_id,o.reported_app_id,o.canonical_provider_product_id)
 is not distinct from row(f.assertion->>'provider',f.assertion->>'buyerId',f.assertion->>'transactionId',f.assertion->>'originalTransactionId',
  f.assertion->>'projectId',f.assertion->>'appId',f.assertion->>'productId');
 if dispatch is not null then return private.reconcile_native_production_store_facts(dispatch); end if;
 return public.reconcile_native_production_paid_video_access_before_durable(p_canonical_receipt_id);
end $$;
revoke all on function public.reconcile_native_production_paid_video_access(uuid) from public,anon,authenticated,service_role;
grant execute on function public.reconcile_native_production_paid_video_access(uuid) to service_role;

create function public.list_native_production_purchase_recovery(p_after uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rows jsonb;
begin
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true then raise exception 'current_session_required'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('dispatchId',pending.id,'originalSessionId',pending.session_id) order by pending.id),'[]'::jsonb) into rows
 from (select d.id,a.session_id from private.native_production_checkout_dispatches d
 join private.native_production_video_admissions a on a.id=d.admission_id
 join public.money_purchase_intents i on i.id=d.intent_id
 where a.buyer_id=auth.uid() and i.checkout_started_at is not null and (p_after is null or d.id>p_after)
 and not exists(select 1 from private.native_production_checkout_access_bindings b where b.dispatch_id=d.id)
 order by d.id limit 10) pending;
 return jsonb_build_object('dispatches',rows,'nextCursor',case when jsonb_array_length(rows)=10 then rows->9->>'dispatchId' else null end);
end $$;
revoke all on function public.list_native_production_purchase_recovery(uuid) from public,anon,authenticated,service_role;
grant execute on function public.list_native_production_purchase_recovery(uuid) to authenticated;
create function public.reconcile_native_production_dispatch(p_dispatch_id uuid,p_buyer_id uuid,p_session_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.resolve_native_production_witness_context(p_dispatch_id,p_buyer_id,p_session_id,true);
 return private.reconcile_native_production_store_facts(p_dispatch_id);
end $$;
revoke all on function public.reconcile_native_production_dispatch(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.reconcile_native_production_dispatch(uuid,uuid,uuid) to service_role;
