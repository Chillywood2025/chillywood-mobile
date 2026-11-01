import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('creator explicitly accepts exact current fee terms in their own current session only',{timeout:240000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 try {
  await db.exec(fs.readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
  const actors=(await db.query('select * from event_reservation_fixture.actors')).rows;
  const creator=actors.find(a=>a.kind==='creator'),buyer=actors.find(a=>a.kind==='buyer1');
  const login=async(a,sid=a.session_id)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[JSON.stringify({role:'authenticated',sub:a.user_id,session_id:sid})]);await db.exec('set role authenticated');};
  await login(creator);
  const read=()=>one('select public.get_creator_fee_policy_status()');
  const initial=await read();assert.equal(initial.accepted,false);assert.equal(initial.bankDebitAllowed,false);assert.equal(initial.negativeAdjustmentCents,0);
  const accept=(version=initial.version,hash=initial.termsSha256)=>one('select public.accept_creator_fee_policy($1,$2)',[version,hash]);
  await assert.rejects(accept('old'),/terms_changed/);await assert.rejects(accept(initial.version,'0'.repeat(64)),/terms_changed/);
  assert.equal((await accept()).accepted,true);assert.equal((await accept()).accepted,true);
  await db.exec('reset role');assert.equal(await one('select count(*)::int from private.commerce_creator_fee_acceptances'),1);
  await login(buyer);assert.equal((await read()).accepted,false,'acceptance never leaks to another creator');
  await login(creator,randomUUID());await assert.rejects(read(),/current_session_required/);await assert.rejects(accept(),/current_session_required/);
  await db.exec('reset role');
  for(const role of ['anon','authenticated','service_role']){
   await db.exec(`set role ${role}`);
   await assert.rejects(db.query('select * from private.commerce_creator_fee_acceptances'),/permission denied/);
   await assert.rejects(db.query('truncate private.commerce_creator_fee_acceptances'),/permission denied/);
   if(role!=='authenticated')await assert.rejects(read(),/permission denied/);
   await db.exec('reset role');
  }
  await assert.rejects(db.exec('delete from private.commerce_creator_fee_acceptances'),/immutable/);
 }finally{await db.close();}
});
