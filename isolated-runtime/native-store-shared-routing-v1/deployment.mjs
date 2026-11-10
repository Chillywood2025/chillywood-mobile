// Local-only exact packet assembler. There is no database/network executor here.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const catalogItemsSQL="\n select jsonb_build_array('function',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl::text,p.proowner::regrole::text) item from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations') and p.prokind in('f','p')\n union all select jsonb_build_array('relation',n.nspname,c.relname,c.relkind,c.relowner::regrole::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,c.relpersistence,c.relreplident,c.relispartition,pg_get_expr(c.relpartbound,c.oid),case when c.relkind in('v','m') then pg_get_viewdef(c.oid,true) end) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1') and c.relkind in('r','p','v','m','S')\n union all select jsonb_build_array('column',a.attrelid::regclass::text,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1') and a.attnum>0 and not a.attisdropped and c.relkind in('r','p','v','m','S')\n union all select jsonb_build_array('constraint',n.nspname,co.conrelid::regclass::text,co.conname,pg_get_constraintdef(co.oid),co.convalidated) from pg_constraint co join pg_namespace n on n.oid=co.connamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1')\n union all select jsonb_build_array('index',i.indrelid::regclass::text,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready) from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1')\n union all select jsonb_build_array('policy',p.polrelid::regclass::text,p.polname,p.polcmd,p.polpermissive,(select array_agg(r::regrole::text order by r::regrole::text collate \"C\") from unnest(p.polroles) r),pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1')\n union all select jsonb_build_array('trigger',t.tgrelid::regclass::text,t.tgname,t.tgisinternal,t.tgfoid::regprocedure::text,t.tgtype,t.tgenabled,t.tgdeferrable,t.tginitdeferred,pg_get_triggerdef(t.oid),co.conrelid::regclass::text,co.conname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace left join pg_constraint co on co.oid=t.tgconstraint where n.nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1')\n union all select jsonb_build_array('schema',nspname,nspowner::regrole::text,nspacl::text) from pg_namespace where nspname in ('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1')\n union all select jsonb_build_array('role',rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconfig) from pg_roles\n union all select jsonb_build_array('membership',roleid::regrole::text,member::regrole::text,grantor::regrole::text,admin_option,inherit_option,set_option) from pg_auth_members\n union all select jsonb_build_array('defaultAcl',defaclrole::regrole::text,coalesce(n.nspname,''),defaclobjtype,defaclacl::text) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace\n union all select jsonb_build_array('eventTrigger',e.evtname,e.evtevent,e.evtenabled,e.evttags,e.evtowner::regrole::text,pg_get_functiondef(e.evtfoid),p.proacl::text,p.proowner::regrole::text) from pg_event_trigger e join pg_proc p on p.oid=e.evtfoid\n";
export const here=path.dirname(new URL(import.meta.url).pathname);
export const root=path.resolve(here,'../..');
export const sourceManifest=JSON.parse(fs.readFileSync(path.join(here,'deployment-source.json'),'utf8'));
export const sourceCommit=sourceManifest.originCommit;
export const sourceTree=sourceManifest.originTree;
export const sourcePath='isolated-runtime/native-store-shared-routing-v1/exclusion.sql';
export const hash=x=>createHash('sha256').update(x).digest('hex');
export const literal=x=>"'"+String(x).replaceAll("'","''")+"'";
export const source=fs.readFileSync(path.join(root,sourcePath),'utf8');
assert.equal(hash(source),sourceManifest.sourceSha256,'Shared exclusion source hash changed');
export const identity=sourceManifest.migration;
export const signature='public.revenuecat_native_legacy_exclusion_v1(uuid,text,text)';
const body=source.match(/as \$\$([\s\S]*)\$\$;/u)?.[1]; assert.ok(body);
const comment=source.match(/comment on function[\s\S]*? is\s*'([^']*)';/u)?.[1];assert.ok(comment);
const bodyHash=hash(body);
export const functionContractSQL=`select jsonb_build_object(
 'schema',n.nspname,'name',p.proname,'owner',p.proowner::regrole::text,
 'language',l.lanname,'kind',p.prokind,'argumentTypes',p.proargtypes::text,'argumentNames',p.proargnames,
 'allArgumentTypes',p.proallargtypes::text,'argumentModes',p.proargmodes,'argumentDefaults',p.pronargdefaults,
 'returnType',p.prorettype::regtype::text,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,
 'strict',p.proisstrict,'returnsSet',p.proretset,'volatility',p.provolatile,'parallel',p.proparallel,
 'cost',p.procost,'rows',p.prorows,'support',p.prosupport::text,'config',p.proconfig,
 'bodySha256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),
 'definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
 'comment',obj_description(p.oid,'pg_proc'),
 'acl',(select jsonb_agg(jsonb_build_object('grantor',a.grantor::regrole::text,'grantee',case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end,'privilege',a.privilege_type,'grantable',a.is_grantable) order by a.grantor::regrole::text collate "C",case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end collate "C",a.privilege_type collate "C",a.is_grantable) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),
 'anonExecute',has_function_privilege('anon',p.oid,'EXECUTE'),
 'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'serviceExecute',has_function_privilege('service_role',p.oid,'EXECUTE')
 ) metadata from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
 where n.nspname='public' and p.proname='revenuecat_native_legacy_exclusion_v1'`;
