import fs from 'node:fs';
import crypto from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

// Reconstructed from the surviving independent controlled-composition proof.
// This uses synthetic tables and explicit authorization predicate doubles.
// It supplements, and cannot replace, the separate real full-schema suite.
const root=new URL('../../',import.meta.url);
export async function createControlledPaidDatabase(){
const candidateSource=fs.readFileSync(new URL('supabase/migrations/20261015150707_runtime_authority_forward_repair.sql',root),'utf8');
const liveSource=fs.readFileSync(new URL('tests/fixtures/database-runtime-production-20261015.sql',root),'utf8');
const candidateHash=crypto.createHash('sha256').update(candidateSource).digest('hex');
function definition(file,name,newName=name){
 const sql=file==='candidate'?candidateSource:file==='captured'?liveSource:fs.readFileSync(new URL('supabase/migrations/'+file,root),'utf8');
 const rx=new RegExp('create (?:or replace )?function \"?(public|private)\"?\\.\"?'+name+'\"?\\s*\\(' ,'i');
 const match=rx.exec(sql);if(!match)throw Error(`Missing definition ${name} in ${file}`);
 const start=match.index,dollar=/\$[a-zA-Z_0-9]*\$/.exec(sql.slice(start));
 if(!dollar)throw Error(`Missing body delimiter for ${name}`);
 const body=start+dollar.index,close=sql.indexOf(dollar[0]+';',body+dollar[0].length);
 if(close<0)throw Error(`Unterminated definition ${name}`);
 return sql.slice(start,close+dollar[0].length+1).replace(name,newName).replace(/^create function/i,'create or replace function');
}
const actual=['watch_party_room_access_pre_live_decouple','resolve_watch_party_livekit_authority_pre_service_fix'].map(name=>({name,definition:definition('captured',name)}));
// These are the exact latest source bodies before the historical renames.
const expected=[
 {name:'watch_party_room_access_pre_live_decouple',definition:definition('202608250001_chilly_chat_room_authority_closure.sql','watch_party_room_self_access_allowed_internal','watch_party_room_access_pre_live_decouple')},
 {name:'resolve_watch_party_livekit_authority_pre_service_fix',definition:definition('202608250001_chilly_chat_room_authority_closure.sql','resolve_watch_party_livekit_viewer_authority','resolve_watch_party_livekit_authority_pre_service_fix')}
];
const db=new PGlite();
try {
await db.exec(`set check_function_bodies=false; set timezone='UTC';
create schema auth; create schema private;
create function auth.role() returns text language sql stable as $$select 'service_role'::text$$;
create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select '{"role":"service_role"}'::jsonb$$;
create function public.wave1_current_caller_authority_internal() returns boolean language sql stable as $$select true$$;
create function public.whole_app_exact_current_session_authority_internal() returns boolean language sql stable as $$select true$$;
create function public.is_account_access_restricted(text) returns boolean language sql stable as $$select false$$;
create function public.watch_party_room_actor_blocked_by_host(text,text) returns boolean language sql stable as $$select false$$;
create function public.revenuecat_authority_quarantined_internal(text,uuid,text) returns boolean language sql stable as $$select current_setting('fixture.quarantine')::boolean$$;
create function public.wave1_creator_money_subject_authorized_internal(uuid) returns boolean language sql stable as $$select current_setting('fixture.creator_authority')::boolean$$;
create function public.money_purchase_intent_session_authorized_internal(uuid,text) returns boolean language sql stable as $$select current_setting('fixture.session_legal')::boolean$$;
create function public.premium_subject_has_finite_authority_internal(text) returns boolean language sql stable as $$select true$$;
create function public.user_has_active_entitlement(text,text[]) returns boolean language sql stable as $$select true$$;
create function public.is_active_chilly_circle_member(text,text) returns boolean language sql stable as $$select true$$;
create function public.is_circle_spectator_viewer_blocked(text,text) returns boolean language sql stable as $$select false$$;
create function private.party_room_publication_current(text) returns boolean language sql stable as $$select true$$;
create table public.user_entitlements(user_id text,entitlement_key text,status text,revoked_at timestamptz,expires_at timestamptz);
create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);
create table auth.users(id uuid,deleted_at timestamptz,email_confirmed_at timestamptz);
insert into auth.users values('10000000-0000-4000-8000-000000000000',null,null),('20000000-0000-4000-8000-000000000000',null,null);
create table public.watch_party_rooms(party_id text primary key,host_user_id uuid,is_active boolean,content_access_rule text,room_type text,join_policy text,discovery_visibility text);
create table public.watch_party_room_memberships(party_id text,user_id text,membership_state text,left_at timestamptz,last_seen_at timestamptz);
create table public.paid_watch_party_offers(id uuid,party_id text,creator_id uuid,host_id uuid,status text,starts_at timestamptz,ends_at timestamptz,updated_at timestamptz,price_cents int,currency text);
create table public.wave1_creator_eligibility(creator_user_id uuid,state text,account_status text,age_18_plus boolean,legal_accepted boolean,creator_role boolean,moderation_state text,market text,rollout_eligible boolean,platform_capability boolean,provider_eligible boolean,kyc_complete boolean,tax_complete boolean,sanctions_clear boolean,payout_eligible boolean);
create table public.monetization_products(id uuid,product_type text,product_key text);
create table public.provider_events(id uuid,provider_event_id text,provider text,product_id uuid,user_id uuid,environment text,status text,metadata jsonb);
create table public.money_purchase_intents(id uuid,user_id uuid,product_id uuid,product_key text,product_type text,provider text,provider_product_id text,source_type text,source_id uuid,creator_id uuid,environment text,status text,consumed_at timestamptz,revoked_at timestamptz,amount_minor int,currency text);
create table public.access_grants(id uuid,user_id uuid,source_id uuid,product_id uuid,provider_event_id uuid,provider text,environment text,grant_type text,source_type text,status text,starts_at timestamptz,expires_at timestamptz,refunded_at timestamptz,revoked_at timestamptz,metadata jsonb,created_at timestamptz);
create table public.paid_watch_party_tickets(id uuid,access_grant_id uuid,offer_id uuid,party_id text,buyer_id uuid,creator_id uuid,host_id uuid,provider text,provider_transaction_id text,status text,refunded_at timestamptz,revoked_at timestamptz,expires_at timestamptz,metadata jsonb,created_at timestamptz);
create table public.revenuecat_consumable_transaction_intents(provider text,original_transaction_id text,user_id uuid,product_id uuid,purchase_intent_id uuid,provider_event_id uuid,binding_state text,terminal boolean);
insert into auth.sessions values('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000000',null);
insert into auth.sessions values('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000000',null);
insert into public.watch_party_rooms values('PAIDTITLE','10000000-0000-4000-8000-000000000000',true,'open','title','open','private');
insert into public.watch_party_room_memberships values('PAIDTITLE','20000000-0000-4000-8000-000000000000','active',null,now());
insert into public.paid_watch_party_offers values('30000000-0000-4000-8000-000000000000','PAIDTITLE','10000000-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000000','active',now()-interval '1 hour',now()+interval '1 hour',now(),99,'usd');
insert into public.wave1_creator_eligibility values('10000000-0000-4000-8000-000000000000','VERIFIED','ACTIVE',true,true,true,'CLEAR','UNITED_STATES',true,true,true,true,true,true,true);
insert into public.monetization_products values('40000000-0000-4000-8000-000000000000','watch_party_live_ticket','fixture_product');
insert into public.provider_events values('50000000-0000-4000-8000-000000000000','fixture_event','revenuecat_app_store','40000000-0000-4000-8000-000000000000','20000000-0000-4000-8000-000000000000','sandbox','processed','{"purchase_intent_id":"60000000-0000-4000-8000-000000000000","provider_product_id":"fixture_sku","original_transaction_id":"fixture_transaction"}');
insert into public.money_purchase_intents values('60000000-0000-4000-8000-000000000000','20000000-0000-4000-8000-000000000000','40000000-0000-4000-8000-000000000000','fixture_product','watch_party_live_ticket','revenuecat_app_store','fixture_sku','watch_party_live','30000000-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000000','sandbox','consumed',now(),null,99,'usd');
insert into public.access_grants values('70000000-0000-4000-8000-000000000000','20000000-0000-4000-8000-000000000000','30000000-0000-4000-8000-000000000000','40000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000000','revenuecat_app_store','sandbox','watch_party_live_ticket','provider_event','active',now()-interval '1 hour',now()+interval '1 hour',null,null,'{"purchase_intent_id":"60000000-0000-4000-8000-000000000000","original_transaction_id":"fixture_transaction","viewer_access_only":true}',now());
insert into public.paid_watch_party_tickets values('80000000-0000-4000-8000-000000000000','70000000-0000-4000-8000-000000000000','30000000-0000-4000-8000-000000000000','PAIDTITLE','20000000-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000000','revenuecat_app_store','fixture_event','active',null,null,now()+interval '1 hour','{"viewer_access_only":true}',now());
insert into public.revenuecat_consumable_transaction_intents values('revenuecat_app_store','fixture_transaction','20000000-0000-4000-8000-000000000000','40000000-0000-4000-8000-000000000000','60000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000000','exact',false);
`);
await db.exec(definition('20261014234628_live_stage_party_authority_repair.sql','watch_party_room_self_access_allowed_internal'));
await db.exec(definition('20260914060000_livekit_service_target_authority_recovery.sql','resolve_watch_party_livekit_authority_pre_live_rfgc'));
await db.exec(definition('20260901010000_watch_party_live_money_rfgc_closure.sql','resolve_watch_party_livekit_viewer_authority','resolve_watch_party_livekit_authority_pre_discovery_rfgc'));
await db.exec(definition('20260907163000_pre_activation_discovery_event_authority.sql','resolve_watch_party_livekit_viewer_authority','resolve_watch_party_livekit_pre_party_room'));
await db.exec(definition('20261011023525_party_room_audience_discovery.sql','party_room_viewer_source_allowed'));
await db.exec(definition('20261011023525_party_room_audience_discovery.sql','resolve_watch_party_livekit_viewer_authority'));
async function install(variant,definitions){
  await db.exec(definition('20261014234628_live_stage_party_authority_repair.sql','watch_party_room_self_access_allowed_internal'));
  await db.exec(definition('20261011023525_party_room_audience_discovery.sql','resolve_watch_party_livekit_viewer_authority'));
  for(const name of ['watch_party_room_access_pre_live_decouple','resolve_watch_party_livekit_authority_pre_service_fix']) await db.exec(variant==='candidate'?definition('candidate',name):definitions.find(x=>x.name===name).definition);
  if(variant==='candidate') for(const name of ['watch_party_room_self_access_allowed_internal','resolve_watch_party_livekit_viewer_authority']) await db.exec(definition('candidate',name));
}
async function evaluate(){
 return (await db.query(`select public.watch_party_room_self_access_allowed_internal('PAIDTITLE','20000000-0000-4000-8000-000000000000') room_access,public.resolve_watch_party_livekit_viewer_authority('PAIDTITLE','20000000-0000-4000-8000-000000000000','20000000-0000-4000-8000-000000000001') current_session,public.resolve_watch_party_livekit_viewer_authority('PAIDTITLE','20000000-0000-4000-8000-000000000000',null) service_target`)).rows[0];
}
return {db,definition,install,evaluate,candidateHash,variants:[['captured_actual',actual],['canonical_replacement',expected],['candidate',null]]};
}catch(error){await db.close();throw error;}
}
