-- Ordinary production Paid Video checkout. Source-only, independently OFF.
-- Held admissions are evidence, never dispatch permission. No real provider,
-- SDK, byte, delivery or signature qualification is installed by this file.
create table private.native_production_checkout_controls (
 singleton boolean primary key default true check(singleton),
 checkout_enabled boolean not null default false,
 access_enabled boolean not null default false
);
insert into private.native_production_checkout_controls default values;

create table private.native_production_checkout_qualifications (
 id uuid primary key default gen_random_uuid(),
 scope_id uuid not null references private.native_production_scope_qualifications(id),
 configuration_sha256 text not null check(configuration_sha256 ~ '^[0-9a-f]{64}$'),
 application_id text not null check(length(btrim(application_id)) between 1 and 256),
 native_build text not null check(length(btrim(native_build)) between 1 and 128),
 sdk_version text not null check(length(btrim(sdk_version)) between 1 and 128),
 delivery_adapter text not null check(length(btrim(delivery_adapter)) between 1 and 128),
 receipt_adapter text not null check(length(btrim(receipt_adapter)) between 1 and 128),
 evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 verified_at timestamptz not null, expires_at timestamptz not null,
 check(isfinite(verified_at) and isfinite(expires_at) and expires_at>verified_at)
);
create table private.native_production_checkout_revocations (
 qualification_id uuid primary key references private.native_production_checkout_qualifications(id),
 revoked_at timestamptz not null default clock_timestamp()
);
-- Unprovisioned secrets for the independently qualified verification adapter.
-- No value, public issuer, or deployment action is included in source.
create table private.native_production_checkout_verifier_keys (
 id uuid primary key default gen_random_uuid(),
 qualification_id uuid not null references private.native_production_checkout_qualifications(id),
 verification_key bytea not null check(octet_length(verification_key)>=32),
 verified_at timestamptz not null, expires_at timestamptz not null,
 check(isfinite(verified_at) and isfinite(expires_at) and expires_at>verified_at)
);
create table private.native_production_checkout_verifier_revocations (
 key_id uuid primary key references private.native_production_checkout_verifier_keys(id),
 revoked_at timestamptz not null default clock_timestamp()
);
create table private.native_production_checkout_dispatches (
 id uuid primary key default gen_random_uuid(),
 admission_id uuid not null unique references private.native_production_video_admissions(id),
 intent_id uuid not null unique references public.money_purchase_intents(id) deferrable initially deferred,
 qualification_id uuid not null references private.native_production_checkout_qualifications(id),
 created_at timestamptz not null default clock_timestamp()
);
create table private.native_production_checkout_delivery_preflights (
 id uuid primary key default gen_random_uuid(),
 admission_id uuid not null references private.native_production_video_admissions(id),
 qualification_id uuid not null references private.native_production_checkout_qualifications(id),
 observed_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '30 seconds'
);
-- Empty release/runtime attestation qualifications. A product/scope flag alone
-- cannot make the receipt issuer or a native build qualified.
create table private.native_production_witness_configurations (
 qualification_id uuid primary key references private.native_production_checkout_qualifications(id),
 apple_team_id text, apple_app_id bigint, google_certificate_sha256 text,
 google_account_binding text check(google_account_binding='sha256-stable-revenuecat-user'),
 evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$')
);
create table private.native_production_witness_challenges (
 dispatch_id uuid primary key references private.native_production_checkout_dispatches(id),
 challenge text not null unique default encode(extensions.gen_random_bytes(32),'hex'),
 created_at timestamptz not null default clock_timestamp()
);
create table private.native_production_witness_enrollments (
 id uuid primary key default gen_random_uuid(),
 qualification_id uuid not null references private.native_production_checkout_qualifications(id),
 buyer_id uuid not null, session_id uuid not null,
 challenge text not null unique default encode(extensions.gen_random_bytes(32),'hex'),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '5 minutes'
);
create table private.native_production_witness_keys (
 key_id text primary key, enrollment_id uuid not null unique references private.native_production_witness_enrollments(id),
 public_key text not null, evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 verified_at timestamptz not null default clock_timestamp()
);
create table private.native_production_witness_key_revocations (
 key_id text primary key references private.native_production_witness_keys(key_id),
 revoked_at timestamptz not null default clock_timestamp()
);
create table private.native_production_verified_witnesses (
 dispatch_id uuid primary key references private.native_production_checkout_dispatches(id),
 witness_sha256 text not null unique check(witness_sha256 ~ '^[0-9a-f]{64}$'),
 key_id text references private.native_production_witness_keys(key_id),
 counter bigint check(counter between 1 and 4294967295),
 transaction_id text not null, launched_at timestamptz not null, launch_upper_at timestamptz, completed_at timestamptz not null,
 verified_at timestamptz not null default clock_timestamp(),
 check((key_id is null)=(counter is null)), unique(key_id,counter)
);
create table private.native_production_native_launch_ready (
 dispatch_id uuid primary key references private.native_production_checkout_dispatches(id),
 preparation_id uuid not null unique, prepared_sha256 text not null check(prepared_sha256 ~ '^[0-9a-f]{64}$'),
 key_id text references private.native_production_witness_keys(key_id),
 server_received_at timestamptz not null default clock_timestamp(),
 elapsed_limit_ms integer not null check(elapsed_limit_ms between 1 and 300000)
);
create table private.native_production_native_assertion_counters (
 key_id text not null references private.native_production_witness_keys(key_id),
 counter bigint not null check(counter between 1 and 4294967295),
 dispatch_id uuid not null references private.native_production_checkout_dispatches(id),
 phase text not null check(phase in ('prepared','completed')),
 evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 primary key(key_id,counter),unique(dispatch_id,phase)
);
-- An independently verified issuer writes these records, not a client SDK
-- callback. There is no generic API INSERT grant or JSON qualification issuer.
create table private.native_production_checkout_receipt_proofs (
 id uuid primary key default gen_random_uuid(),
 verifier_key_id uuid not null references private.native_production_checkout_verifier_keys(id),
 dispatch_id uuid not null unique references private.native_production_checkout_dispatches(id),
 canonical_receipt_id uuid not null unique references private.native_production_paid_video_observations(canonical_receipt_id),
 provider text not null, environment text not null check(environment='production'),
 project_id text not null, app_id text not null, store_account_id text not null,
 product_id text not null, buyer_id uuid not null,
 transaction_id text not null, original_transaction_id text not null,
 gross_minor integer not null check(gross_minor>0), currency text not null check(currency='usd'),
 quantity integer not null check(quantity=1), purchased_at timestamptz not null,
 adapter_version text not null, evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 verified_at timestamptz not null default clock_timestamp(),
 check(isfinite(purchased_at) and isfinite(verified_at)),
 check(length(btrim(transaction_id)) between 1 and 512),
 check(length(btrim(original_transaction_id)) between 1 and 512)
);
create table private.native_production_checkout_access_bindings (
 dispatch_id uuid primary key references private.native_production_checkout_dispatches(id),
 receipt_proof_id uuid not null unique references private.native_production_checkout_receipt_proofs(id),
 access_grant_id uuid not null unique references public.access_grants(id) deferrable initially deferred,
 created_at timestamptz not null default clock_timestamp()
);
do $$ declare t text; begin
 foreach t in array array['native_production_checkout_controls','native_production_checkout_qualifications',
  'native_production_checkout_revocations','native_production_checkout_dispatches','native_production_checkout_receipt_proofs',
  'native_production_checkout_access_bindings','native_production_checkout_verifier_keys','native_production_checkout_verifier_revocations',
  'native_production_checkout_delivery_preflights','native_production_witness_configurations',
  'native_production_witness_challenges','native_production_witness_enrollments','native_production_witness_keys',
  'native_production_witness_key_revocations','native_production_verified_witnesses',
  'native_production_native_launch_ready','native_production_native_assertion_counters'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  if t<>'native_production_checkout_controls' then
   execute format('create trigger %I before update or delete on private.%I for each row execute function public.block_revenuecat_webhook_ingress_mutation_internal()',t||'_immutable',t);
  end if;
 end loop;
end $$;

create function private.native_production_checkout_current(p_qualification uuid,p_access boolean default false)
returns boolean language sql volatile set search_path='' as $$
 select exists(select 1 from private.native_production_checkout_qualifications q
 join private.native_production_scope_qualifications s on s.id=q.scope_id
 cross join private.native_production_checkout_controls controls
 where q.id=p_qualification
 and case when p_access then controls.access_enabled else controls.checkout_enabled end
 and q.verified_at<=clock_timestamp() and q.expires_at>clock_timestamp()
 and private.native_production_scope_current(s.id)
 and q.delivery_adapter='native-production-etag-range-v1'
 and q.receipt_adapter='native-attested-store-v1'
 and exists(select 1 from private.native_production_witness_configurations w where w.qualification_id=q.id
   and case when s.provider='revenuecat_app_store' then length(w.apple_team_id)=10 and w.apple_app_id>0
    else w.google_certificate_sha256 is not null and w.google_account_binding='sha256-stable-revenuecat-user' end)
 and (p_access or exists(select 1 from private.native_production_checkout_verifier_keys key_row
   where key_row.qualification_id=q.id and key_row.verified_at<=clock_timestamp() and key_row.expires_at>clock_timestamp()
    and not exists(select 1 from private.native_production_checkout_verifier_revocations where key_id=key_row.id)))
 and not exists(select 1 from private.native_production_checkout_revocations where qualification_id=q.id)
 and q.id=(select newest.id from private.native_production_checkout_qualifications newest
   where newest.scope_id=q.scope_id and newest.configuration_sha256=q.configuration_sha256
   order by newest.verified_at desc,newest.id desc limit 1)
 and (select count(*) from private.native_production_checkout_qualifications tied
   where tied.scope_id=q.scope_id and tied.configuration_sha256=q.configuration_sha256 and tied.verified_at=q.verified_at)=1
 and (p_access or (select count(*) from public.platform_money_kill_switches where key in
   ('live_money_enabled','provider_webhooks_enabled','digital_sales_enabled','paid_content_enabled','creator_monetization_enabled',s.provider||'_enabled') and state='on')=6));
$$;

create function public.get_native_production_paid_video_capability(p_provider text,p_provider_product_id text,p_configuration_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q private.native_production_checkout_qualifications;
begin
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
 then raise exception 'current_session_required'; end if;
 select qualification.* into q from private.native_production_checkout_qualifications qualification
 join private.native_production_scope_qualifications scope on scope.id=qualification.scope_id
 where scope.provider=p_provider and scope.provider_product_id=p_provider_product_id
 and qualification.configuration_sha256=p_configuration_sha256
 order by qualification.verified_at desc,qualification.id desc limit 1;
 return jsonb_build_object('protocol','native-production-checkout-v1','environment','production',
  'enabled',coalesce(private.native_production_checkout_current(q.id),false),
  'dispatchAllowed',false,'financialAuthority',false);
end $$;
revoke all on function public.get_native_production_paid_video_capability(text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.get_native_production_paid_video_capability(text,text,text) to authenticated;

-- Expand representation only for the independently guarded Paid Video lane.
-- Every old auction predicate is retained verbatim.
alter table public.money_purchase_intents drop constraint money_purchase_intents_sandbox_only_check;
alter table public.money_purchase_intents add constraint money_purchase_intents_sandbox_only_check
 check(environment<>'production' or (provider='stripe_event_auction' and product_type='event_pass' and source_type='event')
  or (provider='stripe_room_auction' and product_type='room_seat_pass' and source_type='room_seat_auction')
  or (provider in ('revenuecat_app_store','revenuecat_google_play') and product_type='paid_content_access' and source_type='paid_content'));

create function private.guard_native_production_checkout_intent() returns trigger
language plpgsql security definer set search_path='' as $$
declare d private.native_production_checkout_dispatches; a private.native_production_video_admissions;
 s private.native_production_scope_qualifications; v private.native_production_video_versions;
begin
 if new.environment<>'production' or new.provider not in ('revenuecat_app_store','revenuecat_google_play')
  or new.source_type<>'paid_content' then return new; end if;
 select * into d from private.native_production_checkout_dispatches where intent_id=new.id;
 select * into a from private.native_production_video_admissions where id=d.admission_id;
 select * into s from private.native_production_scope_qualifications where id=a.scope_id;
 select * into v from private.native_production_video_versions where id=a.source_version_id;
 if d.id is null or a.id is null or not private.native_production_checkout_current(d.qualification_id)
  or a.expires_at<=clock_timestamp() or not private.native_production_source_current(a.source_version_id,a.source_proof_id)
  or not exists(select 1 from private.native_production_source_proofs proof where proof.id=a.source_proof_id
   and proof.origin_provider in ('s3','cloudflare_r2') and proof.origin_generation ~ '^"[0-9a-f]{32}(-[1-9][0-9]*)?"$')
  or not exists(select 1 from public.videos video where video.id=v.source_id and video.mime_type='video/mp4')
  or not exists(select 1 from private.native_production_checkout_delivery_preflights preflight
   where preflight.admission_id=a.id and preflight.qualification_id=d.qualification_id and preflight.expires_at>clock_timestamp())
  or row(new.user_id,new.creator_id,new.source_id,new.product_id,new.product_key,new.provider,new.provider_product_id,new.amount_minor,new.currency,new.session_generation,new.created_at,new.expires_at)
   is distinct from row(a.buyer_id,a.creator_id,v.source_id,a.catalog_product_id,a.product_key,s.provider,s.provider_product_id,a.gross_minor,a.currency,a.session_id::text,a.created_at,a.expires_at)
 then raise exception 'native_production_checkout_intent_unqualified'; end if;
 return new;
end $$;
create trigger guard_native_production_checkout_intent before insert on public.money_purchase_intents
 for each row execute function private.guard_native_production_checkout_intent();

create function public.create_native_production_paid_video_intent(p_admission_id uuid,p_configuration_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.native_production_video_admissions; q private.native_production_checkout_qualifications;
 s private.native_production_scope_qualifications; v private.native_production_video_versions;
 d private.native_production_checkout_dispatches; i public.money_purchase_intents; preparation jsonb; intent_id uuid:=gen_random_uuid();
begin
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
 then raise exception 'current_session_required'; end if;
 select * into a from private.native_production_video_admissions where id=p_admission_id and buyer_id=auth.uid()
  and session_id::text=auth.jwt()->>'session_id';
 if a.id is null then raise exception 'native_production_admission_unavailable'; end if;
 select * into v from private.native_production_video_versions where id=a.source_version_id;
 perform private.lock_ordinary_purchase_source_subjects('paid_content',v.source_id);
 perform pg_advisory_xact_lock(hashtextextended('creator-money-source-intent:'||a.buyer_id::text||':paid_content:'||v.source_id::text,0));
 -- An admission expiring is not proof a Store charge failed. Retain the exact
 -- original dispatch until an independently verified terminal outcome exists.
 select intent.* into i from public.money_purchase_intents intent
 join private.native_production_checkout_dispatches original on original.intent_id=intent.id
 where intent.user_id=a.buyer_id and intent.source_type='paid_content'
 and (intent.source_id=v.source_id or (intent.provider_product_id=(select provider_product_id from private.native_production_scope_qualifications where id=a.scope_id)
  and intent.provider=(select provider from private.native_production_scope_qualifications where id=a.scope_id)
  and not exists(select 1 from private.native_production_checkout_access_bindings bound where bound.dispatch_id=original.id)))
 and original.admission_id<>a.id order by intent.created_at limit 1;
 if i.id is not null then raise exception 'native_production_prior_dispatch_requires_recovery'; end if;
 select * into s from private.native_production_scope_qualifications where id=a.scope_id;
 select * into q from private.native_production_checkout_qualifications where scope_id=a.scope_id
  and configuration_sha256=p_configuration_sha256 order by verified_at desc,id desc limit 1;
 if not coalesce(private.native_production_checkout_current(q.id),false)
  or not private.native_production_source_current(a.source_version_id,a.source_proof_id)
  or a.expires_at<=clock_timestamp() then raise exception 'native_production_checkout_unqualified'; end if;
 select * into d from private.native_production_checkout_dispatches where admission_id=a.id;
 if d.id is not null then
  if d.qualification_id<>q.id then raise exception 'native_production_configuration_changed'; end if;
  select * into strict i from public.money_purchase_intents where id=d.intent_id;
  return public.money_purchase_intent_safe_row(i)||jsonb_build_object('alreadyPurchased',false,'nativeProductionDispatchId',d.id,'dispatchAllowed',false);
 end if;
 preparation:=public.prepare_native_production_paid_video(v.source_id,s.provider,a.product_key,s.provider_product_id,a.gross_minor);
 if preparation->>'alreadyPurchased'='true' then return preparation; end if;
 if preparation->'nativeProductionPreparation'->>'admissionId' is distinct from a.id::text
  or preparation->'nativeProductionPreparation'->>'quoteSha256' is distinct from a.quote_sha256
 then raise exception 'native_production_admission_changed'; end if;
 insert into private.native_production_checkout_dispatches(admission_id,intent_id,qualification_id)
 values(a.id,intent_id,q.id) returning * into d;
 insert into public.money_purchase_intents(id,user_id,product_id,product_key,product_type,provider,provider_product_id,
  source_type,source_id,creator_id,environment,status,amount_minor,currency,idempotency_key,expires_at,created_at,session_generation,metadata)
 values(intent_id,a.buyer_id,a.catalog_product_id,a.product_key,'paid_content_access',s.provider,s.provider_product_id,
  'paid_content',v.source_id,a.creator_id,'production','pending',a.gross_minor,a.currency,'native-production:'||a.id::text,
  a.expires_at,a.created_at,a.session_id::text,jsonb_build_object('native_production_dispatch_id',d.id)) returning * into i;
 return public.money_purchase_intent_safe_row(i)||jsonb_build_object('alreadyPurchased',false,'nativeProductionDispatchId',d.id,'dispatchAllowed',false);
end $$;
revoke all on function public.create_native_production_paid_video_intent(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.create_native_production_paid_video_intent(uuid,text) to authenticated;

create function public.claim_native_production_paid_video_checkout(p_intent_id uuid,p_attempt_id uuid,p_configuration_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.native_production_checkout_dispatches; a private.native_production_video_admissions;
 q private.native_production_checkout_qualifications; result jsonb;
begin
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
 then raise exception 'current_session_required'; end if;
 select * into d from private.native_production_checkout_dispatches where intent_id=p_intent_id;
 select * into a from private.native_production_video_admissions where id=d.admission_id;
 select * into q from private.native_production_checkout_qualifications where id=d.qualification_id;
 if a.buyer_id is distinct from auth.uid() or a.session_id::text is distinct from auth.jwt()->>'session_id'
  or q.configuration_sha256 is distinct from p_configuration_sha256
  or not coalesce(private.native_production_checkout_current(q.id),false)
  or not private.native_production_source_current(a.source_version_id,a.source_proof_id)
  or a.expires_at<=clock_timestamp()
  or not exists(select 1 from private.native_production_checkout_delivery_preflights preflight
   where preflight.admission_id=a.id and preflight.qualification_id=q.id and preflight.expires_at>clock_timestamp())
 then raise exception 'native_production_checkout_unqualified'; end if;
 -- Reuse ordinary legal/audience/creator/quote/session/source authority and its
 -- durable one-shot ownership. Every replay returns startAuthorized=false.
 result:=public.begin_creator_money_checkout(p_intent_id,p_attempt_id);
 return result||jsonb_build_object('protocol','native-production-checkout-v1','nativeProductionDispatchId',d.id,
  'configurationSha256',q.configuration_sha256,'quoteSha256',a.quote_sha256,
  'dispatchAllowed',coalesce((result->>'startAuthorized')::boolean,false),'financialAuthority',false);
end $$;
revoke all on function public.claim_native_production_paid_video_checkout(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.claim_native_production_paid_video_checkout(uuid,uuid,text) to authenticated;

create function private.native_production_checkout_access_current(p_dispatch uuid)
returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from private.native_production_checkout_dispatches d
 join private.native_production_video_admissions a on a.id=d.admission_id
 join private.native_production_checkout_receipt_proofs proof on proof.dispatch_id=d.id
 join private.native_production_scope_qualifications scope on scope.id=a.scope_id
 join private.native_production_purchase_correlations correlation on correlation.canonical_receipt_id=proof.canonical_receipt_id and correlation.admission_id=a.id
 where d.id=p_dispatch and private.native_production_checkout_current(d.qualification_id,true)
 and exists(select 1 from private.native_production_verified_witnesses witness where witness.dispatch_id=d.id
  and witness.witness_sha256=proof.evidence_sha256 and witness.transaction_id=proof.transaction_id
  and (witness.key_id is null or not exists(select 1 from private.native_production_witness_key_revocations revoked where revoked.key_id=witness.key_id)))
 and exists(select 1 from private.native_production_checkout_verifier_keys key_row
  where key_row.id=proof.verifier_key_id and key_row.qualification_id=d.qualification_id
  and key_row.verified_at<=proof.verified_at and key_row.expires_at>proof.verified_at
  and not exists(select 1 from private.native_production_checkout_verifier_revocations where key_id=key_row.id))
 and not exists(select 1 from private.native_production_checkout_access_bindings binding join public.access_grants grant_row
  on grant_row.id=binding.access_grant_id where binding.dispatch_id=d.id
  and (grant_row.status<>'active' or grant_row.refunded_at is not null or grant_row.revoked_at is not null
   or (grant_row.expires_at is not null and grant_row.expires_at<=clock_timestamp())))
 and private.native_production_source_current(a.source_version_id,a.source_proof_id)
 and not public.is_account_access_restricted(a.buyer_id::text)
 and not public.is_account_access_restricted(a.creator_id::text)
 and not public.is_creator_video_viewer_blocked(a.creator_id::text,a.buyer_id::text)
 and not public.revenuecat_authority_quarantined_internal(scope.provider,a.buyer_id,'production')
 and not exists(select 1 from private.native_production_paid_video_observations negative
   where negative.provider=scope.provider and negative.original_transaction_id=proof.original_transaction_id
    and (row(negative.buyer_id,negative.configured_project_id,negative.reported_app_id,negative.canonical_provider_product_id,negative.transaction_id)
      is distinct from row(a.buyer_id,proof.project_id,proof.app_id,proof.product_id,proof.transaction_id)
     or negative.event_type not in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE')))
 and not exists(select 1 from public.revenuecat_unbound_terminal_authority negative
   where negative.provider=scope.provider and negative.original_transaction_id=proof.original_transaction_id and negative.environment='production')
 and not exists(select 1 from public.revenuecat_premium_transaction_authority other
   where other.provider=scope.provider and other.original_transaction_id=proof.original_transaction_id)
 and not exists(select 1 from public.revenuecat_consumable_transaction_intents other
   where other.provider=scope.provider and other.original_transaction_id=proof.original_transaction_id));
$$;

-- The boundary consumes an independently authenticated proof RECORD, not a
-- client admission/transaction UUID. All correlation facts are derived below.
create function private.bind_native_production_checkout_receipt(p_proof_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare proof private.native_production_checkout_receipt_proofs; d private.native_production_checkout_dispatches;
 a private.native_production_video_admissions; s private.native_production_scope_qualifications;
 q private.native_production_checkout_qualifications; o private.native_production_paid_video_observations;
 i public.money_purchase_intents; v private.native_production_video_versions; grant_id uuid:=gen_random_uuid(); existing uuid;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('native-production-checkout-authority',0))
 then raise exception 'native_production_checkout_authority_busy'; end if;
 select * into strict proof from private.native_production_checkout_receipt_proofs where id=p_proof_id;
 select * into strict d from private.native_production_checkout_dispatches where id=proof.dispatch_id;
 select * into strict a from private.native_production_video_admissions where id=d.admission_id;
 select * into strict s from private.native_production_scope_qualifications where id=a.scope_id;
 select * into strict q from private.native_production_checkout_qualifications where id=d.qualification_id;
 select * into strict o from private.native_production_paid_video_observations where canonical_receipt_id=proof.canonical_receipt_id;
 select * into strict i from public.money_purchase_intents where id=d.intent_id for update;
 select * into strict v from private.native_production_video_versions where id=a.source_version_id;
 if row(proof.provider,proof.environment,proof.project_id,proof.app_id,proof.store_account_id,proof.product_id,proof.buyer_id,proof.gross_minor,proof.currency,proof.quantity,proof.adapter_version)
  is distinct from row(s.provider,'production',s.project_id,s.app_id,s.store_account_id,s.provider_product_id,a.buyer_id,a.gross_minor,a.currency,a.quantity,q.receipt_adapter)
  or row(o.provider,o.configured_project_id,o.reported_app_id,o.canonical_provider_product_id,o.buyer_id,o.transaction_id,o.original_transaction_id)
   is distinct from row(proof.provider,proof.project_id,proof.app_id,proof.product_id,proof.buyer_id,proof.transaction_id,proof.original_transaction_id)
  or o.event_type not in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE')
  or i.checkout_attempt_id is null or i.checkout_started_at is null
  or proof.purchased_at<i.checkout_started_at or proof.purchased_at<a.created_at or proof.purchased_at>=a.expires_at
  or proof.verified_at<proof.purchased_at or proof.verified_at>clock_timestamp()
  or q.verified_at>i.checkout_started_at or q.expires_at<=proof.purchased_at
 then raise exception 'native_production_checkout_receipt_mismatch'; end if;
 -- Ledger's trigger independently checks canonical catalog, source history,
 -- price, legal acceptance and immutable transaction uniqueness.
 if not exists(select 1 from private.native_production_purchase_correlations where canonical_receipt_id=proof.canonical_receipt_id) then
  insert into private.native_production_purchase_correlations(canonical_receipt_id,admission_id,transaction_id,original_transaction_id,
   purchased_at,actual_gross_minor,quantity,evidence_sha256,adapter_version,verified_at)
  values(proof.canonical_receipt_id,a.id,proof.transaction_id,proof.original_transaction_id,proof.purchased_at,
   proof.gross_minor,proof.quantity,proof.evidence_sha256,proof.adapter_version,proof.verified_at);
 elsif not exists(select 1 from private.native_production_purchase_correlations c where c.canonical_receipt_id=proof.canonical_receipt_id
  and row(c.admission_id,c.transaction_id,c.original_transaction_id,c.purchased_at,c.actual_gross_minor,c.quantity,c.evidence_sha256,c.adapter_version)
   is not distinct from row(a.id,proof.transaction_id,proof.original_transaction_id,proof.purchased_at,proof.gross_minor::bigint,proof.quantity,proof.evidence_sha256,proof.adapter_version))
 then raise exception 'native_production_correlation_conflict'; end if;
 -- Receipt binding can be retained while delivery is held. Unknown economics
 -- never block or create independently qualified access, nor become payable.
 if not private.native_production_checkout_access_current(d.id) then return null; end if;
 select access_grant_id into existing from private.native_production_checkout_access_bindings where dispatch_id=d.id;
 if existing is not null then return existing; end if;
 insert into private.native_production_checkout_access_bindings(dispatch_id,receipt_proof_id,access_grant_id)
 values(d.id,proof.id,grant_id);
 insert into public.access_grants(id,user_id,grant_type,source_type,source_id,product_id,provider,provider_event_id,environment,status,starts_at,metadata)
 values(grant_id,a.buyer_id,'paid_content_access','provider_event',v.source_id,a.catalog_product_id,s.provider,proof.canonical_receipt_id,
  'production','active',proof.purchased_at,jsonb_build_object('native_production_dispatch_id',d.id,'purchase_intent_id',i.id,'original_transaction_id',proof.original_transaction_id));
 update public.money_purchase_intents set status='consumed',consumed_at=clock_timestamp() where id=i.id and status in ('pending','expired');
 return grant_id;
end $$;
revoke all on function private.bind_native_production_checkout_receipt(uuid),private.native_production_checkout_access_current(uuid)
 from public,anon,authenticated,service_role;

create function public.reconcile_native_production_paid_video_access(p_canonical_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare proof_id uuid; grant_id uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select id into proof_id from private.native_production_checkout_receipt_proofs where canonical_receipt_id=p_canonical_receipt_id;
 if proof_id is not null then grant_id:=private.bind_native_production_checkout_receipt(proof_id); end if;
 return jsonb_build_object('status',case when grant_id is null then 'HELD' else 'ACCESS_VERIFIED' end,
  'accessGranted',grant_id is not null,'financialAuthority',false,'payable',false);
end $$;
revoke all on function public.reconcile_native_production_paid_video_access(uuid) from public,anon,authenticated,service_role;
grant execute on function public.reconcile_native_production_paid_video_access(uuid) to service_role;

-- No source path leaves the authenticated public playback descriptor. Each
-- HTTP range fetch independently resolves service-only exact origin authority.
create function public.get_native_production_paid_video_playback(p_video_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.native_production_checkout_dispatches; a private.native_production_video_admissions;
 proof private.native_production_source_proofs; grant_id uuid;
begin
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
 then raise exception 'current_session_required'; end if;
 select dispatch.* into d from private.native_production_checkout_dispatches dispatch
 join public.money_purchase_intents i on i.id=dispatch.intent_id
 join private.native_production_checkout_access_bindings binding on binding.dispatch_id=dispatch.id
 where i.user_id=auth.uid() and i.source_id=p_video_id order by i.created_at limit 1;
 if d.id is null then return null; end if;
 if not private.native_production_checkout_access_current(d.id) then
  return jsonb_build_object('protocol','native-production-playback-v1','status','HELD','videoId',p_video_id);
 end if;
 select * into strict a from private.native_production_video_admissions where id=d.admission_id;
 select * into strict proof from private.native_production_source_proofs where id=a.source_proof_id;
 select access_grant_id into strict grant_id from private.native_production_checkout_access_bindings where dispatch_id=d.id;
 return jsonb_build_object('protocol','native-production-playback-v1','status','READY','videoId',p_video_id,'grantId',grant_id,
  'sourceVersionId',a.source_version_id,'assetSha256',proof.asset_sha256,'byteLength',proof.byte_length,'adapter','native-production-etag-range-v1');
end $$;
revoke all on function public.get_native_production_paid_video_playback(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_native_production_paid_video_playback(uuid) to authenticated;

create function public.resolve_native_production_paid_video_origin(p_video_id uuid,p_grant_id uuid,p_buyer_id uuid,p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.native_production_checkout_dispatches; a private.native_production_video_admissions;
 proof private.native_production_source_proofs; q private.native_production_checkout_qualifications; until_at timestamptz;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if not public.creator_tip_buyer_session_authority_internal(p_buyer_id,p_session_id) then return null; end if;
 select dispatch.* into d from private.native_production_checkout_dispatches dispatch
 join private.native_production_checkout_access_bindings binding on binding.dispatch_id=dispatch.id
 join public.money_purchase_intents i on i.id=dispatch.intent_id
 where binding.access_grant_id=p_grant_id and i.user_id=p_buyer_id and i.source_id=p_video_id;
 if d.id is null or not private.native_production_checkout_access_current(d.id) then return null; end if;
 select * into strict a from private.native_production_video_admissions where id=d.admission_id;
 select * into strict q from private.native_production_checkout_qualifications where id=d.qualification_id;
 select * into strict proof from private.native_production_source_proofs where version_id=a.source_version_id order by verified_at desc,id desc limit 1;
 if proof.origin_provider not in ('s3','cloudflare_r2') or proof.origin_generation !~ '^"[0-9a-f]{32}(-[1-9][0-9]*)?"$'
  or not exists(select 1 from public.videos where id=p_video_id and mime_type='video/mp4') then return null; end if;
 until_at:=least(clock_timestamp()+interval '5 seconds',proof.expires_at,q.expires_at,
  (select not_after from auth.sessions where id=p_session_id and user_id=p_buyer_id));
 if until_at<=clock_timestamp() then return null; end if;
 return jsonb_build_object('protocol','native-production-origin-v1','videoId',p_video_id,'grantId',p_grant_id,
  'buyerId',p_buyer_id,'sessionId',p_session_id,'sourceVersionId',a.source_version_id,
  'provider',proof.origin_provider,'bucket',proof.origin_bucket,'objectKey',proof.origin_object,'generation',proof.origin_generation,
  'assetSha256',proof.asset_sha256,'byteLength',proof.byte_length,'validUntilMs',floor(extract(epoch from until_at)*1000)::bigint);
end $$;
revoke all on function public.resolve_native_production_paid_video_origin(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.resolve_native_production_paid_video_origin(uuid,uuid,uuid,uuid) to service_role;

create function public.resolve_native_production_checkout_preflight(p_admission_id uuid,p_buyer_id uuid,p_session_id uuid,p_configuration_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.native_production_video_admissions; proof private.native_production_source_proofs; q private.native_production_checkout_qualifications;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if not public.creator_tip_buyer_session_authority_internal(p_buyer_id,p_session_id) then return null; end if;
 select * into a from private.native_production_video_admissions where id=p_admission_id and buyer_id=p_buyer_id and session_id=p_session_id;
 select * into q from private.native_production_checkout_qualifications where scope_id=a.scope_id and configuration_sha256=p_configuration_sha256
  order by verified_at desc,id desc limit 1;
 if a.id is null or a.expires_at<=clock_timestamp() or not coalesce(private.native_production_checkout_current(q.id),false)
  or not private.native_production_source_current(a.source_version_id,a.source_proof_id) then return null; end if;
 select * into strict proof from private.native_production_source_proofs where version_id=a.source_version_id order by verified_at desc,id desc limit 1;
 if proof.origin_provider not in ('s3','cloudflare_r2') or proof.origin_generation !~ '^"[0-9a-f]{32}(-[1-9][0-9]*)?"$' then return null; end if;
 return jsonb_build_object('protocol','native-production-preflight-v1','admissionId',a.id,'qualificationId',q.id,
  'buyerId',p_buyer_id,'sessionId',p_session_id,'sourceVersionId',a.source_version_id,
  'provider',proof.origin_provider,'bucket',proof.origin_bucket,'objectKey',proof.origin_object,'generation',proof.origin_generation,
  'assetSha256',proof.asset_sha256,'byteLength',proof.byte_length,
  'validUntilMs',floor(extract(epoch from least(clock_timestamp()+interval '5 seconds',proof.expires_at,q.expires_at,a.expires_at))*1000)::bigint);
end $$;
create function public.record_native_production_checkout_preflight(p_admission_id uuid,p_buyer_id uuid,p_session_id uuid,p_configuration_sha256 text,
 p_generation text,p_byte_length bigint,p_content_type text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare context jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('native-production-checkout-authority',0))
 then raise exception 'native_production_checkout_authority_busy'; end if;
 context:=public.resolve_native_production_checkout_preflight(p_admission_id,p_buyer_id,p_session_id,p_configuration_sha256);
 if context is null or context->>'generation' is distinct from p_generation or (context->>'byteLength')::bigint is distinct from p_byte_length
  or p_content_type is distinct from 'video/mp4' then raise exception 'native_production_delivery_unavailable'; end if;
 insert into private.native_production_checkout_delivery_preflights(admission_id,qualification_id)
 values(p_admission_id,(context->>'qualificationId')::uuid);
 return jsonb_build_object('protocol','native-production-preflight-v1','status','READY','admissionId',p_admission_id,'dispatchAllowed',false);
end $$;
revoke all on function public.resolve_native_production_checkout_preflight(uuid,uuid,uuid,text),
 public.record_native_production_checkout_preflight(uuid,uuid,uuid,text,text,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.resolve_native_production_checkout_preflight(uuid,uuid,uuid,text),
 public.record_native_production_checkout_preflight(uuid,uuid,uuid,text,text,bigint,text) to service_role;

-- Defense in depth for older overloads, administrative direct writes and raw
-- provider metadata: no native production Paid Video grant without exact proof.
create function private.guard_native_production_checkout_access() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.environment='production' and new.grant_type='paid_content_access'
  and new.provider in ('revenuecat_app_store','revenuecat_google_play') and new.status='active'
  and not exists(select 1 from private.native_production_checkout_access_bindings binding
   join private.native_production_checkout_dispatches d on d.id=binding.dispatch_id
   join private.native_production_video_admissions a on a.id=d.admission_id
   join private.native_production_video_versions v on v.id=a.source_version_id
   join private.native_production_checkout_receipt_proofs proof on proof.id=binding.receipt_proof_id
   where binding.access_grant_id=new.id and private.native_production_checkout_access_current(d.id)
    and row(new.user_id,new.source_id,new.product_id,new.provider_event_id,new.provider,new.source_type)
     is not distinct from row(a.buyer_id,v.source_id,a.catalog_product_id,proof.canonical_receipt_id,proof.provider,'provider_event'))
 then raise exception 'native_production_access_unqualified'; end if;
 return new;
end $$;
create trigger guard_native_production_checkout_access before insert or update on public.access_grants
 for each row execute function private.guard_native_production_checkout_access();
revoke all on function private.guard_native_production_checkout_access() from public,anon,authenticated,service_role;

alter function public.creator_video_existing_purchase_identity_internal(uuid,uuid) rename to creator_video_purchase_identity_before_native_checkout;
revoke all on function public.creator_video_purchase_identity_before_native_checkout(uuid,uuid) from public,anon,authenticated,service_role;
create function public.creator_video_existing_purchase_identity_internal(p_user_id uuid,p_video_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 -- Retain recorded ownership even when delivery/proof is temporarily held.
 -- The access resolver separately rechecks current authority. Never recharge
 -- a buyer merely because a source was replaced or a qualification expired.
 select jsonb_build_object('id',i.id,'accessGrantId',binding.access_grant_id,'provider',i.provider,
   'providerProductId',i.provider_product_id,'environment','production') into result
 from private.native_production_checkout_access_bindings binding
 join private.native_production_checkout_dispatches d on d.id=binding.dispatch_id
 join public.money_purchase_intents i on i.id=d.intent_id
 where i.user_id=p_user_id and i.source_id=p_video_id and i.environment='production' order by i.created_at limit 1;
 if result is not null then return result; end if;
 return public.creator_video_purchase_identity_before_native_checkout(p_user_id,p_video_id);
end $$;
revoke all on function public.creator_video_existing_purchase_identity_internal(uuid,uuid) from public,anon,authenticated,service_role;

alter function public.resolve_creator_content_access(text,uuid) rename to resolve_creator_content_access_before_native_checkout;
revoke all on function public.resolve_creator_content_access_before_native_checkout(text,uuid) from public,anon,authenticated,service_role;
create function public.resolve_creator_content_access(p_content_type text,p_content_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; dispatch_id uuid;
begin
 result:=public.resolve_creator_content_access_before_native_checkout(p_content_type,p_content_id);
 if p_content_type='creator_video' and result->>'reason'='active_grant' then
  select d.id into dispatch_id from private.native_production_checkout_dispatches d
   join public.money_purchase_intents i on i.id=d.intent_id
   join private.native_production_checkout_access_bindings b on b.dispatch_id=d.id
   where i.user_id=auth.uid() and i.source_id=p_content_id order by i.created_at limit 1;
  if dispatch_id is not null and not private.native_production_checkout_access_current(dispatch_id) then
   -- Preserve unrelated independently verified channel access.
   result:=public.creator_video_subscription_access_internal(p_content_id);
   if result->>'allowed'='true' then
    return result||jsonb_build_object('reason','active_creator_subscription','requiresPurchase',false);
   end if;
   return jsonb_build_object('allowed',false,'reason','content_unavailable','requiresPurchase',false);
  end if;
  if dispatch_id is not null then return result||jsonb_build_object('nativeProductionDeliveryOnly',true); end if;
 end if;
 return result;
end $$;
revoke all on function public.resolve_creator_content_access(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.resolve_creator_content_access(text,uuid) to anon,authenticated;

-- Empty authenticated verifier boundary. A separately qualified adapter must
-- independently authenticate the Store transaction and its SDK correlation.
-- Webhook/client IDs and prices cannot mint a proof. Provisioning a key is an
-- external security action, never part of this source migration or fixtures.
create function public.accept_native_production_paid_video_receipt(p_key_id uuid,p_assertion text,p_signature_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare key_row private.native_production_checkout_verifier_keys; d private.native_production_checkout_dispatches;
 facts jsonb; proof private.native_production_checkout_receipt_proofs; prior private.native_production_checkout_receipt_proofs;
 grant_id uuid; expected_keys text[]:=array['dispatchId','canonicalReceiptId','provider','environment','projectId','appId','storeAccountId',
  'productId','buyerId','transactionId','originalTransactionId','grossMinor','currency','quantity','purchasedAt','adapterVersion','evidenceSha256','verifiedAt'];
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if octet_length(p_assertion)>8192 or p_assertion is null or p_signature_sha256 !~ '^[0-9a-f]{64}$' or p_signature_sha256 is null
 then raise exception 'native_production_signed_receipt_invalid'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('native-production-checkout-authority',0))
 then raise exception 'native_production_checkout_authority_busy'; end if;
 select * into key_row from private.native_production_checkout_verifier_keys where id=p_key_id;
 if key_row.id is null or key_row.verified_at>clock_timestamp() or key_row.expires_at<=clock_timestamp()
  or exists(select 1 from private.native_production_checkout_verifier_revocations where key_id=key_row.id)
  or encode(extensions.hmac(convert_to(p_assertion,'UTF8'),key_row.verification_key,'sha256'),'hex') is distinct from p_signature_sha256
 then raise exception 'native_production_signed_receipt_invalid'; end if;
 facts:=p_assertion::jsonb;
 if jsonb_typeof(facts) is distinct from 'object' or not facts ?& expected_keys
  or (select count(*) from jsonb_object_keys(facts))<>cardinality(expected_keys)
  or jsonb_typeof(facts->'grossMinor') is distinct from 'number' or facts->>'grossMinor' !~ '^[1-9][0-9]{0,8}$'
  or facts->'quantity' is distinct from '1'::jsonb
  or exists(select 1 from jsonb_each(facts) item where item.key not in ('grossMinor','quantity')
    and (jsonb_typeof(item.value) is distinct from 'string' or length(item.value#>>'{}') not between 1 and 512))
 then raise exception 'native_production_signed_receipt_invalid'; end if;
 select * into d from private.native_production_checkout_dispatches where id=(facts->>'dispatchId')::uuid;
 if d.id is null or d.qualification_id is distinct from key_row.qualification_id
  or not private.native_production_checkout_current(d.qualification_id,true)
 then raise exception 'native_production_receipt_verifier_unqualified'; end if;
 if not exists(select 1 from private.native_production_verified_witnesses witness where witness.dispatch_id=d.id
   and witness.witness_sha256=facts->>'evidenceSha256' and witness.transaction_id=facts->>'transactionId'
   and (witness.key_id is null or not exists(select 1 from private.native_production_witness_key_revocations revoked where revoked.key_id=witness.key_id)))
 then raise exception 'native_production_attested_completion_required'; end if;
 proof.verifier_key_id:=key_row.id; proof.dispatch_id:=d.id; proof.canonical_receipt_id:=(facts->>'canonicalReceiptId')::uuid;
 proof.provider:=facts->>'provider'; proof.environment:=facts->>'environment'; proof.project_id:=facts->>'projectId';
 proof.app_id:=facts->>'appId'; proof.store_account_id:=facts->>'storeAccountId'; proof.product_id:=facts->>'productId';
 proof.buyer_id:=(facts->>'buyerId')::uuid; proof.transaction_id:=facts->>'transactionId'; proof.original_transaction_id:=facts->>'originalTransactionId';
 proof.gross_minor:=(facts->>'grossMinor')::integer; proof.currency:=facts->>'currency'; proof.quantity:=1;
 proof.purchased_at:=(facts->>'purchasedAt')::timestamptz; proof.adapter_version:=facts->>'adapterVersion';
 proof.evidence_sha256:=facts->>'evidenceSha256'; proof.verified_at:=(facts->>'verifiedAt')::timestamptz;
 if not isfinite(proof.verified_at) or not isfinite(proof.purchased_at) or proof.verified_at>clock_timestamp()
  or proof.verified_at<key_row.verified_at or proof.verified_at>=key_row.expires_at
 then raise exception 'native_production_signed_receipt_invalid'; end if;
 select * into prior from private.native_production_checkout_receipt_proofs where dispatch_id=d.id;
 if prior.id is not null then
  proof.id:=prior.id;
  -- A fresh read of the same verified Store fact may retry delivery. Preserve
  -- its first immutable verification time, never create a second purchase.
  proof.verified_at:=prior.verified_at;
  if proof is distinct from prior then raise exception 'native_production_receipt_proof_conflict'; end if;
 else
  proof.id:=gen_random_uuid();
  insert into private.native_production_checkout_receipt_proofs select (proof).*;
 end if;
 grant_id:=private.bind_native_production_checkout_receipt(proof.id);
 return jsonb_build_object('status',case when grant_id is null then 'HELD' else 'ACCESS_VERIFIED' end,
  'accessGranted',grant_id is not null,'financialAuthority',false,'payable',false);
end $$;
revoke all on function public.accept_native_production_paid_video_receipt(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.accept_native_production_paid_video_receipt(uuid,text,text) to service_role;

revoke all on function private.native_production_checkout_current(uuid,boolean),private.guard_native_production_checkout_intent()
 from public,anon,authenticated,service_role;

-- Namespace fences cover inserts (including newer qualification phantoms),
-- revocations and control changes. Contention fails closed rather than issuing
-- a charge against a stale read. No API can edit these authority rows.
create function private.fence_native_production_checkout_authority() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not pg_try_advisory_xact_lock(hashtextextended('native-production-checkout-authority',0))
 then raise exception 'native_production_checkout_authority_busy'; end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
do $$ declare t text; begin
 foreach t in array array['native_production_checkout_controls','native_production_checkout_qualifications',
  'native_production_checkout_revocations','native_production_checkout_dispatches',
  'native_production_checkout_verifier_keys','native_production_checkout_verifier_revocations',
  'native_production_source_proofs','native_production_source_revocations','native_production_scope_qualifications',
  'native_production_scope_revocations','native_production_video_versions',
  'native_production_witness_configurations','native_production_witness_key_revocations',
  'native_production_witness_challenges','native_production_witness_enrollments','native_production_witness_keys',
  'native_production_verified_witnesses','native_production_native_launch_ready','native_production_native_assertion_counters'] loop
  execute format('create trigger native_checkout_authority_fence before insert or update or delete on private.%I for each row execute function private.fence_native_production_checkout_authority()',t);
 end loop;
end $$;
-- Acquisition at the start of each RPC avoids a phantom between gate and use.
do $$ declare signature text; definition text; begin
 foreach signature in array array[
  'public.create_native_production_paid_video_intent(uuid,text)',
  'public.claim_native_production_paid_video_checkout(uuid,uuid,text)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  definition:=replace(definition,E'begin\n',E'begin\n if not pg_try_advisory_xact_lock(hashtextextended(''native-production-checkout-authority'',0)) then raise exception ''native_production_checkout_authority_busy''; end if;\n');
  execute definition;
 end loop;
end $$;
revoke all on function private.fence_native_production_checkout_authority() from public,anon,authenticated,service_role;

create trigger native_checkout_switch_fence before update on public.platform_money_kill_switches
 for each row when (new.key in ('live_money_enabled','provider_webhooks_enabled','digital_sales_enabled','paid_content_enabled',
  'creator_monetization_enabled','revenuecat_app_store_enabled','revenuecat_google_play_enabled'))
 execute function private.fence_native_production_checkout_authority();

-- Existing callers cannot bypass the new current gate by using the shared
-- begin RPC directly. The same original owner still performs the only claim.
alter function public.begin_creator_money_checkout(uuid,uuid) rename to begin_creator_money_checkout_before_native;
revoke all on function public.begin_creator_money_checkout_before_native(uuid,uuid) from public,anon,authenticated,service_role;
create function public.begin_creator_money_checkout(p_purchase_intent_id uuid,p_checkout_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.native_production_checkout_dispatches; a private.native_production_video_admissions;
begin
 select * into d from private.native_production_checkout_dispatches where intent_id=p_purchase_intent_id;
 if d.id is not null then
  if not pg_try_advisory_xact_lock(hashtextextended('native-production-checkout-authority',0))
  then raise exception 'native_production_checkout_authority_busy'; end if;
  select * into strict a from private.native_production_video_admissions where id=d.admission_id;
  if not private.native_production_checkout_current(d.qualification_id)
   or not private.native_production_source_current(a.source_version_id,a.source_proof_id)
   or not exists(select 1 from private.native_production_native_launch_ready ready where ready.dispatch_id=d.id
    and ready.server_received_at>=a.created_at and ready.server_received_at<a.expires_at
    and (ready.key_id is null or not exists(select 1 from private.native_production_witness_key_revocations r where r.key_id=ready.key_id)))
   or not exists(select 1 from private.native_production_checkout_delivery_preflights preflight
    where preflight.admission_id=a.id and preflight.qualification_id=d.qualification_id and preflight.expires_at>clock_timestamp())
  then raise exception 'native_production_checkout_unqualified'; end if;
 end if;
 return public.begin_creator_money_checkout_before_native(p_purchase_intent_id,p_checkout_attempt_id);
end $$;
revoke all on function public.begin_creator_money_checkout(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.begin_creator_money_checkout(uuid,uuid) to authenticated;

-- Prevent the old product/price matcher from consuming a new production
-- Paid Video intent. This wrapper records canonical evidence only, before any
-- legacy grant/ledger path. Sandbox and every other product delegate unchanged.
create function private.record_native_production_checkout_receipt(
 p_provider text,p_event_id text,p_event_type text,p_buyer uuid,p_product text,p_environment text,
 p_occurred_at timestamptz,p_hash text,p_original text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare product public.monetization_products; receipt public.provider_events; count_products integer;
begin
 if p_environment is distinct from 'production' or p_provider not in ('revenuecat_app_store','revenuecat_google_play') then return null; end if;
 -- A historical shared consumer keeps its existing reconciliation owner.
 -- An exact new checkout never takes a Premium or legacy transaction chain.
 if exists(select 1 from public.revenuecat_premium_transaction_authority
    where provider=p_provider and original_transaction_id=p_original)
  or exists(select 1 from public.revenuecat_consumable_transaction_intents
    where provider=p_provider and original_transaction_id=p_original)
  or exists(select 1 from public.monetization_products p
    left join public.monetization_product_store_mappings m on m.product_id=p.id
    where p.product_type<>'paid_content_access' and (
      (p.provider=p_provider and p.provider_product_id=p_product and p.environment='production')
      or (m.provider=p_provider and m.provider_product_id=p_product and m.environment='production')))
 then return null; end if;
 -- Resolve only an exact catalog/store map. Never use an intent price, newest
 -- pending intent, mutable video owner or a client transaction assertion.
 select count(distinct p.id) into count_products from public.monetization_products p
 left join public.monetization_product_store_mappings m on m.product_id=p.id
 where p.product_type='paid_content_access' and (
  (p.provider=p_provider and p.provider_product_id=p_product and p.environment='production')
  or (m.provider=p_provider and m.provider_product_id=p_product and m.environment='production' and m.concept='paid_video'));
 if count_products=0 then return null; end if;
 if count_products<>1 then raise exception 'native_production_catalog_ambiguous'; end if;
 select distinct p.* into strict product from public.monetization_products p
 left join public.monetization_product_store_mappings m on m.product_id=p.id
 where p.product_type='paid_content_access' and (
  (p.provider=p_provider and p.provider_product_id=p_product and p.environment='production')
  or (m.provider=p_provider and m.provider_product_id=p_product and m.environment='production' and m.concept='paid_video'));
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform public.reserve_revenuecat_webhook_ingress_event(p_event_id,p_hash);
 perform pg_advisory_xact_lock(hashtextextended('native-production-ingress:'||p_event_id,0));
 select * into receipt from public.provider_events where provider_event_id=p_event_id;
 if receipt.id is not null then
  if row(receipt.provider,receipt.product_id,receipt.user_id,receipt.app_user_id,receipt.environment,receipt.event_type,receipt.raw_payload_hash,receipt.metadata->>'provider_product_id',receipt.metadata->>'original_transaction_id')
   is distinct from row(p_provider,product.id,p_buyer,p_buyer::text,'production',p_event_type,p_hash,p_product,p_original)
  then raise exception 'native_production_receipt_conflict'; end if;
 else
  insert into public.provider_events(provider_event_id,provider,product_id,product_key,user_id,app_user_id,environment,
   event_type,status,occurred_at,idempotency_key,raw_payload_hash,metadata)
  values(p_event_id,p_provider,product.id,product.product_key,p_buyer,p_buyer::text,'production',p_event_type,'ignored',
   p_occurred_at,'native-production:'||p_event_id,p_hash,
   jsonb_build_object('provider_product_id',p_product,'original_transaction_id',p_original,'final_reason','native_production_independent_receipt_required'))
  returning * into receipt;
 end if;
 return jsonb_build_object('status','ignored','reason','native_production_independent_receipt_required',
  'providerEventId',receipt.id,'productKey',product.product_key,'productType',product.product_type,'environment','production',
  'purchaseIntentId',null,'accessGrantId',null,'ledgerEventId',null,'payableState','not_payable','grantStatus','blocked',
  'nativeExclusion',false,'authorityGranted',false,'financialAuthority',false);
end $$;
revoke all on function private.record_native_production_checkout_receipt(text,text,text,uuid,text,text,timestamptz,text,text)
 from public,anon,authenticated,service_role;

alter function public.process_revenuecat_terminal_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,text,text)
 rename to process_revenuecat_terminal_before_native_checkout;
revoke all on function public.process_revenuecat_terminal_before_native_checkout(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,text,text)
 from public,anon,authenticated,service_role;
create function public.process_revenuecat_terminal_event_atomic(p_provider text,p_provider_event_id text,p_event_type text,p_user_id uuid,
 p_reported_provider_product_id text,p_reported_provider_base_plan_id text,p_environment text,p_entitlement_status text,
 p_starts_at timestamptz,p_expires_at timestamptz,p_occurred_at timestamptz,p_raw_payload_hash text,
 p_period_type text,p_store text,p_platform text,p_original_transaction_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare product text:=p_reported_provider_product_id; held jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if p_environment='production' and p_event_type in ('REFUND','REVOCATION','CANCELLATION','EXPIRATION','BILLING_ISSUE','SUBSCRIPTION_PAUSED')
  and not exists(select 1 from public.revenuecat_premium_transaction_authority where provider=p_provider and original_transaction_id=p_original_transaction_id)
  and not exists(select 1 from public.revenuecat_consumable_transaction_intents where provider=p_provider and original_transaction_id=p_original_transaction_id)
 then
  -- Omitted/stale product on removal may use one exact historical native chain,
  -- never newest price. Mixed products/subjects retain the shared legacy hold.
  if (select count(distinct (buyer_id,canonical_provider_product_id)) from private.native_production_paid_video_observations
    where provider=p_provider and original_transaction_id=p_original_transaction_id)=1 then
   select canonical_provider_product_id into product from private.native_production_paid_video_observations
    where provider=p_provider and original_transaction_id=p_original_transaction_id and buyer_id=p_user_id limit 1;
  elsif exists(select 1 from private.native_production_paid_video_observations
    where provider=p_provider and original_transaction_id=p_original_transaction_id) then product:=null;
  end if;
  held:=private.record_native_production_checkout_receipt(p_provider,p_provider_event_id,p_event_type,p_user_id,product,
   p_environment,p_occurred_at,p_raw_payload_hash,p_original_transaction_id);
  if held is not null then
   return held||jsonb_build_object('domain','creator_money','entitlementActive',false,'entitlementStatus',null,'duplicateEvent',false);
  end if;
 end if;
 return public.process_revenuecat_terminal_before_native_checkout(p_provider,p_provider_event_id,p_event_type,p_user_id,
  p_reported_provider_product_id,p_reported_provider_base_plan_id,p_environment,p_entitlement_status,p_starts_at,p_expires_at,
  p_occurred_at,p_raw_payload_hash,p_period_type,p_store,p_platform,p_original_transaction_id);
end $$;
revoke all on function public.process_revenuecat_terminal_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,text,text)
 from public,anon,authenticated,service_role;
grant execute on function public.process_revenuecat_terminal_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,text,text)
 to service_role;

do $$ declare provider text; function_name text; original_name text; definition text; begin
 foreach provider in array array['google_play','app_store'] loop
  function_name:='process_revenuecat_'||provider||'_event_atomic';
  original_name:=function_name||'_before_native_checkout';
  execute format('alter function public.%I(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,timestamptz) rename to %I',function_name,original_name);
  execute format('revoke all on function public.%I(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,timestamptz) from public,anon,authenticated,service_role',original_name);
  definition:=format($definition$
   create function public.%I(p_provider_event_id text,p_event_type text,p_user_id uuid,p_provider_product_id text,
    p_environment text,p_occurred_at timestamptz,p_expires_at timestamptz,p_amount_minor integer,p_currency text,
    p_raw_payload_hash text,p_original_transaction_id text,p_input_reason text,p_purchase_occurred_at timestamptz)
   returns jsonb language plpgsql security definer set search_path='' as $body$
   declare held jsonb;
   begin
    if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
    held:=private.record_native_production_checkout_receipt(%L,p_provider_event_id,p_event_type,p_user_id,
     p_provider_product_id,p_environment,p_occurred_at,p_raw_payload_hash,p_original_transaction_id);
    if held is not null then return held; end if;
    return public.%I(p_provider_event_id,p_event_type,p_user_id,p_provider_product_id,p_environment,p_occurred_at,
     p_expires_at,p_amount_minor,p_currency,p_raw_payload_hash,p_original_transaction_id,p_input_reason,p_purchase_occurred_at);
   end $body$;
  $definition$,function_name,'revenuecat_'||provider,original_name);
  execute definition;
  execute format('revoke all on function public.%I(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,timestamptz) from public,anon,authenticated,service_role',function_name);
  execute format('grant execute on function public.%I(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,timestamptz) to service_role',function_name);
 end loop;
end $$;

-- Only the authenticated server verifier may resolve the private challenge and
-- qualification. Client callback hints cannot create a witness or enrollment.
create function public.resolve_native_production_witness_context(p_dispatch_id uuid,p_buyer_id uuid,p_session_id uuid,p_recovery boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.native_production_checkout_dispatches; a private.native_production_video_admissions;
 q private.native_production_checkout_qualifications; s private.native_production_scope_qualifications;
 w private.native_production_witness_configurations; challenge text; i public.money_purchase_intents;
begin
 if auth.role() is distinct from 'service_role' or not public.creator_tip_buyer_session_authority_internal(p_buyer_id,p_session_id)
 then raise exception 'current_session_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('native-production-checkout-authority',0));
 select * into strict d from private.native_production_checkout_dispatches where id=p_dispatch_id;
 select * into strict a from private.native_production_video_admissions where id=d.admission_id and buyer_id=p_buyer_id;
 select * into strict q from private.native_production_checkout_qualifications where id=d.qualification_id;
 select * into strict s from private.native_production_scope_qualifications where id=a.scope_id;
 select * into strict w from private.native_production_witness_configurations where qualification_id=q.id;
 select * into strict i from public.money_purchase_intents where id=d.intent_id;
 if not private.native_production_checkout_current(q.id,p_recovery)
  or (not p_recovery and (a.expires_at<=clock_timestamp() or a.session_id<>p_session_id))
  or (p_recovery and i.checkout_started_at is null) then raise exception 'native_witness_held'; end if;
 if not p_recovery then
  insert into private.native_production_witness_challenges(dispatch_id) values(d.id) on conflict do nothing;
 end if;
 select c.challenge into strict challenge from private.native_production_witness_challenges c where c.dispatch_id=d.id;
 return jsonb_build_object('qualificationId',q.id,'provider',s.provider,'projectId',s.project_id,'appId',s.app_id,
  'storeAccountId',s.store_account_id,'appleTeamId',w.apple_team_id,'appleAppId',w.apple_app_id,
  'googleCertificateSha256',w.google_certificate_sha256,'googleAccountBinding',w.google_account_binding,
  'checkoutStartedAt',i.checkout_started_at,
  'launchReady',(select jsonb_build_object('preparationId',ready.preparation_id,'serverReceivedAt',ready.server_received_at,
    'elapsedLimitMs',ready.elapsed_limit_ms) from private.native_production_native_launch_ready ready where ready.dispatch_id=d.id),
  'verifiedWitnessSha256',(select witness_sha256 from private.native_production_verified_witnesses where dispatch_id=d.id),
  'nativeContext',jsonb_build_object(
   'dispatchId',d.id::text,'admissionId',a.id::text,'quoteId',a.quote_sha256,'challenge',challenge,
   'buyerId',a.buyer_id::text,'sessionId',a.session_id::text,'productId',s.provider_product_id,
   'grossMinor',a.gross_minor::text,'currency',upper(a.currency),'configurationSha256',q.configuration_sha256,
   'applicationId',q.application_id,'nativeBuild',q.native_build,'sdkVersion',q.sdk_version,
   'launchBeforeMs',floor(extract(epoch from a.expires_at)*1000)::bigint::text));
end $$;
revoke all on function public.resolve_native_production_witness_context(uuid,uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.resolve_native_production_witness_context(uuid,uuid,uuid,boolean) to service_role;

create function public.start_native_production_witness_enrollment(p_dispatch_id uuid,p_buyer_id uuid,p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare context jsonb; enrollment private.native_production_witness_enrollments;
begin
 context:=public.resolve_native_production_witness_context(p_dispatch_id,p_buyer_id,p_session_id,false);
 if context->>'provider'<>'revenuecat_app_store' then raise exception 'apple_enrollment_only'; end if;
 insert into private.native_production_witness_enrollments(qualification_id,buyer_id,session_id)
 values((context->>'qualificationId')::uuid,p_buyer_id,p_session_id) returning * into enrollment;
 return jsonb_build_object('enrollmentId',enrollment.id,'challenge',enrollment.challenge,
  'applicationId',context#>>'{nativeContext,applicationId}','appleTeamId',context->>'appleTeamId');
end $$;
revoke all on function public.start_native_production_witness_enrollment(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.start_native_production_witness_enrollment(uuid,uuid,uuid) to service_role;

create function public.resolve_native_production_witness_key(p_dispatch_id uuid,p_buyer_id uuid,p_session_id uuid,p_key_id text,p_recovery boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare context jsonb; k private.native_production_witness_keys; counter bigint;
begin
 context:=public.resolve_native_production_witness_context(p_dispatch_id,p_buyer_id,p_session_id,p_recovery);
 select key_row.* into strict k from private.native_production_witness_keys key_row
 join private.native_production_witness_enrollments e on e.id=key_row.enrollment_id
 where key_row.key_id=p_key_id and e.buyer_id=p_buyer_id and e.qualification_id=(context->>'qualificationId')::uuid
 and not exists(select 1 from private.native_production_witness_key_revocations r where r.key_id=key_row.key_id);
 select coalesce(max(w.counter),0) into counter from private.native_production_native_assertion_counters w where w.key_id=k.key_id;
 return jsonb_build_object('publicKey',k.public_key,'counter',counter);
end $$;
revoke all on function public.resolve_native_production_witness_key(uuid,uuid,uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.resolve_native_production_witness_key(uuid,uuid,uuid,text,boolean) to service_role;

create function public.resolve_native_production_witness_enrollment(p_enrollment_id uuid,p_buyer_id uuid,p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e private.native_production_witness_enrollments; q private.native_production_checkout_qualifications; w private.native_production_witness_configurations;
begin
 if auth.role() is distinct from 'service_role' or not public.creator_tip_buyer_session_authority_internal(p_buyer_id,p_session_id)
 then raise exception 'current_session_required'; end if;
 select * into strict e from private.native_production_witness_enrollments where id=p_enrollment_id
  and buyer_id=p_buyer_id and session_id=p_session_id and expires_at>clock_timestamp();
 select * into strict q from private.native_production_checkout_qualifications where id=e.qualification_id;
 select * into strict w from private.native_production_witness_configurations where qualification_id=e.qualification_id;
 if not private.native_production_checkout_current(q.id) then raise exception 'native_witness_held'; end if;
 return jsonb_build_object('challenge',e.challenge,'applicationId',q.application_id,'teamId',w.apple_team_id);
end $$;
revoke all on function public.resolve_native_production_witness_enrollment(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.resolve_native_production_witness_enrollment(uuid,uuid,uuid) to service_role;

create function public.accept_native_production_witness_enrollment(p_enrollment_id uuid,p_buyer_id uuid,p_session_id uuid,
 p_key_id text,p_public_key text,p_evidence_sha256 text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('native-production-checkout-authority',0));
 perform public.resolve_native_production_witness_enrollment(p_enrollment_id,p_buyer_id,p_session_id);
 if length(p_key_id) not between 1 and 128 or length(p_public_key) not between 64 and 2048
  or p_evidence_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'native_witness_invalid'; end if;
 insert into private.native_production_witness_keys(key_id,enrollment_id,public_key,evidence_sha256)
 values(p_key_id,p_enrollment_id,p_public_key,p_evidence_sha256);
end $$;
revoke all on function public.accept_native_production_witness_enrollment(uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.accept_native_production_witness_enrollment(uuid,uuid,uuid,text,text,text) to service_role;

create function public.accept_native_production_verified_witness(p_dispatch_id uuid,p_buyer_id uuid,p_session_id uuid,
 p_witness_sha256 text,p_transaction_id text,p_key_id text,p_previous_counter bigint,p_counter bigint,
 p_preparation_id uuid,p_elapsed_to_launch_ms bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare context jsonb; key_context jsonb; old private.native_production_verified_witnesses;
 canonical_id uuid; observation_count integer; launch private.native_production_native_launch_ready; upper_at timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended('native-production-checkout-authority',0));
 context:=public.resolve_native_production_witness_context(p_dispatch_id,p_buyer_id,p_session_id,true);
 select * into old from private.native_production_verified_witnesses where dispatch_id=p_dispatch_id;
 if old.dispatch_id is not null then
  if old.witness_sha256 is distinct from p_witness_sha256 or old.transaction_id is distinct from p_transaction_id
   then raise exception 'native_witness_conflict'; end if;
 else
  select * into strict launch from private.native_production_native_launch_ready where dispatch_id=p_dispatch_id
   and preparation_id=p_preparation_id and key_id is not distinct from p_key_id;
  upper_at:=launch.server_received_at+p_elapsed_to_launch_ms*interval '1 millisecond';
  if p_witness_sha256 !~ '^[0-9a-f]{64}$' or length(p_transaction_id) not between 1 and 512
   or p_elapsed_to_launch_ms is null or p_elapsed_to_launch_ms<0 or p_elapsed_to_launch_ms>=launch.elapsed_limit_ms
   or upper_at>=to_timestamp((context#>>'{nativeContext,launchBeforeMs}')::numeric/1000)
   or upper_at<(context->>'checkoutStartedAt')::timestamptz
   then raise exception 'native_witness_invalid'; end if;
  if context->>'provider'='revenuecat_app_store' then
   key_context:=public.resolve_native_production_witness_key(p_dispatch_id,p_buyer_id,p_session_id,p_key_id);
   if (key_context->>'counter')::bigint is distinct from p_previous_counter or p_counter<=p_previous_counter
    then raise exception 'native_witness_counter_race'; end if;
   insert into private.native_production_native_assertion_counters(key_id,counter,dispatch_id,phase,evidence_sha256)
   values(p_key_id,p_counter,p_dispatch_id,'completed',p_witness_sha256);
  elsif p_key_id is not null or p_counter is not null or p_previous_counter is not null
   then raise exception 'native_witness_invalid'; end if;
  insert into private.native_production_verified_witnesses(dispatch_id,witness_sha256,key_id,counter,transaction_id,launched_at,launch_upper_at,completed_at)
  values(p_dispatch_id,p_witness_sha256,p_key_id,p_counter,p_transaction_id,launch.server_received_at,upper_at,clock_timestamp());
 end if;
 select count(*),min(o.canonical_receipt_id::text)::uuid into observation_count,canonical_id
 from private.native_production_paid_video_observations o
 where o.provider=context->>'provider' and o.transaction_id=p_transaction_id and o.buyer_id=p_buyer_id
 and o.configured_project_id=context->>'projectId' and o.reported_app_id=context->>'appId'
 and o.canonical_provider_product_id=context#>>'{nativeContext,productId}'
 and o.event_type in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE');
 if observation_count<>1 then canonical_id:=null; end if;
 return jsonb_build_object('canonicalReceiptId',canonical_id,'financialAuthority',false,'payable',false);
end $$;
revoke all on function public.accept_native_production_verified_witness(uuid,uuid,uuid,text,text,text,bigint,bigint,uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.accept_native_production_verified_witness(uuid,uuid,uuid,text,text,text,bigint,bigint,uuid,bigint) to service_role;

create function public.accept_native_production_launch_ready(p_dispatch_id uuid,p_buyer_id uuid,p_session_id uuid,
 p_prepared_sha256 text,p_preparation_id uuid,p_key_id text,p_previous_counter bigint,p_counter bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare context jsonb; key_context jsonb; launch private.native_production_native_launch_ready; now_at timestamptz:=clock_timestamp();
begin
 perform pg_advisory_xact_lock(hashtextextended('native-production-checkout-authority',0));
 context:=public.resolve_native_production_witness_context(p_dispatch_id,p_buyer_id,p_session_id,false);
 select * into launch from private.native_production_native_launch_ready where dispatch_id=p_dispatch_id;
 if launch.dispatch_id is not null then
  if row(launch.preparation_id,launch.prepared_sha256,launch.key_id) is distinct from row(p_preparation_id,p_prepared_sha256,p_key_id)
   then raise exception 'native_preparation_conflict'; end if;
 else
  if context->>'checkoutStartedAt' is not null or p_prepared_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'native_launch_already_claimed'; end if;
  if context->>'provider'='revenuecat_app_store' then
   key_context:=public.resolve_native_production_witness_key(p_dispatch_id,p_buyer_id,p_session_id,p_key_id,false);
   if (key_context->>'counter')::bigint is distinct from p_previous_counter or p_counter<=p_previous_counter
    then raise exception 'native_witness_counter_race'; end if;
   insert into private.native_production_native_assertion_counters(key_id,counter,dispatch_id,phase,evidence_sha256)
   values(p_key_id,p_counter,p_dispatch_id,'prepared',p_prepared_sha256);
  elsif p_key_id is not null or p_counter is not null or p_previous_counter is not null then raise exception 'native_preparation_invalid'; end if;
  insert into private.native_production_native_launch_ready(dispatch_id,preparation_id,prepared_sha256,key_id,server_received_at,elapsed_limit_ms)
  values(p_dispatch_id,p_preparation_id,p_prepared_sha256,p_key_id,now_at,
   ((context#>>'{nativeContext,launchBeforeMs}')::bigint-ceil(extract(epoch from now_at)*1000)::bigint)::integer) returning * into launch;
 end if;
 return jsonb_build_object('status','LAUNCH_READY','dispatchId',launch.dispatch_id,'preparationId',launch.preparation_id,
  'launchElapsedLimitMs',launch.elapsed_limit_ms,'financialAuthority',false);
end $$;
revoke all on function public.accept_native_production_launch_ready(uuid,uuid,uuid,text,uuid,text,bigint,bigint) from public,anon,authenticated,service_role;
grant execute on function public.accept_native_production_launch_ready(uuid,uuid,uuid,text,uuid,text,bigint,bigint) to service_role;

alter function public.prepare_native_production_paid_video(uuid,text,text,text,integer) rename to prepare_native_production_paid_video_before_checkout;
revoke all on function public.prepare_native_production_paid_video_before_checkout(uuid,text,text,text,integer) from public,anon,authenticated,service_role;
create function public.prepare_native_production_paid_video(p_video_id uuid,p_provider text,p_product_key text,p_provider_product_id text,p_amount_minor integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.native_production_checkout_dispatches; a private.native_production_video_admissions; i public.money_purchase_intents;
begin
 if auth.uid() is null or not public.whole_app_exact_current_session_authority_internal() then raise exception 'current_session_required'; end if;
 select intent.* into i from public.money_purchase_intents intent
 join private.native_production_checkout_dispatches dispatch on dispatch.intent_id=intent.id
 where intent.user_id=auth.uid() and intent.source_type='paid_content' and intent.source_id=p_video_id
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
revoke all on function public.prepare_native_production_paid_video(uuid,text,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.prepare_native_production_paid_video(uuid,text,text,text,integer) to authenticated;
