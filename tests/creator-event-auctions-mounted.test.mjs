import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import React from 'react';
import { createRoot } from 'react-dom/client';
import ts from 'typescript';
// Production React components with native host/transport boundaries replaced.
// This is not provider, installed-device, or end-to-end payment evidence.
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const noop=()=>{};const doc={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
const container=()=>({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,parentNode:null,tagName:'DIV'});
doc.documentElement=container();globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};
const textOf=n=>Array.isArray(n)?n.map(textOf).join(' '):n==null||typeof n==='boolean'?'':typeof n!=='object'?String(n):textOf(n.props?.children);
const row={id:'auction',creatorEventId:'event',offerId:'offer',termsRevisionId:'revision',creatorId:'creator',startingAmountMinor:100,minIncrementMinor:25,highestAmountMinor:null,nextBidAmountMinor:100,myBidAmountMinor:null,awardAmountMinor:null,currency:'usd',environment:'test',state:'open',closesAt:'2099-01-01T11:00:00Z',paymentDeadline:'2099-01-01T12:00:00Z',serverNow:'2099-01-01T10:00:00Z',isHighestBidder:false,isWinner:false};
row.latestCheckoutStartAt='2099-01-01T11:29:00Z';row.terms={title:'Virtual show',description:'This exact event',startsAt:'2099-01-02T00:00:00Z',endsAt:null,timeZone:'America/New_York',attendance:'virtual',replayPolicy:'none',replayAvailableAt:null,replayExpiresAt:null};
async function mount(t,options={}){
 const nodes=new Map(),calls=[],timers=new Map();let timerId=0,appListener,focused=true;let authority={userId:'buyer',sessionGeneration:'one'},subscriber,rows=options.rows??[row];
 const host=name=>function Native(props){const id=React.useId();nodes.set(id,{type:name,props});React.useEffect(()=>()=>nodes.delete(id),[id]);return React.createElement(React.Fragment,null,...React.Children.toArray(props.children).filter(c=>typeof c==='object'));};
 const native={Platform:{OS:options.platform??'ios'},Linking:{openURL:async url=>calls.push(['browser',url])},StyleSheet:{create:x=>x},AppState:{currentState:'active',addEventListener:(_,fn)=>{appListener=fn;return {remove:()=>{appListener=null;}};}}};for(const n of ['View','Text','TextInput','Pressable','ActivityIndicator'])native[n]=host(n);
 const cache=new Map();const load=file=>{if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const mocks={react:React,'react-native':native,'expo-router':{useFocusEffect:cb=>React.useEffect(()=>focused?cb():undefined,[cb,focused])},'react-native-get-random-values':{},
 '../../_lib/openCreatorExternalCheckout':{openCreatorExternalCheckout:async(url,current)=>{if(current())await native.Linking.openURL(url);}},
 '../../_lib/google-play-external-content-links':{withGooglePlayExternalContentLink:async callback=>{
   calls.push(['nativePrepare']);if(options.nativeDenied)throw new Error('Google Play unavailable');
   try{const checkout=await callback({google_play_external_transaction_token:'native-token',google_play_external_link_api_version:1});calls.push(['nativeLaunch',checkout.url]);}
   finally{calls.push(['nativeCancel']);}
 }},
 '../../_lib/googlePlayAuctionBidEligibility':{withGooglePlayAuctionBidEligibility:async(input,action)=>{
   if(options.bidAdmission)await options.bidAdmission(input);return action(options.platform==='android'?'capability':null);
 }},
 '../../_lib/creatorEventAuctionCheckout':{createCreatorEventAuctionCheckout:async a=>{calls.push(['checkout',a.id]);return options.checkout?options.checkout(a):{url:'https://checkout.stripe.com/c/pay/test',launchStrategy:'system_browser',platform:options.platform??'ios'};}},
 '../../_lib/creatorRoomSeatAuctionCheckout':{createCreatorRoomSeatAuctionCheckout:async(a,input)=>{calls.push(['checkout',a.id,input]);return options.checkout?options.checkout(a):{url:'https://checkout.stripe.com/c/pay/test',launchStrategy:'system_browser',platform:options.platform??'ios'};}},
 '../../_lib/creatorRoomSeatAuctions':{listCreatorRoomSeatAuctions:async id=>{calls.push(['list',id]);return options.list?options.list(id):rows;},readCreatorRoomSeatAuctionBidEligibility:async(...args)=>{calls.push(['eligibility',...args]);return options.eligibility?options.eligibility(...args):true;},placeCreatorRoomSeatAuctionBid:async(...args)=>{calls.push(['bid',...args]);return options.bid?options.bid(...args):rows[0];},createCreatorRoomSeatAuction:async input=>{calls.push(['create',input]);return options.create?options.create(input):rows[0];},
 prepareCreatorRoomSeatAuction:async(...args)=>{calls.push(['prepareRoom',...args]);return options.prepareRoom?options.prepareRoom(...args):{roomSessionId:'44444444-4444-4444-8444-444444444444',serverNow:'2099-01-01T00:00:00Z'};},
 readPendingCreatorRoomSeatAuction:async()=>options.pendingRead?options.pendingRead():null},
 '../../_lib/accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority,getAccountNavigationTreeKey:a=>a?`${a.userId}:${a.sessionGeneration}`:'none',sameAccountSessionAuthority:(a,b)=>!!a&&!!b&&a.userId===b.userId&&a.sessionGeneration===b.sessionGeneration,subscribeToAccountSessionAuthority:f=>{subscriber=f;return noop;}},
 '../../_lib/creatorEventAuctions':{listCreatorEventAuctions:async id=>{calls.push(['list',id]);return options.list?options.list(id):rows;},readCreatorEventAuctionBidEligibility:async(...args)=>{calls.push(['eligibility',...args]);return options.eligibility?options.eligibility(...args):true;},placeCreatorEventAuctionBid:async(...args)=>{calls.push(['bid',...args]);return options.bid?options.bid(...args):row;},createCreatorEventAuction:async input=>{calls.push(['create',input]);return row;}},
 '../../_lib/creatorTipAmount':load('_lib/creatorTipAmount.ts'),
 '../../_lib/eventSchedule':load('_lib/eventSchedule.ts'),
 './event-auction-time-input':file.endsWith('auction-editor.tsx')?load('components/monetization/event-auction-time-input.tsx'):null,
 './room-seat-auction-panel':file.endsWith('room-seat-auction-editor.tsx')?load('components/monetization/room-seat-auction-panel.tsx'):null,
 './event-auction-panel':!file.endsWith('event-auction-panel.tsx')?load('components/monetization/event-auction-panel.tsx'):null,
 };const context={exports,Error,Date,Intl,Promise,Map,Set,crypto:webcrypto,Uint8Array,setInterval:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearInterval:id=>timers.delete(id),require:n=>{assert.ok(n in mocks,`unexpected import ${n}`);return mocks[n];}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,context);return exports;};
 const Component=options.editor?(options.room?load('components/monetization/room-seat-auction-editor.tsx').RoomSeatAuctionEditor:load('components/monetization/event-auction-editor.tsx').EventAuctionEditor):options.room?load('components/monetization/room-seat-auction-panel.tsx').RoomSeatAuctionPanel:load('components/monetization/event-auction-panel.tsx').EventAuctionPanel;const root=createRoot(container());let eventId='event';
 const props=options.editor?{creatorId:'buyer',sourceKind:options.sourceKind??'stage_reserved_seat',event:{id:'event',hostUserId:'buyer',timeZone:'America/New_York',startsAt:options.startsAt??'2099-01-02T00:00:00Z'},offer:{status:'sandbox',termsRevisionId:'revision'}}:{};
 const render=()=>root.render(React.createElement(Component,{eventId,partyId:eventId,...props}));await React.act(async()=>render());t.after(()=>React.act(async()=>root.unmount()));
 const find=label=>[...nodes.values()].find(n=>n.props.accessibilityLabel===label);
 return {calls,find,timers,setRows:next=>{rows=next;},async tick(){await React.act(async()=>{for(const fn of timers.values())fn();});},async background(state){await React.act(async()=>{native.AppState.currentState=state;appListener?.(state);});},async focus(value){await React.act(async()=>{focused=value;render();});},text:()=>[...nodes.values()].filter(n=>n.type==='Text').map(textOf).join(' '),async press(label,twice=false){const n=find(label);assert.ok(n,label);await React.act(async()=>{void n.props.onPress();if(twice)void n.props.onPress();});},async input(v,label='Your auction bid in USD'){await React.act(async()=>find(label).props.onChangeText(v));},async resolve(d,v){await React.act(async()=>d.resolve(v));},async account(){await React.act(async()=>{authority={userId:'other',sessionGeneration:'two'};rows=[];subscriber?.(authority);});},async navigate(){await React.act(async()=>{eventId='other-event';rows=[];render();});}};
}
test('mounted bid review validates strict cents, exact next minimum, and suppresses rapid duplicate taps',async t=>{
 const d=deferred();const h=await mount(t,{bid:()=>d.promise});await h.input('1.001');await h.press('Review bid');assert.equal(h.calls.filter(c=>c[0]==='eligibility').length,0);
 await h.input('1.25');await h.press('Review bid');assert.match(h.text(),/No charge now/);await h.press('Confirm bid $1.25 USD',true);assert.equal(h.calls.filter(c=>c[0]==='bid').length,1);await h.resolve(d,row);
});

