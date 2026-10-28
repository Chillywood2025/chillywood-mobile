import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('ticket delivery requires an opened verified show and preserves actual delivery across recovery', {timeout:600_000}, async t=>{
  const {db,replayReport}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false});
  try {
    await db.exec(fs.readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
    await db.exec(fs.readFileSync('tests/fixtures/event-broadcast-producer-authority.sql','utf8'));
    await db.exec(fs.readFileSync('tests/fixtures/event-ticket-delivery-policy.sql','utf8'));
    const assertions=(await db.query('select label from event_reservation_fixture.delivery_assertions order by label')).rows;
    assert.equal(assertions.length,22);
    t.diagnostic(`${assertions.length} independent delivery SQL assertions; ${replayReport.files.length} migration files; ${replayReport.skipped.length} managed-infrastructure substitutions; synthetic provider envelopes only`);
  } catch(error) {if(error.where)error.message+=`\n${error.where}`;throw error;} finally {await db.close();}
});
