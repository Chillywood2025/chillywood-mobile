import test from 'node:test';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
// Reconstructed from the surviving independent 66-step provider proof after
// workspace rollback. The prior e27 test-file bytes were not recoverable.
// Real application SQL/guards run through the shared full-schema fixture.
for(const includeHeldStudio of [false,true]) for(const finalQuarantineStore of ['apple','google'])
test(`real paid TITLE and durable ${finalQuarantineStore} quarantine repair, held Studio ${includeHeldStudio?'included':'absent'}`,{timeout:180_000},async t=>{
const receipt={scope:'Full migrated PGlite schema plus captured runtime overlay and candidate repair. No custom predicate replacements, trigger disabling, replication bypass, production calls, or source edits. Auth/storage managed infrastructure remains the common helper catalog double.',steps:[]};
let db;
let repairApplied=false;
const authorityModes=new Set();
let currentStep='full_schema_replay';
async function step(name,fn){currentStep=name;const result=await fn();receipt.steps.push({name,result});return result;}
async function service(fn){await db.exec('set role service_role');let failed=false;try{return await fn();}catch(error){failed=true;throw error;}finally{try{await db.exec('reset role');}catch(error){if(!failed)throw error;}}}
async function isolate(fn){await db.exec('begin');try{return await fn();}finally{await db.exec('rollback');}}
try{
 const built=await createDatabase({overlayLiveDrift:true,applyRepair:false,includeHeldStudio});db=built.db;
 receipt.candidateHash=crypto.createHash('sha256').update(built.repairSql).digest('hex');receipt.replayReport=built.replayReport;
 const host=(await db.query(`select md5('paid-real-fixture:'||n::text)::uuid id from generate_series(1,1000)n where mod(hashtextextended('chillywood-wave1-us-rollout-v1:'||md5('paid-real-fixture:'||n::text)::uuid::text,20260814),100)=0 limit 1`)).rows[0].id;
 const hostSession='a9000000-0000-4000-8000-000000000001';
 const buyer='b9000000-0000-4000-8000-000000000001';
 const buyerSession='b9000000-0000-4000-8000-000000000002';
 receipt.subjects={host,hostSession,buyer,buyerSession};
 await step('seed_real_accounts_sessions',async()=>{
  await db.query(`insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at)values($1,false,false,now()),($2,false,false,now());`,[host,buyer]);
  await db.query(`insert into auth.sessions(id,user_id)values($1,$2),($3,$4)`,[hostSession,host,buyerSession,buyer]);
  await db.query(`insert into public.user_profiles(user_id,username,display_name)values($1,'paid_real_host','Real schema host'),($2,'paid_real_buyer','Real schema buyer') on conflict(user_id)do nothing`,[host,buyer]);return true;
 });
 await step('seed_current_legal_acceptance',async()=>{
  await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
   select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,'member',d.capability,s.id::text,'service_reconciliation'
   from auth.sessions s cross join public.wave1_legal_document_versions d where s.user_id in($1,$2) and d.active and d.market='UNITED_STATES'
   and (d.capability='account' or (s.user_id=$1 and d.capability in('creator','creator_money')))`,[host,buyer]);
  return (await db.query(`select public.money_purchase_intent_session_authorized_internal($1,$2) buyer_current,public.wave1_user_has_active_legal_requirements_internal($3,'creator_money') creator_current`,[buyer,buyerSession,host])).rows[0];
 });
 await step('evaluate_creator_eligibility',async()=>{
  const row=(await db.query(`select public.wave1_evaluate_creator_eligibility($1,'{"accountStatus":"ACTIVE","age18Plus":true,"legalAccepted":true,"creatorRole":true,"moderationState":"CLEAR","market":"UNITED_STATES","rolloutEligible":false,"platformCapability":true,"providerEligible":true,"kycComplete":true,"taxComplete":true,"sanctionsClear":true,"payoutEligible":true,"inputVersions":{"evaluationSequence":1}}'::jsonb,'paid-runtime-repair-fixture','local_pgtap') result`,[host])).rows[0];
  assert.equal(row.result.state,'VERIFIED');return row;
 });
 const products=await step('read_real_paid_catalog',async()=> (await db.query(`select p.id,p.product_key,p.product_type,p.provider,p.provider_product_id,p.status,p.environment,p.metadata,m.provider mapping_provider,m.provider_product_id mapping_product_id,m.reference_price_minor,m.reference_currency from public.monetization_products p left join public.monetization_product_store_mappings m on m.product_id=p.id and m.environment='sandbox' where p.product_type='watch_party_live_ticket' order by p.product_key,m.provider`)).rows);
 await db.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false),set_config('request.jwt.claim.role','service_role',false)`);
 await step('configure_local_sandbox_only_switches',async()=>{
  await db.query(`update public.platform_money_kill_switches set state='sandbox_only' where key in('revenuecat_app_store_enabled','revenuecat_google_play_enabled','provider_webhooks_enabled','creator_monetization_enabled','watch_party_tickets_enabled')`);
  return (await db.query(`select key,state from public.platform_money_kill_switches where key in('revenuecat_app_store_enabled','revenuecat_google_play_enabled','provider_webhooks_enabled','creator_monetization_enabled','watch_party_tickets_enabled','live_money_enabled') order by key`)).rows;
 });
 await step('seed_paid_title_offer',async()=>{
  await db.query(`insert into public.watch_party_rooms(party_id,title_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)values('REALPAIDAPPLE','paid-real-title',$1,'title','open','party_pass',true,'private')`,[host]);
  await db.query(`insert into public.paid_watch_party_offers(id,party_id,creator_id,host_id,title,price_cents,currency,starts_at,ends_at,status,provider,provider_product_id,metadata) values('c9000000-0000-4000-8000-000000000001','REALPAIDAPPLE',$1,$1,'Real paid title',99,'usd',now()-interval '5 minutes',now()+interval '1 hour','sandbox','revenuecat','com.chillywood.seatpass.tier1','{"sandbox_only":true,"not_payable":true}')`,[host]);return true;
 });
 await step('seed_pending_source_intent_normal_guards',async()=>{
  await db.query(`insert into public.money_purchase_intents(id,user_id,product_id,product_key,product_type,provider,provider_product_id,source_type,source_id,creator_id,environment,status,amount_minor,currency,idempotency_key,expires_at,session_generation,metadata)
  select 'd9000000-0000-4000-8000-000000000001',$1,m.product_id,p.product_key,p.product_type,m.provider,m.provider_product_id,'watch_party_live','c9000000-0000-4000-8000-000000000001',$2,'sandbox','pending',m.reference_price_minor,m.reference_currency,'paid-real-apple-intent',now()+interval '15 minutes',$3,'{"sandbox_only":true,"not_payable":true}'
  from public.monetization_product_store_mappings m join public.monetization_products p on p.id=m.product_id where m.provider='revenuecat_app_store' and m.provider_product_id='com.chillywood.seatpass.tier1' and m.environment='sandbox'`,[buyer,host,buyerSession]);
  return (await db.query(`select id,status,provider,source_id,session_generation from public.money_purchase_intents where id='d9000000-0000-4000-8000-000000000001'`)).rows;
 });
 await step('apply_real_apple_provider_event',async()=>{
  await db.exec('set role service_role');
  try {const row=(await db.query(`select public.process_revenuecat_app_store_event_atomic('paid-real-apple-event','INITIAL_PURCHASE',$1,'com.chillywood.seatpass.tier1','sandbox',now()-interval '2 minutes',null,99,'usd',repeat('a',64),'paid-real-apple-original',null) result`,[buyer])).rows[0]; assert.equal(row.result.status,'processed',JSON.stringify(row));return row;}
  finally {await db.exec('reset role');}
 });
 await step('read_generated_paid_chain',async()=>{
  const rows=(await db.query(`select g.id grant_id,g.status grant_status,g.metadata grant_metadata,t.id ticket_id,t.status ticket_status,t.metadata ticket_metadata,l.binding_state,l.terminal from public.access_grants g left join public.paid_watch_party_tickets t on t.access_grant_id=g.id left join public.revenuecat_consumable_transaction_intents l on l.purchase_intent_id='d9000000-0000-4000-8000-000000000001' where g.user_id=$1`,[buyer])).rows;
  return rows;
 });
 await step('real_service_paid_authority',async()=>{
  await db.exec('set role service_role');
  try{return (await db.query(`select public.resolve_watch_party_livekit_viewer_authority('REALPAIDAPPLE',$1,$2) buyer,public.resolve_watch_party_livekit_viewer_authority('REALPAIDAPPLE',$3,$4) host`,[buyer,buyerSession,host,hostSession])).rows[0];}
  finally{await db.exec('reset role');}
 });
 await step('seed_google_title_offer_intent',async()=>{
  await db.query(`insert into public.watch_party_rooms(party_id,title_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)values('REALPAIDGOOGLE','paid-real-google-title',$1,'title','open','party_pass',true,'private')`,[host]);
  await db.query(`insert into public.paid_watch_party_offers(id,party_id,creator_id,host_id,title,price_cents,currency,starts_at,ends_at,status,provider,provider_product_id,metadata)values('c9000000-0000-4000-8000-000000000002','REALPAIDGOOGLE',$1,$1,'Real paid Google title',99,'usd',now()-interval '5 minutes',now()+interval '1 hour','sandbox','revenuecat_google_play','cw_watch_party_live_ticket_sandbox_099','{"sandbox_only":true,"not_payable":true}')`,[host]);
  await db.query(`insert into public.money_purchase_intents(id,user_id,product_id,product_key,product_type,provider,provider_product_id,source_type,source_id,creator_id,environment,status,amount_minor,currency,idempotency_key,expires_at,session_generation,metadata)
   select 'd9000000-0000-4000-8000-000000000002',$1,p.id,p.product_key,p.product_type,p.provider,p.provider_product_id,'watch_party_live','c9000000-0000-4000-8000-000000000002',$2,'sandbox','pending',99,'usd','paid-real-google-intent',now()+interval '15 minutes',$3,'{"sandbox_only":true,"not_payable":true}'
   from public.monetization_products p where p.product_key='watch_party_live_ticket_sandbox_099'`,[buyer,host,buyerSession]);return true;
 });
 const fixtures=[
  {store:'apple',provider:'revenuecat_app_store',sku:'com.chillywood.seatpass.tier1',party:'REALPAIDAPPLE',offer:'c9000000-0000-4000-8000-000000000001',intent:'d9000000-0000-4000-8000-000000000001'},
  {store:'google',provider:'revenuecat_google_play',sku:'cw_watch_party_live_ticket_sandbox_099',party:'REALPAIDGOOGLE',offer:'c9000000-0000-4000-8000-000000000002',intent:'d9000000-0000-4000-8000-000000000002'}
 ];
 assert.deepEqual(fixtures.map(f=>[f.store,f.provider,f.party]),[
  ['apple','revenuecat_app_store','REALPAIDAPPLE'],['google','revenuecat_google_play','REALPAIDGOOGLE']
 ]);
 await step('apply_real_google_provider_event',()=>service(async()=>{
  const row=(await db.query(`select public.process_revenuecat_google_play_event_atomic('paid-real-google-event','INITIAL_PURCHASE',$1,'cw_watch_party_live_ticket_sandbox_099','sandbox',now()-interval '2 minutes',null,99,'usd',repeat('b',64),'paid-real-google-original',null) result`,[buyer])).rows[0];assert.equal(row.result.status,'processed',JSON.stringify(row));return row;
 }));
 async function authority(f,subject=buyer,session=buyerSession,party=f.party){if(repairApplied)authorityModes.add(`${f.store}:${subject===host?'host':'buyer'}:${session===null?'target':'current'}`);return service(async()=>(await db.query(`select public.resolve_watch_party_livekit_viewer_authority($1,$2,$3) result`,[party,subject,session])).rows[0].result);}
 for(const f of fixtures)await step(`${f.store}_captured_live_exact_price_gap`,()=>isolate(async()=>{
  await db.query(`update public.money_purchase_intents set amount_minor=100 where id=$1`,[f.intent]);const result=await authority(f);assert.equal(result.allowed,true,JSON.stringify(result));return result;
 }));
 const quarantineFixture=fixtures.find(f=>f.store===finalQuarantineStore)||fixtures[0];
 await step('captured_live_existing_host_quarantine_projection_conflict',async()=>{
  await db.query(`select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.role','authenticated',false)`,[JSON.stringify({role:'authenticated',sub:host,session_id:hostSession})]);
  await db.exec('set role authenticated');await db.query(`select party_id from public.join_watch_party_room_session($1)`,[quarantineFixture.party]);await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false),set_config('request.jwt.claim.role','service_role',false)`);
  await db.exec('begin');
  try{await service(()=>db.query(`select public.quarantine_revenuecat_terminal_authority($1,'paid-real-existing-host-quarantine','REFUND',$2,'sandbox',repeat('f',64),'fixture_unresolved_terminal')`,[quarantineFixture.provider,host]));throw new Error('Expected existing host-quarantine projection conflict was absent');}
  catch(error){assert.equal(error.message,'watch_party_host_authority_invalid');await db.exec('rollback');
   const readback=(await db.query(`select (select count(*)::integer from public.revenuecat_terminal_authority_quarantines where user_id=$1) quarantine_count, public.revenuecat_authority_quarantined_internal(null,$1,null) host_quarantined, (select jsonb_agg(jsonb_build_object('party_id',party_id,'status',status)) from public.paid_watch_party_offers where creator_id=$1) offers, (select jsonb_agg(jsonb_build_object('status',status,'source_id',source_id,'revoked_at',revoked_at)) from public.access_grants where user_id=$2) buyer_grants, (select jsonb_agg(jsonb_build_object('party_id',party_id,'membership_state',membership_state,'role',role,'stage_role',stage_role)) from public.watch_party_room_memberships where user_id=$1::text) host_memberships`,[host,buyer])).rows[0];
   const hostAuthority=await authority(quarantineFixture,host,hostSession);const hostTargetAuthority=await authority(quarantineFixture,host,null);assert.equal(readback.quarantine_count,0);assert.equal(readback.host_quarantined,false);assert.equal(hostAuthority.allowed,true);assert.equal(hostTargetAuthority.allowed,true);
   const membership=(await db.query(`select party_id,user_id,joined_at from public.watch_party_room_memberships where party_id=$1 and user_id=$2`,[quarantineFixture.party,host])).rows[0];
   receipt.preRepairHostQuarantineFailure={provider:quarantineFixture.provider,existingHostQuarantineProjectionConflict:true,message:error.message,where:error.where,readback,hostAuthority,hostTargetAuthority,failClosed:false,membership};return receipt.preRepairHostQuarantineFailure;}
 });
 const boundarySql=`select p.oid::regprocedure::text signature,p.proowner::regrole::text owner,p.proacl::text acl,p.prosecdef,p.proconfig,case when p.proname='enforce_watch_party_membership_identity' then pg_get_functiondef(p.oid) else null end identity_trigger_definition from pg_proc p where p.oid in('public.apply_revenuecat_terminal_quarantine_projection_internal(uuid)'::regprocedure,'public.enforce_watch_party_membership_identity()'::regprocedure) order by p.proname`;
 const quarantineBoundaryBefore=(await db.query(boundarySql)).rows;
 await step('apply_exact_forward_repair',async()=>{await db.exec(built.repairSql);repairApplied=true;return{candidateHash:receipt.candidateHash};});
 await step('quarantine_acl_and_membership_trigger_unchanged',async()=>{const after=(await db.query(boundarySql)).rows;assert.deepEqual(after,quarantineBoundaryBefore);return true;});
 for(const f of fixtures)await step(`${f.store}_quarantined_host_readside`,()=>isolate(async()=>{
  const mutation=await service(async()=> (await db.query(`select public.quarantine_revenuecat_terminal_authority($1,$2,'REFUND',$3,'sandbox',repeat('d',64),'fixture_unresolved_terminal') result`,[f.provider,`paid-real-${f.store}-host-quarantine`,host])).rows[0]);
  const result=await authority(f,host,hostSession);assert.equal(result.allowed,false);assert.equal(result.reason,'paid_room_host_creator_authority_required');return{mutation,result};
 }));
 async function denial(name,f,mutate,subject=buyer,session=buyerSession){return step(`${f.store}_${name}`,()=>isolate(async()=>{const mutation=await mutate();const result=await authority(f,subject,session);assert.equal(result.allowed,false,JSON.stringify(result));const target=await authority(f,subject,null);assert.equal(target.allowed,['expired_session','missing_current_account_legal'].includes(name),JSON.stringify(target));return {mutation,result,target};}));}
 for(const f of fixtures){
  await step(`${f.store}_real_authenticated_join`,async()=>{
   await db.query(`select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.role','authenticated',false)`,[JSON.stringify({role:'authenticated',sub:buyer,session_id:buyerSession})]);
   await db.exec('set role authenticated');
   try {const rows=(await db.query(`select party_id,user_id,membership_state from public.join_watch_party_room_session($1)`,[f.party])).rows;assert.equal(rows[0]?.membership_state,'active');return rows;}
   finally{await db.exec('reset role');await db.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false),set_config('request.jwt.claim.role','service_role',false)`);}
  });
  await step(`${f.store}_real_authenticated_host_join`,async()=>{
   await db.query(`select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.role','authenticated',false)`,[JSON.stringify({role:'authenticated',sub:host,session_id:hostSession})]);
   await db.exec('set role authenticated');
   try {const rows=(await db.query(`select party_id,user_id,membership_state from public.join_watch_party_room_session($1)`,[f.party])).rows;assert.equal(rows[0]?.membership_state,'active');return rows;}
   finally{await db.exec('reset role');await db.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false),set_config('request.jwt.claim.role','service_role',false)`);}
  });
  await step(`${f.store}_full_chain`,async()=>{
   const row=(await db.query(`select g.id grant_id,g.status grant_status,g.expires_at grant_expiry,t.id ticket_id,t.status ticket_status,t.expires_at ticket_expiry,l.binding_state,l.terminal,l.original_transaction_id,i.status intent_status,i.consumed_at,i.session_generation,e.status event_status,i.amount_minor,i.currency from public.money_purchase_intents i join public.revenuecat_consumable_transaction_intents l on l.purchase_intent_id=i.id join public.access_grants g on g.metadata->>'purchase_intent_id'=i.id::text join public.paid_watch_party_tickets t on t.access_grant_id=g.id join public.provider_events e on e.id=g.provider_event_id where i.id=$1`,[f.intent])).rows[0];assert.equal(row.binding_state,'exact');assert.equal(row.terminal,false);assert.equal(row.ticket_status,'active');f.grant=row.grant_id;f.event=(await db.query(`select provider_event_id from public.access_grants where id=$1`,[f.grant])).rows[0].provider_event_id;return row;
  });
  await step(`${f.store}_positive_current_null_and_host`,async()=>{
   const current=await authority(f);const target=await authority(f,buyer,null);const hostResult=await authority(f,host,hostSession);const hostTarget=await authority(f,host,null);
   for(const result of[current,target,hostResult,hostTarget])assert.equal(result.allowed,true,JSON.stringify(result));assert.equal(current.hostAuthority,false);assert.equal(current.speakerEligible,false);assert.equal(hostResult.hostAuthority,true);return{current,target,host:hostResult,hostTarget};
  });
  await step(`${f.store}_normalization_denials`,async()=>{const rows=[];for(const party of[f.party.toLowerCase(),` ${f.party} `])for(const session of[buyerSession,null]){const result=await authority(f,buyer,session,party);assert.equal(result.allowed,false);rows.push({party,session,result});}return rows;});
  await step(`${f.store}_exact_session_ttl_host_and_buyer`,()=>isolate(async()=>{
   const cutoff=(await db.query(`update auth.sessions set not_after=now()+interval '5 seconds' where id in($1,$2) returning not_after`,[hostSession,buyerSession])).rows[0].not_after;
   const viewer=await authority(f);const owner=await authority(f,host,hostSession);for(const result of[viewer,owner]){assert.equal(result.allowed,true);assert.equal(new Date(result.expiresAt).getTime(),new Date(cutoff).getTime());}return{cutoff,viewer,owner};
  }));
  await step(`${f.store}_exact_ticket_ttl`,()=>isolate(async()=>{
   const cutoff=(await db.query(`update public.paid_watch_party_tickets set expires_at=now()+interval '7 seconds' where access_grant_id=$1 returning expires_at`,[f.grant])).rows[0].expires_at;
   const result=await authority(f);assert.equal(result.allowed,true);assert.equal(new Date(result.expiresAt).getTime(),new Date(cutoff).getTime());return{cutoff,result};
  }));
  await step(`${f.store}_exact_offer_ttl_host_and_buyer`,()=>isolate(async()=>{
   const cutoff=(await db.query(`update public.paid_watch_party_offers set ends_at=now()+interval '9 seconds' where id=$1 returning ends_at`,[f.offer])).rows[0].ends_at;
   const viewer=await authority(f);const owner=await authority(f,host,hostSession);for(const result of[viewer,owner]){assert.equal(result.allowed,true);assert.equal(new Date(result.expiresAt).getTime(),new Date(cutoff).getTime());}return{cutoff,viewer,owner};
  }));
  await denial('expired_session',f,async()=>{await db.query(`update auth.sessions set not_after=now()-interval '1 second' where id=$1`,[buyerSession]);return true;});
  await denial('missing_current_account_legal',f,async()=>{await db.query(`delete from public.wave1_legal_acceptances where user_id=$1 and capability='account'`,[buyer]);return true;});
  await denial('missing_creator_money_legal',f,async()=>{await db.query(`delete from public.wave1_legal_acceptances where user_id=$1 and capability='creator_money'`,[host]);return true;});
  await denial('expired_grant',f,async()=>{await db.query(`update public.access_grants set expires_at=now()-interval '1 second' where id=$1`,[f.grant]);return true;});
  await denial('mismatched_intent_offer_amount',f,async()=>{await db.query(`update public.money_purchase_intents set amount_minor=100 where id=$1`,[f.intent]);return true;});
  await denial('mismatched_event_sku',f,async()=>{await db.query(`update public.provider_events set metadata=jsonb_set(metadata,'{provider_product_id}','"wrong-sku"') where id=$1`,[f.event]);return true;});
  await denial('terminal_exact_link',f,async()=>{await db.query(`update public.revenuecat_consumable_transaction_intents set terminal=true where purchase_intent_id=$1`,[f.intent]);return true;});
  await denial('ambiguous_exact_link',f,async()=>{await db.query(`update public.revenuecat_consumable_transaction_intents set binding_state='ambiguous_legacy' where purchase_intent_id=$1`,[f.intent]);return true;});
  for(const [label,original]of[['empty',''],['whitespace','   ']])await denial(`${label}_original_id`,f,async()=>{
   await db.query(`update public.provider_events set metadata=jsonb_set(metadata,'{original_transaction_id}',to_jsonb($2::text)) where id=$1`,[f.event,original]);
   await db.query(`update public.access_grants set metadata=jsonb_set(metadata,'{original_transaction_id}',to_jsonb($2::text)) where id=$1`,[f.grant,original]);
   await db.query(`update public.revenuecat_consumable_transaction_intents set original_transaction_id=$2 where purchase_intent_id=$1`,[f.intent,original]);return true;
  });
  await denial('quarantined_buyer',f,async()=>{
   const other=fixtures.find(row=>row.provider!==f.provider);const otherBefore=await authority(other,buyer,null);
   const quarantine=await service(async()=> (await db.query(`select public.quarantine_revenuecat_terminal_authority($1,$2,'REFUND',$3,'sandbox',repeat('c',64),'fixture_unresolved_terminal') result`,[f.provider,`paid-real-${f.store}-quarantine`,buyer])).rows[0]);
   const grants=(await db.query(`select provider,status,revoked_at from public.access_grants where user_id=$1 order by provider`,[buyer])).rows;
   for(const grant of grants)assert.equal(grant.status,grant.provider===f.provider?'blocked':'sandbox_only');
   const otherCurrent=await authority(other);const otherTarget=await authority(other,buyer,null);assert.equal(otherCurrent.allowed,true);assert.equal(otherTarget.allowed,false);
   return{quarantine,grants,otherProviderCurrent:otherCurrent,otherProviderTargetBefore:otherBefore,otherProviderTargetAfter:otherTarget,membershipScope:'Existing projection invalidates all paid memberships of this subject; grant quarantine remains provider-scoped.'};
  });
  await denial('actual_provider_revocation',f,()=>service(async()=>{
   const row=(await db.query(`select public.process_${f.provider}_event_atomic($1,'REVOCATION',$2,$3,'sandbox',now(),null,99,'usd',repeat('e',64),$4,null) result`,[`paid-real-${f.store}-revoke`,buyer,f.sku,`paid-real-${f.store}-original`])).rows[0];assert.equal(row.result.status,'processed',JSON.stringify(row));return row;
  }));
 }
 if(finalQuarantineStore){
  const selected=fixtures.find(f=>f.store===finalQuarantineStore);assert.ok(selected,'Unsupported final quarantine store');
  await step('seed_same_subject_free_room_normal_joins',async()=>{
   await db.query(`insert into public.watch_party_rooms(party_id,title_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)values('REALFREECONTROL','paid-real-free-control',$1,'title','open','open',true,'private')`,[host]);
   for(const [user,session]of[[host,hostSession],[buyer,buyerSession]]){
    await db.query(`select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.role','authenticated',false)`,[JSON.stringify({role:'authenticated',sub:user,session_id:session})]);await db.exec('set role authenticated');
    try{await db.query(`select party_id from public.join_watch_party_room_session('REALFREECONTROL')`);}finally{await db.exec('reset role');}
   }
   await db.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false),set_config('request.jwt.claim.role','service_role',false)`);
   const result=await authority(selected,host,hostSession,'REALFREECONTROL');assert.equal(result.allowed,true);return result;
  });
  const before=await step('read_before_committed_host_quarantine',async()=> (await db.query(`select party_id,user_id,role,stage_role,can_speak,membership_state,left_at,camera_enabled,mic_enabled,joined_at from public.watch_party_room_memberships order by party_id,user_id`)).rows);
  const quarantineArgs=[selected.provider,`paid-real-${selected.store}-committed-host-quarantine`,host];
  const quarantine=await step(`${selected.store}_commit_joined_host_quarantine`,()=>service(async()=>{
   const row=(await db.query(`select public.quarantine_revenuecat_terminal_authority($1,$2,'REFUND',$3,'sandbox',repeat('9',64),'fixture_unresolved_terminal') result`,quarantineArgs)).rows[0].result;assert.equal(row.status,'quarantined');assert.equal(row.duplicateEvent,false);assert.equal(row.authorityGranted,false);return row;
  }));
  await step(`${selected.store}_committed_quarantine_readback`,async()=>{
   const evidence=(await db.query(`select (select count(*)::integer from public.revenuecat_terminal_authority_quarantines where id=$1) count,public.revenuecat_authority_quarantined_internal($2,$3,'sandbox') host_quarantined`,[quarantine.quarantineId,selected.provider,host])).rows[0];assert.equal(evidence.count,1);assert.equal(evidence.host_quarantined,true);
   const rows=(await db.query(`select party_id,user_id,role,stage_role,can_speak,membership_state,left_at,camera_enabled,mic_enabled,joined_at from public.watch_party_room_memberships order by party_id,user_id`)).rows;
   const sameHost=rows.find(r=>r.party_id===receipt.preRepairHostQuarantineFailure.membership.party_id&&r.user_id===host);assert.equal(new Date(sameHost.joined_at).getTime(),new Date(receipt.preRepairHostQuarantineFailure.membership.joined_at).getTime());
   for(const old of before){const row=rows.find(r=>r.party_id===old.party_id&&r.user_id===old.user_id);assert.ok(row);if(row.user_id===host&&row.party_id!=='REALFREECONTROL'){assert.equal(row.membership_state,'removed');assert.ok(row.left_at);assert.equal(row.role,'host');assert.equal(row.stage_role,'host');assert.equal(row.can_speak,true);assert.equal(row.camera_enabled,false);assert.equal(row.mic_enabled,false);assert.equal(new Date(row.joined_at).getTime(),new Date(old.joined_at).getTime());}else assert.deepEqual(row,old);}
   const authorityResults=[];for(const f of fixtures)for(const session of[hostSession,null]){const result=await authority(f,host,session);assert.equal(result.allowed,false);authorityResults.push({party:f.party,subject:'host',session,result});}
   for(const f of fixtures)for(const session of[buyerSession,null]){const result=await authority(f,buyer,session);assert.equal(result.allowed,true);assert.equal(result.hostAuthority,false);assert.equal(result.speakerEligible,false);authorityResults.push({party:f.party,subject:'unrelated_buyer',session,result});}
   for(const session of[hostSession,null]){const result=await authority(selected,host,session,'REALFREECONTROL');assert.equal(result.allowed,true);authorityResults.push({party:'REALFREECONTROL',subject:'host',session,result});}
   const grants=(await db.query(`select status,revoked_at,provider from public.access_grants where user_id=$1 order by provider`,[buyer])).rows;for(const row of grants){assert.equal(row.status,'sandbox_only');assert.equal(row.revoked_at,null);}return{evidence,rows,authorityResults,unrelatedBuyerGrants:grants};
  });
  await step(`${selected.store}_duplicate_committed_quarantine_idempotent`,()=>service(async()=>{
   const row=(await db.query(`select public.quarantine_revenuecat_terminal_authority($1,$2,'REFUND',$3,'sandbox',repeat('9',64),'fixture_unresolved_terminal') result`,quarantineArgs)).rows[0].result;assert.equal(row.status,'quarantined');assert.equal(row.duplicateEvent,true);assert.equal(row.quarantineId,quarantine.quarantineId);return row;
  }));
  await step(`${selected.store}_removed_host_cannot_read_or_rejoin`,async()=>{
   await db.query(`select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.role','authenticated',false)`,[JSON.stringify({role:'authenticated',sub:host,session_id:hostSession})]);await db.exec('set role authenticated');
   try{
    const results=[];
    for(const f of fixtures){const row=(await db.query(`select public.can_read_watch_party_room_authority($1) can_read`,[f.party])).rows[0];assert.equal(row.can_read,false);let failure;try{await db.query(`select party_id from public.join_watch_party_room_session($1)`,[f.party]);}catch(error){failure=error.message;}assert.equal(failure,'watch_party_membership_removed');let heartbeatFailure;try{await db.query(`select party_id from public.heartbeat_watch_party_room_session($1,'active',true,true)`,[f.party]);}catch(error){heartbeatFailure=error.message;}assert.equal(heartbeatFailure,'watch_party_join_rpc_required');results.push({party:f.party,...row,rejoinFailure:failure,heartbeatFailure});}
    const free=(await db.query(`select public.can_read_watch_party_room_authority('REALFREECONTROL') can_read`)).rows[0];assert.equal(free.can_read,true);return{paid:results,free};
   }finally{await db.exec('reset role');await db.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false),set_config('request.jwt.claim.role','service_role',false)`);}
  });
  await step(`${selected.store}_one_durable_quarantine_after_duplicate`,async()=>{const row=(await db.query(`select (select count(*)::integer from public.revenuecat_terminal_authority_quarantines where raw_payload_hash=repeat('9',64)) count,(select count(*)::integer from public.watch_party_room_memberships where user_id=$1 and party_id in('REALPAIDAPPLE','REALPAIDGOOGLE') and membership_state='removed' and left_at is not null and not camera_enabled and not mic_enabled) removed_paid_host_memberships`,[host])).rows[0];assert.equal(row.count,1);assert.equal(row.removed_paid_host_memberships,2);return row;});
 }
 receipt.completed=true;
}catch(error){
 error.message=`${currentStep}: ${error.message}`;
 throw error;
}finally{if(db)await db.close();}
assert.equal(receipt.completed,true);
assert.deepEqual([...authorityModes].sort(),['apple','google'].flatMap(store=>['host','buyer'].flatMap(subject=>['target','current'].map(mode=>`${store}:${subject}:${mode}`))).sort());
assert.equal(receipt.steps.length,66,'the recovered provider proof must execute every retained step');
const expectedStepNames=[
 "seed_real_accounts_sessions",
 "seed_current_legal_acceptance",
 "evaluate_creator_eligibility",
 "read_real_paid_catalog",
 "configure_local_sandbox_only_switches",
 "seed_paid_title_offer",
 "seed_pending_source_intent_normal_guards",
 "apply_real_apple_provider_event",
 "read_generated_paid_chain",
 "real_service_paid_authority",
 "seed_google_title_offer_intent",
 "apply_real_google_provider_event",
 "apple_captured_live_exact_price_gap",
 "google_captured_live_exact_price_gap",
 "captured_live_existing_host_quarantine_projection_conflict",
 "apply_exact_forward_repair",
 "quarantine_acl_and_membership_trigger_unchanged",
 "apple_quarantined_host_readside",
 "google_quarantined_host_readside",
 "apple_real_authenticated_join",
 "apple_real_authenticated_host_join",
 "apple_full_chain",
 "apple_positive_current_null_and_host",
 "apple_normalization_denials",
 "apple_exact_session_ttl_host_and_buyer",
 "apple_exact_ticket_ttl",
 "apple_exact_offer_ttl_host_and_buyer",
 "apple_expired_session",
 "apple_missing_current_account_legal",
 "apple_missing_creator_money_legal",
 "apple_expired_grant",
 "apple_mismatched_intent_offer_amount",
 "apple_mismatched_event_sku",
 "apple_terminal_exact_link",
 "apple_ambiguous_exact_link",
 "apple_empty_original_id",
 "apple_whitespace_original_id",
 "apple_quarantined_buyer",
 "apple_actual_provider_revocation",
 "google_real_authenticated_join",
 "google_real_authenticated_host_join",
 "google_full_chain",
 "google_positive_current_null_and_host",
 "google_normalization_denials",
 "google_exact_session_ttl_host_and_buyer",
 "google_exact_ticket_ttl",
 "google_exact_offer_ttl_host_and_buyer",
 "google_expired_session",
 "google_missing_current_account_legal",
 "google_missing_creator_money_legal",
 "google_expired_grant",
 "google_mismatched_intent_offer_amount",
 "google_mismatched_event_sku",
 "google_terminal_exact_link",
 "google_ambiguous_exact_link",
 "google_empty_original_id",
 "google_whitespace_original_id",
 "google_quarantined_buyer",
 "google_actual_provider_revocation",
 "seed_same_subject_free_room_normal_joins",
 "read_before_committed_host_quarantine",
 `${finalQuarantineStore}_commit_joined_host_quarantine`,
 `${finalQuarantineStore}_committed_quarantine_readback`,
 `${finalQuarantineStore}_duplicate_committed_quarantine_idempotent`,
 `${finalQuarantineStore}_removed_host_cannot_read_or_rejoin`,
 `${finalQuarantineStore}_one_durable_quarantine_after_duplicate`,
];
assert.deepEqual(receipt.steps.map(step=>step.name),expectedStepNames,'the exact provider/repair/quarantine sequence must execute');
t.diagnostic(`${receipt.steps.length} actual provider/authority steps, migration SHA256 ${receipt.candidateHash}`);
});
