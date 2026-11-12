import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createDatabase,splitSQL} from '../tests/helpers/database-runtime-authority-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
export const migrationName='20261112041003_automatic_eligibility_current_topology.sql';
export const sources=Object.freeze([
 ['20261106001341_automatic_premium_commerce_admission.sql','81eb76a61a508e3b7db36bf13eca0ba9fed01bd2948fb0db638688f6f385f908'],
 ['20261106001353_automatic_creator_eligibility_refresh.sql','cd1b548003e21a48229ce996c91ec9d2bbab52a9640ea2a54f3a7e04da330f67'],
 ['20261106001355_creator_declaration_retention_accounting.sql','548a83678a625fe35bd2f3cfe7138e28edf92a54385b4966c80dd29deab65d53'],
 ['20261106001357_creator_provider_observation_queue.sql','ce0cda2ecf61e2fb9aedec8222c528f3ce2c9aadc7c77247499da88119af4cda'],
 ['20261106002410_automatic_commerce_lock_order.sql','a354f1cc7a9d92575714a6cc631022a9bc1715b3f294d80a0b02e3d814e0c760'],
 ['20261106005532_isolated_sandbox_creator_capability.sql','3031564096a8dfcf96725810cb9646d485a331c9e761d0c8ff7006c92b53736d'],
 ['20261106005534_automatic_sandbox_tip_auction_authority.sql','e567edcbc5cb8ea2fe306b3f0255a430256bc6c7778e7bb7f3299016acd9c771'],
 ['20261106013158_ordinary_native_dispatch_authority.sql','f620bdb7b0f46aecb33601f08b499c6137ac2369c960c053d439f5fe3eee1155'],
 ['20261106013309_sandbox_paid_access_mode_authority.sql','7b8a2943f02bd3b423286773b42e70c547aece2cacdffe047c459957adb72eba'],
 ['20261106020217_preserve_purchased_access_delivery.sql','21246ca8f3b7ed447f6bd42b4234afb44fedbca0e19a1eacf2dcc840870946c4'],
 ['20261106035132_reviewed_merch_publication_mode.sql','b0947542e7f6ee7995fb9936fbe478e1dcea1f34468561e2bd99b92650d73d81'],
 ['20261106073240_ordinary_commerce_canonical_lock_prefix.sql','f6ab407138b787702ebe18573a9ddd0fb888b2d644b76091ed8467a793b64ad0'],
 ['20261106170725_tip_commerce_gate_entry.sql','cf5bd9c7014e9812af03b737f3e87b892862bb76b5ac2ec079bdbc08f6468d28'],
]);
export const digest=value=>createHash('sha256').update(value).digest('hex');
const head=sql=>sql.replace(/--[^\n]*/gu,'').replace(/\/\*[\s\S]*?\*\//gu,'').trim();
function once(source,from,to){assert.equal(source.split(from).length,2,'exact source adaptation anchor');return source.replace(from,to);}

// Four definition-lookup locations only. Calls still use the current public
// wrappers. The canonical root-gate list deliberately is NOT retargeted.
export function adaptedSource(file,source){
 if(file.startsWith('20261106005532')){
  source=once(source,"pg_get_functiondef('public.begin_creator_money_checkout'::regproc)","pg_get_functiondef('public.begin_creator_money_checkout_before_native'::regproc)");
  source=once(source,"pg_get_functiondef('public.creator_video_paid_precharge_authority_internal'::regproc)","pg_get_functiondef('public.creator_video_paid_precharge_before_production_admission'::regproc)");
 }
 if(file.startsWith('20261106005534'))source=once(source,"pg_get_functiondef('public.begin_creator_money_checkout(uuid,uuid)'::regprocedure)","pg_get_functiondef('public.begin_creator_money_checkout_before_native(uuid,uuid)'::regprocedure)");
 if(file.startsWith('20261106013158'))source=once(source,"array['public.begin_creator_money_checkout(uuid,uuid)','public.begin_creator_event_checkout(uuid,uuid)']","array['public.begin_creator_money_checkout_before_native(uuid,uuid)','public.begin_creator_event_checkout(uuid,uuid)']");
 return splitSQL(source).filter(sql=>head(sql)&&! /^(begin|commit|rollback)\s*;?$/iu.test(head(sql))).join('\n');
}
export function sourcePayloads(){return sources.map(([file,sha256])=>{
 const bytes=fs.readFileSync(path.join(root,'supabase/migrations',file));
 assert.equal(digest(bytes),sha256,`immutable historical source ${file}`);
 return {file,sha256,sql:adaptedSource(file,bytes.toString('utf8'))};
});}

export async function captureFunctions(db){return (await db.query(`select
 format('%I.%I(%s)',n.nspname,p.proname,oidvectortypes(p.proargtypes)) signature,
 encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') body_sha256,
 p.prosecdef security_definer,p.provolatile volatility,p.proconfig configuration
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') order by 1`)).rows;}
async function captureTriggers(db){return (await db.query(`select format('%I.%I',n.nspname,c.relname) relation,t.tgname name,
 encode(sha256(convert_to(pg_get_triggerdef(t.oid),'UTF8')),'hex') definition_sha256,t.tgenabled enabled
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where not t.tgisinternal order by 1,2`)).rows;}

// SOURCE-ONLY fixture derivation. Never reads a deployed database or accepts a
// connection string. Both databases replay the repository's actual migrations.
export async function captureTopology(){
 const payloads=sourcePayloads();
 const target=await createDatabase({implicitApiGrants:false,excludeMigrations:[migrationName,...sources.map(([file])=>file)]});
 let before,after,requiredTriggers;
 try{
  before=await captureFunctions(target.db);
  const oldTriggers=new Set((await captureTriggers(target.db)).map(row=>`${row.relation}.${row.name}`));
  await target.db.exec('begin');
  for(const {sql} of payloads)await target.db.exec(sql);
  after=await captureFunctions(target.db);
  requiredTriggers=(await captureTriggers(target.db)).filter(row=>!oldTriggers.has(`${row.relation}.${row.name}`));
  await target.db.exec('rollback');
 }finally{await target.db.close();}
 const original=new Map(before.map(row=>[row.signature,row]));
 const changed=after.filter(row=>JSON.stringify(original.get(row.signature))!==JSON.stringify(row));
 const existing=[...new Map([
  ...changed.filter(row=>original.has(row.signature)).map(row=>original.get(row.signature)),
  ...before.filter(row=>commonGateSignatures.includes(row.signature)),
 ].map(row=>[row.signature,row])).values()].sort((a,b)=>a.signature.localeCompare(b.signature));
 const introduced=changed.filter(row=>!original.has(row.signature));
 const canonical=await createDatabase({implicitApiGrants:false,excludeMigrations:[migrationName]});
 try{
  const complete=new Map((await captureFunctions(canonical.db)).map(row=>[row.signature,row]));
  const signatures=[...new Set([...changed.map(row=>row.signature),...commonGateSignatures,
   ...complete.keys()].filter(signature=>changed.some(row=>row.signature===signature)
    || commonGateSignatures.includes(signature)||signature.startsWith('public.')&&signature.includes('native_production')))].sort();
  return {protocol:'source-replayed-automatic-topology-v1',sources:sources.map(([file,sha256])=>({file,sha256})),
   missing:existing,introduced:introduced.map(row=>row.signature),requiredTriggers,
   canonical:signatures.map(signature=>{assert.ok(complete.has(signature),signature);return complete.get(signature);}),
   completed:after.filter(row=>signatures.includes(row.signature))};
 }finally{await canonical.db.close();}
}

// Exact mutation roots, separately reviewed from retained semantic patches.
// Direct-delegation and pure read-only wrappers are deliberately not included.
export const commonGateSignatures=Object.freeze([
 'public.prepare_native_production_paid_video(uuid, text, text, text, integer)',
 'public.create_native_production_paid_video_intent(uuid, text)',
 'public.claim_native_production_paid_video_checkout(uuid, uuid, text)',
 'public.begin_creator_money_checkout(uuid, uuid)',
 'public.record_native_production_checkout_preflight(uuid, uuid, uuid, text, text, bigint, text)',
 'public.accept_native_production_paid_video_receipt(uuid, text, text)',
 'public.resolve_native_production_witness_context(uuid, uuid, uuid, boolean)',
 'public.accept_native_production_witness_enrollment(uuid, uuid, uuid, text, text, text)',
 'public.accept_native_production_verified_witness(uuid, uuid, uuid, text, text, text, bigint, bigint, uuid, bigint)',
 'public.accept_native_production_launch_ready(uuid, uuid, uuid, text, uuid, text, bigint, bigint)',
 'public.accept_native_production_verified_store_facts(uuid, text, text)',
 'public.reconcile_native_production_paid_video_access(uuid)',
 'public.reconcile_native_production_dispatch(uuid, uuid, uuid)',
 'public.process_revenuecat_app_store_event_atomic(text, text, uuid, text, text, timestamp with time zone, timestamp with time zone, integer, text, text, text, text, timestamp with time zone)',
 'public.process_revenuecat_google_play_event_atomic(text, text, uuid, text, text, timestamp with time zone, timestamp with time zone, integer, text, text, text, text, timestamp with time zone)',
 'public.process_revenuecat_terminal_event_atomic(text, text, text, uuid, text, text, text, text, timestamp with time zone, timestamp with time zone, timestamp with time zone, text, text, text, text, text)',
]);

export function buildForwardSQL(topology){
 assert.equal(topology.protocol,'source-replayed-automatic-topology-v1');
 assert.deepEqual(topology.sources,sources.map(([file,sha256])=>({file,sha256})));
 assert.ok(commonGateSignatures.length,'entry-root review must be complete before generating migration');
 const literal=value=>`'${value.replaceAll("'","''")}'`;
 const missing=JSON.stringify(topology.missing),canonical=JSON.stringify(topology.canonical);
 const introduced=JSON.stringify(topology.introduced);
 const payload=sourcePayloads().map(({file,sha256,sql},index)=>{
  const tag=`$automatic_source_${index}$`;assert.ok(!sql.includes(tag));
  return `-- Source ${file}; SHA256 ${sha256}\nexecute ${tag}\n${sql}\n${tag};`;
 }).join('\n');
 return `-- Generated by scripts/automatic-eligibility-forward.mjs from immutable source.
-- No historical receipt is inserted; only this forward migration is new.
begin;
do $automatic_forward$
declare
 missing jsonb:=${literal(missing)}::jsonb;
 canonical jsonb:=${literal(canonical)}::jsonb;
 introduced jsonb:=${literal(introduced)}::jsonb;
 expected jsonb; p pg_proc; absent integer; t pg_trigger; relation_name text; role_name text;
 definition text; signature text; marker text:='begin'||chr(10); gate text:=' perform private.lock_ordinary_commerce_authority_gate();'||chr(10);
begin
 select count(*) into absent from jsonb_array_elements_text(introduced) s where to_regprocedure(s.value) is null;
 if absent=jsonb_array_length(introduced) then
  for expected in select value from jsonb_array_elements(missing) loop
   select * into p from pg_proc where oid=to_regprocedure(expected->>'signature');
   if p.oid is null or encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') is distinct from expected->>'body_sha256'
    or p.prosecdef is distinct from (expected->>'security_definer')::boolean
    or p.provolatile::text is distinct from expected->>'volatility'
    or to_jsonb(p.proconfig) is distinct from nullif(expected->'configuration','null'::jsonb)
   then raise exception 'automatic_forward_predecessor_changed: %',expected->>'signature'; end if;
  end loop;
  if to_regclass('private.creator_eligibility_declarations') is not null
   or to_regclass('private.creator_provider_observation_control') is not null
   or to_regclass('private.creator_provider_observation_jobs') is not null
  then raise exception 'automatic_forward_partial_tables'; end if;
${payload}
 elsif absent=0 then
  for expected in select value from jsonb_array_elements(canonical) loop
   select * into p from pg_proc where oid=to_regprocedure(expected->>'signature');
   if p.oid is null or encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') is distinct from expected->>'body_sha256'
    or p.prosecdef is distinct from (expected->>'security_definer')::boolean
    or p.provolatile::text is distinct from expected->>'volatility'
    or to_jsonb(p.proconfig) is distinct from nullif(expected->'configuration','null'::jsonb)
   then raise exception 'automatic_forward_canonical_changed: %',expected->>'signature'; end if;
  end loop;
 else raise exception 'automatic_forward_partial_ancestry'; end if;
 if (select count(*) from private.creator_provider_observation_control)<>1
  or not exists(select 1 from private.creator_provider_observation_control where id and not enabled and last_claimed_at is null)
  or exists(select 1 from private.creator_provider_observation_jobs)
 then raise exception 'automatic_forward_observation_not_dormant'; end if;
 for expected in select value from jsonb_array_elements(${literal(JSON.stringify(topology.requiredTriggers))}::jsonb) loop
  select * into t from pg_trigger where tgrelid=to_regclass(expected->>'relation') and tgname=expected->>'name' and not tgisinternal;
  if t.oid is null or t.tgenabled::text is distinct from expected->>'enabled'
   or encode(sha256(convert_to(pg_get_triggerdef(t.oid),'UTF8')),'hex') is distinct from expected->>'definition_sha256'
  then raise exception 'automatic_forward_trigger_changed: %.%',expected->>'relation',expected->>'name'; end if;
 end loop;
 foreach relation_name in array array['private.creator_eligibility_declarations','private.creator_provider_observation_control','private.creator_provider_observation_jobs'] loop
  if not exists(select 1 from pg_class where oid=to_regclass(relation_name) and relrowsecurity and relforcerowsecurity)
  then raise exception 'automatic_forward_private_table_guard_changed: %',relation_name; end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(role_name,relation_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   then raise exception 'automatic_forward_raw_api_grant: %',relation_name; end if;
  end loop;
 end loop;

 foreach signature in array array[${commonGateSignatures.map(literal).join(',')}] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position(marker in definition)=0 then raise exception 'automatic_forward_root_anchor_missing: %',signature; end if;
  if position(marker||gate in definition)=0 then
   execute overlay(definition placing marker||gate from position(marker in definition) for length(marker));
  end if;
 end loop;
end $automatic_forward$;
commit;
`;
}
