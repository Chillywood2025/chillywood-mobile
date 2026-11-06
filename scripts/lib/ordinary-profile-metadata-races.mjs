// Only a guarded disposable native runner may supply session()/until().
// The separate sequential export exercises identical SQL, never fake backends.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {commerceSeedAdapter,seedCommerceBuyer} from '../../tests/helpers/automatic-commerce-fixture.mjs';

const allowed = [
  'profile_avatar_scan_status','profile_avatar_scan_provider','profile_avatar_scan_result','profile_avatar_scanned_at',
  'profile_avatar_scan_error','profile_avatar_media_status','profile_avatar_media_flagged_at',
  'profile_background_scan_status','profile_background_scan_provider','profile_background_scan_result',
  'profile_background_scanned_at','profile_background_scan_error','profile_background_media_status',
  'profile_background_media_flagged_at','profile_media_updated_at','updated_at',
];
const protectedColumns = [
  'user_id','username','avatar_index','display_name','avatar_url','tagline','channel_role','likes_visibility','shares_visibility',
  'default_watch_party_join_policy','default_watch_party_reactions_policy','default_watch_party_content_access_rule',
  'default_watch_party_capture_policy','default_communication_content_access_rule','default_communication_capture_policy',
  'public_activity_visibility','follower_surface_enabled','subscriber_surface_enabled','channel_layout_preset','profile_visibility',
  'profile_avatar_fit_mode','profile_avatar_focal_x','profile_avatar_focal_y','profile_background_url','profile_background_fit_mode',
  'profile_background_focal_x','profile_background_focal_y','profile_background_overlay_strength','profile_access_visibility','platform_access_visibility',
];
const service = "set local role service_role;set local request.jwt.claims='{\"role\":\"service_role\"}';set local request.jwt.claim.role='service_role';";
const gate = 'select private.lock_ordinary_commerce_authority_gate();';
const jsonRows = text => String(text).split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
const lastJSON = text => jsonRows(text).at(-1);
const gateHeld = `exists(select 1 from pg_locks where pid=pg_backend_pid() and locktype='advisory'
  and database=(select oid from pg_database where datname=current_database())
  and classid=176214 and objid=32 and objsubid=2 and mode='ExclusiveLock' and granted)`;
const brandHeld = `exists(select 1 from pg_locks where pid=pg_backend_pid() and locktype='advisory'
  and classid=176214 and objid=30 and objsubid=2 and mode='ExclusiveLock' and granted)`;
const retirementHeld = `exists(select 1 from pg_locks where pid=pg_backend_pid() and locktype='relation'
  and relation='private.deleted_media_reference_fence'::regclass and mode='RowShareLock' and granted)`;