test('Android winner uses native launch only and cancels late checkout after account, route or background change',async t=>{
 for(const room of [false,true]) {
  const winner={...row,state:'awarded',isWinner:true,awardAmountMinor:100,sourceKind:'stage_reserved_seat',roomSessionId:'session'};
  const checkout={url:'https://checkout.stripe.com/c/pay/test',launchStrategy:'google_play_external_content_link',platform:'android'};
  const h=await mount(t,{room,platform:'android',rows:[winner],checkout:async()=>checkout});
  await h.press('Continue to eligible test payment',true);
  assert.equal(h.calls.filter(c=>c[0]==='checkout').length,1);
  assert.equal(h.calls.filter(c=>c[0]==='nativeLaunch').length,1);
  assert.equal(h.calls.filter(c=>c[0]==='browser').length,0);
  if(room){assert.match(h.text(),/reserved guest spot/);assert.match(h.text(),/same account/);assert.match(h.text(),/not an automatic refund promise/);}
  for(const change of ['account','navigate','background']) {
   const d=deferred(),pending=await mount(t,{room,platform:'android',rows:[winner],checkout:()=>d.promise});
   await pending.press('Continue to eligible test payment');
   await pending[change](change==='background'?'background':undefined);
   await pending.resolve(d,checkout);
   assert.equal(pending.calls.filter(c=>c[0]==='nativeLaunch').length,0,change);
   assert.equal(pending.calls.filter(c=>c[0]==='nativeCancel').length,1,change);
  }
  const denied=await mount(t,{room,platform:'android',rows:[winner],nativeDenied:true});
  await denied.press('Continue to eligible test payment');
  assert.equal(denied.calls.filter(c=>c[0]==='checkout'||c[0]==='browser').length,0);
 }
});

