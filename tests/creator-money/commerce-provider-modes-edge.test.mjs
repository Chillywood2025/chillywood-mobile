import test from 'node:test';
import assert from 'node:assert/strict';
import * as merch from './merch-cost-observation-edge.test.mjs';
import * as auction from './auction-cost-observation-edge.test.mjs';

// Synthetic transports only: no real provider request or credential is used.
for (const [lane,module,environment] of [['merch',merch,'production'],['auction',auction,'live']]) {
 const setup=()=>{
  const f=module.fixture();
  const checkout=f.data['/checkout/sessions/cs_test_merch'];
  delete f.data['/checkout/sessions/cs_test_merch'];
  checkout.id='cs_live_merch';checkout.metadata.environment=environment;
  f.data['/checkout/sessions/cs_live_merch']=checkout;
  for(const value of Object.values(f.data))if(value && Object.hasOwn(value,'livemode'))value.livemode=true;
  const transport=async(url,options)=>{
   assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,'Bearer rk_live_synthetic');
   const path=new URL(url).pathname.replace('/v1','')+new URL(url).search;
   assert.ok(Object.hasOwn(f.data,path),path);return new Response(JSON.stringify(f.data[path]));
  };
  return {...f,transport,order:{...module.order,environment,stripe_checkout_session_id:'cs_live_merch',platform_account_id:'acct_fixture'}};
 };
 test(`${lane} production observation binds actual mode and account without money authority`,async()=>{
  const f=setup();const result=await module.observe(f.order,'rk_live_synthetic','acct_fixture',f.transport);
  assert.equal(result.environment,environment);assert.equal(result.financial_authority,false);
 });
 for(const [name,mutate] of [
  ['wrong key',f=>f.secret='sk_test_synthetic'],
  ['missing account binding',f=>delete f.order.platform_account_id],
  ['wrong account binding',f=>f.order.platform_account_id='acct_other'],
  ['unknown environment',f=>f.order.environment='setup'],
  ['test checkout',f=>f.data['/checkout/sessions/cs_live_merch'].livemode=false],
  ['test intent',f=>f.data['/payment_intents/pi_merch'].livemode=false],
  ['test charge',f=>f.data['/charges/ch_merch'].livemode=false],
  ['test metadata',f=>f.data['/checkout/sessions/cs_live_merch'].metadata.environment='sandbox'],
 ])test(`${lane} rejects ${name} in production evidence`,async()=>{
  const f=setup();mutate(f);await assert.rejects(module.observe(f.order,f.secret??'rk_live_synthetic','acct_fixture',f.transport));
 });
}
