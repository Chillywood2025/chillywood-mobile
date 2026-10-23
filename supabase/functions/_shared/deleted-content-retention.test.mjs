import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {decideDeletedContentMediaDeletion,runDeletedContentExpiryBatch} from './deleted-content-retention.ts';
const input = {surfaceType:'creator_video',recordId:'synthetic-id',provider:'s3',bucket:'private',objectKey:'synthetic/object',actorId:'11111111-1111-4111-8111-111111111111'};
test('disabled and detached decisions preserve existing provider deletion', async () => {
  for (const retention of ['disabled','detached_or_unattached','unsupported_provider','unverified_binding']) {
    assert.equal(await decideDeletedContentMediaDeletion(async (name,args) => {
      assert.equal(name,'stage_deleted_content_media'); assert.equal(args.p_target,input.recordId);
      return {data:{decision:'delete_now',retention},error:null};
    },input),'delete_now');
  }
});
test('staged and finalized bindings defer physical deletion', async () => {
  assert.equal(await decideDeletedContentMediaDeletion(async () => ({data:{decision:'defer'},error:null}),input),'defer');
});
test('missing record ID still requires database deletion decision', async () => {
  let calls=0;
  assert.equal(await decideDeletedContentMediaDeletion(async (name,args) => {
    calls++;assert.equal(name,'stage_deleted_content_media');assert.equal(args.p_target,null);
    return {data:{decision:'delete_now',retention:'disabled'},error:null};
  },{...input,recordId:null}),'delete_now');
  assert.equal(calls,1);
  assert.equal(await decideDeletedContentMediaDeletion(async () => ({data:{decision:'defer'},error:null}),
    {...input,recordId:null}),'defer');
});
test('failure and malformed decisions fail closed', async () => {
  for (const reply of [{data:null,error:{}},{data:{decision:'yes'},error:null},{data:[],error:null}]) {
    await assert.rejects(decideDeletedContentMediaDeletion(async()=>reply,input),/decision_unavailable/);
  }
});
test('actual expiry worker has service authentication and uses bounded claim-controlled helpers', () => {
  const source=readFileSync(new URL('../deleted-content-retention-expiry/index.ts',import.meta.url),'utf8');
  assert.ok(source.includes('RETENTION_WORKER_SERVICE_KEY_SHA256'));
  assert.ok(source.includes('timingSafeEqual(actual,expected)'));
  assert.ok(!source.includes('SUPABASE_SERVICE_ROLE_KEY'));
  assert.ok(source.includes('runDeletedContentRetentionWorker'));
  assert.ok(source.includes('redirect:"error"') && !source.includes('createPresignedS3Url'));
});
test('actual gateway retains authorization, stages before revocation and conditionally deletes', () => {
  const source=readFileSync(new URL('../media-storage/index.ts',import.meta.url),'utf8');
  const authorized=source.indexOf('if (!allowed) return json(403, { error: "not_allowed", message: "You cannot delete');
  const stage=source.indexOf('const retentionDecision =');
  const revoke=source.indexOf('if (!await revokeGatewayMediaObjectBeforeDelete',stage);
  const remove=source.indexOf('retentionDecision === "delete_now" &&',stage);
  assert.ok(authorized>0 && stage>authorized && revoke>stage && remove>revoke);
  assert.ok(source.slice(remove).includes('return json(200, { ok: true })'));
});
test('bounded expiry worker preserves blocked statuses and never contacts providers', async()=>{
  const calls=[];
  const result=await runDeletedContentExpiryBatch(async(name)=>{
    calls.push(name);
    if(name==='list_deleted_content_expiry_work')return {data:{enabled:true,deletionIds:['11111111-1111-4111-8111-111111111111'],stageIds:['22222222-2222-4222-8222-222222222222']},error:null};
    return {data:{status:name==='expire_deleted_content_text'?'held':'attached_metadata_delete_missing_repair_required'},error:null};
  });
  assert.deepEqual(calls,['list_deleted_content_expiry_work','expire_deleted_content_text']);
  assert.equal(result.results[0].status,'held');
  assert.equal(result.results.length,1);
});
test('disabled expiry worker performs no mutations',async()=>{
  const calls=[];
  assert.deepEqual(await runDeletedContentExpiryBatch(async(name)=>{calls.push(name);return{data:{enabled:false},error:null};}),{enabled:false,results:[]});
  assert.deepEqual(calls,['list_deleted_content_expiry_work']);
});
