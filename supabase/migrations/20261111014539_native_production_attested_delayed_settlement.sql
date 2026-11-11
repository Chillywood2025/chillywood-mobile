-- Delayed settlement is a separate, empty-by-default qualification. It does
-- not extend admission expiry or authorize another native SDK invocation.
create table private.native_production_delayed_settlement_qualifications (
 id uuid primary key default gen_random_uuid(),
 checkout_qualification_id uuid not null references private.native_production_checkout_qualifications(id),
 adapter text not null check(adapter='native-monotonic-ack-v1'),
 evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 verified_at timestamptz not null, expires_at timestamptz not null,
 check(isfinite(verified_at) and isfinite(expires_at) and verified_at<expires_at)
);
create table private.native_production_delayed_settlement_revocations (
 qualification_id uuid primary key references private.native_production_delayed_settlement_qualifications(id),
 revoked_at timestamptz not null default clock_timestamp()
);
create table private.native_production_delayed_settlement_proofs (
 canonical_receipt_id uuid primary key references private.native_production_paid_video_observations(canonical_receipt_id),
 dispatch_id uuid not null unique references private.native_production_checkout_dispatches(id),
 receipt_proof_id uuid not null unique references private.native_production_checkout_receipt_proofs(id),
 qualification_id uuid not null references private.native_production_delayed_settlement_qualifications(id),
 source_proof_id uuid not null references private.native_production_source_proofs(id),
 scope_id uuid not null references private.native_production_scope_qualifications(id),
 launch_lower_at timestamptz not null, launch_upper_at timestamptz not null,
 evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 verified_at timestamptz not null default clock_timestamp(),
 check(isfinite(launch_lower_at) and isfinite(launch_upper_at) and launch_lower_at<=launch_upper_at)
);
do $$ declare t text; begin
 foreach t in array array['native_production_delayed_settlement_qualifications','native_production_delayed_settlement_revocations',
  'native_production_delayed_settlement_proofs'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger native_delayed_immutable before update or delete on private.%I for each row execute function public.block_revenuecat_webhook_ingress_mutation_internal()',t);
  execute format('create trigger native_delayed_fence before insert or update or delete on private.%I for each row execute function private.fence_native_production_checkout_authority()',t);
 end loop;
end $$;

create function private.native_production_delayed_settlement_current(p_receipt uuid) returns boolean
language sql volatile set search_path='' as $$
 select exists(select 1 from private.native_production_delayed_settlement_proofs late
 join private.native_production_checkout_receipt_proofs proof on proof.id=late.receipt_proof_id
 join private.native_production_checkout_dispatches d on d.id=late.dispatch_id and d.id=proof.dispatch_id
 join private.native_production_checkout_qualifications historical_checkout on historical_checkout.id=d.qualification_id
 join private.native_production_video_admissions a on a.id=d.admission_id
 join private.native_production_verified_witnesses witness on witness.dispatch_id=d.id
 join private.native_production_native_launch_ready ready on ready.dispatch_id=d.id
 join private.native_production_delayed_settlement_qualifications qualification on qualification.id=late.qualification_id
  and qualification.checkout_qualification_id=d.qualification_id
 where late.canonical_receipt_id=p_receipt and proof.canonical_receipt_id=p_receipt
 and proof.purchased_at>=a.expires_at and proof.transaction_id=witness.transaction_id
 and row(proof.evidence_sha256,late.evidence_sha256) is not distinct from row(witness.witness_sha256,witness.witness_sha256)
 and row(late.launch_lower_at,late.launch_upper_at) is not distinct from row(witness.launched_at,witness.launch_upper_at)
 and witness.launched_at=ready.server_received_at and witness.launch_upper_at>=witness.launched_at
 and witness.launch_upper_at<witness.launched_at+ready.elapsed_limit_ms*interval '1 millisecond'
 and witness.launched_at>=a.created_at and witness.launch_upper_at<a.expires_at
 and historical_checkout.verified_at<=witness.launched_at and historical_checkout.expires_at>witness.launch_upper_at
 and qualification.verified_at<=witness.launched_at and qualification.expires_at>witness.launch_upper_at
 and qualification.verified_at=(select max(candidate.verified_at) from private.native_production_delayed_settlement_qualifications candidate
  where candidate.checkout_qualification_id=d.qualification_id and candidate.verified_at<=witness.launched_at)
 and (select count(*) from private.native_production_delayed_settlement_qualifications candidate
  where candidate.checkout_qualification_id=d.qualification_id and candidate.verified_at=qualification.verified_at)=1
 and not exists(select 1 from private.native_production_delayed_settlement_revocations revoked where revoked.qualification_id=qualification.id)
 and exists(select 1 from private.native_production_delayed_settlement_qualifications current_qualification
  where current_qualification.checkout_qualification_id=d.qualification_id and current_qualification.adapter=qualification.adapter
   and current_qualification.verified_at<=clock_timestamp() and current_qualification.expires_at>clock_timestamp()
   and current_qualification.verified_at=(select max(candidate.verified_at) from private.native_production_delayed_settlement_qualifications candidate where candidate.checkout_qualification_id=d.qualification_id)
   and (select count(*) from private.native_production_delayed_settlement_qualifications candidate where candidate.checkout_qualification_id=d.qualification_id and candidate.verified_at=current_qualification.verified_at)=1
   and not exists(select 1 from private.native_production_delayed_settlement_revocations revoked where revoked.qualification_id=current_qualification.id))
 and private.native_production_checkout_current(d.qualification_id,true)
 and private.native_production_source_current(a.source_version_id,a.source_proof_id)
 and private.native_production_scope_current(a.scope_id)
 and private.native_production_scope_equivalent(a.scope_id,late.scope_id)
 and exists(select 1 from private.native_production_source_proofs original join private.native_production_source_proofs covering
  on covering.id=late.source_proof_id where original.id=a.source_proof_id
  and original.verified_at<=witness.launched_at and original.expires_at>witness.launch_upper_at
  and covering.verified_at<=proof.purchased_at and covering.expires_at>proof.purchased_at
  and private.native_production_source_current(a.source_version_id,covering.id))
 and exists(select 1 from private.native_production_scope_qualifications original join private.native_production_scope_qualifications covering
  on covering.id=late.scope_id where original.id=a.scope_id
  and original.verified_at<=witness.launched_at and original.expires_at>witness.launch_upper_at
  and covering.verified_at<=proof.purchased_at and covering.expires_at>proof.purchased_at)
 and (witness.key_id is null or not exists(select 1 from private.native_production_witness_key_revocations revoked where revoked.key_id=witness.key_id)));
$$;

-- No public/service EXECUTE. Called from the verified receipt binder, consuming
-- private authenticated Store facts and native proof, never client timestamps.
create function private.record_native_production_delayed_settlement(p_proof uuid) returns void
language plpgsql set search_path='' as $$
declare proof private.native_production_checkout_receipt_proofs; d private.native_production_checkout_dispatches;
 a private.native_production_video_admissions; witness private.native_production_verified_witnesses;
 source_id uuid; scope_id uuid; qualification_id uuid;
begin
 select * into strict proof from private.native_production_checkout_receipt_proofs where id=p_proof;
 select * into strict d from private.native_production_checkout_dispatches where id=proof.dispatch_id;
 select * into strict a from private.native_production_video_admissions where id=d.admission_id;
 if proof.purchased_at<a.expires_at then return; end if;
 select * into strict witness from private.native_production_verified_witnesses where dispatch_id=d.id;
 if not exists(select 1 from private.native_production_delayed_settlement_proofs where canonical_receipt_id=proof.canonical_receipt_id) then
  select covering.id into source_id from private.native_production_source_proofs covering
  where covering.version_id=a.source_version_id and covering.verified_at<=proof.purchased_at and covering.expires_at>proof.purchased_at
   and private.native_production_source_current(a.source_version_id,covering.id)
  order by covering.verified_at desc,covering.id desc limit 1;
  select covering.id into scope_id from private.native_production_scope_qualifications covering
  where covering.verified_at<=proof.purchased_at and covering.expires_at>proof.purchased_at
   and private.native_production_scope_equivalent(a.scope_id,covering.id) and private.native_production_scope_current(covering.id)
  order by covering.verified_at desc,covering.id desc limit 1;
  select candidate.id into qualification_id from private.native_production_delayed_settlement_qualifications candidate
  where candidate.checkout_qualification_id=d.qualification_id and candidate.verified_at<=witness.launched_at
  order by candidate.verified_at desc,candidate.id desc limit 1;
  if source_id is null or scope_id is null or qualification_id is null or witness.launch_upper_at is null then raise exception 'native_delayed_settlement_held'; end if;
  insert into private.native_production_delayed_settlement_proofs(canonical_receipt_id,dispatch_id,receipt_proof_id,qualification_id,source_proof_id,scope_id,
   launch_lower_at,launch_upper_at,evidence_sha256)
  values(proof.canonical_receipt_id,d.id,proof.id,qualification_id,source_id,scope_id,witness.launched_at,witness.launch_upper_at,witness.witness_sha256);
 end if;
 if not private.native_production_delayed_settlement_current(proof.canonical_receipt_id) then raise exception 'native_delayed_settlement_held'; end if;
end $$;
revoke all on function private.native_production_delayed_settlement_current(uuid),private.record_native_production_delayed_settlement(uuid)
 from public,anon,authenticated,service_role;

-- Exact bounded edits to the immutable predecessor's runtime definition. The
-- early-purchase branch and all tuple/legal/catalog/price checks stay intact.
do $$ declare definition text; changed text; begin
 definition:=pg_get_functiondef('private.bind_native_production_sale(uuid)'::regprocedure);
 changed:=replace(definition,'or c.purchased_at>=a.expires_at',
  'or (c.purchased_at>=a.expires_at and not private.native_production_delayed_settlement_current(p_receipt))');
 if changed=definition then raise exception 'native_delayed_sale_window_anchor_missing'; end if;
 definition:=changed;
 changed:=replace(definition,'or q.expires_at<=c.purchased_at',
  'or (q.expires_at<=c.purchased_at and not private.native_production_delayed_settlement_current(p_receipt))');
 if changed=definition then raise exception 'native_delayed_scope_window_anchor_missing'; end if;
 definition:=changed;
 changed:=replace(definition,'proof.expires_at>c.purchased_at',
  '(proof.expires_at>c.purchased_at or private.native_production_delayed_settlement_current(p_receipt))');
 if changed=definition then raise exception 'native_delayed_source_window_anchor_missing'; end if;
 execute changed;
 definition:=pg_get_functiondef('private.bind_native_production_checkout_receipt(uuid)'::regprocedure);
 changed:=replace(definition,'or proof.purchased_at>=a.expires_at',
  'or (proof.purchased_at>=a.expires_at and not private.native_production_delayed_settlement_current(proof.canonical_receipt_id))');
 if changed=definition then raise exception 'native_delayed_checkout_window_anchor_missing'; end if;
 definition:=changed;
 changed:=replace(definition,'or q.expires_at<=proof.purchased_at',
  'or (q.expires_at<=proof.purchased_at and not private.native_production_delayed_settlement_current(proof.canonical_receipt_id))');
 if changed=definition then raise exception 'native_delayed_checkout_qualification_anchor_missing'; end if;
 definition:=changed;
 changed:=replace(definition,'select * into strict v from private.native_production_video_versions where id=a.source_version_id;',
  E'select * into strict v from private.native_production_video_versions where id=a.source_version_id;\n perform private.record_native_production_delayed_settlement(proof.id);');
 if changed=definition then raise exception 'native_delayed_checkout_record_anchor_missing'; end if;
 execute changed;
end $$;
