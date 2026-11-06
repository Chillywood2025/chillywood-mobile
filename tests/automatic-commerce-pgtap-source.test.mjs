import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {readPgtapSource} from './helpers/pgtap-source.mjs';

test('canonical creator fixture is disposable invoker-only evidence, never installed authority',()=>{
 const fixture=fs.readFileSync('supabase/tests/fixtures/automatic-commerce.inc','utf8');
 assert.equal((fixture.match(/create function pg_temp\./gu)??[]).length,3);
 assert.doesNotMatch(fixture,/security definer|create or replace|insert into public\.(?:user_entitlements|access_grants|revenuecat_premium_transaction_authority)/iu);
 for(const fn of ['seed_creator_premium(uuid,text)','seed_synthetic_creator_provider(uuid)','declare_sandbox_creator(uuid,uuid)'])
  assert.ok(fixture.includes(`revoke all on function pg_temp.${fn} from public,anon,authenticated,service_role`));
 assert.ok(fixture.includes('public.process_revenuecat_premium_event_atomic('));
 assert.ok(fixture.includes("now()+interval '1 day'"));
 assert.ok(fixture.includes('public.declare_creator_money_eligibility(true'));
 assert.ok(fixture.includes("state='PENDING_VERIFICATION' and tax_complete is null and sanctions_clear is null"));
 for(const name of fs.readdirSync('supabase/migrations')) {
  if(!name.endsWith('.sql'))continue;
  assert.doesNotMatch(fs.readFileSync(`supabase/migrations/${name}`,'utf8'),/pg_temp\.(?:seed_creator_premium|seed_synthetic_creator_provider|declare_sandbox_creator)|fixtures\/automatic-commerce\.inc/u,name);
 }
});

test('SQL preflight expands the same explicit psql fixture and keeps exact consumer inventory assertions',()=>{
 const source=readPgtapSource('channel_subscription_price_requests_test.sql');
 assert.ok(source.startsWith('begin;\n-- Disposable pgTAP transactions ONLY.'));
 assert.doesNotMatch(source,/^\\ir/mu);
 assert.throws(()=>readPgtapSource('../fixtures/automatic-commerce.inc'),/invalid pgTAP test name/);
 const inventory=readPgtapSource('wave1_session_not_after_authority_test.sql');
 assert.ok(inventory.includes('pg_get_functiondef(procedure.oid)'));
 assert.ok(inventory.includes('34,'));
 for(const name of ['wave1_creator_eligibility_readback_pre_automatic','wave1_creator_eligibility_readback_pre_sandbox_capability'])
  assert.ok(inventory.includes(`'${name}'`));
 assert.doesNotMatch(inventory,/'wave1_creator_eligibility_readback',/u);
});
