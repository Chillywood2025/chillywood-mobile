// Local-only complete legacy + original48 + shared + Play predecessor fixture.
// Never a target baseline or deployment transport.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {localFullCatalogFixture} from '../native-store-play-handoff-v1/deployment-scale-fixture.mjs';
import {localManagedFixture} from '../native-store-play-handoff-v1/deployment-fixture.mjs';
import {verifySource as verifyPlaySource} from '../native-store-play-handoff-v1/deployment.mjs';
import {quote} from '../native-store-play-handoff-v1/deployment-catalog-support.mjs';
export async function authoringDeploymentFixture(options){
 const {full=true,...settings}=options;
 let f;
 if(full)f=await localFullCatalogFixture(settings);
 else{
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const raw=await localManagedFixture({...settings,sourceRoot:root,eventParity:true,oidPadding:true});
  const renamed=raw.run('psql',raw.args('fixture_admin','template1'),'alter database postgres rename to original_postgres;alter database play_catalog_fixture rename to postgres;');
  assert.equal(renamed.status,0,renamed.stderr);
  const args=(user='fixture_admin')=>raw.args(user,'postgres');
  const q=(sql,user='fixture_admin')=>{const r=raw.run('psql',args(user),sql);assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();};
  const fixtureToken=randomUUID(),base=raw.profile.sql.replace(/^begin;\n/u,'').replace(/\ncommit;\n$/u,'');
  q(`create schema play_deployment_local_fixture;create table play_deployment_local_fixture.marker(token uuid primary key);
   insert into play_deployment_local_fixture.marker values(${quote(fixtureToken)});revoke all on schema play_deployment_local_fixture from public;
   grant usage on schema play_deployment_local_fixture to postgres;grant select on play_deployment_local_fixture.marker to postgres;
   create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text,created_by text,idempotency_key text unique,rollback text[]);
   alter table supabase_migrations.schema_migrations owner to postgres;
   insert into supabase_migrations.schema_migrations(version,name,statements) values('20261109151349','native_store_sandbox_source_bound_48',array[${quote(base)}]);
   insert into public.platform_money_kill_switches select k,case when k in('live_money_enabled','payouts_enabled','cashout_enabled') then 'off' else 'sandbox_only' end
    from unnest(array['live_money_enabled','payouts_enabled','cashout_enabled','stripe_connect_enabled','tips_enabled','creator_monetization_enabled','provider_webhooks_enabled','revenuecat_app_store_enabled','revenuecat_google_play_enabled']) k on conflict(key) do update set state=excluded.state;
   grant usage on schema public,supabase_migrations to supabase_read_only_user;
   grant select on public.platform_money_kill_switches,supabase_migrations.schema_migrations to supabase_read_only_user;
   grant usage on schema supabase_migrations to postgres;grant select,insert,maintain on supabase_migrations.schema_migrations to postgres;
   alter role supabase_read_only_user set default_transaction_read_only=on;`);
  f={...raw,q,args,fixtureToken};
 }
 try{
  const read=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8');
  const shared=read('../native-store-shared-routing-v1/exclusion.sql');
  const play=read('../native-store-play-handoff-v1/deployment.sql');
  // The immutable source modules create the prior source state only. Retain
  // their exact receipts; do not claim this local setup is hosted installation.
  f.q(`begin;${shared}\n${verifyPlaySource().map(x=>x.data.toString('utf8')).join('\n')}
   insert into supabase_migrations.schema_migrations(version,name,statements) values
   ('20261110021153','revenuecat_native_legacy_exclusion_v1',array[${quote(shared)}]),
   ('20261110021650','native_store_play_handoff_settlement_v1',array[${quote(play)}]);commit;`,'postgres');
  assert.equal(f.q('select count(*) from supabase_migrations.schema_migrations;'),full?'633':'3');
  return f;
 }catch(error){f.stop();throw error;}
}
