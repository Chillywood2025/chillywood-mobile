-- Reachable service-only local projection recovery. No caller receipt fields,
-- provider requests, dispatch claims, project promotion or evidence deletion.
set local role sbx_v1_core_owner;
create function sandbox_commerce_v1.test_store_v3_capture_recovery_target(p_expected jsonb)
returns sandbox_commerce_v1.test_store_v3_connections language plpgsql volatile security invoker set search_path='' as $$
declare identity sandbox_commerce_v1.test_store_v3_capture_identity;
 connection sandbox_commerce_v1.test_store_v3_connections; actual jsonb;
begin
 if jsonb_typeof(p_expected) is distinct from 'object'
  or coalesce(p_expected->>'connectionId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  or coalesce(p_expected->>'connectionRevision','') !~ '^[1-9][0-9]{0,8}$'
 then raise exception 'test_store_v3_capture_recovery_target_mismatch' using errcode='42501'; end if;
 select * into strict identity from sandbox_commerce_v1.test_store_v3_capture_identity where singleton for share nowait;
 select * into connection from sandbox_commerce_v1.test_store_v3_connections
  where id=(p_expected->>'connectionId')::uuid and revision=(p_expected->>'connectionRevision')::integer for share nowait;
 actual:=jsonb_build_object('protocol','scv3-capture-recovery-target-v1','installationId',identity.installation_id,
  'sourceSha256',identity.source_sha256,'consumerBinding',sandbox_commerce_v1.test_store_v3_capture_binding(),
  'projectId',connection.project_id,'connectionId',connection.id,'connectionRevision',connection.revision,
  'providerConfigurationDigest',connection.provider_configuration_digest);
 if connection.id is null or p_expected is distinct from actual
 then raise exception 'test_store_v3_capture_recovery_target_mismatch' using errcode='42501'; end if;
 return connection;
end; $$;
revoke all on function sandbox_commerce_v1.test_store_v3_capture_recovery_target(jsonb) from public,anon,authenticated,service_role,sbx_v1_operator;

create function public.isolated_test_store_capture_reconcile_v3(p_expected_target jsonb,p_ingress_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare evidence sandbox_commerce_v1.test_store_v3_ingress; connection sandbox_commerce_v1.test_store_v3_connections; result jsonb;
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 perform sandbox_commerce_v1.assert_provider_service();
 connection:=sandbox_commerce_v1.test_store_v3_capture_recovery_target(p_expected_target);
 if p_ingress_id is null then raise exception 'test_store_v3_capture_ingress_required'; end if;
 select * into strict evidence from sandbox_commerce_v1.test_store_v3_ingress where id=p_ingress_id;
 if row(evidence.connection_id,evidence.connection_revision,evidence.project_id)
  is distinct from row(connection.id,connection.revision,connection.project_id)
 then raise exception 'test_store_v3_capture_recovery_target_mismatch' using errcode='42501'; end if;
 if not exists(select 1 from sandbox_commerce_v1.test_store_v3_capture_deferred where ingress_id=evidence.id)
 then raise exception 'test_store_v3_capture_not_deferred'; end if;
 -- Ingest acquires the exact project advisory lock, revalidates immutable
 -- connection/observation/correlation/windows and every current negative, then
 -- either remains deferred or creates its one immutable final effect.
 result:=sandbox_commerce_v1.test_store_v3_ingest(evidence.connection_id,evidence.connection_revision,evidence.envelope,evidence.observation);
 return jsonb_build_object('protocol','scv3-capture-reconciliation-v1','target',p_expected_target,'ingressId',evidence.id,
  'result',result,'authorityGranted',false);
end; $$;
revoke all on function public.isolated_test_store_capture_reconcile_v3(jsonb,uuid) from public,anon,authenticated,service_role,sbx_v1_operator;
grant execute on function public.isolated_test_store_capture_reconcile_v3(jsonb,uuid) to service_role;

-- Bounded operator discovery of retained unresolved work. IDs are a stable
-- read-only cursor, not proof of absence; a new sweep starts without a cursor.
create function public.isolated_test_store_capture_pending_v3(p_expected_target jsonb,p_after uuid default null,p_limit integer default 16)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare rows jsonb; connection sandbox_commerce_v1.test_store_v3_connections;
begin
 perform sandbox_commerce_v1.arm_transaction_timeout();
 perform sandbox_commerce_v1.assert_provider_service();
 connection:=sandbox_commerce_v1.test_store_v3_capture_recovery_target(p_expected_target);
 if p_limit is null or p_limit<1 or p_limit>32 then raise exception 'test_store_v3_capture_page_invalid'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('ingressId',d.ingress_id,'firstDeferredAt',d.first_deferred_at,'reason',d.reason) order by d.ingress_id),'[]'::jsonb)
 into rows from (
  select pending.* from sandbox_commerce_v1.test_store_v3_capture_deferred pending
  join sandbox_commerce_v1.test_store_v3_ingress evidence on evidence.id=pending.ingress_id
  where (p_after is null or pending.ingress_id>p_after)
   and row(evidence.connection_id,evidence.connection_revision,evidence.project_id)=row(connection.id,connection.revision,connection.project_id)
   and not exists(select 1 from sandbox_commerce_v1.test_store_v3_effects effect where effect.ingress_id=pending.ingress_id)
  order by pending.ingress_id limit p_limit
 ) d;
 return jsonb_build_object('protocol','scv3-capture-pending-v1','target',p_expected_target,'rows',rows,'authorityGranted',false,
  'nextCursor',case when jsonb_array_length(rows)=p_limit then rows->-1->>'ingressId' else null end);
end; $$;
revoke all on function public.isolated_test_store_capture_pending_v3(jsonb,uuid,integer) from public,anon,authenticated,service_role,sbx_v1_operator;
grant execute on function public.isolated_test_store_capture_pending_v3(jsonb,uuid,integer) to service_role;
reset role;
