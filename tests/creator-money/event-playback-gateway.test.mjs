import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';

const module={exports:{}};
new Function('exports','module','crypto',ts.transpileModule(fs.readFileSync('supabase/functions/_shared/creator-event-playback.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText)(module.exports,module,webcrypto);
const {handleCreatorEventPlayback:handle}=module.exports;
const event='f1000000-0000-4000-8000-000000000001',user='f1000000-0000-4000-8000-000000000002';
const session='f1000000-0000-4000-8000-000000000003',broadcast='f1000000-0000-4000-8000-000000000004';
const base='https://app.example/functions/v1/spectator-playback';
function fixture(){
  let allowed=true,now=1_000_000,target=broadcast,source='https://media.example/event/index.m3u8',calls=0,fetches=[];
  const deps={secret:'synthetic-gateway-secret',now:()=>now,
    authenticate:async()=>({userId:user,sessionGeneration:session}),
    readSource:async(e,u,s)=>{calls++;assert.equal(e,event);assert.equal(u,user);assert.equal(s,session);return {allowed,creatorEventId:event,broadcastId:target,recordId:broadcast,sourceUrl:source,kind:'live'};},
    fetchSource:async url=>{fetches.push(url);return new Response(url.endsWith('index.m3u8')?'#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\nvariants/720.m3u8\n':url.endsWith('.m3u8')?'#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\nsegment.ts\n':'synthetic-media',{headers:{'Content-Type':url.endsWith('.m3u8')?'application/vnd.apple.mpegurl':'video/mp2t'}});}};
  return {deps,revoke:()=>{allowed=false;},advance:()=>{now+=300_001;},change:()=>{target=session;},setSource:value=>{source=value;},calls:()=>calls,fetches};
}
async function issue(f){const response=await handle(new Request(base,{method:'POST'}),f.deps,{mode:'event_state',creatorEventId:event});assert.equal(response.status,200);return await response.json();}
test('actual gateway binds source and session, proxies every HLS resource and rechecks revocation',async()=>{
  const f=fixture(),ticket=await issue(f);
  assert.equal(ticket.fullRoomTokenForSpectators,false);assert.equal(ticket.rawHlsUrlReturned,false);
  assert.doesNotMatch(JSON.stringify(ticket),/media\.example|synthetic-gateway-secret/);
  const playlist=await handle(new Request(ticket.playbackUrl),f.deps);assert.equal(playlist.status,200);
  const text=await playlist.text();assert.doesNotMatch(decodeURIComponent(text),/media\.example|event\/index|key\.bin/);
  const key=text.match(/URI="([^"]+)"/)[1],child=text.trim().split('\n').at(-1);
  assert.equal((await handle(new Request(key),f.deps)).status,200);
  const nested=await (await handle(new Request(child),f.deps)).text();
  assert.doesNotMatch(decodeURIComponent(nested),/media\.example|variants\/segment\.ts|init\.mp4/);
  const media=nested.trim().split('\n').at(-1);assert.equal((await handle(new Request(media),f.deps)).status,200);
  assert.equal(f.calls(),5,'state, master, key, variant and segment each read authority');
  assert.ok(f.fetches.includes('https://media.example/event/variants/segment.ts'));
  f.revoke();assert.equal((await handle(new Request(media),f.deps)).status,403);
  assert.equal(f.fetches.length,4,'revocation is enforced before provider read');
});
test('expired, tampered, wrong-event and changed-broadcast capabilities fail before media',async()=>{
  const f=fixture(),ticket=await issue(f),url=new URL(ticket.playbackUrl);
  assert.equal((await handle(new Request(ticket.playbackUrl.replace(event,user)),f.deps)).status,403);
  url.searchParams.set('eventToken',url.searchParams.get('eventToken')+'x');
  assert.equal((await handle(new Request(url),f.deps)).status,403);
  f.change();assert.equal((await handle(new Request(ticket.playbackUrl),f.deps)).status,403);
  f.advance();assert.equal((await handle(new Request(ticket.playbackUrl),f.deps)).status,403);
  assert.equal(f.fetches.length,0);
});
test('same-broadcast source replacement requires a freshly authorized capability',async()=>{
  const f=fixture(),ticket=await issue(f);
  f.setSource('https://media.example/replacement/index.m3u8');
  assert.equal((await handle(new Request(ticket.playbackUrl),f.deps)).status,403);
  assert.equal(f.fetches.length,0);
  const fresh=await issue(f);assert.equal((await handle(new Request(fresh.playbackUrl),f.deps)).status,200);
});
test('foreign hosts, encoded traversal, missing authority and unsupported routes never become public fallback',async()=>{
  const f=fixture(),ticket=await issue(f),url=new URL(ticket.playbackUrl);url.pathname=url.pathname.replace('index.m3u8','media');
  for(const path of ['https://other.example/secret','../../secret','https://media.example/event/%2f..%2fsecret','https://media.example/event/%5csecret']){
    url.searchParams.set('ref',path);assert.equal((await handle(new Request(url),f.deps)).status,400,path);
  }
  f.deps.authenticate=async()=>null;
  assert.equal((await handle(new Request(base,{method:'POST'}),f.deps,{mode:'event_state',creatorEventId:event})).status,403);
  assert.equal(await handle(new Request(base+'/records/other/index.m3u8'),f.deps),null,'unrelated spectator behavior is not replaced');
  assert.equal(f.fetches.length,0);
});
