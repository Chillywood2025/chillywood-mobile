import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyRetainedDiscoveryHost } from '../scripts/lib/discovery-native-retention-fixture.mjs';
import { createDatabase } from './helpers/database-runtime-authority-fixture.mjs';
import { seedLiveRoomActor } from './helpers/live-room-authority-fixture.mjs';

test('native discovery cleanup retains only the exact restricted synthetic Premium host', { timeout: 120_000 }, async t => {
  const { db } = await createDatabase({ includeHeldStudio: true, applyRepair: true, repairInMigrationOrder: true, implicitApiGrants: false });
  const host = { id: 'ac530000-0000-4000-8000-000000000001', session: 'ac530001-0000-4000-8000-000000000001' };
  const ordinary = { id: 'ac530000-0000-4000-8000-000000000002', session: 'ac530001-0000-4000-8000-000000000002' };
  const email = 'discovery-host-0123456789abcdef@example.invalid';
  const ordinaryEmail = 'discovery-host-fedcba9876543210@example.invalid';
  const snapshot = async () => (await db.query(`select
    (select jsonb_agg(to_jsonb(u) order by u.id) from auth.users u where u.id in ($1::uuid,$2::uuid)) as users,
    (select jsonb_agg(to_jsonb(a) order by a.id) from public.revenuecat_premium_transaction_authority a) as authority`, [host.id, ordinary.id])).rows;
  const verify = (actor = host, expectedEmail = email) => verifyRetainedDiscoveryHost(db, actor, { email: expectedEmail });
  try {
    // Model the two real Auth createUser results before the unchanged SQL seed.
    await db.query('insert into auth.users(id,email,is_sso_user,is_anonymous) values($1,$2,false,false),($3,$4,false,false)',
      [host.id, email, ordinary.id, ordinaryEmail]);
    await seedLiveRoomActor(db, host, { premium: true });
    await seedLiveRoomActor(db, ordinary, { premium: false });
    const original = await snapshot();
    await t.test('exact Premium authority qualifies but the real FK still forbids hard deletion', async () => {
      await db.exec('begin read only');
      try { assert.equal(await verify(), true); } finally { await db.exec('rollback'); }
      assert.deepEqual(await snapshot(), original, 'read-only helper changes no protected row');
      await assert.rejects(db.query('delete from auth.users where id=$1', [host.id]), error =>
        error.code === '23001' && error.constraint === 'revenuecat_premium_transaction_authority_user_id_fkey');
      assert.deepEqual(await snapshot(), original, 'failed deletion preserves actor and financial authority');
    });
    await t.test('no authority returns false and ordinary deletion remains real and mandatory', async () => {
      assert.equal(await verify(ordinary, ordinaryEmail), false);
      await db.exec('begin');
      try {
        assert.equal((await db.query('delete from auth.users where id=$1 returning id', [ordinary.id])).rows.length, 1);
      } finally { await db.exec('rollback'); }
      assert.deepEqual(await snapshot(), original);
    });
    const mutations = [
      { name: 'wrong tracked user', actor: ordinary, expected: 'identity' },
      { name: 'wrong original createUser email', email: ordinaryEmail, expected: 'identity' },
      { name: 'rebound authority user', set: `user_id='${ordinary.id}'` },
      { name: 'wrong original transaction', set: "original_transaction_id='different-original'" },
      { name: 'wrong first event', set: "first_event_id='different-first'" },
      { name: 'wrong latest event', set: "latest_event_id='different-latest'" },
      { name: 'wrong first hash', set: "first_event_hash=repeat('b',64)" },
      { name: 'wrong latest hash', set: "latest_event_hash=repeat('b',64)" },
      { name: 'production is never a disposable sandbox fixture', set: "environment='production'" },
      { name: 'wrong provider', set: "provider='revenuecat_app_store'" },
      { name: 'nonactive authority', set: "authority_state='expired'" },
      { name: 'wrong event type', set: "latest_event_type='RENEWAL'" },
      { name: 'wrong catalog product', set: `current_product_id=(select p.id from public.monetization_products p
          where p.id<>public.revenuecat_premium_transaction_authority.current_product_id order by p.id limit 1)` },
      { name: 'wrong provider product', set: "current_provider_product_id='different-product'" },
      { name: 'wrong base plan', set: "current_provider_base_plan_id='different-plan'" },
      { name: 'unexpected extra authority for the host', sql: `insert into public.revenuecat_premium_transaction_authority
          select (jsonb_populate_record(null::public.revenuecat_premium_transaction_authority,
            to_jsonb(a)||jsonb_build_object('id',gen_random_uuid(),'original_transaction_id','unexpected-extra'))).*
          from public.revenuecat_premium_transaction_authority a where user_id='${host.id}'` },
      { name: 'missing RESTRICT constraint', constraint: '' },
      { name: 'unvalidated RESTRICT constraint', constraint: 'on delete restrict not valid' },
      { name: 'deferred constraint', constraint: 'on delete restrict deferrable initially deferred' },
      { name: 'deferrable constraint is not the immediate nondeferrable contract', constraint: 'on delete restrict deferrable initially immediate' },
      { name: 'NO ACTION is not the exact RESTRICT contract', constraint: 'on delete no action' },
      { name: 'CASCADE is not an allowed cleanup bypass', constraint: 'on delete cascade' },
    ];
    for (const mutation of mutations) await t.test(mutation.name, async () => {
      await db.exec('begin');
      try {
        if (mutation.set) await db.query(`update public.revenuecat_premium_transaction_authority set ${mutation.set} where user_id=$1`, [host.id]);
        if (mutation.sql) await db.exec(mutation.sql);
        if (Object.hasOwn(mutation, 'constraint')) {
          await db.exec('alter table public.revenuecat_premium_transaction_authority drop constraint revenuecat_premium_transaction_authority_user_id_fkey');
          if (mutation.constraint) await db.exec(`alter table public.revenuecat_premium_transaction_authority
            add constraint revenuecat_premium_transaction_authority_user_id_fkey foreign key(user_id) references auth.users(id) ${mutation.constraint}`);
        }
        const before = await snapshot();
        const reason = Object.hasOwn(mutation, 'constraint') ? 'constraint' : mutation.expected ?? 'binding';
        await assert.rejects(verify(mutation.actor ?? host, mutation.email ?? email),
          new RegExp(`^Error: discovery_retained_host_${reason}_mismatch$`));
        assert.deepEqual(await snapshot(), before, 'rejected disposition never repairs, deletes or rewrites protected rows');
      } finally { await db.exec('rollback'); }
      assert.deepEqual(await snapshot(), original, 'all mutation evidence is rollback-only');
      assert.equal(await verify(), true, 'actual retained fixture and FK restored after mutant');
    });
  } finally { await db.close(); }
});
