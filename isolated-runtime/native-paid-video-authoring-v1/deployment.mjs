// OFFLINE PREPARATION ONLY. No network, target SQL executor or deployment API.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {sha,quote,extraCatalogSQL,extraACLItemsSQL,scope} from '../native-store-play-handoff-v1/deployment-catalog-support.mjs';
export const HERE=path.dirname(fileURLToPath(import.meta.url));
export const ROOT=path.resolve(HERE,'../..');
export const SOURCE='cac579c2161874a739ecb21e1ed090f181d83a37';
export const TREE='7fcd0b4820056b5b259753b5ac20a3cdc09660e8';
export const PROJECT='bmkkhihfbmsnnmcqkoly';
export const BASE_DIGEST='e07d2e3266789b1d5e5c9665e03245f6edf1abb43643e16b06d718ef4c77e33d';
const readJSON=name=>JSON.parse(fs.readFileSync(path.join(HERE,name),'utf8'));
export const allowlist=readJSON('deployment-allowlist.json');
export const manifest=readJSON('deployment-source.json');
export const IDENTITY=Object.freeze({version:'20261110060000',name:'native_paid_video_authoring_operations_v1'});
export const roleSafetySQL=`(select count(*)=1 and bool_and(not rolsuper) from pg_roles where rolname='postgres')
 and (select count(*)=2 and bool_and(not rolsuper and not rolcanlogin and not rolcreaterole and not rolcreatedb and not rolreplication and not rolbypassrls and not rolinherit) from pg_roles where rolname in('sbx_v1_core_owner','native_store_sandbox_v1_owner'))
 and (select count(*)=1 and bool_and(not rolsuper and not rolcreaterole and not rolcreatedb and not rolreplication) from pg_roles where rolname='supabase_read_only_user')`;
const json=x=>quote(JSON.stringify(x))+'::jsonb';
const hash=sql=>`encode(sha256(convert_to(${sql},'UTF8')),'hex')`;
// Complete-inventory ceilings measured against the actual hosted catalog and
// the full legacy+native fixture. The extra row is a rejection sentinel, never
// an accepted truncated inventory. History row and money bounds are unchanged.
export const catalogCapacity=Object.freeze({rawRows:60000,oidRows:35000});
// Existing migration history includes 395- and 619-statement receipts. Preserve
// those exact arrays, with finite per-receipt and aggregate output bounds.
export const historyCapacity=Object.freeze({statementsPerReceipt:1024,totalStatements:20000});
// Hash individual rows before aggregation. The largest outer digest contains
// at most 60,001 fixed-width SHA values (3.84 MB), not full definitions. Sorts
// retain the existing 4 MB work memory and may spill; deadlines are unchanged.
const aggregate=`coalesce(string_agg(${hash('item::text')},'' order by item::text collate "C"),'')`;
const digest=(sql,ceiling=25000)=>`(select ${hash(aggregate)} from (${sql} limit ${ceiling+1}) h(item))`;
const {catalogItemsSQL:baseCatalogItemsSQL}=await import(pathToFileURL(path.join(ROOT,'scripts/native-store-install-prepare.mjs')));
const catalogItemsSQL=baseCatalogItemsSQL.replaceAll("('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1')",scope);
const {aclItemsSQL}=await import(pathToFileURL(path.join(ROOT,'isolated-runtime/native-store-sandbox-v1/install-delta.mjs')));
const {nativePrivateStateTables}=await import(pathToFileURL(path.join(ROOT,'isolated-runtime/native-store-sandbox-v1/private-state-readback.mjs')));
export function verifySource(){
 assert.equal(allowlist.added.length,manifest.addedCount);assert.equal(allowlist.changed.length,5);assert.equal(allowlist.removed.length,0);
 assert.equal(manifest.baseSourceDigest,BASE_DIGEST);assert.equal(manifest.source,SOURCE);assert.equal(manifest.tree,TREE);
 assert.equal(manifest.extensionDigest,sha(JSON.stringify(manifest.extensions)));
 assert.equal(manifest.portableDeltaSha256,sha(JSON.stringify(allowlist)));
 assert.ok(allowlist.changed.every(x=>x.oidMustBeRetained===true));
 assert.deepEqual(manifest.extensions.map(x=>x.path),[
  'isolated-runtime/native-paid-video-authoring-v1/deployment-grant.sql',
  'ops/isolated-paid-video-operations-v2/operations.sql','ops/isolated-paid-video-operations-v2/monotonic-removal.sql',
  'isolated-runtime/native-paid-video-authoring-v1/authoring.sql',
  'isolated-runtime/native-paid-video-authoring-v1/deployment-revoke.sql',
  'isolated-runtime/native-paid-video-authoring-v1/private-state.sql']);
 return manifest.extensions.map(file=>{
  const data=fs.readFileSync(path.join(ROOT,file.path));
  assert.equal(data.length,file.bytes);assert.equal(sha(data),file.sha256);
  return {...file,data};
 });
}
const additions=allowlist.added.map(x=>[JSON.parse(x.key),x.rowSha256]);
const changes=allowlist.changed.map(x=>[JSON.parse(x.key),x.beforeSha256,x.afterSha256]);
export const allowCTE=`allowed_added as materialized(select value->0 k,value->>1 h from jsonb_array_elements(${json(additions)})),
 allowed_changed as materialized(select value->0 k,value->>1 before_h,value->>2 after_h from jsonb_array_elements(${json(changes)}))`;
