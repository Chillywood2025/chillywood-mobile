-- Source only. No enrollment, credentials, license testers, tax configuration,
-- provider writes or reporter activation are provisioned by this migration.
create table private.google_play_external_program_config (
  id uuid primary key default gen_random_uuid(),
  package_name text not null check(package_name ~ '^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$'),
  environment text not null check(environment='test'),
  enrollment_evidence text not null check(length(btrim(enrollment_evidence)) between 1 and 300),
  license_test_qualification_evidence text not null check(length(btrim(license_test_qualification_evidence)) between 1 and 300),
  tax_configuration_evidence text not null check(length(btrim(tax_configuration_evidence)) between 1 and 300),
  reporter_configuration_evidence text not null check(length(btrim(reporter_configuration_evidence)) between 1 and 300),
  native_build_qualification_evidence text not null check(length(btrim(native_build_qualification_evidence)) between 1 and 300),
  verified_at timestamptz not null,
  expires_at timestamptz not null check(expires_at>verified_at and expires_at<=verified_at+interval '24 hours'),
  enabled boolean not null default false,
  revoked_at timestamptz
);
alter table private.google_play_external_program_config enable row level security;
alter table private.google_play_external_program_config force row level security;
revoke all on private.google_play_external_program_config from public,anon,authenticated,service_role;
-- Qualified provisioning/revocation requires a separately designed service RPC.
-- No API role receives direct private-table privileges.
create trigger google_play_external_program_immutable before update on private.google_play_external_program_config
for each row execute function private.guard_creator_external_payment_evidence();

create function private.google_play_external_program_ready(p_capability_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.creator_external_payment_capabilities c
   where c.id=p_capability_id and c.platform='android' and c.storefront_country='US'
     and c.route_kind='android_external_content_link' and c.environment='test'
     and c.enabled and c.revoked_at is null and c.verified_at<=clock_timestamp() and c.expires_at>clock_timestamp()
     and exists(select 1 from private.google_play_external_program_config p where p.environment=c.environment
       and p.enabled and p.revoked_at is null and p.verified_at<=clock_timestamp() and p.expires_at>clock_timestamp()));
$$;
revoke all on function private.google_play_external_program_ready(uuid) from public,anon,authenticated,service_role;

