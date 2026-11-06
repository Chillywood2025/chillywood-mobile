import assert from 'node:assert/strict';
import test from 'node:test';
import {createDatabase,splitSQL} from './helpers/database-runtime-authority-fixture.mjs';
import {pgtapSQLPreflight} from './helpers/pgtap-sql-preflight.mjs';
import {readPgtapSource} from './helpers/pgtap-source.mjs';

test('historical pgTAP controls retain Free buyers and canonical creator authority on current schema', {timeout:240000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
 try {
  // Supabase's managed Storage bootstrap enables RLS and grants table SELECT.
  // The column-only local managed-schema fixture omits both. Reproduce only
  // that managed baseline; all actual application policies remain intact.
  await db.exec('alter table storage.objects enable row level security; grant select on storage.objects to anon,authenticated;');
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='storage.objects'::regclass")).rows[0].relrowsecurity,true);
  await db.exec(pgtapSQLPreflight);
  await db.exec(`create function extensions.isnt(actual anyelement,expected anyelement,description text)
   returns text language sql as $$select extensions.ok(actual is distinct from expected,description)$$;
   create function extensions.has_table(schema_name text,table_name text,description text)
   returns text language sql as $$select extensions.ok(to_regclass(format('%I.%I',$1,$2)) is not null,$3)$$;`);
  const failures=[];
  for(const name of ['channel_subscription_price_requests','chilly_chat_room_authority_closure',
   'creator_money_authority_integrity_closeout','creator_video_protected_authority_closure',
   'platform_role_exact_subject_closure','revenuecat_atomic_transactions',
   'social_attachment_storage_policy_composition_closure','social_notification_video_access',
   'wave1_identity_entitlement_authority','wave1_session_not_after_authority']) {
   const source=readPgtapSource(`${name}_test.sql`); let assertions=0;
   try {
    for(const statement of splitSQL(source)) {
     const results=await db.exec(statement);
     assertions+=results.flatMap(r=>r.rows??[]).flatMap(Object.values).filter(v=>typeof v==='string'&&v.startsWith('ok ')).length;
    }
    const planned=source.match(/select plan\((\d+)\)/iu)?.[1];
    if(planned)assert.equal(assertions,Number(planned),`${name}: all planned assertions ran`);
    else assert.ok(assertions>=20,`${name}: actual no-plan controls ran`);
    console.log(`${name}: ${assertions} SQL assertions passed; native pgTAP NOT claimed`);
   } catch(error) {
    failures.push(`${name} after ${assertions} assertions: ${error.message}`);
    console.error(failures.at(-1));
    await db.exec('rollback; reset role;');
   }
  }
  assert.deepEqual(failures,[],'every historical regression SQL file must pass');
 } finally {await db.close();}
});