// Mirrors catalog-snapshot.normalizeRow, including ACL fallback for out-of-scope
// raw rows. Exact allowlist keys are JSONB arrays, never name-prefix selectors.
export const normalizedCTE=`${allowCTE},
 raw as materialized(${catalogItemsSQL} union all ${extraCatalogSQL.trim()} limit ${catalogCapacity.rawRows+1}),
 acls as materialized(select distinct k,v from (${aclItemsSQL} union all ${extraACLItemsSQL}) a),
 acl_keyed as materialized(select item r,case item->>0
 when 'function' then 'function:'||(item->>1)||'.'||(item->>2)||'('||(item->>3)||')'
 when 'relation' then 'relation:'||(item->>1)||'.'||(item->>2)
 when 'column' then 'column:'||(item->>1)||'.'||(item->>2)
 when 'schema' then 'schema:'||(item->>1)
 when 'type' then 'type:'||(item->>1)||'.'||(item->>2) end acl_k,
 case item->>0 when 'schema' then 3 when 'type' then 12 else 5 end acl_i from raw),
 acl_normalized as materialized(select case when a.v is null then r else jsonb_set(r,array[acl_i::text],a.v) end r from acl_keyed left join acls a on a.k=acl_k),
 normalized as materialized(select case when r->>0='trigger' and r->3='true'::jsonb then
 jsonb_set(jsonb_set(r,'{2}','"<internal>"'),'{9}',to_jsonb(regexp_replace(r->>9,'RI_ConstraintTrigger_[ac]_[0-9]+','RI_ConstraintTrigger_<internal>','g'))) else r end r from acl_normalized),
 measured as materialized(select r,${hash('r::text')} h,case r->>0
 when 'function' then jsonb_build_array(r->0,r->1,r->2,r->3)
 when 'constraint' then jsonb_build_array(r->0,r->1,r->2,r->3)
 when 'membership' then jsonb_build_array(r->0,r->1,r->2,r->3)
 when 'defaultAcl' then jsonb_build_array(r->0,r->1,r->2,r->3)
 when 'index' then jsonb_build_array(r->0,r->1,substring(r->>2 from '^CREATE (?:UNIQUE )?INDEX (.+?) ON '))
 when 'trigger' then case when r->3='true'::jsonb then jsonb_build_array(r->0,r->1,r->2,r->10,r->11,r->4,r->5) else jsonb_build_array(r->0,r->1,r->2) end
 when 'enum' then jsonb_build_array(r->0,r->1,r->2,r->4)
 when 'column' then jsonb_build_array(r->0,r->1,r->2)
 when 'columnMetadata' then jsonb_build_array(r->0,r->1,r->2)
 when 'policy' then jsonb_build_array(r->0,r->1,r->2)
 when 'type' then jsonb_build_array(r->0,r->1,r->2)
 when 'relation' then jsonb_build_array(r->0,r->1,r->2)
 else jsonb_build_array(r->0,r->1) end k from normalized)`;
