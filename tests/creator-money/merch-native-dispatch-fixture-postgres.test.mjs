import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {runMerchCheckoutDispatchRaces} from '../../scripts/lib/merch-checkout-dispatch-races.mjs';

test('all native checkout fixture SQL executes on full schema; serialized adapter is not contention proof',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,includeHeldStudio:true,implicitApiGrants:false});
 try{
  await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
  await db.exec(readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
  const actors=(await db.query("select jsonb_object_agg(kind,jsonb_build_object('id',user_id,'session',session_id)) as actors from event_reservation_fixture.actors")).rows[0].actors;
  const lit=value=>`'${String(value).replaceAll("'","''")}'`;
  const json=value=>`${lit(JSON.stringify(value))}::jsonb`;
  const auth=(who='creator',role='authenticated')=>`set local role ${role};set local request.jwt.claims=${json({role,sub:actors[who].id,session_id:actors[who].session}).replace(/::jsonb$/u,'')};set local request.headers='{"x-chillywood-platform":"ios"}';`;
  const query=async sql=>(await db.exec(sql)).flatMap(result=>result.rows??[]).map(row=>{
   const value=Object.values(row)[0];return typeof value==='object'&&value!==null?JSON.stringify(value):String(value??'');
  }).filter(Boolean).join('\n');
  const parsed=text=>JSON.parse(text.split('\n').findLast(line=>line.startsWith('{')||line.startsWith('[')));
  const rpc=async(sql,role='service_role',who='creator')=>parsed(await query(`begin;${auth(who,role)}select ${sql};commit;`));
  const schedules=[];
  const race=async(label,first,second,{afterBlocked=''}={})=>{
   schedules.push(label);
   // This validates every literal/RPC fixture against production schema only.
   // The registered native runner still independently requires two live
   // PostgreSQL connections and observed pg_blocking_pids before afterBlocked.
   const firstResult=parsed(await query(`begin;${first}${afterBlocked}commit;`));
   const secondResult=parsed(await query(`begin;${second}commit;`));
   return {first:firstResult,second:secondResult};
  };
  await runMerchCheckoutDispatchRaces({query,rpc,race,auth,actors,lit,json});
  assert.equal(schedules.length,6);
  assert.ok(schedules.some(name=>name.includes('retained webhook')));
  assert.ok(schedules.some(name=>name.includes('retained reservation')));
 }finally{await db.close();}
});
