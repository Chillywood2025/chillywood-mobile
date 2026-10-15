// Full production route and real React hooks. Expo focus, native hosts and IO
// are modeled boundaries; this is not installed-device or live-network proof.
import assert from 'node:assert/strict';
import test from 'node:test';
import {mount,deferred} from './platform-public-mounted-harness.mjs';
const identity=displayName=>({displayName,username:'creator',tagline:'Creator tagline'});
test('mounted public Platform re-entry refreshes identity and published presentation',async t=>{
 let name='Before',theme='city_night';const h=await mount(t,{route:{userId:'creator'},videos:[],overrides:{
  readPublicPlatformIdentity:async()=>identity(name),readUserProfileByUserId:async()=>identity(name),
  readPublicPlatformBranding:async()=>({profile:{themePreset:theme,accentColor:'#DC143C'},assets:[]}),
 }});
 assert.match(h.text(),/Before/);await h.focus(false);name='After';theme='studio_red';await h.focus(true);
 assert.match(h.text(),/After/);assert.doesNotMatch(h.text(),/Before/);
 const screen=h.find(n=>n.props.testID==='screen-platform');assert.equal(screen.props.style.at(-1).backgroundColor,'#12070C');
 assert.equal(h.calls.filter(([n])=>n==='readPublicPlatformBranding').length,2);
});
test('mounted public Platform ignores identity received after blur and uses new focus read',async t=>{
 const old=deferred();const h=await mount(t,{route:{userId:'creator'},videos:[],overrides:{readPublicPlatformIdentity:()=>old.promise,readUserProfileByUserId:()=>old.promise}});
 await h.focus(false);h.mocks.readPublicPlatformIdentity=async()=>identity('New focus');h.mocks.readUserProfileByUserId=async()=>identity('New focus');await h.focus(true);
 assert.match(h.text(),/New focus/);await h.resolve(old,identity('Old blurred result'));assert.match(h.text(),/New focus/);assert.doesNotMatch(h.text(),/Old blurred result/);
});
test('mounted public Platform core read error shows Retry and refreshes without false empty success',async t=>{
 const h=await mount(t,{route:{userId:'creator'},videos:[],overrides:{readCreatorVideos:async()=>{throw Error('modeled videos unavailable');}}});
 assert.match(h.text(),/Platform could not load/);assert.doesNotMatch(h.text(),/No visible uploads yet/);
 h.mocks.readCreatorVideos=async()=>[];await h.press(h.button('Retry'));assert.doesNotMatch(h.text(),/Platform could not load/);assert.match(h.text(),/No visible uploads yet/);
});
test('mounted public Platform access denial never loads identity, videos or branding',async t=>{
 const h=await mount(t,{route:{userId:'creator'},videos:[],overrides:{resolvePlatformVisibilityAccess:async()=>({allowed:false,isBlocked:true,reason:'blocked'})}});
 assert.match(h.text(),/cannot view/);for(const name of ['readPublicPlatformIdentity','readCreatorVideos','readPublicPlatformBranding'])assert.equal(h.calls.filter(([n])=>n===name).length,0,name);
});
