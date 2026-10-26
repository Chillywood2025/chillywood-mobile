#!/usr/bin/env node
// No database driver or credentials are bundled with the application. The
// explicitly selected operator adapter owns TLS, authentication and cancellation.
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {readFileSync, openSync, writeSync, fsyncSync, closeSync, renameSync, existsSync} from 'node:fs';
import {isAbsolute, dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = new URL('../', import.meta.url);
export const BOUNDS = Object.freeze({statement: 90000, lock: 2000, transaction: 120000, idle: 15000, analyze: 10000, heartbeat: 3000, minimumLifetime: 130000});
export const quoteIdentifier = value => '"' + String(value).replaceAll('"', '""') + '"';
export const quoteLiteral = value => "'" + String(value).replaceAll("'", "''") + "'";
const json = value => quoteLiteral(JSON.stringify(value)) + '::jsonb';
const sha = value => createHash('sha256').update(value).digest('hex');
const same = (a, b, code) => { try { assert.deepEqual(a, b); } catch { throw new Error(code); } };
const requireThat = (value, code) => { if (!value) throw new Error(code); };
const oid = value => { requireThat(Number.isInteger(value) && value > 0 && value <= 4294967295, 'INVALID_OID'); return value; };
const value = async (client, sql) => {
  const result = await client.query(sql);
  requireThat(result.rows.length === 1 && Object.hasOwn(result.rows[0], 'value'), 'INVALID_QUERY_RESULT');
  return result.rows[0].value;
};

// Compare literal source bodies, not a newly accepted live normalizer hash.
// Full catalog rows are additionally bound in the plan and checked on resume.
export function sourceContract() {
  const files = {
    reference: '20261020141554_deleted_media_reference_retirement.sql',
    normalize: '20261020201310_deleted_content_stage_recovery.sql',
    matcher: '20261025121430_platform_brand_reference_scan_performance.sql',
    candidate: '20261025141347_platform_brand_reference_candidate_indexes.sql',
  };
  const sources = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, readFileSync(new URL('supabase/migrations/' + file, root), 'utf8')]));
  const names = [
    ['deleted_media_locator_columns', 'reference'], ['deleted_media_normalize_locator', 'normalize'],
    ['platform_brand_retention_row_mentions', 'matcher'],
    ...['platform_brand_index_jsonb_bytes_v1', 'platform_brand_index_normalize_v1', 'platform_brand_index_environment_v1',
      'platform_brand_index_spec_v1', 'platform_brand_index_expression_v1', 'platform_brand_retention_references_clear'].map(name => [name, 'candidate']),
  ];
  const functions = names.map(([name, file]) => {
    const match = sources[file].match(new RegExp(`create (?:or replace )?function private\\.${name}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`, 'i'));
    requireThat(match, 'SOURCE_FUNCTION_MISSING');
    const declaration = match[0].slice(0, match[0].indexOf('as $$'));
    return {name, body: match[1], language: /language (\w+)/i.exec(declaration)[1],
      arguments: declaration.match(/function private\.\w+\(([\s\S]*?)\)\s+returns/i)[1].replace(/\s+/g,'').toLowerCase(),
      result: declaration.match(/returns ([\s\S]*?)\s+language/i)[1].replace(/\s+/g,'').toLowerCase(),
      volatility: /\bimmutable\b/i.test(declaration) ? 'i' : /\bstable\b/i.test(declaration) ? 's' : 'v',
      definer: /security definer/i.test(declaration)};
  });
  return {functions, hash: sha(JSON.stringify(functions))};
}

const candidateSource=readFileSync(new URL('supabase/migrations/20261025141347_platform_brand_reference_candidate_indexes.sql',root),'utf8');
const guardTemplate=candidateSource.match(/as \$guard_body\$([\s\S]*?)\$guard_body\$/)[1];
const frozenOids="array['private.platform_brand_index_jsonb_bytes_v1(jsonb)'::regprocedure::oid,'private.platform_brand_index_normalize_v1(text)'::regprocedure::oid]";
const frozenRows=`(select jsonb_agg((to_jsonb(p)-'proacl')||jsonb_build_object('namespace_name',n.nspname,
 'acl',(select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable)
 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a)) order by p.oid)
 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where p.oid=any(${frozenOids}))`;
