import assert from 'node:assert/strict';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {managedRequestContextSQL, managedExtensionUsageSQL} from './helpers/database-managed-request-context.mjs';

test('managed request fixtures support both PostgREST claim formats without adding application access', async () => {
  const db = new PGlite();
  const modernId = '11111111-1111-4111-8111-111111111111';
  const legacyId = '22222222-2222-4222-8222-222222222222';
  const claims = {sub:modernId,role:'authenticated',email:'modern@example.test'};
  const setting = (key,value) => db.query('select set_config($1,$2,false)',[key,value]);
  const identity = async () => (await db.query('select auth.uid() id,auth.role() role,auth.email() email,auth.jwt() jwt')).rows[0];
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema extensions;');
    await db.exec(managedRequestContextSQL + managedExtensionUsageSQL);
    assert.deepEqual(await identity(),{id:null,role:null,email:null,jwt:null},'missing claims do not fabricate an actor');
    await setting('request.jwt.claims',JSON.stringify(claims));
    assert.deepEqual(await identity(),{id:modernId,role:'authenticated',email:'modern@example.test',jwt:claims});
    for (const [key,value] of [['sub',legacyId],['role','anon'],['email','legacy@example.test']]) {
      await setting(`request.jwt.claim.${key}`,value);
    }
    assert.deepEqual(await identity(),{id:legacyId,role:'anon',email:'legacy@example.test',jwt:claims},
      'legacy scalar claims take precedence without rewriting the JWT document');
    for (const key of ['sub','role','email']) await setting(`request.jwt.claim.${key}`,'');
    assert.deepEqual(await identity(),{id:modernId,role:'authenticated',email:'modern@example.test',jwt:claims},
      'cleared legacy settings fall back to modern JSON');
    await setting('request.jwt.claim',JSON.stringify({legacy:true}));
    assert.deepEqual((await identity()).jwt,{legacy:true},'auth.jwt supports its older JSON setting');
    await setting('request.jwt.claim','');
    await setting('request.jwt.claims','');
    assert.deepEqual(await identity(),{id:null,role:null,email:null,jwt:null},'empty settings remove actor authority');
    await setting('request.jwt.claim.sub','not-a-uuid');
    await assert.rejects(()=>identity(),/invalid input syntax for type uuid/,'invalid actor identity still fails');
    await setting('request.jwt.claim.sub','');
    await db.exec('create function extensions.fixture_tap_visible() returns boolean language sql as $$select true$$;');
    for (const role of ['anon','authenticated','service_role']) {
      const row=(await db.query("select has_schema_privilege($1,'extensions','USAGE') usage,has_schema_privilege($1,'extensions','CREATE') can_create",[role])).rows[0];
      assert.deepEqual(row,{usage:true,can_create:false},`${role} can resolve extensions without creating them`);
      await db.exec(`set role ${role};set search_path=public,extensions;`);
      assert.equal((await db.query('select fixture_tap_visible() ok')).rows[0].ok,true,'extension function resolves after SET ROLE');
      await db.exec('reset role');
    }
    await db.exec('create table public.fixture_private_rows(id integer); insert into public.fixture_private_rows values(1); grant select on public.fixture_private_rows to authenticated; alter table public.fixture_private_rows enable row level security; alter table public.fixture_private_rows force row level security; set role authenticated;');
    assert.deepEqual((await db.query('select * from public.fixture_private_rows')).rows,[], 'managed bootstrap does not bypass application RLS');
  } finally { await db.close(); }
});
