import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../helpers/database-runtime-authority-fixture.mjs';

test('full-schema tax readiness requires reviewed evidence and immutable identity under real database roles', { timeout: 240000 }, async () => {
  const { db } = await createDatabase({ applyRepair: true, repairInMigrationOrder: true, includeHeldStudio: true });
  const product = 'a7100000-0000-4000-8000-000000000001', order = 'a7100000-0000-4000-8000-000000000002';
  const one = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
  const root = () => db.exec('reset role');
  const service = () => db.exec(`reset role; select set_config('request.jwt.claims','{"role":"service_role"}',false);
    select set_config('request.jwt.claim.role','service_role',false); set role service_role;`);
  const bind = (patch = {}) => {
    const args = { feature: 'physical_merch', identity: order, product, account: 'acct_fixture', environment: 'sandbox', scope: 'US_all_destinations', ...patch };
    return one('select public.bind_commerce_tax_checkout_policy($1,$2,$3,$4,$5,$6)', Object.values(args));
  };
  const policy = async (patch = {}) => {
    await root();
    const fields = { feature: 'physical_merch', product_id: product, account_id: 'acct_fixture', environment: 'sandbox',
      permitted_scope: 'US_all_destinations', platform_scope: 'all_supported_platforms',
      professional_basis_reference: 'SYNTHETIC TEST ONLY—not legal advice', coverage_evidence_reference: 'SYNTHETIC all permitted destinations',
      full_permitted_scope_reviewed: true, collection_mode: 'automatic', liability_type: 'self', liability_account_id: null,
      tax_code: 'txcd_99999999', tax_behavior: 'inclusive', registration_evidence_reference: 'SYNTHETIC registration fixture',
      no_collection_basis_reference: null, provider_settings_evidence_reference: 'SYNTHETIC settings fixture',
      provider_product_evidence_reference: 'SYNTHETIC product fixture', enabled: true, ...patch };
    const keys = Object.keys(fields), values = Object.values(fields);
    return one(`insert into private.commerce_tax_qualifications(${keys.join(',')},provider_verified_at,provider_expires_at,expires_at)
      values(${values.map((_, i) => `$${i + 1}`).join(',')},clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '1 hour') returning id`, values);
  };
  try {
    assert.equal(await one('select count(*)::int from private.commerce_tax_qualifications'), 0, 'migration never seeds qualified tax policy');
    await db.query(`insert into public.merch_products(id,display_name,provider,shipping_tracking_mode) values($1,'Synthetic tax fixture','stripe_physical_goods','tracked')`, [product]);
    await db.query(`insert into public.merch_orders(id,product_id,provider,environment) values($1,$2,'stripe_physical_goods','sandbox')`, [order, product]);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select * from private.commerce_tax_qualifications'), /permission denied/);
      await assert.rejects(db.query('insert into private.commerce_tax_qualifications(feature) values(\'physical_merch\')'), /permission denied/);
      if (role !== 'service_role') await assert.rejects(bind(), /permission denied/);
      await assert.rejects(db.query('select public.get_owner_commerce_tax_readiness()'),
        role === 'authenticated' ? /owner_current_session_required/ : /permission denied/);
      await root();
    }
    await service();
    assert.equal((await bind()).reason, 'tax_qualification_required');
    assert.equal((await bind({ scope: 'worldwide' })).reason, 'tax_checkout_identity_invalid');
    assert.equal((await bind({ environment: 'test' })).reason, 'tax_checkout_identity_invalid');
    assert.equal((await bind({ identity: product })).reason, 'tax_checkout_identity_invalid');
    for (const [patch, reason] of [
      [{ tax_behavior: null }, 'tax_pricing_behavior_required'],
      [{ full_permitted_scope_reviewed: false }, 'tax_scope_coverage_required'],
      [{ professional_basis_reference: '' }, 'tax_scope_coverage_required'],
      [{ registration_evidence_reference: null }, 'provider_tax_settings_unverified'],
      [{ collection_mode: 'verified_no_collection', registration_evidence_reference: null }, 'provider_tax_settings_unverified'],
      [{ collection_mode: 'store_handled' }, 'provider_tax_settings_unverified'],
      [{ enabled: false }, 'tax_qualification_expired'],
    ]) {
      await policy(patch); await service();
      const result = await bind(); assert.equal(result.ready, false); assert.equal(result.reason, reason);
    }
    const approved = await policy(); await service();
    const first = await bind(); assert.equal(first.ready, true); assert.equal(first.policyId, approved);
    assert.equal((await bind()).policyId, approved, 'same identity retry binds the same reviewed policy');
    await root();
    assert.equal(await one('select count(*)::int from private.commerce_tax_checkout_bindings'), 1);
    await assert.rejects(db.query('update private.commerce_tax_checkout_bindings set account_id=\'acct_other\''), /immutable/);
    await assert.rejects(db.query('delete from private.commerce_tax_checkout_bindings'), /immutable/);
    await assert.rejects(db.query('update private.commerce_tax_qualifications set tax_behavior=\'exclusive\' where id=$1', [approved]), /immutable/);
    await db.query('update private.commerce_tax_qualifications set revoked_at=clock_timestamp() where id=$1', [approved]);
    await service(); assert.equal((await bind()).reason, 'tax_qualification_expired');
    await policy(); await service();
    assert.equal((await bind()).reason, 'tax_policy_changed', 'new policy cannot silently change previously bound provider retry');
    await root();
    assert.equal(await one('select count(*)::int from private.commerce_tax_checkout_bindings'), 1);
    assert.equal(await one('select private.commerce_tax_fee_settlement_ready($1,$2)', ['physical_merch', order]), false);
    const otherOrder = 'a7100000-0000-4000-8000-000000000003';
    await db.query(`insert into public.merch_orders(id,product_id,provider,environment) values($1,$2,'stripe_physical_goods','sandbox')`, [otherOrder, product]);
    await policy({ collection_mode: 'verified_no_collection', registration_evidence_reference: null,
      no_collection_basis_reference: 'SYNTHETIC explicit professionally reviewed noncollection basis' });
    await service();
    const noncollection = await bind({ identity: otherOrder });
    assert.equal(noncollection.ready, true);
    assert.equal(noncollection.collectionMode, 'verified_no_collection', 'explicit verified basis, not missing registration, authorizes noncollection');
  } finally { await db.close(); }
});