const catalogSQL = `select jsonb_build_object(
 'database',jsonb_build_object('name',current_database(),'oid',(select oid from pg_database where datname=current_database()),
   'server',inet_server_addr()::text,'port',inet_server_port(),'version',current_setting('server_version_num'),'role',current_user),
 'owner',(select oid::bigint from pg_roles where rolname=current_user),
 'functions',(select jsonb_agg(to_jsonb(p)||jsonb_build_object('proowner',p.proowner::bigint,'language',l.lanname,'arguments',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),
   'acl',(select jsonb_agg(jsonb_build_array(a.grantor::bigint,a.grantee::bigint,a.privilege_type,a.is_grantable) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable)
     from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) order by p.proname)
   from pg_proc p join pg_language l on l.oid=p.prolang where p.pronamespace='private'::regnamespace
   and p.proname=any(array[${sourceContract().functions.map(f => quoteLiteral(f.name)).join(',')}])),
 'environment',private.platform_brand_index_environment_v1(),
 'extension',(select jsonb_build_object('oid',e.oid,'namespace',n.nspname,'version',e.extversion,'opclass',o.oid::bigint)
   from pg_extension e join pg_namespace n on n.oid=e.extnamespace join pg_opclass o on o.opcnamespace=n.oid
   join pg_am a on a.oid=o.opcmethod where e.extname='pg_trgm' and o.opcname='gin_trgm_ops' and a.amname='gin' and o.opcintype='text'::regtype),
 'registry',(select jsonb_build_object('oid',c.oid,'owner',c.relowner::bigint,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl,
   'ownerOnly',(select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable)
      from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a)=(select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable)
      from aclexplode(acldefault('r',c.relowner)) a),
   'noPolicies',not exists(select 1 from pg_policy where polrelid=c.oid))
   from pg_class c where c.oid='private.platform_brand_reference_indexes_v1'::regclass),
 'guards',(select jsonb_agg(jsonb_build_object('name',e.evtname,'enabled',e.evtenabled,'event',e.evtevent,'function',e.evtfoid,
   'body',p.prosrc,'owner',p.proowner,'definer',p.prosecdef,'acl',p.proacl,'expected',
   p.oid='extensions.guard_platform_brand_index_helper_ddl_v1()'::regprocedure
   and p.prosrc=format(${quoteLiteral(guardTemplate)},${frozenOids},${frozenRows})
   and p.proowner=(select oid from pg_roles where rolname=current_user) and e.evtowner=p.proowner and e.evttags is null
   and p.prorettype='event_trigger'::regtype and p.pronargs=0 and not p.prosecdef and not p.proleakproof and p.provolatile='v' and p.proparallel='u'
   and p.proconfig=array['search_path=""'] and p.prolang=(select oid from pg_language where lanname='plpgsql')
   and (select count(*)=1 and bool_and(a.grantor=p.proowner and a.grantee=p.proowner and a.privilege_type='EXECUTE' and not a.is_grantable)
     from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) order by e.evtname)
   from pg_event_trigger e join pg_proc p on p.oid=e.evtfoid where e.evtname in ('platform_brand_index_helper_ddl_v1','platform_brand_index_helper_drop_v1'))
 ) as value;`;

export function validateCatalog(catalog, contract = sourceContract()) {
  requireThat(catalog.database.version === '170006', 'SERVER_VERSION_MISMATCH');
  requireThat(catalog.database.role === 'postgres', 'OPERATOR_ROLE_MISMATCH');
  requireThat(catalog.functions?.length === contract.functions.length, 'FUNCTION_SET_MISMATCH');
  for (const expected of contract.functions) {
    const actual = catalog.functions.find(item => item.proname === expected.name);
    requireThat(actual && actual.prosrc === expected.body && actual.language === expected.language && actual.provolatile === expected.volatility
      && actual.prosecdef === expected.definer && actual.proleakproof === false && actual.proparallel === 'u'
      && actual.proisstrict === false && actual.proowner===catalog.owner
      && actual.arguments.replace(/\s+/g,'').toLowerCase()===expected.arguments
      && actual.result.replace(/\s+/g,'').toLowerCase()===expected.result, 'SOURCE_SEMANTICS_MISMATCH');
    same(actual.proconfig, ['search_path=""'], 'FUNCTION_SEARCH_PATH_MISMATCH');
    const pure=['platform_brand_index_jsonb_bytes_v1','platform_brand_index_normalize_v1'].includes(expected.name);
    same(actual.acl,(pure?[[catalog.owner,0,'EXECUTE',false]]:[]).concat([[catalog.owner,catalog.owner,'EXECUTE',false]]),'FUNCTION_ACL_MISMATCH');
  }
  requireThat(catalog.registry.rls && catalog.registry.force && catalog.registry.owner===catalog.owner
    && catalog.registry.ownerOnly && catalog.registry.noPolicies && catalog.extension?.opclass, 'REGISTRY_OR_EXTENSION_MISMATCH');
  requireThat(catalog.guards?.length === 2 && catalog.guards.every(g => g.enabled === 'O' && !g.definer && g.expected)
    && catalog.guards.map(g => g.event).sort().join(',') === 'ddl_command_end,sql_drop', 'HELPER_GUARD_MISSING');
}

