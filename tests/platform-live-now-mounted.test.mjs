import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require=createRequire(import.meta.url),React=require('react'),ts=require('typescript');
const {createRoot}=require('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const noop=()=>{},doc={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
const container=()=>({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,parentNode:null,tagName:'DIV'});
doc.documentElement=container();globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class {};
const compile=file=>ts.transpileModule(fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true},
}).outputText;
const code={feed:compile('_lib/discoveryFeed.ts'),hook:compile('_lib/useLiveDiscoveryFeed.ts'),component:compile('components/live/platform-live-now.tsx')};
const creator='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const owner=id=>({userId:id,accountId:id,sessionGeneration:`session-${id}`,state:'ACTIVE',restoreOnly:false});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const row=(extra={})=>({id:'stage-one',item_type:'live_room',source_type:'live_stage_room',source_id:'STAGE-ONE',room_id:'STAGE-ONE',
  title:'Actual standalone stage',owner_user_id:creator,channel_user_id:creator,visibility:'public',moderation_status:'clean',
  rights_status:'creator_owned',is_publicly_discoverable:true,is_spectator_enabled:true,is_spectator_playback_enabled:false,
  live_state:'live',ended_at:null,starts_at:null,access_type:'public_free',...extra});
const descendants=(node,predicate)=>{
  if(Array.isArray(node))return node.flatMap(n=>descendants(n,predicate));
  if(!node||typeof node!=='object')return [];
  return [...(predicate(node)?[node]:[]),...descendants(node.props?.children,predicate)];
};
async function mount(t,initial=[row()]){
  let authority=owner('viewer-a'),creatorId=creator,enabled=true,tree,rows=initial,reader=null;
  const requests=[],routes=[],intervals=new Set(),timers=new Set(),listeners=new Set();
  const native={StyleSheet:{create:x=>x},AppState:{currentState:'active',addEventListener:(_,f)=>{listeners.add(f);return {remove:()=>listeners.delete(f)};}}};
  for(const name of ['ActivityIndicator','Text','TouchableOpacity','View'])native[name]=name;
  const read=async options=>{requests.push(options);return {items:reader?await reader(options):rows,signals:{}};};
  const evaluate=(source,imports)=>{
    const context={exports:{},require:name=>{if(!(name in imports))throw Error(`Unexpected import ${name}`);return imports[name];},
      AbortController,setTimeout:f=>{timers.add(f);return f;},clearTimeout:f=>timers.delete(f),
      setInterval:f=>{intervals.add(f);return f;},clearInterval:f=>intervals.delete(f)};
    vm.runInNewContext(source,context);return context.exports;
  };
  const feed=evaluate(code.feed,{'./channelAudience':{},'./friendGraph':{},'./supabase':{supabase:{}}});
  const hook=evaluate(code.hook,{'react':React,'react-native':native,'@react-navigation/native':{useIsFocused:()=>true},
    './session':{useSession:()=>({authority,authorityStatus:'active'})},
    './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority,sameAccountSessionAuthority:(a,b)=>!!a&&!!b&&a.userId===b.userId&&a.sessionGeneration===b.sessionGeneration},
    './discoveryFeed':{...feed,readRankedPublicDiscoveryFeedItems:read},'./circleSpectatorFeed':{readRankedCircleSpectatorFeedItems:()=>assert.fail('Public Platform must not broaden its audience')},
  });
  const surface={AppSection:props=>{tree=props.children;return null;},AppActionButton:'Action',AppEmptyState:'Empty'};
  const component=evaluate(code.component,{'react':React,'react-native':native,'expo-router':{useRouter:()=>({push:path=>routes.push(path)})},
    '../../_lib/discoveryFeed':feed,'../../_lib/useLiveDiscoveryFeed':hook,'../ui/app-surface':surface});
  function Host(){return React.createElement(component.PlatformLiveNow,{creatorUserId:creatorId,enabled});}
  const root=createRoot(container());
  const render=()=>React.act(async()=>root.render(React.createElement(Host)));
  await render();t.after(()=>React.act(async()=>root.unmount()));
  return {requests,routes,buttons:()=>descendants(tree,x=>x.props?.testID==='platform-live-discovery-open-button'),
    nodes:type=>descendants(tree,x=>x.type===type),errors:()=>descendants(tree,x=>x.props?.testID==='platform-live-discovery-error'),
    setReader:value=>{reader=value;},async creator(value){creatorId=value;await render();},async account(value){authority=owner(value);await render();},
    async enable(value){enabled=value;await render();},async refresh(value=rows){rows=value;await React.act(async()=>{for(const f of intervals)void f();});},
    async resolve(d,value){await React.act(async()=>d.resolve(value));},async press(button){await React.act(async()=>button.props.onPress());},
  };
}

test('mounted Platform shows standalone canonical stage without a creator Event and opens exact discovery entry',async t=>{
  const h=await mount(t);assert.equal(h.buttons().length,1);
  assert.equal(h.requests[0].creatorUserId,creator);assert.equal(h.requests[0].surface,'channel');assert.equal(h.requests[0].liveOnly,true);
  await h.press(h.buttons()[0]);assert.deepEqual(h.routes,['/spectate/stage-one']);
});
test('canonical public live Event retains its Event destination',async t=>{
  const h=await mount(t,[row({item_type:'creator_event',event_id:'event-one'})]);await h.press(h.buttons()[0]);
  assert.deepEqual(h.routes,['/event/event-one']);
});
test('approved public watch-party retains exact spectator destination',async t=>{
  const h=await mount(t,[row({id:'party-one',item_type:'watch_party',source_type:'watch_party_room',is_spectator_playback_enabled:true})]);
  await h.press(h.buttons()[0]);assert.deepEqual(h.routes,['/spectate/party-one']);
});
test('focused Platform removes ended publication on authoritative refresh',async t=>{
  const h=await mount(t);await h.refresh([]);assert.equal(h.buttons().length,0);assert.equal(h.nodes('Empty').length,1);
});
test('read failure shows retry rather than a successful empty-state claim; retry recovers',async t=>{
  const h=await mount(t);h.setReader(async()=>{throw Error('modeled query unavailable');});await h.refresh();
  assert.equal(h.errors().length,1);assert.equal(h.nodes('Empty').length,0);assert.equal(h.buttons().length,0);
  h.setReader(null);await h.press(h.nodes('Action')[0]);assert.equal(h.buttons().length,1);assert.equal(h.errors().length,0);
});
test('another creator, private, Circle, quarantined, scheduled and ended rows do not become public Platform cards',async t=>{
  const h=await mount(t,[row({owner_user_id:other,channel_user_id:other}),row({visibility:'private'}),row({visibility:'circle',is_publicly_discoverable:false}),
    row({moderation_status:'quarantined'}),row({live_state:'scheduled'}),row({ended_at:'2000-01-01T00:00:00Z'})]);
  assert.equal(h.buttons().length,0);
});
for(const change of ['creator','account'])test(`late previous ${change} result cannot replace current Platform live cards`,async t=>{
  const h=await mount(t),d=deferred();h.setReader(()=>d.promise);await h.refresh();
  h.setReader(null);await h[change](other);await h.resolve(d,[row({id:'stale-secret-card'})]);
  assert.equal(h.buttons().some(x=>x.key==='stale-secret-card'),false);
});
test('a denied Platform disables discovery and removes retained cards',async t=>{
  const h=await mount(t);const count=h.requests.length;await h.enable(false);await h.refresh();
  assert.equal(h.requests.length,count);assert.equal(h.buttons().length,0);
});
