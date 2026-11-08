-- Read-only catalog probe for the fixed native source profile. Run through an
-- authorized read-only transaction; never treat metadata as user/provider data.
-- No fixture DDL, settings change, row contents, secrets or activation.
with required(relation_name,columns) as (values
 ('auth.users',array['id','deleted_at','email_confirmed_at','raw_app_meta_data','banned_until','is_anonymous']),
 ('auth.sessions',array['id','user_id','not_after']),
 ('public.account_deletion_requests',array['user_id','status']),
 ('public.user_profiles',array['user_id','channel_role']),
 ('public.wave1_legal_document_versions',array['document_key','capability','active','market','version','effective_at']),
 ('public.wave1_legal_acceptances',array['user_id','session_generation','document_key','document_version','market','capability','role_key','invalidated_at']),
 ('public.wave1_creator_eligibility',array['creator_user_id','state','account_status','age_18_plus','market','moderation_state','creator_role','platform_capability','provider_eligible','kyc_complete','tax_complete','sanctions_clear','payout_eligible']),
 ('public.creator_payout_eligibility_records',array['creator_user_id','fraud_hold_active','admin_review_status','eligibility_status']),
 ('public.creator_payout_accounts',array['creator_user_id','provider_environment','disabled_reason','status']),
 ('public.platform_money_kill_switches',array['key','state']),
 ('public.channel_audience_blocks',array['channel_user_id','blocked_user_id']),
 ('public.user_entitlements',array['user_id','entitlement_key','source','status','revoked_at','starts_at','expires_at','metadata']),
 ('public.access_grants',array['id','user_id','grant_type','provider_event_id','product_id','provider','environment','status','starts_at','expires_at','revoked_at','refunded_at']),
 ('public.provider_events',array['id','provider_event_id','provider','product_id','user_id','environment','status','event_type','occurred_at','created_at','raw_payload_hash','metadata']),
 ('public.revenuecat_premium_transaction_authority',array['id','provider','original_transaction_id','user_id','environment','current_product_id','current_provider_product_id','current_provider_base_plan_id','latest_event_id','latest_event_hash','authority_state','first_event_id','first_event_hash','latest_event_type','latest_occurred_at','created_at','product_change_projection_event_id']),
 ('public.monetization_products',array['id','product_type']),
 ('public.revenuecat_terminal_authority_quarantines',array['id','provider_scope','user_id','environment_scope','event_type','reason','created_at']),
 ('public.revenuecat_terminal_authority_quarantine_resolutions',array['quarantine_id']),
 ('public.revenuecat_consumable_transaction_intents',array['provider','original_transaction_id']),
 ('public.revenuecat_unbound_initial_authority',array['provider','original_transaction_id']),
 ('public.revenuecat_unbound_terminal_authority',array['provider','original_transaction_id'])
), relations as (
 select r.relation_name,to_regclass(r.relation_name) as oid,r.columns from required r
)
select jsonb_build_object(
 'protocol','native-store-install-dependencies-v1',
 'serverVersionNum',current_setting('server_version_num'),'transactionReadOnly',current_setting('transaction_read_only'),
 'currentUser',current_user,'sessionUser',session_user,
 'freshNamespaces',not exists(select 1 from pg_namespace where nspname in('sandbox_commerce_v1','native_store_sandbox_v1')),
 'freshRoles',not exists(select 1 from pg_roles where rolname in('sbx_v1_core_owner','sbx_v1_authority_owner','sbx_v1_operator','native_store_sandbox_v1_owner')),
 'roles',(select jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'inherit',rolinherit,'createRole',rolcreaterole,'createDb',rolcreatedb,'bypassRls',rolbypassrls) order by rolname collate "C") from pg_roles where rolname in('postgres','anon','authenticated','service_role')),
 'eventTriggers',(select coalesce(jsonb_agg(jsonb_build_object('name',evtname,'enabled',evtenabled,'event',evtevent,'function',evtfoid::regprocedure::text) order by evtname collate "C"),'[]'::jsonb) from pg_event_trigger),
 'relations',(select jsonb_agg(jsonb_build_object('relation',r.relation_name,'present',r.oid is not null,
  'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
  'postgresSelect',case when r.oid is null then false else has_table_privilege('postgres',r.oid,'SELECT') end,
  'postgresMaintain',case when r.oid is null then false else has_table_privilege('postgres',r.oid,'MAINTAIN') end,
  'missingColumns',(select coalesce(jsonb_agg(x order by x collate "C"),'[]'::jsonb) from unnest(r.columns) x where not exists(select 1 from pg_attribute a where a.attrelid=r.oid and a.attname=x and not a.attisdropped and a.attnum>0)),
  'columnTypes',(select jsonb_object_agg(a.attname,format_type(a.atttypid,a.atttypmod) order by a.attname collate "C") from pg_attribute a where a.attrelid=r.oid and a.attname=any(r.columns) and not a.attisdropped and a.attnum>0)
 ) order by r.relation_name collate "C") from relations r left join pg_class c on c.oid=r.oid),
 'qualification','metadata_only_not_hosted_install_or_authority_proof'
);
