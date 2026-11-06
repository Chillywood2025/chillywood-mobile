import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridgeDefinition,restoreDefinition,sha256,BRIDGE_PREFIX,SQL_BRIDGE_PREFIX,DRAIN_SQL} from './bridge.mjs';
import {contract,buildBridgeSql,buildFinalizeSql,buildRestoreSql,requireQualification,classifyState,functionStateSQL,executeMigrationsSQL,textChunks,sqlText,MAX_PHYSICAL_LINE_BYTES} from './prepare.mjs';
import {catalogHashSQL} from './catalog.mjs';

const pl=`CREATE OR REPLACE FUNCTION public.fixture(p_value integer DEFAULT 7)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE STRICT SECURITY DEFINER PARALLEL SAFE
 SET search_path TO ''
AS $function$
declare original integer:=p_value;
begin return original;exception when others then return 0;end;
$function$
`;
const sql=pl.replace('LANGUAGE plpgsql','LANGUAGE sql').replace(/\ndeclare[\s\S]*\$function\$\n$/u,'\nselect p_value;\n$function$\n');
test('bridge always fails before DECLARE or original handlers, without changing attributes',()=>{
 const b=bridgeDefinition(pl);assert.ok(b.includes(BRIDGE_PREFIX+'\ndeclare'));
 assert.ok(b.indexOf("raise exception 'automatic_commerce_cutover_retry'")<b.indexOf('declare original'));
 assert.equal(restoreDefinition(b),pl);
 assert.equal(b.slice(0,b.indexOf('AS $function$')),pl.slice(0,pl.indexOf('AS $function$')));
 assert.throws(()=>bridgeDefinition(b),/ALREADY_BRIDGED/);
});
test('SQL retains language, volatility and result, disables inlining with always-failing first statement',()=>{
 const b=bridgeDefinition(sql);assert.ok(b.includes(SQL_BRIDGE_PREFIX+'\nselect p_value;'));
 assert.equal(restoreDefinition(b),sql);
});
test('optional outer END semicolon becomes an exact reversible nested terminator',()=>{
 const source=pl.replace('end;\n$function$','end\n$function$'),bridge=bridgeDefinition(source);
 assert.match(bridge,/automatic_commerce_cutover_terminator/u);assert.equal(restoreDefinition(bridge),source);
 assert.throws(()=>bridgeDefinition(pl.replace('end;\n$function$','end; -- unreviewed trailing comment\n$function$')),/UNREVIEWED_PLPGSQL_TERMINATOR/);
});
test('unrecognized body formats and changed bridge enclosures fail closed',()=>{
 assert.throws(()=>bridgeDefinition(pl.replace('LANGUAGE plpgsql','LANGUAGE c')),/UNSUPPORTED_FUNCTION_LANGUAGE/);
 assert.throws(()=>bridgeDefinition(pl+'select 1;'),/ENCLOSURE_INVALID/);
 assert.throws(()=>restoreDefinition(bridgeDefinition(pl).replace("using errcode='55P03'","using errcode='XX000'")),/ENCLOSURE_MISMATCH/);
});
test('all thirteen execution transforms are exact outer wrappers; history stays original',()=>{
 assert.equal(contract.migrations.length,13);
 for(const m of contract.migrations){const source=fs.readFileSync(m.path,'utf8');assert.equal(sha256(source),m.sha256);assert.equal(Buffer.byteLength(source),m.bytes);
  const body=m.topLevelWrapper?source.slice(7,-8):source;assert.equal(sha256(body),m.bodySha256);assert.equal(Buffer.byteLength(body),m.bodyBytes);
  if(m.topLevelWrapper)assert.equal('begin;\n'+body+'commit;\n',source);
 }
 assert.equal(contract.history.count,586);assert.equal(contract.functions.length,407);assert.equal(contract.authorityRelations.length,15);
});
test('unqualified tooling cannot emit bridge, final, or restoration writes',()=>{
 const bundle={plan:{...contract,qualification:{status:'unqualified'}}};
 for(const fn of [requireQualification,buildBridgeSql,buildFinalizeSql,buildRestoreSql])assert.throws(()=>fn(bundle),/CUTOVER_NOT_QUALIFIED/);
});
test('committed qualification artifacts match their hashes and current native scope',()=>{
 for(const record of Object.values(contract.qualification)){
  if(!record?.artifact)continue;
  assert.ok(record.artifact.startsWith('ops/automatic-commerce-cutover/'));
  assert.equal(sha256(fs.readFileSync(record.artifact)),record.artifactSha256);
 }
 const proof=JSON.parse(fs.readFileSync('ops/automatic-commerce-cutover/qualification-native.json','utf8'));
 assert.equal(proof.native,true);assert.equal(proof.status,'passed');
 const full=proof.reports.find(r=>r.fixtureOnly===true);
 assert.equal(full.functions,contract.functions.length);assert.equal(full.migrations,contract.migrations.length);
 assert.equal(full.originalAffectedSha256,contract.catalog.originalSha256);
 assert.equal(full.finalAffectedSha256,contract.catalog.finalSha256);
 const currentHash=file=>sha256(fs.readFileSync(`ops/automatic-commerce-cutover/${file}`));
 assert.equal(full.generatorSourceSha256,currentHash('prepare.mjs'));
 assert.equal(full.catalogSourceSha256,currentHash('catalog.mjs'));
 assert.equal(full.sourceSha256,currentHash('test-full-native.mjs'));
 assert.equal(proof.reports.find(r=>r.bridgeSourceSha256).bridgeSourceSha256,currentHash('bridge.mjs'));
});
test('drain includes all virtual transactions, visibility, idle and prepared protection',()=>{
 assert.match(DRAIN_SQL,/pg_read_all_stats/);assert.match(DRAIN_SQL,/pg_stat_clear_snapshot/);
 assert.match(DRAIN_SQL,/locktype='virtualxid'/);assert.match(DRAIN_SQL,/max_prepared_transactions/);
 assert.doesNotMatch(DRAIN_SQL,/backend_type\s*=|state\s*=\s*'active'|backend_xid is not null/u);
 assert.doesNotMatch(DRAIN_SQL,/terminate_backend|cancel_backend|pg_sleep/u);
});
test('partial, different and failed-control readbacks cannot be mistaken for completion',()=>{
 const bundle={plan:{catalog:{originalSha256:'a',finalSha256:'b',untouchedSha256:'c',bridgeSha256:'d'}}};
 const common={schema:1,database:'postgres',project:contract.project,constants:true,operationGateHeld:true,originalHistory:true,controls:true,untouchedCatalogSha256:'c'};
 assert.equal(classifyState(bundle,{...common,baselineHistory:true,historyCount:586,originalFunctions:true,bridgeAbsent:true,affectedCatalogSha256:'a'}),'original');
 assert.equal(classifyState(bundle,{...common,baselineHistory:true,historyCount:586,bridgeFunctions:true,bridgePresent:true,affectedCatalogSha256:'d'}),'bridged');
 assert.throws(()=>classifyState(bundle,{...common,baselineHistory:true,historyCount:586,bridgeFunctions:true,bridgePresent:true}),/PARTIAL_OR_DIFFERENT/);
 assert.throws(()=>classifyState(bundle,{...common,baselineHistory:true,historyCount:586,bridgeFunctions:true,bridgePresent:true,affectedCatalogSha256:'wrong'}),/PARTIAL_OR_DIFFERENT/);
 assert.equal(classifyState(bundle,{...common,finalHistory:true,historyCount:599,bridgeAbsent:true,affectedCatalogSha256:'b'}),'applied');
 assert.throws(()=>classifyState(bundle,{...common,finalHistory:true,historyCount:597,bridgeAbsent:true,affectedCatalogSha256:'b'}),/PARTIAL_OR_DIFFERENT/);
 assert.throws(()=>classifyState(bundle,{...common,controls:false}),/READBACK_PRECONDITION/);
 assert.throws(()=>classifyState(bundle,{...common,constants:false}),/READBACK_PRECONDITION/);
 assert.throws(()=>classifyState(bundle,{...common,operationGateHeld:false}),/READBACK_PRECONDITION/);
 assert.throws(()=>classifyState(bundle,{...common,untouchedCatalogSha256:'wrong'}),/READBACK_PRECONDITION/);
});
test('compact predicates retain NULL failure, complete cardinality and ordered original history',()=>{
 const predicate=functionStateSQL({functions:[{}]},'original');
 assert.match(predicate,/left join pg_proc/u);assert.match(predicate,/is not true/u);
 assert.match(predicate,/jsonb_array_length\(cutover_functions\)=1/u);assert.match(predicate,/count\(distinct/u);
 assert.match(executeMigrationsSQL,/with ordinality/u);assert.match(executeMigrationsSQL,/order by e.position/u);
 assert.match(executeMigrationsSQL,/array\[migration.source\]::text\[\]/u);
 assert.ok(executeMigrationsSQL.indexOf('cutover_migration_constant_changed')<executeMigrationsSQL.indexOf('execute migration_body'));
 assert.throws(()=>functionStateSQL({functions:[]},'unsafe'),/FUNCTION_PHASE_INVALID/u);
 assert.throws(()=>catalogHashSQL({includeReference:'cutover_affected_keys;select 1'}),/REFERENCE_INVALID/u);
 assert.throws(()=>catalogHashSQL({include:[],includeReference:'cutover_affected_keys'}),/ONE_CATALOG_FILTER/u);
});
test('flat text chunks preserve Unicode, quote, dollar and exact boundary bytes',()=>{
 const samples=['',"quotes'' and \\\\ backslash\r\nline",'😺漢字e\u0301'.repeat(500),"'$automatic_cutover$ $function$ $$ $cutover_readback_gate$'",'x'.repeat(1799)+"'😺"+'y'.repeat(1801)];
 for(const source of samples){const chunks=textChunks(source);assert.equal(chunks.join(''),source);assert.deepEqual(Buffer.from(chunks.join('')),Buffer.from(source));
  assert.ok(chunks.every(chunk=>chunk==='$'||!chunk.includes('$')));
  assert.ok(chunks.every(chunk=>Buffer.byteLength(chunk.replaceAll("'","''"))<=1800));
  const expression=sqlText(source);assert.ok(expression.split(/\r\n|\r|\n/u).every(line=>Buffer.byteLength(line)<=MAX_PHYSICAL_LINE_BYTES));
  assert.doesNotMatch(expression,/\$automatic_cutover\$|\$function\$|\$cutover_readback_gate\$/u);
  assert.match(expression,/^pg_catalog\.array_to_string\(array\[/u);assert.doesNotMatch(expression,/\|\|/u);
 }
 assert.throws(()=>textChunks('\uD800'),/SQL_TEXT_INVALID/u);assert.throws(()=>textChunks('a\0b'),/SQL_TEXT_INVALID/u);
});
