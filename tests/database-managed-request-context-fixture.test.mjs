import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {managedRequestContextSQL, managedExtensionUsageSQL, managedStorageObjectIDDefaultSQL} from './helpers/database-managed-request-context.mjs';

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


test('managed Storage UUID default preserves captured shape and access controls', async () => {
  const columns = JSON.parse(readFileSync(new URL('./fixtures/database-managed-schema-20261015.json',import.meta.url),'utf8'));
  const id = columns.find(column => column.schema==='storage' && column.table_name==='objects' && column.column_name==='id');
  assert.equal(id.type,'uuid');
  assert.equal(id.not_null,true);
  assert.equal(id.default_expression,'gen_random_uuid()','default is grounded in the captured managed catalog');
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create schema storage;
      create table storage.objects(id uuid primary key,payload text);
      grant usage on schema storage to authenticated;
      grant select on storage.objects to authenticated;
      alter table storage.objects enable row level security;
      alter table storage.objects force row level security;
      create function storage.fixture_delete_guard() returns trigger language plpgsql as $$
        begin raise exception 'fixture_delete_guard' using errcode='42501'; end; $$;
      create trigger fixture_delete_guard before delete on storage.objects
        for each statement execute function storage.fixture_delete_guard();`);
    const authority = async () => (await db.query(`select row_to_json(snapshot) authority from (
      select relowner,relacl::text,relrowsecurity,relforcerowsecurity,
        (select json_agg(pg_get_triggerdef(oid) order by tgname) from pg_trigger where tgrelid=relation.oid) triggers,
        (select json_agg(pg_get_constraintdef(oid) order by conname) from pg_constraint where conrelid=relation.oid) constraints
      from pg_class relation where oid='storage.objects'::regclass
    ) snapshot`)).rows[0].authority;
    const before = await authority();
    await db.exec(managedStorageObjectIDDefaultSQL);
    assert.deepEqual(await authority(),before,'default correction cannot change owner, grants, RLS, triggers or constraints');
    const rows=(await db.query("insert into storage.objects(payload) values('one'),('two') returning id")).rows;
    assert.equal(new Set(rows.map(row=>row.id)).size,2,'omitted IDs receive distinct UUIDs');
    assert.ok(rows.every(row=>/^[0-9a-f-]{36}$/u.test(row.id)));
    await db.exec(managedStorageObjectIDDefaultSQL);
    assert.deepEqual(await authority(),before,'repeated bootstrap preserves the same authority boundary');
    await db.exec('set role authenticated;');
    assert.deepEqual((await db.query('select * from storage.objects')).rows,[],'row visibility remains denied by RLS');
    await db.exec('reset role;');
    await assert.rejects(()=>db.query('delete from storage.objects'),/fixture_delete_guard/,'statement delete guard remains active');
  } finally { await db.close(); }
});
