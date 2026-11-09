do $$begin
 if not exists(select 1 from pg_roles where rolname='supabase_read_only_user' and not rolsuper and not rolcreaterole and not rolcreatedb and not rolreplication)
 then raise exception 'native_private_existing_reader_required';end if;
 if has_schema_privilege('sbx_v1_core_owner','public','CREATE') or has_schema_privilege('native_store_sandbox_v1_owner','public','CREATE')
 or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member where u.rolname='postgres' and r.rolname in('sbx_v1_core_owner','native_store_sandbox_v1_owner') and (m.set_option or m.inherit_option))
 then raise exception 'native_private_owner_interval_required';end if;
end $$;
grant native_store_sandbox_v1_owner to postgres with inherit false,set true;
set local role native_store_sandbox_v1_owner;
create function native_store_sandbox_v1.private_install_state_v1() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if session_user <> 'supabase_read_only_user' or current_setting('transaction_read_only') <> 'on'
 or current_setting('transaction_isolation') <> 'repeatable read'
 or current_setting('statement_timeout')::interval not between interval '1 microsecond' and interval '5 seconds'
 or current_setting('transaction_timeout')::interval not between interval '1 microsecond' and interval '5 seconds'
 or exists(select 1 from pg_catalog.pg_roles where rolname=session_user and (rolsuper or rolcreaterole or rolcreatedb or rolreplication))
 then raise exception 'native_private_read_context_required' using errcode='42501';end if;
 return jsonb_build_object('disabled',(select enabled=false from native_store_sandbox_v1.control where singleton),'empty',jsonb_build_object('connections',not exists(select 1 from native_store_sandbox_v1.connections limit 1),'revocations',not exists(select 1 from native_store_sandbox_v1.revocations limit 1),'receipts',not exists(select 1 from native_store_sandbox_v1.receipts limit 1),'events',not exists(select 1 from native_store_sandbox_v1.events limit 1),'conflicts',not exists(select 1 from native_store_sandbox_v1.conflicts limit 1),'deliveries',not exists(select 1 from native_store_sandbox_v1.deliveries limit 1),'consumer_dispositions',not exists(select 1 from native_store_sandbox_v1.consumer_dispositions limit 1)));