const oidSQL=`select jsonb_build_array('function',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) k,p.oid::text v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ${scope} and p.prokind in('f','p')
 union all select case when c.relkind in('i','I') then jsonb_build_array('index',i.indrelid::regclass::text,c.relname) else jsonb_build_array('relation',n.nspname,c.relname) end,c.oid::text from pg_class c join pg_namespace n on n.oid=c.relnamespace left join pg_index i on i.indexrelid=c.oid where n.nspname in ${scope}
 union all select jsonb_build_array('constraint',n.nspname,co.conrelid::regclass::text,co.conname),co.oid::text from pg_constraint co join pg_namespace n on n.oid=co.connamespace where n.nspname in ${scope}
 union all select case when t.tgisinternal then jsonb_build_array('trigger',t.tgrelid::regclass::text,'<internal>',co.conrelid::regclass::text,co.conname,t.tgfoid::regprocedure::text,t.tgtype) else jsonb_build_array('trigger',t.tgrelid::regclass::text,t.tgname) end,t.oid::text from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace left join pg_constraint co on co.oid=t.tgconstraint where n.nspname in ${scope}
 union all select jsonb_build_array('type',n.nspname,t.typname),t.oid::text from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in ${scope}
 union all select jsonb_build_array('policy',p.polrelid::regclass::text,p.polname),p.oid::text from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${scope}
 union all select jsonb_build_array('schema',n.nspname),n.oid::text from pg_namespace n where n.nspname in ${scope}
 union all select jsonb_build_array('role',r.rolname),r.oid::text from pg_roles r
 union all select jsonb_build_array('membership',roleid::regrole::text,member::regrole::text,grantor::regrole::text),oid::text from pg_auth_members
 union all select jsonb_build_array('eventTrigger',evtname),oid::text from pg_event_trigger
 union all select jsonb_build_array('defaultAcl',defaclrole::regrole::text,coalesce(n.nspname,''),defaclobjtype),d.oid::text from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
 union all select jsonb_build_array('column',a.attrelid::regclass::text,a.attname),d.oid::text from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${scope}`;