const queryOnly=file=>{const s=fs.readFileSync(path.join(here,'deployment-queries',file),'utf8');return s.slice(s.indexOf("set local search_path='';\n")+"set local search_path='';\n".length).replace(/;\s*rollback;\s*$/u,'');};
export const baselineSQL=[queryOnly('02-defaults-roles.sql'),`select 'eventTrigger'::text kind,to_jsonb(r) metadata from (${queryOnly('03-event-triggers.sql')}) r`,queryOnly('04-dependencies.sql'),queryOnly('05-history.sql'),queryOnly('06-history-write-boundary.sql')].join('\nunion all\n');
// Rowwise retained metadata, no JSON/string aggregation. It uses disk-spillable
// EXCEPT ALL with hash aggregation disabled. The only permitted catalog delta
// is the one fully contracted function. This is not an administrative DDL lock.
const retainedScope="('public','private','auth','extensions','sandbox_commerce_v1','native_store_sandbox_v1','supabase_migrations')";
export const retainedSQL=`select item from (${catalogItemsSQL}) retained where not (item->>0='function' and item->>1='public' and item->>2='revenuecat_native_legacy_exclusion_v1')
 union all select jsonb_build_array('functionIdentity',p.oid,n.nspname,p.proname,to_jsonb(p)-'prosrc') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ${retainedScope} and p.prokind in('f','p') and not(n.nspname='public' and p.proname='revenuecat_native_legacy_exclusion_v1')
 union all select jsonb_build_array('relationIdentity',c.oid,c.reltype,c.reloftype,n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${retainedScope}
 union all select jsonb_build_array('constraintIdentity',c.oid,c.conrelid,c.conindid,c.confrelid,c.conname) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname in ${retainedScope}
 union all select jsonb_build_array('triggerIdentity',t.oid,t.tgrelid,t.tgfoid,t.tgconstraint,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${retainedScope}
 union all select jsonb_build_array('policyIdentity',p.oid,p.polrelid,p.polname) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${retainedScope}
 union all select jsonb_build_array('schemaIdentity',oid,nspname) from pg_namespace where nspname in ${retainedScope}
 union all select jsonb_build_array('defaultAclIdentity',oid,defaclrole,defaclnamespace,defaclobjtype) from pg_default_acl
 union all select jsonb_build_array('eventTriggerIdentity',oid,evtname,evtfoid,evtowner) from pg_event_trigger`;
