// Native outcome selection and current SQL controls. No sequential adapter
// claims to establish independent PostgreSQL backends or a blocking edge.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {nativeSetupDatabase,nativeSource,nativeVariables,nativeFunction,executeNativeSetup} from './helpers/native-runner-setup-preflight.mjs';

const file='scripts/lib/ordinary-native-dispatch-races.mjs';
const source=nativeSource(file);
const predicate=[source.match(/const isBuyerChange=[^;]+;/u)?.[0],source.match(/const expectError=[^;]+;/u)?.[0]].join('\n');
const expectsError=(kind,label,mutationFirst,sequentialReplay)=>vm.runInNewContext(predicate+'\nexpectError;',{kind,label,mutationFirst,sequentialReplay});

test('native mutation error contract preserves early identity denial versus final source denial',()=>{
 assert.ok(predicate);
 for(const sequentialReplay of [false,true])for(const mutationFirst of [false,true]){
  for(const kind of ['subscription','event'])for(const label of ['free buyer ban','free buyer session revocation','new buyer deletion request','buyer profile role change'])
   assert.equal(expectsError(kind,label,mutationFirst,sequentialReplay),mutationFirst,`${kind}: ${label}`);
  assert.equal(expectsError('merch','new buyer deletion request',mutationFirst,sequentialReplay),mutationFirst,'deletion has the same exact SQL denial in native and sequential execution');
  assert.equal(expectsError('merch','free buyer ban',mutationFirst,sequentialReplay),mutationFirst,'account writer now enters the canonical prefix before the actor check');
  for(const label of ['free buyer session revocation'])
   assert.equal(expectsError('merch',label,mutationFirst,sequentialReplay),mutationFirst,`${label}: gate-first identity loss produces the exact early SQL denial`);
  for(const label of ['buyer profile role change','canonical seller Premium expiration','seller ban','creator suspension','feature control disabled'])
   assert.equal(expectsError('merch',label,mutationFirst,sequentialReplay),false,`${label}: preserve exact JSON outcome`);
 }
});

test('actual native adapter rejects missing fence, missing blocker, same backend and wrong SQL outcome mutants',async()=>{
 const body=nativeFunction(nativeSource('scripts/test-merch-return-cases-concurrency-postgres.mjs'),'race');
 const compile=Function('assert','session','until','query','lit','parsed','console','let checks=0;'+body+';return race;');
 const control=async({lockCount='1',blocked='1',sameBackend=false,blockers=[11],exit=3,
  stderr='ERROR:  merch_current_session_required\nCONTEXT:  PL/pgSQL function private.assert_merch_checkout_actor(uuid,uuid) line 9 at RAISE\n'}={})=>{
  let sessions=0;
  const session=()=>{const holder=sessions++===0;return {name:holder?'holder':'waiter',output:()=>holder?'HOLDER_READY':'',
   child:{stdin:{end(){}}},done:Promise.resolve({code:holder?0:exit,stdout:holder?'{}':'NO_JSON_ON_REJECTION',stderr})};};
  const query=sql=>sql.includes('from pg_locks w join pg_locks h')?lockCount:sql.includes('jsonb_build_object')
   ?JSON.stringify({holderPid:11,waiterPid:sameBackend?11:12,blockers,waitEvent:'advisory'}):blocked;
  const race=compile(assert,session,async predicate=>assert.equal(predicate(),true),query,value=>`'${value}'`,JSON.parse,{log(){}});
  const result=await race('source-only adapter assertion control','select 1;','select 2;',{error:/merch_current_session_required/u,retentionFence:true});
  assert.equal(result.second,null,'SQL rejection never gets manufactured JSON');
 };
 await control();
 for(const mutation of [{lockCount:'0'},{blocked:'0'},{sameBackend:true},{blockers:[]},{exit:0},{stderr:'ERROR: unrelated_failure\n'},
  {stderr:'ERROR: merch_current_session_required_extra\nCONTEXT: PL/pgSQL function private.assert_merch_checkout_actor(uuid,uuid) line 9 at RAISE\n'},
  {stderr:'ERROR: merch_current_session_required\nCONTEXT: PL/pgSQL function unrelated_guard(uuid,uuid) line 9 at RAISE\n'}])
  await assert.rejects(control(mutation),assert.AssertionError);
});

