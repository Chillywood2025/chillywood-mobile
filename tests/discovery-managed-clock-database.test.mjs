import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createDatabase, splitSQL } from './helpers/database-runtime-authority-fixture.mjs';

const topic = 'discovery:v1:surface:home';
const source = 'a3060000-0000-4000-8000-000000000001';
const key = 'a3060000-0000-4000-8000-000000000002';
const collision = 'a3060000-0000-4000-8000-000000000003';

function replaceExactlyOnce(sql, pattern, replacement) {
  const matches = typeof pattern === 'string' ? sql.split(pattern).length - 1 : [...sql.matchAll(pattern)].length;
  assert.equal(matches, 1, 'test mutation must match exactly one delivery expression');
  return sql.replace(pattern, () => replacement);
}

// Only managed transport is doubled. Actual final migration functions, trigger,
// durable outbox, candidate queries, retry state and rollback execute in SQL.
// Direct private outbox rows isolate delivery confirmation, not source admission;
// the existing primary/invalidation suites exercise real source/audience gates.
// This is PGlite SQL evidence, not hosted transport or multi-backend contention.
test('managed discovery timestamps: final primary/fallback and retained intermediate primary', { timeout: 180_000 }, async t => {
  const { db } = await createDatabase({
    includeHeldStudio: true, applyRepair: true, repairInMigrationOrder: true, implicitApiGrants: false,
  });
  const scalar = async (sql, parameters = []) => Object.values((await db.query(sql, parameters)).rows[0])[0];
  const definition = name => scalar('select pg_get_functiondef($1::regprocedure)', [name]);
  const primaryName = 'private.deliver_discovery_primary_hint()';
  const fallbackName = 'public.flush_discovery_invalidations(integer)';
  const seen = new Set();
  try {
    await db.exec(`alter table realtime.messages alter column id type uuid using null::uuid;
      alter table realtime.messages alter column id set default gen_random_uuid();
      alter table realtime.messages alter column inserted_at type timestamp without time zone using inserted_at at time zone 'UTC';
      alter table realtime.messages alter column inserted_at set default now();
      create index messages_inserted_at_topic_index on realtime.messages(inserted_at desc,topic)
        where extension='broadcast' and private is true;
      create sequence realtime.fixture_send_calls;
      create table realtime.fixture_send_context(timezone text);`);
    assert.equal(await scalar(`select pg_get_expr(d.adbin,d.adrelid) from pg_attrdef d
      join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
      where d.adrelid='realtime.messages'::regclass and a.attname='inserted_at'`), 'now()', 'exact managed default, not a fixture UTC/wall-clock substitution');

    const finalPrimary = await definition(primaryName);
    const finalFallback = await definition(fallbackName);
    const intermediateStatements = splitSQL(readFileSync(new URL('../supabase/migrations/20261101202330_discovery_transactional_primary_hints.sql', import.meta.url), 'utf8'))
      .filter(sql => /create function private\.deliver_discovery_primary_hint\(\)/u.test(sql));
    assert.equal(intermediateStatements.length, 1);
    const targets = [
      { name: 'final primary', sql: finalPrimary, primary: true, keys: true },
      { name: 'final fallback', sql: finalFallback, primary: false, keys: true },
      // Exact earlier function on the full schema, rollback-only: this qualifies
      // its delivery logic, not an independently reconstructed historical catalog.
      { name: 'intermediate 20261101202330 primary', sql: intermediateStatements[0].replace('create function', 'create or replace function'), primary: true, keys: false },
    ];

    for (const target of targets) {
      const expectedPayload = { id: collision, ...(target.keys ? { keys: [key] } : {}) };
      const cases = [
        { name: 'managed now() after delayed transaction start, non-UTC caller', complete: true },
        { name: 'observed UTC wall-clock default after delayed transaction start, non-UTC caller', clockDefault: "timezone('utc'::text,clock_timestamp())", complete: true },
        { name: 'raw wall-clock default retains UTC cast under non-UTC caller', clockDefault: 'clock_timestamp()', complete: true },
        { name: 'no-op send remains pending', mode: 'noop' },
        { name: 'swallowed insertion error rolls back partial send', mode: 'swallowed' },
        { name: 'same nonce but altered entire payload cannot confirm', mode: 'wrong-payload' },
        { name: 'same nonce but forged keys cannot confirm', mode: 'wrong-keys' },
        { name: 'different nonce cannot confirm', mode: 'wrong-nonce' },
        { name: 'wrong topic cannot confirm', mode: 'wrong-topic' },
        { name: 'wrong event cannot confirm', mode: 'wrong-event' },
        { name: 'nonprivate insertion cannot confirm', mode: 'not-private' },
        { name: 'nonbroadcast insertion cannot confirm', mode: 'not-broadcast' },
        { name: 'future timestamp cannot bypass wall-clock upper bound', mode: 'future' },
        { name: 'stale exact receipt cannot certify no-op', mode: 'noop', nonce: true, seed: 'stale' },
        { name: 'same-transaction exact nonce collision rejected before send', mode: 'noop', nonce: true, seed: 'collision', calls: 0 },
        { name: '1001 existing candidates rejected before send', seed: 1001, calls: 0 },
        { name: '1000 existing candidates plus send exceed post-send budget', seed: 1000 },
        { name: '999 existing candidates plus send fit exact budget', seed: 999, complete: true },
        { name: '1001 inserted candidates fail closed and roll back', mode: 'overflow' },
        { name: 'negative control: old wall-clock lower bound rejects real managed insertion', mutation: 'clock-lower' },
        { name: 'negative control: removed precheck falsely accepts colliding no-op', mode: 'noop', nonce: true, seed: 'collision', mutation: 'remove-precheck', complete: true },
        { name: 'negative control: missing UTC setting rejects non-UTC managed insertion', mutation: 'remove-utc' },
      ];
      for (const scenario of cases) await t.test(`${target.name}: ${scenario.name}`, async () => {
        await db.exec('begin');
        try {
          await db.exec(`set local time zone 'Asia/Kolkata';
            truncate private.discovery_invalidation_outbox,private.discovery_invalidation_scope_dispatch,
              realtime.messages,realtime.fixture_outbox,realtime.fixture_send_context;
            select setval('realtime.fixture_send_calls',1,false);
            update private.discovery_invalidation_worker_config set collecting=true,enabled=true,
              primary_delivery_enabled=${target.primary},token_sha256=repeat('a',64);
            alter table realtime.messages alter column inserted_at set default ${scenario.clockDefault ?? 'now()'};`);
          let sql = target.sql;
          if (scenario.nonce) sql = replaceExactlyOnce(sql,
            target.primary ? 'delivery:=gen_random_uuid()' : 'v_delivery_id:=gen_random_uuid()',
            `${target.primary ? 'delivery' : 'v_delivery_id'}:='${collision}'::uuid`);
          if (scenario.mutation === 'clock-lower') sql = replaceExactlyOnce(sql,
            "timezone('utc',transaction_timestamp())", "timezone('utc',clock_timestamp())");
          if (scenario.mutation === 'remove-precheck') sql = replaceExactlyOnce(sql,
            /with candidates as materialized \([\s\S]*?if not (?:v_)?confirmed then raise exception 'discovery_(?:primary|broadcast)_receipt_not_fresh'; end if;/gu, '');
          if (scenario.mutation === 'remove-utc') sql = replaceExactlyOnce(sql,
            /set "?timezone"?\s*(?:=|to)\s*'UTC'/giu, '');
          await db.exec(sql);

          const mode = scenario.mode ?? 'managed';
          const payload = mode === 'wrong-payload' ? `$1||'{"forged":true}'::jsonb`
            : mode === 'wrong-keys' ? `jsonb_set($1,'{keys}',jsonb_build_array('${source}'))`
            : mode === 'wrong-nonce' ? `jsonb_set($1,'{id}',to_jsonb(gen_random_uuid()))` : '$1';
          const timestamp = mode === 'future' ? ",timezone('utc',clock_timestamp())+interval '1 hour'" : '';
          const insert = mode === 'overflow'
            ? `insert into realtime.messages(payload,event,topic,private,extension)
                select case when n=1 then $1 else jsonb_build_object('id',gen_random_uuid()) end,$2,$3,$4,'broadcast'
                from generate_series(1,1001) n;`
            : `insert into realtime.messages(payload,event,topic,private,extension${timestamp ? ',inserted_at' : ''})
                values(${payload},${mode === 'wrong-event' ? "'other'" : '$2'},${mode === 'wrong-topic' ? "'other-topic'" : '$3'},
                  ${mode === 'not-private' ? 'false' : '$4'},${mode === 'not-broadcast' ? "'other'" : "'broadcast'"}${timestamp});`;
          await db.exec(`create or replace function realtime.send(jsonb,text,text,boolean) returns void language plpgsql as $$
            begin
              perform nextval('realtime.fixture_send_calls');
              ${mode === 'noop' ? 'return;' : `begin
                ${insert}
                insert into realtime.fixture_outbox values($1,$2,$3,$4);
                insert into realtime.fixture_send_context values(current_setting('TimeZone'));
                ${mode === 'swallowed' ? "raise exception 'fixture_insert_failure';" : ''}
              exception when others then raise warning 'fixture_swallowed_send_failure'; end;`}
            end $$;`);
          // Real time separates transaction start from the later send. No clock
          // stubs, authority replacements or production trigger disabling.
          await db.exec('select pg_sleep(0.025)');
          assert.equal(await scalar("select clock_timestamp()>transaction_timestamp()+interval '10 milliseconds'"), true);
          if (typeof scenario.seed === 'number') await db.query(`insert into realtime.messages(payload,event,topic,private,extension,inserted_at)
            select jsonb_build_object('noise',n),'discovery:invalidate',$1,true,'broadcast',timezone('utc',transaction_timestamp())
            from generate_series(1,$2::integer) n`, [topic, scenario.seed]);
          else if (scenario.seed) await db.query(`insert into realtime.messages(payload,event,topic,private,extension,inserted_at)
            values($1::jsonb,'discovery:invalidate',$2,true,'broadcast',timezone('utc',transaction_timestamp())
              ${scenario.seed === 'stale' ? "-interval '1 second'" : ''})`, [JSON.stringify(expectedPayload), topic]);

          await db.query(`insert into private.discovery_invalidation_outbox(topic,source_id,hint_keys,available_at)
            values($1,$2,array[$3::uuid],clock_timestamp()-interval '1 second')`, [topic, source, key]);
          if (!target.primary) {
            const result = await scalar('select public.flush_discovery_invalidations(100)');
            assert.equal(result.claimed, 1);
            assert.equal(result.completed, scenario.complete ? 1 : 0);
            assert.equal(result.failed, scenario.complete ? 0 : 1);
          }
          const state = (await db.query(`select status,attempts,last_error_code,completed_at is not null as completed
            from private.discovery_invalidation_outbox`)).rows;
          assert.deepEqual(state, [{ status: scenario.complete ? 'complete' : 'pending', attempts: scenario.complete ? 0 : 1,
            last_error_code: scenario.complete ? null : 'P0001', completed: Boolean(scenario.complete) }]);
          assert.equal(await scalar('select case when is_called then last_value else 0 end::integer from realtime.fixture_send_calls'), scenario.calls ?? 1);
          const seeded = typeof scenario.seed === 'number' ? scenario.seed : scenario.seed ? 1 : 0;
          const actualSend = scenario.complete && mode !== 'noop';
          assert.equal(await scalar('select count(*)::integer from realtime.messages'), seeded + (actualSend ? 1 : 0), 'failed/partial sends roll back, preexisting receipts remain');
          assert.equal(await scalar('select count(*)::integer from realtime.fixture_outbox'), actualSend ? 1 : 0);
          assert.equal(await scalar('select count(*)::integer from private.discovery_invalidation_scope_dispatch'), !target.primary && scenario.complete ? 1 : 0);
          assert.equal(await scalar("select current_setting('TimeZone')"), 'Asia/Kolkata', 'function UTC setting does not leak into caller');
          if (actualSend) {
            assert.equal(await scalar('select timezone from realtime.fixture_send_context'), 'UTC');
            const sent = await scalar('select payload from realtime.fixture_outbox');
            assert.match(sent.id, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u);
            assert.notEqual(sent.id, collision, 'normal implementation retains its fresh random generator');
            assert.equal(seen.has(sent.id), false); seen.add(sent.id);
            assert.deepEqual(sent, { id: sent.id, ...(target.keys ? { keys: [key] } : {}) });
            assert.equal(await scalar(`select id<>($1::jsonb->>'id')::uuid and inserted_at>=timezone('utc',transaction_timestamp())
              and inserted_at<=timezone('utc',clock_timestamp()) and inserted_at${scenario.clockDefault ? '>' : '='}timezone('utc',transaction_timestamp())
              from realtime.messages where payload=$1::jsonb`, [JSON.stringify(sent)]), true, 'managed row id is independent and exact default fits the UTC transaction-to-wall-clock interval');
          }
        } finally { await db.exec('rollback'); }
        assert.equal(await definition(primaryName), finalPrimary, 'rollback restores final primary after every mutant/intermediate overlay');
        assert.equal(await definition(fallbackName), finalFallback, 'rollback restores final fallback after every mutant');
        assert.equal(await scalar('select count(*)::integer from realtime.messages'), 0, 'outer rollback removes successful receipt too');
        assert.equal(await scalar('select count(*)::integer from private.discovery_invalidation_outbox'), 0, 'outer rollback removes durable work too');
      });
    }
  } finally { await db.close(); }
});
