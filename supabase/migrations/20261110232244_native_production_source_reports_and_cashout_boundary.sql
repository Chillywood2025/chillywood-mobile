-- Prospective source/admission/report plumbing. No provider adapter, proof,
-- positive release, native intent or creator earning is provisioned here.
-- Immutable row revisions are NOT claims about immutable origin bytes.
create table private.native_production_video_versions (
 id uuid primary key default gen_random_uuid(), source_id uuid not null, creator_id uuid not null,
 revision bigint not null check(revision>0), source_facts_sha256 text not null check(source_facts_sha256 ~ '^[0-9a-f]{64}$'),
 operation text not null check(operation in ('present','deleted')),
 created_at timestamptz not null default clock_timestamp(), unique(source_id,revision)
);
create function private.native_production_video_facts(v public.videos) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('id',v.id,'creator',v.owner_id,'storageProvider',v.storage_provider,'storageBucket',v.storage_bucket,'storagePath',v.storage_path,
  'objectKey',v.storage_object_key,'playbackUrl',v.playback_url,'visibility',v.visibility,
  'moderation',v.moderation_status,'scan',v.scan_status,'scanProvider',v.scan_provider,'scanResult',v.scan_result,'scannedAtEpoch',extract(epoch from v.scanned_at),
  'mime',v.mime_type,'size',v.file_size_bytes,'quarantinedAtEpoch',extract(epoch from v.quarantined_at),'vip',v.vip_access_required);
$$;
create function private.capture_native_production_video_version() returns trigger
language plpgsql security definer set search_path='' as $$
declare v public.videos; facts jsonb;
begin
 if tg_op='UPDATE' and private.native_production_video_facts(old)=private.native_production_video_facts(new) then return new; end if;
 v:=case when tg_op='DELETE' then old else new end; facts:=private.native_production_video_facts(v);
 -- The ordinary INSERT/UPDATE/DELETE already owns this video's row. Retain
 -- history after deletion, never cascade it, and never backfill existing media.
 insert into private.native_production_video_versions(source_id,creator_id,revision,source_facts_sha256,operation)
 select v.id,v.owner_id,coalesce(max(revision),0)+1,encode(extensions.digest(convert_to(facts::text,'UTF8'),'sha256'),'hex'),
  case when tg_op='DELETE' then 'deleted' else 'present' end
 from private.native_production_video_versions where source_id=v.id;
 return v;
end $$;
create trigger native_production_video_version after insert or update or delete on public.videos
 for each row execute function private.capture_native_production_video_version();

