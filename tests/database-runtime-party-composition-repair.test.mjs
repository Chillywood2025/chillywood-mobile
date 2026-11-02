import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createDatabase, heldStudioBundleVersions, liveSnapshotPath, splitSQL } from './helpers/database-runtime-authority-fixture.mjs';
import { seedLiveRoomAuthority, liveFixtureActors, liveFixtureTitle, withLiveRoomActor } from './helpers/live-room-authority-fixture.mjs';
import { appCompletionStudioDependentFiles } from './helpers/app-completion-migration-inventory.mjs';

// These immutable October before/after controls deliberately replace the
// historical public resolver. Defer the later API cutover rather than replaying
// an October function over November's outer wrappers or regranting retired RPCs.
// The separate final-chain case below applies every successor in source order.
const liveSuccessorFiles = appCompletionStudioDependentFiles;
assert.equal(liveSuccessorFiles.length, 9, 'exact held Live/Owner successor bundle is explicitly deferred');
assert.deepEqual(heldStudioBundleVersions.filter(version => version.startsWith('20261101')).sort(),
  liveSuccessorFiles.map(file => file.split('_')[0]).sort(), 'historical scope defers exactly the inventoried held successor identities');

const beforeSql = fs.readFileSync(new URL('./fixtures/database-runtime-premium-composition-before.sql', import.meta.url), 'utf8');
assert.equal(createHash('sha256').update(beforeSql).digest('hex'),
  'e7fa34c25b498f4860032837604216da5ab0d121dc53645f035836028f7bc7ee', 'exact immutable 4822 two-function before control');
