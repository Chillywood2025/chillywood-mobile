import fs from 'node:fs';
import {canonicalArrayTextSQL} from '../google-refund-canonical-array.mjs';
import {loadBundle,DATA_TABLES,dataHashSQL,probeSql,holdsSQL} from '../google-refund-tax-observer-exact-deploy.mjs';
const b=loadBundle(new URL('../../',import.meta.url).pathname);
const cashout=JSON.parse(fs.readFileSync(new URL('../sandbox-cashout-deployment-manifest.json',import.meta.url),'utf8'));
const lit=s=>`'${String(s).replaceAll("'","''")}'`;
const h=s=>`encode(sha256(convert_to(${s},'UTF8')),'hex')`;
export const DATA_ANCHORS=Object.freeze({guarded:cashout.qualification.baseline.guardedDataSha256,
 inverse:b.manifest.prePredecessorObservation.presentGuardedDataSha256});
export const EXPECTED_RECEIPTS=Object.freeze([...b.predecessors,...b.social].map(({version,name,statementsSha256})=>({version,name,statementsSha256})).sort((a,b)=>a.version.localeCompare(b.version)));
const guarded=['private.creator_clip_export_worker','private.deleted_content_retention_settings','private.discovery_invalidation_worker_config','public.creator_tip_settings','public.monetization_product_store_mappings','public.monetization_products','public.platform_money_kill_switches'];
const digest=(tables,c=false)=>`(select ${h(canonicalArrayTextSQL('item',`item::text${c?' collate "C"':''}`))} from (${tables.map(t=>`select jsonb_build_array(${lit(t)},to_jsonb(t)) item from ${t} t`).join(' union all ')}) d)`;
export const dataEvidenceExpression=`jsonb_build_object('guardedHash',${digest(guarded,true)},'inverseHash',${digest(DATA_TABLES.filter(t=>t!=='private.sandbox_cashout_control'))},
 'seedExact',(select count(*)=1 and bool_and(to_jsonb(t)='{"singleton":true,"enabled":false}'::jsonb) from private.sandbox_cashout_control t),'fullHash',${dataHashSQL},'holds',coalesce((${holdsSQL}),false))`;
const probe=probeSql();
export const historyEvidenceExpression=probe.slice(probe.indexOf('select ')+7,probe.lastIndexOf(' state;'));
export const fullHistoryHash=`(select ${h(canonicalArrayTextSQL('jsonb_build_array(version,name,statements)','version'))} from supabase_migrations.schema_migrations)`;
export const dataPredicate=`data_evidence->>'guardedHash'=${lit(DATA_ANCHORS.guarded)} and data_evidence->>'inverseHash'=${lit(DATA_ANCHORS.inverse)} and data_evidence->'seedExact'='true'::jsonb and data_evidence->'holds'='true'::jsonb`;
export const historyPredicate=`history_evidence->>'database'='postgres' and history_evidence->>'originalHistorySha256'=${lit(b.manifest.originalHistory.sha256)}
 and history_evidence->'historyCount'='589'::jsonb and history_evidence->>'historyMaximum'='20261107191000'
 and history_evidence->'targets'=${lit(JSON.stringify(EXPECTED_RECEIPTS))}::jsonb
 and history_evidence->'addedAbsent'='true'::jsonb and history_evidence->>'socialCatalogSha256'=${lit(b.manifest.socialCatalogSha256)}`;
export function classifySyntheticProof({catalog,data,history}){
 return catalog===true&&data?.guardedHash===DATA_ANCHORS.guarded&&data?.inverseHash===DATA_ANCHORS.inverse&&data?.seedExact===true&&data?.holds===true
 &&history?.database==='postgres'&&history?.originalHistorySha256===b.manifest.originalHistory.sha256&&history?.historyCount===589&&history?.historyMaximum==='20261107191000'
 &&history?.addedAbsent===true&&history?.socialCatalogSha256===b.manifest.socialCatalogSha256&&JSON.stringify(history?.targets)===JSON.stringify(EXPECTED_RECEIPTS);
}
