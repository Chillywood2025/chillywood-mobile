import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import { seedV3Qualified,V3_FIXTURE } from './snapshot/isolated-runtime/sandbox-commerce-v1/tests/test-store-v3.fixture.mjs';
const configuration=JSON.parse(fs.readFileSync(0,'utf8')),sql=[];
seedV3Qualified(statement=>sql.push(statement),{seedAuthority:false});
const {routeId,workerId,verifierId,workerKey,verifierKey,reviewerId}=configuration;
for(const id of[routeId,workerId,verifierId,reviewerId])if(!/^[a-f0-9-]{36}$/u.test(id))throw Error('fixture_id');
for(const key of[workerKey,verifierKey])if(!/^[a-f0-9]{64}$/u.test(key))throw Error('fixture_key');
sql.push(`insert into sandbox_commerce_v1.paid_video_routes values('${routeId}','s3','synthetic-local-video','${'1'.repeat(64)}',true);
insert into sandbox_commerce_v1.paid_video_workers values('${workerId}',decode('${workerKey}','hex'),'${'2'.repeat(64)}',true);
insert into sandbox_commerce_v1.paid_video_verifiers values('${verifierId}',decode('${verifierKey}','hex'),'${'3'.repeat(64)}',true);
update sandbox_commerce_v1.paid_video_gateway_controls set enabled=true,route_id='${routeId}',worker_id='${workerId}',verifier_id='${verifierId}',qualification_sha256='${'4'.repeat(64)}';`);
const operationsBinding={protocol:'scpv-operations-binding-v1',projectRef:'abcdefghijklmnopqrst',endpoint:'https://abcdefghijklmnopqrst.supabase.co',
 installationId:randomUUID(),sourceSha256:'9cbbab7014161d9d830a6b9d66084cede0c7dfcb2c294a4afe52ee07b7a81a31',
 workerId,workerSha256:'2'.repeat(64),verifierId,verifierEvidenceSha256:'3'.repeat(64),
 configurationDigest:V3_FIXTURE.configurationDigest,routeId,qualificationSha256:'4'.repeat(64)};
const json=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
sql.push(`create role synthetic_local_economic_registrar nologin nosuperuser nocreaterole nocreatedb noinherit;
grant usage on schema rc_qualification_capture_v1 to synthetic_local_economic_registrar;
grant execute on function rc_qualification_capture_v1.reserve_economic_project(text,text) to synthetic_local_economic_registrar;
set role synthetic_local_economic_registrar;
select rc_qualification_capture_v1.reserve_economic_project('${V3_FIXTURE.projectId}','sandbox-commerce-v1:protocol-3:capture-composed-v1');
reset role;
revoke all on function rc_qualification_capture_v1.reserve_economic_project(text,text) from synthetic_local_economic_registrar;
revoke all on schema rc_qualification_capture_v1 from synthetic_local_economic_registrar;
drop role synthetic_local_economic_registrar;
insert into sandbox_commerce_v1.paid_video_operations_config(binding,enabled) values(${json(operationsBinding)},true);
insert into sandbox_commerce_v1.paid_video_reviewers(user_id,authorization_sha256,active) values('${reviewerId}','${'5'.repeat(64)}',true);`);
const recoveryTargetSql=`select jsonb_build_object('protocol','scv3-capture-recovery-target-v1','installationId',i.installation_id,'sourceSha256',i.source_sha256,
 'consumerBinding','sandbox-commerce-v1:protocol-3:capture-composed-v1','projectId',c.project_id,'connectionId',c.id,'connectionRevision',c.revision,'providerConfigurationDigest',c.provider_configuration_digest)
 from sandbox_commerce_v1.test_store_v3_capture_identity i cross join sandbox_commerce_v1.test_store_v3_connections c where i.singleton and c.id='${V3_FIXTURE.connectionId}' and c.revision=${V3_FIXTURE.connectionRevision};`;
console.log(JSON.stringify({sql:sql.join('\n'),fixture:V3_FIXTURE,operationsBinding,recoveryTargetSql}));
