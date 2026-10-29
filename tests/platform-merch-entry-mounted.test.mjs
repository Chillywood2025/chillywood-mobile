import assert from 'node:assert/strict';
import test from 'node:test';
import {mount} from './platform-public-mounted-harness.mjs';
test('real public Platform mounts discoverable Shop entry without obsolete preview checkout',async t=>{
  const h=await mount(t,{route:{userId:'creator'},videos:[]});
  const shop=h.find(n=>n.props.testID==='platform-shop-button');
  assert.ok(shop);
  await h.press(shop);
  assert.equal(h.routes.at(-1).pathname,'/merch/[creatorId]');
  assert.equal(h.routes.at(-1).params.creatorId,'creator');
  assert.doesNotMatch(h.text(),/Checkout pending/);
});
test('blocked Platform does not expose Shop entry',async t=>{
  const h=await mount(t,{route:{userId:'creator'},videos:[],overrides:{resolvePlatformVisibilityAccess:async()=>({allowed:false,isBlocked:true,reason:'blocked'})}});
  assert.doesNotMatch(h.text(),/Shop/);
});
