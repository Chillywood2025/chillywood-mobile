import fs from 'node:fs';
import {canonicalArrayTextSQL} from '../google-refund-canonical-array.mjs';
import {BRIDGE_FUNCTION,BRIDGE_TRIGGER} from '../../ops/automatic-commerce-cutover/bridge.mjs';
import {catalogRowsSQL} from '../../ops/automatic-commerce-cutover/catalog.mjs';
import {verifyInputs} from './verify-inputs.mjs';
verifyInputs();
const root=new URL('../../',import.meta.url);
const contract=JSON.parse(fs.readFileSync(new URL('ops/automatic-commerce-cutover/contract.json',root),'utf8'));
const {delta}=JSON.parse(fs.readFileSync(new URL('./inverse-catalog-delta.json',import.meta.url),'utf8'));
const literal=s=>`'${s.replaceAll("'","''")}'`;
const temporaryKeys=[`function:${BRIDGE_FUNCTION}`,...contract.authorityRelations.map(t=>`trigger:${t}.${BRIDGE_TRIGGER}`)];
const ignoredKeys=[...contract.catalog.affectedKeys,...temporaryKeys];
 const common=`with observed as materialized (${catalogRowsSQL}),
 delta as materialized (select value->>'key' key,(value->>'beforeText')::jsonb before_item,(value->>'afterText')::jsonb after_item from jsonb_array_elements(${literal(JSON.stringify(delta))}::jsonb)),
 faults as materialized (select d.key,case when d.after_item is null then 'unexpected_removed_key_present' else 'post_delta_bytes_mismatch_or_missing' end reason from delta d left join observed o on o.key=d.key where (d.after_item is null and o.key is not null) or (d.after_item is not null and o.item is distinct from d.after_item)
 union all select key,'duplicate_observed_key' from observed group by key having count(*)<>1
 union all select key,'unexpected_cutover_bridge_object' from observed where key=any(array[${temporaryKeys.map(literal).join(',')}]::text[])),
 inverted as materialized (select key,item from observed where key not in(select key from delta) union all select key,before_item from delta where before_item is not null),
 hashes as materialized (select
 encode(sha256(convert_to(${canonicalArrayTextSQL('jsonb_build_array(key,item)','key collate "C",item::text collate "C"',` filter(where key=any(array[${contract.catalog.affectedKeys.map(literal).join(',')}]::text[]))`)},'UTF8')),'hex') affected,
 encode(sha256(convert_to(${canonicalArrayTextSQL('jsonb_build_array(key,item)','key collate "C",item::text collate "C"',` filter(where not(key=any(array[${ignoredKeys.map(literal).join(',')}]::text[])))`)},'UTF8')),'hex') untouched from inverted)`;
 const sql=`begin read only; set local search_path=pg_catalog,public; set local time zone 'UTC'; set local standard_conforming_strings=on; set local statement_timeout='30s';\n${common}\nselect jsonb_build_object('database',current_database(),'readContextVerified',current_user='supabase_read_only_user' and session_user='supabase_read_only_user' and current_setting('transaction_read_only')='on','sourceDeltaValidated',not exists(select 1 from faults),'faults',coalesce((select jsonb_agg(jsonb_build_object('key',key,'reason',reason) order by key) from faults),'[]'::jsonb),'affectedSha256',affected,'untouchedSha256',untouched,'frozenAffectedMatches',affected=${literal(contract.catalog.originalSha256)},'frozenUntouchedMatches',untouched=${literal(contract.catalog.untouchedSha256)},'bothFrozenAnchorsProven',not exists(select 1 from faults) and affected=${literal(contract.catalog.originalSha256)} and untouched=${literal(contract.catalog.untouchedSha256)},'refundBaselineQualified',false,'uncoveredFields',jsonb_build_array('column.attcollation','foreign relations and dependent columns/indexes/triggers/policies')) evidence from hashes; rollback;\n`;

export {sql};