test('tax-denied auction prepare rolls back checkout claim and settlement contract atomically, then safely retries', { timeout: 240000 }, async () => {
  const { db } = await createDatabase({ applyRepair: true, repairInMigrationOrder: true, includeHeldStudio: true, implicitApiGrants: false });
  try {
    await db.exec(readFileSync(new URL('../fixtures/event-reservation-authority.sql', import.meta.url), 'utf8'));
    await db.exec(readFileSync(new URL('../fixtures/creator-external-payment-authority.sql', import.meta.url), 'utf8'));
    await db.exec("update public.creator_events set visibility='public' where id in(select id from event_reservation_fixture.events)");
    const rows = async sql => (await db.query(sql)).rows;
    const actors = Object.fromEntries((await rows('select * from event_reservation_fixture.actors')).map(a => [a.kind, a]));
    const events = Object.fromEntries((await rows('select * from event_reservation_fixture.events')).map(a => [a.name, a.id]));
    const lit = value => `'${String(value).replaceAll("'", "''")}'`;
    const rpc = async (actor, expression, role = 'authenticated') => {
      const a = actors[actor];
      try {
        const result = await db.exec(`begin;set local role ${role};set local request.jwt.claims=${lit(JSON.stringify({ role, sub: a.user_id, session_id: a.session_id }))};
          set local request.headers='{"x-chillywood-platform":"ios"}';select ${expression} result;commit;`);
        return result.flatMap(x => x.rows).at(-1).result;
      } catch (error) { await db.exec('rollback'); throw error; }
    };
    const cap = (await rows(`insert into private.creator_external_payment_capabilities(feature,creator_id,provider_account_id,
      platform,storefront,storefront_country,route_kind,currency,environment,payment_method,min_amount_minor,max_amount_minor,
      provider_bounds_evidence,route_approval_evidence,verified_at,expires_at,enabled)
      values('event_auction','${actors.creator.user_id}','acct_fixture','ios','UNITED_STATES','US','external_browser_checkout','usd','test','card',50,100000,
        'synthetic test only','synthetic test only',now(),now()+interval '2 hours',true) returning id`))[0].id;
    await db.exec(`insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
      select '${cap}',user_id,session_id,'synthetic test only',now(),now()+interval '10 minutes'
      from event_reservation_fixture.actors where kind like 'buyer%';`);
    const product = (await rows(`insert into public.monetization_products(product_key,product_type,display_name,provider,
      provider_product_id,environment,status,is_android_digital,is_physical_good)
      values('tax_auction_fixture_only','event_pass','Synthetic tax auction','stripe_event_auction','prod_TaxFixture',
        'sandbox','sandbox',false,false) returning id`))[0].id;
    await db.exec(`insert into private.creator_event_auction_product_bindings values('${cap}','${product}','synthetic test only',now());
      insert into private.auction_platform_qualifications(capability_id,platform_account_id,recipient_account_id,
        product_id,platform_product_id,evidence_reference,recipient_transfer_capability,enabled,verified_at,expires_at)
      values('${cap}','acct_platform','acct_fixture','${product}','prod_TaxFixture','synthetic platform-owned product verification','active',true,now(),now()+interval '10 minutes')`);
    const offer = await rpc('creator', `public.configure_paid_creator_event_sale('${events.show1}','Virtual show',99,1,'sandbox',
      'America/New_York',now()-interval '1 hour',least(now()+interval '1 day',(select starts_at from public.creator_events where id='${events.show1}')))`);
    const auction = await rpc('creator', `public.create_creator_event_auction('${events.show1}','${offer.termsRevisionId}',237,1,
      clock_timestamp()+interval '600 milliseconds',now()+interval '1 hour','test')`);
    await rpc('buyer1', `public.place_creator_event_auction_bid('${auction.id}',237,'${randomUUID()}',null)`);
    await new Promise(resolve => setTimeout(resolve, 650));
    const quote = await rpc('buyer1', `public.create_creator_event_auction_award_quote('${auction.id}',null)`);
    const attempt = randomUUID();
    const call = `public.prepare_creator_event_auction_platform_checkout('${quote.id}','${actors.buyer1.user_id}','${actors.buyer1.session_id}','${attempt}')`;
    for (let retry = 0; retry < 2; retry++) {
      await assert.rejects(rpc('buyer1', call, 'service_role'), /tax_qualification_required/);
      assert.equal((await rows(`select checkout_started_at from private.creator_event_auction_quotes where id='${quote.id}'`))[0].checkout_started_at, null);
      assert.equal((await rows('select count(*)::int n from private.auction_platform_settlement_contracts'))[0].n, 0);
      assert.equal((await rows('select count(*)::int n from private.commerce_tax_checkout_bindings'))[0].n, 0);
    }
    await db.exec(`insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope,
      professional_basis_reference,coverage_evidence_reference,full_permitted_scope_reviewed,collection_mode,liability_type,tax_code,tax_behavior,
      registration_evidence_reference,provider_settings_evidence_reference,provider_product_evidence_reference,
      provider_verified_at,provider_expires_at,expires_at,enabled)
      values('event_auction','prod_TaxFixture','acct_platform','test','worldwide','all_supported_platforms',
      'SYNTHETIC reviewed basis','SYNTHETIC worldwide coverage',true,'automatic','self','txcd_99999999','inclusive',
      'SYNTHETIC registrations','SYNTHETIC provider settings','SYNTHETIC provider product',now(),now()+interval '1 hour',now()+interval '1 hour',true)`);
    const claim = await rpc('buyer1', call, 'service_role');
    assert.equal(claim.startAuthorized, true, 'same unconsumed attempt safely becomes eligible after reviewed policy arrives');
    assert.equal((await rpc('buyer1', call, 'service_role')).startAuthorized, false, 'authorized claim remains single-dispatch');
    assert.equal((await rows('select count(*)::int n from private.auction_platform_settlement_contracts'))[0].n, 1);
    assert.equal((await rows('select count(*)::int n from private.commerce_tax_checkout_bindings'))[0].n, 1);
    await db.query("insert into public.platform_role_memberships(user_id,role,status) values($1,'owner','active')", [actors.creator.user_id]);
    const summary = await rpc('creator', 'public.get_owner_commerce_tax_readiness()');
    assert.equal(summary.schemaVersion, 1); assert.equal(summary.status, 'blocked');
    assert.equal(summary.financialAuthority, false); assert.equal(summary.liveActivationAllowed, false);
    assert.equal(summary.items.length, 3);
    const status = Object.fromEntries(summary.items.map(item => [item.feature, item]));
    assert.equal(status.event_auction.reason, 'provider_tax_settings_unverified');
    assert.equal(status.physical_merch.reason, 'tax_qualification_required');
    assert.equal(status.room_auction.reason, 'tax_qualification_required');
    for (const item of summary.items) {
      assert.equal(item.status, 'blocked'); assert.equal(item.taxServiceFeeStatus, 'unverified');
      assert.deepEqual(Object.keys(item).sort(), ['feature', 'reason', 'status', 'taxServiceFeeStatus']);
    }
    assert.doesNotMatch(JSON.stringify(summary), /SYNTHETIC|acct_platform|prod_TaxFixture|evidence_reference/);
    await assert.rejects(rpc('buyer1', 'public.get_owner_commerce_tax_readiness()'), /owner_current_session_required/);
  } finally { await db.close(); }
});