create table private.google_play_external_admissions (
  id uuid primary key default gen_random_uuid(),
  eligibility_id uuid not null unique references private.creator_external_payment_eligibility(id),
  capability_id uuid not null references private.creator_external_payment_capabilities(id),
  program_id uuid not null references private.google_play_external_program_config(id),
  buyer_id uuid not null,session_id uuid not null,creator_id uuid not null,
  feature text not null check(feature in('creator_tip','event_auction','room_seat_auction')),
  source_id uuid not null,amount_minor integer not null check(amount_minor>0),
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  verification text not null default 'native_sdk_observation_unverified' check(verification='native_sdk_observation_unverified'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '2 minutes'
);
alter table private.google_play_external_admissions enable row level security;
alter table private.google_play_external_admissions force row level security;
revoke all on private.google_play_external_admissions from public,anon,authenticated,service_role;
create trigger google_external_admission_immutable before update or delete on private.google_play_external_admissions
for each row execute function private.guard_event_ticket_terms_immutable();

create function public.admit_google_play_external_session(p_feature text,p_creator_id uuid,p_amount_minor integer,
  p_source_id uuid,p_external_transaction_token text,p_api_version integer,p_capability_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare buyer uuid:=auth.uid(); session uuid; cap private.creator_external_payment_capabilities;
  program private.google_play_external_program_config; a private.google_play_external_admissions;
  hash text; admission uuid:=gen_random_uuid(); eligibility uuid:=gen_random_uuid(); room_source_valid boolean;
begin
 if buyer is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
 then raise exception 'google_external_buyer_authority_required'; end if;
 session:=(auth.jwt()->>'session_id')::uuid;
 if p_api_version is distinct from 1 or p_external_transaction_token is null
   or length(p_external_transaction_token) not between 1 and 16384 or p_source_id is null
   or p_amount_minor is null or p_amount_minor<=0 or p_creator_id is null or buyer=p_creator_id
   or p_feature not in('creator_tip','event_auction','room_seat_auction')
   or not public.wave1_creator_money_subject_authorized_internal(p_creator_id)
 then raise exception 'google_external_native_observation_required'; end if;
 if p_feature='event_auction' and not exists(select 1 from private.creator_event_auctions
   where id=p_source_id and creator_id=p_creator_id and state in('open','awarded','payment_pending'))
 then raise exception 'google_external_source_invalid'; end if;
 if p_feature='room_seat_auction' then
   if to_regclass('private.creator_room_seat_auctions') is null then raise exception 'google_external_source_invalid'; end if;
   execute 'select exists(select 1 from private.creator_room_seat_auctions where id=$1 and creator_id=$2
     and state in(''open'',''awarded'',''payment_pending''))' into room_source_valid using p_source_id,p_creator_id;
   if not room_source_valid then raise exception 'google_external_source_invalid'; end if;
 end if;
 hash:=encode(extensions.digest(p_external_transaction_token,'sha256'),'hex');
 -- Serialize the per-session rate decision as well as token uniqueness.
 perform pg_advisory_xact_lock(hashtextextended('google-external-buyer:'||buyer||':'||session,0));
 perform pg_advisory_xact_lock(hashtextextended('google-external-admission:'||hash,0));
 select * into a from private.google_play_external_admissions where token_hash=hash;
 if a.id is not null then
   if row(a.buyer_id,a.session_id,a.feature,a.creator_id,a.source_id,a.amount_minor)
     is distinct from row(buyer,session,p_feature,p_creator_id,p_source_id,p_amount_minor)
     or (p_capability_id is not null and a.capability_id<>p_capability_id)
     or a.expires_at<=clock_timestamp() or not private.google_play_external_program_ready(a.capability_id)
   then raise exception 'google_external_token_reused'; end if;
 else
   -- Bounded automatic observation intake, not a manual buyer approval queue.
   if (select count(*) from private.google_play_external_admissions
     where buyer_id=buyer and session_id=session and created_at>clock_timestamp()-interval '1 minute')>=10
   then raise exception 'google_external_observation_rate_limited'; end if;
   select * into cap from private.creator_external_payment_capabilities c where c.feature=p_feature
     and (p_capability_id is null or c.id=p_capability_id)
     and c.creator_id=p_creator_id and c.currency='usd' and c.environment='test'
     and p_amount_minor between c.min_amount_minor and c.max_amount_minor
     and private.google_play_external_program_ready(c.id)
     order by c.created_at desc,c.id limit 1 for share;
   if cap.id is null then raise exception 'google_external_program_unavailable'; end if;
   select * into program from private.google_play_external_program_config where enabled and revoked_at is null
     and environment='test' and verified_at<=clock_timestamp() and expires_at>clock_timestamp()+interval '2 minutes'
     order by verified_at desc,id limit 1 for share;
   if program.id is null then raise exception 'google_external_program_unavailable'; end if;
   insert into private.creator_external_payment_eligibility(id,capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
     values(eligibility,cap.id,buyer,session,'native_sdk_observation_unverified:'||admission,clock_timestamp(),clock_timestamp()+interval '2 minutes');
   insert into private.google_play_external_admissions(id,eligibility_id,capability_id,program_id,buyer_id,session_id,
     creator_id,feature,source_id,amount_minor,token_hash)
     values(admission,eligibility,cap.id,program.id,buyer,session,p_creator_id,p_feature,p_source_id,p_amount_minor,hash)
     returning * into a;
 end if;
 return jsonb_build_object('admissionId',a.id,'capabilityId',a.capability_id,'expiresAt',a.expires_at,
   'verification',a.verification,'financialAuthority',false,'accessGranted',false);
end; $$;
revoke all on function public.admit_google_play_external_session(text,uuid,integer,uuid,text,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admit_google_play_external_session(text,uuid,integer,uuid,text,integer,uuid) to authenticated;
create function public.admit_google_play_external_session(p_feature text,p_creator_id uuid,p_amount_minor integer,
  p_source_id uuid,p_external_transaction_token text,p_api_version integer)
returns jsonb language sql security invoker set search_path='' as $$
 select public.admit_google_play_external_session(p_feature,p_creator_id,p_amount_minor,p_source_id,p_external_transaction_token,p_api_version,null::uuid);
$$;
revoke all on function public.admit_google_play_external_session(text,uuid,integer,uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.admit_google_play_external_session(text,uuid,integer,uuid,text,integer) to authenticated;

-- Retain every existing recipient/money/session control. Android's branch is
-- only quote preparation using a fresh, explicitly UNVERIFIED SDK observation
-- plus global provider/native/reporter qualification, never a manual per-buyer
-- approval or fake Google attestation. Native eligibility/disclosure is still
-- mandatory; the opaque token has no public server verification endpoint.
do $android_resolver$
declare body text; needle text;
begin
 body:=pg_get_functiondef('private.resolve_creator_external_payment_capability(uuid,uuid,text,uuid,integer,text,text,uuid)'::regprocedure);
 needle:=$needle$and capability.route_kind='external_browser_checkout'
    -- Android requires a native external-content-link adapter plus reporting.
    -- No such integration is established here; a browser capability cannot
    -- substitute for it, even if a service row claims Android eligibility.
    and capability.platform in ('web','ios')
    and capability.storefront_country='US'$needle$;
 if position(needle in body)=0 then raise exception 'google_external_resolver_source_changed'; end if;
 body:=replace(body,needle,$replacement$and ((capability.route_kind='external_browser_checkout' and capability.platform in('web','ios')
      and capability.storefront_country='US')
      or (private.google_play_external_program_ready(capability.id)
        and exists(select 1 from private.google_play_external_admissions observation
          where observation.eligibility_id=eligibility.id and observation.capability_id=capability.id
            and observation.buyer_id=p_buyer_id and observation.session_id=p_session_id
            and observation.creator_id=p_creator_id and observation.feature=p_feature
            and observation.amount_minor=p_amount_minor and observation.expires_at>clock_timestamp()
            and observation.verification='native_sdk_observation_unverified')))$replacement$);
 needle:='where capability_id=c.id and buyer_id=p_buyer_id and session_id=p_session_id';
 if position(needle in body)=0 then raise exception 'google_external_eligibility_source_changed'; end if;
 body:=replace(body,needle,needle||$replacement$
      and (c.platform<>'android' or exists(select 1 from private.google_play_external_admissions observation
        where observation.eligibility_id=private.creator_external_payment_eligibility.id
          and observation.amount_minor=p_amount_minor and observation.expires_at>clock_timestamp()))$replacement$);
 execute body;
end; $android_resolver$;

-- The server's resolved route, not a client flag, selects inclusive automatic
-- tax. Freeze these provider parameters in the original idempotent quote;
-- adding them only during dispatch would change a retry's request body.
do $android_tip_tax$
declare body text; needle text;
begin
 body:=pg_get_functiondef('public.reserve_creator_tip_checkout_attempt(uuid,uuid,uuid,jsonb)'::regprocedure);
 needle:=$needle$then raise exception 'tip_checkout_capability_mismatch'; end if;$needle$;
 if position(needle in body)=0 then raise exception 'google_external_tip_reservation_source_changed'; end if;
 body:=replace(body,needle,needle||$replacement$
    if capability->>'routeKind'='android_external_content_link' then
      body:=body||jsonb_build_object('automatic_tax[enabled]',true,
        'line_items[0][price_data][tax_behavior]','inclusive','billing_address_collection','required');
    end if;$replacement$);
 execute body;
end; $android_tip_tax$;

create table private.google_play_external_launch_bindings (
  id uuid primary key default gen_random_uuid(),
  feature text not null check(feature in('creator_tip','event_auction','room_seat_auction')),
  quote_id uuid not null,buyer_id uuid not null,session_id uuid not null,
  capability_id uuid not null references private.creator_external_payment_capabilities(id),
  program_id uuid not null references private.google_play_external_program_config(id),
  amount_minor integer not null check(amount_minor>0),currency text not null check(currency='usd'),
  external_transaction_token text not null check(length(external_transaction_token) between 1 and 16384),
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  -- This is unverified opaque native SDK input, NOT Google attestation or
  -- financial/access authority. Only verified Stripe settlement supplies that.
  token_source text not null default 'native_sdk_unverified' check(token_source='native_sdk_unverified'),
  created_at timestamptz not null default clock_timestamp()
);
create index google_external_launch_quote on private.google_play_external_launch_bindings(feature,quote_id,created_at desc);
alter table private.google_play_external_launch_bindings enable row level security;
alter table private.google_play_external_launch_bindings force row level security;
revoke all on private.google_play_external_launch_bindings from public,anon,authenticated,service_role;
create trigger google_external_launch_immutable before update or delete on private.google_play_external_launch_bindings
for each row execute function private.guard_event_ticket_terms_immutable();

create table private.google_play_external_transactions (
  id uuid primary key default gen_random_uuid(),
  binding_id uuid not null references private.google_play_external_launch_bindings(id),
  feature text not null,quote_id uuid not null,
  original_pre_tax_minor integer check(original_pre_tax_minor>=0),
  original_tax_minor integer check(original_tax_minor>=0),
  transaction_time timestamptz,
  reported_refund_minor integer not null default 0,
  remaining_pre_tax_minor integer,remaining_tax_minor integer,
  create_reported boolean not null default false,
  unique(feature,quote_id)
);
create table private.google_play_external_report_outbox (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references private.google_play_external_transactions(id),
  operation text not null check(operation in('create','refund')),
  cumulative_refund_minor integer not null default 0 check(cumulative_refund_minor>=0),
  occurred_at timestamptz not null,
  target_pre_tax_minor integer,target_tax_minor integer,
  state text not null default 'pending' check(state in('pending','leased','unknown','retry','blocked_tax','needs_review','reported')),
  reason text,
  attempt_count integer not null default 0,
  lease_id uuid,lease_until timestamptz,
  next_attempt_at timestamptz not null default clock_timestamp(),
  canonical_receipt jsonb,
  created_at timestamptz not null default clock_timestamp(),
  reported_at timestamptz,
  unique(transaction_id,operation,cumulative_refund_minor)
);
create table private.google_play_external_report_events (
  feature text not null,quote_id uuid not null,provider_event_id text not null,
  payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  primary key(feature,quote_id,provider_event_id)
);
alter table private.google_play_external_transactions enable row level security;
alter table private.google_play_external_transactions force row level security;
alter table private.google_play_external_report_outbox enable row level security;
alter table private.google_play_external_report_outbox force row level security;
alter table private.google_play_external_report_events enable row level security;
alter table private.google_play_external_report_events force row level security;
revoke all on private.google_play_external_transactions,private.google_play_external_report_outbox,
  private.google_play_external_report_events from public,anon,authenticated,service_role;

create function public.bind_google_play_external_checkout(p_buyer_id uuid,p_session_id uuid,p_feature text,
  p_quote_id uuid,p_external_transaction_token text,p_api_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cap uuid; amount integer; curr text; source uuid; binding private.google_play_external_launch_bindings;
  program private.google_play_external_program_config; hash text; admission private.google_play_external_admissions;
begin
 if auth.role() is distinct from 'service_role' or not public.creator_tip_buyer_session_authority_internal(p_buyer_id,p_session_id)
 then raise exception 'google_external_buyer_authority_required'; end if;
 if p_api_version is distinct from 1 or p_external_transaction_token is null
   or length(p_external_transaction_token) not between 1 and 16384
 then raise exception 'google_external_native_token_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('google-external:'||p_feature||':'||p_quote_id,0));
 if p_feature='creator_tip' then
   select (a.external_capability->>'capabilityId')::uuid,t.tip_amount_cents,t.currency,a.request_id into cap,amount,curr,source
   from private.creator_tip_checkout_attempts a join public.creator_tip_transactions t on t.id=a.tip_id
   where a.tip_id=p_quote_id and a.buyer_id=p_buyer_id and a.session_id=p_session_id
     and t.sender_id=p_buyer_id and t.buyer_session_generation=p_session_id
     and t.status in('pending','checkout_started') and a.retry_until>clock_timestamp()
     and a.request_body->>'automatic_tax[enabled]'='true'
     and a.request_body->>'line_items[0][price_data][tax_behavior]'='inclusive'
     and a.request_body->>'billing_address_collection'='required'
     and (a.request_body->>'expires_at')::bigint>extract(epoch from clock_timestamp());
 elsif p_feature='event_auction' then
   select q.capability_id,q.amount_minor,q.currency,q.auction_id into cap,amount,curr,source
   from private.creator_event_auction_quotes q where q.id=p_quote_id and q.buyer_id=p_buyer_id
     and q.session_id=p_session_id and q.superseded_at is null and q.expires_at>clock_timestamp()
     and q.checkout_attempt_id is not null;
 elsif p_feature='room_seat_auction' and to_regclass('private.creator_room_auction_quotes') is not null then
   -- Room schema is installed by a later forward migration. Identifiers are
   -- fixed source, never caller SQL; values remain bound parameters.
   execute 'select capability_id,amount_minor,currency,auction_id from private.creator_room_auction_quotes
     where id=$1 and buyer_id=$2 and session_id=$3 and superseded_at is null and expires_at>clock_timestamp()
       and checkout_attempt_id is not null' into cap,amount,curr,source using p_quote_id,p_buyer_id,p_session_id;
 end if;
 if cap is null or curr is distinct from 'usd' or not private.google_play_external_program_ready(cap)
   or exists(select 1 from private.google_play_external_transactions where feature=p_feature and quote_id=p_quote_id)
 then raise exception 'google_external_quote_unavailable'; end if;
 hash:=encode(extensions.digest(p_external_transaction_token,'sha256'),'hex');
 select * into admission from private.google_play_external_admissions where token_hash=hash
   and buyer_id=p_buyer_id and session_id=p_session_id and feature=p_feature and source_id=source
   and amount_minor=amount and capability_id=cap and expires_at>clock_timestamp();
 if admission.id is null then raise exception 'google_external_admission_required'; end if;
 select * into program from private.google_play_external_program_config where id=admission.program_id and enabled
   and revoked_at is null and verified_at<=clock_timestamp() and expires_at>clock_timestamp() for share;
 if program.id is null then raise exception 'google_external_program_unavailable'; end if;
 select * into binding from private.google_play_external_launch_bindings where token_hash=hash;
 if binding.id is not null then
   if binding.feature is distinct from p_feature or binding.quote_id is distinct from p_quote_id
     or binding.buyer_id is distinct from p_buyer_id or binding.session_id is distinct from p_session_id
     or binding.created_at<clock_timestamp()-interval '2 minutes'
   then raise exception 'google_external_token_reused'; end if;
 else
   insert into private.google_play_external_launch_bindings(feature,quote_id,buyer_id,session_id,capability_id,
     program_id,amount_minor,currency,external_transaction_token,token_hash)
   values(p_feature,p_quote_id,p_buyer_id,p_session_id,cap,program.id,amount,curr,p_external_transaction_token,hash)
   returning * into binding;
 end if;
 return jsonb_build_object('bindingId',binding.id,'routeKind','android_external_content_link');
end; $$;
revoke all on function public.bind_google_play_external_checkout(uuid,uuid,text,uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.bind_google_play_external_checkout(uuid,uuid,text,uuid,text,integer) to service_role;

-- Called only INSIDE a verified, exact-quote Stripe projection transaction.
-- Missing tax facts block reporting durably; they do not undo financial truth
-- or cause a new Checkout/charge. No client may invoke this function.
create function private.enqueue_google_play_external_report(p_feature text,p_quote_id uuid,p_evidence jsonb,p_payload_hash text)
returns void language plpgsql security definer set search_path='' as $$
declare b private.google_play_external_launch_bindings;t private.google_play_external_transactions;
  tax jsonb:=p_evidence->'googlePlayTax'; tax_minor integer; pre_tax integer;
  refunded integer; occurred timestamptz; prior_hash text;
begin
 if p_evidence->>'outcome' not in('paid','refunded') then return; end if;
 perform pg_advisory_xact_lock(hashtextextended('google-external:'||p_feature||':'||p_quote_id,0));
 select * into b from private.google_play_external_launch_bindings where feature=p_feature and quote_id=p_quote_id
   order by created_at desc,id limit 1;
 if b.id is null then return; end if;
 if (p_evidence->>'amountMinor')::integer is distinct from b.amount_minor
   or p_evidence->>'currency' is distinct from b.currency
   or coalesce(p_evidence->>'eventId','')!~'^evt_[A-Za-z0-9_]+$'
 then raise exception 'google_external_financial_binding_mismatch'; end if;
 select payload_hash into prior_hash from private.google_play_external_report_events
   where feature=p_feature and quote_id=p_quote_id and provider_event_id=p_evidence->>'eventId';
 if prior_hash is not null then
   if prior_hash is distinct from p_payload_hash then raise exception 'google_external_event_conflict'; end if;
   return;
 end if;
 begin
   occurred:=(p_evidence->>'occurredAt')::timestamptz;
   if not isfinite(occurred) then occurred:=null; end if;
 exception when invalid_datetime_format or datetime_field_overflow then occurred:=null;
 end;
 insert into private.google_play_external_report_events(feature,quote_id,provider_event_id,payload_hash)
   values(p_feature,p_quote_id,p_evidence->>'eventId',p_payload_hash);
 insert into private.google_play_external_transactions(binding_id,feature,quote_id)
   values(b.id,p_feature,p_quote_id) on conflict(feature,quote_id) do nothing;
 select * into t from private.google_play_external_transactions where feature=p_feature and quote_id=p_quote_id for update;
 if p_evidence->>'outcome'='paid' then
   if tax->>'provenance'='stripe_checkout_automatic_tax_complete' and tax->>'countryCode'='US'
     and tax->>'taxAmountMinor' ~ '^(0|[1-9][0-9]*)$' and tax->>'preTaxAmountMinor' ~ '^(0|[1-9][0-9]*)$'
     and (tax->>'taxAmountMinor')::numeric+(tax->>'preTaxAmountMinor')::numeric=b.amount_minor then
     tax_minor:=(tax->>'taxAmountMinor')::integer;pre_tax:=(tax->>'preTaxAmountMinor')::integer;
   end if;
   if t.transaction_time is null then
     update private.google_play_external_transactions set transaction_time=occurred,original_pre_tax_minor=pre_tax,
       original_tax_minor=tax_minor,remaining_pre_tax_minor=pre_tax,remaining_tax_minor=tax_minor where id=t.id;
   elsif t.original_pre_tax_minor is null and pre_tax is not null then
     update private.google_play_external_transactions set original_pre_tax_minor=pre_tax,original_tax_minor=tax_minor,
       remaining_pre_tax_minor=pre_tax,remaining_tax_minor=tax_minor where id=t.id;
   end if;
   insert into private.google_play_external_report_outbox(transaction_id,operation,occurred_at,state,reason)
     values(t.id,'create',coalesce(occurred,clock_timestamp()),
       case when occurred is null then 'needs_review' when pre_tax is null then 'blocked_tax' else 'pending' end,
       case when occurred is null then 'verified_transaction_time_required' when pre_tax is null then 'verified_tax_provenance_required' end)
     on conflict(transaction_id,operation,cumulative_refund_minor) do update
       set state=case when private.google_play_external_report_outbox.state='blocked_tax' and pre_tax is not null
         then 'pending' else private.google_play_external_report_outbox.state end;
   if tax_minor=0 then
     update private.google_play_external_report_outbox set target_pre_tax_minor=b.amount_minor-cumulative_refund_minor,
       target_tax_minor=0,state='pending',reason=null
     where transaction_id=t.id and operation='refund' and state='blocked_tax'
       and reason='verified_refund_tax_provenance_required';
   end if;
 else
   refunded:=(p_evidence->>'refundedAmountMinor')::integer;
   if refunded is null or refunded<=0 or refunded>b.amount_minor then raise exception 'google_external_refund_invalid'; end if;
   if refunded<=t.reported_refund_minor then return; end if;
   -- Full refund is exact regardless of allocation. Zero-tax originals permit
   -- exact partial allocation. Taxed partials require separately verified tax
   -- reversal evidence; never invent a proportional allocation.
   if refunded=b.amount_minor then pre_tax:=0;tax_minor:=0;
   elsif t.original_tax_minor=0 then pre_tax:=b.amount_minor-refunded;tax_minor:=0;
   end if;
   insert into private.google_play_external_report_outbox(transaction_id,operation,cumulative_refund_minor,
     occurred_at,target_pre_tax_minor,target_tax_minor,state,reason)
   values(t.id,'refund',refunded,coalesce(occurred,clock_timestamp()),pre_tax,tax_minor,
     case when occurred is null then 'needs_review' when pre_tax is null then 'blocked_tax' else 'pending' end,
     case when occurred is null then 'verified_refund_time_required' when pre_tax is null then 'verified_refund_tax_provenance_required' end)
   on conflict(transaction_id,operation,cumulative_refund_minor) do nothing;
 end if;
end; $$;
revoke all on function private.enqueue_google_play_external_report(text,uuid,jsonb,text) from public,anon,authenticated,service_role;

create function private.enqueue_google_play_auction_receipt()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.provider_record_id is not null and new.outcome in('paid','refunded') then
   perform private.enqueue_google_play_external_report(coalesce(tg_argv[0],'event_auction'),new.quote_id,new.evidence,new.payload_hash);
 end if;
 return new;
end; $$;
revoke all on function private.enqueue_google_play_auction_receipt() from public,anon,authenticated,service_role;
create trigger google_play_auction_report_outbox after insert on private.creator_event_auction_receipts
for each row execute function private.enqueue_google_play_auction_receipt();

create function public.claim_google_play_external_report(p_lease_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o private.google_play_external_report_outbox;t private.google_play_external_transactions;
 b private.google_play_external_launch_bindings;p private.google_play_external_program_config;
begin
 if auth.role() is distinct from 'service_role' or p_lease_id is null then raise exception 'service_role_required'; end if;
 -- Serialize one claim decision; leases then serialize each transaction across
 -- workers. A crash does not acknowledge or discard the pending report.
 perform pg_advisory_xact_lock(hashtextextended('google-external-report-claim',0));
 select candidate.* into o from private.google_play_external_report_outbox candidate
 join private.google_play_external_transactions tx on tx.id=candidate.transaction_id
 where candidate.state in('pending','retry','unknown','leased') and candidate.next_attempt_at<=clock_timestamp()
   and (candidate.lease_until is null or candidate.lease_until<clock_timestamp())
   and tx.original_pre_tax_minor is not null and tx.original_tax_minor is not null and tx.transaction_time is not null
   and (candidate.operation='create' or tx.create_reported)
   and not exists(select 1 from private.google_play_external_report_outbox other where other.transaction_id=tx.id
     and other.id<>candidate.id and other.state='leased' and other.lease_until>=clock_timestamp())
   and (candidate.operation='create' or (candidate.target_pre_tax_minor=0 and candidate.target_tax_minor=0)
     or not exists(select 1 from private.google_play_external_report_outbox earlier
     where earlier.transaction_id=tx.id and earlier.operation='refund' and earlier.state<>'reported'
       and earlier.cumulative_refund_minor<candidate.cumulative_refund_minor))
 order by candidate.created_at,candidate.id limit 1;
 if o.id is null then return null; end if;
 -- Consistent lock order with webhook enqueue and completion: transaction,
 -- then outbox. Never hold an outbox row while waiting on its transaction.
 select * into t from private.google_play_external_transactions where id=o.transaction_id for update;
 select * into o from private.google_play_external_report_outbox where id=o.id for update;
 if o.state not in('pending','retry','unknown','leased')
   or (o.lease_until is not null and o.lease_until>=clock_timestamp()) then return null; end if;
 select * into b from private.google_play_external_launch_bindings where id=t.binding_id;
 select * into p from private.google_play_external_program_config where id=b.program_id;
 update private.google_play_external_report_outbox set state='leased',lease_id=p_lease_id,
   lease_until=clock_timestamp()+interval '2 minutes',attempt_count=attempt_count+1 where id=o.id;
 return jsonb_build_object('outboxId',o.id,'leaseId',p_lease_id,'report',jsonb_build_object(
   'externalTransactionId',t.id,'packageName',p.package_name,'operation',o.operation,
   'externalTransactionToken',case when o.operation='create' then b.external_transaction_token end,
   'environment','test','licenseTestQualified',true,
   'originalPreTaxMinor',t.original_pre_tax_minor,'originalTaxMinor',t.original_tax_minor,
   'transactionTime',to_char(t.transaction_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'refundTime',to_char(o.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'refundId',o.id,'refundPreTaxMinor',t.remaining_pre_tax_minor-o.target_pre_tax_minor,
   'previousPreTaxMinor',t.remaining_pre_tax_minor,'previousTaxMinor',t.remaining_tax_minor,
   'remainingPreTaxMinor',o.target_pre_tax_minor,'remainingTaxMinor',o.target_tax_minor));
end; $$;
revoke all on function public.claim_google_play_external_report(uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_google_play_external_report(uuid) to service_role;

create function public.finish_google_play_external_report(p_outbox_id uuid,p_lease_id uuid,p_result jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare o private.google_play_external_report_outbox;t private.google_play_external_transactions;
 r jsonb:=p_result->'receipt'; status text:=p_result->>'status'; package text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into o from private.google_play_external_report_outbox where id=p_outbox_id;
 if o.id is null then return false; end if;
 select * into t from private.google_play_external_transactions where id=o.transaction_id for update;
 select * into o from private.google_play_external_report_outbox where id=p_outbox_id for update;
 if o.id is null or o.state<>'leased' or o.lease_id is distinct from p_lease_id
   or o.lease_until<clock_timestamp() then return false; end if;
 select p.package_name into package from private.google_play_external_launch_bindings b
   join private.google_play_external_program_config p on p.id=b.program_id where b.id=t.binding_id;
 if status not in('reported','retry','unknown','needs_review') then raise exception 'google_report_result_invalid'; end if;
 if status='reported' and (r is null or r->>'externalTransactionId' is distinct from t.id::text
   or r->>'packageName' is distinct from package
   or jsonb_typeof(r->'testPurchase') is distinct from 'object'
   or r->'userTaxAddress'->>'regionCode' is distinct from 'US'
   or r->'externalContentLinkDetails'->>'linkType' is distinct from 'LINK_TO_DIGITAL_CONTENT_OFFER'
   or coalesce(r->>'transactionState','') not in('TRANSACTION_REPORTED','TRANSACTION_CANCELED')
   or (r->>'transactionTime')::timestamptz is distinct from t.transaction_time
   or r->'originalPreTaxAmount'->>'priceMicros' is distinct from (t.original_pre_tax_minor::bigint*10000)::text
   or r->'originalTaxAmount'->>'priceMicros' is distinct from (t.original_tax_minor::bigint*10000)::text
   or r->'originalPreTaxAmount'->>'currency' is distinct from 'USD'
   or r->'originalTaxAmount'->>'currency' is distinct from 'USD'
   or r->'currentPreTaxAmount'->>'currency' is distinct from 'USD'
   or r->'currentTaxAmount'->>'currency' is distinct from 'USD'
   or coalesce(r->'currentPreTaxAmount'->>'priceMicros','') !~ '^(0|[1-9][0-9]{0,15})$'
   or coalesce(r->'currentTaxAmount'->>'priceMicros','') !~ '^(0|[1-9][0-9]{0,15})$'
   or case when r->'currentPreTaxAmount'->>'priceMicros' ~ '^(0|[1-9][0-9]{0,15})$'
     then (r->'currentPreTaxAmount'->>'priceMicros')::numeric>t.original_pre_tax_minor::bigint*10000 else true end
   or case when r->'currentTaxAmount'->>'priceMicros' ~ '^(0|[1-9][0-9]{0,15})$'
     then (r->'currentTaxAmount'->>'priceMicros')::numeric>t.original_tax_minor::bigint*10000 else true end
   or (r->>'transactionState'='TRANSACTION_CANCELED' and
     (r->'currentPreTaxAmount'->>'priceMicros' is distinct from '0'
       or r->'currentTaxAmount'->>'priceMicros' is distinct from '0'))
   or r ? 'oneTimeTransaction' or r ? 'externalTransactionToken'
   or (o.operation='refund' and (
     r->'currentPreTaxAmount'->>'currency' is distinct from 'USD'
     or r->'currentTaxAmount'->>'currency' is distinct from 'USD'
     or r->'currentPreTaxAmount'->>'priceMicros' is distinct from (o.target_pre_tax_minor::bigint*10000)::text
     or r->'currentTaxAmount'->>'priceMicros' is distinct from (o.target_tax_minor::bigint*10000)::text)))
 then raise exception 'google_report_receipt_required'; end if;
 if status='reported' then
   if o.operation='refund' and o.target_pre_tax_minor=0 and o.target_tax_minor=0
     and r->>'transactionState' is distinct from 'TRANSACTION_CANCELED'
   then raise exception 'google_report_receipt_required'; end if;
   -- Defense in depth: even a service caller cannot retain unknown fields or
   -- nested input-only tokens by skipping the worker's receipt allowlist.
   r:=jsonb_build_object('externalTransactionId',r->>'externalTransactionId','packageName',package,
     'transactionTime',r->>'transactionTime','transactionState',r->>'transactionState',
     'testPurchase','{}'::jsonb,'userTaxAddress',jsonb_build_object('regionCode','US'),
     'externalContentLinkDetails',jsonb_build_object('linkType','LINK_TO_DIGITAL_CONTENT_OFFER'),
     'originalPreTaxAmount',jsonb_build_object('currency','USD','priceMicros',r->'originalPreTaxAmount'->>'priceMicros'),
     'originalTaxAmount',jsonb_build_object('currency','USD','priceMicros',r->'originalTaxAmount'->>'priceMicros'),
     'currentPreTaxAmount',jsonb_build_object('currency','USD','priceMicros',r->'currentPreTaxAmount'->>'priceMicros'),
     'currentTaxAmount',jsonb_build_object('currency','USD','priceMicros',r->'currentTaxAmount'->>'priceMicros'));
 end if;
 update private.google_play_external_report_outbox set state=status,reason=left(p_result->>'reason',100),
   lease_id=null,lease_until=null,next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,least(attempt_count,7)))::integer),
   canonical_receipt=case when status='reported' then r else null end,
   reported_at=case when status='reported' then clock_timestamp() end where id=o.id;
 if status='reported' then
   if o.operation='create' then update private.google_play_external_transactions set create_reported=true where id=t.id;
   else update private.google_play_external_transactions set reported_refund_minor=o.cumulative_refund_minor,
     remaining_pre_tax_minor=o.target_pre_tax_minor,remaining_tax_minor=o.target_tax_minor where id=t.id;
     if o.target_pre_tax_minor=0 and o.target_tax_minor=0 then
       -- A canonical Google full refund also settles earlier partial refund
       -- obligations whose tax allocation was unavailable. This is not a
       -- synthetic acknowledgement: retain the actual full-refund receipt.
       update private.google_play_external_report_outbox set state='reported',reason='covered_by_canonical_full_refund',
         canonical_receipt=r,reported_at=clock_timestamp(),lease_id=null,lease_until=null
       where transaction_id=t.id and operation='refund' and cumulative_refund_minor<o.cumulative_refund_minor
         and state<>'reported';
     end if;
   end if;
 end if;
 return true;
end; $$;
revoke all on function public.finish_google_play_external_report(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.finish_google_play_external_report(uuid,uuid,jsonb) to service_role;

create function public.read_google_play_external_reporting_health()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 return (select jsonb_build_object('pending',count(*) filter(where state in('pending','retry','leased')),
   'unknown',count(*) filter(where state='unknown'),'blockedTax',count(*) filter(where state='blocked_tax'),
   'needsReview',count(*) filter(where state='needs_review'),
   'oldestOutstandingAt',min(created_at) filter(where state<>'reported'),
   'reported',count(*) filter(where state='reported')) from private.google_play_external_report_outbox);
end; $$;
revoke all on function public.read_google_play_external_reporting_health() from public,anon,authenticated,service_role;
grant execute on function public.read_google_play_external_reporting_health() to service_role;

-- Dormant installation entrypoint, deliberately not granted to API roles.
-- A separately authorized owner database operation must provision the matching
-- Vault/Edge credential and qualify the program BEFORE calling this. The
-- migration never calls it and never creates any credential or cron job.
create function private.configure_google_play_external_reporter()
returns bigint language plpgsql security definer set search_path='' as $$
declare job bigint; worker_secret text;
begin
 if not exists(select 1 from private.google_play_external_program_config where enabled and revoked_at is null
   and verified_at<=clock_timestamp() and expires_at>clock_timestamp())
 then raise exception 'google_external_program_unavailable'; end if;
 select decrypted_secret into worker_secret from vault.decrypted_secrets
   where name='google_play_external_reporter_worker_secret' order by created_at desc limit 1;
 if worker_secret is null or length(worker_secret)<32 then raise exception 'google_reporter_worker_secret_required'; end if;
 select jobid into job from cron.job where jobname='google-play-external-reporter';
 if job is not null then return job; end if;
 job:=cron.schedule('google-play-external-reporter','10 seconds',$job$
   select net.http_post(url := 'https://bmkkhihfbmsnnmcqkoly.supabase.co/functions/v1/google-play-external-reporter',
     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||
       (select decrypted_secret from vault.decrypted_secrets where name='google_play_external_reporter_worker_secret'
         order by created_at desc limit 1)), body := '{}'::jsonb, timeout_milliseconds := 65000);
 $job$);
 return job;
end; $$;
create function private.disable_google_play_external_reporter()
returns boolean language plpgsql security definer set search_path='' as $$
declare job bigint;
begin
 select jobid into job from cron.job where jobname='google-play-external-reporter';
 if job is not null then perform cron.unschedule(job); end if;
 return true;
end; $$;
revoke all on function private.configure_google_play_external_reporter(),private.disable_google_play_external_reporter()
  from public,anon,authenticated,service_role;

-- Preserve the installed exact-Stripe projector unchanged, behind a private
-- service-only wrapper. Outbox insertion and financial projection commit in
-- one transaction; no webhook-success/reporting crash window is introduced.
alter function public.process_stripe_tip_webhook_lifecycle(text,uuid,uuid,jsonb,jsonb,jsonb)
  rename to process_stripe_tip_webhook_lifecycle_before_google;
alter function public.process_stripe_tip_webhook_lifecycle_before_google(text,uuid,uuid,jsonb,jsonb,jsonb) set schema private;
revoke all on function private.process_stripe_tip_webhook_lifecycle_before_google(text,uuid,uuid,jsonb,jsonb,jsonb)
  from public,anon,authenticated,service_role;
create function public.process_stripe_tip_webhook_lifecycle(p_webhook_event_id text,p_processing_attempt_id uuid,
  p_tip_id uuid,p_provider_facts jsonb,p_transition jsonb,p_tip_event_metadata jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; e public.monetization_webhook_events; outcome text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 result:=private.process_stripe_tip_webhook_lifecycle_before_google(p_webhook_event_id,p_processing_attempt_id,
   p_tip_id,p_provider_facts,p_transition,p_tip_event_metadata);
 if result->>'updated'='true' and exists(select 1 from private.google_play_external_launch_bindings
   where feature='creator_tip' and quote_id=p_tip_id) then
   select * into e from public.monetization_webhook_events where provider='stripe_tip' and idempotency_key=p_webhook_event_id;
   outcome:=case when e.event_type='charge.refunded' then 'refunded'
     when e.event_type='payment_intent.succeeded' then 'paid'
     when e.event_type in('checkout.session.completed','checkout.session.async_payment_succeeded')
       and p_provider_facts->>'payment_status'='paid' then 'paid' end;
   if outcome is not null then
     perform private.enqueue_google_play_external_report('creator_tip',p_tip_id,jsonb_build_object(
       'outcome',outcome,'eventId',p_webhook_event_id,'occurredAt',p_provider_facts->>'provider_occurred_at',
       'amountMinor',p_provider_facts->'amount_cents','currency',p_provider_facts->>'currency',
       'refundedAmountMinor',p_provider_facts->'amount_refunded_cents','googlePlayTax',p_provider_facts->'google_play_tax'),e.raw_event_hash);
   end if;
 end if;
 return result;
end; $$;
revoke all on function public.process_stripe_tip_webhook_lifecycle(text,uuid,uuid,jsonb,jsonb,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.process_stripe_tip_webhook_lifecycle(text,uuid,uuid,jsonb,jsonb,jsonb) to service_role;