async function configure(client, applicationName) {
  await client.query(`set application_name=${quoteLiteral(applicationName)}; set search_path=''; set standard_conforming_strings=on;
    set statement_timeout='90s'; set lock_timeout='2s'; set transaction_timeout='120s'; set idle_in_transaction_session_timeout='15s'; set gin_fuzzy_search_limit=0;`);
  const settings = await value(client, `select jsonb_build_object('pid',pg_backend_pid(),'backendStart',(select backend_start::text from pg_stat_activity where pid=pg_backend_pid()),
    'applicationName',current_setting('application_name'),'bounds',(select jsonb_object_agg(name,jsonb_build_array(setting::bigint,unit)) from pg_settings
    where name in ('statement_timeout','lock_timeout','transaction_timeout','idle_in_transaction_session_timeout'))) as value;`);
  same(settings.bounds, {statement_timeout:[90000,'ms'],lock_timeout:[2000,'ms'],transaction_timeout:[120000,'ms'],idle_in_transaction_session_timeout:[15000,'ms']}, 'SESSION_BOUNDS_MISMATCH');
  return {pid:settings.pid, backendStart:settings.backendStart, applicationName:settings.applicationName};
}

const targetsSQL = `select coalesce(jsonb_agg(jsonb_build_object('oid',c.oid::bigint,'name',c.relname,'owner',c.relowner::bigint,
 'spec',to_jsonb(s)) order by c.oid),'[]'::jsonb) as value from pg_class c join pg_namespace n on n.oid=c.relnamespace
 cross join lateral private.platform_brand_index_spec_v1(c.oid) s where n.nspname='public' and c.relkind='r';`;
const targetSQL = target => `select (select jsonb_build_object('oid',c.oid::bigint,'name',c.relname,'owner',c.relowner::bigint,'spec',to_jsonb(s))
 from pg_class c cross join lateral private.platform_brand_index_spec_v1(c.oid) s where c.oid=${oid(target.oid)}
 and c.relnamespace='public'::regnamespace and to_regclass(${quoteLiteral('public.' + quoteIdentifier(target.name))})=c.oid) as value;`;
const indexSQL = name => `select (select jsonb_build_object('oid',c.oid::bigint,'name',c.relname,'owner',c.relowner::bigint,'table',i.indrelid::bigint,
 'valid',i.indisvalid,'ready',i.indisready,'live',i.indislive,'unique',i.indisunique,'attrs',i.indnatts,'keys',i.indnkeyatts,
 'key',i.indkey[0],'predicate',pg_get_expr(i.indpred,i.indrelid,false),'expression',pg_get_expr(i.indexprs,i.indrelid,false),
 'opclass',i.indclass[0]::bigint,'collation',i.indcollation[0]::bigint,'am',a.amname)
 from pg_class c left join pg_index i on i.indexrelid=c.oid left join pg_am a on a.oid=c.relam
 where c.relnamespace='public'::regnamespace and c.relname=${quoteLiteral(name)}) as value;`;
export function validateIndex(index, target, expression, extension, priorOid) {
  requireThat(index && (!priorOid || index.oid === priorOid) && index.table === target.oid && index.owner === target.owner
    && index.am === 'gin' && !index.unique && index.attrs === 1 && index.keys === 1 && index.key === 0
    && index.predicate === null && index.expression === expression && index.opclass === extension.opclass
    && index.collation === 100 && index.live, 'INDEX_IDENTITY_OR_CONTRACT_MISMATCH');
}

