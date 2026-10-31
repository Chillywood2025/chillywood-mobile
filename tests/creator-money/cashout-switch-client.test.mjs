import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './stripe-connect-observed-fixture.mjs';
import {readFileSync} from 'node:fs';
test('cashout switch is read back and defaults off, without changing other flags or implying provider readiness',async()=>{
 const rows=[{key:'cashout_enabled',state:'off',display_label:'Instant cashout'},{key:'not_a_real_key',state:'on'}];
 const api=load('_lib/moneyFeatureFlags.ts',{'./supabase':{supabase:{rpc:async()=>({data:rows,error:null})}},'./accountBoundSupabaseMutation':{}});
 assert.equal(api.MONEY_FEATURE_FLAG_DEFAULT_STATES.cashout_enabled,'off');
 assert.equal(api.MONEY_FEATURE_FLAG_DEFAULT_STATES.payouts_enabled,'off');assert.equal(api.MONEY_FEATURE_FLAG_DEFAULT_STATES.live_money_enabled,'off');
 assert.equal(api.MONEY_FEATURE_FLAG_KEYS.filter(k=>k==='cashout_enabled').length,1);
 const result=await api.readPlatformMoneyKillSwitches();assert.equal(result.length,1);assert.equal(result[0].key,'cashout_enabled');assert.equal(result[0].state,'off');
 assert.match(api.getMoneyFeaturePublicSummary('on'),/provider checks/);
 const admin=readFileSync('app/admin.tsx','utf8');assert.match(admin,/const HIGH_RISK_MONEY_SWITCHES[\s\S]*?"cashout_enabled"[\s\S]*?\]\);/);
});