const capturedSql = fs.readFileSync(liveSnapshotPath, 'utf8');
const originalPublicationSql = splitSQL(fs.readFileSync(new URL('../supabase/migrations/20261011023525_party_room_audience_discovery.sql', import.meta.url), 'utf8'))
  .find(sql => /create function public\.resolve_watch_party_livekit_viewer_authority\(/u.test(sql))
  ?.replace('create function public.resolve_watch_party_livekit_viewer_authority', 'create or replace function public.resolve_watch_party_livekit_viewer_authority');
assert.ok(originalPublicationSql, 'exact unchanged captured-production publication wrapper retained');
const user = n => `af110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const session = n => `af110001-0000-4000-8000-${String(n).padStart(12, '0')}`;
const title = 'af110002-0000-4000-8000-000000000001';
const room = 'RUNTIME-PUBLISHED-PREMIUM';
const authorityShape = result => Object.fromEntries(['allowed', 'paidSeatRequired', 'speakerEligible', 'hostAuthority', 'expiresAt', 'reason'].map(key => [key, result[key]]));
const roomDenied = { allowed: false, paidSeatRequired: false, speakerEligible: false, hostAuthority: false,
  expiresAt: null, reason: 'room_viewer_authority_required' };

async function login(db, n = null) {
  await db.exec('reset role');
  const role = n === null ? 'service_role' : 'authenticated';
  await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.role',$2,false)",
    [JSON.stringify(n === null ? { role } : { role, sub: user(n), session_id: session(n) }), role]);
  await db.exec(`set role ${role}`);
}

async function authority(db, n, party = room, generation = session(n)) {
  await login(db);
  return (await db.query('select public.resolve_watch_party_livekit_viewer_authority($1,$2,$3) as result',
    [party, user(n), generation])).rows[0].result;
}

for (const includeHeldStudio of [false, true]) {
  test(`historical published Party Room repair composes restored Premium authority (${includeHeldStudio ? 'with' : 'without'} Studio)`, async t => {
    const { db, repairSql, replayReport } = await createDatabase({ overlayLiveDrift: true, applyRepair: true, includeHeldStudio,
      excludeMigrations: liveSuccessorFiles });
    let checks = 0;
    const check = (value, expected, message) => { assert.deepEqual(value, expected, message); checks++; };
    try {
      assert.ok(liveSuccessorFiles.every(file => !replayReport.files.includes(file)), 'historical controls precede the versioned API cutover');
      await db.exec(`begin;
        insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at)
          values ${[1, 2, 3].map(n => `('${user(n)}',false,false,now())`).join(',')};
        insert into auth.sessions(id,user_id,not_after)
          values ${[1, 2, 3].map(n => `('${session(n)}','${user(n)}',now()+interval '1 day')`).join(',')};
        insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
          select u.id,public.wave1_sha256(u.id::text),d.document_key,d.version,d.market,'member',d.capability,s.id::text,'service_reconciliation'
          from auth.users u join auth.sessions s on s.user_id=u.id cross join public.wave1_legal_document_versions d
          where u.id in ('${user(1)}','${user(2)}','${user(3)}')
            and d.active and d.market='UNITED_STATES' and d.capability='account';
        update public.platform_money_kill_switches set state='sandbox_only'
          where key in ('revenuecat_google_play_enabled','provider_webhooks_enabled');
        insert into public.titles(id,title,video_url,is_published,status)
          values('${title}','Runtime source metadata','https://example.invalid/private.mp4',true,'published');
        insert into public.user_friendships(user_low_id,user_high_id,requested_by_user_id,status,responded_at,actioned_by_user_id)
          values('${user(1)}','${user(2)}','${user(1)}','active',now(),'${user(2)}');
      `);
      for (const n of [1, 2, 3]) {
        const value = (await db.query(`select public.process_revenuecat_premium_event_atomic(
          'revenuecat_google_play',$1,'INITIAL_PURCHASE',$2,p.provider_product_id,p.provider_base_plan_id,
          'sandbox','active',now()-interval '1 minute',now()+interval '1 day',now(),999,'usd',$3,
          'NORMAL','google_play','android',null,p.id,$4) as result
          from public.monetization_products p where p.provider='revenuecat_google_play' and p.environment='sandbox'
            and p.product_type='premium_subscription' and p.status='sandbox' order by p.created_at,p.id limit 1`,
        [`runtime-composition-premium-${n}`, user(n), String(n).repeat(64), `runtime-composition-original-${n}`])).rows[0].result;
        check(value.status, 'processed', `real finite Premium provider projection for subject ${n}`);
      }
      await login(db, 1);
      await db.exec(`insert into public.watch_party_rooms(party_id,host_user_id,title_id,source_type,source_id,room_type,content_access_rule)
        values('${room}','${user(1)}','${title}','platform_title','${title}','title','premium'),
          ('RUNTIME-PRIVATE-PREMIUM','${user(1)}','${title}','platform_title','${title}','title','premium'),
          ('RUNTIME-PREPARED-PREMIUM','${user(1)}','${title}','platform_title','${title}','title','premium');
        select public.set_party_room_discovery('RUNTIME-PREPARED-PREMIUM','public','Prepared only','platform_title','${title}','${session(1)}');
        select public.set_party_room_discovery('${room}','public','Exact runtime party','platform_title','${title}','${session(1)}');
        select public.join_watch_party_room_session('${room}');
        select public.publish_party_room_discovery('${room}','platform_title','${title}','${session(1)}');`);
      await login(db, 2);
      await db.exec(`select public.join_watch_party_room_session('${room}');
        select public.join_watch_party_room_session('RUNTIME-PRIVATE-PREMIUM');reset role;`);
      // This separate control distinguishes the pre-existing target-enforcement
      // gap from the new current-session composition regression in candidate4822.
      await db.exec(capturedSql);
      await db.exec(originalPublicationSql);
      check((await authority(db, 2, room, null)).allowed, true, 'captured production valid fresh-member target positive');
      await db.exec(`reset role;savepoint captured_retired;delete from auth.sessions where id='${session(1)}';`);
      check((await authority(db, 2, room, null)).allowed, true, 'exact captured production pre-existing retired-publication target allow');
      await db.exec('reset role;rollback to captured_retired;commit;');
      await db.exec(repairSql);
      await db.exec('begin;');
      await db.exec(beforeSql);
      check((await authority(db, 3)).allowed, true, 'exact 4822 before-control bypasses published-room membership');
      check((await authority(db, 2)).expiresAt, null, 'exact 4822 before-control loses published-room short TTL');
      check((await authority(db, 2, 'RUNTIME-PREPARED-PREMIUM')).allowed, true, 'exact 4822 before-control authorizes prepared public room without publication');
      await db.exec(`reset role;savepoint retired_before;delete from auth.sessions where id='${session(1)}';`);
      check((await authority(db, 2)).allowed, true, 'exact 4822 before-control retains public authority after bound host-session revocation');
      check((await authority(db, 2, room, null)).allowed, true, 'exact 4822 before-control retains retired publication in null-generation enforcement');
      await db.exec('reset role;rollback to retired_before;');
      await db.exec(`reset role;savepoint expired_before;
        delete from auth.sessions where id='${session(2)}';`);
      check((await authority(db, 2)).reason, 'viewer_authority_invalid', 'exact 4822 before-control changes supplied-session denial contract');
      await db.exec('reset role;rollback to expired_before;commit;');
      await db.exec(repairSql);
      await db.exec('begin;');

      const denied = await authority(db, 3);
      check(authorityShape(denied), roomDenied, 'published room requires actual current exact membership');
      const allowed = await authority(db, 2);
      check({ ...authorityShape(allowed), expiresAt: '<checked below>' },
        { allowed: true, paidSeatRequired: false, speakerEligible: true, hostAuthority: false,
          expiresAt: '<checked below>', reason: 'non_seat_room_authority' }, 'current Premium member receives exact viewer authority');
      const hostAllowed = await authority(db, 1);
      check({ ...authorityShape(hostAllowed), expiresAt: '<checked below>' },
        { allowed: true, paidSeatRequired: false, speakerEligible: true, hostAuthority: true,
          expiresAt: '<checked below>', reason: 'non_seat_room_host_authority' }, 'canonical current joined host retains exact host authority');
      await db.exec('reset role');
      const expectedExpiry = (await db.query(`select least(now()+interval '30 seconds',
        (select not_after from auth.sessions where id='${session(2)}'),
        (select min(expires_at) from public.user_entitlements where user_id in ('${user(1)}','${user(2)}')
          and entitlement_key='premium' and expires_at>now()))::text as value`)).rows[0].value;
      check(new Date(allowed.expiresAt).getTime(), new Date(expectedExpiry).getTime(), 'exact short/session/Premium minimum TTL');
      check(new Date(hostAllowed.expiresAt).getTime(), new Date(expectedExpiry).getTime(), 'canonical host has finite exact short authority TTL');
      check(authorityShape(await authority(db, 2, room, null)),
        { allowed: true, paidSeatRequired: false, speakerEligible: true, hostAuthority: false,
          expiresAt: null, reason: 'non_seat_room_authority' }, 'fresh exact target enforcement retains its no-token TTL contract');
      check((await authority(db, 3, 'RUNTIME-PRIVATE-PREMIUM')).allowed, true, 'unpublished private legacy title contract remains supported');
      check((await authority(db, 2, 'RUNTIME-PRIVATE-PREMIUM', null)).allowed, true, 'private legacy fresh-member target enforcement remains supported');
      check(authorityShape(await authority(db, 2, 'RUNTIME-PREPARED-PREMIUM')), roomDenied, 'prepared public room requires actual publication');

      async function mutation(sql, callback) {
        await db.exec(`reset role;savepoint mutation;${sql}`);
        try { await callback(); } finally { await db.exec('reset role;rollback to mutation;'); }
      }
      await mutation(`delete from auth.sessions where id='${session(1)}';`, async () => {
        check(authorityShape(await authority(db, 2)), roomDenied, 'revoking bound host session retires public media authority');
        check(authorityShape(await authority(db, 2, room, null)), roomDenied, 'retired public publication also denies fresh exact-target enforcement');
      });
      await mutation('', async () => {
        await login(db, 1);
        await db.exec(`select public.heartbeat_watch_party_room_session('${room}','left');`);
        check(authorityShape(await authority(db, 2)), roomDenied, 'actual host self-leave retires public media authority');
        check(authorityShape(await authority(db, 2, room, null)), roomDenied, 'host self-leave also retires exact-target enforcement');
      });
      await mutation('', async () => {
        await login(db, 1);
        await db.exec(`select public.set_party_room_discovery('${room}','circle','Current Circle party','platform_title','${title}','${session(1)}');`);
        check((await authority(db, 2)).allowed, true, 'current exact Circle friend membership retains authority');
        check(authorityShape(await authority(db, 3)), roomDenied, 'Circle source gate still denies unrelated subject');
        await db.exec(`reset role;delete from auth.sessions where id='${session(1)}';`);
        check(authorityShape(await authority(db, 2)), roomDenied, 'retired Circle publication cannot retain baseline authority');
        check(authorityShape(await authority(db, 2, room, null)), roomDenied, 'retired Circle publication denies exact-target enforcement');
      });
      await mutation(`update public.watch_party_room_memberships set last_seen_at=now()-interval '1 minute'
        where party_id='${room}' and user_id='${user(2)}';`, async () => {
        check(authorityShape(await authority(db, 2)), roomDenied, 'stale membership cannot retain published-room authority');
      });
      await mutation('', async () => {
        await login(db, 2);
        await db.exec(`select public.heartbeat_watch_party_room_session('${room}','left');`);
        check(authorityShape(await authority(db, 2)), roomDenied, 'actual self-leave cannot retain published-room authority');
      });
      await mutation('', async () => {
        await login(db, 1);
        await db.exec(`select public.set_watch_party_participant_authority('${room}','${user(2)}','listener',false,'removed');`);
        check(authorityShape(await authority(db, 2)), roomDenied, 'actual host removal cannot retain published-room authority');
      });
      await mutation(`update auth.sessions set not_after=now()+interval '5 seconds' where id='${session(2)}';`, async () => {
        const result = await authority(db, 2);
        await db.exec('reset role');
        const cutoff = (await db.query(`select not_after::text as value from auth.sessions where id='${session(2)}'`)).rows[0].value;
        check(new Date(result.expiresAt).getTime(), new Date(cutoff).getTime(), 'shorter exact session cutoff bounds the authority');
      });
      for (const n of [1, 2]) {
        await mutation('', async () => {
          const result = (await db.query(`select public.process_revenuecat_premium_event_atomic(
            'revenuecat_google_play',$1,'RENEWAL',$2,p.provider_product_id,p.provider_base_plan_id,
            'sandbox','active',now()-interval '1 minute',now()+interval '8 seconds',now(),999,'usd',$3,
            'NORMAL','google_play','android',null,p.id,$4) as result
            from public.monetization_products p where p.provider='revenuecat_google_play' and p.environment='sandbox'
              and p.product_type='premium_subscription' and p.status='sandbox' order by p.created_at,p.id limit 1`,
          [`runtime-composition-short-${n}`, user(n), String(n + 3).repeat(64), `runtime-composition-original-${n}`])).rows[0].result;
          check(result.status, 'processed', `real short Premium projection for ${n === 1 ? 'host' : 'viewer'}`);
          const value = await authority(db, 2);
          await db.exec('reset role');
          const cutoff = (await db.query(`select expires_at::text as value from public.user_entitlements
            where user_id=$1 and entitlement_key='premium'`, [user(n)])).rows[0].value;
          check(new Date(value.expiresAt).getTime(), new Date(cutoff).getTime(), `shorter ${n === 1 ? 'host' : 'viewer'} Premium cutoff bounds authority`);
        });
      }
      await mutation(`delete from auth.sessions where id='${session(2)}';`, async () => {
        const result = await authority(db, 2);
        check({ allowed: result.allowed, reason: result.reason },
          { allowed: false, reason: 'viewer_session_authority_invalid' }, 'deleted supplied session retains exact fail-closed reason');
      });
      await mutation(`insert into public.account_deletion_requests(user_id,status,delete_after,restore_deadline)
        values('${user(2)}','scheduled',now()+interval '30 days',now()+interval '30 days');`, async () => {
        const result = await authority(db, 2);
        check({ allowed: result.allowed, reason: result.reason },
          { allowed: false, reason: 'viewer_session_authority_invalid' }, 'restore-only supplied session retains exact fail-closed reason');
      });
      await mutation(`update public.wave1_legal_acceptances set invalidated_at=now() where user_id='${user(2)}';`, async () => {
        check((await authority(db, 2)).allowed, false, 'no successful-baseline bypass of current account legal acceptance');
      });
      await mutation(`update auth.users set deleted_at=now() where id='${user(1)}';`, async () => {
        check((await authority(db, 2)).allowed, false, 'deleted host remains denied before the predecessor');
      });
      await mutation(`update auth.users set banned_until=now()+interval '1 day' where id='${user(1)}';`, async () => {
        check((await authority(db, 2)).allowed, false, 'restricted host remains denied before the predecessor');
      });
      await mutation(`insert into public.paid_watch_party_offers(id,party_id,creator_id,host_id,title,price_cents,currency,status,provider,provider_product_key,provider_product_id)
        select 'af110003-0000-4000-8000-000000000001','${room}','${user(1)}','${user(1)}','Exact paid room',99,'usd','sandbox','revenuecat_google_play',p.product_key,p.provider_product_id
        from public.monetization_products p where p.product_key='watch_party_live_ticket_sandbox_099';`, async () => {
        check((await authority(db, 2)).allowed, false, 'existing paid offer cannot fall back to the free published-room proof');
      });
      await db.exec('rollback;');
      assert.equal(checks, 42, 'all declared old-control, positive, expiry and denial cases executed');
      t.diagnostic(`${checks} actual-SQL composition assertions; exact prior candidate failing controls retained`);
    } finally { await db.close(); }
  });
}

test('final Party Room chain preserves repaired authority through versioned publication and listing pause', async () => {
  const {db, replayReport} = await createDatabase({includeHeldStudio: true, applyRepair: true,
    repairInMigrationOrder: true, implicitApiGrants: false});
  const {host, friend, stranger} = liveFixtureActors;
  const party = 'RUNTIME-FINAL-PREMIUM';
  const as = (actor, fn, role = 'authenticated') => withLiveRoomActor(db, actor, fn, role);
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const current = () => one('select * from public.watch_party_rooms where party_id=$1', [party]);
  const resolve = actor => as(host, () => one('select public.resolve_watch_party_livekit_viewer_authority($1,$2,$3) result',
    [party, actor.id, actor.session]), 'service_role');
  const settings = (snapshot, paused = false) => as(host, () => one(`select public.set_watch_party_room_host_settings(
    $1,$2,$3,$4,'open','public','Current versioned Premium room','platform_title',$5,true,false,$6) result`,
  [party, snapshot.room_generation, snapshot.host_settings_revision, host.session, liveFixtureTitle, paused]));
  try {
    assert.deepEqual(replayReport.files.filter(file => liveSuccessorFiles.includes(file)), [...liveSuccessorFiles],
      'final proof includes the exact held successors in chronological order');
    await seedLiveRoomAuthority(db);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal((await one("select has_function_privilege($1,'public.publish_party_room_discovery(text,text,text,text)','EXECUTE') allowed", [role])).allowed,
        false, `${role} cannot execute the retired publication entrypoint`);
    }
    await assert.rejects(as(host, () => db.query('select public.publish_party_room_discovery($1,$2,$3,$4)',
      [party, 'platform_title', liveFixtureTitle, host.session])), /permission denied for function publish_party_room_discovery/);
    await as(host, () => db.query(`insert into public.watch_party_rooms(
      party_id,host_user_id,title_id,source_type,source_id,room_type,content_access_rule)
      values($1,$2,$3,'platform_title',$3,'title','premium')`, [party, host.id, liveFixtureTitle]));
    await as(host, () => db.query('select public.join_watch_party_room_session($1)', [party]));
    const unpublished = await current();
    assert.equal((await settings(unpublished)).result.published, true, 'current exact host publishes through versioned settings');
    await assert.rejects(settings(unpublished), /room_host_settings_conflict/, 'stale settings cannot overwrite current authority');
    await as(friend, () => db.query('select public.join_watch_party_room_session($1)', [party]));
    assert.equal((await resolve(friend)).result.allowed, true, 'current exact Premium member retains media admission');
    assert.equal((await resolve(host)).result.hostAuthority, true, 'current joined publisher retains host authority');
    assert.deepEqual(authorityShape((await resolve(stranger)).result), roomDenied, 'Premium alone never supplies published-room membership');
    const allowed = (await resolve(friend)).result;
    const now = Date.parse((await one('select now()::text value')).value);
    assert.ok(Date.parse(allowed.expiresAt) > now && Date.parse(allowed.expiresAt) <= now + 30000,
      'current published-room authority keeps its finite short TTL');
    await settings(await current(), true);
    assert.equal((await one('select private.party_room_publication_current($1) current', [party])).current, false,
      'listing pause withdraws current publication');
    assert.equal((await resolve(friend)).result.allowed, true, 'listing pause preserves the canonical joined-host admission proof');
    assert.deepEqual(authorityShape((await resolve(stranger)).result), roomDenied, 'pause grants no missing membership');
    await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [host.session]);
    assert.deepEqual(authorityShape((await resolve(friend)).result), roomDenied, 'expired bound host session retires paused admission too');
  } finally { await db.close(); }
});
