import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('broadcast producer and terminal recovery execute real authority SQL with immutable original deadline and negative controls', {timeout:240_000}, async t => {
  const {db}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false});
  try {
    await db.exec(fs.readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
    await db.exec(fs.readFileSync('tests/fixtures/event-broadcast-producer-authority.sql','utf8'));
    const rows=(await db.query('select label from event_reservation_fixture.broadcast_assertions order by label')).rows;
    assert.equal(rows.length,33);
    t.diagnostic(`${rows.length} actual SQL assertions; synthetic trusted approval/provider receipt inputs, no external action`);
  } catch(error) {if(error.where)error.message+=`\n${error.where}`;throw error;} finally {await db.close();}
});
