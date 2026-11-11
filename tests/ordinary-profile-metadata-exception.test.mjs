// Full chronological schema, real SQL and single-backend advisory ownership.
// This is NOT independent-backend contention, wait ordering or deadlock proof.
import assert from 'node:assert/strict';
import {nativeProductionMigrationFiles} from './helpers/native-production-migration-inventory.mjs';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedLiveRoomActor} from './helpers/live-room-authority-fixture.mjs';

const migration = '20261106073240_ordinary_commerce_canonical_lock_prefix.sql';
const tipSuccessor = '20261106170725_tip_commerce_gate_entry.sql';
const socialSuccessors = Object.freeze(['20261107173220_creator_video_social_engagement.sql','20261107191000_comment_likes.sql']);
const captureSuccessor = '20261107233954_isolated_test_store_capture_v1.sql';
const capacitySuccessor = '20261108095500_paid_party_ticket_capacity_accounting.sql';
const allowed = Object.freeze([
  'profile_avatar_scan_status', 'profile_avatar_scan_provider', 'profile_avatar_scan_result',
  'profile_avatar_scanned_at', 'profile_avatar_scan_error', 'profile_avatar_media_status',
  'profile_avatar_media_flagged_at', 'profile_background_scan_status', 'profile_background_scan_provider',
  'profile_background_scan_result', 'profile_background_scanned_at', 'profile_background_scan_error',
  'profile_background_media_status', 'profile_background_media_flagged_at', 'profile_media_updated_at', 'updated_at',
]);
const protectedColumns = Object.freeze([
  'user_id', 'username', 'avatar_index', 'display_name', 'avatar_url', 'tagline', 'channel_role',
  'likes_visibility', 'shares_visibility', 'default_watch_party_join_policy',
  'default_watch_party_reactions_policy', 'default_watch_party_content_access_rule',
  'default_watch_party_capture_policy', 'default_communication_content_access_rule',
  'default_communication_capture_policy', 'public_activity_visibility', 'follower_surface_enabled',
  'subscriber_surface_enabled', 'channel_layout_preset', 'profile_visibility', 'profile_avatar_fit_mode',
  'profile_avatar_focal_x', 'profile_avatar_focal_y', 'profile_background_url', 'profile_background_fit_mode',
  'profile_background_focal_x', 'profile_background_focal_y', 'profile_background_overlay_strength',
  'profile_access_visibility', 'platform_access_visibility',
]);
const retainedTriggers = Object.freeze([
  'enforce_user_profile_username_before', 'queue_profile_media_scan_before',
  'serialize_stripe_tip_buyer_authority_profile', 'zz_guard_profile_media_client_authority',
  'zzz_deleted_media_reference_guard', 'zzz_platform_brand_retention_reference',
  'zzzz_secondary_media_retired', 'enqueue_profile_media_scan_after', 'discovery_profile_subject_after_change',
]);
const authorityTables = Object.freeze([
  'auth.users', 'auth.sessions', 'public.account_deletion_requests', 'public.wave1_legal_acceptances',
  'public.access_grants', 'public.user_entitlements', 'public.revenuecat_premium_transaction_authority',
  'public.wave1_creator_eligibility', 'private.creator_eligibility_declarations',
  'public.creator_payout_accounts', 'public.creator_payout_eligibility_records',
  'private.creator_connect_mode_bindings', 'public.platform_money_kill_switches',
  'public.creator_tip_transactions', 'public.money_purchase_intents',
]);
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const identifier = value => `"${value.replaceAll('"', '""')}"`;