const statementSafe=`case when cardinality(statements) between 1 and ${historyCapacity.statementsPerReceipt} and array_ndims(statements)=1 and array_lower(statements,1)=1 then (select coalesce(bool_and(s is not null and octet_length(s)<=8388608),false) and coalesce(sum(octet_length(s)),0)<=16777216 from unnest(statements) s) else false end`;
const rollbackSafe=`case when rollback is null then true when cardinality(rollback) between 0 and 256 and (cardinality(rollback)=0 or array_ndims(rollback)=1) then (select coalesce(bool_and(s is not null and octet_length(s)<=8388608),true) and coalesce(sum(octet_length(s)),0)<=16777216 from unnest(rollback) s) else false end`;
const metadataSafe=`octet_length(version)<=64 and (name is null or octet_length(name)<=4096) and(created_by is null or octet_length(created_by)<=4096) and(idempotency_key is null or octet_length(idempotency_key)<=4096)`;
export const historyCTE=`history as materialized(select version,name,created_by,idempotency_key,statements,rollback,${statementSafe} statement_safe,${rollbackSafe} rollback_safe,${metadataSafe} metadata_safe from (select version,name,created_by,idempotency_key,statements,rollback from supabase_migrations.schema_migrations order by version collate "C" limit 2501) bounded_history)`;
// Gate input rows BEFORE jsonb_agg evaluates per-statement output hashes. A CASE
// around the aggregate alone would not bound PostgreSQL's aggregate allocation.
const historyOutputWithinBounds=`(select count(*)<2501 and coalesce(sum(cardinality(statements)),0)<=${historyCapacity.totalStatements} from history)`;
const extraHistoryMetadata=`jsonb_build_array(created_by,idempotency_key,array_ndims(rollback),array_lower(rollback,1),cardinality(rollback),case when rollback_safe and rollback is not null then ${hash('array_to_json(rollback)::text')} else null end)`;
export const historyItems=`select case when metadata_safe then jsonb_build_array(version,name,${extraHistoryMetadata},array_ndims(statements),array_lower(statements,1),cardinality(statements),case when statement_safe then ${hash('array_to_json(statements)::text')} else null end) else null end from history`;
export const priorHistoryDigestSQL=version=>digest(historyItems+` where version<>${quote(version)}`);
export const historyBoundarySQL=`(select count(*)=1 and bool_and(c.relowner='postgres'::regrole and c.relkind='r' and c.relpersistence='p' and not c.relrowsecurity and not c.relforcerowsecurity) from pg_class c where c.oid='supabase_migrations.schema_migrations'::regclass)
 and not exists(select 1 from pg_trigger where tgrelid='supabase_migrations.schema_migrations'::regclass)
 and not exists(select 1 from pg_rewrite where ev_class='supabase_migrations.schema_migrations'::regclass)
 and not exists(select 1 from pg_attrdef where adrelid='supabase_migrations.schema_migrations'::regclass)
 and (select count(*)=6 and bool_and(not attisdropped and attidentity='' and attgenerated='' and case when attname in('statements','rollback') then atttypid='text[]'::regtype when attname in('version','name','created_by','idempotency_key') then atttypid='text'::regtype else false end) from pg_attribute where attrelid='supabase_migrations.schema_migrations'::regclass and attnum>0)
 and (select count(*)=2 and bool_and(convalidated) and count(*) filter(where pg_get_constraintdef(oid)='PRIMARY KEY (version)')=1 and count(*) filter(where pg_get_constraintdef(oid)='UNIQUE (idempotency_key)')=1 from pg_constraint where conrelid='supabase_migrations.schema_migrations'::regclass)`;
