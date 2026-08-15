begin;
select plan(23);

select is((select count(*)::int from pg_class where relnamespace='public'::regnamespace and relname in
  ('wave1_authority_audit_events','wave1_legal_document_versions','wave1_legal_acceptances','wave1_push_installation_ownership','wave1_creator_eligibility')),5,'all Wave 1 authority tables exist');
select is((select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname in
  ('wave1_session_authority_readback','wave1_legal_requirements_readback','wave1_accept_legal_documents','wave1_entitlement_authority_readback','wave1_push_ownership_readback','wave1_register_push_token','wave1_revoke_push_ownership','wave1_creator_eligibility_readback')),8,'canonical Wave 1 RPC contract exists');
select is((select count(*)::int from pg_class where relnamespace='public'::regnamespace and relname like 'wave1_%' and relkind='r' and relrowsecurity and relforcerowsecurity),5,'authority tables force RLS');
select ok(not has_table_privilege('authenticated','public.wave1_legal_acceptances','INSERT,UPDATE,DELETE'),'clients cannot manufacture legal acceptance');
select ok(not has_table_privilege('authenticated','public.wave1_creator_eligibility','INSERT,UPDATE,DELETE'),'clients cannot manufacture creator eligibility');
select ok(not has_table_privilege('authenticated','public.wave1_push_installation_ownership','INSERT,UPDATE,DELETE'),'clients cannot manufacture push ownership');
select ok(has_function_privilege('authenticated','public.wave1_session_authority_readback()','EXECUTE'),'authenticated sessions may read authority');
select ok(not has_function_privilege('authenticated','public.wave1_revoke_push_ownership(uuid,uuid,text,text,text,text,text,text)','EXECUTE'),'auth-loss revocation stays service-only');
select ok(has_function_privilege('service_role','public.wave1_revoke_push_ownership(uuid,uuid,text,text,text,text,text,text)','EXECUTE'),'edge service may perform destructive-only revocation');
with cases(expected,input,previous) as (values
 ('INELIGIBLE','{"accountStatus":"ACTIVE","moderationState":"CLEAR","market":"OTHER"}'::jsonb,'INELIGIBLE'),
 ('PENDING_VERIFICATION','{"accountStatus":"ACTIVE","moderationState":"CLEAR","market":"UNITED_STATES"}'::jsonb,'INELIGIBLE'),
 ('VERIFIED','{"accountStatus":"ACTIVE","moderationState":"CLEAR","market":"UNITED_STATES","age18Plus":true,"legalAccepted":true,"creatorRole":true,"rolloutEligible":true,"platformCapability":true,"providerEligible":true,"kycComplete":true,"taxComplete":true,"sanctionsClear":true,"payoutEligible":true}'::jsonb,'INELIGIBLE'),
 ('SUSPENDED','{"accountStatus":"ACTIVE","moderationState":"SUSPENDED"}'::jsonb,'VERIFIED'),
 ('REVOKED','{"accountStatus":"ACTIVE","moderationState":"REVOKED"}'::jsonb,'VERIFIED'))