test('reserved-seat bid review includes approved terms and never launches checkout; late native eligibility cannot bid after closing',async t=>{
 const seat={...row,sourceKind:'stage_reserved_seat',roomSessionId:'session'};
 const h=await mount(t,{room:true,platform:'android',rows:[seat]});
 await h.press('Review bid');assert.match(h.text(),/Admission included, same-account rejoin/);
 await h.press('Cancel bid review');assert.equal(h.find('Confirm bid $1.00 USD'),undefined);
 await h.press('Review bid');await h.press('Confirm bid $1.00 USD',true);
 assert.equal(h.calls.filter(c=>c[0]==='bid').length,1);
 assert.equal(h.calls.filter(c=>c[0]==='checkout'||c[0]==='nativeLaunch'||c[0]==='browser').length,0);
 const d=deferred(),pending=await mount(t,{room:true,platform:'android',rows:[seat],bidAdmission:()=>d.promise});
 await pending.press('Review bid');await pending.navigate();await pending.resolve(d,true);
 assert.equal(pending.calls.filter(c=>c[0]==='eligibility'||c[0]==='bid').length,0);
});
test('unknown eligibility and server errors stay closed with refresh recovery',async t=>{
 const h=await mount(t,{eligibility:async()=>false});await h.press('Review bid');assert.match(h.text(),/isn’t available for this account/);assert.equal(h.calls.filter(c=>c[0]==='bid').length,0);await h.press('Refresh auctions');assert.equal(h.calls.filter(c=>c[0]==='list').length,2);
});
test('late eligibility cannot restore review after account switch or route change',async t=>{
 for(const action of ['account','navigate']){const d=deferred();const h=await mount(t,{eligibility:()=>d.promise});await h.press('Review bid');await h[action]();await h.resolve(d,true);assert.equal(h.find('Confirm bid $1.00 USD'),undefined);assert.equal(h.calls.filter(c=>c[0]==='bid').length,0);}
});
test('hard-close race shows unconfirmed action and refreshes rather than awarding from client clock',async t=>{
 const h=await mount(t,{bid:async()=>{throw Error('closed');}});await h.press('Review bid');await h.press('Confirm bid $1.00 USD');assert.match(h.text(),/could not be confirmed/);assert.match(h.text(),/last server refresh/);assert.doesNotMatch(h.text(),/You won/);await h.press('Refresh auctions');
});
test('uncertain bid retains exact idempotency identity after card remount on refresh',async t=>{
 const h=await mount(t,{bid:async()=>{throw Error('network');}});await h.press('Review bid');await h.press('Confirm bid $1.00 USD');await h.press('Refresh auctions');await h.press('Review bid');await h.press('Confirm bid $1.00 USD');const bids=h.calls.filter(c=>c[0]==='bid');assert.equal(bids.length,2);assert.equal(bids[0][3],bids[1][3]);
});
test('pending, outbid and fulfilled readbacks never claim the bid grants admission',async t=>{
 const h=await mount(t,{rows:[{...row,state:'payment_pending',isWinner:true,myBidAmountMinor:100,highestAmountMinor:100,isHighestBidder:true}]});assert.match(h.text(),/Do not start another checkout/);assert.equal(h.find('Review bid'),undefined);
 const out=await mount(t,{rows:[{...row,myBidAmountMinor:100,highestAmountMinor:150,nextBidAmountMinor:175}]});assert.match(out.text(),/You have been outbid/);assert.match(out.text(),/Next minimum:\s+\$1.75 USD/);
});
test('failed auction read disables stale actions without losing draft',async t=>{
 let count=0;const h=await mount(t,{list:async()=>{if(count++)throw Error('network');return [row];}});await h.input('2.50');await h.press('Refresh auctions');assert.equal(h.find('Review bid').props.disabled,true);assert.equal(h.find('Your auction bid in USD').props.value,'2.50');assert.match(h.text(),/couldn’t update/);
});
test('winner payment is explicit, suppresses double taps and stale-account browser launch',async t=>{
 const d=deferred();const h=await mount(t,{rows:[{...row,state:'awarded',isWinner:true,awardAmountMinor:100}],checkout:()=>d.promise});assert.equal(h.calls.filter(c=>c[0]==='checkout').length,0);await h.press('Continue to eligible test payment',true);assert.equal(h.calls.filter(c=>c[0]==='checkout').length,1);await h.account();await h.resolve(d,'https://checkout.stripe.com/c/pay/test');assert.equal(h.calls.filter(c=>c[0]==='browser').length,0);
});
async function enterTime(h,label,{month='1',day='1',year='2099',hour='10',minute='00',period='AM'}={}){for(const [field,value] of Object.entries({month,day,year,hour,minute}))await h.input(value,`${label} ${field}`);await h.press(`${label} ${period}`);}
test('creator form uses friendly fields, exact cents, timezone-aware reviewed dates and no automatic payment',async t=>{
 const h=await mount(t,{editor:true});await h.input('2.50','Starting price in USD');await h.input('0.25','Minimum bid increase in USD');await enterTime(h,'Auction closes');await enterTime(h,'Winner payment deadline',{hour:'11'});await h.press('Review ticket auction');assert.equal(h.calls.filter(c=>c[0]==='create').length,0);assert.match(h.text(),/Winner must open checkout by/);await h.press('Confirm and create ticket auction',true);
 const call=h.calls.find(c=>c[0]==='create');assert.ok(call);assert.equal(call[1].startingAmountMinor,250);assert.equal(call[1].minIncrementMinor,25);assert.equal(call[1].closesAt,'2099-01-01T15:00:00.000Z');assert.equal(h.calls.filter(c=>c[0]==='create').length,1);assert.equal(h.calls.filter(c=>c[0]==='checkout').length,0);
});
test('room creator reviews exact reserved-seat terms and local timezone before a single explicit creation',async t=>{
 for(const sourceKind of ['stage_reserved_seat','party_admission']) {
  const h=await mount(t,{editor:true,room:true,sourceKind});
  await h.input('2.37','Starting price in USD');await h.input('0.25','Minimum bid increase in USD');
  await enterTime(h,'Auction closes');await enterTime(h,'Winner payment deadline',{hour:'11'});
  await h.press('Review room auction');
  assert.match(h.text(),/same-account rejoining/);assert.match(h.text(),/No automatic refund/);
  assert.ok(h.text().includes(Intl.DateTimeFormat().resolvedOptions().timeZone));
  assert.equal(h.calls.filter(c=>c[0]==='create').length,0);
  await h.press('Edit auction review');assert.equal(h.find('Confirm and create room auction'),undefined);
  await h.press('Review room auction');await h.press('Confirm and create room auction',true);
  const call=h.calls.find(c=>c[0]==='create');assert.equal(call[1].startingAmountMinor,237);
  assert.equal(call[1].sourceKind,sourceKind);assert.equal(call[1].partyId,'event');
  assert.equal(h.calls.filter(c=>c[0]==='create').length,1);
  assert.equal(h.calls.filter(c=>c[0]==='checkout'||c[0]==='nativeLaunch').length,0);
 }
});
test('room creation recovery replays retained session and terms without preparing a reopened room',async t=>{
 const previous={partyId:'event',sourceKind:'stage_reserved_seat',roomSessionId:'44444444-4444-4444-8444-444444444444',
  startingAmountMinor:237,minIncrementMinor:25,closesAt:'2099-01-01T10:00:00Z',paymentDeadline:'2099-01-01T11:00:00Z',environment:'test'};
 const h=await mount(t,{editor:true,room:true,pendingRead:async()=>previous,create:async()=>({...row,state:'canceled'})});
 assert.equal(h.find('Review room auction').props.disabled,true);
 await h.press('Check previous room auction',true);
 assert.equal(h.calls.filter(c=>c[0]==='create').length,1);
 assert.equal(h.calls.find(c=>c[0]==='create')[1],previous);
 assert.equal(h.calls.filter(c=>c[0]==='prepareRoom').length,0);
 assert.match(h.text(),/Previous auction request confirmed: canceled/);
 assert.match(h.text(),/did not create an auction for a different room session/);
});
test('foreground polling retains draft and review until a changed bid, and pauses on background or blur',async t=>{
 const h=await mount(t);await h.input('2.50');await h.press('Review bid');assert.ok(h.find('Confirm bid $2.50 USD'));
 h.setRows([{...row,serverNow:'2099-01-01T10:01:00Z'}]);await h.tick();assert.equal(h.find('Your auction bid in USD').props.value,'2.50');assert.ok(h.find('Confirm bid $2.50 USD'));
 const before=h.calls.filter(c=>c[0]==='list').length;await h.background('background');await h.tick();assert.equal(h.calls.filter(c=>c[0]==='list').length,before);
 await h.background('active');assert.equal(h.calls.filter(c=>c[0]==='list').length,before+1);
 h.setRows([{...row,highestAmountMinor:300,nextBidAmountMinor:325,myBidAmountMinor:250}]);await h.tick();assert.equal(h.find('Confirm bid $2.50 USD'),undefined);assert.equal(h.find('Your auction bid in USD').props.value,'2.50');assert.match(h.text(),/outbid/);
 await h.focus(false);const blurred=h.calls.filter(c=>c[0]==='list').length;assert.equal(h.timers.size,0);await h.tick();assert.equal(h.calls.filter(c=>c[0]==='list').length,blurred);await h.focus(true);assert.equal(h.timers.size,1);
});
test('new server close invalidates an inflight eligibility response and keeps draft until outcome arrives',async t=>{
 const d=deferred();const h=await mount(t,{eligibility:()=>d.promise});await h.input('2.50');await h.press('Review bid');h.setRows([{...row,state:'expired'}]);await h.tick();await h.resolve(d,true);assert.equal(h.find('Confirm bid $2.50 USD'),undefined);assert.equal(h.find('Review bid'),undefined);assert.match(h.text(),/expired/);
});
test('creator chooses repeated daylight-saving hour explicitly and rejects too-short checkout window',async t=>{
 const h=await mount(t,{editor:true});await h.input('2.50','Starting price in USD');await enterTime(h,'Auction closes',{month:'11',day:'2',year:'2025',hour:'1',minute:'30'});assert.match(h.text(),/Which occurrence/);await h.press('Auction closes second occurrence (after clocks go back)');await enterTime(h,'Winner payment deadline',{month:'11',day:'2',year:'2025',hour:'2',minute:'00'});await h.press('Review ticket auction');assert.match(h.text(),/more than 31 minutes/);assert.equal(h.calls.filter(c=>c[0]==='create').length,0);
 await h.input('30','Winner payment deadline minute');await h.press('Review ticket auction');await h.press('Confirm and create ticket auction');assert.equal(h.calls.find(c=>c[0]==='create')[1].closesAt,'2025-11-02T06:30:00.000Z');
});
test('winner latest-start cutoff uses server clock and background prevents late browser launch',async t=>{
 const h=await mount(t,{rows:[{...row,state:'awarded',isWinner:true,awardAmountMinor:100,serverNow:'2099-01-01T11:30:00Z'}]});assert.equal(h.find('Continue to eligible test payment'),undefined);assert.match(h.text(),/time to open a new checkout has passed/);
 const d=deferred();const pending=await mount(t,{rows:[{...row,state:'awarded',isWinner:true,awardAmountMinor:100}],checkout:()=>d.promise});await pending.press('Continue to eligible test payment');await pending.background('background');await pending.resolve(d,'https://checkout.stripe.com/c/pay/test');assert.equal(pending.calls.filter(c=>c[0]==='browser').length,0);
});
test('live bidding stays unavailable while only test checkout is implemented',async t=>{
 const h=await mount(t,{rows:[{...row,environment:'live'}]});assert.equal(h.find('Review bid'),undefined);assert.match(h.text(),/Live auction bidding is not activated/);assert.equal(h.calls.filter(c=>c[0]==='eligibility'||c[0]==='bid'||c[0]==='checkout').length,0);
});
test('creator review rejects checkout windows over 24 hours and accepts the exact upper bound',async t=>{
 const h=await mount(t,{editor:true,startsAt:'2099-01-05T00:00:00Z'});await h.input('2.50','Starting price in USD');await enterTime(h,'Auction closes');await enterTime(h,'Winner payment deadline',{day:'2',hour:'10',minute:'01'});await h.press('Review ticket auction');assert.match(h.text(),/up to 24 hours/);assert.equal(h.find('Confirm and create ticket auction'),undefined);await h.input('00','Winner payment deadline minute');await h.press('Review ticket auction');assert.ok(h.find('Confirm and create ticket auction'));
});
test('qualified checkout opens system browser and foreground return refreshes without payment claim',async t=>{
 const h=await mount(t,{rows:[{...row,state:'awarded',isWinner:true,awardAmountMinor:100}]});await h.press('Continue to eligible test payment');assert.equal(h.calls.filter(c=>c[0]==='browser').length,1);assert.match(h.text(),/opening checkout does not confirm a ticket/);const before=h.calls.filter(c=>c[0]==='list').length;await h.background('background');await h.background('active');assert.equal(h.calls.filter(c=>c[0]==='list').length,before+1);
 const android=await mount(t,{platform:'android',rows:[{...row,state:'awarded',isWinner:true,awardAmountMinor:100}]});await android.press('Continue to eligible test payment');assert.equal(android.calls.filter(c=>c[0]==='browser').length,0);
});
test('after refresh to payment_pending the winner can resume the same checkout but unknown recovery never opens a new link',async t=>{
 const winner={...row,state:'awarded',isWinner:true,awardAmountMinor:100};
 let unknown=false;
 const h=await mount(t,{rows:[winner],checkout:async()=>{if(unknown)throw Error('outcome unknown');return {url:'https://checkout.stripe.com/c/pay/test',launchStrategy:'system_browser',platform:'ios'};}});
 await h.press('Continue to eligible test payment');
 h.setRows([{...winner,state:'payment_pending'}]);await h.press('Refresh auctions');
 assert.equal(h.find('Continue to eligible test payment'),undefined);
 await h.press('Resume existing checkout',true);
 assert.equal(h.calls.filter(c=>c[0]==='checkout').length,2);
 assert.equal(h.calls.filter(c=>c[0]==='browser').length,2);
 assert.match(h.text(),/cannot start a new quote or charge/);
 unknown=true;await h.press('Resume existing checkout');
 assert.equal(h.calls.filter(c=>c[0]==='browser').length,2);
 assert.match(h.text(),/could not be verified/);
});
