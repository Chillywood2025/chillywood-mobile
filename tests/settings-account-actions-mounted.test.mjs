import assert from 'node:assert/strict';
import test from 'node:test';
import { mount, owner, deferred } from './helpers/notification-settings-mounted-harness.mjs';
const confirm = (h,title,label) => { const alert=h.state.alerts.findLast(a=>a[0]===title); assert.ok(alert,title);
  const button=alert[2].find(b=>b.text===label); assert.ok(button,label); return button.onPress; };
async function deletion(h) { await h.act(()=>h.action('settings-delete-account-button').onPress()); return confirm(h,'Delete account?','Delete Account'); }
for(const keyed of [true,false]) test(`stale deletion confirmation cannot delete replacement (keyed=${keyed})`,async t=>{
  const h=await mount(t,{keyed}), old=await deletion(h); await h.replace(owner('session-b','replacement'));
  await h.act(old); assert.equal(h.state.deletionRequests.length,0); assert.equal(h.state.signOuts.length,0);
});
test('same-user reauthentication invalidates old deletion dialog',async t=>{
  const h=await mount(t), old=await deletion(h); await h.replace(owner('session-new')); await h.act(old);
  assert.equal(h.state.deletionRequests.length,0);
});
test('same account deletion freezes request subject and success acknowledgement signs out only that session',async t=>{
  const h=await mount(t), old=await deletion(h); await h.act(old);
  assert.equal(h.state.deletionRequests.length,1); assert.equal(h.state.deletionRequests[0].subject.sessionGeneration,'session-a');
  const ok=confirm(h,'Account deletion','OK'); await h.act(ok);
  assert.equal(h.state.signOuts.length,1); assert.equal(h.state.voipRevocations.length,1); assert.deepEqual(h.state.routes,['/(auth)/login']);
});
test('stale success acknowledgement cannot clean up or navigate replacement',async t=>{
  const h=await mount(t), old=await deletion(h); await h.act(old); const ok=confirm(h,'Account deletion','OK');
  await h.replace(owner('session-b','replacement')); await h.act(ok);
  assert.equal(h.state.revocations,0); assert.equal(h.state.voipRevocations.length,0); assert.equal(h.state.signOuts.length,0); assert.deepEqual(h.state.routes,[]);
});
test('late deletion response stays on its frozen account and cannot alter successor UI',async t=>{
  const h=await mount(t), held=deferred(); h.state.deletionHandler=()=>held.promise;
  const old=await deletion(h); await h.act(old); assert.equal(h.state.deletionRequests.length,1);
  await h.replace(owner('session-b','replacement')); await h.act(()=>held.resolve({scheduled:true}));
  assert.equal(h.state.alerts.filter(a=>a[0]==='Account deletion').length,0);
  assert.equal(h.action('settings-delete-account-button').disabled,false); assert.equal(h.state.signOuts.length,0);
});
for(const pause of ['revokeHandler','voipHandler']) test(`logout stops after account switches during ${pause}`,async t=>{
  const h=await mount(t), held=deferred(); h.state[pause]=()=>held.promise; let pending;
  await h.act(()=>{pending=h.action('settings-logout-button').onPress();}); await h.replace(owner('session-b','replacement'));
  await h.act(()=>held.resolve()); await pending; assert.equal(h.state.signOuts.length,0); assert.deepEqual(h.state.routes,[]);
  if(pause==='revokeHandler') assert.equal(h.state.voipRevocations.length,0);
});
test('failed push and VoIP cleanup preserve normal same-account logout behavior',async t=>{
  const h=await mount(t); h.state.revokeHandler=async()=>{throw Error('fixture');}; h.state.voipHandler=async()=>{throw Error('fixture');};
  await h.act(()=>h.action('settings-logout-button').onPress()); assert.equal(h.state.signOuts.length,1); assert.deepEqual(h.state.routes,['/(auth)/login']);
});
test('deletion may enter restore-only in the same session before response settles',async t=>{
  const h=await mount(t), held=deferred(); h.state.deletionHandler=()=>held.promise;
  const old=await deletion(h); await h.act(old); await h.replace({...owner(),restoreOnly:true});
  await h.act(()=>held.resolve({scheduled:true})); const ok=confirm(h,'Account deletion','OK'); await h.act(ok);
  assert.equal(h.state.signOuts.length,1);
});
test('stale restore confirmation cannot restore another account',async t=>{
  const h=await mount(t,{authority:{...owner(),restoreOnly:true}});
  await h.act(()=>h.action('settings-restore-account-button').onPress()); const restore=confirm(h,'Restore account?','Restore Account');
  await h.replace({...owner('session-b','replacement'),restoreOnly:true}); await h.act(restore);
  assert.equal(h.state.restorationRequests.length,0);
});
