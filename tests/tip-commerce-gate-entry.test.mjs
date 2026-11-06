import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';

const migration='20261106170725_tip_commerce_gate_entry.sql';
const signatures=[
  'public.record_creator_tip_checkout_session(uuid,uuid,uuid,text,text)',
  'public.reserve_creator_tip_checkout_attempt(uuid,uuid,uuid,jsonb)',
];

test('tip entry repair changes only the two exact function lock prefixes', {timeout:240_000}, async()=>{
  const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,
    includeHeldStudio:true,implicitApiGrants:false,excludeMigrations:[migration]});
  const read=async signature=>(await db.query(`select pg_get_functiondef(p.oid) definition,
    p.oid,p.proowner,p.proacl,p.prolang,p.prosecdef,p.provolatile,p.proisstrict,p.proparallel,
    p.proconfig,p.prorettype,p.proretset,p.proargtypes,p.proargnames,p.procost,p.prorows
    from pg_proc p where p.oid=$1::regprocedure`,[signature])).rows[0];
  try {
    const before=await Promise.all(signatures.map(read));
    const controls=(await db.query('select key,state from public.platform_money_kill_switches order by key')).rows;
    for(let i=0;i<signatures.length;i++){
      const unexpected=before[i].definition.replace('\nbegin\n','\nbegin\n  -- unexpected predecessor\n');
      await db.exec(unexpected);
      await assert.rejects(()=>db.exec(fs.readFileSync(`supabase/migrations/${migration}`,'utf8')),
        /tip_gate_entry_predecessor_changed/,'each changed predecessor independently rejects');
      await db.exec('rollback');
      for(let j=0;j<signatures.length;j++) assert.equal((await read(signatures[j])).definition,
        i===j?unexpected:before[j].definition,'a later-root rejection rolls back the earlier prefix');
      await db.exec(before[i].definition);
    }
    await db.exec(fs.readFileSync(`supabase/migrations/${migration}`,'utf8'));
    for(let i=0;i<signatures.length;i++){
      const after=await read(signatures[i]);
      const expected=before[i].definition.replace('\nbegin\n',
        '\nbegin\n  perform private.lock_ordinary_commerce_authority_gate();\n');
      assert.equal(after.definition,expected,`${signatures[i]} preserves every other body byte`);
      assert.deepEqual({...after,definition:null},{...before[i],definition:null},
        `${signatures[i]} retains OID, owner, ACL, execution and result attributes`);
    }
    assert.deepEqual((await db.query('select key,state from public.platform_money_kill_switches order by key')).rows,controls);
    await assert.rejects(()=>db.exec(fs.readFileSync(`supabase/migrations/${migration}`,'utf8')),
      /tip_gate_entry_predecessor_changed/,'unexpected or already-patched predecessor is rejected');
    await db.exec('rollback');
  } finally {await db.close();}
});