test('exact profile metadata exception preserves authority, late guards and real media callers', {timeout:240_000}, async t => {
  const {db, replayReport} = await createDatabase({implicitApiGrants:false});
  const scalar = async (sql, args=[]) => (await db.query(sql,args)).rows[0].value;
  const definition = signature => scalar('select pg_get_functiondef($1::regprocedure) value',[signature]);
  const rollback = async fn => {
    await db.exec('begin');
    try { return await fn(); } finally { await db.exec('rollback'); }
  };
  const owner = {id:randomUUID(), session:randomUUID()};
  const other = {id:randomUUID(), session:randomUUID()};
  const inspect = async fn => {
    const role=await scalar("select current_setting('role') value");
    await db.exec('reset role');
    try { return await fn(); } finally { if(role!=='none') await db.exec(`set local role ${identifier(role)}`); }
  };
  const profile = id => scalar('select to_jsonb(p) value from public.user_profiles p where user_id=$1',[id??owner.id]);
  const authority = async () => inspect(async()=>Object.fromEntries(await Promise.all(authorityTables.map(async table => [table,
    await scalar(`select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]'::jsonb) value from ${table} r`),
  ]))));
  const effects = async () => ({profile:await profile(), authority:await authority(),
    jobs:await scalar("select coalesce(jsonb_agg(to_jsonb(j) order by id),'[]'::jsonb) value from public.media_scan_jobs j"),
    audits:await scalar("select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]'::jsonb) value from public.platform_admin_audit_logs a"),
  });
  const asRole = async (actor, role, fn) => rollback(async () => {
    await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.role',$2,true)",
      [JSON.stringify({role,sub:actor?.id,session_id:actor?.session}),role]);
    await db.exec(`set local role ${role}`);
    return fn();
  });
  try {
    assert.equal(replayReport.files.length,628+socialSuccessors.length+nativeProductionMigrationFiles.length,'all 624 predecessors, profile/tip gates, social successors, independent capture and ticket capacity and explicit production successors execute');
    assert.deepEqual(replayReport.files.slice(-6-nativeProductionMigrationFiles.length),[migration,tipSuccessor,...socialSuccessors,captureSuccessor,capacitySuccessor,...nativeProductionMigrationFiles],'the current chain preserves the exact final migration order');
    assert.deepEqual(replayReport.excludedMigrations,[]);
    assert.deepEqual(replayReport.overlayFiles,[]);
    const columns = (await db.query("select attname from pg_attribute where attrelid='public.user_profiles'::regclass and attnum>0 and not attisdropped order by attnum")).rows.map(row=>row.attname);
    assert.deepEqual([...columns].sort(),[...allowed,...protectedColumns].sort(),'new schema fields must be explicitly reviewed');
    const triggerCatalog = (await db.query(`select t.tgname,t.tgtype,t.tgdeferrable,t.tginitdeferred,
      pg_get_triggerdef(t.oid) definition,p.proname,n.nspname,t.tgfoid,
      array(select a.attname from pg_attribute a where a.attrelid=t.tgrelid and a.attnum=any(t.tgattr) order by a.attname) columns
      from pg_trigger t join pg_proc p on p.oid=t.tgfoid join pg_namespace n on n.oid=p.pronamespace
      where t.tgrelid='public.user_profiles'::regclass and not t.tgisinternal order by t.tgname`)).rows;
    for (const name of retainedTriggers) assert.ok(triggerCatalog.some(row=>row.tgname===name),`${name} remains installed`);

    // Test-only capture triggers report actual catalog locks. They do not obtain
    // any lock or replace an authority predicate, guard, trigger or production body.
    await db.exec(`create temporary table profile_prefix_trace(
      sequence bigint generated always as identity,stage text,operation text,gate boolean,brand boolean,retirement boolean,user_fence boolean);
      create function pg_temp.capture_profile_prefix() returns trigger language plpgsql security definer set search_path='' as $$
      declare subject text:=case when tg_level='STATEMENT' then null when tg_op='DELETE' then old.user_id else new.user_id end;
      begin
        insert into pg_temp.profile_prefix_trace(stage,operation,gate,brand,retirement,user_fence)
        select tg_argv[0],tg_op,
          exists(select 1 from pg_catalog.pg_locks l where l.pid=pg_backend_pid() and l.locktype='advisory'
            and l.database=(select oid from pg_database where datname=current_database())
            and l.classid=176214 and l.objid=32 and l.objsubid=2 and l.mode='ExclusiveLock' and l.granted),
          exists(select 1 from pg_catalog.pg_locks l where l.pid=pg_backend_pid() and l.locktype='advisory'
            and l.classid=176214 and l.objid=30 and l.objsubid=2 and l.mode='ExclusiveLock' and l.granted),
          exists(select 1 from pg_catalog.pg_locks l where l.pid=pg_backend_pid() and l.locktype='relation'
            and l.relation='private.deleted_media_reference_fence'::regclass and l.mode='RowShareLock' and l.granted),
          exists(select 1 from pg_catalog.pg_locks l where l.pid=pg_backend_pid() and l.locktype='advisory'
            and l.classid=((hashtextextended('stripe-tip-buyer-authority-user:'||subject,0)>>32)&4294967295)::oid
            and l.objid=(hashtextextended('stripe-tip-buyer-authority-user:'||subject,0)&4294967295)::oid
            and l.objsubid=1 and l.mode='ExclusiveLock' and l.granted);
        if tg_level='STATEMENT' then return null; end if;
        if tg_op='DELETE' then return old; end if; return new;
      end $$;
      create trigger zzzzzz_fixture_profile_statement before insert or update or delete on public.user_profiles
        for each statement execute function pg_temp.capture_profile_prefix('statement');
      create trigger "000000_fixture_profile_row" before insert or update or delete on public.user_profiles
        for each row execute function pg_temp.capture_profile_prefix('row');
      create trigger zzzzzz_fixture_profile_stored after insert or update or delete on public.user_profiles
        for each row execute function pg_temp.capture_profile_prefix('stored');`);
    const trace = async () => inspect(async()=>(await db.query('select stage,operation,gate,brand,retirement,user_fence from pg_temp.profile_prefix_trace order by sequence')).rows);
    const assertTrace = async (gate, {operation='UPDATE',brand=true}={}) => {
      const rows = await trace();
      assert.deepEqual(rows.map(row=>row.stage),['statement','row','stored']);
      for (const row of rows) {
        assert.equal(row.gate,gate,`${row.stage}: exact commerce gate ownership`);
        assert.equal(row.operation,operation);
        if (brand) { assert.equal(row.brand,true,`${row.stage}: Brand ownership`); assert.equal(row.retirement,true,`${row.stage}: full retirement predecessor`); }
      }
      assert.equal(rows[0].user_fence,false,'statement prefix precedes buyer-user fence');
      assert.equal(rows[1].user_fence,false,'entry row capture precedes buyer-user fence');
      assert.equal(rows[2].user_fence,gate,'protected no-ops retain user serialization; metadata does not acquire it');
    };
    for (const actor of [owner,other]) {
      await seedLiveRoomActor(db,actor,{premium:false});
      await db.query(`insert into public.user_profiles(user_id,username) values($1,$2) on conflict(user_id) do nothing`,
        [actor.id,`profile_${actor.id.replaceAll('-','').slice(0,10)}`]);
    }
    await db.exec('truncate pg_temp.profile_prefix_trace');
    const baseline = await profile();
    const authorityBefore = await authority();
    await t.test('the production comparator rejects all 79 independent transition vectors exactly',async()=>{
      const vectors=[['unchanged',{},true],
        ...allowed.map(column=>[`allowed ${column}`,{[column]:'SYNTHETIC changed JSON value'},true]),
        ...protectedColumns.map(column=>[`protected ${column}`,{[column]:'SYNTHETIC changed JSON value'},false]),
        ...protectedColumns.map(column=>[`mixed ${column}`,{[column]:'SYNTHETIC protected delta',profile_avatar_scan_result:'SYNTHETIC allowed delta'},false]),
        ['unknown',{fixture_future_authority:'SYNTHETIC future'},false],
        ['all allowed',Object.fromEntries(allowed.map(column=>[column,'SYNTHETIC all allowed'])),true],
      ];
      assert.equal(vectors.length,79);
      for(const [label,patch,expected] of vectors) assert.equal(await scalar(
        'select private.ordinary_profile_metadata_only_change($1::jsonb,$2::jsonb) value',
        [JSON.stringify(baseline),JSON.stringify({...baseline,...patch})]),expected,label);
    });
    const allowedValues = Object.fromEntries(allowed.map(column=>[column,
      /(?:_at|updated_at)$/u.test(column) ? '2001-02-03T04:05:06Z' :
      column.endsWith('_scan_status') ? 'clean' : column.endsWith('_media_status') ? 'user_removed' : 'SYNTHETIC metadata',
    ]));
    for (const column of allowed) await t.test(`allowed-only ${column}`,()=>rollback(async()=>{
      await db.query(`update public.user_profiles set ${identifier(column)}=$1 where user_id=$2`,[allowedValues[column],owner.id]);
      const after = await profile();
      assert.notDeepEqual(after[column],baseline[column],`${column}: actual field changed`);
      for (const key of protectedColumns) assert.deepEqual(after[key],baseline[key],`${column}: preserves ${key}`);
      await assertTrace(false);
      assert.deepEqual(await authority(),authorityBefore,`${column}: identity, legal, Premium, provider and financial rows unchanged`);
    }));
    for (const column of protectedColumns) await t.test(`protected SET-list no-op ${column}`,()=>rollback(async()=>{
      await db.query(`update public.user_profiles set ${identifier(column)}=${identifier(column)} where user_id=$1`,[owner.id]);
      await assertTrace(true);
      assert.deepEqual(await profile(),baseline,'no-op remains a genuine no-op');
      assert.deepEqual(await authority(),authorityBefore);
    }));

    for (const kind of ['avatar','background']) await db.query(`insert into storage.objects(id,bucket_id,name,owner,owner_id,metadata)
      values($1,'profile-media',$2,$3::uuid,$3::text,'{"mimetype":"image/jpeg","size":1024}'::jsonb)`,
      [randomUUID(),`${owner.id}/${kind}/fixture.jpg`,owner.id]);
    const protectedValues = {
      user_id:randomUUID(),username:'profile_changed',avatar_index:2,display_name:'SYNTHETIC display',
      avatar_url:await scalar('select public.profile_media_public_url($1,$2) value',[owner.id,`${owner.id}/avatar/fixture.jpg`]),
      tagline:'SYNTHETIC tagline',channel_role:'creator',likes_visibility:'private',shares_visibility:'private',
      default_watch_party_join_policy:'locked',default_watch_party_reactions_policy:'disabled',
      default_watch_party_content_access_rule:'members_only',default_watch_party_capture_policy:'host_managed',
      default_communication_content_access_rule:'members_only',default_communication_capture_policy:'host_managed',
      public_activity_visibility:'private',follower_surface_enabled:true,subscriber_surface_enabled:true,
      channel_layout_preset:'live_first',profile_visibility:'private',profile_avatar_fit_mode:'fit',
      profile_avatar_focal_x:0.25,profile_avatar_focal_y:0.25,
      profile_background_url:await scalar('select public.profile_media_public_url($1,$2) value',[owner.id,`${owner.id}/background/fixture.jpg`]),
      profile_background_fit_mode:'fit',profile_background_focal_x:0.25,profile_background_focal_y:0.25,
      profile_background_overlay_strength:0.25,profile_access_visibility:'private',platform_access_visibility:'private',
    };
    for (const mixed of [false,true]) for (const column of protectedColumns)
      await t.test(`${mixed?'mixed protected+metadata':'protected changed'} ${column}`,()=>rollback(async()=>{
        await db.query(`update public.user_profiles set ${identifier(column)}=$1${mixed?",profile_media_updated_at='2001-02-03T04:05:06Z'":''} where user_id=$2`,
          [protectedValues[column],owner.id]);
        const after = await profile(column==='user_id'?protectedValues.user_id:owner.id);
        assert.notDeepEqual(after[column],baseline[column],`${column}: actual protected delta`);
        await assertTrace(true);
        assert.deepEqual(await authority(),authorityBefore,'profile changes do not manufacture identity, Premium, provider or financial rows');
      }));
    await t.test('all sixteen allowed fields, unchanged metadata, INSERT and DELETE',async()=>{
      await rollback(async()=>{
        const setters=allowed.map((column,index)=>`${identifier(column)}=$${index+1}`).join(',');
        await db.query(`update public.user_profiles set ${setters} where user_id=$17`,[...allowed.map(column=>allowedValues[column]),owner.id]);
        await assertTrace(false);
        assert.deepEqual(await authority(),authorityBefore);
      });
      await rollback(async()=>{
        await db.query('update public.user_profiles set updated_at=updated_at where user_id=$1',[owner.id]);
        await assertTrace(false);
        assert.deepEqual(await profile(),baseline);
      });
      await rollback(async()=>{
        await db.query("insert into public.user_profiles(user_id,username) values($1,'synthetic_insert')",[randomUUID()]);
        await assertTrace(true,{operation:'INSERT'});
      });
      await rollback(async()=>{
        await db.query('delete from public.user_profiles where user_id=$1',[owner.id]);
        await assertTrace(true,{operation:'DELETE',brand:false});
      });
    });

    await t.test('clients retain scan, moderation, owner and storage-provenance denials',async()=>{
      for (const [actor,mutation,error] of [
        [owner,"profile_avatar_scan_status='clean'",/profile_avatar_scan_fields_server_owned/u],
        [owner,"profile_background_scan_provider='SYNTHETIC forgery'",/profile_background_scan_fields_server_owned/u],
        [owner,"profile_avatar_media_status='flagged'",/profile_media_status_server_owned/u],
        [owner,`avatar_url=${quote(protectedValues.avatar_url.replaceAll(owner.id,other.id))}`,/profile_avatar_storage_provenance_invalid/u],
      ]) {
        const before=await effects();
        await assert.rejects(asRole(actor,'authenticated',()=>db.query(`update public.user_profiles set ${mutation} where user_id=$1`,[owner.id])),error);
        assert.deepEqual(await effects(),before,'denied client write has no profile, queue, audit or financial effects');
      }
      await asRole(other,'authenticated',async()=>{
        const result=await db.query("update public.user_profiles set profile_avatar_scan_status='clean' where user_id=$1 returning user_id",[owner.id]);
        assert.deepEqual(result.rows,[],'RLS prevents another user from changing the profile');
      });
      assert.deepEqual(await profile(),baseline);
    });

    // The reviewed social successor adds a distinct, column-limited withdrawal
    // trigger. Inventory it exactly rather than weakening the unique commerce
    // actual-NEW backstop requirement or ignoring arbitrary new AFTER triggers.
    const socialPrivacy = triggerCatalog.filter(row=>row.tgname==='creator_video_reposts_profile_privacy');
    assert.deepEqual(socialPrivacy.map(({tgname,tgtype,tgdeferrable,tginitdeferred,proname,nspname,columns})=>
      ({tgname,tgtype,tgdeferrable,tginitdeferred,proname,nspname,columns})), [{
      tgname:'creator_video_reposts_profile_privacy',tgtype:17,tgdeferrable:false,tginitdeferred:false,
      proname:'profile_privacy_changed',nspname:'video_engagement_private',
      columns:['profile_access_visibility','profile_visibility','shares_visibility'],
    }]);
    const actualGuards = triggerCatalog.filter(row=>(row.tgtype&3)===1 && (row.tgtype&16)!==0
      && !retainedTriggers.includes(row.tgname) && !socialPrivacy.includes(row));
    assert.equal(actualGuards.length,1,'one immediate AFTER ROW actual-NEW assertion supplements existing triggers');
    const actualGuard=actualGuards[0];
    assert.equal(actualGuard.tgdeferrable,false);
    assert.equal(actualGuard.tginitdeferred,false);
    const finalDefinition=await definition(`${actualGuard.nspname}.${actualGuard.proname}()`);
    assert.doesNotMatch(finalDefinition,/pg_advisory_(?:xact_)?lock|perform\s+private\.(?:platform_brand_retention_lock|lock_ordinary_commerce)/iu,
      'actual-NEW backstop asserts and never waits for a prefix after a profile tuple');
    const prefixRequired=/ordinary_commerce_[a-z_]*(?:required|missing)/u;
    const installMutation = (assignment, {legacyURL=false}={}) => db.exec(`
      create function pg_temp.mutate_profile_after_guards() returns trigger language plpgsql set search_path='' as $$
      begin ${assignment};
        insert into pg_temp.profile_mutation_effect values('must roll back with rejected profile');
        return new;
      end $$;
      create trigger zzzzzzzz_fixture_mutate_actual_new before update${legacyURL?' of profile_avatar_scan_result':''} on public.user_profiles
        for each row execute function pg_temp.mutate_profile_after_guards();`);
    await db.exec('create temporary table profile_mutation_effect(note text)');
    await t.test('unknown future fields fail closed without a protected statement prefix',()=>rollback(async()=>{
      await db.exec('alter table public.user_profiles add column fixture_future_authority text');
      await db.exec("set local app.ordinary_commerce_authority_gate='true';set local app.ordinary_commerce_writer_prefix='true'");
      await db.exec('savepoint rejected_future');
      await assert.rejects(db.query("update public.user_profiles set fixture_future_authority='SYNTHETIC' where user_id=$1",[owner.id]),prefixRequired);
      await db.exec('rollback to savepoint rejected_future');
      assert.equal((await profile()).fixture_future_authority,null);
      assert.deepEqual(await trace(),[],'statement/row writes roll back with denied future authority');
      await db.query("update public.user_profiles set username=username,fixture_future_authority='SYNTHETIC' where user_id=$1",[owner.id]);
      await assertTrace(true);
      assert.equal((await profile()).fixture_future_authority,'SYNTHETIC');
      assert.deepEqual(await authority(),authorityBefore);
    }));
    for (const [label,assignment,addColumn] of [
      ['role',"new.channel_role:='creator'",false],
      ['visibility',"new.profile_access_visibility:='private'",false],
      ['identity',`new.user_id:=${quote(randomUUID())}`,false],
      ['unknown future column',"new.fixture_future_authority:='SYNTHETIC'",true],
    ]) await t.test(`actual NEW rejects later BEFORE-trigger ${label} changes`,async()=>{
      const before=await effects();
      await rollback(async()=>{
        if(addColumn) await db.exec('alter table public.user_profiles add column fixture_future_authority text');
        await installMutation(assignment);
        await db.exec('savepoint rejected_mutation');
        await assert.rejects(db.query("update public.user_profiles set profile_avatar_scan_result='SYNTHETIC' where user_id=$1",[owner.id]),prefixRequired);
        await db.exec('rollback to savepoint rejected_mutation');
        assert.equal(await scalar('select count(*)::int value from pg_temp.profile_mutation_effect'),0,'downstream BEFORE effects are rolled back');
        assert.deepEqual(await trace(),[]);
      });
      assert.deepEqual(await effects(),before,'profile, jobs, audit and financial effects all roll back');
    });
    await t.test('moving the final assertion before mutable triggers is a killed mutant',()=>rollback(async()=>{
      await installMutation("new.channel_role:='creator'");
      // A BEFORE trigger must return NEW to preserve the UPDATE. Keep the exact
      // assertion body and change only its timing/return semantics in this
      // rolled-back mutant. An AFTER-only RETURN NULL is otherwise suppression,
      // not a faithful earlier-guard mutant.
      await db.exec(finalDefinition.replace(/return null;/giu,'return new;'));
      await db.exec(`drop trigger ${identifier(actualGuard.tgname)} on public.user_profiles`);
      await db.exec(actualGuard.definition.replace(/\bAFTER\b/u,'BEFORE')+';');
      await db.query("update public.user_profiles set profile_avatar_scan_result='SYNTHETIC mutant' where user_id=$1",[owner.id]);
      assert.equal((await profile()).channel_role,'creator','earlier guard mutant incorrectly permits protected actual NEW');
      assert.equal(await scalar('select count(*)::int value from pg_temp.profile_mutation_effect'),1);
      assert.equal((await trace()).at(-1).gate,false,'mutant bypass is demonstrably ungated');
    }));
    assert.equal(await definition(`${actualGuard.nspname}.${actualGuard.proname}()`),finalDefinition,'mutant never changes the tested production function');

    await db.query('update public.user_profiles set avatar_url=$1,profile_background_url=$2 where user_id=$3',
      [protectedValues.avatar_url,protectedValues.profile_background_url,owner.id]);
    await db.exec('truncate pg_temp.profile_prefix_trace');
    const jobs=(await db.query("select id,target_column from public.media_scan_jobs where target_table='user_profiles' and target_id=$1 order by target_column",[owner.id])).rows;
    assert.equal(jobs.length,2,'real profile enqueue creates both exact-object jobs');
    const avatarJob=jobs.find(row=>row.target_column==='profile_avatar').id;
    const backgroundJob=jobs.find(row=>row.target_column==='profile_background').id;
    await t.test('actual service completion and capped recovery preserve exact authority',async()=>{
      for (const job of [avatarJob,backgroundJob]) await asRole(null,'service_role',async()=>{
        const before=await profile();
        const result=await scalar("select public.complete_media_scan_job($1,'clean','clamav','SYNTHETIC version',null,null,null,1) value",[job]);
        assert.equal(result.targetPropagationComplete,true,'canonical callback propagates without a commerce gate');
        const after=await profile();
        for(const column of protectedColumns) assert.deepEqual(after[column],before[column],`completion preserves ${column}`);
        assert.equal(after[job===avatarJob?'profile_avatar_scan_status':'profile_background_scan_status'],'clean');
        await assertTrace(false);
        assert.deepEqual(await authority(),authorityBefore);
      });
      await asRole(null,'service_role',async()=>{
        await db.query("update public.media_scan_jobs set status='scan_failed',attempt_count=max_attempts where id=$1",[avatarJob]);
        const result=await scalar('select public.recover_media_scan_jobs(20,25) value');
        assert.equal(result.cappedManualReviewCount,1);
        assert.equal(result.moneyMoved,false);
        assert.equal(result.userRightsChanged,false);
        assert.equal((await profile()).profile_avatar_scan_status,'manual_review');
        await assertTrace(false);
        assert.deepEqual(await authority(),authorityBefore);
      });
      assert.match(await definition('public.recover_media_scan_jobs(integer,integer)'),/for update skip locked/iu);
      for(const signature of [
        'public.recover_media_scan_jobs(integer,integer)',
        'public.complete_media_scan_job(uuid,text,text,text,text,text,text,integer)',
        'public.enqueue_profile_media_scan()',
      ]) assert.doesNotMatch(await definition(signature),/ordinary_commerce/iu,`${signature}: no newly added commerce wait on media ancestry`);
    });
    await t.test('legacy URL normalization fails closed in a real service callback, then succeeds with a preheld gate',async()=>{
      const legacyURL=await scalar("select public.profile_media_public_origin()||'/storage/v1/object/public/profile-media/'||$1 value",[`${owner.id}/avatar/fixture.jpg`]);
      await installMutation(`new.avatar_url:=${quote(legacyURL)}`,{legacyURL:true});
      // A protected SET-list provides the valid gate while a disposable later
      // trigger creates a legacy stored URL. No production guard is disabled.
      await db.query("update public.user_profiles set username=username,profile_avatar_scan_result='SYNTHETIC legacy seed' where user_id=$1",[owner.id]);
      await db.exec('drop trigger zzzzzzzz_fixture_mutate_actual_new on public.user_profiles;drop function pg_temp.mutate_profile_after_guards()');
      assert.equal((await profile()).avatar_url,legacyURL);
      await db.exec('truncate pg_temp.profile_prefix_trace');
      const before=await profile();
      await asRole(null,'service_role',async()=>{
        const result=await scalar("select public.complete_media_scan_job($1,'clean','clamav','SYNTHETIC version',null,null,null,1) value",[avatarJob]);
        assert.equal(result.targetPropagationComplete,false,'actual target normalization cannot silently gain authority');
        assert.equal(result.targetPropagationFailure,'target_update_blocked');
        assert.deepEqual(await profile(),before,'target subtransaction rolls back URL normalization and scan metadata');
        assert.deepEqual(await trace(),[],'target trace rolls back inside the real completion savepoint');
        assert.equal(await scalar('select status value from public.media_scan_jobs where id=$1',[avatarJob]),'clean','existing durable queue fallback remains');
        assert.deepEqual(await authority(),authorityBefore);
      });
      await asRole(null,'service_role',async()=>{
        // Service callers cannot directly execute this private helper. A
        // protected no-op on a DIFFERENT profile acquires the legitimate gate
        // without normalizing the target; completion must normalize actual NEW.
        await db.query('update public.user_profiles set username=username where user_id=$1',[other.id]);
        assert.equal((await profile()).avatar_url,legacyURL,'target is still noncanonical at real media-root entry');
        await inspect(()=>db.exec('truncate pg_temp.profile_prefix_trace'));
        const result=await scalar("select public.complete_media_scan_job($1,'clean','clamav','SYNTHETIC version',null,null,null,1) value",[avatarJob]);
        assert.equal(result.targetPropagationComplete,true);
        assert.equal((await profile()).avatar_url,protectedValues.avatar_url);
        const rows=await trace();
        assert.ok(rows.every(row=>row.gate && row.brand && row.retirement),'preheld gate authorizes actual normalized NEW');
        assert.deepEqual(await authority(),authorityBefore);
      });
    });

    t.diagnostic('Real full-schema SQL/ownership checks only. Independent native backends must prove gate-before-tuple waits and retained baseline media contention separately.');
  } catch(error) {
    t.diagnostic(JSON.stringify({message:error.message,where:error.where,query:error.query,internalQuery:error.internalQuery}));
    throw error;
  } finally { await db.close(); }
});
