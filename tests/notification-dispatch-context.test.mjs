import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as payload from '../supabase/functions/_shared/notification-payload.mjs';

// Real production dispatch, token delivery and copy declarations. Only the
// database, receipt reconciliation and outbound provider boundary are modeled.
const compile = source => ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const file = process.env.DISPATCH_TEST_SOURCE_PATH ?? 'supabase/functions/notification-dispatch/index.ts';
const source = fs.readFileSync(file,'utf8');
const ast = ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
const names = new Set(['toText','ANDROID_NOTIFICATION_CHANNEL_ID','notificationCategoryForTrigger','notificationTypeForTrigger','preferenceFieldForTrigger','buildNotificationCopy','dispatchToRecipient','sendToDeliverableTokens','readPushTokens','insertDeliveryAttempt','sanitizeErrorMessage']);
const declarations = ast.statements.filter(n=>names.has(n.name?.getText(ast)) || (ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>names.has(d.name.getText(ast))))).map(n=>n.getText(ast)).join('\n');
assert.equal(declarations.match(/(?:const|function) /g).length >= names.size,true);
function harness(options={}) {
  const rows=[],sends=[],attempts=[],dedupes=new Set(),reads=[];
  const client={
    auth:{admin:{getUserById:async id=>({data:{user:options.missingAccount?null:{id}},error:null})}},
    async rpc(name,args){reads.push({name,args});
      assert.ok(['is_account_access_restricted','is_platform_owner_user','account_deletion_public_hidden_reason'].includes(name),'no session-bound visibility helper');
      if(name==='is_platform_owner_user')assert.equal(args.target_user_id,'creator-1');
      return {data:name==='is_account_access_restricted' ? Boolean(options.restricted || (options.recipientRestricted&&args.p_user_id==='buyer-1'))
        : name==='is_platform_owner_user'?Boolean(options.platformOwner):options.deleted?'deleted':null,error:options.rpcError?{message:'unavailable'}:null};},
    from(table){
      let operation='select',value,filters={};
      const q={select(){return q;},insert(v){operation='insert';value=v;return q;},update(v){operation='update';value=v;return q;},delete(){operation='delete';return q;},eq(k,v){filters[k]=v;return q;},is(){return q;},order(){return q;},limit(){return q;},maybeSingle(){return q;},then(resolve){
        let data=null,error=null;
        if(table==='user_profiles'){reads.push({table,filters});data={user_id:options.wrongProfile?'other':filters.user_id,display_name:options.name??'Rachi',username:options.handle??'safe_handle',profile_access_visibility:options.private?'private':'public'};}
        if(table==='channel_audience_blocks')data=(options.blocked&&filters.channel_user_id==='creator-1')||(options.reverseBlocked&&filters.channel_user_id==='buyer-1')?[{blocked_user_id:filters.blocked_user_id}]:[];
        if(table==='notification_event_dedupes'&&operation==='insert'){if(dedupes.has(value.dedupe_key))error={code:'23505'};else dedupes.add(value.dedupe_key);}
        if(table==='notifications'&&operation==='insert'){data={id:'notification-1'};rows.push({...value,...data});}
        if(table==='notification_delivery_attempts'&&operation==='insert')attempts.push(value);
        if(table==='user_push_tokens')data=filters.platform===(options.platform??'android')?[{id:'token-1',platform:options.platform??'android',provider:'expo',token:'fixture-token'}]:[];
        return Promise.resolve({data,error}).then(resolve);
      }};return q;
    },
  };
  const helpers={exports:{}};
  vm.runInNewContext(compile(fs.readFileSync('supabase/functions/_shared/notification-display-labels.ts','utf8')),helpers);
  const context={...helpers.exports,...payload,exports:{},Date,Error,
    reconcileRecentExpoPushReceipts:async()=>{},isIosOrdinaryPushRolloutEnabled:()=>true,
    isIosOrdinaryPushTargetEnabled:async()=>true,
    sendExpoPush:async message=>{sends.push(message);return {ok:true,status:200,body:{data:{status:'ok',id:'ticket-1'}}};},
  };
  vm.runInNewContext(compile(declarations+'\nglobalThis.run=dispatchToRecipient;'),context);
  return {rows,sends,reads,attempts,run:(triggerType='public_upload')=>context.run(client,{
    actorUserId:'creator-1',recipient:{id:'buyer-1',reason:'follower'},sourceId:'source-1',sourceType:'creator_video',
    target:{entityId:'exact-video',route:'/player/[id]',deepLink:'chillywoodmobile://player/exact-video'},
    timingKey:'original-time',title:options.title??'Chicago Stories',creatorDisplayName:'Untrusted caller name',triggerType,eligibilityReason:'public_safe_eligible',
  })};
}
for(const platform of ['android','ios'])for(const trigger of ['public_upload','event_starts_soon','replay_later'])test(`${platform} ${trigger}: exact trusted subject in row and push, original tap and dedupe preserved`,async()=>{
  const h=harness({platform});await h.run(trigger);
  assert.equal(h.rows.length,1);assert.equal(h.sends.length,1);
  assert.match(h.rows[0].title+' '+h.rows[0].body,/Rachi/);assert.match(h.rows[0].body,/Chicago Stories/);
  assert.doesNotMatch(JSON.stringify(h.sends),/Untrusted caller name/);
  assert.equal(h.sends[0].title,h.rows[0].title);assert.equal(h.sends[0].body,h.rows[0].body);
  assert.equal(h.sends[0].data.path,'/player/exact-video');assert.equal(h.rows[0].target_entity_id,'exact-video');
  assert.equal(h.rows[0].target_context.display_context.creator_id,'creator-1');
  await h.run(trigger);assert.equal(h.sends.length,1);
});
for(const trigger of ['followed_creator_live','circle_friend_live'])test(`${trigger}: direct recipient helper cannot bypass canonical preference authority`,async()=>{
  const h=harness();
  for(let attempt=0;attempt<2;attempt++) {
    const result=await h.run(trigger);
    assert.equal(result.reason,'canonical_lifecycle_required');
    assert.equal(result.pushSent,false);assert.equal(result.notificationId,null);
  }
  assert.equal(h.rows.length,0);assert.equal(h.sends.length,0);assert.equal(h.reads.length,0);assert.equal(h.attempts.length,0);
});
test('another creator is not mistaken for first creator',async()=>{
  const h=harness({name:'Maya',title:'Second Story'});await h.run();assert.match(h.sends[0].title,/Maya/);assert.match(h.sends[0].body,/Second Story/);assert.doesNotMatch(h.sends[0].title,/Rachi/);
});
for(const option of ['restricted','recipientRestricted','private','wrongProfile','platformOwner','deleted','missingAccount','blocked','reverseBlocked'])test(`${option}: identity is withheld without guessed names`,async()=>{
  const h=harness({[option]:true});await h.run();assert.doesNotMatch(JSON.stringify(h.sends),/Rachi|safe_handle/);assert.match(h.sends[0].title,/unavailable/);
});
test('same display name is disambiguated by canonical public handle',async()=>{
  for(const handle of ['rachi_one','rachi_two']){const h=harness({name:'Rachi',handle});await h.run();assert.match(h.sends[0].title,new RegExp(`@${handle}`));}
});
test('long display name does not cut off the canonical handle',async()=>{
  const h=harness({name:'N'.repeat(80),handle:'unique_handle'});await h.run();assert.match(h.sends[0].title,/@unique_handle/);
});
test('authority failure happens before dedupe, storage or provider send',async()=>{
  const h=harness({rpcError:true});await assert.rejects(h.run(),/authority_unavailable/);assert.equal(h.rows.length,0);assert.equal(h.sends.length,0);
});
test('internal proof copy stays unchanged and does not read creator identity',async()=>{
  const h=harness();await h.run('internal_ios_delivery_proof');assert.equal(h.sends[0].title,"Chi'llywood notification ready");assert.equal(h.reads.length,0);
});