end $$;
revoke all on function native_store_sandbox_v1.private_install_state_v1() from public,anon,authenticated,service_role;
grant execute on function native_store_sandbox_v1.private_install_state_v1() to sbx_v1_core_owner;
reset role;
grant native_store_sandbox_v1_owner to postgres with inherit false,set false;
grant sbx_v1_core_owner to postgres with inherit false,set true;
grant create on schema public to sbx_v1_core_owner;
set local role sbx_v1_core_owner;
create function public.native_store_private_install_state_v1() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if session_user <> 'supabase_read_only_user' or current_setting('transaction_read_only') <> 'on'
 or current_setting('transaction_isolation') <> 'repeatable read'
 or current_setting('statement_timeout')::interval not between interval '1 microsecond' and interval '5 seconds'
 or current_setting('transaction_timeout')::interval not between interval '1 microsecond' and interval '5 seconds'
 or exists(select 1 from pg_catalog.pg_roles where rolname=session_user and (rolsuper or rolcreaterole or rolcreatedb or rolreplication))
 then raise exception 'native_private_read_context_required' using errcode='42501';end if;
 return jsonb_build_object('protocol','native-store-private-install-state-v1','reader',session_user,'transactionReadOnly',true,
 'journal',native_store_sandbox_v1.private_install_state_v1(),
 'controls',jsonb_build_object('lifecycleDisabled',(select state='disabled' from sandbox_commerce_v1.lifecycle where singleton),
 'preparationDisabled',(select not preparation_enabled from sandbox_commerce_v1.native_store_quote_controls where singleton),
 'gatewayUnconfigured',(select not enabled and route_id is null and verifier_id is null and worker_id is null and qualification_sha256 is null from sandbox_commerce_v1.paid_video_gateway_controls where singleton),
 'testStoreDispatchDisabled',(select not ingress_enabled and not provisioning_enabled and not initiation_enabled and connection_id is null and connection_revision is null from sandbox_commerce_v1.test_store_v3_controls where singleton)),
 'empty',jsonb_build_object('native_store_catalog_bindings',not exists(select 1 from sandbox_commerce_v1.native_store_catalog_bindings limit 1),'native_store_catalog_retirements',not exists(select 1 from sandbox_commerce_v1.native_store_catalog_retirements limit 1),'native_store_selections',not exists(select 1 from sandbox_commerce_v1.native_store_selections limit 1),'native_store_claims',not exists(select 1 from sandbox_commerce_v1.native_store_claims limit 1),'native_store_reservations',not exists(select 1 from sandbox_commerce_v1.native_store_reservations limit 1),'native_store_dispatch_attempts',not exists(select 1 from sandbox_commerce_v1.native_store_dispatch_attempts limit 1),'native_store_core_links',not exists(select 1 from sandbox_commerce_v1.native_store_core_links limit 1),'native_store_pending_raw',not exists(select 1 from sandbox_commerce_v1.native_store_pending_raw limit 1),'native_store_protocol_qualifications',not exists(select 1 from sandbox_commerce_v1.native_store_protocol_qualifications limit 1),'native_store_protocol_revocations',not exists(select 1 from sandbox_commerce_v1.native_store_protocol_revocations limit 1),'native_store_qualified_attempts',not exists(select 1 from sandbox_commerce_v1.native_store_qualified_attempts limit 1),'native_store_settlement_protocols',not exists(select 1 from sandbox_commerce_v1.native_store_settlement_protocols limit 1),'native_store_settlement_revocations',not exists(select 1 from sandbox_commerce_v1.native_store_settlement_revocations limit 1),'native_store_negative_tombstones',not exists(select 1 from sandbox_commerce_v1.native_store_negative_tombstones limit 1),'native_store_allocations',not exists(select 1 from sandbox_commerce_v1.native_store_allocations limit 1),'native_store_raw_effects',not exists(select 1 from sandbox_commerce_v1.native_store_raw_effects limit 1),'native_store_reservation_terminals',not exists(select 1 from sandbox_commerce_v1.native_store_reservation_terminals limit 1),'resources',not exists(select 1 from sandbox_commerce_v1.resources limit 1),'resource_versions',not exists(select 1 from sandbox_commerce_v1.resource_versions limit 1),'resource_bindings',not exists(select 1 from sandbox_commerce_v1.resource_bindings limit 1),'catalog',not exists(select 1 from sandbox_commerce_v1.catalog limit 1),'offers',not exists(select 1 from sandbox_commerce_v1.offers limit 1),'intents',not exists(select 1 from sandbox_commerce_v1.intents limit 1),'requests',not exists(select 1 from sandbox_commerce_v1.requests limit 1),'receipts',not exists(select 1 from sandbox_commerce_v1.receipts limit 1),'receipt_events',not exists(select 1 from sandbox_commerce_v1.receipt_events limit 1),'transaction_owners',not exists(select 1 from sandbox_commerce_v1.transaction_owners limit 1),'grants',not exists(select 1 from sandbox_commerce_v1.grants limit 1),'resource_grants',not exists(select 1 from sandbox_commerce_v1.resource_grants limit 1),'resource_delivery_holds',not exists(select 1 from sandbox_commerce_v1.resource_delivery_holds limit 1),'delivery_assets',not exists(select 1 from sandbox_commerce_v1.delivery_assets limit 1),'delivery_asset_scans',not exists(select 1 from sandbox_commerce_v1.delivery_asset_scans limit 1),'video_terms',not exists(select 1 from sandbox_commerce_v1.video_terms limit 1),'paid_video_routes',not exists(select 1 from sandbox_commerce_v1.paid_video_routes limit 1),'paid_video_workers',not exists(select 1 from sandbox_commerce_v1.paid_video_workers limit 1),'paid_video_uploads',not exists(select 1 from sandbox_commerce_v1.paid_video_uploads limit 1),'paid_video_tickets',not exists(select 1 from sandbox_commerce_v1.paid_video_tickets limit 1),'paid_video_scan_results',not exists(select 1 from sandbox_commerce_v1.paid_video_scan_results limit 1),'paid_video_moderation',not exists(select 1 from sandbox_commerce_v1.paid_video_moderation limit 1),'paid_video_requests',not exists(select 1 from sandbox_commerce_v1.paid_video_requests limit 1),'paid_video_catalog',not exists(select 1 from sandbox_commerce_v1.paid_video_catalog limit 1),'paid_video_transfers',not exists(select 1 from sandbox_commerce_v1.paid_video_transfers limit 1),'paid_video_verifiers',not exists(select 1 from sandbox_commerce_v1.paid_video_verifiers limit 1),'paid_video_object_receipts',not exists(select 1 from sandbox_commerce_v1.paid_video_object_receipts limit 1),'paid_video_gateway_requests',not exists(select 1 from sandbox_commerce_v1.paid_video_gateway_requests limit 1),'paid_video_gateway_transfers',not exists(select 1 from sandbox_commerce_v1.paid_video_gateway_transfers limit 1),'paid_video_receipt_links',not exists(select 1 from sandbox_commerce_v1.paid_video_receipt_links limit 1)));
end $$;
revoke all on function public.native_store_private_install_state_v1() from public,anon,authenticated,service_role;
grant execute on function public.native_store_private_install_state_v1() to supabase_read_only_user;
reset role;
revoke create on schema public from sbx_v1_core_owner;
grant sbx_v1_core_owner to postgres with inherit false,set false;
do $$begin
 if has_schema_privilege('sbx_v1_core_owner','public','CREATE')
 or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member where u.rolname='postgres' and r.rolname in('sbx_v1_core_owner','native_store_sandbox_v1_owner') and (m.set_option or m.inherit_option))
 then raise exception 'native_private_owner_interval_leaked';end if;
end $$;