export async function seedOrdinaryProfileMetadataFixture({query,lit}) {
  const db=commerceSeedAdapter(query),owner=await seedCommerceBuyer(db),other=await seedCommerceBuyer(db);
  for(const actor of [owner,other]) await query(`insert into public.user_profiles(user_id,username)
    values(${lit(actor.id)},${lit('profile_'+actor.id.replaceAll('-','').slice(0,10))}) on conflict(user_id) do nothing;`);
  for(const kind of ['avatar','background']) await query(`insert into storage.objects(id,bucket_id,name,owner,owner_id,metadata)
    values(${lit(randomUUID())},'profile-media',${lit(`${owner.id}/${kind}/fixture.jpg`)},${lit(owner.id)}::uuid,${lit(owner.id)},
      '{"mimetype":"image/jpeg","size":1024}'::jsonb);`);
  const values={
    user_id:randomUUID(),username:'profile_'+randomUUID().replaceAll('-','').slice(0,10),avatar_index:2,display_name:'SYNTHETIC display',
    avatar_url:await query(`select public.profile_media_public_url(${lit(owner.id)},${lit(`${owner.id}/avatar/fixture.jpg`)})`),
    tagline:'SYNTHETIC tagline',channel_role:'creator',likes_visibility:'private',shares_visibility:'private',
    default_watch_party_join_policy:'locked',default_watch_party_reactions_policy:'disabled',
    default_watch_party_content_access_rule:'members_only',default_watch_party_capture_policy:'host_managed',
    default_communication_content_access_rule:'members_only',default_communication_capture_policy:'host_managed',
    public_activity_visibility:'private',follower_surface_enabled:true,subscriber_surface_enabled:true,
    channel_layout_preset:'live_first',profile_visibility:'private',profile_avatar_fit_mode:'fit',profile_avatar_focal_x:0.25,profile_avatar_focal_y:0.25,
    profile_background_url:await query(`select public.profile_media_public_url(${lit(owner.id)},${lit(`${owner.id}/background/fixture.jpg`)})`),
    profile_background_fit_mode:'fit',profile_background_focal_x:0.25,profile_background_focal_y:0.25,profile_background_overlay_strength:0.25,
    profile_access_visibility:'private',platform_access_visibility:'private',
  };
  const profileSQL=`select to_jsonb(p) from public.user_profiles p where user_id=${lit(owner.id)}`;
  const baseline=lastJSON(await query(profileSQL));
  const authorityTables=['auth.users','auth.sessions','public.wave1_legal_acceptances','public.account_deletion_requests',
    'public.access_grants','public.user_entitlements','public.revenuecat_premium_transaction_authority',
    'public.wave1_creator_eligibility','private.creator_eligibility_declarations','public.creator_payout_accounts',
    'public.creator_payout_eligibility_records','private.creator_connect_mode_bindings','public.platform_money_kill_switches',
    'public.money_purchase_intents','public.creator_tip_transactions','public.creator_earnings_ledger'];
  const authoritySQL=`select jsonb_build_object(${authorityTables.map(table=>`${lit(table)},
    (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]'::jsonb) from ${table} r)`).join(',')})`;
  const authorityBefore=lastJSON(await query(authoritySQL));
  // Inspect privileged catalog objects only AFTER the real caller's SQL has
  // completed. Do not give service_role private-schema access to observe locks.
  const evidenceSQL=(target=owner.id)=>`reset role;select jsonb_build_object('profileEvidence',true,'workerPid',pg_backend_pid(),
    'profile',(select to_jsonb(p) from public.user_profiles p where user_id=${lit(target)}),
    'gateHeld',${gateHeld},'brandHeld',${brandHeld},'retirementHeld',${retirementHeld},
    'userFenceHeld',exists(select 1 from pg_locks where pid=pg_backend_pid() and locktype='advisory' and objsubid=1
      and classid=((hashtextextended('stripe-tip-buyer-authority-user:'||${lit(target)},0)>>32)&4294967295)::oid
      and objid=(hashtextextended('stripe-tip-buyer-authority-user:'||${lit(target)},0)&4294967295)::oid
      and mode='ExclusiveLock' and granted));`;
  return {owner,other,values,baseline,profileSQL,authoritySQL,authorityBefore,evidenceSQL};
}

function transitionCases(f,lit) {
  const allowedValues=Object.fromEntries(allowed.map(column=>[column,/(?:_at|updated_at)$/u.test(column)?'2001-02-03T04:05:06Z':
    column.endsWith('_scan_status')?'clean':column.endsWith('_media_status')?'user_removed':'SYNTHETIC metadata']));
  const mutation=(set)=>`update public.user_profiles set ${set} where user_id=${lit(f.owner.id)};`;
  const cases=allowed.map(column=>({label:`allowed-only ${column}`,column,gate:false,sql:mutation(`${column}=${lit(allowedValues[column])}`)}));
  cases.push({label:'allowed-only unchanged metadata',gate:false,sql:mutation('updated_at=updated_at')});
  cases.push({label:'all sixteen allowed fields',gate:false,sql:mutation(allowed.map(column=>`${column}=${lit(allowedValues[column])}`).join(','))});
  for(const column of protectedColumns) for(const mode of ['changed','mixed','no-op']) cases.push({
    label:`protected ${mode} ${column}`,column,gate:true,mode,
    target:column==='user_id'&&mode!=='no-op'?f.values.user_id:f.owner.id,
    sql:mutation(`${column}=${mode==='no-op'?column:lit(f.values[column])}${mode==='mixed'?",profile_media_updated_at='2001-02-03T04:05:06Z'":''}`),
  });
  return cases;
}