const moneyItems=`select jsonb_build_array(key,state) from public.platform_money_kill_switches`;
const baseVersion='20261109151349',baseName='native_store_sandbox_source_bound_48';
const baseArraySha='d5a54d9ea772952f72d3ccc53449a788d4a0dec51aafc116b4a1af0c71f01ff9';
// Every changed existing object retains its OID, including ACL-only changes.
const historyRow=`case when metadata_safe then jsonb_build_object('version',version,'name',name,'metadataSha256',case when rollback_safe then ${hash(extraHistoryMetadata+'::text')} else null end,'extraMetadataNull',created_by is null and idempotency_key is null and rollback is null,'statementsCount',cardinality(statements),'arrayDimensions',array_ndims(statements),'arrayLower',array_lower(statements,1),'statementArraySha256',case when statement_safe then ${hash('array_to_json(statements)::text')} else null end,'statementHashes',case when statement_safe then (select coalesce(jsonb_agg(${hash('s')} order by ord),'[]'::jsonb) from unnest(statements) with ordinality u(s,ord)) else null end) else null end`;
export function snapshotSelectSQL(){return `with ${normalizedCTE},oids as materialized(${oidSQL} limit ${catalogCapacity.oidRows+1}),${historyCTE}
 select jsonb_build_object(
 'protocol','authoring-forward-observation-v1','source',${quote(SOURCE)},'tree',${quote(TREE)},'extensionDigest',${quote(manifest.extensionDigest)},
 'context',jsonb_build_object('currentUser',current_user,'sessionUser',session_user,'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),'serverVersionNum',current_setting('server_version_num')),
 'capturedAt',clock_timestamp(),'snapshot',pg_current_snapshot()::text,'database',current_database(),'serverStartedAt',pg_postmaster_start_time(),
 'roleSafety',${roleSafetySQL},
 'historyBoundarySafe',${historyBoundarySQL},
 'withinBounds',(select count(*)<=${catalogCapacity.rawRows} from raw) and (select count(*)<=${catalogCapacity.oidRows} from oids) and (select count(*)<2501 and coalesce(bool_and(statement_safe and rollback_safe and metadata_safe),false) from history) and ${historyOutputWithinBounds} and (select count(*)<25001 from(select 1 from public.platform_money_kill_switches limit 25001) bounded_money),
 'catalogCount',(select count(*) from measured),'catalogSha256',${digest('select r from measured',catalogCapacity.rawRows)},
 'retainedCount',(select count(*) from measured m where not exists(select 1 from allowed_added a where a.k=m.k) and not exists(select 1 from allowed_changed c where c.k=m.k)),
 'retainedSha256',${digest('select r from measured m where not exists(select 1 from allowed_added a where a.k=m.k) and not exists(select 1 from allowed_changed c where c.k=m.k)',catalogCapacity.rawRows)},
 'retainedOidSha256',${digest(`select jsonb_build_array(o.k,o.v) from oids o where not exists(select 1 from allowed_added a where a.k=o.k)`,catalogCapacity.oidRows)},
 'allOidSha256',${digest('select jsonb_build_array(k,v) from oids',catalogCapacity.oidRows)},
 'duplicateKeys',(select count(*) from(select k from measured group by k having count(*)<>1) d),
 'ambiguousACLs',(select count(*) from(select k from acls group by k having count(*)<>1) a),
 'addedPresent',(select count(*) from measured m join allowed_added a using(k)),
 'beforeChangedExact',(select count(*)=5 and count(m.h)=5 and bool_and(m.h=c.before_h) from allowed_changed c left join measured m using(k)),
 'afterChangedExact',(select count(*)=5 and count(m.h)=5 and bool_and(m.h=c.after_h) from allowed_changed c left join measured m using(k)),
 'addedExact',(select count(*)=${allowlist.added.length} and count(m.h)=${allowlist.added.length} and bool_and(m.h=a.h) from allowed_added a left join measured m using(k)),
 'historyCount',(select count(*) from supabase_migrations.schema_migrations),'historyMaximum',(select max(version) from supabase_migrations.schema_migrations),
 'historySha256',${digest(historyItems)},
 'predecessorReceiptsExact',(select count(*)=2 and bool_and(name=case version when '20261110021153' then 'revenuecat_native_legacy_exclusion_v1' else 'native_store_play_handoff_settlement_v1' end and cardinality(statements)=1 and array_ndims(statements)=1 and array_lower(statements,1)=1 and case when statement_safe then ${hash('array_to_json(statements)::text')}=case version when '20261110021153' then 'db5be54c1757ea8a487d446715f344b11a486497b67c5198d511ed240167499b' else '34e9e2dc1569ea4ba1e0f4f746869071f959a24540a22d6e91130207e49ea771' end else false end) from history where version in('20261110021153','20261110021650')),
 'baseReceiptExact',(select count(*)=1 and bool_and(name=${quote(baseName)} and array_ndims(statements)=1 and array_lower(statements,1)=1 and cardinality(statements)=1 and case when statement_safe then ${hash('array_to_json(statements)::text')}=${quote(baseArraySha)} else false end) from history where version=${quote(baseVersion)}),
 'historyReceipts',(select coalesce(jsonb_agg(${historyRow} order by version collate "C"),'[]'::jsonb) from history where ${historyOutputWithinBounds}),
 'moneyControlsSha256',${digest(moneyItems)},
 'moneyHeld',(select count(*)=9 and bool_and(state=case when key in('live_money_enabled','payouts_enabled','cashout_enabled') then 'off' else 'sandbox_only' end) from public.platform_money_kill_switches where key in('live_money_enabled','payouts_enabled','cashout_enabled','stripe_connect_enabled','tips_enabled','creator_monetization_enabled','provider_webhooks_enabled','revenuecat_app_store_enabled','revenuecat_google_play_enabled')),
 'ownerPrivilegesRestored',not has_schema_privilege('sbx_v1_core_owner','public','CREATE') and not has_schema_privilege('native_store_sandbox_v1_owner','public','CREATE') and not exists(select 1 from pg_auth_members m where m.member='postgres'::regrole and m.roleid in('sbx_v1_core_owner'::regrole,'native_store_sandbox_v1_owner'::regrole) and(m.set_option or m.inherit_option)),
 'currentPrivateRuntimeState','UNQUALIFIED','retryAllowed',false,'deploymentAllowed',false,'activationAllowed',false) state`;}
