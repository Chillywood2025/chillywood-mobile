import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {pgtapSQLPreflight} from './helpers/pgtap-sql-preflight.mjs';
test('full-schema SQL preflight retains historical Party/Live/Event pgTAP behavior after versioned API cutover', {timeout:180000},async()=>{
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
  try {
    await db.exec(pgtapSQLPreflight);
    for(const name of ['party_room_audience_discovery_test.sql','pre_activation_discovery_event_authority_test.sql',
      'seat_notification_activity_test.sql','chilly_chat_room_authority_closure_test.sql',
      'watch_party_room_host_block_check_test.sql','live_room_creation_authority_decouple_test.sql']) {
      const source=fs.readFileSync(`supabase/tests/${name}`,'utf8').replace(/create extension if not exists pgtap with schema extensions;/gi,'');
      const results=await db.exec(source);
      const assertions=results.flatMap(r=>r.rows??[]).flatMap(Object.values).filter(v=>typeof v==='string'&&v.startsWith('ok '));
      const planned=source.match(/select plan\((\d+)\)/i)?.[1];
      if(planned) assert.equal(assertions.length,Number(planned),`${name}: exact planned assertions ran`);
      else assert.ok(assertions.length>=30,`${name}: actual assertions ran (${assertions.length})`);
      console.log(`${name}: ${assertions.length} SQL assertions preflight; native pgTAP NOT claimed`);
    }
  }finally{await db.close();}
});
