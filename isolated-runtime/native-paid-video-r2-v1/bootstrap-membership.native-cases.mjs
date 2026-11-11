// Disposable loopback PG only. No target URL, transport or operational budget.
import assert from 'node:assert/strict';
import {assertNativeFixtureHistory} from '../../tests/helpers/native-fixture-history-inventory.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {r2DeploymentFixture} from './deployment-fixture.mjs';
import {r2CreatorGrantorSQL,snapshotReadSQL,snapshotSelectSQL,readSettings,validateObservation} from './deployment.mjs';
import {fixedDeploymentBody,buildLocalFixtureDeploymentEnvelope,classifyLocalFixtureDeploymentOutcome} from './deployment-envelope.mjs';
import {r2PrivateStateReadSQL,validateR2PrivateState} from './private-state-readback.mjs';

export async function runR2BootstrapMembershipCases({bin,full=true,onProgress=()=>{}}){
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'r2-bootstrap-proof-'));
 const f=await r2DeploymentFixture({bin,output,full,onProgress});
 const cases=[];
 try{
  // Rename through a different session: PostgreSQL forbids renaming session_user.
  f.q('create role local_bootstrap_renamer login superuser;');
  f.q('alter role fixture_admin rename to alternate_fixture_bootstrap;','local_bootstrap_renamer');
  f.q('drop role local_bootstrap_renamer;create role fixture_admin login superuser;','alternate_fixture_bootstrap');
  assert.equal(f.q("select rolname from pg_roles where oid=10 and rolsuper;"),'alternate_fixture_bootstrap');
  const before=JSON.parse(f.q(snapshotReadSQL(),'supabase_read_only_user'));validateObservation(before,{before:true});
  if(full){assert.ok(before.catalogCount>47000);assertNativeFixtureHistory(before,'r2');}
  const local=buildLocalFixtureDeploymentEnvelope({baseline:before,fixtureToken:f.fixtureToken});
  const denied=f.run('psql',f.args('postgres'),local.sql);
  assert.notEqual(denied.status,0);assert.match(denied.stderr,/r2_local_fixture_required/u);
  cases.push('Local-only SQL still rejects renamed bootstrap, even with another superuser named fixture_admin and the genuine local marker.');
  // Exact fixed body, on this loopback-only fixture, tests the same pre-receipt
  // guard that rejected the original source. The local-envelope guard is NEVER
  // changed or stripped; the distinct body test has no hosted transport path.
  const after=JSON.parse(f.q(`begin isolation level repeatable read;${readSettings}${fixedDeploymentBody()}
   ${snapshotSelectSQL()};rollback;`,'postgres'));
  assert.equal(after.addedPresent,252);assert.equal(after.addedExact,true);assert.equal(after.afterChangedExact,true);
  for(const k of ['retainedCount','retainedSha256','retainedOidSha256','moneyControlsSha256'])assert.deepEqual(after[k],before[k],k);
  cases.push('Renamed OID10 bootstrap passes exact252 additions,13 changes, retained catalog/OIDs and money invariants on full legacy+Studio.');
  const rows=JSON.parse(f.q(`begin;create role sbx_v1_r2_gateway;create role sbx_v1_r2_scanner;
   select jsonb_agg(jsonb_build_object('label',label,'grantor',${r2CreatorGrantorSQL}) order by label) from(values
    ('gateway','sbx_v1_r2_gateway'::regrole::oid,'postgres'::regrole::oid,10::oid,true,false,false),
    ('scanner','sbx_v1_r2_scanner'::regrole::oid,'postgres'::regrole::oid,10::oid,true,false,false),
    ('wrong_oid_superuser','sbx_v1_r2_gateway'::regrole::oid,'postgres'::regrole::oid,'fixture_admin'::regrole::oid,true,false,false),
    ('wrong_grantor','sbx_v1_r2_gateway'::regrole::oid,'postgres'::regrole::oid,'postgres'::regrole::oid,true,false,false),
    ('wrong_member','sbx_v1_r2_gateway'::regrole::oid,'supabase_read_only_user'::regrole::oid,10::oid,true,false,false),
    ('wrong_role','service_role'::regrole::oid,'postgres'::regrole::oid,10::oid,true,false,false),
    ('admin_false','sbx_v1_r2_gateway'::regrole::oid,'postgres'::regrole::oid,10::oid,false,false,false),
    ('inherit_true','sbx_v1_r2_gateway'::regrole::oid,'postgres'::regrole::oid,10::oid,true,true,false),
    ('set_true','sbx_v1_r2_gateway'::regrole::oid,'postgres'::regrole::oid,10::oid,true,false,true)
   )m(label,roleid,member,grantor,admin_option,inherit_option,set_option);rollback;`,'postgres'));
  for(const row of rows){if(['gateway','scanner'].includes(row.label))assert.deepEqual(row.grantor,{bootstrapSuperuserOid:10});else assert.equal(typeof row.grantor,'string',row.label);}
  assert.equal(rows.find(x=>x.label==='wrong_oid_superuser').grantor,'fixture_admin');
  cases.push('Wrong grantor/OID, member, role and every privilege-option mutation retain actual grantor instead of receiving the normalization token.');
  const unchanged=JSON.parse(f.q(snapshotReadSQL(),'supabase_read_only_user'));
  for(const k of ['catalogSha256','allOidSha256','historySha256'])assert.deepEqual(unchanged[k],before[k]);
  // Restore only this disposable bootstrap name for the unchanged local guard;
  // then exercise the full receipt envelope, independent classifier and private read.
  f.q('drop role fixture_admin;create role local_bootstrap_renamer login superuser;','alternate_fixture_bootstrap');
  f.q('alter role alternate_fixture_bootstrap rename to fixture_admin;','local_bootstrap_renamer');
  f.q('drop role local_bootstrap_renamer;');
  const baseline=JSON.parse(f.q(snapshotReadSQL(),'supabase_read_only_user'));
  const packet=buildLocalFixtureDeploymentEnvelope({baseline,fixtureToken:f.fixtureToken});f.q(packet.sql,'postgres');
  const installed=JSON.parse(f.q(snapshotReadSQL(),'supabase_read_only_user'));
  assert.equal(classifyLocalFixtureDeploymentOutcome({before:baseline,after:installed,packet}).status,'exact_source_receipt_observed_committed_install_state_only');
  assert.equal(validateR2PrivateState(JSON.parse(f.q(r2PrivateStateReadSQL,'supabase_read_only_user'))).defaultOffAndEmptyObserved,true);
  cases.push('Unchanged local-fixture guard permits full exact receipt commit/classification; R2 private controls remain off and all tables empty.');
  const successor=full?f.applyDeferredMigrations():null;
  if(full){
   assertNativeFixtureHistory(JSON.parse(f.q(snapshotReadSQL(),'supabase_read_only_user')),'current');
   assert.equal(validateR2PrivateState(JSON.parse(f.q(r2PrivateStateReadSQL,'supabase_read_only_user'))).defaultOffAndEmptyObserved,true);
   cases.push('All later production source migrations replay only after the exact R2 receipt; full source inventory and every retained receipt are verified with production controls OFF.');
  }
  return {localOnly:true,fullLegacyStudioFixture:full,beforeCatalogCount:before.catalogCount,beforeHistoryCount:before.historyCount,successor,cases};
 }finally{f.stop();fs.rmSync(output,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv[2],'--local-bin');assert.equal(process.argv.length,4);
 console.log(JSON.stringify(await runR2BootstrapMembershipCases({bin:process.argv[3],onProgress:x=>console.log(JSON.stringify(x))})));
}
