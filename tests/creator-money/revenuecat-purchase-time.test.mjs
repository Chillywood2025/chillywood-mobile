import test from 'node:test';
import assert from 'node:assert/strict';
import {createRevenueCatNotificationHarness} from './revenuecat-notification-harness.mjs';

for(const platform of ['ios','android']) {
  test(`actual ${platform} event handler preserves original purchase time independently of webhook generation`,async()=>{
    const purchased=Date.UTC(2026,9,20,18,0), generated=Date.UTC(2026,9,26,18,0);
    const h=createRevenueCatNotificationHarness({platform,productType:'event_pass',event:{purchased_at_ms:purchased,event_timestamp_ms:generated}});
    await h.run();
    assert.equal(h.rpcs().length,1);
    assert.equal(h.rpcs()[0].args.p_purchase_occurred_at,new Date(purchased).toISOString());
    assert.equal(h.rpcs()[0].args.p_occurred_at,new Date(generated).toISOString());
  });
  for(const value of [undefined,'invalid',0]) test(`actual ${platform} missing purchase time ${String(value)} is not replaced by receipt time`,async()=>{
    const h=createRevenueCatNotificationHarness({platform,productType:'event_pass',event:{purchased_at_ms:value,event_timestamp_ms:Date.UTC(2026,9,26,18,0)}});
    await h.run();
    assert.equal(h.rpcs()[0].args.p_purchase_occurred_at,null);
  });
}
