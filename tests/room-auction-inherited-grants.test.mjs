import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedLiveRoomActor} from './helpers/live-room-authority-fixture.mjs';
import {seedCurrentEventCommerceCreator} from './helpers/current-event-commerce-fixture.mjs';

const runners=[['room-seat-auction',7],['tip-cross-rail',9]].map(([name,checks])=>{
  const source=fs.readFileSync(`scripts/test-${name}-concurrency-postgres.mjs`,'utf8');
  const snapshotSql=source.match(/const accessGrantsSnapshotSql="([^"]+)";/)?.[1];
  const assertion=source.split('\n').find(line=>line.includes('assert.ok(query(accessGrantsSnapshotSql)===baselineAccessGrants'));
  const inheritedAssertion=source.split('\n').find(line=>line.includes('assert.ok(query(inheritedAccessGrantsSql)===baselineAccessGrants'));
  const raceAssertion=source.split('\n').find(line=>line.includes('assert.ok(query(accessGrantsSnapshotSql)===raceAccessGrants'));
  const inheritedSqlDeclaration=source.split('\n').find(line=>line.includes('const inheritedAccessGrantsSql='));
  const additionAssertion=source.split('\n').find(line=>line.includes("'setup adds exactly one creator Premium grant'"));
  const canonicalAssertion=source.match(/assert.equal\(query\(`select count\(\*\) from public.access_grants g join public.provider_events[\s\S]+?canonical current creator Premium authority'\);/u)?.[0];
  const context=(ids,creator)=>({assert,accessGrantsSnapshotSql:snapshotSql,inheritedAccessGrantIds:JSON.stringify(ids),actors:{creator:{id:creator}},
    lit:value=>`'${String(value).replaceAll("'","''")}'`,literal:value=>`'${String(value).replaceAll("'","''")}'`});
  return {name,checks,source,snapshotSql,unchanged(before,after){
    assert.ok(assertion);vm.runInNewContext(assertion,{assert,query:()=>after,accessGrantsSnapshotSql:snapshotSql,baselineAccessGrants:before});
    assert.ok(raceAssertion);vm.runInNewContext(raceAssertion,{assert,query:()=>after,accessGrantsSnapshotSql:snapshotSql,raceAccessGrants:before});
  },inheritedSql(ids){
    assert.ok(inheritedSqlDeclaration);return vm.runInNewContext(inheritedSqlDeclaration+'\ninheritedAccessGrantsSql;',context(ids));
  },inheritedUnchanged(before,after){
    assert.ok(inheritedAssertion);vm.runInNewContext(inheritedAssertion,{assert,query:()=>after,inheritedAccessGrantsSql:'actual inherited-row SQL',baselineAccessGrants:before});
  },additionChecks(ids,creator){
    return [additionAssertion,canonicalAssertion].map(statement=>{
      assert.ok(statement);let sql;
      vm.runInNewContext(statement,{...context(ids,creator),query:value=>{sql=value;return '1';}});
      return {sql,check:value=>vm.runInNewContext(statement,{...context(ids,creator),query:()=>String(value)})};
    });
  }};
});

for(const {name,checks,source,snapshotSql,unchanged} of runners) test(`native ${name} proof captures inherited count/full-row digest before any fixture or race`,()=>{
  assert.ok(snapshotSql);assert.match(snapshotSql,/jsonb_agg\(to_jsonb\(g\) order by g.id\)/);
  assert.match(snapshotSql,/'count',count\(\*\)/);assert.match(snapshotSql,/extensions\.digest\(.+,'sha256'\)/);
  const capture=source.indexOf('const baselineAccessGrants=query(accessGrantsSnapshotSql);');
  assert.ok(capture>source.indexOf("'restore clone'"));
  assert.ok(capture<source.indexOf('tests/fixtures/'));
  const seed=source.indexOf('await seedCurrentEventCommerceCreator');
  assert.ok(source.indexOf('const inheritedAccessGrantIds=')<source.indexOf('tests/fixtures/'));
  assert.ok(source.indexOf('legacy fixtures never add, remove or modify inherited access grants')<seed);
  assert.ok(source.indexOf('const raceAccessGrants=')>source.indexOf('the only added grant has canonical current creator Premium authority'));
  assert.equal(source.split('assert.ok(query(inheritedAccessGrantsSql)===baselineAccessGrants').length,3,'setup and final inherited checks both remain');
  assert.ok(source.includes("where user_id in(select user_id from event_reservation_fixture.actors where kind like 'buyer%')"));
  assert.ok(source.includes(`assert.equal(checks,${checks})`));
  assert.ok(source.includes('restore.assertSourceUnchanged()'));
  assert.doesNotMatch(source,/delete from public\.access_grants|truncate[^;]*access_grants/i);
  unchanged('same','same');assert.throws(()=>unchanged('same','different'),assert.AssertionError);
});

test('retained Premium grant is inherited; added, removed and same-count modified grants fail both actual native assertions', {timeout:180000},async()=>{
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
  const actor={id:'cbe10000-0000-4000-8000-000000000001',session:'cbe10001-0000-4000-8000-000000000001'};
  const scalar=async(sql,params=[])=>(Object.values((await db.query(sql,params)).rows[0]??{}))[0];
  const snapshotSql=runners[0].snapshotSql;
  const snapshot=()=>scalar(snapshotSql);
  const unchanged=(before,after)=>runners.forEach(runner=>runner.unchanged(before,after));
  const rejects=(before,after)=>runners.forEach(runner=>assert.throws(()=>runner.unchanged(before,after),assert.AssertionError));
  try{
    assert.equal(runners[1].snapshotSql,snapshotSql,'both native runners use the exact tested SQL');
    assert.equal(JSON.parse(await snapshot()).count,0);
    await seedLiveRoomActor(db,actor,{premium:true});
    const baseline=await snapshot();assert.equal(JSON.parse(baseline).count,1);
    assert.match(JSON.parse(baseline).digest,/^[a-f0-9]{64}$/);
    const rows=(await db.query('select * from public.access_grants order by id')).rows;assert.equal(rows.length,1);
    assert.equal(rows[0].user_id,actor.id);assert.equal(rows[0].grant_type,'premium');
    assert.equal(rows[0].provider,'revenuecat_google_play');assert.equal(rows[0].environment,'sandbox');
    assert.equal(rows[0].status,'sandbox_only');assert.ok(rows[0].provider_event_id);
    // The inherited subscription does not populate the distinct creator-money
    // ledger; downstream Merch runners' zero-earnings assertions stay intact.
    assert.equal(Number(await scalar('select count(*) from public.creator_earnings_ledger')),0);
    for(const name of ['event-reservation-authority','creator-external-payment-capabilities','creator-external-payment-authority']){
      await db.exec(fs.readFileSync(`tests/fixtures/${name}.sql`,'utf8'));
      unchanged(baseline,await snapshot());
    }
    assert.equal(Number(await scalar('select count(*) from public.access_grants where user_id in(select user_id from event_reservation_fixture.actors)')),0);
    // Run the exact SQL over typed, read-only row projections. First prove the
    // unchanged projection matches: differences cannot be JSON formatting alone.
    const projectedSql=snapshotSql.replace('from public.access_grants g','from jsonb_populate_recordset(null::public.access_grants,$1::jsonb) g');
    const project=values=>scalar(projectedSql,[JSON.stringify(values)]);
    unchanged(baseline,await project(rows));
    for(const changed of [[],[...rows,{...rows[0],id:'cbe10002-0000-4000-8000-000000000001'}],
      [{...rows[0],id:'cbe10002-0000-4000-8000-000000000001'}],
      [{...rows[0],status:'revoked'}],
      [{...rows[0],metadata:{...rows[0].metadata,fixture_probe:true}}]]){
      rejects(baseline,await project(changed));
    }
    // Detect a real additional grant too; never delete or rewrite the protected
    // inherited grant. The separate synthetic insertion rolls back normally.
    await db.exec('begin');
    try{
      await seedLiveRoomActor(db,{id:'cbe10000-0000-4000-8000-000000000002',session:'cbe10001-0000-4000-8000-000000000002'},{premium:true});
      const changed=await snapshot();assert.equal(JSON.parse(changed).count,2);rejects(baseline,changed);
    }finally{await db.exec('rollback');}
    unchanged(baseline,await snapshot());
    // Execute the current canonical companion after the legacy fixture checks.
    // Exactly one creator Premium row may be added, while every inherited row
    // (even one owned by that creator) remains protected by its original ID.
    const creator=await scalar("select user_id from event_reservation_fixture.actors where kind='creator'");
    await seedCurrentEventCommerceCreator(db);
    const postSeed=(await db.query('select * from public.access_grants order by id')).rows;
    assert.equal(postSeed.length,rows.length+1);
    const added=postSeed.filter(row=>!rows.some(prior=>prior.id===row.id));
    assert.equal(added.length,1);assert.equal(added[0].user_id,creator);assert.equal(added[0].grant_type,'premium');
    assert.equal(added[0].provider,'revenuecat_google_play');assert.equal(added[0].environment,'sandbox');assert.ok(added[0].provider_event_id);
    for(const runner of runners){
      const inheritedSql=runner.inheritedSql(rows.map(row=>row.id));
      runner.inheritedUnchanged(baseline,await scalar(inheritedSql));
      const projectedInherited=inheritedSql.replace('from public.access_grants g','from jsonb_populate_recordset(null::public.access_grants,$1::jsonb) g');
      runner.inheritedUnchanged(baseline,await scalar(projectedInherited,[JSON.stringify(postSeed)]));
      for(const changed of [added,[{...rows[0],id:'cbe10002-0000-4000-8000-000000000001'},...added],
        [{...rows[0],status:'revoked'},...added],[{...rows[0],metadata:{fixture_probe:true}},...added],
        [{...rows[0],user_id:creator},...added]]){
        const digest=await scalar(projectedInherited,[JSON.stringify(changed)]);
        assert.throws(()=>runner.inheritedUnchanged(baseline,digest),assert.AssertionError,'legitimate added Premium never hides inherited row deletion/replacement/mutation');
      }
      for(const {sql,check} of runner.additionChecks(rows.map(row=>row.id),creator)){
        check(await scalar(sql));
        const projected=sql.replace('from public.access_grants g','from jsonb_populate_recordset(null::public.access_grants,$1::jsonb) g');
        check(await scalar(projected,[JSON.stringify(postSeed)]));
        const invalid=[...postSeed,{...added[0],id:'cbe10002-0000-4000-8000-000000000002'}];
        assert.throws(()=>check(2),assert.AssertionError,'actual setup assertion rejects additional grants');
        const count=await scalar(projected,[JSON.stringify(invalid)]);
        assert.throws(()=>check(count),assert.AssertionError,'typed extra canonical-looking row is not accepted as a setup baseline');
      }
    }
  }finally{await db.close();}
});
