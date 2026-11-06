import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabase } from './helpers/database-runtime-authority-fixture.mjs';
import { seedCommerceCreator, seedCommerceBuyer, withCommerceActor, acceptCommerceCreatorTerms, seedSyntheticStrictCreatorProvider } from './helpers/automatic-commerce-fixture.mjs';

test('real full-schema automatic creator declaration and strict provider evidence', { timeout: 240000 }, async () => {
  const { db } = await createDatabase({ applyRepair: true, repairInMigrationOrder: true, includeHeldStudio: true, implicitApiGrants: false });
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  try {
    const candidate = { id: randomUUID(), session: randomUUID() };
    // Select a real non-cohort creator, rather than accidentally exercising the
    // legacy one-percent allowance and calling that automatic enrollment proof.
    while ((await one("select mod(hashtextextended('chillywood-wave1-us-rollout-v1:'||$1::text,20260814),100)=0 legacy", [candidate.id])).legacy) {
      candidate.id = randomUUID();
    }
    const creator = await seedCommerceCreator(db, candidate);
    const buyer = await seedCommerceBuyer(db);
    await acceptCommerceCreatorTerms(db, creator);
    const read = (actor = creator) => withCommerceActor(db, actor, async () => (await one('select public.wave1_creator_eligibility_readback() value')).value);
    const declare = (region = 'CA', actor = creator, age = true, country = 'US', version = 'adult-us-creator-v1') => withCommerceActor(db, actor,
      async () => (await one('select public.declare_creator_money_eligibility($1,$2,$3,$4) value', [age, country, region, version])).value);
    assert.equal((await read(buyer)).reasonCodes[0], 'current_mode_premium_required');
    await assert.rejects(declare('CA', buyer), /creator_session_premium_required/);
    for (const args of [['PR'], ['ca'], ['CA', creator, false], ['CA', creator, true, 'CA'], ['CA', creator, true, 'US', 'wrong']]) {
      await assert.rejects(declare(...args), /creator_declaration_invalid/);
    }
    await read();
    await db.query("update public.wave1_creator_eligibility set account_status='UNKNOWN' where creator_user_id=$1", [creator.id]);
    const oldUnknown = await read();
    assert.equal(oldUnknown.accountStatus, 'ACTIVE', 'confirmed active auth user fills missing account evidence');
    assert.equal(oldUnknown.age18Plus, null);
    assert.equal(oldUnknown.taxComplete, null);
    assert.equal(oldUnknown.sanctionsClear, null);
    assert.equal(oldUnknown.canCreateMoneyExposure, false, 'known account never supplies missing personal or compliance evidence');
    const initial = await declare();
    assert.equal(initial.declaration.source, 'self_declaration');
    assert.equal(initial.age18Plus, true);
    assert.equal(initial.market, 'UNITED_STATES');
    assert.equal(initial.rollout, 'AUTOMATIC_PREMIUM_UNITED_STATES');
    assert.equal(initial.taxComplete, null);
    assert.equal(initial.sanctionsClear, null);
    assert.equal(initial.canCreateMoneyExposure, false);
    const count = async () => Number((await one('select count(*) n from private.creator_eligibility_declarations where creator_id=$1', [creator.id])).n);
    await declare(); assert.equal(await count(), 1, 'exact latest retry is idempotent');
    for (const region of ['AK','AZ','AR','CO','CT','DE','DC','FL','GA']) await declare(region);
    assert.equal(await count(), 10);
    await declare('GA');
    await assert.rejects(declare('HI'), /creator_declaration_rate_limited/);
    const rotated = { ...creator, session: randomUUID() };
    await seedCommerceBuyer(db, rotated);
    await declare('GA', rotated);
    await assert.rejects(declare('HI', rotated), /creator_declaration_rate_limited/);
    assert.equal(await count(), 10, 'session rotation does not reset quota');
    await assert.rejects(declare('GA', { ...creator, session: buyer.session }), /creator_session_premium_required/);
    await assert.rejects(declare('GA', { ...creator, session: 'malformed' }), /creator_session_premium_required/);
    await db.query('update auth.sessions set not_after=now()-interval \'1 minute\' where id=$1', [rotated.session]);
    await assert.rejects(declare('GA', rotated), /creator_session_premium_required/);
    await assert.rejects(db.query('update private.creator_eligibility_declarations set region_code=\'NY\' where creator_id=$1', [creator.id]), /creator_declaration_history_immutable/);
    await assert.rejects(db.query('delete from private.creator_eligibility_declarations where creator_id=$1', [creator.id]), /creator_declaration_history_immutable/);

    await db.query("update public.wave1_creator_eligibility set age_18_plus=false,market='OTHER',moderation_state='PENDING',creator_role=false where creator_user_id=$1", [creator.id]);
    const preserved = await read();
    assert.equal(preserved.age18Plus, false);
    assert.equal(preserved.market, 'OTHER');
    assert.equal(preserved.moderationState, 'PENDING');
    assert.equal(preserved.creatorRole, false);
    for (const state of ['SUSPENDED','REVOKED']) {
      await db.query('update public.wave1_creator_eligibility set state=$2,moderation_state=$2 where creator_user_id=$1', [creator.id, state]);
      assert.equal((await read()).state, state);
      await db.query("update public.wave1_creator_eligibility set moderation_state='CLEAR' where creator_user_id=$1", [creator.id]);
      assert.equal((await read()).state, state);
      assert.equal((await read()).state, state, 'lazy refresh never clears existing suspension or revocation');
    }
    const ready = async (mode = 'sandbox') => (await one('select private.ordinary_creator_provider_ready($1,$2) value', [creator.id, mode])).value;
    assert.equal(await ready(), false);
    await seedSyntheticStrictCreatorProvider(db, creator);
    assert.equal(await ready(), true, 'strict independently populated synthetic provider fixture is ready');
    assert.equal(await ready('production'), false, 'test observations never authorize production');
    await db.query(`update public.wave1_creator_eligibility set state='PENDING_VERIFICATION',moderation_state='CLEAR',
      creator_role=true,age_18_plus=true,market='UNITED_STATES',provider_eligible=null,kyc_complete=null,payout_eligible=null
      where creator_user_id=$1`, [creator.id]);
    const providerOnly = await read();
    assert.equal(providerOnly.providerEligible, true);
    assert.equal(providerOnly.taxComplete, null);
    assert.equal(providerOnly.sanctionsClear, null);
    assert.equal(providerOnly.canCreateMoneyExposure, false, 'ready provider never fills independent tax/sanctions');
    await db.query("update public.creator_payout_accounts set tax_status='not_connected' where creator_user_id=$1", [creator.id]);
    assert.equal(await ready(), false, 'canonical sync tax gap stays blocked');
    await db.query("update public.creator_payout_accounts set tax_status='verified',last_provider_sync_at=now()-interval '16 minutes' where creator_user_id=$1", [creator.id]);
    assert.equal(await ready(), false, 'stale provider observation is denied');
    await db.query("update public.creator_payout_accounts set last_provider_sync_at=provider_configuration_observed_at where creator_user_id=$1", [creator.id]);
    assert.equal(await ready(), true, 'fresh exact observation restored before isolating hold');
    await db.query("update public.creator_payout_eligibility_records set fraud_hold_active=true where creator_user_id=$1", [creator.id]);
    assert.equal(await ready(), false, 'fraud hold remains a blocker');
    const acl = await one(`select has_table_privilege('authenticated','private.creator_eligibility_declarations','select') client_read,
      has_table_privilege('service_role','private.creator_eligibility_declarations','insert') service_insert,
      (select relrowsecurity and relforcerowsecurity from pg_class where oid='private.creator_eligibility_declarations'::regclass) forced`);
    assert.deepEqual(acl, { client_read: false, service_insert: false, forced: true });
    // A previously read sandbox mode is not usable after the authoritative
    // switch changes, and sandbox Premium never becomes production Premium.
    await db.exec("begin;set local request.jwt.claim.role='service_role';update public.platform_money_kill_switches set state='on' where key='live_money_enabled';commit;");
    await assert.rejects(db.query('select private.lock_ordinary_creator_subject($1,$2,\'sandbox\')', [creator.id, creator.session]), /creator_mode_changed/);
    assert.equal((await read()).canCreateMoneyExposure, false);
    await assert.rejects(declare('GA'), /creator_session_premium_required/);
  } finally { await db.close(); }
});