export const readSettings=`set local search_path=pg_catalog,public;set local standard_conforming_strings=on;
 set local jit=off;set local work_mem='4MB';set local max_parallel_workers_per_gather=0;set local enable_hashagg=off;
 set local statement_timeout='20s';set local transaction_timeout='25s';set local lock_timeout='1s';set local idle_in_transaction_session_timeout='10s';`;
export function snapshotReadSQL(){return `-- Transport must independently bind project ${PROJECT}; this comment proves no target identity.
-- One genuine read-only RR snapshot. No DO, temp object, grant, SET ROLE, function
-- creation, security-definer runtime call, write CTE, or persistent helper.
begin isolation level repeatable read read only;
${readSettings}
${snapshotSelectSQL()};
rollback;\n`;}
const requireThat=(value,code)=>{if(!value)throw Error(code);};
export function validateObservation(v,{before=false}={}){
 requireThat(v?.protocol==='authoring-forward-observation-v1'&&v.source===SOURCE&&v.tree===TREE&&v.extensionDigest===manifest.extensionDigest,'observation_source_invalid');
 requireThat(v.context?.currentUser==='supabase_read_only_user'&&v.context.sessionUser==='supabase_read_only_user'&&v.context.readOnly==='on'&&v.context.isolation==='repeatable read'&&v.context.serverVersionNum==='170006','observation_context_invalid');
 requireThat(v.database==='postgres'&&Number.isFinite(Date.parse(v.serverStartedAt)),'observation_database_invalid');
 requireThat(v.historyBoundarySafe===true&&v.roleSafety===true&&v.withinBounds===true&&v.duplicateKeys===0&&v.ambiguousACLs===0&&v.baseReceiptExact===true&&v.predecessorReceiptsExact===true&&v.moneyHeld===true&&v.ownerPrivilegesRestored===true,'observation_controls_invalid');
 for(const name of ['catalogSha256','retainedSha256','retainedOidSha256','allOidSha256','historySha256','moneyControlsSha256'])requireThat(/^[a-f0-9]{64}$/u.test(v[name]??''),'observation_hash_invalid');
 requireThat(Number.isSafeInteger(v.historyCount)&&v.historyCount>0&&Array.isArray(v.historyReceipts)&&v.historyReceipts.length===v.historyCount,'observation_history_invalid');
 requireThat(v.historyCount<=2500&&new Set(v.historyReceipts.map(r=>r?.version)).size===v.historyCount&&v.historyReceipts.every(r=>/^\d{12}(?:\d{2})?$/u.test(r?.version??'')&&Number.isSafeInteger(r.statementsCount)&&r.statementsCount>=1&&r.statementsCount<=historyCapacity.statementsPerReceipt&&r.arrayDimensions===1&&r.arrayLower===1&&/^[a-f0-9]{64}$/u.test(r.statementArraySha256??'')&&/^[a-f0-9]{64}$/u.test(r.metadataSha256??'')&&typeof r.extraMetadataNull==='boolean'&&Array.isArray(r.statementHashes)&&r.statementHashes.length===r.statementsCount&&r.statementHashes.every(h=>/^[a-f0-9]{64}$/u.test(h)))&&v.historyReceipts.reduce((total,r)=>total+r.statementsCount,0)<=historyCapacity.totalStatements,'observation_receipt_invalid');
 requireThat(v.historyMaximum===[...v.historyReceipts.map(r=>r.version)].sort().at(-1),'observation_history_maximum_invalid');
 const base=v.historyReceipts.filter(r=>r.version===baseVersion);
 requireThat(base.length===1&&base[0].name===baseName&&base[0].statementArraySha256===baseArraySha,'observation_base_receipt_invalid');
 requireThat(/^\d{14}$/u.test(v.historyMaximum??'')&&Number.isSafeInteger(v.catalogCount)&&v.catalogCount>=0&&v.catalogCount<=catalogCapacity.rawRows&&Number.isSafeInteger(v.retainedCount)&&v.retainedCount>=0&&v.retainedCount<=v.catalogCount&&typeof v.snapshot==='string'&&Number.isFinite(Date.parse(v.capturedAt)),'observation_shape_invalid');
 if(before)requireThat(v.beforeChangedExact===true&&v.addedPresent===0&&v.addedExact===false,'before_catalog_not_exact');
 return v;
}
const hashFields=['database','serverStartedAt','roleSafety','historyBoundarySafe','withinBounds','catalogCount','catalogSha256','retainedCount','retainedSha256','retainedOidSha256','allOidSha256','historyCount','historyMaximum','historySha256','moneyControlsSha256','baseReceiptExact','predecessorReceiptsExact','moneyHeld','ownerPrivilegesRestored','duplicateKeys','ambiguousACLs','addedPresent','beforeChangedExact'];
const ownerGuard=`if has_schema_privilege('sbx_v1_core_owner','public','CREATE') or has_schema_privilege('native_store_sandbox_v1_owner','public','CREATE') or exists(select 1 from pg_auth_members m where m.member='postgres'::regrole and m.roleid in('sbx_v1_core_owner'::regrole,'native_store_sandbox_v1_owner'::regrole) and(m.set_option or m.inherit_option)) then raise exception 'authoring_owner_interval_leaked';end if;`;
const {playPrivateStateTables}=await import('../native-store-play-handoff-v1/private-state-readback.mjs');
const coreChecks=[
 ['native_store_play_handoff_control','not enabled'],
 ['lifecycle',"state='disabled'"],['native_store_quote_controls','not preparation_enabled'],
 ['paid_video_gateway_controls','not enabled and route_id is null and verifier_id is null and worker_id is null and qualification_sha256 is null'],
 ['test_store_controls','not ingress_enabled and not initiation_enabled and connection_id is null and connection_revision is null'],
 ['test_store_v2_controls','not ingress_enabled and not provisioning_enabled and not initiation_enabled and connection_id is null and connection_revision is null'],
 ['test_store_v3_controls','not ingress_enabled and not provisioning_enabled and not initiation_enabled and connection_id is null and connection_revision is null'],
 ['test_store_qualification_controls',"phase='disabled' and connection_id is null and connection_revision is null and started_at is null and sealed_at is null and seal_sha256 is null"]];
