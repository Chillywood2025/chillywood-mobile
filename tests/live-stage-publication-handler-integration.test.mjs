import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedLiveRoomAuthority,liveFixtureActors as actors,withLiveRoomActor} from './helpers/live-room-authority-fixture.mjs';

// Executes the ENTIRE production Edge handler and shared modules. Only the
// external Auth/provider transports are synthetic; SQL/session/role/RLS/CAS and
// canonical publication RPCs execute against the complete migration chain.
test('production publication and media handlers preserve paused admission and fence provider-session/settings interleavings', {timeout:180000},async()=>{
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
  let actor=actors.host,handler,providerCalls=0,provider;
  const minted=[];
  const scalar=async(sql,args=[])=>(Object.values((await db.query(sql,args)).rows[0]??{}))[0];
  const run=(role,fn)=>withLiveRoomActor(db,actor,fn,role);
  const client=role=>({auth:{getUser:async()=>({data:{user:{id:actor.id}},error:null})},
    rpc:async(name,args={})=>{
      assert.match(name,/^[a-z_][a-z0-9_]*$/);const keys=Object.keys(args);keys.forEach(k=>assert.match(k,/^[a-z_][a-z0-9_]*$/));
      try{return {data:await run(role,()=>scalar(`select public.${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')})`,Object.values(args))),error:null};}
      catch(error){return {data:null,error:{message:error.message}};}
    },
    from:table=>{
      assert.match(table,/^[a-z_]+$/);let columns='*',filter=[],order='',limit='',single=false,insert;
      const q={select:c=>{assert.match(c,/^[a-z_,*\s]+$/);columns=c.replace(/\s/g,'');return q;},eq:(k,v)=>{filter.push([k,'=',v]);return q;},
        in:(k,v)=>{filter.push([k,'=any',v]);return q;},order:(k,{ascending})=>{assert.match(k,/^[a-z_]+$/);order=` order by ${k} ${ascending?'asc':'desc'}`;return q;},
        limit:n=>{assert.ok(Number.isInteger(n));limit=` limit ${n}`;return q;},maybeSingle:()=>{single=true;return q;},single:()=>{single=true;return q;},
        insert:row=>{insert=row;return q;},then:async(resolve,reject)=>{
          try {
            let sql,params;
            if(insert){const keys=Object.keys(insert);keys.forEach(k=>assert.match(k,/^[a-z_]+$/));params=Object.values(insert).map(v=>v&&typeof v==='object'?JSON.stringify(v):v);
              sql=`insert into public.${table}(${keys.join(',')}) values(${keys.map((_,i)=>`$${i+1}`).join(',')}) returning ${columns}`;
            }else{params=filter.map(f=>f[2]);sql=`select ${columns} from public.${table}`+(filter.length?' where '+filter.map(([k,op],i)=>{assert.match(k,/^[a-z_]+$/);return op==='=any'?`${k}=any($${i+1})`:`${k}=$${i+1}`;}).join(' and '):'')+order+limit;}
            const rows=(await run(role,()=>db.query(sql,params))).rows;return resolve({data:single?rows[0]??null:rows,error:null});
          }catch(error){return resolve({data:null,error:{message:error.message}});}
        }};return q;
    }});
  const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',LIVEKIT_API_KEY:'fixture-key',LIVEKIT_API_SECRET:'fixture-secret'};
  const providerModule={AccessToken:class {
    constructor(_key,_secret,options){this.record={options};minted.push(this.record);}
    addGrant(grants){this.record.grants=grants;}
    async toJwt(){return 'synthetic-provider-signed-token';}
  },RoomServiceClient:class {async listParticipants(){providerCalls++;return provider();}}};
  const cache=new Map();
  function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const context={exports:{},Request,Response,Headers,URL,Date,TextEncoder,TextDecoder,crypto:webcrypto,atob,console,
    Deno:{env:{get:key=>env[key]},serve:fn=>{handler=fn;}},fetch:()=>{throw Error('unmodeled external network');},
    require:name=>name.startsWith('jsr:')?{}:name==='npm:@supabase/supabase-js@2'?{createClient:(_url,key)=>client(key==='fixture-service'?'service_role':'authenticated')}:
      name==='npm:livekit-server-sdk@2'?providerModule:name.startsWith('.')?load(path.resolve(path.dirname(file),name)):(()=>{throw Error(name);})()};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context,{filename:file});cache.set(file,context.exports);return context.exports;}
  const get=async()=>(await db.query("select * from public.watch_party_rooms where party_id='HANDLER-LIVE'")).rows[0];
  const request=async(payload)=>{const response=await handler(new Request('https://fixture.invalid/livekit-token',{method:'POST',headers:{authorization:'Bearer fixture-verified-user'},
    body:JSON.stringify({surface:'live-stage',roomName:'HANDLER-LIVE',...payload})}));return {status:response.status,body:await response.json()};};
  const send=binding=>request({action:'mark-room-live',roomGeneration:binding.room_generation,settingsRevision:Number(binding.host_settings_revision)});
  const pause=(binding,value)=>run('authenticated',()=>scalar(`select public.set_watch_party_room_host_settings(
    p_party_id=>$1,p_expected_room_generation=>$2,p_expected_settings_revision=>$3,p_session_generation=>$4,
    p_join_policy=>$5,p_discovery_visibility=>$6,p_discovery_title=>$7,p_expected_source_type=>null,p_expected_source_id=>null,
    p_discovery_paused=>$8)`,[binding.party_id,binding.room_generation,Number(binding.host_settings_revision),actor.session,
    binding.join_policy,binding.discovery_visibility,binding.discovery_title,value]));
  const participants=r=>[{identity:actors.host.id,metadata:JSON.stringify({app:'chillywood-mobile',userId:actors.host.id,roomName:r.party_id,sessionGeneration:actors.host.session,roomGeneration:r.room_generation})}];
  try {
    await seedLiveRoomAuthority(db);
    await run('authenticated',()=>db.query("insert into public.watch_party_rooms(party_id,host_user_id,room_type,content_access_rule,discovery_visibility) values('HANDLER-LIVE',$1,'live','open','public')",[actor.id]));
    await run('authenticated',()=>db.query("select * from public.join_watch_party_room_session('HANDLER-LIVE')"));
    const server=await scalar("insert into public.livekit_servers(server_id,display_name,provider,region,public_ws_url,status,last_heartbeat_at) values('fixture-local','Local synthetic','local','fixture','wss://fixture.invalid','active',now()) returning id");
    await db.query("insert into public.livekit_room_assignments(app_room_id,livekit_room_name,assigned_server_id,assignment_reason,room_type,assignment_status) values('HANDLER-LIVE','HANDLER-LIVE',$1,'synthetic transport','live_stage','active')",[server]);
    load('supabase/functions/livekit-token/index.ts');let r=await get();
    let response=await request({action:'mint-token',role:'host',metadata:{roomGeneration:'forged-client-generation'}});
    assert.equal(response.status,200,JSON.stringify(response.body));
    const hostToken=minted.at(-1),hostMetadata=JSON.parse(hostToken.options.metadata);
    assert.equal(hostMetadata.roomGeneration,r.room_generation,'actual token metadata binds authoritative lifecycle, overriding caller input');
    assert.equal(hostMetadata.sessionGeneration,actor.session);assert.equal(hostToken.grants.canPublish,true);
    provider=async()=>[{identity:hostToken.options.identity,metadata:hostToken.options.metadata}];
    response=await send(r);assert.equal(response.status,200,JSON.stringify(response.body));
    assert.equal(response.body.roomGeneration,r.room_generation);assert.equal(response.body.settingsRevision,0);
    assert.equal(response.body.discoveryPaused,false);
    assert.equal(await scalar("select private.live_stage_publication_current('HANDLER-LIVE')"),true);
    assert.equal((await send(r)).status,200,'duplicate exact callback is idempotent');
    actor=actors.stranger;assert.equal((await send(r)).status,403,'current non-host cannot publish another room');actor=actors.host;
    provider=async()=>[{...participants(r)[0],metadata:JSON.stringify({...JSON.parse(participants(r)[0].metadata),sessionGeneration:actors.stranger.session})}];
    assert.equal((await send(r)).body.error,'live_discovery_provider_host_unconfirmed','same host identity with wrong signed session is not provider proof');
    provider=async()=>[{...participants(r)[0],metadata:'{}'}];assert.equal((await send(r)).status,409,'legacy unbound participant cannot confirm new generation');
    const before=providerCalls;assert.equal((await send({...r,host_settings_revision:99})).body.error,'live_discovery_settings_changed');assert.equal(providerCalls,before,'stale client stops before provider');
    provider=async()=>{const ack=await pause(r,true);assert.equal(ack.discoveryPaused,true);return participants(r);};
    response=await send(r);assert.equal(response.status,409);assert.equal(response.body.error,'live_discovery_not_published');
    assert.equal(await scalar("select private.live_stage_publication_current('HANDLER-LIVE')"),false,'locked SQL publication independently rejects pause during actual provider wait');
    const unpausedBinding=r;r=await get();assert.equal(r.discovery_visibility,'public','listing Off does not rewrite audience');
    assert.equal(Number(r.host_settings_revision),Number(unpausedBinding.host_settings_revision)+1);
    const pausedCalls=providerCalls;assert.equal((await send(r)).body.error,'live_discovery_paused');
    assert.equal(providerCalls,pausedCalls,'current pause is denied before provider transport');
    assert.equal(await run('service_role',()=>scalar(`select public.publish_live_stage_discovery_current($1,$2,$3,$4,$5)`,
      [r.party_id,actor.id,actor.session,r.room_generation,Number(r.host_settings_revision)])),false,'direct service RPC also rejects current paused revision');
    response=await request({action:'mint-token',role:'host'});assert.equal(response.status,200,JSON.stringify(response.body));
    assert.equal(minted.at(-1).grants.canPublish,true,'paused host keeps authorized media grants');
    actor=actors.stranger;await run('authenticated',()=>db.query("select * from public.join_watch_party_room_session('HANDLER-LIVE')"));
    response=await request({action:'mint-token',role:'viewer'});assert.equal(response.status,200,JSON.stringify(response.body));
    assert.equal(minted.at(-1).grants.canSubscribe,true);assert.equal(minted.at(-1).grants.canPublish,false,'paused Public open room keeps ordinary authorized viewer admission');
    actor=actors.host;const circle=await run('authenticated',()=>scalar(`select public.set_watch_party_room_host_settings(
      p_party_id=>$1,p_expected_room_generation=>$2,p_expected_settings_revision=>$3,p_session_generation=>$4,
      p_join_policy=>'open',p_discovery_visibility=>'circle',p_discovery_title=>null,
      p_expected_source_type=>null,p_expected_source_id=>null)`,[r.party_id,r.room_generation,Number(r.host_settings_revision),actor.session]));
    assert.equal(circle.discoveryPaused,true,'omitted optional pause preserves paused state');r=await get();
    actor=actors.friend;await run('authenticated',()=>db.query("select * from public.join_watch_party_room_session('HANDLER-LIVE')"));
    response=await request({action:'mint-token',role:'viewer'});assert.equal(response.status,200,JSON.stringify(response.body));
    assert.equal(minted.at(-1).grants.canSubscribe,true,'paused Circle retains current real Circle media access');
    actor=actors.stranger;const priorMints=minted.length;response=await request({action:'mint-token',role:'viewer'});
    assert.equal(response.status,403);assert.equal(minted.length,priorMints,'paused Circle still denies preexisting non-Circle membership');
    actor=actors.host;const resume=await pause(r,false);assert.equal(resume.discoveryPaused,false);r=await get();
    const resumeCalls=providerCalls;assert.equal((await send(unpausedBinding)).body.error,'live_discovery_settings_changed');
    assert.equal(providerCalls,resumeCalls,'Off/On cannot revive the pre-pause client revision');
    provider=async()=>participants(r);response=await send(r);assert.equal(response.status,200,JSON.stringify(response.body));
    assert.equal(response.body.discoveryPaused,false);assert.equal(response.body.settingsRevision,Number(r.host_settings_revision));
    provider=async()=>{await run('authenticated',()=>scalar('select public.set_watch_party_room_host_settings($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [r.party_id,r.room_generation,Number(r.host_settings_revision),actor.session,'open','private',null,null,null]));return participants(r);};
    response=await send(r);assert.equal(response.status,409);assert.equal(response.body.error,'live_discovery_not_published');
    assert.equal(await scalar("select private.live_stage_publication_current('HANDLER-LIVE')"),false,'real SQL CAS rejects provider result after concurrent Off');
    r=await get();await run('authenticated',()=>scalar('select public.set_watch_party_room_host_settings($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [r.party_id,r.room_generation,Number(r.host_settings_revision),actor.session,'open','public',null,null,null]));r=await get();
    provider=async()=>{await run('authenticated',()=>db.query("update public.watch_party_rooms set is_active=false where party_id='HANDLER-LIVE'"));
      await run('authenticated',()=>db.query("update public.watch_party_rooms set is_active=true where party_id='HANDLER-LIVE'"));return participants(r);};
    assert.equal((await send(r)).status,409,'real SQL generation check rejects same-code end/restart while provider is in flight');
    await db.query('delete from auth.sessions where id=$1',[actor.session]);assert.equal((await send(await get())).status,401,'actual session readback blocks revoked session before source/provider read');
  }finally{await db.close();}
});