function assertTransition(f,c,record) {
  assert.equal(record.profileEvidence,true,c.label);
  assert.equal(record.gateHeld,c.gate,c.label);
  assert.equal(record.brandHeld,true,`${c.label}: actual full Brand`);
  assert.equal(record.retirementHeld,true,`${c.label}: retirement predecessor`);
  assert.equal(record.userFenceHeld,c.gate,`${c.label}: identity fence is skipped only for ungated metadata`);
  if(!c.gate) for(const column of protectedColumns) assert.deepEqual(record.profile[column],f.baseline[column],`${c.label}: ${column}`);
  if(c.column&&c.mode!=='no-op') assert.notDeepEqual(record.profile[c.column],f.baseline[c.column],`${c.label}: actual changed value`);
  if(c.mode==='no-op') assert.deepEqual(record.profile,f.baseline,c.label);
}

async function assertUnchanged({query},f) {
  assert.deepEqual(lastJSON(await query(f.profileSQL)),f.baseline,'rolled-back profile schedule leaves every exact profile field unchanged');
  assert.deepEqual(lastJSON(await query(f.authoritySQL)),f.authorityBefore,'identity, legal, Premium, provider, intent, grant and financial rows unchanged');
}

// These statements are also used unchanged by the sequential setup export.
async function installLateMutationFixture({query,lit},f) {
  const schema='profile_metadata_native_'+randomUUID().replaceAll('-','');
  await query(`create schema ${schema};create table ${schema}.effects(note text);
    create function ${schema}.tamper() returns trigger language plpgsql set search_path='' as $$
    begin
      if old.user_id=${lit(f.owner.id)} and new.profile_avatar_scan_result='SYNTHETIC late trigger' then
        new:=jsonb_populate_record(new,jsonb_build_object(tg_argv[0],tg_argv[1]));
        insert into ${schema}.effects values('must roll back');
      end if;
      return new;
    end $$;`);
  const name='zzzzzzzz_profile_metadata_native';
  return {schema,name,
    async install(column,value) { await query(`create trigger ${name} before update on public.user_profiles for each row
      execute function ${schema}.tamper(${lit(column)},${lit(value)});`); },
    async remove() { await query(`drop trigger ${name} on public.user_profiles`); },
    async clean() { await query(`drop schema ${schema} cascade`); },
    sql:`update public.user_profiles set profile_avatar_scan_result='SYNTHETIC late trigger' where user_id=${lit(f.owner.id)};`,
    effectsSQL:`select count(*) from ${schema}.effects`,
  };
}

async function prepareMediaFixture({query,lit},f) {
  await query(`update public.user_profiles set avatar_url=${lit(f.values.avatar_url)},profile_background_url=${lit(f.values.profile_background_url)}
    where user_id=${lit(f.owner.id)};`);
  const jobs=JSON.parse(await query(`select jsonb_object_agg(target_column,id) from public.media_scan_jobs
    where target_table='user_profiles' and target_id=${lit(f.owner.id)}`));
  assert.ok(jobs.profile_avatar&&jobs.profile_background);
  const profile=lastJSON(await query(f.profileSQL));
  const complete=job=>service+`select jsonb_build_object('callback',public.complete_media_scan_job(${lit(job)},'clean','clamav','SYNTHETIC native',null,null,null,1));`;
  const recover=service+"select jsonb_build_object('recovery',public.recover_media_scan_jobs(20,1));";
  const prepareCapped=async()=>{
    assert.equal(await query(`select count(*) from public.media_scan_jobs where target_id<>${lit(f.owner.id)}
      and ((status='scan_failed' and attempt_count>=max_attempts) or (status='scanning' and claimed_at<now()-interval '20 minutes'))`),'0',
    'recovery fixture must not silently sweep unrelated stale/capped jobs');
    await query(`update public.media_scan_jobs set status='scan_failed',attempt_count=max_attempts,
      updated_at=case when id=${lit(jobs.profile_avatar)} then '2001-01-01'::timestamptz else '2001-01-02'::timestamptz end
      where id in(${lit(jobs.profile_avatar)},${lit(jobs.profile_background)});`);
  };
  const prepareSkipLockedControl=async()=>{
    await query(`update public.user_profiles set profile_avatar_scan_status='clean' where user_id=${lit(f.owner.id)};`);
    // That UPDATE really enqueues the pending background. Restore the fixture
    // queue caps AFTER the real enqueue, without changing either profile target.
    await prepareCapped();
    assert.equal(await query(`select count(*) from public.media_scan_jobs where id in(${lit(jobs.profile_avatar)},${lit(jobs.profile_background)})
      and status='scan_failed' and attempt_count>=max_attempts`),'2');
    const control=lastJSON(await query(f.profileSQL));
    assert.equal(control.profile_avatar_scan_status,'clean');assert.equal(control.profile_background_scan_status,'pending_scan');
  };
  return {jobs,profile,complete,recover,prepareCapped,prepareSkipLockedControl};
}

