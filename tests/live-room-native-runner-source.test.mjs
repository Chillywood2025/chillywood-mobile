import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
test('native room authority runner retains independent blocking edges and rollback-only negative control',()=>{
  const source=fs.readFileSync('scripts/test-live-room-host-settings-concurrency.mjs','utf8');
  for(const required of ['seedLiveRoomAuthority','pg_blocking_pids(w.pid)',"w.wait_event_type='Lock'",'assert.notEqual(evidence.holderPid,evidence.waiterPid)',
    'room_host_settings_conflict','original.replace(needle,\'false\')','rollback;','restore.assertSourceUnchanged()',"assert.equal(count,5,",
    "assert.equal(count,9)","waitEvent:'advisory'",'two different same-host Circle relationship updates',
    "lockDefinition.replace(lockNeedle,'perform 1')",'MUTANT_FINISHED_WHILE_MUTEX_HELD','negative control lock definition rolled back'])
    assert.ok(source.includes(required),required);
  assert.match(source,/assert\.match\([^\n]*DOCKER_HOST/);
  assert.match(source,/source_type|source_id/);
  for(const marker of ['Circle listing pause commits before stale unpause',
    'exact host join proof commits before same-code End and restart','same-code End and restart commit before a fresh canonical host join',
    'old publication dependency reproduces actual paused Circle ejection',"assert.equal(count,16)",
    'private.party_room_admission_source_current'])assert.ok(source.includes(marker),marker);
  for(const marker of ['ordinary broadcast pause commits before concurrent provider projection',
    'ordinary broadcast provider projection commits before listing pause','rollback-only missing pause check reproduces stale public producer state',
    'approvedOrdinaryBroadcastSQL',"assert.equal(count,18)"])assert.ok(source.includes(marker),marker);
  for(const marker of ['private recipient leave commits before in-flight materialization receipt',
    'private materialization commits before recipient leave','crossing actor pairs acquire sorted third-party attendance host union',
    'public.prepare_notification_activity','public.claim_notification_activity_batch',"assert.equal(count,12)",
    'actual worker reached materialization; receipt authority','MUTANT_ATTENDANCE_RECEIPT_1',
    'mutated worker materialization rolled back'])assert.ok(source.includes(marker),marker);
  for(const marker of ['CONTROL_ATTENDANCE_RECEIPT_1','positive materialization control rolled back',
    "waitForNativeSessionMarker(attendanceBypass,'MUTANT_ATTENDANCE_RECEIPT_1'",'pg_blocking_pids(a.pid)',
    'attendanceAuthorityLoss','CONTROL_ATTENDANCE_RECEIPT_1_AFTER_MUTEX','real mutex materialization control rolled back',
    'not l.granted',"l.classid=190731::oid",'noBrandMutex(attendanceHolder)',
    'attendanceMutexSubject=attendance[4].viewer.id',
    'unmodified attendance preparation waits for exact discovery recipient mutex, not Brand mutex'])
    assert.ok(source.includes(marker),marker);
  assert.doesNotMatch(source,/attendanceHolder=session\(`\$\{leave\(attendance\[4\]\)\}/,
    'negative control must not confuse an independent Brand serialization lock with the discovery mutex');
  for(const marker of ["version='20261101210306'",'two current-session rejoin requests serialize one new attendance interval',
    'original guard must reproduce actual rejoin failure','failed original-guard transaction rolled back','forgedRejoin',"assert.equal(count,13)",
    'assert.throws(()=>rpc(rejoinCreate),/rate_limited/',"action_key='watch_party_room_create' and target_key='live'"])
    assert.ok(source.includes(marker),marker);
  const workflow=fs.readFileSync('.github/workflows/required-validation.yml','utf8');
  const block=workflow.split("<<'NATIVE_PROOFS'")[1]?.split('NATIVE_PROOFS')[0];
  assert.ok(block?.includes('node scripts/test-live-room-host-settings-concurrency.mjs'),'native proof runs inside isolated cron-paused validation boundary');
  assert.ok(block?.includes('SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-room-live-start-dedup-concurrency.mjs'),
    'room-generation dedup contention proof runs after migration replay inside the isolated cron-paused boundary');
  const dedup=fs.readFileSync('scripts/test-room-live-start-dedup-concurrency.mjs','utf8');
  for(const marker of ['select private.room_start_notification_delivery_state(b)',
    "JSON.parse(rpc(prepare(independentA.ordinary),'service_role')).eligible,true",
    'distinct room delivery mutexes sharing creator/title do not block or coalesce',
    "blocked(holder,bypass,'advisory')",'l.classid=176214::oid and l.objid=30::oid',
    'mutant reaches the exact retained Brand lock','MUTANT_NOTICES_2','mutex removal rolled back'])
    assert.ok(dedup.includes(marker),marker);
});
