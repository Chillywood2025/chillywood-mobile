-- Fresh installation only. Never close an existing admitted generation using
-- this module: there must be no prior intent, receipt or provider connection.
set local role sbx_v1_core_owner;
do $fresh$
begin
 if exists(select 1 from sandbox_commerce_v1.intents)
  or exists(select 1 from sandbox_commerce_v1.receipts)
  or exists(select 1 from sandbox_commerce_v1.test_store_connections)
  or exists(select 1 from sandbox_commerce_v1.test_store_v2_connections)
  or exists(select 1 from sandbox_commerce_v1.test_store_v3_connections)
  or exists(select 1 from sandbox_commerce_v1.lifecycle where state<>'disabled')
 then raise exception 'capture_composition_fresh_inactive_profile_required'; end if;
end; $fresh$;

-- V1/V2 are immutable dependency source only in this V3 profile. No alternate
-- public normalized receipt, dispatch or provisioning lane may grant authority.
alter table sandbox_commerce_v1.test_store_controls add constraint capture_profile_v1_disabled
 check(not ingress_enabled and not initiation_enabled);
alter table sandbox_commerce_v1.test_store_v2_controls add constraint capture_profile_v2_disabled
 check(not ingress_enabled and not provisioning_enabled and not initiation_enabled);
reset role;
revoke all on function
 public.isolated_sandbox_begin_dispatch_v1(text,uuid),
 public.isolated_sandbox_bind_dispatch_v1(text,uuid,text),
 public.isolated_sandbox_ingest_receipt_v1(jsonb),
 public.isolated_test_store_command_v1(uuid,uuid,text,uuid,text,jsonb),
 public.isolated_test_store_ingest_v1(uuid,integer,jsonb,jsonb),
 public.isolated_test_store_command_v2(uuid,uuid,text,uuid,text,jsonb),
 public.isolated_test_store_ingest_v2(uuid,integer,jsonb,jsonb),
 public.isolated_test_store_v2_provisioning_claim_v1(uuid,text,uuid,text),
 public.isolated_test_store_v2_provisioning_record_v1(uuid,jsonb,jsonb),
 public.isolated_test_store_v2_provisioning_next_v1(uuid),
 public.isolated_test_store_v2_provisioning_plan_v1(uuid,uuid)
 from public,anon,authenticated,service_role,sbx_v1_operator;

-- Deliberately no economic registrar role/membership/EXECUTE grant. A later
-- reviewed, bounded administrative action may grant only capture's reservation
-- function to a separate registrar and bind the exact server-owned V3 project
-- to sandbox-commerce-v1:protocol-3:capture-composed-v1. Capture operators and
-- application/runtime roles cannot reserve, configure or promote a project.
