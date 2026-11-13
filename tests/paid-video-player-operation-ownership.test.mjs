import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync('app/player/[id].tsx','utf8');
const start=source.indexOf('  const handlePaidVideoUnlock = useCallback(');
const end=source.indexOf('  const stripeSandboxDeliveryOnly =',start);
function harness(){
 let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});
 const writes=[],generation={current:0},video={current:'video'},authority={current:true};let releases=0;
 const env={exports:{},useCallback:fn=>fn,debugLog:()=>{},creatorVideo:{id:'video',ownerId:'creator',paidContentAccess:{resolverStatus:'resolved',allowed:false,reason:'purchase_required',requiresPurchase:true,priceCents:500,currency:'usd'}},paidVideoUnlockBusy:false,isSignedIn:true,paidVideoCheckoutAvailable:true,creatorVideoPaidContentPriceLabel:'$5',
  paidVideoUnlockLatchRef:{current:{tryAcquire:()=>true,release:()=>{releases++}}},paidVideoOperationGenerationRef:generation,stripeRefreshVideoRef:video,
  captureCreatorMoneyPurchaseAuthority:()=>({}),isCreatorMoneyPurchaseAuthorityCurrent:()=>authority.current,
  setPaidVideoUnlockBusy:v=>writes.push(['busy',v]),setPaidVideoUnlockMessage:v=>writes.push(['message',v]),Platform:{OS:'web'},purchasePaidVideoAccess:()=>promise,
  readCreatorVideoForPlayer:async()=>({id:'video'}),setCreatorVideo:v=>writes.push(['video',v]),setItem:v=>writes.push(['item',v]),buildCreatorPlayerTitle:v=>v,logCreatorVideoPlaybackResolution:()=>{},setPlaybackLoadError:v=>writes.push(['error',v]),setIsVideoReady:v=>writes.push(['ready',v])};
 vm.runInNewContext(ts.transpileModule(`${source.slice(start,end)}\nexports.run=handlePaidVideoUnlock;`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,env);
 return {run:env.exports.run,writes,resolve,reject,generation,video,authority,releases:()=>releases};
}
test('purchase completion cannot overwrite a new video or release its newer operation',async()=>{
 const h=harness(),pending=h.run();h.writes.length=0;h.generation.current++;h.video.current='other';h.resolve({ok:true,message:'paid'});await pending;
 assert.deepEqual(h.writes,[]);assert.equal(h.releases(),0);
});
test('purchase failure after account change cannot show stale message or busy state',async()=>{
 const h=harness(),pending=h.run();h.writes.length=0;h.authority.current=false;h.reject(Error('old failure'));await pending;
 assert.deepEqual(h.writes,[]);
});
test('current operation still updates canonical player and releases its latch',async()=>{
 const h=harness(),pending=h.run();h.resolve({ok:true,message:'verified'});await pending;
 assert.ok(h.writes.some(([k])=>k==='video'));assert.deepEqual(h.writes.at(-1),['busy',false]);assert.equal(h.releases(),1);
});
test('refresh failure from a retired video cannot overwrite the current view or release a newer action',async()=>{
 const begin=source.indexOf('                        if (!creatorVideo || paidVideoUnlockBusy) return;',source.indexOf('testID="stripe-paid-video-refresh-access"'));
 const finish=source.indexOf('\n                      }}>',begin);
 assert.ok(begin>0&&finish>begin);
 let reject;const pending=new Promise((_,r)=>{reject=r});const writes=[],generation={current:0},video={current:'video'};let releases=0;
 const env={exports:{},creatorVideo:{id:'video'},paidVideoUnlockBusy:false,paidVideoUnlockLatchRef:{current:{tryAcquire:()=>true,release:()=>{releases++}}},
  paidVideoOperationGenerationRef:generation,stripeRefreshVideoRef:video,captureCreatorMoneyPurchaseAuthority:()=>({}),isCreatorMoneyPurchaseAuthorityCurrent:()=>true,
  setPaidVideoUnlockBusy:v=>writes.push(v),setPaidVideoUnlockMessage:v=>writes.push(v),refreshPaidVideoPayment:()=>pending,readCreatorVideoForPlayer:async()=>null};
 vm.runInNewContext(ts.transpileModule(`exports.run=()=>{${source.slice(begin,finish)}\n};`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,env);
 env.exports.run();writes.length=0;generation.current++;video.current='new';reject(Error('old failure'));
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(writes,[]);assert.equal(releases,0);
});