// Setup/effects only: executes real production SQL and actual trigger rollback,
// without session(), pg_blocking_pids, pretend PIDs or native outcome claims.
export async function runOrdinaryProfileMetadataSequential({query,lit}) {
  const f=await seedOrdinaryProfileMetadataFixture({query,lit});let transitions=0,tampering=0;
  for(const c of transitionCases(f,lit)) {
    const record=lastJSON(await query(`begin;${c.sql}${f.evidenceSQL(c.target)}rollback;`));
    assertTransition(f,c,record);transitions++;
  }
  const fixture=await installLateMutationFixture({query,lit},f);
  try {
    await query('alter table public.user_profiles add column fixture_profile_future_authority text');
    await query(`do $reject$ begin begin update public.user_profiles set fixture_profile_future_authority='SYNTHETIC future'
      where user_id=${lit(f.owner.id)};raise exception 'profile_expected_rejection';
      exception when insufficient_privilege then if sqlerrm<>'ordinary_commerce_authority_gate_required' then raise;end if;
      end;end $reject$;`);
    for(const [column,value] of [['channel_role','creator'],['profile_access_visibility','private'],['user_id',randomUUID()],['fixture_profile_future_authority','future']]) {
      await fixture.install(column,value);
      await query(`do $reject$ begin begin ${fixture.sql} raise exception 'profile_expected_rejection';
        exception when insufficient_privilege then if sqlerrm<>'ordinary_commerce_authority_gate_required' then raise;end if;
        end;end $reject$;`);
      assert.equal(await query(fixture.effectsSQL),'0');await fixture.remove();tampering++;
    }
  } finally { await query('alter table public.user_profiles drop column fixture_profile_future_authority');await fixture.clean(); }
  await assertUnchanged({query},f);
  const media=await prepareMediaFixture({query,lit},f);
  for(const job of Object.values(media.jobs)) {
    const rows=jsonRows(await query(`begin;${media.complete(job)}${f.evidenceSQL()}rollback;`));
    assert.equal(rows[0].callback.targetPropagationComplete,true);assert.equal(rows[1].gateHeld,false);
    assert.equal(rows[1].brandHeld,true);assert.equal(rows[1].retirementHeld,true);
    for(const key of protectedColumns)assert.deepEqual(rows[1].profile[key],media.profile[key]);
  }
  await media.prepareCapped();
  const rows=jsonRows(await query(`begin;${media.recover}${f.evidenceSQL()}rollback;`));
  assert.equal(rows[0].recovery.cappedManualReviewCount,1);assert.equal(rows[1].gateHeld,false);
  assert.equal(rows[1].profile.profile_avatar_scan_status,'manual_review');
  assert.equal(rows[1].brandHeld,true);assert.equal(rows[1].retirementHeld,true);
  for(const key of protectedColumns)assert.deepEqual(rows[1].profile[key],media.profile[key]);
  await media.prepareSkipLockedControl(); // Exact native data setup, NOT a SKIP LOCKED outcome.
  assert.deepEqual(lastJSON(await query(f.authoritySQL)),f.authorityBefore);
  return {evidence:'sequential SQL only; native contention not executed',transitions,tampering,media:3};
}