// The zero-row temporary index lets PostgreSQL canonicalize the exact expression
// with the target's types/collations, including dropped/quoted column histories.
// It never reads application rows and disappears with the guard transaction.
async function canonicalExpression(guard, target, extension, suffix) {
  const name = 'brand_index_shape_' + suffix;
  await guard.query(`create temporary table ${quoteIdentifier(name)} (like public.${quoteIdentifier(target.name)}) on commit drop;`);
  await guard.query(`create index on pg_temp.${quoteIdentifier(name)} using gin ((${target.spec.scan_expression}) ${quoteIdentifier(extension.namespace)}.gin_trgm_ops);`);
  return value(guard, `select pg_get_expr(i.indexprs,i.indrelid,false) as value from pg_index i where i.indrelid=${quoteLiteral('pg_temp.' + quoteIdentifier(name))}::regclass;`);
}

export async function runBrandReferenceIndexInstaller({adapter, mode = 'plan', plan, journal, checkpoint, resumeInvalid = false, targetOids}) {
  requireThat(['plan','apply'].includes(mode), 'INVALID_MODE');
  requireThat(adapter && typeof adapter.connect === 'function' && typeof adapter.cancel === 'function', 'ADAPTER_REQUIRED');
  requireThat(typeof checkpoint === 'function', 'DURABLE_CHECKPOINT_REQUIRED');
  const contract = sourceContract();
  let guard, guardIdentity, builder, builderIdentity, inTransaction = false, timer, heartbeatPromise = Promise.resolve(), heartbeatError, building = false;
  const save = async () => checkpoint({plan: structuredClone(plan), journal: structuredClone(journal)});
  const cancel = async () => { if (building && builderIdentity) await adapter.cancel(builderIdentity); };
  const stopHeartbeat = async () => { clearInterval(timer); timer = undefined; await heartbeatPromise; if (heartbeatError) throw heartbeatError; };
  try {
    guard = await adapter.connect({purpose:'guard',applicationName:'brand_index_guard'});
    guardIdentity=await configure(guard, 'brand_index_guard');
    const catalog = await value(guard, catalogSQL); validateCatalog(catalog, contract);
    if (mode === 'plan') {
      await guard.query('begin isolation level read committed read only;'); inTransaction = true;
      let targets=await value(guard,targetsSQL);
      if(targetOids!==undefined){requireThat(Array.isArray(targetOids)&&targetOids.length>0&&new Set(targetOids).size===targetOids.length,'INVALID_TARGET_SELECTION');targetOids.forEach(oid);targets=targets.filter(t=>targetOids.includes(t.oid));requireThat(targets.length===targetOids.length,'TARGET_NOT_ELIGIBLE');}
      plan = {version:1,id:randomUUID(),sourceContractSHA256:contract.hash,catalog,targets};
      await guard.query('commit;'); inTransaction = false;
      journal = {version:1,planSHA256:sha(JSON.stringify(plan)),status:'planned',tables:{}};
      await save(); return {plan,journal,status:'planned'};
    }
    requireThat(plan?.version === 1 && /^[0-9a-f-]{36}$/.test(plan.id) && plan.sourceContractSHA256 === contract.hash, 'PLAN_SOURCE_MISMATCH');
    requireThat(journal?.version === 1 && journal.planSHA256 === sha(JSON.stringify(plan)), 'JOURNAL_PLAN_MISMATCH');
    same(catalog,plan.catalog,'PLAN_CATALOG_DRIFT');
    builder = await adapter.connect({purpose:'builder',applicationName:'brand_index_builder'});
    builderIdentity = await configure(builder,'brand_index_builder');
    same(await value(builder,catalogSQL),plan.catalog,'BUILDER_DATABASE_MISMATCH');
    for (const target of plan.targets) {
      oid(target.oid);
      if (adapter.remainingLifetimeMs && adapter.remainingLifetimeMs() < BOUNDS.minimumLifetime) {
        journal.status='partial'; await save(); return {plan,journal,status:'partial'};
      }
      const started=Date.now();
      await guard.query('begin isolation level read committed;'); inTransaction=true;
      requireThat(await value(guard,'select pg_try_advisory_xact_lock(214741,141347) as value;'),'ANOTHER_INSTALLER_ACTIVE');
      await guard.query(`lock table public.${quoteIdentifier(target.name)} in access share mode;`);
      same(await value(guard,targetSQL(target)),target,'TARGET_IDENTITY_OR_SPEC_DRIFT');
      same(await value(guard,catalogSQL),plan.catalog,'CATALOG_DRIFT');
      const registration=await value(guard,`select (select to_jsonb(r)||jsonb_build_object('index_oid',r.index_oid::bigint) from private.platform_brand_reference_indexes_v1 r where table_oid=${target.oid}) as value;`);
      const entry=journal.tables[target.oid] ??= {attempts:[]};
      let attempt=entry.attempts.at(-1);
      if (registration) {
        requireThat(attempt?.indexOid === registration.index_oid && attempt.expression === registration.index_expression,'UNEXPECTED_EXISTING_REGISTRATION');
        validateIndex(await value(guard,indexSQL(attempt.name)),target,attempt.expression,plan.catalog.extension,attempt.indexOid);
        requireThat(await value(guard,`select private.platform_brand_index_expression_v1(${target.oid}) is not null as value;`),'REGISTERED_INDEX_NOT_USABLE');
        entry.status='complete'; await guard.query('commit;');inTransaction=false;await save();continue;
      }
      const expression=await canonicalExpression(guard,target,plan.catalog.extension,plan.id.replaceAll('-','').slice(0,12));
      if (attempt) {
        const existing=await value(guard,indexSQL(attempt.name));
        requireThat(attempt.indexOid && existing,'UNCERTAIN_PRIOR_BUILD_REQUIRES_RECONCILIATION');
        validateIndex(existing,target,expression,plan.catalog.extension,attempt.indexOid);
        same(attempt.expression,expression,'EXPRESSION_DRIFT');
        if (!existing.valid || !existing.ready) {
          requireThat(resumeInvalid,'INVALID_INDEX_REQUIRES_EXPLICIT_RESUME');
          attempt.retainedInvalid=true; attempt=undefined;
        }
      }
      if (!attempt) {
        const name=`brand_reference_v1_${target.oid}_${plan.id.replaceAll('-','').slice(0,12)}_${entry.attempts.length}`;
        requireThat(!await value(guard,indexSQL(name)),'FOREIGN_INDEX_NAME_COLLISION');
        attempt={name,expression,state:'intent'};entry.attempts.push(attempt);await save();
        requireThat(await value(builder,`select exists(select 1 from pg_stat_activity where pid=${guardIdentity.pid}
          and backend_start=${quoteLiteral(guardIdentity.backendStart)}::timestamptz and application_name=${quoteLiteral(guardIdentity.applicationName)}
          and datname=current_database() and state='idle in transaction' and backend_xmin is null) as value;`),'GUARD_HAS_OLD_SNAPSHOT');
        heartbeatError=undefined;
        timer=setInterval(()=>{
          // Queue exactly one heartbeat. No cursor or retained snapshot is used.
          heartbeatPromise=heartbeatPromise.then(async()=>{
            if (heartbeatError) return;
            try { requireThat(Date.now()-started<105000,'TARGET_DEADLINE_EXCEEDED');await guard.query("set local idle_in_transaction_session_timeout='15s';"); }
            catch(error){heartbeatError=error;await cancel();}
          }).catch(error=>{heartbeatError=error;});
        },BOUNDS.heartbeat);
        let buildError;
        building=true;
        try { await builder.query(`create index concurrently ${quoteIdentifier(name)} on public.${quoteIdentifier(target.name)} using gin ((${target.spec.scan_expression}) ${quoteIdentifier(plan.catalog.extension.namespace)}.gin_trgm_ops);`); }
        catch(error){buildError=error;}
        finally {building=false;}
        await stopHeartbeat();
        const built=await value(guard,indexSQL(name));
        if (built) {validateIndex(built,target,expression,plan.catalog.extension);attempt.indexOid=built.oid;attempt.state=built.valid&&built.ready?'built':'invalid';await save();}
        if (buildError) throw buildError;
        requireThat(built?.valid && built.ready,'BUILD_NOT_VALID');
      }
      requireThat(Date.now()-started<105000,'TARGET_DEADLINE_EXCEEDED');
      same(await value(guard,targetSQL(target)),target,'TARGET_IDENTITY_OR_SPEC_DRIFT');
      same(await value(guard,catalogSQL),plan.catalog,'CATALOG_DRIFT');
      const built=await value(guard,indexSQL(attempt.name));validateIndex(built,target,expression,plan.catalog.extension,attempt.indexOid);
      requireThat(built.valid && built.ready,'BUILD_NOT_VALID');
      await builder.query("set statement_timeout='10s';");
      try {await builder.query(`analyze public.${quoteIdentifier(target.name)};`);} finally {await builder.query("set statement_timeout='90s';");}
      same(await value(guard,catalogSQL),plan.catalog,'CATALOG_DRIFT');
      await guard.query(`insert into private.platform_brand_reference_indexes_v1(table_oid,index_oid,row_schema,scan_expression,index_expression,environment)
        values (${target.oid},${attempt.indexOid},${json(target.spec.row_schema)},${quoteLiteral(target.spec.scan_expression)},${quoteLiteral(expression)},${json(plan.catalog.environment)});`);
      requireThat(await value(guard,`select private.platform_brand_index_expression_v1(${target.oid})=${quoteLiteral(target.spec.scan_expression)} as value;`),'REGISTRATION_GATE_REJECTED');
      await guard.query('commit;');inTransaction=false;attempt.state='registered';entry.status='complete';await save();
    }
    journal.status='complete';await save();return {plan,journal,status:'complete'};
  } catch(error) {
    clearInterval(timer); await heartbeatPromise;
    await cancel().catch(()=>{});
    if(inTransaction && guard)await guard.query('rollback;').catch(()=>{});
    const code=/^[A-Z0-9_]+$/.test(error.message)?error.message:'DATABASE_OPERATION_FAILED';
    if(journal){journal.status='failed';journal.error={code,sqlstate:/^[0-9A-Z]{5}$/.test(error.sqlstate??'')?error.sqlstate:null};await save();}
    throw new Error(code);
  } finally {
    clearInterval(timer);
    const sessions=[['guard',guard],['builder',builder]].filter(([,session])=>session);
    const closed=await Promise.allSettled(sessions.map(async([,session])=>session.end()));
    const failedSessions=closed.flatMap((result,index)=>result.status==='rejected'?[sessions[index][0]]:[]);
    if(failedSessions.length){
      if(journal){
        journal.cleanupFailure={priorStatus:journal.status,failedSessions};
        journal.status='cleanup_failed';
        // Preserve the original operation failure when cleanup also fails.
        journal.error??={code:'OWNED_SESSION_CLEANUP_FAILED',sqlstate:null};
        await save();
      }
      throw new Error('OWNED_SESSION_CLEANUP_FAILED');
    }
  }
}

