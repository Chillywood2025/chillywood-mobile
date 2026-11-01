-- Owner-approved bounded-known-cost policy, November 1 2026. No creator is
-- accepted on their behalf and no money/provider switches are activated.
create function private.commerce_known_cost_terms() returns text language sql immutable set search_path='' as $$
 select 'After applicable return, fulfillment and other payment holds, earnings are calculated using verified fees known at that time. Later verified fees, refunds or other payment adjustments are shown in your earnings history and may be deducted only from future unpaid earnings. If future unpaid earnings are insufficient, the remaining negative balance blocks further cashout until covered. Chi''llywood will not automatically debit your bank account under this policy. No fixed reserve percentage is introduced. Existing product revenue shares and accepted cashout fees remain unchanged.'::text;
$$;
revoke all on function private.commerce_known_cost_terms() from public,anon,authenticated,service_role;
create table private.commerce_creator_fee_acceptances (
 id uuid primary key default gen_random_uuid(), creator_id uuid not null,
 policy_version text not null check(policy_version='known_costs_future_unpaid_adjustments_v1'),
 terms_sha256 text not null check(terms_sha256 ~ '^[0-9a-f]{64}$'),
 session_id uuid not null, accepted_at timestamptz not null default clock_timestamp(),
 unique(creator_id,policy_version,terms_sha256)
);
create table private.commerce_creator_fee_adjustments (
 id uuid primary key default gen_random_uuid(), creator_id uuid not null,
 acceptance_id uuid not null references private.commerce_creator_fee_acceptances(id),
 currency text not null check(currency='usd'), amount_minor bigint not null check(amount_minor<>0),
 reason text not null check(reason in ('later_verified_fee','later_verified_refund','verified_fee_credit')),
 source_type text not null, source_id uuid not null, evidence_hash text not null check(evidence_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(), unique(source_type,source_id,evidence_hash)
);
create table private.commerce_creator_fee_offsets (
 id uuid primary key default gen_random_uuid(), adjustment_id uuid not null references private.commerce_creator_fee_adjustments(id),
 earnings_ledger_id uuid not null references public.creator_earnings_ledger(id),
 amount_minor bigint not null check(amount_minor>0), created_at timestamptz not null default clock_timestamp(),
 unique(adjustment_id,earnings_ledger_id)
);
do $$ declare t text; begin
 foreach t in array array['commerce_creator_fee_acceptances','commerce_creator_fee_adjustments','commerce_creator_fee_offsets'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before update or delete on private.%I for each row execute function private.guard_event_ticket_terms_immutable()',t||'_immutable',t);
 end loop;
end $$;
create function private.creator_fee_recovery_amount(p_creator_id uuid,p_currency text) returns bigint
language sql stable set search_path='' as $$
 select greatest(coalesce((select sum(a.amount_minor) from private.commerce_creator_fee_adjustments a
  where a.creator_id=p_creator_id and a.currency=p_currency),0)
  -coalesce((select sum(o.amount_minor) from private.commerce_creator_fee_offsets o
   join private.commerce_creator_fee_adjustments a on a.id=o.adjustment_id
   where a.creator_id=p_creator_id and a.currency=p_currency),0),0)::bigint;
$$;
create function private.creator_fee_recovery_outstanding(p_creator_id uuid,p_currency text) returns boolean
language sql stable set search_path='' as $$ select private.creator_fee_recovery_amount(p_creator_id,p_currency)>0; $$;
create function private.creator_earning_fee_offset(p_earning_id uuid) returns bigint
language sql stable set search_path='' as $$ select coalesce(sum(amount_minor),0)::bigint from private.commerce_creator_fee_offsets where earnings_ledger_id=p_earning_id; $$;
revoke all on function private.creator_fee_recovery_amount(uuid,text),private.creator_fee_recovery_outstanding(uuid,text),private.creator_earning_fee_offset(uuid)
 from public,anon,authenticated,service_role;

create function public.get_creator_fee_policy_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); terms text:=private.commerce_known_cost_terms(); digest text; entries jsonb;
begin
 if actor is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
  or public.is_account_access_restricted(actor::text) then raise exception 'creator_fee_current_session_required'; end if;
 digest:=encode(extensions.digest(terms,'sha256'),'hex');
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'amountCents',a.amount_minor,'reason',a.reason,'createdAt',a.created_at)
  order by a.created_at desc,a.id),'[]'::jsonb) into entries from
  (select * from private.commerce_creator_fee_adjustments where creator_id=actor order by created_at desc,id limit 100) a;
 return jsonb_build_object('version','known_costs_future_unpaid_adjustments_v1','terms',terms,'termsSha256',digest,
  'accepted',exists(select 1 from private.commerce_creator_fee_acceptances where creator_id=actor and terms_sha256=digest
   and policy_version='known_costs_future_unpaid_adjustments_v1'),
  'negativeAdjustmentCents',private.creator_fee_recovery_amount(actor,'usd'),'bankDebitAllowed',false,'adjustments',entries);
end; $$;
create function public.accept_creator_fee_policy(p_version text,p_terms_sha256 text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); current_session uuid; result jsonb;
begin
 result:=public.get_creator_fee_policy_status();
 if p_version is distinct from result->>'version' or p_terms_sha256 is distinct from result->>'termsSha256'
 then raise exception 'creator_fee_terms_changed'; end if;
 current_session:=nullif(auth.jwt()->>'session_id','')::uuid;
 if current_session is null then raise exception 'creator_fee_current_session_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('creator-payout:'||actor::text,0));
 -- Revalidate after any lock wait. This is an explicit creator action, not an
 -- administrator acknowledgement or a side effect of opening the screen.
 result:=public.get_creator_fee_policy_status();
 insert into private.commerce_creator_fee_acceptances(creator_id,policy_version,terms_sha256,session_id)
 values(actor,p_version,p_terms_sha256,current_session) on conflict(creator_id,policy_version,terms_sha256) do nothing;
 return public.get_creator_fee_policy_status();
end; $$;
revoke all on function public.get_creator_fee_policy_status(),public.accept_creator_fee_policy(text,text) from public,anon,authenticated,service_role;
grant execute on function public.get_creator_fee_policy_status(),public.accept_creator_fee_policy(text,text) to authenticated;
