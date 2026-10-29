import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

const migration='20261027085819_creator_event_ticket_schedule_policy.sql';
const dependentMigration='20261027094021_creator_event_replay_deadline_remedy.sql';
const lockOrderMigration='20261028214433_creator_replay_observation_lock_order.sql';
const commitOrderMigration='20261029044327_creator_replay_observation_commit_order.sql';
test('policy migration preserves real pre-policy delivered, unknown and explicit remedy history', {timeout:600_000}, async t=>{
  const {db,replayReport}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false,excludeMigrations:[migration,dependentMigration,lockOrderMigration,commitOrderMigration]});
  try {
    await db.exec(fs.readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
    await db.exec(fs.readFileSync('tests/fixtures/event-broadcast-producer-authority.sql','utf8'));
    const shared=fs.readFileSync('tests/fixtures/event-ticket-delivery-policy.sql','utf8');
    const marker='-- Delivery scenario assertions begin.';
    assert.equal(shared.split(marker).length,2,'shared setup boundary must remain unambiguous');
    await db.exec(shared.split(marker)[0]);
    await db.exec(fs.readFileSync('tests/fixtures/event-ticket-policy-transition-before.sql','utf8'));
    await db.exec(fs.readFileSync(`supabase/migrations/${migration}`,'utf8'));
    await db.exec(fs.readFileSync(`supabase/migrations/${dependentMigration}`,'utf8'));
    await db.exec(fs.readFileSync(`supabase/migrations/${lockOrderMigration}`,'utf8'));
    await db.exec(fs.readFileSync(`supabase/migrations/${commitOrderMigration}`,'utf8'));
    await db.exec(fs.readFileSync('tests/fixtures/event-ticket-policy-transition-after.sql','utf8'));
    const rows=(await db.query('select label from event_reservation_fixture.transition_assertions order by label')).rows;
    assert.equal(rows.length,24);
    const definition=(await db.query(`select pg_get_functiondef('private.creator_event_ticket_policy(uuid,uuid,jsonb)'::regprocedure) as definition`)).rows[0].definition;
    assert.equal(definition.match(/start_at>=observed_from/gu)?.length,2,'both protection intervals require whole-window observation');
    await db.exec('begin');
    try {
      await db.exec(definition.replaceAll('start_at>=observed_from','deadline>=observed_from'));
      await db.exec(`do $$ declare old event_reservation_fixture.policy_transition_context;policy jsonb;begin
        select * into strict old from event_reservation_fixture.policy_transition_context where label='delivered_past_deadline';
        alter table private.creator_event_ticket_policy_observation disable trigger creator_event_ticket_policy_observation_immutable;
        update private.creator_event_ticket_policy_observation set started_at=(old.original_terms->>'startsAt')::timestamptz+interval '10 minutes' where singleton;
        alter table private.creator_event_ticket_policy_observation enable trigger creator_event_ticket_policy_observation_immutable;
        perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',old.context->>'buyerId','session_id',old.context->>'buyerSession')::text,true);
        policy:=public.read_my_creator_event_ticket_policy((old.context->>'eventId')::uuid,(old.context->>'intentId')::uuid);
        if not coalesce(policy->'refundEligibility'->'reasons' ? 'event_no_show',false)
        then raise exception 'negative control failed to detect partial-window false no-show'; end if;
      end;$$;`);
    } finally {await db.exec('rollback');}
    assert.equal((await db.query(`select pg_get_functiondef('private.creator_event_ticket_policy(uuid,uuid,jsonb)'::regprocedure) as definition`)).rows[0].definition,definition,'negative control restores exact production function');
    t.diagnostic(`${rows.length} actual migration-transition SQL assertions plus partial-window mutation negative control; real old purchase/open/end/provider projectors; restored temporal fixture epoch; ${replayReport.skipped.length} managed-infrastructure substitutions`);
  } catch(error) {if(error.where)error.message+=`\n${error.where}`;throw error;} finally {await db.close();}
});
