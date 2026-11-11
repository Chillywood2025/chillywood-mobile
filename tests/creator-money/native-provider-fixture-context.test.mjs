import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {databaseFactory} from '../helpers/native-deployment-database.mjs';

// Context semantics only; actual provider behavior is covered by the SQL suites.
test('non-superuser synthetic provider context restores caller without restricted function settings',{timeout:600000},async()=>{
 const db=process.env.NATIVE_DEPLOYMENT_PG_BIN?await databaseFactory({transport:process.env.NATIVE_PRODUCTION_PG_LOOPBACK==='1'?'loopback':'unix'}):new PGlite();
 try {
  await db.exec(`create role fixture_actor; grant temporary on database postgres to fixture_actor; set session authorization fixture_actor;`);
  assert.equal((await db.query(`select rolsuper from pg_roles where rolname=current_user`)).rows[0].rolsuper,false);
  await db.exec(`create function pg_temp.fixture_guard(fail boolean) returns text language plpgsql as $$begin
   if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then raise exception using errcode='42501',message='provider_service_role_required';end if;
   if fail then raise exception using errcode='P1234',message='original_provider_failure';end if;return 'accepted';end$$;
   create function pg_temp.fixture_call(fail boolean) returns text language plpgsql as $$declare prior text:=current_setting('request.jwt.claim.role',true);result text;begin
    perform set_config('request.jwt.claim.role','service_role',true);result:=pg_temp.fixture_guard(fail);
    perform set_config('request.jwt.claim.role',coalesce(prior,''),true);return result;
   exception when others then perform set_config('request.jwt.claim.role',coalesce(prior,''),true);raise;end$$;`);
  await assert.rejects(db.exec(`create function pg_temp.forbidden() returns text language sql set "request.jwt.claim.role"='service_role' as 'select current_setting(''request.jwt.claim.role'',true)'`),e=>e.code==='42501'&&/permission denied to set parameter/.test(e.message));
  for(const prior of ['', 'authenticated','anon','service_role']) {
   await db.query(`select set_config('request.jwt.claim.role',$1,false)`,[prior]);
   assert.equal((await db.query('select pg_temp.fixture_call(false) result')).rows[0].result,'accepted');
   assert.equal((await db.query(`select current_setting('request.jwt.claim.role',true) role`)).rows[0].role,prior);
   await assert.rejects(db.query('select pg_temp.fixture_call(true)'),e=>e.code==='P1234'&&e.message==='original_provider_failure');
   assert.equal((await db.query(`select current_setting('request.jwt.claim.role',true) role`)).rows[0].role,prior);
  }
  await db.query(`select set_config('request.jwt.claim.role','authenticated',false)`);
  await assert.rejects(db.query('select pg_temp.fixture_guard(false)'),e=>e.code==='42501');
  const funcs=(await db.query(`select prosecdef,proconfig from pg_proc where pronamespace=pg_my_temp_schema()`)).rows;
  assert.equal(funcs.length,2);for(const f of funcs){assert.equal(f.prosecdef,false);assert.equal(f.proconfig,null);}
 } finally {await db.close();}
});
