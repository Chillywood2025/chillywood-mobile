// New owned capture dependency contract only. Private Unix-socket disposable PG.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {reviewedCaptureInstall} from '../../../test-store-capture-v1/install.mjs';
import {createCaptureCluster} from '../../../test-store-capture-v1/tests/cluster.mjs';
import {loadCapture,environment,connection,request,event,text,json} from '../../../test-store-capture-v1/tests/source-loader.mjs';
assert.equal(process.argv.length,4);assert.equal(process.argv[2],'--local-bin');
const here=path.dirname(fileURLToPath(import.meta.url)),query=fs.readFileSync(path.join(here,'capture-contract-query.sql'),'utf8');
const install=reviewedCaptureInstall(),cluster=createCaptureCluster(process.argv[3]),q=cluster.q;
const sha=v=>createHash('sha256').update(v).digest('hex');let contract,engine,failure;
try{
 engine=cluster.start('create role postgres login nosuperuser createrole noinherit nobypassrls;create role anon nologin;create role authenticated nologin;create role service_role nologin;');
 q("do $$begin execute format('grant create on database %I to postgres',current_database());end$$;alter schema public owner to postgres;");
 q('set session authorization postgres;'+install.sql);
 const raw=q("begin;set local search_path='';"+query+'commit;');contract=JSON.parse(raw);
 assert.equal(contract.protocol,'rcq-owned-dependency-contract-v1');assert.equal(contract.relations.length,7);
 assert.equal(contract.roles.length,3);assert.ok(contract.functions.length>=15);
 assert.ok(contract.functions.every(v=>v.schema==='rc_qualification_capture_v1'||(v.schema==='public'&&v.name==='isolated_test_store_capture_ingest_v1')));
 // Runtime configuration/data deliberately excluded. A populated sealed capture
 // must satisfy the same retained contract as a newly disabled installation.
 const c=connection();
 q(`set role rcq_v1_operator;select rc_qualification_capture_v1.configure_capture('${c.connectionId}',1,${text(c.projectId)},${text(c.appId)},${text(c.authentication.keyVersion)},${text(c.encryption.keyId)});`);
 q(`set role rcq_v1_operator;select rc_qualification_capture_v1.test_store_qualification_transition('capturing','${c.connectionId}',1,4,8,1048576);`);
 const api=loadCapture(environment(),async(url,options)=>{
  assert.equal(String(url),'https://synthetic.invalid/rest/v1/rpc/isolated_test_store_capture_ingest_v1');
  const b=JSON.parse(options.body);
  return Response.json(JSON.parse(q(`set role service_role;set request.jwt.claims='{"role":"service_role"}';select public.isolated_test_store_capture_ingest_v1(${text(b.p_connection_id)},${b.p_connection_revision},${json(b.p_envelope)},${json(b.p_observation)});`)));
 });
 const response=await api.edge.handler(request(JSON.stringify(event())));assert.equal(response.status,200);
 assert.equal(q('select count(*) from rc_qualification_capture_v1.test_store_qualification_entries;'),'1');
 q("set role rcq_v1_operator;select rc_qualification_capture_v1.test_store_qualification_transition('sealed');");
 assert.deepEqual(JSON.parse(q("begin;set local search_path='';"+query+'commit;')),contract);
 // A new consumer membership is the one intended integration permission; it
 // must not alter the owned object contract or capture history.
 q('create role fixture_consumer nologin;grant rcq_v1_consumer to fixture_consumer with inherit true,set false;');
 assert.deepEqual(JSON.parse(q("begin;set local search_path='';"+query+'commit;')),contract);
}catch(error){failure=String(error?.stack??error);cluster.captureFailure();}
finally{await cluster.close();}
process.stdout.write(JSON.stringify({protocol:'rcq-owned-dependency-proof-v1',passed:!failure,engine,contract,
 querySha256:sha(query),installSqlSha256:install.sqlSha256,captureSourceHashes:install.sourceHashes,cleanup:cluster.cleanup,
 scope:'Only independent capture owned namespace/roles and sole public RPC; local fixture, no target or legacy metadata.',failure},null,2)+'\n');
if(failure)process.exitCode=1;
