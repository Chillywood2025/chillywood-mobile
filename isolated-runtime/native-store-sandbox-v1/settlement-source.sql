-- Source-only private original-journal metadata boundary. No worker activation,
-- decryption key, qualification writer or grant authority is exposed here.
grant native_store_sandbox_v1_owner to postgres with inherit false,set true;
set local role native_store_sandbox_v1_owner;
create index native_settlement_delivery_receipt on native_store_sandbox_v1.deliveries(receipt_id,event_id);
create index native_settlement_conflict_receipt on native_store_sandbox_v1.conflicts(receipt_id);
create index native_settlement_event_parent on native_store_sandbox_v1.events(first_receipt_id,id);
create function native_store_sandbox_v1.settlement_source(p_receipt_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r native_store_sandbox_v1.receipts;c native_store_sandbox_v1.connections;
 enabled boolean;revoked boolean;event_ids jsonb;conflicted boolean;
begin
 if p_receipt_id is null or current_setting('transaction_isolation')<>'read committed'
  or current_setting('transaction_timeout')::interval not between interval '1 microsecond' and interval '5 seconds'
  or clock_timestamp()>=transaction_timestamp()+interval '5 seconds'
 then raise exception 'native_store_settlement_source_context_required';end if;
 select * into r from native_store_sandbox_v1.receipts where id=p_receipt_id;
 if r.id is null then return null;end if;
 if not pg_try_advisory_xact_lock(hashtextextended('native-store-project-fence:'||r.project_id,691))
 then raise exception 'native_store_fence_busy' using errcode='55P03';end if;
 -- Exact ORIGINAL registry, never the latest delivery revision. Historical
 -- revoked/off evidence is retained for reconciliation, not silently omitted.
 select * into strict c from native_store_sandbox_v1.connections where id=r.connection_id and revision=r.connection_revision for share nowait;
 if c.project_id<>r.project_id then raise exception 'native_store_settlement_source_scope_invalid';end if;
 select control.enabled into strict enabled from native_store_sandbox_v1.control where singleton for share nowait;
 lock table native_store_sandbox_v1.revocations in share mode nowait;
 select exists(select 1 from native_store_sandbox_v1.revocations v where v.connection_id=c.id and v.connection_revision=c.revision) into revoked;
 select coalesce(jsonb_agg(x.id order by x.id),'[]'::jsonb) into event_ids
 from (select distinct d.event_id id from native_store_sandbox_v1.deliveries d where d.receipt_id=r.id) x;
 select exists(select 1 from native_store_sandbox_v1.conflicts f where f.receipt_id=r.id)
  or exists(select 1 from native_store_sandbox_v1.events e join native_store_sandbox_v1.conflicts f on f.event_id=e.id where e.first_receipt_id=r.id) into conflicted;
 if exists(select 1 from native_store_sandbox_v1.deliveries d join native_store_sandbox_v1.events e on e.id=d.event_id
  where d.receipt_id=r.id and (e.project_id<>r.project_id or e.event_key is distinct from
   case when jsonb_typeof(r.envelope#>'{observation,eventId}')='string' and length(r.envelope#>>'{observation,eventId}') between 1 and 512
   then 'id:'||(r.envelope#>>'{observation,eventId}') else 'hash:'||r.raw_sha256 end)) then conflicted:=true;end if;
 return jsonb_build_object('rawReceiptId',r.id,'rawSha256',r.raw_sha256,'rawByteLength',r.raw_byte_length,
  'connectionId',r.connection_id,'connectionRevision',r.connection_revision,'projectId',r.project_id,
  'appId',c.app_id,'store',c.store,'environment',c.environment,'intakeEnabled',enabled,'originalRevisionRevoked',revoked,
  'recordedAt',r.recorded_at,'eventIds',event_ids,'conflicted',conflicted,'observation',r.envelope->'observation');
end $$;
revoke all on function native_store_sandbox_v1.settlement_source(uuid) from public,anon,authenticated,service_role;
grant execute on function native_store_sandbox_v1.settlement_source(uuid) to sbx_v1_core_owner;
reset role;
grant native_store_sandbox_v1_owner to postgres with inherit false,set false;
