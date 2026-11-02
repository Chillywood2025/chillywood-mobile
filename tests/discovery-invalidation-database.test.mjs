import test from 'node:test';
import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from './helpers/database-runtime-authority-fixture.mjs';
import { seedLiveRoomActor } from './helpers/live-room-authority-fixture.mjs';

test('canonical scoped discovery outbox: authority, producer, atomic dispatch, retries and deadlines', { timeout: 120_000 }, async () => {
  let databaseFactory;
  if (process.env.NATIVE_PG_ADAPTER) {
    assert.ok(isAbsolute(process.env.NATIVE_PG_ADAPTER), 'native adapter must be an explicit local path');
    ({databaseFactory} = await import(pathToFileURL(process.env.NATIVE_PG_ADAPTER).href));
  }
  const { db } = await createDatabase({ includeHeldStudio: true, applyRepair: true, databaseFactory });
  const owner = '9d280000-0000-4000-8000-000000000001';
  const session = '9d280001-0000-4000-8000-000000000001';
  const item = '9d280000-0000-4000-8000-000000000002';
  const event = '9d280000-0000-4000-8000-000000000003';
  const scalar = async sql => Object.values((await db.query(sql)).rows[0])[0];
  const flush = () => scalar('select public.flush_discovery_invalidations(100)');
  const clear = () => db.exec(`truncate private.discovery_invalidation_outbox,private.discovery_invalidation_scope_dispatch,realtime.fixture_outbox`);
  const ready = () => db.exec(`update private.discovery_invalidation_outbox set available_at=clock_timestamp()-interval '1 second'; truncate private.discovery_invalidation_scope_dispatch`);
  try {
    await db.exec(`alter table realtime.messages alter column id type uuid using null::uuid;
      alter table realtime.messages alter column id set default gen_random_uuid();
      alter table realtime.messages alter column inserted_at type timestamp without time zone using inserted_at at time zone 'UTC';
      alter table realtime.messages alter column inserted_at set default timezone('utc',clock_timestamp());
      create index messages_inserted_at_topic_index on realtime.messages(inserted_at desc,topic)
        where extension='broadcast' and private is true`);
    // Match the observed managed send contract: generated TABLE id is separate,
    // supplied payload id is preserved, missing payload id is injected, and
    // insertion errors are swallowed. Managed schema remains a local double.
    await db.exec(`create or replace function realtime.send(jsonb,text,text,boolean) returns void language plpgsql as $$
      declare final_payload jsonb; begin begin
        final_payload:=case when $1 ? 'id' then $1 else jsonb_set($1,'{id}',to_jsonb(gen_random_uuid())) end;
        insert into realtime.messages(payload,event,topic,private,extension)
          values(final_payload,$2,$3,$4,'broadcast');
        insert into realtime.fixture_outbox values(final_payload,$2,$3,$4);
      exception when others then raise warning 'fixture_swallowed_send_failure'; end; end $$`);
    assert.equal((await flush()).enabled, false, 'dispatch defaults off');
    assert.equal(await scalar(`select collecting from private.discovery_invalidation_worker_config`), false);
    await db.query(`insert into auth.users(id,is_anonymous,is_sso_user) values($1,false,false)`, [owner]);
    await seedLiveRoomActor(db,{id:owner,session},{premium:false});
    await db.query(`insert into public.discovery_feed_items(id,item_type,source_type,owner_user_id,channel_user_id,
      visibility,rights_status,is_publicly_discoverable,discovery_surface,title)
      values($1,'manual_foundation','manual_foundation',$2,$2,'public','creator_owned',true,'home_profile_channel','Public listing')`, [item, owner]);
    assert.equal(await scalar('select count(*)::int from private.discovery_invalidation_outbox'), 0, 'collection defaults off');
    // This suite exercises the retained worker fallback, independently of the
    // immediate primary path covered by discovery-primary-delivery-database.
    await db.exec(`update private.discovery_invalidation_worker_config set collecting=true,enabled=true,primary_delivery_enabled=false,
      token_sha256=encode(extensions.digest(repeat('t',32),'sha256'),'hex')`);
    assert.equal(await scalar(`select public.authorize_discovery_invalidation_worker(repeat('x',32))`), false);
    assert.equal(await scalar(`select public.authorize_discovery_invalidation_worker(repeat('t',32))`), true);
    await db.query(`update public.discovery_feed_items set title='Changed' where id=$1`, [item]);
    assert.equal(await scalar('select count(*)::int from private.discovery_invalidation_outbox'), 4, 'three surfaces and deduplicated creator scope');
    await db.query(`update public.discovery_feed_items set title='Changed again' where id=$1`, [item]);
    const result = await flush();
    assert.equal(result.completed, 8); assert.equal(result.topics, 4, 'same-scope records coalesce');
    assert.equal(await scalar(`select bool_and(payload-'id'-'keys'='{}'::jsonb and payload->>'id' ~ '^[0-9a-f-]{36}$' and jsonb_array_length(payload->'keys') between 1 and 256 and event='discovery:invalidate' and private) from realtime.fixture_outbox`), true, 'only opaque delivery and affected-source keys in private hints');
    assert.equal((await flush()).claimed, 0, 'completed work not repeated');
    await db.exec(`insert into realtime.messages(payload,event,topic,private,extension,inserted_at)
      select '{}'::jsonb,'other','unrelated-'||n,true,'broadcast',timezone('utc',clock_timestamp())-interval '1 day'
      from generate_series(1,10000) n; analyze realtime.messages`);
    const explain=await db.query(`explain (format json) with candidates as materialized (
      select payload,event from realtime.messages where extension='broadcast' and private is true
        and topic='discovery:v1:surface:home'
        and inserted_at>=$1::timestamp and inserted_at<=$2::timestamp
      order by inserted_at desc limit 1001)
      select count(*)<=1000 and coalesce(bool_or(event='discovery:invalidate' and payload='{}'::jsonb),false) from candidates`,
      [new Date(Date.now()-1000).toISOString(),new Date().toISOString()]);
    assert.match(JSON.stringify(explain.rows),/messages_inserted_at_topic_index/,'confirmation uses managed partial index on representative catalog');
    await db.query(`update public.discovery_feed_items set title='Third update' where id=$1`, [item]);
    assert.equal((await flush()).deferred, 4, 'scope pacing retains exact pending work');
    assert.equal(await scalar(`select count(*)::int from private.discovery_invalidation_outbox where status='pending'`), 4);
    await ready(); assert.equal((await flush()).completed, 4, 'trailing records eventually dispatch');

    await clear();
    await db.query(`update public.discovery_feed_items set title='Queued before pause' where id=$1`,[item]);
    await db.exec('update private.discovery_invalidation_worker_config set collecting=false');
    await db.query(`update public.discovery_feed_items set title='No collection while paused' where id=$1`,[item]);
    assert.equal(await scalar('select count(*)::int from private.discovery_invalidation_outbox'),4,'paused producer appends no new work');
    assert.equal((await flush()).completed,4,'enabled dispatcher drains queued work while collection is paused');
    await db.exec('update private.discovery_invalidation_worker_config set collecting=true');

    await clear();
    await db.query(`update public.discovery_feed_items set visibility='private',is_publicly_discoverable=false where id=$1`, [item]);
    assert.equal((await flush()).completed, 4, 'withdrawal invalidates OLD public scopes');
    await clear();
    await db.query(`update public.discovery_feed_items set title='Secret' where id=$1`, [item]);
    assert.equal(await scalar('select count(*)::int from private.discovery_invalidation_outbox'), 0, 'private-only edits produce nothing');
    await db.query(`update public.discovery_feed_items set visibility='public',is_publicly_discoverable=true where id=$1`, [item]);
    await clear();
    await db.exec('begin');
    await db.query(`update public.discovery_feed_items set title='Rolled back' where id=$1`, [item]);
    await db.exec('rollback');
    assert.equal(await scalar('select count(*)::int from private.discovery_invalidation_outbox'), 0, 'source rollback leaves no events');

    await db.query(`update public.discovery_feed_items set starts_at=clock_timestamp()+interval '1 hour',live_state='scheduled' where id=$1`, [item]);
    assert.equal(await scalar(`select count(*)::int from private.discovery_invalidation_outbox where source_revision is not null`), 4, 'time deadlines are durable');
    await db.query(`update public.discovery_feed_items set starts_at=clock_timestamp()+interval '2 hours' where id=$1`, [item]);
    await ready();
    assert.equal((await flush()).superseded, 4, 'obsolete deadline versions cannot masquerade as current');
    assert.equal(await scalar(`select live_state from public.discovery_feed_items where id='${item}'`), 'scheduled', 'deadline never promotes live');

    await clear();
    await db.query(`insert into public.creator_events(id,host_user_id,event_title,event_type,status,visibility,starts_at)
      values($1,$2,'Delayed event','live_first','scheduled','public',clock_timestamp()-interval '1 hour')`, [event,owner]);
    assert.ok(await scalar(`select count(*)::int from private.discovery_invalidation_outbox where source_table='creator_events'`) >= 2, 'late public event invalidates independently of projection');
    await clear();
    await db.query(`update public.creator_events set status='canceled' where id=$1`, [event]);
    assert.ok(await scalar(`select count(*)::int from private.discovery_invalidation_outbox where source_table='creator_events'`) >= 2, 'late cancellation covered');
    await clear();
    await db.query(`delete from public.creator_events where id=$1`, [event]);
    assert.ok(await scalar(`select count(*)::int from private.discovery_invalidation_outbox where source_table='creator_events'`) >= 2, 'event deletion covered');

    await clear();
    await db.query(`update public.discovery_feed_items set title='Retry send' where id=$1`, [item]);
    // Managed Realtime transport is deliberately doubled; injection proves SQL
    // savepoint behavior, not hosted websocket delivery.
    await db.exec(`create or replace function realtime.send(jsonb,text,text,boolean) returns void language plpgsql as $$
      begin begin insert into realtime.fixture_outbox values($1,$2,$3,$4); raise exception 'fixture_send_failure';
      exception when others then raise warning 'fixture_swallowed_send_failure'; end; end $$`);
    assert.equal((await flush()).failed, 4);
    assert.equal(await scalar('select count(*)::int from realtime.fixture_outbox'), 0, 'swallowed failure cannot complete; partial send rolled back');
    assert.equal(await scalar(`select min(attempts) from private.discovery_invalidation_outbox where status='pending' and source_revision is null`), 1);
    for (let i=1;i<8;i++) { await ready(); await flush(); }
    assert.ok(await scalar(`select count(*)::int from private.discovery_invalidation_outbox where status='dead_letter'`) >= 4, 'bounded attempts reach dead-letter');
    const health = await scalar('select public.read_discovery_invalidation_health()');
    assert.ok(health.deadLetterSample>=4); assert.equal(health.sampleLimit,10001);

    await clear();
    await db.query(`update public.discovery_feed_items set title='Wrong nonce' where id=$1`,[item]);
    await db.exec(`create or replace function realtime.send(jsonb,text,text,boolean) returns void language plpgsql as $$
      begin insert into realtime.messages(payload,event,topic,private,extension,inserted_at)
        values(jsonb_build_object('id',gen_random_uuid()),$2,$3,$4,'broadcast',clock_timestamp()); end $$`);
    assert.equal((await flush()).failed,4,'same topic and event with a different nonce cannot confirm insertion');
    assert.equal(await scalar(`select count(*)::int from private.discovery_invalidation_outbox where status='complete'`),0);
    await clear();
    await db.query(`update public.discovery_feed_items set title='Candidate budget' where id=$1`,[item]);
    await db.exec(`create or replace function realtime.send(jsonb,text,text,boolean) returns void language plpgsql as $$
      begin insert into realtime.messages(payload,event,topic,private,extension,inserted_at)
        select case when n=1 then $1 else jsonb_build_object('id',gen_random_uuid()) end,$2,$3,$4,'broadcast',clock_timestamp()
        from generate_series(1,1001) n; end $$`);
    assert.equal((await flush()).failed,4,'over-budget candidate slice fails closed despite matching nonce');
    assert.equal(await scalar(`select count(*)::int from private.discovery_invalidation_outbox where status='complete'`),0);

    for (const role of ['anon','authenticated']) {
      assert.equal(await scalar(`select has_function_privilege('${role}','public.flush_discovery_invalidations(integer)','execute')`), false);
      assert.equal(await scalar(`select has_function_privilege('${role}','public.authorize_discovery_invalidation_worker(text)','execute')`), false);
      assert.equal(await scalar(`select has_table_privilege('${role}','private.discovery_invalidation_outbox','select')`), false);
    }
    await db.query(`select set_config('request.jwt.claims',$1,false)`, [JSON.stringify({role:'authenticated',sub:owner,session_id:session})]);
    assert.equal(await scalar(`select public.can_receive_discovery_invalidation('discovery:v1:surface:home')`), true);
    assert.equal(await scalar(`select public.can_receive_discovery_invalidation('discovery:v1:surface:circle')`), false);
    assert.equal(await scalar(`select public.can_receive_discovery_invalidation('comm-room-arbitrary')`), false);
    assert.equal(await scalar(`select count(*)::int from pg_policies where schemaname='realtime' and policyname='discovery_scoped_invalidation_receive' and cmd='SELECT'`), 1);
    assert.equal(await scalar(`select count(*)::int from pg_policies where schemaname='realtime' and policyname like 'discovery%' and cmd<>'SELECT'`), 0, 'no client send authorization');
  } finally { await db.close(); }
});