export const historySQL="select to_jsonb(m)-'statements'||jsonb_build_object('statementsSha256',encode(sha256(convert_to(array_to_json(m.statements)::text,'UTF8')),'hex')) item from supabase_migrations.schema_migrations m";
const guard=(condition,code)=>`if (${condition}) is distinct from true then raise exception '${code}';end if;`;
function validateRoles(baseline){
 const role=name=>{const rows=baseline.filter(r=>r.kind==='role'&&r.metadata.rolname===name);assert.equal(rows.length,1,'Missing unique role '+name);return rows[0].metadata;};
 const writer=role('postgres');assert.equal(writer.rolsuper,false,'Installer must not be a superuser');assert.equal(writer.rolcanlogin,true);assert.equal(writer.rolbypassrls,true);
 const reader=role('supabase_read_only_user');assert.equal(reader.rolsuper,false);assert.equal(reader.rolcanlogin,true);assert.equal(reader.rolbypassrls,true);
 for(const key of ['rolcreaterole','rolcreatedb','rolreplication'])assert.equal(reader[key],false);
 assert.deepEqual(reader.rolconfig,['default_transaction_read_only=on'],'Reader must retain real read-only defaults');
 for(const name of ['anon','authenticated','service_role']){const api=role(name);for(const key of ['rolsuper','rolcanlogin','rolcreaterole','rolcreatedb','rolreplication'])assert.equal(api[key],false);assert.equal(api.rolbypassrls,name==='service_role');}
}
export function verifyContract(c){
 assert.equal(c.schema,'public');assert.equal(c.name,'revenuecat_native_legacy_exclusion_v1');assert.equal(c.owner,'postgres');
 assert.equal(c.language,'plpgsql');assert.equal(c.kind,'f');assert.equal(c.argumentTypes,'2950 25 25');
 assert.deepEqual(c.argumentNames,['p_provider_event_row_id','p_provider_event_id','p_raw_sha256']);
 assert.equal(c.allArgumentTypes,null);assert.equal(c.argumentModes,null);assert.equal(c.argumentDefaults,0);
 assert.equal(c.returnType,'jsonb');assert.equal(c.securityDefiner,true);assert.equal(c.leakproof,false);assert.equal(c.strict,false);
 assert.equal(c.returnsSet,false);assert.equal(c.volatility,'v');assert.equal(c.parallel,'u');assert.equal(c.cost,100);assert.equal(c.rows,0);assert.equal(c.support,'-');
 assert.deepEqual(c.config,['search_path=""','lock_timeout=500ms']);assert.equal(c.bodySha256,bodyHash);assert.equal(c.comment,comment);
 assert.deepEqual(c.acl,[{grantor:'postgres',grantee:'postgres',privilege:'EXECUTE',grantable:false},{grantor:'postgres',grantee:'service_role',privilege:'EXECUTE',grantable:false}]);
 assert.equal(c.anonExecute,false);assert.equal(c.authenticatedExecute,false);assert.equal(c.serviceExecute,true);
 assert.equal(c.definitionSha256,sourceManifest.definitionSha256);return c;
}
function assemblePacket({baseline,contract,context},fixtureOnly=false){
 verifyContract(contract);assert.ok(Array.isArray(baseline)&&baseline.length>0);
 validateRoles(baseline);
 assert.equal(baseline.filter(r=>r.kind==='historyRelation').length,1);
 assert.ok(!baseline.some(r=>['historyTrigger','historyRule'].includes(r.kind)),'Migration history triggers/rules require separate review');
 const historyRelation=baseline.find(r=>r.kind==='historyRelation').metadata;
 assert.equal(historyRelation.owner,'postgres');assert.equal(historyRelation.relkind,'r');assert.equal(historyRelation.relpersistence,'p');assert.equal(historyRelation.relrowsecurity,false);assert.equal(historyRelation.relforcerowsecurity,false);
 assert.ok(baseline.filter(r=>r.kind==='historyColumn').every(r=>r.metadata.default_expression===null),'History defaults require separate review');
 const historyConstraints=baseline.filter(r=>r.kind==='historyConstraint');
 assert.equal(historyConstraints.length,2);assert.ok(historyConstraints.every(r=>r.metadata.convalidated===true));
 assert.deepEqual(historyConstraints.map(r=>r.metadata.definition).sort(),['PRIMARY KEY (version)','UNIQUE (idempotency_key)']);
 const summaries=baseline.filter(r=>r.kind==='historySummary');assert.equal(summaries.length,1);
 assert.match(summaries[0].metadata.latest_version,/^\d{14}$/u);
 assert.ok(summaries[0].metadata.latest_version<identity.version,'Fixed version must be later than existing migration history');
 assert.equal(context.serverVersionNum,170006);assert.equal(context.database,fixtureOnly?'shared_exclusion_fixture':'postgres');assert.ok(context.databaseStart);
 const same=(left,right)=>`not exists(((${left}) except all (${right})) union all ((${right}) except all (${left})))`;
 const matchesBaseline=same('select kind,metadata from pg_temp.exclusion_expected',baselineSQL);
 const rows=baseline.map(r=>`(${literal(r.kind)},${literal(JSON.stringify(r.metadata))}::jsonb)`);
 const sourceLiteral=literal(source);
 const historyRow=`select ${literal(identity.version)}::text version,${literal(identity.name)}::text name,array[${sourceLiteral}]::text[] statements`;
 const q=`-- Exact merged #701 extension only. Installed48 is NEVER re-executed.\n-- Source ${sourceCommit}, tree ${sourceTree}; source SHA256 ${hash(source)}.\n-- CLI generated migration ${identity.version}_${identity.name}.\n-- Standalone transaction: no auto-versioning or outer committing migration adapter.\nbegin;\nset local statement_timeout='4s';\nset local transaction_timeout='20s';\nset local lock_timeout='500ms';\nset local jit=off;\nset local work_mem='1MB';\nset local max_parallel_workers_per_gather=0;\nset local enable_hashagg=off;\nset local search_path='';\nset local check_function_bodies=on;\ndo $pre$ begin
 ${guard("current_user='postgres' and session_user='postgres' and current_setting('transaction_read_only')='off'",'exclusion_writer_identity_mismatch')}
 ${guard("(select not rolsuper and rolcanlogin and rolbypassrls from pg_roles where rolname=current_user)",'exclusion_writer_role_unqualified')}
 ${guard(`current_database()=${literal(context.database)} and current_setting('server_version_num')::int=${context.serverVersionNum} and pg_postmaster_start_time()=${literal(context.databaseStart)}::timestamptz`,'exclusion_server_context_mismatch')}
 ${guard("pg_try_advisory_xact_lock(1789032821,701)",'exclusion_cooperative_fence_busy')}
 ${guard("not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='revenuecat_native_legacy_exclusion_v1')",'exclusion_function_already_present')}
 ${guard(`not exists(select 1 from supabase_migrations.schema_migrations where version=${literal(identity.version)} or name=${literal(identity.name)})`,'exclusion_history_already_present')}
 end $pre$;
 lock table public.provider_events,public.revenuecat_webhook_ingress_events,public.revenuecat_premium_transaction_authority,public.revenuecat_consumable_transaction_intents,public.revenuecat_unbound_initial_authority,public.revenuecat_unbound_terminal_authority,public.money_purchase_intents,public.monetization_product_store_mappings,public.monetization_products,public.revenuecat_provider_reconciliation_obligations in access share mode nowait;
 lock table supabase_migrations.schema_migrations in share row exclusive mode nowait;
 create temporary table exclusion_expected(kind text not null,metadata jsonb not null) on commit drop;
 ${Array.from({length:Math.ceil(rows.length/32)},(_,i)=>'insert into pg_temp.exclusion_expected values '+rows.slice(i*32,i*32+32).join(',')+';').join('\n')}
 do $baseline$ begin ${guard(matchesBaseline,'exclusion_baseline_changed')} end $baseline$;
 create temporary table exclusion_retained_before(item jsonb not null) on commit drop;
 create temporary table exclusion_retained_after(item jsonb not null) on commit drop;
 create temporary table exclusion_history_before(item jsonb not null) on commit drop;
 insert into pg_temp.exclusion_retained_before ${retainedSQL};
 insert into pg_temp.exclusion_history_before ${historySQL};
 -- BEGIN exact source bytes, separately bound by SHA256 above.
 ${source}-- END exact source bytes.
 insert into pg_temp.exclusion_retained_after ${retainedSQL};
 do $post$ declare actual jsonb;begin
 select metadata into strict actual from (${functionContractSQL}) expected;
 ${guard(`actual=${literal(JSON.stringify(contract))}::jsonb`,'exclusion_function_contract_mismatch')}
 ${guard(matchesBaseline,'exclusion_baseline_changed_after_create')}
 ${guard(same('select item from pg_temp.exclusion_retained_before','select item from pg_temp.exclusion_retained_after'),'exclusion_retained_catalog_changed')}
 ${guard(same('select item from pg_temp.exclusion_history_before',historySQL),'exclusion_prior_history_changed')}
 end $post$;
 ${`insert into supabase_migrations.schema_migrations(version,name,statements) ${historyRow};
 set constraints all immediate;
 truncate pg_temp.exclusion_retained_after;
 insert into pg_temp.exclusion_retained_after ${retainedSQL};
 do $receipt$ declare actual jsonb;begin
 select metadata into strict actual from (${functionContractSQL}) expected;
 ${guard(`actual=${literal(JSON.stringify(contract))}::jsonb`,'exclusion_function_changed_after_receipt')}
 ${guard(`(select count(*)=1 from supabase_migrations.schema_migrations where version=${literal(identity.version)} and name=${literal(identity.name)} and statements=array[${sourceLiteral}]::text[])`,'exclusion_exact_receipt_missing')}
 ${guard(same('select item from pg_temp.exclusion_history_before',historySQL+` where m.version<>${literal(identity.version)}`),'exclusion_old_history_changed_after_receipt')}
 ${guard(same('select item from pg_temp.exclusion_retained_before','select item from pg_temp.exclusion_retained_after'),'exclusion_retained_changed_after_receipt')}
 end $receipt$;`}
 commit;\n`;
 return q;
}
export function readbackSQL(contract,baseline){
 verifyContract(contract);
 assert.ok(Array.isArray(baseline)&&baseline.length>0);
 validateRoles(baseline);
 const expected=baseline.filter(r=>!['historyRow','historySummary'].includes(r.kind));
 const metadataCTE=`with expected as(select kind,metadata from jsonb_to_recordset(${literal(JSON.stringify(expected))}::jsonb) as x(kind text,metadata jsonb)), actual as(select kind,metadata from (${baselineSQL}) x where kind not in('historyRow','historySummary'))`;
 return `begin isolation level repeatable read read only;\nset local statement_timeout='4s';\nset local transaction_timeout='5s';\nset local lock_timeout='500ms';\nset local jit=off;\nset local work_mem='1MB';\nset local max_parallel_workers_per_gather=0;\nset local enable_hashagg=off;\nset local search_path='';\n${metadataCTE}\nselect jsonb_build_object('protocol','revenuecat-native-legacy-exclusion-readback-v1','currentUser',current_user,'sessionUser',session_user,'readOnly',current_setting('transaction_read_only'),'database',current_database(),'serverVersionNum',current_setting('server_version_num')::int,'databaseStart',pg_postmaster_start_time(),'observedAt',clock_timestamp(),'retainedRelevantMetadataMatches',not exists(((select * from expected) except all(select * from actual)) union all ((select * from actual) except all(select * from expected))),'functions',(select jsonb_agg(metadata) from (${functionContractSQL}) f),'migration',(select jsonb_agg(jsonb_build_object('version',version,'name',name,'statementsSha256',encode(sha256(convert_to(array_to_json(statements)::text,'UTF8')),'hex'),'exactSource',statements=array[${literal(source)}]::text[])) from supabase_migrations.schema_migrations where version=${literal(identity.version)} or name=${literal(identity.name)}),'installed48',(select jsonb_agg(jsonb_build_object('version',version,'name',name,'statementsSha256',encode(sha256(convert_to(array_to_json(statements)::text,'UTF8')),'hex'))) from supabase_migrations.schema_migrations where version='20261109151349')) evidence;\nrollback;\n`;
}
export const manifest={sourceCommit,sourceTree,sourcePath,sourceSha256:hash(source),sourceBodySha256:bodyHash,migration:identity,targetExecuted:false,deploymentQualified:false,activationAllowed:false,retained48Immutable:true};

