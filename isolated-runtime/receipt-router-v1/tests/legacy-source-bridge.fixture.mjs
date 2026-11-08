// Minimal synthetic legacy projections. These are NOT a legacy bootstrap,
// provider fixture, production schema attestation, or positive authority proof.
import {randomUUID} from 'node:crypto';
export const BUYER='22222222-2222-4222-8222-222222222222';
export const OTHER='33333333-3333-4333-8333-333333333333';
export const CONN='11111111-1111-4111-8111-111111111111';
export const lit=value=>value===null?'null':"'"+String(value).replaceAll("'","''")+"'";
export const json=value=>lit(JSON.stringify(value))+'::jsonb';
export const legacySchema=`
create table public.provider_events(id uuid primary key,provider text,environment text,user_id uuid,event_type text,status text,
 raw_payload_hash text,provider_event_id text,product_id uuid,product_key text,metadata jsonb);
create table public.revenuecat_webhook_ingress_events(provider_event_id text primary key,raw_payload_hash text);
create table public.monetization_products(id uuid primary key,product_type text);
create table public.revenuecat_premium_transaction_authority(id uuid primary key,provider text,original_transaction_id text,
 user_id uuid,environment text,first_event_id text,first_event_hash text,status text,expires_at timestamptz);
create table public.money_purchase_intents(id uuid primary key,user_id uuid,product_id uuid,product_key text,product_type text,
 provider text,environment text,provider_product_id text,consumed_at timestamptz,status text,source_id text);
create table public.revenuecat_consumable_transaction_intents(provider text,original_transaction_id text,binding_state text,
 user_id uuid,product_id uuid,purchase_intent_id uuid,provider_event_id uuid);
create table public.access_grants(id uuid primary key,user_id uuid,product_id uuid,provider text,environment text,
 provider_event_id uuid,source_type text,source_id text,grant_type text,metadata jsonb,status text,expires_at timestamptz);
do $$declare t text;begin foreach t in array array['provider_events','revenuecat_webhook_ingress_events','monetization_products',
 'revenuecat_premium_transaction_authority','money_purchase_intents','revenuecat_consumable_transaction_intents','access_grants'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('alter table public.%I force row level security',t);end loop;end$$;
`;
export const clearLegacy=`truncate public.provider_events,public.revenuecat_webhook_ingress_events,public.monetization_products,
 public.revenuecat_premium_transaction_authority,public.money_purchase_intents,public.revenuecat_consumable_transaction_intents,public.access_grants;`;
export function source(options={}){
 const domain=options.domain??'legacy_premium',store=options.store??'APP_STORE';
 const v={id:randomUUID(),product:randomUUID(),authority:randomUUID(),intent:randomUUID(),grant:randomUUID(),scope:randomUUID(),
  source:'synthetic-content',domain,store,provider:store==='APP_STORE'?'revenuecat_app_store':'revenuecat_google_play',
  environment:'sandbox',subject:BUYER,eventId:randomUUID(),original:randomUUID(),transaction:randomUUID(),
  sku:domain==='legacy_premium'?'fixture-premium':'fixture-tip',productType:domain==='legacy_premium'?'premium_subscription':'creator_tip',
  eventType:domain==='legacy_premium'?'INITIAL_PURCHASE':'NON_RENEWING_PURCHASE',...options};
 v.metadata={original_transaction_id:v.original,provider_product_id:v.sku,...(v.domain==='legacy_premium'
  ?{premium_transaction_binding_id:v.authority,entitlement_key:'premium'}:{purchase_intent_id:v.intent,access_grant_id:v.grant})};
 return v;
}
export function sourceEvent(v){return {id:v.eventId,type:v.eventType,app_id:'fixture-app',store:v.store,
 environment:v.environment.toUpperCase(),event_timestamp_ms:1794052800000,app_user_id:v.subject,original_app_user_id:v.subject,
 aliases:[],product_id:v.sku,original_transaction_id:v.original,transaction_id:v.transaction};}
export function sourceRows(v,hash){
 const a=[`insert into public.provider_events values(${[v.id,v.provider,v.environment,v.subject,v.eventType,'processed',hash,v.eventId,v.product,v.sku].map(lit).join(',')},${json(v.metadata)});`,
  `insert into public.revenuecat_webhook_ingress_events values(${lit(v.eventId)},${lit(hash)});`,
  `insert into public.monetization_products values(${lit(v.product)},${lit(v.productType)});`];
 if(v.domain==='legacy_premium')a.push(`insert into public.revenuecat_premium_transaction_authority values(${[v.authority,v.provider,v.original,v.subject,v.environment,v.eventId,hash,'active'].map(lit).join(',')},clock_timestamp()+interval '1 day');`);
 else{
  a.push(`insert into public.money_purchase_intents values(${[v.intent,v.subject,v.product,v.sku,v.productType,v.provider,v.environment,v.sku].map(lit).join(',')},clock_timestamp(),'consumed',${lit(v.source)});`);
  a.push(`insert into public.revenuecat_consumable_transaction_intents values(${[v.provider,v.original,'exact',v.subject,v.product,v.intent,v.id].map(lit).join(',')});`);
  const grantMetadata={purchase_intent_id:v.intent,original_transaction_id:v.original,provider_product_id:v.sku,product_key:v.sku};
  a.push(`insert into public.access_grants values(${[v.grant,v.subject,v.product,v.provider,v.environment,v.id,'provider_event',v.source,v.productType==='creator_tip'?'creator_tip_record':v.productType].map(lit).join(',')},${json(grantMetadata)},'active',null);`);
 }
 return a.join('\n');
}
