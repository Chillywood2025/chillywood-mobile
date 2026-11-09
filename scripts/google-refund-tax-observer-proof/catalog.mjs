import {sql as inverse} from './inverse.mjs';
// Catalog-only evidence derivation. No target connection, data qualification or
// deployment; expected digest is released only behind authenticated provenance.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {invariantsHashSQL} from '../google-refund-tax-observer-exact-deploy.mjs';
const out=new URL('./',import.meta.url).pathname,root=new URL('../../',import.meta.url).pathname;
const lit=s=>`'${s.replaceAll("'","''")}'`;
const delta=JSON.parse(fs.readFileSync(path.join(out,'inverse-catalog-delta.json'),'utf8'));
assert.equal(delta.nativeProvenance.serverVersion,'170006');assert.equal(delta.delta.length,37);
assert.equal(delta.sourceSelfCheck.faults,0);
const nativeTypes=JSON.parse(fs.readFileSync(path.join(out,'refund-native-types.json'),'utf8'));
const managed=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/database-managed-schema-20261015.json'),'utf8'));
// Source-known managed Auth names are absent from the local managed doubles.
// Require them to be PostgreSQL enums, which cannot carry collation. Unknown
// custom domains/base types do not receive this exception.
const managedNames=[...new Set(managed.map(c=>c.type).filter(t=>t.startsWith('auth.')))];
const expected=[...nativeTypes,...managedNames.map(formatted_type=>({formatted_type,typtype:'e',type_collation:'-'}))];
assert.equal(new Set(expected.map(x=>x.formatted_type)).size,expected.length);
assert.equal(expected.length,47);
const expectedTypeLiteral=lit(JSON.stringify(expected));
const cut=inverse.lastIndexOf("\nselect jsonb_build_object('database'");assert.ok(cut>0);
const prefix=inverse.slice(0,cut);
const old=JSON.parse(fs.readFileSync(path.join(root,'ops/automatic-commerce-cutover/contract.json'),'utf8')).catalog;
const conditions=`current_database()='postgres'
 and current_user='supabase_read_only_user' and session_user='supabase_read_only_user'
 and current_setting('transaction_read_only')='on' and current_setting('server_version_num')='170006'
 and not exists(select 1 from faults)
 and affected=${lit(old.originalSha256)} and untouched=${lit(old.untouchedSha256)}
 and not exists(select 1 from type_faults)
 and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth') and c.relkind='f')`;
const sql=prefix+`,
 expected_types as materialized (select value->>'formatted_type' formatted_type,value->>'typtype' typtype,value->>'type_collation' type_collation from jsonb_array_elements(${expectedTypeLiteral}::jsonb)),
 type_faults as materialized (select n.nspname||'.'||c.relname||'.'||a.attname key from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace join pg_type t on t.oid=a.atttypid
 left join expected_types e on e.formatted_type=format_type(a.atttypid,a.atttypmod)
 where n.nspname in ('public','private','auth') and c.relkind in ('r','p','v','m','S','f') and a.attnum>0 and not a.attisdropped
 and (e.formatted_type is null or e.typtype is distinct from t.typtype::text or e.type_collation is distinct from t.typcollation::regcollation::text or a.attcollation is distinct from t.typcollation)),
 proof as materialized (select *,(${conditions}) verified from hashes)
 select jsonb_build_object('protocol','refund589-catalog-authenticated-projection-v1','catalogDerivationQualified',verified,
 'expectedCatalogSha256',case when verified then ${invariantsHashSQL} else null end,
 'frozenAffectedMatches',affected=${lit(old.originalSha256)},'frozenUntouchedMatches',untouched=${lit(old.untouchedSha256)},
 'deltaFaults',coalesce((select jsonb_agg(jsonb_build_object('key',key,'reason',reason) order by key) from faults),'[]'::jsonb),
 'typeFaults',coalesce((select jsonb_agg(key order by key) from type_faults),'[]'::jsonb),
 'foreignRelationCount',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth') and c.relkind='f'),
 'dataQualified',false,'historyQualified',false,'edgeQualified',false,'deploymentQualified',false) evidence from proof;
 rollback;\n`;

export {sql};