select is((select count(*)::int from cases where public.wave1_compute_creator_eligibility(input,previous)->>'state'=expected),5,'creator evaluator preserves all five states');
select is(public.wave1_compute_creator_eligibility('{"accountStatus":"ACTIVE","moderationState":"CLEAR","market":"UNITED_STATES"}', 'INELIGIBLE')->>'state','PENDING_VERIFICATION','missing evidence remains pending');
with keys(k) as (select unnest(array['age18Plus','legalAccepted','creatorRole','rolloutEligible','platformCapability','providerEligible','kycComplete','taxComplete','sanctionsClear','payoutEligible'])), base(v) as (values ('{"accountStatus":"ACTIVE","moderationState":"CLEAR","market":"UNITED_STATES","age18Plus":true,"legalAccepted":true,"creatorRole":true,"rolloutEligible":true,"platformCapability":true,"providerEligible":true,"kycComplete":true,"taxComplete":true,"sanctionsClear":true,"payoutEligible":true}'::jsonb))
select is((select count(*)::int from keys,base where public.wave1_compute_creator_eligibility(jsonb_set(v,array[k],'false'), 'INELIGIBLE')->>'state'='INELIGIBLE'),10,'each independent creator gate fails closed');
select ok((public.wave1_compute_creator_eligibility('{"accountStatus":"ACTIVE","moderationState":"CLEAR","market":"UNITED_STATES","age18Plus":true,"legalAccepted":true,"creatorRole":true,"rolloutEligible":true,"platformCapability":true,"providerEligible":true,"kycComplete":true,"taxComplete":true,"sanctionsClear":true,"payoutEligible":true}', 'INELIGIBLE')->>'canCreateMoneyExposure')::boolean,'only complete server evidence permits new exposure');
select ok(not (public.wave1_compute_creator_eligibility('{"moderationState":"SUSPENDED"}', 'VERIFIED')->>'canCreateMoneyExposure')::boolean,'suspension blocks new exposure');
select ok((public.wave1_compute_creator_eligibility('{"moderationState":"REVOKED"}', 'VERIFIED')->>'canProcessHistoricalObligations')::boolean,'revocation preserves historical obligations');
create temporary table rollout_fixture as select id from (select md5(n::text)::uuid id from generate_series(1,1000)n)q where mod(hashtextextended('chillywood-wave1-us-rollout-v1:'||id::text,20260814),100)=0 limit 1;
insert into auth.users(id,is_sso_user,is_anonymous) select id,false,false from rollout_fixture;
select is((select public.wave1_evaluate_creator_eligibility(id,'{"accountStatus":"ACTIVE","moderationState":"CLEAR","market":"UNITED_STATES","age18Plus":true,"legalAccepted":true,"creatorRole":true,"rolloutEligible":false,"platformCapability":true,"providerEligible":true,"kycComplete":true,"taxComplete":true,"sanctionsClear":true,"payoutEligible":true}','rollout-boundary','local_pgtap')->>'state' from rollout_fixture),'VERIFIED','the server overrides caller rollout input only for its one-percent bucket');
insert into auth.sessions(id,user_id) select '11111111-1111-4111-8111-111111111111',id from rollout_fixture;
insert into public.wave1_push_installation_ownership(platform,install_id,user_id,account_id,session_generation,ownership_state,revocation_credential_hash,last_operation_key,last_reason) select 'android','pgtap-install',id,id,'11111111-1111-4111-8111-111111111111','ACCOUNT_BOUND',repeat('a',64),'register:pgtap','authenticated_registration' from rollout_fixture;
insert into public.user_push_tokens(user_id,platform,provider,token,token_hash,token_fingerprint,install_id,session_generation,ownership_state) select id,'android','fcm','pgtap-token',repeat('b',64),repeat('b',12),'pgtap-install','11111111-1111-4111-8111-111111111111','ACCOUNT_BOUND' from rollout_fixture;
delete from auth.sessions where id='11111111-1111-4111-8111-111111111111';
select is((select ownership_state from public.wave1_push_installation_ownership where install_id='pgtap-install'),'REVOKED','auth session deletion revokes exact installation ownership');
select ok(not (select enabled from public.user_push_tokens where install_id='pgtap-install'),'auth session deletion disables exact-generation token delivery');
select is((select count(*)::int from public.wave1_legal_document_versions where document_key in ('terms','privacy','community_guidelines','creator_terms','money_terms') and market='UNITED_STATES'),5,'five legal documents are independently versioned for the US');
select is((select count(*)::int from pg_trigger where not tgisinternal and tgname in ('wave1_creator_config_eligibility','wave1_purchase_intent_creator_eligibility','wave1_revoke_push_on_session_delete')),3,'server triggers enforce creator eligibility and auth-loss push cleanup');
select ok((select column_default like '%7 years%' from information_schema.columns where table_schema='public' and table_name='wave1_authority_audit_events' and column_name='retention_expires_at'),'audit retention is bounded');
select like(pg_get_functiondef('public.wave1_register_push_token(uuid,uuid,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure),'%revocation_credential_hash%','push registration binds a revocation credential');
select like(pg_get_functiondef('public.wave1_revoke_push_ownership(uuid,uuid,text,text,text,text,text,text)'::regprocedure),'%session_generation%','push revocation binds the captured session generation');

select * from finish();
rollback;
