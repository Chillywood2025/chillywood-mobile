// Source generation only: exact immutable inputs, no database or network action.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const sha=v=>createHash('sha256').update(v).digest('hex');
const bases={
 legacy_commands:['commands.sql','e42ec2f8ac50e2dea104a16abfa4429a3f351e560060fab4f19556a11e0bfb45'],
 commands:['candidates/paid-video-combined-readiness/commands.sql','19062a47190ef7d18dade13e6c0c9c638a2b862b3e3cd30101606b85e4a15c43'],
 gateway:['candidates/paid-video-combined-readiness/gateway.sql','534af30129e94ce9e12e8d188bb033058da34ecaf76fd2ef61efc79d6e124dd8'],
 provisioning:['candidates/paid-video-combined-readiness/provisioning.sql','576bb84abc0d085207b7de129f70b8ef09d6a0a65f2c5fa404f6690a4228b7df'],
 receipts:['test-store-paid-video-receipts.sql','7255b02224da3e0e54fa41802d519beaf9aae3b7c3b7013f7d9cd061161ecce6'],
 access:['paid-video-access.sql','4c8ac599f3cc761985f3fa57f730ba274143c1d84f2da9e616c8ddbf32613ee7'],
};
const original=Object.fromEntries(Object.entries(bases).map(([name,[file,digest]])=>{
 const source=name==='legacy_commands'
  ?execFileSync('git',['show','5e9b8f86792c2fab606ed216037aec916f094b7c:isolated-runtime/sandbox-commerce-v1/'+file],{cwd:root,encoding:'utf8'})
  :fs.readFileSync(path.join(root,file),'utf8');
 assert.equal(sha(source),digest,'Frozen input drift: '+file);return[name,source];
}));
const replace=(source,before,after,count=1)=>{assert.equal(source.split(before).length,count+1,'Exact substitution count: '+before);return source.replaceAll(before,after);};
const output={...original};
output.legacy_commands=replace(output.legacy_commands,'  perform sandbox_commerce_v1.arm_transaction_timeout();\n  return sandbox_commerce_v1.command(p_command,p_payload,p_expected_account_id,p_expected_session_generation);',
 `  perform sandbox_commerce_v1.arm_transaction_timeout();
  if p_command is null or p_command not in ('creator.declare','capability.read')
  then raise exception 'capture_profile_legacy_economic_command_disabled' using errcode='42501'; end if;
  return sandbox_commerce_v1.command(p_command,p_payload,p_expected_account_id,p_expected_session_generation);`);
output.commands=output.commands.replace(/perform sandbox_commerce_v1\.test_store_v3_scope_exclusive\((cn|connection)\.project_id\);/gu,(match,variable)=>match+'\n perform sandbox_commerce_v1.test_store_v3_assert_capture_admission('+variable+'.project_id);');
assert.equal(output.commands.split('perform sandbox_commerce_v1.test_store_v3_assert_capture_admission(').length,5);
output.gateway=replace(output.gateway,' perform sandbox_commerce_v1.test_store_v3_scope_exclusive(conn.project_id);',
 ' perform sandbox_commerce_v1.test_store_v3_scope_exclusive(conn.project_id);\n if sandbox_commerce_v1.test_store_v3_capture_admitted(conn.project_id) is not true then return false; end if;');
output.provisioning=replace(output.provisioning,' if mutation then\n   perform sandbox_commerce_v1.assert_generation(true);',
 ' if mutation then\n   perform sandbox_commerce_v1.test_store_v3_assert_capture_admission(connection.project_id);\n   perform sandbox_commerce_v1.assert_generation(true);');
output.access=replace(output.access,' perform sandbox_commerce_v1.test_store_v3_scope_exclusive(cn.project_id);',
 ' perform sandbox_commerce_v1.test_store_v3_scope_exclusive(cn.project_id);\n perform sandbox_commerce_v1.test_store_v3_assert_capture_admission(cn.project_id);');
output.access=replace(output.access,' select * into strict e from sandbox_commerce_v1.test_store_v3_ingress where id=p_ingress;',
 ' perform sandbox_commerce_v1.test_store_v3_assert_capture_admission(cn.project_id);\n select * into strict e from sandbox_commerce_v1.test_store_v3_ingress where id=p_ingress;');
output.receipts=replace(output.receipts,' select * into strict connection from sandbox_commerce_v1.test_store_v3_connections where id=evidence.connection_id and revision=evidence.connection_revision;',
 ' select * into strict connection from sandbox_commerce_v1.test_store_v3_connections where id=evidence.connection_id and revision=evidence.connection_revision;\n if not p_refund then perform sandbox_commerce_v1.test_store_v3_assert_capture_admission(connection.project_id); end if;');
output.receipts=replace(output.receipts,' common jsonb; source_keys text[]; event_id text; raw_hash text; previous_negative uuid; qualification_status text;',
 ' common jsonb; source_keys text[]; event_id text; raw_hash text; previous_negative uuid; qualification_status text;\n capture_status text; capture_decision text;');
