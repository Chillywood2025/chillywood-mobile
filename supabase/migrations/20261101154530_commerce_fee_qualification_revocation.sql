-- An evidence qualification can become invalid before its nominal expiry.
-- Revocation is append-only and never rewrites the accepted/provider evidence.
create table private.commerce_fee_qualification_revocations (
 qualification_kind text not null check(qualification_kind in ('semantics','funding')),
 qualification_id uuid not null, evidence_reference text not null check(length(btrim(evidence_reference)) between 1 and 500),
 revoked_at timestamptz not null default clock_timestamp(), primary key(qualification_kind,qualification_id)
);
alter table private.commerce_fee_qualification_revocations enable row level security;
alter table private.commerce_fee_qualification_revocations force row level security;
revoke all on private.commerce_fee_qualification_revocations from public,anon,authenticated,service_role;
create function private.guard_commerce_fee_qualification_revocation() returns trigger language plpgsql set search_path='' as $$
declare account text; mode text; creator uuid;
begin
 if tg_op<>'INSERT' then raise exception 'fee_qualification_revocation_immutable'; end if;
 if new.qualification_kind='semantics' then
  select account_id,environment into strict account,mode from private.commerce_fee_semantic_qualifications where id=new.qualification_id;
  perform pg_advisory_xact_lock(hashtextextended('fee-components:'||account||':'||mode,0));
 else
  select creator_id into strict creator from private.commerce_earnings_qualifications where id=new.qualification_id;
  perform pg_advisory_xact_lock(hashtextextended('creator-payout:'||creator::text,0));
 end if;
 new.revoked_at:=clock_timestamp();return new;
end; $$;
revoke all on function private.guard_commerce_fee_qualification_revocation() from public,anon,authenticated,service_role;
create trigger commerce_fee_qualification_revocation_guard before insert or update or delete on private.commerce_fee_qualification_revocations
 for each row execute function private.guard_commerce_fee_qualification_revocation();

create function private.commerce_funding_earning_ready(p_earning uuid) returns boolean
language sql stable set search_path='' as $$
 select not exists(select 1 from private.commerce_payable_releases r where r.earnings_ledger_id=p_earning)
 or exists(select 1 from private.commerce_payable_releases r join private.commerce_earnings_qualifications original on original.id=r.qualification_id
  join private.commerce_earnings_qualifications current_funding on current_funding.creator_id=original.creator_id
   and current_funding.platform_account_id=original.platform_account_id and current_funding.recipient_account_id=original.recipient_account_id
   and current_funding.environment=original.environment and current_funding.currency=original.currency
  where r.earnings_ledger_id=p_earning and current_funding.verified_at<=clock_timestamp() and current_funding.expires_at>clock_timestamp()
   and not exists(select 1 from private.commerce_fee_qualification_revocations rev where rev.qualification_kind='funding' and rev.qualification_id=current_funding.id));
$$;
revoke all on function private.commerce_funding_earning_ready(uuid) from public,anon,authenticated,service_role;

do $$ declare definition text; needle text; begin
 definition:=pg_get_functiondef('public.reconcile_commerce_known_costs(text,uuid)'::regprocedure);
 needle:='and environment=mode and verified_at<=clock_timestamp() and expires_at>clock_timestamp()';
 if position(needle in definition)=0 then raise exception 'fee_semantics_lookup_changed'; end if;
 execute replace(definition,needle,needle||' and not exists(select 1 from private.commerce_fee_qualification_revocations rev where rev.qualification_kind=''semantics'' and rev.qualification_id=commerce_fee_semantic_qualifications.id)');
 definition:=pg_get_functiondef('private.commerce_tax_fee_settlement_ready(text,uuid)'::regprocedure);
 needle:='where q.id=s.qualification_id and q.account_id=s.account_id';
 if position(needle in definition)=0 then raise exception 'fee_semantics_readiness_changed'; end if;
 execute replace(definition,needle,needle||' and not exists(select 1 from private.commerce_fee_qualification_revocations rev where rev.qualification_kind=''semantics'' and rev.qualification_id=q.id)');
 definition:=pg_get_functiondef('public.release_commerce_known_earnings(text,uuid)'::regprocedure);
 needle:='and environment=s.environment and currency=s.currency and verified_at<=clock_timestamp() and expires_at>clock_timestamp()';
 if position(needle in definition)=0 then raise exception 'fee_funding_lookup_changed'; end if;
 execute replace(definition,needle,needle||' and not exists(select 1 from private.commerce_fee_qualification_revocations rev where rev.qualification_kind=''funding'' and rev.qualification_id=commerce_earnings_qualifications.id)');
 definition:=pg_get_functiondef('public.creator_earnings_withdrawable_cents_internal(uuid,timestamptz)'::regprocedure);
 needle:='select * into strict e from public.creator_earnings_ledger where id=p_earnings_ledger_id;';
 -- This appears in both the dedicated fee-credit and commerce branches. The
 -- predicate is intentionally a no-op for credits with no commerce release.
 if position(needle in definition)=0 then raise exception 'fee_withdrawable_lookup_changed'; end if;
 execute replace(definition,needle,needle||$guard$
  if not private.commerce_funding_earning_ready(p_earnings_ledger_id) then return 0; end if;
$guard$);
end $$;
