import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

function load(file,imports={}) {
  const context={exports:{},URL,Date,BigInt,require:name=>{assert.ok(name in imports,name);return imports[name];}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(`supabase/functions/_shared/${file}.ts`,'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  return context.exports;
}
const transport=load('creator-event-broadcast-transport',{
  'npm:livekit-server-sdk@2':{},'./content-inspection-private-origin.ts':{},'./livekit-session-generation.ts':{},
});
const core=load('creator-event-broadcast-producer');
const runtime=load('creator-event-broadcast-runtime',{
  './creator-event-broadcast-transport.ts':{createEventBroadcastTransport:()=>({})},
  './creator-event-broadcast-producer.ts':core,'./live-cost-guard.ts':{},
});

test('authenticated provider parser -> real runtime -> immutable SQL coverage; no received-time fulfillment', {timeout:240_000},async t=>{
  const {db}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false});
  try {
    await db.exec(fs.readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
    await db.exec(fs.readFileSync('tests/fixtures/event-broadcast-producer-authority.sql','utf8'));
    await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false);
      select public.heartbeat_creator_event_broadcast_worker();`);
    const context=(await db.query('select * from event_reservation_fixture.broadcast_context')).rows[0];
    const source=(await db.query(`select public.claim_creator_event_broadcast_start($1,$2,$3) result`,
      [context.event_id,context.host_id,context.session_id])).rows[0].result;
    assert.equal(source.claimed,true);
    // Synthetic short schedule, real active/terminal writer and actual elapsed
    // time. Never alter an immutable coverage receipt to manufacture success.
    await db.query(`update public.creator_events set starts_at=clock_timestamp()+interval '2 seconds',
      ends_at=clock_timestamp()+interval '5 seconds' where id=$1`,[source.eventId]);
    const times=(await db.query(`select e.starts_at,e.ends_at,
      (extract(epoch from a.started_at)*1000000000+1000)::text started,
      (extract(epoch from e.ends_at)*1000000000)::text ended,
      (extract(epoch from e.starts_at)*1000000000)::text promised_start
      from public.creator_events e join private.creator_event_broadcast_attempts a on a.creator_event_id=e.id
      where a.id=$1`,[source.attemptId])).rows[0];
    const ns=value=>BigInt(value.split('.')[0]).toString();
    const start=ns(times.started),end=ns(times.ended),duration=(BigInt(end)-BigInt(start)).toString();
    const terms={startsAt:times.starts_at.toISOString(),endsAt:times.ends_at.toISOString()};
    // Keep PostgreSQL microseconds intact in original promise, not JS Date ms.
    const exact=(await db.query(`select jsonb_build_object('startsAt',starts_at,'endsAt',ends_at) terms
      from public.creator_events where id=$1`,[source.eventId])).rows[0].terms;
    Object.assign(terms,exact);
    const raw=(changes={})=>({egress_id:'EG_coverage',room_name:source.roomId,status:'EGRESS_COMPLETE',
      started_at:start,ended_at:end,egress:{room_name:source.roomId,outputs:[{segments:{
        filename_prefix:`${source.outputPrefix}/segment`,live_playlist_name:`${source.outputPrefix}/live.m3u8`}}]},
      segment_results:[{playlist_name:`${source.outputPrefix}/index.m3u8`,live_playlist_name:`${source.outputPrefix}/live.m3u8`,
        started_at:start,ended_at:end,duration,segment_count:'2'}],...changes});
    const calls=[];
    const admin={rpc:async(name,args)=>{
      calls.push({name,args});
      const entries=Object.entries(args),params=entries.map(([,value])=>value&&typeof value==='object'?JSON.stringify(value):value);
      const sql=`select public.${name}(${entries.map(([key],i)=>`${key}=>$${i+1}`).join(',')}) result`;
      try{return {data:(await db.query(sql,params)).rows[0].result,error:null};}
      catch(error){throw error;}
    }};
    const deps=runtime.createEventBroadcastRuntime(admin,()=>undefined);
    const receipt=async(changes={},options={})=>{
      const info=transport.parseEventEgressInfo(raw(changes));assert.ok(info);
      await deps.receipt(source,{status:'stopped',egressId:info.egressId,timing:info.timing,
        sourceUrl:`${source.privateOrigin}/${source.outputPrefix}/index.m3u8`,playlistPath:`${source.outputPrefix}/index.m3u8`,
        privateOriginVerified:true,...options});
    };
    const decision=async(promise=terms,event=source.eventId)=>(await db.query(
      'select private.creator_event_verified_coverage($1,$2::jsonb) result',[event,JSON.stringify(promise)])).rows[0].result;
    const waitUntil=async(timestamp)=>{
      while(!(await db.query('select clock_timestamp()>$1::timestamptz ready',[timestamp])).rows[0].ready)
        await new Promise(resolve=>setTimeout(resolve,100));
    };
    assert.equal((await decision()).full_original_interval,false);
    const active=transport.parseEventEgressInfo(raw({status:'EGRESS_ACTIVE',ended_at:'0',segment_results:[]}));
    // An observation may arrive after scheduled start while provider timestamps
    // prove recording began before it. Preserve retained D2 verified-start facts.
    await waitUntil(terms.startsAt);
    await deps.receipt(source,{status:'active',egressId:active.egressId,timing:active.timing,
      sourceUrl:`${source.privateOrigin}/${source.outputPrefix}/live.m3u8`,playlistPath:`${source.outputPrefix}/live.m3u8`,privateOriginVerified:true});
    await db.query(`update public.creator_events set status='live_now' where id=$1`,[source.eventId]);
    // Refresh after the guarded scheduled -> live transition; the original
    // schedule policy records its start fact from this current ACTIVE projection.
    await deps.receipt(source,{status:'active',egressId:active.egressId,timing:active.timing,
      sourceUrl:`${source.privateOrigin}/${source.outputPrefix}/live.m3u8`,playlistPath:`${source.outputPrefix}/live.m3u8`,privateOriginVerified:true});
    assert.equal(calls.at(-1).name,'record_creator_event_broadcast_provider_coverage');
    assert.equal(calls.at(-1).args.p_server_id,source.serverId);
    const verified=(await db.query(`select private.creator_event_verified_start_at($1,$2) started`,[source.eventId,terms.startsAt])).rows[0].started;
    assert.ok(verified,'retained D2 no-show policy has its own actual start fact');
    assert.equal((await decision()).full_original_interval,false,'ACTIVE or elapsed wall clock alone never fulfills');
    await waitUntil(terms.endsAt);
    for(const [label,changes,options] of [
      ['missing timing',{started_at:undefined},{}],['unsafe JSON number',{started_at:Number(start)},{}],
      ['conflicting alias',{startedAt:(BigInt(start)+1n).toString()},{}],
      ['reversed interval',{ended_at:start},{}],['early finish',{ended_at:(BigInt(end)-1n).toString()},{}],
      ['provider retry',{retry_count:1},{}],['provider error',{error:'synthetic interruption'},{}],
      ['unknown status details',{details:'synthetic restart'},{}],
      ['playlist interruption',{}, {coverageInterrupted:true}],
      ['no private output',{}, {privateOriginVerified:false}],
      ['unknown output',{segment_results:[]},{}],
      ['duration gap',{segment_results:[{...raw().segment_results[0],duration:'1'}]},{}],
      ['different output',{segment_results:[{...raw().segment_results[0],playlist_name:'other/index.m3u8'}]},{}],
    ]) {
      await db.exec('begin');await receipt(changes,options);
      assert.equal((await decision()).full_original_interval,false,label);await db.exec('rollback');
    }
    await db.exec('begin');
    await assert.rejects(deps.receipt({...source,serverId:context.event_id},{status:'stopped',egressId:'EG_coverage'}),/binding_invalid/);
    await db.exec('rollback');
    await db.exec('begin');
    const partialStart=(BigInt(ns(times.promised_start))+1n).toString();
    await receipt({segment_results:[{...raw().segment_results[0],started_at:partialStart,
      duration:(BigInt(end)-BigInt(partialStart)).toString()}]});
    const partial=await decision();
    assert.equal(partial.evidence_available,true,'actual shorter interval is retained, not claimed unknown');
    assert.equal(partial.full_original_interval,false);
    assert.equal(partial.review_required,true,'insufficient original coverage is a review hold, never a no-show or refund determination');
    assert.equal(partial.reason,'original_interval_unverified');
    assert.equal(partial.output_started_at_ns,partialStart);
    await db.exec('rollback');
    await receipt({status:'EGRESS_ENDING',ended_at:'0',segment_results:[]},{status:'ending'});
    assert.equal((await decision()).evidence_available,false,'ENDING cannot substitute for complete output');
    await db.exec('set role service_role');
    await receipt();
    await db.exec('reset role');
    const positive=await decision();assert.equal(positive.full_original_interval,true);assert.match(positive.evidence_reference,/^creator_event_provider_coverage:/);
    assert.equal(positive.coverage_kind,'provider_recorded_output_interval');
    assert.equal(positive.evidence_available,true);assert.equal(positive.review_required,false);
    assert.equal(positive.provider_started_at_ns,start);assert.equal(positive.provider_ended_at_ns,end);
    assert.equal(positive.duration_ns,duration);assert.equal('qualified' in positive,false);assert.equal('fulfilled_at' in positive,false);
    assert.equal((await decision({...terms,endsAt:new Date(Date.parse(terms.endsAt)+1000).toISOString()})).full_original_interval,false);
    assert.equal((await decision(terms,context.host_id)).full_original_interval,false);
    assert.equal((await decision({startsAt:'infinity',endsAt:'infinity'})).full_original_interval,false);
    for(const mutation of ['update private.creator_event_provider_coverage_receipts set timing=null','delete from private.creator_event_provider_coverage_receipts']) {
      await assert.rejects(db.exec(mutation),/event_provider_coverage_immutable/);
    }
    const acl=(await db.query(`select has_function_privilege('authenticated',
      'public.record_creator_event_broadcast_provider_coverage(uuid,uuid,uuid,uuid,text,text,text,text,boolean,boolean,jsonb,uuid,text,text)','execute') rpc,
      has_function_privilege('service_role','private.creator_event_verified_coverage(uuid,jsonb)','execute') issuer,
      has_table_privilege('service_role','private.creator_event_provider_coverage_receipts','insert') direct`)).rows[0];
    assert.deepEqual(acl,{rpc:false,issuer:false,direct:false});
    await db.exec('set role authenticated');
    await assert.rejects(receipt(),/permission denied/);
    await db.exec('reset role');
    await db.exec(`select set_config('request.jwt.claims','{"role":"authenticated"}',false)`);
    await assert.rejects(receipt(),/service_role_required/);
    await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
    await db.exec('begin');
    await receipt({}, {status:'failed'});
    assert.equal((await decision()).full_original_interval,false,'known failure cannot be hidden by prior completion');
    await db.exec('rollback');
    await receipt({}, {status:'uncertain'});
    assert.equal((await decision()).full_original_interval,false,'late unknown receipt revokes qualification; prior success cannot hide uncertainty');
    t.diagnostic('Real full-chain SQL and parser/runtime; synthetic provider payloads only; no network, money, or credentials.');
  } catch(error){if(error.where)error.message+=`\n${error.where}`;throw error;} finally {await db.close();}
});