-- Empty, privileged independent evidence boundaries. There is deliberately no
-- API-role issuer. A URL/row digest/Brand scan receipt is not sufficient proof.
create table private.native_production_source_proofs (
 id uuid primary key default gen_random_uuid(), version_id uuid not null references private.native_production_video_versions(id),
 origin_provider text not null, origin_bucket text not null, origin_object text not null, origin_generation text not null,
 asset_sha256 text not null check(asset_sha256 ~ '^[0-9a-f]{64}$'), byte_length bigint not null check(byte_length>0),
 scan_receipt_sha256 text not null check(scan_receipt_sha256 ~ '^[0-9a-f]{64}$'),
 adapter_version text not null, evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 verified_at timestamptz not null, expires_at timestamptz not null check(isfinite(verified_at) and isfinite(expires_at) and expires_at>verified_at),
 check(length(btrim(origin_generation)) between 1 and 512),check(length(btrim(origin_object)) between 1 and 2048),
 check(length(btrim(origin_provider)) between 1 and 128),check(length(btrim(origin_bucket)) between 1 and 512),check(length(btrim(adapter_version)) between 1 and 128)
);
create table private.native_production_scope_qualifications (
 id uuid primary key default gen_random_uuid(), provider text not null check(provider in ('revenuecat_app_store','revenuecat_google_play')),
 environment text not null default 'production' check(environment='production'),
 project_id text not null, app_id text not null, store_account_id text not null, provider_product_id text not null,
 currency text not null check(currency='usd'), report_schema text not null,
 legal_document_key text not null, legal_document_version text not null,
 terms_sha256 text not null check(terms_sha256 ~ '^[0-9a-f]{64}$'), platform_share_bps integer not null check(platform_share_bps between 0 and 10000),
 evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 verified_at timestamptz not null, expires_at timestamptz not null check(isfinite(verified_at) and isfinite(expires_at) and expires_at>verified_at),
 check(length(btrim(project_id)) between 1 and 128),check(length(btrim(app_id)) between 1 and 128),
 check(length(btrim(store_account_id)) between 1 and 512),check(length(btrim(provider_product_id)) between 1 and 512),
 check(length(btrim(report_schema)) between 1 and 128)
);
create table private.native_production_source_revocations (
 proof_id uuid primary key references private.native_production_source_proofs(id), revoked_at timestamptz not null default clock_timestamp()
);
create table private.native_production_scope_revocations (
 qualification_id uuid primary key references private.native_production_scope_qualifications(id), revoked_at timestamptz not null default clock_timestamp()
);
create table private.native_production_video_admissions (
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null, session_id uuid not null, creator_id uuid not null,
 source_version_id uuid not null references private.native_production_video_versions(id),
 source_proof_id uuid not null references private.native_production_source_proofs(id),
 scope_id uuid not null references private.native_production_scope_qualifications(id),
 catalog_product_id uuid not null references public.monetization_products(id),
 store_mapping_id uuid references public.monetization_product_store_mappings(id), product_key text not null,
 gross_minor integer not null check(gross_minor>0), currency text not null check(currency='usd'),
 quantity integer not null check(quantity=1), terms_acceptance_id uuid not null, terms_role_key text not null,
 quote_sha256 text not null check(quote_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null, expires_at timestamptz not null check(isfinite(created_at) and isfinite(expires_at) and expires_at>created_at),
 dispatch_allowed boolean not null default false check(not dispatch_allowed), check(buyer_id<>creator_id)
);
-- A real transaction correlation adapter must produce this exact prospective
-- proof. A client admission UUID or webhook price cannot issue one.
create table private.native_production_purchase_correlations (
 canonical_receipt_id uuid primary key references private.native_production_paid_video_observations(canonical_receipt_id),
 admission_id uuid not null unique references private.native_production_video_admissions(id),
 transaction_id text not null, original_transaction_id text not null, purchased_at timestamptz not null,
 actual_gross_minor bigint not null check(actual_gross_minor>0), quantity integer not null check(quantity=1),
 evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 adapter_version text not null, verified_at timestamptz not null default clock_timestamp(),
 check(isfinite(purchased_at) and isfinite(verified_at)),
 check(length(btrim(transaction_id)) between 1 and 512),check(length(btrim(original_transaction_id)) between 1 and 512)
);
create table private.native_production_sale_bindings (
 canonical_receipt_id uuid primary key references private.native_production_purchase_correlations(canonical_receipt_id),
 admission_id uuid not null unique references private.native_production_video_admissions(id),
 provider text not null, store_account_id text not null, transaction_id text not null,
 created_at timestamptz not null default clock_timestamp(), unique(provider,store_account_id,transaction_id)
);
create table private.native_production_report_jobs (
 canonical_receipt_id uuid primary key references private.native_production_paid_video_observations(canonical_receipt_id),
 created_at timestamptz not null default clock_timestamp(),
 adapter_status text not null default 'unqualified' check(adapter_status='unqualified')
);
create table private.native_production_report_observations (
 canonical_receipt_id uuid not null references private.native_production_sale_bindings(canonical_receipt_id),
 observation_id text not null, evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 facts jsonb not null check(jsonb_typeof(facts)='object'), observed_at timestamptz not null,
 recorded_at timestamptz not null default clock_timestamp(), primary key(canonical_receipt_id,observation_id),
 check(length(observation_id) between 1 and 512)
);
create table private.native_production_economic_snapshots (
 id uuid primary key default gen_random_uuid(), canonical_receipt_id uuid not null references private.native_production_sale_bindings(canonical_receipt_id),
 evaluation_sha256 text not null check(evaluation_sha256 ~ '^[0-9a-f]{64}$'),
 projection jsonb not null, created_at timestamptz not null default clock_timestamp(),
 status text not null default 'HELD' check(status='HELD'), payable boolean not null default false check(not payable),
 financial_authority boolean not null default false check(not financial_authority), unique(canonical_receipt_id,evaluation_sha256)
);
-- Empty reserved linkage for a separately reviewed earning materializer. Merely
-- omitting this row MUST NOT exempt a canonical native earning from its guard.
create table private.native_production_earning_sources (
 earnings_ledger_id uuid primary key references public.creator_earnings_ledger(id),
 snapshot_id uuid not null references private.native_production_economic_snapshots(id),
 created_at timestamptz not null default clock_timestamp()
);
do $$ declare t text; begin
 foreach t in array array['native_production_video_versions','native_production_source_proofs','native_production_scope_qualifications',
 'native_production_source_revocations','native_production_scope_revocations','native_production_video_admissions',
 'native_production_purchase_correlations','native_production_sale_bindings','native_production_report_jobs',
 'native_production_report_observations','native_production_economic_snapshots','native_production_earning_sources'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before update or delete on private.%I for each row execute function public.block_revenuecat_webhook_ingress_mutation_internal()',t||'_immutable',t);
 end loop;
end $$;

create function private.native_production_source_current(p_version uuid,p_proof uuid) returns boolean
language sql volatile set search_path='' as $$
 select exists(select 1 from private.native_production_video_versions version
 join private.native_production_source_proofs proof on proof.version_id=version.id
 join public.videos video on video.id=version.source_id and video.owner_id=version.creator_id
 where version.id=p_version and proof.id=p_proof and version.operation='present'
 and version.id=(select newest.id from private.native_production_video_versions newest where newest.source_id=version.source_id order by revision desc limit 1)
 and version.source_facts_sha256=encode(extensions.digest(convert_to(private.native_production_video_facts(video)::text,'UTF8'),'sha256'),'hex')
 and row(proof.origin_provider,proof.origin_bucket,proof.origin_object) is not distinct from row(video.storage_provider,video.storage_bucket,video.storage_object_key)
 and proof.verified_at>=version.created_at and proof.byte_length=video.file_size_bytes
 and video.visibility='public' and video.moderation_status in ('clean','reported') and public.media_scan_public_safe(video.scan_status)
 and video.quarantined_at is null and not coalesce(video.vip_access_required,false)
 and proof.id=(select newest.id from private.native_production_source_proofs newest where newest.version_id=version.id order by verified_at desc,id desc limit 1)
 and proof.verified_at<=clock_timestamp() and proof.expires_at>clock_timestamp()
 and not exists(select 1 from private.native_production_source_revocations where proof_id=proof.id));
$$;
create function private.native_production_scope_current(p_scope uuid) returns boolean
language sql volatile set search_path='' as $$
 select exists(select 1 from private.native_production_scope_qualifications q where q.id=p_scope
 and q.verified_at<=clock_timestamp() and q.expires_at>clock_timestamp()
 and not exists(select 1 from private.native_production_scope_revocations where qualification_id=q.id)
 and q.id=(select newer.id from private.native_production_scope_qualifications newer
 where row(newer.provider,newer.project_id,newer.app_id,newer.store_account_id,newer.provider_product_id,newer.currency)
  =row(q.provider,q.project_id,q.app_id,q.store_account_id,q.provider_product_id,q.currency)
 order by verified_at desc,id desc limit 1));
$$;

-- Called only AFTER ordinary precharge authority, under its source/subject
-- locks. No caller supplies creator, account, source incarnation, share or terms.
create function private.prepare_native_production_video_admission(p_source uuid,p_provider text,p_product_key text,p_product text,p_amount integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v private.native_production_video_versions; proof private.native_production_source_proofs;
 q private.native_production_scope_qualifications; accepted uuid; now_at timestamptz:=clock_timestamp(); admission_id uuid; quote text; legal_role text;
 existing private.native_production_video_admissions; catalog_id uuid; mapping_id uuid;
begin
 select * into v from private.native_production_video_versions where source_id=p_source order by revision desc limit 1;
 select * into proof from private.native_production_source_proofs where version_id=v.id order by verified_at desc,id desc limit 1;
 select * into q from private.native_production_scope_qualifications where provider=p_provider and provider_product_id=p_product and currency='usd'
  order by verified_at desc,id desc limit 1;
 if p_provider='revenuecat_app_store' then
  -- Apple uses a retained conceptual product plus an exact production store
  -- mapping, not a Google-style production product row. Never promote a map.
  select product.id,mapping.id into catalog_id,mapping_id from public.monetization_product_store_mappings mapping
   join public.monetization_products product on product.id=mapping.product_id
   where product.product_key=p_product_key and product.product_type='paid_content_access'
    and mapping.provider=p_provider and mapping.provider_product_id=p_product and mapping.platform='ios' and mapping.store='app_store'
    and mapping.concept='paid_video' and mapping.store_product_type='consumable' and mapping.environment='production' and mapping.status='active'
    and mapping.reference_price_minor=p_amount and mapping.reference_currency='usd' and not mapping.grants_livekit_authority and not mapping.creates_payable_balance;
 else
  select id into catalog_id from public.monetization_products where product_key=p_product_key and provider=p_provider
   and provider_product_id=p_product and product_type='paid_content_access' and environment='production' and status='active';
 end if;
 -- Ambiguous provider projects/accounts cannot be resolved by newest timestamp.
 if (select count(distinct (project_id,app_id,store_account_id)) from private.native_production_scope_qualifications
   where provider=p_provider and provider_product_id=p_product and currency='usd')<>1
  or not private.native_production_source_current(v.id,proof.id) or not private.native_production_scope_current(q.id)
  or q.verified_at>now_at or proof.verified_at>now_at or catalog_id is null or auth.uid() is null or v.creator_id=auth.uid() then
  return jsonb_build_object('status','HELD','reason','production_source_or_scope_unqualified','dispatchAllowed',false);
 end if;
 select coalesce((select nullif(lower(btrim(channel_role)),'') from public.user_profiles where user_id=v.creator_id::text),'member') into legal_role;
 select acceptance.id into accepted from public.wave1_legal_acceptances acceptance
  join public.wave1_legal_document_versions document on document.document_key=acceptance.document_key
   and document.version=acceptance.document_version and document.market=acceptance.market and document.capability=acceptance.capability
  where acceptance.user_id=v.creator_id and acceptance.document_key=q.legal_document_key and acceptance.document_version=q.legal_document_version
   and acceptance.market='UNITED_STATES' and acceptance.role_key=legal_role and acceptance.capability='creator_money'
   and acceptance.invalidated_at is null and acceptance.accepted_at<=now_at and document.active and document.effective_at<=now_at
  order by acceptance.id limit 1;
 if accepted is null then return jsonb_build_object('status','HELD','reason','production_terms_unaccepted','dispatchAllowed',false); end if;
 select * into existing from private.native_production_video_admissions where buyer_id=auth.uid() and session_id=(auth.jwt()->>'session_id')::uuid
  and source_version_id=v.id and source_proof_id=proof.id and scope_id=q.id and catalog_product_id=catalog_id
  and store_mapping_id is not distinct from mapping_id and product_key=p_product_key and gross_minor=p_amount
  and terms_acceptance_id=accepted and terms_role_key=legal_role and expires_at>now_at order by created_at desc,id desc limit 1;
 if existing.id is not null then return jsonb_build_object('status','HELD','admissionId',existing.id,'quoteSha256',existing.quote_sha256,'dispatchAllowed',false); end if;
 -- This is a held, prospective preparation only. The existing production native
 -- money-intent constraint and SDK dispatch assertion remain unchanged.
 quote:=encode(extensions.digest(convert_to(jsonb_build_object('buyer',auth.uid(),'session',auth.jwt()->>'session_id',
  'version',v.id,'proof',proof.id,'scope',q.id,'catalog',catalog_id,'mapping',mapping_id,'productKey',p_product_key,'gross',p_amount,'currency','usd','quantity',1,
  'terms',q.terms_sha256,'acceptance',accepted,'shareBps',q.platform_share_bps,'createdAt',now_at,'expiresAt',now_at+interval '5 minutes')::text,'UTF8'),'sha256'),'hex');
 insert into private.native_production_video_admissions(buyer_id,session_id,creator_id,source_version_id,source_proof_id,scope_id,
  catalog_product_id,store_mapping_id,product_key,gross_minor,currency,quantity,terms_acceptance_id,terms_role_key,quote_sha256,created_at,expires_at)
 values(auth.uid(),(auth.jwt()->>'session_id')::uuid,v.creator_id,v.id,proof.id,q.id,catalog_id,mapping_id,p_product_key,p_amount,'usd',1,accepted,legal_role,quote,now_at,now_at+interval '5 minutes') returning native_production_video_admissions.id into admission_id;
 return jsonb_build_object('status','HELD','admissionId',admission_id,'quoteSha256',quote,'dispatchAllowed',false);
end $$;

-- Held-only preparation has its own normal authenticated return path. It never
-- continues to the still-prohibited production money-intent INSERT (which
-- would roll back an otherwise valid preparation inside the older SDK path).
create function public.prepare_native_production_paid_video(p_video_id uuid,p_provider text,p_product_key text,p_provider_product_id text,p_amount_minor integer)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
 then raise exception 'current_session_required'; end if;
 perform private.lock_ordinary_purchase_source_subjects('paid_content',p_video_id);
 return public.creator_video_paid_precharge_authority_internal(p_video_id,p_provider,p_product_key,p_provider_product_id,p_amount_minor,'usd','production');
end $$;
revoke all on function public.prepare_native_production_paid_video(uuid,text,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.prepare_native_production_paid_video(uuid,text,text,text,integer) to authenticated;

-- Integrate the held preparation into the existing ordinary paid-video source
-- authority. Sandbox and historical access responses are byte-for-byte intact.
alter function public.creator_video_paid_precharge_authority_internal(uuid,text,text,text,integer,text,text)
 rename to creator_video_paid_precharge_before_production_admission;
revoke all on function public.creator_video_paid_precharge_before_production_admission(uuid,text,text,text,integer,text,text)
 from public,anon,authenticated,service_role;
create function public.creator_video_paid_precharge_authority_internal(p_video_id uuid,p_expected_provider text,p_expected_product_key text,
 p_expected_provider_product_id text,p_expected_amount integer,p_expected_currency text,p_expected_environment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.creator_video_paid_precharge_before_production_admission(p_video_id,p_expected_provider,p_expected_product_key,
  p_expected_provider_product_id,p_expected_amount,p_expected_currency,p_expected_environment);
 if p_expected_environment='production' and result->'alreadyPurchased'='false'::jsonb then
  result:=result||jsonb_build_object('nativeProductionPreparation',private.prepare_native_production_video_admission(
   p_video_id,p_expected_provider,p_expected_product_key,p_expected_provider_product_id,p_expected_amount));
 end if;
 return result;
end $$;

create function private.bind_native_production_sale(p_receipt uuid) returns boolean
language plpgsql set search_path='' as $$
declare c private.native_production_purchase_correlations; a private.native_production_video_admissions;
 o private.native_production_paid_video_observations; q private.native_production_scope_qualifications;
begin
 perform pg_advisory_xact_lock(hashtextextended('native-production-accounting',0));
 select * into c from private.native_production_purchase_correlations where canonical_receipt_id=p_receipt;
 if c.canonical_receipt_id is null then return false; end if;
 select * into strict a from private.native_production_video_admissions where id=c.admission_id;
 select * into strict q from private.native_production_scope_qualifications where id=a.scope_id;
 select * into strict o from private.native_production_paid_video_observations where canonical_receipt_id=p_receipt;
 if row(o.provider,o.configured_project_id,o.reported_app_id,o.canonical_provider_product_id,o.buyer_id,o.transaction_id,o.original_transaction_id)
  is distinct from row(q.provider,q.project_id,q.app_id,q.provider_product_id,a.buyer_id,c.transaction_id,c.original_transaction_id)
  or o.event_type<>'NON_RENEWING_PURCHASE' or c.purchased_at<a.created_at or c.purchased_at>=a.expires_at
  or c.actual_gross_minor<>a.gross_minor or c.quantity<>a.quantity or c.verified_at<c.purchased_at
  or c.verified_at>clock_timestamp() or c.purchased_at>o.observed_at
  or q.verified_at>a.created_at or q.expires_at<=c.purchased_at
  or not exists(select 1 from public.provider_events receipt where receipt.id=p_receipt and receipt.product_id=a.catalog_product_id)
  or not exists(select 1 from private.native_production_source_proofs proof join private.native_production_video_versions version on version.id=proof.version_id
   where proof.id=a.source_proof_id and version.id=a.source_version_id and version.creator_id=a.creator_id
    and proof.verified_at<=a.created_at and proof.verified_at>=version.created_at and proof.expires_at>c.purchased_at and version.created_at<=a.created_at)
  or not exists(select 1 from public.wave1_legal_acceptances accepted where accepted.id=a.terms_acceptance_id
   and accepted.user_id=a.creator_id and accepted.document_key=q.legal_document_key and accepted.document_version=q.legal_document_version and accepted.market='UNITED_STATES'
   and accepted.role_key=a.terms_role_key and accepted.capability='creator_money' and accepted.accepted_at<=a.created_at
   and (accepted.invalidated_at is null or accepted.invalidated_at>a.created_at))
 then raise exception 'native_production_purchase_binding_mismatch'; end if;
 insert into private.native_production_sale_bindings(canonical_receipt_id,admission_id,provider,store_account_id,transaction_id)
 values(p_receipt,a.id,q.provider,q.store_account_id,c.transaction_id) on conflict(canonical_receipt_id) do nothing;
 return true;
end $$;

-- Normal authenticated receipt completion queues a bounded read obligation even
-- before an actual-report adapter is qualified. A duplicate cannot relabel the
-- original observation or upgrade its ingress qualification.
create function private.queue_native_production_report() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into private.native_production_report_jobs(canonical_receipt_id) values(new.canonical_receipt_id);
 return new;
end $$;
create trigger native_production_report_job after insert on private.native_production_paid_video_observations
 for each row execute function private.queue_native_production_report();

-- Internal adapter entry only. No API EXECUTE, generic CSV or JSON ingress is
-- granted. The real account/report reader and normalizer are still unqualified.
create function private.append_native_production_report(p_receipt uuid,p_observation jsonb) returns void
language plpgsql set search_path='' as $$
declare kind text:=p_observation->>'kind'; keys text[]; k text; a private.native_production_video_admissions;
 q private.native_production_scope_qualifications; c private.native_production_purchase_correlations; existing jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('native-production-accounting',0));
 if not private.bind_native_production_sale(p_receipt) then raise exception 'native_production_admission_correlation_missing'; end if;
 select admission.* into strict a from private.native_production_sale_bindings b join private.native_production_video_admissions admission on admission.id=b.admission_id where b.canonical_receipt_id=p_receipt;
 select * into strict q from private.native_production_scope_qualifications where id=a.scope_id;
 select * into strict c from private.native_production_purchase_correlations where canonical_receipt_id=p_receipt;
 keys:=array['id','kind','evidenceSha256','observedAt','provider','environment','projectId','appId','storeAccountId','productId','currency','buyerId','transactionId','originalTransactionId'];
 if kind='component' then keys:=keys||array['componentId','category','amountMinor','reportSchema','qualificationId','attribution'];
 elsif kind='coverage' then keys:=keys||array['revision','componentIds','reportSchema','qualificationId','through'];
 elsif kind in ('refund','revocation','chargeback') then keys:=keys||array['negativeId','effectiveAt','amountMinor'];
 else raise exception 'native_production_report_invalid'; end if;
 if jsonb_typeof(p_observation) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_observation))<>cardinality(keys)
  or exists(select 1 from jsonb_object_keys(p_observation) field where not field=any(keys)) then raise exception 'native_production_report_invalid'; end if;
 foreach k in array keys loop
  if k in ('amountMinor','revision','componentIds') then continue; end if;
  if jsonb_typeof(p_observation->k) is distinct from 'string' or length(p_observation->>k) not between 1 and 512
   or p_observation->>k<>btrim(p_observation->>k) or p_observation->>k ~ '[[:cntrl:]]' then raise exception 'native_production_report_invalid'; end if;
 end loop;
 if row(p_observation->>'provider',p_observation->>'environment',p_observation->>'projectId',p_observation->>'appId',p_observation->>'storeAccountId',p_observation->>'productId',p_observation->>'currency',p_observation->>'buyerId',p_observation->>'transactionId',p_observation->>'originalTransactionId')
  is distinct from row(q.provider,'production',q.project_id,q.app_id,q.store_account_id,q.provider_product_id,q.currency,a.buyer_id::text,c.transaction_id,c.original_transaction_id)
  then raise exception 'native_production_report_identity_mismatch'; end if;
 if p_observation->>'evidenceSha256' !~ '^[0-9a-f]{64}$'
  or p_observation->>'observedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$'
  or not isfinite((p_observation->>'observedAt')::timestamptz) or (p_observation->>'observedAt')::timestamptz>clock_timestamp()
 then raise exception 'native_production_report_invalid'; end if;
 if kind in ('component','coverage') and (p_observation->>'reportSchema' is distinct from q.report_schema
  or p_observation->>'qualificationId' is distinct from q.id::text) then raise exception 'native_production_report_scope_mismatch'; end if;
 if kind<>'coverage' and (jsonb_typeof(p_observation->'amountMinor') not in ('string','null')
  or (p_observation->>'amountMinor' is not null and (p_observation->>'amountMinor' !~ '^(0|[1-9][0-9]{0,18})$'
   or (p_observation->>'amountMinor')::numeric>9223372036854775807))) then raise exception 'native_production_report_amount_invalid'; end if;
 if kind='component' and (p_observation->>'category' not in ('store_fee','fee_tax','sales_tax','developer_proceeds')
  or p_observation->>'attribution' not in ('transaction','aggregate','unknown') or jsonb_typeof(p_observation->'componentId') is distinct from 'string'
  or length(p_observation->>'componentId') not between 1 and 512) then raise exception 'native_production_report_component_invalid'; end if;
 if kind='coverage' then
  if jsonb_typeof(p_observation->'revision') is distinct from 'number' or p_observation->>'revision' !~ '^[1-9][0-9]{0,8}$'
   or jsonb_typeof(p_observation->'componentIds') is distinct from 'array' or jsonb_array_length(p_observation->'componentIds')>1024
   or p_observation->>'through' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$'
   or not isfinite((p_observation->>'through')::timestamptz) or (p_observation->>'through')::timestamptz>(p_observation->>'observedAt')::timestamptz
   then raise exception 'native_production_report_coverage_invalid'; end if;
  if exists(select 1 from jsonb_array_elements(p_observation->'componentIds') item where jsonb_typeof(item)<>'string' or length(item#>>'{}') not between 1 and 512)
   or (select count(distinct item) from jsonb_array_elements(p_observation->'componentIds') item)<>jsonb_array_length(p_observation->'componentIds')
   then raise exception 'native_production_report_coverage_invalid'; end if;
 elsif kind in ('refund','revocation','chargeback') and (jsonb_typeof(p_observation->'negativeId') is distinct from 'string'
  or length(p_observation->>'negativeId') not between 1 and 512 or p_observation->>'effectiveAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$'
  or not isfinite((p_observation->>'effectiveAt')::timestamptz)
  or (p_observation->>'effectiveAt')::timestamptz>(p_observation->>'observedAt')::timestamptz) then raise exception 'native_production_report_negative_invalid'; end if;
 select facts into existing from private.native_production_report_observations where canonical_receipt_id=p_receipt and observation_id=p_observation->>'id';
 if existing is not null then
  if existing<>p_observation then raise exception 'native_production_report_observation_conflict'; end if;
  return;
 end if;
 if (select count(*) from private.native_production_report_observations where canonical_receipt_id=p_receipt)>=2048
 then raise exception 'native_production_report_capacity'; end if;
 insert into private.native_production_report_observations(canonical_receipt_id,observation_id,evidence_sha256,facts,observed_at)
 values(p_receipt,p_observation->>'id',p_observation->>'evidenceSha256',p_observation,(p_observation->>'observedAt')::timestamptz);
end $$;

create function private.evaluate_native_production_economics(p_receipt uuid) returns jsonb
language plpgsql volatile set search_path='' as $$
declare a private.native_production_video_admissions; q private.native_production_scope_qualifications;
 c private.native_production_purchase_correlations; o private.native_production_paid_video_observations;
 coverage jsonb; component record; category text; reasons text[]:=array[]::text[]; ids jsonb; manifest jsonb;
 fees numeric:=0; fee_tax numeric:=0; sales_tax numeric:=0; proceeds numeric:=0; component_amount numeric; platform numeric;
begin
 select admission.* into a from private.native_production_sale_bindings b join private.native_production_video_admissions admission
  on admission.id=b.admission_id where b.canonical_receipt_id=p_receipt;
 if a.id is null then raise exception 'native_production_sale_binding_missing'; end if;
 select * into strict q from private.native_production_scope_qualifications where id=a.scope_id;
 select * into strict c from private.native_production_purchase_correlations where canonical_receipt_id=p_receipt;
 select * into strict o from private.native_production_paid_video_observations where canonical_receipt_id=p_receipt;
 if not private.native_production_source_current(a.source_version_id,a.source_proof_id) then reasons:=array_append(reasons,'source_incarnation_or_proof_unavailable'); end if;
 if not private.native_production_scope_current(q.id) then reasons:=array_append(reasons,'scope_qualification_unavailable'); end if;
 if not exists(select 1 from public.monetization_products product where product.id=a.catalog_product_id and product.product_key=a.product_key
  and product.product_type='paid_content_access' and (
   (q.provider='revenuecat_google_play' and a.store_mapping_id is null and product.environment='production' and product.status='active'
    and product.provider=q.provider and product.provider_product_id=q.provider_product_id)
   or (q.provider='revenuecat_app_store' and exists(select 1 from public.monetization_product_store_mappings mapping
    where mapping.id=a.store_mapping_id and mapping.product_id=product.id and mapping.provider=q.provider
     and mapping.provider_product_id=q.provider_product_id and mapping.platform='ios' and mapping.store='app_store'
     and mapping.concept='paid_video' and mapping.store_product_type='consumable' and mapping.environment='production' and mapping.status='active'
     and mapping.reference_price_minor=a.gross_minor and mapping.reference_currency=a.currency and not mapping.grants_livekit_authority and not mapping.creates_payable_balance))))
 then reasons:=array_append(reasons,'production_catalog_unavailable'); end if;
 if not exists(select 1 from public.wave1_legal_acceptances acceptance join public.wave1_legal_document_versions document
  on document.document_key=acceptance.document_key and document.version=acceptance.document_version and document.market=acceptance.market and document.capability=acceptance.capability
  where acceptance.id=a.terms_acceptance_id and acceptance.invalidated_at is null and document.active and document.effective_at<=clock_timestamp()
   and acceptance.role_key=coalesce((select nullif(lower(btrim(channel_role)),'') from public.user_profiles where user_id=a.creator_id::text),'member'))
 then reasons:=array_append(reasons,'terms_acceptance_unavailable'); end if;
 if exists(select 1 from private.native_production_paid_video_observations terminal
  join private.native_production_paid_video_ledger_holds held on held.observation_id=terminal.canonical_receipt_id
  where terminal.provider=o.provider and terminal.original_transaction_id=o.original_transaction_id and terminal.buyer_id=o.buyer_id and held.negative_lifecycle)
  or exists(select 1 from public.revenuecat_unbound_terminal_authority terminal where terminal.provider=o.provider
   and terminal.original_transaction_id=o.original_transaction_id and terminal.user_id=o.buyer_id and terminal.environment='production')
  or exists(select 1 from private.native_production_report_observations report join private.native_production_paid_video_observations original
   on original.canonical_receipt_id=report.canonical_receipt_id where original.provider=o.provider
   and original.original_transaction_id=o.original_transaction_id and original.buyer_id=o.buyer_id and report.facts->>'kind' in ('refund','revocation','chargeback'))
 then reasons:=array_append(reasons,'negative_lifecycle_hold'); end if;
 select facts into coverage from private.native_production_report_observations where canonical_receipt_id=p_receipt and facts->>'kind'='coverage'
 order by (facts->>'revision')::integer desc,observed_at,observation_id limit 1;
 if coverage is null then reasons:=array_append(reasons,'coverage_missing');
 else
  if exists(select 1 from private.native_production_report_observations where canonical_receipt_id=p_receipt and facts->>'kind'='coverage'
   and facts->>'revision'=coverage->>'revision'
   and jsonb_build_array((select jsonb_agg(value order by value) from jsonb_array_elements(facts->'componentIds') value),facts->>'through',facts->>'reportSchema',facts->>'qualificationId')
    is distinct from jsonb_build_array((select jsonb_agg(value order by value) from jsonb_array_elements(coverage->'componentIds') value),coverage->>'through',coverage->>'reportSchema',coverage->>'qualificationId'))
  then reasons:=array_append(reasons,'coverage_conflict'); end if;
  if (coverage->>'through')::timestamptz<c.purchased_at then reasons:=array_append(reasons,'coverage_before_purchase'); end if;
 end if;
 select coalesce(jsonb_agg(id order by id),'[]'::jsonb) into ids from (select distinct facts->>'componentId' id
  from private.native_production_report_observations where canonical_receipt_id=p_receipt and facts->>'kind'='component') components;
 select coalesce(jsonb_agg(value order by value),'[]'::jsonb) into manifest from jsonb_array_elements(coverage->'componentIds') value;
 if ids<>manifest or jsonb_array_length(ids)=0 then reasons:=array_append(reasons,'coverage_incomplete'); end if;
 if exists(select 1 from private.native_production_report_observations where canonical_receipt_id=p_receipt and facts->>'kind'='component'
  group by facts->>'componentId' having count(distinct jsonb_build_array(facts->>'category',facts->'amountMinor',facts->>'reportSchema',facts->>'qualificationId',facts->>'attribution'))>1)
 then reasons:=array_append(reasons,'component_conflict'); end if;
 -- Complete attribution and temporal qualification are required on EVERY
 -- observation, including an older overlapping copy. A later copy cannot
 -- retroactively qualify original evidence. No floating-point arithmetic.
 if exists(select 1 from private.native_production_report_observations where canonical_receipt_id=p_receipt and facts->>'kind' in ('component','coverage')
  and (observed_at<q.verified_at or observed_at>=q.expires_at or observed_at<c.purchased_at or facts->>'qualificationId'<>q.id::text
   or facts->>'reportSchema'<>q.report_schema or (facts->>'kind'='component' and facts->>'attribution'<>'transaction')))
 then reasons:=array_append(reasons,'report_unqualified'); end if;
 foreach category in array array['store_fee','fee_tax','sales_tax','developer_proceeds'] loop
  if not exists(select 1 from private.native_production_report_observations where canonical_receipt_id=p_receipt
   and facts->>'kind'='component' and facts->>'category'=category)
   or exists(select 1 from private.native_production_report_observations where canonical_receipt_id=p_receipt
    and facts->>'kind'='component' and facts->>'category'=category and facts->>'amountMinor' is null)
  then reasons:=array_append(reasons,category||'_unknown'); end if;
 end loop;
 if (select count(distinct facts->>'componentId') from private.native_production_report_observations where canonical_receipt_id=p_receipt
  and facts->>'kind'='component' and facts->>'category'='developer_proceeds')<>1 then reasons:=array_append(reasons,'proceeds_total_ambiguous'); end if;
 for component in select distinct on (facts->>'componentId') facts from private.native_production_report_observations
  where canonical_receipt_id=p_receipt and facts->>'kind'='component' order by facts->>'componentId',observed_at,observation_id loop
  component_amount:=(component.facts->>'amountMinor')::numeric;
  if component_amount is null then continue; end if;
  case component.facts->>'category' when 'store_fee' then fees:=fees+component_amount; when 'fee_tax' then fee_tax:=fee_tax+component_amount;
   when 'sales_tax' then sales_tax:=sales_tax+component_amount; when 'developer_proceeds' then proceeds:=proceeds+component_amount; end case;
 end loop;
 if greatest(fees,fee_tax,sales_tax,proceeds)>9223372036854775807 then reasons:=array_append(reasons,'amount_overflow'); end if;
 if fees+fee_tax+sales_tax+proceeds<>c.actual_gross_minor then reasons:=array_append(reasons,'gross_tax_fee_proceeds_mismatch'); end if;
 if cardinality(reasons)=0 then platform:=floor(proceeds*q.platform_share_bps/10000); end if;
 return jsonb_build_object('protocol','native-production-persisted-economics-v1','status','HELD',
  'economicCoverageComplete',cardinality(reasons)=0,'creatorCandidateMinor',case when platform is not null then (proceeds-platform)::text end,
  'platformCandidateMinor',platform::text,'reasons',to_jsonb(reasons||array['production_ledger_adapter_unqualified']),
  'dispatchAllowed',false,'settlementAllowed',false,'financialAuthority',false,'payable',false);
end $$;
create function private.snapshot_native_production_economics(p_receipt uuid) returns void
language plpgsql set search_path='' as $$
declare result jsonb; digest text;
begin
 perform pg_advisory_xact_lock(hashtextextended('native-production-accounting',0));
 result:=private.evaluate_native_production_economics(p_receipt);
 select encode(extensions.digest(convert_to(jsonb_build_object('projection',result,'observations',
  coalesce(jsonb_agg(facts order by observation_id),'[]'::jsonb))::text,'UTF8'),'sha256'),'hex') into digest
 from private.native_production_report_observations where canonical_receipt_id=p_receipt;
 insert into private.native_production_economic_snapshots(canonical_receipt_id,evaluation_sha256,projection)
 values(p_receipt,digest,result) on conflict(canonical_receipt_id,evaluation_sha256) do nothing;
end $$;
create function private.complete_native_production_correlation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform private.bind_native_production_sale(new.canonical_receipt_id);
 perform private.snapshot_native_production_economics(new.canonical_receipt_id);
 return new;
end $$;
create trigger native_production_correlation_complete after insert on private.native_production_purchase_correlations
 for each row execute function private.complete_native_production_correlation();
create function private.complete_native_production_report() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform private.snapshot_native_production_economics(new.canonical_receipt_id);return new;end $$;
create trigger native_production_report_complete after insert on private.native_production_report_observations
 for each row execute function private.complete_native_production_report();

-- The existing service review endpoint now exposes a current re-evaluation, not
-- a stale last snapshot. Old unbound observations retain their original HELD
-- shape. No raw report, account ID, source location or provider ID is returned.
alter function public.get_native_production_paid_video_hold(uuid) rename to get_native_production_paid_video_hold_before_reports;
revoke all on function public.get_native_production_paid_video_hold_before_reports(uuid) from public,anon,authenticated,service_role;
create function public.get_native_production_paid_video_hold(p_canonical_receipt_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.get_native_production_paid_video_hold_before_reports(p_canonical_receipt_id);
 if exists(select 1 from private.native_production_sale_bindings where canonical_receipt_id=p_canonical_receipt_id) then
  result:=result||jsonb_build_object('prospectiveEconomics',private.evaluate_native_production_economics(p_canonical_receipt_id));
 end if;
 return result;
end $$;
revoke all on function public.get_native_production_paid_video_hold(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_native_production_paid_video_hold(uuid) to service_role;

-- Canonical native production identity plus retained dedicated provenance, not
-- the presence of a release row, determines whether this domain must hold.
create function private.native_production_earning_in_domain(p_earning uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from private.native_production_earning_sources where earnings_ledger_id=p_earning)
 or exists(select 1 from public.creator_earnings_ledger e left join public.money_access_ledger_events m on m.id=e.money_ledger_event_id
  where e.id=p_earning and (e.source_type='paid_content' or m.source_type='paid_content')
  and (m.environment='production' or m.id is null)
  and (not exists(select 1 from public.provider_events receipt where receipt.id=coalesce(m.provider_event_id,e.provider_event_id))
   or (m.provider_event_id is not null and e.provider_event_id is not null and m.provider_event_id<>e.provider_event_id)
   or exists(select 1 from public.provider_events receipt where receipt.id=coalesce(m.provider_event_id,e.provider_event_id) and receipt.environment is distinct from 'production')))
 or exists(select 1 from public.creator_earnings_ledger e left join public.money_access_ledger_events m on m.id=e.money_ledger_event_id
  join public.provider_events receipt on receipt.id=e.provider_event_id or receipt.id=m.provider_event_id
  where e.id=p_earning and receipt.environment='production' and receipt.provider in ('revenuecat_app_store','revenuecat_google_play')
  and (e.source_type='paid_content' or m.source_type='paid_content'
   or exists(select 1 from private.native_production_paid_video_observations o where o.canonical_receipt_id=receipt.id)
   or exists(select 1 from public.monetization_products product where product.id=receipt.product_id and product.product_type='paid_content_access')));
$$;
create function private.native_production_current_earning_domain_ready(p_earning uuid) returns boolean
language sql stable set search_path='' as $$
 -- Deliberately no positive branch. Even complete held snapshots are not a
 -- funding/maturity/tax/recipient qualification and cannot release an earning.
 select not private.native_production_earning_in_domain(p_earning);
$$;
alter function private.commerce_current_earning_domain_ready(uuid) rename to commerce_current_earning_domain_before_native;
create function private.commerce_current_earning_domain_ready(p_earning uuid) returns boolean
language plpgsql stable set search_path='' as $$
begin
 if private.native_production_current_earning_domain_ready(p_earning) is distinct from true then return false; end if;
 return private.commerce_current_earning_domain_before_native(p_earning);
end $$;
-- No new cashout locks: native readiness is unconditionally false, so no
-- source/report/terminal interleaving can make it eligible. A positive successor
-- must first coordinate every writer and final-dispatch fence. Existing commerce
-- locks, funded-return, reversal and GET reconciliation are left unchanged.
do $$ declare f record; begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='private'::regnamespace and
 (proname like '%native_production%' or proname in ('commerce_current_earning_domain_before_native','commerce_current_earning_domain_ready','lock_commerce_cashout_domains_before_native','lock_commerce_cashout_domains')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
revoke all on function public.creator_video_paid_precharge_authority_internal(uuid,text,text,text,integer,text,text) from public,anon,authenticated,service_role;