const oldGate=` qualification_status:=sandbox_commerce_v1.test_store_qualification_gate(c.project_id,raw_hash,event_id,
   common->>'originalTransactionId',common->>'transactionId',common->>'userId');
 if qualification_status='capture_active' then raise exception 'test_store_v3_qualification_capture_active'; end if;
`;
output.receipts=replace(output.receipts,oldGate,'');
const retained=` insert into sandbox_commerce_v1.test_store_v3_deliveries(ingress_id,envelope) values(evidence.id,p_envelope);`;
output.receipts=replace(output.receipts,retained,retained+`
 -- Evidence is durable within this transaction before any capture admission
 -- decision. Missing/contended admission cannot discard authenticated negatives.
 begin
  qualification_status:=sandbox_commerce_v1.test_store_qualification_gate(c.project_id,raw_hash,event_id,
   common->>'originalTransactionId',common->>'transactionId',common->>'userId');
 exception when others then qualification_status:='capture_unavailable'; end;
 capture_status:=sandbox_commerce_v1.test_store_v3_capture_history(c.project_id,raw_hash,common);
 capture_decision:=sandbox_commerce_v1.test_store_v3_capture_decision(c.project_id);`);
output.receipts=replace(output.receipts," if duplicate then return jsonb_build_object('protocol','scv3-test-store-ingress-result-v1','receiptId',evidence.id,",
 ` if duplicate and (conflict
   or not exists(select 1 from sandbox_commerce_v1.test_store_v3_capture_deferred d where d.ingress_id=evidence.id)
   or exists(select 1 from sandbox_commerce_v1.test_store_v3_effects effect where effect.ingress_id=evidence.id))
 then return jsonb_build_object('protocol','scv3-test-store-ingress-result-v1','receiptId',evidence.id,`);
output.receipts=replace(output.receipts,`   if found then
     perform sandbox_commerce_v1.test_store_v3_hold_evidence(prior.id,'test_store_v3_event_bytes_conflict',true);
     perform sandbox_commerce_v1.test_store_v3_hold_evidence(evidence.id,'test_store_v3_event_bytes_conflict',true);
     conflict:=true; reason:='test_store_v3_event_bytes_conflict';`,
 `   if found then
    if prior.id<>evidence.id then
     perform sandbox_commerce_v1.test_store_v3_hold_evidence(prior.id,'test_store_v3_event_bytes_conflict',true);
     perform sandbox_commerce_v1.test_store_v3_hold_evidence(evidence.id,'test_store_v3_event_bytes_conflict',true);
     conflict:=true; reason:='test_store_v3_event_bytes_conflict';
    end if;`);
output.receipts=replace(output.receipts,"   if qualification_status='qualification_replay' then",
 "   if qualification_status='qualification_replay' and p_observation->>'mode'='paid_video_purchase' then");
output.receipts=replace(output.receipts,"   elsif qualification_status in ('qualification_unresolved','qualification_event_conflict','qualification_economic_history') then",
 "   elsif qualification_status in ('capture_active','qualification_unresolved','qualification_event_conflict','qualification_economic_history')\n     and p_observation->>'mode'='paid_video_purchase' then");
output.receipts=replace(output.receipts,'         if reason is null then\n           if exists(select 1 from sandbox_commerce_v1.test_store_v3_original_bindings owner',
 `         if reason is null and not refund and (capture_decision='excluded'
           or capture_status in ('capture_active','qualification_unresolved','qualification_event_conflict','qualification_economic_history','qualification_replay'))
         then reason:='test_store_v3_capture_admission_required'; end if;
         if reason is null and not refund and (capture_decision='unavailable'
           or capture_status='capture_unavailable' or qualification_status='capture_unavailable') then
          -- Transient uncertainty retains immutable evidence without inventing
          -- a terminal hold. Only exact stored evidence may later re-project.
          insert into sandbox_commerce_v1.test_store_v3_capture_deferred(ingress_id,reason)
           values(evidence.id,'capture_admission_unavailable') on conflict do nothing;
          return jsonb_build_object('protocol','scv3-test-store-ingress-result-v1','receiptId',evidence.id,
           'status','recorded','durable',true,'acknowledgementAllowed',true,'authorityGranted',false,'financialAuthority',false);
         end if;
         if reason is null and not refund and (capture_decision is distinct from 'admitted' or capture_status is distinct from 'not_qualification')
         then reason:='test_store_v3_capture_admission_required'; end if;
         if reason is null then
           if exists(select 1 from sandbox_commerce_v1.test_store_v3_original_bindings owner`);
for(const [name,source] of Object.entries(output)){
 const result=`-- Fresh inactive capture composition. Derived ${bases[name][0]} SHA256 ${bases[name][1]}.\n-- Substitute in a fresh profile only; no active replacement.\n`+source;
 assert.ok(!/create\s+or\s+replace/iu.test(result.replace(/^--.*$/gmu,'')));
 if(process.argv[2]==='--write')fs.writeFileSync(path.join(here,name+'.sql'),result);
 else {assert.equal(process.argv[2],'--check');assert.equal(fs.readFileSync(path.join(here,name+'.sql'),'utf8'),result);}
 output[name]=sha(result);
}
console.log(JSON.stringify({bases,outputs:output}));
