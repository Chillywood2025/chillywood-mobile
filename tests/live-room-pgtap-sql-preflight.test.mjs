import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {pgtapSQLPreflight} from './helpers/pgtap-sql-preflight.mjs';
test('full-schema SQL preflight retains historical Party/Live/Event pgTAP behavior after versioned API cutover', {timeout:180000},async()=>{
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
  try {
    await db.exec(pgtapSQLPreflight);
    // Assertion adapter only: compare ordered record values, not SELECT column
    // aliases. Application SQL and every role/RLS check remain unchanged.
    await db.exec(`create function extensions.results_eq(actual_sql text,expected_sql text,description text)
      returns text language plpgsql as $$declare actual text[]; expected text[];
      begin
        execute format('select array_agg(result::text) from (%s) result',actual_sql) into actual;
        execute format('select array_agg(result::text) from (%s) result',expected_sql) into expected;
        return extensions.is(actual,expected,description);
      end$$;`);
    await db.query('select extensions.results_eq($1,$2,$3)',[
      "select 'same'::text as actual_title","values ('same'::text)",'adapter compares values without alias dependence']);
    await assert.rejects(db.query('select extensions.results_eq($1,$2,$3)',[
      "select 'different'::text","values ('same'::text)",'changed value negative control']),/assertion failed/);
    await assert.rejects(db.query('select extensions.results_eq($1,$2,$3)',[
      "values ('a'::text),('b'::text)","values ('b'::text),('a'::text)",'changed order negative control']),/assertion failed/);
    for(const name of ['party_room_audience_discovery_test.sql','pre_activation_discovery_event_authority_test.sql',
      'seat_notification_activity_test.sql','chilly_chat_room_authority_closure_test.sql',
      'watch_party_room_host_block_check_test.sql','live_room_creation_authority_decouple_test.sql',
      'discovery_scoped_invalidation_test.sql','notifications_realtime_publication_test.sql',
      'wave1_session_not_after_authority_test.sql','room_host_participant_block_check_test.sql',
      'party_room_live_stage_event_ux_rfgc_test.sql']) {
      const source=fs.readFileSync(`supabase/tests/${name}`,'utf8').replace(/create extension if not exists pgtap with schema extensions;/gi,'');
      const results=await db.exec(source);
      const assertions=results.flatMap(r=>r.rows??[]).flatMap(Object.values).filter(v=>typeof v==='string'&&v.startsWith('ok '));
      const planned=source.match(/select plan\((\d+)\)/i)?.[1];
      if(planned) assert.equal(assertions.length,Number(planned),`${name}: exact planned assertions ran`);
      else if(name==='party_room_live_stage_event_ux_rfgc_test.sql') assert.equal(assertions.length,27,
        `${name}: all inventoried no-plan assertions ran`);
      else assert.ok(assertions.length>=30,`${name}: actual assertions ran (${assertions.length})`);
      console.log(`${name}: ${assertions.length} SQL assertions preflight; native pgTAP NOT claimed`);
    }
  }finally{await db.close();}
});
