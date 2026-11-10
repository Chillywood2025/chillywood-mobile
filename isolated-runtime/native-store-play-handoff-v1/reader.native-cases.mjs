import assert from 'node:assert/strict';
import {playPrivateStateTables,playPrivateStateModuleSQL,playPrivateStateReadSQL,validatePlayPrivateState} from './private-state-readback.mjs';
import {runPlayPrivateStateContractCases} from './reader.contract-cases.mjs';
const bounded="begin isolation level repeatable read read only;set local statement_timeout='5s';set local transaction_timeout='5s';set local lock_timeout='1s';";
const select='select public.native_store_play_private_state_v1();';
const asUser=(x,user,sql)=>{const result=x.run('psql',x.args(x.db,user),sql);assert.equal(result.status,0,result.stderr||result.error?.message);return result.stdout.trim();};
const rejectUser=(x,user,sql,pattern)=>{const result=x.run('psql',x.args(x.db,user),sql);assert.notEqual(result.status,0);assert.match(result.stderr,pattern);};
const read=x=>JSON.parse(asUser(x,'supabase_read_only_user',playPrivateStateReadSQL));
export function runPlayPrivateStateInitialCases(x){
 const {q}=x,names=[];const test=(name,body)=>{body();names.push(name);};
 const contractCases=runPlayPrivateStateContractCases();
 test('reader installs under managed owner with exact EXECUTE-only observer ACL and no capability leak',()=>{
  asUser(x,'postgres','begin;'+playPrivateStateModuleSQL()+'commit;');
  const metadata=JSON.parse(q(`select jsonb_build_object('owner',p.proowner::regrole::text,'securityDefiner',p.prosecdef,'volatility',p.provolatile,
   'config',p.proconfig,'arguments',p.pronargs,'result',p.prorettype::regtype::text,
   'acl',(select jsonb_agg(jsonb_build_array(a.grantor::regrole::text,a.grantee::regrole::text,a.privilege_type,a.is_grantable)
    order by a.grantee::regrole::text collate "C") from aclexplode(p.proacl) a))
   from pg_proc p where p.oid='public.native_store_play_private_state_v1()'::regprocedure;`));
  assert.deepEqual(metadata,{owner:'sbx_v1_core_owner',securityDefiner:true,volatility:'s',config:['search_path=""'],arguments:0,result:'jsonb',
   acl:[['sbx_v1_core_owner','sbx_v1_core_owner','EXECUTE',false],['sbx_v1_core_owner','supabase_read_only_user','EXECUTE',false]]});
  assert.equal(q("select has_schema_privilege('sbx_v1_core_owner','public','CREATE');"),'f');
  assert.equal(q("select count(*) from pg_auth_members m where m.roleid='sbx_v1_core_owner'::regrole and m.member='postgres'::regrole and (m.set_option or m.inherit_option);"),'0');
 });
 test('genuine bounded read-only connection observes exactly default-off state and nine empty booleans',()=>{
  const observed=read(x);assert.equal(observed.controlPresent,true);assert.equal(observed.handoffEnabled,false);
  assert.deepEqual(observed.empty,Object.fromEntries(playPrivateStateTables.map(t=>[t,true])));
  assert.equal(validatePlayPrivateState(observed).defaultOffAndEmptyObserved,true);
 });
 test('privileged callers, role-spoofing, wrong transaction context and unbounded deadlines reject',()=>{
  for(const role of ['anon','authenticated','service_role','postgres'])x.rejected(`set role ${role};${select}`,/permission denied/u);
  x.rejected(bounded+'set local role supabase_read_only_user;'+select+'rollback;',/play_private_read_context_required/u);
  for(const prefix of ["begin;set local statement_timeout='5s';set local transaction_timeout='5s';",
   "begin read only;set local statement_timeout='5s';set local transaction_timeout='5s';",
   "begin isolation level repeatable read read only;set local statement_timeout='0';set local transaction_timeout='5s';",
   "begin isolation level repeatable read read only;set local statement_timeout='5s';set local transaction_timeout='0';",
   "begin isolation level repeatable read read only;set local statement_timeout='6s';set local transaction_timeout='5s';",
   "begin isolation level repeatable read read only;set local statement_timeout='5s';set local transaction_timeout='6s';"])
   rejectUser(x,'supabase_read_only_user',prefix+select+'rollback;',/play_private_read_context_required/u);
  q('alter role supabase_read_only_user createrole;');
  try{rejectUser(x,'supabase_read_only_user',playPrivateStateReadSQL,/play_private_read_context_required/u);}finally{q('alter role supabase_read_only_user nocreaterole;');}
 });
 test('new reader gives no direct table read or owner-membership capability',()=>{
  for(const table of ['native_store_play_handoff_control',...playPrivateStateTables]){
   rejectUser(x,'supabase_read_only_user',bounded+`select * from sandbox_commerce_v1.${table};rollback;`,/permission denied/u);
   assert.equal(q(`select has_table_privilege('supabase_read_only_user','sandbox_commerce_v1.${table}','SELECT');`),'f');
  }
  rejectUser(x,'supabase_read_only_user',bounded+'set local role sbx_v1_core_owner;rollback;',/permission denied/u);
 });
 test('reader distinguishes current enabled control and does not turn that observation into activation permission',()=>{
  q('update sandbox_commerce_v1.native_store_play_handoff_control set enabled=true;');
  try{const result=validatePlayPrivateState(read(x));assert.equal(result.handoffEnabled,true);assert.equal(result.defaultOffAndEmptyObserved,false);assert.equal(result.activationAllowed,false);}
  finally{q('update sandbox_commerce_v1.native_store_play_handoff_control set enabled=false;');}
  assert.equal(validatePlayPrivateState(read(x)).defaultOffAndEmptyObserved,true);
 });
 const definitionSha256=q("select encode(sha256(convert_to(pg_get_functiondef('public.native_store_play_private_state_v1()'::regprocedure),'UTF8')),'hex');");
 console.log(JSON.stringify({protocol:'native-store-play-private-reader-proof-v1',cases:names.length+contractCases,passed:names.length+contractCases,
  contractCases,names,definitionSha256,realPostgres:true,genuineReadOnlyConnection:true,rawTableGrants:false,productionInstalled:false,activationAllowed:false}));
 return names.length+contractCases;
}
export function runPlayPrivateStateOccupiedCase(x){
 const observed=read(x),result=validatePlayPrivateState(observed);
 assert.equal(observed.empty.native_store_play_handoff_setups,false);assert.equal(observed.empty.native_store_play_enrollments,false);
 assert.equal(observed.empty.native_store_play_allocations,false);assert.equal(result.allDataTablesEmpty,false);assert.equal(result.defaultOffAndEmptyObserved,false);
 assert.equal(result.activationAllowed,false);
 console.log(JSON.stringify({protocol:'native-store-play-private-reader-occupied-proof-v1',cases:1,passed:1,realPostgres:true,genuineReadOnlyConnection:true,rawDataReturned:false,activationAllowed:false}));
 return 1;
}