// This validates committed bytes, not target execution or operational authority.
export function bindCommittedSource(commit){
 assert.match(commit,/^[a-f0-9]{40}$/u);
 const git=(...args)=>execFileSync('git',['--no-replace-objects',...args],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 assert.equal(git('rev-parse',sourceCommit+'^{tree}'),sourceTree);
 assert.equal(execFileSync('git',['--no-replace-objects','show',sourceCommit+':'+sourcePath],{cwd:root,encoding:'utf8'}),source,'Original merged source bytes differ');
 const files=['exclusion.sql','deployment.mjs','deployment-source.json','deployment-contract.json','deployment.native.mjs',...fs.readdirSync(path.join(here,'deployment-queries')).map(n=>'deployment-queries/'+n)];
 for(const name of files){const relative=path.relative(root,path.join(here,name));assert.equal(execFileSync('git',['--no-replace-objects','show',commit+':'+relative],{cwd:root,encoding:'utf8'}),fs.readFileSync(path.join(here,name),'utf8'),'Committed deployment bytes differ: '+name);}
 return {commit,tree:git('rev-parse',commit+'^{tree}'),sourceSha256:hash(source),migration:identity,files};
}
export const installed48={version:'20261109151349',name:'native_store_sandbox_source_bound_48',statementsSha256:'d5a54d9ea772952f72d3ccc53449a788d4a0dec51aafc116b4a1af0c71f01ff9'};
export function buildPacket(options){
 const binding=bindCommittedSource(options.commit);
 const old=options.baseline.filter(r=>r.kind==='historyRow'&&r.metadata.version===installed48.version);
 assert.equal(old.length,1,'Installed48 source receipt is required');
 assert.equal(old[0].metadata.name,installed48.name);assert.equal(old[0].metadata.statement_count,1);assert.equal(old[0].metadata.statements_sha256,installed48.statementsSha256);
 return {sql:assemblePacket(options),binding};
}
// Emits SQL bound to a deliberately different database name. It cannot match
// the hosted postgres database and does not relax the public preparation path.
export function buildLocalFixturePacket(options){return assemblePacket(options,true);}
export function classifyReadback(evidence,{context,contract}){
 const result={status:'unknown_or_conflicting',retryAllowed:false,deploymentAllowed:false,activationAllowed:false,runtimeQualified:false};
 try{
  verifyContract(contract);assert.equal(evidence.protocol,'revenuecat-native-legacy-exclusion-readback-v1');
  assert.equal(evidence.currentUser,'supabase_read_only_user');assert.equal(evidence.sessionUser,'supabase_read_only_user');assert.equal(evidence.readOnly,'on');
  const preciseTime=value=>{assert.equal(typeof value,'string');const fraction=value.match(/\.(\d+)(?:Z|[+-]\d{2}(?::?\d{2})?)$/u)?.[1]??'';assert.ok(fraction.length<=6);return new Date(value).toISOString().replace(/\.\d{3}Z$/u,'.'+fraction.padEnd(6,'0')+'Z');};
  assert.equal(evidence.database,context.database);assert.equal(evidence.serverVersionNum,context.serverVersionNum);assert.equal(preciseTime(evidence.databaseStart),preciseTime(context.databaseStart));
  assert.equal(evidence.retainedRelevantMetadataMatches,true);assert.deepEqual(evidence.installed48,[installed48]);
  assert.deepEqual(evidence.functions,[contract]);assert.equal(evidence.migration.length,1);
  assert.deepEqual(evidence.migration[0],{...identity,statementsSha256:hash(JSON.stringify([source])),exactSource:true});
  return {...result,status:'exact_function_receipt_and_dependencies_observed_runtime_unqualified'};
 }catch{return result;}
}