export function privateChecksSQL({after=false}={}){
 const check=(condition,name)=>`if not (${condition}) then raise exception ${quote(name)};end if;`;
 const checkTable=(schema,name,condition)=>check(`select count(*)=1 and bool_and(singleton and (${condition})) from ${schema}.${name}`,'authoring_control_not_disabled:'+name);
 return `-- Journal is independently observed using its existing bounded reader.
 -- No new journal-owner membership or direct journal read grant is introduced.
 grant sbx_v1_core_owner to postgres with inherit false,set true;
 set local role sbx_v1_core_owner;
 lock table ${[...new Set([...coreChecks.map(x=>x[0]),...nativePrivateStateTables.core,...playPrivateStateTables,...(after?manifest.newTables.map(t=>t.split('.')[1]):[])])].map(t=>'sandbox_commerce_v1.'+t).join(',')} in share row exclusive mode nowait;
 do $core_state$ begin
 ${coreChecks.map(([t,c])=>checkTable('sandbox_commerce_v1',t,c)).join('\n')}
 ${[...nativePrivateStateTables.core,...playPrivateStateTables].map(t=>check(`not exists(select 1 from sandbox_commerce_v1.${t} limit 1)`,'authoring_old_native_not_empty:'+t)).join('\n')}
${after?manifest.newTables.map(t=>check(`not exists(select 1 from ${t} limit 1)`,'authoring_new_data_not_empty:'+t)).join('\n'):''}
 end $core_state$;
 reset role;grant sbx_v1_core_owner to postgres with inherit false,set false;
 do $restored$ begin ${ownerGuard} end $restored$;`;
}
export {sha,quote};
export const beforeComparisonFields=Object.freeze(hashFields);