function durableWrite(path, object) {
  const temporary=path+'.'+randomUUID()+'.tmp';const fd=openSync(temporary,'wx',0o600);
  try{writeSync(fd,JSON.stringify(object,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
  renameSync(temporary,path);const directory=openSync(dirname(path),'r');try{fsyncSync(directory);}finally{closeSync(directory);}
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2), options={};
  for(let i=0;i<args.length;i+=2){requireThat(['--adapter','--mode','--plan','--journal','--resume-invalid'].includes(args[i])&&args[i+1]!==undefined,'INVALID_ARGUMENT');requireThat(!Object.hasOwn(options,args[i]),'DUPLICATE_ARGUMENT');options[args[i]]=args[i+1];}
  for(const key of ['--adapter','--plan','--journal'])requireThat(isAbsolute(options[key]??''),'ABSOLUTE_PATH_REQUIRED');
  const mode=options['--mode']??'plan';requireThat(!options['--resume-invalid']||options['--resume-invalid']==='true','INVALID_RESUME_OPTION');
  requireThat(options['--plan']!==options['--journal'],'DISTINCT_EVIDENCE_PATHS_REQUIRED');
  if(mode==='plan')requireThat(!existsSync(options['--plan'])&&!existsSync(options['--journal']),'EXISTING_PLAN_REQUIRES_RECONCILIATION');
  const adapterModule=await import(pathToFileURL(options['--adapter']).href);
  const adapter=await adapterModule.createAdapter();
  try {
    const result=await runBrandReferenceIndexInstaller({adapter,mode,resumeInvalid:options['--resume-invalid']==='true',
      ...(mode==='apply'?{plan:JSON.parse(readFileSync(options['--plan'],'utf8')),journal:JSON.parse(readFileSync(options['--journal'],'utf8'))}:{}),
      checkpoint:async({plan,journal})=>{durableWrite(options['--plan'],plan);durableWrite(options['--journal'],journal);}});
    console.log(JSON.stringify({status:result.status,plannedTables:result.plan.targets.length,completedTables:Object.values(result.journal.tables).filter(t=>t.status==='complete').length}));
  }finally{await adapter.closeAll?.();}
}