export async function runOrdinaryProfileMetadataRaces({query,lit,session,until}) {
  assert.equal(typeof session,'function','guarded native session transport is required');
  assert.equal(typeof until,'function','guarded native barrier transport is required');
  const f=await seedOrdinaryProfileMetadataFixture({query,lit});
  const counts={blocking:0,nonblocking:0};
  const holderState=pid=>query(`select count(*) from pg_stat_activity a where a.pid=${pid} and a.datname=current_database()
    and a.state='idle in transaction' and exists(select 1 from pg_locks l where l.pid=a.pid and l.locktype='advisory'
      and l.classid=176214 and l.objid=32 and l.objsubid=2 and l.mode='ExclusiveLock' and l.granted)`);
  const hold=async(extra='')=>{
    const h=session(`begin;${gate}${extra}select jsonb_build_object('holderPid',pg_backend_pid());select 'PROFILE_HOLDER_READY';`);
    await until(()=>h.output().includes('PROFILE_HOLDER_READY'),'profile authority gate holder did not start');
    return {h,pid:jsonRows(h.output()).find(row=>row.holderPid).holderPid};
  };
  const release=async(h,sql='rollback;')=>{h.child.stdin.end(sql+'\n');const r=await h.done;assert.equal(r.code,0,r.stderr);};
  const nonblocking=async(label,sql,{holderSQL='',error}={})=>{
    const {h,pid}=await hold(holderSQL);let finished;
    const w=session(`begin;select jsonb_build_object('workerPid',pg_backend_pid());${sql}${error?'':f.evidenceSQL()}rollback;`);
    w.child.stdin.end();w.done.then(result=>{finished=result;},error=>{finished={transportError:error};});
    try {
      await until(()=>finished!==undefined,`${label}: peer must finish before commerce gate holder releases`);
      if(finished.transportError)throw finished.transportError;
      const rows=jsonRows(finished.stdout),workerPid=rows[0].workerPid;
      assert.notEqual(workerPid,pid,'distinct native PostgreSQL backends');
      assert.equal(holderState(pid),'1','gate holder is still open when actual peer completes');
      if(error) {assert.notEqual(finished.code,0);assert.match(finished.stderr,error);}
      else {assert.equal(finished.code,0,finished.stderr);assert.equal(rows.at(-1).gateHeld,false,'media-only peer acquired no commerce gate');}
      console.log(JSON.stringify({schedule:label,holderPid:pid,workerPid,evidence:'peer finished before gate release',expectedRejection:Boolean(error)}));
      counts.nonblocking++;return rows;
    } finally {await release(h);await w.done;}
  };
  for(const c of transitionCases(f,lit)) {
    if(!c.gate) {const rows=await nonblocking(c.label,c.sql);assertTransition(f,c,rows.at(-1));continue;}
    const {h,pid}=await hold();
    const w=session(`begin;${c.sql}${f.evidenceSQL(c.target)}rollback;`);w.child.stdin.end();let released=false;
    try {
      const edgeSQL=`select jsonb_build_object('holderPid',h.pid,'waiterPid',w.pid,'waitType',w.wait_event_type,
        'blockers',pg_blocking_pids(w.pid)) from pg_stat_activity w cross join pg_stat_activity h
        where h.pid=${pid} and h.datname=current_database() and w.datname=current_database() and w.application_name=${lit(w.name)}`;
      await until(()=>{const e=lastJSON(query(edgeSQL));return e?.waitType==='Lock'&&e.blockers.includes(pid);},`${c.label}: no actual gate blocking edge`);
      const edge=lastJSON(await query(edgeSQL));assert.notEqual(edge.waiterPid,pid);assert.ok(edge.blockers.includes(pid));
      assert.equal(await query(`select count(*) from pg_locks where pid=${edge.waiterPid} and locktype='advisory'
        and classid=176214 and objid=32 and objsubid=2 and mode='ExclusiveLock' and not granted`),'1','waiter blocks on exact exclusive commerce gate');
      assert.equal(await query(`select count(*) from pg_locks where pid=${edge.waiterPid} and granted
        and (locktype='tuple' or locktype='advisory')`),'0','no downstream tuple, Brand, user or Premium advisory before gate');
      // A row owner often has no tuple entry in pg_locks. NOWAIT from the
      // actual holder is the independent proof that the writer owns no tuple.
      h.child.stdin.write(`select user_id from public.user_profiles where user_id=${lit(f.owner.id)} for update nowait;select 'PROFILE_TUPLE_AVAILABLE';\n`);
      await until(()=>h.output().includes('PROFILE_TUPLE_AVAILABLE'),`${c.label}: gate waiter already owns profile tuple`);
      await until(()=>holderState(pid)==='1',`${c.label}: holder did not remain idle with exact gate`);
      released=true;await release(h,'commit;');
      const result=await w.done;assert.equal(result.code,0,result.stderr);assertTransition(f,c,lastJSON(result.stdout));
      console.log(JSON.stringify({schedule:c.label,...edge,tupleAvailableToGateHolder:true}));counts.blocking++;
    } finally {if(!released)await release(h);await w.done;}
  }
  await assertUnchanged({query},f);
  const fixture=await installLateMutationFixture({query,lit},f);
  try {
    await query('alter table public.user_profiles add column fixture_profile_future_authority text');
    await nonblocking('unknown direct future field fails closed',
      `update public.user_profiles set fixture_profile_future_authority='SYNTHETIC future' where user_id=${lit(f.owner.id)};`,
      {error:/ordinary_commerce_authority_gate_required/u});
    for(const [column,value] of [['channel_role','creator'],['profile_access_visibility','private'],['user_id',randomUUID()],['fixture_profile_future_authority','future']]) {
      await fixture.install(column,value);
      await nonblocking(`actual NEW rejects later ${column}`,fixture.sql,{error:/ordinary_commerce_authority_gate_required/u});
      assert.equal(await query(fixture.effectsSQL),'0','rejected actual NEW rolls back all downstream effects');
      await fixture.remove();
    }
  } finally {await query('alter table public.user_profiles drop column fixture_profile_future_authority');await fixture.clean();}
  await assertUnchanged({query},f);
  const media=await prepareMediaFixture({query,lit},f);
  for(const [column,job] of Object.entries(media.jobs)) {
    const rows=await nonblocking(`actual service ${column} completion with opposite side still pending`,media.complete(job));
    assert.equal(rows.find(row=>row.callback).callback.targetPropagationComplete,true);
    const record=rows.at(-1);assert.equal(record.brandHeld,true);assert.equal(record.retirementHeld,true);
    for(const key of protectedColumns)assert.deepEqual(record.profile[key],media.profile[key]);
  }
  await media.prepareCapped();
  const recovered=await nonblocking('actual capped media recovery does not wait on commerce gate',media.recover);
  assert.equal(recovered.find(row=>row.recovery).recovery.cappedManualReviewCount,1);
  assert.equal(recovered.at(-1).profile.profile_avatar_scan_status,'manual_review');
  for(const key of protectedColumns)assert.deepEqual(recovered.at(-1).profile[key],media.profile[key]);
  // Nonblocking SKIP LOCKED control deliberately makes the opposite target
  // nonpending. With both targets pending the retained enqueue hook revisits
  // the locked opposite job; that baseline media edge is not a new gate bug.
  // The completion schedules above still exercise BOTH pending targets.
  await media.prepareSkipLockedControl();
  const skipped=await nonblocking('actual recovery SKIP LOCKED, opposite-side-not-pending control',media.recover,{
    holderSQL:`select id from public.media_scan_jobs where id=${lit(media.jobs.profile_avatar)} for update;`,
  });
  assert.equal(skipped.find(row=>row.recovery).recovery.cappedManualReviewCount,1);
  assert.equal(skipped.at(-1).profile.profile_avatar_scan_status,'clean');
  assert.equal(skipped.at(-1).profile.profile_background_scan_status,'manual_review');
  assert.deepEqual(lastJSON(await query(f.authoritySQL)),f.authorityBefore);
  console.log('Profile media proof excludes the retained baseline Brand-to-opposite-pending-job cycle. Both-pending completion touches that opposite queue. SKIP LOCKED uses an explicitly nonpending opposite-side control, not a claim of universal media deadlock freedom.');
  assert.deepEqual(counts,{blocking:90,nonblocking:27});
  return counts;
}