test('actual full-row buyer-denial assertion rejects every economic snapshot mutation',async()=>{
 const statement=source.split('\n').find(line=>line.includes("'buyer denial preserves full product/order/dispatch/grant/earning rows'"));assert.ok(statement);
 const check=Object.getPrototypeOf(async function(){}).constructor('assert','query','buyerSnapshotSql','buyerSnapshot',statement);
 const before={product:{reserved_quantity:1},order:{payment_status:'pending'},dispatch:{state:'prepared'},grants:[],ledger:[]};
 const encoded=JSON.stringify(before);
 await check(assert,async()=>encoded,'actual native snapshot SQL',encoded);
 for(const field of Object.keys(before)){
  const changed=JSON.stringify({...before,[field]:{unauthorized_change:true}});
  await assert.rejects(check(assert,async()=>changed,'actual native snapshot SQL',encoded),assert.AssertionError,field);
 }
});

test('deletion and sibling buyer guards retain exact current catalog and no financial side effects',{timeout:180000},async()=>{
 const db=nativeSetupDatabase();
 const lit=value=>`'${String(value).replaceAll("'","''")}'`;
 const query=db.query;
 const definition=signature=>query(`select pg_get_functiondef(${lit(signature)}::regprocedure)`);
 const before=(body,a,b)=>{assert.ok(body.includes(a),a);assert.ok(body.indexOf(b)>body.indexOf(a),`${a} before ${b}`);};
 try{
  const transition=definition('public.transition_merch_checkout_dispatch(uuid,uuid,uuid,text,jsonb)');
  before(transition,'perform private.lock_ordinary_commerce_authority_gate();','perform private.platform_brand_retention_lock();');
  before(transition,'perform private.platform_brand_retention_lock();','perform private.assert_merch_checkout_actor');
  before(transition,'perform private.assert_merch_checkout_actor','perform private.lock_ordinary_commerce_dispatch_subjects');
  before(transition,'perform private.lock_ordinary_commerce_dispatch_subjects','perform 1 from public.merch_products');
  before(transition,'private.ordinary_commerce_buyer_current',"update private.merch_checkout_dispatch set state='dispatched'");
  assert.match(definition('private.assert_merch_checkout_actor(uuid,uuid)'),/whole_app_exact_current_session_authority_internal\(\)[\s\S]+raise exception 'merch_current_session_required'/u);
  const triggers=JSON.parse(query("select jsonb_agg(jsonb_build_object('name',t.tgname,'function',t.tgfoid::regprocedure::text,'definition',pg_get_triggerdef(t.oid)) order by t.tgname) from pg_trigger t where t.tgrelid='public.account_deletion_requests'::regclass and not t.tgisinternal"));
  assert.ok(triggers.some(row=>row.name==='serialize_stripe_tip_buyer_authority_deletion'));
  const gate=triggers.find(row=>row.name==='aaa_ordinary_commerce_writer_gate');assert.ok(gate);
  assert.match(gate.definition,/BEFORE INSERT OR DELETE OR UPDATE ON public.account_deletion_requests/u);
  assert.match(definition(gate.function),/private.lock_ordinary_commerce_authority_gate\(\)/u);
  assert.match(definition('private.lock_ordinary_commerce_authority_gate()'),/pg_advisory_xact_lock\(176214,32\)/u);
  const retention=triggers.find(row=>row.name==='zzz_deleted_media_reference_guard');assert.ok(retention);
  assert.match(retention.definition,/BEFORE INSERT OR UPDATE ON public.account_deletion_requests/u);
  assert.match(definition(retention.function),/perform pg_catalog.pg_advisory_xact_lock\(176214,30\)/u);
  assert.match(definition('private.platform_brand_retention_lock()'),/perform pg_advisory_xact_lock\(176214,30\)/u);
  await executeNativeSetup(file,source,[nativeVariables(source,['db','parse','claims','rpc','setup','mutations'])],{
   query,overrides:{lit,inspect:async({setup,mutations,parse})=>{
    for(const label of ['free buyer ban','free buyer session revocation','new buyer deletion request','buyer profile role change']){
     const f=await setup('merch'),mutation=mutations.find(([name])=>name===label)[1];
     const snapshotSql=vm.runInNewContext(nativeVariables(source,['buyerSnapshotSql'])+'\nbuyerSnapshotSql;',{kind:'merch',mutationFirst:true,isBuyerChange:label!=='buyer profile role change',label,f,lit});
     const snapshot=()=>query(snapshotSql);
     const original=snapshot();
     query(mutation(f));
     if(label==='buyer profile role change')assert.equal(parse(query('begin;'+f.dispatch(f.attempt)+'commit;')).authorized,false);
     else assert.throws(()=>query('begin;'+f.dispatch(f.attempt)+'commit;'),{message:'merch_current_session_required'},label);
     assert.equal(query(f.marker),'0',label);assert.equal(snapshot(),original,`${label}: denied transition changes no product/order/dispatch/grant/earning row`);
    }
   }},tail:'await inspect({setup,mutations,parse});',
  });
 }finally{await db.close();}
});
