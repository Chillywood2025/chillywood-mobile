// Authenticated encrypted provider bytes are synthetic fixture evidence only.
import assert from 'node:assert/strict';
import {loadCapture,environment,connection,request,event,text,json} from './snapshot/isolated-runtime/test-store-capture-v1/tests/source-loader.mjs';
const c=connection();let body;
const api=loadCapture(environment(),async(url,options)=>{
 assert.equal(String(url),'https://synthetic.invalid/rest/v1/rpc/isolated_test_store_capture_ingest_v1');body=JSON.parse(options.body);
 return Response.json({protocol:'test-store-qualification-result-v1',entryId:'22222222-2222-4222-8222-222222222222',status:'captured',phase:'capturing',durable:true,acknowledgementAllowed:true,behavioralQualificationGranted:false,authorityGranted:false});
});
assert.equal((await api.edge.handler(request(JSON.stringify(event())))).status,200);assert.ok(body);
const configure=`set role rcq_v1_operator;select rc_qualification_capture_v1.configure_capture('${c.connectionId}',1,${text(c.projectId)},${text(c.appId)},${text(c.authentication.keyVersion)},${text(c.encryption.keyId)});`;
const start=`set role rcq_v1_operator;select rc_qualification_capture_v1.test_store_qualification_transition('capturing','${c.connectionId}',1,4,8,1048576);`;
const ingest=`set role service_role;set request.jwt.claims='{"role":"service_role"}';select public.isolated_test_store_capture_ingest_v1(${text(body.p_connection_id)},${body.p_connection_revision},${json(body.p_envelope)},${json(body.p_observation)});`;
const seal="set role rcq_v1_operator;select rc_qualification_capture_v1.test_store_qualification_transition('sealed');";
process.stdout.write(JSON.stringify({configure,start,ingest,seal,projectId:c.projectId})+'\n');
